import shippedAnims from "./data/anims.json";

const KEY = "namekusei.anims";
/** Overlay de sesión; fuente de verdad: data/anims.json */
let _animRuntime = null;

try {
  localStorage.removeItem(KEY);
} catch {
  /* ignore */
}

function storedAnims() {
  const out = { ...shippedAnims };
  const local = _animRuntime || {};
  for (const who of Object.keys(local)) {
    out[who] = { ...(out[who] || {}), ...local[who] };
  }
  return out;
}

export const BONES = [
  ["armL", "Brazo I"],
  ["armR", "Brazo D"],
  ["elbowL", "Codo I"],
  ["elbowR", "Codo D"],
  ["wristL", "Puño I"],
  ["wristR", "Puño D"],
  ["legL", "Pierna I"],
  ["legR", "Pierna D"],
  ["kneeL", "Rodilla I"],
  ["kneeR", "Rodilla D"],
  ["torso", "Torso"],
  ["head", "Cabeza"],
];

const LIMB = { armL: "armL", armR: "armR", elbowL: "elbowL", elbowR: "elbowR", wristL: "wristL", wristR: "wristR", legL: "legL", legR: "legR", kneeL: "kneeL", kneeR: "kneeR", torso: "torsoG", head: "headG" };

function P(map, lay = 0, drop = 0) {
  const pose = { lay, drop };
  for (const [k] of BONES) pose[k] = map[k] ? map[k].slice() : [0, 0, 0];
  return pose;
}

function clip(speed, keys, extra = {}) {
  return { speed, swing: 1, ease: "smooth", keys, ...extra };
}

export function defaultClips() {
  const w = (s) =>
    P({
      armL: [-s * 0.61, 0, 0.08],
      armR: [s * 0.61, 0, -0.08],
      elbowL: [-0.4 - Math.max(0, -s) * 0.4, 0, 0],
      elbowR: [-0.4 - Math.max(0, s) * 0.4, 0, 0],
      legL: [-s * 0.72, 0, 0],
      legR: [s * 0.72, 0, 0],
      kneeL: [Math.max(0, s) * 0.79, 0, 0],
      kneeR: [Math.max(0, -s) * 0.79, 0, 0],
    });
  const r = (s) =>
    P({
      armL: [-s * 0.98, 0, 0.08],
      armR: [s * 0.98, 0, -0.08],
      elbowL: [-0.4 - Math.max(0, -s) * 0.4, 0, 0],
      elbowR: [-0.4 - Math.max(0, s) * 0.4, 0, 0],
      legL: [-s * 1.15, 0, 0],
      legR: [s * 1.15, 0, 0],
      kneeL: [Math.max(0, s) * 1.26, 0, 0],
      kneeR: [Math.max(0, -s) * 1.26, 0, 0],
    });
  return {
    rest: clip(1, [{ u: 0, pose: P({}) }]),
    idle: clip(0.35, [
      { u: 0, pose: P({ armL: [0.14, 0, 0.12], armR: [0.02, 0, -0.12], elbowL: [-0.35, 0, 0], elbowR: [-0.35, 0, 0], legL: [0.024, 0, 0], legR: [-0.024, 0, 0] }) },
      { u: 0.5, pose: P({ armL: [0.02, 0, 0.12], armR: [0.14, 0, -0.12], elbowL: [-0.35, 0, 0], elbowR: [-0.35, 0, 0], legL: [-0.024, 0, 0], legR: [0.024, 0, 0] }) },
    ]),
    walk: clip(1, [
      { u: 0, pose: w(0) },
      { u: 0.25, pose: w(1) },
      { u: 0.5, pose: w(0) },
      { u: 0.75, pose: w(-1) },
    ]),
    run: clip(1.45, [
      { u: 0, pose: r(0) },
      { u: 0.25, pose: r(1) },
      { u: 0.5, pose: r(0) },
      { u: 0.75, pose: r(-1) },
    ]),
    hover: clip(0.5, [
      { u: 0, pose: P({ armL: [0.55, 0, 0.2], armR: [0.55, 0, -0.2], elbowL: [-1.05, 0, 0], elbowR: [-1.05, 0, 0], legL: [-0.15, 0, 0.08], legR: [-0.12, 0, -0.08], kneeL: [0.35, 0, 0], kneeR: [0.4, 0, 0] }) },
    ]),
    fly: clip(0.4, [
      { u: 0, pose: P({ armL: [-0.85, 0, 0.35], armR: [-0.85, 0, -0.35], elbowL: [-0.25, 0, 0], elbowR: [-0.25, 0, 0], legL: [0.15, 0, 0.12], legR: [0.12, 0, -0.12] }, 1.15) },
    ]),
    punch: clip(1.2, [
      { u: 0, pose: P({ armL: [0.18, 0, 0.16], armR: [0.08, 0, -0.1], elbowL: [-0.72, 0, 0], elbowR: [-0.28, 0, 0], wristR: [0.2, 0.4, 0] }) },
      { u: 0.28, pose: P({ armL: [0.18, 0, 0.16], armR: [-0.62, 0, -0.1], elbowL: [-0.72, 0, 0], elbowR: [-1.28, 0, 0], wristR: [0.1, 0.55, 0] }) },
      { u: 0.48, pose: P({ armL: [0.22, 0, 0.16], armR: [1.12, 0, -0.08], elbowL: [-0.72, 0, 0], elbowR: [-1.28, 0, 0] }) },
      { u: 0.72, pose: P({ armL: [0.3, 0, 0.16], armR: [-1.55, 0, -0.35], elbowL: [-0.72, 0, 0], elbowR: [-0.18, 0, 0], wristR: [0, 0.2, 0] }) },
    ]),
    punchTwo: clip(1.2, [
      { u: 0, pose: P({ armL: [0.08, 0, 0.1], armR: [0.18, 0, -0.16], elbowL: [-0.28, 0, 0], elbowR: [-0.72, 0, 0], wristL: [0.2, -0.4, 0] }) },
      { u: 0.28, pose: P({ armL: [-0.62, 0, 0.1], armR: [0.18, 0, -0.16], elbowL: [-1.28, 0, 0], elbowR: [-0.72, 0, 0], wristL: [0.1, -0.55, 0] }) },
      { u: 0.48, pose: P({ armL: [1.12, 0, 0.08], armR: [0.22, 0, -0.16], elbowL: [-1.28, 0, 0], elbowR: [-0.72, 0, 0] }) },
      { u: 0.72, pose: P({ armL: [-1.55, 0, 0.35], armR: [0.3, 0, -0.16], elbowL: [-0.18, 0, 0], elbowR: [-0.72, 0, 0], wristL: [0, -0.2, 0] }) },
    ]),
    punchKick: clip(1, [
      { u: 0, pose: P({ armL: [-0.28, 0, 0.32], armR: [-0.4, 0, -0.4], elbowL: [-0.55, 0, 0], elbowR: [-0.55, 0, 0], legL: [0.28, 0, 0], legR: [-1.38, 0, 0], kneeL: [0.45, 0, 0], kneeR: [-0.22, 0, 0] }) },
    ]),
    swimIdle: clip(0.45, [
      { u: 0, pose: P({ armL: [-0.55, 0, 0.78], armR: [-0.55, 0, -0.78], elbowL: [-0.72, 0, 0], elbowR: [-0.72, 0, 0], legL: [0.35, 0, 0], legR: [0.35, 0, 0], kneeL: [0.75, 0, 0], kneeR: [0.75, 0, 0] }, 1.2) },
      { u: 0.5, pose: P({ armL: [-0.23, 0, 0.86], armR: [-0.87, 0, -0.7], elbowL: [-0.72, 0, 0], elbowR: [-0.72, 0, 0], legL: [0.57, 0, 0], legR: [0.13, 0, 0], kneeL: [0.93, 0, 0], kneeR: [0.57, 0, 0] }, 1.2) },
    ]),
    swim: clip(1.15, [
      { u: 0, pose: P({ armL: [-0.15, 0, 0.35], armR: [-2.0, 0, -1.1], elbowL: [-0.55, 0, 0], elbowR: [-1.0, 0, 0], legL: [0.5, 0, 0], legR: [-0.5, 0, 0], kneeL: [0.35, 0, 0], kneeR: [1.1, 0, 0] }, 1.35) },
      { u: 0.25, pose: P({ armL: [-1.2, 0, 0.9], armR: [-0.8, 0, -0.5], elbowL: [-0.85, 0, 0], elbowR: [-0.55, 0, 0], legL: [-0.5, 0, 0], legR: [0.5, 0, 0], kneeL: [1.1, 0, 0], kneeR: [0.35, 0, 0] }, 1.35) },
      { u: 0.5, pose: P({ armL: [-2.0, 0, 1.1], armR: [-0.15, 0, -0.35], elbowL: [-1.0, 0, 0], elbowR: [-0.55, 0, 0], legL: [0.5, 0, 0], legR: [-0.5, 0, 0], kneeL: [0.35, 0, 0], kneeR: [1.1, 0, 0] }, 1.35) },
      { u: 0.75, pose: P({ armL: [-0.8, 0, 0.5], armR: [-1.2, 0, -0.9], elbowL: [-0.55, 0, 0], elbowR: [-0.85, 0, 0], legL: [-0.5, 0, 0], legR: [0.5, 0, 0], kneeL: [1.1, 0, 0], kneeR: [0.35, 0, 0] }, 1.35) },
    ]),
    crouch: clip(0.3, [
      { u: 0, pose: P({ legL: [-1.05, 0, 0.08], legR: [-1.05, 0, -0.08], kneeL: [1.35, 0, 0], kneeR: [1.35, 0, 0], armL: [0.25, 0, 0.35], armR: [0.25, 0, -0.35], elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0], torso: [0.28, 0, 0] }) },
    ]),
    charge: clip(2.2, [
      { u: 0, pose: P({ armL: [-0.12, 0, 0.55], armR: [-0.12, 0, -0.55], elbowL: [-1.28, 0, 0], elbowR: [-1.28, 0, 0], head: [-0.15, 0, 0] }) },
      { u: 0.5, pose: P({ armL: [-0.04, 0, 0.55], armR: [-0.04, 0, -0.55], elbowL: [-1.28, 0, 0], elbowR: [-1.28, 0, 0], head: [-0.15, 0, 0] }) },
    ]),
    blast: clip(1, [
      { u: 0, pose: P({ armL: [0.12, 0, 0.08], armR: [0.12, 0, -0.08], elbowL: [-0.25, 0, 0], elbowR: [-0.25, 0, 0] }) },
      { u: 1, pose: P({ armL: [0.12, 0, 0.08], armR: [-1.65, 0, -0.35], elbowL: [-0.25, 0, 0], elbowR: [-0.15, 0, 0], torso: [0.32, 0, 0], head: [-0.18, 0, 0], legL: [0.22, 0, 0], legR: [0.22, 0, 0], kneeL: [0.18, 0, 0], kneeR: [0.18, 0, 0] }) },
    ]),
    blastTwo: clip(1, [
      { u: 0, pose: P({ armL: [0.12, 0, 0.08], armR: [0.12, 0, -0.08], elbowL: [-0.25, 0, 0], elbowR: [-0.25, 0, 0] }) },
      { u: 1, pose: P({ armL: [-1.65, 0, 0.35], armR: [-1.65, 0, -0.35], elbowL: [-0.15, 0, 0], elbowR: [-0.15, 0, 0], torso: [0.32, 0, 0], head: [-0.18, 0, 0], legL: [0.22, 0, 0], legR: [0.22, 0, 0], kneeL: [0.18, 0, 0], kneeR: [0.18, 0, 0] }) },
    ]),
    elbow: clip(1, [
      { u: 0, pose: P({ armL: [0.35, 0, 0.12], armR: [-0.35, 0, -1.05], elbowL: [-0.35, 0, 0], elbowR: [-1.35, 0, 0], legL: [0.12, 0, 0], legR: [0.08, 0, 0], kneeL: [0.18, 0, 0], kneeR: [0.18, 0, 0], torso: [0.08, 0, 0], head: [0.18, 0, 0] }, 1.58) },
      { u: 1, pose: P({ armL: [0.35, 0, 0.12], armR: [-0.35, 0, -1.05], elbowL: [-0.35, 0, 0], elbowR: [-1.35, 0, 0], legL: [0.12, 0, 0], legR: [0.08, 0, 0], kneeL: [0.18, 0, 0], kneeR: [0.18, 0, 0], torso: [0.12, 0, 0], head: [0.22, 0, 0] }, 1.58) },
    ]),
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixPose(a, b, t, swing) {
  const o = { lay: lerp(a.lay || 0, b.lay || 0, t), drop: lerp(a.drop || 0, b.drop || 0, t) };
  for (const [k] of BONES) {
    const pa = a[k] || [0, 0, 0];
    const pb = b[k] || [0, 0, 0];
    o[k] = [lerp(pa[0], pb[0], t) * swing, lerp(pa[1], pb[1], t) * swing, lerp(pa[2], pb[2], t) * swing];
  }
  return o;
}

export function clipOnceDuration(clip, fallback = 0.5) {
  if (!clip?.keys?.length) return fallback;
  let last = 0;
  for (const k of clip.keys) last = Math.max(last, +k.u || 0);
  const span = last > 0.08 ? last : 1;
  return Math.max(0.22, span / (clip.speed || 1));
}

export function evalClip(clip, time, once = false) {
  if (!clip?.keys?.length) return P({});
  const keys = [...clip.keys].sort((a, b) => a.u - b.u);
  const speed = clip.speed || 1;
  let u = time * speed;
  if (once) u = Math.min(Math.max(u, 0), 0.99999);
  else {
    u = u % 1;
    if (u < 0) u += 1;
  }
  const swing = clip.swing ?? 1;
  if (once) {
    if (u <= keys[0].u) return mixPose(keys[0].pose, keys[0].pose, 0, swing);
    const last = keys[keys.length - 1];
    if (u >= last.u) return mixPose(last.pose, last.pose, 0, swing);
  }
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) {
    if (keys[k].u > u) {
      i = k - 1;
      break;
    }
  }
  const a = keys[i < 0 ? (once ? 0 : keys.length - 1) : i];
  const b = keys[once ? Math.min(i + 1, keys.length - 1) : (i + 1) % keys.length];
  let ua = a.u;
  let ub = b.u;
  let t;
  if (!once && ub <= ua) {
    const span = 1 - ua + ub;
    const x = u >= ua ? u - ua : 1 - ua + u;
    t = span < 1e-6 ? 0 : x / span;
  } else t = ub <= ua ? 1 : (u - ua) / (ub - ua);
  if (clip.ease === "smooth") t = t * t * (3 - 2 * t);
  return mixPose(a.pose, b.pose, t, swing);
}

export function applyEval(mesh, pose) {
  const L = mesh?.userData?.limbs;
  if (!L || !pose) return;
  const set = (o, v) => {
    if (!o) return;
    const r = v || [0, 0, 0];
    o.rotation.set(r[0], r[1], r[2]);
  };
  for (const [k, node] of Object.entries(LIMB)) set(L[node] || L[k], pose[k]);
  mesh.rotation.x = pose.lay || 0;
  const d = pose.drop || 0;
  const wy = L.waistY;
  const hy = L.hipY;
  if (wy != null) {
    if (L.torsoG) L.torsoG.position.y = wy - d;
    if (L.hips) L.hips.position.y = wy - d;
  }
  if (hy != null) {
    if (L.legL) L.legL.position.y = hy - d;
    if (L.legR) L.legR.position.y = hy - d;
  }
}

export function loadClips(who) {
  const base = defaultClips();
  try {
    const saved = storedAnims()[who];
    if (!saved) return base;
    for (const k of Object.keys(base)) {
      if (saved[k]?.keys) base[k] = saved[k];
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function saveClips(who, clips) {
  if (!who) return;
  try {
    const all = { ...(_animRuntime || {}) };
    all[who] = clips;
    _animRuntime = all;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    shipPack();
  } catch {
    /* ignore */
  }
}

function shipPack() {
  if (!import.meta.env.DEV) return;
  try {
    fetch("/__namekusei-pack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anims: storedAnims(),
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function copyClipsTo(fromWho, toWho, names) {
  if (!fromWho || !toWho || fromWho === toWho) return;
  const src = loadClips(fromWho);
  const dest = loadClips(toWho);
  const keys = !names || names === "*" ? Object.keys(defaultClips()) : [].concat(names);
  for (const k of keys) {
    if (src[k]) dest[k] = JSON.parse(JSON.stringify(src[k]));
  }
  saveClips(toWho, dest);
}

function clipSig(c) {
  if (!c?.keys) return "";
  const keys = c.keys.map((k) => {
    const pose = {};
    const src = k.pose || {};
    for (const [b] of BONES) {
      const v = src[b];
      if (!v) continue;
      if (Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) < 1e-4) continue;
      pose[b] = v.map((n) => Math.round(n * 1000) / 1000);
    }
    if (Math.abs(src.lay || 0) > 1e-4) pose.lay = Math.round(src.lay * 1000) / 1000;
    if (Math.abs(src.drop || 0) > 1e-4) pose.drop = Math.round(src.drop * 1000) / 1000;
    return { u: Math.round((k.u || 0) * 1000) / 1000, pose };
  });
  return JSON.stringify({
    speed: Math.round((c.speed || 1) * 1000) / 1000,
    swing: Math.round((c.swing ?? 1) * 1000) / 1000,
    ease: c.ease || "smooth",
    keys,
  });
}

export function clipIsCustom(who, name) {
  try {
    const saved = storedAnims()[who]?.[name];
    if (!saved?.keys) return false;
    const now = clipSig(defaultClips()[name]);
    const got = clipSig(saved);
    if (got === now) return false;
    if (name === "punch" && got === clipSig(clip(1.2, [
      { u: 0, pose: P({ armL: [0.35, 0, 0.25], armR: [0, 0, -0.1], elbowL: [-0.7, 0, 0], elbowR: [-0.2, 0, 0] }) },
      { u: 0.5, pose: P({ armL: [0.35, 0, 0.25], armR: [-1.15, 0, -0.1], elbowL: [-0.7, 0, 0], elbowR: [0, 0, 0] }) },
    ]))) return false;
    return true;
  } catch {
    return false;
  }
}
