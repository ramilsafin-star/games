// =====================================================
// ЗВУК «Лавки Листик»: всё синтезируется кодом, кроме голосов покупателей (voices/*.mp3)
// Основа та же, что в «Пломбирчике» и «Бибике»
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


// Звуки магазина
Object.assign(Sound, {
  // Писк сканера
  beep() {
    if (!this.ready()) return;
    this.tone({ type: "square", f0: 1880, dur: 0.11, vol: 0.09 });
    this.tone({ type: "sine", f0: 1880, dur: 0.12, vol: 0.12 });
  },
  // Касса: звонок «дзынь» и шелест ящика
  ching() {
    if (!this.ready()) return;
    this.noise({ f0: 2400, f1: 900, dur: 0.14, vol: 0.12, filter: "bandpass" });
    this.tone({ type: "triangle", f0: 1568, dur: 0.7, vol: 0.18, at: 0.08 });
    this.tone({ type: "sine", f0: 2093, dur: 0.9, vol: 0.14, at: 0.12 });
  },
  rustle() {
    if (!this.ready()) return;
    this.noise({ f0: 2200, f1: 700, dur: 0.2, vol: 0.12, filter: "bandpass" });
  },
  coin(n = 0) {
    if (!this.ready()) return;
    const k = 1 + n * 0.06;
    this.tone({ type: "sine", f0: 2637 * k, dur: 0.14, vol: 0.13 });
    this.tone({ type: "sine", f0: 3520 * k, dur: 0.1, vol: 0.08, at: 0.035 });
  },
  // Терминал принял карту: пик-пик
  blip() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 1320, dur: 0.08, vol: 0.18 });
    this.tone({ type: "sine", f0: 1760, dur: 0.12, vol: 0.18, at: 0.1 });
  },
  // Принтер чеков: тррррр
  print(seconds = 1) {
    if (!this.ready()) return;
    for (let t = 0; t < seconds; t += 0.05)
      this.noise({ f0: 2600, dur: 0.03, vol: 0.05, filter: "highpass", at: t });
  },
  // Колокольчик над дверью
  door() {
    if (!this.ready()) return;
    [1319, 1047, 1319, 880].forEach((f, i) =>
      this.tone({ type: "triangle", f0: f, dur: 0.45, vol: 0.12, at: i * 0.11 }),
    );
  },
});

// =====================================================
// ФОНОВАЯ МУЗЫКА: весёлая магазинная мелодия на маримбе с басом и шейкером.
// Мелодия своя, записана текстом ниже и играется кодом по кругу.
// =====================================================
const Music = {
  on: true,
  level: 1,
  bus: null,
  timer: null,
  events: null,
  loop: 0,
  index: 0,
  start0: 0,
  eighth: 0.22,
  // Нота или «-» (пауза), после двоеточия длина в восьмых; F#5 — фа-диез
  tune: [
    "D5 G5 B5:2 A5 G5 D5:2",
    "E5 G5 C6:2 F#5:2 A5:2",
    "B5 A5 G5:2 E5 G5 B5:2",
    "C6 B5 A5:2 F#5:2 D5:2",
    "D5 G5 B5:2 A5 G5 D6:2",
    "E6 D6 C6:2 A5 B5 C6 A5",
    "B5 G5 E5:2 F#5 A5 D6:2",
    "G5:2 B5 D6 G6:2 -:2",
    "E5 E5 G5 E5 C5:2 E5:2",
    "D5 D5 G5 D5 B4:2 D5:2",
    "C5 E5 A5 C6 D6 C6 A5:2",
    "B5:2 G5:2 D5:2 -:2",
    "E5 G5 C6 E6 C6 G5 E5:2",
    "D6 B5 G5:2 E5 G5 B5:2",
    "A5 C6 E6:2 D6 C6 A5 F#5",
    "G5:2 D5 B4 G4:2 -:2",
  ],
  harmony: [
    "G D", "C D", "G Em", "Am D", "G D", "C D7", "Em D", "G G",
    "C C", "G G", "Am D7", "G G", "C C", "G Em", "Am D7", "G G",
  ],
  chords: {
    G: { bass: ["G2", "D3"], notes: ["G3", "B3", "D4"] },
    C: { bass: ["C3", "G2"], notes: ["C4", "E4", "G4"] },
    D: { bass: ["D3", "A2"], notes: ["A3", "D4", "F#4"] },
    D7: { bass: ["D3", "A2"], notes: ["F#3", "A3", "C4"] },
    Em: { bass: ["E3", "B2"], notes: ["G3", "B3", "E4"] },
    Am: { bass: ["A2", "E3"], notes: ["A3", "C4", "E4"] },
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
        events.push({ at: base + 2, kind: "stab", fs: chord.notes.map((n) => this.hz(n)) });
        events.push({ at: base + 1, kind: "shaker" }, { at: base + 3, kind: "shaker" });
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
      // Маримба: основной тон и короткий призвук на две октавы выше
      const dur = Math.max(0.3, e.len * this.eighth * 0.8);
      Sound.tone({ type: "sine", f0: e.f, dur, vol: 0.17, at, attack: 0.003 }, bus);
      Sound.tone({ type: "sine", f0: e.f * 4, dur: 0.07, vol: 0.035, at, attack: 0.002 }, bus);
    } else if (e.kind === "bass") {
      Sound.tone({ type: "triangle", f0: e.f, dur: 0.2, vol: 0.17, at }, bus);
    } else if (e.kind === "stab") {
      for (const f of e.fs) Sound.tone({ type: "triangle", f0: f, dur: 0.12, vol: 0.04, at }, bus);
    } else Sound.noise({ f0: 6500, dur: 0.035, vol: 0.03, filter: "highpass", at }, bus);
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
