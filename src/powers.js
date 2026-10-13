import * as THREE from "three";

// TIPOS de poder (kind). Definen forma y counters.
//   beam  rayo        ball  bola de ki    disk   disco cortante
//   fire  fuego       light luz           drill  taladro espiral (makankosappo)
//   magic magia       cold  hielo         spike  estrellas puntiagudas
// Los que viajan alineados con la dirección del disparo (orientados como rayo):
export const ALIGNED = new Set(["beam", "light", "drill", "cold"]);

// COUNTERS: multiplicador de daño de un kind ATACANTE contra el kind del personaje golpeado
// (y contra el kind del proyectil rival en un choque). Falta = 1 (sin cambios).
// >1 fuerte, <1 débil. Se aplica sobre el daño normal (ataque/ki/defensa siguen igual).
export const COUNTER = {
  fire:  { cold: 1.3, ball: 1.2, beam: 0.8, spike: 0.7 },
  cold:  { drill: 1.2, beam: 1.3, spike: 1.3, light: 0.7 },
  drill: { beam: 1.25, disk: 1.25, cold: 0.8, ball: 0.8 },
  beam:  { spike: 1.2, magic: 1.2, ball: 1.2, drill: 0.8, fire: 0.8, disk: 0.8 },
  spike: { disk: 1.25, light: 1.25, beam: 0.8, cold: 0.8 },
  disk:  { light: 1.2, ball: 1.2, spike: 1.3, drill: 0.7 },
  magic: { light: 1.2, fire: 1.2, cold: 1.2, beam: 0.7 },
  light: { ball: 1.2, cold: 1.3, magic: 0.7, spike: 0.7 },
  ball:  { fire: 1.3, disk: 1.2, drill: 1.2, disk: 0.8, spike: 0.7 },
};

export function counterMult(atkKind, defKind) {
  return COUNTER[atkKind]?.[defKind] ?? 1;
}

// Segundos que vive cualquier disparo común (igual para todos). Largo/especial lo multiplican en combat.js.
export const POWER_LIFE = 2.5;

// Velocidad de CADA poder (ki común, u/s). Largo y especial = este speed × combat.js blast().
// K/D NO cambia este speed. Un kill sube s.velocidad (moverse) y s.kiMax/ataque (daño de ki), no el vuelo del rayo.
const STYLES = {
  Gokú: { kind: "beam", color: 0xdcebbe, speed: 80, r: 0.2, range: 120 },
  Gohan: { kind: "ball", color: 0x81d4fa, speed: 75, r: 0.18, range: 100 },
  Krilin: { kind: "disk", color: 0xffee58, speed: 65, r: 1, range: 100 },
  Pikoro: { kind: "drill", color: 0x69f0ae, speed: 70, r: 0.1, range: 120 },
  Vegeta: { kind: "beam", color: 0xce93d8, speed: 75, r: 0.18, range: 120 },
  Nail: { kind: "drill", color: 0xa5d6a7, speed: 65, r: 0.28, range: 100 },
  Dendé: { kind: "ball", color: 0xc5e1a5, speed: 60, r: 0.2, range: 95 },
  Freezer: { kind: "disk", color: 0xc045ed, speed: 80, r: 0.08, range: 120 },
  Zaabon: { kind: "light", color: 0x0dd6ab, speed: 75, r: 0.25, range: 100 },
  Dodoria: { kind: "spike", color: 0x380e9c, speed: 75, r: 0.42, range: 100 },
  Gurdo: { kind: "magic", color: 0x34a868, speed: 65, r: 0.35, range: 90 },
  Rikum: { kind: "ball", color: 0xff5252, speed: 70, r: 0.3, range: 100 },
  Yiz: { kind: "fire", color: 0xf55a42, speed: 70, r: 0.14, range: 100 },
  Butter: { kind: "cold", color: 0xdce775, speed: 77, r: 0.26, range: 100 },
  Ginyu: { kind: "beam", color: 0xea80fc, speed: 75, r: 0.32, range: 110 },
  Kiwy: { kind: "cold", color: 0xb3e5fc, speed: 65, r: 0.24, range: 100 },
  Appule: { kind: "ball", color: 0xce93d8, speed: 55, r: 0.22, range: 95 },
  "Ten Shin Han": { kind: "cold", color: 0xffee58, speed: 70, r: 0.16, range: 90 },
  Yamcha: { kind: "ball", color: 0xffcc80, speed: 65, r: 0.24, range: 100 },
  Chaoz: { kind: "magic", color: 0xeeeeee, speed: 60, r: 0.18, range: 90 },
  Yajirobee: { kind: "ball", color: 0xff8a65, speed: 60, r: 0.32, range: 85 },
  Kami: { kind: "magic", color: 0xa5d6a7, speed: 60, r: 0.12, range: 90 },
  Nappa: { kind: "ball", color: 0xffab40, speed: 75, r: 0.4, range: 100 },
  Raditz: { kind: "fire", color: 0x81c784, speed: 70, r: 0.16, range: 100 },
  Saibaman: { kind: "ball", color: 0x9ccc65, speed: 55, r: 0.2, range: 80 },
  Trunks: { kind: "light", color: 0xce93d8, speed: 75, r: 0.16, range: 110 },
  "Gohan del futuro": { kind: "fire", color: 0x81d4fa, speed: 75, r: 0.18, range: 110 },
  Bardock: { kind: "light", color: 0xff8a65, speed: 70, r: 0.16, range: 100 },
  "Rey Vegeta": { kind: "beam", color: 0xce93d8, speed: 72, r: 0.18, range: 115 },
  Tooma: { kind: "disk", color: 0xef5350, speed: 68, r: 0.26, range: 90 },
  Paragus: { kind: "ball", color: 0xb0bec5, speed: 60, r: 0.24, range: 100 },
  "Mr. Satan": { kind: "ball", color: 0xef5350, speed: 55, r: 0.28, range: 85 },
  Cell: { kind: "beam", color: 0x69f0ae, speed: 80, r: 0.14, range: 130 },
  "Nº16": { kind: "ball", color: 0x90a4ae, speed: 75, r: 0.38, range: 120 },
  "Nº17": { kind: "fire", color: 0x81d4fa, speed: 70, r: 0.12, range: 100 },
  "Nº18": { kind: "light", color: 0xf8bbd0, speed: 70, r: 0.12, range: 100 },
  "Nº19": { kind: "spike", color: 0xef9a9a, speed: 60, r: 0.3, range: 80 },
  "Dr. Gero": { kind: "ball", color: 0xb0bec5, speed: 60, r: 0.22, range: 90 },
};

export function powerStyle(nombre, faccion) {
  // Fallback si el nombre no está en STYLES. speed acá también es u/s base.
  if (STYLES[nombre]) return { ...STYLES[nombre] };
  if (nombre.startsWith("Saibaman")) return { ...STYLES.Saibaman };
  if (nombre.startsWith("Cell Jr.")) return { kind: "drill", color: 0xa5d6a7, speed: 50, r: 0.4, range: 80 };
  if (faccion === "z") return { kind: "ball", color: 0x81c784, speed: 50, r: 0.5, range: 80 };
  return { kind: "ball", color: 0x90caf9, speed: 50, r: 0.5, range: 80 };
}

let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.28, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

/** sprite con glow. */
function spr(color, opacity = 0.55) {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}

/** material sólido legible (+ leve glow). */
function mat(color, opacity = 0.92) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 0.98,
    opacity,
    depthWrite: opacity > 0.85,
  });
}

function matAdd(color, opacity = 0.45) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/** crea un efecto de poder (forma clara; glow corto). */
export function makePowerMesh(style, superOn, rank = 0) {
  const s = superOn ? 3.4 + rank * 1.15 : 1;
  const c = style.color;
  const g = new THREE.Group();
  if (style.kind === "beam") {
    // rayo (Kame/Galick…): cilindro. velocidad = style.speed, igual que ball/disk.
    const len = 3.6 * s;
    const r0 = Math.max(0.06, style.r * s * 0.55);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(r0 * 0.45, r0 * 0.65, len, 10),
      mat(0xffffff, 0.98)
    );
    g.add(core);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(r0 * 0.95, r0 * 1.15, len * 0.98, 10),
      matAdd(c, 0.55)
    );
    g.add(shell);
    const tip = spr(0xffffff, 0.55);
    tip.scale.setScalar(r0 * 3.2);
    tip.position.y = len * 0.48;
    g.add(tip);
    const aura = spr(c, 0.28);
    aura.scale.set(r0 * 4.2, len * 0.72, 1);
    g.add(aura);
  } else if (style.kind === "disk") {
    // disco (Kienzan). misma speed de STYLES.
    const R = Math.max(0.35, style.r * s);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.72, R * 0.16, 10, 28), mat(c, 0.95));
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.04 * s, 24),
      mat(0xffffff, 0.88)
    );
    plate.rotation.x = Math.PI / 2;
    g.add(plate);
    const halo = spr(c, 0.28);
    halo.scale.setScalar(R * 3.4);
    g.add(halo);
  } else if (style.kind === "light") {
    // luz: rayo muy fino y blanco con mucho brillo.
    const len = 4.2 * s;
    const r0 = Math.max(0.04, style.r * s * 0.35);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.5, r0 * 0.5, len, 8), mat(0xffffff, 0.98)));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.4, r0 * 1.4, len, 8), matAdd(c, 0.6)));
    const tip = spr(0xffffff, 0.9);
    tip.scale.setScalar(r0 * 7);
    tip.position.y = len * 0.48;
    g.add(tip);
    const aura = spr(c, 0.35);
    aura.scale.set(r0 * 7, len * 0.8, 1);
    g.add(aura);
  } else if (style.kind === "drill") {
    // taladro espiral (makankosappo): eje fino + hélice que gira (hijo "spin").
    const len = 3.8 * s;
    const r0 = Math.max(0.05, style.r * s * 0.5);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.4, r0 * 0.4, len, 8), mat(0xffffff, 0.98)));
    const spin = new THREE.Group();
    spin.name = "spin";
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const a = t * Math.PI * 2 * 5;
      pts.push(new THREE.Vector3(Math.cos(a) * r0 * 2.2, (t - 0.5) * len, Math.sin(a) * r0 * 2.2));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    spin.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, r0 * 0.35, 6), mat(c, 0.95)));
    g.add(spin);
    const tip = spr(0xffffff, 0.7);
    tip.scale.setScalar(r0 * 4);
    tip.position.y = len * 0.5;
    g.add(tip);
  } else if (style.kind === "cold") {
    // hielo: carámbano (octaedro estirado) apuntando al frente.
    const R = Math.max(0.16, style.r * s * 1.2);
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(R, 0), mat(c, 0.85));
    shard.scale.set(0.7, 3.2, 0.7);
    g.add(shard);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.5, 0), mat(0xffffff, 0.95));
    core.scale.set(0.7, 3, 0.7);
    g.add(core);
    const halo = spr(c, 0.3);
    halo.scale.set(R * 3, R * 6, 1);
    g.add(halo);
  } else if (style.kind === "spike") {
    // estrella de púas: conos radiales que giran (hijo "spin").
    const R = Math.max(0.16, style.r * s * 1.1);
    const spin = new THREE.Group();
    spin.name = "spin";
    spin.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.55, 0), mat(0xffffff, 0.95)));
    const coneG = new THREE.ConeGeometry(R * 0.28, R * 1.3, 6);
    const coneM = mat(c, 0.95);
    const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const seen = new Set();
    for (let i = 0; i < dirs.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
      const k = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const cone = new THREE.Mesh(coneG, coneM);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      cone.position.copy(v).multiplyScalar(R * 0.8);
      spin.add(cone);
    }
    g.add(spin);
    const halo = spr(c, 0.3);
    halo.scale.setScalar(R * 3.4);
    g.add(halo);
  } else if (style.kind === "fire") {
    // fuego: bola con capas naranja/roja y llama (sprites) que titilan.
    const R = Math.max(0.16, style.r * s * 1.35);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.5, 10, 8), mat(0xfff59d, 0.95)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(R, 12, 10), matAdd(c, 0.7)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.35, 12, 10), matAdd(0xff6d00, 0.35)));
    const flame = spr(0xff3d00, 0.5);
    flame.name = "flicker";
    flame.scale.setScalar(R * 4);
    g.add(flame);
  } else if (style.kind === "magic") {
    // magia: esfera con dos anillos cruzados que giran (hijo "spin").
    const R = Math.max(0.16, style.r * s * 1.2);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.6, 12, 10), mat(0xffffff, 0.92)));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.9, 12, 10), matAdd(c, 0.45)));
    const spin = new THREE.Group();
    spin.name = "spin";
    const ringG = new THREE.TorusGeometry(R * 1.4, R * 0.08, 6, 32);
    const r1 = new THREE.Mesh(ringG, mat(c, 0.9));
    const r2 = new THREE.Mesh(ringG, mat(c, 0.9));
    r1.rotation.x = Math.PI / 2;
    r2.rotation.y = Math.PI / 2;
    spin.add(r1, r2);
    g.add(spin);
    const halo = spr(c, 0.35);
    halo.scale.setScalar(R * 4);
    g.add(halo);
  } else {
    // bola de ki. misma speed de STYLES.
    const R = Math.max(0.14, style.r * s * 1.35);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 12), mat(c, 0.92));
    g.add(ball);
    const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 10, 8), mat(0xffffff, 0.95));
    g.add(core);
    const halo = spr(c, 0.32);
    halo.scale.setScalar(R * 3.6);
    g.add(halo);
  }
  return g;
}

// Kinds con chorro continuo desde la mano (estilo Kamehameha). Pegado a la mano / largo máx en combat.js.
export const STREAM = new Set(["beam", "fire", "light", "drill", "cold"]);

const _up = new THREE.Vector3(0, 1, 0);
const _sd = new THREE.Vector3();

/** chorro: cilindros de alto 1 en +Y (punta = cabeza del disparo), se estiran con updateStream. */
export function makeStreamMesh(style, r) {
  const g = new THREE.Group();
  const core = style.kind === "fire" ? 0xfff59d : 0xffffff;
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.25, 1, 10, 1, true), mat(core, 0.9)));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.55, 1, 12, 1, true), matAdd(style.color, 0.5)));
  if (style.kind === "fire") g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 0.7, 1, 10, 1, true), matAdd(0xff6d00, 0.25)));
  return g;
}

export function updateStream(stream, tail, head) {
  _sd.subVectors(head, tail);
  const len = _sd.length();
  stream.visible = len > 0.05;
  if (!stream.visible) return;
  stream.position.addVectors(head, tail).multiplyScalar(0.5);
  stream.quaternion.setFromUnitVectors(_up, _sd.divideScalar(len));
  stream.scale.set(1, len, 1);
}

/** anima por frame las partes que giran o titilan según el kind. */
export function animPowerMesh(mesh, kind, dt) {
  const spin = mesh.getObjectByName("spin");
  if (spin) {
    if (kind === "drill") spin.rotation.y += dt * 22;
    else if (kind === "spike") {
      spin.rotation.x += dt * 9;
      spin.rotation.y += dt * 13;
    } else spin.rotation.y += dt * 6;
  }
  const fl = mesh.getObjectByName("flicker");
  if (fl) fl.material.opacity = 0.35 + Math.random() * 0.3;
}

/** alinea un efecto de poder de tipo beam. */
export function alignBeam(mesh, dir) {
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}

/** crea un efecto de burst. */
export function spawnBurst(scene, pos, color, list) {
  for (let i = 0; i < 9; i++) {
    const m = spr(color, 0.85);
    const sc = 0.45 + Math.random() * 0.7;
    m.scale.setScalar(sc);
    m.position.copy(pos);
    scene.add(m);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.55, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(7 + Math.random() * 9);
    list.push({ mesh: m, v, t: 0.34, grow: 4 });
  }
}

/** crea un efecto de disparo. */
export function spawnMuzzle(scene, pos, color, list) {
  const flash = spr(0xffffff, 0.95);
  flash.scale.setScalar(0.7);
  flash.position.copy(pos);
  scene.add(flash);
  list.push({ mesh: flash, v: new THREE.Vector3(), t: 0.12, grow: 18 });
  const glow = spr(color, 0.7);
  glow.scale.setScalar(1.15);
  glow.position.copy(pos);
  scene.add(glow);
  list.push({ mesh: glow, v: new THREE.Vector3(), t: 0.2, grow: 12 });
}

/** crea un efecto de impacto. */
export function spawnHit(scene, pos, list, dir, heavy = false) {
  spawnBurst(scene, pos, heavy ? 0xffecb3 : 0xfff176, list);
  const flash = spr(0xffffff, 1);
  flash.scale.setScalar(heavy ? 2.4 : 1.6);
  flash.position.copy(pos);
  scene.add(flash);
  list.push({ mesh: flash, v: new THREE.Vector3(), t: heavy ? 0.16 : 0.12, grow: heavy ? 36 : 28 });
  const flash2 = spr(heavy ? 0xff8a65 : 0xffffff, 0.75);
  flash2.scale.setScalar(heavy ? 1.35 : 0.9);
  flash2.position.copy(pos);
  scene.add(flash2);
  list.push({ mesh: flash2, v: new THREE.Vector3(), t: 0.22, grow: 14 });
  // chispas radiales
  const n = heavy ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const spark = spr(i % 2 ? 0xfff59d : 0xffab40, 0.9);
    spark.scale.set(0.12, 0.55 + Math.random() * 0.7, 1);
    spark.position.copy(pos);
    scene.add(spark);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const spd = (heavy ? 14 : 9) + Math.random() * 8;
    list.push({
      mesh: spark,
      v: new THREE.Vector3(Math.cos(a) * spd, 2 + Math.random() * 6, Math.sin(a) * spd),
      t: 0.16 + Math.random() * 0.12,
      grow: 6,
    });
  }
  if (dir) {
    const slash = spr(0xffecb3, 0.9);
    slash.scale.set(heavy ? 3.2 : 2.2, heavy ? 0.7 : 0.55, 1);
    slash.position.copy(pos);
    scene.add(slash);
    list.push({ mesh: slash, v: dir.clone().multiplyScalar(heavy ? 8 : 5), t: 0.22, grow: 10 });
    // línea de impacto secundaria
    const slash2 = spr(0xffffff, 0.55);
    slash2.scale.set(1.4, 0.28, 1);
    slash2.position.copy(pos);
    scene.add(slash2);
    list.push({ mesh: slash2, v: dir.clone().multiplyScalar(12), t: 0.12, grow: 4 });
  }
}

/** Anillo de aviso al cargar / soltar un blast. */
export function spawnTelegraph(scene, pos, color, list, scale = 1) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2 * scale, 0.55 * scale, 24),
    mat(color, 0.65)
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, pos.y + 0.05, pos.z);
  scene.add(ring);
  list.push({ mesh: ring, v: new THREE.Vector3(), t: 0.28, grow: 16 });
  const glow = spr(color, 0.55);
  glow.scale.setScalar(0.8 * scale);
  glow.position.copy(pos);
  glow.position.y += 0.4;
  scene.add(glow);
  list.push({ mesh: glow, v: new THREE.Vector3(0, 2, 0), t: 0.25, grow: 10 });
}

/** Anillo de polvo / cráter suave en el suelo. */
export function spawnImpactRing(scene, pos, list, heavy = false) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, heavy ? 1.15 : 0.75, 28),
    mat(heavy ? 0xffe082 : 0xffcc80, heavy ? 0.7 : 0.55)
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, pos.y + 0.06, pos.z);
  scene.add(ring);
  list.push({ mesh: ring, v: new THREE.Vector3(), t: heavy ? 0.48 : 0.3, grow: heavy ? 12 : 8 });
  for (let i = 0; i < (heavy ? 7 : 4); i++) {
    const d = spr(0xbcaaa4, 0.55);
    d.scale.setScalar(0.35 + Math.random() * 0.45);
    d.position.set(pos.x, pos.y + 0.2, pos.z);
    scene.add(d);
    const a = Math.random() * Math.PI * 2;
    list.push({
      mesh: d,
      v: new THREE.Vector3(Math.cos(a) * (4 + Math.random() * 5), 3 + Math.random() * 4, Math.sin(a) * (4 + Math.random() * 5)),
      t: 0.35 + Math.random() * 0.2,
      grow: 3,
    });
  }
}

/** Speed line corta detrás del personaje. */
export function spawnSpeedStreak(scene, pos, dir, list, color = 0xffffff) {
  const s = spr(color, 0.55);
  s.scale.set(0.25, 1.8 + Math.random() * 1.2, 1);
  s.position.copy(pos);
  s.position.x += (Math.random() - 0.5) * 0.6;
  s.position.y += (Math.random() - 0.5) * 0.5;
  s.position.z += (Math.random() - 0.5) * 0.6;
  scene.add(s);
  list.push({
    mesh: s,
    v: dir.clone().multiplyScalar(-(18 + Math.random() * 12)),
    t: 0.12 + Math.random() * 0.08,
    grow: 2,
  });
}

export function spawnMeleeArc(scene, pos, yaw, list) {
  const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const p = pos.clone().addScaledVector(f, 1.05);
  p.y += 0.15;
  const arc = spr(0xffcc80, 0.85);
  arc.scale.set(2.8, 1.25, 1);
  arc.position.copy(p);
  scene.add(arc);
  list.push({ mesh: arc, v: f.clone().multiplyScalar(4), t: 0.2, grow: 12 });
  const whoosh = spr(0xfff8e1, 0.45);
  whoosh.scale.set(1.6, 0.35, 1);
  whoosh.position.copy(p);
  scene.add(whoosh);
  list.push({ mesh: whoosh, v: f.clone().multiplyScalar(9), t: 0.12, grow: 6 });
}

export function spawnClash(scene, pos, c1, c2, list) {
  spawnBurst(scene, pos, c1, list);
  spawnBurst(scene, pos, c2, list);
  const flash = spr(0xffffff, 0.95);
  flash.scale.setScalar(1.6);
  flash.position.copy(pos);
  scene.add(flash);
  list.push({ mesh: flash, v: new THREE.Vector3(), t: 0.22, grow: 24 });
  const ring = spr(0xfff59d, 0.7);
  ring.scale.setScalar(1.2);
  ring.position.copy(pos);
  scene.add(ring);
  list.push({ mesh: ring, v: new THREE.Vector3(), t: 0.3, grow: 16 });
}
