import { MATCH_SEC } from "./config.js";
import { log } from "./log.js";
import { current } from "./scenario.js";

export class Match {
  constructor() {
    this.score = { z: 0, f: 0 };
    this.t = MATCH_SEC;
    this.over = null;
    this.phase = "wait";
    this.introT = 0;
    this.banner = "";
    this.flash = 0;
    this.lastDeposit = null;
    this.lastKill = null;
    this.finish = null;
    this.slots = [];
  }

  start() {
    if (this.phase !== "wait") return;
    this.phase = "intro";
    this.introT = 0;
    this.setBanner("3");
  }

  setBanner(s) {
    if (this.banner === s) return;
    this.banner = s;
    this.flash++;
  }

  deposit(faccion, n, nombre, balls) {
    this.lastDeposit = { nombre, faccion, n };
    this.toast = { nombre, faccion, n, t: 3.2 };
    this.syncBalls(balls);
    if (this.score.z >= 7 || this.score.f >= 7) this.endByBalls();
  }

  syncBalls(balls) {
    this.score = { z: 0, f: 0 };
    this.slots = [];
    for (const b of [...balls.items].sort((a, c) => a.n - c.n)) {
      this.slots.push(b.inBase || null);
      if (b.inBase === "z") this.score.z++;
      if (b.inBase === "f") this.score.f++;
    }
  }

  noteKill(killer, victim) {
    if (!killer || !victim) return;
    this.lastKill = {
      killer: killer.nombre,
      kf: killer.faccion,
      victim: victim.nombre,
    };
  }

  winnerTeam() {
    if (this.score.z > this.score.f) return "z";
    if (this.score.f > this.score.z) return "f";
    return "";
  }

  winnerName() {
    if (this.score.z > this.score.f) return "Guerreros Z";
    if (this.score.f > this.score.z) return current.fWin;
    return "Empate";
  }

  endByBalls() {
    this.over = this.winnerName();
    this.phase = "over";
    const d = this.lastDeposit;
    this.finish = {
      kicker: "LAS 7 ESFERAS",
      title: this.over === "Empate" ? "EMPATE" : `GANA ${this.over.toUpperCase()}`,
      sub: d ? `${d.nombre} depositó la esfera ${d.n} y selló la ronda` : "Todas las esferas están en base",
      score: `${this.score.z} — ${this.score.f}`,
      team: d?.faccion || this.winnerTeam(),
    };
    log(
      `Ronda: ${this.finish.sub} (${this.score.z}-${this.score.f})`,
      this.winnerTeam()
    );
  }

  endByTime() {
    this.t = 0;
    this.over = this.winnerName();
    this.phase = "over";
    const k = this.lastKill;
    let sub = "Se acabó el tiempo";
    if (k) sub = `KO decisivo: ${k.killer} derribó a ${k.victim}`;
    this.finish = {
      kicker: "TIEMPO",
      title: this.over === "Empate" ? "EMPATE" : `GANA ${this.over.toUpperCase()}`,
      sub,
      score: `${this.score.z} — ${this.score.f}`,
      team: k?.kf || this.winnerTeam(),
    };
    log(`Tiempo: ${this.over} (${this.score.z}-${this.score.f})`, this.winnerTeam());
  }

  tick(dt) {
    if (this.phase === "intro") {
      this.introT += dt;
      if (this.introT < 0.95) this.setBanner("3");
      else if (this.introT < 1.9) this.setBanner("2");
      else if (this.introT < 2.85) this.setBanner("1");
      else if (this.introT < 4.1) this.setBanner("GO");
      else {
        this.banner = "";
        this.phase = "play";
      }
      return;
    }
    if (this.phase !== "play" || this.over) return;
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
    this.t -= dt;
    if (this.t <= 0) this.endByTime();
  }
}
