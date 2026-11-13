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
      this.musicBus.gain.value = this.musicLevel * 0.6;
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
        music * 0.6,
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

  // У каждой машинки свой гудок
  turbo() {
    if (!this.ready()) return;
    this.noise({ f0: 700, f1: 3800, dur: 0.34, vol: 0.13, filter: "bandpass" });
    this.tone({ type: "sawtooth", f0: 170, f1: 520, dur: 0.3, vol: 0.06 });
  },

  // Тихий непрерывный двигатель, разный у тяжёлой техники и легковых машин.
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
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      filter.type = "lowpass";
      filter.frequency.value = 260;
      gain.gain.value = 0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus);
      osc.start();
      const road = this.ctx.createBufferSource(),
        roadFilter = this.ctx.createBiquadFilter(),
        roadGain = this.ctx.createGain();
      road.buffer = this.noiseBuf;
      road.loop = true;
      roadFilter.type = "bandpass";
      roadFilter.Q.value = 0.65;
      roadGain.gain.value = 0;
      road.connect(roadFilter);
      roadFilter.connect(roadGain);
      roadGain.connect(this.sfxBus);
      road.start();
      this.motor = { osc, gain, filter, roadGain, roadFilter, last: -1 };
    }
    if (this.ctx.currentTime - this.motor.last < 0.12) return;
    this.motor.last = this.ctx.currentTime;
    const heavy = ["tank", "truck", "tractor", "bus", "fire"].includes(type);
    const electric = type === "ev";
    this.motor.osc.type = electric ? "sine" : "sawtooth";
    this.motor.osc.frequency.setTargetAtTime(
      (electric ? 105 : heavy ? 42 : 67) *
        (boosting ? 1.6 : 1) *
        (0.64 + 0.36 * rate),
      this.ctx.currentTime,
      0.15,
    );
    this.motor.roadFilter.frequency.setTargetAtTime(
      biome === "snow" ? 1550 : biome === "desert" ? 730 : 420,
      this.ctx.currentTime,
      0.15,
    );
    this.motor.roadGain.gain.setTargetAtTime(
      (biome === "snow" ? 0.048 : 0.03) * rate,
      this.ctx.currentTime,
      0.13,
    );
    this.motor.gain.gain.setTargetAtTime(
      electric ? 0.025 : heavy ? 0.065 : 0.045,
      this.ctx.currentTime,
      0.12,
    );
  },

  power(effect) {
    if (!this.ready()) return;
    if (effect === "cannon") {
      this.pop();
      this.gift();
    } else if (effect === "water") {
      this.noise({
        f0: 1800,
        f1: 900,
        dur: 1.2,
        vol: 0.16,
        filter: "bandpass",
      });
    } else if (
      ["freeze", "shield", "ghost", "mini", "magnet"].includes(effect)
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
    } else if (["plow", "hook", "monster", "vacuum"].includes(effect)) {
      this.noise({ f0: 350, f1: 700, dur: 0.35, vol: 0.12 });
      this.tone({ type: "triangle", f0: 90, f1: 160, dur: 0.4, vol: 0.12 });
    } else if (
      ["starfall", "double", "express", "rescue", "rainbow", "fly"].includes(effect)
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

// Весёлая музыка: своя мелодия у каждого мира
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
        gain.setTargetAtTime(Sound.musicLevel * 0.6, now + 0.15, 0.18);
      }
    }
  },

  duck(seconds) {
    if (!Sound.ctx) return;
    const now = Sound.ctx.currentTime;
    const g = Sound.musicBus.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Sound.musicLevel * 0.16, now, 0.05);
    g.setTargetAtTime(Sound.musicLevel * 0.6, now + seconds, 0.5);
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

// Голосовые подсказки вместо текста: игрок ещё не читает.
// Если русского голоса нет, просто молчим: чужой голос читает русский непонятно.
// Голос: только записанные фразы Gemini (voices/<имя>.mp3, см. games-portal/tools/voices.mjs).
// Роботного голоса устройства нет: если записи нет или звук ещё не разрешён, фраза не звучит.
const Voice = {
  cache: new Map(),
  token: 0,
  current: null,
  // Та же транслитерация, что в tools/voices.mjs: «Выбери дерево!» → vyberi-derevo
  slug(text) {
    const map = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
    return text
      .toLowerCase()
      .split("")
      .map((c) => map[c] ?? c)
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
  },
  async say(text) {
    if (!Sound.on) return;
    this.stop();
    const token = this.token,
      ctx = Sound.ctx;
    if (ctx) {
      try {
        const id = this.slug(text);
        if (!this.cache.has(id)) {
          const loading = fetch("./voices/" + id + ".mp3")
            .then((r) => {
              if (!r.ok) throw Error("voice");
              return r.arrayBuffer();
            })
            .then((data) => ctx.decodeAudioData(data));
          loading.catch(() => {});
          this.cache.set(id, loading);
        }
        const clip = await this.cache.get(id);
        if (token !== this.token) return;
        const source = ctx.createBufferSource(),
          gain = ctx.createGain();
        source.buffer = clip;
        gain.gain.value = Math.min(1, Sound.effectsLevel + 0.15);
        source.connect(gain);
        gain.connect(Sound.master);
        source.start();
        this.current = source;
        Music.duck(clip.duration + 0.3);
        return;
      } catch (_) {}
    }
  },
  stop() {
    this.token++;
    try {
      if (this.current) this.current.stop();
    } catch (_) {}
    this.current = null;
  },
};
