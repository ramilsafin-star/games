// Трассы «Виража». Каждая — замкнутая ломаная со скруглёнными углами: [x, z, радиус поворота, высота].
// Первая точка — стартовая линия (лежит на прямой). Ось x — вправо на карте, z — вниз.
// Здесь только геометрия без графики, поэтому трассы строятся и в Node (tests/sim.mjs).
import { clamp, wrapAngle } from "./kit.js?v=81afe732";

export const TRACKS = [
  {
    id: "sea",
    name: "Приморское кольцо",
    blurb: "Широкая и плавная",
    theme: "sea",
    half: 10,
    shoulder: 6,
    scale: 0.9,
    pts: [
      [0, 0, 0, 0.6],
      [260, 0, 90, 1],
      [330, -180, 80, 3],
      [200, -330, 90, 6],
      [20, -260, 70, 5],
      [-150, -340, 80, 6],
      [-300, -200, 90, 3],
      [-230, 0, 80, 1],
    ],
    pads: [[120, 0, 4], [262, -258, -3], [-268, -105, 0]],
    cans: [[180, 0, -4], [20, -278, 0], [-225, -270, 3], [-120, 0, 0]],
  },
  {
    id: "pine",
    name: "Сосновый серпантин",
    blurb: "Холмы и змейка",
    theme: "pine",
    half: 9,
    shoulder: 6,
    scale: 0.82,
    pts: [
      [0, 0, 0, 0],
      [240, 0, 55, 2],
      [300, -120, 45, 8],
      [200, -230, 45, 15],
      [300, -340, 45, 22],
      [190, -450, 60, 27],
      [40, -480, 50, 26],
      [-90, -380, 45, 20],
      [0, -270, 40, 13],
      [-110, -170, 45, 7],
      [-240, -120, 50, 3],
      [-240, 0, 50, 0],
    ],
    pads: [[110, 0, -3], [246, -394, 0], [116, -465, 3]],
    cans: [[250, -175, 0], [250, -285, 0], [-45, -325, 0], [-55, -220, 0], [-120, 0, 0]],
  },
  {
    id: "canyon",
    name: "Красный каньон",
    blurb: "Шпильки и трамплин",
    theme: "canyon",
    half: 8.5,
    shoulder: 5.5,
    scale: 0.85,
    pts: [
      [0, 0, 0, 0],
      [320, 0, 31, 0],
      [320, -66, 31, 3],
      [120, -66, 31, 6],
      [120, -152, 31, 10],
      [330, -152, 33, 12],
      [330, -232, 33, 16],
      [-60, -232, 55, 6],
      [-150, -140, 55, 3],
      [-150, 0, 48, 0],
    ],
    pads: [[150, 0, 0], [225, -152, 0], [262, -232, 0]],
    cans: [[225, -66, 2], [70, -232, 0], [-105, -186, 0], [-150, -70, -3]],
    jump: [190, -232],
  },
  {
    id: "city",
    name: "Ночной город",
    blurb: "Неон и крутые углы",
    theme: "city",
    novice: 0.95, // на «Новичке» соперники здесь едут на 5% спокойнее: двенадцать прямых углов трудны для малыша
    half: 8.5,
    shoulder: 4,
    scale: 0.8,
    pts: [
      [0, 0, 0, 0],
      [260, 0, 26, 0],
      [260, -120, 26, 0],
      [150, -120, 24, 0],
      [150, -250, 26, 0],
      [300, -250, 26, 0],
      [300, -370, 28, 0],
      [170, -370, 0, 7],
      [40, -370, 26, 0],
      [40, -250, 24, 0],
      [-170, -250, 26, 0],
      [-170, -140, 24, 0],
      [-90, -140, 24, 0],
      [-90, 0, 26, 0],
    ],
    pads: [[130, 0, 3], [215, -370, -3], [-60, -250, 0]],
    cans: [[260, -60, 0], [150, -185, 2], [225, -250, -2], [95, -370, 3], [-170, -195, 0], [-90, -70, 0]],
  },
];

const A_LAT = 34; // боковое ускорение, на которое рассчитан «идеальный» проход поворота
const DECEL = 20; // торможение, заложенное в профиль скорости
export const V_CAP = 70;

// Сглаживание замкнутого массива: каждый проход — фильтр ¼ ½ ¼
function relax(a, passes) {
  const n = a.length;
  let b = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) b[i] = a[i] * 0.5 + (a[(i + 1) % n] + a[(i + n - 1) % n]) * 0.25;
    [a, b] = [b, a];
  }
  return a;
}

export function buildTrack(def) {
  const sc = def.scale || 1;
  const P = def.pts.map(([x, z, r = 0, y = 0]) => ({ x: x * sc, z: z * sc, r: r * sc, y }));
  const m = P.length;

  // 1. У каждого угла — точки начала и конца дуги
  const corners = P.map((p, i) => {
    const a = P[(i + m - 1) % m];
    const b = P[(i + 1) % m];
    let ux = a.x - p.x, uz = a.z - p.z, vx = b.x - p.x, vz = b.z - p.z;
    const ul = Math.hypot(ux, uz), vl = Math.hypot(vx, vz);
    ux /= ul; uz /= ul; vx /= vl; vz /= vl;
    const inner = Math.acos(clamp(ux * vx + uz * vz, -1, 1));
    const turn = Math.PI - inner;
    if (p.r <= 0 || turn < 0.02) return { p, t: 0, r: 0, ux, uz, vx, vz, inner, ul, vl };
    return { p, r: p.r, t: p.r / Math.tan(inner / 2), ux, uz, vx, vz, inner, ul, vl };
  });
  // Если две дуги не помещаются на общем отрезке — уменьшаем обе
  for (let i = 0; i < m; i++) {
    const c = corners[i], d = corners[(i + 1) % m];
    const room = c.vl * 0.98;
    if (c.t + d.t > room) {
      const k = room / (c.t + d.t);
      c.t *= k; c.r *= k; d.t *= k; d.r *= k;
    }
  }

  // 2. Плотная ломаная (шаг ~1) и «станции» высоты
  const dx = [], dz = [];
  const stations = []; // [номер точки, высота]
  const push = (x, z) => { dx.push(x); dz.push(z); };
  const line = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.round(len));
    for (let k = 1; k <= steps; k++) push(x0 + ((x1 - x0) * k) / steps, z0 + ((z1 - z0) * k) / steps);
  };
  let cx = P[0].x, cz = P[0].z;
  push(cx, cz);
  stations.push([0, P[0].y]);
  for (let q = 1; q <= m; q++) {
    const c = corners[q % m];
    const p = c.p;
    const ax = p.x + c.ux * c.t, az = p.z + c.uz * c.t;
    if (q === m) {
      // замыкаем круг: последняя точка совпала бы с первой
      const len = Math.hypot(ax - cx, az - cz);
      const steps = Math.max(1, Math.round(len));
      for (let k = 1; k < steps; k++) push(cx + ((ax - cx) * k) / steps, cz + ((az - cz) * k) / steps);
      break;
    }
    line(cx, cz, ax, az);
    if (c.t > 0) {
      const bx = p.x + c.vx * c.t, bz = p.z + c.vz * c.t;
      let mx = c.ux + c.vx, mz = c.uz + c.vz;
      const ml = Math.hypot(mx, mz);
      const dist = c.r / Math.sin(c.inner / 2);
      const ox = p.x + (mx / ml) * dist, oz = p.z + (mz / ml) * dist;
      const a0 = Math.atan2(az - oz, ax - ox);
      const sweep = wrapAngle(Math.atan2(bz - oz, bx - ox) - a0);
      const steps = Math.max(2, Math.round(Math.abs(sweep) * c.r));
      stations.push([dx.length + Math.floor(steps / 2), p.y]);
      for (let k = 1; k <= steps; k++) {
        const a = a0 + (sweep * k) / steps;
        push(ox + Math.cos(a) * c.r, oz + Math.sin(a) * c.r);
      }
      cx = bx; cz = bz;
    } else {
      stations.push([dx.length - 1, p.y]);
      cx = ax; cz = az;
    }
  }
  const dn = dx.length;
  // высота по станциям
  const dy = new Float64Array(dn);
  for (let k = 0; k < stations.length; k++) {
    const [i0, y0] = stations[k];
    const [i1raw, y1] = stations[(k + 1) % stations.length];
    const i1 = k + 1 === stations.length ? dn : i1raw;
    for (let i = i0; i < i1; i++) dy[i] = y0 + ((y1 - y0) * (i - i0)) / (i1 - i0);
  }
  // стыки прямых и дуг сглаживаем, чтобы руль не дёргался
  const sx = relax(Float64Array.from(dx), 26);
  const sz = relax(Float64Array.from(dz), 26);

  // 3. Равномерная разбивка с шагом около 2
  const cum = new Float64Array(dn + 1);
  for (let i = 0; i < dn; i++) {
    const j = (i + 1) % dn;
    cum[i + 1] = cum[i] + Math.hypot(sx[j] - sx[i], sz[j] - sz[i]);
  }
  const length = cum[dn];
  const n = Math.round(length / 2);
  const ds = length / n;
  const px = new Float32Array(n), pz = new Float32Array(n);
  let rawY = new Float64Array(n);
  for (let i = 0, k = 0; i < n; i++) {
    const s = i * ds;
    while (cum[k + 1] < s) k++;
    const f = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const j = (k + 1) % dn;
    px[i] = sx[k] + (sx[j] - sx[k]) * f;
    pz[i] = sz[k] + (sz[j] - sz[k]) * f;
    rawY[i] = dy[k] + (dy[j] - dy[k]) * f;
  }
  const py = Float32Array.from(relax(rawY, 240));

  const tx = new Float32Array(n), tz = new Float32Array(n), nx = new Float32Array(n), nz = new Float32Array(n);
  const yaw = new Float32Array(n), slope = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const ex = px[b] - px[a], ez = pz[b] - pz[a];
    const el = Math.hypot(ex, ez);
    tx[i] = ex / el; tz[i] = ez / el;
    nx[i] = tz[i]; nz[i] = -tx[i]; // влево от направления движения
    yaw[i] = Math.atan2(tx[i], tz[i]);
    slope[i] = (py[b] - py[a]) / (2 * ds);
  }
  let kr = new Float64Array(n);
  for (let i = 0; i < n; i++) kr[i] = wrapAngle(yaw[(i + 1) % n] - yaw[(i + n - 1) % n]) / (2 * ds);
  const k = Float32Array.from(relax(kr, 3)); // кривизна: плюс — поворот влево

  // 4. Подсказки соперникам: с какой стороны ехать и с какой скоростью
  const wide = relax(Float64Array.from(k), 70);
  const ideal = new Float32Array(n);
  for (let i = 0; i < n; i++) ideal[i] = clamp(wide[i] * 42, -1, 1) * (def.half - 2.4);
  const vp = new Float32Array(n);
  for (let i = 0; i < n; i++) vp[i] = Math.min(V_CAP, Math.sqrt(A_LAT / Math.max(1e-4, Math.abs(k[i]))));
  for (let pass = 0; pass < 2; pass++)
    for (let i = n - 1; i >= 0; i--) {
      const next = vp[(i + 1) % n];
      vp[i] = Math.min(vp[i], Math.sqrt(next * next + 2 * DECEL * ds));
    }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
    minY = Math.min(minY, py[i]); maxY = Math.max(maxY, py[i]);
  }

  const track = {
    id: def.id, name: def.name, theme: def.theme, def,
    n, ds, length, half: def.half, shoulder: def.shoulder, wall: def.half + def.shoulder,
    px, py, pz, tx, tz, nx, nz, yaw, slope, k, ideal, vp,
    box: { minX, maxX, minZ, maxZ, minY, maxY },
  };
  const place = ([x, z, d = 0]) => {
    const i = nearest(track, x * sc, z * sc);
    return { i, s: i * ds, d, x: px[i] + nx[i] * d, y: py[i], z: pz[i] + nz[i] * d, yaw: yaw[i] };
  };
  track.pads = (def.pads || []).map(place);
  track.cans = (def.cans || []).map(place);
  track.jump = null;
  if (def.jump) {
    const end = place(def.jump);
    track.jump = { s1: end.s, s0: end.s - 9, h: 1.55, i: end.i }; // трамплин: 9 в длину, 1.55 в высоту
  }
  return track;
}

// Ближайший отсчёт трассы к точке (полный перебор — для расстановки и возврата на трассу)
export function nearest(track, x, z) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < track.n; i++) {
    const q = (x - track.px[i]) ** 2 + (z - track.pz[i]) ** 2;
    if (q < best) { best = q; bi = i; }
  }
  return bi;
}

// Точка трассы на расстоянии s от старта со сдвигом d влево от оси
export function trackPoint(track, s, d = 0, out = {}) {
  const { n, ds, length } = track;
  s = ((s % length) + length) % length;
  const f = s / ds;
  const i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
  const nxv = track.nx[i] + (track.nx[j] - track.nx[i]) * t;
  const nzv = track.nz[i] + (track.nz[j] - track.nz[i]) * t;
  out.x = track.px[i] + (track.px[j] - track.px[i]) * t + nxv * d;
  out.z = track.pz[i] + (track.pz[j] - track.pz[i]) * t + nzv * d;
  out.y = track.py[i] + (track.py[j] - track.py[i]) * t;
  out.yaw = track.yaw[i] + wrapAngle(track.yaw[j] - track.yaw[i]) * t;
  out.i = i;
  return out;
}

// Высота трамплина над дорогой в точке s
export function rampHeight(track, s) {
  const j = track.jump;
  if (!j) return 0;
  let u = s - j.s0;
  if (u < 0) u += track.length;
  const len = j.s1 - j.s0;
  return u < len ? (j.h * u) / len : 0;
}

// Проверка для тестов: длина, самый крутой поворот, самое тесное место между разными участками
export function inspect(track) {
  const { n, ds, px, pz, k, slope } = track;
  let kmax = 0, smax = 0;
  for (let i = 0; i < n; i++) {
    kmax = Math.max(kmax, Math.abs(k[i]));
    smax = Math.max(smax, Math.abs(slope[i]));
  }
  let gap = Infinity;
  const skip = Math.ceil(90 / ds); // соседние по ходу отсчёты не сравниваем
  for (let i = 0; i < n; i += 2)
    for (let j = i + skip; j < n; j += 2) {
      if (n - j + i < skip) continue;
      const q = Math.hypot(px[i] - px[j], pz[i] - pz[j]);
      if (q < gap) gap = q;
    }
  return { length: track.length, n, ds, minRadius: 1 / kmax, maxSlope: smax, gap };
}
