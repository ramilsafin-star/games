// =====================================================
// ЗВУК «Заводного Скока»: всё синтезируется кодом, кроме голосов (voices/*.mp3)
// Основа та же, что в «Пломбирчике», «Шарокате», «Зубике» и «Гонке бобрят»
// =====================================================
const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  noiseBuf: null,
  on: true,
  starStep: 0,
  starAt: 0,

  // На iPad звук разрешается только после первого касания
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      this.master = c.createGain();
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = 0.82;
      this.sfxBus.connect(comp);
      comp.connect(this.master);
      this.comp = comp;
      this.master.connect(c.destination);
      this.master.gain.value = this.on ? 0.9 : 0;
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== "running") {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  },

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.9 : 0;
  },

  ready() {
    return this.ctx && this.ctx.state === "running" && this.on;
  },

  tone(o, bus) {
    const c = this.ctx;
    const t0 = c.currentTime + (o.at || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1)
      osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  },

  noise(o, bus) {
    const c = this.ctx;
    const t0 = c.currentTime + (o.at || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.filter || "lowpass";
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1)
      f.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 10), t0 + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus || this.sfxBus);
    src.start(t0, Math.random() * 0.8);
    src.stop(t0 + o.dur + 0.02);
  },

  // Звенит всё выше, если попадать в заказ подряд
  star() {
    if (!this.ready()) return;
    const now = performance.now();
    this.starStep = now - this.starAt < 2600 ? this.starStep + 1 : 0;
    this.starAt = now;
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
    const f = scale[Math.min(this.starStep, scale.length - 1)];
    this.tone({ type: "triangle", f0: f, dur: 0.24, vol: 0.28 });
    this.tone({ type: "sine", f0: f * 2, dur: 0.17, vol: 0.13, at: 0.035 });
  },

  boing() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 200, f1: 560, dur: 0.1, vol: 0.32 });
    this.tone({ type: "sine", f0: 560, f1: 210, dur: 0.2, vol: 0.27, at: 0.09 });
  },

  pop() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 880, f1: 240, dur: 0.1, vol: 0.27 });
    this.noise({ f0: 3400, dur: 0.05, vol: 0.11, filter: "highpass" });
  },

  // Лопнул мыльный пузырь: короткий высокий чпок
  bubble() {
    if (!this.ready()) return;
    const k = 0.85 + Math.random() * 0.4;
    this.tone({ type: "sine", f0: 1400 * k, f1: 520 * k, dur: 0.07, vol: 0.22 });
    this.noise({ f0: 5200, dur: 0.035, vol: 0.08, filter: "highpass" });
  },

  tap() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 620, f1: 1020, dur: 0.09, vol: 0.2 });
  },

  gift() {
    if (!this.ready()) return;
    [784, 988, 1175, 1568].forEach((f, i) =>
      this.tone({ type: "triangle", f0: f, dur: 0.17, vol: 0.2, at: i * 0.07 }),
    );
  },

  // Колокольчик фургона: динь-дон
  bell() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 1175, dur: 0.5, vol: 0.2 });
    this.tone({ type: "sine", f0: 932, dur: 0.7, vol: 0.2, at: 0.22 });
  },

  fanfare() {
    if (!this.ready()) return;
    [523, 523, 659, 784, 659, 784, 1047, 1047].forEach((f, i) => {
      const at = [0, 0.13, 0.26, 0.39, 0.58, 0.71, 0.84, 1.06][i];
      const dur = i === 7 ? 0.65 : 0.18;
      this.tone({ type: "square", f0: f, dur, vol: 0.09, at });
      this.tone({ type: "triangle", f0: f, dur, vol: 0.2, at });
    });
    // Хлопушка с конфетти
    this.noise({ f0: 2600, f1: 600, dur: 0.25, vol: 0.16, filter: "bandpass" });
    Music.duck(1.9);
  },
};


// Звуки мастерской
Object.assign(Sound, {
  // Пружинка: «бойнг» вверх с дрожью
  jump() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 220, f1: 620, dur: 0.22, vol: 0.16 });
    this.tone({ type: "triangle", f0: 330, f1: 900, dur: 0.16, vol: 0.06, at: 0.02 });
  },
  land() {
    if (!this.ready()) return;
    this.tone({ type: "triangle", f0: 300, f1: 160, dur: 0.07, vol: 0.12 });
    this.noise({ f0: 900, dur: 0.04, vol: 0.05, filter: "lowpass" });
  },
  // Шестерёнка: звонкий колокольчик, каждая следующая подряд — чуть выше
  gear(n = 0) {
    if (!this.ready()) return;
    const f = 1046 * Math.pow(2, (Math.min(n, 12) % 13) / 24);
    this.tone({ type: "sine", f0: f, dur: 0.28, vol: 0.12, attack: 0.002 });
    this.tone({ type: "sine", f0: f * 2.76, dur: 0.12, vol: 0.04, attack: 0.002 });
  },
  // Столкновение: металлический «дзынь» и мягкий «бум»
  clank() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 180, f1: 70, dur: 0.25, vol: 0.22 });
    for (const [f, v] of [[1240, 0.06], [1770, 0.05], [2630, 0.035]]) this.tone({ type: "sine", f0: f, dur: 0.5, vol: v, attack: 0.002 });
    this.noise({ f0: 3000, dur: 0.06, vol: 0.06, filter: "highpass" });
  },
  // Флажок пройден
  flag() {
    if (!this.ready()) return;
    this.tone({ type: "triangle", f0: 784, dur: 0.14, vol: 0.12 });
    this.tone({ type: "triangle", f0: 1175, dur: 0.24, vol: 0.12, at: 0.1 });
  },
  // Завод ключика: трещотка
  windup() {
    if (!this.ready()) return;
    for (let i = 0; i < 6; i++) this.noise({ f0: 2400 + i * 120, dur: 0.025, vol: 0.09, filter: "bandpass", at: i * 0.07 });
    this.tone({ type: "sine", f0: 523, f1: 1046, dur: 0.2, vol: 0.08, at: 0.42 });
  },
  tick() {
    if (!this.ready()) return;
    const now = performance.now();
    if (now - (this.tickAt || 0) < 220) return;
    this.tickAt = now;
    this.noise({ f0: 3400, dur: 0.018, vol: 0.025, filter: "bandpass" });
  },
});
const Music = {
  on: true,
  level: 1,
  bus: null,
  timer: null,
  events: null,
  loop: 0,
  index: 0,
  start0: 0,
  // Нота или «-» (пауза), после двоеточия длина в восьмых; A#4 — ля-диез (си-бемоль)
  eighth: 0.17,
  // Своя мелодия «Заводного Скока»: музыкальная шкатулка, фа мажор, под тиканье часового механизма
  tune: [
    "C5 F5 A5 C6 A5 F5 G5:2",
    "A5 G5 F5 E5 F5:2 C5:2",
    "D5 E5 F5 A5 G5 F5 E5 D5",
    "C5:2 E5:2 G5:2 -:2",
    "C5 F5 A5 C6 A5 F5 G5:2",
    "A5 G5 F5 E5 F5:2 A5:2",
    "A#5 A5 G5 F5 E5 G5 F5 E5",
    "F5:4 -:4",
    "A5 A5 A#5 C6 D6:2 C6:2",
    "A#5 A5 G5 A5 A#5:2 G5:2",
    "G5 G5 A5 A#5 C6:2 A#5:2",
    "A5 G5 F5 G5 A5:2 -:2",
    "C6 A5 F5 A5 C6 D6 C6 A5",
    "A#5 G5 E5 G5 A#5 C6 A#5 G5",
    "F5 A5 C6 A5 G5 E5 C5 E5",
    "F5:4 -:4",
  ],
  harmony: [
    "F F", "C F", "Dm A#", "C C", "F F", "C F", "A# C", "F F",
    "F A#", "Gm C", "C Gm", "F F", "F Dm", "A# Gm", "F C", "F F",
  ],
  chords: {
    F: { bass: ["F2", "C3"], notes: ["F4", "A4", "C5"] },
    C: { bass: ["C3", "G2"], notes: ["E4", "G4", "C5"] },
    Dm: { bass: ["D3", "A2"], notes: ["D4", "F4", "A4"] },
    "A#": { bass: ["A#2", "F2"], notes: ["D4", "F4", "A#4"] },
    Gm: { bass: ["G2", "D3"], notes: ["D4", "G4", "A#4"] },
  },
  hz(name) {
    const steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const sharp = name[1] === "#" ? 1 : 0;
    const midi = 12 * (Number(name.slice(-1)) + 1) + steps[name[0]] + sharp;
    return 440 * Math.pow(2, (midi - 69) / 12);
  },
  build() {
    const events = [];
    let at = 0;
    for (const bar of this.tune)
      for (const token of bar.split(" ")) {
        const [note, len = "1"] = token.split(":");
        if (note !== "-") events.push({ at, kind: "lead", f: this.hz(note), len: +len });
        at += +len;
      }
    this.harmony.forEach((pair, bar) => {
      const names = pair.split(" ");
      names.forEach((name, half) => {
        const chord = this.chords[name],
          base = bar * 8 + half * 4;
        events.push({ at: base, kind: "bass", f: this.hz(chord.bass[names[0] === names[1] && half ? 1 : 0]) });
        // Арпеджио шкатулки на слабые доли
        chord.notes.forEach((n, k) => events.push({ at: base + 1 + k, kind: "arp", f: this.hz(n) }));
        events.push({ at: base, kind: "tick" }, { at: base + 2, kind: "tock" });
      });
    });
    events.sort((a, b) => a.at - b.at);
    this.loop = this.tune.length * 8;
    return events;
  },
  play(e, when) {
    const at = Math.max(0, when - Sound.ctx.currentTime),
      bus = this.bus;
    if (e.kind === "lead") {
      // Гребёнка шкатулки: чистый тон, звонкий призвук и быстрое затухание
      const dur = Math.max(0.35, e.len * this.eighth * 1.1);
      Sound.tone({ type: "sine", f0: e.f, dur, vol: 0.12, at, attack: 0.002 }, bus);
      Sound.tone({ type: "sine", f0: e.f * 3.01, dur: dur * 0.35, vol: 0.035, at, attack: 0.002 }, bus);
      Sound.tone({ type: "triangle", f0: e.f * 2, dur: dur * 0.5, vol: 0.03, at, attack: 0.002 }, bus);
    } else if (e.kind === "arp") {
      Sound.tone({ type: "sine", f0: e.f, dur: 0.3, vol: 0.035, at, attack: 0.002 }, bus);
    } else if (e.kind === "bass") {
      Sound.tone({ type: "triangle", f0: e.f, dur: 0.3, vol: 0.13, at }, bus);
    } else Sound.noise({ f0: e.kind === "tick" ? 3600 : 2600, dur: 0.02, vol: 0.022, filter: "bandpass", at }, bus);
  },
  start() {
    if (!this.on || this.timer || !Sound.ctx || !Sound.on) return;
    if (!this.bus) {
      this.bus = Sound.ctx.createGain();
      this.bus.gain.value = this.level;
      this.bus.connect(Sound.comp);
      this.events = this.build();
    }
    this.index = 0;
    this.start0 = Sound.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.tick(), 60);
    this.tick();
  },
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  },
  tick() {
    const ctx = Sound.ctx;
    if (!ctx || ctx.state !== "running") return;
    for (;;) {
      const e = this.events[this.index],
        when = this.start0 + e.at * this.eighth;
      if (when > ctx.currentTime + 0.25) break;
      if (when > ctx.currentTime - 0.05) this.play(e, when);
      this.index++;
      if (this.index >= this.events.length) {
        this.index = 0;
        this.start0 += this.loop * this.eighth;
      }
    }
  },
  // Пока говорит покупатель или играет фанфара, музыка тише
  duck(seconds, depth = 0.25) {
    if (!this.bus) return;
    const g = this.bus.gain,
      now = Sound.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.level * depth, now, 0.05);
    g.setTargetAtTime(this.level, now + seconds, 0.35);
  },
};


