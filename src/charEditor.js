import * as THREE from "three";
import { makeBody, DEFAULT_SCULPT, SCULPT_SELECTS, saveSculpt, loadSavedSculpt, clearSavedSculpt, captureMolds } from "./body.js";
import { LOOK, saveLook, loadSavedLook } from "./looks.js";

const EDITOR_KEY = "namekusei.charEditor";
const LOOK_COLORS = [
  ["skin", "Piel", (l) => l.skin],
  ["hairC", "Pelo", (l) => l.hairC ?? 0x1a1208],
  ["body", "Gi / túnica", (l) => l.body],
  ["undershirt", "Interior", (l) => l.undershirt ?? 0x5d4037],
  ["sleeves", "Mangas", (l) => l.sleeves ?? l.body],
  ["pants", "Pantalón", (l) => l.pants ?? l.accent ?? l.body],
  ["sash", "Fajín", (l) => l.sash ?? l.accent ?? 0x0d47a1],
  ["wrist", "Muñequeras", (l) => l.wrist ?? l.accent ?? 0x1565c0],
  ["boots", "Botas", (l) => l.boots ?? 0x0d47a1],
  ["cape", "Capa", (l) => l.cape ?? 0xfafafa],
  ["turbanC", "Turbante", (l) => l.turbanC ?? l.cape ?? 0xf5f5f5],
  ["suit", "Traje", (l) => l.suit ?? l.body],
  ["trim", "Placa", (l) => l.trim ?? 0xeeeeee],
  ["pads", "Hombreras", (l) => l.pads ?? l.trim ?? 0xeeeeee],
  ["helm", "Casco", (l) => l.helm ?? 0x37474f],
  ["accent", "Acento", (l) => l.accent ?? 0x1565c0],
];
const KITS = ["gi", "namek", "armor", "soldier", "frost", "brute"];
const HAIRS = ["goku", "gohan", "trunks", "vegeta", "raditz", "bald", "piccolo", "turban", "nail", "dende", "tien", "frieza", "helm"];
const MOLD_PARTS = [
  ["all", "Todas (moldeables)"],
  ["head", "Cabeza"],
  ["torso", "Torso / pecho"],
  ["limb", "Piel extremidades"],
  ["cloth", "Ropa / capa / botas"],
  ["hair", "Cabello / antenas"],
  ["pec", "Pectorales"],
  ["eye", "Ojos"],
  ["ear", "Orejas"],
  ["face", "Nariz / boca"],
];

const MOLD_TOOLS = [
  ["push", "Empujar"],
  ["inflate", "Inflar volumen"],
  ["deflate", "Desinflar"],
  ["smooth", "Suavizar"],
  ["grab", "Agarrar (arrastre)"],
];

/** [key, label, min, max, step] — agrupados con null = separador h2 */
const SLIDERS = [
  null,
  "Brazos",
  ["upperArmR", "Brazo radio", 0.02, 0.2, 0.001],
  ["foreArmR", "Antebrazo radio", 0.02, 0.18, 0.001],
  ["upperArmLen", "Brazo largo", 0.12, 0.55, 0.005],
  ["foreArmLen", "Antebrazo largo", 0.1, 0.5, 0.005],
  ["upperArmBulk", "Brazo bulk", 0.5, 2.2, 0.01],
  ["foreArmBulk", "Antebrazo bulk", 0.5, 2.2, 0.01],
  ["upperArmSx", "Brazo ancho", 0.5, 2.2, 0.01],
  ["foreArmSx", "Antebrazo ancho", 0.5, 2.2, 0.01],
  ["shoulderX", "Hombro sep.", 0.14, 0.38, 0.005],
  ["shoulderY", "Hombro alto", 0.95, 1.3, 0.005],
  ["armX", "Brazo X", -0.22, 0.22, 0.005],
  ["armY", "Brazo Y", -0.28, 0.28, 0.005],
  ["armZ", "Brazo Z", -0.22, 0.28, 0.005],
  null,
  "Piernas",
  ["thighR", "Muslo radio", 0.02, 0.2, 0.001],
  ["shinR", "Pantorrilla radio", 0.02, 0.18, 0.001],
  ["thighLen", "Muslo largo", 0.14, 0.6, 0.005],
  ["shinLen", "Pantorrilla largo", 0.14, 0.6, 0.005],
  ["thighBulk", "Muslo bulk", 0.5, 2.2, 0.01],
  ["shinBulk", "Pantorrilla bulk", 0.5, 2.2, 0.01],
  ["thighSx", "Muslo ancho", 0.5, 2.2, 0.01],
  ["shinSx", "Pantorrilla ancho", 0.5, 2.2, 0.01],
  ["hipX", "Cadera sep.", 0.05, 0.2, 0.005],
  ["hipY", "Pierna Y", 0.32, 0.88, 0.005],
  ["thighY", "Muslo Y", -0.18, 0.18, 0.005],
  null,
  "Torso",
  ["torsoMul", "Torso radio", 0.04, 0.45, 0.005],
  ["hipsMul", "Cadera radio", 0.04, 0.45, 0.005],
  ["torsoChestSx", "Pectorales ancho", 0.45, 2.4, 0.01],
  ["torsoWaistSx", "Abdomen ancho", 0.45, 2.4, 0.01],
  ["hipsSx", "Cadera ancho", 0.45, 2.4, 0.01],
  ["torsoLen", "Torso alto", 0.2, 1.05, 0.01],
  ["torsoY", "Torso Y", -0.25, 0.25, 0.005],
  ["hipsLen", "Cadera alto", 0.15, 0.4, 0.01],
  ["waistYMul", "Cintura Y", 0.5, 0.75, 0.005],
  ["chestR", "Pecho radio", 0.04, 0.28, 0.005],
  ["chestSx", "Pecho X", 0.4, 2.4, 0.01],
  ["chestSy", "Pecho Y", 0.4, 2.4, 0.01],
  ["chestSz", "Pecho Z", 0.4, 2.2, 0.01],
  ["chestY", "Pecho pos Y", 0.7, 1.25, 0.005],
  ["chestZ", "Pecho pos Z", -0.08, 0.16, 0.005],
  ["chestRx", "Pecho rot X", -0.8, 0.8, 0.02],
  ["chestRy", "Pecho rot Y", -0.6, 0.6, 0.02],
  ["chestRz", "Pecho rot Z", -0.6, 0.6, 0.02],
  ["pecR", "Pectoral radio", 0.03, 0.12, 0.001],
  ["pecSep", "Pectoral sep.", 0.03, 0.12, 0.001],
  ["pecY", "Pectoral Y", 0.9, 1.2, 0.005],
  ["pecZ", "Pectoral Z", 0.04, 0.16, 0.005],
  ["pecSx", "Pectoral X", 0.7, 1.8, 0.01],
  ["pecSy", "Pectoral Y esc.", 0.5, 2, 0.01],
  ["pecSz", "Pectoral Z esc.", 0.5, 1.8, 0.01],
  ["beltR", "Cinturón radio", 0.1, 0.25, 0.005],
  ["beltThick", "Cinturón grosor", 0.01, 0.06, 0.001],
  ["showBelt", "Cinturón on", 0, 1, 1],
  ["capeScale", "Capa escala", 0.5, 1.6, 0.05],
  ["capeThick", "Capa grosor", 0.4, 2, 0.05],
  ["capeX", "Capa X", -0.2, 0.2, 0.005],
  ["capeY", "Capa Y", -0.25, 0.25, 0.005],
  ["capeZ", "Capa Z", -0.22, 0.22, 0.005],
  null,
  "Cabeza / cara",
  ["neckR", "Cuello radio", 0.03, 0.1, 0.001],
  ["neckLen", "Cuello largo", 0.05, 0.18, 0.005],
  ["neckY", "Cuello Y", -0.2, 0.25, 0.005],
  ["headR", "Cabeza radio", 0.1, 0.22, 0.005],
  ["headSx", "Cabeza X", 0.7, 1.4, 0.01],
  ["headSy", "Cabeza Y", 0.7, 1.4, 0.01],
  ["headSz", "Cabeza Z", 0.7, 1.4, 0.01],
  ["jaw", "Mandíbula", 0, 1, 0.05],
  ["earR", "Oreja radio", 0.015, 0.07, 0.001],
  ["earX", "Oreja sep.", 0.1, 0.22, 0.005],
  ["earSx", "Oreja X", 0.3, 1.2, 0.05],
  ["earSy", "Oreja Y", 0.5, 1.5, 0.05],
  ["earSz", "Oreja Z", 0.4, 1.5, 0.05],
  ["eyeSep", "Ojos sep.", 0.03, 0.09, 0.001],
  ["irisSep", "Iris sep.", 0.02, 0.1, 0.001],
  ["irisY", "Iris Y", -0.04, 0.1, 0.001],
  ["irisZ", "Iris Z", 0.08, 0.22, 0.001],
  ["eyeTilt", "Blanco inclin.", -0.85, 0.85, 0.01],
  ["eyeY", "Ojos Y", -0.02, 0.08, 0.005],
  ["eyeZ", "Ojos Z", 0.08, 0.18, 0.005],
  ["eyeWhiteR", "Blanco ojo", 0.015, 0.05, 0.001],
  ["eyeIrisR", "Iris", 0.008, 0.03, 0.001],
  ["eyeSx", "Ojo X", 0.5, 1.5, 0.05],
  ["eyeSy", "Ojo Y", 0.3, 1.3, 0.05],
  ["brow", "Cejas", 0, 1, 0.05],
  ["browY", "Ceja Y", -0.04, 0.12, 0.002],
  ["browTilt", "Ceja inclin.", -1.2, 1.2, 0.02],
  ["nose", "Nariz", 0, 1, 0.05],
  ["mouth", "Boca", 0, 1, 0.05],
  ["thirdEye", "3er ojo", 0, 1, 1],
  ["antLen", "Antena largo", 0.08, 0.35, 0.01],
  ["antR", "Antena radio", 0.006, 0.03, 0.001],
  ["antSpread", "Antena sep.", 0.03, 0.1, 0.005],
  null,
  "Manos / pies",
  ["handScale", "Mano escala", 0.5, 1.8, 0.05],
  ["fingerLen", "Dedos largo", 0.4, 1.6, 0.05],
  ["handRx", "Puño rot X", -1.6, 1.6, 0.02],
  ["handRy", "Puño rot Y", -1.6, 1.6, 0.02],
  ["handRz", "Puño rot Z", -1.6, 1.6, 0.02],
  ["footScale", "Pie escala", 0.5, 1.8, 0.05],
  ["footLen", "Pie largo", 1.2, 4, 0.05],
  ["footSx", "Pie ancho", 0.6, 2.2, 0.05],
  ["footSy", "Pie grosor", 0.15, 0.9, 0.01],
  ["footZ", "Pie adelante", -0.08, 0.18, 0.005],
  ["footY", "Pie Y", -0.12, 0.12, 0.005],
  ["footPitch", "Pie inclin.", -0.45, 0.55, 0.01],
  ["bootCuff", "Caña bota", 0.3, 2.2, 0.05],
  ["showHands", "Manos on", 0, 1, 1],
  ["showBoots", "Botas on", 0, 1, 1],
  null,
  "Piel",
  ["bumpScale", "Arrugas", 0, 0.1, 0.001],
  ["sheen", "Sheen piel", 0, 1, 0.01],
  ["sheenRough", "Sheen rough", 0.2, 1, 0.01],
  ["skinRough", "Rough piel", 0.4, 1, 0.01],
  ["paleLift", "Palidez +L", 0, 0.15, 0.005],
  ["paleSat", "Palidez sat", 0.4, 1, 0.01],
  ["clothFit", "Ropa holgura", 1.0, 1.35, 0.01],
  ["hairSpikeR", "Pelo grosor", 0.4, 2, 0.05],
  ["hairSpikeLen", "Pelo largo", 0.4, 2, 0.05],
  ["hairY", "Pelo Y", -0.12, 0.16, 0.005],
];

const SELECT_LABELS = {
  pecType: "Tipo pectorales",
  earType: "Tipo orejas",
  eyeType: "Tipo ojos",
  noseType: "Tipo nariz",
};

let open = false;
let root;
let canvas;
let renderer;
let scene;
let camera;
let mesh;
let raf;
let sculpt = { ...DEFAULT_SCULPT, ...loadSavedSculpt("Gohan") };
let look = { ...LOOK.Gohan };
let presetName = "Gohan";
let altura = 1.85;
let yaw = 0.4;
let pitch = 0.15;
let dist = 6.5;
let drag = false;
let moldStroke = false;
let lastX = 0;
let lastY = 0;
let dirty = true;
let viewMode = "mold"; // orbit | mold
let moldFamily = "all";
let moldTool = "inflate";
let brushR = 0.14;
let brushStr = 0.04;
let lastHitLocal = null;
let moldTouched = new Set();
const _rc = new THREE.Raycaster();
const SKIP_LOOK = new Set(["Gokú", "Vegeta"]);

function lookNames() {
  return Object.keys(LOOK).filter((n) => !SKIP_LOOK.has(n));
}
const _m = new THREE.Vector2();
const _p = new THREE.Vector3();

function hexInput(v) {
  return "#" + (v >>> 0).toString(16).padStart(6, "0");
}
function parseHex(str) {
  return parseInt(String(str).replace("#", ""), 16) >>> 0;
}

function dropSizeMolds(key) {
  const molds = sculpt.molds;
  if (!molds) return;
  const pats = [];
  if (/^(torso|hips|chest|pec|waist|belt|cape)/.test(key)) {
    pats.push(/^(torso|chest|pec|hips|belt|cloth_shirt|undershirt|armor|cape|frost)/);
  }
  if (/arm|shoulder|hand|finger/i.test(key)) pats.push(/arm|band_/);
  if (/thigh|shin|hipX|hipY|foot|boot/i.test(key)) pats.push(/thigh|shin|boot|^hips/);
  if (/head|eye|ear|jaw|nose|hair|neck/i.test(key)) pats.push(/head|jaw|eye|ear|nose|mouth|hair|neck/);
  if (!pats.length) return;
  for (const id of Object.keys(molds)) {
    if (pats.some((p) => p.test(id))) delete molds[id];
  }
}

function ensureDom() {
  if (root) return;
  root = document.createElement("div");
  root.id = "char-editor";
  root.innerHTML = `
    <style>
      #char-editor {
        display: none; position: fixed; inset: 0; z-index: 80;
        background: #0d1117ee; color: #e6edf3;
        font-family: "Segoe UI", system-ui, sans-serif;
        flex-direction: column;
      }
      #char-editor.on { display: flex; }
      #ce-top {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 10px 12px; border-bottom: 1px solid #30363d;
      }
      #ce-top h1 { margin: 0; font-size: 16px; letter-spacing: 0.06em; }
      #ce-top button, #ce-top select {
        background: #21262d; color: #e6edf3; border: 1px solid #30363d;
        border-radius: 6px; padding: 6px 10px; font-size: 13px; cursor: pointer;
      }
      #ce-top button:hover { background: #30363d; }
      #ce-body {
        flex: 1; display: flex; flex-direction: column; min-height: 0;
      }
      @media (min-width: 800px) {
        #ce-body { flex-direction: row; }
      }
      #ce-view {
        flex: 1; min-height: 42vh; position: relative; background: #161b22;
        overflow: hidden; z-index: 0;
      }
      #ce-view canvas { width: 100% !important; height: 100% !important; display: block; }
      #ce-hint {
        position: absolute; left: 10px; bottom: 8px; font-size: 11px; opacity: 0.55;
        pointer-events: none;
      }
      #ce-panel {
        width: 100%; max-height: 48vh; overflow: auto;
        padding: 10px 12px 24px; border-top: 1px solid #30363d;
        -webkit-overflow-scrolling: touch;
        position: relative; z-index: 2; flex-shrink: 0;
        pointer-events: auto;
      }
      @media (min-width: 800px) {
        #ce-panel {
          width: min(360px, 42vw); max-height: none; border-top: none;
          border-left: 1px solid #30363d;
        }
      }
      #ce-panel label {
        display: grid; grid-template-columns: 1fr auto; gap: 4px 8px;
        font-size: 12px; margin: 0 0 8px; align-items: center;
      }
      #ce-panel label span.v { opacity: 0.7; font-variant-numeric: tabular-nums; }
      #ce-panel input[type=range] { grid-column: 1 / -1; width: 100%; }
      #ce-panel .row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      #ce-panel .row label { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 90px; }
      #ce-panel h2 {
        font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
        opacity: 0.55; margin: 14px 0 8px;
      }
      #ce-json {
        width: 100%; min-height: 72px; font-size: 11px; font-family: ui-monospace, monospace;
        background: #0d1117; color: #8b949e; border: 1px solid #30363d; border-radius: 6px;
        padding: 8px;
      }
    </style>
    <div id="ce-top">
      <h1>Editor procedural</h1>
      <select id="ce-preset"></select>
      <button type="button" id="ce-save">Guardar</button>
      <button type="button" id="ce-reset">Reset sculpt</button>
      <button type="button" id="ce-clear-molds">Borrar moldes</button>
      <button type="button" id="ce-anims">Anims (F3)</button>
      <button type="button" id="ce-close">Cerrar (F2)</button>
      <span id="ce-status" style="font-size:12px;opacity:0.7"></span>
    </div>
    <div id="ce-body">
      <div id="ce-view">
        <canvas id="ce-canvas"></canvas>
        <div id="ce-hint">Órbita: arrastrá · Moldear: clic+arrastre (Shift=tirar) · Alt+arrastre=órbita · rueda zoom</div>
      </div>
      <div id="ce-panel">
        <h2>Moldear (mouse)</h2>
        <div class="row">
          <label>Modo
            <select id="ce-mode">
              <option value="orbit">Orbitar</option>
              <option value="mold" selected>Moldear</option>
            </select>
          </label>
          <label>Herramienta<select id="ce-mold-tool"></select></label>
        </div>
        <div class="row">
          <label>Parte<select id="ce-mold-part"></select></label>
        </div>
        <div class="row">
          <label>Brocha<input id="ce-brush-r" type="range" min="0.04" max="0.4" step="0.01" /></label>
          <label>Fuerza<input id="ce-brush-s" type="range" min="0.005" max="0.1" step="0.001" /></label>
        </div>
        <p style="font-size:11px;opacity:0.6;margin:0 0 8px">Inflar/desinflar = volumen. Empujar = normal. Agarrar = arrastrá. Suavizar = promedia. Alt=órbita.</p>
        <h2>Look</h2>
        <div class="row">
          <label>Kit<select id="ce-kit"></select></label>
          <label>Pelo<select id="ce-hair"></select></label>
          <label>Altura<input id="ce-alt" type="range" min="1.2" max="2.4" step="0.01" /></label>
        </div>
        <div class="row" id="ce-look-colors"></div>
        <h2>Tipos</h2>
        <div id="ce-selects" class="row"></div>
        <h2>Parámetros</h2>
        <div id="ce-sliders"></div>
        <h2>Guardado</h2>
        <p style="font-size:12px;opacity:0.65;margin:0 0 8px">Se guarda en este navegador y afecta a los cuerpos procedurales del juego.</p>
        <textarea id="ce-json" readonly></textarea>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const preset = root.querySelector("#ce-preset");
  for (const name of lookNames()) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    preset.appendChild(o);
  }
  const kit = root.querySelector("#ce-kit");
  for (const k of KITS) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    kit.appendChild(o);
  }
  const hair = root.querySelector("#ce-hair");
  for (const h of HAIRS) {
    const o = document.createElement("option");
    o.value = h;
    o.textContent = h;
    hair.appendChild(o);
  }

  const moldToolSel = root.querySelector("#ce-mold-tool");
  for (const [v, lab] of MOLD_TOOLS) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = lab;
    moldToolSel.appendChild(o);
  }
  moldToolSel.value = moldTool;
  moldToolSel.addEventListener("change", (e) => {
    moldTool = e.target.value;
  });
  const moldPart = root.querySelector("#ce-mold-part");
  for (const [v, lab] of MOLD_PARTS) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = lab;
    moldPart.appendChild(o);
  }
  root.querySelector("#ce-mode").value = viewMode;
  root.querySelector("#ce-mode").addEventListener("change", (e) => {
    viewMode = e.target.value;
    setStatus(viewMode === "mold" ? `Moldear: ${moldTool}` : "Modo órbita");
  });
  moldPart.addEventListener("change", (e) => {
    moldFamily = e.target.value;
  });
  root.querySelector("#ce-brush-r").value = brushR;
  root.querySelector("#ce-brush-s").value = brushStr;
  root.querySelector("#ce-brush-r").addEventListener("input", (e) => {
    brushR = +e.target.value;
  });
  root.querySelector("#ce-brush-s").addEventListener("input", (e) => {
    brushStr = +e.target.value;
  });

  const colorBox = root.querySelector("#ce-look-colors");
  for (const [key, lab] of LOOK_COLORS) {
    const el = document.createElement("label");
    el.innerHTML = `${lab}<input type="color" data-lookc="${key}" />`;
    colorBox.appendChild(el);
  }
  colorBox.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.lookc) return;
    look[el.dataset.lookc] = parseHex(el.value);
    dirty = true;
  });
  const selBox = root.querySelector("#ce-selects");
  for (const [key, opts] of Object.entries(SCULPT_SELECTS)) {
    const lab = document.createElement("label");
    lab.textContent = SELECT_LABELS[key] || key;
    const sel = document.createElement("select");
    sel.dataset.sculptSel = key;
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      sel.appendChild(opt);
    }
    sel.value = sculpt[key] ?? DEFAULT_SCULPT[key];
    sel.addEventListener("change", () => {
      sculpt[key] = sel.value;
      dirty = true;
      sel.blur();
    });
    lab.appendChild(sel);
    selBox.appendChild(lab);
  }

  const box = root.querySelector("#ce-sliders");
  for (const row of SLIDERS) {
    if (row == null) continue;
    if (typeof row === "string") {
      const h = document.createElement("h2");
      h.textContent = row;
      box.appendChild(h);
      continue;
    }
    const [key, label, min, max, step] = row;
    const lab = document.createElement("label");
    lab.innerHTML = `${label}<span class="v" data-k="${key}"></span>
      <input type="range" data-sculpt="${key}" min="${min}" max="${max}" step="${step}" />`;
    box.appendChild(lab);
  }

  preset.addEventListener("change", () => {
    presetName = preset.value;
    look = { ...LOOK[presetName], ...loadSavedLook(presetName), who: presetName };
    sculpt = { ...DEFAULT_SCULPT, ...loadSavedSculpt(presetName) };
    altura = sculpt.altura ?? sculpt.moldAltura ?? 1.85;
    syncSculptUi();
    syncLookUi();
    dirty = true;
    setStatus(`Editando: ${presetName}`);
  });
  kit.addEventListener("change", () => {
    look.kit = kit.value;
    dirty = true;
  });
  hair.addEventListener("change", () => {
    look.hair = hair.value;
    dirty = true;
  });
  root.querySelector("#ce-alt").addEventListener("input", (e) => {
    altura = +e.target.value;
    dropSizeMolds("headR");
    dropSizeMolds("footScale");
    sculpt.moldAltura = altura;
    sculpt.altura = altura;
    dirty = true;
  });
  box.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.sculpt) return;
    sculpt[el.dataset.sculpt] = +el.value;
    dropSizeMolds(el.dataset.sculpt);
    const v = box.querySelector(`span.v[data-k="${el.dataset.sculpt}"]`);
    if (v) v.textContent = (+el.value).toFixed(3);
    dirty = true;
  });
  root.querySelector("#ce-reset").addEventListener("click", () => {
    clearSavedSculpt(presetName);
    sculpt = { ...DEFAULT_SCULPT };
    delete sculpt.molds;
    syncSculptUi();
    setStatus(`Sculpt de ${presetName} reseteado`);
    dirty = true;
  });
  root.querySelector("#ce-clear-molds").addEventListener("click", () => {
    delete sculpt.molds;
    setStatus("Moldes borrados (este personaje)");
    dirty = true;
  });
  root.querySelector("#ce-save").addEventListener("click", () => persistEditor(true));
  root.querySelector("#ce-close").addEventListener("click", () => setCharEditor(false));
  root.querySelector("#ce-anims").addEventListener("click", () => {
    setCharEditor(false);
    import("./animEditor.js").then((m) => m.setAnimEditor(true));
  });

  canvas = root.querySelector("#ce-canvas");
  canvas.addEventListener("pointerdown", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    const orbiting = viewMode === "orbit" || e.altKey || e.button === 2;
    if (orbiting) {
      drag = true;
      moldStroke = false;
    } else {
      moldStroke = true;
      drag = false;
      strokeMold(e);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      yaw += (e.clientX - lastX) * 0.01;
      pitch = Math.max(-0.6, Math.min(0.8, pitch + (e.clientY - lastY) * 0.008));
      lastX = e.clientX;
      lastY = e.clientY;
      return;
    }
    if (moldStroke) strokeMold(e);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (moldStroke && mesh && moldTouched.size) {
      sculpt.molds = { ...(sculpt.molds || {}), ...captureMolds(mesh, moldTouched) };
    }
    moldTouched.clear();
    drag = false;
    moldStroke = false;
    lastHitLocal = null;
  });
  canvas.addEventListener("pointercancel", (e) => {
    if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    drag = false;
    moldStroke = false;
    lastHitLocal = null;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.08 : 1 / 1.08;
      dist = Math.min(14, Math.max(2.2, dist * factor));
    },
    { passive: false }
  );
}

function ndcFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  _m.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _m.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function strokeMold(e) {
  if (!mesh || !camera) return;
  ndcFromEvent(e);
  _rc.setFromCamera(_m, camera);
  const hits = _rc.intersectObject(mesh, true);
  if (!hits.length) return;
  const hit = hits.find((h) => {
    const fam = h.object.userData.moldFamily;
    if (!fam) return false;
    if (moldFamily === "all") return true;
    return fam === moldFamily;
  });
  if (!hit?.face) return;
  const obj = hit.object;
  if (obj.userData.moldId) moldTouched.add(obj.userData.moldId);
  if (!obj.geometry?.attributes?.position) return;
  if (!obj.userData.moldCloned) {
    obj.geometry = obj.geometry.clone();
    obj.userData.moldCloned = true;
  }
  const geo = obj.geometry;
  const pos = geo.attributes.position;
  _p.copy(hit.point);
  obj.worldToLocal(_p);
  const nLocal = hit.face.normal.clone().normalize();
  const tool = e.shiftKey && moldTool === "inflate" ? "deflate" : moldTool;
  const r2 = brushR * brushR;

  // grab: desplazamiento en plano de cámara proyectado a local
  let grabDelta = null;
  if (tool === "grab") {
    if (!lastHitLocal) lastHitLocal = _p.clone();
    else {
      grabDelta = _p.clone().sub(lastHitLocal);
      lastHitLocal.copy(_p);
    }
  } else {
    lastHitLocal = null;
  }

  // smooth: acumular vecinos
  const smoothed = tool === "smooth" ? new Float32Array(pos.count * 3) : null;
  if (tool === "smooth") {
    const acc = new Float32Array(pos.count * 3);
    const cnt = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const dx = x - _p.x;
      const dy = y - _p.y;
      const dz = z - _p.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      for (let j = 0; j < pos.count; j++) {
        const ddx = pos.getX(j) - x;
        const ddy = pos.getY(j) - y;
        const ddz = pos.getZ(j) - z;
        if (ddx * ddx + ddy * ddy + ddz * ddz > r2 * 0.35) continue;
        const o = i * 3;
        acc[o] += pos.getX(j);
        acc[o + 1] += pos.getY(j);
        acc[o + 2] += pos.getZ(j);
        cnt[i]++;
      }
    }
    for (let i = 0; i < pos.count; i++) {
      if (!cnt[i]) {
        smoothed[i * 3] = pos.getX(i);
        smoothed[i * 3 + 1] = pos.getY(i);
        smoothed[i * 3 + 2] = pos.getZ(i);
      } else {
        const o = i * 3;
        smoothed[o] = acc[o] / cnt[i];
        smoothed[o + 1] = acc[o + 1] / cnt[i];
        smoothed[o + 2] = acc[o + 2] / cnt[i];
      }
    }
  }

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const dx = x - _p.x;
    const dy = y - _p.y;
    const dz = z - _p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) continue;
    const t = 1 - Math.sqrt(d2) / brushR;
    const w = t * t * brushStr;

    if (tool === "smooth") {
      const o = i * 3;
      const a = Math.min(1, w * 8);
      x += (smoothed[o] - x) * a;
      y += (smoothed[o + 1] - y) * a;
      z += (smoothed[o + 2] - z) * a;
    } else if (tool === "inflate" || tool === "deflate") {
      // desde centro local aproximado del hit: radial
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      const s = (tool === "inflate" ? 1 : -1) * w;
      x += (x / len) * s;
      y += (y / len) * s;
      z += (z / len) * s;
    } else if (tool === "grab" && grabDelta) {
      x += grabDelta.x * w * 6;
      y += grabDelta.y * w * 6;
      z += grabDelta.z * w * 6;
    } else {
      // push (default)
      const sign = e.shiftKey ? -1 : 1;
      x += nLocal.x * w * sign;
      y += nLocal.y * w * sign;
      z += nLocal.z * w * sign;
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function syncSculptUi() {
  for (const row of SLIDERS) {
    if (!row || typeof row === "string") continue;
    const [key] = row;
    const input = root.querySelector(`input[data-sculpt="${key}"]`);
    if (!input) continue;
    const val = sculpt[key] ?? DEFAULT_SCULPT[key] ?? 0;
    input.value = val;
    const v = root.querySelector(`span.v[data-k="${key}"]`);
    if (v) v.textContent = (+val).toFixed(3);
  }
  for (const key of Object.keys(SCULPT_SELECTS)) {
    const sel = root.querySelector(`select[data-sculpt-sel="${key}"]`);
    if (sel) sel.value = sculpt[key] ?? DEFAULT_SCULPT[key];
  }
}

function setStatus(msg) {
  const el = root?.querySelector("#ce-status");
  if (el) el.textContent = msg;
}

function loadEditorState() {
  try {
    const raw = localStorage.getItem(EDITOR_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j.lastPreset && LOOK[j.lastPreset] && !SKIP_LOOK.has(j.lastPreset)) presetName = j.lastPreset;
      else if (j.preset && LOOK[j.preset] && !SKIP_LOOK.has(j.preset)) presetName = j.preset;
      else presetName = lookNames()[0] || "Gohan";
      if (j.altura) altura = j.altura;
    }
  } catch {
    /* ignore */
  }
  look = { ...LOOK[presetName], ...loadSavedLook(presetName), who: presetName };
  sculpt = { ...DEFAULT_SCULPT, ...loadSavedSculpt(presetName) };
  altura = sculpt.altura ?? sculpt.moldAltura ?? 1.85;
}

function syncLookUi() {
  root.querySelector("#ce-preset").value = presetName;
  root.querySelector("#ce-kit").value = look.kit || "gi";
  root.querySelector("#ce-hair").value = look.hair || "goku";
  root.querySelector("#ce-alt").value = altura;
  for (const [key, , get] of LOOK_COLORS) {
    const el = root.querySelector(`input[data-lookc="${key}"]`);
    if (el) el.value = hexInput(get(look));
  }
}

function ensureScene() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2332);
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  const hemi = new THREE.HemisphereLight(0xcde7ff, 0x3e2723, 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff3e0, 1.35);
  key.position.set(3, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x90caf9, 0.45);
  fill.position.set(-4, 2, -2);
  scene.add(fill);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3, 48),
    new THREE.MeshStandardMaterial({ color: 0x243447, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);
}

function rebuild() {
  if (mesh) {
    scene.remove(mesh);
    mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
  mesh = makeBody(altura, { ...look, who: presetName }, sculpt);
  mesh.position.y = 0;
  scene.add(mesh);
  dirty = false;
}

let _ceW = 0;
let _ceH = 0;
function resize() {
  const view = root.querySelector("#ce-view");
  const w = view.clientWidth || 1;
  const h = view.clientHeight || 1;
  if (w === _ceW && h === _ceH) return;
  _ceW = w;
  _ceH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function tick(now) {
  if (!open) return;
  raf = requestAnimationFrame(tick);
  if (dirty && now - (tick._reb || 0) > 45) {
    const ae = document.activeElement;
    if (ae?.tagName !== "SELECT") {
      rebuild();
      tick._reb = now;
    }
  }
  resize();
  tick._last = now;
  const d = dist;
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * d,
    1.1 + Math.sin(pitch) * d * 0.65,
    Math.cos(yaw) * Math.cos(pitch) * d
  );
  camera.lookAt(0, 1.0, 0);
  renderer.render(scene, camera);
}

export function charEditorOpen() {
  return open;
}

export function setCharEditor(on) {
  ensureDom();
  open = !!on;
  root.classList.toggle("on", open);
  if (open) {
    ensureScene();
    loadEditorState();
    syncLookUi();
    syncSculptUi();
    dirty = true;
    setStatus(`Editando: ${presetName}`);
    cancelAnimationFrame(raf);
    tick();
  } else {
    persistEditor(false);
    cancelAnimationFrame(raf);
  }
}

function persistEditor(fromBtn) {
  if (!presetName) return;
  if (mesh && sculpt.molds) {
    sculpt.molds = { ...sculpt.molds, ...captureMolds(mesh, new Set(Object.keys(sculpt.molds))) };
  }
  sculpt.moldAltura = altura;
  sculpt.altura = altura;
  look = { ...look, who: presetName };
  saveSculpt(presetName, sculpt);
  saveLook(presetName, look);
  localStorage.setItem(EDITOR_KEY, JSON.stringify({ lastPreset: presetName, altura }));
  if (root) {
    root.querySelector("#ce-json").value = JSON.stringify(
      {
        id: presetName,
        look,
        sculpt: { ...sculpt, molds: sculpt.molds ? `{${Object.keys(sculpt.molds).length} partes}` : null },
        altura,
      },
      null,
      2
    );
    if (fromBtn) setStatus(`Guardado ✓ solo para ${presetName}`);
  }
  dispatchEvent(new CustomEvent("nk-char-saved", { detail: { preset: presetName } }));
}

export function toggleCharEditor() {
  setCharEditor(!open);
}
