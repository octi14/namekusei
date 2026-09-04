import * as THREE from "three";
import { BASE_Z } from "./config.js";
import { inOwnBase, isWater, groundHeight, surfaceHeight } from "./world.js";
import { powerStyle } from "./powers.js";

export class PlayerCamera {
  constructor(camera) {
    this.camera = camera;
    this.third = true;
    this.pitch = -0.25;
    this.orbit = 0;
    this._fpHide = null;
    this.kick = 0;
    this._fov = 0;
    this._fpBody = null;
  }

  _setFp(p, on) {
    if (this._fpBody && this._fpBody !== p) this._setFp(this._fpBody, false);
    const head = p.limbs?.headG;
    if (head) head.visible = !on;
    if (p.limbs?.neck) p.limbs.neck.visible = !on;
    if (p.limbs?.torsoG && !on) p.limbs.torsoG.visible = true;
    if (p.nameLabel) p.nameLabel.visible = !on;
    p._fpCam = on;
    p.mesh.visible = true;
    if (p.ballMark) p.ballMark.visible = on ? false : p.esfera != null;
    this._fpBody = on ? p : null;
    if (!on) this._fpPos = null;
  }

  shake(n) {
    this.kick = Math.min(0.62, this.kick + n);
  }

  toggle() {
    this.third = !this.third;
  }

  update(p, dt = 0.016) {
    const third = this.third || p.dead;
    if (this._fpBody && (third || this._fpBody !== p)) this._setFp(this._fpBody, false);

    const aim = p.yaw + this.orbit;
    if (this._fyaw == null) this._fyaw = aim;
    let dAim = aim - this._fyaw;
    while (dAim > Math.PI) dAim -= Math.PI * 2;
    while (dAim < -Math.PI) dAim += Math.PI * 2;
    const fly = p.flyBlend || 0;
    const stiff = 5.2 + (1 - fly) * 11;
    this._fyaw += dAim * (1 - Math.exp(-stiff * dt));
    this._yvel = THREE.MathUtils.damp(this._yvel || 0, dAim / Math.max(dt, 0.008), 11, dt);
    const wantBank = THREE.MathUtils.clamp(-(this._yvel) * 0.2 * fly, -0.48, 0.48);
    this._bank = THREE.MathUtils.damp(this._bank || 0, wantBank, 8, dt);

    const yaw = this._fyaw;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const rush = Math.min(1, p.rush || 0);
    this._boost += (rush - (this._boost || 0)) * 0.14;
    const b = this._boost || 0;
    const turbo = rush > 0.88 ? 1 : 0;
    this._turbo = (this._turbo || 0) + (turbo - (this._turbo || 0)) * 0.22;
    const tbo = this._turbo;
    this._bob = (this._bob || 0) + dt * (8 + tbo * 16);
    const fov = (third ? 56 : 72) + (third || !p.volando ? b * 14 + tbo * 5 : b * 5);
    const near = third ? 0.12 : 0.1;
    if (Math.abs(this._fov - fov) > 0.15 || this.camera.near !== near) {
      this._fov = fov;
      this.camera.fov = fov;
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.camera.up.set(0, 1, 0);
    if (third) {
      const pit = this.pitch;
      const cy = Math.cos(pit);
      const aim = new THREE.Vector3(Math.sin(yaw) * cy, Math.sin(pit), Math.cos(yaw) * cy);
      const right = new THREE.Vector3(f.z, 0, -f.x);
      const torso = p.pos().clone();
      torso.y += 0.88 + b * 0.06;
      const look = torso.clone().addScaledVector(aim, 14);
      const dist = 4.15 + b * 1.55;
      const dest = torso.clone().addScaledVector(aim, -dist);
      dest.y += 0.28;
      dest.addScaledVector(right, this._bank * 0.85);
      dest.y = Math.max(surfaceHeight(dest.x, dest.z) + 0.35, dest.y);
      if (!this._cpos) this._cpos = dest.clone();
      const chase = 8 + (1 - fly) * 10;
      this._cpos.lerp(dest, 1 - Math.exp(-chase * dt));
      this.camera.position.copy(this._cpos);
      this.camera.lookAt(look.x, look.y, look.z);
      this.camera.rotateZ(this._bank);
    } else {
      this._setFp(p, true);
      p.mesh.updateMatrixWorld(true);
      const pit = this.pitch;
      const cy = Math.cos(pit);
      const aim = new THREE.Vector3(Math.sin(p.yaw) * cy, Math.sin(pit), Math.cos(p.yaw) * cy);
      const eye = new THREE.Vector3();
      const head = p.limbs?.headG;
      if (head) {
        head.getWorldPosition(eye);
        eye.y += 0.06;
      } else {
        eye.copy(p.pos());
        eye.y += p.height * 0.84;
      }
      eye.addScaledVector(aim, 0.18);
      const look = eye.clone().addScaledVector(aim, 8);
      this.camera.position.copy(eye);
      this.camera.lookAt(look);
      this._fpPos = eye;
    }
    if (tbo > 0.04 && (third || !p.volando)) {
      const w = Math.sin(this._bob);
      const rgt = new THREE.Vector3(f.z, 0, -f.x);
      const m = third ? 1 : 0.28;
      this.camera.position.y += w * 0.05 * tbo * m;
      this.camera.position.addScaledVector(rgt, Math.cos(this._bob * 0.85) * 0.032 * tbo * m);
      this.camera.rotateZ(Math.sin(this._bob * 1.7) * 0.014 * tbo * m);
    }
    if (this.kick > 0.004 && (third || !p.volando)) {
      const k = this.kick;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k * 0.55;
      this.camera.position.z += (Math.random() - 0.5) * k;
      this.kick *= 0.78;
    } else this.kick = 0;
  }
}

function seed(p) {
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h % 1000) / 1000;
}

function kiBand(p) {
  const a = seed(p);
  let h = 0;
  for (const c of p.nombre || p.id) h = (h * 17 + c.charCodeAt(0)) | 0;
  const jitter = (Math.abs(h % 1000) / 1000 - 0.5) * 0.06;
  const lo = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.46, 0.28, a) + jitter, 0.24, 0.5);
  const span = THREE.MathUtils.lerp(0.38, 0.22, a);
  return { lo, hi: Math.min(0.86, lo + span) };
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
    const wet = isWater(b.mesh.position.x, b.mesh.position.z) ? 280 + seed(p) * 40 : 0;
    const score = dist + rivals * 120 + seed(p) * 12 + wet + steal;
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

function pickFoe(p, people, maxD) {
  const sniping = p.aiMode === "snipe";
  const air = (p.flyAlt || 0) > 3.2;
  const cap = sniping ? maxD : air ? maxD : Math.min(maxD, 34);
  let best = null;
  let bestS = 1e9;
  for (const o of people) {
    if (o.faccion === p.faccion || o.dead) continue;
    const d = o.pos().distanceTo(p.pos());
    if (d > cap) continue;
    const s = d - (o.esfera != null ? 40 : 0) - ((o.flyAlt || 0) > 5 ? 12 : 0);
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
    if (isWater(sx, sz)) continue;
    const prog = dx * nx + dz * nz;
    let s = prog * 2.1 - Math.abs(off) * 0.18 + groundHeight(sx, sz) * 0.06;
    if (foe && !foe.dead) {
      const fx = foe.pos().x;
      const fz = foe.pos().z;
      const mx = (sx + fx) * 0.5;
      const mz = (sz + fz) * 0.5;
      const ridge = groundHeight(mx, mz);
      if (ridge > foe.pos().y - 1.5 && ridge > groundHeight(sx, sz) - 0.6) s += 1.55;
      if (Math.hypot(sx - fx, sz - fz) < 22) s -= 1.1;
    }
    if (s > best) {
      best = s;
      bx = dx;
      bz = dz;
    }
  }
  return { x: bx, z: bz };
}

function nearWater(x, z, r = 20) {
  if (isWater(x, z)) return { x: 0, z: 0, here: true };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const wx = x + Math.cos(a) * r;
    const wz = z + Math.sin(a) * r;
    if (isWater(wx, wz)) return { x: Math.cos(a), z: Math.sin(a), here: false };
  }
  return null;
}

function shoreDir(x, z) {
  for (let r = 3; r <= 36; r += 3) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r * 0.15;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      if (!isWater(sx, sz)) return { x: Math.cos(a), z: Math.sin(a), r };
    }
  }
  return null;
}

/** Rumbo a base: prueba varios ángulos y elige el que avanza y evita agua. */
function steerHome(px, pz, homeZ) {
  const gx = -px;
  const gz = homeZ - pz;
  const glen = Math.hypot(gx, gz) || 1;
  const nx = gx / glen;
  const nz = gz / glen;
  const base = Math.atan2(nx, nz);
  let bx = nx;
  let bz = nz;
  let best = -1e9;
  const offs = [0, 0.35, -0.35, 0.75, -0.75, 1.2, -1.2, 1.7, -1.7];
  for (const off of offs) {
    const a = base + off;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const prog = dx * nx + dz * nz;
    if (prog < 0.05 && Math.abs(off) > 0.4) continue;
    let score = prog * 2.4 - Math.abs(off) * 0.12;
    if (isWater(px + dx * 7, pz + dz * 7)) score -= 3.2;
    else if (isWater(px + dx * 16, pz + dz * 16)) score -= 0.85;
    if (score > best) {
      best = score;
      bx = dx;
      bz = dz;
    }
  }
  return { x: bx, z: bz };
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
  const { mood, carrying, enemy, enemyDist, enemyCarrier, ball, help, loot, needCharge, inHomeAir, lowHp, agg, snipeOk } = ctx;
  if (carrying) return "deliver";
  const h = (m) => (p.aiMode === m ? 16 : 0);
  const rows = [];
  let fight = -80;
  if (enemy && !lowHp) {
    fight =
      38 +
      mood.front * 26 +
      Math.max(0, 62 - enemyDist) * 0.62 +
      (enemyCarrier ? 52 : 0) +
      agg * 12 -
      (inHomeAir ? 28 : 0) -
      (mood.ki < 0.32 ? 28 : 0) -
      (mood.ki < 0.18 ? 22 : 0);
  }
  rows.push(["fight", fight + h("fight")]);
  let ballS = -40;
  if (ball) {
    const d = Math.hypot(ball.mesh.position.x - p.pos().x, ball.mesh.position.z - p.pos().z);
    ballS = 20 - d * 0.05 + (ball.inBase ? 8 : 0) - (isWater(ball.mesh.position.x, ball.mesh.position.z) ? 18 : 0) + (inHomeAir ? 10 : 0);
  }
  rows.push(["ball", ballS + h("ball")]);
  rows.push(["help", help ? 15 + h("help") : -50]);
  rows.push(["raid", loot.length && !lowHp && mood.front > -0.1 ? 11 + mood.front * 16 + h("raid") : -45]);
  rows.push(["charge", needCharge ? 48 + (0.52 - mood.ki) * 55 - mood.front * 6 + h("charge") : -20]);
  rows.push([
    "snipe",
    snipeOk ? 24 + mood.ki * 20 + (enemyDist > 36 ? 14 : -18) - agg * 6 + h("snipe") : -70,
  ]);
  rows.push(["wander", 7 + (mood.front > 0.25 ? 6 : 0) - (inHomeAir ? 12 : 0) + h("wander")]);
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

  if (p.aiBreak === "land") {
    p.descend(dt);
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
    dir.set(-p.pos().x, 0, homeZ - p.pos().z);
    const d = Math.hypot(dir.x, dir.z);
    fly = d > 55 && p.s.ki > p.s.kiMax * 0.22;
    if (d < 40 || inOwnBase(p.pos(), p.faccion)) {
      fly = false;
      p.descend(dt);
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
      fly = d > 90 && homeD > 60 && p.s.ki > p.s.kiMax * 0.2;
      if (homeD < 50) {
        fly = false;
        if (p.flyAlt > 0.2) p.descend(dt);
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
    fly = homeD > 65 && p.s.ki > p.s.kiMax * 0.25;
    if (homeD < 50 && p.flyAlt > 0.2) p.descend(dt);
  }

  if (fly) p.climb(dt);
  else if (p.flyAlt > 0.25 && p.aiBreak !== "home") p.descend(dt);

  if (dir.lengthSq() > 0.04) {
    dir.normalize();
    p.yaw = Math.atan2(dir.x, dir.z);
    p.move(dir, run, dt);
  }
  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  p.stickY();
  if (p.aiUnstick <= 0) p._stkT = 0;
}

export function aiTick(p, people, balls, combat, match, dt) {
  if (p.controller !== "ia" || p.dead) return;
  tickStuck(p, dt);
  if ((p._stkT || 0) > 2.6 && (p.aiUnstick || 0) <= 0) pickUnstick(p, balls);
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
  const mood = temper(p);
  p.aiHeat = THREE.MathUtils.damp(p.aiHeat || 0, 0, 0.07, dt);
  const agg = seed(p);
  const lowHp = mood.hp < (mood.front > 0.25 ? 0.28 : mood.front < -0.25 ? 0.52 : 0.4);
  const carrying = p.esfera != null;
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const enemyZ = -homeZ;
  const baseDist = Math.hypot(p.pos().x, p.pos().z - homeZ);
  const nearOwnBase = baseDist < 12;
  const inHomeAir = baseDist < (mood.front < -0.2 ? 72 : 56);
  const kiFrac = mood.ki;
  const band = kiBand(p);

  const loot = balls.items.filter((b) => !b.held && b.inBase && b.inBase !== p.faccion);
  if (carrying || !loot.length || lowHp) p.aiRaid = 0;
  else if (p.aiRaid <= 0 && agg > 0.55 && !carrying && Math.random() < 0.004 * dt * 60) {
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

  if (p.aiFoe && (p.aiFoe.s.hp <= 0 || p.aiFoe.dead || p.aiFoe.pos().distanceTo(p.pos()) > (p.aiMode === "snipe" ? 170 : 42))) p.aiFoe = null;
  const sniper = !carrying && canSnipe(p);
  let nSnipe = 0;
  if (sniper) {
    for (const o of people) if (o.faccion === p.faccion && o.aiMode === "snipe") nSnipe++;
  }
  const snipeFoe = sniper && kiFrac > 0.38 && !lowHp && nSnipe < 2 ? pickSnipeFoe(p, people, powerStyle(p.nombre, p.faccion).range || 90) : null;
  const enemy = pickFoe(p, people, carrying ? 14 : 52) || (p.aiMode === "snipe" ? snipeFoe : null);
  const enemyDist = enemy ? enemy.pos().distanceTo(p.pos()) : snipeFoe ? snipeFoe.pos().distanceTo(p.pos()) : 1e9;
  const enemyCarrier = !!(enemy && enemy.esfera != null);
  const snipeOk = !!(snipeFoe || (p.aiMode === "snipe" && p.aiFoe));

  const helpCand = !carrying ? allyToHelp(p, people) : null;
  const ballCand = !carrying ? claimBall(p, people, balls) : null;
  const dry = !isWater(p.pos().x, p.pos().z);
  const needCharge =
    dry && !carrying && kiFrac < (mood.front < -0.1 ? band.lo + 0.14 : band.lo + 0.06);

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
    agg,
    snipeOk,
  });
  const interrupt = pick === "fight" && p.aiMode !== "fight" && p.aiMode !== "deliver" && p.aiMode !== "snipe";
  if (interrupt || p.aiMode !== pick || p.aiModeT <= 0) {
    if (pick === "snipe") {
      p.aiFoe = snipeFoe || p.aiFoe || enemy;
      const nest = pickNest(p, p.aiFoe);
      p.aiNestX = nest.x;
      p.aiNestZ = nest.z;
      commitMode(p, "snipe", 9 + seed(p) * 5);
    } else if (pick === "fight" && enemy) {
      p.aiFoe = enemy;
      p.aiFight = 5 + agg * 3 + Math.max(0, mood.front) * 3;
      commitMode(p, "fight", p.aiFight);
    } else if (pick === "deliver") commitMode(p, "deliver", 99);
    else if (pick === "help") commitMode(p, "help", 8 + seed(p) * 3);
    else if (pick === "ball") commitMode(p, "ball", 9 + seed(p) * 4);
    else if (pick === "raid") {
      p.aiRaid = Math.max(p.aiRaid || 0, 12);
      commitMode(p, "raid", 10);
    } else if (pick === "charge") commitMode(p, "charge", 2.2 + seed(p));
    else {
      if (p.aiWander <= 0) {
        p.aiHeading = p.yaw + (seed(p) - 0.5) * 0.9;
        p.aiWander = 4 + seed(p) * 4;
      }
      commitMode(p, "wander", Math.max(2.2, p.aiWander));
    }
  }
  if (p.aiMode === "fight" && enemy) p.aiFoe = enemy;
  if (p.aiMode === "snipe" && (snipeFoe || p.aiFoe)) p.aiFoe = snipeFoe || p.aiFoe;

  let dir = new THREE.Vector3();
  let ball = ballCand;
  let help = helpCand;
  const foe = p.aiFoe || enemy || snipeFoe;
  const sniping = !carrying && p.aiMode === "snipe" && foe && !lowHp;
  const fighting = !carrying && p.aiMode === "fight" && foe && !lowHp;
  if (p.canSsj) {
    const ratio = p.s.ki / p.s.kiMax;
    if (fighting && ratio > 0.42) p.setSsj(true);
    else if (ratio < 0.18) p.setSsj(false);
  }
  const raiding = p.aiMode === "raid" && loot.length > 0;

  if (carrying) {
    const home = steerHome(p.pos().x, p.pos().z, homeZ);
    dir.set(home.x, 0, home.z);
    if (kiFrac > 0.22) {
      const avoid = heatAvoid(p, people, dir);
      if (avoid && avoid.strength > 0.35 && enemyDist < 22) {
        const mix = Math.min(avoid.strength * 0.28, 0.22);
        const prog = dir.x * home.x + dir.z * home.z;
        const nx = dir.x * (1 - mix) + avoid.x * mix;
        const nz = dir.z * (1 - mix) + avoid.z * mix;
        if (nx * home.x + nz * home.z > prog * 0.35) {
          dir.x = nx;
          dir.z = nz;
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
  } else if (fighting) {
    const dist = foe.pos().distanceTo(p.pos());
    const rng = powerStyle(p.nombre, p.faccion).range || 55;
    dir.set(foe.pos().x - p.pos().x, 0, foe.pos().z - p.pos().z);
    const preferKi = mood.ki > 0.22 && (mood.front < 0.15 || p.s.ki > 14);
    const hold = preferKi ? Math.min(22, rng * (mood.front < 0 ? 0.42 : 0.32)) : 4.2;
    const inKiRange = dist < rng * 0.92 && dist > 2.2;
    const close = dist < 3.4;
    const lockChance = (0.012 + agg * 0.02 + Math.max(0, mood.front) * 0.025) * dt * 60;
    const locked = (p.lockFoe === foe && (p.lockT || 0) > 0) || (dist < rng * 0.88 && Math.random() < lockChance);
    if (locked) faceLock(p, foe, dt, 1.25 + agg * 0.8);
    else {
      p.lockT = Math.max(0, (p.lockT || 0) - dt);
      const approachYaw = dist > 4.5 ? flankAngle(p, foe, dt) : Math.atan2(dir.x, dir.z);
      smoothYaw(p, approachYaw, dt, 6);
    }
    const lookYaw = Math.atan2(dir.x, dir.z);
    if (dir.lengthSq() > 0.4) {
      dir.normalize();
      const side = seed(p) > 0.5 ? 1 : -1;
      const strafe = new THREE.Vector3(Math.cos(lookYaw) * side, 0, -Math.sin(lookYaw) * side);
      if (mood.hp < 0.32 && mood.front < 0.1 && dist < 8) p.move(dir.clone().multiplyScalar(-1), true, dt);
      else if (p.s.ki < p.s.kiMax * 0.2 && dist > 2.4) p.move(dir, false, dt);
      else if (dist > hold) {
        const fd = dir.clone().lerp(strafe, locked ? 0.35 : 0.22).normalize();
        p.move(fd, dist > 8 && mood.ki > 0.28, dt);
      } else if (dist < hold * 0.55 && p.s.ki > 12 && preferKi) p.move(dir.clone().multiplyScalar(-1).lerp(strafe, 0.4).normalize(), false, dt);
      else if (close && (p.flyAlt || 0) > 0.35) {
        if ((p.aiHover || 0) > 0) p.aiHover -= dt;
        else p.aiHover = 0.35 + seed(p) * 0.45;
        if ((p.aiHover || 0) > 0.18) p.move(strafe, false, dt);
      } else if (locked) p.move(strafe, false, dt);
    }
    const blastOdds =
      (mood.front < 0 ? 0.22 : 0.12) *
      (mood.ki > 0.42 ? 1.15 : mood.ki > 0.28 ? 0.45 : 0.08) *
      (locked ? 1.15 : 1) *
      ((p.flyAlt || 0) > 2 ? 0.28 : dist > 22 ? 0.45 : 1);
    if (inKiRange && dist < 38 && p.s.ki >= p.s.kiMax * 0.22 && Math.random() < blastOdds) {
      combat.blast(p, p.s.ki > p.s.kiMax * 0.78 && mood.front > 0.2 && Math.random() < 0.25, people, dist > 48);
    }
    const meleeOdds = close ? (mood.front > 0.2 ? 0.22 : 0.1) : 0;
    if (close && Math.random() < meleeOdds) combat.melee(p, people);
  } else {
    if ((p.lockT || 0) > 0) p.lockT = Math.max(0, p.lockT - dt * 2.2);
    if (p.lockT <= 0) p.lockFoe = null;
    if (raiding) {
      const t = loot.reduce((a, b) => {
        const da = Math.hypot(a.mesh.position.x - p.pos().x, a.mesh.position.z - p.pos().z);
        const db = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
        return db < da ? b : a;
      });
      const far = Math.abs(p.pos().z - t.mesh.position.z) > 70;
      if (far) dir.set((p.aiRaidX || 90) - p.pos().x, 0, t.mesh.position.z - p.pos().z);
      else dir.set(t.mesh.position.x - p.pos().x, 0, t.mesh.position.z - p.pos().z);
    } else if (p.aiMode === "help" && help) {
      const hs = hideSteer(p.pos().x, p.pos().z, help.pos().x, help.pos().z, enemy);
      dir.set(hs.x, 0, hs.z);
    } else if (p.aiMode === "ball" && ball) {
      const hs = hideSteer(p.pos().x, p.pos().z, ball.mesh.position.x, ball.mesh.position.z, enemy);
      dir.set(hs.x, 0, hs.z);
    } else if (p.aiMode === "charge") {
      dir.set(0, 0, 0);
      p.aiCharge = true;
    } else {
      if (p.aiWander <= 0) {
        p.aiHeading = p.yaw + (seed(p) - 0.5) * 0.8;
        p.aiWander = 4 + seed(p) * 4;
      }
      dir.set(Math.sin(p.aiHeading), 0, Math.cos(p.aiHeading));
      if (baseDist < 90 && !lowHp) dir.set(-p.pos().x * 0.2, 0, enemyZ - p.pos().z);
      else if (mood.front > 0.3 && !lowHp) dir.set(-p.pos().x * 0.15, 0, enemyZ - p.pos().z);
      else if (mood.front < -0.28 || lowHp) dir.set(-p.pos().x, 0, homeZ - p.pos().z);
    }
  }

  const goalDist = Math.hypot(dir.x, dir.z);
  const ballInWater = !!(ball && p.aiMode === "ball" && isWater(ball.mesh.position.x, ball.mesh.position.z));
  const overWater = isWater(p.pos().x, p.pos().z);
  const swimming = p.inSwim();
  const flying = (p.flyAlt || 0) > 0.35;
  const wetZone = overWater || swimming;
  const mustSwim = ballInWater;
  const shore = wetZone && !flying && !mustSwim ? shoreDir(p.pos().x, p.pos().z) : null;
  if (swimming && !mustSwim && !carrying && shore) dir.set(shore.x, 0, shore.z);

  if (p.aiMode === "charge") p.aiCharge = true;
  else if (kiFrac < band.lo + 0.05 && !carrying && !wetZone && baseDist > 50) p.aiCharge = true;
  else if (kiFrac >= band.hi) p.aiCharge = false;
  if (wetZone || carrying || sniping) p.aiCharge = false;
  if (fighting && kiFrac > 0.26) p.aiCharge = false;
  if (p.aiMode === "charge") p.aiCharge = true;
  const kiOk = kiFrac > band.lo + 0.16 && !p.aiCharge;

  let flyWish = false;
  const sneak = seed(p) < 0.42 && baseDist > 80;
  if (carrying) flyWish = baseDist > 55 && kiOk && kiFrac > 0.24;
  else if (mustSwim && !overWater) flyWish = false;
  else if (wetZone) flyWish = true;
  else if (p.aiMode === "charge" || kiFrac < 0.22 || fighting || sniping) flyWish = false;
  else if (baseDist < 95 && kiOk) flyWish = true;
  else if (kiOk && (goalDist > 100 || p.aiMode === "ball" || p.aiMode === "raid") && !sneak) flyWish = true;
  else if (kiOk && isWater(p.pos().x + dir.x * 14, p.pos().z + dir.z * 14)) flyWish = true;

  if (flyWish) p.aiFlyHold = Math.min(2.2, (p.aiFlyHold || 0) + dt);
  else p.aiFlyHold = Math.max(0, (p.aiFlyHold || 0) - dt * 0.55);
  const wantFly = p.aiFlyHold > 0.4;
  const wantLand =
    (carrying && (baseDist < 16 || kiFrac < 0.14)) ||
    (nearOwnBase && carrying) ||
    p.aiMode === "charge" ||
    sniping ||
    (p.aiCharge && !wetZone) ||
    (p.aiFlyHold < 0.15 && !flyWish);

  const wantRun =
    !wetZone &&
    !p.aiCharge &&
    p.aiMode !== "charge" &&
    (carrying || kiFrac > 0.12) &&
    (carrying || p.aiMode === "ball" || p.aiMode === "help" || p.aiMode === "raid" || fighting || sniping || baseDist < 110);
  const turbo = wantFly && kiOk && !wetZone && (carrying || p.aiMode === "ball" || p.aiMode === "raid");

  if (wantLand && p.flyAlt > 0 && !wetZone) {
    p.descend(dt);
    if (p.flyAlt > 1.2) p.vy = Math.min(p.vy, -10);
  } else if (wantFly || (wetZone && !mustSwim)) p.climb(dt);
  else if (mustSwim && p.flyAlt > 0.05) p.descend(dt);
  else if (p.flyAlt > 0 && !wantFly && !wetZone) p.descend(dt);

  if (!fighting && dir.lengthSq() > 0.25) {
    if (!carrying && !mustSwim && !flying && !wantFly) {
      const px = p.pos().x;
      const pz = p.pos().z;
      const ahead1 = isWater(px + dir.x * 6, pz + dir.z * 6);
      const ahead2 = isWater(px + dir.x * 14, pz + dir.z * 14);
      if (isWater(px, pz) || ahead1 || ahead2) {
        const out = shoreDir(px, pz) || shoreDir(px + dir.x * 8, pz + dir.z * 8);
        if (out) {
          dir.x = out.x;
          dir.z = out.z;
        }
      }
    }
    dir.normalize();
    smoothYaw(p, Math.atan2(dir.x, dir.z), dt, carrying ? 9 : 3.8);
    const moveDir = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    moveDir.lerp(dir, carrying ? 0.72 : 0.35).normalize();
    // No esprintar en agua — gasta ki muy rápido
    const runOk = (wantRun || turbo) && !swimming;
    p.move(moveDir, runOk, dt);
  }
  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  if (!fighting && p.aiCharge && p.flyAlt < 0.18 && !wetZone) p.charge(dt);
  p.stickY();
}

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

export function updateSeenBars(camera, player, people) {
  camera.getWorldDirection(_fwd);
  const from = player.pos();
  for (const p of people) {
    const el = p.nameLabel?.element;
    const fill = p.hpFill;
    if (!el || !fill || !p.hpWrap) continue;
    let seen = false;
    if (p !== player && !p.dead) {
      const dist = p.pos().distanceTo(from);
      _to.copy(p.pos()).sub(camera.position);
      const camD = _to.length();
      _to.y *= 0.3;
      if (_to.lengthSq() > 1e-8) _to.normalize();
      const maxD = p.faccion === player.faccion ? 96 : 68;
      seen = dist > 0.9 && dist < maxD && camD > 1.05 && _to.dot(_fwd) > 0.08;
    }
    el.style.display = seen ? "" : "none";
    p.hpWrap.style.display = seen ? "block" : "none";
    p.nameLabel.visible = seen;
    p._tagOn = seen;
    if (seen) fill.style.width = `${Math.max(0, (p.s.hp / p.s.hpMax) * 100)}%`;
  }
}
