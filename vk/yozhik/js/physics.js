// Физика «Почтовой горки». Рельс — ломаная линия, вагончик едет по ней, как бусина по проволоке:
// колёса держат его и в петле. На конце рельса без продолжения он слетает и летит, пока не поймается
// другим рельсом, не доедет до станции или не упадёт. Шаг всегда 1/120 с — заезд повторяется точно,
// при любой частоте кадров. Модуль без three.js, чтобы проверять уровни в node (tests/levels.mjs).

export const G = 12; // ускорение свободного падения, единиц/с²
export const DT = 1 / 120;
const MU = 0.014; // трение качения
const DRAG = 0.0045; // сопротивление воздуха
const PUSH = 2.2; // толчок на старте
export const SNAP = 0.95; // на таком расстоянии конец линии примагничивается к станции или другой линии
const STEP = 0.2; // шаг точек готового рельса
const CLEAR = 0.3; // рельс не ниже этого над землёй
export const RING_R = 0.62; // кольцо засчитано, если центр вагончика прошёл ближе
const BOOST_V = 13; // скорость после ускорителя
export const START_RAIL = 2.4; // длина рельса на почте

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------- Карта ----------
// Высота земли под точкой x (по ломаной профиля)
export function groundAt(level, x) {
  const g = level.ground;
  if (x <= g[0][0]) return g[0][1];
  for (let i = 1; i < g.length; i++)
    if (x <= g[i][0]) {
      const [x0, y0] = g[i - 1],
        [x1, y1] = g[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  return g.at(-1)[1];
}
export function waterAt(level, x) {
  for (const w of level.water || []) if (x >= w[0] && x <= w[1]) return w[2];
  return -Infinity;
}
// Площадки почты и станции: [x0, x1, верх]
export function platforms(level) {
  const [sx, sy] = level.start,
    [fx, fy] = level.finish;
  return { start: [sx - START_RAIL - 0.2, sx, sy], finish: [fx, fx + 2.6, fy] };
}
function inPoly(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Пересечение отрезков ab и cd: доля пути по ab (0…1) или -1
function cross(a, b, c, d) {
  const r = sub(b, a),
    s = sub(d, c),
    den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return -1;
  const q = sub(c, a),
    t = (q[0] * s[1] - q[1] * s[0]) / den,
    u = (q[0] * r[1] - q[1] * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}
const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
const rect = ([x0, y0, x1, y1]) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
// Камни и «нельзя рисовать» — многоугольники; для проверки линии и полёта
function blockers(level, withNoDraw) {
  const out = [...(level.rocks || [])];
  if (withNoDraw) for (const r of level.nodraw || []) out.push(rect(r));
  return out;
}
export function blockedSegment(level, a, b, withNoDraw = true) {
  for (const poly of blockers(level, withNoDraw)) {
    if (inPoly(poly, b) || inPoly(poly, a)) return true;
    for (const [c, d] of edges(poly)) if (cross(a, b, c, d) >= 0) return true;
  }
  return false;
}
// Можно ли поставить сюда точку линии (палец над камнем или в запретной зоне — нельзя)
export function canDraw(level, p) {
  if (p[0] < 0.2 || p[0] > level.size[0] - 0.2 || p[1] > level.size[1] + 1) return false;
  return !blockers(level, true).some((poly) => inPoly(poly, p));
}

// ---------- Линия пальца → рельс ----------
// Точки, к которым примагничиваются концы новой линии
export function anchors(level, rails) {
  const out = [level.start, level.finish];
  if (level.boost) out.push(level.boost[0], level.boost[1]);
  for (const r of rails) if (r.kind === "user") out.push(r.pts[0], r.pts.at(-1));
  return out;
}
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i],
      l = dist(a, b);
    let t = step - carry;
    while (t <= l) {
      out.push([a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l]);
      t += step;
    }
    carry = l - (t - step);
  }
  const last = pts.at(-1);
  if (dist(out.at(-1), last) > step * 0.35) out.push(last);
  else out[out.length - 1] = last;
  return out;
}
function smooth(pts, passes) {
  let p = pts;
  for (let k = 0; k < passes; k++)
    p = p.map((q, i) => {
      if (i === 0 || i === p.length - 1) return q;
      const a = p[Math.max(0, i - 2)],
        b = p[i - 1],
        c = p[i + 1],
        d = p[Math.min(p.length - 1, i + 2)];
      return [(a[0] + 2 * b[0] + 4 * q[0] + 2 * c[0] + d[0]) / 10, (a[1] + 2 * b[1] + 4 * q[1] + 2 * c[1] + d[1]) / 10];
    });
  return p;
}
// Сдвинуть конец линии в точку, плавно подтягивая соседние точки
function pull(pts, fromEnd, target) {
  const n = pts.length,
    end = fromEnd ? pts[n - 1] : pts[0],
    d = sub(target, end);
  let along = 0;
  for (let k = 0; k < n; k++) {
    const i = fromEnd ? n - 1 - k : k;
    if (k) along += dist(pts[i], pts[fromEnd ? i + 1 : i - 1]);
    const w = Math.max(0, 1 - along / 1.1);
    if (!w) break;
    pts[i] = [pts[i][0] + d[0] * w, pts[i][1] + d[1] * w];
  }
  pts[fromEnd ? n - 1 : 0] = [...target];
}
// Сырые точки пальца → гладкий рельс. null, если линия слишком короткая
export function processStroke(raw, level, rails) {
  if (raw.length < 2) return null;
  let length = 0;
  for (let i = 1; i < raw.length; i++) length += dist(raw[i - 1], raw[i]);
  if (length < 0.6) return null;
  let pts = smooth(resample(raw, 0.1), 8);
  pts = resample(pts, STEP);
  // Не ниже земли
  pts = pts.map(([x, y]) => [x, Math.max(y, groundAt(level, x) + CLEAR, waterAt(level, x) + CLEAR)]);
  // Концы примагничиваются к почте, станции, ускорителю и концам других линий
  const list = anchors(level, rails);
  for (const fromEnd of [false, true]) {
    const end = fromEnd ? pts.at(-1) : pts[0];
    let best = null,
      bd = SNAP;
    for (const a of list) {
      const d = dist(a, end);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    if (best) pull(pts, fromEnd, best);
  }
  if (dist(pts[0], pts.at(-1)) < 1e-6 && pts.length < 4) return null;
  return pts;
}

// Потянуть кончик готового рельса: кончик едет к пальцу, ближние точки плавно за ним.
// Рядом с почтой, станцией или концом другого рельса кончик примагничивается (others — остальные рельсы)
export function bendRail(level, pts, fromEnd, target, others) {
  let t = [...target],
    snapped = false,
    bd = SNAP;
  for (const a of anchors(level, others)) {
    const d = dist(a, t);
    if (d < bd) {
      bd = d;
      t = [...a];
      snapped = true;
    }
  }
  const n = pts.length,
    end = fromEnd ? pts[n - 1] : pts[0],
    d = [t[0] - end[0], t[1] - end[1]];
  const reach = Math.max(1.2, Math.min(4, Math.hypot(...d) * 1.8));
  const out = pts.map((p) => [...p]);
  let along = 0;
  for (let k = 0; k < n; k++) {
    const i = fromEnd ? n - 1 - k : k;
    if (k) along += dist(pts[i], pts[fromEnd ? i + 1 : i - 1]);
    const u = Math.max(0, 1 - along / reach);
    if (!u) break;
    const w = u * u * (3 - 2 * u);
    out[i] = [pts[i][0] + d[0] * w, pts[i][1] + d[1] * w];
  }
  out[fromEnd ? n - 1 : 0] = t;
  let res = resample(out, STEP).map(([x, y], i, a) => (snapped && (fromEnd ? i === a.length - 1 : i === 0) ? [x, y] : [x, Math.max(y, groundAt(level, x) + CLEAR, waterAt(level, x) + CLEAR)]));
  return { pts: res, snapped };
}

// ---------- Сеть рельсов ----------
export function makeRail(pts, kind, id) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { id, kind, pts, cum, len: cum.at(-1) };
}
// Постоянные рельсы уровня: на почте, на станции, ускоритель
export function fixedRails(level) {
  const [sx, sy] = level.start,
    [fx, fy] = level.finish;
  const out = [makeRail([[sx - START_RAIL, sy + 0.42], [sx - START_RAIL * 0.5, sy + 0.16], [sx, sy]], "start", "start"), makeRail([[fx, fy], [fx + 2.4, fy]], "finish", "finish")];
  if (level.boost) out.push(makeRail(level.boost, "boost", "boost"));
  return out;
}
// Точка и направление на рельсе по длине s
export function railAt(rail, s) {
  const { pts, cum } = rail;
  s = Math.max(0, Math.min(rail.len, s));
  let lo = 0,
    hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const a = pts[lo],
    b = pts[hi],
    l = cum[hi] - cum[lo] || 1,
    f = (s - cum[lo]) / l;
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], i: lo };
}

// ---------- Заезд ----------
// events — что случилось за шаг: ring, leave, land, boost, finish, fail; игра превращает их в звук и картинку
export class Run {
  constructor(level, userRails) {
    this.level = level;
    this.rails = [...fixedRails(level), ...userRails];
    this.mode = "rail";
    this.rail = this.rails[0];
    this.s = 0.15;
    this.v = PUSH;
    this.t = 0;
    this.rings = new Set();
    this.trace = [];
    this.events = [];
    this.turn = null;
    this.ignore = null;
    this.result = null;
    // Трюки: петля (вагончик повернулся на полный круг), полёт, тоннель, ракета
    this.tricks = new Set();
    this.spin = 0;
    this.airTime = 0;
    this.speed = PUSH;
    this.pos = railAt(this.rail, this.s).p;
    this.dir = railAt(this.rail, this.s).t;
    this.plat = platforms(level);
  }
  emit(e) {
    this.events.push(e);
  }
  trick(name) {
    if (this.tricks.has(name)) return;
    this.tricks.add(name);
    this.emit({ type: "trick", name });
  }
  fail(reason, at) {
    if (this.result) return;
    this.result = { ok: false, reason, at: [...at], rings: [...this.rings], tricks: [...this.tricks] };
    this.mode = "fail";
    this.emit({ type: "fail", reason, at: [...at] });
  }
  finish() {
    if (this.result) return;
    this.result = { ok: true, rings: [...this.rings], tricks: [...this.tricks], time: this.t };
    this.emit({ type: "finish" });
  }
  // Конец рельса: продолжение (рельс с концом в этой точке) или полёт
  next(rail, atEnd) {
    const p = atEnd ? rail.pts.at(-1) : rail.pts[0];
    const dir = railAt(rail, atEnd ? rail.len : 0).t.map((c) => (atEnd ? c : -c));
    let best = null,
      score = -2;
    for (const r of this.rails) {
      if (r === rail) continue;
      for (const end of [false, true]) {
        const q = end ? r.pts.at(-1) : r.pts[0];
        if (dist(p, q) > 1e-3) continue;
        const t = railAt(r, end ? r.len : 0).t.map((c) => (end ? -c : c));
        const d = t[0] * dir[0] + t[1] * dir[1];
        if (d > score) {
          score = d;
          best = { r, end };
        }
      }
    }
    return best;
  }
  step() {
    if (this.mode === "fail" || this.mode === "done") return;
    this.t += DT;
    const prev = this.pos;
    if (this.mode === "rail") this.stepRail();
    else if (this.mode === "air") this.stepAir();
    else if (this.mode === "brake") this.stepBrake();
    // Кольца с печатями
    for (let i = 0; i < this.level.rings.length; i++) {
      if (this.rings.has(i)) continue;
      if (segDist(this.level.rings[i], prev, this.pos) < RING_R) {
        this.rings.add(i);
        this.emit({ type: "ring", i });
      }
    }
    const tun = this.level.tunnel;
    if (tun && this.pos[0] > (tun[0] + tun[1]) / 2 && this.pos[1] > tun[2] && this.pos[1] < tun[3]) this.trick("tunnel");
    if (Math.round(this.t / DT) % 4 === 0) this.trace.push([...this.pos]);
    if (this.t > 40 && !this.result) this.fail("slow", this.pos);
  }
  stepRail() {
    const rail = this.rail;
    if (rail.kind === "finish") {
      this.mode = "brake";
      this.finish();
      return;
    }
    const here = railAt(rail, this.s);
    let v = this.v - G * here.t[1] * DT;
    const fr = (MU * G + DRAG * v * v) * DT;
    v = Math.sign(v) * Math.max(0, Math.abs(v) - fr);
    if (rail.kind === "boost") {
      // Ракета срабатывает при любом въезде, разгоняет до BOOST_V (быстрее — не тормозит)
      if (!this.boosted) {
        this.emit({ type: "boost" });
        this.trick("rocket");
      }
      this.boosted = true;
      if (Math.abs(v) < BOOST_V) v = (v >= 0 ? 1 : -1) * BOOST_V;
    }
    // Разворот: вагончик не заехал на горку
    if (Math.sign(v) !== Math.sign(this.v) && this.v !== 0) {
      if (!this.turn) {
        this.turn = { at: [...here.p], t: this.t };
        this.emit({ type: "turn", at: [...here.p] });
      }
    }
    if (this.turn && this.t - this.turn.t > 1.6) return this.fail("slow", this.turn.at);
    if (Math.abs(v) < 0.04) {
      this.still = (this.still || 0) + DT;
      if (this.still > 1) return this.fail("slow", this.turn ? this.turn.at : here.p);
    } else this.still = 0;
    this.v = v;
    this.s += v * DT;
    // Переход на следующий рельс или полёт
    for (let guard = 0; guard < 4 && (this.s > rail.len || this.s < 0); guard++) {
      const atEnd = this.s > this.rail.len,
        over = atEnd ? this.s - this.rail.len : -this.s;
      const nx = this.next(this.rail, atEnd);
      if (nx) {
        this.rail = nx.r;
        this.s = nx.end ? nx.r.len - over : over;
        this.v = (nx.end ? -1 : 1) * Math.abs(this.v);
        if (nx.r.kind === "finish") break;
        continue;
      }
      if (this.rail.kind === "start" && !atEnd) {
        // Упор у почты
        this.s = 0;
        this.v = Math.abs(this.v) * 0.3;
        break;
      }
      const r = this.rail,
        end = railAt(r, atEnd ? r.len : 0),
        back = railAt(r, atEnd ? Math.max(0, r.len - 0.6) : Math.min(r.len, 0.6));
      let d = [end.p[0] - back.p[0], end.p[1] - back.p[1]];
      const dl = Math.hypot(...d) || 1;
      d = [d[0] / dl, d[1] / dl];
      this.mode = "air";
      this.airTime = 0;
      this.pos = end.p;
      this.vel = [d[0] * Math.abs(this.v), d[1] * Math.abs(this.v)];
      this.ignore = { rail: this.rail, until: this.t + 0.15 };
      this.emit({ type: "leave", at: [...end.p] });
      this.speed = Math.abs(this.v);
      this.dir = [this.vel[0] / (this.speed || 1), this.vel[1] / (this.speed || 1)];
      return;
    }
    const now = railAt(this.rail, this.s);
    this.pos = now.p;
    const sg = this.v >= 0 ? 1 : -1;
    const prevDir = this.dir;
    this.dir = [now.t[0] * sg, now.t[1] * sg];
    this.speed = Math.abs(this.v);
    if (prevDir) {
      const da = Math.atan2(prevDir[0] * this.dir[1] - prevDir[1] * this.dir[0], prevDir[0] * this.dir[0] + prevDir[1] * this.dir[1]);
      // Разворот назад (не заехал) — не поворот по кругу
      if (Math.abs(da) < 1.5) this.spin += da;
      if (Math.abs(this.spin) > Math.PI * 2 - 0.35) this.trick("loop");
    }
  }
  stepAir() {
    const vel = this.vel;
    this.airTime += DT;
    vel[1] -= G * DT;
    const a = this.pos,
      b = [a[0] + vel[0] * DT, a[1] + vel[1] * DT];
    // Ловит ли рельс
    let hit = null;
    for (const r of this.rails) {
      if (this.ignore && r === this.ignore.rail && this.t < this.ignore.until) continue;
      for (let i = 1; i < r.pts.length; i++) {
        const f = cross(a, b, r.pts[i - 1], r.pts[i]);
        if (f >= 0 && (!hit || f < hit.f)) hit = { f, r, i };
      }
    }
    if (hit) {
      const { r, i, f } = hit;
      const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const seg = sub(r.pts[i], r.pts[i - 1]),
        l = Math.hypot(...seg),
        t = [seg[0] / l, seg[1] / l];
      const sp = Math.hypot(...vel),
        vt = vel[0] * t[0] + vel[1] * t[1];
      if (r.kind === "finish" || Math.abs(vt) / sp >= 0.25) {
        if (this.airTime > 0.55) this.trick("jump");
        this.mode = "rail";
        this.rail = r;
        this.s = r.cum[i - 1] + dist(r.pts[i - 1], p);
        this.v = vt * 0.92;
        this.pos = p;
        this.turn = null;
        this.emit({ type: "land", at: [...p], speed: sp });
        return;
      }
      this.pos = p;
      return this.fail("crash", p);
    }
    // Станция: приземлился на площадку
    const [fx0, fx1, fy] = this.plat.finish;
    if (b[0] >= fx0 && b[0] <= fx1 && a[1] >= fy && b[1] < fy) {
      const r = this.rails.find((q) => q.kind === "finish");
      if (this.airTime > 0.55) this.trick("jump");
      this.mode = "rail";
      this.rail = r;
      this.s = Math.max(0, Math.min(r.len, b[0] - fx0));
      this.v = vel[0];
      this.pos = [b[0], fy];
      this.emit({ type: "land", at: [...this.pos], speed: Math.hypot(...vel) });
      return;
    }
    if (blockedSegment(this.level, a, b, false)) return this.fail("crash", a);
    const [sx0, sx1, sy] = this.plat.start;
    if ((b[0] >= sx0 && b[0] <= sx1 && b[1] < sy) || (b[0] >= fx0 && b[0] <= fx1 && b[1] < fy)) return this.fail("crash", b);
    if (b[1] <= waterAt(this.level, b[0])) {
      this.pos = b;
      return this.fail("water", b);
    }
    if (b[1] <= groundAt(this.level, b[0])) {
      this.pos = [b[0], groundAt(this.level, b[0])];
      return this.fail("crash", this.pos);
    }
    if (b[0] < -2 || b[0] > this.level.size[0] + 2 || b[1] < -3) return this.fail("away", a);
    this.pos = b;
    this.speed = Math.hypot(...vel);
    this.dir = [vel[0] / this.speed, vel[1] / this.speed];
  }
  // На станции вагончик тормозит до остановки (только для красоты, результат уже есть)
  stepBrake() {
    const r = this.rail;
    const v = this.v,
      dv = 9 * DT;
    this.v = Math.abs(v) <= dv ? 0 : v - Math.sign(v) * dv;
    this.s = Math.max(0.3, Math.min(r.len - 0.3, this.s + this.v * DT));
    if (this.s === 0.3 || this.s === r.len - 0.3) this.v = 0;
    const now = railAt(r, this.s);
    this.pos = now.p;
    this.speed = Math.abs(this.v);
    this.dir = this.v >= 0 ? now.t : [-now.t[0], -now.t[1]];
    if (this.v === 0) this.mode = "done";
  }
}
// Расстояние от точки до отрезка
function segDist(p, a, b) {
  const ab = sub(b, a),
    l2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
}
// Заезд целиком (для проверок): результат и путь
export function simulate(level, userRails, maxSeconds = 45) {
  const run = new Run(level, userRails);
  for (let i = 0; i < maxSeconds / DT && !run.result; i++) run.step();
  return run.result || { ok: false, reason: "slow", at: run.pos, rings: [...run.rings] };
}
// Начало будущих прыжков: заезд «в уме» до первых трёх полётов, по 0.45 с каждого.
// Ребёнок видит, куда вагончик полетит с трамплина, но не весь путь.
export function predictJumps(level, userRails, show = 0.45) {
  const run = new Run(level, userRails);
  const arcs = [];
  let cur = null;
  for (let i = 0; i < 8 / DT && !run.result && arcs.length <= 3; i++) {
    run.step();
    if (run.mode === "air") {
      if (!cur) arcs.push((cur = [[...run.pos]]));
      else if (run.airTime < show) cur.push([...run.pos]);
    } else cur = null;
    run.events.length = 0;
  }
  return arcs.slice(0, 3);
}
// Линия пальца в виде редких точек → плотные «сырые» точки по плавной кривой (Катмулл — Ром),
// как провёл бы настоящий палец
export function fingerPath(points, step = 0.12) {
  const out = [points[0]];
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1),
      p1 = P(i),
      p2 = P(i + 1),
      p3 = P(i + 2);
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
// Нарисовать решение уровня (массив линий из редких точек) так же, как рисует палец
export function drawStrokes(level, strokes) {
  const rails = [];
  strokes.forEach((s, k) => {
    const pts = processStroke(fingerPath(s), level, rails);
    if (pts) rails.push(makeRail(pts, "user", "u" + k));
  });
  return rails;
}
