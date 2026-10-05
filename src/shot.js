// Página de capturas (solo dev): /shot.html?who=Gohan&view=head|body
// Renderiza frente / perfil / espalda / 3-4 en una tira; window.__shotReady = true al terminar.
import * as THREE from "three";
import { makeBody, sculptAltura } from "./body.js";
import { lookFor } from "./looks.js";
import { hydratePack } from "./pack.js";

const q = new URLSearchParams(location.search);
const who = q.get("who") || "Gohan";
const view = q.get("view") || "head";
const S = +(q.get("size") || 360);
const angles = (q.get("a") || "0,90,180,45").split(",").map((x) => THREE.MathUtils.degToRad(+x));

await hydratePack();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(S * angles.length, S);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2332);
scene.add(new THREE.HemisphereLight(0xcde7ff, 0x3e2723, 1.1));
const key = new THREE.DirectionalLight(0xfff3e0, 1.35);
key.position.set(3, 6, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x90caf9, 0.45);
fill.position.set(-4, 2, -2);
scene.add(fill);

const look = { ...lookFor(who, "z", who), who };
const over = {};
for (const kv of (q.get("sc") || "").split(",").filter(Boolean)) {
  const [k, v] = kv.split(":");
  over[k] = +v;
}
const mesh = makeBody(sculptAltura(who), look, over, {});
scene.add(mesh);
if (q.get("nool")) for (const o of mesh.userData.outlines || []) o.visible = false;
mesh.updateMatrixWorld(true);

const box = new THREE.Box3();
if (view === "head") {
  let headG = null;
  mesh.traverse((o) => {
    if (!headG && o.userData?.moldId === "head") headG = o;
  });
  box.setFromObject(headG || mesh);
  box.expandByScalar(box.getSize(new THREE.Vector3()).y * 0.35);
  if (q.get("list")) {
    const v = new THREE.Vector3();
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.getWorldPosition(v);
      const b = new THREE.Box3().setFromObject(o);
      console.log("MESH", o.userData.moldId, o.geometry.type, o.parent?.type, b.max.y.toFixed(3), v.toArray().map((x) => x.toFixed(3)).join(","));
    });
  }
} else box.setFromObject(mesh);
const c = box.getCenter(new THREE.Vector3());
const r = box.getSize(new THREE.Vector3()).length() * 0.5;
const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
const d = r / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05;

const draw = () =>
  angles.forEach((a, i) => {
    cam.position.set(c.x + Math.sin(a) * d, c.y + d * 0.12, c.z + Math.cos(a) * d);
    cam.lookAt(c);
    renderer.setViewport(i * S, 0, S, S);
    renderer.setScissor(i * S, 0, S, S);
    renderer.render(scene, cam);
  });
// varios frames: las caras (decal) cargan su textura en diferido
let frames = 0;
const loop = () => {
  draw();
  if (++frames < 90) requestAnimationFrame(loop);
  else window.__shotReady = true;
};
loop();
