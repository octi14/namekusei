import * as THREE from "three";
import { Personaje } from "./personaje.js";

/**
 * Pantalla de fin: el top scorer (más kills; desempate por daño) de cada equipo,
 * en idle, sobre su propio canvas. Rojo (z) a la izquierda, azul (f) a la derecha.
 */
let R = null;

function topScorer(people, fac) {
  return people
    .filter((o) => o.faccion === fac && o._def)
    .sort((a, b) => b.st.k - a.st.k || b.st.dmg - a.st.dmg)[0];
}

function statsHtml(o, fac) {
  if (!o) return `<div class="es-col t-${fac}"></div>`;
  return (
    `<div class="es-col t-${fac}">` +
    `<div class="es-tag">TOP · ${fac === "z" ? "ROJO" : "AZUL"}</div>` +
    `<div class="es-name">${o.alias || o.nombre}</div>` +
    `<div class="es-st"><b>${o.st.k}</b> K · <b>${o.st.d}</b> D</div>` +
    `<div class="es-st"><b>${o.st.esf}</b> ESF · <b>${Math.round(o.st.dmg)}</b> DMG</div>` +
    `</div>`
  );
}

/** Fondo vertical: noche con brillo del color del ganador abajo. */
function bgTex(win) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  const glow = win === "z" ? "#5a1a0c" : win === "f" ? "#0c3a5a" : "#2a2a3a";
  g.addColorStop(0, "#020308");
  g.addColorStop(0.55, "#0a0c16");
  g.addColorStop(1, glow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTex() {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, "rgba(60,64,80,1)");
  g.addColorStop(0.6, "rgba(24,26,36,0.9)");
  g.addColorStop(1, "rgba(5,6,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let r = 18; r < n / 2; r += 18) {
    ctx.beginPath();
    ctx.arc(n / 2, n / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function build(people, win) {
  const canvas = document.getElementById("end-show");
  const info = document.getElementById("end-tops");
  if (!canvas || !info) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = bgTex(win);
  scene.fog = new THREE.Fog(0x05060a, 14, 40);
  scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x1a1020, 0.7));
  const key = new THREE.DirectionalLight(0xfff3e0, 1.5);
  key.position.set(1.5, 6, 7);
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshBasicMaterial({ map: floorTex(), transparent: true }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const chars = [];
  let maxH = 1;
  for (const [fac, x, col] of [
    ["z", -1, 0xff6e40],
    ["f", 1, 0x4fc3f7],
  ]) {
    const src = topScorer(people, fac);
    if (!src) continue;
    const holder = new THREE.Group();
    scene.add(holder);
    const c = new Personaje(src._def, 0, 1, holder);
    c.controller = "show";
    if (c.trail) c.trail.visible = false;
    if (c.teamRing) c.teamRing.visible = false;
    c.ssj = !!src.ssj;
    // El mesh queda en coords de mundo (spawn en base, en seco); el holder lo trae al origen del showcase.
    const mp = c.mesh.position;
    const slot = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    slot.add(pad);
    // Foco del color del equipo desde arriba-adelante + contraluz
    const spot = new THREE.SpotLight(col, 40, 18, 0.45, 0.6, 1.4);
    spot.position.set(0, 7, 3);
    spot.target = pad;
    slot.add(spot);
    const back = new THREE.PointLight(col, 6, 8, 1.5);
    back.position.set(0, 2.2, -1.6);
    slot.add(back);
    scene.add(slot);
    chars.push({ c, holder, slot, x, base: mp.clone(), mp: mp.clone() });
    maxH = Math.max(maxH, c.height);
  }
  info.innerHTML = statsHtml(topScorer(people, "z"), "z") + statsHtml(topScorer(people, "f"), "f");
  return { renderer, scene, cam, chars, canvas, t: 0, maxH, w: 0, h: 0 };
}

/** Ubica a los dos y la cámara según el aspecto. */
function layout(R) {
  const { cam, chars, maxH } = R;
  const aspect = R.w / Math.max(1, R.h);
  const gap = maxH * 0.62;
  for (const ch of chars) {
    ch.holder.position.set(-ch.mp.x + ch.x * gap, -ch.mp.y, -ch.mp.z);
    ch.slot.position.set(ch.x * gap, 0, 0);
  }
  const fitW = (gap + maxH * 0.45) / Math.max(0.35, aspect * 0.29);
  const dist = Math.max(maxH * 2.4, fitW);
  cam.aspect = aspect;
  cam.position.set(0, maxH * 0.6, dist);
  cam.lookAt(0, maxH * 0.5, 0);
  cam.updateProjectionMatrix();
}

export function updateEndShowcase(match, people, dt) {
  if (!match?.finish?.stats) {
    if (R) disposeEndShowcase();
    return;
  }
  if (!R) R = build(people, match.finish.team);
  if (!R) return;
  const { renderer, scene, cam, chars, canvas } = R;
  R.t += dt;
  const w = canvas.clientWidth | 0;
  const h = canvas.clientHeight | 0;
  if (w && h && (R.w !== w || R.h !== h)) {
    R.w = w;
    R.h = h;
    renderer.setSize(w, h, false);
    layout(R);
  }
  for (const ch of chars) {
    const c = ch.c;
    c.didMove = false;
    c.volando = false;
    c.flyAlt = 0;
    c.mesh.rotation.y = Math.sin(R.t * 0.5 + ch.x) * 0.3 - ch.x * 0.3;
    c.animate(dt);
    c.mesh.position.copy(ch.base);
  }
  renderer.render(scene, cam);
}

export function disposeEndShowcase() {
  if (!R) return;
  // Geometrías/materiales se comparten con los personajes del juego (caches): no liberarlos.
  R.renderer.dispose();
  R.renderer.forceContextLoss();
  R = null;
}
