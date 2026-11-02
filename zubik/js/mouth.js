// 3D-клиника «Зубика»: объёмная мордочка зверька с открытым ртом, человеческий зубной ряд из teeth.js,
// налёт, крошки, грязь между зубами, дырочки, сколы, украшения, эффекты и 3D-инструменты у пальца.
// Правила приёма — в game.js.
import * as T from "../vendor/three/three.module.min.js?v=cc1f2089";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=cc1f2089";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=cc1f2089";
import { toothGeometry, enamel, archCurve, layout, gumGeometry, gumMaterial, labial } from "./teeth.js?v=cc1f2089";
import { makeTools, renderIcon } from "./tools.js?v=cc1f2089";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, ...extra });
// Мех: мягкий, с бархатным отливом
const furMat = (extra = {}) =>
  new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.78, sheen: 1, sheenRoughness: 0.55, sheenColor: new T.Color("#ffffff"), ...extra });
const ball = new T.SphereGeometry(1, 32, 22);
function orb(parent, x, y, z, sx, sy, sz, mat) {
  const m = new T.Mesh(ball, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
const tube = (points, r, mat, closed = false) =>
  new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)), closed), Math.max(24, points.length * 12), r, 12, closed), mat);

// Пациенты: мех, мордочка, губы, глаза, носик; girl — реснички
export const patients = [
  { kind: "bear", name: "Мишка Топа", fur: "#c98955", muzzle: "#f6d4a2", lip: "#c4625a", ear: "#e8ae82", nose: "#3b2730", iris: "#7a4a2c" },
  { kind: "fox", name: "Лисичка Ириска", fur: "#f4893f", muzzle: "#fff4e2", lip: "#d06a66", ear: "#3a2a2e", nose: "#2b2030", iris: "#c46a1a", girl: true },
  { kind: "bunny", name: "Зайка Плюша", fur: "#d6c8f0", muzzle: "#fff6f2", lip: "#e07c9a", ear: "#ffb3cb", nose: "#ff7fa0", iris: "#6a4ab0", girl: true },
  { kind: "cat", name: "Котёнок Мурка", fur: "#b4bfd4", muzzle: "#fff9f1", lip: "#d07e8e", ear: "#ffb8c6", nose: "#ff8fa6", iris: "#2f9a5a", girl: true },
  { kind: "pig", name: "Поросёнок Хрюня", fur: "#ffb9c8", muzzle: "#ffcad6", lip: "#e06b8a", ear: "#ff98b0", nose: "#ff8aa6", iris: "#3a7ad8" },
  { kind: "panda", name: "Панда Бусинка", fur: "#fbf8f1", muzzle: "#ffffff", lip: "#d07e8e", ear: "#3b3240", nose: "#2b2030", iris: "#4a3036", girl: true },
];

// Контур открытого ротика: «скруглённый прямоугольник», снизу ниже, чем сверху
const MOUTH = { cy: -0.68, a: 1.95, top: 1.0, bottom: 1.38, n: 2.5 };
function inMouth(x, y) {
  const dy = y - MOUTH.cy,
    b = dy > 0 ? MOUTH.top : MOUTH.bottom;
  return Math.abs(x / MOUTH.a) ** MOUTH.n + Math.abs(dy / b) ** MOUTH.n < 1;
}
// Мордочка — эллипсоид с вырезом рта, голова — эллипсоид позади
const MUZZLE = { c: new T.Vector3(0, -0.72, 1.62), s: new T.Vector3(2.45, 1.95, 1.45) };
const HEAD = { c: new T.Vector3(0, 0.55, -0.35), s: new T.Vector3(3.25, 2.95, 2.75) };
const surfaceZ = (e, x, y) => e.c.z + e.s.z * Math.sqrt(Math.max(0, 1 - ((x - e.c.x) / e.s.x) ** 2 - ((y - e.c.y) / e.s.y) ** 2));

// Эллипсоид с вырезом рта и раскраской по вершинам (paint(x, y, z) → цвет)
function shell(e, paint) {
  const g = new T.SphereGeometry(1, 140, 100);
  g.scale(e.s.x, e.s.y, e.s.z);
  g.translate(e.c.x, e.c.y, e.c.z);
  const p = g.attributes.position;
  const col = [],
    v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = paint(v.x, v.y, v.z);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  const idx = g.index.array,
    keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    let x = 0,
      y = 0,
      z = 0;
    for (let k = 0; k < 3; k++) {
      x += p.getX(idx[i + k]) / 3;
      y += p.getY(idx[i + k]) / 3;
      z += p.getZ(idx[i + k]) / 3;
    }
    // Вырез только в передней половине: задняя смотрит от зрителя и не видна
    if (!(z > e.c.z && inMouth(x, y))) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  // Вершины оставшихся треугольников, попавшие внутрь выреза, сдвигаются точно на его край:
  // край ровный, без зубчиков
  const moved = new Set();
  for (const i of keep) {
    if (moved.has(i)) continue;
    moved.add(i);
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    if (z <= e.c.z || !inMouth(x, y)) continue;
    const dy = y - MOUTH.cy,
      b = dy > 0 ? MOUTH.top : MOUTH.bottom;
    const f = (Math.abs(x / MOUTH.a) ** MOUTH.n + Math.abs(dy / b) ** MOUTH.n) ** (1 / MOUTH.n) || 1e-3;
    const nx = x / f,
      ny = MOUTH.cy + dy / f;
    p.setXYZ(i, nx, ny, surfaceZ(e, nx, ny));
  }
  g.setIndex(keep);
  g.computeVertexNormals();
  return g;
}

// ---------- Крошки, налёт и украшения ----------
const bits = {
  apple: (g) => {
    g.add(new T.Mesh(new RoundedBoxGeometry(0.17, 0.13, 0.12, 3, 0.035), glossy("#fff3d6", { roughness: 0.55, clearcoat: 0.2 })));
    const peel = new T.Mesh(new RoundedBoxGeometry(0.18, 0.04, 0.13, 3, 0.018), glossy("#e8343f"));
    peel.position.y = 0.075;
    g.add(peel);
  },
  leaf: (g) => {
    orb(g, 0, 0, 0, 0.14, 0.03, 0.08, glossy("#3fb84f")).rotation.z = 0.5;
    orb(g, 0, 0.012, 0, 0.12, 0.006, 0.01, glossy("#2a8a3a"));
  },
  candy: (g) => {
    orb(g, 0, 0, 0, 0.085, 0.085, 0.085, glossy("#ff5fa8", { clearcoat: 1, roughness: 0.1 }));
    orb(g, 0.03, 0.035, 0.05, 0.02, 0.02, 0.01, new T.MeshBasicMaterial({ color: "#ffffff" }));
  },
  cookie: (g) => {
    orb(g, 0, 0, 0, 0.11, 0.05, 0.09, glossy("#d8a45a", { roughness: 0.7, clearcoat: 0 }));
    for (let k = 0; k < 3; k++) orb(g, (k - 1) * 0.04, 0.035, (k % 2) * 0.03, 0.018, 0.014, 0.018, glossy("#5a3320"));
  },
  corn: (g) => {
    orb(g, 0, 0, 0, 0.065, 0.06, 0.055, glossy("#ffd23f", { roughness: 0.25 }));
  },
  berry: (g) => {
    orb(g, 0, 0, 0, 0.07, 0.075, 0.07, glossy("#6a2fb8", { roughness: 0.2 }));
    orb(g, 0, 0.07, 0, 0.03, 0.012, 0.03, glossy("#3fb84f"));
  },
};
const BIT_KINDS = Object.keys(bits);
const gemGeo = (() => {
  // Огранка «бриллиант»: площадка, коронка и острый павильон
  const pts = [new T.Vector2(0, -0.1), new T.Vector2(0.11, 0.0), new T.Vector2(0.09, 0.04), new T.Vector2(0.05, 0.058), new T.Vector2(0, 0.058)];
  const g = new T.LatheGeometry(pts, 10);
  g.rotateX(pie / 2);
  return g;
})();
const starGeo = (() => {
  const s = new T.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k * pie) / 5 + pie / 2,
      r = k % 2 ? 0.05 : 0.11;
    k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.014, bevelSegments: 3 });
  g.center();
  return g;
})();
const heartGeo = (() => {
  const s = new T.Shape();
  s.moveTo(0, -0.09);
  s.bezierCurveTo(0.13, 0, 0.1, 0.1, 0, 0.055);
  s.bezierCurveTo(-0.1, 0.1, -0.13, 0, 0, -0.09);
  const g = new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.014, bevelSegments: 3 });
  g.center();
  return g;
})();
const shiny = (color, emissive = 0.18) =>
  new T.MeshPhysicalMaterial({ color, roughness: 0.04, metalness: 0.1, clearcoat: 1, iridescence: 0.7, emissive: color, emissiveIntensity: emissive, flatShading: true });
export const decorations = [
  // Первые четыре открыты сразу, остальные — по одному за каждого пациента
  { id: "diamond", name: "Бриллиант", make: () => new T.Mesh(gemGeo, shiny("#9fdcff", 0.3)) },
  { id: "star", name: "Звёздочка", make: () => new T.Mesh(starGeo, shiny("#ffd23f", 0.35)) },
  { id: "braces", name: "Брекеты", whole: true },
  { id: "heart", name: "Сердечко", make: () => new T.Mesh(heartGeo, shiny("#ff5f8e", 0.3)) },
  { id: "ruby", name: "Рубин", make: () => new T.Mesh(gemGeo, shiny("#ff2d55")) },
  { id: "emerald", name: "Изумруд", make: () => new T.Mesh(gemGeo, shiny("#1fd47a")) },
  { id: "sapphire", name: "Сапфир", make: () => new T.Mesh(gemGeo, shiny("#2f6bff")) },
  { id: "gold", name: "Золотая коронка", tooth: true },
  { id: "glitter", name: "Блёстки", tooth: true },
];

// ---------- Брекеты ----------
// Виды брекетов: у каждого свой замочек, резиночка и проволока
export const braceKinds = [
  { id: "rainbow", name: "Радужные брекеты" },
  { id: "gold", name: "Золотые брекеты" },
  { id: "crystal", name: "Хрустальные брекеты" },
  { id: "hearts", name: "Брекеты-сердечки" },
  { id: "stars", name: "Брекеты-звёздочки" },
  { id: "neon", name: "Светящиеся брекеты" },
];
const RAINBOW = ["#ff4f8e", "#3fd6ff", "#ffd23f", "#7cff8f", "#b47cff"];
const metal = (color, roughness = 0.2) => new T.MeshPhysicalMaterial({ color, metalness: 1, roughness, clearcoat: 0.6 });
// Общие формы замочка: площадка на зубе, четыре «крылышка» по углам, резиночка вокруг них
const BR = {
  pad: new RoundedBoxGeometry(0.13, 0.105, 0.022, 2, 0.008),
  wing: new RoundedBoxGeometry(0.038, 0.032, 0.036, 2, 0.01),
  ring: new T.TorusGeometry(0.05, 0.015, 10, 28),
  glow: new T.PlaneGeometry(0.26, 0.26),
};
const SHARED = [BR.pad, BR.wing, BR.ring, BR.glow];
// Мягкий цветной ореол вокруг светящихся резиночек
let haloTex = null;
function haloMaterial(color) {
  if (!haloTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"),
      gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.5)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    haloTex = new T.CanvasTexture(c);
    haloTex.colorSpace = T.SRGBColorSpace;
  }
  return new T.MeshBasicMaterial({ map: haloTex, color, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
}
// Замочек одного зуба: стоит в начале координат, смотрит в +Z; i — номер зуба (цвет резиночки).
// glow — резиночка и ореол, которые переливаются у светящихся брекетов.
function bracket(kind, i) {
  const g = new T.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (kind === "hearts" || kind === "stars") {
    // Сам замочек — сердечко или звёздочка, проволока проходит сквозь него
    const m = add(kind === "hearts" ? heartGeo : starGeo, kind === "hearts" ? shiny("#ff5f8e", 0.3) : shiny("#ffd23f", 0.35), 0, 0, 0.022);
    m.scale.setScalar(0.66);
    return { group: g, glow: null };
  }
  const body =
    kind === "gold"
      ? metal("#ffc93c", 0.16)
      : kind === "crystal"
        ? new T.MeshPhysicalMaterial({ color: "#eaf8ff", roughness: 0.04, transparent: true, opacity: 0.6, iridescence: 1, iridescenceIOR: 1.5, clearcoat: 1, emissive: "#cfefff", emissiveIntensity: 0.15 })
        : metal("#dfe6ee");
  add(BR.pad, body, 0, 0, 0.011);
  for (const x of [-1, 1]) for (const y of [-1, 1]) add(BR.wing, body, x * 0.036, y * 0.03, 0.04);
  let ring;
  if (kind === "gold") ring = glossy("#fff6ea", { roughness: 0.12, clearcoat: 1, iridescence: 0.9, sheen: 0.6, sheenColor: new T.Color("#ffe6f0") });
  else if (kind === "crystal") ring = glossy("#9fe6ff", { roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.8, iridescence: 1, emissive: "#9fe6ff", emissiveIntensity: 0.3 });
  else if (kind === "neon") ring = glossy("#39ff88", { emissive: "#39ff88", emissiveIntensity: 1.6, roughness: 0.2 });
  else {
    const c = RAINBOW[i % RAINBOW.length];
    ring = glossy(c, { emissive: c, emissiveIntensity: 0.25 });
  }
  add(BR.ring, ring, 0, 0, 0.04);
  if (kind !== "neon") return { group: g, glow: null };
  const halo = add(BR.glow, haloMaterial("#39ff88"), 0, 0, 0.003);
  halo.renderOrder = 1;
  return { group: g, glow: { ring, halo: halo.material } };
}
// Проволока: серебряная, у золотых и звёздочек — золотая, у сердечек — розовая
const wireMaterial = (kind) => metal(kind === "gold" || kind === "stars" ? "#ffd256" : kind === "hearts" ? "#ffb0c8" : "#eef2f6", 0.15);
const PLAQUE = new T.Color("#e9cf73"),
  WHITE = new T.Color("#ffffff"),
  GOLD = new T.Color("#ffc93c");

export class Clinic {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.75;
    this.camera = new T.PerspectiveCamera(40, 1, 0.1, 100);
    this.scene.add(new T.HemisphereLight(0xffffff, 0xffd6e0, 1.15));
    // Лампа доктора сверху-спереди и тёплый свет внутрь ротика
    const lamp = new T.DirectionalLight(0xfff6e6, 2.3);
    lamp.position.set(1.5, 5, 9);
    this.scene.add(lamp);
    const inside = new T.PointLight(0xfff0f0, 9, 6, 1.6);
    inside.position.set(0, -0.6, 4.2);
    this.scene.add(inside);
    this.face = new T.Group();
    this.scene.add(this.face);
    this.fx = new T.Group();
    this.scene.add(this.fx);
    this.tweens = [];
    this.makeParticles();
    // Инструменты рисуются отдельной сценой поверх ротика
    this.toolScene = new T.Scene();
    this.toolScene.environment = this.env;
    this.toolScene.add(new T.HemisphereLight(0xffffff, 0xffe0ea, 1.3));
    const tl = new T.DirectionalLight(0xffffff, 2);
    tl.position.set(2, 4, 6);
    this.toolScene.add(tl);
    this.tools = makeTools();
    for (const t of Object.values(this.tools)) {
      t.group.visible = false;
      this.toolScene.add(t.group);
    }
    this.held = null;
    this.look = new T.Vector3(0, -0.15, 2);
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.resize = () => {
      const w = this.canvas.clientWidth,
        h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      const aspect = w / h;
      // Ротик почти во всю ширину, сверху глаза; на телефоне стоя — крупнее, лёжа — только ротик
      const needW = aspect < 0.7 ? 4.5 : 5.4,
        needH = aspect > 1.8 ? 4.6 : 5.9;
      this.look.y = aspect > 1.8 ? -0.6 : -0.15;
      const dist = 10;
      this.dist = dist;
      this.camera.fov = T.MathUtils.radToDeg(Math.max(2 * Math.atan(needW / aspect / 2 / dist), 2 * Math.atan(needH / 2 / dist)));
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    this.last = 0;
    this.renderer.setAnimationLoop((ms) => this.render(ms));
  }
  now() {
    return performance.now() / 1000;
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.now(), dur: this.motion.matches ? seconds * 0.4 : seconds, update, done }));
  }
  // ---------- Пациент ----------
  clear() {
    this.braces(false);
    this.face.traverse((o) => {
      if (o.geometry && ![ball, gemGeo, starGeo, heartGeo].includes(o.geometry)) o.geometry.dispose();
    });
    this.face.clear();
    this.fx.clear();
    this.fx.add(this.sparks, this.foamMesh, this.drops);
    this.foam = [];
    this.mood = 0;
  }
  // index — какой зверёк, level — сколько пациентов уже вылечено (чем больше, тем больше дел)
  build(index, level) {
    this.clear();
    const pt = patients[index];
    this.pt = pt;
    this.makeFace(pt);
    this.teeth = [];
    // Верхняя челюсть чуть ниже губы, чтобы была видна линия десны; нижняя чуть позади верхней
    this.arch("up", -0.6, 2.6, 0.48, 0.24);
    this.arch("down", -1.0, 2.48, 0.54, -0.28);
    this.face.updateMatrixWorld(true);
    this.problems(level * 7919 + index * 31 + 7, level);
  }
  makeFace(pt) {
    const F = this.face;
    const fur = new T.Color(pt.fur),
      muzzle = new T.Color(pt.muzzle),
      dark = new T.Color("#3b3240"),
      white = new T.Color("#fffaf2");
    const eyeL = new T.Vector2(-1.08, 1.55),
      eyeR = new T.Vector2(1.08, 1.55);
    // Окраска головы: у панды пятна вокруг глаз, у лисички белые щёчки
    const paintHead = (x, y) => {
      const c = fur.clone();
      if (pt.kind === "panda")
        for (const e of [eyeL, eyeR]) {
          const a = 0.5 * Math.sign(e.x),
            dx = (x - e.x) * Math.cos(a) + (y - e.y + 0.1) * Math.sin(a),
            dy = -(x - e.x) * Math.sin(a) + (y - e.y + 0.1) * Math.cos(a);
          if ((dx / 0.62) ** 2 + (dy / 0.78) ** 2 < 1) c.copy(dark);
        }
      if (pt.kind === "fox" && y < 0.6 && Math.abs(x) > 1.2) c.copy(white);
      return c;
    };
    F.add(new T.Mesh(shell(HEAD, paintHead), furMat()));
    F.add(new T.Mesh(shell(MUZZLE, () => muzzle.clone()), furMat({ roughness: 0.7 })));
    // Ротик изнутри: глубокий розовый, к горлу темнее
    const sack = new T.SphereGeometry(1, 64, 48);
    sack.scale(2.25, 1.75, 1.95);
    sack.translate(0, -0.72, 0.85);
    const sp = sack.attributes.position,
      sc = [],
      cc = new T.Color();
    for (let i = 0; i < sp.count; i++) {
      cc.set("#d0466f").lerp(new T.Color("#4a0f26"), clamp((1.6 - sp.getZ(i)) / 2.6, 0, 1));
      sc.push(cc.r, cc.g, cc.b);
    }
    sack.setAttribute("color", new T.Float32BufferAttribute(sc, 3));
    F.add(new T.Mesh(sack, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: T.BackSide })));
    // Язычок с бороздкой посередине
    const tongue = new T.SphereGeometry(1, 64, 40);
    const tp = tongue.attributes.position,
      tc = [];
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i),
        y = tp.getY(i),
        z = tp.getZ(i);
      if (y > 0) tp.setY(i, y - 0.25 * Math.exp(-(x * x) / 0.02));
      cc.set("#ff7f9e").lerp(new T.Color("#ffa3b8"), clamp(z, 0, 1) * 0.6);
      tc.push(cc.r, cc.g, cc.b);
    }
    tongue.setAttribute("color", new T.Float32BufferAttribute(tc, 3));
    tongue.computeVertexNormals();
    this.tongue = new T.Mesh(tongue, new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, sheen: 0.6, sheenColor: new T.Color("#ffd0dc") }));
    this.tongue.scale.set(1.3, 0.36, 1.05);
    this.tongue.position.set(0, -1.62, 1.45);
    F.add(this.tongue);
    // Губы по краю выреза
    const rim = [];
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * 2 * pie,
        co = Math.cos(a),
        si = Math.sin(a);
      const x = MOUTH.a * Math.sign(co) * Math.abs(co) ** (2 / MOUTH.n);
      const y = MOUTH.cy + (si > 0 ? MOUTH.top : MOUTH.bottom) * Math.sign(si) * Math.abs(si) ** (2 / MOUTH.n);
      rim.push([x, y, surfaceZ(MUZZLE, x, y) - 0.02]);
    }
    F.add(tube(rim, 0.13, glossy(pt.lip, { roughness: 0.32, clearcoat: 1, sheen: 0.5, sheenColor: new T.Color("#ffd0d8") }), true));
    // Носик
    const nz = surfaceZ(MUZZLE, 0, 0.8);
    if (pt.kind === "pig") {
      const snout = new T.Mesh(new T.CylinderGeometry(0.62, 0.66, 0.36, 48), glossy(pt.nose, { roughness: 0.45 }));
      snout.rotation.x = pie / 2;
      snout.position.set(0, 0.86, nz + 0.05);
      F.add(snout);
      for (const s of [-1, 1]) orb(F, s * 0.2, 0.86, nz + 0.23, 0.09, 0.15, 0.03, glossy("#c4506e"));
    } else {
      const big = pt.kind === "bear" || pt.kind === "panda" || pt.kind === "fox";
      orb(F, 0, 0.82, nz + 0.05, big ? 0.42 : 0.24, big ? 0.3 : 0.18, big ? 0.28 : 0.16, glossy(pt.nose, { roughness: 0.15, clearcoat: 1 }));
      orb(F, -0.1, 0.92, nz + (big ? 0.3 : 0.2), big ? 0.1 : 0.06, 0.05, 0.03, new T.MeshBasicMaterial({ color: "#ffffff" }));
      // Желобок от носика к губе
      F.add(tube([[0, 0.55, surfaceZ(MUZZLE, 0, 0.55)], [0, 0.4, surfaceZ(MUZZLE, 0, 0.4) + 0.01]], 0.025, glossy(pt.lip)));
    }
    this.eyes = [];
    for (const s of [-1, 1]) this.eye(F, pt, s, s < 0 ? eyeL : eyeR);
    this.ears(F, pt);
    // Румянец и усики
    for (const s of [-1, 1]) {
      const bz = surfaceZ(HEAD, s * 2.05, 0.75);
      const blush = orb(F, s * 2.05, 0.75, bz + 0.02, 0.48, 0.28, 0.1, new T.MeshBasicMaterial({ color: "#ff8fab", transparent: true, opacity: 0.45, depthWrite: false }));
      blush.rotation.y = s * 0.55;
      if (["cat", "fox", "bunny"].includes(pt.kind))
        for (let k = 0; k < 3; k++) {
          const y0 = 0.35 - k * 0.16,
            x0 = s * 1.7,
            z0 = surfaceZ(MUZZLE, x0, y0);
          F.add(tube([[x0, y0, z0], [x0 + s * 0.6, y0 + 0.06 - k * 0.06, z0 + 0.1], [x0 + s * 1.25, y0 + 0.02 - k * 0.12, z0 - 0.05]], 0.012, glossy("#ffffff", { roughness: 0.4 })));
        }
    }
    // Подголовник кресла и салфетка доктора
    const rest = new T.Mesh(new RoundedBoxGeometry(8.5, 5.2, 0.7, 6, 0.6), glossy("#5fcfc2", { roughness: 0.45, clearcoat: 0.4 }));
    rest.position.set(0, 2.6, -3.5);
    F.add(rest);
    const bib = orb(F, 0, -3.7, 0.4, 3.4, 1.15, 1.9, glossy("#8fd8ff", { roughness: 0.6, clearcoat: 0.2 }));
    bib.rotation.x = -0.25;
    for (const s of [-1, 1]) orb(F, s * 1.8, -2.95, 1.2, 0.16, 0.16, 0.1, glossy("#ffd23f", { metalness: 0.6 }));
  }
  eye(F, pt, s, at) {
    const z = surfaceZ(HEAD, at.x, at.y);
    const eye = new T.Group();
    eye.position.set(at.x, at.y, z - 0.08);
    eye.rotation.y = s * 0.28;
    // Белок, радужка, зрачок, два блика
    orb(eye, 0, 0, 0, 0.42, 0.5, 0.3, glossy("#ffffff", { roughness: 0.12, clearcoat: 1 }));
    orb(eye, 0, -0.02, 0.2, 0.33, 0.4, 0.13, glossy(pt.iris, { roughness: 0.15, clearcoat: 1 }));
    orb(eye, 0, -0.03, 0.27, 0.2, 0.26, 0.08, glossy("#1d1420", { roughness: 0.1, clearcoat: 1 }));
    orb(eye, -0.11, 0.13, 0.33, 0.1, 0.12, 0.04, new T.MeshBasicMaterial({ color: "#ffffff" }));
    orb(eye, 0.1, -0.13, 0.32, 0.05, 0.05, 0.03, new T.MeshBasicMaterial({ color: "#ffffff" }));
    eye.userData.open = [...eye.children];
    // Бровка и реснички
    const brow = pt.kind === "panda" ? "#2b2030" : new T.Color(pt.fur).multiplyScalar(0.55).getStyle();
    eye.add(tube([[-0.3, 0.62, 0.2], [0, 0.72, 0.28], [0.3, 0.62, 0.2]], 0.035, glossy(brow, { roughness: 0.6 })));
    if (pt.girl)
      for (let k = 0; k < 3; k++) {
        const a = 0.35 + k * 0.32;
        const lash = tube([[s * Math.cos(a) * 0.4, Math.sin(a) * 0.48, 0.18], [s * Math.cos(a) * 0.56, Math.sin(a) * 0.63, 0.15]], 0.018, glossy("#1d1420"));
        eye.add(lash);
      }
    // Счастливые глаза-дуги для финала
    const happy = new T.Mesh(new T.TorusGeometry(0.3, 0.07, 10, 28, pie), glossy("#2b2030"));
    happy.position.set(0, -0.05, 0.25);
    happy.visible = false;
    eye.add(happy);
    eye.userData.happy = happy;
    F.add(eye);
    this.eyes.push(eye);
  }
  ears(F, pt) {
    const fur = glossy(pt.fur, { roughness: 0.75, clearcoat: 0, sheen: 1, sheenColor: new T.Color("#ffffff") }),
      ear = glossy(pt.ear, { roughness: 0.6, clearcoat: 0, sheen: 0.6 });
    this.earList = [];
    for (const s of [-1, 1]) {
      const g = new T.Group();
      F.add(g);
      this.earList.push(g);
      if (pt.kind === "bunny") {
        g.position.set(s * 1.25, 3.0, -0.2);
        g.rotation.z = -s * 0.18;
        orb(g, 0, 1.3, 0, 0.55, 1.6, 0.38, fur);
        orb(g, 0, 1.3, 0.28, 0.32, 1.25, 0.12, ear);
      } else if (pt.kind === "fox" || pt.kind === "cat") {
        const big = pt.kind === "fox";
        g.position.set(s * (big ? 2.05 : 1.95), big ? 2.9 : 2.85, -0.35);
        g.rotation.z = -s * 0.38;
        const outer = new T.Mesh(new T.ConeGeometry(big ? 0.85 : 0.7, big ? 1.7 : 1.2, 4, 1), fur);
        outer.position.y = big ? 0.75 : 0.5;
        outer.rotation.y = pie / 4;
        outer.scale.z = 0.55;
        g.add(outer);
        const inner = new T.Mesh(new T.ConeGeometry(big ? 0.55 : 0.45, big ? 1.2 : 0.85, 4, 1), glossy(big ? "#fff4e2" : pt.ear, { roughness: 0.7, clearcoat: 0 }));
        inner.position.set(0, big ? 0.62 : 0.42, 0.22);
        inner.rotation.y = pie / 4;
        inner.scale.z = 0.3;
        g.add(inner);
        if (big) {
          const tip = new T.Mesh(new T.ConeGeometry(0.3, 0.5, 4, 1), glossy("#3a2a2e", { roughness: 0.7, clearcoat: 0 }));
          tip.position.y = 1.36;
          tip.rotation.y = pie / 4;
          tip.scale.z = 0.55;
          g.add(tip);
        }
      } else if (pt.kind === "pig") {
        g.position.set(s * 2.2, 2.55, 0.2);
        g.rotation.set(0.9, 0, -s * 0.7);
        const flap = new T.Mesh(new T.ConeGeometry(0.62, 1.0, 4, 1), ear);
        flap.rotation.y = pie / 4;
        flap.scale.z = 0.35;
        g.add(flap);
      } else {
        g.position.set(s * 2.25, 2.75, -0.5);
        orb(g, 0, 0, 0, 0.82, 0.82, 0.5, pt.kind === "panda" ? glossy("#3b3240", { roughness: 0.8, clearcoat: 0, sheen: 1 }) : fur);
        orb(g, 0, -0.04, 0.32, 0.5, 0.5, 0.18, pt.kind === "panda" ? glossy("#4a3f50", { roughness: 0.8, clearcoat: 0 }) : ear);
      }
    }
  }
  // ---------- Челюсть: 14 зубов вплотную по дуге и десна с фестонами ----------
  arch(side, y, z, k, tilt) {
    const group = new T.Group();
    group.position.set(0, y, z);
    group.rotation.x = tilt;
    this.face.add(group);
    const curve = archCurve(k),
      slots = layout(side),
      sign = side === "up" ? 1 : -1;
    for (const sl of slots) {
      const { p, n } = curve(sl.s);
      const [w, h, d] = sl.dims;
      const pivot = new T.Group();
      // Лицевой стороной на дугу: центр зуба внутри дуги на половину толщины
      pivot.position.copy(p).addScaledVector(n, -d / 2);
      pivot.rotation.y = Math.atan2(n.x, n.z);
      group.add(pivot);
      const holder = new T.Group();
      if (side === "down") holder.rotation.z = pie;
      holder.position.y = sign * (h / 2);
      // Резцы чуть наклонены вперёд, как у людей
      if (sl.type === "central" || sl.type === "lateral") holder.rotation.x = -0.1;
      pivot.add(holder);
      const mat = enamel();
      const mesh = new T.Mesh(toothGeometry(sl.type, sl.dims), mat);
      holder.add(mesh);
      const tooth = { side, type: sl.type, dims: sl.dims, w, h, d, pivot, holder, mesh, mat, plaque: 0, blobs: [], cavity: null, chip: null, deco: null, gold: false, glitter: null };
      tooth.local = (t, xf = 0, out = 0) => labial(sl.type, sl.dims, t, xf).add(new T.Vector3(0, 0, out));
      tooth.anchor = () => holder.localToWorld(tooth.local(0.42, 0, 0.03));
      this.teeth.push(tooth);
    }
    group.add(new T.Mesh(gumGeometry(curve, slots, sign), gumMaterial()));
    group.add(new T.Mesh(gumGeometry(curve, slots, sign, true), gumMaterial()));
    this[side] = group;
  }
  // ---------- Проблемы пациента ----------
  problems(seed, lvl) {
    const r = rng(seed);
    const pick = (n, filter) => {
      const pool = this.teeth.filter(filter);
      const out = [];
      while (out.length < Math.min(n, pool.length)) {
        const t = pool[Math.floor(r() * pool.length)];
        if (!out.includes(t)) out.push(t);
      }
      return out;
    };
    const film = new T.MeshPhysicalMaterial({ color: "#e6c457", roughness: 0.65, sheen: 0.6, sheenColor: new T.Color("#fff0b0"), transparent: true, opacity: 0.92 });
    // Налёт: жёлтые пятнышки у десны и желтоватая эмаль
    for (const t of pick(10 + Math.min(lvl, 8), (t) => t.type !== "molar")) {
      t.plaque = 0.6 + r() * 0.4;
      for (let k = 0; k < 4; k++) {
        const p = t.local(0.58 + r() * 0.24, (r() - 0.5) * 0.7, -0.008);
        const b = orb(t.holder, p.x, p.y, p.z, 0.05 + r() * 0.035, 0.035 + r() * 0.025, 0.022, film);
        b.userData.base = b.scale.clone();
        t.blobs.push(b);
      }
    }
    // Крошки на зубах
    this.crumbs = pick(3 + Math.min(lvl, 3), (t) => t.type !== "molar").map((t) => {
      const g = new T.Group();
      bits[BIT_KINDS[Math.floor(r() * BIT_KINDS.length)]](g);
      g.position.copy(t.local(0.18 + r() * 0.2, (r() - 0.5) * 0.4, 0.06));
      g.rotation.set(r() * 3, r() * 3, r() * 3);
      t.holder.add(g);
      return { tooth: t, mesh: g, done: false, pos: () => g.getWorldPosition(new T.Vector3()) };
    });
    // Грязь между соседними зубами у десны
    this.gaps = [];
    const pairs = [];
    for (let i = 0; i < this.teeth.length - 1; i++) if (this.teeth[i].side === this.teeth[i + 1].side && this.teeth[i].type !== "molar" && this.teeth[i + 1].type !== "molar") pairs.push(i);
    const used = new Set();
    for (let n = 0; n < Math.min(2 + Math.min(lvl, 3), pairs.length); n++) {
      let i;
      do i = pairs[Math.floor(r() * pairs.length)];
      while (used.has(i));
      used.add(i);
      const a = this.teeth[i],
        b = this.teeth[i + 1];
      const pa = a.holder.localToWorld(a.local(0.5, 0.5, 0)),
        pb = b.holder.localToWorld(b.local(0.5, -0.5, 0));
      const mid = pa.add(pb).multiplyScalar(0.5);
      const gunk = new T.Group();
      gunk.position.copy(this.face.worldToLocal(mid));
      const brown = glossy("#8a5a2a", { roughness: 0.75, clearcoat: 0 });
      for (let k = 0; k < 3; k++) orb(gunk, (r() - 0.5) * 0.03, (k - 1) * 0.06, 0.03, 0.05, 0.065, 0.045, brown);
      this.face.add(gunk);
      this.gaps.push({ a, b, mesh: gunk, done: false, rubs: 0, pos: () => gunk.getWorldPosition(new T.Vector3()) });
    }
    // Дырочки: тёмное пятнышко на лицевой стороне
    for (const t of pick(Math.min(1 + Math.floor(lvl / 2), 3), (t) => t.type !== "central" && t.type !== "molar")) {
      const p = t.local(0.42, 0.12, 0.004);
      const dark = glossy("#4a3024", { roughness: 0.8, clearcoat: 0 });
      const spot = orb(t.holder, p.x, p.y, p.z, 0.075, 0.07, 0.02, dark);
      orb(spot, 0.6, -0.4, 0.3, 0.55, 0.5, 0.6, dark);
      t.cavity = { state: "dirty", mesh: spot, progress: 0, tooth: t, pos: () => spot.getWorldPosition(new T.Vector3()) };
    }
    // Отбитый уголок резца — со второго пациента
    const chips = lvl >= 1 ? Math.min(1 + Math.floor((lvl - 1) / 2), 2) : 0;
    for (const t of pick(chips, (t) => (t.type === "central" || t.type === "lateral") && !t.cavity)) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = toothGeometry(t.type, t.dims, { chipped: true });
      const frag = new T.Mesh(
        toothGeometry(t.type, t.dims, { part: true }),
        new T.MeshPhysicalMaterial({ color: "#8fe8ff", transparent: true, opacity: 0.8, roughness: 0.08, clearcoat: 1, emissive: "#4fd8ff", emissiveIntensity: 0.45 }),
      );
      frag.visible = false;
      // Кусочек растёт из своего места
      const grower = new T.Group();
      grower.position.set(t.w * 0.3, -t.h * 0.33, 0);
      frag.position.set(-t.w * 0.3, t.h * 0.33, 0);
      grower.scale.setScalar(0.001);
      grower.add(frag);
      t.holder.add(grower);
      t.chip = { state: "broken", frag, grower, progress: 0, tooth: t, pos: () => t.holder.localToWorld(t.local(0.18, 0.3, 0)) };
    }
    this.refreshTeeth();
  }
  refreshTeeth() {
    for (const t of this.teeth) {
      if (t.gold) continue;
      t.mat.color.copy(WHITE).lerp(PLAQUE, t.plaque * 0.5);
      t.mat.roughness = 0.13 + t.plaque * 0.4;
      for (const b of t.blobs) {
        b.scale.copy(b.userData.base).multiplyScalar(0.35 + 0.65 * t.plaque);
        b.visible = t.plaque > 0.04;
      }
    }
  }
  // ---------- Экран ----------
  screenPoint(v) {
    const p = v.clone().project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  // Ближайшая цель к точке на экране в пределах радиуса: щедро для маленьких пальцев
  nearest(list, x, y, radius) {
    let best = null,
      gap = radius;
    for (const item of list) {
      const s = this.screenPoint(item.pos());
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < gap) {
        gap = d;
        best = item;
      }
    }
    return best;
  }
  toothTargets() {
    return this.teeth.map((t) => ({ tooth: t, pos: t.anchor }));
  }
  pixelRadius(world = 0.25) {
    const a = this.screenPoint(new T.Vector3(0, -0.6, 2.6)),
      b = this.screenPoint(new T.Vector3(world, -0.6, 2.6));
    return Math.abs(b.x - a.x);
  }
  // Точка в глубине ротика под пальцем (на плоскости передних зубов)
  worldAt(x, y, z = 2.75) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector3(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const k = (z - this.camera.position.z) / dir.z;
    return this.camera.position.clone().addScaledVector(dir, k);
  }
  // ---------- Инструмент в руке ----------
  // name — инструмент или украшение (или null), x/y — где на экране его кончик, active — палец прижат
  pointer(name, x, y, active) {
    for (const [id, t] of Object.entries(this.tools)) t.group.visible = id === name;
    if (this.held && this.held.userData.id !== name) {
      this.held.removeFromParent();
      this.held = null;
    }
    const deco = decorations.find((d) => d.id === name);
    if (deco && deco.make && !this.held) {
      this.held = deco.make();
      this.held.userData.id = name;
      this.held.scale.setScalar(2.2);
      this.toolScene.add(this.held);
    }
    this.active = active;
    if (!name) return;
    const at = this.worldAt(x, y, 2.75).add(new T.Vector3(0, 0, 0.25));
    const tool = this.tools[name];
    if (tool) {
      // Ручка к зрителю и вправо-вниз, как в правой руке; рабочая сторона — в ротик
      const Y = new T.Vector3(0.5, -0.62, 0.6).normalize(),
        // Рабочая сторона смотрит в ротик и чуть вбок: видно щетину, бор и луч
        toCam = new T.Vector3(-0.85, 0.25, 1).normalize(),
        Z = toCam.sub(Y.clone().multiplyScalar(toCam.dot(Y))).normalize(),
        X = new T.Vector3().crossVectors(Y, Z);
      tool.group.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z));
      tool.group.position.copy(at);
    }
    if (this.held) this.held.position.copy(at);
  }
  hidePointer() {
    this.pointer(null, 0, 0, false);
  }
  // Крупный замочек с кусочком проволоки на зубике для кнопки
  braceIcon(g, front, kind) {
    const { group } = bracket(kind, 0);
    group.scale.setScalar(2.8);
    group.position.copy(front);
    g.add(group);
    const z = front.z + 0.042 * 2.8;
    g.add(tube([[-0.32, front.y, z - 0.06], [0, front.y, z], [0.32, front.y, z - 0.06]], 0.026, wireMaterial(kind)));
    // Кадр — по самому замочку (площадка или фигурка), без ореола
    return group.children[0];
  }
  // Картинки для кнопок: 3D-инструменты и зубик с украшением
  icons() {
    const out = {};
    const fresh = makeTools();
    for (const [id, t] of Object.entries(fresh)) out[id] = renderIcon(this.renderer, this.env, t.group, { angle: [0.15, 0.6, -0.65] });
    for (const d of decorations) {
      const g = new T.Group();
      const mat = enamel();
      if (d.id === "gold") {
        mat.vertexColors = false;
        mat.color.copy(GOLD);
        mat.metalness = 1;
        mat.roughness = 0.2;
      }
      g.add(new T.Mesh(toothGeometry("central", [0.5, 0.74, 0.26]), mat));
      const front = labial("central", [0.5, 0.74, 0.26], 0.45);
      // Камни и замочек — крупным планом, коронка и блёстки — весь зубик
      let frame = null,
        zoom = 1;
      if (d.make) {
        const m = d.make();
        m.position.copy(front).add(new T.Vector3(0, 0, 0.04));
        m.scale.setScalar(1.6);
        g.add(m);
        frame = m;
        zoom = 0.62;
      } else if (d.id === "glitter")
        for (let k = 0; k < 10; k++) {
          const s = new T.Mesh(new T.OctahedronGeometry(0.03, 0), new T.MeshBasicMaterial({ color: ["#ffffff", "#ffe14d", "#ff9fd0", "#7fe8ff"][k % 4] }));
          s.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.45, 0.2);
          g.add(s);
        }
      else if (d.id === "braces") {
        frame = this.braceIcon(g, front, "rainbow");
        zoom = 0.62;
      }
      out[d.id] = renderIcon(this.renderer, this.env, g, { angle: frame ? [0.12, -0.3, 0] : [0.1, -0.35, 0], frame, zoom });
    }
    for (const k of braceKinds) {
      const g = new T.Group();
      g.add(new T.Mesh(toothGeometry("central", [0.5, 0.74, 0.26]), enamel()));
      const br = this.braceIcon(g, labial("central", [0.5, 0.74, 0.26], 0.45), k.id);
      // Крупный план замочка: вокруг видно зубик и проволоку
      out["braces-" + k.id] = renderIcon(this.renderer, this.env, g, { angle: [0.12, -0.3, 0], frame: br, zoom: 0.62 });
    }
    return out;
  }
  // ---------- Частицы: искры, пена, капли ----------
  makeParticles() {
    const n = 240;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.05, 0), new T.MeshBasicMaterial({ color: "#ffffff" }), n);
    this.sparkPool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
    const colors = ["#ffffff", "#ffe14d", "#7fe8ff", "#ff9fd0", "#b99bff"];
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color(colors[i % colors.length]));
    this.sparks.frustumCulled = false;
    this.sparkNext = 0;
    this.foamMesh = new T.InstancedMesh(
      new T.SphereGeometry(0.065, 14, 10),
      new T.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.1, transparent: true, opacity: 0.88, iridescence: 0.7, clearcoat: 1 }),
      300,
    );
    this.foamMesh.frustumCulled = false;
    this.foamMesh.count = 0;
    this.foam = [];
    this.drops = new T.InstancedMesh(new T.SphereGeometry(0.035, 8, 6), new T.MeshPhysicalMaterial({ color: "#9fe6ff", roughness: 0.05, transparent: true, opacity: 0.8 }), 160);
    this.drops.frustumCulled = false;
    this.dropPool = Array.from({ length: 160 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0 }));
    this.dropNext = 0;
    this.fx.add(this.sparks, this.foamMesh, this.drops);
    this.dummy = new T.Object3D();
  }
  burst(at, count = 14, speed = 1.6) {
    for (let k = 0; k < count; k++) {
      const s = this.sparkPool[this.sparkNext];
      this.sparkNext = (this.sparkNext + 1) % this.sparkPool.length;
      s.p.copy(at);
      s.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() * 0.6).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.life = s.max = 0.5 + Math.random() * 0.5;
    }
  }
  addFoam(at) {
    if (this.foam.length >= 300) return;
    this.foam.push({ p: at.clone().add(new T.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.14, 0.05 + Math.random() * 0.06)), s: 0.6 + Math.random() * 0.9, born: this.now() });
  }
  rinse(x, y, radius) {
    let n = 0;
    this.foam = this.foam.filter((f) => {
      const s = this.screenPoint(f.p);
      if (Math.hypot(s.x - x, s.y - y) < radius) {
        n++;
        return false;
      }
      return true;
    });
    return n;
  }
  spray(at) {
    for (let k = 0; k < 3; k++) {
      const d = this.dropPool[this.dropNext];
      this.dropNext = (this.dropNext + 1) % this.dropPool.length;
      d.p.copy(at).add(new T.Vector3(0, 0, 0.3));
      d.v.set((Math.random() - 0.5) * 1.2, -0.3 - Math.random(), -1.2 - Math.random());
      d.life = 0.5;
    }
  }
  glowAt(at, on) {
    if (!this.glow) {
      this.glow = new T.Mesh(new T.CircleGeometry(0.3, 32), new T.MeshBasicMaterial({ color: "#7fe0ff", transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
      this.scene.add(this.glow);
    }
    this.glow.visible = on;
    if (on) this.glow.position.copy(at).add(new T.Vector3(0, 0, 0.08));
  }
  // ---------- Действия ----------
  pluck(crumb, to) {
    crumb.done = true;
    const g = crumb.mesh,
      from = g.getWorldPosition(new T.Vector3());
    this.scene.attach(g);
    return this.tween(0.55, (p) => {
      g.position.lerpVectors(from, to, p).add(new T.Vector3(0, Math.sin(p * pie) * 1.2, 0));
      g.rotation.y += 0.2;
      g.scale.setScalar(1 + Math.sin(p * pie) * 0.6);
      if (p === 1) g.removeFromParent();
    });
  }
  brush(tooth, amount) {
    if (tooth.plaque <= 0) return false;
    tooth.plaque = Math.max(0, tooth.plaque - amount);
    this.refreshTeeth();
    if (Math.random() < 0.6) this.addFoam(tooth.anchor());
    if (tooth.plaque === 0) this.burst(tooth.anchor(), 10, 1.2);
    return true;
  }
  floss(gap) {
    gap.rubs++;
    gap.mesh.rotation.z = Math.sin(gap.rubs) * 0.4;
    gap.mesh.scale.setScalar(Math.max(0.05, 1 - gap.rubs / 6));
    if (gap.rubs >= 6 && !gap.done) {
      gap.done = true;
      gap.mesh.visible = false;
      this.burst(gap.pos(), 12, 1.2);
      return true;
    }
    return false;
  }
  drill(c, dt) {
    c.progress = Math.min(1, c.progress + dt / 1.3);
    // Тёмное пятнышко светлеет до серой ямки
    c.mesh.material.color.set("#4a3024").lerp(new T.Color("#a8aeb6"), c.progress);
    if (Math.random() < 0.5) this.burst(c.pos(), 1, 0.8);
    if (c.progress === 1) {
      c.state = "clean";
      c.progress = 0;
      return true;
    }
    return false;
  }
  fill(c) {
    c.state = "soft";
    const soft = new T.MeshPhysicalMaterial({ color: "#bdf0ff", roughness: 0.08, clearcoat: 1, emissive: "#6fd8ff", emissiveIntensity: 0.4 });
    c.mesh.material = soft;
    c.mesh.children.forEach((m) => (m.material = soft));
    c.mesh.scale.multiplyScalar(1.25);
    this.burst(c.pos(), 8, 0.8);
  }
  harden(item, dt) {
    item.progress = Math.min(1, item.progress + dt / 1.1);
    if (item.progress === 1) {
      item.state = "done";
      if (item.frag) item.frag.material = item.tooth.mat;
      else {
        // Пломба цвета зуба, почти незаметная
        const m = new T.MeshPhysicalMaterial({ color: "#fffaf1", roughness: 0.13, clearcoat: 1 });
        item.mesh.material = m;
        item.mesh.children.forEach((c) => (c.material = m));
        item.mesh.scale.z = 0.008;
      }
      this.burst(item.pos(), 20, 1.6);
      return true;
    }
    return false;
  }
  grow(chip, dt) {
    chip.frag.visible = true;
    chip.progress = Math.min(1, chip.progress + dt / 1.2);
    chip.grower.scale.setScalar(Math.max(0.001, chip.progress));
    if (chip.progress === 1) {
      chip.state = "soft";
      chip.progress = 0;
      this.burst(chip.pos(), 8, 1);
      return true;
    }
    return false;
  }
  // ---------- Украшения ----------
  decorate(tooth, id) {
    const deco = decorations.find((d) => d.id === id);
    const same = (tooth.deco && tooth.deco.id === id) || (id === "gold" && tooth.gold) || (id === "glitter" && tooth.glitter);
    if (tooth.deco) {
      tooth.deco.mesh.removeFromParent();
      tooth.deco = null;
    }
    if (id === "gold") {
      tooth.gold = !same;
      tooth.mat.vertexColors = !tooth.gold;
      tooth.mat.color.copy(tooth.gold ? GOLD : WHITE);
      tooth.mat.metalness = tooth.gold ? 1 : 0;
      tooth.mat.roughness = tooth.gold ? 0.18 : 0.13;
      tooth.mat.needsUpdate = true;
    } else if (id === "glitter") {
      if (tooth.glitter) {
        tooth.glitter.removeFromParent();
        tooth.glitter = null;
      } else {
        const g = new T.Group();
        for (let k = 0; k < 10; k++) {
          const s = new T.Mesh(new T.OctahedronGeometry(0.02, 0), new T.MeshBasicMaterial({ color: ["#ffffff", "#ffe14d", "#ff9fd0", "#7fe8ff"][k % 4] }));
          s.position.copy(tooth.local(0.15 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.02));
          g.add(s);
        }
        tooth.holder.add(g);
        tooth.glitter = g;
      }
    } else if (!same) {
      const m = deco.make();
      m.position.copy(tooth.local(0.42, 0, 0.045));
      if (tooth.side === "down") m.rotation.z = pie;
      const size = 1.6 * Math.min(1, tooth.w / 0.34);
      tooth.holder.add(m);
      tooth.deco = { id, mesh: m };
      this.tween(0.35, (p) => m.scale.setScalar(size * (p < 0.7 ? (p / 0.7) * 1.3 : 1.3 - ((p - 0.7) / 0.3) * 0.3)));
    }
    this.burst(tooth.anchor(), 14, 1.4);
    return !same;
  }
  // Брекеты на передних зубах обеих челюстей: замочки, резиночки и проволока.
  // kind — вид из braceKinds, null — снять. Замочки выскакивают по очереди, проволока протягивается.
  braces(kind) {
    if (this.bracesGroup)
      for (const o of this.bracesGroup) {
        o.removeFromParent();
        o.traverse((m) => {
          if (!m.isMesh) return;
          if (!SHARED.includes(m.geometry) && m.geometry !== heartGeo && m.geometry !== starGeo) m.geometry.dispose();
          m.material.dispose();
        });
      }
    this.bracesGroup = null;
    this.neon = null;
    this.bracesKind = kind || null;
    if (!kind) return;
    this.bracesGroup = [];
    this.neon = [];
    const pops = [],
      wires = [];
    for (const side of ["up", "down"]) {
      const front = this.teeth.filter((t) => t.side === side && t.type !== "molar");
      const pts = [];
      front.forEach((t, i) => {
        // Крупные, мультяшные — чтобы издалека было видно
        const s = clamp(t.w / 0.3, 1.05, 1.6);
        const { group, glow } = bracket(kind, i);
        group.position.copy(t.local(0.42, 0, 0.004));
        // Нижние зубы перевёрнуты — сердечки и звёздочки разворачиваем обратно
        if (side === "down") group.rotation.z = pie;
        group.scale.setScalar(0.001);
        group.userData.s = s;
        t.holder.add(group);
        this.bracesGroup.push(group);
        pops.push(group);
        if (glow) this.neon.push(glow);
        pts.push(t.holder.localToWorld(t.local(0.42, 0, 0.042 * s)));
      });
      const geo = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 120, 0.014, 8, false);
      geo.setDrawRange(0, 0);
      const wire = new T.Mesh(geo, wireMaterial(kind));
      this.scene.add(wire);
      this.bracesGroup.push(wire);
      wires.push(wire);
      this.burst(pts[Math.floor(pts.length / 2)], 22, 1.6);
    }
    const group = this.bracesGroup;
    this.tween(0.75, (p) => {
      if (this.bracesGroup !== group) return;
      // От середины к краям: передние зубы первыми
      pops.forEach((g, k) => {
        const order = k % 10,
          q = clamp(p * 1.8 - Math.abs(order - 4.5) * 0.09, 0, 1);
        g.scale.setScalar(Math.max(0.001, g.userData.s * (q < 0.7 ? (q / 0.7) * 1.25 : 1.25 - ((q - 0.7) / 0.3) * 0.25)));
      });
      for (const w of wires) w.geometry.setDrawRange(0, Math.floor(w.geometry.index.count * clamp(p * 1.3, 0, 1) / 6) * 6);
    });
  }
  // ---------- Финал: глаза-дуги, ушки, конфетти ----------
  cheer() {
    this.mood = this.now();
    for (const e of this.eyes) {
      for (const c of e.userData.open) c.visible = false;
      e.userData.happy.visible = true;
    }
    for (let k = 0; k < 6; k++) setTimeout(() => this.burst(new T.Vector3((Math.random() - 0.5) * 4, -0.4 + Math.random() * 1.5, 3), 28, 2.6), k * 160);
  }
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement,
      c = document.createElement("canvas"),
      size = 280;
    c.width = size;
    c.height = Math.round((size * src.height) / src.width);
    const ctx = c.getContext("2d"),
      bg = ctx.createLinearGradient(0, 0, 0, c.height);
    bg.addColorStop(0, "#bff0ff");
    bg.addColorStop(1, "#fff1f6");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  }
  render(ms) {
    if (document.hidden) return;
    const dt = this.last ? clamp((ms - this.last) / 1000, 0, 0.1) : 0;
    this.last = ms;
    const t = this.now(),
      calm = this.motion.matches ? 0 : 1;
    for (const tw of [...this.tweens]) {
      const p = clamp((t - tw.at) / tw.dur, 0, 1);
      tw.update(p);
      if (p === 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    // Глаза моргают, ушки шевелятся, язычок двигается
    if (this.eyes) for (const e of this.eyes) e.scale.y = calm && t % 4.3 > 4.15 && !this.mood ? 0.12 : 1;
    if (this.earList) this.earList.forEach((e, i) => (e.rotation.x = (e.userData.rx ??= e.rotation.x) + calm * Math.sin(t * 1.4 + i) * (this.mood ? 0.12 : 0.04)));
    if (this.tongue) this.tongue.position.y = -1.62 + calm * Math.sin(t * 2.1) * 0.03;
    // Светящиеся брекеты переливаются радугой
    if (this.neon)
      this.neon.forEach((m, k) => {
        const hue = (calm * t * 0.3 + k * 0.1) % 1;
        m.ring.color.setHSL(hue, 1, 0.55);
        m.ring.emissive.setHSL(hue, 1, 0.5);
        m.halo.color.setHSL(hue, 1, 0.6);
      });
    const d = this.dummy;
    this.sparkPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 1.5 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      d.position.copy(s.p);
      d.rotation.set(s.life * 9, s.life * 7, 0);
      d.scale.setScalar(Math.max(0, s.life / s.max) * 1.3);
      d.updateMatrix();
      this.sparks.setMatrixAt(i, d.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    this.foamMesh.count = this.foam.length;
    this.foam.forEach((f, i) => {
      d.position.copy(f.p);
      d.position.y += Math.sin(t * 3 + i) * 0.01 * calm;
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f.s * Math.min(1, (t - f.born) * 6));
      d.updateMatrix();
      this.foamMesh.setMatrixAt(i, d.matrix);
    });
    this.foamMesh.instanceMatrix.needsUpdate = true;
    this.dropPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 6 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      d.position.copy(s.p);
      d.scale.setScalar(s.life > 0 ? 1 : 0);
      d.updateMatrix();
      this.drops.setMatrixAt(i, d.matrix);
    });
    this.drops.instanceMatrix.needsUpdate = true;
    const sway = calm * Math.sin(t * 0.4) * 0.12;
    this.camera.position.set(this.look.x + sway, this.look.y + 0.15, this.look.z + this.dist);
    this.camera.lookAt(this.look);
    for (const tool of Object.values(this.tools)) if (tool.group.visible) tool.update(t, this.active);
    if (this.held) this.held.rotation.set(0.3, t * 2, 0);
    this.renderer.render(this.scene, this.camera);
    // Инструмент поверх: всегда в руке перед ротиком
    if (Object.values(this.tools).some((x) => x.group.visible) || this.held) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.toolScene, this.camera);
      this.renderer.autoClear = true;
    }
  }
}
