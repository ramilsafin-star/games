// Геометрия без DOM: точки — массивы [x, y], ось y смотрит вниз, как на экране.
// Модуль общий для игры в браузере и для проверок в Node.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polyLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

// Расстояние от точки до отрезка
export function segDist(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
export function segIntersect(a, b, c, d) {
  const d1 = cross(c, d, a),
    d2 = cross(c, d, b),
    d3 = cross(a, b, c),
    d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
export function segSegDist(a, b, c, d) {
  if (segIntersect(a, b, c, d)) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Расстояние от отрезка до многоугольника (0 — если задевает или внутри)
export function segPolyDist(a, b, poly) {
  if (pointInPoly(a, poly) || pointInPoly(b, poly)) return 0;
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, segSegDist(a, b, poly[j], poly[i]));
  return m;
}

// Упрощение ломаной (Рамер — Дуглас — Пекер)
export function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let worst = 0,
    at = 0;
  const a = pts[0],
    b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > worst) (worst = d), (at = i);
  }
  if (worst <= eps) return [a, b];
  const left = rdp(pts.slice(0, at + 1), eps);
  return left.slice(0, -1).concat(rdp(pts.slice(at), eps));
}

// Равномерные точки вдоль ломаной с шагом step (концы сохраняются)
export function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let need = step,
    prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i],
      seg = dist(prev, cur);
    while (seg >= need) {
      const t = need / seg;
      prev = [lerp(prev[0], cur[0], t), lerp(prev[1], cur[1], t)];
      out.push(prev);
      seg -= need;
      need = step;
    }
    need -= seg;
    prev = cur;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

// Сглаживание углов (Чайкин), концы на месте
export function chaikin(pts, iters = 2) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i],
        b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// Углы прямоугольника (x, y — левый верхний угол до поворота, a — градусы вокруг центра)
export function rectPoly(x, y, w, h, a = 0) {
  const cx = x + w / 2,
    cy = y + h / 2,
    r = (a * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]);
}

// Дуга эллипса: углы в градусах, 0 — вправо, 90 — вниз (экранные координаты)
export function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([round1(cx + Math.cos(a) * rx), round1(cy + Math.sin(a) * ry)]);
  }
  return out;
}
export const round1 = (v) => Math.round(v * 10) / 10;

// Положение на ломаной по длине дуги s (cum — накопленные длины)
export function cumLengths(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return cum;
}
export function pathAt(pts, cum, s) {
  if (s <= 0) return pts[0];
  const total = cum[cum.length - 1];
  if (s >= total) return pts[pts.length - 1];
  let lo = 0,
    hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [lerp(pts[lo][0], pts[hi][0], t), lerp(pts[lo][1], pts[hi][1], t)];
}

// Детерминированный генератор случайных чисел (один и тот же уровень — одни и те же жуки)
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function centroid(poly) {
  let x = 0,
    y = 0;
  for (const p of poly) (x += p[0]), (y += p[1]);
  return [x / poly.length, y / poly.length];
}
