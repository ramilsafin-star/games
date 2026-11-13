// Мелочи без графики: математика, случайные числа с зерном. Работает и в браузере, и в Node (тесты).
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// угол в пределах -PI..PI
export const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
// поворот угла a к b не быстрее step
export function turnTo(a, b, step) {
  const d = wrap(b - a);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
export const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
// направление взгляда по рысканию и тангажу (как у камеры three.js с порядком YXZ)
export function lookDir(yaw, pitch, out = [0, 0, 0]) {
  const c = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * c;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * c;
  return out;
}
// рыскание, при котором смотришь из (ax,az) на (bx,bz)
export const yawTo = (ax, az, bx, bz) => Math.atan2(-(bx - ax), -(bz - az));

// Генератор с зерном (mulberry32): одинаковое зерно — одинаковая игра
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (list) => list[Math.floor(r() * list.length)];
  r.chance = (p) => r() < p;
  // нормальное распределение (Бокс — Мюллер)
  r.gauss = () => Math.sqrt(-2 * Math.log(1 - r() * 0.999999)) * Math.cos(TAU * r());
  return r;
}
// зерно из строки (для задания дня)
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
export const fmtNum = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
