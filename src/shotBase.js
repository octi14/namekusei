// Página de capturas de bases (solo dev): /shotBase.html?base=f|z&a=20,0,90,180&el=28,55,6,-10
// a = azimut en grados (0 = desde la puerta), el = elevación por vista. window.__shotReady al terminar.
import * as THREE from "three";
import * as Bases from "./bases.js";

const { bindBaseWorld, buildFreezerBase, buildCapsuleCorpBase, baseOrigin, baseDoorDir } = Bases;
window.__bases = Bases;

const q = new URLSearchParams(location.search);
const fac = q.get("base") === "z" ? "z" : "f";
const S = +(q.get("size") || 520);
const deg = THREE.MathUtils.degToRad;
const az = (q.get("a") || "25,0,90,160").split(",").map((x) => deg(+x));
const el = (q.get("el") || "26,55,4,-12").split(",").map((x) => deg(+x));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(S * az.length, S);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3d42);
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x4a4036, 1.15));
const key = new THREE.DirectionalLight(0xfff6ea, 1.5);
key.position.set(40, 90, 60);
scene.add(key);

bindBaseWorld({ groundHeight: () => 0, addObst() {} });
const g = fac === "z" ? buildCapsuleCorpBase(scene) : buildFreezerBase(scene);
g.updateMatrixWorld(true);
if (q.get("ground")) {
  const gr = new THREE.Mesh(new THREE.CircleGeometry(90, 48), new THREE.MeshLambertMaterial({ color: 0x6b8f5a }));
  gr.rotation.x = -Math.PI / 2;
  gr.position.set(g.position.x, -0.02, g.position.z);
  scene.add(gr);
}

const o = baseOrigin(fac);
const door = baseDoorDir(fac);
const box = new THREE.Box3().setFromObject(g);
const c = new THREE.Vector3(o.x, box.getCenter(new THREE.Vector3()).y + +(q.get("dy") || 0), o.z);
const r = box.getSize(new THREE.Vector3()).length() * 0.5;
const cam = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
const d = (r / Math.sin(deg(15))) * 1.0 / +(q.get("zoom") || 1);

// Vistas interiores: in=px,py,pz,tx,ty,tz;... (relativas al origen de la base; z hacia la puerta = +f)
const inViews = (q.get("in") || "").split(";").filter(Boolean).map((v) => v.split(",").map(Number));
if (inViews.length) {
  renderer.setSize(S * inViews.length, S);
  cam.fov = +(q.get("fov") || 70);
  cam.near = 0.1;
  cam.updateProjectionMatrix();
}
const P = (x, y, z) => new THREE.Vector3(o.x + x, y, o.z + z * door);

const draw = () =>
  inViews.length
    ? inViews.forEach(([px, py, pz, tx, ty, tz], i) => {
        cam.position.copy(P(px, py, pz));
        cam.lookAt(P(tx, ty, tz));
        renderer.setViewport(i * S, 0, S, S);
        renderer.setScissor(i * S, 0, S, S);
        renderer.render(scene, cam);
      })
    : az.forEach((a, i) => {
    const e = el[i] ?? el[el.length - 1];
    cam.position.set(c.x + Math.sin(a) * Math.cos(e) * d, c.y + Math.sin(e) * d, c.z + door * Math.cos(a) * Math.cos(e) * d);
    cam.lookAt(c);
    renderer.setViewport(i * S, 0, S, S);
    renderer.setScissor(i * S, 0, S, S);
    renderer.render(scene, cam);
  });
let frames = 0;
const loop = () => {
  draw();
  if (++frames < 20) requestAnimationFrame(loop);
  else window.__shotReady = true;
};
loop();
