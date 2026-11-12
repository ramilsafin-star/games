// =====================================================
// ЗВУК: процедурные эффекты и музыка (Web Audio API).
// Все ноты свои — никаких лицензионных треков и файлов.
// =====================================================
const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  noiseBuf: null,
  ytMuted: false,     // настройка YouTube — главнее любых игровых переключателей
  sysPaused: false,
  sfxOn: true,
  musicOn: true,
  lastPlayed: {},

  // Контекст создаём сразу: Playables может быть в фокусе и без клика игрока
  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || this.ctx) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    this.master = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus = c.createGain();
    this.sfxBus.connect(comp);
    this.musicBus.connect(comp);
    comp.connect(this.master);
    this.master.connect(c.destination);

    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.applyGains();
    if (this.ytMuted) c.suspend().catch(() => {});
    else this.unlock();
    // На случай, если браузер всё же ждёт жест пользователя
    ['pointerdown', 'touchend', 'keydown'].forEach((ev) => {
      window.addEventListener(ev, () => this.unlock(), { passive: true });
    });
  },

  unlock() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.sysPaused && !this.ytMuted) {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  },

  applyGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.ytMuted ? 0 : 1, now, 0.01);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? 1 : 0, now, 0.01);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? Music.level : 0, now, 0.05);
  },

  setYouTubeAudio(enabled) {
    this.ytMuted = !enabled;
    this.applyGains();
    if (!this.ctx) return;
    if (this.ytMuted) {
      this.ctx.suspend().catch(() => {});
    } else {
      this.unlock();
    }
  },

  pause() {
    this.sysPaused = true;
    if (this.ctx) this.ctx.suspend().catch(() => {});
  },

  resume() {
    this.sysPaused = false;
    Music.resync();
    this.unlock();
  },

  ready() {
    return this.ctx && this.ctx.state === 'running' && !this.ytMuted && !this.sysPaused;
  },

  canPlay(name, gapMs) {
    if (!this.ready() || !this.sfxOn) return false;
    const now = performance.now();
    if (gapMs && now - (this.lastPlayed[name] || 0) < gapMs) return false;
    this.lastPlayed[name] = now;
    return true;
  },

  tone(o, bus) {
    const c = this.ctx;
    const t0 = c.currentTime + (o.at || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + (o.attack || 0.006));
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
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 10), t0 + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus || this.sfxBus);
    src.start(t0, Math.random() * 0.8);
    src.stop(t0 + o.dur + 0.02);
  },

  stretch(fraction) {
    if (!this.canPlay('stretch', 70)) return;
    this.tone({ type: 'triangle', f0: 170 + fraction * 420, f1: 150 + fraction * 380, dur: 0.06, vol: 0.05 });
  },

  launch() {
    if (!this.canPlay('launch', 40)) return;
    this.tone({ type: 'sine', f0: 240, f1: 980, dur: 0.17, vol: 0.2 });
    this.noise({ f0: 900, f1: 5200, dur: 0.24, vol: 0.13, filter: 'bandpass', q: 1.2 });
  },

  // Голос каждого пуфа при вылете
  voice(type) {
    if (!this.canPlay('voice', 60)) return;
    const pitch = { rocky: 330, zip: 620, trio: 880, nimbus: 480, magma: 210, drill: 260, frost: 740, dyna: 170 }[type] || 400;
    this.tone({ type: 'square', f0: pitch, f1: pitch * 1.7, dur: 0.11, vol: 0.05, at: 0.03 });
    this.tone({ type: 'sine', f0: pitch * 1.7, f1: pitch * 1.2, dur: 0.2, vol: 0.1, at: 0.13 });
  },

  ability(kind) {
    if (!this.canPlay('ability', 60)) return;
    if (kind === 'dash') {
      this.tone({ type: 'sawtooth', f0: 300, f1: 1500, dur: 0.22, vol: 0.13 });
      this.noise({ f0: 1500, f1: 7000, dur: 0.3, vol: 0.14, filter: 'highpass' });
    } else if (kind === 'split') {
      [660, 880, 1175].forEach((f, i) => {
        this.tone({ type: 'triangle', f0: f, f1: f * 1.25, dur: 0.13, vol: 0.16, at: i * 0.045 });
      });
    } else if (kind === 'roar') {
      this.tone({ type: 'sawtooth', f0: 170, f1: 70, dur: 0.34, vol: 0.2 });
      this.noise({ f0: 500, f1: 160, dur: 0.34, vol: 0.2 });
    } else if (kind === 'drop') {
      this.tone({ type: 'square', f0: 1200, f1: 180, dur: 0.24, vol: 0.09 });
      this.noise({ f0: 3000, f1: 700, dur: 0.14, vol: 0.13, filter: 'bandpass', q: 3 });
    } else if (kind === 'bomb') {
      // Шипение запала и падающие шашки
      this.noise({ f0: 5200, f1: 2600, dur: 0.5, vol: 0.13, filter: 'highpass' });
      this.tone({ type: 'triangle', f0: 900, f1: 240, dur: 0.34, vol: 0.13 });
    } else if (kind === 'drill') {
      this.tone({ type: 'sawtooth', f0: 90, f1: 420, dur: 0.42, vol: 0.13 });
      this.noise({ f0: 1800, f1: 4200, dur: 0.42, vol: 0.12, filter: 'bandpass', q: 2 });
    } else if (kind === 'frost') {
      [1760, 1319, 1047, 880].forEach((f, i) => {
        this.tone({ type: 'sine', f0: f, f1: f * 0.94, dur: 0.2, vol: 0.13, at: i * 0.05 });
      });
      this.noise({ f0: 6000, f1: 2400, dur: 0.36, vol: 0.1, filter: 'highpass' });
    }
  },

  portal() {
    if (!this.canPlay('portal', 80)) return;
    this.tone({ type: 'sine', f0: 280, f1: 1400, dur: 0.22, vol: 0.15 });
    this.tone({ type: 'triangle', f0: 1400, f1: 500, dur: 0.22, vol: 0.12, at: 0.1 });
  },

  boing() {
    if (!this.canPlay('boing', 70)) return;
    this.tone({ type: 'sine', f0: 190, f1: 720, dur: 0.2, vol: 0.2 });
    this.tone({ type: 'triangle', f0: 720, f1: 340, dur: 0.14, vol: 0.09, at: 0.12 });
  },

  gem() {
    if (!this.canPlay('gem', 60)) return;
    [1319, 1760, 2349].forEach((f, i) => {
      this.tone({ type: 'triangle', f0: f, f1: f, dur: 0.16, vol: 0.13, at: i * 0.06 });
    });
  },

  shieldPop() {
    if (!this.canPlay('shield', 60)) return;
    this.tone({ type: 'sine', f0: 1900, f1: 520, dur: 0.2, vol: 0.14 });
    this.noise({ f0: 5200, f1: 1800, dur: 0.22, vol: 0.13, filter: 'highpass' });
  },

  bossRage() {
    if (!this.canPlay('rage', 200)) return;
    this.tone({ type: 'sawtooth', f0: 150, f1: 55, dur: 0.6, vol: 0.2 });
    this.tone({ type: 'square', f0: 300, f1: 110, dur: 0.5, vol: 0.07, at: 0.06 });
  },

  hit(mat, strength) {
    if (!this.canPlay('hit_' + mat, 45)) return;
    const v = Math.min(1, 0.35 + strength * 0.05);
    if (mat === 'ice') {
      this.tone({ type: 'sine', f0: 1500 + Math.random() * 500, f1: 820, dur: 0.13, vol: 0.13 * v });
      this.tone({ type: 'sine', f0: 2800, f1: 1900, dur: 0.08, vol: 0.05 * v, at: 0.015 });
      this.noise({ f0: 4200, dur: 0.07, vol: 0.09 * v, filter: 'highpass' });
    } else if (mat === 'stone') {
      this.tone({ type: 'triangle', f0: 120, f1: 44, dur: 0.15, vol: 0.32 * v });
      this.noise({ f0: 620, f1: 180, dur: 0.1, vol: 0.2 * v });
    } else {
      this.tone({ type: 'square', f0: 190 + Math.random() * 70, f1: 70, dur: 0.075, vol: 0.09 * v });
      this.noise({ f0: 1700, f1: 500, dur: 0.07, vol: 0.14 * v, filter: 'bandpass' });
    }
  },

  shatter(mat) {
    if (!this.canPlay('shatter_' + mat, 50)) return;
    if (mat === 'ice') {
      [2100, 2640, 3300].forEach((f, i) => {
        this.tone({ type: 'sine', f0: f, f1: f * 0.7, dur: 0.16, vol: 0.07, at: i * 0.022 });
      });
      this.noise({ f0: 5200, dur: 0.17, vol: 0.13, filter: 'highpass' });
    } else if (mat === 'stone') {
      this.tone({ type: 'triangle', f0: 90, f1: 34, dur: 0.24, vol: 0.34 });
      this.noise({ f0: 900, f1: 130, dur: 0.24, vol: 0.28 });
    } else {
      this.tone({ type: 'square', f0: 240, f1: 54, dur: 0.12, vol: 0.1 });
      this.noise({ f0: 2300, f1: 480, dur: 0.17, vol: 0.22, filter: 'bandpass', q: 0.9 });
    }
  },

  // Гибель бота: электрический разряд, хлопок и звон винтиков
  botDown(comboStep) {
    if (!this.canPlay('bot', 45)) return;
    const up = Math.pow(1.122, Math.min(comboStep, 6));
    this.tone({ type: 'square', f0: 1300 * up, f1: 170 * up, dur: 0.2, vol: 0.11 });
    this.tone({ type: 'sine', f0: 300 * up, f1: 980 * up, dur: 0.13, vol: 0.22 });
    this.noise({ f0: 3400, f1: 900, dur: 0.15, vol: 0.13, filter: 'bandpass', q: 2 });
    [1900, 2500, 3100].forEach((f, i) => {
      this.tone({ type: 'triangle', f0: f * up, dur: 0.07, vol: 0.05, at: 0.09 + i * 0.05 });
    });
  },

  explosion() {
    if (!this.canPlay('boom', 70)) return;
    this.tone({ type: 'sine', f0: 150, f1: 26, dur: 0.75, vol: 0.62 });
    this.tone({ type: 'sawtooth', f0: 90, f1: 28, dur: 0.42, vol: 0.2 });
    this.noise({ f0: 3200, f1: 150, dur: 0.72, vol: 0.5 });
    this.noise({ f0: 7000, f1: 1400, dur: 0.13, vol: 0.17, filter: 'highpass' });
  },

  thud() {
    if (!this.canPlay('thud', 90)) return;
    this.tone({ type: 'sine', f0: 170, f1: 70, dur: 0.1, vol: 0.14 });
  },

  hop() {
    if (!this.canPlay('hop', 80)) return;
    this.tone({ type: 'sine', f0: 320, f1: 720, dur: 0.12, vol: 0.09 });
  },

  ui() {
    if (!this.canPlay('ui', 40)) return;
    this.tone({ type: 'sine', f0: 620, f1: 900, dur: 0.07, vol: 0.12 });
  },

  star(i) {
    if (!this.canPlay('star' + i)) return;
    const f = [784, 988, 1319][i] || 784;
    this.tone({ type: 'triangle', f0: f, dur: 0.34, vol: 0.2 });
    this.tone({ type: 'sine', f0: f * 2, dur: 0.24, vol: 0.09, at: 0.02 });
    this.noise({ f0: 7000, dur: 0.09, vol: 0.05, filter: 'highpass' });
  },

  coin() {
    if (!this.canPlay('coin', 40)) return;
    this.tone({ type: 'square', f0: 988, dur: 0.06, vol: 0.05 });
    this.tone({ type: 'square', f0: 1319, dur: 0.15, vol: 0.06, at: 0.055 });
  },

  win() {
    if (!this.canPlay('win')) return;
    Music.duck(0.35, 2.6);
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      this.tone({ type: 'triangle', f0: f, dur: 0.32, vol: 0.19, at: i * 0.1 });
      this.tone({ type: 'sine', f0: f / 2, dur: 0.24, vol: 0.09, at: i * 0.1 });
    });
  },

  lose() {
    if (!this.canPlay('lose')) return;
    Music.duck(0.35, 2.2);
    [392, 349, 311, 233].forEach((f, i) => {
      this.tone({ type: 'triangle', f0: f, f1: f * 0.96, dur: 0.36, vol: 0.17, at: i * 0.2 });
    });
  }
};

// =====================================================
// МУЗЫКА: у каждого биома своя тональность, темп и рисунок
// =====================================================
const Music = {
  level: 0.5,
  track: 0,
  step: 0,
  nextTime: 0,
  duckTimer: null,

  // bpm, основная частота, аккорды (полутоны от тоники), минор ли, арпеджио (индексы нот аккорда, -1 пауза)
  TRACKS: [
    { bpm: 118, root: 261.63, chords: [0, 7, 9, 5], minor: [0, 0, 1, 0], arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, -1, 3, 2, 1, -1, 2, 1], wave: 'triangle' },
    { bpm: 104, root: 293.66, chords: [0, 9, 5, 7], minor: [0, 1, 0, 0], arp: [0, 2, 1, 3, 0, 2, 1, 3, 2, -1, 1, -1, 3, 2, 1, 0], wave: 'sine' },
    { bpm: 112, root: 220.0, chords: [0, 8, 3, 10], minor: [1, 0, 0, 0], arp: [0, -1, 2, 1, -1, 3, 2, -1, 0, 1, -1, 2, 3, -1, 2, 1], wave: 'triangle' },
    { bpm: 96, root: 329.63, chords: [0, 5, 9, 7], minor: [0, 0, 1, 0], arp: [3, -1, 2, -1, 1, -1, 2, -1, 3, 2, 1, 0, 1, -1, 2, -1], wave: 'sine' },
    { bpm: 126, root: 196.0, chords: [0, 3, 8, 10], minor: [1, 0, 0, 0], arp: [0, 2, 3, 2, 1, 3, 2, 3, 0, 2, 3, 2, 1, 3, 2, 1], wave: 'square' },
    { bpm: 136, root: 164.81, chords: [0, 0, 8, 7], minor: [1, 1, 0, 0], arp: [0, 1, 0, 2, 0, 3, 0, 2, 0, 1, 0, 2, 3, 2, 1, 2], wave: 'sawtooth' }
  ],

  setTrack(i) {
    if (i !== this.track) {
      this.track = i;
      this.step = 0;
    }
  },

  resync() {
    this.nextTime = 0;
  },

  duck(amount, seconds) {
    if (!Sound.ctx || !Sound.musicOn) return;
    const now = Sound.ctx.currentTime;
    const g = Sound.musicBus.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.level * amount, now, 0.04);
    g.setTargetAtTime(this.level, now + seconds, 0.4);
  },

  // Вызывается из игрового цикла — на паузе цикл стоит, и музыка не планируется
  tick() {
    if (!Sound.ready() || !Sound.musicOn) return;
    const now = Sound.ctx.currentTime;
    const tr = this.TRACKS[this.track];
    const stepDur = 60 / tr.bpm / 4;
    if (this.nextTime < now) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.3) {
      this.playStep(tr, this.step, this.nextTime - now, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 256;
    }
  },

  playStep(tr, step, at, stepDur) {
    const bus = Sound.musicBus;
    const bar = Math.floor(step / 16) % tr.chords.length;
    const s = step % 16;
    const semis = tr.chords[bar];
    const third = tr.minor[bar] ? 3 : 4;
    const notes = [0, third, 7, 12].map((n) => tr.root * Math.pow(2, (semis + n) / 12));

    // Бас на сильные доли
    if (s % 8 === 0 || s === 11) {
      Sound.tone({ type: 'triangle', f0: notes[0] / 2, dur: stepDur * 3.2, vol: 0.26, at }, bus);
    }
    // Арпеджио
    const idx = tr.arp[s];
    if (idx >= 0) {
      const vol = tr.wave === 'sine' ? 0.15 : tr.wave === 'triangle' ? 0.13 : 0.035;
      Sound.tone({ type: tr.wave, f0: notes[idx] * 2, dur: stepDur * 1.9, vol, at }, bus);
    }
    // Мелодия: простая запоминающаяся фраза каждые два такта
    const phrase = [0, -1, -1, 2, -1, -1, 3, -1, 2, -1, 1, -1, 0, -1, -1, -1];
    if (Math.floor(step / 16) % 2 === 1 && phrase[s] >= 0) {
      Sound.tone({ type: 'sine', f0: notes[phrase[s]] * 4, dur: stepDur * 2.6, vol: 0.06, at }, bus);
    }
    // Лёгкая перкуссия
    if (s % 4 === 2) {
      Sound.noise({ f0: 7500, dur: 0.035, vol: 0.022, filter: 'highpass', at }, bus);
    }
    if (s % 8 === 4) {
      Sound.noise({ f0: 2100, f1: 900, dur: 0.075, vol: 0.05, filter: 'bandpass', at }, bus);
    }
    if (s === 0 || s === 8) {
      Sound.tone({ type: 'sine', f0: 118, f1: 50, dur: 0.1, vol: 0.2, at }, bus);
    }
  }
};
