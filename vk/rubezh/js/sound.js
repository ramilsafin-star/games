// Звук «Рубежа»: всё синтезируется WebAudio, файлов нет, голосов нет.
// Выстрелы у каждого ствола свои, звуки роботов, взрывы, ЭМИ, шаги по поверхностям, интерфейс,
// фоновые петли (дождь, ветер, гул) и простая музыка-синтезатор (выключается в настройках).
const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
let ctx = null, master = null, sfx = null, musicBus = null, amb = null, verb = null, verbSend = null;
let on = true, musicOn = true, volume = 0.8;
let noiseBuf = null;
const L = { x: 0, z: 0, yaw: 0 };

function init() {
  if (ctx || !AC) return ctx;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master = ctx.createGain();
  master.gain.value = on ? volume : 0;
  master.connect(comp).connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.32 : 0;
  musicBus.connect(master);
  amb = ctx.createGain();
  amb.gain.value = 0.5;
  amb.connect(master);
  // эхо помещений
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  verb.buffer = ir;
  verbSend = ctx.createGain();
  verbSend.gain.value = 0.18;
  verbSend.connect(verb).connect(master);
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
const live = () => (ctx && on && ctx.state === "running" ? ctx : null);

// место звука: громкость и панорама относительно слушателя
function place(x, z, near = 6) {
  if (x === undefined) return { g: 1, pan: 0, far: 0 };
  const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
  const ang = Math.atan2(-dx, -dz) - L.yaw;
  return { g: 1 / (1 + Math.max(0, d - 1) / near), pan: -Math.sin(ang) * Math.min(1, d / 3) * 0.85, far: Math.min(1, d / 40) };
}
function out(p, wet = 0.15) {
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const g = ctx.createGain();
  g.gain.value = p.g;
  if (pan) {
    pan.pan.value = p.pan;
    g.connect(pan).connect(sfx);
  } else g.connect(sfx);
  if (wet) {
    const w = ctx.createGain();
    w.gain.value = wet * (0.6 + p.far);
    g.connect(w).connect(verbSend);
  }
  return g;
}
function noise(dst, d, v, type, f0, f1, q = 1, delay = 0, attack = 0.002) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f).connect(g).connect(dst);
  s.start(t, Math.random());
  s.stop(t + d + 0.05);
}
function tone(dst, f0, f1, d, v, type = "sine", delay = 0, attack = 0.004) {
  const a = live();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(dst);
  o.start(t);
  o.stop(t + d + 0.05);
}

// Звучание стволов: щелчок, хлопок, низ и хвост
const GUNS = {
  iskra: { crack: 2600, body: 900, low: 140, d: 0.14, v: 0.5, tail: 0.25 },
  grom: { crack: 1800, body: 600, low: 90, d: 0.3, v: 0.75, tail: 0.5 },
  strizh: { crack: 3200, body: 1200, low: 160, d: 0.09, v: 0.38, tail: 0.18 },
  taran: { crack: 1200, body: 420, low: 70, d: 0.42, v: 0.85, tail: 0.6 },
  shkval: { crack: 2200, body: 800, low: 110, d: 0.16, v: 0.55, tail: 0.32 },
  sokol: { crack: 2000, body: 700, low: 95, d: 0.24, v: 0.7, tail: 0.5 },
  igla: { crack: 3000, body: 650, low: 80, d: 0.45, v: 0.9, tail: 0.9 },
  bur: { crack: 1900, body: 650, low: 85, d: 0.18, v: 0.6, tail: 0.36 },
};
const ROBOT_GUN = { zhuk: [3400, 0.08, 0.22], strelok: [2400, 0.11, 0.3], bastion: [1300, 0.25, 0.45], molot: [2000, 0.08, 0.32], nakovalnya: [1500, 0.1, 0.42], mate: [2300, 0.12, 0.28] };

export const Sound = {
  get ctx() {
    return ctx;
  },
  unlock() {
    if (!on) return;
    init();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  hush() {
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  },
  set(v) {
    on = !!v;
    if (master) master.gain.value = on ? volume : 0;
    if (!on) this.hush();
  },
  volume(v) {
    volume = v;
    if (master) master.gain.value = on ? volume : 0;
  },
  setMusic(v) {
    musicOn = !!v;
    if (musicBus) musicBus.gain.value = musicOn ? 0.32 : 0;
  },
  listener(x, z, yaw) {
    L.x = x;
    L.z = z;
    L.yaw = yaw;
  },
  indoor(k) {
    if (verbSend) verbSend.gain.value = k ? 0.32 : 0.14;
  },
  // ---------- оружие игрока ----------
  shot(id) {
    if (!live()) return;
    const G = GUNS[id] || GUNS.iskra;
    const o = out({ g: 1, pan: 0, far: 0.3 }, G.tail * 0.6);
    noise(o, 0.03, G.v * 0.9, "highpass", G.crack, G.crack * 0.7, 0.7);
    noise(o, G.d, G.v, "bandpass", G.body * 1.6, G.body * 0.5, 0.9, 0.002);
    tone(o, G.low * 1.8, G.low * 0.6, G.d * 0.9, G.v * 0.7, "sine");
    noise(o, G.tail, G.v * 0.18, "lowpass", 1800, 200, 0.5, 0.02, 0.01);
    if (id === "igla") tone(o, 5200, 1800, 0.05, 0.2, "square");
    if (id === "taran") noise(o, 0.06, 0.25, "highpass", 4000, 3000, 1, 0.42);
  },
  dry() {
    const a = live();
    if (!a) return;
    tone(sfx, 1800, 1500, 0.03, 0.12, "square");
  },
  reload(id) {
    if (!live()) return;
    const big = id === "bur";
    noise(sfx, 0.05, 0.22, "bandpass", 2800, 2000, 3, 0.05);
    tone(sfx, 420, 320, 0.06, 0.14, "triangle", 0.06);
    noise(sfx, 0.07, 0.3, "bandpass", 1900, 1500, 4, big ? 1.4 : 0.55);
    noise(sfx, 0.05, 0.28, "bandpass", 3200, 2600, 4, big ? 2.2 : 0.95);
  },
  reloaded() {
    if (!live()) return;
    noise(sfx, 0.04, 0.3, "bandpass", 2400, 2000, 5);
    tone(sfx, 900, 700, 0.04, 0.12, "square", 0.05);
  },
  shell() {
    if (!live()) return;
    noise(sfx, 0.05, 0.25, "bandpass", 1500, 1200, 4);
  },
  equip() {
    if (!live()) return;
    noise(sfx, 0.12, 0.15, "bandpass", 900, 2400, 2);
    tone(sfx, 700, 1000, 0.05, 0.08, "triangle", 0.08);
  },
  swing(hit) {
    if (!live()) return;
    noise(sfx, 0.14, 0.2, "bandpass", 600, 2600, 1.5);
    tone(sfx, 220, 880, 0.1, 0.08, "sawtooth");
    if (hit) {
      tone(sfx, 160, 60, 0.15, 0.4, "square", 0.05);
      noise(sfx, 0.12, 0.35, "highpass", 3000, 1500, 1, 0.05);
    }
  },
  pin() {
    if (!live()) return;
    tone(sfx, 2400, 2200, 0.04, 0.15, "square");
    noise(sfx, 0.05, 0.2, "bandpass", 3000, 2000, 5, 0.07);
  },
  throw() {
    if (!live()) return;
    noise(sfx, 0.18, 0.2, "bandpass", 500, 1800, 1);
  },
  bounce(x, z) {
    if (!live()) return;
    const p = place(x, z);
    noise(out(p, 0.1), 0.06, 0.3, "bandpass", 2600, 1800, 6);
  },
  // ---------- попадания ----------
  hit(core, kill) {
    if (!live()) return;
    tone(sfx, core ? 1800 : 1200, core ? 2200 : 1000, 0.05, core ? 0.22 : 0.14, "triangle");
    if (core) tone(sfx, 3600, 3600, 0.08, 0.08, "sine", 0.02);
    if (kill) {
      tone(sfx, 660, 990, 0.08, 0.16, "square", 0.03);
      tone(sfx, 990, 1320, 0.1, 0.12, "square", 0.1);
    }
  },
  shieldHit(x, z) {
    if (!live()) return;
    const p = place(x, z);
    tone(out(p, 0.1), 600, 400, 0.12, 0.12 * p.g, "sawtooth");
  },
  shieldBreak() {
    if (!live()) return;
    noise(sfx, 0.5, 0.4, "bandpass", 3000, 400, 2);
    tone(sfx, 900, 120, 0.4, 0.25, "sawtooth");
  },
  glass(x, z) {
    if (!live()) return;
    const p = place(x, z, 8);
    const o = out(p, 0.25);
    for (let i = 0; i < 6; i++) tone(o, 3000 + Math.random() * 4000, 2000 + Math.random() * 2000, 0.15 + Math.random() * 0.25, 0.08, "triangle", i * 0.03);
    noise(o, 0.35, 0.35, "highpass", 5000, 2500, 1);
  },
  // ---------- роботы ----------
  enemyShot(type, x, z) {
    if (!live()) return;
    const p = place(x, z, 9);
    if (p.g < 0.04) return;
    const R = ROBOT_GUN[type] || ROBOT_GUN.strelok;
    const o = out(p, 0.35);
    const laser = type !== "mate";
    noise(o, R[1], 0.55 * p.g, "bandpass", R[0], R[0] * 0.5, 1.2);
    if (laser) tone(o, R[0] * 0.5, R[0] * 0.18, R[1] * 1.4, 0.18 * p.g, "sawtooth");
    else tone(o, 140, 70, 0.12, 0.3 * p.g, "sine");
    noise(o, R[2], 0.12 * p.g, "lowpass", 1400, 200, 0.5, 0.02, 0.01);
  },
  charge(x, z) {
    if (!live()) return;
    const p = place(x, z, 14);
    const o = out(p, 0.2);
    tone(o, 300, 2400, 1.3, 0.14 * Math.max(0.4, p.g), "sawtooth");
    tone(o, 302, 2420, 1.3, 0.1 * Math.max(0.4, p.g), "square");
  },
  snipe(x, z) {
    if (!live()) return;
    const p = place(x, z, 20);
    const o = out(p, 0.5);
    noise(o, 0.5, 0.7 * Math.max(0.5, p.g), "bandpass", 4000, 300, 1);
    tone(o, 1800, 90, 0.5, 0.35, "sawtooth");
  },
  beep(x, z) {
    if (!live()) return;
    const p = place(x, z, 7);
    for (let i = 0; i < 4; i++) tone(out(p, 0), 1800, 1800, 0.06, 0.25 * p.g, "square", i * 0.15);
  },
  spinup(x, z) {
    if (!live()) return;
    const p = place(x, z, 14);
    tone(out(p, 0.2), 80, 400, 0.45, 0.2 * p.g, "sawtooth");
  },
  rocket(x, z) {
    if (!live()) return;
    const p = place(x, z, 12);
    noise(out(p, 0.3), 0.8, 0.5 * p.g, "bandpass", 600, 2400, 0.8);
  },
  alert(x, z) {
    if (!live()) return;
    const p = place(x, z, 8);
    tone(out(p, 0.2), 900, 1400, 0.12, 0.16 * p.g, "square");
  },
  spotted(x, z) {
    if (!live()) return;
    const p = place(x, z, 10);
    const o = out(p, 0.2);
    tone(o, 700, 700, 0.08, 0.2 * Math.max(0.5, p.g), "square");
    tone(o, 1100, 1100, 0.12, 0.2 * Math.max(0.5, p.g), "square", 0.1);
  },
  servo(x, z) {
    if (!live()) return;
    const p = place(x, z, 5);
    if (p.g < 0.1) return;
    tone(out(p, 0.1), 180 + Math.random() * 60, 260, 0.12, 0.05 * p.g, "sawtooth");
  },
  stomp(x, z, big) {
    if (!live()) return;
    const p = place(x, z, big ? 18 : 9);
    const o = out(p, 0.3);
    tone(o, big ? 60 : 90, 35, big ? 0.35 : 0.18, (big ? 0.5 : 0.25) * p.g, "sine");
    noise(o, 0.1, 0.2 * p.g, "lowpass", 800, 200, 0.7);
  },
  death(x, z, big) {
    if (!live()) return;
    const p = place(x, z, 10);
    const o = out(p, 0.3);
    // разряд, хлопок, звон деталей
    tone(o, 1600, 60, 0.4, 0.28 * Math.max(0.4, p.g), "sawtooth");
    noise(o, 0.3, 0.5 * p.g, "bandpass", 2500, 300, 1, 0.02);
    for (let i = 0; i < (big ? 9 : 5); i++) tone(o, 1500 + Math.random() * 2500, 900, 0.12, 0.06 * p.g, "triangle", 0.12 + Math.random() * 0.5);
    tone(o, big ? 70 : 110, 40, 0.3, 0.4 * p.g, "sine", 0.03);
  },
  explosion(x, z, big = 1) {
    if (!live()) return;
    const p = place(x, z, 22);
    const o = out(p, 0.5);
    const g = Math.max(0.35, p.g);
    noise(o, 0.06, 0.9 * g, "highpass", 3000, 1500, 0.7);
    noise(o, 1.4 * big, 1.0 * g, "lowpass", 2400, 60, 0.7, 0.01, 0.005);
    tone(o, 90, 30, 0.9 * big, 0.9 * g, "sine");
    noise(o, 1.2, 0.25 * g, "bandpass", 600, 200, 0.5, 0.3, 0.1);
  },
  emp(x, z) {
    if (!live()) return;
    const p = place(x, z, 18);
    const o = out(p, 0.4);
    tone(o, 1200, 80, 0.8, 0.45, "sawtooth");
    tone(o, 80, 1600, 0.5, 0.2, "square", 0.05);
    for (let i = 0; i < 8; i++) noise(o, 0.05, 0.25, "highpass", 4000, 3000, 2, 0.1 + i * 0.07);
  },
  smoke(x, z) {
    if (!live()) return;
    const p = place(x, z, 12);
    noise(out(p, 0.2), 2.5, 0.3 * p.g, "bandpass", 3000, 1200, 0.6, 0, 0.1);
  },
  // ---------- игрок ----------
  step(surface, loud) {
    if (!live()) return;
    const v = loud ? 0.28 : 0.12;
    if (surface === "metal") {
      tone(sfx, 220, 160, 0.08, v * 0.8, "triangle");
      noise(sfx, 0.06, v, "bandpass", 2400, 1800, 3);
    } else if (surface === "water") {
      noise(sfx, 0.25, v * 1.3, "bandpass", 1200, 500, 1);
      noise(sfx, 0.15, v * 0.6, "highpass", 4000, 2500, 1, 0.05);
    } else if (surface === "sand") noise(sfx, 0.12, v, "bandpass", 1800, 900, 0.8);
    else if (surface === "soft") noise(sfx, 0.08, v * 0.7, "lowpass", 600, 200, 0.7);
    else {
      noise(sfx, 0.07, v, "bandpass", 900, 400, 1.2);
      tone(sfx, 90, 60, 0.06, v * 0.6, "sine");
    }
  },
  jump() {
    if (!live()) return;
    noise(sfx, 0.1, 0.12, "bandpass", 700, 1200, 1);
  },
  land(v) {
    if (!live()) return;
    tone(sfx, 100, 50, 0.15, Math.min(0.5, v * 0.05), "sine");
    noise(sfx, 0.1, 0.25, "lowpass", 900, 200, 0.7);
  },
  hurt(blast) {
    if (!live()) return;
    tone(sfx, blast ? 120 : 260, 80, 0.18, 0.35, "sine");
    noise(sfx, 0.12, 0.3, "bandpass", 1600, 500, 1);
  },
  heart() {
    if (!live()) return;
    tone(sfx, 60, 45, 0.12, 0.35, "sine");
    tone(sfx, 55, 40, 0.12, 0.25, "sine", 0.18);
  },
  use() {
    if (!live()) return;
    tone(sfx, 600, 900, 0.05, 0.08, "triangle");
  },
  done() {
    if (!live()) return;
    [660, 880, 1320].forEach((f, i) => tone(sfx, f, f, 0.12, 0.18, "square", i * 0.08));
  },
  kit() {
    if (!live()) return;
    tone(sfx, 400, 1600, 0.6, 0.2, "sine");
    tone(sfx, 800, 2400, 0.6, 0.08, "triangle", 0.05);
  },
  // ---------- задание ----------
  alarm() {
    if (!live()) return;
    for (let i = 0; i < 4; i++) {
      tone(sfx, 600, 1100, 0.35, 0.28, "sawtooth", i * 0.7);
      tone(sfx, 1100, 600, 0.35, 0.28, "sawtooth", i * 0.7 + 0.35);
    }
  },
  radio() {
    if (!live()) return;
    noise(sfx, 0.08, 0.18, "bandpass", 2500, 2500, 2);
    tone(sfx, 1400, 1400, 0.05, 0.08, "square", 0.08);
  },
  roundStart() {
    if (!live()) return;
    tone(sfx, 220, 220, 0.5, 0.25, "sawtooth");
    tone(sfx, 330, 330, 0.5, 0.18, "sawtooth", 0.02);
    tone(sfx, 440, 440, 0.7, 0.2, "square", 0.45);
  },
  win() {
    if (!live()) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      tone(sfx, f, f, 0.4, 0.2, "square", i * 0.13);
      tone(sfx, f / 2, f / 2, 0.4, 0.16, "sawtooth", i * 0.13);
    });
  },
  lose() {
    if (!live()) return;
    [392, 330, 262, 196].forEach((f, i) => tone(sfx, f, f * 0.98, 0.45, 0.18, "sawtooth", i * 0.2));
  },
  planted() {
    if (!live()) return;
    for (let i = 0; i < 3; i++) tone(sfx, 1500, 1500, 0.08, 0.22, "square", i * 0.18);
  },
  tick(fast) {
    if (!live()) return;
    tone(sfx, fast ? 2000 : 1500, fast ? 2000 : 1500, 0.04, 0.12, "square");
  },
  bossRoar() {
    if (!live()) return;
    tone(sfx, 70, 40, 1.4, 0.6, "sawtooth");
    tone(sfx, 105, 52, 1.4, 0.3, "square", 0.05);
    noise(sfx, 1.2, 0.3, "lowpass", 600, 100, 0.6);
  },
  vent() {
    if (!live()) return;
    noise(sfx, 0.9, 0.35, "highpass", 2000, 6000, 0.6);
    tone(sfx, 200, 90, 0.5, 0.15, "sawtooth");
  },
  // ---------- интерфейс ----------
  click() {
    if (!live()) return;
    tone(sfx, 900, 700, 0.04, 0.1, "triangle");
  },
  buy() {
    if (!live()) return;
    tone(sfx, 880, 880, 0.08, 0.15, "square");
    tone(sfx, 1320, 1320, 0.14, 0.15, "square", 0.08);
    noise(sfx, 0.08, 0.15, "highpass", 6000, 5000, 1, 0.05);
  },
  error() {
    if (!live()) return;
    tone(sfx, 220, 180, 0.15, 0.15, "square");
  },
  credits() {
    if (!live()) return;
    tone(sfx, 1400 + Math.random() * 300, 2000, 0.06, 0.08, "triangle");
  },
  star(i) {
    if (!live()) return;
    tone(sfx, 880 * (1 + i * 0.25), 1320 * (1 + i * 0.25), 0.25, 0.22, "triangle");
    tone(sfx, 1760 * (1 + i * 0.25), 1760 * (1 + i * 0.25), 0.3, 0.08, "sine", 0.05);
  },
  // ---------- фон ----------
  ambient(kind) {
    init();
    if (!ctx) return;
    if (this._amb) {
      try {
        this._amb.stop();
      } catch {}
      this._amb = null;
    }
    if (!kind) return;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    s.loop = true;
    const set = { rain: ["bandpass", 2600, 0.6, 0.16], drizzle: ["bandpass", 3000, 0.7, 0.07], wind: ["lowpass", 500, 0.8, 0.12], hum: ["lowpass", 180, 1, 0.1], fog: ["lowpass", 700, 0.8, 0.07] }[kind] || ["lowpass", 300, 1, 0.06];
    f.type = set[0];
    f.frequency.value = set[1];
    f.Q.value = set[2];
    g.gain.value = set[3];
    s.connect(f).connect(g).connect(amb);
    s.start();
    this._amb = s;
  },
  // ---------- музыка: бас, подушка и хэт, темп 100 ----------
  music(mood) {
    init();
    if (!ctx) return;
    this._mood = mood;
    if (this._musicTimer) return;
    const step = 60 / 100 / 2;
    let n = 0, nextT = 0;
    const tick = () => {
      if (!ctx) return;
      const a = ctx;
      if (a.state !== "running" || !musicOn || !on || !this._mood) {
        nextT = 0;
        return;
      }
      if (!nextT) nextT = a.currentTime + 0.05;
      while (nextT < a.currentTime + 0.25) {
        const bar = Math.floor(n / 16) % 4, beat = n % 16;
        const roots = this._mood === "fight" ? [55, 55, 65.4, 49] : [55, 43.65, 49, 41.2];
        const r = roots[bar];
        const at = nextT - a.currentTime;
        if (beat % 2 === 0) tone(musicBus, r * (beat % 8 === 6 ? 2 : 1), r, step * 1.6, this._mood === "fight" ? 0.3 : 0.22, "sawtooth", at, 0.01);
        if (beat === 0) {
          for (const k of [2, 3, 4.5]) tone(musicBus, r * k * 2, r * k * 2, step * 15, 0.05, "triangle", at, 0.4);
        }
        if (this._mood === "fight") {
          if (beat % 4 === 0) tone(musicBus, 60, 40, 0.16, 0.45, "sine", at);
          if (beat % 2 === 1) noise(musicBus, 0.04, 0.08, "highpass", 8000, 7000, 1, at);
          if (beat % 8 === 4) noise(musicBus, 0.12, 0.2, "bandpass", 1800, 900, 1, at);
        } else if (beat % 4 === 2) noise(musicBus, 0.04, 0.04, "highpass", 8000, 7000, 1, at);
        nextT += step;
        n++;
      }
    };
    this._musicTimer = setInterval(tick, 90);
  },
};
