/** vel = velocidad base en m/s; caminar y correr la escalan en Personaje.move() (personaje.js). */
const g = (hp, ki, atk, def, vel, h) => ({
  hpMax: hp, kiMax: ki, ataque: atk, defensa: def, velocidad: vel, altura: h,
});

/** Stats únicos para personajes que se repiten entre mapas. */
export const SHARED = {
  Gokú: g(1200, 240, 26, 15, 15, 1.18),
  Gohan: g(1050, 200, 24, 12, 14, 0.95),
  Krilin: g(950, 170, 20, 12, 13, 0.92),
  Trunks: g(1100, 200, 24, 13, 15, 1.14),
  Pikoro: g(1100, 180, 22, 14, 14, 1.38),
  "Ten Shin Han": g(1050, 160, 20, 15, 13, 1.18),
  Yamcha: g(1050, 160, 20, 10, 13, 1.18),
  Chaoz: g(950, 155, 18, 8, 12, 0.70),
  Dendé: g(900, 155, 18, 8, 12, 0.78),

  Vegeta: g(1300, 200, 24, 16, 14, 1.18),
  Nappa: g(1100, 185, 23, 13, 14, 1.50),
  Raditz: g(1050, 165, 22, 12, 14, 1.40),

  Freezer: g(1300, 240, 26, 15, 16, 1.25),
  Zaabon: g(1100, 190, 23, 13, 13, 1.25),
  Dodoria: g(1100, 190, 22, 13, 13, 1.15),
  Gurdo: g(900, 140, 20, 12, 11, 0.80),
  Rikum: g(1100, 180, 24, 13, 14, 1.45),
  Yiz: g(1000, 170, 21, 13, 14, 1.12),
  Butter: g(1000, 180, 22, 13, 13, 1.44),
  Ginyu: g(1200, 200, 24, 13, 15, 1.48),
  Kiwy: g(950, 150, 20, 10, 11, 1.05),
  Appule: g(900, 140, 20, 9, 11, 1.05),

  Cell: g(1200, 240, 26, 14, 15, 1.38),
  "Nº16": g(1100, 200, 23, 15, 11, 1.65),
  "Nº17": g(1100, 200, 22, 12, 15, 1.10),
  "Nº18": g(1100, 200, 22, 12, 15, 1.10),
  "Nº19": g(1100, 180, 20, 12, 12, 1.22),
  "Dr. Gero": g(1000, 175, 20, 11, 12, 1.05),
};

export const NAMED_Z = {
  Gokú: SHARED.Gokú,
  Gohan: SHARED.Gohan,
  Krilin: SHARED.Krilin,
  Pikoro: SHARED.Pikoro,
  Vegeta: SHARED.Vegeta,
  Nail: g(1000, 160, 20, 12, 12, 1.42),
  Dendé: SHARED.Dendé,
};

export const NAMED_F = {
  Freezer: SHARED.Freezer,
  Zaabon: SHARED.Zaabon,
  Dodoria: SHARED.Dodoria,
  Gurdo: SHARED.Gurdo,
  Rikum: SHARED.Rikum,
  Yiz: SHARED.Yiz,
  Butter: SHARED.Butter,
  Ginyu: SHARED.Ginyu,
  Kiwy: SHARED.Kiwy,
  Appule: SHARED.Appule,
};

export const NAMED_Z_EARTH = {
  Gokú: SHARED.Gokú,
  Gohan: SHARED.Gohan,
  Pikoro: SHARED.Pikoro,
  Krilin: SHARED.Krilin,
  "Ten Shin Han": SHARED["Ten Shin Han"],
  Yamcha: SHARED.Yamcha,
  Chaoz: SHARED.Chaoz,
  Yajirobee: g(850, 135, 19, 9, 11, 1.10),
  Kami: g(1000, 160, 19, 10, 11, 1.50),
};

export const NAMED_F_EARTH = {
  Vegeta: SHARED.Vegeta,
  Nappa: SHARED.Nappa,
  Raditz: SHARED.Raditz,
};

export const GENERIC_Z = g(900, 140, 19, 9, 11, 1.2);
export const GENERIC_F = g(900, 140, 19, 9, 11, 1.05);
export const GENERIC_Z_EARTH = g(900, 140, 19, 9, 11, 1.1);
export const GENERIC_F_EARTH = g(900, 140, 19, 9, 11, 1.12);
export const SAIBAMAN = g(900, 140, 19, 9, 11, 0.80);

/** Curanderos: ki/s al canalizar; boost = × a HP_REGEN del aliado; range = alcance del rayo. */
export const HEALERS = {
  Dendé: { ki: 11, boost: 4.4, range: 16 },
  Kami: { ki: 13, boost: 3.6, range: 14 },
  Pikoro: { ki: 16, boost: 2.7, range: 11 },
};

export function healerSpec(nombre) {
  return HEALERS[nombre] || null;
}

export const NAMED_Z_CELL = {
  Gokú: SHARED.Gokú,
  Gohan: SHARED.Gohan,
  Vegeta: SHARED.Vegeta,
  Trunks: SHARED.Trunks,
  Krilin: SHARED.Krilin,
  "Ten Shin Han": SHARED["Ten Shin Han"],
  Chaoz: SHARED.Chaoz,
  Yamcha: SHARED.Yamcha,
  Pikoro: SHARED.Pikoro,
  Dendé: SHARED.Dendé,
  "Mr. Satan": g(900, 130, 17, 9, 11, 1.25),
};

export const NAMED_F_CELL = {
  Cell: SHARED.Cell,
  "Nº16": SHARED["Nº16"],
  "Nº17": SHARED["Nº17"],
  "Nº18": SHARED["Nº18"],
  "Nº19": SHARED["Nº19"],
  "Dr. Gero": SHARED["Dr. Gero"],
  "Cell Jr. 1": g(950, 150, 20, 9, 14, 0.80),
  "Cell Jr. 2": g(950, 150, 20, 9, 14, 0.80),
  "Cell Jr. 3": g(950, 150, 20, 9, 14, 0.80),
  "Cell Jr. 4": g(950, 150, 20, 9, 14, 0.80),
  "Cell Jr. 5": g(950, 150, 20, 9, 14, 0.80),
  "Cell Jr. 6": g(950, 150, 20, 9, 14, 0.80),
  "Cell Jr. 7": g(950, 150, 20, 9, 14, 0.80),
};

export const CELL_JR = g(900, 140, 19, 9, 14, 0.80);

export const NAMED_Z_CITY = {
  Trunks: SHARED.Trunks,
  "Gohan del futuro": g(1150, 210, 25, 13, 14, 1.18),
  Pikoro: SHARED.Pikoro,
  Vegeta: SHARED.Vegeta,
  "Ten Shin Han": SHARED["Ten Shin Han"],
  Chaoz: SHARED.Chaoz,
  Yamcha: SHARED.Yamcha,
  Krilin: SHARED.Krilin,
};

export const NAMED_F_CITY = {
  "Nº17": SHARED["Nº17"],
  "Nº18": SHARED["Nº18"],
  "Nº16": SHARED["Nº16"],
  Cell: SHARED.Cell,
  "Nº19": SHARED["Nº19"],
  "Dr. Gero": SHARED["Dr. Gero"],
};

export const NAMED_Z_VEGETA = {
  Vegeta: SHARED.Vegeta,
  Nappa: SHARED.Nappa,
  Raditz: SHARED.Raditz,
  Bardock: g(1080, 175, 23, 12, 14, 1.18),
  "Rey Vegeta": g(1120, 185, 23, 14, 13, 1.22),
  Tooma: g(1020, 160, 21, 12, 13, 1.20),
  Paragus: g(980, 155, 20, 11, 14, 1.16),
};

export const NAMED_F_VEGETA = {
  Freezer: SHARED.Freezer,
  Zaabon: SHARED.Zaabon,
  Dodoria: SHARED.Dodoria,
  Kiwy: SHARED.Kiwy,
  Appule: SHARED.Appule,
  Gurdo: SHARED.Gurdo,
  Rikum: SHARED.Rikum,
  Yiz: SHARED.Yiz,
  Butter: SHARED.Butter,
  Ginyu: SHARED.Ginyu,
};

export function cloneStats(s) {
  return {
    hpMax: s.hpMax,
    kiMax: s.kiMax,
    ataque: s.ataque,
    defensa: s.defensa,
    velocidad: s.velocidad,
    altura: s.altura,
    hp: s.hpMax,
    ki: s.kiMax,
  };
}
