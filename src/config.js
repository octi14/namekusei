export const TEAM_SIZE = 12;
export const MAP = 2500;
export const BASE_Z = 960 * MAP / 2200;
export const FLY_MAX = 50;
export const FLY_UP = 25;
export const FLY_DOWN = 50;
export const SUPER_KI = 0.7;
export const SUPER_ATK2 = 28;
export const SUPER_ATK3 = 32;

export function superRank(ki, kiMax, atk) {
  if (ki / kiMax < SUPER_KI) return 0;
  if (atk >= SUPER_ATK3) return 3;
  if (atk >= SUPER_ATK2) return 2;
  return 1;
}
export const MATCH_SEC = 20 * 60;
export const STAT_FLOOR = 0.5;
export const DEATH_MULT = 0.97;
export const HP_REGEN = 5;
export const KI_REGEN = 18;
export const KI_REGEN_PASSIVE = 2;
