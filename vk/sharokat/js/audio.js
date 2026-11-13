// =====================================================
// ЗВУК «Шароката»: всё синтезируется кодом, файлов нет
// Основа та же, что в «Пломбирчике», «Лавке Листик» и «Бибике»
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


// Звуки горок
Object.assign(Sound, {
  // Шорох качения: шум, который громче и выше на скорости
  roll(speed, onGround) {
    if (!this.ctx) return;
    if (!this.rolling) {
      const c = this.ctx,
        src = c.createBufferSource(),
        f = c.createBiquadFilter(),
        g = c.createGain();
      src.buffer = this.noiseBuf;
      src.loop = true;
      f.type = "lowpass";
      f.frequency.value = 300;
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      src.start();
      this.rolling = { f, g };
    }
    const now = this.ctx.currentTime,
      k = Math.min(1, speed / 22);
    this.rolling.f.frequency.setTargetAtTime(220 + k * 900, now, 0.08);
    this.rolling.g.gain.setTargetAtTime(onGround && this.on ? 0.05 + k * 0.1 : 0, now, 0.08);
  },
  // Кристалл: подряд — всё выше по гамме
  gem() {
    if (!this.ready()) return;
    const now = performance.now();
    this.gemStep = now - (this.gemAt || 0) < 900 ? (this.gemStep || 0) + 1 : 0;
    this.gemAt = now;
    const scale = [784, 880, 988, 1175, 1319, 1480, 1568, 1760, 1976, 2349];
    const f = scale[this.gemStep % scale.length];
    this.tone({ type: "triangle", f0: f, dur: 0.16, vol: 0.16 });
    this.tone({ type: "sine", f0: f * 2, dur: 0.1, vol: 0.06, at: 0.02 });
  },
  boost() {
    if (!this.ready()) return;
    this.noise({ f0: 400, f1: 4000, dur: 0.5, vol: 0.2, filter: "bandpass" });
    this.tone({ type: "sawtooth", f0: 220, f1: 880, dur: 0.45, vol: 0.06 });
  },
  bump() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 160, f1: 60, dur: 0.22, vol: 0.4 });
    this.tone({ type: "triangle", f0: 420, f1: 180, dur: 0.18, vol: 0.18 });
    this.noise({ f0: 900, dur: 0.08, vol: 0.12 });
  },
  boing() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 200, f1: 700, dur: 0.14, vol: 0.3 });
    this.tone({ type: "sine", f0: 700, f1: 260, dur: 0.25, vol: 0.22, at: 0.12 });
  },
  whee() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 500, f1: 1400, dur: 0.4, vol: 0.14 });
  },
  land() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 120, f1: 50, dur: 0.18, vol: 0.35 });
  },
  // Шар сорвался: свист вниз
  fall() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 1200, f1: 150, dur: 0.9, vol: 0.18 });
  },
  poof() {
    if (!this.ready()) return;
    this.noise({ f0: 3000, f1: 500, dur: 0.3, vol: 0.15, filter: "bandpass" });
    this.tone({ type: "triangle", f0: 660, f1: 990, dur: 0.18, vol: 0.14, at: 0.1 });
  },
  checkpoint() {
    if (!this.ready()) return;
    [1047, 1319, 1568].forEach((f, i) => this.tone({ type: "triangle", f0: f, dur: 0.25, vol: 0.16, at: i * 0.08 }));
  },
  firework() {
    if (!this.ready()) return;
    this.noise({ f0: 1800, f1: 300, dur: 0.5, vol: 0.18, filter: "bandpass" });
    this.tone({ type: "sine", f0: 90, f1: 40, dur: 0.3, vol: 0.25 });
  },
  tick() {
    if (!this.ready()) return;
    this.tone({ type: "square", f0: 880, dur: 0.08, vol: 0.06 });
  },
});

// =====================================================
// ФОНОВАЯ МУЗЫКА: бодрая мелодия для горок — звонкий лид, прыгающий бас по восьмым,
// бочка, хлопки и тарелочка. Мелодия своя, записана текстом и играется кодом по кругу.
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
  eighth: 0.2,
  // Нота или «-» (пауза), после двоеточия длина в восьмых; F#5 — фа-диез
  tune: [
    "A5 F#5 D5 F#5 A5 D6 A5:2",
    "B5 G5 D5 G5 C#6 A5 E5:2",
    "F#5 A5 D6:2 B5 F#5 D5:2",
    "G5 B5 E6:2 C#6 A5 E5:2",
    "A5 F#5 D5 F#5 A5 D6 F#6:2",
    "D6 B5 G5 B5 C#6 E6 G6:2",
    "F#6 D6 B5:2 E6 C#6 A5:2",
    "D6:2 A5 F#5 D5:2 -:2",
    "G5 B5 D6 B5 G5 B5 D6:2",
    "F#5 A5 D6 A5 F#5 A5 D6:2",
    "E5 G5 B5 G5 A5 C#6 E6:2",
    "D6 A5 F#5:2 F#5 B5 D6:2",
    "B5 D6 G6:2 D6 B5 G5:2",
    "A5 D6 F#6:2 D6 B5 F#5:2",
    "E6 B5 G5:2 A5 C#6 E6 G6",
    "F#6:2 D6 A5 D6:2 -:2",
  ],
  harmony: [
    "D D", "G A", "D Bm", "Em A", "D D", "G A7", "Bm A", "D D",
    "G G", "D D", "Em A", "D Bm", "G G", "D Bm", "Em A7", "D D",
  ],
  chords: {
    D: { bass: "D3", notes: ["D4", "F#4", "A4"] },
    G: { bass: "G2", notes: ["G3", "B3", "D4"] },
    A: { bass: "A2", notes: ["A3", "C#4", "E4"] },
    A7: { bass: "A2", notes: ["G3", "C#4", "E4"] },
    Bm: { bass: "B2", notes: ["B3", "D4", "F#4"] },
    Em: { bass: "E3", notes: ["G3", "B3", "E4"] },
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
      pair.split(" ").forEach((name, half) => {
        const chord = this.chords[name],
          base = bar * 8 + half * 4,
          root = this.hz(chord.bass);
        // Бас прыгает по восьмым: нота — октава выше — нота — октава
        for (let k = 0; k < 4; k++) events.push({ at: base + k, kind: "bass", f: k % 2 ? root * 2 : root });
        events.push({ at: base, kind: "kick" }, { at: base + 2, kind: "kick" });
        events.push({ at: base + 2, kind: "clap" }, { at: base + 2, kind: "stab", fs: chord.notes.map((n) => this.hz(n)) });
        events.push({ at: base + 1, kind: "hat" }, { at: base + 3, kind: "hat" });
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
      const dur = Math.max(0.16, e.len * this.eighth * 0.85);
      Sound.tone({ type: "triangle", f0: e.f, dur, vol: 0.12, at, attack: 0.004 }, bus);
      Sound.tone({ type: "square", f0: e.f, dur: dur * 0.7, vol: 0.025, at, attack: 0.004 }, bus);
    } else if (e.kind === "bass") {
      Sound.tone({ type: "triangle", f0: e.f, dur: 0.15, vol: 0.13, at }, bus);
    } else if (e.kind === "kick") {
      Sound.tone({ type: "sine", f0: 150, f1: 45, dur: 0.16, vol: 0.32, at }, bus);
    } else if (e.kind === "clap") {
      Sound.noise({ f0: 1700, dur: 0.11, vol: 0.09, filter: "bandpass", at }, bus);
    } else if (e.kind === "stab") {
      for (const f of e.fs) Sound.tone({ type: "triangle", f0: f, dur: 0.1, vol: 0.03, at }, bus);
    } else Sound.noise({ f0: 7000, dur: 0.03, vol: 0.035, filter: "highpass", at }, bus);
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
  duck(seconds, depth = 0.3) {
    if (!this.bus) return;
    const g = this.bus.gain,
      now = Sound.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.level * depth, now, 0.05);
    g.setTargetAtTime(this.level, now + seconds, 0.35);
  },
};
