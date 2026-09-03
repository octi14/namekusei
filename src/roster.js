import { TEAM_SIZE } from "./config.js";
import { NAMED_Z, NAMED_F, GENERIC_Z, GENERIC_F, cloneStats } from "./stats.js";
import { lookFor } from "./looks.js";

export function buildRoster() {
  const zNames = Object.keys(NAMED_Z);
  const fNames = Object.keys(NAMED_F);
  const z = [];
  const f = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    if (i < zNames.length) {
      const n = zNames[i];
      z.push({
        id: `z-${i}`,
        nombre: n,
        faccion: "z",
        stats: cloneStats(NAMED_Z[n]),
        look: lookFor(n, "z", `z-${i}`),
      });
    } else {
      z.push({
        id: `z-${i}`,
        nombre: `Guerrero namekiano ${i - zNames.length + 1}`,
        faccion: "z",
        stats: cloneStats(GENERIC_Z),
        look: lookFor("namek", "z", `z-${i}`),
      });
    }
    if (i < fNames.length) {
      const n = fNames[i];
      f.push({
        id: `f-${i}`,
        nombre: n,
        faccion: "f",
        stats: cloneStats(NAMED_F[n]),
        look: lookFor(n, "f", `f-${i}`),
      });
    } else {
      f.push({
        id: `f-${i}`,
        nombre: `Soldado de Freezer ${i - fNames.length + 1}`,
        faccion: "f",
        stats: cloneStats(GENERIC_F),
        look: lookFor("soldado", "f", `f-${i}`),
      });
    }
  }
  return [...z, ...f];
}
