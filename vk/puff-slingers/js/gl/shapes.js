// Заготовки геометрии: трубки, скруглённые камни, раскраска вершин и слияние деталей.
import * as T from '../../vendor/three/three.module.min.js?v=7f585ca2';
import { mergeGeometries, mergeVertices } from '../../vendor/three/BufferGeometryUtils.js?v=7f585ca2';

export const color = (c) => new T.Color(c);

export function seededRandom(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(ix, iy, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1442968193);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise3(x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const c = (i, j, k) => hash(x0 + i, y0 + j, z0 + k);
  const lerp1 = (a, b, t) => a + (b - a) * t;
  return lerp1(
    lerp1(lerp1(c(0, 0, 0), c(1, 0, 0), u), lerp1(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp1(lerp1(c(0, 0, 1), c(1, 0, 1), u), lerp1(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

export function fbm3(x, y, z, octaves = 4) {
  let a = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * noise3(x, y, z);
    norm += a;
    a *= 0.5;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
  }
  return sum / norm;
}

// Трубка, сужающаяся вдоль пути: рога, ветки, стволы, рогатка
export function tube(points, radius, segments = 12, radial = 8) {
  const curve = new T.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new T.Vector3(...p))));
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [];
  const nor = [];
  const uvs = [];
  const idx = [];
  const p = new T.Vector3();
  const n = new T.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const r = typeof radius === 'function' ? radius(t) : radius;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// Плоские вершины без индексов нужны, чтобы детали можно было слить
function plain(geometry, keep) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
  return g;
}

// Раскрашивает вершины: одним цветом или функцией от положения
export function paint(geometry, fill, matrix) {
  const g = plain(geometry, ['position', 'normal', 'uv']);
  if (!g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const c = new T.Color();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < count; i++) {
    if (typeof fill === 'function') fill(c, pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
    else c.set(fill);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new T.BufferAttribute(arr, 3));
  if (matrix) g.applyMatrix4(matrix);
  return g;
}

export const merge = (list) => mergeGeometries(list, false);

export function place(x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const m = new T.Matrix4();
  m.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
  return m;
}

// Скруглённый коробок с неровной поверхностью: скалы и глыбы
export function rockBox(w, h, d, round, bump, seed, step = 16) {
  const box = new T.BoxGeometry(w, h, d, Math.max(2, Math.ceil(w / step)), Math.max(2, Math.ceil(h / step)), Math.max(2, Math.ceil(d / step)));
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const g = mergeVertices(box, 0.01);
  const pos = g.attributes.position;
  const v = new T.Vector3();
  const inner = new T.Vector3();
  const dir = new T.Vector3();
  const hx = w / 2 - round;
  const hy = h / 2 - round;
  const hz = d / 2 - round;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(T.MathUtils.clamp(v.x, -hx, hx), T.MathUtils.clamp(v.y, -hy, hy), T.MathUtils.clamp(v.z, -hz, hz));
    dir.subVectors(v, inner);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    const n = bump * (fbm3(v.x * 0.022 + seed, v.y * 0.022, v.z * 0.022, 3) - 0.5) * 2;
    v.copy(inner).addScaledVector(dir, round + n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Комок с мягкими буграми: кроны вдали, сугробы, валуны
export function blob(radius, detail, bump, seed) {
  const g = mergeVertices(new T.IcosahedronGeometry(radius, detail), 0.001);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + bump * (fbm3(v.x / radius * 1.7 + seed, v.y / radius * 1.7, v.z / radius * 1.7, 3) - 0.5) * 2;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

// Развёртка по площади: текстура не тянется на блоках разного размера
export function boxUV(geometry, tileU, tileV, swap = false, ou = 0, ov = 0) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let a;
    let b;
    if (az >= ax && az >= ay) {
      a = pos.getX(i);
      b = pos.getY(i);
    } else if (ay >= ax) {
      a = pos.getX(i);
      b = pos.getZ(i);
    } else {
      a = pos.getZ(i);
      b = pos.getY(i);
    }
    if (swap) [a, b] = [b, a];
    uv[i * 2] = a / tileU + ou;
    uv[i * 2 + 1] = b / tileV + ov;
  }
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return geometry;
}
