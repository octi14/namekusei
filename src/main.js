import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { TEAM_SIZE, superRank, loadSettings, applySettings, applySandbox, snapshot, PIXEL, BLOOM, SHADOWS, MOUSE, FOV, MAP, MATCH_MINS } from "./config.js";
import { createWorld, updateWorld, WATER_Y, buildMapMaquette } from "./world.js";
import { buildRoster, buildSandboxRoster } from "./roster.js";
import { setScenario, current } from "./scenario.js";
import { Personaje, resolvePeople } from "./personaje.js";
import { DragonBalls, resolveBallCollisions } from "./dragonBalls.js";
import { Match } from "./match.js";
import { Combat } from "./combat.js";
import { PlayerCamera, updateSeenBars } from "./camera.js";
import { aiTick } from "./ai.js";
import { renderHud } from "./ui.js";
import { setAudioListener, playSfx, stopSfxLoop, atPos } from "./sfx.js";
import { powerStyle } from "./powers.js";
import { preloadGoku } from "./gokuRig.js";
import { hydratePack } from "./pack.js";
import { toggleCharEditor, charEditorOpen, setCharEditor } from "./charEditor.js";
import { toggleAnimEditor, animEditorOpen, setAnimEditor } from "./animEditor.js";

await hydratePack();
loadSettings();

addEventListener("nk-char-saved", (e) => {
  if (!worldReady) return;
  const who = e.detail?.preset;
  for (const p of people) {
    if (!who || p.nombre === who) p.rebuildBody();
  }
});

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const labelR = new CSS2DRenderer();
labelR.domElement.style.position = "absolute";
labelR.domElement.style.top = "0";
labelR.domElement.style.pointerEvents = "none";
document.getElementById("hud").prepend(labelR.domElement);

const scene = new THREE.Scene();
function makeSky(stops) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  for (const [t, col] of stops) grd.addColorStop(t, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const sky = new THREE.CanvasTexture(c);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.magFilter = THREE.LinearFilter;
  return sky;
}
let skyTex = makeSky([
  [0, "#8bc34a"],
  [0.32, "#cddc39"],
  [0.62, "#dce775"],
  [1, "#fff59d"],
]);
scene.background = skyTex;
let fogLand = new THREE.Fog(0x9ccc65, 220, 1600);
let fogWater = new THREE.Fog(0x2e7d32, 3, 70);
scene.fog = fogLand;
const uwEl = document.getElementById("uw");
const crosshairEl = document.getElementById("crosshair");
let colWater = new THREE.Color(0x1b5e20);
let underWater = false;
let landExposure = 1.18;
let landBloom = 0.42;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2600);
const _earFwd = new THREE.Vector3();
camera.position.set(0, 48, 90);

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType,
    samples: 0,
  })
);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.5, 0.75);
composer.addPass(bloomPass);

let people = [];
let balls;
let match;
let cam;
let combat;
let player;
let worldReady = false;
let sandboxMode = false;

const keys = new Set();
let keysOn = true;
let locked = false;
let menuOpen = false;
const menuEl = document.getElementById("menu");
let spectating = false;
let spectateIdx = 0;
let bootMap = "namek";
let landBloomBase = 0.42;

const HEROES = {
  namek: ["Gokú", "Gohan", "Krilin", "Pikoro", "Vegeta", "Freezer"],
  earth: ["Gokú", "Gohan", "Krilin", "Vegeta", "Nappa", "Raditz"],
  cell: ["Gokú", "Gohan", "Vegeta", "Trunks", "Cell", "Nº17"],
  city: ["Trunks", "Gohan del futuro", "Pikoro", "Vegeta", "Nº17", "Cell"],
  vegeta: ["Vegeta", "Bardock", "Nappa", "Freezer", "Ginyu", "Raditz"],
};

const OPTS = [
  { tab: "partida", key: "TEAM_SIZE", label: "Jugadores por equipo", min: 3, max: 20, step: 1, boot: true },
  { tab: "partida", key: "MAP", label: "Tamaño del mapa", min: 1000, max: 3000, step: 100, boot: true },
  {
    tab: "partida", key: "MATCH_MIN", label: "Duración", boot: true, sel: MATCH_MINS.map((m) => [m, m ? `${m} min` : "Ilimitado"]),
  },
  { tab: "opciones", key: "SFX_VOL", label: "Volumen", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { tab: "opciones", key: "QUALITY", label: "Gráficos", sel: [[0, "Baja"], [1, "Media"], [2, "Alta"]] },
  { tab: "opciones", key: "MOUSE", label: "Sensibilidad", min: 0.3, max: 2.5, step: 0.05 },
  { tab: "opciones", key: "CAM_ZOOM", label: "Zoom 3ª persona", min: 1.6, max: 14, step: 0.05, fmt: (v) => (+v).toFixed(2) },
];
const TABS = [
  ["partida", "Partida"],
  ["opciones", "Opciones"],
];

function applyGfx() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL));
  renderer.shadowMap.enabled = SHADOWS;
  camera.fov = FOV;
  camera.far = current.id === "city" ? 980 : Math.max(2800, MAP * 1.7);
  camera.updateProjectionMatrix();
  if (worldReady) bloomPass.strength = landBloomBase * BLOOM;
  bloomPass.enabled = BLOOM > 0.04 && (landBloomBase || 0) > 0.04;
  resize();
}

function fillHeroes() {
  const sel = document.getElementById("opt-hero");
  const cur = sel.value;
  sel.innerHTML = "";
  for (const n of HEROES[bootMap] || HEROES.namek) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function buildOpts(host, tabsEl, live) {
  tabsEl.innerHTML = "";
  host.innerHTML = "";
  let tab = live ? "opciones" : "partida";
  const show = () => {
    for (const b of tabsEl.querySelectorAll("button")) b.classList.toggle("on", b.dataset.tab === tab);
    for (const lab of host.querySelectorAll("label")) lab.style.display = lab.dataset.tab === tab ? "" : "none";
  };
  for (const [id, name] of TABS) {
    if (live && id === "partida") continue;
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.tab = id;
    b.textContent = name;
    b.onclick = () => { tab = id; show(); };
    tabsEl.appendChild(b);
  }
  const snap = snapshot();
  for (const d of OPTS) {
    if (live && d.boot) continue;
    const lab = document.createElement("label");
    lab.dataset.tab = d.tab;
    if (d.sel) {
      const row = document.createElement("span");
      row.textContent = d.label;
      const sel = document.createElement("select");
      for (const [v, t] of d.sel) {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = t;
        sel.appendChild(o);
      }
      sel.value = String(snap[d.key]);
      sel.oninput = () => { applySettings({ [d.key]: +sel.value }); applyGfx(); };
      lab.append(row, sel);
    } else {
      const row = document.createElement("span");
      const val = document.createElement("b");
      val.className = "val";
      const fmt = d.fmt || ((v) => v);
      val.textContent = fmt(snap[d.key]);
      row.append(d.label + " ", val);
      const r = document.createElement("input");
      r.type = "range";
      r.min = d.min; r.max = d.max; r.step = d.step; r.value = snap[d.key];
      r.oninput = () => {
        applySettings({ [d.key]: +r.value });
        val.textContent = fmt(snapshot()[d.key]);
        applyGfx();
        if (!live && d.key === "MAP") paintBootMap();
      };
      lab.append(row, r);
    }
    host.appendChild(lab);
  }
  show();
}

buildOpts(document.getElementById("boot-opts"), document.getElementById("boot-tabs"), false);
buildOpts(document.getElementById("menu-opts"), document.getElementById("menu-tabs"), true);
function dumpGroup(g) {
  g.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
  g.clear();
}

const mqCanvas = document.getElementById("map-preview");
const mqWrap = document.getElementById("map-preview-wrap");
const mqRenderer = new THREE.WebGLRenderer({ canvas: mqCanvas, antialias: true });
mqRenderer.setPixelRatio(1);
mqRenderer.setClearColor(0x071208);
const mqScene = new THREE.Scene();
mqScene.add(new THREE.HemisphereLight(0xdde7ee, 0x1a237e, 0.9));
const mqSun = new THREE.DirectionalLight(0xfff8e1, 0.95);
mqSun.position.set(40, 70, 28);
mqScene.add(mqSun);
const mqCam = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
mqCam.position.set(0, 20, 34);
mqCam.lookAt(0, 0, 0);
const mqPivot = new THREE.Group();
mqScene.add(mqPivot);
let mqYaw = 0.55;
let mqDrag = false;
let mqLastX = 0;
let mqSpin = true;
let mqLive = true;

function sizeMaquette() {
  if (!mqLive || !mqWrap) return;
  const w = Math.max(160, mqWrap.clientWidth);
  const h = Math.max(140, mqWrap.clientHeight);
  mqRenderer.setSize(w, h, false);
  mqCam.aspect = w / h;
  mqCam.updateProjectionMatrix();
}

function paintBootMap() {
  dumpGroup(mqPivot);
  const model = buildMapMaquette(bootMap);
  const s = 26 / MAP;
  model.scale.set(s, s * 10, s);
  mqPivot.add(model);
  sizeMaquette();
}

mqWrap.addEventListener("pointerdown", (e) => {
  mqDrag = true;
  mqSpin = false;
  mqLastX = e.clientX;
  mqWrap.setPointerCapture(e.pointerId);
});
mqWrap.addEventListener("pointermove", (e) => {
  if (!mqDrag) return;
  mqYaw += (e.clientX - mqLastX) * 0.008;
  mqLastX = e.clientX;
});
mqWrap.addEventListener("pointerup", () => {
  mqDrag = false;
  setTimeout(() => {
    if (!mqDrag) mqSpin = true;
  }, 900);
});
mqWrap.addEventListener("pointercancel", () => {
  mqDrag = false;
  mqSpin = true;
});
addEventListener("resize", sizeMaquette);

fillHeroes();
document.querySelectorAll("#boot [data-map]").forEach((b) => {
  b.classList.toggle("on", b.dataset.map === bootMap);
  b.onclick = () => {
    bootMap = b.dataset.map;
    document.querySelectorAll("#boot [data-map]").forEach((x) => x.classList.toggle("on", x === b));
    b.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    fillHeroes();
    paintBootMap();
  };
});
document.getElementById("btn-play").onclick = () => startGame(bootMap);
applyGfx();
paintBootMap();

function applyLabels() {
  document.getElementById("sc-f-lab").textContent = current.fShort;
  document.getElementById("tab-f-h").textContent = current.fLabel;
  document.getElementById("menu-f-h").textContent = current.fLabel;
}

async function startGame(id, opts = {}) {
  const who = opts.who;
  if (opts.sandbox) {
    applySandbox(420, 1);
    sandboxMode = true;
  }
  await preloadGoku();
  setScenario(id);
  if (id === "vegeta") {
    skyTex = makeSky([
      [0, "#6a0d3a"],
      [0.22, "#ad1457"],
      [0.48, "#e91e63"],
      [0.72, "#f48fb1"],
      [1, "#fce4ec"],
    ]);
    fogLand = new THREE.Fog(0xc2185b, 140, 1400);
    landExposure = 1.18;
    landBloom = 0.52;
    landBloomBase = landBloom;
    bloomPass.strength = landBloom * BLOOM;
    bloomPass.threshold = 0.76;
    fogWater = new THREE.Fog(0x880e4f, 3, 70);
    colWater.setHex(0x4a148c);
    uwEl.classList.remove("namek");
  } else if (id === "city") {
    skyTex = makeSky([
      [0, "#37474f"],
      [0.3, "#607d8b"],
      [0.58, "#90a4ae"],
      [0.82, "#cfd8dc"],
      [1, "#eceff1"],
    ]);
    fogLand = new THREE.Fog(0x90a4ae, 55, 720);
    landExposure = 1.12;
    landBloom = 0;
    landBloomBase = landBloom;
    bloomPass.strength = landBloom * BLOOM;
    bloomPass.threshold = 0.82;
    fogWater = new THREE.Fog(0x455a64, 3, 70);
    colWater.setHex(0x263238);
    uwEl.classList.remove("namek");
  } else if (id === "earth" || id === "cell") {
    skyTex = makeSky(
      id === "cell"
        ? [
            [0, "#08306b"],
            [0.28, "#1565c0"],
            [0.58, "#42a5f5"],
            [0.82, "#90caf9"],
            [1, "#e3f2fd"],
          ]
        : [
            [0, "#0d47a1"],
            [0.3, "#1e88e5"],
            [0.55, "#64b5f6"],
            [0.8, "#bbdefb"],
            [1, "#fff8e1"],
          ]
    );
    fogLand = new THREE.Fog(
      id === "earth" ? 0x7cb342 : 0x5c9bd1,
      id === "earth" ? 70 : 220,
      id === "earth" ? 680 : 1600
    );
    landExposure = id === "cell" ? 1.22 : 1.2;
    landBloom = id === "cell" ? 0.48 : 0.4;
    landBloomBase = landBloom;
    bloomPass.strength = landBloom * BLOOM;
    bloomPass.threshold = 0.8;
    fogWater = new THREE.Fog(0x0277bd, 3, 70);
    colWater.setHex(0x01579b);
    uwEl.classList.remove("namek");
  } else {
    skyTex = makeSky([
      [0, "#689f38"],
      [0.25, "#9ccc65"],
      [0.5, "#dce775"],
      [0.75, "#fff59d"],
      [1, "#ffe082"],
    ]);
    fogLand = new THREE.Fog(0x9ccc65, 220, 1600);
    landExposure = 1.16;
    landBloom = 0.45;
    landBloomBase = landBloom;
    bloomPass.strength = landBloom * BLOOM;
    bloomPass.threshold = 0.78;
    fogWater = new THREE.Fog(0x2e7d32, 3, 70);
    colWater.setHex(0x1b5e20);
    uwEl.classList.add("namek");
  }
  scene.background = skyTex;
  scene.fog = fogLand;
  renderer.toneMappingExposure = landExposure;
  createWorld(scene, id);
  applyGfx();
  const roster = opts.sandbox && who ? buildSandboxRoster(who, id) : buildRoster(id);
  const zTeam = roster.filter((r) => r.faccion === "z");
  const fTeam = roster.filter((r) => r.faccion === "f");
  people = roster.map((def) => {
    const team = def.faccion === "z" ? zTeam : fTeam;
    const i = team.indexOf(def);
    return new Personaje(def, i, Math.max(1, team.length), scene);
  });
  balls = new DragonBalls(scene);
  match = new Match();
  cam = new PlayerCamera(camera);
  combat = new Combat(scene, balls, cam, match);
  const want = who || document.getElementById("opt-hero").value;
  player = people.find((p) => p.nombre === want) || people.find((p) => p.nombre === "Gokú") || people[0];
  player.controller = "humano";
  player.nameLabel.element.classList.add("yo");
  fillMenu();
  applyLabels();
  worldReady = true;
  mqLive = false;
  dumpGroup(mqPivot);
  mqRenderer.dispose();
  document.getElementById("boot").style.display = "none";
  document.getElementById("click-msg").style.display = "flex";
}

addEventListener("nk-anim-test", (e) => {
  const who = e.detail?.who;
  if (!who) return;
  if (worldReady) {
    sessionStorage.setItem("nk-anim-test", who);
    location.reload();
    return;
  }
  startGame("namek", { who, sandbox: true });
});
{
  const who = sessionStorage.getItem("nk-anim-test");
  if (who) {
    sessionStorage.removeItem("nk-anim-test");
    startGame("namek", { who, sandbox: true });
  }
}

const lockEl = document.createElement("div");
lockEl.className = "lock-xh";
lockEl.innerHTML = "<i></i><i></i><i></i><i></i>";
const lockMark = new CSS2DObject(lockEl);
lockMark.visible = false;

function viewChar() {
  return spectating ? people[spectateIdx] : player;
}

function setMenu(open) {
  menuOpen = open;
  menuEl.classList.toggle("open", open);
  if (open) {
    document.exitPointerLock();
    buildOpts(document.getElementById("menu-opts"), document.getElementById("menu-tabs"), true);
  }
  document.getElementById("click-msg").style.display =
    !worldReady || locked || open ? "none" : "flex";
}

function takeControl(p) {
  spectating = false;
  cam.orbit = 0;
  if (player && player !== p) {
    player.controller = "ia";
    player.nameLabel.element.classList.remove("yo");
  }
  player = p;
  player.controller = "humano";
  player.nameLabel.element.classList.add("yo");
  setMenu(false);
}

function startSpectate() {
  if (player.controller === "humano") {
    player.controller = "ia";
    player.nameLabel.element.classList.remove("yo");
  }
  spectating = true;
  spectateIdx = Math.max(0, people.indexOf(player));
  cam.orbit = 0;
  setMenu(false);
  match.start();
}

function fillMenu() {
  for (const [id, fac] of [["menu-z", "z"], ["menu-f", "f"]]) {
    const box = document.getElementById(id);
    box.innerHTML = "";
    for (const p of people.filter((x) => x.faccion === fac)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.nombre;
      b.onclick = () => takeControl(p);
      box.appendChild(b);
    }
  }
}
document.getElementById("btn-continuar").onclick = () => setMenu(false);
document.getElementById("btn-spectate").onclick = () => startSpectate();

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  labelR.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

document.getElementById("click-msg").onclick = () => {
  canvas.requestPointerLock();
};
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  document.getElementById("click-msg").style.display =
    !worldReady || locked || menuOpen ? "none" : "flex";
  if (locked && match) match.start(sandboxMode);
});
addEventListener("mousemove", (e) => {
  if (!locked) return;
  const sens = 0.00115 * MOUSE;
  // Spectate 1ª: la mirada la lleva la IA; solo órbita en 3ª
  if (spectating && !cam.third) return;
  if (spectating || cam.third) cam.orbit -= e.movementX * sens;
  else player.yaw -= e.movementX * sens;
  cam.pitch = Math.max(-1.45, Math.min(1.28, cam.pitch - e.movementY * 0.00135 * MOUSE));
});
addEventListener("keydown", (e) => {
  if (e.code === "F2") {
    e.preventDefault();
    if (document.pointerLockElement) document.exitPointerLock();
    if (animEditorOpen()) setAnimEditor(false);
    toggleCharEditor();
    return;
  }
  if (e.code === "F3") {
    e.preventDefault();
    if (document.pointerLockElement) document.exitPointerLock();
    if (charEditorOpen()) setCharEditor(false);
    toggleAnimEditor();
    return;
  }
  if (charEditorOpen() || animEditorOpen()) {
    if (e.code === "Escape") {
      setCharEditor(false);
      setAnimEditor(false);
    }
    return;
  }
  if (!worldReady) return;
  if (e.code === "KeyM") {
    e.preventDefault();
    setMenu(!menuOpen);
    return;
  }
  if (menuOpen) return;
  if (spectating && (e.code === "ArrowRight" || e.code === "KeyE")) {
    spectateIdx = (spectateIdx + 1) % people.length;
    return;
  }
  if (spectating && (e.code === "ArrowLeft" || e.code === "KeyQ")) {
    spectateIdx = (spectateIdx + people.length - 1) % people.length;
    return;
  }
  keys.add(e.code);
  if (e.code === "Tab") e.preventDefault();
  if (e.code === "KeyV") cam.toggle();
  if (e.code === "KeyH") keysOn = !keysOn;
  if (e.code === "Space") {
    e.preventDefault();
    if (!menuOpen && match.phase === "play" && !spectating) player.spaceDown();
  }
  if (menuOpen || match.phase !== "play") return;
  if (spectating) return;
  if (e.code === "KeyQ") lockOn();
  if (e.code === "KeyG") player.dropBall(balls);
  if (e.code === "KeyB") player.setSsj(!player.ssj);
  if (e.code === "KeyT") combat.blast(player, false, people, true); // ki largo (snipe)
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("mousedown", (e) => {
  if (!locked || spectating || match.phase !== "play") return;
  if (e.button === 0) combat.melee(player, people);
  if (e.button === 1) lockOn();
  if (e.button === 2) combat.blast(player, false, people); // ki común
});
addEventListener("contextmenu", (e) => e.preventDefault());

function lockOn() {
  const maxD = (powerStyle(player.nombre, player.faccion).range || 55) * 0.85;
  let best = null;
  let bestD = maxD + 8;
  const origin = player.pos();
  const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  for (const o of people) {
    if (o === player || o.faccion === player.faccion || o.dead) continue;
    const to = o.pos().clone().sub(origin);
    const d = to.length();
    if (d > maxD || d < 1.2) continue;
    to.y = 0;
    to.normalize();
    const score = d + (to.dot(f) > 0.2 ? 0 : 22);
    if (score < bestD) {
      bestD = score;
      best = o;
    }
  }
  if (best) {
    player.lockT = 0.6;
    player.lockFoe = best;
  }
}

const clock = new THREE.Clock();
const FPS = 60;
let lastDraw = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (now - lastDraw < 1000 / FPS) return;
  lastDraw = now;
  const dt = Math.min(0.05, clock.getDelta());
  if (!worldReady) {
    if (mqLive) {
      sizeMaquette();
      if (mqSpin && !mqDrag) mqYaw += dt * 0.28;
      mqPivot.rotation.y = mqYaw;
      mqRenderer.render(mqScene, mqCam);
    }
    return;
  }
  if (!menuOpen) match.tick(dt);
  if (match.banner === "GO" && match.flash !== loop._go) {
    loop._go = match.flash;
    cam.shake(0.5);
  }
  if (match.phase === "play" && !menuOpen) {
    if (!spectating && !player.dead) {
      if (player.lockT > 0 && player.lockFoe && !player.lockFoe.dead) {
        player.lockT -= dt;
        const to = player.lockFoe.pos().clone().sub(player.pos());
        let dy = Math.atan2(to.x, to.z) - player.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        player.yaw += dy * Math.min(1, dt * 9);
        // Cámara acompaña al lock (no pelea con orbit del mouse)
        cam.orbit *= Math.exp(-8 * dt);
      } else player.lockT = 0;
      // En 3ª: WASD relativo a la cámara; el mouse solo mueve orbit
      const viewYaw = cam.third ? player.yaw + cam.orbit : player.yaw;
      const f = new THREE.Vector3(Math.sin(viewYaw), 0, Math.cos(viewYaw));
      const r = new THREE.Vector3(f.z, 0, -f.x);
      const dir = new THREE.Vector3();
      if (keys.has("KeyW")) dir.add(f);
      if (keys.has("KeyS")) dir.sub(f);
      if (keys.has("KeyA")) dir.add(r);
      if (keys.has("KeyD")) dir.sub(r);
      if (keys.has("KeyR")) player.charge(dt);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        if (cam.third && !(player.lockT > 0)) {
          const ny = Math.atan2(dir.x, dir.z);
          let dYaw = ny - player.yaw;
          while (dYaw > Math.PI) dYaw -= Math.PI * 2;
          while (dYaw < -Math.PI) dYaw += Math.PI * 2;
          cam.orbit -= dYaw;
          player.yaw = ny;
        }
        player.move(dir, keys.has("ShiftLeft") || keys.has("ShiftRight"), dt);
      }
      if (keys.has("KeyE")) {
        if (!player.tryDeposit(match, balls)) player.tryGrab(balls, dt, match);
      } else {
        player.grabT = 0;
        player._grabbing = false;
      }
      if (keys.has("Space") && (player._launched || player.inSwim())) player.climb();
      if (keys.has("KeyC")) {
        if (player.flyAlt > 0.2 || player.inSwim()) player.descend();
        else player.duckHold();
      }
      player.guard(keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyX"), dt);
      combat.healNearest(player, people);
      if (keys.has("KeyF")) {
        if (player.superHold !== -99) {
          if (!player._sfxSuper) {
            const [x, y, z] = atPos(player);
            playSfx("chargingBigBlast", x, y, z, 0.5);
            playSfx("chargingSuperLoop", x, y, z, 0.35, true);
            if (player.nombre === "Gokú" && superRank(player.s.ki, player.s.kiMax, player.s.ataque) >= 3)
              playSfx("kameCharge", x, y, z, 0.55);
            player._sfxSuper = true;
          }
          player.superHold = (player.superHold || 0) + dt;
          if (player.superHold >= 0.42 && combat.blast(player, true, people))
            player.superHold = -99;
        }
      } else {
        if (player._sfxSuper) {
          stopSfxLoop("chargingSuperLoop");
          player._sfxSuper = false;
        }
        player.superHold = 0;
      }
    }
    if (!spectating && player && cam.third && !player.dead && !(player.lockT > 0)) {
      const neck = 0.56;
      if (Math.abs(cam.orbit) > neck) {
        const extra = cam.orbit - Math.sign(cam.orbit) * neck;
        const turn = extra * Math.min(1, dt * 7);
        player.yaw += turn;
        cam.orbit -= turn;
      }
    }
    for (const p of people) {
      if (spectating || p !== player) aiTick(p, people, balls, combat, match, dt);
      p.camLook = !spectating && p === player && cam.third && !p.dead;
      p.lookOrbit = p.camLook ? cam.orbit : 0;
      p.lookPitch = p.camLook ? cam.pitch : 0;
      p.lookWorld = null;
      if (!p.dead) {
        const pos = p.pos();
        let best = null;
        let score = 0;
        const consider = (x, y, z, sc) => {
          if (sc > score) {
            score = sc;
            best = { x, y, z };
          }
        };
        const foe = p.lockT > 0 && p.lockFoe && !p.lockFoe.dead ? p.lockFoe : p.aiFoe && !p.aiFoe.dead ? p.aiFoe : null;
        if (foe) {
          const fp = foe.pos();
          consider(fp.x, fp.y + foe.height * 0.62, fp.z, 2.2);
        }
        for (const b of balls.items) {
          if (b.held || !b.mesh?.visible) continue;
          const d = pos.distanceTo(b.mesh.position);
          if (d < 16 && d > 0.8) consider(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 1.35 - d / 16);
        }
        for (const s of combat.shots) {
          if (!s.mesh || s.atk === p) continue;
          const d = pos.distanceTo(s.mesh.position);
          if (d < 20 && d > 1.2) consider(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, (s.faccion !== p.faccion ? 1.7 : 0.5) - d / 22);
        }
        p.lookWorld = best;
      }
      p.tick(dt);
    }
    resolvePeople(people);
    resolveBallCollisions(people, balls);
    combat.pov = viewChar();
    combat.tick(dt, people);
    balls.tick(dt);
  }
  const view = viewChar();
  cam.followAiLook = spectating;
  cam.update(view, dt);
  {
    const t = !spectating && player.lockT > 0 && player.lockFoe && !player.lockFoe.dead ? player.lockFoe : null;
    if (t) {
      if (lockMark.parent !== t.mesh) {
        lockMark.removeFromParent();
        t.mesh.add(lockMark);
      }
      lockMark.position.set(0, t.height * 0.7, 0);
      lockMark.visible = true;
    } else {
      lockMark.removeFromParent();
      lockMark.visible = false;
    }
  }
  camera.getWorldDirection(_earFwd);
  setAudioListener(camera.position, _earFwd, camera.up);
  const nowUw = camera.position.y < WATER_Y - 0.08;
  if (nowUw !== underWater) {
    underWater = nowUw;
    scene.fog = nowUw ? fogWater : fogLand;
    scene.background = nowUw ? colWater : skyTex;
    renderer.toneMappingExposure = nowUw ? 0.62 : landExposure;
    bloomPass.strength = nowUw ? 0.15 : landBloom;
    uwEl.classList.toggle("on", nowUw);
  }
  crosshairEl.classList.toggle("on", !cam.third && !view.dead);
  updateSeenBars(camera, view, people);
  renderHud(view, match, keysOn, people, keys.has("Tab"), balls);
  const camP = view.pos();
  updateWorld(camP, dt, _earFwd);
  for (const p of people) {
    const d = p.pos().distanceToSquared(camP);
    if (p._cast !== (d < 3600)) {
      p._cast = d < 3600;
      p.mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = p._cast;
      });
    }
  }
  if (bloomPass.enabled && bloomPass.strength > 0.04) composer.render();
  else renderer.render(scene, camera);
  labelR.render(scene, camera);
}
requestAnimationFrame(loop);
