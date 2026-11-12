// Уровни «Снежного кома»: четыре горы по десять уровней, каждый собирается из своего зерна.
// Сначала прокладывается «безопасный коридор» — путь через лучшие ворота без единого удара.
// Препятствия ставятся только вне коридора, а движущиеся получают такую фазу, чтобы в миг,
// когда ком едет коридором, они были в стороне. Поэтому любой уровень заведомо проходим;
// validate() это перепроверяет. Никакой графики: этот же код гоняют проверки в Node.
import { HALF, BRIDGE_HALF, AIR_TIME, JUMP, GRAVITY, START, radiusOf, applyGate, isGood, rng, hash, clamp, logX, crusherDown, geyserState, touches } from "./rules.js?v=8ae2940b";

export const MOUNTAINS = [
  { id: "firs", name: "Ёлочный склон", boss: "Снеговик Сугробыч" },
  { id: "gorge", name: "Ледяное ущелье", boss: "Снеговик Ледышкин" },
  { id: "aurora", name: "Северное сияние", boss: "Снеговик Полуночник" },
  { id: "volcano", name: "Вулканическая гора", boss: "Снеговик Кипятков" },
];
export const PER_MOUNTAIN = 10;
export const LEVEL_COUNT = MOUNTAINS.length * PER_MOUNTAIN;

// Сложность внутри горы: разгон, передышка, подъём, ещё передышка, перед боссом — пик
const CURVE = [0.05, 0.2, 0.32, 0.22, 0.45, 0.58, 0.46, 0.7, 0.85, 0.75];
// С какого уровня появляется испытание
export const UNLOCK = { piles: 1, rocks: 1, ramp: 2, fence: 3, logs: 6, holes: 11, spikes: 12, crushers: 14, bridge: 21, slalom: 23, geysers: 31 };
// Вес испытаний по горам
const WEIGHTS = [
  { piles: 2, rocks: 3, ramp: 2, fence: 3, logs: 2 },
  { piles: 1, rocks: 2, ramp: 2, fence: 2, logs: 2, holes: 3, spikes: 3, crushers: 3 },
  { piles: 1, rocks: 2, ramp: 2, fence: 1, logs: 2, holes: 2, spikes: 2, crushers: 2, bridge: 3, slalom: 3 },
  { piles: 1, rocks: 2, ramp: 2, fence: 1, logs: 2, holes: 2, spikes: 2, crushers: 2, bridge: 2, slalom: 2, geysers: 4 },
];
// Подсказка при первой встрече
export const INTRO = {
  ramp: "Трамплин! Лети и лови снежинки",
  fence: "Забор отнимает снег — ищи проход",
  logs: "Бревно катится! Проскочи за ним",
  holes: "Трещины во льду — объезжай",
  spikes: "Ледяные шипы! Объезжай",
  crushers: "Ледяной пресс — езжай, где он поднят",
  bridge: "Узкий мост — держись середины!",
  slalom: "Змейка! Петляй между заборами",
  geysers: "Гейзеры! Пар растапливает снег",
};

export const mountainOf = (n) => Math.floor((n - 1) / PER_MOUNTAIN);
export const isBoss = (n) => n % PER_MOUNTAIN === 0;
export const difficulty = (n) => clamp(mountainOf(n) * 0.25 + CURVE[(n - 1) % PER_MOUNTAIN] * 0.3, 0, 1);
export const speedOf = (n) => 13.5 + mountainOf(n) * 0.9 + ((n - 1) % PER_MOUNTAIN) * 0.08;
// Сколько примерно наберёт лучший путь к финишу
export const targetSize = (n) => Math.round(60 * 1.075 ** (n - 1));

export function nice(v) {
  if (v < 20) return Math.round(v);
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}

const PANELS = {
  2: [[-HALF, 0], [0, HALF]],
  3: [[-HALF, -HALF / 3], [-HALF / 3, HALF / 3], [HALF / 3, HALF]],
};

const cache = new Map();
export function buildLevel(n) {
  if (!cache.has(n)) cache.set(n, generate(n));
  return cache.get(n);
}
export const clearCache = () => cache.clear();

function generate(n) {
  const m = mountainOf(n);
  const boss = isBoss(n);
  const rnd = rng(hash(n * 7919 + 2026));
  const d = difficulty(n);
  const speed = speedOf(n);
  const F = targetSize(n);
  const rows = 5 + Math.floor((n - 1) / 8) + (boss ? 1 : 0);
  const rMax = radiusOf(F * 2.2);
  const lane = rMax + 0.85; // полуширина безопасного коридора
  const xLim = HALF - rMax - 0.35;
  const items = [];
  const bridges = [];
  const corridor = [[-60, 0]]; // точки (s, x) безопасного пути
  const intro = Object.keys(UNLOCK).find((k) => UNLOCK[k] === n && INTRO[k]) || null;

  const cAt = (s) => {
    for (let i = corridor.length - 1; i > 0; i--) {
      const [s0, x0] = corridor[i - 1];
      const [s1, x1] = corridor[i];
      if (s >= s0) return s >= s1 ? x1 : x0 + ((x1 - x0) * (s - s0)) / (s1 - s0);
    }
    return corridor[0][1];
  };
  const point = (s, x) => corridor.push([s, clamp(x, -xLim, xLim)]);
  // Не задевает ли прямоугольник [s0,s1]×[x0,x1] коридор
  const clearOf = (s0, s1, x0, x1, extra = 0) => {
    for (let s = s0 - rMax; s <= s1 + rMax; s += 0.5) {
      const c = cAt(s);
      const gap = c < x0 ? x0 - c : c > x1 ? c - x1 : 0;
      if (gap < lane + extra) return false;
    }
    return true;
  };
  const solid = []; // занятые места: {s0, s1, x0, x1}
  const roomFor = (s0, s1, x0, x1, pad = 0.9) =>
    !solid.some((o) => s0 < o.s1 + pad && s1 > o.s0 - pad && x0 < o.x1 + pad && x1 > o.x0 - pad);
  const occupy = (item, s0, s1, x0, x1) => {
    items.push(item);
    solid.push({ s0, s1, x0, x1 });
  };
  // окно времени, когда ком коридором проезжает отрезок [s0, s1]
  const passWindow = (s0, s1) => [(s0 - rMax - 0.8) / speed, (s1 + rMax + 0.8) / speed];

  let S = START; // размер на лучшем пути
  let low = START; // размер у небрежного: половина сугробов, худшие из хороших ворот
  let s = 34; // разгон без препятствий
  let cx = 0;
  let lastType = "";
  let flakes = 0;

  // ---------- Подбор: сугробики и снежинки вдоль коридора ----------
  // сугробик даёт долю от размера на лучшем пути: в начале +1, у финиша — десятки
  // (постоянная прибавка раздувала бы ком ещё до первых ворот, и умножать было бы нечего)
  const pileV = () => Math.max(1, Math.round(S * PILE));
  let pileMax = 1;
  function pileLine(a, count) {
    let got = 0;
    const pv = pileV();
    pileMax = Math.max(pileMax, pv);
    for (let k = 0; k < count; k++) {
      const ps = a + k * 2.1;
      const x = cAt(ps);
      if (!roomFor(ps - 0.5, ps + 0.5, x - 0.5, x + 0.5, 0.4)) continue;
      items.push({ t: "pile", s: ps, x, v: pv });
      got++;
    }
    S += got * pv;
    low += Math.round((got * pv) / 2);
  }
  function flakeLine(a, b, step = 2.6, off = 0) {
    for (let fs = a; fs <= b; fs += step) {
      const x = clamp(cAt(fs) + off, -HALF + 0.8, HALF - 0.8);
      if (!roomFor(fs - 0.4, fs + 0.4, x - 0.4, x + 0.4, 0.5)) continue;
      items.push({ t: "flake", s: fs, x, y: 0.9 });
      flakes++;
    }
  }
  // приманка в стороне от коридора: снежинки рядом с препятствиями
  function flakeBait(a, b, count) {
    for (let k = 0, tries = 0; k < count && tries < 40; tries++) {
      const fs = a + rnd() * (b - a);
      const x = (rnd() * 2 - 1) * (HALF - 1);
      if (!roomFor(fs - 0.5, fs + 0.5, x - 0.5, x + 0.5, 0.7)) continue;
      items.push({ t: "flake", s: fs, x, y: 0.9 });
      flakes++;
      k++;
    }
  }

  // ---------- Испытания между воротами ----------
  const fill = {
    piles(a, b, j) {
      pileLine(a + 4, 5 + Math.floor(rnd() * 3));
      flakeLine(a + 20, b - 4);
      if (j > 0) rocks(a + 6, b - 4, Math.round(1 + 2 * d));
    },
    rocks(a, b) {
      rocks(a, b, Math.round(3 + 5 * d + rnd() * 2));
      if (rnd() < 0.6) pileLine(a + 3, 4 + Math.floor(rnd() * 3));
      flakeLine(a + 2, b - 2, 3.2);
      flakeBait(a, b, 3);
    },
    fence(a, b) {
      const count = 1 + (d > 0.3 ? 1 : 0) + (d > 0.65 && rnd() < 0.6 ? 1 : 0);
      for (let k = 0; k < count; k++) fenceRow(a + 8 + ((b - a - 14) * (k + 0.5)) / count, "fence");
      if (rnd() < 0.5) pileLine(a + 2, 4);
      flakeLine(a + 2, b - 2, 3);
    },
    ramp(a, b) {
      const sr = a + 12 + rnd() * 6;
      const air = AIR_TIME * speed;
      const c = cAt(sr);
      const wide = rnd() < 0.4;
      const x0 = wide ? -HALF : clamp(c - lane - 0.4, -HALF, HALF);
      const x1 = wide ? HALF : clamp(c + lane + 0.4, -HALF, HALF);
      occupy({ t: "ramp", s: sr, len: 4, x0, x1 }, sr - 2, sr + 2, x0, x1);
      // дуга снежинок в воздухе
      for (let k = 1; k <= 6; k++) {
        const u = k / 7;
        const ts = u * AIR_TIME;
        const fs = sr + u * air;
        const y = JUMP * ts - (GRAVITY * ts * ts) / 2 + 1.0;
        items.push({ t: "flake", s: fs, x: cAt(fs), y });
        flakes++;
      }
      // под полётом — то, что можно перепрыгнуть
      const under = n >= UNLOCK.holes ? "hole" : n >= 4 ? "rock" : null;
      if (under && rnd() < 0.35 + d) {
        const hs = sr + air * (0.45 + rnd() * 0.1);
        const hr = under === "hole" ? 1.2 + rnd() * 0.4 : 0.9;
        const hx = cAt(hs);
        occupy({ t: under, s: hs, x: hx, r: hr, jump: true }, hs - hr, hs + hr, hx - hr, hx + hr);
      }
      if (rnd() < 0.5) pileLine(sr + air + 4, 4);
      rocks(a, b, Math.round(1 + 3 * d));
    },
    logs(a, b) {
      const count = 1 + (d > 0.35 ? 1 : 0) + (d > 0.75 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const ls = a + 10 + ((b - a - 16) * (k + 0.5)) / count;
        const span = rnd() < 0.6 ? [-HALF + 0.9, HALF - 0.9] : rnd() < 0.5 ? [-HALF + 0.9, 1] : [-1, HALF - 0.9];
        const item = { t: "log", s: ls, len: 4.4, xa: span[0], xb: span[1], period: 3.4 - d * 1.2 + rnd() * 0.6, phase: 0 };
        const c = cAt(ls);
        if (!placeMoving(item, ls - 2.2, ls + 2.2, (it, t) => Math.abs(logX(it, t) - c) > lane + 0.6)) continue;
        occupy(item, ls - 2.2, ls + 2.2, -HALF, HALF);
      }
      flakeLine(a + 2, b - 2, 3);
      if (rnd() < 0.4) pileLine(a + 3, 4);
    },
    holes(a, b) {
      const count = Math.round(2 + 3 * d + rnd());
      for (let k = 0, tries = 0; k < count && tries < 60; tries++) {
        const hs = a + 4 + rnd() * (b - a - 8);
        const hr = 1.0 + rnd() * 0.7;
        const hx = (rnd() * 2 - 1) * (HALF - hr * 0.6);
        if (!clearOf(hs - hr, hs + hr, hx - hr, hx + hr) || !roomFor(hs - hr, hs + hr, hx - hr, hx + hr, 1.4)) continue;
        occupy({ t: "hole", s: hs, x: hx, r: hr }, hs - hr, hs + hr, hx - hr, hx + hr);
        k++;
      }
      flakeLine(a + 2, b - 2, 3);
      flakeBait(a, b, 3);
    },
    spikes(a, b) {
      const count = 2 + Math.round(2 * d);
      for (let k = 0; k < count; k++) {
        const ss = a + 6 + ((b - a - 10) * (k + 0.5)) / count;
        const c = cAt(ss);
        // полоса шипов с одной стороны коридора, иногда с обеих
        const sides = rnd() < 0.35 + d * 0.4 ? [-1, 1] : [rnd() < 0.5 ? -1 : 1];
        for (const side of sides) {
          const inner = c + side * (lane + 0.15);
          const width = 2.5 + rnd() * 4;
          const x0 = side < 0 ? Math.max(-HALF, inner - width) : inner;
          const x1 = side < 0 ? inner : Math.min(HALF, inner + width);
          if (x1 - x0 < 1 || !clearOf(ss - 0.7, ss + 0.7, x0, x1) || !roomFor(ss - 0.7, ss + 0.7, x0, x1)) continue;
          occupy({ t: "spikes", s: ss, len: 1.4, x0, x1 }, ss - 0.7, ss + 0.7, x0, x1);
        }
      }
      flakeLine(a + 2, b - 2, 2.8);
      if (rnd() < 0.5) pileLine(a + 2, 4);
    },
    crushers(a, b) {
      const rowsHere = 1 + (d > 0.6 && b - a > 46 ? 1 : 0);
      for (let k = 0; k < rowsHere; k++) {
        const cs = a + 12 + ((b - a - 20) * (k + 0.5)) / rowsHere;
        const count = rnd() < 0.5 ? 3 : 4;
        const w = (2 * HALF) / count;
        const c = cAt(cs);
        const period = 2.6 - d * 0.5 + rnd() * 0.4;
        const base = rnd();
        for (let q = 0; q < count; q++) {
          const x0 = -HALF + q * w + 0.12;
          const x1 = -HALF + (q + 1) * w - 0.12;
          const item = { t: "crusher", s: cs, len: 2.6, x0, x1, period, phase: (base + q * 0.29) % 1 };
          const inBand = !(x1 < c - lane || x0 > c + lane);
          // в коридоре пресс обязан быть поднят, когда ком проезжает
          if (inBand && !placeMoving(item, cs - 1.3, cs + 1.3, (it, t) => !crusherDown(it, t))) continue;
          occupy(item, cs - 1.3, cs + 1.3, x0, x1);
        }
      }
      flakeLine(a + 2, b - 2, 3);
    },
    bridge(a, b) {
      const b0 = a + 14;
      const b1 = Math.min(b - 8, b0 + 28 + rnd() * 16);
      // коридор сходится к середине моста
      point(b0 - 6, 0);
      point(b1 + 2, 0);
      bridges.push({ s0: b0, s1: b1 });
      solid.push({ s0: b0 - 2, s1: b1 + 2, x0: -HALF, x1: HALF });
      for (let ps = b0 + 3; ps < b1 - 2; ps += 2.4) {
        const pv = pileV();
        if (rnd() < 0.35) items.push({ t: "pile", s: ps, x: 0, v: pv }), (S += pv), (low += pv / 2);
        else items.push({ t: "flake", s: ps, x: 0, y: 0.9 }), flakes++;
      }
    },
    slalom(a, b) {
      const gap = 14 + speed * 0.25;
      const gates = Math.floor((b - a - 10) / gap);
      let side = rnd() < 0.5 ? -1 : 1;
      const amp = Math.min(2.6, xLim);
      for (let k = 0; k < gates; k++) {
        const ss = a + 8 + k * gap;
        point(ss - 2, side * amp);
        point(ss + 2, side * amp);
        // стенка с другой стороны
        const c = side * amp;
        const kind = n >= UNLOCK.spikes && rnd() < 0.5 ? "spikes" : "fence";
        const x0 = side > 0 ? -HALF : c + lane + 0.1;
        const x1 = side > 0 ? c - lane - 0.1 : HALF;
        if (x1 - x0 > 1 && roomFor(ss - 0.7, ss + 0.7, x0, x1)) {
          occupy(kind === "fence" ? { t: "fence", s: ss, len: 0.6, x0, x1 } : { t: "spikes", s: ss, len: 1.4, x0, x1 }, ss - 0.7, ss + 0.7, x0, x1);
        }
        items.push({ t: "flake", s: ss, x: c, y: 0.9 });
        flakes++;
        side = -side;
      }
    },
    geysers(a, b) {
      const rowsHere = 1 + (d > 0.85 ? 1 : 0) + (b - a > 52 ? 1 : 0);
      for (let k = 0; k < rowsHere; k++) {
        const gs = a + 9 + ((b - a - 14) * (k + 0.5)) / rowsHere;
        const count = 3 + (rnd() < 0.5 ? 1 : 0);
        const period = 2.8 - d * 0.6 + rnd() * 0.5;
        const c = cAt(gs);
        const base = rnd();
        for (let q = 0; q < count; q++) {
          const gx = -HALF + ((q + 0.5) * 2 * HALF) / count + (rnd() - 0.5) * 0.8;
          const gr = 1.15;
          const item = { t: "geyser", s: gs, x: gx, r: gr, period, phase: (base + q * 0.31) % 1 };
          const inBand = Math.abs(gx - c) < lane + gr;
          if (inBand && !placeMoving(item, gs - gr, gs + gr, (it, t) => geyserState(it, t) !== 2)) continue;
          if (!roomFor(gs - gr, gs + gr, gx - gr, gx + gr, 0.3)) continue;
          occupy(item, gs - gr, gs + gr, gx - gr, gx + gr);
        }
      }
      flakeLine(a + 2, b - 2, 3);
      if (rnd() < 0.5) pileLine(a + 2, 4);
    },
  };

  function rocks(a, b, count) {
    for (let k = 0, tries = 0; k < count && tries < count * 12; tries++) {
      const rs = a + 2 + rnd() * (b - a - 4);
      const rr = 0.65 + rnd() * 0.6;
      // камни тянутся к краям коридора: небрежный ком их задевает
      const c = cAt(rs);
      const hug = rnd() < 0.6;
      const rx = hug ? c + (rnd() < 0.5 ? -1 : 1) * (lane + rr + 0.1 + rnd() * 1.6) : (rnd() * 2 - 1) * (HALF - 0.4);
      if (Math.abs(rx) > HALF - 0.2) continue;
      if (!clearOf(rs - rr, rs + rr, rx - rr, rx + rr) || !roomFor(rs - rr, rs + rr, rx - rr, rx + rr, 1.1)) continue;
      occupy({ t: "rock", s: rs, x: rx, r: rr }, rs - rr, rs + rr, rx - rr, rx + rr);
      k++;
    }
  }
  function fenceRow(fs, kind) {
    const c = cAt(fs);
    const gap = lane + 0.1 + rnd() * 0.8;
    for (const [x0, x1] of [[-HALF, c - gap], [c + gap, HALF]]) {
      if (x1 - x0 < 0.9 || !roomFor(fs - 0.3, fs + 0.3, x0, x1)) continue;
      occupy({ t: kind, s: fs, len: 0.6, x0, x1 }, fs - 0.3, fs + 0.3, x0, x1);
    }
  }
  // подбор фазы движущегося препятствия: в окно проезда коридором оно безопасно
  function placeMoving(item, s0, s1, safe) {
    const [t0, t1] = passWindow(s0, s1);
    const start = rnd();
    for (let k = 0; k < 50; k++) {
      item.phase = (start + k * 0.02) % 1;
      let ok = true;
      for (let t = t0; t <= t1 && ok; t += 0.02) ok = safe(item, t);
      if (ok) return true;
    }
    return false;
  }

  function chooseType(j) {
    if (j === 0) return "piles";
    if (intro && j === 1) return intro;
    const pool = [];
    for (const [type, weight] of Object.entries(WEIGHTS[m])) {
      if (n < UNLOCK[type] || type === lastType) continue;
      for (let k = 0; k < weight; k++) pool.push(type);
    }
    return pool[Math.floor(rnd() * pool.length)] || "piles";
  }

  // числа на воротах берут своё зерно: правка чисел не перекраивает трассу
  const orng = rng(hash(n * 6151 + 404));
  const plan = mulPlan(n, rows, orng, boss);
  const goal = F * GOAL[m]; // к финишу лучший путь приходит примерно с таким комом
  const gates = [];
  for (let j = 0; j < rows; j++) {
    const type = chooseType(j);
    lastType = type;
    const len = Math.round((type === "bridge" ? 66 : type === "slalom" ? 64 : 40 + rnd() * 12) + d * 10);
    const a = s;
    const b = s + len;
    // какие будут следующие ворота и где лучшие
    const count = n >= 8 && rnd() < 0.15 + d * 0.5 ? 3 : 2;
    const best = Math.floor(rnd() * count);
    const panels = PANELS[count];
    const [p0, p1] = panels[best];
    const nx = clamp((p0 + p1) / 2, -xLim, xLim);
    // коридор: от прошлых ворот через случайную среднюю точку к следующим
    if (type !== "bridge" && type !== "slalom") {
      const mid = clamp((cx + nx) / 2 + (rnd() * 2 - 1) * 3.2, -xLim, xLim);
      point(a + len * 0.45, mid);
      point(b, nx);
      fill[type](a, b, j);
    } else {
      fill[type](a, b, j);
      point(b, nx);
    }
    s = b + 15; // подъезд к воротам без препятствий
    point(s + 8, nx);
    // сколько ещё добавят сугробы до финиша (примерно)
    const ahead = PILE_AHEAD ** (rows - j);
    const later = plan.slice(j + 1).reduce((p, q) => p * (q ? q.grow : 1), 1);
    const row = plan[j];
    if (row) {
      // умножение не уводит лучший путь далеко за цель: ×3 становится ×2, а если и это много — обычным рядом
      const rest = plan.slice(j + 1).filter((q) => !q).length;
      const over = (grow) => (S * grow * later * ahead * MIN_G ** rest) / goal;
      if (row.f === 3 && over(3) > 1.25) (row.f = 2), (row.grow = 2);
      if (over(row.grow) > 1.4) plan[j] = null;
    }
    // рост на «+»-воротах: сколько осталось добрать до цели после будущих умножений
    const plusLeft = plan.slice(j).filter((q) => !q).length;
    const g = clamp((goal / (S * later * ahead)) ** (1 / Math.max(1, plusLeft)), MIN_G, 3.2);
    // два последних ряда перед снеговиком — разгон без красных створок: умножение разрыв только
    // растит, а прибавки дают отставшему догнать
    const safe = boss && j >= rows - BOSS_TAIL;
    const ops = makeOps(S, low, g, count, best, d, n, orng, j, F * 2, plan[j], safe);
    // at — размер на лучшем пути перед воротами (по нему выбрана лучшая створка)
    const gate = { t: "gate", s, best, at: S, panels: panels.map(([x0, x1], k) => ({ x0, x1, op: ops[k] })) };
    items.push(gate);
    gates.push(gate);
    S = applyGate(ops[best], S);
    // небрежный берёт худшие из хороших ворот
    const fair = ops.filter((op) => op.k === "+" || op.k === "*");
    low = Math.min(S, fair.reduce((v, op) => Math.min(v, applyGate(op, low)), Infinity));
    cx = nx;
    s += 9;
  }
  // финишная прямая: снежинки и сугробики
  flakeLine(s + 2, s + 22, 2.4, 0);
  pileLine(s + 6, 3);
  s += 30;
  const length = Math.round(s);
  point(length + 400, 0);

  // ---------- Финал: крепость или босс, потом ступени ×1…×10 ----------
  const best = S;
  const finale = { kind: boss ? "boss" : "fortress", s0: length, walls: [], boss: null, bonus: null, end: 0 };
  let fs = length + 16;
  if (boss) {
    finale.boss = { s: length + 26, hp: Math.max(5, nice(best * BOSS_SHARE)), name: MOUNTAINS[m].boss };
    fs = finale.boss.s + 14;
    finale.bonus = { s: fs, len: 6, steps: 10, cost: Math.max(1, Math.floor((best * (1 - BOSS_SHARE)) / 11)) };
  } else {
    const K = 4 + m;
    const weights = Array.from({ length: K }, (_, k) => 1 + 0.32 * k);
    const sum = weights.reduce((p, q) => p + q, 0);
    for (let k = 0; k < K; k++) finale.walls.push({ s: fs + k * 8, hp: Math.max(1, nice((best * WALL_SHARE * weights[k]) / sum)) });
    fs += K * 8 + 4;
    finale.bonus = { s: fs, len: 6, steps: 10, cost: Math.max(1, Math.floor((best * (1 - WALL_SHARE)) / 11)) };
  }
  finale.end = finale.bonus.s + finale.bonus.len * finale.bonus.steps + 8;

  items.sort((p, q) => p.s - q.s);
  items.forEach((item, i) => (item.id = i));
  // изгибы трассы для сцены: сумма двух волн, у старта и у финала трасса прямая
  const bend = [
    { a: 0.32 + rnd() * 0.3, w: (2 * Math.PI) / (150 + rnd() * 90), p: rnd() * 6.3 },
    { a: 0.12 + rnd() * 0.16, w: (2 * Math.PI) / (60 + rnd() * 40), p: rnd() * 6.3 },
  ];
  return {
    n,
    mountain: m,
    index: (n - 1) % PER_MOUNTAIN,
    boss,
    difficulty: d,
    speed,
    seed: hash(n * 104729 + 7),
    length,
    items,
    gates,
    bridges,
    corridor,
    finale,
    best,
    pileValue: pileMax,
    flakes,
    intro,
    introAt: intro ? (gates[0]?.s ?? 0) + 8 : 0,
    bend,
    rMax,
  };
}
// Какая доля лучшего размера уходит на стены крепости и на босса
export const WALL_SHARE = 0.42;
export const BOSS_SHARE = 0.52;

// Во сколько раз больше targetSize лучший путь приносит к финишу — по горам
const GOAL = [1.6, 1.7, 1.85, 2.0];
// Наименьший рост на «+»-воротах лучшего пути
const MIN_G = 1.12;
// Какую долю размера даёт сугробик, и сколько в среднем добавляют сугробы за участок
const PILE = 0.025;
const PILE_AHEAD = 1.05;
// Сколько последних рядов на уровне со снеговиком идут без умножений и без красных створок
const BOSS_TAIL = 2;

// План умножений: в каких рядах ворот будут ×2/×3 и в каком виде. С 3-го уровня — около трети
// рядов, ×3 — со второй горы и реже ×2. Виды ряда:
//   learn  — ×2 (×3) явно лучше соседней «+»: так игрок узнаёт, что умножение выгодно;
//   versus — ×2 против крупного «+N»: что лучше, зависит от размера кома в эту минуту
//            (маленькому — прибавка, большому — умножение);
//   risk   — ×3 (×2) вплотную к красной «−N»: промахнулся — потерял;
//   trap   — ×2 вплотную к «÷2»: близнецы-противоположности.
// grow — во сколько примерно раз вырастет лучший путь (по нему считаются «+» в других рядах).
// Доли видов по горам: learn, versus, trap, остальное — risk
const STYLES = [null, [0.35, 0.6, 0.95], [0.15, 0.5, 0.8], [0.15, 0.5, 0.8]];
function mulPlan(n, rows, rnd, boss) {
  const plan = new Array(rows).fill(null);
  if (n < 3) return plan;
  const m = mountainOf(n);
  const share = (n < 11 ? 0.3 : 0.32 + 0.02 * m) * (boss ? 0.5 : 1);
  const open = rows - (boss ? BOSS_TAIL : 0);
  const want = n === 3 ? 1 : clamp(Math.round(rows * share + (rnd() - 0.5) * 1.2), 1, open - 1);
  const picked = [];
  if (n === 3) picked.push(1 + Math.floor(rnd() * 2));
  // ряды вразброс: два умножения подряд — только если иначе не помещаются
  for (let tries = 0; picked.length < want && tries < 60; tries++) {
    const j = Math.floor(rnd() * open);
    if (picked.includes(j) || (tries < 40 && picked.some((q) => Math.abs(q - j) < 2))) continue;
    picked.push(j);
  }
  for (const j of picked) {
    const r = rnd();
    let style;
    if (m === 0) style = n < 5 || r < 0.6 ? "learn" : n >= 7 && r > 0.85 ? "versus" : "trap";
    else {
      const [a, b, c] = STYLES[m];
      style = r < a ? "learn" : r < b ? "versus" : r < c ? "trap" : "risk";
    }
    // у первых ворот ком ещё мал и плохая створка там мягкая — без ловушек
    if (j === 0 && (style === "risk" || style === "trap")) style = "learn";
    const triple = style === "learn" ? (m === 0 ? 0 : m === 1 ? 0.2 : 0.3) : style === "risk" ? (m === 1 ? 0.6 : 0.75) : 0;
    const f = rnd() < triple ? 3 : 2;
    plan[j] = { style, f, grow: style === "versus" ? 2.1 : f };
  }
  return plan;
}

// Числа одного ряда ворот. S — размер на лучшем пути, low — у небрежного, g — рост на «+»,
// j — номер ряда, cap — потолок лучшего пути, row — умножение из плана, safe — без красных створок.
function makeOps(S, low, g, count, best, d, n, rnd, j, cap, row, safe) {
  const ops = new Array(count);
  const first = j === 0;
  // минус ощутим и для лучшего пути, но небрежного на ранних горах не убивает;
  // в первых рядах ком ещё мал — минус мягче, чтобы пропущенный сугроб не стоил заезда
  const c = Math.min(0.46 + d * 0.45, j < 3 ? 0.7 : 9);
  const badShare = n <= 1 || safe ? 0 : clamp(0.27 + d * 0.4, 0, 0.83);
  const minus = (share) => ({ k: "-", v: Math.max(1, nice(Math.min(S * share, low * c))) });
  const plusOp = (gg) => ({ k: "+", v: Math.max(2, nice(Math.min(S * (gg - 1), cap - S))) });
  let style = row ? row.style : "plus";
  let f = row ? row.f : 1;
  // лучший путь не раздувает ком сверх того, на что рассчитан коридор
  if (style !== "plus" && S * f > cap) f = S * 2 <= cap ? 2 : 0;
  if (!f) style = "plus";
  let bestOp;
  let rival = null; // особая соседка лучшей створки
  if (style === "plus") bestOp = plusOp(row ? 1.3 : g);
  else if (style === "versus") {
    // «+N» заметно больше или меньше S, чтобы на плановом размере лучший был ясен
    let u = 0.6 + rnd() * 0.8;
    if (Math.abs(u - 1) < 0.15) u = u < 1 ? 0.85 : 1.15;
    const plus = { k: "+", v: Math.max(2, nice(S * u)) };
    const times = { k: "*", v: 2 };
    [bestOp, rival] = applyGate(plus, S) > applyGate(times, S) && S + plus.v <= cap ? [plus, times] : [times, plus];
  } else {
    bestOp = { k: "*", v: f };
    if (style === "risk") rival = minus(0.17 + d * 0.3 + rnd() * 0.1);
    else if (style === "trap") rival = S >= 4 ? { k: "/", v: 2 } : minus(0.3);
  }
  ops[best] = bestOp;
  const top = applyGate(bestOp, S);
  const others = [...Array(count).keys()].filter((k) => k !== best);
  let hasBad = false;
  if (rival) {
    // соседка — вплотную к лучшей створке
    const near = others.filter((k) => Math.abs(k - best) === 1);
    const at = near[Math.floor(rnd() * near.length)];
    ops[at] = rival;
    others.splice(others.indexOf(at), 1);
    hasBad = !isGood(rival);
  }
  others.forEach((p, i) => {
    let op;
    const mustBad = count === 3 && !hasBad && !safe && i === others.length - 1 && d > 0.35;
    // второй плохой вариант в тройке — реже и мягче: иначе невнимательный тает слишком часто
    if (mustBad || rnd() < (hasBad ? (j < 3 ? 0 : badShare * 0.5) : badShare)) {
      const half = !ops.some((o) => o && o.k === "/"); // ÷2 — не больше одной в ряду
      // у первых ворот плохой вариант мягкий: кто проехал мимо сугробов, не тает сразу
      if (first) op = S >= 6 && half && rnd() < 0.5 ? { k: "/", v: 2 } : { k: "-", v: Math.max(1, nice(S * 0.2)) };
      else if (S >= 6 && d > 0.25 && half && rnd() < 0.32) op = { k: "/", v: 2 };
      else op = minus((0.14 + d * 0.34 + rnd() * 0.1) * (hasBad ? 0.7 : 1));
      hasBad = true;
    } else {
      // утешительная «+» рядом с лучшей: у умножения — половина-три четверти его прибавки
      if (bestOp.k === "*") op = { k: "+", v: Math.max(1, nice((top - S) * (0.55 + rnd() * 0.25))) };
      else op = { k: "+", v: Math.max(1, nice(bestOp.v * (0.35 + rnd() * 0.35))) };
      if (applyGate(op, S) >= top) op = { k: "+", v: Math.max(1, Math.floor((top - S) / 2)) };
    }
    ops[p] = op;
  });
  return ops;
}

// Безопасный коридор как функция (для проверок и подсказок)
export function corridorAt(level, s) {
  const c = level.corridor;
  for (let i = c.length - 1; i > 0; i--) {
    if (s >= c[i - 1][0]) {
      const [s0, x0] = c[i - 1];
      const [s1, x1] = c[i];
      return s >= s1 ? x1 : x0 + ((x1 - x0) * (s - s0)) / (s1 - s0);
    }
  }
  return c[0][1];
}
export const bridgeAt = (level, s) => level.bridges.find((b) => s >= b.s0 && s <= b.s1) || null;

// Направление трассы (радианы) в точке s — только для сцены
export function heading(level, s) {
  const u = clamp(s, 0, level.length - 30);
  const ease = clamp(u / 60, 0, 1);
  let a = 0;
  for (const b of level.bend) a += b.a * (Math.sin(b.w * u + b.p) - Math.sin(b.p));
  return a * ease * ease;
}

// Проверка уровня: идеальный ком едет точно по коридору и не задевает ничего.
// Возвращает список нарушений (пустой — уровень честный).
export function validate(level) {
  const problems = [];
  const rMax = level.rMax;
  for (const it of level.items) {
    if (it.t === "pile" || it.t === "flake" || it.t === "gate" || it.t === "ramp") continue;
    if (it.jump) continue; // перепрыгивается с трамплина
    // ком любого размера до rMax на коридоре в момент проезда
    for (let ds = -4; ds <= 4; ds += 0.25) {
      const ss = it.s + ds;
      const x = corridorAt(level, ss);
      for (const r of [0.6, (0.6 + rMax) / 2, rMax]) {
        if (touches(it, ss, x, 0, r, ss / level.speed)) {
          problems.push(`уровень ${level.n}: ${it.t} на s=${it.s.toFixed(1)} задевает коридор`);
          ds = 99;
          break;
        }
      }
    }
  }
  for (const g of level.gates) {
    const x = corridorAt(level, g.s);
    const k = g.panels.findIndex((p) => x >= p.x0 && x < p.x1);
    if (k !== g.best) problems.push(`уровень ${level.n}: коридор идёт не через лучшие ворота на s=${g.s}`);
  }
  for (const b of level.bridges) {
    for (let ss = b.s0; ss <= b.s1; ss += 1) if (Math.abs(corridorAt(level, ss)) > BRIDGE_HALF - 0.3) problems.push(`уровень ${level.n}: коридор мимо моста`);
  }
  for (const it of level.items) if (Math.abs(it.x ?? 0) > HALF) problems.push(`уровень ${level.n}: ${it.t} за краем трассы`);
  return problems;
}
