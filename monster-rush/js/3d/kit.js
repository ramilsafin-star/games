// Общие инструменты 3D: изгиб мира, сборка моделей из простых форм в один меш, материалы.
import * as T from '../../vendor/three/three.module.min.js?v=4d3622b6';

// Дорога уходит за горизонт, как на маленькой планете: новые объекты выезжают из-за него, а не появляются из воздуха.
// Только для камеры с перспективой: карте теней изгиб не нужен.
export const BEND = 0.0017;
export const BEND_MAX = 95;
export const BEND_GLSL = `if (projectionMatrix[2][3] < -0.5) { float bendD = min(-mvPosition.z, ${BEND_MAX.toFixed(1)}); mvPosition.y -= bendD * bendD * ${BEND.toFixed(5)}; }`;
const PROJECT = 'gl_Position = projectionMatrix * mvPosition;';
if (!T.ShaderChunk.project_vertex.includes(PROJECT)) throw new Error('Three.js: не найден project_vertex');
T.ShaderChunk.project_vertex = T.ShaderChunk.project_vertex.replace(PROJECT, BEND_GLSL + '\n' + PROJECT);

export const rimColor = { value: new T.Color(0xffffff) };
export const rimPower = { value: 0.2 };

// Мягкая светлая кайма по контуру: персонажи отделяются от фона, как в анимационном кино
function withRim(material, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = rimColor;
    shader.uniforms.uRimPower = rimPower;
    shader.uniforms.uRimK = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimPower; uniform float uRimK;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimK = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += uRimColor * uRimPower * uRimK * rimK * rimK * rimK;`);
  };
  material.customProgramCacheKey = () => 'rim';
  return material;
}

export function toyMaterial({ roughness = 0.58, metalness = 0, rim = 1 } = {}) {
  return withRim(new T.MeshStandardMaterial({ vertexColors: true, roughness, metalness }), rim);
}
export function metalMaterial() {
  return withRim(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.62 }), 0.6);
}
export function glowMaterial() {
  return new T.MeshBasicMaterial({ vertexColors: true });
}

export function hdr(hex, power = 1) {
  return new T.Color(hex).multiplyScalar(power);
}

// Тело вращения по кольцам. Кольцо: { y, rx, rz, x, z, p }; p > 2 делает сечение более квадратным
export function loft(list, { seg = 12 } = {}) {
  // Кольца можно перечислять и сверху вниз: поверхность не должна вывернуться наизнанку
  const rings = list[0].y > list[list.length - 1].y ? [...list].reverse() : list;
  const pos = [];
  const idx = [];
  rings.forEach((r) => {
    const e = 2 / (r.p || 2);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push((r.x || 0) + r.rx * Math.sign(c) * Math.abs(c) ** e, r.y, (r.z || 0) + (r.rz ?? r.rx) * Math.sign(s) * Math.abs(s) ** e);
    }
  });
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i;
      const b = j * seg + ((i + 1) % seg);
      const c = (j + 1) * seg + i;
      const d = (j + 1) * seg + ((i + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Крышки сверху и снизу
  const first = rings[0];
  const last = rings[rings.length - 1];
  const bottom = pos.length / 3;
  pos.push(first.x || 0, first.y, first.z || 0);
  const top = bottom + 1;
  pos.push(last.x || 0, last.y, last.z || 0);
  const lastRing = (rings.length - 1) * seg;
  for (let i = 0; i < seg; i++) {
    const n = (i + 1) % seg;
    idx.push(bottom, i, n);
    idx.push(top, lastRing + n, lastRing + i);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Коробка со скруглёнными гранями: даёт блик на рёбрах, без него детали выглядят плоско
export function rbox(w, h, d, r = Math.min(w, h, d) * 0.16) {
  const geo = new T.BoxGeometry(w, h, d, 3, 3, 3);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const half = [w / 2, h / 2, d / 2];
  const v = [0, 0, 0];
  const inner = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    v[0] = pos.getX(i);
    v[1] = pos.getY(i);
    v[2] = pos.getZ(i);
    // Внутренние линии сетки сдвигаем к краю: остаётся плоская грань и узкая фаска
    for (let k = 0; k < 3; k++) {
      const u = v[k] / half[k];
      if (Math.abs(Math.abs(u) - 1) > 1e-4) v[k] = Math.sign(u) * (half[k] - r);
      inner[k] = Math.max(-(half[k] - r), Math.min(half[k] - r, v[k]));
    }
    let nx = v[0] - inner[0];
    let ny = v[1] - inner[1];
    let nz = v[2] - inner[2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-6) {
      nx /= len;
      ny /= len;
      nz /= len;
      pos.setXYZ(i, inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r);
      nor.setXYZ(i, nx, ny, nz);
    }
  }
  return geo;
}

// Рубленая форма: у каждой грани своя нормаль (камни, кристаллы)
export function flat(geo) {
  const out = geo.index ? geo.toNonIndexed() : geo;
  out.computeVertexNormals();
  return out;
}

const UNIT = {
  ball: new T.SphereGeometry(1, 16, 12),
  ballFine: new T.SphereGeometry(1, 30, 22),
  ballLow: new T.SphereGeometry(1, 9, 7),
  ico: new T.IcosahedronGeometry(1, 0),
  ico1: new T.IcosahedronGeometry(1, 1),
};
const M = new T.Matrix4();
const P = new T.Vector3();
const Q = new T.Quaternion();
const S = new T.Vector3();
const E = new T.Euler();
const C = new T.Color();

export function place(geo, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  P.set(x, y, z);
  S.set(sx, sy, sz);
  Q.setFromEuler(E.set(rx, ry, rz));
  g.applyMatrix4(M.compose(P, Q, S));
  return g;
}

// Набор деталей: складывает всё в одну геометрию с цветом в вершинах (один вызов отрисовки на всю модель)
export class Kit {
  constructor() {
    this.parts = [];
  }

  // power > 1 делает деталь светящейся (для материала без освещения)
  add(geo, color, power = 1) {
    const count = geo.attributes.position.count;
    const col = new Float32Array(count * 3);
    C.set(color);
    for (let i = 0; i < count; i++) col.set([C.r * power, C.g * power, C.b * power], i * 3);
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    this.parts.push(geo);
    return this;
  }

  ball(color, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
    return this.add(place(UNIT.ball, x, y, z, sx, sy, sz, rx, ry, rz), color);
  }

  // Гладкий шар для крупных заметных форм
  smooth(color, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
    return this.add(place(UNIT.ballFine, x, y, z, sx, sy, sz, rx, ry, rz), color);
  }

  // Шар попроще: для мелочи и того, что сливается в одну массу
  blob(color, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
    return this.add(place(UNIT.ballLow, x, y, z, sx, sy, sz, rx, ry, rz), color);
  }

  box(color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0, r) {
    return this.add(place(rbox(w, h, d, r), x, y, z, 1, 1, 1, rx, ry, rz), color);
  }

  cyl(color, x, y, z, rTop, rBottom, h, rx = 0, ry = 0, rz = 0, seg = 12) {
    return this.add(place(new T.CylinderGeometry(rTop, rBottom, h, seg), x, y, z, 1, 1, 1, rx, ry, rz), color);
  }

  cone(color, x, y, z, r, h, rx = 0, ry = 0, rz = 0, seg = 8) {
    return this.add(place(new T.ConeGeometry(r, h, seg), x, y, z, 1, 1, 1, rx, ry, rz), color);
  }

  torus(color, x, y, z, r, tube, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2, seg = 18) {
    return this.add(place(new T.TorusGeometry(r, tube, 7, seg, arc), x, y, z, 1, 1, 1, rx, ry, rz), color);
  }

  loft(color, rings, opts, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(place(loft(rings, opts), x, y, z, 1, 1, 1, rx, ry, rz), color);
  }

  // Рубленый камень из многогранника, чуть помятый
  rock(color, x, y, z, sx, sy = sx, sz = sx, seed = 1) {
    const g = flat(place(UNIT.ico1, 0, 0, 0, 1, 1, 1));
    const pos = g.attributes.position;
    const shift = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)}:${pos.getY(i).toFixed(3)}:${pos.getZ(i).toFixed(3)}`;
      if (!shift.has(key)) shift.set(key, 0.84 + rand(seed + shift.size) * 0.34);
      const k = shift.get(key);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    return this.add(place(g, x, y, z, sx, sy, sz, 0, seed, 0), color);
  }

  // Готовая геометрия. shade: { y0, y1, low, high } затемняет низ: получается мягкая тень без затрат на неё
  build(shade) {
    const merged = merge(this.parts);
    if (shade) {
      const pos = merged.attributes.position;
      const col = merged.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const t = Math.max(0, Math.min(1, (pos.getY(i) - shade.y0) / (shade.y1 - shade.y0)));
        const k = shade.low + (shade.high - shade.low) * (t * t * (3 - 2 * t));
        col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
      }
    }
    this.parts.forEach((g) => g.dispose());
    this.parts = [];
    return merged;
  }
}

export function merge(list) {
  let verts = 0;
  let inds = 0;
  for (const g of list) {
    verts += g.attributes.position.count;
    inds += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const idx = verts > 65000 ? new Uint32Array(inds) : new Uint16Array(inds);
  let v = 0;
  let n = 0;
  for (const g of list) {
    const count = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, count * 3), v * 3);
    nor.set(g.attributes.normal.array.subarray(0, count * 3), v * 3);
    col.set(g.attributes.color.array.subarray(0, count * 3), v * 3);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[n++] = src[i] + v;
    } else {
      for (let i = 0; i < count; i++) idx[n++] = i + v;
    }
    v += count;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.setIndex(new T.BufferAttribute(idx, 1));
  return geo;
}

export function rand(n) {
  const v = Math.sin(n * 91.345 + 8.13) * 43758.5453;
  return v - Math.floor(v);
}

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new T.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

// Меш с тенью
export function part(parent, geometry, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  if (parent) parent.add(m);
  return m;
}

export function canvasTexture(w, h, draw, { repeat = false, srgb = true, aniso = 4 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new T.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = T.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = aniso;
  return tex;
}

export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
