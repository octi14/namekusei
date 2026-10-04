import * as THREE from "three";

/** Partículas en pool: un solo draw call para chispas, polvo y ki. */
const N = 900;
let pts = null;
const pos = new Float32Array(N * 3);
const col = new Float32Array(N * 3);
const size = new Float32Array(N);
const vel = new Float32Array(N * 3);
const life = new Float32Array(N);
const life0 = new Float32Array(N);
const size0 = new Float32Array(N);
const grav = new Float32Array(N);
const drag = new Float32Array(N);
let head = 0;
let alive = 0;
const _c = new THREE.Color();

export function fxInit(scene) {
  if (pts) {
    scene.add(pts);
    return;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uScale: { value: innerHeight * 0.5 } },
    vertexShader: `attribute float size; varying vec3 vC; uniform float uScale;
void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
gl_PointSize = size * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q,q);
if (d > 0.25) discard; float a = smoothstep(0.25, 0.0, d); gl_FragColor = vec4(vC * a, a); }`,
  });
  pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);
  addEventListener("resize", () => (m.uniforms.uScale.value = innerHeight * 0.5));
}

function emit(x, y, z, vx, vy, vz, hex, sz, t, g = 0, dr = 0) {
  const i = head;
  head = (head + 1) % N;
  const k = i * 3;
  pos[k] = x;
  pos[k + 1] = y;
  pos[k + 2] = z;
  vel[k] = vx;
  vel[k + 1] = vy;
  vel[k + 2] = vz;
  _c.setHex(hex);
  col[k] = _c.r;
  col[k + 1] = _c.g;
  col[k + 2] = _c.b;
  size0[i] = sz;
  size[i] = sz;
  life[i] = life0[i] = t;
  grav[i] = g;
  drag[i] = dr;
  alive = N;
}

const rnd = (a) => (Math.random() - 0.5) * 2 * a;

/** Chispas de impacto. */
export function fxSparks(p, hex = 0xffd54f, n = 18, spd = 14) {
  if (!pts) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const r = Math.sqrt(1 - u * u);
    const s = spd * (0.4 + Math.random() * 0.8);
    emit(p.x, p.y, p.z, Math.cos(a) * r * s, u * s * 0.7 + 3, Math.sin(a) * r * s, i % 3 ? hex : 0xffffff, 0.16 + Math.random() * 0.12, 0.25 + Math.random() * 0.3, -22, 2.5);
  }
}

/** Explosión grande: brasas + humo claro. */
export function fxBoom(p, hex = 0xffb74d) {
  if (!pts) return;
  fxSparks(p, hex, 40, 26);
  for (let i = 0; i < 26; i++) {
    emit(p.x + rnd(1.2), p.y + rnd(0.8), p.z + rnd(1.2), rnd(6), 2 + Math.random() * 6, rnd(6), 0x6d5d4b, 1.1 + Math.random() * 1.3, 0.8 + Math.random() * 0.6, 1.5, 1.6);
  }
}

/** Polvo al aterrizar / golpe contra el piso. */
export function fxDust(p, n = 16, hex = 0x8d7b5f) {
  if (!pts) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const s = 4 + Math.random() * 4;
    emit(p.x, p.y + 0.15, p.z, Math.cos(a) * s, 0.6 + Math.random() * 1.5, Math.sin(a) * s, hex, 0.55 + Math.random() * 0.5, 0.5 + Math.random() * 0.35, -1, 3.2);
  }
}

/** Ki subiendo alrededor de alguien que carga. */
export function fxKiRise(p, h, hex, rate, dt) {
  if (!pts) return;
  let n = rate * dt;
  while (n > 0) {
    if (n < 1 && Math.random() > n) break;
    n -= 1;
    const a = Math.random() * Math.PI * 2;
    const r = 0.45 + Math.random() * 0.45;
    emit(p.x + Math.cos(a) * r, p.y + Math.random() * h * 0.5, p.z + Math.sin(a) * r, 0, 3.5 + Math.random() * 3, 0, Math.random() < 0.3 ? 0xffffff : hex, 0.1 + Math.random() * 0.1, 0.45 + Math.random() * 0.35, 0, 0.5);
  }
}

/** Estela de vuelo rápido. */
export function fxTrail(p, hex = 0xe0f7fa) {
  if (!pts) return;
  emit(p.x + rnd(0.25), p.y + rnd(0.25), p.z + rnd(0.25), 0, 0, 0, hex, 0.22, 0.28, 0, 0);
}

export function fxTick(dt) {
  if (!pts || !alive) return;
  let any = 0;
  for (let i = 0; i < N; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    const k = i * 3;
    if (life[i] <= 0) {
      size[i] = 0;
      continue;
    }
    any++;
    const f = Math.max(0, 1 - drag[i] * dt);
    vel[k] *= f;
    vel[k + 1] = vel[k + 1] * f + grav[i] * dt;
    vel[k + 2] *= f;
    pos[k] += vel[k] * dt;
    pos[k + 1] += vel[k + 1] * dt;
    pos[k + 2] += vel[k + 2] * dt;
    const u = life[i] / life0[i];
    size[i] = size0[i] * (0.35 + 0.65 * u);
    col[k] *= 0.985;
    col[k + 1] *= 0.985;
    col[k + 2] *= 0.985;
  }
  alive = any;
  const g = pts.geometry;
  g.attributes.position.needsUpdate = true;
  g.attributes.color.needsUpdate = true;
  g.attributes.size.needsUpdate = true;
}
