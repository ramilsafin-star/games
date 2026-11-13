// Общие мелочи графики: three.js, числа, хранилище, шум для шейдеров.
import * as T from "../vendor/three/three.module.min.js?v=16ea7301";

export { T };
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// плавное приближение, не зависящее от частоты кадров
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

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
  } catch {}
}

// Высота земли: поляна и лес ровные, за краем карты — холмы, они закрывают горизонт
export function groundY(x, z) {
  const r = Math.hypot(x, z);
  if (r < 196) return 0;
  const k = (r - 196) / 60;
  const a = Math.atan2(z, x);
  return k * k * (16 + Math.sin(a * 7) * 6 + Math.sin(a * 13 + 2) * 4) + k * 3;
}

// цвет из "#rrggbb" с яркостью k (k > 1 — светится, ловит свечение)
export const hot = (hex, k = 1) => new T.Color(hex).multiplyScalar(k);

// GLSL: шум и fbm для своих шейдеров
export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

// Мягкий круглый блик на холсте: для спрайтов (облака, дым)
export function blobTexture(size = 64, soft = 0.5) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(soft, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
