// =====================================================
// ЗВУК: всё синтезируется кодом, файлов и чужой музыки нет
// =====================================================
// Музыка играет фоном всю поездку: голоса в игре больше нет
const MUSIC_GAIN = 0.85;
const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  noiseBuf: null,
  on: true,
  starStep: 0,
  starAt: 0,
  boomAt: -1,
  musicLevel: 0.52,
  effectsLevel: 0.82,

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
      this.musicBus = c.createGain();
      this.musicBus.gain.value = this.musicLevel * MUSIC_GAIN;
      this.sfxBus.gain.value = this.effectsLevel;
      this.sfxBus.connect(comp);
      this.musicBus.connect(comp);
      comp.connect(this.master);
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

  setLevels(music, effects) {
    this.musicLevel = music;
    this.effectsLevel = effects;
    if (this.ctx) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(
        music * MUSIC_GAIN,
        this.ctx.currentTime,
        0.06,
      );
      this.sfxBus.gain.setTargetAtTime(effects, this.ctx.currentTime, 0.06);
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

  // У каждой машинки свой гудок
  horn(type) {
    if (!this.ready()) return;
    const kind = (CARS[type] && CARS[type].horn) || "mid";
    if (kind === "siren") {
      [0, 0.34].forEach((at) => {
        this.tone({
          type: "sawtooth",
          f0: 620,
          f1: 950,
          dur: 0.17,
          vol: 0.13,
          at,
        });
        this.tone({
          type: "sawtooth",
          f0: 950,
          f1: 620,
          dur: 0.17,
          vol: 0.13,
          at: at + 0.17,
        });
      });
      return;
    }
    const v = {
      high: [[660, 880], 0.11, 0.2],
      mid: [[440, 554], 0.16, 0.24],
      low: [[147, 185], 0.22, 0.38],
      truck: [[196, 247, 294], 0.15, 0.46],
    }[kind];
    [0, v[2] + 0.06].forEach((at) => {
      v[0].forEach((f) =>
        this.tone({
          type: "square",
          f0: f,
          dur: v[2],
          vol: v[1],
          at,
          attack: 0.012,
        }),
      );
    });
  },

  turbo() {
    if (!this.ready()) return;
    this.noise({ f0: 700, f1: 3800, dur: 0.34, vol: 0.13, filter: "bandpass" });
    this.tone({ type: "sawtooth", f0: 170, f1: 520, dur: 0.3, vol: 0.06 });
  },

  // Двигатель слышно всю поездку: рокот, верхняя нота и глухие толчки цилиндров.
  // С разгоном он забирается выше, у тяжёлой техники ниже, у электромобиля только гул.
  engine(type, boosting, moving = true, rate = 1, biome = "city") {
    if (!this.ctx) return;
    if (!moving) {
      if (this.motor) {
        this.motor.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
        this.motor.roadGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
        this.motor.last = -1;
      }
      return;
    }
    if (!this.motor) {
      const c = this.ctx,
        osc = c.createOscillator(),
        upper = c.createOscillator(),
        upperGain = c.createGain(),
        filter = c.createBiquadFilter(),
        gain = c.createGain(),
        pulse = c.createOscillator(),
        pulseDepth = c.createGain(),
        pulseGain = c.createGain();
      osc.type = "sawtooth";
      upper.type = "square";
      upperGain.gain.value = 0.28;
      filter.type = "lowpass";
      filter.frequency.value = 600;
      filter.Q.value = 1.6;
      gain.gain.value = 0;
      // Толчки цилиндров: громкость дрожит с частотой оборотов
      pulse.type = "sine";
      pulse.frequency.value = 18;
      pulseDepth.gain.value = 0.34;
      pulseGain.gain.value = 0.66;
      pulse.connect(pulseDepth);
      pulseDepth.connect(pulseGain.gain);
      osc.connect(filter);
      upper.connect(upperGain);
      upperGain.connect(filter);
      filter.connect(pulseGain);
      pulseGain.connect(gain);
      gain.connect(this.sfxBus);
      osc.start();
      upper.start();
      pulse.start();
      const road = c.createBufferSource(),
        roadFilter = c.createBiquadFilter(),
        roadGain = c.createGain();
      road.buffer = this.noiseBuf;
      road.loop = true;
      roadFilter.type = "bandpass";
      roadFilter.Q.value = 0.65;
      roadGain.gain.value = 0;
      road.connect(roadFilter);
      roadFilter.connect(roadGain);
      roadGain.connect(this.sfxBus);
      road.start();
      this.motor = { osc, upper, upperGain, pulse, gain, filter, roadGain, roadFilter, last: -1 };
    }
    const now = this.ctx.currentTime,
      m = this.motor;
    if (now - m.last < 0.12) return;
    m.last = now;
    const heavy = ["tank", "truck", "tractor", "bus", "fire", "mixer", "dump", "garbage", "roller", "harvester", "train"].includes(type);
    const electric = type === "ev";
    const revs = (boosting ? 1.45 : 1) * (0.68 + 0.42 * Math.min(rate, 1.6));
    const f = (electric ? 120 : heavy ? 52 : 82) * revs;
    m.osc.type = electric ? "sine" : "sawtooth";
    m.upperGain.gain.setTargetAtTime(electric ? 0.06 : 0.28, now, 0.1);
    m.osc.frequency.setTargetAtTime(f, now, 0.14);
    m.upper.frequency.setTargetAtTime(f * 2.01, now, 0.14);
    m.pulse.frequency.setTargetAtTime(f * 0.25, now, 0.14);
    m.filter.frequency.setTargetAtTime(electric ? 900 : 380 + 420 * revs, now, 0.14);
    m.roadFilter.frequency.setTargetAtTime(biome === "snow" ? 1550 : biome === "desert" ? 730 : 420, now, 0.15);
    m.roadGain.gain.setTargetAtTime((biome === "snow" ? 0.06 : 0.04) * rate, now, 0.13);
    m.gain.gain.setTargetAtTime(electric ? 0.09 : heavy ? 0.2 : 0.16, now, 0.12);
  },

  // Сирена погони: протяжный вой, вплотную частый. Громкость задаёт расстояние до полиции
  siren(level, close = false) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.wail) {
      const sweep = c.createOscillator(),
        depth = c.createGain(),
        horn = c.createOscillator(),
        edge = c.createOscillator(),
        filter = c.createBiquadFilter(),
        gain = c.createGain();
      sweep.type = "triangle";
      sweep.frequency.value = 0.7;
      depth.gain.value = 330;
      horn.type = "sawtooth";
      horn.frequency.value = 960;
      edge.type = "square";
      edge.frequency.value = 966;
      filter.type = "bandpass";
      filter.frequency.value = 1150;
      filter.Q.value = 0.7;
      gain.gain.value = 0;
      sweep.connect(depth);
      depth.connect(horn.frequency);
      depth.connect(edge.frequency);
      horn.connect(filter);
      edge.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus);
      sweep.start();
      horn.start();
      edge.start();
      this.wail = { sweep, gain, last: -1 };
    }
    const now = c.currentTime;
    if (now - this.wail.last < 0.09 && level > 0) return;
    this.wail.last = now;
    this.wail.sweep.frequency.setTargetAtTime(close ? 3 : 0.7, now, 0.2);
    this.wail.gain.gain.setTargetAtTime(level, now, 0.1);
  },

  // Визг шин: полиция ушла в занос
  screech() {
    if (!this.ready()) return;
    this.noise({ f0: 2700, f1: 1500, dur: 0.85, vol: 0.2, filter: "bandpass" });
    this.tone({ type: "sawtooth", f0: 1250, f1: 780, dur: 0.75, vol: 0.05 });
  },

  power(effect) {
    if (!this.ready()) return;
    if (effect === "cannon") {
      this.pop();
      this.gift();
    } else if (effect === "steamroll") {
      this.tone({ type: "sawtooth", f0: 70, f1: 260, dur: 1.4, vol: 0.12 });
      this.noise({ f0: 300, f1: 1100, dur: 1.2, vol: 0.1 });
    } else if (effect === "water" || effect === "wave") {
      this.noise({
        f0: 1800,
        f1: 900,
        dur: 1.2,
        vol: 0.16,
        filter: "bandpass",
      });
    } else if (
      ["freeze", "shield", "ghost", "mini", "magnet", "beam"].includes(effect)
    ) {
      [440, 660, 880].forEach((f, i) =>
        this.tone({
          type: "sine",
          f0: f,
          f1: f * 1.3,
          dur: 0.22,
          vol: 0.1,
          at: i * 0.07,
        }),
      );
    } else if (["plow", "scoop", "harvest", "tip", "hook", "monster", "vacuum"].includes(effect)) {
      this.noise({ f0: 350, f1: 700, dur: 0.35, vol: 0.12 });
      this.tone({ type: "triangle", f0: 90, f1: 160, dur: 0.4, vol: 0.12 });
    } else if (
      ["starfall", "double", "carpet", "express", "rescue", "rainbow", "fly"].includes(effect)
    ) {
      this.gift();
    } else {
      this.turbo();
    }
  },

  // Звёздочки идут вверх по весёлой гамме, если собирать их подряд
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
    this.tone({
      type: "sine",
      f0: 560,
      f1: 210,
      dur: 0.2,
      vol: 0.27,
      at: 0.09,
    });
  },

  splash() {
    if (!this.ready()) return;
    this.noise({ f0: 2600, f1: 450, dur: 0.36, vol: 0.32 });
    [760, 980, 1240].forEach((f, i) =>
      this.tone({
        type: "sine",
        f0: f,
        f1: f * 1.5,
        dur: 0.07,
        vol: 0.13,
        at: 0.05 + i * 0.06,
      }),
    );
  },

  whee() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 320, f1: 1150, dur: 0.46, vol: 0.27 });
    this.noise({ f0: 900, f1: 4200, dur: 0.38, vol: 0.09, filter: "bandpass" });
  },

  whoosh() {
    if (!this.ready()) return;
    this.noise({ f0: 500, f1: 2600, dur: 0.55, vol: 0.17, filter: "bandpass" });
  },

  land() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 170, f1: 74, dur: 0.15, vol: 0.32 });
  },

  // Каток раскатал машину: глухой удар и смешной писк
  crush() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 150, f1: 45, dur: 0.24, vol: 0.34 });
    this.noise({ f0: 700, f1: 160, dur: 0.18, vol: 0.2 });
    this.tone({ type: "triangle", f0: 1250, f1: 420, dur: 0.22, vol: 0.14, at: 0.05 });
  },

  // Взрыв машины: удар, рёв огня и звон обломков. Издалека тише, очередь не складывается в грохот
  boom(k = 1) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now - this.boomAt < 0.1) return;
    this.boomAt = now;
    this.tone({ type: "sine", f0: 170, f1: 40, dur: 1, vol: 1.1 * k });
    this.tone({ type: "triangle", f0: 110, f1: 44, dur: 1.3, vol: 0.55 * k, at: 0.02 });
    this.noise({ f0: 3600, f1: 170, dur: 1.3, vol: 1 * k });
    this.noise({ f0: 1000, f1: 120, dur: 1.8, vol: 0.55 * k, at: 0.06 });
    for (let i = 0; i < 4; i++) {
      const f = 1500 + Math.random() * 2400;
      this.tone({ type: "square", f0: f, f1: f * 0.7, dur: 0.05 + Math.random() * 0.06, vol: 0.035 * k, at: 0.22 + i * 0.13 + Math.random() * 0.08 });
    }
  },

  // Свой звук выстрела у каждого снаряда
  shot(kind) {
    if (!this.ready()) return;
    // Общий щелчок отдачи: у любого снаряда слышно, что это выстрел
    this.tone({ type: "square", f0: 520, f1: 110, dur: 0.1, vol: 0.34 });
    this.noise({ f0: 3200, f1: 800, dur: 0.08, vol: 0.5, filter: "bandpass" });
    if (kind === "boom") {
      this.tone({ type: "sine", f0: 180, f1: 60, dur: 0.22, vol: 0.32 });
      this.noise({ f0: 900, f1: 200, dur: 0.16, vol: 0.2 });
    } else if (kind === "whoosh") {
      this.noise({ f0: 900, f1: 3200, dur: 0.14, vol: 0.14, filter: "bandpass" });
    } else if (kind === "honk") {
      this.tone({ type: "sawtooth", f0: 240, f1: 220, dur: 0.14, vol: 0.13 });
    } else if (kind === "laser") {
      this.tone({ type: "square", f0: 1400, f1: 380, dur: 0.12, vol: 0.09 });
    } else if (kind === "water") {
      this.noise({ f0: 1600, f1: 700, dur: 0.09, vol: 0.14, filter: "bandpass" });
      this.tone({ type: "sine", f0: 500, f1: 900, dur: 0.06, vol: 0.09 });
    } else if (kind === "ding") {
      this.tone({ type: "triangle", f0: 1320, f1: 1320, dur: 0.16, vol: 0.14 });
    } else if (kind === "note") {
      const f = [523, 587, 659, 784, 880][Math.floor(Math.random() * 5)];
      this.tone({ type: "triangle", f0: f, f1: f, dur: 0.2, vol: 0.17 });
    } else if (kind === "clank") {
      this.tone({ type: "square", f0: 1040, f1: 760, dur: 0.07, vol: 0.08 });
      this.tone({ type: "triangle", f0: 2100, f1: 1800, dur: 0.1, vol: 0.08, at: 0.02 });
    } else if (kind === "thud") {
      this.tone({ type: "sine", f0: 240, f1: 110, dur: 0.12, vol: 0.27 });
    } else if (kind === "siren") {
      const up = (this.sirenUp = !this.sirenUp);
      this.tone({ type: "square", f0: up ? 900 : 620, f1: up ? 620 : 900, dur: 0.13, vol: 0.07 });
    } else if (kind === "bubble") {
      this.tone({ type: "sine", f0: 340, f1: 1100, dur: 0.1, vol: 0.2 });
    } else this.pop();
  },

  pop() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 880, f1: 240, dur: 0.1, vol: 0.27 });
    this.noise({ f0: 3400, dur: 0.05, vol: 0.11, filter: "highpass" });
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

  giggle() {
    if (!this.ready()) return;
    [1, 1.2, 1, 1.25].forEach((k, i) =>
      this.tone({
        type: "sine",
        f0: 620 * k,
        f1: 760 * k,
        dur: 0.09,
        vol: 0.18,
        at: i * 0.1,
      }),
    );
  },

  fanfare() {
    if (!this.ready()) return;
    Music.duck(3.2);
    [523, 523, 659, 784, 659, 784, 1047, 1047].forEach((f, i) => {
      const at = [0, 0.13, 0.26, 0.39, 0.58, 0.71, 0.84, 1.06][i];
      this.tone({
        type: "square",
        f0: f,
        dur: i === 7 ? 0.65 : 0.18,
        vol: 0.09,
        at,
      });
      this.tone({
        type: "triangle",
        f0: f,
        dur: i === 7 ? 0.65 : 0.18,
        vol: 0.2,
        at,
      });
    });
  },

  firework() {
    if (!this.ready()) return;
    this.noise({ f0: 1600, f1: 240, dur: 0.46, vol: 0.2 });
    this.tone({ type: "sine", f0: 240, f1: 62, dur: 0.22, vol: 0.2 });
  },
};

// Фоновая музыка: своя мелодия у каждого мира, ударные и бас задают темп
const Music = {
  track: 0,
  step: 0,
  next: 0,
  TRACKS: [
    {
      bpm: 138,
      root: 261.63,
      prog: [0, 5, 7, 0],
      lead: [0, 2, 4, 2, 5, 4, 2, 0],
      wave: "triangle",
    },
    {
      bpm: 126,
      root: 293.66,
      prog: [0, 9, 5, 7],
      lead: [4, 2, 0, 2, 4, 5, 4, 2],
      wave: "sine",
    },
    {
      bpm: 146,
      root: 329.63,
      prog: [0, 5, 0, 7],
      lead: [0, 4, 2, 5, 4, 2, 4, 0],
      wave: "triangle",
    },
    {
      bpm: 118,
      root: 349.23,
      prog: [0, 7, 9, 5],
      lead: [5, 4, 2, 0, 2, 4, 2, 0],
      wave: "sine",
    },
    {
      bpm: 132,
      root: 220.0,
      prog: [0, 3, 5, 7],
      lead: [0, 2, 3, 5, 3, 2, 5, 4],
      wave: "triangle",
    },
    {
      bpm: 130,
      root: 246.94,
      prog: [0, 5, 2, 7],
      lead: [2, 4, 5, 4, 0, 2, 4, 0],
      wave: "triangle",
    },
    {
      bpm: 112,
      root: 220,
      prog: [0, 3, 7, 5],
      lead: [0, 2, 5, 4, 2, 4, 2, 0],
      wave: "sine",
    },
  ],

  setTrack(i) {
    if (i !== this.track) {
      this.track = i;
      this.step = 0;
      if (Sound.ctx) {
        const now = Sound.ctx.currentTime;
        this.next = now + 0.16;
        const gain = Sound.musicBus.gain;
        gain.cancelScheduledValues(now);
        gain.setTargetAtTime(0.001, now, 0.045);
        gain.setTargetAtTime(Sound.musicLevel * MUSIC_GAIN, now + 0.15, 0.18);
      }
    }
  },

  duck(seconds) {
    if (!Sound.ctx) return;
    const now = Sound.ctx.currentTime;
    const g = Sound.musicBus.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Sound.musicLevel * 0.16, now, 0.05);
    g.setTargetAtTime(Sound.musicLevel * MUSIC_GAIN, now + seconds, 0.5);
  },

  tick() {
    if (!Sound.ready()) return;
    const now = Sound.ctx.currentTime;
    const tr = this.TRACKS[this.track];
    const dur = 60 / tr.bpm / 2;
    if (this.next < now) this.next = now + 0.06;
    while (this.next < now + 0.3) {
      this.play(tr, this.step, this.next - now, dur);
      this.next += dur;
      this.step = (this.step + 1) % 64;
    }
  },

  play(tr, step, at, dur) {
    const bus = Sound.musicBus;
    const bar = Math.floor(step / 8) % tr.prog.length;
    const s = step % 8;
    const root = tr.root * Math.pow(2, tr.prog[bar] / 12);
    const major = [1, 1.122, 1.26, 1.335, 1.498, 1.682, 2];
    // Ударные и быстрый бас держат темп погони
    if (s === 0 || s === 4)
      Sound.tone({ type: "sine", f0: 150, f1: 48, dur: 0.17, vol: 0.5, at, attack: 0.002 }, bus);
    if (s === 2 || s === 6)
      Sound.noise({ f0: 1800, dur: 0.13, vol: 0.2, filter: "highpass", at }, bus);
    Sound.noise({ f0: 7600, dur: 0.035, vol: s % 2 ? 0.08 : 0.04, filter: "highpass", at }, bus);
    Sound.tone(
      { type: "triangle", f0: (root / 2) * (s % 2 ? 2 : 1), dur: dur * 0.85, vol: 0.24, at },
      bus,
    );
    if (s === 2 || s === 6) {
      Sound.tone(
        { type: "sine", f0: root * 1.26, dur: dur * 0.8, vol: 0.11, at },
        bus,
      );
      Sound.tone(
        { type: "sine", f0: root * 1.498, dur: dur * 0.8, vol: 0.11, at },
        bus,
      );
    }
    // Мелодия чередуется с паузой, чтобы не утомлять
    if (Math.floor(step / 16) % 2 === 0) {
      Sound.tone(
        {
          type: tr.wave,
          f0: root * 2 * major[tr.lead[s]],
          dur: dur * 1.1,
          vol: 0.13,
          at,
        },
        bus,
      );
    } else if (s % 2 === 0) {
      Sound.tone(
        {
          type: "sine",
          f0: root * 4 * major[tr.lead[s]],
          dur: dur * 0.6,
          vol: 0.05,
          at,
        },
        bus,
      );
    }
  },
};

