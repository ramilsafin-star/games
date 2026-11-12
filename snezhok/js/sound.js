// Звук «Снежного кома»: всё синтезируется на лету, файлов нет.
// Эффекты и тихая музыка идут через общий компрессор, чтобы удары не перегружали динамик.
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ctx = null,
  out = null,
  music = null,
  on = true;

function ac() {
  if (!on || !AudioCtx) return null;
  try {
    if (!ctx) {
      ctx = new AudioCtx();
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -14;
      squash.ratio.value = 5;
      out = ctx.createGain();
      out.gain.value = 0.85;
      out.connect(squash).connect(ctx.destination);
      music = ctx.createGain();
      music.gain.value = 0.55;
      music.connect(out);
    }
    return ctx;
  } catch {
    return null;
  }
}
const live = () => {
  const a = ac();
  return a && a.state === "running" ? a : null;
};

function tone(f, d, type = "sine", v = 0.12, slide = 1, delay = 0, dest = null) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay,
    o = a.createOscillator(),
    g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(dest || out);
  o.start(t);
  o.stop(t + d + 0.05);
}
// колокольчик: основной тон и неровные обертоны
function bell(f, d, v, delay = 0, dest = null) {
  tone(f, d, "sine", v, 1, delay, dest);
  tone(f * 2.76, d * 0.5, "sine", v * 0.35, 1, delay, dest);
  tone(f * 5.4, d * 0.25, "sine", v * 0.12, 1, delay, dest);
}
const noiseCache = new Map();
function noise(d, v, from, to, delay = 0, type = "lowpass", q = 0.8) {
  const a = live();
  if (!a) return;
  const key = Math.round(d * 20);
  let buf = noiseCache.get(key);
  if (!buf) {
    const len = Math.max(1, Math.floor(a.sampleRate * d));
    buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    noiseCache.set(key, buf);
  }
  const t = a.currentTime + delay,
    src = a.createBufferSource(),
    filter = a.createBiquadFilter(),
    g = a.createGain();
  src.buffer = buf;
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + d);
  g.gain.value = v;
  src.connect(filter).connect(g).connect(out);
  src.start(t);
}

// ---------- Музыка: зимний мотив в до мажоре, слои включаются в заезде ----------
const BPM = 112;
const STEP = 60 / BPM / 4;
const BARS = [
  { root: 130.81, chord: [261.63, 329.63, 392.0] }, // C
  { root: 110.0, chord: [220.0, 261.63, 329.63] }, // Am
  { root: 87.31, chord: [174.61, 220.0, 261.63] }, // F
  { root: 98.0, chord: [196.0, 246.94, 293.66] }, // G
];
const MELODY = [0, -1, 2, -1, 1, -1, 2, 3, -1, 2, -1, 1, 0, -1, -1, -1];
let layer = 0, // 0 — меню, 1 — заезд, 2 — финал
  step = 0,
  nextAt = 0,
  timer = 0;
function voice(type, f, t, d, v, attack = 0.01, cutoff = 0) {
  const o = ctx.createOscillator(),
    g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    o.connect(lp).connect(g);
  } else o.connect(g);
  g.connect(music);
  o.start(t);
  o.stop(t + d + 0.05);
}
function schedule(n, t) {
  const bar = BARS[Math.floor(n / 16) % 4],
    s = n % 16;
  if (s === 0) for (const f of bar.chord) voice("triangle", f, t, STEP * 16, 0.02, 0.4);
  const note = MELODY[s];
  if (note >= 0 && (layer > 0 || s % 4 === 0)) {
    const f = bar.chord[note % 3] * (note === 3 ? 2 : 2);
    voice("sine", f, t, STEP * 3, 0.035, 0.005);
    voice("sine", f * 2.76, t, STEP * 1.2, 0.008, 0.005);
  }
  if (layer >= 1) {
    if (s % 4 === 0) voice("triangle", bar.root, t, STEP * 3.5, 0.08, 0.01, 900);
    if (s % 4 === 2) voice("triangle", bar.root * 1.5, t, STEP * 1.5, 0.04, 0.01, 900);
    if (s % 4 === 0) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(music);
      o.start(t);
      o.stop(t + 0.18);
    }
    if (s % 2 === 1) {
      const src = ctx.createBufferSource();
      const len = Math.floor(ctx.sampleRate * 0.03);
      if (!hatBuf) {
        hatBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = hatBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      src.buffer = hatBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      src.connect(hp).connect(g).connect(music);
      src.start(t);
    }
  }
  if (layer >= 2 && s % 2 === 0) voice("square", bar.chord[(s / 2) % 3] * 2, t, STEP * 0.8, 0.012, 0.004, 2600);
}
let hatBuf = null;
function pump() {
  const a = live();
  if (!a) return;
  if (nextAt < a.currentTime) nextAt = a.currentTime + 0.05;
  while (nextAt < a.currentTime + 0.25) {
    schedule(step++, nextAt);
    nextAt += STEP;
  }
}

let probe = null;
let flakeChain = 0,
  flakeAt = 0;
export const Sound = {
  get ctx() {
    return ctx;
  },
  // Для проверок: пик сигнала на выходе (0..1) и состояние звука.
  level() {
    if (!ctx) return { state: "none", peak: 0 };
    if (!probe) {
      probe = ctx.createAnalyser();
      probe.fftSize = 2048;
      out.connect(probe);
    }
    const data = new Float32Array(probe.fftSize);
    probe.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    return { state: ctx.state, peak };
  },
  get on() {
    return on;
  },
  set(value) {
    on = !!value && !!AudioCtx;
    if (!on) ctx?.suspend().catch(() => {});
  },
  // Звук включается только по нажатию игрока
  unlock() {
    const a = ac();
    if (!a) return;
    if (a.state !== "running") a.resume().catch(() => {});
    if (!timer) timer = setInterval(pump, 60);
  },
  // Пауза, свёрнутая игра, реклама: тишина целиком
  hush() {
    ctx?.suspend().catch(() => {});
  },
  mood(value) {
    layer = value;
  },
  tap: () => tone(880, 0.06, "triangle", 0.07),
  flake() {
    const a = live();
    if (!a) return;
    flakeChain = a.currentTime - flakeAt < 0.5 ? Math.min(flakeChain + 1, 12) : 0;
    flakeAt = a.currentTime;
    const f = 1046.5 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28][flakeChain] / 12);
    bell(f, 0.22, 0.05);
  },
  pile: (big) => (noise(0.12, 0.16, 2200, 500), tone(big ? 330 : 440, 0.14, "triangle", 0.09, 1.6)),
  good: (mul) => [0, 4, 7, mul ? 12 : 9].forEach((k, i) => bell(523.25 * Math.pow(2, k / 12), 0.3, 0.07, i * 0.055)),
  bad: () => (tone(330, 0.32, "sawtooth", 0.05, 0.55), tone(220, 0.36, "triangle", 0.08, 0.6, 0.03)),
  hit: (big) => (noise(big ? 0.4 : 0.24, big ? 0.5 : 0.35, 1600, 150), tone(big ? 70 : 95, 0.25, "sine", 0.22, 0.5)),
  jump: () => (noise(0.35, 0.12, 400, 2600, 0, "bandpass", 1.2), tone(300, 0.3, "triangle", 0.06, 2.2)),
  land: () => (noise(0.18, 0.22, 900, 120), tone(80, 0.16, "sine", 0.16, 0.6)),
  wall: (broke) =>
    broke
      ? (noise(0.6, 0.45, 5200, 300), noise(0.3, 0.25, 9000, 3000, 0.03, "highpass"), tone(60, 0.5, "sine", 0.28, 0.5))
      : (noise(0.3, 0.3, 700, 100), tone(65, 0.4, "sine", 0.24, 0.7)),
  step: (k) => bell(392 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12, 14, 16][Math.min(9, k - 1)] / 12), 0.35, 0.08),
  boss: () => (noise(1.2, 0.55, 3000, 60), tone(48, 1.0, "sine", 0.32, 0.5), [0, 4, 7, 12, 16].forEach((k, i) => bell(523.25 * Math.pow(2, k / 12), 0.5, 0.07, 0.2 + i * 0.08))),
  bounce: () => (tone(180, 0.5, "sine", 0.18, 2.2), tone(240, 0.4, "triangle", 0.08, 0.5, 0.15)),
  fall: () => tone(520, 1.0, "triangle", 0.12, 0.2),
  melt: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "triangle", 0.1, 0.94, i * 0.13)),
  won: () => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, 0.5, 0.08, i * 0.11)),
  coin: () => [1318.5, 1568, 2093].forEach((f, i) => bell(f, 0.18, 0.05, i * 0.05)),
  buy: () => [659.25, 880, 1174.7].forEach((f, i) => bell(f, 0.25, 0.07, i * 0.07)),
  crush: () => (noise(0.25, 0.22, 600, 90), tone(55, 0.2, "sine", 0.12, 0.7)),
  steam: () => noise(0.7, 0.12, 900, 3000, 0, "bandpass", 0.6),
  hint: () => (bell(784, 0.3, 0.05), bell(1046.5, 0.35, 0.05, 0.1)),
  // ---------- монстры и оружие ----------
  shot: () => (noise(0.08, 0.14, 2600, 700), tone(520, 0.08, "triangle", 0.05, 0.5)),
  pow: () => (noise(0.12, 0.16, 1400, 300), tone(180, 0.1, "sine", 0.08, 0.6)),
  kill(kind, how) {
    // мягкий хруст снега и весёлый звон: монстр рассыпался снежками
    noise(kind === "imp" ? 0.18 : 0.35, kind === "imp" ? 0.2 : 0.32, 2400, 200);
    tone(kind === "imp" ? 140 : 90, 0.22, "sine", 0.16, 0.5);
    if (how !== "bite") [0, 4, 7].forEach((k, i) => bell(784 * Math.pow(2, k / 12), 0.22, 0.05, 0.05 + i * 0.05));
  },
  bite: () => (noise(0.14, 0.25, 3000, 900, 0, "bandpass", 2), tone(420, 0.12, "square", 0.03, 0.6)),
  bonk: () => (tone(160, 0.5, "sine", 0.2, 2.4), noise(0.25, 0.3, 900, 120), tone(90, 0.3, "triangle", 0.1, 0.6, 0.05)),
  drain: () => tone(300, 0.35, "sine", 0.04, 0.6),
  pickup(kind) {
    const base = kind === "gun" ? 523.25 : kind === "spike" ? 659.25 : kind === "wave" ? 392 : 587.3;
    [0, 4, 7, 12].forEach((k, i) => bell(base * Math.pow(2, k / 12), 0.3, 0.06, i * 0.04));
    if (kind === "spike") noise(0.4, 0.08, 6000, 9000, 0.05, "highpass");
    if (kind === "boost") noise(0.3, 0.12, 500, 3000, 0, "bandpass", 1.2);
  },
  wave: () => (noise(0.9, 0.45, 300, 4000, 0, "bandpass", 0.7), tone(70, 0.6, "sine", 0.28, 0.5)),
  spirit: () => (noise(0.8, 0.12, 600, 2400, 0, "bandpass", 3), tone(660, 0.6, "sine", 0.04, 0.5)),
  chase: () => (noise(1.6, 0.4, 120, 60), tone(45, 1.4, "sine", 0.3, 0.8)),
  caught: () => (noise(0.9, 0.5, 2000, 80), tone(60, 0.6, "sine", 0.3, 0.5)),
  escape: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, 0.35, 0.07, i * 0.07)),
  thud: () => (noise(0.3, 0.3, 700, 90), tone(55, 0.3, "sine", 0.22, 0.6)),
  smash: () => (noise(0.3, 0.3, 4000, 400), tone(110, 0.15, "sine", 0.1, 0.6)),
  start: () => [392, 523.25, 659.25].forEach((f, i) => bell(f, 0.25, 0.06, i * 0.07)),
};
