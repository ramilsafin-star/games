// 3D «Колеса огоньков»: ночной парк аттракционов, колесо обозрения с кабинками,
// огоньки с мордочками на ободе, шарики, енотик Фоня с корзинкой, стрелка перед поворотом, салют.
// Логика (wheel.js) задаёт угол колеса θ(t) и места огоньков; здесь всё рисуется по тем же числам.
import * as T from "../vendor/three/three.module.min.js?v=34014e05";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=34014e05";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=34014e05";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=34014e05";
import { polish } from "./gfx.js?v=34014e05";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=34014e05";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=34014e05";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=34014e05";
import { RADIUS, CONTACT, FLIGHT } from "./wheel.js?v=34014e05";

const pie = Math.PI;
const D2R = pie / 180;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const metal = (color, extra = {}) => new T.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3, ...extra });
const glowColor = (c, k = 2.2) => new T.Color(c).multiplyScalar(k);

// Цвета огоньков по порядку и оформление колёс
export const LIGHTS = ["#ffd84a", "#ff6fa8", "#7fe8ff", "#8dff8a", "#ffa04a", "#c79bff", "#ff5f6d", "#5fd0ff"];
const LOOKS = [
  { rim: "#ff6fa8", spoke: "#ffffff", cab: ["#ffd84a", "#7fe8ff", "#8dff8a", "#ff9fc8"], sky: ["#1b2a6b", "#5b3a8a"] },
  { rim: "#3fb4ff", spoke: "#e8f6ff", cab: ["#ffd84a", "#ff6fa8", "#8dff8a", "#ffffff"], sky: ["#14306b", "#2f5aa0"] },
  { rim: "#ffa02e", spoke: "#fff4d8", cab: ["#7fe8ff", "#ff6fa8", "#c79bff", "#8dff8a"], sky: ["#22205a", "#6a3a7a"] },
  { rim: "#8dff8a", spoke: "#ffffff", cab: ["#ff6fa8", "#ffd84a", "#7fe8ff", "#ffa04a"], sky: ["#10285a", "#2a6a7a"] },
  { rim: "#c79bff", spoke: "#fff0ff", cab: ["#ffd84a", "#8dff8a", "#ff6fa8", "#7fe8ff"], sky: ["#1a1850", "#4a2a7a"] },
  { rim: "#ff5f6d", spoke: "#ffe8b0", cab: ["#ffd84a", "#7fe8ff", "#8dff8a", "#c79bff"], sky: ["#160f40", "#6a2a6a"] },
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
  g.addColorStop(0.3, "rgba(255,255,255,0.45)");
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

// ---------- Огонёк: светящийся шарик с мордочкой ----------
const BULB = new T.SphereGeometry(0.22, 22, 16);
const EYE = new T.SphereGeometry(0.035, 10, 8);
const EYE_MAT = new T.MeshBasicMaterial({ color: "#2a1a30" });
const SMILE = new T.TorusGeometry(0.06, 0.014, 6, 14, pie);
function ogonek(color) {
  const g = new T.Group();
  const bulb = new T.Mesh(BULB, new T.MeshStandardMaterial({ color, emissive: glowColor(color, 1.25), roughness: 0.3, toneMapped: false }));
  g.add(bulb);
  for (const s of [-1, 1]) {
    const e = new T.Mesh(EYE, EYE_MAT);
    e.position.set(s * 0.075, 0.04, 0.2);
    g.add(e);
    const shine = new T.Mesh(new T.SphereGeometry(0.012, 6, 4), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(s * 0.075 + 0.012, 0.055, 0.225);
    g.add(shine);
  }
  const smile = new T.Mesh(SMILE, EYE_MAT);
  smile.rotation.z = pie;
  smile.position.set(0, -0.035, 0.205);
  g.add(smile);
  const halo = glowSprite(color, 1.3, 0.75);
  g.add(halo);
  return { g, bulb, halo };
}

// ---------- Енотик Фоня с корзинкой ----------
function raccoon() {
  const g = new T.Group();
  const grey = matte("#9aa0b0", { roughness: 0.75 }),
    dark = matte("#3a3a48", { roughness: 0.7 }),
    light = matte("#f2eee8", { roughness: 0.7 });
  const body = new T.Group();
  g.add(body);
  const torso = new T.Mesh(new T.SphereGeometry(0.42, 22, 16), grey);
  torso.scale.set(1, 1.1, 0.9);
  torso.position.y = 0.5;
  body.add(torso);
  const belly = new T.Mesh(new T.SphereGeometry(0.28, 18, 12), light);
  belly.scale.set(1, 1.15, 0.6);
  belly.position.set(0, 0.45, 0.25);
  body.add(belly);
  const head = new T.Group();
  head.position.set(0, 1.12, 0.05);
  body.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(0.36, 22, 16), grey);
  skull.scale.set(1.12, 0.95, 1);
  head.add(skull);
  // Маска
  const mask = new T.Mesh(new T.SphereGeometry(0.2, 16, 10), dark);
  mask.scale.set(1.9, 0.55, 0.6);
  mask.position.set(0, 0.04, 0.24);
  head.add(mask);
  const muzzle = new T.Mesh(new T.SphereGeometry(0.16, 16, 12), light);
  muzzle.scale.set(1.2, 0.8, 0.9);
  muzzle.position.set(0, -0.11, 0.27);
  head.add(muzzle);
  const nose = new T.Mesh(new T.SphereGeometry(0.055, 12, 8), glossy("#20161e"));
  nose.position.set(0, -0.07, 0.42);
  head.add(nose);
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(0.06, 14, 10), glossy("#ffffff", { roughness: 0.2 }));
    eye.position.set(s * 0.13, 0.05, 0.33);
    head.add(eye);
    const pupil = new T.Mesh(new T.SphereGeometry(0.038, 12, 8), glossy("#15101a"));
    pupil.position.set(s * 0.13, 0.05, 0.38);
    head.add(pupil);
    const shine = new T.Mesh(new T.SphereGeometry(0.012, 6, 4), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(s * 0.13 + 0.014, 0.068, 0.415);
    head.add(shine);
    const ear = new T.Mesh(new T.ConeGeometry(0.12, 0.2, 14), grey);
    ear.position.set(s * 0.26, 0.3, -0.02);
    ear.rotation.z = -s * 0.35;
    head.add(ear);
    const inner = new T.Mesh(new T.ConeGeometry(0.06, 0.12, 10), light);
    inner.position.set(s * 0.255, 0.29, 0.04);
    inner.rotation.z = -s * 0.35;
    head.add(inner);
    const cheek = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), matte("#ffa6c0"));
    cheek.scale.set(1, 0.6, 0.4);
    cheek.position.set(s * 0.24, -0.08, 0.27);
    head.add(cheek);
  }
  // Полосатый хвост
  const tail = new T.Group();
  for (let k = 0; k < 5; k++) {
    const r = new T.Mesh(new T.SphereGeometry(0.16 - k * 0.012, 14, 10), k % 2 ? dark : grey);
    r.position.set(0.32 + k * 0.13, 0.25 + k * 0.1, -0.25 - k * 0.05);
    tail.add(r);
  }
  body.add(tail);
  // Лапки держат корзинку перед собой
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(s * 0.36, 0.72, 0.12);
    const a = new T.Mesh(new T.CapsuleGeometry(0.08, 0.28, 6, 10), grey);
    a.position.y = -0.18;
    arm.add(a);
    const paw = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), dark);
    paw.position.y = -0.36;
    arm.add(paw);
    arm.rotation.x = -0.9;
    arm.rotation.z = s * 0.35;
    body.add(arm);
    arms.push(arm);
  }
  for (const s of [-1, 1]) {
    const foot = new T.Mesh(new T.SphereGeometry(0.13, 12, 8), dark);
    foot.scale.set(1, 0.55, 1.3);
    foot.position.set(s * 0.2, 0.06, 0.08);
    body.add(foot);
  }
  // Корзинка
  const basket = new T.Group();
  const weave = canvasTexture(128, 64, (x, w, h) => {
    x.fillStyle = "#c8864a";
    x.fillRect(0, 0, w, h);
    x.strokeStyle = "#8a5428";
    x.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      x.moveTo(0, i * 8);
      x.lineTo(w, i * 8);
      x.stroke();
    }
    for (let i = 0; i < 16; i++) {
      x.beginPath();
      x.moveTo(i * 8 + ((i % 2) * 4), 0);
      x.lineTo(i * 8 + ((i % 2) * 4), h);
      x.stroke();
    }
  });
  weave.wrapS = T.RepeatWrapping;
  weave.repeat.set(3, 1);
  const pot = new T.Mesh(new T.CylinderGeometry(0.42, 0.32, 0.36, 24, 1, true), new T.MeshStandardMaterial({ map: weave, roughness: 0.9, side: T.DoubleSide }));
  basket.add(pot);
  const bottom = new T.Mesh(new T.CircleGeometry(0.32, 20), matte("#8a5428"));
  bottom.rotation.x = -pie / 2;
  bottom.position.y = -0.17;
  basket.add(bottom);
  const lip = new T.Mesh(new T.TorusGeometry(0.42, 0.04, 8, 28), matte("#a86a38"));
  lip.rotation.x = pie / 2;
  lip.position.y = 0.18;
  basket.add(lip);
  basket.position.set(0, 0.62, 0.62);
  g.add(basket);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return { g, body, head, arms, basket, tail };
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
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();
    this.scene.fog = new T.Fog(0x2a2a6a, 30, 70);
    this.camera = new T.PerspectiveCamera(45, 1, 0.1, 200);
    this.hemi = new T.HemisphereLight(0xb8c8ff, 0x2a3050, 0.9);
    this.scene.add(this.hemi);
    this.moon = new T.DirectionalLight(0xcfe0ff, 1.1);
    this.moon.position.set(-6, 14, 10);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    Object.assign(this.moon.shadow.camera, { left: -10, right: 10, top: 12, bottom: -3, near: 1, far: 40 });
    this.scene.add(this.moon);
    // Тёплый свет от колеса — разгорается вместе с огоньками
    this.wheelLight = new T.PointLight(0xffc870, 0, 18, 1.6);
    this.scene.add(this.wheelLight);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.85, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
    this.makeParticles();
    this.buildPark();
    this.levelGroup = new T.Group();
    this.scene.add(this.levelGroup);
    this.fox = raccoon();
    this.fox.g.position.set(0, 0, 0.2);
    this.fox.g.scale.setScalar(1.25);
    // Откуда вылетает огонёк — над корзинкой енотика
    this.launchPos = new T.Vector3(0, 0.62 * 1.25 + 0.42, 0.2 + 0.62 * 1.25);
    this.scene.add(this.fox.g);
    // Огоньки в корзинке и тот, что летит
    this.basketBalls = [];
    for (let k = 0; k < 6; k++) {
      const o = ogonek(LIGHTS[k % LIGHTS.length]);
      o.g.scale.setScalar(0.62);
      o.halo.visible = false;
      this.fox.basket.add(o.g);
      o.g.position.set(((k % 3) - 1) * 0.2, 0.1 + Math.floor(k / 3) * 0.08, (Math.floor(k / 3) - 0.5) * 0.14);
      this.basketBalls.push(o);
    }
    this.flyer = ogonek(LIGHTS[0]);
    this.scene.add(this.flyer.g);
    this.flyer.g.visible = false;
    this.cam = { y: 4, dist: 14 };
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
    this.R = RADIUS.small;
    this.H = RADIUS.small + 3.4;
    this.resize();
    this.onFrame = null;
    this.last = 0;
    this.renderer.setAnimationLoop((ms) => this.frame(ms));
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.time, dur: this.motion.matches ? seconds * 0.5 : seconds, update, done }));
  }
  // Камера спереди: видно всё колесо с шариками, енотика и корзинку
  fitCamera() {
    const cam = this.camera,
      R = this.R,
      H = this.H;
    const top = H + R + 1.5,
      bottom = -0.2,
      half = R + 1.5;
    const pts = [new T.Vector3(0, top, 0), new T.Vector3(0, bottom, 0.8), new T.Vector3(-half, H, 0), new T.Vector3(half, H, 0)];
    const v = new T.Vector3();
    const fits = (cy, dist) => {
      cam.position.set(0, cy + dist * 0.12, dist);
      cam.lookAt(0, cy, 0);
      cam.updateMatrixWorld();
      return pts.every((p) => {
        v.copy(p).project(cam);
        return Math.abs(v.x) <= 0.94 && v.y >= -0.9 && v.y <= 0.72;
      });
    };
    let best = null;
    for (let cy = H * 0.3; cy <= H * 1.1; cy += 0.1) {
      let lo = 4,
        hi = 80;
      if (!fits(cy, hi)) continue;
      for (let k = 0; k < 22; k++) {
        const m = (lo + hi) / 2;
        fits(cy, m) ? (hi = m) : (lo = m);
      }
      if (!best || hi < best.dist) best = { cy, dist: hi };
    }
    best = best || { cy: H * 0.6, dist: 16 };
    this.cam.y = best.cy;
    this.cam.dist = best.dist * 1.02;
    this.scene.fog.near = this.cam.dist + 6;
    this.scene.fog.far = this.cam.dist + 45;
  }
  // ---------- Парк вокруг ----------
  buildPark() {
    const S = this.scene;
    const R = rng(11);
    // Небо: градиент, звёзды, луна
    this.sky = new T.Mesh(
      new T.SphereGeometry(120, 32, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new T.Color("#1b2a6b") }, bottom: { value: new T.Color("#5b3a8a") } },
        vertexShader: "varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ float h = clamp(normalize(p).y * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }",
      }),
    );
    S.add(this.sky);
    const n = 260,
      pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = R() * pie * 2,
        e = 0.12 + R() * 1.1;
      pos.set([Math.cos(a) * Math.cos(e) * 100, Math.sin(e) * 100, Math.sin(a) * Math.cos(e) * 100 - 20], i * 3);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(pos, 3));
    this.starsField = new T.Points(sg, new T.PointsMaterial({ color: new T.Color(1.8, 1.8, 1.6), size: 0.6, sizeAttenuation: true, toneMapped: false, fog: false }));
    S.add(this.starsField);
    const moon = new T.Mesh(new T.SphereGeometry(3, 24, 16), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.55, 1.3), toneMapped: false, fog: false }));
    moon.position.set(-38, 34, -70);
    S.add(moon);
    const mg = glowSprite("#fff4c8", 22, 0.35);
    mg.material.fog = false;
    mg.position.copy(moon.position);
    S.add(mg);
    // Земля: трава и дорожка
    const ground = new T.Mesh(new T.CircleGeometry(70, 48), matte("#1f4a3a", { roughness: 0.95 }));
    ground.rotation.x = -pie / 2;
    ground.receiveShadow = true;
    S.add(ground);
    const path = new T.Mesh(new T.CircleGeometry(6.5, 40), matte("#6a5a7a", { roughness: 0.9 }));
    path.rotation.x = -pie / 2;
    path.position.set(0, 0.01, 1.5);
    path.scale.set(1.4, 1, 1);
    path.receiveShadow = true;
    S.add(path);
    // Холмы вдали
    for (let k = 0; k < 7; k++) {
      const h = new T.Mesh(new T.SphereGeometry(10 + R() * 8, 20, 12), matte("#1a3550"));
      h.scale.y = 0.35;
      h.position.set(-50 + k * 17, -1, -55 - R() * 10);
      S.add(h);
    }
    // Шатры, деревья с гирляндами, фонари, ограда — по бокам; «огни парка» загораются при победе
    this.parkLights = [];
    const tent = (x, z, c1, c2, s = 1) => {
      const g = new T.Group();
      const stripes = canvasTexture(256, 64, (x2, w, h) => {
        for (let i = 0; i < 8; i++) {
          x2.fillStyle = i % 2 ? c1 : c2;
          x2.fillRect((i * w) / 8, 0, w / 8, h);
        }
      });
      const base = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 1.6, 16, 1, true), new T.MeshStandardMaterial({ map: stripes, roughness: 0.8 }));
      base.position.y = 0.8;
      g.add(base);
      const roof = new T.Mesh(new T.ConeGeometry(1.9, 1.5, 16), new T.MeshStandardMaterial({ map: stripes, roughness: 0.8 }));
      roof.position.y = 2.35;
      g.add(roof);
      const flag = new T.Mesh(new T.ConeGeometry(0.15, 0.4, 3), glossy(c1));
      flag.rotation.z = -pie / 2;
      flag.position.set(0.2, 3.3, 0);
      g.add(flag);
      const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.5, 6), glossy("#ffffff"));
      pole.position.y = 3.2;
      g.add(pole);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * pie * 2;
        this.parkBulb(g, Math.cos(a) * 1.62, 1.6, Math.sin(a) * 1.62, LIGHTS[i % LIGHTS.length]);
      }
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      S.add(g);
    };
    const tree = (x, z, s = 1) => {
      const g = new T.Group();
      const trunk = new T.Mesh(new T.CylinderGeometry(0.15, 0.2, 1.2, 8), matte("#4a3428"));
      trunk.position.y = 0.6;
      g.add(trunk);
      const crown = new T.Mesh(new T.IcosahedronGeometry(1.1, 1), matte("#2f6a4a", { flatShading: true }));
      crown.position.y = 1.9;
      g.add(crown);
      for (let i = 0; i < 7; i++) this.parkBulb(g, Math.cos(i * 0.9) * 0.9, 1.5 + (i % 3) * 0.35, Math.sin(i * 0.9) * 0.9 + 0.3, LIGHTS[(i + 3) % LIGHTS.length]);
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      S.add(g);
    };
    const post = (x, z) => {
      const g = new T.Group();
      const p = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 2.4, 8), metal("#2a2a40"));
      p.position.y = 1.2;
      g.add(p);
      this.parkBulb(g, 0, 2.5, 0, "#fff0c0", 0.2);
      g.position.set(x, 0, z);
      S.add(g);
    };
    tent(-9.5, -4, "#ff6fa8", "#fff0f6", 1.1);
    tent(10, -5, "#3fb4ff", "#f0f8ff", 1.2);
    tent(-15, -11, "#ffd84a", "#fff8e0", 1.3);
    tent(16, -12, "#8dff8a", "#f0fff0", 1.2);
    for (const [x, z, s] of [[-6.5, -7, 1.1], [7, -8, 1], [-12, 1, 1.2], [12.5, 0.5, 1.1], [-19, -4, 1.4], [20, -3, 1.3], [0, -14, 1.5], [-4, -16, 1.2], [5, -17, 1.3]]) tree(x, z, s);
    for (const x of [-5.5, -3, 3, 5.5]) post(x, 4.2);
    // Гирлянда между фонарями
    for (let k = 0; k < 28; k++) {
      const x = -6 + k * (12 / 27),
        y = 2.45 - Math.sin((k / 27) * pie) * 0.5;
      const g = new T.Group();
      g.position.set(x, 0, 4.2);
      S.add(g);
      this.parkBulb(g, 0, y, 0, LIGHTS[k % LIGHTS.length], 0.07);
    }
    // Карусель с лошадками справа
    const car = new T.Group();
    const base = new T.Mesh(new T.CylinderGeometry(2, 2.1, 0.3, 28), glossy("#ff6fa8"));
    base.position.y = 0.15;
    car.add(base);
    const roof = new T.Mesh(new T.ConeGeometry(2.3, 1.2, 28), glossy("#ffd84a"));
    roof.position.y = 3.2;
    car.add(roof);
    const pole = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 3, 10), metal("#ffd84a"));
    pole.position.y = 1.6;
    car.add(pole);
    this.horses = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * pie * 2;
      const h = new T.Group();
      const body = new T.Mesh(new T.CapsuleGeometry(0.18, 0.5, 6, 10), glossy(["#ffffff", "#ffd0e0", "#d0f0ff"][i % 3]));
      body.rotation.z = pie / 2;
      h.add(body);
      const head = new T.Mesh(new T.CapsuleGeometry(0.1, 0.25, 4, 8), glossy("#ffffff"));
      head.position.set(0.38, 0.22, 0);
      head.rotation.z = -0.5;
      h.add(head);
      const rod = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 2.6, 6), metal("#ffd84a"));
      rod.position.y = 0.3;
      h.add(rod);
      h.position.set(Math.cos(a) * 1.5, 1.4, Math.sin(a) * 1.5);
      h.rotation.y = -a;
      h.userData.ph = i;
      car.add(h);
      this.horses.push(h);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * pie * 2;
      this.parkBulb(car, Math.cos(a) * 2.3, 2.65, Math.sin(a) * 2.3, LIGHTS[i % LIGHTS.length], 0.09);
    }
    car.position.set(13.5, 0, -1);
    S.add(car);
    this.carousel = car;
    this.setParkLit(0.25);
  }
  parkBulb(parent, x, y, z, color, r = 0.08) {
    const m = new T.Mesh(new T.SphereGeometry(r, 8, 6), new T.MeshBasicMaterial({ color: glowColor(color, 2), toneMapped: false }));
    m.position.set(x, y, z);
    m.userData.base = new T.Color(color);
    parent.add(m);
    this.parkLights.push(m);
    return m;
  }
  // Насколько горит парк: 0 — темно, 1 — все огни (после того как колесо засветилось)
  setParkLit(k) {
    this.parkLit = k;
    for (const m of this.parkLights) m.material.color.copy(m.userData.base).multiplyScalar(0.25 + k * 2.2);
  }
  // ---------- Колесо уровня ----------
  setLevel(level, wheel, index) {
    const G = this.levelGroup;
    G.traverse((o) => {
      if (o.geometry && o.geometry !== BULB && o.geometry !== EYE && o.geometry !== SMILE) o.geometry.dispose();
    });
    G.clear();
    const look = LOOKS[index % LOOKS.length];
    this.look = look;
    this.sky.material.uniforms.top.value.set(look.sky[0]);
    this.sky.material.uniforms.bottom.value.set(look.sky[1]);
    this.scene.fog.color.set(look.sky[1]).multiplyScalar(0.6);
    const R = RADIUS[level.size];
    this.R = R;
    this.H = R + 3.4;
    const H = this.H;
    this.level = level;
    this.wheelState = wheel;
    // Опоры
    const legMat = metal("#e8e8f8", { roughness: 0.35 });
    // Опоры стоят позади колеса — не заслоняют огоньки
    for (const s of [-1, 1])
      for (const z of [-0.45, -0.95]) {
        const len = Math.hypot(R * 0.78, H);
        const leg = new T.Mesh(new T.CylinderGeometry(0.09, 0.13, len, 10), legMat);
        leg.position.set((s * R * 0.78) / 2, H / 2, z);
        leg.rotation.z = s * Math.atan2(R * 0.78, H);
        leg.castShadow = true;
        G.add(leg);
      }
    const axle = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 1.1, 12), legMat);
    axle.rotation.x = pie / 2;
    axle.position.set(0, H, -0.6);
    G.add(axle);
    // Вращающаяся часть
    const rot = new T.Group();
    rot.position.set(0, H, 0);
    G.add(rot);
    this.rot = rot;
    const rimMat = glossy(look.rim, { emissive: new T.Color(look.rim).multiplyScalar(0.15) });
    for (const z of [-0.18, 0.18]) {
      const rim = new T.Mesh(new T.TorusGeometry(R, 0.08, 10, 96), rimMat);
      rim.position.z = z;
      rot.add(rim);
      const inner = new T.Mesh(new T.TorusGeometry(R * 0.62, 0.05, 8, 72), rimMat);
      inner.position.z = z;
      rot.add(inner);
    }
    const spokeMat = metal(look.spoke, { roughness: 0.35 });
    const nSp = level.size === "big" ? 20 : 16;
    this.chase = [];
    for (let i = 0; i < nSp; i++) {
      const a = (i / nSp) * pie * 2;
      const sp = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, R, 6), spokeMat);
      sp.position.set((Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, 0);
      sp.rotation.z = a - pie / 2;
      rot.add(sp);
      // Бегущие огоньки по спицам — загораются, когда колесо заполнено
      const b = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), new T.MeshBasicMaterial({ color: new T.Color("#ffffff").multiplyScalar(0.3), toneMapped: false }));
      b.position.set(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, 0.12);
      rot.add(b);
      this.chase.push(b);
      // Поперечины между ободами
      const bar = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.36, 6), spokeMat);
      bar.rotation.x = pie / 2;
      bar.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      rot.add(bar);
    }
    const hub = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.5, 24), glossy(look.rim));
    hub.rotation.x = pie / 2;
    rot.add(hub);
    const star = new T.Mesh(
      new T.CircleGeometry(0.4, 24),
      new T.MeshBasicMaterial({
        map: canvasTexture(128, 128, (x) => {
          x.fillStyle = "#ffffff";
          x.beginPath();
          for (let i = 0; i <= 10; i++) {
            const a = (i / 10) * pie * 2 - pie / 2,
              r = i % 2 ? 22 : 56;
            x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
          }
          x.fill();
        }),
        transparent: true,
        color: new T.Color(2, 1.8, 0.8),
        toneMapped: false,
      }),
    );
    star.position.z = 0.26;
    rot.add(star);
    this.hubStar = star;
    // Кабинки висят на внутреннем ободе и всегда смотрят вниз
    this.cabins = [];
    const nCab = level.size === "big" ? 10 : 8;
    for (let i = 0; i < nCab; i++) {
      const a = (i / nCab) * pie * 2 + pie / nCab;
      const piv = new T.Group();
      piv.position.set(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, 0);
      rot.add(piv);
      const hang = new T.Group();
      piv.add(hang);
      const c = look.cab[i % look.cab.length];
      const cab = new T.Mesh(new RoundedBoxGeometry(0.5, 0.42, 0.5, 2, 0.1), glossy(c));
      cab.position.y = -0.36;
      hang.add(cab);
      const roof = new T.Mesh(new T.ConeGeometry(0.34, 0.18, 4), glossy("#ffffff"));
      roof.rotation.y = pie / 4;
      roof.position.y = -0.1;
      hang.add(roof);
      const window_ = new T.Mesh(new T.PlaneGeometry(0.3, 0.16), new T.MeshBasicMaterial({ color: new T.Color("#fff0b0").multiplyScalar(0.5), toneMapped: false }));
      window_.position.set(0, -0.34, 0.26);
      hang.add(window_);
      const rod = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.2, 6), metal("#dddddd"));
      rod.position.y = -0.05;
      hang.add(rod);
      this.cabins.push({ hang, window_ });
    }
    // Огоньки на ободе: уже горящие и новые
    this.lampMeshes = new Map();
    for (const l of wheel.lamps) this.addLamp(l, false);
    // Шарики на ободе
    this.balloonMeshes = wheel.balloons.map((b) => {
      const g = new T.Group();
      const ang = b.a * D2R;
      // Шарик смотрит наружу от обода и крутится вместе с колесом; внизу его «прокалывает» огонёк
      g.position.set(Math.cos(ang) * (R + 0.15), Math.sin(ang) * (R + 0.15), 0.25);
      g.rotation.z = ang - pie / 2;
      rot.add(g);
      const holder = new T.Group();
      g.add(holder);
      const c = ["#ff4f6d", "#ffd84a", "#3fb4ff", "#8dff8a", "#c79bff"][b.k % 5];
      const ball = new T.Mesh(new T.SphereGeometry(0.3, 20, 14), glossy(c, { roughness: 0.2, emissive: new T.Color(c).multiplyScalar(0.18) }));
      ball.scale.set(1, 1.18, 1);
      ball.position.y = 0.85;
      holder.add(ball);
      const knot = new T.Mesh(new T.ConeGeometry(0.06, 0.09, 8), glossy(c));
      knot.rotation.x = pie;
      knot.position.y = 0.5;
      holder.add(knot);
      const str = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.5, 4), matte("#ffffff"));
      str.position.y = 0.25;
      holder.add(str);
      return { g, holder, b, ball };
    });
    // Метка точки посадки внизу обода (не крутится) и подсказка «можно/подожди»
    const cy = H - R - 0.28;
    this.contactY = cy;
    this.ring = new T.Mesh(new T.TorusGeometry(0.34, 0.035, 8, 32), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.6, 1.6), toneMapped: false, transparent: true, opacity: 0.8 }));
    this.ring.position.set(0, cy, 0.3);
    G.add(this.ring);
    this.ringGlow = glowSprite("#ffffff", 1.4, 0.35);
    this.ringGlow.position.copy(this.ring.position);
    G.add(this.ringGlow);
    // Пунктир пути огонька от корзинки к ободу
    this.pathDots = [];
    for (let k = 0; k < 6; k++) {
      const d = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(1.4, 1.4, 1.6), toneMapped: false, transparent: true, opacity: 0.5 }));
      d.position.set(0, 1.55 + ((k + 0.5) / 6) * (cy - 1.85), 0.7);
      G.add(d);
      this.pathDots.push(d);
    }
    // Стрелка перед сменой направления
    this.arrow = new T.Group();
    const arcGeo = new T.TorusGeometry(R + 1.05, 0.11, 8, 40, pie * 0.55);
    const arrowMat = new T.MeshBasicMaterial({ color: new T.Color(2.2, 1.9, 0.6), toneMapped: false, transparent: true });
    const arcM = new T.Mesh(arcGeo, arrowMat);
    arcM.rotation.z = pie * 0.22;
    this.arrow.add(arcM);
    const head = new T.Mesh(new T.ConeGeometry(0.32, 0.6, 16), arrowMat);
    const ha = pie * 0.22 + pie * 0.55;
    head.position.set(Math.cos(ha) * (R + 1.05), Math.sin(ha) * (R + 1.05), 0);
    head.rotation.z = ha;
    this.arrow.add(head);
    this.arrow.position.set(0, H, 0.5);
    this.arrow.visible = false;
    G.add(this.arrow);
    // Метка встречи
    this.bumpMark = new T.Group();
    const bm = new T.Mesh(new T.TorusGeometry(0.36, 0.06, 8, 28), new T.MeshBasicMaterial({ color: new T.Color(2.4, 0.4, 0.6), toneMapped: false }));
    this.bumpMark.add(bm);
    this.bumpMark.add(glowSprite("#ff3060", 1.6, 0.8));
    this.bumpMark.visible = false;
    rot.add(this.bumpMark);
    this.flyer.g.visible = false;
    this.flying = null;
    this.bounce = null;
    this.doneT = null;
    this.wheelLight.position.set(0, H, 3);
    this.setParkLit(0.25);
    this.fitCamera();
    this.paintBasket(wheel.left);
  }
  addLamp(l, fresh) {
    const R = this.R;
    const color = l.preset ? "#ffcf6a" : LIGHTS[l.n % LIGHTS.length];
    const o = ogonek(color);
    if (l.preset) o.bulb.material.emissive.copy(glowColor(color, 0.75));
    const ang = l.a * D2R;
    o.g.position.set(Math.cos(ang) * (R + 0.28), Math.sin(ang) * (R + 0.28), 0.12);
    const socket = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 0.14, 10), metal("#dddddd"));
    socket.position.set(Math.cos(ang) * (R + 0.07), Math.sin(ang) * (R + 0.07), 0.12);
    socket.rotation.z = ang - pie / 2;
    this.rot.add(socket, o.g);
    if (l.preset) o.halo.material.opacity = 0.3;
    if (fresh) {
      o.g.scale.setScalar(0.01);
      this.tween(0.3, (p) => o.g.scale.setScalar(Math.max(0.01, 1 + Math.sin(p * pie) * 0.4 - (1 - p) * 0.99)));
    }
    this.lampMeshes.set(l, o);
    return o;
  }
  paintBasket(left) {
    this.basketBalls.forEach((b, k) => (b.g.visible = k < Math.min(left - 1, 6)));
  }
  // ---------- События ----------
  event(e, wheel) {
    const cy = this.contactY;
    if (e.type === "launch") {
      const color = LIGHTS[(wheel.level.supply - wheel.left) % LIGHTS.length];
      this.flyer.bulb.material.color.set(color);
      this.flyer.bulb.material.emissive.copy(glowColor(color, 1.25));
      this.flyer.halo.material.color.set(color);
      this.flyer.g.visible = true;
      this.flying = { t0: this.time, from: this.launchPos.clone(), to: new T.Vector3(0, cy, 0.3) };
      this.fox.arms.forEach((a) => (a.userData.kick = this.time));
      this.paintBasket(wheel.left - 1);
    } else if (e.type === "land") {
      this.flyer.g.visible = false;
      this.flying = null;
      this.addLamp(e.lamp, true);
      this.burst(new T.Vector3(0, cy, 0.4), 16, [LIGHTS[e.lamp.n % LIGHTS.length], "#ffffff"], 3);
      this.wheelLight.intensity = 6 * (1 - wheel.left / (wheel.lamps.length + wheel.left));
      this.paintBasket(wheel.left);
    } else if (e.type === "bump") {
      this.flying = null;
      // Метка встречи на ободе (крутится вместе с колесом), огонёк отскакивает в корзинку
      const R = this.R,
        a = e.at * D2R;
      this.bumpMark.position.set(Math.cos(a) * (R + 0.28), Math.sin(a) * (R + 0.28), 0.32);
      this.bumpMark.visible = true;
      this.bumpT = this.time;
      this.bumpLamp = this.lampMeshes.get(e.with);
      this.bounce = { t0: this.time, from: new T.Vector3(0, cy, 0.3) };
      this.burst(new T.Vector3(0, cy, 0.4), 10, ["#ff6f8f", "#ffffff"], 2.5);
    } else if (e.type === "ready") {
      this.bumpMark.visible = false;
      this.bumpLamp = null;
      this.paintBasket(wheel.left);
    } else if (e.type === "pop") {
      const m = this.balloonMeshes.find((q) => q.b === e.b);
      if (m) {
        const p = new T.Vector3();
        m.ball.getWorldPosition(p);
        this.confetti(p, 50);
        this.burst(p, 12, ["#ffffff", "#ffd84a"], 3);
        m.g.visible = false;
      }
    } else if (e.type === "done") {
      this.doneT = this.time;
      this.fireworks = 0;
    }
  }
  // ---------- Кадр ----------
  sync(wheel, dt, assist) {
    const t = this.time,
      calm = this.motion.matches;
    const th = wheel.theta();
    this.rot.rotation.z = th * D2R;
    // Кабинки и мордочки огоньков — всегда «головой вверх»
    for (const c of this.cabins) c.hang.rotation.z = -th * D2R + (calm ? 0 : Math.sin(t * 2 + c.hang.id) * 0.04);
    for (const o of this.lampMeshes.values()) o.g.rotation.z = -th * D2R;
    for (const m of this.balloonMeshes) m.holder.rotation.z = calm ? 0 : Math.sin(t * 1.6 + m.b.k) * 0.1;
    // Полёт огонька: снизу вверх за 0,18 с
    if (this.flying) {
      const p = clamp((t - this.flying.t0) / FLIGHT, 0, 1);
      this.flyer.g.position.lerpVectors(this.flying.from, this.flying.to, 1 - (1 - p) * (1 - p));
      this.flyer.g.rotation.z = 0;
    } else if (this.bounce) {
      const p = clamp((t - this.bounce.t0) / 0.65, 0, 1);
      const to = this.launchPos;
      this.flyer.g.position.lerpVectors(this.bounce.from, to, p);
      this.flyer.g.position.x = Math.sin(p * pie) * 0.9;
      this.flyer.g.position.y += Math.sin(p * pie) * 0.6;
      this.flyer.g.rotation.z = calm ? 0 : p * pie * 3;
      this.flyer.g.visible = p < 1;
      if (p >= 1) this.bounce = null;
    }
    // Огонёк, готовый к броску, — над корзинкой
    const ready = wheel.state === "play" && !wheel.flying && wheel.left > 0 && !this.bounce;
    if (ready) {
      const color = LIGHTS[(wheel.level.supply - wheel.left) % LIGHTS.length];
      this.flyer.g.visible = true;
      this.flyer.bulb.material.color.set(color);
      this.flyer.bulb.material.emissive.copy(glowColor(color, 1.25));
      this.flyer.halo.material.color.set(color);
      this.flyer.g.position.copy(this.launchPos);
      if (!calm) this.flyer.g.position.y += Math.sin(t * 4) * 0.04;
    } else if (!this.flying && !this.bounce) this.flyer.g.visible = false;
    // Кружок посадки: в учебном режиме зелёный — можно, красный — подожди (с учётом полёта)
    let ringColor = new T.Color(1.5, 1.5, 1.6);
    if (assist && wheel.state === "play") ringColor = wheel.blocker(wheel.predict()) ? new T.Color(2.4, 0.35, 0.45) : new T.Color(0.4, 2.4, 0.7);
    if (wheel.state === "bump") ringColor = new T.Color(2.4, 0.35, 0.45);
    this.ring.material.color.copy(ringColor);
    this.ringGlow.material.color.copy(ringColor).multiplyScalar(0.5);
    this.ring.scale.setScalar(calm ? 1 : 1 + Math.sin(t * 5) * 0.06);
    this.pathDots.forEach((d, k) => (d.material.opacity = ready ? 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 6 - k)) : 0.1));
    // Метка встречи и красная вспышка у мешающего огонька
    if (this.bumpMark.visible) {
      const f = clamp(1 - (t - this.bumpT) / 1.1, 0, 1);
      this.bumpMark.scale.setScalar(calm ? 1 : 1 + (1 - f) * 0.5);
      if (this.bumpLamp) this.bumpLamp.halo.material.color.set(Math.floor(t * 8) % 2 && !calm ? "#ff3050" : "#ff8090");
    }
    for (const [l, o] of this.lampMeshes) if (o !== this.bumpLamp) o.halo.material.color.set(l.preset ? "#ffcf6a" : LIGHTS[l.n % LIGHTS.length]);
    // Стрелка: колесо скоро повернёт
    const turn = wheel.prog.nextTurn(wheel.t);
    const warn = wheel.state !== "done" && turn && turn.in < 1.3;
    this.arrow.visible = !!warn;
    if (warn) {
      this.arrow.scale.set(turn.dir > 0 ? 1 : -1, 1, 1);
      this.arrow.children[0].material.opacity = calm ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(t * 7));
      this.arrow.rotation.z = calm ? 0 : turn.dir * Math.sin(t * 3) * 0.05;
    }
    // Енотик: лапки вверх при броске, хвостик виляет
    for (const a of this.fox.arms) {
      const k = a.userData.kick ? clamp(1 - (t - a.userData.kick) / 0.35, 0, 1) : 0;
      a.rotation.x = -0.9 - k * 1.2;
    }
    this.fox.basket.position.y = 0.62 + (this.fox.arms[0].userData.kick && t - this.fox.arms[0].userData.kick < 0.3 ? 0.12 : 0);
    this.fox.tail.rotation.y = calm ? 0 : Math.sin(t * 3) * 0.2;
    this.fox.head.rotation.z = calm ? 0 : Math.sin(t * 1.3) * 0.05;
    // Победа: бегущие огни по спицам, свет в кабинках, парк загорается, салют
    if (this.doneT !== null) {
      const p = clamp((t - this.doneT) / 1.5, 0, 1);
      this.setParkLit(0.25 + 0.75 * p);
      this.chase.forEach((b, k) => b.material.color.set(LIGHTS[(k + Math.floor(t * 6)) % LIGHTS.length]).multiplyScalar(calm ? 1.6 : 1.2 + Math.sin(t * 8 + k) * 0.8));
      this.cabins.forEach((c) => c.window_.material.color.set("#fff0b0").multiplyScalar(2));
      this.wheelLight.intensity = 9;
      this.hubStar.rotation.z = calm ? 0 : t * 2;
      const want = Math.floor((t - this.doneT) / 0.45);
      if (want > this.fireworks && this.fireworks < (calm ? 3 : 9)) {
        this.fireworks++;
        const R = rng(this.fireworks * 13 + 5);
        const at = new T.Vector3((R() - 0.5) * 14, this.H + this.R + 1 + R() * 4, -4 - R() * 6);
        this.burst(at, calm ? 20 : 60, [LIGHTS[this.fireworks % LIGHTS.length], LIGHTS[(this.fireworks + 3) % LIGHTS.length], "#ffffff"], 6);
        this.onFirework?.();
      }
    }
    for (const h of this.horses) h.position.y = 1.4 + (calm ? 0 : Math.sin(t * 2 + h.userData.ph) * 0.15);
    if (!calm) this.carousel.rotation.y = t * 0.3;
    // Камера
    this.camera.position.set(0, this.cam.y + this.cam.dist * 0.12, this.cam.dist);
    this.camera.lookAt(0, this.cam.y, 0);
  }
  // ---------- Частицы ----------
  makeParticles() {
    const n = 500;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.07, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    const c = 240;
    this.conf = new T.InstancedMesh(new T.PlaneGeometry(0.12, 0.2), new T.MeshBasicMaterial({ side: T.DoubleSide }), c);
    this.conf.frustumCulled = false;
    this.confPool = Array.from({ length: c }, () => ({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Vector3(), life: 0 }));
    this.confNext = 0;
    const cols = ["#ff4f6d", "#ffc533", "#3fdc7a", "#3fb4ff", "#8f5bff"];
    for (let i = 0; i < c; i++) this.conf.setColorAt(i, new T.Color(cols[i % cols.length]));
    this.scene.add(this.sparks, this.conf);
    this.dummy = new T.Object3D();
  }
  burst(at, count, colors, speed) {
    if (this.motion.matches) count = Math.ceil(count / 3);
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, glowColor(colors[k % colors.length], 1.6));
      this.next = (this.next + 1) % this.pool.length;
      s.p.copy(at);
      s.v.set(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      s.max = s.life = 0.6 + Math.random() * 0.6;
      s.s = 0.7 + Math.random();
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  confetti(at, n = 120) {
    if (this.motion.matches) n = Math.ceil(n / 3);
    for (let k = 0; k < n; k++) {
      const s = this.confPool[this.confNext];
      this.confNext = (this.confNext + 1) % this.confPool.length;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 5, 1 + Math.random() * 4, (Math.random() - 0.5) * 3);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.life = 2 + Math.random();
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
        s.v.y -= 2.2 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      d.position.copy(s.p);
      d.rotation.set(s.life * 7, s.life * 5, 0);
      d.scale.setScalar(Math.max(0, s.life / s.max) * s.s);
      d.updateMatrix();
      this.sparks.setMatrixAt(i, d.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    this.confPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 5 * dt;
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
}
