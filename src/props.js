import * as THREE from "three";

/**
 * Accesorios únicos por personaje: look.props = ["swordBack", ...].
 * Torso: origen en la cintura, +Z frente, −X = izquierda del personaje.
 */
export function addCharProps(g, ctx) {
  const list = ctx.look.props || [];
  if (!list.length && ctx.sashHex == null) return;
  g.updateMatrixWorld(true);
  ctx.g = g;
  ctx.probe = torsoProbe(ctx);
  ctx.Y = (y) => y * ctx.s - ctx.waistY + ctx.ty;
  if (ctx.sashHex != null) addObi(ctx);
  for (const id of list) PROPS[id]?.(ctx);
}

/** Fajín de tela (gi / namek): banda ceñida, nudo al frente y dos colas sobre los muslos. */
function addObi(ctx) {
  const { s, sc } = ctx;
  const t = ctx.limbs.torsoG;
  const y = (sc.sashY || 0) * s;
  const h = 0.07 * s;
  const off = 0.01 * s;
  const m = cloth(ctx, ctx.sashHex, { roughness: 0.82, side: THREE.DoubleSide });
  t.add(tag(new THREE.Mesh(bandGeo(ctx, y, h, off, 64), m), "obi"));
  for (const dy of [h / 2, -h / 2]) {
    const pts = ringPts(ctx, y + dy, off, 48);
    t.add(tag(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.006 * s, 6, true), m), "obi_edge"));
  }
  const kx = 0.03 * s;
  const kr = ctx.probe(y, kx / (0.16 * s), 0.16 * s) + off;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.034 * s, 14, 10), m);
  knot.scale.set(1.45, 1.0, 0.5);
  knot.position.set(kx, y, kr + 0.006 * s);
  t.add(tag(knot, "obi_knot"));
  if ((sc.showSashTail ?? 1) < 0.5) return;
  for (const [dx, len, sway] of [[-0.014, 0.3, -0.03], [0.02, 0.26, 0.04]]) {
    const L = len * s;
    const z0 = kr + 0.004 * s;
    const geo = new THREE.BoxGeometry(1, 1, 1, 2, 12, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = 0.5 - p.getY(i);
      const w = (0.042 + 0.024 * v) * s;
      const x = kx + dx * s + p.getX(i) * w + sway * s * v * v;
      const yy = y - 0.01 * s - v * L;
      const z = z0 - v * 0.035 * s + Math.sin(v * Math.PI) * 0.01 * s + p.getZ(i) * 0.008 * s;
      p.setXYZ(i, x, yy, z);
    }
    geo.computeVertexNormals();
    t.add(tag(new THREE.Mesh(geo, m), "obi_tail"));
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Radio del torso (desde el eje) a la altura local y, en el ángulo a (0 = frente, π/2 = derecha). */
function torsoProbe(ctx) {
  const t = ctx.limbs.torsoG;
  const hips = ctx.limbs.hips;
  const meshes = [...t.children, ...(hips?.isMesh ? [hips] : []), ...(hips?.children || [])].filter(
    (o) => o.isMesh && !/cape|hip_flap|tail|prop_/.test(o.userData.moldId || "")
  );
  const ray = new THREE.Raycaster();
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  return (y, a, fallback) => {
    const dir = V(Math.sin(a), 0, Math.cos(a));
    o.copy(dir).multiplyScalar(2 * ctx.s).setY(y);
    t.localToWorld(o);
    d.copy(dir).negate().transformDirection(t.matrixWorld);
    ray.set(o, d);
    ray.far = 4 * ctx.s;
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return fallback;
    const p = t.worldToLocal(hit.point.clone());
    return Math.hypot(p.x, p.z);
  };
}

function tag(m, id) {
  m.userData.moldId = `prop_${id}`;
  m.userData.moldFamily = "cloth";
  m.castShadow = true;
  return m;
}

function ringPts(ctx, y, off, n = 40, dy = null, fb = 0.16) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = ctx.probe(y + (dy ? dy(a) : 0), a, fb * ctx.s) + off;
    pts.push(V(Math.sin(a) * r, y + (dy ? dy(a) : 0), Math.cos(a) * r));
  }
  return pts;
}

/** Banda plana alrededor del torso (cinturón ancho). */
function bandGeo(ctx, y, h, off, n = 48) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = Math.max(ctx.probe(y + h * 0.5, a, 0.16 * ctx.s), ctx.probe(y - h * 0.5, a, 0.16 * ctx.s)) + off;
    pos.push(Math.sin(a) * r, y + h / 2, Math.cos(a) * r, Math.sin(a) * r, y - h / 2, Math.cos(a) * r);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Cáscara abierta adelante (chaleco / campera) entre y0 (abajo) e y1 (arriba). */
function shellGeo(ctx, y0, y1, gap, off, nA = 30, nY = 12) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= nY; j++) {
    const y = y1 + ((y0 - y1) * j) / nY;
    for (let i = 0; i <= nA; i++) {
      const a = gap + ((Math.PI * 2 - 2 * gap) * i) / nA;
      const r = ctx.probe(y, a, 0.16 * ctx.s) + off;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      uv.push(i / nA, 1 - j / nY);
    }
  }
  const W = nA + 1;
  for (let j = 0; j < nY; j++)
    for (let i = 0; i < nA; i++) {
      const a = j * W + i;
      idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Tubo afinado (r0 en la base → r1 en la punta). */
function taperTube(curve, r0, r1, seg = 32, rad = 10) {
  const geo = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const p = geo.attributes.position;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * u;
    for (let k = 0; k <= rad; k++) {
      const n = i * (rad + 1) + k;
      v.fromBufferAttribute(p, n).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(n, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function decalMat(draw, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.05, polygonOffset: true, polygonOffsetFactor: -4 });
}

/** Parche pegado al frente/espalda del torso a la altura y (ang 0 frente, π espalda). */
function chestDecal(ctx, mat, y, w, ang = 0, x = 0) {
  const r = ctx.probe(y, ang, 0.16 * ctx.s);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), mat);
  m.position.set(Math.sin(ang) * r + x, y, Math.cos(ang) * (r + 0.004 * ctx.s));
  m.rotation.y = ang;
  return m;
}

/** Sin bump: en piezas finas el bumpMap del gearMat las vuelve negras. */
function cloth(ctx, hex, opts = {}) {
  return ctx.surf(hex, { roughness: opts.roughness ?? 0.75, side: opts.side });
}
function metal(ctx, hex) {
  return ctx.surf(hex, { roughness: 0.3, metalness: 0.9 });
}

/** [id sculpt, etiqueta, id de look.props, ¿giro?] */
export const PROP_FIT = [
  ["propSword", "Espada", "swordBack", true],
  ["propKatana", "Katana", "katanaWaist", true],
  ["propBags", "Bolsas", "bagsBelt", false],
  ["propWrap", "Cola cintura", "tailWaist", false],
  ["propSpauld", "Hombreras capa", "capePads", false],
  ["propBrooch", "Broche capa", "capeBrooch", false],
  ["propStaff", "Báculo", "kamiStaff", true],
  ["propKami", "Símbolo Kami", "kamiSymbol", false],
  ["propCap", "Gorro", "chineseCap", false],
  ["propChamp", "Cinturón campeón", "champBelt", false],
  ["propGoatee", "Barba", "goatee", false],
  ["propFur", "Cuello piel", "furCollar", false],
  ["propBraid", "Trenza", "braid", false],
  ["propCrest", "Cresta", "headCrest", false],
  ["propCrown", "Corona Cell", "cellCrown", false],
  ["propLiz", "Cola Freezer", "lizardTail", false],
  ["propCellT", "Cola Cell", "cellTail", false],
  ["propWing", "Alas", "cellWings", true],
  ["propPack", "Mochila", "backpack", false],
  ["propScarf", "Pañuelo", "scarf", false],
  ["propHolster", "Funda", "holster", false],
  ["propVest", "Chaleco", "vest", false],
  ["propPearl", "Perlas", "pearls", false],
  ["propJacket", "Campera", "jacket", false],
  ["propSleeve", "Manga vacía", "emptySleeveL", false],
  ["propSpike", "Púas brazos", "armSpikes", false],
  ["propEarring", "Aros", "earrings", false],
  ["propNamek", "Tramos violetas", "namekPatches", false],
  ["propCellPlates", "Exoesqueleto", "cellPlates", false],
];

function nudge(group, ctx, id) {
  const { s, sc } = ctx;
  group.position.x += (sc[id + "X"] || 0) * s;
  group.position.y += (sc[id + "Y"] || 0) * s;
  group.position.z += (sc[id + "Z"] || 0) * s;
  return group;
}

/** Mueve el grupo y agranda sus piezas alrededor de su centro. */
function fit(group, ctx, id) {
  const k = ctx.sc[id + "S"] ?? 1;
  if (k !== 1 && group.children.length) {
    const c = new THREE.Vector3();
    for (const ch of group.children) c.add(ch.position);
    c.multiplyScalar(1 / group.children.length);
    for (const ch of group.children) {
      ch.position.sub(c).multiplyScalar(k).add(c);
      ch.scale.multiplyScalar(k);
    }
  }
  return nudge(group, ctx, id);
}

function headR(ctx) {
  return (ctx.sc.headR || 0.16) * ctx.s;
}

/** Caja real de la malla "head" en coords de headG. */
function headBox(ctx) {
  const hg = ctx.limbs.headG;
  const head = hg.children.find((o) => o.userData.moldId === "head");
  const box = new THREE.Box3();
  if (!head) {
    const R = headR(ctx);
    return box.set(V(-R, -R, -R), V(R, R, R));
  }
  head.geometry.computeBoundingBox();
  head.updateMatrix();
  return box.copy(head.geometry.boundingBox).applyMatrix4(head.matrix);
}

const PROPS = {
  /** Espada con vaina a la espalda + bandolera (Trunks). */
  swordBack(ctx) {
    const { s } = ctx;
    const t = ctx.limbs.torsoG;
    const y = ctx.Y(0.98);
    const back = ctx.probe(y, Math.PI, 0.13 * s);
    const sw = new THREE.Group();
    const sheathM = metal(ctx, 0x3e2723);
    const sheath = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.62 * s, 0.022 * s), sheathM);
    sheath.position.y = -0.1 * s;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.022 * s, 0.035 * s), metal(ctx, 0xc9a227));
    guard.position.y = 0.22 * s;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013 * s, 0.013 * s, 0.13 * s, 8), cloth(ctx, 0x4e342e));
    grip.position.y = 0.3 * s;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 10, 8), metal(ctx, 0xc9a227));
    pommel.position.y = 0.37 * s;
    for (const [m, id] of [[sheath, "sheath"], [guard, "guard"], [grip, "grip"], [pommel, "pommel"]]) sw.add(tag(m, `sword_${id}`));
    sw.position.set(-0.02 * s, y, -back - 0.045 * s);
    sw.rotation.z = 0.55 + (ctx.sc.propSwordR || 0);
    t.add(fit(sw, ctx, "propSword"));
    // bandolera: hombro derecho → cadera izquierda
    const pts = ringPts(ctx, ctx.Y(0.86), 0.012 * s, 40, (a) => -Math.sin(a) * 0.15 * s);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.009 * s, 6, true), cloth(ctx, 0x5d4037));
    strap.scale.set(1, 1, 1);
    t.add(tag(strap, "sword_strap"));
  },

  /** Katana a la cintura, lado izquierdo (Yajirobee). */
  katanaWaist(ctx) {
    const { s } = ctx;
    const t = ctx.limbs.torsoG;
    const r = ctx.probe(0, -Math.PI / 2, 0.16 * s);
    const k = new THREE.Group();
    const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * s, 0.014 * s, 0.6 * s, 8), metal(ctx, 0x212121));
    sheath.scale.z = 0.55;
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.01 * s, 14), metal(ctx, 0xc9a227));
    guard.position.y = 0.3 * s;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * s, 0.014 * s, 0.15 * s, 8), cloth(ctx, 0xeeeeee));
    grip.position.y = 0.38 * s;
    for (const [m, id] of [[sheath, "sheath"], [guard, "guard"], [grip, "grip"]]) k.add(tag(m, `katana_${id}`));
    k.position.set(-r - 0.03 * s, -0.02 * s, -0.02 * s);
    k.rotation.x = 1.05 + (ctx.sc.propKatanaR || 0);
    k.rotation.z = 0.12;
    t.add(fit(k, ctx, "propKatana"));
  },

  /** Bolsas colgando del cinturón (Yajirobee). */
  bagsBelt(ctx) {
    const { s } = ctx;
    const m = cloth(ctx, 0xd7c49e);
    const g = new THREE.Group();
    [Math.PI * 0.62, Math.PI * 0.95, -Math.PI * 0.72].forEach((a, i) => {
      const r = Math.max(ctx.probe(-0.02 * s, a, 0.16 * s), ctx.probe(-0.08 * s, a, 0.16 * s)) + 0.075 * s;
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 12, 10), m);
      bag.scale.set(1, 1.25, 0.8);
      bag.rotation.y = a;
      bag.position.set(Math.sin(a) * r, -0.05 * s, Math.cos(a) * r);
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.02 * s, 0.04 * s, 8), m);
      tie.position.set(Math.sin(a) * (r - 0.02 * s), 0.005 * s, Math.cos(a) * (r - 0.02 * s));
      g.add(tag(bag, `bag_${i}`), tag(tie, `bag_tie_${i}`));
    });
    ctx.limbs.torsoG.add(fit(g, ctx, "propBags"));
  },

  /** Cola saiyajin enrollada en la cintura (sobre el cinturón). */
  tailWaist(ctx) {
    const { s, sc, look } = ctx;
    const th = 0.026 * s * (sc.tailThick ?? 1);
    const y = 0.72 * s - ctx.waistY + ctx.ty + (sc.beltY || 0) * s + th * 0.9;
    const pts = ringPts(ctx, y, th * 0.9, 36, (a) => Math.sin(a * 0.5) * th * 0.6);
    const fur = cloth(ctx, look.tailC ?? 0x6d4c41, { roughness: 0.9 });
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 72, th, 10, true), fur);
    const g = new THREE.Group();
    g.add(tag(tail, "tail_wrap"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propWrap"));
  },

  /** Hombreras rígidas de la capa (Pikoro, Kami). */
  capePads(ctx) {
    const { s, sc } = ctx;
    const m = ctx.capeM;
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.085 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
      pad.scale.set(1.3, 0.6, 1.15);
      pad.position.set(side * (sc.shoulderX + (sc.armX || 0)) * s * 0.95, sc.shoulderY * s - ctx.waistY + (sc.armY || 0) * s + 0.035 * s, -0.01 * s);
      pad.rotation.z = -side * 0.25;
      g.add(tag(pad, `cape_pad_${side > 0 ? "R" : "L"}`));
    }
    ctx.limbs.torsoG.add(fit(g, ctx, "propSpauld"));
  },

  /** Broches dorados de la capa real (Rey Vegeta). */
  capeBrooch(ctx) {
    const { s } = ctx;
    const y = ctx.Y(1.12);
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const r = ctx.probe(y, side * 0.55, 0.15 * s);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.012 * s, 16), metal(ctx, 0xffc107));
      b.rotation.x = Math.PI / 2;
      b.rotation.z = 0;
      b.position.set(Math.sin(side * 0.55) * (r + 0.006 * s), y, Math.cos(side * 0.55) * (r + 0.006 * s));
      b.lookAt(b.position.clone().multiplyScalar(2).setY(y));
      b.rotateX(Math.PI / 2);
      g.add(tag(b, `brooch_${side > 0 ? "R" : "L"}`));
    }
    ctx.limbs.torsoG.add(fit(g, ctx, "propBrooch"));
  },

  /** Báculo en la mano derecha (Kami). */
  kamiStaff(ctx) {
    const { s } = ctx;
    const st = new THREE.Group();
    const wood = cloth(ctx, 0x6d4c41, { roughness: 0.85 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.014 * s, 1.25 * s, 8), wood);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 12, 10), wood);
    knob.position.y = 0.64 * s;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018 * s, 0.006 * s, 6, 14), metal(ctx, 0xffc107));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.58 * s;
    st.add(tag(pole, "staff_pole"), tag(knob, "staff_knob"), tag(ring, "staff_ring"));
    // paralelo al antebrazo, delante del puño: con el brazo colgando queda vertical
    st.position.set(0, -0.07 * s, 0.045 * s);
    st.rotation.x = ctx.sc.propStaffR || 0;
    ctx.limbs.wristR.add(fit(st, ctx, "propStaff"));
    ctx.g.userData.fistR = 1;
  },

  /** Kanji 神 en el pecho (Kami). */
  kamiSymbol(ctx) {
    const mat = decalMat((g, n) => {
      g.fillStyle = "#fafafa";
      g.beginPath();
      g.arc(n / 2, n / 2, n * 0.46, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = n * 0.04;
      g.strokeStyle = "#111";
      g.stroke();
      g.fillStyle = "#111";
      g.font = `bold ${n * 0.62}px serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("神", n / 2, n / 2 + n * 0.03);
    });
    const g = new THREE.Group();
    g.add(tag(chestDecal(ctx, mat, ctx.Y(1.0), 0.13 * ctx.s), "kami_symbol"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propKami"));
  },

  /** Gorro chino con pompón (Chaoz). */
  chineseCap(ctx) {
    const { s, look } = ctx;
    const b = headBox(ctx);
    const c = b.getCenter(V(0, 0, 0));
    const hx = (b.max.x - b.min.x) / 2;
    const hz = (b.max.z - b.min.z) / 2;
    const R = Math.max(hx, hz);
    const y0 = c.y + (b.max.y - c.y) * 0.3;
    const hg = ctx.limbs.headG;
    const capM = cloth(ctx, look.capC ?? 0xc62828);
    const g = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), capM);
    cap.scale.set(hx * 1.06, (b.max.y - y0) * 1.08, hz * 1.06);
    cap.position.set(c.x, y0, c.z);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 28), cloth(ctx, look.capBandC ?? 0xfbc02d));
    band.rotation.x = Math.PI / 2;
    band.scale.set(hx * 1.06, hz * 1.06, R);
    band.position.set(c.x, y0, c.z);
    g.add(tag(cap, "cap"), tag(band, "cap_band"));
    if (!hg.children.some((o) => o.userData.moldId === "gem")) {
      const pom = new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 12, 10), capM);
      pom.position.set(c.x, b.max.y + R * 0.1, c.z);
      g.add(tag(pom, "cap_pom"));
    }
    hg.add(fit(g, ctx, "propCap"));
  },

  /** Cinturón de campeón con hebilla dorada (Mr. Satan). */
  champBelt(ctx) {
    const { s } = ctx;
    const y = 0.005 * s;
    const belt = new THREE.Mesh(bandGeo(ctx, y, 0.075 * s, 0.022 * s), cloth(ctx, 0x111111, { side: THREE.DoubleSide }));
    const r = ctx.probe(y, 0, 0.16 * s) + 0.03 * s;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15 * s, 0.11 * s, 0.018 * s), metal(ctx, 0xffc107));
    plate.position.set(0, y, r);
    const gem = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.012 * s, 16), metal(ctx, 0xd32f2f));
    gem.rotation.x = Math.PI / 2;
    gem.position.set(0, y, r + 0.012 * s);
    const g = new THREE.Group();
    g.add(tag(belt, "champ_belt"), tag(plate, "champ_buckle"), tag(gem, "champ_gem"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propChamp"));
  },

  /** Barba de chivo (Rey Vegeta). */
  goatee(ctx) {
    const R = headR(ctx);
    const m = cloth(ctx, ctx.look.hairC ?? 0x2a1b0e, { roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.ConeGeometry(R * 0.2, R * 0.55, 10), m);
    b.rotation.x = Math.PI - 0.35;
    b.position.set(0, -R * 0.98, R * 0.62);
    const g = new THREE.Group();
    g.add(tag(b, "goatee"));
    ctx.limbs.headG.add(fit(g, ctx, "propGoatee"));
  },

  /** Cuello alto de piel en la capa (Paragus). */
  furCollar(ctx) {
    const { s, sc } = ctx;
    const neck = ctx.limbs.neck;
    const y = neck.position.y - sc.neckLen * s * 0.4;
    const m = cloth(ctx, ctx.look.furC ?? 0xf5f5f5, { roughness: 0.95 });
    const g = new THREE.Group();
    const n = 20;
    const rr = sc.neckR * s * 2.4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.cos(a) > 0.45) continue;
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 10, 8), m);
      tuft.scale.set(0.9, 1.5, 0.85);
      tuft.rotation.set(Math.cos(a) * -0.3, 0, Math.sin(a) * 0.3);
      tuft.position.set(Math.sin(a) * rr, y + 0.03 * s + (Math.cos(a) < 0 ? 0.035 * s : 0), Math.cos(a) * rr);
      g.add(tag(tuft, `fur_${i}`));
    }
    ctx.limbs.torsoG.add(fit(g, ctx, "propFur"));
  },

  /** Trenza larga con aro + aros en las orejas (Zaabon). */
  braid(ctx) {
    const { s, look } = ctx;
    const R = headR(ctx);
    const hg = ctx.limbs.headG;
    const m = cloth(ctx, new THREE.Color(look.hairC ?? 0x2e7d32).multiplyScalar(0.7).getHex(), { roughness: 0.6 });
    const g = new THREE.Group();
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s * (1 - u * 0.35), 10, 8), m);
      k.scale.set(1.15, 1.35, 0.8);
      k.position.set((i % 2 ? 1 : -1) * 0.008 * s, -R * 0.15 - u * 0.5 * s, -R * 0.95 - u * 0.06 * s);
      k.rotation.z = (i % 2 ? 1 : -1) * 0.35;
      g.add(tag(k, `braid_${i}`));
    }
    const gold = metal(ctx, look.goldC ?? 0xffc107);
    const tip = new THREE.Mesh(new THREE.TorusGeometry(0.022 * s, 0.007 * s, 8, 16), gold);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, -R * 0.15 - 0.52 * s, -R * 0.95 - 0.062 * s);
    g.add(tag(tip, "braid_ring"));
    hg.add(fit(g, ctx, "propBraid"));
    PROPS.earrings(ctx);
  },

  /** Aros dorados colgando del agujero del lóbulo (Zaabon, Nº17, Nº18). */
  earrings(ctx) {
    const { s, sc, look } = ctx;
    const hg = ctx.limbs.headG;
    if (!hg || ctx.earringsDone) return;
    ctx.earringsDone = true;
    const gold = metal(ctx, look.goldC ?? 0xffc107);
    const pierced = sc.earType === "pierced";
    const rr = 0.016 * s;
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.004 * s, 6, 14), gold);
      ear.rotation.y = Math.PI / 2;
      if (pierced) ear.position.set(side * sc.earX * s, -0.92 * sc.earR * s * sc.earSy - rr + 0.004 * s, 0);
      else ear.position.set(side * headR(ctx) * (sc.headSx || 1) * 0.98, -headR(ctx) * 0.42, 0);
      g.add(tag(ear, `earring_${side > 0 ? "R" : "L"}`));
    }
    hg.add(nudge(g, ctx, "propEarring"));
  },

  /** Cresta sobre la cabeza (Butter / Cell). */
  headCrest(ctx) {
    const b = headBox(ctx);
    const ctr = b.getCenter(V(0, 0, 0));
    const hy = (b.max.y - b.min.y) / 2;
    const hz = (b.max.z - b.min.z) / 2;
    const m = ctx.look.crestC != null ? cloth(ctx, ctx.look.crestC) : ctx.skin;
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = -0.35 + i * 0.4;
      const c = new THREE.Mesh(new THREE.SphereGeometry(hy * 0.22, 10, 8), m);
      c.scale.set(0.4, 0.9, 1.2);
      c.rotation.x = a;
      c.position.set(ctr.x, ctr.y + Math.cos(a) * hy * 1.1, ctr.z - Math.sin(a) * hz * 1.1);
      g.add(tag(c, `crest_${i}`));
    }
    ctx.limbs.headG.add(fit(g, ctx, "propCrest"));
  },

  /** Corona de Cell: dos crestas grandes hacia atrás. */
  cellCrown(ctx) {
    const R = headR(ctx);
    const m = cloth(ctx, ctx.look.body ?? 0x33691e, { side: THREE.DoubleSide });
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(R * 0.38, R * 1.4, 10), m);
      c.scale.set(0.35, 1, 1);
      c.position.set(side * R * 0.42, R * 0.95, -R * 0.35);
      c.rotation.set(-0.75, 0, -side * 0.28);
      g.add(tag(c, `crown_${side > 0 ? "R" : "L"}`));
    }
    ctx.limbs.headG.add(fit(g, ctx, "propCrown"));
  },

  /** Cola larga de reptil (Freezer). */
  lizardTail(ctx) {
    const { s, sc } = ctx;
    const k = sc.propLizS ?? 1;
    const raw = [V(0, 0.55, -0.1), V(0, 0.4, -0.3), V(0.05, 0.15, -0.45), V(0.18, 0.03, -0.58), V(0.36, 0.03, -0.6), V(0.48, 0.08, -0.5)].map((p) => p.multiplyScalar(s));
    const o = raw[0];
    const c = new THREE.CatmullRomCurve3(raw.map((p) => o.clone().lerp(p, k)));
    const m = (ctx.look.tailC != null ? cloth(ctx, ctx.look.tailC) : ctx.skin);
    const g = new THREE.Group();
    g.add(tag(new THREE.Mesh(taperTube(c, 0.055 * s * k, 0.012 * s * k, 40, 12), m), "lizard_tail"));
    ctx.g.add(nudge(g, ctx, "propLiz"));
  },

  /** Cola con aguijón (Cell). */
  cellTail(ctx) {
    const { s, sc } = ctx;
    const k = sc.propCellTS ?? 1;
    const raw = [V(0, 0.55, -0.1), V(0, 0.38, -0.28), V(-0.04, 0.12, -0.36), V(-0.06, 0.02, -0.5)].map((p) => p.multiplyScalar(s));
    const o = raw[0];
    const c = new THREE.CatmullRomCurve3(raw.map((p) => o.clone().lerp(p, k)));
    const m = cloth(ctx, ctx.look.body ?? 0x33691e, { side: THREE.DoubleSide });
    const g = new THREE.Group();
    g.add(tag(new THREE.Mesh(taperTube(c, 0.045 * s * k, 0.03 * s * k, 30, 10), m), "cell_tail"));
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s * k, 0.14 * s * k, 10), metal(ctx, 0xffb300));
    const end = c.getPointAt(1);
    const dir = c.getTangentAt(1);
    sting.position.copy(end).addScaledVector(dir, 0.07 * s * k);
    sting.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
    g.add(tag(sting, "cell_sting"));
    ctx.g.add(nudge(g, ctx, "propCellT"));
  },

  /** Alas plegadas en la espalda (Cell). */
  cellWings(ctx) {
    const { s } = ctx;
    const y = ctx.Y(1.05);
    const back = ctx.probe(y, Math.PI, 0.13 * s);
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.quadraticCurveTo(0.2 * s, -0.08 * s, 0.11 * s, -0.46 * s);
    sh.quadraticCurveTo(0.03 * s, -0.3 * s, 0, 0);
    const m = cloth(ctx, ctx.look.wingC ?? 0x263238, { side: THREE.DoubleSide });
    const g = new THREE.Group();
    const spread = 0.12 + (ctx.sc.propWingR || 0);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ShapeGeometry(sh, 12), m);
      w.scale.x = side;
      w.position.set(side * 0.02 * s, y + 0.06 * s, -back - 0.015 * s);
      w.rotation.y = Math.PI + side * spread;
      g.add(tag(w, `wing_${side > 0 ? "R" : "L"}`));
    }
    ctx.limbs.torsoG.add(fit(g, ctx, "propWing"));
  },

  /** Cabeza bulbo con venas (Saibaman). */
  saibaHead(ctx) {
    const R = headR(ctx);
    const skin = ctx.skin;
    const C = V(0, R * 0.32, -R * 0.3);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, 20, 14), skin);
    dome.scale.set(1, 1.08, 1.1);
    dome.position.copy(C);
    ctx.limbs.headG.add(tag(dome, "saiba_dome"));
    const vm = cloth(ctx, new THREE.Color(ctx.look.skin).multiplyScalar(0.62).getHex(), { side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const ph = Math.PI - 1.5 + i * 0.5;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const th = 0.25 + k * 0.17;
        const w = ph + Math.sin(k * 1.7 + i) * 0.1;
        const d = V(Math.sin(th) * Math.sin(w), Math.cos(th) * 1.08, Math.sin(th) * Math.cos(w) * 1.1).multiplyScalar(R * 0.99);
        pts.push(d.add(C));
      }
      const v = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, R * 0.035, 6), vm);
      ctx.limbs.headG.add(tag(v, `saiba_vein_${i}`));
    }
  },

  /** Placa / mochila en la espalda (Nº16). */
  backpack(ctx) {
    const { s } = ctx;
    const y = ctx.Y(1.0);
    const back = ctx.probe(y, Math.PI, 0.13 * s);
    const m = metal(ctx, ctx.look.packC ?? 0x546e7a);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.26 * s, 0.07 * s), m);
    box.position.set(0, y, -back - 0.035 * s);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.05 * s, 0.02 * s), metal(ctx, 0x263238));
    vent.position.set(0, y + 0.07 * s, -back - 0.075 * s);
    const g = new THREE.Group();
    g.add(tag(box, "pack"), tag(vent, "pack_vent"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propPack"));
  },

  /** Pañuelo naranja al cuello (Nº17). */
  scarf(ctx) {
    const { s, sc } = ctx;
    const neck = ctx.limbs.neck;
    const y = neck.position.y - sc.neckLen * s * 0.25;
    const m = cloth(ctx, ctx.look.scarfC ?? 0xff6d00);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(sc.neckR * s * 1.35, sc.neckR * s * 0.45, 8, 20), m);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(sc.neckR * s * 0.38, 10, 8), m);
    knot.position.set(-sc.neckR * s * 0.4, y - 0.005 * s, sc.neckR * s * 1.45);
    const end = new THREE.Mesh(new THREE.ConeGeometry(0.022 * s, 0.07 * s, 4), m);
    end.rotation.x = Math.PI;
    end.scale.z = 0.3;
    end.position.set(-sc.neckR * s * 0.45, y - 0.045 * s, sc.neckR * s * 1.55);
    end.rotation.z = 0.2;
    const g = new THREE.Group();
    g.add(tag(ring, "scarf"), tag(knot, "scarf_knot"), tag(end, "scarf_end"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propScarf"));
  },

  /** Cinturón con funda en la cadera derecha (Nº17). */
  holster(ctx) {
    const { s } = ctx;
    const r = ctx.probe(-0.03 * s, Math.PI / 2, 0.16 * s);
    const m = cloth(ctx, 0x3e2723, { roughness: 0.6 });
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03 * s, 0.13 * s, 0.07 * s), m);
    h.position.set(r + 0.02 * s, -0.08 * s, 0.01 * s);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022 * s, 0.06 * s, 0.03 * s), metal(ctx, 0x212121));
    grip.position.set(r + 0.02 * s, -0.005 * s, -0.01 * s);
    grip.rotation.z = -0.2;
    const g = new THREE.Group();
    g.add(tag(h, "holster"), tag(grip, "holster_grip"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propHolster"));
  },

  /** Chaleco de jean abierto (Nº18). */
  vest(ctx) {
    const { s, sc } = ctx;
    const top = sc.shoulderY * s - ctx.waistY + (sc.armY || 0) * s - 0.01 * s;
    const m = cloth(ctx, ctx.look.vestC ?? 0x3f6fb5, { side: THREE.DoubleSide });
    const g = new THREE.Group();
    g.add(tag(new THREE.Mesh(shellGeo(ctx, 0.03 * s, top, 0.42, 0.012 * s), m), "vest"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propVest"));
  },

  /** Collar de perlas (Nº18). */
  pearls(ctx) {
    const { s, sc } = ctx;
    const neck = ctx.limbs.neck;
    const y = neck.position.y - sc.neckLen * s * 0.45;
    const m = metal(ctx, 0xfafafa);
    const g = new THREE.Group();
    const n = 22;
    const rr = sc.neckR * s * 1.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dip = Math.max(0, Math.cos(a)) * 0.05 * s;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.008 * s, 8, 6), m);
      p.position.set(Math.sin(a) * rr, y - dip, Math.cos(a) * rr * (1 + Math.max(0, Math.cos(a)) * 0.4));
      g.add(tag(p, `pearl_${i}`));
    }
    ctx.limbs.torsoG.add(fit(g, ctx, "propPearl"));
  },

  /** Campera corta con logo Capsule Corp (Trunks). */
  jacket(ctx) {
    const { s, sc } = ctx;
    const top = sc.shoulderY * s - ctx.waistY + (sc.armY || 0) * s - 0.005 * s;
    const m = cloth(ctx, ctx.look.jacketC ?? 0x4a6cb8, { side: THREE.DoubleSide });
    const g = new THREE.Group();
    g.add(tag(new THREE.Mesh(shellGeo(ctx, ctx.Y(0.82), top, 0.38, 0.016 * s), m), "jacket"));
    const logo = decalMat((g, n) => {
      g.fillStyle = "#c62828";
      g.font = `bold ${n * 0.42}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("CC", n / 2, n * 0.42);
      g.font = `bold ${n * 0.11}px sans-serif`;
      g.fillText("CAPSULE CORP.", n / 2, n * 0.72);
    });
    const y = ctx.Y(1.04);
    const ang = -0.75;
    const r = ctx.probe(y, ang, 0.15 * s) + 0.022 * s;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.13 * s, 0.13 * s), logo);
    d.position.set(Math.sin(ang) * r, y, Math.cos(ang) * r);
    d.rotation.y = ang;
    g.add(tag(d, "jacket_logo"));
    ctx.limbs.torsoG.add(fit(g, ctx, "propJacket"));
  },

  /** Segmentos del exoesqueleto abdominal y pectoral (Cell imperfecto). */
  cellPlates(ctx) {
    const { s, look } = ctx;
    const m = cloth(ctx, look.plateC ?? look.body ?? 0x33691e, { roughness: 0.45 });
    const g = new THREE.Group();
    const plate = (y0, y1, half, off, bulge, ac = 0, nA = 16, nY = 6) => {
      const pos = [], idx = [];
      for (let j = 0; j <= nY; j++) {
        const t = j / nY;
        const y = y0 + (y1 - y0) * t;
        for (let i = 0; i <= nA; i++) {
          const u = i / nA;
          const a = ac - half + 2 * half * u;
          const r = ctx.probe(y, a, 0.16 * s) + off + bulge * Math.sin(Math.PI * t) * Math.sin(Math.PI * u);
          pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
        }
      }
      const W = nA + 1;
      for (let j = 0; j < nY; j++)
        for (let i = 0; i < nA; i++) {
          const a = j * W + i;
          idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };
    const h = 0.058 * s;
    for (let i = 0; i < 4; i++) {
      const y0 = 0.05 * s + i * h;
      g.add(tag(new THREE.Mesh(plate(y0, y0 + h * 0.86, 0.62 - i * 0.03, 0.006 * s, 0.012 * s), m), `cell_ab_${i}`));
    }
    const cy = 0.05 * s + 4 * h + 0.01 * s;
    for (const side of [-1, 1]) {
      const pg = plate(cy, cy + 0.13 * s, 0.42, 0.007 * s, 0.016 * s, side * 0.48);
      g.add(tag(new THREE.Mesh(pg, m), `cell_pec_${side > 0 ? "R" : "L"}`));
    }
    ctx.limbs.torsoG.add(fit(g, ctx, "propCellPlates"));
  },

  /** Tramos violetas segmentados en hombro, antebrazo y pantorrilla (namekianos). */
  namekPatches(ctx) {
    const { look, sc } = ctx;
    const k = sc.propNamekS ?? 1;
    const bands = { uarm: [0.3, 0.85, 2], farm: [0.1, 0.6, 3], shin: [0.15, 0.6, 3] };
    const mat = ctx.skin.clone();
    mat.map = null;
    mat.color = new THREE.Color(look.muscleC ?? 0xb56aa8);
    mat.alphaTest = 0.5;
    const alpha = {};
    const alphaOf = (part) => {
      if (alpha[part]) return alpha[part];
      const [a, b, n] = bands[part];
      const c = document.createElement("canvas");
      c.width = 8; c.height = 128;
      const g = c.getContext("2d");
      g.fillStyle = "#000"; g.fillRect(0, 0, 8, 128);
      g.fillStyle = "#fff";
      const h = (b - a) * 128 / n;
      for (let i = 0; i < n; i++) g.fillRect(0, a * 128 + i * h, 8, h * 0.88);
      const t = new THREE.CanvasTexture(c);
      t.flipY = false;
      return (alpha[part] = t);
    };
    const hits = [];
    ctx.g.traverse((o) => {
      const m = o.isMesh && /^skin_(uarm|farm|shin)_/.exec(o.userData.moldId || "");
      if (m && o.visible) hits.push([o, m[1]]);
    });
    for (const [o, part] of hits) {
      const pm = mat.clone();
      pm.alphaMap = alphaOf(part);
      const ov = new THREE.Mesh(o.geometry, pm);
      ov.position.copy(o.position);
      ov.quaternion.copy(o.quaternion);
      ov.scale.copy(o.scale).multiply(V(1.025 * k, 1, 1.025 * k));
      o.parent.add(tag(ov, `namek_patch_${o.userData.moldId.slice(5)}`));
    }
  },

  /** Púas en la cara externa de brazos y antebrazos (Dodoria). */
  armSpikes(ctx) {
    const k = ctx.sc.propSpikeS ?? 1;
    const up = V(0, 1, 0);
    for (const [grp, re, rows] of [
      ["arm", /^skin_uarm/, [[0.3, -0.25], [0.55, 0.3]]],
      ["elbow", /^skin_farm/, [[0.25, 0.1], [0.5, -0.3], [0.5, 0.45]]],
    ]) {
      for (const side of ["L", "R"]) {
        const g = ctx.limbs[grp + side];
        const skin = g?.children.find((o) => o.isMesh && re.test(o.userData.moldId || ""));
        if (!skin) continue;
        g.updateMatrixWorld(true);
        const out = Math.sign(g.getWorldPosition(V(0, 0, 0)).x) || 1;
        skin.geometry.computeBoundingBox();
        const bb = skin.geometry.boundingBox.clone().applyMatrix4(skin.matrix);
        const r = (bb.max.x - bb.min.x) / 2;
        const top = bb.max.y;
        const len = bb.max.y - bb.min.y;
        const sg = new THREE.Group();
        for (const [v, ang] of rows) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4 * k, r * 1.5 * k, 10), ctx.skin);
          const dir = V(out * Math.cos(ang), 0.35, -Math.sin(ang)).normalize();
          sp.quaternion.setFromUnitVectors(up, dir);
          const cx = (bb.max.x + bb.min.x) / 2;
          const cz = (bb.max.z + bb.min.z) / 2;
          sp.position.set(cx + out * Math.cos(ang) * r * 0.92, top - v * len, cz - Math.sin(ang) * r * 0.92).addScaledVector(dir, r * 0.6 * k);
          sg.add(tag(sp, `spike_${grp}_${side}`));
        }
        g.add(nudge(sg, ctx, "propSpike"));
      }
    }
  },

  /** Brazo izquierdo perdido: manga vacía anudada (Gohan del futuro). */
  emptySleeveL(ctx) {
    const { s, sc } = ctx;
    const el = ctx.limbs.elbowL;
    el.visible = false;
    const arm = ctx.limbs.armL;
    arm.traverse((o) => {
      if (o.isMesh && /^skin_uarm/.test(o.userData.moldId || "")) o.visible = false;
    });
    const m = ctx.sleeveM;
    const r = sc.upperArmR * s * 1.2;
    const top = -0.08 * s;
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.75, 0.24 * s, 10, 1, true), m);
    sl.material = m.clone();
    sl.material.side = THREE.DoubleSide;
    sl.scale.z = 0.35;
    sl.position.y = top - 0.12 * s;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 10, 8), m);
    knot.scale.set(1, 0.8, 0.5);
    knot.position.y = top - 0.25 * s;
    const g = new THREE.Group();
    g.add(tag(sl, "empty_sleeve"), tag(knot, "empty_sleeve_knot"));
    arm.add(fit(g, ctx, "propSleeve"));
  },
};
