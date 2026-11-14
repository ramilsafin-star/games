// 3D-мир «Ёжика-почтальона»: диорама с разрезом земли, почта и станция, рельсы с опорами,
// ёжик в вагончике, кольца с печатями, частицы. Игровая плоскость — z = 0, x вправо, y вверх.
import * as T from "../vendor/three/three.module.min.js?v=bb8d6757";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=bb8d6757";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=bb8d6757";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=bb8d6757";
import { polish } from "./gfx.js?v=46671f0f";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=bb8d6757";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=bb8d6757";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=bb8d6757";
import { groundAt, platforms, railAt } from "./physics.js?v=46671f0f";
import { STORIES } from "./levels.js?v=46671f0f";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const FRONT = 2.6; // передний срез диорамы
const RAIL_COLORS = ["#ff4f6d", "#3f8cff", "#ffb02e", "#9b5cff", "#20c997", "#ff7ad9"];

export const THEMES = {
  meadow: {
    sky: ["#4fc3ff", "#bfeaff", "#f4fbff"],
    fog: "#d6f1ff",
    grass: "#62d26f",
    grass2: "#86e07a",
    lip: "#45b95a",
    dirt: ["#d39a5f", "#b8763f", "#8f5733"],
    far: ["#8fd6a0", "#76c991", "#a7e0b4"],
    peaks: "#9cc8f0",
    trees: ["#3fbf5a", "#5bd46d", "#2fa04c", "#7fdc6a"],
    trunk: "#8a5a35",
    flowers: ["#ff6fa8", "#ffd23f", "#ffffff", "#b47cff", "#ff8f3f"],
    water: "#3fb6ff",
    rock: "#b6a7c9",
    sun: 0xfff1d6,
    hemi: [0xffffff, 0x8fd18f],
    tower: ["#ffb36b", "#7ec8ff"],
  },
  autumn: {
    sky: ["#ff8f6b", "#ffc89a", "#fff1dc"],
    fog: "#ffe4c8",
    grass: "#e6b347",
    grass2: "#f0c45c",
    lip: "#c98d2e",
    dirt: ["#b9733f", "#9a5a30", "#734024"],
    far: ["#e89a4f", "#d9783c", "#f0b866"],
    peaks: "#c9a0d8",
    trees: ["#ff7a2f", "#ffb02e", "#e8452f", "#ffd23f"],
    trunk: "#6e4325",
    flowers: ["#ff5f5f", "#ffd23f", "#ff9f3f", "#ffffff"],
    water: "#3aa8e8",
    rock: "#a08ab5",
    sun: 0xffd9b0,
    hemi: [0xfff0e0, 0xd9a050],
    tower: ["#ff8f8f", "#8fb8ff"],
  },
  snow: {
    sky: ["#6f8fff", "#b9ccff", "#eef3ff"],
    fog: "#e2eaff",
    grass: "#f8fbff",
    grass2: "#e8f1ff",
    lip: "#dbe8fa",
    dirt: ["#9eb2d4", "#8197c0", "#64799f"],
    far: ["#dfe9fb", "#cbdaf5", "#f2f6ff"],
    peaks: "#b8c8ef",
    trees: ["#2e8a64", "#3a9c72", "#25764f"],
    trunk: "#6e4a32",
    flowers: ["#ff6f91", "#7fd6ff", "#ffffff"],
    water: "#5fc8ff",
    rock: "#9aa6c8",
    sun: 0xf2f4ff,
    hemi: [0xffffff, 0xb8c8f0],
    tower: ["#b89cff", "#ff9fc4"],
    snow: true,
  },
};

// Предсказуемый «случай» для расстановки деревьев: уровень всегда выглядит одинаково
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Печать на конверте: круглая марка-штемпель
export function stampTexture(color = "#ff4f6d") {
  return canvasTexture(128, 128, (x) => {
    x.fillStyle = color;
    x.beginPath();
    x.arc(64, 64, 60, 0, 7);
    x.fill();
    x.strokeStyle = "#ffffff";
    x.lineWidth = 5;
    x.setLineDash([9, 7]);
    x.beginPath();
    x.arc(64, 64, 50, 0, 7);
    x.stroke();
    x.setLineDash([]);
    // Конвертик
    x.fillStyle = "#ffffff";
    x.fillRect(36, 44, 56, 40);
    x.strokeStyle = color;
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(38, 46);
    x.lineTo(64, 68);
    x.lineTo(90, 46);
    x.stroke();
  });
}
const glowTex = canvasTexture(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
});
const glowSprite = (color, size, opacity = 0.9) => {
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
};

// ---------- Ёжик в вагончике и другие вагончики ----------
function hedgehog() {
  const g = new T.Group();
  const fur = matte("#9a6b4a", { roughness: 0.9 }),
    spike = matte("#5a3a28", { roughness: 0.7 }),
    face = matte("#f2d2aa", { roughness: 0.7 });
  const body = new T.Mesh(new T.SphereGeometry(0.27, 24, 18), fur);
  body.scale.set(1, 0.95, 0.95);
  g.add(body);
  // Иголки — на спине и макушке
  const cone = new T.ConeGeometry(0.045, 0.2, 6);
  for (let k = 0; k < 46; k++) {
    const u = k / 46,
      a = u * pie * 9,
      polar = 0.25 + u * 1.25;
    const dir = new T.Vector3(-Math.cos(polar) * 0.9 - 0.2, Math.sin(polar) * 0.9 + 0.15, Math.sin(a) * 0.75).normalize();
    if (dir.x > 0.25) continue;
    const m = new T.Mesh(cone, spike);
    m.position.copy(dir).multiplyScalar(0.26);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    g.add(m);
  }
  // Мордочка смотрит вперёд-вбок, к зрителю
  const head = new T.Group();
  head.position.set(0.14, 0.05, 0.08);
  g.add(head);
  const muzzle = new T.Mesh(new T.SphereGeometry(0.15, 20, 14), face);
  muzzle.scale.set(1.25, 0.9, 1);
  muzzle.position.set(0.08, -0.02, 0.06);
  head.add(muzzle);
  const nose = new T.Mesh(new T.SphereGeometry(0.045, 14, 10), glossy("#2a1a1e", { roughness: 0.2 }));
  nose.position.set(0.25, 0.0, 0.08);
  head.add(nose);
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(0.045, 14, 10), glossy("#1d1420", { roughness: 0.15 }));
    eye.position.set(0.1, 0.08, 0.06 + s * 0.08);
    head.add(eye);
    const shine = new T.Mesh(new T.SphereGeometry(0.014, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(0.13, 0.1, 0.08 + s * 0.08);
    head.add(shine);
    (head.userData.eyes ||= []).push(eye, shine);
    const cheek = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), matte("#ff9fb0"));
    cheek.scale.set(1, 0.6, 0.4);
    cheek.position.set(0.12, -0.03, 0.12 + s * 0.06);
    head.add(cheek);
  }
  // Фуражка почтальона
  const cap = new T.Group();
  cap.position.set(0.02, 0.22, 0);
  cap.rotation.z = -0.15;
  const top = new T.Mesh(new T.CylinderGeometry(0.16, 0.15, 0.1, 24), glossy("#2f6bff"));
  cap.add(top);
  const visor = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.02, 20, 1, false, -pie / 2, pie), glossy("#1d3f99"));
  visor.position.set(0.1, -0.04, 0);
  cap.add(visor);
  const badge = new T.Mesh(new T.CircleGeometry(0.035, 16), glossy("#ffd23f", { metalness: 0.6, roughness: 0.25 }));
  badge.position.set(0.13, 0.01, 0.07);
  badge.rotation.y = 1.0;
  cap.add(badge);
  g.add(cap);
  g.userData.head = head;
  return g;
}
function parcel() {
  const g = new T.Group();
  const box = new T.Mesh(new RoundedBoxGeometry(0.38, 0.32, 0.36, 2, 0.04), matte("#d9a066", { roughness: 0.75 }));
  g.add(box);
  const string = matte("#ff4f6d", { roughness: 0.5 });
  g.add(new T.Mesh(new T.BoxGeometry(0.4, 0.33, 0.05), string));
  g.add(new T.Mesh(new T.BoxGeometry(0.05, 0.33, 0.38), string));
  const bow = new T.Mesh(new T.TorusGeometry(0.05, 0.02, 8, 16), string);
  bow.position.y = 0.19;
  g.add(bow);
  return g;
}
// Вагончики: id → построение кузова. Колёса, ёжик и посылка у всех общие
export const SKINS = [
  { id: "cart", name: "Вагончик", need: 0 },
  { id: "train", name: "Паровозик", need: 6 },
  { id: "rocket", name: "Ракета", need: 12 },
  { id: "rainbow", name: "Радужная карета", need: 20 },
];
function wagonModel(skin) {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  const wheels = [];
  const wheelMat = glossy("#33313f", { roughness: 0.4 }),
    hub = glossy("#e8eef7", { metalness: 0.8, roughness: 0.2 });
  const wheel = new T.CylinderGeometry(0.13, 0.13, 0.08, 20);
  wheel.rotateX(pie / 2);
  for (const x of [-0.3, 0.3])
    for (const z of [-0.27, 0.27]) {
      const w = new T.Group();
      w.position.set(x, -0.2, z);
      w.add(new T.Mesh(wheel, wheelMat));
      const h = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.1, 12).rotateX(pie / 2), hub);
      w.add(h);
      const spoke = new T.Mesh(new T.BoxGeometry(0.2, 0.025, 0.09), hub);
      w.add(spoke);
      body.add(w);
      wheels.push(w);
    }
  let smoke = null,
    flame = null;
  if (skin === "train") {
    const red = glossy("#ff4f6d"),
      dark = glossy("#2b2b3d");
    const boiler = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.62, 24).rotateZ(pie / 2), red);
    boiler.position.set(0.12, 0.02, 0);
    body.add(boiler);
    const base = new T.Mesh(new RoundedBoxGeometry(1.0, 0.16, 0.6, 2, 0.05), dark);
    base.position.y = -0.14;
    body.add(base);
    const chimney = new T.Mesh(new T.CylinderGeometry(0.08, 0.06, 0.28, 16), dark);
    chimney.position.set(0.3, 0.3, 0);
    body.add(chimney);
    const cabin = new T.Mesh(new RoundedBoxGeometry(0.34, 0.42, 0.56, 2, 0.05), glossy("#2f6bff"));
    cabin.position.set(-0.32, 0.12, 0);
    body.add(cabin);
    const bell = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), glossy("#ffd23f", { metalness: 0.7, roughness: 0.2 }));
    bell.position.set(0.05, 0.25, 0);
    body.add(bell);
    smoke = chimney;
  } else if (skin === "rocket") {
    const white = glossy("#f4f6ff"),
      red = glossy("#ff4f6d");
    const hull = new T.Mesh(new T.CapsuleGeometry(0.22, 0.55, 8, 20).rotateZ(-pie / 2), white);
    hull.position.y = 0.02;
    body.add(hull);
    const nose = new T.Mesh(new T.ConeGeometry(0.2, 0.3, 20).rotateZ(-pie / 2), red);
    nose.position.set(0.55, 0.02, 0);
    body.add(nose);
    for (const s of [-1, 1]) {
      const fin = new T.Mesh(new T.BoxGeometry(0.22, 0.2, 0.03), red);
      fin.position.set(-0.32, 0.14 * s + 0.02, 0);
      fin.rotation.z = s * 0.5;
      body.add(fin);
    }
    const window = new T.Mesh(new T.CircleGeometry(0.08, 20), glossy("#7fe8ff", { emissive: "#3fb6ff", emissiveIntensity: 0.4 }));
    window.position.set(0.2, 0.08, 0.215);
    body.add(window);
    flame = glowSprite("#ff9a3f", 0.6, 0.95);
    flame.position.set(-0.6, 0.02, 0);
    body.add(flame);
  } else if (skin === "rainbow") {
    const colors = ["#ff4f6d", "#ffb02e", "#ffe14d", "#3fdc7a", "#3f8cff", "#9b5cff"];
    colors.forEach((c, i) => {
      const band = new T.Mesh(new RoundedBoxGeometry(0.9, 0.07, 0.6, 2, 0.03), glossy(c, { emissive: c, emissiveIntensity: 0.15 }));
      band.position.y = -0.14 + i * 0.07;
      body.add(band);
    });
    const crown = new T.Mesh(new T.TorusGeometry(0.35, 0.03, 8, 40, pie), glossy("#ffd23f", { metalness: 0.8, roughness: 0.2 }));
    crown.position.set(0, 0.24, 0);
    body.add(crown);
  } else {
    const red = glossy("#ff4f6d");
    const box = new T.Mesh(new RoundedBoxGeometry(0.95, 0.36, 0.62, 3, 0.07), red);
    box.position.y = -0.02;
    body.add(box);
    const band = new T.Mesh(new RoundedBoxGeometry(0.97, 0.07, 0.64, 2, 0.03), glossy("#ffd23f", { metalness: 0.5, roughness: 0.25 }));
    band.position.y = 0.07;
    body.add(band);
    const sign = new T.Mesh(new T.CircleGeometry(0.1, 20), new T.MeshBasicMaterial({ map: stampTexture("#2f6bff") }));
    sign.position.set(0, -0.02, 0.315);
    body.add(sign);
  }
  const hog = hedgehog();
  hog.position.set(0.12, skin === "rocket" ? 0.36 : 0.32, 0);
  hog.scale.setScalar(skin === "rocket" ? 0.85 : 1);
  body.add(hog);
  const box = parcel();
  box.position.set(-0.24, skin === "train" ? 0.44 : 0.3, 0);
  box.scale.setScalar(0.85);
  body.add(box);
  body.scale.setScalar(1.4);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return { group: g, body, wheels, head: hog.userData.head, parcel: box, smoke, flame };
}

// ---------- Мир ----------
export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    // Нейтральная кривая бережёт насыщенность цветов (ACES делала картинку бледной)
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.camera = new T.PerspectiveCamera(30, 1, 0.5, 400);
    this.hemi = new T.HemisphereLight(0xffffff, 0x88cc88, 1.1);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff1d6, 2.4);
    this.sun.position.set(6, 24, 18);
    this.sun.target.position.set(12, 6, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.scene.fog = new T.Fog(0xd6f1ff, 75, 230);
    this.level = new T.Group();
    this.railGroup = new T.Group();
    this.fx = new T.Group();
    this.scene.add(this.level, this.railGroup, this.fx);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.makeParticles();
    this.makeHelpers();
    this.raycaster = new T.Raycaster();
    this.plane = new T.Plane(new T.Vector3(0, 0, 1), 0);
    // Свечение (bloom): сияют кольца, огоньки, ускоритель, салют. На медленном устройстве выключается само
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Порог выше яркости освещённых стен и снега: светятся только огоньки, кольца, искры
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.35, 1.7);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
    this.focus = null;
    this.resize = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
      this.fit(w / h);
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    this.onFrame = null;
    this.last = 0;
    this.shakeAmp = 0;
    this.renderer.setAnimationLoop((ms) => this.frame(ms));
  }
  // Поле 24 × 14 целиком на экране при любой форме окна, камера чуть сверху
  fit(aspect) {
    const W = 24.8,
      H = 15.0,
      cx = 12,
      cy = 7.4;
    const fov = 30,
      tan = Math.tan(T.MathUtils.degToRad(fov / 2));
    const d = Math.max(H / 2 / tan, W / 2 / tan / aspect) * 1.02;
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.position.set(cx, cy + d * 0.14, d);
    this.camera.lookAt(cx, cy + 0.35, 0);
    this.camera.updateProjectionMatrix();
    this.home = this.camera.position.clone();
    this.homeQ = this.camera.quaternion.clone();
    if (this.view && !this.focus) {
      this.view.p.copy(this.home);
      this.view.q.copy(this.homeQ);
    }
  }
  // Точка игровой плоскости под пальцем
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new T.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, p)) return null;
    return [p.x, p.y];
  }
  screen([x, y], z = 0) {
    const v = new T.Vector3(x, y, z).project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  // Сколько пикселей экрана в одной единице поля
  pixelsPerUnit() {
    const a = this.screen([10, 7]),
      b = this.screen([11, 7]);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.time, dur: this.motion.matches ? seconds * 0.5 : seconds, update, done }));
  }

  // ---------- Уровень ----------
  setLevel(level) {
    this.clearLevel();
    this.data = level;
    const th = THEMES[level.world];
    this.theme = th;
    const R = rng((Number(level.id) || 17) * 7919 + 13);
    // Небо и свет
    this.scene.background = canvasTexture(4, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, th.sky[0]);
      g.addColorStop(0.55, th.sky[1]);
      g.addColorStop(1, th.sky[2]);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    });
    this.scene.fog.color.set(th.fog);
    this.hemi.color.setHex(th.hemi[0]);
    this.hemi.groundColor.setHex(th.hemi[1]);
    this.sun.color.setHex(th.sun);
    const L = this.level;
    L.add(this.terrain(level, th, R));
    for (const w of level.water) L.add(this.water(w, th));
    for (const r of level.rocks) L.add(this.rock(r, th));
    if (level.tunnel) L.add(this.tunnel(level.tunnel, th));
    for (const z of level.nodraw) L.add(this.noDraw(z));
    this.backdrop(level, th, R);
    this.decor(level, th, R);
    this.stations(level, th);
    if (level.boost) L.add(this.booster(level.boost));
    this.rings = level.rings.map((p, i) => {
      const r = this.ring(p, i);
      L.add(r);
      return r;
    });
    this.addFixedRails(level);
    if (th.snow) this.makeSnow();
    else if (level.world === "autumn") this.makeLeaves(th);
    else this.makeButterflies();
  }
  clearLevel() {
    this.scene.background?.dispose?.();
    const materials = new Set();
    for (const g of [this.level, this.railGroup]) {
      g.traverse((o) => {
        if (o.userData.shared) return;
        o.geometry?.dispose();
        if (o.isInstancedMesh) o.dispose();
        for (const material of [o.material].flat()) if (material) materials.add(material);
      });
      g.clear();
    }
    const textures = new Set();
    for (const material of materials) {
      if (material.map && material.map !== glowTex) textures.add(material.map);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    this.weather = null;
    this.flock = null;
    this.birds = [];
    this.airBalloons = [];
    this.gift = null;
    this.bubble = null;
    this.fireworks = 0;
    this.noDrawMeshes = [];
    this.rings = [];
    this.recipient = null;
    this.flags = [];
    this.waters = [];
    this.clouds = [];
    this.boostChevrons = null;
  }
  terrain(level, th, R) {
    const g = new T.Group();
    const xs = [];
    for (let x = -16; x <= 40; x += 0.2) xs.push(+x.toFixed(2));
    const zs = [FRONT, FRONT - 0.25, 1.2, 0, -1.2, -3, -6, -10, -16, -26];
    const pos = [],
      col = [],
      idx = [];
    const c1 = new T.Color(th.grass),
      c2 = new T.Color(th.grass2),
      c = new T.Color();
    zs.forEach((z, j) => {
      for (const x of xs) {
        let y = groundAt(level, x);
        // Вдали земля плавно волнуется — дальние холмики
        if (z < -2) y += Math.max(0, Math.sin(x * 0.35 + z * 0.4) * 0.6 + Math.sin(x * 0.9 + z) * 0.25) * Math.min(1, (-2 - z) / 6);
        if (z === FRONT) y -= 0.08;
        pos.push(x, y, z);
        c.copy(c1).lerp(c2, 0.5 + 0.5 * Math.sin(x * 1.7 + z * 2.3) * Math.cos(x * 0.6 - z));
        col.push(c.r, c.g, c.b);
      }
    });
    const n = xs.length;
    for (let j = 0; j < zs.length - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i,
          b = a + n;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const top = new T.BufferGeometry();
    top.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    top.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    top.setIndex(idx);
    top.computeVertexNormals();
    const topMesh = new T.Mesh(top, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    topMesh.receiveShadow = true;
    g.add(topMesh);
    // Разрез земли спереди: сетка, чтобы нарисовать полосы-слои почвы
    {
      const rows = 26,
        fpos = [],
        fcol = [],
        fidx = [];
      const d0 = new T.Color(th.dirt[0]),
        d1 = new T.Color(th.dirt[1]),
        d2 = new T.Color(th.dirt[2]);
      xs.forEach((x) => {
        const top = groundAt(level, x) - 0.08;
        for (let r = 0; r <= rows; r++) {
          const y = top + ((-7 - top) * r) / rows,
            depth = top - y;
          // Слои: тёмная полоса под травой, светлые и тёмные пласты глубже, волнистые
          const band = Math.sin((depth + Math.sin(x * 0.7) * 0.25) * 3.1) * 0.5 + 0.5;
          c.copy(d0).lerp(d1, clamp(depth / 2.2, 0, 1)).lerp(d2, clamp((depth - 2.2) / 4, 0, 1));
          c.lerp(band > 0.72 ? d0 : d2, band > 0.72 ? 0.18 : band < 0.2 ? 0.16 : 0);
          if (depth < 0.18) c.lerp(new T.Color(th.lip), 0.5 - depth * 2.5);
          fpos.push(x, y, FRONT);
          fcol.push(c.r, c.g, c.b);
        }
      });
      for (let i = 0; i < xs.length - 1; i++)
        for (let r = 0; r < rows; r++) {
          const a = i * (rows + 1) + r,
            b = a + rows + 1;
          fidx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      const face = new T.BufferGeometry();
      face.setAttribute("position", new T.Float32BufferAttribute(fpos, 3));
      face.setAttribute("color", new T.Float32BufferAttribute(fcol, 3));
      face.setIndex(fidx);
      face.computeVertexNormals();
      const faceMesh = new T.Mesh(face, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide }));
      g.add(faceMesh);
    }
    // Камешки в разрезе
    const pebble = new T.IcosahedronGeometry(0.16, 0);
    const pm = matte(th.dirt[2], { flatShading: true });
    for (let k = 0; k < 70; k++) {
      const x = -1 + R() * 26,
        y = groundAt(level, x) - 0.5 - R() * 5;
      if (y < -1.5) continue;
      const m = new T.Mesh(pebble, pm);
      m.position.set(x, y, FRONT + 0.02);
      m.scale.set(0.6 + R(), 0.4 + R() * 0.5, 0.15);
      m.rotation.z = R() * 3;
      g.add(m);
    }
    // Кристаллы и корешки в разрезе — маленькие находки для глаз
    const crystal = new T.OctahedronGeometry(0.2, 0);
    for (let k = 0; k < 9; k++) {
      const x = 1 + R() * 22,
        y = groundAt(level, x) - 1.2 - R() * 4;
      if (y < -1.4) continue;
      const color = ["#7fe8ff", "#ff7ad9", "#b47cff", "#7dff9a"][k % 4];
      const m = new T.Mesh(crystal, glossy(color, { emissive: color, emissiveIntensity: 2.6, flatShading: true }));
      m.position.set(x, y, FRONT + 0.05);
      m.scale.set(0.7, 1.3, 0.4);
      m.rotation.z = (R() - 0.5) * 0.8;
      g.add(m);
    }
    if (!th.snow)
      for (let k = 0; k < 7; k++) {
        const x = R() * 24,
          y = groundAt(level, x) - 0.12;
        const pts = [];
        for (let j = 0; j < 6; j++) pts.push(new T.Vector3(x + Math.sin(j * 1.3 + k) * 0.25 + j * 0.08, y - j * 0.22, FRONT + 0.03));
        const root = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 16, 0.025, 5), matte(th.dirt[2]));
        g.add(root);
      }
    // Травяной бортик по краю разреза
    const lip = [];
    for (const x of xs) lip.push(new T.Vector3(x, groundAt(level, x) - 0.02, FRONT - 0.04));
    const lipMesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(lip), xs.length, 0.13, 8), matte(th.lip, { roughness: 0.85 }));
    lipMesh.receiveShadow = true;
    g.add(lipMesh);
    // Пучки травы (или снежные кочки) по всей поверхности
    if (!th.snow) {
      const blade = new T.ConeGeometry(0.045, 0.34, 4);
      blade.translate(0, 0.17, 0);
      const n = 520,
        tufts = new T.InstancedMesh(blade, new T.MeshStandardMaterial({ roughness: 0.8 }), n);
      const d = new T.Object3D(),
        cg = new T.Color(th.grass),
        cl = new T.Color(th.lip),
        cc2 = new T.Color();
      let k = 0;
      for (let i = 0; i < n * 2 && k < n; i++) {
        const x = -4 + R() * 32,
          z = FRONT - 0.2 - R() * 7;
        if (level.water.some((w) => x > w[0] - 0.4 && x < w[1] + 0.4)) continue;
        for (let b = 0; b < 3 && k < n; b++) {
          d.position.set(x + (R() - 0.5) * 0.12, groundAt(level, x) - 0.02, z + (R() - 0.5) * 0.12);
          d.rotation.set((R() - 0.5) * 0.7, R() * 3, (R() - 0.5) * 0.7);
          d.scale.setScalar(0.7 + R() * 0.8);
          d.updateMatrix();
          tufts.setMatrixAt(k, d.matrix);
          tufts.setColorAt(k, cc2.copy(cg).lerp(cl, R()));
          k++;
        }
      }
      tufts.count = k;
      tufts.receiveShadow = true;
      g.add(tufts);
    }
    return g;
  }
  water([x0, x1, y], th) {
    const g = new T.Group();
    const w = x1 - x0 + 0.6,
      geo = new T.PlaneGeometry(w, FRONT + 26, Math.ceil(w * 4), 30);
    geo.rotateX(-pie / 2);
    const m = new T.Mesh(
      geo,
      new T.MeshPhysicalMaterial({ color: th.water, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.86, clearcoat: 1, emissive: th.water, emissiveIntensity: 0.12 }),
    );
    m.position.set((x0 + x1) / 2, y, (FRONT - 26) / 2);
    m.receiveShadow = true;
    m.userData.base = Float32Array.from(geo.attributes.position.array);
    g.add(m);
    // Передняя стенка воды в разрезе
    const front = new T.Mesh(new T.PlaneGeometry(w, y + 7), new T.MeshPhysicalMaterial({ color: th.water, roughness: 0.2, transparent: true, opacity: 0.55 }));
    front.position.set((x0 + x1) / 2, (y - 7) / 2, FRONT + 0.01);
    g.add(front);
    this.waters.push(m);
    return g;
  }
  rock(poly, th) {
    const shape = new T.Shape(poly.map(([x, y]) => new T.Vector2(x, y)));
    const geo = new T.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: true, bevelSize: 0.22, bevelThickness: 0.3, bevelSegments: 3, curveSegments: 4 });
    geo.translate(0, 0, -2.2);
    // Неровности: точки сдвигаются по шуму, цвет — светлее к верху
    const pa = geo.attributes.position,
      cols = [],
      base = new T.Color(th.rock),
      dark = base.clone().multiplyScalar(0.62),
      light = base.clone().lerp(new T.Color("#ffffff"), 0.25),
      cc = new T.Color();
    const ys = poly.map((p) => p[1]),
      lo = Math.min(...ys),
      hi = Math.max(...ys);
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i),
        y = pa.getY(i),
        z = pa.getZ(i);
      const n = Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7 - z * 1.9);
      if (z < 0.5 && z > -2.1) pa.setZ(i, z + n * 0.18);
      const f = (y - lo) / Math.max(0.1, hi - lo);
      cc.copy(dark).lerp(light, clamp(f + n * 0.12, 0, 1));
      cols.push(cc.r, cc.g, cc.b);
    }
    geo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
    m.castShadow = m.receiveShadow = true;
    const g = new T.Group();
    g.add(m);
    // Кристаллы на камне — для красоты
    const R = rng(poly.length * 31 + Math.round(poly[0][0] * 10));
    const gem = new T.OctahedronGeometry(0.22, 0);
    for (let k = 0; k < 5; k++) {
      const p = poly[Math.floor(R() * poly.length)];
      const color = ["#7fe8ff", "#ff7ad9", "#b47cff"][k % 3];
      const c = new T.Mesh(gem, glossy(color, { emissive: color, emissiveIntensity: 0.5, flatShading: true }));
      c.position.set(p[0] + (R() - 0.5) * 0.6, p[1] + (R() - 0.5) * 0.6, 0.7);
      c.scale.set(0.6, 1.2, 0.6);
      c.rotation.z = R() * 2;
      g.add(c);
    }
    return g;
  }
  // Тоннель: тёмная глубина за рельсами, фонарики и каменная арка спереди
  tunnel([x0, x1, y0, y1], th) {
    const g = new T.Group();
    const back = new T.Mesh(new T.PlaneGeometry(x1 - x0, y1 - y0 + 0.4), new T.MeshStandardMaterial({ color: "#3a2a4a", roughness: 1 }));
    back.position.set((x0 + x1) / 2, (y0 + y1) / 2, -1.9);
    g.add(back);
    for (const z of [-1.9, 0.6]) {
      for (const x of [x0 + 0.5, x1 - 0.5]) {
        const lamp = new T.Mesh(new T.SphereGeometry(0.12, 12, 8), new T.MeshBasicMaterial({ color: "#ffe28a" }));
        lamp.position.set(x, y1 - 0.6, z === 0.6 ? -1.2 : -1.7);
        g.add(lamp);
        const glow = glowSprite("#ffd86b", 1.4, 0.8);
        glow.position.copy(lamp.position);
        g.add(glow);
      }
    }
    const light = new T.PointLight(0xffd59a, 6, 7, 1.5);
    light.position.set((x0 + x1) / 2, y1 - 0.8, -0.6);
    g.add(light);
    return g;
  }
  noDraw([x0, y0, x1, y1]) {
    const tex = canvasTexture(64, 64, (x) => {
      x.fillStyle = "rgba(255,255,255,0.0)";
      x.fillRect(0, 0, 64, 64);
      x.strokeStyle = "rgba(255,90,110,0.55)";
      x.lineWidth = 12;
      for (let k = -64; k < 128; k += 32) {
        x.beginPath();
        x.moveTo(k, 64);
        x.lineTo(k + 64, 0);
        x.stroke();
      }
    });
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    const top = Math.min(y1, 15.5),
      bottom = Math.max(y0, -1);
    tex.repeat.set((x1 - x0) / 1.2, (top - bottom) / 1.2);
    const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, top - bottom), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false }));
    m.position.set((x0 + x1) / 2, (top + bottom) / 2, 0.05);
    m.userData.nodraw = true;
    const g = new T.Group();
    g.add(m);
    // Знак «рисовать нельзя»: перечёркнутый карандаш
    const sign = new T.Sprite(
      new T.SpriteMaterial({
        map: canvasTexture(128, 128, (x) => {
          x.fillStyle = "#ffffff";
          x.beginPath();
          x.arc(64, 64, 58, 0, 7);
          x.fill();
          x.font = "64px sans-serif";
          x.textAlign = "center";
          x.textBaseline = "middle";
          x.fillText("✏️", 64, 68);
          x.strokeStyle = "#ff4f6d";
          x.lineWidth = 12;
          x.beginPath();
          x.arc(64, 64, 52, 0, 7);
          x.moveTo(27, 27);
          x.lineTo(101, 101);
          x.stroke();
        }),
        depthWrite: false,
      }),
    );
    sign.scale.setScalar(1.3);
    sign.position.set((x0 + x1) / 2, 12.6, 0.3);
    g.add(sign);
    this.noDrawMeshes = [...(this.noDrawMeshes || []), m];
    return g;
  }
  // Предупредить: палец в запретной зоне
  flashNoDraw() {
    for (const m of this.noDrawMeshes || []) {
      m.material.opacity = 0.75;
      this.tween(0.5, (p) => (m.material.opacity = 0.75 - 0.4 * p));
    }
  }
  backdrop(level, th, R) {
    const L = this.level;
    // Дальние горы и холмы
    for (let k = 0; k < 9; k++) {
      const x = -14 + k * 6.5 + R() * 3,
        h = 9 + R() * 9;
      const m = new T.Mesh(new T.ConeGeometry(5 + R() * 3, h, 6 + Math.floor(R() * 3)), matte(th.peaks, { flatShading: true }));
      m.position.set(x, h / 2 - 1, -55 - R() * 15);
      L.add(m);
      if (level.world !== "autumn") {
        const cap = new T.Mesh(new T.ConeGeometry(2.2, h * 0.3, 7), matte("#ffffff", { flatShading: true }));
        cap.position.set(x, h - 1 - h * 0.15 + 0.05, m.position.z + 0.5);
        L.add(cap);
      }
    }
    for (let k = 0; k < 8; k++) {
      const m = new T.Mesh(new T.SphereGeometry(6 + R() * 4, 20, 12), matte(th.far[k % th.far.length]));
      m.scale.y = 0.45;
      m.position.set(-10 + k * 6 + R() * 2, -1.5, -32 - R() * 8);
      L.add(m);
    }
    // Облака
    for (let k = 0; k < 7; k++) {
      const cloud = new T.Group();
      for (let p = 0; p < 5; p++) {
        const s = new T.Mesh(new T.SphereGeometry(1 + R() * 0.8, 16, 12), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.25 }));
        s.position.set(p * 1.1 - 2.2, Math.sin(p) * 0.4, R() * 0.5);
        s.scale.y = 0.75;
        cloud.add(s);
      }
      cloud.position.set(-8 + k * 6.5 + R() * 3, 15 + R() * 5, -22 - R() * 14);
      cloud.userData.speed = 0.25 + R() * 0.35;
      L.add(cloud);
      this.clouds.push(cloud);
    }
    // Стайка птиц и воздушные шары вдали
    this.birds = [];
    for (let k = 0; k < 6; k++) {
      const b = new T.Group();
      for (const sgn of [-1, 1]) {
        const wing = new T.Mesh(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(sgn * 0.5, 0.1, 0), new T.Vector3(sgn * 0.12, 0, 0.18)]), new T.MeshBasicMaterial({ color: "#4a4a6a", side: T.DoubleSide }));
        wing.userData.s = sgn;
        b.add(wing);
      }
      b.userData = { off: new T.Vector3(-k * 0.7, -Math.abs(k - 2.5) * 0.35, k * 0.3), ph: k };
      L.add(b);
      this.birds.push(b);
    }
    this.flock = { x: -10 - R() * 10, y: 13 + R() * 3, z: -18 };
    this.airBalloons = [];
    const stripes = [["#ff4f6d", "#ffd23f"], ["#3f8cff", "#ffffff"], ["#9b5cff", "#7dff9a"]];
    for (let k = 0; k < 3; k++) {
      const b = new T.Group();
      const tex = canvasTexture(64, 16, (x) => {
        for (let i = 0; i < 8; i++) {
          x.fillStyle = stripes[k][i % 2];
          x.fillRect(i * 8, 0, 8, 16);
        }
      });
      const env = new T.Mesh(new T.SphereGeometry(1.1, 24, 16), new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      env.scale.set(1, 1.15, 1);
      b.add(env);
      const basket = new T.Mesh(new T.CylinderGeometry(0.28, 0.22, 0.32, 10), matte("#a8743f"));
      basket.position.y = -1.75;
      b.add(basket);
      for (const sx of [-1, 1]) {
        const rope = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.6, 4), matte("#5a3a28"));
        rope.position.set(sx * 0.22, -1.42, 0);
        b.add(rope);
      }
      b.position.set(-4 + k * 13 + R() * 4, 12 + R() * 4, -26 - R() * 10);
      b.userData = { y: b.position.y, ph: R() * 6 };
      L.add(b);
      this.airBalloons.push(b);
    }
    // Солнце
    const sun = glowSprite("#fff4c0", 9, 0.9);
    sun.position.set(27, 20, -45);
    L.add(sun);
    const disc = new T.Mesh(new T.CircleGeometry(1.6, 32), new T.MeshBasicMaterial({ color: "#fff7d6", fog: false }));
    disc.position.copy(sun.position);
    L.add(disc);
  }
  tree(th, R, kind) {
    const g = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(0.1, 0.14, 0.9, 8), matte(th.trunk));
    trunk.position.y = 0.45;
    g.add(trunk);
    const color = th.trees[Math.floor(R() * th.trees.length)];
    if (kind === "pine") {
      for (let k = 0; k < 3; k++) {
        const c = new T.Mesh(new T.ConeGeometry(0.75 - k * 0.18, 0.9, 8), matte(color, { flatShading: true }));
        c.position.y = 1.0 + k * 0.5;
        g.add(c);
        if (th.snow) {
          const s = new T.Mesh(new T.ConeGeometry(0.42 - k * 0.1, 0.35, 8), matte("#ffffff"));
          s.position.y = 1.32 + k * 0.5;
          g.add(s);
        }
      }
    } else {
      const crown = new T.Mesh(new T.IcosahedronGeometry(0.75, 1), matte(color, { flatShading: true }));
      crown.position.y = 1.35;
      crown.scale.set(1, 0.95, 1);
      g.add(crown);
      const c2 = new T.Mesh(new T.IcosahedronGeometry(0.5, 1), matte(color, { flatShading: true }));
      c2.position.set(0.45, 1.05, 0.2);
      g.add(c2);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return g;
  }
  decor(level, th, R) {
    const L = this.level;
    const near = (x) => {
      const p = platforms(level);
      return (x > p.start[0] - 0.8 && x < p.start[1] + 0.4) || (x > p.finish[0] - 0.4 && x < p.finish[1] + 0.8);
    };
    const wet = (x) => level.water.some((w) => x > w[0] - 0.6 && x < w[1] + 0.6);
    // Деревья позади поля
    for (let k = 0; k < 34; k++) {
      const x = -6 + R() * 36,
        z = -2.6 - R() * 13;
      if (wet(x)) continue;
      const t = this.tree(th, R, th.snow || R() < 0.35 ? "pine" : "round");
      t.position.set(x, groundAt(level, x) - 0.05, z);
      t.scale.setScalar(0.8 + R() * 0.9);
      t.rotation.y = R() * 6;
      L.add(t);
    }
    // Домики деревни вдали
    for (let k = 0; k < 5; k++) {
      const x = -2 + k * 6 + R() * 3;
      if (wet(x)) continue;
      const h = new T.Group();
      const wall = new T.Mesh(new RoundedBoxGeometry(1.2, 0.9, 1, 2, 0.06), matte(["#fff3d6", "#ffe0e8", "#e0f0ff"][k % 3]));
      wall.position.y = 0.45;
      h.add(wall);
      const roof = new T.Mesh(new T.ConeGeometry(0.95, 0.7, 4), matte(["#ff6b5f", "#5f8bff", "#ffb02e"][k % 3], { flatShading: true }));
      roof.position.y = 1.25;
      roof.rotation.y = pie / 4;
      h.add(roof);
      h.position.set(x, groundAt(level, x), -9 - R() * 4);
      h.rotation.y = (R() - 0.5) * 0.6;
      h.traverse((o) => o.isMesh && (o.castShadow = true));
      L.add(h);
    }
    // Цветы, травка и грибочки на переднем крае — низкие, не загораживают рельсы
    const stem = new T.CylinderGeometry(0.015, 0.015, 0.22, 5);
    const petal = new T.SphereGeometry(0.07, 8, 6);
    for (let k = 0; k < 60; k++) {
      const x = -4 + R() * 32;
      if (wet(x) || near(x)) continue;
      const z = 0.9 + R() * 1.5,
        y = groundAt(level, x);
      const f = new T.Group();
      if (th.snow) {
        const s = new T.Mesh(new T.SphereGeometry(0.12 + R() * 0.12, 10, 8), matte("#ffffff"));
        s.scale.y = 0.5;
        f.add(s);
      } else if (R() < 0.75) {
        const st = new T.Mesh(stem, matte("#3f9f4a"));
        st.position.y = 0.11;
        f.add(st);
        const color = th.flowers[Math.floor(R() * th.flowers.length)];
        for (let p = 0; p < 5; p++) {
          const pe = new T.Mesh(petal, matte(color));
          pe.position.set(Math.cos((p / 5) * pie * 2) * 0.07, 0.24, Math.sin((p / 5) * pie * 2) * 0.07);
          pe.scale.y = 0.5;
          f.add(pe);
        }
        const mid = new T.Mesh(petal, matte("#ffd23f"));
        mid.position.y = 0.25;
        mid.scale.setScalar(0.6);
        f.add(mid);
      } else {
        const cap = new T.Mesh(new T.SphereGeometry(0.13, 12, 8, 0, pie * 2, 0, pie / 2), glossy("#ff4f4f"));
        cap.position.y = 0.16;
        f.add(cap);
        const leg = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.16, 8), matte("#fff6e6"));
        leg.position.y = 0.08;
        f.add(leg);
        for (let d = 0; d < 3; d++) {
          const dot = new T.Mesh(new T.SphereGeometry(0.025, 6, 4), matte("#ffffff"));
          dot.position.set(Math.cos(d * 2) * 0.08, 0.25, Math.sin(d * 2) * 0.08);
          f.add(dot);
        }
      }
      f.position.set(x, y, z);
      f.scale.setScalar(0.9 + R() * 0.6);
      L.add(f);
    }
  }
  // Почта (старт) и станция (финиш) на башенках
  stations(level, th) {
    const L = this.level;
    const P = platforms(level);
    const tower = (x0, x1, top, color) => {
      const g = new T.Group();
      const base = Math.min(groundAt(level, x0), groundAt(level, x1), groundAt(level, (x0 + x1) / 2)) - 0.3;
      const h = top - base;
      const body = new T.Mesh(new RoundedBoxGeometry(x1 - x0, h, 1.7, 3, 0.12), glossy(color, { roughness: 0.55, clearcoat: 0.3 }));
      body.position.set((x0 + x1) / 2, base + h / 2, -0.2);
      body.castShadow = body.receiveShadow = true;
      g.add(body);
      // Окошки и полоски по башне
      const win = new T.MeshStandardMaterial({ color: "#fff6c8", emissive: "#ffd86b", emissiveIntensity: 0.35, roughness: 0.4 });
      for (let y = base + 1; y < top - 0.8; y += 1.4) {
        const w = new T.Mesh(new RoundedBoxGeometry(0.42, 0.55, 0.06, 2, 0.08), win);
        w.position.set((x0 + x1) / 2, y, 0.67);
        g.add(w);
        const stripe = new T.Mesh(new T.BoxGeometry(x1 - x0 + 0.02, 0.08, 1.72), matte("#ffffff"));
        stripe.position.set((x0 + x1) / 2, y + 0.7, -0.2);
        g.add(stripe);
      }
      const deck = new T.Mesh(new RoundedBoxGeometry(x1 - x0 + 0.3, 0.16, 1.9, 2, 0.05), matte("#c98b55"));
      deck.position.set((x0 + x1) / 2, top - 0.12, -0.2);
      deck.castShadow = deck.receiveShadow = true;
      g.add(deck);
      return g;
    };
    const [sx0, sx1, sy] = P.start;
    L.add(tower(sx0, sx1, sy, th.tower[0]));
    // Домик почты
    const post = new T.Group();
    const wall = new T.Mesh(new RoundedBoxGeometry(1.9, 1.25, 1.0, 2, 0.08), matte("#fff3d6"));
    wall.position.y = 0.62;
    post.add(wall);
    const roofShape = new T.Shape([new T.Vector2(-1.15, 0), new T.Vector2(1.15, 0), new T.Vector2(0, 0.85)]);
    const roof = new T.Mesh(new T.ExtrudeGeometry(roofShape, { depth: 1.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 }), glossy("#ff5f5f"));
    roof.position.set(0, 1.22, -0.6);
    post.add(roof);
    const door = new T.Mesh(new RoundedBoxGeometry(0.42, 0.75, 0.06, 2, 0.06), glossy("#2f6bff"));
    door.position.set(0.45, 0.38, 0.5);
    post.add(door);
    const sign = new T.Mesh(new T.CircleGeometry(0.32, 28), new T.MeshBasicMaterial({ map: stampTexture("#ff4f6d") }));
    sign.position.set(-0.35, 0.72, 0.52);
    post.add(sign);
    post.position.set(sx0 + 0.95, sy - 0.04, -0.95);
    post.traverse((o) => o.isMesh && (o.castShadow = true));
    L.add(post);
    this.flags.push(this.flag(sx1 - 0.3, sy - 0.04, "#3fdc7a", -0.95));
    // Станция
    const [fx0, fx1, fy] = P.finish;
    L.add(tower(fx0, fx1, fy, th.tower[1]));
    const roofSt = new T.Mesh(new RoundedBoxGeometry(2.9, 0.18, 1.9, 2, 0.06), glossy("#ff9f3f"));
    roofSt.position.set((fx0 + fx1) / 2, fy + 2.0, -0.3);
    roofSt.castShadow = true;
    L.add(roofSt);
    for (const x of [fx0 + 0.15, fx1 - 0.15]) {
      const post2 = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 2.0, 10), matte("#ffffff"));
      post2.position.set(x, fy + 1.0, -1.05);
      post2.castShadow = true;
      L.add(post2);
    }
    const board = new T.Mesh(new RoundedBoxGeometry(1.5, 0.42, 0.08, 2, 0.06), new T.MeshBasicMaterial({ map: this.boardTexture() }));
    board.position.set((fx0 + fx1) / 2, fy + 2.35, 0.25);
    L.add(board);
    // Клетчатый флаг — на крыше станции
    this.flags.push(this.flag(fx1 - 0.35, fy + 2.08, "check", -0.3));
    // Почтовый ящик и зайка-получатель
    const box = new T.Group();
    const bx = new T.Mesh(new RoundedBoxGeometry(0.42, 0.5, 0.36, 2, 0.08), glossy("#2f6bff"));
    bx.position.y = 0.95;
    box.add(bx);
    const leg = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.7, 8), matte("#555"));
    leg.position.y = 0.35;
    box.add(leg);
    box.position.set(fx1 - 0.55, fy, -0.95);
    box.traverse((o) => o.isMesh && (o.castShadow = true));
    L.add(box);
    const who = (STORIES[level.story] || {}).who || "bunny";
    this.recipient = who === "squirrel" ? this.squirrel() : who === "penguin" ? this.penguin() : this.bunny();
    this.recipient.scale.setScalar(1.3);
    this.recipient.position.set(fx0 + 1.1, fy, -0.85);
    L.add(this.recipient);
  }
  boardTexture() {
    return canvasTexture(256, 72, (x, w, h) => {
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#2f6bff";
      x.font = "bold 40px system-ui, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText("СТАНЦИЯ", w / 2, h / 2 + 2);
    });
  }
  flag(x, y, color, z) {
    const g = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.9, 8), matte("#f4f4f4"));
    pole.position.y = 0.95;
    g.add(pole);
    const ball = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), glossy("#ffd23f", { metalness: 0.6 }));
    ball.position.y = 1.92;
    g.add(ball);
    const geo = new T.PlaneGeometry(0.8, 0.5, 10, 4);
    geo.translate(0.4, 0, 0);
    const mat =
      color === "check"
        ? new T.MeshStandardMaterial({
            side: T.DoubleSide,
            map: canvasTexture(64, 40, (c) => {
              for (let i = 0; i < 8; i++)
                for (let j = 0; j < 5; j++) {
                  c.fillStyle = (i + j) % 2 ? "#222" : "#fff";
                  c.fillRect(i * 8, j * 8, 8, 8);
                }
            }),
          })
        : new T.MeshStandardMaterial({ color, side: T.DoubleSide });
    const cloth = new T.Mesh(geo, mat);
    cloth.position.y = 1.6;
    cloth.userData.base = Float32Array.from(geo.attributes.position.array);
    g.add(cloth);
    g.position.set(x, y, z);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    this.level.add(g);
    return cloth;
  }
  bunny() {
    const g = new T.Group();
    const fur = matte("#ffffff", { roughness: 0.85 }),
      pink = matte("#ffb3c8");
    const body = new T.Mesh(new T.SphereGeometry(0.3, 20, 14), fur);
    body.scale.set(0.9, 1.1, 0.85);
    body.position.y = 0.33;
    g.add(body);
    const head = new T.Group();
    head.position.y = 0.82;
    g.add(head);
    head.add(new T.Mesh(new T.SphereGeometry(0.25, 20, 14), fur));
    for (const s of [-1, 1]) {
      const ear = new T.Mesh(new T.CapsuleGeometry(0.07, 0.34, 6, 10), fur);
      ear.position.set(s * 0.1, 0.36, 0);
      ear.rotation.z = -s * 0.15;
      head.add(ear);
      const inner = new T.Mesh(new T.CapsuleGeometry(0.035, 0.26, 6, 8), pink);
      inner.position.set(s * 0.1, 0.36, 0.05);
      inner.rotation.z = -s * 0.15;
      head.add(inner);
      const eye = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), glossy("#1d1420", { roughness: 0.15 }));
      eye.position.set(s * 0.09, 0.04, 0.22);
      head.add(eye);
      const cheek = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), pink);
      cheek.scale.set(1, 0.6, 0.4);
      cheek.position.set(s * 0.15, -0.05, 0.19);
      head.add(cheek);
    }
    const nose = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), pink);
    nose.position.set(0, -0.02, 0.25);
    head.add(nose);
    g.userData.head = head;
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  // Белочка: пушистый хвост, кисточки на ушах
  squirrel() {
    const g = new T.Group();
    const fur = matte("#e0823a", { roughness: 0.85 }),
      cream = matte("#fff0d8"),
      dark = matte("#8a4a22");
    const body = new T.Mesh(new T.SphereGeometry(0.28, 20, 14), fur);
    body.scale.set(0.9, 1.1, 0.85);
    body.position.y = 0.32;
    g.add(body);
    const belly = new T.Mesh(new T.SphereGeometry(0.2, 16, 12), cream);
    belly.scale.set(0.8, 1.05, 0.5);
    belly.position.set(0, 0.3, 0.17);
    g.add(belly);
    // Хвост — изогнутая цепочка пушистых шариков
    for (let k = 0; k < 9; k++) {
      const u = k / 8;
      const ball = new T.Mesh(new T.SphereGeometry(0.17 + Math.sin(u * pie) * 0.08, 14, 10), fur);
      ball.position.set(-0.05 - Math.sin(u * 2.4) * 0.38, 0.2 + u * 0.95, -0.28 - Math.sin(u * pie) * 0.1);
      g.add(ball);
    }
    const head = new T.Group();
    head.position.y = 0.78;
    g.add(head);
    head.add(new T.Mesh(new T.SphereGeometry(0.23, 20, 14), fur));
    const muzzle = new T.Mesh(new T.SphereGeometry(0.12, 14, 10), cream);
    muzzle.scale.set(1, 0.8, 0.8);
    muzzle.position.set(0, -0.06, 0.17);
    head.add(muzzle);
    for (const sx of [-1, 1]) {
      const ear = new T.Mesh(new T.ConeGeometry(0.07, 0.2, 10), fur);
      ear.position.set(sx * 0.13, 0.24, 0);
      ear.rotation.z = -sx * 0.2;
      head.add(ear);
      const tuft = new T.Mesh(new T.ConeGeometry(0.035, 0.12, 6), dark);
      tuft.position.set(sx * 0.15, 0.37, 0);
      tuft.rotation.z = -sx * 0.3;
      head.add(tuft);
      const eye = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), glossy("#1d1420", { roughness: 0.15 }));
      eye.position.set(sx * 0.09, 0.04, 0.19);
      head.add(eye);
      const cheek = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), matte("#ff9fb0"));
      cheek.scale.set(1, 0.6, 0.4);
      cheek.position.set(sx * 0.15, -0.04, 0.17);
      head.add(cheek);
    }
    const nose = new T.Mesh(new T.SphereGeometry(0.03, 10, 8), matte("#5a2a1a"));
    nose.position.set(0, -0.02, 0.27);
    head.add(nose);
    g.userData.head = head;
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  // Пингвинёнок: круглый, с белым животиком и оранжевым клювиком
  penguin() {
    const g = new T.Group();
    const black = glossy("#2b2f45", { roughness: 0.45, clearcoat: 0.4 }),
      white = matte("#ffffff"),
      orange = glossy("#ff9a2f");
    const body = new T.Mesh(new T.SphereGeometry(0.32, 22, 16), black);
    body.scale.set(0.95, 1.2, 0.9);
    body.position.y = 0.38;
    g.add(body);
    const belly = new T.Mesh(new T.SphereGeometry(0.26, 18, 14), white);
    belly.scale.set(0.85, 1.1, 0.6);
    belly.position.set(0, 0.34, 0.14);
    g.add(belly);
    for (const sx of [-1, 1]) {
      const wing = new T.Mesh(new T.SphereGeometry(0.12, 12, 10), black);
      wing.scale.set(0.35, 1.2, 0.7);
      wing.position.set(sx * 0.3, 0.4, 0);
      wing.rotation.z = sx * 0.35;
      g.add(wing);
      const foot = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), orange);
      foot.scale.set(1, 0.4, 1.4);
      foot.position.set(sx * 0.12, 0.02, 0.12);
      g.add(foot);
    }
    const head = new T.Group();
    head.position.y = 0.86;
    g.add(head);
    head.add(new T.Mesh(new T.SphereGeometry(0.22, 20, 14), black));
    const face = new T.Mesh(new T.SphereGeometry(0.17, 16, 12), white);
    face.scale.set(1.1, 0.9, 0.6);
    face.position.set(0, -0.02, 0.12);
    head.add(face);
    for (const sx of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), glossy("#1d1420", { roughness: 0.15 }));
      eye.position.set(sx * 0.07, 0.03, 0.21);
      head.add(eye);
      const cheek = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), matte("#ff9fb0"));
      cheek.scale.set(1, 0.6, 0.4);
      cheek.position.set(sx * 0.12, -0.05, 0.18);
      head.add(cheek);
    }
    const beak = new T.Mesh(new T.ConeGeometry(0.05, 0.12, 10), orange);
    beak.rotation.x = pie / 2;
    beak.position.set(0, -0.04, 0.26);
    head.add(beak);
    g.userData.head = head;
    g.userData.neck = 0.68;
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  // Что появилось у станции после доставки. animate — вырастает на глазах
  showGift(kind, animate) {
    if (this.gift) this.gift.removeFromParent();
    this.gift = null;
    this.fireworks = 0;
    if (!kind) return;
    const L = this.data,
      [fx0, fx1, fy] = platforms(L).finish;
    let gx = fx1 + 1.2;
    if (gx > 23.3) gx = fx0 - 1.4;
    const gy = groundAt(L, gx);
    const g = new T.Group();
    const grow = [];
    const add = (m, x, y, z) => {
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      grow.push(m);
      return m;
    };
    const bed = () => {
      const b = new T.Mesh(new RoundedBoxGeometry(1.8, 0.24, 0.95, 2, 0.08), matte("#7a4a2a"));
      b.position.set(gx, gy + 0.1, 0.9);
      b.receiveShadow = true;
      g.add(b);
    };
    if (kind === "garden") {
      bed();
      for (let k = 0; k < 6; k++) {
        const c = new T.Group();
        const root = new T.Mesh(new T.ConeGeometry(0.09, 0.4, 12), glossy("#ff8a1f"));
        root.rotation.x = pie;
        c.add(root);
        for (let l = 0; l < 3; l++) {
          const leaf = new T.Mesh(new T.ConeGeometry(0.035, 0.32, 6), matte("#3fbf5a"));
          leaf.position.set((l - 1) * 0.05, 0.3, 0);
          leaf.rotation.z = (l - 1) * 0.35;
          c.add(leaf);
        }
        add(c, gx - 0.65 + (k % 3) * 0.65, gy + 0.32, 0.65 + Math.floor(k / 3) * 0.45);
      }
    } else if (kind === "flowers") {
      bed();
      const colors = ["#ff4f6d", "#ffd23f", "#b47cff", "#ff8fd0", "#3f8cff", "#ff9f3f", "#ffffff"];
      for (let k = 0; k < 7; k++) {
        const f = new T.Group();
        const h = 0.4 + (k % 3) * 0.15;
        const st = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, h, 6), matte("#3f9f4a"));
        st.position.y = h / 2;
        f.add(st);
        for (let p = 0; p < 6; p++) {
          const pe = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), glossy(colors[k], { emissive: colors[k], emissiveIntensity: 0.25 }));
          pe.position.set(Math.cos((p / 6) * pie * 2) * 0.1, h, Math.sin((p / 6) * pie * 2) * 0.1);
          pe.scale.y = 0.55;
          f.add(pe);
        }
        const mid = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), matte("#ffd23f"));
        mid.position.y = h + 0.03;
        f.add(mid);
        add(f, gx - 0.75 + (k % 4) * 0.5, gy + 0.2, 0.62 + (k % 2) * 0.42);
      }
    } else if (kind === "balloons") {
      const top = new T.Vector3(fx1 - 0.3, fy + 2.05, -0.3);
      ["#ff4f6d", "#ffd23f", "#3f8cff", "#3fdc7a", "#b47cff", "#ff8fd0"].forEach((c, k) => {
        const b = new T.Mesh(new T.SphereGeometry(0.3, 18, 14), glossy(c, { emissive: c, emissiveIntensity: 0.25, roughness: 0.15 }));
        b.scale.set(1, 1.2, 1);
        const p = new T.Vector3(top.x - 0.6 + (k % 3) * 0.55, top.y + 1.1 + Math.floor(k / 3) * 0.6 + (k % 2) * 0.2, top.z + (k % 2) * 0.4);
        add(b, p.x, p.y, p.z);
        b.userData.bob = { y: p.y, ph: k };
        const str = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([p.clone().add(new T.Vector3(0, -0.36, 0)), top.clone().lerp(p, 0.4).add(new T.Vector3(0.1, -0.2, 0)), top]), 12, 0.01, 4), matte("#ffffff"));
        g.add(str);
      });
    } else if (kind === "cake") {
      const c = new T.Group();
      [["#ff8fb1", 0.36, 0.22], ["#ffffff", 0.27, 0.2], ["#ffd6e6", 0.18, 0.18]].reduce((y, [col, r, h]) => {
        const tier = new T.Mesh(new T.CylinderGeometry(r, r, h, 28), glossy(col, { roughness: 0.4 }));
        tier.position.y = y + h / 2;
        c.add(tier);
        return y + h;
      }, 0);
      for (let k = 0; k < 3; k++) {
        const candle = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.16, 8), glossy(["#3f8cff", "#3fdc7a", "#ffd23f"][k]));
        candle.position.set((k - 1) * 0.08, 0.68, 0);
        c.add(candle);
        const flame = new T.Mesh(new T.ConeGeometry(0.025, 0.07, 8), new T.MeshBasicMaterial({ color: "#ffb02e", toneMapped: false }));
        flame.position.set((k - 1) * 0.08, 0.8, 0);
        flame.material.color.multiplyScalar(2.5);
        c.add(flame);
      }
      add(c, fx0 + 0.45, fy - 0.04, -0.7);
    } else if (kind === "nuts") {
      const b = new T.Group();
      const basket = new T.Mesh(new T.CylinderGeometry(0.42, 0.32, 0.36, 20, 1, true), matte("#a8743f", { side: T.DoubleSide }));
      basket.position.y = 0.18;
      b.add(basket);
      const rim = new T.Mesh(new T.TorusGeometry(0.42, 0.04, 8, 28), matte("#8a5a35"));
      rim.rotation.x = pie / 2;
      rim.position.y = 0.36;
      b.add(rim);
      for (let k = 0; k < 9; k++) {
        const nut = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), glossy("#8a5228", { roughness: 0.5 }));
        nut.scale.set(1, 1.2, 1);
        nut.position.set(Math.cos(k * 2.1) * 0.22 * (k % 3) * 0.6, 0.36 + (k % 3) * 0.06, Math.sin(k * 2.1) * 0.2 * (k % 3) * 0.6);
        b.add(nut);
        const cap = new T.Mesh(new T.SphereGeometry(0.08, 10, 6, 0, pie * 2, 0, pie / 2), matte("#5a3a28"));
        cap.position.copy(nut.position).add(new T.Vector3(0, 0.08, 0));
        b.add(cap);
      }
      add(b, gx, gy, 0.8);
    } else if (kind === "lights" || kind === "lantern" || kind === "tree") {
      // Гирлянда: на крыше станции, в пещере или на ёлке
      const colors = ["#ff4f6d", "#ffd23f", "#3fdc7a", "#3f8cff", "#ff8fd0"];
      const bulb = (p, k, r = 0.07) => {
        const c = colors[k % colors.length];
        const m = new T.Mesh(new T.SphereGeometry(r, 10, 8), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4 }));
        add(m, p.x, p.y, p.z);
        m.userData.blink = k;
      };
      if (kind === "tree") {
        const tree = new T.Group();
        for (let l = 0; l < 4; l++) {
          const cone = new T.Mesh(new T.ConeGeometry(0.95 - l * 0.2, 0.9, 10), matte("#2e8a64", { flatShading: true }));
          cone.position.y = 0.6 + l * 0.48;
          tree.add(cone);
        }
        const trunk = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 0.4, 8), matte("#6e4a32"));
        trunk.position.y = 0.2;
        tree.add(trunk);
        const star = new T.Mesh(new T.OctahedronGeometry(0.2, 0), new T.MeshStandardMaterial({ color: "#ffd23f", emissive: "#ffd23f", emissiveIntensity: 2.5 }));
        star.position.y = 2.5;
        tree.add(star);
        add(tree, gx, gy, -0.4);
        for (let k = 0; k < 22; k++) {
          const u = k / 22,
            h = 0.4 + u * 1.8,
            r = 0.9 * (1 - u * 0.85);
          bulb(new T.Vector3(gx + Math.cos(k * 2.4) * r, gy + h, -0.4 + Math.sin(k * 2.4) * r), k, 0.06);
        }
      } else if (kind === "lantern" && L.tunnel) {
        const [x0, x1, , y1] = L.tunnel;
        for (let k = 0; k < 7; k++) {
          const x = x0 + 0.6 + (k * (x1 - x0 - 1.2)) / 6;
          const lamp = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.3, 12), new T.MeshStandardMaterial({ color: colors[k % 5], emissive: colors[k % 5], emissiveIntensity: 1.8 }));
          add(lamp, x, y1 - 0.75 - (k % 2) * 0.15, -1.2);
          const glow = glowSprite(colors[k % 5], 1.6, 0.7);
          glow.position.set(x, y1 - 0.75, -1.1);
          g.add(glow);
        }
        const light = new T.PointLight(0xffe0a0, 14, 9, 1.4);
        light.position.set((x0 + x1) / 2, y1 - 1, 0.5);
        g.add(light);
      } else {
        // Гирлянда по краю крыши станции, провисает дугами
        for (let k = 0; k <= 16; k++) {
          const u = k / 16,
            x = fx0 - 0.1 + u * (fx1 - fx0 + 0.2),
            y = fy + 1.85 - Math.abs(Math.sin(u * pie * 3)) * 0.25;
          bulb(new T.Vector3(x, y, 0.6), k);
        }
      }
    } else if (kind === "kite") {
      const kite = new T.Group();
      const shape = (pts, c) => {
        const sh = new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y)));
        const m = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshStandardMaterial({ color: c, side: T.DoubleSide, emissive: c, emissiveIntensity: 0.2 }));
        kite.add(m);
      };
      shape([[0, 0.7], [0.45, 0], [0, 0]], "#ff4f6d");
      shape([[0, 0.7], [-0.45, 0], [0, 0]], "#ffd23f");
      shape([[0, -0.9], [0.45, 0], [0, 0]], "#3f8cff");
      shape([[0, -0.9], [-0.45, 0], [0, 0]], "#3fdc7a");
      for (let k = 0; k < 4; k++) {
        const bow = new T.Mesh(new T.ConeGeometry(0.08, 0.18, 4), matte(["#ff4f6d", "#b47cff", "#ffd23f", "#3f8cff"][k]));
        bow.position.set(Math.sin(k) * 0.12, -1.1 - k * 0.3, 0);
        bow.rotation.z = pie / 2;
        kite.add(bow);
      }
      const at = new T.Vector3(fx0 + 0.4, fy + 4.6, -0.6);
      add(kite, at.x, at.y, at.z);
      kite.userData.sway = true;
      const hand = this.recipient.position.clone().add(new T.Vector3(0.2, 0.9, 0.2));
      const str = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([hand, hand.clone().lerp(at, 0.5).add(new T.Vector3(0.4, -0.4, 0)), at]), 16, 0.008, 4), matte("#ffffff"));
      g.add(str);
    } else if (kind === "scarf") {
      const r = this.recipient;
      const tex = canvasTexture(64, 16, (x) => {
        for (let i = 0; i < 8; i++) {
          x.fillStyle = i % 2 ? "#ffffff" : "#ff4f6d";
          x.fillRect(i * 8, 0, 8, 16);
        }
      });
      tex.wrapS = T.RepeatWrapping;
      const scarf = new T.Group();
      const ring = new T.Mesh(new T.TorusGeometry(0.22, 0.07, 10, 28), new T.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      ring.rotation.x = pie / 2;
      scarf.add(ring);
      const tail = new T.Mesh(new RoundedBoxGeometry(0.12, 0.38, 0.05, 2, 0.02), new T.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      tail.position.set(0.12, -0.2, 0.2);
      tail.rotation.z = 0.25;
      scarf.add(tail);
      scarf.position.set(0, r.userData.neck || 0.68, 0);
      r.add(scarf);
      grow.push(scarf);
      this.gift = scarf;
    } else if (kind === "snowman") {
      const sm = new T.Group();
      const snow = matte("#ffffff", { roughness: 0.9 });
      [[0.42, 0.42], [0.31, 1.06], [0.22, 1.52]].forEach(([r, y]) => {
        const b = new T.Mesh(new T.SphereGeometry(r, 20, 14), snow);
        b.position.y = y;
        sm.add(b);
      });
      const coal = matte("#22222e");
      for (const [x, y, z] of [[-0.07, 1.6, 0.19], [0.07, 1.6, 0.19], [0, 1.15, 0.3], [0, 1.0, 0.31], [0, 0.55, 0.4]]) {
        const c = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), coal);
        c.position.set(x, y, z);
        sm.add(c);
      }
      const nose = new T.Mesh(new T.ConeGeometry(0.045, 0.28, 10), glossy("#ff8a1f"));
      nose.rotation.x = pie / 2;
      nose.position.set(0, 1.52, 0.33);
      sm.add(nose);
      const hat = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.26, 16), glossy("#2b2f45"));
      hat.position.y = 1.85;
      sm.add(hat);
      const brim = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 0.04, 20), glossy("#2b2f45"));
      brim.position.y = 1.72;
      sm.add(brim);
      for (const sx of [-1, 1]) {
        const arm = new T.Mesh(new T.CylinderGeometry(0.02, 0.025, 0.6, 6), matte("#6e4a32"));
        arm.position.set(sx * 0.42, 1.18, 0);
        arm.rotation.z = sx * 1.0;
        sm.add(arm);
      }
      add(sm, gx, gy, 0.6);
    } else if (kind === "fireworks") this.fireworks = 1;
    if (g.children.length) {
      this.level.add(g);
      this.gift = g;
    }
    if (animate)
      for (const m of grow) {
        const end = m.scale.clone();
        m.scale.setScalar(0.001);
        this.tween(0.7, (p) => m.scale.copy(end).multiplyScalar(Math.max(0.001, p < 0.7 ? (p / 0.7) * 1.2 : 1.2 - ((p - 0.7) / 0.3) * 0.2)));
      }
  }
  booster([a, b]) {
    const g = new T.Group();
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const pad = new T.Mesh(new RoundedBoxGeometry(len + 0.3, 0.18, 1.0, 2, 0.06), glossy("#2b2b3d"));
    pad.position.set(0, -0.16, 0);
    g.add(pad);
    const mat = new T.MeshStandardMaterial({ color: "#ff9a3f", emissive: "#ff7a1f", emissiveIntensity: 1.2 });
    const chevrons = [];
    const shape = new T.Shape([new T.Vector2(-0.12, 0.3), new T.Vector2(0.08, 0), new T.Vector2(-0.12, -0.3), new T.Vector2(0.02, -0.3), new T.Vector2(0.22, 0), new T.Vector2(0.02, 0.3)]);
    const geo = new T.ShapeGeometry(shape);
    geo.rotateX(-pie / 2);
    for (let k = 0; k < Math.floor(len / 0.5); k++) {
      const c = new T.Mesh(geo, mat.clone());
      c.position.set(-len / 2 + 0.3 + k * 0.5, -0.06, 0);
      g.add(c);
      chevrons.push(c);
    }
    const glow = glowSprite("#ff9a3f", 2.6, 0.55);
    glow.position.y = 0.1;
    g.add(glow);
    g.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    g.rotation.z = ang;
    this.boostChevrons = chevrons;
    return g;
  }
  ring([x, y], i) {
    const g = new T.Group();
    const torus = new T.Mesh(new T.TorusGeometry(0.72, 0.085, 14, 48), glossy("#ffd23f", { metalness: 0.75, roughness: 0.22, emissive: "#ffb000", emissiveIntensity: 1.6 }));
    torus.castShadow = true;
    g.add(torus);
    const beads = new T.Mesh(new T.TorusGeometry(0.72, 0.03, 6, 48), new T.MeshBasicMaterial({ color: "#fff6c8" }));
    beads.position.z = 0.06;
    g.add(beads);
    const stamp = new T.Mesh(new T.CircleGeometry(0.38, 32), new T.MeshBasicMaterial({ map: stampTexture(i ? "#2f6bff" : "#ff4f6d"), transparent: true, opacity: 0.95, side: T.DoubleSide }));
    g.add(stamp);
    const glow = glowSprite("#ffe28a", 2.6, 0.55);
    glow.position.z = -0.1;
    g.add(glow);
    g.position.set(x, y, 0);
    g.userData = { stamp, torus, glow, taken: false, base: y };
    return g;
  }
  ringTaken(i) {
    this.joyAt = this.time;
    const r = this.rings[i];
    if (!r || r.userData.taken) return;
    r.userData.taken = true;
    this.burst(r.position, 26, ["#ffd23f", "#ffffff", "#ff9fd0", "#7fe8ff"], 3.2);
    this.tween(0.45, (p) => {
      r.scale.setScalar(1 + p * 0.6);
      r.userData.torus.material.opacity = 1 - p;
      r.userData.torus.material.transparent = true;
      r.userData.stamp.material.opacity = 1 - p;
      r.userData.glow.material.opacity = 0.55 * (1 - p);
    }).then(() => (r.visible = false));
  }
  ringsReset() {
    for (const r of this.rings) {
      r.userData.taken = false;
      r.visible = true;
      r.scale.setScalar(1);
      r.userData.torus.material.opacity = 1;
      r.userData.stamp.material.opacity = 0.95;
      r.userData.glow.material.opacity = 0.55;
    }
  }

  // ---------- Рельсы ----------
  addFixedRails(level) {
    const [sx, sy] = level.start,
      [fx, fy] = level.finish;
    this.fixed = [];
    this.fixed.push(this.buildRail([[sx - 2.4, sy + 0.42], [sx - 1.2, sy + 0.16], [sx, sy]], "#c98b55", false, true));
    this.fixed.push(this.buildRail([[fx, fy], [fx + 2.4, fy]], "#c98b55", false, false));
    if (level.boost) this.fixed.push(this.buildRail(level.boost, "#ff9a3f", false, false));
  }
  // Сторона «верха» рельса: для линии слева направо — левая нормаль, справа налево — правая
  static side(pts) {
    return pts.at(-1)[0] >= pts[0][0] ? 1 : -1;
  }
  buildRail(pts, color, animate = true, supports = true) {
    const g = new T.Group();
    const side = World.side(pts);
    // Гладкая кривая и точки через каждые 0.1
    const curve2 = new T.CatmullRomCurve3(
      pts.map(([x, y]) => new T.Vector3(x, y, 0)),
      false,
      "centripetal",
    );
    const n = Math.max(8, Math.ceil(curve2.getLength() / 0.1));
    const dense = curve2.getSpacedPoints(n);
    const steel = glossy(color, { metalness: 0.35, roughness: 0.25, clearcoat: 1 });
    const tubes = [];
    for (const z of [-0.27, 0.27]) {
      const c = new T.CatmullRomCurve3(dense.map((p) => new T.Vector3(p.x, p.y, z)));
      const tube = new T.Mesh(new T.TubeGeometry(c, dense.length * 2, 0.075, 10), steel);
      tube.castShadow = true;
      g.add(tube);
      tubes.push(tube);
    }
    // Несущая балка под шпалами — рельс выглядит объёмным, как у настоящих горок
    const spineCurve = new T.CatmullRomCurve3(
      dense.map((p, i) => {
        const a = dense[Math.max(0, i - 1)],
          b = dense[Math.min(dense.length - 1, i + 1)];
        const t = new T.Vector3().subVectors(b, a).normalize();
        return p.clone().add(new T.Vector3(-t.y, t.x, 0).multiplyScalar(-0.17 * side));
      }),
    );
    const spine = new T.Mesh(new T.TubeGeometry(spineCurve, dense.length * 2, 0.1, 10), glossy(new T.Color(color).multiplyScalar(0.72), { roughness: 0.3, clearcoat: 0.8 }));
    spine.castShadow = true;
    g.add(spine);
    tubes.push(spine);
    // Шпалы
    const ties = [];
    const total = curve2.getLength();
    for (let s = 0.15; s < total; s += 0.3) ties.push(s / total);
    const tieMesh = new T.InstancedMesh(new RoundedBoxGeometry(0.12, 0.08, 0.8, 1, 0.025), matte("#a8743f", { roughness: 0.7 }), ties.length);
    const dummy = new T.Object3D();
    ties.forEach((u, i) => {
      const p = curve2.getPointAt(u),
        t = curve2.getTangentAt(u);
      const nrm = new T.Vector3(-t.y, t.x, 0).multiplyScalar(side);
      dummy.position.copy(p).addScaledVector(nrm, -0.07);
      dummy.rotation.set(0, 0, Math.atan2(t.y, t.x));
      dummy.scale.setScalar(animate ? 0.001 : 1);
      dummy.updateMatrix();
      tieMesh.setMatrixAt(i, dummy.matrix);
    });
    tieMesh.castShadow = true;
    g.add(tieMesh);
    // Опоры до земли (если под рельсом нет другого рельса)
    let posts = null;
    if (supports) {
      const spots = [];
      for (let s = 0.5; s < total - 0.2; s += 1.5) {
        const u = s / total,
          p = curve2.getPointAt(u),
          t = curve2.getTangentAt(u);
        const nrm = new T.Vector3(-t.y, t.x, 0).multiplyScalar(side);
        if (nrm.y < 0.35) continue;
        const ground = groundAt(this.data, p.x);
        const h = p.y - 0.1 - ground;
        if (h < 0.35) continue;
        if (this.data.water.some((w) => p.x > w[0] && p.x < w[1])) continue;
        if (dense.some((q) => Math.abs(q.x - p.x) < 0.3 && q.y < p.y - 0.4)) continue;
        spots.push({ x: p.x, top: p.y - 0.1, ground, h });
      }
      if (spots.length) {
        const tint = new T.Color(color).lerp(new T.Color("#ffffff"), 0.55);
        posts = new T.InstancedMesh(new T.CylinderGeometry(0.06, 0.075, 1, 10), glossy(tint, { roughness: 0.4, clearcoat: 0.4 }), spots.length * 3);
        let k = 0;
        for (const sp of spots) {
          for (const z of [-0.27, 0.27]) {
            dummy.position.set(sp.x, sp.ground + sp.h / 2, z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, animate ? 0.001 : sp.h, 1);
            dummy.updateMatrix();
            posts.setMatrixAt(k++, dummy.matrix);
          }
          dummy.position.set(sp.x, sp.ground + sp.h * 0.55, 0);
          dummy.rotation.set(pie / 2, 0, 0);
          dummy.scale.set(0.7, animate ? 0.001 : 0.6, 0.7);
          dummy.updateMatrix();
          posts.setMatrixAt(k++, dummy.matrix);
        }
        posts.castShadow = true;
        posts.userData.spots = spots;
        g.add(posts);
        // Косые перекладины крест-накрест через каждую единицу высоты
        const braces = [];
        for (const sp of spots) for (let y = sp.ground + 0.1; y < sp.top - 0.6; y += 1) braces.push({ x: sp.x, y, k: braces.length });
        if (braces.length) {
          const len = Math.hypot(1, 0.54);
          const br = new T.InstancedMesh(new T.CylinderGeometry(0.028, 0.028, len, 6), posts.material, braces.length);
          braces.forEach((b, i) => {
            dummy.position.set(b.x, b.y + 0.5, 0);
            dummy.rotation.set((i % 2 ? 1 : -1) * Math.atan2(0.54, 1), 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            br.setMatrixAt(i, dummy.matrix);
          });
          br.castShadow = true;
          br.visible = !animate;
          g.add(br);
          if (animate) setTimeout(() => (br.visible = true), 420);
        }
      }
    }
    this.railGroup.add(g);
    const handle = { group: g, side };
    if (animate) {
      for (const t of tubes) t.geometry.setDrawRange(0, 0);
      this.tween(0.5, (p) => {
        for (const t of tubes) t.geometry.setDrawRange(0, Math.floor((t.geometry.index.count * p) / 6) * 6);
        ties.forEach((u, i) => {
          const q = clamp((p - u * 0.8) * 5, 0, 1);
          const pt = curve2.getPointAt(u),
            tg = curve2.getTangentAt(u);
          const nrm = new T.Vector3(-tg.y, tg.x, 0).multiplyScalar(side);
          dummy.position.copy(pt).addScaledVector(nrm, -0.07);
          dummy.rotation.set(0, 0, Math.atan2(tg.y, tg.x));
          dummy.scale.setScalar(Math.max(0.001, q < 0.7 ? (q / 0.7) * 1.3 : 1.3 - ((q - 0.7) / 0.3) * 0.3));
          dummy.updateMatrix();
          tieMesh.setMatrixAt(i, dummy.matrix);
        });
        tieMesh.instanceMatrix.needsUpdate = true;
        if (posts) {
          let k = 0;
          for (const sp of posts.userData.spots) {
            const q = clamp((p - (sp.x - pts[0][0]) / 40) * 2, 0, 1),
              h = Math.max(0.001, sp.h * q);
            for (const z of [-0.27, 0.27]) {
              dummy.position.set(sp.x, sp.ground + h / 2, z);
              dummy.rotation.set(0, 0, 0);
              dummy.scale.set(1, h, 1);
              dummy.updateMatrix();
              posts.setMatrixAt(k++, dummy.matrix);
            }
            dummy.position.set(sp.x, sp.ground + sp.h * 0.55, 0);
            dummy.rotation.set(pie / 2, 0, 0);
            dummy.scale.set(0.7, q > 0.6 ? 0.6 : 0.001, 0.7);
            dummy.updateMatrix();
            posts.setMatrixAt(k++, dummy.matrix);
          }
          posts.instanceMatrix.needsUpdate = true;
        }
      });
      // Пыль и искры вдоль готового рельса
      for (let k = 0; k < dense.length; k += 6) setTimeout(() => this.burst(dense[k], 2, ["#ffffff", color], 1), (k / dense.length) * 450);
    }
    return handle;
  }
  addRail(rail, index) {
    return this.buildRail(rail.pts, RAIL_COLORS[index % RAIL_COLORS.length]);
  }
  removeRail(handle) {
    if (!handle) return;
    handle.group.traverse((o) => o.geometry && o.geometry.dispose());
    handle.group.removeFromParent();
  }
  railColor(index) {
    return RAIL_COLORS[index % RAIL_COLORS.length];
  }

  // ---------- Мелочи: меловая линия, магниты, след, подсказка ----------
  makeHelpers() {
    const dot = new T.SphereGeometry(0.075, 10, 8);
    this.chalk = new T.InstancedMesh(dot, new T.MeshBasicMaterial({ color: "#ffffff" }), 4000);
    this.chalk.count = 0;
    this.chalk.frustumCulled = false;
    this.scene.add(this.chalk);
    this.traceDots = new T.InstancedMesh(new T.SphereGeometry(0.06, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8 }), 1200);
    this.traceDots.count = 0;
    this.traceDots.frustumCulled = false;
    this.scene.add(this.traceDots);
    this.ghostDots = new T.InstancedMesh(new T.SphereGeometry(0.09, 10, 8), new T.MeshBasicMaterial({ color: "#fff27a", transparent: true, opacity: 0.9 }), 1500);
    this.ghostDots.count = 0;
    this.ghostDots.frustumCulled = false;
    this.scene.add(this.ghostDots);
    this.magnets = [];
    this.marker = new T.Group();
    const pin = new T.Mesh(new T.SphereGeometry(0.28, 20, 14), glossy("#ff4f6d", { emissive: "#ff2d55", emissiveIntensity: 0.5 }));
    pin.position.y = 0.75;
    this.marker.add(pin);
    const mark = new T.Sprite(
      new T.SpriteMaterial({
        map: canvasTexture(64, 64, (x) => {
          x.fillStyle = "#ffffff";
          x.font = "bold 50px system-ui, sans-serif";
          x.textAlign = "center";
          x.textBaseline = "middle";
          x.fillText("!", 32, 35);
        }),
        depthTest: false,
      }),
    );
    mark.scale.setScalar(0.5);
    mark.position.set(0, 0.75, 0.3);
    this.marker.add(mark);
    const stick = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.5, 8), matte("#ffffff"));
    stick.position.y = 0.28;
    this.marker.add(stick);
    this.markerRing = new T.Mesh(new T.RingGeometry(0.3, 0.42, 32), new T.MeshBasicMaterial({ color: "#ff4f6d", transparent: true, side: T.DoubleSide, depthWrite: false }));
    this.marker.add(this.markerRing);
    this.marker.visible = false;
    this.scene.add(this.marker);
  }
  preview(points, snapped) {
    const d = new T.Object3D();
    this.chalk.material.color.set(snapped ? "#7dff9a" : "#ffffff");
    let k = 0;
    for (let i = 0; i < points.length && k < 4000; i++) {
      d.position.set(points[i][0], points[i][1], 0.05);
      d.updateMatrix();
      this.chalk.setMatrixAt(k++, d.matrix);
    }
    this.chalk.count = k;
    this.chalk.instanceMatrix.needsUpdate = true;
  }
  // Магниты: светящиеся точки, к которым примагничивается линия
  setMagnets(list, hot = -1) {
    for (const m of this.magnets) m.removeFromParent();
    this.magnets = list.map((p, i) => {
      const g = glowSprite(i === 0 ? "#7dff9a" : i === 1 ? "#ffd23f" : "#ffffff", i === hot ? 1.6 : 1.0, i === hot ? 1 : 0.8);
      g.position.set(p[0], p[1], 0.3);
      g.userData.base = i === hot ? 1.6 : 1.0;
      this.scene.add(g);
      return g;
    });
  }
  // Ручки на свободных кончиках рельсов: за них можно потянуть пальцем
  setHandles(list) {
    for (const h of this.handleMeshes || []) h.removeFromParent();
    this.handleMeshes = list.map((h) => {
      const g = new T.Group();
      const ball = new T.Mesh(new T.SphereGeometry(0.24, 20, 14), glossy(h.color, { emissive: h.color, emissiveIntensity: 0.6, roughness: 0.2 }));
      g.add(ball);
      const ring = new T.Mesh(new T.TorusGeometry(0.36, 0.045, 8, 32), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }));
      g.add(ring);
      g.position.set(h.p[0], h.p[1], 0.35);
      g.userData.ring = ring;
      this.scene.add(g);
      return g;
    });
  }
  // Начало будущих прыжков: золотистый пунктир
  showArcs(arcs) {
    if (!this.arcDots) {
      this.arcDots = new T.InstancedMesh(new T.SphereGeometry(0.075, 10, 8), new T.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.95, toneMapped: false }), 400);
      this.arcDots.frustumCulled = false;
      this.scene.add(this.arcDots);
    }
    const d = new T.Object3D();
    let k = 0;
    for (const arc of arcs || [])
      arc.forEach((p, i) => {
        if (i % 3 || k >= 400) return;
        d.position.set(p[0], p[1], 0.1);
        d.scale.setScalar(1 - (i / arc.length) * 0.5);
        d.updateMatrix();
        this.arcDots.setMatrixAt(k++, d.matrix);
      });
    this.arcDots.count = k;
    this.arcDots.instanceMatrix.needsUpdate = true;
  }
  // Облачко над получателем: что он ждёт
  setBubble(icon) {
    if (this.bubble) {
      this.bubble.removeFromParent();
      this.bubble.material.map.dispose();
      this.bubble.material.dispose();
    }
    this.bubble = null;
    if (!icon || !this.recipient) return;
    const tex = canvasTexture(160, 170, (x) => {
      x.fillStyle = "#ffffff";
      x.strokeStyle = "#ffb02e";
      x.lineWidth = 7;
      x.beginPath();
      x.roundRect(8, 8, 144, 124, 40);
      x.moveTo(62, 130);
      x.lineTo(80, 160);
      x.lineTo(98, 130);
      x.fill();
      x.stroke();
      x.fillStyle = "#ffffff";
      x.fillRect(64, 122, 32, 12);
      x.font = "84px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(icon, 80, 74);
    });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false }));
    sp.scale.set(1.5, 1.6, 1);
    sp.position.copy(this.recipient.position).add(new T.Vector3(0.1, 3.45, 1.5));
    sp.userData.y = sp.position.y;
    this.level.add(sp);
    this.bubble = sp;
  }
  showTrace(points, at) {
    const d = new T.Object3D();
    let k = 0;
    for (let i = 0; i < points.length && k < 1200; i += 2) {
      d.position.set(points[i][0], points[i][1], -0.05);
      d.updateMatrix();
      this.traceDots.setMatrixAt(k++, d.matrix);
    }
    this.traceDots.count = k;
    this.traceDots.instanceMatrix.needsUpdate = true;
    if (at) {
      this.marker.position.set(at[0], at[1], 0.4);
      this.marker.visible = true;
      this.marker.scale.setScalar(0.001);
      this.tween(0.4, (p) => this.marker.scale.setScalar(Math.max(0.001, p < 0.7 ? (p / 0.7) * 1.25 : 1.25 - ((p - 0.7) / 0.3) * 0.25)));
    }
  }
  clearTrace() {
    this.traceDots.count = 0;
    this.marker.visible = false;
  }
  ghost(rails) {
    const d = new T.Object3D();
    let k = 0;
    if (rails)
      for (const r of rails)
        for (let i = 0; i < r.pts.length && k < 1500; i++) {
          d.position.set(r.pts[i][0], r.pts[i][1], 0.1);
          d.updateMatrix();
          this.ghostDots.setMatrixAt(k++, d.matrix);
        }
    this.ghostDots.count = k;
    this.ghostDots.instanceMatrix.needsUpdate = true;
  }

  // ---------- Вагончик ----------
  setSkin(skin) {
    if (this.wagon) {
      this.wagon.group.removeFromParent();
    }
    this.wagon = wagonModel(skin);
    this.wagon.skin = skin;
    this.scene.add(this.wagon.group);
    this.wagonQ = new T.Quaternion();
    this.wagonSpin = 0;
  }
  // pos — точка на рельсе или в полёте, dir — куда едет, up — нормаль «вверх» вагончика
  placeWagon(pos, dir, up, speed, dt, snap = false) {
    const w = this.wagon;
    if (!w) return;
    // Нос вагончика — по ходу, крыша — по нормали рельса. Когда едет влево, мы видим его другой бок
    const X = new T.Vector3(dir[0], dir[1], 0).normalize();
    const Y = new T.Vector3(up[0], up[1], 0).normalize();
    const Z = new T.Vector3().crossVectors(X, Y);
    w.back = Z.z < 0;
    const m = new T.Matrix4().makeBasis(X, Y, Z);
    const q = new T.Quaternion().setFromRotationMatrix(m);
    if (snap) this.wagonQ.copy(q);
    else this.wagonQ.slerp(q, clamp(dt * 14, 0, 1));
    w.group.quaternion.copy(this.wagonQ);
    const lift = new T.Vector3(0, 0.44, 0).applyQuaternion(this.wagonQ);
    w.group.position.set(pos[0] + lift.x, pos[1] + lift.y, 0);
    // Колёса крутятся, ёжик смотрит к зрителю
    this.wagonSpin += (speed * dt) / 0.18;
    for (const wh of w.wheels) wh.rotation.z = -this.wagonSpin;
    if (w.head) w.head.rotation.y = w.back ? 0.6 : -0.6;
    this.wagonSpeed = speed;
  }

  // Объёмная картинка вагончика для гаража
  skinIcon(skin, size = 160) {
    const scene = new T.Scene();
    scene.environment = this.scene.environment;
    scene.add(new T.HemisphereLight(0xffffff, 0xffe0ea, 1.5));
    const key = new T.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 6);
    scene.add(key);
    const m = wagonModel(skin);
    m.group.rotation.set(0.15, -0.5, 0);
    scene.add(m.group);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 0.35, 4.2);
    cam.lookAt(0, 0.12, 0);
    const target = new T.WebGLRenderTarget(size, size, { samples: 4 });
    target.texture.colorSpace = T.SRGBColorSpace;
    const r = this.renderer,
      keep = r.getRenderTarget(),
      keepAlpha = r.getClearAlpha(),
      keepColor = r.getClearColor(new T.Color()),
      keepTone = r.toneMapping;
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(target, 0, 0, size, size, px);
    r.setRenderTarget(keep);
    r.setClearColor(keepColor, keepAlpha);
    r.toneMapping = keepTone;
    target.dispose();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d"),
      img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    m.group.traverse((o) => o.geometry && o.geometry.dispose());
    return c.toDataURL("image/png");
  }

  // ---------- Частицы ----------
  makeParticles() {
    const n = 500;
    // Искры ярче белого — их подхватывает свечение
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.07, 0), new T.MeshBasicMaterial({ color: new T.Color(2.4, 2.4, 2.4), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.sparkPool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.sparkNext = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    const c = 360;
    this.confetti = new T.InstancedMesh(new T.PlaneGeometry(0.16, 0.24), new T.MeshBasicMaterial({ side: T.DoubleSide, toneMapped: false }), c);
    this.confetti.frustumCulled = false;
    this.confPool = Array.from({ length: c }, () => ({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Vector3(), life: 0 }));
    this.confNext = 0;
    const colors = ["#ff4f6d", "#ffd23f", "#3fdc7a", "#3f8cff", "#b47cff", "#ff9f3f"];
    for (let i = 0; i < c; i++) this.confetti.setColorAt(i, new T.Color(colors[i % colors.length]));
    this.puffs = new T.InstancedMesh(new T.SphereGeometry(0.3, 12, 8), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.85 }), 120);
    this.puffs.frustumCulled = false;
    this.puffPool = Array.from({ length: 120 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.puffNext = 0;
    for (let i = 0; i < 120; i++) this.puffs.setColorAt(i, new T.Color("#ffffff"));
    this.fx.add(this.sparks, this.confetti, this.puffs);
    this.dummy = new T.Object3D();
  }
  burst(at, count, colors = ["#ffffff"], speed = 2) {
    for (let k = 0; k < count; k++) {
      const s = this.sparkPool[this.sparkNext];
      this.sparks.setColorAt(this.sparkNext, new T.Color(colors[k % colors.length]));
      this.sparkNext = (this.sparkNext + 1) % this.sparkPool.length;
      s.p.set(at.x ?? at[0], at.y ?? at[1], (at.z ?? 0) + 0.2);
      s.v.set(Math.random() - 0.5, Math.random() - 0.3, (Math.random() - 0.5) * 0.6).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.5 + Math.random() * 0.6;
      s.s = 0.7 + Math.random() * 0.8;
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  puff(at, count, color = "#ffffff", speed = 1.2, size = 1) {
    for (let k = 0; k < count; k++) {
      const s = this.puffPool[this.puffNext];
      this.puffs.setColorAt(this.puffNext, new T.Color(color));
      this.puffNext = (this.puffNext + 1) % this.puffPool.length;
      s.p.set(at[0] + (Math.random() - 0.5) * 0.4, at[1] + Math.random() * 0.2, (Math.random() - 0.5) * 0.6);
      s.v.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed * 0.5);
      s.max = s.life = 0.6 + Math.random() * 0.5;
      s.s = size * (0.6 + Math.random() * 0.7);
    }
    this.puffs.instanceColor.needsUpdate = true;
  }
  celebrate(at) {
    for (let k = 0; k < 140; k++) {
      const s = this.confPool[this.confNext];
      this.confNext = (this.confNext + 1) % this.confPool.length;
      s.p.set(at[0] + (Math.random() - 0.5) * 1.5, at[1] + 0.5, (Math.random() - 0.5) * 1.5);
      s.v.set((Math.random() - 0.5) * 7, 4 + Math.random() * 6, (Math.random() - 0.5) * 3);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.life = 3 + Math.random() * 1.5;
    }
  }
  splash(at) {
    this.puff(at, 18, this.theme ? this.theme.water : "#3fb6ff", 3.2, 0.5);
    this.puff(at, 10, "#ffffff", 2.5, 0.4);
  }
  dust(at) {
    this.puff(at, 14, "#e8d9c4", 1.8, 0.7);
    this.burst(at, 12, ["#ffd23f", "#ffffff"], 3);
  }
  shake(amount = 0.25) {
    if (this.motion.matches) return;
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }
  // Посылка прилетает зайке, зайка прыгает от радости
  deliver(from) {
    const r = this.recipient,
      w = this.wagon;
    if (!r || !w) return;
    const start = new T.Vector3(from[0], from[1] + 0.6, 0.2),
      end = r.position.clone().add(new T.Vector3(0, 1.0, 0.25));
    const box = w.parcel.clone();
    w.parcel.visible = false;
    box.position.copy(start);
    this.fx.add(box);
    this.tween(0.6, (p) => {
      box.position.lerpVectors(start, end, p);
      box.position.y += Math.sin(p * pie) * 1.4;
      box.rotation.z = p * pie * 2;
    }).then(() => {
      box.removeFromParent();
      this.cheer = this.time;
      this.burst(end, 30, ["#ffd23f", "#ff9fd0", "#ffffff"], 3);
    });
  }
  // Неудача: вагончик подпрыгивает и кувыркается или тонет
  tumble(kind) {
    const w = this.wagon;
    if (!w) return;
    const g = w.group,
      from = g.position.clone(),
      q0 = g.quaternion.clone();
    if (kind === "water")
      return this.tween(1.1, (p) => {
        g.position.set(from.x, from.y - p * 1.2, from.z);
        g.rotation.z += 0.02;
        g.scale.setScalar(Math.max(0.001, 1 - p * 0.6));
      });
    const dirX = Math.random() < 0.5 ? -1 : 1;
    return this.tween(1.0, (p) => {
      g.position.set(from.x + dirX * p * 1.2, from.y + Math.sin(p * pie) * 1.4 - p * 0.3, from.z + p * 0.6);
      g.quaternion.copy(q0).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), -dirX * p * pie * 2.2));
    });
  }
  resetWagonParcel() {
    if (this.wagon) this.wagon.group.scale.setScalar(1);
    if (this.wagon) this.wagon.parcel.visible = true;
    this.cheer = 0;
  }

  // ---------- Погода ----------
  makeSnow() {
    const n = 260;
    const geo = new T.BufferGeometry(),
      pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([-6 + Math.random() * 36, Math.random() * 20, -14 + Math.random() * 18], i * 3);
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ color: "#ffffff", size: 0.16, map: glowTex, transparent: true, depthWrite: false }));
    this.level.add(pts);
    this.weather = { kind: "snow", pts };
  }
  makeLeaves(th) {
    const n = 50;
    const mesh = new T.InstancedMesh(new T.PlaneGeometry(0.22, 0.14), new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.8 }), n);
    const items = [];
    for (let i = 0; i < n; i++) {
      mesh.setColorAt(i, new T.Color(th.trees[i % th.trees.length]));
      items.push({ p: new T.Vector3(-6 + Math.random() * 36, Math.random() * 18, -10 + Math.random() * 12), ph: Math.random() * 6 });
    }
    mesh.frustumCulled = false;
    this.level.add(mesh);
    this.weather = { kind: "leaves", mesh, items };
  }
  makeButterflies() {
    const n = 8;
    const items = [];
    const g = new T.Group();
    for (let i = 0; i < n; i++) {
      const b = new T.Group();
      const color = ["#ff6fa8", "#ffd23f", "#7fe8ff", "#b47cff"][i % 4];
      for (const s of [-1, 1]) {
        const wing = new T.Mesh(new T.CircleGeometry(0.14, 12), new T.MeshStandardMaterial({ color, side: T.DoubleSide }));
        wing.position.x = s * 0.12;
        wing.userData.s = s;
        b.add(wing);
      }
      b.userData = { home: new T.Vector3(Math.random() * 24, 2 + Math.random() * 3, -1.5 - Math.random() * 3), ph: Math.random() * 6 };
      g.add(b);
      items.push(b);
    }
    this.level.add(g);
    this.weather = { kind: "butterflies", items };
  }

  // ---------- Кадр ----------
  frame(ms) {
    if (document.hidden) return;
    const dt = this.last ? clamp((ms - this.last) / 1000, 0, 0.1) : 0;
    this.last = ms;
    this.time += dt;
    const t = this.time,
      calm = this.motion.matches ? 0.3 : 1;
    for (const tw of [...this.tweens]) {
      const p = clamp((t - tw.at) / tw.dur, 0, 1);
      tw.update(p);
      if (p === 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    if (this.onFrame) this.onFrame(dt);
    // Облака плывут, флажки и вода волнуются, кольца покачиваются
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt * calm;
      if (c.position.x > 36) c.position.x = -12;
    }
    if (this.flock) {
      this.flock.x += dt * 1.6 * calm;
      if (this.flock.x > 40) this.flock.x = -16;
      for (const b of this.birds) {
        const o = b.userData.off;
        b.position.set(this.flock.x + o.x, this.flock.y + o.y + Math.sin(t * 0.8 + b.userData.ph) * 0.2, this.flock.z + o.z);
        for (const w of b.children) w.rotation.z = w.userData.s * Math.sin(t * 9 + b.userData.ph) * 0.6 * calm;
      }
      for (const b of this.airBalloons) {
        b.position.y = b.userData.y + Math.sin(t * 0.5 + b.userData.ph) * 0.5 * calm;
        b.position.x += dt * 0.15 * calm;
        b.rotation.y += dt * 0.1 * calm;
      }
    }
    for (const f of this.flags) {
      const a = f.geometry.attributes.position,
        b = f.userData.base;
      for (let i = 0; i < a.count; i++) {
        const x = b[i * 3];
        a.setZ(i, Math.sin(x * 5 - t * 6) * 0.08 * x * calm);
      }
      a.needsUpdate = true;
    }
    for (const wtr of this.waters) {
      const a = wtr.geometry.attributes.position,
        b = wtr.userData.base;
      for (let i = 0; i < a.count; i++) a.setY(i, Math.sin(b[i * 3] * 2.2 + t * 2.4) * 0.05 * calm + Math.cos(b[i * 3 + 2] * 1.7 + t * 1.8) * 0.04 * calm);
      a.needsUpdate = true;
    }
    for (const r of this.rings) {
      if (!r.visible) continue;
      r.position.y = r.userData.base + Math.sin(t * 2 + r.position.x) * 0.06 * calm;
      r.userData.stamp.rotation.y = Math.sin(t * 1.6 + r.position.x) * 0.5 * calm;
      r.userData.glow.material.opacity = r.userData.taken ? r.userData.glow.material.opacity : 0.45 + Math.sin(t * 3) * 0.12;
    }
    for (const m of this.magnets) m.scale.setScalar(m.userData.base * (1 + Math.sin(t * 5) * 0.15 * calm));
    for (const h of this.handleMeshes || []) {
      const p = (t * 1.1) % 1;
      h.userData.ring.scale.setScalar(1 + p * 0.8 * calm);
      h.userData.ring.material.opacity = 0.9 - p * 0.8;
    }
    if (this.bubble) this.bubble.position.y = this.bubble.userData.y + Math.sin(t * 2.2) * 0.12 * calm;
    if (this.gift)
      this.gift.traverse((m) => {
        const u = m.userData;
        if (u.bob) m.position.y = u.bob.y + Math.sin(t * 1.6 + u.bob.ph) * 0.12 * calm;
        if (u.sway) {
          m.rotation.z = Math.sin(t * 1.3) * 0.25 * calm;
          m.position.x += Math.sin(t * 0.9) * 0.002 * calm;
        }
        if (u.blink !== undefined) m.material.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * 4 + u.blink * 1.7)) * 2;
      });
    if (this.fireworks) {
      this.fireworks -= dt;
      if (this.fireworks <= 0) {
        this.fireworks = 0.9 + Math.random() * 0.6;
        const [fx0] = platforms(this.data).finish;
        const at = { x: fx0 - 3 + Math.random() * 6, y: 10.5 + Math.random() * 3, z: -2 };
        const palette = [["#ff4f6d", "#ffd23f"], ["#3fdc7a", "#7fe8ff"], ["#b47cff", "#ff8fd0"], ["#ffd23f", "#ffffff"]][Math.floor(Math.random() * 4)];
        this.burst(at, 46, palette, 4.2);
      }
    }
    if (this.marker.visible) {
      const p = (t * 1.2) % 1;
      this.markerRing.scale.setScalar(1 + p * 2);
      this.markerRing.material.opacity = 1 - p;
    }
    if (this.ghostDots.count) this.ghostDots.material.opacity = 0.55 + Math.sin(t * 6) * 0.35;
    if (this.boostChevrons)
      this.boostChevrons.forEach((c, i) => (c.material.emissiveIntensity = 0.4 + Math.max(0, Math.sin(t * 10 - i * 1.2)) * 1.6));
    // Зайка ждёт посылку и прыгает от радости
    if (this.recipient) {
      const r = this.recipient,
        happy = this.cheer && t - this.cheer < 3;
      // Чем ближе вагончик, тем нетерпеливее подпрыгивает получатель
      const near = this.wagon && this.wagonSpeed > 0.5 ? clamp(1 - Math.abs(this.wagon.group.position.x - r.position.x) / 8, 0, 1) : 0;
      r.position.y = this.data.finish[1] + (happy ? Math.abs(Math.sin((t - this.cheer) * 9)) * 0.45 : (Math.abs(Math.sin(t * 2)) * 0.04 + Math.abs(Math.sin(t * 7)) * 0.2 * near) * calm);
      r.userData.head.rotation.z = happy ? Math.sin(t * 12) * 0.2 : Math.sin(t * 1.3) * 0.08 * calm;
    }
    // Вагончик: дымок у паровоза, пламя у ракеты, искры на скорости
    const w = this.wagon;
    if (w) {
      // Ёжик-машинист живой: моргает, на скорости задирает нос и подпрыгивает на сиденье,
      // от пойманного колечка голова радостно «пружинит»
      if (w.head) {
        const hu = w.head.userData,
          fast = clamp(this.wagonSpeed / 12, 0, 1);
        if (hu.blinkAt == null || t > hu.blinkAt + 0.13) hu.blinkAt = t + 1.5 + Math.random() * 3;
        const open = calm === 1 && t > hu.blinkAt ? 0.12 : 1;
        for (const e of hu.eyes || []) e.scale.y = open;
        hu.baseY ??= w.head.position.y;
        w.head.rotation.z = (Math.sin(t * 1.5) * 0.05 + fast * 0.25) * calm;
        w.head.position.y = hu.baseY + Math.abs(Math.sin(t * 17)) * 0.018 * fast * calm;
        const joy = clamp(1 - (t - (this.joyAt ?? -9)) * 2.4, 0, 1);
        w.head.scale.setScalar(1 + Math.sin(joy * pie * 3) * joy * 0.16 * calm);
      }
      if (w.flame) w.flame.scale.setScalar(0.4 + Math.min(1, this.wagonSpeed / 12) * 0.7 + Math.sin(t * 40) * 0.08);
      if (w.smoke && this.wagonSpeed > 0.5 && Math.random() < dt * 8) {
        const p = new T.Vector3();
        w.smoke.getWorldPosition(p);
        this.puff([p.x, p.y + 0.15], 1, "#ffffff", 0.5, 0.45);
      }
      if (this.wagonSpeed > 9 && Math.random() < dt * 30) {
        const p = w.group.position;
        this.burst({ x: p.x, y: p.y - 0.3, z: 0 }, 1, ["#ffd23f", "#ffffff", "#ff9f3f"], 1.5);
      }
    }
    this.weatherStep(dt, t, calm);
    this.particles(dt);
    // Камера: во время заезда чуть приближается и следит за вагончиком, потом плавно возвращается
    if (this.home) {
      this.view ??= { p: this.home.clone(), q: this.homeQ.clone() };
      let wantP = this.home,
        wantQ = this.homeQ;
      if (this.focus && !this.motion.matches) {
        const f = this.focus,
          k = 0.32;
        wantP = new T.Vector3(this.home.x + (f[0] - 12) * k, this.home.y + (f[1] - 7) * k * 0.8, this.home.z * 0.8);
        const m = new T.Matrix4().lookAt(wantP, new T.Vector3(12 + (f[0] - 12) * k * 1.2, 7.3 + (f[1] - 7) * k, 0), new T.Vector3(0, 1, 0));
        wantQ = new T.Quaternion().setFromRotationMatrix(m);
      }
      const a = 1 - Math.pow(0.03, dt);
      this.view.p.lerp(wantP, a);
      this.view.q.slerp(wantQ, a);
      this.camera.position.copy(this.view.p);
      this.camera.quaternion.copy(this.view.q);
      if (this.shakeAmp > 0.001) {
        this.camera.position.add(new T.Vector3((Math.random() - 0.5) * this.shakeAmp, (Math.random() - 0.5) * this.shakeAmp, 0));
        this.shakeAmp *= Math.pow(0.02, dt);
      }
    }
    if (this.glow.on) {
      this.composer.render();
      // Больше трети медленных кадров за 5 секунд — без свечения
      if (dt) {
        this.glow.seen += dt;
        if (dt > 1 / 36) this.glow.slow += dt;
        if (this.glow.seen > 5) {
          if (this.glow.slow > 1.8) this.glow.on = false;
          this.glow.seen = this.glow.slow = 0;
        }
      }
    } else this.renderer.render(this.scene, this.camera);
  }
  // Камера следит за точкой (во время заезда) или показывает всё поле (null)
  follow(p) {
    this.focus = p;
  }
  weatherStep(dt, t, calm) {
    const W = this.weather;
    if (!W) return;
    if (W.kind === "snow") {
      const a = W.pts.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 0.9 * calm;
        if (y < 0) y += 20;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.sin(t + i) * dt * 0.2 * calm);
      }
      a.needsUpdate = true;
    } else if (W.kind === "leaves") {
      const d = this.dummy;
      W.items.forEach((it, i) => {
        it.p.y -= dt * 0.7 * calm;
        it.p.x += Math.sin(t * 0.8 + it.ph) * dt * 0.6 * calm;
        if (it.p.y < 0) it.p.y = 18;
        d.position.copy(it.p);
        d.rotation.set(t * 1.3 + it.ph, t * 0.9 + it.ph, t * 0.5);
        d.scale.setScalar(1);
        d.updateMatrix();
        W.mesh.setMatrixAt(i, d.matrix);
      });
      W.mesh.instanceMatrix.needsUpdate = true;
    } else {
      for (const b of W.items) {
        const h = b.userData.home,
          ph = b.userData.ph;
        b.position.set(h.x + Math.sin(t * 0.4 + ph) * 2, h.y + Math.sin(t * 0.9 + ph) * 0.6, h.z);
        for (const wing of b.children) wing.rotation.y = wing.userData.s * (0.3 + Math.abs(Math.sin(t * 14 + ph)) * 1.1);
      }
    }
  }
  particles(dt) {
    const d = this.dummy;
    this.sparkPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 3 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      d.position.copy(s.p);
      d.rotation.set(s.life * 8, s.life * 6, 0);
      d.scale.setScalar(Math.max(0, s.life / s.max) * s.s);
      d.updateMatrix();
      this.sparks.setMatrixAt(i, d.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    this.confPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 6 * dt;
        s.v.multiplyScalar(Math.pow(0.4, dt));
        s.p.addScaledVector(s.v, dt);
        s.r.addScalar(dt * 4);
      }
      d.position.copy(s.p);
      d.rotation.set(s.r.x, s.r.y, s.r.z);
      d.scale.setScalar(s.life > 0 ? Math.min(1, s.life) : 0);
      d.updateMatrix();
      this.confetti.setMatrixAt(i, d.matrix);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
    this.puffPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 1.5 * dt;
        s.v.multiplyScalar(Math.pow(0.3, dt));
        s.p.addScaledVector(s.v, dt);
      }
      const f = s.life > 0 ? s.life / s.max : 0;
      d.position.copy(s.p);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f > 0 ? s.s * (1.3 - f * 0.6) * Math.min(1, f * 3) : 0);
      d.updateMatrix();
      this.puffs.setMatrixAt(i, d.matrix);
    });
    this.puffs.instanceMatrix.needsUpdate = true;
  }
  // Снимок сцены для обложки
  snapshot(w = 1280, h = 800) {
    this.renderer.setSize(w, h, false);
    this.fit(w / h);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/jpeg", 0.9);
    this.resize();
    return url;
  }
}
// Нормаль «вверх» рельса в точке s: для линии слева направо — левая
export function railUp(rail, s, side) {
  const { t } = railAt(rail, s);
  return [-t[1] * side, t[0] * side];
}
