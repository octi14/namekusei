import * as THREE from "three";

function makeLimb(radius, len, mat, x, y, extras) {
  const piv = new THREE.Group();
  piv.position.set(x, y, 0);
  const cyl = Math.max(0.02, len - radius * 2);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, cyl, 8, 12), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  piv.add(m);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 14, 12), mat);
  joint.castShadow = true;
  piv.add(joint);
  if (extras?.hand) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, 14, 12), extras.hand);
    hand.position.y = -len + radius * 0.2;
    hand.castShadow = true;
    piv.add(hand);
  }
  if (extras?.boot) {
    const boot = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.25, 14, 12), extras.boot);
    boot.scale.set(1.15, 0.7, 1.35);
    boot.position.set(0, -len + radius * 0.15, 0.02);
    boot.castShadow = true;
    piv.add(boot);
  }
  if (extras?.band) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.12, radius * 0.18, 10, 16),
      extras.band
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = -len * 0.22;
    piv.add(band);
  }
  return piv;
}

function makeArm(radius, upperLen, lowerLen, mat, x, y, extras) {
  const sh = new THREE.Group();
  sh.position.set(x, y, 0);
  const upCyl = Math.max(0.02, upperLen - radius * 2);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(radius, upCyl, 8, 12), mat);
  upper.scale.set(1.22, 1, 1.12);
  upper.position.y = -upperLen / 2;
  upper.castShadow = true;
  sh.add(upper);
  if (extras?.band) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.12, radius * 0.18, 10, 16),
      extras.band
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = -upperLen * 0.35;
    sh.add(band);
  }
  const elbow = new THREE.Group();
  elbow.position.y = -upperLen;
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 14, 12), mat);
  joint.castShadow = true;
  elbow.add(joint);
  const lowR = radius * 0.92;
  const lowCyl = Math.max(0.02, lowerLen - lowR * 2);
  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(lowR, lowCyl, 8, 12), mat);
  lower.position.y = -lowerLen / 2;
  lower.castShadow = true;
  elbow.add(lower);
  if (extras?.hand) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(lowR * 1.2, 14, 12), extras.hand);
    hand.position.y = -lowerLen + lowR * 0.15;
    hand.castShadow = true;
    elbow.add(hand);
  }
  sh.add(elbow);
  sh.userData.elbow = elbow;
  return sh;
}

function makeLeg(radius, thighLen, shinLen, mat, x, y, extras) {
  const hip = new THREE.Group();
  hip.position.set(x, y, 0);
  const thighCyl = Math.max(0.02, thighLen - radius * 2);
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, thighCyl, 8, 12), mat);
  thigh.scale.set(1.18, 1, 1.14);
  thigh.position.y = -thighLen / 2;
  thigh.castShadow = true;
  hip.add(thigh);
  const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 14, 12), mat);
  kneeBall.castShadow = true;
  const knee = new THREE.Group();
  knee.position.y = -thighLen;
  knee.add(kneeBall);
  const shinR = radius * 0.9;
  const shinCyl = Math.max(0.02, shinLen - shinR * 2);
  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(shinR, shinCyl, 8, 12), mat);
  shin.position.y = -shinLen / 2;
  shin.castShadow = true;
  knee.add(shin);
  if (extras?.boot) {
    const boot = new THREE.Mesh(new THREE.SphereGeometry(shinR * 1.35, 14, 12), extras.boot);
    boot.scale.set(1.2, 0.65, 1.45);
    boot.position.set(0, -shinLen + shinR * 0.2, 0.04);
    boot.castShadow = true;
    knee.add(boot);
  }
  hip.add(knee);
  hip.userData.knee = knee;
  return hip;
}

function addHeadGear(headG, s, look) {
  const hc = new THREE.MeshLambertMaterial({ color: look.hairC ?? 0x111 });
  hc.userData.ssjHair = true;
  const t = look.hair;
  if (t === "spike" || t === "goku" || t === "gohan") {
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.24 * s, 10), hc);
      const a = (i / 7) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.07 * s, 0.13 * s, Math.sin(a) * 0.07 * s);
      spike.rotation.x = -0.4;
      spike.rotation.z = Math.cos(a) * 0.35;
      headG.add(spike);
    }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.065 * s, 0.3 * s, 10), hc);
    top.position.y = 0.18 * s;
    headG.add(top);
  } else if (t === "spikeV" || t === "vegeta") {
    for (let i = 0; i < 6; i++) {
      const a = -0.7 + (i / 5) * 1.4;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s, 0.22 * s, 10), hc);
      spike.position.set(Math.sin(a) * 0.07 * s, 0.14 * s, -0.04 * s);
      spike.rotation.x = -0.95;
      spike.rotation.z = a * 0.35;
      spike.scale.x = 0.4;
      headG.add(spike);
    }
  } else if (t === "namek" || t === "piccolo" || t === "nail" || t === "dende") {
    for (const side of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CapsuleGeometry(0.012 * s, 0.2 * s, 6, 10), hc);
      ant.position.set(side * 0.055 * s, 0.18 * s, 0.06 * s);
      ant.rotation.z = side * -0.28;
      ant.rotation.x = -0.35;
      headG.add(ant);
    }
    if (look.turban) {
      const cloth = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
      const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), cloth);
      wrap.position.y = 0.06 * s;
      wrap.rotation.x = -0.08;
      headG.add(wrap);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.155 * s, 0.028 * s, 10, 20), cloth);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.04 * s;
      headG.add(band);
    }
  } else if (t === "tien") {
    /* calvo, el 3er ojo va en la cara */
  } else if (t === "helm" || t === "recoome" || t === "cui" || t === "appule") {
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.175 * s, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hc
    );
    helm.position.y = 0.02 * s;
    helm.rotation.x = 0.12;
    headG.add(helm);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * s, 0.04 * s, 0.06 * s),
      new THREE.MeshLambertMaterial({ color: 0x263238 })
    );
    visor.position.set(0, 0.02 * s, 0.14 * s);
    headG.add(visor);
  } else if (t === "horns" || t === "frieza") {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.2 * s, 10), hc);
      horn.position.set(side * 0.11 * s, 0.11 * s, 0);
      horn.rotation.z = side * 0.55;
      headG.add(horn);
    }
    const gem = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * s, 14, 12),
      new THREE.MeshLambertMaterial({ color: look.accent ?? 0xab47bc, emissive: 0x4a148c })
    );
    gem.position.set(0, 0.02 * s, 0.15 * s);
    headG.add(gem);
  }
}

function addFace(headG, s, look) {
  const eyeM = new THREE.MeshLambertMaterial({ color: 0x212121 });
  const whiteM = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.032 * s, 12, 10), whiteM);
    w.position.set(side * 0.05 * s, 0.02 * s, 0.13 * s);
    w.scale.set(1, 0.85, 0.6);
    headG.add(w);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016 * s, 12, 10), eyeM);
    e.position.set(side * 0.05 * s, 0.02 * s, 0.155 * s);
    headG.add(e);
  }
  if (look.hair === "bald") {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.012 * s, 10, 8), eyeM);
      d.position.set(Math.cos(a) * 0.06 * s, 0.12 * s, Math.sin(a) * 0.04 * s);
      headG.add(d);
    }
  }
  if (look.thirdEye) {
    const w3 = new THREE.Mesh(new THREE.SphereGeometry(0.026 * s, 12, 10), whiteM);
    w3.position.set(0, 0.075 * s, 0.125 * s);
    w3.scale.set(0.85, 0.75, 0.55);
    headG.add(w3);
    const e3 = new THREE.Mesh(new THREE.SphereGeometry(0.013 * s, 12, 10), eyeM);
    e3.position.set(0, 0.075 * s, 0.148 * s);
    headG.add(e3);
  }
}

export function makeBody(altura, look) {
  const g = new THREE.Group();
  const s = altura;
  const kit = look.kit || "gi";
  const torsoC = new THREE.MeshLambertMaterial({ color: look.body });
  const skin = new THREE.MeshLambertMaterial({ color: look.skin });
  const limbC =
    kit === "namek"
      ? skin
      : new THREE.MeshLambertMaterial({
          color: new THREE.Color(look.body).multiplyScalar(0.78),
        });
  const accent = new THREE.MeshLambertMaterial({ color: look.accent ?? 0x1565c0 });
  const bootM = new THREE.MeshLambertMaterial({
    color: look.boots ?? (kit === "gi" ? look.accent ?? 0x0d47a1 : 0x212121),
  });
  const white = new THREE.MeshLambertMaterial({ color: 0xeeeeee });

  const waistY = 0.62 * s;
  const torsoG = new THREE.Group();
  torsoG.position.y = waistY;
  g.add(torsoG);

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 16, 14), torsoC);
  hips.position.y = waistY;
  hips.scale.set(1.18, 0.62, 0.88);
  hips.castShadow = true;
  g.add(hips);

  const brute = kit === "brute";
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.155 * s, 16, 14), torsoC);
  chest.position.y = 1.1 * s - waistY;
  chest.scale.set(brute ? 1.58 : 1.38, 0.88, 1.08);
  chest.castShadow = true;
  torsoG.add(chest);
  for (const side of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.SphereGeometry(0.072 * s, 12, 10), torsoC);
    pec.position.set(side * 0.072 * s, 1.07 * s - waistY, 0.1 * s);
    pec.scale.set(brute ? 1.35 : 1.18, 0.72, 0.9);
    pec.castShadow = true;
    torsoG.add(pec);
  }
  const abs = new THREE.Mesh(new THREE.CapsuleGeometry(0.105 * s, 0.14 * s, 8, 12), torsoC);
  abs.position.y = 0.86 * s - waistY;
  abs.scale.set(1.08, 1, 0.86);
  abs.castShadow = true;
  torsoG.add(abs);
  const waist = new THREE.Mesh(new THREE.SphereGeometry(0.115 * s, 14, 12), torsoC);
  waist.position.y = 0.74 * s - waistY;
  waist.scale.set(1.02, 0.5, 0.88);
  torsoG.add(waist);

  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.17 * s, 0.035 * s, 10, 20),
    kit === "namek" ? accent : kit === "armor" ? white : accent
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.72 * s - waistY;
  torsoG.add(belt);

  if (kit === "armor" || kit === "soldier") {
    const plate = new THREE.Mesh(
      new THREE.SphereGeometry(0.17 * s, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      white
    );
    plate.position.y = 1.02 * s - waistY;
    plate.rotation.x = 0.15;
    torsoG.add(plate);
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 14, 12), white);
      pad.position.set(side * 0.2 * s, 1.18 * s - waistY, 0);
      pad.scale.set(1.1, 0.7, 1);
      torsoG.add(pad);
    }
  }
  if (kit === "frost") {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.38 * s, 0.04 * s), accent);
    line.position.set(0, 0.98 * s - waistY, 0.16 * s);
    torsoG.add(line);
  }
  if (kit === "gi") {
    const undershirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * s, 0.13 * s, 0.18 * s, 14),
      new THREE.MeshLambertMaterial({ color: 0x5d4037 })
    );
    undershirt.position.y = 0.88 * s - waistY;
    torsoG.add(undershirt);
  }
  if (kit === "namek") {
    const capeM = new THREE.MeshLambertMaterial({
      color: look.cape ?? 0xfafafa,
      side: THREE.DoubleSide,
    });
    const cape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * s, 0.36 * s, 0.58 * s, 18, 2, true, Math.PI * 0.28, Math.PI * 1.44),
      capeM
    );
    cape.position.set(0, 0.82 * s - waistY, -0.04 * s);
    cape.rotation.x = 0.08;
    torsoG.add(cape);
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.16 * s, 0.028 * s, 10, 18, Math.PI * 1.2),
      capeM
    );
    collar.rotation.x = 0.4;
    collar.position.set(0, 1.18 * s - waistY, -0.02 * s);
    torsoG.add(collar);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * s, 0.065 * s, 0.09 * s, 12), skin);
  neck.position.y = 1.24 * s - waistY;
  torsoG.add(neck);

  const headG = new THREE.Group();
  headG.position.y = 1.38 * s - waistY;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155 * s, 24, 20), skin);
  head.castShadow = true;
  headG.add(head);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 12, 10), skin);
    ear.position.set(side * 0.15 * s, 0, 0);
    ear.scale.set(0.55, 1, 0.8);
    headG.add(ear);
  }
  addFace(headG, s, look);
  addHeadGear(headG, s, look);
  torsoG.add(headG);

  const armX = { hand: skin, band: kit === "gi" ? accent : null };
  const legX = { boot: bootM };
  const armL = makeArm(0.068 * s, 0.26 * s, 0.24 * s, limbC, -0.22 * s, 1.16 * s - waistY, armX);
  const armR = makeArm(0.068 * s, 0.26 * s, 0.24 * s, limbC, 0.22 * s, 1.16 * s - waistY, armX);
  torsoG.add(armL, armR);
  const thigh = 0.3 * s;
  const shin = 0.3 * s;
  const legL = makeLeg(0.082 * s, thigh, shin, limbC, -0.09 * s, 0.6 * s, legX);
  const legR = makeLeg(0.082 * s, thigh, shin, limbC, 0.09 * s, 0.6 * s, legX);
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
  return g;
}
