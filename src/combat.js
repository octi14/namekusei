import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { SUPER_KI, superRank } from "./config.js";
import { powerStyle, makePowerMesh, alignBeam, spawnBurst, spawnClash, spawnHit, spawnMuzzle, spawnMeleeArc, spawnImpactRing, spawnTelegraph } from "./powers.js";
import { playSfx, atPos, stopSfxLoop } from "./sfx.js";

function meleeYOk(at, t) {
  const ay = at.pos().y + at.height * 0.55;
  const ty = t.pos().y + t.height * 0.55;
  return Math.abs(ay - ty) <= 2.55;
}

function fwd(yaw) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

export class Combat {
  constructor(scene, balls, cam, match) {
    this.scene = scene;
    this.balls = balls;
    this.cam = cam;
    this.match = match;
    this.shots = [];
    this.floats = [];
    this.fx = [];
  }

  jolt(pos, amt) {
    if (this.cam.camera.position.distanceTo(pos) < 42) this.cam.shake(amt);
  }

  screenHit(ki, heavy) {
    const el = document.getElementById("hit-fx");
    if (!el) return;
    el.className = "";
    void el.offsetWidth;
    el.className = `on${ki ? " ki" : ""}${heavy ? " heavy" : ""}`;
  }

  melee(at, all) {
    if (at.cooldown > 0 || at.dead || at.stun > 0 || (at.hitstop || 0) > 0) return;
    const now = performance.now() * 0.001;
    if (!at.comboT || now - at.comboT > 1.05) at.combo = 0;
    const step = at.combo % 3;
    at.combo = step + 1;
    at.comboT = now;
    at.punchStep = step;
    const flying = (at.flyAlt || 0) > 0.28 || !!at.volando;
    const dive = flying && (at.rush || 0) > 0.88;
    at.airMelee = flying ? (dive ? "elbow" : step === 1 ? "kick" : "upright") : null;
    at.posePunch = at.airMelee === "elbow" ? 0.42 : at.airMelee === "kick" || step === 2 ? 0.48 : 0.52;
    at._punchDur = at.posePunch;
    at.cooldown = at.airMelee === "elbow" ? 0.38 : at.airMelee === "kick" || step === 2 ? 0.55 : 0.32;
    if (at.airMelee === "kick") at.punchStep = 2;
    {
      const [sx, sy, sz] = atPos(at);
      playSfx(step === 2 || at.airMelee === "kick" ? "throwKick" : "throwPunch", sx, sy, sz, 0.42);
    }
    if (at.airMelee !== "elbow") at._runT = Math.min(at._runT || 0, 0.15);
    if (at.airMelee === "elbow") {
      const dashF = fwd(at.yaw);
      at.vx += dashF.x * 20;
      at.vz += dashF.z * 20;
      at.punchLunge = Math.max(at.punchLunge || 0, 0.55);
    }
    let best = null;
    let bestS = 9;
    const origin = at.pos();
    for (const t of all) {
      if (t.faccion === at.faccion || t === at || t.dead) continue;
      const d = t.pos().clone().sub(origin);
      d.y = 0;
      const dist = d.length();
      if (dist > 3.35 || !meleeYOk(at, t)) continue;
      if (dist > 0.04) d.normalize();
      const side = dist > 0.04 ? d.dot(fwd(at.yaw)) : 1;
      const score = dist - (side > 0.15 ? 1.4 : 0);
      if (score < bestS) {
        bestS = score;
        best = t;
      }
    }
    if (best) {
      const to = best.pos().clone().sub(origin);
      at.yaw = Math.atan2(to.x, to.z);
      // Giro parcial del torso hacia la víctima
      if (at.limbs?.torsoG) {
        const localAngle = Math.atan2(to.x, to.z) - at.yaw;
        at.limbs.torsoG.rotation.y = THREE.MathUtils.clamp(localAngle, -0.45, 0.45);
      }
    }
    const f = fwd(at.yaw);
    const finisher = step === 2;
    spawnMeleeArc(this.scene, origin.clone().setY(origin.y + at.height * (finisher ? 0.42 : 0.62)), at.yaw, this.fx);
      const reach = at.airMelee === "elbow" ? 3.45 : finisher ? 3.05 : 2.75;
    for (const t of all) {
      if (t.faccion === at.faccion || t === at || t.dead) continue;
      const d = t.pos().clone().sub(origin);
      d.y = 0;
      const dist = d.length();
      if (dist > reach || !meleeYOk(at, t)) continue;
      if (dist > 0.08) {
        const facing = d.normalize().dot(f);
        if (dist > 1.2 && facing < 0.12) continue;
        if (dist <= 1.2 && facing < -0.35) continue;
      }
      // Parry: si la víctima está atacando justo ahora (ventana ~0.15s), contraataca
      if ((t.posePunch || 0) > 0.19 && (t.posePunch || 0) < 0.34) {
        const parryDmg = Math.max(1, Math.round((t.s.ataque * 140) / (8 + at.s.defensa)));
        const pH = at.pos().clone(); pH.y += at.height * 0.7;
        spawnHit(this.scene, pH, this.fx, d.clone().negate());
        this.jolt(pH, 0.32);
        at.stun = Math.max(at.stun || 0, 0.45);
        at.hitstop = Math.max(at.hitstop || 0, 0.1);
        t.hitstop = Math.max(t.hitstop || 0, 0.1);
        at.knock(t.pos(), 18);
        at.s.hp -= parryDmg;
        this.float(at, parryDmg, false, t);
        if (at.s.hp <= 0) { this.match.noteKill(t, at); t.st.k++; at.st.d++; at.die(this.balls, t, false); }
        continue;
      }
      let dmg = Math.max(1, Math.round((at.s.ataque * (finisher ? 160 : 100)) / (8 + t.s.defensa)));
      const hitP = t.pos().clone();
      hitP.y += t.height * 0.7;
      spawnHit(this.scene, hitP, this.fx, f, finisher);
      {
        const [hx, hy, hz] = atPos(t);
        playSfx(finisher ? "kickHit" : "bodyHit", hx, hy, hz, 0.55);
        playSfx("bodyGetsHit", hx, hy, hz, 0.38);
      }
      this.jolt(hitP, finisher ? 0.42 : 0.22);
      at.hitstop = Math.max(at.hitstop || 0, finisher ? 0.14 : 0.08);
      t.hitstop = Math.max(t.hitstop || 0, finisher ? 0.14 : 0.08);
      // Inclinación: atacante lunge adelante, víctima recoil atrás
      at.punchLunge = Math.max(at.punchLunge || 0, finisher ? 0.35 : 0.22);
      t.hitRecoil = Math.max(t.hitRecoil || 0, finisher ? 0.38 : 0.25);
      // Sacudida: desplazar mesh de víctima en dirección del golpe
      t.hitShakeX = f.x * (finisher ? 0.4 : 0.2);
      t.hitShakeZ = f.z * (finisher ? 0.4 : 0.2);
      t.hitShakeT = 0.18;
      this.hurt(t, dmg, false, at, at.pos(), finisher ? 22 : 8);
    }
  }

  blast(at, superOn, people, snipe = false) {
    // 2º arg superOn = especial. 4º snipe = largo alcance (jugador: T). Ki común: ambos false (click der).
    if (at.cooldown > 0 || at.dead || at.stun > 0) return false;
    const style = powerStyle(at.nombre, at.faccion);
    const rank = superOn ? superRank(at.s.ki, at.s.kiMax, at.s.ataque) : 0;
    const need = superOn ? at.s.kiMax * SUPER_KI : snipe ? 22 : 12;
    if (superOn && rank < 1) return false;
    if (!superOn && at.s.ki < need) return false;
    at.s.ki -= superOn ? need * (0.38 + rank * 0.16) : need;
    at.cooldown = superOn ? 1.05 + rank * 0.18 : snipe ? 0.62 : 0.38;
    at.poseBlast = superOn ? 0.48 + rank * 0.12 : snipe ? 0.42 : 0.32;
    at.poseBlastTwo = !!superOn;
    if (!superOn) at.poseBlastArm = at.poseBlastArm === "L" ? "R" : "L";
    {
      const [sx, sy, sz] = atPos(at);
      if (superOn) {
        stopSfxLoop("chargingSuperLoop");
        at._sfxSuper = false;
        playSfx(at.faccion === "f" ? "freezerSuperInit" : rank >= 2 ? "bestBigInit" : "enhancedBigInit", sx, sy, sz, 0.62);
        playSfx("bigBlastShoot", sx, sy, sz, 0.7);
        if (at.nombre === "Gokú" && rank >= 3) playSfx("kameShoot", sx, sy, sz, 0.75);
      } else if (snipe || style.kind === "beam") playSfx("longBlastShoot", sx, sy, sz, 0.55);
      else playSfx(Math.random() < 0.5 ? "smallBlast" : "smallBlastShoot2", sx, sy, sz, 0.5);
    }
    const dir = this.shotDir(at);
    const mesh = makePowerMesh(style, superOn, rank);
    mesh.position.copy(at.pos()).addScaledVector(dir, superOn ? 2.4 : 1.4);
    mesh.position.y = at.pos().y + at.height * (superOn ? 0.78 : 0.7);
    if (style.kind === "beam") alignBeam(mesh, dir);
    this.scene.add(mesh);
    const hand = at.pos().clone().addScaledVector(dir, 0.85);
    hand.y += at.height * 0.68;
    const off = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(0.22);
    spawnMuzzle(this.scene, hand.clone().add(off), style.color, this.fx);
    spawnMuzzle(this.scene, hand.clone().sub(off), style.color, this.fx);
    if (superOn || snipe) {
      spawnTelegraph(this.scene, hand, style.color, this.fx, superOn ? 1.6 : 1.1);
      this.jolt(hand, superOn ? 0.35 : 0.18);
    }
    const dmg = superOn
      ? Math.round((180 + at.s.kiMax * 1.2) * (0.78 + rank * 0.36))
      : Math.round((snipe ? 60 : 80) + at.s.kiMax * 0.4);
    const hitR = superOn
      ? 3.8 + rank * 1.35 + (style.r || 0.22) * 6
      : (style.r || 0.22) * 1.15 + 0.7;
    const rng = (style.range || 55) * (snipe ? 2.4 : 1) * (superOn ? 2.7 + rank * 0.35 : 1);
    const life = (style.life || 1.4) * (snipe ? 1.5 : 1) * (superOn ? 2.15 + rank * 0.28 : 1);
    const locked =
      at.lockFoe && !at.lockFoe.dead && (at.lockT || 0) > 0
        ? at.lockFoe
        : this.pickLock(at, dir, people, rng, superOn || snipe ? 0.38 : 0.62);
    const home = superOn
      ? at.controller === "humano"
        ? locked && at.lockFoe === locked
          ? 0.12 + rank * 0.04
          : 0
        : 0.08 + rank * 0.03
      : 0.07 * (style.range > 100 ? 0.7 : 1);
    this.shots.push({
      mesh,
      dir,
      faccion: at.faccion,
      dmg,
      life,
      atk: at,
      // Velocidad: STYLES.speed (común). Tocá los × de abajo para largo/especial.
      speed: style.speed * (superOn ? 1.55 + rank * 0.18 /* especial */ : snipe ? 1.25 /* largo T */ : 1 /* común */),
      hitR,
      kind: style.kind,
      color: style.color,
      trail: 0,
      lock: superOn && at.controller === "humano" && !at.lockFoe ? null : locked,
      home,
      aoe: superOn,
      aoeR: superOn ? 12 + rank * 4.8 : 0,
      snipe: !!snipe,
    });
    if (superOn || snipe) this.jolt(at.pos(), snipe ? 0.14 : 0.16 + rank * 0.1);
    return true;
  }

  shotDir(at) {
    if (at.controller === "humano" && this.cam?.camera) {
      const d = new THREE.Vector3();
      this.cam.camera.getWorldDirection(d);
      if (d.lengthSq() > 1e-6) return d.normalize();
    }
    return fwd(at.yaw);
  }

  boom(s, people) {
    const pos = s.mesh.position;
    spawnBurst(this.scene, pos, s.color, this.fx);
    spawnBurst(this.scene, pos, s.color, this.fx);
    this.jolt(pos, 0.42);
    const foot = pos.clone();
    foot.y = Math.min(foot.y, 2);
    spawnImpactRing(this.scene, foot, this.fx, true);
    playSfx("superHitsLand", pos.x, pos.y, pos.z, 0.72);
    for (const t of people) {
      if (t.faccion === s.faccion || t.dead) continue;
      const d = pos.distanceTo(t.pos().clone().setY(t.pos().y + t.height * 0.7));
      if (d > s.aoeR) continue;
      const fall = 1 - d / s.aoeR;
      const dmg = Math.max(1, Math.round(s.dmg * (0.4 + 0.6 * fall)));
      this.hurt(t, dmg, true, s.atk, pos);
    }
  }

  pickLock(at, dir, people, maxD = 55, cone = 0.62) {
    if (!people) return null;
    let best = null;
    let bestD = maxD;
    const origin = at.pos();
    for (const t of people) {
      if (t.faccion === at.faccion || t === at || t.dead) continue;
      const to = t.pos().clone().sub(origin);
      const dist = to.length();
      if (dist > maxD || dist < 0.8) continue;
      to.normalize();
      if (to.dot(dir) < cone) continue;
      if (dist < bestD) {
        bestD = dist;
        best = t;
      }
    }
    return best;
  }

  hurt(t, dmg, ki, atk, from, knock) {
    if (t.dead) return;
    if ((t.iframes || 0) > 0 && (t.stun || 0) <= 0) return; // invulnerable post-recovery
    t.s.hp -= dmg;
    const finisher = knock && knock > 16;
    const heavy = !!(ki || finisher || dmg >= 40);
    this.float(t, dmg, ki, atk, heavy);
    const now = performance.now() * 0.001;
    if (atk) {
      atk.st.dmg += dmg;
      t.hitBy = (t.hitBy || []).filter((h) => now - h.t < 8);
      const prev = t.hitBy.find((h) => h.p === atk);
      if (prev) prev.t = now;
      else t.hitBy.push({ p: atk, t: now });
    }
    if (t.s.hp <= 0) {
      if (atk) {
        this.match.noteKill(atk, t);
        atk.st.k++;
        for (const h of t.hitBy || []) {
          if (h.p !== atk && now - h.t < 8) h.p.st.a++;
        }
      }
      t.st.d++;
      t.aiHeat = (t.aiHeat || 0) - 1.15;
      t.hitBy = [];
      t.die(this.balls, atk, ki);
      if (atk) {
        atk.aiHeat = (atk.aiHeat || 0) + 0.95;
        atk.s.ataque += 1;
        atk.s.defensa += 1;
        atk.s.velocidad += 1;
        atk.s.kiMax += 8;
      }
      if (t.controller === "humano") this.screenHit(ki, true);
      return;
    }
    const src = from || atk?.pos();
    const kbForce = ki ? 20 : finisher ? 28 : 11;
    if (src) {
      t.knock(src, kbForce);
      if (heavy && (t.flyAlt || 0) < 0.25 && !t.inSwim()) {
        t.vy = Math.max(t.vy || 0, 5.2 + Math.min(4, dmg * 0.03));
        t._hop = true;
      }
    }
    const stunTime = ki ? 0.4 : finisher ? 0.55 : 0.22;
    t.stun = Math.max(t.stun || 0, stunTime);
    t.hitRecoil = Math.max(t.hitRecoil || 0, ki ? 0.38 : finisher ? 0.42 : 0.22);
    t.hitFlash = Math.max(t.hitFlash || 0, heavy ? 0.28 : 0.16);
    // FX de impacto también en ki / hits que llegan por hurt
    {
      const hitP = t.pos().clone();
      hitP.y += t.height * 0.65;
      if (ki) spawnHit(this.scene, hitP, this.fx, src ? hitP.clone().sub(src).setY(0).normalize() : null, true);
    }
    if ((t.flyAlt || 0) > 0.35 || t.volando) {
      t.airHitYaw = src
        ? Math.atan2(t.pos().x - src.x, t.pos().z - src.z)
        : t.yaw;
      if (kbForce >= 16) {
        t.airTumble = Math.max(t.airTumble || 0, 0.48 + Math.min(0.45, (kbForce - 16) * 0.03));
        t.flyBlend = Math.min(t.flyBlend || 0, 0.12);
        t.vy = Math.min(t.vy || 0, -4 - kbForce * 0.12);
        t.rush = 0;
      } else {
        t.airShudder = Math.max(t.airShudder || 0, 0.22 + kbForce * 0.012);
      }
    } else if (kbForce >= 11 || ki) {
      const foot = t.pos().clone();
      foot.y += 0.05;
      spawnImpactRing(this.scene, foot, this.fx, kbForce >= 22 || ki);
    }
    const camNear = this.cam.camera.position.distanceTo(t.pos()) < 38;
    if (t.controller === "humano") {
      this.screenHit(ki, heavy);
      this.jolt(t.pos(), heavy ? 0.48 : 0.28);
    } else if (camNear) {
      this.jolt(t.pos(), heavy ? 0.32 : 0.14);
    }
    if (finisher || ki) t.iframes = Math.max(t.iframes || 0, stunTime + 0.12);
  }

  float(t, dmg, ki, atk, heavy = false) {
    const el = document.createElement("div");
    const mine = !!(atk && this.pov && atk === this.pov);
    const team = atk?.faccion;
    const side = !mine && (team === "z" || team === "f") ? team : "";
    const crit = dmg >= 80;
    el.className = `dmg${mine ? " mine" : ""}${side ? ` ${side}` : ""}${ki ? " ki" : ""}${heavy ? " heavy" : ""}${crit ? " crit" : ""}`;
    const inner = document.createElement("span");
    inner.textContent = String(dmg);
    el.appendChild(inner);
    const obj = new CSS2DObject(el);
    obj.position.copy(t.pos());
    obj.position.y += t.height * 0.9;
    obj.position.x += (Math.random() - 0.5) * 0.35;
    this.scene.add(obj);
    this.floats.push({ obj, el, t: heavy ? 1.15 : 0.9, life: heavy ? 1.15 : 0.9 });
  }

  tick(dt, people) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      if (s.lock) {
        const aim = s.lock.pos().clone();
        aim.y += s.lock.height * 0.7;
        const to = aim.sub(s.mesh.position);
        if (to.length() > 1) {
          to.normalize();
          if (to.dot(s.dir) > 0.15) {
            s.dir.lerp(to, Math.min(1, s.home * dt * 60));
            s.dir.normalize();
          }
        }
      }
      s.mesh.position.addScaledVector(s.dir, s.speed * dt); // avance: speed (u/s) * dt
      if (s.kind === "disk") s.mesh.rotation.z += dt * 14;
      if (s.kind === "beam") alignBeam(s.mesh, s.dir);
      s.trail += dt;
      if (s.trail > 0.04) {
        s.trail = 0;
        const t = new THREE.Mesh(
          new THREE.SphereGeometry(s.aoe ? 0.38 + s.hitR * 0.06 : 0.1, 6, 6),
          new THREE.MeshBasicMaterial({
            color: s.color,
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        t.position.copy(s.mesh.position);
        this.scene.add(t);
        this.fx.push({ mesh: t, v: new THREE.Vector3(), t: 0.18 });
      }
      let clash = false;
      for (let j = i - 1; j >= 0; j--) {
        const o = this.shots[j];
        if (o.faccion === s.faccion) continue;
        const r = (s.hitR + o.hitR) * 0.38;
        if (s.mesh.position.distanceTo(o.mesh.position) > r) continue;
        const mid = s.mesh.position.clone().lerp(o.mesh.position, 0.5);
        spawnClash(this.scene, mid, s.color, o.color, this.fx);
        this.jolt(mid, 0.38);
        this.scene.remove(o.mesh);
        this.shots.splice(j, 1);
        clash = true;
        break;
      }
      if (clash) {
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const t of people) {
        if (t.faccion === s.faccion || t.dead) continue;
        const aim = t.pos().clone();
        aim.y += t.height * 0.7;
        if (s.mesh.position.distanceTo(aim) < s.hitR) {
          hit = true;
          break;
        }
      }
      if (hit || s.life <= 0) {
        if (s.aoe && (hit || s.life <= 0)) this.boom(s, people);
        else if (hit) {
          const t = people.find((o) => {
            if (o.faccion === s.faccion) return false;
            const aim = o.pos().clone();
            aim.y += o.height * 0.7;
            return s.mesh.position.distanceTo(aim) < s.hitR;
          });
          if (t) {
            this.hurt(t, s.dmg, true, s.atk, s.mesh.position);
            spawnBurst(this.scene, s.mesh.position, s.color, this.fx);
            this.jolt(s.mesh.position, 0.2);
            const hp = s.mesh.position;
            playSfx(s.snipe || s.kind === "beam" ? "longBlastLand" : "smallBlastHit", hp.x, hp.y, hp.z, 0.5);
          }
        } else if (!s.aoe) {
          const hp = s.mesh.position;
          playSfx(s.snipe || s.kind === "beam" ? "longBlastLand" : "smallBlastLand", hp.x, hp.y, hp.z, 0.4);
        }
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t -= dt;
      if (f.v.lengthSq()) f.mesh.position.addScaledVector(f.v, dt);
      if (f.grow) f.mesh.scale.addScalar(f.grow * dt);
      const mat = f.mesh.material;
      if (mat.opacity != null) mat.opacity = Math.max(0, f.t * 3);
      if (f.t <= 0) {
        this.scene.remove(f.mesh);
        this.fx.splice(i, 1);
      }
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t -= dt;
      f.obj.position.y += dt * (f.life > 1 ? 2.1 : 1.6);
      f.el.style.opacity = String(Math.max(0, f.t / (f.life || 0.9)));
      if (f.t <= 0) {
        this.scene.remove(f.obj);
        f.el.remove();
        this.floats.splice(i, 1);
      }
    }
  }
}
