import { superRank, MAP, BASE_Z } from "./config.js";
import { logLines, logVersion } from "./log.js";
import { current } from "./scenario.js";
import { powerStyle } from "./powers.js";

function paintNames(text, people) {
  if (!people?.length) return text;
  const names = [...new Set(people.map((o) => o.nombre))].sort((a, b) => b.length - a.length);
  let s = text;
  for (const n of names) {
    const fac = people.find((o) => o.nombre === n)?.faccion;
    if (!fac) continue;
    s = s.split(n).join(`<span class="nm-${fac}">${n}</span>`);
  }
  return s;
}
let lastLog = -1;
let lastFlash = -1;

function mmap(ctx, x, z) {
  const s = ctx.canvas.width / MAP;
  return [(x + MAP / 2) * s, (z + MAP / 2) * s];
}

function drawMinimap(p, people, balls) {
  const c = document.getElementById("minimap");
  if (!c || !people) return;
  const ctx = c.getContext("2d");
  const w = c.width;
  ctx.fillStyle = "#1a2214";
  ctx.fillRect(0, 0, w, w);
  ctx.fillStyle = "#c6282844";
  const [zx, zz] = mmap(ctx, 0, -BASE_Z);
  const [fx, fz] = mmap(ctx, 0, BASE_Z);
  const br = 8;
  ctx.beginPath();
  ctx.arc(zx, zz, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1565c044";
  ctx.beginPath();
  ctx.arc(fx, fz, br, 0, Math.PI * 2);
  ctx.fill();
  const visMe = powerStyle(p.nombre, p.faccion).range || 50;
  for (const o of people) {
    if (o.dead) continue;
    const foe = o.faccion !== p.faccion;
    if (foe && o.esfera == null) {
      let spotted = o.pos().distanceTo(p.pos()) <= visMe;
      if (!spotted) {
        for (const a of people) {
          if (a === o || a.dead || a.faccion !== p.faccion) continue;
          const vis = powerStyle(a.nombre, a.faccion).range || 50;
          if (o.pos().distanceTo(a.pos()) <= vis) {
            spotted = true;
            break;
          }
        }
      }
      if (!spotted) continue;
    }
    const [px, pz] = mmap(ctx, o.pos().x, o.pos().z);
    const team = o.faccion === "z" ? "#ff5252" : "#40c4ff";
    if (o === p) {
      ctx.fillStyle = o.esfera != null ? team : "#eceff1";
      ctx.fillRect(px - 2.5, pz - 2.5, 5, 5);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 2.5, pz - 2.5, 5, 5);
    } else if (o.esfera != null) {
      ctx.fillStyle = team;
      ctx.beginPath();
      ctx.arc(px, pz, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = o.faccion === "z" ? "#ef9a9a" : "#90caf9";
      ctx.beginPath();
      ctx.arc(px, pz, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (balls) {
    ctx.fillStyle = "#ffe082";
    for (const b of balls.items) {
      if (b.held) continue;
      const [bx, bz] = mmap(ctx, b.mesh.position.x, b.mesh.position.z);
      ctx.beginPath();
      ctx.arc(bx, bz, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function renderHud(p, match, keysOn, people, tabOn, balls) {
  const hp = Math.max(0, (p.s.hp / p.s.hpMax) * 100);
  const ki = Math.max(0, (p.s.ki / p.s.kiMax) * 100);
  const rank = superRank(p.s.ki, p.s.kiMax, p.s.ataque);
  const superOk = rank > 0;
  document.getElementById("pl-super").textContent = rank === 3 ? "SUPER III" : rank === 2 ? "SUPER II" : "SUPER";
  const mm = Math.floor(match.t / 60);
  const ss = String(Math.floor(match.t % 60)).padStart(2, "0");
  document.getElementById("sc-z").textContent = match.score.z;
  document.getElementById("sc-f").textContent = match.score.f;
  document.getElementById("clock").textContent = match.phase === "play" || match.phase === "over" ? `${mm}:${ss}` : "—";
  const orbs = document.getElementById("sc-orbs");
  if (orbs.childElementCount !== 7) {
    orbs.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const s = document.createElement("i");
      s.className = "orb";
      orbs.appendChild(s);
    }
  }
  const kids = orbs.children;
  for (let i = 0; i < 7; i++) {
    const t = match.slots[i];
    kids[i].className = t ? `orb ${t}` : "orb";
  }
  const name = document.getElementById("pl-name");
  name.textContent = p.nombre;
  name.className = `who ${p.faccion}`;
  document.getElementById("pl-team").textContent = p.faccion === "z" ? current.zLabel : current.fLabel;
  document.getElementById("bar-hp").style.width = `${hp}%`;
  document.getElementById("bar-ki").style.width = `${ki}%`;
  const kiWrap = document.getElementById("bar-ki-wrap");
  kiWrap.classList.toggle("super-ok", superOk);
  const hold = (p.superHold || 0) > 0 && p.superHold < 0.42 ? (p.superHold / 0.42) * 100 : 0;
  document.getElementById("ki-hold").style.width = `${hold}%`;
  document.getElementById("pl-super").classList.toggle("on", superOk);
  document.getElementById("pl-ball").textContent = p.esfera ?? "—";
  document.getElementById("pl-fly").textContent = p.dead
    ? "KO"
    : p.inSwim()
      ? p.swim > 0.4
        ? `AGUA −${p.swim.toFixed(0)}m`
        : "NADANDO"
      : p.volando
        ? `VUELO ${p.flyAlt.toFixed(0)}m`
        : "TIERRA";
  document.getElementById("pl-atk").textContent = p.s.ataque.toFixed(0);
  document.getElementById("pl-vel").textContent = p.s.velocidad.toFixed(0);
  document.getElementById("pl-rng").textContent = String(powerStyle(p.nombre, p.faccion).range || 50);
  const v = logVersion();
  if (v !== lastLog) {
    lastLog = v;
    const ul = document.getElementById("log-list");
    ul.innerHTML = logLines()
      .map((l) => {
        if (l.kill) {
          const ic = l.ki
            ? `<svg class="ko-ic ki" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.6 13.8 9l7.6 1.2-6.2 4.6 2 7.4L12 18.2 6.8 22.2l2-7.4L2.6 10.2 10.2 9z"/></svg>`
            : `<svg class="ko-ic fist" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.2 10.2V6.4a1.8 1.8 0 1 1 3.6 0v3.8h.9V7.2a1.8 1.8 0 1 1 3.6 0v3h.9V8.1a1.8 1.8 0 1 1 3.6 0V15a5.4 5.4 0 0 1-5.4 5.4H11A5.2 5.2 0 0 1 5.8 15v-2.2a1.8 1.8 0 1 1 3.6 0v-.4H8.2z"/></svg>`;
          const drop = l.drop ? `<span class="ko-drop">${l.drop}</span>` : "";
          return `<li class="log-${l.team || "x"}">${paintNames(l.a, people)}${ic}${paintNames(l.b, people)}${drop}</li>`;
        }
        return `<li class="log-${l.team || "x"}">${paintNames(l.msg, people)}</li>`;
      })
      .join("");
  }
  document.getElementById("panel-keys").classList.toggle("hidden", !keysOn);
  const an = document.getElementById("announce");
  if (match.phase === "intro" && match.banner) {
    an.style.display = "flex";
    an.classList.toggle("go", match.banner === "GO");
    if (lastFlash !== match.flash) {
      lastFlash = match.flash;
      an.textContent = match.banner;
      an.classList.remove("pop");
      void an.offsetWidth;
      an.classList.add("pop");
    }
  } else {
    an.style.display = "none";
  }
  const toast = document.getElementById("ball-toast");
  if (match.toast && match.phase === "play") {
    const d = match.toast;
    const team = d.faccion === "z" ? current.zLabel : current.fLabel;
    toast.className = `on ${d.faccion}`;
    toast.innerHTML = `<b>${d.nombre}</b> depositó la esfera ${d.n} · ${team} ${match.score.z}–${match.score.f}`;
  } else toast.className = "";
  const kt = document.getElementById("kill-toast");
  const kill =
    match.killToast &&
    match.phase === "play" &&
    match.killToast.killer === p.nombre
      ? match.killToast
      : null;
  if (kill) {
    kt.className = `on ${kill.faccion}`;
    kt.innerHTML = `¡HAS ELIMINADO A <b>${kill.victim}</b>!`;
  } else kt.className = "";
  document.getElementById("hud").classList.toggle("koed", p.dead);
  const ko = document.getElementById("ko-fx");
  if (p.dead) {
    ko.classList.add("on");
    const by = document.getElementById("ko-by");
    by.className = `ko-by ${p.killedTeam || "x"}`;
    if (p.killedBy) {
      const ic = p.killedKi
        ? `<svg class="ko-ic" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.6 13.8 9l7.6 1.2-6.2 4.6 2 7.4L12 18.2 6.8 22.2l2-7.4L2.6 10.2 10.2 9z"/></svg>`
        : `<svg class="ko-ic" viewBox="0 0 24 24"><path fill="currentColor" d="M8.2 10.2V6.4a1.8 1.8 0 1 1 3.6 0v3.8h.9V7.2a1.8 1.8 0 1 1 3.6 0v3h.9V8.1a1.8 1.8 0 1 1 3.6 0V15a5.4 5.4 0 0 1-5.4 5.4H11A5.2 5.2 0 0 1 5.8 15v-2.2a1.8 1.8 0 1 1 3.6 0v-.4H8.2z"/></svg>`;
      by.innerHTML = `${ic}<span>${p.killedBy}</span>`;
    } else by.textContent = "CAÍDA";
    const t = Math.max(0, p.deadT / Math.max(0.2, p.deadMax || 2.8));
    document.getElementById("ko-bar").style.transform = `scaleX(${t})`;
    document.getElementById("ko-sub").textContent = `REAPARECE EN ${Math.ceil(p.deadT)}`;
  } else ko.classList.remove("on");
  if (match.finish) {
    const end = document.getElementById("end");
    end.classList.add("show");
    const card = document.getElementById("end-card");
    card.className = `end-card ${match.finish.team || ""}`;
    document.getElementById("end-kicker").textContent = match.finish.kicker;
    document.getElementById("end-title").textContent = match.finish.title;
    document.getElementById("end-sub").textContent = match.finish.sub;
    document.getElementById("end-score").textContent = match.finish.score;
  }
  const board = document.getElementById("tab-board");
  if (tabOn && people) {
    board.classList.add("on");
    const row = (o) => {
      const me = o === p ? " me" : "";
      return `<tr class="t-${o.faccion}${me}"><td>${o.nombre}</td><td>${o.st.k}</td><td>${o.st.a}</td><td>${o.st.d}</td><td>${o.st.esf}</td><td>${Math.round(o.st.dmg)}</td></tr>`;
    };
    const sort = (fac) =>
      people.filter((o) => o.faccion === fac).sort((a, b) => b.st.k - a.st.k || b.st.dmg - a.st.dmg);
    const head = `<tr><th>NOMBRE</th><th>K</th><th>A</th><th>D</th><th>ESF</th><th>DMG</th></tr>`;
    document.getElementById("tab-z").innerHTML = head + sort("z").map(row).join("");
    document.getElementById("tab-f").innerHTML = head + sort("f").map(row).join("");
  } else board.classList.remove("on");
  if (!tabOn && !match.finish) drawMinimap(p, people, balls);
}
