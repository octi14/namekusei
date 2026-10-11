/**
 * API de ranking sobre MongoDB Atlas. Hoy se monta como middleware del dev server de Vite;
 * cuando exista el servidor online, se monta igual en ese proceso (`mountApi(app.use)`).
 * Colecciones: players { _id: playerId, nick, elo, games, wins, losses, createdAt, updatedAt }
 *              matches { playerId, nick, map, winner, faccion, delta, before, after, perf, st, at }
 */
import { MongoClient } from "mongodb";
import { START_ELO, BOT_ELO, eloDelta, rankOf } from "../src/rating.js";

let dbP = null;

function db(env) {
  if (!dbP) {
    const client = new MongoClient(env.MONGO_URI);
    dbP = client.connect().then(async (c) => {
      const d = c.db(env.MONGO_DB || "dbarena");
      await d.collection("matches").createIndex({ playerId: 1, at: -1 });
      await d.collection("players").createIndex({ elo: -1 });
      return d;
    });
    dbP.catch(() => (dbP = null));
  }
  return dbP;
}

const ID_RE = /^[a-z0-9-]{8,64}$/i;

function body(req) {
  return new Promise((ok, bad) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > 64 * 1024) bad(new Error("body demasiado grande"));
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        bad(e);
      }
    });
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

const blank = (id) => ({ _id: id, nick: "Jugador", elo: START_ELO, games: 0, wins: 0, losses: 0 });
const pub = (p) => ({ id: p._id, nick: p.nick, elo: p.elo, games: p.games, wins: p.wins, losses: p.losses });
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const cleanSt = (st = {}) => ({ k: num(st.k), a: num(st.a), d: num(st.d), esf: num(st.esf), dmg: num(st.dmg) });

/** use(path, handler) estilo connect (Vite `server.middlewares.use`). */
export function mountApi(use, env) {
  if (!env.MONGO_URI) {
    console.warn("[api] Falta MONGO_URI en .env: ranking solo local");
    return;
  }

  use("/api/rating", async (req, res) => {
    try {
      const id = new URL(req.url, "http://x").searchParams.get("id") || "";
      if (!ID_RE.test(id)) return send(res, 400, { error: "id inválido" });
      const d = await db(env);
      const p = (await d.collection("players").findOne({ _id: id })) || blank(id);
      send(res, 200, pub(p));
    } catch (e) {
      send(res, 500, { error: String(e.message || e) });
    }
  });

  // El servidor calcula el ELO (el cliente solo manda resultado y stats). TODO NET: validar stats con el servidor de partida.
  use("/api/match", async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "POST" });
    try {
      const j = await body(req);
      const id = String(j.id || "");
      if (!ID_RE.test(id)) return send(res, 400, { error: "id inválido" });
      const people = (Array.isArray(j.people) ? j.people : []).slice(0, 64).map((o) => ({
        faccion: o.faccion === "f" ? "f" : "z",
        st: cleanSt(o.st),
        me: !!o.me,
      }));
      const me = people.find((o) => o.me);
      if (!me) return send(res, 400, { error: "falta el jugador" });
      const winner = j.winner === "z" || j.winner === "f" ? j.winner : null;
      const nick = String(j.nick || "Jugador").slice(0, 16);
      const d = await db(env);
      const players = d.collection("players");
      const p = (await players.findOne({ _id: id })) || blank(id);
      const res2 = eloDelta(me, people, winner, (o) => (o === me ? p.elo : BOT_ELO), p.games);
      const before = p.elo;
      const after = Math.max(0, before + res2.delta);
      const won = winner === me.faccion;
      const now = new Date();
      await players.updateOne(
        { _id: id },
        {
          $set: { nick, elo: after, updatedAt: now },
          $inc: { games: 1, wins: won ? 1 : 0, losses: winner && !won ? 1 : 0 },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
      await d.collection("matches").insertOne({
        playerId: id,
        nick,
        map: String(j.map || "").slice(0, 16),
        winner,
        faccion: me.faccion,
        delta: res2.delta,
        before,
        after,
        perf: res2.perf,
        st: me.st,
        at: now,
      });
      send(res, 200, {
        ...res2,
        before,
        after,
        rankBefore: rankOf(before),
        rankAfter: rankOf(after),
        games: p.games + 1,
        wins: p.wins + (won ? 1 : 0),
        losses: p.losses + (winner && !won ? 1 : 0),
      });
    } catch (e) {
      send(res, 500, { error: String(e.message || e) });
    }
  });
}
