// Трасса «Шароката»: путь строится «черепашкой» из кусков (холм, поворот, петля, прыжок…),
// каждые полметра — кадр (точка, вперёд, вверх, вправо). По кадрам строятся меш и физика шара.
import * as T from "../vendor/three/three.module.min.js?v=8580e2bc";

export const DS = 0.5;
export const HALF = 2.2; // половина ширины дорожки
const pie = Math.PI;
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);

// Какие куски бывают и с какого уровня они появляются
const unlock = {
  hill: 0,
  turn: 0,
  glitter: 0,
  jump: 0,
  launch: 0,
  slalom: 1,
  sliders: 1,
  drop: 2,
  loop: 2,
  hammers: 3,
  bumpers: 3,
  narrow: 4,
  tube: 4,
  sweepers: 5,
  corkscrew: 6,
  bounce: 1,
  holes: 2,
  split: 3,
  pushers: 4,
  pit: 5,
};
// План уровня: последовательность кусков, каждые несколько кусков — чекпойнт
export function plan(level) {
  const rand = rng(1000 + level * 7919);
  const kinds = Object.keys(unlock).filter((k) => unlock[k] <= level);
  // Шар быстрый, поэтому трассы длинные: от 9 кусков на первом уровне до 22
  const count = Math.min(9 + Math.round(level * 1.2), 22);
  const segs = [{ type: "start" }];
  let last = "";
  for (let i = 0; i < count; i++) {
    let type;
    do type = kinds[Math.floor(rand() * kinds.length)];
    while (type === last || (type === "loop" && last === "corkscrew"));
    // Первый кусок каждого нового уровня — то, что на нём появилось впервые
    if (i === 1) type = kinds.find((k) => unlock[k] === level) || type;
    segs.push({ type, side: rand() < 0.5 ? -1 : 1, rand: rand() });
    if (i % 4 === 3 && i < count - 1) segs.push({ type: "checkpoint" });
    last = type;
  }
  segs.push({ type: "finish" });
  return segs;
}

export class Track {
  constructor(level) {
    this.level = level;
    this.samples = [];
    this.obstacles = [];
    this.gems = [];
    this.boosts = [];
    this.checkpoints = [0];
    this.rings = [];
    this.gates = [];
    this.tubes = [];
    this.pads = []; // батуты
    this.starts = [0]; // начала кусков: сюда шар возвращается, если упал
    // Черепашка: курс, наклон вверх-вниз, крен, сдвиг вбок для петель
    this.pos = new T.Vector3(0, 30, 0);
    this.h = 0;
    this.p = 0;
    this.b = 0;
    this.s = 0;
    this.hue = (level * 0.13) % 1;
    for (const seg of plan(level)) {
      this.starts.push(this.s);
      this[seg.type](seg);
    }
    this.length = this.s;
    this.fillGems();
  }
  // Дорожки кристаллов по всей трассе: где их нет, ставим группами по пять,
  // и каждая следующая группа переходит в другой ряд — есть чем рулить
  fillGems() {
    const lanes = [0, -1.3, 1.3, 0, 1.3, -1.3];
    const taken = this.gems.map((g) => g.s).sort((a, b) => a - b);
    const near = (s, gap) => {
      let lo = 0,
        hi = taken.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (taken[mid] < s - gap) lo = mid + 1;
        else hi = mid;
      }
      return lo < taken.length && taken[lo] <= s + gap;
    };
    let run = 0,
      lane = 0;
    for (let s = 12; s < this.finishAt - 4; s += 2) {
      const a = this.samples[Math.round(s / DS)];
      // У дыр, развилок и батутов свои кристаллы
      const blocked =
        a.air ||
        a.gaps ||
        ["loop", "ramp", "holes", "split", "bounce", "pit"].includes(a.kind) ||
        near(s, 4) ||
        this.obstacles.some((o) => Math.abs(o.s - s) < 2.5);
      if (blocked) {
        run = 0;
        continue;
      }
      if (run === 5) {
        run = 0;
        lane++;
        s += 2; // промежуток между группами
        continue;
      }
      const half = a.half - 0.9;
      this.gems.push({ s, u: Math.max(-half, Math.min(half, lanes[lane % lanes.length])), h: 0 });
      run++;
    }
  }
  frame(h, p, b) {
    const fwd = new T.Vector3(Math.sin(h), 0, -Math.cos(h));
    const right = new T.Vector3(Math.cos(h), 0, Math.sin(h));
    const up = new T.Vector3(0, 1, 0);
    const pitch = new T.Quaternion().setFromAxisAngle(right, p);
    fwd.applyQuaternion(pitch);
    up.applyQuaternion(pitch);
    const roll = new T.Quaternion().setFromAxisAngle(fwd, b);
    up.applyQuaternion(roll);
    right.copy(fwd).cross(up).normalize();
    return { fwd, up, right };
  }
  // Шаг черепашки: on — что записать в кадр (воздух, бортики, ширина, вид)
  step(on = {}, shift = 0) {
    const { fwd, up, right } = this.frame(this.h, this.p, this.b);
    if (shift) this.pos.addScaledVector(new T.Vector3(Math.cos(this.h), 0, Math.sin(this.h)), shift);
    this.samples.push({
      p: this.pos.clone(),
      f: fwd,
      u: up,
      r: right,
      s: this.s,
      air: !!on.air,
      rails: on.rails !== false && !on.air,
      half: on.half ?? HALF,
      tube: !!on.tube,
      hue: this.hue,
      kind: on.kind || "road",
      // Вырезанные участки поперёк дорожки: [[u0, u1], …] — там дыра
      gaps: on.gaps || null,
    });
    this.pos.addScaledVector(fwd, DS);
    this.s += DS;
  }
  // Плавно вернуть наклон и крен к нулю за длину len
  settle(len, on) {
    const p0 = this.p,
      b0 = this.b;
    const n = Math.round(len / DS);
    for (let i = 0; i < n; i++) {
      const t = smooth((i + 1) / n);
      this.p = p0 * (1 - t);
      this.b = b0 * (1 - t);
      this.step(on);
    }
  }
  nextHue() {
    this.hue = (this.hue + 0.11) % 1;
  }
  gemLine(from, to, u = 0, h = 0, gap = 2) {
    for (let s = from; s < to; s += gap) this.gems.push({ s, u: typeof u === "function" ? u(s) : u, h });
  }
  // ---------- Куски трассы ----------
  start() {
    for (let i = 0; i < 40; i++) this.step({ kind: "start" });
    this.gemLine(8, 19, 0, 0, 2.2);
  }
  checkpoint() {
    this.checkpoints.push(this.s);
    this.gates.push({ s: this.s, kind: "checkpoint" });
    this.settle(8);
  }
  finish() {
    this.settle(10);
    this.finishAt = this.s;
    this.gates.push({ s: this.s, kind: "finish" });
    for (let i = 0; i < 70; i++) this.step({ kind: "finish" });
  }
  // Прямая с дорожкой кристаллов змейкой
  glitter() {
    this.nextHue();
    const s0 = this.s;
    this.settle(30);
    this.gemLine(s0 + 3, s0 + 27, (s) => Math.sin((s - s0) * 0.25) * 1.4, 0, 1.6);
  }
  hill(seg) {
    this.nextHue();
    const s0 = this.s,
      len = 46,
      amp = 0.32 + seg.rand * 0.12,
      n = len / DS;
    for (let i = 0; i < n; i++) {
      this.p = amp * Math.sin((2 * pie * i) / n);
      this.step();
    }
    this.p = 0;
    this.gemLine(s0 + 18, s0 + 30, 0, 0.6, 1.6);
  }
  drop() {
    this.nextHue();
    const s0 = this.s;
    // Крутой спуск с разгоном и плавный выход
    for (let i = 0; i < 24; i++) {
      this.p = -0.55 * smooth(i / 24);
      this.step();
    }
    for (let i = 0; i < 30; i++) this.step();
    this.boosts.push({ s: this.s - 8 });
    this.settle(14);
    this.gemLine(s0 + 14, s0 + 32, 0, 0, 1.4);
  }
  turn(seg) {
    this.nextHue();
    const len = 34,
      n = len / DS,
      angle = seg.side * pie * (0.4 + seg.rand * 0.2);
    const s0 = this.s;
    for (let i = 0; i < n; i++) {
      const t = i / n,
        rate = (angle / len) * 6 * t * (1 - t) * DS;
      this.h += rate;
      // Вираж: дорожка наклоняется внутрь поворота
      this.b = (-rate / DS) * 9;
      this.p *= 0.95;
      this.step();
    }
    this.settle(4);
    this.gemLine(s0 + 6, s0 + 30, -seg.side * 1.2, 0, 1.8);
  }
  slalom(seg) {
    this.nextHue();
    const len = 60,
      n = len / DS,
      s0 = this.s;
    let h0 = this.h;
    for (let i = 0; i < n; i++) {
      const t = i / n,
        target = h0 + seg.side * 0.42 * Math.sin(t * 2 * pie);
      const rate = target - this.h;
      this.h = target;
      this.b = (-rate / DS) * 9;
      this.step();
    }
    this.settle(4);
    this.gemLine(s0 + 4, s0 + 56, (s) => -seg.side * 1.3 * Math.cos(((s - s0) / len) * 2 * pie), 0, 2);
  }
  loop(seg) {
    this.nextHue();
    this.settle(6);
    this.boosts.push({ s: this.s });
    for (let i = 0; i < 14; i++) this.step();
    // Мёртвая петля: наклон проходит полный круг, а дорожка уходит вбок, чтобы не задеть себя
    const r = 7.5,
      n = Math.round((2 * pie * r) / DS),
      shift = (seg.side * 6.2) / n;
    const s0 = this.s;
    for (let i = 0; i < n; i++) {
      this.p = (2 * pie * (i + 1)) / n;
      this.step({ kind: "loop" }, shift);
    }
    this.p = 0;
    this.gemLine(s0 + 6, s0 + 40, 0, 0, 2.2);
    this.settle(12);
  }
  corkscrew(seg) {
    this.nextHue();
    this.settle(6);
    this.boosts.push({ s: this.s });
    for (let i = 0; i < 10; i++) this.step();
    // Штопор: дорожка делает полный оборот вокруг себя
    const n = 90,
      s0 = this.s;
    for (let i = 0; i < n; i++) {
      this.b = seg.side * 2 * pie * smooth((i + 1) / n);
      this.step({ kind: "loop" });
    }
    this.b = 0;
    this.gemLine(s0 + 4, s0 + 42, 0, 0, 2.5);
    this.settle(8);
  }
  jump() {
    this.nextHue();
    this.settle(6);
    this.boosts.push({ s: this.s });
    for (let i = 0; i < 12; i++) this.step();
    // Трамплин, полёт над пропастью по дуге и мягкая посадка
    for (let i = 0; i < 12; i++) {
      this.p = 0.42 * smooth((i + 1) / 12);
      this.step({ kind: "ramp" });
    }
    const s0 = this.s,
      n = 34;
    for (let i = 0; i < n; i++) {
      this.p = 0.42 - (0.84 * (i + 1)) / n;
      this.step({ air: true });
    }
    // Кристаллы волной по всей дуге: в полёте можно рулить и собирать
    this.gemLine(s0 + 1, s0 + n * DS - 1, (s) => Math.sin((s - s0) * 0.5) * 1.3, 0.5, 1.3);
    this.landing = this.s;
    this.settle(10, { kind: "land" });
    this.p = 0;
  }
  // Катапульта: крутой трамплин и долгий высокий полёт сквозь радужные кольца
  launch(seg) {
    this.nextHue();
    this.settle(6);
    this.boosts.push({ s: this.s }, { s: this.s + 10 });
    for (let i = 0; i < 24; i++) this.step();
    for (let i = 0; i < 16; i++) {
      this.p = 0.62 * smooth((i + 1) / 16);
      this.step({ kind: "ramp" });
    }
    const s0 = this.s,
      n = 76;
    for (let i = 0; i < n; i++) {
      this.p = 0.62 - (1.24 * (i + 1)) / n;
      this.step({ air: true });
    }
    const len = n * DS;
    // Две змейки кристаллов в разных ритмах и кольца на подъёме, на вершине и на спуске
    this.gemLine(s0 + 1, s0 + len - 1, (s) => seg.side * 1.4 * Math.sin((s - s0) * 0.35), 0.5, 1.1);
    this.gemLine(s0 + 3, s0 + len - 3, (s) => -seg.side * 1.4 * Math.sin((s - s0) * 0.35), 0.9, 3.3);
    for (const k of [0.25, 0.5, 0.75]) this.rings.push(s0 + len * k);
    this.settle(14, { kind: "land" });
    this.p = 0;
  }
  narrow() {
    this.nextHue();
    this.settle(6);
    const s0 = this.s,
      n = 64;
    // Узкий мостик без бортиков: можно скатиться, тогда шар вернётся на чекпойнт
    for (let i = 0; i < n; i++) {
      const t = i / n,
        half = HALF - (HALF - 1.15) * Math.sin(t * pie) ** 0.5;
      this.step({ rails: false, half, kind: "narrow" });
    }
    this.gemLine(s0 + 4, s0 + 30, 0, 0, 1.6);
  }
  tube(seg) {
    this.nextHue();
    this.settle(6);
    const s0 = this.s,
      n = 110;
    // Стеклянная труба, внутри которой дорожка делает бочку
    for (let i = 0; i < n; i++) {
      this.b = seg.side * 2 * pie * smooth(i / n);
      this.h += Math.sin((i / n) * 2 * pie) * 0.004 * seg.side;
      this.step({ tube: true, kind: "tube" });
    }
    this.b = 0;
    this.tubes.push([s0, this.s]);
    this.gemLine(s0 + 6, s0 + 50, 0, 0, 2);
  }
  zone(kind, seg) {
    this.nextHue();
    this.settle(6);
    const s0 = this.s,
      n = 120;
    for (let i = 0; i < n; i++) this.step({ kind: "zone" });
    const count = 4;
    for (let k = 0; k < count; k++) {
      const s = s0 + 10 + k * 12;
      const phase = k * 1.7 + seg.rand * 3;
      this.obstacles.push({ kind, s, phase, side: k % 2 ? 1 : -1 });
      // Кристаллы подсказывают безопасный путь между препятствиями
      this.gems.push({ s: s - 5, u: 0, h: 0 }, { s: s + 5, u: 0, h: 0 });
    }
  }
  hammers(seg) {
    this.zone("hammer", seg);
  }
  pushers(seg) {
    this.zone("pusher", seg);
  }
  // Дыры в плитке: дорожка из трёх рядов, то в одном, то в другом ряду нет плиток.
  // Кристаллы ведут по целому ряду.
  holes(seg) {
    this.nextHue();
    this.settle(6);
    const lane = (2 * HALF) / 3,
      BLOCK = 9,
      blocks = 6;
    const s0 = this.s;
    const r = rng(Math.floor(seg.rand * 1e6));
    // Целый ряд в каждом блоке; следующий — только соседний, чтобы ребёнок успевал перерулить
    // Первый блок — средний ряд: после возврата шар стоит посередине
    const pattern = [0];
    for (let k = 1; k < blocks; k++) {
      const prev = pattern[k - 1];
      pattern.push(prev === 0 ? (r() < 0.5 ? -1 : 1) : 0);
    }
    const n = Math.round((4 + blocks * BLOCK + 4) / DS);
    for (let i = 0; i < n; i++) {
      const at = i * DS,
        block = Math.floor((at - 4) / BLOCK),
        inBlock = (at - 4) % BLOCK;
      let gaps = null;
      if (block >= 0 && block < blocks && inBlock > 1.5 && inBlock < 5.5)
        gaps = [-1, 0, 1].filter((x) => x !== pattern[block]).map((x) => [x * lane - lane / 2, x * lane + lane / 2]);
      this.step({ gaps, kind: "holes" });
    }
    // Кристаллы по целому ряду и чуть дальше конца дыры (дыра до 5,5 м, кристаллы до 6,2 м)
    pattern.forEach((safeRow, k) => this.gemLine(s0 + 4 + k * BLOCK + 0.6, s0 + 4 + k * BLOCK + 6.5, safeRow * lane, 0, 1.4));
  }
  // Развилка: посередине провал, ехать можно по левой или правой дорожке
  split(seg) {
    this.nextHue();
    this.settle(6);
    const s0 = this.s,
      n = 100;
    for (let i = 0; i < n; i++) {
      const t = i / n,
        open = Math.sin(Math.min(1, Math.max(0, (t - 0.08) / 0.84)) * pie);
      const w = open * 1.2;
      this.h += Math.sin(t * 2 * pie) * 0.003 * seg.side;
      this.step({ gaps: w > 0.15 ? [[-w, w]] : null, half: HALF + open * 0.6, kind: "split" });
    }
    // Кристаллы заранее уводят шар в сторону, ещё до того, как посередине откроется провал
    const lead = (s) => Math.min(1, Math.max(0, (s - s0 - 1) / 8));
    this.gemLine(s0 + 1, s0 + 44, (s) => -2.0 * seg.side * lead(s), 0, 1.5);
    this.gemLine(s0 + 14, s0 + 40, 2.0 * seg.side, 0.6, 3.2);
  }
  // Батут: шар подлетает высоко, в воздухе дуга кристаллов
  bounce() {
    this.nextHue();
    this.settle(6);
    for (let i = 0; i < 10; i++) this.step();
    this.pads.push({ s: this.s, power: 13 });
    const s0 = this.s;
    for (let i = 0; i < 70; i++) this.step({ kind: "bounce" });
    this.arcGems(s0, 13);
  }
  // Провал во всю ширину: перед ним батут, шар перелетает
  pit() {
    this.nextHue();
    this.settle(6);
    for (let i = 0; i < 10; i++) this.step();
    this.pads.push({ s: this.s, power: 14.5 });
    const s0 = this.s;
    for (let i = 0; i < 8; i++) this.step({ kind: "bounce" });
    for (let i = 0; i < 22; i++) this.step({ gaps: [[-9, 9]], kind: "pit" });
    for (let i = 0; i < 40; i++) this.step({ kind: "bounce" });
    this.arcGems(s0, 14.5);
  }
  // Дуга кристаллов над батутом: высота как у полёта шара с крейсерской скоростью уровня
  arcGems(s0, power) {
    const v = Math.min(15 + this.level * 0.5, 21),
      g = 26;
    const flight = (2 * power) / g;
    for (let t = 0.12; t < flight - 0.08; t += 0.09) this.gems.push({ s: s0 + v * t, u: 0, h: Math.max(0, power * t - (g / 2) * t * t) });
  }
  sweepers(seg) {
    this.zone("sweeper", seg);
  }
  sliders(seg) {
    this.zone("slider", seg);
  }
  bumpers(seg) {
    this.zone("bumper", seg);
  }
  // ---------- Поиск кадра на расстоянии s ----------
  at(s, out = {}) {
    const n = this.samples.length;
    const x = Math.max(0, Math.min(s / DS, n - 1.001)),
      i = Math.floor(x),
      t = x - i;
    const a = this.samples[i],
      b = this.samples[Math.min(i + 1, n - 1)];
    out.p = (out.p || new T.Vector3()).lerpVectors(a.p, b.p, t);
    out.f = (out.f || new T.Vector3()).lerpVectors(a.f, b.f, t).normalize();
    out.u = (out.u || new T.Vector3()).lerpVectors(a.u, b.u, t).normalize();
    out.r = (out.r || new T.Vector3()).lerpVectors(a.r, b.r, t).normalize();
    out.air = a.air && b.air;
    out.rails = a.rails && b.rails;
    out.half = a.half + (b.half - a.half) * t;
    out.tube = a.tube;
    out.kind = a.kind;
    out.gaps = a.gaps;
    out.sample = a;
    return out;
  }
}

// ---------- Меш дорожки ----------
// Сечение: верх с бортиками-полосками, бока и низ. Цвет — по радуге от куска к куску.
const stripe = (() => {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = "#d4d4e2";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 5, 128);
  ctx.fillRect(59, 0, 5, 128);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  for (let y = 10; y < 128; y += 32) ctx.fillRect(29, y, 6, 14);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
})();
// Дорожка из «полос»: обычная — одна полоса во всю ширину, у дыр и развилок — несколько.
// Верх — с узором темы, бока, бортики и низ — отдельная глянцевая сетка цвета отделки.
function pieces(a) {
  let list = [[-a.half, a.half]];
  for (const [g0, g1] of a.gaps || []) {
    const next = [];
    for (const [u0, u1] of list) {
      if (g1 <= u0 || g0 >= u1) next.push([u0, u1]);
      else {
        if (g0 > u0) next.push([u0, g0]);
        if (g1 < u1) next.push([g1, u1]);
      }
    }
    list = next;
  }
  // Край с бортиком — только внешний и только там, где бортики есть
  return list.map(([u0, u1]) => ({ u0, u1, lipL: a.rails && u0 <= -a.half + 1e-6, lipR: a.rails && u1 >= a.half - 1e-6 }));
}
export function trackMesh(track, theme) {
  const top = { pos: [], col: [], uv: [], idx: [] },
    body = { pos: [], col: [], uv: [], idx: [] };
  const S = track.samples,
    color = new T.Color(),
    trim = new T.Color(),
    tmp = new T.Vector3();
  const LIP = 0.2,
    LIPH = 0.2,
    BOT = -0.5;
  const put = (g, a, x, y, c, u = 0) => {
    tmp.copy(a.p).addScaledVector(a.r, x).addScaledVector(a.u, y);
    g.pos.push(tmp.x, tmp.y, tmp.z);
    g.col.push(c.r, c.g, c.b);
    g.uv.push(u, a.s / 6);
    return g.pos.length / 3 - 1;
  };
  // Грани сечения полосы: [x0, y0, x1, y1, оттенок]
  const faces = (pc) => {
    const L = pc.lipL ? LIP : 0,
      Rr = pc.lipR ? LIP : 0,
      hl = pc.lipL ? LIPH : 0.02,
      hr = pc.lipR ? LIPH : 0.02;
    const f = [[pc.u0 - L, BOT, pc.u0 - L, hl, "wall"]];
    if (pc.lipL) f.push([pc.u0 - LIP, LIPH, pc.u0, 0.02, "lip"]);
    if (pc.lipR) f.push([pc.u1, 0.02, pc.u1 + LIP, LIPH, "lip"]);
    f.push([pc.u1 + Rr, hr, pc.u1 + Rr, BOT, "wall"], [pc.u1 + Rr, BOT, pc.u0 - L, BOT, "bottom"]);
    return f;
  };
  const shade = (kind, road) => (kind === "lip" ? trim : kind === "wall" ? trim.clone().multiplyScalar(0.82) : road.clone().multiplyScalar(0.5));
  // Торец полосы на краю дыры: многоугольник сечения веером
  const cap = (a, pc, road) => {
    const L = pc.lipL ? LIP : 0,
      Rr = pc.lipR ? LIP : 0;
    const ring = [[pc.u0 - L, BOT], [pc.u0 - L, pc.lipL ? LIPH : 0.02]];
    if (pc.lipL) ring.push([pc.u0, 0.02]);
    if (pc.lipR) ring.push([pc.u1, 0.02]);
    ring.push([pc.u1 + Rr, pc.lipR ? LIPH : 0.02], [pc.u1 + Rr, BOT]);
    const c = trim.clone().multiplyScalar(0.9);
    const mid = put(body, a, (pc.u0 + pc.u1) / 2, -0.15, c);
    const ids = ring.map(([x, y]) => put(body, a, x, y, c));
    for (let k = 0; k < ids.length; k++) body.idx.push(mid, ids[k], ids[(k + 1) % ids.length]);
  };
  let prev = null; // {a, list, sig}
  for (let i = 0; i <= S.length; i++) {
    const a = S[i];
    const list = a && !a.air ? pieces(a) : null;
    const sig = list ? list.map((pc) => `${pc.lipL}${pc.lipR}`).join("|") + "#" + list.length : null;
    const road = a ? theme.road.color(a.hue) : null;
    // Конец прогона: закрыть торцы прошлой полосы
    if (prev && sig !== prev.sig) for (const pc of prev.list) cap(prev.a, pc, prev.road);
    if (!list) {
      prev = null;
      continue;
    }
    trim.copy(theme.trim ? theme.trim(a.hue) : new T.Color("#ffffff"));
    if (prev && sig === prev.sig) {
      list.forEach((pc, j) => {
        const q = prev.list[j];
        // Верх
        color.copy(road);
        const u = (x) => (x + a.half) / (2 * a.half);
        const t0 = put(top, prev.a, q.u0, 0.02, prev.road, (q.u0 + prev.a.half) / (2 * prev.a.half)),
          t1 = put(top, prev.a, q.u1, 0.02, prev.road, (q.u1 + prev.a.half) / (2 * prev.a.half)),
          t2 = put(top, a, pc.u0, 0.02, color, u(pc.u0)),
          t3 = put(top, a, pc.u1, 0.02, color, u(pc.u1));
        top.idx.push(t0, t2, t1, t1, t2, t3);
        // Бока, бортики, низ
        const fp = faces(q),
          fa = faces(pc);
        fa.forEach(([x0, y0, x1, y1, kind], k) => {
          const [px0, py0, px1, py1] = fp[k];
          const cp = shade(kind, prev.road),
            ca = shade(kind, road);
          const b0 = put(body, prev.a, px0, py0, cp),
            b1 = put(body, prev.a, px1, py1, cp),
            b2 = put(body, a, x0, y0, ca),
            b3 = put(body, a, x1, y1, ca);
          body.idx.push(b0, b2, b1, b1, b2, b3);
        });
      });
    } else {
      // Начало прогона: торцы
      for (const pc of list) cap(a, pc, road);
    }
    prev = { a, list, sig, road: road.clone() };
  }
  const make = (g) => {
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(g.col, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    geo.computeVertexNormals();
    return geo;
  };
  const surface = new T.Mesh(
    make(top),
    new T.MeshPhysicalMaterial({
      map: theme.road.tex || stripe,
      vertexColors: true,
      roughness: theme.road.roughness ?? 0.35,
      metalness: theme.road.metalness ?? 0,
      clearcoat: theme.road.clearcoat ?? 0.6,
      clearcoatRoughness: 0.2,
      // Светящиеся узоры у ночных тем: края, пунктир, трещины лавы
      emissive: theme.road.glow ? 0xffffff : 0x000000,
      emissiveMap: theme.road.glow || null,
      emissiveIntensity: theme.road.glow ? 1.8 : 0,
      side: T.DoubleSide,
    }),
  );
  const sides = new T.Mesh(
    make(body),
    new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, side: T.DoubleSide }),
  );
  surface.receiveShadow = sides.receiveShadow = true;
  const group = new T.Group();
  group.add(surface, sides);
  return group;
}
// Бортики: цепочка светящихся бусин вдоль краёв, где есть бортик
export function railLights(track, theme) {
  const spots = [];
  for (const a of track.samples) {
    if (!a.rails || a.tube || Math.round(a.s / DS) % 3) continue;
    for (const side of [-1, 1]) spots.push([a, side]);
  }
  const mesh = new T.InstancedMesh(
    new T.SphereGeometry(0.14, 10, 8),
    // Ночью бусины без освещения: цвет горит в полную силу, как неон
    // Множитель больше 1 — бусины ярче порога свечения и сияют
    theme.railGlow
      ? new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.2, 2.2) })
      : new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.3 }),
    spots.length,
  );
  const m = new T.Matrix4(),
    color = new T.Color();
  spots.forEach(([a, side], i) => {
    const p = a.p.clone().addScaledVector(a.r, side * (a.half + 0.1)).addScaledVector(a.u, 0.3);
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    color.copy(theme.rail(a.hue, i));
    mesh.setColorAt(i, color);
  });
  return mesh;
}
// Стеклянные трубы
export function tubeMeshes(track) {
  const group = new T.Group();
  const glass = new T.MeshPhysicalMaterial({
    color: 0xbff4ff,
    roughness: 0.05,
    transparent: true,
    opacity: 0.22,
    side: T.DoubleSide,
    depthWrite: false,
    clearcoat: 1,
  });
  for (const [from, to] of track.tubes) {
    const pts = [];
    for (let s = from; s <= to; s += 1) {
      const fr = track.at(s);
      pts.push(fr.p.clone().addScaledVector(fr.u, 1.3));
    }
    const curve = new T.CatmullRomCurve3(pts);
    const mesh = new T.Mesh(new T.TubeGeometry(curve, pts.length * 2, 3.1, 28, false), glass);
    mesh.renderOrder = 2;
    group.add(mesh);
    // Светящиеся кольца по трубе
    for (let s = from + 2; s < to; s += 5) {
      const fr = track.at(s);
      const ring = new T.Mesh(
        new T.TorusGeometry(3.12, 0.08, 8, 40),
        new T.MeshStandardMaterial({ color: 0xffffff, emissive: new T.Color().setHSL((s * 0.01) % 1, 1, 0.6), emissiveIntensity: 1.2 }),
      );
      ring.position.copy(fr.p).addScaledVector(fr.u, 1.3);
      ring.lookAt(ring.position.clone().add(fr.f));
      group.add(ring);
    }
  }
  return group;
}
