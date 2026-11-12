// Уровень «как есть» → готовый к игре: углы кусков земли, препятствия для пера, лимит чернил, звёзды.
// И «перо» — правила рисования линии. Без DOM и без физики: работает и в Node.
import { dist, polyLength, segDist, segPolyDist, pointInPoly, segSegDist, rdp, rectPoly, resample, clamp } from "./geom.js?v=8e3275de";

export const W = 1280,
  H = 720;
export const LINE_T = 10; // толщина линии для физики
export const LINE_VIEW = 14; // толщина линии на экране (чуть мягче и толще физической)
export const HERO_R = 30; // радиус Тоши и друзей в уровнях с физикой
export const WALKER_R = 25; // радиус жителя на карте «Домой»
export const HOUSE_R = 46; // в эту окружность вокруг домика должен прийти путь
export const BERRY_R = 20;
export const NEST_R = 48;

// Углы куска земли
function verts(p) {
  if (p.shape === "rect") return rectPoly(p.x, p.y, p.w, p.h, p.a || 0);
  if (p.shape === "poly") return p.pts;
  return null;
}

// Сколько чернил нужно эталону и сколько дать игроку
export function inkPlan(level) {
  const ref = level.sol.reduce((s, line) => s + polyLength(line), 0);
  const home = level.type === "home";
  const limit = level.ink || Math.round((home ? ref * 1.4 + 120 : Math.max(ref * 1.9, ref + 260)) / 10) * 10;
  const s3 = Math.min(limit, Math.round(home ? ref * 1.1 + 40 : Math.max(ref * 1.3, ref + 60)));
  const s2 = Math.min(limit, Math.round(home ? ref * 1.25 + 80 : Math.max(ref * 1.75, ref + 150)));
  return { ref: Math.round(ref), limit, s3, s2 };
}

export function starsFor(level, used) {
  if (used <= level.plan.s3 + 0.5) return 3;
  if (used <= level.plan.s2 + 0.5) return 2;
  return 1;
}

export function compile(raw, index, chapter, n) {
  const L = { ...raw, index, chapter, n, id: `${chapter + 1}-${n + 1}` };
  L.terrain = (raw.terrain || []).map((p) => ({ m: "ground", ...p, verts: verts(p) }));
  L.pegs = raw.pegs || [];
  L.nails = raw.nails || [];
  L.nodraw = raw.nodraw || [];
  L.friends = raw.friends || [];
  L.strokes = raw.strokes || (L.type === "home" ? raw.walkers.length : 1);
  L.time = raw.time || (L.type === "shield" ? 6 : L.type === "home" ? 20 : 12);
  L.seed = raw.seed || index * 7919 + 13;
  L.plan = inkPlan(L);
  L.blockers = blockersOf(L);
  return L;
}

// Всё, сквозь что линию не провести
function blockersOf(L) {
  const polys = [],
    circles = [];
  for (const p of L.terrain) {
    if (p.verts) polys.push(p.verts);
    else circles.push([p.x, p.y, p.r]);
  }
  if (L.type === "home") return { polys, circles };
  const heroR = HERO_R;
  if (L.hero) circles.push([L.hero[0], L.hero[1] - heroR, heroR]);
  for (const f of L.friends) circles.push([f[0], f[1] - heroR, heroR]);
  for (const p of L.pegs) circles.push([p[0], p[1], 9]);
  for (const b of L.bugs || []) circles.push([b.x, b.y, NEST_R]);
  for (const c of L.cannons || []) circles.push([c.x, c.y, 34]);
  for (const d of L.drops || []) polys.push(rectPoly(d.x - 22, d.y - 60, 44, 70));
  for (const i of L.icicles || []) polys.push(icicle(i));
  for (const b of L.balls || []) circles.push([b.x, b.y, b.r || 24]);
  for (const f of L.fans || []) polys.push(rectPoly(f.x - f.w / 2, f.y - 6, f.w, 26));
  const t = L.target;
  if (t) {
    if (t.k === "berry") circles.push([t.x, t.y, BERRY_R]);
    else if (t.k === "roll") circles.push([t.x, t.y, heroR]);
    else if (t.k === "star") circles.push([t.x, t.y, BERRY_R]);
  }
  if (L.lock) polys.push(rectPoly(L.lock[0] - 50, L.lock[1] - 20, 100, 110));
  if (L.house) polys.push(rectPoly(L.house[0] - 52, L.house[1] - 104, 104, 104));
  return { polys, circles };
}

export function icicle(i) {
  const [x, y, len] = i;
  return [
    [x - 13, y],
    [x + 13, y],
    [x, y + len],
  ];
}

// ---------- Перо ----------
// Точка за точкой проверяет, можно ли продолжать линию: сквозь землю, героев и запретные зоны
// линия не идёт, чернила кончаются — линия обрывается.
export class Pen {
  constructor(L, lines, inkLeft) {
    this.L = L;
    this.lines = lines; // уже нарисованные линии (ломаные)
    this.inkLeft = inkLeft;
    this.pts = [];
    this.len = 0;
    this.stop = ""; // "", "wall", "ink"
    this.home = L.type === "home";
    this.walker = -1;
    this.margin = this.home ? WALKER_R * 0.72 : LINE_T / 2 + 1;
  }
  freeSeg(a, b) {
    const L = this.L,
      m = this.margin;
    if (b[0] < 6 || b[0] > W - 6 || b[1] < 6 || b[1] > H - 6) return false;
    for (const poly of L.blockers.polys) if (segPolyDist(a, b, poly) < m) return false;
    for (const c of L.blockers.circles) if (segDist([c[0], c[1]], a, b) < c[2] + m) return false;
    for (const z of L.nodraw) {
      const poly = rectPoly(z[0], z[1], z[2], z[3]);
      if (segPolyDist(a, b, poly) < (this.home ? 4 : LINE_T / 2)) return false;
    }
    if (!this.home)
      for (const line of this.lines)
        for (let i = 1; i < line.length; i++) if (segSegDist(a, b, line[i - 1], line[i]) < LINE_T + 1) return false;
    return true;
  }
  // Начало линии. В «Домой» — только от жителя, у которого ещё нет пути.
  begin(p, taken = []) {
    if (this.home) {
      const ws = this.L.walkers;
      let best = -1,
        bd = 56;
      ws.forEach((w, i) => {
        const d = dist(p, w);
        if (!taken.includes(i) && d < bd) (bd = d), (best = i);
      });
      if (best < 0) return false;
      this.walker = best;
      this.pts = [[ws[best][0], ws[best][1]]];
      return true;
    }
    if (!this.freeSeg(p, p)) return false;
    this.pts = [p.slice()];
    return true;
  }
  // Следующая точка под пальцем. Возвращает false, когда линия больше не растёт.
  move(p) {
    if (!this.pts.length || this.stop) return false;
    const last = this.pts[this.pts.length - 1];
    let d = dist(last, p);
    if (d < (this.home ? 7 : 5)) return true;
    let q = [clamp(p[0], 7, W - 7), clamp(p[1], 7, H - 7)];
    d = dist(last, q);
    if (this.len + d > this.inkLeft) {
      const k = (this.inkLeft - this.len) / d;
      q = [last[0] + (q[0] - last[0]) * k, last[1] + (q[1] - last[1]) * k];
      d = dist(last, q);
      this.stop = "ink";
    }
    if (!this.freeSeg(last, q)) {
      // ищем последнюю свободную точку на отрезке
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const r = [last[0] + (q[0] - last[0]) * mid, last[1] + (q[1] - last[1]) * mid];
        if (this.freeSeg(last, r)) lo = mid;
        else hi = mid;
      }
      q = [last[0] + (q[0] - last[0]) * lo, last[1] + (q[1] - last[1]) * lo];
      d = dist(last, q);
      this.stop = "wall";
    }
    if (d > 0.5) {
      this.pts.push(q);
      this.len += d;
    }
    return !this.stop;
  }
  // Конец линии: короткий штрих не считается; в «Домой» путь должен закончиться у своего домика
  finish() {
    if (this.home) {
      const w = this.L.walkers[this.walker];
      const house = this.L.homes.find((h) => h[2] === w[2]);
      const end = this.pts[this.pts.length - 1];
      if (this.pts.length < 2 || !house || dist(end, house) > HOUSE_R) return { ok: false, why: this.stop === "wall" ? "wall" : "house" };
      const pts = rdp(this.pts, 1.5);
      pts.push([house[0], house[1]]);
      return { ok: true, pts, walker: this.walker, len: polyLength(pts) - dist(pts[pts.length - 2], pts[pts.length - 1]) };
    }
    if (this.len < 24) return { ok: false, why: "short" };
    let pts = rdp(this.pts, 1.2);
    // слишком близкие точки сливаем — физике так спокойнее
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) if (dist(out[out.length - 1], pts[i]) >= 4 || i === pts.length - 1) out.push(pts[i]);
    if (out.length > 2 && dist(out[out.length - 1], out[out.length - 2]) < 4) out.splice(out.length - 2, 1);
    return { ok: true, pts: out, len: this.len };
  }
}

// Провести ломаную пером так, как это сделал бы палец (для проверок и «автопилота»)
export function drawWith(L, lines, inkLeft, poly, taken = []) {
  const pen = new Pen(L, lines, inkLeft);
  const pts = resample(poly, 6);
  let i = 0;
  while (i < pts.length && !pen.begin(pts[i], taken)) i++;
  for (; i < pts.length; i++) if (!pen.move(pts[i])) break;
  return { pen, res: pen.finish() };
}

export function pointFree(L, p) {
  return new Pen(L, [], 1e9).freeSeg(p, p);
}
export { pointInPoly };
