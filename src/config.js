export let TEAM_SIZE = 12;
export let MAP = 2000;
export let BASE_Z = 960 * MAP / 2200;
export let FLY_MAX = 50;
export let FLY_UP = 25;
export let FLY_DOWN = 50;
export let SUPER_KI = 0.7;
export let SUPER_ATK2 = 28;
export let SUPER_ATK3 = 32;
export let MATCH_SEC = 20 * 60;
export let STAT_FLOOR = 0.5;
export let DEATH_MULT = 0.97;
export let HP_REGEN = 5;
export let KI_REGEN = 18;
export let KI_REGEN_PASSIVE = 2;
export let SFX_VOL = 1;
export let BLOOM = 1;
export let PIXEL = 1.25;
export let MOUSE = 1;
export let SHADOWS = true;
export let MELEE = 1;
export let FOV = 55;
export let QUALITY = 1;
export const MATCH_MINS = [0, 5, 10, 20, 30, 40, 50, 60];

export function superRank(ki, kiMax, atk) {
  if (ki / kiMax < SUPER_KI) return 0;
  if (atk >= SUPER_ATK3) return 3;
  if (atk >= SUPER_ATK2) return 2;
  return 1;
}

const LS = "nk-set";

function clamp(v, a, b) {
  v = +v;
  if (!Number.isFinite(v)) return a;
  return Math.min(b, Math.max(a, v));
}

export function snapshot() {
  return {
    TEAM_SIZE, MAP, MATCH_MIN: MATCH_SEC > 0 ? MATCH_SEC / 60 : 0,
    SFX_VOL, MOUSE, QUALITY,
  };
}

export function applySettings(s, save = true) {
  if (s.TEAM_SIZE != null) TEAM_SIZE = Math.round(clamp(s.TEAM_SIZE, 5, 20));
  if (s.MAP != null) MAP = Math.round(clamp(s.MAP, 1000, 5000));
  BASE_Z = Math.min(960 * MAP / 2200, MAP / 2 - 90);
  if (s.MATCH_MIN != null) {
    let m = +s.MATCH_MIN;
    if (!MATCH_MINS.includes(m)) m = MATCH_MINS.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a);
    MATCH_SEC = m === 0 ? 0 : m * 60;
  }
  if (s.SFX_VOL != null) SFX_VOL = clamp(s.SFX_VOL, 0, 1);
  if (s.MOUSE != null) MOUSE = clamp(s.MOUSE, 0.3, 2.5);
  if (s.QUALITY != null) QUALITY = Math.round(clamp(s.QUALITY, 0, 2));
  const q = [{ p: 0.7, b: 0, s: false }, { p: 1.15, b: 0.75, s: true }, { p: 1.75, b: 1.15, s: true }][QUALITY];
  PIXEL = q.p;
  BLOOM = q.b;
  SHADOWS = q.s;
  if (save) {
    try { localStorage.setItem(LS, JSON.stringify(snapshot())); } catch (_) {}
  }
}

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || "{}");
    applySettings(s, false);
  } catch (_) {}
}
