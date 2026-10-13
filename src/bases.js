import * as THREE from "three";
import { BASE_Z } from "./config.js";
import { toonMat } from "./body.js";

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
  // Pasillo de la puerta: franja centrada en x=0, del lado de la puerta.
  const front = dz * door;
  const inCorridor = Math.abs(dx) < 5 && front > BASE_INNER_R - 10;

  if (goal === "exit") {
    if (inside) {
      // 1) ir al punto frente a la puerta (adentro, recto: el interior es convexo) 2) salir derecho
      if (!inCorridor) return nrm(-dx, door * (BASE_INNER_R - 8) - dz);
      return nrm(-dx * 0.3, door);
    }
    if (Math.abs(dx) < 11 && front > 0 && d < BASE_HULL_R + 8) return nrm(-dx * 0.3, door);
    return null;
  }

  if (goal === "enter" || goal === "deposit") {
    if (inside) return goal === "deposit" ? nrm(-dx, -dz) : null;
    // Hueco libre del casco/postes: |dx| < ~13 del lado de la puerta
    if (Math.abs(dx) < 9 && front > BASE_INNER_R - 10 && front < BASE_HULL_R + 18) return nrm(-dx * 0.4, -door);
    // Radio libre de obstáculos del casco (la nave grande llega a ~43.6)
    const R = BASE_HULL_R + 8;
    const gz = door * (BASE_HULL_R + 12);
    // ¿El segmento p → punto frente a la rampa (0, gz) no corta el círculo R?
    const sx = -dx;
    const sz = gz - dz;
    const sl2 = sx * sx + sz * sz || 1;
    const t = Math.max(0, Math.min(1, -(dx * sx + dz * sz) / sl2));
    const cx = dx + sx * t;
    const cz = dz + sz * t;
    if (Math.hypot(cx, cz) > R - 0.5) return nrm(sx, sz);
    const th = Math.atan2(dz, dx);
    const thDoor = Math.atan2(door, 0);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (d > R + 1) {
      // Ir al punto tangente del círculo R más cercano a la puerta
      const a = Math.acos(R / d);
      const t1 = th + a;
      const t2 = th - a;
      const tp = Math.abs(wrap(t1 - thDoor)) < Math.abs(wrap(t2 - thDoor)) ? t1 : t2;
      return nrm(Math.cos(tp) * R - dx, Math.sin(tp) * R - dz);
    }
    // Pegado al casco: orbitar hacia la puerta, empujando hacia afuera
    const s = wrap(thDoor - th) >= 0 ? 1 : -1;
    const ux = dx / (d || 1);
    const uz = dz / (d || 1);
    const k = Math.max(0, Math.min(0.9, (R + 2 - d) * 0.2));
    return nrm(-uz * s + ux * k, ux * s + uz * k);
  }
  return null;
}

/**
 * Rodear naves por afuera cuando el tramo p → g cruza un casco.
 * Devuelve { x, z } normalizado o null si el camino está libre.
 */
export function steerAroundShips(px, pz, gx, gz) {
  const R = BASE_HULL_R + 8;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const fac of ["z", "f"]) {
    const o = baseOrigin(fac);
    const dx = px - o.x;
    const dz = pz - o.z;
    const d = Math.hypot(dx, dz);
    if (d < BASE_INNER_R) continue;
    const ex = gx - o.x;
    const ez = gz - o.z;
    if (Math.hypot(ex, ez) < BASE_INNER_R) continue;
    const sx = ex - dx;
    const sz = ez - dz;
    const sl2 = sx * sx + sz * sz || 1;
    const t = Math.max(0, Math.min(1, -(dx * sx + dz * sz) / sl2));
    if (Math.hypot(dx + sx * t, dz + sz * t) > R - 0.5) continue;
    const th = Math.atan2(dz, dx);
    const thG = Math.atan2(ez, ex);
    const nrm = (x, z) => {
      const len = Math.hypot(x, z) || 1;
      return { x: x / len, z: z / len };
    };
    if (d > R + 1) {
      const a = Math.acos(R / d);
      const t1 = th + a;
      const t2 = th - a;
      const tp = Math.abs(wrap(t1 - thG)) < Math.abs(wrap(t2 - thG)) ? t1 : t2;
      return nrm(Math.cos(tp) * R - dx, Math.sin(tp) * R - dz);
    }
    const s = wrap(thG - th) >= 0 ? 1 : -1;
    const ux = dx / (d || 1);
    const uz = dz / (d || 1);
    const k = Math.max(0, Math.min(0.9, (R + 2 - d) * 0.2));
    return nrm(-uz * s + ux * k, ux * s + uz * k);
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

/** Altura caminable de piso/rampa; -1e9 si no hay. `y` (pies) habilita pisos superiores y techo. */
export function shipWalkHeight(x, z, y) {
  let best = -1e9;
  for (const fac of ["z", "f"]) {
    const info = _shipWalk[fac];
    if (!info) continue;
    const dx = x - info.ox;
    const dz = z - info.oz;
    const d = Math.hypot(dx, dz);
    const L = info.layout;
    if (L) {
      if (d < L.outR - 0.35) best = Math.max(best, info.floorY);
      if (y != null) {
        if (d < L.atticR && d > L.shaftR && y > L.atticY - 0.8) best = Math.max(best, L.atticY);
        if (d < (L.roofR ?? L.hullR)) {
          const roof = L.roofY(Math.min(d, L.rimR));
          if (y > roof - 1) best = Math.max(best, roof);
        }
      }
    } else if (d < BASE_INNER_R - 0.35) best = Math.max(best, info.floorY);
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
    if (_shipWalk[fac]?.layout) {
      resolveLayoutShip(person, pos, _shipWalk[fac], o, door);
      continue;
    }
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

/**
 * Nave con interiores (sala central, pasillo en anillo, ático por tubo central).
 * Coordenadas locales: f = hacia la puerta, s = lateral; θ = 0 en la puerta.
 */
function resolveLayoutShip(person, pos, info, o, door) {
  const L = info.layout;
  const dx = pos.x - o.x;
  const dz = pos.z - o.z;
  const d = Math.hypot(dx, dz);
  if (d > L.hullR + 3) return;
  const f = dz * door;
  const s = dx;
  const y = pos.y;
  const capAlt = (cap) => {
    if ((person.flyAlt || 0) > cap) {
      person.flyAlt = Math.max(0, cap);
      if ((person.vy || 0) > 0) person.vy = 0;
    }
  };
  const pushR = (r) => {
    const k = r / Math.max(d, 1e-4);
    pos.x = o.x + dx * k;
    pos.z = o.z + dz * k;
  };
  const roof = L.roofY(Math.min(d, L.rimR));
  const entrance = f > 0 && Math.abs(s) < L.doorHalfW;

  // Ático: cabina + recuperación, se entra por el tubo central
  if (d < L.atticR && y > L.atticY - 0.8 && y < roof - 0.5) {
    const ceil = L.ceilY(d) - L.head;
    capAlt(d > L.shaftR ? ceil - L.atticY : ceil - info.floorY);
    if (d > L.atticR - 1.35) pushR(L.atticR - 1.35);
    if (Math.abs(f - L.partF) < 0.9 && Math.abs(s) > L.partDoor) {
      pos.z = o.z + door * (f > L.partF ? L.partF + 0.9 : L.partF - 0.9);
    }
    return;
  }

  // Planta baja: sala central + pasillo
  if (d < L.outR && y < L.atticY - 0.8 && y < roof - 0.5) {
    if (d > L.shaftR - 0.6) capAlt(L.lowCap);
    if (L.pillarR && d < L.pillarR) {
      pushR(L.pillarR);
      return;
    }
    const th = Math.atan2(s, f);
    let side = false;
    for (const a of L.sideDoors) {
      const w = Math.atan2(Math.sin(th - a), Math.cos(th - a));
      if (Math.abs(w) * L.inR < L.sideHalfW) side = true;
    }
    const hallOpen = entrance || side;
    if (d < L.inR) {
      if (!hallOpen && d > L.inR - 1.35) pushR(L.inR - 1.35);
    } else {
      if (!hallOpen && d < L.inR + 1.35) pushR(L.inR + 1.35);
      if (!entrance && d > L.outR - 1.35) pushR(L.outR - 1.35);
    }
    if (side && Math.abs(d - L.inR) < 1.8) capAlt(L.sideDoorAlt);
    return;
  }

  // Afuera: casco sólido salvo la puerta (y el techo, que se camina)
  if (d < L.hullR && y < roof - 0.6) {
    if (entrance && y < info.floorY + L.doorAlt + 1.5) {
      const lim = L.doorHalfW - 1;
      if (Math.abs(s) > lim) pos.x = o.x + Math.sign(s) * lim;
      capAlt(L.doorAlt);
    } else pushR(L.hullR);
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

export function buildCapsuleCorpBase(scene) {
  const faccion = "z";
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  const y0 = _gh(o.x, o.z);
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);

  const parts = buildCapsuleHull(g, y0, door);
  const deckY = y0 + CC.floorY;
  buildCapsuleInterior(g, y0, door);

  const rampInfo = addDoorRamp(g, o, door, BASE_INNER_R, {
    width: 2 * CC.doorHalfW,
    thick: 0.45,
    outDist: 14,
    floorY: deckY,
    rails: true,
    mat: toonMat({ color: 0xc3c8d4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, 0.3, 0.2),
  });
  inked(rampInfo.mesh, 0.15);
  const c = y0 + CC.cY;
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
    layout: {
      inR: BASE_INNER_R,
      outR: BASE_INNER_R,
      atticR: 0,
      shaftR: 0,
      atticY: Infinity,
      lowCap: 28,
      doorHalfW: CC.doorHalfW,
      doorAlt: CC.doorH - 2.6,
      sideDoors: [],
      sideHalfW: 0,
      sideDoorAlt: 0,
      partF: 0,
      partDoor: 0,
      pillarR: 4.4,
      hullR: CC.R + 1.5,
      rimR: CC.R,
      roofR: BASE_INNER_R,
      roofY: (r) => c + Math.sqrt(Math.max(0, CC.R ** 2 - r * r)),
      ceilY: () => Infinity,
      head: 2.8,
    },
  });

  g.userData.parts = parts;
  scene.add(g);
  hullObstacles(o.x, o.z, BASE_HULL_R * 0.95, door > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

export function buildFreezerBase(scene) {
  const faccion = "f";
  const o = baseOrigin(faccion);
  const door = baseDoorDir(faccion);
  const y0 = _gh(o.x, o.z);
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);

  const parts = buildFreezerHull(g, y0, door);
  const deckY = y0 + SHIP_DECK;
  buildFreezerInterior(g, y0, door);

  const rampInfo = addDoorRamp(g, o, door, FZI.outR - 0.2, {
    width: 13,
    thick: 0.38,
    outDist: 16,
    floorY: deckY,
    mat: toonMat({ color: 0xc9d2d6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, 0.3, 0.2),
  });
  inked(rampInfo.mesh, 0.2);

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
    layout: {
      inR: FZI.inR,
      outR: FZI.outR,
      atticR: FZI.atticR,
      shaftR: FZI.shaftR,
      atticY: y0 + FZI.atticY,
      lowCap: SHIP_CEIL_ALT,
      doorHalfW: FZI.doorHalfW,
      doorAlt: SHIP_DOOR_ALT,
      sideDoors: [Math.PI / 2, -Math.PI / 2, Math.PI],
      sideHalfW: FZI.sideHalfW,
      sideDoorAlt: 5.8,
      partF: FZI.partF,
      partDoor: FZI.partDoor,
      hullR: 44.6,
      rimR: FZ.rimR,
      roofY: (r) => y0 + fzTopY(r),
      ceilY: (r) => y0 + fzInCeilY(r),
      head: 2.8,
    },
  });

  g.userData.parts = parts;
  scene.add(g);
  hullObstacles(o.x, o.z, BASE_HULL_R * 1.08, door > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/** Contorno anime para escenografía: grosor en unidades del objeto (no de pantalla). */
const _baseOl = new Map();
function baseOutlineMat(thick, cutout = null) {
  const key = cutout ? `${thick}|${cutout.uuid}` : thick;
  let m = _baseOl.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: 0x120c08, side: THREE.BackSide });
  if (cutout) {
    m.alphaMap = cutout;
    m.alphaTest = 0.5;
  }
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      "#include <begin_vertex>",
      `vec3 transformed = vec3( position ) + normal * ${thick.toFixed(3)};`
    );
  };
  m.customProgramCacheKey = () => `nkBaseOl${thick}${cutout ? "c" : ""}`;
  _baseOl.set(key, m);
  return m;
}

function inked(mesh, thick = 0.3, cutout = null) {
  const ol = new THREE.Mesh(mesh.geometry, baseOutlineMat(thick, cutout));
  ol.raycast = () => {};
  ol.userData.outline = true;
  mesh.add(ol);
  return _shadow(mesh);
}

/** Perfil de la tapa (lenteja): altura sobre el piso según radio. */
const FZ = { rimR: 41.8, rimY: 13.2, topY: 28.6, whiteR: 27.5, gemR: 32.5, stripeW: 9.6, winR: 6.4, gemSize: 7.2 };
const fzTopY = (r) => FZ.rimY + (FZ.topY - FZ.rimY) * Math.pow(Math.max(0, 1 - (r / FZ.rimR) ** 2), 0.6);
function fzTopNormal(r, ang) {
  const e = 0.25;
  const slope = (fzTopY(r + e) - fzTopY(r - e)) / (2 * e);
  return new THREE.Vector3(-slope * Math.sin(ang), 1, -slope * Math.cos(ang)).normalize();
}

/** ¿(u, r) de un lathe de la tapa cae en el ventanal de la gema? (puerta en u = 0.5) */
function fzInWindow(u, r) {
  const e = 0.25;
  const slope = (fzTopY(FZ.gemR + e) - fzTopY(FZ.gemR - e)) / (2 * e);
  const arc = Math.abs(u - 0.5) * Math.PI * 2 * r;
  return Math.hypot(arc, (r - FZ.gemR) * Math.hypot(1, slope)) < FZ.winR;
}

/** Máscara alpha (blanco = sólido) del ventanal para un lathe de radio R (fila 0 = centro). */
function fzWindowMask(R) {
  const W = 1024;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  for (let y = 0; y < H; y++) {
    const r = ((y + 0.5) / H) * R;
    for (let x = W * 0.4; x < W * 0.6; x++) if (fzInWindow((x + 0.5) / W, r)) ctx.fillRect(x, y, 1, 1);
  }
  return new THREE.CanvasTexture(c);
}

/** Tapa pintada: centro blanco + franja a la gema (puerta, u=0.5), paneles marrones con nervios, tinta. */
function freezerTopTex() {
  const W = 2048;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  const white = [232, 238, 240];
  const brown = [160, 104, 50];
  const rib = [104, 64, 30];
  const ink = [18, 12, 8];
  const R = FZ.rimR;
  const inkW = 0.42;
  for (let y = 0; y < H; y++) {
    const r = ((y + 0.5) / H) * R;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const arc = Math.abs(u - 0.5) * Math.PI * 2 * r;
      const hw = FZ.stripeW + Math.max(0, r - FZ.whiteR) * 0.12;
      // distancia firmada al borde de la zona blanca (negativa = adentro)
      const sd = Math.min(r - FZ.whiteR, arc - hw);
      let col;
      if (Math.abs(sd) < inkW || r > R - 0.55) col = ink;
      else if (sd < 0) col = white;
      else {
        const k = (u * 72) % 1;
        col = k < 0.16 && r > FZ.whiteR + 1 ? rib : brown;
      }
      const i = (y * W + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tapered + curvado hacia +Z abajo (uña). */
function clawGeo(h, rTop, curve) {
  const geo = new THREE.CylinderGeometry(rTop, 0.06, h, 8, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (h * 0.5 - p.getY(i)) / h;
    p.setZ(i, p.getZ(i) + curve * t * t);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Casco toon de la nave de Freezer (refs anime). Devuelve las partes para daño por etapas. */
function buildFreezerHull(g, y0, door) {
  const T = (color, shine = 0.35, rim = 0.22, extra = {}) => toonMat({ color, ...extra }, shine, rim);
  const topMask = fzWindowMask(FZ.rimR);
  const matTop = T(0xffffff, 0.3, 0.18, { map: freezerTopTex(), alphaMap: topMask, alphaTest: 0.5 });
  const matBand = T(0x1b1c21, 0.55, 0.3);
  const matBelly = T(0xb9c6cc, 0.3, 0.2);
  const matLip = T(0xdfe6e9, 0.4, 0.2);
  const matPod = T(0xf0c860, 0.45, 0.25);
  const matBlue = T(0x3f7fd0, 0.9, 0.35);
  const matGem = T(0x8a6fd6, 1.0, 0.4, { transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const matDark = T(0x2a2d33, 0.2, 0.1);
  const matLeg = T(0xdfe3e6, 0.35, 0.2);
  const matJoint = T(0x8f979c, 0.5, 0.2);
  const V = (r, y) => new THREE.Vector2(r, y0 + y);
  const doorPhi = door > 0 ? 0 : Math.PI;
  const angOff = (a) => {
    let d = a - doorPhi;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  };
  const place = (m, r, y, phi) => m.position.set(Math.sin(phi) * r, y0 + y, Math.cos(phi) * r);

  const N = 24;
  const topPts = [];
  for (let j = 0; j < N; j++) {
    const r = FZ.rimR * (1 - j / (N - 1));
    topPts.push(V(Math.max(r, 0.001), fzTopY(r)));
  }
  const top = new THREE.Mesh(new THREE.LatheGeometry(topPts, 96), matTop);
  g.add(inked(top, 0.35, topMask));

  const band = new THREE.Mesh(
    new THREE.LatheGeometry([V(40.6, 5.2), V(42.6, 6.4), V(44.1, 8.2), V(44.4, 9.7), V(44.0, 11.2), V(42.8, 12.5)], 72),
    matBand
  );
  g.add(inked(band, 0.35));

  const lip = new THREE.Mesh(new THREE.TorusGeometry(42.3, 0.75, 8, 96), matLip);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = y0 + 12.9;
  g.add(inked(lip, 0.25));

  const gap = 0.34;
  const belly = new THREE.Mesh(
    new THREE.LatheGeometry([V(27.5, 0.2), V(36.6, 0.3), V(38.9, 1.5), V(40.2, 3.2), V(40.6, 5.2)], 72, doorPhi + gap, Math.PI * 2 - gap * 2),
    matBelly
  );
  g.add(inked(belly, 0.3));

  // Escotilla superior
  const hatch = new THREE.Group();
  const hRing = new THREE.Mesh(new THREE.TorusGeometry(7.6, 1.0, 10, 48), matLip);
  hRing.rotation.x = Math.PI / 2;
  hatch.add(inked(hRing, 0.22));
  const hHole = new THREE.Mesh(new THREE.CircleGeometry(7.0, 40), matDark);
  hHole.rotation.x = -Math.PI / 2;
  hHole.position.y = -0.15;
  hatch.add(hHole);
  hatch.position.set(0, y0 + fzTopY(0) + 0.25, -door * 2.5);
  g.add(hatch);

  // Gema violeta encastrada sobre la franja blanca (frente = puerta)
  const gemG = new THREE.Group();
  const n = fzTopNormal(FZ.gemR, doorPhi);
  place(gemG, FZ.gemR, fzTopY(FZ.gemR), doorPhi);
  gemG.lookAt(gemG.position.clone().add(n));
  const G = FZ.gemSize;
  const gemGeo = new THREE.SphereGeometry(G, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  const gem = new THREE.Mesh(gemGeo, matGem);
  gem.scale.z = 0.62;
  gem.position.z = -0.4;
  gem.renderOrder = 2;
  gemG.add(gem);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(G + 0.6, 0.85, 10, 48), matLip);
  frame.position.z = 0.2;
  gemG.add(inked(frame, 0.22));
  // Marco interior dentado del ventanal (cabina, ref. anime)
  const inFrame = new THREE.Mesh(new THREE.TorusGeometry(FZ.winR + 0.3, 0.55, 8, 48), matJoint);
  inFrame.position.z = -1.3;
  gemG.add(inFrame);
  const toothGeo = new THREE.BoxGeometry(0.9, 0.7, 0.7);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const t = new THREE.Mesh(toothGeo, matJoint);
    t.position.set(Math.cos(a) * (FZ.winR + 0.9), Math.sin(a) * (FZ.winR + 0.9), -1.3);
    t.rotation.z = a;
    gemG.add(t);
  }
  g.add(gemG);

  // Banda: pods amarillos colgando y gemas azules entre medio
  const pods = [];
  const gems = [];
  const podGeo = new THREE.SphereGeometry(1, 18, 14);
  const blueGeo = new THREE.SphereGeometry(2.0, 14, 10);
  const NP = 12;
  for (let i = 0; i < NP; i++) {
    const a = doorPhi + ((i + 0.5) / NP) * Math.PI * 2;
    if (angOff(a) > 0.4) {
      const pod = new THREE.Mesh(podGeo, matPod);
      pod.scale.set(4.0, 5.4, 2.4);
      place(pod, 43.4, 6.4, a);
      pod.rotation.set(-0.22, a, 0, "YXZ");
      g.add(inked(pod, 0.09));
      pods.push(pod);
    }
    for (const [da, y, r] of [[0.5, 9.9, 44.3]]) {
      const b = doorPhi + ((i + da + 0.5) / NP) * Math.PI * 2;
      if (angOff(b) < 0.3) continue;
      const bl = new THREE.Mesh(blueGeo, matBlue);
      bl.scale.z = 0.7;
      place(bl, r, y, b);
      bl.rotation.y = b;
      g.add(inked(bl, 0.16));
      gems.push(bl);
    }
  }

  // Ventanas azules a los lados de la puerta (banda)
  for (const s of [-1, 1]) {
    const a = doorPhi + s * 0.36;
    const w = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 0.8), matBlue);
    place(w, 44.1, 9.4, a);
    w.rotation.y = a;
    g.add(inked(w, 0.12));
    gems.push(w);
  }

  // Paneles de la panza
  const panelGeo = new THREE.BoxGeometry(3.6, 1.5, 0.35);
  for (let i = 0; i < 16; i++) {
    const a = doorPhi + ((i + 0.5) / 16) * Math.PI * 2;
    if (angOff(a) < 0.5) continue;
    const pn = new THREE.Mesh(panelGeo, matJoint);
    place(pn, 37.2, 3.15, a);
    pn.rotation.set(0.95, a, 0, "YXZ");
    g.add(pn);
  }

  // Patas garra: brazo horizontal, articulación y uña curva hacia el piso
  const legs = [];
  const armGeo = new THREE.BoxGeometry(2.4, 1.7, 10);
  const jointGeo = new THREE.CylinderGeometry(1.15, 1.15, 2.9, 12);
  const clawG = clawGeo(6.4, 1.05, 2.4);
  const NL = 12;
  for (let i = 0; i < NL; i++) {
    const a = doorPhi + (i / NL) * Math.PI * 2;
    if (angOff(a) < 0.45) continue;
    const leg = new THREE.Group();
    leg.position.y = y0;
    leg.rotation.y = a;
    const arm = new THREE.Mesh(armGeo, matLeg);
    arm.position.set(0, 3.6, 40);
    arm.rotation.x = 0.12;
    leg.add(inked(arm, 0.14));
    const joint = new THREE.Mesh(jointGeo, matJoint);
    joint.rotation.z = Math.PI / 2;
    joint.position.set(0, 3.0, 45);
    leg.add(inked(joint, 0.12));
    const claw = new THREE.Mesh(clawG, matLeg);
    claw.position.set(0, 0.9, 45.3);
    leg.add(inked(claw, 0.12));
    g.add(leg);
    legs.push(leg);
  }

  return { top, band, belly, lip, gem: gemG, hatch, pods, gems, legs };
}

/** Interior nave Freezer (alturas relativas al piso del terreno y0). */
const FZI = {
  inR: BASE_INNER_R,
  outR: 36,
  ceilY: 10.5,
  atticY: 11.3,
  atticR: 35,
  shaftR: 5,
  doorHalfW: 8.6,
  sideHalfW: 3.0,
  partF: -6,
  partDoor: 4,
};
const fzInCeilY = (r) => fzTopY(r) - 0.9;

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Piso planar (CircleGeometry/RingGeometry de radio R): centro con anillos + pasillo de tablas. */
function fzFloorTex(R, { hall, plank, line, rings, plankFrom }) {
  return canvasTex(1024, 1024, (ctx, W) => {
    const k = W / (2 * R);
    const cx = W / 2;
    ctx.fillStyle = plank;
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * plankFrom * k, cx + Math.sin(a) * plankFrom * k);
      ctx.lineTo(cx + Math.cos(a) * R * k, cx + Math.sin(a) * R * k);
      ctx.stroke();
    }
    ctx.fillStyle = hall;
    ctx.beginPath();
    ctx.arc(cx, cx, plankFrom * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    for (const r of rings) {
      ctx.beginPath();
      ctx.arc(cx, cx, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/** Panel de pared lila (refs pasillos): placas, juntas y rejilla. */
function fzWallTex() {
  return canvasTex(256, 512, (ctx, W, H) => {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#e3cdf6");
    gr.addColorStop(1, "#b893e0");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#7d5fb4";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.42);
    ctx.lineTo(W, H * 0.42);
    ctx.moveTo(W * 0.55, H * 0.42);
    ctx.lineTo(W * 0.55, H);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(W * 0.12, H * 0.5 + i * 12);
      ctx.lineTo(W * 0.3, H * 0.5 + i * 12);
      ctx.stroke();
    }
  });
}

/** Puerta azul con la "Y" (refs puertas). */
function fzDoorTex() {
  return canvasTex(256, 512, (ctx, W, H) => {
    ctx.fillStyle = "#4d5fb8";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#7f97e6";
    ctx.fillRect(16, 16, W - 32, H - 24);
    ctx.strokeStyle = "#2a3478";
    ctx.lineWidth = 7;
    ctx.strokeRect(16, 16, W - 32, H - 24);
    const cy = H * 0.3;
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(W / 2, cy);
    ctx.lineTo(W - 16, 16);
    ctx.moveTo(W / 2, cy);
    ctx.lineTo(W / 2, H - 8);
    ctx.stroke();
    ctx.fillStyle = "#b9c8f7";
    ctx.beginPath();
    ctx.moveTo(W * 0.3, 34);
    ctx.lineTo(W * 0.7, 34);
    ctx.lineTo(W / 2, cy - 22);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeRect(36, cy + 30, W / 2 - 52, H - cy - 70);
    ctx.strokeRect(W / 2 + 16, cy + 30, W / 2 - 52, H - cy - 70);
  });
}

/** Locker gris azulado con rejilla y ojo de buey (refs vestuario). */
function fzLockerTex() {
  return canvasTex(256, 512, (ctx, W, H) => {
    ctx.fillStyle = "#aeb5df";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#4b5293";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = "#8c94cf";
    ctx.fillRect(40, 40, W - 80, 150);
    ctx.lineWidth = 5;
    ctx.strokeRect(40, 40, W - 80, 150);
    ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(52, 58 + i * 15);
      ctx.lineTo(W - 52, 58 + i * 15);
      ctx.stroke();
    }
    ctx.fillStyle = "#e6e9f7";
    ctx.fillRect(W / 2 - 40, 225, 80, 32);
    ctx.strokeRect(W / 2 - 40, 225, 80, 32);
    ctx.fillStyle = "#3a62c4";
    ctx.beginPath();
    ctx.arc(W / 2, H - 100, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#9fc0ff";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 30, H - 120);
    ctx.lineTo(W / 2 + 10, H - 150);
    ctx.stroke();
  });
}

/** Techo interior del ático (lathe radio R, fila 0 = centro): lila con nervios radiales. */
function fzAtticCeilTex(R) {
  return canvasTex(1024, 128, (ctx, W, H) => {
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#f0e6fb");
    gr.addColorStop(1, "#b597df");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8a6cc2";
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const x = (i / 24) * W;
      ctx.beginPath();
      ctx.moveTo(x, (8 / R) * H);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (const r of [8, 20]) {
      ctx.beginPath();
      ctx.moveTo(0, (r / R) * H);
      ctx.lineTo(W, (r / R) * H);
      ctx.stroke();
    }
  });
}

/** Muro cilíndrico de paneles (dos caras); `skip(θ)` deja huecos (θ = 0 en la puerta). */
function wallRing(g, R, yBot, h, segs, phiDoor, mat, skip) {
  const step = (Math.PI * 2) / segs;
  const chord = 2 * R * Math.sin(step / 2) * 1.04;
  const geo = new THREE.BoxGeometry(chord, h, 0.5);
  for (let i = 0; i < segs; i++) {
    const th = i * step;
    const wth = Math.atan2(Math.sin(th), Math.cos(th));
    if (skip?.(wth, i)) continue;
    const phi = phiDoor + th;
    const p = new THREE.Mesh(geo, mat);
    p.position.set(Math.sin(phi) * R, yBot + h / 2, Math.cos(phi) * R);
    p.rotation.y = phi;
    g.add(p);
  }
  return chord;
}

/** Tanque de recuperación (refs cámara de regeneración). Frente = +Z local. */
function regenTank(T) {
  const g = new THREE.Group();
  const white = T(0xeef1f7, 0.45, 0.25);
  const navy = T(0x2a3270, 0.6, 0.3);
  const dark = T(0x23263a, 0.3, 0.15);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.2, 2.4, 28), white);
  base.position.y = 1.2;
  g.add(inked(base, 0.08));
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.5, 28), white);
  collar.position.y = 2.65;
  g.add(inked(collar, 0.06));
  const step = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, 1.7), dark);
  step.position.set(0, 0.23, 3.2);
  g.add(inked(step, 0.06));
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.3), dark);
  panel.position.set(0, 1.5, 2.95);
  panel.rotation.x = -0.25;
  g.add(panel);
  for (const [x, c] of [[-0.6, 0xff4a4a], [-0.2, 0x5dff7a], [0.2, 0x5dff7a], [0.6, 0xffd34a]]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: c }));
    led.position.set(x, 1.55, 3.12);
    led.rotation.x = -0.25;
    g.add(led);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 1.3), dark);
      v.position.set(sx * 2.95, 0.8 + i * 0.4, 0.4);
      v.rotation.y = sx * 0.2;
      g.add(v);
    }
  }
  const liquid = new THREE.Mesh(
    new THREE.SphereGeometry(2.35, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x3fb3b8, transparent: true, opacity: 0.55, depthWrite: false })
  );
  liquid.scale.y = 1.3;
  liquid.position.y = 5.3;
  g.add(liquid);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(2.55, 28, 18),
    T(0xbff0f7, 1.0, 0.5, { transparent: true, opacity: 0.32, depthWrite: false })
  );
  glass.scale.y = 1.3;
  glass.position.y = 5.3;
  glass.renderOrder = 2;
  g.add(glass);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.5, 1.3, 20), navy);
  cap.position.y = 8.6;
  g.add(inked(cap, 0.06));
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 4, 10), navy);
  pipe.position.y = 11.25;
  g.add(pipe);
  const hoseMat = T(0x2b2d3a, 0.4, 0.2);
  for (const sx of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 3.0, 1.6, -0.6),
      new THREE.Vector3(sx * 4.6, 1.2, -1.4),
      new THREE.Vector3(sx * 5.4, 0.3, -3.2),
    ]);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.38, 8), hoseMat);
    g.add(inked(hose, 0.05));
  }
  return g;
}

/** Silla flotante de Freezer (ref. cabina): platillo blanco, panza azul, punta dorada, brazo articulado. */
function freezerPod(T) {
  const g = new THREE.Group();
  const white = T(0xe9edf4, 0.5, 0.25);
  const navy = T(0x252a66, 0.6, 0.3);
  const gold = T(0xd8b04a, 0.8, 0.3);
  const arm = T(0x3d3680, 0.5, 0.25);
  const V = (r, y) => new THREE.Vector2(r, y);
  const top = new THREE.Mesh(new THREE.LatheGeometry([V(3.5, 0.6), V(3.3, 1.0), V(2.4, 1.45), V(0.01, 1.6)], 36), white);
  g.add(inked(top, 0.07));
  const under = new THREE.Mesh(new THREE.LatheGeometry([V(0.01, -2.2), V(0.9, -1.9), V(2.2, -0.8), V(3.5, 0.6)], 36), navy);
  g.add(inked(under, 0.07));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 14), gold);
  tip.rotation.x = Math.PI;
  tip.position.y = -2.7;
  g.add(inked(tip, 0.05));
  const vent = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.9), navy);
  vent.position.set(0, 1.55, -1.2);
  g.add(vent);
  const c = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1.6, -1.2),
    new THREE.Vector3(0, -3.2, -3.4),
    new THREE.Vector3(0, -4.2, -6.2),
    new THREE.Vector3(0, -4.0, -8.8),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.75, 10), arm);
  g.add(inked(tube, 0.06));
  const ringGeo = new THREE.TorusGeometry(0.86, 0.16, 6, 14);
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const r = new THREE.Mesh(ringGeo, arm);
    r.position.copy(c.getPointAt(t));
    r.lookAt(r.position.clone().add(c.getTangentAt(t)));
    g.add(r);
  }
  return g;
}

/**
 * Interiores: sala central (depósito), pasillo en anillo con puertas, tubo de luz al ático
 * (cabina de Freezer mirando por la gema + sala de recuperación detrás de un tabique).
 */
function buildFreezerInterior(g, y0, door) {
  const T = (color, shine = 0.3, rim = 0.2, extra = {}) => toonMat({ color, ...extra }, shine, rim);
  const phiDoor = door > 0 ? 0 : Math.PI;
  const deck = y0 + SHIP_DECK;
  const ceil = y0 + FZI.ceilY;
  const attic = y0 + FZI.atticY;
  const L = (s, f) => [s, f * door];
  const wallTex = fzWallTex();
  const matWall = T(0xffffff, 0.2, 0.15, { map: wallTex });
  const matTrim = T(0x5a6fe0, 0.6, 0.3);
  const matCeil = T(0xc4aee6, 0.15, 0.1, { side: THREE.DoubleSide, emissive: 0x6a5490, emissiveIntensity: 0.75 });
  const doorTex = fzDoorTex();
  const matDoor = T(0xffffff, 0.4, 0.2, { map: doorTex });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
  const glowBlue = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });

  // Piso: sala (anillos del depósito) + pasillo de tablas
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(FZI.outR, 72),
    T(0xffffff, 0.1, 0.1, {
      map: fzFloorTex(FZI.outR, { hall: "#f1c9a3", plank: "#e59a4e", line: "#a8662c", rings: [3, 9, 13.5, 22, FZI.inR], plankFrom: FZI.inR }),
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = deck - 0.02;
  g.add(floor);
  const sub = new THREE.Mesh(new THREE.CylinderGeometry(FZI.outR, FZI.outR, 0.5, 48), T(0xb9c6cc));
  sub.position.y = deck - 0.3;
  g.add(sub);

  // Muro de la sala (puertas a los lados y atrás) y pared exterior del pasillo
  const hallH = ceil - deck;
  const hallSkip = (th, i) => i === 0 || i === 1 || i === 27 || i === 7 || i === 14 || i === 21;
  const chordIn = wallRing(g, FZI.inR, deck, hallH, 28, phiDoor, matWall, hallSkip);
  wallRing(g, FZI.outR, deck, hallH, 36, phiDoor, matWall, (th, i) => i === 0 || i === 1 || i === 35);
  // Dinteles
  const lintel = (R, phi, w, yB, yT) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, yT - yB, 0.7), matWall);
    m.position.set(Math.sin(phi) * R, (yB + yT) / 2, Math.cos(phi) * R);
    m.rotation.y = phi;
    g.add(m);
  };
  lintel(FZI.inR, phiDoor, 3 * chordIn, deck + 7.6, ceil);
  lintel(FZI.outR, phiDoor, 2 * FZI.doorHalfW + 2, deck + SHIP_DOOR_ALT + 1.2, ceil);
  for (const k of [7, 14, 21]) {
    const phi = phiDoor + (k / 28) * Math.PI * 2;
    lintel(FZI.inR, phi, chordIn, deck + 6.6, ceil);
    // Hojas de la puerta Y corridas a los costados (lado pasillo)
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 6.5), matDoor);
      const a = phi + sx * (chordIn / FZI.inR) * 0.95;
      leaf.position.set(Math.sin(a) * (FZI.inR + 0.32), deck + 3.25, Math.cos(a) * (FZI.inR + 0.32));
      leaf.rotation.y = a;
      g.add(leaf);
    }
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.6, 0.9), matTrim);
      const a = phi + sx * (chordIn / FZI.inR) * 0.5;
      post.position.set(Math.sin(a) * FZI.inR, deck + 3.3, Math.cos(a) * FZI.inR);
      post.rotation.y = a;
      g.add(post);
    }
  }

  // Techo de planta baja (= piso del ático), hueco del tubo en el centro
  const lowCeil = new THREE.Mesh(new THREE.RingGeometry(FZI.shaftR, FZI.outR + 0.3, 72, 1), matCeil);
  lowCeil.rotation.x = Math.PI / 2;
  lowCeil.position.y = ceil;
  g.add(lowCeil);
  const atticFloor = new THREE.Mesh(
    new THREE.RingGeometry(FZI.shaftR, FZI.atticR + 0.3, 72, 1),
    T(0xffffff, 0.1, 0.1, { map: fzFloorTex(FZI.atticR + 0.3, { hall: "#f3d2b2", plank: "#f3d2b2", line: "#c99a74", rings: [8, 12.5, 20], plankFrom: FZI.atticR + 0.3 }) })
  );
  atticFloor.rotation.x = -Math.PI / 2;
  atticFloor.position.y = attic;
  g.add(atticFloor);
  const shaftWall = new THREE.Mesh(new THREE.CylinderGeometry(FZI.shaftR, FZI.shaftR, attic - ceil, 32, 1, true), matCeil);
  shaftWall.position.y = (attic + ceil) / 2;
  g.add(shaftWall);
  for (const y of [deck + 0.06, attic + 0.08]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(FZI.shaftR - 0.6, FZI.shaftR + 0.4, 40), glowBlue);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(FZI.shaftR - 0.4, FZI.shaftR - 0.4, attic - deck + 3, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.y = (deck + attic + 3) / 2;
  g.add(beam);

  // Pasillo: nervios del techo, ojos de buey de luz, molduras azules, luces de piso, puertas Y y lockers
  const ribGeo = new THREE.BoxGeometry(0.35, 0.35, FZI.outR - FZI.inR);
  const holeGeo = new THREE.CircleGeometry(0.75, 16);
  for (let i = 0; i < 30; i++) {
    const a = phiDoor + (i / 30) * Math.PI * 2;
    const rib = new THREE.Mesh(ribGeo, matTrim);
    rib.position.set(Math.sin(a) * (FZI.inR + FZI.outR) * 0.5, ceil - 0.2, Math.cos(a) * (FZI.inR + FZI.outR) * 0.5);
    rib.rotation.y = a;
    g.add(rib);
    const b = a + Math.PI / 30;
    const hole = new THREE.Mesh(holeGeo, lightMat);
    hole.scale.set(1.4, 1, 1);
    hole.rotation.set(Math.PI / 2, 0, -b);
    hole.position.set(Math.sin(b) * (FZI.inR + 2.2), ceil - 0.05, Math.cos(b) * (FZI.inR + 2.2));
    g.add(hole);
  }
  for (const R of [FZI.inR + 0.35, FZI.outR - 0.35]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.2, 6, 96), matTrim);
    t.rotation.x = Math.PI / 2;
    t.position.y = ceil - 0.5;
    g.add(t);
  }
  const lampGeo = new THREE.BoxGeometry(2.2, 0.55, 0.5);
  const lampMat = T(0x8fb4ff, 0.6, 0.3, { emissive: 0x3060d0, emissiveIntensity: 0.4 });
  const doorGeo = new THREE.PlaneGeometry(3.4, 6.6);
  const lockerGeo = new THREE.BoxGeometry(2.6, 6.4, 0.9);
  const matLocker = T(0xffffff, 0.35, 0.2, { map: fzLockerTex() });
  for (let i = 0; i < 12; i++) {
    const a = phiDoor + ((i + 0.5) / 12) * Math.PI * 2;
    const th = Math.atan2(Math.sin(a - phiDoor), Math.cos(a - phiDoor));
    if (Math.abs(th) < 0.5) continue;
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(Math.sin(a) * (FZI.outR - 0.55), deck + 0.28, Math.cos(a) * (FZI.outR - 0.55));
    lamp.rotation.y = a;
    g.add(lamp);
    const b = a + Math.PI / 12;
    const tb = Math.atan2(Math.sin(b - phiDoor), Math.cos(b - phiDoor));
    if (Math.abs(tb) < 0.5) continue;
    if (Math.abs(Math.abs(tb) - 2.35) < 0.3) {
      for (const k of [-1, 1]) {
        const c = b + k * 0.045;
        const lk = new THREE.Mesh(lockerGeo, matLocker);
        lk.position.set(Math.sin(c) * (FZI.outR - 0.75), deck + 3.2, Math.cos(c) * (FZI.outR - 0.75));
        lk.rotation.y = c + Math.PI;
        g.add(inked(lk, 0.05));
      }
      continue;
    }
    const dr = new THREE.Mesh(doorGeo, matDoor);
    dr.position.set(Math.sin(b) * (FZI.outR - 0.3), deck + 3.3, Math.cos(b) * (FZI.outR - 0.3));
    dr.rotation.y = b + Math.PI;
    g.add(dr);
  }

  // Sala central: lámparas de techo y luz
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(1.2, 14), lightMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(Math.cos(a) * 15, ceil - 0.05, Math.sin(a) * 15);
    g.add(lamp);
  }
  const hallLight = new THREE.PointLight(0xffe6c8, 1.3, FZI.outR * 2.4, 1.3);
  hallLight.position.set(0, ceil - 1.5, 0);
  g.add(hallLight);

  // Ático: pared perimetral + techo bajo la tapa (con el ventanal de la gema)
  const wallTop = y0 + fzInCeilY(FZI.atticR) + 0.4;
  wallRing(g, FZI.atticR, attic, wallTop - attic, 36, phiDoor, matWall);
  const N = 22;
  const pts = [];
  for (let j = 0; j < N; j++) {
    const r = FZI.atticR * (1 - j / (N - 1));
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y0 + fzInCeilY(r)));
  }
  const inMask = fzWindowMask(FZI.atticR);
  const atticCeil = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 96),
    T(0xffffff, 0.15, 0.1, {
      map: fzAtticCeilTex(FZI.atticR),
      emissive: 0x7a66a0,
      emissiveIntensity: 0.7,
      alphaMap: inMask,
      alphaTest: 0.5,
      side: THREE.BackSide,
    })
  );
  g.add(atticCeil);
  const atticLight = new THREE.PointLight(0xfff0dc, 1.2, FZI.atticR * 2.4, 1.3);
  atticLight.position.set(0, attic + 9, 0);
  g.add(atticLight);

  // Tabique cabina / recuperación con puerta
  const S = Math.sqrt(FZI.atticR ** 2 - FZI.partF ** 2);
  const shape = new THREE.Shape();
  shape.moveTo(-S, 0);
  shape.lineTo(S, 0);
  for (let i = 0; i <= 24; i++) {
    const s = S - (i / 24) * 2 * S;
    shape.lineTo(s, y0 + fzInCeilY(Math.hypot(s, FZI.partF)) - attic + 0.3);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-FZI.partDoor, 0.01);
  hole.lineTo(FZI.partDoor, 0.01);
  hole.lineTo(FZI.partDoor, 7);
  hole.lineTo(-FZI.partDoor, 7);
  hole.closePath();
  shape.holes.push(hole);
  const part = new THREE.Mesh(new THREE.ShapeGeometry(shape), T(0xcdb2ec, 0.15, 0.1, { side: THREE.DoubleSide }));
  const [, pz] = L(0, FZI.partF);
  part.position.set(0, attic, pz);
  g.add(part);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.2, 0.9), matTrim);
    post.position.set(sx * FZI.partDoor, attic + 3.6, pz);
    g.add(post);
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.8), matDoor);
    leaf.position.set(sx * (FZI.partDoor + 2.1), attic + 3.4, pz - door * 0.08);
    leaf.rotation.y = door > 0 ? Math.PI : 0;
    g.add(leaf);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(2 * FZI.partDoor + 0.6, 0.6, 0.9), matTrim);
  top.position.set(0, attic + 7.2, pz);
  g.add(top);

  // Cabina: silla flotante mirando al ventanal + lámparas rojas colgantes
  const pod = freezerPod(T);
  const [px, pzz] = L(7, 17);
  pod.position.set(px, attic + 4.2, pzz);
  pod.rotation.y = door > 0 ? 0 : Math.PI;
  g.add(pod);
  const red = T(0xd8343a, 0.9, 0.35);
  const grey = T(0x9aa0ad, 0.5, 0.2);
  for (const sx of [-1, 1]) {
    const [lx, lz] = L(sx * 11, 12);
    const r = Math.hypot(lx, lz);
    const topY = y0 + fzInCeilY(r);
    const lampY = attic + 9.5;
    const shade = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), red);
    shade.position.set(lx, lampY, lz);
    g.add(inked(shade, 0.06));
    const capG = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 0.9, 16), grey);
    capG.position.set(lx, lampY + 0.4, lz);
    g.add(inked(capG, 0.05));
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, topY - lampY, 5), grey);
    cable.position.set(lx, (topY + lampY) / 2, lz);
    g.add(cable);
  }

  // Recuperación: tres tanques mirando al centro + ojos de buey azules
  for (const a of [-0.62, 0, 0.62]) {
    const th = Math.PI + a;
    const s = Math.sin(th) * 24;
    const f = Math.cos(th) * 24;
    const [tx, tz] = L(s, f);
    const tank = regenTank(T);
    tank.position.set(tx, attic, tz);
    tank.rotation.y = Math.atan2(-tx, -tz);
    g.add(tank);
  }
  const portMat = T(0x3550c8, 1.0, 0.35);
  for (const a of [-0.95, -0.31, 0.31, 0.95]) {
    const th = Math.PI + a;
    const [wx, wz] = L(Math.sin(th) * (FZI.atticR - 0.3), Math.cos(th) * (FZI.atticR - 0.3));
    const port = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), portMat);
    port.position.set(wx, attic + 5, wz);
    port.rotation.y = Math.atan2(-wx, -wz);
    g.add(port);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.3, 8, 28), grey);
    ring.position.copy(port.position);
    ring.rotation.y = port.rotation.y;
    g.add(ring);
  }
}

/** Nave esférica de Capsule Corp (alturas relativas a y0). Latitudes en grados. */
const CC = {
  R: 33,
  cY: 16.05,
  floorY: SHIP_DECK,
  doorHalfW: 5.5,
  doorH: 13,
  bandLo: -26,
  bandHi: -6,
  lineLat: [33, 35],
  capLat: 39,
  portLat: -16,
};
const DEG = Math.PI / 180;

/** ¿Punto (s lateral, y relativa) dentro del hueco de la puerta en arco? */
function ccInDoor(s, y) {
  const hw = CC.doorHalfW;
  if (Math.abs(s) >= hw || y < CC.floorY - 1) return false;
  return y < CC.floorY + CC.doorH - hw + Math.sqrt(hw * hw - s * s);
}

/** Máscara de puerta para un lathe esférico de radio Rr, latitudes [lat0, 90], puerta en u = 0.5. */
function ccDoorMask(Rr, lat0) {
  return canvasTex(1024, 512, (ctx, W, H) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    for (let y = 0; y < H; y++) {
      const lat = (90 - ((y + 0.5) / H) * (90 - lat0)) * DEG;
      const rh = Rr * Math.cos(lat);
      const yy = CC.cY + Rr * Math.sin(lat);
      for (let x = W * 0.42; x < W * 0.58; x++) {
        const dphi = ((x + 0.5) / W - 0.5) * Math.PI * 2;
        if (Math.cos(dphi) > 0 && ccInDoor(rh * Math.sin(dphi), yy)) ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

/** Pintura del casco: blanco, casquete y línea navy, banda negra, letras CAPSULE CORP. */
function ccHullTex() {
  return canvasTex(2048, 1024, (ctx, W, H) => {
    const row = (lat) => ((90 - lat) / 180) * H;
    ctx.fillStyle = "#eef1f5";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#24305e";
    ctx.fillRect(0, 0, W, row(CC.capLat));
    ctx.fillRect(0, row(CC.lineLat[1]), W, row(CC.lineLat[0]) - row(CC.lineLat[1]));
    ctx.fillStyle = "#1a1d29";
    ctx.fillRect(0, row(CC.bandHi), W, row(CC.bandLo) - row(CC.bandHi));
    ctx.fillStyle = "#120c08";
    for (const lat of [CC.capLat, CC.bandHi, CC.bandLo]) ctx.fillRect(0, row(lat) - 2, W, 4);
    // Letras: compensar el estiramiento horizontal del mapa a esa latitud
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = (str, lat, du, px, sx) => {
      ctx.save();
      ctx.translate(W * (0.5 + du), row(lat));
      ctx.scale(sx / Math.cos(lat * DEG), 1);
      ctx.font = `900 ${px}px "Arial Black", Arial, sans-serif`;
      ctx.lineWidth = px * 0.05;
      ctx.strokeStyle = "#120c08";
      ctx.fillStyle = "#14161c";
      ctx.fillText(str, 0, 0);
      ctx.strokeText(str, 0, 0);
      ctx.restore();
    };
    text("CAPSULE", 17, -0.01, 104, 0.78);
    text("CORP.", 5, 0.012, 44, 0.9);
    // Rayones de ilustración
    ctx.strokeStyle = "rgba(40,40,60,0.45)";
    ctx.lineWidth = 2;
    for (const [u, lat] of [[0.42, 24], [0.61, 10], [0.55, -40], [0.36, -50], [0.7, 28], [0.47, 30]]) {
      ctx.beginPath();
      ctx.moveTo(u * W, row(lat));
      ctx.lineTo(u * W + 10, row(lat) - 6);
      ctx.moveTo(u * W + 6, row(lat) + 4);
      ctx.lineTo(u * W + 14, row(lat) - 2);
      ctx.stroke();
    }
  });
}

/** Lathe esférico (centro cY, radio Rr) de lat0 a 90°, con la puerta en u = 0.5. */
function ccSphereGeo(y0, Rr, lat0, rows, segs, doorPhi) {
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    const a = (lat0 + (j / rows) * (90 - lat0)) * DEG;
    pts.push(new THREE.Vector2(Math.max(0.001, Rr * Math.cos(a)), y0 + CC.cY + Rr * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, segs, doorPhi - Math.PI, Math.PI * 2);
}

/** Casco + patas + ojos de buey + marco de puerta. */
function buildCapsuleHull(g, y0, door) {
  const T = (color, shine = 0.35, rim = 0.22, extra = {}) => toonMat({ color, ...extra }, shine, rim);
  const doorPhi = door > 0 ? 0 : Math.PI;
  const mask = ccDoorMask(CC.R, -90);
  const hull = new THREE.Mesh(
    ccSphereGeo(y0, CC.R, -90, 64, 96, doorPhi),
    T(0xffffff, 0.35, 0.2, { map: ccHullTex(), alphaMap: mask, alphaTest: 0.5 })
  );
  g.add(inked(hull, 0.35, mask));
  const c = y0 + CC.cY;
  const onSphere = (s, y, out = 0) => {
    const rh = Math.sqrt(Math.max(0, (CC.R + out) ** 2 - (y - c) ** 2));
    return new THREE.Vector3(s, y, door * Math.sqrt(Math.max(0, rh * rh - s * s)));
  };

  // Marco blanco de la compuerta (arco)
  const hw = CC.doorHalfW + 0.35;
  const yb = y0 + CC.floorY - 0.3;
  const ys = y0 + CC.floorY + CC.doorH - CC.doorHalfW;
  const path = [];
  for (let i = 0; i <= 6; i++) path.push(onSphere(-hw, yb + ((ys - yb) * i) / 6, 0.25));
  for (let i = 1; i < 16; i++) {
    const a = Math.PI - (i / 16) * Math.PI;
    path.push(onSphere(Math.cos(a) * hw, ys + Math.sin(a) * hw, 0.25));
  }
  for (let i = 0; i <= 6; i++) path.push(onSphere(hw, ys - ((ys - yb) * i) / 6, 0.25));
  const frame = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 80, 0.6, 8),
    T(0xf6f7fa, 0.4, 0.2)
  );
  g.add(inked(frame, 0.12));

  // Ojos de buey sobre la banda
  const portholes = [];
  const glass = T(0x3d78d0, 1.0, 0.4);
  const rimMat = T(0xdfe3ea, 0.4, 0.2);
  const capGeo = new THREE.SphereGeometry(2.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(2.45, 0.32, 8, 24);
  const pl = CC.portLat * DEG;
  for (let i = 0; i < 14; i++) {
    const a = ((i + 0.5) / 14) * Math.PI * 2;
    if (Math.cos(a) > Math.cos(0.42)) continue;
    const phi = doorPhi + a;
    const pg = new THREE.Group();
    const rh = CC.R * Math.cos(pl);
    pg.position.set(Math.sin(phi) * rh, c + CC.R * Math.sin(pl), Math.cos(phi) * rh);
    pg.lookAt(pg.position.clone().multiplyScalar(2).sub(new THREE.Vector3(0, c, 0)));
    const gl = new THREE.Mesh(capGeo, glass);
    gl.scale.z = 0.45;
    pg.add(inked(gl, 0.08));
    const rg = new THREE.Mesh(ringGeo, rimMat);
    pg.add(inked(rg, 0.06));
    g.add(pg);
    portholes.push(pg);
  }

  // Patas (cortas: la esfera apoya casi en el piso): paleta blanca, puntal gris azulado y pie redondo
  const legs = [];
  const white = T(0xf2f4f8, 0.4, 0.2);
  const strut = T(0x6c79b4, 0.6, 0.25);
  const footMat = T(0xd5d9e4, 0.4, 0.2);
  const V = (r, y) => new THREE.Vector2(r, y);
  const footGeo = new THREE.LatheGeometry([V(0.01, 0), V(3.0, 0.15), V(2.7, 0.9), V(1.2, 1.25), V(0.01, 1.3)], 24);
  for (const a of [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    const leg = new THREE.Group();
    leg.position.y = y0;
    leg.rotation.y = doorPhi + a;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 8), white);
    plate.position.set(0, 5.2, 32.5);
    plate.rotation.x = 0.14;
    leg.add(inked(plate, 0.1));
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 4.6, 10), strut);
    st.position.set(0, 2.6, 35.6);
    st.rotation.x = -0.3;
    leg.add(inked(st, 0.08));
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(0, 0, 36.4);
    leg.add(inked(foot, 0.08));
    g.add(leg);
    legs.push(leg);
  }

  return { hull, frame, portholes, legs };
}

/** Sala de gravedad (refs interior): piso rojo, consola perimetral, máquina central, ventanas ovaladas. */
function buildCapsuleInterior(g, y0, door) {
  const T = (color, shine = 0.3, rim = 0.2, extra = {}) => toonMat({ color, ...extra }, shine, rim);
  const doorPhi = door > 0 ? 0 : Math.PI;
  const F = y0 + CC.floorY;
  const c = y0 + CC.cY;
  const Ri = CC.R - 0.7;
  const lat0 = Math.asin((CC.floorY - 0.6 - CC.cY) / Ri) / DEG;

  // Piso de baldosas rojas con las marcas blancas (depósito)
  const floorTex = canvasTex(1024, 1024, (ctx, W) => {
    const k = W / 58;
    ctx.fillStyle = "#c93a4a";
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = "#8c2131";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 22; i++) {
      const p = i * 2.64 * k;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, W);
      ctx.moveTo(0, p);
      ctx.lineTo(W, p);
      ctx.stroke();
    }
    ctx.strokeStyle = "#f3eef4";
    ctx.lineWidth = 7;
    for (const [r, a0, a1] of [[9, 0, 7], [13.5, 0, 7], [21, 0.4, 2.2], [21, 3.6, 5.6], [24.5, 1.0, 1.9]]) {
      ctx.beginPath();
      ctx.arc(W / 2, W / 2, r * k, a0, a1);
      ctx.stroke();
    }
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(29, 72), T(0xffffff, 0.2, 0.1, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = F - 0.02;
  g.add(floor);

  // Pared interior (cáscara vista desde adentro) con la puerta recortada
  const inTex = canvasTex(1024, 512, (ctx, W, H) => {
    const row = (lat) => ((90 - lat) / (90 - lat0)) * H;
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#d9d2f2");
    gr.addColorStop(1, "#f6f2fd");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8f87c4";
    ctx.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const x = (i / 36) * W;
      ctx.beginPath();
      ctx.moveTo(x, row(80));
      ctx.lineTo(x, row(40));
      ctx.stroke();
    }
    for (const lat of [40, 62, 80, -4]) {
      ctx.beginPath();
      ctx.moveTo(0, row(lat));
      ctx.lineTo(W, row(lat));
      ctx.stroke();
    }
    ctx.fillStyle = "#c9c2e8";
    ctx.fillRect(0, row(-22), W, row(lat0) - row(-22));
  });
  const shell = new THREE.Mesh(
    ccSphereGeo(y0, Ri, lat0, 40, 96, doorPhi),
    T(0xffffff, 0.15, 0.1, {
      map: inTex,
      alphaMap: ccDoorMask(Ri, lat0),
      alphaTest: 0.5,
      side: THREE.BackSide,
      emissive: 0x6f6a96,
      emissiveIntensity: 0.55,
    })
  );
  g.add(shell);

  // Ventanas ovaladas por dentro (alineadas con los ojos de buey)
  const winMat = T(0x2f6fae, 0.9, 0.35, { emissive: 0x0c2a55, emissiveIntensity: 0.5 });
  const winRim = T(0xf3f1fa, 0.3, 0.2);
  const winGeo = new THREE.CircleGeometry(1, 28);
  const pl = CC.portLat * DEG;
  for (let i = 0; i < 14; i++) {
    const a = ((i + 0.5) / 14) * Math.PI * 2;
    if (Math.cos(a) > Math.cos(0.42)) continue;
    const phi = doorPhi + a;
    const rw = Ri - 0.55;
    const rh = rw * Math.cos(pl);
    const w = new THREE.Mesh(winGeo, winMat);
    w.position.set(Math.sin(phi) * rh, c + rw * Math.sin(pl), Math.cos(phi) * rh);
    w.lookAt(0, c, 0);
    w.scale.set(2.3, 3.4, 1);
    g.add(w);
    const rr = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 28), winRim);
    rr.position.copy(w.position);
    rr.quaternion.copy(w.quaternion);
    rr.scale.set(2.45, 3.55, 2);
    g.add(rr);
  }

  // Consola baja perimetral con ranuras de luz
  const ringMat = T(0xeef0f7, 0.35, 0.2);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff });
  const segs = 28;
  const step = (Math.PI * 2) / segs;
  const Rw = BASE_INNER_R - 0.3;
  const chord = 2 * Rw * Math.sin(step / 2) * 1.04;
  const pGeo = new THREE.BoxGeometry(chord, 2.3, 0.9);
  const sGeo = new THREE.BoxGeometry(chord * 0.55, 0.32, 0.1);
  for (let i = 0; i < segs; i++) {
    if (i === 0 || i === 1 || i === segs - 1) continue;
    const phi = doorPhi + i * step;
    const p = new THREE.Mesh(pGeo, ringMat);
    p.position.set(Math.sin(phi) * Rw, F + 1.15, Math.cos(phi) * Rw);
    p.rotation.y = phi;
    g.add(inked(p, 0.05));
    const sl = new THREE.Mesh(sGeo, slotMat);
    sl.position.set(Math.sin(phi) * (Rw - 0.47), F + 1.5, Math.cos(phi) * (Rw - 0.47));
    sl.rotation.y = phi;
    g.add(sl);
  }

  // Máquina de gravedad central: base con paneles, esfera, columna al techo
  const panelTex = canvasTex(512, 128, (ctx, W, H) => {
    ctx.fillStyle = "#eef0f6";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2a2e3e";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(i * 64 + 10, 18, 22, 30);
      ctx.fillRect(i * 64 + 38, 18, 14, 14);
      ctx.fillRect(i * 64 + 10, 70, 44, 10);
    }
    ctx.fillStyle = "#4fc0ff";
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 64 + 40, 38, 10, 8);
    ctx.strokeStyle = "#7a7f99";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, H);
      ctx.stroke();
    }
  });
  const white = T(0xf1f3f8, 0.45, 0.25);
  const grey = T(0xa9afc2, 0.5, 0.2);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 4.2, 32), T(0xffffff, 0.35, 0.2, { map: panelTex }));
  base.position.y = F + 2.1;
  g.add(inked(base, 0.06));
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.5, 32), grey);
  flange.position.y = F + 4.4;
  g.add(inked(flange, 0.05));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.7, 1.3, 24), white);
  neck.position.y = F + 5.3;
  g.add(neck);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(3.7, 32, 20), white);
  orb.position.y = F + 8.8;
  g.add(inked(orb, 0.06));
  const belt = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.28, 8, 40), grey);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = F + 8.8;
  g.add(belt);
  const neck2 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.5, 1.4, 24), white);
  neck2.position.y = F + 12.8;
  g.add(neck2);
  const topY = c + Ri;
  const colH = topY - (F + 13.4);
  const ribTex = canvasTex(64, 64, (ctx, W, H) => {
    ctx.fillStyle = "#e7e9f1";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#9da3b8";
    ctx.fillRect(0, 0, W, 10);
  }, [8, colH / 1.2]);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, colH, 20, 1, true), T(0xffffff, 0.3, 0.2, { map: ribTex }));
  col.position.y = F + 13.4 + colH / 2;
  g.add(col);

  // Consola de mando y sillas (fondo de la sala)
  const back = doorPhi + Math.PI;
  const desk = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 2.2, 24, 1, true, back - 0.3, 0.6), T(0xf1f3f8, 0.35, 0.2, { side: THREE.DoubleSide }));
  desk.position.y = F + 1.1;
  g.add(desk);
  const deskTop = new THREE.Mesh(new THREE.RingGeometry(21.2, 23.2, 24, 1, back - 0.3 - Math.PI / 2, 0.6), T(0xdfe3ec, 0.35, 0.2, { side: THREE.DoubleSide }));
  deskTop.rotation.x = -Math.PI / 2;
  deskTop.position.y = F + 2.25;
  g.add(deskTop);
  for (const da of [-0.12, 0.12]) {
    const a = back + da;
    const chair = new THREE.Group();
    chair.position.set(Math.sin(a) * 19.4, F, Math.cos(a) * 19.4);
    chair.rotation.y = a;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.6, 2.3), white);
    seat.position.y = 0.8;
    chair.add(inked(seat, 0.05));
    const rest = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.6, 0.6), white);
    rest.position.set(0, 2.6, -1.2);
    chair.add(inked(rest, 0.05));
    g.add(chair);
  }

  const light = new THREE.PointLight(0xfff1e6, 1.4, 90, 1.2);
  light.position.set(0, F + 18, 0);
  g.add(light);
}

export function addShipBases(scene) {
  clearShipWalk();
  buildCapsuleCorpBase(scene);
  buildFreezerBase(scene);
}
