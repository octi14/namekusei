import * as THREE from "three";

// Peinados por mechones sobre la cabeza real (headG local). Ejes: +Y arriba, +Z frente, +X izquierda del personaje.
// Dirección esférica: theta desde +Y, phi desde +Z hacia +X.

const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3();

function headFrame(head) {
  head.updateMatrix();
  head.matrixWorld.copy(head.matrix);
  const g = head.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox.clone().applyMatrix4(head.matrix);
  const c = b.getCenter(new THREE.Vector3());
  const h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const far = Math.max(h.x, h.y, h.z) * 4;
  /** Distancia del centro a la superficie del cráneo en la dirección d (unitaria). */
  const memo = new Map();
  const surf = (d) => {
    const key = `${d.x.toFixed(4)},${d.y.toFixed(4)},${d.z.toFixed(4)}`;
    const hitD = memo.get(key);
    if (hitD != null) return hitD;
    const v = surfRay(d);
    memo.set(key, v);
    return v;
  };
  const surfRay = (d) => {
    // en el polo del torno el rayo puede pasar por el hueco central: reintentar apenas desviado
    for (const e of [0, 0.01, 0.03]) {
      const dd = e ? d.clone().add(_v.set(e, 0, e * 0.7)).normalize() : d;
      _ray.set(_v.copy(dd).multiplyScalar(far).add(c), dd.clone().negate());
      _ray.far = far * 2;
      const hit = _ray.intersectObject(head, false)[0];
      if (hit) return far - hit.distance;
    }
    return Math.min(h.x, h.y, h.z);
  };
  return { c, ax: h.x, ay: h.y, az: h.z, surf };
}

const sph = (theta, phi) =>
  new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));

/** Mechón: tubo de sección elíptica (w = medio ancho tangencial, t = medio espesor) siguiendo pts. */
function addStrand(out, F, pts, { w, t, tipW = 0.75, radial = 8, seg = 20, blade = false }) {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const P = curve.getSpacedPoints(seg);
  const base = out.pos.length / 3;
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const p = P[i];
    const T = curve.getTangentAt(u);
    if (blade) {
      // pico: cara plana respecto a +Y; si el pico es casi vertical, respecto a la horizontal radial
      N.set(0, 1, 0);
      if (Math.abs(T.y) > 0.8) N.set(p.x - F.c.x, 0, p.z - F.c.z);
      if (N.lengthSq() < 1e-10) N.set(0, 0, 1);
    } else {
      N.set((p.x - F.c.x) / (F.ax * F.ax), Math.max(0, p.y - F.c.y) / (F.ay * F.ay), (p.z - F.c.z) / (F.az * F.az));
      if (N.lengthSq() < 1e-10) N.set(0, 1, 0);
    }
    N.normalize();
    B.crossVectors(T, N).normalize();
    N.crossVectors(B, T).normalize();
    const taper = blade
      ? Math.pow(1 - u, 0.6) * (u < 0.15 ? 1.15 - (u / 0.15) * 0.15 : 1)
      : (1 - u * (1 - tipW)) * (u < 0.1 ? 0.85 + (u / 0.1) * 0.15 : 1);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const cw = Math.cos(a) * w * taper;
      const ct = Math.sin(a) * t * taper;
      out.pos.push(p.x + B.x * cw + N.x * ct, p.y + B.y * cw + N.y * ct, p.z + B.z * cw + N.z * ct);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      const a = base + i * radial + k;
      const b = base + (i + 1) * radial + k;
      const c = base + (i + 1) * radial + k1;
      const d = base + i * radial + k1;
      out.idx.push(a, b, d, b, c, d);
    }
  }
  // tapa en la punta (corte recto)
  const tip = P[seg];
  const ti = out.pos.length / 3;
  out.pos.push(tip.x, tip.y, tip.z);
  const last = base + seg * radial;
  for (let k = 0; k < radial; k++) out.idx.push(last + k, ti, last + ((k + 1) % radial));
}

/** Casquete del color del pelo sobre el cráneo: línea del pelo en thFront (frente) → thSide (costados/atrás). */
function scalpCap(out, pt, thFront, thSide, lift, liftEdge = lift) {
  const J = 9;
  const I = 28;
  const capBase = out.pos.length / 3;
  for (let i = 0; i <= I; i++) {
    const ph = -Math.PI + (i / I) * Math.PI * 2;
    const a = Math.abs(ph);
    const thMax = a < 1.15 ? thFront + (a / 1.15) ** 2 * (thSide - thFront) : thSide;
    for (let j = 0; j <= J; j++) {
      const e = (j / J) ** 2.5;
      const p = pt(sph(Math.max(0.001, (thMax * j) / J), ph), lift + (liftEdge - lift) * e);
      out.pos.push(p.x, p.y, p.z);
      if (out.uv) out.uv.push((i / I) * 4, j / J);
    }
  }
  for (let i = 0; i < I; i++) {
    for (let j = 0; j < J; j++) {
      const a = capBase + i * (J + 1) + j;
      const b = a + J + 1;
      out.idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
}

/**
 * Pelo de picos (Saiyan). Cada pico: [theta, phi] base en el cráneo, v1/v2 = [theta, phi] dirección
 * inicial y de la punta, L largo y w medio ancho (en semiejes X de cabeza).
 */
function spiky(F, list, { thFront = 0.55, thSide = 1.5, mirror = true, vol = 0.04, wMul = 1, tMul = 0.5 } = {}) {
  const out = { pos: [], idx: [] };
  const A = F.ax;
  const pt = (d, lift) => d.clone().multiplyScalar(F.surf(d) + lift).add(F.c);
  // vol: volumen de pelo bajo los picos (alto en la coronilla, baja a ~0 en la línea del pelo)
  scalpCap(out, pt, thFront, thSide, vol * A, 0.035 * A);
  const one = ({ b, v1, v2, L: L0, w: w0, t, minor = 1 }, sd) => {
    const w = w0 * wMul * F.r;
    const L = (sd < 0 ? L0 * minor : L0) * F.len;
    const p0 = pt(sph(b[0], sd * b[1]), -0.02 * A);
    const d1 = sph(v1[0], sd * v1[1]);
    const d2 = sph(v2[0], sd * v2[1]);
    const dm = d1.clone().add(d2).normalize();
    const p1 = p0.clone().addScaledVector(d1, L * A * 0.38);
    const p2 = p1.clone().addScaledVector(dm, L * A * 0.34);
    const p3 = p2.clone().addScaledVector(d2, L * A * 0.28);
    addStrand(out, F, [p0, p1, p2, p3], { w: w * A, t: (t ?? w * tMul) * A, blade: true, seg: 14, radial: 8 });
  };
  for (const s of list) {
    if (s.center || !mirror) one(s, 1);
    else {
      one(s, 1);
      one(s, -1);
    }
  }
  return out;
}

// Bardock: flequillo de picos sobre la frente, picos grandes arriba/atrás y laterales horizontales.
// Asimétrico: los picos grandes van del lado izquierdo del personaje (+X); minor = largo del lado -X.
const BARDOCK = [
  // flequillo (cae sobre la frente y se abre)
  { b: [0.6, 0.08], v1: [1.45, 0.1], v2: [2.45, 0.15], L: 0.62, w: 0.17 },
  { b: [0.62, 0.36], v1: [1.4, 0.45], v2: [2.3, 0.75], L: 0.6, w: 0.16 },
  { b: [0.7, 0.62], v1: [1.45, 0.85], v2: [2.1, 1.15], L: 0.55, w: 0.15 },
  // arriba-adelante, suben
  { b: [0.35, 0.3], v1: [0.35, 0.3], v2: [0.85, 0.7], L: 0.85, w: 0.22 },
  // corona arriba-atrás (grandes)
  { b: [0.3, Math.PI], v1: [0.45, Math.PI - 0.2], v2: [1.15, Math.PI - 0.5], L: 1.15, w: 0.26, center: true },
  { b: [0.4, 2.55], v1: [0.55, 2.5], v2: [1.2, 2.45], L: 1.15, w: 0.25, minor: 0.55 },
  { b: [0.45, 1.6], v1: [0.6, 1.7], v2: [1.05, 1.9], L: 1.05, w: 0.24, minor: 0.5 },
  // laterales horizontales
  { b: [0.95, 1.45], v1: [1.3, 1.55], v2: [1.45, 1.85], L: 1.45, w: 0.27, minor: 0.42 },
  { b: [0.85, 2.05], v1: [1.15, 2.05], v2: [1.3, 2.35], L: 1.35, w: 0.26, minor: 0.45 },
  { b: [1.2, 2.4], v1: [1.55, 2.45], v2: [1.85, 2.65], L: 1.05, w: 0.23, minor: 0.55 },
  // atrás, hacia abajo
  { b: [1.35, Math.PI], v1: [1.7, Math.PI], v2: [2.1, Math.PI], L: 0.8, w: 0.24, center: true },
  { b: [1.3, 2.75], v1: [1.65, 2.8], v2: [2.05, 2.85], L: 0.85, w: 0.22, minor: 0.75 },
  { b: [0.95, 2.85], v1: [1.2, 2.85], v2: [1.55, 2.9], L: 1.05, w: 0.24, minor: 0.7 },
  // relleno entre capas (que no quede cráneo entre picos)
  { b: [0.15, 0.6], v1: [0.25, 0.9], v2: [0.9, 1.3], L: 0.9, w: 0.24 },
  { b: [0.55, 1.1], v1: [0.8, 1.2], v2: [1.3, 1.5], L: 0.95, w: 0.22, minor: 0.6 },
  { b: [0.65, 2.9], v1: [0.8, 2.9], v2: [1.4, 2.95], L: 1.0, w: 0.24, minor: 0.75 },
  // patillas delante de la oreja
  { b: [1.45, 1.22], v1: [2.35, 1.28], v2: [2.7, 1.2], L: 0.45, w: 0.11 },
];

// Gohan niño (Namek): flequillo de 3 picos sobre la frente, picos medianos arriba/atrás, laterales hacia afuera.
const GOHAN_KID = [
  { b: [0.6, 0.12], v1: [1.75, 0.15], v2: [2.75, 0.2], L: 0.95, w: 0.26 },
  { b: [0.62, 0.45], v1: [1.75, 0.55], v2: [2.6, 0.75], L: 0.85, w: 0.24 },
  { b: [0.72, 0.85], v1: [1.7, 1.0], v2: [2.4, 1.2], L: 0.75, w: 0.22 },
  { b: [0.15, 0.4], v1: [0.3, 0.5], v2: [0.9, 0.8], L: 0.8, w: 0.32 },
  { b: [0.25, Math.PI], v1: [0.45, Math.PI], v2: [1.1, Math.PI], L: 0.9, w: 0.34, center: true },
  { b: [0.35, 1.3], v1: [0.6, 1.4], v2: [1.2, 1.6], L: 0.9, w: 0.32 },
  { b: [0.45, 2.3], v1: [0.7, 2.3], v2: [1.3, 2.4], L: 0.95, w: 0.33 },
  { b: [0.95, 1.5], v1: [1.3, 1.6], v2: [1.7, 1.75], L: 0.85, w: 0.3 },
  { b: [0.95, 2.1], v1: [1.35, 2.15], v2: [1.8, 2.3], L: 0.85, w: 0.3 },
  { b: [1.3, Math.PI], v1: [1.8, Math.PI], v2: [2.3, Math.PI], L: 0.7, w: 0.32, center: true },
  { b: [1.25, 2.65], v1: [1.75, 2.7], v2: [2.2, 2.75], L: 0.7, w: 0.3 },
  { b: [0.5, 1.0], v1: [0.8, 1.1], v2: [1.4, 1.3], L: 0.75, w: 0.3 },
  { b: [0.7, 2.8], v1: [1.0, 2.85], v2: [1.6, 2.9], L: 0.8, w: 0.32 },
  { b: [1.45, 1.22], v1: [2.35, 1.28], v2: [2.7, 1.2], L: 0.4, w: 0.12 },
];

// Gohan del futuro: estilo Gokú desordenado; flequillo corto, picos grandes que suben y se abren.
const FGOHAN = [
  { b: [0.62, 0.1], v1: [1.7, 0.12], v2: [2.6, 0.2], L: 0.8, w: 0.25 },
  { b: [0.66, 0.5], v1: [1.7, 0.6], v2: [2.5, 0.85], L: 0.75, w: 0.23 },
  { b: [0.2, 0.4], v1: [0.2, 0.55], v2: [0.65, 0.9], L: 1.05, w: 0.33 },
  { b: [0.25, Math.PI], v1: [0.35, Math.PI], v2: [0.95, Math.PI], L: 1.1, w: 0.36, center: true },
  { b: [0.35, 1.5], v1: [0.5, 1.6], v2: [1.0, 1.75], L: 1.1, w: 0.34 },
  { b: [0.45, 2.35], v1: [0.6, 2.4], v2: [1.1, 2.5], L: 1.1, w: 0.34 },
  { b: [0.95, 1.5], v1: [1.25, 1.6], v2: [1.6, 1.75], L: 0.95, w: 0.3 },
  { b: [1.05, 2.15], v1: [1.4, 2.2], v2: [1.8, 2.35], L: 0.9, w: 0.3 },
  { b: [1.3, Math.PI], v1: [1.75, Math.PI], v2: [2.2, Math.PI], L: 0.75, w: 0.32, center: true },
  { b: [1.25, 2.7], v1: [1.65, 2.75], v2: [2.1, 2.8], L: 0.75, w: 0.3 },
  { b: [0.5, 0.95], v1: [0.75, 1.05], v2: [1.3, 1.25], L: 0.9, w: 0.32 },
  { b: [0.7, 2.85], v1: [0.9, 2.9], v2: [1.5, 2.95], L: 0.9, w: 0.33 },
  { b: [1.45, 1.22], v1: [2.35, 1.28], v2: [2.7, 1.2], L: 0.4, w: 0.12 },
];

// Yamcha (pelo largo): flequillo en picos y melena de picos largos que cae por la espalda.
const YAMCHA = [
  { b: [0.5, 0.05], v1: [1.2, 0.1], v2: [2.2, 0.15], L: 0.6, w: 0.16 },
  { b: [0.6, 0.45], v1: [1.3, 0.55], v2: [2.1, 0.8], L: 0.6, w: 0.15 },
  { b: [0.25, 0.3], v1: [0.4, 0.5], v2: [1.3, 1.2], L: 1.0, w: 0.24 },
  { b: [0.85, 1.4], v1: [1.4, 1.6], v2: [2.4, 1.8], L: 1.6, w: 0.25 },
  { b: [0.7, 2.0], v1: [1.3, 2.2], v2: [2.5, 2.4], L: 2.0, w: 0.26 },
  { b: [0.4, Math.PI], v1: [0.9, Math.PI], v2: [2.6, Math.PI], L: 2.8, w: 0.3, center: true },
  { b: [0.6, 2.6], v1: [1.1, 2.65], v2: [2.6, 2.75], L: 2.5, w: 0.28 },
  { b: [1.1, 2.85], v1: [1.6, 2.9], v2: [2.7, 2.95], L: 2.1, w: 0.26 },
  { b: [0.2, 1.2], v1: [0.6, 1.5], v2: [2.0, 1.9], L: 1.4, w: 0.25 },
  { b: [0.35, 2.3], v1: [0.8, 2.4], v2: [2.4, 2.6], L: 2.2, w: 0.27 },
  { b: [1.45, 1.22], v1: [2.35, 1.28], v2: [2.7, 1.2], L: 0.45, w: 0.11 },
];

// Yajirobee: greña espesa y desprolija, flequillo pesado sobre la frente, todo cae hacia abajo.
const YAJIROBE = [
  { b: [0.45, 0], v1: [1.1, 0], v2: [1.9, 0], L: 0.7, w: 0.2, center: true },
  { b: [0.5, 0.4], v1: [1.15, 0.45], v2: [1.9, 0.6], L: 0.7, w: 0.19 },
  { b: [0.65, 0.85], v1: [1.3, 0.95], v2: [1.95, 1.1], L: 0.65, w: 0.18 },
  { b: [0.15, 0.5], v1: [0.5, 0.8], v2: [1.2, 1.2], L: 0.8, w: 0.24 },
  { b: [0.3, 2.0], v1: [0.7, 2.1], v2: [1.4, 2.2], L: 0.85, w: 0.24 },
  { b: [0.3, Math.PI], v1: [0.7, Math.PI], v2: [1.5, Math.PI], L: 0.85, w: 0.26, center: true },
  { b: [0.95, 1.45], v1: [1.5, 1.55], v2: [2.1, 1.6], L: 0.8, w: 0.23 },
  { b: [0.9, 2.1], v1: [1.45, 2.2], v2: [2.15, 2.3], L: 0.85, w: 0.23 },
  { b: [1.2, Math.PI], v1: [1.7, Math.PI], v2: [2.3, Math.PI], L: 0.85, w: 0.25, center: true },
  { b: [1.15, 2.6], v1: [1.65, 2.65], v2: [2.25, 2.7], L: 0.8, w: 0.23 },
  { b: [0.55, 1.15], v1: [1.0, 1.25], v2: [1.6, 1.4], L: 0.75, w: 0.22 },
  { b: [0.65, 2.75], v1: [1.1, 2.8], v2: [1.8, 2.85], L: 0.8, w: 0.23 },
];

// Raditz: mechones anchos que bajan por la espalda (largo = semiejes X de cabeza), centro más largo.
const RADITZ = [
  { b: [0.9, Math.PI], v1: [2.75, Math.PI], v2: [3.10, Math.PI], L: 9, w: 0.75, center: true },
  { b: [0.85, 2.75], v1: [2.75, 2.75], v2: [3.10, 2.7], L: 8.5, w: 0.72 },
  { b: [0.85, 2.35], v1: [2.70, 2.3], v2: [3.05, 2.2], L: 7.5, w: 0.7 },
  { b: [0.95, 1.95], v1: [2.2, 2.3], v2: [2.9, 2.6], L: 5.0, w: 0.62 },
  { b: [1.05, 1.6], v1: [2.0, 2.2], v2: [2.8, 2.5], L: 3.2, w: 0.5 },
  { b: [1.35, 2.95], v1: [2.85, 2.95], v2: [3.10, 2.9], L: 8.0, w: 0.65 },
  { b: [1.35, 2.5], v1: [2.85, 2.5], v2: [3.10, 2.4], L: 7.0, w: 0.62 },
  { b: [1.4, 2.1], v1: [2.3, 2.4], v2: [3.0, 2.5], L: 5.4, w: 0.55 },
  { b: [0.55, 2.95], v1: [2.50, 2.95], v2: [3.05, 2.9], L: 8.0, w: 0.6 },
  { b: [0.6, 2.2], v1: [2.50, 2.3], v2: [3.00, 2.4], L: 6.0, w: 0.55 },
];

// Rey Vegeta: llama de picos hacia arriba con entradas, + barba y bigote.
const KING_VEGETA = [
  { b: [0.5, 0], v1: [0.15, 0], v2: [0.3, Math.PI], L: 1.6, w: 0.34, center: true },
  { b: [0.5, 0.5], v1: [0.2, 0.6], v2: [0.35, 2.0], L: 1.5, w: 0.32 },
  { b: [0.6, 1.1], v1: [0.3, 1.3], v2: [0.4, 2.0], L: 1.45, w: 0.32 },
  { b: [0.7, 1.6], v1: [0.4, 1.8], v2: [0.5, 2.2], L: 1.35, w: 0.3 },
  { b: [0.8, 2.2], v1: [0.45, 2.4], v2: [0.55, 2.7], L: 1.3, w: 0.3 },
  { b: [0.8, Math.PI], v1: [0.45, Math.PI], v2: [0.6, Math.PI], L: 1.35, w: 0.32, center: true },
  { b: [0.25, 1.0], v1: [0.1, 1.2], v2: [0.25, 2.5], L: 1.7, w: 0.34 },
  { b: [0.35, 2.4], v1: [0.15, 2.6], v2: [0.3, 2.9], L: 1.6, w: 0.34 },
];

/** Barba de una pieza pegada a la cara (patillas → mentón) + bigote. Ángulos como sph(). */
function beard(F, { top = 2.12, side = 1.5, bot = 2.75, th = 0.09, mus = true } = {}) {
  const out = { pos: [], idx: [] };
  const A = F.ax;
  const lerp = THREE.MathUtils.lerp;
  const pt = (d, lift) => d.clone().multiplyScalar(F.surf(d) + lift).add(F.c);
  const sheet = (I, J, phMax, fTh, fLift) => {
    const base = out.pos.length / 3;
    for (let i = 0; i <= I; i++) {
      const ph = -phMax + (i / I) * phMax * 2;
      const a = Math.abs(ph) / phMax;
      for (let j = 0; j <= J; j++) {
        const t = j / J;
        const p = pt(sph(fTh(a, t), ph), fLift(a, t) * A);
        out.pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < I; i++)
      for (let j = 0; j < J; j++) {
        const a = base + i * (J + 1) + j;
        const b = a + J + 1;
        out.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
  };
  const edge = (a, t) => Math.sqrt(Math.sin(Math.PI * t)) * (1 - a ** 6);
  sheet(28, 12, 1.4,
    (a, t) => lerp(lerp(top, side, a ** 1.4), lerp(bot, side + 0.7, a ** 2), t),
    (a, t) => th * edge(a, t) * (1 + 0.8 * t * (1 - a)) - 0.005);
  if (mus)
    sheet(16, 4, 0.7,
      (a, t) => lerp(1.9 + 0.08 * a * a, 2.0 + 0.22 * a * a, t),
      (a, t) => 0.035 * edge(a, t) - 0.003);
  return out;
}

// Tooma: picos que suben desde la frente y se peinan hacia atrás.
const TOOMA = [
  { b: [0.6, 0.12], v1: [0.25, 0.1], v2: [0.75, 2.9], L: 0.95, w: 0.24 },
  { b: [0.65, 0.55], v1: [0.35, 0.7], v2: [0.9, 2.6], L: 0.9, w: 0.23 },
  { b: [0.3, 0], v1: [0.3, 2.8], v2: [0.9, 3.0], L: 1.1, w: 0.3, center: true },
  { b: [0.35, 1.3], v1: [0.5, 1.8], v2: [1.0, 2.4], L: 1.0, w: 0.28 },
  { b: [0.4, Math.PI], v1: [0.7, Math.PI], v2: [1.2, Math.PI], L: 1.0, w: 0.3, center: true },
  { b: [0.6, 2.3], v1: [0.85, 2.4], v2: [1.3, 2.6], L: 0.95, w: 0.28 },
  { b: [0.95, 1.6], v1: [1.2, 1.9], v2: [1.6, 2.3], L: 0.8, w: 0.26 },
  { b: [1.2, 2.6], v1: [1.6, 2.7], v2: [2.0, 2.8], L: 0.6, w: 0.26 },
  { b: [1.45, 1.22], v1: [2.35, 1.28], v2: [2.7, 1.2], L: 0.35, w: 0.11 },
];

// Rikum: picos grandes hacia arriba y afuera (llama).
const RIKUM = [
  { b: [0.6, 0.15], v1: [0.2, 0.2], v2: [0.5, 0.4], L: 1.1, w: 0.26 },
  { b: [0.65, 0.6], v1: [0.4, 0.8], v2: [0.8, 1.2], L: 1.1, w: 0.26 },
  { b: [0.2, 0], v1: [0.1, 0], v2: [0.3, 2.5], L: 1.3, w: 0.32, center: true },
  { b: [0.35, 1.2], v1: [0.4, 1.4], v2: [0.9, 1.6], L: 1.3, w: 0.32 },
  { b: [0.35, 2.4], v1: [0.5, 2.5], v2: [1.0, 2.6], L: 1.3, w: 0.32 },
  { b: [0.45, Math.PI], v1: [0.6, Math.PI], v2: [1.1, Math.PI], L: 1.2, w: 0.32, center: true },
  { b: [0.85, 1.7], v1: [1.0, 1.7], v2: [1.3, 1.9], L: 1.1, w: 0.3 },
  { b: [1.1, 2.5], v1: [1.4, 2.6], v2: [1.8, 2.7], L: 0.85, w: 0.3 },
  { b: [1.3, Math.PI], v1: [1.7, Math.PI], v2: [2.1, Math.PI], L: 0.7, w: 0.3, center: true },
  { b: [1.45, 1.22], v1: [2.35, 1.28], v2: [2.7, 1.2], L: 0.35, w: 0.11 },
];

/** Une dos peinados (pos/idx/uv) en uno; el segundo hereda uv 0 si no tiene. */
function joinOut(a, b) {
  const off = a.pos.length / 3;
  const out = { ...a, pos: a.pos.concat(b.pos), idx: a.idx.concat(b.idx.map((i) => i + off)) };
  if (a.uv || b.uv) {
    const fill = (o) => o.uv ?? new Array((o.pos.length / 3) * 2).fill(0);
    out.uv = fill(a).concat(fill(b));
  }
  return out;
}

/** Afro (Mr. Satan): masa de bollos rizados sobre cráneo y costados; cara despejada. */
function afro(F, o = {}) {
  const out = { pos: [], idx: [], uv: [] };
  const A = F.ax;
  const pt = (d, lift) => d.clone().multiplyScalar(F.surf(d) + lift).add(F.c);
  scalpCap(out, pt, 0.6, 1.65, 0.05 * A, 0.03 * A);
  const sg = new THREE.SphereGeometry(1, 8, 6);
  const sp = sg.attributes.position;
  const suv = sg.attributes.uv;
  const six = sg.index.array;
  const thMax = o.thMax ?? 1.7;
  const front = o.front ?? 0.62;
  let n = 3;
  for (let k = 0; k < (o.n ?? 170); k++) {
    const th = Math.acos(1 - hash(n++) * (1 - Math.cos(thMax)));
    const ph = (hash(n++) * 2 - 1) * Math.PI;
    if (Math.abs(ph) < 1.05 && th > front) continue;
    const d = sph(th, ph);
    // más alto arriba/atrás, más chato en la nuca y junto a la cara
    const puff = 1 - 0.45 * THREE.MathUtils.smoothstep(th, 1.1, thMax) - 0.25 * Math.max(0, Math.cos(ph)) * THREE.MathUtils.smoothstep(th, 0.3, 0.9);
    const P = pt(d, (o.lift ?? 0.42) * A * F.r * puff * (0.75 + 0.25 * hash(n++)));
    const r = (0.2 + hash(n++) * 0.14) * A * F.r * (0.7 + 0.3 * puff);
    const base = out.pos.length / 3;
    const seed = hash(n++) * 100;
    for (let v = 0; v < sp.count; v++) {
      const x = sp.getX(v);
      const y = sp.getY(v);
      const z = sp.getZ(v);
      const bump = 1 + 0.25 * (hash(seed + Math.round((x * 3 + y * 7 + z * 13) * 10)) - 0.5);
      out.pos.push(P.x + x * r * bump, P.y + y * r * bump, P.z + z * r * bump);
      out.uv.push(suv.getX(v) * 2 + k * 0.37, suv.getY(v) + k * 0.21);
    }
    for (const t of six) out.idx.push(base + t);
  }
  sg.dispose();
  out.strandTex = true;
  return out;
}

/**
 * Melena "batida": una sola masa (cáscara exterior + interior unidas en el borde).
 * Columnas alrededor de la cabeza; adelante terminan en flequillo sobre la frente, atrás cuelgan.
 * Borde inferior en zigzag (picos), bultos y surcos suaves para que no parezca casco.
 */
function mane(F, o) {
  const out = { pos: [], idx: [] };
  const A = F.ax;
  const I = o.cols ?? 96;
  const M = o.rows ?? 26;
  const pt = (d, lift) => d.clone().multiplyScalar(F.surf(d) + lift).add(F.c);
  const ss = THREE.MathUtils.smoothstep;
  const lerp = THREE.MathUtils.lerp;
  const tri = (x) => 1 - Math.abs((((x / Math.PI) % 2) + 2) % 2 - 1) * 2;
  const thE = Math.PI / 2 - 0.1;

  const column = (ph, outer) => {
    const a = Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph)));
    const h = ss(a, 1.0, 1.75);
    const zig = tri(ph * (o.spikes ?? 14) + 0.5);
    const thEnd = lerp((o.fringeTh ?? 1.08) + 0.14 * zig, thE, h);
    const liftEnd = lerp((o.frontLift ?? 0.05) * A * F.r, o.lift * A * F.r * 1.1, h);
    const pts = [];
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const lk = o.smooth ? 0.15 : 1;
      const lump = 1 + (0.2 * Math.sin(ph * 7 + s * 5) * Math.sin(ph * 3.3 + 1.7)
        + 0.14 * Math.sin(ph * 13 + s * 9) * Math.sin(ph * 5 - s * 6) * s) * lk;
      let cop = 1 + (o.copete ?? 0) * (1 - h) * Math.sin(Math.PI * Math.min(1, s * 1.15));
      // raya al medio "a dos aguas": el volumen cae en la raya y sube a cada lado
      if (o.part) cop *= lerp(1, lerp(1 - o.part, 1 + o.part * 0.25, ss(a, 0.04, 0.45)), (1 - h) * ss(s, 0.15, 0.6));
      const lift = outer ? lerp(o.lift * A * F.r, liftEnd, Math.pow(s, 1.6)) * lump * cop : 0.02 * A;
      pts.push(pt(sph(Math.max(0.001, thEnd * s), ph), lift));
    }
    const curl = 1 - ss(a, 0.6, 1.0);
    if (outer && o.copete && h <= 0.01) {
      // copete: el borde frontal se enrolla hacia el cuero cabelludo en vez de caer sobre la frente
      const pE = pts[pts.length - 1];
      pts.push(pE.clone().lerp(pt(sph(thEnd + 0.1, ph), 0.03 * A), Math.max(0.02, curl)));
    }
    if (h > 0.01) {
      const pE = pts[pts.length - 1];
      const R = Math.hypot(pE.x - F.c.x, pE.z - F.c.z);
      const hx = Math.sin(ph);
      const hz = Math.cos(ph);
      const cutY = F.c.y - F.ay * ((o.cut + o.cutBack * Math.max(0, -Math.cos(ph))) * F.len + (o.zig ?? 0.3) * zig);
      const yEnd = lerp(pE.y, cutY, h);
      for (const f of [0.3, 0.6, 0.85, 1]) {
        const ridge = outer ? 1 + (0.1 * Math.sin(ph * 9 + f * 6) * Math.sin(ph * 5 - f * 4) + 0.06 * Math.sin(ph * 17 + f * 11)) * f * (o.smooth ? 0.2 : 1) : 1;
        const rk = (1 + (o.flare ?? 0.5) * Math.pow(f, 0.8) * h) * (outer ? 1 : lerp(1, 0.86, h)) * ridge;
        const zb = (o.fallBack ?? 0) * A * f * h;
        pts.push(new THREE.Vector3(F.c.x + hx * R * rk, pE.y + (yEnd - pE.y) * f, F.c.z + hz * R * rk - zb));
      }
    }
    return new THREE.CatmullRomCurve3(pts, false, "centripetal").getSpacedPoints(M);
  };

  out.uv = [];
  const shell = (outer) => {
    const base = out.pos.length / 3;
    for (let i = 0; i <= I; i++) {
      const P = column(-Math.PI + (i / I) * Math.PI * 2, outer);
      P.forEach((p, j) => {
        out.pos.push(p.x, p.y, p.z);
        out.uv.push((i / I) * 6, (j / M) * 4);
      });
    }
    for (let i = 0; i < I; i++) {
      const i1 = i + 1;
      for (let j = 0; j < M; j++) {
        const a = base + i * (M + 1) + j;
        const b = base + i1 * (M + 1) + j;
        out.idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return base;
  };
  const bo = shell(true);
  const bi = shell(false);
  // borde: une la última fila exterior con la interior (espesor de la melena)
  for (let i = 0; i < I; i++) {
    const i1 = i + 1;
    const a = bo + i * (M + 1) + M;
    const b = bo + i1 * (M + 1) + M;
    const c = bi + i1 * (M + 1) + M;
    const d = bi + i * (M + 1) + M;
    out.idx.push(a, d, b, b, d, c);
  }
  // mechones-esponja que sobresalen del contorno (rompen la silueta de bloque)
  const sg = new THREE.SphereGeometry(1, 7, 5);
  const sp = sg.attributes.position;
  const suv = sg.attributes.uv;
  const six = sg.index.array;
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  let n = 7;
  for (let k = 0; k < (o.tufts ?? 0); k++) {
    const i = Math.floor(hash(n++) * I);
    const j = 1 + Math.floor(hash(n++) * M);
    const vi = (bo + i * (M + 1) + j) * 3;
    P.set(out.pos[vi], out.pos[vi + 1], out.pos[vi + 2]);
    D.copy(P).sub(F.c);
    const low = P.y < F.c.y;
    if (low) D.y = 0;
    D.normalize();
    const r = (0.16 + hash(n++) * 0.16) * A;
    const sx = 0.85 + hash(n++) * 0.4;
    // abajo: mechones alargados hacia abajo (lock batido); arriba: bollos
    const sy = low ? 1.3 + hash(n++) * 0.9 : 0.8 + hash(n++) * 0.4;
    const base = out.pos.length / 3;
    const seed = hash(n++) * 100;
    for (let v = 0; v < sp.count; v++) {
      const x = sp.getX(v);
      const y = sp.getY(v);
      const z = sp.getZ(v);
      const bump = 1 + 0.28 * (hash(seed + Math.round((x * 3 + y * 7 + z * 13) * 10)) - 0.5);
      out.pos.push(
        P.x - D.x * r * 0.15 + x * r * sx * bump,
        P.y + y * r * sy * bump - (low ? r * sy * 0.4 : 0),
        P.z - D.z * r * 0.15 + z * r * sx * bump,
      );
      out.uv.push(suv.getX(v) * 2 + k * 0.37, suv.getY(v) + k * 0.21);
    }
    for (const t of six) out.idx.push(base + t);
  }
  sg.dispose();
  out.strandTex = !o.smooth;
  out.sway = true;
  return out;
}

// Física de melena: desplaza vértices según altura (raíz fija, puntas sueltas) con dos resortes (medio + puntas).
function maneSway(mesh, F) {
  const pos = mesh.geometry.attributes.position;
  const base = Float32Array.from(pos.array);
  const N = pos.count;
  const w = new Float32Array(N);
  const top = F.c.y - F.ay * 0.15;
  const span = F.ay * 2.6;
  for (let v = 0; v < N; v++) {
    const y = base[v * 3 + 1];
    w[v] = Math.pow(THREE.MathUtils.clamp((top - y) / span, 0, 1), 1.3);
  }
  const g = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const d1 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const d2 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const f = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const lim = F.ay * 0.7;
  let init = false;
  let t = 0;
  // Solo simular si se dibujó el frame anterior (fuera de cámara no se reescribe el buffer).
  let seen = true;
  mesh.onBeforeRender = () => {
    seen = true;
  };
  return {
    update(dt) {
      if (dt <= 0 || !seen) return;
      seen = false;
      dt = Math.min(dt, 0.05);
      t += dt;
      mesh.getWorldPosition(g);
      if (!init) {
        prev.copy(g);
        init = true;
      }
      vel.copy(g).sub(prev).divideScalar(dt);
      acc.copy(vel).sub(pv).divideScalar(dt).clampLength(0, 60);
      pv.copy(vel);
      prev.copy(g);
      mesh.getWorldQuaternion(q).invert();
      // inercia (opuesta a la aceleración) + brisa leve, en espacio local
      f.copy(acc).multiplyScalar(-0.012 * F.ay).applyQuaternion(q);
      f.x += Math.sin(t * 1.7) * 0.15 * F.ay;
      f.z += Math.sin(t * 1.3 + 1) * 0.1 * F.ay;
      v1.addScaledVector(tmp.copy(f).sub(d1).multiplyScalar(60), dt).multiplyScalar(1 - 6 * dt);
      d1.addScaledVector(v1, dt).clampLength(0, lim);
      v2.addScaledVector(tmp.copy(d1).multiplyScalar(1.4).sub(d2).multiplyScalar(30), dt).multiplyScalar(1 - 4 * dt);
      d2.addScaledVector(v2, dt).clampLength(0, lim * 1.4);
      const a = pos.array;
      for (let v = 0; v < N; v++) {
        const wv = w[v];
        if (wv === 0) continue;
        const w2 = wv * wv;
        const i = v * 3;
        a[i] = base[i] + d1.x * wv + (d2.x - d1.x) * w2;
        a[i + 1] = base[i + 1] + (d1.y * wv + (d2.y - d1.y) * w2) * 0.5;
        a[i + 2] = base[i + 2] + d1.z * wv + (d2.z - d1.z) * w2;
      }
      pos.needsUpdate = true;
    },
  };
}

let _strandTex = null;
// Textura esponja (tileable): bultos redondos claros + poros oscuros, para pelo batido.
function strandTexture() {
  if (_strandTex) return _strandTex;
  const W = 256;
  const H = 256;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "#a8a8a8";
  g.fillRect(0, 0, W, H);
  let n = 1;
  const blob = (x, y, r, v, a) => {
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  };
  for (let k = 0; k < 90; k++) blob(hash(n++) * W, hash(n++) * H, 14 + hash(n++) * 26, 255, 0.55);
  for (let k = 0; k < 160; k++) blob(hash(n++) * W, hash(n++) * H, 6 + hash(n++) * 12, 230, 0.6);
  for (let k = 0; k < 200; k++) blob(hash(n++) * W, hash(n++) * H, 2 + hash(n++) * 5, 110, 0.45);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _strandTex = tex;
  return tex;
}

// Pseudo-aleatorio estable por índice (sin Math.random: mismo peinado en cada rebuild).
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Melena carré con raya al medio: mechones suben desde la raya, se abren al costado y caen rectos.
 * o.rise: perfil de altura [k, liftMul] (más alto = "dos aguas" más marcadas).
 * o.cut / o.cutFront: largo (en semiejes Y de cabeza). o.jitter: variación de largo por mechón.
 */
function bob(F, o) {
  const out = { pos: [], idx: [] };
  const A = F.ax;
  const partX = o.partX ?? -0.02;
  const pt = (d, lift) => d.clone().multiplyScalar(F.surf(d) + lift).add(F.c);
  const rise = o.rise ?? [[0.18, 1.7], [0.42, 1.45], [0.7, 1.15]];
  let sid = 0;

  const strand = (sd, u, { lift = (o.lift ?? 0.09) * A * F.r, w = (o.w ?? 0.13) * A * F.r, t = (o.t ?? 0.065) * A * F.r, inner = 0 } = {}) => {
    sid++;
    // raíz sobre la raya, empezando atrás de la frente (frente libre)
    const alpha = 0.42 - u * 1.22;
    const dRoot = new THREE.Vector3(partX + sd * (o.partGap ?? 0.012), Math.cos(alpha), Math.sin(alpha)).normalize();
    const thR = Math.acos(THREE.MathUtils.clamp(dRoot.y, -1, 1));
    const phR = sd * Math.abs(Math.atan2(dRoot.x, dRoot.z));
    const phiE = sd * (1.12 + u * (Math.PI - 1.12));
    const thE = Math.PI / 2 - 0.08;
    const dEq = sph(thE, phiE);
    // primero sube y se abre al costado sin bajar (theta lento), después cae
    const pts = [pt(dRoot, lift * 0.3)];
    for (const [k, lk] of rise) {
      const th = thR + (thE - thR) * k * k;
      const ph = phR + (phiE - phR) * Math.min(1, k * 1.5);
      pts.push(pt(sph(th, ph), lift * lk));
    }
    const pEq = pt(dEq, lift);
    pts.push(pEq);
    const R = Math.hypot(pEq.x - F.c.x, pEq.z - F.c.z) - inner;
    const h = new THREE.Vector3(Math.sin(phiE), 0, Math.cos(phiE));
    const cutY =
      F.c.y -
      F.ay *
        ((o.cut ?? 0.8) * F.len +
          (o.cutFront ?? 0.1) * Math.max(0, Math.cos(phiE)) +
          (o.cutBack ?? 0) * Math.max(0, -Math.cos(phiE)) +
          (o.jitter ?? 0) * (hash(sid) - 0.5));
    for (const [f, rk] of o.fall ?? [[0.35, 1.02], [0.72, 1.04], [1, 1.0]]) {
      const y = pEq.y + (cutY - pEq.y) * f;
      // fallBack: la melena larga se va hacia atrás (pasa por detrás de hombros/espalda)
      const zb = (o.fallBack ?? 0) * A * f;
      pts.push(new THREE.Vector3(F.c.x + h.x * R * rk, y, F.c.z + h.z * R * rk - zb));
    }
    addStrand(out, F, pts, { w, t, tipW: o.tipW ?? 0.8, seg: o.seg ?? 20 });
  };

  // flequillo: mechones cortos desde la línea del pelo hasta las cejas
  for (let i = 0; i < (o.fringe ?? 0); i++) {
    const ph = (i / Math.max(1, o.fringe - 1) - 0.5) * 1.5;
    const fr = [
      pt(sph(0.4, ph * 0.6), 0.04 * A),
      pt(sph(0.7, ph * 0.9), 0.13 * A),
      pt(sph(1.05, ph * 1.05), 0.09 * A),
      pt(sph(1.32 + (hash(i + 50) - 0.5) * 0.12, ph * 1.15), 0.05 * A),
    ];
    addStrand(out, F, fr, { w: 0.1 * A, t: 0.045 * A, tipW: 0.1, seg: 12 });
  }

  const n = o.n ?? 14;
  for (const sd of [-1, 1]) {
    for (let i = 0; i < n; i++) strand(sd, i / (n - 1));
    // capa interna desfasada: rellena huecos entre mechones
    for (let i = 0; i < n - 1; i++) strand(sd, (i + 0.5) / (n - 1), { lift: 0.06 * A, w: 0.12 * A, inner: 0.02 * A });
  }

  scalpCap(out, pt, 0.42, 1.5, 0.03 * A);

  if (!o.bang) return out;
  // mechón suelto que cruza la frente hacia la mejilla (lado derecho del personaje = -X)
  const dR = new THREE.Vector3(partX - 0.02, Math.cos(0.42), Math.sin(0.42)).normalize();
  const bang = [
    pt(dR, 0.04 * A),
    pt(sph(0.6, -0.2), 0.14 * A),
    pt(sph(0.95, -0.35), 0.1 * A),
    pt(sph(1.3, -0.45), 0.06 * A),
    ...(o.bangShort ? [] : [pt(sph(1.75, -0.55), 0.05 * A), pt(sph(2.05, -0.62), 0.04 * A)]),
  ];
  addStrand(out, F, bang, { w: 0.05 * A, t: 0.03 * A, tipW: 0.35, seg: 16 });

  return out;
}

const STYLES = {
  spikyBardock: (F) => spiky(F, BARDOCK, { vol: 0.2, wMul: 1.35 }),
  // Jeice: melena batida (una masa), muy voluminosa, flequillo en picos, cae ensanchándose por la espalda.
  jeice: (F) => mane(F, { frontLift: 0.3, fringeTh: 0.52, copete: 0.5, tufts: 230, lift: 0.32, cut: 1.5, cutBack: 1.4, flare: 0.55, fallBack: 0.8, zig: 0.32, spikes: 14 }),
  // Nº18: carré a la mandíbula, mechón suelto sobre la frente.
  bob18: (F) => bob(F, { bang: true }),
  // Nº17: igual base, raya marcada a dos aguas (sube mucho al lado de la raya), más largo, puntas desparejas.
  bob17: (F) =>
    bob(F, {
      partX: 0,
      partGap: 0.05,
      rise: [[0.1, 4.6], [0.28, 4.1], [0.5, 2.7], [0.78, 1.4]],
      cut: 0.7,
      cutFront: 0.04,
      jitter: 0.12,
      w: 0.135,
      t: 0.07,
    }),
  // Trunks del futuro: raya al medio, lacio y pegado, cae recto tapando orejas hasta la mandíbula; cortinas a los lados de la cara.
  bobTrunks: (F) =>
    bob(F, {
      partX: 0,
      partGap: 0.03,
      lift: 0.06,
      rise: [[0.15, 1.6], [0.4, 1.45], [0.7, 1.2]],
      fall: [[0.35, 1.0], [0.72, 1.0], [1, 0.97]],
      cut: 0.62,
      cutFront: 0.12,
      jitter: 0.07,
      n: 16,
      w: 0.12,
      t: 0.05,
    }),
  // Gohan niño (Namek): taza lacia y voluminosa, flequillo en puntas hasta las cejas, orejas libres.
  gohanKid: (F) => mane(F, { smooth: true, frontLift: 0.16, fringeTh: 1.15, lift: 0.28, cut: -0.3, cutBack: 0.8, flare: 0.1, zig: 0.1, spikes: 18, tufts: 0 }),
  fgohan: (F) => spiky(F, FGOHAN, { thFront: 0.8, vol: 0.18, tMul: 0.85 }),
  // Yamcha (DB): melena espesa en picos que cae hasta media espalda, flequillo en picos.
  yamcha: (F) => mane(F, { frontLift: 0.1, fringeTh: 1.0, lift: 0.16, cut: 1.2, cutBack: 1.7, flare: 0.3, fallBack: 0.45, zig: 0.6, spikes: 11, tufts: 0 }),
  // Yajirobee: greña tipo casco desprolijo, flequillo hasta las cejas, puntas desparejas.
  yajirobe: (F) => mane(F, { frontLift: 0.05, fringeTh: 1.15, lift: 0.1, cut: 0.25, cutBack: 0.35, flare: 0.08, zig: 0.25, spikes: 16, tufts: 0 }),
  satan: (F) => afro(F),
  kingVegeta: (F) => joinOut(spiky(F, KING_VEGETA, { thFront: 0.75, vol: 0.22, wMul: 1.4, tMul: 0.6 }), beard(F)),
  tooma: (F) => spiky(F, TOOMA, { thFront: 0.6, vol: 0.2, wMul: 1.6, tMul: 0.6 }),
  rikum: (F) => spiky(F, RIKUM, { thFront: 0.6, vol: 0.2, wMul: 1.25, tMul: 0.6 }),
  // Raditz: frente despejada, masa voluminosa y mechones grandes en punta que caen hasta las rodillas.
  raditzLong: (F) =>
    joinOut(
      mane(F, { smooth: true, frontLift: 0.5, fringeTh: 0.55, copete: 0.7, part: 0.7, lift: 0.34, cut: 0.6, cutBack: 2.6, flare: 0.6, fallBack: 0, zig: 0.8, spikes: 9, tufts: 0 }),
      spiky(F, RADITZ, { thFront: 0.5, vol: 0.2, tMul: 0.5, wMul: 1.4 })
    ),
  // Zaabon: dos aguas, melena a la mandíbula que tapa orejas, mechón largo suelto, trenza en la nuca.
  zaabon: (F) => ({
    ...bob(F, {
      partX: 0,
      partGap: 0.04,
      lift: 0.1,
      rise: [[0.1, 3.8], [0.3, 3.4], [0.55, 2.3], [0.8, 1.4]],
      fall: [[0.35, 1.03], [0.72, 1.02], [1, 0.95]],
      cut: 0.9,
      cutFront: 0.08,
      cutBack: -0.42,
      jitter: 0.06,
      w: 0.14,
      t: 0.07,
      bang: true,
    }),
    braid: { segs: 8, len: 0.24, r0: 0.27, r1: 0.18, y: -0.5, band: 0xffc107 },
  }),
};

/** Trenza: cadena de grupos con lóbulos alternados; física de péndulo amortiguado (ver hairPhys.update). */
function buildBraid(F, mat, o) {
  const A = F.ax;
  const root = new THREE.Group();
  root.position.set(F.c.x, F.c.y + o.y * F.ay, F.c.z - F.az * 0.92);
  const lobeGeo = new THREE.SphereGeometry(1, 10, 8);
  const joints = [];
  let parent = root;
  for (let i = 0; i < o.segs; i++) {
    const j = new THREE.Group();
    if (i > 0) j.position.y = -o.len * A;
    parent.add(j);
    const r = THREE.MathUtils.lerp(o.r0, o.r1, i / (o.segs - 1)) * A;
    for (const side of [-1, 1]) {
      const lobe = new THREE.Mesh(lobeGeo, mat);
      lobe.scale.set(r * 0.85, o.len * A * 0.62, r * 0.7);
      lobe.position.set(side * r * 0.42, -o.len * A * (side > 0 ? 0.3 : 0.7), 0);
      lobe.rotation.z = side * 0.45;
      lobe.castShadow = true;
      j.add(lobe);
    }
    joints.push({ g: j, ax: 0, az: 0, vx: 0, vz: 0 });
    parent = j;
  }
  // anillo dorado + puntita
  const bandM = new THREE.MeshStandardMaterial({ color: o.band, metalness: 0.7, roughness: 0.35 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(o.r1 * A * 0.8, o.r1 * A * 0.8, o.len * A * 0.3, 12), bandM);
  band.position.y = -o.len * A;
  parent.add(band);
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(o.r1 * A * 0.9, o.len * A * 0.9, 8), mat);
  tuft.rotation.x = Math.PI;
  tuft.position.y = -o.len * A * 1.55;
  parent.add(tuft);

  const qp = new THREE.Quaternion();
  const g = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const acc = new THREE.Vector3();
  let init = false;
  root.userData.hairPhys = {
    update(dt) {
      if (dt <= 0) return;
      dt = Math.min(dt, 0.05);
      root.getWorldPosition(g);
      if (!init) {
        prev.copy(g);
        init = true;
      }
      vel.copy(g).sub(prev).divideScalar(dt);
      acc.copy(vel).sub(pv).divideScalar(dt).clampLength(0, 60);
      pv.copy(vel);
      prev.copy(g);
      for (let i = 0; i < joints.length; i++) {
        const J = joints[i];
        J.g.parent.getWorldQuaternion(qp).invert();
        // gravedad + inercia (pseudo-fuerza opuesta a la aceleración del anclaje), en espacio del padre
        g.set(-acc.x * 0.03, -1 - acc.y * 0.03, -acc.z * 0.03).applyQuaternion(qp).normalize();
        const tx = THREE.MathUtils.clamp(Math.atan2(-g.z, -g.y), -0.25, 1.5);
        const tz = THREE.MathUtils.clamp(Math.atan2(g.x, -g.y), -1.2, 1.2);
        const k = 70 - i * 4;
        J.vx += ((tx - J.ax) * k - J.vx * 7) * dt;
        J.vz += ((tz - J.az) * k - J.vz * 7) * dt;
        J.ax = THREE.MathUtils.clamp(J.ax + J.vx * dt, -0.25, 1.5);
        J.az += J.vz * dt;
        J.g.rotation.set(J.ax, 0, J.az);
      }
    },
  };
  return root;
}

export function hasHairStyle(name) {
  return !!STYLES[name];
}

/**
 * Devuelve un Group con el peinado, en coordenadas de headG (hermano de `head`).
 * Si tiene partes con física, group.userData.hairPhys = [{ update(dt) }].
 */
export function buildHairStyle(name, mat, head, { r = 1, len = 1 } = {}) {
  const fn = STYLES[name];
  if (!fn || !head) return null;
  const F = headFrame(head);
  F.r = r;
  F.len = len;
  const out = fn(F);
  if (out.braid) out.braid = { ...out.braid, len: out.braid.len * len, r0: out.braid.r0 * r, r1: out.braid.r1 * r };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setIndex(out.idx);
  if (out.uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(out.uv, 2));
  geo.computeVertexNormals();
  mat.side = THREE.DoubleSide;
  let hm = mat;
  if (out.strandTex) {
    const tex = strandTexture();
    hm = mat.clone();
    hm.map = tex;
    hm.bumpMap = tex;
    hm.bumpScale = 2.5;
    hm.roughness = 0.95;
    hm.metalness = 0;
    if ("sheen" in hm) hm.sheen = 0;
  }
  const m = new THREE.Mesh(geo, hm);
  m.castShadow = true;
  m.userData.moldId = `hair_${name}`;
  m.userData.moldFamily = "hair";
  const grp = new THREE.Group();
  grp.add(m);
  const phys = [];
  if (out.sway) phys.push(maneSway(m, F));
  if (out.braid) {
    const braid = buildBraid(F, mat, out.braid);
    grp.add(braid);
    phys.push(braid.userData.hairPhys);
  }
  if (phys.length) grp.userData.hairPhys = phys;
  return grp;
}
