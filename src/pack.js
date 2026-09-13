import shippedSculpts from "./data/sculpts.json";
import shippedLooks from "./data/looks.json";
import shippedAnims from "./data/anims.json";

const disk = {
  sculpts: { ...(shippedSculpts && typeof shippedSculpts === "object" ? shippedSculpts : {}) },
  looks: { ...(shippedLooks && typeof shippedLooks === "object" ? shippedLooks : {}) },
  anims: { ...(shippedAnims && typeof shippedAnims === "object" ? shippedAnims : {}) },
};

let pending = {};
let flushing = null;

export function getSculptMap() {
  return { ...disk.sculpts };
}
export function getLookMap() {
  return { ...disk.looks };
}
export function getAnimMap() {
  return { ...disk.anims };
}

export function setSculptMap(map) {
  disk.sculpts = map;
  pending.sculpts = map;
  scheduleFlush();
}
export function setLookMap(map) {
  disk.looks = map;
  pending.looks = map;
  scheduleFlush();
}
export function setAnimMap(map) {
  disk.anims = map;
  pending.anims = map;
  scheduleFlush();
}

function scheduleFlush() {
  if (!import.meta.env.DEV) return;
  queueMicrotask(() => {
    flushPack();
  });
}

export async function hydratePack() {
  if (!import.meta.env.DEV) return;
  const load = async (name) => {
    const r = await fetch(`/src/data/${name}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  };
  try {
    const [sculpts, looks, anims] = await Promise.all([
      load("sculpts.json"),
      load("looks.json"),
      load("anims.json"),
    ]);
    if (sculpts && typeof sculpts === "object") disk.sculpts = sculpts;
    if (looks && typeof looks === "object") disk.looks = looks;
    if (anims && typeof anims === "object") disk.anims = anims;
  } catch {
    /* queda el import */
  }
}

export async function flushPack() {
  if (!import.meta.env.DEV) return true;
  if (flushing) await flushing;
  const body = pending;
  pending = {};
  if (!Object.keys(body).length) return true;
  flushing = (async () => {
    const r = await fetch("/__namekusei-pack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return true;
  })()
    .catch((e) => {
      console.warn("No se pudo escribir src/data", e);
      return false;
    })
    .finally(() => {
      flushing = null;
    });
  return flushing;
}
