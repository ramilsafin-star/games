// Общие мелочи: three.js, сборка моделей из простых тел, хранилище.
import * as T from "../vendor/three/three.module.min.js?v=935ab875";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=935ab875";

export { T };
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// треугольная призма (крыши): сечение в плоскости XY, длина вдоль Z
function prismGeometry() {
  const shape = new T.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.lineTo(-0.5, 0);
  const g = new T.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}
// Заготовки: единичные тела, из них складываются все модели
export const PRIM = {
  box: new T.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  soft: new RoundedBoxGeometry(1, 1, 1, 3, 0.3),
  cyl: new T.CylinderGeometry(1, 1, 1, 16),
  cyl8: new T.CylinderGeometry(1, 1, 1, 8),
  cone: new T.ConeGeometry(1, 1, 16),
  pyr: new T.ConeGeometry(1, 1, 4),
  ball: new T.SphereGeometry(1, 14, 10),
  lump: new T.IcosahedronGeometry(1, 1),
  ring: new T.TorusGeometry(1, 0.14, 8, 24),
  prism: prismGeometry(),
};
// клинья для полосатых шатров и крыш
const wedges = new Map();
export function wedge(kind, slices, k) {
  const key = kind + slices + ":" + k;
  if (!wedges.has(key)) {
    const a = (k / slices) * TAU, w = TAU / slices;
    wedges.set(key, kind === "cone" ? new T.ConeGeometry(1, 1, 4, 1, true, a, w) : new T.CylinderGeometry(1, 1, 1, 4, 1, true, a, w));
  }
  return wedges.get(key);
}

const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), vp = new T.Vector3(), vs = new T.Vector3();
const col = new T.Color();

// Модель из деталей. add(геометрия, цвет, [x,y,z], [sx,sy,sz], [rx,ry,rz]).
export class Shape {
  constructor() {
    this.parts = [];
  }
  add(geo, color, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) {
    const g = typeof geo === "string" ? PRIM[geo] : geo;
    if (typeof s === "number") s = [s, s, s];
    e.set(r[0], r[1], r[2]);
    q.setFromEuler(e);
    m4.compose(vp.set(p[0], p[1], p[2]), q, vs.set(s[0], s[1], s[2]));
    this.parts.push({ g, color, matrix: m4.clone() });
    return this;
  }
  // готовая геометрия: позиции, нормали, цвета; низ чуть темнее — «тень у земли»
  build(ao = true) {
    let vertices = 0, indices = 0;
    for (const p of this.parts) {
      vertices += p.g.attributes.position.count;
      indices += p.g.index ? p.g.index.count : p.g.attributes.position.count;
    }
    const pos = new Float32Array(vertices * 3), nor = new Float32Array(vertices * 3), cols = new Float32Array(vertices * 3);
    const idx = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let vo = 0, io = 0;
    const v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    for (const p of this.parts) {
      const P = p.g.attributes.position, N = p.g.attributes.normal;
      nm.getNormalMatrix(p.matrix);
      col.set(p.color);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
        n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        const k = vo + i;
        pos[k * 3] = v.x;
        pos[k * 3 + 1] = v.y;
        pos[k * 3 + 2] = v.z;
        nor[k * 3] = n.x;
        nor[k * 3 + 1] = n.y;
        nor[k * 3 + 2] = n.z;
        const shade = ao ? 0.66 + 0.34 * smooth(0, 0.7, v.y) : 1;
        cols[k * 3] = col.r * shade;
        cols[k * 3 + 1] = col.g * shade;
        cols[k * 3 + 2] = col.b * shade;
      }
      if (p.g.index) for (let i = 0; i < p.g.index.count; i++) idx[io + i] = p.g.index.getX(i) + vo;
      else for (let i = 0; i < P.count; i++) idx[io + i] = vo + i;
      vo += P.count;
      io += p.g.index ? p.g.index.count : P.count;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.BufferAttribute(nor, 3));
    g.setAttribute("color", new T.BufferAttribute(cols, 3));
    g.setIndex(new T.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Холст-текстура
export function canvasTexture(w, h, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d"), w, h);
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  return t;
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
    // игра работает и там, где сохранение запрещено
  }
}
