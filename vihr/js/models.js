// Игрушечные модели всех предметов. Каждая — одна геометрия с цветами вершин:
// на карте их рисуют «пачками» (InstancedMesh), один вызов отрисовки на вид предмета.
// base — неизменная часть, paint — часть, которую красят по-разному, spin — крутящаяся деталь.
import { T, Shape, wedge, TAU } from "./kit.js?v=cb0a50f1";

const taperCache = new Map();
const tube = (top, bottom, segs = 16) => {
  const key = top + ":" + bottom + ":" + segs;
  if (!taperCache.has(key)) taperCache.set(key, new T.CylinderGeometry(top, bottom, 1, segs));
  return taperCache.get(key);
};
const H = Math.PI / 2;

// Цвета
const C = {
  wood: "#c98a4b", dark: "#7a4a25", plank: "#a8673a", hay: "#f2c94c", hay2: "#dfae35",
  white: "#f7f4ec", cream: "#fff3d6", black: "#2e2e36", grey: "#8a8f9a", steel: "#aab3bf", dgrey: "#4a4f5a",
  red: "#e0483a", roof: "#c4453a", roofDark: "#8f3a34", orange: "#f58a1f", yellow: "#ffd23f", gold: "#f5b82e",
  leaf: "#5cbf45", leaf2: "#43a63b", leaf3: "#7bd65a", trunk: "#8a5a33", pink: "#f4a3b4", glass: "#7fc8ef",
  glass2: "#4f86b8", blue: "#3f7fd8", sky: "#8fd0f0", green: "#3f9a55", brick: "#c8603f", sand: "#e8cf9a",
  rubber: "#33333b", mint: "#7fe0c0", lilac: "#b89cff", peach: "#ffb88a", candy: "#ff6fa8",
};
// Цвета для красимых частей
export const PAINTS = {
  tractor: ["#e0483a", "#3fa34f", "#2f7fe0", "#f0a81c"],
  house: ["#fff1c7", "#d8ecff", "#ffd9d0", "#e3f5d0", "#fff7ef"],
  bike: ["#e0483a", "#2f7fe0", "#3fb06a", "#f0a81c", "#b05ad8"],
  car: ["#e0483a", "#2f7fe0", "#ffd23f", "#3fb06a", "#f7f4ec", "#ff8a3d", "#7a5ad8"],
  kiosk: ["#4fb3e8", "#ff8a3d", "#5ac46a", "#ff6f9a"],
  bus: ["#ffcc2f", "#e0483a", "#3f9ae0"],
  house2: ["#ffe2b8", "#cfe6ff", "#ffd0c8", "#d8f0c8", "#efe2ff", "#fff3d6"],
  shop: ["#e0483a", "#2f9ae0", "#3fb06a", "#ff8a3d", "#c05ad8"],
  barrel: ["#2f7fe0", "#e0483a", "#3fa34f", "#f0a81c"],
  rowboat: ["#e0483a", "#2f9ae0", "#f7f4ec", "#3fb06a", "#ffcc2f"],
  container: ["#e0483a", "#2f7fe0", "#3fa34f", "#f0a81c", "#8f5ad8", "#e8743a"],
  truck: ["#e0483a", "#2f7fe0", "#f7f4ec", "#3fa34f"],
  balloon: ["#ff5a7a", "#ffcf3a", "#4fb8ff", "#7ee06a", "#c58cff", "#ff8a3d"],
  bumper: ["#ff5a7a", "#ffcf3a", "#4fb8ff", "#7ee06a", "#c58cff"],
  tent: ["#ff5a6a", "#4f8fff", "#ffb02e", "#8a5adf"],
};

function animalEyes(s, x, y, z, r = 0.035) {
  s.add("ball", C.black, [x, y, z], r);
  s.add("ball", C.black, [x, y, -z], r);
}
function wheel(s, x, y, z, r, w, hub = C.steel) {
  s.add("cyl", C.rubber, [x, y, z], [r, w, r], [H, 0, 0]);
  s.add("cyl", hub, [x, y, z], [r * 0.5, w * 1.05, r * 0.5], [H, 0, 0]);
}
function windowsGrid(s, x0, x1, y0, y1, z, cols, rows, w, h, color = C.glass, facing = 1) {
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / cols, y = y0 + ((y1 - y0) * (j + 0.5)) / rows;
      s.add("box", color, [x, y, z * facing], [w, h, 0.08]);
    }
  }
}
function tree(s, x, z, k = 1, crown = [C.leaf, C.leaf2, C.leaf3], fruit) {
  s.add(tube(0.18, 0.26, 8), C.trunk, [x, 1 * k, z], [k, 2 * k, k]);
  s.add("lump", crown[0], [x, 2.7 * k, z], [1.15 * k, 1.0 * k, 1.15 * k]);
  s.add("lump", crown[1], [x + 0.5 * k, 3.3 * k, z + 0.2 * k], 0.8 * k);
  s.add("lump", crown[2], [x - 0.4 * k, 3.5 * k, z - 0.3 * k], 0.7 * k);
  if (fruit) for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, y = 2.5 + (i % 3) * 0.45;
    s.add("ball", fruit, [x + Math.cos(a) * 1.05 * k, y * k, z + Math.sin(a) * 1.05 * k], 0.13 * k);
  }
}
function bench(s, seat, legs = C.dgrey) {
  s.add("box", seat, [0, 0.46, 0.04], [1.4, 0.08, 0.42]);
  s.add("box", seat, [0, 0.76, -0.17], [1.4, 0.26, 0.07], [-0.15, 0, 0]);
  for (const x of [-0.58, 0.58]) {
    s.add("box", legs, [x, 0.23, 0.04], [0.08, 0.46, 0.4]);
    s.add("box", legs, [x, 0.6, -0.17], [0.08, 0.3, 0.06]);
  }
}

// Каждая функция возвращает { base, paint?, spin? }
const MODELS = {
  // ---------- Ферма ----------
  chicken() {
    const s = new Shape();
    s.add("ball", C.white, [0, 0.28, 0], [0.25, 0.21, 0.2]);
    s.add("ball", C.white, [-0.2, 0.36, 0], [0.12, 0.14, 0.1], [0, 0, 0.6]);
    s.add("ball", C.white, [0.16, 0.45, 0], 0.13);
    s.add("box", C.red, [0.15, 0.6, 0], [0.12, 0.08, 0.04]);
    s.add("box", C.red, [0.26, 0.38, 0], [0.04, 0.07, 0.03]);
    s.add("cone", C.orange, [0.32, 0.45, 0], [0.05, 0.12, 0.05], [0, 0, -H]);
    s.add("ball", "#ece7da", [-0.02, 0.3, 0.17], [0.15, 0.09, 0.04]);
    s.add("ball", "#ece7da", [-0.02, 0.3, -0.17], [0.15, 0.09, 0.04]);
    animalEyes(s, 0.22, 0.49, 0.08, 0.025);
    for (const z of [-0.07, 0.07]) s.add("cyl8", C.orange, [0, 0.07, z], [0.02, 0.14, 0.02]);
    return { base: s };
  },
  pumpkin() {
    const s = new Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      s.add("ball", i % 2 ? C.orange : "#ff9c2a", [Math.cos(a) * 0.1, 0.25, Math.sin(a) * 0.1], [0.26, 0.24, 0.26], [0, -a, 0]);
    }
    s.add("cyl8", "#6a7a2a", [0, 0.52, 0], [0.04, 0.14, 0.04], [0.2, 0, 0.2]);
    s.add("ball", C.leaf, [0.09, 0.5, 0.04], [0.1, 0.02, 0.07]);
    return { base: s };
  },
  fence() {
    const s = new Shape();
    for (const x of [-0.95, 0, 0.95]) s.add("box", C.dark, [x, 0.45, 0], [0.12, 0.9, 0.12]);
    s.add("box", C.wood, [0, 0.36, 0], [2.02, 0.12, 0.07]);
    s.add("box", C.wood, [0, 0.72, 0], [2.02, 0.12, 0.07]);
    return { base: s };
  },
  bale() {
    const s = new Shape();
    s.add("cyl", C.hay, [0, 0.47, 0], [0.47, 1.0, 0.47], [0, 0, H]);
    s.add("cyl", C.hay2, [0, 0.47, 0], [0.4, 1.04, 0.4], [0, 0, H]);
    s.add("cyl", "#c08a2a", [0.3, 0.47, 0], [0.48, 0.05, 0.48], [0, 0, H]);
    s.add("cyl", "#c08a2a", [-0.3, 0.47, 0], [0.48, 0.05, 0.48], [0, 0, H]);
    return { base: s };
  },
  sheep() {
    const s = new Shape();
    const wool = ["#f6f3ea", "#ecebe2", "#ffffff"];
    [[0, 0.58, 0, 0.34], [0.2, 0.62, 0.12, 0.26], [-0.22, 0.6, -0.1, 0.28], [0.05, 0.75, -0.08, 0.25], [-0.15, 0.56, 0.16, 0.25]].forEach(([x, y, z, r], i) =>
      s.add("lump", wool[i % 3], [x, y, z], r));
    s.add("rbox", "#3a3434", [0.42, 0.66, 0], [0.24, 0.24, 0.22]);
    s.add("box", "#3a3434", [0.38, 0.72, 0.15], [0.08, 0.04, 0.12], [0.4, 0, 0]);
    s.add("box", "#3a3434", [0.38, 0.72, -0.15], [0.08, 0.04, 0.12], [-0.4, 0, 0]);
    s.add("lump", "#ffffff", [0.4, 0.8, 0], 0.11);
    animalEyes(s, 0.54, 0.7, 0.07, 0.03);
    for (const [x, z] of [[0.18, 0.12], [0.18, -0.12], [-0.18, 0.12], [-0.18, -0.12]]) s.add("box", "#3a3434", [x, 0.18, z], [0.08, 0.36, 0.08]);
    return { base: s };
  },
  cow() {
    const s = new Shape();
    s.add("rbox", C.white, [0, 0.98, 0], [1.5, 0.78, 0.76]);
    s.add("box", C.black, [0.25, 1.1, 0.385], [0.45, 0.35, 0.02]);
    s.add("box", C.black, [-0.4, 0.92, -0.385], [0.5, 0.4, 0.02]);
    s.add("box", C.black, [-0.3, 1.38, 0], [0.4, 0.02, 0.3]);
    s.add("box", C.black, [-0.55, 0.9, 0.385], [0.25, 0.3, 0.02]);
    s.add("rbox", C.white, [0.92, 1.3, 0], [0.5, 0.46, 0.46]);
    s.add("rbox", C.pink, [1.2, 1.2, 0], [0.18, 0.26, 0.4]);
    s.add("ball", "#c26a74", [1.29, 1.22, 0.09], 0.03);
    s.add("ball", "#c26a74", [1.29, 1.22, -0.09], 0.03);
    s.add("cone", C.cream, [0.88, 1.6, 0.17], [0.05, 0.2, 0.05], [0.5, 0, 0]);
    s.add("cone", C.cream, [0.88, 1.6, -0.17], [0.05, 0.2, 0.05], [-0.5, 0, 0]);
    s.add("box", C.white, [0.84, 1.45, 0.3], [0.1, 0.07, 0.22], [0.3, 0, 0]);
    s.add("box", C.white, [0.84, 1.45, -0.3], [0.1, 0.07, 0.22], [-0.3, 0, 0]);
    animalEyes(s, 1.13, 1.38, 0.15, 0.045);
    for (const [x, z] of [[0.55, 0.26], [0.55, -0.26], [-0.55, 0.26], [-0.55, -0.26]]) {
      s.add("box", C.white, [x, 0.33, z], [0.17, 0.62, 0.17]);
      s.add("box", C.black, [x, 0.05, z], [0.18, 0.1, 0.18]);
    }
    s.add("ball", C.pink, [-0.15, 0.58, 0], [0.2, 0.12, 0.16]);
    s.add("box", C.white, [-0.8, 0.95, 0], [0.05, 0.6, 0.05], [0, 0, 0.25]);
    s.add("ball", C.black, [-0.88, 0.65, 0], 0.08);
    return { base: s };
  },
  tree() {
    const s = new Shape();
    tree(s, 0, 0, 1, [C.leaf, C.leaf2, C.leaf3], "#e8403a");
    return { base: s };
  },
  tractor() {
    const base = new Shape(), paint = new Shape();
    paint.add("rbox", "#ffffff", [0.25, 0.92, 0], [1.7, 0.66, 0.96]);
    paint.add("rbox", "#ffffff", [-0.45, 1.75, 0], [0.95, 0.12, 1.02]);
    base.add("box", C.black, [-0.45, 1.4, 0], [0.88, 0.7, 0.9]);
    base.add("box", C.glass, [-0.45, 1.42, 0], [0.92, 0.55, 0.82]);
    base.add("box", C.dgrey, [0.95, 0.85, 0], [0.12, 0.5, 0.8]);
    base.add("cyl8", C.dgrey, [0.6, 1.5, 0.3], [0.06, 0.6, 0.06]);
    wheel(base, -0.45, 0.62, 0.62, 0.62, 0.32, C.yellow);
    wheel(base, -0.45, 0.62, -0.62, 0.62, 0.32, C.yellow);
    wheel(base, 0.75, 0.36, 0.55, 0.36, 0.22, C.yellow);
    wheel(base, 0.75, 0.36, -0.55, 0.36, 0.22, C.yellow);
    base.add("box", C.yellow, [1.02, 0.95, 0.3], [0.04, 0.1, 0.12]);
    base.add("box", C.yellow, [1.02, 0.95, -0.3], [0.04, 0.1, 0.12]);
    return { base, paint };
  },
  shed() {
    const s = new Shape();
    s.add("box", C.plank, [0, 1.0, 0], [3.0, 2.0, 2.4]);
    for (let i = 0; i < 7; i++) s.add("box", "#93582f", [-1.29 + i * 0.43, 1.0, 1.21], [0.04, 2.0, 0.02]);
    s.add("prism", C.roofDark, [0, 2.0, 0], [3.4, 1.2, 2.8]);
    s.add("box", C.dark, [0.6, 0.75, 1.22], [0.9, 1.5, 0.04]);
    s.add("box", C.cream, [0.6, 0.75, 1.25], [0.08, 1.6, 0.02], [0, 0, 0.6]);
    s.add("box", C.cream, [0.6, 0.75, 1.25], [0.08, 1.6, 0.02], [0, 0, -0.6]);
    s.add("box", C.glass, [-0.7, 1.25, 1.22], [0.6, 0.5, 0.04]);
    s.add("box", C.cream, [-0.7, 1.25, 1.24], [0.68, 0.06, 0.02]);
    return { base: s };
  },
  house() {
    const base = new Shape(), paint = new Shape();
    paint.add("box", "#ffffff", [0, 1.5, 0], [4.4, 3.0, 3.6]);
    base.add("prism", C.roof, [0, 3.0, 0], [4.9, 1.9, 4.1], [0, H, 0]);
    base.add("box", C.brick, [1.2, 3.9, 0.9], [0.5, 1.4, 0.5]);
    base.add("box", C.dark, [0, 0.8, 1.81], [0.9, 1.6, 0.06]);
    base.add("box", C.gold, [0.3, 0.8, 1.86], [0.08, 0.08, 0.04]);
    for (const x of [-1.4, 1.4]) {
      base.add("box", C.glass, [x, 1.7, 1.81], [0.8, 0.8, 0.06]);
      base.add("box", C.white, [x, 1.7, 1.84], [0.9, 0.08, 0.04]);
      base.add("box", C.white, [x, 1.7, 1.84], [0.08, 0.9, 0.04]);
      base.add("box", C.glass, [x, 1.7, -1.81], [0.8, 0.8, 0.06]);
    }
    for (const z of [-0.8, 0.8]) base.add("box", C.glass, [2.21, 1.7, z], [0.06, 0.8, 0.7]);
    base.add("box", C.grey, [0, 0.08, 2.2], [1.4, 0.16, 0.8]);
    base.add("box", "#5cb84a", [-1.4, 0.2, 2.1], [1.2, 0.4, 0.4]);
    return { base, paint };
  },
  barn() {
    const s = new Shape();
    s.add("box", "#d0453a", [0, 2.1, 0], [6, 4.2, 5]);
    s.add("prism", "#7a3a36", [0, 4.2, 0], [5.4, 2.5, 6.4], [0, H, 0]);
    s.add("prism", C.white, [0, 4.19, 0], [5.6, 2.6, 6.2], [0, H, 0]);
    s.add("box", C.white, [0, 2.1, 2.51], [6.05, 0.16, 0.04]);
    s.add("box", C.white, [-3.01, 2.1, 0], [0.04, 4.2, 0.16]);
    s.add("box", C.white, [3.01, 2.1, 0], [0.04, 4.2, 0.16]);
    s.add("box", "#a8332c", [0, 1.4, 2.52], [2.6, 2.8, 0.06]);
    s.add("box", C.white, [0, 1.4, 2.56], [0.14, 3.6, 0.04], [0, 0, 0.75]);
    s.add("box", C.white, [0, 1.4, 2.56], [0.14, 3.6, 0.04], [0, 0, -0.75]);
    s.add("box", C.white, [0, 1.4, 2.55], [2.7, 2.9, 0.02]);
    s.add("box", "#a8332c", [0, 1.4, 2.56], [2.4, 2.6, 0.02]);
    s.add("box", C.hay, [0, 3.9, 2.52], [1.1, 0.9, 0.06]);
    s.add("box", C.white, [0, 3.9, 2.55], [1.25, 1.05, 0.02]);
    s.add("box", C.hay, [0, 3.9, 2.56], [1.0, 0.8, 0.02]);
    return { base: s };
  },
  tower() {
    const s = new Shape();
    for (const [x, z] of [[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) {
      s.add("cyl8", C.dgrey, [x * 0.85, 3.6, z * 0.85], [0.14, 7.3, 0.14], [z * 0.05, 0, -x * 0.05]);
    }
    for (const y of [2.2, 4.6]) {
      s.add("box", C.grey, [0, y, 1.3], [2.8, 0.1, 0.1]);
      s.add("box", C.grey, [0, y, -1.3], [2.8, 0.1, 0.1]);
      s.add("box", C.grey, [1.3, y, 0], [0.1, 0.1, 2.8]);
      s.add("box", C.grey, [-1.3, y, 0], [0.1, 0.1, 2.8]);
    }
    s.add("cyl", "#5ab0e0", [0, 8.6, 0], [2.3, 3.0, 2.3]);
    s.add("cyl", C.white, [0, 8.6, 0], [2.33, 0.5, 2.33]);
    s.add("cyl", C.dgrey, [0, 7.1, 0], [2.5, 0.16, 2.5]);
    s.add("cone", C.red, [0, 10.7, 0], [2.5, 1.3, 2.5]);
    s.add("ball", C.red, [0, 11.4, 0], 0.22);
    for (let i = 0; i < 10; i++) s.add("box", C.dgrey, [2.32, 0.4 + i * 0.7, 0], [0.04, 0.05, 0.5]);
    return { base: s };
  },
  mill() {
    const base = new Shape(), spin = new Shape();
    base.add(tube(1.5, 2.6), C.cream, [0, 4, 0], [1, 8, 1]);
    base.add("cyl", C.dark, [0, 0.2, 0], [2.7, 0.4, 2.7]);
    base.add("cone", C.roof, [0, 9, 0], [1.9, 2.2, 1.9]);
    base.add("cyl", C.roof, [0, 7.95, 0], [1.75, 0.2, 1.75]);
    base.add("box", C.dark, [2.45, 1, 0], [0.2, 2, 1.1], [0, 0, 0.06]);
    for (const y of [3.4, 5.6]) base.add("box", C.glass, [1.96 - (y - 3.4) * 0.17, y, 0], [0.12, 0.7, 0.6], [0, 0, 0.12]);
    base.add("cyl8", C.dark, [1.6, 8.2, 0], [0.18, 1.0, 0.18], [0, 0, H]);
    // крылья вокруг оси X
    spin.add("cyl8", C.dark, [0, 0, 0], [0.32, 0.3, 0.32], [0, 0, H]);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      spin.add("box", C.dark, [0, Math.cos(a) * 2.7, Math.sin(a) * 2.7], [0.1, 5.4, 0.12], [a, 0, 0]);
      spin.add("box", C.white, [0.05, Math.cos(a) * 3.2, Math.sin(a) * 3.2 + 0], [0.06, 4.2, 0.9], [a, 0, 0]);
    }
    return { base, spin: { shape: spin, pivot: [2.15, 8.2, 0], axis: "x", speed: 1.2 } };
  },

  // ---------- Городок ----------
  cone() {
    const s = new Shape();
    s.add("box", C.dgrey, [0, 0.03, 0], [0.5, 0.06, 0.5]);
    s.add("cone", C.orange, [0, 0.38, 0], [0.24, 0.66, 0.24]);
    s.add(tube(0.15, 0.19), C.white, [0, 0.36, 0], [1, 0.12, 1]);
    return { base: s };
  },
  bin() {
    const s = new Shape();
    s.add(tube(0.3, 0.25), "#3f8f5a", [0, 0.42, 0], [1, 0.84, 1]);
    s.add("cyl", "#2f6f45", [0, 0.86, 0], [0.32, 0.08, 0.32]);
    s.add("cyl", "#62b07a", [0, 0.55, 0], [0.31, 0.06, 0.31]);
    return { base: s };
  },
  mailbox() {
    const s = new Shape();
    s.add("box", C.dgrey, [0, 0.45, 0], [0.09, 0.9, 0.09]);
    s.add("rbox", "#2f6fd0", [0, 1.05, 0], [0.42, 0.5, 0.34]);
    s.add("box", "#1f3f80", [0, 1.15, 0.17], [0.22, 0.04, 0.03]);
    s.add("box", C.yellow, [0, 0.95, 0.172], [0.18, 0.12, 0.02]);
    return { base: s };
  },
  bench() {
    const s = new Shape();
    bench(s, C.wood);
    return { base: s };
  },
  bike() {
    const base = new Shape(), paint = new Shape();
    for (const x of [-0.48, 0.48]) {
      base.add("ring", C.rubber, [x, 0.34, 0], [0.32, 0.32, 0.4]);
      base.add("cyl8", C.steel, [x, 0.34, 0], [0.04, 0.08, 0.04], [H, 0, 0]);
    }
    paint.add("box", "#ffffff", [0, 0.52, 0], [0.9, 0.06, 0.06], [0, 0, 0.1]);
    paint.add("box", "#ffffff", [-0.2, 0.5, 0], [0.06, 0.45, 0.06], [0, 0, -0.35]);
    paint.add("box", "#ffffff", [0.4, 0.6, 0], [0.06, 0.55, 0.06], [0, 0, 0.3]);
    paint.add("box", "#ffffff", [-0.3, 0.38, 0], [0.4, 0.05, 0.05], [0, 0, -0.3]);
    base.add("box", C.black, [-0.15, 0.78, 0], [0.24, 0.06, 0.12]);
    base.add("box", C.black, [0.5, 0.92, 0], [0.06, 0.06, 0.5]);
    return { base, paint };
  },
  lamp() {
    const s = new Shape();
    s.add("cyl", C.dgrey, [0, 0.12, 0], [0.18, 0.24, 0.18]);
    s.add(tube(0.05, 0.08, 8), C.dgrey, [0, 1.9, 0], [1, 3.6, 1]);
    s.add("box", C.dgrey, [0.25, 3.7, 0], [0.55, 0.06, 0.06]);
    s.add("cone", C.dgrey, [0.5, 3.66, 0], [0.22, 0.2, 0.22]);
    s.add("ball", "#fff6c0", [0.5, 3.55, 0], [0.16, 0.1, 0.16]);
    return { base: s };
  },
  car() {
    const base = new Shape(), paint = new Shape();
    paint.add("rbox", "#ffffff", [0, 0.55, 0], [2.2, 0.56, 1.1]);
    paint.add("rbox", "#ffffff", [-0.12, 1.0, 0], [1.2, 0.5, 1.0]);
    base.add("box", C.glass2, [-0.12, 1.0, 0], [1.05, 0.38, 1.04]);
    base.add("box", C.glass2, [0.45, 0.98, 0], [0.12, 0.36, 0.9], [0, 0, 0.5]);
    base.add("box", C.dgrey, [0, 0.3, 0], [2.3, 0.14, 1.0]);
    for (const [x, z] of [[0.68, 0.5], [0.68, -0.5], [-0.68, 0.5], [-0.68, -0.5]]) wheel(base, x, 0.28, z, 0.27, 0.2);
    base.add("box", "#fff2a0", [1.1, 0.6, 0.35], [0.04, 0.12, 0.18]);
    base.add("box", "#fff2a0", [1.1, 0.6, -0.35], [0.04, 0.12, 0.18]);
    base.add("box", "#e84040", [-1.1, 0.6, 0.38], [0.04, 0.1, 0.14]);
    base.add("box", "#e84040", [-1.1, 0.6, -0.38], [0.04, 0.1, 0.14]);
    return { base, paint };
  },
  ttree() {
    const s = new Shape();
    s.add(tube(0.18, 0.26, 8), C.trunk, [0, 1.2, 0], [1, 2.4, 1]);
    s.add("lump", C.leaf2, [0, 3.3, 0], [1.5, 1.4, 1.5]);
    s.add("lump", C.leaf, [0.3, 4.3, 0.2], 1.0);
    s.add("lump", C.leaf3, [-0.4, 3.9, -0.5], 0.9);
    s.add("cyl", "#7a6a5a", [0, 0.04, 0], [0.7, 0.08, 0.7]);
    return { base: s };
  },
  kiosk() {
    const base = new Shape(), paint = new Shape();
    paint.add("rbox", "#ffffff", [0, 1.1, 0], [2.6, 2.2, 2.0]);
    base.add("box", C.white, [0, 2.3, 0], [2.8, 0.2, 2.2]);
    base.add("box", C.glass, [0, 1.3, 1.01], [1.8, 0.9, 0.04]);
    base.add("box", C.white, [0, 0.82, 1.15], [1.9, 0.08, 0.3]);
    for (let i = 0; i < 6; i++) base.add("box", i % 2 ? C.white : "#ff6a5a", [-1.15 + i * 0.46, 2.0, 1.25], [0.46, 0.06, 0.6], [0.35, 0, 0]);
    paint.add("box", "#ffffff", [0, 2.75, 0], [1.8, 0.6, 0.12]);
    base.add("box", C.white, [0, 2.75, 0.07], [1.5, 0.35, 0.02]);
    return { base, paint };
  },
  bus() {
    const base = new Shape(), paint = new Shape();
    paint.add("rbox", "#ffffff", [0, 1.45, 0], [4.6, 2.1, 1.8]);
    for (const z of [0.905, -0.905]) {
      base.add("box", C.glass2, [-0.2, 1.75, z], [3.6, 0.7, 0.04]);
      for (let i = 0; i < 4; i++) base.add("box", C.white, [-1.75 + i * 1.0, 1.75, z * 1.01], [0.06, 0.72, 0.03]);
    }
    base.add("box", C.glass2, [2.31, 1.65, 0], [0.04, 1.0, 1.5]);
    base.add("box", C.dgrey, [2.32, 0.95, 0.75], [0.04, 0.12, 0.18]);
    base.add("box", C.dgrey, [0, 2.55, 0], [3.0, 0.12, 1.2]);
    base.add("box", C.black, [1.6, 1.2, 0.905], [0.7, 1.5, 0.04]);
    for (const [x, z] of [[1.5, 0.82], [1.5, -0.82], [-1.5, 0.82], [-1.5, -0.82]]) wheel(base, x, 0.42, z, 0.42, 0.26);
    return { base, paint };
  },
  house2() {
    const base = new Shape(), paint = new Shape();
    paint.add("box", "#ffffff", [0, 2.4, 0], [5, 4.8, 4.2]);
    base.add("pyr", "#8f4a3a", [0, 5.65, 0], [3.9, 1.7, 3.4], [0, Math.PI / 4, 0]);
    base.add("box", C.white, [0, 4.85, 0], [5.15, 0.15, 4.35]);
    for (const f of [1, -1]) windowsGrid(base, -2, 2, 1.0, 4.2, 2.11, 3, 2, 0.8, 0.9, C.glass, f);
    for (const f of [1, -1]) {
      for (const z of [-1, 1]) for (const y of [1.6, 3.6]) base.add("box", C.glass, [2.51 * f, y, z], [0.04, 0.9, 0.8]);
    }
    base.add("box", C.dark, [0, 0.75, 2.12], [1.0, 1.5, 0.06]);
    base.add("box", C.white, [0, 2.2, 2.4], [1.6, 0.1, 0.6]);
    base.add("box", C.dgrey, [0, 2.55, 2.68], [1.6, 0.6, 0.04]);
    return { base, paint };
  },
  shop() {
    const base = new Shape(), paint = new Shape();
    base.add("box", "#f2e6d0", [0, 2.1, 0], [6.4, 4.2, 4.8]);
    base.add("box", C.glass, [0, 1.2, 2.41], [5.0, 1.8, 0.04]);
    for (const x of [-1.6, 0, 1.6]) base.add("box", C.white, [x, 1.2, 2.43], [0.1, 1.8, 0.03]);
    base.add("box", C.dark, [2.4, 1.0, 2.42], [0.9, 2.0, 0.05]);
    for (let i = 0; i < 9; i++) (i % 2 ? base : paint).add("box", "#ffffff", [-2.85 + i * 0.71, 2.55, 2.75], [0.71, 0.06, 0.8], [0.4, 0, 0]);
    paint.add("box", "#ffffff", [0, 3.6, 2.44], [4.4, 0.8, 0.1]);
    base.add("box", C.white, [0, 3.6, 2.5], [3.8, 0.4, 0.02]);
    base.add("box", "#cfc2aa", [0, 4.3, 0], [6.6, 0.2, 5.0]);
    windowsGrid(base, -2.8, 2.8, 3.0, 4.0, 2.41, 3, 1, 0.9, 0.6, C.glass, -1);
    base.add("box", C.dgrey, [-1.5, 4.7, -1], [1.2, 0.8, 1.2]);
    return { base, paint };
  },
  block() {
    const s = new Shape();
    s.add("box", "#e8e2f2", [0, 6.6, 0], [6, 13.2, 6]);
    s.add("box", "#c8bfd8", [0, 0.6, 0], [6.2, 1.2, 6.2]);
    for (const f of [1, -1]) {
      windowsGrid(s, -2.6, 2.6, 2.0, 12.6, 3.01, 4, 6, 0.8, 1.0, C.glass2, f);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
        const z = -2.6 + (5.2 * (i + 0.5)) / 4, y = 2.0 + (10.6 * (j + 0.5)) / 6;
        s.add("box", C.glass2, [3.01 * f, y, z], [0.08, 1.0, 0.8]);
      }
    }
    s.add("box", "#a89cc8", [0, 13.3, 0], [6.3, 0.25, 6.3]);
    s.add("box", C.dgrey, [1.4, 14, 1.2], [1.4, 1.2, 1.4]);
    s.add("cyl8", C.dgrey, [-1.8, 14.4, -1.5], [0.06, 2, 0.06]);
    s.add("box", C.dark, [0, 0.9, 3.02], [1.4, 1.8, 0.05]);
    s.add("box", "#ff6a5a", [0, 1.95, 3.2], [1.8, 0.1, 0.5]);
    return { base: s };
  },
  clock() {
    const s = new Shape();
    s.add("box", C.brick, [0, 5, 0], [5, 10, 5]);
    s.add("box", "#a84a32", [0, 0.4, 0], [5.4, 0.8, 5.4]);
    s.add("box", C.cream, [0, 10.2, 0], [5.4, 0.4, 5.4]);
    s.add("box", C.brick, [0, 12.2, 0], [4, 3.8, 4]);
    for (const [x, z, r] of [[0, 2.01, 0], [0, -2.01, Math.PI], [2.01, 0, H], [-2.01, 0, -H]]) {
      s.add("cyl", C.white, [x, 12.3, z], [1.35, 0.1, 1.35], [H, r, 0]);
      s.add("cyl", C.gold, [x * 1.01, 12.3, z * 1.01], [1.45, 0.06, 1.45], [H, r, 0]);
      s.add("box", C.black, [x * 1.04, 12.6, z * 1.04], [0.08, 0.7, 0.04], [0, r, 0]);
      s.add("box", C.black, [x * 1.04 + (z ? 0.25 : 0), 12.3, z * 1.04 + (x ? 0.25 : 0)], [z ? 0.5 : 0.04, 0.08, x ? 0.5 : 0.04]);
    }
    s.add("box", C.cream, [0, 14.2, 0], [4.4, 0.3, 4.4]);
    s.add("pyr", "#3f9a75", [0, 16.3, 0], [3.0, 4.0, 3.0], [0, Math.PI / 4, 0]);
    s.add("ball", C.gold, [0, 18.4, 0], 0.3);
    windowsGrid(s, -1.6, 1.6, 2.4, 8.6, 2.51, 2, 3, 0.7, 1.2, C.glass, 1);
    windowsGrid(s, -1.6, 1.6, 2.4, 8.6, 2.51, 2, 3, 0.7, 1.2, C.glass, -1);
    s.add("box", C.dark, [0, 1.3, 2.52], [1.4, 2.4, 0.06]);
    return { base: s };
  },

  // ---------- Порт ----------
  gull() {
    const s = new Shape();
    s.add("ball", C.white, [0, 0.26, 0], [0.22, 0.12, 0.12]);
    s.add("ball", C.white, [0.18, 0.36, 0], 0.09);
    s.add("cone", C.yellow, [0.3, 0.35, 0], [0.03, 0.1, 0.03], [0, 0, -H]);
    s.add("box", "#b8c0cc", [-0.04, 0.32, 0.14], [0.26, 0.03, 0.18], [0.35, 0, 0]);
    s.add("box", "#b8c0cc", [-0.04, 0.32, -0.14], [0.26, 0.03, 0.18], [-0.35, 0, 0]);
    s.add("box", C.dgrey, [-0.22, 0.28, 0], [0.1, 0.03, 0.1]);
    animalEyes(s, 0.24, 0.39, 0.05, 0.02);
    for (const z of [-0.05, 0.05]) s.add("cyl8", C.orange, [0, 0.08, z], [0.015, 0.16, 0.015]);
    return { base: s };
  },
  crate() {
    const s = new Shape();
    s.add("box", C.wood, [0, 0.37, 0], 0.74);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) s.add("box", C.dark, [x * 0.35, 0.37, z * 0.35], [0.07, 0.76, 0.07]);
    for (const y of [0.03, 0.71]) {
      s.add("box", C.dark, [0, y, 0.35], [0.76, 0.07, 0.07]);
      s.add("box", C.dark, [0, y, -0.35], [0.76, 0.07, 0.07]);
      s.add("box", C.dark, [0.35, y, 0], [0.07, 0.07, 0.76]);
      s.add("box", C.dark, [-0.35, y, 0], [0.07, 0.07, 0.76]);
    }
    s.add("box", C.dark, [0, 0.37, 0.372], [0.07, 0.9, 0.02], [0, 0, 0.78]);
    return { base: s };
  },
  barrel() {
    const base = new Shape(), paint = new Shape();
    paint.add(tube(0.34, 0.34), "#ffffff", [0, 0.48, 0], [1, 0.95, 1]);
    paint.add(tube(0.38, 0.34), "#ffffff", [0, 0.24, 0], [1, 0.3, 1]);
    paint.add(tube(0.34, 0.38), "#ffffff", [0, 0.72, 0], [1, 0.3, 1]);
    for (const y of [0.18, 0.78]) base.add("cyl", C.dgrey, [0, y, 0], [0.385, 0.05, 0.385]);
    base.add("cyl", C.dgrey, [0, 0.955, 0], [0.32, 0.02, 0.32]);
    return { base, paint };
  },
  buoy() {
    const s = new Shape();
    s.add("cyl", C.red, [0, 0.25, 0], [0.45, 0.5, 0.45]);
    s.add("cyl", C.white, [0, 0.55, 0], [0.4, 0.12, 0.4]);
    s.add("cone", C.red, [0, 0.95, 0], [0.38, 0.7, 0.38]);
    s.add("cyl8", C.dgrey, [0, 1.35, 0], [0.04, 0.2, 0.04]);
    s.add("ball", "#fff4a0", [0, 1.48, 0], 0.09);
    return { base: s };
  },
  pallet() {
    const s = new Shape();
    s.add("box", "#d8b07a", [0, 0.07, 0], [1.3, 0.14, 1.1]);
    for (const [x, z, h] of [[-0.3, -0.25, 0.5], [0.3, -0.25, 0.5], [-0.3, 0.27, 0.5], [0.3, 0.27, 0.5], [0, 0, 0.45]]) {
      const y = h === 0.45 ? 1.15 : 0.4;
      s.add("box", "#c8a070", [x, y, z], [0.58, h, 0.5]);
      s.add("box", "#9a6a3a", [x, y, z], [0.6, 0.05, 0.12]);
    }
    return { base: s };
  },
  rowboat() {
    const base = new Shape(), paint = new Shape();
    paint.add("rbox", "#ffffff", [0, 0.3, 0], [2.0, 0.5, 0.9]);
    paint.add("cone", "#ffffff", [1.15, 0.33, 0], [0.45, 0.6, 0.25], [0, 0, -H]);
    base.add("box", "#8a5a33", [0, 0.5, 0], [1.8, 0.1, 0.72]);
    base.add("box", C.wood, [0.3, 0.6, 0], [0.2, 0.06, 0.8]);
    base.add("box", C.wood, [-0.5, 0.6, 0], [0.2, 0.06, 0.8]);
    base.add("box", C.wood, [-0.1, 0.62, 0.5], [1.4, 0.04, 0.06], [0, 0.3, 0]);
    base.add("box", C.wood, [-0.1, 0.62, -0.5], [1.4, 0.04, 0.06], [0, -0.3, 0]);
    return { base, paint };
  },
  forklift() {
    const s = new Shape();
    s.add("rbox", C.yellow, [-0.1, 0.65, 0], [1.4, 0.7, 1.0]);
    s.add("rbox", C.dgrey, [-0.55, 0.95, 0], [0.5, 0.5, 0.95]);
    for (const [x, z] of [[0.35, 0.42], [0.35, -0.42], [-0.6, 0.42], [-0.6, -0.42]]) s.add("cyl8", C.black, [x, 1.5, z], [0.04, 1.1, 0.04]);
    s.add("box", C.yellow, [-0.12, 2.05, 0], [1.05, 0.08, 0.95]);
    s.add("box", C.black, [-0.1, 1.05, 0], [0.4, 0.1, 0.4]);
    for (const z of [0.3, -0.3]) s.add("box", C.dgrey, [0.75, 1.1, z], [0.1, 2.1, 0.1]);
    for (const z of [0.25, -0.25]) s.add("box", C.dgrey, [1.2, 0.12, z], [0.9, 0.05, 0.12]);
    for (const [x, z] of [[0.4, 0.5], [0.4, -0.5], [-0.55, 0.5], [-0.55, -0.5]]) wheel(s, x, 0.25, z, 0.25, 0.18);
    return { base: s };
  },
  container() {
    const base = new Shape(), paint = new Shape();
    paint.add("box", "#ffffff", [0, 1.25, 0], [3.4, 2.4, 1.8]);
    for (let i = 0; i < 11; i++) {
      for (const z of [0.905, -0.905]) paint.add("box", "#e6e6e6", [-1.5 + i * 0.3, 1.25, z], [0.12, 2.2, 0.04]);
    }
    base.add("box", C.dgrey, [1.71, 1.25, 0], [0.04, 2.3, 1.7]);
    base.add("box", C.grey, [1.74, 1.25, 0.4], [0.04, 2.0, 0.06]);
    base.add("box", C.grey, [1.74, 1.25, -0.4], [0.04, 2.0, 0.06]);
    base.add("box", C.dgrey, [0, 0.05, 0], [3.45, 0.1, 1.85]);
    return { base, paint };
  },
  truck() {
    const base = new Shape(), paint = new Shape();
    paint.add("rbox", "#ffffff", [1.55, 1.25, 0], [1.4, 1.7, 1.8]);
    base.add("box", C.glass2, [2.26, 1.55, 0], [0.04, 0.7, 1.5]);
    base.add("box", C.glass2, [1.6, 1.55, 0], [0.9, 0.6, 1.84]);
    base.add("box", "#f2f2f2", [-0.75, 1.6, 0], [3.0, 2.3, 1.9]);
    paint.add("box", "#ffffff", [-0.75, 1.6, 0.96], [2.6, 0.5, 0.02]);
    paint.add("box", "#ffffff", [-0.75, 1.6, -0.96], [2.6, 0.5, 0.02]);
    base.add("box", C.dgrey, [0, 0.45, 0], [4.4, 0.25, 1.4]);
    for (const [x, z] of [[1.6, 0.85], [1.6, -0.85], [-0.6, 0.85], [-0.6, -0.85], [-1.5, 0.85], [-1.5, -0.85]]) wheel(base, x, 0.42, z, 0.42, 0.28);
    base.add("box", "#fff2a0", [2.26, 0.85, 0.65], [0.04, 0.16, 0.24]);
    base.add("box", "#fff2a0", [2.26, 0.85, -0.65], [0.04, 0.16, 0.24]);
    return { base, paint };
  },
  yacht() {
    const s = new Shape();
    s.add("rbox", C.white, [-0.3, 0.55, 0], [4.2, 1.0, 1.9]);
    s.add("prism", C.white, [2.3, 0.05, 0], [1.9, 1.0, 1.6], [0, 0, 0]);
    s.add("box", C.white, [2.1, 0.55, 0], [0.8, 1.0, 1.9]);
    s.add("cone", C.white, [2.75, 0.55, 0], [0.95, 1.4, 0.5], [0, 0, -H]);
    s.add("box", C.blue, [-0.1, 0.35, 0.96], [4.4, 0.18, 0.02]);
    s.add("box", C.blue, [-0.1, 0.35, -0.96], [4.4, 0.18, 0.02]);
    s.add("rbox", C.white, [-0.6, 1.4, 0], [2.4, 0.9, 1.5]);
    s.add("box", C.glass2, [-0.6, 1.45, 0], [2.2, 0.45, 1.54]);
    s.add("box", C.glass2, [0.62, 1.4, 0], [0.04, 0.5, 1.3]);
    s.add("rbox", C.white, [-0.9, 2.05, 0], [1.4, 0.4, 1.2]);
    s.add("cyl8", C.dgrey, [-1.0, 2.6, 0], [0.04, 0.9, 0.04]);
    s.add("box", "#8a5a33", [-2.35, 1.05, 0], [0.5, 0.06, 1.7]);
    return { base: s };
  },
  warehouse() {
    const s = new Shape();
    s.add("box", "#8aa2b8", [0, 2.6, 0], [7, 5.2, 6]);
    for (let i = 0; i < 15; i++) {
      for (const z of [3.01, -3.01]) s.add("box", "#7690a8", [-3.27 + i * 0.47, 2.6, z], [0.12, 5.2, 0.04]);
    }
    s.add(new T.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI), "#e0e4ea", [0, 5.2, 0], [3.1, 7.2, 1.2], [0, 0, H]);
    s.add("box", C.dgrey, [3.51, 1.6, 0], [0.06, 3.2, 3.2]);
    for (let i = 0; i < 8; i++) s.add("box", C.grey, [3.55, 0.2 + i * 0.4, 0], [0.04, 0.05, 3.1]);
    s.add("box", C.yellow, [3.53, 4.0, 0], [0.04, 0.8, 4.0]);
    s.add("box", C.dgrey, [0, 0.2, 3.3], [3, 0.4, 0.6]);
    return { base: s };
  },
  crane() {
    const s = new Shape();
    for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) s.add("box", "#e8742a", [x, 3, z], [0.4, 6, 0.4]);
    for (const z of [1.6, -1.6]) s.add("box", "#e8742a", [0, 5.8, z], [3.6, 0.4, 0.4]);
    for (const x of [1.6, -1.6]) s.add("box", "#e8742a", [x, 5.8, 0], [0.4, 0.4, 3.6]);
    for (const z of [1.6, -1.6]) s.add("box", "#c85a1a", [0, 3, z], [0.2, 6.6, 0.2], [0, 0, 0.85]);
    s.add("box", "#e8742a", [0, 8.5, 0], [1.4, 5, 1.4]);
    s.add("box", C.yellow, [0.4, 10.2, 0], [1.8, 1.4, 1.6]);
    s.add("box", C.glass2, [1.31, 10.3, 0], [0.04, 0.8, 1.3]);
    s.add("box", "#e8742a", [3.2, 11.3, 0], [9, 0.6, 0.8]);
    s.add("box", "#e8742a", [-2.2, 11.3, 0], [2.2, 0.6, 0.8]);
    s.add("box", C.dgrey, [-2.8, 10.7, 0], [1.2, 1.2, 1.4]);
    s.add("box", "#c85a1a", [1.2, 12.6, 0], [0.4, 2.2, 0.4]);
    s.add("box", C.dgrey, [3.2, 12.4, 0], [6, 0.06, 0.06], [0, 0, -0.38]);
    s.add("box", C.dgrey, [6.8, 8.6, 0], [0.05, 5, 0.05]);
    s.add("box", C.yellow, [6.8, 5.9, 0], [0.5, 0.4, 0.5]);
    for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) s.add("box", C.dgrey, [x, 0.2, z], [0.8, 0.4, 0.6]);
    return { base: s };
  },
  lighthouse() {
    const s = new Shape();
    s.add("cyl8", "#9a9a9a", [0, 0.5, 0], [2.6, 1, 2.6]);
    for (let i = 0; i < 5; i++) {
      const r0 = 1.9 - i * 0.18, r1 = 1.9 - (i + 1) * 0.18;
      s.add(tube(r1, r0), i % 2 ? C.white : "#e03a32", [0, 1 + i * 2.2 + 1.1, 0], [1, 2.2, 1]);
    }
    s.add("cyl", C.dgrey, [0, 12.1, 0], [1.6, 0.2, 1.6]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      s.add("box", C.dgrey, [Math.cos(a) * 1.5, 12.5, Math.sin(a) * 1.5], [0.06, 0.6, 0.06]);
    }
    s.add("cyl", "#fff3a0", [0, 13, 0], [0.9, 1.6, 0.9]);
    s.add("cyl8", C.dgrey, [0, 13, 0], [0.95, 1.6, 0.95].map((v, k) => (k === 1 ? 1.6 : v * 0.3)));
    s.add("cone", "#e03a32", [0, 14.4, 0], [1.2, 1.2, 1.2]);
    s.add("ball", C.dgrey, [0, 15.1, 0], 0.2);
    s.add("box", C.dark, [0, 1.8, 1.72], [0.8, 1.4, 0.06]);
    return { base: s };
  },
  ship() {
    const s = new Shape();
    s.add("rbox", "#2f4f8f", [-0.5, 1.3, 0], [9.6, 2.4, 4.2]);
    s.add("box", "#e04a3a", [-0.5, 0.25, 0], [9.62, 0.5, 4.22]);
    s.add("cone", "#2f4f8f", [5.4, 1.3, 0], [2.1, 2.6, 1.2], [0, 0, -H]);
    s.add("box", C.white, [-0.5, 2.55, 0], [9.62, 0.1, 4.25]);
    s.add("rbox", C.white, [-1.4, 3.6, 0], [5.2, 2.0, 3.4]);
    windowsGrid(s, -3.6, 0.8, 3.2, 4.0, 1.71, 6, 1, 0.5, 0.45, C.glass2, 1);
    windowsGrid(s, -3.6, 0.8, 3.2, 4.0, 1.71, 6, 1, 0.5, 0.45, C.glass2, -1);
    s.add("rbox", C.white, [0.4, 5.1, 0], [1.6, 1.2, 3.0]);
    s.add("box", C.glass2, [1.21, 5.15, 0], [0.04, 0.5, 2.6]);
    s.add("cyl", "#e04a3a", [-2.6, 5.6, 0], [0.7, 2.2, 0.7]);
    s.add("cyl", C.black, [-2.6, 6.8, 0], [0.72, 0.3, 0.72]);
    for (const x of [-3.2, -1.6, 0]) for (const z of [1.85, -1.85]) s.add("rbox", C.orange, [x, 3.0, z], [0.9, 0.4, 0.35]);
    for (let i = 0; i < 9; i++) for (const z of [2.11, -2.11]) s.add("ball", C.white, [-4.5 + i * 1.1, 1.7, z], [0.18, 0.18, 0.04]);
    return { base: s };
  },

  // ---------- Парк аттракционов ----------
  balloon() {
    const base = new Shape(), paint = new Shape();
    paint.add("ball", "#ffffff", [0, 1.4, 0], [0.3, 0.36, 0.3]);
    paint.add("cone", "#ffffff", [0, 1.02, 0], [0.06, 0.1, 0.06]);
    base.add("ball", "#ffffff", [-0.09, 1.52, 0.18], [0.07, 0.1, 0.05]);
    base.add("box", "#f4f4f4", [0, 0.5, 0], [0.015, 1.0, 0.015]);
    base.add("cyl8", C.dgrey, [0, 0.04, 0], [0.08, 0.08, 0.08]);
    return { base, paint };
  },
  duck() {
    const s = new Shape();
    s.add("ball", C.yellow, [0, 0.2, 0], [0.3, 0.2, 0.22]);
    s.add("ball", C.yellow, [-0.22, 0.3, 0], [0.1, 0.12, 0.12], [0, 0, 0.8]);
    s.add("ball", C.yellow, [0.16, 0.42, 0], 0.15);
    s.add("ball", C.orange, [0.32, 0.4, 0], [0.09, 0.04, 0.08]);
    animalEyes(s, 0.26, 0.47, 0.08, 0.03);
    return { base: s };
  },
  icecream() {
    const s = new Shape();
    s.add("cyl", C.white, [0, 0.08, 0], [0.38, 0.16, 0.38]);
    s.add("cone", "#d89a52", [0, 0.6, 0], [0.24, 0.72, 0.24], [Math.PI, 0, 0]);
    s.add("ball", "#ff9fc0", [0, 1.0, 0], 0.27);
    s.add("ball", C.cream, [0.02, 1.25, 0], 0.21);
    s.add("ball", "#8a4a2a", [0, 1.42, 0], 0.12);
    s.add("ball", C.red, [0.05, 1.55, 0], 0.07);
    return { base: s };
  },
  pbench() {
    const s = new Shape();
    bench(s, "#ff9fc8", "#7a5ad8");
    return { base: s };
  },
  bush() {
    const s = new Shape();
    s.add("lump", C.leaf2, [0, 0.45, 0], [0.62, 0.5, 0.62]);
    s.add("lump", C.leaf, [0.25, 0.65, 0.1], 0.38);
    s.add("lump", C.leaf3, [-0.2, 0.7, -0.15], 0.35);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      s.add("ball", i % 2 ? "#ff7fb0" : "#fff07a", [Math.cos(a) * 0.5, 0.5 + (i % 3) * 0.15, Math.sin(a) * 0.5], 0.07);
    }
    return { base: s };
  },
  popcorn() {
    const s = new Shape();
    s.add("rbox", C.red, [0, 0.55, 0], [1.1, 0.7, 0.75]);
    for (let i = 0; i < 4; i++) s.add("box", C.white, [-0.42 + i * 0.28, 0.55, 0.38], [0.12, 0.7, 0.02]);
    s.add("box", C.glass, [0, 1.2, 0], [1.0, 0.6, 0.65]);
    for (let i = 0; i < 9; i++) s.add("ball", "#fff2b0", [-0.35 + (i % 3) * 0.35, 1.0 + Math.floor(i / 3) * 0.1, -0.2 + (i % 2) * 0.3], 0.13);
    s.add("pyr", C.red, [0, 1.75, 0], [0.85, 0.4, 0.7], [0, Math.PI / 4, 0]);
    s.add("ball", C.yellow, [0, 2.0, 0], 0.1);
    for (const [x, z] of [[0.4, 0.3], [0.4, -0.3], [-0.4, 0.3], [-0.4, -0.3]]) wheel(s, x, 0.12, z * 1.25, 0.12, 0.06);
    return { base: s };
  },
  bumper() {
    const base = new Shape(), paint = new Shape();
    paint.add("soft", "#ffffff", [0, 0.45, 0], [1.6, 0.5, 1.1]);
    base.add("ring", C.rubber, [0, 0.3, 0], [0.82, 0.58, 1.2], [H, 0, 0]);
    base.add("box", C.black, [-0.2, 0.75, 0], [0.5, 0.3, 0.6]);
    base.add("cyl8", C.dgrey, [0.2, 0.85, 0], [0.04, 0.3, 0.04], [0, 0, 0.5]);
    base.add("ring", C.dgrey, [0.32, 1.0, 0], [0.12, 0.12, 0.12], [0, H, 0.5]);
    base.add("cyl8", C.dgrey, [-0.6, 1.4, 0], [0.03, 1.6, 0.03]);
    base.add("ball", "#fff3a0", [-0.6, 2.2, 0], 0.08);
    return { base, paint };
  },
  trampoline() {
    const s = new Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      s.add("cyl8", C.dgrey, [Math.cos(a) * 1.25, 0.25, Math.sin(a) * 1.25], [0.06, 0.5, 0.06]);
      s.add("cyl8", "#4f8fff", [Math.cos(a) * 1.32, 0.75, Math.sin(a) * 1.32], [0.04, 0.6, 0.04]);
    }
    s.add("ring", "#4f8fff", [0, 0.55, 0], [1.3, 1.3, 1.4], [H, 0, 0]);
    s.add("cyl", C.black, [0, 0.52, 0], [1.2, 0.04, 1.2]);
    s.add("cyl", "#7fb6ff", [0, 0.545, 0], [0.4, 0.01, 0.4]);
    s.add("ring", "#ffcf3a", [0, 1.05, 0], [1.32, 1.32, 0.8], [H, 0, 0]);
    return { base: s };
  },
  tent() {
    const base = new Shape(), paint = new Shape();
    for (let k = 0; k < 10; k++) {
      (k % 2 ? base : paint).add(wedge("cyl", 10, k), k % 2 ? C.white : "#ffffff", [0, 0.9, 0], [1.75, 1.8, 1.75]);
      (k % 2 ? base : paint).add(wedge("cone", 10, k), k % 2 ? C.white : "#ffffff", [0, 2.6, 0], [1.95, 1.6, 1.95]);
    }
    base.add("cyl", C.yellow, [0, 1.8, 0], [1.8, 0.1, 1.8]);
    base.add("cyl8", C.dgrey, [0, 3.6, 0], [0.04, 0.6, 0.04]);
    base.add("box", C.yellow, [0.18, 3.75, 0], [0.34, 0.2, 0.02]);
    base.add("box", "#3a2a40", [0, 0.8, 1.72], [0.8, 1.5, 0.08]);
    return { base, paint };
  },
  cups() {
    const base = new Shape(), spin = new Shape();
    base.add("cyl", "#b89cff", [0, 0.15, 0], [2.5, 0.3, 2.5]);
    base.add("cyl", "#ffe0f0", [0, 0.31, 0], [2.3, 0.04, 2.3]);
    spin.add("cyl8", "#ffcf3a", [0, 0.9, 0], [0.18, 1.4, 0.18]);
    spin.add("cone", "#ff6fa8", [0, 1.9, 0], [0.9, 0.6, 0.9]);
    const colors = ["#ff6fa8", "#4fb8ff", "#7ee06a", "#ffcf3a"];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU, x = Math.cos(a) * 1.4, z = Math.sin(a) * 1.4;
      spin.add(tube(0.6, 0.42), colors[i], [x, 0.7, z], [1, 0.75, 1]);
      spin.add("cyl", C.white, [x, 1.08, z], [0.62, 0.05, 0.62]);
      spin.add("ring", colors[i], [x + Math.cos(a) * 0.62, 0.75, z + Math.sin(a) * 0.62], [0.2, 0.2, 0.3], [0, -a, 0]);
    }
    return { base, spin: { shape: spin, pivot: [0, 0, 0], axis: "y", speed: 0.9 } };
  },
  carousel() {
    const base = new Shape(), spin = new Shape();
    base.add("cyl", "#ffd0e8", [0, 0.2, 0], [3.2, 0.4, 3.2]);
    base.add("cyl", C.gold, [0, 2.4, 0], [0.3, 4.4, 0.3]);
    spin.add("cyl", "#fff3d6", [0, 0.45, 0], [3.0, 0.12, 3.0]);
    for (let k = 0; k < 12; k++) spin.add(wedge("cone", 12, k), k % 2 ? "#ff6fa8" : C.white, [0, 4.3, 0], [3.3, 1.4, 3.3]);
    spin.add("cyl", "#7a5ad8", [0, 3.55, 0], [3.3, 0.25, 3.3]);
    spin.add("ball", C.gold, [0, 5.1, 0], 0.3);
    const horses = [C.white, "#ffcf3a", "#9fd8ff", "#ffb0c8", C.white, "#b0f0c0"];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, x = Math.cos(a) * 2.2, z = Math.sin(a) * 2.2, y = 1.3 + (i % 2) * 0.35;
      spin.add("cyl8", C.gold, [x, 2.0, z], [0.04, 3.1, 0.04]);
      spin.add("rbox", horses[i], [x, y, z], [0.9, 0.38, 0.3], [0, -a + H, 0]);
      spin.add("rbox", horses[i], [x - Math.sin(a) * 0.45, y + 0.3, z + Math.cos(a) * 0.45], [0.22, 0.42, 0.2], [0, -a + H, 0]);
      spin.add("box", "#e04a6a", [x, y + 0.22, z], [0.3, 0.08, 0.32], [0, -a + H, 0]);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      spin.add("ball", "#fff3a0", [Math.cos(a) * 3.25, 3.42, Math.sin(a) * 3.25], 0.1);
    }
    return { base, spin: { shape: spin, pivot: [0, 0, 0], axis: "y", speed: 0.7 } };
  },
  castle() {
    const s = new Shape();
    s.add("soft", "#4fb8ff", [0, 0.5, 0], [6.4, 1.0, 5.6]);
    s.add("soft", "#ffcf3a", [0, 2.2, -2.3], [6.0, 2.6, 0.7]);
    s.add("soft", "#ff6fa8", [-2.9, 2.2, 0], [0.7, 2.6, 4.6]);
    s.add("soft", "#ff6fa8", [2.9, 2.2, 0], [0.7, 2.6, 4.6]);
    for (const [x, z] of [[2.9, 2.5], [-2.9, 2.5], [2.9, -2.5], [-2.9, -2.5]]) {
      s.add("cyl", "#ff5a6a", [x, 2.4, z], [0.75, 4.2, 0.75]);
      s.add("cone", "#7ee06a", [x, 5.2, z], [0.95, 1.5, 0.95]);
      s.add("ball", C.yellow, [x, 6.0, z], 0.18);
    }
    for (let i = 0; i < 6; i++) s.add("soft", "#ffcf3a", [-2.3 + i * 0.92, 3.8, -2.3], [0.55, 0.6, 0.7]);
    s.add("soft", "#ffcf3a", [0, 2.0, 2.5], [2.6, 3.0, 0.6]);
    s.add("cyl", "#7a5ad8", [0, 1.6, 2.6], [0.9, 0.7, 0.9], [H, 0, 0]);
    s.add("ball", "#ff6fa8", [0, 4.0, 2.5], 0.6);
    return { base: s };
  },
  swing() {
    const base = new Shape(), spin = new Shape();
    base.add("cyl", "#b89cff", [0, 0.2, 0], [3.0, 0.4, 3.0]);
    base.add(tube(0.45, 0.7), "#ffcf3a", [0, 5, 0], [1, 9.6, 1]);
    for (let k = 0; k < 12; k++) spin.add(wedge("cone", 12, k), k % 2 ? "#4fb8ff" : C.white, [0, 10.4, 0], [3.4, 1.5, 3.4]);
    spin.add("cyl", "#ff6fa8", [0, 9.6, 0], [3.4, 0.3, 3.4]);
    spin.add("ball", C.gold, [0, 11.3, 0], 0.35);
    const seats = ["#ff6fa8", "#ffcf3a", "#7ee06a", "#4fb8ff"];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU, r = 3.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      spin.add("box", C.dgrey, [(x + Math.cos(a) * 3.2) / 2, 7.6, (z + Math.sin(a) * 3.2) / 2], [0.04, 4.1, 0.04], [Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32]);
      spin.add("rbox", seats[i % 4], [x + Math.cos(a) * 0.35, 5.6, z + Math.sin(a) * 0.35], [0.5, 0.2, 0.5], [0, -a, 0]);
    }
    return { base, spin: { shape: spin, pivot: [0, 0, 0], axis: "y", speed: 1.4 } };
  },
  ferris() {
    const base = new Shape(), spin = new Shape();
    for (const z of [1.1, -1.1]) {
      for (const x of [-1, 1]) s2(base, x * 3.6, 0, z, 0, 9, z);
    }
    base.add("cyl8", C.dgrey, [0, 9, 0], [0.35, 2.6, 0.35], [H, 0, 0]);
    base.add("box", "#b89cff", [0, 0.25, 0], [8.4, 0.5, 3.2]);
    base.add("box", C.dark, [3.6, 0.9, 1.4], [1.6, 0.9, 0.6]);
    const rim = new T.TorusGeometry(7.2, 0.2, 6, 48);
    spin.add(rim, "#ff6fa8", [0, 0, 0.75]);
    spin.add(rim, "#ff6fa8", [0, 0, -0.75]);
    spin.add(new T.TorusGeometry(2.0, 0.25, 6, 24), "#ffcf3a", [0, 0, 0]);
    const cabins = ["#4fb8ff", "#ffcf3a", "#7ee06a", "#ff6fa8", "#b89cff", "#ff8a3d"];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, x = Math.cos(a), y = Math.sin(a);
      spin.add("box", C.white, [x * 3.6, y * 3.6, 0.75], [0.1, 7.2, 0.1], [0, 0, a - H]);
      spin.add("box", C.white, [x * 3.6, y * 3.6, -0.75], [0.1, 7.2, 0.1], [0, 0, a - H]);
      spin.add("ball", cabins[i % 6], [x * 7.4, y * 7.4, 0], [0.62, 0.62, 0.62]);
      spin.add("ball", "#fff3a0", [x * 7.2, y * 7.2, 0.9], 0.12);
    }
    return { base, spin: { shape: spin, pivot: [0, 9, 0], axis: "z", speed: 0.25 } };
  },
};
// наклонная стойка от точки (x0, y0) к (x1, y1)
function s2(s, x0, y0, z, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  s.add("box", "#7a5ad8", [(x0 + x1) / 2, (y0 + y1) / 2, z], [0.35, len, 0.35], [0, 0, -Math.atan2(dx, dy)]);
}

// Кэш готовых геометрий
const built = new Map();
export function modelOf(id) {
  if (!built.has(id)) {
    const make = MODELS[id];
    if (!make) throw new Error("Нет модели: " + id);
    const m = make();
    built.set(id, {
      base: m.base.build(),
      paint: m.paint ? m.paint.build() : null,
      spin: m.spin ? { geo: m.spin.shape.build(false), pivot: m.spin.pivot, axis: m.spin.axis, speed: m.spin.speed } : null,
    });
  }
  return built.get(id);
}
export const hasModel = (id) => !!MODELS[id];

// ---------- Украшения за краем арены (не поднимаются) ----------
export function decorTree(kind) {
  const s = new Shape();
  if (kind === "pine") {
    s.add(tube(0.18, 0.26, 6), C.trunk, [0, 0.6, 0], [1, 1.2, 1]);
    s.add("cone", "#3f9a55", [0, 2.2, 0], [1.4, 2.4, 1.4]);
    s.add("cone", "#4fb060", [0, 3.4, 0], [1.0, 1.9, 1.0]);
  } else if (kind === "palm") {
    s.add(tube(0.14, 0.24, 6), "#b08a5a", [0, 2.2, 0], [1, 4.4, 1], [0, 0, 0.12]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      s.add("box", C.leaf2, [0.5 + Math.cos(a) * 0.9, 4.4, Math.sin(a) * 0.9], [1.9, 0.06, 0.45], [0, -a, -0.35]);
    }
  } else if (kind === "candy") {
    s.add("cyl8", C.white, [0, 1, 0], [0.12, 2, 0.12]);
    s.add("ball", "#ff9fc8", [0, 2.4, 0], [1.0, 0.9, 1.0]);
    s.add("ball", "#ffffff", [0.3, 2.7, 0.3], 0.3);
  } else {
    tree(s, 0, 0, 1);
  }
  return s.build();
}
