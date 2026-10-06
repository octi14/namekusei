import * as THREE from "three";
import { BASE_Z, superRank, SUPER_KI, MELEE, MAP } from "./config.js";
import { isWater, groundHeight, WATER_Y } from "./world.js";
import { BASE_INNER_R, BASE_HULL_R, steerShipNav, nearAnyShip, shipDist, inShipBase, baseOrigin, baseDoorDir, steerAroundShips } from "./bases.js";
import { powerStyle } from "./powers.js";
import { aiTraceTick } from "./aiTrace.js";
import { playSfx, atPos, stopSfxLoop } from "./sfx.js";
import { healerSpec } from "./stats.js";
import { canSee } from "./combat.js";

/**
 * ===========================================================================
 * GUÍA DE AJUSTE DE LA IA — dónde tocar cada cosa
 * ===========================================================================
 * Ciclo de un tick (aiTick, al final del archivo):
 *   1. tickStuck / pickUnstick   → detección de atascados y plan de escape.
 *   2. temper + kiBand + aiRole  → humor, umbrales de ki y rol de la unidad.
 *   3. utilBest                  → PUNTAJES: elige el modo (fight/ball/raid/
 *                                  charge/help/deliver/wander).
 *   4. commitMode                → DURACIONES: cuántos segundos dura el modo.
 *   5. Bloque por modo           → rumbo (dir) y ataques del modo elegido.
 *   6. applyLoco                 → volar / correr / cargar ki / aterrizar.
 *   7. aiMove + tryGrab/Deposit  → se ejecuta el movimiento.
 *
 * Chuletario de perillas (todas comentadas en su sitio con "AJUSTE:"):
 *   - Probabilidad de pegar melee / tirar ki / super  → bloque `fighting` en aiTick.
 *   - Distancia a la que se planta a pelear (hold)    → bloque `fighting`.
 *   - Cuántos segundos dura cada modo                 → llamadas a commitMode().
 *   - Ganas de pelear vs cargar ki                    → utilBest().
 *   - Cuándo vuela y cuándo aterriza                  → applyLoco().
 *   - Cuánto ki reserva antes de gastar               → kiBand().
 *   - Reparto de roles (guard/baller/aggro)           → aiRole().
 *   - Rango en que ve enemigos                        → foeRange en aiTick.
 *   - Grupos: help (pedido), raid (escuadrón), guardia → blackboard teamBoard().
 *   - Ir a curandero / posto de cura                   → utilBest `heal` / `healPost`.
 *   - Cupos: HELP_SLOTS / RAID_FRAC_* / GUARD_*.
 *
 * Nota: muchas probabilidades van multiplicadas por `dt * 60`, o sea que el
 * número es "chance por frame a 60 fps" (0.004 * dt * 60 ≈ 0.24 por segundo).
 * MELEE viene de config.js y escala globalmente las ganas de cuerpo a cuerpo.
 */

function seed(p) {
  // Usar nombre (+id): los ids secuenciales z-0/z-1 hasheaban casi igual
  // y metían a todos en el mismo rol.
  const s = `${p.nombre || ""}|${p.id || ""}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000 / 1000;
}

function random(a, b) {
  return a + Math.random() * (b - a);
}

/**
 * Rol fijo por unidad: más decididos sin narrativa.
 * AJUSTE: por slot de equipo (id z-0, z-1…) rota guard/baller/aggro para
 * garantizar mix; el seed solo desempata si el id no trae índice.
 * guard  = se queda cerca de casa y defiende.
 * baller = prioriza esferas.
 * aggro  = busca pelea y hace raids.
 */
function aiRole(p) {
  const m = String(p.id || "").match(/(\d+)\s*$/);
  if (m) {
    const slot = (+m[1] + (p.faccion === "f" ? 1 : 0)) % 3;
    return slot === 0 ? "guard" : slot === 1 ? "baller" : "aggro";
  }
  const a = seed(p);
  if (a < 0.34) return "guard";
  if (a < 0.67) return "baller";
  return "aggro";
}

/**
 * Banda de ki por unidad (fracción de kiMax).
 * AJUSTE: lo = por debajo de esto quiere recargar; hi = a esto deja de cargar;
 * fly = mínimo para despegar. Bajá `lo` para que peleen con menos ki y pierdan
 * menos tiempo cargando; bajá `fly` para que vuelen más seguido.
 */
function kiBand(p) {
  const a = seed(p);
  let h = 0;
  for (const c of p.nombre || p.id) h = (h * 17 + c.charCodeAt(0)) | 0;
  const jitter = (Math.abs(h % 1000) / 1000 - 0.5) * 0.05;
  // Cargar hasta poder tirar super (≥ SUPER_KI)
  const lo = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.38, 0.26, a) + jitter, 0.22, 0.42);
  const span = THREE.MathUtils.lerp(0.42, 0.32, a);
  const hi = Math.max(Math.min(0.9, lo + span), SUPER_KI + 0.06);
  return { lo, hi, fly: Math.min(0.72, lo + 0.22) };
}

/**
 * Humor: hp/ki normalizados y `front` (-1 acobardado … +1 crecido).
 * AJUSTE: los pesos de `front` deciden cuánto pesan las rachas (heat), los
 * kills/muertes (kd), la vida y el ki en la actitud general.
 */
function temper(p) {
  const hp = p.s.hp / p.s.hpMax;
  const ki = p.s.ki / p.s.kiMax;
  const heat = THREE.MathUtils.clamp(p.aiHeat || 0, -3.2, 3.2);
  const kd = (p.st.k || 0) - (p.st.d || 0) * 1.15;
  const front = THREE.MathUtils.clamp(heat * 0.28 + kd * 0.08 + (hp - 0.48) * 0.7 + (ki - 0.5) * 0.95, -1, 1);
  return { hp, ki, heat, front };
}


function ballByN(balls, n) {
  return balls.items.find((b) => b.n === n && !b.held) || null;
}

/**
 * Busca tierra firme cerca. keepDry viejo solo contraía hacia (0,0) y en
 * lagos/islas (sobre todo Cell) los dejaba nadando en círculos.
 * AJUSTE: radio máx. de búsqueda ~90u; 16 direcciones × 6 distancias.
 */
function seekShore(x, z) {
  if (!isWater(x, z)) return { x, z };
  let best = null;
  let bestD = 1e9;
  const dirs = 16;
  for (let i = 0; i < dirs; i++) {
    const a = (i / dirs) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    for (let step = 8; step <= 90; step += 14) {
      const sx = x + dx * step;
      const sz = z + dz * step;
      if (isWater(sx, sz)) continue;
      // Preferir orilla real (altura un poco sobre el agua), no un pico lejano.
      const gy = groundHeight(sx, sz);
      if (gy < WATER_Y + 0.6) continue;
      const d = step + Math.max(0, gy - (WATER_Y + 4)) * 0.15;
      if (d < bestD) {
        bestD = d;
        best = { x: sx, z: sz };
      }
      break; // primer seco en este rayo = orilla más cercana en esa dirección
    }
  }
  if (best) return best;
  // Fallback: expandir / contraer un poco por si el lago es chico
  for (const k of [1.15, 1.3, 0.85, 0.7, 0.55]) {
    const sx = x * k;
    const sz = z * k;
    if (!isWater(sx, sz)) return { x: sx, z: sz };
  }
  return { x, z };
}

function keepDry(x, z) {
  return seekShore(x, z);
}

/**
 * Elige/mantiene la esfera objetivo.
 * AJUSTE: `aiBallStuck < 12` = segundos persiguiendo sin acercarse antes de
 * cambiar de esfera. `rivals >= 3` = cuántos aliados ya van a la misma antes de
 * descartarla; `rivals * 120` y `steal -55` son pesos del puntaje (menos = mejor).
 */
function claimBall(p, people, balls, dt = 0.016) {
  const free = balls.items.filter((b) => !b.held && b.inBase !== p.faccion);
  if (!free.length) {
    p.aiBall = null;
    return null;
  }
  const cur = ballByN(balls, p.aiBall);
  if (cur && !cur.held && cur.inBase !== p.faccion) {
    const d = Math.hypot(cur.mesh.position.x - p.pos().x, cur.mesh.position.z - p.pos().z);
    if (d < (p.aiBallBest || 1e9) - 3) {
      p.aiBallBest = d;
      p.aiBallStuck = 0;
    } else p.aiBallStuck = (p.aiBallStuck || 0) + dt;
    if ((p.aiBallStuck || 0) < 12) {
      p.aiLock = Math.max(p.aiLock || 0, 1);
      return cur;
    }
  }
  p.aiBall = null;
  p.aiBallStuck = 0;
  p.aiBallBest = 1e9;

  let best = null;
  let bestScore = Infinity;
  for (const b of free) {
    const dist = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
    let rivals = 0;
    for (const o of people) {
      if (o === p || o.faccion !== p.faccion || o.dead) continue;
      if (o.aiBall === b.n || (o.aiMode === "ball" && o.aiBall === b.n)) rivals++;
    }
    if (rivals >= 3) continue;
    const steal = b.inBase && b.inBase !== p.faccion ? -55 : 0;
    const score = dist + rivals * 120 + seed(p) * 12 + steal;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (!best) return null;
  p.aiBall = best.n;
  p.aiLock = 12 + seed(p) * 4;
  p.aiBallBest = Math.hypot(best.mesh.position.x - p.pos().x, best.mesh.position.z - p.pos().z);
  p.aiBallStuck = 0;
  return best;
}

/**
 * Enemigo más "apetecible" dentro de maxD.
 * AJUSTE: `cap` recorta el rango real (130 si hay amenaza en casa, 110 normal);
 * los restos del puntaje son bonus de prioridad: portador de esfera -40,
 * metido en nuestra base -35, volando alto -12.
 */
function pickFoe(p, people, maxD, homeZ, cam) {
  const sniping = p.aiMode === "snipe";
  const air = (p.flyAlt || 0) > 3.2;
  const nearHome = homeZ != null && Math.hypot(p.pos().x, p.pos().z - homeZ) < 115;
  let best = null;
  let bestS = 1e9;
  for (const o of people) {
    if (o.faccion === p.faccion || o.dead) continue;
    const d = o.pos().distanceTo(p.pos());
    const dHome = homeZ != null ? Math.hypot(o.pos().x, o.pos().z - homeZ) : 1e9;
    const baseThreat = dHome < 110 || o.esfera != null;
    const cap = sniping ? maxD : air ? maxD : Math.min(maxD, baseThreat || nearHome ? 130 : 110);
    if (d > cap) continue;
    if (!canSee(p, o, cap, cam)) continue;
    const s = d - (o.esfera != null ? 65 : 0) - (dHome < 90 ? 35 : 0) - ((o.flyAlt || 0) > 5 ? 12 : 0);
    if (s < bestS) {
      bestS = s;
      best = o;
    }
  }
  return best;
}

/** Intruso / ladrón cerca de la base propia. */
function pickBaseThreat(p, people, homeZ, r = 115) {
  let best = null;
  let bestS = 1e9;
  for (const o of people) {
    if (o.faccion === p.faccion || o.dead) continue;
    const dHome = Math.hypot(o.pos().x, o.pos().z - homeZ);
    if (dHome > r) continue;
    const dMe = o.pos().distanceTo(p.pos());
    const s = dHome - (o.esfera != null ? 60 : 0) + dMe * 0.12;
    if (s < bestS) {
      bestS = s;
      best = o;
    }
  }
  return best;
}

function canSnipe(p) {
  const r = powerStyle(p.nombre, p.faccion).range || 55;
  return r >= 70 || seed(p) > 0.55;
}

function pickSnipeFoe(p, people, rng, cam) {
  let best = null;
  let bestS = 1e9;
  for (const o of people) {
    if (o.faccion === p.faccion || o.dead) continue;
    const d = o.pos().distanceTo(p.pos());
    if (d < 22 || d > rng * 1.05) continue;
    if (!canSee(p, o, rng, cam)) continue;
    const s = d * 0.28 - (o.esfera != null ? 70 : 0) - ((o.flyAlt || 0) > 4 ? 18 : 0);
    if (s < bestS) {
      bestS = s;
      best = o;
    }
  }
  return best;
}

function pickNest(p, foe) {
  const px = p.pos().x;
  const pz = p.pos().z;
  let bx = px;
  let bz = pz;
  let best = -1e9;
  for (let i = 0; i < 12; i++) {
    const a = seed(p) * 6.28 + i * 0.55;
    const d = 28 + (i % 4) * 18;
    const x = px + Math.sin(a) * d;
    const z = pz + Math.cos(a) * d;
    if (isWater(x, z)) continue;
    let s = groundHeight(x, z);
    if (foe && !foe.dead) {
      const fd = Math.hypot(foe.pos().x - x, foe.pos().z - z);
      if (fd < 30) s -= 24;
      else if (fd > 155) s -= 8;
      else s += 6;
    }
    if (s > best) {
      best = s;
      bx = x;
      bz = z;
    }
  }
  return { x: bx, z: bz };
}

/** Camina por ladera / costado: avanza al objetivo sin asomarse. */
function hideSteer(px, pz, gx, gz, foe) {
  const tx = gx - px;
  const tz = gz - pz;
  const glen = Math.hypot(tx, tz) || 1;
  const nx = tx / glen;
  const nz = tz / glen;
  const base = Math.atan2(nx, nz);
  const side = Math.sin(px * 0.013 + pz * 0.009) >= 0 ? 1 : -1;
  let bx = nx;
  let bz = nz;
  let best = -1e9;
  const offs = [0, 0.5 * side, -0.5 * side, 1.05 * side, -0.95 * side, 1.55 * side];
  for (const off of offs) {
    const a = base + off;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const sx = px + dx * 16;
    const sz = pz + dz * 16;
    const prog = dx * nx + dz * nz;
    let s = prog * 2.1 - Math.abs(off) * 0.18 + groundHeight(sx, sz) * 0.06;
    // Preferir costados: castigar el corredor central
    s -= Math.max(0, 110 - Math.abs(sx)) * 0.012;
    if (foe && !foe.dead) {
      const fx = foe.pos().x;
      const fz = foe.pos().z;
      const mx = (sx + fx) * 0.5;
      const mz = (sz + fz) * 0.5;
      const ridge = groundHeight(mx, mz);
      if (ridge > foe.pos().y - 1.5 && ridge > groundHeight(sx, sz) - 0.6) s += 1.55;
      if (Math.hypot(sx - fx, sz - fz) < 22) s -= foe.esfera != null ? 0.2 : 1.1;
    }
    if (s > best) {
      best = s;
      bx = dx;
      bz = dz;
    }
  }
  return { x: bx, z: bz };
}

/** Estado corporal leído una vez. */
function senseBody(p) {
  const x = p.pos().x;
  const z = p.pos().z;
  const kiMax = Math.max(1, p.s.kiMax);
  const overWater = isWater(x, z);
  const swimming = p.inSwim();
  const flyAlt = p.flyAlt || 0;
  const flying = flyAlt > 0.35;
  return {
    x,
    z,
    ki: p.s.ki / kiMax,
    kiAbs: p.s.ki,
    kiMax,
    hp: p.s.hp / Math.max(1, p.s.hpMax),
    flyAlt,
    overWater,
    swimming,
    flying,
    dry: !overWater && !swimming,
    grounded: !flying && !swimming,
    spd: Math.max(1, p.s.velocidad || 1),
  };
}

function aiVert(p, body, want) {
  if (want === "climb") {
    p.climb();
    return;
  }
  if (want === "descend") p.descend();
  if (want === "hold") {
    if (body.flyAlt < 4 && body.kiAbs > 1) p.climb();
    else if (body.flyAlt > 10) p.descend();
  }
}

// Un solo movimiento por tick: cada aiMove pisa al anterior y aiStep aplica el último
// (antes pelea + loco movían dos veces en el mismo frame, en direcciones distintas).
function aiMove(p, dir, run, dt) {
  if (dir.lengthSq() < 1e-6) return;
  p._aiMoveReq = [dir.clone().normalize(), !!run, dt];
}

function flushAiMove(p) {
  const req = p._aiMoveReq;
  p._aiMoveReq = null;
  if (!req) return;
  const body = senseBody(p);
  const inWater = body.swimming || (body.overWater && !body.flying);
  p.move(req[0], req[1] && !inWater, req[2]);
}

/**
 * Locomoción: decide volar / correr / cargar ki / aterrizar.
 * AJUSTE:
 *   threatNear (enemyDist < 52) → con enemigo a esta distancia no carga ni vuela.
 *   canFlyKi                    → ki mínimo + histéresis takeoffKi/stayFlyKi.
 *   nearHome (goalDist < 85)    → llevando esfera cerca de casa: aterriza y no vuela.
 *   longHaul (goalDist > 95)    → carry/ball/raid solo vuelan si el trayecto es largo.
 *   aiGroundLock = 8 (14 si     → segundos pegado al piso tras aterrizar (más si
 *     aterrizó sin ki y carry)    cayó por falta de ki con esfera).
 *   aiFlyHold (tope 2.2)        → histéresis: cuánto insiste antes de despegar.
 *   turbo (goalDist > 110)      → turbo aéreo solo en viajes largos (no quemar ki).
 */
function applyLoco(p, dir, ctx, dt) {
  const body = senseBody(p);
  const dOwn = shipDist({ x: body.x, z: body.z }, p.faccion);
  const dFoe = shipDist({ x: body.x, z: body.z }, p.faccion === "z" ? "f" : "z");
  const aligned = Math.abs(body.x) < 9;
  const inCorridor = aligned && (dOwn < BASE_INNER_R + 22 || dFoe < BASE_INNER_R + 22);
  const insideShip = dOwn < BASE_INNER_R - 0.2 || dFoe < BASE_INNER_R - 0.2;
  const atShip = !!(insideShip || (ctx.shipGate && inCorridor));

  const threatNear = !!(ctx.fighting || (ctx.enemyDist != null && ctx.enemyDist < 52));
  const needKi = body.ki < ctx.band.lo || ((p.aiChargeTo || 0) > 0 && body.ki < p.aiChargeTo);
  if (ctx.chargingHard && body.dry && body.grounded && !threatNear) p.aiCharge = true;
  else if (needKi && !ctx.carrying && !threatNear && body.dry && body.grounded && ctx.mode !== "deliver") p.aiCharge = true;
  else if (body.ki >= (p.aiChargeTo || ctx.band.hi)) p.aiCharge = false;
  if (!ctx.fighting) p._aiFightCharge = false;
  const fightCharge = !!p._aiFightCharge && (ctx.enemyDist == null || ctx.enemyDist >= 12);
  if (ctx.carrying || ctx.sniping || atShip || (threatNear && !fightCharge)) p.aiCharge = false;
  const charging = !!p.aiCharge && body.grounded && body.dry;

  const wet = body.overWater || body.swimming;
  const flyKi = ctx.band.fly || 0.45;
  // Histéresis de ki: despegar pide más; una vez en el aire aguanta un poco menos
  // (evita el bobbing subir/bajar cuando el ki rimba alrededor de flyKi).
  const takeoffKi = flyKi + 0.08;
  const stayFlyKi = Math.max(0.22, flyKi - 0.1);
  const nearHome =
    (ctx.carrying || ctx.mode === "deliver") &&
    (ctx.goalDist < 85 || dOwn < BASE_INNER_R + 70);
  const canFlyKi =
    body.kiAbs > 22 &&
    body.ki >= (body.flying ? stayFlyKi : takeoffKi) &&
    !charging &&
    !atShip &&
    !threatNear &&
    !nearHome;
  const hunted = !!(ctx.carrying && ctx.enemyDist < 48);
  if (wet && !atShip) {
    p.aiWetT = (p.aiWetT || 0) - dt;
    if ((p.aiWetT || 0) <= 0) {
      // AJUSTE: con ki de vuelo → salir por aire; si no, nadar a orilla.
      p.aiWetPlan = hunted ? "dive" : canFlyKi ? "air" : "swim";
      p.aiWetT = hunted ? 3.6 : canFlyKi ? 2.4 : 2.8;
    }
  } else {
    p.aiWetPlan = null;
    p.aiWetT = 0;
  }
  const dive = p.aiWetPlan === "dive";
  const canFly = canFlyKi && !dive;
  if ((p.aiGroundLock || 0) > 0) p.aiGroundLock -= dt;
  let wantFly = false;
  // AJUSTE: carry/deliver solo cuentan como longHaul si el trayecto es largo.
  // Antes `carrying` solo ya forzaba vuelo siempre → loop despegar/aterrizar
  // al quemar ki con turbo camino a casa.
  const longHaul =
    ((ctx.carrying || ctx.mode === "deliver") && ctx.goalDist > 95) ||
    ((ctx.mode === "ball" || ctx.mode === "raid") && ctx.goalDist > 95);
  if (canFly && p.aiWetPlan === "air") wantFly = true;
  else if (canFly && longHaul && (p.aiGroundLock || 0) <= 0) wantFly = true;
  else if (
    canFly &&
    (p.aiGroundLock || 0) <= 0 &&
    ctx.goalDist > 170 &&
    ctx.mode !== "charge" &&
    ctx.mode !== "wander"
  )
    wantFly = true;
  else if (
    (p.aiFlyHold || 0) > 0.4 &&
    body.flying &&
    body.ki >= stayFlyKi &&
    !atShip &&
    !dive &&
    !threatNear &&
    !nearHome &&
    longHaul
  )
    wantFly = true;

  if (wantFly) p.aiFlyHold = Math.min(2.2, (p.aiFlyHold || 0) + dt);
  else p.aiFlyHold = Math.max(0, (p.aiFlyHold || 0) - dt * 0.9);

  if (atShip || nearHome) {
    if (body.flyAlt > 0.1) aiVert(p, body, "descend");
    p.aiFlyHold = 0;
    if (nearHome && body.flyAlt < 1.4)
      p.aiGroundLock = Math.max(p.aiGroundLock || 0, 4);
  } else if (dive || threatNear) {
    aiVert(p, body, "descend");
    p.aiFlyHold = 0;
  } else if (wantFly && (p.aiWetPlan === "air" || p.aiFlyHold > 0.18 || body.swimming)) {
    if (wet && body.flyAlt > 7.5) aiVert(p, body, "descend");
    else if (wet && body.flyAlt > 4.2) aiVert(p, body, "hold");
    else aiVert(p, body, "climb");
  } else if (body.flying && !wet) {
    aiVert(p, body, "descend");
    // Si aterrizan por falta de ki llevando esfera, ground lock más largo
    // para no volver a despegar apenas regeneran un toque.
    if (body.flyAlt < 1.4) {
      const lock = ctx.carrying && body.ki < takeoffKi ? 14 : 8;
      p.aiGroundLock = Math.max(p.aiGroundLock || 0, lock);
    }
  } else if (body.flying && wet && p.aiWetPlan !== "air") {
    aiVert(p, body, "hold");
  }

  const loco = atShip ? "shipDoor" : body.flying ? "air" : body.swimming ? "swim" : "ground";
  p.aiLoco = loco;
  const run =
    !charging &&
    loco !== "swim" &&
    body.ki > 0.12 &&
    (ctx.carrying ||
      ctx.mode === "ball" ||
      ctx.mode === "deliver" ||
      ctx.mode === "raid" ||
      loco === "shipDoor" ||
      ctx.fighting ||
      ctx.goalDist > 30);
  // Turbo aéreo solo si el viaje sigue siendo largo (no quemar ki cerca de casa).
  const turbo =
    loco === "air" &&
    body.ki > 0.35 &&
    ctx.goalDist > 110 &&
    (ctx.carrying || ctx.mode === "ball" || ctx.mode === "deliver");

  return {
    loco,
    run: !!(run || turbo),
    canCharge: charging,
    stop: false,
    allowFight: !atShip,
    wantFly: !!wantFly,
  };
}

/** Rumbo a base (recto; solo tramo final). */
function steerHome(px, pz, homeZ) {
  const gx = -px;
  const gz = homeZ - pz;
  const glen = Math.hypot(gx, gz) || 1;
  return { x: gx / glen, z: gz / glen };
}

function ensureLane(p) {
  if (p.aiLaneX == null) {
    const s = seed(p);
    // Carriles más abiertos (evitar el centro del mapa)
    p.aiLaneX = (s > 0.5 ? 1 : -1) * (320 + s * 380);
  }
  return p.aiLaneX;
}

function _normDir(dx, dz) {
  const L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L };
}

/**
 * Ruta sneaky por laterales: evita el corredor central (x≈0)
 * hasta acercarse al objetivo en Z.
 */
function sideSteer(p, gx, gz) {
  const lane = ensureLane(p);
  const px = p.pos().x;
  const pz = p.pos().z;
  const zDist = Math.abs(gz - pz);
  const inCenter = Math.abs(px) < 130;
  let wx;
  let wz;
  if (inCenter && zDist > 90) {
    wx = lane;
    wz = pz + Math.sign(gz - pz || 1) * Math.min(90, zDist * 0.35);
  } else if (zDist > 160) {
    wx = lane;
    wz = pz + (gz - pz) * 0.42;
  } else if (zDist > 70) {
    wx = lane * 0.55 + gx * 0.2;
    wz = gz;
  } else {
    // tramo final: entrar al objetivo (p.ej. puerta en x≈0)
    wx = gx;
    wz = gz;
  }
  // Penalizar seguir pegado al eje
  if (Math.abs(wx) < 110 && zDist > 55) wx = Math.sign(lane || 1) * 200;
  return _normDir(wx - px, wz - pz);
}

/** Waypoint lateral hacia un punto (bola / aliado / raid). */
function sideWaypoint(p, gx, gz) {
  const lane = ensureLane(p);
  const px = p.pos().x;
  const pz = p.pos().z;
  const zDist = Math.abs(gz - pz);
  const far = Math.hypot(gx - px, gz - pz) > 70;
  if (far && Math.abs(px) < 90) {
    return keepDry(lane, pz + Math.sign(gz - pz || 1) * Math.min(80, zDist * 0.4));
  }
  if (zDist > 70 && Math.abs(gx) < 80 && Math.abs(px) > 220) {
    return keepDry(Math.sign(px) * 140, gz);
  }
  return keepDry(gx, gz);
}

function rivalDist(p, people, x, z) {
  let d = 1e9;
  for (const o of people) {
    if (o.dead || o.faccion === p.faccion) continue;
    d = Math.min(d, Math.hypot(o.pos().x - x, o.pos().z - z));
  }
  return d;
}

/** Devuelve un vector de desvío para evitar zonas con enemigos cercanos.
 *  Samplea ~8 enemigos y empuja en dirección opuesta ponderado por cercanía. */
function heatAvoid(p, people, goalDir) {
  let ax = 0, az = 0;
  for (const o of people) {
    if (o.dead || o.faccion === p.faccion) continue;
    const dx = o.pos().x - p.pos().x;
    const dz = o.pos().z - p.pos().z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1600) continue;           // >40u → ignora
    const d = Math.sqrt(d2) + 0.1;
    const w = 1 / (d * d);             // peso cuadrático inverso
    ax -= dx / d * w;
    az -= dz / d * w;
  }
  const len = Math.hypot(ax, az);
  if (len < 1e-4) return null;
  // normaliza y escala; mezclar con goalDir afuera
  return { x: ax / len, z: az / len, strength: Math.min(len * 200, 1) };
}

/** Devuelve un ángulo de flanqueo: intenta llegar al enemigo desde un costado. */
function flankAngle(p, foe, dt) {
  // lado preferido estable por seed
  const side = seed(p) > 0.5 ? 1 : -1;
  const dx = foe.pos().x - p.pos().x;
  const dz = foe.pos().z - p.pos().z;
  const direct = Math.atan2(dx, dz);
  // offset lateral ~40-65° según distancia
  const dist = Math.hypot(dx, dz);
  const off = dist > 18 ? 0.28 : dist > 8 ? 0.12 : 0;
  return direct + side * off;
}

function findHealer(p, people) {
  let best = null;
  let bestS = -1e9;
  for (const o of people) {
    if (o === p || o.dead || o.faccion !== p.faccion) continue;
    const spec = healerSpec(o.nombre);
    if (!spec || o.s.ki < spec.ki * 1.4) continue;
    const d = o.pos().distanceTo(p.pos());
    const s = (o.aiMode === "healPost" ? 90 : 0) - d * 0.08 + o.s.ki * 0.03;
    if (s > bestS) {
      bestS = s;
      best = o;
    }
  }
  return best;
}

function pickHealPost(p, people, homeZ) {
  const px = p.pos().x;
  const pz = p.pos().z;
  const m = MAP / 2 - 140;
  let bx = THREE.MathUtils.clamp(px * 0.7, -m, m);
  let bz = THREE.MathUtils.clamp(pz * 0.45 + homeZ * 0.2, -m, m);
  let best = -1e9;
  for (let i = 0; i < 18; i++) {
    const a = seed(p) * 6.28 + i * 0.41;
    const d = 55 + (i % 6) * 18;
    const x = THREE.MathUtils.clamp(px + Math.sin(a) * d, -m, m);
    const z = THREE.MathUtils.clamp(pz + Math.cos(a) * d, -m, m);
    if (isWater(x, z)) continue;
    if (shipDist({ x, z }, p.faccion) < BASE_INNER_R + 70) continue;
    if (shipDist({ x, z }, p.faccion === "z" ? "f" : "z") < BASE_INNER_R + 90) continue;
    let s = groundHeight(x, z) * 0.4 + Math.hypot(x, z) * 0.012;
    for (const o of people) {
      if (o.dead) continue;
      const ed = Math.hypot(o.pos().x - x, o.pos().z - z);
      if (o.faccion !== p.faccion) {
        if (ed < 28) s -= 50;
        else if (ed < 50) s -= 14;
        else if (ed > 70) s += 6;
      } else if (ed < 8 && o !== p) s -= 6;
    }
    if (s > best) {
      best = s;
      bx = x;
      bz = z;
    }
  }
  return { x: bx, z: bz };
}

function allyById(people, id) {
  return people.find((o) => o.id === id) || null;
}

function smoothYaw(p, wantYaw, dt, rate = 4.2) {
  if (p._aiFrameDt != null) {
    dt = p._aiFrameDt;
    p._aiYawWant = wantYaw;
    p._aiYawRate = rate;
  }
  let dy = wantYaw - p.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  p.yaw += dy * Math.min(1, rate * dt);
}

/** Preferencia por personaje y modo: ±10 fijo (seed) + ±5 de deriva lenta (40–60 s). */
function modeNoise(p, mode) {
  let h = 7;
  for (let i = 0; i < mode.length; i++) h = (h * 31 + mode.charCodeAt(i)) % 9973;
  const s = seed(p);
  const r = Math.sin(s * 9301.7 + h * 49.297) * 43758.5453;
  const fixed = (r - Math.floor(r)) * 2 - 1;
  const t = performance.now() * 0.001;
  const drift = Math.sin((t * Math.PI * 2) / (40 + s * 20) + h + s * 6.28);
  return fixed * 10 + drift * 5;
}

function commitMode(p, mode, sec) {
  p.aiMode = mode;
  p.aiModeT = sec;
}

/**
 * Elige el modo comparando puntajes (gana el más alto).
 * AJUSTE: acá se decide "qué le da más ganas". Incluye pedidos de equipo
 * (helpCall / raid / guardia) y modo camp.
 */
function utilBest(p, ctx) {
  const {
    mood,
    carrying,
    enemy,
    enemyDist,
    enemyCarrier,
    ball,
    loot,
    needCharge,
    inHomeAir,
    lowHp,
    critHp,
    agg,
    defend,
    role,
    helpCall,
    myCall,
    inRaid,
    selfDefense,
    idleish,
    hideOk,
    snipeOk,
    medic,
    medicDist,
    teamHurt,
    looseFree,
  } = ctx;
  // Con esfera: deliver fuerte, pero fight/hide pueden ganar si hay amenaza.
  const sticky = (m) => {
    if (p.aiMode !== m) return 0;
    if (m === "wander") return 0;
    if (m === "help") return 22;
    if (m === "ball") return 30;
    if (m === "charge") return 15;
    if (m === "fight") return 30;
    if (m === "deliver") return 28;
    if (m === "hide") return 16;
    if (m === "snipe") return 20;
    if (m === "heal") return 15;
    if (m === "healPost") return 22;
    return 20;
  };
  const rows = [];
  let deliverS = carrying ? 50 + sticky("deliver") : -80;
  if (carrying && p.aiCarryStyle === "sneak") deliverS += 8;
  if (carrying && (p.aiCarryHold || 0) > 0) deliverS -= 18;
  rows.push(["deliver", deliverS]);
  let fight = -30;
  if (enemy && (!critHp || enemyCarrier || carrying)) {
    fight = (enemyCarrier ? 80 : 40) + Math.max(0, 48 - enemyDist) * 0.55 + sticky("fight");
    if (enemyCarrier && enemyDist < 100) fight += 50;
    if (enemyDist < 50 && mood.ki > 0.12) fight += 22 + agg * 8;
    if (enemyDist < 25 && mood.ki > 0.08) fight += 20;
    // Portador vs portador: no se dejan pasar
    if (carrying && enemyCarrier) fight += 58 + Math.max(0, 55 - enemyDist) * 0.4;
    if (defend) {
      fight += 60 + (enemyCarrier ? 22 : 10) + Math.max(0, 0.55 - agg) * 18;
      if (inHomeAir) fight += 16;
    }
    if (role === "aggro") fight += 30;
    if (role === "guard" && (defend || inHomeAir)) fight += 16;
    if (lowHp && !enemyCarrier && !carrying) fight -= 22;
    if (carrying) {
      // AJUSTE: pelear con esfera — solo si está cerca y el estilo lo permite
      if (p.aiCarryStyle === "rush" && !enemyCarrier) fight -= 35;
      else if (p.aiCarryStyle === "sneak" && !enemyCarrier) fight -= 28;
      else fight += 15 + agg * 10; // fight style
      if (enemyDist > 78 && !enemyCarrier) fight -= 22;
      if (enemyDist < 36) fight += 25;
      if ((p.aiCarryHold || 0) > 0) fight += 20;
      if (mood.ki < 0.12) fight -= 10;
    }
  }
  p.aiFightScore = fight;
  rows.push(["fight", fight]);
  let snipeS = -40;
  if (snipeOk && !critHp) {
    snipeS = 24 + sticky("snipe") + (enemyCarrier ? 12 : 8) + (role === "aggro" ? 10 : 0);
    if (mood.ki > 0.45) snipeS += 10;
    if (carrying && !enemyCarrier) snipeS -= 80;
    if (carrying && enemyCarrier && enemyDist > 28) snipeS += 18;
    if (defend) snipeS -= 12;
  }
  rows.push(["snipe", snipeS]);
  let hideS = -40;
  if (hideOk && !carrying) hideS = 12 + sticky("hide") + (lowHp ? 10 : 0);
  rows.push(["hide", hideS]);
  let healS = -40;
  if (!carrying && medic && mood.hp < 0.72 && medicDist < 240) {
    healS = 14 + (1 - mood.hp) * 60 + sticky("heal") - medicDist * 0.05;
    if (medic.aiMode === "healPost") healS += 18;
    if (lowHp) healS += 14;
    if (critHp) healS += 24;
    if (enemy && enemyDist < 20 && !lowHp) healS -= 18;
    if (agg > 0.55 && !critHp) healS -= 10;
    if (mood.front > 0.25 && !critHp) healS -= 8;
    if (healerSpec(p.nombre)) healS -= 20;
  }
  rows.push(["heal", healS]);
  let healPostS = -40;
  if (healerSpec(p.nombre) && !carrying && !defend) {
    healPostS = 7 + sticky("healPost") + (idleish ? 11 : 0) + (teamHurt || 0) * 14;
    if (enemy && enemyDist < 34) healPostS -= 40;
    if (mood.ki < 0.14) healPostS -= 18;
  }
  rows.push(["healPost", healPostS]);
  let ballS = -30; 
  if (ball && !carrying) {
    const d = Math.hypot(ball.mesh.position.x - p.pos().x, ball.mesh.position.z - p.pos().z);
    ballS = 40 - d * 0.035 + sticky("ball") + (inHomeAir ? 10 : 0);
    if (defend) ballS -= 50;
    if (role === "baller") ballS += 25;
    if (role === "guard" && !defend) ballS -= 35;
    // Esfera suelta en el suelo que ningún aliado está yendo a buscar
    if (!ball.inBase && looseFree) ballS += 25;
  }
  rows.push(["ball", ballS]);
  let helpS = -40;
  if (!carrying) {
    if (helpCall && helpCall.taken < helpCall.slots) {
      const hd = Math.hypot(helpCall.x - p.pos().x, helpCall.z - p.pos().z);
      helpS = Math.max(
        helpS,
        34 + sticky("help") - hd * 0.04 + (idleish ? 14 : 0) + (role === "aggro" ? 6 : 0)
      );
    }
    if (myCall && myCall.kind === "help") helpS = Math.max(helpS, 75 + sticky("help"));
  }
  rows.push(["help", helpS]);
  let raidS = -40;
  // Raid solo como escuadrón: dentro es exclusivo; afuera, sumarse mientras se reúnen.
  // El reclutamiento lo hace refreshRaid (los más cercanos y libres); acá solo los miembros.
  if (inRaid) raidS = 200;
  rows.push(["raid", raidS]);
  // Camp = solo guardia asignada por updateGuard (sin acampar individual).
  const guardMember = !!(myCall && myCall.kind === "guard");
  rows.push(["camp", guardMember ? 150 : -40]);
  let chargeS =
    !carrying && needCharge && !(p.aiMode === "fight" && enemyDist < 28) && !defend
      ? 30 + (0.6 - mood.ki) * 36 + sticky("charge")
      : 0;
  if (enemy && enemyDist < 50) chargeS -= 40;
  if (enemy && enemyDist < 34 && mood.ki > 0.08) chargeS -= 28;
  if (defend) chargeS -= 44;
  if (helpCall && helpCall.taken < helpCall.slots) chargeS -= 20;
  if (role === "aggro") chargeS -= 10;
  rows.push(["charge", chargeS]);
  rows.push([
    "wander",
    carrying
      ? -40
      : -6 - (inHomeAir ? 12 : 0) - (ball ? 14 : 0) - (defend ? 18 : 0) + sticky("wander"),
  ]);
  // En grupo: solo la función del grupo o pelear (salvo esfera / crítico).
  const groupMode = inRaid ? "raid" : guardMember ? "camp" : myCall ? "help" : null;
  const groupOnly = groupMode && !carrying && !critHp;
  // Raid: pelea solo en autodefensa. Guardia: pelea si hay amenaza en casa o lo atacan.
  // Cuando corresponde pelear, pelear reemplaza a la función del grupo (si no, 200/150 la tapaban).
  // Help: pelea con la amenaza reportada, o con otro enemigo cercano si el score de fight alcanza.
  const helpFight =
    !!enemy &&
    (enemy.id === myCall?.foeId || (enemyDist < HELP_BREAK_DIST && (p.aiFightScore || 0) >= HELP_BREAK_FIGHT));
  const groupFight =
    groupOnly && enemy && (groupMode === "raid" ? selfDefense : groupMode === "camp" ? defend || selfDefense : helpFight);
  // Excepción de grupo: guardia o raider cerca de una esfera suelta (o nadie va por ella) la va a buscar.
  const looseD = ball && !ball.inBase ? Math.hypot(ball.mesh.position.x - p.pos().x, ball.mesh.position.z - p.pos().z) : 1e9;
  const groupBall =
    groupOnly && !groupFight && (groupMode === "camp" || groupMode === "raid") &&
    (looseD < (groupMode === "camp" ? 80 : 50) || (looseFree && looseD < 140));
  let best = carrying ? "deliver" : groupOnly ? (groupFight && groupMode !== "help" ? "fight" : groupMode) : "wander";
  let bestV = -1e9;
  for (const [k, v0] of rows) {
    if (groupBall && k === "ball") {
      best = "ball";
      bestV = 1e9;
      continue;
    }
    if (groupOnly && k !== groupMode && k !== "fight") continue;
    if (groupOnly && k === "fight" && !groupFight) continue;
    if (groupOnly && groupFight && groupMode !== "help" && k === groupMode) continue;
    const v = (k === "deliver" && carrying) || (k === "heal" && critHp) ? v0 : v0 + modeNoise(p, k);
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

/** Vagabundeo por laterales (no solo el corredor central). */
function pickWanderTarget(p, homeZ, enemyZ) {
  const lane = ensureLane(p);
  const phase = Math.floor(p.aiWanderPhase || 0) % 5;
  if (phase === 0) return { x: lane, z: homeZ * 0.35 };
  if (phase === 1) return { x: lane * 1.05, z: (homeZ + enemyZ) * 0.35 };
  if (phase === 2) return { x: lane * 0.9, z: enemyZ * 0.55 };
  if (phase === 3) return { x: -lane * 0.85, z: (homeZ + enemyZ) * 0.45 };
  return { x: lane * 0.7, z: homeZ * 0.15 + enemyZ * 0.25 };
}

/** Spot de cobertura: lejos de enemigos, hacia la base, terreno alto, no agua. */
function pickHideSpot(p, people, homeZ) {
  const px = p.pos().x;
  const pz = p.pos().z;
  let bx = px * 0.35;
  let bz = pz * 0.4 + homeZ * 0.6;
  let best = -1e9;
  for (let i = 0; i < 14; i++) {
    const a = seed(p) * 6.28 + i * 0.48;
    const d = 18 + (i % 5) * 14;
    const x = px + Math.sin(a) * d * 0.55 + (homeZ - pz) * 0.12;
    const z = pz + Math.cos(a) * d * 0.55 + (homeZ - pz) * 0.28;
    if (isWater(x, z) || nearAnyShip({ x, z }, BASE_HULL_R - BASE_INNER_R + 12)) continue;
    let s = groundHeight(x, z) * 0.35;
    s -= Math.hypot(x, z - homeZ) * 0.04; // preferir cerca de base
    for (const o of people) {
      if (o.dead || o.faccion === p.faccion) continue;
      const ed = Math.hypot(o.pos().x - x, o.pos().z - z);
      if (o.esfera != null) {
        if (ed < 18) s += 12;
        continue;
      }
      if (ed < 18) s -= 40;
      else if (ed < 38) s -= 12;
      else if (ed > 55) s += 4;
    }
    if (s > best) {
      best = s;
      bx = x;
      bz = z;
    }
  }
  const fac = nearAnyShip({ x: bx, z: bz }, BASE_HULL_R - BASE_INNER_R + 12);
  if (fac) {
    const o = fac === "z" ? -BASE_Z : BASE_Z;
    const k = (BASE_HULL_R + 14) / (Math.hypot(bx, bz - o) || 1);
    bx *= k;
    bz = o + (bz - o) * k;
  }
  return { x: bx, z: bz };
}

const SUPER_WIND = 0.55;

function beginAiSuper(p) {
  p._aiSuper = true;
  p.superHold = Math.max(p.superHold || 0, 0.05);
}

function cancelAiSuper(p) {
  if (p._sfxSuper) {
    stopSfxLoop(`super-${p.id}`);
    p._sfxSuper = false;
  }
  p._aiSuper = false;
  if ((p.superHold || 0) > 0) p.superHold = 0;
}

function tickAiSuper(p, combat, people, foe, dt) {
  if (p.dead || (p.stun || 0) > 0) {
    cancelAiSuper(p);
    return;
  }
  if (foe && !foe.dead) faceLock(p, foe, dt, 1.2);
  if (!p._sfxSuper) {
    const [x, y, z] = atPos(p);
    playSfx("chargingBigBlast", x, y, z, 0.5);
    playSfx("chargingSuperLoop", x, y, z, 0.35, true, `super-${p.id}`);
    if (p.nombre === "Gokú" && superRank(p.s.ki, p.s.kiMax, p.s.ataque) >= 3)
      playSfx("kameCharge", x, y, z, 0.55);
    p._sfxSuper = true;
  }
  p.superHold = (p.superHold || 0) + dt;
  if (p.superHold >= SUPER_WIND) {
    const dist = foe && !foe.dead ? foe.pos().distanceTo(p.pos()) : 30;
    combat.blast(p, true, people, dist > 40);
    cancelAiSuper(p);
  }
}

function faceLock(p, foe, dt, hold) {
  if (!foe || foe.dead) {
    p.lockT = 0;
    p.lockFoe = null;
    return false;
  }
  p.lockFoe = foe;
  p.lockT = Math.max(p.lockT || 0, hold);
  const to = foe.pos().clone().sub(p.pos());
  smoothYaw(p, Math.atan2(to.x, to.z), dt, 8.5);
  return true;
}

const MAX_ESCORTS = 2; // cupo del grupo help de escolta que arma cada portador

// AJUSTE cupos de pedidos de equipo (blackboard por facción).
const HELP_SLOTS = 2; // refuerzos a pelea / pedido de ayuda
// AJUSTE help: solo se interrumpe por la muerte de la amenaza reportada, o para
// pelear con un enemigo a menos de HELP_BREAK_DIST si su score de fight ≥ HELP_BREAK_FIGHT.
const HELP_BREAK_DIST = 30;
const HELP_BREAK_FIGHT = 85;
// Raid: tamaño del escuadrón = fracción del equipo según esferas del rival (5 jug/1 esf → 2; 20 jug/3 esf → 5)
const RAID_FRAC_BASE = 0.15;
const RAID_FRAC_PER_BALL = 0.04;
const RAID_FRAC_MAX = 0.4;
const RAID_TEAM_PER_SQUAD = 6; // un escuadrón simultáneo cada 6 jugadores (mín. 1)
const RAID_MAX_REGROUPS = 2; // veces que puede replantearse tras perder más de la mitad
const GROUP_MAX_LIFE = 45; // segundos que un grupo con miembros se sostiene desde el último pedido del líder
const RAID_MAX_LIFE = 320; // tope total de un escuadrón de raid (incluye reagrupes)
const RAID_AT_BASE = 40; // segundos en la base rival sin lograrlo antes de abortar
const RAID_GATHER_MIN = 6; // espera mínima en el punto de encuentro (para sumar gente)
const RAID_GATHER_MAX = 45; // espera máxima: sale con los que haya (mín. 2)
// Guardia: fracción del equipo que defiende según esferas en casa (5 jug: 1→1, 3→2, 7→3; 20 jug: 1→3, 3→6, 7→12)
const GUARD_BASE = 0.08;
const GUARD_PER_BALL = 0.06;
const GUARD_MAX_FRAC = 0.5;
// Turnos de guardia: nadie guardia para siempre
const GUARD_SHIFT_MIN = 35;
const GUARD_SHIFT_RND = 30;
const GUARD_REST_MIN = 50;
const GUARD_REST_RND = 40;

const _teamBoard = { z: null, f: null };
function teamBoard(fac) {
  if (!_teamBoard[fac]) _teamBoard[fac] = { helps: [], raids: [], guard: null };
  return _teamBoard[fac];
}

function countJoiners(people, fac, callId) {
  let n = 0;
  for (const o of people) {
    if (o.dead || o.faccion !== fac) continue;
    if (o.aiJoin === callId) n++;
  }
  return n;
}

// ===== FIN DEL GRUPO HELP (devolver null = el grupo se disuelve) =====
// Causas:
//  1. Se agotó call.t (nadie se sumó a tiempo, o se cortó el sostén de abajo).
//  2. Escolta: el portador murió o ya no lleva la esfera.
//  3. Murió quien pidió ayuda y no queda ningún miembro que herede el liderazgo.
//  4. La amenaza reportada (foeId) murió o desapareció.
//  Sostén: con miembros, amenaza a < 150 del pedido y edad < GROUP_MAX_LIFE, call.t no baja de 3;
//  si la amenaza se aleja o se supera GROUP_MAX_LIFE, el timer corre y termina por la causa 1.
function refreshCall(call, people, fac, dt) {
  if (!call) return null;
  // Se llama una vez por bot por frame: descontar tiempo real, no dt × bots.
  const now = performance.now() * 0.001;
  const step = call._last != null ? Math.min(0.25, Math.max(0, now - call._last)) : 0;
  call._last = now;
  call.t = (call.t || 0) - step;
  if (call.t <= 0) return null;
  let who = people.find((o) => o.id === call.fromId);
  // Escolta: vive mientras el portador lleve la esfera
  if (call.escort && (!who || who.dead || who.esfera == null)) return null;
  if (!who || who.dead) {
    // Sucesión: el grupo sigue con un miembro como líder
    const heir = people.find((o) => !o.dead && o.faccion === fac && o.aiJoin === call.id);
    if (!heir) return null;
    call.fromId = heir.id;
    who = heir;
  }
  // help sigue al que pidió
  if (call.kind === "help") {
    call.x = who.pos().x;
    call.z = who.pos().z;
  }
  let foeNear = true;
  if (call.foeId != null) {
    const foe = people.find((o) => o.id === call.foeId);
    if (!foe || foe.dead) return null;
    foeNear = Math.hypot(foe.pos().x - call.x, foe.pos().z - call.z) < 150;
  }
  call.taken = countJoiners(people, fac, call.id);
  // Con miembros, el grupo se sostiene (tope de vida total GROUP_MAX_LIFE)
  call.age = (call.age || 0) + step;
  if (call.taken > 0 && foeNear && call.age < GROUP_MAX_LIFE) call.t = Math.max(call.t, 3);
  return call;
}

/**
 * Escuadrón de raid: entidad propia, sin timer de modo.
 * Fases: "gather" (todos al punto de encuentro) → "go" (asalto a la base rival).
 * Termina por éxito (alguien agarra esfera), sin botín, todos caídos, tope de vida
 * o RAID_AT_BASE s en la base rival sin lograrlo. Si cae el líder, asume un miembro.
 */
function pickRally(side, homeZ, enemyZ) {
  const lim = MAP / 2 - 60;
  let x = side * Math.min(lim, 70 + Math.random() * 120);
  let z = homeZ + (enemyZ - homeZ) * (0.22 + Math.random() * 0.14);
  for (let i = 0; i < 8 && isWater(x, z); i++) {
    x *= 0.75;
    z = homeZ + (z - homeZ) * 0.85;
  }
  return { x, z };
}

/** Integrantes extra (sin líder) según tamaño del equipo y esferas del rival. */
function raidSlots(teamN, lootCount) {
  const size = Math.round(teamN * (RAID_FRAC_BASE + RAID_FRAC_PER_BALL * lootCount));
  return Math.max(1, Math.min(Math.ceil(teamN * RAID_FRAC_MAX), size) - 1);
}

function createRaid(p, homeZ, enemyZ, teamN, lootCount, raids) {
  // Lado del mapa distinto a los otros escuadrones si se puede
  const used = raids.map((r) => Math.sign(r.rally.x));
  let side = seed(p) > 0.5 ? 1 : -1;
  if (used.includes(side) && !used.includes(-side)) side = -side;
  const rally = pickRally(side, homeZ, enemyZ);
  return {
    id: `raid:${p.id}:${Math.floor(performance.now() % 1e7)}`,
    kind: "raid",
    fromId: p.id,
    slots: raidSlots(teamN, lootCount),
    taken: 0,
    t: 99,
    phase: "gather",
    rally,
    x: rally.x,
    z: rally.z,
    homeZ,
    enemyZ,
    age: 0,
    phaseT: 0,
    baseT: 0,
    goN: 0,
    regroups: 0,
  };
}

/**
 * Guardia permanente de la base: cupo proporcional al equipo y a las esferas en casa.
 * Fracción del equipo = min(GUARD_MAX_FRAC, GUARD_BASE + GUARD_PER_BALL × esferas); mín. 1 con ≥1 esfera.
 * Asignación central (cada 0.5 s): suma a los más aptos (rol guard, cerca de casa) y libera a los más lejanos.
 */
function updateGuard(tb, people, fac, homeZ, balls) {
  const now = performance.now() * 0.001;
  const g =
    tb.guard ||
    { id: `guard:${fac}`, kind: "guard", fromId: null, slots: 0, taken: 0, t: 99, home: 0, _chk: -1 };
  if (now - g._chk < 0.5) return g;
  g._chk = now;
  const team = people.filter((o) => !o.dead && o.faccion === fac);
  const bots = team.filter((o) => o.controller === "ia");
  const home = balls.items.filter((b) => b.inBase === fac && !b.held).length;
  // Cupo con margen: oscila lento ±1 para que no sea un número fijo
  g.wobble = (g.wobble ?? Math.random()) + 0.002;
  const frac = Math.min(GUARD_MAX_FRAC, GUARD_BASE + GUARD_PER_BALL * home);
  let want = home > 0 ? Math.max(1, Math.round(team.length * frac + Math.sin(g.wobble * Math.PI * 2) * 0.9)) : 0;
  want = Math.min(want, bots.length);
  const hd = (o) => Math.hypot(o.pos().x, o.pos().z - homeZ);
  const isRaidLeader = (o) => tb.raids.some((r) => r.fromId === o.id);
  const canGuard = (o) =>
    !o.aiJoin && o.esfera == null && o.s.hp >= o.s.hpMax * 0.2 && !isRaidLeader(o) && (o.aiGuardRest || 0) < now;
  const members = bots.filter((o) => o.aiJoin === g.id);
  const release = (o) => {
    clearJoin(o);
    o.aiGuardRest = now + GUARD_REST_MIN + Math.random() * GUARD_REST_RND;
    if (o.aiMode === "camp") o.aiModeT = 0;
  };
  // Turnos: quien cumplió su turno sale (si hay reemplazo) y descansa un rato peleando
  for (let i = members.length - 1; i >= 0; i--) {
    const o = members[i];
    if (now - (o.aiGuardSince || now) < (o.aiGuardShift || GUARD_SHIFT_MIN)) continue;
    if (!bots.some(canGuard)) break;
    release(o);
    members.splice(i, 1);
  }
  if (members.length > want) {
    members.sort((a, b) => hd(b) - hd(a));
    for (const o of members.splice(0, members.length - want)) release(o);
  }
  while (members.length < want) {
    let best = null;
    let bestS = 1e9;
    for (const o of bots) {
      if (!canGuard(o)) continue;
      const role = o.aiRole || aiRole(o);
      const s = hd(o) - (role === "guard" ? 120 : 0) + (role === "aggro" ? 140 : 0) + Math.random() * 60;
      if (s < bestS) {
        bestS = s;
        best = o;
      }
    }
    if (!best) break;
    best.aiJoin = g.id;
    best.aiJoinKind = "guard";
    best.aiCampX = null;
    best.aiModeT = 0;
    best.aiGuardSince = now;
    best.aiGuardShift = GUARD_SHIFT_MIN + Math.random() * GUARD_SHIFT_RND;
    members.push(best);
  }
  g.slots = want;
  g.taken = members.length;
  g.home = home;
  g.fromId = members[0]?.id ?? null;
  return g;
}

/** Puesto de guardia en anillo alrededor de la base propia (fuera del casco). */
function pickGuardPost(p, homeZ) {
  for (let i = 0; i < 8; i++) {
    const a = seed(p) * Math.PI * 2 + i * 0.8;
    const r = 58 + seed(p) * 30;
    const x = Math.sin(a) * r;
    const z = homeZ + Math.cos(a) * r;
    if (!isWater(x, z)) return { x, z };
  }
  return { x: 0, z: homeZ + (homeZ < 0 ? 60 : -60) };
}

function endRaid(sq, people, fac) {
  for (const o of people) {
    if (o.faccion !== fac) continue;
    const mine = o.aiJoin === sq.id || o.id === sq.fromId;
    if (o.aiJoin === sq.id) clearJoin(o);
    if (mine && o.aiMode === "raid") o.aiModeT = 0;
  }
  return null;
}

/**
 * Reclutamiento central del raid: entran los libres más cercanos al punto de reunión o al líder.
 * Libre = bot sin grupo (ni líder de otro raid), sin esfera, con vida, en modo pasivo.
 */
function recruitRaid(sq, leader, people, fac, raids) {
  const leaders = new Set(raids.map((r) => r.fromId));
  const free = (o) => {
    if (o.dead || o.faccion !== fac || o.controller !== "ia" || o.aiJoin || o.esfera != null) return false;
    if (leaders.has(o.id) || o.s.hp < o.s.hpMax * 0.4) return false;
    const m = o.aiMode;
    const role = o.aiRole || aiRole(o);
    return !m || m === "wander" || m === "charge" || m === "camp" || (m === "ball" && role !== "baller");
  };
  const dist = (o) =>
    Math.min(
      Math.hypot(o.pos().x - sq.rally.x, o.pos().z - sq.rally.z),
      leader.dead ? 1e9 : o.pos().distanceTo(leader.pos())
    );
  const cands = people.filter(free).sort((a, b) => dist(a) - dist(b));
  for (const o of cands.slice(0, sq.slots - sq.taken)) {
    o.aiJoin = sq.id;
    o.aiJoinKind = "raid";
    o.aiModeT = 0;
  }
}

function refreshRaid(sq, people, fac, lootCount, teamN, raids = []) {
  if (!sq) return null;
  const now = performance.now() * 0.001;
  const step = sq._last != null ? Math.min(0.25, Math.max(0, now - sq._last)) : 0;
  sq._last = now;
  sq.age += step;
  sq.phaseT += step;
  // Plantel completo (incluye caídos: el join sobrevive al respawn)
  let leader = people.find((o) => o.id === sq.fromId);
  const roster = people.filter((o) => o.faccion === fac && o.aiJoin === sq.id);
  if (leader?.dead) {
    const heir = roster.find((o) => !o.dead);
    if (heir) {
      clearJoin(heir);
      leader.aiJoin = sq.id;
      leader.aiJoinKind = "raid";
      roster.splice(roster.indexOf(heir), 1, leader);
      sq.fromId = heir.id;
      leader = heir;
    }
  }
  if (!leader) return endRaid(sq, people, fac);
  const squad = [leader, ...roster];
  const alive = squad.filter((o) => !o.dead);
  sq.taken = roster.length;
  sq.slots = Math.max(sq.taken, raidSlots(teamN, lootCount));
  if (!lootCount || sq.age > RAID_MAX_LIFE || alive.some((o) => o.esfera != null)) return endRaid(sq, people, fac);
  if (sq.phase === "gather") {
    if (sq.taken < sq.slots && now - (sq._recruit || 0) > 0.5) {
      sq._recruit = now;
      recruitRaid(sq, leader, people, fac, raids);
      sq.taken = people.filter((o) => o.faccion === fac && o.aiJoin === sq.id).length;
    }
    if (!alive.length) {
      if (sq.phaseT > RAID_GATHER_MAX) return endRaid(sq, people, fac);
      return sq;
    }
    const at = alive.filter((o) => Math.hypot(o.pos().x - sq.rally.x, o.pos().z - sq.rally.z) < 26).length;
    // Arrancar con el 80% del cupo en el punto de encuentro; al vencer la espera, con los presentes (mín. 2)
    const need = Math.max(2, Math.ceil((sq.slots + 1) * 0.8));
    const enough = at >= need && sq.phaseT > RAID_GATHER_MIN;
    const full = at >= sq.slots + 1;
    if (full || enough || (sq.phaseT > RAID_GATHER_MAX && at >= 2)) {
      sq.phase = "go";
      sq.phaseT = 0;
      sq.baseT = 0;
      sq.goN = alive.length;
    } else if (sq.phaseT > RAID_GATHER_MAX + 15) return endRaid(sq, people, fac);
  } else {
    // Cayó más de la mitad (o todos): replantear, nueva convocatoria y nuevo punto de encuentro
    if (alive.length * 2 < sq.goN || !alive.length) {
      if (sq.regroups >= RAID_MAX_REGROUPS) return endRaid(sq, people, fac);
      sq.regroups++;
      sq.phase = "gather";
      sq.phaseT = 0;
      sq.rally = pickRally(Math.random() < 0.5 ? 1 : -1, sq.homeZ, sq.enemyZ);
      sq.x = sq.rally.x;
      sq.z = sq.rally.z;
      return sq;
    }
    const foeFac = fac === "z" ? "f" : "z";
    if (alive.some((o) => shipDist(o.pos(), foeFac) < BASE_INNER_R + 45)) sq.baseT += step;
    if (sq.baseT > RAID_AT_BASE) return endRaid(sq, people, fac);
  }
  return sq;
}

/** Grupos activos de un equipo (help/defend/raid) con líder y miembros, para la UI. */
export function getTeamGroups(fac, people) {
  const b = _teamBoard[fac];
  if (!b) return [];
  const out = [];
  const g = b.guard;
  if (g && g.slots > 0) {
    const members = people.filter((o) => !o.dead && o.faccion === fac && o.aiJoin === g.id);
    out.push({ kind: "guard", leader: null, members, slots: g.slots, t: 0, phase: null, home: g.home });
  }
  for (const c of [...b.helps, ...b.raids]) {
    if (!c || c.t <= 0) continue;
    const leader = people.find((o) => o.id === c.fromId);
    if (!leader) continue;
    const members = people.filter((o) => o !== leader && o.faccion === fac && o.aiJoin === c.id);
    out.push({ kind: c.kind, leader, members, slots: c.slots, t: c.t, phase: c.phase || null });
  }
  return out;
}

const MAX_HELP_GROUPS = 3;

/** Pedido de ayuda ajeno con cupo más cercano. */
function nearestHelp(helps, p) {
  let best = null;
  let bd = 1e9;
  for (const c of helps) {
    if (c.fromId === p.id || c.taken >= c.slots) continue;
    const d = Math.hypot(c.x - p.pos().x, c.z - p.pos().z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Pedido de ayuda: cada pedidor tiene su propio grupo (hasta MAX_HELP_GROUPS por facción). */
function emitTeamCall(fac, kind, from, slots, life, extra = {}) {
  const b = teamBoard(fac);
  const list = b.helps;
  const cur = list.find((c) => c.fromId === from.id);
  if (cur) {
    cur.t = Math.max(cur.t, life);
    cur.age = 0;
    cur.x = from.pos().x;
    cur.z = from.pos().z;
    Object.assign(cur, extra);
    return cur;
  }
  // Ya está en un grupo help contra esa misma amenaza: no duplicar
  if (from.aiJoin && list.some((c) => c.id === from.aiJoin && (extra.foeId == null || c.foeId === extra.foeId))) return null;
  if (list.length >= MAX_HELP_GROUPS) {
    // Lleno: la escolta desplaza al pedido común más viejo; uno común no entra
    if (!extra.escort) return null;
    const old = list.filter((c) => !c.escort).sort((a, c) => (c.age || 0) - (a.age || 0))[0];
    if (!old) return null;
    list.splice(list.indexOf(old), 1);
  }
  const id = `${kind}:${from.id}:${Math.floor(performance.now() % 1e7)}`;
  const call = {
    id,
    kind,
    fromId: from.id,
    x: from.pos().x,
    z: from.pos().z,
    slots,
    taken: 0,
    t: life,
    ...extra,
  };
  list.push(call);
  return call;
}

function tryJoinCall(p, call, people) {
  if (!call || p.dead || p.esfera != null) return false;
  if (p.id === call.fromId) return false;
  if (p.aiJoin === call.id) return true;
  const taken = countJoiners(people, p.faccion, call.id);
  if (taken >= call.slots) return false;
  p.aiJoin = call.id;
  p.aiJoinKind = call.kind;
  return true;
}

function clearJoin(p) {
  p.aiJoin = null;
  p.aiJoinKind = null;
}

/** Cuántos aliados vs enemigos en radio (para pedir ayuda si están en inferioridad). */
function localOdds(p, people, r = 30) {
  let foes = 0;
  let allies = 0;
  const pos = p.pos();
  for (const o of people) {
    if (o === p || o.dead) continue;
    if (o.pos().distanceTo(pos) > r) continue;
    if (o.faccion === p.faccion) allies++;
    else foes++;
  }
  return { foes, allies };
}

/**
 * Estilo al llevar esfera. AJUSTE pesos por rol:
 * baller → más sneak; aggro → más fight; resto mix.
 */
function pickCarryStyle(p, role, agg) {
  const a = seed(p) * 0.55 + agg * 0.45;
  if (role === "baller") {
    if (a < 0.55) return "sneak";
    if (a < 0.82) return "rush";
    return "fight";
  }
  if (role === "aggro") {
    if (a < 0.28) return "sneak";
    if (a < 0.55) return "rush";
    return "fight";
  }
  if (a < 0.38) return "sneak";
  if (a < 0.72) return "rush";
  return "fight";
}

function refreshCarryStyle(p, role, agg, dt) {
  p.aiCarryStyleT = (p.aiCarryStyleT || 0) - dt;
  if (!p.aiCarryStyle || p.aiCarryStyleT <= 0) {
    p.aiCarryStyle = pickCarryStyle(p, role, agg);
    p.aiCarryStyleT = 8 + seed(p) * 4; // 8–12 s
  }
  return p.aiCarryStyle;
}

/**
 * ¿Soltar la esfera con poca vida?
 * AJUSTE chances: crit+foe ~0.55–0.75; lowHp+foe ~0.25–0.45 (agg/front bajan chance).
 */
function maybeDropBall(p, balls, people, mood, agg, role, critHp, lowHp, dt) {
  if (p.esfera == null) return false;
  if ((p.aiDropCd || 0) > 0) {
    p.aiDropCd -= dt;
    return false;
  }
  if (!(critHp || (lowHp && mood.hp < 0.22))) return false;
  let nearFoe = false;
  for (const o of people) {
    if (o.dead || o.faccion === p.faccion) continue;
    if (o.pos().distanceTo(p.pos()) < 16) {
      nearFoe = true;
      break;
    }
  }
  if (!nearFoe && !critHp) return false;
  if (!nearFoe && critHp) {
    // crítico solo, sin enemigo: chance baja de soltar por pánico
    p.aiDropCd = 1.2;
    if (Math.random() > 0.35) return false;
  } else {
    // AJUSTE base de soltar
    let chance = critHp ? 0.65 : 0.35;
    chance -= agg * 0.18;
    chance -= Math.max(0, mood.front) * 0.12;
    if (role === "aggro") chance -= 0.1;
    if (role === "baller") chance += 0.08;
    chance = THREE.MathUtils.clamp(chance, 0.15, 0.78);
    p.aiDropCd = 1.8 + seed(p) * 1.2;
    if (Math.random() > chance) {
      // No suelta: marcar reacción (pelear o hide) un rato
      p.aiCarryHold = 4 + agg * 3;
      return false;
    }
  }
  p.dropBall(balls);
  p.aiCarryHold = 0;
  return true;
}

/**
 * Si el personaje casi no avanza en XZ (o flota en el mismo sitio), fuerza un
 * plan simple unos segundos. Está muy atenuado: solo casos extremos.
 * `lim` = avance mínimo en la ventana (más bajo = más permisivo).
 * `_stkT` dispara pickUnstick() tras ~12 s acumulados (ver aiTick).
 */
function tickStuck(p, dt) {
  const x = p.pos().x;
  const z = p.pos().z;
  if (p._stkX == null) {
    p._stkX = x;
    p._stkZ = z;
    p._stkAcc = 0;
    p._stkT = 0;
    return;
  }
  p._stkAcc = (p._stkAcc || 0) + dt;
  if (p._stkAcc < 0.85) return;
  const window = p._stkAcc;
  const prog = Math.hypot(x - p._stkX, z - p._stkZ);
  p._stkX = x;
  p._stkZ = z;
  p._stkAcc = 0;
  const hovering = (p.flyAlt || 0) > 0.45;
  const nearShip = !!nearAnyShip({ x, z }, 22);
  const lim = hovering ? 1.2 : nearShip ? 2.0 : 0.65;
  if (prog < lim) p._stkT = (p._stkT || 0) + window;
  else p._stkT = Math.max(0, (p._stkT || 0) - window * 2.4);
}

// Se llama cuando el personaje está atascado y necesita desatascarse.
// Se elige un objetivo para desatascarse:
// - Si tiene la esfera, se deposita en la base.
// - Si no tiene la esfera, se busca una esfera libre en la base.
// - Si no hay esferas libres, se busca una esfera en la base enemiga.
// - Si no hay esferas libres ni en la base enemiga, se busca una esfera en la base propia.
// - Si no hay esferas libres ni en la base enemiga ni en la base propia, se busca una esfera en la base neutral.
// - Si no hay esferas libres ni en la base enemiga ni en la base propia ni en la base neutral, se busca una esfera en la base aliada.
// - Si no hay esferas libres ni en la base enemiga ni en la base propia ni en la base neutral ni en la base aliada, se busca una esfera en la base neutral.
// - Si no hay esferas libres ni en la base enemiga ni en la base propia ni en la base neutral ni en la base aliada ni en la base neutral, se busca una esfera en la base aliada.
function pickUnstick(p, balls) {
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const baseDist = Math.hypot(p.pos().x, p.pos().z - homeZ);
  // Desatasco corto: casi no debe pisar planes normales
  p.aiUnstick = 1.1 + seed(p) * 0.6;
  p.aiFight = 0;
  p.aiCharge = false;
  p._stkT = 0;
  if (p.esfera != null) {
    p.aiBreak = "home";
    return;
  }
  if (nearAnyShip(p.pos(), 36)) {
    p.aiUnstick = 0;
    return;
  }
  if ((p.flyAlt || 0) > 0.35) {
    p.aiBreak = "land";
    return;
  }
  const free = balls.items.filter((b) => !b.held && b.inBase !== p.faccion);
  if (free.length) {
    let best = free[0];
    let bestD = 1e9;
    for (const b of free) {
      const d = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    p.aiBreak = "ball";
    p.aiBall = best.n;
    p.aiLock = p.aiUnstick;
    return;
  }
  p.aiBreak = "leave";
  if (baseDist < 70) {
    const a = Math.atan2(p.pos().x, p.pos().z - homeZ) || seed(p) * Math.PI * 2;
    p.aiBreakAx = Math.cos(a);
    p.aiBreakAz = Math.sin(a);
  } else {
    p.aiBreakAx = Math.sin(p.yaw);
    p.aiBreakAz = Math.cos(p.yaw);
  }
}

function runUnstick(p, people, balls, combat, match, dt) {
  p.aiUnstick = Math.max(0, (p.aiUnstick || 0) - dt);
  p.aiFight = 0;
  p.aiCharge = false;
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const dir = new THREE.Vector3();
  let run = true;
  let fly = false;
  const body = senseBody(p);

  if (p.aiBreak === "land") {
    aiVert(p, body, "descend");
    if (p.flyAlt > 0.8) p.vy = Math.min(p.vy, -12);
    if (p.flyAlt < 0.2) {
      const free = balls.items.filter((b) => !b.held && b.inBase !== p.faccion);
      if (free.length) {
        p.aiBreak = "ball";
        p.aiBall = free.reduce((a, b) => {
          const da = Math.hypot(a.mesh.position.x - p.pos().x, a.mesh.position.z - p.pos().z);
          const db = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
          return db < da ? b : a;
        }).n;
        p.aiLock = p.aiUnstick;
      } else p.aiBreak = "leave";
    }
  } else if (p.aiBreak === "home" || p.esfera != null) {
    p.aiBreak = "home";
    const nav = steerShipNav(p.pos().x, p.pos().z, p.faccion, "deposit");
    if (nav) dir.set(nav.x, 0, nav.z);
    else {
      const home = steerHome(p.pos().x, p.pos().z, homeZ);
      dir.set(home.x, 0, home.z);
    }
    const d = Math.hypot(p.pos().x, p.pos().z - homeZ);
    fly = d > 70 && body.ki > 0.2 && shipDist(p.pos(), p.faccion) > BASE_INNER_R + 26;
    if (d < 48 || inShipBase(p.pos(), p.faccion) || shipDist(p.pos(), p.faccion) < BASE_INNER_R + 26) {
      fly = false;
      aiVert(p, body, "descend");
      if (p.flyAlt > 0.8) p.vy = Math.min(p.vy, -12);
    }
  } else if (p.aiBreak === "ball") {
    const b = ballByN(balls, p.aiBall) || balls.items.find((x) => !x.held && x.inBase !== p.faccion);
    if (!b) {
      p.aiBreak = "leave";
    } else {
      p.aiBall = b.n;
      dir.set(b.mesh.position.x - p.pos().x, 0, b.mesh.position.z - p.pos().z);
      const d = dir.length();
      const homeD = Math.hypot(p.pos().x, p.pos().z - homeZ);
      fly = d > 90 && homeD > 60 && body.ki > 0.18;
      if (homeD < 50) {
        fly = false;
        if (p.flyAlt > 0.2) aiVert(p, body, "descend");
      }
    }
  }

  if (p.aiBreak === "leave") {
    if (p.aiBreakAx == null) {
      p.aiBreakAx = Math.sin(p.yaw);
      p.aiBreakAz = Math.cos(p.yaw);
    }
    dir.set(p.aiBreakAx, 0, p.aiBreakAz);
    const homeD = Math.hypot(p.pos().x, p.pos().z - homeZ);
    fly = homeD > 65 && body.ki > 0.22;
    if (homeD < 50 && p.flyAlt > 0.2) aiVert(p, body, "descend");
  }

  if (fly) aiVert(p, body, "climb");
  else if (p.flyAlt > 0.25 && p.aiBreak !== "home" && p.aiBreak !== "land") aiVert(p, body, "descend");

  if (dir.lengthSq() > 0.04) {
    dir.normalize();
    p.yaw = Math.atan2(dir.x, dir.z);
    aiMove(p, dir, run && !body.swimming, dt);
  }
  flushAiMove(p);
  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  p.stickY();
  if (p.aiUnstick <= 0) p._stkT = 0;
}

/** La IA decide cada AI_EVERY cuadros; entre medio repite las acciones continuas. */
const AI_EVERY = 3;
const REPLAY = ["move", "guard", "charge", "climb", "descend", "duckHold", "stickY"];
const WITH_DT = { move: 2, guard: 1, charge: 0 };

export function aiStep(p, people, balls, combat, match, dt) {
  if (p.controller !== "ia" || p.dead) {
    p._aiRec = null;
    return;
  }
  if (p._aiF == null) p._aiF = Math.floor(Math.random() * AI_EVERY);
  p._aiAcc = Math.min(0.25, (p._aiAcc || 0) + dt);
  if (++p._aiF % AI_EVERY !== 0 && p._aiRec) {
    if (p._aiYawWant != null) smoothYaw(p, p._aiYawWant, dt, p._aiYawRate);
    for (const [name, args] of p._aiRec) {
      const i = WITH_DT[name];
      if (i != null) args[i] = dt;
      p[name](...args);
    }
    return;
  }
  p._aiYawWant = null;
  p._aiFrameDt = dt;
  const rec = [];
  const saved = REPLAY.map((name) => [name, Object.prototype.hasOwnProperty.call(p, name), p[name]]);
  for (const [name, , fn] of saved) {
    p[name] = (...args) => {
      const i = WITH_DT[name];
      if (i != null) args[i] = dt;
      if (name === "move" && args[0]?.clone) args[0] = args[0].clone();
      rec.push([name, args.slice()]);
      return fn.apply(p, args);
    };
  }
  try {
    p._aiMoveReq = null;
    aiTick(p, people, balls, combat, match, p._aiAcc);
    flushAiMove(p);
  } finally {
    for (const [name, own, fn] of saved) {
      if (own) p[name] = fn;
      else delete p[name];
    }
    p._aiFrameDt = null;
  }
  p._aiAcc = 0;
  p._aiRec = rec;
}

export function aiTick(p, people, balls, combat, match, dt) {
  if (p.controller !== "ia" || p.dead) return;
  tickStuck(p, dt);
  // Unstick muy raro: ~12 s quieto y solo si no hay plan útil
  const busyPlan =
    (p.aiMode === "fight" && p.aiFoe && !p.aiFoe.dead) ||
    (p.aiMode === "deliver" && p.esfera != null) ||
    p.aiMode === "snipe" ||
    p.aiMode === "hide" ||
    p.aiMode === "ball" ||
    p.aiMode === "raid" ||
    p.aiMode === "help" ||
    p.aiMode === "heal" ||
    p.aiMode === "healPost" ||
    (p.aiModeT || 0) > 0.4;
  if ((p._stkT || 0) > 12 && (p.aiUnstick || 0) <= 0 && !busyPlan) pickUnstick(p, balls);
  if ((p.aiUnstick || 0) > 0) {
    runUnstick(p, people, balls, combat, match, dt);
    p.aiDbg = {
      role: p.aiRole || "?",
      mode: "unstick",
      pick: p.aiBreak || "?",
      loco: (p.flyAlt || 0) > 0.35 ? "air" : p.inSwim() ? "swim" : "ground",
      charge: 0,
      run: 1,
      fly: 0,
      foe: "",
      foeDist: "",
      ball: p.aiBall || "",
      ship: 0,
      gLock: Math.round(p.aiGroundLock || 0),
      modeT: Math.round(p.aiUnstick || 0),
      wet: p.aiWetPlan || "",
      unstick: p.aiBreak || "",
    };
    return;
  }
  p.aiFight = Math.max(0, (p.aiFight || 0) - dt);
  p.aiLock = Math.max(0, (p.aiLock || 0) - dt);
  p.aiWander = Math.max(0, (p.aiWander || 0) - dt);
  p.aiCarry = Math.max(0, (p.aiCarry || 0) - dt);
  p.aiModeT = Math.max(0, (p.aiModeT || 0) - dt);
  const mood = temper(p);
  p.aiHeat = THREE.MathUtils.damp(p.aiHeat || 0, 0, 0.07, dt);
  const agg = seed(p);
  const role = p.aiRole || (p.aiRole = aiRole(p));
  const lowHp = mood.hp < (mood.front > 0.25 ? 0.28 : mood.front < -0.25 ? 0.45 : 0.35);
  const critHp = mood.hp < 0.16;
  let carrying = p.esfera != null;
  if (carrying && maybeDropBall(p, balls, people, mood, agg, role, critHp, lowHp, dt)) {
    carrying = false;
  }
  if ((p.aiCarryHold || 0) > 0) p.aiCarryHold -= dt;
  if (carrying) refreshCarryStyle(p, role, agg, dt);
  else {
    p.aiCarryStyle = null;
    p.aiCarryStyleT = 0;
  }
  // Esconderse (solo sin esfera): crítico, o muy herido y poco agresivo
  const hideOk =
    (critHp || (lowHp && mood.hp < 0.24 && (agg < 0.35 || mood.front < -0.2))) &&
    (p.aiMode === "hide" || critHp || agg < 0.35 || mood.front < -0.15);
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const enemyZ = -homeZ;
  const baseDist = Math.hypot(p.pos().x, p.pos().z - homeZ);
  const nearOwnBase = baseDist < BASE_INNER_R + 2;
  const inHomeAir = baseDist < (mood.front < -0.2 ? 90 : 70) || (role === "guard" && baseDist < 110);
  const kiFrac = mood.ki;
  const band = kiBand(p);

  const loot = balls.items.filter((b) => !b.held && b.inBase && b.inBase !== p.faccion);
  const tb = teamBoard(p.faccion);
  tb.helps = tb.helps.map((c) => refreshCall(c, people, p.faccion, dt)).filter(Boolean);
  const teamN = people.filter((o) => o.faccion === p.faccion).length;
  tb.raids = tb.raids.map((sq) => refreshRaid(sq, people, p.faccion, loot.length, teamN, tb.raids)).filter(Boolean);
  // Limpiar join si el pedido ya no existe.
  tb.guard = updateGuard(tb, people, p.faccion, homeZ, balls);
  if (p.aiJoin && ![...tb.helps.map((c) => c.id), tb.guard?.id, ...tb.raids.map((r) => r.id)].includes(p.aiJoin)) clearJoin(p);

  // Escuadrones de raid (uno cada RAID_TEAM_PER_SQUAD jugadores): los funda un agresivo
  // cuando hay botín y no hay otro escuadrón reuniéndose con cupo libre.
  const maxRaids = Math.max(1, Math.floor(teamN / RAID_TEAM_PER_SQUAD));
  if (
    tb.raids.length < maxRaids &&
    !tb.raids.some((r) => r.fromId === p.id || (r.phase === "gather" && r.taken < r.slots)) &&
    !carrying && loot.length && !lowHp && !p.aiJoin &&
    (role === "aggro" || agg > 0.55) &&
    Math.random() < 0.004 * dt * 60
  ) {
    tb.raids.push(createRaid(p, homeZ, enemyZ, teamN, loot.length, tb.raids));
    p.aiModeT = 0;
  }
  const raidSq = tb.raids.find((r) => r.fromId === p.id || p.aiJoin === r.id) || null;
  const raidLeader = !!(raidSq && raidSq.fromId === p.id);
  let inRaid = !!raidSq;
  // Salida individual: solo en estado crítico (va a curarse); el resto sigue.
  if (inRaid && critHp) {
    if (raidLeader) {
      const heir = people.find((o) => !o.dead && o.faccion === p.faccion && o.aiJoin === raidSq.id);
      if (heir) {
        clearJoin(heir);
        raidSq.fromId = heir.id;
      } else {
        endRaid(raidSq, people, p.faccion);
        tb.raids = tb.raids.filter((r) => r !== raidSq);
      }
    } else clearJoin(p);
    inRaid = false;
    if (p.aiMode === "raid") p.aiModeT = 0;
  }

  if (carrying) {
    p.aiCharge = false;
    // Escolta = grupo help del portador (termina al depositar/soltar, ver refreshCall)
    emitTeamCall(p.faccion, "help", p, MAX_ESCORTS, 4, { escort: true });
    // No forzar deliver siempre: pelear puede ganar en utilBest.
    if (!p.aiMode || (p.aiMode !== "fight" && p.aiMode !== "hide" && p.aiMode !== "deliver")) {
      commitMode(p, "deliver", 12 + seed(p) * 6);
    }
  }

  if (p.aiFoe && (p.aiFoe.s.hp <= 0 || p.aiFoe.dead || p.aiFoe.pos().distanceTo(p.pos()) > (p.aiMode === "snipe" ? 170 : p.aiMode === "fight" ? 95 : 42))) p.aiFoe = null;
  if (p.aiFoe && !canSee(p, p.aiFoe, p.aiMode === "snipe" ? 170 : 95, combat.cam)) {
    p.aiLostT = (p.aiLostT || 0) + dt;
    if (p.aiLostT > 0.9) p.aiFoe = null;
  } else p.aiLostT = 0;
  const sniper = !carrying && canSnipe(p);
  let nSnipe = 0;
  if (sniper) {
    for (const o of people) if (o.faccion === p.faccion && o.aiMode === "snipe") nSnipe++;
  }
  const threat = pickBaseThreat(p, people, homeZ, 200);
  p.aiMemT = Math.max(0, (p.aiMemT || 0) - dt);
  p.aiMemDefendT = Math.max(0, (p.aiMemDefendT || 0) - dt);
  if (threat) {
    p.aiMemDefendT = 4.2;
    p.aiMemTx = threat.pos().x;
    p.aiMemTz = threat.pos().z;
  }
  const memDefend = (p.aiMemDefendT || 0) > 0 && baseDist < 220 && role !== "baller";
  // Defensa: solo la guardia asignada; el resto solo si el intruso lo tiene encima (autodefensa).
  const onGuard = !!(tb.guard && p.aiJoin === tb.guard.id);
  const defend =
    !!(
      (threat || memDefend) &&
      !carrying &&
      !critHp &&
      (onGuard || (threat && threat.pos().distanceTo(p.pos()) < 30))
    );
  const snipeFoe =
    sniper && kiFrac > 0.28 && !critHp && nSnipe < 3
      ? pickSnipeFoe(p, people, powerStyle(p.nombre, p.faccion).range || 90, combat.cam)
      : null;
  // AJUSTE foeRange: ver portadores más lejos; con esfera propia también si el rival porta
  const foeRange = carrying
    ? p.aiCarryStyle === "fight" || role === "aggro" || mood.front > 0.2
      ? 72
      : p.aiCarryStyle === "sneak"
        ? 48
        : 55
    : p.aiMode === "fight" || defend || p.aiMode === "snipe"
      ? 150
      : inHomeAir
        ? 110
        : 120;
  let enemy = pickFoe(p, people, foeRange, homeZ, combat.cam) || (p.aiMode === "snipe" ? snipeFoe : null);
  // Priorizar portador enemigo visible aunque no sea el más cercano
  {
    let seenCarry = null;
    let bestCd = 1e9;
    for (const o of people) {
      if (o.dead || o.faccion === p.faccion || o.esfera == null) continue;
      const d = o.pos().distanceTo(p.pos());
      if (d > 160) continue;
      if (!canSee(p, o, 160, combat.cam)) continue;
      if (d < bestCd) {
        bestCd = d;
        seenCarry = o;
      }
    }
    if (seenCarry) {
      p.aiMemCx = seenCarry.pos().x;
      p.aiMemCz = seenCarry.pos().z;
      p.aiMemT = 7.5;
      if (!enemy || enemy.esfera == null || bestCd < enemy.pos().distanceTo(p.pos()) + 18) enemy = seenCarry;
    }
  }
  if (threat && defend && canSee(p, threat, foeRange, combat.cam)) {
    const td = threat.pos().distanceTo(p.pos());
    if (!enemy || threat.esfera != null || td < (enemy ? enemy.pos().distanceTo(p.pos()) : 1e9) + 25) enemy = threat;
  } else if (!enemy && (p.aiMemT || 0) > 0 && p.aiMemCx != null) {
    // Memoria: último portador visto → perseguir / sniping zona
    const md = Math.hypot(p.aiMemCx - p.pos().x, p.aiMemCz - p.pos().z);
    if (md < 180) {
      for (const o of people) {
        if (o.dead || o.faccion === p.faccion || o.esfera == null) continue;
        if (o.pos().distanceTo(p.pos()) < 150 && canSee(p, o, 150, combat.cam)) {
          enemy = o;
          break;
        }
      }
    }
  }
  if (enemy && enemy.esfera != null) {
    p.aiMemCx = enemy.pos().x;
    p.aiMemCz = enemy.pos().z;
    p.aiMemT = 7.5;
  }
  // Quien le acaba de pegar cuenta como enemigo aunque no esté a la vista (golpe por la espalda)
  {
    const tHit = performance.now() * 0.001;
    let hitter = null;
    let hd = 50;
    for (const h of p.hitBy || []) {
      if (tHit - h.t > 2 || !h.p || h.p.dead) continue;
      const d = h.p.pos().distanceTo(p.pos());
      if (d < hd) {
        hd = d;
        hitter = h.p;
      }
    }
    if (hitter && (!enemy || hd < enemy.pos().distanceTo(p.pos()) - 6)) enemy = hitter;
  }
  const enemyDist = enemy ? enemy.pos().distanceTo(p.pos()) : snipeFoe ? snipeFoe.pos().distanceTo(p.pos()) : 1e9;
  const enemyCarrier = !!(enemy && enemy.esfera != null);
  const snipeOk = !!(snipeFoe || (p.aiMode === "snipe" && p.aiFoe));
  const huntCarrier = !carrying && enemyCarrier;

  // Pedidos de equipo: ayuda en pelea / inferioridad; defensa si hay intruso.
  if (!carrying && !critHp && enemy && enemyDist < 36) {
    const odds = localOdds(p, people, 32);
    if (
      p.aiMode === "fight" ||
      enemyDist < 14 ||
      odds.foes > odds.allies ||
      enemyCarrier
    ) {
      emitTeamCall(p.faccion, "help", p, HELP_SLOTS, 7, { foeId: enemy.id });
    }
  }
  const ballCand = !carrying ? claimBall(p, people, balls, dt) : null;
  const looseFree =
    !!ballCand &&
    !ballCand.inBase &&
    !people.some((o) => o !== p && !o.dead && o.faccion === p.faccion && o.aiMode === "ball" && o.aiBall === ballCand.n);
  const idleish =
    p.aiMode === "wander" ||
    p.aiMode === "charge" ||
    p.aiMode === "camp" ||
    !p.aiMode ||
    (p.aiModeT || 0) < 0.2;
  const helpCall =
    nearestHelp(tb.helps, p);
  // Autodefensa: única excepción a la exclusividad del raid
  const nowS = performance.now() * 0.001;
  const hitRecent = (p.hitBy || []).some((h) => nowS - h.t < 2 && h.p && !h.p.dead);
  const selfDefense = !!(enemy && (hitRecent || enemyDist < 26 || (enemyCarrier && enemyDist < 60)));
  const myCall = p.aiJoin ? [...tb.helps, tb.guard, ...tb.raids].find((c) => c && c.id === p.aiJoin) || null : null;
  const guardMember = !!(myCall && myCall.kind === "guard");

  const dry = !isWater(p.pos().x, p.pos().z);
  // Cargar hasta band.hi (sticky): no soltar a los 2s
  if (p.aiMode === "charge" && kiFrac < band.hi && dry && !carrying && !defend) {
    p.aiChargeTo = band.hi;
  }
  if ((p.aiChargeTo || 0) > 0 && kiFrac >= p.aiChargeTo) p.aiChargeTo = 0;
  const needCharge =
    dry &&
    !carrying &&
    !critHp &&
    !defend &&
    (kiFrac < band.lo || ((p.aiChargeTo || 0) > 0 && kiFrac < p.aiChargeTo));

  const medic = findHealer(p, people);
  const medicDist = medic ? medic.pos().distanceTo(p.pos()) : 1e9;
  let teamHurt = 0;
  for (const o of people) {
    if (o === p || o.dead || o.faccion !== p.faccion) continue;
    if (o.s.hp < o.s.hpMax * 0.55) teamHurt++;
  }
  const pick = utilBest(p, {
    mood,
    carrying,
    enemy,
    enemyDist,
    enemyCarrier,
    ball: ballCand,
    loot,
    needCharge,
    inHomeAir,
    lowHp,
    critHp,
    agg,
    snipeOk,
    hideOk,
    medic,
    medicDist,
    teamHurt,
    baseThreat: threat,
    defend,
    role,
    helpCall,
    myCall,
    inRaid,
    selfDefense,
    idleish,
    looseFree,
  });
  const hardFight =
    pick === "fight" &&
    enemy &&
    !(p.aiShipJob && p.aiShipJob.t > 0) &&
    shipDist(p.pos(), p.faccion) > BASE_INNER_R + 22 &&
    shipDist(p.pos(), p.faccion === "z" ? "f" : "z") > BASE_INNER_R + 22;
  const cur = p.aiMode;
  const passiveCur = cur === "wander" || cur === "charge" || cur === "camp" || (cur === "ball" && role !== "baller");
  const protectedCur = (cur === "heal" || cur === "raid" || cur === "help") && (p.aiModeT || 0) > 0;
  let hard =
    (pick === "deliver" && carrying) ||
    (hardFight && (carrying ? enemyDist < 36 || enemyCarrier : enemyCarrier && enemyDist < 95)) ||
    (hardFight && enemyDist < 15) ||
    (defend && hardFight && enemyDist < 32) ||
    (hardFight && passiveCur && (hitRecent || enemyDist < 30)) ||
    (pick === "fight" && cur === "snipe" && enemy) ||
    (pick === "snipe" && snipeOk && cur !== "fight") ||
    (pick === "heal" && (critHp || lowHp) && medic) ||
    (pick === "ball" && role === "baller" && ballCand && (cur === "wander" || cur === "charge")) ||
    (pick === "ball" && (inRaid || guardMember) && ballCand && !ballCand.inBase) ||
    (pick === "help" && helpCall && (passiveCur || cur === "snipe" || cur === "healPost")) ||
    // Ya en grupo (líder o miembro): ir a su función sin esperar el timer del modo actual
    ((pick === "raid" || pick === "help" || (pick === "camp" && guardMember)) && (myCall || inRaid) && cur !== "fight") ||
    // Grupo atacado / guardia con amenaza: pelear ya
    (pick === "fight" && enemy && (inRaid || guardMember) && cur !== "fight");
  if (protectedCur) {
    hard =
      carrying ||
      (pick === "fight" && enemy && (enemyDist < 10 || enemyCarrier)) ||
      (cur === "raid" && pick === "fight") ||
      // en grupo help, utilBest ya filtró el fight (amenaza reportada o cercano con score alto)
      (cur === "help" && myCall && pick === "fight") ||
      (critHp && cur !== "heal" && pick === "heal");
  }
  // Help en grupo: no vence por timer; termina cuando el pedido muere (amenaza caída / vida del grupo).
  if (cur === "help" && myCall && myCall.kind === "help") p.aiModeT = Math.max(p.aiModeT || 0, 0.5);
  if (cur === "heal" && (mood.hp > 0.85 || !p.aiMedic || p.aiMedic.dead)) p.aiModeT = 0;
  if ((hard && pick !== cur) || (p.aiModeT || 0) <= 0) {
    if (pick === "hide") {
      const spot = pickHideSpot(p, people, homeZ);
      p.aiHideX = spot.x;
      p.aiHideZ = spot.z;
      p.aiFight = 0;
      p.aiFoe = null;
      // 20 segundos
      commitMode(p, "hide", 20 + (1 - agg) * 2.2);
    } else if (pick === "heal" && medic) {
      p.aiMedic = medic;
      p.aiFight = 0;
      p.aiFoe = null;
      commitMode(p, "heal", 60);
    } else if (pick === "healPost" && healerSpec(p.nombre)) {
      const spot = pickHealPost(p, people, homeZ);
      p.aiHealX = spot.x;
      p.aiHealZ = spot.z;
      p.aiFight = 0;
      p.aiFoe = null;
      commitMode(p, "healPost", 26 + seed(p) * 16);
    } else if (pick === "snipe") {
      p.aiFoe = snipeFoe || p.aiFoe || enemy;
      const nest = pickNest(p, p.aiFoe);
      p.aiNestX = nest.x;
      p.aiNestZ = nest.z;
      // 10-14 segundos
      commitMode(p, "snipe", 10 + seed(p) * 4);
      // AJUSTE DURACIONES: el 2º arg de commitMode son segundos comprometidos
      // con ese modo (no lo reevalúa hasta que se agote, salvo `hard` de arriba).
    } else if (pick === "fight" && enemy) {
      p.aiFoe = enemy;
      // Pelear contra el blanco de un pedido = sumarse a ese grupo
      if (!carrying && !p.aiJoin && !inRaid && helpCall && enemy.id === helpCall.foeId) tryJoinCall(p, helpCall, people);
      p.aiFight = 5 + agg * 2.8 + Math.max(0, mood.front) * 2;
      if (carrying) {
        // Pedido de ayuda al pelear con esfera
        emitTeamCall(p.faccion, "help", p, HELP_SLOTS, 7, { foeId: enemy.id });
      }
      // pelea 15-25 s; en escuadrón de raid solo un cruce corto y retoma el plan
      commitMode(p, "fight", inRaid || guardMember ? 5 + seed(p) * 2 : random(15, 22) + agg * 3);
    } else if (pick === "deliver" && carrying) {
      commitMode(p, "deliver", random(14, 28));
    } else if (pick === "deliver") commitMode(p, "deliver", random(60, 100)); // llevar esfera
    else if (pick === "help") {
      const joined = (myCall && myCall.kind === "help") || (helpCall && tryJoinCall(p, helpCall, people));
      if (joined) commitMode(p, "help", 18 + seed(p) * 7);
      else commitMode(p, "wander", 0);
    } else if (pick === "camp") {
      if (guardMember) {
        // Guardia: puesto fijo alrededor de la base; dura lo que dure la asignación
        if (p.aiCampX == null || Math.hypot(p.aiCampX, p.aiCampZ - homeZ) > 110) {
          const spot = pickGuardPost(p, homeZ);
          p.aiCampX = spot.x;
          p.aiCampZ = spot.z;
        }
        commitMode(p, "camp", 999);
      } else {
        clearJoin(p);
        if (p.aiCampX == null || Math.hypot((p.aiCampX || 0) - p.pos().x, (p.aiCampZ || 0) - p.pos().z) > 55) {
          const spot = pickHideSpot(p, people, homeZ);
          p.aiCampX = spot.x;
          p.aiCampZ = spot.z;
        }
        commitMode(p, "camp", 14 + seed(p) * 6);
      }
    } else if (pick === "ball") commitMode(p, "ball", 14 + seed(p) * 4); // buscar esfera
    else if (pick === "raid") {
      // Sin timer: el modo dura lo que dure el escuadrón (endRaid lo libera)
      commitMode(p, "raid", 999);
    } else if (pick === "charge") {
      p.aiChargeTo = band.hi;

      commitMode(p, "charge", random(20, 35) + seed(p) * 3); // cargar ki 20-38 s
    } else if (p.aiMode === "wander" && p.aiWanderX != null && Math.hypot((p.aiWanderX || 0) - p.pos().x, (p.aiWanderZ || 0) - p.pos().z) > 22) {
      commitMode(p, "wander", random(12, 18));
    } else {
      p.aiWanderPhase = (p.aiWanderPhase || 0) + 1;
      const wt =
        (p.aiMemT || 0) > 0 && p.aiMemCx != null && role === "aggro"
          ? { x: p.aiMemCx + (seed(p) - 0.5) * 40, z: p.aiMemCz + (seed(p) - 0.5) * 40 }
          : pickWanderTarget(p, homeZ, enemyZ);
      p.aiWanderX = wt.x;
      p.aiWanderZ = wt.z;
      p.aiWander = 12 + seed(p) * 6;
      commitMode(p, "wander", p.aiWander);
    }
  }
  if (p.aiJoin && p.aiMode !== "help" && p.aiMode !== "raid" && p.aiMode !== "fight" && !(guardMember && p.aiMode === "camp"))
    clearJoin(p);
  if (p.aiMode === "fight" && enemy) p.aiFoe = enemy;
  if (p.aiMode === "snipe" && (snipeFoe || p.aiFoe)) p.aiFoe = snipeFoe || p.aiFoe;
  if (p.aiMode === "snipe") {
    const nowS = performance.now() * 0.001;
    let near = null;
    let nearS = 1e9;
    for (const o of people) {
      if (o.dead || o.faccion === p.faccion) continue;
      const d = o.pos().distanceTo(p.pos());
      const hitMe = (p.hitBy || []).some((h) => h.p === o && nowS - h.t < 3);
      if (d > (hitMe ? 45 : 18)) continue;
      const s = d - (hitMe ? 25 : 0);
      if (s < nearS) {
        nearS = s;
        near = o;
      }
    }
    if (near && near !== p.aiFoe && (!p.aiFoe || nearS < p.aiFoe.pos().distanceTo(p.pos()))) p.aiFoe = near;
  }

  let dir = new THREE.Vector3();
  let ball = ballCand;
  const foe = p.aiFoe || enemy || snipeFoe;
  const sniping = !carrying && p.aiMode === "snipe" && foe && !critHp;
  const huntingCarrier = !carrying && !!(foe && foe.esfera != null);
  // Con esfera también se puede pelear (estilo fight / hold)
  const fighting =
    p.aiMode === "fight" &&
    foe &&
    (!critHp || huntingCarrier || carrying) &&
    (!carrying || p.aiCarryStyle === "fight" || (p.aiCarryHold || 0) > 0 || enemyDist < 20);
  if (p.canSsj) {
    // AJUSTE: entra en SSJ peleando con ki > 42% y sale por debajo de 18%.
    const ratio = p.s.ki / p.s.kiMax;
    if (fighting && ratio > 0.42) p.setSsj(true);
    else if (ratio < 0.18) p.setSsj(false);
  }
  const raiding = p.aiMode === "raid" && loot.length > 0;
  const foeFac = p.faccion === "z" ? "f" : "z";
  // No marcar doorBusy solo por llevar esfera (bloqueaba pelear).
  const doorBusy =
    ((raiding || p.aiMode === "ball") && shipDist(p.pos(), foeFac) < BASE_INNER_R + 48) ||
    (carrying && p.aiMode === "deliver" && shipDist(p.pos(), p.faccion) < BASE_INNER_R + 40);

  const carryStyle = p.aiCarryStyle || "rush";
  // Destino del modo (lo setea cada rama de abajo); applyLoco y la nave usan su distancia.
  let goal = carrying ? { x: 0, z: homeZ } : null;
  if (carrying && p.aiMode === "hide") {
    if (p.aiHideX == null) {
      const spot = pickHideSpot(p, people, homeZ);
      p.aiHideX = spot.x;
      p.aiHideZ = spot.z;
    }
    goal = { x: p.aiHideX, z: p.aiHideZ };
    const hd = Math.hypot(p.aiHideX - p.pos().x, p.aiHideZ - p.pos().z);
    if (hd > 5) {
      const hs = hideSteer(p.pos().x, p.pos().z, p.aiHideX, p.aiHideZ, enemy);
      dir.set(hs.x, 0, hs.z);
    } else {
      dir.set(0, 0, 0);
      p.duckHold();
    }
    if (enemy && enemyDist < 36) emitTeamCall(p.faccion, "help", p, HELP_SLOTS, 6, { foeId: enemy.id });
  } else if (carrying && !fighting) {
    // Rumbo a casa según estilo
    if (carryStyle === "sneak" || (carryStyle === "fight" && enemy && enemyDist < 36 && mood.front < 0.2 && Math.random() < 0.002 * dt * 60)) {
      // sneak (o fight que opta por esconderse un momento)
      if (carryStyle === "fight" && enemy && enemyDist < 28 && mood.ki < 0.2) {
        const spot = pickHideSpot(p, people, homeZ);
        p.aiHideX = spot.x;
        p.aiHideZ = spot.z;
        commitMode(p, "hide", 6 + (1 - agg) * 4);
        emitTeamCall(p.faccion, "help", p, HELP_SLOTS, 7, { foeId: enemy.id });
        const hs = hideSteer(p.pos().x, p.pos().z, spot.x, spot.z, enemy);
        dir.set(hs.x, 0, hs.z);
      } else {
        const wp = sideWaypoint(p, 0, homeZ);
        const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
        dir.set(hs.x, 0, hs.z);
        // A veces un hide breve en sneak
        if (enemy && enemyDist < 45 && Math.random() < 0.008 * dt * 60) {
          const spot = pickHideSpot(p, people, homeZ);
          p.aiHideX = spot.x;
          p.aiHideZ = spot.z;
          commitMode(p, "hide", 5 + seed(p) * 3);
        }
      }
    } else {
      // rush: camino lateral hasta el tramo final (no solo el eje central)
      const nav = steerShipNav(p.pos().x, p.pos().z, p.faccion, "deposit");
      const zNear = Math.abs(p.pos().z - homeZ) < 140;
      if (nav && zNear) dir.set(nav.x, 0, nav.z);
      else if (nav && Math.abs(p.pos().x) < 90 && Math.random() < 0.35) {
        const side = sideSteer(p, 0, homeZ);
        dir.set(side.x * 0.65 + nav.x * 0.35, 0, side.z * 0.65 + nav.z * 0.35);
      } else {
        const side = sideSteer(p, 0, homeZ);
        dir.set(side.x, 0, side.z);
      }
      // Hostigar portador enemigo visto de paso
      if (enemy && enemy.esfera != null && enemyDist < 95 && mood.ki > 0.2 && (p.cooldown || 0) <= 0) {
        const rng = powerStyle(p.nombre, p.faccion).range || 55;
        if (enemyDist < rng * 1.05 && canSee(p, enemy, rng, combat.cam) && Math.random() < 0.035 * dt * 60) {
          faceLock(p, enemy, dt, 2.2);
          p.lookWorld = { x: enemy.pos().x, y: enemy.pos().y + enemy.height * 0.62, z: enemy.pos().z };
          combat.blast(p, false, people, enemyDist > 40);
        }
      }
      if (kiFrac > 0.22 && shipDist(p.pos(), p.faccion) > BASE_INNER_R + 80) {
        const avoid = heatAvoid(p, people, dir);
        if (avoid && avoid.strength > 0.45) {
          const mix = Math.min(avoid.strength * 0.22, 0.22);
          dir.x = dir.x * (1 - mix) + avoid.x * mix;
          dir.z = dir.z * (1 - mix) + avoid.z * mix;
        }
      }
    }
  } else if (sniping) {
    if (!p.aiNestX) {
      const nest = pickNest(p, foe);
      p.aiNestX = nest.x;
      p.aiNestZ = nest.z;
    }
    goal = { x: p.aiNestX, z: p.aiNestZ };
    const nd = Math.hypot(p.aiNestX - p.pos().x, p.aiNestZ - p.pos().z);
    const dist = foe.pos().distanceTo(p.pos());
    if (nd > 7) dir.set(p.aiNestX - p.pos().x, 0, p.aiNestZ - p.pos().z);
    else dir.set(0, 0, 0);
    faceLock(p, foe, dt, 1.8);
    if (nd < 9 && dist > 24 && dist < (powerStyle(p.nombre, p.faccion).range || 90) * 1.08 && p.s.ki > 18 && Math.random() < 0.045 * dt * 60) {
      combat.blast(p, false, people, true);
    }
  } else if (p.aiMode === "hide") {
    if (p.aiHideX == null) {
      const spot = pickHideSpot(p, people, homeZ);
      p.aiHideX = spot.x;
      p.aiHideZ = spot.z;
    }
    goal = { x: p.aiHideX, z: p.aiHideZ };
    const hd = Math.hypot(p.aiHideX - p.pos().x, p.aiHideZ - p.pos().z);
    const threat = enemy && enemyDist < 36;
    if (hd > 6 || threat) {
      p.aiCharge = false;
      const hs = hideSteer(p.pos().x, p.pos().z, p.aiHideX, p.aiHideZ, enemy);
      dir.set(hs.x, 0, hs.z);
      const avoid = heatAvoid(p, people, dir);
      if (avoid && avoid.strength > 0.2) {
        const mix = Math.min(0.7, avoid.strength * 0.85);
        dir.x = dir.x * (1 - mix) + avoid.x * mix;
        dir.z = dir.z * (1 - mix) + avoid.z * mix;
      }
      // si el enemigo está muy cerca, huir hacia la base
      if (enemy && enemyDist < 16) {
        const home = sideSteer(p, 0, homeZ);
        dir.x = dir.x * 0.35 + home.x * 0.65;
        dir.z = dir.z * 0.35 + home.z * 0.65;
      }
    } else {
      dir.set(0, 0, 0);
      // En cobertura: recargar si está seco y sin amenaza cercana
      if (!isWater(p.pos().x, p.pos().z) && (!enemy || enemyDist > 28) && kiFrac < 0.85) {
        p.aiCharge = true;
      }
    }
  } else if (p.aiMode === "heal") {
    const m = p.aiMedic && !p.aiMedic.dead ? p.aiMedic : findHealer(p, people);
    p.aiMedic = m;
    if (!m || p.s.hp > p.s.hpMax * 0.9) {
      dir.set(0, 0, 0);
    } else {
      const tx = m.aiHealX != null ? m.aiHealX : m.pos().x;
      const tz = m.aiHealZ != null ? m.aiHealZ : m.pos().z;
      goal = { x: tx, z: tz };
      dir.set(tx - p.pos().x, 0, tz - p.pos().z);
      const md = Math.hypot(tx - p.pos().x, tz - p.pos().z);
      if (md < 5.5) {
        dir.set(0, 0, 0);
        p.duckHold();
        smoothYaw(p, Math.atan2(m.pos().x - p.pos().x, m.pos().z - p.pos().z), dt, 8);
      }
    }
  } else if (p.aiMode === "healPost") {
    if (p.aiHealX == null) {
      const spot = pickHealPost(p, people, homeZ);
      p.aiHealX = spot.x;
      p.aiHealZ = spot.z;
    }
    goal = { x: p.aiHealX, z: p.aiHealZ };
    const hd = Math.hypot(p.aiHealX - p.pos().x, p.aiHealZ - p.pos().z);
    const threatClose = enemy && enemyDist < 18;
    if (hd > 5.5 && !threatClose) {
      dir.set(p.aiHealX - p.pos().x, 0, p.aiHealZ - p.pos().z);
    } else {
      dir.set(0, 0, 0);
      p.duckHold();
      let patient = null;
      let worst = 2;
      const spec = healerSpec(p.nombre);
      const reach = (spec?.range || 12) * 0.92;
      for (const o of people) {
        if (o === p || o.dead || o.faccion !== p.faccion) continue;
        const frac = o.s.hp / Math.max(1, o.s.hpMax);
        if (o.pos().distanceTo(p.pos()) > reach) continue;
        if (frac < worst) {
          worst = frac;
          patient = o;
        }
      }
      if (patient) {
        faceLock(p, patient, dt, 1.1);
        p.lookWorld = { x: patient.pos().x, y: patient.pos().y + patient.height * 0.58, z: patient.pos().z };
        combat.healBeam(p, people, dt);
      }
    }
  } else if (fighting && !doorBusy) {
    goal = { x: foe.pos().x, z: foe.pos().z };
    const dist0 = foe.pos().distanceTo(p.pos());
    if (dist0 > 42 && !huntingCarrier) {
      const wp = sideWaypoint(p, foe.pos().x, foe.pos().z);
      dir.set(wp.x - p.pos().x, 0, wp.z - p.pos().z);
    } else {
      dir.set(foe.pos().x - p.pos().x, 0, foe.pos().z - p.pos().z);
    }
    const dist = foe.pos().distanceTo(p.pos());
    const rng = powerStyle(p.nombre, p.faccion).range || 55;
    // AJUSTE: preferir ki también vs portador a media/larga; melee si está muy cerca
    const preferKi =
      mood.ki > 0.28 &&
      p.s.ki > 14 &&
      (p.cooldown || 0) <= 0 &&
      (!huntingCarrier || dist > 10 || mood.ki > 0.4);
    // AJUSTE `hold` = distancia a la que se planta (deja de acercarse).
    // Con preferKi se queda lejos; en cuerpo a cuerpo 2.6 ≈ alcance del puño
    // (el melee de combat.js llega a ~3). Subirlo hace que peguen al aire.
    const hold = preferKi
      ? Math.min(huntingCarrier ? 16 : 14, rng * (mood.front < 0 ? 0.28 : 0.2))
      : huntingCarrier
        ? 3.2
        : mood.ki < 0.2
          ? 3.0
          : 2.6;
    const inKiRange = dist < rng * 1.05;
    const close = dist < 4.2;
    const wetFight = isWater(p.pos().x, p.pos().z);
    const fp = foe.pos();
    p.lookWorld = { x: fp.x, y: fp.y + foe.height * 0.62, z: fp.z };
    // AJUSTE: chance de “lock” (encare). Ya no orbita por estar fijado.
    const lockChance = (0.014 + agg * 0.022 + Math.max(0, mood.front) * 0.025) * dt * 60;
    const locked = (p.lockFoe === foe && (p.lockT || 0) > 0) || (dist < rng * 0.88 && Math.random() < lockChance);
    if (locked || dist < 28) faceLock(p, foe, dt, 1.35 + agg * 0.8);
    else {
      p.lockT = Math.max(0, (p.lockT || 0) - dt);
      const approachYaw = dist > 22 && !wetFight ? flankAngle(p, foe, dt) : Math.atan2(dir.x, dir.z);
      smoothYaw(p, approachYaw, dt, 7);
    }
    const lookYaw = Math.atan2(dir.x, dir.z);
    let dy = lookYaw - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    // AJUSTE: cuerpo ~50°; “mira” (cabeza) más ancha para tirar ki.
    const facing = Math.abs(dy) < 0.88;
    const onSight = canSee(p, foe, rng * 1.08, combat.cam);
    if (dir.lengthSq() > 0.4 && !p._aiSuper) {
      dir.normalize();
    const side = seed(p) > 0.5 ? 1 : -1;
    const strafe = new THREE.Vector3(Math.cos(lookYaw) * side, 0, -Math.sin(lookYaw) * side);
    // AJUSTE: mezcla de avance vs orbitar (0 = va derecho).
    const mixS = wetFight ? 0.05 : 0.1;
    const lowKi = p.s.ki < p.s.kiMax * (p._aiFightCharge ? 0.45 : 0.16);
    if (!lowKi || huntingCarrier) p._aiFightCharge = false;
    // Retirada con poca vida (hp < 32% y sin envión); abajo, retirada por ki < 16%.
    if (mood.hp < 0.32 && mood.front < 0.1 && dist < 8 && !huntingCarrier) aiMove(p, dir.clone().multiplyScalar(-1), true, dt);
    else if (lowKi && !huntingCarrier) {
      // Sin ki: cerca → a las piñas; lejos y en seco → cargar (histéresis hasta 45%).
      if (dist < 14 || !dry) {
        p._aiFightCharge = false;
        if (dist > 2.6) aiMove(p, dir.clone().lerp(strafe, mixS).normalize(), false, dt);
      } else {
        p._aiFightCharge = true;
        p.aiCharge = true;
      }
    } else if (dist > hold) {
      const fd = dir.clone().lerp(strafe, mixS).normalize();
      aiMove(p, fd, dist > 8 && (mood.ki > 0.22 || huntingCarrier), dt);
    } else if (dist < 2.6 && p.s.ki > 12 && preferKi && !huntingCarrier) {
      aiMove(p, dir.clone().multiplyScalar(-1).lerp(strafe, wetFight ? 0.08 : 0.25).normalize(), false, dt);
    } else if (close && (p.flyAlt || 0) > 0.35 && !wetFight) {
      if ((p.aiHover || 0) > 0) p.aiHover -= dt;
      else p.aiHover = 0.35 + seed(p) * 0.45;
      if ((p.aiHover || 0) > 0.18 && Math.random() < 0.22) aiMove(p, strafe, false, dt);
    } else if (wetFight && dist > 3) aiMove(p, dir, mood.ki > 0.2, dt);
    }
    // AJUSTE: chance de ki. onSight = mira al rival, no hace falta encare perfecto.
    const blastOdds =
      (onSight ? 1.35 : 0.5) *
      (mood.front < 0 ? 0.28 : 0.22) *
      (mood.ki > 0.42 ? 1.2 : mood.ki > 0.28 ? 0.85 : 0.4) *
      ((p.flyAlt || 0) > 2 ? 0.75 : 1) *
      (huntingCarrier || enemyCarrier ? 1.55 : 1) *
      (preferKi ? 1.25 : 0.85);
    const rank = superRank(p.s.ki, p.s.kiMax, p.s.ataque);
    const canSuper = rank >= 1;
    // AJUSTE: chance por frame de tirar el especial (necesita rank >= 1, ver
    // SUPER_KI en config.js). Rango máximo del super: dist < 62.
    const superOdds = (0.048 + agg * 0.03 + (rank >= 2 ? 0.03 : 0) + (rank >= 3 ? 0.02 : 0)) * dt * 60;
    if (p._aiSuper) {
      /* windup: tickAiSuper más abajo */
    } else if (canSuper && inKiRange && onSight && dist < 62 && (p.cooldown || 0) <= 0 && Math.random() < superOdds) {
      beginAiSuper(p);
    } else if (
      inKiRange &&
      onSight &&
      dist < rng * 1.05 &&
      p.s.ki >= p.s.kiMax * 0.14 &&
      (p.cooldown || 0) <= 0 &&
      Math.random() < blastOdds
    ) {
      combat.blast(p, false, people, dist > 48);
    }
    // ===== SCORING GOLPE FÍSICO (melee) — decide si la IA tira el puño este frame =====
    // AJUSTE MELEE. meleeRange: alcance real del puño en combat.js es ~2.75-3.05,
    // más lejos es pegarle al aire. meleeOdds: chance por frame de tirar el golpe
    // (0.42 crecido / 0.28 normal pegado, 0.16 al límite del alcance); se
    // multiplica por MELEE de config.js, que es el dial global.
    const meleeRange = 3.1;
    const meleeOdds = dist < 2.6 ? (mood.front > 0.2 ? 0.72 : 0.38) : dist < meleeRange ? 0.16 : 0;
    // ===== GUARDIA (cubrirse) =====
    // Amenaza: cualquier rival pegado que arranca/está por tirar golpe, o ki que viene hacia mí.
    // Cada amenaza nueva se tira una vez contra la habilidad del bot (no es infalible).
    const me = p.pos();
    let threat = false;
    for (const o of people) {
      if (o.dead || o.faccion === p.faccion) continue;
      const od = o.pos().distanceTo(me);
      if (od > 4.8) continue;
      const winding = (o.posePunch || 0) > 0 || ((o.cooldown || 0) <= 0 && (o.rush || 0) > 0.3 && od < 3.6);
      if (winding) {
        threat = true;
        break;
      }
    }
    if (!threat) {
      for (const s of combat.shots) {
        if (s.faccion === p.faccion) continue;
        const sp = s.mesh.position;
        const dx = me.x - sp.x, dy = me.y - sp.y, dz = me.z - sp.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 34 || d / Math.max(1, s.speed || 30) > 0.7) continue;
        const dl = s.dir ? s.dir.length() || 1 : 1;
        const dot = s.dir ? (s.dir.x * dx + s.dir.y * dy + s.dir.z * dz) / (dl * Math.max(0.01, d)) : 1;
        if (dot > 0.8 || d < 5) {
          threat = true;
          break;
        }
      }
    }
    const blockSkill = 0.6 + seed(p) * 0.3;
    if (threat && !p._aiThreat) {
      p._aiThreat = 0.45;
      if (Math.random() < blockSkill) p._aiGuard = 0.38;
    } else if (threat) p._aiThreat = Math.max(p._aiThreat, 0.2);
    p._aiThreat = Math.max(0, (p._aiThreat || 0) - dt);
    if (threat && (p._aiGuard || 0) > 0) p._aiGuard = Math.max(p._aiGuard, 0.2);
    else p._aiGuard = Math.max(0, (p._aiGuard || 0) - dt);
    p._blockDelay = 0.02;
    p.guard((p._aiGuard || 0) > 0, dt);
    const airborne = (p.flyAlt || 0) > 0.28 || !!p.volando;
    if (airborne && !p._aiSuper && !p._blocking && facing && dist >= 2.2 && dist < 3.4 && (p.cooldown || 0) <= 0 && Math.random() < 0.3 * MELEE) {
      p.rush = Math.max(p.rush || 0, 0.95);
      const stepV = Math.min(12, Math.max(0, dist - 1) * 8);
      p.vx += Math.sin(lookYaw) * stepV;
      p.vz += Math.cos(lookYaw) * stepV;
      combat.melee(p, people);
    } else if (!p._aiSuper && !p._blocking && dist < meleeRange && facing && Math.random() < meleeOdds * MELEE) {
      // Micro-paso hacia el rival al tirar el golpe, para no quedarse corto.
      // AJUSTE: tope 9 de velocidad; 1.2 es la distancia que deja sin cerrar.
      const stepV = Math.min(9, Math.max(0, dist - 1.2) * 7);
      p.vx += Math.sin(lookYaw) * stepV;
      p.vz += Math.cos(lookYaw) * stepV;
      combat.melee(p, people);
    }
  } else {
    if ((p.lockT || 0) > 0) p.lockT = Math.max(0, p.lockT - dt * 2.2);
    if (p.lockT <= 0) p.lockFoe = null;
    if (raiding && inRaid && raidSq && raidSq.phase === "gather") {
      // Punto de encuentro: llegar y esperar al resto cargando ki
      goal = { x: raidSq.rally.x, z: raidSq.rally.z };
      const rx = raidSq.rally.x - p.pos().x;
      const rz = raidSq.rally.z - p.pos().z;
      if (Math.hypot(rx, rz) > 7) dir.set(rx, 0, rz);
      else {
        dir.set(0, 0, 0);
        if (kiFrac < 0.92 && !isWater(p.pos().x, p.pos().z)) p.aiCharge = true;
      }
    } else if (raiding) {
      const t = loot.reduce((a, b) => {
        const da = Math.hypot(a.mesh.position.x - p.pos().x, a.mesh.position.z - p.pos().z);
        const db = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
        return db < da ? b : a;
      });
      goal = { x: t.mesh.position.x, z: t.mesh.position.z };
      const wp = sideWaypoint(p, t.mesh.position.x, t.mesh.position.z);
      const near = Math.hypot(t.mesh.position.x - p.pos().x, t.mesh.position.z - p.pos().z) < 70;
      if (near) dir.set(t.mesh.position.x - p.pos().x, 0, t.mesh.position.z - p.pos().z);
      else {
        const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
        dir.set(hs.x, 0, hs.z);
      }
    } else if (p.aiMode === "help") {
      {
        const call = p.aiJoinKind === "help" ? tb.helps.find((c) => c.id === p.aiJoin) || null : null;
        // Sin grupo (no entró o se disolvió): soltar help y reevaluar el próximo frame
        if (!call) {
          clearJoin(p);
          p.aiModeT = 0;
        }
        const hf = call?.foeId != null ? people.find((o) => o.id === call.foeId && !o.dead) : null;
        if (call) goal = { x: call.x, z: call.z };
        if (call?.escort) {
          // Escolta: acompañar al portador por el costado; pelear solo si el enemigo lo amenaza
          const wp = sideWaypoint(p, call.x, call.z);
          const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
          dir.set(hs.x, 0, hs.z);
          const foe = hf || enemy;
          if (foe && Math.hypot(foe.pos().x - call.x, foe.pos().z - call.z) < 30) {
            p.aiFoe = foe;
            commitMode(p, "fight", 8);
          }
        } else if (call) {
          const d = Math.hypot(call.x - p.pos().x, call.z - p.pos().z);
          dir.set(call.x - p.pos().x, 0, call.z - p.pos().z);
          // Al llegar: pelear con la amenaza reportada (o el enemigo más cercano)
          const foe = hf && hf.pos().distanceTo(p.pos()) < 40 ? hf : enemy;
          if (d < 22 && foe) {
            p.aiFoe = foe;
            commitMode(p, "fight", 12);
          }
        }
      }
    } else if (p.aiMode === "camp") {
      if (p.aiCampX == null) {
        const spot = pickHideSpot(p, people, homeZ);
        p.aiCampX = spot.x;
        p.aiCampZ = spot.z;
      }
      goal = { x: p.aiCampX, z: p.aiCampZ };
      const cd = Math.hypot(p.aiCampX - p.pos().x, p.aiCampZ - p.pos().z);
      if (cd > 5) dir.set(p.aiCampX - p.pos().x, 0, p.aiCampZ - p.pos().z);
      else {
        dir.set(0, 0, 0);
        p.duckHold();
        if (kiFrac < 0.85 && !isWater(p.pos().x, p.pos().z)) p.aiCharge = true;
      }
    } else if (p.aiMode === "ball" && ball) {
      const bx = ball.mesh.position.x;
      const bz = ball.mesh.position.z;
      goal = { x: bx, z: bz };
      const dBall = Math.hypot(bx - p.pos().x, bz - p.pos().z);
      if (dBall < 170 || Math.abs(bz - p.pos().z) < 95) dir.set(bx - p.pos().x, 0, bz - p.pos().z);
      else {
        const wp = sideWaypoint(p, bx, bz);
        const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
        dir.set(hs.x, 0, hs.z);
      }
    } else if (p.aiMode === "charge") {
      dir.set(0, 0, 0);
      p.aiCharge = true;
    } else {
      if (p.aiWander <= 0 || p.aiWanderX == null) {
        p.aiWanderPhase = (p.aiWanderPhase || 0) + 1;
        const wt = pickWanderTarget(p, homeZ, enemyZ);
        p.aiWanderX = wt.x;
        p.aiWanderZ = wt.z;
        p.aiWander = 7 + seed(p) * 5;
      }
      {
        const wx = p.aiWanderX;
        const wz = p.aiWanderZ;
        goal = { x: wx, z: wz };
        if (Math.abs(p.pos().x) < 120 && Math.hypot(wx - p.pos().x, wz - p.pos().z) > 40) {
          const wp = sideWaypoint(p, wx, wz);
          dir.set(wp.x - p.pos().x, 0, wp.z - p.pos().z);
        } else dir.set(wx - p.pos().x, 0, wz - p.pos().z);
      }
      if (dir.lengthSq() < 140) p.aiWander = 0;
      else if ((mood.front < -0.28 || lowHp) && !huntCarrier) {
        const home = sideSteer(p, 0, homeZ);
        dir.set(home.x, 0, home.z);
      }
      // Memoria de portador: tiros de hostigamiento sin entrar en fight
      if (
        !carrying &&
        (p.aiMemT || 0) > 0 &&
        mood.ki > 0.25 &&
        (p.cooldown || 0) <= 0
      ) {
        for (const o of people) {
          if (o.dead || o.faccion === p.faccion || o.esfera == null) continue;
          const d = o.pos().distanceTo(p.pos());
          const rng = powerStyle(p.nombre, p.faccion).range || 55;
          if (d < 28 || d > rng * 1.05) continue;
          if (!canSee(p, o, rng, combat.cam)) continue;
          if (Math.random() < 0.028 * dt * 60) {
            faceLock(p, o, dt, 1.8);
            p.lookWorld = { x: o.pos().x, y: o.pos().y + o.height * 0.62, z: o.pos().z };
            combat.blast(p, false, people, true);
          }
          break;
        }
      }
    }
  }

  const aimX = goal ? goal.x : p.pos().x;
  const aimZ = goal ? goal.z : p.pos().z;
  let shipGate = false;
  {
    const pos = p.pos();
    const own = p.faccion;
    const foeFac = own === "z" ? "f" : "z";
    const wantFoe =
      raiding ||
      (ball && (ball.inBase === foeFac || shipDist(ball.mesh.position, foeFac) < BASE_INNER_R + 8));
    const aimP = { x: aimX, z: aimZ };
    const hasAim = Math.hypot(aimX - pos.x, aimZ - pos.z) > 0.5;
    const aimFac = !hasAim ? null : inShipBase(aimP, own) ? own : inShipBase(aimP, foeFac) ? foeFac : null;
    const meFac = inShipBase(pos, own) ? own : inShipBase(pos, foeFac) ? foeFac : null;
    let fac = null;
    let goal = null;
    if (!carrying && inShipBase(pos, own) && (p.aiLeaveBase || 0) > 0) {
      fac = own;
      goal = "exit";
    } else if (carrying && inShipBase(pos, foeFac)) {
      fac = foeFac;
      goal = "exit";
    } else if (carrying) {
      fac = own;
      goal = "deposit";
    } else if (wantFoe && (inShipBase(pos, foeFac) || shipDist(pos, foeFac) < 160)) {
      fac = foeFac;
      goal = inShipBase(pos, foeFac) ? "enter" : "enter";
    } else if (meFac && aimFac === meFac) {
      p.aiShipExit = null;
    } else if (p.aiShipExit || meFac) {
      // Dentro de una nave sin motivo: salir por la puerta sí o sí, y no soltar hasta estar bien afuera
      // (si se suelta en el umbral, el objetivo lo vuelve a meter y queda girando en la puerta).
      fac = p.aiShipExit || (inShipBase(pos, own) ? own : foeFac);
      p.aiShipExit = fac;
      goal = "exit";
    } else if (aimFac && shipDist(pos, aimFac) < 160) {
      fac = aimFac;
      goal = "enter";
    }
    if (p.aiShipExit && (goal !== "exit" || shipDist(pos, p.aiShipExit) > BASE_HULL_R + 8)) p.aiShipExit = null;
    if ((p.aiLeaveBase || 0) > 0) {
      p.aiLeaveBase -= dt;
      if (!inShipBase(pos, own) && shipDist(pos, own) > BASE_INNER_R + 12) p.aiLeaveBase = 0;
    }
    if (fac) {
      if (goal === "enter" && inShipBase(pos, fac) && ball) {
        dir.set(ball.mesh.position.x - pos.x, 0, ball.mesh.position.z - pos.z);
        shipGate = true;
      } else {
        const nav = steerShipNav(pos.x, pos.z, fac, goal);
        if (nav) {
          dir.set(nav.x, 0, nav.z);
          shipGate = true;
        }
      }
    }
    if (!shipGate && !meFac && (p.flyAlt || 0) < 24 && dir.lengthSq() > 0.01) {
      const L = Math.min(70, Math.max(15, hasAim ? Math.hypot(aimX - pos.x, aimZ - pos.z) : 40)) / dir.length();
      const around = steerAroundShips(pos.x, pos.z, pos.x + dir.x * L, pos.z + dir.z * L);
      if (around) dir.set(around.x, 0, around.z);
    }
  }

  {
    const pos = p.pos();
    // En agua: priorizar orilla (nadando) o despegue si hay ki.
    // También si llevan esfera — antes solo !carrying y se ahogaban con botín.
    if (isWater(pos.x, pos.z) && (p.flyAlt || 0) < 0.35 && !shipGate) {
      const deepBall =
        ball &&
        !ball.held &&
        isWater(ball.mesh.position.x, ball.mesh.position.z) &&
        pos.y > ball.mesh.position.y + 1.2 &&
        Math.hypot(ball.mesh.position.x - pos.x, ball.mesh.position.z - pos.z) < 28;
      const flyKi = band.fly || 0.45;
      const canAir = p.s.ki > 22 && p.s.ki / Math.max(1, p.s.kiMax) >= flyKi;
      if (deepBall || (p.aiMode === "ball" && ball && pos.y > ball.mesh.position.y + 0.8)) {
        p.aiWetPlan = "dive";
        p.aiWetT = Math.max(p.aiWetT || 0, 1.8);
      } else if (canAir) {
        // Preferir salir volando: forzar plan aéreo un rato.
        p.aiWetPlan = "air";
        p.aiWetT = Math.max(p.aiWetT || 0, 2.2);
        p.aiFlyHold = Math.max(p.aiFlyHold || 0, 0.35);
      } else {
        const d = seekShore(pos.x, pos.z);
        const dd = Math.hypot(d.x - pos.x, d.z - pos.z);
        if (dd > 2) {
          // Mezclar con el rumbo actual para no cancelar deliver/ball del todo.
          const sx = d.x - pos.x;
          const sz = d.z - pos.z;
          if (dir.lengthSq() < 0.04) dir.set(sx, 0, sz);
          else {
            dir.normalize();
            dir.x = dir.x * 0.25 + (sx / dd) * 0.75;
            dir.z = dir.z * 0.25 + (sz / dd) * 0.75;
          }
        }
      }
    }
  }

  const pos = p.pos();
  // Distancia real al objetivo del modo actual: la usa applyLoco para decidir
  // si vale la pena volar/correr. (aim* es el punto al que apunta cada modo.)
  const goalDist = Math.hypot(aimX - pos.x, aimZ - pos.z);
  if (p._aiSuper) tickAiSuper(p, combat, people, foe, dt);

  const chargingHard = p.aiMode === "charge" || ((p.aiChargeTo || 0) > 0 && kiFrac < p.aiChargeTo);

  const locoOut = applyLoco(
    p,
    dir,
    {
      band,
      goalDist,
      baseDist,
      carrying,
      fighting,
      sniping,
      chargingHard,
      mode: p.aiMode,
      enemy,
      enemyDist,
      enemyCarrier: !!(enemy && enemy.esfera != null),
      homeZ,
      hasBallGoal: !!ball,
      shipGate,
    },
    dt
  );

  const grabbing = !!(balls.near(p) || p._grabbing);
  if (grabbing) {
    if (p.inSwim?.()) p.descend();
    else if ((p.flyAlt || 0) > 0.08) p.descend();
    flushAiMove(p);
    p.tryGrab(balls, dt, match);
    p.stickY();
    aiTraceTick(p, match, {
      mode: p.aiMode,
      pick,
      role,
      loco: locoOut.loco,
      charge: 0,
      flyAlt: p.flyAlt || 0,
      ki: kiFrac,
      hp: mood.hp,
      x: p.pos().x,
      z: p.pos().z,
      goalDist,
      foe: foe?.nombre || "",
      foeDist: foe ? enemyDist : "",
      carry: carrying ? 1 : 0,
      ball: ball ? ball.n : "",
      ship: shipGate ? 1 : 0,
      groundLock: p.aiGroundLock || 0,
      notes: "grab",
    }, dt);
    p.aiDbg = {
      role,
      mode: p.aiMode,
      pick,
      loco: locoOut.loco,
      charge: 0,
      run: 0,
      fly: 0,
      foe: foe?.nombre || "",
      foeDist: foe ? Math.round(enemyDist) : "",
      ball: ball ? ball.n : "",
      ship: shipGate ? 1 : 0,
      gLock: Math.round(p.aiGroundLock || 0),
      modeT: Math.round(p.aiModeT || 0),
      wet: p.aiWetPlan || "",
      unstick: "grab",
    };
    return;
  }

  const forceLocoMove = !p._aiSuper && (shipGate || locoOut.loco === "shipDoor" || !fighting || !locoOut.allowFight);
  if (!p._aiSuper && shipGate && dir.lengthSq() > 0.04) {
    dir.normalize();
    const x = p.mesh.position.x;
    const shipFac = nearAnyShip(p.pos(), 18);
    const inDoorLane =
      shipFac && Math.abs(x) < 9 && (p.pos().z - baseOrigin(shipFac).z) * baseDoorDir(shipFac) > BASE_INNER_R - 10;
    if (Math.abs(x) > 1.2 && inDoorLane)
      p.mesh.position.x += -x * Math.min(1, (p._aiFrameDt ?? dt) * 4.5);
    p.yaw = Math.atan2(dir.x, dir.z);
    aiMove(p, dir, true, dt);
  } else if (forceLocoMove && dir.lengthSq() > 0.25) {
    dir.normalize();
    smoothYaw(p, Math.atan2(dir.x, dir.z), dt, 3.8);
    const moveDir = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    moveDir.lerp(dir, 0.4).normalize();
    aiMove(p, moveDir, locoOut.run, dt);
  }
  flushAiMove(p);

  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  if (!p._aiSuper && locoOut.canCharge && !shipGate) p.charge(dt);
  p.stickY();

  // DEBUG UI: snapshot del tick (sacar cuando no haga falta)
  p.aiDbg = {
    role,
    mode: p.aiMode,
    pick,
    loco: locoOut.loco,
    charge: locoOut.canCharge ? 1 : 0,
    run: locoOut.run ? 1 : 0,
    fly: locoOut.wantFly ? 1 : 0,
    foe: foe?.nombre || "",
    foeDist: foe ? Math.round(enemyDist) : "",
    ball: ball ? ball.n : "",
    ship: shipGate ? 1 : 0,
    gLock: Math.round(p.aiGroundLock || 0),
    modeT: Math.round(p.aiModeT || 0),
    wet: p.aiWetPlan || "",
    unstick: p.aiBreak || "",
    join: p.aiJoinKind || "",
    carryStyle: carrying ? p.aiCarryStyle || "" : "",
    call: [...tb.helps.map((c) => `help ${c.taken}/${c.slots}`), ...tb.raids.map((r) => `raid ${r.taken}/${r.slots} ${r.phase}`), tb.guard?.slots && `guard ${tb.guard.taken}/${tb.guard.slots}`]
      .filter(Boolean)
      .join(" | "),
  };

  aiTraceTick(p, match, {
    mode: p.aiMode,
    pick,
    role,
    loco: locoOut.loco,
    charge: locoOut.canCharge ? 1 : 0,
    flyAlt: p.flyAlt || 0,
    ki: kiFrac,
    hp: mood.hp,
    x: p.pos().x,
    z: p.pos().z,
    goalDist,
    foe: foe?.nombre || "",
    foeDist: foe ? enemyDist : "",
    carry: carrying ? 1 : 0,
    ball: ball ? ball.n : "",
    ship: shipGate ? 1 : 0,
    groundLock: p.aiGroundLock || 0,
    notes: [
      locoOut.wantFly ? "wantFly" : "",
      fighting ? "fightAct" : "",
      grabbing ? "grab" : "",
    ]
      .filter(Boolean)
      .join(";"),
  }, dt);
}
