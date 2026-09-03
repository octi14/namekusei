import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { FLY_MAX, HP_REGEN, KI_REGEN, KI_REGEN_PASSIVE, DEATH_MULT, STAT_FLOOR } from "./config.js";
import { spawnPos, clampMap, resolveObstacles, inOwnBase, surfaceHeight, isWater, groundHeight, WATER_Y } from "./world.js";
import { log, logKill } from "./log.js";
import { makeBody } from "./body.js";
import { footstep } from "./sfx.js";

const _c = new THREE.Vector3();
let _trailTex;
function trailTex() {
  if (_trailTex) return _trailTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.28)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _trailTex = new THREE.CanvasTexture(c);
  _trailTex.colorSpace = THREE.SRGBColorSpace;
  return _trailTex;
}
function lowestY(root) {
  let m = Infinity;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          _c.set(x, y, z);
          o.localToWorld(_c);
          if (_c.y < m) m = _c.y;
        }
      }
    }
  });
  return m;
}

export class Personaje {
  constructor(def, indexInTeam, teamCount, scene) {
    this.id = def.id;
    this.nombre = def.nombre;
    this.faccion = def.faccion;
    this.s = { ...def.stats };
    this.volando = false;
    this.flyAlt = 0;
    this.swim = 0;
    this.flyBlend = 0;
    this.vy = 0;
    this.lift = 0;
    this._crouch = 0;
    this._launched = false;
    this.vx = 0;
    this.vz = 0;
    this._runT = 0;
    this.esfera = null;
    this.yaw = def.faccion === "z" ? 0 : Math.PI;
    this.cooldown = 0;
    this.controller = "ia";
    this.orig = {
      ataque: this.s.ataque,
      defensa: this.s.defensa,
      velocidad: this.s.velocidad,
      kiMax: this.s.kiMax,
    };

    const h = this.s.altura;
    this.mesh = makeBody(h, def.look);
    this.mesh.rotation.order = "YXZ";
    this.height = 1.55 * h;
    const p = spawnPos(def.faccion, indexInTeam, teamCount);
    this.mesh.position.copy(p);
    this.stickY();
    scene.add(this.mesh);
    this._trailN = 40;
    const tpos = new Float32Array(this._trailN * 3);
    this._trailGeo = new THREE.BufferGeometry();
    this._trailGeo.setAttribute("position", new THREE.BufferAttribute(tpos, 3));
    this._trailPts = [];
    this.trail = new THREE.Points(
      this._trailGeo,
      new THREE.PointsMaterial({
        map: trailTex(),
        color: def.faccion === "z" ? 0xff3d00 : 0x00e5ff,
        size: this.height * 1.85,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    scene.add(this.trail);
    this.teamRing = new THREE.Mesh(
      new THREE.CircleGeometry(0.72 * h, 22),
      new THREE.MeshBasicMaterial({
        map: trailTex(),
        color: def.faccion === "z" ? 0xff3d00 : 0x2979ff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.teamRing.rotation.x = -Math.PI / 2;
    scene.add(this.teamRing);

    this.ballMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffeb3b })
    );
    this.ballMark.visible = false;
    this.mesh.add(this.ballMark);
    this.ballMark.position.y = this.height + 0.55;

    const tag = document.createElement("div");
    tag.className = `nametag ${def.faccion}`;
    tag.innerHTML = `<span class="nm">${this.nombre}</span><div class="hp-mini"><i></i></div>`;
    this.hpWrap = tag.querySelector(".hp-mini");
    this.hpFill = tag.querySelector("i");
    this.nameLabel = new CSS2DObject(tag);
    this.nameLabel.position.set(0, this.height + 0.28, 0);
    this.mesh.add(this.nameLabel);

    this.kiAura = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        map: trailTex(),
        color: 0x80deea,
        size: this.height * 1.55,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this._kiN = 24;
    this.kiAura.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this._kiN * 3), 3));
    this.kiAura.visible = false;
    this.kiAura.position.y = this.height * 0.42;
    this.mesh.add(this.kiAura);
    this.kiHalo = new THREE.Points(
      this.kiAura.geometry,
      new THREE.PointsMaterial({
        map: trailTex(),
        color: 0xe0f7fa,
        size: this.height * 2.6,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.kiHalo.visible = false;
    this.kiHalo.position.y = this.height * 0.42;
    this.mesh.add(this.kiHalo);
    this._kiCharge = false;
    this._kiPulse = 0;
    this.animT = 0;
    this.didMove = false;
    this.limbs = this.mesh.userData.limbs;
    this.dead = false;
    this.deadT = 0;
    this.stun = 0;
    this.st = { k: 0, a: 0, d: 0, dmg: 0, esf: 0 };
    this.hitBy = [];
  }

  pos() {
    return this.mesh.position;
  }

  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.dead) {
      this.deadT -= dt;
      this.flyAlt = 0;
      this.swim = 0;
      this.volando = false;
      this.vx *= Math.exp(-8 * dt);
      this.vz *= Math.exp(-8 * dt);
      this.mesh.position.x += this.vx * dt;
      this.mesh.position.z += this.vz * dt;
      this.mesh.rotation.x = Math.min(1.22, this.mesh.rotation.x + dt * 5);
      clampMap(this.mesh.position);
      resolveObstacles(this.mesh.position, 0);
      this.stickY();
      if (this.teamRing) this.teamRing.visible = false;
      if (this.deadT <= 0) this.respawn();
      return;
    }
    if (this.s.ki > 0) this.s.hp = Math.min(this.s.hpMax, this.s.hp + HP_REGEN * dt);
    this.s.ki = Math.min(this.s.kiMax, this.s.ki + KI_REGEN_PASSIVE * dt);
    if (this.flyAlt > 0.2 && !this.inSwim()) {
      this.s.ki = Math.max(0, this.s.ki - 2.55 * dt);
    }
    this.rush = (this.rush || 0) * Math.exp(-5 * dt);
    this.ballMark.visible = this.esfera != null && !this._fpCam;
    this._kiPulse += dt * 6;
    const on = this._kiCharge || (this.superHold || 0) > 0.04 || (this.poseBlast || 0) > 0.05;
    const supering = (this.superHold || 0) > 0.04 || (this.poseBlast || 0) > 0.12;
    this.kiAura.visible = on;
    this.kiHalo.visible = on;
    if (on) {
      const pulse = this._kiPulse;
      const arr = this.kiAura.geometry.attributes.position.array;
      const h = this.height;
      for (let i = 0; i < this._kiN; i++) {
        const a = (i / this._kiN) * Math.PI * 2 + pulse * 0.35;
        const r = (0.22 + (i % 5) * 0.07) * h + Math.sin(pulse * 1.7 + i) * 0.12 * h;
        arr[i * 3] = Math.cos(a) * r;
        arr[i * 3 + 1] = (i / this._kiN - 0.35) * h * 1.15 + Math.sin(pulse * 2.1 + i * 0.7) * 0.18 * h;
        arr[i * 3 + 2] = Math.sin(a) * r;
      }
      this.kiAura.geometry.attributes.position.needsUpdate = true;
      const col = supering ? 0xffc107 : 0x4dd0e1;
      this.kiAura.material.color.setHex(col);
      this.kiHalo.material.color.setHex(supering ? 0xfff59d : 0xe0f7fa);
      this.kiAura.material.opacity = supering ? 0.5 : 0.4;
      this.kiAura.material.size = this.height * (supering ? 1.9 : 1.55);
      this.kiHalo.material.size = this.height * (supering ? 3.1 : 2.6);
    }
    if ((this.hitstop || 0) <= 0) {
      this.mesh.position.x += this.vx * dt;
      this.mesh.position.z += this.vz * dt;
      this.vx *= Math.exp(-5 * dt);
      this.vz *= Math.exp(-5 * dt);
    }
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
    if (Math.abs(this.vz) < 0.05) this.vz = 0;
    clampMap(this.mesh.position);
    resolveObstacles(this.mesh.position, this.flyAlt || 0);
    this.applyFlight(dt);
    this.stickY();
    this.animate(dt);
    this._kiSlow = this._kiCharge;
    this._kiCharge = false;
    this.mesh.rotation.y = this.yaw;
    this.updateTrail();
    if (this.teamRing) {
      this.teamRing.visible = !this.dead && !this._fpCam;
      this.teamRing.position.set(this.mesh.position.x, this.mesh.position.y + 0.06, this.mesh.position.z);
    }
  }

  updateTrail() {
    const fly = !this.dead && this.flyAlt > 0.4 && !this.inSwim();
    const p = this.mesh.position;
    const moving =
      this._tx != null && Math.hypot(p.x - this._tx, p.y - this._ty, p.z - this._tz) > 0.2;
    this._tx = p.x;
    this._ty = p.y;
    this._tz = p.z;
    if (fly && moving) {
      this._trailPts.push(p.x, p.y + 0.35, p.z);
      while (this._trailPts.length > this._trailN * 3) this._trailPts.splice(0, 3);
    } else if (this._trailPts.length) {
      this._trailPts.splice(0, fly ? 9 : 6);
    }
    const n = (this._trailPts.length / 3) | 0;
    this.trail.visible = n >= 2;
    if (n < 2) return;
    const arr = this._trailGeo.attributes.position.array;
    arr.fill(0);
    for (let i = 0; i < this._trailPts.length; i++) arr[i] = this._trailPts[i];
    this._trailGeo.setDrawRange(0, n);
    this._trailGeo.attributes.position.needsUpdate = true;
  }

  knock(from, force) {
    const dx = this.pos().x - from.x;
    const dz = this.pos().z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    this.vx += (dx / len) * force;
    this.vz += (dz / len) * force;
  }

  animate(dt) {
    const { armL, armR, legL, legR, kneeL, kneeR, elbowL, elbowR, torsoG, hips, waistY, hipY, headG } = this.limbs;
    this.posePunch = Math.max(0, (this.posePunch || 0) - dt);
    this.hitstop = Math.max(0, (this.hitstop || 0) - dt);
    this.poseBlast = Math.max(0, (this.poseBlast || 0) - dt);
    this.stun = Math.max(0, (this.stun || 0) - ((this.hitstop || 0) > 0 ? 0 : dt));
    const swimming = this.inSwim();
    const swimGo = swimming && (this.didMove || (this.rush || 0) > 0.18);
    const hopping = !!(this._hop || this._wantJump);
    const target =
      hopping || swimGo || (this.volando && !swimming && !hopping && (this.didMove || (this.rush || 0) > 0.28))
        ? hopping
          ? 0
          : 1
        : 0;
    const lam = target > this.flyBlend ? 2.15 : 3.35;
    this.flyBlend = THREE.MathUtils.damp(this.flyBlend, target, lam, dt);
    const u = this.flyBlend;
    const s = u * u * (3 - 2 * u);
    let pitch = 1.52 * s;
    if (this._kiCharge || (this.superHold || 0) > 0.04 || hopping) pitch = 0;
    else if (!swimming && this.didMove && this.flyAlt < 0.2) {
      pitch = (this.rush || 0) > 0.82 ? 0.38 : 0.12;
    }
    this.mesh.rotation.x = THREE.MathUtils.damp(this.mesh.rotation.x, pitch, 7.5, dt);
    let dy = this.yaw - (this._yawPrev ?? this.yaw);
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this._yawPrev = this.yaw;
    this._yawRate = THREE.MathUtils.damp(this._yawRate || 0, dy / Math.max(dt, 0.008), 9, dt);
    const bank = this.dead ? 0 : THREE.MathUtils.clamp(-(this._yawRate) * 0.22 * s, -0.55, 0.55);
    this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, bank, 7.2, dt);
    const k = Math.min(1, dt * (5.5 + (1 - s) * 6));
    const charging = this._kiCharge || (this.superHold || 0) > 0.04;
    if (!charging && waistY != null) {
      const e = Math.min(1, dt * 10);
      torsoG.position.y += (waistY - torsoG.position.y) * e;
      if (hips) hips.position.y += (waistY - hips.position.y) * e;
      if (hipY != null) {
        legL.position.y += (hipY - legL.position.y) * e;
        legR.position.y += (hipY - legR.position.y) * e;
      }
    }
    const lx = (o, t) => {
      o.rotation.x += (t - o.rotation.x) * k;
    };
    const lz = (o, t) => {
      o.rotation.z += (t - o.rotation.z) * k;
    };
    if (this.stun > 0) {
      lx(armL, 0.7);
      lx(armR, 0.7);
      lz(armL, 0.2);
      lz(armR, -0.2);
      lx(torsoG, -0.25);
      lx(headG, 0.2);
      if (kneeL) lx(kneeL, 0.35);
      if (kneeR) lx(kneeR, 0.35);
      if (elbowL) lx(elbowL, -0.5);
      if (elbowR) lx(elbowR, -0.5);
      this.didMove = false;
      return;
    }
    if (this.posePunch > 0) {
      const st = this.punchStep || 0;
      if (st === 1) {
        armL.rotation.x = -2.15;
        armL.rotation.z = 0.55;
        armR.rotation.x = 0.55;
        armR.rotation.z = -0.25;
        if (elbowL) elbowL.rotation.x = -0.2;
        if (elbowR) elbowR.rotation.x = -0.85;
        lx(legL, -0.2);
        lx(legR, 0.28);
        if (kneeL) lx(kneeL, 0.15);
        if (kneeR) lx(kneeR, 0.4);
        lx(torsoG, 0.22);
        lx(headG, -0.12);
      } else if (st === 2) {
        armL.rotation.x = -0.35;
        armR.rotation.x = -0.55;
        armL.rotation.z = 0.45;
        armR.rotation.z = -0.55;
        if (elbowL) elbowL.rotation.x = -0.7;
        if (elbowR) elbowR.rotation.x = -0.7;
        lx(legL, 0.28);
        lx(legR, -1.38);
        if (kneeL) lx(kneeL, 0.45);
        if (kneeR) lx(kneeR, -0.22);
        lx(torsoG, 0.08);
        lx(headG, 0.1);
      } else {
        armR.rotation.x = -2.2;
        armR.rotation.z = -0.35;
        armL.rotation.x = 0.45;
        armL.rotation.z = 0.35;
        if (elbowR) elbowR.rotation.x = -0.15;
        if (elbowL) elbowL.rotation.x = -0.9;
        lx(legL, 0.22);
        lx(legR, -0.18);
        if (kneeL) lx(kneeL, 0.35);
        if (kneeR) lx(kneeR, 0.2);
        lx(torsoG, 0.28);
        lx(headG, -0.15);
      }
      this.didMove = false;
      return;
    }
    if (this.poseBlast > 0) {
      lx(armR, -1.45);
      lx(armL, -1.25);
      lz(armR, 0.25);
      lz(armL, -0.25);
      lx(legL, 0.15);
      lx(legR, 0.15);
      lx(torsoG, 0.28);
      lx(headG, -0.15);
      this.didMove = false;
      return;
    }
    if (this._grabbing || (this.grabT || 0) > 0.04) {
      armL.rotation.x = 0.15;
      armR.rotation.x = 1.25;
      armL.rotation.z = 0.1;
      armR.rotation.z = -0.08;
      if (elbowL) elbowL.rotation.x = -0.35;
      if (elbowR) elbowR.rotation.x = -0.95;
      legL.rotation.x = 0.28;
      legR.rotation.x = 0.28;
      if (kneeL) kneeL.rotation.x = 0.42;
      if (kneeR) kneeR.rotation.x = 0.42;
      lx(torsoG, 0.12);
      lx(headG, 0.2);
      if (hipY != null) {
        legL.position.y = hipY;
        legR.position.y = hipY;
      }
      if (waistY != null) {
        torsoG.position.y = waistY;
        if (hips) hips.position.y = waistY;
      }
      const ground = this.mesh.position.y;
      const err = (lowestY(legL) + lowestY(legR)) * 0.5 - ground;
      if (Number.isFinite(err)) {
        torsoG.position.y -= err;
        if (hips) hips.position.y -= err;
        legL.position.y -= err;
        legR.position.y -= err;
      }
      this.didMove = false;
      return;
    }
    if (this._hop || this._wantJump) {
      this._strideBob = 0;
      const air = this.flyAlt > 0.12;
      const crouch = this._wantJump && !air;
      lx(legL, crouch ? 0.55 : air ? 0.22 : 0.12);
      lx(legR, crouch ? 0.55 : air ? 0.22 : 0.12);
      if (kneeL) lx(kneeL, crouch ? 0.95 : air ? 0.35 : 0.2);
      if (kneeR) lx(kneeR, crouch ? 0.95 : air ? 0.35 : 0.2);
      lx(armL, air ? 0.35 : 0.15);
      lx(armR, air ? 0.35 : 0.15);
      if (elbowL) lx(elbowL, -0.4);
      if (elbowR) lx(elbowR, -0.4);
      lx(torsoG, 0);
      lx(headG, 0);
      this.didMove = false;
      return;
    }
    if (this._kiCharge || (this.superHold || 0) > 0.04) {
      armL.rotation.x = 0;
      armR.rotation.x = 0;
      armL.rotation.z = 0.12;
      armR.rotation.z = -0.12;
      if (elbowL) elbowL.rotation.x = -1.55;
      if (elbowR) elbowR.rotation.x = -1.55;
      lx(torsoG, 0);
      lx(headG, 0);
      legL.rotation.x = 0.32;
      legR.rotation.x = 0.32;
      if (kneeL) kneeL.rotation.x = 0.48;
      if (kneeR) kneeR.rotation.x = 0.48;
      if (hipY != null) {
        legL.position.y = hipY;
        legR.position.y = hipY;
      }
      if (waistY != null) {
        torsoG.position.y = waistY;
        if (hips) hips.position.y = waistY;
      }
      const ground = this.mesh.position.y;
      const err = (lowestY(legL) + lowestY(legR)) * 0.5 - ground;
      if (Number.isFinite(err)) {
        torsoG.position.y -= err;
        if (hips) hips.position.y -= err;
        legL.position.y -= err;
        legR.position.y -= err;
      }
      this.didMove = false;
      return;
    }
    lz(armL, 0.7 * s);
    lz(armR, -0.2 * s);
    if (swimming && !swimGo) {
      this._strideBob = 0;
      this.animT += dt * 1.55;
      const w = Math.sin(this.animT);
      lx(armL, -0.4 + w * 0.28);
      lx(armR, -0.4 - w * 0.28);
      lz(armL, 0.62);
      lz(armR, -0.62);
      lx(legL, 0.18 + w * 0.14);
      lx(legR, 0.18 - w * 0.14);
      if (kneeL) lx(kneeL, 0.5 + w * 0.12);
      if (kneeR) lx(kneeR, 0.5 - w * 0.12);
      if (elbowL) lx(elbowL, -0.55);
      if (elbowR) lx(elbowR, -0.55);
      lx(torsoG, 0);
      lx(headG, 0.06);
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, w * 0.05, 4.5, dt);
    } else if (swimming) {
      this._strideBob = 0;
      this.animT += dt * (4.8 + (this.rush || 0) * 2.6);
      const t = this.animT;
      const stroke = (ph) => -1.4 + Math.sin(ph) * 1.65;
      armL.rotation.x = stroke(t);
      armR.rotation.x = stroke(t + Math.PI);
      armL.rotation.z = 0.45 + Math.max(0, Math.cos(t)) * 0.85;
      armR.rotation.z = -(0.45 + Math.max(0, Math.cos(t + Math.PI)) * 0.85);
      const kick = Math.sin(t * 2.15);
      legL.rotation.x = kick * 0.5;
      legR.rotation.x = -kick * 0.5;
      if (kneeL) kneeL.rotation.x = 0.28 + Math.max(0, -kick) * 0.7;
      if (kneeR) kneeR.rotation.x = 0.28 + Math.max(0, kick) * 0.7;
      if (elbowL) elbowL.rotation.x = -0.85;
      if (elbowR) elbowR.rotation.x = -0.85;
      lx(torsoG, 0.06);
      lx(headG, -0.45);
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, Math.sin(t) * 0.22, 5.5, dt);
    } else if (s > 0.04) {
      this._strideBob = 0;
      lx(torsoG, 0.06 * s);
      lx(headG, -1.48 * s);
      lx(armR, -2.9 * s);
      lx(armL, 0.45 * s);
      lx(legL, 0.12 * s);
      lx(legR, 0.2 * s);
      if (kneeL) lx(kneeL, 0.25);
      if (kneeR) lx(kneeR, 0.35);
    } else if (this.volando) {
      this._strideBob = 0;
      lx(armL, 0.15);
      lx(armR, 0.15);
      lz(armL, 0.35);
      lz(armR, -0.35);
      lx(legL, 0.05);
      lx(legR, 0.05);
      if (kneeL) lx(kneeL, 0.2);
      if (kneeR) lx(kneeR, 0.2);
      if (elbowL) lx(elbowL, -0.35);
      if (elbowR) lx(elbowR, -0.35);
      lx(torsoG, 0);
      lx(headG, 0);
    } else if (this.didMove) {
      const rush = this.rush || 0;
      const sprint = rush > 0.82;
      const hz = sprint ? 1.88 : 0.92;
      this.animT += dt * hz * Math.PI * 2;
      const hip = (ph) => {
        let u = ph / (Math.PI * 2);
        u -= Math.floor(u);
        const fwd = sprint ? -1.48 : -0.92;
        const back = sprint ? 1.08 : 0.58;
        if (u < 0.64) {
          const t = u / 0.64;
          const e = t * t * (3 - 2 * t);
          return THREE.MathUtils.lerp(fwd, back, e);
        }
        const t = (u - 0.64) / 0.36;
        const e = t * t * (3 - 2 * t);
        return THREE.MathUtils.lerp(back, fwd, e);
      };
      const kn = (ph) => {
        let u = ph / (Math.PI * 2);
        u -= Math.floor(u);
        if (u < 0.64) return 0.08 + Math.sin((u / 0.64) * Math.PI) * 0.16;
        const t = (u - 0.64) / 0.36;
        return 0.22 + Math.sin(t * Math.PI) * (sprint ? 1.92 : 1.32);
      };
      const p = this.animT;
      const q = p + Math.PI;
      const g = Math.min(1, dt * 6.2);
      const sx = (o, v) => {
        o.rotation.x += (v - o.rotation.x) * g;
      };
      sx(legL, hip(p));
      sx(legR, hip(q));
      if (kneeL) sx(kneeL, kn(p));
      if (kneeR) sx(kneeR, kn(q));
      sx(armL, -hip(p) * (sprint ? 1.2 : 0.7));
      sx(armR, -hip(q) * (sprint ? 1.2 : 0.7));
      if (elbowL) sx(elbowL, -((sprint ? 1.35 : 0.52) + Math.sin(p) * (sprint ? 0.28 : 0.12)));
      if (elbowR) sx(elbowR, -((sprint ? 1.35 : 0.52) + Math.sin(q) * (sprint ? 0.28 : 0.12)));
      lz(armL, sprint ? 0.34 : 0.12);
      lz(armR, sprint ? -0.34 : -0.12);
      lx(torsoG, (sprint ? 0.2 : 0.06) + Math.sin(p * 2) * 0.05);
      torsoG.rotation.y = Math.sin(p) * (sprint ? 0.1 : 0.07);
      lx(headG, (sprint ? -0.14 : 0) - Math.sin(p * 2) * 0.04);
      this._strideBob = (1 - Math.cos(p * 2)) * 0.032 * (sprint ? 1.15 : 0.6);
      const plant = Math.floor(p / Math.PI);
      if (plant !== this._plant) {
        this._plant = plant;
        const pp = this.pos();
        footstep(sprint, pp.x, pp.y, pp.z);
      }
    } else {
      this._strideBob = THREE.MathUtils.damp(this._strideBob || 0, 0, 12, dt);
      lx(armL, 0);
      lx(armR, 0);
      lx(legL, 0);
      lx(legR, 0);
      if (kneeL) lx(kneeL, 0.08);
      if (kneeR) lx(kneeR, 0.08);
      if (elbowL) lx(elbowL, -0.12);
      if (elbowR) lx(elbowR, -0.12);
      lx(torsoG, 0);
      torsoG.rotation.y += (0 - torsoG.rotation.y) * k;
      lx(headG, 0);
    }
    const c = this._crouch || 0;
    if (c > 0.04 && this.flyAlt < 0.4) {
      lx(torsoG, 0.32 * c);
      lx(legL, 0.9 * c);
      lx(legR, 0.9 * c);
      if (kneeL) lx(kneeL, 1.05 * c);
      if (kneeR) lx(kneeR, 1.05 * c);
      if (elbowL) lx(elbowL, -0.45 * c);
      if (elbowR) lx(elbowR, -0.45 * c);
      lx(armL, 0.4 * c);
      lx(armR, 0.4 * c);
      lx(headG, 0.12 * c);
    }
    this.didMove = false;
  }

  charge(dt) {
    if (this.stun > 0) return;
    this._kiCharge = true;
    this.s.ki = Math.min(this.s.kiMax, this.s.ki + (KI_REGEN - KI_REGEN_PASSIVE) * dt);
  }

  inSwim() {
    return this.flyAlt < 0.18 && isWater(this.mesh.position.x, this.mesh.position.z);
  }

  stickY() {
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;
    const lean = this.height * (1 - Math.cos(this.mesh.rotation.x)) * 0.42;
    if (this.inSwim()) {
      const maxD = Math.max(0, WATER_Y - groundHeight(x, z) - 0.5);
      this.swim = Math.min(this.swim, maxD);
      this.mesh.position.y = WATER_Y - this.swim - 0.32 + lean * 0.25 + ((this.rush || 0) < 0.18 ? Math.sin((this.animT || 0) * 1.55) * 0.1 : 0);
    } else {
      this.swim = 0;
      this.mesh.position.y = surfaceHeight(x, z) + this.flyAlt + lean + (this._strideBob || 0);
    }
  }

  applyFlight(dt) {
    const lift = this.lift || 0;
    this.lift = 0;
    if (this.inSwim() && !(lift > 0 && this.swim <= 0.08)) {
      const maxD = Math.max(0, WATER_Y - groundHeight(this.mesh.position.x, this.mesh.position.z) - 0.5);
      if (lift < 0) this.swim = Math.min(maxD, this.swim + 5.2 * dt);
      else if (lift > 0) this.swim = Math.max(0, this.swim - 6.2 * dt);
      this.vy = 0;
      this.flyAlt = 0;
      this.volando = false;
      this._launched = false;
      return;
    }
    if (this.inSwim() && lift > 0) this.swim = 0;
    if (this._wantJump) {
      this._jumpWait = (this._jumpWait || 0) - dt;
      if (this._jumpWait <= 0) {
        this._wantJump = false;
        if (this.flyAlt < 0.08 && !this.inSwim()) {
          this.vy = 7.4;
          this._hop = true;
        }
      }
    }
    if (this._hop && lift <= 0) {
      this.vy -= 26 * dt;
      this._crouch = 0;
    } else if (lift > 0 && !this._launched && this.flyAlt < 0.28 && !this._hop) {
      this._crouch = Math.min(1, (this._crouch || 0) + dt / 0.14);
      if (this._crouch >= 1) {
        this.vy = 10.8;
        this._launched = true;
        this._crouch = 0;
      }
    } else if (lift > 0) {
      this.vy = Math.min(11, this.vy + 15 * dt);
      this._crouch = Math.max(0, (this._crouch || 0) - dt * 8);
    } else if (lift < 0) {
      this.vy = Math.max(-17, this.vy - 24 * dt);
      this._crouch = 0;
    } else {
      this._crouch = Math.max(0, (this._crouch || 0) - dt * 7);
      if (this.flyAlt > 0.02) this.vy *= Math.exp(-5.2 * dt);
      else {
        this.vy = 0;
        this._launched = false;
      }
    }
    this.flyAlt = Math.max(0, Math.min(FLY_MAX, this.flyAlt + this.vy * dt));
    if (this.flyAlt <= 0.001) {
      this.flyAlt = 0;
      this.vy = 0;
      this._launched = false;
      this.volando = false;
    } else this.volando = this.flyAlt > 0.2 && !this._hop;
    if (this.flyAlt <= 0.001) this._hop = false;
  }

  spaceDown() {
    if (this.stun > 0 || this.dead) return;
    if (this.inSwim() || this.flyAlt > 0.22) {
      this.climb();
      return;
    }
    const t = performance.now() / 1000;
    if (t - (this._spaceT || 0) < 0.28) {
      this._spaceT = 0;
      this._wantJump = false;
      this._hop = false;
      this._launched = true;
      this.vy = 10.8;
      this.climb();
    } else {
      this._spaceT = t;
      this._wantJump = true;
      this._jumpWait = 0.26;
    }
  }

  climb() {
    if (this.stun > 0) return;
    this.lift = 1;
  }

  descend() {
    this.lift = -1;
  }

  setFly(on) {
    if (!on) {
      this.flyAlt = 0;
      this.swim = 0;
      this.volando = false;
      this.vy = 0;
      this._launched = false;
      this._crouch = 0;
    }
    this.stickY();
  }

  move(dir, run, dt) {
    if (this.dead || this.stun > 0 || (this.hitstop || 0) > 0) return;
    const charging = this._kiCharge || this._kiSlow || (this.superHold || 0) > 0.04;
    const punching = (this.posePunch || 0) > 0;
    if (charging || punching) run = false;
    let mul = this.flyAlt > 0.2 ? 1.42 : 0.42;
    if (charging) mul *= 0.22;
    if (punching) mul *= 0.16;
    if (this.inSwim()) {
      mul = 0.34;
      this._runT = 0;
      if (run && this.s.ki > 0) {
        mul = 0.92;
        this.s.ki = Math.max(0, this.s.ki - 26 * dt);
      }
    } else if (this.flyAlt > 0.2) {
      this._runT = Math.max(0, this._runT - dt / 0.18);
      if (run && this.s.ki > 0) {
        mul *= 1.85;
        this.s.ki = Math.max(0, this.s.ki - 4 * dt);
      }
    } else {
      if (run && this.s.ki > 0) {
        this._runT = Math.min(1, this._runT + dt / 0.52);
        this.s.ki = Math.max(0, this.s.ki - 1.35 * dt * this._runT);
      } else {
        this._runT = Math.max(0, this._runT - dt / 0.22);
      }
      if (this._runT > 0) {
        const t = this._runT * this._runT;
        mul *= 1 + 4.03 * t;
      }
    }
    const spd = this.s.velocidad * mul * (this.esfera != null ? 0.55 : 1);
    this._groundSpd = this.flyAlt > 0.2 || this.inSwim() ? 0 : spd;
    this.mesh.position.addScaledVector(dir, spd * dt);
    clampMap(this.mesh.position);
    resolveObstacles(this.mesh.position, this.flyAlt || 0);
    this.stickY();
    this.mesh.rotation.y = this.yaw;
    this.didMove = true;
    const runFeel = this.inSwim() ? run : this.flyAlt > 0.2 ? run : this._runT > 0.55;
    this.rush = Math.max(
      this.rush || 0,
      this.inSwim() ? (run ? 0.92 : 0.35) : runFeel ? 1 : this.flyAlt > 0.2 ? 0.75 : 0.5
    );
  }

  dropBall(balls, silent = false) {
    if (this.esfera == null) return;
    const n = this.esfera;
    balls.drop(n, this.pos().x, this.pos().z);
    this.esfera = null;
    if (!silent) log(`${this.nombre} soltó la esfera ${n}`, this.faccion);
  }

  die(balls, killer, ki) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 2.8;
    this.killedBy = killer?.nombre || "";
    this.killedKi = !!ki;
    this.killedTeam = killer?.faccion || "";
    this.s.hp = 0;
    this.setFly(false);
    this.volando = false;
    const n = this.esfera;
    if (n != null) {
      const a = Math.random() * Math.PI * 2;
      balls.drop(n, this.pos().x + Math.cos(a) * 2.2, this.pos().z + Math.sin(a) * 2.2);
      this.esfera = null;
      log(`${this.nombre} ha perdido la esfera`, this.faccion);
    }
    if (killer) logKill(killer.nombre, this.nombre, ki, "", killer.faccion);
    else log(`${this.nombre} cayó`, this.faccion);
    for (const k of ["ataque", "defensa", "velocidad", "kiMax"]) {
      this.s[k] = Math.max(this.orig[k] * STAT_FLOOR, this.s[k] * DEATH_MULT);
    }
    this.vx *= 0.3;
    this.vz *= 0.3;
  }

  respawn() {
    this.dead = false;
    this.deadT = 0;
    this.killedBy = "";
    this.mesh.rotation.x = 0;
    this.s.hp = this.s.hpMax;
    this.s.ki = this.s.kiMax;
    const p = spawnPos(this.faccion, 0, 1);
    this.mesh.position.copy(p);
    this.vx = 0;
    this.vz = 0;
    this.setFly(false);
  }

  tryGrab(balls, dt, match) {
    if (this.dead || this.esfera != null || this.volando || this.flyAlt > 0.2) {
      this.grabT = 0;
      this._grabbing = false;
      return;
    }
    const b = balls.near(this);
    if (!b) {
      this.grabT = 0;
      this._grabbing = false;
      return;
    }
    this._grabbing = true;
    this.yaw = Math.atan2(b.mesh.position.x - this.pos().x, b.mesh.position.z - this.pos().z);
    this.grabT = (this.grabT || 0) + dt;
    if (this.grabT >= 0.52) {
      const got = balls.pickup(this);
      if (got?.stole) match.syncBalls(balls);
      this.grabT = 0;
      this._grabbing = false;
    }
  }

  tryDeposit(match, balls) {
    if (this.esfera == null || this.volando || this.flyAlt > 0.2 || !inOwnBase(this.pos(), this.faccion)) return false;
    const n = this.esfera;
    balls.placeInBase(n, this.faccion);
    match.deposit(this.faccion, n, this.nombre, balls);
    this.st.esf++;
    this.esfera = null;
    log(`${this.nombre} depositó la esfera ${n}`, this.faccion);
    return true;
  }
}

export function resolvePeople(people) {
  for (let i = 0; i < people.length; i++) {
    const a = people[i];
    if (a.dead) continue;
    const ra = 0.38 + a.height * 0.08;
    for (let j = i + 1; j < people.length; j++) {
      const b = people[j];
      if (b.dead) continue;
      if (Math.abs(a.mesh.position.y - b.mesh.position.y) > (a.height + b.height) * 0.48) continue;
      const dx = a.mesh.position.x - b.mesh.position.x;
      const dz = a.mesh.position.z - b.mesh.position.z;
      let d = Math.hypot(dx, dz);
      const minD = ra + 0.38 + b.height * 0.08;
      if (d >= minD) continue;
      if (d < 1e-4) {
        const a0 = Math.random() * Math.PI * 2;
        a.mesh.position.x += Math.cos(a0) * 0.01;
        a.mesh.position.z += Math.sin(a0) * 0.01;
        d = 0.01;
      }
      const push = (minD - d) * 0.5;
      const nx = dx / d;
      const nz = dz / d;
      a.mesh.position.x += nx * push;
      a.mesh.position.z += nz * push;
      b.mesh.position.x -= nx * push;
      b.mesh.position.z -= nz * push;
      const rvx = a.vx - b.vx;
      const rvz = a.vz - b.vz;
      if (rvx * nx + rvz * nz < 0) {
        a.vx -= rvx * 0.5;
        a.vz -= rvz * 0.5;
        b.vx += rvx * 0.5;
        b.vz += rvz * 0.5;
      }
      for (const p of [a, b]) {
        clampMap(p.mesh.position);
        resolveObstacles(p.mesh.position, p.flyAlt || 0);
        p.stickY();
      }
    }
  }
}
