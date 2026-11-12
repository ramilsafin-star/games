// Тихие звуки «Лунного оракула», синтез WebAudio без файлов: колокольчик при открытии карты,
// шелест при тасовании, мягкий щелчок кнопок. Контекст создаётся по первому нажатию
// (браузеры требуют жест), при сворачивании и во время рекламы — suspend().
export const Sound = {
  ctx: null,
  on: true,
  master: null,
  set(on) {
    this.on = on;
    if (!on) this.hush();
  },
  unlock() {
    if (!this.on) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch {
      // без звука приложение работает так же
    }
  },
  hush() {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend();
  },
  ready() {
    return this.on && this.ctx && this.ctx.state === "running";
  },
  tone(freq, start, dur, gain, type = "sine") {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.05);
  },
  // Колокольчик: основной тон и два обертона с долгим затуханием
  chime(pitch = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const f = 784 * pitch;
    this.tone(f, t, 1.6, 0.09);
    this.tone(f * 2.01, t, 1.1, 0.035);
    this.tone(f * 3.02, t + 0.01, 0.7, 0.018);
  },
  // Шелест карт: короткие щелчки отфильтрованного шума
  riffle(count = 14, gap = 0.055) {
    if (!this.ready()) return;
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 0.04);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const t = c.currentTime;
    for (let i = 0; i < count; i++) {
      const s = c.createBufferSource();
      s.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 2400 + Math.random() * 1600;
      const g = c.createGain();
      g.gain.value = 0.16;
      s.connect(f).connect(g).connect(this.master);
      s.start(t + i * gap + Math.random() * 0.015);
    }
  },
  tap() {
    if (!this.ready()) return;
    this.tone(1320, this.ctx.currentTime, 0.12, 0.025, "triangle");
  },
  // Уровень сигнала для проверок (есть ли звук на самом деле)
  probe() {
    return this.ctx ? this.ctx.state : "нет";
  },
};
window.Sound = Sound;
