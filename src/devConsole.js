/**
 * Consola estilo CS: se abre con la tecla a la izquierda del 1 (code "Backquote", º en teclado ES).
 * Los comandos se registran desde afuera con `cmd(nombre, ayuda, fn(args))`; fn puede devolver texto.
 */
const cmds = new Map();
const hist = [];
let histI = 0;
let el = null;
let out = null;
let inp = null;
let open = false;

export function cmd(name, help, fn) {
  cmds.set(name, { help, fn });
}

export function print(t, cls = "") {
  if (!out) return;
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = String(t);
  out.appendChild(d);
  while (out.childElementCount > 400) out.firstChild.remove();
  out.scrollTop = out.scrollHeight;
}

export function consoleOpen() {
  return open;
}

function toggle(v = !open) {
  open = v;
  el.classList.toggle("on", open);
  if (open) {
    document.exitPointerLock?.();
    setTimeout(() => inp.focus(), 0);
  } else inp.blur();
}

function run(line) {
  const t = line.trim();
  if (!t) return;
  hist.push(t);
  histI = hist.length;
  print(`] ${t}`, "in");
  const [name, ...args] = t.split(/\s+/);
  const c = cmds.get(name.toLowerCase());
  if (!c) return print(`Comando desconocido: ${name} (probá "help")`, "err");
  try {
    const r = c.fn(args);
    if (r != null) print(r);
  } catch (e) {
    print(String(e.message || e), "err");
  }
}

function complete() {
  const v = inp.value.trim().toLowerCase();
  if (!v || v.includes(" ")) return;
  const hits = [...cmds.keys()].filter((k) => k.startsWith(v)).sort();
  if (hits.length === 1) inp.value = hits[0] + " ";
  else if (hits.length > 1) print(hits.join("   "), "dim");
}

export function initConsole() {
  el = document.createElement("div");
  el.id = "dev-console";
  el.innerHTML = `<div class="dc-out"></div><input class="dc-in" spellcheck="false" autocomplete="off" placeholder="help · Tab completa · ↑↓ historial" />`;
  document.body.appendChild(el);
  out = el.querySelector(".dc-out");
  inp = el.querySelector(".dc-in");
  // Captura: mientras está abierta, el juego no recibe teclas
  addEventListener(
    "keydown",
    (e) => {
      if (e.code === "Backquote") {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
        return;
      }
      if (!open) return;
      e.stopImmediatePropagation();
      if (e.code === "Escape") {
        e.preventDefault();
        toggle(false);
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        run(inp.value);
        inp.value = "";
      } else if (e.code === "Tab") {
        e.preventDefault();
        complete();
      } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        histI = Math.max(0, Math.min(hist.length, histI + (e.code === "ArrowUp" ? -1 : 1)));
        inp.value = hist[histI] || "";
      }
    },
    true
  );
  addEventListener("keyup", (e) => open && e.stopImmediatePropagation(), true);
  addEventListener("error", (e) => print(`[error] ${e.message}`, "err"));
  addEventListener("unhandledrejection", (e) => print(`[error] ${e.reason?.message || e.reason}`, "err"));

  cmd("help", "lista de comandos", () =>
    [...cmds.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => `${k.padEnd(14)} ${c.help}`)
      .join("\n")
  );
  cmd("clear", "limpia la consola", () => void (out.innerHTML = ""));
  cmd("echo", "imprime el texto", (a) => a.join(" "));
  print("Consola · escribí help", "dim");
}
