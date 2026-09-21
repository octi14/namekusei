import * as THREE from "three";
import { MAP, BASE_Z, QUALITY, SHADOWS } from "./config.js";
import { addShipBases, bindBaseWorld, inShipBase, shipSpawnPos, shipWalkHeight, BASE_INNER_R, BASE_PAD_R } from "./bases.js";
import grassUrl from "./assets/terrain/grass.jpg?url";

const _texLoader = new THREE.TextureLoader();
let _grassFileTex = null;
let _grassNamekTex = null;

const BASE_R = BASE_INNER_R;
export const patriarchHill = { x: 140, z: 0, baseY: 2 };
const PAT_H = 50;
const PAT_R = 36;

export function pickDryLand(minBase = 220) {
  const m = MAP / 2 - 50;
  const tries = mapId === "city" ? 420 : 220;
  for (let i = 0; i < tries; i++) {
    let x = (Math.random() * 2 - 1) * m;
    let z = (Math.random() * 2 - 1) * (m * 0.82);
    if (mapId === "city" && i < 180 && !cityRoad(x, z) && !cityWalk(x, z)) continue;
    if (Math.hypot(x, z + BASE_Z) < minBase || Math.hypot(x, z - BASE_Z) < minBase) continue;
    if (insideObst(x, z, 2.8)) continue;
    if (mapId === "city" || mapId === "vegeta" || groundHeight(x, z) > WATER_Y + 3.5) return { x, z };
  }
  if (mapId === "city") {
    const p = { x: (Math.floor(Math.random() * 5) - 2) * CITY_AVE, z: (Math.random() * 2 - 1) * m * 0.65 };
    pushOutObst(p, 3.2);
    return p;
  }
  const mid = CELL_ISLANDS.filter((isl) => Math.abs(isl.z) < BASE_Z - 280);
  const isl = mid[Math.floor(Math.random() * mid.length)] || CELL_ISLANDS[2];
  const fb = {
    x: isl.x + (Math.random() - 0.5) * isl.rx * 0.45,
    z: isl.z + (Math.random() - 0.5) * isl.rz * 0.45,
  };
  pushOutObst(fb, 3.2);
  return fb;
}

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
    patriarchHill.baseY = namekSine(x, z);
    return;
  }
  patriarchHill.x = m * 0.62;
  patriarchHill.z = 40;
  patriarchHill.baseY = namekSine(patriarchHill.x, patriarchHill.z);
}

function namekSine(x, z) {
  return (
    Math.sin(x * 0.012) * Math.cos(z * 0.01) * 9 +
    Math.sin(x * 0.028 + 1.7) * Math.sin(z * 0.022) * 5.5 +
    Math.cos((x + z) * 0.008) * 3.5
  );
}

function patriarchDeck(x, z) {
  const d = Math.hypot(x - patriarchHill.x, z - patriarchHill.z);
  if (d >= PAT_R + 6) return null;
  const top = (patriarchHill.baseY || 0) + PAT_H;
  if (d <= PAT_R) return top;
  const u = 1 - (d - PAT_R) / 6;
  const t = u * u * (3 - 2 * u);
  return (patriarchHill.baseY || 0) + PAT_H * t;
}

/** Meseta seca bajo cada nave, sigue el BASE_Z actual (cualquier tamaño de mapa). */
function baseLandH(x, z) {
  const dry = WATER_Y + 4.2;
  let best = 0;
  for (const cz of [-BASE_Z, BASE_Z]) {
    const D = Math.hypot(x / 138, (z - cz) / 118);
    if (D >= 1) continue;
    const edge = D < 0.58 ? 1 : (1 - D) / 0.42;
    const t = edge * edge * (3 - 2 * edge);
    best = Math.max(best, dry * t + Math.sin(x * 0.04) * Math.cos((z - cz) * 0.035) * 0.7 * t);
  }
  return best;
}

export let mapId = "namek";

const EARTH_PLATEAUS = [
  { x: 390, z: -80, r: 310, w: 70, h: 18 },
  { x: -340, z: 160, r: 270, w: 62, h: 14 },
  { x: 210, z: 430, r: 230, w: 52, h: 12 },
  { x: -510, z: -360, r: 290, w: 68, h: 17 },
  { x: 580, z: 280, r: 210, w: 48, h: 16 },
  { x: -160, z: -580, r: 250, w: 58, h: 13 },
  { x: 320, z: 680, r: 190, w: 44, h: 11 },
  { x: -680, z: 40, r: 200, w: 50, h: 15 },
  { x: 720, z: -420, r: 180, w: 42, h: 14 },
  { x: -90, z: 300, r: 160, w: 40, h: 9 },
];

function earthPlateauH(x, z) {
  let h = 0;
  for (const P of EARTH_PLATEAUS) {
    const d = Math.hypot(x - P.x, z - P.z);
    if (d >= P.r) continue;
    const inner = P.r - P.w;
    let u = d <= inner ? 1 : 1 - (d - inner) / P.w;
    u = u * u * (3 - 2 * u);
    h = Math.max(h, (P.h + Math.sin(x * 0.018 + z * 0.014) * 1.4) * u);
  }
  return h;
}

function earthMountAmt(x, z) {
  const m1 = x * 0.00062 + z * 0.00034 + Math.sin(x * 0.0038) * 0.22 + Math.cos(z * 0.0044) * 0.16;
  const m2 = -x * 0.00048 + z * 0.0004 + Math.cos(x * 0.0028) * 0.2;
  const m3 = Math.sin(x * 0.002 + z * 0.0017) * 0.52 + 0.18;
  let t = Math.max(0, (m1 - 0.06) / 0.52);
  t = Math.max(t, (m2 - 0.1) / 0.5);
  t = Math.max(t, (m3 - 0.28) * 1.35);
  t = Math.max(0, Math.min(1, t));
  const plat = earthPlateauH(x, z);
  if (plat > 4) t = Math.max(t, Math.min(1, plat / 16));
  const near = Math.min(Math.hypot(x, z - BASE_Z), Math.hypot(x, z + BASE_Z));
  if (near < 240) t *= Math.max(0, (near - 100) / 140);
  return t * t * (3 - 2 * t);
}

function earthHeight(x, z) {
  const amt = earthMountAmt(x, z);
  const plains =
    Math.sin(x * 0.0055) * Math.cos(z * 0.0048) * 1.6 +
    Math.sin((x + z) * 0.003) * 0.7 +
    0.9;
  const mounts =
    Math.abs(Math.sin(x * 0.014) * Math.cos(z * 0.012)) * 28 +
    Math.sin(x * 0.032 + 1.4) * Math.sin(z * 0.028) * 12 +
    Math.sin(x * 0.08 + z * 0.045) * 6 +
    Math.cos(z * 0.065) * 5 +
    8;
  let h = plains * (1 - amt) + mounts * amt;
  h = Math.max(h, plains + earthPlateauH(x, z));
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
  { x: 0, z: 0, rx: 130, rz: 95, h: 16, hills: 1, peak: 14 },
  { x: 180, z: -160, rx: 95, rz: 70, h: 14, hills: 1 },
  { x: -200, z: 160, rx: 100, rz: 65, h: 14, hills: 1 },
  { x: 320, z: 180, rx: 88, rz: 60, h: 13, peak: 12 },
  { x: -340, z: -200, rx: 90, rz: 58, h: 13 },
  { x: 90, z: -380, rx: 110, rz: 55, h: 14, hills: 1 },
  { x: -110, z: 380, rx: 105, rz: 52, h: 14 },
  { x: 220, z: 40, rx: 72, rz: 80, h: 13 },
  { x: -90, z: 80, rx: 75, rz: 50, h: 13, peak: 11 },
  { x: 400, z: -250, rx: 80, rz: 48, h: 13 },
  { x: -420, z: 250, rx: 78, rz: 50, h: 13 },
  { x: 150, z: 480, rx: 70, rz: 45, h: 12 },
  { x: -160, z: -480, rx: 72, rz: 44, h: 12 },
  { x: 500, z: 80, rx: 65, rz: 55, h: 12, hills: 1 },
  { x: -500, z: 80, rx: 62, rz: 52, h: 12 },
  { x: 40, z: 600, rx: 85, rz: 42, h: 13 },
  { x: -50, z: -600, rx: 82, rz: 40, h: 13 },
  { x: 260, z: -300, rx: 58, rz: 70, h: 12 },
  { x: -260, z: 300, rx: 60, rz: 68, h: 12 },
];

function cellIslandH(x, z, isl) {
  // islas más grandes → menos agua entre ellas
  const sx = isl.rx * 1.45;
  const sz = isl.rz * 1.45;
  const dx = (x - isl.x) / sx;
  const dz = (z - isl.z) / sz;
  const wobble = 1 + Math.sin(x * 0.016 + z * 0.012) * 0.1 + Math.cos((x - z) * 0.01) * 0.06;
  const D = Math.hypot(dx, dz) / wobble;
  if (D >= 1) return 0;
  // meseta más ancha; costa más suave
  const edge = D < 0.72 ? 1 : (1 - D) / 0.28;
  const t = edge * edge * (3 - 2 * edge);
  let h = isl.h * 1.08 * t;
  const inland = Math.max(0, 0.86 - D);
  if (isl.peak) {
    const px = (x - isl.x) / (sx * 0.45) - 0.25;
    const pz = (z - isl.z) / (sz * 0.45) + 0.2;
    const pd = Math.hypot(px, pz);
    if (pd < 1) h += isl.peak * (1 - pd) * (1 - pd) * t;
  }
  if (isl.hills) {
    h += Math.max(0, Math.sin((x - isl.x) * 0.024) * Math.cos((z - isl.z) * 0.02)) * 11 * inland;
    h += Math.max(0, Math.sin((x - isl.x) * 0.04 + 1.7)) * 7 * inland;
  }
  h += Math.abs(Math.sin(x * 0.018 + z * 0.015)) * 4.2 * inland;
  return h;
}

function cellHeight(x, z) {
  let h = -14;
  h = Math.max(h, cellIslandH(x, z, { x: 0, z: -BASE_Z, rx: 168, rz: 132, h: 17, hills: 1 }));
  h = Math.max(h, cellIslandH(x, z, { x: 0, z: BASE_Z, rx: 162, rz: 126, h: 17, hills: 1 }));
  for (const isl of CELL_ISLANDS) h = Math.max(h, cellIslandH(x, z, isl));
  return h;
}

function waterYFor(id) {
  if (id === "cell") return 3.15;
  if (id === "earth") return -4.2;
  if (id === "city" || id === "vegeta") return -80;
  return -1.35;
}

const CITY_STEP = 72;
const CITY_ST = 5;
const CITY_AVE = 288;
const CITY_AVE_W = 8;
const CITY_WALK = 1.15;

function cityLane(v) {
  const a = ((v % CITY_AVE) + CITY_AVE) % CITY_AVE;
  if (a < CITY_AVE_W || a > CITY_AVE - CITY_AVE_W) return 2;
  const p = ((v % CITY_STEP) + CITY_STEP) % CITY_STEP;
  if (p < CITY_ST || p > CITY_STEP - CITY_ST) return 1;
  return 0;
}

function cityRoad(x, z) {
  return Math.max(cityLane(x), cityLane(z));
}

function cityWalk(x, z) {
  if (cityRoad(x, z)) return false;
  const band = (v, w, step) => {
    const p = ((v % step) + step) % step;
    return (p >= w && p < w + CITY_WALK) || (p <= step - w && p > step - w - CITY_WALK);
  };
  return band(x, CITY_AVE_W, CITY_AVE) || band(z, CITY_AVE_W, CITY_AVE) || band(x, CITY_ST, CITY_STEP) || band(z, CITY_ST, CITY_STEP);
}

function cityHeight(x, z) {
  const road = cityRoad(x, z);
  if (road) return 2.08 - (road > 1 ? 0.1 : 0.05);
  if (cityWalk(x, z)) return 2.42;
  return 2.36;
}

let vegetaClusters = [];
let vegetaDunes = [];
let vegetaMesas = [];
let vegetaRidges = [];
let vegetaLoners = [];

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return { d: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t };
}

function smooth01(u) {
  return u * u * (3 - 2 * u);
}

function layoutVegeta() {
  vegetaClusters = [];
  vegetaDunes = [];
  vegetaMesas = [];
  vegetaRidges = [];
  vegetaLoners = [];
  if (mapId !== "vegeta") return;
  const m = MAP / 2 - 130;
  const nC = MAP < 1500 ? 2 : MAP < 2800 ? 3 : MAP < 4000 ? 4 : 5;
  const seeds = [
    [0.22, -0.08, 11],
    [-0.32, 0.26, 13],
    [0.12, 0.42, 8],
    [-0.24, -0.46, 10],
    [0.46, 0.28, 7],
  ];
  for (let i = 0; i < nC; i++) {
    const [u, v, n] = seeds[i];
    const x = u * m;
    const z = v * m;
    if (nearBase(x, z, 95)) continue;
    vegetaClusters.push({ x, z, n, spread: 24 + n * 2.1 });
  }
  const blocked = (x, z, r) =>
    nearBase(x, z, r + 55) || vegetaClusters.some((c) => Math.hypot(x - c.x, z - c.z) < r * 0.35 + c.spread);
  const duneSeeds = [
    [0.58, 0.08, 260, 38],
    [-0.52, -0.30, 340, 52],
    [0.14, -0.68, 220, 34],
    [-0.70, 0.34, 310, 46],
    [0.72, -0.48, 180, 28],
    [-0.08, 0.62, 200, 32],
    [0.40, 0.58, 170, 26],
    [0.28, 0.12, 150, 22],
    [-0.38, 0.02, 190, 30],
    [0.62, 0.32, 145, 24],
    [-0.62, -0.58, 210, 36],
    [0.05, -0.38, 165, 25],
  ];
  for (const [u, v, r, h] of duneSeeds) {
    const x = u * m;
    const z = v * m;
    if (blocked(x, z, r)) continue;
    vegetaDunes.push({ x, z, r: r + MAP * 0.02, h });
  }
  const mesaSeeds = [
    [0.36, -0.22, 195, 24],
    [-0.16, 0.48, 240, 30],
    [0.68, 0.18, 155, 20],
    [-0.44, -0.62, 175, 22],
  ];
  for (const [u, v, r, h] of mesaSeeds) {
    const x = u * m;
    const z = v * m;
    if (blocked(x, z, r)) continue;
    vegetaMesas.push({ x, z, r: r + MAP * 0.015, h });
  }
  const ridgeSeeds = [
    [-0.78, 0.02, -0.22, 0.52, 110, 20, 44],
    [0.18, -0.78, 0.74, -0.22, 95, 16, 40],
    [-0.58, -0.48, 0.12, -0.28, 85, 28, 18],
    [0.48, 0.72, -0.08, 0.78, 80, 14, 32],
  ];
  for (const [u0, v0, u1, v1, w, h0, h1] of ridgeSeeds) {
    const ax = u0 * m;
    const az = v0 * m;
    const bx = u1 * m;
    const bz = v1 * m;
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    if (nearBase(ax, az, w + 70) || nearBase(bx, bz, w + 70) || nearBase(mx, mz, w + 70)) continue;
    vegetaRidges.push({ ax, az, bx, bz, w: w + MAP * 0.01, h0, h1 });
  }
  const loneSeeds = [
    [0.64, -0.05],
    [-0.58, 0.50],
    [0.04, -0.74],
    [-0.72, -0.10],
    [0.44, 0.66],
    [-0.06, 0.72],
    [0.74, -0.36],
  ];
  for (const [u, v] of loneSeeds) {
    const x = u * m;
    const z = v * m;
    if (nearBase(x, z, 50)) continue;
    if (vegetaClusters.some((c) => Math.hypot(x - c.x, z - c.z) < 150)) continue;
    vegetaLoners.push({ x, z });
  }
}

function vegetaOnLandform(x, z) {
  if (vegetaDunes.some((d) => Math.hypot(x - d.x, z - d.z) < d.r * 1.1)) return true;
  if (vegetaMesas.some((d) => Math.hypot(x - d.x, z - d.z) < d.r * 1.08)) return true;
  return vegetaRidges.some((g) => distToSeg(x, z, g.ax, g.az, g.bx, g.bz).d < g.w * 1.05);
}

function vegetaHeight(x, z) {
  let h =
    2.55 +
    Math.sin(x * 0.0031) * Math.cos(z * 0.0027) * 7.2 +
    Math.sin((x + z) * 0.002) * 5.4 +
    Math.sin(x * 0.007) * Math.cos(z * 0.006) * 1.4 +
    Math.sin((x + z) * 0.014) * 0.4;
  for (const d of vegetaDunes) {
    const u = 1 - Math.hypot(x - d.x, z - d.z) / d.r;
    if (u <= 0) continue;
    h += d.h * smooth01(u);
  }
  for (const d of vegetaMesas) {
    const wob = 1 + Math.sin(x * 0.018 + z * 0.015) * 0.07;
    const u = 1 - Math.hypot(x - d.x, z - d.z) / (d.r * wob);
    if (u <= 0) continue;
    const rim = 0.36;
    const s = u >= rim ? 1 : smooth01(u / rim);
    h += d.h * s;
  }
  for (const g of vegetaRidges) {
    const { d, t } = distToSeg(x, z, g.ax, g.az, g.bx, g.bz);
    if (d >= g.w) continue;
    const across = smooth01(1 - d / g.w);
    const end = t < 0.16 ? smooth01(t / 0.16) : t > 0.84 ? smooth01((1 - t) / 0.16) : 1;
    const bump = 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.35 + 0.4));
    h += (g.h0 + (g.h1 - g.h0) * t) * bump * across * end;
  }
  for (const c of vegetaClusters) {
    const u = 1 - Math.hypot(x - c.x, z - c.z) / (c.spread * 1.55);
    if (u <= 0) continue;
    const s = smooth01(u);
    h = h * (1 - s * 0.88) + 2.82 * s * 0.88;
  }
  return h;
}

/** Fondo marino mucho más profundo (sin tocar orillas/plataformas secas). */
function deepenSeabed(h) {
  const shore = WATER_Y + 0.45;
  if (h >= shore - 0.02) return h;
  const sub = shore - h;
  // Antes ~1–8 m; ahora ~14–40 m según lo hundido que ya estaba
  const depth = Math.min(40, 14 + sub * 4.2 + sub * sub * 0.35);
  return Math.min(h, shore - depth);
}

export function groundHeight(x, z) {
  return deepenSeabed(applyBasePads(rawGroundHeight(x, z), x, z));
}

function rawGroundHeight(x, z) {
  if (mapId === "cell") return cellHeight(x, z);
  if (mapId === "city") return cityHeight(x, z);
  if (mapId === "vegeta") return vegetaHeight(x, z);
  let h = namekSine(x, z);
  if (mapId === "earth") h = earthHeight(x, z);
  else if (mapId === "namek") {
    const deck = patriarchDeck(x, z);
    if (deck != null) h = Math.max(h, deck);
  }
  const land = baseLandH(x, z);
  if (land > 0) h = Math.max(h, land);
  return h;
}

/** Alturas de plataforma bajo cada base (relleno plano). */
const _padH = { z: 0, f: 0 };

export function refreshBasePads() {
  const minDry = WATER_Y + 2.8;
  _padH.z = Math.max(rawGroundHeight(0, -BASE_Z), minDry);
  _padH.f = Math.max(rawGroundHeight(0, BASE_Z), minDry);
}

function applyBasePads(raw, x, z) {
  let bestW = 1;
  let padH = raw;
  for (const [fac, cz] of [
    ["z", -BASE_Z],
    ["f", BASE_Z],
  ]) {
    const d = Math.hypot(x, z - cz);
    if (d >= BASE_PAD_R) continue;
    const ph = _padH[fac];
    const flatR = BASE_INNER_R + 12;
    let w = 1;
    if (d <= flatR) w = 0;
    else w = (d - flatR) / (BASE_PAD_R - flatR);
    if (w < bestW) {
      bestW = w;
      padH = ph;
    }
  }
  if (bestW >= 1) return raw;
  return padH * (1 - bestW) + raw * bestW;
}

export let WATER_Y = -1.35;
export const obstacles = [];
const OBST_CELL = 80;
const obstGrid = new Map();
let obstStamp = 0;

function obstKey(ix, iz) {
  return ix * 1048576 + iz;
}

function addObst(x, z, r, h = 4, y = 0, roof = false) {
  const o = { x, z, r, h, y, roof, _t: 0 };
  const i0 = Math.floor((x - r) / OBST_CELL);
  const i1 = Math.floor((x + r) / OBST_CELL);
  const j0 = Math.floor((z - r) / OBST_CELL);
  const j1 = Math.floor((z + r) / OBST_CELL);
  for (let ix = i0; ix <= i1; ix++) {
    for (let iz = j0; iz <= j1; iz++) {
      const k = obstKey(ix, iz);
      let a = obstGrid.get(k);
      if (!a) {
        a = [];
        obstGrid.set(k, a);
      }
      a.push(o);
    }
  }
}

export function resolveObstacles(p, flyAlt = 0) {
  obstStamp++;
  const ix = Math.floor(p.x / OBST_CELL);
  const iz = Math.floor(p.z / OBST_CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const a = obstGrid.get(obstKey(ix + dx, iz + dz));
      if (!a) continue;
      for (const o of a) {
        if (o._t === obstStamp) continue;
        o._t = obstStamp;
        if (p.y > (o.y || 0) + o.h - 0.35) continue;
        const ox = p.x - o.x;
        const oz = p.z - o.z;
        const d = Math.hypot(ox, oz);
        if (d < o.r && d > 1e-4) {
          const k = o.r / d;
          p.x = o.x + ox * k;
          p.z = o.z + oz * k;
        }
      }
    }
  }
}

function hitObst(x, z, pad, minH = 2.4, skipRoof = false) {
  const ix = Math.floor(x / OBST_CELL);
  const iz = Math.floor(z / OBST_CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const a = obstGrid.get(obstKey(ix + dx, iz + dz));
      if (!a) continue;
      for (const o of a) {
        if (o.h < minH) continue;
        if (skipRoof && o.roof) continue;
        const need = o.r + pad;
        const ox = x - o.x;
        const oz = z - o.z;
        if (ox * ox + oz * oz < need * need) return o;
      }
    }
  }
  return null;
}

export function insideObst(x, z, pad = 2.2) {
  return !!hitObst(x, z, pad, 2.4, true);
}

export function pushOutObst(p, pad = 2.4) {
  for (let n = 0; n < 5; n++) {
    const o = hitObst(p.x, p.z, pad, 2.4, true);
    if (!o) return p;
    const ox = p.x - o.x;
    const oz = p.z - o.z;
    const d = Math.hypot(ox, oz);
    const need = o.r + pad;
    if (d < 1e-4) {
      p.x = o.x + need;
      p.z = o.z;
    } else {
      const k = need / d;
      p.x = o.x + ox * k;
      p.z = o.z + oz * k;
    }
  }
  return p;
}

export function isWater(x, z) {
  return groundHeight(x, z) < WATER_Y + 0.45;
}

function roofAt(x, z) {
  let best = 0;
  const ix = Math.floor(x / OBST_CELL);
  const iz = Math.floor(z / OBST_CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const a = obstGrid.get(obstKey(ix + dx, iz + dz));
      if (!a) continue;
      for (const o of a) {
        if (!o.roof) continue;
        const ox = x - o.x;
        const oz = z - o.z;
        if (ox * ox + oz * oz >= o.r * o.r) continue;
        const t = (o.y || 0) + o.h;
        if (t > best) best = t;
      }
    }
  }
  return best;
}

export function surfaceHeight(x, z) {
  const land = Math.max(groundHeight(x, z), WATER_Y);
  const ship = shipWalkHeight(x, z);
  const roof = roofAt(x, z);
  let h = land;
  if (ship > -1e8) h = Math.max(h, ship);
  if (roof > h) h = roof;
  return h;
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
    if (Math.hypot(x, z + BASE_Z) < BASE_PAD_R + 24 || Math.hypot(x, z - BASE_Z) < BASE_PAD_R + 24) continue;
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
    if (Math.hypot(x, z + BASE_Z) < BASE_PAD_R + 24 || Math.hypot(x, z - BASE_Z) < BASE_PAD_R + 24) continue;
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
    if (Math.hypot(x, z + BASE_Z) < BASE_PAD_R + 24 || Math.hypot(x, z - BASE_Z) < BASE_PAD_R + 24) continue;
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
    if (Math.hypot(x, z + BASE_Z) < BASE_PAD_R + 24 || Math.hypot(x, z - BASE_Z) < BASE_PAD_R + 24) continue;
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
  const z = -BASE_Z + 82;
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
    if (Math.hypot(x, z + BASE_Z) < BASE_PAD_R + 18 || Math.hypot(x, z - BASE_Z) < BASE_PAD_R + 18) continue;
    if (Math.hypot(x - patriarchHill.x, z - patriarchHill.z) < 42) continue;
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
  const pink = mapId === "vegeta";
  const city = mapId === "city";
  const tex = makeCloudTex();
  const matA = new THREE.SpriteMaterial({
    map: tex,
    color: pink ? 0xf8bbd0 : city ? 0xcfd8dc : 0xf4f7ff,
    transparent: true,
    depthWrite: false,
    fog: true,
    opacity: 0.88,
  });
  const matB = new THREE.SpriteMaterial({
    map: tex,
    color: pink ? 0xfce4ec : city ? 0x90a4ae : 0xd5deee,
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
  const gy = patriarchHill.baseY || groundHeight(x, z);
  const H = PAT_H;
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * H;
    const r = 16 + t * 20 + Math.sin(t * 9) * 1.4 + Math.sin(t * 17) * 0.55;
    pts.push(new THREE.Vector2(Math.max(14, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const a = Math.atan2(pz, px);
    const n = Math.sin(a * 5 + py * 0.18) * 0.7 + Math.sin(a * 8 - py * 0.1) * 0.35;
    const L = Math.hypot(px, pz) || 1;
    pos.setX(i, px + (px / L) * n);
    pos.setZ(i, pz + (pz / L) * n);
  }
  geo.computeVertexNormals();
  const rockM = new THREE.MeshLambertMaterial({ color: 0xbcaaa4 });
  const rock = new THREE.Mesh(geo, rockM);
  rock.position.set(x, gy, z);
  scene.add(shadowMesh(rock));
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(PAT_R - 0.6, PAT_R - 0.2, 0.55, 24), new THREE.MeshLambertMaterial({ color: 0x1565c0 }));
  deck.position.set(x, gy + H + 0.12, z);
  scene.add(deck);
  const topY = gy + H + 0.35;
  const cream = new THREE.MeshLambertMaterial({ color: 0xf3efe6 });
  const winM = new THREE.MeshLambertMaterial({ color: 0x1565c0 });
  const palace = new THREE.Group();
  const s = 0.62;
  const base = new THREE.Mesh(new THREE.SphereGeometry(14.5 * s, 18, 16), cream);
  base.position.y = 14.5 * s * 0.55;
  base.scale.set(1.18, 0.7, 1.1);
  palace.add(base);
  const mid = new THREE.Mesh(new THREE.SphereGeometry(9.2 * s, 16, 14), cream);
  mid.position.y = 16.5 * s;
  mid.scale.set(1, 0.78, 1);
  palace.add(mid);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(5.4 * s, 14, 12), cream);
  cap.position.y = 23.2 * s;
  palace.add(cap);
  for (const [sx, sy, sz, sr] of [
    [8.5, 6.5, 4, 3.4],
    [-7.5, 7, -3.5, 3.1],
    [2, 9, 10, 2.8],
    [-3, 5.5, -9, 2.6],
  ]) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(sr * s, 12, 10), cream);
    bump.position.set(sx * s, sy * s, sz * s);
    palace.add(bump);
  }
  for (const [hx, hy, hz, rot] of [
    [4.2, 26.5, 0, 0.55],
    [-4.2, 26.5, 0, -0.55],
  ]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(1.15 * s, 9.5 * s, 8), cream);
    horn.position.set(hx * s, hy * s, hz * s);
    horn.rotation.z = rot;
    palace.add(horn);
  }
  for (const [wx, wy, wz, wr] of [
    [0, 18.2, 8.2, 2.6],
    [7.2, 8.5, 6.5, 1.7],
    [-6.8, 8.2, 7, 1.55],
    [5.5, 7.5, -8, 1.4],
    [-4.5, 10, -7.5, 1.35],
    [0, 6.2, 12.5, 1.9],
  ]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(wr * s, 10, 8), winM);
    w.position.set(wx * s, wy * s, wz * s);
    palace.add(w);
  }
  palace.position.set(x, topY, z);
  palace.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      shadowProps.push(o);
    }
  });
  scene.add(palace);
  addObst(x, z, 20, PAT_H - 1.5, gy);
  addObst(x, z, 11.5, 16, topY);
}

function namekHouse(scene, x, z, s = 1) {
  const y = groundHeight(x, z);
  if (y < WATER_Y + 0.4) return;
  const cream = new THREE.MeshLambertMaterial({ color: 0xeceff1 });
  const winM = new THREE.MeshLambertMaterial({ color: 0x1565c0 });
  const doorM = new THREE.MeshLambertMaterial({ color: 0x1a237e });
  const r = 2.55 * s;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), cream);
  dome.scale.set(1.18, 0.72, 1.08);
  dome.position.set(x, y + r * 0.48, z);
  scene.add(shadowMesh(dome));
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.28 * s, 1.7 * s, 8), cream);
  horn.position.set(x, y + r * 1.15, z);
  scene.add(shadowMesh(horn));
  for (const [ox, oz, wr] of [
    [-1.15 * s, 1.35 * s, 0.42 * s],
    [1.15 * s, 1.35 * s, 0.42 * s],
    [-1.55 * s, 0.15 * s, 0.32 * s],
    [1.55 * s, 0.15 * s, 0.32 * s],
  ]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(wr, 10, 8), winM);
    w.position.set(x + ox, y + r * 0.55, z + oz);
    scene.add(w);
  }
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * s, 0.42 * s, 1.35 * s, 10), doorM);
  door.position.set(x, y + 0.72 * s, z + r * 0.82);
  scene.add(door);
  addObst(x, z, 2.9 * s, 3.4 * s, y);
}

function namekVillage(scene, cx, cz, n = 7, r = 22) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (cz % 7) * 0.1;
    const d = r * (0.55 + (i % 3) * 0.18);
    namekHouse(scene, cx + Math.cos(a) * d, cz + Math.sin(a) * d, 0.85 + (i % 3) * 0.12);
  }
}

function addBulmaShip(scene) {
  const x = 72;
  const z = -BASE_Z + 70;
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
  const x = 140;
  const z = BASE_Z - 95;
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
  const villages = [
    [-380, 220, 10, 28],
    [420, -280, 9, 26],
    [-90, 40, 8, 22],
    [260, 340, 8, 24],
    [-520, -160, 9, 26],
    [140, -420, 8, 22],
    [-240, -480, 7, 20],
    [560, 80, 8, 24],
    [-60, 520, 7, 20],
    [310, 80, 6, 18],
  ];
  for (const [cx, cz, n, r] of villages) namekVillage(scene, cx, cz, n, r);
  const m = MAP / 2 - 80;
  let n = 0;
  let g = 0;
  while (n < 70 && g < 4000) {
    g++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    if (Math.hypot(x, z + BASE_Z) < 80 || Math.hypot(x, z - BASE_Z) < 80) continue;
    if (Math.hypot(x - patriarchHill.x, z - patriarchHill.z) < PAT_R + 18) continue;
    if (groundHeight(x, z) < WATER_Y + 1.2) continue;
    namekHouse(scene, x, z, 0.75 + Math.random() * 0.45);
    n++;
  }
}

function rockTex() {
  const n = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(n, n);
  const d = img.data;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const n1 = Math.sin(x * 0.035 + y * 0.021) * 0.5 + Math.sin(x * 0.09 - y * 0.07) * 0.28;
      const n2 = Math.sin((x + y) * 0.017) * Math.cos(x * 0.011 - y * 0.013);
      const n3 = ((x * 13 + y * 37) & 255) / 255;
      const v = n1 * 0.45 + n2 * 0.3 + (n3 - 0.5) * 0.35;
      const i = (y * n + x) * 4;
      d[i] = Math.max(0, Math.min(255, 110 + v * 42 + (n3 - 0.5) * 18));
      d[i + 1] = Math.max(0, Math.min(255, 72 + v * 48 + n2 * 16));
      d[i + 2] = Math.max(0, Math.min(255, 78 + v * 28 + n1 * 22));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 12000; i++) {
    ctx.fillStyle = `rgba(${140 + Math.random() * 40},${80 + Math.random() * 30},${70 + Math.random() * 25},0.32)`;
    ctx.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(42, 42);
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grassFileTex() {
  if (_grassFileTex) return _grassFileTex;
  const t = _texLoader.load(grassUrl);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(140, 140);
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  _grassFileTex = t;
  return t;
}

/** Misma textura con hue namekiano (teal/azul), sin el verde Tierra. */
function grassNamekTex() {
  if (_grassNamekTex) return _grassNamekTex;
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(140, 140);
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  _grassNamekTex = t;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = r * 0.25 + g * 0.5 + b * 0.25;
      // Remap: matar verde, empujar cyan/azul namek
      d[i] = Math.max(0, Math.min(255, lum * 0.42 + b * 0.22 + 28));
      d[i + 1] = Math.max(0, Math.min(255, lum * 0.55 + g * 0.12 + 72));
      d[i + 2] = Math.max(0, Math.min(255, lum * 0.48 + b * 0.35 + g * 0.18 + 110));
    }
    ctx.putImageData(id, 0, 0);
    t.image = c;
    t.needsUpdate = true;
  };
  img.src = grassUrl;
  return t;
}

/** Pasto real en mapas verdes; Namek teñido; procedural solo en vegeta. */
function grassTex(kind) {
  if (kind === "vegeta") return rockTex();
  if (kind === "namek") return grassNamekTex();
  return grassFileTex();
}

let sunLight;
let waterMesh;
let grassMap;
const windTrees = [];
const cloudGroups = [];
const shadowProps = [];
const cityChunks = [];
let cityFar = 620;
let cityNear = 260;
let cityShared = null;
let cityScene = null;
let cityShadowFloor = null;

function shadowMesh(m) {
  m.castShadow = false;
  shadowProps.push(m);
  return m;
}

function waterTex(green = false) {
  const n = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  ctx.fillStyle = green ? "#145a32" : "#015079";
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 420; i++) {
    ctx.strokeStyle = green
      ? `rgba(180,255,160,${0.08 + Math.random() * 0.22})`
      : `rgba(180,230,255,${0.08 + Math.random() * 0.22})`;
    ctx.lineWidth = 0.8 + Math.random() * 2.4;
    ctx.beginPath();
    const y = Math.random() * n;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(n * 0.3, y + (Math.random() - 0.5) * 28, n * 0.7, y + (Math.random() - 0.5) * 28, n, y);
    ctx.stroke();
  }
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = green
      ? `rgba(200,255,180,${0.04 + Math.random() * 0.1})`
      : `rgba(220,245,255,${0.04 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * n, Math.random() * n, 2 + Math.random() * 6, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(28, 28);
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nearBase(x, z, extra = 0) {
  return Math.hypot(x, z + BASE_Z) < BASE_PAD_R + extra || Math.hypot(x, z - BASE_Z) < BASE_PAD_R + extra;
}

function cityFacadeTex(shop = false) {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  g.fillStyle = shop ? "#eceff1" : "#dfe6ee";
  g.fillRect(0, 0, n, n);
  const cols = shop ? 4 : 5;
  const rows = shop ? 6 : 9;
  const cw = (n - 20) / cols;
  const rh = (n - 18) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = ((x * 5 + y * 11) % 7) > 1;
      if (shop && y === rows - 1) {
        g.fillStyle = "#1565c0";
        g.fillRect(12 + x * cw, n - rh - 6, cw - 10, rh - 4);
        g.fillStyle = "#90caf9";
        g.fillRect(16 + x * cw, n - rh + 4, cw - 18, rh * 0.45);
        continue;
      }
      g.fillStyle = lit ? "#0d47a1" : "#1a237e";
      g.fillRect(12 + x * cw, 10 + y * rh, cw - 10, rh - 8);
      if (lit && ((x + y) & 3) === 0) {
        g.fillStyle = "#fff59d";
        g.fillRect(14 + x * cw, 12 + y * rh, cw - 14, rh - 12);
      }
    }
  }
  g.fillStyle = "rgba(80,90,100,0.35)";
  g.fillRect(0, 0, n, 6);
  g.fillRect(0, n - 6, n, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 1;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1, 1);
  return t;
}

function cityBoxUV(rx, ry) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
  }
  return g;
}

function bakeCityChunk(ch) {
  if (!ch || ch.root || !cityShared || !cityScene) return;
  const s = cityShared;
  const dummy = s.dummy;
  const cc = s.cc;
  const bake = (list, geo, mat, place, parent, colored) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    for (let i = 0; i < list.length; i++) {
      place(list[i], dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colored) {
        cc.setHex(colored(list[i], i));
        mesh.setColorAt(i, cc);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
  };
  const root = new THREE.Group();
  const detail = new THREE.Group();
  for (let b = 0; b < 3; b++) {
    for (const shopPass of [false, true]) {
      const list = ch.bodies[b].filter((u) => !!u.shop === shopPass);
      bake(
        list,
        s.geos[b],
        s.mats[shopPass ? 1 : 0],
        (u, d) => {
          d.position.set(u.x, u.gy + u.h / 2, u.z);
          d.scale.set(u.w, u.h, u.d);
          d.rotation.set(0, u.yaw, 0);
        },
        root,
        (u) => u.col
      );
    }
  }
  bake(ch.roofs, s.roofGeo, s.roofM, (r, d) => {
    d.position.set(r.x, r.y, r.z);
    d.scale.set(r.w, 1, r.d);
    d.rotation.set(0, r.yaw, 0);
  }, root);
  bake(ch.cones, s.coneGeo, s.roofM, (r, d) => {
    d.position.set(r.x, r.y, r.z);
    d.scale.set(r.w, 1, r.d);
    d.rotation.set(0, r.yaw + Math.PI / 4, 0);
  }, root);
  const stripM = [s.asph, s.asphA, s.walkM];
  for (let mi = 0; mi < 3; mi++) {
    bake(
      ch.strips.filter((p) => p.mat === mi),
      s.stripGeo,
      stripM[mi],
      (p, d) => {
        d.position.set(p.x, p.y, p.z);
        d.scale.set(p.sx, 1, p.sz);
        d.rotation.set(0, 0, 0);
      },
      root
    );
  }
  bake(ch.awnings, s.awGeo, s.awMat, (a, d) => {
    d.position.set(a.x, a.y, a.z);
    d.scale.set(a.w, 1, 1);
    d.rotation.set(0, a.yaw, 0);
  }, detail, (a) => a.col);
  bake(ch.acs, s.acGeo, s.acM, (a, d) => {
    d.position.set(a.x, a.y, a.z);
    d.scale.set(1, 1, 1);
    d.rotation.set(0, a.yaw, 0);
  }, detail);
  bake(ch.parked, s.carGeo, s.carMat, (p, d) => {
    d.position.set(p.x, 2.28, p.z);
    d.scale.set(1, 1, 1);
    d.rotation.set(0, p.yaw, 0);
  }, detail, (_, i) => s.carC[i % s.carC.length]);
  bake(ch.lamps, s.poleGeo, s.lampM, (p, d) => {
    d.position.set(p.x, 4.7, p.z);
    d.scale.set(1, 1, 1);
    d.rotation.set(0, 0, 0);
  }, detail);
  bake(ch.lamps, s.lampGeo, s.lampH, (p, d) => {
    d.position.set(p.x, 7.15, p.z);
    d.scale.set(1, 1, 1);
    d.rotation.set(0, 0, 0);
  }, detail);
  const placeDash = (p, d) => {
    d.position.set(p.x, 2.23, p.z);
    d.scale.set(p.sx, 1, 1);
    d.rotation.set(0, p.rot, 0);
  };
  bake(ch.dashes.filter((d) => !d.yel), s.dashGeo, s.lineM, placeDash, detail);
  bake(ch.dashes.filter((d) => d.yel), s.dashGeo, s.yelM, placeDash, detail);
  root.add(detail);
  cityScene.add(root);
  ch.root = root;
  ch.detail = detail;
}

function addCityDistrict(scene) {
  const wallC = [0xeceff1, 0xcfd8dc, 0xb0bec5, 0x90caf9, 0xfff8e1, 0xb3e5fc, 0xffccbc, 0xd1c4e9];
  const shopC = [0xef5350, 0xffa726, 0x42a5f5, 0x66bb6a, 0xab47bc, 0xffee58];
  const carC = [0xc62828, 0x1565c0, 0x212121, 0xfafafa, 0xffeb3b, 0x37474f, 0x00838f, 0x6a1b9a];
  const dummy = new THREE.Object3D();
  const cc = new THREE.Color();
  const m = MAP / 2 - 36;
  const lots = QUALITY === 0 ? 4 : 5;
  const rows = QUALITY === 0 ? 1 : 2;
  const fillCenter = QUALITY > 0;
  const extras = QUALITY > 0;
  const lampEvery = QUALITY === 0 ? 2 : 1;
  const carMod = QUALITY === 0 ? 4 : 2;
  const dashGap = QUALITY === 0 ? 14 : 9;
  const asph = new THREE.MeshLambertMaterial({ color: 0x212121 });
  const asphA = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const walkM = new THREE.MeshLambertMaterial({ color: 0x8d8d8d });
  const lineM = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const yelM = new THREE.MeshLambertMaterial({ color: 0xffd54f });
  const lampM = new THREE.MeshLambertMaterial({ color: 0x37474f });
  const lampH = new THREE.MeshLambertMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 0.35 });
  const facade = cityFacadeTex(false);
  const facadeShop = cityFacadeTex(true);
  const mats = [
    new THREE.MeshLambertMaterial({ map: facade, color: 0xffffff }),
    new THREE.MeshLambertMaterial({ map: facadeShop, color: 0xffffff }),
  ];
  const roofM = new THREE.MeshLambertMaterial({ color: 0x455a64 });
  const acM = new THREE.MeshLambertMaterial({ color: 0x90a4ae });
  cityChunks.length = 0;
  const CHUNK = CITY_AVE;
  const cmap = new Map();
  const chunkAt = (x, z) => {
    const ix = Math.floor(x / CHUNK);
    const iz = Math.floor(z / CHUNK);
    const k = ix + ":" + iz;
    let c = cmap.get(k);
    if (!c) {
      c = {
        cx: (ix + 0.5) * CHUNK,
        cz: (iz + 0.5) * CHUNK,
        bodies: [[], [], []],
        roofs: [],
        cones: [],
        awnings: [],
        acs: [],
        parked: [],
        lamps: [],
        dashes: [],
        strips: [],
      };
      cmap.set(k, c);
    }
    return c;
  };

  for (let k = -Math.floor(m / CITY_STEP); k <= Math.floor(m / CITY_STEP); k++) {
    const v = k * CITY_STEP;
    if (Math.abs(v) > m) continue;
    const ave = cityLane(v) > 1;
    const w = ave ? CITY_AVE_W * 2 : CITY_ST * 2;
    const y = 2.16;
    const mat = ave ? 1 : 0;
    for (let t = -m; t < m; t += CHUNK) {
      const len = Math.min(CHUNK, m - t);
      const mid = t + len * 0.5;
      chunkAt(v, mid).strips.push({ x: v, z: mid, sx: w, sz: len, y, mat });
      chunkAt(mid, v).strips.push({ x: mid, z: v, sx: len, sz: w, y, mat });
      const wo = w * 0.5 + CITY_WALK * 0.5;
      chunkAt(v - wo, mid).strips.push({ x: v - wo, z: mid, sx: CITY_WALK, sz: len, y: 2.38, mat: 2 });
      chunkAt(v + wo, mid).strips.push({ x: v + wo, z: mid, sx: CITY_WALK, sz: len, y: 2.38, mat: 2 });
      chunkAt(mid, v - wo).strips.push({ x: mid, z: v - wo, sx: len, sz: CITY_WALK, y: 2.38, mat: 2 });
      chunkAt(mid, v + wo).strips.push({ x: mid, z: v + wo, sx: len, sz: CITY_WALK, y: 2.38, mat: 2 });
    }
    const sx = ave ? 0.45 : 0.28;
    for (let t = -m; t < m; t += dashGap) {
      if (cityLane(t) && Math.abs(t - v) > w) continue;
      chunkAt(v, t).dashes.push({ x: v, z: t, rot: 0, sx, yel: ave });
      chunkAt(t, v).dashes.push({ x: t, z: v, rot: Math.PI / 2, sx, yel: ave });
    }
  }

  const inset = CITY_ST + CITY_WALK + 0.45;
  const gy = 2.36;
  const addBld = (x, z, yaw, kind, ix, iz, s, i, scale = 1) => {
    if (nearBase(x, z, 10) || cityRoad(x, z)) return;
    const shop = kind >= 7;
    const house = kind >= 4 && kind < 7;
    const w = (shop ? 5.6 : house ? 5.2 : 5.4 + (i % 3) * 0.7) * scale;
    const d = (shop ? 5.8 : house ? 5.4 : 6.2 + ((s + i) % 3) * 0.5) * scale;
    const h = (shop ? 4.2 : house ? 3.4 + (i % 3) * 0.9 : 9 + ((ix + iz + s + i * 3) % 26) * 1.15) * scale;
    const mi = shop ? (ix + iz + i) % shopC.length : (ix + iz + s + i) % wallC.length;
    const col = shop ? shopC[mi] : wallC[mi];
    const ch = chunkAt(x, z);
    ch.bodies[h < 7 ? 0 : h < 18 ? 1 : 2].push({ x, z, gy, w, d, h, yaw, shop, col });
    if (house) ch.cones.push({ x, z, y: gy + h + 0.95, w: w * 0.62, d: d * 0.62, yaw });
    else ch.roofs.push({ x, z, y: gy + h + 0.18, w: w + 0.28, d: d + 0.28, yaw });
    if (shop && extras) {
      ch.awnings.push({
        x: x + Math.sin(yaw) * (d * 0.52),
        z: z + Math.cos(yaw) * (d * 0.52),
        y: gy + 3.0,
        w: w * 0.92,
        yaw,
        col,
      });
    } else if (!house && extras && (i + s) % 2 === 0) ch.acs.push({ x: x + 0.9, z: z - 0.6, y: gy + h + 0.5, yaw });
    addObst(x, z, Math.max(w, d) * 0.5, h + (house ? 0.22 : 0.36), gy, true);
  };
  for (let ix = -Math.floor(m / CITY_STEP); ix < Math.floor(m / CITY_STEP); ix++) {
    for (let iz = -Math.floor(m / CITY_STEP); iz < Math.floor(m / CITY_STEP); iz++) {
      const x0 = ix * CITY_STEP;
      const z0 = iz * CITY_STEP;
      const cx = x0 + CITY_STEP * 0.5;
      const cz = z0 + CITY_STEP * 0.5;
      if (Math.abs(cx) > m || Math.abs(cz) > m || nearBase(cx, cz, 16)) continue;
      const park = ((ix * 5 + iz * 9) & 31) === 0;
      const span = CITY_STEP - inset * 2;
      const lotW = span / lots;
      const sides = [
        { yaw: 0, x: (i) => x0 + inset + lotW * (i + 0.5), z: (row) => z0 + CITY_STEP - inset - 3.2 - row * 6.4 },
        { yaw: Math.PI, x: (i) => x0 + inset + lotW * (i + 0.5), z: (row) => z0 + inset + 3.2 + row * 6.4 },
        { yaw: Math.PI / 2, x: (row) => x0 + CITY_STEP - inset - 3.2 - row * 6.4, z: (i) => z0 + inset + lotW * (i + 0.5) },
        { yaw: -Math.PI / 2, x: (row) => x0 + inset + 3.2 + row * 6.4, z: (i) => z0 + inset + lotW * (i + 0.5) },
      ];
      if (!park) {
        for (let s = 0; s < 4; s++) {
          const side = sides[s];
          const nHere = lots;
          for (let row = 0; row < rows; row++) {
            for (let i = 0; i < nHere; i++) {
              if (row === 1 && (i === 0 || i === nHere - 1)) continue;
              const x = s < 2 ? side.x(i) : side.x(row);
              const z = s < 2 ? side.z(row) : side.z(i);
              addBld(x, z, side.yaw, (ix * 7 + iz * 3 + s * 5 + i + row * 2) % 9, ix, iz, s, i, row ? 0.88 : 1);
            }
          }
        }
        if (fillCenter) {
          for (let gx = -1; gx <= 1; gx++) {
            for (let gz = -1; gz <= 1; gz++) {
              if (!gx && !gz) continue;
              addBld(cx + gx * 6.2, cz + gz * 6.2, (gx + gz + 2) * 0.78, (ix + iz + gx + gz + 6) % 9, ix, iz, 4, gx + 2, 0.82);
            }
          }
        }
      }
      const stW = CITY_ST * 0.62;
      for (const [px, pz, yaw] of [
        [cx, z0, 0],
        [cx, z0 + CITY_STEP, 0],
        [x0, cz, Math.PI / 2],
        [x0 + CITY_STEP, cz, Math.PI / 2],
      ]) {
        if (nearBase(px, pz, 16)) continue;
        if (((ix + iz) % carMod) === 0) {
          chunkAt(px, pz).parked.push({
            x: px + (yaw ? 0 : (ix % 2 ? stW : -stW)),
            z: pz + (yaw ? (iz % 2 ? stW : -stW) : 0),
            yaw,
          });
        }
        if (((ix * 3 + iz) % lampEvery) === 0) {
          chunkAt(px, pz).lamps.push({
            x: px + (yaw ? CITY_ST + CITY_WALK * 0.45 : 0),
            z: pz + (yaw ? 0 : CITY_ST + CITY_WALK * 0.45),
          });
        }
      }
    }
  }

  cityFar = QUALITY === 0 ? 420 : QUALITY === 1 ? 620 : 820;
  cityNear = QUALITY === 0 ? 160 : QUALITY === 1 ? 260 : 360;
  cityScene = scene;
  cityShared = {
    dummy,
    cc,
    geos: [cityBoxUV(3, 3), cityBoxUV(4, 6), cityBoxUV(5, 11)],
    mats,
    roofGeo: new THREE.BoxGeometry(1, 0.36, 1),
    coneGeo: new THREE.ConeGeometry(1, 1.85, 4),
    awGeo: new THREE.BoxGeometry(1, 0.16, 1.1),
    acGeo: new THREE.BoxGeometry(1.4, 0.7, 1.1),
    carGeo: new THREE.BoxGeometry(2.6, 0.72, 1.2),
    poleGeo: new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6),
    lampGeo: new THREE.SphereGeometry(0.28, 8, 6),
    dashGeo: new THREE.BoxGeometry(1, 0.04, 2.8),
    stripGeo: new THREE.BoxGeometry(1, 0.1, 1),
    roofM,
    acM,
    awMat: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    carMat: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    lampM,
    lampH,
    lineM,
    yelM,
    asph,
    asphA,
    walkM,
    carC,
  };
  const r2 = cityFar * cityFar;
  for (const ch of cmap.values()) {
    cityChunks.push(ch);
    const dx0 = ch.cx;
    const dz0 = ch.cz;
    if (
      dx0 * dx0 + dz0 * dz0 < r2 ||
      dx0 * dx0 + (dz0 - BASE_Z) * (dz0 - BASE_Z) < r2 ||
      dx0 * dx0 + (dz0 + BASE_Z) * (dz0 + BASE_Z) < r2
    ) {
      bakeCityChunk(ch);
    }
  }
}

function vegetaMats() {
  return {
    white: new THREE.MeshLambertMaterial({ color: 0xe8eaf6 }),
    cream: new THREE.MeshLambertMaterial({ color: 0xd1c4e9 }),
    blue: new THREE.MeshLambertMaterial({ color: 0x42a5f5 }),
    rib: new THREE.MeshLambertMaterial({ color: 0x5c6bc0 }),
    win: new THREE.MeshLambertMaterial({ color: 0x0d47a1 }),
    rivet: new THREE.MeshLambertMaterial({ color: 0x3949ab }),
    rock: new THREE.MeshLambertMaterial({ color: 0x6d4c41 }),
  };
}

function vegetaTower(scene, x, z, kind, s, mats) {
  const y = groundHeight(x, z);
  const g = new THREE.Group();
  const h = (kind === 1 ? 34 : kind === 2 ? 22 : 28) * s;
  if (kind === 0) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(4.1 * s, h * 0.52, 6, 14), mats.white);
    body.position.y = h * 0.4;
    g.add(shadowMesh(body));
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(3.95 * s, 4.2 * s, h * 0.36, 12, 5, true), mats.blue);
    rib.position.set(1.15 * s, h * 0.26, 0);
    g.add(rib);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4 * s, 9.5 * s, 10), mats.white);
    cap.position.y = h * 0.78;
    g.add(shadowMesh(cap));
    for (let i = -1; i <= 1; i++) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.52 * s, 8, 6), mats.win);
      w.position.set(3.55 * s, h * 0.54, i * 1.28 * s);
      g.add(w);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rv = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 5, 4), mats.rivet);
      rv.position.set(Math.cos(a) * 4.15 * s, h * 0.62, Math.sin(a) * 4.15 * s);
      g.add(rv);
    }
    addObst(x, z, 4.2 * s, h * 0.72, y, true);
  } else if (kind === 1) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5.4 * s, 6.2 * s, h * 0.62, 16), mats.white);
    shaft.position.y = h * 0.31;
    g.add(shadowMesh(shaft));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(7.4 * s, 7.4 * s, 0.7 * s, 18), mats.cream);
    brim.position.y = h * 0.62;
    g.add(brim);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rv = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 5, 4), mats.rivet);
      rv.position.set(Math.cos(a) * 7.2 * s, h * 0.66, Math.sin(a) * 7.2 * s);
      g.add(rv);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.white);
    dome.position.y = h * 0.64;
    g.add(shadowMesh(dome));
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.45 * s, 8.5 * s, 6), mats.white);
    spire.position.y = h * 0.88;
    g.add(spire);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * s, 1.7 * s, 4.2 * s, 10, 1, true), mats.win);
    door.position.set(0, 2.2 * s, 5.5 * s);
    g.add(door);
    addObst(x, z, 7.2 * s, h * 0.62 + 0.4 * s, y, true);
  } else {
    const fat = new THREE.Mesh(new THREE.CylinderGeometry(5.8 * s, 6.4 * s, h, 14), mats.white);
    fat.position.y = h * 0.5;
    g.add(shadowMesh(fat));
    const ear = new THREE.Mesh(new THREE.SphereGeometry(2.6 * s, 10, 8), mats.rib);
    ear.position.set(5.6 * s, h * 0.58, 0);
    g.add(shadowMesh(ear));
    for (let i = -1; i <= 1; i++) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.62 * s, 8, 6), mats.win);
      w.position.set(0, h * 0.78, i * 1.5 * s);
      g.add(w);
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(5.2 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.cream);
    cap.position.y = h * 0.92;
    g.add(shadowMesh(cap));
    addObst(x, z, 5.6 * s, h * 0.92 + 0.4 * s, y, true);
  }
  g.position.set(x, y, z);
  g.rotation.y = (x * 0.13 + z * 0.07) % (Math.PI * 2);
  scene.add(g);
}

function addVegetaInstallations(scene) {
  const mats = vegetaMats();
  const pack = (cx, cz, n, big) => {
    let i = 0;
    let ring = 0;
    while (i < n) {
      const k = ring === 0 ? 1 : 6 * ring;
      const rad = ring * 20;
      for (let j = 0; j < k && i < n; j++, i++) {
        const a = ring ? (j / k) * Math.PI * 2 + ring * 0.18 : 0;
        const x = cx + Math.cos(a) * rad;
        const z = cz + Math.sin(a) * rad;
        if (nearBase(x, z, 28)) continue;
        const s = i === 0 ? 1.28 + big : 0.62 + (i % 5) * 0.11;
        vegetaTower(scene, x, z, i % 3, s, mats);
      }
      ring++;
    }
  };
  for (const c of vegetaClusters) pack(c.x, c.z, c.n, 0.22);
  for (let i = 0; i < vegetaLoners.length; i++) {
    const p = vegetaLoners[i];
    vegetaTower(scene, p.x, p.z, i % 3, 0.95 + (i % 3) * 0.18, mats);
  }
  const dummy = new THREE.Object3D();
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mats.rock, 220);
  const m = MAP / 2 - 90;
  let r = 0;
  let g = 0;
  while (r < 220 && g < 7000) {
    g++;
    const x = (Math.random() * 2 - 1) * m;
    const z = (Math.random() * 2 - 1) * m;
    if (nearBase(x, z, 20)) continue;
    if (vegetaClusters.some((c) => Math.hypot(x - c.x, z - c.z) < c.spread * 1.25)) continue;
    const onDune = vegetaOnLandform(x, z);
    if (!onDune && Math.random() > 0.28) continue;
    const gy = groundHeight(x, z);
    dummy.position.set(x, gy + 0.5, z);
    dummy.rotation.set(Math.random(), Math.random(), Math.random());
    const sc = 0.8 + Math.random() * (onDune ? 3.2 : 2.2);
    dummy.scale.set(sc, sc * 0.65, sc);
    dummy.updateMatrix();
    rocks.setMatrixAt(r, dummy.matrix);
    if (sc > 1.8) addObst(x, z, sc * 0.7, sc + 1);
    r++;
  }
  rocks.count = r;
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);
}

function addRocks(scene) {
  if (mapId === "city" || mapId === "vegeta") return;
  if (mapId === "earth") {
    const rockM = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.88, metalness: 0.04 });
    for (let k = 0; k < 52; k++) {
      const x = (Math.random() * 2 - 1) * (MAP / 2 - 90);
      const z = (Math.random() * 2 - 1) * (MAP / 2 - 80);
      if (earthMountAmt(x, z) < 0.28 && earthPlateauH(x, z) < 6) continue;
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
  const mat = new THREE.MeshStandardMaterial({ color: 0x5d8aa8, roughness: 0.82, metalness: 0.08 });
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

export function updateWorld(camPos, dt = 0, camFwd = null) {
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
  if (cityShadowFloor) {
    cityShadowFloor.position.x = camPos.x;
    cityShadowFloor.position.z = camPos.z;
  }
  if (cityChunks.length && ((updateWorld._cc = (updateWorld._cc || 0) + 1) & 1) === 0) {
    const far2 = cityFar * cityFar;
    const near2 = cityNear * cityNear;
    let fx = 0;
    let fz = 0;
    let lookDown = true;
    if (camFwd) {
      fx = camFwd.x;
      fz = camFwd.z;
      const fl = Math.hypot(fx, fz);
      lookDown = fl < 0.22;
      if (!lookDown) {
        fx /= fl;
        fz /= fl;
      }
    }
    let baked = 0;
    for (const ch of cityChunks) {
      const dx = ch.cx - camPos.x;
      const dz = ch.cz - camPos.z;
      const d2 = dx * dx + dz * dz;
      const vis = d2 < far2 && (lookDown || d2 < 48400 || dx * fx + dz * fz > -180);
      if (vis && !ch.root) {
        if (baked >= 2) continue;
        bakeCityChunk(ch);
        baked++;
      }
      if (ch.root && ch.root.visible !== vis) ch.root.visible = vis;
      if (ch.detail) {
        const dvis = vis && d2 < near2;
        if (ch.detail.visible !== dvis) ch.detail.visible = dvis;
      }
    }
  }
  if (!sunLight) return;
  sunLight.position.set(camPos.x + 50, 88, camPos.z + 28);
  sunLight.target.position.set(camPos.x, camPos.y, camPos.z);
  sunLight.target.updateMatrixWorld();
}

export function createWorld(scene, id = "namek") {
  mapId = id;
  WATER_Y = waterYFor(id);
  obstacles.length = 0;
  obstGrid.clear();
  shadowProps.length = 0;
  cityChunks.length = 0;
  cityShared = null;
  cityScene = null;
  cityShadowFloor = null;
  windTrees.length = 0;
  cloudGroups.length = 0;
  pickPatriarchHill();
  refreshBasePads();
  layoutVegeta();
  const earth = id === "earth";
  const cell = id === "cell";
  const city = id === "city";
  const vegeta = id === "vegeta";
  const EXT = city ? MAP : MAP * 2.15;
  const segs = cell ? 280 : city ? 1 : 200;
  const geo = new THREE.PlaneGeometry(EXT, EXT, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  if (city) {
    for (let i = 0; i < pos.count; i++) pos.setY(i, 2.12);
  } else {
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  grassMap = grassTex(city ? "earth" : vegeta ? "vegeta" : earth || cell ? "earth" : "namek");
  if (city) {
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: grassMap, color: 0x8bc34a }));
    ground.receiveShadow = false;
    scene.add(ground);
    cityShadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.ShadowMaterial({ opacity: 0.32 }));
    cityShadowFloor.rotation.x = -Math.PI / 2;
    cityShadowFloor.position.y = 2.2;
    cityShadowFloor.receiveShadow = true;
    scene.add(cityShadowFloor);
  } else {
    const cols = new Float32Array(pos.count * 3);
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (vegeta) {
        cc.setHex(y > 8 ? 0x5d4037 : y > 5 ? 0x8d6e63 : 0xa1887f);
      } else if (cell) {
        if (y < WATER_Y + 0.4) cc.setHex(0x0277bd);
        else if (y < WATER_Y + 9.2) cc.setHex(0xc4a574);
        else {
          const n = Math.sin(x * 0.035) * Math.cos(z * 0.03);
          cc.setHex(n > 0.28 ? 0x33691e : 0x9ccc65);
        }
      } else if (earth) {
        const amt = earthMountAmt(x, z);
        if (y < WATER_Y + 0.9) cc.setHex(0x81d4fa);
        else if (y < WATER_Y + 2.4) cc.setHex(0xc9b896);
        else {
          const g = new THREE.Color(y > 4 ? 0x43a047 : 0x66bb6a);
          const rock = new THREE.Color(y > 32 ? 0x5d4037 : 0x8d6e63);
          cc.copy(g).lerp(rock, Math.min(1, amt * 0.92 + Math.max(0, y - 18) * 0.025));
        }
      } else if (y < WATER_Y + 0.85) cc.setHex(0x80cbc4);
      else if (y > 24) cc.setHex(0x1e88e5);
      else cc.setHex(0x90caf9);
      cols[i * 3] = cc.r;
      cols[i * 3 + 1] = cc.g;
      cols[i * 3 + 2] = cc.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: grassMap,
        color: earth || cell || vegeta ? 0xffffff : 0xb3e5fc,
        vertexColors: true,
        roughness: vegeta ? 0.96 : 0.92,
        metalness: 0.02,
      })
    );
    ground.receiveShadow = true;
    scene.add(ground);
  }

  waterMesh = null;
  if (!city && !vegeta) {
    waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(EXT + 8, EXT + 8),
      new THREE.MeshStandardMaterial({
        map: waterTex(!earth && !cell),
        color: cell ? 0x01579b : earth ? 0x0277bd : 0x1b5e20,
        roughness: 0.12,
        metalness: 0.28,
        transparent: true,
        opacity: cell ? 0.97 : 0.95,
        depthWrite: true,
        side: THREE.DoubleSide,
      })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = WATER_Y;
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);
  }

  bindBaseWorld({ groundHeight, addObst, shadowMesh });
  addShipBases(scene);
  if (city) addCityDistrict(scene);
  else if (vegeta) addVegetaInstallations(scene);
  else if (earth) {
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

  const hemi = vegeta ? 0xf8bbd0 : city ? 0xb0bec5 : earth || cell ? 0x90caf9 : 0xdce775;
  const hemiG = vegeta ? 0x6a1b9a : city ? 0x455a64 : earth || cell ? 0x33691e : 0x0d47a1;
  scene.add(new THREE.HemisphereLight(hemi, hemiG, vegeta ? 0.85 : 0.72));
  sunLight = new THREE.DirectionalLight(
    vegeta ? 0xffcdd2 : city ? 0xeceff1 : earth || cell ? 0xfff8e1 : 0xfff1d0,
    vegeta ? 2.2 : earth || cell ? 2.55 : 2.85
  );
  sunLight.castShadow = SHADOWS;
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
  scene.add(new THREE.AmbientLight(vegeta ? 0xf48fb1 : city ? 0x90a4ae : earth || cell ? 0x81c784 : 0x4a7aaa, vegeta ? 0.55 : earth || cell ? 0.48 : 0.4));
}

export function inOwnBase(pos, faccion) {
  return inShipBase(pos, faccion);
}

export function spawnPos(faccion, i, n) {
  return shipSpawnPos(faccion, i, n);
}

export function clampMap(p) {
  const m = MAP / 2 - 2;
  p.x = Math.max(-m, Math.min(m, p.x));
  p.z = Math.max(-m, Math.min(m, p.z));
}

export function buildMapMaquette(id = "namek") {
  const prevId = mapId;
  const prevW = WATER_Y;
  const hill = { x: patriarchHill.x, z: patriarchHill.z, baseY: patriarchHill.baseY };
  mapId = id;
  WATER_Y = waterYFor(id);
  pickPatriarchHill();
  refreshBasePads();
  layoutVegeta();
  const cell = id === "cell";
  const earth = id === "earth";
  const city = id === "city";
  const vegeta = id === "vegeta";
  const segs = 64;
  const geo = new THREE.PlaneGeometry(MAP, MAP, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    let hex;
    if (city) {
      hex = cityRoad(x, z) > 1 ? 0x1a1a1a : cityRoad(x, z) ? 0x242424 : cityWalk(x, z) ? 0x9e9e9e : 0x7cb342;
    } else if (vegeta) {
      hex = y > 22 ? 0x4e342e : y > 12 ? 0x6d4c41 : y > 6 ? 0x8d6e63 : 0xa1887f;
    } else if (cell) {
      hex = y < WATER_Y + 0.4 ? 0x0277bd : y < WATER_Y + 9.2 ? 0xc4a574 : Math.sin(x * 0.035) * Math.cos(z * 0.03) > 0.28 ? 0x33691e : 0x9ccc65;
    } else if (earth) {
      const amt = earthMountAmt(x, z);
      if (y < WATER_Y + 0.9) hex = 0x81d4fa;
      else if (y < WATER_Y + 2.4) hex = 0xc9b896;
      else hex = amt * 0.92 + Math.max(0, y - 18) * 0.025 > 0.55 ? (y > 32 ? 0x5d4037 : 0x8d6e63) : y > 4 ? 0x43a047 : 0x66bb6a;
    } else {
      hex = y < WATER_Y + 0.85 ? 0x80cbc4 : y > 24 ? 0x1e88e5 : 0x90caf9;
    }
    cc.setHex(hex);
    cols[i * 3] = cc.r;
    cols[i * 3 + 1] = cc.g;
    cols[i * 3 + 2] = cc.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  if (!city && !vegeta) {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP * 1.04, MAP * 1.04),
      new THREE.MeshLambertMaterial({
        color: cell ? 0x01579b : earth ? 0x0277bd : 0x1b5e20,
        transparent: true,
        opacity: 0.82,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y + 0.2;
    root.add(water);
  }
  if (city) {
    const asph = new THREE.MeshLambertMaterial({ color: 0x212121 });
    const wall = new THREE.MeshLambertMaterial({ color: 0xcfd8dc });
    const shop = new THREE.MeshLambertMaterial({ color: 0xef5350 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const lim = MAP / 2 - 80;
    for (let v = -lim; v <= lim; v += CITY_STEP) {
      const w = cityLane(v) > 1 ? CITY_AVE_W * 2 : CITY_ST * 2;
      const hx = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, MAP), asph);
      hx.position.set(v, 2.7, 0);
      root.add(hx);
      const hz = new THREE.Mesh(new THREE.BoxGeometry(MAP, 1.2, w), asph);
      hz.position.set(0, 2.7, v);
      root.add(hz);
    }
    for (let ix = -6; ix < 6; ix++) {
      for (let iz = -6; iz < 6; iz++) {
        const x0 = ix * CITY_STEP;
        const z0 = iz * CITY_STEP;
        const inset = CITY_ST + 5;
        const h = 14 + ((ix * 5 + iz * 3 + 40) % 26);
        const col = ((ix + iz) % 5) === 0 ? shop : wall;
        for (const [x, z] of [
          [x0 + CITY_STEP * 0.5, z0 + CITY_STEP - inset],
          [x0 + CITY_STEP * 0.5, z0 + inset],
          [x0 + CITY_STEP - inset, z0 + CITY_STEP * 0.5],
          [x0 + inset, z0 + CITY_STEP * 0.5],
        ]) {
          const b = new THREE.Mesh(box, col);
          b.position.set(x, 2.4 + h / 2, z);
          b.scale.set(10, h, 7);
          root.add(b);
        }
      }
    }
  } else if (vegeta) {
    const white = new THREE.MeshLambertMaterial({ color: 0xe8eaf6 });
    const blue = new THREE.MeshLambertMaterial({ color: 0x42a5f5 });
    const peg = (x, z, s) => {
      const y = groundHeight(x, z);
      const h = 36 * s;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(8 * s, 10 * s, h, 10), white);
      shaft.position.set(x, y + h / 2, z);
      root.add(shaft);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(8 * s, 14 * s, 8), white);
      cap.position.set(x, y + h + 6 * s, z);
      root.add(cap);
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(8.2 * s, 8.6 * s, h * 0.32, 10), blue);
      rib.position.set(x, y + h * 0.35, z);
      root.add(rib);
    };
    for (const c of vegetaClusters) {
      peg(c.x, c.z, 1.35);
      for (let i = 0; i < Math.min(6, c.n - 1); i++) {
        const a = (i / 6) * Math.PI * 2;
        peg(c.x + Math.cos(a) * 22, c.z + Math.sin(a) * 22, 0.7);
      }
    }
    for (const p of vegetaLoners) peg(p.x, p.z, 0.95);
  }
  for (const [cz, col] of [
    [-BASE_Z, 0xff5252],
    [BASE_Z, 0x40c4ff],
  ]) {
    const y = groundHeight(0, cz);
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(18, 22, 10, 8), new THREE.MeshLambertMaterial({ color: col }));
    peg.position.set(0, y + 6, cz);
    root.add(peg);
  }
  mapId = prevId;
  WATER_Y = prevW;
  patriarchHill.x = hill.x;
  patriarchHill.z = hill.z;
  patriarchHill.baseY = hill.baseY;
  refreshBasePads();
  return root;
}
