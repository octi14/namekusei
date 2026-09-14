const HDR =
  "t,event,mode,pick,role,loco,charge,flyAlt,ki,hp,x,z,goalDist,foe,foeDist,carry,ball,ship,groundLock,notes";

let started = false;
let tPlay = 0;
let lastSig = "";
let beat = 0;
let buf = [];
let flushT = 0;

function cell(v) {
  if (v == null || v === "") return "";
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(o) {
  return [
    o.t,
    o.event,
    o.mode,
    o.pick,
    o.role,
    o.loco,
    o.charge,
    o.flyAlt,
    o.ki,
    o.hp,
    o.x,
    o.z,
    o.goalDist,
    o.foe,
    o.foeDist,
    o.carry,
    o.ball,
    o.ship,
    o.groundLock,
    o.notes,
  ]
    .map(cell)
    .join(",");
}

function push(line) {
  buf.push(line);
}

function flushNow() {
  if (!import.meta.env.DEV || !buf.length) return;
  const lines = buf.join("\n") + "\n";
  buf = [];
  fetch("/__namekusei-ai-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ append: lines }),
  }).catch(() => {});
}
const TRACE_ON = false;
export function aiTraceBegin() {

  if (!TRACE_ON || !import.meta.env.DEV) return;
  started = true;
  tPlay = 0;
  lastSig = "";
  beat = 0;
  buf = [HDR];
  flushT = 0;
  fetch("/__namekusei-ai-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reset: true, header: HDR + "\n" }),
  }).catch(() => {});
}

export function aiTraceTick(p, match, rec, dt) {
  if (!TRACE_ON || !import.meta.env.DEV || p.nombre !== "Gokú") return;
  if (!started) {
    if (match?.phase !== "play") return;
    aiTraceBegin();
  }
  if (match?.phase !== "play" || tPlay > 300) {
    if (buf.length) flushNow();
    return;
  }
  tPlay += dt;
  flushT += dt;
  const sig = [rec.mode, rec.pick, rec.loco, rec.charge, rec.ship, rec.notes].join("|");
  beat += dt;
  const pulse = beat >= 1;
  if (pulse) beat = 0;
  if (sig === lastSig && !pulse) {
    if (flushT > 1.2) {
      flushT = 0;
      flushNow();
    }
    return;
  }
  lastSig = sig;
  rec.t = tPlay;
  rec.event = pulse && sig === rec._prevPulse ? "beat" : "change";
  rec._prevPulse = sig;
  push(row(rec));
  if (flushT > 0.6 || buf.length > 24) {
    flushT = 0;
    flushNow();
  }
}
