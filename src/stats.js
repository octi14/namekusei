const g = (hp, ki, atk, def, vel, h) => ({
  hpMax: Math.round(hp * 0.9), kiMax: ki, ataque: atk, defensa: def, velocidad: vel, altura: h,
});

export const NAMED_Z = {
  Gokú: g(2200, 200, 28, 18, 14, 1.18),
  Gohan: g(1600, 150, 20, 14, 12, 0.92),
  Krilin: g(1200, 110, 14, 12, 13, 0.82),
  Pikoro: g(2000, 180, 22, 20, 11, 1.38),
  Vegeta: g(2100, 190, 26, 17, 14, 1.08),
  Nail: g(1900, 160, 21, 19, 11, 1.42),
  Dendé: g(1000, 160, 8, 10, 10, 0.78),
};

export const NAMED_F = {
  Freezer: g(2400, 220, 30, 20, 15, 1.12),
  Zaabon: g(1500, 130, 18, 14, 13, 1.05),
  Dodoria: g(1700, 100, 20, 16, 9, 1.15),
  Gurdo: g(900, 140, 10, 10, 8, 0.78),
  Rikum: g(1800, 120, 22, 16, 12, 1.28),
  Yiz: g(1400, 110, 16, 13, 13, 1.02),
  Butter: g(1450, 115, 17, 13, 13, 1.04),
  Ginyu: g(2000, 160, 24, 18, 12, 1.48),
  Kiwy: g(1300, 100, 15, 12, 11, 1.0),
  Appule: g(1250, 95, 14, 12, 11, 0.98),
};

export const NAMED_Z_EARTH = {
  Gokú: g(2200, 200, 28, 18, 14, 1.18),
  Gohan: g(1600, 150, 20, 14, 12, 0.92),
  Pikoro: g(2000, 180, 22, 20, 11, 1.38),
  Krilin: g(1200, 110, 14, 12, 13, 0.82),
  "Ten Shin Han": g(1500, 140, 18, 15, 12, 1.12),
  Yamcha: g(1250, 110, 15, 12, 13, 1.08),
  Chaoz: g(700, 130, 8, 8, 11, 0.55),
  Yajirobee: g(1100, 70, 16, 14, 8, 1.05),
  Kami: g(1400, 170, 14, 16, 10, 1.48),
};

export const NAMED_F_EARTH = {
  Vegeta: g(2100, 190, 26, 17, 14, 1.08),
  Nappa: g(1900, 140, 24, 18, 10, 1.45),
  Raditz: g(1750, 150, 22, 16, 13, 1.32),
};

export const GENERIC_Z = g(1100, 90, 12, 11, 10, 1.2);
export const GENERIC_F = g(1000, 80, 11, 10, 10, 1.05);
export const GENERIC_Z_EARTH = g(1050, 90, 12, 11, 11, 1.1);
export const GENERIC_F_EARTH = g(1100, 95, 14, 12, 12, 1.12);
export const SAIBAMAN = g(950, 70, 13, 9, 11, 0.62);

export const NAMED_Z_CELL = {
  Gokú: g(2400, 220, 30, 20, 15, 1.18),
  Gohan: g(2300, 210, 28, 18, 14, 1.05),
  Vegeta: g(2350, 210, 29, 19, 15, 1.08),
  Trunks: g(2200, 200, 27, 18, 15, 1.14),
  Krilin: g(1300, 120, 15, 13, 13, 0.82),
  "Ten Shin Han": g(1550, 145, 18, 15, 12, 1.12),
  Chaoz: g(750, 140, 8, 8, 11, 0.55),
  Yamcha: g(1300, 115, 15, 12, 13, 1.08),
  Pikoro: g(2100, 190, 23, 21, 12, 1.38),
  Dendé: g(1000, 180, 8, 10, 10, 0.78),
  "Mr. Satan": g(900, 40, 10, 8, 9, 1.15),
};

export const NAMED_F_CELL = {
  Cell: g(2800, 240, 32, 22, 15, 1.28),
  "Nº16": g(2200, 80, 26, 24, 10, 1.55),
  "Nº17": g(2000, 180, 24, 18, 16, 1.12),
  "Nº18": g(1950, 175, 23, 17, 16, 1.08),
  "Nº19": g(1600, 90, 18, 16, 9, 1.22),
  "Dr. Gero": g(1500, 100, 17, 15, 10, 1.05),
  "Cell Jr. 1": g(1600, 150, 20, 14, 14, 0.72),
  "Cell Jr. 2": g(1600, 150, 20, 14, 14, 0.72),
  "Cell Jr. 3": g(1600, 150, 20, 14, 14, 0.72),
  "Cell Jr. 4": g(1600, 150, 20, 14, 14, 0.72),
  "Cell Jr. 5": g(1600, 150, 20, 14, 14, 0.72),
  "Cell Jr. 6": g(1600, 150, 20, 14, 14, 0.72),
  "Cell Jr. 7": g(1600, 150, 20, 14, 14, 0.72),
};

export const CELL_JR = g(1500, 140, 19, 13, 14, 0.72);

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
