import * as THREE from "three";
import { getSculptMap, setSculptMap } from "./pack.js";

/** Calidad de malla: no escatimar en cara / ropa / accesorios. */
const GEO = {
  eye: [36, 28],
  eyeLid: [28, 16],
  iris: [28, 22],
  pupil: [20, 16],
  highlight: [16, 12],
  head: [40, 32],
  ear: [24, 20],
  nose: [24, 18],
  pec: [28, 22],
  joint: [24, 20],
  limb: 28,
  boot: 24,
  torso: 28,
  armor: [36, 28],
  cape: [20, 28],
  torus: [12, 36],
};

function surf(color, opts = {}) {
  const m = {
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.05,
  };
  if (opts.side != null) m.side = opts.side;
  if (opts.emissive != null) m.emissive = opts.emissive;
  if (opts.emissiveIntensity != null) m.emissiveIntensity = opts.emissiveIntensity;
  return new THREE.MeshStandardMaterial(m);
}

/** Ruido + arrugas (pliegues suaves de cutis). */
let _skinNoise;
function skinNoiseTex() {
  if (_skinNoise) return _skinNoise;
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = 175 + ((Math.random() * 40) | 0);
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
  // Pliegues horizontales / diagonales
  for (let k = 0; k < 55; k++) {
    const y0 = Math.random() * n;
    const slope = (Math.random() - 0.5) * 0.35;
    const thick = 1 + Math.random() * 2.2;
    const depth = 35 + Math.random() * 55;
    for (let x = 0; x < n; x++) {
      const y = Math.floor(y0 + x * slope + Math.sin(x * 0.07 + k) * 3);
      for (let t = -thick; t <= thick; t++) {
        const yy = (y + t + n * 4) % n;
        const o = (yy * n + x) * 4;
        const fall = 1 - Math.abs(t) / (thick + 0.01);
        const v = Math.max(40, data[o] - depth * fall);
        data[o] = data[o + 1] = data[o + 2] = v;
      }
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 2.2);
  tex.needsUpdate = true;
  _skinNoise = tex;
  return tex;
}

/** Albedo con moteado leve (no color plano). */
function skinAlbedoTex(hex) {
  const base = new THREE.Color(hex);
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const t = (Math.random() - 0.5) * 0.04;
    const c = base.clone().offsetHSL(t * 0.05, t * 0.2, t * 0.6);
    const o = i * 4;
    data[o] = (c.r * 255) | 0;
    data[o + 1] = (c.g * 255) | 0;
    data[o + 2] = (c.b * 255) | 0;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Gradiente toon (sombras anime en escalones). */
let _toonGrad;
function toonGradient() {
  if (_toonGrad) return _toonGrad;
  // 4 bandas: sombra fuerte → media → luz → highlight
  const data = new Uint8Array([72, 130, 195, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  _toonGrad = tex;
  return tex;
}

/** Piel anime: toon + moteado suave. */
function skinMat(hex, sc = {}) {
  const base = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const paleLift = sc.paleLift ?? 0.06;
  const paleSat = sc.paleSat ?? 0.72;
  if (hsl.h > 0.02 && hsl.h < 0.12 && hsl.s > 0.15) {
    base.setHSL(hsl.h * 0.85, hsl.s * paleSat, Math.min(0.9, hsl.l + paleLift));
  }
  return new THREE.MeshToonMaterial({
    color: base,
    map: skinAlbedoTex(base.getHex()),
    gradientMap: toonGradient(),
  });
}

/** Arrugas de tela (pliegues + costuras). */
let _clothNoise;
function clothNoiseTex() {
  if (_clothNoise) return _clothNoise;
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = 168 + ((Math.random() * 28) | 0);
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
  for (let k = 0; k < 70; k++) {
    const y0 = Math.random() * n;
    const slope = (Math.random() - 0.5) * 0.55;
    const thick = 1.2 + Math.random() * 3.5;
    const depth = 40 + Math.random() * 70;
    for (let x = 0; x < n; x++) {
      const y = Math.floor(y0 + x * slope + Math.sin(x * 0.09 + k) * 4.5);
      for (let t = -thick; t <= thick; t++) {
        const yy = (y + t + n * 8) % n;
        const o = (yy * n + x) * 4;
        const fall = 1 - Math.abs(t) / (thick + 0.01);
        const v = Math.max(28, data[o] - depth * fall);
        data[o] = data[o + 1] = data[o + 2] = v;
      }
    }
  }
  // Costuras verticales tenues
  for (let k = 0; k < 8; k++) {
    const x0 = ((k + 0.5) / 8) * n;
    for (let y = 0; y < n; y++) {
      const o = (y * n + ((x0 + Math.sin(y * 0.04) * 2) | 0) % n) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.max(50, data[o] - 35);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.8, 3.2);
  tex.needsUpdate = true;
  _clothNoise = tex;
  return tex;
}

/** Placas / remaches de armadura. */
let _armorNoise;
function armorNoiseTex() {
  if (_armorNoise) return _armorNoise;
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = 190 + ((Math.random() * 20) | 0);
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
  const cell = 32;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const edge =
        gx % cell < 2 || gy % cell < 2 || gx % cell > cell - 3 || gy % cell > cell - 3;
      if (edge) {
        const o = (gy * n + gx) * 4;
        data[o] = data[o + 1] = data[o + 2] = 95;
      }
      // Remaches en esquinas de panel
      const lx = gx % cell;
      const ly = gy % cell;
      if ((lx - 4) * (lx - 4) + (ly - 4) * (ly - 4) < 9) {
        const o = (gy * n + gx) * 4;
        data[o] = data[o + 1] = data[o + 2] = 235;
      }
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1.8);
  tex.needsUpdate = true;
  _armorNoise = tex;
  return tex;
}

/** Arrugas profundas de gi (tela gruesa de artes marciales). */
let _giClothNoise;
function giClothNoiseTex() {
  if (_giClothNoise) return _giClothNoise;
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = 155 + ((Math.random() * 35) | 0);
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
  // Pliegues gruesos + finos (gi de verdad)
  for (let k = 0; k < 110; k++) {
    const y0 = Math.random() * n;
    const slope = (Math.random() - 0.5) * 0.7;
    const thick = 1.5 + Math.random() * 5;
    const depth = 55 + Math.random() * 90;
    for (let x = 0; x < n; x++) {
      const y = Math.floor(y0 + x * slope + Math.sin(x * 0.11 + k) * 6);
      for (let t = -thick; t <= thick; t++) {
        const yy = (y + t + n * 8) % n;
        const o = (yy * n + x) * 4;
        const fall = 1 - Math.abs(t) / (thick + 0.01);
        const v = Math.max(18, data[o] - depth * fall);
        data[o] = data[o + 1] = data[o + 2] = v;
      }
    }
  }
  for (let k = 0; k < 40; k++) {
    const x0 = Math.random() * n;
    const slope = (Math.random() - 0.5) * 0.4;
    for (let y = 0; y < n; y++) {
      const x = Math.floor(x0 + y * slope + Math.sin(y * 0.08) * 2);
      const o = (y * n + ((x + n * 4) % n)) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.max(30, data[o] - 50);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.4, 4.2);
  tex.needsUpdate = true;
  _giClothNoise = tex;
  return tex;
}

/** Desplaza vértices para pliegues geométricos (gi suelto). */
function wrinkleClothMesh(mesh, strength = 1) {
  if (!mesh?.geometry?.attributes?.position) return mesh;
  mesh.geometry = mesh.geometry.clone();
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, z) || 1;
    const wr =
      Math.sin(y * 26 + x * 14) * 0.0055 * strength +
      Math.sin(y * 48 + z * 18) * 0.0035 * strength +
      Math.sin((x + z) * 36 + y * 8) * 0.0028 * strength +
      Math.sin(y * 9) * 0.002 * strength;
    pos.setXYZ(i, x + (x / len) * wr, y + Math.sin(x * 22 + z * 16) * 0.0012 * strength, z + (z / len) * wr);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return mesh;
}

/** Ropa / armadura con sombreado anime + textura de detalle. */
function gearMat(hex, opts = {}) {
  const kind = opts.kind || "cloth";
  const noise = kind === "armor" ? armorNoiseTex() : kind === "gi" ? giClothNoiseTex() : clothNoiseTex();
  const bumpK = opts.bumpMul ?? (kind === "gi" ? 2.4 : 1);
  const m = new THREE.MeshToonMaterial({
    color: hex,
    map: opts.map || skinAlbedoTex(hex),
    gradientMap: toonGradient(),
    bumpMap: noise,
    bumpScale:
      (opts.detail ?? (kind === "armor" ? 0.7 : kind === "gi" ? 1.25 : 0.55)) *
      (kind === "armor" ? 0.07 : 0.055) *
      bumpK,
  });
  if (opts.side != null) m.side = opts.side;
  if (opts.emissive != null) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 0.35;
  }
  return m;
}

/** Hombrera ala: fill + borde blanco + nervaduras negras pintados (no mallas). */
const _wingPadTexCache = new Map();
function wingPadAlbedoTex(fillHex, opts = {}) {
  const borderW = Math.max(0.02, Math.min(0.28, opts.borderW ?? 0.08));
  const lines = Math.max(0, Math.min(16, (opts.lines ?? 7) | 0));
  const lineW = Math.max(0.004, Math.min(0.04, opts.lineW ?? 0.012));
  const key = `${fillHex >>> 0}|${borderW.toFixed(3)}|${lines}|${lineW.toFixed(3)}`;
  if (_wingPadTexCache.has(key)) return _wingPadTexCache.get(key);
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  const cx = n / 2;
  const cy = n / 2;
  const r = n * 0.46;
  const fill = `#${(fillHex >>> 0).toString(16).padStart(6, "0")}`;

  ctx.clearRect(0, 0, n, n);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const inset = borderW * n * 0.55;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(4, r - inset), 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = Math.max(1.2, lineW * n);
  ctx.lineCap = "butt";
  for (let i = 0; i < lines; i++) {
    const t = (i + 1) / (lines + 1);
    const x = cx - r * 0.78 + t * r * 1.56;
    ctx.beginPath();
    ctx.moveTo(x, cy - r);
    ctx.lineTo(x, cy + r);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "#fafafa";
  ctx.lineWidth = Math.max(2, borderW * n * 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r - ctx.lineWidth * 0.4), 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  _wingPadTexCache.set(key, tex);
  return tex;
}

/** Faldón cadera: semi-óvalo con tope recto + borde blanco + nervaduras (como hombrera). */
const _hipFlapTexCache = new Map();
function hipFlapAlbedoTex(fillHex, opts = {}) {
  const borderW = Math.max(0.02, Math.min(0.28, opts.borderW ?? 0.08));
  const lines = Math.max(0, Math.min(16, (opts.lines ?? 7) | 0));
  const lineW = Math.max(0.004, Math.min(0.04, opts.lineW ?? 0.012));
  const key = `hf1|${fillHex >>> 0}|${borderW.toFixed(3)}|${lines}|${lineW.toFixed(3)}`;
  if (_hipFlapTexCache.has(key)) return _hipFlapTexCache.get(key);
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  const fill = `#${(fillHex >>> 0).toString(16).padStart(6, "0")}`;
  const pad = n * 0.08;
  const cx = n * 0.5;
  const top = pad;
  const rx = (n - pad * 2) * 0.48;
  const ry = (n - pad * 2) * 0.72;

  const shape = () => {
    ctx.beginPath();
    // Tope recto + semi-óvalo hacia abajo (sin vértices laterales arriba)
    ctx.moveTo(cx - rx, top);
    ctx.lineTo(cx + rx, top);
    ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI, false);
    ctx.closePath();
  };

  ctx.clearRect(0, 0, n, n);
  ctx.fillStyle = fill;
  shape();
  ctx.fill();

  ctx.save();
  shape();
  ctx.clip();
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = Math.max(1.2, lineW * n);
  for (let i = 0; i < lines; i++) {
    const t = (i + 1) / (lines + 1);
    const x = cx - rx * 0.72 + t * rx * 1.44;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + ry);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "#fafafa";
  ctx.lineWidth = Math.max(2.5, borderW * n * 0.95);
  shape();
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  _hipFlapTexCache.set(key, tex);
  return tex;
}

/** Cáscara faldón: plano con leve cúpula (misma idea que hombrera). */
function makeHipFlapShellGeo(arch = 0.35) {
  const geo = new THREE.PlaneGeometry(2, 2, 28, 36);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    // Contorno D: |x|<=1 arriba recto, abajo óvalo
    const y01 = (y + 1) * 0.5; // 0 abajo → 1 arriba
    const maxX = y01 > 0.55 ? 1 : Math.sqrt(Math.max(0, 1 - ((y01 - 0.55) / 0.55) ** 2));
    if (Math.abs(x) > maxX) {
      pos.setXYZ(i, Math.sign(x) * maxX, y, 0);
      x = Math.sign(x) * maxX;
    }
    const h = arch * Math.max(0, 1 - x * x) * (0.35 + 0.65 * (1 - y01));
    pos.setXYZ(i, x, y, h);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Defaults editables (editor F2). */
export const DEFAULT_SCULPT = {
  // brazos / piernas
  upperArmR: 0.06,
  foreArmR: 0.055,
  thighR: 0.05,
  shinR: 0.045,
  upperArmLen: 0.26,
  foreArmLen: 0.24,
  thighLen: 0.3,
  shinLen: 0.3,
  upperArmBulk: 1.12,
  foreArmBulk: 1.08,
  thighBulk: 1.12,
  shinBulk: 1.05,
  upperArmSx: 1.12,
  foreArmSx: 1.08,
  thighSx: 1.14,
  shinSx: 1.08,
  shoulderX: 0.24,
  shoulderY: 1.16,
  armX: 0,
  armY: 0,
  armZ: 0,
  hipX: 0.1,
  hipY: 0.6,
  thighY: 0,
  // torso
  torsoMul: 0.15,
  hipsMul: 0.17,
  torsoSx: 1.18,
  torsoChestSx: 1.18,
  torsoWaistSx: 1.18,
  torsoSz: 1,
  hipsSx: 1.18,
  hipsSz: 1,
  torsoLen: 0.55,
  torsoY: 0,
  hipsLen: 0.28,
  waistYMul: 0.62,
  // pecho
  pecType: "sphere", // none | sphere | flat | split | armor
  chestR: 0.145,
  chestSx: 1.25,
  chestSy: 1.18,
  chestSz: 1.08,
  pecR: 0.065,
  pecSep: 0.06,
  pecY: 0.98,
  pecZ: 0.095,
  pecSx: 1.25,
  pecSy: 1.2,
  pecSz: 1.08,
  chestY: 0.96,
  chestZ: 0.02,
  chestRx: 0,
  chestRy: 0,
  chestRz: 0,
  // cuello / cabeza
  neckR: 0.06,
  neckLen: 0.1,
  neckY: 0,
  headR: 0.16,
  headSx: 1,
  headSy: 1,
  headSz: 1,
  headType: "sphere", // sphere | oval | skull | capsule | pill | block
  headTopSx: 1,
  headTopSy: 1,
  headTopSz: 1,
  headBotSx: 1,
  headBotSy: 1,
  headBotSz: 1,
  jaw: 0, // 0–1 mandíbula extra
  jawX: 0,
  jawY: 0,
  jawZ: 0,
  jawSx: 1,
  jawSy: 1,
  jawSz: 1,
  // orejas
  earType: "round", // none | round | pointed | wide
  earR: 0.035,
  earX: 0.15,
  earSx: 0.55,
  earSy: 1,
  earSz: 0.8,
  // ojos / cara
  eyeType: "anime", // anime | soft | sharp | dot | narrow | wide | none
  eyeSep: 0.05,
  irisSep: 0.05,
  irisY: 0.02,
  irisZ: 0.155,
  eyeTilt: 0,
  eyeY: 0.02,
  eyeZ: 0.13,
  eyeWhiteR: 0.032,
  eyeIrisR: 0.016,
  eyeSx: 1,
  eyeSy: 0.85,
  lid: 0.75,
  lidX: 0,
  lidY: 0,
  lidZ: 0,
  lidSx: 1,
  lidSy: 1,
  lidTilt: -0.12,
  brow: 0,
  browX: 0,
  browY: 0.035,
  browZ: 0,
  browTilt: -0.25,
  mouth: 0,
  mouthX: 0,
  mouthY: 0,
  mouthZ: 0,
  mouthType: "line",
  nose: 0,
  noseX: 0,
  noseY: 0,
  noseZ: 0,
  noseType: "none",
  thirdEye: 0, // 0 off, 1 on
  // manos / pies
  handScale: 1,
  fingerLen: 1,
  handRx: 0.12,
  handRy: 0,
  handRz: 0,
  footScale: 1,
  footLen: 2.45,
  footSx: 1.22,
  footSy: 0.36,
  footZ: 0.22,
  footY: 0,
  footPitch: 0,
  bootCuff: 1.05,
  showHands: 1,
  showBoots: 1,
  bootType: "tall", // tall | combat | armor | soft
  // capa / cinturón
  capeScale: 1,
  capeThick: 1,
  capeX: 0,
  capeY: 0,
  capeZ: 0,
  plateX: 0,
  plateY: 0,
  plateZ: 0,
  plateSx: 1,
  plateSy: 1,
  plateSz: 1,
  padY: 0,
  padX: 0,
  padZ: 0,
  padScale: 0.72,
  padBorder: 0.09,
  padTilt: 0.16,
  padPitch: 0.06,
  padArch: 0.55,
  padLines: 7,
  padLineW: 0.012,
  plateBorder: 0.09,
  plateRibs: 6,
  plateAbsW: 0.17, // ancho del abs (fracción del UV)
  plateAbsArch: 0.085, // altura del semi-óvalo
  plateAbsGap: 0.22, // separación bajo pecs (más = abs más abajo)
  platePecBot: 0.38, // dónde terminan los pectorales (0–1 UV Y)
  platePecSpan: 0.28, // ancho total front de ambos pecs (fracción UV; no hacia costados)
  padType: "sphere", // none | sphere | spaulder | spiked | flat | wing
  plateType: "dome", // none | dome | flat | ribbed | split | elite
  bracerType: "none", // none | cuff | plate | wrap
  upperSuit: "none", // none | freezerElite (hombreras ala + pechera; capa = showCape)
  showPads: 0,
  showPlate: 0,
  showCape: 0,
  showScouter: 0,
  showTail: 0,
  showHipFlaps: 0,
  hipFlapX: 0,
  hipFlapY: 0,
  hipFlapZ: 0,
  hipFlapSx: 1,
  hipFlapSy: 1,
  hipFlapSz: 1,
  hipFlapTilt: 0.2,
  hipFlapArch: 0.35,
  tailLen: 1,
  tailThick: 1,
  clothDetail: 0.55,
  armorDetail: 0.7,
  spots: 0,
  spotScale: 1,
  frostLineX: 0,
  frostLineY: 0,
  frostLineZ: 0,
  frostLineSx: 1,
  frostLineSy: 1,
  frostLineSz: 1,
  frostGemX: 0,
  frostGemY: 0,
  frostGemZ: 0,
  frostGemSx: 1,
  frostGemSy: 1,
  frostGemSz: 1,
  // gema frontal (cualquier kit / peinado; toggle showFaceGem)
  showFaceGem: 0,
  faceGemX: 0,
  faceGemY: 0,
  faceGemZ: 0,
  faceGemSx: 1,
  faceGemSy: 1,
  faceGemSz: 1,
  showUnder: 1,
  underX: 0,
  underY: 0,
  underZ: 0,
  underSx: 1,
  underSy: 1,
  underSz: 1,
  beltR: 0.155,
  beltThick: 0.034,
  beltY: 0,
  showBelt: 1,
  showSash: 1,
  showSashTail: 1,
  showLapels: 1,
  sashY: 0,
  // antenas namek
  antLen: 0.22,
  antR: 0.014,
  antSpread: 0.055,
  // piel
  bumpScale: 0.042,
  sheen: 0.4,
  sheenRough: 0.62,
  skinRough: 0.82,
  paleLift: 0.06,
  paleSat: 0.72,
  clothFit: 1.12,
  hairSpikeR: 1,
  hairSpikeLen: 1,
  hairY: 0,
};

export const SCULPT_SELECTS = {
  headType: ["sphere", "oval", "skull", "capsule", "pill", "block"],
  pecType: ["none", "sphere", "flat", "split", "armor"],
  earType: ["none", "round", "pointed", "wide"],
  eyeType: ["anime", "soft", "sharp", "dot", "narrow", "wide", "none"],
  noseType: ["none", "anime", "bulb", "button", "hook", "flat", "ridge", "soft", "namek"],
  mouthType: ["none", "line", "smile", "frown", "open", "grit", "smirk"],
  padType: ["none", "sphere", "spaulder", "spiked", "flat", "wing"],
  plateType: ["none", "dome", "flat", "ribbed", "split", "elite"],
  bracerType: ["none", "cuff", "plate", "wrap"],
  upperSuit: ["none", "freezerElite"],
  bootType: ["tall", "combat", "armor", "soft"],
};

const SCULPT_MAP_KEY = "namekusei.sculptMap";
const SCULPT_KEY_OLD = "namekusei.sculpt";

try {
  localStorage.removeItem(SCULPT_MAP_KEY);
  localStorage.removeItem(SCULPT_KEY_OLD);
} catch {
  /* ignore */
}

function migrateSculpt(j) {
  if (!j || typeof j !== "object") return {};
  const out = { ...j };
  if (out.armR != null) {
    if (out.upperArmR == null) out.upperArmR = out.armR;
    if (out.foreArmR == null) out.foreArmR = out.armR * 0.92;
    delete out.armR;
  }
  if (out.legR != null) {
    if (out.thighR == null) out.thighR = out.legR;
    if (out.shinR == null) out.shinR = out.legR * 0.9;
    delete out.legR;
  }
  if (out.armBulk != null) {
    if (out.upperArmBulk == null) out.upperArmBulk = out.armBulk;
    if (out.foreArmBulk == null) out.foreArmBulk = out.armBulk * 0.96;
    delete out.armBulk;
  }
  if (out.legBulk != null) {
    if (out.thighBulk == null) out.thighBulk = out.legBulk;
    if (out.shinBulk == null) out.shinBulk = out.legBulk * 0.94;
    delete out.legBulk;
  }
  if (out.armSx != null) {
    if (out.upperArmSx == null) out.upperArmSx = out.armSx;
    if (out.foreArmSx == null) out.foreArmSx = out.armSx * 0.96;
    delete out.armSx;
  }
  if (out.legSx != null) {
    if (out.thighSx == null) out.thighSx = out.legSx;
    if (out.shinSx == null) out.shinSx = out.legSx * 0.95;
    delete out.legSx;
  }
  if (out.torsoChestSx == null) out.torsoChestSx = out.torsoSx ?? 1.18;
  if (out.torsoWaistSx == null) out.torsoWaistSx = out.torsoSx ?? 1.18;
  if (out.altura == null && out.moldAltura != null) out.altura = out.moldAltura;
  return out;
}

function readSculptMap() {
  return getSculptMap();
}

function writeSculptMap(map) {
  setSculptMap(map);
}

export function sculptIdFromLook(look = {}) {
  return look.who || look.sculptId || look.name || null;
}

export function sculptAltura(id, statsH) {
  const sc = id ? loadSavedSculpt(id) : {};
  const a = sc.altura ?? sc.moldAltura;
  if (a != null && a > 0.5) return a;
  return (statsH ?? 1.18) * 1.21;
}

export function loadSavedSculpt(id) {
  if (!id) return {};
  const map = readSculptMap();
  return migrateSculpt(map[id] || {});
}

export function saveSculpt(id, sculpt) {
  if (!id) return sculpt;
  const map = readSculptMap();
  const merged = { ...DEFAULT_SCULPT, ...migrateSculpt(sculpt) };
  map[id] = merged;
  writeSculptMap(map);
  return merged;
}

export function clearSavedSculpt(id) {
  if (!id) {
    setSculptMap({});
    return;
  }
  const map = readSculptMap();
  delete map[id];
  writeSculptMap(map);
}

export function listSavedSculptIds() {
  return Object.keys(readSculptMap());
}

/** Perfil 2D → LatheGeometry (cascos / turbantes). */
function latheProfile(pts, segs = 16) {
  const vecs = pts.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(vecs, segs);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Loft sólido “escultura”: anillos de radio a lo largo de Y, tapas cerradas.
 * profile = radios de arriba (+Y) → abajo (−Y), valores absolutos.
 */
function loftGeo(profile, len, opts = {}) {
  const radial = opts.radial ?? GEO.limb;
  const sxOpt = opts.sx ?? 1;
  const szOpt = opts.sz ?? 1;
  const sxAt = typeof sxOpt === "function" ? sxOpt : () => sxOpt;
  const szAt = typeof szOpt === "function" ? szOpt : () => szOpt;
  const n = profile.length;
  const pos = [];
  const uvs = [];
  const idx = [];
  const half = len * 0.5;
  for (let i = 0; i < n; i++) {
    const y = half - (i / (n - 1)) * len;
    const r = Math.max(0.004, profile[i]);
    const v = i / (n - 1);
    const sx = sxAt(v);
    const sz = szAt(v);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(Math.cos(a) * r * sx, y, Math.sin(a) * r * sz);
      uvs.push(j / radial, v);
    }
  }
  const topC = pos.length / 3;
  pos.push(0, half, 0);
  uvs.push(0.5, 0);
  const botC = pos.length / 3;
  pos.push(0, -half, 0);
  uvs.push(0.5, 1);
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      // winding hacia afuera (antes estaba invertido → agujeros negros)
      idx.push(a, b, c, b, d, c);
    }
  }
  for (let j = 0; j < radial; j++) {
    idx.push(topC, (j + 1) % radial, j);
    const base = (n - 1) * radial;
    idx.push(botC, base + j, base + ((j + 1) % radial));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function loftMesh(profile, len, mat, opts = {}) {
  const m = new THREE.Mesh(loftGeo(profile, len, opts), mat);
  m.castShadow = true;
  return m;
}

function mulProfile(base, scale) {
  return base.map((r) => r * scale);
}

/** Perfiles musculares (autoría a mano). */
const PROF = {
  upperArm: [0.92, 1.12, 1.28, 1.32, 1.22, 1.08, 0.95],
  foreArm: [0.95, 1.08, 1.18, 1.12, 1.0, 0.88, 0.78],
  thigh: [1.05, 1.22, 1.35, 1.38, 1.28, 1.12, 0.98],
  shin: [0.98, 1.1, 1.18, 1.12, 1.0, 0.9, 0.82],
  torso: [0.55, 0.95, 1.15, 1.22, 1.18, 1.05, 0.92, 0.88, 0.95],
};

function jointBall(r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, GEO.joint[0], GEO.joint[1]), mat);
  m.castShadow = true;
  return m;
}

/** Mano con palma + 4 dedos + pulgar. */
function handMesh(r, mat, fingerLen = 1) {
  const g = new THREE.Group();
  const palm = loftMesh([r * 0.7, r * 0.95, r * 0.9], r * 1.1, mat, { radial: 18, sx: 1.35, sz: 0.7 });
  palm.rotation.x = Math.PI / 2;
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = loftMesh([r * 0.22, r * 0.2, r * 0.16], r * 0.85 * fingerLen, mat, { radial: 14 });
    f.position.set((i - 1.5) * r * 0.42, r * 0.05, r * 0.85);
    f.rotation.x = 0.35;
    g.add(f);
  }
  const thumb = loftMesh([r * 0.24, r * 0.2, r * 0.15], r * 0.55 * fingerLen, mat, { radial: 14 });
  thumb.position.set(-r * 0.85, 0, r * 0.2);
  thumb.rotation.set(0.4, 0.5, 0.9);
  g.add(thumb);
  return g;
}

/** Pie plano (suela en XZ). loft Y → rot X 90°: largo en Z, grosor en Y. */
function footMesh(r, mat, o = {}) {
  const type = o.bootType || "tall";
  if (type === "combat") return combatBootMesh(r, mat, o);
  if (type === "armor") return armorBootMesh(r, mat, o);
  if (type === "soft") return softBootMesh(r, mat, o);
  return tallBootMesh(r, mat, o);
}

/** Bota alta actual (caña + suela). */
function tallBootMesh(r, mat, o = {}) {
  const g = new THREE.Group();
  const len = r * (o.footLen ?? 2.45);
  const sx = o.footSx ?? 1.22;
  const sy = o.footSy ?? 0.36;
  const cuffH = r * (o.bootCuff ?? 1.05);
  const pitch = o.footPitch ?? 0;
  const halfH = r * sy;
  const cuff = loftMesh([r * 1.02, r * 1.08, r * 1.04], cuffH, mat, { radial: 12, sx: 1.08, sz: 1.08 });
  cuff.position.y = -cuffH * 0.2;
  g.add(cuff);
  const y0 = -cuffH * 0.38 - halfH * 0.35;
  const z0 = len * 0.26;
  const sole = loftMesh(
    [r * 0.68, r * 1.02, r * 1.1, r * 1.02, r * 0.78],
    len,
    mat,
    { radial: 12, sx, sz: sy }
  );
  sole.rotation.x = Math.PI / 2 + pitch;
  sole.position.set(0, y0, z0);
  g.add(sole);
  const toe = loftMesh([r * 0.78, r * 0.62, r * 0.4], r * 0.62, mat, { radial: 10, sx: sx * 0.98, sz: sy * 0.9 });
  toe.rotation.x = Math.PI / 2 + pitch;
  toe.position.set(0, y0 - halfH * 0.08, z0 + len * 0.48);
  g.add(toe);
  return g;
}

/**
 * Zueco de combate (Gokú/Krilin/Gohan): caña blanda media, suela plana,
 * puntera redondeada y bandas de ajuste. Colores: Botas + Acento/Placa.
 */
function combatBootMesh(r, mat, o = {}) {
  const g = new THREE.Group();
  const trim = o.bootTrim || mat;
  const len = r * (o.footLen ?? 2.2);
  const sx = o.footSx ?? 1.15;
  const sy = o.footSy ?? 0.32;
  const cuffH = r * (o.bootCuff ?? 0.85) * 0.92;
  const pitch = o.footPitch ?? 0.06;
  const halfH = r * sy;

  // Caña blanda (más baja y ligeramente cónica)
  const cuff = loftMesh([r * 0.95, r * 1.05, r * 1.02, r * 0.98], cuffH, mat, {
    radial: 14,
    sx: 1.05,
    sz: 1.08,
  });
  cuff.position.y = -cuffH * 0.15;
  g.add(cuff);

  // Bandas de ajuste (estilo venda)
  for (const t of [0.2, 0.48, 0.72]) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.12, r * 0.09, 8, 16),
      trim
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = -cuffH * t;
    band.scale.set(1.05, 1.08, 1);
    g.add(band);
  }

  const y0 = -cuffH * 0.55 - halfH * 0.4;
  const z0 = len * 0.22;

  // Suela plana blanda
  const sole = loftMesh(
    [r * 0.72, r * 1.0, r * 1.08, r * 0.95, r * 0.7],
    len,
    mat,
    { radial: 12, sx, sz: sy * 0.85 }
  );
  sole.rotation.x = Math.PI / 2 + pitch;
  sole.position.set(0, y0, z0);
  g.add(sole);

  // Empeine / puente
  const vamp = loftMesh([r * 0.9, r * 0.95, r * 0.75], r * 0.7, mat, {
    radial: 12,
    sx: sx * 0.95,
    sz: sy * 1.1,
  });
  vamp.rotation.x = Math.PI / 2 + pitch * 0.5;
  vamp.position.set(0, y0 + halfH * 0.55, z0 + len * 0.05);
  g.add(vamp);

  // Puntera redondeada (zueco)
  const toe = loftMesh([r * 0.85, r * 0.7, r * 0.35], r * 0.55, mat, {
    radial: 12,
    sx: sx * 1.02,
    sz: sy * 0.95,
  });
  toe.rotation.x = Math.PI / 2 + pitch;
  toe.position.set(0, y0 - halfH * 0.05, z0 + len * 0.42);
  g.add(toe);

  // Ribete de suela (acento)
  const welt = loftMesh([r * 0.78, r * 1.05, r * 1.12, r * 0.82], len * 0.92, trim, {
    radial: 12,
    sx: sx * 1.06,
    sz: sy * 0.45,
  });
  welt.rotation.x = Math.PI / 2 + pitch;
  welt.position.set(0, y0 - halfH * 0.35, z0);
  g.add(welt);

  return g;
}

/** Bota de armadura: caña rígida + puntera más cuadrada. */
function armorBootMesh(r, mat, o = {}) {
  const g = tallBootMesh(r, mat, { ...o, bootCuff: (o.bootCuff ?? 1.05) * 1.15, footSy: (o.footSy ?? 0.36) * 1.1 });
  const trim = o.bootTrim || mat;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.35, r * 1.1), trim);
  plate.position.set(0, -r * (o.bootCuff ?? 1.05) * 0.35, r * 0.15);
  g.add(plate);
  return g;
}

/** Calzado blando corto (casi zapatilla). */
function softBootMesh(r, mat, o = {}) {
  return tallBootMesh(r, mat, {
    ...o,
    bootCuff: (o.bootCuff ?? 1.05) * 0.45,
    footLen: (o.footLen ?? 2.45) * 0.92,
    footSy: (o.footSy ?? 0.36) * 0.9,
  });
}

function makeArm(upperR, lowerR, upperLen, lowerLen, mat, x, y, extras) {
  const sh = new THREE.Group();
  sh.position.set(x, y, extras?.z ?? 0);
  const uBulk = extras?.upperBulk ?? extras?.bulk ?? 1.12;
  const lBulk = extras?.lowerBulk ?? extras?.bulk ?? 1.08;
  const uSx = extras?.upperSx ?? extras?.sx ?? 1.12;
  const lSx = extras?.lowerSx ?? extras?.sx ?? 1.08;
  const side = extras?.side === "R" ? "R" : "L";
  const fit = extras?.clothFit ?? 1.1;
  const upper = loftMesh(mulProfile(PROF.upperArm, upperR * uBulk), upperLen, mat, {
    radial: 14,
    sx: uSx,
    sz: uSx * 0.94,
  });
  upper.position.y = -upperLen / 2;
  upper.userData.moldId = `skin_uarm_${side}`;
  upper.userData.moldFamily = "limb";
  sh.add(upper);
  const sleeveM = extras?.sleeveMat ?? extras?.clothMat;
  if (sleeveM) {
    const sl = extras?.sleeveLen ?? 0.88;
    const cu = loftMesh(mulProfile(PROF.upperArm, upperR * uBulk * fit), upperLen * sl, sleeveM, {
      radial: 14,
      sx: uSx * 1.02,
      sz: uSx * 0.96,
    });
    cu.position.y = -upperLen * (sl * 0.52);
    cu.userData.moldId = `cloth_uarm_${side}`;
    cu.userData.moldFamily = "cloth";
    if (extras?.wrinkle) wrinkleClothMesh(cu, extras.wrinkle);
    sh.add(cu);
  }
  const elbow = new THREE.Group();
  elbow.position.y = -upperLen;
  elbow.add(jointBall(Math.max(upperR, lowerR) * 1.15, mat));
  const lower = loftMesh(mulProfile(PROF.foreArm, lowerR * lBulk), lowerLen, mat, {
    radial: 14,
    sx: lSx,
    sz: lSx * 0.9,
  });
  lower.position.y = -lowerLen / 2;
  lower.userData.moldId = `skin_farm_${side}`;
  lower.userData.moldFamily = "limb";
  elbow.add(lower);
  const foreM = extras?.foreClothMat ?? (extras?.sleeveLower === false ? null : extras?.clothMat);
  if (foreM) {
    const cl = loftMesh(mulProfile(PROF.foreArm, lowerR * lBulk * fit), lowerLen * 0.75, foreM, {
      radial: 14,
      sx: lSx * 1.02,
      sz: lSx * 0.92,
    });
    cl.position.y = -lowerLen * 0.32;
    cl.userData.moldId = `cloth_farm_${side}`;
    cl.userData.moldFamily = "cloth";
    elbow.add(cl);
  }
  if (extras?.band) {
    const atWrist = extras.bandAt === "wrist";
    const br = atWrist ? lowerR : upperR;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(br * 1.55 * fit, br * 0.28, 10, 20),
      extras.band
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = atWrist ? -lowerLen * 0.88 : -upperLen * 0.35;
    band.userData.moldId = `cloth_band_${side}`;
    band.userData.moldFamily = "cloth";
    (atWrist ? elbow : sh).add(band);
  }
  const bt = extras?.bracerType || "none";
  if (bt !== "none" && extras?.bracerMat) {
    const bm = extras.bracerMat;
    if (bt === "cuff") {
      const cuff = new THREE.Mesh(
        new THREE.TorusGeometry(lowerR * 1.7 * fit, lowerR * 0.38, 10, 18),
        bm
      );
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -lowerLen * 0.55;
      cuff.userData.moldId = `bracer_${side}`;
      cuff.userData.moldFamily = "cloth";
      elbow.add(cuff);
    } else if (bt === "plate") {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(lowerR * 2.4 * fit, lowerLen * 0.42, lowerR * 0.55), bm);
      plate.position.set(0, -lowerLen * 0.45, lowerR * 0.55);
      plate.userData.moldId = `bracer_${side}`;
      plate.userData.moldFamily = "cloth";
      elbow.add(plate);
    } else if (bt === "wrap") {
      const wrap = new THREE.Mesh(
        new THREE.CylinderGeometry(lowerR * 1.35 * fit, lowerR * 1.25 * fit, lowerLen * 0.55, 12),
        bm
      );
      wrap.position.y = -lowerLen * 0.5;
      wrap.userData.moldId = `bracer_${side}`;
      wrap.userData.moldFamily = "cloth";
      elbow.add(wrap);
    }
  }
  if (extras?.hand && extras.showHands !== 0) {
    const hs = extras.handScale ?? 1;
    const hand = handMesh(lowerR * 1.25 * hs, extras.hand, extras.fingerLen ?? 1);
    hand.rotation.set(extras.handRx ?? 0.12, extras.handRy ?? 0, extras.handRz ?? 0);
    hand.scale.multiplyScalar(hs);
    hand.traverse((o) => {
      if (o.isMesh) {
        o.userData.moldFamily = "limb";
        o.userData.moldId = o.userData.moldId || `hand_${side}`;
      }
    });
    const wrist = new THREE.Group();
    wrist.position.y = -lowerLen + lowerR * 0.1;
    wrist.rotation.order = "XYZ";
    wrist.add(hand);
    elbow.add(wrist);
    sh.userData.wrist = wrist;
  }
  sh.add(elbow);
  sh.userData.elbow = elbow;
  return sh;
}

function makeLeg(thighR, shinR, thighLen, shinLen, mat, x, y, extras) {
  const hip = new THREE.Group();
  hip.position.set(x, y, 0);
  const tBulk = extras?.thighBulk ?? extras?.bulk ?? 1.12;
  const sBulk = extras?.shinBulk ?? extras?.bulk ?? 1.05;
  const tSx = extras?.thighSx ?? extras?.sx ?? 1.14;
  const sSx = extras?.shinSx ?? extras?.sx ?? 1.08;
  const side = extras?.side === "R" ? "R" : "L";
  const fit = extras?.clothFit ?? 1.1;
  const thigh = loftMesh(mulProfile(PROF.thigh, thighR * tBulk), thighLen, mat, {
    radial: 14,
    sx: tSx,
    sz: tSx * 0.93,
  });
  thigh.position.y = -thighLen / 2 + (extras?.thighY ?? 0);
  thigh.userData.moldId = `skin_thigh_${side}`;
  thigh.userData.moldFamily = "limb";
  hip.add(thigh);
  const pantsM = extras?.pantsMat ?? extras?.clothMat;
  if (pantsM) {
    const ct = loftMesh(mulProfile(PROF.thigh, thighR * tBulk * fit), thighLen * 0.9, pantsM, {
      radial: 14,
      sx: tSx * 1.02,
      sz: tSx * 0.95,
    });
    ct.position.y = -thighLen * 0.45 + (extras?.thighY ?? 0);
    ct.userData.moldId = `cloth_thigh_${side}`;
    ct.userData.moldFamily = "cloth";
    if (extras?.wrinkle) wrinkleClothMesh(ct, extras.wrinkle);
    hip.add(ct);
  }
  const knee = new THREE.Group();
  knee.position.y = -thighLen;
  knee.add(jointBall(Math.max(thighR, shinR) * 1.12, mat));
  const shin = loftMesh(mulProfile(PROF.shin, shinR * sBulk), shinLen, mat, {
    radial: 14,
    sx: sSx,
    sz: sSx * 0.9,
  });
  shin.position.y = -shinLen / 2;
  shin.userData.moldId = `skin_shin_${side}`;
  shin.userData.moldFamily = "limb";
  knee.add(shin);
  const shinCloth = extras?.shinClothMat ?? extras?.pantsMat ?? extras?.clothMat;
  if (shinCloth) {
    const cs = loftMesh(mulProfile(PROF.shin, shinR * sBulk * fit), shinLen * 0.7, shinCloth, {
      radial: 14,
      sx: sSx * 1.02,
      sz: sSx * 0.92,
    });
    cs.position.y = -shinLen * 0.28;
    cs.userData.moldId = `cloth_shin_${side}`;
    cs.userData.moldFamily = "cloth";
    if (extras?.wrinkle) wrinkleClothMesh(cs, extras.wrinkle * 0.85);
    knee.add(cs);
  }
  if (extras?.boot && extras.showBoots !== 0) {
    const fs = extras.footScale ?? 1;
    const boot = footMesh(shinR * 1.4, extras.boot, extras);
    boot.position.set(0, -shinLen + (extras.footY ?? 0), extras.footZ ?? 0);
    boot.scale.multiplyScalar(fs);
    boot.traverse((o) => {
      if (o.isMesh) {
        o.userData.moldFamily = "cloth";
        o.userData.moldId = o.userData.moldId || `boot_${side}`;
      }
    });
    knee.add(boot);
  }
  hip.add(knee);
  hip.userData.knee = knee;
  return hip;
}

/** Pico de pelo anime: cuchilla afilada (base ancha → punta), no cono de fiesta. */
function hairSpike(mat, s, hr, hl, o) {
  const len = (o.len ?? 0.22) * s * hl;
  const r = (o.r ?? 0.042) * s * hr;
  const m = loftMesh([r * 1.15, r * 0.92, r * 0.55, r * 0.22, r * 0.04], len, mat, {
    radial: 6,
    sx: 1,
    sz: 1,
  });
  // Base en el origen, punta en +Y local
  m.geometry.translate(0, len * 0.5, 0);
  m.position.set((o.x ?? 0) * s, (o.y ?? 0.14) * s, (o.z ?? 0) * s);
  m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  // Aplastar en X = silueta de “hoja” (Saiyan)
  m.scale.set(o.sx ?? 0.32, 1, o.sz ?? 1.25);
  return m;
}

function hairCap(mat, s, y, sx, sy, sz, headR = 0.16) {
  // Casco de pelo: más bajo y ancho, cubre cráneo sin “pelota”
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(headR * s * 1.08, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.72),
    mat
  );
  cap.position.y = y * s;
  cap.scale.set(sx * 1.06, sy * 0.85, sz * 1.08);
  return cap;
}

function addHeadGear(headG, s, look, sc = DEFAULT_SCULPT) {
  const hc = gearMat(look.hairC ?? 0x111, { kind: "cloth", detail: 0.35, roughness: 0.62, metalness: 0.02 });
  hc.userData.ssjHair = true;
  const t = look.hair;
  const hr = sc.hairSpikeR ?? 1;
  const hl = sc.hairSpikeLen ?? 1;
  const hk = (sc.headR || 0.16) / 0.16;
  const hsx = sc.headSx || 1;
  const hsy = sc.headSy || 1;
  const hsz = sc.headSz || 1;
  const hairRoot = new THREE.Group();
  hairRoot.position.y = (sc.hairY || 0) * s;
  headG.add(hairRoot);
  const tagHair = (m, id) => {
    m.userData.moldId = id;
    m.userData.moldFamily = "hair";
    hairRoot.add(m);
  };
  const spikes = (list, pre) =>
    list.forEach((o, i) =>
      tagHair(
        hairSpike(hc, s, hr, hl, {
          ...o,
          x: (o.x ?? 0) * hk * hsx,
          y: (o.y ?? 0.14) * hk * hsy,
          z: (o.z ?? 0) * hk * hsz,
          r: (o.r ?? 0.042) * hk,
          len: (o.len ?? 0.22) * hk,
        }),
        `${pre}_${i}`
      )
    );
  const putCap = (y, sx, sy, sz, id = "hair_cap") =>
    tagHair(hairCap(hc, s, y * hk, sx * hsx, sy * hsy, sz * hsz, sc.headR || 0.16), id);

  if (t === "spike" || t === "goku") {
    // Gokú: flequillo adelante + corona salvaje atrás/arriba
    putCap(0.02, 1.12, 0.62, 1.1);
    spikes(
      [
        // Flequillo (hacia la frente, +Z)
        { x: -0.04, y: 0.04, z: 0.12, rx: 1.05, rz: 0.28, len: 0.14, r: 0.038, sx: 0.38 },
        { x: 0.04, y: 0.04, z: 0.12, rx: 1.05, rz: -0.28, len: 0.14, r: 0.038, sx: 0.38 },
        { x: 0, y: 0.05, z: 0.125, rx: 1.15, len: 0.11, r: 0.034, sx: 0.42 },
        { x: -0.075, y: 0.06, z: 0.1, rx: 0.85, rz: 0.45, len: 0.12, r: 0.032, sx: 0.35 },
        { x: 0.075, y: 0.06, z: 0.1, rx: 0.85, rz: -0.45, len: 0.12, r: 0.032, sx: 0.35 },
        // Laterales
        { x: -0.13, y: 0.1, z: 0.02, rx: -0.15, rz: 0.95, len: 0.16, r: 0.04, sx: 0.3 },
        { x: 0.13, y: 0.1, z: 0.02, rx: -0.15, rz: -0.95, len: 0.16, r: 0.04, sx: 0.3 },
        { x: -0.11, y: 0.12, z: -0.04, rx: -0.55, rz: 0.7, len: 0.2, r: 0.042, sx: 0.28 },
        { x: 0.11, y: 0.12, z: -0.04, rx: -0.55, rz: -0.7, len: 0.2, r: 0.042, sx: 0.28 },
        // Corona trasera (hacia atrás/arriba, −Z)
        { x: -0.08, y: 0.14, z: -0.08, rx: -0.95, rz: 0.35, len: 0.24, r: 0.048, sx: 0.3 },
        { x: 0.08, y: 0.14, z: -0.08, rx: -0.95, rz: -0.35, len: 0.24, r: 0.048, sx: 0.3 },
        { x: -0.045, y: 0.16, z: -0.1, rx: -1.15, rz: 0.18, len: 0.3, r: 0.05, sx: 0.28 },
        { x: 0.045, y: 0.16, z: -0.1, rx: -1.15, rz: -0.18, len: 0.3, r: 0.05, sx: 0.28 },
        { x: 0, y: 0.17, z: -0.12, rx: -1.28, len: 0.36, r: 0.055, sx: 0.32 },
        { x: -0.02, y: 0.15, z: -0.06, rx: -0.75, rz: 0.12, len: 0.22, r: 0.044, sx: 0.3 },
        { x: 0.02, y: 0.15, z: -0.06, rx: -0.75, rz: -0.12, len: 0.22, r: 0.044, sx: 0.3 },
        // Relleno volumen
        { x: -0.06, y: 0.1, z: 0.04, rx: 0.25, rz: 0.4, len: 0.1, r: 0.036, sx: 0.4 },
        { x: 0.06, y: 0.1, z: 0.04, rx: 0.25, rz: -0.4, len: 0.1, r: 0.036, sx: 0.4 },
      ],
      "hair_goku"
    );
  } else if (t === "gohan") {
    // Gohan: más corto, bowl + picos suaves
    putCap(0.03, 1.14, 0.7, 1.08);
    spikes(
      [
        { x: -0.045, y: 0.05, z: 0.12, rx: 0.95, rz: 0.22, len: 0.1, r: 0.034, sx: 0.4 },
        { x: 0.045, y: 0.05, z: 0.12, rx: 0.95, rz: -0.22, len: 0.1, r: 0.034, sx: 0.4 },
        { x: 0, y: 0.055, z: 0.12, rx: 1.05, len: 0.09, r: 0.032, sx: 0.45 },
        { x: -0.1, y: 0.1, z: 0.04, rx: -0.1, rz: 0.55, len: 0.12, r: 0.038, sx: 0.35 },
        { x: 0.1, y: 0.1, z: 0.04, rx: -0.1, rz: -0.55, len: 0.12, r: 0.038, sx: 0.35 },
        { x: -0.07, y: 0.13, z: -0.04, rx: -0.55, rz: 0.28, len: 0.14, r: 0.04, sx: 0.32 },
        { x: 0.07, y: 0.13, z: -0.04, rx: -0.55, rz: -0.28, len: 0.14, r: 0.04, sx: 0.32 },
        { x: 0, y: 0.15, z: -0.02, rx: -0.4, len: 0.16, r: 0.045, sx: 0.38 },
        { x: -0.05, y: 0.11, z: -0.1, rx: -1.05, rz: 0.15, len: 0.14, r: 0.04, sx: 0.32 },
        { x: 0.05, y: 0.11, z: -0.1, rx: -1.05, rz: -0.15, len: 0.14, r: 0.04, sx: 0.32 },
        { x: 0, y: 0.1, z: -0.11, rx: -1.15, len: 0.15, r: 0.042, sx: 0.35 },
      ],
      "hair_gohan"
    );
  } else if (t === "trunks") {
    // Trunks: picos altos verticales
    putCap(0.02, 1.08, 0.58, 1.02);
    spikes(
      [
        { x: -0.04, y: 0.04, z: 0.11, rx: 1.15, rz: 0.2, len: 0.12, r: 0.03, sx: 0.35 },
        { x: 0.04, y: 0.04, z: 0.11, rx: 1.15, rz: -0.2, len: 0.11, r: 0.028, sx: 0.35 },
        { x: 0, y: 0.04, z: 0.11, rx: 1.25, len: 0.1, r: 0.026, sx: 0.4 },
        { x: -0.09, y: 0.12, z: 0, rx: -0.15, rz: 0.25, len: 0.32, r: 0.038, sx: 0.28 },
        { x: -0.045, y: 0.14, z: -0.02, rx: -0.05, rz: 0.1, len: 0.4, r: 0.04, sx: 0.26 },
        { x: 0, y: 0.16, z: -0.02, rx: 0, len: 0.46, r: 0.042, sx: 0.28 },
        { x: 0.045, y: 0.14, z: -0.02, rx: -0.05, rz: -0.1, len: 0.4, r: 0.04, sx: 0.26 },
        { x: 0.09, y: 0.12, z: 0, rx: -0.15, rz: -0.25, len: 0.32, r: 0.038, sx: 0.28 },
        { x: -0.06, y: 0.1, z: -0.08, rx: -0.75, rz: 0.12, len: 0.2, r: 0.034, sx: 0.3 },
        { x: 0.06, y: 0.1, z: -0.08, rx: -0.75, rz: -0.12, len: 0.2, r: 0.034, sx: 0.3 },
      ],
      "hair_trunks"
    );
  } else if (t === "raditz") {
    // Raditz: melena larga salvaje atrás
    putCap(0.02, 1.12, 0.65, 1.14);
    spikes(
      [
        { x: -0.05, y: 0.05, z: 0.11, rx: 1.0, rz: 0.25, len: 0.14, r: 0.034, sx: 0.35 },
        { x: 0.05, y: 0.05, z: 0.11, rx: 1.0, rz: -0.25, len: 0.14, r: 0.034, sx: 0.35 },
        { x: -0.12, y: 0.1, z: 0, rx: -0.3, rz: 0.85, len: 0.28, r: 0.04, sx: 0.28 },
        { x: 0.12, y: 0.1, z: 0, rx: -0.3, rz: -0.85, len: 0.28, r: 0.04, sx: 0.28 },
        { x: -0.1, y: 0.1, z: -0.06, rx: -1.15, rz: 0.45, len: 0.48, r: 0.042, sx: 0.24 },
        { x: 0.1, y: 0.1, z: -0.06, rx: -1.15, rz: -0.45, len: 0.48, r: 0.042, sx: 0.24 },
        { x: -0.05, y: 0.12, z: -0.1, rx: -1.4, rz: 0.2, len: 0.58, r: 0.044, sx: 0.22 },
        { x: 0.05, y: 0.12, z: -0.1, rx: -1.4, rz: -0.2, len: 0.58, r: 0.044, sx: 0.22 },
        { x: 0, y: 0.11, z: -0.12, rx: -1.5, len: 0.65, r: 0.048, sx: 0.24 },
        { x: -0.03, y: 0.08, z: -0.08, rx: -1.25, rz: 0.1, len: 0.4, r: 0.038, sx: 0.26 },
        { x: 0.03, y: 0.08, z: -0.08, rx: -1.25, rz: -0.1, len: 0.4, r: 0.038, sx: 0.26 },
      ],
      "hair_raditz"
    );
  } else if (t === "spikeV" || t === "vegeta") {
    // Vegeta: todos hacia arriba, pico en V / corona
    putCap(0.04, 1.05, 0.5, 0.98);
    spikes(
      [
        // Flequillo corto hacia arriba desde frente
        { x: -0.035, y: 0.06, z: 0.1, rx: -0.55, rz: 0.2, len: 0.14, r: 0.032, sx: 0.3 },
        { x: 0.035, y: 0.06, z: 0.1, rx: -0.55, rz: -0.2, len: 0.14, r: 0.032, sx: 0.3 },
        { x: 0, y: 0.07, z: 0.1, rx: -0.7, len: 0.16, r: 0.034, sx: 0.32 },
        // Corona en abanico
        { x: -0.1, y: 0.1, z: 0.02, rx: -0.95, rz: 0.55, len: 0.18, r: 0.036, sx: 0.26 },
        { x: -0.06, y: 0.12, z: -0.02, rx: -1.15, rz: 0.32, len: 0.22, r: 0.038, sx: 0.26 },
        { x: -0.025, y: 0.13, z: -0.04, rx: -1.25, rz: 0.12, len: 0.24, r: 0.04, sx: 0.28 },
        { x: 0, y: 0.14, z: -0.05, rx: -1.32, len: 0.28, r: 0.042, sx: 0.3 },
        { x: 0.025, y: 0.13, z: -0.04, rx: -1.25, rz: -0.12, len: 0.24, r: 0.04, sx: 0.28 },
        { x: 0.06, y: 0.12, z: -0.02, rx: -1.15, rz: -0.32, len: 0.22, r: 0.038, sx: 0.26 },
        { x: 0.1, y: 0.1, z: 0.02, rx: -0.95, rz: -0.55, len: 0.18, r: 0.036, sx: 0.26 },
        // Laterales oreja
        { x: -0.12, y: 0.08, z: 0.04, rx: -0.35, rz: 0.9, len: 0.12, r: 0.03, sx: 0.28 },
        { x: 0.12, y: 0.08, z: 0.04, rx: -0.35, rz: -0.9, len: 0.12, r: 0.03, sx: 0.28 },
      ],
      "hair_veg"
    );
  } else if (t === "namek" || t === "piccolo" || t === "nail" || t === "dende" || t === "turban") {
    if (t !== "turban") {
    for (const side of [-1, 1]) {
        const ant = loftMesh(
          [sc.antR * s, sc.antR * 0.85 * s, sc.antR * 0.65 * s],
          sc.antLen * s,
          hc,
          { radial: 8 }
        );
        ant.position.set(side * sc.antSpread * s, 0.18 * s, 0.06 * s);
      ant.rotation.z = side * -0.28;
      ant.rotation.x = -0.35;
        tagHair(ant, `ant_${side > 0 ? "R" : "L"}`);
      }
    }
    if (t === "piccolo" || t === "turban" || look.turban) {
      const cloth = surf(look.turbanC ?? look.cape ?? 0xf5f5f5, { roughness: 0.88 });
      const wrap = loftMesh(
        [0.05, 0.14, 0.175, 0.19, 0.18, 0.14, 0.06].map((r) => r * s),
        0.3 * s,
        cloth,
        { radial: 20, sz: 1.06 }
      );
      wrap.position.y = 0.06 * s;
      wrap.userData.moldId = "turban";
      wrap.userData.moldFamily = "cloth";
      hairRoot.add(wrap);
      const fold = loftMesh(
        [0.08, 0.11, 0.1, 0.07].map((r) => r * s),
        0.1 * s,
        cloth,
        { radial: 14, sx: 1.15, sz: 0.85 }
      );
      fold.position.set(0.04 * s, 0.08 * s, 0);
      fold.userData.moldId = "turban_fold";
      fold.userData.moldFamily = "cloth";
      hairRoot.add(fold);
      const band = loftMesh(
        [0.16, 0.175, 0.17, 0.155].map((r) => r * s),
        0.07 * s,
        cloth,
        { radial: 20 }
      );
      band.position.y = 0.02 * s;
      band.userData.moldId = "turban_band";
      band.userData.moldFamily = "cloth";
      hairRoot.add(band);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 12, 10), cloth);
      knot.position.set(0, 0.02 * s, 0.16 * s);
      knot.scale.set(1.35, 0.7, 0.85);
      knot.userData.moldId = "turban_knot";
      knot.userData.moldFamily = "cloth";
      hairRoot.add(knot);
    }
  } else if (t === "tien") {
    /* calvo */
  } else if (t === "helm" || t === "recoome" || t === "cui" || t === "appule") {
    const helm = new THREE.Mesh(
      latheProfile(
        [
          [0.02 * s, 0.14 * s],
          [0.15 * s, 0.12 * s],
          [0.175 * s, 0.02 * s],
          [0.16 * s, -0.06 * s],
          [0.08 * s, -0.1 * s],
        ],
        18
      ),
      surf(look.helm ?? look.hairC ?? 0x37474f, { roughness: 0.45, metalness: 0.18 })
    );
    helm.position.y = 0.02 * s;
    helm.userData.moldId = "helm";
    helm.userData.moldFamily = "cloth";
    hairRoot.add(helm);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 * s, 0.04 * s, 0.06 * s, 2, 1, 1),
      surf(0x263238, { roughness: 0.35, metalness: 0.45 })
    );
    visor.position.set(0.12, 0.02 * s, 0.14 * s);
    visor.userData.moldId = "visor";
    visor.userData.moldFamily = "cloth";
    hairRoot.add(visor);
  } else if (t === "horns" || t === "frieza") {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s * hr, 0.2 * s * hl, 12), hc);
      horn.position.set(side * 0.11 * s, 0.11 * s, 0);
      horn.rotation.z = side * 0.55;
      tagHair(horn, `horn_${side > 0 ? "R" : "L"}`);
    }
  }
}

function addFace(headG, s, look, sc = DEFAULT_SCULPT) {
  const hk = (sc.headR || 0.16) / 0.16;
  const hsx = sc.headSx || 1;
  const hsy = sc.headSy || 1;
  const hsz = sc.headSz || 1;
  const lidM = surf(look.hairC ?? 0x1a1208, { roughness: 0.55 });
  const lineM = surf(0x1a1208, { roughness: 0.5 });

  if (sc.eyeType !== "none") {
    const eyeM = surf(look.iris ?? 0x212121, { roughness: 0.35 });
    const whiteM = surf(look.eyeWhite ?? 0xfafafa, { roughness: 0.4 });
    const hiM = surf(0xffffff, { roughness: 0.15 });
    const pupilM = surf(0x0a0a0a, { roughness: 0.3 });
    const narrow = sc.eyeType === "narrow";
    const wide = sc.eyeType === "wide";
    const soft = sc.eyeType === "soft";
    const sharp = sc.eyeType === "sharp" || sc.eyeType === "anime";
    const dot = sc.eyeType === "dot";
    const wR = (dot ? sc.eyeWhiteR * 0.45 : sc.eyeWhiteR) * (wide ? 1.25 : narrow ? 0.75 : 1);
    const iR = (dot ? sc.eyeIrisR * 0.7 : sc.eyeIrisR) * (wide ? 1.15 : narrow ? 0.7 : sharp ? 1.15 : 1);
    const sy = sc.eyeSy * (narrow ? 0.5 : wide ? 1.2 : soft ? 1.05 : sharp ? 0.92 : 1);
    const sx = sc.eyeSx * (sharp ? 1.25 : soft ? 1.1 : 1);
    for (const side of [-1, 1]) {
      const sideK = side > 0 ? "R" : "L";
      const ex = side * sc.eyeSep * s * hsx * hk;
      const ey = sc.eyeY * s * hsy * hk;
      const ez = sc.eyeZ * s * hsz * hk;
      const tilt = side * (sc.eyeTilt || 0);
      if (!dot) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(wR * s * hk, GEO.eye[0], GEO.eye[1]), whiteM);
        w.position.set(ex, ey, ez);
        w.scale.set(sx, sy, sharp ? 0.42 : 0.55);
        w.rotation.z = tilt + (sharp ? side * -0.08 : 0);
        w.userData.moldId = `eye_${sideK}_w`;
        w.userData.moldFamily = "eye";
        w.userData.faceHandle = `eye_${sideK}`;
        headG.add(w);
        // Delineado / párpado superior (anime)
        if ((sc.lid ?? 0) > 0.05 && !dot) {
          const lAmt = sc.lid;
          const lSx = (sc.lidSx ?? 1) * sx * (1 + 0.08 * lAmt);
          const lSy = (sc.lidSy ?? 1) * sy * (0.35 + 0.35 * lAmt);
          const lid = new THREE.Mesh(
            new THREE.SphereGeometry(
              wR * s * hk * (1.02 + 0.06 * lAmt),
              GEO.eyeLid[0],
              GEO.eyeLid[1],
              0,
              Math.PI * 2,
              0,
              Math.PI * (0.38 + 0.12 * lAmt)
            ),
            lidM
          );
          lid.position.set(
            ex + side * (sc.lidX || 0) * s * hsx * hk,
            ey + wR * s * (0.28 + 0.2 * lAmt) * sy + (sc.lidY || 0) * s * hsy * hk,
            ez + 0.002 * s + (sc.lidZ || 0) * s * hsz * hk
          );
          lid.scale.set(lSx, lSy, 0.45 + 0.15 * lAmt);
          lid.rotation.z = tilt + side * (sc.lidTilt ?? -0.12);
          lid.userData.moldId = `eye_${sideK}_lid`;
          lid.userData.moldFamily = "eye";
          lid.userData.faceHandle = `lid_${sideK}`;
          headG.add(lid);
        }
      }
      const ix = side * (sc.irisSep ?? sc.eyeSep) * s * hsx * hk;
      const iy = (sc.irisY ?? sc.eyeY) * s * hsy * hk;
      const iz = (sc.irisZ ?? sc.eyeZ + 0.025) * s * hsz * hk;
      const e = new THREE.Mesh(new THREE.SphereGeometry(iR * s * hk, GEO.iris[0], GEO.iris[1]), eyeM);
      e.position.set(ix, iy, iz);
      e.scale.set(narrow ? 1.15 : 1, narrow ? 0.55 : soft ? 1.05 : 1, 1);
      e.rotation.z = tilt;
      e.userData.moldId = `eye_${sideK}_i`;
      e.userData.moldFamily = "eye";
      e.userData.faceHandle = `iris_${sideK}`;
      headG.add(e);
      if (!dot) {
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(iR * s * hk * 0.42, GEO.pupil[0], GEO.pupil[1]), pupilM);
        pupil.position.set(ix, iy, iz + 0.008 * s);
        pupil.userData.moldId = `eye_${sideK}_p`;
        pupil.userData.moldFamily = "eye";
        headG.add(pupil);
        const hi = new THREE.Mesh(new THREE.SphereGeometry(iR * s * hk * 0.22, GEO.highlight[0], GEO.highlight[1]), hiM);
        hi.position.set(ix - side * iR * s * 0.25, iy + iR * s * 0.28, iz + 0.014 * s);
        hi.userData.moldId = `eye_${sideK}_h`;
        hi.userData.moldFamily = "eye";
        headG.add(hi);
      }
    }
  }

  if (sc.brow > 0.05) {
    const browM = surf(look.hairC ?? 0x1a1208, { roughness: 0.65 });
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.008 * s * sc.brow, 0.04 * s * sc.brow, 4, 8),
        browM
      );
      b.rotation.z = Math.PI / 2 + side * (sc.browTilt ?? -0.35);
      b.position.set(
        side * (sc.eyeSep + (sc.browX || 0)) * s,
        sc.eyeY * s + (sc.browY ?? 0.038) * s,
        sc.eyeZ * s - 0.01 * s + (sc.browZ || 0) * s
      );
      b.userData.moldId = `brow_${side > 0 ? "R" : "L"}`;
      b.userData.moldFamily = "face";
      headG.add(b);
    }
  }

  const noseOn = sc.noseType && sc.noseType !== "none";
  if (noseOn || sc.nose > 0.05) {
    const skinN = surf(look.noseC ?? look.skin, { roughness: 0.75 });
    const n = Math.max(0.25, sc.nose || 0.45);
    const nx = (sc.noseX || 0) * s;
    const ny = sc.eyeY * s - 0.025 * s + (sc.noseY || 0) * s;
    const nz = sc.eyeZ * s + 0.025 * s + (sc.noseZ || 0) * s;
    const nt = noseOn ? sc.noseType : "bulb";
    let nose;
    if (nt === "anime") {
      // Cuña anime: pequeña y afilada
      nose = new THREE.Mesh(new THREE.ConeGeometry(0.014 * s * n, 0.032 * s * n, 5), skinN);
      nose.rotation.x = Math.PI / 2;
      nose.scale.set(0.55, 1, 0.85);
      nose.position.set(0, ny, nz + 0.01 * s);
    } else if (nt === "button") {
      nose = new THREE.Mesh(new THREE.SphereGeometry(0.012 * s * n, 10, 8), skinN);
      nose.scale.set(1.1, 0.85, 1.15);
      nose.position.set(0, ny - 0.005 * s, nz + 0.012 * s);
    } else if (nt === "soft") {
      nose = new THREE.Mesh(new THREE.SphereGeometry(0.017 * s * n, 12, 10), skinN);
      nose.scale.set(0.65, 1.15, 1.2);
      nose.position.set(0, ny, nz + 0.008 * s);
    } else if (nt === "hook") {
      nose = new THREE.Mesh(new THREE.SphereGeometry(0.016 * s * n, 10, 8), skinN);
      nose.scale.set(0.55, 1.4, 1.3);
      nose.rotation.x = 0.55;
      nose.position.set(0, ny - 0.012 * s, nz + 0.012 * s);
    } else if (nt === "flat") {
      nose = new THREE.Mesh(new THREE.BoxGeometry(0.038 * s * n, 0.014 * s * n, 0.022 * s * n), skinN);
      nose.position.set(0, ny, nz + 0.008 * s);
    } else if (nt === "ridge") {
      nose = new THREE.Mesh(new THREE.BoxGeometry(0.016 * s * n, 0.04 * s * n, 0.02 * s * n), skinN);
      nose.position.set(0, ny + 0.008 * s, nz + 0.006 * s);
      nose.rotation.x = 0.25;
    } else if (nt === "namek") {
      const gN = new THREE.Group();
      for (const side of [-1, 1]) {
        const slit = new THREE.Mesh(new THREE.SphereGeometry(0.007 * s * n, 8, 6), skinN);
        slit.position.set(side * 0.012 * s, 0, 0.006 * s);
        slit.scale.set(0.7, 1.4, 0.6);
        gN.add(slit);
      }
      gN.position.set(nx, ny, nz);
      gN.userData.moldId = "nose";
      gN.userData.moldFamily = "face";
      headG.add(gN);
    } else {
      nose = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s * n, 10, 8), skinN);
      nose.scale.set(0.7, 1, 1.15);
      nose.position.set(0, ny, nz);
    }
    if (nose) {
      nose.position.x += nx;
      nose.userData.moldId = "nose";
      nose.userData.moldFamily = "face";
      headG.add(nose);
    }
  }

  const mt = sc.mouthType || "line";
  if (mt !== "none" && sc.mouth > 0.05) {
    const mw = Math.max(0.25, sc.mouth || 0.55);
    const mx = (sc.mouthX || 0) * s;
    const my = sc.eyeY * s - 0.055 * s + (sc.mouthY || 0) * s;
    const mz = sc.eyeZ * s + 0.015 * s + (sc.mouthZ || 0) * s;
    const lip = surf(0x6d4c41, { roughness: 0.55 });
    const dark = surf(0x3e2723, { roughness: 0.5 });
    if (mt === "smile") {
      for (const side of [-1, 1]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.028 * s * mw, 0.005 * s, 6, 12, Math.PI * 0.55), lineM);
        arc.rotation.set(0.2, 0, side * 0.15 - Math.PI * 0.5);
        arc.position.set(mx + side * 0.012 * s, my, mz);
        arc.userData.moldId = `mouth_${side > 0 ? "R" : "L"}`;
        arc.userData.moldFamily = "face";
        headG.add(arc);
      }
    } else if (mt === "frown") {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.03 * s * mw, 0.005 * s, 6, 14, Math.PI * 0.7), lineM);
      arc.rotation.set(Math.PI + 0.15, 0, 0);
      arc.position.set(mx, my + 0.008 * s, mz);
      arc.userData.moldId = "mouth";
      arc.userData.moldFamily = "face";
      headG.add(arc);
    } else if (mt === "open") {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s * mw, 12, 10), dark);
      m.scale.set(1.35, 0.7, 0.55);
      m.position.set(mx, my, mz);
      m.userData.moldId = "mouth";
      m.userData.moldFamily = "face";
      headG.add(m);
      const lipT = new THREE.Mesh(new THREE.TorusGeometry(0.024 * s * mw, 0.004 * s, 6, 14), lip);
      lipT.rotation.x = Math.PI / 2;
      lipT.position.set(mx, my, mz + 0.002 * s);
      lipT.scale.set(1.1, 0.7, 1);
      headG.add(lipT);
    } else if (mt === "grit") {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s * mw, 0.014 * s, 0.012 * s), dark);
      m.position.set(mx, my, mz);
      m.userData.moldId = "mouth";
      m.userData.moldFamily = "face";
      headG.add(m);
      for (let i = 0; i < 4; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.008 * s, 0.008 * s, 0.006 * s), surf(0xf5f5f5, { roughness: 0.4 }));
        tooth.position.set(mx + (i - 1.5) * 0.012 * s * mw, my + 0.002 * s, mz + 0.004 * s);
        headG.add(tooth);
      }
    } else if (mt === "smirk") {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.026 * s * mw, 0.005 * s, 6, 12, Math.PI * 0.5), lineM);
      arc.rotation.set(0.25, 0.15, -0.4);
      arc.position.set(mx + 0.01 * s, my, mz);
      arc.userData.moldId = "mouth";
      arc.userData.moldFamily = "face";
      headG.add(arc);
    } else {
      // line
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.004 * s, 0.038 * s * mw, 4, 8), lineM);
      m.rotation.z = Math.PI / 2;
      m.position.set(mx, my, mz);
      m.userData.moldId = "mouth";
      m.userData.moldFamily = "face";
      headG.add(m);
    }
  }

  if (look.hair === "bald") {
    const eyeM = surf(0x212121, { roughness: 0.4 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.012 * s, 10, 8), eyeM);
      d.position.set(Math.cos(a) * 0.06 * s, 0.12 * s, Math.sin(a) * 0.04 * s);
      headG.add(d);
    }
  }
  if (look.thirdEye || sc.thirdEye > 0.5) {
    const whiteM = surf(look.eyeWhite ?? 0xfafafa, { roughness: 0.4 });
    const eyeM = surf(look.iris ?? 0x212121, { roughness: 0.35 });
    const w3 = new THREE.Mesh(new THREE.SphereGeometry(0.026 * s, 12, 10), whiteM);
    w3.position.set(0, 0.075 * s, 0.125 * s);
    w3.scale.set(1.05, 0.8, 0.45);
    headG.add(w3);
    const e3 = new THREE.Mesh(new THREE.SphereGeometry(0.013 * s, 12, 10), eyeM);
    e3.position.set(0, 0.075 * s, 0.148 * s);
    headG.add(e3);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.005 * s, 8, 6), surf(0xffffff, { roughness: 0.15 }));
    hi.position.set(-0.005 * s, 0.08 * s, 0.155 * s);
    headG.add(hi);
  }
  // Gema frontal: independiente de kit y de peinado
  if ((sc.showFaceGem ?? 0) > 0.5) {
    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * s, 16, 14),
      surf(look.accent ?? 0xab47bc, {
        roughness: 0.25,
        metalness: 0.35,
        emissive: 0x4a148c,
        emissiveIntensity: 0.35,
      })
    );
    gem.position.set(
      (sc.faceGemX || 0) * s,
      (0.02 + (sc.faceGemY || 0)) * s,
      (0.15 + (sc.faceGemZ || 0)) * s
    );
    gem.scale.set(sc.faceGemSx ?? 1, sc.faceGemSy ?? 1, sc.faceGemSz ?? 1);
    gem.userData.moldId = "gem";
    gem.userData.moldFamily = "face";
    headG.add(gem);
  }
}

function squashHeadHalves(geo, sc) {
  const tx = sc.headTopSx ?? 1;
  const ty = sc.headTopSy ?? 1;
  const tz = sc.headTopSz ?? 1;
  const bx = sc.headBotSx ?? 1;
  const by = sc.headBotSy ?? 1;
  const bz = sc.headBotSz ?? 1;
  if (tx === 1 && ty === 1 && tz === 1 && bx === 1 && by === 1 && bz === 1) return;
  geo.computeBoundingBox();
  const minY = geo.boundingBox.min.y;
  const maxY = geo.boundingBox.max.y;
  const span = Math.max(1e-6, maxY - minY);
  const mid = (minY + maxY) * 0.5;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u = (y - minY) / span;
    u = u * u * (3 - 2 * u);
    pos.setXYZ(i, x * (bx + (tx - bx) * u), mid + (y - mid) * (by + (ty - by) * u), z * (bz + (tz - bz) * u));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function makeHeadShell(sc, s, skin) {
  const r = sc.headR * s;
  const type = sc.headType || "sphere";
  let geo;
  if (type === "oval") {
    geo = new THREE.SphereGeometry(r, GEO.head[0], GEO.head[1]);
    geo.scale(0.86, 1.2, 0.96);
  } else if (type === "capsule") {
    geo = new THREE.CapsuleGeometry(r * 0.78, r * 0.58, 12, 28);
  } else if (type === "pill") {
    const pts = [
      new THREE.Vector2(0.001, -r * 1.05),
      new THREE.Vector2(r * 0.62, -r * 1.02),
      new THREE.Vector2(r * 0.88, -r * 0.82),
      new THREE.Vector2(r * 0.94, -r * 0.38),
      new THREE.Vector2(r * 0.94, r * 0.38),
      new THREE.Vector2(r * 0.88, r * 0.82),
      new THREE.Vector2(r * 0.62, r * 1.02),
      new THREE.Vector2(0.001, r * 1.05),
    ];
    geo = new THREE.LatheGeometry(pts, 24);
    geo.scale(1.08, 1, 0.72);
  } else if (type === "block") {
    const sx = r * 1.7;
    const sy = r * 1.9;
    const sz = r * 1.58;
    const rad = 0.48 * Math.min(sx, sy, sz) * 0.5;
    geo = new THREE.BoxGeometry(sx, sy, sz, 10, 12, 10);
    const hw = sx * 0.5 - rad;
    const hh = sy * 0.5 - rad;
    const hd = sz * 0.5 - rad;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const cx = THREE.MathUtils.clamp(x, -hw, hw);
      const cy = THREE.MathUtils.clamp(y, -hh, hh);
      const cz = THREE.MathUtils.clamp(z, -hd, hd);
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const len = Math.hypot(dx, dy, dz) || 1;
      pos.setXYZ(i, cx + (dx / len) * rad, cy + (dy / len) * rad, cz + (dz / len) * rad);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  } else if (type === "skull") {
    const pts = [
      new THREE.Vector2(0.001, -r * 1.1),
      new THREE.Vector2(r * 0.26, -r * 1.04),
      new THREE.Vector2(r * 0.46, -r * 0.82),
      new THREE.Vector2(r * 0.6, -r * 0.48),
      new THREE.Vector2(r * 0.76, -r * 0.06),
      new THREE.Vector2(r * 0.84, r * 0.28),
      new THREE.Vector2(r * 0.7, r * 0.76),
      new THREE.Vector2(r * 0.34, r * 1.06),
      new THREE.Vector2(0.001, r * 1.12),
    ];
    geo = new THREE.LatheGeometry(pts, 24);
    geo.scale(1, 1, 0.86);
  } else {
    geo = new THREE.SphereGeometry(r, GEO.head[0], GEO.head[1]);
  }
  squashHeadHalves(geo, sc);
  const head = new THREE.Mesh(geo, skin);
  head.scale.set(sc.headSx, sc.headSy, sc.headSz);
  head.castShadow = true;
  head.userData.moldId = "head";
  head.userData.moldFamily = "head";
  return head;
}

function addEars(headG, s, skin, sc) {
  if (sc.earType === "none") return;
  for (const side of [-1, 1]) {
    let ear;
    if (sc.earType === "pointed") {
      ear = new THREE.Mesh(new THREE.ConeGeometry(sc.earR * s, sc.earR * 2.2 * s, 10), skin);
      ear.rotation.z = side * 0.9;
      ear.rotation.x = -0.2;
    } else if (sc.earType === "wide") {
      ear = new THREE.Mesh(new THREE.SphereGeometry(sc.earR * 1.15 * s, 12, 10), skin);
      ear.scale.set(sc.earSx * 0.4, sc.earSy * 1.1, sc.earSz * 1.4);
    } else {
      ear = new THREE.Mesh(new THREE.SphereGeometry(sc.earR * s, 14, 12), skin);
      ear.scale.set(sc.earSx, sc.earSy, sc.earSz);
    }
    ear.position.set(side * sc.earX * s, 0, 0);
    ear.userData.moldId = `ear_${side > 0 ? "R" : "L"}`;
    ear.userData.moldFamily = "ear";
    headG.add(ear);
  }
}

function addPecs(torsoG, s, waistY, torsoC, sc, brute, ty = 0) {
  if (sc.pecType === "none") return;
  const y = sc.pecY * s - waistY + ty;
  const z = sc.pecZ * s;
  const sep = sc.pecSep * s;
  const sx = (brute ? 1.1 : 1) * sc.pecSx;
  const sy = sc.pecSy;
  const sz = sc.pecSz;
  const tag = (pec, id) => {
    pec.userData.moldId = id;
    pec.userData.moldFamily = "pec";
    torsoG.add(pec);
  };
  if (sc.pecType === "flat") {
    for (const side of [-1, 1]) {
      const pec = new THREE.Mesh(
        new THREE.BoxGeometry(sc.pecR * 2.4 * s, sc.pecR * 1.6 * s, sc.pecR * 1.1 * s),
        torsoC
      );
      pec.position.set(side * sep, y, z);
      pec.scale.set(sx * 0.85, sy * 0.7, sz);
      tag(pec, `pec_${side > 0 ? "R" : "L"}`);
    }
    return;
  }
  if (sc.pecType === "split") {
    for (const side of [-1, 1]) {
      for (const row of [0, 1]) {
        const pec = new THREE.Mesh(new THREE.SphereGeometry(sc.pecR * 0.72 * s, 12, 10), torsoC);
        pec.position.set(side * sep * (0.85 + row * 0.15), y - row * 0.04 * s, z + row * 0.01 * s);
        pec.scale.set(sx, sy * 0.85, sz);
        tag(pec, `pec_${side > 0 ? "R" : "L"}_${row}`);
      }
    }
    return;
  }
  if (sc.pecType === "armor") {
    for (const side of [-1, 1]) {
      const pec = new THREE.Mesh(
        new THREE.SphereGeometry(sc.pecR * 1.1 * s, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        torsoC
      );
      pec.position.set(side * sep, y, z);
      pec.rotation.x = 0.35;
      pec.scale.set(sx, sy * 0.8, sz);
      tag(pec, `pec_${side > 0 ? "R" : "L"}`);
    }
    return;
  }
  for (const side of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.SphereGeometry(sc.pecR * s, 14, 12), torsoC);
    pec.position.set(side * sep, y, z);
    pec.scale.set(sx, sy, sz);
    tag(pec, `pec_${side > 0 ? "R" : "L"}`);
  }
}

function tagCloth(m, id) {
  m.userData.moldId = id;
  m.userData.moldFamily = "cloth";
  return m;
}

/** Gi clásico: interior en V, solapas cruzadas, cuello y faldones. */
function addGiDetails(torsoG, s, waistY, ty, sc, shirtM, underM, sashM) {
  const y0 = 0.92 * s - waistY + ty;
  if (sc.showUnder > 0.5) {
    const undershirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11 * s, 0.13 * s, 0.32 * s, 16),
      underM
    );
    undershirt.position.set(
      (sc.underX || 0) * s,
      y0 + (sc.underY || 0) * s,
      0.02 * s + (sc.underZ || 0) * s
    );
    undershirt.scale.set(sc.underSx ?? 1, sc.underSy ?? 1, sc.underSz ?? 1.05);
    wrinkleClothMesh(undershirt, 0.9);
    torsoG.add(tagCloth(undershirt, "undershirt"));
    // Escote en V
    for (const side of [-1, 1]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.2 * s, 0.04 * s), underM);
      v.position.set(side * 0.04 * s, y0 + 0.12 * s, 0.12 * s);
      v.rotation.z = side * 0.55;
      torsoG.add(tagCloth(v, `gi_v_${side > 0 ? "R" : "L"}`));
    }
  }
  if (sc.showLapels > 0.5) {
    // Solapas cruzadas: cada una inclina HACIA el centro (−side), no hacia afuera
    for (const side of [-1, 1]) {
      const over = side < 0; // izquierda encima (estilo gi)
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.44 * s, 0.05 * s), shirtM);
      lapel.position.set(side * 0.05 * s, y0 + 0.05 * s, 0.125 * s + (over ? 0.018 * s : 0));
      lapel.rotation.z = -side * 0.45;
      lapel.rotation.x = -0.06;
      wrinkleClothMesh(lapel, 1.1);
      torsoG.add(tagCloth(lapel, `gi_lapel_${side > 0 ? "R" : "L"}`));
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.022 * s, 0.42 * s, 0.018 * s), shirtM);
      edge.position.set(side * 0.02 * s, y0 + 0.04 * s, 0.15 * s + (over ? 0.018 * s : 0));
      edge.rotation.z = -side * 0.45;
      torsoG.add(tagCloth(edge, `gi_lapel_edge_${side > 0 ? "R" : "L"}`));
    }
    // Cuello alto
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13 * s, 0.03 * s, 8, 16, Math.PI * 1.15), shirtM);
    collar.rotation.x = 0.85;
    collar.position.set(0, y0 + 0.28 * s, 0.02 * s);
    torsoG.add(tagCloth(collar, "gi_collar"));
  }
  // Faldones + pliegues verticales suaves
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.26 * s, 0.04 * s), shirtM);
    flap.position.set(side * 0.09 * s, 0.52 * s - waistY + ty, 0.11 * s);
    flap.rotation.z = -side * 0.08;
    flap.rotation.x = 0.1;
    wrinkleClothMesh(flap, 1.2);
    torsoG.add(tagCloth(flap, `gi_flap_${side > 0 ? "R" : "L"}`));
    // Pliegue suelto delantero
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.035 * s, 0.2 * s, 0.025 * s), shirtM);
    fold.position.set(side * 0.05 * s, 0.58 * s - waistY + ty, 0.14 * s);
    fold.rotation.z = -side * 0.15;
    torsoG.add(tagCloth(fold, `gi_fold_${side > 0 ? "R" : "L"}`));
  }
  // Nudo del fajín más grueso (extra si hay sash)
  if (sc.showSash > 0.5) {
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.06 * s, 0.05 * s), sashM);
    bow.position.set(0, 0.72 * s - waistY + ty + (sc.sashY || 0) * s, 0.17 * s);
    torsoG.add(tagCloth(bow, "gi_sash_bow"));
  }
}

function addArmorPlate(torsoG, s, waistY, ty, sc, plateM, force = false, extras = {}) {
  const pt = sc.plateType || "dome";
  if (pt === "none") return;
  if (!force && sc.showPlate < 0.5) return;
  const y = 1.02 * s - waistY + ty + (sc.plateY || 0) * s;
  const x = (sc.plateX || 0) * s;
  const z = (sc.plateZ || 0) * s;
  const sx = sc.plateSx ?? 1;
  const sy = sc.plateSy ?? 1;
  const sz = sc.plateSz ?? 1;
  const put = (mesh, id) => {
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    torsoG.add(tagCloth(mesh, id));
  };
  if (pt === "elite") {
    addEliteBreastplate(torsoG, s, x, y, z, sx, sy, sz, {
      ...extras,
      pecW: extras.pecW ?? 1.18,
      absW: extras.absW ?? extras.pecW ?? 1.1,
      torsoSz: extras.torsoSz ?? 1,
      torsoMul: extras.torsoMul ?? 0.15,
      torsoLen: extras.torsoLen ?? 0.55,
      clothFit: extras.clothFit ?? 1.12,
    });
    return;
  }
  if (pt === "flat") {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.22 * s, 0.06 * s), plateM);
    plate.rotation.x = 0.08;
    put(plate, "armor_plate");
    return;
  }
  if (pt === "split") {
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 * s, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        plateM
      );
      plate.position.set(x + side * 0.1 * s, y, z);
      plate.scale.set(sx * 0.95, sy, sz);
      plate.rotation.x = 0.2;
      torsoG.add(tagCloth(plate, `armor_plate_${side > 0 ? "R" : "L"}`));
    }
    return;
  }
  if (pt === "ribbed") {
    const plate = new THREE.Mesh(
      new THREE.SphereGeometry(0.185 * s, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
      plateM
    );
    plate.rotation.x = 0.15;
    put(plate, "armor_plate");
    for (let i = -2; i <= 2; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018 * s, 0.16 * s, 0.035 * s), plateM);
      rib.position.set(x + i * 0.055 * s, y - 0.02 * s, z + 0.12 * s);
      rib.scale.set(1, sy, 1);
      torsoG.add(tagCloth(rib, `armor_rib_${i}`));
    }
    return;
  }
  // dome
  const plate = new THREE.Mesh(
    new THREE.SphereGeometry(0.185 * s, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    plateM
  );
  plate.rotation.x = 0.15;
  put(plate, "armor_plate");
}

/** Pechera Nappa/Saiyan: unwrap (u=0 espalda, u=0.5 frente), alta resolución. */
const _eliteChestTexCache = new Map();
function eliteBreastplateTex(fillHex, ribHex, opts = {}) {
  const borderW = Math.max(0.03, Math.min(0.18, opts.borderW ?? 0.08));
  const ribs = Math.max(3, Math.min(12, (opts.ribs ?? 7) | 0));
  const absWFrac = Math.max(0.06, Math.min(0.4, opts.absW ?? 0.17));
  const absArchFrac = Math.max(0.02, Math.min(0.22, opts.absArch ?? 0.085));
  const absGapFrac = Math.max(0, Math.min(0.35, opts.absGap ?? 0.22));
  const pecBotFrac = Math.max(0.25, Math.min(0.6, opts.pecBot ?? 0.38));
  const pecSpanFrac = Math.max(0.14, Math.min(0.5, opts.pecSpan ?? 0.28));
  const key = `wrap16|${fillHex >>> 0}|${ribHex >>> 0}|${borderW.toFixed(3)}|${ribs}|${absWFrac.toFixed(3)}|${absArchFrac.toFixed(3)}|${absGapFrac.toFixed(3)}|${pecBotFrac.toFixed(3)}|${pecSpanFrac.toFixed(3)}`;
  if (_eliteChestTexCache.has(key)) return _eliteChestTexCache.get(key);

  const w = 1024;
  const h = 768;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  // Solo remapear blanco/crema → azul default; negro y colores saturados se respetan
  let fr = ((fillHex >> 16) & 255) / 255;
  let fg = ((fillHex >> 8) & 255) / 255;
  let fb = (fillHex & 255) / 255;
  const lum = 0.2126 * fr + 0.7152 * fg + 0.0722 * fb;
  if (lum > 0.72) fillHex = 0x1a3a6e;
  let rr = ((ribHex >> 16) & 255) / 255;
  let rg = ((ribHex >> 8) & 255) / 255;
  let rb = (ribHex & 255) / 255;
  // Abs: solo forzar oro si viene casi negro (invisible); gris/negro medio OK
  if (0.2126 * rr + 0.7152 * rg + 0.0722 * rb < 0.06) ribHex = 0xffc107;
  const fill = `#${(fillHex >>> 0).toString(16).padStart(6, "0")}`;
  const fillDark = (() => {
    const r = Math.max(0, ((fillHex >> 16) & 255) - 28);
    const g = Math.max(0, ((fillHex >> 8) & 255) - 22);
    const b = Math.max(0, (fillHex & 255) - 18);
    return `rgb(${r},${g},${b})`;
  })();
  const fillLite = (() => {
    const r = Math.min(255, ((fillHex >> 16) & 255) + 36);
    const g = Math.min(255, ((fillHex >> 8) & 255) + 32);
    const b = Math.min(255, (fillHex & 255) + 40);
    return `rgb(${r},${g},${b})`;
  })();
  const rib = `#${(ribHex >>> 0).toString(16).padStart(6, "0")}`;
  const ribDark = "#c79100";
  const ribLite = "#ffe082";
  const white = "#f5f5f5";
  const bw = Math.max(10, borderW * w * 0.85);

  ctx.clearRect(0, 0, w, h);

  // Base wrap: TODO azul (espalda + costados). El oro NO circunnavega.
  const gBack = ctx.createLinearGradient(0, 0, 0, h);
  gBack.addColorStop(0, fillLite);
  gBack.addColorStop(0.45, fill);
  gBack.addColorStop(1, fillDark);
  ctx.fillStyle = gBack;
  ctx.fillRect(0, 0, w, h);

  const sideShade = ctx.createLinearGradient(0, 0, w, 0);
  sideShade.addColorStop(0, "rgba(0,0,0,0.26)");
  sideShade.addColorStop(0.2, "rgba(0,0,0,0)");
  sideShade.addColorStop(0.8, "rgba(0,0,0,0)");
  sideShade.addColorStop(1, "rgba(0,0,0,0.26)");
  ctx.fillStyle = sideShade;
  ctx.fillRect(0, 0, w, h);

  // Nervaduras espalda: ~2/3 del ancho (u=0 es centro espalda; no llega a costados)
  const backSpan = w * 0.34;
  const backY0 = h * 0.36;
  const backY1 = h * 0.92;
  const paintBackRibs = (x0, x1) => {
    const ag = ctx.createLinearGradient(0, backY0, 0, backY1);
    ag.addColorStop(0, ribLite);
    ag.addColorStop(0.4, rib);
    ag.addColorStop(1, ribDark);
    ctx.fillStyle = ag;
    ctx.fillRect(x0, backY0, x1 - x0, backY1 - backY0);
    for (let i = 0; i <= ribs + 1; i++) {
      const y = backY0 + ((backY1 - backY0) * i) / (ribs + 1);
      const band = (backY1 - backY0) / (ribs + 1);
      ctx.fillStyle = i % 2 === 0 ? ribLite : rib;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x0, y, x1 - x0, band * 0.55);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(20,12,0,0.5)";
      ctx.lineWidth = Math.max(2, h * 0.0035);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    // Borde blanco donde el oro encuentra el azul
    ctx.strokeStyle = white;
    ctx.lineWidth = bw * 0.45;
    ctx.beginPath();
    ctx.moveTo(x0 < w * 0.5 ? x1 : x0, backY0);
    ctx.lineTo(x0 < w * 0.5 ? x1 : x0, backY1);
    ctx.stroke();
  };
  paintBackRibs(0, backSpan * 0.5);
  paintBackRibs(w - backSpan * 0.5, w);

  // —— Frente —— (pecs solo en el frente; no hacia costados/espalda)
  const cx = w * 0.5;
  const fx0 = cx - w * pecSpanFrac * 0.5;
  const fx1 = cx + w * pecSpanFrac * 0.5;
  const pecTopY = h * 0.1;
  const pecBotY = h * pecBotFrac;
  const strip = bw * 0.55;

  // Pecs primero (fondo recto: no bajan al abs)
  const drawPecHex = (side) => {
    const outer = side < 0 ? fx0 : fx1;
    const inn = side < 0 ? cx - strip * 0.35 : cx + strip * 0.35;
    const midX = side < 0 ? fx0 + (cx - fx0) * 0.55 : fx1 - (fx1 - cx) * 0.55;
    const pts = [
      [inn, pecTopY + h * 0.02],
      [outer + side * w * 0.01, pecTopY + h * 0.04],
      [outer, h * 0.24],
      [outer - side * w * 0.01, pecBotY],
      [inn, pecBotY],
      [inn, h * 0.18],
    ];
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    const inset = bw * 0.72;
    const shrink = (p, toward) => {
      const dx = toward[0] - p[0];
      const dy = toward[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / len) * inset * 0.35, p[1] + (dy / len) * inset * 0.35];
    };
    const center = [midX, (pecTopY + pecBotY) * 0.5];
    const innerPts = pts.map((p) => shrink(p, center));
    for (let i = 0; i < innerPts.length; i++) {
      const ox = (center[0] - pts[i][0]) * 0.08;
      const oy = (center[1] - pts[i][1]) * 0.08;
      innerPts[i][0] += ox;
      innerPts[i][1] += oy;
      if (side < 0) innerPts[i][0] = Math.min(innerPts[i][0], cx - strip * 0.85);
      else innerPts[i][0] = Math.max(innerPts[i][0], cx + strip * 0.85);
    }
    const pecGrad = ctx.createLinearGradient(0, pecTopY, 0, pecBotY);
    pecGrad.addColorStop(0, fillLite);
    pecGrad.addColorStop(0.55, fill);
    pecGrad.addColorStop(1, fillDark);
    ctx.fillStyle = pecGrad;
    ctx.beginPath();
    ctx.moveTo(innerPts[0][0], innerPts[0][1]);
    for (let i = 1; i < innerPts.length; i++) ctx.lineTo(innerPts[i][0], innerPts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(20,20,25,0.55)";
    ctx.lineWidth = Math.max(2, bw * 0.12);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();
  };
  drawPecHex(-1);
  drawPecHex(1);

  // Franja central solo sobre pecs
  ctx.fillStyle = white;
  ctx.fillRect(cx - strip, pecTopY + h * 0.015, strip * 2, pecBotY - pecTopY);

  // Abs anclado abajo (casi en la base de la pechera)
  const absHalf = w * absWFrac * 0.5;
  const absL = cx - absHalf;
  const absR = cx + absHalf;
  const absRx = absHalf;
  const absRy = h * absArchFrac;
  const absBot = h * 0.94;
  // Gap empuja desde los pecs; además no sube del tercio inferior
  const absPeakY = Math.max(
    pecBotY + h * absGapFrac,
    absBot - absRy - h * 0.2
  );
  const absOvalCy = absPeakY + absRy;
  const absPath = (inset = 0) => {
    const rx = Math.max(4, absRx - inset);
    const ry = Math.max(4, absRy - inset * 0.35);
    const cy = absOvalCy + inset * 0.15;
    const bot = absBot - inset * 0.35;
    const L = cx - rx;
    const R = cx + rx;
    ctx.beginPath();
    ctx.moveTo(L, bot);
    ctx.lineTo(L, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, false);
    ctx.lineTo(R, bot);
    ctx.quadraticCurveTo(cx, bot + h * 0.018, L, bot);
    ctx.closePath();
  };
  ctx.fillStyle = white;
  absPath(-bw * 0.38);
  ctx.fill();
  const absGrad = ctx.createLinearGradient(0, absPeakY, 0, absBot);
  absGrad.addColorStop(0, ribLite);
  absGrad.addColorStop(0.4, rib);
  absGrad.addColorStop(1, ribDark);
  ctx.fillStyle = absGrad;
  absPath(bw * 0.2);
  ctx.fill();
  ctx.save();
  absPath(bw * 0.2);
  ctx.clip();
  // Nervaduras en TODO el abs (cima del óvalo → base), no solo la mitad baja
  const ribTop = absPeakY + bw * 0.15;
  for (let i = 1; i <= ribs; i++) {
    const y = ribTop + ((absBot - ribTop - bw * 0.25) * i) / (ribs + 1);
    ctx.strokeStyle = "rgba(25,15,0,0.5)";
    ctx.lineWidth = Math.max(2.5, h * 0.0045);
    ctx.beginPath();
    ctx.moveTo(absL + 8, y);
    ctx.lineTo(absR - 8, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,236,160,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(absL + 8, y + 3);
    ctx.lineTo(absR - 8, y + 3);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(20,20,25,0.5)";
  ctx.lineWidth = Math.max(2, bw * 0.1);
  absPath(-bw * 0.38);
  ctx.stroke();

  // Collar
  ctx.strokeStyle = white;
  ctx.lineWidth = bw * 1.2;
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.085);
  ctx.quadraticCurveTo(cx, h * 0.16, w * 0.66, h * 0.085);
  ctx.stroke();

  // Escote alpha
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(w * 0.34, 0);
  ctx.quadraticCurveTo(cx, h * 0.12, w * 0.66, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = white;
  ctx.lineWidth = bw * 1.15;
  ctx.beginPath();
  ctx.moveTo(w * 0.36, h * 0.09);
  ctx.quadraticCurveTo(cx, h * 0.155, w * 0.64, h * 0.09);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  _eliteChestTexCache.set(key, tex);
  return tex;
}

function lerpEliteProf(profile, t) {
  const n = profile.length;
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(x);
  const f = x - i;
  if (i >= n - 1) return profile[n - 1];
  return profile[i] * (1 - f) + profile[i + 1] * f;
}

/**
 * Coraza alta-poly que copia el loft del torso (mismo perfil + sx/sz del pecho).
 * v=0 cuello (arriba del loft), v=1 cintura — igual que PROF.torso.
 */
function makeEliteCuirassGeo(profile, pecW, absW, torsoSz, inflate = 1.1) {
  const segsU = 112;
  const segsV = Math.max(56, (profile.length - 1) * 12);
  const positions = [];
  const uvs = [];
  const indices = [];
  const sxAt = (v) => {
    const t = v <= 0.28 ? 0 : v >= 0.72 ? 1 : (v - 0.28) / 0.44;
    const e = t * t * (3 - 2 * t);
    return pecW + (absW - pecW) * e;
  };
  const szAt = (v) => sxAt(v) * 0.85 * torsoSz;

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 arriba → 1 abajo (como loft)
    const r = Math.max(0.01, lerpEliteProf(profile, v) * inflate);
    const sx = sxAt(v);
    const sz = szAt(v);
    const y = 0.5 - v;
    // Banda pecho (más alta y marcada que abs)
    const pecBand = Math.exp(-((v - 0.27) ** 2) / 0.032);
    const pecShelf = Math.exp(-((v - 0.22) ** 2) / 0.02); // borde superior placa
    const pecUnder = Math.exp(-((v - 0.4) ** 2) / 0.028); // borde inferior hacia abs
    const absBand = Math.exp(-((v - 0.62) ** 2) / 0.08);
    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const ang = u * Math.PI * 2 + Math.PI;
      const cz = Math.cos(ang); // +Z frente
      const sxn = Math.sin(ang); // ±X
      const front = Math.max(0, cz);
      const side = Math.abs(sxn);
      let rx = r * sx;
      let rz = r * sz;

      // Dos placas pecho hex (solo frente): picos L/R, canal, base en V
      if (front > 0.08 && pecBand > 0.04) {
        const peakL = Math.exp(-((sxn + 0.4) ** 2) / 0.055) * Math.exp(-((cz - 0.86) ** 2) / 0.1);
        const peakR = Math.exp(-((sxn - 0.4) ** 2) / 0.055) * Math.exp(-((cz - 0.86) ** 2) / 0.1);
        const cleft = Math.exp(-(sxn * sxn) / 0.008) * front;
        const pecVol = (peakL + peakR) * pecBand;
        rz += r * pecW * (0.185 * pecVol + 0.045 * pecShelf * front - 0.06 * cleft * pecBand);
        // Base de placa en V: más volumen afuera, baja al centro
        const vEdge = Math.max(0, 1 - Math.abs(sxn) * 1.6);
        rz -= r * 0.045 * pecUnder * front * (0.35 + 0.65 * vEdge);
        // Abrir poco hacia axila (evitar que el pec “circunde” al costado)
        rx += r * pecW * 0.025 * pecBand * side * front;
      }

      // Abs suave adelante
      rz += r * 0.035 * absBand * front;

      // Escote arriba al frente
      if (v < 0.14 && front > 0.25) {
        const cut = (1 - v / 0.14) * (front - 0.25);
        const shrink = 1 - cut * 0.42;
        rx *= shrink;
        rz = rz * shrink - cut * r * 0.12;
      }
      // Sisas (hundir costados arriba)
      if (v < 0.38 && side > 0.65) {
        const arm = ((0.38 - v) / 0.38) * ((side - 0.65) / 0.35);
        rx *= 1 - arm * 0.18;
        rz *= 1 - arm * 0.08;
      }
      positions.push(sxn * rx, y, cz * rz);
      uvs.push(u, 1 - v);
    }
  }
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * (segsU + 1) + iu;
      const b = a + segsU + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Pechera batalla: misma silueta que el torso, por fuera, alta-poly. */
function addEliteBreastplate(torsoG, s, x, y, z, sx, sy, sz, extras = {}) {
  let fillHex = extras.plateHex ?? 0x1a3a6e;
  const fr = ((fillHex >> 16) & 255) / 255;
  const fg = ((fillHex >> 8) & 255) / 255;
  const fb = (fillHex & 255) / 255;
  // Solo blanco/crema → azul default; negro y saturados OK
  if (0.2126 * fr + 0.7152 * fg + 0.0722 * fb > 0.72) fillHex = 0x1a3a6e;
  const ribHex = extras.ribHex ?? 0xffc107;
  const borderW = extras.plateBorder ?? 0.09;
  const map = eliteBreastplateTex(fillHex, ribHex, {
    borderW,
    ribs: extras.plateRibs ?? 7,
    absW: extras.plateAbsW ?? 0.17,
    absArch: extras.plateAbsArch ?? 0.085,
    absGap: extras.plateAbsGap ?? 0.22,
    pecBot: extras.platePecBot ?? 0.38,
    pecSpan: extras.platePecSpan ?? 0.28,
  });
  const mat = gearMat(0xffffff, {
    kind: "armor",
    detail: 0.55,
    map,
    bumpMul: 0.55,
    roughness: 0.32,
    metalness: 0.28,
  });
  mat.side = THREE.DoubleSide;
  mat.transparent = true;
  mat.alphaTest = 0.06;

  const pecW = extras.pecW ?? 1.18;
  const absW = extras.absW ?? pecW * 0.92;
  const torsoSz = extras.torsoSz ?? 1;
  const torsoMul = extras.torsoMul ?? 0.15;
  const clothFit = extras.clothFit ?? 1.12;
  const torsoLen = extras.torsoLen ?? 0.55;
  // Un poco por encima de la capa de ropa/piel
  const inflate = Math.max(1.08, clothFit) * 1.04;
  const profile = mulProfile(PROF.torso, torsoMul * s);

  const g = new THREE.Group();
  // Mismo centro vertical que el loft del torso (plate Y viene ~0.1s más alto)
  g.position.set(x, y - 0.1 * s, z);
  g.scale.set(sx, sy, sz);

  const shell = new THREE.Mesh(
    makeEliteCuirassGeo(profile, pecW, absW, torsoSz, inflate),
    mat
  );
  shell.scale.set(1, torsoLen * s, 1);
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(tagCloth(shell, "armor_elite_shell"));

  torsoG.add(g);
}

function addArmorPads(torsoG, s, waistY, ty, sc, padM, force = false, extras = {}) {
  const pt = sc.padType || "sphere";
  if (pt === "none") return;
  if (!force && sc.showPads < 0.5) return;
  const ps = sc.padScale ?? 0.72;
  const py = 1.18 * s - waistY + ty + (sc.padY || 0) * s;
  const px = (sc.padX || 0) * s;
  const pz = (sc.padZ || 0) * s;
  for (const side of [-1, 1]) {
    const id = `armor_pad_${side > 0 ? "R" : "L"}`;
    const baseX = side * (0.22 * s + px);
    if (pt === "wing") {
      addWingPad(
        torsoG,
        s,
        side,
        baseX,
        py,
        ps,
        {
          ...extras,
          padZ: sc.padZ ?? extras.padZ,
          padBorder: sc.padBorder ?? extras.padBorder,
          padTilt: sc.padTilt ?? extras.padTilt,
          padPitch: sc.padPitch ?? extras.padPitch,
          padArch: sc.padArch ?? extras.padArch,
          padLines: sc.padLines ?? extras.padLines,
          padLineW: sc.padLineW ?? extras.padLineW,
        },
        id
      );
    } else if (pt === "flat") {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s * ps, 0.08 * s * ps, 0.12 * s * ps), padM);
      pad.position.set(baseX, py, pz);
      torsoG.add(tagCloth(pad, id));
    } else if (pt === "spaulder") {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s * ps, 0.07 * s * ps, 0.16 * s * ps), padM);
      pad.position.set(baseX, py, 0.02 * s + pz);
      pad.rotation.z = side * -0.35;
      torsoG.add(tagCloth(pad, id));
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s * ps, 0.035 * s * ps, 0.04 * s * ps), padM);
      lip.position.set(baseX, py + 0.04 * s * ps, 0.06 * s + pz);
      torsoG.add(tagCloth(lip, `${id}_lip`));
    } else if (pt === "spiked") {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s * ps, 14, 12), padM);
      pad.position.set(baseX, py, pz);
      pad.scale.set(1.15, 0.75, 1.05);
      torsoG.add(tagCloth(pad, id));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s * ps, 0.1 * s * ps, 8), padM);
      spike.position.set(baseX, py + 0.08 * s * ps, pz);
      torsoG.add(tagCloth(spike, `${id}_spike`));
    } else {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s * ps, 14, 12), padM);
      pad.position.set(baseX, py, pz);
      pad.scale.set(1.15, 0.75, 1.05);
      torsoG.add(tagCloth(pad, id));
    }
  }
}

/**
 * Hombrera ala (Nappa / Freezer Force): una cáscara curva con dibujo pintado.
 * Sin volumen aparte (ese era el marrón del centro).
 */
function makeWingPadShellGeo(arch = 0.55) {
  const geo = new THREE.PlaneGeometry(2, 2, 40, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    const r2 = x * x + y * y;
    if (r2 > 1) {
      const r = Math.sqrt(r2) || 1;
      pos.setXYZ(i, x / r, y / r, 0);
      continue;
    }
    // Semicápsula hacia arriba (leve cúpula)
    const h = arch * Math.sqrt(Math.max(0, 1 - r2));
    pos.setXYZ(i, x, y, h);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function addWingPad(torsoG, s, side, baseX, py, ps, extras, id) {
  const ribHex = extras.ribHex ?? 0xffc107;
  const borderW = extras.padBorder ?? 0.09;
  const tilt = extras.padTilt ?? 0.16;
  const pitch = extras.padPitch ?? 0.06;
  const arch = extras.padArch ?? 0.55;
  const nLines = extras.padLines ?? 7;
  const lineW = extras.padLineW ?? 0.012;
  const map = wingPadAlbedoTex(ribHex, { borderW, lines: nLines | 0, lineW });
  const mat = gearMat(0xffffff, {
    kind: "armor",
    detail: 0.15,
    map,
    bumpMul: 0.15,
  });
  mat.side = THREE.DoubleSide;
  mat.transparent = true;
  mat.alphaTest = 0.15;

  const g = new THREE.Group();
  g.position.set(baseX, py, 0.03 * s + (extras.padZ || 0) * s);
  g.rotation.z = side * -tilt;
  g.rotation.y = side * (tilt * 0.35);
  g.rotation.x = -pitch;

  const R = 0.07 * s * ps;
  const sx = 2.35;
  const sz = 1.15;
  const ox = side * R * sx * 0.92;

  const shell = new THREE.Mesh(makeWingPadShellGeo(arch), mat);
  shell.scale.set(R * sx, R * sz, R * sx * 0.55);
  shell.rotation.x = -Math.PI / 2;
  shell.position.set(ox, 0, 0);
  g.add(tagCloth(shell, id));

  torsoG.add(g);
}

/** Traje superior batalla completo (hombreras + pechera + capa). Sin auto-aplicar. */
function addFreezerEliteSuit(torsoG, s, waistY, ty, chestLocalY, sc, mats) {
  const py = 1.14 * s - waistY + ty + (sc.padY || 0) * s;
  const px = (sc.padX || 0) * s;
  const ps = sc.padScale ?? 0.72;
  const padOpts = {
    ...mats,
    padZ: sc.padZ,
    padBorder: sc.padBorder,
    padTilt: sc.padTilt,
    padPitch: sc.padPitch,
    padArch: sc.padArch,
    padLines: sc.padLines,
    padLineW: sc.padLineW,
  };
  // Hombreras ancladas al borde de la pechera (no al hueso del brazo)
  for (const side of [-1, 1]) {
    const baseX = side * (0.2 * s + px);
    addWingPad(torsoG, s, side, baseX, py, ps, padOpts, `armor_pad_${side > 0 ? "R" : "L"}`);
  }
  const y = 1.0 * s - waistY + ty + (sc.plateY || 0) * s;
  const x = (sc.plateX || 0) * s;
  const z = (sc.plateZ || 0) * s;
  addEliteBreastplate(
    torsoG,
    s,
    x,
    y,
    z,
    sc.plateSx ?? 1.05,
    sc.plateSy ?? 1.08,
    sc.plateSz ?? 1.05,
    mats
  );
  // Faldones: se agregan en addHipFlaps (cualquier kit)
  if ((sc.showCape ?? 0) > 0.5) {
    addCapeMesh(torsoG, s, waistY, ty, chestLocalY, sc, mats.capeM);
  }
}

/** Faldones cadera: miran a cada costado; semi-óvalo tope recto (estilo hombrera). */
function addHipFlaps(torsoG, s, waistY, ty, sc, mats = {}) {
  if ((sc.showHipFlaps ?? 0) < 0.5) return;
  const ribHex = mats.ribHex ?? 0xffc107;
  const borderW = sc.padBorder ?? 0.09;
  const nLines = sc.padLines ?? 7;
  const lineW = sc.padLineW ?? 0.012;
  const fx = (sc.hipFlapX || 0) * s;
  const fy = (sc.hipFlapY || 0) * s;
  const fz = (sc.hipFlapZ || 0) * s;
  const fsx = sc.hipFlapSx ?? 1;
  const fsy = sc.hipFlapSy ?? 1;
  const fsz = sc.hipFlapSz ?? 1;
  const ftilt = sc.hipFlapTilt ?? 0.2;
  const farch = sc.hipFlapArch ?? 0.35;
  const map = hipFlapAlbedoTex(ribHex, { borderW, lines: nLines | 0, lineW });
  const mat = gearMat(0xffffff, {
    kind: "armor",
    detail: 0.15,
    map,
    bumpMul: 0.15,
  });
  mat.side = THREE.DoubleSide;
  mat.transparent = true;
  mat.alphaTest = 0.15;
  for (const side of [-1, 1]) {
    const flap = new THREE.Group();
    const shell = new THREE.Mesh(makeHipFlapShellGeo(farch), mat);
    shell.scale.set(0.09 * s * fsx, 0.16 * s * fsy, 0.04 * s * fsz);
    flap.add(tagCloth(shell, `hip_flap_${side > 0 ? "R" : "L"}`));
    flap.position.set(side * (0.16 * s + fx), 0.52 * s - waistY + ty + fy, fz);
    flap.rotation.y = side * (Math.PI / 2);
    flap.rotation.z = side * ftilt;
    torsoG.add(flap);
  }
}

function addCapeMesh(torsoG, s, waistY, ty, chestLocalY, sc, capeM) {
  const cs = sc.capeScale ?? 1;
  const thick = sc.capeThick ?? 1;
  const w = 0.52 * s * cs;
  const h = 0.78 * s * cs;
  const geo = new THREE.PlaneGeometry(w, h, 12, 16);
  const pos = geo.attributes.position;
  const base = new Float32Array(pos.count * 3);
  const fall = new Float32Array(pos.count); // 0 cuello → 1 ruedo
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    const v = 0.5 - y / h; // 0 arriba, 1 abajo
    const u = (w > 1e-6 ? x / (w * 0.5) : 0); // -1..1
    // Más ancha abajo, recogida en el cuello
    const flare = 0.62 + v * 0.55;
    x *= flare;
    // Pliegues verticales + ondas de tela
    const fold =
      Math.sin(u * Math.PI * 2.4) * (0.01 + v * 0.032) * s * thick +
      Math.sin(v * Math.PI * 4 + u * 2.1) * 0.012 * s * thick +
      Math.sin(u * Math.PI * 5.5 + v * 3) * 0.006 * s;
    // Cae hacia atrás y se curva
    let z = fold - v * v * 0.1 * s - Math.abs(u) * v * 0.02 * s;
    y -= v * v * 0.05 * s * cs;
    // Borde inferior ondulado
    if (v > 0.85) {
      y -= Math.sin(u * Math.PI * 3) * 0.012 * s;
      z += Math.sin(u * Math.PI * 2) * 0.01 * s;
    }
    pos.setXYZ(i, x, y, z);
    base[i * 3] = x;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = z;
    fall[i] = v;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = capeM.clone();
  mat.side = THREE.DoubleSide;
  mat.roughness = Math.min(0.95, (mat.roughness ?? 0.85) + 0.05);
  const cape = new THREE.Mesh(geo, mat);
  cape.position.set(
    (sc.capeX || 0) * s,
    chestLocalY + 0.06 * s + (sc.capeY || 0) * s,
    -0.1 * s + (sc.capeZ || 0) * s
  );
  cape.rotation.x = 0.12;
  cape.userData.wind = true;
  cape.userData.cloth = true;
  cape.userData.clothBase = base;
  cape.userData.clothFall = fall;
  cape.userData.clothAmp = 0.028 * s * thick;
  torsoG.add(tagCloth(cape, "cape"));

  // Cuello / enganche de capa (suave, no aro rígido)
  const collarGeo = new THREE.PlaneGeometry(0.34 * s * cs, 0.07 * s, 8, 2);
  const cp = collarGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    const y = cp.getY(i);
    const u = x / (0.17 * s * cs + 1e-6);
    cp.setXYZ(i, x, y, Math.sin(u * Math.PI) * 0.02 * s - 0.01 * s);
  }
  cp.needsUpdate = true;
  collarGeo.computeVertexNormals();
  const collar = new THREE.Mesh(collarGeo, mat);
  collar.position.set(
    (sc.capeX || 0) * s,
    chestLocalY + 0.18 * s + (sc.capeY || 0) * s,
    -0.04 * s + (sc.capeZ || 0) * s
  );
  collar.rotation.x = 0.55;
  torsoG.add(tagCloth(collar, "cape_collar"));
}

function addSaiyanTail(g, s, sc, mat) {
  if (sc.showTail < 0.5) return;
  const len = 0.42 * s * (sc.tailLen ?? 1);
  const thick = 0.028 * s * (sc.tailThick ?? 1);
  const root = new THREE.Group();
  root.position.set(0, 0.55 * s, -0.08 * s);
  root.rotation.x = 0.35;
  const segs = 5;
  let parent = root;
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(thick * (1 - i * 0.08), thick * (0.92 - i * 0.08), len / segs, 10),
      mat
    );
    seg.position.y = i === 0 ? -len / segs / 2 : -len / segs;
    seg.rotation.x = 0.12;
    parent.add(tagCloth(seg, `tail_${i}`));
    const joint = new THREE.Group();
    joint.position.y = -len / segs / 2;
    seg.add(joint);
    parent = joint;
  }
  g.add(root);
}

function addBodySpots(torsoG, s, waistY, ty, sc, skinHex) {
  if (sc.spots < 0.5) return;
  const dark = new THREE.Color(skinHex).multiplyScalar(0.45);
  const m = surf(dark.getHex(), { roughness: 0.9 });
  const sca = sc.spotScale ?? 1;
  const spots = [
    [0.08, 1.05, 0.14],
    [-0.1, 0.95, 0.13],
    [0.12, 0.85, 0.12],
    [-0.06, 0.78, 0.14],
    [0, 1.12, 0.15],
    [0.14, 1.0, -0.08],
    [-0.14, 0.9, -0.06],
  ];
  spots.forEach(([x, y, z], i) => {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s * sca * (0.7 + (i % 3) * 0.15), 10, 8), m);
    spot.position.set(x * s, y * s - waistY + ty, z * s);
    spot.scale.set(1.2, 0.7, 1);
    spot.userData.moldId = `spot_${i}`;
    spot.userData.moldFamily = "limb";
    torsoG.add(spot);
  });
}

function addScouter(headG, s, look, sc) {
  if (sc.showScouter < 0.5 && look.scouter == null) return;
  const c = look.scouter ?? 0xd32f2f;
  const m = surf(c, { roughness: 0.35, metalness: 0.35 });
  const lens = surf(0x111111, { roughness: 0.2, metalness: 0.6 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(sc.headR * 0.95 * s, 0.012 * s, 8, 20, Math.PI * 0.7), m);
  band.rotation.y = Math.PI / 2;
  band.rotation.z = 0.15;
  band.position.set(0.02 * s, 0.02 * s, 0);
  headG.add(tagCloth(band, "scouter_band"));
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), m);
  cup.position.set(0.12 * s, 0.015 * s, 0.1 * s);
  cup.rotation.y = -0.4;
  headG.add(tagCloth(cup, "scouter_cup"));
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.028 * s, 14), lens);
  glass.position.set(0.145 * s, 0.015 * s, 0.125 * s);
  glass.rotation.y = -0.35;
  headG.add(tagCloth(glass, "scouter_lens"));
}

export function makeBody(altura, look, sculpt = {}) {
  const id = sculptIdFromLook(look);
  const sc = { ...DEFAULT_SCULPT, ...(id ? loadSavedSculpt(id) : {}), ...sculpt };
  const g = new THREE.Group();
  const s = altura;
  const kit = look.kit || "gi";
  const layered = kit === "gi" || kit === "armor" || kit === "soldier" || kit === "brute" || kit === "namek";
  const skin = skinMat(look.skin, sc);
  const shirtHex = look.body ?? 0xf57c00;
  const pantsHex = look.pants ?? (kit === "armor" || kit === "soldier" ? look.suit ?? shirtHex : look.accent ?? shirtHex);
  const sashHex = look.sash ?? look.accent ?? 0x0d47a1;
  const sleeveHex = look.sleeves ?? (kit === "armor" || kit === "soldier" ? look.suit ?? shirtHex : shirtHex);
  const suitHex = look.suit ?? shirtHex;
  const forearmHex = look.forearms ?? sleeveHex;
  const thighHex = look.thighs ?? pantsHex;
  const shinHex = look.shins ?? thighHex;
  const hipsHex = look.hipsColor ?? (kit === "armor" || kit === "soldier" ? suitHex : pantsHex);
  const underHex = look.undershirt ?? 0x5d4037;
  const wristHex = look.wrist ?? look.accent ?? sashHex;
  const capeHex = look.cape ?? 0xfafafa;
  const plateHex = look.trim ?? 0xeeeeee;
  const padHex = look.pads ?? plateHex;
  const cd = sc.clothDetail ?? 0.55;
  const ad = sc.armorDetail ?? 0.7;
  const armoredKit = kit === "armor" || kit === "soldier";
  const giKit = kit === "gi";
  const clothKind = giKit ? "gi" : "cloth";
  const clothDet = giKit ? Math.max(cd, 1.2) : cd;
  const shirtM = gearMat(shirtHex, { kind: clothKind, detail: clothDet });
  const pantsM = gearMat(pantsHex, { kind: clothKind, detail: clothDet });
  const thighM = gearMat(thighHex, { kind: clothKind, detail: clothDet });
  const shinM = gearMat(shinHex, { kind: clothKind, detail: clothDet });
  const sashM = gearMat(sashHex, { kind: clothKind, detail: clothDet * 0.9 });
  const sleeveM = gearMat(sleeveHex, {
    kind: armoredKit ? "armor" : clothKind,
    detail: armoredKit ? ad : clothDet,
  });
  const forearmM = gearMat(forearmHex, {
    kind: armoredKit ? "armor" : clothKind,
    detail: armoredKit ? ad : clothDet,
  });
  const suitM = gearMat(suitHex, { kind: "armor", detail: ad, roughness: 0.48, metalness: 0.1 });
  const plateM = gearMat(plateHex, { kind: "armor", detail: ad, roughness: 0.38, metalness: 0.22 });
  const padM = gearMat(padHex, { kind: "armor", detail: ad, roughness: 0.4, metalness: 0.18 });
  const ribHex = look.ribs ?? look.pads ?? 0x8d6e63;
  const goldHex = look.gold ?? look.accent ?? 0xffc107;
  const ribM = gearMat(ribHex, { kind: "armor", detail: ad * 1.1, roughness: 0.55, metalness: 0.08 });
  const goldM = gearMat(goldHex, { kind: "armor", detail: ad * 0.6, roughness: 0.35, metalness: 0.45 });
  const underM = gearMat(underHex, { kind: "cloth", detail: cd * 0.9, roughness: 0.86 });
  const wristM = gearMat(wristHex, { kind: "cloth", detail: cd, roughness: 0.7 });
  const capeM = gearMat(capeHex, { kind: "cloth", detail: cd * 1.1, roughness: 0.88 });
  const collarM = gearMat(look.collar ?? 0xfafafa, { kind: "armor", detail: ad * 0.8 });
  // Bordes siempre blancos; líneas de acanalado siempre negras
  const borderM = gearMat(0xfafafa, { kind: "armor", detail: 0.3 });
  const lineM = gearMat(0x111111, { kind: "armor", detail: 0.2 });
  const gearExtras = {
    plateM,
    padM,
    whiteM: plateM,
    chestM: plateM,
    ribM,
    ribHex,
    plateHex,
    goldM,
    capeM,
    collarM,
    borderM,
    lineM,
    padBorder: sc.padBorder,
    padTilt: sc.padTilt,
    padPitch: sc.padPitch,
    padArch: sc.padArch,
    padLines: sc.padLines,
    padLineW: sc.padLineW,
    padZ: sc.padZ,
    plateBorder: sc.plateBorder,
    plateRibs: sc.plateRibs,
    plateAbsW: sc.plateAbsW,
    plateAbsArch: sc.plateAbsArch,
    plateAbsGap: sc.plateAbsGap,
    platePecBot: sc.platePecBot,
    platePecSpan: sc.platePecSpan,
    pecW: sc.torsoChestSx ?? sc.torsoSx ?? 1.18,
    absW: sc.torsoWaistSx ?? sc.torsoSx ?? 1.18,
    torsoSz: sc.torsoSz ?? 1,
    torsoMul: sc.torsoMul ?? 0.15,
    torsoLen: sc.torsoLen ?? 0.55,
    clothFit: sc.clothFit ?? 1.12,
  };
  const accent = gearMat(look.accent ?? 0x1565c0, { kind: "cloth", detail: cd, roughness: 0.55 });
  const bootM = gearMat(look.boots ?? (kit === "gi" ? sashHex : kit === "armor" ? plateHex : 0x212121), {
    kind: "armor",
    detail: ad * 0.8,
    roughness: 0.5,
    metalness: 0.12,
  });
  const bracerM = gearMat(look.wrist ?? padHex, { kind: "armor", detail: ad, roughness: 0.45, metalness: 0.15 });
  const torsoC = layered || kit === "frost" ? skin : shirtM;
  const limbC = layered || kit === "frost" ? skin : gearMat(new THREE.Color(shirtHex).multiplyScalar(0.78).getHex(), { kind: "cloth", detail: cd, roughness: 0.88 });
  const hipsMat =
    kit === "frost" && look.hipsColor == null
      ? torsoC
      : gearMat(hipsHex, { kind: armoredKit ? "armor" : "cloth", detail: armoredKit ? ad : cd, roughness: armoredKit ? 0.48 : 0.84, metalness: armoredKit ? 0.1 : 0.04 });
  const eliteSuit = sc.upperSuit === "freezerElite";
  const shirtLayer = eliteSuit
    ? suitM
    : kit === "armor" || kit === "soldier"
      ? suitM
      : kit === "brute"
        ? pantsM
        : kit === "namek" || kit === "gi"
          ? shirtM
          : null;

  const waistY = sc.waistYMul * s;
  const ty = (sc.torsoY || 0) * s;
  const torsoG = new THREE.Group();
  torsoG.position.y = waistY;
  g.add(torsoG);

  const brute = kit === "brute";
  const bruteT = brute ? 1.12 : 1;
  const bruteC = brute ? 1.15 : 1;

  const hips = loftMesh(
    mulProfile([0.9, 0.85, 0.8, 0.6, 0.3], sc.hipsMul * s * bruteT),
    sc.hipsLen * s,
    hipsMat,
    { radial: 16, sx: sc.hipsSx, sz: sc.hipsSx * 0.83 * (sc.hipsSz ?? 1) }
  );
  hips.position.y = waistY;
  hips.userData.moldId = "hips";
  hips.userData.moldFamily = layered ? "cloth" : "torso";
  if (kit === "gi") wrinkleClothMesh(hips, 1.15);
  g.add(hips);

  const pecW = sc.torsoChestSx ?? sc.torsoSx ?? 1.18;
  const absW = sc.torsoWaistSx ?? sc.torsoSx ?? 1.18;
  const torsoSxAt = (v) => {
    const t = v <= 0.28 ? 0 : v >= 0.72 ? 1 : (v - 0.28) / 0.44;
    const e = t * t * (3 - 2 * t);
    return pecW + (absW - pecW) * e;
  };
  const torsoCore = loftMesh(
    mulProfile(PROF.torso, sc.torsoMul * s * bruteC),
    sc.torsoLen * s,
    torsoC,
    { radial: 16, sx: torsoSxAt, sz: (v) => torsoSxAt(v) * 0.85 * (sc.torsoSz ?? 1) }
  );
  torsoCore.position.y = 0.92 * s - waistY + ty;
  torsoCore.userData.moldId = "torso";
  torsoCore.userData.moldFamily = "torso";
  torsoG.add(torsoCore);

  if (shirtLayer) {
    const giBag = kit === "gi" ? 1.2 : 1;
    const shirt = loftMesh(
      mulProfile(PROF.torso, sc.torsoMul * s * bruteC * sc.clothFit * giBag),
      sc.torsoLen * s * (kit === "gi" ? 0.82 : 0.92),
      shirtLayer,
      {
        radial: 16,
        sx: (v) => torsoSxAt(v) * (kit === "gi" ? 1.14 : 1.04),
        sz: (v) => torsoSxAt(v) * (kit === "gi" ? 1.08 : 0.9) * (sc.torsoSz ?? 1),
      }
    );
    shirt.position.y = 0.9 * s - waistY + ty;
    shirt.userData.moldId = "cloth_shirt";
    shirt.userData.moldFamily = "cloth";
    if (kit === "gi") wrinkleClothMesh(shirt, 1.35);
    torsoG.add(shirt);
  }

  const chestLocalY = (sc.chestY ?? 0.96) * s - waistY + ty;
  const wearElitePlate =
    eliteSuit ||
    (sc.plateType === "elite" && (kit === "armor" || kit === "soldier" || sc.showPlate > 0.5));
  // Con pechera elite: pecho = coraza (sin piel ni pectorales de carne)
  const chestMat = wearElitePlate ? plateM : shirtLayer || torsoC;
  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(sc.chestR * s * (wearElitePlate ? 1.08 : 1), 18, 14),
    chestMat
  );
  chest.position.set(0, chestLocalY, (sc.chestZ ?? 0) * s);
  chest.rotation.set(sc.chestRx || 0, sc.chestRy || 0, sc.chestRz || 0);
  chest.scale.set(
    (brute ? sc.chestSx * 1.14 : sc.chestSx) * (wearElitePlate ? 1.08 : 1),
    sc.chestSy * (wearElitePlate ? 1.1 : 1),
    sc.chestSz * (wearElitePlate ? 1.05 : 1)
  );
  chest.visible = !wearElitePlate;
  chest.castShadow = true;
  chest.userData.moldId = "chest";
  chest.userData.moldFamily = wearElitePlate || layered ? "cloth" : "torso";
  torsoG.add(chest);
  if (!wearElitePlate) addPecs(torsoG, s, waistY, shirtLayer || torsoC, sc, brute, ty);

  if ((kit === "gi" || kit === "namek") && sc.showSash > 0.5) {
    const sashY = (sc.sashY || 0) * s;
    const sash = new THREE.Mesh(
      new THREE.TorusGeometry(sc.beltR * s * 1.08, sc.beltThick * s * 2.4, 10, 24),
      sashM
    );
    sash.rotation.x = Math.PI / 2;
    sash.position.y = sashY;
    sash.userData.moldId = "sash";
    sash.userData.moldFamily = "cloth";
    torsoG.add(sash);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.07 * s, 0.05 * s), sashM);
    knot.position.set(0, sashY, 0.16 * s);
    knot.userData.moldId = "sash_knot";
    knot.userData.moldFamily = "cloth";
    torsoG.add(knot);
    if (sc.showSashTail > 0.5) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.055 * s, 0.26 * s, 0.02 * s), sashM);
      tail.position.set(0.02 * s, sashY - 0.14 * s, 0.15 * s);
      tail.rotation.z = 0.08;
      tail.userData.moldId = "sash_tail";
      tail.userData.moldFamily = "cloth";
      torsoG.add(tail);
    }
  } else if (sc.showBelt > 0.5) {
  const belt = new THREE.Mesh(
      new THREE.TorusGeometry(sc.beltR * s, sc.beltThick * s, 10, 24),
      kit === "armor" || kit === "soldier" ? plateM : accent
  );
  belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.72 * s - waistY + ty + (sc.beltY || 0) * s;
    belt.userData.moldId = "belt";
    belt.userData.moldFamily = "cloth";
  torsoG.add(belt);
  }

  if (eliteSuit) {
    addFreezerEliteSuit(torsoG, s, waistY, ty, chestLocalY, sc, gearExtras);
  } else if (kit === "armor" || kit === "soldier") {
    addArmorPlate(torsoG, s, waistY, ty, sc, plateM, true, gearExtras);
    addArmorPads(torsoG, s, waistY, ty, sc, padM, true, gearExtras);
  } else {
    addArmorPlate(torsoG, s, waistY, ty, sc, plateM, false, gearExtras);
    addArmorPads(torsoG, s, waistY, ty, sc, padM, false, gearExtras);
  }
  addHipFlaps(torsoG, s, waistY, ty, sc, gearExtras);
  if (kit === "frost") {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.38 * s, 0.04 * s, 1, 2, 1), accent);
    line.position.set(
      (sc.frostLineX || 0) * s,
      0.98 * s - waistY + ty + (sc.frostLineY || 0) * s,
      0.16 * s + (sc.frostLineZ || 0) * s
    );
    line.scale.set(sc.frostLineSx ?? 1, sc.frostLineSy ?? 1, sc.frostLineSz ?? 1);
    line.userData.moldId = "frost_line";
    line.userData.moldFamily = "cloth";
    torsoG.add(line);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 12, 10), accent);
    gem.position.set(
      (sc.frostGemX || 0) * s,
      1.12 * s - waistY + ty + (sc.frostGemY || 0) * s,
      0.17 * s + (sc.frostGemZ || 0) * s
    );
    gem.scale.set(sc.frostGemSx ?? 1, sc.frostGemSy ?? 1, sc.frostGemSz ?? 1);
    gem.userData.moldId = "frost_gem";
    gem.userData.moldFamily = "cloth";
    torsoG.add(gem);
  }
  if (kit === "gi") {
    addGiDetails(torsoG, s, waistY, ty, sc, shirtM, underM, sashM);
  }
  if ((kit === "namek" || sc.showCape > 0.5) && !eliteSuit) {
    addCapeMesh(torsoG, s, waistY, ty, chestLocalY, sc, capeM);
  }
  addBodySpots(torsoG, s, waistY, ty, sc, look.skin);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(sc.neckR * s, sc.neckR * 1.15 * s, sc.neckLen * s, 14),
    skin
  );
  const neckY =
    chestLocalY +
    sc.chestR * (sc.chestSy || 1) * s +
    sc.neckLen * s * 0.5 +
    0.04 * s +
    (sc.neckY || 0) * s;
  neck.position.y = neckY;
  neck.userData.moldId = "neck";
  neck.userData.moldFamily = "head";
  torsoG.add(neck);

  const headG = new THREE.Group();
  headG.position.y = neckY + sc.neckLen * s * 0.5 + sc.headR * (sc.headSy || 1) * s * 0.55;
  const head = makeHeadShell(sc, s, skin);
  headG.add(head);
  if (sc.jaw > 0.05) {
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(sc.headR * 0.72 * s * sc.jaw, 14, 12), skin);
    jaw.position.set(
      (sc.jawX || 0) * s,
      -sc.headR * 0.55 * s + (sc.jawY || 0) * s,
      (sc.jawZ || 0) * s
    );
    jaw.scale.set(1.15 * (sc.jawSx ?? 1), 0.55 * (sc.jawSy ?? 1), 1.05 * (sc.jawSz ?? 1));
    jaw.userData.moldId = "jaw";
    jaw.userData.moldFamily = "head";
    headG.add(jaw);
  }
  addEars(headG, s, skin, sc);
  addFace(headG, s, look, sc);
  addHeadGear(headG, s, look, sc);
  addScouter(headG, s, look, sc);
  torsoG.add(headG);

  const gi = kit === "gi";
  const armored = kit === "armor" || kit === "soldier";
  const giFit = gi ? Math.max(sc.clothFit ?? 1.12, 1.28) : sc.clothFit ?? 1.12;
  const armBase = {
    hand: skin,
    band: gi && !eliteSuit ? wristM : null,
    bandAt: "wrist",
    upperBulk: sc.upperArmBulk,
    lowerBulk: sc.foreArmBulk,
    upperSx: sc.upperArmSx,
    lowerSx: sc.foreArmSx,
    handScale: sc.handScale,
    fingerLen: sc.fingerLen,
    handRx: sc.handRx,
    handRy: sc.handRy,
    handRz: sc.handRz,
    showHands: sc.showHands,
    sleeveMat: gi || armored || kit === "brute" || eliteSuit ? sleeveM : null,
    sleeveLen: eliteSuit ? 0.95 : gi ? 0.55 : kit === "brute" ? 0.62 : 0.92,
    sleeveLower: eliteSuit,
    foreClothMat: armored || eliteSuit ? forearmM : null,
    clothFit: giFit,
    wrinkle: gi ? 1.25 : 0,
    bracerType: eliteSuit ? "none" : sc.bracerType || "none",
    bracerMat: bracerM,
  };
  const legBase = {
    boot: bootM,
    thighBulk: sc.thighBulk,
    shinBulk: sc.shinBulk,
    thighSx: sc.thighSx,
    thighY: (sc.thighY || 0) * s,
    shinSx: sc.shinSx,
    footScale: sc.footScale,
    footLen: sc.footLen,
    footSx: sc.footSx,
    footSy: sc.footSy,
    footZ: sc.footZ,
    footY: sc.footY,
    footPitch: sc.footPitch,
    bootCuff: sc.bootCuff,
    showBoots: sc.showBoots,
    bootType: sc.bootType || "tall",
    bootTrim: gearMat(look.trim ?? look.accent ?? look.wrist ?? 0xf5f5f5, {
      kind: "cloth",
      detail: cd * 0.7,
    }),
    pantsMat: layered ? thighM : null,
    shinClothMat: layered ? shinM : null,
    clothFit: giFit,
    wrinkle: gi ? 1.4 : 0,
  };
  const armL = makeArm(
    sc.upperArmR * s,
    sc.foreArmR * s,
    sc.upperArmLen * s,
    sc.foreArmLen * s,
    limbC,
    -sc.shoulderX * s - (sc.armX || 0) * s,
    sc.shoulderY * s - waistY + (sc.armY || 0) * s,
    { ...armBase, side: "L", z: (sc.armZ || 0) * s }
  );
  const armR = makeArm(
    sc.upperArmR * s,
    sc.foreArmR * s,
    sc.upperArmLen * s,
    sc.foreArmLen * s,
    limbC,
    sc.shoulderX * s + (sc.armX || 0) * s,
    sc.shoulderY * s - waistY + (sc.armY || 0) * s,
    { ...armBase, side: "R", z: (sc.armZ || 0) * s }
  );
  torsoG.add(armL, armR);
  const legL = makeLeg(
    sc.thighR * s,
    sc.shinR * s,
    sc.thighLen * s,
    sc.shinLen * s,
    limbC,
    -sc.hipX * s,
    (sc.hipY ?? 0.6) * s,
    { ...legBase, side: "L" }
  );
  const legR = makeLeg(
    sc.thighR * s,
    sc.shinR * s,
    sc.thighLen * s,
    sc.shinLen * s,
    limbC,
    sc.hipX * s,
    (sc.hipY ?? 0.6) * s,
    { ...legBase, side: "R" }
  );
  g.add(legL, legR);
  addSaiyanTail(g, s, sc, gearMat(look.skin, { kind: "cloth", detail: cd * 0.6, roughness: 0.88 }));
  g.userData.limbs = {
    armL,
    armR,
    legL,
    legR,
    elbowL: armL.userData.elbow,
    elbowR: armR.userData.elbow,
    wristL: armL.userData.wrist,
    wristR: armR.userData.wrist,
    kneeL: legL.userData.knee,
    kneeR: legR.userData.knee,
    torsoG,
    hips,
    waistY,
    hipY: (sc.hipY ?? 0.6) * s,
    headG,
    neck,
  };
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  if (sc.molds) applyMolds(g, sc.molds, s / (sc.moldAltura || 1.85));
  return g;
}

/** Aplica posiciones de vértices guardadas (moldeado con mouse). */
export function applyMolds(root, molds, scale = 1) {
  if (!molds || typeof molds !== "object") return;
  const keys = Object.keys(molds).filter((k) => Array.isArray(molds[k]));
  if (keys.length > 14) return;
  const k = scale || 1;
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.moldId) return;
    const data = molds[o.userData.moldId];
    if (!data || !Array.isArray(data)) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos || pos.count * 3 !== data.length) return;
    if (k === 1) pos.array.set(data);
    else for (let i = 0; i < data.length; i++) pos.array[i] = data[i] * k;
    pos.needsUpdate = true;
    o.geometry.computeVertexNormals();
  });
}

/** Captura molds actuales desde el mesh (para guardar). */
export function captureMolds(root, ids) {
  const molds = {};
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.moldId) return;
    if (ids && !ids.has(o.userData.moldId)) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    molds[o.userData.moldId] = Array.from(pos.array);
  });
  return molds;
}
