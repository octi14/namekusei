import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { FLY_MAX, FLY_UP, FLY_DOWN, HP_REGEN, KI_REGEN, KI_REGEN_PASSIVE, DEATH_MULT, STAT_FLOOR } from "./config.js";
import { spawnPos, clampMap, resolveObstacles, inOwnBase, surfaceHeight, isWater, groundHeight, WATER_Y } from "./world.js";
import { resolveShipCollisions } from "./bases.js";
import { log, logKill } from "./log.js";
import { makeBody, sculptAltura } from "./body.js";
import { lookFor } from "./looks.js";
import { makeRiggedBody, gokuReady, CHAR_RIG } from "./gokuRig.js";
import { footstep, playSfx, atPos, stopSfxLoop } from "./sfx.js";
import { spawnSpeedStreak, spawnImpactRing } from "./powers.js";
import { loadClips, evalClip, clipIsCustom } from "./capsuleAnim.js";

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
    this.poseBlastArm = "R";
    this.poseBlastTwo = false;
    this.vy = 0;
    this.lift = 0;
    this._crouch = 0;
    this._duckAmt = 0;
    this._duck = false;
    this._launched = false;
    this.vx = 0;
    this.vz = 0;
    this._mvx = 0;
    this._mvz = 0;
    this._runT = 0;
    this.esfera = null;
    this.yaw = def.faccion === "z" ? 0 : Math.PI;
    this.cooldown = 0;
    this.controller = "ia";
    this.canSsj = !!def.canSsj;
    this.ssj = false;
    this._ssjAtk = 0;
    this._ssjVel = 0;
    this.lookHairC = def.look?.hairC ?? 0x111111;
    this.orig = {
      ataque: this.s.ataque,
      defensa: this.s.defensa,
      velocidad: this.s.velocidad,
      kiMax: this.s.kiMax,
    };

    const mixamo = CHAR_RIG[def.nombre];
    const h = mixamo && gokuReady() ? this.s.altura * 1.21 : sculptAltura(def.nombre, this.s.altura);
    this.mesh = mixamo && gokuReady() ? makeRiggedBody(h, def.look, mixamo) : makeBody(h, { ...def.look, who: def.look?.who || def.nombre });
    this.mesh.rotation.order = "YXZ";
    this.height = 1.55 * h;
    const p = spawnPos(def.faccion, indexInTeam, teamCount);
    this.mesh.position.copy(p);
    this.stickY();
    scene.add(this.mesh);
    this._scene = scene;
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
        toneMapped: false,
      })
    );
    this._kiN = 48;
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
        toneMapped: false,
      })
    );
    this.kiHalo.visible = false;
    this.kiHalo.position.y = this.height * 0.42;
    this.mesh.add(this.kiHalo);
    // Anillo de carga en el suelo
    this.chargeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 1.05, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4dd0e1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.chargeRing.visible = false;
    scene.add(this.chargeRing);
    this._fxScratch = [];
    const glowMat = (color, opacity) =>
      new THREE.SpriteMaterial({
        map: trailTex(),
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    this.ssjGlow = new THREE.Sprite(glowMat(0xffe082, 0.22));
    this.ssjGlow.position.y = this.height * 0.48;
    this.ssjGlow.visible = false;
    this.mesh.add(this.ssjGlow);
    this.ssjHalo = new THREE.Sprite(glowMat(0xfff59d, 0.1));
    this.ssjHalo.position.y = this.height * 0.52;
    this.ssjHalo.visible = false;
    this.mesh.add(this.ssjHalo);
    this.chargeGlow = new THREE.Sprite(glowMat(0x4dd0e1, 0.22));
    this.chargeGlow.position.y = this.height * 0.45;
    this.chargeGlow.visible = false;
    this.mesh.add(this.chargeGlow);
    this.chargeHalo = new THREE.Sprite(glowMat(0xe0f7fa, 0.1));
    this.chargeHalo.position.y = this.height * 0.5;
    this.chargeHalo.visible = false;
    this.mesh.add(this.chargeHalo);
    this.blastBall = new THREE.Sprite(glowMat(0xfff59d, 0.7));
    this.blastBall.position.set(0, this.height * 0.72, this.height * 0.32);
    this.blastBall.visible = false;
    this.mesh.add(this.blastBall);
    this.blastBallHalo = new THREE.Sprite(glowMat(0xffffff, 0.28));
    this.blastBallHalo.position.copy(this.blastBall.position);
    this.blastBallHalo.visible = false;
    this.mesh.add(this.blastBallHalo);
    this.hitGlow = new THREE.Sprite(glowMat(0xffecb3, 0.9));
    this.hitGlow.position.y = this.height * 0.5;
    this.hitGlow.visible = false;
    this.mesh.add(this.hitGlow);
    this.hitFlash = 0;
    this.kiBubble = new THREE.Mesh(
      new THREE.SphereGeometry(this.height * 1.05, 22, 16),
      new THREE.MeshBasicMaterial({
        color: 0x4dd0e1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.kiBubble.position.y = this.height * 0.42;
    this.kiBubble.visible = false;
    this.mesh.add(this.kiBubble);
    this._kiBubbleT = 0;
    this._kiCharge = false;
    this._kiPulse = 0;
    this.animT = 0;
    this.didMove = false;
    this.limbs = this.mesh.userData.limbs;
    this.mesh.userData.syncRig?.();
    this.dead = false;
    this.deadT = 0;
    this.deadMax = 2.8;
    this.aliveFor = 0;
    this.spawnWave = 0;
    this.stun = 0;
    this.st = { k: 0, a: 0, d: 0, dmg: 0, esf: 0 };
    this.aiHeat = 0;
    this.hitBy = [];
    this.refreshAnims();
  }

  refreshAnims() {
    this._anims = loadClips(this.nombre);
    this._animCustom = {};
    for (const n of ["walk", "run", "hover", "fly", "charge", "idle", "swim", "swimIdle", "punch", "punchTwo", "punchKick", "elbow", "blast", "blastTwo", "crouch"]) {
      this._animCustom[n] = clipIsCustom(this.nombre, n);
    }
  }

  /** Aplica un clip del editor. bones: lista o "arms". mirror: espeja L/R. */
  applyEditorClip(name, phase, k, bones, mirror = false, scale = 1) {
    if (this.mesh.userData.syncRig) return false;
    if (!this._animCustom?.[name]) return false;
    const clip = this._anims?.[name];
    if (!clip?.keys?.length) return false;
    const pose = evalClip(clip, phase);
    if (mirror) {
      const swap = (a, b) => {
        const pa = pose[a];
        const pb = pose[b];
        if (!pa || !pb) return;
        pose[a] = [pb[0], -pb[1], -pb[2]];
        pose[b] = [pa[0], -pa[1], -pa[2]];
      };
      swap("armL", "armR");
      swap("elbowL", "elbowR");
      swap("wristL", "wristR");
      swap("legL", "legR");
      swap("kneeL", "kneeR");
    }
    const L = this.limbs;
    const node = {
      armL: L.armL,
      armR: L.armR,
      elbowL: L.elbowL,
      elbowR: L.elbowR,
      wristL: L.wristL,
      wristR: L.wristR,
      legL: L.legL,
      legR: L.legR,
      kneeL: L.kneeL,
      kneeR: L.kneeR,
      torso: L.torsoG,
      head: L.headG,
    };
    const ids =
      bones === "arms"
        ? ["armL", "armR", "elbowL", "elbowR", "wristL", "wristR"]
        : bones || Object.keys(node);
    for (const id of ids) {
      const o = node[id];
      const r = pose[id];
      if (!o || !r) continue;
      o.rotation.x += (r[0] * scale - o.rotation.x) * k;
      o.rotation.y += (r[1] * scale - o.rotation.y) * k;
      o.rotation.z += (r[2] * scale - o.rotation.z) * k;
    }
    if (bones !== "arms") {
      const d = (pose.drop || 0) * scale;
      this._poseDrop = d;
      const wy = L.waistY;
      const hy = L.hipY;
      if (wy != null) {
        L.torsoG.position.y += (wy - d - L.torsoG.position.y) * k;
        if (L.hips) L.hips.position.y += (wy - d - L.hips.position.y) * k;
      }
      if (hy != null) {
        if (L.legL) L.legL.position.y += (hy - d - L.legL.position.y) * k;
        if (L.legR) L.legR.position.y += (hy - d - L.legR.position.y) * k;
      }
    }
    return true;
  }

  rebuildBody() {
    if (CHAR_RIG[this.nombre] && gokuReady()) return;
    const look = lookFor(this.nombre, this.faccion, this.id);
    this.lookHairC = look.hairC ?? this.lookHairC;
    const extras = [
      this.ballMark, this.nameLabel, this.kiAura, this.kiHalo, this.ssjGlow, this.ssjHalo,
      this.chargeGlow, this.chargeHalo, this.blastBall, this.blastBallHalo, this.hitGlow, this.kiBubble,
    ].filter(Boolean);
    for (const e of extras) this.mesh.remove(e);
    const pos = this.mesh.position.clone();
    const quat = this.mesh.quaternion.clone();
    const parent = this.mesh.parent;
    parent?.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    const h = sculptAltura(this.nombre, this.s.altura);
    this.mesh = makeBody(h, { ...look, who: look.who || this.nombre });
    this.mesh.rotation.order = "YXZ";
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(quat);
    this.height = 1.55 * h;
    for (const e of extras) this.mesh.add(e);
    parent?.add(this.mesh);
    this.limbs = this.mesh.userData.limbs;
    this.mesh.userData.syncRig?.();
    this.refreshAnims();
  }

  pos() {
    return this.mesh.position;
  }

  setSsj(on) {
    if (!this.canSsj) return;
    on = !!on;
    if (this.ssj === on) return;
    this.ssj = on;
    if (on) {
      this._ssjAtk = this.s.ataque * 0.28;
      this._ssjVel = this.s.velocidad * 0.14;
      this.s.ataque += this._ssjAtk;
      this.s.velocidad += this._ssjVel;
    } else {
      this.s.ataque -= this._ssjAtk;
      this.s.velocidad -= this._ssjVel;
      this._ssjAtk = 0;
      this._ssjVel = 0;
    }
    const col = on ? 0xffe082 : this.lookHairC;
    this.mesh.traverse((o) => {
      if (o.material?.userData?.ssjHair) {
        o.material.color.setHex(col);
        o.material.emissive?.setHex(on ? 0xffc107 : 0x000000);
        if ("emissiveIntensity" in (o.material || {})) o.material.emissiveIntensity = on ? 0.7 : 0;
      }
    });
    if (this.ssjGlow) this.ssjGlow.visible = on;
    if (this.ssjHalo) this.ssjHalo.visible = on;
  }

  /** Limpia emissive residual del hitFlash viejo (no toca pelo SSJ). */
  _resetBodyEmissive() {
    this.mesh.traverse((o) => {
      if (!o.isMesh || !o.material?.emissive) return;
      if (o.material.userData?.ssjHair) return;
      if (o.userData._emBase == null && o.userData._emInt == null) return;
      o.material.emissive.setHex(o.userData._emBase ?? 0x000000);
      if ("emissiveIntensity" in o.material) o.material.emissiveIntensity = o.userData._emInt ?? 0;
      delete o.userData._emBase;
      delete o.userData._emInt;
    });
  }

  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.ssj) {
      this.s.ki = Math.max(0, this.s.ki - dt * 6);
      if (this.s.ki <= 1) this.setSsj(false);
    }
    this.iframes = Math.max(0, (this.iframes || 0) - dt);
    this.punchLunge = Math.max(0, (this.punchLunge || 0) - dt * 4);
    this.hitRecoil = Math.max(0, (this.hitRecoil || 0) - dt * 3.5);
    // Sacudida: spring back
    if ((this.hitShakeT || 0) > 0) {
      this.hitShakeT -= dt;
      const t = Math.max(0, this.hitShakeT) / 0.18;
      this.mesh.position.x += (this.hitShakeX || 0) * t * dt * 12;
      this.mesh.position.z += (this.hitShakeZ || 0) * t * dt * 12;
    }
    if (this.dead) {
      this.hitFlash = 0;
      if (this.hitGlow) this.hitGlow.visible = false;
      this.deadT -= dt;
      this.volando = false;
      this.swim = 0;
      if (this.flyAlt > 0.04) {
        this.vy = Math.max(-24, (this.vy || 0) - 32 * dt);
        this.flyAlt = Math.max(0, this.flyAlt + this.vy * dt);
      } else {
        this.flyAlt = 0;
        this.vy = 0;
      }
      this.vx *= Math.exp(-8 * dt);
      this.vz *= Math.exp(-8 * dt);
      this.mesh.position.x += this.vx * dt;
      this.mesh.position.z += this.vz * dt;
      this.mesh.rotation.x = Math.min(1.22, this.mesh.rotation.x + dt * 5);
      clampMap(this.mesh.position);
      resolveObstacles(this.mesh.position, this.flyAlt || 0);
      resolveShipCollisions(this);
      this.stickY();
      if (this.teamRing) this.teamRing.visible = false;
      if (this.deadT <= 0) this.respawn();
      return;
    }
    this.aliveFor = (this.aliveFor || 0) + dt;
    if ((this.hitFlash || 0) > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const u = Math.max(0, this.hitFlash / 0.28);
      if (this.hitGlow) {
        this.hitGlow.visible = u > 0.02 && !this._fpCam;
        const sc = this.height * (1.8 + (1 - u) * 2.4);
        this.hitGlow.scale.set(sc, sc * 1.35, 1);
        this.hitGlow.material.opacity = 0.85 * u;
        this.hitGlow.material.color.setHex(u > 0.5 ? 0xffffff : 0xffab40);
      }
    } else if (this.hitGlow?.visible) {
      this.hitGlow.visible = false;
    }
    if (this.s.ki > 0) this.s.hp = Math.min(this.s.hpMax, this.s.hp + HP_REGEN * dt);
    this.s.ki = Math.min(this.s.kiMax, this.s.ki + KI_REGEN_PASSIVE * dt);
    if (this.flyAlt > 0.2 && !this.inSwim()) {
      this.s.ki = Math.max(0, this.s.ki - 2.55 * dt);
    }
    this.rush = (this.rush || 0) * Math.exp(-5 * dt);
    this.ballMark.visible = this.esfera != null && !this._fpCam;
    this._kiPulse += dt * 6;
    this._kiChargeHold = Math.max(0, (this._kiChargeHold || 0) - dt);
    if (this._kiCharge) this._kiChargeHold = 0.15;
    const charging = this._kiCharge || this._kiChargeHold > 0;
    const firing = (this.poseBlast || 0) > 0.05 && (this.superHold || 0) <= 0.04 && !this.poseBlastTwo;
    const superPose = (this.superHold || 0) > 0.04 || (!!this.poseBlastTwo && (this.poseBlast || 0) > 0.05);
    const on = charging || (this.superHold || 0) > 0.04 || (this.poseBlast || 0) > 0.05 || this.ssj;
    const supering = (this.superHold || 0) > 0.04;
    this.kiAura.visible = on && !superPose && !firing;
    this.kiHalo.visible = on && !superPose && !firing;
    if (on) {
      const pulse = this._kiPulse;
      const arr = this.kiAura.geometry.attributes.position.array;
      const h = this.height;
      const dens = charging ? 1.35 : 1;
      for (let i = 0; i < this._kiN; i++) {
        const a = (i / this._kiN) * Math.PI * 2 + pulse * (0.45 + dens * 0.2);
        const layer = i % 6;
        const r = (0.18 + layer * 0.09) * h * dens + Math.sin(pulse * 2.2 + i) * 0.14 * h;
        const up = Math.sin(pulse * 3.1 + i * 0.55) * 0.22 * h + (charging ? Math.sin(pulse * 1.7) * 0.08 * h : 0);
        arr[i * 3] = Math.cos(a) * r;
        arr[i * 3 + 1] = (i / this._kiN - 0.4) * h * 1.35 + up;
        arr[i * 3 + 2] = Math.sin(a) * r;
      }
      this.kiAura.geometry.attributes.position.needsUpdate = true;
      const gold = this.ssj;
      const col = gold ? 0xffe082 : supering ? 0xffc107 : 0x4dd0e1;
      this.kiAura.material.color.setHex(col);
      this.kiHalo.material.color.setHex(gold ? 0xfff59d : supering ? 0xfff59d : 0xe0f7fa);
      this.kiAura.material.opacity = firing ? 0.16 : gold ? 0.18 : supering ? 0.65 : charging ? 0.28 : 0.5;
      this.kiAura.material.size = this.height * (firing ? 1.15 : gold ? 1.05 : supering ? 2.3 : charging ? 1.35 : 1.8);
      this.kiHalo.material.size = this.height * (firing ? 1.7 : gold ? 1.45 : supering ? 3.5 : charging ? 1.9 : 2.8);
      this.kiHalo.material.opacity = firing ? 0.06 : gold ? 0.06 : charging ? 0.12 : 0.2;
    }
    // Glow sprite de carga (R) — visible aunque bloom afecte los Points
    if (this.chargeGlow) {
      const showCharge = charging && !this._fpCam;
      this.chargeGlow.visible = showCharge;
      this.chargeHalo.visible = showCharge;
      if (showCharge) {
        const p = 1 + Math.sin(this._kiPulse * 4.2) * 0.18;
        this.chargeGlow.material.color.setHex(this.ssj ? 0xffe082 : 0x4dd0e1);
        this.chargeHalo.material.color.setHex(this.ssj ? 0xfff59d : 0xe0f7fa);
        this.chargeGlow.material.opacity = 0.22;
        this.chargeHalo.material.opacity = 0.1;
        this.chargeGlow.scale.set(this.height * 1.35 * p, this.height * 1.85 * p, 1);
        this.chargeHalo.scale.set(this.height * 1.9 * p, this.height * 2.5 * p, 1);
      }
    }
    if (this.blastBall) {
      const showBall = superPose && !this._fpCam;
      this.blastBall.visible = showBall;
      this.blastBallHalo.visible = showBall;
      if (showBall) {
        const p = 1 + Math.sin(this._kiPulse * 7.2) * 0.14;
        const hold = Math.min(1, Math.max(0.35, this.superHold || 0.5));
        const sz = this.height * (0.2 + hold * 0.16) * p;
        this.blastBall.position.set(0, this.height * 0.74, this.height * 0.4);
        this.blastBallHalo.position.copy(this.blastBall.position);
        this.blastBall.material.color.setHex(this.ssj ? 0xffe082 : 0xfff59d);
        this.blastBallHalo.material.color.setHex(0xffffff);
        this.blastBall.material.opacity = 0.58;
        this.blastBallHalo.material.opacity = 0.14;
        this.blastBall.scale.set(sz, sz, 1);
        this.blastBallHalo.scale.set(sz * 1.7, sz * 1.7, 1);
      }
    }
    // Anillo de carga
    if (this.chargeRing) {
      if (charging && this.flyAlt < 0.25 && !this.inSwim()) {
        this.chargeRing.visible = true;
        const pulse = 0.28 + Math.sin(this._kiPulse * 4) * 0.1;
        this.chargeRing.material.opacity = pulse;
        this.chargeRing.material.color.setHex(this.ssj ? 0xffe082 : 0x4dd0e1);
        const sc = 1 + Math.sin(this._kiPulse * 3.2) * 0.22;
        this.chargeRing.scale.set(sc, sc, sc);
        this.chargeRing.position.set(this.mesh.position.x, this.mesh.position.y + 0.08, this.mesh.position.z);
      } else {
        this.chargeRing.visible = false;
        this.chargeRing.material.opacity = 0;
      }
    }
    // Speed lines al esprintar / volar rápido
    if ((this.rush || 0) > 0.78 && this._scene && Math.random() < 0.35) {
      const back = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const p = this.pos().clone();
      p.y += this.height * 0.55;
      p.addScaledVector(back, 0.4);
      const col = this.faccion === "z" ? 0xff8a65 : 0x80d8ff;
      spawnSpeedStreak(this._scene, p, back.clone().negate(), this._fxScratch, col);
    }
    for (let i = this._fxScratch.length - 1; i >= 0; i--) {
      const f = this._fxScratch[i];
      f.t -= dt;
      if (f.v.lengthSq()) f.mesh.position.addScaledVector(f.v, dt);
      if (f.grow) f.mesh.scale.addScalar(f.grow * dt);
      if (f.mesh.material?.opacity != null) f.mesh.material.opacity = Math.max(0, f.t * 4);
      if (f.t <= 0) {
        this._scene?.remove(f.mesh);
        this._fxScratch.splice(i, 1);
      }
    }
    // Viento fake en pelo / capa al cargar o SSJ
    if (charging || this.ssj || (this.superHold || 0) > 0.04) {
      const w = Math.sin(this._kiPulse * 5.5) * 0.07;
      const head = this.limbs?.headG;
      if (head) {
        for (let i = 0; i < head.children.length; i++) {
          const c = head.children[i];
          if (!c.isMesh || c.geometry?.type === "SphereGeometry") continue;
          c.rotation.z = (c.userData._baseZ ?? (c.userData._baseZ = c.rotation.z)) + w * (1 + (i % 3) * 0.4);
          c.rotation.x = (c.userData._baseX ?? (c.userData._baseX = c.rotation.x)) + Math.sin(this._kiPulse * 4 + i) * 0.05;
        }
      }
      this.mesh.traverse((o) => {
        if (o.userData?.wind) {
          o.rotation.x = 0.08 + Math.sin(this._kiPulse * 3.4) * 0.12;
          o.rotation.z = Math.sin(this._kiPulse * 2.6) * 0.08;
        }
      });
    }
    if (this.ssj && this.ssjGlow && !superPose) {
      const p = 1 + Math.sin(this._kiPulse * 1.5) * 0.14;
      this.ssjGlow.visible = !this._fpCam;
      this.ssjHalo.visible = !this._fpCam;
      this.ssjGlow.scale.set(this.height * 1.05 * p, this.height * 1.55 * p, 1);
      this.ssjHalo.scale.set(this.height * 1.45 * p, this.height * 2.05 * p, 1);
    } else if (this.ssjGlow) {
      this.ssjGlow.visible = false;
      this.ssjHalo.visible = false;
    }
    if ((this._kiBubbleT || 0) > 0) {
      this._kiBubbleT -= dt;
      const u = Math.max(0, this._kiBubbleT / 2.4);
      this.kiBubble.visible = u > 0.03 && !this._fpCam;
      this.kiBubble.material.opacity = 0.32 * u;
      this.kiBubble.scale.setScalar(1.05 + (1 - u) * 0.55);
    } else if (this.kiBubble) this.kiBubble.visible = false;
    if ((this.hitstop || 0) <= 0) {
      if (!this.didMove) {
        const damp = Math.exp(-(this.inSwim() ? 2.8 : this.flyAlt > 0.2 ? 3.6 : 9.5) * dt);
        this._mvx = (this._mvx || 0) * damp;
        this._mvz = (this._mvz || 0) * damp;
        if (Math.hypot(this._mvx, this._mvz) > 0.12) {
          this.mesh.position.x += this._mvx * dt;
          this.mesh.position.z += this._mvz * dt;
        } else {
          this._mvx = 0;
          this._mvz = 0;
        }
      }
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
    resolveShipCollisions(this);
    this.stickY();
    this.animate(dt);
    this.mesh.userData.syncRig?.();
    this._kiSlow = this._kiCharge;
    this._kiCharge = false;
    if (!this._kiSlow) {
      if (this._sfxKi) {
        stopSfxLoop(`ki-${this.id}`);
        if (this.s.ki >= this.s.kiMax * 0.98) {
          const [x, y, z] = atPos(this);
          playSfx("fullKi", x, y, z, 0.4);
          this._kiBubbleT = 2.4;
        }
      }
      this._sfxKi = false;
    }
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
    this._usedLocoClip = false;
    this._poseDrop = 0;
    const wasPunch = (this.posePunch || 0) > 0;
    this.posePunch = Math.max(0, (this.posePunch || 0) - dt);
    if (wasPunch && this.posePunch <= 0) {
      this._poseRec = this.punchStep === 2 || this.airMelee === "kick" ? 0.75 : 0.32;
    }
    if (this.posePunch <= 0 && this.mesh.userData) {
      this.mesh.userData.punchLead = 0;
      this.mesh.userData.punchPhase = 0;
    }
    this.hitstop = Math.max(0, (this.hitstop || 0) - dt);
    this.poseBlast = Math.max(0, (this.poseBlast || 0) - dt);
    this.stun = Math.max(0, (this.stun || 0) - ((this.hitstop || 0) > 0 ? 0 : dt));
    const swimming = this.inSwim();
    const swimGo = swimming && (this.didMove || (this.rush || 0) > 0.18);
    const hopping = !!(this._hop || this._wantJump);
    const airHit = (this.posePunch || 0) > 0 ? this.airMelee : null;
    this.airTumble = Math.max(0, (this.airTumble || 0) - dt);
    this.airShudder = Math.max(0, (this.airShudder || 0) - dt);
    const tumbling = (this.airTumble || 0) > 0;
    const shudder = (this.airShudder || 0) > 0;
    const horizSpd = Math.hypot(this._mvx || 0, this._mvz || 0);
    const cruise =
      this.volando &&
      !swimming &&
      !hopping &&
      !tumbling &&
      this.didMove &&
      horizSpd > 5;
    let target = hopping || swimGo || cruise ? (hopping ? 0 : 1) : 0;
    if (tumbling) target = 0;
    else if (airHit === "upright" || airHit === "kick") target = 0;
    else if (airHit === "elbow") target = 1;
    const sitUp = !tumbling && target < this.flyBlend;
    const lam = tumbling ? 9 : target > this.flyBlend ? 2.15 : 18;
    this.flyBlend = THREE.MathUtils.damp(this.flyBlend, target, lam, dt);
    const u = this.flyBlend;
    const s = u * u * (3 - 2 * u);
    let pitch = 1.52 * s;
    if (tumbling) {
      // tumbar / abrir el cuerpo al impacto
      const tNorm = Math.min(1, this.airTumble / 0.55);
      pitch = -0.55 * tNorm - (this.hitRecoil || 0) * 0.7;
    } else if (shudder && s > 0.2) {
      // golpe leve: se queda acostado pero se sacude
      const w = Math.sin((this.airShudder || 0) * 42) * 0.18 * Math.min(1, this.airShudder * 4);
      pitch = 1.52 * s + w - (this.hitRecoil || 0) * 0.15;
    } else if (airHit === "upright") pitch = 0.06;
    else if (airHit === "kick") pitch = 0.18;
    else if (airHit === "elbow") pitch = 1.58;
    else if (this._kiCharge || (this.superHold || 0) > 0.04 || hopping) pitch = 0;
    else if (!swimming && this.didMove && this.flyAlt < 0.2) {
      const useRun = (this._runT || 0) > 0.28 && this._animCustom?.run;
      const useWalk = this._animCustom?.walk && !useRun;
      if (useRun) pitch = evalClip(this._anims.run, this._clipClock || 0).lay || 0;
      else if (useWalk) pitch = evalClip(this._anims.walk, this._clipClock || 0).lay || 0;
      else pitch = (this.rush || 0) > 0.82 ? 0.38 : 0.12;
    } else if (!tumbling && !shudder && !airHit && this.volando && this._animCustom?.fly && s > 0.04) {
      pitch = evalClip(this._anims.fly, this.animT).lay ?? 1.52 * s;
    } else if (!tumbling && !shudder && !airHit && this.volando && this._animCustom?.hover && s <= 0.04) {
      pitch = evalClip(this._anims.hover, this.animT).lay ?? 0;
    }
    this.mesh.rotation.x = THREE.MathUtils.damp(this.mesh.rotation.x, pitch, tumbling ? 11 : sitUp ? 22 : 7.5, dt);
    let dy = this.yaw - (this._yawPrev ?? this.yaw);
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this._yawPrev = this.yaw;
    this._yawRate = THREE.MathUtils.damp(this._yawRate || 0, dy / Math.max(dt, 0.008), 9, dt);
    let bank = this.dead ? 0 : THREE.MathUtils.clamp(-(this._yawRate) * 0.22 * s, -0.55, 0.55);
    if (tumbling) {
      const side = Math.sin((this.airHitYaw || this.yaw) * 3 + this.airTumble * 18) * 0.55;
      bank = side * Math.min(1, this.airTumble * 2.2);
    } else if (shudder) {
      bank += Math.sin(this.airShudder * 36) * 0.12;
    }
    this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, bank, tumbling ? 9 : 7.2, dt);
    const k = Math.min(1, dt * (4.15 + (1 - s) * 4.6));
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
      const recoil = this.hitRecoil || 0;
      const tumble = (this.airTumble || 0) > 0;
      lx(armL, tumble ? 1.15 : 0.7);
      lx(armR, tumble ? 1.05 : 0.7);
      lz(armL, tumble ? 0.55 : 0.2);
      lz(armR, tumble ? -0.55 : -0.2);
      lx(torsoG, -0.25 - recoil * 0.5 - (tumble ? 0.2 : 0));
      lx(headG, 0.2 + recoil * 0.3 + (tumble ? 0.25 : 0));
      if (kneeL) lx(kneeL, tumble ? 0.85 : 0.35);
      if (kneeR) lx(kneeR, tumble ? 0.75 : 0.35);
      if (elbowL) lx(elbowL, tumble ? -0.85 : -0.5);
      if (elbowR) lx(elbowR, tumble ? -0.9 : -0.5);
      this.didMove = false;
      return;
    }
    if (this.posePunch > 0) {
      const lunge = this.punchLunge || 0;
      const st = this.punchStep || 0;
      const pk = Math.min(1, dt * 20);
      const px = (o, t) => {
        if (o) o.rotation.x += (t - o.rotation.x) * pk;
      };
      const pz = (o, t) => {
        if (o) o.rotation.z += (t - o.rotation.z) * pk;
      };
      if (this.airMelee === "elbow") {
        const left = st === 1;
        const dur = this._punchDur || 0.42;
        const u = 1 - Math.min(1, this.posePunch / dur);
        if (this.applyEditorClip("elbow", u, pk, null, left)) {
          this.didMove = true;
          return;
        }
        const flip = this.mesh.userData.syncRig ? 1 : -1;
        const lead = left ? armL : armR;
        const back = left ? armR : armL;
        const leadEl = left ? elbowL : elbowR;
        const backEl = left ? elbowR : elbowL;
        px(lead, -0.35);
        pz(lead, (left ? 1.05 : -1.05) * flip);
        px(back, 0.35);
        pz(back, (left ? -0.12 : 0.12) * flip);
        px(leadEl, -1.35);
        px(backEl, -0.35);
        lx(legL, 0.12);
        lx(legR, 0.08);
        if (kneeL) lx(kneeL, 0.18);
        if (kneeR) lx(kneeR, 0.18);
        lx(torsoG, 0.08 + lunge * 0.25);
        lx(headG, 0.18);
        this.didMove = true;
        return;
      }
      if (st === 1 || st === 0) {
        const dur = this._punchDur || 0.52;
        const u = 1 - Math.min(1, this.posePunch / dur);
        const left = st === 1;
        const flip = this.mesh.userData.syncRig ? 1 : -1;
        this.mesh.userData.punchLead = left ? "L" : "R";
        this.mesh.userData.punchPhase = u >= 0.48 ? "hit" : "prep";
        const clipName = left ? "punchTwo" : "punch";
        const spd = this._anims?.[clipName]?.speed || this._anims?.punch?.speed || 1;
        if (this.applyEditorClip(clipName, u / spd, pk)) {
          this.didMove = false;
          return;
        }
        if (left && this.applyEditorClip("punch", u / (this._anims?.punch?.speed || 1), pk, null, true)) {
          this.didMove = false;
          return;
        }
        const sm = (a, b, t) => THREE.MathUtils.lerp(a, b, t * t * (3 - 2 * t));
        let ax, az, el, ty, eCross;
        if (u < 0.28) {
          const t = u / 0.28;
          ax = sm(0.08, -0.62, t);
          az = 0.1;
          el = sm(-0.28, -1.28, t);
          ty = 0.04;
          eCross = 0;
        } else if (u < 0.48) {
          // recobro cápsula: codo queda en el=-1.28 (Vegeta lo lee como elL/elR)
          const t = (u - 0.28) / 0.2;
          ax = sm(-0.62, 1.12, t);
          az = 0.08;
          el = -1.28;
          ty = sm(0.04, 0.18, t);
          eCross = 0;
        } else {
          const t = Math.min(1, (u - 0.48) / 0.2);
          ax = sm(1.12, -1.92, t);
          az = sm(0.06, 0.45, t);
          el = sm(-1.28, -0.18, t);
          ty = sm(0.12, 0.32, t);
          eCross = t * t * (3 - 2 * t);
        }
        const lead = left ? armL : armR;
        const rear = left ? armR : armL;
        const leadEl = left ? elbowL : elbowR;
        const rearEl = left ? elbowR : elbowL;
        px(lead, ax);
        pz(lead, (left ? -az : az) * flip);
        px(leadEl, el);
        px(rear, 0.18 + eCross * 0.12);
        pz(rear, (left ? 0.16 : -0.16) * flip);
        px(rearEl, -0.72);
        torsoG.rotation.y += (((left ? -ty : ty) * flip) - torsoG.rotation.y) * pk;
        lx(legL, left ? -0.22 : 0.2);
        lx(legR, left ? 0.26 : -0.16);
        if (kneeL) lx(kneeL, left ? 0.18 : 0.32);
        if (kneeR) lx(kneeR, left ? 0.38 : 0.2);
        lx(torsoG, 0.1 + eCross * (0.18 + lunge * 0.4));
        lx(headG, -0.08 - eCross * (0.1 + lunge * 0.12));
      } else if (st === 2) {
        if (!this.applyEditorClip("punchKick", 0, pk)) {
          px(armL, -0.28);
          px(armR, -0.4);
          pz(armL, 0.32);
          pz(armR, -0.4);
          px(elbowL, -0.55);
          px(elbowR, -0.55);
          lx(legL, 0.28);
          lx(legR, -1.38);
          if (kneeL) lx(kneeL, 0.45);
          if (kneeR) lx(kneeR, -0.22);
          lx(torsoG, 0.08 + lunge * 0.5);
          lx(headG, 0.1 - lunge * 0.2);
          torsoG.rotation.y += (0 - torsoG.rotation.y) * pk;
        }
      }
      this.didMove = false;
      return;
    }
    if (this.poseBlast > 0) {
      const t = Math.min(1, this.poseBlast * 3);
      const two = this.poseBlastTwo;
      const left = two || this.poseBlastArm === "L";
      const right = two || this.poseBlastArm === "R";
      const pk = Math.min(1, dt * 14);
      const clipName = two ? "blastTwo" : "blast";
      if (!this.applyEditorClip(clipName, t / (this._anims?.[clipName]?.speed || 1), pk, null, !two && left)) {
        lx(armR, right ? -1.65 * t : 0.12);
        lx(armL, left ? -1.65 * t : 0.12);
        lz(armR, right ? 0.35 * t : -0.08);
        lz(armL, left ? -0.35 * t : 0.08);
        if (elbowR) lx(elbowR, right ? -0.15 * t : -0.25);
        if (elbowL) lx(elbowL, left ? -0.15 * t : -0.25);
        lx(legL, 0.22);
        lx(legR, 0.22);
        if (kneeL) lx(kneeL, 0.18);
        if (kneeR) lx(kneeR, 0.18);
        lx(torsoG, 0.32 * t);
        lx(headG, -0.18 * t);
      }
      this.didMove = false;
      return;
    }
    if (this._grabbing || (this.grabT || 0) > 0.04) {
      const t = Math.min(1, (this.grabT || 0) / 1.5);
      // 0–0.35 agachar · 0.35–0.75 manos al suelo · 0.75–1 levantar
      const crouch = t < 0.35 ? t / 0.35 : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25 * 0.55;
      const reach = t < 0.2 ? t / 0.2 : t < 0.75 ? 1 : Math.max(0.15, 1 - (t - 0.75) / 0.25);
      const lift = t < 0.72 ? 0 : (t - 0.72) / 0.28;
      lx(armL, THREE.MathUtils.lerp(0.1, 1.55, reach) - lift * 1.85);
      lx(armR, THREE.MathUtils.lerp(0.1, 1.55, reach) - lift * 1.85);
      lz(armL, THREE.MathUtils.lerp(0.08, 0.42, reach) - lift * 0.25);
      lz(armR, THREE.MathUtils.lerp(-0.08, -0.42, reach) + lift * 0.25);
      if (elbowL) lx(elbowL, THREE.MathUtils.lerp(-0.2, -1.15, reach) + lift * 0.7);
      if (elbowR) lx(elbowR, THREE.MathUtils.lerp(-0.2, -1.15, reach) + lift * 0.7);
      lx(legL, 0.2 + crouch * 0.72);
      lx(legR, 0.2 + crouch * 0.72);
      if (kneeL) lx(kneeL, 0.25 + crouch * 1.05);
      if (kneeR) lx(kneeR, 0.25 + crouch * 1.05);
      lx(torsoG, 0.08 + crouch * 0.55 - lift * 0.25);
      lx(headG, 0.35 * crouch - lift * 0.2);
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
      this.animT += dt * 4.2;
      if (!this.applyEditorClip("charge", this.animT, k)) {
        const pulse = Math.sin(this.animT) * 0.06;
        lx(armL, -0.08 + pulse);
        lx(armR, -0.08 - pulse);
        lz(armL, 0.22);
        lz(armR, -0.22);
        if (elbowL) lx(elbowL, -1.62);
        if (elbowR) lx(elbowR, -1.62);
        lx(torsoG, -0.04 + pulse * 0.4);
        lx(headG, 0.08);
        lx(legL, 0.38);
        lx(legR, 0.38);
        if (kneeL) lx(kneeL, 0.62);
        if (kneeR) lx(kneeR, 0.62);
      }
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
    if (!(this._animCustom?.fly && s > 0.04) && !(this._animCustom?.hover && this.volando && s <= 0.04)) {
      lz(armL, 0.7 * s);
      lz(armR, -0.2 * s);
    }
    if (swimming && !swimGo) {
      this._strideBob = 0;
      this.animT += dt * 1.35;
      const w = Math.sin(this.animT);
      const w2 = Math.sin(this.animT * 0.55);
      if (!this.applyEditorClip("swimIdle", this.animT, k)) {
        lx(armL, -0.55 + w * 0.32);
        lx(armR, -0.55 - w * 0.32);
        lz(armL, 0.78 + w2 * 0.08);
        lz(armR, -(0.78 + w2 * 0.08));
        lx(legL, 0.35 + w * 0.22);
        lx(legR, 0.35 - w * 0.22);
        if (kneeL) lx(kneeL, 0.75 + w * 0.18);
        if (kneeR) lx(kneeR, 0.75 - w * 0.18);
        if (elbowL) lx(elbowL, -0.72);
        if (elbowR) lx(elbowR, -0.72);
        lx(torsoG, 0.04 + w2 * 0.03);
        lx(headG, 0.12 + w * 0.04);
      }
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, w * 0.08, 4.2, dt);
    } else if (swimming) {
      this._strideBob = 0;
      this.animT += dt * (4.59 + (this.rush || 0) * 1.53);
      const t = this.animT;
      const spd = this._anims?.swim?.speed || 1;
      if (!this.applyEditorClip("swim", t / (Math.PI * 2) / spd, k)) {
      // brazada estilo crol: jalón abajo + recuperación alta
      const stroke = (ph) => {
        const u = ((ph / (Math.PI * 2)) % 1 + 1) % 1;
        if (u < 0.45) {
          const e = u / 0.45;
          return THREE.MathUtils.lerp(-0.15, -2.35, e * e * (3 - 2 * e));
        }
        const e = (u - 0.45) / 0.55;
        return THREE.MathUtils.lerp(-2.35, -0.15, Math.sqrt(e));
      };
      const out = (ph) => 0.35 + Math.max(0, Math.sin(ph)) * 1.05;
      lx(armL, stroke(t));
      lx(armR, stroke(t + Math.PI));
      lz(armL, out(t));
      lz(armR, -out(t + Math.PI));
      const kick = Math.sin(t * 2.4);
      lx(legL, kick * 0.62);
      lx(legR, -kick * 0.62);
      if (kneeL) lx(kneeL, 0.35 + Math.max(0, -kick) * 0.85);
      if (kneeR) lx(kneeR, 0.35 + Math.max(0, kick) * 0.85);
      if (elbowL) lx(elbowL, -0.55 - Math.max(0, Math.sin(t)) * 0.55);
      if (elbowR) lx(elbowR, -0.55 - Math.max(0, Math.sin(t + Math.PI)) * 0.55);
      lx(torsoG, 0.1);
      torsoG.rotation.y = Math.sin(t) * 0.12;
      lx(headG, -0.35);
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, Math.sin(t) * 0.28, 6, dt);
      }
    } else if (s > 0.04) {
      this._strideBob = 0;
      this.animT += dt * (2.2 + (this.rush || 0) * 3.5);
      const w = Math.sin(this.animT);
      const boost = Math.min(1, (this.rush || 0));
      const ak = Math.min(1, dt * 8);
      const ax = (o, t) => {
        o.rotation.x += (t - o.rotation.x) * ak;
      };
      const az = (o, t) => {
        o.rotation.z += (t - o.rotation.z) * ak;
      };
      if (!this.applyEditorClip("fly", this.animT, ak)) {
        lx(torsoG, 0.1 * s);
        lx(headG, -1.42 * s + w * 0.04 * boost);
        ax(armR, -2.85 * s + w * 0.08 * boost);
        ax(armL, 0.55 * s - w * 0.06 * boost);
        az(armL, 0.55 * s + boost * 0.15);
        az(armR, -0.15 * s - boost * 0.1);
        if (elbowL) lx(elbowL, -0.35 * s);
        if (elbowR) lx(elbowR, -0.25 * s);
        lx(legL, 0.18 * s + w * 0.05);
        lx(legR, 0.28 * s - w * 0.05);
        az(legL, 0.18 * s);
        az(legR, -0.18 * s);
        if (kneeL) lx(kneeL, 0.22 + boost * 0.12);
        if (kneeR) lx(kneeR, 0.32 + boost * 0.1);
        torsoG.rotation.y = w * 0.04 * boost;
      }
    } else if (this.volando) {
      this._strideBob = 0;
      this.animT += dt * 1.45;
      const w = Math.sin(this.animT);
      const w2 = Math.sin(this.animT * 0.7);
      if (!this.applyEditorClip("hover", this.animT, k)) {
        lx(armL, 0.72 + w * 0.14);
        lx(armR, 0.85 - w * 0.14);
        lz(armL, -0.92 + w2 * 0.06);
        lz(armR, 0.92 - w2 * 0.06);
        if (elbowL) lx(elbowL, -1.05);
        if (elbowR) lx(elbowR, -0.98);
        lx(legL, 0.55 + w * 0.1);
        lx(legR, 0.68 - w * 0.1);
        if (kneeL) lx(kneeL, 0.95 + w * 0.08);
        if (kneeR) lx(kneeR, 1.05 - w * 0.08);
        lx(torsoG, 0.08 + w2 * 0.04);
        lx(headG, 0.06 + w * 0.05);
      }
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, w * 0.06, 4.5, dt);
    } else if (this.didMove) {
      const rush = this.rush || 0;
      const wantRun = (this._runT || 0) > 0.28;
      const sprint = (this._runT || 0) > 0.28 || rush > 0.4;
      const hard = (this._runT || 0) > 0.72 || rush > 0.82;
      const v = this._groundSpd || 0;
      const stride = hard ? 1.72 : sprint ? 1.35 : 1.05;
      const hz = THREE.MathUtils.clamp(
        v / (2 * stride),
        hard ? 2.35 : sprint ? 1.7 : 1.15,
        hard ? 3.9 : sprint ? 3.05 : 2.15
      );
      const clipName = wantRun ? "run" : "walk";
      const usedClip = this.applyEditorClip(clipName, (this._clipClock = (this._clipClock || 0) + dt), 1);
      if (usedClip) this._usedLocoClip = true;
      else {
        this.animT += dt * hz * Math.PI * 2 * (hard || sprint ? 0.85 : 0.765) * (this.mesh.userData.syncRig ? (hard || sprint ? 0.72 : 0.5) : 1);
      }
      const stance = hard ? 0.4 : sprint ? 0.46 : 0.55;
      const hip = (ph) => {
        let u = ph / (Math.PI * 2);
        u -= Math.floor(u);
        const fwd = hard ? -1.72 : sprint ? -1.38 : -1.05;
        const back = hard ? 1.28 : sprint ? 0.95 : 0.68;
        if (u < stance) {
          const t = u / stance;
          const e = t * t * (3 - 2 * t);
          return THREE.MathUtils.lerp(fwd, back, e);
        }
        const t = (u - stance) / (1 - stance);
        const e = t * t * (3 - 2 * t);
        return THREE.MathUtils.lerp(back, fwd, e);
      };
      const kn = (ph) => {
        let u = ph / (Math.PI * 2);
        u -= Math.floor(u);
        if (u < stance) return 0.1 + Math.sin((u / stance) * Math.PI) * 0.2;
        const t = (u - stance) / (1 - stance);
        return 0.28 + Math.sin(t * Math.PI) * (hard ? 2.05 : sprint ? 1.55 : 1.15);
      };
      const p = usedClip ? (this._clipClock || 0) * (this._anims?.[clipName]?.speed || 1) * Math.PI * 2 : this.animT;
      const q = p + Math.PI;
      const g = Math.min(1, dt * 8.2);
      const sx = (o, val) => {
        o.rotation.x += (val - o.rotation.x) * g;
      };
      const hipL = hip(p);
      const hipR = hip(q);
      if (!usedClip) {
        sx(legL, hipL);
        sx(legR, hipR);
        if (kneeL) sx(kneeL, kn(p));
        if (kneeR) sx(kneeR, kn(q));
        const armAmp = hard ? 1.28 : sprint ? 0.95 : 0.72;
        sx(armL, -hipL * armAmp);
        sx(armR, -hipR * armAmp);
        if (elbowL) sx(elbowL, -((hard ? 1.45 : sprint ? 0.95 : 0.48) + Math.sin(p) * (hard ? 0.32 : 0.14)));
        if (elbowR) sx(elbowR, -((hard ? 1.45 : sprint ? 0.95 : 0.48) + Math.sin(q) * (hard ? 0.32 : 0.14)));
        lz(armL, hard ? 0.38 : sprint ? 0.22 : 0.1);
        lz(armR, hard ? -0.38 : sprint ? -0.22 : -0.1);
        const lean = hard ? 0.28 : sprint ? 0.14 : 0.05;
        lx(torsoG, lean + Math.sin(p * 2) * (hard ? 0.07 : 0.045));
        torsoG.rotation.y = Math.sin(p) * (hard ? 0.14 : sprint ? 0.1 : 0.07);
        if (hips) hips.rotation.y = -torsoG.rotation.y * 0.55;
        lx(headG, (hard ? -0.18 : sprint ? -0.08 : 0.02) - Math.sin(p * 2) * 0.045);
      }
      this._strideBob = usedClip ? 0 : (1 - Math.cos(p * 2)) * (hard ? 0.048 : sprint ? 0.036 : 0.024);
      if (waistY != null && !usedClip) {
        const bob = this._strideBob * (hard ? 1.35 : 1);
        torsoG.position.y = waistY + bob;
        if (hips) hips.position.y = waistY + bob * 0.65;
      }
      const plant = Math.floor(p / Math.PI);
      if (plant !== this._plant) {
        this._plant = plant;
        const pp = this.pos();
        footstep(hard || sprint || wantRun, pp.x, pp.y, pp.z);
      }
    } else {
      // idle: respiración leve
      this._strideBob = THREE.MathUtils.damp(this._strideBob || 0, 0, 12, dt);
      this.animT += dt * 1.1;
      const breath = Math.sin(this.animT) * 0.035;
      if (!this.applyEditorClip("idle", this.animT, k)) {
        lx(armL, 0.04 + breath);
        lx(armR, 0.04 - breath * 0.8);
        lz(armL, 0.06);
        lz(armR, -0.06);
        lx(legL, 0.02);
        lx(legR, 0.04);
        if (kneeL) lx(kneeL, 0.1);
        if (kneeR) lx(kneeR, 0.1);
        if (elbowL) lx(elbowL, -0.18);
        if (elbowR) lx(elbowR, -0.18);
        lx(torsoG, breath * 0.45);
        torsoG.rotation.y += (0 - torsoG.rotation.y) * Math.min(1, k * 3);
        torsoG.rotation.z += (0 - torsoG.rotation.z) * Math.min(1, k * 3);
        if (hips) hips.rotation.y += (0 - hips.rotation.y) * k;
        lx(headG, -breath * 0.35);
        headG.rotation.y += (0 - headG.rotation.y) * k;
        headG.rotation.z += (0 - headG.rotation.z) * k;
      }
    }
    // Hit recoil residual (fuera de stun) — inclinación hacia atrás que decae
    if ((this.hitRecoil || 0) > 0.05 && this.stun <= 0) {
      const r = this.hitRecoil;
      torsoG.rotation.x -= r * 0.35;
      headG.rotation.x += r * 0.2;
    }
    const wantDuck =
      this._duck &&
      !this.dead &&
      this.flyAlt < 0.12 &&
      !this.inSwim() &&
      !this._hop &&
      !this._launched;
    this._duckAmt = THREE.MathUtils.damp(this._duckAmt || 0, wantDuck ? 1 : 0, 12, dt);
    this._duck = false;
    const c = Math.max(this._crouch || 0, this._duckAmt || 0);
    if (c > 0.04 && this.flyAlt < 0.4) {
      const g = Math.min(1, dt * 16);
      const squat = (o, v) => {
        o.rotation.x += (v - o.rotation.x) * g;
      };
      if (!this.applyEditorClip("crouch", 0, g, null, false, c)) {
        squat(legL, -1.05 * c);
        squat(legR, -1.05 * c);
        if (kneeL) squat(kneeL, 2.05 * c);
        if (kneeR) squat(kneeR, 2.05 * c);
        squat(torsoG, 0.68 * c);
        squat(headG, -0.68 * c);
        if (elbowL) squat(elbowL, -0.5 * c);
        if (elbowR) squat(elbowR, -0.5 * c);
        squat(armL, 0.22 * c);
        squat(armR, 0.22 * c);
      }
      const drop = (() => {
        const hy = hipY || this.height * 0.38;
        const clip = this._animCustom?.crouch ? this._anims?.crouch : null;
        const pose = clip ? evalClip(clip, 0) : null;
        const hipA = Math.abs(pose?.legL?.[0] ?? 1.05) * c;
        const knA = Math.abs(pose?.kneeL?.[0] ?? 2.05) * c;
        const thighLen = hy * 0.5;
        const shinLen = hy * 0.5;
        const span = thighLen * Math.cos(hipA) + shinLen * Math.cos(hipA - knA);
        return Math.max(0, hy - span - hy * 0.1);
      })();
      if (waistY != null) {
        torsoG.position.y = waistY - drop - (this._poseDrop || 0);
        if (hips) hips.position.y = waistY - drop - (this._poseDrop || 0);
      }
      if (hipY != null) {
        legL.position.y = hipY - drop - (this._poseDrop || 0);
        legR.position.y = hipY - drop - (this._poseDrop || 0);
      }
    }
    if ((this._poseRec || 0) > 0 && this.posePunch <= 0 && this.stun <= 0 && !this._usedLocoClip) {
      this._poseRec -= dt;
      const rk = Math.min(1, dt * 18);
      const yz = (o) => {
        if (!o) return;
        o.rotation.y += (0 - o.rotation.y) * rk;
        o.rotation.z += (0 - o.rotation.z) * rk;
      };
      yz(torsoG);
      yz(headG);
      yz(hips);
      yz(armL);
      yz(armR);
      yz(elbowL);
      yz(elbowR);
      yz(legL);
      yz(legR);
      yz(kneeL);
      yz(kneeR);
      yz(this.limbs.wristL);
      yz(this.limbs.wristR);
      if (!this.didMove) {
        torsoG.rotation.x += (0 - torsoG.rotation.x) * rk;
        headG.rotation.x += (0 - headG.rotation.x) * rk;
        if (legL) legL.rotation.x += (0.02 - legL.rotation.x) * rk;
        if (legR) legR.rotation.x += (0.04 - legR.rotation.x) * rk;
        if (kneeL) kneeL.rotation.x += (0.1 - kneeL.rotation.x) * rk;
        if (kneeR) kneeR.rotation.x += (0.1 - kneeR.rotation.x) * rk;
      }
    }
    this.didMove = false;
  }

  charge(dt) {
    if (this.stun > 0) return;
    if (!this._sfxKi) {
      const [x, y, z] = atPos(this);
      playSfx("chargingKiInit", x, y, z, 0.4);
      const loop = this.s.ki / this.s.kiMax > 0.55 ? "kiChargeLoop2" : "kiChargeLoop";
      playSfx(loop, x, y, z, 0.28, true, `ki-${this.id}`);
      this._sfxKi = true;
    }
    this._kiCharge = true;
    this._kiChargeHold = 0.15;
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
      this._surfY = surfaceHeight(x, z);
    } else {
      this.swim = 0;
      const surf = surfaceHeight(x, z);
      if (this.flyAlt > 0.04 && this._surfY != null) {
        this.flyAlt = Math.max(0, Math.min(FLY_MAX, this.flyAlt + this._surfY - surf));
      }
      this._surfY = surf;
      this.mesh.position.y = surf + this.flyAlt + lean + (this._strideBob || 0);
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
          this.vy = 15.1;
          this._hop = true;
          const [jx, jy, jz] = atPos(this);
          playSfx("jump1", jx, jy, jz, 0.45);
        }
      }
    }
    if (this._hop) {
      this.vy -= 26 * dt;
      this._crouch = 0;
    } else if (lift > 0 && !this._launched && this.flyAlt < 0.28) {
      this._crouch = Math.min(1, (this._crouch || 0) + dt / 0.14);
      if (this._crouch >= 1) {
        this.vy = 10.8;
        this._launched = true;
        this._crouch = 0;
        {
          const [ax, ay, az] = atPos(this);
          playSfx("auraBurst", ax, ay, az, 0.4);
        }
      }
    } else if (lift > 0) {
      this.vy = Math.min(FLY_UP, this.vy + 15 * dt);
      this._crouch = Math.max(0, (this._crouch || 0) - dt * 8);
    } else if (lift < 0) {
      this.vy = Math.max(-FLY_DOWN, this.vy - 24 * dt);
      this._crouch = 0;
    } else {
      this._crouch = Math.max(0, (this._crouch || 0) - dt * 7);
      if (this.flyAlt > 0.02) this.vy *= Math.exp(-5.2 * dt);
      else {
        this.vy = 0;
        this._launched = false;
      }
    }
    const prevAlt = this.flyAlt;
    const prevVy = this.vy;
    this.flyAlt = Math.max(0, Math.min(FLY_MAX, this.flyAlt + this.vy * dt));
    resolveShipCollisions(this);
    if (this.flyAlt <= 0.001) {
      if (prevAlt > 0.45 && prevVy < -5 && this._scene && !this.inSwim()) {
        const foot = this.pos().clone();
        foot.y = surfaceHeight(foot.x, foot.z) + 0.05;
        spawnImpactRing(this._scene, foot, this._fxScratch, prevVy < -10);
      }
      this.flyAlt = 0;
      this.vy = 0;
      this._launched = false;
      this.volando = false;
    } else this.volando = this.flyAlt > 0.2 && !this._hop;
    if (this.flyAlt <= 0.001) this._hop = false;
  }

  spaceDown() {
    if (this.stun > 0 || this.dead) return;
    if (this.inSwim() || this._launched) {
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
      {
        const [ax, ay, az] = atPos(this);
        playSfx("auraBurst", ax, ay, az, 0.4);
      }
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

  duckHold() {
    this._duck = true;
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
    const elbowDash = punching && this.airMelee === "elbow";
    if (charging || (punching && !elbowDash)) run = false;
    let mul = this.flyAlt > 0.2 ? 1.28 : 0.39;
    if (this.flyAlt > 0.2) {
      const kf = this.s.ki / Math.max(1, this.s.kiMax);
      if (kf < 0.02) mul *= 0.55;
      else if (kf < 0.12) mul *= 0.72;
    }
    if (charging) mul *= 0.22;
    if ((this._duckAmt || 0) > 0.25) {
      run = false;
      mul *= 0.42;
    }
    if (this._grabbing) mul *= 0.06;
    if (elbowDash) mul *= 1.18;
    else if (punching) mul *= 0.16;
    if (this.inSwim()) {
      run = false;
      mul = 0.828;
      this._runT = 0;
    } else if (this.flyAlt > 0.2) {
      this._runT = Math.max(0, this._runT - dt / 0.18);
      if (run && this.s.ki > 0) {
        mul *= 1.68;
        this.s.ki = Math.max(0, this.s.ki - 4 * dt);
      } else if (this.s.ki <= 0) mul *= 0.88;
    } else {
      if (run && this.s.ki > 0) {
        this._runT = Math.min(1, this._runT + dt / 0.52);
        this.s.ki = Math.max(0, this.s.ki - 1.35 * dt * this._runT);
      } else {
        this._runT = Math.max(0, this._runT - dt / 0.22);
      }
      if (this._runT > 0) {
        const t = this._runT * this._runT;
        mul *= 1 + 3.35 * t;
      } else {
        mul *= 0.9;
      }
    }
    const spd = this.s.velocidad * mul * (this.esfera != null ? 0.55 : 1);
    this._groundSpd = this.flyAlt > 0.2 || this.inSwim() ? 0 : spd;
    const wantX = dir.x * spd;
    const wantZ = dir.z * spd;
    const accel = this.inSwim() ? 7.5 : this.flyAlt > 0.2 ? 8.5 : 14;
    const a = 1 - Math.exp(-accel * dt);
    this._mvx = (this._mvx || 0) + (wantX - (this._mvx || 0)) * a;
    this._mvz = (this._mvz || 0) + (wantZ - (this._mvz || 0)) * a;
    this.mesh.position.x += this._mvx * dt;
    this.mesh.position.z += this._mvz * dt;
    clampMap(this.mesh.position);
    resolveObstacles(this.mesh.position, this.flyAlt || 0);
    resolveShipCollisions(this);
    this.stickY();
    this.mesh.rotation.y = this.yaw;
    this.didMove = true;
    const runFeel = this.inSwim() ? false : this.flyAlt > 0.2 ? run : this._runT > 0.55;
    const horiz = Math.hypot(this._mvx || 0, this._mvz || 0);
    this.rush = Math.max(
      this.rush || 0,
      this.inSwim()
        ? 0.35
        : runFeel
          ? 1
          : this.flyAlt > 0.2
            ? horiz > 5
              ? 0.75
              : 0.2
            : 0.5
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
    const lived = this.aliveFor || 0;
    if (lived < 16) this.spawnWave = Math.min(4, (this.spawnWave || 0) + 1);
    else this.spawnWave = 0;
    this.deadMax = 2.8 + this.spawnWave * 7.5;
    this.dead = true;
    this.deadT = this.deadMax;
    this.hitFlash = 0;
    if (this.hitGlow) this.hitGlow.visible = false;
    this._resetBodyEmissive();
    this.killedBy = killer?.nombre || "";
    this.killedKi = !!ki;
    this.killedTeam = killer?.faccion || "";
    this.s.hp = 0;
    this.setSsj(false);
    this.volando = false;
    this._launched = false;
    this._hop = false;
    this._wantJump = false;
    this.vy = Math.min(this.vy || 0, -2);
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
    this.aliveFor = 0;
    this.killedBy = "";
    this.hitFlash = 0;
    if (this.hitGlow) this.hitGlow.visible = false;
    this._resetBodyEmissive();
    this.mesh.rotation.x = 0;
    this.s.hp = this.s.hpMax;
    this.s.ki = this.s.kiMax;
    const p = spawnPos(this.faccion, 0, 1);
    this.mesh.position.copy(p);
    this.vx = 0;
    this.vz = 0;
    this.setFly(false);
    this.aiLeaveBase = 5;
  }

  tryGrab(balls, dt, match) {
    const wet = this.inSwim() || isWater(this.pos().x, this.pos().z);
    if (this.dead || this.esfera != null || (!wet && (this.volando || this.flyAlt > 0.2))) {
      this.grabT = 0;
      this._grabbing = false;
      this._grabBall = null;
      return;
    }
    const b = balls.near(this);
    if (!b) {
      this.grabT = 0;
      this._grabbing = false;
      this._grabBall = null;
      return;
    }
    this._grabbing = true;
    this._grabBall = b;
    if ((this.stun || 0) > 0 || (this.hitRecoil || 0) > 0.05) {
      this.grabT = 0;
      this._grabbing = false;
      this._grabBall = null;
      return;
    }
    this.yaw = Math.atan2(b.mesh.position.x - this.pos().x, b.mesh.position.z - this.pos().z);
    this.grabT = (this.grabT || 0) + dt;
    const t = Math.min(1, this.grabT / 1.5);
    // Último tramo: la esfera sube hacia las manos
    if (t > 0.72 && b.mesh.visible) {
      const handY = this.pos().y + this.height * (0.35 + (t - 0.72) / 0.28 * 0.55);
      const hx = this.pos().x + Math.sin(this.yaw) * 0.55;
      const hz = this.pos().z + Math.cos(this.yaw) * 0.55;
      const k = Math.min(1, (t - 0.72) / 0.28);
      b.mesh.position.x += (hx - b.mesh.position.x) * (0.18 + k * 0.45);
      b.mesh.position.z += (hz - b.mesh.position.z) * (0.18 + k * 0.45);
      b.mesh.position.y += (handY - b.mesh.position.y) * (0.22 + k * 0.5);
      b.mesh.scale.setScalar(1 + k * 0.12);
    }
    if (this.grabT >= 1.5) {
      const got = balls.pickup(this);
      if (got?.stole) match.syncBalls(balls);
      this.grabT = 0;
      this._grabbing = false;
      this._grabBall = null;
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
      const push = (minD - d) * 0.42;
      const nx = dx / d;
      const nz = dz / d;
      a.mesh.position.x += nx * push;
      a.mesh.position.z += nz * push;
      b.mesh.position.x -= nx * push;
      b.mesh.position.z -= nz * push;
      const rvx = (a.vx + (a._mvx || 0)) - (b.vx + (b._mvx || 0));
      const rvz = (a.vz + (a._mvz || 0)) - (b.vz + (b._mvz || 0));
      const closing = rvx * nx + rvz * nz;
      if (closing < 0) {
        const impulse = closing * 0.55;
        a.vx -= nx * impulse;
        a.vz -= nz * impulse;
        b.vx += nx * impulse;
        b.vz += nz * impulse;
        a._mvx = (a._mvx || 0) * 0.85;
        a._mvz = (a._mvz || 0) * 0.85;
        b._mvx = (b._mvx || 0) * 0.85;
        b._mvz = (b._mvz || 0) * 0.85;
      }
      for (const p of [a, b]) {
        clampMap(p.mesh.position);
        resolveObstacles(p.mesh.position, p.flyAlt || 0);
        resolveShipCollisions(p);
        p.stickY();
      }
    }
  }
}
