import * as THREE from "three";

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

/** Piel tipo cutis: sheen + arrugas + moteado (sin tono tostado extra). */
function skinMat(hex, sc = {}) {
  const base = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const paleLift = sc.paleLift ?? 0.06;
  const paleSat = sc.paleSat ?? 0.72;
  if (hsl.h > 0.02 && hsl.h < 0.12 && hsl.s > 0.15) {
    base.setHSL(hsl.h * 0.85, hsl.s * paleSat, Math.min(0.9, hsl.l + paleLift));
  }
  const noise = skinNoiseTex();
  const sheen = base.clone().offsetHSL(0, -0.05, 0.08);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    map: skinAlbedoTex(base.getHex()),
    roughness: sc.skinRough ?? 0.82,
    metalness: 0,
    roughnessMap: noise,
    bumpMap: noise,
    bumpScale: sc.bumpScale ?? 0.042,
    sheen: sc.sheen ?? 0.4,
    sheenRoughness: sc.sheenRough ?? 0.62,
    sheenColor: sheen,
    clearcoat: 0.04,
    clearcoatRoughness: 0.75,
  });
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
  hipX: 0.1,
  // torso
  torsoMul: 0.15,
  hipsMul: 0.17,
  torsoSx: 1.18,
  hipsSx: 1.18,
  torsoLen: 0.55,
  hipsLen: 0.28,
  waistYMul: 0.62,
  // pecho
  pecType: "sphere", // none | sphere | flat | split | armor
  chestR: 0.145,
  chestSx: 1.25,
  chestSy: 1.52,
  chestSz: 1.08,
  pecR: 0.065,
  pecSep: 0.06,
  pecY: 1.05,
  pecZ: 0.095,
  pecSx: 1.25,
  pecSy: 1.2,
  pecSz: 1.08,
  // cuello / cabeza
  neckR: 0.06,
  neckLen: 0.1,
  headR: 0.16,
  headSx: 1,
  headSy: 1,
  headSz: 1,
  jaw: 0, // 0–1 mandíbula extra
  // orejas
  earType: "round", // none | round | pointed | wide
  earR: 0.035,
  earX: 0.15,
  earSx: 0.55,
  earSy: 1,
  earSz: 0.8,
  // ojos / cara
  eyeType: "anime", // anime | dot | narrow | wide | none
  eyeSep: 0.05,
  eyeY: 0.02,
  eyeZ: 0.13,
  eyeWhiteR: 0.032,
  eyeIrisR: 0.016,
  eyeSx: 1,
  eyeSy: 0.85,
  brow: 0, // 0–1 cejas
  mouth: 0, // 0–1 boca
  nose: 0, // 0–1 nariz
  thirdEye: 0, // 0 off, 1 on
  // manos / pies
  handScale: 1,
  fingerLen: 1,
  footScale: 1,
  showHands: 1,
  showBoots: 1,
  // capa / cinturón
  capeScale: 1,
  capeThick: 1,
  beltR: 0.155,
  beltThick: 0.034,
  showBelt: 1,
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
};

export const SCULPT_SELECTS = {
  pecType: ["none", "sphere", "flat", "split", "armor"],
  earType: ["none", "round", "pointed", "wide"],
  eyeType: ["anime", "dot", "narrow", "wide", "none"],
};

const SCULPT_MAP_KEY = "namekusei.sculptMap";
const SCULPT_KEY_OLD = "namekusei.sculpt";

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
  return out;
}

function readSculptMap() {
  try {
    const raw = localStorage.getItem(SCULPT_MAP_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      return j && typeof j === "object" ? j : {};
    }
    // migrar guardado global viejo → solo Gokú (ya no aplica a todos)
    const old = localStorage.getItem(SCULPT_KEY_OLD);
    if (old) {
      const sculpt = migrateSculpt(JSON.parse(old));
      const map = { Gokú: sculpt };
      localStorage.setItem(SCULPT_MAP_KEY, JSON.stringify(map));
      localStorage.removeItem(SCULPT_KEY_OLD);
      return map;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeSculptMap(map) {
  localStorage.setItem(SCULPT_MAP_KEY, JSON.stringify(map));
}

export function sculptIdFromLook(look = {}) {
  return look.who || look.sculptId || look.name || null;
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
    localStorage.removeItem(SCULPT_MAP_KEY);
    localStorage.removeItem(SCULPT_KEY_OLD);
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
  const radial = opts.radial ?? 14;
  const sx = opts.sx ?? 1;
  const sz = opts.sz ?? 1;
  const n = profile.length;
  const pos = [];
  const uvs = [];
  const idx = [];
  const half = len * 0.5;
  for (let i = 0; i < n; i++) {
    const y = half - (i / (n - 1)) * len;
    const r = Math.max(0.004, profile[i]);
    const v = i / (n - 1);
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat);
  m.castShadow = true;
  return m;
}

/** Mano con palma + 4 dedos + pulgar. */
function handMesh(r, mat, fingerLen = 1) {
  const g = new THREE.Group();
  const palm = loftMesh([r * 0.7, r * 0.95, r * 0.9], r * 1.1, mat, { radial: 10, sx: 1.35, sz: 0.7 });
  palm.rotation.x = Math.PI / 2;
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = loftMesh([r * 0.22, r * 0.2, r * 0.16], r * 0.85 * fingerLen, mat, { radial: 8 });
    f.position.set((i - 1.5) * r * 0.42, r * 0.05, r * 0.85);
    f.rotation.x = 0.35;
    g.add(f);
  }
  const thumb = loftMesh([r * 0.24, r * 0.2, r * 0.15], r * 0.55 * fingerLen, mat, { radial: 8 });
  thumb.position.set(-r * 0.85, 0, r * 0.2);
  thumb.rotation.set(0.4, 0.5, 0.9);
  g.add(thumb);
  return g;
}

/** Pie / bota. */
function footMesh(r, mat) {
  const g = new THREE.Group();
  const sole = loftMesh([r * 0.5, r * 1.05, r * 1.0, r * 0.7], r * 0.7, mat, {
    radial: 12,
    sx: 1.15,
    sz: 1.55,
  });
  sole.rotation.x = Math.PI / 2;
  sole.position.z = r * 0.15;
  g.add(sole);
  const toe = loftMesh([r * 0.55, r * 0.5, r * 0.35], r * 0.55, mat, { radial: 10, sx: 1.3, sz: 0.9 });
  toe.rotation.x = Math.PI / 2;
  toe.position.set(0, 0, r * 0.7);
  g.add(toe);
  return g;
}

function makeArm(upperR, lowerR, upperLen, lowerLen, mat, x, y, extras) {
  const sh = new THREE.Group();
  sh.position.set(x, y, 0);
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
  if (extras?.clothMat) {
    const cu = loftMesh(mulProfile(PROF.upperArm, upperR * uBulk * fit), upperLen * 0.88, extras.clothMat, {
      radial: 14,
      sx: uSx * 1.02,
      sz: uSx * 0.96,
    });
    cu.position.y = -upperLen * 0.48;
    cu.userData.moldId = `cloth_uarm_${side}`;
    cu.userData.moldFamily = "cloth";
    sh.add(cu);
  }
  if (extras?.band) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(upperR * 1.45 * fit, upperR * 0.2, 10, 20),
      extras.band
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = -upperLen * 0.35;
    band.userData.moldId = `cloth_band_${side}`;
    band.userData.moldFamily = "cloth";
    sh.add(band);
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
  if (extras?.clothMat) {
    const cl = loftMesh(mulProfile(PROF.foreArm, lowerR * lBulk * fit), lowerLen * 0.75, extras.clothMat, {
      radial: 14,
      sx: lSx * 1.02,
      sz: lSx * 0.92,
    });
    cl.position.y = -lowerLen * 0.32;
    cl.userData.moldId = `cloth_farm_${side}`;
    cl.userData.moldFamily = "cloth";
    elbow.add(cl);
  }
  if (extras?.hand && extras.showHands !== 0) {
    const hs = extras.handScale ?? 1;
    const hand = handMesh(lowerR * 1.25 * hs, extras.hand, extras.fingerLen ?? 1);
    hand.position.y = -lowerLen + lowerR * 0.1;
    hand.rotation.x = 0.12;
    hand.scale.multiplyScalar(hs);
    hand.traverse((o) => {
      if (o.isMesh) {
        o.userData.moldFamily = "limb";
        o.userData.moldId = o.userData.moldId || `hand_${side}`;
      }
    });
    elbow.add(hand);
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
  thigh.position.y = -thighLen / 2;
  thigh.userData.moldId = `skin_thigh_${side}`;
  thigh.userData.moldFamily = "limb";
  hip.add(thigh);
  if (extras?.clothMat) {
    const ct = loftMesh(mulProfile(PROF.thigh, thighR * tBulk * fit), thighLen * 0.9, extras.clothMat, {
      radial: 14,
      sx: tSx * 1.02,
      sz: tSx * 0.95,
    });
    ct.position.y = -thighLen * 0.45;
    ct.userData.moldId = `cloth_thigh_${side}`;
    ct.userData.moldFamily = "cloth";
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
  if (extras?.clothMat) {
    const cs = loftMesh(mulProfile(PROF.shin, shinR * sBulk * fit), shinLen * 0.7, extras.clothMat, {
      radial: 14,
      sx: sSx * 1.02,
      sz: sSx * 0.92,
    });
    cs.position.y = -shinLen * 0.28;
    cs.userData.moldId = `cloth_shin_${side}`;
    cs.userData.moldFamily = "cloth";
    knee.add(cs);
  }
  if (extras?.boot && extras.showBoots !== 0) {
    const fs = extras.footScale ?? 1;
    const boot = footMesh(shinR * 1.4 * fs, extras.boot);
    boot.position.set(0, -shinLen + shinR * 0.15, 0.05);
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

function addHeadGear(headG, s, look, sc = DEFAULT_SCULPT) {
  const hc = surf(look.hairC ?? 0x111, { roughness: 0.55 });
  hc.userData.ssjHair = true;
  const t = look.hair;
  const hr = sc.hairSpikeR ?? 1;
  const hl = sc.hairSpikeLen ?? 1;
  const tagHair = (m, id) => {
    m.userData.moldId = id;
    m.userData.moldFamily = "hair";
    headG.add(m);
  };
  if (t === "spike" || t === "goku" || t === "gohan") {
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s * hr, 0.24 * s * hl, 12), hc);
      const a = (i / 7) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.07 * s, 0.13 * s, Math.sin(a) * 0.07 * s);
      spike.rotation.x = -0.4;
      spike.rotation.z = Math.cos(a) * 0.35;
      tagHair(spike, `hair_spike_${i}`);
    }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.065 * s * hr, 0.3 * s * hl, 12), hc);
    top.position.y = 0.18 * s;
    tagHair(top, "hair_top");
  } else if (t === "spikeV" || t === "vegeta") {
    for (let i = 0; i < 6; i++) {
      const a = -0.7 + (i / 5) * 1.4;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s * hr, 0.22 * s * hl, 12), hc);
      spike.position.set(Math.sin(a) * 0.07 * s, 0.14 * s, -0.04 * s);
      spike.rotation.x = -0.95;
      spike.rotation.z = a * 0.35;
      spike.scale.x = 0.4;
      tagHair(spike, `hair_veg_${i}`);
    }
  } else if (t === "namek" || t === "piccolo" || t === "nail" || t === "dende") {
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
    if (look.turban) {
      const cloth = surf(0xf5f5f5, { roughness: 0.85 });
      const wrap = new THREE.Mesh(
        latheProfile(
          [
            [0.02 * s, 0.12 * s],
            [0.16 * s, 0.1 * s],
            [0.175 * s, 0.02 * s],
            [0.14 * s, -0.04 * s],
            [0.02 * s, -0.06 * s],
          ],
          18
        ),
        cloth
      );
      wrap.position.y = 0.06 * s;
      wrap.userData.moldId = "turban";
      wrap.userData.moldFamily = "cloth";
      headG.add(wrap);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.155 * s, 0.028 * s, 10, 22), cloth);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.04 * s;
      band.userData.moldId = "turban_band";
      band.userData.moldFamily = "cloth";
      headG.add(band);
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
      hc
    );
    helm.position.y = 0.02 * s;
    helm.userData.moldId = "helm";
    helm.userData.moldFamily = "cloth";
    headG.add(helm);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 * s, 0.04 * s, 0.06 * s, 2, 1, 1),
      surf(0x263238, { roughness: 0.35, metalness: 0.45 })
    );
    visor.position.set(0.12, 0.02 * s, 0.14 * s);
    visor.userData.moldId = "visor";
    visor.userData.moldFamily = "cloth";
    headG.add(visor);
  } else if (t === "horns" || t === "frieza") {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s * hr, 0.2 * s * hl, 12), hc);
      horn.position.set(side * 0.11 * s, 0.11 * s, 0);
      horn.rotation.z = side * 0.55;
      tagHair(horn, `horn_${side > 0 ? "R" : "L"}`);
    }
    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * s, 16, 14),
      surf(look.accent ?? 0xab47bc, {
        roughness: 0.25,
        metalness: 0.35,
        emissive: 0x4a148c,
        emissiveIntensity: 0.35,
      })
    );
    gem.position.set(0, 0.02 * s, 0.15 * s);
    gem.userData.moldId = "gem";
    gem.userData.moldFamily = "face";
    headG.add(gem);
  }
}

function addFace(headG, s, look, sc = DEFAULT_SCULPT) {
  if (sc.eyeType === "none") {
    /* skip */
  } else {
    const eyeM = surf(0x212121, { roughness: 0.4 });
    const whiteM = surf(0xfafafa, { roughness: 0.45 });
    const narrow = sc.eyeType === "narrow";
    const wide = sc.eyeType === "wide";
    const dot = sc.eyeType === "dot";
    const wR = (dot ? sc.eyeWhiteR * 0.45 : sc.eyeWhiteR) * (wide ? 1.25 : narrow ? 0.75 : 1);
    const iR = (dot ? sc.eyeIrisR * 0.7 : sc.eyeIrisR) * (wide ? 1.2 : narrow ? 0.7 : 1);
    const sy = narrow ? 0.45 : wide ? 1.05 : sc.eyeSy;
    for (const side of [-1, 1]) {
      const sideK = side > 0 ? "R" : "L";
      if (!dot) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(wR * s, 14, 12), whiteM);
        w.position.set(side * sc.eyeSep * s, sc.eyeY * s, sc.eyeZ * s);
        w.scale.set(sc.eyeSx, sy, 0.6);
        w.userData.moldId = `eye_${sideK}_w`;
        w.userData.moldFamily = "eye";
        headG.add(w);
      }
      const e = new THREE.Mesh(new THREE.SphereGeometry(iR * s, 12, 10), eyeM);
      e.position.set(side * sc.eyeSep * s, sc.eyeY * s, sc.eyeZ * s + (dot ? 0.02 * s : 0.025 * s));
      if (narrow) e.scale.set(1.2, 0.5, 1);
      e.userData.moldId = `eye_${sideK}_i`;
      e.userData.moldFamily = "eye";
      headG.add(e);
    }
  }
  if (sc.brow > 0.05) {
    const browM = surf(look.hairC ?? 0x1a1208, { roughness: 0.7 });
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s * sc.brow, 0.012 * s, 0.02 * s), browM);
      b.position.set(side * sc.eyeSep * s, sc.eyeY * s + 0.035 * s, sc.eyeZ * s - 0.01 * s);
      b.rotation.z = side * -0.25 * sc.brow;
      headG.add(b);
    }
  }
  if (sc.nose > 0.05) {
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.018 * s * sc.nose, 10, 8),
      surf(look.skin, { roughness: 0.7 })
    );
    nose.position.set(0, sc.eyeY * s - 0.02 * s, sc.eyeZ * s + 0.02 * s);
    nose.scale.set(0.7, 1, 1.1);
    nose.userData.moldId = "nose";
    nose.userData.moldFamily = "face";
    headG.add(nose);
  }
  if (sc.mouth > 0.05) {
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.045 * s * sc.mouth, 0.01 * s, 0.012 * s),
      surf(0x5d4037, { roughness: 0.6 })
    );
    mouth.position.set(0, sc.eyeY * s - 0.05 * s, sc.eyeZ * s + 0.01 * s);
    mouth.userData.moldId = "mouth";
    mouth.userData.moldFamily = "face";
    headG.add(mouth);
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
    const whiteM = surf(0xfafafa, { roughness: 0.45 });
    const eyeM = surf(0x212121, { roughness: 0.4 });
    const w3 = new THREE.Mesh(new THREE.SphereGeometry(0.026 * s, 12, 10), whiteM);
    w3.position.set(0, 0.075 * s, 0.125 * s);
    w3.scale.set(0.85, 0.75, 0.55);
    headG.add(w3);
    const e3 = new THREE.Mesh(new THREE.SphereGeometry(0.013 * s, 12, 10), eyeM);
    e3.position.set(0, 0.075 * s, 0.148 * s);
    headG.add(e3);
  }
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

function addPecs(torsoG, s, waistY, torsoC, sc, brute) {
  if (sc.pecType === "none") return;
  const y = sc.pecY * s - waistY;
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

export function makeBody(altura, look, sculpt = {}) {
  const id = sculptIdFromLook(look);
  const sc = { ...DEFAULT_SCULPT, ...(id ? loadSavedSculpt(id) : {}), ...sculpt };
  const g = new THREE.Group();
  const s = altura;
  const kit = look.kit || "gi";
  const layered = kit === "gi" || kit === "armor" || kit === "soldier" || kit === "brute";
  const skin = skinMat(look.skin, sc);
  const clothMat = layered
    ? surf(look.body, { roughness: kit === "armor" || kit === "soldier" ? 0.45 : 0.82 })
    : null;
  const torsoC =
    kit === "namek" ? skinMat(look.body, sc) : layered ? skin : surf(look.body, { roughness: 0.82 });
  const limbC = kit === "namek" || layered ? skin : surf(new THREE.Color(look.body).multiplyScalar(0.78), { roughness: 0.88 });
  const accent = surf(look.accent ?? 0x1565c0, { roughness: 0.55 });
  const bootM = surf(look.boots ?? (kit === "gi" ? look.accent ?? 0x0d47a1 : 0x212121), {
    roughness: 0.5,
    metalness: 0.12,
  });
  const white = surf(0xeeeeee, { roughness: 0.4, metalness: 0.2 });

  const waistY = sc.waistYMul * s;
  const torsoG = new THREE.Group();
  torsoG.position.y = waistY;
  g.add(torsoG);

  const brute = kit === "brute";
  const bruteT = brute ? 1.12 : 1;
  const bruteC = brute ? 1.15 : 1;

  const hips = loftMesh(
    mulProfile([0.9, 0.85, 0.8, 0.6, 0.3], sc.hipsMul * s * bruteT),
    sc.hipsLen * s,
    clothMat || torsoC,
    { radial: 16, sx: sc.hipsSx, sz: sc.hipsSx * 0.83 }
  );
  hips.position.y = waistY;
  hips.userData.moldId = "hips";
  hips.userData.moldFamily = clothMat ? "cloth" : "torso";
  g.add(hips);

  const torsoCore = loftMesh(
    mulProfile(PROF.torso, sc.torsoMul * s * bruteC),
    sc.torsoLen * s,
    torsoC,
    { radial: 16, sx: sc.torsoSx, sz: sc.torsoSx * 0.85 }
  );
  torsoCore.position.y = 0.92 * s - waistY;
  torsoCore.userData.moldId = "torso";
  torsoCore.userData.moldFamily = "torso";
  torsoG.add(torsoCore);

  if (clothMat) {
    const shirt = loftMesh(
      mulProfile(PROF.torso, sc.torsoMul * s * bruteC * sc.clothFit),
      sc.torsoLen * s * 0.92,
      clothMat,
      { radial: 16, sx: sc.torsoSx * 1.04, sz: sc.torsoSx * 0.9 }
    );
    shirt.position.y = 0.9 * s - waistY;
    shirt.userData.moldId = "cloth_shirt";
    shirt.userData.moldFamily = "cloth";
    torsoG.add(shirt);
  }

  const chest = new THREE.Mesh(new THREE.SphereGeometry(sc.chestR * s, 18, 14), torsoC);
  chest.position.y = 1.1 * s - waistY;
  chest.scale.set(brute ? sc.chestSx * 1.14 : sc.chestSx, sc.chestSy, sc.chestSz);
  chest.castShadow = true;
  chest.userData.moldId = "chest";
  chest.userData.moldFamily = "torso";
  torsoG.add(chest);
  addPecs(torsoG, s, waistY, torsoC, sc, brute);

  if (sc.showBelt > 0.5) {
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(sc.beltR * s, sc.beltThick * s, 10, 24),
      kit === "namek" ? accent : kit === "armor" ? white : accent
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.72 * s - waistY;
    belt.userData.moldId = "belt";
    belt.userData.moldFamily = "cloth";
    torsoG.add(belt);
  }

  if (kit === "armor" || kit === "soldier") {
    const plate = new THREE.Mesh(
      new THREE.SphereGeometry(0.185 * s, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
      white
    );
    plate.position.y = 1.02 * s - waistY;
    plate.rotation.x = 0.15;
    plate.userData.moldId = "armor_plate";
    plate.userData.moldFamily = "cloth";
    torsoG.add(plate);
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 14, 12), white);
      pad.position.set(side * 0.22 * s, 1.18 * s - waistY, 0);
      pad.scale.set(1.15, 0.75, 1.05);
      pad.userData.moldId = `armor_pad_${side > 0 ? "R" : "L"}`;
      pad.userData.moldFamily = "cloth";
      torsoG.add(pad);
    }
  }
  if (kit === "frost") {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.38 * s, 0.04 * s, 1, 2, 1), accent);
    line.position.set(0, 0.98 * s - waistY, 0.16 * s);
    line.userData.moldId = "frost_line";
    line.userData.moldFamily = "cloth";
    torsoG.add(line);
  }
  if (kit === "gi") {
    const undershirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 * s, 0.14 * s, 0.2 * s, 14),
      new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.82 })
    );
    undershirt.position.y = 0.88 * s - waistY;
    undershirt.userData.moldId = "undershirt";
    undershirt.userData.moldFamily = "cloth";
    torsoG.add(undershirt);
  }
  if (kit === "namek") {
    const capeM = surf(look.cape ?? 0xfafafa, { roughness: 0.88 });
    const cs = sc.capeScale;
    const capeShape = new THREE.Shape();
    const hw = 0.2 * s * cs;
    capeShape.moveTo(-hw, 0.28 * s * cs);
    capeShape.quadraticCurveTo(0, 0.32 * s * cs, hw, 0.28 * s * cs);
    capeShape.lineTo(0.34 * s * cs, -0.3 * s * cs);
    capeShape.quadraticCurveTo(0, -0.34 * s * cs, -0.34 * s * cs, -0.3 * s * cs);
    capeShape.closePath();
    const cape = new THREE.Mesh(
      new THREE.ExtrudeGeometry(capeShape, {
        depth: 0.045 * s * sc.capeThick,
        bevelEnabled: true,
        bevelThickness: 0.008 * s,
        bevelSize: 0.008 * s,
        bevelSegments: 2,
      }),
      capeM
    );
    cape.position.set(0, 0.82 * s - waistY, -0.06 * s);
    cape.rotation.y = Math.PI;
    cape.userData.wind = true;
    cape.userData.moldId = "cape";
    cape.userData.moldFamily = "cloth";
    torsoG.add(cape);
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.16 * s, 0.028 * s, 10, 20, Math.PI * 1.2),
      capeM
    );
    collar.rotation.x = 0.4;
    collar.position.set(0, 1.18 * s - waistY, -0.02 * s);
    collar.userData.moldId = "cape_collar";
    collar.userData.moldFamily = "cloth";
    torsoG.add(collar);
  }

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(sc.neckR * s, sc.neckR * 1.15 * s, sc.neckLen * s, 14),
    skin
  );
  neck.position.y = 1.24 * s - waistY;
  neck.userData.moldId = "neck";
  neck.userData.moldFamily = "head";
  torsoG.add(neck);

  const headG = new THREE.Group();
  headG.position.y = 1.38 * s - waistY;
  const head = new THREE.Mesh(new THREE.SphereGeometry(sc.headR * s, 22, 18), skin);
  head.scale.set(sc.headSx, sc.headSy, sc.headSz);
  head.castShadow = true;
  head.userData.moldId = "head";
  head.userData.moldFamily = "head";
  headG.add(head);
  if (sc.jaw > 0.05) {
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(sc.headR * 0.72 * s * sc.jaw, 14, 12), skin);
    jaw.position.y = -sc.headR * 0.55 * s;
    jaw.scale.set(1.15, 0.55, 1.05);
    jaw.userData.moldId = "jaw";
    jaw.userData.moldFamily = "head";
    headG.add(jaw);
  }
  addEars(headG, s, skin, sc);
  addFace(headG, s, look, sc);
  addHeadGear(headG, s, look, sc);
  torsoG.add(headG);

  const armBase = {
    hand: skin,
    band: kit === "gi" ? accent : null,
    upperBulk: sc.upperArmBulk,
    lowerBulk: sc.foreArmBulk,
    upperSx: sc.upperArmSx,
    lowerSx: sc.foreArmSx,
    handScale: sc.handScale,
    fingerLen: sc.fingerLen,
    showHands: sc.showHands,
    clothMat,
    clothFit: sc.clothFit,
  };
  const legBase = {
    boot: bootM,
    thighBulk: sc.thighBulk,
    shinBulk: sc.shinBulk,
    thighSx: sc.thighSx,
    shinSx: sc.shinSx,
    footScale: sc.footScale,
    showBoots: sc.showBoots,
    clothMat,
    clothFit: sc.clothFit,
  };
  const armL = makeArm(
    sc.upperArmR * s,
    sc.foreArmR * s,
    sc.upperArmLen * s,
    sc.foreArmLen * s,
    limbC,
    -sc.shoulderX * s,
    sc.shoulderY * s - waistY,
    { ...armBase, side: "L" }
  );
  const armR = makeArm(
    sc.upperArmR * s,
    sc.foreArmR * s,
    sc.upperArmLen * s,
    sc.foreArmLen * s,
    limbC,
    sc.shoulderX * s,
    sc.shoulderY * s - waistY,
    { ...armBase, side: "R" }
  );
  torsoG.add(armL, armR);
  const legL = makeLeg(
    sc.thighR * s,
    sc.shinR * s,
    sc.thighLen * s,
    sc.shinLen * s,
    limbC,
    -sc.hipX * s,
    0.6 * s,
    { ...legBase, side: "L" }
  );
  const legR = makeLeg(
    sc.thighR * s,
    sc.shinR * s,
    sc.thighLen * s,
    sc.shinLen * s,
    limbC,
    sc.hipX * s,
    0.6 * s,
    { ...legBase, side: "R" }
  );
  g.add(legL, legR);
  g.userData.limbs = {
    armL,
    armR,
    legL,
    legR,
    elbowL: armL.userData.elbow,
    elbowR: armR.userData.elbow,
    kneeL: legL.userData.knee,
    kneeR: legR.userData.knee,
    torsoG,
    hips,
    waistY,
    hipY: 0.6 * s,
    headG,
    neck,
  };
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  if (sc.molds) applyMolds(g, sc.molds);
  return g;
}

/** Aplica posiciones de vértices guardadas (moldeado con mouse). */
export function applyMolds(root, molds) {
  if (!molds || typeof molds !== "object") return;
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.moldId) return;
    const data = molds[o.userData.moldId];
    if (!data || !Array.isArray(data)) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos || pos.count * 3 !== data.length) return;
    pos.array.set(data);
    pos.needsUpdate = true;
    o.geometry.computeVertexNormals();
  });
}

/** Captura molds actuales desde el mesh (para guardar). */
export function captureMolds(root) {
  const molds = {};
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.moldId) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    molds[o.userData.moldId] = Array.from(pos.array);
  });
  return molds;
}
