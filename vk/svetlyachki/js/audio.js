// =====================================================
// ЗВУК «Светлячкового концерта»: всё синтезируется кодом, кроме голосов (voices/*.mp3)
// Основа та же, что в «Пломбирчике», «Шарокате», «Зубике» и «Ёжике-почтальоне»
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
  },
};


// Звуки концерта
Object.assign(Sound, {
  // Нота светлячка: челеста — звонкая, тёплая, быстро гаснет. При попадании звучит сразу
  bell(f, vol = 1, at = 0, bus) {
    if (!this.ready()) return;
    const v = 0.26 * vol;
    this.tone({ type: "sine", f0: f, dur: 1.1, vol: v, at, attack: 0.004 }, bus);
    this.tone({ type: "triangle", f0: f, dur: 0.35, vol: v * 0.35, at, attack: 0.003 }, bus);
    this.tone({ type: "sine", f0: f * 3.01, dur: 0.22, vol: v * 0.22, at, attack: 0.002 }, bus);
    this.tone({ type: "sine", f0: f * 4.2, dur: 0.08, vol: v * 0.1, at, attack: 0.001 }, bus);
  },
  // Отсчёт перед песней: деревянная коробочка, первая доля звонче
  click(accent, at = 0) {
    if (!this.ready()) return;
    this.tone({ type: "triangle", f0: accent ? 1760 : 1320, f1: accent ? 1200 : 900, dur: 0.06, vol: 0.22, at });
    this.noise({ f0: 3000, dur: 0.02, vol: 0.08, filter: "highpass", at });
  },
  // Рано нажал: тихий «динь» без ноты
  soft() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 2093, dur: 0.08, vol: 0.05 });
  },
  // Кружок пустой: мягкий стук
  thud() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 180, f1: 90, dur: 0.1, vol: 0.12 });
  },
  whoosh() {
    if (!this.ready()) return;
    this.noise({ f0: 500, f1: 3000, dur: 0.4, vol: 0.1, filter: "bandpass" });
  },
  // Салют в конце концерта
  boom(at = 0) {
    if (!this.ready()) return;
    this.noise({ f0: 1800, f1: 200, dur: 0.6, vol: 0.18, at });
    this.tone({ type: "sine", f0: 120, f1: 50, dur: 0.4, vol: 0.25, at });
    for (let i = 0; i < 6; i++) this.tone({ type: "sine", f0: 1800 + Math.random() * 1600, dur: 0.12, vol: 0.04, at: at + 0.15 + i * 0.07 });
  },
});

// =====================================================
// ОРКЕСТР: аккомпанемент песни по часам звука. Бас, мягкие аккорды, шейкер, тихий барабан.
// В меню играет и мелодию сам (auto). На паузе — тишина, после паузы — с того же места.
// =====================================================
const Band = {
  on: true,
  bus: null,
  song: null,
  events: [],
  index: 0,
  timer: null,
  clock: null,
  auto: false,
  level: 0.8,
  ensure() {
    if (!Sound.ctx) return false;
    if (!this.bus) {
      this.bus = Sound.ctx.createGain();
      this.bus.gain.value = this.level;
      this.bus.connect(Sound.comp);
    }
    return true;
  },
  // song — разобранная песня (rhythm.js parseSong), clock — часы песни, chords — таблица аккордов
  play(song, clock, chords, auto = false) {
    this.stop();
    if (!this.ensure()) return;
    this.song = song;
    this.clock = clock;
    this.auto = auto;
    const hz = (n) => {
      const steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
      const midi = 12 * (Number(n.slice(-1)) + 1) + steps[n[0]] + (n[1] === "#" ? 1 : 0);
      return 440 * Math.pow(2, (midi - 69) / 12);
    };
    const ev = [];
    const beat = song.beat;
    for (const c of song.chords) {
      const ch = chords[c.name];
      const beats = Math.round(c.len / beat);
      for (let b = 0; b < beats; b++) {
        const t = c.t + b * beat;
        if (b % 2 === 0) ev.push({ t, kind: "bass", f: hz(ch.bass[(b / 2) % 2]) });
        if (b % 2 === 1) ev.push({ t, kind: "stab", fs: ch.notes.map(hz) });
        ev.push({ t: t + beat / 2, kind: "shaker" });
        if (b === 0) ev.push({ t, kind: "kick" });
      }
      ev.push({ t: c.t, kind: "pad", fs: ch.notes.map(hz), len: c.len });
    }
    if (auto) for (const n of song.notes) ev.push({ t: n.t, kind: "lead", f: n.f });
    ev.sort((a, b) => a.t - b.t);
    this.events = ev;
    this.index = 0;
    this.bus.gain.cancelScheduledValues(Sound.ctx.currentTime);
    this.bus.gain.setValueAtTime(this.on ? this.level : 0, Sound.ctx.currentTime);
    this.seek();
    this.timer = setInterval(() => this.tick(), 50);
    this.tick();
  },
  // Найти первое событие после текущего времени песни
  seek() {
    const now = this.clock.time();
    this.index = this.events.findIndex((e) => e.t >= now - 0.02);
    if (this.index < 0) this.index = this.events.length;
  },
  tick() {
    const ctx = Sound.ctx;
    if (!ctx || ctx.state !== "running" || !this.clock || !this.clock.running) return;
    const now = this.clock.time();
    while (this.index < this.events.length) {
      const e = this.events[this.index];
      if (e.t > now + 0.3) break;
      const at = Math.max(0, e.t - now);
      if (e.t >= now - 0.05) this.sound(e, at);
      this.index++;
    }
    // Песня в меню идёт по кругу
    if (this.auto && this.index >= this.events.length && now > this.song.length) {
      this.clock.start(-1);
      this.seek();
    }
  },
  sound(e, at) {
    const bus = this.bus;
    if (e.kind === "bass") Sound.tone({ type: "triangle", f0: e.f, dur: 0.32, vol: 0.2, at }, bus);
    else if (e.kind === "stab") for (const f of e.fs) Sound.tone({ type: "triangle", f0: f, dur: 0.14, vol: 0.035, at }, bus);
    else if (e.kind === "pad") for (const f of e.fs) Sound.tone({ type: "sine", f0: f, dur: Math.min(3, e.len), vol: 0.03, at, attack: 0.25 }, bus);
    else if (e.kind === "shaker") Sound.noise({ f0: 7000, dur: 0.03, vol: 0.025, filter: "highpass", at }, bus);
    else if (e.kind === "kick") Sound.tone({ type: "sine", f0: 110, f1: 45, dur: 0.18, vol: 0.18, at }, bus);
    else if (e.kind === "lead") Sound.bell(e.f, 0.7, at, bus);
  },
  pause() {
    if (this.bus && Sound.ctx) this.bus.gain.setTargetAtTime(0, Sound.ctx.currentTime, 0.02);
  },
  resume() {
    if (!this.bus || !Sound.ctx) return;
    this.seek();
    this.bus.gain.setTargetAtTime(this.on ? this.level : 0, Sound.ctx.currentTime, 0.03);
  },
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.song = null;
    if (this.bus && Sound.ctx) this.bus.gain.setTargetAtTime(0, Sound.ctx.currentTime, 0.05);
  },
  setOn(v) {
    this.on = v;
    if (this.bus && Sound.ctx && this.song) this.bus.gain.setTargetAtTime(v ? this.level : 0, Sound.ctx.currentTime, 0.05);
  },
  duck(seconds) {
    if (!this.bus || !this.on || !this.song) return;
    const g = this.bus.gain,
      now = Sound.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.level * 0.35, now, 0.05);
    g.setTargetAtTime(this.level, now + seconds, 0.3);
  },
};
