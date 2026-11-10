// 3D «Звездочёта Тишки»: обсерватория-станция парит среди звёзд. Пол в клетку, стены, ящики, телескопы,
// лифт, мышонок Тишка, роботы-сторожа Бип с фонариком. Свет фонарика на полу считается так же, как обнаружение.
// Клетка (x, z) из sim.js — это мир (x, 0, z).
import * as T from "../vendor/three/three.module.min.js?v=d5f7d380";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=d5f7d380";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=d5f7d380";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=d5f7d380";
import { polish } from "./gfx.js?v=d5f7d380";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=d5f7d380";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=d5f7d380";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=d5f7d380";
import { coneRays, TUNE_R } from "./sim.js?v=d5f7d380";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const glowing = (color, k = 2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const WALL_H = 1.0,
  BOX_H = 0.72;

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
function starShape(r1 = 0.5, r2 = 0.22) {
  const s = new T.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k * pie) / 5 + pie / 2,
      r = k % 2 ? r2 : r1;
    k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}
const textSprite = (text, color, size) => {
  const tex = canvasTexture(128, 128, (x) => {
    x.font = "900 104px system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.lineWidth = 16;
    x.strokeStyle = "#3a1f7a";
    x.strokeText(text, 64, 70);
    x.fillStyle = color;
    x.fillText(text, 64, 70);
  });
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.setScalar(size);
  s.renderOrder = 10;
  return s;
};

// ---------- Мышонок Тишка ----------
function mouse() {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  const fur = matte("#b9a7c9", { roughness: 0.9 }),
    light = matte("#f3e6f5"),
    pink = matte("#ff9fbf");
  const torso = new T.Mesh(new T.SphereGeometry(0.22, 20, 14), fur);
  torso.scale.set(0.9, 1, 1.1);
  torso.position.y = 0.26;
  body.add(torso);
  const belly = new T.Mesh(new T.SphereGeometry(0.15, 16, 12), light);
  belly.scale.set(0.9, 1, 0.6);
  belly.position.set(0, 0.24, 0.13);
  body.add(belly);
  const head = new T.Group();
  head.position.set(0, 0.56, 0.04);
  body.add(head);
  head.add(new T.Mesh(new T.SphereGeometry(0.19, 20, 14), fur));
  const snout = new T.Mesh(new T.ConeGeometry(0.1, 0.18, 14), fur);
  snout.rotation.x = pie / 2;
  snout.position.set(0, -0.03, 0.2);
  head.add(snout);
  const nose = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), glossy("#ff6f9f"));
  nose.position.set(0, -0.03, 0.3);
  head.add(nose);
  for (const s of [-1, 1]) {
    const ear = new T.Mesh(new T.SphereGeometry(0.13, 16, 12), fur);
    ear.scale.set(1, 1, 0.35);
    ear.position.set(s * 0.17, 0.15, -0.02);
    head.add(ear);
    const inner = new T.Mesh(new T.SphereGeometry(0.09, 14, 10), pink);
    inner.scale.set(1, 1, 0.3);
    inner.position.set(s * 0.17, 0.15, 0.02);
    head.add(inner);
    const eye = new T.Mesh(new T.SphereGeometry(0.04, 12, 8), glossy("#1d1420", { roughness: 0.1 }));
    eye.position.set(s * 0.08, 0.04, 0.16);
    head.add(eye);
    const shine = new T.Mesh(new T.SphereGeometry(0.013, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(s * 0.08 + 0.012, 0.055, 0.195);
    head.add(shine);
    const foot = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), pink);
    foot.scale.set(1, 0.5, 1.4);
    foot.position.set(s * 0.1, 0.03, 0.04);
    body.add(foot);
    foot.userData.side = s;
  }
  // Ночной колпак со звёздочкой и шарфик
  const cap = new T.Mesh(new T.ConeGeometry(0.15, 0.36, 18), glossy("#3f6bff", { roughness: 0.5 }));
  cap.position.set(0.02, 0.24, -0.02);
  cap.rotation.z = -0.35;
  head.add(cap);
  const pom = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), glowing("#ffe066", 1.2));
  pom.position.set(0.1, 0.4, -0.02);
  head.add(pom);
  const scarf = new T.Mesh(new T.TorusGeometry(0.14, 0.045, 8, 20), glossy("#ffc533"));
  scarf.rotation.x = pie / 2;
  scarf.position.y = 0.42;
  body.add(scarf);
  // Хвостик
  const tail = new T.Mesh(
    new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.15, -0.2), new T.Vector3(0, 0.1, -0.4), new T.Vector3(0.12, 0.2, -0.55), new T.Vector3(0.05, 0.32, -0.6)]), 20, 0.02, 6),
    pink,
  );
  body.add(tail);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  g.scale.setScalar(1.55);
  return { group: g, body, head, feet: body.children.filter((o) => o.userData.side) };
}

// ---------- Робот-сторож Бип ----------
function eyeTexture(mood) {
  return canvasTexture(128, 64, (x) => {
    x.fillStyle = "#16224a";
    x.fillRect(0, 0, 128, 64);
    x.fillStyle = mood === "alert" ? "#ffb02e" : "#7fe8ff";
    x.shadowColor = x.fillStyle;
    x.shadowBlur = 10;
    for (const cx of [40, 88]) {
      x.beginPath();
      if (mood === "calm") x.ellipse(cx, 34, 12, 14, 0, 0, 7);
      else x.ellipse(cx, 32, 15, 19, 0, 0, 7);
      x.fill();
    }
  });
}
function robot() {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  const white = glossy("#f4f6ff", { roughness: 0.25, clearcoat: 1 }),
    teal = glossy("#2fd0c0", { roughness: 0.3 });
  const base = new T.Mesh(new T.CylinderGeometry(0.32, 0.38, 0.16, 28), teal);
  base.position.y = 0.12;
  body.add(base);
  const hover = new T.Mesh(new T.TorusGeometry(0.33, 0.035, 8, 32), glowing("#7fe8ff", 2.2));
  hover.rotation.x = pie / 2;
  hover.position.y = 0.05;
  body.add(hover);
  const torso = new T.Mesh(new T.CapsuleGeometry(0.28, 0.26, 8, 20), white);
  torso.position.y = 0.5;
  body.add(torso);
  const band = new T.Mesh(new T.TorusGeometry(0.285, 0.03, 8, 32), teal);
  band.rotation.x = pie / 2;
  band.position.y = 0.48;
  body.add(band);
  const head = new T.Group();
  head.position.y = 0.92;
  body.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(0.27, 24, 16), white);
  skull.scale.set(1, 0.85, 1);
  head.add(skull);
  const tex = { calm: eyeTexture("calm"), alert: eyeTexture("alert") };
  const screen = new T.Mesh(new T.PlaneGeometry(0.34, 0.17), new T.MeshBasicMaterial({ map: tex.calm, toneMapped: false }));
  screen.position.set(0, 0.02, 0.255);
  head.add(screen);
  // Фонарик на лбу — из него идёт свет
  const lamp = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 0.08, 16), glowing("#fff3a0", 3));
  lamp.rotation.x = pie / 2;
  lamp.position.set(0, 0.17, 0.22);
  head.add(lamp);
  const antenna = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.22, 6), matte("#9aa6c8"));
  antenna.position.y = 0.32;
  head.add(antenna);
  const bulb = new T.Mesh(new T.SphereGeometry(0.055, 12, 8), new T.MeshStandardMaterial({ color: "#7dff9a", emissive: "#7dff9a", emissiveIntensity: 2 }));
  bulb.position.y = 0.45;
  head.add(bulb);
  for (const s of [-1, 1]) {
    const ear = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.05, 14), teal);
    ear.rotation.z = pie / 2;
    ear.position.set(s * 0.27, 0, 0);
    head.add(ear);
    const arm = new T.Mesh(new T.CapsuleGeometry(0.05, 0.16, 6, 10), white);
    arm.position.set(s * 0.33, 0.48, 0.02);
    arm.rotation.z = s * 0.3;
    body.add(arm);
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  g.scale.setScalar(1.3);
  return { group: g, body, head, screen, tex, bulb, mood: "calm" };
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
    this.camera = new T.PerspectiveCamera(40, 1, 0.1, 800);
    this.scene.add(new T.HemisphereLight(0xb8b0ff, 0x302060, 1.0));
    this.key = new T.DirectionalLight(0xfff0e0, 1.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
    this.key.shadow.bias = -0.001;
    this.scene.add(this.key, this.key.target);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.6, 0.45, 1.1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
    this.raycaster = new T.Raycaster();
    this.floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this.space();
    this.roomGroup = new T.Group();
    this.scene.add(this.roomGroup);
    this.makeParticles();
    this.resize = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
      if (this.room) this.fit();
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.onFrame = null;
    this.last = 0;
    this.renderer.setAnimationLoop((ms) => this.frame(ms));
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.time, dur: this.motion.matches ? seconds * 0.5 : seconds, update, done }));
  }
  // ---------- Космос вокруг ----------
  space() {
    const S = this.scene;
    const sky = new T.Mesh(
      new T.SphereGeometry(500, 40, 20),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: { time: { value: 0 } },
        vertexShader: "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `varying vec3 p; uniform float time;
          float h(vec3 q){ return fract(sin(dot(q, vec3(12.9898,78.233,37.719))) * 43758.5453); }
          float n(vec3 q){ vec3 i = floor(q), f = fract(q); f = f*f*(3.0-2.0*f);
            return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
          void main(){
            vec3 c = mix(vec3(0.05,0.04,0.18), vec3(0.16,0.06,0.32), p.y * 0.5 + 0.5);
            float a = n(p * 3.0 + vec3(time*0.01)) * 0.6 + n(p * 7.0) * 0.4;
            float b = n(p * 2.2 + vec3(5.0));
            c += vec3(0.85,0.25,0.75) * smoothstep(0.55, 0.85, a) * 0.45;
            c += vec3(0.2,0.55,0.95) * smoothstep(0.6, 0.9, b) * 0.4;
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    S.add(sky);
    this.sky = sky;
    const n = 1400,
      pos = new Float32Array(n * 3),
      col = new Float32Array(n * 3);
    const tints = [new T.Color("#ffffff"), new T.Color("#ffe8a8"), new T.Color("#a8d8ff"), new T.Color("#ffb8e8")];
    for (let i = 0; i < n; i++) {
      const v = new T.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(300 + Math.random() * 150);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = tints[i % 4];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(pos, 3));
    sg.setAttribute("color", new T.BufferAttribute(col, 3));
    this.stars = new T.Points(sg, new T.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 }));
    S.add(this.stars);
    // Планета с кольцом и луна
    const planet = new T.Group();
    const ball = new T.Mesh(
      new T.SphereGeometry(16, 40, 24),
      new T.MeshStandardMaterial({
        roughness: 0.8,
        map: canvasTexture(256, 128, (x) => {
          const g = x.createLinearGradient(0, 0, 0, 128);
          ["#ff9fd0", "#ffcf8a", "#ff8fb1", "#c89bff", "#ffb3c8", "#ff9fd0"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
          x.fillStyle = g;
          x.fillRect(0, 0, 256, 128);
        }),
        emissive: "#ff8fd0",
        emissiveIntensity: 0.15,
      }),
    );
    planet.add(ball);
    const ring = new T.Mesh(new T.RingGeometry(22, 32, 64), new T.MeshBasicMaterial({ color: "#ffe6a8", transparent: true, opacity: 0.5, side: T.DoubleSide }));
    ring.rotation.x = pie / 2.4;
    planet.add(ring);
    planet.position.set(-70, -20, -120);
    planet.rotation.z = 0.3;
    S.add(planet);
    this.planet = planet;
    const moon = new T.Mesh(new T.SphereGeometry(6, 32, 20), new T.MeshStandardMaterial({ color: "#d8e4ff", roughness: 0.9, emissive: "#8fa8ff", emissiveIntensity: 0.25 }));
    moon.position.set(70, 10, -110);
    S.add(moon);
  }
  // ---------- Комната ----------
  setRoom(game) {
    const G = this.roomGroup;
    G.traverse((o) => {
      if (o.geometry && !o.userData.keep) o.geometry.dispose();
    });
    G.clear();
    this.game = game;
    const room = game.room;
    this.room = room;
    const { w, h } = room;
    // Платформа-станция под комнатой со светящимся краем
    const slab = new T.Mesh(new RoundedBoxGeometry(w + 1.4, 1.2, h + 1.4, 3, 0.4), glossy("#5a4fb8", { roughness: 0.5 }));
    slab.position.set(w / 2, -0.62, h / 2);
    slab.receiveShadow = true;
    G.add(slab);
    const rim = new T.Mesh(new RoundedBoxGeometry(w + 1.5, 0.12, h + 1.5, 2, 0.06), glowing("#7fe8ff", 1.4));
    rim.position.set(w / 2, -0.95, h / 2);
    G.add(rim);
    for (let k = 0; k < 4; k++) {
      const leg = new T.Mesh(new T.ConeGeometry(1.2, 4, 6), glossy("#3f3590", { flatShading: true }));
      leg.rotation.x = pie;
      leg.position.set(k % 2 ? w - 1 : 1, -3.1, k < 2 ? 1 : h - 1);
      G.add(leg);
      const jet = glowSprite("#7fe8ff", 2.4, 0.8);
      jet.position.set(leg.position.x, -5.2, leg.position.z);
      G.add(jet);
    }
    // Пол: плитка с созвездиями
    const floorTex = canvasTexture(256, 256, (x) => {
      x.fillStyle = "#3b3398";
      x.fillRect(0, 0, 256, 256);
      x.fillStyle = "#463ead";
      x.fillRect(0, 0, 128, 128);
      x.fillRect(128, 128, 128, 128);
      x.strokeStyle = "#6a60d8";
      x.lineWidth = 4;
      x.strokeRect(2, 2, 252, 252);
      x.beginPath();
      x.moveTo(128, 0);
      x.lineTo(128, 256);
      x.moveTo(0, 128);
      x.lineTo(256, 128);
      x.stroke();
      x.fillStyle = "#8f86ff";
      for (const [cx, cy] of [[40, 60], [190, 40], [80, 200], [210, 180], [150, 110]]) {
        x.beginPath();
        x.arc(cx, cy, 3, 0, 7);
        x.fill();
      }
    });
    floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping;
    floorTex.repeat.set(w / 2, h / 2);
    const floor = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.1 }));
    floor.rotation.x = -pie / 2;
    floor.position.set(w / 2, 0, h / 2);
    floor.receiveShadow = true;
    G.add(floor);
    // Стены и ящики
    const wallGeo = new RoundedBoxGeometry(1, WALL_H, 1, 2, 0.08);
    const wallMat = glossy("#b8a8ff", { roughness: 0.55, clearcoat: 0.3 });
    const capGeo = new RoundedBoxGeometry(1.02, 0.1, 1.02, 2, 0.04);
    const capMat = glossy("#ffd6f0", { roughness: 0.4 });
    const boxTex = canvasTexture(128, 128, (x) => {
      x.fillStyle = "#ffb36b";
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = "#d9864a";
      x.lineWidth = 10;
      x.strokeRect(6, 6, 116, 116);
      x.beginPath();
      x.moveTo(6, 6);
      x.lineTo(122, 122);
      x.stroke();
      x.fillStyle = "#fff3a0";
      x.translate(64, 64);
      x.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k * pie) / 5 - pie / 2,
          r = k % 2 ? 11 : 26;
        x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      x.fill();
    });
    const boxGeo = new RoundedBoxGeometry(0.92, BOX_H, 0.92, 2, 0.06);
    const boxMat = new T.MeshStandardMaterial({ map: boxTex, roughness: 0.7 });
    let walls = 0,
      boxes = 0;
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        const c = room.cell(x, z);
        if (c === "#") walls++;
        if (c === "B") boxes++;
      }
    const wallMesh = new T.InstancedMesh(wallGeo, wallMat, walls),
      capMesh = new T.InstancedMesh(capGeo, capMat, walls),
      boxMesh = new T.InstancedMesh(boxGeo, boxMat, Math.max(1, boxes));
    const d = new T.Object3D();
    let wi = 0,
      bi = 0;
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        const c = room.cell(x, z);
        if (c === "#") {
          // Внешние стены ниже: лучше видно комнату
          const outer = x === 0 || z === 0 || x === w - 1 || z === h - 1;
          const hh = outer ? 0.55 : 1;
          d.position.set(x + 0.5, (WALL_H * hh) / 2, z + 0.5);
          d.scale.set(1, hh, 1);
          d.rotation.set(0, 0, 0);
          d.updateMatrix();
          wallMesh.setMatrixAt(wi, d.matrix);
          d.position.y = WALL_H * hh;
          d.scale.set(1, 1, 1);
          d.updateMatrix();
          capMesh.setMatrixAt(wi++, d.matrix);
        } else if (c === "B") {
          d.position.set(x + 0.5, BOX_H / 2, z + 0.5);
          d.scale.set(1, 1, 1);
          d.rotation.set(0, ((x * 7 + z * 3) % 5) * 0.06 - 0.12, 0);
          d.updateMatrix();
          boxMesh.setMatrixAt(bi++, d.matrix);
        }
      }
    boxMesh.count = bi;
    for (const m of [wallMesh, capMesh, boxMesh]) {
      m.castShadow = m.receiveShadow = true;
      G.add(m);
    }
    // Дверь-люк, лифт, телескопы, звёздочка
    const door = new T.Group();
    const hatch = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.05, 32), glossy("#2fd0c0"));
    hatch.position.y = 0.03;
    door.add(hatch);
    const hatchRing = new T.Mesh(new T.TorusGeometry(0.42, 0.04, 8, 32), glossy("#ffd25f", { metalness: 0.6 }));
    hatchRing.rotation.x = pie / 2;
    hatchRing.position.y = 0.06;
    door.add(hatchRing);
    door.position.set(room.door[0], 0, room.door[1]);
    G.add(door);
    this.elevator = this.makeElevator();
    this.elevator.group.position.set(room.exit[0], 0, room.exit[1]);
    G.add(this.elevator.group);
    this.scopes = game.terms.map((tm, i) => {
      const s = this.makeTelescope(i);
      s.group.position.set(tm.x, 0, tm.z);
      G.add(s.group);
      return s;
    });
    if (game.star) {
      const st = new T.Mesh(new T.ExtrudeGeometry(starShape(0.32, 0.14), { depth: 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }), glowing("#ffd25f", 1.4));
      st.geometry.center();
      st.position.set(game.star.x, 0.55, game.star.z);
      st.castShadow = true;
      const halo = glowSprite("#ffe066", 1.4, 0.7);
      halo.position.copy(st.position);
      G.add(st, halo);
      this.starMesh = { mesh: st, halo };
    } else this.starMesh = null;
    // Тишка
    this.mouse = mouse();
    G.add(this.mouse.group);
    // Силуэт Тишки сквозь стены: виден, даже когда он за ящиком
    // Рисуется после стен, но до самого Тишки: виден только там, где его закрывают стена или ящик
    this.ghost = new T.Group();
    const ghostMat = new T.MeshBasicMaterial({ color: "#8fdcff", depthWrite: false, depthFunc: T.GreaterDepth });
    this.mouse.group.traverse((o) => {
      if (!o.isMesh) return;
      o.renderOrder = 2;
      const m = new T.Mesh(o.geometry, ghostMat);
      m.userData.src = o;
      m.userData.keep = true;
      m.renderOrder = 1;
      this.ghost.add(m);
    });
    G.add(this.ghost);
    // Роботы и их свет
    this.bots = game.guards.map(() => {
      const r = robot();
      G.add(r.group);
      const n = 44;
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(new Float32Array((n + 2) * 3), 3));
      geo.setAttribute("edge", new T.BufferAttribute(new Float32Array(n + 2), 1));
      const idx = [];
      for (let k = 0; k < n; k++) idx.push(0, k + 1, k + 2);
      geo.setIndex(idx);
      const cone = new T.Mesh(
        geo,
        new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: T.DoubleSide,
          blending: T.AdditiveBlending,
          uniforms: { color: { value: new T.Color("#ffe27a") }, time: { value: 0 } },
          vertexShader: "attribute float edge; varying float vEdge; varying vec3 vPos; void main(){ vEdge = edge; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader: `uniform vec3 color; uniform float time; varying float vEdge; varying vec3 vPos;
            void main(){ float a = 0.85 * (1.0 - vEdge * 0.6);
              float ripple = 0.12 * sin(vEdge * 20.0 - time * 4.0);
              gl_FragColor = vec4(color * (a + ripple) * 1.25, a + ripple); }`,
        }),
      );
      cone.frustumCulled = false;
      cone.renderOrder = 2;
      G.add(cone);
      const q = textSprite("?", "#ffe066", 0.9);
      q.visible = false;
      G.add(q);
      const light = new T.PointLight(0xffe7a0, 3, 4, 1.5);
      G.add(light);
      return { ...r, cone, n, q, light };
    });
    // Светлячок, путь и кольцо цели
    this.firefly = new T.Group();
    const fb = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.4, 0.8), toneMapped: false }));
    this.firefly.add(fb);
    const fg = glowSprite("#e8ff7a", 1.1, 0.9);
    this.firefly.add(fg);
    for (const s of [-1, 1]) {
      const wing = new T.Mesh(new T.CircleGeometry(0.09, 12), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, side: T.DoubleSide }));
      wing.position.set(s * 0.1, 0.06, 0);
      wing.userData.s = s;
      this.firefly.add(wing);
    }
    this.firefly.visible = false;
    G.add(this.firefly);
    this.pathDots = new T.InstancedMesh(new T.SphereGeometry(0.06, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75 }), 200);
    this.pathDots.count = 0;
    this.pathDots.frustumCulled = false;
    G.add(this.pathDots);
    this.target = new T.Mesh(new T.RingGeometry(0.22, 0.32, 32), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
    this.target.rotation.x = -pie / 2;
    this.target.visible = false;
    G.add(this.target);
    // Свет над комнатой
    this.key.position.set(w / 2 - 4, 14, h / 2 + 6);
    this.key.target.position.set(w / 2, 0, h / 2);
    this.fit();
  }
  makeTelescope(i) {
    const g = new T.Group();
    const brass = glossy("#ffc95c", { metalness: 0.7, roughness: 0.25 }),
      tubeCol = ["#ff6fa8", "#3fb4ff", "#9b6bff", "#3fe07a"][i % 4];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * pie * 2;
      const leg = new T.Mesh(new T.CylinderGeometry(0.03, 0.04, 0.7, 8), brass);
      leg.position.set(Math.cos(a) * 0.2, 0.32, Math.sin(a) * 0.2);
      leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      g.add(leg);
    }
    const mount = new T.Group();
    mount.position.y = 0.66;
    g.add(mount);
    const tube = new T.Mesh(new T.CylinderGeometry(0.11, 0.15, 0.95, 20), glossy(tubeCol));
    tube.rotation.z = -0.9;
    tube.position.set(0.12, 0.12, 0);
    mount.add(tube);
    // Линза и обруч — на самой трубе (труба смотрит вдоль своей оси Y)
    const lens = new T.Mesh(new T.CircleGeometry(0.11, 20), new T.MeshStandardMaterial({ color: "#a8e8ff", emissive: "#7fe8ff", emissiveIntensity: 0.2 }));
    lens.position.y = 0.48;
    lens.rotation.x = -pie / 2;
    tube.add(lens);
    const bandM = new T.Mesh(new T.TorusGeometry(0.135, 0.025, 8, 20), brass);
    bandM.rotation.x = pie / 2;
    tube.add(bandM);
    const eyepiece = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.14, 10), brass);
    eyepiece.position.y = -0.52;
    tube.add(eyepiece);
    // Кольцо настройки на полу
    const ringBase = new T.Mesh(new T.RingGeometry(TUNE_R - 0.12, TUNE_R, 48), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
    ringBase.rotation.x = -pie / 2;
    ringBase.position.y = 0.02;
    g.add(ringBase);
    const prog = new T.Mesh(new T.RingGeometry(TUNE_R - 0.12, TUNE_R, 48, 1, 0, 0.001), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.4, 0.4), transparent: true, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
    prog.rotation.x = -pie / 2;
    prog.position.y = 0.025;
    g.add(prog);
    // Луч в небо после настройки
    const beam = new T.Mesh(
      new T.CylinderGeometry(0.12, 0.5, 40, 16, 1, true),
      new T.MeshBasicMaterial({ color: new T.Color(tubeCol).multiplyScalar(1.6), transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }),
    );
    beam.position.y = 20.5;
    g.add(beam);
    g.traverse((o) => o.isMesh && o !== beam && o !== prog && o !== ringBase && (o.castShadow = true));
    mount.rotation.y = i * 1.3;
    return { group: g, mount, lens, prog, ringBase, beam, tubeCol, last: -1 };
  }
  makeElevator() {
    const g = new T.Group();
    const frame = glossy("#e8ecff", { roughness: 0.3 });
    const back = new T.Mesh(new RoundedBoxGeometry(0.95, 1.5, 0.12, 2, 0.05), frame);
    back.position.set(0, 0.75, -0.42);
    g.add(back);
    for (const s of [-1, 1]) {
      const post = new T.Mesh(new RoundedBoxGeometry(0.12, 1.5, 0.9, 2, 0.05), frame);
      post.position.set(s * 0.47, 0.75, 0);
      g.add(post);
    }
    const roof = new T.Mesh(new RoundedBoxGeometry(1.05, 0.14, 1.0, 2, 0.05), glossy("#ff6fa8"));
    roof.position.y = 1.55;
    g.add(roof);
    const lamp = new T.Mesh(new T.SphereGeometry(0.1, 14, 10), new T.MeshStandardMaterial({ color: "#ff4f6d", emissive: "#ff4f6d", emissiveIntensity: 2.4 }));
    lamp.position.set(0, 1.72, 0);
    g.add(lamp);
    const doors = [];
    for (const s of [-1, 1]) {
      const d = new T.Mesh(new T.BoxGeometry(0.42, 1.36, 0.05), new T.MeshPhysicalMaterial({ color: "#9fe8ff", roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1 }));
      d.position.set(s * 0.21, 0.72, 0.42);
      g.add(d);
      doors.push(d);
    }
    const pad = new T.Mesh(new T.RingGeometry(0.3, 0.42, 32), new T.MeshBasicMaterial({ color: new T.Color(0.6, 2.0, 0.9), transparent: true, opacity: 0, side: T.DoubleSide, toneMapped: false }));
    pad.rotation.x = -pie / 2;
    pad.position.y = 0.03;
    g.add(pad);
    const arrow = new T.Mesh(new T.ConeGeometry(0.16, 0.3, 4), glowing("#7dff9a", 2));
    arrow.rotation.x = pie;
    arrow.position.y = 2.1;
    arrow.visible = false;
    g.add(arrow);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return { group: g, lamp, doors, pad, arrow, open: false };
  }
  // Камера сверху-спереди, вся комната в кадре при любой форме экрана.
  // На вертикальном экране камера заходит сбоку: длинная сторона комнаты идёт вдоль экрана.
  // Сверху остаётся место под шапку с кнопками.
  fit(aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)) {
    const { w, h } = this.room;
    const cam = this.camera,
      tilt = T.MathUtils.degToRad(56);
    const side = aspect < 0.85;
    const across = side ? h : w,
      deep = side ? w : h;
    cam.fov = 36;
    cam.aspect = aspect;
    cam.clearViewOffset();
    const vf = T.MathUtils.degToRad(cam.fov),
      hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const needV = ((deep + 1.2) * Math.sin(tilt) + 1.2) * 1.14,
      needH = across + 1.2;
    const dist = Math.max(needV / 2 / Math.tan(vf / 2), needH / 2 / Math.tan(hf / 2)) * 1.03;
    const c = new T.Vector3(w / 2, 0.2, h / 2);
    const back = side ? new T.Vector3(-1, 0, 0) : new T.Vector3(0, 0, 1);
    cam.position.copy(c).addScaledVector(back, Math.cos(tilt) * dist).add(new T.Vector3(0, Math.sin(tilt) * dist, 0));
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    // Картинку чуть вниз — под шапку
    const full = 1000,
      fh = full / aspect;
    cam.setViewOffset(full, fh, 0, -fh * 0.045, full, fh);
    this.side = side;
  }
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new T.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? [p.x, p.z] : null;
  }
  screen(x, z, y = 0) {
    const v = new T.Vector3(x, y, z).project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  // ---------- События ----------
  caught(at, g) {
    this.puff(at, "#ffffff", 22);
    this.burst([at[0], 0.6, at[1]], 16, ["#ffe066", "#ffffff"], 3);
    const door = this.room.door;
    this.puff(door, "#b8e8ff", 16);
    if (g) {
      const bot = this.bots[this.game.guards.indexOf(g)];
      if (bot) {
        const ex = textSprite("!", "#ff8f3f", 1.1);
        ex.position.copy(bot.group.position).add(new T.Vector3(0, 2.2, 0));
        this.roomGroup.add(ex);
        this.tween(1.2, (p) => {
          ex.position.y = bot.group.position.y + 2.2 + Math.sin(p * pie) * 0.4;
          ex.material.opacity = 1 - Math.max(0, p - 0.7) / 0.3;
        }).then(() => ex.removeFromParent());
      }
    }
  }
  tuned(i) {
    const s = this.scopes[i];
    if (!s) return;
    const p = s.group.position;
    this.burst([p.x, 1, p.z], 40, ["#ffe066", s.tubeCol, "#ffffff"], 4);
    s.lens.material.emissiveIntensity = 3;
    this.tween(1.2, (q) => (s.beam.material.opacity = 0.55 * Math.min(1, q * 2)));
  }
  gotStar() {
    if (!this.starMesh) return;
    const { mesh, halo } = this.starMesh;
    this.burst([mesh.position.x, 0.6, mesh.position.z], 30, ["#ffe066", "#ffffff", "#ff9fd0"], 3.5);
    this.tween(0.5, (p) => {
      mesh.scale.setScalar(1 + p);
      mesh.position.y = 0.55 + p * 1.5;
      halo.material.opacity = 0.7 * (1 - p);
    }).then(() => {
      mesh.visible = false;
      halo.visible = false;
    });
  }
  opened() {
    const e = this.elevator;
    e.open = true;
    e.lamp.material.color.set("#7dff9a");
    e.lamp.material.emissive.set("#7dff9a");
    e.arrow.visible = true;
    this.tween(0.8, (p) => {
      e.doors[0].position.x = -0.21 - p * 0.3;
      e.doors[1].position.x = 0.21 + p * 0.3;
      e.pad.material.opacity = p;
    });
  }
  finished() {
    const p = this.room.exit;
    this.burst([p[0], 1, p[1]], 60, ["#7dff9a", "#ffe066", "#ff9fd0", "#7fe8ff"], 5);
  }
  // ---------- Частицы ----------
  makeParticles() {
    const n = 500;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.07, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    this.puffs = new T.InstancedMesh(new T.SphereGeometry(0.22, 12, 8), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.85 }), 120);
    this.puffs.frustumCulled = false;
    this.puffPool = Array.from({ length: 120 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
    this.puffNext = 0;
    for (let i = 0; i < 120; i++) this.puffs.setColorAt(i, new T.Color("#ffffff"));
    this.scene.add(this.sparks, this.puffs);
    this.dummy = new T.Object3D();
  }
  burst(at, count, colors, speed) {
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, new T.Color(colors[k % colors.length]));
      this.next = (this.next + 1) % this.pool.length;
      s.p.set(at[0], at[1], at[2]);
      s.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.5 + Math.random() * 0.6;
      s.s = 0.7 + Math.random();
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  puff(at, color, count) {
    for (let k = 0; k < count; k++) {
      const s = this.puffPool[this.puffNext];
      this.puffs.setColorAt(this.puffNext, new T.Color(color));
      this.puffNext = (this.puffNext + 1) % this.puffPool.length;
      s.p.set(at[0] + (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.3, at[1] + (Math.random() - 0.5) * 0.4);
      s.v.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
      s.max = s.life = 0.6 + Math.random() * 0.4;
    }
    this.puffs.instanceColor.needsUpdate = true;
  }
  // ---------- Кадр ----------
  sync(dt) {
    const g = this.game;
    if (!g) return;
    const t = this.time,
      calm = this.motion.matches ? 0.3 : 1;
    // Тишка: идёт — подпрыгивает и перебирает лапками
    const m = this.mouse,
      p = g.p;
    m.group.position.set(p.x, 0, p.z);
    const want = -p.dir + pie / 2;
    const cur = m.group.rotation.y,
      dd = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    m.group.rotation.y = cur + dd * Math.min(1, dt * 12);
    const walk = p.moving ? t * 14 : 0;
    m.body.position.y = p.moving ? Math.abs(Math.sin(walk)) * 0.06 : Math.sin(t * 2) * 0.01;
    m.body.rotation.z = p.moving ? Math.sin(walk) * 0.08 : 0;
    m.feet.forEach((f) => (f.position.z = 0.04 + (p.moving ? Math.sin(walk + (f.userData.side > 0 ? 0 : pie)) * 0.08 : 0)));
    m.head.rotation.y = p.moving ? 0 : Math.sin(t * 0.8) * 0.3 * calm;
    this.ghost.position.copy(m.group.position);
    this.ghost.rotation.copy(m.group.rotation);
    this.ghost.scale.copy(m.group.scale);
    // Силуэт повторяет позы частей тела
    m.group.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(m.group.matrixWorld).invert();
    for (const gm of this.ghost.children) {
      const src = gm.userData.src;
      const local = new T.Matrix4().multiplyMatrices(inv, src.matrixWorld);
      local.decompose(gm.position, gm.quaternion, gm.scale);
    }
    // Роботы
    g.guards.forEach((gd, i) => {
      const b = this.bots[i];
      b.group.position.set(gd.x, Math.sin(t * 3 + i) * 0.04, gd.z);
      b.group.rotation.y = -gd.a + pie / 2;
      b.body.rotation.z = gd.moving ? Math.sin(t * 10) * 0.03 : 0;
      const alert = gd.attention > 0.05 || gd.distract;
      const mood = alert ? "alert" : "calm";
      if (b.mood !== mood) {
        b.mood = mood;
        b.screen.material.map = b.tex[mood];
      }
      b.bulb.material.color.setHSL(0.33 - gd.attention * 0.27, 1, 0.55);
      b.bulb.material.emissive.copy(b.bulb.material.color);
      // Свет на полу: тот же расчёт, что и обнаружение
      const rays = coneRays(this.room, gd, b.n);
      const pos = b.cone.geometry.attributes.position,
        edge = b.cone.geometry.attributes.edge;
      pos.setXYZ(0, gd.x, 0.04, gd.z);
      edge.setX(0, 0);
      rays.forEach(([x, z], k) => {
        pos.setXYZ(k + 1, x, 0.04, z);
        edge.setX(k + 1, Math.min(1, Math.hypot(x - gd.x, z - gd.z) / gd.range));
      });
      pos.needsUpdate = edge.needsUpdate = true;
      b.cone.geometry.computeBoundingSphere();
      b.cone.material.uniforms.time.value = t;
      b.cone.material.uniforms.color.value.set("#ffc93a").lerp(new T.Color("#ff5a2a"), gd.attention);
      b.light.position.set(gd.x + Math.cos(gd.a) * 1.2, 1.2, gd.z + Math.sin(gd.a) * 1.2);
      b.light.color.copy(b.cone.material.uniforms.color.value);
      // «?» растёт вместе со шкалой внимания
      b.q.visible = gd.attention > 0.02;
      b.q.position.set(gd.x, 2.05 + Math.sin(t * 8) * 0.05 * gd.attention, gd.z);
      b.q.scale.setScalar(0.5 + gd.attention * 0.7);
    });
    // Телескопы: кольцо настройки, луч у настроенных
    g.terms.forEach((tm, i) => {
      const s = this.scopes[i];
      const q = tm.done ? 1 : tm.prog;
      if (Math.abs(q - s.last) > 0.005) {
        s.last = q;
        s.prog.geometry.dispose();
        s.prog.geometry = new T.RingGeometry(TUNE_R - 0.12, TUNE_R, 48, 1, pie / 2, Math.max(0.001, q * pie * 2));
      }
      s.ringBase.material.opacity = tm.done ? 0 : 0.18 + 0.12 * Math.sin(t * 3);
      s.prog.material.color.setRGB(tm.done ? 0.6 : 1.6, tm.done ? 2 : 1.4, tm.done ? 0.9 : 0.4);
      s.mount.rotation.y += (tm.prog > 0 && !tm.done ? 3 : 0.15) * dt;
      if (tm.done) s.beam.material.opacity = 0.42 + Math.sin(t * 2 + i) * 0.1;
    });
    if (this.starMesh && this.starMesh.mesh.visible && !g.star.got) {
      this.starMesh.mesh.rotation.y = t * 2;
      this.starMesh.mesh.position.y = 0.55 + Math.sin(t * 3) * 0.08;
    }
    if (this.elevator.open) this.elevator.arrow.position.y = 2.1 + Math.abs(Math.sin(t * 4)) * 0.25;
    // Светлячок
    const f = g.fly;
    this.firefly.visible = !!f;
    if (f) {
      let x, z, y;
      if (f.phase === "go") {
        const q = Math.min(1, f.t / f.dur);
        x = f.from[0] + (f.to[0] - f.from[0]) * q;
        z = f.from[1] + (f.to[1] - f.from[1]) * q;
        y = 0.6 + Math.sin(q * pie) * 1.2;
      } else {
        x = f.to[0] + Math.cos(t * 6) * 0.35;
        z = f.to[1] + Math.sin(t * 6) * 0.35;
        y = 1 + Math.sin(t * 9) * 0.12;
      }
      this.firefly.position.set(x, y, z);
      for (const w of this.firefly.children) if (w.userData.s) w.rotation.y = w.userData.s * Math.sin(t * 40) * 0.9;
    }
    // Путь к цели — точки
    const d = this.dummy;
    let k = 0;
    if (p.path.length) {
      let prev = [p.x, p.z];
      for (const q of p.path) {
        const len = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        for (let s = 0.35; s < len && k < 200; s += 0.35) {
          d.position.set(prev[0] + ((q[0] - prev[0]) * s) / len, 0.06, prev[1] + ((q[1] - prev[1]) * s) / len);
          d.scale.setScalar(1);
          d.rotation.set(0, 0, 0);
          d.updateMatrix();
          this.pathDots.setMatrixAt(k++, d.matrix);
        }
        prev = q;
      }
      const end = p.path.at(-1);
      this.target.visible = true;
      this.target.position.set(end[0], 0.05, end[1]);
      this.target.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
    } else this.target.visible = false;
    this.pathDots.count = k;
    this.pathDots.instanceMatrix.needsUpdate = true;
  }
  frame(ms) {
    if (document.hidden) return;
    const dt = this.last ? clamp((ms - this.last) / 1000, 0, 0.1) : 0;
    this.last = ms;
    this.time += dt;
    for (const tw of [...this.tweens]) {
      const p = clamp((this.time - tw.at) / tw.dur, 0, 1);
      tw.update(p);
      if (p === 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    if (this.onFrame) this.onFrame(dt);
    this.sync(dt);
    this.sky.material.uniforms.time.value = this.time;
    this.planet.rotation.y += dt * 0.05;
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
        s.v.multiplyScalar(Math.pow(0.2, dt));
        s.p.addScaledVector(s.v, dt);
      }
      const f = s.life > 0 ? s.life / s.max : 0;
      d.position.copy(s.p);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f > 0 ? 1.3 - f * 0.6 : 0);
      d.updateMatrix();
      this.puffs.setMatrixAt(i, d.matrix);
    });
    this.puffs.instanceMatrix.needsUpdate = true;
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
    this.fit(w / h);
    this.composer.render();
    const url = this.renderer.domElement.toDataURL("image/jpeg", 0.9);
    this.resize();
    return url;
  }
}
