import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import piccoloUrl from "./assets/faces/piccolo.png";
import trunksUrl from "./assets/faces/trunks.png";
import trunksSsjUrl from "./assets/faces/trunks_ssj.png";
import freezerUrl from "./assets/faces/freezer.png";
import recoomeUrl from "./assets/faces/recoome.png";
import raditzUrl from "./assets/faces/raditz.png";
import nappaUrl from "./assets/faces/nappa.png";
import a17Url from "./assets/faces/a17.png";
import a18Url from "./assets/faces/a18.png";
import a16Url from "./assets/faces/a16.png";
import yamchaUrl from "./assets/faces/yamcha.png";
import chaozUrl from "./assets/faces/chaoz.png";

// crop: [x, y, w, h] px de la fuente (solo cejas, ojos, nariz, boca). scale: ancho relativo.
// key: [lo, hi] umbral de diferencia vs piel. ssj: misma proporciÃ³n de crop (se intercambia el map).
export const FACE_DECALS = {
  piccolo: { url: piccoloUrl, crop: [58, 98, 304, 254] },
  trunks: {
    url: trunksUrl,
    crop: [30, 150, 360, 240],
    scale: 0.84,
    key: [24, 70],
    ssj: { url: trunksSsjUrl, crop: [59, 165, 302, 202] },
  },
  freezer: { url: freezerUrl, crop: [55, 172, 310, 194], scale: 0.82, key: [44, 80], keepSat: true },
  // scouter: el lente viene en la imagen; el 3D solo pone banda y auricular.
  recoome: { url: recoomeUrl, crop: [70, 112, 300, 276], scale: 0.79, key: [22, 70], scouter: true },
  raditz: { url: raditzUrl, crop: [82, 118, 256, 240], scale: 0.86, key: [20, 66] },
  nappa: { url: nappaUrl, crop: [80, 82, 264, 304], scale: 0.73, key: [22, 68] },
  a17: { url: a17Url, crop: [52, 155, 312, 215], scale: 0.73, key: [26, 72] },
  a18: { url: a18Url, crop: [48, 155, 330, 222], scale: 0.77, key: [24, 70] },
  a16: { url: a16Url, crop: [60, 96, 300, 268], scale: 0.8, key: [22, 68] },
  yamcha: { url: yamchaUrl, crop: [55, 115, 310, 265], scale: 0.87, key: [20, 66] },
  chaoz: { url: chaozUrl, crop: [95, 85, 232, 262], scale: 0.79, key: [20, 66], keepSat: true },
};

const _texCache = new Map();

// Alpha segÃºn cuÃ¡nto se aparta cada pÃ­xel de la piel local estimada.
function keyOutSkin(img, [cx, cy, cw, ch], [lo, hi] = [14, 60], keepSat = false) {
  const up = 2;
  const W = cw * up;
  const H = ch * up;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high";
  g.drawImage(img, cx, cy, cw, ch, 0, 0, W, H);
  const src = g.getImageData(0, 0, W, H);
  const d = src.data;
  const N = W * H;

  // Piel local en grilla gruesa, promediando solo pÃ­xeles que parecen piel (iterativo):
  // asÃ­ ojos blancos / lentes grandes no contaminan la estimaciÃ³n.
  const gw = 14;
  const gh = Math.max(4, Math.round((14 * ch) / cw));
  const skinW = new Float32Array(N);
  const skin = new Float32Array(N * 3);
  // Semilla: color de piel global = bin mÃ¡s poblado (la piel domina el recorte).
  const hist = new Map();
  for (let i = 0; i < N; i++) {
    if (d[i * 4 + 3] < 128) continue;
    const k = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
    const h = hist.get(k) || [0, 0, 0, 0];
    h[0] += d[i * 4];
    h[1] += d[i * 4 + 1];
    h[2] += d[i * 4 + 2];
    h[3]++;
    hist.set(k, h);
  }
  let mode = [128, 128, 128, 1];
  for (const h of hist.values()) if (h[3] > mode[3]) mode = h;
  const gr = mode[0] / mode[3];
  const gg = mode[1] / mode[3];
  const gb = mode[2] / mode[3];
  for (let i = 0; i < N; i++) {
    const dr = d[i * 4] - gr;
    const dg = d[i * 4 + 1] - gg;
    const db = d[i * 4 + 2] - gb;
    skinW[i] = 1 - THREE.MathUtils.smoothstep(Math.sqrt(dr * dr + dg * dg + db * db), 45, 85);
  }
  const diffOf = (i, p) => {
    const dr = d[i * 4] - skin[p];
    const dg = d[i * 4 + 1] - skin[p + 1];
    const db = d[i * 4 + 2] - skin[p + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  for (let it = 0; it < 3; it++) {
    const acc = new Float32Array(gw * gh * 4);
    for (let y = 0; y < H; y++) {
      const gy = Math.min(gh - 1, ((y * gh) / H) | 0);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const w = skinW[i];
        if (w < 0.02) continue;
        const k = (gy * gw + Math.min(gw - 1, ((x * gw) / W) | 0)) * 4;
        acc[k] += d[i * 4] * w;
        acc[k + 1] += d[i * 4 + 1] * w;
        acc[k + 2] += d[i * 4 + 2] * w;
        acc[k + 3] += w;
      }
    }
    // celdas sin piel: heredan de vecinas
    for (let pass = 0; pass < 8; pass++) {
      let empty = false;
      const prev = acc.slice();
      for (let gy = 0; gy < gh; gy++)
        for (let gx = 0; gx < gw; gx++) {
          const k = (gy * gw + gx) * 4;
          if (prev[k + 3] > 0.5) continue;
          empty = true;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = gx + ox;
            const ny = gy + oy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            const n = (ny * gw + nx) * 4;
            if (prev[n + 3] <= 0.5) continue;
            for (let c2 = 0; c2 < 4; c2++) acc[k + c2] += prev[n + c2] / prev[n + 3];
          }
        }
      if (!empty) break;
    }
    const cell = (gx, gy, c2) => {
      const k = (Math.max(0, Math.min(gh - 1, gy)) * gw + Math.max(0, Math.min(gw - 1, gx))) * 4;
      return acc[k + 3] > 1e-3 ? acc[k + c2] / acc[k + 3] : 128;
    };
    for (let y = 0; y < H; y++) {
      const fy = ((y + 0.5) * gh) / H - 0.5;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = ((x + 0.5) * gw) / W - 0.5;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const p = (y * W + x) * 3;
        for (let c2 = 0; c2 < 3; c2++) {
          const top = cell(x0, y0, c2) * (1 - tx) + cell(x0 + 1, y0, c2) * tx;
          const bot = cell(x0, y0 + 1, c2) * (1 - tx) + cell(x0 + 1, y0 + 1, c2) * tx;
          skin[p + c2] = top * (1 - ty) + bot * ty;
        }
        skinW[y * W + x] = 1 - THREE.MathUtils.smoothstep(diffOf(y * W + x, p), lo * 0.6, lo * 1.4);
      }
    }
  }

  const fade = (n) => 1 - THREE.MathUtils.smoothstep(Math.abs(n), 0.93, 1);
  for (let y = 0; y < H; y++) {
    const fy = fade((y / (H - 1)) * 2 - 1);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const diff = diffOf(y * W + x, (y * W + x) * 3);
      let a = THREE.MathUtils.smoothstep(diff, lo, hi);
      if (keepSat) {
        const sat = (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) / 255;
        a = Math.max(a, THREE.MathUtils.smoothstep(sat, 0.12, 0.3));
      }
      a *= fy * fade((x / (W - 1)) * 2 - 1);
      d[i + 3] = Math.round(a * d[i + 3]);
    }
  }
  g.clearRect(0, 0, W, H);
  g.putImageData(src, 0, 0);
  return c;
}

function getFaceTexture(src, key) {
  if (_texCache.has(src.url)) return _texCache.get(src.url);
  const blank = document.createElement("canvas");
  blank.width = blank.height = 1;
  const tex = new THREE.CanvasTexture(blank);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Sin mipmaps: de lejos promediaban trazos finos con transparente y la cara desaparecía.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  _texCache.set(src.url, tex);
  const img = new Image();
  img.onload = () => {
    tex.image = keyOutSkin(img, src.crop, src.key ?? key, src.keepSat);
    // El 1x1 ya subido queda con storage inmutable: hay que liberar para realocar al tamaño real.
    tex.dispose();
    tex.needsUpdate = true;
  };
  img.src = src.url;
  return tex;
}

for (const def of Object.values(FACE_DECALS)) {
  getFaceTexture(def, def.key);
  if (def.ssj) getFaceTexture(def.ssj, def.key);
}

export function hasFaceDecal(sc) {
  return !!(sc.faceDecal && FACE_DECALS[sc.faceDecal]);
}

export function faceDecalHasScouter(sc) {
  return !!FACE_DECALS[sc.faceDecal]?.scouter;
}

/** Proyecta la cara sobre `head` (hijo directo de headG) y agrega el decal a headG. */
export function addFaceDecal(headG, head, s, sc) {
  const def = FACE_DECALS[sc.faceDecal];
  if (!def || !head) return;
  const hk = (sc.headR || 0.16) / 0.16;
  const [, , cw, ch] = def.crop;
  const w =
    0.25 * s * hk * (def.scale ?? 1) * (sc.faceDecalScale ?? 1) * (sc.faceDecalSx ?? 1) * (sc.headSx || 1);
  const h = w * (ch / cw) * (sc.faceDecalSy ?? 1);
  const r = sc.headR * s * (sc.headSz || 1);

  head.updateMatrix();
  head.matrixWorld.copy(head.matrix);
  const pos = new THREE.Vector3(
    (sc.faceDecalX || 0) * s,
    (sc.faceDecalY ?? -0.01) * s,
    r * 0.75 + (sc.faceDecalZ || 0) * s
  );
  const rot = new THREE.Euler(0, 0, sc.faceDecalRot || 0);
  const geo = new DecalGeometry(head, pos, rot, new THREE.Vector3(w, h, r * 1.5));
  // Despegado de la piel: con near 0.1 / far 2600 el polygonOffset solo no alcanza de lejos.
  const lift = 0.004 * s;
  const gp = geo.attributes.position;
  const gn = geo.attributes.normal;
  for (let i = 0; i < gp.count; i++) {
    gp.setXYZ(i, gp.getX(i) + gn.getX(i) * lift, gp.getY(i) + gn.getY(i) * lift, gp.getZ(i) + gn.getZ(i) * lift);
  }
  gp.needsUpdate = true;
  geo.computeBoundingSphere();

  const map = getFaceTexture(def, def.key);
  const mat = new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    roughness: 0.7,
  });
  if (def.ssj) {
    mat.userData.faceMap = map;
    mat.userData.faceSsjMap = getFaceTexture(def.ssj, def.key);
  }
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  headG.add(m);
}

/** Intercambia la cara normal/SSJ en los decals del objeto. */
export function setFaceDecalSsj(root, on) {
  root.traverse((o) => {
    const u = o.material?.userData;
    if (!u?.faceSsjMap) return;
    o.material.map = on ? u.faceSsjMap : u.faceMap;
    o.material.needsUpdate = true;
  });
}
