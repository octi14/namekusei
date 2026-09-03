import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { SUPER_KI, superRank } from "./config.js";
import { powerStyle, makePowerMesh, alignBeam, spawnBurst, spawnClash, spawnHit, spawnMuzzle, spawnMeleeArc } from "./powers.js";

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
    if (this.cam.camera.position.distanceTo(pos) < 32) this.cam.shake(amt);
  }

  melee(at, all) {
    if (at.cooldown > 0 || at.dead || at.stun > 0 || (at.hitstop || 0) > 0) return;
    const now = performance.now() * 0.001;
    if (!at.comboT || now - at.comboT > 0.62) at.combo = 0;
    const step = at.combo % 3;
    at.combo = step + 1;
    at.comboT = now;
    at.punchStep = step;
    at.posePunch = step === 2 ? 0.38 : 0.24;
    at.cooldown = step === 2 ? 0.48 : 0.14;
    let best = null;
    let bestS = 9;
    const origin = at.pos();
    for (const t of all) {
      if (t.faccion === at.faccion || t === at || t.dead) continue;
      const d = t.pos().clone().sub(origin);
      d.y = 0;
      const dist = d.length();
      if (dist > 3.1 || dist < 0.2) continue;
      d.normalize();
      const side = d.dot(fwd(at.yaw));
      const score = dist - (side > 0.1 ? 1.4 : 0);
      if (score < bestS) {
        bestS = score;
        best = t;
      }
    }
    if (best) {
      const to = best.pos().clone().sub(origin);
      at.yaw = Math.atan2(to.x, to.z);
    }
    const f = fwd(at.yaw);
    const finisher = step === 2;
    spawnMeleeArc(this.scene, origin.clone().setY(origin.y + at.height * (finisher ? 0.42 : 0.62)), at.yaw, this.fx);
    const reach = finisher ? 3.0 : 2.55;
    for (const t of all) {
      if (t.faccion === at.faccion || t === at || t.dead) continue;
      const d = t.pos().clone().sub(origin);
      d.y = 0;
      if (d.length() > reach) continue;
      if (d.normalize().dot(f) < 0.12) continue;
      let dmg = Math.max(1, Math.round((at.s.ataque * (finisher ? 16 : 10)) / (8 + t.s.defensa)));
      const hitP = t.pos().clone();
      hitP.y += t.height * 0.7;
      spawnHit(this.scene, hitP, this.fx, f);
      this.jolt(hitP, finisher ? 0.28 : 0.16);
      at.hitstop = Math.max(at.hitstop || 0, finisher ? 0.1 : 0.055);
      t.hitstop = Math.max(t.hitstop || 0, finisher ? 0.12 : 0.07);
      this.hurt(t, dmg, false, at, at.pos(), finisher ? 22 : 8);
    }
  }

  blast(at, superOn, people, snipe = false) {
    if (at.cooldown > 0 || at.dead || at.stun > 0) return false;
    const style = powerStyle(at.nombre, at.faccion);
    const rank = superOn ? superRank(at.s.ki, at.s.kiMax, at.s.ataque) : 0;
    const need = superOn ? at.s.kiMax * SUPER_KI : snipe ? 22 : 12;
    if (superOn && rank < 1) return false;
    if (!superOn && at.s.ki < need) return false;
    at.s.ki -= superOn ? need * (0.38 + rank * 0.16) : need;
    at.cooldown = superOn ? 1.05 + rank * 0.18 : snipe ? 0.62 : 0.38;
    at.poseBlast = superOn ? 0.48 + rank * 0.12 : snipe ? 0.42 : 0.32;
    const dir = fwd(at.yaw);
    const mesh = makePowerMesh(style, superOn, rank);
    mesh.position.copy(at.pos()).addScaledVector(dir, 1.4);
    mesh.position.y = at.pos().y + at.height * 0.7;
    if (style.kind === "beam") alignBeam(mesh, dir);
    this.scene.add(mesh);
    const hand = at.pos().clone().addScaledVector(dir, 0.85);
    hand.y += at.height * 0.68;
    const off = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(0.22);
    spawnMuzzle(this.scene, hand.clone().add(off), style.color, this.fx);
    spawnMuzzle(this.scene, hand.clone().sub(off), style.color, this.fx);
    const dmg = superOn
      ? Math.round((18 + at.s.kiMax * 0.12) * (0.78 + rank * 0.36))
      : Math.round((snipe ? 6 : 8) + at.s.kiMax * 0.04);
    const hitR = (style.r || 0.22) * (superOn ? 1.6 + rank * 0.55 : 1.15) + 0.7;
    const rng = (style.range || 55) * (snipe ? 1.45 : 1) * (superOn ? 1.08 + rank * 0.1 : 1);
    const life = (style.life || 1.4) * (snipe ? 1.5 : 1) * (superOn ? 1.1 + rank * 0.12 : 1);
    this.shots.push({
      mesh,
      dir,
      faccion: at.faccion,
      dmg,
      life,
      atk: at,
      speed: style.speed * (superOn ? 1.05 + rank * 0.08 : snipe ? 1.25 : 1),
      hitR,
      kind: style.kind,
      color: style.color,
      trail: 0,
      lock: this.pickLock(at, dir, people, rng),
      home: ((superOn ? 0.1 + rank * 0.03 : 0.07) * (style.range > 100 ? 0.7 : 1)),
      aoe: superOn,
      aoeR: superOn ? 6.2 + rank * 3.4 : 0,
    });
    if (superOn || snipe) this.jolt(at.pos(), snipe ? 0.14 : 0.16 + rank * 0.1);
    return true;
  }

  boom(s, people) {
    const pos = s.mesh.position;
    spawnBurst(this.scene, pos, s.color, this.fx);
    spawnBurst(this.scene, pos, s.color, this.fx);
    this.jolt(pos, 0.42);
    for (const t of people) {
      if (t.faccion === s.faccion || t.dead) continue;
      const d = pos.distanceTo(t.pos().clone().setY(t.pos().y + t.height * 0.7));
      if (d > s.aoeR) continue;
      const fall = 1 - d / s.aoeR;
      const dmg = Math.max(1, Math.round(s.dmg * (0.4 + 0.6 * fall)));
      this.hurt(t, dmg, true, s.atk, pos);
    }
  }

  pickLock(at, dir, people, maxD = 55) {
    if (!people) return null;
    let best = null;
    let bestD = maxD;
    const origin = at.pos();
    for (const t of people) {
      if (t.faccion === at.faccion || t === at || t.dead) continue;
      const to = t.pos().clone().sub(origin);
      const dist = to.length();
      if (dist > maxD || dist < 1.5) continue;
      to.y = 0;
      to.normalize();
      if (to.dot(dir) < 0.35) continue;
      if (dist < bestD) {
        bestD = dist;
        best = t;
      }
    }
    return best;
  }

  hurt(t, dmg, ki, atk, from, knock) {
    if (t.dead) return;
    t.s.hp -= dmg;
    this.float(t, dmg, ki);
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
      t.hitBy = [];
      t.die(this.balls, atk, ki);
      if (atk) {
        atk.s.ataque *= 1.01;
        atk.s.defensa *= 1.01;
        atk.s.velocidad *= 1.01;
        atk.s.kiMax *= 1.01;
      }
      return;
    }
    const src = from || atk?.pos();
    if (src) t.knock(src, knock ?? (ki ? 16 : 9));
    t.stun = Math.max(t.stun || 0, ki ? 0.36 : knock && knock > 16 ? 0.48 : 0.32);
  }

  float(t, dmg, ki) {
    const el = document.createElement("div");
    el.className = ki ? "dmg ki" : "dmg";
    el.textContent = String(dmg);
    const obj = new CSS2DObject(el);
    obj.position.copy(t.pos());
    obj.position.y += t.height * 0.9;
    this.scene.add(obj);
    this.floats.push({ obj, el, t: 0.9 });
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
      s.mesh.position.addScaledVector(s.dir, s.speed * dt);
      if (s.kind === "disk") s.mesh.rotation.z += dt * 14;
      if (s.kind === "beam") alignBeam(s.mesh, s.dir);
      s.trail += dt;
      if (s.trail > 0.04) {
        s.trail = 0;
        const t = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 5, 5),
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
          }
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
      f.obj.position.y += dt * 1.6;
      f.el.style.opacity = String(Math.max(0, f.t / 0.9));
      if (f.t <= 0) {
        this.scene.remove(f.obj);
        f.el.remove();
        this.floats.splice(i, 1);
      }
    }
  }
}
