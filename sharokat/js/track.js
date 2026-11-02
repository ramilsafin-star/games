// Трасса «Шароката»: путь строится «черепашкой» из кусков (холм, поворот, петля, прыжок…),
// каждые полметра — кадр (точка, вперёд, вверх, вправо). По кадрам строятся меш и физика шара.
import * as T from "../vendor/three/three.module.min.js";

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
  slalom: 1,
  jump: 1,
  sliders: 1,
  drop: 2,
  loop: 2,
  hammers: 3,
  bumpers: 3,
  narrow: 4,
  tube: 4,
  sweepers: 5,
  corkscrew: 6,
};
// План уровня: последовательность кусков, каждые несколько кусков — чекпойнт
export function plan(level) {
  const rand = rng(1000 + level * 7919);
  const kinds = Object.keys(unlock).filter((k) => unlock[k] <= level);
  const count = Math.min(7 + level, 18);
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
    this.gates = [];
    this.tubes = [];
    // Черепашка: курс, наклон вверх-вниз, крен, сдвиг вбок для петель
    this.pos = new T.Vector3(0, 30, 0);
    this.h = 0;
    this.p = 0;
    this.b = 0;
    this.s = 0;
    this.hue = (level * 0.13) % 1;
    for (const seg of plan(level)) this[seg.type](seg);
    this.length = this.s;
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
    this.gemLine(s0 + 2, s0 + 16, 0, 0.5, 2);
    this.landing = this.s;
    this.settle(10, { kind: "land" });
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
export function trackMesh(track) {
  const pos = [],
    col = [],
    uv = [],
    idx = [];
  const color = new T.Color();
  const S = track.samples;
  // Точки сечения: [вправо, вверх, u-текстуры, тёмный ли низ]
  const profile = (half) => [
    [-half - 0.2, -0.45, 0, 1],
    [-half - 0.2, 0.18, 0, 0.6],
    [-half, 0.02, 0.02, 0],
    [half, 0.02, 0.98, 0],
    [half + 0.2, 0.18, 1, 0.6],
    [half + 0.2, -0.45, 1, 1],
    [-half - 0.2, -0.45, 0, 1],
  ];
  let base = -1;
  for (let i = 0; i < S.length; i++) {
    const a = S[i];
    if (a.air) {
      base = -1;
      continue;
    }
    const ring = profile(a.half);
    const start = pos.length / 3;
    color.setHSL(a.hue, 0.95, 0.55);
    for (const [x, y, u, dark] of ring) {
      const p = a.p.clone().addScaledVector(a.r, x).addScaledVector(a.u, y);
      pos.push(p.x, p.y, p.z);
      const c = color.clone().multiplyScalar(1 - dark * 0.45);
      col.push(c.r, c.g, c.b);
      uv.push(u, a.s / 6);
    }
    if (base >= 0) {
      const m = ring.length;
      for (let k = 0; k < m - 1; k++) {
        const a0 = base + k,
          a1 = base + k + 1,
          b0 = start + k,
          b1 = start + k + 1;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
    base = start;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(
    geo,
    new T.MeshPhysicalMaterial({
      map: stripe,
      vertexColors: true,
      roughness: 0.35,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      side: T.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
// Бортики: цепочка светящихся бусин вдоль краёв, где есть бортик
export function railLights(track) {
  const spots = [];
  for (const a of track.samples) {
    if (!a.rails || a.tube || Math.round(a.s / DS) % 3) continue;
    for (const side of [-1, 1]) spots.push([a, side]);
  }
  const mesh = new T.InstancedMesh(
    new T.SphereGeometry(0.14, 10, 8),
    new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.3 }),
    spots.length,
  );
  const m = new T.Matrix4(),
    color = new T.Color();
  spots.forEach(([a, side], i) => {
    const p = a.p.clone().addScaledVector(a.r, side * (a.half + 0.1)).addScaledVector(a.u, 0.3);
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    color.setHSL((a.hue + 0.5 + (i % 6) * 0.08) % 1, 1, 0.55);
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
