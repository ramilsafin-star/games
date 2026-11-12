// Звук «Маяка»: всё синтезируется на лету, файлов нет.
// Тихая музыкальная шкатулка, шум волн, гудки лодок, бульканье теней, колокол гавани.
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ctx = null;
let out = null; // общий выход с компрессором
let on = true;
let timer = 0;

const midi = (m) => 440 * 2 ** ((m - 69) / 12);

function ac() {
  if (!on || !AudioCtx) return null;
  try {
    if (!ctx) {
      ctx = new AudioCtx();
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -18;
      squash.ratio.value = 5;
      out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(squash).connect(ctx.destination);
      startSea();
    }
    return ctx;
  } catch {
    return null;
  }
}
// Звук создаётся только из нажатия (unlock): иначе браузер ругается и всё равно молчит.
const live = () => (on && ctx && ctx.state === "running" ? ctx : null);

function tone(f, d, { type = "sine", v = 0.1, to = 0, delay = 0, attack = 0.008, cutoff = 0 } = {}) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  if (cutoff) {
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    o.connect(lp).connect(g);
  } else o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}

let noiseBuffer = null;
function noiseSource(a) {
  if (!noiseBuffer) {
    const len = a.sampleRate * 2;
    noiseBuffer = a.createBuffer(1, len, a.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

function noise(d, v, from, to, { delay = 0, type = "lowpass", q = 0.7 } = {}) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay;
  const src = noiseSource(a);
  const filter = a.createBiquadFilter();
  const g = a.createGain();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.03, d * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + d + 0.05);
}

// Море: два слоя шума, громкость дышит, как накат волны.
let seaGain = null;
let windGain = null;
function startSea() {
  const make = (type, freq, q, base, depth, rate) => {
    const src = noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = base;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = rate;
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g);
    src.start(0, Math.random());
    lfo.start();
    return g;
  };
  seaGain = ctx.createGain();
  seaGain.gain.value = 1;
  make("lowpass", 380, 0.3, 0.05, 0.028, 0.105).connect(seaGain);
  make("bandpass", 1500, 0.6, 0.012, 0.009, 0.14).connect(seaGain);
  seaGain.connect(out);
  // ветер: молчит, пока не налетит порыв
  const src = noiseSource(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 620;
  filter.Q.value = 1.6;
  windGain = ctx.createGain();
  windGain.gain.value = 0.0001;
  src.connect(filter).connect(windGain).connect(out);
  src.start(0, Math.random());
  // дождь: шелест, молчит, пока нет грозы
  const rainSrc = noiseSource(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2400;
  rainGain = ctx.createGain();
  rainGain.gain.value = 0.0001;
  rainSrc.connect(hp).connect(rainGain).connect(out);
  rainSrc.start(0, Math.random());
}
let rainGain = null;

// Нота музыкальной шкатулки: чистый тон с быстрым звонким призвуком.
function chime(f, t, v, d = 1.7) {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  const g2 = ctx.createGain();
  o.frequency.value = f;
  o2.frequency.value = f * 4.02;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(v * 0.28, t + 0.004);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(out);
  o2.connect(g2).connect(out);
  o.start(t);
  o2.start(t);
  o.stop(t + d + 0.05);
  o2.stop(t + 0.3);
}
function pad(f, t, d, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + d * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}

// Колыбельная в ре мажоре: восемь тактов по восемь восьмых. 0 — пауза.
const MELODY = [
  78, 81, 86, 81, 78, 81, 86, 0,
  78, 83, 86, 83, 78, 83, 85, 0,
  79, 83, 86, 83, 79, 83, 88, 86,
  76, 81, 85, 81, 76, 0, 0, 0,
  81, 0, 78, 81, 86, 0, 85, 86,
  83, 0, 78, 83, 86, 0, 85, 83,
  79, 83, 86, 91, 90, 86, 83, 79,
  81, 85, 88, 0, 86, 0, 0, 0,
];
const ROOTS = [50, 47, 43, 45, 50, 47, 43, 45];
const STEP = 60 / 76 / 2;
let step = 0;
let nextAt = 0;
let calm = 1; // 1 — спокойная ночь, 0 — в бухте беда: шкатулка стихает
let musicOn = true;
function pump() {
  const a = live();
  if (!a || !musicOn) return;
  if (nextAt < a.currentTime) nextAt = a.currentTime + 0.06;
  while (nextAt < a.currentTime + 0.25) {
    const n = step % 64;
    const note = MELODY[n];
    const lap = Math.floor(step / 64);
    const v = 0.034 * (0.55 + 0.45 * calm);
    // каждый второй круг мелодия звучит октавой ниже и реже — чтобы не приедалась
    if (note && (lap % 2 === 0 || n % 2 === 0)) chime(midi(note - (lap % 2 ? 12 : 0)), nextAt, v);
    if (n % 8 === 0) {
      const root = ROOTS[n / 8];
      pad(midi(root), nextAt, STEP * 8.2, 0.035);
      pad(midi(root + 7), nextAt, STEP * 8.2, 0.018);
      chime(midi(root + 24), nextAt, v * 0.6, 2.4);
    }
    step++;
    nextAt += STEP;
  }
}

// пузырёк: короткий тон, взлетающий вверх
const blip = (f, delay = 0, v = 0.06) => tone(f, 0.09, { to: f * 2.6, delay, v });

let probe = null;
export const Sound = {
  get on() {
    return on;
  },
  set(value) {
    on = !!value && !!AudioCtx;
    if (!on && ctx) ctx.suspend().catch(() => {});
  },
  // будит звук: вызывать из нажатия пальца или клавиши
  unlock() {
    const a = ac();
    if (!a) return;
    if (a.state !== "running") a.resume().catch(() => {});
    if (!timer) timer = setInterval(pump, 60);
  },
  // пауза и свёрнутая вкладка: тишина целиком
  hush() {
    if (ctx) ctx.suspend().catch(() => {});
  },
  // для проверок: пик сигнала на выходе и состояние
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
  mood(value) {
    calm = value;
  },
  music(value) {
    musicOn = value;
  },
  // гудок лодки, когда она появляется: у каждого вида свой голос
  horn(kind) {
    if (kind === "ferry") {
      tone(98, 0.8, { type: "sawtooth", v: 0.09, cutoff: 520, attack: 0.06 });
      tone(147, 0.8, { type: "sawtooth", v: 0.06, cutoff: 520, attack: 0.06 });
    } else if (kind === "speed") {
      tone(660, 0.1, { type: "square", v: 0.04, cutoff: 1800 });
      tone(660, 0.14, { type: "square", v: 0.04, cutoff: 1800, delay: 0.16 });
    } else if (kind === "sail") {
      tone(1319, 0.5, { v: 0.05 });
      tone(1976, 0.3, { v: 0.02 });
    } else if (kind === "lamp") {
      [86, 90, 93].forEach((m, i) => tone(midi(m), 0.4, { v: 0.04, delay: i * 0.09 }));
    } else {
      tone(784, 0.16, { v: 0.05, to: 880 });
      tone(988, 0.22, { v: 0.05, delay: 0.17 });
    }
  },
  astray() {
    tone(494, 0.2, { v: 0.07, to: 392, type: "triangle" });
    tone(440, 0.26, { v: 0.07, to: 554, type: "triangle", delay: 0.24 });
  },
  found() {
    tone(659, 0.12, { v: 0.05, type: "triangle" });
    tone(988, 0.2, { v: 0.05, type: "triangle", delay: 0.09 });
  },
  charged() {
    tone(1568, 0.3, { v: 0.035 });
    tone(2349, 0.2, { v: 0.018, delay: 0.03 });
  },
  shade() {
    for (let i = 0; i < 5; i++) blip(150 + Math.random() * 160, i * 0.09 + Math.random() * 0.04, 0.05);
  },
  sizzle() {
    blip(500 + Math.random() * 700, 0, 0.025);
  },
  pop(kind) {
    const base = kind === "big" ? 200 : kind === "dart" ? 420 : 300;
    tone(base, 0.07, { to: base * 3.2, v: 0.13 });
    noise(0.08, 0.1, 3000, 900);
    for (let i = 0; i < 4; i++) blip(base * 1.5 + i * 140, 0.06 + i * 0.055, 0.05);
  },
  grab() {
    tone(170, 0.3, { to: 70, v: 0.16, type: "triangle" });
    blip(120, 0.12, 0.07);
    blip(100, 0.25, 0.07);
  },
  free() {
    tone(523, 0.12, { v: 0.06, type: "triangle" });
    tone(784, 0.22, { v: 0.06, type: "triangle", delay: 0.1 });
  },
  dragged() {
    for (let i = 0; i < 5; i++) tone(330 - i * 45, 0.12, { to: 180 - i * 22, v: 0.09, delay: i * 0.11 });
    noise(0.6, 0.12, 900, 200, { delay: 0.1 });
  },
  wreck() {
    noise(0.07, 0.2, 1600, 900, { type: "bandpass", q: 3 });
    noise(0.09, 0.16, 1100, 600, { type: "bandpass", q: 3, delay: 0.09 });
    noise(0.7, 0.2, 3200, 260, { delay: 0.12 });
    tone(150, 0.3, { to: 80, v: 0.1, type: "triangle", delay: 0.05 });
  },
  heart() {
    tone(392, 0.22, { v: 0.08, type: "triangle", to: 330 });
    tone(294, 0.34, { v: 0.08, type: "triangle", to: 247, delay: 0.2 });
  },
  shield() {
    tone(110, 0.5, { type: "sawtooth", v: 0.12, cutoff: 700, attack: 0.03 });
    tone(165, 0.5, { type: "sawtooth", v: 0.08, cutoff: 700, attack: 0.03 });
  },
  // колокол гавани; с каждой лодкой подряд звенит чуть выше
  bell(streak = 1) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const f = midi(74 + scale[Math.min(scale.length - 1, Math.max(0, streak - 1))]);
    for (const [k, v, d] of [[1, 0.1, 1.6], [2.0, 0.05, 1.2], [2.76, 0.04, 0.8], [4.07, 0.02, 0.5], [5.4, 0.012, 0.35]]) tone(f * k, d, { v, attack: 0.004 });
    tone(f * 0.5, 1.2, { v: 0.03 });
  },
  flash() {
    noise(0.7, 0.14, 700, 6000, { type: "highpass" });
    [74, 81, 86, 90, 93].forEach((m, i) => tone(midi(m), 1.3, { v: 0.05, delay: i * 0.035 }));
  },
  flashReady() {
    tone(midi(86), 0.2, { v: 0.045 });
    tone(midi(93), 0.3, { v: 0.045, delay: 0.1 });
  },
  // порыв ветра: d секунд воя
  gust(d = 4.3) {
    const a = live();
    if (!a || !windGain) return;
    const t = a.currentTime;
    windGain.gain.cancelScheduledValues(t);
    windGain.gain.setValueAtTime(0.0001, t);
    windGain.gain.exponentialRampToValueAtTime(0.16, t + 1.4);
    windGain.gain.exponentialRampToValueAtTime(0.11, t + d * 0.7);
    windGain.gain.exponentialRampToValueAtTime(0.0001, t + d);
  },
  night() {
    [74, 78, 81].forEach((m, i) => tone(midi(m), 0.6, { v: 0.06, delay: i * 0.16 }));
  },
  dawn() {
    [74, 78, 81, 86, 90].forEach((m, i) => tone(midi(m), 0.7, { v: 0.06, delay: i * 0.13 }));
    // птицы просыпаются
    for (let i = 0; i < 5; i++) tone(2600 + Math.random() * 900, 0.09, { to: 3400 + Math.random() * 800, v: 0.03, delay: 0.9 + i * 0.17 + Math.random() * 0.05 });
  },
  star(i) {
    tone(midi(81 + i * 4), 0.5, { v: 0.08 });
    tone(midi(93 + i * 4), 0.3, { v: 0.03 });
  },
  fail() {
    [69, 65, 62].forEach((m, i) => tone(midi(m), 0.6, { v: 0.07, type: "triangle", delay: i * 0.22 }));
  },
  win() {
    [74, 78, 81, 86, 81, 86, 90, 93].forEach((m, i) => tone(midi(m), 0.6, { v: 0.07, delay: i * 0.14 }));
  },
  // гроза: шелест дождя то нарастает, то стихает
  rain(on) {
    const a = live();
    if (!a || !rainGain) return;
    const t = a.currentTime;
    rainGain.gain.cancelScheduledValues(t);
    rainGain.gain.setValueAtTime(Math.max(0.0001, rainGain.gain.value), t);
    rainGain.gain.exponentialRampToValueAtTime(on ? 0.05 : 0.0001, t + (on ? 2 : 1.2));
  },
  // гром — мягкий и далёкий, без резкого треска (игра для детей)
  thunder() {
    noise(0.25, 0.05, 2600, 900, { type: "bandpass", q: 0.8 });
    noise(2.4, 0.16, 420, 60, { delay: 0.35 });
    tone(55, 1.8, { to: 38, v: 0.07, type: "triangle", delay: 0.4, attack: 0.2 });
  },
  task() {
    [81, 85, 88, 93].forEach((m, i) => tone(midi(m), 0.35, { v: 0.07, type: "triangle", delay: i * 0.08 }));
    tone(midi(100), 0.5, { v: 0.03, delay: 0.32 });
  },
  findUp() {
    blip(700, 0, 0.04);
    blip(900, 0.08, 0.04);
  },
  find(kind) {
    if (kind === "bottle") {
      tone(1046, 0.12, { v: 0.06 });
      tone(1568, 0.25, { v: 0.05, delay: 0.08 });
      tone(2093, 0.3, { v: 0.03, delay: 0.16 });
    } else if (kind === "buoy") {
      [74, 81, 86].forEach((m, i) => tone(midi(m), 0.8, { v: 0.05, delay: i * 0.06 }));
    } else {
      tone(midi(93), 0.2, { v: 0.05 });
      tone(midi(98), 0.4, { v: 0.05, delay: 0.1 });
    }
  },
  // кит-фонарик: добрый низкий «у-у-у»
  whale() {
    tone(220, 1.1, { to: 330, v: 0.06, type: "triangle", attack: 0.25, cutoff: 900 });
    tone(330, 0.9, { to: 262, v: 0.04, type: "triangle", attack: 0.2, delay: 0.9, cutoff: 900 });
  },
  spout() {
    noise(1.1, 0.12, 400, 5000, { type: "bandpass", q: 0.6 });
    [74, 78, 81, 86, 90, 93].forEach((m, i) => tone(midi(m), 0.6, { v: 0.05, delay: 0.2 + i * 0.06 }));
  },
  // салют над деревней на победе ночи
  fireworks() {
    for (let i = 0; i < 5; i++) {
      const at = 0.25 + i * 0.32 + Math.random() * 0.1;
      tone(300 + Math.random() * 200, 0.3, { to: 1200, v: 0.02, delay: at });
      noise(0.35, 0.07, 3000, 500, { delay: at + 0.3 });
      tone(midi(86 + (i % 3) * 4), 0.4, { v: 0.03, delay: at + 0.32 });
    }
  },
  buy() {
    [88, 93, 97, 100].forEach((m, i) => tone(midi(m), 0.25, { v: 0.06, delay: i * 0.06 }));
  },
  pick() {
    tone(660, 0.1, { v: 0.07, type: "triangle" });
    tone(990, 0.18, { v: 0.06, type: "triangle", delay: 0.07 });
  },
  tap() {
    tone(520, 0.07, { v: 0.05, type: "triangle" });
  },
};
