// Сцена «Вихря»: игрушечная карта, предметы пачками, вихри, частицы, камера и пьедестал.
// Правила (rules.js) ничего не знают о графике: сцена только читает их состояние.
import { T, TAU, clamp, lerp, smooth, PRIM, Shape, canvasTexture } from "./kit.js?v=7cc311db";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=7cc311db";
import { modelOf, PAINTS, decorTree } from "./models.js?v=7cc311db";
import { Particles } from "./fx.js?v=7cc311db";
import { MAPS } from "./rules.js?v=7cc311db";
import { TRAILS } from "./economy.js?v=7cc311db";

// Сочность бледных цветов и мягкий контраст прямо в шейдерах (без отдельного прохода)
if (!T.ShaderChunk.colorspace_fragment.includes("vihrC")) {
  T.ShaderChunk.colorspace_fragment += `
  {
    vec3 vihrC = gl_FragColor.rgb;
    float vihrMx = max(vihrC.r, max(vihrC.g, vihrC.b)), vihrMn = min(vihrC.r, min(vihrC.g, vihrC.b));
    float vihrL = dot(vihrC, vec3(0.299, 0.587, 0.114));
    vihrC = mix(vec3(vihrL), vihrC, 1.0 + 0.3 * (1.0 - clamp(vihrMx - vihrMn, 0.0, 1.0)));
    vec3 vihrS = clamp(vihrC, 0.0, 1.0);
    vihrC += (vihrS * vihrS * (3.0 - 2.0 * vihrS) - vihrS) * 0.18;
    gl_FragColor.rgb = vihrC;
  }`;
}

// Оформление карт
const THEMES = {
  farm: {
    skyTop: "#5fb4f0", skyLow: "#dff3ff", fog: "#cfeaff", grass: "#7cc65a", grass2: "#6bb84c", outside: "#6aad4b",
    road: "#c9a46a", roadEdge: "#b08a52", dust: "#d9c095", sun: "#fff3dc", sunPower: 2.6, hemiSky: "#dff1ff", hemiGround: "#6a8a4a",
    border: "fence", decor: ["tree", "pine"], hills: "#68a84c",
  },
  town: {
    skyTop: "#6fa8f0", skyLow: "#e4efff", fog: "#d6e6fa", grass: "#86c96b", grass2: "#78bb5e", outside: "#7ab860",
    road: "#5f6470", roadEdge: "#d8d4cc", dust: "#c8c4bc", sun: "#fff6e6", sunPower: 2.5, hemiSky: "#e6f0ff", hemiGround: "#6a7a6a",
    border: "hedge", decor: ["tree", "pine"], hills: "#72b25a",
  },
  port: {
    skyTop: "#4fa0e8", skyLow: "#e6f6ff", fog: "#cde9fa", grass: "#bdb6a8", grass2: "#b0a99a", outside: "#2f8fd0",
    road: "#8f8c86", roadEdge: "#f0c23a", dust: "#e8f4ff", sun: "#fff6e6", sunPower: 2.6, hemiSky: "#e0f2ff", hemiGround: "#7a8a96",
    border: "bollard", decor: ["palm"], hills: "#7ab05a", sea: true,
  },
  park: {
    skyTop: "#8fa8ff", skyLow: "#ffe6f4", fog: "#f6e2f6", grass: "#8fdc7a", grass2: "#80d06b", outside: "#86cf72",
    road: "#ffdcae", roadEdge: "#f2c48a", dust: "#ffe6c8", sun: "#fff0f6", sunPower: 2.5, hemiSky: "#fff0fa", hemiGround: "#7aa070",
    border: "picket", decor: ["candy", "tree"], hills: "#86cf72",
  },
};

const FUNNEL_H = 3.6; // высота воронки в радиусах
const profile = (y) => 0.28 + 0.92 * Math.pow(y, 1.6);

// ---------- Шейдер воронки ----------
const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p, float period) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(vec2(mod(i.x, period), i.y));
  float b = hash(vec2(mod(i.x + 1.0, period), i.y));
  float c = hash(vec2(mod(i.x, period), i.y + 1.0));
  float d = hash(vec2(mod(i.x + 1.0, period), i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`;
const FUNNEL_VERT = /* glsl */ `
uniform float time, seed;
uniform vec2 bend;
varying vec2 vUv;
varying float vFres;
void main() {
  vUv = uv;
  vec3 p = position;
  float y = p.y;
  float sway = 0.07 + 0.04 * sin(time * 0.7 + seed);
  p.x += sin(y * 3.6 + time * 2.1 + seed) * sway * y + bend.x * y * y;
  p.z += cos(y * 3.0 + time * 1.7 + seed * 1.3) * sway * y + bend.y * y * y;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFres = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const FUNNEL_FRAG = /* glsl */ `
uniform float time, flow, alpha, mode;
uniform vec3 colA, colB, colC;
varying vec2 vUv;
varying float vFres;
${NOISE}
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float y = vUv.y;
  float s = vUv.x * 4.0 + y * 1.7 - time * flow;
  float n = noise(vec2(s * 3.0, y * 5.0 - time * 1.2), 12.0) * 0.65 + noise(vec2(s * 7.0 + 3.1, y * 11.0 - time * 2.0), 28.0) * 0.35;
  float band = smoothstep(0.46, 0.64, n);
  vec3 col = mix(colA, colB, smoothstep(0.0, 0.95, y));
  if (mode > 0.5 && mode < 1.5) col = mix(hue(fract(vUv.x * 2.0 + y * 0.7 - time * 0.12)), vec3(1.0), 0.15);
  if (mode > 2.5 && mode < 3.5) col = mix(colB, colA, step(0.5, fract(s * 1.25)));
  if (mode > 3.5) col = mix(colA, colB, clamp(y * 0.8 + n * 0.5, 0.0, 1.0));
  col = mix(col, colC, band * 0.72);
  // край воронки светлее — силуэт читается на любой земле
  col += (1.0 - vFres) * 0.14;
  if (mode > 1.5 && mode < 2.5) {
    vec2 cell = vec2(mod(floor(vUv.x * 48.0 + time * flow * 10.0), 48.0), floor(y * 30.0));
    col += step(0.975, hash(cell)) * 1.6;
  }
  float a = 0.42 + 0.58 * band;
  a *= smoothstep(0.0, 0.08, y) * (1.0 - 0.85 * smoothstep(0.7, 1.0, y));
  a *= mix(1.0, 0.72, vFres);
  gl_FragColor = vec4(col, clamp(a * alpha, 0.0, 1.0));
  #include <colorspace_fragment>
}`;
const RING_FRAG = /* glsl */ `
uniform float time, alpha, line;
uniform vec3 col;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float streak = 0.5 + 0.5 * sin(a * 7.0 + r * 10.0 - time * 7.0);
  float ring = smoothstep(1.0, 0.7, r) * smoothstep(0.1, 0.5, r);
  float al = ring * (0.18 + 0.4 * streak) * alpha;
  float edge = smoothstep(0.035, 0.0, abs(r - 0.8)) * line * (0.6 + 0.4 * step(0.5, fract(a * 6.0 + time * 0.6)));
  gl_FragColor = vec4(mix(col, vec3(1.0), edge), max(al, edge * 0.55));
  #include <colorspace_fragment>
}`;
const PLAIN_VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = /* glsl */ `
uniform float time;
varying vec2 vW;
void main() {
  float w1 = sin(vW.x * 0.55 + time * 1.1 + sin(vW.y * 0.3) * 2.0) * sin(vW.y * 0.42 - time * 0.9);
  float w2 = sin(vW.x * 1.3 - time * 1.7) * sin(vW.y * 1.1 + time * 1.3);
  float l = smoothstep(0.62, 0.96, w1 * 0.7 + w2 * 0.35);
  gl_FragColor = vec4(vec3(1.0), l * 0.42);
  #include <colorspace_fragment>
}`;

// ---------- Воронка одного вихря ----------
let funnelGeo = null;
function funnelGeometry() {
  if (funnelGeo) return funnelGeo;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const y = i / 16;
    pts.push(new T.Vector2(profile(y), y));
  }
  funnelGeo = new T.LatheGeometry(pts, 36);
  return funnelGeo;
}
const colorOf = (hex) => new T.Color(hex);

class Funnel {
  constructor(view, look, seed) {
    this.view = view;
    this.group = new T.Group();
    this.uniforms = [];
    const make = (flow, k) => {
      const u = {
        time: { value: 0 }, seed: { value: seed }, bend: { value: new T.Vector2() }, flow: { value: flow }, alpha: { value: 1 },
        mode: { value: 0 }, colA: { value: new T.Color() }, colB: { value: new T.Color() }, colC: { value: new T.Color() },
      };
      this.uniforms.push(u);
      const m = new T.Mesh(funnelGeometry(), new T.ShaderMaterial({ uniforms: u, vertexShader: FUNNEL_VERT, fragmentShader: FUNNEL_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide }));
      m.frustumCulled = false;
      m.renderOrder = 3 + k;
      return m;
    };
    this.inner = make(1.6, 0);
    this.outer = make(0.9, 1);
    this.inner.scale.set(0.7, 0.97, 0.7);
    this.body = new T.Group();
    this.body.add(this.inner, this.outer);
    this.group.add(this.body);
    this.ringU = { time: { value: 0 }, alpha: { value: 1 }, line: { value: 0 }, col: { value: new T.Color("#d9c095") } };
    this.ring = new T.Mesh(new T.CircleGeometry(1, 40), new T.ShaderMaterial({ uniforms: this.ringU, vertexShader: PLAIN_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.renderOrder = 2;
    this.group.add(this.ring);
    this.shield = new T.Mesh(PRIM.ball, new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.2, depthWrite: false }));
    this.shield.visible = false;
    this.group.add(this.shield);
    this.vr = 1;
    this.life = 1; // 0..1 — появление и исчезновение
    this.dead = false;
    this.lean = new T.Vector2();
    this.setLook(look);
  }
  setLook(look) {
    this.look = look;
    const a = colorOf(look.a), b = colorOf(look.b), c = colorOf(look.c || "#ffffff");
    this.uniforms.forEach((u, k) => {
      u.colA.value.copy(k ? a : a.clone().multiplyScalar(0.62));
      u.colB.value.copy(k ? b.clone().lerp(a, 0.25) : b.clone().lerp(a, 0.55));
      u.colC.value.copy(c.clone().lerp(b, 0.35));
      u.mode.value = look.mode || 0;
    });
  }
  label(text, color, player) {
    if (this.sprite) {
      this.group.remove(this.sprite);
      this.sprite.material.map.dispose();
      this.sprite.material.dispose();
    }
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d");
    g.font = "800 30px Rubik, system-ui, sans-serif";
    const w = Math.min(244, g.measureText(text).width + 50);
    g.fillStyle = player ? "rgba(255,255,255,.96)" : "rgba(28,30,48,.72)";
    g.beginPath();
    g.roundRect(128 - w / 2, 10, w, 44, 22);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(128 - w / 2 + 22, 32, 9, 0, TAU);
    g.fill();
    g.fillStyle = player ? "#1c2040" : "#ffffff";
    g.textBaseline = "middle";
    g.fillText(text, 128 - w / 2 + 38, 33);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    this.sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
    this.sprite.renderOrder = 20;
    this.sprite.center.set(0.5, 0);
    this.group.add(this.sprite);
  }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.ring.geometry.dispose();
  }
  update(dt, t, x, z, R, catchR, vx, vz, labelScale) {
    this.vr += (R - this.vr) * Math.min(1, dt * 3);
    const r = this.vr * this.life;
    this.group.position.set(x, 0, z);
    this.body.scale.set(r, r * FUNNEL_H, r);
    // верх отстаёт при движении
    this.lean.x += (-vx * 0.035 - this.lean.x) * Math.min(1, dt * 4);
    this.lean.y += (-vz * 0.035 - this.lean.y) * Math.min(1, dt * 4);
    for (const u of this.uniforms) {
      u.time.value = t;
      u.bend.value.copy(this.lean);
      u.alpha.value = Math.min(1, this.life * 1.4);
    }
    const ringR = Math.max(catchR, this.vr) * 1.25 * this.life;
    this.ring.scale.set(ringR, ringR, 1);
    this.ringU.time.value = t;
    this.ringU.alpha.value = this.life;
    if (this.sprite) {
      this.sprite.visible = !this.view.hideLabels;
      this.sprite.position.set(this.lean.x * r, r * FUNNEL_H + 0.6, this.lean.y * r);
      this.sprite.scale.set(labelScale * 4, labelScale, 1);
      this.sprite.material.opacity = this.life;
    }
  }
}

// ---------- Сцена ----------
export class View {
  constructor(canvas) {
    this.canvas = canvas;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const r = (this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }));
    r.toneMapping = T.NeutralToneMapping;
    r.toneMappingExposure = 1.04;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    this.quality = coarse ? 1 : 2;
    this.perf = { sum: 0, n: 0, slow: 0 };
    this.scene = new T.Scene();
    const pm = new T.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pm.dispose();
    this.camera = new T.PerspectiveCamera(42, 1, 0.5, 1600);
    this.camera.position.set(0, 30, 30);
    this.scene.add(this.camera);
    this.time = 0;
    this.shake = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    // свет
    this.hemi = new T.HemisphereLight("#dff1ff", "#6a8a4a", 1.5);
    this.sun = new T.DirectionalLight("#fff3dc", 2.6);
    this.sun.position.set(-30, 60, 25);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // небо
    this.skyU = { top: { value: new T.Color() }, low: { value: new T.Color() } };
    const sky = new T.Mesh(
      new T.SphereGeometry(900, 24, 12),
      new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
        vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform vec3 top, low; varying vec3 vD; void main(){ vec3 d = normalize(vD); gl_FragColor = vec4(mix(low, top, smoothstep(-0.05, 0.5, d.y)), 1.0);\n#include <colorspace_fragment>\n}",
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.sky = sky;
    this.scene.add(sky);
    this.scene.fog = new T.Fog("#cfeaff", 80, 260);

    this.fx = new Particles(this.scene);
    this.world = new T.Group(); // всё, что относится к карте
    this.scene.add(this.world);
    this.objMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
    this.debrisMesh = null;
    this.funnels = [];
    this.round = null;
    this.mode = "menu";
    this.look = new T.Vector3();
    this.camDist = 30;
    this.podium = null;
    this.thumbCache = new Map();
    this.waterU = { time: { value: 0 } };
    this.size = { w: 1, h: 1 };
    this.applyQuality();
  }

  applyQuality() {
    const q = this.quality;
    const ratio = Math.min(devicePixelRatio || 1, q >= 2 ? 2 : q === 1 ? 1.5 : 1);
    this.renderer.setPixelRatio(ratio);
    const shadows = q >= 1;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        if (o.material) o.material.needsUpdate = true;
      });
    }
    this.sun.castShadow = shadows;
    const size = q >= 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = this.renderer.getDrawingBufferSize(new T.Vector2()).y;
    this.fx.setScale(px / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  // ---------- Карта ----------
  setRound(round, looks) {
    this.round = round;
    const map = round.map;
    const theme = (this.theme = THEMES[map.id]);
    this.clearWorld();
    this.scene.fog.color.set(theme.fog);
    this.skyU.top.value.set(theme.skyTop);
    this.skyU.low.value.set(theme.skyLow);
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.sun.color.set(theme.sun);
    this.sun.intensity = theme.sunPower;
    this.buildGround(round, theme);
    this.buildObjects(round);
    this.buildFunnels(round, looks);
    this.fx.clear();
  }
  clearWorld() {
    for (const child of [...this.world.children]) {
      child.removeFromParent();
      child.traverse?.((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.material && o.material !== this.objMat) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
        if (o.geometry && o.userData.own) o.geometry.dispose();
      });
    }
    for (const f of this.funnels) f.dispose();
    this.funnels = [];
    this.kindMeshes = [];
  }

  buildGround(round, theme) {
    const H = round.half;
    const S = this.quality >= 1 ? 2048 : 1024;
    const k = S / (2 * H);
    const X = (x) => (x + H) * k, Z = (z) => (z + H) * k;
    let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const tex = canvasTexture(S, S, (g) => {
      g.fillStyle = theme.grass;
      g.fillRect(0, 0, S, S);
      // травинки и пятна
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = rnd() < 0.5 ? theme.grass2 : "rgba(255,255,255,0.10)";
        const s = 1 + rnd() * 3.5;
        g.fillRect(rnd() * S, rnd() * S, s, s);
      }
      const rect = (p, fill) => {
        g.fillStyle = fill;
        g.fillRect(X(p.x0), Z(p.z0), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k);
      };
      const rounded = (p, fill, rad = 1.2) => {
        g.fillStyle = fill;
        g.beginPath();
        g.roundRect(X(p.x0), Z(p.z0), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k, rad * k);
        g.fill();
      };
      const circle = (p, fill) => {
        g.fillStyle = fill;
        g.beginPath();
        g.arc(X((p.x0 + p.x1) / 2), Z((p.z0 + p.z1) / 2), ((p.x1 - p.x0) / 2) * k, 0, TAU);
        g.fill();
      };
      const patches = [...round.patches.filter((p) => p.under), ...round.patches.filter((p) => !p.under)];
      // дороги
      const id = round.map.id;
      const ring = round.roads.find((r) => r.ring);
      const roadFill = id === "farm" ? theme.road : theme.road;
      g.fillStyle = roadFill;
      g.fillRect(0, 0, S, ring.width * k);
      g.fillRect(0, S - ring.width * k, S, ring.width * k);
      g.fillRect(0, 0, ring.width * k, S);
      g.fillRect(S - ring.width * k, 0, ring.width * k, S);
      for (const r of round.roads) if (!r.ring) rect(r, roadFill);
      if (id === "farm") {
        // колеи на просёлке
        g.strokeStyle = "rgba(120,80,40,.25)";
        g.lineWidth = 0.35 * k;
        for (const r of round.roads) {
          if (r.ring) continue;
          const vertical = r.x1 - r.x0 < r.z1 - r.z0;
          for (const o of [-1.2, 1.2]) {
            g.beginPath();
            if (vertical) (g.moveTo(X(r.cx + o), Z(r.z0)), g.lineTo(X(r.cx + o), Z(r.z1)));
            else (g.moveTo(X(r.x0), Z(r.cz + o)), g.lineTo(X(r.x1), Z(r.cz + o)));
            g.stroke();
          }
        }
        for (let i = 0; i < 1600; i++) {
          g.fillStyle = "rgba(150,110,60,.3)";
          const r = round.roads[Math.floor(rnd() * round.roads.length)];
          if (r.ring) continue;
          g.fillRect(X(r.x0 + rnd() * (r.x1 - r.x0)), Z(r.z0 + rnd() * (r.z1 - r.z0)), 2, 2);
        }
      } else if (id === "town" || id === "port") {
        // разметка
        g.strokeStyle = id === "town" ? "rgba(255,255,255,.85)" : "rgba(255,206,60,.9)";
        g.lineWidth = 0.22 * k;
        g.setLineDash([2.2 * k, 2.2 * k]);
        for (const r of round.roads) {
          if (r.ring) continue;
          const vertical = r.x1 - r.x0 < r.z1 - r.z0;
          g.beginPath();
          if (vertical) (g.moveTo(X(r.cx), Z(r.z0)), g.lineTo(X(r.cx), Z(r.z1)));
          else (g.moveTo(X(r.x0), Z(r.cz)), g.lineTo(X(r.x1), Z(r.cz)));
          g.stroke();
        }
        g.setLineDash([]);
      }
      // кварталы: края тротуаров
      for (const b of round.blocks) {
        if (id === "town") rounded(b, theme.roadEdge, 1.5);
        if (id === "port" && b.type !== "sea" && b.type !== "basin") rounded(b, "#cfc9bd", 0.6);
        if (id === "park") rounded(b, theme.grass, 3);
      }
      for (const p of patches) {
        switch (p.type) {
          case "pen":
            rounded(p, "#9fcf62");
            for (let i = 0; i < 60; i++) {
              g.fillStyle = "rgba(160,120,60,.28)";
              g.beginPath();
              g.arc(X(p.x0 + rnd() * (p.x1 - p.x0)), Z(p.z0 + rnd() * (p.z1 - p.z0)), (0.3 + rnd() * 0.7) * k, 0, TAU);
              g.fill();
            }
            break;
          case "yard":
            rounded(p, id === "port" ? "#c9c3b6" : "#93cf68", 2);
            break;
          case "field":
            rounded(p, "#e9cd62", 1);
            g.strokeStyle = "rgba(190,150,50,.55)";
            g.lineWidth = 0.4 * k;
            for (let v = 1; v < 20; v++) {
              g.beginPath();
              if (p.across) {
                const x = p.x0 + ((p.x1 - p.x0) * v) / 20;
                g.moveTo(X(x), Z(p.z0 + 0.5));
                g.lineTo(X(x), Z(p.z1 - 0.5));
              } else {
                const z = p.z0 + ((p.z1 - p.z0) * v) / 20;
                g.moveTo(X(p.x0 + 0.5), Z(z));
                g.lineTo(X(p.x1 - 0.5), Z(z));
              }
              g.stroke();
            }
            break;
          case "garden":
            rounded(p, "#9a6a42", 1);
            g.fillStyle = "rgba(70,140,50,.55)";
            for (let v = 0; v < 10; v++) {
              const z = p.z0 + 1 + ((p.z1 - p.z0 - 2) * v) / 9;
              g.fillRect(X(p.x0 + 0.8), Z(z) - 0.25 * k, (p.x1 - p.x0 - 1.6) * k, 0.5 * k);
            }
            break;
          case "lawn":
            rounded(p, "#8fd46c", 2.5);
            break;
          case "park":
            rounded(p, "#7cc85e", 2.5);
            g.fillStyle = "#e6d8b8";
            g.fillRect(X(p.x0), Z((p.z0 + p.z1) / 2) - 0.9 * k, (p.x1 - p.x0) * k, 1.8 * k);
            break;
          case "plaza": {
            rounded(p, id === "park" ? "#ffe9c9" : id === "port" ? "#d4cec2" : "#e9e1d2", 1.5);
            g.strokeStyle = id === "park" ? "rgba(240,180,140,.5)" : "rgba(160,150,135,.4)";
            g.lineWidth = 1;
            for (let x = p.x0 + 2; x < p.x1; x += 2) (g.beginPath(), g.moveTo(X(x), Z(p.z0)), g.lineTo(X(x), Z(p.z1)), g.stroke());
            for (let z = p.z0 + 2; z < p.z1; z += 2) (g.beginPath(), g.moveTo(X(p.x0), Z(z)), g.lineTo(X(p.x1), Z(z)), g.stroke());
            break;
          }
          case "lot":
            rounded(p, "#6a6f7a", 1);
            g.strokeStyle = "rgba(255,255,255,.8)";
            g.lineWidth = 0.15 * k;
            for (let x = p.x0 + 2.4; x < p.x1 - 1; x += 2.6) (g.beginPath(), g.moveTo(X(x), Z(p.z0 + 0.5)), g.lineTo(X(x), Z(p.z0 + 4)), g.stroke());
            break;
          case "square":
            circle(p, "#e9dcc4");
            g.strokeStyle = "rgba(170,140,110,.5)";
            g.lineWidth = 0.3 * k;
            for (let rr = 2; rr < (p.x1 - p.x0) / 2; rr += 2.2) {
              g.beginPath();
              g.arc(X((p.x0 + p.x1) / 2), Z((p.z0 + p.z1) / 2), rr * k, 0, TAU);
              g.stroke();
            }
            break;
          case "water":
          case "pond": {
            const fill = "#3a9ed8";
            if (p.round) {
              circle({ x0: p.x0 - 0.8, z0: p.z0 - 0.8, x1: p.x1 + 0.8, z1: p.z1 + 0.8 }, "#f0dca8");
              circle(p, fill);
            } else rect(p, fill);
            break;
          }
          case "arena":
            rounded(p, "#ffc8e0", 2);
            rounded({ x0: p.x0 + 0.5, z0: p.z0 + 0.5, x1: p.x1 - 0.5, z1: p.z1 - 0.5 }, "#c8b8ff", 1.6);
            break;
          case "round": {
            circle(p, "#ffe2f0");
            const cx = X((p.x0 + p.x1) / 2), cz = Z((p.z0 + p.z1) / 2), rr = ((p.x1 - p.x0) / 2) * k;
            for (let i = 0; i < 16; i++) {
              g.fillStyle = i % 2 ? "rgba(255,200,120,.45)" : "rgba(180,160,255,.35)";
              g.beginPath();
              g.moveTo(cx, cz);
              g.arc(cx, cz, rr, (i / 16) * TAU, ((i + 1) / 16) * TAU);
              g.fill();
            }
            break;
          }
          case "rock":
            circle(p, "#9a9a96");
            break;
        }
      }
      // волны на воде
      g.strokeStyle = "rgba(255,255,255,.25)";
      g.lineWidth = 0.25 * k;
      for (const w of round.waterAreas) {
        for (let i = 0; i < 40; i++) {
          const x = clamp(w.x0 + rnd() * (w.x1 - w.x0), -H, H), z = clamp(w.z0 + rnd() * (w.z1 - w.z0), -H, H);
          if (w.round && Math.hypot(x - (w.x0 + w.x1) / 2, z - (w.z0 + w.z1) / 2) > (w.x1 - w.x0) / 2 - 1) continue;
          g.beginPath();
          g.arc(X(x), Z(z), 1.2 * k, Math.PI * 1.15, Math.PI * 1.85);
          g.stroke();
        }
      }
      // край арены чуть темнее
      const edge = g.createLinearGradient(0, 0, 0, 3 * k);
      edge.addColorStop(0, "rgba(0,0,0,.18)");
      edge.addColorStop(1, "rgba(0,0,0,0)");
      for (let s = 0; s < 4; s++) {
        g.save();
        g.translate(S / 2, S / 2);
        g.rotate((s * Math.PI) / 2);
        g.translate(-S / 2, -S / 2);
        g.fillStyle = edge;
        g.fillRect(0, 0, S, 3 * k);
        g.restore();
      }
    });
    tex.anisotropy = 4;
    const ground = new T.Mesh(new T.PlaneGeometry(2 * H, 2 * H), new T.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
    ground.userData.own = true;
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.world.add(ground);

    // за краем арены
    const outside = new T.Mesh(new T.PlaneGeometry(1400, 1400), new T.MeshStandardMaterial({ color: theme.outside, roughness: 1 }));
    outside.userData.own = true;
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = theme.sea ? -0.25 : -0.03;
    outside.receiveShadow = true;
    this.world.add(outside);
    if (theme.sea) {
      const shimmer = new T.Mesh(new T.PlaneGeometry(1400, 1400), new T.ShaderMaterial({ uniforms: this.waterU, vertexShader: PLAIN_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
      shimmer.userData.own = true;
      shimmer.rotation.x = -Math.PI / 2;
      shimmer.position.y = -0.2;
      this.world.add(shimmer);
      // причал: бетонная кромка арены над водой
      const quay = new T.Mesh(new T.BoxGeometry(2 * H + 0.6, 1.2, 2 * H + 0.6), new T.MeshStandardMaterial({ color: "#a8a39a", roughness: 0.9 }));
      quay.userData.own = true;
      quay.position.y = -0.61;
      this.world.add(quay);
    }
    // блики на воде внутри арены
    for (const w of round.waterAreas) {
      const big = w.x1 - w.x0 > 400;
      if (big) continue;
      const geo = w.round ? new T.CircleGeometry((w.x1 - w.x0) / 2, 40) : new T.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0);
      const m = new T.Mesh(geo, new T.ShaderMaterial({ uniforms: this.waterU, vertexShader: PLAIN_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
      m.userData.own = true;
      m.rotation.x = -Math.PI / 2;
      m.position.set((w.x0 + w.x1) / 2, 0.03, (w.z0 + w.z1) / 2);
      this.world.add(m);
    }
    if (theme.sea) {
      // море внутри арены (верхняя полоса) — тоже блестит
      const sea = round.waterAreas.find((w) => w.x1 - w.x0 > 400);
      if (sea) {
        const m = new T.Mesh(new T.PlaneGeometry(2 * H, sea.z1 + H), new T.ShaderMaterial({ uniforms: this.waterU, vertexShader: PLAIN_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
        m.userData.own = true;
        m.rotation.x = -Math.PI / 2;
        m.position.set(0, 0.03, (sea.z1 - H) / 2);
        this.world.add(m);
      }
    }

    // ограда арены
    const border = new Shape();
    const bp = [];
    const step = theme.border === "bollard" ? 4 : 2;
    for (let s = -H; s < H; s += step) {
      if (!theme.sea) bp.push([s + step / 2, -H, 0]);
      bp.push([s + step / 2, H, 0], [-H, s + step / 2, Math.PI / 2], [H, s + step / 2, Math.PI / 2]);
    }
    if (theme.border === "fence") {
      border.add("box", "#8a5a33", [0, 0.5, 0], [0.16, 1.0, 0.16]);
      border.add("box", "#c98a4b", [0, 0.4, 0], [2.02, 0.12, 0.08]);
      border.add("box", "#c98a4b", [0, 0.78, 0], [2.02, 0.12, 0.08]);
    } else if (theme.border === "hedge") {
      border.add("rbox", "#4f9f45", [0, 0.55, 0], [2.06, 1.1, 1.0]);
      border.add("lump", "#62b856", [0.4, 1.0, 0], 0.5);
    } else if (theme.border === "bollard") {
      border.add("cyl", "#3a3f4a", [0, 0.35, 0], [0.22, 0.7, 0.22]);
      border.add("ball", "#3a3f4a", [0, 0.72, 0], 0.24);
      border.add("box", "#f0c23a", [0, 0.06, 0], [4, 0.12, 0.5]);
    } else {
      for (const [x, c] of [[-0.6, "#ff9fc8"], [0, "#9fd8ff"], [0.6, "#fff07a"]]) {
        border.add("box", c, [x, 0.5, 0], [0.32, 1.0, 0.1]);
        border.add("pyr", c, [x, 1.1, 0], [0.23, 0.25, 0.08], [0, Math.PI / 4, 0]);
      }
      border.add("box", "#ffffff", [0, 0.6, -0.08], [2.02, 0.1, 0.06]);
    }
    this.world.add(this.instancedDecor(border.build(), bp.map(([x, z, r]) => [x, z, r, 1])));

    // деревья и холмы за краем
    const places = [];
    for (let i = 0; i < 260; i++) {
      const side = Math.floor(rnd() * 4), along = (rnd() * 2 - 1) * (H + 40), out = H + 4 + Math.pow(rnd(), 1.6) * 60;
      const [x, z] = side === 0 ? [along, -out] : side === 1 ? [along, out] : side === 2 ? [-out, along] : [out, along];
      places.push([x, z, rnd() * TAU, 0.8 + rnd() * 0.9]);
    }
    if (!theme.sea) {
      const kinds = theme.decor;
      kinds.forEach((kind, n) => {
        this.world.add(this.instancedDecor(decorTree(kind), places.filter((_, i) => i % kinds.length === n)));
      });
      const hill = new Shape();
      hill.add("ball", theme.hills, [0, 0, 0], [1, 0.35, 1]);
      const hills = [];
      for (let i = 0; i < 30; i++) {
        const a = rnd() * TAU, d = H * 1.6 + rnd() * 120;
        hills.push([Math.cos(a) * d, Math.sin(a) * d, 0, 14 + rnd() * 22]);
      }
      this.world.add(this.instancedDecor(hill.build(false), hills, false));
    } else {
      // острова с пальмами в море
      const isle = new Shape();
      isle.add("ball", "#f0dca8", [0, 0, 0], [1, 0.25, 1]);
      isle.add("ball", "#7ab05a", [0, 0.15, 0], [0.7, 0.25, 0.7]);
      const isles = [];
      for (let i = 0; i < 9; i++) {
        const a = rnd() * TAU, d = H * 1.5 + rnd() * 140;
        isles.push([Math.cos(a) * d, Math.sin(a) * d, 0, 10 + rnd() * 14]);
      }
      this.world.add(this.instancedDecor(isle.build(false), isles, false));
      this.world.add(this.instancedDecor(decorTree("palm"), isles.flatMap(([x, z, , s]) => [[x, z + 1, 0, 1.4], [x + s * 0.3, z - s * 0.2, 1, 1.2], [x - s * 0.25, z + s * 0.25, 2, 1.1]])));
    }
  }
  instancedDecor(geo, list, shadow = true) {
    const m = new T.InstancedMesh(geo, this.objMat, list.length);
    m.userData.own = true;
    const d = new T.Object3D();
    list.forEach(([x, z, r, s], i) => {
      d.position.set(x, 0, z);
      d.rotation.set(0, r, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.castShadow = shadow;
    m.receiveShadow = false;
    m.frustumCulled = false;
    return m;
  }

  // ---------- Предметы пачками ----------
  buildObjects(round) {
    const kinds = round.kinds;
    const counts = kinds.map(() => 0);
    this.slot = round.objs.map((o) => counts[o.k]++);
    this.kindMeshes = kinds.map((kind, k) => {
      if (!counts[k]) return null;
      const model = modelOf(kind.id);
      const make = (geo) => {
        const m = new T.InstancedMesh(geo, this.objMat, counts[k]);
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(T.DynamicDrawUsage);
        this.world.add(m);
        return m;
      };
      const km = { kind, base: make(model.base), paint: model.paint ? make(model.paint) : null, spin: model.spin ? make(model.spin.geo) : null, spinInfo: model.spin, dirty: true };
      if (km.paint) {
        const palette = PAINTS[kind.id] || ["#ffffff"];
        const c = new T.Color();
        round.objs.forEach((o) => {
          if (o.k === k) km.paint.setColorAt(this.slot[o.i], c.set(palette[o.tint % palette.length]));
        });
        km.paint.instanceColor.needsUpdate = true;
      }
      return km;
    });
    // состояние каждого предмета на экране
    this.vis = round.objs.map((o) => ({ mode: 0, t0: 0, x0: 0, z0: 0, a0: 0, r0: 0, by: 0, wob: 0, spinDir: 1, tx: 0, tz: 0 }));
    this.moving = round.objs.filter((o) => {
      const kind = kinds[o.k];
      return kind.walk || kind.bob || kind.spin;
    });
    this.flying = [];
    this.wobbling = new Set();
    for (const o of round.objs) this.placeRest(o);
    // обломки, кружащие в вихрях
    if (!this.debrisMesh) {
      this.debrisMesh = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), 6 * 14);
      this.debrisMesh.frustumCulled = false;
      this.debrisMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.scene.add(this.debrisMesh);
      this.debris = Array.from({ length: 6 * 14 }, (_, i) => ({ a: Math.random() * TAU, h: Math.random(), s: 0.05 + Math.random() * 0.07, sp: 0.8 + Math.random() * 0.8, r: 0.9 + Math.random() * 0.3, rot: Math.random() * TAU }));
    }
    const c = new T.Color();
    const tones = [this.theme.dust, this.theme.grass2, "#8a6a4a", "#ffffff"];
    for (let i = 0; i < this.debris.length; i++) this.debrisMesh.setColorAt(i, c.set(tones[i % tones.length]));
    this.debrisMesh.instanceColor.needsUpdate = true;
  }

  setMatrix(o, x, y, z, ry, s, rx = 0, rz = 0) {
    const km = this.kindMeshes[o.k];
    if (!km) return;
    const d = this.dummy || (this.dummy = Object.assign(new T.Object3D(), {}));
    d.rotation.order = "YXZ";
    d.position.set(x, y, z);
    d.rotation.set(rx, ry, rz);
    d.scale.setScalar(Math.max(0, s));
    d.updateMatrix();
    const slot = this.slot[o.i];
    km.base.setMatrixAt(slot, d.matrix);
    if (km.paint) km.paint.setMatrixAt(slot, d.matrix);
    if (km.spin) {
      const sp = km.spinInfo;
      const m = this.spinM || (this.spinM = new T.Matrix4());
      const r = this.spinR || (this.spinR = new T.Matrix4());
      const a = this.time * sp.speed + slot * 1.7;
      if (sp.axis === "x") r.makeRotationX(a);
      else if (sp.axis === "y") r.makeRotationY(a);
      else r.makeRotationZ(a);
      m.makeTranslation(sp.pivot[0], sp.pivot[1], sp.pivot[2]).multiply(r);
      m.premultiply(d.matrix);
      km.spin.setMatrixAt(slot, m);
    }
    km.dirty = true;
  }
  placeRest(o) {
    if (o.taken) return this.setMatrix(o, 0, -50, 0, 0, 0);
    this.setMatrix(o, o.x, 0, o.z, o.rot, o.scale);
  }

  // события правил
  onLift(o) {
    const v = this.vis[o.i];
    const T0 = this.round.tornados[o.by];
    v.mode = 1;
    v.t0 = this.time;
    v.x0 = o.x;
    v.z0 = o.z;
    v.by = o.by;
    v.a0 = Math.atan2(o.z - T0.z, o.x - T0.x);
    v.r0 = Math.hypot(o.z - T0.z, o.x - T0.x);
    v.tx = (Math.random() - 0.5) * 9;
    v.tz = (Math.random() - 0.5) * 9;
    this.wobbling.delete(o);
    this.flying.push(o);
  }
  onBack(o) {
    const v = this.vis[o.i];
    v.mode = 3;
    v.t0 = this.time;
    this.fx.sparkle(o.x, 0.6, o.z, "#ffffff", 5, 0.6);
  }
  onEat(e) {
    const f = this.funnels[e.victim];
    if (f) {
      f.dead = true;
      f.deathT = this.time;
      f.to = e.by;
    }
    const A = this.round.tornados[e.by];
    this.fx.burst(e.x, e.z, A.R, this.funnels[e.victim]?.look.a || "#ffffff");
    if (e.victim === 0 || e.by === 0) this.shake = Math.max(this.shake, 0.7);
  }
  onRespawn(T0) {
    const f = this.funnels[T0.i];
    if (!f) return;
    f.dead = false;
    f.life = 0.05;
    f.vr = T0.R;
    this.fx.sparkle(T0.x, 1, T0.z, "#ffffff", 10, 1);
  }

  updateObjects(dt) {
    const round = this.round, t = this.time;
    // полёт в вихре: по спирали вверх, кувыркаясь и уменьшаясь
    for (let n = this.flying.length - 1; n >= 0; n--) {
      const o = this.flying[n], v = this.vis[o.i], kind = round.kinds[o.k];
      const f = this.funnels[v.by], Tz = round.tornados[v.by];
      const dur = 1.05 + Math.min(0.55, kind.size * 0.12);
      const u = (t - v.t0) / dur;
      if (u >= 1 || !f || f.dead) {
        v.mode = 2;
        this.flying.splice(n, 1);
        this.setMatrix(o, 0, -50, 0, 0, 0);
        if (f && !f.dead) {
          const top = f.vr * FUNNEL_H * 0.85;
          this.fx.puff(Tz.x + f.lean.x * f.vr * 0.7, top, Tz.z + f.lean.y * f.vr * 0.7, kind.puff || "star", kind.size);
        }
        continue;
      }
      const vr = f.vr, H = vr * FUNNEL_H;
      const e = smooth(0, 1, u);
      const ang = v.a0 + (u * 3 + u * u * 7);
      const rise = Math.pow(u, 1.35);
      // по спирали снаружи воронки: так поднятое видно, а не прячется внутри
      const rr = lerp(v.r0, vr * Math.max(0.62 + 0.55 * rise, profile(rise * 0.85) * 1.12) + o.size * 0.45, smooth(0, 0.35, u));
      const y = rise * H * 0.85;
      const s = o.scale * (1 - 0.7 * Math.pow(u, 2));
      const lx = f.lean.x * vr * rise * rise, lz = f.lean.y * vr * rise * rise;
      this.setMatrix(o, Tz.x + Math.cos(ang) * rr + lx, y, Tz.z + Math.sin(ang) * rr + lz, o.rot + u * 6, s, v.tx * e, v.tz * e);
    }
    // ходячие, качающиеся, крутящиеся
    for (const o of this.moving) {
      const v = this.vis[o.i];
      if (o.taken || v.mode === 1 || v.mode === 4) continue;
      const kind = round.kinds[o.k];
      if (v.mode === 3) continue;
      let y = 0, rx = 0, rz = 0;
      if (kind.walk) {
        const speed = Math.hypot(o.vx, o.vz);
        if (!kind.water && kind.id !== "bumper") y = Math.abs(Math.sin(t * 11 + o.i)) * Math.min(0.14, speed * 0.06);
      }
      if (kind.bob) {
        const ph = t * (kind.water ? 1.4 : 1.1) + o.i * 1.37;
        y += Math.sin(ph) * (kind.water ? 0.06 : 0.12);
        rx = Math.sin(ph * 0.8) * (kind.water ? 0.05 : 0.06);
        rz = Math.cos(ph * 0.9) * (kind.water ? 0.04 : 0.06);
      }
      this.setMatrix(o, o.x, y, o.z, o.rot, o.scale, rx, rz);
    }
    // возвращение: выскакивает из земли
    for (const o of round.objs) {
      const v = this.vis[o.i];
      if (v.mode !== 3) continue;
      const u = (t - v.t0) / 0.45;
      if (u >= 1) {
        v.mode = 0;
        this.placeRest(o);
      } else {
        const s = o.scale * (1 + Math.sin(u * Math.PI) * 0.25) * smooth(0, 0.6, u);
        this.setMatrix(o, o.x, 0, o.z, o.rot, s);
      }
    }
    // крупные предметы рядом с игроком дрожат: «ещё чуть-чуть»
    const P = round.player;
    const near = new Set();
    if (P.alive) {
      const reach = P.R * 1.2 + round.map.maxSize;
      round.around(P.x, P.z, reach, (o) => {
        if (o.taken || o.need <= P.R) return;
        const d = Math.hypot(o.x - P.x, o.z - P.z);
        if (d < P.R * 1.15 + o.size * 0.8) near.add(o);
      });
    }
    for (const o of this.wobbling) {
      if (!near.has(o)) {
        this.wobbling.delete(o);
        this.vis[o.i].mode = 0;
        this.placeRest(o);
      }
    }
    for (const o of near) {
      const v = this.vis[o.i];
      if (v.mode === 1 || v.mode === 3) continue;
      v.mode = 4;
      this.wobbling.add(o);
      const close = clamp(1 - (o.need - P.R) / (P.R * 0.8), 0.15, 1);
      const w = Math.sin(t * 19 + o.i) * 0.06 * close, w2 = Math.cos(t * 23 + o.i) * 0.05 * close;
      const lift = close > 0.7 ? (close - 0.7) * 0.9 * (0.6 + 0.4 * Math.sin(t * 9 + o.i)) : 0;
      this.setMatrix(o, o.x, lift, o.z, o.rot + Math.sin(t * 7 + o.i) * 0.04 * close, o.scale, w, w2);
    }
    for (const km of this.kindMeshes) {
      if (!km || !km.dirty) continue;
      km.base.instanceMatrix.needsUpdate = true;
      if (km.paint) km.paint.instanceMatrix.needsUpdate = true;
      if (km.spin) km.spin.instanceMatrix.needsUpdate = true;
      km.dirty = false;
    }
  }
  // ---------- Вихри ----------
  buildFunnels(round, looks) {
    this.funnels = round.tornados.map((T0, i) => {
      const f = new Funnel(this, looks[i], i * 2.3);
      f.label(T0.player ? "Ты" : T0.name, looks[i].a, T0.player);
      f.ringU.col.value.set(this.theme.dust);
      f.ringU.line.value = T0.player ? 1 : 0;
      f.vr = T0.R;
      this.scene.add(f.group);
      return f;
    });
    if (!this.crown) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      g.fillStyle = "#ffd23f";
      g.strokeStyle = "#9a5a10";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(8, 50);
      g.lineTo(6, 18);
      g.lineTo(20, 32);
      g.lineTo(32, 10);
      g.lineTo(44, 32);
      g.lineTo(58, 18);
      g.lineTo(56, 50);
      g.closePath();
      g.fill();
      g.stroke();
      const tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      this.crown = new T.Sprite(new T.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false }));
      this.crown.renderOrder = 21;
      this.crown.center.set(0.5, 0);
      this.scene.add(this.crown);
    }
  }
  setPlayerLook(look) {
    this.funnels[0]?.setLook(look);
  }
  updateFunnels(dt) {
    const round = this.round, t = this.time;
    const labelScale = (30 / this.size.h) * Math.tan((this.camera.fov * Math.PI) / 360) * 2;
    let leader = null;
    for (const T0 of round.tornados) if (T0.alive && (!leader || T0.r2 > leader.r2)) leader = T0;
    for (const T0 of round.tornados) {
      const f = this.funnels[T0.i];
      if (!f) continue;
      if (f.dead) {
        // втянут: съёживается и летит к победителю
        const A = round.tornados[f.to];
        const u = (t - f.deathT) / 0.5;
        f.life = Math.max(0, 1 - u);
        const x = lerp(f.group.position.x, A.x, Math.min(1, dt * 6)), z = lerp(f.group.position.z, A.z, Math.min(1, dt * 6));
        f.group.visible = f.life > 0;
        f.update(dt, t, x, z, f.vr, 0, 0, 0, labelScale);
        continue;
      }
      if (!T0.alive) {
        f.group.visible = false;
        continue;
      }
      f.group.visible = true;
      f.life = Math.min(1, f.life + dt * 1.8);
      f.update(dt, t, T0.x, T0.z, T0.R, round.catchRadius(T0), T0.vx, T0.vz, labelScale);
      const shielded = round.t < T0.shield;
      f.shield.visible = shielded;
      if (shielded) {
        f.shield.scale.setScalar(f.vr * 1.6);
        f.shield.position.y = f.vr * 1.2;
        f.shield.material.opacity = 0.12 + 0.1 * Math.sin(t * 12);
      }
      // пыль у основания
      if (Math.random() < dt * (8 + T0.R * 2)) this.fx.dust(T0.x, T0.z, f.vr, this.theme.dust);
    }
    if (leader && this.funnels[leader.i] && this.mode === "play" && !this.hideLabels) {
      const f = this.funnels[leader.i];
      this.crown.visible = true;
      this.crown.position.set(leader.x + f.lean.x * f.vr, f.vr * f.life * FUNNEL_H + 0.6, leader.z + f.lean.y * f.vr);
      this.crown.center.set(0.5, -1.15);
      this.crown.scale.set(labelScale * 1.2, labelScale * 1.2, 1);
    } else this.crown.visible = false;
    // обломки в вихрях
    if (this.debrisMesh) {
      const d = this.dummy || (this.dummy = new T.Object3D());
      d.rotation.order = "XYZ";
      for (let i = 0; i < this.debris.length; i++) {
        const q = this.debris[i], T0 = round.tornados[Math.floor(i / 14)], f = T0 && this.funnels[T0.i];
        if (!f || !f.group.visible) {
          d.scale.setScalar(0);
          d.position.set(0, -50, 0);
        } else {
          q.h = (q.h + dt * 0.18 * q.sp) % 1;
          q.a += dt * q.sp * (4.5 / Math.max(0.6, Math.sqrt(f.vr)));
          q.rot += dt * 5;
          const r = f.vr * f.life * profile(q.h) * q.r;
          const lx = f.lean.x * f.vr * q.h * q.h, lz = f.lean.y * f.vr * q.h * q.h;
          d.position.set(f.group.position.x + Math.cos(q.a) * r + lx, q.h * f.vr * f.life * FUNNEL_H, f.group.position.z + Math.sin(q.a) * r + lz);
          d.rotation.set(q.rot, q.rot * 0.7, 0);
          d.scale.setScalar(q.s * Math.max(0.6, f.vr) * f.life * Math.sin(q.h * Math.PI));
        }
        d.updateMatrix();
        this.debrisMesh.setMatrixAt(i, d.matrix);
      }
      this.debrisMesh.count = Math.min(this.debris.length, round.tornados.length * 14);
      this.debrisMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- Пьедестал ----------
  showPodium(order, looks) {
    if (!this.podium) this.buildPodium();
    const p = this.podium;
    p.group.visible = true;
    p.funnels.forEach((f, k) => {
      const o = order[k];
      f.group.visible = !!o;
      if (!o) return;
      f.setLook(looks[o.i]);
      f.label(o.player ? "Ты" : o.name, looks[o.i].a, o.player);
      f.life = 0.05;
    });
    p.t0 = this.time;
    this.mode = "podium";
    this.crown.visible = false;
  }
  hidePodium() {
    if (this.podium) this.podium.group.visible = false;
  }
  buildPodium() {
    const group = new T.Group();
    group.position.set(0, 0, 3000);
    const s = new Shape();
    s.add("cyl", "#ffe6f2", [0, -0.3, 0], [16, 0.6, 16]);
    s.add("cyl", "#c8b8ff", [0, -0.62, 0], [16.6, 0.4, 16.6]);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      s.add("ball", i % 2 ? "#ffd23f" : "#ff8fb8", [Math.cos(a) * 15.6, 0.1, Math.sin(a) * 15.6], 0.3);
    }
    const blocks = [[0, 3.0, "#ffcf3a", "1"], [-4, 2.0, "#cfd8e6", "2"], [4, 1.3, "#e8a05a", "3"]];
    for (const [x, h, c] of blocks) {
      s.add("rbox", c, [x, h / 2, 0], [3.6, h, 3.6]);
      s.add("rbox", "#ffffff", [x, h + 0.05, 0], [3.7, 0.12, 3.7]);
    }
    const base = new T.Mesh(s.build(), this.objMat);
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);
    for (const [x, h, , num] of blocks) {
      const tex = canvasTexture(128, 128, (g) => {
        g.fillStyle = "rgba(255,255,255,.9)";
        g.beginPath();
        g.arc(64, 64, 52, 0, TAU);
        g.fill();
        g.fillStyle = "#3a2a5a";
        g.font = "900 82px Rubik, system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(num, 64, 70);
      });
      const plate = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), new T.MeshBasicMaterial({ map: tex, transparent: true }));
      plate.position.set(x, h / 2, 1.82);
      group.add(plate);
    }
    const funnels = blocks.map(([x, h], k) => {
      const f = new Funnel(this, { a: "#888", b: "#fff" }, k * 3.1);
      f.base = [x, h];
      f.ringU.alpha.value = 0;
      group.add(f.group);
      return f;
    });
    this.scene.add(group);
    this.podium = { group, funnels, t0: 0 };
  }
  updatePodium(dt) {
    const p = this.podium;
    const t = this.time;
    const labelScale = (30 / this.size.h) * Math.tan((this.camera.fov * Math.PI) / 360) * 2;
    p.funnels.forEach((f, k) => {
      if (!f.group.visible) return;
      const grow = smooth(0, 0.8, t - p.t0 - k * 0.25);
      f.life = Math.max(0.02, grow);
      const R = [1.25, 1.05, 0.95][k];
      f.vr = R;
      f.update(dt, t, f.base[0], 0, R, 0, Math.sin(t * 1.3 + k) * 2, 0, labelScale);
      f.group.position.y = f.base[1];
      f.group.position.z = 0;
    });
    const g = p.group.position;
    if (Math.random() < dt * 9) this.fx.confetti(g.x, g.y + 9, g.z, 14, 3);
  }

  // ---------- Миниатюры предметов для подсказок ----------
  thumbs(mapIndex) {
    if (this.thumbCache.has(mapIndex)) return this.thumbCache.get(mapIndex);
    const S = 160, OUT = 80;
    const rt = new T.WebGLRenderTarget(S, S);
    // цель рендера хранит линейный цвет: переводим в sRGB таблицей
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      lut[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
    }
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight("#ffffff", "#8a8a9a", 2.2));
    const sun = new T.DirectionalLight("#ffffff", 2.2);
    sun.position.set(-3, 6, 5);
    scene.add(sun);
    scene.environment = this.scene.environment;
    scene.environmentIntensity = 0.4;
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 500);
    const pixels = new Uint8Array(S * S * 4);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const g = canvas.getContext("2d");
    const img = g.createImageData(S, S);
    const small = document.createElement("canvas");
    small.width = small.height = OUT;
    const sg = small.getContext("2d");
    const out = MAPS[mapIndex].kinds.map((kind) => {
      const model = modelOf(kind.id);
      const group = new T.Group();
      for (const geo of [model.base, model.paint]) {
        if (!geo) continue;
        const m = new T.Mesh(geo, this.objMat);
        if (geo === model.paint) {
          m.material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, color: (PAINTS[kind.id] || ["#fff"])[0] });
        }
        group.add(m);
      }
      if (model.spin) {
        const m = new T.Mesh(model.spin.geo, this.objMat);
        m.position.set(...model.spin.pivot);
        group.add(m);
      }
      group.rotation.y = -0.6;
      scene.add(group);
      const box = new T.Box3().setFromObject(group);
      const sphere = box.getBoundingSphere(new T.Sphere());
      const d = sphere.radius / Math.sin((cam.fov * Math.PI) / 360) * 1.02;
      cam.position.set(sphere.center.x, sphere.center.y + d * 0.42, sphere.center.z + d * 0.9);
      cam.lookAt(sphere.center);
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(scene, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, S, S, pixels);
      this.renderer.setRenderTarget(null);
      for (let y = 0; y < S; y++) img.data.set(pixels.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = lut[img.data[i]];
        img.data[i + 1] = lut[img.data[i + 1]];
        img.data[i + 2] = lut[img.data[i + 2]];
      }
      g.putImageData(img, 0, 0);
      sg.clearRect(0, 0, OUT, OUT);
      sg.imageSmoothingQuality = "high";
      sg.drawImage(canvas, 0, 0, OUT, OUT);
      scene.remove(group);
      for (const m of group.children) if (m.material !== this.objMat) m.material.dispose();
      return small.toDataURL("image/png");
    });
    rt.dispose();
    this.renderer.setClearColor(0x000000, 1);
    this.thumbCache.set(mapIndex, out);
    return out;
  }

  // точка мира на экране (для стрелок к соперникам)
  project(x, y, z) {
    const v = (this.pv || (this.pv = new T.Vector3())).set(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.size.w, y: (-v.y * 0.5 + 0.5) * this.size.h, behind: v.z > 1 };
  }

  // ---------- Кадр ----------
  render(dt, opts = {}) {
    this.time += dt;
    this.waterU.time.value = this.time;
    const round = this.round;
    if (round && this.mode !== "podium") {
      this.updateObjects(dt);
      this.updateFunnels(dt);
      // след облика за игроком
      const P = round.player;
      const trail = TRAILS[opts.trail ?? 0];
      if (P.alive && opts.trail && Math.hypot(P.vx, P.vz) > 1 && Math.random() < dt * (14 + P.R * 3)) this.fx.trail(P.x, P.z, this.funnels[0].vr, trail);
    }
    if (this.mode === "podium") this.updatePodium(dt);
    this.fx.update(dt);
    this.updateCamera(dt, opts);
    // если устройство не тянет — снижаем качество
    if (opts.frameMs !== undefined) {
      const pf = this.perf;
      pf.sum += opts.frameMs;
      pf.n++;
      if (pf.n >= 120) {
        const avg = pf.sum / pf.n;
        if (avg > 24 && this.quality > 0) {
          this.quality--;
          this.applyQuality();
        }
        pf.sum = pf.n = 0;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt, opts) {
    const cam = this.camera, round = this.round;
    const { w, h } = this.size;
    const portrait = h > w * 1.05;
    const k = Math.min(1, dt * 3.2);
    let tx = 0, tz = 0, ty = 0, dist = 30, pitch = 0.92, yaw = 0;
    if (this.mode === "podium" && this.podium) {
      const g = this.podium.group.position;
      tx = g.x;
      ty = 2.6;
      tz = g.z;
      dist = portrait ? 44 : 19;
      pitch = 0.2;
    } else if (round) {
      const P = round.player, f = this.funnels[0];
      const vr = f ? f.vr : 1;
      if (this.mode === "menu") {
        tx = P.x;
        tz = P.z;
        ty = vr * 1.6;
        dist = (portrait ? 23 : 15) + vr * 5;
        pitch = 0.5;
        yaw = this.time * 0.09;
      } else {
        tx = P.x + P.vx * 0.25;
        tz = P.z + P.vz * 0.25;
        ty = vr * 1.0;
        dist = (22 + vr * 6.4) * (portrait ? 1.4 : 1);
        pitch = 0.94;
      }
    }
    // для снимков карточки: камера на заданной точке
    const o = this.camOverride;
    if (o) {
      ({ tx, ty, tz, dist, pitch, yaw } = { tx, ty, tz, dist, pitch, yaw, ...o });
      this.look.set(tx, ty, tz);
      this.camDist = dist;
      this.camPitch = pitch;
      this.camYaw = yaw;
    }
    if (this.mode !== this.lastMode) {
      // мгновенно на новый план, если сменился режим (меню ↔ раунд ↔ пьедестал)
      if (this.lastMode === "podium" || this.mode === "podium" || !this.lastMode) {
        this.look.set(tx, ty, tz);
        this.camDist = dist;
        this.camPitch = pitch;
        this.camYaw = yaw;
      }
      this.lastMode = this.mode;
    }
    this.look.x += (tx - this.look.x) * Math.min(1, dt * 6);
    this.look.y += (ty - this.look.y) * k;
    this.look.z += (tz - this.look.z) * Math.min(1, dt * 6);
    this.camDist += (dist - this.camDist) * Math.min(1, dt * 1.6);
    this.camPitch += (pitch - this.camPitch) * k;
    this.camYaw += (yaw - this.camYaw) * k;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    cam.position.set(this.look.x + Math.sin(this.camYaw) * cp * this.camDist, this.look.y + sp * this.camDist, this.look.z + Math.cos(this.camYaw) * cp * this.camDist);
    if (this.shake > 0 && !this.reduced) {
      const j = this.shake * this.shake * 0.6;
      cam.position.x += Math.sin(this.time * 83) * j;
      cam.position.y += Math.cos(this.time * 71) * j;
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
    cam.lookAt(this.look);
    this.sky.position.copy(cam.position);
    // в меню и на пьедестале предмет сдвинут: рядом панель
    const shift = opts.shift || { x: 0, y: 0 };
    if (shift.x || shift.y) cam.setViewOffset(w, h, -shift.x * w, -shift.y * h, w, h);
    else cam.clearViewOffset();
    // туман по удалению камеры
    const fog = this.scene.fog;
    fog.near = this.camDist * (this.mode === "podium" ? 3 : 1.25);
    fog.far = this.camDist * (this.mode === "podium" ? 8 : 3.4) + 40;
    // тень идёт за камерой
    const sc = this.sun.shadow.camera, span = clamp(this.camDist * 0.95, 20, 120);
    if (sc.right !== span) {
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.updateProjectionMatrix();
    }
    this.sun.target.position.copy(this.look);
    this.sun.position.set(this.look.x - 30, this.look.y + 70, this.look.z + 25);
  }
}

