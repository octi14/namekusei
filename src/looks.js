const L = (body, skin, hair, hairC = 0x111111, kit = "gi", accent = 0x1565c0, extra = {}) => ({
  body, skin, hair, hairC, kit, accent, ...extra,
});

export const LOOK = {
  Gokú: L(0xf57c00, 0xe8b896, "goku", 0x1a1208, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0x0d47a1, boots: 0x0d47a1 }),
  Gohan: L(0xef6c00, 0xe8b896, "gohan", 0x2a1810, "gi", 0x6a1b9a, { pants: 0x6a1b9a, sash: 0x4a148c, boots: 0x4a148c }),
  Krilin: L(0xff8f00, 0xe8b896, "bald", 0x111, "gi", 0x1565c0, { pants: 0x1565c0, sash: 0x0d47a1, boots: 0x0d47a1 }),
  Pikoro: L(0x6a1b9a, 0x43a047, "piccolo", 0x1b5e20, "namek", 0xffc107, { cape: 0xfafafa, turban: true, sash: 0xffc107 }),
  Vegeta: L(0x0d47a1, 0xe8b896, "vegeta", 0x0a0a0a, "armor", 0xffffff, { suit: 0x0d47a1, scouter: 0xd32f2f, boots: 0xffffff }),
  Nail: L(0x2e7d32, 0x66bb6a, "nail", 0x1b5e20, "namek", 0xffecb3, { cape: 0xfff8e1, sash: 0xffecb3, turban: false }),
  Dendé: L(0xffb74d, 0xaed581, "dende", 0x33691e, "namek", 0xffecb3, { cape: 0xffecb3, sash: 0xffc107 }),
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
};

const SOLDIER_BODY = [0x546e7a, 0x607d8b, 0x455a64, 0x78909c, 0x37474f];

export function lookFor(nombre, faccion, id) {
  if (LOOK[nombre]) return { ...LOOK[nombre], who: nombre };
  if (faccion === "z") {
    return {
      who: "namek",
      body: 0x43a047,
      skin: 0x66bb6a,
      hair: "nail",
      hairC: 0x1b5e20,
      kit: "namek",
      accent: 0xffc107,
      cape: 0xfffde7,
      sash: 0xffc107,
    };
  }
  const n = parseInt(String(id).split("-")[1], 10) || 0;
  return {
    who: "soldado",
    body: SOLDIER_BODY[n % SOLDIER_BODY.length],
    skin: 0xb0bec5,
    hair: "helm",
    hairC: 0x263238,
    kit: "soldier",
    accent: 0x90a4ae,
    helm: 0x37474f,
  };
}
