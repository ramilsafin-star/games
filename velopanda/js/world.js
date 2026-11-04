// 3D «Велопанды»: трасса-диорама с разрезом земли, панда в шлеме на велосипеде, звёздочки, ворота старта,
// финиш с почтовым ящиком и другом-получателем, таблички через каждые 10 м, флажок рекорда. Вид сбоку.
import * as T from "../vendor/three/three.module.min.js?v=7ab9d98d";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=7ab9d98d";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=7ab9d98d";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=7ab9d98d";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=7ab9d98d";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=7ab9d98d";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=7ab9d98d";
import { makeGround, CONFIG } from "./ride.js?v=7ab9d98d";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const glowing = (color, k = 2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const FRONT = 2.4;

export const THEMES = {
  park: { sky: ["#5fc8ff", "#c8f0ff"], grass: "#62d26f", grass2: "#86e07a", lip: "#45b95a", path: "#e8c890", dirt: ["#c98b55", "#a8703f", "#7a4f2c"], fog: "#d6f1ff", deco: "park" },
  meadow: { sky: ["#7fb8ff", "#ffe8c8"], grass: "#9fdc5a", grass2: "#c2e85f", lip: "#7fbf3f", path: "#e8c890", dirt: ["#c98b55", "#a8703f", "#7a4f2c"], fog: "#fff0dc", deco: "meadow" },
  beach: { sky: ["#3fb4ff", "#d8f6ff"], grass: "#ffe2a0", grass2: "#ffd88a", lip: "#f0c070", path: "#fff0c8", dirt: ["#f0c070", "#d8a050", "#b8803a"], fog: "#e0f8ff", deco: "beach" },
  city: { sky: ["#8f9fff", "#ffd8e8"], grass: "#7fd07f", grass2: "#8fe08f", lip: "#5fb05f", path: "#7a7f92", dirt: ["#b8a8c8", "#9a8ab0", "#7a6a90"], fog: "#f0e0f0", deco: "city" },
  snow: { sky: ["#6f8fff", "#e8f0ff"], grass: "#f8fbff", grass2: "#e6eeff", lip: "#d8e4f8", path: "#c8d8f0", dirt: ["#9eb2d4", "#8197c0", "#64799f"], fog: "#e8eeff", deco: "snow" },
  candy: { sky: ["#ff9fd0", "#fff0c8"], grass: "#ffb8e0", grass2: "#ffd0ea", lip: "#ff8fc8", path: "#fff4f8", dirt: ["#c89be8", "#b07ad8", "#8f5bc0"], fog: "#ffe8f4", deco: "candy" },
};
export const BIKES = [
  { id: "red", name: "Красный", need: 0, frame: "#ff4f6d", helmet: "#ffc533" },
  { id: "mint", name: "Мятный", need: 15, frame: "#2fd0a6", helmet: "#ff8fd0" },
  { id: "rocket", name: "Ракета", need: 35, frame: "#3f6bff", helmet: "#ffffff", fire: true },
  { id: "rainbow", name: "Радужный", need: 55, frame: "rainbow", helmet: "#b47cff" },
];

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
const shadowTex = canvasTexture(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
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
const starShape = (() => {
  const s = new T.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k * pie) / 5 + pie / 2,
      r = k % 2 ? 0.14 : 0.32;
    k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
})();
const starGeo = (() => {
  const g = new T.ExtrudeGeometry(starShape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  g.center();
  return g;
})();
const label = (text, bg, fg, w = 128, h = 64) =>
  canvasTexture(w, h, (x) => {
    x.fillStyle = bg;
    x.beginPath();
    x.roundRect(4, 4, w - 8, h - 8, 14);
    x.fill();
    x.fillStyle = fg;
    x.font = `900 ${Math.round(h * 0.52)}px system-ui, sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, w / 2, h / 2 + 2);
  });

// ---------- Панда на велосипеде ----------
// Начало координат — центр заднего колеса, рама вдоль +x
function rider(bike) {
  const L = CONFIG.wheelbase,
    R = CONFIG.wheel;
  const g = new T.Group();
  const frameMat =
    bike.frame === "rainbow"
      ? new T.MeshStandardMaterial({
          roughness: 0.3,
          map: canvasTexture(64, 8, (x) => {
            ["#ff4f6d", "#ffb02e", "#ffe14d", "#3fdc7a", "#3f8cff", "#9b5cff"].forEach((c, i) => {
              x.fillStyle = c;
              x.fillRect(i * 11, 0, 11, 8);
            });
          }),
        })
      : glossy(bike.frame, { metalness: 0.3 });
  const dark = glossy("#2b2b3d", { roughness: 0.4 }),
    chrome = glossy("#e8eef7", { metalness: 0.9, roughness: 0.2 });
  const tube = (a, b, r = 0.045, mat = frameMat) => {
    const va = new T.Vector3(...a),
      vb = new T.Vector3(...b);
    const m = new T.Mesh(new T.CylinderGeometry(r, r, va.distanceTo(vb), 10), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.add(m);
    return m;
  };
  // Колёса: шина, обод, спицы
  const wheels = [];
  for (const x of [0, L]) {
    const w = new T.Group();
    w.position.set(x, 0, 0);
    const tire = new T.Mesh(new T.TorusGeometry(R - 0.04, 0.05, 10, 36), dark);
    w.add(tire);
    const rim = new T.Mesh(new T.TorusGeometry(R - 0.09, 0.015, 6, 36), chrome);
    w.add(rim);
    for (let k = 0; k < 8; k++) {
      const sp = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, (R - 0.09) * 2, 4), chrome);
      sp.rotation.z = (k * pie) / 8;
      w.add(sp);
    }
    const hub = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.12, 12).rotateX(pie / 2), frameMat);
    w.add(hub);
    for (let k = 0; k < 3; k++) {
      const dot = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), glowing(["#ff4f6d", "#ffe14d", "#3fb4ff"][k], 1.2));
      dot.position.set(Math.cos((k * 2 * pie) / 3) * (R - 0.16), Math.sin((k * 2 * pie) / 3) * (R - 0.16), 0.03);
      w.add(dot);
    }
    g.add(w);
    wheels.push(w);
  }
  // Рама
  const crank = [0.42, 0.04, 0];
  tube([0, 0, 0], crank);
  tube(crank, [0.32, 0.5, 0]);
  tube([0, 0, 0], [0.32, 0.5, 0]);
  tube([0.32, 0.5, 0], [0.86, 0.55, 0]);
  tube(crank, [0.86, 0.55, 0]);
  tube([0.86, 0.55, 0], [L, 0, 0], 0.04);
  tube([0.86, 0.55, 0], [0.82, 0.78, 0], 0.035, chrome);
  const bar = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.5, 8).rotateX(pie / 2), chrome);
  bar.position.set(0.8, 0.8, 0);
  g.add(bar);
  for (const s of [-1, 1]) {
    const grip = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.1, 8).rotateX(pie / 2), dark);
    grip.position.set(0.8, 0.8, s * 0.24);
    g.add(grip);
  }
  const seat = new T.Mesh(new RoundedBoxGeometry(0.26, 0.07, 0.16, 2, 0.03), dark);
  seat.position.set(0.3, 0.56, 0);
  g.add(seat);
  // Корзинка с посылкой спереди
  const basket = new T.Mesh(new T.CylinderGeometry(0.17, 0.13, 0.17, 12, 1, true), matte("#c98b55", { side: T.DoubleSide }));
  basket.position.set(1.0, 0.68, 0);
  g.add(basket);
  const parcel = new T.Sprite(new T.SpriteMaterial({ map: canvasTexture(64, 64, () => {}), transparent: true }));
  parcel.position.set(1.0, 0.86, 0);
  parcel.scale.setScalar(0.34);
  g.add(parcel);
  // Педали
  const pedals = new T.Group();
  pedals.position.set(...crank);
  const arm = new T.Mesh(new T.BoxGeometry(0.03, 0.36, 0.03), chrome);
  pedals.add(arm);
  const pedalL = new T.Mesh(new T.BoxGeometry(0.1, 0.03, 0.08), dark);
  pedalL.position.set(0, 0.18, 0.12);
  const pedalR = pedalL.clone();
  pedalR.position.set(0, -0.18, -0.12);
  pedals.add(pedalL, pedalR);
  g.add(pedals);
  // Панда
  const white = matte("#ffffff", { roughness: 0.75 }),
    black = matte("#22222e");
  const body = new T.Group();
  body.position.set(0.32, 0.6, 0);
  g.add(body);
  const torso = new T.Mesh(new T.SphereGeometry(0.26, 20, 14), white);
  torso.scale.set(0.95, 1.15, 0.9);
  torso.position.set(0.05, 0.22, 0);
  body.add(torso);
  // Белое пузико, цветной шарфик
  const tummy = new T.Mesh(new T.SphereGeometry(0.17, 16, 12), matte("#fff6f0"));
  tummy.scale.set(0.6, 1, 0.9);
  tummy.position.set(0.2, 0.18, 0);
  body.add(tummy);
  const scarf = new T.Mesh(new T.TorusGeometry(0.15, 0.05, 8, 20), glossy(bike.frame === "rainbow" ? "#ff4f6d" : bike.frame));
  scarf.rotation.x = pie / 2;
  scarf.position.set(0.12, 0.45, 0);
  body.add(scarf);
  const tail = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), black);
  tail.position.set(-0.2, 0.05, 0);
  body.add(tail);
  const head = new T.Group();
  head.position.set(0.16, 0.6, 0);
  body.add(head);
  const arms = [];
  const skull = new T.Mesh(new T.SphereGeometry(0.25, 22, 16), white);
  head.add(skull);
  for (const s of [-1, 1]) {
    const patch = new T.Mesh(new T.SphereGeometry(0.08, 14, 10), black);
    patch.scale.set(0.45, 1.25, 0.95);
    patch.position.set(0.215, 0.03, s * 0.095);
    patch.rotation.x = s * -0.45;
    head.add(patch);
    const eye = new T.Mesh(new T.SphereGeometry(0.034, 10, 8), new T.MeshBasicMaterial({ color: "#ffffff" }));
    eye.position.set(0.25, 0.05, s * 0.09);
    head.add(eye);
    const pupil = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), new T.MeshBasicMaterial({ color: "#1d1420" }));
    pupil.position.set(0.272, 0.05, s * 0.09);
    head.add(pupil);
    const cheek = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), matte("#ff9fb8"));
    cheek.scale.set(0.4, 0.6, 1);
    cheek.position.set(0.22, -0.07, s * 0.15);
    head.add(cheek);
    const ear = new T.Mesh(new T.SphereGeometry(0.08, 12, 10), black);
    ear.position.set(-0.02, 0.17, s * 0.21);
    head.add(ear);
    // Ручки: от плеча к рулю, пересчитываются каждый кадр (панда держится прямо, а велосипед встаёт)
    const arm = new T.Mesh(new T.CapsuleGeometry(0.055, 0.3, 6, 8), black);
    g.add(arm);
    arms.push({ arm, s });
  }
  const nose = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), black);
  nose.position.set(0.25, -0.04, 0);
  head.add(nose);
  const smile = new T.Mesh(new T.TorusGeometry(0.04, 0.012, 6, 14, pie), black);
  smile.position.set(0.235, -0.09, 0);
  smile.rotation.set(pie, pie / 2, 0);
  head.add(smile);
  // Шлем
  // Шлем — шапочкой на макушке, уши торчат по бокам
  const helmet = new T.Mesh(new T.SphereGeometry(0.262, 22, 14, 0, pie * 2, 0, pie * 0.32), glossy(bike.helmet, { roughness: 0.25 }));
  helmet.position.set(-0.03, 0.06, 0);
  helmet.rotation.z = 0.25;
  head.add(helmet);
  const visor = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.02, 16, 1, false, -pie / 2, pie), glossy(bike.helmet, { roughness: 0.25 }));
  visor.position.set(0.18, 0.17, 0);
  visor.rotation.z = -0.25;
  head.add(visor);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new T.Mesh(new T.CapsuleGeometry(0.06, 0.32, 6, 8), black);
    g.add(leg);
    legs.push({ leg, s });
  }
  // Пламя у ракеты
  let fire = null;
  if (bike.fire) {
    fire = glowSprite("#ff9a3f", 0.7, 0.9);
    fire.position.set(-0.35, 0.25, 0);
    g.add(fire);
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  body.scale.setScalar(1.18);
  return { group: g, wheels, pedals, legs, arms, head, body, parcel, fire, crank: new T.Vector3(...crank) };
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
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.fog = new T.Fog(0xd6f1ff, 40, 120);
    this.camera = new T.PerspectiveCamera(34, 1, 0.1, 400);
    this.hemi = new T.HemisphereLight(0xffffff, 0x88c870, 1.15);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff0d8, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -10, right: 10, top: 8, bottom: -6, near: 1, far: 50 });
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.4, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.glow = { on: true, slow: 0, seen: 0 };
    this.trackGroup = new T.Group();
    this.scene.add(this.trackGroup);
    this.makeParticles();
    this.camX = 0;
    this.camY = 2;
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
  // ---------- Трасса ----------
  setTrack(track) {
    const G = this.trackGroup;
    G.traverse((o) => o.geometry && o.geometry.dispose());
    G.clear();
    this.track = track;
    const th = THEMES[track.theme];
    this.theme = th;
    const g = makeGround(track.ground);
    this.g = g;
    const R = rng(track.index * 977 + 3);
    this.scene.background = canvasTexture(4, 256, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, th.sky[0]);
      gr.addColorStop(1, th.sky[1]);
      x.fillStyle = gr;
      x.fillRect(0, 0, w, h);
    });
    this.scene.fog.color.set(th.fog);
    const x0 = -25,
      x1 = track.length + 40;
    // Поверхность: газон по краям, дорожка посередине
    const xs = [];
    for (let x = x0; x <= x1; x += 0.4) xs.push(x);
    const zs = [FRONT, FRONT - 0.2, 0.75, 0.55, -0.55, -0.75, -2.5, -6, -12, -22];
    const pos = [],
      col = [],
      idx = [];
    const c = new T.Color(),
      cg = new T.Color(th.grass),
      cg2 = new T.Color(th.grass2),
      cp = new T.Color(th.path);
    zs.forEach((z, j) => {
      for (const x of xs) {
        let y = g(x);
        if (z < -2) y += Math.max(0, Math.sin(x * 0.3 + z) * 0.6) * Math.min(1, (-2 - z) / 6);
        pos.push(x, y, z);
        if (Math.abs(z) <= 0.56) c.copy(cp).multiplyScalar(0.95 + 0.05 * Math.sin(x * 3));
        else c.copy(cg).lerp(cg2, 0.5 + 0.5 * Math.sin(x * 1.3 + z * 2));
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
    const topMesh = new T.Mesh(top, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    topMesh.receiveShadow = true;
    G.add(topMesh);
    // Разрез земли: слои
    {
      const rows = 14,
        fp = [],
        fc = [],
        fi = [];
      const d0 = new T.Color(th.dirt[0]),
        d1 = new T.Color(th.dirt[1]),
        d2 = new T.Color(th.dirt[2]);
      xs.forEach((x) => {
        const t0 = g(x) - 0.05;
        for (let r = 0; r <= rows; r++) {
          const y = t0 + ((-6 - t0) * r) / rows,
            depth = t0 - y;
          const band = Math.sin((depth + Math.sin(x * 0.5) * 0.3) * 2.6) * 0.5 + 0.5;
          c.copy(d0).lerp(d1, clamp(depth / 2, 0, 1)).lerp(d2, clamp((depth - 2) / 4, 0, 1));
          if (band > 0.75) c.lerp(d0, 0.15);
          if (depth < 0.15) c.lerp(new T.Color(th.lip), 0.5);
          fp.push(x, y, FRONT);
          fc.push(c.r, c.g, c.b);
        }
      });
      for (let i = 0; i < xs.length - 1; i++)
        for (let r = 0; r < rows; r++) {
          const a = i * (rows + 1) + r,
            b = a + rows + 1;
          fi.push(a, b, a + 1, a + 1, b, b + 1);
        }
      const face = new T.BufferGeometry();
      face.setAttribute("position", new T.Float32BufferAttribute(fp, 3));
      face.setAttribute("color", new T.Float32BufferAttribute(fc, 3));
      face.setIndex(fi);
      face.computeVertexNormals();
      G.add(new T.Mesh(face, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide })));
    }
    this.decorate(track, th, g, R, x0, x1);
    // Таблички через каждые 10 м после ворот
    for (let m = 10; CONFIG.gate + m < track.length; m += 10) {
      const x = CONFIG.gate + m;
      const sign = new T.Group();
      const post = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.1, 8), matte("#a8743f"));
      post.position.y = 0.55;
      sign.add(post);
      const plate = new T.Mesh(new RoundedBoxGeometry(0.7, 0.4, 0.06, 2, 0.05), new T.MeshStandardMaterial({ map: label(m + " м", "#ffffff", "#2a4a8a"), roughness: 0.6 }));
      plate.position.y = 1.2;
      sign.add(plate);
      sign.position.set(x, g(x), -1.1);
      sign.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(sign);
    }
    // Стартовые ворота — арка с шариками
    G.add(this.arch(CONFIG.gate, g(CONFIG.gate), "СТАРТ", "#3fdc7a"));
    // Финиш: арка, почтовый ящик, друг-получатель
    G.add(this.arch(track.length, g(track.length), "ФИНИШ", "#ff4f6d", true));
    const box = new T.Group();
    const bx = new T.Mesh(new RoundedBoxGeometry(0.5, 0.6, 0.42, 2, 0.1), glossy("#3f6bff"));
    bx.position.y = 1.15;
    box.add(bx);
    const leg = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.9, 8), matte("#555"));
    leg.position.y = 0.45;
    box.add(leg);
    box.position.set(track.length + 2.2, g(track.length + 2.2), -1.0);
    box.traverse((o) => o.isMesh && (o.castShadow = true));
    G.add(box);
    this.friend = this.bunny();
    this.friend.position.set(track.length + 3.2, g(track.length + 3.2), -0.6);
    this.friend.rotation.y = -0.9;
    G.add(this.friend);
    // Звёздочки
    this.stars = track.stars.map(([x, y, h]) => {
      const m = new T.Mesh(starGeo, glowing(h === "high" ? "#ffd23f" : "#7fe8ff", 1.6));
      m.position.set(x, y, 0);
      m.castShadow = true;
      const halo = glowSprite(h === "high" ? "#ffe066" : "#9ff0ff", 1.4, 0.6);
      halo.position.copy(m.position);
      G.add(m, halo);
      return { mesh: m, halo, taken: false, base: y };
    });
    // Флажок рекорда
    this.recordFlag = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2, 8), matte("#ffffff"));
    pole.position.y = 1;
    this.recordFlag.add(pole);
    const cloth = new T.Mesh(new T.PlaneGeometry(0.9, 0.5), new T.MeshStandardMaterial({ map: label("рекорд", "#ffc533", "#7a3f00", 128, 64), side: T.DoubleSide }));
    cloth.position.set(0.45, 1.7, 0);
    this.recordFlag.add(cloth);
    this.recordFlag.visible = false;
    G.add(this.recordFlag);
    // Свет следует за велосипедом
    this.sun.position.set(-6, 14, 10);
  }
  arch(x, y, text, color, finish) {
    const g = new T.Group();
    for (const z of [-1.1, 1.1]) {
      const p = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 2.6, 10), glossy("#ffffff"));
      p.position.set(0, 1.3, z);
      g.add(p);
    }
    const top = new T.Mesh(new RoundedBoxGeometry(0.2, 0.5, 2.6, 2, 0.06), new T.MeshStandardMaterial({ color: color, roughness: 0.5 }));
    top.position.y = 2.7;
    g.add(top);
    const plate = new T.Mesh(new T.PlaneGeometry(2.2, 0.46), new T.MeshBasicMaterial({ map: label(text, color, "#ffffff", 256, 54) }));
    plate.position.set(0.11, 2.7, 0);
    plate.rotation.y = pie / 2;
    g.add(plate);
    // Шарики
    const cols = ["#ff4f6d", "#ffd23f", "#3fb4ff", "#3fdc7a", "#b47cff"];
    for (let k = 0; k < 6; k++) {
      const b = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), glossy(cols[k % 5], { roughness: 0.2 }));
      b.scale.y = 1.2;
      b.position.set(0, 2.95 + (k % 2) * 0.15, -1.2 + k * 0.48);
      g.add(b);
    }
    if (finish) {
      const chk = new T.Mesh(
        new T.PlaneGeometry(0.6, 2.2),
        new T.MeshBasicMaterial({
          side: T.DoubleSide,
          map: canvasTexture(16, 64, (c) => {
            for (let i = 0; i < 2; i++)
              for (let j = 0; j < 8; j++) {
                c.fillStyle = (i + j) % 2 ? "#222" : "#fff";
                c.fillRect(i * 8, j * 8, 8, 8);
              }
          }),
        }),
      );
      chk.rotation.set(-pie / 2, 0, 0);
      chk.position.set(0, 0.02, 0);
      g.add(chk);
    }
    g.position.set(x, y, 0);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  bunny() {
    const g = new T.Group();
    const fur = matte("#ffffff"),
      pink = matte("#ffb3c8");
    const body = new T.Mesh(new T.SphereGeometry(0.3, 18, 12), fur);
    body.scale.set(0.9, 1.1, 0.85);
    body.position.y = 0.33;
    g.add(body);
    const head = new T.Group();
    head.position.y = 0.82;
    g.add(head);
    head.add(new T.Mesh(new T.SphereGeometry(0.25, 18, 12), fur));
    for (const s of [-1, 1]) {
      const ear = new T.Mesh(new T.CapsuleGeometry(0.07, 0.34, 6, 10), fur);
      ear.position.set(s * 0.1, 0.36, 0);
      ear.rotation.z = -s * 0.15;
      head.add(ear);
      const eye = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), glossy("#1d1420", { roughness: 0.15 }));
      eye.position.set(s * 0.09, 0.04, 0.22);
      head.add(eye);
      const cheek = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), pink);
      cheek.scale.set(1, 0.6, 0.4);
      cheek.position.set(s * 0.15, -0.05, 0.19);
      head.add(cheek);
    }
    g.userData.head = head;
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    g.scale.setScalar(1.3);
    return g;
  }
  decorate(track, th, g, R, x0, x1) {
    const G = this.trackGroup;
    const add = (m, x, z, s = 1) => {
      m.position.set(x, g(x) - 0.05, z);
      m.scale.multiplyScalar(s);
      m.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(m);
    };
    const tree = (color, pine) => {
      const t = new T.Group();
      const trunk = new T.Mesh(new T.CylinderGeometry(0.12, 0.17, 1, 8), matte("#8a5a35"));
      trunk.position.y = 0.5;
      t.add(trunk);
      if (pine)
        for (let k = 0; k < 3; k++) {
          const cone = new T.Mesh(new T.ConeGeometry(0.8 - k * 0.2, 1, 8), matte(color, { flatShading: true }));
          cone.position.y = 1.1 + k * 0.55;
          t.add(cone);
          if (th.deco === "snow") {
            const cap = new T.Mesh(new T.ConeGeometry(0.45 - k * 0.1, 0.4, 8), matte("#ffffff"));
            cap.position.y = 1.45 + k * 0.55;
            t.add(cap);
          }
        }
      else {
        const crown = new T.Mesh(new T.IcosahedronGeometry(0.85, 1), matte(color, { flatShading: true }));
        crown.position.y = 1.5;
        t.add(crown);
      }
      return t;
    };
    const greens = ["#3fbf5a", "#5bd46d", "#2fa04c", "#7fdc6a"];
    for (let x = x0; x < x1; x += 3 + R() * 4) {
      const z = -2.2 - R() * 10;
      const d = th.deco;
      if (d === "park" || d === "meadow") add(tree(d === "meadow" ? ["#7fcf3f", "#a8dc4f", "#5fb83f"][Math.floor(R() * 3)] : greens[Math.floor(R() * 4)], R() < 0.3), x, z, 0.8 + R() * 0.8);
      else if (d === "snow") add(tree(["#2e8a64", "#3a9c72"][Math.floor(R() * 2)], true), x, z, 0.8 + R() * 0.9);
      else if (d === "beach") {
        const p = new T.Group();
        const trunk = new T.Mesh(new T.CylinderGeometry(0.1, 0.16, 2.6, 8), matte("#b8864f"));
        trunk.position.y = 1.3;
        trunk.rotation.z = 0.15;
        p.add(trunk);
        for (let k = 0; k < 6; k++) {
          const leaf = new T.Mesh(new T.ConeGeometry(0.18, 1.4, 4), matte("#3fbf5a", { flatShading: true }));
          leaf.position.set(0.2, 2.6, 0);
          leaf.rotation.set(0, (k * pie) / 3, 1.9);
          p.add(leaf);
        }
        add(p, x, z, 0.8 + R() * 0.5);
      } else if (d === "city") {
        const hgt = 2 + R() * 5;
        const b = new T.Mesh(new RoundedBoxGeometry(2.2, hgt, 2, 2, 0.1), matte(["#ffd6e0", "#d6e8ff", "#fff0c8", "#e0d6ff"][Math.floor(R() * 4)]));
        b.position.y = hgt / 2;
        const grp = new T.Group();
        grp.add(b);
        for (let wy = 0.8; wy < hgt - 0.5; wy += 1) {
          for (const wx of [-0.5, 0.5]) {
            const w = new T.Mesh(new T.PlaneGeometry(0.45, 0.55), new T.MeshStandardMaterial({ color: "#9fd8ff", emissive: "#fff3c0", emissiveIntensity: R() < 0.3 ? 0.6 : 0.05 }));
            w.position.set(wx, wy, 1.01);
            grp.add(w);
          }
        }
        add(grp, x, z - 2, 1);
      } else if (d === "candy") {
        const lol = new T.Group();
        const stick = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 2, 8), matte("#ffffff"));
        stick.position.y = 1;
        lol.add(stick);
        const candy = new T.Mesh(
          new T.CylinderGeometry(0.6, 0.6, 0.18, 24),
          new T.MeshStandardMaterial({
            roughness: 0.3,
            map: canvasTexture(64, 64, (c) => {
              const cols = ["#ff4f8b", "#ffffff", "#ffd23f", "#3fb4ff"];
              for (let k = 0; k < 12; k++) {
                c.fillStyle = cols[k % 4];
                c.beginPath();
                c.moveTo(32, 32);
                c.arc(32, 32, 32, (k * pie) / 6, ((k + 1) * pie) / 6);
                c.fill();
              }
            }),
          }),
        );
        candy.rotation.x = pie / 2;
        candy.position.y = 2.3;
        lol.add(candy);
        add(lol, x, z, 0.8 + R() * 0.6);
      }
    }
    // Фон темы
    if (th.deco === "beach") {
      const sea = new T.Mesh(new T.PlaneGeometry(400, 80), new T.MeshStandardMaterial({ color: "#3fb4ff", roughness: 0.2, emissive: "#1f7fd0", emissiveIntensity: 0.15 }));
      sea.rotation.x = -pie / 2;
      sea.position.set(track.length / 2, -0.3, -50);
      G.add(sea);
    }
    if (th.deco === "snow" || th.deco === "meadow") {
      for (let k = 0; k < 12; k++) {
        const h = 10 + R() * 12;
        const m = new T.Mesh(new T.ConeGeometry(7 + R() * 5, h, 6), matte(th.deco === "snow" ? "#b8c8ef" : "#9cd0a0", { flatShading: true }));
        m.position.set(x0 + k * ((x1 - x0) / 11), h / 2 - 1, -45 - R() * 15);
        G.add(m);
        if (th.deco === "snow") {
          const cap = new T.Mesh(new T.ConeGeometry(2.6, h * 0.3, 6), matte("#ffffff", { flatShading: true }));
          cap.position.set(m.position.x, h - 1 - h * 0.15, m.position.z + 0.6);
          G.add(cap);
        }
      }
    }
    // Облака
    this.clouds = [];
    for (let k = 0; k < 14; k++) {
      const c = new T.Group();
      for (let p = 0; p < 4; p++) {
        const s = new T.Mesh(new T.SphereGeometry(1 + R() * 0.8, 14, 10), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.3 }));
        s.position.set(p * 1.1 - 1.6, Math.sin(p) * 0.4, 0);
        s.scale.y = 0.7;
        c.add(s);
      }
      c.position.set(x0 + R() * (x1 - x0), 9 + R() * 6, -20 - R() * 15);
      G.add(c);
      this.clouds.push(c);
    }
    // Цветы вдоль дорожки спереди
    const petal = new T.SphereGeometry(0.07, 8, 6);
    const fcols = th.deco === "snow" ? ["#ffffff", "#9fd8ff"] : th.deco === "candy" ? ["#ffffff", "#ffd23f", "#3fb4ff"] : ["#ff6fa8", "#ffd23f", "#ffffff", "#b47cff", "#ff8f3f"];
    for (let x = x0; x < x1; x += 0.8 + R() * 1.2) {
      const f = new T.Group();
      const c = fcols[Math.floor(R() * fcols.length)];
      for (let p = 0; p < 5; p++) {
        const pe = new T.Mesh(petal, matte(c));
        pe.position.set(Math.cos((p / 5) * pie * 2) * 0.07, 0.16, Math.sin((p / 5) * pie * 2) * 0.07);
        pe.scale.y = 0.5;
        f.add(pe);
      }
      const mid = new T.Mesh(petal, matte("#ffd23f"));
      mid.position.y = 0.17;
      mid.scale.setScalar(0.6);
      f.add(mid);
      f.position.set(x, g(x), 1.0 + R() * 1.2);
      G.add(f);
    }
  }
  // ---------- Велосипед ----------
  setBike(bike, parcelEmoji) {
    if (this.rider) this.rider.group.removeFromParent();
    this.rider = rider(bike);
    this.scene.add(this.rider.group);
    this.rider.parcel.material.map = canvasTexture(64, 64, (x) => {
      x.font = "52px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(parcelEmoji || "📦", 32, 36);
    });
    this.rider.parcel.material.needsUpdate = true;
    this.shadows = [0, 1].map(() => {
      const m = new T.Mesh(new T.PlaneGeometry(0.9, 0.5), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      m.rotation.x = -pie / 2;
      this.scene.add(m);
      return m;
    });
    this.spin = 0;
    this.fallen = 0;
  }
  // Расставить велосипед по состоянию заезда
  syncRide(ride, dt) {
    const rd = this.rider;
    if (!rd || !this.g) return;
    const g = this.g,
      R = CONFIG.wheel;
    const x = ride.x,
      y = g(x) + R;
    rd.group.position.set(x, y, 0);
    if (!this.fallen) rd.group.rotation.z = ride.a;
    const moving = ride.state === "ride";
    this.spin += (moving ? CONFIG.speed / R : 0) * dt;
    for (const w of rd.wheels) w.rotation.z = -this.spin;
    rd.pedals.rotation.z = -this.spin * 0.45;
    // Панда держится почти прямо: тело поворачивается назад относительно рамы
    if (!this.fallen) rd.body.rotation.z = -ride.a * 0.72;
    rd.body.updateMatrix();
    const fromBody = (x, y, z) => new T.Vector3(x, y, z).applyMatrix4(rd.body.matrix);
    rd.arms.forEach(({ arm, s }) => {
      const sh = fromBody(0.14, 0.38, s * 0.15),
        grip = this.fallen ? fromBody(0.36, 0.2, s * 0.24) : new T.Vector3(0.8, 0.8, s * 0.24);
      arm.position.copy(sh).add(grip).multiplyScalar(0.5);
      arm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), grip.clone().sub(sh).normalize());
      arm.scale.y = sh.distanceTo(grip) / 0.41;
    });
    // Ножки к педалям
    rd.legs.forEach(({ leg, s }) => {
      const ang = -this.spin * 0.45 + (s > 0 ? 0 : pie);
      const foot = new T.Vector3(rd.crank.x + Math.sin(-ang) * 0.18, rd.crank.y + Math.cos(-ang) * 0.18 * -1, s * 0.12);
      foot.set(rd.crank.x - Math.sin(ang) * 0.18, rd.crank.y + Math.cos(ang) * 0.18, s * 0.12);
      const hip = fromBody(0.04, 0.06, s * 0.12);
      leg.position.copy(hip).add(foot).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), foot.clone().sub(hip).normalize());
      leg.scale.y = hip.distanceTo(foot) / 0.44;
    });
    // Голова держит взгляд вперёд, панда радуется на заднем колесе
    // Мордочка повёрнута к зрителю
    rd.head.rotation.set(0, -0.85, -ride.a * 0.2);
    if (rd.fire) rd.fire.scale.setScalar(moving ? 0.6 + Math.sin(this.time * 30) * 0.12 : 0.001);
    // Тени под колёсами: под передним — чем выше колесо, тем меньше и бледнее
    const fw = ride.frontWheel();
    const [s0, s1] = this.shadows;
    s0.position.set(x, g(x) + 0.02, 0);
    const fh = fw[1] - R - g(fw[0]);
    s1.position.set(fw[0], g(fw[0]) + 0.02, 0);
    s1.scale.setScalar(Math.max(0.35, 1 - fh * 0.5));
    s1.material.opacity = Math.max(0.25, 1 - fh * 0.6);
    // Пыль из-под заднего колеса
    if (moving && Math.random() < dt * 14) this.puff([x - 0.2, g(x) + 0.05, 0.1], 1, this.theme.deco === "snow" ? "#ffffff" : this.theme.path, 0.5);
    // Звёздочки
    for (const s of this.stars || []) {
      if (s.taken) continue;
      s.mesh.rotation.y = this.time * 2.4;
      s.mesh.position.y = s.base + Math.sin(this.time * 3 + s.mesh.position.x) * 0.05;
      s.halo.position.y = s.mesh.position.y;
    }
    // Камера: чуть впереди велосипеда, плавно
    const aspect = this.camera.aspect;
    const lookAhead = aspect > 1 ? 3 : 1.8;
    const tx = x + lookAhead,
      ty = g(x + 2) + 1.5;
    const a = 1 - Math.pow(0.02, dt);
    this.camX += (tx - this.camX) * a;
    this.camY += (ty - this.camY) * a;
    const vf = T.MathUtils.degToRad(34);
    const needW = aspect > 1 ? 12.5 : 8,
      needH = 5.6;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const dist = Math.max(needW / 2 / Math.tan(hf / 2), needH / 2 / Math.tan(vf / 2));
    this.camera.position.set(this.camX, this.camY + dist * 0.1, dist);
    this.camera.lookAt(this.camX, this.camY, 0);
    this.sun.position.set(x - 6, 14, 10);
    this.sun.target.position.set(x, 0, 0);
  }
  // Велосипед ровно у старта (до начала)
  placeAtStart(ride) {
    this.camX = ride.x + 3;
    this.camY = this.g(ride.x) + 1.4;
    this.fallen = 0;
    if (this.rider) {
      this.rider.group.position.z = 0;
      this.rider.group.rotation.set(0, 0, ride.a);
      this.rider.body.rotation.set(0, 0, 0);
      this.rider.body.position.set(0.32, 0.6, 0);
    }
  }
  starTaken(i) {
    const s = this.stars[i];
    if (!s) return;
    s.taken = true;
    this.burst(s.mesh.position, 26, ["#ffe066", "#ffffff", "#ff9fd0", "#7fe8ff"], 3);
    this.tween(0.4, (p) => {
      s.mesh.scale.setScalar(1 + p * 1.2);
      s.mesh.position.y = s.base + p * 1.2;
      s.halo.material.opacity = 0.6 * (1 - p);
    }).then(() => {
      s.mesh.visible = false;
      s.halo.visible = false;
    });
  }
  resetStars() {
    for (const s of this.stars || []) {
      s.taken = false;
      s.mesh.visible = s.halo.visible = true;
      s.mesh.scale.setScalar(1);
      s.mesh.position.y = s.base;
      s.halo.material.opacity = 0.6;
    }
  }
  showRecord(x) {
    if (!(x > CONFIG.gate + 1) || !this.g) return (this.recordFlag.visible = false);
    this.recordFlag.visible = true;
    this.recordFlag.position.set(x, this.g(x), -0.9);
  }
  // Неудача: нос клюнул вниз или опрокинулся назад — панда мягко падает в траву
  fall(kind) {
    const rd = this.rider;
    if (!rd) return;
    this.fallen = 1;
    const p0 = rd.group.position.clone(),
      a0 = rd.group.rotation.z;
    const g = this.g;
    if (kind === "back") {
      this.tween(0.7, (p) => {
        rd.group.rotation.z = a0 + p * 0.9;
        rd.group.position.set(p0.x - p * 0.6, Math.max(g(p0.x - p * 0.6) + 0.3, p0.y + Math.sin(p * pie) * 0.2), p * 0.3);
      });
    } else {
      this.tween(0.5, (p) => {
        rd.group.rotation.z = a0 * (1 - p) - Math.sin(p * pie) * 0.15;
      });
    }
    // Панда соскакивает и садится рядом, над головой кружатся звёздочки
    const b0 = rd.body.position.clone();
    this.tween(0.8, (p) => {
      rd.body.position.set(b0.x + (kind === "back" ? -p * 0.6 : p * 0.5), b0.y + Math.sin(p * pie) * 0.5 - p * 0.35, p * 0.5);
      rd.body.rotation.z = (kind === "back" ? 1 : -1) * p * 0.6;
    });
    this.puff([p0.x, g(p0.x) + 0.1, 0.3], 10, "#ffffff", 1.2);
    this.burst(new T.Vector3(p0.x, p0.y + 1.2, 0.3), 12, ["#ffe066", "#ffffff"], 1.5);
  }
  finish() {
    const x = this.track.length;
    this.confetti([x + 1, this.g(x) + 2.5, 0]);
    this.burst(new T.Vector3(x + 2.2, this.g(x) + 1.6, -1), 40, ["#ffe066", "#ff4f6d", "#3fb4ff", "#3fdc7a"], 4);
    this.cheer = this.time;
  }
  // ---------- Частицы ----------
  makeParticles() {
    const n = 500;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.06, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    this.puffs = new T.InstancedMesh(new T.SphereGeometry(0.14, 10, 8), new T.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.8 }), 120);
    this.puffs.frustumCulled = false;
    this.puffPool = Array.from({ length: 120 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
    this.puffNext = 0;
    for (let i = 0; i < 120; i++) this.puffs.setColorAt(i, new T.Color("#ffffff"));
    const c = 260;
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
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, new T.Color(colors[k % colors.length]));
      this.next = (this.next + 1) % this.pool.length;
      s.p.set(at.x ?? at[0], at.y ?? at[1], at.z ?? at[2] ?? 0);
      s.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, (Math.random() - 0.5) * 0.6).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.45 + Math.random() * 0.5;
      s.s = 0.7 + Math.random();
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  puff(at, count, color, speed) {
    for (let k = 0; k < count; k++) {
      const s = this.puffPool[this.puffNext];
      this.puffs.setColorAt(this.puffNext, new T.Color(color));
      this.puffNext = (this.puffNext + 1) % this.puffPool.length;
      s.p.set(at[0], at[1], at[2]);
      s.v.set(-Math.random() * speed, Math.random() * speed * 0.6, (Math.random() - 0.5) * speed);
      s.max = s.life = 0.4 + Math.random() * 0.4;
    }
    this.puffs.instanceColor.needsUpdate = true;
  }
  confetti(at) {
    for (let k = 0; k < 130; k++) {
      const s = this.confPool[this.confNext];
      this.confNext = (this.confNext + 1) % this.confPool.length;
      s.p.set(at[0] + (Math.random() - 0.5) * 2, at[1], at[2] + (Math.random() - 0.5));
      s.v.set((Math.random() - 0.5) * 7, 4 + Math.random() * 5, (Math.random() - 0.5) * 3);
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
    for (const c of this.clouds || []) c.position.x += dt * 0.4;
    if (this.friend) {
      const happy = this.cheer && t - this.cheer < 3;
      this.friend.position.y = (this.g ? this.g(this.friend.position.x) : 0) + (happy ? Math.abs(Math.sin((t - this.cheer) * 9)) * 0.5 : Math.abs(Math.sin(t * 2)) * 0.04);
    }
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
        s.p.addScaledVector(s.v, dt);
      }
      const f = s.life > 0 ? s.life / s.max : 0;
      d.position.copy(s.p);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f > 0 ? 1.5 - f * 0.7 : 0);
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
  screen(v) {
    const p = new T.Vector3(...v).project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
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
