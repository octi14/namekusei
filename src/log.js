const lines = [];
let version = 0;

export function log(msg, team) {
  lines.push({ msg, team: team === "z" || team === "f" ? team : "" });
  if (lines.length > 8) lines.shift();
  version++;
}

export function logKill(killer, victim, ki, drop, team) {
  lines.push({
    kill: true,
    ki: !!ki,
    a: killer,
    b: victim,
    drop: drop || "",
    team: team === "z" || team === "f" ? team : "",
  });
  if (lines.length > 8) lines.shift();
  version++;
}

export function logLines() {
  return lines;
}

export function logVersion() {
  return version;
}
