import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { TEAM_SIZE } from "./config.js";
import { createWorld, updateWorld, WATER_Y } from "./world.js";
import { buildRoster } from "./roster.js";
import { Personaje } from "./personaje.js";
import { DragonBalls } from "./dragonBalls.js";
import { Match } from "./match.js";
import { Combat } from "./combat.js";
import { PlayerCamera, aiTick, updateSeenBars } from "./cameraAi.js";
import { renderHud } from "./ui.js";
import { setAudioListener } from "./sfx.js";
import { powerStyle } from "./powers.js";

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const labelR = new CSS2DRenderer();
labelR.domElement.style.position = "absolute";
labelR.domElement.style.top = "0";
labelR.domElement.style.pointerEvents = "none";
document.getElementById("hud").prepend(labelR.domElement);

const scene = new THREE.Scene();
const skyTex = (() => {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#8bc34a");
  grd.addColorStop(0.32, "#cddc39");
  grd.addColorStop(0.62, "#dce775");
  grd.addColorStop(1, "#fff59d");
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const sky = new THREE.CanvasTexture(c);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.magFilter = THREE.LinearFilter;
  return sky;
})();
scene.background = skyTex;
const fogLand = new THREE.Fog(0x9ccc65, 90, 1200);
const fogWater = new THREE.Fog(0x0277bd, 3, 70);
scene.fog = fogLand;
const uwEl = document.getElementById("uw");
const colWater = new THREE.Color(0x01579b);
let underWater = false;
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2600);
const _earFwd = new THREE.Vector3();
createWorld(scene);

const roster = buildRoster();
const zTeam = roster.filter((r) => r.faccion === "z");
const fTeam = roster.filter((r) => r.faccion === "f");
const people = roster.map((def) => {
  const team = def.faccion === "z" ? zTeam : fTeam;
  const i = team.indexOf(def);
  return new Personaje(def, i, TEAM_SIZE, scene);
});

const balls = new DragonBalls(scene);
const match = new Match();
const cam = new PlayerCamera(camera);
const combat = new Combat(scene, balls, cam, match);
let player = people.find((p) => p.nombre === "Gokú");
player.controller = "humano";
player.nameLabel.element.classList.add("yo");
const lockEl = document.createElement("div");
lockEl.className = "lock-xh";
lockEl.innerHTML = "<i></i><i></i><i></i><i></i>";
const lockMark = new CSS2DObject(lockEl);
lockMark.visible = false;

const keys = new Set();
let keysOn = true;
let locked = false;
let menuOpen = false;
const menuEl = document.getElementById("menu");

let spectating = false;
let spectateIdx = 0;

function viewChar() {
  return spectating ? people[spectateIdx] : player;
}

function setMenu(open) {
  menuOpen = open;
  menuEl.classList.toggle("open", open);
  if (open) document.exitPointerLock();
  document.getElementById("click-msg").style.display = locked || open ? "none" : "flex";
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
fillMenu();
document.getElementById("btn-continuar").onclick = () => setMenu(false);
document.getElementById("btn-spectate").onclick = () => startSpectate();

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
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
  document.getElementById("click-msg").style.display = locked || menuOpen ? "none" : "flex";
  if (locked) match.start();
});
addEventListener("mousemove", (e) => {
  if (!locked) return;
  if (spectating) cam.orbit -= e.movementX * 0.00115;
  else player.yaw -= e.movementX * 0.00115;
  cam.pitch = Math.max(-1.15, Math.min(0.85, cam.pitch - e.movementY * 0.0009));
});
addEventListener("keydown", (e) => {
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
      if (keys.has("Space") && (player.flyAlt > 0.22 || player.inSwim())) player.climb(dt);
      if (keys.has("KeyC")) player.descend(dt);
      if (keys.has("KeyF")) {
        if (player.superHold !== -99) {
          player.superHold = (player.superHold || 0) + dt;
          if (player.superHold >= 0.42 && combat.blast(player, true, people))
            player.superHold = -99;
        }
      } else player.superHold = 0;
    }
    for (const p of people) {
      if (spectating || p !== player) aiTick(p, people, balls, combat, match, dt);
      p.tick(dt);
    }
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
    renderer.toneMappingExposure = nowUw ? 0.62 : 1.05;
    uwEl.classList.toggle("on", nowUw);
  }
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
  renderer.render(scene, camera);
  labelR.render(scene, camera);
}
requestAnimationFrame(loop);
