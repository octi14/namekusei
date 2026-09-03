const g = (hp, ki, atk, def, vel, h) => ({
  hpMax: hp, kiMax: ki, ataque: atk, defensa: def, velocidad: vel, altura: h,
});

export const NAMED_Z = {
  Gokú: g(220, 200, 28, 18, 14, 1.18),
  Gohan: g(160, 150, 20, 14, 12, 0.92),
  Krilin: g(120, 110, 14, 12, 13, 0.82),
  Pikoro: g(200, 180, 22, 20, 11, 1.38),
  Vegeta: g(210, 190, 26, 17, 14, 1.08),
  Nail: g(190, 160, 21, 19, 11, 1.42),
  Dendé: g(100, 160, 8, 10, 10, 0.78),
};

export const NAMED_F = {
  Freezer: g(240, 220, 30, 20, 15, 1.12),
  Zaabon: g(150, 130, 18, 14, 13, 1.05),
  Dodoria: g(170, 100, 20, 16, 9, 1.15),
  Gurdo: g(90, 140, 10, 10, 8, 0.78),
  Rikum: g(180, 120, 22, 16, 12, 1.28),
  Yiz: g(140, 110, 16, 13, 13, 1.02),
  Butter: g(145, 115, 17, 13, 13, 1.04),
  Ginyu: g(200, 160, 24, 18, 12, 1.48),
  Kiwy: g(130, 100, 15, 12, 11, 1.0),
  Appule: g(125, 95, 14, 12, 11, 0.98),
};

export const GENERIC_Z = g(110, 90, 12, 11, 10, 1.2);
export const GENERIC_F = g(100, 80, 11, 10, 10, 1.05);

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
