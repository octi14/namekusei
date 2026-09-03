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
  if (cur && (p.aiLock || 0) > 0) return cur;

  let best = null;
  let bestScore = Infinity;
  for (const b of free) {
    const dist = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
    let rivals = 0;
    for (const o of people) {
      if (o === p || o.faccion !== p.faccion) continue;
      if (o.aiBall === b.n) rivals++;
    }
    const steal = b.inBase && b.inBase !== p.faccion ? -55 : 0;
    const wet = isWater(b.mesh.position.x, b.mesh.position.z) ? (seed(p) > 0.5 ? 12 : 220) : 0;
    const score = dist + rivals * 90 + seed(p) * 12 + wet + steal;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (cur) {
    const dist = Math.hypot(cur.mesh.position.x - p.pos().x, cur.mesh.position.z - p.pos().z);
    let rivals = 0;
    for (const o of people) {
      if (o === p || o.faccion !== p.faccion) continue;
      if (o.aiBall === cur.n) rivals++;
    }
    const keep = dist + rivals * 90 + seed(p) * 12;
    if (keep < bestScore + 50) best = cur;
  }
  p.aiBall = best.n;
  p.aiLock = 2.5 + seed(p);
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

function rivalDist(p, people, x, z) {
  let d = 1e9;
  for (const o of people) {
    if (o.dead || o.faccion === p.faccion) continue;
    d = Math.min(d, Math.hypot(o.pos().x - x, o.pos().z - z));
  }
  return d;
}

function allyToHelp(p, people) {
  let best = null;
  let bestD = 1e9;
  for (const o of people) {
    if (o === p || o.dead || o.faccion !== p.faccion || o.esfera == null) continue;
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
  return best;
}

export function aiTick(p, people, balls, combat, match, dt) {
  if (p.controller !== "ia" || p.dead) return;
  p.aiFight = Math.max(0, (p.aiFight || 0) - dt);
  p.aiLock = Math.max(0, (p.aiLock || 0) - dt);
  p.aiWander = Math.max(0, (p.aiWander || 0) - dt);
  p.aiRaid = Math.max(0, (p.aiRaid || 0) - dt);
  const agg = seed(p);
  const lowHp = p.s.hp < p.s.hpMax * 0.4;
  const loot = balls.items.filter((b) => !b.held && b.inBase && b.inBase !== p.faccion);
  if (p.esfera != null || !loot.length || lowHp) p.aiRaid = 0;
  else if (p.aiRaid <= 0 && agg > 0.5 && p.esfera == null) {
    let nRaid = 0;
    for (const o of people) if (o.faccion === p.faccion && (o.aiRaid || 0) > 0) nRaid++;
    if (nRaid < 2 && Math.random() < (0.01 + agg * 0.025) * dt) {
      p.aiRaid = 14 + agg * 10;
      p.aiRaidX = (seed(p) > 0.5 ? 1 : -1) * (85 + agg * 90);
    }
  }
  const raiding = p.aiRaid > 0 && p.esfera == null && loot.length > 0;

  if (p.aiFoe && (p.aiFoe.s.hp <= 0 || p.aiFoe.pos().distanceTo(p.pos()) > 22)) p.aiFoe = null;
  const enemy = pickFoe(p, people, p.esfera != null ? 32 : 72);
  if (enemy && p.aiFight > 0) p.aiFoe = enemy;

  const wantHunt =
    enemy &&
    (enemy.esfera != null ||
      (p.esfera == null && (agg > 0.38 || enemy.pos().distanceTo(p.pos()) < 22)));
  if (wantHunt && !lowHp && !raiding && p.aiFight <= 0) {
    p.aiFight = 4 + agg * 3.5;
    p.aiFoe = enemy;
  } else if (enemy && p.esfera == null && p.aiFight <= 0 && Math.random() < (0.02 + agg * 0.03) * dt * 60) {
    p.aiFight = 3 + agg * 3;
    p.aiFoe = enemy;
  }

  let dir = new THREE.Vector3();
  const foe = p.aiFoe || enemy;
  const fighting = p.aiFight > 0 && foe && !lowHp && !raiding;
  let ball = null;
  const help = !fighting && p.esfera == null ? allyToHelp(p, people) : null;

  if (fighting) {
    const dist = foe.pos().distanceTo(p.pos());
    const rng = powerStyle(p.nombre, p.faccion).range || 55;
    dir.set(foe.pos().x - p.pos().x, 0, foe.pos().z - p.pos().z);
    const snipe = rng > 90 && dist > 22 && dist < rng * 1.05;
    if (snipe) {
      p.yaw = Math.atan2(dir.x, dir.z);
      if (dist < 28) p.move(dir.clone().multiplyScalar(-1).normalize(), false, dt);
      if (Math.random() < 0.08) combat.blast(p, false, people, dist > 70);
    } else if (dir.lengthSq() > 1.2) {
      dir.normalize();
      p.yaw = Math.atan2(dir.x, dir.z);
      p.move(dir, true, dt);
    }
    if (!snipe && Math.random() < 0.1) combat.melee(p, people);
    if (!snipe && Math.random() < 0.05) combat.blast(p, p.s.ki > p.s.kiMax * 0.8, people);
  } else if (raiding) {
    const t = loot.reduce((a, b) => {
      const da = Math.hypot(a.mesh.position.x - p.pos().x, a.mesh.position.z - p.pos().z);
      const db = Math.hypot(b.mesh.position.x - p.pos().x, b.mesh.position.z - p.pos().z);
      return db < da ? b : a;
    });
    const far = Math.abs(p.pos().z - t.mesh.position.z) > 70;
    if (far) dir.set((p.aiRaidX || 90) - p.pos().x, 0, t.mesh.position.z - p.pos().z);
    else dir.set(t.mesh.position.x - p.pos().x, 0, t.mesh.position.z - p.pos().z);
  } else if (p.esfera != null) {
    const z = p.faccion === "z" ? -BASE_Z : BASE_Z;
    dir.set(-p.pos().x, 0, z - p.pos().z);
  } else {
    ball = claimBall(p, people, balls);
    const ownHeld = balls.items.some((x) => x.inBase === p.faccion);
    if (help && (!ball || help.pos().distanceTo(p.pos()) < 55)) {
      dir.set(help.pos().x - p.pos().x, 0, help.pos().z - p.pos().z);
    } else if (ball) dir.set(ball.mesh.position.x - p.pos().x, 0, ball.mesh.position.z - p.pos().z);
    else if (ownHeld && seed(p) > 0.4) {
      const z = p.faccion === "z" ? -BASE_Z : BASE_Z;
      dir.set(-p.pos().x, 0, z - p.pos().z);
    } else {
      if (p.aiWander <= 0) {
        p.aiHeading = p.yaw + (seed(p) - 0.5) * 1.2;
        p.aiWander = 3 + seed(p) * 3;
      }
      dir.set(Math.sin(p.aiHeading), 0, Math.cos(p.aiHeading));
    }
  }

  const goalDist = Math.hypot(dir.x, dir.z);
  const atBase = p.esfera != null && inOwnBase(p.pos(), p.faccion);
  const hunted = foe && !fighting && p.esfera == null && foe.pos().distanceTo(p.pos()) < 16;
  const water = nearWater(p.pos().x, p.pos().z, 12);
  const wantHide =
    !raiding &&
    !fighting &&
    p.esfera == null &&
    !ball &&
    !help &&
    !atBase &&
    !!water &&
    p.s.hp < p.s.hpMax * 0.22 &&
    hunted;
  if (wantHide && !water.here) dir.set(water.x, 0, water.z);

  const ballInWater = ball && isWater(ball.mesh.position.x, ball.mesh.position.z);
  let race = false;
  if (ball && p.esfera == null && !wantHide) {
    const myD = Math.hypot(ball.mesh.position.x - p.pos().x, ball.mesh.position.z - p.pos().z);
    const riv = rivalDist(p, people, ball.mesh.position.x, ball.mesh.position.z);
    race = myD < 160 && riv < myD + 38;
  }
  const escort = !!help && p.esfera == null;
  const kiFrac = p.s.ki / p.s.kiMax;
  const band = kiBand(p);
  if (kiFrac < band.lo) p.aiCharge = true;
  else if (kiFrac >= band.hi) p.aiCharge = false;
  if (fighting) p.aiCharge = false;
  const kiOk = kiFrac > band.lo + 0.08 && !p.aiCharge;
  const wantFly =
    !wantHide &&
    !fighting &&
    !atBase &&
    !ballInWater &&
    !p.aiCharge &&
    kiOk &&
    (goalDist > 85 ||
      (p.esfera != null && goalDist > 48) ||
      race ||
      (escort && goalDist > 40) ||
      (raiding && goalDist > 28));
  const turbo =
    kiOk &&
    kiFrac > band.lo + 0.12 &&
    ((wantFly && (race || escort || raiding || (p.esfera != null && goalDist > 55))) ||
      (hunted && wantHide));
  const wantRun = !p.aiCharge && kiFrac > 0.1 && !wantHide;

  if (wantFly) p.climb(dt);
  else if ((wantHide || ballInWater) && p.flyAlt > 0.05) p.descend(dt);
  else if (p.flyAlt > 0 && !wantFly) p.descend(atBase ? dt * 2 : dt);
  if (wantHide && p.inSwim()) p.descend(dt);
  else if (p.inSwim() && !ballInWater) p.climb(dt);

  if (!fighting && dir.lengthSq() > 0.25) {
    const px = p.pos().x;
    const pz = p.pos().z;
    if (!wantHide && !ballInWater && !p.inSwim() && (isWater(px, pz) || isWater(px + dir.x * 8, pz + dir.z * 8))) {
      const gx = groundHeight(px + 6, pz) - groundHeight(px - 6, pz);
      const gz = groundHeight(px, pz + 6) - groundHeight(px, pz - 6);
      dir.x += gx * 2.2;
      dir.z += gz * 2.2;
    }
    dir.normalize();
    p.yaw = Math.atan2(dir.x, dir.z);
    p.move(dir, wantRun || turbo, dt);
  }
  p.tryGrab(balls, dt, match);
  p.tryDeposit(match, balls);
  if (!fighting && (wantHide || p.aiCharge)) p.charge(dt);
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
