// Зубы и дёсны «Зубика»: каждая коронка строится по своей форме (резец, клык, малый и большой коренной),
// зубы стоят вплотную по параболической дуге, десна изгибается дугой над каждым зубом.
import * as T from "../vendor/three/three.module.min.js?v=230b1332";

const pie = Math.PI;
const smooth = (t) => t * t * (3 - 2 * t);
// Размеры [ширина вдоль дуги, высота коронки, толщина]: верхние резцы крупнее нижних, как у людей
// Передние зубы крупные — так улыбка видна издалека
export const DIMS = {
  up: { central: [0.5, 0.74, 0.26], lateral: [0.39, 0.64, 0.23], canine: [0.41, 0.7, 0.29], premolar: [0.35, 0.54, 0.37], molar: [0.46, 0.46, 0.44] },
  down: { central: [0.32, 0.6, 0.21], lateral: [0.34, 0.6, 0.22], canine: [0.37, 0.65, 0.26], premolar: [0.35, 0.5, 0.35], molar: [0.48, 0.45, 0.44] },
};
// От середины к краю челюсти
export const ORDER = ["central", "lateral", "canine", "premolar", "premolar", "molar", "molar"];

// Сечение коронки на высоте t (0 — режущий край, 1 — шейка у десны)
function section(type, w, d, t) {
  if (type === "central" || type === "lateral")
    // Резец: широкий плоский край, сужается к шейке, «лопаточка» — тонкий у края, толще к шейке
    return { hx: (w / 2) * (1 - 0.3 * t ** 1.4), hz: (d / 2) * (0.38 + 0.62 * Math.sqrt(t)), n: 2.7 };
  if (type === "canine") {
    const tip = smooth(Math.min(1, t / 0.38));
    return { hx: (w / 2) * (0.18 + 0.82 * tip) * (1 - 0.22 * Math.max(0, t - 0.38)), hz: (d / 2) * (0.45 + 0.55 * tip), n: 2.3 };
  }
  if (type === "premolar") return { hx: (w / 2) * (0.94 - 0.18 * t), hz: (d / 2) * (0.96 - 0.14 * t), n: 2.5 };
  return { hx: (w / 2) * (0.96 - 0.14 * t), hz: (d / 2) * (0.97 - 0.1 * t), n: 2.9 };
}
// Выпуклость лицевой стороны
const bulge = (h, t, xf) => 0.035 * h * Math.sin(pie * Math.min(1, t * 1.1)) * (1 - xf * xf);
// Высота жевательной поверхности: бугорки у коренных, закругление у резцов, острие клыка
function cap(type, w, h, d, x, z, f) {
  if (type === "canine") return -0.07 * h * (1 - f * f);
  if (type === "central" || type === "lateral") return -0.025 * h * (1 - f ** 4);
  const cusps =
    type === "molar"
      ? [
          [-0.22, -0.2],
          [0.22, -0.2],
          [-0.22, 0.2],
          [0.22, 0.2],
        ]
      : [
          [0, -0.22],
          [0, 0.24],
        ];
  let c = 0;
  for (const [cx, cz] of cusps) c += Math.exp(-((x / w - cx) ** 2 + (z / d - cz) ** 2) / 0.018);
  return -0.07 * h * Math.min(1.2, c) + 0.015 * h;
}
// Точка на лицевой стороне коронки (в координатах зуба): x — доля ширины от −0.5 до 0.5
export function labial(type, [w, h, d], t, xf = 0) {
  const s = section(type, w, d, t);
  return new T.Vector3(xf * 2 * s.hx, -h / 2 + t * h, s.hz + bulge(h, t, xf * 2));
}
const EDGE = new T.Color("#e3eeff"),
  BODY = new T.Color("#fffaf1"),
  NECK = new T.Color("#f3e3c4");
// Коронка: кольца сечений от края к шейке, закрытые «крышками» с обоих концов.
// chipped — отбит уголок; part — только отбитый кусочек (для починки).
export function toothGeometry(type, dims, { chipped = false, part = false } = {}) {
  const [w, h, d] = dims;
  const R = 44,
    V = 30,
    K = 12;
  const rings = [];
  // Крышка у края: от центра к краю
  for (let k = 0; k <= K; k++) rings.push({ t: 0, f: k / K, capEdge: true });
  for (let v = 1; v <= V; v++) rings.push({ t: v / V, f: 1 });
  for (let k = K - 1; k >= 0; k--) rings.push({ t: 1, f: k / K, capNeck: true });
  const pos = [],
    col = [],
    idx = [];
  const c = new T.Color();
  const cutY = -h / 2 + 0.36 * h,
    cutX = 0.1 * w;
  for (const r of rings) {
    const s = section(type, w, d, r.t);
    for (let a = 0; a < R; a++) {
      const phi = (2 * pie * a) / R,
        co = Math.cos(phi),
        si = Math.sin(phi);
      let x = s.hx * Math.sign(co) * Math.abs(co) ** (2 / s.n) * r.f,
        z = s.hz * Math.sign(si) * Math.abs(si) ** (2 / s.n) * r.f,
        y = -h / 2 + r.t * h;
      if (z > 0) z += bulge(h, r.t, x / Math.max(1e-6, s.hx));
      if (r.capEdge) y += cap(type, w, h, d, x, z, r.f);
      if (r.capNeck) y += 0.04 * h * (1 - r.f * r.f);
      if (chipped && x > cutX && y < cutY) y = cutY - 0.01 * h + Math.sin(x * 140 + z * 90) * 0.012;
      if (part) {
        x = Math.max(x, cutX);
        y = Math.min(y, cutY);
      }
      pos.push(x, y, z);
      // Эмаль: у края голубоватая, у шейки теплее
      const t = (y + h / 2) / h;
      if (t < 0.25) c.copy(EDGE).lerp(BODY, t / 0.25);
      else c.copy(BODY).lerp(NECK, Math.max(0, (t - 0.6) / 0.4));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings.length - 1; i++)
    for (let a = 0; a < R; a++) {
      const p = i * R + a,
        q = i * R + ((a + 1) % R),
        p2 = p + R,
        q2 = q + R;
      idx.push(p, p2, q, q, p2, q2);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export const enamel = () =>
  new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.13,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 0.35,
    sheenColor: new T.Color("#ffffff"),
    sheenRoughness: 0.4,
  });

// ---------- Дуга ----------
// Парабола z = −k·x², точки по длине дуги; N — наружу дуги
export function archCurve(k) {
  const pts = [{ x: 0, len: 0 }];
  let len = 0,
    px = 0,
    pz = 0;
  for (let x = 0.002; x < 3.2; x += 0.002) {
    const z = -k * x * x;
    len += Math.hypot(x - px, z - pz);
    pts.push({ x, len });
    px = x;
    pz = z;
  }
  return (s) => {
    const a = Math.abs(s);
    let lo = 0,
      hi = pts.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (pts[m].len < a) lo = m + 1;
      else hi = m;
    }
    const x = pts[lo].x * Math.sign(s || 1);
    const n = new T.Vector3(2 * k * x, 0, 1).normalize();
    return { p: new T.Vector3(x, 0, -k * x * x), n };
  };
}
// Расстановка зубов челюсти: возвращает [{type, dims, s, w}] слева направо
export function layout(side) {
  const list = [...ORDER.slice().reverse(), ...ORDER];
  const gap = 0.006;
  const widths = list.map((t) => DIMS[side][t][0]);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (list.length - 1);
  let acc = -total / 2;
  return list.map((type, i) => {
    const w = widths[i],
      s = acc + w / 2;
    acc += w + gap;
    return { type, dims: DIMS[side][type], s, w, i };
  });
}

// ---------- Десна ----------
// Лента вдоль дуги: край фестонами (дуга над каждым зубом, сосочек между зубами), валик и уход вглубь.
// sign = 1 для верхней челюсти (корни вверх), −1 для нижней.
export function gumGeometry(curve, slots, sign, inner = false) {
  const S = 420,
    V = 14;
  const first = slots[0].s - slots[0].w / 2,
    last = slots.at(-1).s + slots.at(-1).w / 2;
  const pos = [],
    col = [],
    idx = [];
  const c = new T.Color(),
    margin = new T.Color("#ffb6c6"),
    base = new T.Color("#ff8ba5"),
    deep = new T.Color("#e8627f");
  for (let i = 0; i <= S; i++) {
    const s = first - 0.05 + ((last - first + 0.1) * i) / S;
    // Зуб, над которым эта точка
    let slot = slots[0];
    for (const sl of slots) if (Math.abs(s - sl.s) <= sl.w / 2 + 0.004) slot = sl;
    const u = Math.max(-0.5, Math.min(0.5, (s - slot.s) / slot.w));
    const [, h, d] = slot.dims;
    // Высота края десны над режущим краем: выше всего над серединой зуба, ниже — между зубами
    // Мягкие дуги, а не острые зубцы: над серединой зуба выше, между зубами ниже
    const hm = h * (inner ? 0.72 : 0.68 + 0.15 * Math.cos(pie * u));
    const { p, n } = curve(s);
    const depth = inner ? -d - 0.02 : 0;
    for (let v = 0; v <= V; v++) {
      const f = v / V;
      // Валик у края, выше десна уходит вглубь, за губу
      const roll = Math.sin(Math.min(1, f * 1.8) * (pie / 2)),
        tuck = smooth(Math.max(0, (f - 0.5) / 0.5));
      const out = inner ? -(0.02 + 0.08 * roll) + 0.1 * tuck : 0.015 + (sign > 0 ? 0.08 : 0.05) * roll - 0.24 * tuck;
      const y = sign * (hm + f * 0.34);
      const q = p.clone().addScaledVector(n, depth + out);
      pos.push(q.x, y, q.z);
      c.copy(margin).lerp(base, Math.min(1, f * 2.5)).lerp(deep, Math.max(0, f - 0.5));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < S; i++)
    for (let v = 0; v < V; v++) {
      const a = i * (V + 1) + v,
        b = a + V + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export const gumMaterial = () =>
  new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.38,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    sheen: 0.5,
    sheenColor: new T.Color("#ffe0e8"),
    side: T.DoubleSide,
  });
