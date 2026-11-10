import * as T from "../vendor/three/three.module.min.js?v=15dc8320";
import "./gfx.js?v=15dc8320";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=15dc8320";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=15dc8320";
import { toothGeometry, enamel, archCurve, layout, gumGeometry, gumMaterial, labial } from "./teeth.js?v=15dc8320";
import { makeTools, renderIcon } from "./tools.js?v=15dc8320";
import { patients } from "./patients.js?v=15dc8320";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, ...extra });
const ball = new T.SphereGeometry(1, 32, 22);
function orb(parent, x, y, z, sx, sy, sz, mat) {
  const m = new T.Mesh(ball, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
const tube = (points, r, mat, closed = false) =>
  new T.Mesh(
    new T.TubeGeometry(
      new T.CatmullRomCurve3(
        points.map((p) => new T.Vector3(...p)),
        closed,
      ),
      Math.max(24, points.length * 12),
      r,
      12,
      closed,
    ),
    mat,
  );

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
    const fruit = glossy("#df2451", { roughness: 0.38 });
    for (const [x, y] of [
      [0, -0.067],
      [-0.05, -0.024],
      [0.05, -0.024],
      [-0.075, 0.038],
      [0, 0.051],
      [0.075, 0.038],
    ]) {
      orb(g, x, y, 0.045, 0.055, 0.058, 0.05, fruit);
    }
    const leaf = glossy("#319864");
    for (const sign of [-1, 1]) orb(g, sign * 0.035, 0.103, 0.046, 0.06, 0.022, 0.03, leaf).rotation.z = sign * 0.4;
  },
};
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
  new T.MeshPhysicalMaterial({
    color,
    roughness: 0.04,
    metalness: 0.1,
    clearcoat: 1,
    iridescence: 0.7,
    emissive: color,
    emissiveIntensity: emissive,
    flatShading: true,
  });
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
        ? new T.MeshPhysicalMaterial({
            color: "#eaf8ff",
            roughness: 0.04,
            transparent: true,
            opacity: 0.6,
            iridescence: 1,
            iridescenceIOR: 1.5,
            clearcoat: 1,
            emissive: "#cfefff",
            emissiveIntensity: 0.15,
          })
        : metal("#dfe6ee");
  add(BR.pad, body, 0, 0, 0.011);
  for (const x of [-1, 1]) for (const y of [-1, 1]) add(BR.wing, body, x * 0.036, y * 0.03, 0.04);
  let ring;
  if (kind === "gold") ring = glossy("#fff6ea", { roughness: 0.12, clearcoat: 1, iridescence: 0.9, sheen: 0.6, sheenColor: new T.Color("#ffe6f0") });
  else if (kind === "crystal")
    ring = glossy("#9fe6ff", { roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.8, iridescence: 1, emissive: "#9fe6ff", emissiveIntensity: 0.3 });
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
    this.scene.environmentIntensity = 0.6;
    this.camera = new T.PerspectiveCamera(40, 1, 0.1, 100);
    this.scene.add(new T.HemisphereLight(0xffffff, 0xffd6e0, 0.85));
    // Лампа доктора сверху-спереди и тёплый свет внутрь ротика
    const lamp = new T.DirectionalLight(0xfff6e6, 1.6);
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
      const needW = 5.15,
        needH = 3.35;
      this.look.y = -0.84;
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
    const materials = new Set();
    this.face.traverse((o) => {
      if (o.material) materials.add(o.material);
      if (o.geometry && ![ball, gemGeo, starGeo, heartGeo].includes(o.geometry)) o.geometry.dispose();
    });
    materials.forEach((m) => m.dispose());
    this.face.clear();
    this.fx.clear();
    this.fx.add(this.sparks, this.foamMesh, this.drops);
    this.foam = [];
  }
  // index — какой зверёк, level — сколько пациентов уже вылечено (чем больше, тем больше дел)
  build(index, level) {
    this.clear();
    const pt = patients[index];
    this.pt = pt;
    this.makeMirror();
    this.teeth = [];
    // Верхняя челюсть чуть ниже губы, чтобы была видна линия десны; нижняя чуть позади верхней
    this.arch("up", -0.6, 2.6, 0.48, 0.24);
    this.arch("down", -1.0, 2.48, 0.54, -0.28);
    this.face.updateMatrixWorld(true);
    this.problems(level * 7919 + index * 31 + 7, level);
  }
  // В зеркале крупная учебная модель. Сам зверёк остаётся рядом с доктором.
  makeMirror() {
    const frame = this.face;
    const center = -0.77;
    // Передний бортик прячет основания дёсен, а вырез оставляет рабочие поверхности открытыми.
    const oval = (rx, ry) => {
      const path = new T.Shape();
      for (let i = 0; i <= 96; i++) {
        const angle = (2 * pie * i) / 96,
          x = Math.cos(angle),
          y = Math.sin(angle);
        const px = rx * Math.sign(x) * Math.abs(x) ** 0.79;
        const py = center + ry * Math.sign(y) * Math.abs(y) ** 0.79;
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      return path;
    };
    const band = (outer, inner, color, z) => {
      const shape = oval(...outer);
      shape.holes.push(oval(...inner));
      const geometry = new T.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.016, bevelThickness: 0.025 });
      const mesh = new T.Mesh(geometry, glossy(color, { roughness: 0.42, clearcoat: 0.22 }));
      mesh.position.z = z;
      frame.add(mesh);
    };
    const enamel = glossy("#309eaa", { roughness: 0.35, metalness: 0.18 });
    const grip = new T.Mesh(new RoundedBoxGeometry(0.44, 1.15, 0.3, 4, 0.13), enamel);
    grip.position.set(1.79, -2.12, 0.22);
    grip.rotation.z = 0.65;
    frame.add(grip);
    orb(frame, 0, center, 0.16, 2.63, 1.61, 0.23, enamel);
    orb(frame, 0, center, 0.44, 2.48, 1.47, 0.19, glossy("#804962", { roughness: 0.85, clearcoat: 0.04 }));
    band([2.25, 1.32], [1.99, 1.0], "#47a79b", 3.05);
    band([2.08, 1.105], [2.02, 1.045], "#ffe4ac", 3.13);
    this.tongue = orb(frame, 0, -1.49, 0.79, 1.34, 0.32, 0.23, glossy("#f394ac", { roughness: 0.65, clearcoat: 0.1 }));
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
      const tooth = {
        side,
        type: sl.type,
        dims: sl.dims,
        w,
        h,
        d,
        pivot,
        holder,
        mesh,
        mat,
        plaque: 0,
        blobs: [],
        cavity: null,
        chip: null,
        deco: null,
        gold: false,
        glitter: null,
      };
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
    const visit = this.pt;
    const bonus = Math.min(2, Math.floor(lvl / patients.length));
    const front = (t) => t.type === "central" || t.type === "lateral";
    const film = new T.MeshPhysicalMaterial({
      color: "#e6c457",
      roughness: 0.65,
      sheen: 0.6,
      sheenColor: new T.Color("#fff0b0"),
      transparent: true,
      opacity: 0.92,
    });
    // Налёт: жёлтые пятнышки у десны и желтоватая эмаль
    for (const t of pick(visit.plaque + bonus, lvl === 0 ? front : (t) => t.type !== "molar")) {
      t.plaque = 0.6 + r() * 0.4;
      for (let k = 0; k < 4; k++) {
        const p = t.local(0.58 + r() * 0.24, (r() - 0.5) * 0.7, -0.008);
        const b = orb(t.holder, p.x, p.y, p.z, 0.05 + r() * 0.035, 0.035 + r() * 0.025, 0.022, film);
        b.userData.base = b.scale.clone();
        t.blobs.push(b);
      }
    }
    // Крошки на зубах
    this.crumbs = pick(visit.crumbs ? visit.crumbs + bonus : 0, lvl === 0 ? front : (t) => t.type !== "molar").map((t) => {
      const g = new T.Group();
      bits[visit.food](g);
      g.position.copy(t.local(0.18 + r() * 0.2, (r() - 0.5) * 0.4, 0.06));
      g.scale.setScalar(lvl === 0 ? 1.55 : 1.22);
      g.rotation.z = (t.side === "down" ? pie : 0) + (r() - 0.5) * 0.45;
      t.holder.add(g);
      return { tooth: t, mesh: g, done: false, pos: () => g.getWorldPosition(new T.Vector3()) };
    });
    // Грязь между соседними зубами у десны
    this.gaps = [];
    const pairs = [];
    for (let i = 0; i < this.teeth.length - 1; i++)
      if (this.teeth[i].side === this.teeth[i + 1].side && this.teeth[i].type !== "molar" && this.teeth[i + 1].type !== "molar") pairs.push(i);
    const used = new Set();
    for (let n = 0; n < Math.min(visit.gaps ? visit.gaps + bonus : 0, pairs.length); n++) {
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
    for (const t of pick(visit.cavities ? visit.cavities + bonus : 0, (t) => t.type !== "central" && t.type !== "molar")) {
      const p = t.local(0.42, 0.12, 0.004);
      const dark = glossy("#4a3024", { roughness: 0.8, clearcoat: 0 });
      const spot = orb(t.holder, p.x, p.y, p.z, 0.075, 0.07, 0.02, dark);
      orb(spot, 0.6, -0.4, 0.3, 0.55, 0.5, 0.6, dark);
      t.cavity = { state: "dirty", mesh: spot, progress: 0, tooth: t, pos: () => spot.getWorldPosition(new T.Vector3()) };
    }
    // Отбитый уголок резца — со второго пациента
    const chips = visit.chips ? Math.min(2, visit.chips + bonus) : 0;
    for (const t of pick(chips, (t) => (t.type === "central" || t.type === "lateral") && !t.cavity)) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = toothGeometry(t.type, t.dims, { chipped: true });
      const frag = new T.Mesh(
        toothGeometry(t.type, t.dims, { part: true }),
        new T.MeshPhysicalMaterial({
          color: "#8fe8ff",
          transparent: true,
          opacity: 0.8,
          roughness: 0.08,
          clearcoat: 1,
          emissive: "#4fd8ff",
          emissiveIntensity: 0.45,
        }),
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
  pointer(name, x, y, active, touch = false) {
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
      const Y = new T.Vector3(0.5, touch ? 0.62 : -0.62, 0.6).normalize(),
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
    g.add(
      tube(
        [
          [-0.32, front.y, z - 0.06],
          [0, front.y, z],
          [0.32, front.y, z - 0.06],
        ],
        0.026,
        wireMaterial(kind),
      ),
    );
    // Кадр — по самому замочку (площадка или фигурка), без ореола
    return group.children[0];
  }
  // Картинки для кнопок: 3D-инструменты и зубик с украшением
  braceIcons() {
    const out = {};
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
    this.drops = new T.InstancedMesh(
      new T.SphereGeometry(0.035, 8, 6),
      new T.MeshPhysicalMaterial({ color: "#9fe6ff", roughness: 0.05, transparent: true, opacity: 0.8 }),
      160,
    );
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
      s.v
        .set(Math.random() - 0.5, Math.random() * 0.8, Math.random() * 0.6)
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.life = s.max = 0.5 + Math.random() * 0.5;
    }
  }
  addFoam(at) {
    if (this.foam.length >= 300) return;
    this.foam.push({
      p: at.clone().add(new T.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.14, 0.05 + Math.random() * 0.06)),
      s: 0.6 + Math.random() * 0.9,
      born: this.now(),
    });
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
      this.glow = new T.Mesh(
        new T.CircleGeometry(0.3, 32),
        new T.MeshBasicMaterial({ color: "#7fe0ff", transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }),
      );
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
    if (tooth.plaque === 0 || Math.random() < 0.6) this.addFoam(tooth.anchor());
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
      for (const w of wires) w.geometry.setDrawRange(0, Math.floor((w.geometry.index.count * clamp(p * 1.3, 0, 1)) / 6) * 6);
    });
  }
  // ---------- Финал: глаза-дуги, ушки, конфетти ----------
  cheer() {
    for (let k = 0; k < 6; k++) setTimeout(() => this.burst(new T.Vector3((Math.random() - 0.5) * 4, -0.4 + Math.random() * 1.5, 3), 28, 2.6), k * 160);
  }
  // Снимаем один и тот же участок модели при любой ориентации экрана.
  smileDetail() {
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
    const src = this.canvas,
      rect = src.getBoundingClientRect();
    const points = this.teeth.map((t) => this.screenPoint(t.anchor()));
    const xs = points.map((p) => p.x - rect.left),
      ys = points.map((p) => p.y - rect.top);
    const left = Math.min(...xs),
      right = Math.max(...xs);
    const width = (right - left) * 1.27,
      height = width * 0.6;
    const x = (left + right - width) / 2,
      y = (Math.min(...ys) + Math.max(...ys) - height) / 2;
    const c = document.createElement("canvas");
    c.width = 384;
    c.height = 230;
    c.getContext("2d").drawImage(
      src,
      (x * src.width) / rect.width,
      (y * src.height) / rect.height,
      (width * src.width) / rect.width,
      (height * src.height) / rect.height,
      0,
      0,
      c.width,
      c.height,
    );
    return c;
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
    if (this.tongue) this.tongue.position.y = -1.49 + calm * Math.sin(t * 2.1) * 0.018;
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
