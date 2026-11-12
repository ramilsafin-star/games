// Звук «Вихря»: всё синтезируется WebAudio, файлов нет.
// Ветер — петля шума, громче и ниже с ростом вихря; хлопки, голоса животных, монеты, фанфары.
const Audio = window.AudioContext || window.webkitAudioContext;
let ctx = null, out = null, on = true;
let wind = null;
let lastPop = 0, popsInRow = 0;

function ac() {
  if (!on || !Audio) return null;
  try {
    if (!ctx) {
      ctx = new Audio();
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -14;
      squash.ratio.value = 5;
      out = ctx.createGain();
      out.gain.value = 0.85;
      out.connect(squash).connect(ctx.destination);
    }
    return ctx;
  } catch {
    return null;
  }
}
const live = () => (ctx && on && ctx.state === "running" ? ctx : null);

function tone(f, d, type = "sine", v = 0.12, slide = 1, delay = 0, attack = 0.008) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}
let noiseBuf = null;
function noiseBuffer(a) {
  if (!noiseBuf) {
    const len = Math.floor(a.sampleRate * 2);
    noiseBuf = a.createBuffer(1, len, a.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // «коричневатый» шум мягче белого
      last = last * 0.86 + (Math.random() * 2 - 1) * 0.14;
      data[i] = last * 3.2;
    }
  }
  return noiseBuf;
}
function noise(d, v, from, to, delay = 0, type = "bandpass", q = 1) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay, src = a.createBufferSource(), filter = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuffer(a);
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.05, d * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + d + 0.05);
}
// голос: пила/квадрат через фильтр, с дрожью
function voice(f0, f1, d, type, v, cutoff, delay = 0, vib = 0) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + d);
  if (vib) {
    const lfo = a.createOscillator(), lg = a.createGain();
    lfo.frequency.value = vib;
    lg.gain.value = f0 * 0.04;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + d + 0.05);
  }
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  lp.Q.value = 3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.03);
  g.gain.setValueAtTime(v, t + d * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}

function startWind() {
  const a = live();
  if (!a || wind) return;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  src.loop = true;
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.value = 500;
  const low = a.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 180;
  const gHigh = a.createGain(), gLow = a.createGain(), master = a.createGain();
  gHigh.gain.value = 0.0001;
  gLow.gain.value = 0.0001;
  master.gain.value = 1;
  // завывание: медленная волна на частоте фильтра
  const lfo = a.createOscillator(), lg = a.createGain();
  lfo.frequency.value = 0.23;
  lg.gain.value = 140;
  lfo.connect(lg).connect(band.frequency);
  src.connect(band).connect(gHigh).connect(master);
  src.connect(low).connect(gLow).connect(master);
  master.connect(out);
  src.start();
  lfo.start();
  wind = { src, lfo, band, low, gHigh, gLow, master };
}

export const Sound = {
  get on() {
    return on;
  },
  get ctx() {
    return ctx;
  },
  set(value) {
    on = !!value && !!Audio;
    if (!on) ctx?.suspend().catch(() => {});
  },
  // только по нажатию игрока
  unlock() {
    const a = ac();
    if (!a) return;
    if (a.state !== "running") a.resume().catch(() => {});
  },
  hush() {
    ctx?.suspend().catch(() => {});
  },
  // ветер: size — радиус вихря, speed — 0..1, playing — идёт ли раунд
  wind(size, speed, playing) {
    const a = live();
    if (!a) return;
    if (!wind) startWind();
    if (!wind) return;
    const t = a.currentTime;
    const loud = playing ? 0.05 + Math.min(0.12, size * 0.012) + speed * 0.05 : 0.025;
    wind.gHigh.gain.setTargetAtTime(loud, t, 0.3);
    wind.gLow.gain.setTargetAtTime(playing ? Math.min(0.35, 0.05 + size * 0.03) : 0.02, t, 0.4);
    wind.band.frequency.setTargetAtTime(Math.max(220, 700 - size * 28) + speed * 260, t, 0.3);
    wind.low.frequency.setTargetAtTime(Math.max(70, 190 - size * 6), t, 0.4);
  },
  // хлопок поднятого предмета: мелочь звенит, крупное ухает
  pop(size) {
    const a = live();
    if (!a) return;
    const now = a.currentTime;
    if (now - lastPop < 0.045) return;
    popsInRow = now - lastPop < 0.4 ? popsInRow + 1 : 0;
    lastPop = now;
    const f = (880 / (1 + size * 0.55)) * Math.pow(1.06, popsInRow % 8);
    tone(f, 0.12 + Math.min(0.3, size * 0.05), "sine", 0.13, 1.8);
    tone(f * 2, 0.06, "triangle", 0.04, 1.5);
    if (size > 2) noise(0.3 + size * 0.04, 0.12, 300, 1400);
  },
  voice(kind) {
    if (kind === "cluck") [0, 0.09, 0.2].forEach((d, i) => voice(620 + i * 60, 820, 0.07, "square", 0.05, 1800, d));
    else if (kind === "baa") voice(330, 300, 0.45, "sawtooth", 0.06, 1400, 0, 9);
    else if (kind === "moo") voice(150, 112, 0.75, "sawtooth", 0.09, 520, 0, 4);
    else if (kind === "quack") [0, 0.14].forEach((d) => voice(460, 360, 0.11, "square", 0.05, 1200, d));
    else if (kind === "gull") [0, 0.18].forEach((d) => voice(1300, 900, 0.16, "triangle", 0.05, 4000, d));
  },
  unlockKind: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.12, 1, i * 0.07)),
  gulp() {
    noise(0.6, 0.35, 300, 2600, 0, "bandpass", 1.4);
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, "square", 0.05, 1, 0.12 + i * 0.06));
  },
  swallowed() {
    noise(0.7, 0.3, 2400, 200, 0, "bandpass", 1.2);
    voice(420, 140, 0.9, "sawtooth", 0.08, 900, 0.1, 6);
  },
  respawn: () => (tone(523, 0.12, "triangle", 0.09), tone(784, 0.2, "triangle", 0.09, 1, 0.08)),
  coin: (k = 0) => (tone(1320 * Math.pow(1.03, k % 10), 0.07, "triangle", 0.07), tone(1760 * Math.pow(1.03, k % 10), 0.1, "triangle", 0.05, 1, 0.04)),
  fanfare() {
    const seq = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.64]];
    for (const [f, d] of seq) tone(f, 0.22, "square", 0.05, 1, d), tone(f, 0.3, "triangle", 0.09, 1, d);
    for (const f of [523, 659, 784, 1047]) tone(f, 1.2, "triangle", 0.06, 1, 0.8, 0.05);
  },
  sad: () => [392, 349, 311].forEach((f, i) => tone(f, 0.35, "triangle", 0.09, 0.97, i * 0.22)),
  // бонус: магнит — «вжух» вверх, молния — треск, великан — низкий рост
  power(kind) {
    if (kind === "magnet") [440, 660, 990].forEach((f, i) => tone(f, 0.18, "sine", 0.1, 1.5, i * 0.05));
    else if (kind === "bolt") (noise(0.25, 0.22, 4000, 900, 0, "highpass", 0.7), [880, 1320, 1760].forEach((f, i) => tone(f, 0.12, "square", 0.04, 1, i * 0.04)));
    else (tone(110, 0.7, "sawtooth", 0.08, 2.2), tone(220, 0.6, "triangle", 0.1, 2, 0.05), noise(0.6, 0.18, 200, 1800));
  },
  // гром: далёкий раскат шумом
  thunder() {
    noise(1.4, 0.22, 900, 60, 0, "lowpass", 0.8);
    noise(0.15, 0.12, 3000, 800, 0, "bandpass", 1);
  },
  stormWarn: () => [520, 390].forEach((f, i) => tone(f, 0.22, "triangle", 0.09, 0.9, i * 0.16)),
  goldHour: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => (tone(f, 0.3, "triangle", 0.08, 1, i * 0.07), tone(f * 2, 0.12, "sine", 0.03, 1, i * 0.07 + 0.02))),
  // Ураган-великан: ворчливое «у-у-ух» и ветер
  boss() {
    noise(1.6, 0.3, 200, 1400, 0, "bandpass", 1.1);
    voice(150, 95, 1.1, "sawtooth", 0.07, 420, 0.15, 5);
  },
  quest: () => [659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, "triangle", 0.09, 1, i * 0.08)),
  beep: (go) => tone(go ? 990 : 660, go ? 0.3 : 0.12, "sine", 0.12),
  tick: () => tone(1180, 0.05, "square", 0.03),
  tap: () => tone(560, 0.06, "sine", 0.08, 1.4),
  buy: () => [659, 988, 1319].forEach((f, i) => tone(f, 0.16, "triangle", 0.1, 1, i * 0.06)),
  nope: () => tone(220, 0.18, "square", 0.05, 0.8),
  // для проверок: пик сигнала на выходе
  level() {
    if (!ctx) return { state: "none", peak: 0 };
    if (!this.probe) {
      this.probe = ctx.createAnalyser();
      this.probe.fftSize = 2048;
      out.connect(this.probe);
    }
    const data = new Float32Array(this.probe.fftSize);
    this.probe.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    return { state: ctx.state, peak };
  },
};
