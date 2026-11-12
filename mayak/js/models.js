// Модели «Маяка»: всё собирается из простых фигур и сливается в одну геометрию с цветами в вершинах.
// У вершины есть ещё «свечение» (glow): окна, гирлянды и стёкла горят сами, без света сцены.
// Нос лодки смотрит в −Z, как принято в three.js.
import * as T from "../vendor/three/three.module.min.js?v=b9a86e0e";

const TAU = Math.PI * 2;
const M = new T.Matrix4();
const Q = new T.Quaternion();
const E = new T.Euler();
const P = new T.Vector3();
const S = new T.Vector3();
const V = new T.Vector3();
const C1 = new T.Color();
const C2 = new T.Color();

const GEO = {
  box: new T.BoxGeometry(1, 1, 1),
  ball: new T.SphereGeometry(0.5, 10, 7),
  ico: new T.IcosahedronGeometry(1, 1),
  blob: new T.IcosahedronGeometry(1, 3),
  cyl: new T.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new T.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new T.ConeGeometry(0.5, 1, 10),
  cone4: new T.ConeGeometry(0.5, 1, 4),
  cone6: new T.ConeGeometry(0.5, 1, 6),
  torus: new T.TorusGeometry(0.5, 0.16, 6, 14),
  ring: new T.TorusGeometry(0.5, 0.05, 5, 16),
};

// Сборщик: складывает фигуры в общий список вершин.
export class Kit {
  constructor() {
    this.pos = [];
    this.col = [];
    this.glow = [];
  }

  // p — место, r — поворот, s — размер; glow — свечение; top — второй цвет (градиент снизу вверх); warp(v) — правка вершины
  add(geo, hex, { p = [0, 0, 0], r = [0, 0, 0], s = 1, glow = 0, top = null, warp = null } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const a = g.attributes.position;
    const scale = typeof s === "number" ? [s, s, s] : s;
    M.compose(P.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(r[0], r[1], r[2])), S.set(scale[0], scale[1], scale[2]));
    C1.set(hex);
    if (top !== null) C2.set(top);
    let minY = Infinity;
    let maxY = -Infinity;
    if (top !== null) {
      for (let i = 0; i < a.count; i++) {
        const y = a.getY(i);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    for (let i = 0; i < a.count; i++) {
      V.fromBufferAttribute(a, i);
      const k = top !== null ? (V.y - minY) / (maxY - minY || 1) : 0;
      if (warp) warp(V);
      V.applyMatrix4(M);
      this.pos.push(V.x, V.y, V.z);
      if (top !== null) this.col.push(C1.r + (C2.r - C1.r) * k, C1.g + (C2.g - C1.g) * k, C1.b + (C2.b - C1.b) * k);
      else this.col.push(C1.r, C1.g, C1.b);
      this.glow.push(glow);
    }
    if (g !== geo) g.dispose();
    return this;
  }

  // треугольники напрямую: список точек по три; у точки может быть свой цвет (четвёртым значением)
  tris(points, hex, glow = 0) {
    for (const pt of points) {
      C1.set(pt[3] || hex);
      this.pos.push(pt[0], pt[1], pt[2]);
      this.col.push(C1.r, C1.g, C1.b);
      this.glow.push(glow);
    }
    return this;
  }

  build() {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(this.col, 3));
    g.setAttribute("glow", new T.Float32BufferAttribute(this.glow, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Игрушечный материал: цвет из вершин, плоские грани, свечение отдельных вершин.
export function toyMaterial(extra = {}) {
  const material = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.DoubleSide, ...extra });
  material.userData.glow = { value: 1 };
  material.userData.self = { value: 0 }; // собственный свет: лодка с горящим фонариком освещает сама себя
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = material.userData.glow;
    shader.uniforms.uSelf = material.userData.self;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGlow;\nuniform float uGlow;\nuniform float uSelf;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * (vGlow * uGlow + uSelf);");
  };
  material.customProgramCacheKey = () => "toy";
  return material;
}

const rnd = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// Корпус лодки: набор сечений от кормы (+Z) к носу (−Z). Возвращает три набора треугольников: днище, борт-полоса, палуба.
function hull(L, W, H, { blunt = 0.25, sheer = 0.28, deckDrop = 0.06 } = {}) {
  const N = 9;
  const rows = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = L / 2 - t * L;
    let w = t < 0.3 ? 0.84 + 0.16 * Math.sin((t / 0.3) * Math.PI / 2) : Math.cos(((t - 0.3) / 0.7) * Math.PI / 2) ** (0.62 + blunt);
    if (i === N) w = 0.02;
    const half = (W / 2) * w;
    const top = H * (1 + sheer * t * t);
    const keel = H * 0.02 + H * 0.35 * Math.max(0, t - 0.6) ** 1.5;
    rows.push({ z, half, top, keel });
  }
  const lower = [];
  const band = [];
  const deck = [];
  const quad = (list, a, b, c, d) => list.push(a, b, c, a, c, d);
  for (let i = 0; i < N; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    for (const side of [-1, 1]) {
      const pt = (row, kx, y) => [side * row.half * kx, y, row.z];
      const ka = [pt(a, 0, a.keel), pt(a, 0.72, a.keel + (a.top - a.keel) * 0.34), pt(a, 0.98, a.keel + (a.top - a.keel) * 0.66), pt(a, 1.03, a.top)];
      const kb = [pt(b, 0, b.keel), pt(b, 0.72, b.keel + (b.top - b.keel) * 0.34), pt(b, 0.98, b.keel + (b.top - b.keel) * 0.66), pt(b, 1.03, b.top)];
      if (side > 0) {
        quad(lower, ka[0], kb[0], kb[1], ka[1]);
        quad(lower, ka[1], kb[1], kb[2], ka[2]);
        quad(band, ka[2], kb[2], kb[3], ka[3]);
      } else {
        quad(lower, ka[1], kb[1], kb[0], ka[0]);
        quad(lower, ka[2], kb[2], kb[1], ka[1]);
        quad(band, ka[3], kb[3], kb[2], ka[2]);
      }
    }
    quad(deck, [-a.half * 0.98, a.top - deckDrop, a.z], [a.half * 0.98, a.top - deckDrop, a.z], [b.half * 0.98, b.top - deckDrop, b.z], [-b.half * 0.98, b.top - deckDrop, b.z]);
  }
  // корма
  const s = rows[0];
  const sy = (k) => s.keel + (s.top - s.keel) * k;
  lower.push([0, s.keel, s.z], [s.half * 0.72, sy(0.34), s.z], [-s.half * 0.72, sy(0.34), s.z]);
  quad(lower, [-s.half * 0.72, sy(0.34), s.z], [s.half * 0.72, sy(0.34), s.z], [s.half * 0.98, sy(0.66), s.z], [-s.half * 0.98, sy(0.66), s.z]);
  quad(band, [-s.half * 0.98, sy(0.66), s.z], [s.half * 0.98, sy(0.66), s.z], [s.half * 1.03, s.top, s.z], [-s.half * 1.03, s.top, s.z]);
  return { lower, band, deck, top: (t) => H * (1 + sheer * t * t) };
}

// Человечек в плаще: тело-конус и голова.
function sailor(kit, x, y, z, coat, hat) {
  kit.add(GEO.cone, coat, { p: [x, y + 0.17, z], s: [0.26, 0.36, 0.26] });
  kit.add(GEO.ball, "#f2c9a2", { p: [x, y + 0.40, z], s: 0.19 });
  kit.add(GEO.ball, hat, { p: [x, y + 0.47, z], s: [0.21, 0.12, 0.21] });
}

// где у лодки висит фонарик и какого она размера (для пены и значков)
export const BOAT_LOOK = {
  row: { lantern: [0, 0.98, -0.52], size: 1.5, height: 1.3 },
  sail: { lantern: [0, 2.22, -0.08], size: 1.9, height: 2.5 },
  speed: { lantern: [0, 1.12, 0.18], size: 1.75, height: 1.45 },
  ferry: { lantern: [0, 1.95, -0.42], size: 2.9, height: 2.25 },
  lamp: { lantern: [0, 2.12, 0.05], size: 1.9, height: 2.45 },
};

function buildBoat(kind) {
  const kit = new Kit();
  if (kind === "row") {
    const h = hull(1.5, 0.66, 0.36, { deckDrop: 0.16 });
    kit.tris(h.lower, "#9a6238").tris(h.band, "#f3e3bd").tris(h.deck, "#6b4426");
    kit.add(GEO.box, "#c79a62", { p: [0, 0.27, 0.22], s: [0.52, 0.05, 0.14] });
    kit.add(GEO.box, "#c79a62", { p: [0, 0.27, -0.25], s: [0.46, 0.05, 0.14] });
    sailor(kit, 0, 0.27, 0.22, "#f4c531", "#d8463c");
    // вёсла
    kit.add(GEO.box, "#e8d3a4", { p: [0.52, 0.34, 0.1], r: [0, 0.25, -0.35], s: [0.8, 0.04, 0.07] });
    kit.add(GEO.box, "#e8d3a4", { p: [-0.52, 0.34, 0.1], r: [0, -0.25, 0.35], s: [0.8, 0.04, 0.07] });
    // шест с фонарём на носу
    kit.add(GEO.cyl6, "#5d3b22", { p: [0, 0.62, -0.52], s: [0.05, 0.62, 0.05] });
  } else if (kind === "sail") {
    const h = hull(1.9, 0.74, 0.42);
    kit.tris(h.lower, "#f1f4f6").tris(h.band, "#dc4a40").tris(h.deck, "#c59662");
    kit.add(GEO.box, "#e7eef3", { p: [0, 0.52, 0.35], s: [0.42, 0.22, 0.5] });
    kit.add(GEO.box, "#ffd98a", { p: [0.215, 0.53, 0.35], s: [0.02, 0.1, 0.3], glow: 1.6 });
    kit.add(GEO.box, "#ffd98a", { p: [-0.215, 0.53, 0.35], s: [0.02, 0.1, 0.3], glow: 1.6 });
    kit.add(GEO.cyl6, "#6b4426", { p: [0, 1.28, -0.08], s: [0.06, 1.85, 0.06] });
    kit.add(GEO.cyl6, "#6b4426", { p: [0, 0.66, 0.42], r: [Math.PI / 2, 0, 0], s: [0.045, 1.0, 0.045] });
    // грот и стаксель
    const sail = [[0.02, 2.05, -0.06], [0.02, 0.72, -0.02], [0.1, 0.72, 0.9]];
    kit.tris(sail, "#fff4d8");
    kit.tris([[0.0, 1.9, -0.12], [-0.08, 0.6, -0.82], [0.0, 0.62, -0.14]], "#ffe2ad");
    kit.tris([[0, 2.2, -0.08], [0, 2.08, -0.08], [0, 2.14, 0.24]], "#e8483f");
    sailor(kit, 0.12, 0.38, 0.72, "#3f7fd0", "#f4c531");
  } else if (kind === "speed") {
    const h = hull(1.75, 0.7, 0.34, { blunt: -0.05, sheer: 0.4 });
    kit.tris(h.lower, "#ff9b3d").tris(h.band, "#fff6e6").tris(h.deck, "#ffd9a0");
    kit.add(GEO.box, "#fff6e6", { p: [0, 0.42, 0.18], s: [0.5, 0.2, 0.62] });
    kit.add(GEO.box, "#9fe3ff", { p: [0, 0.56, -0.16], r: [0.5, 0, 0], s: [0.46, 0.22, 0.03], glow: 0.5 });
    kit.add(GEO.box, "#30343f", { p: [0, 0.33, 0.9], s: [0.2, 0.3, 0.16] });
    kit.add(GEO.box, "#e8483f", { p: [0, 0.2, 0.3], s: [0.72, 0.05, 0.9] });
    kit.add(GEO.cyl6, "#d8dde6", { p: [0, 0.8, 0.18], s: [0.04, 0.6, 0.04] });
    sailor(kit, 0, 0.5, 0.3, "#35b08a", "#ffffff");
  } else if (kind === "ferry") {
    const h = hull(2.9, 1.3, 0.5, { blunt: 0.6, sheer: 0.12 });
    kit.tris(h.lower, "#2f5aa8").tris(h.band, "#f4f7fa").tris(h.deck, "#b9c7d6");
    kit.add(GEO.box, "#f4f7fa", { p: [0, 0.74, 0.08], s: [1.04, 0.46, 1.95] });
    kit.add(GEO.box, "#e3ebf2", { p: [0, 1.16, -0.1], s: [0.86, 0.36, 1.3] });
    kit.add(GEO.box, "#2f5aa8", { p: [0, 0.99, 0.08], s: [1.1, 0.05, 2.02] });
    kit.add(GEO.box, "#2f5aa8", { p: [0, 1.36, -0.1], s: [0.92, 0.05, 1.38] });
    for (let i = 0; i < 6; i++) {
      for (const side of [-1, 1]) kit.add(GEO.box, "#ffd27a", { p: [side * 0.525, 0.76, -0.72 + i * 0.32], s: [0.02, 0.17, 0.2], glow: 2.0 });
    }
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) kit.add(GEO.box, "#ffe6a8", { p: [side * 0.435, 1.17, -0.56 + i * 0.3], s: [0.02, 0.14, 0.18], glow: 2.0 });
    }
    kit.add(GEO.box, "#bfe9ff", { p: [0, 1.18, -0.76], s: [0.7, 0.16, 0.02], glow: 0.9 });
    kit.add(GEO.cyl, "#e2483e", { p: [0, 1.62, 0.3], s: [0.3, 0.5, 0.3] });
    kit.add(GEO.cyl, "#262b36", { p: [0, 1.9, 0.3], s: [0.32, 0.1, 0.32] });
    kit.add(GEO.cyl6, "#d8dde6", { p: [0, 1.64, -0.42], s: [0.04, 0.55, 0.04] });
    kit.add(GEO.torus, "#ff8f3a", { p: [0.56, 0.62, 0.86], r: [0, Math.PI / 2, 0], s: 0.24 });
    kit.add(GEO.torus, "#ff8f3a", { p: [-0.56, 0.62, 0.86], r: [0, Math.PI / 2, 0], s: 0.24 });
  } else {
    // фонарщик: джонка с ребристым парусом и гирляндой
    const h = hull(1.9, 0.78, 0.46, { blunt: 0.3, sheer: 0.5 });
    kit.tris(h.lower, "#a33434").tris(h.band, "#eab852").tris(h.deck, "#b98352");
    kit.add(GEO.box, "#7e2727", { p: [0, 0.6, 0.62], s: [0.5, 0.3, 0.46] });
    kit.add(GEO.box, "#eab852", { p: [0, 0.77, 0.62], s: [0.58, 0.05, 0.54] });
    kit.add(GEO.box, "#ffd98a", { p: [0, 0.6, 0.385], s: [0.3, 0.12, 0.02], glow: 1.6 });
    kit.add(GEO.cyl6, "#5d3b22", { p: [0, 1.22, 0.05], s: [0.06, 1.8, 0.06] });
    for (let i = 0; i < 4; i++) {
      kit.add(GEO.box, i % 2 ? "#f6a04a" : "#f08a3c", { p: [0.04, 0.78 + i * 0.3, -0.05], r: [0, 0.12, 0], s: [0.03, 0.27, 0.92 - i * 0.1] });
      kit.add(GEO.box, "#7e4a22", { p: [0.04, 0.93 + i * 0.3, -0.05], r: [0, 0.12, 0], s: [0.05, 0.03, 0.96 - i * 0.1] });
    }
    // гирлянда от носа через мачту к корме
    const colors = ["#ffd45e", "#ff8d6b", "#9be6ff", "#ffd45e", "#ff9ad5", "#b8ff9a", "#ffd45e"];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const z = -0.9 + t * 1.8;
      const y = 0.75 + (1 - Math.abs(t - 0.53) * 2) * 1.05 - Math.sin(t * Math.PI * 2) ** 2 * 0.12;
      kit.add(GEO.ball, colors[i], { p: [0, y, z], s: 0.11, glow: 3.2 });
    }
    sailor(kit, -0.14, 0.42, -0.42, "#4f9be0", "#e8483f");
  }
  return kit.build();
}

const boatCache = new Map();
export function boatGeometry(kind) {
  if (!boatCache.has(kind)) boatCache.set(kind, buildBoat(kind));
  return boatCache.get(kind);
}

// Спасательный круг с экипажем: без драмы, машет рукой.
let ringGeo = null;
export function lifeRingGeometry() {
  if (ringGeo) return ringGeo;
  const kit = new Kit();
  kit.add(GEO.torus, "#ff8f3a", { p: [0, 0.08, 0], r: [Math.PI / 2, 0, 0], s: 0.62 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    kit.add(GEO.box, "#ffffff", { p: [Math.cos(a) * 0.31, 0.08, Math.sin(a) * 0.31], r: [0, -a, 0], s: [0.13, 0.22, 0.2] });
  }
  kit.add(GEO.cone, "#f4c531", { p: [0, 0.2, 0], s: [0.3, 0.36, 0.3] });
  kit.add(GEO.ball, "#f2c9a2", { p: [0, 0.46, 0], s: 0.22 });
  kit.add(GEO.ball, "#d8463c", { p: [0, 0.54, 0], s: [0.24, 0.13, 0.24] });
  kit.add(GEO.box, "#f4c531", { p: [0.2, 0.5, 0], r: [0, 0, -0.7], s: [0.08, 0.32, 0.08] });
  ringGeo = kit.build();
  return ringGeo;
}

// ---------- Рифы ----------
// Каждый камень — помятый многогранник; все камни ночи сливаются в одну геометрию.
export function reefGeometry(rocks, seed = 1) {
  const kit = new Kit();
  const random = rnd(seed);
  for (const rock of rocks) {
    const height = rock.r * (0.55 + random() * 0.55);
    const phase = random() * 10;
    const warp = (v) => {
      // сдвиг по направлению от центра: одинаковый для совпадающих вершин
      const k = 1 + 0.2 * Math.sin(v.x * 4.1 + phase) * Math.cos(v.z * 3.7 + phase * 1.7) + 0.12 * Math.sin(v.y * 6.3 + phase * 0.6);
      v.x *= k;
      v.z *= k;
      // верх срезан: получается плоская макушка, а не шар
      v.y = Math.min(v.y, 0.62 + 0.2 * Math.sin(v.x * 3 + phase)) * (v.y > 0 ? 1 : 0.5);
    };
    kit.add(GEO.ico, "#12151b", { p: [rock.x, height * 0.1, -rock.z], r: [0, random() * TAU, 0], s: [rock.r * 0.96, height, rock.r * 0.96], top: "#8f8f8c", warp });
    // спутники поменьше — кромка получается неровной
    const extra = 1 + Math.floor(random() * 2);
    for (let i = 0; i < extra; i++) {
      const a = random() * TAU;
      const r = rock.r * (0.28 + random() * 0.2);
      const d = rock.r * 0.7;
      kit.add(GEO.ico, "#12151b", { p: [rock.x + Math.cos(a) * d, r * 0.15, -rock.z + Math.sin(a) * d], r: [random(), random() * TAU, 0], s: [r, r * 0.9, r], top: "#77777a", warp });
    }
    // на некоторых камнях спит чайка
    if (random() < 0.16 && rock.r > 0.8) {
      const y = height * 1.02;
      kit.add(GEO.ball, "#f4f6f8", { p: [rock.x, y + 0.1, -rock.z], s: [0.2, 0.17, 0.3] });
      kit.add(GEO.ball, "#f4f6f8", { p: [rock.x, y + 0.22, -rock.z + 0.12], s: 0.13 });
      kit.add(GEO.cone, "#ffb347", { p: [rock.x, y + 0.21, -rock.z + 0.21], r: [Math.PI / 2, 0, 0], s: [0.05, 0.1, 0.05] });
    }
  }
  return kit.build();
}

// ---------- Маяк ----------
// Стоит в начале координат своей группы; lampY — высота лампы.
export const LAMP_Y = 4.72;
export function lighthouseGeometry() {
  const kit = new Kit();
  const random = rnd(77);
  const warp = (v) => {
    const k = 1 + 0.16 * Math.sin(v.x * 3.3 + 1) * Math.cos(v.z * 2.9) + 0.1 * Math.sin(v.y * 5);
    v.x *= k;
    v.z *= k;
  };
  // скала
  kit.add(GEO.ico, "#232d45", { p: [0, 0.05, 0.1], s: [1.75, 0.85, 1.5], top: "#7b8aa8", warp });
  kit.add(GEO.ico, "#232d45", { p: [-1.35, 0, 0.5], r: [0, 1, 0], s: [0.95, 0.5, 0.85], top: "#6d7b99", warp });
  kit.add(GEO.ico, "#232d45", { p: [1.3, 0, -0.15], r: [0, 2, 0], s: [0.85, 0.48, 0.9], top: "#6d7b99", warp });
  kit.add(GEO.ico, "#232d45", { p: [0.4, 0, -1.1], r: [0, 4, 0], s: [0.8, 0.36, 0.6], top: "#6d7b99", warp });
  // башня в красно-белую полоску
  const base = 0.72;
  const rings = 5;
  const tall = 3.3;
  for (let i = 0; i < rings; i++) {
    const r0 = 0.62 - (0.2 * i) / rings;
    const r1 = 0.62 - (0.2 * (i + 1)) / rings;
    const slice = new T.CylinderGeometry(r1, r0, tall / rings, 12);
    kit.add(slice, i % 2 ? "#e2483e" : "#f6f3ea", { p: [0, base + (i + 0.5) * (tall / rings), 0] });
    slice.dispose();
  }
  kit.add(GEO.cyl, "#39435a", { p: [0, base + 0.05, 0], s: [1.42, 0.14, 1.42] });
  // дверь и окошки
  kit.add(GEO.box, "#5b3a22", { p: [0, base + 0.36, 0.6], s: [0.26, 0.5, 0.06] });
  kit.add(GEO.box, "#ffd27a", { p: [0, base + 1.5, 0.535], s: [0.14, 0.22, 0.05], glow: 2.2 });
  kit.add(GEO.box, "#ffd27a", { p: [0.2, base + 2.5, 0.42], r: [0, 0.5, 0], s: [0.12, 0.2, 0.05], glow: 2.2 });
  // балкон с перилами
  const top = base + tall;
  kit.add(GEO.cyl, "#39435a", { p: [0, top + 0.05, 0], s: [1.34, 0.12, 1.34] });
  kit.add(GEO.ring, "#d7dde8", { p: [0, top + 0.3, 0], r: [Math.PI / 2, 0, 0], s: 1.3 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    kit.add(GEO.cyl6, "#d7dde8", { p: [Math.cos(a) * 0.64, top + 0.2, Math.sin(a) * 0.64], s: [0.03, 0.24, 0.03] });
  }
  // фонарная комната: стекло светится
  kit.add(GEO.cyl, "#fff0b8", { p: [0, top + 0.42, 0], s: [0.72, 0.6, 0.72], glow: 3.4 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    kit.add(GEO.box, "#39435a", { p: [Math.cos(a) * 0.36, top + 0.42, Math.sin(a) * 0.36], r: [0, -a, 0], s: [0.04, 0.62, 0.05] });
  }
  kit.add(GEO.cone, "#d8443b", { p: [0, top + 0.98, 0], s: [1.0, 0.52, 1.0] });
  kit.add(GEO.ball, "#f4c531", { p: [0, top + 1.28, 0], s: 0.13 });
  // домик смотрителя
  kit.add(GEO.box, "#f1ead9", { p: [1.25, 0.78, 0.35], s: [0.95, 0.62, 0.8] });
  kit.add(GEO.cone4, "#b9473c", { p: [1.25, 1.3, 0.35], r: [0, Math.PI / 4, 0], s: [1.5, 0.5, 1.3] });
  kit.add(GEO.box, "#ffd27a", { p: [1.25, 0.82, 0.76], s: [0.24, 0.22, 0.03], glow: 2.4 });
  kit.add(GEO.box, "#ffd27a", { p: [0.77, 0.82, 0.35], s: [0.03, 0.2, 0.22], glow: 2.0 });
  kit.add(GEO.box, "#8c5a3a", { p: [1.5, 1.42, 0.2], s: [0.16, 0.36, 0.16] });
  // кустики и камешки
  for (let i = 0; i < 5; i++) {
    const a = random() * TAU;
    const d = 1.2 + random() * 0.5;
    kit.add(GEO.ball, "#2f6b4c", { p: [Math.cos(a) * d, 0.55 - d * 0.18, Math.sin(a) * d * 0.8], s: [0.3, 0.2, 0.3], top: "#5fa06c" });
  }
  return kit.build();
}

// ---------- Берег и деревня у гавани ----------
// hw — полуширина бухты, hx — где вход в гавань. Вода заходит в бухточку у причала.
export function shoreGeometry(hw, hx) {
  const kit = new Kit();
  const random = rnd(Math.round(hw * 100) + 5);
  const noise = (x) => Math.sin(x * 0.53 + 1.3) * 0.22 + Math.sin(x * 1.37 + 0.2) * 0.12 + Math.sin(x * 0.19) * 0.3;
  const X0 = -hw - 26;
  const X1 = hw + 26;
  const cols = 96;
  const rows = [0.45, -0.25, -0.9, -1.8, -3.0, -4.6, -6.5, -9.5, -16, -40]; // z правил: от кромки воды вглубь суши
  const height = [-0.12, 0.1, 0.28, 0.42, 0.55, 0.75, 0.95, 1.1, 1.3, 1.3];
  const tone = ["#8f8468", "#857f62", "#4f7c57", "#3f6f4f", "#356549", "#2d5a44", "#27503f", "#22473a", "#1c3c33", "#17332d"];
  const pt = (i, j) => {
    const x = X0 + ((X1 - X0) * i) / cols;
    // бухточка гавани: кромка отступает вглубь суши
    const cove = Math.exp(-(((x - hx) / 1.9) ** 4));
    let z = rows[j] + noise(x + j * 3.1) * (j === 0 ? 0.55 : 0.8) - cove * (j < 3 ? 1.75 - j * 0.42 : 0);
    // за краями бухты берег выдаётся мысами в море
    const cape = Math.max(0, Math.abs(x) - hw - 0.6);
    z += Math.min(7, cape * 0.85) * Math.max(0, 1 - j / 9);
    const y = height[j] + (j > 1 ? noise(x * 1.7 + j) * 0.22 : 0) + Math.min(1.6, cape * 0.12) * (j > 1 ? 1 : 0) - cove * (j < 3 ? 0.2 : 0);
    return [x, y, -z, tone[j]];
  };
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = pt(i, j);
      const b = pt(i + 1, j);
      const c = pt(i + 1, j + 1);
      const d = pt(i, j + 1);
      if ((i + j) % 2) kit.tris([a, b, c, a, c, d], tone[j]);
      else kit.tris([a, b, d, b, c, d], tone[j]);
    }
  }
  // ёлки и кусты
  for (let i = 0; i < 70; i++) {
    const x = X0 + random() * (X1 - X0);
    const z = -1.6 - random() * 6.5;
    if (x - hx > -5.8 && x - hx < 3.3 && z > -4.6) continue;
    if (Math.abs(x - 0.4) < 2.7 && z > -4) continue;
    const cape = Math.max(0, Math.abs(x) - hw - 0.6);
    const zz = z + Math.min(7, cape * 0.85) * 0.5;
    const y = 0.45 + Math.min(1.6, cape * 0.12) + (-z) * 0.07;
    const s = 0.7 + random() * 0.7;
    if (random() < 0.7) {
      kit.add(GEO.cyl6, "#4a3424", { p: [x, y + 0.15 * s, -zz], s: [0.12 * s, 0.4 * s, 0.12 * s] });
      kit.add(GEO.cone6, "#1d4a3a", { p: [x, y + 0.75 * s, -zz], s: [0.85 * s, 1.0 * s, 0.85 * s], top: "#3f7d5c" });
      kit.add(GEO.cone6, "#235443", { p: [x, y + 1.25 * s, -zz], s: [0.6 * s, 0.8 * s, 0.6 * s], top: "#4f9069" });
    } else kit.add(GEO.ico, "#2c3650", { p: [x, y, -zz], r: [0, random() * 6, 0], s: [0.5 * s, 0.34 * s, 0.45 * s], top: "#7f8dab" });
  }
  return kit.build();
}

// Деревня: дома с окнами, причалы, створные огни, колокол, гирлянда. Начало координат — вход в гавань.
// Возвращает геометрию и список окон, которые зажигаются по мере прихода лодок.
export function harborGeometry() {
  const kit = new Kit();
  const windows = []; // { x, y, z, rot }
  const house = (x, z, w, d, h, wall, roof, rot = 0) => {
    const y0 = 0.42 + (-z) * 0.07;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    kit.add(GEO.box, wall, { p: [x, y0 + h / 2, -z], r: [0, rot, 0], s: [w, h, d] });
    kit.add(GEO.cone4, roof, { p: [x, y0 + h + 0.26, -z], r: [0, rot + Math.PI / 4, 0], s: [w * 1.55, 0.56, d * 1.55] });
    kit.add(GEO.box, "#6b4426", { p: [x + sn * (d / 2 + 0.01) - cs * w * 0.24, y0 + 0.2, -z + cs * (d / 2 + 0.01) + sn * w * 0.24], r: [0, rot, 0], s: [0.2, 0.4, 0.04] });
    // окна на стороне, обращённой к морю и к зрителю
    const n = w > 1 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? w * 0.18 : (i - 0.2) * w * 0.42;
      windows.push({ x: x + sn * (d / 2 + 0.02) + cs * off, y: y0 + h * 0.62, z: -z + cs * (d / 2 + 0.02) - sn * off, rot });
    }
    kit.add(GEO.box, "#8c5a3a", { p: [x + w * 0.22, y0 + h + 0.42, -z], s: [0.14, 0.34, 0.14] });
  };
  house(-3.3, -2.3, 1.0, 0.9, 0.78, "#f3e6c8", "#c5503f", 0.25);
  house(-2.0, -3.1, 1.25, 1.0, 0.95, "#e9d6b0", "#8a4d86", 0.1);
  house(-0.5, -2.6, 0.95, 0.9, 0.8, "#dfeaf0", "#c5503f", -0.1);
  house(0.9, -3.3, 1.2, 1.0, 1.0, "#f3e6c8", "#3d7a8a", -0.15);
  house(2.3, -2.4, 0.95, 0.85, 0.76, "#f0d9c0", "#c5503f", -0.3);
  house(-4.6, -3.4, 1.0, 0.9, 0.85, "#dfeaf0", "#8a4d86", 0.3);
  // причалы: доски на сваях
  const pier = (x, z0, z1, w) => {
    const len = z1 - z0;
    kit.add(GEO.box, "#b98a55", { p: [x, 0.3, -(z0 + z1) / 2], s: [w, 0.07, len] });
    for (let z = z0 + 0.2; z < z1; z += 0.62) {
      kit.add(GEO.cyl6, "#5d3b22", { p: [x - w / 2 + 0.05, 0.12, -z], s: [0.09, 0.6, 0.09] });
      kit.add(GEO.cyl6, "#5d3b22", { p: [x + w / 2 - 0.05, 0.12, -z], s: [0.09, 0.6, 0.09] });
    }
  };
  pier(1.05, -1.3, 1.0, 0.5);
  pier(-1.15, -1.5, 0.45, 0.46);
  // створные огни у входа: зелёный и красный
  for (const [x, hex] of [[-1.85, "#62ffa0"], [1.85, "#ff6a5c"]]) {
    kit.add(GEO.ico, "#2a3450", { p: [x, 0.05, -0.75], s: [0.5, 0.32, 0.46], top: "#7f8dab" });
    kit.add(GEO.cyl6, "#f1ead9", { p: [x, 0.62, -0.75], s: [0.16, 0.8, 0.16] });
    kit.add(GEO.ball, hex, { p: [x, 1.1, -0.75], s: 0.22, glow: 3.0 });
  }
  // фонарные столбы и гирлянда вдоль большого причала
  const posts = [[1.05, -1.2], [1.05, -0.1], [1.05, 0.95]];
  for (const [x, z] of posts) kit.add(GEO.cyl6, "#3a2a1e", { p: [x + 0.2, 0.75, -z], s: [0.05, 0.9, 0.05] });
  const bulbs = ["#ffd45e", "#ff9ad5", "#9be6ff", "#ffd45e", "#b8ff9a", "#ff8d6b", "#ffd45e", "#9be6ff"];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const z = -1.2 + t * 2.15;
    const sag = Math.sin((t * 2 % 1) * Math.PI) * 0.16;
    kit.add(GEO.ball, bulbs[i % bulbs.length], { p: [1.25, 1.16 - sag, -z], s: 0.085, glow: 3.0 });
  }
  // столб для колокола (сам колокол — отдельная модель, он качается)
  kit.add(GEO.cyl6, "#3a2a1e", { p: [-1.15, 0.72, -0.3], s: [0.07, 0.86, 0.07] });
  kit.add(GEO.box, "#3a2a1e", { p: [-0.98, 1.12, -0.3], s: [0.42, 0.06, 0.06] });
  // лодочки на привязи
  const small = hull(0.9, 0.42, 0.22, { deckDrop: 0.1 });
  const moored = (x, z, rot, hex) => {
    const m = new T.Matrix4().compose(new T.Vector3(x, 0.02, -z), new T.Quaternion().setFromEuler(new T.Euler(0, rot, 0)), new T.Vector3(1, 1, 1));
    const move = (list) => list.map((p) => { const v = new T.Vector3(p[0], p[1], p[2]).applyMatrix4(m); return [v.x, v.y, v.z]; });
    kit.tris(move(small.lower), hex).tris(move(small.band), "#f3e3bd").tris(move(small.deck), "#6b4426");
  };
  moored(0.42, -0.5, 0.3, "#4f9be0");
  moored(-0.55, -1.0, -0.5, "#d8463c");
  // бочки и ящики
  kit.add(GEO.cyl, "#8c5a3a", { p: [1.05, 0.46, 1.05], s: [0.2, 0.26, 0.2] });
  kit.add(GEO.box, "#c79a62", { p: [0.95, 0.44, 0.66], r: [0, 0.4, 0], s: [0.22, 0.2, 0.22] });
  return { geometry: kit.build(), windows };
}

export function bellGeometry() {
  const kit = new Kit();
  kit.add(GEO.cone, "#f2c14a", { p: [0, -0.13, 0], s: [0.3, 0.3, 0.3], top: "#ffe08a" });
  kit.add(GEO.cyl, "#f2c14a", { p: [0, -0.28, 0], s: [0.34, 0.05, 0.34] });
  kit.add(GEO.ball, "#8c5a3a", { p: [0, -0.33, 0], s: 0.08 });
  return kit.build();
}

// ---------- Тень: чернильная клякса ----------
// Тело колышется в шейдере; сверху — два светящихся глаза (отдельные меши, чтобы моргать и таращиться).
export function shadeBodyGeometry() {
  const kit = new Kit();
  const warp = (v) => {
    const a = Math.atan2(v.z, v.x);
    // снизу клякса растекается лапками
    const low = Math.max(0, -v.y + 0.1);
    const k = 1 + low * (0.42 + 0.3 * Math.sin(a * 5)) + 0.07 * Math.sin(a * 3 + v.y * 4);
    v.x *= k;
    v.z *= k;
    v.y = v.y * 0.72 + 0.3;
    if (v.y < 0.02) v.y = 0.02;
  };
  kit.add(GEO.blob, "#2c1456", { top: "#5a2f9c", warp });
  // хохолок
  kit.add(GEO.ball, "#5a2f9c", { p: [0.08, 1.02, 0], s: [0.2, 0.3, 0.2] });
  kit.add(GEO.ball, "#5a2f9c", { p: [0.2, 1.2, 0.02], s: 0.13 });
  return kit.build();
}

export function shadeMaterial() {
  const uniforms = { uTime: { value: 0 }, uPhase: { value: 0 }, uFear: { value: 0 }, uFade: { value: 1 } };
  const material = new T.ShaderMaterial({
    uniforms,
    vertexColors: true,
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float uTime, uPhase, uFear;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vColor = color;
        vec3 p = position;
        float a = atan(p.z, p.x);
        float low = 1.0 - smoothstep(0.0, 0.6, p.y);
        // лапки шевелятся, тело дышит; от страха клякса дрожит
        float wave = sin(a * 5.0 + uTime * 2.3 + uPhase) * 0.10 * low + sin(uTime * 3.1 + p.y * 3.0 + uPhase) * 0.035;
        wave += sin(uTime * 46.0 + a * 9.0) * 0.045 * uFear;
        p.xz *= 1.0 + wave;
        p.y *= 1.0 + sin(uTime * 2.6 + uPhase) * 0.05;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uFear, uFade;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float ndv = max(dot(normalize(vNormal), vView), 0.0);
        float rim = pow(1.0 - ndv, 2.0);
        float top = normalize(vNormal).y * 0.5 + 0.5;
        vec3 col = vColor * (0.55 + 0.75 * top);
        // светящаяся кромка: по ней кляксу видно на тёмной воде
        col += vec3(0.95, 0.30, 1.35) * rim * 1.25;
        // на свету клякса бледнеет
        col = mix(col, vec3(1.25, 0.95, 1.5), uFear * (0.25 + 0.5 * rim));
        gl_FragColor = vec4(col, uFade);
      }
    `,
  });
  return material;
}

export const SHARED = GEO;
