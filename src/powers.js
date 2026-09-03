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
};

export function powerStyle(nombre, faccion) {
  if (STYLES[nombre]) return { ...STYLES[nombre] };
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
  const s = superOn ? 1.7 + rank * 0.7 : 1;
  const c = style.color;
  const g = new THREE.Group();
  if (style.kind === "beam") {
    const len = 3.6 * s;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(style.r * s * 0.18, style.r * s * 0.28, len, 8),
      mat(0xffffff, 0.95)
    );
    g.add(core);
    const aura = spr(c, 0.55);
    aura.scale.set(style.r * s * 7, len * 0.85, 1);
    g.add(aura);
    const tip = spr(0xffffff, 0.9);
    tip.scale.setScalar(style.r * s * 4.2);
    tip.position.y = len * 0.42;
    g.add(tip);
    const bloom = spr(c, 0.35);
    bloom.scale.setScalar(style.r * s * 6.5);
    bloom.position.y = len * 0.2;
    g.add(bloom);
  } else if (style.kind === "disk") {
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(style.r * s, style.r * s, 0.05 * s, 24),
      mat(c, 0.75)
    );
    disk.rotation.x = Math.PI / 2;
    g.add(disk);
    const halo = spr(c, 0.5);
    halo.scale.setScalar(style.r * s * 5.5);
    g.add(halo);
    const core = spr(0xffffff, 0.7);
    core.scale.setScalar(style.r * s * 2.4);
    g.add(core);
  } else {
    const core = spr(0xffffff, 0.95);
    core.scale.setScalar(style.r * s * 2.8);
    const body = spr(c, 0.7);
    body.scale.setScalar(style.r * s * 5.2);
    const halo = spr(c, 0.32);
    halo.scale.setScalar(style.r * s * 8.5);
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

export function spawnHit(scene, pos, list, dir) {
  spawnBurst(scene, pos, 0xfff176, list);
  const flash = spr(0xffffff, 0.95);
  flash.scale.setScalar(1.1);
  flash.position.copy(pos);
  scene.add(flash);
  list.push({ mesh: flash, v: new THREE.Vector3(), t: 0.16, grow: 20 });
  if (dir) {
    const slash = spr(0xffecb3, 0.85);
    slash.scale.set(1.8, 0.55, 1);
    slash.position.copy(pos);
    scene.add(slash);
    list.push({ mesh: slash, v: dir.clone().multiplyScalar(5), t: 0.2, grow: 8 });
  }
}

export function spawnMeleeArc(scene, pos, yaw, list) {
  const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const p = pos.clone().addScaledVector(f, 1.05);
  p.y += 0.15;
  const arc = spr(0xffcc80, 0.75);
  arc.scale.set(2.4, 1.1, 1);
  arc.position.copy(p);
  scene.add(arc);
  list.push({ mesh: arc, v: f.clone().multiplyScalar(3), t: 0.18, grow: 10 });
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
