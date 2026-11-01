// =====================================================
// ЗВУК: всё синтезируется кодом, файлов и чужой музыки нет
// =====================================================
const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  noiseBuf: null,
  on: true,
  starStep: 0,
  starAt: 0,
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
      this.musicBus.gain.value = this.musicLevel * 0.8;
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
        music * 0.8,
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

  noise(o) {
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
    g.connect(this.sfxBus);
    src.start(t0, Math.random() * 0.8);
    src.stop(t0 + o.dur + 0.02);
  },

  // Лебёдка и моторы крана: гудят, пока кран двигается
  motor(speed) {
    if (!this.ctx) return;
    if (!this.crane) {
      const c = this.ctx,
        osc = c.createOscillator(),
        filter = c.createBiquadFilter(),
        gain = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 70;
      filter.type = "lowpass";
      filter.frequency.value = 420;
      gain.gain.value = 0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus);
      osc.start();
      this.crane = { osc, gain, last: -1 };
    }
    const now = this.ctx.currentTime;
    if (now - this.crane.last < 0.08) return;
    this.crane.last = now;
    const k = Math.min(1, speed);
    this.crane.osc.frequency.setTargetAtTime(62 + k * 70, now, 0.08);
    this.crane.gain.gain.setTargetAtTime(k * 0.11, now, 0.07);
  },

  // Город внизу и ветер наверху: чем выше дом, тем тише улица и громче ветер
  ambience(height) {
    if (!this.ctx) return;
    if (!this.air) {
      const c = this.ctx,
        make = (type, freq) => {
          const src = c.createBufferSource(),
            filter = c.createBiquadFilter(),
            gain = c.createGain();
          src.buffer = this.noiseBuf;
          src.loop = true;
          filter.type = type;
          filter.frequency.value = freq;
          filter.Q.value = 0.6;
          gain.gain.value = 0;
          src.connect(filter);
          filter.connect(gain);
          gain.connect(this.sfxBus);
          src.start();
          return gain;
        };
      this.air = { street: make("lowpass", 420), wind: make("bandpass", 760), last: -1 };
    }
    const now = this.ctx.currentTime;
    if (now - this.air.last < 0.25) return;
    this.air.last = now;
    const k = Math.min(1, height / 150);
    this.air.street.gain.setTargetAtTime(0.11 * (1 - k), now, 0.4);
    this.air.wind.gain.setTargetAtTime(0.025 + 0.1 * k, now, 0.4);
  },

  // Этаж лёг на место: глухой удар и звон металла
  thud(k = 1) {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 150, f1: 46, dur: 0.42, vol: 0.8 * k });
    this.noise({ f0: 1100, f1: 180, dur: 0.3, vol: 0.34 * k });
    this.tone({ type: "triangle", f0: 780, f1: 640, dur: 0.12, vol: 0.06 * k, at: 0.02 });
  },

  // Точное попадание: нота растёт с каждым точным этажом подряд
  chime(step) {
    if (!this.ready()) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24],
      f = 523.25 * Math.pow(2, scale[Math.min(step, scale.length - 1)] / 12);
    this.tone({ type: "triangle", f0: f, dur: 0.36, vol: 0.34 });
    this.tone({ type: "sine", f0: f * 2, dur: 0.28, vol: 0.14, at: 0.05 });
  },

  // Этаж сорвался: смешной свист вниз
  whistle() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 1250, f1: 210, dur: 0.75, vol: 0.26 });
  },

  crash() {
    if (!this.ready()) return;
    this.noise({ f0: 2600, f1: 220, dur: 0.7, vol: 0.42 });
    this.tone({ type: "sine", f0: 130, f1: 40, dur: 0.42, vol: 0.46 });
    for (let i = 0; i < 4; i++) {
      const f = 900 + Math.random() * 1500;
      this.tone({ type: "square", f0: f, f1: f * 0.7, dur: 0.06, vol: 0.04, at: 0.12 + i * 0.1 });
    }
  },

  tap() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 620, f1: 1020, dur: 0.09, vol: 0.2 });
  },

  pop() {
    if (!this.ready()) return;
    this.tone({ type: "sine", f0: 880, f1: 240, dur: 0.1, vol: 0.27 });
  },

  // Открылся новый этаж
  gift() {
    if (!this.ready()) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: "triangle", f0: f, dur: 0.17, vol: 0.2, at: i * 0.07 }));
  },

  fanfare() {
    if (!this.ready()) return;
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      this.tone({ type: "triangle", f0: f, dur: 0.26, vol: 0.2, at: i * 0.12 });
      this.tone({ type: "sine", f0: f / 2, dur: 0.26, vol: 0.14, at: i * 0.12 });
    });
  },

  firework() {
    if (!this.ready()) return;
    this.noise({ f0: 1800, f1: 240, dur: 0.6, vol: 0.34 });
    this.tone({ type: "sine", f0: 240, f1: 62, dur: 0.3, vol: 0.34 });
  },
};

// Фоновая музыка: своя мелодия у каждого дома
const Music = {
  track: 0,
  step: 0,
  next: 0,
  TRACKS: [
    {
      bpm: 124,
      root: 261.63,
      prog: [0, 5, 7, 0],
      lead: [0, 2, 4, 2, 5, 4, 2, 0],
      wave: "triangle",
    },
    {
      bpm: 112,
      root: 293.66,
      prog: [0, 9, 5, 7],
      lead: [4, 2, 0, 2, 4, 5, 4, 2],
      wave: "sine",
    },
    {
      bpm: 132,
      root: 329.63,
      prog: [0, 5, 0, 7],
      lead: [0, 4, 2, 5, 4, 2, 4, 0],
      wave: "triangle",
    },
    {
      bpm: 104,
      root: 349.23,
      prog: [0, 7, 9, 5],
      lead: [5, 4, 2, 0, 2, 4, 2, 0],
      wave: "sine",
    },
    {
      bpm: 118,
      root: 220.0,
      prog: [0, 3, 5, 7],
      lead: [0, 2, 3, 5, 3, 2, 5, 4],
      wave: "triangle",
    },
    {
      bpm: 116,
      root: 246.94,
      prog: [0, 5, 2, 7],
      lead: [2, 4, 5, 4, 0, 2, 4, 0],
      wave: "triangle",
    },
    {
      bpm: 98,
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
        gain.setTargetAtTime(Sound.musicLevel * 0.8, now + 0.15, 0.18);
      }
    }
  },

  duck(seconds) {
    if (!Sound.ctx) return;
    const now = Sound.ctx.currentTime;
    const g = Sound.musicBus.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Sound.musicLevel * 0.16, now, 0.05);
    g.setTargetAtTime(Sound.musicLevel * 0.8, now + seconds, 0.5);
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
    if (s === 0 || s === 4)
      Sound.tone(
        { type: "triangle", f0: root / 2, dur: dur * 1.7, vol: 0.34, at },
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

