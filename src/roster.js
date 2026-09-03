import { TEAM_SIZE } from "./config.js";
import {
  NAMED_Z,
  NAMED_F,
  NAMED_Z_EARTH,
  NAMED_F_EARTH,
  NAMED_Z_CELL,
  NAMED_F_CELL,
  GENERIC_Z,
  GENERIC_F,
  GENERIC_Z_EARTH,
  GENERIC_F_EARTH,
  SAIBAMAN,
  CELL_JR,
  cloneStats,
} from "./stats.js";
import { lookFor } from "./looks.js";

const SSJ = new Set(["Gokú", "Gohan", "Vegeta", "Trunks"]);

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

export function buildRoster(mapId = "namek") {
  const zNamed = mapId === "cell" ? NAMED_Z_CELL : mapId === "earth" ? NAMED_Z_EARTH : NAMED_Z;
  const fNamed = mapId === "cell" ? NAMED_F_CELL : mapId === "earth" ? NAMED_F_EARTH : NAMED_F;
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
        mapId === "earth" || mapId === "cell"
          ? `Guerrero terrícola ${k}`
          : `Guerrero namekiano ${k}`;
      z.push({
        id: `z-${i}`,
        nombre: n,
        faccion: "z",
        stats: cloneStats(mapId === "namek" ? GENERIC_Z : GENERIC_Z_EARTH),
        look: lookFor(mapId === "namek" ? "namek" : "terrícola", "z", `z-${i}`, mapId),
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
    } else if (mapId === "cell") {
      f.push({
        id: `f-${i}`,
        nombre: `Cell Jr. ${i - fNames.length + 8}`,
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
