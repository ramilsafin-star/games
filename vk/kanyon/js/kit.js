// Общие мелочи для сцены: материалы, заготовки геометрии, мягкое пятно света.
import * as T from "../vendor/three/three.module.min.js?v=a9e9d095";

export { T };
export const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = T.MathUtils.clamp;
export const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
// Цвет ярче белого светится через bloom.
export const hot = (hex, k = 3) => new T.Color(hex).multiplyScalar(k);
export const metal = (color, extra = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.36, flatShading: true, ...extra });
export const lit = (hex, k = 3) => new T.MeshBasicMaterial({ color: hot(hex, k), toneMapped: false });

export const GEO = {
  ball: new T.SphereGeometry(1, 14, 10),
  low: new T.IcosahedronGeometry(1, 0),
  oct: new T.OctahedronGeometry(1, 0),
  box: new T.BoxGeometry(1, 1, 1),
  cone: new T.ConeGeometry(1, 1, 6),
  cyl: new T.CylinderGeometry(1, 1, 1, 10),
  hex: new T.CylinderGeometry(1, 1, 1, 6),
  ring: new T.TorusGeometry(1, 0.12, 6, 28),
  wave: new T.TorusGeometry(1, 0.025, 5, 32),
};
export const part = (geo, material, sx, sy, sz) => {
  const m = new T.Mesh(geo, material);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  return m;
};
export const at = (m, x, y, z) => (m.position.set(x, y, z), m);
// Цилиндры и конусы в three стоят вдоль Y; кладём их вдоль взгляда (ось −Z).
export const along = (m) => ((m.rotation.x = -Math.PI / 2), m);

const glowCanvas = document.createElement("canvas");
glowCanvas.width = glowCanvas.height = 64;
const glowContext = glowCanvas.getContext("2d");
const radial = glowContext.createRadialGradient(32, 32, 1, 32, 32, 32);
radial.addColorStop(0, "rgba(255,255,255,1)");
radial.addColorStop(0.27, "rgba(255,255,255,.56)");
radial.addColorStop(0.62, "rgba(255,255,255,.12)");
radial.addColorStop(1, "rgba(255,255,255,0)");
glowContext.fillStyle = radial;
glowContext.fillRect(0, 0, 64, 64);
export const glowTexture = new T.CanvasTexture(glowCanvas);

export function flare(color, width, height = width, extra = {}) {
  const sprite = new T.Sprite(
    new T.SpriteMaterial({
      color,
      map: glowTexture,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      ...extra,
    }),
  );
  sprite.scale.set(width, height, 1);
  return sprite;
}

// Модель убирается со сцены вместе со своими материалами. Геометрия из GEO общая и остаётся.
export function removeModel(model) {
  model.removeFromParent();
  const materials = new Set();
  model.traverse((node) => {
    if (node.material) materials.add(node.material);
  });
  for (const material of materials) material.dispose();
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
