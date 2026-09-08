import * as THREE from "three";
import { MAP, BASE_Z } from "./config.js";
import { log } from "./log.js";
import { surfaceHeight, groundHeight, WATER_Y, isWater, pickDryLand } from "./world.js";
import { shipBallSlot } from "./bases.js";

const BALL_R = 0.72;

function ballRestY(x, z) {
  const floor = groundHeight(x, z) + BALL_R + 0.08;
  if (floor >= WATER_Y + 0.2) return floor;
  return Math.max(floor, WATER_Y - 1.7);
}

function starGeo(r = 0.11) {
  const shape = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: r * 0.22, bevelEnabled: false });
}

/** Posiciones internas clásicas para 1–7 estrellas. */
function starOffsets(n, r) {
  const out = [];
  if (n === 1) {
    out.push([0, 0, 0]);
  } else if (n === 7) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      out.push([Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.12, Math.sin(a) * r * 0.38]);
    }
    out.push([0, 0, 0]);
  } else {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const tilt = ((i % 3) - 1) * 0.1;
      out.push([Math.cos(a) * r * 0.36, tilt * r, Math.sin(a) * r * 0.36]);
    }
  }
  return out;
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
      new THREE.SphereGeometry(BALL_R, 24, 20),
      new THREE.MeshPhongMaterial({
        color: 0xff9100,
        emissive: 0xe65100,
        emissiveIntensity: 0.45,
        specular: 0xffe0b2,
        shininess: 55,
        transparent: true,
        opacity: 0.72,
        depthWrite: true,
      })
    );
    g.add(ball);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 1.28, 14, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffab40,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    g.add(glow);
    const starMat = new THREE.MeshBasicMaterial({
      color: 0xc62828,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const geo = starGeo(BALL_R * 0.16);
    for (const [sx, sy, sz] of starOffsets(n, BALL_R)) {
      const star = new THREE.Mesh(geo, starMat);
      star.position.set(sx, sy, sz);
      star.rotation.y = Math.atan2(sx, sz) || 0;
      g.add(star);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_R * 1.85, 0.07, 8, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffc107,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -BALL_R * 0.85;
    g.add(ring);
    g.position.set(x, surfaceHeight(x, z) + BALL_R + 0.08, z);
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
    const slot = shipBallSlot(faccion, n);
    b.mesh.position.set(slot.x, surfaceHeight(slot.x, slot.z) + BALL_R + 0.08, slot.z);
  }
}

/** Empuja personajes fuera de las esferas (sólidas). Quien agarra esa esfera no es empujado. */
export function resolveBallCollisions(people, balls) {
  if (!balls?.items) return;
  for (const b of balls.items) {
    if (b.held || !b.mesh?.visible) continue;
    const bx = b.mesh.position.x;
    const by = b.mesh.position.y;
    const bz = b.mesh.position.z;
    const br = BALL_R * 0.92;
    for (const p of people) {
      if (p.dead) continue;
      if ((p.flyAlt || 0) > 1.4) continue;
      if (p._grabbing && p._grabBall === b) continue;
      const dy = Math.abs(p.mesh.position.y - by);
      if (dy > 2.2) continue;
      const dx = p.mesh.position.x - bx;
      const dz = p.mesh.position.z - bz;
      let d = Math.hypot(dx, dz);
      const minD = br + 0.36 + p.height * 0.07;
      if (d >= minD) continue;
      if (d < 1e-4) {
        const a0 = Math.random() * Math.PI * 2;
        p.mesh.position.x += Math.cos(a0) * 0.02;
        p.mesh.position.z += Math.sin(a0) * 0.02;
        d = 0.02;
      }
      const push = (minD - d) * 1.05;
      p.mesh.position.x += (dx / d) * push;
      p.mesh.position.z += (dz / d) * push;
    }
  }
}
