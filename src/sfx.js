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
