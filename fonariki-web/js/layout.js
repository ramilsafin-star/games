// Раскладка леса: деревья, тропинки, места в лесу, препятствия. Одинаковая у всех (постоянное зерно).
// Без three.js: из неё же берёт столкновения проверка в Node.
import { CAMP, PLACES, PLACE_RADIUS, GARDEN, MAP_RADIUS, makeRng } from "./config.js?v=16ea7301";

const CELL = 10;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let k = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}

// Тропинки: от лагеря к каждому месту, с лёгким изгибом (точка посередине сдвинута вбок)
function makePaths(rng) {
  return PLACES.map((p) => {
    const mx = (CAMP.x + p.x) / 2, mz = (CAMP.z + p.z) / 2;
    const l = Math.hypot(p.x - CAMP.x, p.z - CAMP.z);
    const nx = -(p.z - CAMP.z) / l, nz = (p.x - CAMP.x) / l;
    const bend = rng.range(-9, 9);
    return [
      [CAMP.x, CAMP.z],
      [mx + nx * bend, mz + nz * bend],
      [p.x, p.z],
    ];
  });
}

export function pathDist(paths, x, z) {
  let best = Infinity;
  for (const pts of paths)
    for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return best;
}

export function buildLayout(seed = 7) {
  const rng = makeRng(seed);
  const paths = makePaths(rng);
  const pond = PLACES.find((p) => p.id === "pond");
  const trees = [];
  const props = []; // камни, кусты, грибы: { type, x, z, s, r }
  const solids = []; // препятствия для бега: { x, z, r }

  const clearOf = (x, z, pad) => {
    const r = Math.hypot(x - CAMP.x, z - CAMP.z);
    if (Math.hypot(x - GARDEN.x, z - GARDEN.z) < GARDEN.size + 7 + pad) return false;
    for (const p of PLACES) if (Math.hypot(x - p.x, z - p.z) < PLACE_RADIUS + 2 + pad) return false;
    if (pathDist(paths, x, z) < 4.5 + pad) return false;
    return r > 0;
  };

  // Деревья: сетка с дрожанием; край поляны неровный (52–62)
  const step = 8.5;
  for (let gx = -230; gx <= 230; gx += step) {
    for (let gz = -230; gz <= 230; gz += step) {
      const x = gx + rng.range(-3.6, 3.6), z = gz + rng.range(-3.6, 3.6);
      const r = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      const edge = 55 + Math.sin(a * 5) * 3.5 + Math.sin(a * 11 + 1) * 2.5;
      if (r < edge || r > 245) continue;
      const border = r > MAP_RADIUS + 2; // за краем — на холмах, сквозь них не пройти
      if (!border && !clearOf(x, z, 0)) continue;
      if (rng.next() > (border ? 0.85 : 0.72)) continue;
      const kind = rng.next() < 0.62 ? "pine" : "leafy";
      const s = (kind === "pine" ? rng.range(0.85, 1.45) : rng.range(0.8, 1.25)) * (border ? 1.25 : 1);
      trees.push({ kind, x, z, s, rot: rng.range(0, Math.PI * 2), hue: rng.next() });
      if (!border) solids.push({ x, z, r: (kind === "pine" ? 0.9 : 1.0) * s });
    }
  }

  // Кусты, камни и маленькие светящиеся грибы по лесу и по краю поляны
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.next() < 0.3 ? rng.range(44, 60) : rng.range(55, 190);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clearOf(x, z, -1)) continue;
    const roll = rng.next();
    const type = roll < 0.45 ? "bush" : roll < 0.75 ? "rock" : "shroom";
    const s = type === "rock" ? rng.range(0.6, 1.8) : type === "bush" ? rng.range(0.8, 1.5) : rng.range(0.6, 1.2);
    props.push({ type, x, z, s, rot: rng.range(0, Math.PI * 2), hue: rng.next() });
    if (type === "rock" && s > 1.2) solids.push({ x, z, r: s * 0.9 });
  }

  // Места: что в них стоит и что мешает пройти
  const placeBits = {};
  for (const p of PLACES) {
    const bits = [];
    if (p.id === "mushrooms") {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const r = i === 0 ? 0 : rng.range(4, 9);
        bits.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, s: i === 0 ? 2.2 : rng.range(0.9, 1.7), hue: rng.next() });
      }
      for (const b of bits) if (b.s > 1.3) solids.push({ x: b.x, z: b.z, r: 0.7 * b.s });
    } else if (p.id === "pond") {
      solids.push({ x: p.x, z: p.z, r: 9, water: true });
    } else if (p.id === "stones") {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = { x: p.x + Math.cos(a) * 9, z: p.z + Math.sin(a) * 9, s: rng.range(0.9, 1.3), rot: a };
        bits.push(b);
        solids.push({ x: b.x, z: b.z, r: 1.3 });
      }
    } else if (p.id === "oak") {
      solids.push({ x: p.x, z: p.z, r: 3.2 });
    } else if (p.id === "crystals") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng.range(-0.4, 0.4);
        const r = i === 0 ? 0 : rng.range(3, 7);
        bits.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, s: i === 0 ? 2.4 : rng.range(0.8, 1.6), rot: rng.range(0, 6.28), hue: rng.next() });
      }
      solids.push({ x: p.x, z: p.z, r: 3 });
    }
    placeBits[p.id] = bits;
  }
  // постаменты усилений
  for (const p of PLACES) solids.push({ x: p.shrineX, z: p.shrineZ, r: 1.6 });
  // костёр (камни вокруг) и брёвна-скамейки
  solids.push({ x: CAMP.x, z: CAMP.z, r: 2.6 });
  const benches = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    benches.push({ x: Math.cos(a) * 6.2, z: Math.sin(a) * 6.2, rot: -a });
  }

  // сетка для быстрых столкновений
  const grid = new Map();
  for (const s of solids) {
    const x0 = Math.floor((s.x - s.r) / CELL), x1 = Math.floor((s.x + s.r) / CELL);
    const z0 = Math.floor((s.z - s.r) / CELL), z1 = Math.floor((s.z + s.r) / CELL);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const k = i * 1000 + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(s);
      }
  }
  return { trees, props, solids, grid, paths, placeBits, benches, pond };
}

// Выталкивает круг радиуса rad из препятствий и держит в пределах карты. Меняет pos.
export function collide(layout, pos, rad) {
  const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cz - 1; j <= cz + 1; j++) {
      const list = layout.grid.get(i * 1000 + j);
      if (!list) continue;
      for (const s of list) {
        const dx = pos.x - s.x, dz = pos.z - s.z;
        const d = Math.hypot(dx, dz), min = s.r + rad;
        if (d < min && d > 1e-4) {
          pos.x = s.x + (dx / d) * min;
          pos.z = s.z + (dz / d) * min;
        }
      }
    }
  const r = Math.hypot(pos.x, pos.z);
  if (r > MAP_RADIUS) {
    pos.x *= MAP_RADIUS / r;
    pos.z *= MAP_RADIUS / r;
  }
}

// Есть ли рядом препятствие (светлячок не должен родиться внутри дерева)
export function blocked(layout, x, z, pad) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cz - 1; j <= cz + 1; j++) {
      const list = layout.grid.get(i * 1000 + j);
      if (list) for (const s of list) if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return true;
    }
  return false;
}
