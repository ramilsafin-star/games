// Звук «Стража орбиты»: всё синтезируется на лету, файлов нет.
// Эффекты и тихая музыка идут через общий компрессор, чтобы взрывы не перегружали динамик.
import { readStorage, writeStorage } from "./kit.js?v=ab118089";

const Audio = window.AudioContext || window.webkitAudioContext;
let ctx = null,
  out = null,
  on = !!Audio && readStorage("strazh_mute") !== "1";

function ac() {
  if (!on) return null;
  try {
    if (!ctx) {
      ctx = new Audio();
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -16;
      squash.ratio.value = 6;
      out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(squash).connect(ctx.destination);
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

function tone(f, d, type = "sine", v = 0.12, slide = 1, delay = 0) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay,
    o = a.createOscillator(),
    g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}
const noiseCache = new Map();
function noise(d, v, from, to, delay = 0, type = "lowpass") {
  const a = live();
  if (!a) return;
  const key = Math.round(d * 20);
  let buf = noiseCache.get(key);
  if (!buf) {
    const len = Math.floor(a.sampleRate * d);
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
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.value = v;
  src.connect(filter).connect(g).connect(out);
  src.start(t);
}

// ---------- Музыка: четыре такта ре минора, слои включаются по накалу боя ----------
const STEP = 60 / 104 / 4; // шестнадцатая нота
const BARS = [
  { root: 73.42, chord: [146.83, 174.61, 220.0] }, // Dm
  { root: 58.27, chord: [116.54, 146.83, 174.61] }, // B♭
  { root: 87.31, chord: [130.81, 174.61, 220.0] }, // F
  { root: 65.41, chord: [130.81, 164.81, 196.0] }, // C
];
let level = 0, // 0 — только фон, 1 — бой, 2 — флагман или пробитый корпус
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
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(90, cutoff * 0.3), t + d);
    o.connect(lp).connect(g);
  } else o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}
function schedule(n, t) {
  const bar = BARS[Math.floor(n / 16) % 4],
    s = n % 16;
  if (s === 0) for (const f of bar.chord) voice("triangle", f, t, STEP * 17, 0.024, 0.5), voice("sine", f * 2.005, t, STEP * 17, 0.008, 0.9);
  if (level >= 1) {
    if (s % 2 === 0) voice("sawtooth", bar.root * (s % 8 === 6 ? 1.5 : 1), t, STEP * 1.7, 0.055, 0.008, 620);
    if (s % 4 === 0) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.11);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.2);
    }
  }
  if (level >= 2) {
    voice("square", bar.chord[(s * 5) % 3] * (s % 4 === 3 ? 4 : 2), t, STEP * 0.9, 0.011, 0.004, 2400);
    if (s % 4 === 2) noise(0.05, 0.03, 9000, 6000, t - ctx.currentTime, "highpass");
  }
}
function pump() {
  const a = live();
  if (!a) return;
  if (nextAt < a.currentTime) nextAt = a.currentTime + 0.05;
  while (nextAt < a.currentTime + 0.2) {
    schedule(step++, nextAt);
    nextAt += STEP;
  }
}

let probe = null;
export const Sound = {
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
  toggle() {
    on = !!Audio && !on;
    writeStorage("strazh_mute", on ? "0" : "1");
    if (on) this.unlock();
    else ctx?.suspend().catch(() => {});
  },
  unlock() {
    const a = ac();
    if (!a) return;
    if (a.state !== "running") a.resume().catch(() => {});
    if (!timer) timer = setInterval(pump, 50);
  },
  // Пауза и свёрнутая вкладка: тишина целиком.
  hush() {
    ctx?.suspend().catch(() => {});
  },
  mood(value) {
    level = value;
  },
  laser: (over) => (tone(over ? 1180 : 880, 0.09, "sawtooth", 0.03, 0.3), noise(0.05, 0.035, 5200, 1400)),
  hit: () => tone(1500, 0.03, "square", 0.028),
  boom(size) {
    noise(size > 1 ? 1.1 : 0.55, size > 1 ? 0.5 : size < 1 ? 0.2 : 0.32, size > 1 ? 1800 : 2600, 80);
    tone(size > 1 ? 62 : 95, size > 1 ? 0.7 : 0.3, "sine", size > 1 ? 0.3 : 0.16, 0.45);
  },
  shield: () => tone(140, 0.2, "sine", 0.22, 0.6),
  shieldDown: () => (tone(520, 0.5, "sawtooth", 0.09, 0.2), noise(0.4, 0.2, 3800, 300)),
  hull: () => (noise(0.3, 0.35, 900, 120), tone(90, 0.3, "square", 0.12, 0.7)),
  alarm: () => tone(620, 0.12, "square", 0.05),
  rocket: () => noise(0.5, 0.2, 500, 3000),
  overheat: () => tone(220, 0.35, "sawtooth", 0.07, 0.5),
  wave: () => (tone(330, 0.2, "triangle", 0.14), tone(495, 0.3, "triangle", 0.14, 1, 0.16)),
  clear: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.28, "triangle", 0.14, 1, i * 0.11)),
  pick: () => (tone(660, 0.12, "triangle", 0.14), tone(990, 0.2, "triangle", 0.14, 1, 0.09)),
  boss: () => tone(70, 1.4, "sawtooth", 0.16, 0.7),
  lock: () => tone(1320, 0.05, "sine", 0.05),
  // Вражеский луч копит заряд: тон ползёт вверх всё время накачки.
  charge: (d) => (tone(180, d, "sawtooth", 0.05, 4.5), tone(183, d, "square", 0.025, 4.5)),
  beam: () => (noise(0.5, 0.45, 5000, 200), tone(300, 0.5, "sawtooth", 0.14, 0.2)),
  stagger: () => (tone(900, 0.18, "square", 0.08, 0.4), noise(0.25, 0.2, 4000, 700)),
  bonus: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.12, 1, i * 0.06)),
  // выстрел дрона-напарника, разряд цепной молнии, сброс мины, удар о щит щитоносца
  drone: () => tone(1500, 0.06, "triangle", 0.025, 0.6),
  zap: () => (tone(2200, 0.12, "sawtooth", 0.04, 0.3), noise(0.12, 0.08, 8000, 2000, 0, "highpass")),
  drop: () => tone(260, 0.25, "square", 0.05, 0.5),
  perfect: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, "triangle", 0.12, 1, i * 0.09)),
};
