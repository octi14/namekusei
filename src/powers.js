import * as THREE from "three";

const STYLES = {
  Gokú: { kind: "beam", color: 0x4fc3f7, speed: 40, r: 0.2, life: 1.9, range: 95 },
  Gohan: { kind: "beam", color: 0x81d4fa, speed: 36, r: 0.18, life: 1.55, range: 72 },
  Krilin: { kind: "disk", color: 0xffee58, speed: 34, r: 0.55, life: 2.35, range: 125 },
  Pikoro: { kind: "beam", color: 0x69f0ae, speed: 52, r: 0.1, life: 2.7, range: 170 },
  Vegeta: { kind: "beam", color: 0xce93d8, speed: 42, r: 0.18, life: 2.05, range: 115 },
  Nail: { kind: "ball", color: 0xa5d6a7, speed: 30, r: 0.28, life: 1.15, range: 52 },
  Dendé: { kind: "ball", color: 0xc5e1a5, speed: 24, r: 0.2, life: 1.05, range: 48 },
  Freezer: { kind: "beam", color: 0xf48fb1, speed: 55, r: 0.08, life: 2.6, range: 165 },
  Zaabon: { kind: "ball", color: 0xf06292, speed: 32, r: 0.25, life: 1.35, range: 62 },
  Dodoria: { kind: "ball", color: 0xff8a80, speed: 22, r: 0.42, life: 0.85, range: 38 },
  Gurdo: { kind: "ball", color: 0xb39ddb, speed: 18, r: 0.35, life: 1.0, range: 44 },
  Rikum: { kind: "ball", color: 0xff5252, speed: 28, r: 0.3, life: 1.2, range: 55 },
  Yiz: { kind: "beam", color: 0x80d8ff, speed: 38, r: 0.14, life: 1.85, range: 100 },
  Butter: { kind: "ball", color: 0xdce775, speed: 30, r: 0.26, life: 1.25, range: 58 },
  Ginyu: { kind: "ball", color: 0xea80fc, speed: 28, r: 0.32, life: 1.3, range: 60 },
  Kiwy: { kind: "ball", color: 0x80cbc4, speed: 30, r: 0.24, life: 1.2, range: 54 },
  Appule: { kind: "ball", color: 0xce93d8, speed: 29, r: 0.22, life: 1.15, range: 50 },
  "Ten Shin Han": { kind: "beam", color: 0xffee58, speed: 40, r: 0.16, life: 1.7, range: 90 },
  Yamcha: { kind: "ball", color: 0xffcc80, speed: 32, r: 0.24, life: 1.2, range: 58 },
  Chaoz: { kind: "ball", color: 0xeeeeee, speed: 22, r: 0.18, life: 1.0, range: 42 },
  Yajirobee: { kind: "ball", color: 0xff8a65, speed: 20, r: 0.32, life: 0.9, range: 36 },
  Kami: { kind: "beam", color: 0xa5d6a7, speed: 36, r: 0.12, life: 1.8, range: 80 },
  Nappa: { kind: "ball", color: 0xffab40, speed: 24, r: 0.4, life: 1.0, range: 48 },
  Raditz: { kind: "beam", color: 0x81c784, speed: 38, r: 0.16, life: 1.9, range: 100 },
  Saibaman: { kind: "ball", color: 0x9ccc65, speed: 22, r: 0.2, life: 0.9, range: 36 },
  Trunks: { kind: "beam", color: 0xce93d8, speed: 44, r: 0.16, life: 2.0, range: 110 },
  "Mr. Satan": { kind: "ball", color: 0xef5350, speed: 16, r: 0.28, life: 0.7, range: 28 },
  Cell: { kind: "beam", color: 0x69f0ae, speed: 50, r: 0.14, life: 2.4, range: 140 },
  "Nº16": { kind: "ball", color: 0x90a4ae, speed: 26, r: 0.38, life: 1.1, range: 50 },
  "Nº17": { kind: "beam", color: 0x81d4fa, speed: 42, r: 0.12, life: 1.9, range: 100 },
  "Nº18": { kind: "beam", color: 0xf8bbd0, speed: 42, r: 0.12, life: 1.9, range: 100 },
  "Nº19": { kind: "ball", color: 0xef9a9a, speed: 22, r: 0.3, life: 1.0, range: 44 },
  "Dr. Gero": { kind: "ball", color: 0xb0bec5, speed: 24, r: 0.22, life: 1.1, range: 48 },
};

export function powerStyle(nombre, faccion) {
  if (STYLES[nombre]) return { ...STYLES[nombre] };
  if (nombre.startsWith("Saibaman")) return { ...STYLES.Saibaman };
  if (nombre.startsWith("Cell Jr.")) return { kind: "beam", color: 0xa5d6a7, speed: 36, r: 0.1, life: 1.6, range: 80 };
  if (faccion === "z") return { kind: "ball", color: 0x81c784, speed: 28, r: 0.22, life: 1.15, range: 50 };
  return { kind: "ball", color: 0x90caf9, speed: 26, r: 0.2, life: 1.1, range: 48 };
}

let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.28, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

function spr(color, opacity = 0.85) {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}

function mat(color, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export function makePowerMesh(style, superOn, rank = 0) {
  const s = superOn ? 3.4 + rank * 1.15 : 1;
  const c = style.color;
  const g = new THREE.Group();
  if (style.kind === "beam") {
    const len = 3.6 * s;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(style.r * s * 0.18, style.r * s * 0.28, len, 8),
      mat(0xffffff, 0.98)
    );
    g.add(core);
    const aura = spr(c, 0.62);
    aura.scale.set(style.r * s * 9, len * 0.95, 1);
    g.add(aura);
    const tip = spr(0xffffff, 0.95);
    tip.scale.setScalar(style.r * s * 5.2);
    tip.position.y = len * 0.42;
    g.add(tip);
    const bloom = spr(c, 0.42);
    bloom.scale.setScalar(style.r * s * 9.5);
    bloom.position.y = len * 0.2;
    g.add(bloom);
    const bloom2 = spr(0xffffff, 0.22);
    bloom2.scale.setScalar(style.r * s * 12);
    bloom2.position.y = len * 0.15;
    g.add(bloom2);
  } else if (style.kind === "disk") {
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(style.r * s, style.r * s, 0.05 * s, 24),
      mat(c, 0.75)
    );
    disk.rotation.x = Math.PI / 2;
    g.add(disk);
    const halo = spr(c, 0.55);
    halo.scale.setScalar(style.r * s * 6.5);
    g.add(halo);
    const core = spr(0xffffff, 0.75);
    core.scale.setScalar(style.r * s * 2.8);
    g.add(core);
  } else {
    const core = spr(0xffffff, 0.95);
    core.scale.setScalar(style.r * s * 2.8);
    const body = spr(c, 0.75);
    body.scale.setScalar(style.r * s * 5.8);
    const halo = spr(c, 0.38);
    halo.scale.setScalar(style.r * s * 10);
    g.add(halo, body, core);
  }
  return g;
}

export function alignBeam(mesh, dir) {
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}

export function spawnBurst(scene, pos, color, list) {
  for (let i = 0; i < 9; i++) {
    const m = spr(color, 0.85);
    const sc = 0.45 + Math.random() * 0.7;
    m.scale.setScalar(sc);
    m.position.copy(pos);
    scene.add(m);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.55, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(7 + Math.random() * 9);
    list.push({ mesh: m, v, t: 0.34, grow: 4 });
  }
}

export function spawnMuzzle(scene, pos, color, list) {
  const flash = spr(0xffffff, 0.95);
  flash.scale.setScalar(0.7);
  flash.position.copy(pos);
  scene.add(flash);
  list.push({ mesh: flash, v: new THREE.Vector3(), t: 0.12, grow: 18 });
  const glow = spr(color, 0.7);
  glow.scale.setScalar(1.15);
  glow.position.copy(pos);
  scene.add(glow);
  list.push({ mesh: glow, v: new THREE.Vector3(), t: 0.2, grow: 12 });
}

export function spawnHit(scene, pos, list, dir, heavy = false) {
  spawnBurst(scene, pos, heavy ? 0xffecb3 : 0xfff176, list);
  const flash = spr(0xffffff, 1);
  flash.scale.setScalar(heavy ? 2.4 : 1.6);
  flash.position.copy(pos);
  scene.add(flash);
  list.push({ mesh: flash, v: new THREE.Vector3(), t: heavy ? 0.16 : 0.12, grow: heavy ? 36 : 28 });
  const flash2 = spr(heavy ? 0xff8a65 : 0xffffff, 0.75);
  flash2.scale.setScalar(heavy ? 1.35 : 0.9);
  flash2.position.copy(pos);
  scene.add(flash2);
  list.push({ mesh: flash2, v: new THREE.Vector3(), t: 0.22, grow: 14 });
  // chispas radiales
  const n = heavy ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const spark = spr(i % 2 ? 0xfff59d : 0xffab40, 0.9);
    spark.scale.set(0.12, 0.55 + Math.random() * 0.7, 1);
    spark.position.copy(pos);
    scene.add(spark);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const spd = (heavy ? 14 : 9) + Math.random() * 8;
    list.push({
      mesh: spark,
      v: new THREE.Vector3(Math.cos(a) * spd, 2 + Math.random() * 6, Math.sin(a) * spd),
      t: 0.16 + Math.random() * 0.12,
      grow: 6,
    });
  }
  if (dir) {
    const slash = spr(0xffecb3, 0.9);
    slash.scale.set(heavy ? 3.2 : 2.2, heavy ? 0.7 : 0.55, 1);
    slash.position.copy(pos);
    scene.add(slash);
    list.push({ mesh: slash, v: dir.clone().multiplyScalar(heavy ? 8 : 5), t: 0.22, grow: 10 });
    // línea de impacto secundaria
    const slash2 = spr(0xffffff, 0.55);
    slash2.scale.set(1.4, 0.28, 1);
    slash2.position.copy(pos);
    scene.add(slash2);
    list.push({ mesh: slash2, v: dir.clone().multiplyScalar(12), t: 0.12, grow: 4 });
  }
}

/** Anillo de aviso al cargar / soltar un blast. */
export function spawnTelegraph(scene, pos, color, list, scale = 1) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2 * scale, 0.55 * scale, 24),
    mat(color, 0.65)
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, pos.y + 0.05, pos.z);
  scene.add(ring);
  list.push({ mesh: ring, v: new THREE.Vector3(), t: 0.28, grow: 16 });
  const glow = spr(color, 0.55);
  glow.scale.setScalar(0.8 * scale);
  glow.position.copy(pos);
  glow.position.y += 0.4;
  scene.add(glow);
  list.push({ mesh: glow, v: new THREE.Vector3(0, 2, 0), t: 0.25, grow: 10 });
}

/** Anillo de polvo / cráter suave en el suelo. */
export function spawnImpactRing(scene, pos, list, heavy = false) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, heavy ? 1.15 : 0.75, 28),
    mat(heavy ? 0xffe082 : 0xffcc80, heavy ? 0.7 : 0.55)
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, pos.y + 0.06, pos.z);
  scene.add(ring);
  list.push({ mesh: ring, v: new THREE.Vector3(), t: heavy ? 0.48 : 0.3, grow: heavy ? 12 : 8 });
  for (let i = 0; i < (heavy ? 7 : 4); i++) {
    const d = spr(0xbcaaa4, 0.55);
    d.scale.setScalar(0.35 + Math.random() * 0.45);
    d.position.set(pos.x, pos.y + 0.2, pos.z);
    scene.add(d);
    const a = Math.random() * Math.PI * 2;
    list.push({
      mesh: d,
      v: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 5), 3 + Math.random() * 4, Math.sin(a) * (4 + Math.random() * 5)),
      t: 0.35 + Math.random() * 0.2,
      grow: 3,
    });
  }
}

/** Speed line corta detrás del personaje. */
export function spawnSpeedStreak(scene, pos, dir, list, color = 0xffffff) {
  const s = spr(color, 0.55);
  s.scale.set(0.25, 1.8 + Math.random() * 1.2, 1);
  s.position.copy(pos);
  s.position.x += (Math.random() - 0.5) * 0.6;
  s.position.y += (Math.random() - 0.5) * 0.5;
  s.position.z += (Math.random() - 0.5) * 0.6;
  scene.add(s);
  list.push({
    mesh: s,
    v: dir.clone().multiplyScalar(-(18 + Math.random() * 12)),
    t: 0.12 + Math.random() * 0.08,
    grow: 2,
  });
}

export function spawnMeleeArc(scene, pos, yaw, list) {
  const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const p = pos.clone().addScaledVector(f, 1.05);
  p.y += 0.15;
  const arc = spr(0xffcc80, 0.85);
  arc.scale.set(2.8, 1.25, 1);
  arc.position.copy(p);
  scene.add(arc);
  list.push({ mesh: arc, v: f.clone().multiplyScalar(4), t: 0.2, grow: 12 });
  const whoosh = spr(0xfff8e1, 0.45);
  whoosh.scale.set(1.6, 0.35, 1);
  whoosh.position.copy(p);
  scene.add(whoosh);
  list.push({ mesh: whoosh, v: f.clone().multiplyScalar(9), t: 0.12, grow: 6 });
}

export function spawnClash(scene, pos, c1, c2, list) {
  spawnBurst(scene, pos, c1, list);
  spawnBurst(scene, pos, c2, list);
  const flash = spr(0xffffff, 0.95);
  flash.scale.setScalar(1.6);
  flash.position.copy(pos);
  scene.add(flash);
  list.push({ mesh: flash, v: new THREE.Vector3(), t: 0.22, grow: 24 });
  const ring = spr(0xfff59d, 0.7);
  ring.scale.setScalar(1.2);
  ring.position.copy(pos);
  scene.add(ring);
  list.push({ mesh: ring, v: new THREE.Vector3(), t: 0.3, grow: 16 });
}
