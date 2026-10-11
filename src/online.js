/**
 * Online — VISTA PREVIA de pantallas (sin red). Todo lo de acá es simulado:
 * salas, jugadores, chat y emparejamiento son datos falsos para diseñar el flujo.
 * Cuando exista backend, reemplazar `fake*` por llamadas reales (ver TODO NET).
 */
const MAPS = { namek: "Planeta Namek", earth: "Tierra", cell: "Islas", city: "Ciudad", vegeta: "Planeta Vegeta" };
const NICKS = ["Kakarotto99", "PrincesaSaiyan", "KrilinMain", "ElNamek", "Yamcha_OP", "TrunksDelFuturo", "Mr.Satan", "Bulma.dev", "ZenoSama", "Tenshinhan3", "PanFan", "Broly_LSSJ"];
const rnd = (a) => a[(Math.random() * a.length) | 0];

let api = null;
let room = null;
let searchT = 0;
let searchTimer = null;
let botTimer = null;

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function nick() {
  const v = ($("on-nick")?.value || "").trim();
  return v || "Jugador";
}

function toast(msg) {
  const el = $("on-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("on"), 2400);
}

function code6() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

// ---------- Salas públicas (TODO NET: GET /rooms) ----------
let fakeRooms = [];
function fakeRoomList() {
  const maps = Object.keys(MAPS);
  fakeRooms = Array.from({ length: 7 + ((Math.random() * 6) | 0) }, () => {
    const size = 3 + ((Math.random() * 13) | 0);
    const max = size * 2;
    return {
      id: code6(),
      name: rnd(["Sala de ", "Torneo ", "Casual ", "Rankeada ", "Los de "]) + rnd(NICKS),
      map: rnd(maps),
      size,
      n: Math.min(max, 1 + ((Math.random() * max) | 0)),
      max,
      ping: 20 + ((Math.random() * 180) | 0),
      priv: Math.random() < 0.2,
    };
  });
}

function renderRooms() {
  const q = ($("on-filter")?.value || "").toLowerCase();
  const fm = $("on-filter-map")?.value || "";
  const free = $("on-filter-free")?.checked;
  const list = fakeRooms.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!fm || r.map === fm) && (!free || r.n < r.max));
  $("on-browse-n").textContent = `${list.length} SALA${list.length === 1 ? "" : "S"} · DATOS DE PRUEBA`;
  $("on-rooms").innerHTML = list.length
    ? list
        .map((r) => {
          const full = r.n >= r.max;
          const pc = r.ping < 70 ? "ping-g" : r.ping < 130 ? "ping-y" : "ping-r";
          return (
            `<tr><td>${r.priv ? '<span class="lock">🔒</span>' : ""}${esc(r.name)}</td><td>${MAPS[r.map]}</td>` +
            `<td class="${full ? "full" : ""}">${r.n}/${r.max} · ${r.size}v${r.size}</td><td class="${pc}">${r.ping} ms</td>` +
            `<td><button type="button" data-room="${r.id}" ${full ? "disabled" : ""}>ENTRAR</button></td></tr>`
          );
        })
        .join("")
    : `<tr><td colspan="5">No hay salas con esos filtros.</td></tr>`;
}

// ---------- Sala (TODO NET: socket de sala) ----------
function makeRoom(cfg, host) {
  const size = Math.max(3, Math.min(15, Math.round(+cfg.size || 6)));
  room = {
    name: cfg.name || `Sala de ${nick()}`,
    map: cfg.map || "namek",
    size,
    mins: +cfg.mins || 10,
    mapSize: Math.max(1000, Math.min(5000, Math.round(+cfg.mapSize || 2000))),
    bots: cfg.bots !== "0",
    priv: cfg.vis === "priv",
    code: cfg.code || code6(),
    host,
    ready: false,
    z: [],
    f: [],
    chat: [],
  };
  const me = { name: nick(), me: true, host, hero: heroesOf("z")[0] || "Gokú", ready: false };
  room.z.push(me);
  if (!host) room.z.unshift({ name: rnd(NICKS), host: true, hero: rnd(heroesOf("z")), ready: true });
  sys(`${me.name} entró a la sala.`);
  showRoom();
  clearInterval(botTimer);
  // Simula gente entrando/charlando
  botTimer = setInterval(fakeRoomTick, 1500);
}

function sys(t) {
  room?.chat.push({ sys: true, t });
}

function fakeRoomTick() {
  if (!room || api.front() !== "room") return;
  // Cada bot no listo tiene un plazo (2–8 s); al vencer se pone listo sí o sí
  const now = performance.now();
  for (const p of [...room.z, ...room.f]) {
    if (p.me || p.ready) {
      p.readyAt = 0;
      continue;
    }
    p.readyAt ||= now + 2000 + Math.random() * 6000;
    if (now >= p.readyAt) p.ready = true;
  }
  const total = room.z.length + room.f.length;
  if (total < room.size * 2 && Math.random() < 0.45) {
    const k = room.z.length <= room.f.length ? "z" : "f";
    const team = room[k];
    const p = { name: rnd(NICKS), hero: rnd(heroesOf(k)), ready: Math.random() < 0.5 };
    team.push(p);
    sys(`${p.name} entró a la sala.`);
  } else if (Math.random() < 0.3) {
    const all = [...room.z, ...room.f].filter((p) => !p.me);
    if (all.length) {
      const p = rnd(all);
      if (!p.ready && Math.random() < 0.6) p.ready = true;
      else room.chat.push({ who: p.name, t: rnd([
        "gg",
        "¿arrancamos?", 
        "voy con " + p.hero,
        "alguien de naranja?",
        "listo",
        "jaja",
        "no me maten de una",
        "que me pongo?",
        "vamos!",
        "que mierda?",
        "dale pa ponete listo",
        "en este mapa no tienen chance"]) });
    }
  }
  renderRoom();
}

function heroOptions() {
  const sel = $("on-hero");
  const list = heroesOf(teamOf(findMe()));
  const me = findMe();
  sel.innerHTML = list.map((h) => `<option ${h === me?.hero ? "selected" : ""}>${esc(h)}</option>`).join("");
}

/** Personajes del bando `team` ("z" | "f") en el mapa de la sala. */
function heroesOf(team) {
  return (room && api.teamHeroes(room.map)[team]) || [];
}

function teamOf(p) {
  return room && p && room.f.includes(p) ? "f" : "z";
}

function findMe() {
  return room ? [...room.z, ...room.f].find((p) => p.me) : null;
}

function showRoom() {
  api.showFront("room");
  heroOptions();
  renderCfg();
  renderRoom();
}

const MINS = [5, 10, 20, 30];
const CFG_LABEL = { map: "Mapa", size: "Jugadores por equipo", mapSize: "Tamaño de mapa", mins: "Duración", bots: "Completar con IA", priv: "Visibilidad" };
const cfgText = (k, v) =>
  k === "map" ? MAPS[v] : k === "size" ? `${v} vs ${v}` : k === "mapSize" ? `${v} m` : k === "mins" ? `${v} min` : k === "bots" ? (v ? "Sí" : "No") : v ? "Privada" : "Pública";

/** Recuadro de ajustes (estilo AoE): editable solo por el anfitrión; se reconstruye solo al cambiar, no en cada tick. */
function renderCfg() {
  const me = findMe();
  const host = !!me?.host;
  $("on-cfg-who").textContent = host ? "· sos el anfitrión" : "· los define el anfitrión";
  const ctl = {
    map: `<select data-k="map">${Object.entries(MAPS).map(([k, v]) => `<option value="${k}" ${k === room.map ? "selected" : ""}>${v}</option>`).join("")}</select>`,
    size: `<input data-k="size" type="number" min="3" max="15" step="1" value="${room.size}" />`,
    mapSize: `<input data-k="mapSize" type="number" min="1000" max="5000" step="250" value="${room.mapSize}" />`,
    mins: `<select data-k="mins">${MINS.map((m) => `<option value="${m}" ${m === room.mins ? "selected" : ""}>${m} min</option>`).join("")}</select>`,
    bots: `<select data-k="bots"><option value="1" ${room.bots ? "selected" : ""}>Sí</option><option value="0" ${room.bots ? "" : "selected"}>No</option></select>`,
    priv: `<select data-k="priv"><option value="0" ${room.priv ? "" : "selected"}>Pública</option><option value="1" ${room.priv ? "selected" : ""}>Privada</option></select>`,
  };
  $("on-cfg").innerHTML = Object.keys(CFG_LABEL)
    .map((k) => `<span>${CFG_LABEL[k]}</span>${host ? ctl[k] : `<b>${esc(cfgText(k, room[k]))}</b>`}`)
    .join("");
}

function changeCfg(k, raw) {
  const me = findMe();
  if (!room || !me?.host) return;
  const v =
    k === "size" ? Math.max(3, Math.min(15, Math.round(+raw || room.size)))
    : k === "mapSize" ? Math.max(1000, Math.min(5000, Math.round((+raw || room.mapSize) / 250) * 250))
    : k === "mins" ? +raw
    : k === "bots" || k === "priv" ? raw === "1"
    : raw;
  if (room[k] === v) return renderCfg();
  room[k] = v;
  if (k === "size") {
    // Si achica, salen los últimos que entraron (nunca vos)
    for (const t of ["z", "f"]) {
      while (room[t].length > v) {
        const i = room[t].findLastIndex((p) => !p.me);
        const [out] = room[t].splice(i, 1);
        sys(`${out.name} salió: no hay lugar.`);
      }
    }
  }
  if (k === "map") {
    for (const t of ["z", "f"]) for (const p of room[t]) if (!heroesOf(t).includes(p.hero)) p.hero = rnd(heroesOf(t));
    if (!heroesOf(teamOf(me)).includes(me.hero)) me.hero = heroesOf(teamOf(me))[0];
    heroOptions();
  }
  // Como en AoE: al cambiar ajustes se cae el "listo" de todos
  for (const p of [...room.z, ...room.f]) if (!p.host) p.ready = false;
  sys(`El anfitrión cambió ${CFG_LABEL[k].toLowerCase()}: ${cfgText(k, v)}.`);
  renderCfg();
  renderRoom();
}

function renderRoom() {
  if (!room) return;
  const [tz, tf] = ["Naranja", "Azul"];
  $("on-room-name").textContent = room.name.toUpperCase();
  $("on-room-code").textContent = room.priv || room.host ? `CÓDIGO ${room.code}` : "";
  $("on-tz").textContent = `${tz.toUpperCase()} · ${room.z.length}/${room.size}`;
  $("on-tf").textContent = `${tf.toUpperCase()} · ${room.f.length}/${room.size}`;
  const li = (p) =>
    p
      ? `<li class="${p.me ? "me" : ""}">${p.host ? '<span class="host">★</span>' : ""}${esc(p.name)}${p.ready ? '<span class="rdy">LISTO</span>' : ""}<span class="hero">${esc(p.hero)}</span></li>`
      : room.bots
        ? `<li class="bot">IA<span class="hero">automático</span></li>`
        : `<li class="empty">vacío</li>`;
  for (const k of ["z", "f"]) {
    const arr = room[k];
    $(`on-slots-${k}`).innerHTML = Array.from({ length: room.size }, (_, i) => li(arr[i])).join("");
  }
  const me = findMe();
  $("on-ready").classList.toggle("on", !!me?.ready);
  $("on-ready").textContent = me?.ready ? "Listo ✓" : "Listo";
  const allReady = [...room.z, ...room.f].every((p) => p.ready || p.host);
  $("on-start").hidden = !me?.host;
  $("on-start").disabled = !allReady;
  $("on-start").title = allReady ? "" : "Esperando que todos estén listos";
  const log = $("on-chat-log");
  log.innerHTML = room.chat
    .slice(-60)
    .map((m) => (m.sys ? `<div class="sys">${esc(m.t)}</div>` : `<div><b>${esc(m.who)}:</b> ${esc(m.t)}</div>`))
    .join("");
  log.scrollTop = log.scrollHeight;
}

function leaveRoom() {
  clearInterval(botTimer);
  room = null;
  api.showFront("online");
}

// ---------- Emparejamiento (TODO NET: cola de matchmaking) ----------
const MM_SIZE = 5;
const MM_MAP = 1000;

function startSearch() {
  clearInterval(searchTimer);
  searchT = 0;
  const msgs = ["Buscando jugadores de nivel similar…", "Ampliando el rango de búsqueda…", "Probando otras regiones…", "Casi…"];
  // Mapa random hasta que exista pick/ban
  const map = rnd(Object.keys(MAPS));
  const slots = { z: Array(MM_SIZE).fill(null), f: Array(MM_SIZE).fill(null) };
  const myTeam = Math.random() < 0.5 ? "z" : "f";
  slots[myTeam][0] = { name: nick(), hero: null, me: true };
  const paint = () => {
    $("on-slots").innerHTML = ["z", "f"]
      .map(
        (k) =>
          `<div class="on-slot-team t-${k}">` +
          slots[k]
            .map((p) => `<div class="on-slot${p ? " on" : ""}${p?.me ? " me" : ""}"><i>${p ? esc(p.name[0].toUpperCase()) : "?"}</i><span>${p ? esc(p.name) : "…"}</span></div>`)
            .join("") +
          `</div>`
      )
      .join(`<b class="on-slot-vs">VS</b>`);
  };
  const tick = () => {
    if (api.front() !== "search") return clearInterval(searchTimer);
    searchT++;
    $("on-search-t").textContent = `${String((searchT / 60) | 0).padStart(2, "0")}:${String(searchT % 60).padStart(2, "0")}`;
    const free = ["z", "f"].flatMap((k) => slots[k].map((p, i) => (p ? null : [k, i])).filter(Boolean));
    if (free.length && Math.random() < 0.55) {
      const [k, i] = rnd(free);
      slots[k][i] = { name: rnd(NICKS), hero: null };
    }
    paint();
    const filled = [...slots.z, ...slots.f].filter(Boolean).length;
    if (filled < MM_SIZE * 2) {
      $("on-search-msg").textContent = `${msgs[Math.min(msgs.length - 1, (searchT / 6) | 0)]} (${filled}/${MM_SIZE * 2})`;
      return;
    }
    clearInterval(searchTimer);
    $("on-search-msg").textContent = `¡Partida encontrada! ${MAPS[map]}`;
    setTimeout(() => {
      if (api.front() !== "search") return;
      startPick(map, slots, myTeam);
    }, 1600);
  };
  $("on-search-t").textContent = "00:00";
  paint();
  searchTimer = setInterval(tick, 1000);
}

// ---------- Selección de personaje del emparejamiento (TODO NET: picks por socket) ----------
const PICK_SEC = 30;
let pickTimer = 0;

/** 30 s para elegir (o hasta que todos elijan); al que no eligió se le asigna uno random libre de su bando. */
function startPick(map, slots, myTeam) {
  clearInterval(pickTimer);
  const heroes = api.teamHeroes(map);
  const me = slots[myTeam].find((p) => p.me);
  const t0 = performance.now();
  // Cada bot falso elige en un momento al azar (algunos no llegan y van a random)
  for (const k of ["z", "f"]) for (const p of slots[k]) if (!p.me) p.at = 2 + Math.random() * (Math.random() < 0.15 ? 40 : 22);
  // Sin repetir dentro del equipo, salvo que el bando tenga menos personajes que jugadores
  const free = (k, p) => (heroes[k].length < MM_SIZE ? heroes[k] : heroes[k].filter((h) => !slots[k].some((o) => o !== p && o.hero === h)));
  const lock = (k, p, h) => {
    if (p.hero || !free(k, p).includes(h)) return;
    p.hero = h;
  };
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(pickTimer);
    for (const k of ["z", "f"]) for (const p of slots[k]) if (!p.hero) { p.hero = rnd(free(k, p)) || rnd(heroes[k]); p.rnd = true; }
    paint();
    $("pk-msg").textContent = "¡A pelear!";
    const seat = (p) => ({ hero: p.hero, nick: p.name, me: !!p.me });
    setTimeout(() => {
      if (api.front() !== "pick") return;
      api.startLocal({ map, size: MM_SIZE, mins: 10, mapSize: MM_MAP, bots: true, z: slots.z.map(seat), f: slots.f.map(seat) });
    }, 2200);
  };
  const paint = () => {
    const left = Math.max(0, Math.ceil(PICK_SEC - (performance.now() - t0) / 1000));
    $("pk-t").textContent = String(left);
    $("pk-t").classList.toggle("hot", left <= 5);
    $("pk-map").textContent = MAPS[map];
    const foe = myTeam === "z" ? "f" : "z";
    const row = (k) =>
      slots[k]
        .map((p) => {
          const show = k === myTeam || done;
          const h = p.hero && show ? esc(p.hero) : p.hero ? "LISTO" : "Eligiendo…";
          return `<li class="${p.hero ? "lk" : ""}${p.me ? " me" : ""}"><i>${esc(p.name[0].toUpperCase())}</i><span><b>${esc(p.name)}</b><em>${h}${p.rnd && show ? " · random" : ""}</em></span></li>`;
        })
        .join("");
    $("pk-mine").className = `pk-team t-${myTeam}`;
    $("pk-mine").innerHTML = `<h3>${myTeam === "z" ? "NARANJA" : "AZUL"} · TU EQUIPO</h3><ul>${row(myTeam)}</ul>`;
    $("pk-foe").className = `pk-team t-${foe}`;
    $("pk-foe").innerHTML = `<h3>${foe === "z" ? "NARANJA" : "AZUL"}</h3><ul>${row(foe)}</ul>`;
    const open = free(myTeam, me);
    $("pk-grid").innerHTML = heroes[myTeam]
      .map((h) => {
        const mine = me.hero === h;
        const taken = !mine && !open.includes(h);
        return `<button type="button" class="pk-card${mine ? " on" : ""}" data-h="${esc(h)}" ${taken || me.hero || done ? "disabled" : ""}><i>${esc(h[0])}</i><b>${esc(h)}</b>${taken ? "<em>Tomado</em>" : ""}</button>`;
      })
      .join("");
    if (!done) $("pk-msg").textContent = me.hero ? "Esperando al resto…" : "Elegí tu guerrero";
  };
  $("pk-grid").onclick = (e) => {
    const b = e.target.closest(".pk-card");
    if (!b || b.disabled || done) return;
    lock(myTeam, me, b.dataset.h);
    paint();
  };
  api.showFront("pick");
  paint();
  pickTimer = setInterval(() => {
    if (api.front() !== "pick") return clearInterval(pickTimer);
    const el = (performance.now() - t0) / 1000;
    for (const k of ["z", "f"]) for (const p of slots[k]) if (!p.me && !p.hero && el >= p.at) lock(k, p, rnd(free(k, p)));
    paint();
    if (el >= PICK_SEC || [...slots.z, ...slots.f].every((p) => p.hero)) finish();
  }, 250);
}

// ---------- Partida en curso (TODO NET: conectar a los eventos del socket de sala) ----------
/** Jugador desconectado o que abandonó: su personaje lo toma la IA. */
export function onNetLeave(nick) {
  api?.netLeft(nick);
}
/** Reconexión (mismo nick en la misma sala): vuelve a controlar su personaje. */
export function onNetReturn(nick) {
  api?.netBack(nick);
}
/** El anfitrión se fue: mientras no haya servidor dedicado, la partida termina. */
export function onNetHostGone() {
  api?.netHostGone();
}
if (import.meta.env?.DEV) window.__net = { leave: onNetLeave, back: onNetReturn, hostGone: onNetHostGone };

/** Llamar al cambiar de pantalla del front. */
export function onlineScreen(id) {
  if (!api) return;
  if (id === "search") startSearch();
  if (id === "browse") {
    if (!fakeRooms.length) fakeRoomList();
    renderRooms();
  }
  if (id === "join") {
    $("on-join-err").textContent = "";
    setTimeout(() => $("on-code")?.focus(), 50);
  }
  if (id === "create") {
    const f = $("on-create");
    if (!f.name.value) f.name.value = `Sala de ${nick()}`;
  }
}

/**
 * opts: { teamHeroes(map) → {z, f}, showFront(id), front(): id actual, startLocal({map, size, mins, mapSize, bots, z, f}) }
 */
export function initOnline(opts) {
  api = opts;
  const nickIn = $("on-nick");
  if (nickIn) {
    nickIn.value = localStorage.getItem("nk-nick") || "";
    nickIn.addEventListener("change", () => localStorage.setItem("nk-nick", nickIn.value.trim()));
  }
  const mapOpts = Object.entries(MAPS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  $("on-filter-map").insertAdjacentHTML("beforeend", mapOpts);
  $("on-create").map.innerHTML = mapOpts;
  for (const id of ["on-filter", "on-filter-map", "on-filter-free"]) $(id).addEventListener("input", renderRooms);
  $("on-refresh").addEventListener("click", () => {
    fakeRoomList();
    renderRooms();
  });
  $("on-rooms").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-room]");
    if (!b) return;
    const r = fakeRooms.find((x) => x.id === b.dataset.room);
    if (!r) return;
    if (r.priv) {
      api.showFront("join");
      onlineScreen("join");
      $("on-join-err").textContent = "Sala privada: pedile el código al anfitrión.";
      return;
    }
    makeRoom({ name: r.name, map: r.map, size: r.size, mins: 10, bots: "1", vis: "pub", code: r.id }, false);
    // Ya había gente en la sala (el anfitrión ya cuenta)
    for (let i = 0; i < r.n - 2; i++) {
      const k = room.f.length < room.z.length ? "f" : "z";
      if (room[k].length < room.size) room[k].push({ name: rnd(NICKS), hero: rnd(heroesOf(k)), ready: Math.random() < 0.6 });
    }
    renderRoom();
  });
  $("on-create").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    makeRoom({ name: f.name.value.trim(), map: f.map.value, size: f.size.value, mins: f.mins.value, mapSize: f.mapSize.value, bots: f.bots.value, vis: f.vis.value }, true);
  });
  $("on-join").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = $("on-code").value.trim().toUpperCase();
    if (c.length !== 6) {
      $("on-join-err").textContent = "El código tiene 6 caracteres.";
      return;
    }
    // TODO NET: validar código contra el servidor
    makeRoom({ name: `Sala ${c}`, map: rnd(Object.keys(MAPS)), size: 4, mins: 10, bots: "1", vis: "priv", code: c }, false);
  });
  $("on-code").addEventListener("input", (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  $("on-leave").addEventListener("click", leaveRoom);
  $("on-room-code").addEventListener("click", () => {
    navigator.clipboard?.writeText(room?.code || "");
    toast("Código copiado");
  });
  document.querySelectorAll(".on-switch").forEach((b) =>
    b.addEventListener("click", () => {
      const me = findMe();
      if (!me || !room) return;
      const to = room[b.dataset.team];
      if (to.includes(me)) return;
      if (to.length >= room.size) return toast("Ese equipo está lleno");
      for (const k of ["z", "f"]) room[k] = room[k].filter((p) => p !== me);
      to.push(me);
      // Cada bando elige solo entre sus personajes
      if (!heroesOf(b.dataset.team).includes(me.hero)) me.hero = heroesOf(b.dataset.team)[0];
      me.ready = false;
      heroOptions();
      sys(`${me.name} se cambió de equipo.`);
      renderRoom();
    })
  );
  $("on-cfg").addEventListener("change", (e) => {
    const k = e.target.dataset?.k;
    if (k) changeCfg(k, e.target.value);
  });
  $("on-hero").addEventListener("change", (e) => {
    const me = findMe();
    if (me) me.hero = e.target.value;
    renderRoom();
  });
  $("on-ready").addEventListener("click", () => {
    const me = findMe();
    if (!me) return;
    me.ready = !me.ready;
    renderRoom();
  });
  $("on-start").addEventListener("click", () => {
    if (!room) return;
    const me = findMe();
    toast("Sin servidor: arranca una partida local contra la IA");
    clearInterval(botTimer);
    const r = room;
    room = null;
    const seat = (p) => ({ hero: p.hero, nick: p.name, me: p === me });
    api.startLocal({ map: r.map, size: r.size, mins: r.mins, mapSize: r.mapSize, bots: r.bots, z: r.z.map(seat), f: r.f.map(seat) });
  });
  $("on-chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("on-chat-in");
    const t = inp.value.trim();
    if (!t || !room) return;
    room.chat.push({ who: nick(), t });
    inp.value = "";
    renderRoom();
  });
}
