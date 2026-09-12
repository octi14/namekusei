import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { makeBody } from "./body.js";
import gokuUrl from "./assets/rigged/goku_normal.glb?url";
import vegetaUrl from "./assets/rigged/vegeta_normal.glb?url";
import androide19Url from "./assets/rigged/androide_19.glb?url";
import geroUrl from "./assets/rigged/Dr_Gero.glb?url";

const URLS = {
  goku: gokuUrl,
  vegeta: vegetaUrl,
  androide19: androide19Url,
  gero: geroUrl,
};
export const CHAR_RIG = {
  Gokú: "goku",
  Vegeta: "vegeta",
  "Nº19": "androide19",
  "Dr. Gero": "gero",
};
const pack = {};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _id = new THREE.Quaternion();
const _hangMix = new THREE.Quaternion();
const hangL = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.22, 0, 0));
const hangR = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.22, 0, 0));

function mixPart(name) {
  const n = name || "";
  const m = n.match(/mixamorig:?([A-Za-z][A-Za-z0-9]*)/);
  if (m) return m[1];
  const f = n.match(/^F_(FORE|MIDDLE|MEDICINAL|LITTLE|THUMB)(\d)_(L|R)_/);
  if (f) {
    const kind = { FORE: "Index", MIDDLE: "Middle", MEDICINAL: "Ring", LITTLE: "Pinky", THUMB: "Thumb" }[f[1]];
    return `${f[3] === "L" ? "Left" : "Right"}Hand${kind}${f[2]}`;
  }
  const veg = [
    [/^WAIST_/, "Hips"],
    [/^SPINE1_/, "Spine"],
    [/^SPINE2_/, "Spine1"],
    [/^SPINE3_/, "Spine2"],
    [/^NECK_/, "Neck"],
    [/^HEAD_\d/, "Head"],
    [/^CLAVICLE_L_/, "LeftShoulder"],
    [/^SHOULDER_L_/, "LeftArm"],
    [/^ELBOWROLL_L_/, "LeftForeArmRoll"],
    [/^ELBOW_L_/, "LeftForeArm"],
    [/^WRIST_L_/, "LeftHand"],
    [/^CLAVICLE_R_/, "RightShoulder"],
    [/^SHOULDER_R_/, "RightArm"],
    [/^ELBOWROLL_R_/, "RightForeArmRoll"],
    [/^ELBOW_R_/, "RightForeArm"],
    [/^WRIST_R_/, "RightHand"],
    [/^THIGH_L_/, "LeftUpLeg"],
    [/^CLANK_L_\d/, "LeftLeg"],
    [/^THIGH_R_/, "RightUpLeg"],
    [/^CLANK_R_\d/, "RightLeg"],
  ];
  for (const [re, key] of veg) {
    if (re.test(n)) return key;
  }
  return "";
}

function collectBones(root) {
  const bones = {};
  root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
    for (const o of mesh.skeleton.bones) {
      const p = mixPart(o.name);
      if (!p || bones[p]) continue;
      o.userData.restQ = o.quaternion.clone();
      o.userData.restP = o.position.clone();
      bones[p] = o;
    }
  });
  return bones;
}

function fist(bones, left, amt, mode) {
  const p = left ? "LeftHand" : "RightHand";
  const s = left ? -1 : 1;
  if (mode === "veg") {
    const y = 1.25 * amt * (left ? 1 : -1);
    for (const f of ["Index", "Middle", "Ring", "Pinky"]) {
      for (const i of [1, 2, 3]) setLocal(bones[p + f + i], null, 0, y, 0);
    }
    setLocal(bones[p + "Thumb1"], null, 0.3 * amt, 0.5 * amt * (left ? 1 : -1), 0);
    return;
  }
  const mag = mode === "and" ? (left ? 1.4 : 2.15) : 1.4;
  const sign = mode === "and" ? -1 : s;
  const z = mag * amt * sign;
  for (const f of ["Index", "Middle", "Ring", "Pinky"]) {
    for (const i of [1, 2, 3]) setLocal(bones[p + f + i], null, 0, 0, z);
  }
  setLocal(bones[p + "Thumb1"], null, 0.35 * amt, 0.55 * amt * sign, 0.45 * amt * sign);
  setLocal(bones[p + "Thumb2"], null, 0, 0, 0.9 * amt * sign);
  setLocal(bones[p + "Thumb3"], null, 0, 0, 0.7 * amt * sign);
}

function vegFore(b, left, x, y, z, snap = false) {
  // Codo: x,z = flex ELBOW. y = twist ELBOWROLL (no gimbal en el codo).
  const fa = left ? b.LeftForeArm : b.RightForeArm;
  const roll = left ? b.LeftForeArmRoll : b.RightForeArmRoll;
  setLocal(fa, null, x ?? 0, 0, z ?? 0, 1, snap);
  setLocal(roll, null, 0, y ?? 0, 0, 1, snap);
}

function setLocal(bone, hang, x, y, z, hangW = 1, snap = false) {
  if (!bone?.userData.restQ) return;
  _e.set(x ?? 0, y ?? 0, z ?? 0, "XYZ");
  _q.setFromEuler(_e);
  bone.quaternion.copy(bone.userData.restQ);
  if (hang && hangW > 0.001) {
    _hangMix.slerpQuaternions(_id, hang, hangW);
    bone.quaternion.multiply(_hangMix);
  }
  bone.quaternion.multiply(_q);
  if (snap) {
    if (!bone.userData._smQ) bone.userData._smQ = bone.quaternion.clone();
    else bone.userData._smQ.copy(bone.quaternion);
    return;
  }
  if (!bone.userData._smQ) bone.userData._smQ = bone.quaternion.clone();
  else {
    bone.userData._smQ.slerp(bone.quaternion, 0.58);
    bone.quaternion.copy(bone.userData._smQ);
  }
}

export function gokuReady() {
  return Object.keys(URLS).every((id) => pack[id]);
}

export async function preloadGoku() {
  await Promise.all(Object.keys(URLS).map(loadRig));
}

async function loadRig(id) {
  if (pack[id]) return;
  const gltf = await new GLTFLoader().loadAsync(URLS[id]);
  const proto = gltf.scene;
  proto.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(proto);
  pack[id] = {
    proto,
    natH: Math.max(0.05, box.max.y - box.min.y),
    footY: box.min.y,
  };
}

function paintHair(mat, look) {
  if (!mat || !/hair/i.test(mat.name || "")) return mat;
  const m = mat.clone();
  m.userData.ssjHair = true;
  m.map = null;
  m.color.setHex(look?.hairC ?? 0x0a0a0a);
  m.needsUpdate = true;
  return m;
}

function instanceRig(id, altura, look) {
  const p = pack[id];
  const wrap = new THREE.Group();
  const vis = cloneSkinned(p.proto);
  wrap.add(vis);
  vis.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (!o.isSkinnedMesh || /alpha|joint|cube|col/i.test(o.name)) o.visible = false;
      if (o.material) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => paintHair(m, look))
          : paintHair(o.material, look);
      }
    }
  });
  vis.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(vis);
  const hNow = Math.max(0.001, box.max.y - box.min.y);
  vis.position.y -= box.min.y;
  wrap.scale.setScalar((1.55 * altura) / hNow);
  wrap.userData.bones = collectBones(vis);
  wrap.userData.gokuScale = wrap.scale.x;
  wrap.userData.charH = 1.55 * altura;
  wrap.userData.rigId = id;
  wrap.userData.sparking = id !== "goku";
  wrap.userData.sparkingYup = id === "androide19" || id === "gero";
  return wrap;
}

function syncAndroid(g, wrap, b, L) {
  const { armL, armR, legL, legR, elbowL, elbowR, kneeL, kneeR, torsoG, hips, headG, waistY } = L;
  const lxL = legL.rotation.x;
  const lxR = legR.rotation.x;
  const squat = lxL < -0.4 && lxR < -0.4;
  const axL = armL.rotation.x;
  const axR = armR.rotation.x;
  const azL = armL.rotation.z;
  const azR = armR.rotation.z;
  const elL = elbowL?.rotation.x || 0;
  const elR = elbowR?.rotation.x || 0;
  const charging = elL < -1.15 && elR < -1.15;
  const hover = axL > 0.45 && axR > 0.45 && elL < -0.7 && elR < -0.7 && !charging;
  const punchL = g.userData.punchLead === "L";
  const punchR = g.userData.punchLead === "R";
  const lay = THREE.MathUtils.smoothstep(Math.abs(g.rotation.x), 0.38, 1.22);
  const amp = Math.max(Math.abs(lxL), Math.abs(lxR));
  const walking = !squat && amp < 1.12;
  const runW = THREE.MathUtils.smoothstep(amp, 0.72, 1.28);
  const punchAmt = 1.08;
  const swing = THREE.MathUtils.lerp(0.52, 0.42, runW);
  const blast = !punchL && !punchR && axL < -0.55 && axR < -0.55;
  const mxL = hover || punchR ? 0 : punchL ? azL * 1.15 : azL * 0.25;
  const mxR = hover || punchL ? 0 : punchR ? -azR * 1.15 : -azR * 0.25;
  const armX = (ax, punch, otherPunch) => {
    if (hover || otherPunch) return 0;
    if (charging) return ax * 1.05;
    if (punch || blast) return ax * (blast ? 1.2 : punchAmt);
    if (squat) return -0.82;
    return ax * swing;
  };
  const mzL = armX(axL, punchL, punchR);
  const mzR = armX(axR, punchR, punchL);
  const elZL = hover || punchR ? 0 : elL;
  const elZR = hover || punchL ? 0 : elR;
  const hangW = 1 - lay;
  setLocal(b.LeftArm, null, THREE.MathUtils.lerp(mzL, 1.28, lay), 0, -1.22 * hangW + THREE.MathUtils.lerp(mxL, 0, lay));
  setLocal(b.RightArm, null, THREE.MathUtils.lerp(mzR, 1.28, lay), 0, -1.22 * hangW + THREE.MathUtils.lerp(mxR, 0, lay));
  setLocal(b.LeftShoulder, null, 0, 0, 0);
  setLocal(b.RightShoulder, null, 0, 0, 0);
  setLocal(b.LeftForeArm, null, 0, THREE.MathUtils.lerp(elZL, 0, lay), 0);
  setLocal(b.RightForeArm, null, 0, THREE.MathUtils.lerp(elZR, 0, lay), 0);
  fist(b, true, charging || punchL || lay > 0.35 ? 1 : 0, "and");
  fist(b, false, charging || punchR || lay > 0.35 ? 1 : 0, "and");
  const thigh = (x) => {
    const m = -x;
    if (squat) return Math.min(m * 1.05, 1.15);
    if (m > 0) return m * (walking ? 1.15 : Math.abs(x) > 1.05 ? 0.42 : 1.65);
    return Math.max(m * 0.2, walking ? -0.18 : -0.28);
  };
  const knL = (kneeL?.rotation.x || 0) * (squat ? 1.15 : THREE.MathUtils.lerp(1.15, 1.45, runW));
  const knR = (kneeR?.rotation.x || 0) * (squat ? 1.15 : THREE.MathUtils.lerp(1.15, 1.45, runW));
  const close = lay * 0.22;
  const kicking = !squat && Math.abs(lxL - lxR) > 0.7 && amp > 0.95;
  const tY = (x, other) => {
    if (squat) return -thigh(x);
    if (kicking) {
      if (Math.abs(x) <= Math.abs(other)) return 0;
      return -thigh(x);
    }
    const m = -x;
    if (m > 0) return Math.min(m * 0.12, THREE.MathUtils.lerp(0.08, 0.12, runW));
    return m * THREE.MathUtils.lerp(1.45, 3.6, runW);
  };
  setLocal(b.LeftUpLeg, null, 0, tY(lxL, lxR), -close);
  setLocal(b.RightUpLeg, null, 0, tY(lxR, lxL), close);
  setLocal(b.LeftLeg, null, 0, kicking && Math.abs(lxL) <= Math.abs(lxR) ? 0.12 : knL, 0);
  setLocal(b.RightLeg, null, 0, kicking && Math.abs(lxR) <= Math.abs(lxL) ? 0.12 : knR, 0);
  const tx = torsoG.rotation.x || 0;
  const ty = torsoG.rotation.y || 0;
  const hx = headG.rotation.x || 0;
  const sp = squat ? 1 : -1;
  setLocal(b.Spine, null, sp * tx * 0.35, ty * 0.35, 0);
  setLocal(b.Spine1, null, sp * tx * 0.4, ty * 0.4, 0);
  setLocal(b.Spine2, null, sp * tx * 0.35, ty * 0.25, 0);
  setLocal(b.Neck, null, squat ? 0 : -hx * 0.4, 0, 0);
  setLocal(b.Head, null, squat ? 0 : -hx * 0.7, 0, 0);
  if (b.Hips) {
    setLocal(b.Hips, null, 0, hips?.rotation.y || 0, 0);
    b.Hips.position.copy(b.Hips.userData.restP);
    const drop = waistY != null ? waistY - torsoG.position.y : 0;
    const vis = wrap.children[0];
    if (vis) {
      if (wrap.userData.visY0 == null) wrap.userData.visY0 = vis.position.y;
      const sc = wrap.scale.x || 1;
      vis.position.y = wrap.userData.visY0 - Math.max(0, drop) / sc;
    }
  }
}

function syncVegeta(g, wrap, b, L) {
  // Sparking (no Mixamo). Bind A-pose ~45°, brazos ±X.
  // setLocal(hueso, hang, x, y, z): Euler XYZ extra sobre rest. hang=null.
  // Hombro: no Y (entra al pecho). Z=abrir/hang. X=adelante/atrás.
  // Codo: flex en X (L −el, R +el). Muslo X=paso, Y=juntar. Rodilla flex X.
  const { armL, armR, legL, legR, elbowL, elbowR, kneeL, kneeR, torsoG, hips, headG, waistY } = L;
  const lxL = legL.rotation.x;
  const lxR = legR.rotation.x;
  const axL = armL.rotation.x;
  const axR = armR.rotation.x;
  const elL = elbowL?.rotation.x || 0;
  const elR = elbowR?.rotation.x || 0;
  // Cómo se elige el movimiento de BRAZOS (cápsula → hombro/codo):
  // charging = ambos codos muy flexionados (ki). hover = ambos hombros atrás + codos (flotar).
  // punchL/R = cross de ese lado. lay = cuerpo acostado (vuelo/nado) 0..1.
  // Prioridad en Z hombro: hover o el otro brazo pega → z=0; si no, braceo ax*swing (idle/caminar/correr/ki débil).
  // Cross: el brazo que pega sigue ax en Z; el de atrás se anula (punchR apaga zL, punchL apaga zR).
  // Codo: siempre X desde cápsula, salvo el brazo que NO pega en un cross (0).
  // Puño cerrado: ki, el que pega, o lay>0.35.
  const azL = armL.rotation.z;
  const azR = armR.rotation.z;
  const charging = elL < -1.15 && elR < -1.15;
  const hover = axL > 0.05 && axR > 0.05 && elL < -0.7 && elR < -0.7 && !charging;
  const punchL = g.userData.punchLead === "L";
  const punchR = g.userData.punchLead === "R";
  const squat = lxL < -0.4 && lxR < -0.4;
  const lay = THREE.MathUtils.smoothstep(Math.abs(g.rotation.x), 0.38, 1.22);
  const swing = 0.62;
  const down = 0.05 * (1 - lay);
  // VUELO brazos (cápsula en personaje s>0.04: ax atrás, az abrir, el flex).
  // lay 0..1 = cuerpo acostado. Acá NO hay pose Superman extra (X hombro no se mezcla a 1.28).
  // hover (flotar quieto): z hombro = 0 (solo hang down). Si no, z = ±ax*swing (mismo que caminar).
  // down se apaga con lay. Codos: vegFore sigue elL/elR. Puño si lay>0.35.
  const idleZL = (hover ? 0 : axL * swing) + down;
  const idleZR = (hover ? 0 : -axR * swing) - down;
  if (punchL || punchR) {
    const cXL = -1;
    const cXR = 1;
    const cYL = 0;
    const cYR = 0;
    const cZL = 1;
    const cZR = 1;
    const hit = g.userData.punchPhase === "hit";
    if (hit) {
      // GOLPE. Cross IZQ = LeftArm+LeftForeArm. Cross DER = RightArm+RightForeArm.
      // El otro par es el brazo de atrás; no lo uses para el golpe.
      if (punchL) {
        setLocal(b.LeftArm, null, axL * cXL, 0.4 + azL * cYL, azL * cZL, 1, true);
        vegFore(b, true, elL, 2.3, 0, true);
        setLocal(b.RightArm, null, 0, -0.3, idleZR, 1, true);
        vegFore(b, false, elR, -0.3, 0, true);
      } else {
        setLocal(b.RightArm, null, axR * cXR, -0.4 + azR * cYR, -azR * cZR, 1, true);
        vegFore(b, false, elR, -2.3, 0, true);
        setLocal(b.LeftArm, null, 0, 0.3, idleZL, 1, true);
        vegFore(b, true, -elL, 0.3, 0, true);
      }
    } else if (punchL) {
      setLocal(b.LeftArm, null, axL * cXL, -0.3 + azL * cYL, azL * cZL, 1, true);
      vegFore(b, true, elL, 0.3, 0, true);
      setLocal(b.RightArm, null, 0, -0.3, idleZR, 1, true);
      vegFore(b, false, elR, -0.3, 0, true);
    } else {
      setLocal(b.RightArm, null, axR * cXR, 0.3 + azR * cYR, -azR * cZR * -5, 1, true);
      vegFore(b, false, elR, -0.3, 0, true);
      setLocal(b.LeftArm, null, 0, 0.3, idleZL, 1, true);
      vegFore(b, true, -elL, 0.3, 0, true);
    }
  } else if (charging) {
    // CHARGING Vegeta (ki). No usa el ax de idle. Tocá k* hombro y e* vegFore.
    const kXL = 0;
    const kYL = 0.3;
    const kZL = 0;
    const kXR = 0;
    const kYR = -0.3;
    const kZR = 0;
    const keXL = elL;
    const keYL = 1.8;
    const keZL = 0;
    const keXR = elR;
    const keYR = -1.8;
    const keZR = 0;
    setLocal(b.LeftArm, null, kXL, kYL, kZL);
    setLocal(b.RightArm, null, kXR, kYR, kZR);
    vegFore(b, true, keXL, keYL, keZL);
    vegFore(b, false, keXR, keYR, keZR);
  } else if (squat) {
    // AGACHADO Vegeta. Cápsula: ambos muslos x≈-1. Tocá q* hombro y qe* vegFore.
    const qXL = 0;
    const qYL = 0.3;
    const qZL = 0;
    const qXR = 0;
    const qYR = -0.3;
    const qZR = 0;
    const qeXL = -elL;
    const qeYL = -0.3;
    const qeZL = -1.5;
    const qeXR = elR;
    const qeYR = -1;
    const qeZR = 1.5;
    setLocal(b.LeftArm, null, qXL, qYL, qZL);
    setLocal(b.RightArm, null, qXR, qYR, qZR);
    vegFore(b, true, qeXL, qeYL, qeZL);
    vegFore(b, false, qeXR, qeYR, qeZR);
  } else if (lay > 0.04) {
    // VUELO VEGETA — no usa el Superman de la cápsula (un brazo ax≈-2.85).
    // Hombro setLocal x,y,z · vegFore(x flex, y roll, z flex). lay mezcla 0→1.
    const fXL = 0;
    const fYL = -2.3;
    const fZL = 0;
    const fXR = 0;
    const fYR = -0.3;
    const fZR = 0;
    const eXL = -1.6;
    const eYL = 0;
    const eZL = 0;
    const eXR = 0;
    const eYR = -0.3;
    const eZR = 0;
    const u = lay;
    setLocal(b.LeftArm, null, fXL * u, 0.3 + (fYL - 0.3) * u, fZL * u);
    setLocal(b.RightArm, null, fXR * u, -0.3 + (fYR + 0.3) * u, fZR * u);
    vegFore(b, true, eXL * u, 0.3 + (eYL - 0.3) * u, eZL * u);
    vegFore(b, false, eXR * u, -0.3 + (eYR + 0.3) * u, eZR * u);
  } else {
    // idle / caminar / hover (no acostado)
    setLocal(b.LeftArm, null, 0, 0.3, idleZL);
    setLocal(b.RightArm, null, 0, -0.3, idleZR);
    vegFore(b, true, -elL, 0.3, 0);
    vegFore(b, false, elR, -0.3, 0);
  }
  setLocal(b.LeftShoulder, null, 0, 0, punchL ? azL * 0.22 : 0, 1, !!(punchL || punchR));
  setLocal(b.RightShoulder, null, 0, 0, punchR ? -azR * 0.22 : 0, 1, !!(punchL || punchR));
  fist(b, true, charging || punchL || lay > 0.35 ? 1 : 0, "veg");
  fist(b, false, charging || punchR || lay > 0.35 ? 1 : 0, "veg");
  const close = lay * 0.02; // vuelo: Y muslo
  setLocal(b.LeftUpLeg, null, lxL * 1.15, -close, 0);
  setLocal(b.RightUpLeg, null, lxR * 1.15, close, 0);
  setLocal(b.LeftLeg, null, kneeL?.rotation.x || 0, 0, 0);
  setLocal(b.RightLeg, null, kneeR?.rotation.x || 0, 0, 0);
  const tx = torsoG.rotation.x || 0;
  const ty = torsoG.rotation.y || 0;
  const hx = headG.rotation.x || 0;
  setLocal(b.Spine, null, tx * 0.35, 0, ty * 0.35); // inclinar X, twist Z
  setLocal(b.Spine1, null, tx * 0.4, 0, ty * 0.4);
  setLocal(b.Spine2, null, tx * 0.35, 0, ty * 0.25);
  setLocal(b.Neck, null, -hx * 0.4, 0, 0);
  setLocal(b.Head, null, -hx * 0.7, 0, 0);
  if (b.Hips) {
    setLocal(b.Hips, null, 0, 0, hips?.rotation.y || 0);
    b.Hips.position.copy(b.Hips.userData.restP);
    const drop = waistY != null ? waistY - torsoG.position.y : 0;
    const charH = wrap.userData.charH || 1.7;
    if (drop > 0.01) b.Hips.position.z -= (drop / charH) * 28; // agachar −Z
  }
}

function syncMixamo(g) {
  const wrap = g.userData.gokuVis;
  const b = wrap?.userData.bones;
  const L = g.userData.limbs;
  if (!b || !L) return;
  if (wrap.userData.sparkingYup) {
    syncAndroid(g, wrap, b, L);
    return;
  }
  if (wrap.userData.sparking) {
    syncVegeta(g, wrap, b, L);
    return;
  }
  const { armL, armR, legL, legR, elbowL, elbowR, kneeL, kneeR, torsoG, hips, headG, waistY } = L;
  const charH = wrap.userData.charH || 1.7;
  const lxL = legL.rotation.x;
  const lxR = legR.rotation.x;
  const squat = lxL < -0.4 && lxR < -0.4;

  const axL = armL.rotation.x;
  const axR = armR.rotation.x;
  const azL = armL.rotation.z;
  const azR = armR.rotation.z;
  const elL = elbowL?.rotation.x || 0;
  const elR = elbowR?.rotation.x || 0;
  // Referencia: caminar. Mixamo +X = adelante. Cápsula adelante = x<0.
  const walking = !squat && Math.max(Math.abs(lxL), Math.abs(lxR)) < 1.12;
  const thigh = (x) => {
    const m = -x;
    if (squat) return Math.min(m * 1.05, 1.15);
    if (m > 0) return m * (walking ? 1.15 : Math.abs(x) > 1.05 ? 0.42 : 1.65);
    return Math.max(m * 0.2, walking ? -0.18 : -0.28);
  };
  const knL = (kneeL?.rotation.x || 0) * (squat ? 1.15 : walking ? 1.15 : 1.45);
  const knR = (kneeR?.rotation.x || 0) * (squat ? 1.15 : walking ? 1.15 : 1.45);

  const charging = elL < -1.15 && elR < -1.15;
  const hover = axL > 0.45 && axR > 0.45 && elL < -0.7 && elR < -0.7 && !charging;
  const punchL = g.userData.punchLead === "L";
  const punchR = g.userData.punchLead === "R";
  // Mixamo L/R invertidos: adelante en un brazo = atrás en el otro.
  const punchAmt = 0.68;
  const xL = hover || punchR ? 0 : punchL ? -azL * 0.25 : azL * 0.25;
  const xR = hover || punchL ? 0 : punchR ? azR * 0.25 : -azR * 0.25;
  const swing = walking ? 0.52 : 0.42;
  const zL = hover || punchR ? 0 : punchL ? -axL * punchAmt : axL * swing;
  const zR = hover || punchL ? 0 : charging ? -axR : punchR ? axR * punchAmt : squat ? -0.82 : axR * swing;
  const lay = THREE.MathUtils.smoothstep(Math.abs(g.rotation.x), 0.38, 1.22);
  const hangW = 1 - lay;
  setLocal(b.LeftArm, hangL, THREE.MathUtils.lerp(xL, 1.28, lay), 0, THREE.MathUtils.lerp(zL, 0, lay), hangW);
  setLocal(b.RightArm, hangR, THREE.MathUtils.lerp(xR, -1.28, lay), 0, THREE.MathUtils.lerp(zR, 0, lay), hangW);
  setLocal(b.LeftShoulder, null, 0, 0, 0);
  setLocal(b.RightShoulder, null, 0, 0, 0);
  const elZL = hover || punchR ? 0 : -elL;
  const elZR = hover || punchL ? 0 : punchR ? elR : charging ? elR : -elR;
  setLocal(b.LeftForeArm, null, 0, 0, THREE.MathUtils.lerp(elZL, 0, lay));
  setLocal(b.RightForeArm, null, 0, lay * Math.PI, THREE.MathUtils.lerp(elZR, 0, lay));
  fist(b, true, charging || punchL || lay > 0.35 ? 1 : 0);
  fist(b, false, charging || punchR || lay > 0.35 ? 1 : 0);
  const close = lay * 0.98;
  setLocal(b.LeftUpLeg, null, thigh(lxL), 0, -close);
  setLocal(b.RightUpLeg, null, thigh(lxR), 0, close);
  setLocal(b.LeftLeg, null, -knL, 0, 0);
  setLocal(b.RightLeg, null, -knR, 0, 0);
  const tx = torsoG.rotation.x || 0;
  const ty = torsoG.rotation.y || 0;
  const hx = headG.rotation.x || 0;
  const sp = squat ? 1 : -1;
  setLocal(b.Spine, null, sp * tx * 0.35, ty * 0.35, 0);
  setLocal(b.Spine1, null, sp * tx * 0.4, ty * 0.4, 0);
  setLocal(b.Spine2, null, sp * tx * 0.35, ty * 0.25, 0);
  setLocal(b.Neck, null, squat ? 0 : -hx * 0.4, 0, 0);
  setLocal(b.Head, null, squat ? 0 : -hx * 0.7, 0, 0);
  if (b.Hips) {
    setLocal(b.Hips, null, 0, hips?.rotation.y || 0, 0);
    const drop = waistY != null ? waistY - torsoG.position.y : 0;
    b.Hips.position.copy(b.Hips.userData.restP);
    const restY = b.Hips.userData.restP.y;
    b.Hips.position.y = restY - (drop / charH) * restY * (squat ? 1.15 : 1);
  }
}

export function makeGokuBody(altura, look) {
  return makeRiggedBody(altura, look, "goku");
}

export function makeRiggedBody(altura, look, id) {
  const g = makeBody(altura, look);
  g.traverse((o) => {
    if (o.isMesh) {
      o.userData.capsuleMesh = true;
      o.visible = false;
      o.castShadow = false;
    }
  });
  const vis = instanceRig(id, altura, look);
  g.userData.gokuVis = vis;
  g.add(vis);
  g.userData.syncRig = () => syncMixamo(g);
  g.userData.syncRig();
  return g;
}
