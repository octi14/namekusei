import * as THREE from "three";
import { BASE_Z } from "./config.js";

/** Radio interior caminable / depósito / spawn. */
export const BASE_INNER_R = 28;
/** Radio exterior del casco. */
export const BASE_HULL_R = 38;
/** Plataforma plana del terreno bajo la nave. */
export const BASE_PAD_R = 58;

let _gh = (x, z) => 0;
let _obst = () => {};
let _shadow = (m) => m;

export function bindBaseWorld(api) {
  _gh = api.groundHeight;
  _obst = api.addObst;
  _shadow = api.shadowMesh || ((m) => m);
}

export function baseOrigin(faccion) {
  return { x: 0, z: faccion === "z" ? -BASE_Z : BASE_Z };
}

export function baseDoorDir(faccion) {
  return faccion === "z" ? 1 : -1;
}

export function inShipBase(pos, faccion) {
  const o = baseOrigin(faccion);
  return Math.hypot(pos.x - o.x, pos.z - o.z) < BASE_INNER_R;
}

/** Waypoints de puerta: out (rampa), door (umbral), in (interior). */
export function shipDoorWaypoints(faccion) {
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  return {
    out: { x: o.x, z: o.z + door * (BASE_INNER_R + 15) },
    door: { x: o.x, z: o.z + door * (BASE_INNER_R - 0.5) },
    in: { x: o.x * 0.15, z: o.z - door * 5 },
    origin: o,
    doorDir: door,
  };
}

export function shipDist(pos, faccion) {
  const o = baseOrigin(faccion);
  return Math.hypot(pos.x - o.x, pos.z - o.z);
}

/**
 * Navegación a naves: entrar/salir/depositar solo por la puerta.
 * Devuelve { x, z, land: true } o null si no aplica.
 */
export function steerShipNav(px, pz, faccion, goal) {
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  const dx = px - o.x;
  const dz = pz - o.z;
  const d = Math.hypot(dx, dz);
  const inside = d < BASE_INNER_R - 0.4;
  const nrm = (x, z) => {
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len, land: true, dist: len, inside };
  };

  if (goal === "exit") {
    if (!inside && d > BASE_INNER_R + 10) return null;
    if (Math.abs(dx) > 4) return nrm(-dx, 0);
    return nrm(0, door);
  }

  if (goal === "enter" || goal === "deposit") {
    if (inside) return goal === "deposit" ? nrm(-dx, -dz) : null;
    if (Math.abs(dx) > 4) return nrm(-dx, 0);
    return nrm(0, -door);
  }
  return null;
}

/** ¿Está en/cerca de alguna nave (propia o rival)? */
export function nearAnyShip(pos, margin = 6) {
  for (const fac of ["z", "f"]) {
    if (shipDist(pos, fac) < BASE_INNER_R + margin) return fac;
  }
  return null;
}

/** Altura máx. de vuelo dentro (flyAlt). Techo ~11.5 → margen cabeza. */
export const SHIP_CEIL_ALT = 8.6;
/** Alto útil de la puerta (no se sale volando por arriba del marco). */
export const SHIP_DOOR_ALT = 6.8;
export const SHIP_DOOR_HALF_W = 10.5;
/** Piso de nave sobre el pad aplanado. */
export const SHIP_DECK = 0.55;

const _shipWalk = { z: null, f: null };

export function clearShipWalk() {
  _shipWalk.z = null;
  _shipWalk.f = null;
}

export function registerShipWalk(faccion, data) {
  _shipWalk[faccion] = data;
}

/** Altura caminable de piso/rampa; -1e9 si no hay. */
export function shipWalkHeight(x, z) {
  let best = -1e9;
  for (const fac of ["z", "f"]) {
    const info = _shipWalk[fac];
    if (!info) continue;
    const dx = x - info.ox;
    const dz = z - info.oz;
    const d = Math.hypot(dx, dz);
    if (d < BASE_INNER_R - 0.35) best = Math.max(best, info.floorY);
    const ramp = info.ramp;
    if (!ramp) continue;
    const z0 = Math.min(ramp.zIn, ramp.zOut);
    const z1 = Math.max(ramp.zIn, ramp.zOut);
    if (dz < z0 - 0.25 || dz > z1 + 0.25) continue;
    if (Math.abs(dx) > ramp.halfW) continue;
    const span = ramp.zOut - ramp.zIn || 1e-4;
    const t = Math.max(0, Math.min(1, (dz - ramp.zIn) / span));
    best = Math.max(best, ramp.yIn + (ramp.yOut - ramp.yIn) * t);
  }
  return best;
}

function inDoorZone(dx, dz, door) {
  if (Math.abs(dx) > SHIP_DOOR_HALF_W + 2.4) return false;
  return door > 0 ? dz > BASE_INNER_R * 0.12 : dz < -BASE_INNER_R * 0.12;
}

/**
 * Casco sólido: techo, paredes y dintel.
 * Solo se entra/sale por la puerta (y a pie o volando bajo el marco).
 */
export function resolveShipCollisions(person) {
  if (!person || person.dead) return;
  const pos = person.mesh?.position;
  if (!pos) return;
  for (const fac of ["z", "f"]) {
    const o = baseOrigin(fac);
    const door = baseDoorDir(fac);
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const d = Math.hypot(dx, dz);
    const doorZ = inDoorZone(dx, dz, door);
    const inside = d < BASE_INNER_R - 0.15;
    const nearHull = d < BASE_HULL_R * 0.98;
    if (!nearHull && !inside) continue;

    // Techo interior: no atravesar
    if (inside) {
      if ((person.flyAlt || 0) > SHIP_CEIL_ALT) {
        person.flyAlt = SHIP_CEIL_ALT;
        if ((person.vy || 0) > 0) person.vy = 0;
      }
      // Paredes internas (salvo puerta)
      if (d > BASE_INNER_R - 1.35 && !doorZ && d > 1e-4) {
        const k = (BASE_INNER_R - 1.35) / d;
        pos.x = o.x + dx * k;
        pos.z = o.z + dz * k;
      }
    }

    // Dintel / túnel de puerta: no salir volando por arriba del marco
    if (doorZ && (person.flyAlt || 0) > SHIP_DOOR_ALT) {
      // Fuera o en el umbral: limitar altura al hueco de la puerta
      if (d > BASE_INNER_R - 2.5) {
        person.flyAlt = SHIP_DOOR_ALT;
        if ((person.vy || 0) > 0) person.vy = 0;
      }
    }

    // Casco exterior: no atravesar techo/pared desde afuera (salvo puerta baja)
    if (!inside && d < BASE_HULL_R * 0.92 && d > BASE_INNER_R - 0.5) {
      const alt = person.flyAlt || 0;
      if (alt < 26 && !doorZ) {
        const k = (BASE_HULL_R * 0.94) / Math.max(d, 1e-4);
        pos.x = o.x + dx * k;
        pos.z = o.z + dz * k;
      } else if (doorZ && alt > SHIP_DOOR_ALT) {
        person.flyAlt = SHIP_DOOR_ALT;
        if ((person.vy || 0) > 0) person.vy = 0;
      }
    }

    // Si estás encima del techo (fuera del interior pero sobre la huella), no caigas adentro atravesando
    if (!inside && d < BASE_INNER_R + 0.8 && (person.flyAlt || 0) > SHIP_CEIL_ALT) {
      // Empujar hacia la puerta o afuera
      if (!doorZ && d > 1e-4) {
        const k = (BASE_INNER_R + 1.2) / d;
        pos.x = o.x + dx * k;
        pos.z = o.z + dz * k;
      }
    }
  }
}

export function shipSpawnPos(faccion, i, n) {
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  const ang = (i / Math.max(1, n)) * Math.PI * 2 + 0.35;
  const r = 5 + (i % 6) * 2.1;
  const x = o.x + Math.cos(ang) * r;
  const z = o.z + Math.sin(ang) * r * 0.85 - door * 4;
  const sw = shipWalkHeight(x, z);
  return new THREE.Vector3(x, sw > -1e8 ? sw : _gh(x, z) + SHIP_DECK, z);
}

export function shipBallSlot(faccion, n) {
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  const a = ((n - 1) / 7) * Math.PI * 2;
  const r = 9;
  return {
    x: o.x + Math.cos(a) * r,
    z: o.z + Math.sin(a) * r * 0.9 - door * 3,
  };
}

function labelTex(lines, w = 512, h = 128) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#111";
  g.font = "bold 52px Arial,sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const step = h / (lines.length + 1);
  lines.forEach((t, i) => g.fillText(t, w / 2, step * (i + 1)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hullObstacles(cx, cz, r, doorYaw) {
  const n = 22;
  const door = doorYaw > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    const dx = px - cx;
    const dz = pz - cz;
    if (Math.abs(dx) < 13 && (door > 0 ? dz > -4 : dz < 4)) continue;
    _obst(px, pz, 2.6, 14);
  }
}

/** Rampa: interior = piso nave; exterior = terreno. */
function addDoorRamp(g, o, door, innerR, opts = {}) {
  const width = opts.width ?? 9;
  const thick = opts.thick ?? 0.35;
  const outDist = opts.outDist ?? 16;
  const floorY = opts.floorY ?? _gh(o.x, o.z) + SHIP_DECK;
  const mat =
    opts.mat ||
    new THREE.MeshStandardMaterial({
      color: 0x546e7a,
      metalness: 0.4,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  const zIn = door * (innerR - 0.15);
  const zOut = door * (innerR + outDist);
  const yIn = floorY;
  const yOut = _gh(o.x, o.z + zOut) + thick * 0.5;
  const dz = zOut - zIn;
  const len = Math.max(4, Math.hypot(dz, yOut - yIn));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thick, len), mat);
  mesh.position.set(0, (yIn + yOut) * 0.5, (zIn + zOut) * 0.5);
  mesh.rotation.x = Math.atan2(yIn - yOut, dz);
  mesh.receiveShadow = true;
  g.add(_shadow(mesh));
  if (opts.rails) {
    const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.55, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.15, len * 0.92), railMat);
      rail.position.set(side * (width * 0.46), (yIn + yOut) * 0.5 + 0.65, (zIn + zOut) * 0.5);
      rail.rotation.x = mesh.rotation.x;
      g.add(rail);
    }
  }
  return { mesh, zIn, zOut, yIn, yOut, halfW: width * 0.5 };
}

/** Habitación hueca: piso, paredes, techo visible desde adentro + luz. */
function addInteriorRoom(g, y0, innerR, ceilY, door, doorHalfW = 6.5, floorY = null) {
  const deckY = floorY ?? y0 + SHIP_DECK;
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x37474f,
    metalness: 0.45,
    roughness: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x455a64,
    metalness: 0.35,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0x263238,
    metalness: 0.4,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.55, roughness: 0.4 });

  // Piso grueso para que el terreno no lo atraviese visualmente
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(innerR * 0.98, innerR * 0.98, 0.55, 40), floorMat);
  floor.position.y = deckY - 0.2;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes por segmentos (hueco en la puerta)
  const segs = 28;
  const wallH = ceilY - deckY;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const mid = (a0 + a1) * 0.5;
    const sx = Math.sin(mid) * innerR;
    const sz = Math.cos(mid) * innerR;
    // puerta hacia ±Z según door
    const alongDoor = door > 0 ? sz : -sz;
    if (alongDoor > innerR * 0.38 && Math.abs(sx) < doorHalfW + 1.2) continue;
    const chord = 2 * innerR * Math.sin((a1 - a0) * 0.5);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(chord * 1.05, wallH, 0.55), wallMat);
    panel.position.set(Math.sin(mid) * (innerR - 0.2), deckY + wallH * 0.5, Math.cos(mid) * (innerR - 0.2));
    panel.rotation.y = mid;
    g.add(panel);
  }

  // Techo cúpula (se ve desde adentro)
  const ceil = new THREE.Mesh(new THREE.SphereGeometry(innerR * 1.02, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), ceilMat);
  ceil.position.y = ceilY - innerR * 0.15;
  g.add(ceil);

  // Anillo perimetral del techo
  const ring = new THREE.Mesh(new THREE.TorusGeometry(innerR * 0.96, 0.35, 8, 40), trimMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = ceilY - 0.4;
  g.add(ring);

  // Luces de techo
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lamp = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(Math.cos(a) * innerR * 0.45, ceilY - 0.55, Math.sin(a) * innerR * 0.45);
    g.add(lamp);
  }
  const centerLamp = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff3e0, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  centerLamp.rotation.x = Math.PI / 2;
  centerLamp.position.y = ceilY - 0.5;
  g.add(centerLamp);

  const light = new THREE.PointLight(0xffe0b2, 1.35, innerR * 3.2, 1.4);
  light.position.set(0, ceilY - 1.2, 0);
  g.add(light);

  // Marco de puerta (hueco más bajo / abierto hacia el piso)
  const frameH = Math.min(wallH * 0.88, 7.2);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, frameH, 0.7), trimMat);
  const pz = door * (innerR - 0.4);
  const postY0 = deckY;
  const left = post.clone();
  left.position.set(-doorHalfW * 0.92, postY0 + frameH * 0.5, pz);
  g.add(left);
  const right = post.clone();
  right.position.set(doorHalfW * 0.92, postY0 + frameH * 0.5, pz);
  g.add(right);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorHalfW * 2, 0.55, 0.7), trimMat);
  lintel.position.set(0, postY0 + frameH, pz);
  g.add(lintel);
  return deckY;
}

export function buildCapsuleCorpBase(scene) {
  const faccion = "z";
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  const y0 = _gh(o.x, o.z);
  const R = 34;
  const innerR = BASE_INNER_R;
  const ceilY = y0 + 11.5;
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);

  const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.35, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a237e, metalness: 0.4, roughness: 0.45 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x0d47a1, metalness: 0.35, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.65, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x4fc3f7,
    emissive: 0x0288d1,
    emissiveIntensity: 0.25,
    metalness: 0.2,
    roughness: 0.2,
  });

  // Casco exterior (capas, no relleno interior)
  const cy = y0 + R * 0.78;
  const bot = new THREE.Mesh(new THREE.SphereGeometry(R, 36, 22, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), dark);
  bot.position.y = cy;
  g.add(_shadow(bot));
  const mid = new THREE.Mesh(new THREE.SphereGeometry(R * 1.01, 36, 14, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.22), white);
  mid.position.y = cy;
  g.add(_shadow(mid));
  const top = new THREE.Mesh(new THREE.SphereGeometry(R, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.42), navy);
  top.position.y = cy;
  g.add(_shadow(top));

  const deckY = addInteriorRoom(g, y0, innerR, ceilY, door, 8.2);

  const pad = new THREE.Mesh(
    new THREE.RingGeometry(7, 11, 36),
    new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = deckY + 0.04;
  g.add(pad);

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 5),
    new THREE.MeshBasicMaterial({ map: labelTex(["CAPSULE", "CORP."]), transparent: true })
  );
  banner.position.set(0, cy + 2, door * (R * 0.12));
  banner.rotation.y = door > 0 ? 0 : Math.PI;
  g.add(banner);

  const rampInfo = addDoorRamp(g, o, door, innerR, {
    width: 12,
    thick: 0.35,
    outDist: 15,
    floorY: deckY,
    mat: new THREE.MeshStandardMaterial({
      color: 0x455a64,
      metalness: 0.4,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  });
  registerShipWalk(faccion, {
    ox: o.x,
    oz: o.z,
    floorY: deckY,
    ramp: {
      zIn: rampInfo.zIn,
      zOut: rampInfo.zOut,
      yIn: rampInfo.yIn,
      yOut: rampInfo.yOut,
      halfW: rampInfo.halfW,
    },
  });

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = Math.cos(a) * 24;
    const lz = Math.sin(a) * 24;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.25, 9, 7), metal);
    leg.position.set(lx, y0 + 4.2, lz);
    leg.rotation.z = Math.cos(a) * 0.32;
    leg.rotation.x = -Math.sin(a) * 0.32;
    g.add(_shadow(leg));
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 14), navy);
    foot.position.set(lx * 1.12, y0 + 0.22, lz * 1.12);
    g.add(foot);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.0, 5.5, 12), metal);
  core.position.set(0, y0 + 2.8, 0);
  g.add(_shadow(core));

  scene.add(g);
  hullObstacles(o.x, o.z, BASE_HULL_R * 0.95, door > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

export function buildFreezerBase(scene) {
  const faccion = "f";
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  const y0 = _gh(o.x, o.z);
  const innerR = BASE_INNER_R;
  const ceilY = y0 + 10.5;
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);

  const cream = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, metalness: 0.3, roughness: 0.45 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x00695c, metalness: 0.45, roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.55, roughness: 0.35 });
  const purple = new THREE.MeshStandardMaterial({
    color: 0x9c27b0,
    emissive: 0x4a148c,
    emissiveIntensity: 0.45,
    metalness: 0.3,
    roughness: 0.3,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x81d4fa,
    emissive: 0x0288d1,
    emissiveIntensity: 0.3,
    metalness: 0.2,
    roughness: 0.25,
  });
  const metal = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.6, roughness: 0.35 });

  const disk = new THREE.Mesh(new THREE.CylinderGeometry(40, 43, 8.5, 40), cream);
  disk.position.y = y0 + 9.5;
  g.add(_shadow(disk));

  const band = new THREE.Mesh(new THREE.CylinderGeometry(41.5, 41.5, 4.2, 40), teal);
  band.position.y = y0 + 9.5;
  g.add(band);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(24, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), cream);
  dome.position.y = y0 + 12.5;
  g.add(_shadow(dome));

  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 13), gold);
    rib.position.set(Math.cos(a) * 12, y0 + 24, Math.sin(a) * 12);
    rib.rotation.y = -a;
    rib.rotation.x = 0.35;
    g.add(rib);
  }

  const gem = new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 12), purple);
  gem.position.set(0, y0 + 21, door * 14);
  g.add(gem);

  const doorA = door > 0 ? Math.PI / 2 : -Math.PI / 2;
  const nearDoorAng = (a) => {
    let d = a - doorA;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < 0.62;
  };

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (nearDoorAng(a)) continue;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.95, 8, 6), glass);
    w.position.set(Math.cos(a) * 40.5, y0 + 9.5, Math.sin(a) * 40.5);
    g.add(w);
  }

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (nearDoorAng(a)) continue;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), gold);
    bulb.position.set(Math.cos(a) * 28, y0 + 5.2, Math.sin(a) * 28);
    g.add(bulb);
  }

  const deckY = addInteriorRoom(g, y0, innerR, ceilY, door, 8.6);

  const glowPad = new THREE.Mesh(
    new THREE.CircleGeometry(11, 28),
    new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.35 })
  );
  glowPad.rotation.x = -Math.PI / 2;
  glowPad.position.y = deckY + 0.04;
  g.add(glowPad);

  const rampInfo = addDoorRamp(g, o, door, innerR, {
    width: 13,
    thick: 0.38,
    outDist: 16,
    floorY: deckY,
    mat: new THREE.MeshStandardMaterial({
      color: 0xb0bec5,
      metalness: 0.5,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  });

  registerShipWalk(faccion, {
    ox: o.x,
    oz: o.z,
    floorY: deckY,
    ramp: {
      zIn: rampInfo.zIn,
      zOut: rampInfo.zOut,
      yIn: rampInfo.yIn,
      yOut: rampInfo.yOut,
      halfW: rampInfo.halfW,
    },
  });

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    if (nearDoorAng(a)) continue;
    const lx = Math.cos(a) * 36;
    const lz = Math.sin(a) * 36;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.5, 1.6), cream);
    upper.position.set(lx * 0.85, y0 + 6.5, lz * 0.85);
    g.add(_shadow(upper));
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.15, 5.5, 1.15), metal);
    lower.position.set(lx, y0 + 2.6, lz);
    lower.rotation.z = Math.cos(a) * 0.38;
    lower.rotation.x = -Math.sin(a) * 0.38;
    g.add(_shadow(lower));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 5), metal);
    tip.position.set(lx * 1.08, y0 + 0.55, lz * 1.08);
    tip.rotation.x = Math.PI;
    g.add(tip);
  }

  scene.add(g);
  hullObstacles(o.x, o.z, BASE_HULL_R * 1.08, door > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

export function addShipBases(scene) {
  clearShipWalk();
  buildCapsuleCorpBase(scene);
  buildFreezerBase(scene);
}
