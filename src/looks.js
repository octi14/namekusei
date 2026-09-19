import { getLookMap, setLookMap } from "./pack.js";

const L = (body, skin, hair, hairC = 0x111111, kit = "gi", accent = 0x1565c0, extra = {}) => ({
  body, skin, hair, hairC, kit, accent, ...extra,
});

export const LOOK = {
  Gokú: L(0xf57c00, 0xf3d5c0, "goku", 0x1a1208, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0x0d47a1, boots: 0x0d47a1, undershirt: 0x5d4037, wrist: 0x1565c0, sleeves: 0xf57c00 }),
  Gohan: L(0xef6c00, 0xf3d5c0, "gohan", 0x2a1810, "gi", 0x6a1b9a, { pants: 0x6a1b9a, sash: 0x4a148c, boots: 0x4a148c, undershirt: 0x5d4037, wrist: 0x6a1b9a, sleeves: 0xef6c00 }),
  Krilin: L(0xff8f00, 0xf3d5c0, "bald", 0x111, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0x0d47a1, boots: 0x0d47a1, undershirt: 0x5d4037, wrist: 0xf5f5f5, sleeves: 0xff8f00 }),
  Pikoro: L(0x6a1b9a, 0x43a047, "piccolo", 0x1b5e20, "namek", 0xffc107, { cape: 0xfafafa, turban: true, sash: 0xffc107, pants: 0x6a1b9a, turbanC: 0xf5f5f5 }),
  Vegeta: L(0x0d47a1, 0xf3d5c0, "vegeta", 0x0a0a0a, "armor", 0xffffff, { suit: 0x0d47a1, scouter: 0xd32f2f, boots: 0xffffff, trim: 0xf5f5f5, pads: 0xf5f5f5, pants: 0x0d47a1 }),
  Nail: L(0x2e7d32, 0x66bb6a, "nail", 0x1b5e20, "namek", 0xffecb3, { cape: 0xfff8e1, sash: 0xffecb3, turban: false, pants: 0x2e7d32 }),
  Dendé: L(0xffb74d, 0xaed581, "dende", 0x33691e, "namek", 0xffecb3, { cape: 0xffecb3, sash: 0xffc107, pants: 0xffb74d }),
  Freezer: L(0xfafafa, 0xf3e5f5, "frieza", 0xce93d8, "frost", 0xab47bc, { boots: 0xce93d8 }),
  Zaabon: L(0xec407a, 0xf8bbd0, "zarbon", 0x81c784, "armor", 0xffffff, { suit: 0x4a148c, hairC: 0x66bb6a }),
  Dodoria: L(0xec407a, 0xf06292, "dodoria", 0x880e4f, "brute", 0x880e4f),
  Gurdo: L(0x9ccc65, 0xaed581, "guldo", 0x33691e, "armor", 0xffffff, { suit: 0x558b2f }),
  Rikum: L(0xff7043, 0xffab91, "recoome", 0xb71c1c, "armor", 0xffffff, { suit: 0xbf360c, helm: 0xb71c1c }),
  Yiz: L(0xef5350, 0xffcdd2, "jeice", 0xfafafa, "armor", 0xffffff, { suit: 0xb71c1c, hairC: 0xf5f5f5 }),
  Butter: L(0x29b6f6, 0x81d4fa, "burter", 0x01579b, "armor", 0xffffff, { suit: 0x0277bd }),
  Ginyu: L(0x7e57c2, 0xb39ddb, "ginyu", 0x4a148c, "armor", 0xffffff, { suit: 0x4a148c }),
  Kiwy: L(0x26a69a, 0x80cbc4, "cui", 0x004d40, "soldier", 0x37474f, { helm: 0x00695c }),
  Appule: L(0xab47bc, 0xce93d8, "appule", 0x6a1b9a, "soldier", 0x37474f, { helm: 0x8e24aa }),
  "Ten Shin Han": L(0x2e7d32, 0xf3d5c0, "tien", 0x111, "gi", 0x1b5e20, {
    pants: 0x1b5e20, sash: 0xffeb3b, boots: 0x212121, thirdEye: true, undershirt: 0xfafafa, wrist: 0x1b5e20, sleeves: 0x2e7d32,
  }),
  Yamcha: L(0xef6c00, 0xf3d5c0, "goku", 0x1a1208, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0xffeb3b, boots: 0x0d47a1, undershirt: 0x5d4037, wrist: 0x1565c0 }),
  Chaoz: L(0xfafafa, 0xffe0b2, "bald", 0x111, "gi", 0xeeeeee, { pants: 0xf5f5f5, sash: 0x1565c0, boots: 0x37474f, undershirt: 0xeeeeee, wrist: 0x1565c0 }),
  Yajirobee: L(0xef6c00, 0xf3d5c0, "bald", 0x111, "brute", 0xbf360c, { pants: 0x6d4c41, boots: 0x3e2723, sleeves: 0xef6c00 }),
  Kami: L(0x2e7d32, 0x66bb6a, "piccolo", 0x1b5e20, "namek", 0xffc107, { cape: 0xfafafa, sash: 0xffc107 }),
  Nappa: L(0x37474f, 0xf3d5c0, "bald", 0x111, "brute", 0xffffff, { suit: 0x455a64, boots: 0xffffff }),
  Raditz: L(0x0d47a1, 0xf3d5c0, "raditz", 0x1a1208, "armor", 0xffffff, { suit: 0x1565c0, scouter: 0xd32f2f, boots: 0xffffff }),
  Saibaman: L(0x558b2f, 0x7cb342, "bald", 0x33691e, "brute", 0x1b5e20),
  Trunks: L(0x1565c0, 0xf3d5c0, "trunks", 0x7e57c2, "armor", 0xffffff, { suit: 0x1565c0, boots: 0xffffff }),
  "Gohan del futuro": L(0xef6c00, 0xf3d5c0, "goku", 0x1a1208, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0x0d47a1, boots: 0x0d47a1, undershirt: 0x5d4037, wrist: 0x1565c0, sleeves: 0xef6c00 }),
  Bardock: L(0x0d47a1, 0xf3d5c0, "goku", 0x1a1208, "armor", 0xffffff, { suit: 0x1565c0, scouter: 0xd32f2f, boots: 0xffffff, trim: 0xf5f5f5, pads: 0xf5f5f5 }),
  "Rey Vegeta": L(0x0d47a1, 0xf3d5c0, "vegeta", 0x0a0a0a, "armor", 0xffffff, { suit: 0x0d47a1, scouter: 0xffd54f, boots: 0xffffff, trim: 0xffecb3, pads: 0xfff8e1 }),
  Tooma: L(0xb71c1c, 0xf3d5c0, "vegeta", 0x3e2723, "armor", 0xffffff, { suit: 0xb71c1c, scouter: 0xd32f2f, boots: 0xffffff }),
  Paragus: L(0x455a64, 0xe0c8a0, "bald", 0x111, "armor", 0xffffff, { suit: 0x37474f, boots: 0xffffff, trim: 0xeeeeee }),
  "Mr. Satan": L(0xc62828, 0xf3d5c0, "bald", 0x111, "gi", 0xc62828, { pants: 0x212121, sash: 0xffeb3b, boots: 0x212121, undershirt: 0xfafafa, wrist: 0xc62828 }),
  Cell: L(0x33691e, 0x9ccc65, "frieza", 0x1b5e20, "frost", 0x7cb342, { boots: 0x1b5e20 }),
  "Nº16": L(0x455a64, 0xb0bec5, "bald", 0x111, "brute", 0x1b5e20, { boots: 0x37474f }),
  "Nº17": L(0x212121, 0xf3d5c0, "goku", 0x111111, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0xffeb3b, boots: 0x212121 }),
  "Nº18": L(0x212121, 0xf3d5c0, "gohan", 0xffe082, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0xffeb3b, boots: 0x212121 }),
  "Nº19": L(0xc62828, 0xffcdd2, "bald", 0x111, "brute", 0xb71c1c),
  "Dr. Gero": L(0x546e7a, 0xbcaaa4, "helm", 0x37474f, "soldier", 0x90a4ae, { helm: 0x455a64 }),
  "Cell Jr.": L(0x558b2f, 0xaed581, "frieza", 0x33691e, "frost", 0x8bc34a, { boots: 0x33691e }),
  // Guerreros genéricos (editables en F2 / anim editor)
  namek: L(0x43a047, 0x66bb6a, "nail", 0x1b5e20, "namek", 0xffc107, {
    cape: 0xfffde7, sash: 0xffc107, pants: 0x2e7d32,
  }),
  terrícola: L(0xef6c00, 0xf3d5c0, "goku", 0x1a1208, "gi", 0x1565c0, {
    pants: 0x1565c0, sash: 0xffeb3b, boots: 0x0d47a1, undershirt: 0x5d4037, wrist: 0x1565c0, sleeves: 0xef6c00,
  }),
  soldado: L(0x546e7a, 0xb0bec5, "helm", 0x263238, "soldier", 0x90a4ae, {
    helm: 0x37474f, suit: 0x546e7a, boots: 0x37474f,
  }),
  saiyajin: L(0x1565c0, 0xf3d5c0, "goku", 0x1a1208, "armor", 0xffffff, {
    suit: 0x1565c0, trim: 0xffffff, scouter: 0xd32f2f, boots: 0xffffff, pads: 0xf5f5f5,
  }),
};

const CELL_JR_TINT = [0x9ccc65, 0x66bb6a, 0xaed581, 0x7cb342, 0xc5e1a5, 0x81c784, 0xdce775, 0x4db6ac, 0xba68c8, 0xff8a65];

const SOLDIER_BODY = [0x546e7a, 0x607d8b, 0x455a64, 0x78909c, 0x37474f];

const LOOK_MAP_KEY = "namekusei.lookMap";

try {
  localStorage.removeItem(LOOK_MAP_KEY);
} catch {
  /* ignore */
}

/** Id de plantilla (sculpt / look / anim) para un nombre en juego. */
export function lookTemplateId(nombre, faccion = "z", mapId = "namek") {
  if (!nombre) return null;
  if (LOOK[nombre]) return nombre;
  if (nombre.startsWith("Cell Jr.")) return "Cell Jr.";
  if (nombre.startsWith("Saibaman")) return "Saibaman";
  if (nombre.startsWith("Guerrero namekiano")) return "namek";
  if (nombre.startsWith("Guerrero terrícola")) return "terrícola";
  if (nombre.startsWith("Soldado saiyajin")) return "saiyajin";
  if (nombre.startsWith("Soldado de Freezer")) return "soldado";
  if (mapId === "earth" || mapId === "cell" || mapId === "city") {
    if (faccion === "f" && mapId === "earth") return "saiyajin";
    return "terrícola";
  }
  if (mapId === "vegeta") return faccion === "z" ? "saiyajin" : "soldado";
  return faccion === "z" ? "namek" : "soldado";
}

export function loadSavedLook(id) {
  if (!id) return {};
  const saved = getLookMap()[id];
  return saved && typeof saved === "object" ? saved : {};
}

export function saveLook(id, look) {
  if (!id || !look) return;
  const map = getLookMap();
  const { who, ...rest } = look;
  map[id] = rest;
  setLookMap(map);
}

export function lookFor(nombre, faccion, id, mapId = "namek") {
  const tid = lookTemplateId(nombre, faccion, mapId);
  const n = parseInt(String(id).split("-")[1], 10) || 0;

  if (tid === "Cell Jr.") {
    const tint = CELL_JR_TINT[n % CELL_JR_TINT.length];
    return {
      ...LOOK["Cell Jr."],
      ...loadSavedLook("Cell Jr."),
      who: "Cell Jr.",
      skin: tint,
      body: tint,
      accent: tint,
    };
  }

  if (tid && LOOK[tid]) {
    const saved = loadSavedLook(tid);
    const base = { ...LOOK[tid], ...saved, who: tid };
    if (tid === "soldado" && saved.body == null) {
      base.body = SOLDIER_BODY[n % SOLDIER_BODY.length];
      base.suit = base.body;
    } else if (tid === "terrícola" && saved.body == null) {
      base.body = n % 2 ? 0x1565c0 : 0xef6c00;
      base.sleeves = base.body;
      if (saved.hair == null) base.hair = n % 3 === 0 ? "bald" : "goku";
    } else if (tid === "saiyajin" && saved.suit == null) {
      if (saved.hair == null) base.hair = n % 2 ? "vegeta" : "goku";
      base.suit = n % 3 === 0 ? 0x0d47a1 : 0x1565c0;
      base.body = base.suit;
    }
    return base;
  }

  return {
    who: tid || "soldado",
    body: 0x546e7a,
    skin: 0xb0bec5,
    hair: "helm",
    hairC: 0x263238,
    kit: "soldier",
    accent: 0x90a4ae,
    helm: 0x37474f,
  };
}
