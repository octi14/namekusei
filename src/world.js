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

export function groundHeight(x, z) {
  const h =
    Math.sin(x * 0.012) * Math.cos(z * 0.01) * 9 +
    Math.sin(x * 0.028 + 1.7) * Math.sin(z * 0.022) * 5.5 +
    Math.cos((x + z) * 0.008) * 3.5 +
    hillBump(x, z);
  const flatten = (cx, cz) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d >= 30) return 1;
    if (d <= BASE_R + 1) return 0;
    return (d - BASE_R - 1) / (30 - BASE_R - 1);
  };
  const w = Math.min(flatten(0, -BASE_Z), flatten(0, BASE_Z));
  return h * w;
}

export const WATER_Y = -1.35;
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
  g.position.set(0, 0, z);
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

function grassTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1e88c8";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgb(${20 + Math.random() * 40},${90 + Math.random() * 70},${140 + Math.random() * 80})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 2 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(120, 120);
  t.anisotropy = 4;
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

export function createWorld(scene) {
  obstacles.length = 0;
  shadowProps.length = 0;
  windTrees.length = 0;
  cloudGroups.length = 0;
  pickPatriarchHill();
  const geo = new THREE.PlaneGeometry(MAP, MAP, 180, 180);
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
    if (y < WATER_Y + 0.85) cc.setHex(0x4fc3f7);
    else if (y > 24) cc.setHex(0x0277bd);
    else cc.setHex(0x81d4fa);
    cols[i * 3] = cc.r;
    cols[i * 3 + 1] = cc.g;
    cols[i * 3 + 2] = cc.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  grassMap = grassTex();
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
    new THREE.PlaneGeometry(MAP + 4, MAP + 4),
    new THREE.MeshStandardMaterial({
      map: waterTex(),
      color: 0x4fc3f7,
      roughness: 0.14,
      metalness: 0.28,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = WATER_Y;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  mkBase(scene, -BASE_Z, 0xff9800);
  mkBase(scene, BASE_Z, 0x7e57c2);
  addPatriarch(scene);
  addLandmarks(scene);
  addRocks(scene);
  addAjisa(scene);
  addClouds(scene);

  scene.add(new THREE.HemisphereLight(0xdce775, 0x0d47a1, 0.55));
  sunLight = new THREE.DirectionalLight(0xfff1d0, 2.5);
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
  scene.add(new THREE.AmbientLight(0x4a7aaa, 0.32));

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d47a1, roughness: 0.9 });
  const wall = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 48, d), wallMat);
    m.position.set(x, 14, z);
    scene.add(m);
  };
  const h = MAP / 2;
  wall(MAP + 2, 2, 0, -h);
  wall(MAP + 2, 2, 0, h);
  wall(2, MAP, -h, 0);
  wall(2, MAP, h, 0);
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
