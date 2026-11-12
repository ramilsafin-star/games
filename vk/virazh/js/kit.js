// Мелочи без графики: математика, случайность с зерном, хранилище. Работает и в Node.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Угол в диапазоне (−π, π]
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
// Доля пути к цели за dt при «скорости догона» rate (не зависит от частоты кадров)
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 83.456 → «1:23.45»
export function clock(t) {
  if (!isFinite(t) || t < 0) return "—";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
}

export function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Игра работает и в браузере, запретившем сохранение.
  }
}
