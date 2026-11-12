// «Снежный ком»: общие правила без графики и без DOM — их же гоняют проверки в Node.
// Координаты трассы: s — путь вдоль трассы вперёд, x — смещение вбок от оси (минус — влево),
// y — высота низа кома над снегом.

export const HALF = 7; // полуширина обычной трассы
export const LATERAL = 15; // предельная скорость кома вбок, ед/с
export const GRAVITY = 26;
export const JUMP = 10.5; // скорость взлёта с трамплина
export const AIR_TIME = (2 * JUMP) / GRAVITY;
export const BRIDGE_HALF = 3; // мост: центр кома должен оставаться над ним
export const MAX_SIZE = 99999;
export const START = 5; // ком на старте без улучшений
export const MAX_R = 2.1;

// Радиус кома от размера: растёт заметно и дальше, но не шире трети трассы.
export function radiusOf(size) {
  return Math.min(MAX_R, 0.42 + 0.25 * Math.log(1 + Math.max(0, size) / 4));
}

// ---------- Ворота ----------
// op = { k: "+" | "-" | "*" | "/", v: число }
export function applyGate(op, size) {
  let next = size;
  if (op.k === "+") next = size + op.v;
  else if (op.k === "-") next = size - op.v;
  else if (op.k === "*") next = size * op.v;
  else if (op.k === "/") next = Math.floor(size / op.v);
  return Math.max(0, Math.min(MAX_SIZE, Math.round(next)));
}
export const isGood = (op) => op.k === "+" || op.k === "*";
export function gateLabel(op) {
  const sign = { "+": "+", "-": "−", "*": "×", "/": "÷" }[op.k];
  return sign + op.v;
}

// ---------- Препятствия ----------
// frac — доля размера, которую отнимает удар, min — не меньше стольких, h — высота (ком в прыжке
// выше неё пролетает поверх).
export const HAZARDS = {
  rock: { frac: 0.15, min: 1, h: 1.2, name: "Камень" },
  fence: { frac: 0.1, min: 1, h: 1.15, name: "Забор" },
  spikes: { frac: 0.18, min: 1, h: 1.0, name: "Сосульки" },
  log: { frac: 0.18, min: 1, h: 1.2, name: "Бревно" },
  hole: { frac: 0.35, min: 2, h: 0.05, name: "Трещина" },
  crusher: { frac: 0.25, min: 2, h: 99, name: "Ледяной пресс" },
  geyser: { frac: 0.22, min: 2, h: 99, name: "Гейзер" },
};
export function damage(kind, size) {
  const h = HAZARDS[kind];
  return Math.max(h.min, Math.ceil(size * h.frac));
}

// ---------- Движущиеся препятствия: состояние зависит только от времени ----------
const frac = (u) => u - Math.floor(u);
// Бревно катится поперёк трассы туда-обратно
export function logX(item, t) {
  const u = frac(t / item.period + item.phase);
  const k = 1 - Math.abs(2 * u - 1);
  return item.xa + (item.xb - item.xa) * k;
}
// Пресс: 1 — поднят, 0 — у самой земли
export function crusherLift(item, t) {
  const u = frac(t / item.period + item.phase);
  if (u < 0.42) return 1;
  if (u < 0.52) return 1 - ((u - 0.42) / 0.1) ** 2;
  if (u < 0.82) return 0;
  return (u - 0.82) / 0.18;
}
export const crusherDown = (item, t) => crusherLift(item, t) < 0.4;
// Гейзер: 0 — тихо, 1 — бурлит (безопасно, предупреждение), 2 — бьёт паром
export function geyserState(item, t) {
  const u = frac(t / item.period + item.phase);
  return u < 0.5 ? 0 : u < 0.68 ? 1 : 2;
}

// Задевает ли ком (центр s, x; низ на высоте y; радиус r) препятствие в момент t
export function touches(item, s, x, y, r, t) {
  switch (item.t) {
    case "rock":
      return y < HAZARDS.rock.h && Math.hypot(s - item.s, x - item.x) < r * 0.9 + item.r;
    case "hole":
      return y < HAZARDS.hole.h && Math.abs(s - item.s) < item.r && Math.abs(x - item.x) < item.r + r * 0.15 - 0.25;
    case "fence":
    case "spikes":
      if (y >= HAZARDS[item.t].h) return false;
      return boxHit(s, x, r, item.s - item.len / 2, item.s + item.len / 2, item.x0, item.x1);
    case "log": {
      if (y >= HAZARDS.log.h) return false;
      const c = logX(item, t);
      return boxHit(s, x, r, item.s - item.len / 2, item.s + item.len / 2, c - 0.6, c + 0.6);
    }
    case "crusher":
      return crusherDown(item, t) && boxHit(s, x, r * 0.85, item.s - item.len / 2, item.s + item.len / 2, item.x0, item.x1);
    case "geyser":
      return geyserState(item, t) === 2 && Math.hypot(s - item.s, x - item.x) < r * 0.85 + item.r;
  }
  return false;
}
function boxHit(s, x, r, s0, s1, x0, x1) {
  const ds = s < s0 ? s0 - s : s > s1 ? s - s1 : 0;
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  return ds * ds + dx * dx < r * r * 0.81;
}

// ---------- Случайные числа с зерном ----------
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
export function hash(n) {
  let h = 2166136261 ^ n;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
