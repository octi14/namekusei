import * as THREE from "three";
import { BASE_Z, superRank, SUPER_KI, MELEE } from "./config.js";
import { inOwnBase, isWater, groundHeight } from "./world.js";
import { BASE_INNER_R, steerShipNav, nearAnyShip, shipDist, inShipBase } from "./bases.js";
import { powerStyle } from "./powers.js";

function seed(p) {
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h % 1000) / 1000;
}

/** Rol fijo por unidad: más decididos sin narrativa. */
function aiRole(p) {
  const a = seed(p);
  if (a < 0.34) return "guard";
  if (a < 0.67) return "baller";
  return "aggro";
}

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

function claimBall(p, people, balls) {
  const free = balls.items.filter((b) => !b.held && b.inBase !== p.faccion);
  if (!free.length) {
    p.aiBall = null;
    return null;
  }
  const cur = ballByN(balls, p.aiBall);
  if (cur) {
    p.aiLock = Math.max(p.aiLock || 0, 1);
    return cur;
  }

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
  return best;
}

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
    const cap = sniping ? maxD : air ? maxD : Math.min(maxD, baseThreat || nearHome ? 88 : 42);
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

function applyLoco(p, dir, ctx, dt) {
  const body = senseBody(p);
  const shipFac = nearAnyShip({ x: body.x, z: body.z }, 14);
  const atShip = !!(shipFac || ctx.shipGate);

  const needKi = body.ki < ctx.band.lo || ((p.aiChargeTo || 0) > 0 && body.ki < p.aiChargeTo);
  if (ctx.chargingHard && body.dry && body.grounded) p.aiCharge = true;
  else if (needKi && !ctx.carrying && !ctx.fighting && body.dry && body.grounded && ctx.mode !== "deliver") p.aiCharge = true;
  else if (body.ki >= (p.aiChargeTo || ctx.band.hi)) p.aiCharge = false;
  if (ctx.carrying || ctx.sniping || atShip) p.aiCharge = false;
  const charging = !!p.aiCharge && body.grounded && body.dry;

  const canFly = body.kiAbs > 8 && body.ki >= 0.18 && !charging && !atShip && !ctx.fighting;
  let wantFly = false;
  if (canFly && (ctx.goalDist > 42 || (ctx.carrying && ctx.baseDist > 28) || ctx.mode === "raid")) wantFly = true;
  else if ((p.aiFlyHold || 0) > 0.4 && body.ki > 0.16 && !atShip) wantFly = true;

  if (wantFly) p.aiFlyHold = Math.min(3.5, (p.aiFlyHold || 0) + dt);
  else p.aiFlyHold = Math.max(0, (p.aiFlyHold || 0) - dt * 0.45);

  if (atShip) {
    if (body.flyAlt > 0.1) aiVert(p, body, "descend");
    p.aiFlyHold = 0;
  } else if (wantFly && p.aiFlyHold > 0.28) {
    aiVert(p, body, "climb");
  } else if (body.flying) {
    aiVert(p, body, "descend");
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
  const turbo =
    loco === "air" && body.ki > 0.35 && ctx.goalDist > 40 && (ctx.carrying || ctx.mode === "ball" || ctx.mode === "deliver");

  return {
    loco,
    run: !!(run || turbo),
    canCharge: charging,
    stop: false,
    allowFight: !atShip,
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
  if (far && (Math.abs(px) < 140 || Math.abs(px - lane) > 120)) {
    return { x: lane, z: pz + (gz - pz) * 0.5 };
  }
  if (zDist > 50 && Math.abs(gx) < 100) {
    return { x: lane * 0.65 + gx * 0.2, z: gz };
  }
  return { x: gx, z: gz };
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
    if (d2 > 2500) continue;           // >50u → ignora
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
    baseThreat,
    defend,
    role,
  } = ctx;
  if (carrying) return "deliver";
  const sticky = (m) => {
    if (p.aiMode !== m) return 0;
    if (m === "charge" || m === "wander") return 3;
    if (m === "fight") return 9;
    return 11;
  };
  const rows = [];
  let fight = -60;
  if (enemy && (!critHp || enemyCarrier)) {
    fight = (enemyCarrier ? 96 : 30) + Math.max(0, 48 - enemyDist) * 0.55 + sticky("fight");
    if (enemyCarrier && enemyDist < 80) fight += 36;
    if (enemyDist < 38 && mood.ki > 0.18) fight += 16 + agg * 8;
    if (enemyDist < 22 && mood.ki > 0.12) fight += 14;
    if (defend) {
      fight += 42 + (enemyCarrier ? 22 : 10) + Math.max(0, 0.55 - agg) * 18;
      if (inHomeAir) fight += 16;
    }
    if (role === "aggro") fight += 14;
    if (role === "guard" && (defend || inHomeAir)) fight += 16;
    if (lowHp && !enemyCarrier) fight -= 22;
  }
  rows.push(["fight", fight]);
  let ballS = -30;
  if (ball) {
    const d = Math.hypot(ball.mesh.position.x - p.pos().x, ball.mesh.position.z - p.pos().z);
    ballS = 56 - d * 0.035 + sticky("ball") + (inHomeAir ? 10 : 0);
    if (defend) ballS -= 28;
    if (role === "baller") ballS += 16;
    if (role === "guard" && !defend) ballS -= 6;
  }
  rows.push(["ball", ballS]);
  rows.push(["help", help ? 16 + sticky("help") + (role === "guard" ? 6 : 0) : -40]);
  rows.push(["raid", loot.length && !lowHp && !defend && role !== "guard" ? 14 + sticky("raid") + (role === "aggro" ? 6 : 0) : -40]);
  let chargeS =
    needCharge && !(p.aiMode === "fight" && enemyDist < 28) && !defend
      ? 34 + (0.6 - mood.ki) * 36 + sticky("charge")
      : -22;
  if (enemy && enemyDist < 34 && mood.ki > 0.1) chargeS -= 30;
  if (defend) chargeS -= 44;
  if (role === "aggro") chargeS -= 8;
  rows.push(["charge", chargeS]);
  rows.push(["wander", 2 - (inHomeAir ? 12 : 0) - (ball ? 8 : 0) - (defend ? 18 : 0) + sticky("wander")]);
  let best = "wander";
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

/** Si el personaje casi no avanza en XZ (o flota en el mismo sitio), fuerza un plan simple unos segundos. */
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
  const lim = hovering ? 5.5 : 3.2;
  if (prog < lim) p._stkT = (p._stkT || 0) + window;
  else p._stkT = Math.max(0, (p._stkT || 0) - window * 1.35);
}

function pickUnstick(p, balls) {
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const baseDist = Math.hypot(p.pos().x, p.pos().z - homeZ);
  p.aiUnstick = 5.5 + seed(p) * 2.5;
  p.aiFight = 0;
  p.aiCharge = false;
  p.aiRaid = 0;
  p._stkT = 0;
  if (p.esfera != null) {
    p.aiBreak = "home";
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
    const home = sideSteer(p, 0, homeZ);
    dir.set(home.x, 0, home.z);
    const d = Math.hypot(p.pos().x, p.pos().z - homeZ);
    fly = d > 55 && body.ki > 0.2;
    if (d < 40 || inOwnBase(p.pos(), p.faccion)) {
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
  if ((p._stkT || 0) > 2.0 && (p.aiUnstick || 0) <= 0) pickUnstick(p, balls);
  if ((p.aiUnstick || 0) > 0) {
    runUnstick(p, people, balls, combat, match, dt);
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
  // Soltar esfera si van a morir / rodeados (pelear o huir sin lastre)
  if (carrying && (critHp || (lowHp && mood.hp < 0.22))) {
    let nearFoe = false;
    for (const o of people) {
      if (o.dead || o.faccion === p.faccion) continue;
      if (o.pos().distanceTo(p.pos()) < 16) {
        nearFoe = true;
        break;
      }
    }
    if (critHp || nearFoe) {
      p.dropBall(balls);
      carrying = false;
    }
  }
  // Esconderse solo con HP crítico, o cautelosos ya muy bajos
  const hideOk =
    !carrying &&
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
  if (carrying || !loot.length || lowHp) p.aiRaid = 0;
  else if (p.aiRaid <= 0 && (role === "aggro" || agg > 0.55) && !carrying && Math.random() < 0.004 * dt * 60) {
    let nRaid = 0;
    for (const o of people) if (o.faccion === p.faccion && (o.aiRaid || 0) > 0) nRaid++;
    if (nRaid < 1) {
      p.aiRaid = 16 + agg * 10;
      p.aiRaidX = (seed(p) > 0.5 ? 1 : -1) * (85 + agg * 90);
    }
  }

  if (carrying) {
    p.aiFight = 0;
    p.aiRaid = 0;
    p.aiHelpId = null;
    p.aiCharge = false;
    commitMode(p, "deliver", 99);
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
  const foeRange = carrying ? 14 : p.aiMode === "fight" || defend ? 95 : inHomeAir ? 72 : 52;
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

  const helpCand = !carrying ? allyToHelp(p, people) : null;
  const ballCand = !carrying ? claimBall(p, people, balls) : null;
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
  });
  const interrupt =
    (pick === "fight" &&
      enemy &&
      p.aiMode !== "fight" &&
      p.aiMode !== "deliver" &&
      (enemyDist < 42 || defend || enemyCarrier || role === "aggro")) ||
    (pick === "deliver" && carrying && p.aiMode !== "deliver") ||
    (pick === "ball" && ballCand && (p.aiMode === "charge" || p.aiMode === "wander")) ||
    (defend && pick === "fight" && (p.aiMode === "charge" || p.aiMode === "wander" || p.aiMode === "raid")) ||
    (pick === "hide" && p.aiMode === "fight" && critHp);
  if (interrupt || p.aiMode !== pick || p.aiModeT <= 0) {
    if (pick === "hide") {
      const spot = pickHideSpot(p, people, homeZ);
      p.aiHideX = spot.x;
      p.aiHideZ = spot.z;
      p.aiFight = 0;
      p.aiFoe = null;
      commitMode(p, "hide", 4.2 + (1 - agg) * 2.2);
    } else if (pick === "snipe") {
      p.aiFoe = snipeFoe || p.aiFoe || enemy;
      const nest = pickNest(p, p.aiFoe);
      p.aiNestX = nest.x;
      p.aiNestZ = nest.z;
      commitMode(p, "snipe", 7 + seed(p) * 4);
    } else if (pick === "fight" && enemy) {
      p.aiFoe = enemy;
      p.aiFight = 5 + agg * 2.8 + Math.max(0, mood.front) * 2;
      commitMode(p, "fight", p.aiFight);
    } else if (pick === "deliver") commitMode(p, "deliver", 99);
    else if (pick === "help") commitMode(p, "help", 6 + seed(p) * 2.5);
    else if (pick === "ball") commitMode(p, "ball", 7 + seed(p) * 3);
    else if (pick === "raid") {
      p.aiRaid = Math.max(p.aiRaid || 0, 12);
      commitMode(p, "raid", 8);
    } else if (pick === "charge") {
      p.aiChargeTo = band.hi;
      commitMode(p, "charge", 2.6 + seed(p) * 1.6);
    } else {
      p.aiWanderPhase = (p.aiWanderPhase || 0) + 1;
      const wt =
        (p.aiMemT || 0) > 0 && p.aiMemCx != null && role === "aggro"
          ? { x: p.aiMemCx + (seed(p) - 0.5) * 40, z: p.aiMemCz + (seed(p) - 0.5) * 40 }
          : pickWanderTarget(p, homeZ, enemyZ);
      p.aiWanderX = wt.x;
      p.aiWanderZ = wt.z;
      p.aiWander = 4 + seed(p) * 3;
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
  const fighting = !carrying && p.aiMode === "fight" && foe && (!critHp || huntingCarrier);
  if (p.canSsj) {
    const ratio = p.s.ki / p.s.kiMax;
    if (fighting && ratio > 0.42) p.setSsj(true);
    else if (ratio < 0.18) p.setSsj(false);
  }
  const raiding = p.aiMode === "raid" && loot.length > 0;

  if (carrying) {
    const nav = steerShipNav(p.pos().x, p.pos().z, p.faccion, "deposit");
    if (nav) dir.set(nav.x, 0, nav.z);
    else {
      const home = sideSteer(p, 0, homeZ);
      dir.set(home.x, 0, home.z);
    }
    if (kiFrac > 0.22 && !inShipBase(p.pos(), p.faccion)) {
      const avoid = heatAvoid(p, people, dir);
      if (avoid && avoid.strength > 0.28) {
        const mix = Math.min(avoid.strength * 0.45, 0.4);
        dir.x = dir.x * (1 - mix) + avoid.x * mix;
        dir.z = dir.z * (1 - mix) + avoid.z * mix;
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
  } else if (fighting) {
    const dist0 = foe.pos().distanceTo(p.pos());
    if (dist0 > 42 && !huntingCarrier) {
      const wp = sideWaypoint(p, foe.pos().x, foe.pos().z);
      dir.set(wp.x - p.pos().x, 0, wp.z - p.pos().z);
    } else {
      dir.set(foe.pos().x - p.pos().x, 0, foe.pos().z - p.pos().z);
    }
    const dist = foe.pos().distanceTo(p.pos());
    const rng = powerStyle(p.nombre, p.faccion).range || 55;
    const preferKi = !huntingCarrier && mood.ki > 0.32 && p.s.ki > 14 && (p.cooldown || 0) <= 0;
    const hold = preferKi
      ? Math.min(18, rng * (mood.front < 0 ? 0.34 : 0.24))
      : huntingCarrier
        ? 3.2
        : mood.ki < 0.2
          ? 7.5
          : 4.2;
    const inKiRange = dist < rng * 0.9 && dist > 2.4;
    const close = dist < 4.2;
    const lockChance = (0.014 + agg * 0.022 + Math.max(0, mood.front) * 0.025) * dt * 60;
    const locked = (p.lockFoe === foe && (p.lockT || 0) > 0) || (dist < rng * 0.88 && Math.random() < lockChance);
    if (locked) faceLock(p, foe, dt, 1.35 + agg * 0.8);
    else {
      p.lockT = Math.max(0, (p.lockT || 0) - dt);
      const approachYaw = dist > 4.5 ? flankAngle(p, foe, dt) : Math.atan2(dir.x, dir.z);
      smoothYaw(p, approachYaw, dt, 7);
    }
    const lookYaw = Math.atan2(dir.x, dir.z);
    let dy = lookYaw - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const facing = Math.abs(dy) < 0.55;
    if (dir.lengthSq() > 0.4) {
      dir.normalize();
      const side = seed(p) > 0.5 ? 1 : -1;
      const strafe = new THREE.Vector3(Math.cos(lookYaw) * side, 0, -Math.sin(lookYaw) * side);
      if (mood.hp < 0.32 && mood.front < 0.1 && dist < 8 && !huntingCarrier) aiMove(p, dir.clone().multiplyScalar(-1), true, dt);
      else if (p.s.ki < p.s.kiMax * 0.16 && dist > 5 && !huntingCarrier) {
        // Sin ki: no embestir; ganar espacio o cargar si lejos
        if (dist < 12) aiMove(p, dir.clone().multiplyScalar(-1).lerp(strafe, 0.5).normalize(), true, dt);
        else if (dry) p.aiCharge = true;
        else aiMove(p, strafe, false, dt);
      } else if (dist > hold) {
        const fd = dir.clone().lerp(strafe, locked ? 0.35 : 0.22).normalize();
        aiMove(p, fd, dist > 8 && (mood.ki > 0.22 || huntingCarrier), dt);
      } else if (dist < hold * 0.5 && p.s.ki > 12 && preferKi && !huntingCarrier) {
        aiMove(p, dir.clone().multiplyScalar(-1).lerp(strafe, 0.4).normalize(), false, dt);
      } else if (close && (p.flyAlt || 0) > 0.35) {
        if ((p.aiHover || 0) > 0) p.aiHover -= dt;
        else p.aiHover = 0.35 + seed(p) * 0.45;
        if ((p.aiHover || 0) > 0.18) aiMove(p, strafe, false, dt);
      } else if (locked) aiMove(p, strafe, false, dt);
    }
    const blastOdds =
      (facing ? 1 : 0.15) *
      (mood.front < 0 ? 0.12 : 0.07) *
      (mood.ki > 0.42 ? 1.05 : mood.ki > 0.28 ? 0.4 : 0.08) *
      (locked ? 1.1 : 0.85) *
      ((p.flyAlt || 0) > 2 ? 0.35 : dist > 22 ? 0.45 : 0.7);
    const rank = superRank(p.s.ki, p.s.kiMax, p.s.ataque);
    const canSuper = rank >= 1;
    const superOdds = (0.048 + agg * 0.03 + (rank >= 2 ? 0.03 : 0) + (rank >= 3 ? 0.02 : 0)) * dt * 60;
    if (canSuper && inKiRange && facing && dist < 52 && (p.cooldown || 0) <= 0 && Math.random() < superOdds) {
      combat.blast(p, true, people, dist > 40);
    } else if (
      inKiRange &&
      facing &&
      dist < 38 &&
      p.s.ki >= p.s.kiMax * 0.18 &&
      (p.cooldown || 0) <= 0 &&
      Math.random() < blastOdds
    ) {
      combat.blast(p, false, people, dist > 48);
    }
    const meleeOdds = close ? (mood.front > 0.2 ? 0.42 : 0.28) : dist < 5.5 ? 0.12 : 0;
    if (dist < 5.5 && facing && Math.random() < meleeOdds * MELEE) combat.melee(p, people);
  } else {
    if ((p.lockT || 0) > 0) p.lockT = Math.max(0, p.lockT - dt * 2.2);
    if (p.lockT <= 0) p.lockFoe = null;
    if (raiding) {
      const t = loot.reduce((a, b) => {
        const da = Math.hypot(a.mesh.position.x - p.pos().x, a.mesh.position.z - p.pos().z);
        const db = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
        return db < da ? b : a;
      });
      const wp = sideWaypoint(p, p.aiRaidX || ensureLane(p), t.mesh.position.z);
      const near = Math.hypot(t.mesh.position.x - p.pos().x, t.mesh.position.z - p.pos().z) < 55;
      if (near) dir.set(t.mesh.position.x - p.pos().x, 0, t.mesh.position.z - p.pos().z);
      else {
        const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
        dir.set(hs.x, 0, hs.z);
      }
    } else if (p.aiMode === "help" && help) {
      const wp = sideWaypoint(p, help.pos().x, help.pos().z);
      const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
      dir.set(hs.x, 0, hs.z);
    } else if (p.aiMode === "ball" && ball) {
      ensureLane(p);
      const bx = ball.mesh.position.x;
      const bz = ball.mesh.position.z;
      const wp = sideWaypoint(p, bx, bz);
      const hs = hideSteer(p.pos().x, p.pos().z, wp.x, wp.z, enemy);
      dir.set(hs.x, 0, hs.z);
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

  // —— Puerta de naves: entrar / salir / depositar ——
  let shipGate = false;
  {
    const pos = p.pos();
    const own = p.faccion;
    const foeFac = own === "z" ? "f" : "z";
    const ballPos = ball?.mesh?.position;
    const ballInFoeShip =
      !!ballPos &&
      (ball.inBase === foeFac || shipDist(ballPos, foeFac) < BASE_INNER_R + 4);
    const wantFoeInside = raiding || (p.aiMode === "ball" && ballInFoeShip) || ballInFoeShip;

    if (carrying) {
      // Si estás en la nave enemiga con esfera, primero salir; si no, depositar en la propia
      if (inShipBase(pos, foeFac)) {
        const nav = steerShipNav(pos.x, pos.z, foeFac, "exit");
        if (nav) {
          dir.set(nav.x, 0, nav.z);
          shipGate = true;
        }
      } else {
        const nav = steerShipNav(pos.x, pos.z, own, "deposit");
        if (nav) {
          dir.set(nav.x, 0, nav.z);
          shipGate = true;
        }
      }
    } else if (inShipBase(pos, foeFac) && wantFoeInside) {
      // Dentro del rival: ir a la esfera / centro, no huir
      if (ballPos) dir.set(ballPos.x - pos.x, 0, ballPos.z - pos.z);
      else {
        const nav = steerShipNav(pos.x, pos.z, foeFac, "enter");
        if (nav) dir.set(nav.x, 0, nav.z);
      }
      shipGate = true;
    } else if (inShipBase(pos, own)) {
      const nav = steerShipNav(pos.x, pos.z, own, "exit");
      if (nav) {
        dir.set(nav.x, 0, nav.z);
        shipGate = true;
        p.aiLeaveBase = Math.max(p.aiLeaveBase || 0, 3.5);
      }
    } else if (inShipBase(pos, foeFac)) {
      const nav = steerShipNav(pos.x, pos.z, foeFac, "exit");
      if (nav) {
        dir.set(nav.x, 0, nav.z);
        shipGate = true;
      }
    } else {
      if ((p.aiLeaveBase || 0) > 0) {
        p.aiLeaveBase = Math.max(0, (p.aiLeaveBase || 0) - dt);
        const nav = steerShipNav(pos.x, pos.z, own, "exit");
        if (nav) {
          dir.set(nav.x, 0, nav.z);
          shipGate = true;
        }
        if (shipDist(pos, own) > BASE_INNER_R + 14) p.aiLeaveBase = 0;
      } else if (shipDist(pos, own) < BASE_INNER_R + 3) {
        p.aiLeaveBase = 4;
      }
      // Entrar a la nave enemiga por la rampa (raid o robar esfera)
      if (!shipGate && wantFoeInside && shipDist(pos, foeFac) < BASE_INNER_R + 70) {
        const nav = steerShipNav(pos.x, pos.z, foeFac, "enter");
        if (nav) {
          dir.set(nav.x, 0, nav.z);
          shipGate = true;
        }
      }
    }
  }

  const goalDist = Math.hypot(dir.x, dir.z) || 0.001;
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

  const forceLocoMove = shipGate || locoOut.loco === "shipDoor" || !fighting || !locoOut.allowFight;
  if (forceLocoMove && dir.lengthSq() > 0.25) {
    dir.normalize();
    smoothYaw(p, Math.atan2(dir.x, dir.z), dt, carrying || shipGate ? 10 : 3.8);
    const moveDir = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    moveDir.lerp(dir, carrying || shipGate ? 0.8 : 0.4).normalize();
    aiMove(p, moveDir, locoOut.run || shipGate, dt);
  }

  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  if (locoOut.canCharge && !shipGate) p.charge(dt);
  p.stickY();
}
