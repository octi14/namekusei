import * as THREE from "three";

/**
 * Mangos 3D (vectores) para TODO lo espacial del sculpt.
 * space: head | torso | root — coords locales en unidades de altura (÷ s).
 */
export const VEC_HANDLES = [
  // —— Cara (espacio cabeza) ——
  {
    id: "eyeL",
    label: "Ojo L",
    color: 0x4fc3f7,
    space: "head",
    get: (sc) => new THREE.Vector3(-(sc.eyeSep ?? 0.05), sc.eyeY ?? 0.02, sc.eyeZ ?? 0.13),
    set: (sc, p) => {
      sc.eyeSep = Math.max(0.01, Math.abs(p.x));
      sc.eyeY = p.y;
      sc.eyeZ = p.z;
    },
  },
  {
    id: "eyeR",
    label: "Ojo R",
    color: 0x4fc3f7,
    space: "head",
    get: (sc) => new THREE.Vector3(sc.eyeSep ?? 0.05, sc.eyeY ?? 0.02, sc.eyeZ ?? 0.13),
    set: (sc, p) => {
      sc.eyeSep = Math.max(0.01, Math.abs(p.x));
      sc.eyeY = p.y;
      sc.eyeZ = p.z;
    },
  },
  {
    id: "irisL",
    label: "Iris L",
    color: 0x81d4fa,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        -(sc.irisSep ?? sc.eyeSep ?? 0.05),
        sc.irisY ?? sc.eyeY ?? 0.02,
        sc.irisZ ?? (sc.eyeZ ?? 0.13) + 0.025
      ),
    set: (sc, p) => {
      sc.irisSep = Math.max(0.01, Math.abs(p.x));
      sc.irisY = p.y;
      sc.irisZ = p.z;
    },
  },
  {
    id: "irisR",
    label: "Iris R",
    color: 0x81d4fa,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        sc.irisSep ?? sc.eyeSep ?? 0.05,
        sc.irisY ?? sc.eyeY ?? 0.02,
        sc.irisZ ?? (sc.eyeZ ?? 0.13) + 0.025
      ),
    set: (sc, p) => {
      sc.irisSep = Math.max(0.01, Math.abs(p.x));
      sc.irisY = p.y;
      sc.irisZ = p.z;
    },
  },
  {
    id: "lidL",
    label: "Delineado L",
    color: 0x5d4037,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        -(sc.eyeSep ?? 0.05) - (sc.lidX || 0),
        (sc.eyeY ?? 0.02) + 0.02 + (sc.lidY || 0),
        (sc.eyeZ ?? 0.13) + (sc.lidZ || 0)
      ),
    set: (sc, p) => {
      sc.lidX = Math.abs(p.x) - (sc.eyeSep ?? 0.05);
      sc.lidY = p.y - ((sc.eyeY ?? 0.02) + 0.02);
      sc.lidZ = p.z - (sc.eyeZ ?? 0.13);
      if ((sc.lid ?? 0) < 0.2) sc.lid = 0.75;
    },
  },
  {
    id: "lidR",
    label: "Delineado R",
    color: 0x5d4037,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        (sc.eyeSep ?? 0.05) + (sc.lidX || 0),
        (sc.eyeY ?? 0.02) + 0.02 + (sc.lidY || 0),
        (sc.eyeZ ?? 0.13) + (sc.lidZ || 0)
      ),
    set: (sc, p) => {
      sc.lidX = Math.abs(p.x) - (sc.eyeSep ?? 0.05);
      sc.lidY = p.y - ((sc.eyeY ?? 0.02) + 0.02);
      sc.lidZ = p.z - (sc.eyeZ ?? 0.13);
      if ((sc.lid ?? 0) < 0.2) sc.lid = 0.75;
    },
  },
  {
    id: "browL",
    label: "Ceja L",
    color: 0xffb74d,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        -((sc.eyeSep ?? 0.05) + (sc.browX || 0)),
        (sc.eyeY ?? 0.02) + (sc.browY ?? 0.035),
        (sc.eyeZ ?? 0.13) - 0.01 + (sc.browZ || 0)
      ),
    set: (sc, p) => {
      sc.browX = Math.abs(p.x) - (sc.eyeSep ?? 0.05);
      sc.browY = p.y - (sc.eyeY ?? 0.02);
      sc.browZ = p.z - ((sc.eyeZ ?? 0.13) - 0.01);
      if ((sc.brow ?? 0) < 0.2) sc.brow = 0.55;
    },
  },
  {
    id: "browR",
    label: "Ceja R",
    color: 0xffb74d,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        (sc.eyeSep ?? 0.05) + (sc.browX || 0),
        (sc.eyeY ?? 0.02) + (sc.browY ?? 0.035),
        (sc.eyeZ ?? 0.13) - 0.01 + (sc.browZ || 0)
      ),
    set: (sc, p) => {
      sc.browX = Math.abs(p.x) - (sc.eyeSep ?? 0.05);
      sc.browY = p.y - (sc.eyeY ?? 0.02);
      sc.browZ = p.z - ((sc.eyeZ ?? 0.13) - 0.01);
      if ((sc.brow ?? 0) < 0.2) sc.brow = 0.55;
    },
  },
  {
    id: "nose",
    label: "Nariz",
    color: 0xef9a9a,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        sc.noseX || 0,
        (sc.eyeY ?? 0.02) - 0.025 + (sc.noseY || 0),
        (sc.eyeZ ?? 0.13) + 0.025 + (sc.noseZ || 0)
      ),
    set: (sc, p) => {
      sc.noseX = p.x;
      sc.noseY = p.y - ((sc.eyeY ?? 0.02) - 0.025);
      sc.noseZ = p.z - ((sc.eyeZ ?? 0.13) + 0.025);
      if ((sc.nose ?? 0) < 0.15) sc.nose = 0.45;
      if (!sc.noseType || sc.noseType === "none") sc.noseType = "anime";
    },
  },
  {
    id: "mouth",
    label: "Boca",
    color: 0xce93d8,
    space: "head",
    get: (sc) =>
      new THREE.Vector3(
        sc.mouthX || 0,
        (sc.eyeY ?? 0.02) - 0.055 + (sc.mouthY || 0),
        (sc.eyeZ ?? 0.13) + 0.015 + (sc.mouthZ || 0)
      ),
    set: (sc, p) => {
      sc.mouthX = p.x;
      sc.mouthY = p.y - ((sc.eyeY ?? 0.02) - 0.055);
      sc.mouthZ = p.z - ((sc.eyeZ ?? 0.13) + 0.015);
      if ((sc.mouth ?? 0) < 0.15) sc.mouth = 0.55;
    },
  },
  {
    id: "jaw",
    label: "Mandíbula",
    color: 0xa1887f,
    space: "head",
    get: (sc) => new THREE.Vector3(sc.jawX || 0, -0.08 + (sc.jawY || 0), sc.jawZ || 0),
    set: (sc, p) => {
      sc.jawX = p.x;
      sc.jawY = p.y + 0.08;
      sc.jawZ = p.z;
      if ((sc.jaw ?? 0) < 0.1) sc.jaw = 0.4;
    },
  },
  {
    id: "earL",
    label: "Oreja L",
    color: 0xffcc80,
    space: "head",
    get: (sc) => new THREE.Vector3(-(sc.earX ?? 0.15), 0, 0),
    set: (sc, p) => {
      sc.earX = Math.max(0.06, Math.abs(p.x));
    },
  },
  {
    id: "earR",
    label: "Oreja R",
    color: 0xffcc80,
    space: "head",
    get: (sc) => new THREE.Vector3(sc.earX ?? 0.15, 0, 0),
    set: (sc, p) => {
      sc.earX = Math.max(0.06, Math.abs(p.x));
    },
  },
  {
    id: "faceGem",
    label: "Gema cara",
    color: 0xba68c8,
    space: "head",
    get: (sc) => new THREE.Vector3(sc.faceGemX || 0, 0.02 + (sc.faceGemY || 0), 0.15 + (sc.faceGemZ || 0)),
    set: (sc, p) => {
      sc.faceGemX = p.x;
      sc.faceGemY = p.y - 0.02;
      sc.faceGemZ = p.z - 0.15;
      sc.showFaceGem = 1;
    },
  },
  {
    id: "hair",
    label: "Pelo Y",
    color: 0x90a4ae,
    space: "head",
    get: (sc) => new THREE.Vector3(0, 0.12 + (sc.hairY || 0), 0),
    set: (sc, p) => {
      sc.hairY = p.y - 0.12;
    },
  },

  // —— Torso / gear ——
  {
    id: "chest",
    label: "Pecho",
    color: 0x80cbc4,
    space: "torso",
    get: (sc) => new THREE.Vector3(0, (sc.chestY ?? 0.96) - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0), sc.chestZ ?? 0.02),
    set: (sc, p) => {
      sc.chestY = p.y + (sc.waistYMul ?? 0.62) - (sc.torsoY || 0);
      sc.chestZ = p.z;
    },
  },
  {
    id: "pecL",
    label: "Pectoral L",
    color: 0x4db6ac,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        -(sc.pecSep ?? 0.07),
        (sc.pecY ?? 1.05) - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0),
        sc.pecZ ?? 0.1
      ),
    set: (sc, p) => {
      sc.pecSep = Math.max(0.02, Math.abs(p.x));
      sc.pecY = p.y + (sc.waistYMul ?? 0.62) - (sc.torsoY || 0);
      sc.pecZ = p.z;
    },
  },
  {
    id: "pecR",
    label: "Pectoral R",
    color: 0x4db6ac,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        sc.pecSep ?? 0.07,
        (sc.pecY ?? 1.05) - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0),
        sc.pecZ ?? 0.1
      ),
    set: (sc, p) => {
      sc.pecSep = Math.max(0.02, Math.abs(p.x));
      sc.pecY = p.y + (sc.waistYMul ?? 0.62) - (sc.torsoY || 0);
      sc.pecZ = p.z;
    },
  },
  {
    id: "plate",
    label: "Placa",
    color: 0xfff176,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        sc.plateX || 0,
        1.0 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.plateY || 0),
        sc.plateZ || 0
      ),
    set: (sc, p) => {
      sc.plateX = p.x;
      sc.plateY = p.y - (1.0 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.plateZ = p.z;
      sc.showPlate = 1;
    },
  },
  {
    id: "padL",
    label: "Hombrera L",
    color: 0xffd54f,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        -(0.2 + (sc.padX || 0)),
        1.14 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.padY || 0),
        0.04
      ),
    set: (sc, p) => {
      sc.padX = Math.abs(p.x) - 0.2;
      sc.padY = p.y - (1.14 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.showPads = 1;
    },
  },
  {
    id: "padR",
    label: "Hombrera R",
    color: 0xffd54f,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        0.2 + (sc.padX || 0),
        1.14 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.padY || 0),
        0.04
      ),
    set: (sc, p) => {
      sc.padX = Math.abs(p.x) - 0.2;
      sc.padY = p.y - (1.14 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.showPads = 1;
    },
  },
  {
    id: "cape",
    label: "Capa",
    color: 0x64b5f6,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        sc.capeX || 0,
        (sc.chestY ?? 0.96) - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + 0.06 + (sc.capeY || 0),
        -0.1 + (sc.capeZ || 0)
      ),
    set: (sc, p) => {
      sc.capeX = p.x;
      sc.capeY = p.y - ((sc.chestY ?? 0.96) - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + 0.06);
      sc.capeZ = p.z + 0.1;
      sc.showCape = 1;
    },
  },
  {
    id: "under",
    label: "Interior",
    color: 0xa1887f,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        sc.underX || 0,
        0.92 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.underY || 0),
        0.02 + (sc.underZ || 0)
      ),
    set: (sc, p) => {
      sc.underX = p.x;
      sc.underY = p.y - (0.92 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.underZ = p.z - 0.02;
      sc.showUnder = 1;
    },
  },
  {
    id: "belt",
    label: "Cinturón",
    color: 0xffe082,
    space: "torso",
    get: (sc) => new THREE.Vector3(0, 0.72 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.beltY || 0), 0.1),
    set: (sc, p) => {
      sc.beltY = p.y - (0.72 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.showBelt = 1;
    },
  },
  {
    id: "sash",
    label: "Fajín",
    color: 0x90caf9,
    space: "torso",
    get: (sc) => new THREE.Vector3(0, sc.sashY || 0, 0.16),
    set: (sc, p) => {
      sc.sashY = p.y;
      sc.showSash = 1;
    },
  },
  {
    id: "hipFlapL",
    label: "Faldón L",
    color: 0xffcc80,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        -(0.16 + (sc.hipFlapX || 0)),
        0.52 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.hipFlapY || 0),
        sc.hipFlapZ || 0
      ),
    set: (sc, p) => {
      sc.hipFlapX = Math.abs(p.x) - 0.16;
      sc.hipFlapY = p.y - (0.52 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.hipFlapZ = p.z;
      sc.showHipFlaps = 1;
    },
  },
  {
    id: "hipFlapR",
    label: "Faldón R",
    color: 0xffcc80,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        0.16 + (sc.hipFlapX || 0),
        0.52 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.hipFlapY || 0),
        sc.hipFlapZ || 0
      ),
    set: (sc, p) => {
      sc.hipFlapX = Math.abs(p.x) - 0.16;
      sc.hipFlapY = p.y - (0.52 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.hipFlapZ = p.z;
      sc.showHipFlaps = 1;
    },
  },
  {
    id: "frostLine",
    label: "Frost línea",
    color: 0xce93d8,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        sc.frostLineX || 0,
        0.98 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.frostLineY || 0),
        0.16 + (sc.frostLineZ || 0)
      ),
    set: (sc, p) => {
      sc.frostLineX = p.x;
      sc.frostLineY = p.y - (0.98 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.frostLineZ = p.z - 0.16;
    },
  },
  {
    id: "frostGem",
    label: "Frost gema",
    color: 0xba68c8,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        sc.frostGemX || 0,
        1.12 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + (sc.frostGemY || 0),
        0.17 + (sc.frostGemZ || 0)
      ),
    set: (sc, p) => {
      sc.frostGemX = p.x;
      sc.frostGemY = p.y - (1.12 - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0));
      sc.frostGemZ = p.z - 0.17;
    },
  },
  {
    id: "torso",
    label: "Torso Y",
    color: 0x80cbc4,
    space: "root",
    get: (sc) => new THREE.Vector3(0, (sc.waistYMul ?? 0.62) + (sc.torsoY || 0), 0),
    set: (sc, p) => {
      sc.torsoY = p.y - (sc.waistYMul ?? 0.62);
    },
  },

  // —— Hombros / brazos / piernas ——
  {
    id: "shoulderL",
    label: "Hombro L",
    color: 0xef5350,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        -(sc.shoulderX ?? 0.24) - (sc.armX || 0),
        (sc.shoulderY ?? 1.16) - (sc.waistYMul ?? 0.62) + (sc.armY || 0),
        sc.armZ || 0
      ),
    set: (sc, p) => {
      sc.shoulderX = Math.max(0.1, Math.abs(p.x) - Math.abs(sc.armX || 0));
      sc.shoulderY = p.y + (sc.waistYMul ?? 0.62) - (sc.armY || 0);
      sc.armZ = p.z;
    },
  },
  {
    id: "shoulderR",
    label: "Hombro R",
    color: 0xef5350,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        (sc.shoulderX ?? 0.24) + (sc.armX || 0),
        (sc.shoulderY ?? 1.16) - (sc.waistYMul ?? 0.62) + (sc.armY || 0),
        sc.armZ || 0
      ),
    set: (sc, p) => {
      sc.shoulderX = Math.max(0.1, Math.abs(p.x) - Math.abs(sc.armX || 0));
      sc.shoulderY = p.y + (sc.waistYMul ?? 0.62) - (sc.armY || 0);
      sc.armZ = p.z;
    },
  },
  {
    id: "armOff",
    label: "Brazo offset",
    color: 0xe57373,
    space: "torso",
    get: (sc) => new THREE.Vector3(sc.armX || 0, sc.armY || 0, sc.armZ || 0),
    set: (sc, p) => {
      sc.armX = p.x;
      sc.armY = p.y;
      sc.armZ = p.z;
    },
  },
  {
    id: "hipL",
    label: "Cadera L",
    color: 0x66bb6a,
    space: "root",
    get: (sc) => new THREE.Vector3(-(sc.hipX ?? 0.1), sc.hipY ?? 0.6, 0),
    set: (sc, p) => {
      sc.hipX = Math.max(0.04, Math.abs(p.x));
      sc.hipY = p.y;
    },
  },
  {
    id: "hipR",
    label: "Cadera R",
    color: 0x66bb6a,
    space: "root",
    get: (sc) => new THREE.Vector3(sc.hipX ?? 0.1, sc.hipY ?? 0.6, 0),
    set: (sc, p) => {
      sc.hipX = Math.max(0.04, Math.abs(p.x));
      sc.hipY = p.y;
    },
  },
  {
    id: "thighY",
    label: "Muslo Y",
    color: 0x81c784,
    space: "root",
    get: (sc) => new THREE.Vector3(0, (sc.hipY ?? 0.6) + (sc.thighY || 0), 0),
    set: (sc, p) => {
      sc.thighY = p.y - (sc.hipY ?? 0.6);
    },
  },
  {
    id: "foot",
    label: "Pie",
    color: 0x4db6ac,
    space: "root",
    get: (sc) => new THREE.Vector3(0, sc.footY || 0, sc.footZ ?? 0.22),
    set: (sc, p) => {
      sc.footY = p.y;
      sc.footZ = p.z;
    },
  },
  {
    id: "neck",
    label: "Cuello",
    color: 0xbcaaa4,
    space: "torso",
    get: (sc) =>
      new THREE.Vector3(
        0,
        (sc.chestY ?? 0.96) - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + 0.2 + (sc.neckY || 0),
        0
      ),
    set: (sc, p) => {
      sc.neckY = p.y - ((sc.chestY ?? 0.96) - (sc.waistYMul ?? 0.62) + (sc.torsoY || 0) + 0.2);
    },
  },
];

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();

export function createHandleRoot() {
  const g = new THREE.Group();
  g.name = "sculptHandles";
  return g;
}

export function rebuildHandles(root, sculpt, altura, mesh) {
  while (root.children.length) {
    const c = root.children[0];
    root.remove(c);
    c.geometry?.dispose();
    c.material?.dispose();
  }
  if (!mesh) return;
  const s = altura;
  const limbs = mesh.userData?.limbs || {};
  const parents = {
    head: limbs.headG || mesh,
    torso: limbs.torsoG || mesh,
    root: mesh,
  };

  for (const def of VEC_HANDLES) {
    const parent = parents[def.space] || mesh;
    const local = def.get(sculpt).multiplyScalar(s);
    const mat = new THREE.MeshBasicMaterial({
      color: def.color,
      depthTest: false,
      transparent: true,
      opacity: 0.92,
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.028 * Math.max(0.7, s * 0.55), 16, 12), mat);
    ball.renderOrder = 999;
    ball.userData.handleDef = def;
    ball.userData.handleParent = parent;
    // Posición mundo → se actualiza cada frame vía syncHandleWorld
    parent.updateWorldMatrix(true, false);
    parent.localToWorld(_v.copy(local));
    ball.position.copy(_v);
    root.add(ball);

    // Ejes XYZ chicos (vectores)
    for (const [axis, col, dir] of [
      ["x", 0xff5252, new THREE.Vector3(1, 0, 0)],
      ["y", 0x69f0ae, new THREE.Vector3(0, 1, 0)],
      ["z", 0x40c4ff, new THREE.Vector3(0, 0, 1)],
    ]) {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.07 * s, 8),
        new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.85 })
      );
      shaft.renderOrder = 998;
      shaft.position.copy(_v).addScaledVector(dir, 0.04 * s);
      if (axis === "x") shaft.rotation.z = -Math.PI / 2;
      if (axis === "z") shaft.rotation.x = Math.PI / 2;
      shaft.userData.handleDef = def;
      shaft.userData.handleParent = parent;
      shaft.userData.axis = axis;
      root.add(shaft);
    }
  }
}

export function syncHandlePositions(root, sculpt, altura, mesh) {
  if (!root || !mesh) return;
  const s = altura;
  const limbs = mesh.userData?.limbs || {};
  const parents = {
    head: limbs.headG || mesh,
    torso: limbs.torsoG || mesh,
    root: mesh,
  };
  // Agrupar por def id
  const byId = new Map();
  for (const c of root.children) {
    const id = c.userData.handleDef?.id;
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(c);
  }
  for (const def of VEC_HANDLES) {
    const list = byId.get(def.id);
    if (!list) continue;
    const parent = parents[def.space] || mesh;
    parent.updateWorldMatrix(true, false);
    const local = def.get(sculpt).multiplyScalar(s);
    parent.localToWorld(_v.copy(local));
    for (const c of list) {
      if (c.userData.axis === "x") c.position.copy(_v).add(new THREE.Vector3(0.04 * s, 0, 0));
      else if (c.userData.axis === "y") c.position.copy(_v).add(new THREE.Vector3(0, 0.04 * s, 0));
      else if (c.userData.axis === "z") c.position.copy(_v).add(new THREE.Vector3(0, 0, 0.04 * s));
      else c.position.copy(_v);
    }
  }
}

/** Raycast → handle. Devuelve { def, axis, object } o null. */
export function pickHandle(root, raycaster) {
  if (!root?.children.length) return null;
  const hits = raycaster.intersectObjects(root.children, false);
  if (!hits.length) return null;
  const o = hits[0].object;
  if (!o.userData.handleDef) return null;
  return { def: o.userData.handleDef, axis: o.userData.axis || null, object: o };
}

/**
 * Arrastre: mueve en plano de cámara, o solo un eje si axis.
 * Escribe en sculpt (unidades normalizadas).
 */
export function dragHandle(def, axis, sculpt, altura, mesh, raycaster, camera) {
  const s = altura;
  const limbs = mesh.userData?.limbs || {};
  const parent =
    def.space === "head" ? limbs.headG || mesh : def.space === "torso" ? limbs.torsoG || mesh : mesh;
  parent.updateWorldMatrix(true, false);
  const local0 = def.get(sculpt).multiplyScalar(s);
  parent.localToWorld(_v.copy(local0));

  camera.getWorldDirection(_n);
  _plane.setFromNormalAndCoplanarPoint(_n, _v);
  if (!raycaster.ray.intersectPlane(_plane, _hit)) return false;

  if (axis === "x") _hit.y = _v.y, _hit.z = _v.z;
  else if (axis === "y") _hit.x = _v.x, _hit.z = _v.z;
  else if (axis === "z") _hit.x = _v.x, _hit.y = _v.y;

  parent.worldToLocal(_hit);
  _hit.divideScalar(s);
  def.set(sculpt, _hit);
  return true;
}
