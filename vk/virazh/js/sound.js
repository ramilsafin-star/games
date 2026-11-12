// Звук «Виража»: мотор, шины, нитро, сигналы светофора и лёгкая музыка. Всё синтезируется, файлов нет.
import { readStorage, writeStorage } from "./kit.js?v=85f7d054";

const Audio = window.AudioContext || window.webkitAudioContext;
await window.vkGameHost?.ready; // облачное сохранение VK уже в localStorage
let ctx = null, out = null, on = !!Audio && readStorage("virazh-mute") !== "1";
let car = null; // постоянные узлы: мотор, шины, грунт, ветер
let hushed = true;

function ac() {
  if (!on) return null;
  try {
    if (!ctx) {
      ctx = new Audio();
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -14;
      squash.ratio.value = 5;
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
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}
let noiseBuf = null;
function noiseBuffer(a) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function noise(d, v, from, to, delay = 0, type = "lowpass") {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay, src = a.createBufferSource(), filter = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuffer(a);
  filter.type = type;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + d + 0.05);
}

// Постоянные звуки машины: создаются один раз, дальше меняем только громкость и высоту
function rig() {
  const a = live();
  if (!a || car) return car;
  const gain = (v) => {
    const g = a.createGain();
    g.gain.value = v;
    return g;
  };
  const o1 = a.createOscillator(), o2 = a.createOscillator(), lp = a.createBiquadFilter(), eg = gain(0);
  o1.type = "sawtooth";
  o2.type = "square";
  lp.type = "lowpass";
  lp.frequency.value = 500;
  o1.connect(lp);
  o2.connect(gain(0.5)).connect(lp);
  lp.connect(eg).connect(out);
  o1.start();
  o2.start();
  const loop = (type, freq, q) => {
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = gain(0);
    src.buffer = noiseBuffer(a);
    src.loop = true;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(g).connect(out);
    src.start();
    return { g, f };
  };
  car = { o1, o2, lp, eg, skid: loop("bandpass", 1900, 5), dirt: loop("lowpass", 260, 0.7), wind: loop("highpass", 3200, 0.5) };
  return car;
}
const ramp = (param, v, a) => param.setTargetAtTime(v, a.currentTime, 0.05);

// ---------- Музыка: четыре такта, у каждой трассы свои аккорды ----------
const N = (semi) => 110 * Math.pow(2, semi / 12); // от ля большой октавы
const SONGS = {
  menu: { bpm: 104, bars: [[3, 7, 10], [10, 14, 17], [0, 3, 7], [8, 12, 15]] },
  sea: { bpm: 126, bars: [[3, 7, 10], [10, 14, 17], [0, 3, 7], [8, 12, 15]] },
  pine: { bpm: 122, bars: [[5, 9, 12], [0, 4, 7], [2, 5, 9], [10, 14, 17]] },
  canyon: { bpm: 128, bars: [[7, 10, 14], [3, 7, 10], [10, 14, 17], [5, 9, 12]] },
  city: { bpm: 132, bars: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]] },
};
let song = null, step = 0, nextAt = 0, timer = 0;
function voice(type, f, t, d, v, cutoff = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), t + d);
    o.connect(lp).connect(g);
  } else o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}
function schedule(n, t, sixteenth) {
  const bar = song.bars[Math.floor(n / 16) % 4], s = n % 16, race = song !== SONGS.menu;
  if ([0, 3, 6, 8, 11, 14].includes(s)) voice("triangle", N(bar[0] - 12) * (s === 11 ? 1.5 : 1), t, sixteenth * 2.4, 0.11, 700);
  if (s % 2 === 0) voice("square", N(bar[(s / 2) % 3] + 12), t, sixteenth * 1.4, race ? 0.022 : 0.016, 2400);
  if (s === 0) for (const semi of bar) voice("sine", N(semi), t, sixteenth * 15, 0.03);
  if (race) {
    if (s % 4 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.2);
    }
    if (s % 4 === 2) noise(0.05, 0.035, 9000, 6000, t - ctx.currentTime, "highpass");
  }
}
function pump() {
  const a = live();
  if (!a || !song || hushed) return;
  const sixteenth = 60 / song.bpm / 4;
  if (nextAt < a.currentTime) nextAt = a.currentTime + 0.06;
  while (nextAt < a.currentTime + 0.25) {
    schedule(step++, nextAt, sixteenth);
    nextAt += sixteenth;
  }
}

let probe = null;
export const Sound = {
  // Для проверок: состояние и пик сигнала на выходе
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
    writeStorage("virazh-mute", on ? "0" : "1");
    if (on) this.unlock();
    else ctx?.suspend().catch(() => {});
  },
  unlock() {
    const a = ac();
    if (!a) return;
    hushed = false;
    if (a.state !== "running") a.resume().catch(() => {});
    if (!timer) timer = setInterval(pump, 60);
  },
  // Пауза и свёрнутая вкладка: тишина целиком
  hush() {
    hushed = true;
    ctx?.suspend().catch(() => {});
  },
  music(name) {
    const next = SONGS[name] || null;
    if (next !== song) step = 0;
    song = next;
  },
  // Каждый кадр гонки: обороты 0..1, газ 0..1, визг шин 0..1, грунт 0..1, скорость 0..1
  drive(rpm, load, skid, dirt, speed) {
    const a = live(), c = a && rig();
    if (!c) return;
    const f = 52 + rpm * 150;
    ramp(c.o1.frequency, f, a);
    ramp(c.o2.frequency, f * 0.5, a);
    ramp(c.lp.frequency, 320 + rpm * 1500 + load * 500, a);
    ramp(c.eg.gain, 0.035 + load * 0.035 + rpm * 0.02, a);
    ramp(c.skid.g.gain, skid * 0.075, a);
    ramp(c.skid.f.frequency, 1700 + speed * 600, a);
    ramp(c.dirt.g.gain, dirt * 0.3, a);
    ramp(c.wind.g.gain, speed * speed * 0.035, a);
  },
  idle() {
    // до первого касания контекст не создаём: браузер всё равно не даст ему звучать
    if (!ctx || !car || ctx.state !== "running") return;
    for (const g of [car.eg, car.skid.g, car.dirt.g, car.wind.g]) ramp(g.gain, 0, ctx);
  },
  click: () => tone(660, 0.07, "triangle", 0.1),
  pick: () => (tone(520, 0.08, "triangle", 0.11), tone(780, 0.12, "triangle", 0.11, 1, 0.06)),
  beep: () => tone(440, 0.22, "square", 0.09),
  go: () => (tone(880, 0.6, "square", 0.1), tone(1320, 0.5, "triangle", 0.08, 1, 0.02)),
  nitro: () => (noise(0.9, 0.3, 500, 5000), tone(160, 0.8, "sawtooth", 0.08, 3.2)),
  pad: () => (noise(0.5, 0.2, 800, 4500), tone(300, 0.4, "triangle", 0.1, 2.4)),
  can: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.16, "triangle", 0.12, 1, i * 0.06)),
  wall: (p) => (noise(0.25, Math.min(0.5, 0.12 + p / 60), 1400, 180), tone(110, 0.2, "square", 0.08, 0.6)),
  bump: () => (noise(0.16, 0.22, 900, 200), tone(150, 0.12, "triangle", 0.1, 0.7)),
  land: () => (noise(0.35, 0.4, 500, 90), tone(80, 0.3, "sine", 0.2, 0.5)),
  jump: () => tone(300, 0.5, "triangle", 0.07, 2.2),
  lap: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.2, "triangle", 0.12, 1, i * 0.09)),
  last: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, "square", 0.07, 1, i * 0.09)),
  reset: () => tone(500, 0.3, "sine", 0.1, 0.5),
  wrong: () => (tone(330, 0.16, "square", 0.07), tone(247, 0.25, "square", 0.07, 1, 0.17)),
  finish(place) {
    const win = place <= 3;
    (win ? [523, 659, 784, 1047, 784, 1047, 1319] : [523, 494, 440, 523]).forEach((f, i) => tone(f, win && i > 3 ? 0.36 : 0.2, "triangle", 0.14, 1, i * 0.13));
    if (win) noise(1.2, 0.12, 6000, 2500, 0.5, "highpass");
  },
};
