import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { FLY_MAX, HP_REGEN, KI_REGEN, KI_REGEN_PASSIVE, DEATH_MULT, STAT_FLOOR } from "./config.js";
import { spawnPos, clampMap, resolveObstacles, inOwnBase, surfaceHeight, isWater, groundHeight, WATER_Y } from "./world.js";
import { resolveShipCollisions } from "./bases.js";
import { log, logKill } from "./log.js";
import { makeBody } from "./body.js";
import { footstep, playSfx, atPos, stopSfxLoop } from "./sfx.js";
import { spawnSpeedStreak, spawnImpactRing } from "./powers.js";

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
    this.lookHairC = def.look?.hairC ?? 0x111111;
    this.orig = {
      ataque: this.s.ataque,
      defensa: this.s.defensa,
      velocidad: this.s.velocidad,
      kiMax: this.s.kiMax,
    };

    const h = this.s.altura * 1.1;
    this.mesh = makeBody(h, def.look);
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
    this.ssjGlow = new THREE.Sprite(glowMat(0xffe082, 0.62));
    this.ssjGlow.position.y = this.height * 0.48;
    this.ssjGlow.visible = false;
    this.mesh.add(this.ssjGlow);
    this.ssjHalo = new THREE.Sprite(glowMat(0xfff59d, 0.32));
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
    this.dead = false;
    this.deadT = 0;
    this.deadMax = 2.8;
    this.aliveFor = 0;
    this.spawnWave = 0;
    this.stun = 0;
    this.st = { k: 0, a: 0, d: 0, dmg: 0, esf: 0 };
    this.aiHeat = 0;
    this.hitBy = [];
  }

  pos() {
    return this.mesh.position;
  }

  setSsj(on) {
    if (!this.canSsj) return;
    on = !!on;
    if (this.ssj === on) return;
    this.ssj = on;
    this.s.ataque = this.orig.ataque * (on ? 1.28 : 1);
    this.s.velocidad = this.orig.velocidad * (on ? 1.14 : 1);
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
    const on = charging || (this.superHold || 0) > 0.04 || (this.poseBlast || 0) > 0.05 || this.ssj;
    const supering = (this.superHold || 0) > 0.04 || (this.poseBlast || 0) > 0.12;
    this.kiAura.visible = on;
    this.kiHalo.visible = on;
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
      this.kiAura.material.opacity = gold ? 0.72 : supering ? 0.65 : charging ? 0.28 : 0.5;
      this.kiAura.material.size = this.height * (gold ? 2.6 : supering ? 2.3 : charging ? 1.35 : 1.8);
      this.kiHalo.material.size = this.height * (gold ? 4.0 : supering ? 3.5 : charging ? 1.9 : 2.8);
      this.kiHalo.material.opacity = charging ? 0.12 : 0.2;
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
    if (this.ssj && this.ssjGlow) {
      const p = 1 + Math.sin(this._kiPulse * 1.5) * 0.14;
      this.ssjGlow.visible = !this._fpCam;
      this.ssjHalo.visible = !this._fpCam;
      this.ssjGlow.scale.set(this.height * 2.4 * p, this.height * 3.6 * p, 1);
      this.ssjHalo.scale.set(this.height * 3.6 * p, this.height * 5.1 * p, 1);
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
    this.posePunch = Math.max(0, (this.posePunch || 0) - dt);
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
      horizSpd > 5;
    let target = hopping || swimGo || cruise ? (hopping ? 0 : 1) : 0;
    if (tumbling) target = 0; // salir de la pose acostada
    else if (airHit === "upright" || airHit === "kick") target = 0;
    else if (airHit === "elbow") target = 1;
    const lam = tumbling ? 9 : target > this.flyBlend ? 2.15 : 3.35;
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
      pitch = (this.rush || 0) > 0.82 ? 0.38 : 0.12;
    }
    this.mesh.rotation.x = THREE.MathUtils.damp(this.mesh.rotation.x, pitch, tumbling ? 11 : 7.5, dt);
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
      if (this.airMelee === "elbow") {
        const left = st === 1;
        const lead = left ? armL : armR;
        const back = left ? armR : armL;
        const leadEl = left ? elbowL : elbowR;
        const backEl = left ? elbowR : elbowL;
        lead.rotation.x = -0.35;
        lead.rotation.z = left ? 1.15 : -1.15;
        back.rotation.x = 0.55;
        back.rotation.z = left ? -0.2 : 0.2;
        if (leadEl) leadEl.rotation.x = -1.55;
        if (backEl) backEl.rotation.x = -0.4;
        lx(legL, 0.12);
        lx(legR, 0.08);
        if (kneeL) lx(kneeL, 0.18);
        if (kneeR) lx(kneeR, 0.18);
        lx(torsoG, 0.08 + lunge * 0.25);
        lx(headG, 0.18);
        this.didMove = true;
        return;
      }
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
        lx(torsoG, 0.22 + lunge * 0.4);
        lx(headG, -0.12 - lunge * 0.15);
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
        lx(torsoG, 0.08 + lunge * 0.5);
        lx(headG, 0.1 - lunge * 0.2);
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
        lx(torsoG, 0.28 + lunge * 0.45);
        lx(headG, -0.15 - lunge * 0.15);
      }
      this.didMove = false;
      return;
    }
    if (this.poseBlast > 0) {
      const t = Math.min(1, this.poseBlast * 3); // intensidad según tiempo restante
      // Brazos extendidos hacia adelante y separados del cuerpo
      lx(armR, -1.65 * t);
      lx(armL, -1.65 * t);
      lz(armR, 0.55 * t);   // separar del cuerpo
      lz(armL, -0.55 * t);
      if (elbowR) lx(elbowR, -0.15 * t); // brazos casi rectos
      if (elbowL) lx(elbowL, -0.15 * t);
      lx(legL, 0.22);
      lx(legR, 0.22);
      if (kneeL) lx(kneeL, 0.18);
      if (kneeR) lx(kneeR, 0.18);
      lx(torsoG, 0.32 * t);  // inclinarse hacia adelante
      lx(headG, -0.18 * t);
      this.didMove = false;
      return;
    }
    if (this._grabbing || (this.grabT || 0) > 0.04) {
      const t = Math.min(1, (this.grabT || 0) / 1.5);
      // 0–0.35 agachar · 0.35–0.75 manos al suelo · 0.75–1 levantar
      const crouch = t < 0.35 ? t / 0.35 : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25 * 0.55;
      const reach = t < 0.2 ? t / 0.2 : t < 0.75 ? 1 : Math.max(0.15, 1 - (t - 0.75) / 0.25);
      const lift = t < 0.72 ? 0 : (t - 0.72) / 0.28;
      armL.rotation.x = THREE.MathUtils.lerp(0.1, 1.55, reach) - lift * 1.85;
      armR.rotation.x = THREE.MathUtils.lerp(0.1, 1.55, reach) - lift * 1.85;
      armL.rotation.z = THREE.MathUtils.lerp(0.08, 0.42, reach) - lift * 0.25;
      armR.rotation.z = THREE.MathUtils.lerp(-0.08, -0.42, reach) + lift * 0.25;
      if (elbowL) elbowL.rotation.x = THREE.MathUtils.lerp(-0.2, -1.15, reach) + lift * 0.7;
      if (elbowR) elbowR.rotation.x = THREE.MathUtils.lerp(-0.2, -1.15, reach) + lift * 0.7;
      legL.rotation.x = 0.2 + crouch * 0.72;
      legR.rotation.x = 0.2 + crouch * 0.72;
      if (kneeL) kneeL.rotation.x = 0.25 + crouch * 1.05;
      if (kneeR) kneeR.rotation.x = 0.25 + crouch * 1.05;
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
      const pulse = Math.sin(this.animT) * 0.06;
      armL.rotation.x = -0.08 + pulse;
      armR.rotation.x = -0.08 - pulse;
      armL.rotation.z = 0.22;
      armR.rotation.z = -0.22;
      if (elbowL) elbowL.rotation.x = -1.62;
      if (elbowR) elbowR.rotation.x = -1.62;
      lx(torsoG, -0.04 + pulse * 0.4);
      lx(headG, 0.08);
      legL.rotation.x = 0.38;
      legR.rotation.x = 0.38;
      if (kneeL) kneeL.rotation.x = 0.62;
      if (kneeR) kneeR.rotation.x = 0.62;
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
      this.animT += dt * 1.35;
      const w = Math.sin(this.animT);
      const w2 = Math.sin(this.animT * 0.55);
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
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, w * 0.08, 4.2, dt);
    } else if (swimming) {
      this._strideBob = 0;
      this.animT += dt * (4.59 + (this.rush || 0) * 1.53);
      const t = this.animT;
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
      armL.rotation.x = stroke(t);
      armR.rotation.x = stroke(t + Math.PI);
      armL.rotation.z = out(t);
      armR.rotation.z = -out(t + Math.PI);
      const kick = Math.sin(t * 2.4);
      legL.rotation.x = kick * 0.62;
      legR.rotation.x = -kick * 0.62;
      if (kneeL) kneeL.rotation.x = 0.35 + Math.max(0, -kick) * 0.85;
      if (kneeR) kneeR.rotation.x = 0.35 + Math.max(0, kick) * 0.85;
      if (elbowL) elbowL.rotation.x = -0.55 - Math.max(0, Math.sin(t)) * 0.55;
      if (elbowR) elbowR.rotation.x = -0.55 - Math.max(0, Math.sin(t + Math.PI)) * 0.55;
      lx(torsoG, 0.1);
      torsoG.rotation.y = Math.sin(t) * 0.12;
      lx(headG, -0.35);
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, Math.sin(t) * 0.28, 6, dt);
    } else if (s > 0.04) {
      // vuelo rápido: Superman + leve aleteo de turbo
      this._strideBob = 0;
      this.animT += dt * (2.2 + (this.rush || 0) * 3.5);
      const w = Math.sin(this.animT);
      const boost = Math.min(1, (this.rush || 0));
      lx(torsoG, 0.1 * s);
      lx(headG, -1.42 * s + w * 0.04 * boost);
      lx(armR, -2.85 * s + w * 0.08 * boost);
      lx(armL, 0.55 * s - w * 0.06 * boost);
      lz(armL, 0.55 * s + boost * 0.15);
      lz(armR, -0.15 * s - boost * 0.1);
      lx(legL, 0.18 * s + w * 0.05);
      lx(legR, 0.28 * s - w * 0.05);
      if (kneeL) lx(kneeL, 0.22 + boost * 0.12);
      if (kneeR) lx(kneeR, 0.32 + boost * 0.1);
      if (elbowL) lx(elbowL, -0.35 * s);
      if (elbowR) lx(elbowR, -0.25 * s);
      torsoG.rotation.y = w * 0.04 * boost;
    } else if (this.volando) {
      // hover: rodillas flexionadas + balanceo
      this._strideBob = 0;
      this.animT += dt * 1.45;
      const w = Math.sin(this.animT);
      const w2 = Math.sin(this.animT * 0.7);
      lx(armL, 0.72 + w * 0.14);
      lx(armR, 0.85 - w * 0.14);
      lz(armL, -0.92 + w2 * 0.06);
      lz(armR, 0.92 - w2 * 0.06);
      lx(legL, 0.55 + w * 0.1);
      lx(legR, 0.68 - w * 0.1);
      if (kneeL) lx(kneeL, 0.95 + w * 0.08);
      if (kneeR) lx(kneeR, 1.05 - w * 0.08);
      if (elbowL) lx(elbowL, -1.05);
      if (elbowR) lx(elbowR, -0.98);
      lx(torsoG, 0.08 + w2 * 0.04);
      lx(headG, 0.06 + w * 0.05);
      this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, w * 0.06, 4.5, dt);
    } else if (this.didMove) {
      const rush = this.rush || 0;
      const sprint = rush > 0.55;
      const hard = rush > 0.82;
      const v = this._groundSpd || 0;
      const stride = hard ? 1.72 : sprint ? 1.35 : 1.05;
      const hz = THREE.MathUtils.clamp(
        v / (2 * stride),
        hard ? 2.35 : sprint ? 1.7 : 1.15,
        hard ? 3.9 : sprint ? 3.05 : 2.15
      );
      this.animT += dt * hz * Math.PI * 2 * (hard || sprint ? 0.85 : 0.765);
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
      const p = this.animT;
      const q = p + Math.PI;
      const g = Math.min(1, dt * 11.5);
      const sx = (o, val) => {
        o.rotation.x += (val - o.rotation.x) * g;
      };
      const hipL = hip(p);
      const hipR = hip(q);
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
      this._strideBob = (1 - Math.cos(p * 2)) * (hard ? 0.048 : sprint ? 0.036 : 0.024);
      // bob vertical del torso (sensación de peso)
      if (waistY != null) {
        const bob = this._strideBob * (hard ? 1.35 : 1);
        torsoG.position.y = waistY + bob;
        if (hips) hips.position.y = waistY + bob * 0.65;
      }
      const plant = Math.floor(p / Math.PI);
      if (plant !== this._plant) {
        this._plant = plant;
        const pp = this.pos();
        footstep(hard || sprint, pp.x, pp.y, pp.z);
      }
    } else {
      // idle: respiración leve
      this._strideBob = THREE.MathUtils.damp(this._strideBob || 0, 0, 12, dt);
      this.animT += dt * 1.1;
      const breath = Math.sin(this.animT) * 0.035;
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
      torsoG.rotation.y += (0 - torsoG.rotation.y) * k;
      if (hips) hips.rotation.y += (0 - hips.rotation.y) * k;
      lx(headG, -breath * 0.35);
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
      squat(legL, -0.95 * c);
      squat(legR, -0.95 * c);
      if (kneeL) squat(kneeL, 1.55 * c);
      if (kneeR) squat(kneeR, 1.55 * c);
      squat(torsoG, 0.48 * c);
      squat(headG, -0.48 * c);
      if (elbowL) squat(elbowL, -0.5 * c);
      if (elbowR) squat(elbowR, -0.5 * c);
      squat(armL, 0.22 * c);
      squat(armR, 0.22 * c);
      const drop = (() => {
        const hy = hipY || this.height * 0.38;
        const hipA = 0.95 * c;
        const knA = 1.55 * c;
        const thighLen = hy * 0.5;
        const shinLen = hy * 0.5;
        const span = thighLen * Math.cos(hipA) + shinLen * Math.cos(hipA - knA);
        return Math.max(0, hy - span - hy * 0.1);
      })();
      if (waistY != null) {
        torsoG.position.y = waistY - drop;
        if (hips) hips.position.y = waistY - drop;
      }
      if (hipY != null) {
        legL.position.y = hipY - drop;
        legR.position.y = hipY - drop;
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
