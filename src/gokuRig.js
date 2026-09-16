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

function fist(bones, left, amt, mode, snap = false) {
  const p = left ? "LeftHand" : "RightHand";
  const s = left ? -1 : 1;
  if (mode === "veg") {
    const y = 1.25 * amt * (left ? 1 : -1);
    for (const f of ["Index", "Middle", "Ring", "Pinky"]) {
      for (const i of [1, 2, 3]) setLocal(bones[p + f + i], null, 0, y, 0, 1, snap);
    }
    setLocal(bones[p + "Thumb1"], null, 0.3 * amt, 0.5 * amt * (left ? 1 : -1), 0, 1, snap);
    return;
  }
  // Mixamo (Gokú) 1:1: flexión en Z — izq + / der − (con hang viejo era al revés)
  // Android: ambos en Z−
  const mag = mode === "and" ? (left ? 1.4 : 2.15) : 1.4;
  const sign = mode === "and" ? -1 : -s;
  const z = mag * amt * sign;
  for (const f of ["Index", "Middle", "Ring", "Pinky"]) {
    for (const i of [1, 2, 3]) setLocal(bones[p + f + i], null, 0, 0, z, 1, snap);
  }
  setLocal(bones[p + "Thumb1"], null, 0.35 * amt, 0.55 * amt * sign, 0.45 * amt * sign, 1, snap);
  setLocal(bones[p + "Thumb2"], null, 0, 0, 0.9 * amt * sign, 1, snap);
  setLocal(bones[p + "Thumb3"], null, 0, 0, 0.7 * amt * sign, 1, snap);
}

function vegFore(b, left, x, y, z, snap = false) {
  // Flex del codo en el antebrazo; sin ELBOWROLL (ese roll torcía el antebrazo al editar).
  const fa = left ? b.LeftForeArm : b.RightForeArm;
  const roll = left ? b.LeftForeArmRoll : b.RightForeArmRoll;
  setLocal(fa, null, x ?? 0, y ?? 0, z ?? 0, 1, snap);
  if (roll) setLocal(roll, null, 0, 0, 0, 1, snap);
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
  const snap = !!g.userData.rigSnap;
  const axL = armL.rotation.x;
  const axR = armR.rotation.x;
  const ayL = armL.rotation.y;
  const ayR = armR.rotation.y;
  const azL = armL.rotation.z;
  const azR = armR.rotation.z;
  const elL = elbowL?.rotation.x || 0;
  const elR = elbowR?.rotation.x || 0;
  const elYL = elbowL?.rotation.y || 0;
  const elYR = elbowR?.rotation.y || 0;
  const elZL = elbowL?.rotation.z || 0;
  const elZR = elbowR?.rotation.z || 0;

  // Misma convención que el editor (rigSnap): cápsula XYZ → hueso Mixamo 1:1
  setLocal(b.LeftArm, null, axL, ayL, azL, 1, snap);
  setLocal(b.RightArm, null, axR, ayR, azR, 1, snap);
  setLocal(b.LeftForeArm, null, elL, elYL, elZL, 1, snap);
  setLocal(b.RightForeArm, null, elR, elYR, elZR, 1, snap);
  setLocal(b.LeftShoulder, null, 0, 0, 0, 1, snap);
  setLocal(b.RightShoulder, null, 0, 0, 0, 1, snap);

  const wL = L.wristL?.rotation;
  const wR = L.wristR?.rotation;
  setLocal(b.LeftHand, null, wL?.x || 0, wL?.y || 0, wL?.z || 0, 1, snap);
  setLocal(b.RightHand, null, wR?.x || 0, wR?.y || 0, wR?.z || 0, 1, snap);
  fist(b, true, g.userData.fistL || 0, "and", snap);
  fist(b, false, g.userData.fistR || 0, "and", snap);

  setLocal(b.LeftUpLeg, null, legL.rotation.x, legL.rotation.y, legL.rotation.z, 1, snap);
  setLocal(b.RightUpLeg, null, legR.rotation.x, legR.rotation.y, legR.rotation.z, 1, snap);
  setLocal(b.LeftLeg, null, kneeL?.rotation.x || 0, kneeL?.rotation.y || 0, kneeL?.rotation.z || 0, 1, snap);
  setLocal(b.RightLeg, null, kneeR?.rotation.x || 0, kneeR?.rotation.y || 0, kneeR?.rotation.z || 0, 1, snap);

  const tx = torsoG.rotation.x || 0;
  const ty = torsoG.rotation.y || 0;
  const tz = torsoG.rotation.z || 0;
  const hx = headG.rotation.x || 0;
  const hy = headG.rotation.y || 0;
  const hz = headG.rotation.z || 0;
  setLocal(b.Spine, null, tx * 0.35, ty * 0.35, tz * 0.35, 1, snap);
  setLocal(b.Spine1, null, tx * 0.4, ty * 0.4, tz * 0.4, 1, snap);
  setLocal(b.Spine2, null, tx * 0.35, ty * 0.35, tz * 0.25, 1, snap);
  setLocal(b.Neck, null, hx * 0.4, hy * 0.4, hz * 0.4, 1, snap);
  setLocal(b.Head, null, hx * 0.7, hy * 0.7, hz * 0.7, 1, snap);
  if (b.Hips) {
    setLocal(b.Hips, null, hips?.rotation.x || 0, hips?.rotation.y || 0, hips?.rotation.z || 0, 1, snap);
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
  const { armL, armR, legL, legR, elbowL, elbowR, kneeL, kneeR, torsoG, hips, headG, waistY } = L;
  const snap = !!g.userData.rigSnap;
  const axL = armL.rotation.x;
  const axR = armR.rotation.x;
  const ayL = armL.rotation.y;
  const ayR = armR.rotation.y;
  const azL = armL.rotation.z;
  const azR = armR.rotation.z;
  const elL = elbowL?.rotation.x || 0;
  const elR = elbowR?.rotation.x || 0;
  const elYL = elbowL?.rotation.y || 0;
  const elYR = elbowR?.rotation.y || 0;
  const elZL = elbowL?.rotation.z || 0;
  const elZR = elbowR?.rotation.z || 0;

  setLocal(b.LeftArm, null, axL, ayL, azL, 1, snap);
  setLocal(b.RightArm, null, axR, ayR, azR, 1, snap);
  vegFore(b, true, elL, elYL, elZL, snap);
  vegFore(b, false, elR, elYR, elZR, snap);
  setLocal(b.LeftShoulder, null, 0, 0, 0, 1, snap);
  setLocal(b.RightShoulder, null, 0, 0, 0, 1, snap);

  const wL = L.wristL?.rotation;
  const wR = L.wristR?.rotation;
  setLocal(b.LeftHand, null, wL?.x || 0, wL?.y || 0, wL?.z || 0, 1, snap);
  setLocal(b.RightHand, null, wR?.x || 0, wR?.y || 0, wR?.z || 0, 1, snap);
  fist(b, true, g.userData.fistL || 0, "veg", snap);
  fist(b, false, g.userData.fistR || 0, "veg", snap);

  setLocal(b.LeftUpLeg, null, legL.rotation.x, legL.rotation.y, legL.rotation.z, 1, snap);
  setLocal(b.RightUpLeg, null, legR.rotation.x, legR.rotation.y, legR.rotation.z, 1, snap);
  setLocal(b.LeftLeg, null, kneeL?.rotation.x || 0, kneeL?.rotation.y || 0, kneeL?.rotation.z || 0, 1, snap);
  setLocal(b.RightLeg, null, kneeR?.rotation.x || 0, kneeR?.rotation.y || 0, kneeR?.rotation.z || 0, 1, snap);

  const tx = torsoG.rotation.x || 0;
  const ty = torsoG.rotation.y || 0;
  const tz = torsoG.rotation.z || 0;
  const hx = headG.rotation.x || 0;
  const hy = headG.rotation.y || 0;
  const hz = headG.rotation.z || 0;
  setLocal(b.Spine, null, tx * 0.35, ty * 0.35, tz * 0.35, 1, snap);
  setLocal(b.Spine1, null, tx * 0.4, ty * 0.4, tz * 0.4, 1, snap);
  setLocal(b.Spine2, null, tx * 0.35, ty * 0.35, tz * 0.25, 1, snap);
  setLocal(b.Neck, null, hx * 0.4, hy * 0.4, hz * 0.4, 1, snap);
  setLocal(b.Head, null, hx * 0.7, hy * 0.7, hz * 0.7, 1, snap);
  if (b.Hips) {
    setLocal(b.Hips, null, hips?.rotation.x || 0, hips?.rotation.y || 0, hips?.rotation.z || 0, 1, snap);
    b.Hips.position.copy(b.Hips.userData.restP);
    const drop = waistY != null ? waistY - torsoG.position.y : 0;
    const charH = wrap.userData.charH || 1.7;
    if (drop > 0.01) b.Hips.position.z -= (drop / charH) * 28;
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
  // Gokú: cápsula XYZ → Mixamo 1:1 (mismo espacio que el editor)
  const { armL, armR, legL, legR, elbowL, elbowR, kneeL, kneeR, torsoG, hips, headG, waistY } = L;
  const snap = !!g.userData.rigSnap;
  const charH = wrap.userData.charH || 1.7;

  setLocal(b.LeftArm, null, armL.rotation.x, armL.rotation.y, armL.rotation.z, 1, snap);
  setLocal(b.RightArm, null, armR.rotation.x, armR.rotation.y, armR.rotation.z, 1, snap);
  setLocal(b.LeftShoulder, null, 0, 0, 0, 1, snap);
  setLocal(b.RightShoulder, null, 0, 0, 0, 1, snap);
  setLocal(
    b.LeftForeArm,
    null,
    elbowL?.rotation.x || 0,
    elbowL?.rotation.y || 0,
    elbowL?.rotation.z || 0,
    1,
    snap
  );
  setLocal(
    b.RightForeArm,
    null,
    elbowR?.rotation.x || 0,
    elbowR?.rotation.y || 0,
    elbowR?.rotation.z || 0,
    1,
    snap
  );

  const wL = L.wristL?.rotation;
  const wR = L.wristR?.rotation;
  setLocal(b.LeftHand, null, wL?.x || 0, wL?.y || 0, wL?.z || 0, 1, snap);
  setLocal(b.RightHand, null, wR?.x || 0, wR?.y || 0, wR?.z || 0, 1, snap);
  const punchL = g.userData.punchLead === "L";
  const punchR = g.userData.punchLead === "R";
  fist(b, true, Math.max(g.userData.fistL || 0, !snap && punchL ? 1 : 0), null, snap);
  fist(b, false, Math.max(g.userData.fistR || 0, !snap && punchR ? 1 : 0), null, snap);

  setLocal(b.LeftUpLeg, null, legL.rotation.x, legL.rotation.y, legL.rotation.z, 1, snap);
  setLocal(b.RightUpLeg, null, legR.rotation.x, legR.rotation.y, legR.rotation.z, 1, snap);
  setLocal(b.LeftLeg, null, kneeL?.rotation.x || 0, kneeL?.rotation.y || 0, kneeL?.rotation.z || 0, 1, snap);
  setLocal(b.RightLeg, null, kneeR?.rotation.x || 0, kneeR?.rotation.y || 0, kneeR?.rotation.z || 0, 1, snap);

  const tx = torsoG.rotation.x || 0;
  const ty = torsoG.rotation.y || 0;
  const tz = torsoG.rotation.z || 0;
  const hx = headG.rotation.x || 0;
  const hy = headG.rotation.y || 0;
  const hz = headG.rotation.z || 0;
  setLocal(b.Spine, null, tx * 0.35, ty * 0.35, tz * 0.35, 1, snap);
  setLocal(b.Spine1, null, tx * 0.4, ty * 0.4, tz * 0.4, 1, snap);
  setLocal(b.Spine2, null, tx * 0.35, ty * 0.35, tz * 0.25, 1, snap);
  setLocal(b.Neck, null, hx * 0.4, hy * 0.4, hz * 0.4, 1, snap);
  setLocal(b.Head, null, hx * 0.7, hy * 0.7, hz * 0.7, 1, snap);
  if (b.Hips) {
    setLocal(b.Hips, null, hips?.rotation.x || 0, hips?.rotation.y || 0, hips?.rotation.z || 0, 1, snap);
    const drop = waistY != null ? waistY - torsoG.position.y : 0;
    b.Hips.position.copy(b.Hips.userData.restP);
    const restY = b.Hips.userData.restP.y;
    b.Hips.position.y = restY - (drop / charH) * restY;
  }
}

export function makeGokuBody(altura, look) {
  return makeRiggedBody(altura, look, "goku");
}

export function makeRiggedBody(altura, look, id) {
  const g = makeBody(altura, look);
  const vis = instanceRig(id, altura, look);
  g.userData.gokuVis = vis;
  g.add(vis);
  g.traverse((o) => {
    if (!o.isMesh) return;
    let p = o;
    let under = false;
    while (p) {
      if (p === vis) {
        under = true;
        break;
      }
      p = p.parent;
    }
    if (under) return;
    o.userData.capsuleMesh = true;
    o.visible = false;
    o.castShadow = false;
  });
  g.userData.syncRig = () => syncMixamo(g);
  g.userData.syncRig();
  return g;
}
