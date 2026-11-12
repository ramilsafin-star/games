// Звук «Линии спасения»: всё синтезируется WebAudio на лету, файлов нет.
// Эффекты и тихая музыка идут через общий компрессор.
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null,
  out = null,
  musicBus = null,
  on = true,
  touched = false, // контекст создаём только после первого нажатия игрока
  timer = 0;

function ac() {
  if (!on || !AC || !touched) return null;
  try {
    if (!ctx) {
      ctx = new AC();
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -14;
      squash.ratio.value = 5;
      out = ctx.createGain();
      out.gain.value = 0.85;
      out.connect(squash).connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(out);
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

function tone(f, d, type = "sine", v = 0.12, slide = 1, delay = 0, bus = null) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay,
    o = a.createOscillator(),
    g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus || out);
  o.start(t);
  o.stop(t + d + 0.05);
}
let noiseBuf = null;
function noise(d, v, from, to, delay = 0, type = "bandpass", q = 1) {
  const a = live();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + delay,
    src = a.createBufferSource(),
    f = a.createBiquadFilter(),
    g = a.createGain();
  src.buffer = noiseBuf;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + d + 0.05);
}

// ---------- Непрерывные звуки: скрип пера и жужжание жуков ----------
let scratch = null,
  buzz = null;
function loopNoise(freq, q, type) {
  const a = live();
  if (!a) return null;
  if (!noiseBuf) noise(0.01, 0.0001, 100, 100);
  const src = a.createBufferSource(),
    f = a.createBiquadFilter(),
    g = a.createGain();
  src.buffer = noiseBuf;
  src.loop = true;
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.value = 0;
  src.connect(f).connect(g).connect(out);
  src.start();
  return { src, f, g };
}
function buzzVoice() {
  const a = live();
  if (!a) return null;
  const o = a.createOscillator(),
    o2 = a.createOscillator(),
    lfo = a.createOscillator(),
    lg = a.createGain(),
    f = a.createBiquadFilter(),
    g = a.createGain();
  o.type = "sawtooth";
  o.frequency.value = 196;
  o2.type = "sawtooth";
  o2.frequency.value = 203;
  lfo.frequency.value = 23;
  lg.gain.value = 14;
  lfo.connect(lg);
  lg.connect(o.frequency);
  lg.connect(o2.frequency);
  f.type = "bandpass";
  f.frequency.value = 900;
  f.Q.value = 2;
  g.gain.value = 0;
  o.connect(f);
  o2.connect(f);
  f.connect(g).connect(out);
  o.start();
  o2.start();
  lfo.start();
  return { g, o, o2, lfo };
}

// ---------- Музыка: тихий пентатонический мотив, своя тоника у каждой главы ----------
const ROOTS = [261.6, 233.1, 293.7, 220.0, 196.0, 246.9];
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const MOTIF = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 3, 2];
let chapter = 0,
  step = 0,
  nextAt = 0,
  musicOn = false;
const BEAT = 60 / 96 / 2;
function pump() {
  const a = live();
  if (!a || !musicOn) return;
  if (nextAt < a.currentTime) nextAt = a.currentTime + 0.05;
  while (nextAt < a.currentTime + 0.25) {
    const root = ROOTS[chapter];
    const n = step % 32;
    const at = nextAt - a.currentTime;
    if (n % 2 === 0) {
      const deg = MOTIF[(n / 2) % 16] + (step % 64 >= 32 ? 1 : 0);
      const f = root * Math.pow(2, SCALE[deg % SCALE.length] / 12);
      tone(f * 2, BEAT * 1.8, "triangle", 0.035, 1, at, musicBus);
    }
    if (n % 8 === 0) tone(root / 2, BEAT * 7, "sine", 0.05, 1, at, musicBus);
    if (n % 8 === 4) tone((root / 2) * 1.5, BEAT * 3, "sine", 0.03, 1, at, musicBus);
    if (n % 4 === 2) noise(0.03, 0.012, 7000, 5000, at, "highpass");
    step++;
    nextAt += BEAT;
  }
}

let probe = null;
export const Sound = {
  get on() {
    return on;
  },
  get ctx() {
    return ctx;
  },
  set(v) {
    on = !!AC && v;
    if (!on) ctx?.suspend().catch(() => {});
  },
  toggle() {
    this.set(!on);
    if (on) this.unlock();
    return on;
  },
  // Нажатие игрока: включаем звук (браузеры разрешают его только после касания)
  unlock() {
    touched = true;
    const a = ac();
    if (!a) return;
    if (a.state !== "running") a.resume().catch(() => {});
    if (!timer) timer = setInterval(pump, 60);
  },
  hush() {
    this.scratch(0);
    this.buzz(0);
    ctx?.suspend().catch(() => {});
  },
  // Для проверок: состояние и пик сигнала
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
  music(ch, play = true) {
    chapter = ch;
    musicOn = play;
  },
  // скрип пера: громкость по скорости руки
  scratch(speed) {
    const a = live();
    if (!a) return;
    if (!scratch && speed > 0) scratch = loopNoise(2600, 0.8, "bandpass");
    if (!scratch) return;
    const v = Math.min(0.09, speed * 0.0009);
    scratch.g.gain.setTargetAtTime(v, a.currentTime, 0.03);
    scratch.f.frequency.setTargetAtTime(2000 + Math.min(2500, speed * 6), a.currentTime, 0.05);
  },
  buzz(n) {
    const a = live();
    if (!a) return;
    if (!buzz && n > 0) buzz = buzzVoice();
    if (!buzz) return;
    buzz.g.gain.setTargetAtTime(Math.min(0.05, n * 0.004), a.currentTime, 0.1);
  },
  tap: () => tone(660, 0.07, "triangle", 0.08, 1.3),
  back: () => tone(520, 0.08, "triangle", 0.07, 0.75),
  penUp: () => (tone(520, 0.1, "sine", 0.1, 1.6), tone(1040, 0.12, "triangle", 0.05, 1, 0.05)),
  blocked: () => (tone(180, 0.12, "square", 0.05, 0.7), noise(0.08, 0.06, 900, 300)),
  short: () => tone(300, 0.1, "sine", 0.06, 0.8),
  go: () => (noise(0.35, 0.08, 400, 2400), tone(330, 0.25, "triangle", 0.07, 2)),
  thud: (v = 1) => (noise(0.18, 0.12 * Math.min(1.5, v), 500, 90, 0, "lowpass"), tone(90, 0.16, "sine", 0.14 * Math.min(1.5, v), 0.6)),
  bonk: () => tone(900 + Math.random() * 500, 0.04, "square", 0.025, 0.6),
  knock: (v = 1) => (noise(0.12, 0.1 * Math.min(2, v / 3), 1400, 300), tone(140, 0.1, "triangle", 0.08, 0.7)),
  boom: () => (noise(0.5, 0.32, 1600, 80, 0, "lowpass"), tone(70, 0.4, "sine", 0.25, 0.5)),
  splash: (lava) => noise(0.18, 0.05, lava ? 900 : 2400, lava ? 300 : 800),
  spawn: () => tone(330 + Math.random() * 80, 0.08, "sawtooth", 0.015, 1.4),
  hit: () => (tone(700, 0.12, "square", 0.08, 0.6), tone(480, 0.3, "triangle", 0.12, 0.5, 0.08), noise(0.2, 0.12, 2000, 400)),
  eat: () => [0, 0.09, 0.18].forEach((d) => noise(0.06, 0.12, 1800, 700, d)),
  spring: () => tone(220, 0.35, "sine", 0.16, 3.2),
  click: () => (tone(1200, 0.05, "square", 0.05), tone(800, 0.08, "triangle", 0.06, 1, 0.05)),
  door: () => noise(0.5, 0.06, 300, 900),
  home: () => (tone(784, 0.12, "triangle", 0.1), tone(1175, 0.2, "triangle", 0.1, 1, 0.08)),
  crash: () => (noise(0.3, 0.2, 900, 120, 0, "lowpass"), tone(200, 0.3, "square", 0.07, 0.5)),
  hint: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.25, "sine", 0.08, 1, i * 0.08)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, "triangle", 0.13, 1, i * 0.1)),
  star: (n) => tone([880, 1109, 1319][n] || 1319, 0.35, "triangle", 0.14, 1.02),
  lose: () => (tone(392, 0.25, "triangle", 0.12, 0.94), tone(330, 0.25, "triangle", 0.12, 0.94, 0.22), tone(262, 0.6, "triangle", 0.12, 0.85, 0.44)),
  chapter: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, "triangle", 0.12, 1, i * 0.12)),
};
