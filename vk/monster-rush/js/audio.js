// Весь звук синтезируется на месте: файлов нет, игра работает и без звука
export class Audio {
  constructor() {
    this.muted = false;
    this.active = false;
    this.musicEnabled = true;
    this.beat = 0;
    this.timer = null;
    this.last = {};
    this.beamOn = false;
  }

  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.42;
        // Ограничитель: десяток взрывов разом не должен хрипеть
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -14;
        limiter.ratio.value = 12;
        this.master.connect(limiter);
        limiter.connect(this.ctx.destination);
        const size = this.ctx.sampleRate * 1.2;
        this.noiseBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
      }
      this.ctx.resume().catch(() => {});
      this.syncMusic();
    } catch { /* Игра работает и без звука */ }
  }

  suspend() {
    this.setActive(false);
    this.ctx?.suspend().catch(() => {});
  }

  setActive(active) {
    this.active = active;
    this.syncMusic();
    if (!active) this.beam(false);
  }

  syncMusic() {
    const play = this.ctx && this.active && this.musicEnabled;
    if (play && !this.timer) this.timer = setInterval(() => this.music(), 170);
    if (!play && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.muted) this.beam(false);
  }

  ready(music = false) {
    return this.ctx && (music ? this.musicEnabled : !this.muted) && this.ctx.state === 'running';
  }

  tone(freq, duration = 0.1, type = 'sine', volume = 0.15, end = freq, delay = 0, music = false) {
    if (!this.ready(music)) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + duration);
  }

  noise(duration = 0.3, volume = 0.2, from = 4000, to = 200, delay = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t, Math.random() * 0.5, duration);
  }

  // Не чаще заданного: пулемёт не должен забивать всё остальное
  every(name, seconds) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < seconds) return false;
    this.last[name] = now;
    return true;
  }

  shot(weapon) {
    if (weapon === 'blaster') this.tone(620, 0.075, 'triangle', 0.06, 180);
    else if (weapon === 'spread') {
      this.noise(0.16, 0.22, 3000, 300);
      this.tone(170, 0.14, 'sawtooth', 0.09, 60);
    } else if (weapon === 'minigun') {
      if (this.every('minigun', 0.07)) {
        this.tone(300, 0.04, 'square', 0.035, 130);
        this.noise(0.04, 0.07, 5000, 1500);
      }
    } else if (weapon === 'rocket') {
      this.noise(0.42, 0.14, 1400, 5000);
      this.tone(110, 0.3, 'sawtooth', 0.08, 320);
    } else if (weapon === 'plasma') {
      this.tone(980, 0.22, 'sine', 0.12, 150);
      this.tone(490, 0.16, 'triangle', 0.06, 110);
    } else if (weapon === 'tesla') {
      this.tone(1500, 0.09, 'sawtooth', 0.05, 500);
      this.noise(0.08, 0.08, 7000, 2500);
    }
  }

  fanfare(notes, gap = 0.08, volume = 0.13) {
    notes.forEach((n, i) => {
      this.tone(n, 0.2, 'triangle', volume, n, i * gap);
      this.tone(n * 2, 0.13, 'sine', volume * 0.4, n * 2, i * gap);
    });
  }

  fx(e) {
    const type = e.type;
    if (type === 'shot') this.shot(e.weapon);
    else if (type === 'hit') {
      if (e.enemyType === 'cage' && this.every('clank', 0.07)) {
        this.tone(1250 + Math.random() * 500, 0.055, 'square', 0.035, 700);
        this.tone(2600, 0.04, 'sine', 0.03, 1900);
      } else if (e.enemyType === 'column' && this.every('chip', 0.07)) this.tone(380, 0.05, 'triangle', 0.06, 180);
    } else if (type === 'explode') {
      this.noise(e.enemyType === 'barrel' ? 0.5 : 0.24, e.enemyType === 'barrel' ? 0.3 : 0.16, 2200, 120);
      this.tone(95, 0.25, 'sawtooth', 0.14, 28);
    } else if (type === 'blast') {
      this.noise(0.5, 0.26, 2600, 100);
      this.tone(80, 0.34, 'sawtooth', 0.14, 24);
    } else if (type === 'cageCrack') {
      this.noise(0.14, 0.16, 6000, 1200);
      this.tone(760, 0.2, 'square', 0.05, 240);
    } else if (type === 'cageBreak') {
      this.noise(0.55, 0.3, 7000, 150);
      for (let i = 0; i < 5; i++) this.tone(1500 + Math.random() * 1600, 0.16, 'square', 0.03, 500, i * 0.05);
      this.fanfare([523, 659, 784], 0.07, 0.1);
    } else if (type === 'cageSmash') {
      this.noise(0.35, 0.26, 3000, 120);
      this.tone(120, 0.26, 'square', 0.1, 40);
    } else if (type === 'weapon') this.fanfare([523, 659, 784, 1047, 1319], 0.065, 0.14);
    else if (type === 'weaponOut') this.tone(520, 0.24, 'triangle', 0.1, 150);
    else if (type === 'hurt') {
      this.tone(100, 0.25, 'square', 0.11, 35);
      this.noise(0.12, 0.12, 1500, 300);
    } else if (type === 'pickup' && e.pickupType !== 'weapon') {
      this.tone(660, 0.16, 'sine', 0.18, 1100);
    } else if (type === 'nova') {
      this.tone(60, 0.8, 'sawtooth', 0.26, 700);
      this.tone(900, 0.8, 'sine', 0.13, 50);
      this.noise(0.7, 0.2, 800, 6000);
    } else if (type === 'boss') this.tone(90, 1.5, 'sawtooth', 0.18, 45);
    else if (type === 'bossCharge' || type === 'spitCharge') this.tone(type === 'bossCharge' ? 280 : 430, 0.32, 'triangle', 0.07, 620);
    else if (type === 'bossShot') this.tone(240, 0.3, 'sawtooth', 0.08, 90);
    else if (type === 'bossDown') {
      for (let i = 0; i < 7; i++) this.noise(0.3, 0.2, 2600, 150, i * 0.14);
      this.noise(1.1, 0.42, 3500, 60, 1);
      this.tone(70, 1.2, 'sawtooth', 0.2, 22, 1);
    } else if (type === 'columnBreak') {
      this.noise(0.2, 0.18, 2600, 240);
      this.tone(880 + e.row * 120, 0.14, 'sine', 0.13, 1500);
    } else if (type === 'chest') {
      this.fanfare([392, 523, 659, 784, 1047, 1319, 1568], 0.075, 0.15);
      this.noise(0.5, 0.1, 9000, 3000);
    } else if (type === 'clear') this.fanfare([659, 784, 1047], 0.13, 0.13);
    else if (type === 'end' && !e.won) this.tone(330, 0.8, 'triangle', 0.14, 90);
  }

  // Лазер гудит, пока луч включён
  beam(on) {
    if (!this.ctx) return;
    const want = on && !this.muted;
    if (want === this.beamOn) return;
    this.beamOn = want;
    const t = this.ctx.currentTime;
    if (want) {
      this.hum = this.ctx.createGain();
      this.hum.gain.setValueAtTime(0, t);
      this.hum.gain.linearRampToValueAtTime(0.06, t + 0.08);
      this.hum.connect(this.master);
      this.humOsc = [this.ctx.createOscillator(), this.ctx.createOscillator()];
      this.humOsc[0].type = 'sawtooth';
      this.humOsc[0].frequency.value = 196;
      this.humOsc[1].type = 'sine';
      this.humOsc[1].frequency.value = 588;
      for (const o of this.humOsc) {
        o.connect(this.hum);
        o.start();
      }
    } else if (this.hum) {
      const hum = this.hum;
      const oscs = this.humOsc;
      hum.gain.setValueAtTime(hum.gain.value, t);
      hum.gain.linearRampToValueAtTime(0, t + 0.08);
      for (const o of oscs) o.stop(t + 0.1);
      this.hum = null;
    }
  }

  music() {
    if (!this.active || !this.musicEnabled) return;
    const bass = [73.42, 73.42, 87.31, 65.41][Math.floor(this.beat / 16) % 4];
    if (this.beat % 4 === 0) this.tone(130, 0.15, 'sine', 0.2, 35, 0, true);
    if (this.beat % 2 === 0) this.tone(bass, 0.25, 'triangle', 0.12, bass, 0, true);
    const melody = [4, 6, 8, 6, 3, 4, 6, 3];
    const note = bass * melody[this.beat % 8];
    this.tone(note, 0.13, 'sine', 0.035, note, 0, true);
    this.beat++;
  }

}
