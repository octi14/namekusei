import * as THREE from "three";
import { BASE_Z, superRank, SUPER_KI, MELEE } from "./config.js";
import { isWater, groundHeight, WATER_Y } from "./world.js";
import { BASE_INNER_R, steerShipNav, nearAnyShip, shipDist, inShipBase } from "./bases.js";
import { powerStyle } from "./powers.js";
import { aiTraceTick } from "./aiTrace.js";

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
 *   - Pedidos de equipo (help/defend/raid) + camp     → blackboard teamBoard().
 *   - Cupos: HELP_SLOTS / DEFEND_SLOTS / RAID_SLOTS / RAID_MAX_ACTIVE.
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
  const free = balls.items.filter((b) => !b.held && b.inBase !== p.faccion && !isWater(b.mesh.position.x, b.mesh.position.z));
  if (!free.length) {
    p.aiBall = null;
    return null;
  }
  const cur = ballByN(balls, p.aiBall);
  if (cur && !cur.held && cur.inBase !== p.faccion && !isWater(cur.mesh.position.x, cur.mesh.position.z)) {
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
function pickFoe(p, people, maxD, homeZ) {
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
    const s = d - (o.esfera != null ? 40 : 0) - (dHome < 90 ? 35 : 0) - ((o.flyAlt || 0) > 5 ? 12 : 0);
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

function pickSnipeFoe(p, people, rng) {
  let best = null;
  let bestS = 1e9;
  for (const o of people) {
    if (o.faccion === p.faccion || o.dead) continue;
    const d = o.pos().distanceTo(p.pos());
    if (d < 32 || d > rng * 0.95) continue;
    const s = d * 0.35 - (o.esfera != null ? 50 : 0) - ((o.flyAlt || 0) > 4 ? 18 : 0);
    if (s < bestS) {
      bestS = s;
      best = o;
    }
  }
  return best;
}

function canSnipe(p) {
  const r = powerStyle(p.nombre, p.faccion).range || 55;
  return r >= 88 || seed(p) > 0.84;
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

function aiMove(p, dir, run, dt) {
  if (dir.lengthSq() < 1e-6) return;
  const body = senseBody(p);
  const inWater = body.swimming || (body.overWater && !body.flying);
  p.move(dir.clone().normalize(), !!run && !inWater, dt);
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
  if (ctx.carrying || ctx.sniping || atShip || threatNear) p.aiCharge = false;
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
    p.aiLaneX = (s > 0.5 ? 1 : -1) * (240 + s * 320);
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
  if (Math.abs(wx) < 70 && zDist > 55) wx = Math.sign(lane || 1) * 160;
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
  const off = dist > 12 ? 0.85 : dist > 5 ? 0.55 : 0.2;
  return direct + side * off;
}

function allyById(people, id) {
  return people.find((o) => o.id === id) || null;
}

function smoothYaw(p, wantYaw, dt, rate = 4.2) {
  let dy = wantYaw - p.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  p.yaw += dy * Math.min(1, rate * dt);
}

function commitMode(p, mode, sec) {
  p.aiMode = mode;
  p.aiModeT = sec;
}

/**
 * Elige el modo comparando puntajes (gana el más alto).
 * AJUSTE: acá se decide "qué le da más ganas". Incluye pedidos de equipo
 * (helpCall / defendCall / raidCall) y modo camp para guardias.
 */
function utilBest(p, ctx) {
  const {
    mood,
    carrying,
    enemy,
    enemyDist,
    enemyCarrier,
    ball,
    help,
    loot,
    needCharge,
    inHomeAir,
    lowHp,
    critHp,
    agg,
    defend,
    role,
    helpCall,
    defendCall,
    raidCall,
    idleish,
    hideOk,
  } = ctx;
  // Con esfera: deliver fuerte, pero fight/hide pueden ganar si hay amenaza.
  const sticky = (m) => {
    if (p.aiMode !== m) return 0;
    if (m === "wander") return 0;
    if (m === "help") return 30;
    if (m === "raid") return 8;
    if (m === "camp") return 12;
    if (m === "ball") return 30;
    if (m === "charge") return 15;
    if (m === "fight") return 25;
    if (m === "deliver") return 28;
    if (m === "hide") return 16;
    return 20;
  };
  const rows = [];
  let deliverS = carrying ? 52 + sticky("deliver") : -50;
  if (carrying && p.aiCarryStyle === "sneak") deliverS += 8;
  if (carrying && (p.aiCarryHold || 0) > 0) deliverS -= 18;
  rows.push(["deliver", deliverS]);
  let fight = -40;
  if (enemy && (!critHp || enemyCarrier || carrying)) {
    fight = (enemyCarrier ? 80 : 30) + Math.max(0, 48 - enemyDist) * 0.55 + sticky("fight");
    if (enemyCarrier && enemyDist < 80) fight += 36;
    if (enemyDist < 50 && mood.ki > 0.12) fight += 22 + agg * 8;
    if (enemyDist < 25 && mood.ki > 0.08) fight += 20;
    if (defend || defendCall) {
      fight += 40 + (enemyCarrier ? 22 : 10) + Math.max(0, 0.55 - agg) * 18;
      if (inHomeAir) fight += 16;
    }
    if (role === "aggro") fight += 20;
    if (role === "guard" && (defend || inHomeAir || defendCall)) fight += 16;
    if (lowHp && !enemyCarrier && !carrying) fight -= 22;
    if (carrying) {
      // AJUSTE: pelear con esfera — solo si está cerca y el estilo lo permite
      if (p.aiCarryStyle === "rush") fight -= 35;
      else if (p.aiCarryStyle === "sneak") fight -= 28;
      else fight += 6 + agg * 10; // fight style
      if (enemyDist > 28) fight -= 22;
      if (enemyDist < 16) fight += 18;
      if ((p.aiCarryHold || 0) > 0) fight += 20;
      if (mood.ki < 0.12) fight -= 14;
    }
  }
  rows.push(["fight", fight]);
  let hideS = -40;
  if (
    hideOk ||
    (carrying &&
      enemy &&
      enemyDist < 40 &&
      (p.aiCarryStyle === "sneak" ||
        p.aiCarryStyle === "fight" ||
        (p.aiCarryHold || 0) > 0 ||
        mood.front < -0.1 ||
        lowHp))
  ) {
    hideS = 12 + sticky("hide") + (lowHp ? 10 : 0) + (carrying && p.aiCarryStyle === "sneak" ? 14 : 0);
    if (carrying && p.aiCarryStyle === "fight" && mood.front < 0.15) hideS += 8;
    if (carrying && enemyDist < 20) hideS += 10;
  }
  rows.push(["hide", hideS]);
  let ballS = -30;
  if (ball && !carrying) {
    const d = Math.hypot(ball.mesh.position.x - p.pos().x, ball.mesh.position.z - p.pos().z);
    ballS = 56 - d * 0.035 + sticky("ball") + (inHomeAir ? 10 : 0);
    if (defend || defendCall) ballS -= 35;
    if (role === "baller") ballS += 16;
    if (role === "guard" && !defend) ballS -= 6;
  }
  rows.push(["ball", ballS]);
  let helpS = -40;
  if (!carrying) {
    if (help) helpS = 16 + sticky("help") + (role === "guard" ? 10 : 0);
    if (helpCall && helpCall.taken < helpCall.slots) {
      const hd = Math.hypot(helpCall.x - p.pos().x, helpCall.z - p.pos().z);
      helpS = Math.max(
        helpS,
        22 + sticky("help") - hd * 0.04 + (idleish ? 14 : 0) + (role === "aggro" ? 6 : 0)
      );
    }
  }
  rows.push(["help", helpS]);
  let raidS = -40;
  if (!carrying && loot.length && !lowHp && !defend) {
    raidS = 14 + sticky("raid") + (role === "aggro" ? 10 : 0);
    if (role === "guard") raidS -= 20;
    if (raidCall && raidCall.taken < raidCall.slots && idleish) raidS += 24;
    if (p.aiJoinKind === "raid") raidS += 18;
  }
  rows.push(["raid", raidS]);
  let campS = -40;
  if (!carrying && role === "guard" && inHomeAir && !defend && !defendCall && !critHp && !enemyCarrier) {
    campS = 18 + sticky("camp") + (mood.ki > 0.4 ? 4 : 0) - (ball ? 8 : 0);
  }
  rows.push(["camp", campS]);
  let chargeS =
    !carrying && needCharge && !(p.aiMode === "fight" && enemyDist < 28) && !defend
      ? 34 + (0.6 - mood.ki) * 36 + sticky("charge")
      : 0;
  if (enemy && enemyDist < 48) chargeS -= 42;
  if (enemy && enemyDist < 34 && mood.ki > 0.08) chargeS -= 28;
  if (defend || defendCall) chargeS -= 44;
  if (helpCall && helpCall.taken < helpCall.slots) chargeS -= 18;
  if (role === "aggro") chargeS -= 8;
  rows.push(["charge", chargeS]);
  rows.push([
    "wander",
    carrying
      ? -40
      : -6 - (inHomeAir ? 12 : 0) - (ball ? 14 : 0) - (defend ? 18 : 0) + sticky("wander"),
  ]);
  let best = carrying ? "deliver" : "wander";
  let bestV = -1e9;
  for (const [k, v] of rows) {
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
    if (isWater(x, z)) continue;
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
  return { x: bx, z: bz };
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

function escortCount(carrier, people, ignore) {
  let n = 0;
  for (const o of people) {
    if (o === ignore || o === carrier || o.dead || o.faccion !== carrier.faccion) continue;
    if (o.esfera != null) continue;
    // Solo contar a quienes explícitamente escoltan a este portador
    if (o.aiMode === "help" && o.aiHelpId === carrier.id) n++;
  }
  return n;
}

const MAX_ESCORTS = 2;

// AJUSTE cupos de pedidos de equipo (blackboard por facción).
const HELP_SLOTS = 2; // refuerzos a pelea / pedido de ayuda
const DEFEND_SLOTS = 3; // refuerzos a base
const RAID_SLOTS = 3; // integrantes por raid anunciado
const RAID_MAX_ACTIVE = 3; // raids concurrentes (antes era 1)

const _teamBoard = { z: null, f: null };
function teamBoard(fac) {
  if (!_teamBoard[fac]) _teamBoard[fac] = { help: null, defend: null, raid: null };
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

function refreshCall(call, people, fac, dt) {
  if (!call) return null;
  call.t = (call.t || 0) - dt;
  if (call.t <= 0) return null;
  const who = people.find((o) => o.id === call.fromId);
  if (!who || who.dead) return null;
  // help sigue al que pidió; defend/raid mantienen el punto anclado
  if (call.kind === "help") {
    call.x = who.pos().x;
    call.z = who.pos().z;
  }
  call.taken = countJoiners(people, fac, call.id);
  return call;
}

function emitTeamCall(fac, kind, from, slots, life, extra = {}) {
  const b = teamBoard(fac);
  const cur = b[kind];
  if (cur && cur.fromId === from.id) {
    cur.t = Math.max(cur.t, life);
    cur.x = from.pos().x;
    cur.z = from.pos().z;
    Object.assign(cur, extra);
    return cur;
  }
  // No pisar un pedido ajeno todavía fresco y con cupo.
  if (cur && cur.t > 2.5 && cur.taken < cur.slots) return cur;
  const id = `${kind}:${from.id}:${Math.floor(performance.now() % 1e7)}`;
  b[kind] = {
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
  return b[kind];
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

function allyToHelp(p, people) {
  if (p.aiHelpId) {
    const cur = allyById(people, p.aiHelpId);
    if (cur && !cur.dead && cur.faccion === p.faccion && cur.esfera != null
        && escortCount(cur, people, p) < MAX_ESCORTS) return cur;
    p.aiHelpId = null;
  }
  let best = null;
  let bestD = 1e9;
  for (const o of people) {
    if (o === p || o.dead || o.faccion !== p.faccion || o.esfera == null) continue;
    if (escortCount(o, people, p) >= MAX_ESCORTS) continue;
    let threat = false;
    for (const e of people) {
      if (e.dead || e.faccion === p.faccion) continue;
      if (e.pos().distanceTo(o.pos()) < 42) {
        threat = true;
        break;
      }
    }
    if (!threat) continue;
    const d = o.pos().distanceTo(p.pos());
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (best) p.aiHelpId = best.id;
  return best;
}

/**
 * Si el personaje casi no avanza en XZ (o flota en el mismo sitio), fuerza un
 * plan simple unos segundos.
 * AJUSTE: mide cada 0.85 s; `lim` es el avance mínimo esperado en ese rato
 * (5.5 volando, 9 junto a una nave, 3.2 en tierra). El contador `_stkT` dispara
 * pickUnstick() cuando pasa de 2.0 s (ver aiTick).
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
  const lim = hovering ? 5.5 : nearShip ? 9 : 3.2;
  if (prog < lim) p._stkT = (p._stkT || 0) + window;
  else p._stkT = Math.max(0, (p._stkT || 0) - window * 1.35);
}

function pickUnstick(p, balls) {
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const baseDist = Math.hypot(p.pos().x, p.pos().z - homeZ);
  // AJUSTE: segundos que dura el plan de desatasco (5.5-8) antes de volver a
  // pensar normal. aiBreak elige el tipo de escape: home/land/ball/leave.
  p.aiUnstick = 5.5 + seed(p) * 2.5;
  p.aiFight = 0;
  p.aiCharge = false;
  p.aiRaid = 0;
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
  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  p.stickY();
  if (p.aiUnstick <= 0) p._stkT = 0;
}

export function aiTick(p, people, balls, combat, match, dt) {
  if (p.controller !== "ia" || p.dead) return;
  tickStuck(p, dt);
  // AJUSTE: 2.0 = segundos sin avanzar que se toleran antes de forzar desatasco.
  if ((p._stkT || 0) > 2.0 && (p.aiUnstick || 0) <= 0) pickUnstick(p, balls);
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
  p.aiRaid = Math.max(0, (p.aiRaid || 0) - dt);
  p.aiCarry = Math.max(0, (p.aiCarry || 0) - dt);
  p.aiModeT = Math.max(0, (p.aiModeT || 0) - dt);
  // Reset modos viejos que ya no usa la IA simple
  if (p.aiMode === "snipe" || p.aiMode === "hide") {
    p.aiMode = "wander";
    p.aiModeT = 0;
  }
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
  // Esconderse: también válido con esfera (sneak/fight bajo presión)
  const hideOk =
    (critHp || (lowHp && mood.hp < 0.24 && (agg < 0.35 || mood.front < -0.2)) || carrying) &&
    (p.aiMode === "hide" ||
      critHp ||
      agg < 0.35 ||
      mood.front < -0.15 ||
      (carrying && (p.aiCarryStyle === "sneak" || p.aiCarryStyle === "fight" || (p.aiCarryHold || 0) > 0)));
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const enemyZ = -homeZ;
  const baseDist = Math.hypot(p.pos().x, p.pos().z - homeZ);
  const nearOwnBase = baseDist < BASE_INNER_R + 2;
  const inHomeAir = baseDist < (mood.front < -0.2 ? 90 : 70) || (role === "guard" && baseDist < 110);
  const kiFrac = mood.ki;
  const band = kiBand(p);

  const loot = balls.items.filter((b) => !b.held && b.inBase && b.inBase !== p.faccion);
  const tb = teamBoard(p.faccion);
  tb.help = refreshCall(tb.help, people, p.faccion, dt);
  tb.defend = refreshCall(tb.defend, people, p.faccion, dt);
  tb.raid = refreshCall(tb.raid, people, p.faccion, dt);
  // Limpiar join si el pedido ya no existe.
  if (p.aiJoin && ![tb.help?.id, tb.defend?.id, tb.raid?.id].includes(p.aiJoin)) clearJoin(p);

  if (carrying || !loot.length || lowHp) p.aiRaid = 0;
  // AJUSTE raid: hasta RAID_MAX_ACTIVE anunciados; el líder emite call para sumar idle.
  else if (p.aiRaid <= 0 && (role === "aggro" || agg > 0.55) && !carrying && Math.random() < 0.004 * dt * 60) {
    let nRaid = 0;
    for (const o of people) if (o.faccion === p.faccion && (o.aiRaid || 0) > 0) nRaid++;
    if (nRaid < RAID_MAX_ACTIVE) {
      p.aiRaid = 16 + agg * 10;
      p.aiRaidX = (seed(p) > 0.5 ? 1 : -1) * (85 + agg * 90);
      emitTeamCall(p.faccion, "raid", p, RAID_SLOTS, 18);
    }
  }

  if (carrying) {
    p.aiRaid = 0;
    p.aiHelpId = null;
    p.aiCharge = false;
    // No forzar deliver siempre: pelear/hide pueden ganar en utilBest.
    if (!p.aiMode || (p.aiMode !== "fight" && p.aiMode !== "hide" && p.aiMode !== "deliver")) {
      commitMode(p, "deliver", 12 + seed(p) * 6);
    }
  }

  if (p.aiFoe && (p.aiFoe.s.hp <= 0 || p.aiFoe.dead || p.aiFoe.pos().distanceTo(p.pos()) > (p.aiMode === "snipe" ? 170 : p.aiMode === "fight" ? 95 : 42))) p.aiFoe = null;
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
  const defend =
    !!(
      (threat || memDefend) &&
      !carrying &&
      !critHp &&
      (inHomeAir || baseDist < 300 || role === "guard" || (threat && threat.esfera != null && baseDist < 300))
    );
  const snipeFoe = sniper && kiFrac > 0.38 && !critHp && nSnipe < 2 ? pickSnipeFoe(p, people, powerStyle(p.nombre, p.faccion).range || 90) : null;
  // AJUSTE foeRange con esfera: rush ve poco; fight/aggro más lejos.
  const foeRange = carrying
    ? p.aiCarryStyle === "fight" || role === "aggro" || mood.front > 0.2
      ? 42
      : p.aiCarryStyle === "sneak"
        ? 22
        : 18
    : p.aiMode === "fight" || defend
      ? 130
      : inHomeAir
        ? 95
        : 100;
  let enemy = pickFoe(p, people, foeRange, homeZ) || (p.aiMode === "snipe" ? snipeFoe : null);
  if (threat && defend) {
    const td = threat.pos().distanceTo(p.pos());
    if (!enemy || threat.esfera != null || td < (enemy ? enemy.pos().distanceTo(p.pos()) : 1e9) + 25) enemy = threat;
  } else if (!enemy && (p.aiMemT || 0) > 0 && p.aiMemCx != null && !carrying) {
    // Memoria: último portador visto → perseguir zona
    const md = Math.hypot(p.aiMemCx - p.pos().x, p.aiMemCz - p.pos().z);
    if (md < 140) {
      for (const o of people) {
        if (o.dead || o.faccion === p.faccion || o.esfera == null) continue;
        if (o.pos().distanceTo(p.pos()) < 110) {
          enemy = o;
          break;
        }
      }
    }
  }
  if (enemy && enemy.esfera != null) {
    p.aiMemCx = enemy.pos().x;
    p.aiMemCz = enemy.pos().z;
    p.aiMemT = 5;
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
  if (!carrying && threat && (defend || role === "guard" || inHomeAir || baseDist < 220)) {
    const c = emitTeamCall(p.faccion, "defend", p, DEFEND_SLOTS, 8, { foeId: threat.id });
    if (c) {
      c.x = threat.pos().x;
      c.z = threat.pos().z;
    }
  }

  const helpCand = !carrying ? allyToHelp(p, people) : null;
  const ballCand = !carrying ? claimBall(p, people, balls, dt) : null;
  const idleish =
    p.aiMode === "wander" ||
    p.aiMode === "charge" ||
    p.aiMode === "camp" ||
    !p.aiMode ||
    (p.aiModeT || 0) < 0.2;
  const helpCall =
    tb.help && tb.help.fromId !== p.id && tb.help.taken < tb.help.slots ? tb.help : null;
  const defendCall =
    tb.defend && tb.defend.fromId !== p.id && tb.defend.taken < tb.defend.slots ? tb.defend : null;
  const raidCall =
    tb.raid && tb.raid.fromId !== p.id && tb.raid.taken < tb.raid.slots ? tb.raid : null;

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

  const pick = utilBest(p, {
    mood,
    carrying,
    enemy,
    enemyDist,
    enemyCarrier,
    ball: ballCand,
    help: helpCand,
    loot,
    needCharge,
    inHomeAir,
    lowHp,
    critHp,
    agg,
    snipeOk,
    hideOk,
    baseThreat: threat,
    defend,
    role,
    helpCall,
    defendCall,
    raidCall,
    idleish,
  });
  const hardFight =
    pick === "fight" &&
    enemy &&
    !(p.aiShipJob && p.aiShipJob.t > 0) &&
    shipDist(p.pos(), p.faccion) > BASE_INNER_R + 22 &&
    shipDist(p.pos(), p.faccion === "z" ? "f" : "z") > BASE_INNER_R + 22;
  const hard =
    (carrying && pick === "deliver" && p.aiMode !== "deliver" && p.aiMode !== "fight" && p.aiMode !== "hide") ||
    (pick === "deliver" && carrying) ||
    (hardFight && (carrying ? enemyDist < 22 : enemyCarrier && enemyDist < 58)) ||
    (hardFight && enemyDist < 15) ||
    (defend && hardFight && enemyDist < 32) ||
    (pick === "hide" && carrying && enemy) ||
    (pick === "ball" && role === "baller" && ballCand && (p.aiMode === "wander" || p.aiMode === "charge"));
  if (hard || (p.aiModeT || 0) <= 0) {
    if (pick === "hide") {
      const spot = pickHideSpot(p, people, homeZ);
      p.aiHideX = spot.x;
      p.aiHideZ = spot.z;
      p.aiFight = 0;
      p.aiFoe = null;
      // 20 segundos
      commitMode(p, "hide", 20 + (1 - agg) * 2.2);
    } else if (pick === "snipe") {
      p.aiFoe = snipeFoe || p.aiFoe || enemy;
      const nest = pickNest(p, p.aiFoe);
      p.aiNestX = nest.x;
      p.aiNestZ = nest.z;
      // 10-14 segundos
      commitMode(p, "snipe", 30 + seed(p) * 4);
      // AJUSTE DURACIONES: el 2º arg de commitMode son segundos comprometidos
      // con ese modo (no lo reevalúa hasta que se agote, salvo `hard` de arriba).
    } else if (pick === "fight" && enemy) {
      p.aiFoe = enemy;
      p.aiFight = 5 + agg * 2.8 + Math.max(0, mood.front) * 2;
      if (carrying) {
        // Pedido de ayuda al pelear con esfera
        emitTeamCall(p.faccion, "help", p, HELP_SLOTS, 7, { foeId: enemy.id });
      }
      commitMode(p, "fight", random(15, 22) + agg * 3); // pelea 15-25 s
    } else if (pick === "deliver" && carrying) {
      commitMode(p, "deliver", random(14, 28));
    } else if (pick === "deliver") commitMode(p, "deliver", random(60, 100)); // llevar esfera
    else if (pick === "help") {
      if (helpCand) {
        /* escolta portador — aiHelpId ya seteado */
      } else if (helpCall && tryJoinCall(p, helpCall, people)) {
        /* refuerzo a pedido de ayuda */
      } else if (defendCall && tryJoinCall(p, defendCall, people)) {
        /* refuerzo a defensa */
      }
      commitMode(p, "help", 10 + seed(p) * 3);
    } else if (pick === "camp") {
      clearJoin(p);
      if (p.aiCampX == null || Math.hypot((p.aiCampX || 0) - p.pos().x, (p.aiCampZ || 0) - p.pos().z) > 55) {
        const spot = pickHideSpot(p, people, homeZ);
        p.aiCampX = spot.x;
        p.aiCampZ = spot.z;
      }
      commitMode(p, "camp", 14 + seed(p) * 6);
    } else if (pick === "ball") commitMode(p, "ball", 14 + seed(p) * 4); // buscar esfera
    else if (pick === "raid") {
      p.aiRaid = Math.max(p.aiRaid || 0, 12);
      if (raidCall) tryJoinCall(p, raidCall, people);
      else emitTeamCall(p.faccion, "raid", p, RAID_SLOTS, 18);
      commitMode(p, "raid", 30); // asalto a base enemiga
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
  if (p.aiMode === "fight" && enemy) p.aiFoe = enemy;
  if (p.aiMode === "snipe" && (snipeFoe || p.aiFoe)) p.aiFoe = snipeFoe || p.aiFoe;

  let dir = new THREE.Vector3();
  let ball = ballCand;
  let help = helpCand;
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
  if (carrying && p.aiMode === "hide") {
    if (p.aiHideX == null) {
      const spot = pickHideSpot(p, people, homeZ);
      p.aiHideX = spot.x;
      p.aiHideZ = spot.z;
    }
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
      // rush (default)
      const nav = steerShipNav(p.pos().x, p.pos().z, p.faccion, "deposit");
      if (nav) dir.set(nav.x, 0, nav.z);
      else {
        const home = steerHome(p.pos().x, p.pos().z, homeZ);
        dir.set(home.x, 0, home.z);
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
    const nd = Math.hypot(p.aiNestX - p.pos().x, p.aiNestZ - p.pos().z);
    const dist = foe.pos().distanceTo(p.pos());
    if (nd > 7) dir.set(p.aiNestX - p.pos().x, 0, p.aiNestZ - p.pos().z);
    else dir.set(0, 0, 0);
    faceLock(p, foe, dt, 1.8);
    if (nd < 9 && dist > 28 && dist < (powerStyle(p.nombre, p.faccion).range || 90) * 1.05 && p.s.ki > 24 && Math.random() < 0.018 * dt * 60) {
      combat.blast(p, false, people, true);
    }
  } else if (p.aiMode === "hide") {
    if (p.aiHideX == null) {
      const spot = pickHideSpot(p, people, homeZ);
      p.aiHideX = spot.x;
      p.aiHideZ = spot.z;
    }
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
  } else if (fighting && !doorBusy) {
    const dist0 = foe.pos().distanceTo(p.pos());
    if (dist0 > 42 && !huntingCarrier) {
      const wp = sideWaypoint(p, foe.pos().x, foe.pos().z);
      dir.set(wp.x - p.pos().x, 0, wp.z - p.pos().z);
    } else {
      dir.set(foe.pos().x - p.pos().x, 0, foe.pos().z - p.pos().z);
    }
    const dist = foe.pos().distanceTo(p.pos());
    const rng = powerStyle(p.nombre, p.faccion).range || 55;
    // AJUSTE: con ki > 32% prefiere pelear a distancia (tirar ki) antes que entrar.
    const preferKi = !huntingCarrier && mood.ki > 0.32 && p.s.ki > 14 && (p.cooldown || 0) <= 0;
    // AJUSTE `hold` = distancia a la que se planta (deja de acercarse).
    // Con preferKi se queda lejos; en cuerpo a cuerpo 2.6 ≈ alcance del puño
    // (el melee de combat.js llega a ~3). Subirlo hace que peguen al aire.
    const hold = preferKi
      ? Math.min(18, rng * (mood.front < 0 ? 0.34 : 0.24))
      : huntingCarrier
        ? 3.2
        : mood.ki < 0.2
          ? 3.0
          : 2.6;
    const inKiRange = dist < rng * 0.9 && dist > 2.4;
    const close = dist < 4.2;
    const wetFight = isWater(p.pos().x, p.pos().z);
    // AJUSTE: chance por segundo de "fijar" al rival (lo encara y lo orbita).
    const lockChance = (0.014 + agg * 0.022 + Math.max(0, mood.front) * 0.025) * dt * 60;
    const locked = (p.lockFoe === foe && (p.lockT || 0) > 0) || (dist < rng * 0.88 && Math.random() < lockChance);
    if (locked) faceLock(p, foe, dt, 1.35 + agg * 0.8);
    else {
      p.lockT = Math.max(0, (p.lockT || 0) - dt);
      const approachYaw = dist > 4.5 && !wetFight ? flankAngle(p, foe, dt) : Math.atan2(dir.x, dir.z);
      smoothYaw(p, approachYaw, dt, 7);
    }
    const lookYaw = Math.atan2(dir.x, dir.z);
    let dy = lookYaw - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    // AJUSTE: 0.55 rad (~31°) de tolerancia de encare para poder atacar.
    const facing = Math.abs(dy) < 0.55;
    if (dir.lengthSq() > 0.4) {
      dir.normalize();
    const side = seed(p) > 0.5 ? 1 : -1;
    const strafe = new THREE.Vector3(Math.cos(lookYaw) * side, 0, -Math.sin(lookYaw) * side);
    // AJUSTE: mezcla de avance recto vs orbitar de costado (0 = va derecho).
    const mixS = wetFight ? 0.05 : locked ? 0.35 : 0.22;
    // Retirada con poca vida (hp < 32% y sin envión); abajo, retirada por ki < 16%.
    if (mood.hp < 0.32 && mood.front < 0.1 && dist < 8 && !huntingCarrier) aiMove(p, dir.clone().multiplyScalar(-1), true, dt);
    else if (p.s.ki < p.s.kiMax * 0.16 && dist > 5 && !huntingCarrier) {
      if (dist < 12) aiMove(p, dir.clone().multiplyScalar(-1).lerp(strafe, wetFight ? 0.12 : 0.5).normalize(), true, dt);
      else if (dry) p.aiCharge = true;
      else aiMove(p, wetFight ? dir : strafe, false, dt);
    } else if (dist > hold) {
      const fd = dir.clone().lerp(strafe, mixS).normalize();
      aiMove(p, fd, dist > 8 && (mood.ki > 0.22 || huntingCarrier), dt);
    } else if (dist < hold * 0.5 && p.s.ki > 12 && preferKi && !huntingCarrier) {
      aiMove(p, dir.clone().multiplyScalar(-1).lerp(strafe, wetFight ? 0.08 : 0.4).normalize(), false, dt);
    } else if (close && (p.flyAlt || 0) > 0.35 && !wetFight) {
      if ((p.aiHover || 0) > 0) p.aiHover -= dt;
      else p.aiHover = 0.35 + seed(p) * 0.45;
      if ((p.aiHover || 0) > 0.18) aiMove(p, strafe, false, dt);
    } else if (locked && !wetFight) aiMove(p, strafe, false, dt);
    else if (wetFight && dist > 3) aiMove(p, dir, mood.ki > 0.2, dt);
    }
    // AJUSTE: probabilidad por frame de tirar ki común. Cada factor multiplica:
    // encare, actitud (front), cuánto ki tiene, si está fijado y la distancia.
    // Subí el 0.07/0.12 para que disparen más seguido.
    const blastOdds =
      (facing ? 1 : 0.15) *
      (mood.front < 0 ? 0.12 : 0.07) *
      (mood.ki > 0.42 ? 1.05 : mood.ki > 0.28 ? 0.4 : 0.08) *
      (locked ? 1.1 : 0.85) *
      ((p.flyAlt || 0) > 2 ? 0.35 : dist > 22 ? 0.45 : 0.7);
    const rank = superRank(p.s.ki, p.s.kiMax, p.s.ataque);
    const canSuper = rank >= 1;
    // AJUSTE: chance por frame de tirar el especial (necesita rank >= 1, ver
    // SUPER_KI en config.js). Rango máximo del super: dist < 52.
    const superOdds = (0.048 + agg * 0.03 + (rank >= 2 ? 0.03 : 0) + (rank >= 3 ? 0.02 : 0)) * dt * 60;
    if (canSuper && inKiRange && facing && dist < 52 && (p.cooldown || 0) <= 0 && Math.random() < superOdds) {
      combat.blast(p, true, people, dist > 40);
    } else if (
      inKiRange &&
      facing &&
      dist < 38 && // AJUSTE: alcance del ki común

      p.s.ki >= p.s.kiMax * 0.18 &&
      (p.cooldown || 0) <= 0 &&
      Math.random() < blastOdds
    ) {
      combat.blast(p, false, people, dist > 48);
    }
    // AJUSTE MELEE. meleeRange: alcance real del puño en combat.js es ~2.75-3.05,
    // más lejos es pegarle al aire. meleeOdds: chance por frame de tirar el golpe
    // (0.42 crecido / 0.28 normal pegado, 0.16 al límite del alcance); se
    // multiplica por MELEE de config.js, que es el dial global.
    const meleeRange = 3.1;
    const meleeOdds = dist < 2.6 ? (mood.front > 0.2 ? 0.42 : 0.28) : dist < meleeRange ? 0.16 : 0;
    const foeSwing = foe && (foe.posePunch || 0) > 0.05 && dist < 4.6 && facing;
    let kiIn = false;
    if ((p.flyAlt || 0) > 0.28 || p.volando) {
      for (const s of combat.shots) {
        if (s.faccion === p.faccion) continue;
        if (s.mesh.position.distanceTo(p.pos()) < 16) {
          kiIn = true;
          break;
        }
      }
    }
    if (foeSwing || kiIn) p._aiGuard = 0.32;
    else p._aiGuard = Math.max(0, (p._aiGuard || 0) - dt);
    p.guard((p._aiGuard || 0) > 0, dt);
    if (!p._blocking && dist < meleeRange && facing && Math.random() < meleeOdds * MELEE) {
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
    if (raiding) {
      const t = loot.reduce((a, b) => {
        const da = Math.hypot(a.mesh.position.x - p.pos().x, a.mesh.position.z - p.pos().z);
        const db = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
        return db < da ? b : a;
      });
      const wp = sideWaypoint(p, t.mesh.position.x, t.mesh.position.z);
      const near = Math.hypot(t.mesh.position.x - p.pos().x, t.mesh.position.z - p.pos().z) < 70;
      if (near) dir.set(t.mesh.position.x - p.pos().x, 0, t.mesh.position.z - p.pos().z);
      else {
        const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
        dir.set(hs.x, 0, hs.z);
      }
    } else if (p.aiMode === "help") {
      if (help) {
        const wp = sideWaypoint(p, help.pos().x, help.pos().z);
        const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
        dir.set(hs.x, 0, hs.z);
      } else if (p.aiJoinKind === "help" || p.aiJoinKind === "defend") {
        const call = p.aiJoinKind === "defend" ? tb.defend : tb.help;
        if (call) {
          const d = Math.hypot(call.x - p.pos().x, call.z - p.pos().z);
          dir.set(call.x - p.pos().x, 0, call.z - p.pos().z);
          // Al llegar: pelear si hay enemigo cerca
          if (d < 22 && enemy) {
            p.aiFoe = enemy;
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
      dir.set(p.aiWanderX - p.pos().x, 0, p.aiWanderZ - p.pos().z);
      if (dir.lengthSq() < 140) p.aiWander = 0;
      else if ((mood.front < -0.28 || lowHp) && !huntCarrier) {
        const home = sideSteer(p, 0, homeZ);
        dir.set(home.x, 0, home.z);
      }
    }
  }

  let shipGate = false;
  {
    const pos = p.pos();
    const own = p.faccion;
    const foeFac = own === "z" ? "f" : "z";
    const wantFoe =
      raiding ||
      (ball && (ball.inBase === foeFac || shipDist(ball.mesh.position, foeFac) < BASE_INNER_R + 8));
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
    }
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
  }

  {
    const pos = p.pos();
    // En agua: priorizar orilla (nadando) o despegue si hay ki.
    // También si llevan esfera — antes solo !carrying y se ahogaban con botín.
    if (isWater(pos.x, pos.z) && (p.flyAlt || 0) < 0.35 && !shipGate) {
      const flyKi = band.fly || 0.45;
      const canAir = p.s.ki > 22 && p.s.ki / Math.max(1, p.s.kiMax) >= flyKi;
      if (canAir) {
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
  let aimX = pos.x;
  let aimZ = pos.z;
  if (carrying) {
    aimX = 0;
    aimZ = homeZ;
    if (p.aiMode === "hide" && p.aiHideX != null) {
      aimX = p.aiHideX;
      aimZ = p.aiHideZ;
    } else if (fighting && foe) {
      aimX = foe.pos().x;
      aimZ = foe.pos().z;
    }
  } else if (p.aiMode === "ball" && ball) {
    aimX = ball.mesh.position.x;
    aimZ = ball.mesh.position.z;
  } else if (raiding && loot.length) {
    const t = loot[0];
    aimX = t.mesh.position.x;
    aimZ = t.mesh.position.z;
  } else if (fighting && foe) {
    aimX = foe.pos().x;
    aimZ = foe.pos().z;
  } else if (p.aiMode === "help" && help) {
    aimX = help.pos().x;
    aimZ = help.pos().z;
  } else if (p.aiWanderX != null) {
    aimX = p.aiWanderX;
    aimZ = p.aiWanderZ;
  }
  // Distancia real al objetivo del modo actual: la usa applyLoco para decidir
  // si vale la pena volar/correr. (aim* es el punto al que apunta cada modo.)
  const goalDist = Math.hypot(aimX - pos.x, aimZ - pos.z);
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
    if ((p.flyAlt || 0) > 0.08) p.descend();
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

  const forceLocoMove = shipGate || locoOut.loco === "shipDoor" || !fighting || !locoOut.allowFight;
  if (shipGate && dir.lengthSq() > 0.04) {
    dir.normalize();
    const x = p.mesh.position.x;
    if (Math.abs(x) > 1.2 && nearAnyShip(p.pos(), 48) && !inShipBase(p.pos(), p.faccion === "z" ? "f" : "z"))
      p.mesh.position.x += -x * Math.min(1, dt * 4.5);
    p.yaw = Math.atan2(dir.x, dir.z);
    aiMove(p, dir, true, dt);
  } else if (forceLocoMove && dir.lengthSq() > 0.25) {
    dir.normalize();
    smoothYaw(p, Math.atan2(dir.x, dir.z), dt, 3.8);
    const moveDir = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    moveDir.lerp(dir, 0.4).normalize();
    aiMove(p, moveDir, locoOut.run, dt);
  }

  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  if (locoOut.canCharge && !shipGate) p.charge(dt);
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
    call: [tb.help && `help ${tb.help.taken}/${tb.help.slots}`, tb.defend && `def ${tb.defend.taken}/${tb.defend.slots}`, tb.raid && `raid ${tb.raid.taken}/${tb.raid.slots}`]
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
