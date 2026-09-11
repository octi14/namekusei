import bodyHit from "./assets/sound/effects/body hit 1.ogg";
import smallBlast from "./assets/sound/effects/small blast.ogg";
import jump1 from "./assets/sound/effects/jump1.ogg";
import throwPunch from "./assets/sound/effects/throw punch.ogg";
import chargingKiInit from "./assets/sound/effects/charging ki init.ogg";
import superHitsLand from "./assets/sound/effects/super hits land.ogg";
import chargingSuperLoop from "./assets/sound/effects/charging super  blast loop.ogg";
import throwKick from "./assets/sound/effects/throw kick.ogg";
import chargingBigBlast from "./assets/sound/effects/charging big blast 2.ogg";
import freezerSuperInit from "./assets/sound/effects/freezer super blast init.ogg";
import enhancedBigInit from "./assets/sound/effects/enhanced big blast init.ogg";
import longBlastShoot from "./assets/sound/effects/long blast shoot.ogg";
import bigBlastShoot from "./assets/sound/effects/big blast shoot 1.ogg";
import kiChargeLoop from "./assets/sound/effects/ki charging loop.ogg";
import kiChargeLoop2 from "./assets/sound/effects/ki charging loop 2.ogg";
import fullKi from "./assets/sound/effects/full ki and not charging.ogg";
import smallBlastHit from "./assets/sound/effects/small blast hit character.ogg";
import longBlastLand from "./assets/sound/effects/long blast hits land.ogg";
import smallBlastShoot2 from "./assets/sound/effects/small blast shoot 2.ogg";
import kickHit from "./assets/sound/effects/kick.ogg";
import bestBigInit from "./assets/sound/effects/best big blast init.ogg";
import bodyGetsHit from "./assets/sound/effects/body gets hit.ogg";
import smallBlastLand from "./assets/sound/effects/small blast hits land.ogg";
import kameCharge from "./assets/sound/effects/kame_charge.mp3";
import kameShoot from "./assets/sound/effects/kame_shoot.mp3";
import auraBurst from "./assets/sound/effects/aura-burst-sound-effect-dbz.mp3";
import { SFX_VOL } from "./config.js";

let ctx;

function ac() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setAudioListener(pos, fwd, up) {
  try {
    const l = ac().listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x;
      l.forwardY.value = fwd.y;
      l.forwardZ.value = fwd.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  } catch (_) {}
}

export function footstep(run, x, y, z, vol = 0.16) {
  try {
    const c = ac();
    const t = c.currentTime;
    const o = c.createOscillator();
    const n = c.createBufferSource();
    const buf = c.createBuffer(1, 2200, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = run ? 280 : 420;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (run ? 0.07 : 0.1));
    const pan = c.createPanner();
    pan.panningModel = "HRTF";
    pan.distanceModel = "inverse";
    pan.refDistance = 5;
    pan.maxDistance = 90;
    pan.rolloffFactor = 1.35;
    pan.coneInnerAngle = 360;
    if (pan.positionX) {
      pan.positionX.value = x;
      pan.positionY.value = y;
      pan.positionZ.value = z;
    } else pan.setPosition(x, y, z);
    o.type = "sine";
    o.frequency.setValueAtTime(run ? 70 : 95, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.06);
    o.connect(g);
    n.connect(f);
    f.connect(g);
    g.connect(pan);
    pan.connect(c.destination);
    o.start(t);
    o.stop(t + 0.08);
    n.start(t);
    n.stop(t + 0.1);
  } catch (_) {}
}

const URLS = {
  bodyHit,
  smallBlast,
  jump1,
  throwPunch,
  chargingKiInit,
  superHitsLand,
  chargingSuperLoop,
  throwKick,
  chargingBigBlast,
  freezerSuperInit,
  enhancedBigInit,
  longBlastShoot,
  bigBlastShoot,
  kiChargeLoop,
  kiChargeLoop2,
  fullKi,
  smallBlastHit,
  longBlastLand,
  smallBlastShoot2,
  kickHit,
  bestBigInit,
  bodyGetsHit,
  smallBlastLand,
  kameCharge,
  kameShoot,
  auraBurst,
};

const decoded = {};
const loops = new Map();

async function clip(name) {
  if (decoded[name]) return decoded[name];
  const c = ac();
  const r = await fetch(URLS[name]);
  decoded[name] = await c.decodeAudioData(await r.arrayBuffer());
  return decoded[name];
}

export function playSfx(name, x, y, z, vol = 0.45, loop = false, key = name) {
  try {
    const c = ac();
    clip(name).then((b) => {
      if (!b) return;
      const src = c.createBufferSource();
      src.buffer = b;
      src.loop = !!loop;
      const g = c.createGain();
      g.gain.value = vol * SFX_VOL;
      const pan = c.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "inverse";
      pan.refDistance = 8;
      pan.maxDistance = 110;
      pan.rolloffFactor = 1.2;
      if (pan.positionX) {
        pan.positionX.value = x;
        pan.positionY.value = y;
        pan.positionZ.value = z;
      } else pan.setPosition(x, y, z);
      src.connect(g);
      g.connect(pan);
      pan.connect(c.destination);
      if (loop) {
        const old = loops.get(key);
        if (old) try { old.stop(); } catch (_) {}
        loops.set(key, src);
        src.onended = () => {
          if (loops.get(key) === src) loops.delete(key);
        };
      }
      src.start();
    });
  } catch (_) {}
}

export function stopSfxLoop(name) {
  const src = loops.get(name);
  if (!src) return;
  try { src.stop(); } catch (_) {}
  loops.delete(name);
}

export function atPos(p) {
  const o = p.pos();
  return [o.x, o.y + (p.height || 1) * 0.6, o.z];
}
