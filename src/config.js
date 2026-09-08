export const TEAM_SIZE = 15;
export const MAP = 2200;
export const BASE_Z = 960;
export const FLY_MAX = 32;
export const FLY_UP = 11;
export const FLY_DOWN = 14;
export const SUPER_KI = 0.62;
export const SUPER_ATK2 = 40;
export const SUPER_ATK3 = 55;

export function superRank(ki, kiMax, atk) {
  if (ki / kiMax < SUPER_KI) return 0;
  if (atk >= SUPER_ATK3) return 3;
  if (atk >= SUPER_ATK2) return 2;
  return 1;
}
export const MATCH_SEC = 15 * 60;
export const STAT_FLOOR = 0.4;
export const DEATH_MULT = 0.97;
export const HP_REGEN = 4;
export const KI_REGEN = 18;
export const KI_REGEN_PASSIVE = 2.2;
