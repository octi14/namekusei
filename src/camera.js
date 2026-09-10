import * as THREE from "three";
import { surfaceHeight } from "./world.js";

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
    const goku = !!p.mesh?.userData?.gokuVis;
    const head = p.limbs?.headG;
    if (goku) {
      if (p.limbs?.neck) p.limbs.neck.visible = false;
      p.mesh.traverse((o) => {
        if (o.userData?.capsuleMesh) o.visible = false;
      });
    } else {
      if (head) head.visible = !on;
      if (p.limbs?.neck) p.limbs.neck.visible = !on;
    }
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
