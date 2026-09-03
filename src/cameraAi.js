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
      const lean = Math.sin(p.mesh.rotation.x);
      const look = p.pos().clone().addScaledVector(f, lean * p.height * 0.62);
      look.y += 0.9 + b * 0.08;
      const dist = 4.15 + b * 1.55;
      const pit = this.pitch;
      const back = f.clone().multiplyScalar(-dist * Math.cos(pit));
      const right = new THREE.Vector3(f.z, 0, -f.x);
      back.addScaledVector(right, this._bank * 0.85);
      const dest = look.clone().add(back);
      dest.y += 0.55 - dist * Math.sin(pit);
      dest.y = Math.max(p.pos().y + 0.4, dest.y);
      if (!this._cpos) this._cpos = dest.clone();
      const chase = 8 + (1 - fly) * 10;
      this._cpos.lerp(dest, 1 - Math.exp(-chase * dt));
      this.camera.position.copy(this._cpos);
      this.camera.lookAt(look.x, look.y + 0.15, look.z);
      this.camera.rotateZ(this._bank);
    } else {
      this._setFp(p, true);
      p.mesh.updateMatrixWorld(true);
      const ff = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      const eye = new THREE.Vector3();
      const head = p.limbs?.headG;
      if (head) {
        head.getWorldPosition(eye);
        eye.y += 0.06;
      } else {
        eye.copy(p.pos());
        eye.y += p.height * 0.84;
      }
      eye.addScaledVector(ff, 0.22);
      const look = eye.clone().addScaledVector(ff, 5.5);
      look.y += this.pitch * 3.2;
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
  const lo = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.34, 0.12, a) + jitter, 0.1, 0.38);
  const span = THREE.MathUtils.lerp(0.46, 0.2, a);
  return { lo, hi: Math.min(0.86, lo + span) };
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
  let best = null;
  let bestS = 1e9;
  for (const o of people) {
    if (o.faccion === p.faccion || o.dead) continue;
    const d = o.pos().distanceTo(p.pos());
    if (d > maxD) continue;
    const s = d - (o.esfera != null ? 40 : 0);
    if (s < bestS) {
      bestS = s;
      best = o;
    }
  }
  return best;
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

function rivalDist(p, people, x, z) {
  let d = 1e9;
  for (const o of people) {
    if (o.dead || o.faccion === p.faccion) continue;
    d = Math.min(d, Math.hypot(o.pos().x - x, o.pos().z - z));
  }
  return d;
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

function escortCount(carrier, people, ignore) {
  let n = 0;
  for (const o of people) {
    if (o === ignore || o === carrier || o.dead || o.faccion !== carrier.faccion) continue;
    if (o.esfera != null) continue;
    if (o.aiMode === "help" && o.aiHelpId === carrier.id) n++;
    else if (o.pos().distanceTo(carrier.pos()) < 22) n++;
  }
  return n;
}

const MAX_ESCORTS = 2;

function allyToHelp(p, people) {
  if (p.aiHelpId) {
    const cur = allyById(people, p.aiHelpId);
    if (cur && !cur.dead && cur.faccion === p.faccion && cur.esfera != null) return cur;
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
    fly = d > 55 && p.s.ki > p.s.kiMax * 0.15;
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
  const agg = seed(p);
  const lowHp = p.s.hp < p.s.hpMax * 0.4;
  const carrying = p.esfera != null;
  const homeZ = p.faccion === "z" ? -BASE_Z : BASE_Z;
  const baseDist = Math.hypot(p.pos().x, p.pos().z - homeZ);
  const nearOwnBase = baseDist < 12;
  const inHomeAir = baseDist < 56;
  const kiFrac = p.s.ki / p.s.kiMax;
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
    if (p.aiMode !== "deliver") commitMode(p, "deliver", 99);
  }

  if (!carrying && inHomeAir) p.aiFight = 0;

  if (p.aiFoe && (p.aiFoe.s.hp <= 0 || p.aiFoe.dead || p.aiFoe.pos().distanceTo(p.pos()) > 36)) {
    p.aiFoe = null;
    if (p.aiMode === "fight") p.aiModeT = 0;
  }
  const enemy = pickFoe(p, people, carrying ? 16 : 72);
  if (enemy && p.aiFight > 0) p.aiFoe = enemy;
  const enemyDist = enemy ? enemy.pos().distanceTo(p.pos()) : 1e9;
  const enemyCarrier = !!(enemy && enemy.esfera != null);
  const wantEngage =
    !carrying &&
    !inHomeAir &&
    !lowHp &&
    enemy &&
    (enemyCarrier || enemyDist < 20 || (agg > 0.42 && enemyDist < 38));

  // Candidatos (baratos); el modo sticky decide si los usa
  const helpCand = !carrying ? allyToHelp(p, people) : null;
  const ballCand = !carrying ? claimBall(p, people, balls) : null;
  const needCharge = !carrying && kiFrac < band.lo && p.flyAlt < 0.2 && !isWater(p.pos().x, p.pos().z);

  const modeOk = (() => {
    switch (p.aiMode) {
      case "deliver":
        return carrying;
      case "help":
        return !!(helpCand && p.aiHelpId === helpCand.id);
      case "ball":
        return !!ballByN(balls, p.aiBall);
      case "raid":
        return p.aiRaid > 0 && loot.length > 0 && !carrying;
      case "fight":
        return p.aiFight > 0 && p.aiFoe && !p.aiFoe.dead;
      case "charge":
        return kiFrac < band.hi && !carrying && p.flyAlt < 0.25 && !isWater(p.pos().x, p.pos().z);
      case "wander":
        return !carrying;
      default:
        return false;
    }
  })();

  // Interrumpir caza/carga/vagar si hay pelea urgente (portador enemigo o cuerpo a cuerpo)
  if (
    wantEngage &&
    (enemyCarrier || enemyDist < 16) &&
    (p.aiMode === "ball" || p.aiMode === "wander" || p.aiMode === "charge" || p.aiMode === "raid")
  ) {
    p.aiFight = Math.max(p.aiFight || 0, 4 + agg * 2.5);
    p.aiFoe = enemy;
    commitMode(p, "fight", p.aiFight);
  }

  if (!modeOk || p.aiModeT <= 0) {
    if (carrying) commitMode(p, "deliver", 99);
    else if (helpCand) commitMode(p, "help", 9 + seed(p) * 3);
    else if (wantEngage && (enemyCarrier || enemyDist < 24 || Math.random() < 0.55 + agg * 0.3)) {
      p.aiFight = 4 + agg * 3;
      p.aiFoe = enemy;
      commitMode(p, "fight", p.aiFight);
    } else if (ballCand) commitMode(p, "ball", 10 + seed(p) * 4);
    else if (p.aiRaid > 0 && loot.length) commitMode(p, "raid", Math.min(12, p.aiRaid));
    else if (needCharge) commitMode(p, "charge", 2.2 + seed(p));
    else {
      if (p.aiWander <= 0) {
        p.aiHeading = p.yaw + (seed(p) - 0.5) * 0.9;
        p.aiWander = 4 + seed(p) * 4;
      }
      commitMode(p, "wander", Math.max(2.5, p.aiWander));
    }
  }

  // Pelea oportunista aunque estén en ball (menos urgente)
  if (
    wantEngage &&
    !carrying &&
    p.aiMode !== "help" &&
    p.aiMode !== "deliver" &&
    p.aiFight <= 0 &&
    Math.random() < (enemyCarrier ? 0.045 : 0.022) * dt * 60
  ) {
    p.aiFight = 3.5 + agg * 2.8;
    p.aiFoe = enemy;
    commitMode(p, "fight", p.aiFight);
  }

  let dir = new THREE.Vector3();
  let ball = ballCand;
  let help = helpCand;
  const foe = p.aiFoe || enemy;
  const fighting = p.aiMode === "fight" && foe && !lowHp;
  const raiding = p.aiMode === "raid" && loot.length > 0;

  if (p.aiMode === "deliver" && carrying) {
    dir.set(-p.pos().x, 0, homeZ - p.pos().z);
  } else if (fighting) {
    const dist = foe.pos().distanceTo(p.pos());
    const rng = powerStyle(p.nombre, p.faccion).range || 55;
    dir.set(foe.pos().x - p.pos().x, 0, foe.pos().z - p.pos().z);
    const inKiRange = dist < rng * 0.92 && dist > 2.2;
    const close = dist < 3.2;
    smoothYaw(p, Math.atan2(dir.x, dir.z), dt, 6);
    if (dir.lengthSq() > 0.4) {
      dir.normalize();
      // Mantener ~media distancia para ki; cerrar si ki bajo
      if (p.s.ki < 10 && dist > 2.4) p.move(dir, true, dt);
      else if (dist > Math.min(18, rng * 0.35)) p.move(dir, dist > 10, dt);
      else if (dist < 5.5 && p.s.ki > 14) p.move(dir.clone().multiplyScalar(-1), false, dt);
    }
    if (inKiRange && p.s.ki >= 12 && Math.random() < 0.22) {
      combat.blast(p, p.s.ki > p.s.kiMax * 0.78 && Math.random() < 0.25, people, dist > 48);
    }
    if (close && Math.random() < 0.14) combat.melee(p, people);
  } else if (raiding) {
    const t = loot.reduce((a, b) => {
      const da = Math.hypot(a.mesh.position.x - p.pos().x, a.mesh.position.z - p.pos().z);
      const db = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
      return db < da ? b : a;
    });
    const far = Math.abs(p.pos().z - t.mesh.position.z) > 70;
    if (far) dir.set((p.aiRaidX || 90) - p.pos().x, 0, t.mesh.position.z - p.pos().z);
    else dir.set(t.mesh.position.x - p.pos().x, 0, t.mesh.position.z - p.pos().z);
  } else if (p.aiMode === "help" && help) {
    dir.set(help.pos().x - p.pos().x, 0, help.pos().z - p.pos().z);
  } else if (p.aiMode === "ball" && ball) {
    dir.set(ball.mesh.position.x - p.pos().x, 0, ball.mesh.position.z - p.pos().z);
  } else if (p.aiMode === "charge") {
    dir.set(0, 0, 0);
    p.aiCharge = true;
  } else {
    if (p.aiWander <= 0) {
      p.aiHeading = p.yaw + (seed(p) - 0.5) * 0.8;
      p.aiWander = 4 + seed(p) * 4;
    }
    dir.set(Math.sin(p.aiHeading), 0, Math.cos(p.aiHeading));
    if (inHomeAir) {
      dir.set(p.pos().x, 0, p.pos().z - homeZ);
      if (dir.lengthSq() < 4) dir.set(Math.sin(p.aiHeading), 0, Math.cos(p.aiHeading));
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
  if (swimming && !mustSwim && shore) dir.set(shore.x, 0, shore.z);

  if (p.aiMode === "charge") p.aiCharge = true;
  else if (kiFrac < band.lo && !carrying && !wetZone && p.flyAlt < 0.2) p.aiCharge = true;
  else if (kiFrac >= band.hi) p.aiCharge = false;
  if (fighting || wetZone || carrying) p.aiCharge = false;
  if (p.aiMode === "charge") p.aiCharge = true;
  const kiOk = kiFrac > band.lo + 0.1 && !p.aiCharge;

  // Intención de vuelo sticky (evita subir/bajar nervioso)
  let flyWish = false;
  if (carrying) flyWish = baseDist > 18 && p.aiMode === "deliver";
  else if (mustSwim) flyWish = false;
  else if (wetZone) flyWish = true;
  else if (p.aiMode === "charge" || fighting) flyWish = false;
  else if (kiOk && (goalDist > 90 || p.aiMode === "raid" || (p.aiMode === "ball" && goalDist > 70))) flyWish = true;
  else if (kiOk && isWater(p.pos().x + dir.x * 14, p.pos().z + dir.z * 14)) flyWish = true;

  if (flyWish) p.aiFlyHold = Math.min(2.2, (p.aiFlyHold || 0) + dt);
  else p.aiFlyHold = Math.max(0, (p.aiFlyHold || 0) - dt * 0.55);
  const wantFly = p.aiFlyHold > 0.4;
  const wantLand =
    (carrying && baseDist < 16) ||
    nearOwnBase ||
    p.aiMode === "charge" ||
    (p.aiCharge && !wetZone) ||
    (p.aiFlyHold < 0.15 && !flyWish);

  const wantRun =
    !wetZone &&
    !p.aiCharge &&
    p.aiMode !== "charge" &&
    kiFrac > 0.12 &&
    (carrying || p.aiMode === "ball" || p.aiMode === "help" || p.aiMode === "raid" || fighting);
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
      if (isWater(px, pz) || isWater(px + dir.x * 10, pz + dir.z * 10)) {
        const out = shoreDir(px, pz) || shoreDir(px + dir.x * 10, pz + dir.z * 10);
        if (out) {
          dir.x = out.x;
          dir.z = out.z;
        }
      }
    }
    dir.normalize();
    smoothYaw(p, Math.atan2(dir.x, dir.z), dt, carrying ? 5.5 : 3.8);
    const moveDir = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    // mezcla ligera hacia el objetivo para no derivar
    moveDir.lerp(dir, 0.35).normalize();
    p.move(moveDir, wantRun || turbo, dt);
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
  for (const p of people) {
    const el = p.nameLabel?.element;
    const fill = p.hpFill;
    if (!el || !fill) continue;
    let seen = false;
    if (p !== player) {
      _to.copy(p.pos()).sub(camera.position);
      const dist = _to.length();
      _to.y *= 0.4;
      _to.normalize();
      seen = dist > 1.2 && dist < (p.faccion === player.faccion ? 86 : 48) && _to.dot(_fwd) > 0.42;
    }
    if (p._tagOn !== seen) {
      p._tagOn = seen;
      el.style.display = seen ? "" : "none";
      p.hpWrap.style.display = seen ? "block" : "none";
      p.nameLabel.visible = seen;
    }
    if (seen) fill.style.width = `${Math.max(0, (p.s.hp / p.s.hpMax) * 100)}%`;
  }
}
