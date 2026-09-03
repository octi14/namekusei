import * as THREE from "three";
import { MAP, BASE_Z } from "./config.js";

const BASE_R = 12;
export const patriarchHill = { x: 140, z: 0 };

export function pickPatriarchHill() {
  const m = MAP / 2 - 110;
  for (let i = 0; i < 50; i++) {
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    if (Math.abs(x) < 70) continue;
    if (Math.hypot(x, z + BASE_Z) < 130) continue;
    if (Math.hypot(x, z - BASE_Z) < 130) continue;
    patriarchHill.x = x;
    patriarchHill.z = z;
    return;
  }
  patriarchHill.x = m * 0.62;
  patriarchHill.z = 40;
}

function hillBump(x, z) {
  const d = Math.hypot(x - patriarchHill.x, z - patriarchHill.z);
  const R = 78;
  if (d >= R) return 0;
  const t = 1 - d / R;
  return 52 * t * t * (3 - 2 * t);
}

export let mapId = "namek";

function earthMountAmt(x, z) {
  const m = x * 0.00072 + z * 0.00038 + Math.sin(x * 0.0038) * 0.22 + Math.cos(z * 0.0044) * 0.16;
  const t = Math.max(0, Math.min(1, (m - 0.18) / 0.55));
  return t * t * (3 - 2 * t);
}

function earthHeight(x, z) {
  const amt = earthMountAmt(x, z);
  const plains =
    Math.sin(x * 0.0055) * Math.cos(z * 0.0048) * 1.6 +
    Math.sin((x + z) * 0.003) * 0.7 +
    0.9;
  const mounts =
    Math.abs(Math.sin(x * 0.016) * Math.cos(z * 0.014)) * 42 +
    Math.sin(x * 0.038 + 1.4) * Math.sin(z * 0.031) * 18 +
    Math.sin(x * 0.09 + z * 0.05) * 9 +
    Math.cos(z * 0.072) * 8 +
    10;
  let h = plains * (1 - amt) + mounts * amt;
  const lakes = [
    { x: -260, z: 90, r: 110, d: 12 },
    { x: 80, z: -360, r: 78, d: 10 },
    { x: -480, z: 380, r: 88, d: 11 },
    { x: 40, z: 220, r: 62, d: 8 },
  ];
  for (const L of lakes) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d >= L.r) continue;
    const u = 1 - d / L.r;
    h -= L.d * u * u * (1 - amt * 0.65);
  }
  return h;
}

const CELL_ISLANDS = [
  { x: 0, z: -BASE_Z, rx: 160, rz: 128, h: 17, hills: 1 },
  { x: 0, z: BASE_Z, rx: 155, rz: 122, h: 17, hills: 1 },
  { x: 50, z: -280, rx: 240, rz: 100, h: 16, peak: 22, hills: 1 },
  { x: -70, z: 240, rx: 210, rz: 85, h: 15, hills: 1 },
  { x: -400, z: -480, rx: 150, rz: 72, h: 14, peak: 18, hills: 1 },
  { x: 430, z: -80, rx: 170, rz: 68, h: 15, peak: 24, hills: 1 },
  { x: 310, z: 520, rx: 140, rz: 78, h: 14, hills: 1 },
  { x: -460, z: 380, rx: 120, rz: 95, h: 13, peak: 16 },
  { x: 190, z: -700, rx: 95, rz: 52, h: 12, hills: 1 },
  { x: -210, z: 710, rx: 90, rz: 50, h: 12 },
  { x: 560, z: 180, rx: 72, rz: 46, h: 11, peak: 12 },
  { x: -590, z: -60, rx: 78, rz: 42, h: 11 },
  { x: 120, z: 40, rx: 110, rz: 70, h: 15, hills: 1 },
  { x: -280, z: -120, rx: 100, rz: 55, h: 13, hills: 1 },
  { x: 80, z: 140, rx: 85, rz: 48, h: 13, peak: 14 },
  { x: -150, z: -40, rx: 70, rz: 90, h: 14, hills: 1 },
  { x: 250, z: -420, rx: 95, rz: 45, h: 13 },
  { x: -320, z: 80, rx: 88, rz: 50, h: 12, peak: 15 },
  { x: 620, z: -350, rx: 65, rz: 40, h: 11 },
  { x: -520, z: -250, rx: 70, rz: 38, h: 11 },
  { x: 480, z: 700, rx: 80, rz: 42, h: 12 },
  { x: -640, z: 220, rx: 60, rz: 55, h: 12 },
  { x: 20, z: 420, rx: 75, rz: 40, h: 13 },
  { x: -90, z: -560, rx: 68, rz: 36, h: 12 },
  { x: 700, z: 40, rx: 55, rz: 70, h: 11, hills: 1 },
  { x: -180, z: 560, rx: 92, rz: 44, h: 13, peak: 12 },
  { x: 360, z: -620, rx: 58, rz: 34, h: 11 },
  { x: -380, z: 640, rx: 62, rz: 38, h: 11 },
  { x: 140, z: 300, rx: 52, rz: 32, h: 11, peak: 10 },
  { x: -240, z: 300, rx: 48, rz: 36, h: 10 },
  { x: 540, z: -520, rx: 50, rz: 30, h: 11 },
  { x: -700, z: -400, rx: 55, rz: 33, h: 10 },
  { x: 280, z: 80, rx: 44, rz: 58, h: 12, hills: 1 },
  { x: -40, z: -180, rx: 50, rz: 28, h: 11 },
  { x: 800, z: 280, rx: 48, rz: 36, h: 10 },
  { x: -780, z: 80, rx: 46, rz: 40, h: 11 },
  { x: 90, z: -850, rx: 70, rz: 38, h: 12, peak: 9 },
  { x: -100, z: 850, rx: 68, rz: 36, h: 12 },
  { x: 400, z: 320, rx: 42, rz: 50, h: 11 },
  { x: -430, z: -20, rx: 40, rz: 48, h: 10, peak: 11 },
  { x: 200, z: 640, rx: 38, rz: 26, h: 10 },
  { x: -300, z: -720, rx: 46, rz: 28, h: 11 },
  { x: 650, z: 520, rx: 36, rz: 42, h: 10 },
  { x: -550, z: 520, rx: 40, rz: 30, h: 10 },
  { x: 30, z: -40, rx: 36, rz: 24, h: 12 },
  { x: 750, z: -180, rx: 42, rz: 28, h: 10 },
];

function cellIslandH(x, z, isl) {
  const dx = (x - isl.x) / isl.rx;
  const dz = (z - isl.z) / isl.rz;
  const wobble = 1 + Math.sin(x * 0.018 + z * 0.014) * 0.14 + Math.cos((x - z) * 0.011) * 0.08;
  const D = Math.hypot(dx, dz) / wobble;
  if (D >= 1) return 0;
  const edge = D < 0.62 ? 1 : (1 - D) / 0.38;
  const t = edge * edge * (3 - 2 * edge);
  let h = isl.h * t;
  const inland = Math.max(0, 0.82 - D);
  if (isl.peak) {
    const px = (x - isl.x) / (isl.rx * 0.45) - 0.25;
    const pz = (z - isl.z) / (isl.rz * 0.45) + 0.2;
    const pd = Math.hypot(px, pz);
    if (pd < 1) h += isl.peak * (1 - pd) * (1 - pd) * t;
  }
  if (isl.hills) {
    h += Math.max(0, Math.sin((x - isl.x) * 0.028) * Math.cos((z - isl.z) * 0.022)) * 11 * inland;
    h += Math.max(0, Math.sin((x - isl.x) * 0.045 + 1.7)) * 7 * inland;
  }
  h += Math.abs(Math.sin(x * 0.02 + z * 0.017)) * 4.5 * inland;
  return h;
}

function cellHeight(x, z) {
  let h = -14;
  for (const isl of CELL_ISLANDS) h = Math.max(h, cellIslandH(x, z, isl));
  return h;
}

export function groundHeight(x, z) {
  if (mapId === "cell") return cellHeight(x, z);
  let h =
    Math.sin(x * 0.012) * Math.cos(z * 0.01) * 9 +
    Math.sin(x * 0.028 + 1.7) * Math.sin(z * 0.022) * 5.5 +
    Math.cos((x + z) * 0.008) * 3.5 +
    hillBump(x, z);
  if (mapId === "earth") h = earthHeight(x, z);
  const flatten = (cx, cz) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d >= 30) return 1;
    if (d <= BASE_R + 1) return 0;
    return (d - BASE_R - 1) / (30 - BASE_R - 1);
  };
  const w = Math.min(flatten(0, -BASE_Z), flatten(0, BASE_Z));
  return h * w;
}

export let WATER_Y = -1.35;
export const obstacles = [];

function addObst(x, z, r, h = 4) {
  obstacles.push({ x, z, r, h });
}

export function resolveObstacles(p, flyAlt = 0) {
  for (const o of obstacles) {
    if (flyAlt > o.h) continue;
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < o.r && d > 1e-4) {
      const k = o.r / d;
      p.x = o.x + dx * k;
      p.z = o.z + dz * k;
    }
  }
}

export function isWater(x, z) {
  return groundHeight(x, z) < WATER_Y + 0.45;
}

export function surfaceHeight(x, z) {
  return Math.max(groundHeight(x, z), WATER_Y);
}

function addEarthTrees(scene, thick) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
  const leafMat = new THREE.MeshLambertMaterial({ color: thick ? 0x1b5e20 : 0x2e7d32 });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x33691e });
  const m = MAP / 2 - 8;
  const want = thick ? 1400 : 180;
  const dummy = new THREE.Object3D();
  const pts = [];
  let guard = 0;
  while (pts.length < want && guard < 18000) {
    guard++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    if (Math.hypot(x, z + BASE_Z) < 28 || Math.hypot(x, z - BASE_Z) < 28) continue;
    const gy = groundHeight(x, z);
    if (gy < WATER_Y + 0.6 || earthMountAmt(x, z) > 0.48) continue;
    pts.push({
      x,
      z,
      gy,
      h: (thick ? 9 : 5) + Math.random() * (thick ? 10 : 7),
      cap: (thick ? 2.6 : 1.8) + Math.random() * (thick ? 2.4 : 1.6),
    });
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 1, 7), trunkMat, pts.length);
  const canopy = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), leafMat, pts.length);
  const canopy2 = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), leafMat2, pts.length);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    dummy.position.set(p.x, p.gy + p.h / 2, p.z);
    dummy.scale.set(0.7 + Math.random() * 0.6, p.h, 0.7 + Math.random() * 0.6);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, p.gy + p.h + p.cap * 0.25, p.z);
    dummy.scale.set(p.cap, p.cap * 0.85, p.cap);
    dummy.updateMatrix();
    canopy.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x + (Math.random() - 0.5) * 1.2, p.gy + p.h + p.cap * 0.05, p.z + (Math.random() - 0.5) * 1.2);
    dummy.scale.set(p.cap * 0.7, p.cap * 0.55, p.cap * 0.7);
    dummy.updateMatrix();
    canopy2.setMatrixAt(i, dummy.matrix);
    if (thick && i % 4 === 0) addObst(p.x, p.z, 0.9, p.h * 0.45);
  }
  trunk.instanceMatrix.needsUpdate = true;
  canopy.instanceMatrix.needsUpdate = true;
  canopy2.instanceMatrix.needsUpdate = true;
  scene.add(trunk, canopy, canopy2);
}

function addEarthGrass(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const mat2 = new THREE.MeshLambertMaterial({ color: 0x558b2f });
  const n = 7000;
  const dummy = new THREE.Object3D();
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.85, 5), mat, n);
  const bush = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 6, 5), mat2, 900);
  const m = MAP / 2 - 12;
  let i = 0;
  let g = 0;
  while (i < n && g < 40000) {
    g++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    if (Math.hypot(x, z + BASE_Z) < 18 || Math.hypot(x, z - BASE_Z) < 18) continue;
    const gy = groundHeight(x, z);
    if (gy < WATER_Y + 0.5 || earthMountAmt(x, z) > 0.45) continue;
    dummy.position.set(x, gy + 0.35, z);
    dummy.rotation.y = Math.random() * 6.28;
    dummy.scale.set(0.6 + Math.random() * 1.1, 0.7 + Math.random() * 1.4, 0.6 + Math.random() * 1.1);
    dummy.updateMatrix();
    tuft.setMatrixAt(i, dummy.matrix);
    i++;
  }
  tuft.count = i;
  tuft.instanceMatrix.needsUpdate = true;
  let b = 0;
  g = 0;
  while (b < 900 && g < 8000) {
    g++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    if (Math.hypot(x, z + BASE_Z) < 22) continue;
    const gy = groundHeight(x, z);
    if (gy < WATER_Y + 0.6 || earthMountAmt(x, z) > 0.45) continue;
    dummy.position.set(x, gy + 0.4, z);
    dummy.scale.set(0.8 + Math.random(), 0.55 + Math.random() * 0.7, 0.8 + Math.random());
    dummy.updateMatrix();
    bush.setMatrixAt(b, dummy.matrix);
    b++;
  }
  bush.count = b;
  bush.instanceMatrix.needsUpdate = true;
  scene.add(tuft, bush);
}

function addCellArchipelago(scene) {
  const bushM = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  const wall = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  const roof = new THREE.MeshLambertMaterial({ color: 0xc62828 });
  const dummy = new THREE.Object3D();
  const bushes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 6, 5), bushM, 500);
  const m = MAP / 2 - 20;
  let b = 0;
  let g = 0;
  while (b < 500 && g < 12000) {
    g++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    const gy = groundHeight(x, z);
    if (gy < WATER_Y + 10) continue;
    dummy.position.set(x, gy + 0.45, z);
    dummy.scale.set(0.9 + Math.random(), 0.5 + Math.random() * 0.6, 0.9 + Math.random());
    dummy.updateMatrix();
    bushes.setMatrixAt(b, dummy.matrix);
    b++;
  }
  bushes.count = b;
  bushes.instanceMatrix.needsUpdate = true;
  scene.add(bushes);
  for (let i = 0; i < 22; i++) {
    const x = (Math.random() * 2 - 1) * m * 0.7;
    const z = (Math.random() * 2 - 1) * m * 0.7;
    const gy = groundHeight(x, z);
    if (gy < WATER_Y + 11) continue;
    if (Math.hypot(x, z + BASE_Z) < 28 || Math.hypot(x, z - BASE_Z) < 28) continue;
    const s = 1.4 + Math.random() * 1.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4 * s, 1.8 * s, 2.2 * s), wall);
    body.position.set(x, gy + 0.9 * s, z);
    scene.add(shadowMesh(body));
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6 * s, 0.35 * s, 2.4 * s), roof);
    top.position.set(x, gy + 1.9 * s, z);
    scene.add(shadowMesh(top));
    addObst(x, z, 1.8 * s, 2.4 * s);
  }
  const rockM = new THREE.MeshLambertMaterial({ color: 0xa1887f });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockM, 220);
  let r = 0;
  g = 0;
  while (r < 220 && g < 14000) {
    g++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    const gy = groundHeight(x, z);
    if (gy < WATER_Y + 1.2 || gy > WATER_Y + 28) continue;
    const nearCliff = gy < WATER_Y + 11.5 || gy > WATER_Y + 16;
    if (!nearCliff && Math.random() > 0.25) continue;
    dummy.position.set(x, gy + 0.55, z);
    dummy.rotation.set(Math.random(), Math.random(), Math.random());
    const sc = 0.7 + Math.random() * 2.4;
    dummy.scale.set(sc, sc * (0.6 + Math.random() * 0.7), sc);
    dummy.updateMatrix();
    rocks.setMatrixAt(r, dummy.matrix);
    if (sc > 1.6) addObst(x, z, sc * 0.7, sc + 1);
    r++;
  }
  rocks.count = r;
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);
}

function addKameHouse(scene) {
  const x = -18;
  const z = -BASE_Z + 28;
  const y = groundHeight(x, z);
  const wall = new THREE.MeshLambertMaterial({ color: 0xfff8e1 });
  const roofM = new THREE.MeshLambertMaterial({ color: 0xe53935 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.4, 5.4), wall);
  body.position.set(x, y + 1.7, z);
  scene.add(shadowMesh(body));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.6, 4), roofM);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(x, y + 4.6, z);
  scene.add(shadowMesh(roof));
  addObst(x, z, 4.4, 5);
}

function addAjisa(scene) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0xc4a574 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1565c0 });
  const m = MAP / 2 - 8;
  let n = 0;
  let guard = 0;
  while (n < 240 && guard < 5000) {
    guard++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    if (Math.hypot(x, z + BASE_Z) < 22 || Math.hypot(x, z - BASE_Z) < 22) continue;
    if (Math.hypot(x - patriarchHill.x, z - patriarchHill.z) < 36) continue;
    if (Math.hypot(x + 70, z + BASE_Z - 110) < 18) continue;
    if (Math.hypot(x - 160, z - BASE_Z + 160) < 42) continue;
    const gy = groundHeight(x, z);
    if (gy < WATER_Y + 0.6) continue;
    const h = 7 + Math.random() * 9;
    const rad = 0.1 + Math.random() * 0.08;
    const cap = 1.6 + Math.random() * 1.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.15, h, 8), trunkMat);
    trunk.position.set(x, gy + h / 2, z);
    scene.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(cap, 12, 10), leafMat);
    canopy.position.set(x, gy + h + cap * 0.35, z);
    scene.add(canopy);
    windTrees.push({ m: canopy, p: Math.random() * 6.3, a: 0.04 + Math.random() * 0.05 });
    n++;
  }
}

function makeCloudTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 18; i++) {
    const x = 70 + Math.random() * 116;
    const y = 80 + Math.random() * 90;
    const rad = 28 + Math.random() * 48;
    const g = ctx.createRadialGradient(x, y, 2, x, y, rad);
    const a = 0.12 + Math.random() * 0.22;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.45, `rgba(236,242,252,${a * 0.55})`);
    g.addColorStop(1, "rgba(180,200,230,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addClouds(scene) {
  const tex = makeCloudTex();
  const matA = new THREE.SpriteMaterial({
    map: tex,
    color: 0xf4f7ff,
    transparent: true,
    depthWrite: false,
    fog: true,
    opacity: 0.88,
  });
  const matB = new THREE.SpriteMaterial({
    map: tex,
    color: 0xd5deee,
    transparent: true,
    depthWrite: false,
    fog: true,
    opacity: 0.7,
  });
  const m = MAP / 2 - 40;
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    const y = 42 + Math.random() * 38;
    const puffs = 7 + Math.floor(Math.random() * 6);
    for (let k = 0; k < puffs; k++) {
      const spr = new THREE.Sprite(k % 3 === 0 ? matB : matA);
      const sc = 14 + Math.random() * 22;
      spr.scale.set(sc * (1.3 + Math.random() * 0.5), sc * (0.55 + Math.random() * 0.25), 1);
      spr.position.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 16);
      g.add(spr);
    }
    g.position.set(x, y, z);
    g.userData.vx = 2.2 + Math.random() * 3.5;
    scene.add(g);
    cloudGroups.push(g);
  }
}

function mkBase(scene, z, color) {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(BASE_R, 40),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.45, roughness: 0.7 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  g.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(BASE_R, 0.22, 8, 40),
    new THREE.MeshLambertMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.35;
  g.add(ring);

  const postMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.65) });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6), postMat);
    post.position.set(Math.cos(a) * BASE_R, 1.1, Math.sin(a) * BASE_R);
    g.add(post);
  }
  g.position.set(0, surfaceHeight(0, z), z);
  scene.add(g);
}

function addPatriarch(scene) {
  const x = patriarchHill.x;
  const z = patriarchHill.z;
  const gy = groundHeight(x, z);
  const rock = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 10, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0xc4b59a })
  );
  rock.position.set(x, gy + 2, z);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  const house = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.6, 5, 10),
    new THREE.MeshLambertMaterial({ color: 0xd7ccc8 })
  );
  house.position.set(x, gy + 6.5, z);
  scene.add(shadowMesh(house));
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 3.2, 10),
    new THREE.MeshLambertMaterial({ color: 0x5d4037 })
  );
  roof.position.set(x, gy + 10.5, z);
  scene.add(shadowMesh(roof));
  const elder = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0x81c784 })
  );
  elder.position.set(x + 2.2, gy + 4.6, z + 1.5);
  scene.add(elder);
}

function namekHouse(scene, x, z, s = 1) {
  const y = groundHeight(x, z);
  if (y < WATER_Y + 0.4) return;
  const cream = new THREE.MeshLambertMaterial({ color: 0xf3e5ab });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x4e342e });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.9 * s, 2.15 * s, 2.6 * s, 10), cream);
  body.position.set(x, y + 1.3 * s, z);
  scene.add(shadowMesh(body));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7 * s, 2.2 * s, 10), roofM);
  roof.position.set(x, y + 3.15 * s, z);
  scene.add(shadowMesh(roof));
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.7 * s, 1.15 * s, 0.2 * s),
    new THREE.MeshLambertMaterial({ color: 0x3e2723 })
  );
  door.position.set(x, y + 0.7 * s, z + 2.05 * s);
  scene.add(door);
  addObst(x, z, 2.5 * s, 4.5 * s);
}

function namekVillage(scene, cx, cz, n = 7, r = 22) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (cz % 7) * 0.1;
    const d = r * (0.55 + (i % 3) * 0.18);
    namekHouse(scene, cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.85 + (i % 3) * 0.12);
  }
}

function addBulmaShip(scene) {
  const x = 22;
  const z = -BASE_Z;
  const y = groundHeight(x, z);
  const white = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  const orange = new THREE.MeshLambertMaterial({ color: 0xff6d00 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x1565c0 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(3.4, 9, 8, 12), white);
  hull.rotation.z = Math.PI / 2;
  hull.position.set(x, y + 3.6, z);
  scene.add(shadowMesh(hull));
  const band = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.35, 8, 20), orange);
  band.rotation.y = Math.PI / 2;
  band.position.set(x, y + 3.6, z);
  scene.add(band);
  const win = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), blue);
  win.position.set(x + 5.2, y + 4.1, z);
  win.rotation.y = Math.PI / 2;
  scene.add(win);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 2.4), orange);
  fin.position.set(x - 6.5, y + 5.2, z);
  scene.add(shadowMesh(fin));
  addObst(x, z, 8.2, 7);
}

function addFreezerShip(scene) {
  const x = 58;
  const z = BASE_Z;
  const y = groundHeight(x, z);
  const hullM = new THREE.MeshLambertMaterial({ color: 0xeceff1 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x6a1b9a });
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(32, 36, 5.5, 24), hullM);
  disk.position.set(x, y + 8, z);
  scene.add(shadowMesh(disk));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(34, 1.2, 8, 28), trim);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y + 10.5, z);
  scene.add(rim);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(14, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
  );
  dome.position.set(x, y + 10.5, z);
  scene.add(shadowMesh(dome));
  const gem = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xab47bc, emissive: 0x4a148c, emissiveIntensity: 0.4 })
  );
  gem.position.set(x, y + 22, z);
  scene.add(gem);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 8, 6), trim);
    leg.position.set(x + Math.cos(a) * 28, y + 4, z + Math.sin(a) * 28);
    scene.add(shadowMesh(leg));
  }
  addObst(x, z, 36, 14);
}

function addLandmarks(scene) {
  namekVillage(scene, patriarchHill.x, patriarchHill.z, 8, 24);
  namekVillage(scene, -380, 220, 6, 20);
  namekVillage(scene, 420, -280, 6, 18);
  namekVillage(scene, -90, 40, 5, 16);
  addBulmaShip(scene);
  addFreezerShip(scene);
}

function grassTex(earth) {
  const n = 512;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  ctx.fillStyle = earth ? "#4caf50" : "#1e88c8";
  ctx.fillRect(0, 0, n, n);
  const blade = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(((x % n) + n) % n, ((y % n) + n) % n, w, h);
  };
  for (let i = 0; i < 28000; i++) {
    const col = earth
      ? `rgb(${40 + Math.random() * 50},${110 + Math.random() * 80},${30 + Math.random() * 40})`
      : `rgb(${20 + Math.random() * 40},${90 + Math.random() * 70},${140 + Math.random() * 80})`;
    const x = Math.random() * n;
    const y = Math.random() * n;
    const w = 1 + Math.random() * 1.6;
    const h = 3 + Math.random() * 7;
    blade(x, y, w, h, col);
    if (x + w > n) blade(x - n, y, w, h, col);
    if (y + h > n) blade(x, y - n, w, h, col);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(48, 48);
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let sunLight;
let waterMesh;
let grassMap;
const windTrees = [];
const cloudGroups = [];
const shadowProps = [];

function shadowMesh(m) {
  m.castShadow = false;
  shadowProps.push(m);
  return m;
}

function waterTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0277bd";
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(180,230,255,${0.15 + Math.random() * 0.25})`;
    ctx.beginPath();
    const y = Math.random() * 64;
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(32, y + (Math.random() - 0.5) * 8, 64, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(48, 48);
  return t;
}

function addRocks(scene) {
  if (mapId === "earth") {
    const rockM = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    for (let k = 0; k < 28; k++) {
      const x = 180 + Math.random() * 780;
      const z = (Math.random() * 2 - 1) * (MAP / 2 - 80);
      if (earthMountAmt(x, z) < 0.35) continue;
      const gy = groundHeight(x, z);
      if (gy < WATER_Y + 1) continue;
      const s = 2.2 + Math.random() * 5.5;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockM);
      r.position.set(x, gy + s * 0.4, z);
      r.rotation.set(Math.random(), Math.random(), Math.random());
      scene.add(r);
      addObst(x, z, s * 0.8, s + 2);
    }
    return;
  }
  const mat = new THREE.MeshLambertMaterial({ color: 0x5d8aa8 });
  const spots = [
    [200, 180],
    [-250, -90],
    [90, -400],
    [-500, 80],
    [30, 520],
  ];
  for (const [cx, cz] of spots) {
    for (let i = 0; i < 7; i++) {
      const x = cx + (Math.random() - 0.5) * 28;
      const z = cz + (Math.random() - 0.5) * 28;
      const gy = groundHeight(x, z);
      if (gy < WATER_Y + 0.5) continue;
      const s = 1.4 + Math.random() * 2.8;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      r.position.set(x, gy + s * 0.45, z);
      r.rotation.set(Math.random(), Math.random(), Math.random());
      scene.add(r);
      addObst(x, z, s * 0.85, s + 1.5);
    }
  }
}

export function updateWorld(camPos, dt = 0) {
  const t = (updateWorld._t = (updateWorld._t || 0) + dt);
  if (waterMesh?.material.map) {
    waterMesh.material.map.offset.x += dt * 0.028;
    waterMesh.material.map.offset.y += dt * 0.016;
  }
  for (const w of windTrees) {
    const s = Math.sin(t * 1.15 + w.p);
    w.m.rotation.z = s * w.a;
    w.m.rotation.x = Math.cos(t * 0.9 + w.p) * w.a * 0.55;
  }
  const limC = MAP / 2 + 80;
  for (const g of cloudGroups) {
    g.position.x += (g.userData.vx || 3) * dt;
    if (g.position.x > limC) g.position.x = -limC;
  }
  const lim = 95 * 95;
  for (const m of shadowProps) {
    const dx = m.position.x - camPos.x;
    const dz = m.position.z - camPos.z;
    m.castShadow = dx * dx + dz * dz < lim;
  }
  if (!sunLight) return;
  sunLight.position.set(camPos.x + 50, 88, camPos.z + 28);
  sunLight.target.position.set(camPos.x, camPos.y, camPos.z);
  sunLight.target.updateMatrixWorld();
}

export function createWorld(scene, id = "namek") {
  mapId = id;
  WATER_Y = id === "cell" ? 4.6 : id === "earth" ? -4.2 : -1.35;
  obstacles.length = 0;
  shadowProps.length = 0;
  windTrees.length = 0;
  cloudGroups.length = 0;
  pickPatriarchHill();
  const earth = id === "earth";
  const cell = id === "cell";
  const EXT = MAP * 2.15;
  const segs = cell ? 280 : 200;
  const geo = new THREE.PlaneGeometry(EXT, EXT, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const cols = new Float32Array(pos.count * 3);
  const cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (cell) {
      if (y < WATER_Y + 0.4) cc.setHex(0x0277bd);
      else if (y < WATER_Y + 9.2) cc.setHex(0xc4a574);
      else {
        const n = Math.sin(pos.getX(i) * 0.035) * Math.cos(pos.getZ(i) * 0.03);
        cc.setHex(n > 0.28 ? 0x33691e : 0x9ccc65);
      }
    } else if (earth) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const amt = earthMountAmt(x, z);
      if (y < WATER_Y + 0.9) cc.setHex(0x81d4fa);
      else if (y < WATER_Y + 2.4) cc.setHex(0xc9b896);
      else {
        const g = new THREE.Color(y > 4 ? 0x43a047 : 0x66bb6a);
        const rock = new THREE.Color(y > 32 ? 0x5d4037 : 0x8d6e63);
        cc.copy(g).lerp(rock, Math.min(1, amt * 0.92 + Math.max(0, y - 18) * 0.025));
      }
    } else if (y < WATER_Y + 0.85) cc.setHex(0x4fc3f7);
    else if (y > 24) cc.setHex(0x0277bd);
    else cc.setHex(0x81d4fa);
    cols[i * 3] = cc.r;
    cols[i * 3 + 1] = cc.g;
    cols[i * 3 + 2] = cc.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  grassMap = grassTex(earth || cell);
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      map: grassMap,
      vertexColors: true,
    })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  waterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(EXT + 8, EXT + 8),
    new THREE.MeshStandardMaterial({
      map: waterTex(),
      color: cell ? 0x0277bd : 0x4fc3f7,
      roughness: 0.14,
      metalness: 0.28,
      transparent: true,
      opacity: cell ? 0.88 : 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = WATER_Y;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  mkBase(scene, -BASE_Z, 0xff9800);
  mkBase(scene, BASE_Z, earth || cell ? 0x5d4037 : 0x7e57c2);
  if (earth) {
    addKameHouse(scene);
    addEarthTrees(scene, true);
    addEarthGrass(scene);
  } else if (cell) {
    addCellArchipelago(scene);
  } else {
    addPatriarch(scene);
    addLandmarks(scene);
    addAjisa(scene);
  }
  addRocks(scene);
  addClouds(scene);

  scene.add(new THREE.HemisphereLight(earth || cell ? 0x90caf9 : 0xdce775, earth || cell ? 0x33691e : 0x0d47a1, 0.55));
  sunLight = new THREE.DirectionalLight(earth || cell ? 0xfff8e1 : 0xfff1d0, earth || cell ? 2.2 : 2.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 8;
  sunLight.shadow.camera.far = 200;
  sunLight.shadow.camera.left = -72;
  sunLight.shadow.camera.right = 72;
  sunLight.shadow.camera.top = 72;
  sunLight.shadow.camera.bottom = -72;
  sunLight.shadow.bias = -0.0009;
  scene.add(sunLight);
  scene.add(sunLight.target);
  scene.add(new THREE.AmbientLight(earth || cell ? 0x81c784 : 0x4a7aaa, earth || cell ? 0.4 : 0.32));
}

export function inOwnBase(pos, faccion) {
  const z = faccion === "z" ? -BASE_Z : BASE_Z;
  return Math.hypot(pos.x, pos.z - z) < BASE_R;
}

export function spawnPos(faccion, i, n) {
  const z = faccion === "z" ? -BASE_Z : BASE_Z;
  const ang = (i / n) * Math.PI * 2;
  const x = Math.cos(ang) * 4;
  const zz = z + Math.sin(ang) * 4;
  return new THREE.Vector3(x, surfaceHeight(x, zz), zz);
}

export function clampMap(p) {
  const m = MAP / 2 - 2;
  p.x = Math.max(-m, Math.min(m, p.x));
  p.z = Math.max(-m, Math.min(m, p.z));
}
