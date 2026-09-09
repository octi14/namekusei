import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { TEAM_SIZE, superRank } from "./config.js";
import { createWorld, updateWorld, WATER_Y } from "./world.js";
import { buildRoster } from "./roster.js";
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

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
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
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2600);
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

const keys = new Set();
let keysOn = true;
let locked = false;
let menuOpen = false;
const menuEl = document.getElementById("menu");
let spectating = false;
let spectateIdx = 0;

function applyLabels() {
  document.getElementById("sc-f-lab").textContent = current.fShort;
  document.getElementById("tab-f-h").textContent = current.fLabel;
  document.getElementById("menu-f-h").textContent = current.fLabel;
}

function startGame(id) {
  setScenario(id);
  if (id === "earth" || id === "cell") {
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
    // fog realista se mantiene; solo afinamos color/distancia por mapa
    fogLand = new THREE.Fog(
      id === "earth" ? 0x7cb342 : 0x5c9bd1,
      id === "earth" ? 70 : 220,
      id === "earth" ? 680 : 1600
    );
    landExposure = id === "cell" ? 1.22 : 1.2;
    landBloom = id === "cell" ? 0.48 : 0.4;
    bloomPass.strength = landBloom;
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
    bloomPass.strength = landBloom;
    bloomPass.threshold = 0.78;
    fogWater = new THREE.Fog(0x2e7d32, 3, 70);
    colWater.setHex(0x1b5e20);
    uwEl.classList.add("namek");
  }
  scene.background = skyTex;
  scene.fog = fogLand;
  renderer.toneMappingExposure = landExposure;
  createWorld(scene, id);
  const roster = buildRoster(id);
  const zTeam = roster.filter((r) => r.faccion === "z");
  const fTeam = roster.filter((r) => r.faccion === "f");
  people = roster.map((def) => {
    const team = def.faccion === "z" ? zTeam : fTeam;
    const i = team.indexOf(def);
    return new Personaje(def, i, TEAM_SIZE, scene);
  });
  balls = new DragonBalls(scene);
  match = new Match();
  cam = new PlayerCamera(camera);
  combat = new Combat(scene, balls, cam, match);
  player = people.find((p) => p.nombre === "Gokú") || people[0];
  player.controller = "humano";
  player.nameLabel.element.classList.add("yo");
  fillMenu();
  applyLabels();
  worldReady = true;
  document.getElementById("boot").style.display = "none";
  document.getElementById("click-msg").style.display = "flex";
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
  if (open) document.exitPointerLock();
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
  if (locked && match) match.start();
});
addEventListener("mousemove", (e) => {
  if (!locked) return;
  if (spectating) cam.orbit -= e.movementX * 0.00115;
  else player.yaw -= e.movementX * 0.00115;
  cam.pitch = Math.max(-1.45, Math.min(1.28, cam.pitch - e.movementY * 0.00135));
});
addEventListener("keydown", (e) => {
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
  if (e.code === "KeyB") player.setSsj(!player.ssj);
  if (e.code === "KeyT") combat.blast(player, false, people, true);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("mousedown", (e) => {
  if (!locked || spectating || match.phase !== "play") return;
  if (e.button === 0) combat.melee(player, people);
  if (e.button === 1) lockOn();
  if (e.button === 2) combat.blast(player, false, people);
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
    renderer.render(scene, camera);
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
      } else player.lockT = 0;
      const flying = player.flyAlt > 0.22 && cam.third;
      if (flying) {
        const turn = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1.85 : 2.55) * dt;
        if (keys.has("KeyA")) player.yaw += turn;
        if (keys.has("KeyD")) player.yaw -= turn;
      }
      const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      const r = new THREE.Vector3(f.z, 0, -f.x);
      const dir = new THREE.Vector3();
      if (keys.has("KeyW")) dir.add(f);
      if (keys.has("KeyS")) dir.sub(f);
      if (!flying) {
        if (keys.has("KeyA")) dir.add(r);
        if (keys.has("KeyD")) dir.sub(r);
      } else if ((keys.has("KeyA") || keys.has("KeyD")) && !keys.has("KeyW") && !keys.has("KeyS") && (player.flyBlend || 0) > 0.2) {
        dir.add(f);
      }
      if (keys.has("KeyR")) player.charge(dt);
      if (dir.lengthSq() > 0) {
        dir.normalize();
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
    for (const p of people) {
      if (spectating || p !== player) aiTick(p, people, balls, combat, match, dt);
      p.tick(dt);
    }
    resolvePeople(people);
    resolveBallCollisions(people, balls);
    combat.pov = viewChar();
    combat.tick(dt, people);
    balls.tick(dt);
  }
  const view = viewChar();
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
  updateWorld(camP, dt);
  for (const p of people) {
    const d = p.pos().distanceToSquared(camP);
    if (p._cast !== (d < 3600)) {
      p._cast = d < 3600;
      p.mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = p._cast;
      });
    }
  }
  composer.render();
  labelR.render(scene, camera);
}
requestAnimationFrame(loop);
document.querySelectorAll("#boot [data-map]").forEach((b) => {
  b.onclick = () => startGame(b.dataset.map);
});
