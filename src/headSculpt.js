import * as THREE from "three";

// Cabezas esculpidas: primitivas (elipsoides) unidas/restadas en suave (SDF), proyectadas sobre una esfera
// densa desde el centro de la cabeza. Unidades = espacio final de la cabeza con s = 1 (+Y arriba, +Z frente).
// Cada pieza: { c: [x,y,z], r: [rx,ry,rz], rx?: giro en X (positivo = la parte de atrás sube), rz?: giro en Z
// (negativo = la punta de arriba se abre hacia +X; se espeja), k?: suavizado, sub?: resta, mirror?: par ±X }
// Las piezas tienen que quedar "radiales" desde el origen: la superficie se busca con rayos desde (0,0,0).

const HEADS = {
  // Appule: cráneo grande que se va hacia atrás y arriba; cara angosta abajo-adelante, pómulos, labios marcados, mentón chico.
  appule: [
    { c: [0, 0.08, -0.05], r: [0.145, 0.15, 0.17], rx: 0.4 },
    { c: [0, -0.04, 0.045], r: [0.105, 0.12, 0.11], k: 0.06 },
    { c: [0, -0.155, 0.075], r: [0.05, 0.045, 0.05], k: 0.04 },
    { c: [0.07, -0.05, 0.085], r: [0.045, 0.045, 0.05], k: 0.03, mirror: true },
    { c: [0, 0.035, 0.105], r: [0.1, 0.032, 0.045], k: 0.035 },
    { c: [0, -0.085, 0.115], r: [0.055, 0.035, 0.04], k: 0.03 },
    { c: [0.115, 0.02, 0.07], r: [0.035, 0.035, 0.035], k: 0.03, sub: true, mirror: true },
    { c: [0.058, -0.018, 0.16], r: [0.03, 0.03, 0.03], k: 0.02, sub: true, mirror: true },
  ],
  // Cell (perfecto): cráneo chico, cara angosta y larga, pómulos angulosos; cresta en V de dos hojas que suben,
  // se abren y van un poco hacia atrás, unidas por una frente alta.
  cell: [
    { c: [0, 0, -0.01], r: [0.1, 0.12, 0.1] },
    { c: [0, -0.075, 0.03], r: [0.07, 0.08, 0.07], k: 0.04 },
    { c: [0.07, -0.04, 0.06], r: [0.035, 0.05, 0.04], k: 0.02, mirror: true },
    { c: [0, 0.03, 0.075], r: [0.085, 0.025, 0.035], k: 0.025 },
    { c: [0, 0.11, -0.03], r: [0.07, 0.1, 0.085], k: 0.05 },
    { c: [0.115, 0.13, -0.05], r: [0.04, 0.135, 0.075], rz: -0.6, rx: -0.35, k: 0.05, mirror: true },
    { c: [0.036, -0.019, 0.095], r: [0.022, 0.022, 0.022], k: 0.015, sub: true, mirror: true },
  ],
  // Kiwy (Cui): cráneo grande de dos lóbulos (hendidura al medio, frente → nuca) que sobresale sobre la cara,
  // muñones cilíndricos a los costados, ceja pesada en V, cara más angosta con boca ancha y mentón chico.
  kiwy: [
    // cara (primero: contiene el origen de los rayos): ancha a la altura de los ojos, se afina hacia el mentón
    { c: [0, 0, 0.03], r: [0.08, 0.055, 0.07] },
    // mandíbula en V (sin pera): dos lados que se cierran en punta bajo la boca
    { c: [0.03, -0.035, 0.045], r: [0.026, 0.055, 0.045], rz: -0.75, k: 0.015, mirror: true },
    // cráneo: ~1.5× el alto de la cara y ~1.8× su ancho
    // dos lóbulos que se tocan: el valle entre ambos es la hendidura (línea dibujada en la textura)
    { c: [0.05, 0.14, -0.015], r: [0.095, 0.125, 0.125], k: 0.015, mirror: true },
    // base de los muñones laterales (el cilindro va aparte, en EXTRAS)
    { c: [0.14, 0.12, -0.01], r: [0.03, 0.05, 0.05], k: 0.025, mirror: true },
    // ceño en V: el cráneo cae sobre los ojos
    { c: [0.05, 0.04, 0.08], r: [0.06, 0.03, 0.04], rz: 0.35, k: 0.03, mirror: true },
    { c: [0.052, -0.015, 0.055], r: [0.03, 0.03, 0.03], k: 0.025, mirror: true },
    { c: [0, -0.035, 0.068], r: [0.045, 0.02, 0.028], k: 0.02 },
    { c: [0.08, 0, 0], r: [0.015, 0.03, 0.02], k: 0.015, mirror: true },
    // nuca/base del cuello: baja hasta meterse en el cuello (si no, queda un hueco bajo el cráneo)
    { c: [0, -0.06, -0.015], r: [0.045, 0.065, 0.05], k: 0.035 },
    { c: [0.037, 0.012, 0.095], r: [0.02, 0.02, 0.02], k: 0.015, sub: true, mirror: true },
  ],
  // Ginyu: cráneo alto de dos lóbulos (más angosto que Cui, sin muñones) que baja a las sienes donde nacen
  // los cuernos; cara larga, pómulos marcados, mandíbula ancha y mentón cuadrado.
  ginyu: [
    { c: [0, -0.01, 0.02], r: [0.078, 0.095, 0.09] },
    { c: [0.048, 0.09, -0.01], r: [0.092, 0.13, 0.13], k: 0.02, mirror: true },
    { c: [0.1, 0.07, -0.01], r: [0.035, 0.045, 0.05], k: 0.04, mirror: true },
    // ceño en V: el arco de la ceja baja hacia el entrecejo
    { c: [0.042, 0.03, 0.094], r: [0.05, 0.022, 0.035], rz: 0.35, k: 0.02, mirror: true },
    { c: [0.07, -0.03, 0.06], r: [0.038, 0.04, 0.042], k: 0.025, mirror: true },
    { c: [0.03, -0.085, 0.05], r: [0.034, 0.05, 0.056], rz: -0.3, k: 0.03, mirror: true },
    // hocico bajo la nariz (base de los labios)
    { c: [0, -0.075, 0.075], r: [0.045, 0.03, 0.035], k: 0.03 },
    // mentón cuadrado y adelantado
    { c: [0, -0.116, 0.08], r: [0.03, 0.025, 0.034], k: 0.02 },
    { c: [0, -0.07, -0.04], r: [0.06, 0.075, 0.06], k: 0.04 },
    { c: [0.036, 0.0, 0.105], r: [0.022, 0.02, 0.02], k: 0.015, sub: true, mirror: true },
    // nariz: tabique recto desde el entrecejo, punta y aletas
    { c: [0, -0.022, 0.112], r: [0.01, 0.032, 0.015], rx: 0.4, k: 0.012 },
    { c: [0, -0.05, 0.124], r: [0.013, 0.011, 0.012], k: 0.01 },
    { c: [0.012, -0.053, 0.113], r: [0.009, 0.007, 0.009], k: 0.008, mirror: true },
    // labio de abajo (la boca es una malla aparte: media sonrisa)
    { c: [0, -0.09, 0.106], r: [0.024, 0.007, 0.008], k: 0.008 },
  ],
};

// Detalle por cabeza (se espeja en X): poros (textura del cráneo), zarcillos (tubos finos afinados) y
// muñones (cilindros de borde redondeado y punta hundida; base en c, apuntan hacia +X).
// Los muñones van como malla aparte porque salen de costado: los rayos desde el centro no los pueden seguir.
const EXTRAS = {
  kiwy: {
    pores: { n: 120, seed: 11, arcs: true, crease: [0.4, 0.55] },
    // boca pintada en la textura (sonrisa abierta): th = altura (fracción de π desde arriba), w/h en fracción de u/v
    mouth: { th: 0.6, w: 0.095, h: 0.11 },
    stubs: [{ c: [0.12, 0.12, -0.01], len: 0.09, r: 0.047 }],
    tendrils: [
      { pts: [[0.042, -0.03, 0.068], [0.068, -0.04, 0.06], [0.08, -0.062, 0.052], [0.078, -0.09, 0.048], [0.085, -0.102, 0.048]], r: 0.0045 },
    ],
  },
  ginyu: {
    // venas solo en relieve (sin trazo); groove = surco entre lóbulos hundido en la malla
    pores: { n: 0, veins: { n: 48, steps: 16, seed: 5, amp: 0.011, ridge: 3, blur: 2, curl: 1.4, taper: 0.25, groove: [0.4, 0.6] } },
  },
};

export const HEAD_SCULPTS = Object.keys(HEADS);

function compile(list) {
  const out = [];
  for (const p of list) {
    for (const sd of p.mirror ? [1, -1] : [1]) {
      out.push({
        cx: p.c[0] * sd, cy: p.c[1], cz: p.c[2],
        rx: p.r[0], ry: p.r[1], rz: p.r[2],
        cos: Math.cos(-(p.rx || 0)), sin: Math.sin(-(p.rx || 0)),
        zc: Math.cos(-(p.rz || 0) * sd), zs: Math.sin(-(p.rz || 0) * sd),
        k: p.k ?? 0.04, sub: !!p.sub,
      });
    }
  }
  return out;
}

// elipsoide: distancia aproximada (Quilez)
function ellip(P, x, y, z) {
  const qx = x - P.cx;
  const qy = y - P.cy;
  const px = qx * P.zc - qy * P.zs;
  const py0 = qx * P.zs + qy * P.zc;
  const pz0 = z - P.cz;
  const py = py0 * P.cos - pz0 * P.sin;
  const pz = py0 * P.sin + pz0 * P.cos;
  const k0 = Math.hypot(px / P.rx, py / P.ry, pz / P.rz);
  const k1 = Math.hypot(px / (P.rx * P.rx), py / (P.ry * P.ry), pz / (P.rz * P.rz));
  return k1 < 1e-9 ? -Math.min(P.rx, P.ry, P.rz) : (k0 * (k0 - 1)) / k1;
}

function sdf(prims, x, y, z) {
  let d = ellip(prims[0], x, y, z);
  for (let i = 1; i < prims.length; i++) {
    const P = prims[i];
    const e = ellip(P, x, y, z);
    const k = P.k;
    if (P.sub) {
      const h = THREE.MathUtils.clamp(0.5 - (0.5 * (d + e)) / k, 0, 1);
      d = THREE.MathUtils.lerp(d, -e, h) + k * h * (1 - h);
    } else {
      const h = THREE.MathUtils.clamp(0.5 + (0.5 * (e - d)) / k, 0, 1);
      d = THREE.MathUtils.lerp(e, d, h) - k * h * (1 - h);
    }
  }
  return d;
}

const _cache = new Map();

/** Geometría de cabeza esculpida en unidades finales (multiplicar por s·hk lo hace el que llama). */
function baseGeo(id) {
  if (_cache.has(id)) return _cache.get(id);
  const prims = compile(HEADS[id]);
  const V = EXTRAS[id]?.pores?.veins;
  // con venas en relieve hace falta más resolución (son más finas que una celda de 96×72)
  const geo = V ? new THREE.SphereGeometry(1, 288, 180) : new THREE.SphereGeometry(1, 96, 72);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const vh = V ? veinHeight(V) : null;
  // paso grueso + bisección (8 iteraciones ≈ 0.00006) da la misma precisión; un paso fino traba la carga (Ginyu: 52k vértices)
  const step = 0.016;
  const e = 0.0008;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i);
    const dy = pos.getY(i);
    const dz = pos.getZ(i);
    let t0 = 0;
    let t1 = 0.5;
    for (let t = step; t <= 0.5; t += step) {
      if (sdf(prims, dx * t, dy * t, dz * t) > 0) {
        t0 = t - step;
        t1 = t;
        break;
      }
    }
    for (let k = 0; k < 8; k++) {
      const tm = (t0 + t1) * 0.5;
      if (sdf(prims, dx * tm, dy * tm, dz * tm) > 0) t1 = tm;
      else t0 = tm;
    }
    let t = (t0 + t1) * 0.5;
    if (vh) {
      t += (V.amp ?? 0.005) * vh(uv.getX(i), uv.getY(i));
      pos.setXYZ(i, dx * t, dy * t, dz * t);
      continue;
    }
    const x = dx * t;
    const y = dy * t;
    const z = dz * t;
    pos.setXYZ(i, x, y, z);
    // normal = gradiente del campo (sin costura en el borde de UV de la esfera)
    const gx = sdf(prims, x + e, y, z) - sdf(prims, x - e, y, z);
    const gy = sdf(prims, x, y + e, z) - sdf(prims, x, y - e, z);
    const gz = sdf(prims, x, y, z + e) - sdf(prims, x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nor.setXYZ(i, gx / gl, gy / gl, gz / gl);
  }
  if (vh) {
    // normales de la malla (incluyen el relieve), promediadas en la costura y los polos de la esfera
    geo.computeVertexNormals();
    const acc = new Map();
    const key = (i) => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    for (let i = 0; i < pos.count; i++) {
      const kk = key(i);
      const a = acc.get(kk) ?? [0, 0, 0];
      a[0] += nor.getX(i);
      a[1] += nor.getY(i);
      a[2] += nor.getZ(i);
      acc.set(kk, a);
    }
    for (let i = 0; i < pos.count; i++) {
      const [ax, ay, az] = acc.get(key(i));
      const l = Math.hypot(ax, ay, az) || 1;
      nor.setXYZ(i, ax / l, ay / l, az / l);
    }
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  _cache.set(id, geo);
  return geo;
}

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const _veinSegs = new Map();

/** Venas: trazos ramificados que serpentean por el cráneo, en (θ, φ) de esfera; φ se corrige por sin θ. */
function veinSegs(V) {
  const key = JSON.stringify(V);
  if (_veinSegs.has(key)) return _veinSegs.get(key);
  const out = [];
  let m = V.seed ?? 1;
  const vein = (th, ph, a, steps, w) => {
    // curvatura propia por vena: arcos y lazos en vez de grietas en zigzag
    let cu = (hash(m++) - 0.5) * (V.curl ?? 0.9);
    for (let s = 0; s < steps; s++) {
      // a veces la vena cambia el sentido de giro: curvas en S, como gusanos/neuronas
      if (hash(m++) < 0.15) cu = -cu;
      a += cu * 0.5 + (hash(m++) - 0.5) * 0.3;
      const st = 0.025 + hash(m++) * 0.02;
      const th2 = THREE.MathUtils.clamp(th + Math.cos(a) * st, 0.1 * Math.PI, 0.5 * Math.PI);
      const ph2 = ph + (Math.sin(a) * st) / Math.max(0.3, Math.sin(th));
      const dF = Math.abs(Math.atan2(Math.sin(ph2 - Math.PI / 2), Math.cos(ph2 - Math.PI / 2)));
      if (dF < 0.9 && th2 > 0.36 * Math.PI) return;
      out.push([th, ph, th2, ph2, w * (1 - (V.taper ?? 0.6) * (s / steps))]);
      if (hash(m++) < 0.25) vein(th2, ph2, a + (hash(m++) < 0.5 ? 1 : -1) * (0.7 + hash(m++)), (steps - s) >> 1, w * 0.7);
      th = th2;
      ph = ph2;
    }
  };
  for (let i = 0; i < V.n; i++) {
    vein(0.1 * Math.PI + hash(m++) * 0.3 * Math.PI, ((i + hash(m++)) / V.n) * Math.PI * 2, hash(m++) * Math.PI * 2, (V.steps ?? 10) + ((hash(m++) * 8) | 0), 4);
  }
  _veinSegs.set(key, out);
  return out;
}

function strokeVeins(g, V, W, H, wk) {
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [th, ph, th2, ph2, w] of veinSegs(V)) {
    g.lineWidth = Math.max(1.2, w * wk);
    // en UV de esfera el ancho real se achica con sin θ: se estira en x para que la vena no se afine arriba
    const kx = 1 / Math.max(0.3, Math.sin((th + th2) / 2));
    const xm = ((ph + ph2) / 2 / (Math.PI * 2)) * W;
    const ym = ((th + th2) / 2 / Math.PI) * H;
    for (const ox of [-W, 0, W]) {
      g.save();
      g.translate(xm + ox, ym);
      g.scale(kx, 1);
      g.beginPath();
      g.moveTo(((ph / (Math.PI * 2)) * W - xm) / kx, (th / Math.PI) * H - ym);
      g.lineTo(((ph2 / (Math.PI * 2)) * W - xm) / kx, (th2 / Math.PI) * H - ym);
      g.stroke();
      g.restore();
    }
  }
}

/** Alto de las venas (0..1) en UV de esfera, para desplazar la malla. */
function veinHeight(V) {
  const W = 1024;
  const H = 512;
  // trazos sin filtro en un canvas aparte y un solo blur al final: el filtro por trazo (miles) trababa la carga
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#f00";
  strokeVeins(g, V, W, H, V.ridge ?? 1.8);
  if (V.groove) {
    // surco entre lóbulos (canal verde, se resta): adelante u 0.25 hasta groove[0]·π, atrás u 0.75 hasta groove[1]·π
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = "#0f0";
    g.lineWidth = 7;
    for (const [u, th] of [[0.25, V.groove[0]], [0.75, V.groove[1]]]) {
      g.beginPath();
      g.moveTo(u * W, 0.04 * H);
      g.lineTo(u * W, th * H);
      g.stroke();
    }
  }
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const og = out.getContext("2d", { willReadFrequently: true });
  og.fillStyle = "#000";
  og.fillRect(0, 0, W, H);
  og.filter = `blur(${V.blur ?? 2.5}px)`;
  og.drawImage(cv, 0, 0);
  const d = og.getImageData(0, 0, W, H).data;
  return (u, v) => {
    const x = (((u * W) % W) + W) % W;
    const y = THREE.MathUtils.clamp((1 - v) * H, 0, H - 1);
    const x0 = x | 0;
    const y0 = y | 0;
    const x1 = (x0 + 1) % W;
    const y1 = Math.min(H - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const at = (a, b) => (d[(b * W + a) * 4] - 0.7 * d[(b * W + a) * 4 + 1]) / 255;
    const h = (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
    // perfil de tubo: lomo redondeado y flancos marcados (no una loma difusa)
    return h > 0 ? Math.sqrt(THREE.MathUtils.smoothstep(h, 0.1, 0.75)) : h;
  };
}

const _poreTex = new Map();

/**
 * Albedo de la cabeza con poros (UV de esfera: u = ángulo alrededor, v = de arriba a abajo).
 * null si la cabeza no tiene poros. Cara despejada (frente/abajo de las cejas).
 */
export function headSculptPoreTex(id, hex) {
  const P = EXTRAS[id]?.pores;
  if (!P) return null;
  const key = `${id}|${hex}`;
  if (_poreTex.has(key)) return _poreTex.get(key);
  const W = 1024;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  const base = new THREE.Color(hex);
  const css = (c) => `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
  g.fillStyle = css(base);
  g.fillRect(0, 0, W, H);
  const dark = base.clone().multiplyScalar(0.42);
  const rim = base.clone().lerp(new THREE.Color(1, 1, 1), 0.18);
  let n = P.seed ?? 1;
  for (let i = 0; i < P.n; i++) {
    const th = 0.12 * Math.PI + hash(n++) * 0.55 * Math.PI;
    const u = hash(n++);
    const ph = u * Math.PI * 2;
    // frente = phi π/2 (u 0.25): sin poros en la cara, debajo de las cejas
    const dFront = Math.abs(Math.atan2(Math.sin(ph - Math.PI / 2), Math.cos(ph - Math.PI / 2)));
    if (dFront < 0.95 && th > 0.4 * Math.PI) continue;
    const ry = 3 + hash(n++) * 5;
    const rx = ry / Math.max(0.25, Math.sin(th));
    const y = (th / Math.PI) * H;
    const rot = hash(n++) * Math.PI * 2;
    for (const ox of [-W, 0, W]) {
      const x = u * W + ox;
      g.save();
      g.translate(x, y);
      g.scale(rx / ry, 1);
      if (P.arcs) {
        // poro abierto: trazo corto en "C"
        g.rotate(rot);
        g.strokeStyle = css(dark);
        g.lineWidth = 2;
        g.lineCap = "round";
        g.beginPath();
        g.arc(0, 0, ry, 0.2, Math.PI * 1.1);
        g.stroke();
        g.restore();
        continue;
      }
      g.fillStyle = css(rim);
      g.beginPath();
      g.arc(0, 0, ry * 1.35, 0, Math.PI * 2);
      g.fill();
      const gr = g.createRadialGradient(0, -ry * 0.2, 0, 0, 0, ry);
      gr.addColorStop(0, css(dark.clone().multiplyScalar(0.7)));
      gr.addColorStop(1, css(dark));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, ry, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  if (P.veins?.ink) {
    // contorno de las venas (el relieve está en la malla)
    g.strokeStyle = css(dark.clone().multiplyScalar(0.6));
    strokeVeins(g, P.veins, W, H, P.veins.ink ?? 0.5);
  }
  const M = EXTRAS[id].mouth;
  if (M) {
    // sonrisa abierta: borde de arriba casi recto con comisuras que suben, abajo una U honda
    const cx = 0.25 * W;
    const cy = M.th * H;
    const hw = M.w * W;
    const hh = M.h * H;
    g.beginPath();
    g.moveTo(cx - hw, cy - hh * 0.25);
    g.quadraticCurveTo(cx, cy + hh * 0.1, cx + hw, cy - hh * 0.25);
    g.bezierCurveTo(cx + hw * 0.7, cy + hh * 0.9, cx - hw * 0.7, cy + hh * 0.9, cx - hw, cy - hh * 0.25);
    g.closePath();
    g.fillStyle = "#a3122b";
    g.fill();
    g.lineWidth = 3;
    g.lineJoin = "round";
    g.strokeStyle = css(dark.clone().multiplyScalar(0.6));
    g.stroke();
  }
  if (P.crease) {
    // línea al medio (x = 0): adelante (u 0.25) hasta theta crease[0]·π, atrás (u 0.75) hasta crease[1]·π
    g.strokeStyle = css(dark);
    g.lineWidth = 2.5;
    g.lineCap = "round";
    for (const [u, th] of [[0.25, P.crease[0]], [0.75, P.crease[1]]]) {
      g.beginPath();
      g.moveTo(u * W, 0);
      g.lineTo(u * W, th * H);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _poreTex.set(key, tex);
  return tex;
}

/** Mallas extra de la cabeza (zarcillos), en coords de la cabeza escaladas por k. */
export function buildHeadSculptExtras(id, k, mat) {
  const out = [];
  for (const S of EXTRAS[id]?.stubs ?? []) {
    const L = S.len;
    const r = S.r;
    const prof = [
      [r * 0.85, 0], [r, 0.03], [r, L - 0.015], [r * 0.92, L - 0.003], [r * 0.72, L], [r * 0.5, L - 0.01], [0.001, L - 0.016],
    ].map(([x, y]) => new THREE.Vector2(x * k, y * k));
    const base = new THREE.LatheGeometry(prof, 20);
    for (const sd of [1, -1]) {
      const geo = base.clone();
      geo.rotateZ(-sd * Math.PI / 2);
      geo.translate(S.c[0] * sd * k, S.c[1] * k, S.c[2] * k);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.userData.moldId = `stub_${sd > 0 ? "R" : "L"}`;
      m.userData.moldFamily = "head";
      out.push(m);
    }
    base.dispose();
  }
  for (const T of EXTRAS[id]?.tendrils ?? []) {
    for (const sd of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3(T.pts.map(([x, y, z]) => new THREE.Vector3(x * sd * k, y * k, z * k)));
      const seg = 20;
      const rad = 8;
      const geo = new THREE.TubeGeometry(curve, seg, T.r * k, rad, false);
      const pos = geo.attributes.position;
      const c = new THREE.Vector3();
      for (let i = 0; i <= seg; i++) {
        curve.getPointAt(i / seg, c);
        const f = 1 - 0.75 * (i / seg);
        for (let j = 0; j <= rad; j++) {
          const v = i * (rad + 1) + j;
          pos.setXYZ(v, c.x + (pos.getX(v) - c.x) * f, c.y + (pos.getY(v) - c.y) * f, c.z + (pos.getZ(v) - c.z) * f);
        }
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.userData.moldId = `tendril_${sd > 0 ? "R" : "L"}`;
      m.userData.moldFamily = "head";
      out.push(m);
    }
  }
  return out;
}

export function hasHeadSculpt(id) {
  return !!HEADS[id];
}

/** Cabeza esculpida escalada por `k` (= s·hk). */
export function buildHeadSculpt(id, k) {
  const geo = baseGeo(id).clone();
  geo.scale(k, k, k);
  return geo;
}
