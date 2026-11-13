// Общие помощники графики: three.js, сборка моделей из простых тел, текстуры на холсте.
import * as T from "../vendor/three/three.module.min.js?v=cb8e2b87";

export { T };
export const TAU = Math.PI * 2;

// Заготовки тел
export const PRIM = {
  box: new T.BoxGeometry(1, 1, 1),
  cyl: new T.CylinderGeometry(1, 1, 1, 14),
  cyl6: new T.CylinderGeometry(1, 1, 1, 6),
  cyl8: new T.CylinderGeometry(1, 1, 1, 8),
  cone: new T.ConeGeometry(1, 1, 14),
  ball: new T.SphereGeometry(1, 16, 12),
  ball8: new T.SphereGeometry(1, 8, 6),
  hemi: new T.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2),
  torus: new T.TorusGeometry(1, 0.18, 8, 24),
  ring: new T.TorusGeometry(1, 0.06, 6, 32),
  capsule: new T.CapsuleGeometry(0.5, 1, 4, 10),
  wedge: (() => {
    const s = new T.Shape();
    s.moveTo(-0.5, -0.5);
    s.lineTo(0.5, -0.5);
    s.lineTo(-0.5, 0.5);
    s.lineTo(-0.5, -0.5);
    const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  })(),
};

const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), vp = new T.Vector3(), vs = new T.Vector3();
const col = new T.Color();

// Модель из деталей одной группы материалов: add(тело, цвет, [x,y,z], [sx,sy,sz], [rx,ry,rz])
export class Shape {
  constructor() {
    this.parts = [];
  }
  add(geo, color, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) {
    const g = typeof geo === "string" ? PRIM[geo] : geo;
    if (typeof s === "number") s = [s, s, s];
    e.set(r[0], r[1], r[2], "YXZ");
    q.setFromEuler(e);
    m4.compose(vp.set(p[0], p[1], p[2]), q, vs.set(s[0], s[1], s[2]));
    this.parts.push({ g, color, matrix: m4.clone() });
    return this;
  }
  get empty() {
    return !this.parts.length;
  }
  // готовая геометрия с цветами вершин; ao — низ чуть темнее
  build(ao = 0) {
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
      const P = p.g.attributes.position, Nn = p.g.attributes.normal;
      nm.getNormalMatrix(p.matrix);
      col.set(p.color);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
        n.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize();
        const k = vo + i;
        pos[k * 3] = v.x;
        pos[k * 3 + 1] = v.y;
        pos[k * 3 + 2] = v.z;
        nor[k * 3] = n.x;
        nor[k * 3 + 1] = n.y;
        nor[k * 3 + 2] = n.z;
        const shade = ao ? 1 - ao + ao * Math.min(1, Math.max(0, v.y / 1.2)) : 1;
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
export function canvasTexture(w, h, paint, o = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d"), w, h);
  const t = new T.CanvasTexture(canvas);
  if (o.srgb !== false) t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? T.ClampToEdgeWrapping : T.RepeatWrapping;
  t.anisotropy = o.aniso || 4;
  return t;
}
// мягкое пятно для частиц и ореолов
export function glowTexture(size = 64, power = 2) {
  return canvasTexture(size, size, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      g.addColorStop(k, `rgba(255,255,255,${Math.pow(1 - k, power).toFixed(3)})`);
    }
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  }, { clamp: true });
}

// шум для текстур (с зерном)
export function noiseRand(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
