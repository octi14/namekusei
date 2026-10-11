/**
 * ELO por partida (equipos) + rangos estilo Dragon Ball.
 *  - Esperado con el promedio de cada equipo: E = 1 / (1 + 10^((Rrival - Rmío) / 400)).
 *  - Δ = K · (S − E); S = 1 gana, 0 pierde, 0.5 empate. K = 40 las primeras 10 partidas, después 24.
 *  - Rendimiento p ∈ [−1, 1] (stats vs el resto de la partida) escala Δ como mucho ±25%:
 *    ganar → Δ·(1 + 0.25p) (el que más aportó sube más); perder → Δ·(1 − 0.25p) (el que jugó bien pierde menos).
 *  - La IA cuenta con ELO fijo (BOT_ELO).
 * Persistencia: hoy localStorage (práctica local). TODO NET: guardar/leer en el backend (MongoDB Atlas).
 */
export const START_ELO = 1000;
export const BOT_ELO = 1000;
const PLACEMENT_GAMES = 10;
const K_PLACEMENT = 40;
const K_NORMAL = 24;
const PERF_MAX = 0.25;

export const RANKS = [
  { min: -Infinity, name: "Terrícola", color: "#a1887f" },
  { min: 900, name: "Guerrero", color: "#b0bec5" },
  { min: 1100, name: "Élite", color: "#81c784" },
  { min: 1300, name: "Saiyajin", color: "#4fc3f7" },
  { min: 1500, name: "Super Saiyajin", color: "#ffd54f" },
  { min: 1700, name: "Super Saiyajin 2", color: "#ffb300" },
  { min: 1900, name: "Super Saiyajin 3", color: "#ff8f00" },
  { min: 2100, name: "Dios", color: "#e57373" },
  { min: 2300, name: "Ultra Instinto", color: "#e0e0ff" },
];

export function rankOf(elo) {
  let r = RANKS[0];
  for (const x of RANKS) if (elo >= x.min) r = x;
  return r;
}

/** Pesos del rendimiento (z-score de cada stat contra la partida). */
const PERF_W = { k: 1, a: 0.6, esf: 1.4, dmg: 0.8, d: -0.7 };

/** p ∈ [−1, 1] del jugador `me` comparado con todos los de la partida. */
export function perfScore(me, people) {
  let sum = 0;
  for (const [key, w] of Object.entries(PERF_W)) {
    const xs = people.map((o) => o.st?.[key] || 0);
    const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length));
    const z = ((me.st?.[key] || 0) - mean) / Math.max(sd, key === "dmg" ? 40 : 0.75);
    sum += w * Math.max(-2, Math.min(2, z));
  }
  return Math.max(-1, Math.min(1, sum / 3));
}

/**
 * Δ de ELO para `me`. ratingOf(o) devuelve el ELO de cada participante (IA → BOT_ELO).
 * winner: "z" | "f" | null (empate). games: partidas jugadas antes de esta.
 */
export function eloDelta(me, people, winner, ratingOf, games) {
  const avg = (fac) => {
    const t = people.filter((o) => o.faccion === fac);
    return t.reduce((a, o) => a + ratingOf(o), 0) / Math.max(1, t.length);
  };
  const foe = me.faccion === "z" ? "f" : "z";
  const E = 1 / (1 + Math.pow(10, (avg(foe) - avg(me.faccion)) / 400));
  const S = winner == null ? 0.5 : winner === me.faccion ? 1 : 0;
  const K = games < PLACEMENT_GAMES ? K_PLACEMENT : K_NORMAL;
  const base = K * (S - E);
  const p = perfScore(me, people);
  const mul = base >= 0 ? 1 + PERF_MAX * p : 1 - PERF_MAX * p;
  return { delta: Math.round(base * mul), base: Math.round(base), perf: p, expected: E, K };
}

// ---------- Persistencia (local por ahora) ----------
const LS_KEY = "nk-elo-practice";

export function loadRating() {
  try {
    const r = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (r && Number.isFinite(r.elo)) return r;
  } catch {}
  return { elo: START_ELO, games: 0, wins: 0, losses: 0 };
}

function saveRating(r) {
  localStorage.setItem(LS_KEY, JSON.stringify(r));
}

// ---------- Backend (MongoDB vía /api). localStorage queda como caché/offline ----------
const ID_KEY = "nk-player-id";

/** Id anónimo del jugador (hasta que haya cuentas). */
export function playerId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

function cache(r) {
  const prev = loadRating();
  saveRating({ ...prev, elo: r.elo ?? r.after, games: r.games, wins: r.wins ?? prev.wins, losses: r.losses ?? prev.losses });
}

/** Trae el ELO del servidor y actualiza la caché. Devuelve null si no hay backend. */
export async function fetchRating() {
  try {
    const res = await fetch(`/api/rating?id=${playerId()}`);
    if (!res.ok) return null;
    const r = await res.json();
    cache(r);
    return r;
  } catch {
    return null;
  }
}

/** Manda el resultado al servidor (que calcula el ELO oficial). Devuelve el resumen o null. */
export async function postMatchRating(player, people, winner, map) {
  try {
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: playerId(),
        nick: localStorage.getItem("nk-nick") || "Jugador",
        map,
        winner,
        people: people.map((o) => ({ faccion: o.faccion, st: o.st, me: o === player })),
      }),
    });
    if (!res.ok) return null;
    const r = await res.json();
    cache(r);
    return r;
  } catch {
    return null;
  }
}

/** Aplica el resultado al jugador humano (local, inmediato) y devuelve el resumen para la pantalla de fin. */
export function applyMatchRating(player, people, winner) {
  const r = loadRating();
  const res = eloDelta(player, people, winner, (o) => (o === player ? r.elo : BOT_ELO), r.games);
  const before = r.elo;
  r.elo = Math.max(0, r.elo + res.delta);
  r.games++;
  if (winner === player.faccion) r.wins++;
  else if (winner) r.losses++;
  saveRating(r);
  return { ...res, before, after: r.elo, rankBefore: rankOf(before), rankAfter: rankOf(r.elo), games: r.games };
}
