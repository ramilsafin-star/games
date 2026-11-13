// Карты «Рубежа»: коробки столкновений, украшения, точки, маршруты патрулей и фонари.
// Без графики: из этого строятся и мир для правил (world.js), и сцена (scene.js).
// Ось x — восток, z — юг→север (север = +z), y — вверх. Метры.
import { TAU } from "./util.js?v=83cf1cc4";

// Облики поверхностей: tex — рисунок текстуры, c — цвет
export const SKINS = {
  asphalt: { tex: "asphalt", c: "#4a4f57" },
  concrete: { tex: "concrete", c: "#9a9c9e" },
  concreteDark: { tex: "concrete", c: "#6b6e73" },
  wall: { tex: "panel", c: "#b9b3a6" },
  wallBlue: { tex: "panel", c: "#5f7488" },
  brick: { tex: "brick", c: "#9a5a44" },
  metal: { tex: "metal", c: "#7c858f" },
  metalDark: { tex: "metal", c: "#3f454d" },
  hazard: { tex: "hazard", c: "#e8b624" },
  crate: { tex: "crate", c: "#b58a52" },
  crateGreen: { tex: "crate", c: "#5f7a4a" },
  contRed: { tex: "corr", c: "#b8432f" },
  contBlue: { tex: "corr", c: "#2f6fb0" },
  contGreen: { tex: "corr", c: "#3f8a55" },
  contYellow: { tex: "corr", c: "#d9a227" },
  contOrange: { tex: "corr", c: "#d8662a" },
  contGrey: { tex: "corr", c: "#7d8790" },
  contTeal: { tex: "corr", c: "#2f9a98" },
  sand: { tex: "sand", c: "#d8b27a" },
  rock: { tex: "rock", c: "#a77b56" },
  tile: { tex: "tile", c: "#d7dadc" },
  tileDark: { tex: "tile", c: "#5d636b" },
  tileGreen: { tex: "tile", c: "#4f8f7f" },
  carpet: { tex: "carpet", c: "#4a5466" },
  wood: { tex: "wood", c: "#8a6040" },
  white: { tex: "panel", c: "#e9ecef" },
  solar: { tex: "solar", c: "#29457a" },
  glass: { tex: "glass", c: "#9fd8ff" },
  server: { tex: "server", c: "#2a2f38" },
  dark: { tex: "concrete", c: "#2b2e33" },
  rubber: { tex: "concrete", c: "#2a2a2a" },
  orange: { tex: "panel", c: "#e3742a" },
  green: { tex: "panel", c: "#5b8f3e" },
  red: { tex: "panel", c: "#b8322b" },
  inv: { tex: "none", c: "#000000" },
};

// ---------- Конструктор карты ----------
function make(meta) {
  const m = {
    ...meta,
    boxes: [], decor: [], points: {}, routes: {}, lamps: [], water: [], perches: [], zones: {},
  };
  const B = (o) => {
    m.boxes.push(o);
    return o;
  };
  // коробка по углам: x0,z0 — x1,z1, высота h от y (по умолчанию от земли карты)
  m.box = (x0, z0, x1, z1, h, skin, o = {}) => {
    const y0 = o.y ?? m.floor;
    return B({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, y0, y1: y0 + h, yaw: 0, skin, ...o });
  };
  // повёрнутая коробка по центру
  m.rbox = (cx, cz, w, d, h, yaw, skin, o = {}) => {
    const y0 = o.y ?? m.floor;
    return B({ cx, cz, hw: w / 2, hd: d / 2, y0, y1: y0 + h, yaw, skin, ...o });
  };
  // площадка, на которую можно встать
  m.plat = (x0, z0, x1, z1, top, skin, o = {}) => m.box(x0, z0, x1, z1, top - (o.y ?? m.floor), skin, { walk: true, ...o });
  // лестница: начало x,z, направление dir ('x+','x-','z+','z-'), ширина, ступени, подъём одной, длина одной
  m.stairs = (x, z, dir, width, steps, rise, run, skin, base = m.floor) => {
    for (let i = 0; i < steps; i++) {
      const a = i * run, b = (i + 1) * run, top = base + rise * (i + 1);
      if (dir === "x+") m.plat(x + a, z - width / 2, x + b, z + width / 2, top, skin, { y: base, stair: true });
      if (dir === "x-") m.plat(x - b, z - width / 2, x - a, z + width / 2, top, skin, { y: base, stair: true });
      if (dir === "z+") m.plat(x - width / 2, z + a, x + width / 2, z + b, top, skin, { y: base, stair: true });
      if (dir === "z-") m.plat(x - width / 2, z - b, x + width / 2, z - a, top, skin, { y: base, stair: true });
    }
  };
  // контейнер: x,z — угол, len — длина вдоль оси ax ('x' или 'z'), stack — ярусов
  m.cont = (x, z, len, ax, skin, stack = 1, o = {}) => {
    const W = 2.44, H = 2.6;
    const x1 = ax === "x" ? x + len : x + W, z1 = ax === "x" ? z + W : z + len;
    for (let s = 0; s < stack; s++) m.box(x, z, x1, z1, H, skin, { y: m.floor + s * H, cont: ax, walk: true, ...o, skin: s && o.top ? o.top : skin });
  };
  m.crate = (x, z, s = 1.25, skin = "crate", stack = 1) => {
    for (let i = 0; i < stack; i++) m.box(x - s / 2, z - s / 2, x + s / 2, z + s / 2, s, skin, { y: m.floor + i * s, walk: true, crate: true });
  };
  m.pt = (name, x, z, extra = {}) => (m.points[name] = { x, z, y: extra.y ?? m.floor, yaw: extra.yaw ?? 0, ...extra });
  m.route = (name, list) => (m.routes[name] = list.map(([x, z]) => ({ x, z })));
  m.lamp = (x, y, z, color = "#ffd59a", r = 9, power = 1, o = {}) => m.lamps.push({ x, y, z, color, r, power, ...o });
  m.d = (type, o) => m.decor.push({ type, ...o });
  m.zone = (name, x, z, r) => (m.zones[name] = { x, z, r });
  // стена с проёмами: от (x0,z0) до (x1,z1) по одной оси, gaps — [[от, до]] вдоль стены
  m.wall = (x0, z0, x1, z1, h, t, skin, gaps = [], o = {}) => {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const sorted = gaps.slice().sort((p, q) => p[0] - q[0]);
    let s = a0;
    const segs = [];
    for (const [g0, g1] of sorted) {
      if (g0 > s) segs.push([s, g0]);
      s = Math.max(s, g1);
    }
    if (s < a1) segs.push([s, a1]);
    for (const [p, q] of segs) {
      if (alongX) m.box(p, z0 - t / 2, q, z0 + t / 2, h, skin, o);
      else m.box(x0 - t / 2, p, x0 + t / 2, q, h, skin, o);
    }
    // перемычки над проёмами
    if (o.lintel)
      for (const [g0, g1] of sorted) {
        if (alongX) m.box(g0, z0 - t / 2, g1, z0 + t / 2, h - o.lintel, skin, { y: (o.y ?? m.floor) + o.lintel, lintelOf: true, noNav: true });
        else m.box(x0 - t / 2, g0, x0 + t / 2, g1, h - o.lintel, skin, { y: (o.y ?? m.floor) + o.lintel, lintelOf: true, noNav: true });
      }
  };
  // ряд стеклянных панелей (бьются от выстрелов)
  m.glassRow = (x0, z0, x1, z1, h, gaps = [], pane = 2.2, o = {}) => {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const t = 0.08;
    const free = (p, q) => !gaps.some(([g0, g1]) => q > g0 + 1e-6 && p < g1 - 1e-6);
    for (let p = a0; p < a1 - 0.05; p += pane) {
      const q = Math.min(a1, p + pane);
      if (!free(p, q)) {
        // панель частично в проёме — режем
        for (const [g0, g1] of gaps) {
          if (g0 > p && g0 < q) m.glassRow(alongX ? p : x0, alongX ? z0 : p, alongX ? g0 : x0, alongX ? z0 : g0, h, [], pane, o);
          if (g1 > p && g1 < q) m.glassRow(alongX ? g1 : x0, alongX ? z0 : g1, alongX ? q : x0, alongX ? z0 : q, h, [], pane, o);
        }
        continue;
      }
      if (alongX) m.box(p + 0.02, z0 - t / 2, q - 0.02, z0 + t / 2, h, "glass", { glass: o.solid ? "solid" : "break", ...o });
      else m.box(x0 - t / 2, p + 0.02, x0 + t / 2, q - 0.02, h, "glass", { glass: o.solid ? "solid" : "break", ...o });
    }
  };
  return m;
}

// ================= 1. Северный порт =================
function port() {
  const m = make({ id: "port", name: "Северный порт", floor: 0, bounds: [-36, -34, 36, 36], ground: "asphalt" });
  // Причал на юге: швартовые тумбы, ящики
  for (const x of [-30, -18, -6, 6, 18, 30]) m.box(x - 0.3, -33.4, x + 0.3, -32.8, 0.7, "metalDark", { walk: true });
  m.crate(-12, -28.5, 1.25, "crate", 2);
  m.crate(-10.6, -28.5, 1.25, "crate");
  m.crate(4, -27, 1.25, "crateGreen", 2);
  m.crate(14, -29, 1.25, "crate");
  m.crate(15.3, -29, 1.25, "crate");
  m.cont(-26, -31, 6.1, "x", "contGrey");
  m.cont(20, -27.5, 6.1, "x", "contTeal", 2);
  // Контейнерный двор (x −8..22, z −20..18): ряды с проулками
  m.cont(-8, -18.5, 12.2, "x", "contRed");
  m.cont(7, -18.5, 6.1, "x", "contBlue", 2);
  m.cont(13.1, -18.5, 6.1, "x", "contGreen");
  m.cont(-6, -11.2, 6.1, "x", "contYellow", 2);
  m.cont(3, -11.2, 12.2, "x", "contOrange");
  m.cont(18, -12.5, 6.1, "z", "contGrey");
  // Смотровая: контейнер с лестницей на крышу
  m.cont(-8, -3.2, 6.1, "x", "contBlue");
  m.stairs(-1.9, -2, "x+", 2.2, 6, 2.6 / 6, 0.5, "metal");
  m.cont(5, -3.2, 6.1, "x", "contRed", 2);
  m.cont(14, -3.2, 8.5, "x", "contTeal");
  m.cont(-8, 4.3, 6.1, "z", "contGreen", 2);
  m.cont(-1, 3.8, 12.2, "x", "contYellow");
  m.cont(15, 3.8, 6.1, "x", "contOrange", 2);
  m.cont(-4, 11.2, 6.1, "x", "contGrey");
  m.cont(5, 11.2, 6.1, "x", "contBlue", 2);
  m.cont(12.5, 10, 6.1, "z", "contRed");
  m.cont(17, 12, 5, "x", "contGreen");
  m.crate(2, 7.5, 1.25, "crate", 2);
  m.crate(10, -6.6, 1.25, "crateGreen");
  m.crate(-4, -14.6, 1.25, "crate");
  m.crate(20.5, -1.5, 1.25, "crate", 2);
  // Склад на западе (x −34..−14, z −8..16): стены с воротами, стеллажи
  const WH = 7;
  m.wall(-34, -8, -14, -8, WH, 0.5, "brick", [[-27.5, -23]], { lintel: 4 });
  m.wall(-34, 16, -14, 16, WH, 0.5, "brick", [[-20.5, -17]], { lintel: 3.2 });
  m.wall(-34, -8, -34, 16, WH, 0.5, "brick");
  m.wall(-14, -8, -14, 16, WH, 0.5, "brick", [[0.5, 6]], { lintel: 4.4 });
  for (const x of [-31, -27, -23]) {
    m.box(x - 0.55, -5.5, x + 0.55, -0.5, 2.8, "metal", { shelf: true });
    m.box(x - 0.55, 1.5, x + 0.55, 6.5, 2.8, "metal", { shelf: true });
  }
  m.box(-19.5, -4.2, -17.5, -1.8, 2, "orange", { walk: true }); // погрузчик
  m.crate(-18, 4, 1.25, "crate", 2);
  m.crate(-20, 9, 1.25, "crateGreen");
  m.crate(-17, 12.5, 1.25, "crate");
  m.box(-33.5, 12, -30, 15.5, 1.1, "metalDark", { walk: true }); // пульт у ретранслятора A
  m.d("ceiling", { x0: -34, z0: -8, x1: -14, z1: 16, y: WH, skin: "metalDark", skylights: true });
  // Административный корпус на северо-западе
  m.box(-36, 22, -16, 36, 9, "wallBlue", { building: true });
  m.box(-16, 27, -12, 31, 0.3, "concrete", { walk: true }); // крыльцо
  // Стоянка грузовиков на северо-востоке
  m.box(4, 25, 6.5, 28, 3, "red", { truckCab: true });
  m.cont(6.5, 25.3, 12.2, "x", "contBlue");
  m.box(4, 30.5, 6.5, 33.5, 3, "white", { truckCab: true });
  m.cont(6.5, 30.8, 12.2, "x", "contOrange");
  m.crate(23, 27, 1.25, "crate", 2);
  m.crate(-6, 27, 1.25, "crate");
  // Северный забор с воротами
  m.wall(-16, 35.7, 36, 35.7, 3, 0.2, "metal", [[-4, 4]], { pass: true, fence: true });
  m.box(-4.6, 35.2, -4, 36.2, 3.4, "hazard");
  m.box(4, 35.2, 4.6, 36.2, 3.4, "hazard");
  // Восточная набережная: краны, будка управления (B)
  for (const [x, z] of [[25.5, -15], [32.5, -15], [25.5, -7], [32.5, -7], [25.5, 12], [32.5, 12], [25.5, 20], [32.5, 20]]) m.box(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 14, "hazard", { craneLeg: true });
  m.d("crane", { x0: 25.5, x1: 32.5, z0: -15, z1: -7, h: 14, color: "#e0a321" });
  m.d("crane", { x0: 25.5, x1: 32.5, z0: 12, z1: 20, h: 14, color: "#d4552a" });
  m.box(26, 3, 30, 7, 3.2, "white", { booth: true });
  m.box(25.5, 7.6, 27.5, 9.6, 1.2, "metalDark", { walk: true }); // пульт B
  m.cont(29.5, -2, 6.1, "z", "contGrey");
  m.cont(24, -26, 6.1, "z", "contRed", 2);
  m.cont(30, -24, 6.1, "z", "contYellow");
  for (const z of [-30, -20, -10, 0, 10, 20, 30]) m.box(34.6, z - 0.3, 35.2, z + 0.3, 0.7, "metalDark", { walk: true });
  m.d("rails", { x0: 25.5, x1: 25.5, z0: -34, z1: 34 });
  m.d("rails", { x0: 32.5, x1: 32.5, z0: -34, z1: 34 });
  m.d("ship", { x: 52, z: 0, len: 70 });
  m.d("ship", { x: -6, z: -52, len: 46, rot: 1 });
  m.d("sea", { y: -1.6 });
  // Фонарные столбы
  for (const [x, z] of [[-10, -22], [8, -22], [22, -22], [-10, 20], [8, 20], [22, 20], [-2, -30], [30, -12], [30, 0], [30, 16]]) {
    m.box(x - 0.18, z - 0.18, x + 0.18, z + 0.18, 7, "metalDark", { pole: true });
    m.d("lamp", { x, z, h: 7 });
    m.lamp(x, 6.6, z, "#ffc27a", 11, 1.1, { street: true });
  }
  m.lamp(-24, 6.4, -2, "#cfe6ff", 10, 0.9, { inside: true });
  m.lamp(-24, 6.4, 9, "#cfe6ff", 10, 0.9, { inside: true });
  m.lamp(-31, 2.5, 13.5, "#ff5a3a", 5, 1.2, { relay: "A" });
  m.lamp(27, 2.5, 8.6, "#ff5a3a", 5, 1.2, { relay: "B" });
  m.d("relay", { x: -31.8, z: 13.8, site: "A" });
  m.d("relay", { x: 26.5, z: 8.6, site: "B" });
  m.d("sign", { x: -14.3, y: 5.2, z: 3.2, yaw: Math.PI / 2, text: "СКЛАД 3", w: 4.4 });
  m.d("sign", { x: 28, y: 3.7, z: 2.95, yaw: Math.PI, text: "ПУЛЬТ КРАНОВ", w: 3.6 });
  m.d("sign", { x: 0, y: 4.2, z: 35.4, yaw: Math.PI, text: "ВЫЕЗД", w: 3 });
  m.d("markings", { kind: "road", z: -22, x0: -36, x1: 36 });
  m.d("markings", { kind: "road", z: 20, x0: -14, x1: 36 });
  m.d("spot", { x: 30, z: -11, h: 14, aim: [10, 0, -2], color: "#dff1ff" });
  m.d("spot", { x: 30, z: 16, h: 14, aim: [12, 0, 10], color: "#ffe2b0" });
  // Точки
  m.pt("S", -4, -30.5, { yaw: Math.PI });
  m.pt("S2", 10, -30.5, { yaw: Math.PI });
  m.pt("A", -31.5, 11, {});
  m.pt("B", 27.5, 10.5, {});
  m.pt("X", 0, 32.5, {});
  m.pt("yard", 6, 0);
  m.pt("TA", 0, -29, { yaw: Math.PI });
  m.pt("TB", 4, 29, { yaw: 0 });
  m.zone("yard", 2, 1, 15);
  const P = {
    y1: [-6, -14.5], y2: [3, -14.5], y3: [12, -15], y4: [21, -15], y5: [-2, -6.8], y6: [10, -7], y7: [21, -6.8], y8: [-2, 0.8],
    y9: [11, 0.8], y10: [21, 1.2], y11: [-3, 8.3], y12: [10, 8.4], y13: [20, 8.5], y14: [2, 15.5], y15: [16, 16.5],
    w1: [-30, -6.5], w2: [-25, -3], w3: [-20.5, 2], w4: [-25, 10], w5: [-29, 0], w6: [-16.5, 8], w7: [-21, 14],
    q1: [28.5, -20], q2: [29, -10], q3: [33, 2], q4: [29, 12], q5: [29, 24], q6: [22, -4],
    n1: [-10, 18.4], n2: [0, 21], n3: [14, 22], n4: [26, 29], n5: [0, 29], n6: [-12, 32],
    s1: [-18, -26], s2: [-6, -22], s3: [10, -23.5], s4: [24, -20],
  };
  for (const [k, v] of Object.entries(P)) m.pt(k, v[0], v[1]);
  m.route("yardLoop", [P.y1, P.y2, P.y3, P.y7, P.y10, P.y13, P.y12, P.y11, P.y8, P.y5]);
  m.route("yardCross", [P.y4, P.y6, P.y9, P.y12, P.y14, P.y9, P.y6]);
  m.route("quay", [P.q1, P.q2, P.q6, P.q3, P.q4, P.q5, P.q4, P.q3, P.q2]);
  m.route("wh", [P.w1, P.w2, P.w5, P.w4, P.w7, P.w6, P.w3, P.w2]);
  m.route("north", [P.n1, P.n2, P.n3, P.n4, P.n3, P.n2]);
  m.route("south", [P.s1, P.s2, P.s3, P.s4, P.s3, P.s2]);
  m.perches.push([2, 7.5, -8], [15, 8, -10], [29, 10, -3], [-10, 9, 14], [12, 8, 22], [-20, 9.5, 19], [22, 8, 6]);
  // Камеры (для тихого задания): точка, высота и направление взгляда
  m.pt("cam1", -14.4, -8.4, { y: 4.2, yaw: Math.PI * 0.75 });
  m.pt("cam2", 18.2, -12.2, { y: 3.1, yaw: Math.PI * 0.9 });
  m.pt("cam3", 25.9, 2.7, { y: 3.4, yaw: Math.PI * 1.1 });
  m.pt("cam4", 6.5, 13.8, { y: 5.4, yaw: Math.PI * 1.25 });
  return m;
}

// ================= 2. Станция «Купол» =================
function dome() {
  const m = make({ id: "dome", name: "Станция «Купол»", floor: 0, bounds: [-38, -36, 38, 36], ground: "sand" });
  const C = [0, 6], R = 13, N = 18;
  // Стена купола: 18 сегментов, проёмы на юге, западе и востоке
  const open = new Set([13, 9, 17]);
  for (let i = 0; i < N; i++) {
    if (open.has(i)) continue;
    const a = ((i + 0.5) / N) * TAU;
    const x = C[0] + Math.cos(a) * R, z = C[1] + Math.sin(a) * R;
    m.rbox(x, z, 0.7, (TAU * R) / N + 0.25, 5, -a, "white", { domeWall: true });
  }
  m.d("dome", { x: C[0], z: C[1], r: R, h: 11 });
  m.plat(-12.5, -6.5, 12.5, 18.5, 0.05, "tile", { noNav: false, floorOnly: true });
  // Реактор в центре (B)
  m.rbox(0, 8, 3.2, 3.2, 9, 0, "metal", { reactor: true });
  m.rbox(0, 8, 3.2, 3.2, 9, Math.PI / 4, "metal", { reactor: true });
  m.d("reactor", { x: 0, z: 8, h: 9 });
  m.box(-1.2, 3.4, 1.2, 4.6, 1.1, "metalDark", { walk: true }); // пульт реактора
  // Лаборатория на западе: перегородка и столы
  m.wall(-12.6, 9, -4, 9, 3, 0.3, "white", [[-9, -7]]);
  m.wall(-4, 9, -4, 15, 3, 0.3, "white", [[11.5, 13.5]]);
  m.box(-11, 11.5, -8, 12.4, 1.0, "white", { walk: true });
  m.box(-11, 14.5, -7.5, 15.4, 1.0, "white", { walk: true });
  m.box(-10.5, 0, -7.5, 1, 1.0, "white", { walk: true });
  m.box(-10.5, 4, -7.5, 5, 1.0, "white", { walk: true });
  m.crate(-5.5, -2, 1.1, "crateGreen", 2);
  // Оранжерея на востоке: грядки
  for (const z of [-0.5, 3.5, 12.5]) m.box(4.5, z, 10.5, z + 1.1, 0.8, "wood", { walk: true, planter: true });
  m.box(6, 7.2, 10, 8.4, 0.8, "wood", { walk: true, planter: true });
  m.d("plants", { x0: 4.5, x1: 10.5, rows: [0.05, 4.05, 13.05, 7.8] });
  // Солнечное поле на западе: ряды панелей (низкое укрытие)
  for (let z = -27; z <= 21; z += 5) {
    const gap = z % 2 === 0 ? -26 : -30;
    // поляна вокруг щитовой
    if (z === -2) {
      m.box(-36, z, -31, z + 1.3, 1.05, "solar", { walk: true, solar: true });
      continue;
    }
    m.box(-36, z, gap - 1, z + 1.3, 1.05, "solar", { walk: true, solar: true });
    m.box(gap + 1.5, z, -17, z + 1.3, 1.05, "solar", { walk: true, solar: true });
  }
  // Щитовая (точка удержания)
  m.box(-28.5, -1.4, -25.5, 1.6, 2.8, "orange", { hut: true });
  m.box(-20.5, 0.8, -19, 1.8, 1.0, "metalDark", { walk: true });
  m.crate(-23.5, -4.2, 1.1, "crateGreen");
  m.zone("hold", -22.5, -1.5, 5);
  // Восток: вышка связи (A) и будка
  m.box(22, 9, 30, 15, 3.4, "white", { hut: true });
  for (const [x, z] of [[24.5, 19], [28.5, 19], [24.5, 23], [28.5, 23]]) m.box(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 18, "metal", { mastLeg: true });
  m.d("mast", { x: 26.5, z: 21, h: 26 });
  m.box(20, 17, 21.4, 18.4, 1.1, "metalDark", { walk: true });
  // Гараж вездеходов на юго-востоке (выход)
  m.wall(16, -28, 34, -28, 5, 0.5, "metal");
  m.wall(16, -16, 34, -16, 5, 0.5, "metal", [[16, 19.5]]);
  m.wall(34, -28, 34, -16, 5, 0.5, "metal");
  m.box(20, -26.5, 22.6, -22, 2.2, "orange", { rover: true, walk: true });
  m.box(27, -26.5, 29.6, -22, 2.2, "white", { rover: true, walk: true });
  m.d("ceiling", { x0: 16, z0: -28, x1: 34, z1: -16, y: 5, skin: "metal" });
  m.zone("exit", 25, -20, 3.5);
  // Север: жилые модули
  m.rbox(-9, 29, 10, 4.2, 3.6, 0, "white", { habitat: true });
  m.rbox(9, 29, 10, 4.2, 3.6, 0, "white", { habitat: true });
  m.rbox(0, 31, 8, 2.2, 2.6, 0, "metal", { habitat: true });
  m.crate(-2, 23.5, 1.25, "crate", 2);
  m.crate(14, 22, 1.25, "crateGreen");
  // Юг: площадка шаттла
  m.d("pad", { x: 0, z: -25, r: 6 });
  m.d("shuttle", { x: 0, z: -32 });
  m.crate(-7, -24, 1.25, "crate", 2);
  m.crate(7.5, -22, 1.25, "crate");
  m.crate(8.8, -22, 1.25, "crateGreen");
  // Скалы в дюнах
  for (const [x, z, s, a] of [[-12, -18, 2.6, 0.3], [12, -12, 2.2, 1.1], [18, 0, 3, 0.7], [-16, 28, 2.8, 2.1], [30, 30, 3.4, 0.4], [-30, 30, 3, 1.4], [14, 32, 2.4, 0.9], [34, -2, 2.6, 0.2], [-14, -30, 2.2, 1.8]]) {
    m.rbox(x, z, s * 1.4, s, s * 0.8, a, "rock", { rock: true, walk: true });
  }
  m.d("dunes", {});
  for (const [x, z] of [[-14, -14], [14, -14], [-16, 20], [16, 20], [0, -18], [20, 5]]) {
    m.box(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 5, "metalDark", { pole: true });
    m.d("lamp", { x, z, h: 5, white: true });
    m.lamp(x, 4.6, z, "#e6f0ff", 9, 0.9, { street: true });
  }
  m.lamp(0, 9.5, 6, "#7fe8ff", 14, 1.0, { inside: true });
  m.lamp(-8, 2.8, 12, "#e6f0ff", 7, 0.8, { inside: true });
  m.lamp(7, 2.8, 4, "#bfffb0", 7, 0.8, { inside: true });
  m.lamp(25, 4.5, -22, "#ffe2b0", 9, 0.9, { inside: true });
  m.lamp(20.6, 2.4, 17.6, "#ff5a3a", 4, 1, { relay: "A" });
  m.lamp(0, 2.4, 4, "#ff5a3a", 4, 1, { relay: "B" });
  m.d("relay", { x: 20.7, z: 17.7, site: "A" });
  m.d("sign", { x: 0, y: 4.2, z: -6.6, yaw: Math.PI, text: "КУПОЛ", w: 3.2 });
  m.d("sign", { x: 25, y: 4.2, z: -15.7, yaw: 0, text: "ГАРАЖ", w: 3 });
  m.pt("S", 0, -27.5, { yaw: Math.PI });
  m.pt("A", 22.6, 16.6);
  m.pt("B", 0, 2.4);
  m.pt("H", -9.5, 13);
  m.pt("X", 25, -20);
  m.pt("TA", 0, -26, { yaw: Math.PI });
  m.pt("TB", 0, 27, { yaw: 0 });
  const P = {
    d1: [0, 0], d2: [-8, 2.5], d3: [-9, 13.45], d4: [6, 1.8], d5: [7.5, 10.5], d6: [0, 14.5], d7: [-6.5, 16],
    s1: [-21, -24], s2: [-21, -9], s3: [-28, 5], s4: [-21, 13], s5: [-33, -14], s6: [-22, 23],
    e1: [16, 6], e2: [26, 6], e3: [32, 12], e4: [26, 26], e5: [18, 22], e6: [14, -8], e7: [24, -12],
    n1: [-14, 24], n2: [0, 25], n3: [16, 26], g1: [18, -22], g2: [25, -19], g3: [31, -20],
    p1: [-8, -18], p2: [8, -16], p3: [0, -10], p4: [-16, -6], p5: [16, -4],
  };
  for (const [k, v] of Object.entries(P)) m.pt(k, v[0], v[1]);
  m.route("domeLoop", [P.d1, P.d2, P.d3, P.d7, P.d6, P.d5, P.d4]);
  m.route("solar", [P.s1, P.s2, P.s3, P.s4, P.s6, P.s4, P.s3, P.s5]);
  m.route("east", [P.e6, P.e1, P.e2, P.e3, P.e4, P.e5, P.e1]);
  m.route("north", [P.n1, P.n2, P.n3, P.n2]);
  m.route("garage", [P.g1, P.g2, P.g3, P.e7, P.e6]);
  m.route("south", [P.p1, P.p3, P.p2, P.p5, P.p3, P.p4]);
  m.perches.push([-20, 7, -16], [20, 8, -6], [0, 13.5, 6], [-24, 8, 16], [26, 13, 21], [10, 8, 24], [-10, 8, -24], [12, 7, -26]);
  m.pt("cam1", -12.2, 6, { y: 3.5, yaw: -Math.PI / 2 });
  m.pt("cam2", 21.8, 12, { y: 3.4, yaw: Math.PI / 2 });
  return m;
}

// ================= 3. Небоскрёб «Шпиль», 52 этаж =================
function tower() {
  const m = make({ id: "tower", name: "Небоскрёб «Шпиль»", floor: 0, bounds: [-31, -21, 47, 21], ground: "carpet", indoor: true });
  const H = 3.4;
  // Внешние окна (не бьются) и выход на террасу
  m.glassRow(-30.6, -20.6, 30.6, -20.6, H, [], 3, { solid: true, facade: true });
  m.glassRow(-30.6, 20.6, 30.6, 20.6, H, [], 3, { solid: true, facade: true });
  m.glassRow(-30.6, -20.6, -30.6, 20.6, H, [], 3, { solid: true, facade: true });
  m.glassRow(30.6, -20.6, 30.6, 20.6, H, [[-4, 4]], 3, { solid: true, facade: true });
  m.box(30.4, -14.2, 47, -13.8, 1.1, "glass", { glass: "solid", rail: true });
  m.box(30.4, 13.8, 47, 14.2, 1.1, "glass", { glass: "solid", rail: true });
  m.box(46.6, -14, 47, 14, 1.1, "glass", { glass: "solid", rail: true });
  // невидимые стены над пропастью
  m.box(30.6, -21, 47, -14.2, 4, "inv", { inv: true });
  m.box(30.6, 14.2, 47, 21, 4, "inv", { inv: true });
  m.box(30.4, -14.2, 47, -13.8, 3, "inv", { inv: true, y: 1.1 });
  m.box(30.4, 13.8, 47, 14.2, 3, "inv", { inv: true, y: 1.1 });
  m.box(46.6, -14, 47, 14, 3, "inv", { inv: true, y: 1.1 });
  m.plat(30.6, -14, 46.6, 14, 0.02, "concrete", { terrace: true, floorOnly: true });
  m.d("ceiling", { x0: -30.6, z0: -20.6, x1: 30.6, z1: 20.6, y: H, skin: "white", panels: true });
  // Лифтовое ядро в центре
  m.box(-6, -5, 6, 5, H, "concreteDark", { core: true });
  m.d("elevators", { x0: -6, x1: 6, z0: -5, z1: 5 });
  for (const x of [-20, -10, 10, 20]) for (const z of [-12.5, 12.5]) m.box(x - 0.45, z - 0.45, x + 0.45, z + 0.45, H, "white", { column: true });
  // Серверная (A) на северо-западе
  m.wall(-30.6, 10, -18, 10, H, 0.25, "wallBlue", [[-23, -20.5]]);
  m.wall(-18, 10, -18, 20.6, H, 0.25, "wallBlue", [[14, 16.2]]);
  for (const z of [12.4, 15.2, 18]) m.box(-29, z - 0.4, -21, z + 0.4, 2.2, "server", { rack: true });
  m.d("serverGlow", { x0: -29, x1: -21, zs: [12.4, 15.2, 18] });
  // Переговорная на западе: стеклянные стены
  m.wall(-30.6, 4, -20, 4, H, 0.2, "wallBlue");
  m.glassRow(-30.4, -4, -20, -4, H, [], 2.4);
  m.glassRow(-20, -4, -20, 4, H, [[-1, 1.2]], 2.4);
  m.box(-28, -1.5, -22.5, 1.5, 0.76, "wood", { table: true, walk: true });
  // Открытое пространство на юго-западе: столы и перегородки
  for (const x of [-26, -19, -12]) {
    for (const z of [-16.5, -10]) {
      m.box(x - 2, z - 0.9, x + 2, z + 0.9, 0.76, "white", { desk: true, walk: true });
      m.box(x - 2, z - 0.06, x + 2, z + 0.06, 1.28, "carpet", { partition: true });
    }
  }
  m.box(-30.4, -20.4, -27, -17, H, "concreteDark", { stairwell: true });
  // Кабинет директора (B) на северо-востоке
  m.glassRow(14, 10, 14, 20.4, H, [[13, 15.2]], 2.6);
  m.wall(14, 10, 30.6, 10, H, 0.25, "wood", [[24, 26.2]]);
  m.box(19, 15, 24, 16.8, 0.8, "wood", { desk: true, walk: true });
  m.box(27.5, 11.5, 29.8, 19, 1.0, "carpet", { sofa: true, walk: true });
  m.box(15, 19.2, 20, 20.3, 2.2, "wood", { shelf: true });
  // Кафе на юго-востоке
  m.box(14, -10.3, 22, -9.2, 1.1, "wood", { counter: true, walk: true });
  for (const [x, z] of [[16, -16], [21, -16], [26, -16], [18.5, -13], [24, -13], [28, -10]]) m.box(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.76, "white", { table: true, walk: true });
  m.box(8, -20.3, 12, -18.8, 1, "carpet", { sofa: true, walk: true });
  // Лобби: стойка ресепшн и кадки
  m.box(9, -2, 11, 3, 1.15, "white", { reception: true, walk: true });
  for (const [x, z] of [[8, 8], [8, -8], [26, 7], [26, -6], [-8, 8], [-8, -8]]) m.box(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 1.0, "concrete", { planter: true, walk: true });
  m.d("plants", { pots: [[8, 8], [8, -8], [26, 7], [26, -6], [-8, 8], [-8, -8]] });
  // Терраса с вертолётной площадкой
  m.plat(36, -4.5, 44.5, 4.5, 0.42, "concreteDark", { helipad: true });
  m.d("helipad", { x: 40.25, z: 0, r: 4.2, y: 0.42 });
  m.box(32, -12.5, 34.5, -9.5, 1.6, "metal", { hvac: true, walk: true });
  m.box(32, 9.5, 34.5, 12.5, 1.6, "metal", { hvac: true, walk: true });
  m.box(41, -12.8, 44, -10.5, 1.0, "concrete", { planter: true, walk: true });
  m.box(41, 10.5, 44, 12.8, 1.0, "concrete", { planter: true, walk: true });
  m.box(45.2, -1, 46.2, 1, 6, "metal", { mastLeg: true });
  m.zone("pad", 40, 0, 5);
  m.d("skyline", {});
  m.d("heli", { x: 40, z: 0, y: 0.42 });
  // Свет: потолочные панели
  for (let x = -25; x <= 25; x += 10) for (let z = -15; z <= 15; z += 10) m.lamp(x, 3.2, z, "#fff3dd", 9, 0.75, { inside: true, panel: true });
  m.lamp(-25, 2.4, 15.2, "#5fb8ff", 7, 1.1, { inside: true, neon: true });
  m.lamp(38, 4, 0, "#ffffff", 10, 0.8, { pad: true });
  m.lamp(-29.4, 2.4, 11.1, "#ff5a3a", 4, 1, { relay: "A" });
  m.lamp(22, 2.4, 18.2, "#ff5a3a", 4, 1, { relay: "B" });
  m.d("relay", { x: -30.0, z: 11.05, site: "A" });
  m.d("relay", { x: 22, z: 18.5, site: "B" });
  m.d("sign", { x: 0, y: 2.6, z: -5.02, yaw: Math.PI, text: "ЭТАЖ 52", w: 3.4 });
  m.d("sign", { x: -18.13, y: 2.6, z: 15.1, yaw: Math.PI / 2, text: "СЕРВЕРНАЯ", w: 2.6 });
  m.d("sign", { x: 30.3, y: 3.0, z: 0, yaw: Math.PI / 2, text: "ТЕРРАСА", w: 2.8 });
  m.pt("S", -28.5, -15.5, { yaw: Math.PI });
  m.pt("S2", 0, -7.5, { yaw: -Math.PI / 2 });
  m.pt("A", -28.4, 11.05);
  m.pt("B", 22, 13.8);
  m.pt("H", 18, -15);
  m.pt("X", 0, -6.5);
  m.pt("TA", -26, -14, { yaw: Math.PI });
  m.pt("TB", 24, 14, { yaw: 0 });
  const P = {
    o1: [-28, -12.5], o2: [-16, -13.5], o3: [-9, -7.5], o4: [-23, -7], o5: [-15, -19], o6: [-24, 6.5], o7: [-15, 7], o8: [-10, 0],
    a1: [-26, 13.8], a2: [-26, 16.6], a3: [-20, 19], a4: [-15, 15],
    l1: [0, 7.5], l2: [12, 6], l3: [18, 0], l4: [26, 2], l5: [12, -6.5], l6: [0, -7.5], l7: [22, -7],
    e1: [18, 12.2], e2: [25, 18], e3: [17, 17.5], c1: [18, -18.5], c2: [25, -18.5], c3: [28, -13], c4: [14, -14],
    t1: [33, 0], t2: [36.5, -8], t3: [44, -8], t4: [44, 8], t5: [36.5, 8], t6: [40, 0],
  };
  for (const [k, v] of Object.entries(P)) m.pt(k, v[0], v[1]);
  m.route("offices", [P.o1, P.o2, P.o3, P.o8, P.o7, P.o6, P.o4]);
  m.route("server", [P.a1, P.a2, P.a3, P.a4, P.a3, P.a2]);
  m.route("lobby", [P.l1, P.l2, P.l3, P.l4, P.l7, P.l5, P.l6]);
  m.route("exec", [P.e1, P.e3, P.e2, P.e3]);
  m.route("cafe", [P.c1, P.c2, P.c3, P.c4]);
  m.route("terrace", [P.t1, P.t2, P.t3, P.t4, P.t5]);
  m.perches.push([52, 5, -10], [54, 7, 6], [50, 9, 16], [50, 6, -18], [56, 8, 0], [44, 10, 20], [44, 10, -20]);
  m.pt("cam1", -17.8, 11.2, { y: 3.1, yaw: Math.PI * 1.25 });
  m.pt("cam2", 13.8, 11.2, { y: 3.1, yaw: Math.PI * 0.75 });
  return m;
}

// ================= 4. Метро «Глубина» =================
function metro() {
  const m = make({ id: "metro", name: "Метро «Глубина»", floor: -1.2, bounds: [-46, -16, 46, 16], ground: "concreteDark", indoor: true });
  const F = -1.2, TOP = 4.6;
  // Островная платформа (верх на 0)
  m.plat(-24, -4, 18, 4, 0, "tile", { platform: true });
  // лестницы с концов платформы вниз к путям
  for (let i = 0; i < 3; i++) m.plat(-24 - (i + 1) * 0.9, -2, -24 - i * 0.9, 2, -0.3 * (i + 1), "concrete", { stair: true, y: F });
  for (let i = 0; i < 3; i++) m.plat(18 + i * 0.9, -2, 18 + (i + 1) * 0.9, 2, -0.3 * (i + 1), "concrete", { stair: true, y: F });
  // ступеньки посередине платформы — к путям
  for (const zs of [1, -1]) {
    m.plat(-3, zs * 4, -1, zs * 4 + zs * 0.8, -0.4, "concrete", { stair: true, y: F });
    m.plat(-3, zs * 4 + zs * 0.8, -1, zs * 4 + zs * 1.6, -0.8, "concrete", { stair: true, y: F });
  }
  // Колонны
  for (let x = -20; x <= 16; x += 6) for (const z of [-2.2, 2.2]) m.box(x - 0.5, z - 0.5, x + 0.5, z + 0.5, TOP, "tileGreen", { column: true, y: 0 });
  m.box(-17, -1, -13, 1, 2.6, "metal", { escalator: true, y: 0 });
  m.d("escalator", { x0: -17, x1: -13, z: 0 });
  m.box(4.5, -0.8, 7.5, 0.8, 2.3, "orange", { kiosk: true, y: 0 });
  m.box(-8.5, -0.4, -6.5, 0.4, 0.5, "wood", { bench: true, y: 0, walk: true });
  m.box(11, -0.4, 13, 0.4, 0.5, "wood", { bench: true, y: 0, walk: true });
  // Боковые стены станции
  m.wall(-46, 10.8, 22, 10.8, TOP + 1.2, 0.6, "tileDark", [[-29, -26.5], [5.5, 8]], { lintel: 2.4 });
  m.wall(-46, -10.8, 22, -10.8, TOP + 1.2, 0.6, "tileDark");
  // Перегородка между тоннелями на западе с проходом
  m.box(-46, -4, -38.5, 4, TOP + 1.2, "concreteDark", { divider: true });
  m.box(-35, -4, -27.6, 4, TOP + 1.2, "concreteDark", { divider: true });
  // Поезд на северном пути (укрытие)
  m.box(-22, 5.2, -4, 9.4, 3.4, "metal", { train: true });
  m.d("train", { x0: -22, x1: -4, z0: 5.2, z1: 9.4 });
  // Служебный коридор на севере
  m.wall(-30, 15.5, 22, 15.5, 3.4, 0.5, "concrete");
  m.wall(-30, 11, -30, 15.5, 3.4, 0.5, "concrete");
  m.box(-6, 11.1, -2, 13.2, 2.2, "metalDark", { machine: true });
  m.box(12, 13.4, 15, 15.2, 2, "metalDark", { machine: true });
  // Насосная (H) в конце коридора
  m.wall(16, 11, 16, 15.5, 3.4, 0.4, "concrete", [[12.4, 14.4]]);
  m.box(19.5, 13.2, 21.6, 15.2, 2.4, "metal", { pump: true });
  m.d("ceiling", { x0: -30, z0: 11, x1: 22, z1: 15.5, y: 3.4, skin: "concreteDark" });
  // Стена между станцией и депо с широким проёмом
  m.wall(22, -16, 22, 16, 10, 0.8, "concrete", [[-9.5, 9.5], [12, 14.5]], { lintel: 5.5 });
  // Депо (арена): ящики, станки, печь ядра
  m.box(26, -12, 30, -8, 2.6, "metalDark", { press: true });
  m.box(26, 8, 30, 12, 2.6, "metalDark", { press: true });
  m.crate(33, -4, 1.4, "crate", 2);
  m.crate(33, 5, 1.4, "crateGreen", 2);
  m.crate(28, 1, 1.4, "crate");
  m.box(37, -14, 41, -11, 3, "metal", { machine: true });
  m.box(37, 11, 41, 14, 3, "metal", { machine: true });
  m.box(44, -6, 46, 6, 9, "dark", { furnace: true });
  m.d("furnace", { x: 45, z: 0 });
  m.d("depot", { x0: 22, x1: 46, z0: -16, z1: 16, h: 10 });
  m.wall(22, 16, 46, 16, 10, 0.4, "concrete");
  m.wall(22, -16, 46, -16, 10, 0.4, "concrete");
  // Затопленный участок на западе
  m.water.push({ x0: -46, z0: -10.5, x1: -31, z1: 10.5, y: -0.72 });
  m.d("vault", { x0: -46, x1: 22, z0: -10.8, z1: 10.8, y: TOP });
  m.d("rails", { x0: -46, x1: 22, z0: 7.2, z1: 7.2, axis: "x", y: F });
  m.d("rails", { x0: -46, x1: 46, z0: -7.2, z1: -7.2, axis: "x", y: F });
  m.d("rails", { x0: 22, x1: 44, z0: 7.2, z1: 7.2, axis: "x", y: F });
  // Свет: лампы над платформой, аварийные в тоннелях, печь
  for (let x = -21; x <= 15; x += 6) m.lamp(x, 4.2, 0, "#e9f3ff", 8.5, 0.9, { inside: true, strip: true });
  for (const x of [-42, -36, -30]) {
    m.lamp(x, 3.6, 7, "#ff6040", 7, 1.0, { emergency: true });
    m.lamp(x, 3.6, -7, "#ff6040", 7, 1.0, { emergency: true });
  }
  for (const x of [-24, -12, 0, 12]) m.lamp(x, 3, 13.2, "#ffe0a8", 6, 0.8, { inside: true });
  m.lamp(20.5, 2.6, 12.6, "#7fe8ff", 5, 1, { inside: true });
  m.lamp(42, 4, 0, "#ff7a2a", 16, 1.5, { furnace: true });
  for (const [x, z] of [[27, -10], [27, 10], [35, -12], [35, 12], [40, 0], [27, 0]]) m.lamp(x, 8, z, "#ffd8a0", 13, 0.85, { inside: true });
  m.lamp(23.5, 4, -12, "#ff5a3a", 7, 0.9, { emergency: true });
  m.lamp(23.5, 4, 12, "#ff5a3a", 7, 0.9, { emergency: true });
  m.lamp(-36.8, 2.4, 0, "#ff5a3a", 4, 1, { relay: "A" });
  m.lamp(20.5, 2.4, 12.2, "#ff5a3a", 4, 1, { relay: "B" });
  m.d("relay", { x: -36.8, z: -3.6, site: "A", wall: true });
  m.d("sign", { x: -10, y: 3.2, z: 10.48, yaw: Math.PI, text: "ГЛУБИНА", w: 4 });
  m.d("sign", { x: -10, y: 3.2, z: -10.48, yaw: 0, text: "ГЛУБИНА", w: 4 });
  m.d("sign", { x: 21.58, y: 6.4, z: 0, yaw: -Math.PI / 2, text: "ДЕПО", w: 3 });
  m.d("sign", { x: 15.78, y: 2.9, z: 13.4, yaw: -Math.PI / 2, text: "НАСОСНАЯ", w: 2.4 });
  m.pt("S", -21, 0, { y: 0, yaw: -Math.PI / 2 });
  m.pt("S2", 12, 0, { y: 0, yaw: -Math.PI / 2 });
  m.pt("S3", -42, -7.2, { yaw: -Math.PI / 2 });
  m.pt("A", -36.8, -2.5);
  m.pt("B", 19, 12.4);
  m.pt("H", 19.5, 12);
  m.pt("X", -21, 0, { y: 0 });
  m.pt("X2", 26, 0);
  m.pt("TA", -20, 0, { y: 0, yaw: -Math.PI / 2 });
  m.pt("TB", 34, 0, { yaw: Math.PI / 2 });
  m.zone("pump", 19, 13.2, 3.4);
  m.zone("arena", 34, 0, 13);
  const P = {
    p1: [-20, 0], p2: [-10, -3], p3: [0, 3], p4: [10, -3.4], p5: [16, 0],
    tn1: [-40, 7.2], tn2: [-32, 7.2], tn3: [-26, 7.5], tn4: [-36.7, 0], tn5: [-40, -7.2], tn6: [-32, -7.2], tn7: [-26, -7.5],
    tr1: [-14, -7.5], tr2: [0, -7.5], tr3: [14, -7.5], tr4: [2, 7.5], tr5: [16, 7.5],
    c1: [-27.5, 13.2], c2: [-14, 13.2], c3: [0, 13.6], c4: [10, 13.2], c5: [18.5, 13.4],
    dp1: [26, 0], dp2: [32, -10], dp3: [40, -8], dp4: [40, 8], dp5: [32, 10], dp6: [36, 0],
  };
  for (const [k, v] of Object.entries(P)) m.pt(k, v[0], v[1]);
  for (const k of ["p1", "p2", "p3", "p4", "p5"]) m.points[k].y = 0;
  m.route("platform", [P.p1, P.p2, P.p3, P.p4, P.p5, P.p4, P.p3, P.p2]);
  m.route("tunnelN", [P.tn1, P.tn2, P.tn3, P.tn2]);
  m.route("tunnelS", [P.tn5, P.tn6, P.tn7, P.tn6]);
  m.route("cross", [P.tn2, P.tn4, P.tn6, P.tn4]);
  m.route("tracks", [P.tr1, P.tr2, P.tr3, P.tr2]);
  m.route("corridor", [P.c1, P.c2, P.c3, P.c4, P.c5, P.c4, P.c3, P.c2]);
  m.route("depot", [P.dp1, P.dp2, P.dp3, P.dp6, P.dp4, P.dp5]);
  m.perches.push([28, 6, -12], [40, 7, -4], [30, 7, 12], [36, 7.5, 0], [-10, 3.6, -7.5], [8, 3.6, 7.5]);
  m.pt("cam1", -30.2, 6.5, { y: 3.4, yaw: -Math.PI / 2 });
  m.pt("cam2", -27.8, -6.8, { y: 3.4, yaw: -Math.PI * 0.4 });
  m.pt("cam3", 6.8, 11.4, { y: 2.9, yaw: Math.PI });
  return m;
}

// ================= Полигон (тренировка) =================
function range() {
  const m = make({ id: "range", name: "Полигон «Рубежа»", floor: 0, bounds: [-14, -44, 14, 10], ground: "concrete", indoor: true });
  m.wall(-14, 10, 14, 10, 7, 0.5, "wallBlue");
  m.wall(-14, -44, 14, -44, 7, 0.5, "wallBlue");
  m.wall(-14, -44, -14, 10, 7, 0.5, "wallBlue");
  m.wall(14, -44, 14, 10, 7, 0.5, "wallBlue");
  m.d("ceiling", { x0: -14, z0: -44, x1: 14, z1: 10, y: 7, skin: "metalDark", skylights: true });
  // Огневой рубеж: стойка и кабинки
  m.box(-12, -2.2, 12, -1.6, 1.05, "wood", { counter: true, walk: true });
  for (const x of [-8, -4, 0, 4, 8]) m.box(x - 0.08, -2.2, x + 0.08, 0.4, 2.2, "metal", { booth: true });
  // Мишени — роботы-манекены из правил; укрытия на дальнем конце
  m.box(-10, -20, -6, -19, 1.1, "concrete", { walk: true });
  m.box(6, -26, 10, -25, 1.1, "concrete", { walk: true });
  m.box(-9, -33.5, -5, -32.5, 1.6, "concrete", { walk: true });
  m.cont(-13.5, -42, 6.1, "x", "contOrange");
  m.cont(7.4, -42, 6.1, "x", "contBlue");
  // Полоса: ящики и низкий проход
  m.crate(-9, 4, 1.25, "crate");
  m.crate(9, 5, 1.25, "crateGreen", 2);
  m.box(-3, 6.5, 3, 7.5, 0.5, "hazard", { walk: true });
  for (let z = -6; z >= -40; z -= 6) m.lamp(0, 6.6, z, "#e6f2ff", 10, 0.85, { inside: true });
  m.lamp(0, 6.6, 4, "#e6f2ff", 10, 0.85, { inside: true });
  m.d("lanes", { x0: -12, x1: 12, z0: -44, z1: -2.2 });
  m.d("sign", { x: 0, y: 5, z: 9.72, yaw: Math.PI, text: "ПОЛИГОН «РУБЕЖ»", w: 6 });
  m.d("sign", { x: 0, y: 5.4, z: -43.72, yaw: 0, text: "10 · 20 · 35 м", w: 4.4 });
  m.pt("S", 0, 6, { yaw: 0 });
  m.pt("mark", 2, -0.6);
  m.pt("crouch", 0, 7);
  m.pt("plant", -10.5, 4);
  m.zone("plant", -10.5, 4, 2);
  m.pt("A", -10.5, 4);
  m.d("relay", { x: -12.6, z: 4, site: "A" });
  m.lamp(-12, 2, 4, "#ff5a3a", 4, 1, { relay: "A" });
  for (const [k, x, z] of [["t1", -6, -12], ["t2", 0, -12], ["t3", 6, -12], ["t4", -8, -21], ["t5", 8, -27], ["t6", 2, -36], ["g1", -2, -24], ["g2", 0, -25], ["g3", 2, -24], ["l1", -6, -30], ["l2", 6, -30]]) m.pt(k, x, z);
  m.route("lane", [[-8, -30], [8, -30]]);
  return m;
}

const BUILDERS = { port, dome, tower, metro, range };
const cache = {};
export function getMap(id) {
  if (!cache[id]) cache[id] = BUILDERS[id]();
  return cache[id];
}
export const MAP_IDS = ["port", "dome", "tower", "metro"];
export const MAP_INFO = {
  port: { name: "Северный порт", blurb: "Контейнеры, краны и склады под дождём" },
  dome: { name: "Станция «Купол»", blurb: "Исследовательский купол среди песков и солнечных полей" },
  tower: { name: "Небоскрёб «Шпиль»", blurb: "Офисы 52 этажа, стекло и вертолётная площадка" },
  metro: { name: "Метро «Глубина»", blurb: "Тоннели, платформы и сердце завода ГОРН" },
  range: { name: "Полигон", blurb: "Тренировочный ангар отряда" },
};
