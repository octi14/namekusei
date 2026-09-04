import * as THREE from "three";
import { MAP, BASE_Z } from "./config.js";
import { log } from "./log.js";
import { surfaceHeight, groundHeight, WATER_Y, isWater, pickDryLand } from "./world.js";

function ballRestY(x, z) {
  const floor = groundHeight(x, z) + 0.55;
  if (floor >= WATER_Y + 0.2) return floor;
  return Math.max(floor, WATER_Y - 1.7);
}

export class DragonBalls {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    for (let i = 1; i <= 7; i++) this.spawn(i);
  }

  spawn(n) {
    const p = pickDryLand(260);
    const x = p.x;
    const z = p.z;
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 16, 14),
      new THREE.MeshLambertMaterial({ color: 0xff9100, emissive: 0xcc4400, emissiveIntensity: 0.85 })
    );
    g.add(ball);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffab40,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    g.add(glow);
    for (let s = 0; s < n; s++) {
      const a = (s / n) * Math.PI * 2;
      const star = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff8e1 })
      );
      star.position.set(Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22);
      g.add(star);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffc107,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.42;
    g.add(ring);
    g.position.set(x, surfaceHeight(x, z) + 0.55, z);
    this.scene.add(g);
    this.items.push({ n, mesh: g, ball, glow, ring, held: false, inBase: null, cold: 0, pulse: Math.random() * 6, vy: 0 });
  }

  near(personaje) {
    if (personaje.esfera != null) return null;
    const wetP = personaje.inSwim?.() || isWater(personaje.pos().x, personaje.pos().z);
    if (!wetP && (personaje.flyAlt || 0) > 0.35) return null;
    const p = personaje.pos();
    for (const b of this.items) {
      if (b.held || b.cold > 0) continue;
      if (b.inBase === personaje.faccion) continue;
      const wetB = isWater(b.mesh.position.x, b.mesh.position.z);
      const yMax = wetP || wetB ? 6.2 : 3.6;
      if (Math.abs(p.y - b.mesh.position.y) > yMax) continue;
      const xz = wetP || wetB ? 3.4 : 2.2;
      if (Math.hypot(b.mesh.position.x - p.x, b.mesh.position.z - p.z) < xz) return b;
    }
    return null;
  }

  pickup(personaje) {
    const b = this.near(personaje);
    if (!b) return;
    const stole = b.inBase && b.inBase !== personaje.faccion;
    b.held = true;
    b.inBase = null;
    b.mesh.visible = false;
    personaje.esfera = b.n;
    log(
      stole
        ? `${personaje.nombre} robó la esfera ${b.n}`
        : `${personaje.nombre} tomó la esfera ${b.n}`,
      personaje.faccion
    );
    return { n: b.n, stole };
  }

  drop(n, x, z) {
    const b = this.items.find((i) => i.n === n);
    if (!b) return;
    b.held = false;
    b.inBase = null;
    b.cold = 0.7;
    b.mesh.visible = true;
    b.vy = 2.4;
    b.mesh.position.set(x, surfaceHeight(x, z) + 1.1, z);
  }

  tick(dt) {
    for (const b of this.items) {
      b.cold = Math.max(0, (b.cold || 0) - dt);
      if (b.held) continue;
      if (!b.inBase) {
        const rest = ballRestY(b.mesh.position.x, b.mesh.position.z);
        const wet = rest < WATER_Y + 0.15;
        b.vy = (b.vy || 0) - (wet ? 14 : 28) * dt;
        b.mesh.position.y += b.vy * dt;
        if (b.mesh.position.y <= rest) {
          b.mesh.position.y = rest;
          b.vy = 0;
        }
      }
      b.pulse = (b.pulse || 0) + dt * 3.2;
      const p = 1 + Math.sin(b.pulse) * 0.08;
      b.mesh.scale.setScalar(p);
      b.mesh.rotation.y += dt * 0.8;
      if (b.glow) b.glow.material.opacity = 0.2 + Math.sin(b.pulse) * 0.14;
      if (b.ring) {
        b.ring.scale.setScalar(1 + Math.sin(b.pulse * 0.7) * 0.12);
        b.ring.material.opacity = 0.4 + Math.sin(b.pulse) * 0.2;
      }
    }
  }

  placeInBase(n, faccion) {
    const b = this.items.find((i) => i.n === n);
    if (!b) return;
    b.held = false;
    b.inBase = faccion;
    b.cold = 0.9;
    b.mesh.visible = true;
    const z0 = faccion === "z" ? -BASE_Z : BASE_Z;
    const a = ((n - 1) / 7) * Math.PI * 2;
    const x = Math.cos(a) * 6.2;
    const z = z0 + Math.sin(a) * 6.2;
    b.mesh.position.set(x, surfaceHeight(x, z) + 0.55, z);
  }
}
