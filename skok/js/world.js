// 3D «Заводного Скока»: верстак мастерской игрушек, стена с инструментами и полками,
// гайки, винтики, кнопки, кубики-платформы, золотые шестерёнки, флажки на карандашах,
// коробка с деталями на финише и заводной зайчик Скок на пружинке.
// Логика (jump.js) живёт в плоскости: x — вдоль верстака, y — вверх; в 3D это (x, y, 0).
import * as T from "../vendor/three/three.module.min.js?v=53f36b6b";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=53f36b6b";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=53f36b6b";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=53f36b6b";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=53f36b6b";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=53f36b6b";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=53f36b6b";
import { HERO } from "./jump.js?v=53f36b6b";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const metal = (color, extra = {}) => new T.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.28, ...extra });

// Темы трасс: стена, дерево верстака, свет
export const THEMES = {
  bench: { wall: "#9fe6cc", dots: "#6fcfae", wood: ["#e8a868", "#d18e4e", "#b8763f"], light: 0xfff0d8, hemi: [0xffffff, 0xc89870, 0.75], sun: 1.7, fog: "#dff7ef", bulbs: false },
  blocks: { wall: "#ffc2d4", dots: "#ff9fbb", wood: ["#eab47c", "#d8995e", "#c08048"], light: 0xfff0e6, hemi: [0xffffff, 0xd8a080, 0.75], sun: 1.7, fog: "#ffeaf0", bulbs: false },
  sewing: { wall: "#cdbfff", dots: "#ad9bff", wood: ["#e6b08a", "#d0966e", "#b87e58"], light: 0xfff0f4, hemi: [0xffffff, 0xc0a0b8, 0.75], sun: 1.7, fog: "#eee8ff", bulbs: true },
  workshop: { wall: "#33417e", dots: "#28356c", wood: ["#e0aa6a", "#c88e52", "#b07a44"], light: 0xffd9a0, hemi: [0xb8c8ff, 0x6a5040, 0.6], sun: 2.0, fog: "#28356c", bulbs: true, night: true },
};

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
const glowTex = canvasTexture(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
});
const glowSprite = (color, size, opacity = 0.9) => {
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
};
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

// ---------- Шестерёнка ----------
function gearShape(r, teeth, depth = 0.07, hole = 0.3) {
  const s = new T.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * pie * 2;
    const q = i % 4;
    const rr = q === 1 || q === 2 ? r : r * 0.8;
    const p = [Math.cos(a) * rr, Math.sin(a) * rr];
    i ? s.lineTo(...p) : s.moveTo(...p);
  }
  const h = new T.Path();
  h.absarc(0, 0, r * hole, 0, pie * 2, true);
  s.holes.push(h);
  const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const GEAR_GEO = gearShape(0.3, 10);
const GEAR_MAT = new T.MeshStandardMaterial({ color: "#ffc533", metalness: 0.9, roughness: 0.22, emissive: "#ff9a1f", emissiveIntensity: 0.35 });

// ---------- Пружинка ----------
class Helix extends T.Curve {
  constructor(r, turns, h) {
    super();
    Object.assign(this, { r, turns, h });
  }
  getPoint(t, target = new T.Vector3()) {
    const a = t * this.turns * pie * 2;
    return target.set(Math.cos(a) * this.r, t * this.h, Math.sin(a) * this.r);
  }
}

// ---------- Заводной зайчик Скок ----------
// Лицо модели смотрит в +z, спина (ключик, хвостик) — в −z. Группа turn поворачивает его вперёд по ходу,
// чуть-чуть к зрителю, чтобы мордочку было видно.
function bunny() {
  const g = new T.Group();
  const turn = new T.Group();
  turn.rotation.y = 0.98;
  g.add(turn);
  const cream = matte("#fff6ea", { roughness: 0.55 }),
    pink = matte("#ffa6c0", { roughness: 0.6 }),
    tin = glossy("#3fb4ff"),
    red = glossy("#ff4f6d");
  // Ножка-подставка и пружинка
  const foot = new T.Mesh(new T.CylinderGeometry(0.25, 0.27, 0.07, 26), red);
  foot.position.y = 0.035;
  turn.add(foot);
  const spring = new T.Mesh(new T.TubeGeometry(new Helix(0.15, 4.5, 0.22), 140, 0.022, 6), metal("#dfe6ef", { roughness: 0.2 }));
  spring.position.y = 0.065;
  turn.add(spring);
  const body = new T.Group();
  turn.add(body);
  // Туловище — жестяной комбинезон в горошек
  const dots = canvasTexture(128, 64, (x, w, h) => {
    x.fillStyle = "#3fb4ff";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#ffffff";
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) {
      x.beginPath();
      x.arc((i + (j % 2) * 0.5) * 15, j * 18 + 6, 3.4, 0, pie * 2);
      x.fill();
    }
  });
  const torso = new T.Mesh(new T.SphereGeometry(0.24, 26, 18), new T.MeshPhysicalMaterial({ map: dots, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  torso.scale.set(1, 1.08, 0.95);
  torso.position.y = 0.24;
  body.add(torso);
  const belly = new T.Mesh(new T.SphereGeometry(0.15, 18, 12), cream);
  belly.scale.set(1, 1.1, 0.5);
  belly.position.set(0, 0.24, 0.17);
  body.add(belly);
  const bow = new T.Group();
  for (const s of [-1, 1]) {
    const w = new T.Mesh(new T.ConeGeometry(0.06, 0.11, 10), red);
    w.rotation.z = (s * pie) / 2;
    w.position.x = s * 0.05;
    bow.add(w);
  }
  bow.add(new T.Mesh(new T.SphereGeometry(0.03, 10, 8), red));
  bow.position.set(0, 0.45, 0.17);
  body.add(bow);
  // Голова
  const head = new T.Group();
  head.position.y = 0.6;
  body.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(0.21, 24, 18), cream);
  skull.scale.set(1.05, 0.95, 1);
  head.add(skull);
  const muzzle = new T.Mesh(new T.SphereGeometry(0.1, 16, 12), matte("#ffffff", { roughness: 0.5 }));
  muzzle.scale.set(1.2, 0.8, 0.8);
  muzzle.position.set(0, -0.06, 0.16);
  head.add(muzzle);
  const nose = new T.Mesh(new T.SphereGeometry(0.035, 12, 8), glossy("#ff6f9f"));
  nose.scale.set(1.3, 0.9, 1);
  nose.position.set(0, -0.02, 0.24);
  head.add(nose);
  for (const s of [-1, 1]) {
    const white = new T.Mesh(new T.SphereGeometry(0.058, 14, 10), matte("#ffffff", { roughness: 0.3 }));
    white.position.set(s * 0.085, 0.05, 0.165);
    head.add(white);
    const eye = new T.Mesh(new T.SphereGeometry(0.042, 12, 8), glossy("#20162a", { roughness: 0.1 }));
    eye.position.set(s * 0.085, 0.045, 0.2);
    head.add(eye);
    const shine = new T.Mesh(new T.SphereGeometry(0.013, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(s * 0.085 + 0.013, 0.065, 0.238);
    head.add(shine);
    const cheek = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), pink);
    cheek.scale.set(1, 0.6, 0.4);
    cheek.position.set(s * 0.14, -0.04, 0.15);
    head.add(cheek);
  }
  const tooth = new T.Mesh(new RoundedBoxGeometry(0.05, 0.045, 0.02, 2, 0.008), matte("#ffffff"));
  tooth.position.set(0, -0.11, 0.2);
  head.add(tooth);
  // Уши
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new T.Group();
    ear.position.set(s * 0.09, 0.15, -0.02);
    ear.rotation.z = -s * 0.18;
    const outer = new T.Mesh(new T.CapsuleGeometry(0.055, 0.26, 6, 12), cream);
    outer.position.y = 0.17;
    outer.scale.z = 0.6;
    ear.add(outer);
    const inner = new T.Mesh(new T.CapsuleGeometry(0.03, 0.2, 4, 10), pink);
    inner.position.set(0, 0.17, 0.025);
    inner.scale.z = 0.4;
    ear.add(inner);
    head.add(ear);
    ears.push(ear);
  }
  // Лапки
  for (const s of [-1, 1]) {
    const arm = new T.Mesh(new T.CapsuleGeometry(0.045, 0.12, 4, 8), cream);
    arm.position.set(s * 0.23, 0.3, 0.05);
    arm.rotation.z = s * 0.6;
    body.add(arm);
  }
  // Хвостик и заводной ключик на спине
  const tail = new T.Mesh(new T.SphereGeometry(0.075, 12, 10), matte("#ffffff", { roughness: 0.9 }));
  tail.position.set(0, 0.12, -0.22);
  body.add(tail);
  const key = new T.Group();
  key.position.set(0, 0.3, -0.24);
  const gold = metal("#ffc533", { roughness: 0.25, emissive: "#ff9a1f", emissiveIntensity: 0.15 });
  const shaft = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.14, 10), gold);
  shaft.rotation.x = pie / 2;
  shaft.position.z = -0.05;
  key.add(shaft);
  for (const s of [-1, 1]) {
    const loop = new T.Mesh(new T.TorusGeometry(0.065, 0.022, 8, 18), gold);
    loop.position.set(s * 0.075, 0, -0.13);
    key.add(loop);
  }
  body.add(key);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  turn.scale.setScalar(1.15);
  return { group: g, turn, spring, body, head, ears, key, sv: 1, svv: 0, hop: 0 };
}

// ---------- Препятствия ----------
const STEEL = metal("#a3afc2", { roughness: 0.26 });
const STEEL_DARK = metal("#5c6678", { roughness: 0.4 });
function nutMesh() {
  const g = new T.Group();
  const nut = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.66, 6), STEEL);
  nut.rotation.y = pie / 6;
  nut.position.y = 0.33;
  g.add(nut);
  // Резьбовое отверстие сверху и фаска
  const hole = new T.Mesh(new T.CylinderGeometry(0.21, 0.21, 0.665, 22), STEEL_DARK);
  hole.position.y = 0.33;
  g.add(hole);
  const ring = new T.Mesh(new T.TorusGeometry(0.21, 0.025, 6, 22), STEEL);
  ring.rotation.x = pie / 2;
  ring.position.y = 0.665;
  g.add(ring);
  return g;
}
function boltMesh() {
  const g = new T.Group();
  const head = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.2, 6), STEEL);
  head.rotation.y = pie / 6;
  head.position.y = 0.1;
  g.add(head);
  const shaft = new T.Mesh(new T.CylinderGeometry(0.115, 0.115, 0.72, 16), STEEL);
  shaft.position.y = 0.2 + 0.36;
  g.add(shaft);
  for (let k = 0; k < 7; k++) {
    const t = new T.Mesh(new T.TorusGeometry(0.118, 0.022, 6, 16), STEEL);
    t.rotation.x = pie / 2 + 0.12;
    t.position.y = 0.3 + k * 0.095;
    g.add(t);
  }
  const tip = new T.Mesh(new T.ConeGeometry(0.115, 0.13, 16), STEEL);
  tip.position.y = 0.92 + 0.065;
  g.add(tip);
  return g;
}
const TACK_COLORS = ["#ff4f6d", "#ffc533", "#3f8cff", "#3fdc7a"];
function tackMesh(k) {
  const g = new T.Group();
  const head = new T.Mesh(new T.CylinderGeometry(0.27, 0.29, 0.1, 22), glossy(TACK_COLORS[k % TACK_COLORS.length]));
  head.position.y = 0.05;
  g.add(head);
  const dome = new T.Mesh(new T.SphereGeometry(0.16, 16, 8, 0, pie * 2, 0, pie / 2), glossy(TACK_COLORS[k % TACK_COLORS.length]));
  dome.position.y = 0.1;
  dome.scale.y = 0.5;
  g.add(dome);
  const pin = new T.Mesh(new T.ConeGeometry(0.07, 0.34, 12), STEEL);
  pin.position.y = 0.08 + 0.17;
  g.add(pin);
  return g;
}
const LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФ";
function blockMesh(o, k) {
  const g = new T.Group();
  const w = o.x1 - o.x0,
    h = o.y1;
  const color = new T.Color(o.color || "#ff6f8f");
  const box = new T.Mesh(new RoundedBoxGeometry(w, h, 1.3, 3, 0.07), glossy(color, { roughness: 0.4, clearcoat: 0.4 }));
  box.position.set(w / 2, h / 2, 0);
  box.castShadow = box.receiveShadow = true;
  g.add(box);
  // Буквы на передней стенке, как на детских кубиках
  const n = Math.max(1, Math.round(w / 1.1));
  const tex = canvasTexture(128 * n, 128, (x, cw, ch) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = "#ffffff";
      x.beginPath();
      x.roundRect(i * 128 + 14, 14, 100, 100, 18);
      x.fill();
      x.fillStyle = "#" + color.clone().multiplyScalar(0.75).getHexString();
      x.font = "900 76px system-ui, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(LETTERS[(k * 3 + i) % LETTERS.length], i * 128 + 64, 70);
    }
  });
  const side = Math.min(h * 0.82, 0.8);
  const face = new T.Mesh(new T.PlaneGeometry(Math.min(w - 0.2, side * n * 1.1), side), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 }));
  face.position.set(w / 2, h / 2, 0.652);
  g.add(face);
  return g;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.scene.fog = new T.Fog(0xdff7ef, 30, 70);
    this.camera = new T.PerspectiveCamera(42, 1, 0.1, 200);
    this.hemi = new T.HemisphereLight(0xffffff, 0xe0b890, 1.15);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff2dc, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 8, bottom: -8, near: 1, far: 50 });
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Светится только то, что ярче белого: гирлянды, искры, звёздочки (пастельная стена не «плывёт»)
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.glow = { on: true, slow: 0, seen: 0 };
    this.trackGroup = new T.Group();
    this.scene.add(this.trackGroup);
    this.makeParticles();
    // Зайчик живёт вне трассы — между трассами не пересоздаётся
    this.hero = bunny();
    this.scene.add(this.hero.group);
    this.stars = new T.Group();
    const starGeo = (() => {
      const s = new T.Shape();
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * pie * 2 + pie / 2,
          r = i % 2 ? 0.045 : 0.11;
        i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      return new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
    })();
    for (let k = 0; k < 3; k++) this.stars.add(new T.Mesh(starGeo, new T.MeshBasicMaterial({ color: new T.Color(2, 1.7, 0.4), toneMapped: false })));
    this.stars.visible = false;
    this.scene.add(this.stars);
    this.cam = { off: new T.Vector3(3, 4, 14), look: new T.Vector3(4.5, 1.2, 0), y: 0 };
    this.resize = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.fitCamera();
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    this.onFrame = null;
    this.last = 0;
    this.renderer.setAnimationLoop((ms) => this.frame(ms));
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.time, dur: this.motion.matches ? seconds * 0.5 : seconds, update, done }));
  }
  // ---------- Камера ----------
  // Подбор камеры под форму экрана: впереди игрушки должно быть видно не меньше AHEAD единиц
  // (тогда первое препятствие видно за 1,2 с до последнего момента отрыва — GR-4), сзади немного,
  // сверху — вся дуга прыжка. В узком экране камера поворачивается вдоль верстака.
  fitCamera(AHEAD = 11) {
    const cam = this.camera,
      a = cam.aspect;
    // Узкий экран: камера поворачивается вдоль верстака (вид три четверти) и смотрит шире
    const wide = clamp((a - 0.5) / 1.0, 0, 1);
    const yaw = T.MathUtils.lerp(1.0, 0.2, wide),
      pitch = T.MathUtils.lerp(0.42, 0.3, wide);
    cam.fov = T.MathUtils.lerp(56, 42, wide);
    cam.updateProjectionMatrix();
    const dir = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const pts = [new T.Vector3(AHEAD, 0.15, 0), new T.Vector3(-2.2, 0, 0), new T.Vector3(-1.2, 3.3, 0), new T.Vector3(AHEAD, 3.0, 0), new T.Vector3(0, -0.55, 0.9)];
    const v = new T.Vector3();
    const fits = (look, dist) => {
      cam.position.copy(look).addScaledVector(dir, -dist);
      cam.lookAt(look);
      cam.updateMatrixWorld();
      return pts.every((p) => {
        v.copy(p).project(cam);
        return v.z < 1 && Math.abs(v.x) <= 0.95 && v.y >= -0.92 && v.y <= 0.74;
      });
    };
    let best = null;
    for (let lx = 1.5; lx <= 10; lx += 0.25) {
      const look = new T.Vector3(lx, 1.15, 0);
      let lo = 3,
        hi = 80;
      if (!fits(look, hi)) continue;
      for (let k = 0; k < 22; k++) {
        const m = (lo + hi) / 2;
        fits(look, m) ? (hi = m) : (lo = m);
      }
      if (!best || hi < best.dist) best = { lx, dist: hi };
    }
    best = best || { lx: 4.5, dist: 20 };
    // По высоте: опустить верстак к низу экрана, если по ширине место есть (меньше пустого пола)
    const dist = best.dist * 1.02;
    let ly = 1.15;
    for (let y = 1.15; y <= 4; y += 0.05) {
      const look = new T.Vector3(best.lx, y, 0);
      if (!fits(look, dist)) break;
      v.copy(pts[4]).project(cam);
      ly = y;
      if (v.y <= -0.82) break;
    }
    this.cam.look.set(best.lx, ly, 0);
    this.cam.yaw = yaw;
    // Мордочка и шестерёнки — к зрителю: при виде сзади-сбоку зайчик чуть поворачивается к камере
    this.hero.turn.rotation.y = 0.98 - (yaw - 0.2) * 0.55;
    for (const g of this.gears || []) g.g.rotation.y = -yaw * 0.85;
    this.cam.off.copy(dir).multiplyScalar(-dist);
    this.cam.dist = dist;
    // Туман только вдали — за стеной и в конце верстака
    this.scene.fog.near = dist + 10;
    this.scene.fog.far = dist + 55;
  }
  // Видна ли точка трассы, когда игрушка стоит в heroX на опоре supY (для проверки GR-4)
  visibleFrom(heroX, supY, px, py) {
    const cam = this.camera.clone();
    const look = new T.Vector3(heroX, supY, 0).add(this.cam.look);
    cam.position.copy(look).add(this.cam.off);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    const v = new T.Vector3(px, py, 0).project(cam);
    return { ok: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, x: +v.x.toFixed(3), y: +v.y.toFixed(3) };
  }
  // ---------- Трасса ----------
  setTrack(def, P) {
    const G = this.trackGroup;
    G.traverse((o) => {
      if (o.geometry && o.geometry !== GEAR_GEO) o.geometry.dispose();
    });
    G.clear();
    this.def = def;
    this.P = P;
    const th = THEMES[def.theme] || THEMES.bench;
    this.theme = th;
    const R = rng(def.end * 7 + def.things.length);
    const x0 = def.start - 16,
      x1 = def.end + 18,
      L = x1 - x0;
    this.scene.background = new T.Color(th.fog);
    this.scene.fog.color.set(th.fog);
    this.hemi.color.set(th.hemi[0]);
    this.hemi.groundColor.set(th.hemi[1]);
    this.hemi.intensity = th.hemi[2];
    this.sun.color.set(th.light);
    this.sun.intensity = th.sun;
    // Верстак: доски вдоль, тёплое дерево с прожилками
    const wood = canvasTexture(1024, 256, (x, w, h) => {
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        x.fillStyle = th.wood[r % 2];
        x.fillRect(0, (r * h) / rows, w, h / rows);
        x.strokeStyle = "rgba(120,70,30,0.18)";
        x.lineWidth = 2;
        for (let k = 0; k < 7; k++) {
          x.beginPath();
          const y = (r * h) / rows + 6 + k * 7 + Math.sin(k + r) * 2;
          x.moveTo(0, y);
          for (let px = 0; px <= w; px += 32) x.lineTo(px, y + Math.sin(px / 90 + k * 1.7 + r) * 3);
          x.stroke();
        }
        x.fillStyle = "rgba(90,50,20,0.35)";
        x.fillRect(0, (r * h) / rows, w, 3);
        // Сучки
        x.fillStyle = "rgba(140,80,35,0.35)";
        x.beginPath();
        x.ellipse(((r * 397) % w) + 60, (r * h) / rows + 25, 14, 6, 0, 0, pie * 2);
        x.fill();
      }
    });
    wood.wrapS = wood.wrapT = T.RepeatWrapping;
    wood.repeat.set(L / 8, 1);
    const edge = canvasTexture(512, 64, (x, w, h) => {
      x.fillStyle = th.wood[2];
      x.fillRect(0, 0, w, h);
      x.strokeStyle = "rgba(90,50,20,0.25)";
      for (let k = 0; k < 6; k++) {
        x.beginPath();
        x.moveTo(0, 8 + k * 9);
        for (let px = 0; px <= w; px += 24) x.lineTo(px, 8 + k * 9 + Math.sin(px / 60 + k) * 2);
        x.stroke();
      }
    });
    edge.wrapS = T.RepeatWrapping;
    edge.repeat.set(L / 6, 1);
    const topMat = new T.MeshStandardMaterial({ map: wood, roughness: 0.75 });
    const edgeMat = new T.MeshStandardMaterial({ map: edge, roughness: 0.8 });
    const bench = new T.Mesh(new T.BoxGeometry(L, 0.9, 6), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
    bench.position.set(x0 + L / 2, -0.45, -0.9);
    bench.receiveShadow = true;
    G.add(bench);
    // Стена мастерской: перфорированная доска с крючками
    const peg = canvasTexture(256, 256, (x, w, h) => {
      x.fillStyle = th.wall;
      x.fillRect(0, 0, w, h);
      x.fillStyle = th.dots;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        x.beginPath();
        x.arc(16 + i * 32, 16 + j * 32, 4.5, 0, pie * 2);
        x.fill();
      }
    });
    peg.wrapS = peg.wrapT = T.RepeatWrapping;
    peg.repeat.set(L / 4, 4);
    const wall = new T.Mesh(new T.PlaneGeometry(L, 16), new T.MeshStandardMaterial({ map: peg, roughness: 0.95 }));
    wall.position.set(x0 + L / 2, 7, -6);
    wall.receiveShadow = true;
    G.add(wall);
    // Пол под верстаком (виден в узком экране)
    const floor = new T.Mesh(new T.PlaneGeometry(L, 30), matte(th.night ? "#3a3050" : "#e8d2b8"));
    floor.rotation.x = -pie / 2;
    floor.position.set(x0 + L / 2, -3.5, 5);
    G.add(floor);
    this.decorate(def, th, R, x0, x1);
    // Препятствия
    this.obsMeshes = P.obs.map((o, k) => {
      let m;
      if (o.solid) m = blockMesh(o, k);
      else if (o.kind === "nut") m = nutMesh();
      else if (o.kind === "bolt") m = boltMesh();
      else {
        m = new T.Group();
        for (let q = 0; q < o.n; q++) {
          const t = tackMesh(q + k);
          t.position.x = 0.31 + q * 0.62;
          m.add(t);
        }
      }
      if (!o.solid) m.position.set(o.kind === "tacks" ? o.x0 : (o.x0 + o.x1) / 2, o.y0, 0);
      else m.position.set(o.x0, 0, 0);
      m.traverse((q) => {
        if (q.isMesh) {
          q.castShadow = true;
          if (!o.solid) q.material = q.material.clone();
        }
      });
      // Красное свечение при столкновении
      const halo = glowSprite("#ff3050", 2.2, 0);
      halo.position.set(o.solid ? (o.x1 - o.x0) / 2 : o.kind === "tacks" ? (o.x1 - o.x0) / 2 : 0, (o.y1 - o.y0) / 2, 0.4);
      m.add(halo);
      G.add(m);
      return { m, o, halo, flash: 0 };
    });
    // Шестерёнки
    this.gears = def.gears.map(([x, y], k) => {
      const g = new T.Group();
      const m = new T.Mesh(GEAR_GEO, GEAR_MAT);
      m.castShadow = true;
      g.add(m);
      const halo = glowSprite("#ffd84a", 0.95, 0.55);
      g.add(halo);
      g.position.set(x, y, 0);
      g.rotation.y = -(this.cam.yaw || 0) * 0.85;
      G.add(g);
      return { g, m, x, y, k, taken: false };
    });
    // Флажки на карандашах
    this.flags = def.checks.map((cx, k) => {
      const g = new T.Group();
      const pencil = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.7, 6), glossy(["#ffc533", "#3fb4ff", "#ff6f8f", "#3fdc7a"][k % 4]));
      pencil.position.y = 0.85;
      g.add(pencil);
      const eraser = new T.Mesh(new T.CylinderGeometry(0.065, 0.065, 0.14, 12), matte("#ff9fb8"));
      eraser.position.y = 1.77;
      g.add(eraser);
      const base = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 0.16, 20), glossy("#ffffff"));
      base.position.y = 0.08;
      g.add(base);
      const flag = new T.Mesh(new T.PlaneGeometry(0.75, 0.48, 6, 1), new T.MeshStandardMaterial({ color: "#ffffff", side: T.DoubleSide, roughness: 0.6 }));
      flag.geometry.translate(0.375, 0, 0);
      flag.position.set(0.06, 1.5, 0);
      g.add(flag);
      g.position.set(cx, this.supportAt(cx), -0.95);
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(g);
      return { g, flag, passed: false, x: cx };
    });
    // Старт: заводная подставка с табличкой; финиш: коробка с деталями
    G.add(this.startStand(def.start));
    this.box = this.partsBox(def.end);
    G.add(this.box.g);
    // Полоски «прыгай здесь»: в учебной трассе всегда, в остальных — после двух ошибок у одного места
    this.bands = P.steps.map((s) => {
      const y = this.supportAt(s.a) + 0.012;
      const band = new T.Mesh(
        new T.PlaneGeometry(s.b - s.a + HERO.w * 0.4, 1.1),
        new T.MeshBasicMaterial({
          map: canvasTexture(256, 96, (x, w, h) => {
            x.fillStyle = "rgba(80,240,140,0.55)";
            x.beginPath();
            x.roundRect(4, 4, w - 8, h - 8, 26);
            x.fill();
            x.strokeStyle = "rgba(255,255,255,0.95)";
            x.lineWidth = 6;
            x.setLineDash([16, 12]);
            x.stroke();
            x.fillStyle = "#ffffff";
            x.font = "900 52px system-ui, sans-serif";
            x.textAlign = "center";
            x.textBaseline = "middle";
            x.fillText("прыг!", w / 2, h / 2 + 3);
          }),
          transparent: true,
          depthWrite: false,
        }),
      );
      band.rotation.x = -pie / 2;
      band.position.set((s.a + s.b) / 2, y, 0.15);
      band.visible = !!def.training;
      band.renderOrder = 2;
      G.add(band);
      return band;
    });
    // Метка отрыва и след прыжка после столкновения
    this.mark = new T.Mesh(
      new T.PlaneGeometry(0.7, 0.7),
      new T.MeshBasicMaterial({
        map: canvasTexture(128, 128, (x) => {
          x.strokeStyle = "#ffffff";
          x.lineWidth = 16;
          x.lineCap = "round";
          x.beginPath();
          x.moveTo(24, 24);
          x.lineTo(104, 104);
          x.moveTo(104, 24);
          x.lineTo(24, 104);
          x.stroke();
        }),
        transparent: true,
        depthWrite: false,
        color: "#ff5f7a",
      }),
    );
    this.mark.rotation.x = -pie / 2;
    this.mark.visible = false;
    this.mark.renderOrder = 3;
    G.add(this.mark);
    this.trail = new T.InstancedMesh(new T.SphereGeometry(0.045, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }), 80);
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    G.add(this.trail);
    this.path = [];
    // Зайчик на старт
    const h = this.hero;
    h.group.position.set(def.start, this.supportAt(def.start), 0);
    h.group.rotation.set(0, 0, 0);
    h.group.visible = true;
    h.group.scale.setScalar(1);
    this.cam.y = this.supportAt(def.start);
    this.hitT = -9;
    this.finishT = null;
  }
  supportAt(x) {
    let s = 0;
    for (const o of this.P.obs) if (o.solid && x > o.x0 - 0.01 && x < o.x1 + 0.01 && o.y1 > s) s = o.y1;
    return s;
  }
  startStand(x) {
    const g = new T.Group();
    const disk = new T.Mesh(new T.CylinderGeometry(0.75, 0.85, 0.12, 30), glossy("#ff6f8f"));
    disk.position.set(x, 0.06 - 0.12, 0);
    disk.receiveShadow = true;
    g.add(disk);
    const sign = new T.Mesh(
      new T.PlaneGeometry(1.4, 0.55),
      new T.MeshBasicMaterial({
        map: canvasTexture(256, 100, (c, w, h) => {
          c.fillStyle = "#3fb4ff";
          c.beginPath();
          c.roundRect(4, 4, w - 8, h - 8, 26);
          c.fill();
          c.fillStyle = "#fff";
          c.font = "900 56px system-ui, sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("СТАРТ", w / 2, h / 2 + 3);
        }),
        transparent: true,
      }),
    );
    sign.position.set(x - 0.6, 1.8, -1.2);
    g.add(sign);
    const pole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.6, 8), glossy("#ffffff"));
    pole.position.set(x - 0.6, 0.8, -1.25);
    g.add(pole);
    return g;
  }
  partsBox(x) {
    const g = new T.Group();
    const card = matte("#e2b07a", { roughness: 0.9 }),
      cardIn = matte("#c8945c", { roughness: 0.95 });
    const W = 3.2,
      D = 2.4,
      H = 1.15;
    const bottom = new T.Mesh(new T.BoxGeometry(W, 0.06, D), cardIn);
    bottom.position.set(W / 2, 0.03, 0);
    g.add(bottom);
    const walls = [
      [W, H, 0.06, W / 2, H / 2, D / 2],
      [W, H, 0.06, W / 2, H / 2, -D / 2],
      [0.06, H * 0.55, D, 0, (H * 0.55) / 2, 0],
      [0.06, H, D, W, H / 2, 0],
    ];
    for (const [w, h, d, px, py, pz] of walls) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), card);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    // Открытые клапаны
    const flaps = [];
    for (const [pz, s] of [[D / 2, 1], [-D / 2, -1]]) {
      const f = new T.Group();
      f.position.set(W / 2, H, pz);
      const p = new T.Mesh(new T.BoxGeometry(W, 0.05, D * 0.45), card);
      p.position.z = (s * D * 0.45) / 2;
      f.add(p);
      f.rotation.x = s * 0.5;
      g.add(f);
      flaps.push(f);
    }
    // Надпись и детали внутри
    const label = new T.Mesh(
      new T.PlaneGeometry(2.4, 0.6),
      new T.MeshBasicMaterial({
        map: canvasTexture(400, 100, (c, w, h) => {
          c.fillStyle = "#fff6e0";
          c.beginPath();
          c.roundRect(4, 4, w - 8, h - 8, 20);
          c.fill();
          c.fillStyle = "#c0603a";
          c.font = "900 58px system-ui, sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("⚙ ДЕТАЛИ ⚙", w / 2, h / 2 + 3);
        }),
        transparent: true,
      }),
    );
    label.position.set(W / 2, H * 0.55, D / 2 + 0.04);
    g.add(label);
    const R = rng(7);
    for (let k = 0; k < 16; k++) {
      const c = ["#ff4f6d", "#ffc533", "#3fb4ff", "#3fdc7a", "#b47cff"][k % 5];
      const geo = [new T.SphereGeometry(0.16, 12, 10), new T.BoxGeometry(0.26, 0.26, 0.26), new T.CylinderGeometry(0.12, 0.12, 0.3, 12)][k % 3];
      const m = new T.Mesh(geo, glossy(c));
      m.position.set(0.4 + R() * (W - 0.8), 0.2 + R() * 0.35, (R() - 0.5) * (D - 0.6));
      m.rotation.set(R() * 3, R() * 3, R() * 3);
      g.add(m);
    }
    const shine = glowSprite("#ffe066", 3.2, 0.5);
    shine.position.set(W / 2, H + 0.3, 0);
    g.add(shine);
    g.position.set(x, 0, 0);
    return { g, flaps, shine };
  }
  // Убранство: на стене полки с игрушками, инструменты, окна, гирлянды; на верстаке банки, катушки, карандаши
  decorate(def, th, R, x0, x1) {
    const G = this.trackGroup;
    const add = (m, x, y, z, ry = 0) => {
      m.position.set(x, y, z);
      m.rotation.y = ry;
      G.add(m);
      return m;
    };
    const bright = ["#ff6f8f", "#ffc533", "#3fb4ff", "#3fdc7a", "#b47cff", "#ff8f3f"];
    const pick = (a) => a[Math.floor(R() * a.length)];
    // Окна с небом
    for (let x = x0 + 10; x < x1; x += 34 + R() * 10) {
      const win = new T.Group();
      const sky = new T.Mesh(
        new T.PlaneGeometry(4.2, 3.2),
        new T.MeshBasicMaterial({
          map: canvasTexture(256, 196, (c, w, h) => {
            const g = c.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, th.bulbs && def.theme === "workshop" ? "#1b2458" : "#6fc8ff");
            g.addColorStop(1, th.bulbs && def.theme === "workshop" ? "#5a4aa0" : "#d8f2ff");
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
            if (def.theme === "workshop") {
              c.fillStyle = "#fff6c8";
              c.beginPath();
              c.arc(190, 50, 22, 0, pie * 2);
              c.fill();
              c.fillStyle = "#1b2458";
              c.beginPath();
              c.arc(200, 44, 20, 0, pie * 2);
              c.fill();
              c.fillStyle = "#ffffff";
              for (let k = 0; k < 30; k++) c.fillRect((k * 53) % w, (k * 37) % (h * 0.7), 2, 2);
            } else {
              c.fillStyle = "#fff3a0";
              c.beginPath();
              c.arc(60, 50, 26, 0, pie * 2);
              c.fill();
              c.fillStyle = "#ffffff";
              for (const [cx, cy] of [[160, 60], [200, 110], [90, 130]]) {
                c.beginPath();
                c.arc(cx, cy, 18, 0, pie * 2);
                c.arc(cx + 20, cy - 6, 22, 0, pie * 2);
                c.arc(cx + 42, cy, 16, 0, pie * 2);
                c.fill();
              }
              c.fillStyle = "#8fe07a";
              c.beginPath();
              c.ellipse(128, h + 30, 200, 60, 0, 0, pie * 2);
              c.fill();
            }
          }),
          toneMapped: false,
          color: new T.Color(1.15, 1.15, 1.15),
        }),
      );
      win.add(sky);
      const frameMat = glossy("#ffffff");
      for (const [w, h, px, py] of [[4.5, 0.2, 0, 1.7], [4.5, 0.2, 0, -1.7], [0.2, 3.6, -2.2, 0], [0.2, 3.6, 2.2, 0], [0.12, 3.4, 0, 0], [4.3, 0.12, 0, 0]]) {
        const f = new T.Mesh(new T.BoxGeometry(w, h, 0.16), frameMat);
        f.position.set(px, py, 0.08);
        win.add(f);
      }
      add(win, x, 5.2, -5.9);
    }
    // Полки с игрушками
    for (let x = x0 + 26; x < x1; x += 34 + R() * 10) {
      const shelf = new T.Mesh(new RoundedBoxGeometry(6, 0.18, 1.1, 2, 0.05), glossy(th.wood[1], { roughness: 0.6, clearcoat: 0.2 }));
      add(shelf, x, 3.3, -5.4);
      for (let k = 0; k < 4; k++) G.add(this.toy(k + Math.floor(R() * 6), x - 2.2 + k * 1.45, 3.4, -5.4, pick(bright)));
    }
    // Инструменты на перфорированной доске
    for (let x = x0 + 4; x < x1; x += 9 + R() * 7) {
      const t = this.tool(Math.floor(R() * 4), pick(bright));
      t.rotation.z = (R() - 0.5) * 0.4;
      add(t, x, 2.3 + R() * 1.4, -5.85);
    }
    // Гирлянда
    if (th.bulbs) {
      const n = Math.floor((x1 - x0) / 0.9);
      const bulbs = new T.InstancedMesh(new T.SphereGeometry(0.11, 10, 8), new T.MeshBasicMaterial({ toneMapped: false }), n);
      const d = new T.Object3D();
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 0.9,
          sag = Math.abs(Math.sin((x * pie) / 9));
        d.position.set(x, 6.9 - sag * 0.9, -5.5);
        d.updateMatrix();
        bulbs.setMatrixAt(i, d.matrix);
        bulbs.setColorAt(i, new T.Color(bright[i % bright.length]).multiplyScalar(2.2));
      }
      G.add(bulbs);
      this.bulbs = bulbs;
    } else this.bulbs = null;
    // На верстаке позади дорожки
    const free = (x, r) => !this.P.obs.some((o) => o.solid && x + r > o.x0 - 0.5 && x - r < o.x1 + 0.5) && !def.checks.some((c) => Math.abs(c - x) < r + 0.6);
    for (let x = x0 + 2; x < x1 - 2; x += 1.6 + R() * 2.4) {
      const z = -2.5 - R() * 1.1;
      const kind = [0, 1, 2, 3, 5][Math.floor(R() * 5)];
      if (!free(x, 0.8)) continue;
      // Фон спокойнее препятствий: цвета приглушены к цвету дерева
      G.add(this.prop(kind, x, z, R, "#" + new T.Color(pick(bright)).lerp(new T.Color(th.wood[0]), 0.35).getHexString(), def));
    }
    // Спереди — низкие мелочи: пуговицы, мелки, скрепки
    for (let x = x0 + 1; x < x1; x += 1.2 + R() * 2) {
      const z = 1.2 + R() * 0.8;
      const c = pick(bright);
      const k = Math.floor(R() * 3);
      let m;
      if (k === 0) {
        m = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.06, 18), glossy(c));
        m.position.y = 0.03;
      } else if (k === 1) {
        m = new T.Group();
        const body = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.7, 8), glossy(c));
        body.rotation.z = pie / 2;
        m.add(body);
        const tip = new T.Mesh(new T.ConeGeometry(0.06, 0.14, 8), glossy(c));
        tip.rotation.z = -pie / 2;
        tip.position.x = 0.42;
        m.add(tip);
        m.position.y = 0.06;
        m.rotation.y = R() * pie;
      } else {
        m = new T.Mesh(new T.TorusGeometry(0.14, 0.02, 6, 16), metal("#d0d8e4"));
        m.rotation.x = pie / 2;
        m.scale.set(1, 1.8, 1);
        m.position.y = 0.02;
      }
      m.position.x = x;
      m.position.z = z;
      m.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(m);
    }
  }
  toy(kind, x, y, z, color) {
    const g = new T.Group();
    const c = glossy(color);
    const k = kind % 6;
    if (k === 0) {
      // Мячик
      const b = new T.Mesh(new T.SphereGeometry(0.4, 20, 14), c);
      b.position.y = 0.4;
      g.add(b);
      const s = new T.Mesh(new T.TorusGeometry(0.4, 0.06, 8, 24), glossy("#ffffff"));
      s.position.y = 0.4;
      g.add(s);
    } else if (k === 1) {
      // Ракета
      const b = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.7, 16), glossy("#ffffff"));
      b.position.y = 0.45;
      g.add(b);
      const n = new T.Mesh(new T.ConeGeometry(0.22, 0.35, 16), c);
      n.position.y = 0.97;
      g.add(n);
      for (let i = 0; i < 3; i++) {
        const f = new T.Mesh(new T.BoxGeometry(0.04, 0.3, 0.25), c);
        f.position.set(Math.cos((i * pie * 2) / 3) * 0.22, 0.2, Math.sin((i * pie * 2) / 3) * 0.22);
        f.rotation.y = (-i * pie * 2) / 3;
        g.add(f);
      }
    } else if (k === 2) {
      // Мишка
      const fur = matte(color === "#3fb4ff" ? "#c8946e" : "#d8a070");
      const b = new T.Mesh(new T.SphereGeometry(0.3, 16, 12), fur);
      b.position.y = 0.3;
      g.add(b);
      const h = new T.Mesh(new T.SphereGeometry(0.22, 16, 12), fur);
      h.position.y = 0.72;
      g.add(h);
      for (const s of [-1, 1]) {
        const e = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), fur);
        e.position.set(s * 0.16, 0.9, 0);
        g.add(e);
      }
      const bow = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), c);
      bow.position.set(0, 0.52, 0.22);
      g.add(bow);
    } else if (k === 3) {
      // Пирамидка
      for (let i = 0; i < 4; i++) {
        const r = new T.Mesh(new T.TorusGeometry(0.3 - i * 0.06, 0.08, 10, 20), glossy(["#ff4f6d", "#ffc533", "#3fdc7a", "#3fb4ff"][i]));
        r.rotation.x = pie / 2;
        r.position.y = 0.09 + i * 0.16;
        g.add(r);
      }
      const top = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), glossy("#b47cff"));
      top.position.y = 0.72;
      g.add(top);
    } else if (k === 4) {
      // Машинка
      const b = new T.Mesh(new RoundedBoxGeometry(0.8, 0.28, 0.45, 2, 0.08), c);
      b.position.y = 0.28;
      g.add(b);
      const cab = new T.Mesh(new RoundedBoxGeometry(0.42, 0.22, 0.4, 2, 0.06), glossy("#ffffff"));
      cab.position.set(-0.05, 0.5, 0);
      g.add(cab);
      for (const [px, pz] of [[-0.25, 0.22], [0.25, 0.22], [-0.25, -0.22], [0.25, -0.22]]) {
        const w = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.08, 14), matte("#333"));
        w.rotation.x = pie / 2;
        w.position.set(px, 0.13, pz);
        g.add(w);
      }
    } else {
      // Кубики стопкой
      for (let i = 0; i < 3; i++) {
        const b = new T.Mesh(new RoundedBoxGeometry(0.34, 0.34, 0.34, 2, 0.05), glossy(["#ff6f8f", "#ffc533", "#3fb4ff"][i]));
        b.position.set((i - 1) * 0.12, 0.17 + i * 0.34, 0);
        b.rotation.y = i * 0.4;
        g.add(b);
      }
    }
    g.position.set(x, y, z);
    return g;
  }
  tool(kind, color) {
    const g = new T.Group();
    const handle = glossy(color);
    if (kind === 0) {
      // Молоток
      const h = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 1.3, 10), handle);
      g.add(h);
      const head = new T.Mesh(new RoundedBoxGeometry(0.75, 0.25, 0.22, 2, 0.04), STEEL);
      head.position.y = 0.7;
      g.add(head);
    } else if (kind === 1) {
      // Отвёртка
      const h = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.5, 12), handle);
      h.position.y = -0.3;
      g.add(h);
      const s = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.8, 8), STEEL);
      s.position.y = 0.35;
      g.add(s);
    } else if (kind === 2) {
      // Гаечный ключ
      const s = new T.Mesh(new RoundedBoxGeometry(0.16, 1.2, 0.06, 2, 0.03), STEEL);
      g.add(s);
      for (const y of [-0.62, 0.62]) {
        const r = new T.Mesh(new T.TorusGeometry(0.15, 0.06, 6, 14, pie * 1.5), STEEL);
        r.position.y = y;
        r.rotation.z = y > 0 ? -pie * 0.25 : pie * 0.75;
        g.add(r);
      }
      const grip = new T.Mesh(new RoundedBoxGeometry(0.2, 0.5, 0.08, 2, 0.04), handle);
      g.add(grip);
    } else {
      // Ножницы
      for (const s of [-1, 1]) {
        const blade = new T.Mesh(new RoundedBoxGeometry(0.1, 0.8, 0.04, 2, 0.02), STEEL);
        blade.position.set(s * 0.06, 0.35, 0);
        blade.rotation.z = s * 0.15;
        g.add(blade);
        const ring = new T.Mesh(new T.TorusGeometry(0.14, 0.045, 8, 18), handle);
        ring.position.set(s * 0.16, -0.2, 0);
        g.add(ring);
      }
    }
    return g;
  }
  prop(kind, x, z, R, color, def) {
    const g = new T.Group();
    if (kind === 0) {
      // Банка с краской
      const can = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.6, 20), metal("#e8eef4", { roughness: 0.35 }));
      can.position.y = 0.3;
      g.add(can);
      const paint = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.24, 20), glossy(color));
      paint.position.y = 0.45;
      g.add(paint);
      const lid = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.05, 20), glossy(color));
      lid.position.set(0.15, 0.03, 0.4);
      lid.rotation.x = 0.1;
      g.add(lid);
    } else if (kind === 1) {
      // Катушка ниток
      const s = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.5, 18), matte(color, { roughness: 0.95 }));
      s.position.y = 0.3;
      g.add(s);
      for (const y of [0.04, 0.56]) {
        const r = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.08, 18), glossy("#e8c090"));
        r.position.y = y;
        g.add(r);
      }
    } else if (kind === 2) {
      // Стакан с карандашами
      const cup = new T.Mesh(new T.CylinderGeometry(0.3, 0.26, 0.7, 18), glossy(color));
      cup.position.y = 0.35;
      g.add(cup);
      for (let k = 0; k < 5; k++) {
        const p = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 1.1, 6), glossy(["#ff4f6d", "#ffc533", "#3fb4ff", "#3fdc7a", "#b47cff"][k]));
        p.position.set((k - 2) * 0.08, 0.85, (k % 2) * 0.08 - 0.04);
        p.rotation.z = (k - 2) * 0.12;
        g.add(p);
      }
    } else if (kind === 3) {
      // Коробочка с винтиками
      const b = new T.Mesh(new RoundedBoxGeometry(0.9, 0.35, 0.6, 2, 0.06), glossy(color));
      b.position.y = 0.175;
      g.add(b);
      for (let k = 0; k < 6; k++) {
        const s = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.05, 6), STEEL);
        s.position.set(-0.3 + (k % 3) * 0.3, 0.37, -0.12 + Math.floor(k / 3) * 0.24);
        g.add(s);
      }
    } else if (kind === 4) {
      // Тюбик клея / игрушечный кораблик — для швейной темы игольница
      if (def.theme === "sewing") {
        const cushion = new T.Mesh(new T.SphereGeometry(0.4, 18, 12), matte("#ff6f8f", { roughness: 0.95 }));
        cushion.scale.y = 0.7;
        cushion.position.y = 0.25;
        g.add(cushion);
        for (let k = 0; k < 6; k++) {
          const pin = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), glossy(["#ffc533", "#3fb4ff", "#3fdc7a"][k % 3]));
          const a = k * 1.1;
          pin.position.set(Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.2);
          g.add(pin);
        }
      } else {
        const hull = new T.Mesh(new RoundedBoxGeometry(0.9, 0.3, 0.4, 2, 0.1), glossy(color));
        hull.position.y = 0.15;
        g.add(hull);
        const mast = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.8, 6), glossy("#ffffff"));
        mast.position.y = 0.6;
        g.add(mast);
        const sail = new T.Mesh(new T.ConeGeometry(0.3, 0.6, 3), matte("#ffffff"));
        sail.position.set(0.12, 0.62, 0);
        sail.scale.z = 0.1;
        g.add(sail);
      }
    } else {
      // Линейка
      const r = new T.Mesh(
        new T.BoxGeometry(2.2, 0.04, 0.32),
        new T.MeshStandardMaterial({
          map: canvasTexture(256, 32, (c, w, h) => {
            c.fillStyle = "#ffd84a";
            c.fillRect(0, 0, w, h);
            c.fillStyle = "#6a4a20";
            for (let i = 0; i < 44; i++) c.fillRect(i * 6, 0, 1.5, i % 5 ? 8 : 16);
          }),
        }),
      );
      r.position.y = 0.02;
      r.rotation.y = 0.15;
      g.add(r);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    g.position.set(x, 0, z);
    g.rotation.y = (R() - 0.5) * 0.8;
    return g;
  }
  // ---------- События ----------
  event(e, run) {
    const h = this.hero,
      hx = run.hero.x,
      hy = run.hero.y;
    if (e.type === "jump") {
      h.svv += 5;
      this.puff(new T.Vector3(hx, hy + 0.05, 0), 4, "#ffffff");
      this.path = [];
    } else if (e.type === "land") {
      h.svv -= 7;
      this.puff(new T.Vector3(hx, hy + 0.05, 0), 5, "#f6e2c8");
    } else if (e.type === "gear") {
      const g = this.gears[e.g.id];
      if (g && !g.taken) {
        g.taken = true;
        const at = g.g.position.clone();
        this.burst(at, 14, ["#ffd84a", "#ffffff", "#ffb02e"], 3);
        this.tween(0.25, (p) => {
          g.g.scale.setScalar(Math.max(0.001, 1 + p * 0.6 - p * p * 1.6));
          g.g.visible = p < 1;
        });
      }
    } else if (e.type === "check") {
      const f = this.flags[e.i - 1];
      if (f && !f.passed) {
        f.passed = true;
        f.flag.material.color.set("#3fdc7a");
        this.burst(f.g.position.clone().add(new T.Vector3(0.4, 1.5, 0)), 16, ["#3fdc7a", "#ffffff", "#ffd84a"], 3);
      }
    } else if (e.type === "hit") {
      this.hitT = this.time;
      const v = this.obsMeshes[e.o.i];
      if (v) v.flash = this.time;
      // Метка отрыва и след полёта
      if (e.takeoff !== null && e.advice !== "jump") {
        this.mark.position.set(e.takeoff, this.supportAt(e.takeoff) + 0.015, 0.15);
        this.mark.visible = true;
      }
      this.showTrail(e.advice !== "jump");
      this.burst(new T.Vector3(hx + 0.3, hy + 0.6, 0.2), 10, ["#ffffff", "#ffd84a"], 2.5);
      // Правильное место для прыжка — зелёная полоска рядом с крестиком
      const s = this.P.cover.get(e.o.i) || this.P.steps.find((q) => q.o === e.o);
      const k = this.P.steps.indexOf(s);
      if (k >= 0) {
        this.flashBand = k;
        this.bands[k].visible = true;
      }
      // Камера отъезжает назад, чтобы были видны и крестик, и зелёная полоска
      this.hitFocus = Math.min(e.takeoff ?? hx, s ? s.a : hx);
    } else if (e.type === "respawn") {
      this.mark.visible = false;
      this.trail.count = 0;
      if (this.flashBand !== undefined && !this.def.training && !this.keepBand?.has(this.flashBand)) this.bands[this.flashBand].visible = false;
      this.flashBand = undefined;
      this.path = [];
      h.group.position.set(run.hero.x, run.hero.y, 0);
      this.burst(new T.Vector3(run.hero.x, run.hero.y + 0.6, 0), 18, ["#ffffff", "#7fe8ff", "#ffd84a"], 2.5);
    } else if (e.type === "finish") {
      this.finishT = this.time;
      this.finishFrom = h.group.position.clone();
    }
  }
  // После двух ошибок у одного места полоска остаётся до конца трассы
  keepBandFor(k) {
    this.keepBand = this.keepBand || new Set();
    this.keepBand.add(k);
    if (this.bands[k]) this.bands[k].visible = true;
  }
  resetBands() {
    this.keepBand = new Set();
    this.bands?.forEach((b) => (b.visible = !!this.def.training));
  }
  showTrail(on) {
    if (!on || this.path.length < 2) {
      this.trail.count = 0;
      return;
    }
    const d = new T.Object3D();
    const pts = this.path,
      n = Math.min(80, Math.floor(pts.length / 2));
    for (let i = 0; i < n; i++) {
      const p = pts[Math.floor((i / n) * pts.length)];
      d.position.set(p.x, p.y + 0.4, 0.05);
      d.updateMatrix();
      this.trail.setMatrixAt(i, d.matrix);
    }
    this.trail.count = n;
    this.trail.instanceMatrix.needsUpdate = true;
  }
  // ---------- Кадр ----------
  sync(run, dt) {
    const t = this.time,
      calm = this.motion.matches;
    const h = this.hero,
      st = run.hero;
    const air = !st.ground;
    // Пружинка: качается к «вытянута в полёте» или «стоит»
    const want = air ? 1.3 : 1;
    h.svv += (-(h.sv - want) * 180 - h.svv * 12) * dt;
    h.sv = clamp(h.sv + h.svv * dt, 0.45, 1.6);
    const running = run.state === "run" && !air;
    h.hop = running && !calm ? Math.abs(Math.sin(t * 15)) * 0.035 : 0;
    h.spring.scale.y = h.sv * (1 - h.hop * 2);
    h.body.position.y = 0.065 + 0.22 * h.spring.scale.y;
    if (run.state !== "hit" && this.finishT === null) {
      h.group.position.set(st.x, st.y + h.hop, 0);
      h.group.rotation.z = air && !calm ? clamp(st.vy * 0.04, -0.3, 0.3) : 0;
      if (air) this.path.push({ x: st.x, y: st.y });
    }
    // Ушки болтаются в полёте, ключик крутится, пока едет
    h.ears.forEach((e, k) => (e.rotation.x = calm ? 0 : clamp(-st.vy * 0.05, -0.5, 0.5) + Math.sin(t * 9 + k) * (running ? 0.08 : 0.03)));
    if (run.state === "run") h.key.rotation.z += dt * 7;
    // Столкновение: отскок назад, звёздочки над головой
    const since = t - this.hitT;
    if (run.state === "hit") {
      const p = clamp(since / 0.35, 0, 1);
      h.group.position.set(st.x - p * 0.35, st.y + Math.sin(p * pie) * 0.3, 0);
      h.group.rotation.z = calm ? 0 : p * 0.5;
      this.stars.visible = true;
      this.stars.children.forEach((s, k) => {
        const a = t * 5 + (k * pie * 2) / 3;
        s.position.set(h.group.position.x + Math.cos(a) * 0.35, h.group.position.y + 1.25 + Math.sin(a * 2) * 0.04, Math.sin(a) * 0.35);
        s.rotation.y = a;
      });
    } else this.stars.visible = false;
    // Подсветка препятствия после столкновения
    for (const v of this.obsMeshes) {
      const f = v.flash ? clamp(1 - (t - v.flash) / 1.4, 0, 1) : 0;
      if (f === 0 && !v.lit) continue;
      v.lit = f > 0;
      v.halo.material.opacity = calm ? (f > 0 ? 0.6 : 0) : f * (0.55 + 0.35 * Math.sin(t * 18));
      if (v.o.solid) continue;
      v.m.traverse((q) => q.isMesh && q.material.emissive && q.material.emissive.setRGB(f * 0.9, 0, f * 0.15));
    }
    // Шестерёнки крутятся
    for (const g of this.gears) {
      if (g.taken) continue;
      g.m.rotation.z = calm ? 0 : t * 1.8 + g.k;
      g.g.position.y = g.y + (calm ? 0 : Math.sin(t * 2.4 + g.k) * 0.04);
    }
    // Флажки колышутся
    for (const f of this.flags) f.flag.rotation.y = calm ? 0 : Math.sin(t * 3 + f.x) * 0.25;
    if (this.bulbs && !calm) this.bulbs.material.color.setScalar(0.85 + 0.15 * Math.sin(t * 2));
    // Финиш: прыжок в коробку
    if (this.finishT !== null) {
      const p = clamp((t - this.finishT) / 0.9, 0, 1);
      const to = new T.Vector3(this.def.end + 1.6, 0.25, 0);
      h.group.position.lerpVectors(this.finishFrom, to, p);
      h.group.position.y += Math.sin(p * pie) * 1.8;
      h.group.rotation.z = calm ? 0 : -p * pie * 2;
      if (p === 1 && !this.boxDone) {
        this.boxDone = true;
        this.confetti(new T.Vector3(this.def.end + 1.6, 1.6, 0));
        this.burst(new T.Vector3(this.def.end + 1.6, 1.4, 0), 30, ["#ffd84a", "#ffffff", "#ff6f8f", "#3fdc7a"], 4);
      }
    } else this.boxDone = false;
    this.box.shine.material.opacity = 0.4 + 0.2 * Math.sin(t * 3);
    // Камера: едет вместе с игрушкой, по высоте плавно за опорой
    const supY = st.ground ? st.y : Math.min(this.cam.y, st.y);
    this.cam.y += (supY - this.cam.y) * (1 - Math.pow(0.15, dt));
    let camX = this.finishT !== null ? Math.min(h.group.position.x, this.def.end) : st.x;
    if (run.state === "hit" && this.hitFocus !== undefined) {
      const p = T.MathUtils.smoothstep(since, 0.1, 0.6);
      camX -= clamp(st.x - this.hitFocus - 1.5, 0, 5) * p;
    }
    const look = new T.Vector3(camX, this.cam.y, 0).add(this.cam.look);
    this.camera.position.copy(look).add(this.cam.off);
    this.camera.lookAt(look);
    this.sun.position.set(camX - 4, 14, 9);
    this.sun.target.position.set(camX + 4, 0, 0);
  }
  // Заставка: камера медленно смотрит на зайчика у старта
  idle(dt) {
    const h = this.hero;
    h.key.rotation.z += dt * 3;
    h.group.position.y = Math.abs(Math.sin(this.time * 3)) * (this.motion.matches ? 0 : 0.12);
  }
  // ---------- Частицы ----------
  makeParticles() {
    const n = 300;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.06, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    this.puffs = new T.InstancedMesh(new T.SphereGeometry(0.1, 10, 8), new T.MeshStandardMaterial({ roughness: 0.6, transparent: true, opacity: 0.85 }), 120);
    this.puffs.frustumCulled = false;
    this.puffPool = Array.from({ length: 120 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
    this.puffNext = 0;
    for (let i = 0; i < 120; i++) this.puffs.setColorAt(i, new T.Color("#ffffff"));
    const c = 240;
    this.conf = new T.InstancedMesh(new T.PlaneGeometry(0.14, 0.22), new T.MeshBasicMaterial({ side: T.DoubleSide }), c);
    this.conf.frustumCulled = false;
    this.confPool = Array.from({ length: c }, () => ({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Vector3(), life: 0 }));
    this.confNext = 0;
    const cols = ["#ff4f6d", "#ffc533", "#3fdc7a", "#3fb4ff", "#8f5bff"];
    for (let i = 0; i < c; i++) this.conf.setColorAt(i, new T.Color(cols[i % cols.length]));
    this.scene.add(this.sparks, this.puffs, this.conf);
    this.dummy = new T.Object3D();
  }
  burst(at, count, colors, speed) {
    if (this.motion.matches) count = Math.ceil(count / 3);
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, new T.Color(colors[k % colors.length]));
      this.next = (this.next + 1) % this.pool.length;
      s.p.copy(at);
      s.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.45 + Math.random() * 0.5;
      s.s = 0.7 + Math.random();
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  puff(at, count, color) {
    for (let k = 0; k < count; k++) {
      const s = this.puffPool[this.puffNext];
      this.puffs.setColorAt(this.puffNext, new T.Color(color));
      this.puffNext = (this.puffNext + 1) % this.puffPool.length;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 2);
      s.max = s.life = 0.35 + Math.random() * 0.3;
    }
    this.puffs.instanceColor.needsUpdate = true;
  }
  confetti(at) {
    const n = this.motion.matches ? 40 : 120;
    for (let k = 0; k < n; k++) {
      const s = this.confPool[this.confNext];
      this.confNext = (this.confNext + 1) % this.confPool.length;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 4);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.life = 2.5 + Math.random();
    }
  }
  frame(ms) {
    if (document.hidden) return;
    const dt = this.last ? clamp((ms - this.last) / 1000, 0, 0.1) : 0;
    this.last = ms;
    this.time += dt;
    const t = this.time;
    for (const tw of [...this.tweens]) {
      const p = clamp((t - tw.at) / tw.dur, 0, 1);
      tw.update(p);
      if (p === 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    if (this.onFrame) this.onFrame(dt);
    const d = this.dummy;
    this.pool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 4 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      d.position.copy(s.p);
      d.rotation.set(s.life * 7, s.life * 5, 0);
      d.scale.setScalar(Math.max(0, s.life / s.max) * s.s);
      d.updateMatrix();
      this.sparks.setMatrixAt(i, d.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    this.puffPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 3 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      const f = s.life > 0 ? s.life / s.max : 0;
      d.position.copy(s.p);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f > 0 ? 0.5 + f * 0.7 : 0);
      d.updateMatrix();
      this.puffs.setMatrixAt(i, d.matrix);
    });
    this.puffs.instanceMatrix.needsUpdate = true;
    this.confPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 6 * dt;
        s.v.multiplyScalar(Math.pow(0.5, dt));
        s.p.addScaledVector(s.v, dt);
        s.r.addScalar(dt * 5);
      }
      d.position.copy(s.p);
      d.rotation.set(s.r.x, s.r.y, s.r.z);
      d.scale.setScalar(s.life > 0 ? Math.min(1, s.life) : 0);
      d.updateMatrix();
      this.conf.setMatrixAt(i, d.matrix);
    });
    this.conf.instanceMatrix.needsUpdate = true;
    if (this.glow.on) {
      this.composer.render();
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
  snapshot(w = 1600, h = 1000) {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.render();
    const url = this.renderer.domElement.toDataURL("image/jpeg", 0.9);
    this.resize();
    return url;
  }
}
