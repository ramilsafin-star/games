// 3D «Гонки бобрят»: острова с мягкими берегами, вода с бликами, дорога, кучи брёвнышек, мостики,
// бобрята в кепках с брёвнышками на спине, ворота, финиш с почтовым ящиком, утки и лодочки.
// Клетка гонки (x, y) — это мир (x, 0, −y).
import * as T from "../vendor/three/three.module.min.js?v=408217eb";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=408217eb";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=408217eb";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=408217eb";
import { polish } from "./gfx.js?v=408217eb";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=408217eb";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=408217eb";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=408217eb";
import { shoreField, landHeight } from "./race.js?v=408217eb";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const W3 = (x, y, h = 0) => new T.Vector3(x, h, -y);

export const THEMES = {
  meadow: { sky: ["#5fc8ff", "#d6f4ff"], water: ["#2f9fe8", "#7fdcff"], grass: "#6fd36a", grass2: "#9fe07a", sand: "#ffe2a0", road: "#d9a868", trees: ["#3fbf5a", "#5bd46d", "#2fa04c"], flowers: ["#ff6fa8", "#ffd23f", "#ffffff", "#b47cff"] },
  lake: { sky: ["#7fb8ff", "#e8f4ff"], water: ["#2f7fe0", "#6fc8ff"], grass: "#5fc86a", grass2: "#8fdc7a", sand: "#f6dca0", road: "#d4a266", trees: ["#2fa04c", "#3fbf5a", "#1f8a4c"], flowers: ["#ffffff", "#ffd23f", "#7fb8ff"] },
  sunset: { sky: ["#ff9f7a", "#ffe0c0"], water: ["#4f6fd8", "#ff9fb0"], grass: "#9fd05a", grass2: "#c8e06a", sand: "#ffd8a0", road: "#d8965e", trees: ["#ff8f3f", "#ffb02e", "#e8452f"], flowers: ["#ff5f5f", "#ffd23f", "#ff9f3f"] },
  lilies: { sky: ["#8fd8ff", "#f0fff4"], water: ["#1fa08a", "#5fe0c0"], grass: "#7fdc6a", grass2: "#a8e88a", sand: "#f0e6b0", road: "#d9b070", trees: ["#5bd46d", "#7fdc6a", "#3fbf5a"], flowers: ["#ff8fd0", "#ffffff", "#ffd23f"] },
  islands: { sky: ["#3fb4ff", "#e0f8ff"], water: ["#1f8fe8", "#4fe0f0"], grass: "#5fd06a", grass2: "#8fe07a", sand: "#fff0c0", road: "#e0b878", trees: ["#2fa04c", "#3fbf5a", "#5bd46d"], flowers: ["#ff6fa8", "#ffd23f", "#ffffff"], palms: true },
};
export const CAPS = ["#ff8f1f", "#3f8cff", "#ff5fa8", "#3fdc7a"];

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
const label = (text, bg, fg, w = 256, h = 64) => {
  // Ширина по длине текста — длинные подписи не обрезаются
  const m = document.createElement("canvas").getContext("2d");
  m.font = `900 ${Math.round(h * 0.55)}px system-ui, sans-serif`;
  w = Math.max(w, Math.ceil(m.measureText(text).width + h * 0.9));
  const tex = canvasTexture(w, h, (x) => {
    x.fillStyle = bg;
    x.beginPath();
    x.roundRect(4, 4, w - 8, h - 8, 20);
    x.fill();
    x.fillStyle = fg;
    x.font = `900 ${Math.round(h * 0.55)}px system-ui, sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, w / 2, h / 2 + 2);
  });
  tex.userData.aspect = w / h;
  return tex;
};

// ---------- Брёвнышко ----------
const logGeo = new T.CylinderGeometry(0.11, 0.11, 0.9, 10).rotateZ(pie / 2);
const logEndGeo = new T.CircleGeometry(0.11, 10);
const logMat = matte("#c98b55", { roughness: 0.7 }),
  logEnd = matte("#f2d0a0");
function log() {
  const g = new T.Group();
  g.add(new T.Mesh(logGeo, logMat));
  for (const s of [-1, 1]) {
    const e = new T.Mesh(logEndGeo, logEnd);
    e.position.x = s * 0.451;
    e.rotation.y = (s * pie) / 2;
    g.add(e);
  }
  return g;
}

// ---------- Бобрёнок ----------
function beaver(cap) {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  const fur = matte("#a0683a", { roughness: 0.75 }),
    light = matte("#f2d6b0"),
    dark = matte("#5a3a22");
  const torso = new T.Mesh(new T.SphereGeometry(0.34, 22, 16), fur);
  torso.scale.set(1, 1.1, 0.95);
  torso.position.y = 0.42;
  body.add(torso);
  const belly = new T.Mesh(new T.SphereGeometry(0.24, 18, 12), light);
  belly.scale.set(0.9, 1.05, 0.55);
  belly.position.set(0, 0.4, -0.2);
  body.add(belly);
  const head = new T.Group();
  head.position.set(0, 0.92, -0.04);
  body.add(head);
  head.add(new T.Mesh(new T.SphereGeometry(0.3, 22, 16), fur));
  const snout = new T.Mesh(new T.SphereGeometry(0.16, 16, 12), light);
  snout.scale.set(1.1, 0.8, 0.9);
  snout.position.set(0, -0.08, -0.24);
  head.add(snout);
  const nose = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), glossy("#3b2730", { roughness: 0.2 }));
  nose.position.set(0, -0.01, -0.38);
  head.add(nose);
  // Два больших зуба
  for (const s of [-1, 1]) {
    const tooth = new T.Mesh(new RoundedBoxGeometry(0.06, 0.09, 0.03, 2, 0.01), matte("#ffffff"));
    tooth.position.set(s * 0.033, -0.17, -0.33);
    head.add(tooth);
    // Глазки: белок, зрачок и блик — добрый взгляд
    const white = new T.Mesh(new T.SphereGeometry(0.066, 14, 10), matte("#ffffff", { roughness: 0.4 }));
    white.position.set(s * 0.12, 0.08, -0.235);
    head.add(white);
    const eye = new T.Mesh(new T.SphereGeometry(0.044, 12, 8), glossy("#1d1420", { roughness: 0.1 }));
    eye.position.set(s * 0.118, 0.074, -0.282);
    head.add(eye);
    const shine = new T.Mesh(new T.SphereGeometry(0.014, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(s * 0.118 + 0.014, 0.092, -0.322);
    head.add(shine);
    const ear = new T.Mesh(new T.SphereGeometry(0.08, 12, 8), dark);
    ear.position.set(s * 0.22, 0.2, 0.02);
    head.add(ear);
    (head.userData.ears ||= []).push(ear);
    const cheek = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), matte("#ff9fb0"));
    cheek.scale.set(1, 0.6, 0.4);
    cheek.position.set(s * 0.19, -0.04, -0.2);
    head.add(cheek);
  }
  // Кепка почтальона
  // Кепка сидит на макушке, козырёк приподнят — глаза открыты
  const capTop = new T.Mesh(new T.SphereGeometry(0.31, 20, 12, 0, pie * 2, 0, pie * 0.34), glossy(cap));
  capTop.position.y = 0.075;
  head.add(capTop);
  const visor = new T.Mesh(new T.CylinderGeometry(0.19, 0.19, 0.03, 18, 1, false, pie / 2, pie), glossy(cap));
  visor.position.set(0, 0.235, -0.15);
  visor.rotation.x = -0.28;
  head.add(visor);
  // Плоский хвост-лопата
  const tail = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.06, 18).scale(1, 1, 1.45), matte("#6b4428", { roughness: 0.45 }));
  tail.position.set(0, 0.16, 0.42);
  tail.rotation.x = -0.55;
  body.add(tail);
  // Лапки
  const feet = [];
  for (const s of [-1, 1]) {
    const foot = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), dark);
    foot.scale.set(1, 0.5, 1.4);
    foot.position.set(s * 0.16, 0.05, -0.05);
    body.add(foot);
    feet.push(foot);
    const arm = new T.Mesh(new T.CapsuleGeometry(0.06, 0.18, 6, 8), fur);
    arm.position.set(s * 0.3, 0.55, -0.12);
    arm.rotation.x = -1.1;
    body.add(arm);
  }
  // Брёвнышки на спине (до 12, по 3 в ряд)
  const stack = new T.Group();
  stack.position.set(0, 0.62, 0.18);
  body.add(stack);
  const logs = [];
  for (let k = 0; k < 12; k++) {
    const l = log();
    l.scale.setScalar(0.62);
    l.position.set(0, Math.floor(k / 3) * 0.14, (k % 3) * 0.14 - 0.14);
    l.visible = false;
    stack.add(l);
    logs.push(l);
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  g.scale.setScalar(1.15);
  return { group: g, body, head, feet, logs, stack, tail, ears: head.userData.ears };
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
    this.scene.fog = new T.Fog(0xd6f4ff, 30, 90);
    this.camera = new T.PerspectiveCamera(52, 1, 0.1, 300);
    this.hemi = new T.HemisphereLight(0xffffff, 0x88c870, 1.15);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff0d8, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
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
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
    this.trackGroup = new T.Group();
    this.scene.add(this.trackGroup);
    this.makeParticles();
    this.cam = { p: new T.Vector3(11, 8, 6), look: new T.Vector3(11, 0, -4), init: false };
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
  setRace(race, caps) {
    const G = this.trackGroup;
    G.traverse((o) => o.geometry && o.geometry.dispose());
    G.clear();
    this.race = race;
    const def = race.def,
      M = race.map;
    const th = THEMES[def.theme] || THEMES.meadow;
    this.theme = th;
    const R = rng(def.h * 31 + def.w);
    this.scene.background = canvasTexture(4, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, th.sky[0]);
      g.addColorStop(1, th.sky[1]);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    });
    this.scene.fog.color.set(th.sky[1]);
    // Вода — большая гладь с волнами и бликами
    const water = new T.Mesh(
      new T.PlaneGeometry(400, 400, 1, 1),
      new T.ShaderMaterial({
        uniforms: { time: { value: 0 }, deep: { value: new T.Color(th.water[0]) }, shallow: { value: new T.Color(th.water[1]) }, fogColor: { value: new T.Color(th.sky[1]) } },
        vertexShader: "varying vec3 wp; void main(){ vec4 w = modelMatrix * vec4(position,1.0); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
        fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 fogColor; varying vec3 wp;
          void main(){
            float w = sin(wp.x*1.3 + time*1.4)*0.5 + sin(wp.z*1.7 - time*1.1)*0.5 + sin((wp.x+wp.z)*0.7 + time*0.8);
            vec3 c = mix(deep, shallow, 0.45 + 0.12*w);
            float spark = smoothstep(0.93, 1.0, sin(wp.x*4.1 + time*2.0)*sin(wp.z*3.7 - time*1.7));
            c += vec3(1.0)*spark*0.55;
            float d = length(cameraPosition - wp);
            c = mix(c, fogColor, smoothstep(30.0, 90.0, d));
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    water.rotation.x = -pie / 2;
    water.position.set(def.w / 2, -0.02, -def.h / 2);
    G.add(water);
    this.water = water;
    // Острова: высота из сглаженной маски суши, цвет — песок у воды, трава, дорога
    const res = 3,
      pad = 4;
    const GW = (def.w + pad * 2) * res + 1,
      GH = (def.h + pad * 2) * res + 1;
    const shore = shoreField(def, M);
    const pos = [],
      col = [],
      idx = [];
    const c = new T.Color(),
      cg = new T.Color(th.grass),
      cg2 = new T.Color(th.grass2),
      cs = new T.Color(th.sand),
      cr = new T.Color(th.road),
      cr2 = new T.Color();
    for (let gy = 0; gy < GH; gy++)
      for (let gx = 0; gx < GW; gx++) {
        const x = gx / res - pad,
          y = gy / res - pad;
        const v = shore(x, y),
          h = landHeight(v) + (v > 0.97 ? Math.sin(x * 1.3) * Math.cos(y * 1.1) * 0.05 : 0);
        pos.push(x, h, -y);
        const rd = M.road.nearest(x, y).d;
        // Трава, по середине — утоптанная дорожка, у воды — песок; переходы мягкие
        c.copy(cg).lerp(cg2, 0.5 + 0.5 * Math.sin(x * 0.9 + y * 0.7));
        if (y > def.start + 1.5 && y < def.finish - 0.5) c.lerp(cr2.copy(cr).multiplyScalar(0.94 + 0.06 * Math.sin(x * 5 + y * 3)), 1 - T.MathUtils.smoothstep(rd, 0.45, 0.8));
        c.lerp(cs, 1 - T.MathUtils.smoothstep(v, 0.62, 0.88));
        col.push(c.r, c.g, c.b);
      }
    for (let gy = 0; gy < GH - 1; gy++)
      for (let gx = 0; gx < GW - 1; gx++) {
        const a = gy * GW + gx;
        idx.push(a, a + 1, a + GW, a + 1, a + GW + 1, a + GW); // против часовой сверху — лицом к небу
      }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const ground = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    ground.receiveShadow = true;
    G.add(ground);
    this.decorate(def, M, th, R);
    // Ворота: арка на дороге и буйки поперёк воды
    for (const gy of def.gates) G.add(this.gate(def, M, gy, "#ffc533"));
    G.add(this.gate(def, M, def.finish, "#ff4f6d", true));
    // Кучи брёвнышек
    this.piles = race.piles.map((p) => {
      const g = new T.Group();
      for (let k = 0; k < 3; k++) {
        const l = log();
        l.position.set(0, 0.11 + Math.floor(k / 2) * 0.2, (k % 2) * 0.22 - 0.11 + (k === 2 ? 0.11 : 0));
        l.rotation.y = 0.3;
        g.add(l);
      }
      const halo = glowSprite("#ffe066", 1.4, 0.45);
      halo.position.y = 0.3;
      g.add(halo);
      g.position.copy(W3(p.x, p.y, 0.3));
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(g);
      return { g, p, shown: true };
    });
    // Мостики: доски поперёк хода, верёвочные перила
    this.bridgeKeys = new Set();
    this.bridgeMesh = new T.InstancedMesh(new RoundedBoxGeometry(0.98, 0.1, 0.3, 2, 0.03), matte("#d9a066", { roughness: 0.7 }), 3000);
    this.bridgeMesh.count = 0;
    this.bridgeMesh.castShadow = this.bridgeMesh.receiveShadow = true;
    this.bridgeMesh.frustumCulled = false;
    G.add(this.bridgeMesh);
    this.bridgeAnim = [];
    // Призрачные мостики
    this.ghost = new T.InstancedMesh(new RoundedBoxGeometry(0.92, 0.08, 0.92, 2, 0.04), new T.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), 16);
    this.ghost.count = 0;
    this.ghost.frustumCulled = false;
    for (let i = 0; i < 16; i++) this.ghost.setColorAt(i, new T.Color("#7dff9a"));
    G.add(this.ghost);
    this.ghostLabel = new T.Sprite(new T.SpriteMaterial({ map: label("", "#fff", "#000"), transparent: true, depthTest: false }));
    this.ghostLabel.scale.set(2.4, 0.6, 1);
    this.ghostLabel.renderOrder = 20;
    this.ghostLabel.visible = false;
    G.add(this.ghostLabel);
    this.ghostText = "";
    // Бобрята
    this.racers = race.racers.map((r, i) => {
      const b = beaver(caps[i]);
      b.group.position.copy(W3(r.x, r.y));
      G.add(b.group);
      if (!r.bot) {
        const arrow = new T.Mesh(new T.ConeGeometry(0.22, 0.4, 4), new T.MeshStandardMaterial({ color: "#ffe066", emissive: "#ffd23f", emissiveIntensity: 1.2 }));
        arrow.rotation.x = pie;
        arrow.position.y = 2.05;
        b.group.add(arrow);
        b.arrow = arrow;
      } else {
        const name = new T.Sprite(new T.SpriteMaterial({ map: label(r.name, caps[i], "#ffffff", 192, 56), depthTest: false, transparent: true }));
        name.scale.set(0.3 * name.material.map.userData.aspect, 0.3, 1);
        name.position.y = 1.9 + (i % 3) * 0.34; // таблички на разной высоте — не слипаются
        name.renderOrder = 10;
        b.group.add(name);
        b.name = name;
      }
      return { ...b, run: 0, shown: r.planks };
    });
    this.cam.init = false;
  }
  gate(def, M, gy, color, finish) {
    const g = new T.Group();
    const [rx] = this.roadXAt(gy);
    // Арка над дорогой
    const white = glossy("#ffffff");
    for (const s of [-1, 1]) {
      const post = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 2.6, 10), white);
      post.position.copy(W3(rx + s * 1.9, gy, 1.3));
      g.add(post);
    }
    const bar = new T.Mesh(new RoundedBoxGeometry(4.2, 0.5, 0.2, 2, 0.08), new T.MeshStandardMaterial({ color, roughness: 0.5 }));
    bar.position.copy(W3(rx, gy, 2.6));
    g.add(bar);
    const plate = new T.Mesh(new T.PlaneGeometry(3.6, 0.42), new T.MeshBasicMaterial({ map: label(finish ? "ФИНИШ" : "ВОРОТА", color, "#ffffff", 256, 40), transparent: true }));
    plate.position.copy(W3(rx, gy, 2.6)).add(new T.Vector3(0, 0, 0.11));
    g.add(plate);
    // Буйки поперёк всей реки — эти ворота не обойти
    const buoyCols = finish ? ["#ff4f6d", "#ffffff"] : ["#ffc533", "#ff8f3f"];
    for (let x = 0.5; x < def.w; x += 1.4) {
      if (M.isLand(Math.floor(x), Math.floor(gy))) continue;
      const b = new T.Mesh(new T.SphereGeometry(0.2, 12, 10), glossy(buoyCols[Math.round(x) % 2]));
      b.position.copy(W3(x, gy, 0.05));
      b.userData.bob = x;
      g.add(b);
      this.buoys = this.buoys || [];
      this.buoys.push(b);
    }
    if (finish) {
      const chk = new T.Mesh(
        new T.PlaneGeometry(3.8, 0.6),
        new T.MeshBasicMaterial({
          map: canvasTexture(64, 10, (c) => {
            for (let i = 0; i < 13; i++)
              for (let j = 0; j < 2; j++) {
                c.fillStyle = (i + j) % 2 ? "#222" : "#fff";
                c.fillRect(i * 5, j * 5, 5, 5);
              }
          }),
        }),
      );
      chk.rotation.x = -pie / 2;
      chk.position.copy(W3(rx, gy, 0.33));
      g.add(chk);
      // Почтовый ящик и друзья-получатели
      const box = new T.Group();
      const bx = new T.Mesh(new RoundedBoxGeometry(0.6, 0.7, 0.5, 2, 0.12), glossy("#3f6bff"));
      bx.position.y = 1.3;
      box.add(bx);
      const leg = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1, 8), matte("#555"));
      leg.position.y = 0.5;
      box.add(leg);
      box.position.copy(W3(rx + 3.2, gy + 2.5, 0.3));
      g.add(box);
      this.fans = [];
      for (let k = 0; k < 3; k++) {
        const f = beaver(["#ffd23f", "#b47cff", "#7fe8ff"][k]);
        f.logs.forEach((l) => (l.visible = false));
        f.group.position.copy(W3(rx - 3 + k * 1.2 + (k > 1 ? 4.6 : 0), gy + 2.2 + (k % 2) * 0.6, 0.3));
        f.group.rotation.y = pie;
        g.add(f.group);
        this.fans.push(f);
      }
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  roadXAt(y) {
    // Точка дороги на высоте y (первая по ходу)
    const road = this.race.map.road;
    let best = null;
    for (let s = 0; s <= road.len; s += 0.25) {
      const p = road.at(s);
      if (Math.abs(p[1] - y) < 0.2 && (!best || Math.abs(p[1] - y) < Math.abs(best[1] - y))) best = p;
    }
    return best || [11, y];
  }
  decorate(def, M, th, R) {
    const G = this.trackGroup;
    const free = (x, y) => {
      const i = Math.floor(x),
        j = Math.floor(y);
      return M.isLand(i, j) && M.road.nearest(x, y).d > 1.25 && M.isLand(i + 1, j) && M.isLand(i - 1, j) && M.isLand(i, j + 1) && M.isLand(i, j - 1);
    };
    const tree = () => {
      const t = new T.Group();
      const trunk = new T.Mesh(new T.CylinderGeometry(0.1, 0.14, 0.8, 8), matte("#8a5a35"));
      trunk.position.y = 0.4;
      t.add(trunk);
      if (th.palms) {
        trunk.scale.set(0.8, 2.6, 0.8);
        trunk.position.y = 1;
        trunk.rotation.z = 0.15;
        for (let k = 0; k < 6; k++) {
          const leaf = new T.Mesh(new T.ConeGeometry(0.16, 1.2, 4), matte("#3fbf5a", { flatShading: true }));
          leaf.position.set(0.15, 2.1, 0);
          leaf.rotation.set(0, (k * pie) / 3, 1.9);
          t.add(leaf);
        }
      } else {
        const crown = new T.Mesh(new T.IcosahedronGeometry(0.6, 1), matte(th.trees[Math.floor(R() * th.trees.length)], { flatShading: true }));
        crown.position.y = 1.15;
        t.add(crown);
      }
      t.traverse((o) => o.isMesh && (o.castShadow = true));
      return t;
    };
    // Деревья и цветы на суше в стороне от дороги
    for (let k = 0; k < def.h * 2.2; k++) {
      const x = R() * def.w,
        y = R() * (def.h + 4) - 2;
      if (!free(x, y)) continue;
      if (R() < 0.45) {
        const t = tree();
        t.position.copy(W3(x, y, 0.28));
        t.scale.setScalar(0.8 + R() * 0.5);
        G.add(t);
      } else {
        const f = new T.Group();
        const color = th.flowers[Math.floor(R() * th.flowers.length)];
        for (let p = 0; p < 5; p++) {
          const pe = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), matte(color));
          pe.position.set(Math.cos((p / 5) * pie * 2) * 0.08, 0.2, Math.sin((p / 5) * pie * 2) * 0.08);
          pe.scale.y = 0.5;
          f.add(pe);
        }
        const mid = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), matte("#ffd23f"));
        mid.position.y = 0.21;
        f.add(mid);
        f.position.copy(W3(x, y, 0.28));
        G.add(f);
      }
    }
    // Камыши у берега
    const reed = new T.ConeGeometry(0.04, 0.9, 5);
    reed.translate(0, 0.45, 0);
    const reeds = new T.InstancedMesh(reed, matte("#5fa84a"), 500);
    const d = new T.Object3D();
    let n = 0;
    for (let k = 0; k < 2500 && n < 500; k++) {
      const x = R() * def.w,
        y = R() * def.h;
      const i = Math.floor(x),
        j = Math.floor(y);
      if (M.isLand(i, j) || !(M.isLand(i + 1, j) || M.isLand(i - 1, j) || M.isLand(i, j + 1) || M.isLand(i, j - 1))) continue;
      if (M.road.nearest(x, y).d < 2.2) continue;
      d.position.copy(W3(x, y, -0.2));
      d.rotation.set((R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4);
      d.scale.setScalar(0.7 + R() * 0.6);
      d.updateMatrix();
      reeds.setMatrixAt(n++, d.matrix);
    }
    reeds.count = n;
    G.add(reeds);
    // Кувшинки на воде
    const lilyCount = def.theme === "lilies" ? 160 : 50;
    const lilies = new T.InstancedMesh(new T.CircleGeometry(0.35, 14, 0.3, pie * 2 - 0.6), matte("#3fbf5a", { side: T.DoubleSide }), lilyCount);
    n = 0;
    for (let k = 0; k < 3000 && n < lilyCount; k++) {
      const x = R() * def.w,
        y = R() * def.h;
      if (M.isLand(Math.floor(x), Math.floor(y)) || M.road.nearest(x, y).d < 2.4) continue;
      d.position.copy(W3(x, y, 0.01));
      d.rotation.set(-pie / 2, 0, R() * 6);
      d.scale.setScalar(0.7 + R() * 0.7);
      d.updateMatrix();
      lilies.setMatrixAt(n++, d.matrix);
    }
    lilies.count = n;
    G.add(lilies);
    // Цветки на кувшинках
    for (let k = 0; k < (def.theme === "lilies" ? 30 : 8); k++) {
      const x = R() * def.w,
        y = R() * def.h;
      if (M.isLand(Math.floor(x), Math.floor(y))) continue;
      const fl = new T.Mesh(new T.ConeGeometry(0.16, 0.2, 8), matte("#ff9fd0"));
      fl.position.copy(W3(x, y, 0.1));
      G.add(fl);
    }
    // Утки плавают кругами
    this.ducks = [];
    for (let k = 0; k < 6; k++) {
      let x, y, tries = 0;
      do {
        x = 2 + R() * (def.w - 4);
        y = 4 + R() * (def.h - 8);
      } while ((M.isLand(Math.floor(x), Math.floor(y)) || M.road.nearest(x, y).d < 3) && tries++ < 40);
      const duck = new T.Group();
      const body = new T.Mesh(new T.SphereGeometry(0.22, 14, 10), matte("#ffd23f"));
      body.scale.set(1, 0.8, 1.3);
      duck.add(body);
      const head = new T.Mesh(new T.SphereGeometry(0.13, 12, 8), matte("#ffd23f"));
      head.position.set(0, 0.22, -0.22);
      duck.add(head);
      const beak = new T.Mesh(new T.ConeGeometry(0.05, 0.12, 8), matte("#ff8f1f"));
      beak.rotation.x = -pie / 2;
      beak.position.set(0, 0.2, -0.38);
      duck.add(beak);
      duck.userData = { cx: x, cy: y, r: 0.8 + R(), ph: R() * 6 };
      G.add(duck);
      this.ducks.push(duck);
    }
    // Облака и дальние холмы
    this.clouds = [];
    for (let k = 0; k < 10; k++) {
      const c = new T.Group();
      for (let p = 0; p < 4; p++) {
        const s = new T.Mesh(new T.SphereGeometry(1.4 + R(), 14, 10), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.3 }));
        s.position.set(p * 1.6 - 2.4, Math.sin(p) * 0.5, 0);
        s.scale.y = 0.7;
        c.add(s);
      }
      c.position.copy(W3(-15 + R() * 50, R() * def.h, 12 + R() * 6));
      G.add(c);
      this.clouds.push(c);
    }
    for (let k = 0; k < 16; k++) {
      const side = k % 2 ? 1 : -1;
      const h = new T.Mesh(new T.SphereGeometry(6 + R() * 5, 16, 10), matte(th.grass2));
      h.scale.y = 0.5;
      h.position.copy(W3(def.w / 2 + side * (24 + R() * 10), (k / 16) * (def.h + 20) - 5, -1.5));
      G.add(h);
    }
  }
  // ---------- События ----------
  placePlank(i, j, a) {
    const k = i + "," + j;
    if (this.bridgeKeys.has(k)) return;
    this.bridgeKeys.add(k);
    // Три доски поперёк хода бегущего
    for (let q = 0; q < 3; q++) {
      const idx = this.bridgeMesh.count++;
      const c = W3(i + 0.5, j + 0.5, 0.06);
      const dir = new T.Vector3(Math.sin(a), 0, -Math.cos(a));
      const pos = c.clone().addScaledVector(dir, (q - 1) * 0.31);
      this.bridgeAnim.push({ idx, pos, rot: -a, t: 0 });
    }
    this.splash([i + 0.5, j + 0.5], 6, "#ffffff");
  }
  pick(r) {
    const v = this.racers[r.i];
    v.pop = 1;
    this.burst(v.group.position.clone().add(new T.Vector3(0, 1, 0)), 12, ["#ffe066", "#ffffff", "#c98b55"], 2.5);
  }
  splash(at, count, color = this.theme.water[1]) {
    this.puff(W3(at[0], at[1], 0.1), count, color);
  }
  fall(r) {
    this.splash([r.x, r.y], 18);
    this.puff(W3(r.x, r.y, 0.1), 10, "#ffffff");
  }
  celebrate(r) {
    const p = this.racers[r.i].group.position;
    this.confetti(p.clone().add(new T.Vector3(0, 1.5, 0)));
    this.cheer = this.time;
  }
  // Призрачные мостики перед игроком
  showPreview(pv) {
    const g = this.ghost;
    if (!pv || !pv.cells.length) {
      g.count = 0;
      this.ghostLabel.visible = false;
      return;
    }
    const d = new T.Object3D();
    pv.cells.forEach(([i, j], k) => {
      d.position.copy(W3(i + 0.5, j + 0.5, 0.05 + Math.sin(this.time * 4 + k) * 0.02));
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      g.setMatrixAt(k, d.matrix);
      g.setColorAt(k, new T.Color(k < pv.have ? "#7dff9a" : "#ff6f8f"));
    });
    g.count = pv.cells.length;
    g.instanceMatrix.needsUpdate = true;
    g.instanceColor.needsUpdate = true;
    g.material.opacity = 0.45 + Math.sin(this.time * 6) * 0.15;
    const enough = pv.have >= pv.need && pv.reach;
    const text = enough ? `✔ хватит! останется ${pv.have - pv.need}` : `нужно ${pv.need}, есть ${pv.have}`;
    if (text !== this.ghostText) {
      this.ghostText = text;
      this.ghostLabel.material.map?.dispose();
      this.ghostLabel.material.map = label(text, enough ? "#3fdc7a" : "#ff6f8f", "#ffffff", 128, 64);
      this.ghostLabel.material.needsUpdate = true;
      this.ghostLabel.scale.set(0.55 * this.ghostLabel.material.map.userData.aspect, 0.55, 1);
    }
    const last = pv.cells[Math.min(pv.cells.length - 1, 2)];
    this.ghostLabel.position.copy(W3(last[0] + 0.5, last[1] + 0.5, 1.3));
    this.ghostLabel.visible = true;
  }
  // ---------- Кадр ----------
  sync(race, dt) {
    const t = this.time,
      calm = this.motion.matches ? 0.3 : 1;
    race.racers.forEach((r, i) => {
      const v = this.racers[i];
      if (!v) return;
      const target = W3(r.x, r.y);
      const [ci, cj] = race.map.cell(r.x, r.y);
      const onBridge = !race.map.isLand(ci, cj);
      let h = onBridge ? 0.12 : 0.3;
      if (r.state === "fall") h = -0.5 - (1.1 - r.fall) * 0.4;
      v.group.position.lerp(target.setY(h), Math.min(1, dt * 20));
      v.group.rotation.y = -r.a;
      const moving = race.state === "run" && r.state === "run" && !r.done;
      v.run += moving ? dt * 14 : 0;
      v.body.position.y = moving ? Math.abs(Math.sin(v.run)) * 0.1 : Math.sin(t * 2 + i) * 0.01;
      v.body.rotation.z = moving ? Math.sin(v.run) * 0.08 : 0;
      v.feet.forEach((f, k) => (f.position.z = -0.05 + (moving ? Math.sin(v.run + k * pie) * 0.14 : 0)));
      // Живой бобрёнок: хвост шлёпает на бегу, ушки подрагивают, поклажа подпрыгивает,
      // а от подобранного брёвнышка он радостно вытягивается
      v.tail.rotation.x = -0.55 + (moving ? Math.sin(v.run) * 0.4 * calm : Math.sin(t * 2 + i) * 0.07);
      v.ears.forEach((e, k) => e.scale.setScalar(1 + Math.sin(t * 13 + k * 2 + i) * (moving ? 0.12 : 0.03)));
      v.stack.position.y = 0.62 + (moving ? Math.abs(Math.sin(v.run + 0.6)) * 0.05 : 0);
      v.stack.rotation.z = moving ? Math.sin(v.run) * 0.07 * calm : 0;
      v.pop = (v.pop || 0) * Math.pow(0.02, dt);
      const pp = Math.sin(v.pop * pie) * v.pop;
      v.body.scale.set(1 - pp * 0.12, 1 + pp * 0.22, 1 - pp * 0.12);
      v.head.rotation.x = -pp * 0.5 + (moving ? Math.sin(v.run * 2) * 0.04 : 0);
      v.body.rotation.y = r.done ? Math.sin(t * 5 + i) * 0.7 : 0;
      // Брёвнышки на спине — сколько в лапах
      if (v.shown !== r.planks) {
        v.shown = r.planks;
        v.logs.forEach((l, k) => (l.visible = k < r.planks));
      }
      if (v.arrow) v.arrow.position.y = 2.05 + Math.sin(t * 5) * 0.1;
      // Имя соперника видно, когда он впереди или в стороне, — а не в толпе прямо у игрока
      if (v.name) {
        const me = this.racers[race.racers.findIndex((q) => !q.bot)];
        const near = me ? v.group.position.distanceTo(me.group.position) : 9;
        v.name.material.opacity = Math.min(T.MathUtils.clamp((v.group.position.distanceTo(this.camera.position) - 4.5) / 2.5, 0, 1), T.MathUtils.clamp((near - 2.6) / 1.6, 0, 1));
      }
      if (r.done) v.body.position.y = Math.abs(Math.sin(t * 8 + i)) * 0.3;
      // Брызги из-под лап на мостике
      if (moving && onBridge && Math.random() < dt * 8) this.puff(W3(r.x, r.y, 0.05), 1, "#ffffff");
    });
    // Рыбка иногда выпрыгивает из воды рядом с игроком: всплеск, дуга, всплеск
    if (!this.fish) {
      const fg = new T.Group();
      const fb = new T.Mesh(new T.SphereGeometry(0.16, 14, 10), glossy("#ff9a3c"));
      fb.scale.set(0.55, 0.7, 1.5);
      const ft = new T.Mesh(new T.ConeGeometry(0.12, 0.2, 4), glossy("#ffc46b"));
      ft.rotation.x = -pie / 2;
      ft.position.z = 0.3;
      ft.scale.x = 0.3;
      fg.add(fb, ft);
      fg.visible = false;
      this.scene.add(fg);
      this.fish = { g: fg, at: -9, next: t + 2, from: new T.Vector3(), to: new T.Vector3() };
    }
    const fi = this.fish;
    if (race.state === "run" && t > fi.next && calm === 1) {
      fi.next = t + 2.5 + Math.random() * 3;
      const pl = race.racers.find((r) => !r.bot) || race.racers[0];
      for (let n = 0; n < 12; n++) {
        const fx = pl.x + (Math.random() - 0.5) * 7,
          fy = pl.y + (Math.random() - 0.5) * 9;
        const [ci, cj] = race.map.cell(fx, fy),
          [ci2, cj2] = race.map.cell(fx + 0.8, fy);
        const wet = (a, b) => race.map.inside(a, b) && !race.map.isLand(a, b) && !race.bridged(a, b);
        if (wet(ci, cj) && wet(ci2, cj2)) {
          fi.from.copy(W3(fx, fy, 0));
          fi.to.copy(W3(fx + 0.8, fy, 0));
          fi.at = t;
          this.splash([fx, fy], 6);
          break;
        }
      }
    }
    const fl = (t - fi.at) / 0.8;
    fi.g.visible = fl >= 0 && fl < 1;
    if (fi.g.visible) {
      fi.g.position.lerpVectors(fi.from, fi.to, fl);
      fi.g.position.y += Math.sin(fl * pie) * 0.9;
      const dir = fi.to.clone().sub(fi.from).normalize();
      fi.g.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
      fi.g.rotateX((0.5 - fl) * 2.2);
      fi.wasUp = true;
    } else if (fi.wasUp) {
      fi.wasUp = false;
      this.puff(fi.to.clone().setY(0.1), 6, "#ffffff");
    }
    // Кучи
    this.piles.forEach((pv) => {
      const shown = pv.p.n > 0;
      if (shown !== pv.shown) {
        pv.shown = shown;
        if (shown) {
          pv.g.visible = true;
          pv.g.scale.setScalar(0.001);
          this.tween(0.3, (p) => pv.g.scale.setScalar(Math.max(0.001, p)));
        } else pv.g.visible = false;
      }
      if (shown) pv.g.rotation.y = Math.sin(t * 1.5 + pv.p.x) * 0.2;
    });
    // Новые мостики
    for (const k of race.bridges) {
      const i = k % race.map.W,
        j = Math.floor(k / race.map.W);
      if (!this.bridgeKeys.has(i + "," + j)) {
        const r = race.racers.find((q) => Math.floor(q.x) === i && Math.floor(q.y) === j) || race.racers[0];
        this.placePlank(i, j, r.a);
      }
    }
    // Камера позади игрока, смотрит вперёд по ходу
    const me = race.racers.find((r) => !r.bot) || race.racers[0];
    const v = this.racers[me.i];
    const fwd = new T.Vector3(Math.sin(me.a), 0, -Math.cos(me.a));
    const aspect = this.camera.aspect;
    const back = aspect < 1 ? 6.4 : 5.6,
      up = aspect < 1 ? 7.2 : 6.0;
    const wantP = v.group.position.clone().addScaledVector(fwd, -back).add(new T.Vector3(0, up, 0));
    const wantL = v.group.position.clone().addScaledVector(fwd, 4.5);
    wantP.y = Math.max(wantP.y, 3);
    if (!this.cam.init) {
      this.cam.p.copy(wantP);
      this.cam.look.copy(wantL);
      this.cam.init = true;
    }
    const k = 1 - Math.pow(0.04, dt);
    this.cam.p.lerp(wantP, k);
    this.cam.look.lerp(wantL, k);
    this.camera.position.copy(this.cam.p);
    this.camera.lookAt(this.cam.look);
    this.sun.position.copy(v.group.position).add(new T.Vector3(-6, 14, 8));
    this.sun.target.position.copy(v.group.position);
  }
  // ---------- Частицы ----------
  makeParticles() {
    const n = 400;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.06, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    this.puffs = new T.InstancedMesh(new T.SphereGeometry(0.13, 10, 8), new T.MeshStandardMaterial({ roughness: 0.3, transparent: true, opacity: 0.85 }), 160);
    this.puffs.frustumCulled = false;
    this.puffPool = Array.from({ length: 160 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
    this.puffNext = 0;
    for (let i = 0; i < 160; i++) this.puffs.setColorAt(i, new T.Color("#ffffff"));
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
      s.v.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2);
      s.max = s.life = 0.5 + Math.random() * 0.4;
    }
    this.puffs.instanceColor.needsUpdate = true;
  }
  confetti(at) {
    for (let k = 0; k < 120; k++) {
      const s = this.confPool[this.confNext];
      this.confNext = (this.confNext + 1) % this.confPool.length;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6);
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
    if (this.water) this.water.material.uniforms.time.value = t;
    // Доски мостика падают на место по одной
    const d = this.dummy;
    for (const b of this.bridgeAnim) {
      b.t = Math.min(1, b.t + dt * 4);
      d.position.copy(b.pos).add(new T.Vector3(0, (1 - b.t) * 1.2, 0));
      d.rotation.set(0, b.rot, 0);
      d.scale.setScalar(Math.max(0.001, b.t));
      d.updateMatrix();
      this.bridgeMesh.setMatrixAt(b.idx, d.matrix);
    }
    if (this.bridgeAnim.length) this.bridgeMesh.instanceMatrix.needsUpdate = true;
    this.bridgeAnim = this.bridgeAnim.filter((b) => b.t < 1);
    for (const b of this.buoys || []) b.position.y = 0.05 + Math.sin(t * 2 + b.userData.bob) * 0.05;
    for (const duck of this.ducks || []) {
      const u = duck.userData,
        a = t * 0.4 + u.ph;
      duck.position.copy(W3(u.cx + Math.cos(a) * u.r, u.cy + Math.sin(a) * u.r, 0.05));
      duck.rotation.y = -a;
    }
    for (const c of this.clouds || []) c.position.x += dt * 0.3;
    if (this.fans) for (const [k, f] of this.fans.entries()) f.body.position.y = this.cheer && t - this.cheer < 3 ? Math.abs(Math.sin(t * 9 + k)) * 0.4 : Math.abs(Math.sin(t * 2 + k)) * 0.04;
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
        s.v.y -= 6 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      const f = s.life > 0 ? s.life / s.max : 0;
      d.position.copy(s.p);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f > 0 ? 0.6 + f * 0.6 : 0);
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
