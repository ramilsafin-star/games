// Звук без файлов: всё синтезирует WebAudio. Сверчки ночью, птицы на рассвете, треск костра
// (громче рядом с огнём), звон при ловле (выше с каждым светлячком в банке), уханье совы в начале ночи,
// ветер, гул Большой тени, фанфары рассвета, щелчки кнопок.
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, out = null, music = null, on = true;
let fireGain = null, fireFilter = null, windGain = null, droneGain = null, droneOsc = null;
let nextCricket = 0, nextPop = 0, nextBird = 0;
const env = { night: 0, dawn: 0, fire: 0.5, fireNear: 0, wind: 0, danger: 0, playing: false };

function make() {
  if (ctx || !AC) return ctx;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(comp).connect(ctx.destination);
  music = ctx.createGain();
  music.gain.value = 1;
  music.connect(out);
  // постоянные слои: костёр (шум), ветер, гул опасности
  const noise = noiseBuffer();
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  fireFilter = ctx.createBiquadFilter();
  fireFilter.type = "lowpass";
  fireFilter.frequency.value = 600;
  fireGain = ctx.createGain();
  fireGain.gain.value = 0;
  src.connect(fireFilter).connect(fireGain).connect(music);
  src.start();
  const src2 = ctx.createBufferSource();
  src2.buffer = noise;
  src2.loop = true;
  src2.playbackRate.value = 0.5;
  const wf = ctx.createBiquadFilter();
  wf.type = "bandpass";
  wf.frequency.value = 420;
  wf.Q.value = 0.6;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  src2.connect(wf).connect(windGain).connect(music);
  src2.start();
  droneOsc = ctx.createOscillator();
  droneOsc.type = "triangle";
  droneOsc.frequency.value = 55;
  const dl = ctx.createBiquadFilter();
  dl.type = "lowpass";
  dl.frequency.value = 220;
  droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneOsc.connect(dl).connect(droneGain).connect(music);
  droneOsc.start();
  return ctx;
}
let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.7 + (Math.random() * 2 - 1) * 0.3;
    d[i] = last * 2.2;
  }
  return noiseBuf;
}
const live = () => (ctx && on && ctx.state === "running" ? ctx : null);

function tone(f, d, { type = "sine", v = 0.12, slide = 1, delay = 0, attack = 0.006, to = out } = {}) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(to);
  o.start(t);
  o.stop(t + d + 0.05);
}
// колокольчик: основной тон и обертоны
function bell(f, v = 0.1, delay = 0, d = 1.2) {
  tone(f, d, { v, delay });
  tone(f * 2.76, d * 0.5, { v: v * 0.35, delay });
  tone(f * 5.4, d * 0.25, { v: v * 0.15, delay });
}
function noise(d, v, from, to, { delay = 0, type = "bandpass", q = 1, dest = out } = {}) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuffer();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.03, d * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random());
  src.stop(t + d + 0.05);
}
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

// сверчок: три быстрых щелчка высокого тона
function cricket(pan) {
  const a = live();
  if (!a) return;
  const f = 4200 + Math.random() * 900;
  const t0 = a.currentTime;
  const p = a.createStereoPanner ? a.createStereoPanner() : null;
  if (p) {
    p.pan.value = pan;
    p.connect(music);
  }
  const n = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.06;
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.018 * env.night, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(p || music);
    o.start(t);
    o.stop(t + 0.05);
  }
}
function bird() {
  const f = 2200 + Math.random() * 1400;
  for (let i = 0; i < 3; i++) tone(f * (1 + i * 0.12), 0.09, { v: 0.03 * env.dawn, slide: 1.35, delay: i * 0.11, to: music });
}

export const Sound = {
  get on() {
    return on;
  },
  set(v) {
    on = !!v;
    if (!on && ctx) ctx.suspend().catch(() => {});
  },
  // браузер даёт звук только после жеста игрока
  unlock() {
    if (!on) return;
    make();
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  },
  hush() {
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  },
  get state() {
    return ctx ? ctx.state : "none";
  },
  env,
  // раз в кадр: фоновые слои по обстановке
  tick(dt) {
    const a = live();
    if (!a) return;
    const t = a.currentTime;
    fireGain.gain.setTargetAtTime(0.05 + env.fireNear * 0.22 * (0.4 + env.fire), t, 0.2);
    fireFilter.frequency.setTargetAtTime(400 + env.fire * 900, t, 0.3);
    windGain.gain.setTargetAtTime(env.wind * 0.28, t, 0.4);
    droneGain.gain.setTargetAtTime(env.danger * 0.16, t, 0.3);
    droneOsc.frequency.setTargetAtTime(48 + env.danger * 20, t, 0.5);
    // треск поленьев
    if (t > nextPop) {
      nextPop = t + 0.05 + Math.random() * (0.5 - env.fire * 0.35);
      if (env.fireNear > 0.05) noise(0.03 + Math.random() * 0.04, 0.05 * env.fireNear * (0.3 + env.fire), 1800 + Math.random() * 2500, 900, { type: "bandpass", q: 3, dest: music });
    }
    if (t > nextCricket) {
      nextCricket = t + 0.25 + Math.random() * 0.9;
      if (env.night > 0.1) cricket(Math.random() * 1.6 - 0.8);
    }
    if (t > nextBird) {
      nextBird = t + 0.8 + Math.random() * 2.5;
      if (env.dawn > 0.3) bird();
    }
  },
  tap() {
    tone(880, 0.06, { type: "triangle", v: 0.06, slide: 1.2 });
  },
  catch(fill) {
    const f = PENTA[Math.min(PENTA.length - 1, fill)];
    bell(f, 0.09);
    tone(f * 2, 0.15, { type: "triangle", v: 0.04, slide: 1.5 });
  },
  rare() {
    [0, 2, 4, 7].forEach((k, i) => bell(PENTA[k % 8] * (k > 4 ? 2 : 1), 0.08, i * 0.08, 1.4));
  },
  feed(n) {
    for (let i = 0; i < Math.min(n, 7); i++) bell(PENTA[i] * 0.5, 0.06, i * 0.07, 0.8);
    noise(0.5, 0.08, 300, 1600, { type: "lowpass" });
  },
  garden() {
    [0, 2, 4, 5].forEach((k, i) => bell(PENTA[k], 0.06, i * 0.09, 1));
  },
  coin() {
    bell(1318.5, 0.07);
    bell(1760, 0.06, 0.07);
  },
  error() {
    tone(220, 0.16, { type: "square", v: 0.035, slide: 0.8 });
  },
  freeze() {
    for (let i = 0; i < 6; i++) tone(2400 - i * 280, 0.25, { type: "sine", v: 0.05, delay: i * 0.05 });
    noise(0.4, 0.12, 6000, 1500, { type: "highpass" });
  },
  thaw() {
    for (let i = 0; i < 5; i++) bell(PENTA[i], 0.05, i * 0.05, 0.6);
  },
  cookTick() {
    noise(0.05, 0.03, 2500, 2000, { q: 4 });
  },
  snack() {
    tone(660, 0.12, { type: "triangle", v: 0.08, slide: 1.6 });
    bell(1046.5, 0.07, 0.1);
  },
  eaten() {
    tone(180, 0.18, { type: "sawtooth", v: 0.05, slide: 0.7 });
    tone(150, 0.18, { type: "sawtooth", v: 0.05, slide: 0.7, delay: 0.2 });
    tone(900, 0.12, { v: 0.05, slide: 1.4, delay: 0.42 });
  },
  scatter() {
    for (let i = 0; i < 6; i++) tone(1400 + Math.random() * 1200, 0.15, { v: 0.03, slide: 0.6, delay: i * 0.03 });
  },
  owl() {
    const hoot = (d) => {
      tone(392, 0.32, { v: 0.07, delay: d, attack: 0.05, slide: 0.94, to: music });
      tone(784, 0.3, { v: 0.012, delay: d, attack: 0.05, to: music });
    };
    hoot(0);
    hoot(0.45);
    hoot(0.7);
  },
  boss() {
    tone(55, 2.2, { type: "sawtooth", v: 0.1, slide: 0.8, attack: 0.3 });
    tone(82, 2.0, { type: "triangle", v: 0.08, slide: 0.75, attack: 0.3 });
    noise(2, 0.08, 200, 80, { type: "lowpass" });
  },
  bossHit() {
    noise(0.12, 0.04, 3000, 5000, { type: "highpass" });
  },
  bossGone() {
    [0, 2, 4, 7, 9].forEach((k, i) => bell(PENTA[k % 8] * (k >= 8 ? 2 : 1), 0.09, i * 0.09, 1.6));
  },
  wind() {
    noise(2.4, 0.12, 300, 900, { type: "bandpass", q: 0.7 });
  },
  starfall() {
    for (let i = 0; i < 10; i++) bell(PENTA[(i * 3) % 8] * 2, 0.035, i * 0.09, 0.9);
  },
  growl() {
    tone(70, 0.8, { type: "sawtooth", v: 0.07, slide: 0.85, attack: 0.1 });
  },
  dawn() {
    [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 2.4, { type: "triangle", v: 0.06, attack: 0.25, delay: i * 0.12 }));
    [0, 2, 4, 5, 7].forEach((k, i) => bell(PENTA[k % 8], 0.06, 0.6 + i * 0.12, 1.5));
  },
  lost() {
    [392, 349.2, 311.1, 261.6].forEach((f, i) => tone(f, 0.6, { type: "triangle", v: 0.06, delay: i * 0.28 }));
  },
  night() {
    this.owl();
  },
  low() {
    tone(70, 0.18, { v: 0.12, slide: 0.7 });
    tone(70, 0.18, { v: 0.09, slide: 0.7, delay: 0.25 });
  },
  buy() {
    bell(987.8, 0.07);
    bell(1318.5, 0.07, 0.08);
    bell(1975.5, 0.05, 0.16);
  },
};
