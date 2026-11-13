// Логика «Заводного Скока» без графики: заводная игрушка сама едет по верстаку,
// по нажатию подпрыгивает, перелетает гайки, винтики и кнопки, забирается на кубики,
// собирает шестерёнки. Проверяется tests/jump.mjs (критерии GR-1…GR-4 из ТЗ).
// Мир: x — вдоль верстака (вперёд), y — вверх, единица ≈ рост игрушки.

export const STEP = 1 / 120;
export const AIR = 0.8; // полёт при одинаковой высоте отрыва и посадки, с
export const APEX = 1.6; // высота дуги прыжка
export const G = (8 * APEX) / (AIR * AIR); // 20 — ускорение вниз
export const V0 = (4 * APEX) / AIR; // 8 — толчок вверх
export const BUFFER = 0.1; // нажатие перед посадкой запоминается на столько секунд
export const COYOTE = 0.07; // съехал с кубика — ещё столько можно прыгнуть
export const HERO = { w: 0.62, h: 0.8 }; // коробка столкновений игрушки (x — середина, y — низ)
export const HIT_TIME = 1.2; // после столкновения: пауза с подсказкой, потом возврат к флажку

// Препятствия: видимый размер и опасный контур, вписанный внутрь видимого
export const KINDS = {
  nut: { w: 1.0, h: 0.66, inX: 0.11, inY: 0.12 }, // гайка на ребре
  bolt: { w: 0.52, h: 1.05, inX: 0.08, inY: 0.12 }, // винтик стоймя
  tacks: { w: 0.62, h: 0.42, inX: 0.1, inY: 0.12 }, // ряд кнопок остриём вверх, w — на одну кнопку
};

const overlap = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

// Разобрать трассу: препятствия по порядку, у каждого видимые границы и опасная коробка
export function build(def) {
  const blocks = def.things
    .filter((t) => t.kind === "block")
    .map((t) => ({ kind: "block", solid: true, x0: t.x, x1: t.x + t.w, y0: 0, y1: t.h, color: t.color }));
  const top = (x0, x1) => Math.max(0, ...blocks.filter((b) => overlap(x0, x1, b.x0, b.x1)).map((b) => b.y1));
  const out = [];
  for (const t of def.things) {
    if (t.kind === "block") {
      out.push(blocks.find((b) => b.x0 === t.x && b.x1 === t.x + t.w));
      continue;
    }
    const k = KINDS[t.kind];
    const w = k.w * (t.n || 1),
      y0 = top(t.x, t.x + w);
    out.push({ kind: t.kind, n: t.n || 1, x0: t.x, x1: t.x + w, y0, y1: y0 + k.h, hx0: t.x + k.inX, hx1: t.x + w - k.inX, hy0: y0, hy1: y0 + k.h - k.inY });
  }
  out.sort((a, b) => a.x0 - b.x0);
  out.forEach((o, i) => (o.i = i));
  return out;
}

export class Run {
  constructor(def, opts = {}) {
    this.def = def;
    this.speed = def.speed ?? 6;
    this.obs = opts.obs || build(def);
    this.blocks = this.obs.filter((o) => o.solid);
    this.gears = def.gears.map(([x, y], k) => ({ id: k, x, y }));
    this.got = new Set(); // собранные шестерёнки этого прохождения (по номеру)
    this.checks = [def.start, ...def.checks];
    this.cp = 0;
    this.t = 0;
    this.hits = 0;
    this.events = [];
    this.pressAt = -1;
    this.hit = null;
    const y = this.support(def.start);
    this.hero = { x: def.start, y, vy: 0, ground: true, lastGround: 0, takeoff: null, jumped: false };
    this.state = opts.state || "ready"; // ready — ждёт нажатия, run, hit, done
    this.end = def.end;
  }
  emit(e) {
    this.events.push(e);
  }
  // Высота опоры под игрушкой: верх кубика или верстак
  support(x) {
    const a = x - HERO.w / 2 + 0.03,
      b = x + HERO.w / 2 - 0.03;
    let s = 0;
    for (const o of this.blocks) if (overlap(a, b, o.x0, o.x1) && o.y1 > s) s = o.y1;
    return s;
  }
  // Нажатие (палец, клавиша). Удержание ничего не добавляет — прыжок только по новому нажатию.
  press() {
    if (this.state === "ready") {
      this.state = "run";
      this.emit({ type: "go" });
      return;
    }
    if (this.state !== "run") return;
    this.pressAt = this.t;
    this.tryJump();
  }
  tryJump() {
    const h = this.hero;
    const canCoyote = !h.ground && !h.jumped && this.t - h.lastGround <= COYOTE;
    if (!h.ground && !canCoyote) return false;
    h.vy = V0;
    h.ground = false;
    h.jumped = true;
    h.takeoff = h.x;
    this.pressAt = -1;
    this.emit({ type: "jump", x: h.x, y: h.y });
    return true;
  }
  step() {
    const h = this.hero;
    if (this.state === "hit") {
      this.hitTimer -= STEP;
      if (this.hitTimer <= 0) this.respawn();
      return;
    }
    if (this.state !== "run") return;
    this.t += STEP;
    const py = h.y;
    h.x += this.speed * STEP;
    if (!h.ground) {
      h.vy -= G * STEP;
      h.y += h.vy * STEP;
    }
    const sup = this.support(h.x);
    if (h.ground) {
      if (sup < h.y - 1e-6) {
        // Съехал с кубика — падает
        h.ground = false;
        h.jumped = false;
        h.vy = 0;
        h.lastGround = this.t;
      } else if (sup <= h.y + 1e-6) h.y = sup;
    } else if (h.vy <= 0 && h.y <= sup && py >= sup - 0.12) {
      h.y = sup;
      h.vy = 0;
      h.ground = true;
      h.jumped = false;
      h.lastGround = this.t;
      this.emit({ type: "land", x: h.x, y: h.y });
      // Нажал чуть раньше посадки — прыжок сразу после касания
      if (this.pressAt >= 0 && this.t - this.pressAt <= BUFFER + 1e-9) this.tryJump();
    }
    if (this.pressAt >= 0 && this.t - this.pressAt > BUFFER + 1e-9) this.pressAt = -1;
    // Столкновения
    const x0 = h.x - HERO.w / 2,
      x1 = h.x + HERO.w / 2,
      y0 = h.y,
      y1 = h.y + HERO.h;
    for (const o of this.obs) {
      if (o.x0 > x1 + 0.1) break;
      if (o.x1 < x0 - 0.1) continue;
      if (o.solid) {
        if (overlap(x0, x1, o.x0, o.x1) && y0 < o.y1 - 0.06) return this.bump(o);
      } else if (overlap(x0, x1, o.hx0, o.hx1) && overlap(y0, y1, o.hy0, o.hy1)) return this.bump(o);
    }
    // Шестерёнки: каждая считается один раз за прохождение
    for (const g of this.gears) {
      if (this.got.has(g.id) || Math.abs(g.x - h.x) > 1) continue;
      const cx = Math.max(x0, Math.min(g.x, x1)),
        cy = Math.max(y0, Math.min(g.y, y1));
      if (Math.hypot(cx - g.x, cy - g.y) <= 0.34) {
        this.got.add(g.id);
        this.emit({ type: "gear", g, n: this.got.size });
      }
    }
    // Флажки-отметки
    while (this.cp + 1 < this.checks.length && h.x >= this.checks[this.cp + 1]) {
      this.cp++;
      this.emit({ type: "check", i: this.cp, x: this.checks[this.cp] });
    }
    if (h.x >= this.end) {
      this.state = "done";
      this.emit({ type: "finish", got: this.got.size, all: this.gears.length, hits: this.hits });
    }
  }
  // Столкновение: подсветить препятствие, оставить метку отрыва, подсказать «раньше» или «позже»
  bump(o) {
    const h = this.hero;
    this.hits++;
    this.state = "hit";
    this.hitTimer = HIT_TIME;
    const advice = this.advise(o);
    this.hit = { o, takeoff: h.takeoff, advice, x: h.x, y: h.y };
    this.emit({ type: "hit", o, advice, takeoff: h.takeoff });
  }
  advise(o) {
    const h = this.hero,
      win = this.windowFor?.(o);
    if (!win) return "again";
    const [a, b] = win;
    // Последний отрыв был задолго до окна (это прыжок через прошлое препятствие) — значит, не прыгнул
    if (h.takeoff === null || h.takeoff < a - 2.6) return "jump";
    if (h.takeoff < a) return "later";
    if (h.takeoff > b) return "earlier";
    return "again";
  }
  respawn() {
    const h = this.hero,
      x = this.checks[this.cp];
    Object.assign(h, { x, y: this.support(x), vy: 0, ground: true, jumped: false, lastGround: this.t, takeoff: null });
    this.pressAt = -1;
    this.state = "ready";
    this.emit({ type: "respawn", x });
  }
}

// ---------- Окна прыжка ----------
// Для каждого препятствия — промежуток, откуда можно оттолкнуться и перелететь его.
// Ищется симуляцией той же игрушки с тем же коллайдером, потом сужается с краёв (запас для ребёнка).
function tryTakeoff(def, obs, o, tx) {
  const r = new Run(def, { obs, state: "run" });
  const y = r.support(tx);
  Object.assign(r.hero, { x: tx, y, ground: true });
  // Стоять на старте нельзя внутри опасного места
  r.press();
  if (!r.hero.jumped) return false;
  for (let k = 0; k < 6 / STEP; k++) {
    r.step();
    if (r.state === "hit") return false;
    // Кубик — забрался наверх; препятствие — пролетел и приземлился за ним
    if (o.solid ? r.hero.ground && r.hero.y >= o.y1 - 1e-6 : r.hero.ground && r.hero.x - HERO.w / 2 > o.x1) return true;
    if (r.state === "done") return true;
  }
  return false;
}
export function feasible(def, obs, o, from = 7) {
  const out = [];
  let cur = null;
  // Отрыв только с опоры перед препятствием (игрушка его ещё не касается)
  for (let tx = o.x0 - from; tx <= o.x0 - HERO.w / 2; tx += 0.02) {
    const ok = tryTakeoff(def, obs, o, tx);
    if (ok && !cur) cur = [tx, tx];
    else if (ok) cur[1] = tx;
    else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}
export function windowOf(def, obs, o, margin = 0.2) {
  const parts = feasible(def, obs, o);
  if (!parts.length) return null;
  // Самый широкий промежуток (случайные одиночные точки не в счёт)
  const [a, b] = parts.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p));
  const m = Math.max(0.08, (b - a) * margin);
  return [a + m, b - m, a, b];
}

// План автопилота: по порядку препятствий, прыжок из середины окна; препятствия, которые
// перелетаются тем же прыжком, считаются «под одним окном». Возвращает окна и их препятствия.
export function plan(def) {
  const obs = build(def);
  const r = new Run(def, { obs, state: "run" });
  const steps = [];
  const cover = new Map();
  // Следующее препятствие, через которое надо прыгать: опасное впереди или кубик выше, чем стоим
  const next = (h) => obs.find((o) => (o.solid ? o.x0 > h.x - HERO.w / 2 && o.y1 > h.y + 0.06 : o.hx1 > h.x - HERO.w / 2));
  for (let n = 0; n < 200 / STEP && r.state === "run"; n++) {
    const h = r.hero;
    const o = h.ground ? next(h) : null;
    if (o) {
      if (!o.win) o.win = windowOf(def, obs, o);
      const mid = o.win ? (o.win[0] + o.win[1]) / 2 : null;
      if (mid !== null && h.x >= mid - 1e-6) {
        steps.push({ o, a: o.win[0], b: o.win[1], fa: o.win[2], fb: o.win[3], x: h.x, covers: [] });
        r.press();
      }
    }
    r.step();
    // Что пролетели последним прыжком
    const last = steps[steps.length - 1];
    if (last && !r.hero.ground)
      for (const o of obs)
        if (o.x0 < r.hero.x + HERO.w / 2 && o.x1 > last.x && !cover.has(o.i)) {
          cover.set(o.i, last);
          last.covers.push(o.i);
        }
  }
  // Окно для подсказки «раньше/позже» после столкновения с препятствием
  const windowFor = (o) => {
    const s = cover.get(o.i) || steps.find((q) => q.o === o);
    return s ? [s.a, s.b] : null;
  };
  return { obs, steps, cover, windowFor, done: r.state === "done", run: r };
}
