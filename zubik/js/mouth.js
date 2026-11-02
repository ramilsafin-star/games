// 3D-клиника «Зубика»: мордочка зверька с открытым ртом, человеческий зубной ряд (14 зубов в каждой челюсти),
// налёт, крошки, грязь между зубами, дырочки, сколы, украшения и эффекты. Правила лечения — в game.js.
import * as T from "../vendor/three/three.module.min.js?v=9a893b63";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=9a893b63";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=9a893b63";

const pie = Math.PI;
const clamp = T.MathUtils.clamp,
  mix = T.MathUtils.lerp;
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, ...extra });
const soft = (color) => new T.MeshStandardMaterial({ color, roughness: 0.75 });
function orb(parent, x, y, z, sx, sy, sz, mat) {
  const m = new T.Mesh(ball, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
const ball = new T.SphereGeometry(1, 32, 22);

// Пациенты: цвет меха, мордочки, губ и ушки
export const patients = [
  { kind: "bear", name: "Мишка Топа", fur: "#c4844f", muzzle: "#f4cf99", lip: "#b05a4a", ear: "#e3a77a", nose: "#3b2730" },
  { kind: "fox", name: "Лисичка Ириска", fur: "#f08a46", muzzle: "#fff1d6", lip: "#c4605a", ear: "#7a3f36", nose: "#2b2030" },
  { kind: "bunny", name: "Зайка Плюша", fur: "#cbbde6", muzzle: "#fff3ec", lip: "#d07a92", ear: "#f3a6bf", nose: "#e9798d" },
  { kind: "cat", name: "Котёнок Мурка", fur: "#aeb8cd", muzzle: "#fff8ee", lip: "#c47c8a", ear: "#f6b3c0", nose: "#e9798d" },
  { kind: "pig", name: "Поросёнок Хрюня", fur: "#f8b2c2", muzzle: "#ffd0dc", lip: "#d46a86", ear: "#ec8aa2", nose: "#e27794" },
  { kind: "panda", name: "Панда Бусинка", fur: "#fbf7ef", muzzle: "#ffffff", lip: "#c47c8a", ear: "#3d3340", nose: "#2b2030" },
];

// ---------- Зубы ----------
// Размеры [ширина вдоль ряда, высота, толщина]. Верхние резцы крупнее нижних, как у людей.
const DIMS = {
  up: { central: [0.36, 0.56, 0.2], lateral: [0.28, 0.48, 0.18], canine: [0.3, 0.56, 0.24], premolar: [0.27, 0.44, 0.32], molar: [0.4, 0.4, 0.4] },
  down: { central: [0.23, 0.48, 0.18], lateral: [0.25, 0.48, 0.18], canine: [0.28, 0.54, 0.22], premolar: [0.27, 0.42, 0.3], molar: [0.42, 0.38, 0.4] },
};
// От середины к краю: центральный резец, боковой резец, клык, два малых и два больших коренных
const ORDER = ["central", "lateral", "canine", "premolar", "premolar", "molar", "molar"];
// Геометрия зуба: режущий край внизу (y = −h/2), шейка у десны вверху, лицевая сторона — к +z
function toothGeometry(type, [w, h, d], chipped) {
  const g = new RoundedBoxGeometry(w, h, d, 5, Math.min(w, d) * 0.34);
  const p = g.attributes.position;
  const v = new T.Vector3();
  const cusps =
    type === "molar"
      ? [
          [-0.22, -0.22],
          [0.22, -0.22],
          [-0.22, 0.22],
          [0.22, 0.22],
        ]
      : type === "premolar"
        ? [
            [0, -0.24],
            [0, 0.24],
          ]
        : [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + h / 2) / h; // 0 — режущий край, 1 — шейка
    // Шейка уже коронки
    const neck = type === "molar" || type === "premolar" ? 0.86 : 0.76;
    const k = neck + (1 - neck) * (1 - t);
    v.x *= k;
    v.z *= 0.88 + 0.12 * (1 - t);
    // Лицевая сторона чуть выпуклая
    if (v.z > 0) v.z += 0.025 * Math.cos((v.x / w) * pie);
    // Клык заострён книзу
    if (type === "canine" && t < 0.5) {
      const s = t / 0.5;
      v.x *= 0.3 + 0.7 * s;
      v.z *= 0.55 + 0.45 * s;
      v.y -= (1 - s) * 0.05;
    }
    // Бугорки у коренных
    if (cusps.length && t < 0.15) for (const [cx, cz] of cusps) v.y -= 0.05 * Math.exp(-(((v.x / w - cx) ** 2 + (v.z / d - cz) ** 2) / 0.02));
    // Скол: уголок резца отсутствует, край неровный
    if (chipped && v.x > w * 0.08 && v.y < -h * 0.1) v.y = -h * 0.1 + (v.y + h * 0.1) * 0.06 + Math.sin(v.x * 90) * 0.012;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const enamel = () =>
  new T.MeshPhysicalMaterial({
    color: "#fffdf6",
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheen: 0.4,
    sheenColor: new T.Color("#ffffff"),
  });
const PLAQUE = new T.Color("#e9cf73"),
  WHITE = new T.Color("#fffdf6"),
  GOLD = new T.Color("#ffc93c");

// ---------- Мелкие детали ----------
const bits = {
  apple: (g) => {
    const m = new T.Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.12, 2, 0.03), soft("#fff3d6"));
    const peel = new T.Mesh(new RoundedBoxGeometry(0.17, 0.04, 0.13, 2, 0.015), glossy("#e8343f"));
    peel.position.y = 0.07;
    g.add(m, peel);
  },
  leaf: (g) => {
    orb(g, 0, 0, 0, 0.13, 0.03, 0.08, glossy("#3fb84f")).rotation.z = 0.5;
  },
  candy: (g) => {
    orb(g, 0, 0, 0, 0.09, 0.09, 0.09, glossy("#ff5fa8", { clearcoat: 1 }));
  },
  seed: (g) => {
    orb(g, 0, 0, 0, 0.06, 0.035, 0.04, glossy("#5a3a24"));
  },
  corn: (g) => {
    orb(g, 0, 0, 0, 0.07, 0.06, 0.06, glossy("#ffd23f"));
  },
  berry: (g) => {
    orb(g, 0, 0, 0, 0.08, 0.08, 0.08, glossy("#6a2fb8"));
  },
};
const BIT_KINDS = Object.keys(bits);
// Украшения
const gemGeo = (() => {
  // «Бриллиант»: верхняя площадка, коронка и острый низ
  const pts = [new T.Vector2(0, -0.09), new T.Vector2(0.1, 0.0), new T.Vector2(0.08, 0.035), new T.Vector2(0.045, 0.05), new T.Vector2(0, 0.05)];
  const g = new T.LatheGeometry(pts, 8);
  g.rotateX(pie / 2);
  return g;
})();
const starGeo = (() => {
  const s = new T.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k * pie) / 5 + pie / 2,
      r = k % 2 ? 0.045 : 0.1;
    k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
})();
const heartGeo = (() => {
  const s = new T.Shape();
  s.moveTo(0, -0.08);
  s.bezierCurveTo(0.12, 0, 0.09, 0.09, 0, 0.05);
  s.bezierCurveTo(-0.09, 0.09, -0.12, 0, 0, -0.08);
  return new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
})();
const shiny = (color, emissive = 0.15) =>
  new T.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0.1, clearcoat: 1, iridescence: 0.6, emissive: color, emissiveIntensity: emissive, flatShading: true });
export const decorations = [
  { id: "diamond", name: "Бриллиант", make: () => new T.Mesh(gemGeo, shiny("#e8f6ff", 0.35)) },
  { id: "ruby", name: "Рубин", make: () => new T.Mesh(gemGeo, shiny("#ff2d55")) },
  { id: "emerald", name: "Изумруд", make: () => new T.Mesh(gemGeo, shiny("#1fd47a")) },
  { id: "sapphire", name: "Сапфир", make: () => new T.Mesh(gemGeo, shiny("#2f6bff")) },
  { id: "star", name: "Звёздочка", make: () => new T.Mesh(starGeo, shiny("#ffd23f", 0.3)) },
  { id: "heart", name: "Сердечко", make: () => new T.Mesh(heartGeo, shiny("#ff5f8e", 0.3)) },
  { id: "gold", name: "Золотая коронка", tooth: true },
  { id: "braces", name: "Брекеты", whole: true },
  { id: "glitter", name: "Блёстки", tooth: true },
];

export class Clinic {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.shadowMap.enabled = false;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
    this.camera = new T.PerspectiveCamera(40, 1, 0.1, 100);
    this.scene.add(new T.HemisphereLight(0xffffff, 0xffd6e0, 1.2));
    // Лампа доктора светит сверху-спереди прямо в рот
    const lamp = new T.DirectionalLight(0xfff6e6, 2.4);
    lamp.position.set(1.5, 4, 8);
    this.scene.add(lamp);
    const fill = new T.PointLight(0xffe0e8, 6, 12);
    fill.position.set(0, -0.4, 4.5);
    this.scene.add(fill);
    this.face = new T.Group();
    this.scene.add(this.face);
    this.fx = new T.Group();
    this.scene.add(this.fx);
    this.tweens = [];
    this.makeParticles();
    this.look = new T.Vector3(0, -0.15, 2);
    this.view = 1;
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.resize = () => {
      const w = this.canvas.clientWidth,
        h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      const aspect = w / h;
      // В кадре весь рот (ширина ~6,2) и немного мордочки; на широком экране — больше по высоте
      // Ротик почти во всю ширину, сверху видны глаза и нос
      // На узком телефоне стоя ротик крупнее: губы чуть уходят за края, зубы больше
      // Низкий широкий экран (телефон лёжа): по высоте только ротик, глаза уходят вверх
      const needW = aspect < 0.7 ? 4.3 : 5.0,
        needH = aspect > 1.8 ? 4.7 : 6.0;
      const dist = 9;
      const fovFromW = 2 * Math.atan(needW / aspect / 2 / dist);
      const fovFromH = 2 * Math.atan(needH / 2 / dist);
      this.camera.fov = T.MathUtils.radToDeg(Math.max(fovFromW, fovFromH));
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.dist = dist;
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
  // ---------- Мордочка ----------
  clear() {
    this.face.traverse((o) => {
      if (o.geometry && o.geometry !== ball && o.geometry !== gemGeo && o.geometry !== starGeo && o.geometry !== heartGeo) o.geometry.dispose();
    });
    this.face.clear();
    this.braces(false);
    this.fx.clear();
    this.fx.add(this.sparks, this.foamMesh, this.drops);
    this.foam = [];
  }
  // index — какой зверёк, level — сколько пациентов уже вылечено (чем больше, тем больше дел)
  build(index, level) {
    this.clear();
    const pt = patients[index];
    this.pt = pt;
    const F = this.face;
    const fur = soft(pt.fur),
      muzzle = soft(pt.muzzle);
    // Голова позади и выше рта, щёки по бокам, подбородок снизу
    // Голова, щёки и подбородок стоят дальше «горла», чтобы не просвечивать в ротике
    orb(F, 0, 3.0, -1.6, 4.2, 3.4, 3.2, fur);
    orb(F, -3.4, -0.6, -1.2, 2.0, 2.3, 2.0, fur);
    orb(F, 3.4, -0.6, -1.2, 2.0, 2.3, 2.0, fur);
    orb(F, 0, -3.3, -1.2, 2.8, 1.6, 2.2, fur);
    // Мордочка — пластина с вырезом под рот
    const outline = new T.Shape();
    outline.absellipse(0, -0.2, 3.7, 3.25, 0, pie * 2, false, 0);
    const hole = new T.Path();
    hole.absellipse(0, -0.42, 2.6, 2.1, 0, pie * 2, true, 0);
    outline.holes.push(hole);
    const plate = new T.Mesh(
      new T.ExtrudeGeometry(outline, { depth: 0.4, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 6, curveSegments: 72 }),
      muzzle,
    );
    plate.position.z = 1.6;
    F.add(plate);
    // Губы вокруг рта
    // Губы закрывают край выреза
    const lips = new T.Mesh(new T.TorusGeometry(1, 0.09, 16, 120), glossy(pt.lip, { roughness: 0.35 }));
    lips.scale.set(2.36, 1.9, 2.2);
    lips.position.set(0, -0.42, 2.3);
    F.add(lips);
    // Нос и глаза
    orb(F, 0, 1.78, 2.42, 0.42, 0.3, 0.3, glossy(pt.nose, { clearcoat: 1, roughness: 0.2 }));
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new T.Group();
      eye.position.set(s * 1.15, 2.3, 2.32);
      orb(eye, 0, 0, 0, 0.26, 0.32, 0.18, glossy("#2b2030", { roughness: 0.15 }));
      orb(eye, -0.07, 0.1, 0.13, 0.07, 0.08, 0.04, new T.MeshBasicMaterial({ color: "#ffffff" }));
      // Счастливые глаза-дуги для финала
      const happy = new T.Mesh(new T.TorusGeometry(0.22, 0.06, 10, 24, pie), glossy("#2b2030"));
      happy.position.y = -0.05;
      happy.visible = false;
      eye.add(happy);
      eye.userData.happy = happy;
      F.add(eye);
      this.eyes.push(eye);
      // Румянец
      orb(F, s * 2.55, 1.35, 2.25, 0.42, 0.24, 0.12, new T.MeshBasicMaterial({ color: "#ff9fb0", transparent: true, opacity: 0.55 }));
    }
    this.ears(F, pt);
    // Полость рта, нёбо, язык
    // Тёмное «горло» за зубами
    const throat = new T.Mesh(new T.CircleGeometry(1, 64), new T.MeshStandardMaterial({ color: "#6a1a36", roughness: 0.9 }));
    throat.scale.set(2.7, 2.2, 1);
    throat.position.set(0, -0.42, 0.72);
    F.add(throat);
    orb(F, 0, 0.62, 1.0, 1.75, 0.35, 1.25, soft("#ff8fa3"));
    this.tongue = orb(F, 0, -1.32, 1.35, 1.3, 0.42, 1.05, glossy("#ff6f8f", { roughness: 0.45, clearcoat: 0.3 }));
    // Зубы и дёсны
    this.teeth = [];
    this.arch("up", 0.42, 1.78, 1.28, 1.15);
    this.arch("down", -1.08, 1.64, 1.18, 1.1);
    this.face.updateMatrixWorld(true);
    this.problems(level * 7919 + index * 31 + 7, level);
    this.mood = 0;
  }
  ears(F, pt) {
    const fur = soft(pt.fur),
      ear = soft(pt.ear);
    for (const s of [-1, 1]) {
      if (pt.kind === "bunny") {
        orb(F, s * 1.6, 6.2, -1.5, 0.75, 2.2, 0.5, fur).rotation.z = -s * 0.15;
        orb(F, s * 1.62, 6.1, -1.1, 0.45, 1.8, 0.2, ear).rotation.z = -s * 0.15;
      } else if (pt.kind === "fox" || pt.kind === "cat") {
        const cone = new T.Mesh(new T.ConeGeometry(1.1, 1.9, 4), fur);
        cone.position.set(s * 2.6, 5.6, -1.4);
        cone.rotation.z = -s * 0.35;
        F.add(cone);
      } else if (pt.kind === "pig") {
        const cone = new T.Mesh(new T.ConeGeometry(0.9, 1.2, 4), ear);
        cone.position.set(s * 2.7, 5.0, -0.8);
        cone.rotation.set(0.7, 0, -s * 0.8);
        F.add(cone);
      } else {
        orb(F, s * 2.9, 5.3, -1.6, 1.15, 1.15, 0.6, pt.kind === "panda" ? ear : fur);
        orb(F, s * 2.9, 5.3, -1.1, 0.65, 0.65, 0.2, ear);
      }
      // Тёмные пятна вокруг глаз панды — на мордочке, перед ней
      if (pt.kind === "panda") orb(F, s * 1.18, 2.24, 2.27, 0.52, 0.6, 0.1, soft("#3d3340")).rotation.z = s * 0.45;
    }
  }
  // Челюсть: 14 зубов по дуге эллипса, десна-валик над (или под) ними
  arch(side, y, ax, az, tilt) {
    const group = new T.Group();
    group.position.set(0, y, 1.25);
    // Наклон: видна жевательная сторона у дальних зубов
    group.rotation.x = side === "up" ? 0.42 : -0.42;
    this.face.add(group);
    const dims = DIMS[side];
    const list = [...ORDER.slice().reverse(), ...ORDER];
    const widths = list.map((t) => dims[t][0] + 0.035);
    const total = widths.reduce((a, b) => a + b, 0);
    // Точки эллипса и длина дуги
    const pts = [];
    let len = 0;
    for (let k = 0; k <= 400; k++) {
      const phi = -1.9 + (3.8 * k) / 400;
      const p = new T.Vector3(ax * Math.sin(phi), 0, az * Math.cos(phi));
      if (pts.length) len += p.distanceTo(pts.at(-1).p);
      pts.push({ p, phi, len });
    }
    const start = (len - total) / 2;
    let acc = start;
    const gumPts = [];
    list.forEach((type, k) => {
      const at = acc + widths[k] / 2;
      acc += widths[k];
      const q = pts.find((o) => o.len >= at) || pts.at(-1);
      const [w, h, d] = dims[type];
      const pivot = new T.Group();
      pivot.position.copy(q.p);
      // Лицевой стороной наружу дуги
      pivot.rotation.y = Math.atan2(Math.sin(q.phi) / ax, Math.cos(q.phi) / az);
      group.add(pivot);
      const holder = new T.Group();
      if (side === "down") holder.rotation.z = pie;
      holder.position.y = side === "up" ? h / 2 : -h / 2;
      pivot.add(holder);
      const mat = enamel();
      const mesh = new T.Mesh(toothGeometry(type, [w, h, d], false), mat);
      holder.add(mesh);
      const tooth = { side, type, k, w, h, d, pivot, holder, mesh, mat, plaque: 0, blobs: [], cavity: null, chip: null, deco: null, gold: false, glitter: null };
      // Точка на лицевой стороне посередине коронки: сюда ставятся украшения
      tooth.anchor = () => holder.localToWorld(new T.Vector3(0, -h * 0.12, d / 2 + 0.03));
      tooth.center = () => holder.localToWorld(new T.Vector3(0, -h * 0.1, 0.02));
      this.teeth.push(tooth);
      gumPts.push(q.p.clone().add(new T.Vector3(0, side === "up" ? h + 0.02 : -h - 0.02, 0)));
    });
    // Десна: розовый валик вдоль корней
    const curve = new T.CatmullRomCurve3(gumPts.map((p) => p.clone().setY(side === "up" ? 0.68 : -0.66)));
    const gum = new T.Mesh(new T.TubeGeometry(curve, 96, 0.19, 14, false), glossy("#ff8fa3", { roughness: 0.45, clearcoat: 0.4 }));
    group.add(gum);
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
    // Налёт: жёлтые пятнышки у десны и желтоватая эмаль
    for (const t of pick(9 + Math.min(lvl, 6), () => true)) {
      t.plaque = 0.6 + r() * 0.4;
      for (let k = 0; k < 3; k++) {
        const b = orb(t.holder, (r() - 0.5) * t.w * 0.7, t.h * (0.2 + r() * 0.2), t.d / 2 + 0.005, 0.055 + r() * 0.04, 0.04 + r() * 0.03, 0.025, glossy("#e8c55a", { roughness: 0.7, clearcoat: 0 }));
        b.userData.base = b.scale.clone();
        t.blobs.push(b);
      }
    }
    // Крошки на зубах
    this.crumbs = pick(3 + Math.min(lvl, 3), (t) => t.type !== "molar").map((t) => {
      const g = new T.Group();
      bits[BIT_KINDS[Math.floor(r() * BIT_KINDS.length)]](g);
      g.position.set((r() - 0.5) * t.w * 0.4, -t.h * 0.3, t.d / 2 + 0.06);
      g.rotation.set(r() * 3, r() * 3, r() * 3);
      t.holder.add(g);
      return { tooth: t, mesh: g, done: false, pos: () => g.getWorldPosition(new T.Vector3()) };
    });
    // Грязь между зубами (соседи в одной челюсти)
    this.gaps = [];
    const pairs = [];
    for (let i = 0; i < this.teeth.length - 1; i++) if (this.teeth[i].side === this.teeth[i + 1].side) pairs.push(i);
    const used = new Set();
    for (let n = 0; n < 2 + Math.min(lvl, 3); n++) {
      let i;
      do i = pairs[Math.floor(r() * pairs.length)];
      while (used.has(i));
      used.add(i);
      const a = this.teeth[i],
        b = this.teeth[i + 1];
      const pa = a.anchor(),
        pb = b.anchor();
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const gunk = new T.Group();
      gunk.position.copy(this.face.worldToLocal(mid.clone()));
      for (let k = 0; k < 3; k++) orb(gunk, 0, (k - 1) * 0.06 * (a.side === "up" ? 1 : -1), 0, 0.045, 0.06, 0.04, glossy("#8a5a2a", { roughness: 0.8, clearcoat: 0 }));
      this.face.add(gunk);
      this.gaps.push({ a, b, mesh: gunk, done: false, rubs: 0, pos: () => gunk.getWorldPosition(new T.Vector3()) });
    }
    // Дырочки: тёмное пятнышко на лицевой стороне
    const cav = Math.min(1 + Math.floor(lvl / 2), 3);
    for (const t of pick(cav, (t) => t.type !== "central")) {
      const spot = orb(t.holder, t.w * 0.1, -t.h * 0.05, t.d / 2 + 0.012, 0.07, 0.07, 0.02, glossy("#4a3024", { roughness: 0.8, clearcoat: 0 }));
      t.cavity = { state: "dirty", mesh: spot, progress: 0, tooth: t, pos: () => spot.getWorldPosition(new T.Vector3()) };
    }
    // Скол уголка резца — с первого пациента после самого первого
    const chips = lvl >= 1 ? Math.min(1 + Math.floor((lvl - 1) / 2), 2) : 0;
    for (const t of pick(chips, (t) => (t.type === "central" || t.type === "lateral") && !t.cavity)) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = toothGeometry(t.type, [t.w, t.h, t.d], true);
      const frag = new T.Mesh(
        new RoundedBoxGeometry(t.w * 0.44, t.h * 0.42, t.d * 0.9, 3, 0.03),
        new T.MeshPhysicalMaterial({ color: "#8fe8ff", transparent: true, opacity: 0.75, roughness: 0.1, clearcoat: 1, emissive: "#4fd8ff", emissiveIntensity: 0.4 }),
      );
      frag.position.set(t.w * 0.29, -t.h * 0.29, 0);
      frag.scale.setScalar(0.001);
      frag.visible = false;
      t.holder.add(frag);
      t.chip = { state: "broken", frag, progress: 0, tooth: t, pos: () => t.holder.localToWorld(new T.Vector3(t.w * 0.29, -t.h * 0.33, t.d / 2)) };
    }
    this.refreshTeeth();
  }
  refreshTeeth() {
    for (const t of this.teeth) {
      if (t.gold) continue;
      t.mat.color.copy(WHITE).lerp(PLAQUE, t.plaque * 0.55);
      t.mat.roughness = 0.16 + t.plaque * 0.4;
      // Пятнышки налёта уменьшаются вместе с ним
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
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, behind: p.z > 1 };
  }
  // Ближайшая цель к пальцу в пределах радиуса (в пикселях): щедро, чтобы попадали маленькие пальцы
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
    // Сколько пикселей занимает отрезок world у рта
    const a = this.screenPoint(new T.Vector3(0, -0.4, 2.5)),
      b = this.screenPoint(new T.Vector3(world, -0.4, 2.5));
    return Math.abs(b.x - a.x);
  }
  // ---------- Частицы: искры, пена, капли ----------
  makeParticles() {
    const n = 220;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.05, 0), new T.MeshBasicMaterial({ color: "#ffffff" }), n);
    this.sparkPool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
    const colors = ["#ffffff", "#ffe14d", "#7fe8ff", "#ff9fd0", "#b99bff"];
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color(colors[i % colors.length]));
    this.sparks.frustumCulled = false;
    this.sparkNext = 0;
    const fm = 260;
    this.foamMesh = new T.InstancedMesh(
      new T.SphereGeometry(0.06, 12, 8),
      new T.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.15, transparent: true, opacity: 0.85, iridescence: 0.6, clearcoat: 1 }),
      fm,
    );
    this.foamMesh.frustumCulled = false;
    this.foamMesh.count = 0;
    this.foam = [];
    this.drops = new T.InstancedMesh(new T.SphereGeometry(0.035, 8, 6), new T.MeshPhysicalMaterial({ color: "#9fe6ff", roughness: 0.05, transparent: true, opacity: 0.8 }), 120);
    this.drops.frustumCulled = false;
    this.dropPool = Array.from({ length: 120 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0 }));
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
    if (this.foam.length >= 260) return;
    this.foam.push({ p: at.clone().add(new T.Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.12, 0.04 + Math.random() * 0.06)), s: 0.6 + Math.random() * 0.9, born: this.now() });
  }
  // Вода смывает пену рядом с пальцем; возвращает, сколько пузырей смыто
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
      d.p.copy(at).add(new T.Vector3(0, 0, 0.6));
      d.v.set((Math.random() - 0.5) * 1.2, -0.4 - Math.random(), -1.5 - Math.random());
      d.life = 0.5;
    }
  }
  // Луч ламы: светящийся кружок на цели
  glowAt(at, on) {
    if (!this.glow) {
      this.glow = new T.Mesh(new T.CircleGeometry(0.28, 32), new T.MeshBasicMaterial({ color: "#7fe0ff", transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }));
      this.scene.add(this.glow);
    }
    this.glow.visible = on;
    if (on) this.glow.position.copy(at).add(new T.Vector3(0, 0, 0.08));
  }
  // ---------- Действия ----------
  pluck(crumb, dish) {
    crumb.done = true;
    const g = crumb.mesh,
      from = g.getWorldPosition(new T.Vector3());
    this.scene.attach(g);
    const to = dish.clone();
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
    if (tooth.plaque === 0) this.burst(tooth.anchor(), 8, 1.2);
    return true;
  }
  floss(gap) {
    gap.rubs++;
    gap.mesh.rotation.z = Math.sin(gap.rubs) * 0.4;
    gap.mesh.scale.setScalar(Math.max(0.05, 1 - gap.rubs / 6));
    if (gap.rubs >= 6 && !gap.done) {
      gap.done = true;
      gap.mesh.visible = false;
      this.burst(gap.pos(), 10, 1.2);
      return true;
    }
    return false;
  }
  drill(c, dt) {
    c.progress = Math.min(1, c.progress + dt / 1.3);
    // Тёмное пятнышко светлеет до серой ямки
    c.mesh.material.color.set("#4a3024").lerp(new T.Color("#9aa0a8"), c.progress);
    c.mesh.scale.set(0.07 + c.progress * 0.02, 0.07 + c.progress * 0.02, 0.02);
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
    c.mesh.material = new T.MeshPhysicalMaterial({ color: "#bdf0ff", roughness: 0.1, clearcoat: 1, emissive: "#6fd8ff", emissiveIntensity: 0.35 });
    c.mesh.scale.set(0.095, 0.095, 0.04);
    this.burst(c.pos(), 6, 0.8);
  }
  harden(item, dt) {
    item.progress = Math.min(1, item.progress + dt / 1.1);
    if (item.progress === 1) {
      if (item.frag) {
        item.state = "done";
        item.frag.material = item.tooth.mat;
      } else {
        item.state = "done";
        item.mesh.material = item.tooth.mat;
        item.mesh.scale.set(0.09, 0.09, 0.012);
      }
      this.burst(item.pos(), 18, 1.6);
      return true;
    }
    return false;
  }
  grow(chip, dt) {
    chip.frag.visible = true;
    chip.progress = Math.min(1, chip.progress + dt / 1.2);
    chip.frag.scale.setScalar(Math.max(0.001, chip.progress));
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
    // Повторное касание тем же украшением снимает его
    const same = (tooth.deco && tooth.deco.id === id) || (id === "gold" && tooth.gold) || (id === "glitter" && tooth.glitter);
    if (tooth.deco) {
      tooth.deco.mesh.removeFromParent();
      tooth.deco = null;
    }
    if (id === "gold") {
      tooth.gold = !same;
      tooth.mat.color.copy(tooth.gold ? GOLD : WHITE);
      tooth.mat.metalness = tooth.gold ? 1 : 0;
      tooth.mat.roughness = tooth.gold ? 0.18 : 0.16;
    } else if (id === "glitter") {
      if (tooth.glitter) {
        tooth.glitter.removeFromParent();
        tooth.glitter = null;
      } else {
        const g = new T.Group();
        for (let k = 0; k < 9; k++) {
          const s = new T.Mesh(new T.OctahedronGeometry(0.018, 0), new T.MeshBasicMaterial({ color: ["#ffffff", "#ffe14d", "#ff9fd0", "#7fe8ff"][k % 4] }));
          s.position.set((Math.random() - 0.5) * tooth.w * 0.7, (Math.random() - 0.5) * tooth.h * 0.6, tooth.d / 2 + 0.02);
          g.add(s);
        }
        tooth.holder.add(g);
        tooth.glitter = g;
      }
    } else if (!same) {
      const m = deco.make();
      m.position.set(0, -tooth.h * 0.12, tooth.d / 2 + 0.04);
      if (tooth.side === "down") m.rotation.z = pie;
      // Камушки крупные, чтобы украшение было видно издалека
      const size = 1.55 * Math.min(1, tooth.w / 0.3);
      m.scale.setScalar(size);
      tooth.holder.add(m);
      tooth.deco = { id, mesh: m };
      this.tween(0.35, (p) => m.scale.setScalar(size * (p < 0.7 ? (p / 0.7) * 1.3 : 1.3 - ((p - 0.7) / 0.3) * 0.3)));
    }
    this.burst(tooth.anchor(), 12, 1.4);
    return !same;
  }
  // Брекеты на передних зубах обеих челюстей: замочки, проволока и цветные резиночки
  braces(on) {
    if (this.bracesGroup) {
      this.bracesGroup.forEach((g) => g.removeFromParent());
      this.bracesGroup = null;
    }
    if (!on) return;
    this.bracesGroup = [];
    const colors = ["#ff4f8e", "#3fd6ff", "#ffd23f", "#7cff8f", "#b47cff"];
    for (const side of ["up", "down"]) {
      const front = this.teeth.filter((t) => t.side === side && t.type !== "molar");
      const pts = [];
      front.forEach((t, i) => {
        const br = new T.Mesh(new RoundedBoxGeometry(0.11, 0.09, 0.05, 2, 0.015), new T.MeshPhysicalMaterial({ color: "#dfe6ee", metalness: 1, roughness: 0.2 }));
        br.position.set(0, -t.h * 0.12, t.d / 2 + 0.035);
        const ring = new T.Mesh(new T.TorusGeometry(0.055, 0.016, 8, 20), glossy(colors[i % colors.length], { emissive: colors[i % colors.length], emissiveIntensity: 0.25 }));
        ring.position.z = 0.02;
        br.add(ring);
        t.holder.add(br);
        this.bracesGroup.push(br);
        pts.push(t.holder.localToWorld(new T.Vector3(0, -t.h * 0.12, t.d / 2 + 0.06)));
      });
      const wire = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 80, 0.012, 6, false), new T.MeshPhysicalMaterial({ color: "#eef2f6", metalness: 1, roughness: 0.15 }));
      this.scene.add(wire);
      this.bracesGroup.push(wire);
    }
  }
  // ---------- Финал: улыбка, глаза-дуги, конфетти ----------
  cheer() {
    this.mood = this.now();
    for (const e of this.eyes) {
      e.children.forEach((c) => (c.visible = c === e.userData.happy));
    }
    for (let k = 0; k < 6; k++) setTimeout(() => this.burst(new T.Vector3((Math.random() - 0.5) * 4, -0.4 + Math.random() * 1.5, 2.8), 26, 2.6), k * 160);
  }
  // Снимок улыбки для галереи (маленькая картинка JPEG)
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement,
      c = document.createElement("canvas"),
      size = 260;
    c.width = size;
    c.height = Math.round((size * src.height) / src.width);
    // Фон кабинета под мордочкой (холст прозрачный, а JPEG без прозрачности)
    const ctx = c.getContext("2d"),
      bg = ctx.createLinearGradient(0, 0, 0, c.height);
    bg.addColorStop(0, "#bff0ff");
    bg.addColorStop(1, "#fff1f6");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
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
    // Мордочка дышит, глаза моргают, язык шевелится
    this.face.position.y = calm * Math.sin(t * 1.6) * 0.04;
    if (this.eyes) for (const e of this.eyes) e.scale.y = calm && t % 4.3 > 4.15 && !this.mood ? 0.15 : 1;
    if (this.tongue) this.tongue.position.y = -1.32 + calm * Math.sin(t * 2.1) * 0.03;
    // Искры
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
    // Пена: пузыри появляются с «чпок» и чуть покачиваются
    this.foamMesh.count = this.foam.length;
    this.foam.forEach((f, i) => {
      const age = t - f.born;
      d.position.copy(f.p);
      d.position.y += Math.sin(t * 3 + i) * 0.01 * calm;
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f.s * Math.min(1, age * 6));
      d.updateMatrix();
      this.foamMesh.setMatrixAt(i, d.matrix);
    });
    this.foamMesh.instanceMatrix.needsUpdate = true;
    // Капли воды
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
    // Камера: лёгкое покачивание
    const sway = calm * Math.sin(t * 0.4) * 0.15;
    this.camera.position.set(this.look.x + sway, this.look.y + 0.1, this.look.z + this.dist * this.view);
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
  }
}
