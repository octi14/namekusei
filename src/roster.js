import { TEAM_SIZE } from "./config.js";
import {
  NAMED_Z,
  NAMED_F,
  NAMED_Z_EARTH,
  NAMED_F_EARTH,
  NAMED_Z_CELL,
  NAMED_F_CELL,
  NAMED_Z_CITY,
  NAMED_F_CITY,
  NAMED_Z_VEGETA,
  NAMED_F_VEGETA,
  GENERIC_Z,
  GENERIC_F,
  GENERIC_Z_EARTH,
  GENERIC_F_EARTH,
  SAIBAMAN,
  CELL_JR,
  cloneStats,
  SHARED,
} from "./stats.js";
import { lookFor } from "./looks.js";

const SSJ = new Set(["Gokú", "Gohan", "Gohan del futuro", "Vegeta", "Trunks"]);

function namedEntry(n, fac, i, stats, mapId) {
  return {
    id: `${fac}-${i}`,
    nombre: n,
    faccion: fac,
    stats: cloneStats(stats),
    look: lookFor(n, fac, `${fac}-${i}`, mapId),
    canSsj: SSJ.has(n),
  };
}

export function buildSandboxRoster(who, mapId = "namek") {
  const stats =
    SHARED[who] ||
    NAMED_Z[who] ||
    NAMED_F[who] ||
    NAMED_Z_EARTH[who] ||
    NAMED_F_EARTH[who] ||
    NAMED_Z_CELL[who] ||
    NAMED_F_CELL[who] ||
    NAMED_Z_CITY[who] ||
    NAMED_F_CITY[who] ||
    NAMED_Z_VEGETA[who] ||
    NAMED_F_VEGETA[who] ||
    (who === "Saibaman" ? SAIBAMAN : who === "Cell Jr." ? CELL_JR : who === "soldado" ? GENERIC_F : who === "saiyajin" || who === "terrícola" ? GENERIC_Z_EARTH : GENERIC_Z);
  return [namedEntry(who, "z", 0, stats, mapId)];
}

export function buildRoster(mapId = "namek") {
  const zNamed =
    mapId === "city" ? NAMED_Z_CITY : mapId === "vegeta" ? NAMED_Z_VEGETA : mapId === "cell" ? NAMED_Z_CELL : mapId === "earth" ? NAMED_Z_EARTH : NAMED_Z;
  const fNamed =
    mapId === "city" ? NAMED_F_CITY : mapId === "vegeta" ? NAMED_F_VEGETA : mapId === "cell" ? NAMED_F_CELL : mapId === "earth" ? NAMED_F_EARTH : NAMED_F;
  const zNames = Object.keys(zNamed);
  const fNames = Object.keys(fNamed);
  const z = [];
  const f = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    if (i < zNames.length) {
      z.push(namedEntry(zNames[i], "z", i, zNamed[zNames[i]], mapId));
    } else {
      const k = i - zNames.length + 1;
      const n =
        mapId === "vegeta" ? `Soldado saiyajin ${k}` : mapId === "namek" ? `Guerrero namekiano ${k}` : `Guerrero terrícola ${k}`;
      z.push({
        id: `z-${i}`,
        nombre: n,
        faccion: "z",
        stats: cloneStats(mapId === "namek" ? GENERIC_Z : mapId === "vegeta" ? GENERIC_F_EARTH : GENERIC_Z_EARTH),
        look: lookFor(mapId === "namek" ? "namek" : mapId === "vegeta" ? "saiyajin" : "terrícola", "z", `z-${i}`, mapId),
      });
    }
    if (i < fNames.length) {
      f.push(namedEntry(fNames[i], "f", i, fNamed[fNames[i]], mapId));
    } else if (mapId === "earth" && i < fNames.length + 6) {
      const k = i - fNames.length + 1;
      f.push({
        id: `f-${i}`,
        nombre: `Saibaman ${k}`,
        faccion: "f",
        stats: cloneStats(SAIBAMAN),
        look: lookFor("Saibaman", "f", `f-${i}`, mapId),
      });
    } else if (mapId === "cell" || mapId === "city") {
      f.push({
        id: `f-${i}`,
        nombre: `Cell Jr. ${i - fNames.length + (mapId === "cell" ? 8 : 1)}`,
        faccion: "f",
        stats: cloneStats(CELL_JR),
        look: lookFor("Cell Jr.", "f", `f-${i}`, mapId),
      });
    } else {
      const k = i - fNames.length - (mapId === "earth" ? 6 : 0) + 1;
      f.push({
        id: `f-${i}`,
        nombre: mapId === "earth" ? `Soldado saiyajin ${k}` : `Soldado de Freezer ${k}`,
        faccion: "f",
        stats: cloneStats(mapId === "earth" ? GENERIC_F_EARTH : GENERIC_F),
        look: lookFor(mapId === "earth" ? "saiyajin" : "soldado", "f", `f-${i}`, mapId),
      });
    }
  }
  return [...z, ...f];
}
