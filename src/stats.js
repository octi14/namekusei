const g = (hp, ki, atk, def, vel, h) => ({
  hpMax: hp, kiMax: ki, ataque: atk, defensa: def, velocidad: vel, altura: h,
});

/** Stats únicos para personajes que se repiten entre mapas. */
export const SHARED = {
  Gokú: g(2000, 190, 26, 17, 15, 1.18),
  Gohan: g(1600, 150, 24, 18, 14, 0.92),
  Krilin: g(1400, 120, 20, 15, 13, 0.82),
  Pikoro: g(1800, 170, 22, 19, 14, 1.38),
  "Ten Shin Han": g(1500, 140, 20, 15, 13, 1.12),
  Yamcha: g(1400, 120, 20, 15, 13, 1.08),
  Chaoz: g(1300, 135, 17, 14, 12, 0.55),
  Dendé: g(1300, 155, 17, 14, 12, 0.78),
};

export const NAMED_Z = {
  Gokú: SHARED.Gokú,
  Gohan: SHARED.Gohan,
  Krilin: SHARED.Krilin,
  Pikoro: SHARED.Pikoro,
  Vegeta: g(1900, 180, 24, 16, 14, 1.08),
  Nail: g(1700, 155, 20, 18, 12, 1.42),
  Dendé: SHARED.Dendé,
};

export const NAMED_F = {
  Freezer: g(2000, 195, 26, 19, 16, 1.12),
  Zaabon: g(1700, 130, 23, 14, 13, 1.05),
  Dodoria: g(1700, 115, 22, 16, 13, 1.15),
  Gurdo: g(1300, 140, 19, 12, 10, 0.78),
  Rikum: g(1700, 130, 24, 16, 14, 1.28),
  Yiz: g(1500, 120, 21, 13, 14, 1.02),
  Butter: g(1500, 125, 22, 13, 16, 1.04),
  Ginyu: g(1800, 160, 24, 17, 15, 1.48),
  Kiwy: g(1400, 110, 20, 13, 11, 1.0),
  Appule: g(1400, 105, 20, 12, 11, 0.98),
};

export const NAMED_Z_EARTH = {
  Gokú: SHARED.Gokú,
  Gohan: SHARED.Gohan,
  Pikoro: SHARED.Pikoro,
  Krilin: SHARED.Krilin,
  "Ten Shin Han": SHARED["Ten Shin Han"],
  Yamcha: SHARED.Yamcha,
  Chaoz: SHARED.Chaoz,
  Yajirobee: g(1250, 95, 18, 14, 11, 1.05),
  Kami: g(1450, 160, 19, 16, 11, 1.48),
};

export const NAMED_F_EARTH = {
  Vegeta: g(1900, 180, 25, 16, 14, 1.08),
  Nappa: g(1750, 140, 23, 17, 13, 1.45),
  Raditz: g(1650, 145, 22, 15, 14, 1.32),
};

export const GENERIC_Z = g(1300, 105, 19, 12, 11, 1.2);
export const GENERIC_F = g(1300, 100, 19, 12, 12, 1.05);
export const GENERIC_Z_EARTH = g(1300, 105, 19, 12, 12, 1.1);
export const GENERIC_F_EARTH = g(1300, 110, 19, 13, 12, 1.12);
export const SAIBAMAN = g(1300, 90, 19, 12, 12, 0.62);

export const NAMED_Z_CELL = {
  Gokú: SHARED.Gokú,
  Gohan: SHARED.Gohan,
  Vegeta: g(1980, 190, 25, 18, 15, 1.08),
  Trunks: g(1900, 180, 24, 17, 15, 1.14),
  Krilin: SHARED.Krilin,
  "Ten Shin Han": SHARED["Ten Shin Han"],
  Chaoz: SHARED.Chaoz,
  Yamcha: SHARED.Yamcha,
  Pikoro: SHARED.Pikoro,
  Dendé: SHARED.Dendé,
  "Mr. Satan": g(1200, 80, 17, 13, 10, 1.15),
};

export const NAMED_F_CELL = {
  Cell: g(2100, 200, 26, 20, 15, 1.28),
  "Nº16": g(1900, 100, 23, 21, 11, 1.55),
  "Nº17": g(1800, 170, 22, 17, 15, 1.12),
  "Nº18": g(1780, 165, 22, 16, 15, 1.08),
  "Nº19": g(1550, 110, 20, 16, 10, 1.22),
  "Dr. Gero": g(1480, 125, 20, 15, 10, 1.05),
  "Cell Jr. 1": g(1550, 125, 20, 14, 14, 0.72),
  "Cell Jr. 2": g(1550, 125, 20, 14, 14, 0.72),
  "Cell Jr. 3": g(1550, 125, 20, 14, 14, 0.72),
  "Cell Jr. 4": g(1550, 125, 20, 14, 14, 0.72),
  "Cell Jr. 5": g(1550, 125, 20, 14, 14, 0.72),
  "Cell Jr. 6": g(1550, 125, 20, 14, 14, 0.72),
  "Cell Jr. 7": g(1550, 125, 20, 14, 14, 0.72),
};

export const CELL_JR = g(1500, 120, 19, 13, 14, 0.72);

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
