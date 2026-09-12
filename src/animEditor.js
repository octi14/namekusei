import * as THREE from "three";
import { makeBody, loadSavedSculpt, DEFAULT_SCULPT } from "./body.js";
import { LOOK, loadSavedLook } from "./looks.js";
import { loadClips, saveClips, evalClip, applyEval, BONES, defaultClips, copyClipsTo } from "./capsuleAnim.js";

const SKIP = new Set(["Gokú", "Vegeta"]);
const POSES = [
  ["rest", "Reposo"],
  ["idle", "Idle"],
  ["walk", "Caminar"],
  ["run", "Correr"],
  ["hover", "Flotar"],
  ["fly", "Vuelo"],
  ["punch", "Combo piña 1"],
  ["punchTwo", "Combo piña 2"],
  ["punchKick", "Combo patada"],
  ["elbow", "Codazo aéreo"],
  ["swimIdle", "Nado idle"],
  ["swim", "Nadar"],
  ["crouch", "Agachar"],
  ["charge", "Cargar ki"],
  ["blast", "Lanzar ki"],
  ["blastTwo", "Ki a dos manos"],
];

let open = false;
let root;
let canvas;
let renderer;
let scene;
let camera;
let mesh;
let raf = 0;
let presetName = "Gohan";
let clips = defaultClips();
let poseName = "walk";
let poseT = 0;
let playing = true;
let frame = 0;
let bone = "armL";
let yaw = 0.45;
let pitch = 0.12;
let dist = 6.2;
let drag = false;
let lastX = 0;
let lastY = 0;
let _w = 0;
let _h = 0;

function names() {
  return Object.keys(LOOK).filter((n) => !SKIP.has(n));
}

function cur() {
  if (!clips[poseName]) clips[poseName] = defaultClips()[poseName] || { speed: 1, swing: 1, ease: "smooth", keys: [{ u: 0, pose: { lay: 0 } }] };
  return clips[poseName];
}

function setSt(t) {
  const el = root?.querySelector("#ae-status");
  if (el) el.textContent = t;
}

function persist() {
  saveClips(presetName, clips);
  try {
    const j = JSON.parse(localStorage.getItem("namekusei.charEditor") || "{}");
    j.lastPreset = presetName;
    localStorage.setItem("namekusei.charEditor", JSON.stringify(j));
  } catch {
    /* ignore */
  }
  dispatchEvent(new CustomEvent("nk-char-saved", { detail: { preset: presetName } }));
  setSt(`Guardado ${presetName} · ${poseName}`);
}

function rebuild() {
  if (!scene) return;
  if (mesh) {
    scene.remove(mesh);
    mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  const look = { ...LOOK[presetName], ...loadSavedLook(presetName), who: presetName };
  const sculpt = { ...DEFAULT_SCULPT, ...loadSavedSculpt(presetName) };
  mesh = makeBody(1.85, look, sculpt);
  scene.add(mesh);
}

function writeBone() {
  const c = cur();
  const key = c.keys[frame];
  if (!key?.pose) return;
  const x = +root.querySelector("#ae-rx").value;
  const y = +root.querySelector("#ae-ry").value;
  const z = +root.querySelector("#ae-rz").value;
  key.pose[bone] = [x, y, z];
  root.querySelector("#ae-rxn").value = x.toFixed(3);
  root.querySelector("#ae-ryn").value = y.toFixed(3);
  root.querySelector("#ae-rzn").value = z.toFixed(3);
}

function drawTl() {
  const bar = root.querySelector("#ae-tl");
  const c = cur();
  const uPlay = playing ? ((poseT * (c.speed || 1)) % 1 + 1) % 1 : c.keys[frame]?.u ?? 0;
  bar.innerHTML = `<i id="ae-head" style="left:${(uPlay * 100).toFixed(2)}%"></i>`;
  c.keys.forEach((k, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ae-k" + (i === frame && !playing ? " on" : "");
    b.style.left = `${(k.u * 100).toFixed(2)}%`;
    b.title = `t=${k.u.toFixed(2)}`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      playing = false;
      frame = i;
      syncUi();
    });
    bar.appendChild(b);
  });
}

function syncUi() {
  const c = cur();
  frame = Math.min(frame, Math.max(0, c.keys.length - 1));
  root.querySelector("#ae-pose").value = poseName;
  root.querySelector("#ae-preset").value = presetName;
  root.querySelector("#ae-play").value = playing ? "1" : "0";
  root.querySelector("#ae-swing").value = c.swing ?? 1;
  root.querySelector("#ae-spd").value = c.speed ?? 1;
  root.querySelector("#ae-ease").value = c.ease === "lerp" ? "lerp" : "smooth";
  root.querySelector("#ae-bone").value = bone;
  const key = c.keys[frame];
  const rot = key?.pose?.[bone] || [0, 0, 0];
  root.querySelector("#ae-rx").value = rot[0];
  root.querySelector("#ae-ry").value = rot[1];
  root.querySelector("#ae-rz").value = rot[2];
  root.querySelector("#ae-rxn").value = (+rot[0]).toFixed(3);
  root.querySelector("#ae-ryn").value = (+rot[1]).toFixed(3);
  root.querySelector("#ae-rzn").value = (+rot[2]).toFixed(3);
  root.querySelector("#ae-drop").value = key?.pose?.drop ?? 0;
  root.querySelector("#ae-dropn").value = (+(key?.pose?.drop ?? 0)).toFixed(3);
  root.querySelector("#ae-ku").value = key?.u ?? 0;
  root.querySelector("#ae-kun").textContent = (key?.u ?? 0).toFixed(2);
  root.querySelector("#ae-fi").textContent = `${frame + 1}/${c.keys.length}`;
  fillCopy();
  drawTl();
}

function fillCopy() {
  const sel = root.querySelector("#ae-copy");
  const keep = sel.value;
  sel.innerHTML = `<option value="*">Todos los demás</option>`;
  for (const n of names()) {
    if (n === presetName) continue;
    sel.appendChild(Object.assign(document.createElement("option"), { value: n, textContent: n }));
  }
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

function loadWho() {
  try {
    const j = JSON.parse(localStorage.getItem("namekusei.charEditor") || "{}");
    if (j.lastPreset && LOOK[j.lastPreset] && !SKIP.has(j.lastPreset)) presetName = j.lastPreset;
  } catch {
    /* ignore */
  }
  clips = loadClips(presetName);
}

function ensureDom() {
  if (root) return;
  root = document.createElement("div");
  root.id = "anim-editor";
  root.innerHTML = `
    <style>
      #anim-editor { display:none; position:fixed; inset:0; z-index:81; background:#0d1117f2; color:#e6edf3; font-family:"Segoe UI",system-ui,sans-serif; flex-direction:column; }
      #anim-editor.on { display:flex; }
      #ae-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid #30363d; }
      #ae-top h1 { margin:0; font-size:16px; }
      #ae-top button, #ae-top select { background:#21262d; color:#e6edf3; border:1px solid #30363d; border-radius:6px; padding:6px 10px; font-size:13px; }
      #ae-body { flex:1; display:flex; flex-direction:column; min-height:0; }
      @media (min-width:800px) { #ae-body { flex-direction:row; } }
      #ae-view { flex:1; min-height:38vh; position:relative; background:#161b22; }
      #ae-view canvas { width:100%!important; height:100%!important; display:block; }
      #ae-panel { width:100%; max-height:52vh; overflow:auto; padding:10px 12px 28px; border-top:1px solid #30363d; -webkit-overflow-scrolling:touch; }
      @media (min-width:800px) { #ae-panel { width:min(380px,44vw); max-height:none; border-top:none; border-left:1px solid #30363d; } }
      #ae-panel h2 { font-size:11px; letter-spacing:.12em; text-transform:uppercase; opacity:.55; margin:12px 0 8px; }
      #ae-panel .row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
      #ae-panel label { display:flex; flex-direction:column; gap:4px; flex:1; min-width:88px; font-size:12px; }
      #ae-panel input[type=range] { width:100%; }
      #ae-panel input[type=number] { width:100%; min-width:0; box-sizing:border-box; background:#21262d; color:#e6edf3; border:1px solid #30363d; border-radius:6px; padding:6px 8px; font-size:16px; }
      #ae-bones { display:flex; flex-wrap:wrap; gap:6px; }
      #ae-bones button { background:#21262d; color:#e6edf3; border:1px solid #30363d; border-radius:14px; padding:5px 10px; font-size:12px; }
      #ae-bones button.on { background:#1f6feb; border-color:#1f6feb; }
      #ae-tl { position:relative; height:36px; background:#21262d; border:1px solid #30363d; border-radius:8px; margin:6px 0 12px; }
      #ae-tl i#ae-head { position:absolute; top:0; bottom:0; width:2px; background:#58a6ff; pointer-events:none; }
      #ae-tl .ae-k { position:absolute; top:6px; width:12px; height:24px; margin-left:-6px; padding:0; border:0; border-radius:3px; background:#8b949e; cursor:pointer; }
      #ae-tl .ae-k.on { background:#3fb950; }
      #ae-hint { position:absolute; left:10px; bottom:8px; font-size:11px; opacity:.55; pointer-events:none; }
    </style>
    <div id="ae-top">
      <h1>Animaciones</h1>
      <select id="ae-preset"></select>
      <select id="ae-pose"></select>
      <button type="button" id="ae-save">Guardar</button>
      <button type="button" id="ae-reset">Reset clip</button>
      <button type="button" id="ae-close">Cerrar (F3)</button>
      <span id="ae-status" style="font-size:12px;opacity:.7"></span>
    </div>
    <div id="ae-body">
      <div id="ae-view">
        <canvas id="ae-canvas"></canvas>
        <div id="ae-hint">Arrastrá para orbitar · rueda zoom · Espacio play/pausa</div>
      </div>
      <div id="ae-panel">
        <div class="row">
          <label>Play<select id="ae-play"><option value="1">Loop</option><option value="0">Pausar / editar</option></select></label>
          <label>Curva<select id="ae-ease"><option value="smooth">Suave</option><option value="lerp">Lineal</option></select></label>
        </div>
        <div class="row">
          <label>Swing<input id="ae-swing" type="range" min="0.2" max="2.2" step="0.05" /></label>
          <label>Velocidad<input id="ae-spd" type="range" min="0.15" max="2.5" step="0.05" /></label>
        </div>
        <h2>Línea de tiempo <span id="ae-fi"></span></h2>
        <div id="ae-tl"></div>
        <div class="row">
          <label>Tiempo foto <span id="ae-kun">0</span><input id="ae-ku" type="range" min="0" max="0.99" step="0.01" /></label>
        </div>
        <div class="row">
          <button type="button" id="ae-add">+ Foto</button>
          <button type="button" id="ae-dup">Duplicar</button>
          <button type="button" id="ae-del">− Foto</button>
        </div>
        <h2>Hueso</h2>
        <div id="ae-bones"></div>
        <select id="ae-bone" style="display:none"></select>
        <div class="row">
          <label>Rot X<input id="ae-rxn" type="number" min="-3.14" max="3.14" step="0.001" inputmode="decimal" /><input id="ae-rx" type="range" min="-3.14" max="3.14" step="0.005" /></label>
          <label>Rot Y<input id="ae-ryn" type="number" min="-3.14" max="3.14" step="0.001" inputmode="decimal" /><input id="ae-ry" type="range" min="-3.14" max="3.14" step="0.005" /></label>
          <label>Rot Z<input id="ae-rzn" type="number" min="-3.14" max="3.14" step="0.001" inputmode="decimal" /><input id="ae-rz" type="range" min="-3.14" max="3.14" step="0.005" /></label>
        </div>
        <div class="row">
          <label>Bajar torso<input id="ae-dropn" type="number" min="0" max="0.55" step="0.001" inputmode="decimal" /><input id="ae-drop" type="range" min="0" max="0.55" step="0.005" /></label>
        </div>
        <h2>Copiar</h2>
        <div class="row">
          <label>Destino<select id="ae-copy"></select></label>
          <button type="button" id="ae-copy-one">Esta anim</button>
          <button type="button" id="ae-copy-all">Todas</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  const pre = root.querySelector("#ae-preset");
  for (const n of names()) pre.appendChild(Object.assign(document.createElement("option"), { value: n, textContent: n }));
  const ps = root.querySelector("#ae-pose");
  for (const [v, lab] of POSES) ps.appendChild(Object.assign(document.createElement("option"), { value: v, textContent: lab }));
  const bones = root.querySelector("#ae-bones");
  const boneSel = root.querySelector("#ae-bone");
  for (const [id, lab] of BONES) {
    boneSel.appendChild(Object.assign(document.createElement("option"), { value: id, textContent: lab }));
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.bone = id;
    b.textContent = lab;
    b.addEventListener("click", () => {
      bone = id;
      for (const x of bones.querySelectorAll("button")) x.classList.toggle("on", x.dataset.bone === bone);
      syncUi();
    });
    bones.appendChild(b);
  }
  bones.querySelector(`[data-bone="${bone}"]`)?.classList.add("on");
  canvas = root.querySelector("#ae-canvas");
  pre.addEventListener("change", () => {
    persist();
    presetName = pre.value;
    clips = loadClips(presetName);
    frame = 0;
    rebuild();
    syncUi();
    setSt(`Editando: ${presetName}`);
  });
  ps.addEventListener("change", () => {
    poseName = ps.value;
    poseT = 0;
    frame = 0;
    syncUi();
  });
  root.querySelector("#ae-play").addEventListener("change", (e) => {
    playing = e.target.value === "1";
    syncUi();
  });
  root.querySelector("#ae-swing").addEventListener("input", (e) => {
    cur().swing = +e.target.value;
  });
  root.querySelector("#ae-spd").addEventListener("input", (e) => {
    cur().speed = +e.target.value;
  });
  root.querySelector("#ae-ease").addEventListener("change", (e) => {
    cur().ease = e.target.value;
  });
  root.querySelector("#ae-ku").addEventListener("input", (e) => {
    playing = false;
    const key = cur().keys[frame];
    if (key) key.u = +e.target.value;
    cur().keys.sort((a, b) => a.u - b.u);
    frame = cur().keys.indexOf(key);
    syncUi();
  });
  for (const id of ["ae-rx", "ae-ry", "ae-rz"]) {
    root.querySelector("#" + id).addEventListener("input", () => {
      playing = false;
      writeBone();
      drawTl();
    });
  }
  const clampN = (el, lo, hi) => {
    const v = Math.max(lo, Math.min(hi, +el.value || 0));
    el.value = v;
    return v;
  };
  for (const [n, r] of [["ae-rxn", "ae-rx"], ["ae-ryn", "ae-ry"], ["ae-rzn", "ae-rz"]]) {
    root.querySelector("#" + n).addEventListener("change", (e) => {
      playing = false;
      root.querySelector("#" + r).value = clampN(e.target, -3.14, 3.14);
      writeBone();
    });
  }
  root.querySelector("#ae-drop").addEventListener("input", (e) => {
    playing = false;
    const key = cur().keys[frame];
    if (!key?.pose) return;
    key.pose.drop = +e.target.value;
    root.querySelector("#ae-dropn").value = key.pose.drop.toFixed(3);
  });
  root.querySelector("#ae-dropn").addEventListener("change", (e) => {
    playing = false;
    const v = clampN(e.target, 0, 0.55);
    const key = cur().keys[frame];
    if (!key?.pose) return;
    key.pose.drop = v;
    root.querySelector("#ae-drop").value = v;
  });
  root.querySelector("#ae-tl").addEventListener("click", (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const u = Math.min(0.99, Math.max(0, (e.clientX - r.left) / r.width));
    playing = false;
    const c = cur();
    let best = 0;
    let d = 9;
    c.keys.forEach((k, i) => {
      const x = Math.abs(k.u - u);
      if (x < d) {
        d = x;
        best = i;
      }
    });
    frame = best;
    syncUi();
  });
  root.querySelector("#ae-add").addEventListener("click", () => {
    const c = cur();
    const src = c.keys[frame]?.pose || evalClip(c, poseT);
    const u = Math.min(0.99, (c.keys[c.keys.length - 1]?.u ?? 0) + 0.2);
    c.keys.push({ u, pose: JSON.parse(JSON.stringify(src)) });
    c.keys.sort((a, b) => a.u - b.u);
    frame = c.keys.length - 1;
    playing = false;
    syncUi();
  });
  root.querySelector("#ae-dup").addEventListener("click", () => {
    const c = cur();
    const src = c.keys[frame];
    if (!src) return;
    c.keys.push({ u: Math.min(0.99, src.u + 0.08), pose: JSON.parse(JSON.stringify(src.pose)) });
    c.keys.sort((a, b) => a.u - b.u);
    playing = false;
    syncUi();
  });
  root.querySelector("#ae-del").addEventListener("click", () => {
    const c = cur();
    if (c.keys.length < 2) return;
    c.keys.splice(frame, 1);
    frame = Math.max(0, frame - 1);
    syncUi();
  });
  root.querySelector("#ae-reset").addEventListener("click", () => {
    clips[poseName] = defaultClips()[poseName];
    frame = 0;
    syncUi();
    setSt(`${poseName} a default`);
  });
  root.querySelector("#ae-save").addEventListener("click", persist);
  root.querySelector("#ae-close").addEventListener("click", () => setAnimEditor(false));
  const copy = (all) => {
    persist();
    const dest = root.querySelector("#ae-copy").value;
    const targets = dest === "*" ? names().filter((n) => n !== presetName) : [dest];
    for (const n of targets) copyClipsTo(presetName, n, all ? "*" : poseName);
    dispatchEvent(new CustomEvent("nk-char-saved", { detail: {} }));
    setSt(`Copiado ${all ? "todas" : poseName} → ${dest === "*" ? "todos" : dest}`);
  };
  root.querySelector("#ae-copy-one").addEventListener("click", () => copy(false));
  root.querySelector("#ae-copy-all").addEventListener("click", () => copy(true));
  canvas.addEventListener("pointerdown", (e) => {
    drag = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw -= (e.clientX - lastX) * 0.008;
    pitch = Math.max(-0.6, Math.min(1.1, pitch + (e.clientY - lastY) * 0.008));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener("pointerup", () => {
    drag = false;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    dist = Math.max(3.2, Math.min(12, dist + e.deltaY * 0.01));
  }, { passive: false });
}

function ensureScene() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15202b);
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xcde7ff, 0x3e2723, 1.1));
  const key = new THREE.DirectionalLight(0xfff3e0, 1.3);
  key.position.set(3, 6, 4);
  scene.add(key);
  const g = new THREE.Mesh(new THREE.CircleGeometry(3, 40), new THREE.MeshStandardMaterial({ color: 0x243447, roughness: 0.9 }));
  g.rotation.x = -Math.PI / 2;
  scene.add(g);
}

function resize() {
  const view = root.querySelector("#ae-view");
  const w = view.clientWidth || 1;
  const h = view.clientHeight || 1;
  if (w === _w && h === _h) return;
  _w = w;
  _h = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function tick(now) {
  if (!open) return;
  raf = requestAnimationFrame(tick);
  resize();
  const dt = Math.min(0.05, (tick._last ? now - tick._last : 16) / 1000);
  tick._last = now;
  const c = cur();
  if (playing) {
    poseT += dt;
    applyEval(mesh, evalClip(c, poseT));
    if (now - (tick._tl || 0) > 80) {
      drawTl();
      tick._tl = now;
    }
  } else {
    const key = c.keys[frame];
    if (key) applyEval(mesh, evalClip({ ...c, keys: [{ u: 0, pose: key.pose }, { u: 1, pose: key.pose }] }, 0));
  }
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 1.05 + Math.sin(pitch) * dist * 0.65, Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(0, 1, 0);
  renderer.render(scene, camera);
}

export function animEditorOpen() {
  return open;
}

export function setAnimEditor(on) {
  ensureDom();
  open = !!on;
  root.classList.toggle("on", open);
  if (open) {
    loadWho();
    ensureScene();
    rebuild();
    syncUi();
    setSt(`Editando: ${presetName}`);
    cancelAnimationFrame(raf);
    tick();
  } else {
    persist();
    cancelAnimationFrame(raf);
  }
}

export function toggleAnimEditor() {
  setAnimEditor(!open);
}

addEventListener("keydown", (e) => {
  if (!open) return;
  if (e.code === "Space") {
    e.preventDefault();
    playing = !playing;
    root.querySelector("#ae-play").value = playing ? "1" : "0";
    syncUi();
  }
  if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
    e.preventDefault();
    playing = false;
    const n = cur().keys.length;
    frame = (frame + (e.code === "ArrowRight" ? 1 : n - 1)) % n;
    syncUi();
  }
});
