// Сцена «Снежного кома». Правила считают трассу прямой (s — вперёд, x — вбок), а здесь она
// изгибается и идёт под уклон: каждая точка (s, x, y) переводится в мир через «рельсы» path.
// Правила (rules.js, run.js) ничего не знают о графике; здесь только то, что видно.
import { T, TAU, GEO, V, clamp, rand, hot, lit, part, at, canvasTexture, labelTexture, glowTexture } from "./kit.js?v=c359cce9";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=c359cce9";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=c359cce9";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=c359cce9";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=c359cce9";
import { ShaderPass } from "../vendor/three/postprocessing/ShaderPass.js?v=c359cce9";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=c359cce9";
import { createFx, tone, GLOW, PUFF, STAR, RING } from "./fx.js?v=c359cce9";
import { firGeometry, spireGeometry, rockGeometry, pileGeometry, rampGeometry, snowTexture, flakeTexture, crackTexture, bricksTexture, signTexture, gateModel, snowmanModel, keepSnowmanMaterial, skinMaterial, skinGeometry, GATE_H } from "./models.js?v=c359cce9";
import { Hero } from "./hero.js?v=c359cce9";
import { HALF, BRIDGE_HALF, radiusOf, gateLabel, logX, crusherLift, geyserState, rng } from "./rules.js?v=c359cce9";
import { FoeView, keepFoeMaterial } from "./foes.js?v=c359cce9";
import { heading } from "./levels.js?v=c359cce9";
import { SKINS } from "./economy.js?v=c359cce9";

export const SLOPE = 0.12;
const PITCH = Math.atan(SLOPE);

// Уровни качества: высокое — мягкие тени, свечение, размытие на скорости, больше снега;
// среднее — свечение без теней; низкое — без постэффектов, меньше пикселей и частиц.
export const TIERS = {
  high: { name: "Высокое", ratio: 2, glow: true, shadows: true, blur: true, dust: 1.35, snow: 1.7 },
  medium: { name: "Среднее", ratio: 1.5, glow: true, shadows: false, blur: false, dust: 1, snow: 1 },
  low: { name: "Низкое", ratio: 1, glow: false, shadows: false, blur: false, dust: 0.55, snow: 0.5 },
};
const ORDER = ["high", "medium", "low"];

// ---------- Оформление гор ----------
const THEMES = [
  { // Ёлочный склон: ясный день
    top: "#2f84ec", low: "#dff2ff", fog: "#d2e9fc", sun: "#fff1d6", sunPower: 1.9, sky: "#e8f3ff", ground: "#a9c6ee", amb: 2.1,
    road: "#f3f8ff", bank: "#ffffff", hills: "#f1f6ff", far: "#d2e2f4", rock: "#8a93a6", tree: "#2e7d4f", fence: "#8b5a34", fenceTop: "#fafdff",
    peaks: "#9db8de", stars: 0, aurora: 0, snowfall: 0.5, decor: "firs", dust: "#ffffff", dust2: "#e6f0ff", trail: "#b8d2f4",
  },
  { // Ледяное ущелье: голубой лёд; стены ущелья темнее и сочнее, чтобы белая трасса и ворота не тонули в молочной дымке
    top: "#1a56c8", low: "#a0d8fa", fog: "#8ccaf0", sun: "#f2fcff", sunPower: 2.2, sky: "#e2f4ff", ground: "#6aa4d8", amb: 1.7,
    road: "#ffffff", bank: "#ffffff", hills: "#86c0ec", far: "#4f94d0", rock: "#5a8ab8", tree: "#2f7f9f", fence: "#6fd0ff", fenceTop: "#e6fbff",
    peaks: "#8cc8ea", stars: 0, aurora: 0, snowfall: 0.35, decor: "ice", dust: "#f2fcff", dust2: "#d6f2ff", trail: "#a6cdf0",
  },
  { // Северное сияние: ночь
    top: "#040820", low: "#1c3a70", fog: "#16264c", sun: "#a8c0ff", sunPower: 1.3, sky: "#7a92dc", ground: "#2a3460", amb: 1.6,
    road: "#c4d2f6", bank: "#d6e2ff", hills: "#a9b8e2", far: "#56689c", rock: "#4a5272", tree: "#1d4d4a", fence: "#6a4a3a", fenceTop: "#d6e2ff",
    peaks: "#26386a", stars: 1, aurora: 1, snowfall: 0.8, decor: "night", dust: "#95a8dc", dust2: "#6a7cb4", trail: "#8aa2e0",
  },
  { // Вулканическая гора: закат и лава
    top: "#2a1838", low: "#ff9e7a", fog: "#c9aab0", sun: "#ffe6d2", sunPower: 1.7, sky: "#eef0fa", ground: "#6a4a4a", amb: 2.0,
    road: "#f4f0f6", bank: "#fbf8fc", hills: "#7a6466", far: "#5a4648", rock: "#3a2c2c", tree: "#4a3030", fence: "#2e2828", fenceTop: "#ff7a3a",
    peaks: "#5a2e34", stars: 0, aurora: 0, snowfall: 0.15, decor: "volcano", dust: "#f8ece6", dust2: "#e8d0c8", trail: "#e0c8d4",
  },
];

// ---------- «Рельсы»: s → точка мира ----------
class Path {
  constructor(level) {
    this.level = level;
    this.s0 = -120;
    this.s1 = level.finale.end + 200;
    const n = (this.n = Math.ceil(this.s1 - this.s0) + 1);
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.th = new Float32Array(n);
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const th = heading(level, this.s0 + i);
      this.th[i] = th;
      this.px[i] = x;
      this.pz[i] = z;
      x += Math.sin(th);
      z -= Math.cos(th);
    }
    const i0 = -this.s0;
    const ox = this.px[i0], oz = this.pz[i0];
    for (let i = 0; i < n; i++) (this.px[i] -= ox), (this.pz[i] -= oz);
  }
  idx(s) {
    const u = clamp(s - this.s0, 0, this.n - 1.0001);
    const i = Math.floor(u);
    return [i, u - i];
  }
  heading(s) {
    const [i, f] = this.idx(s);
    return this.th[i] + (this.th[i + 1] - this.th[i]) * f;
  }
  frame(s, x, y, out = V()) {
    const [i, f] = this.idx(s);
    const th = this.th[i] + (this.th[i + 1] - this.th[i]) * f;
    const cx = this.px[i] + (this.px[i + 1] - this.px[i]) * f;
    const cz = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * f;
    return out.set(cx + Math.cos(th) * x, -SLOPE * s + y, cz + Math.sin(th) * x);
  }
  // объект стоит на трассе: смотрит вперёд по ходу и наклонён вместе со склоном
  place(obj, s, x, y = 0, tilt = true) {
    this.frame(s, x, y, obj.position);
    obj.rotation.set(tilt ? -PITCH : 0, -this.heading(s), 0, "YXZ");
    return obj;
  }
  right(s, out = V()) {
    const th = this.heading(s);
    return out.set(Math.cos(th), 0, Math.sin(th));
  }
  forward(s, out = V()) {
    const th = this.heading(s);
    return out.set(Math.sin(th), -SLOPE, -Math.cos(th)).normalize();
  }
}

// плавный шум для холмов
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

// блики на снегу: вкрапления, которые мерцают на свету
function sparkle(material, uniforms, strength = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSpark = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSparkPos;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vSparkPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vSparkPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSparkPos;\nuniform float uTime;\nuniform float uSpark;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 q = vSparkPos * 6.0;
          vec3 cell = floor(q);
          float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float tw = 0.5 + 0.5 * sin(uTime * (1.5 + h * 4.0) + h * 70.0);
          vec3 f = fract(q) - 0.5;
          float d = length(cameraPosition - vSparkPos);
          float spark = step(0.982, h) * smoothstep(0.3, 0.0, length(f)) * pow(tw, 6.0) * smoothstep(34.0, 4.0, d);
          totalEmissiveRadiance += vec3(0.85, 0.94, 1.0) * spark * 2.0 * uSpark;
        }`,
      );
  };
  material.customProgramCacheKey = () => "sparkle" + strength;
  return material;
}

const FOE_EVENTS = new Set(["kill", "bonk", "pow", "smash", "pickup", "wave", "spirit", "spirit-away", "shot"]);

export class SnowView {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = (this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" }));
    renderer.toneMapping = T.NeutralToneMapping;
    renderer.toneMappingExposure = 0.94;
    const scene = (this.scene = new T.Scene());
    scene.fog = new T.Fog("#d4eafb", 70, 250);
    scene.background = new T.Color("#d4eafb");
    this.camera = new T.PerspectiveCamera(60, 1, 0.3, 1600);
    scene.add(this.camera);
    this.uniforms = { uTime: { value: 0 } };
    this.time = 0;
    this.shake = 0;
    this.hurt = 0;
    this.joy = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.perf = { glow: true, ratio: 1.75, slow: 0, seen: 0, step: 0, tier: "high", auto: true, drops: 0 };
    this.q = TIERS.high;
    this.flash = 0;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    this.hemi = new T.HemisphereLight("#eaf5ff", "#9cb6d8", 1.2);
    this.sun = new T.DirectionalLight("#fff1d6", 2.7);
    // мягкая тень едет вместе с комом: квадрат вокруг него
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 10, far: 140 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 4;
    scene.add(this.hemi, this.sun, this.sun.target);
    const pmrem = new T.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // ---------- Небо: градиент, солнце, звёзды и сияние ----------
    this.skyU = { top: { value: new T.Color() }, low: { value: new T.Color() }, sun: { value: new T.Color() }, stars: { value: 0 }, aurora: { value: 0 }, time: this.uniforms.uTime, sunDir: { value: V(-0.4, 0.35, -1).normalize() } };
    this.sky = new T.Mesh(
      new T.SphereGeometry(1200, 32, 18),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyU,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vDir;
          uniform vec3 top, low, sun, sunDir;
          uniform float stars, aurora, time;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            vec3 col = mix(low, top, smoothstep(-0.05, 0.55, d.y));
            float g = max(dot(d, sunDir), 0.0);
            col += sun * (pow(g, 400.0) * 2.6 + pow(g, 12.0) * 0.32);
            vec2 cell = floor(vec2(atan(d.z, d.x) * 260.0, d.y * 260.0));
            float tw = 0.6 + 0.4 * sin(time * 2.0 + hash(cell) * 50.0);
            col += vec3(step(0.9935, hash(cell)) * stars * smoothstep(0.05, 0.4, d.y) * 1.5 * tw);
            if (aurora > 0.0) {
              float az = atan(d.z, d.x);
              float band = sin(az * 3.0 + time * 0.12) * 0.07 + sin(az * 7.0 - time * 0.2) * 0.035 + 0.3;
              float curtain = smoothstep(0.0, 0.05, d.y - band + 0.05) * smoothstep(0.32, 0.0, d.y - band);
              float rays = 0.55 + 0.45 * sin(az * 60.0 + sin(az * 9.0 + time * 0.5) * 3.0);
              vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.75, 0.3, 1.0), smoothstep(0.0, 0.25, d.y - band));
              col += ac * curtain * rays * aurora * 0.9;
            }
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    // Дальние вершины: кольцо гор, которое едет вместе с камерой
    this.peaks = new T.Group();
    this.peakMat = new T.MeshBasicMaterial({ color: "#9db8de", fog: false });
    this.peakSnow = new T.MeshBasicMaterial({ color: "#ffffff", fog: false });
    const peakRnd = rng(77);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + peakRnd() * 0.15;
      const h = 90 + peakRnd() * 150, w = 70 + peakRnd() * 80, dist = 820 + peakRnd() * 160;
      const cone = part(new T.ConeGeometry(1, 1, 5), this.peakMat, w, h, w);
      cone.position.set(Math.cos(a) * dist, h / 2 - 140, Math.sin(a) * dist);
      cone.rotation.y = peakRnd() * TAU;
      const cap = part(new T.ConeGeometry(1, 1, 5), this.peakSnow, w * 0.36, h * 0.36, w * 0.36);
      cap.position.set(cone.position.x, cone.position.y + h * 0.32 + 0.5, cone.position.z);
      cap.rotation.y = cone.rotation.y;
      this.peaks.add(cone, cap);
    }
    this.volcano = new T.Group();
    {
      const cone = part(new T.CylinderGeometry(0.18, 1, 1, 9), new T.MeshBasicMaterial({ color: "#3e2228", fog: false }), 260, 300, 260);
      cone.position.y = 10;
      const glow = part(GEO.cyl, lit("#ff6a2a", 2.4, { fog: false }), 48, 6, 48);
      glow.position.y = 162;
      this.volcano.add(cone, glow);
      this.volcano.visible = false;
      this.peaks.add(this.volcano);
    }
    scene.add(this.peaks);

    // ---------- Общие материалы ----------
    this.snowTex = snowTexture();
    this.snowMat = sparkle(new T.MeshStandardMaterial({ color: "#ffffff", map: this.snowTex, roughness: 0.82, metalness: 0 }), this.uniforms, 1);
    this.groundMat = sparkle(new T.MeshStandardMaterial({ vertexColors: true, map: this.snowTex, roughness: 0.9, metalness: 0 }), this.uniforms, 1);
    // свой материал у кома-снежка: ночью он чуть подсвечен и не сливается с тёмно-синим склоном
    this.ballSnowMat = sparkle(new T.MeshStandardMaterial({ color: "#ffffff", map: this.snowTex, roughness: 0.82, metalness: 0 }), this.uniforms, 1);
    this.pileMat = sparkle(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }), this.uniforms, 1.4);
    this.decorMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    this.iceMat = new T.MeshStandardMaterial({ color: "#bff0ff", roughness: 0.15, metalness: 0.1, envMap: this.env, envMapIntensity: 1.2, emissive: "#3aa0d8", emissiveIntensity: 0.25, flatShading: true });
    this.woodMat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });
    this.flakeMat = new T.MeshBasicMaterial({ map: flakeTexture(), transparent: true, depthWrite: false, color: hot("#ffffff", 1.5), toneMapped: false, side: T.DoubleSide });
    this.crackMat = new T.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.shadowMat = new T.MeshBasicMaterial({ map: glowTexture, color: "#1a2a50", transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.bricks = bricksTexture();
    this.bricks.repeat.set(4, 1);
    this.geo = { fir: firGeometry(), spire: spireGeometry(), rock: rockGeometry(), pile: pileGeometry(), ramp: rampGeometry() };

    // ---------- Ком: катящееся тело и Снежок — шапка, шарф и лицо, которые держатся прямо ----------
    this.ball = new T.Group();
    this.ballMesh = new T.Mesh(skinGeometry("snow"), this.snowMat);
    // тонкий контур: ком читается даже на белом снегу
    this.outline = new T.Mesh(new T.SphereGeometry(1, 32, 20), new T.MeshBasicMaterial({ color: "#2a4f8f", side: T.BackSide }));
    this.outline.scale.setScalar(1.035);
    this.hero = new Hero();
    this.ball.add(this.ballMesh, this.outline, this.hero.root);
    this.ballMesh.castShadow = true;
    this.glance = { t: 0, mood: "joy" }; // оглянуться на игрока в яркий момент
    this.showT = 0; // сколько камера уже показывает Снежка спереди (финиш, неудача)
    this.ballShadow = part(GEO.plane, this.shadowMat, 1, 1, 1);
    this.ballShadow.rotation.x = -Math.PI / 2;
    scene.add(this.ball, this.ballShadow);
    this.skinCache = new Map();
    this.skin = -1;
    this.setSkin(0);
    this.roll = new T.Quaternion();
    this.rVis = 0.6;
    this.pop = 0;
    this.squash = 0;
    this.prev = { s: 0, x: 0 };
    // след: продавленная полоса за комом
    this.trailMax = 90;
    this.trail = [];
    const tg = new T.BufferGeometry();
    tg.setAttribute("position", new T.BufferAttribute(new Float32Array(this.trailMax * 2 * 3), 3).setUsage(T.DynamicDrawUsage));
    tg.setAttribute("color", new T.BufferAttribute(new Float32Array(this.trailMax * 2 * 4), 4).setUsage(T.DynamicDrawUsage));
    // нормали вверх: без них освещённый материал делит на ноль, и свечение заливает экран чёрным
    const up = new Float32Array(this.trailMax * 2 * 3);
    for (let i = 1; i < up.length; i += 3) up[i] = 1;
    tg.setAttribute("normal", new T.BufferAttribute(up, 3));
    const ti = [];
    for (let i = 0; i < this.trailMax - 1; i++) ti.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(ti);
    this.trailMesh = new T.Mesh(tg, new T.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.trailMesh.frustumCulled = false;
    scene.add(this.trailMesh);

    this.world = null;
    this.fx = createFx(scene);
    this.foes = new FoeView(this);
    this.tmp = V();
    this.tmp2 = V();
    this.tmp3 = V();
    this.dummy = new T.Object3D();
    this.camPos = V(0, 6, 12);
    this.camLook = V(0, 0, -10);

    // ---------- Свечение и цветокоррекция ----------
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, hurt: { value: 0 }, joy: { value: 0 }, flash: { value: 0 }, blur: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float hurt, joy, flash, blur;
        varying vec2 vUv;
        void main() {
          vec2 c = vUv - 0.5;
          float r2 = dot(c, c);
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          // лёгкое размытие на скорости: только по краям кадра, к центру
          if (blur > 0.001) {
            float k = blur * smoothstep(0.04, 0.3, r2);
            col = (col + texture2D(tDiffuse, vUv - c * k * 0.03).rgb + texture2D(tDiffuse, vUv - c * k * 0.06).rgb + texture2D(tDiffuse, vUv - c * k * 0.09).rgb) * 0.25;
          }
          // мягкий контраст в средних тонах и сочность; белый снег не пересвечивается
          col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, 1.16);
          // виньетка холодная, а не серая: края уходят в голубизну
          col *= mix(vec3(1.0), vec3(0.8, 0.88, 1.0), smoothstep(0.16, 0.62, r2));
          col = mix(col, vec3(1.0, 0.25, 0.3), hurt * smoothstep(0.08, 0.5, r2) * 0.55);
          col = mix(col, vec3(0.6, 0.9, 1.0), joy * smoothstep(0.1, 0.5, r2) * 0.35);
          // белая вспышка: снежная волна, победа над снеговиком
          col = mix(col, vec3(1.0), flash * 0.55);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.38, 0.35, 1.3);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
  }

  // ---------- Размер холста и качество ----------
  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.size = { w, h };
    this.aspect = w / h;
    const ratio = Math.min(devicePixelRatio || 1, this.perf.ratio, this.q.ratio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.camera.fov = this.aspect < 0.8 ? 66 : this.aspect < 1.3 ? 62 : 56;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }
  // Уровень качества: auto — по устройству, а если кадров меньше ~45 в секунду — ступенькой ниже
  setQuality(mode, start = "high") {
    const p = this.perf;
    p.auto = mode === "auto";
    this.applyTier(p.auto ? start : mode);
    p.seen = p.slow = 0;
  }
  applyTier(name) {
    const q = (this.q = TIERS[name] || TIERS.medium);
    const p = this.perf;
    p.tier = name;
    p.glow = q.glow;
    p.ratio = q.ratio;
    const shadows = q.shadows;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.sun.castShadow = shadows;
      this.scene.traverse((n) => n.material && (Array.isArray(n.material) ? n.material.forEach((m) => (m.needsUpdate = true)) : (n.material.needsUpdate = true)));
    }
    this.resize();
  }
  watch(frameMs) {
    const p = this.perf;
    if (frameMs === undefined || !p.auto || p.tier === "low" && p.ratio <= 1) return;
    p.seen++;
    if (frameMs > 22.5) p.slow++;
    if (p.seen >= 150) {
      if (p.slow > 75) {
        p.drops++;
        const next = ORDER[ORDER.indexOf(p.tier) + 1];
        if (next) this.applyTier(next);
        else (p.ratio = 0.85), this.resize();
      }
      p.seen = p.slow = 0;
    }
  }

  setSkin(index) {
    if (index === this.skin) return;
    this.skin = index;
    const id = SKINS[index]?.id || "snow";
    if (!this.skinCache.has(id)) this.skinCache.set(id, { geo: skinGeometry(id), mat: skinMaterial(id, this.env, this.ballSnowMat) });
    const { geo, mat } = this.skinCache.get(id);
    this.ballMesh.geometry = geo;
    this.ballMesh.material = mat;
    this.hero.dress(id);
    this.skinId = id;
  }

  // ---------- Тема горы ----------
  paint(m) {
    const th = THEMES[m];
    this.theme = th;
    this.scene.fog.color.set(th.fog);
    this.scene.background.set(th.fog);
    this.scene.fog.near = m === 2 ? 50 : m === 1 ? 95 : 70;
    this.scene.fog.far = m === 2 ? 210 : m === 1 ? 320 : 260;
    // экспозиция по горе: снег яркий, но белое не «выгорает» (тональная кривая сжимает верх мягко)
    this.renderer.toneMappingExposure = [1.1, 1.06, 1.0, 1.04][m];
    this.skyU.top.value.set(th.top);
    this.skyU.low.value.set(th.low);
    this.skyU.sun.value.set(th.sun);
    this.skyU.stars.value = th.stars;
    this.skyU.aurora.value = th.aurora;
    this.hemi.color.set(th.sky);
    this.hemi.groundColor.set(th.ground);
    this.hemi.intensity = th.amb;
    this.sun.color.set(th.sun);
    this.sun.intensity = th.sunPower;
    this.peakMat.color.set(th.peaks).lerp(new T.Color(th.fog), 0.35);
    this.peakSnow.color.set(m === 3 ? "#7a4a4a" : m === 2 ? "#5a6ea8" : "#f4f9ff").lerp(new T.Color(th.fog), 0.3);
    this.volcano.visible = m === 3;
    // Снежок ночью: наряд и снежное тело светятся чуть-чуть, чтобы читались на синем
    this.hero.setGlow(m === 2 ? 0.4 : 0);
    this.ballSnowMat.emissive.set(m === 2 ? "#3a4a78" : "#000000");
  }

  // ---------- Уровень: трасса, декорации, предметы, финал ----------
  load(level) {
    this.unload();
    this.level = level;
    const path = (this.path = new Path(level));
    this.paint(level.mountain);
    const world = (this.world = new T.Group());
    this.scene.add(world);
    this.disposables = [];
    this.buildGround(level, path, world);
    this.buildDecor(level, path, world);
    this.buildItems(level, path, world);
    this.foes.lines = null;
    this.foes.build(level, path, world);
    this.buildFinale(level, path, world);
    this.trail.length = 0;
    this.fx.clear();
    this.prev = { s: 0, x: 0 };
    this.rVis = radiusOf(5);
    this.roll.identity();
    this.ball.visible = true;
    this.shake = this.hurt = 0;
    this.glance.t = this.showT = 0;
    this.flow = 0;
    // шейдеры монстров и подборов собираются сразу, а не рывком при первой встрече
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {}
  }
  unload() {
    if (!this.world) return;
    this.scene.remove(this.world);
    for (const d of this.disposables) d.dispose();
    // общие материалы и заготовки геометрии остаются, всё остальное уровня — освобождается
    const keep = new Set([this.snowMat, this.ballSnowMat, this.groundMat, this.pileMat, this.decorMat, this.iceMat, this.woodMat, this.flakeMat, this.crackMat, this.shadowMat]);
    const mats = new Set();
    this.foes.disposeLabels();
    this.world.traverse((node) => {
      if (node.isInstancedMesh) node.dispose();
      if (node.isMesh && node.userData.own) node.geometry.dispose();
      if (node.material && !keep.has(node.material) && !keepFoeMaterial(node.material) && !keepSnowmanMaterial(node.material)) mats.add(node.material);
    });
    for (const w of this.walls || []) w.plaque.material.map?.dispose();
    this.boss?.sign.material.map?.dispose();
    for (const m of mats) m.dispose();
    this.world = null;
  }
  own(mesh) {
    mesh.userData.own = true;
    return mesh;
  }

  inGorge(s) {
    for (const b of this.level.bridges) if (s > b.s0 && s < b.s1) return true;
    return false;
  }
  buildGround(level, path, world) {
    const th = this.theme;
    const COLS = [-80, -56, -38, -26, -18, -13, -10.6, -9.4, -8.3, -7.5, -7, -4.7, -2.3, 0, 2.3, 4.7, 7, 7.5, 8.3, 9.4, 10.6, 13, 18, 26, 38, 56, 80];
    const BANK = { 7: 0, 7.5: 0.42, 8.3: 0.82, 9.4: 1.0, 10.6: 0.88 };
    const rows = [];
    for (let s = path.s0 + 2; s < path.s1 - 2; s += 2) rows.push(s);
    for (const b of level.bridges) rows.push(b.s0 - 0.4, b.s0 + 0.35, b.s1 - 0.35, b.s1 + 0.4);
    rows.sort((a, b) => a - b);
    const side = level.mountain === 1 ? 0.55 : 1;
    const height = (s, x) => {
      const ax = Math.abs(x);
      const gorge = this.inGorge(s);
      if (gorge && ax < 19) return -28 - noise1(s * 0.2 + x) * 3;
      if (ax <= 7) return 0;
      if (BANK[ax] !== undefined) return BANK[ax];
      const n = noise1(s * 0.025 + (x < 0 ? 0 : 50) + ax * 0.04);
      const k = ax - 10.6;
      let h = x < 0 ? 0.9 + k * 0.32 * side + n * k * 0.55 : 0.9 + k * 0.1 + n * k * 0.42 - (ax > 30 ? (ax - 30) * 0.25 : 0);
      if (level.mountain === 1 && ax > 12) h += (ax - 12) * 0.9; // стены ущелья
      if (gorge) h -= Math.max(0, 30 - (ax - 19) * 2.2);
      return h;
    };
    const cRoad = new T.Color(th.road), cBank = new T.Color(th.bank), cHill = new T.Color(th.hills), cFar = new T.Color(th.far), cDeep = new T.Color(th.fog).multiplyScalar(0.55);
    const cLava = new T.Color(level.mountain === 3 ? "#ff7a3a" : th.hills);
    const pos = [], col = [], uv = [], idx = [];
    const p = V(), c = new T.Color();
    for (const s of rows) {
      for (const x of COLS) {
        const h = height(s, x);
        path.frame(s, x, h, p);
        pos.push(p.x, p.y, p.z);
        const ax = Math.abs(x);
        if (ax <= 7) c.copy(cRoad);
        else if (ax <= 10.6) c.copy(cBank);
        else c.copy(cHill).lerp(cFar, clamp((ax - 13) / 60, 0, 1));
        if (level.mountain === 3 && ax > 13) c.lerp(cLava, noise1(s * 0.05 + x * 0.3) > 0.82 ? 0.6 : 0);
        if (h < -5) c.lerp(cDeep, clamp(-h / 30, 0, 1));
        // разметка полос по краям дороги
        if (ax > 6.6 && ax <= 7) c.multiplyScalar(0.94);
        col.push(c.r, c.g, c.b);
        uv.push(x / 6, s / 6);
      }
    }
    const W = COLS.length;
    for (let r = 0; r < rows.length - 1; r++)
      for (let k = 0; k < W - 1; k++) {
        const a = r * W + k, b = a + 1, d = a + W, e = d + 1;
        idx.push(a, b, d, b, e, d); // против часовой сверху: лицевая сторона смотрит вверх
      }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ground = this.own(new T.Mesh(g, this.groundMat));
    ground.receiveShadow = true;
    world.add(ground);
    this.height = height;
  }

  buildDecor(level, path, world) {
    const th = this.theme;
    const rnd = rng(level.seed);
    const m = level.mountain;
    const spots = [];
    const end = level.finale.end + 150;
    for (let s = -80; s < end; s += 2.6) {
      if (this.inGorge(s) || this.inGorge(s + 4) || this.inGorge(s - 4)) continue;
      for (const sideSign of [-1, 1]) {
        if (rnd() < 0.25) continue;
        const ax = 14 + Math.pow(rnd(), 1.5) * 55;
        const x = sideSign * ax;
        spots.push({ s: s + rnd() * 2.4, x, y: this.height(s, x), k: rnd(), turn: rnd() * TAU });
      }
    }
    const d = this.dummy;
    const instanced = (geo, mat, list, scaleOf, color) => {
      if (!list.length) return null;
      const mesh = new T.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => {
        path.frame(o.s, o.x, o.y - 0.15, d.position);
        d.rotation.set(0, o.turn, 0);
        const sc = scaleOf(o);
        d.scale.set(sc[0], sc[1], sc[2]);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        if (color) mesh.setColorAt(i, color(o));
      });
      mesh.computeBoundingSphere();
      world.add(mesh);
      return mesh;
    };
    const tint = new T.Color();
    const trees = [], rocks = [], spires = [];
    for (const o of spots) {
      if (m === 0 || m === 2) (o.k < 0.86 ? trees : rocks).push(o);
      else if (m === 1) (o.k < 0.55 ? spires : o.k < 0.8 ? trees : rocks).push(o);
      else (o.k < 0.7 ? rocks : trees).push(o);
    }
    const firGeo = m === 2 ? firGeometry("#1d4d4a", "#d6e2ff") : m === 3 ? firGeometry("#3a2a26", "#f6e4dc") : m === 1 ? firGeometry("#2f7f8f", "#eefbff") : this.geo.fir;
    if (firGeo !== this.geo.fir) this.disposables.push(firGeo);
    instanced(firGeo, this.decorMat, trees, (o) => {
      const near = clamp((Math.abs(o.x) - 13) / 20, 0.35, 1);
      const h = ((m === 3 ? 3 : 5) + o.k * 7) * near;
      return [h * 0.9, h, h * 0.9];
    }, () => tint.setScalar(0.85 + rnd() * 0.2));
    const rockGeo = m === 3 ? rockGeometry("#2e2424", "#4a3030", 9) : m === 1 ? rockGeometry("#6f9cc4", "#eefbff", 5) : this.geo.rock;
    if (rockGeo !== this.geo.rock) this.disposables.push(rockGeo);
    instanced(rockGeo, this.decorMat, rocks, (o) => {
      const r = 0.8 + o.k * 2.2;
      return [r, r * 0.75, r];
    }, () => tint.setScalar(0.9 + rnd() * 0.15));
    instanced(this.geo.spire, this.iceMat, spires, (o) => {
      const h = 6 + o.k * 18;
      return [h * 0.45, h, h * 0.45];
    });
    // вешки по краям трассы, как на лыжне: красные и синие флажки
    const poles = [];
    for (let s = 6; s < level.finale.s0; s += 11) for (const sx of [-1, 1]) if (!this.inGorge(s) && !this.inGorge(s + 2)) poles.push({ s, x: sx * (HALF + 0.75), y: 0.55, turn: 0, k: ((s / 11) | 0) % 2 });
    instanced(GEO.cyl, new T.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.5 }), poles, () => [0.06, 1.9, 0.06]);
    const flags = poles.map((o) => ({ ...o, y: o.y + 1.45 }));
    const flagMesh = instanced(GEO.box, new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }), flags, () => [0.05, 0.42, 0.62], (o) => tint.set(o.k ? "#ff4a5e" : "#2f8cff"));
    if (flagMesh) {
      flags.forEach((o, i) => {
        path.place(d, o.s, o.x, o.y, false);
        d.position.add(path.forward(o.s, this.tmp).multiplyScalar(0.3));
        d.scale.set(0.05, 0.42, 0.62);
        d.updateMatrix();
        flagMesh.setMatrixAt(i, d.matrix);
      });
    }
    // фонарики вдоль трассы ночью, лава у вулкана
    if (m === 2) {
      const lamps = [];
      for (let s = 10; s < level.finale.end; s += 16) for (const sx of [-1, 1]) if (!this.inGorge(s)) lamps.push({ s, x: sx * 9.9, y: 0.95, turn: 0, k: 0 });
      instanced(GEO.cyl, new T.MeshStandardMaterial({ color: "#3a2a2a", roughness: 0.7 }), lamps, () => [0.08, 2.4, 0.08]);
      const bulbs = lamps.map((o) => ({ ...o, y: o.y + 1.2 }));
      instanced(GEO.ball, lit("#ffcf7a", 2.6), bulbs, () => [0.24, 0.24, 0.24]);
    }
    if (m === 3) {
      const lava = [];
      for (let s = -40; s < end; s += 14) for (const sx of [-1, 1]) if (rnd() < 0.45 && !this.inGorge(s)) lava.push({ s, x: sx * (15 + rnd() * 30), y: 0, turn: rnd() * TAU, k: rnd() });
      for (const o of lava) o.y = this.height(o.s, o.x) + 0.12;
      // чуть ярче порога свечения: светится только сердцевина, без оранжевой дымки на весь экран
      const lavaMat = new T.MeshBasicMaterial({ map: glowTexture, color: hot("#ff6a1a", 1.45), transparent: true, depthWrite: false, toneMapped: false });
      this.disposables.push(lavaMat);
      const mesh = instanced(GEO.plane, lavaMat, lava, (o) => [5 + o.k * 7, 5 + o.k * 7, 1]);
      if (mesh) {
        lava.forEach((o, i) => {
          path.frame(o.s, o.x, o.y, d.position);
          d.rotation.set(-Math.PI / 2, 0, o.turn);
          d.scale.set(5 + o.k * 7, 3 + o.k * 5, 1);
          d.updateMatrix();
          mesh.setMatrixAt(i, d.matrix);
        });
      }
    }
  }

  buildItems(level, path, world) {
    const th = this.theme;
    const d = this.dummy;
    this.items = new Map(); // id → описание отрисовки
    const byType = {};
    for (const it of level.items) (byType[it.t] ||= []).push(it);
    const pool = (geo, mat, count) => {
      const mesh = new T.InstancedMesh(geo, mat, Math.max(1, count));
      mesh.count = count;
      world.add(mesh);
      return mesh;
    };
    const setAt = (mesh, i, s, x, y, sx, sy, sz, yaw = 0, tilt = true) => {
      path.place(d, s, x, y, tilt);
      d.rotation.y += yaw;
      d.scale.set(sx, sy, sz);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    };
    // снежинки
    const flakes = byType.flake || [];
    this.flakeMesh = pool(GEO.plane, this.flakeMat, flakes.length);
    this.flakeMesh.frustumCulled = false;
    this.flakes = flakes.map((it, i) => {
      const rec = { it, i, kind: "flake", pos: path.frame(it.s, it.x, it.y + 0.15) };
      this.items.set(it.id, rec);
      return rec;
    });
    // сугробики
    const piles = byType.pile || [];
    this.pileMesh = pool(this.geo.pile, this.pileMat, piles.length);
    piles.forEach((it, i) => {
      const k = 0.7 + Math.min(0.6, it.v / 40);
      setAt(this.pileMesh, i, it.s, it.x, -0.05, k, k, k, it.id);
      this.items.set(it.id, { it, i, kind: "pile", mesh: this.pileMesh, k });
    });
    // камни
    const rocks = byType.rock || [];
    const rockGeo = level.mountain === 3 ? rockGeometry("#3a2a2a", "#ff9a5a", 4) : level.mountain === 1 ? rockGeometry("#7aa6c8", "#f2fbff", 8) : level.mountain === 2 ? rockGeometry("#5a6488", "#dfe8ff", 2) : this.geo.rock;
    if (rockGeo !== this.geo.rock) this.disposables.push(rockGeo);
    this.rockMesh = pool(rockGeo, this.decorMat, rocks.length);
    rocks.forEach((it, i) => {
      setAt(this.rockMesh, i, it.s, it.x, -0.1, it.r * 1.15, it.r * 1.25, it.r * 1.15, it.id * 1.7);
      this.items.set(it.id, { it, i, kind: "rock", mesh: this.rockMesh, sx: it.r * 1.15, sy: it.r * 1.25 });
    });
    // заборы: столбики и жерди одним пулом
    const fenceColor = new T.Color(th.fence), fenceTop = new T.Color(th.fenceTop);
    const fenceParts = [];
    for (const it of byType.fence || []) {
      const from = fenceParts.length;
      const w = it.x1 - it.x0;
      const posts = Math.max(2, Math.round(w / 1.3) + 1);
      for (let k = 0; k < posts; k++) {
        const x = it.x0 + 0.12 + ((w - 0.24) * k) / (posts - 1);
        fenceParts.push({ it, x, y: 0.62, sx: 0.2, sy: 1.25, sz: 0.2, c: fenceColor });
        fenceParts.push({ it, x, y: 1.3, sx: 0.26, sy: 0.14, sz: 0.26, c: fenceTop });
      }
      for (const y of [0.45, 0.95]) fenceParts.push({ it, x: (it.x0 + it.x1) / 2, y, sx: w, sy: 0.18, sz: 0.1, c: fenceColor });
      fenceParts.push({ it, x: (it.x0 + it.x1) / 2, y: 1.06, sx: w, sy: 0.06, sz: 0.16, c: fenceTop });
      this.items.set(it.id, { it, kind: "fence", from, to: fenceParts.length });
    }
    this.fenceMesh = pool(GEO.box, level.mountain === 1 ? this.iceMat : this.woodMat, fenceParts.length);
    this.fenceParts = fenceParts;
    fenceParts.forEach((f, i) => {
      setAt(this.fenceMesh, i, f.it.s, f.x, f.y, f.sx, f.sy, f.sz);
      this.fenceMesh.setColorAt(i, f.c);
    });
    // ледяные шипы
    const spikeParts = [];
    for (const it of byType.spikes || []) {
      const from = spikeParts.length;
      for (let x = it.x0 + 0.3; x <= it.x1 - 0.2; x += 0.55)
        for (const ds of [-0.35, 0.3]) spikeParts.push({ it, x: x + (ds > 0 ? 0.27 : 0), s: it.s + ds, h: 0.8 + ((x * 7.3 + ds * 13) % 0.5) });
      this.items.set(it.id, { it, kind: "spikes", from, to: spikeParts.length });
    }
    this.spikeMesh = pool(GEO.cone, this.iceMat, spikeParts.length);
    this.spikeParts = spikeParts;
    spikeParts.forEach((p, i) => setAt(this.spikeMesh, i, p.s, p.x, p.h / 2, 0.24, p.h, 0.24));
    // трещины
    const holes = byType.hole || [];
    this.holeMesh = pool(GEO.plane, this.crackMat, holes.length);
    holes.forEach((it, i) => {
      path.place(d, it.s, it.x, 0.03);
      d.rotateX(-Math.PI / 2);
      d.rotateZ(it.id);
      d.scale.set(it.r * 2.3, it.r * 2.1, 1);
      d.updateMatrix();
      this.holeMesh.setMatrixAt(i, d.matrix);
      this.items.set(it.id, { it, i, kind: "hole" });
    });
    // трамплины
    const rampMat = new T.MeshStandardMaterial({ color: "#ffffff", map: canvasTexture(64, 128, (g) => {
      g.fillStyle = "#eaf6ff";
      g.fillRect(0, 0, 64, 128);
      g.fillStyle = "#3aa8ff";
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(32, 18 + k * 36);
        g.lineTo(54, 40 + k * 36);
        g.lineTo(10, 40 + k * 36);
        g.fill();
      }
    }), roughness: 0.4 });
    rampMat.map.wrapS = T.RepeatWrapping;
    this.disposables.push(rampMat, rampMat.map);
    for (const it of byType.ramp || []) {
      const mesh = new T.Mesh(this.geo.ramp, rampMat);
      path.place(mesh, it.s, (it.x0 + it.x1) / 2, 0);
      mesh.scale.set(it.x1 - it.x0, 1.0, it.len);
      mesh.position.add(path.forward(it.s, this.tmp).multiplyScalar(-it.len / 2));
      rampMat.map.repeat.set(Math.max(1, Math.round((it.x1 - it.x0) / 2)), 1);
      world.add(mesh);
    }
    // брёвна
    this.logs = [];
    const logMat = new T.MeshStandardMaterial({ color: level.mountain === 1 ? "#9fd8f0" : level.mountain === 3 ? "#3a2a26" : "#8b5a34", roughness: 0.85, map: canvasTexture(128, 32, (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 128, 32);
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.moveTo(0, 4 + k * 4.4);
        g.lineTo(128, 4 + k * 4.4 + (k % 2 ? 2 : -2));
        g.stroke();
      }
    }) });
    this.disposables.push(logMat, logMat.map);
    for (const it of byType.log || []) {
      const group = new T.Group();
      const log = part(GEO.cyl, logMat, 0.6, it.len, 0.6);
      log.rotation.x = Math.PI / 2;
      const spin = new T.Group();
      spin.add(log);
      for (const z of [-it.len / 2, it.len / 2]) {
        const end = part(GEO.cyl, new T.MeshStandardMaterial({ color: "#d9b07a", roughness: 0.8 }), 0.56, 0.05, 0.56);
        end.rotation.x = Math.PI / 2;
        end.position.z = z;
        spin.add(end);
      }
      spin.position.y = 0.6;
      const shadow = part(GEO.plane, this.shadowMat, 1.8, it.len + 0.8, 1);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.04;
      group.add(spin, shadow);
      world.add(group);
      const rec = { it, kind: "log", group, spin };
      this.logs.push(rec);
      this.items.set(it.id, rec);
    }
    // ледяные прессы: рама на ряд и блоки
    this.crushers = [];
    const rowsAt = new Map();
    for (const it of byType.crusher || []) (rowsAt.get(it.s) || rowsAt.set(it.s, []).get(it.s)).push(it);
    const frameMat = new T.MeshStandardMaterial({ color: level.mountain === 3 ? "#3a2c2c" : "#5a6a8a", roughness: 0.6, metalness: 0.3 });
    this.disposables.push(frameMat);
    for (const [s, list] of rowsAt) {
      const gantry = new T.Group();
      path.place(gantry, s, 0, 0);
      for (const sx of [-1, 1]) gantry.add(at(part(GEO.box, frameMat, 0.7, 6.6, 0.9), sx * (HALF + 0.6), 3.3, 0));
      gantry.add(at(part(GEO.box, frameMat, HALF * 2 + 2, 0.6, 1.1), 0, 6.6, 0));
      world.add(gantry);
      for (const it of list) {
        const w = it.x1 - it.x0;
        const block = new T.Group();
        const ice = part(GEO.box, this.iceMat, w, 2.0, it.len);
        ice.position.y = 1.0;
        const teeth = part(GEO.box, lit("#ff5a6a", 1.3), w * 0.96, 0.12, it.len * 0.96);
        teeth.position.y = 0.06;
        const rod = part(GEO.cyl, frameMat, 0.14, 6, 0.14);
        rod.position.y = 5;
        block.add(ice, teeth, rod);
        block.position.x = (it.x0 + it.x1) / 2;
        gantry.add(block);
        const shadow = part(GEO.plane, this.shadowMat.clone(), w * 1.1, it.len * 1.2, 1);
        this.disposables.push(shadow.material);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set((it.x0 + it.x1) / 2, 0.05, 0);
        gantry.add(shadow);
        const rec = { it, kind: "crusher", block, shadow, low: false };
        this.crushers.push(rec);
        this.items.set(it.id, rec);
      }
    }
    // гейзеры
    this.geysers = [];
    const ventMat = new T.MeshStandardMaterial({ color: "#3a2a2a", roughness: 0.8 });
    const steamMat = new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false, map: canvasTexture(64, 256, (g) => {
      // мягкая струя пара: ярче у земли, тает кверху
      for (let y = 0; y < 256; y++) {
        const k = 1 - y / 256;
        const grad = g.createLinearGradient(0, 0, 64, 0);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, `rgba(255,255,255,${(0.15 + 0.85 * (1 - k) ** 1.5).toFixed(3)})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(0, y, 64, 1);
      }
    }) });
    this.disposables.push(steamMat.map);
    this.disposables.push(ventMat, steamMat);
    for (const it of byType.geyser || []) {
      const group = new T.Group();
      path.place(group, it.s, it.x, 0, false);
      const ring = part(new T.TorusGeometry(1, 0.28, 8, 18), ventMat, it.r * 0.9);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      const pool = part(GEO.cyl, lit("#ff7a2a", 1.4), it.r * 0.8, 0.06, it.r * 0.8);
      pool.position.y = 0.08;
      const column = part(GEO.plane, steamMat, it.r * 2.4, 8, 1);
      column.position.y = 4;
      column.visible = false;
      group.add(ring, pool, column);
      world.add(group);
      this.disposables.push(ring.geometry);
      const rec = { it, kind: "geyser", group, pool, column, state: 0 };
      this.geysers.push(rec);
      this.items.set(it.id, rec);
    }
    // ворота
    this.gates = [];
    for (const it of level.gates) {
      const model = gateModel(it, it.panels.map((p) => gateLabel(p.op)));
      path.place(model, it.s, 0, 0, false);
      world.add(model);
      const rec = { it, kind: "gate", model, passed: -1, fade: 0 };
      this.gates.push(rec);
      this.items.set(it.id, rec);
    }
    // мосты: доски и перила
    const planks = [];
    for (const b of level.bridges) for (let s = b.s0 - 0.3; s <= b.s1 + 0.3; s += 0.9) planks.push(s);
    const plankMat = new T.MeshStandardMaterial({ color: level.mountain === 3 ? "#5a3a2a" : "#a8743e", roughness: 0.85 });
    this.disposables.push(plankMat);
    if (planks.length) {
      const mesh = pool(GEO.box, plankMat, planks.length);
      planks.forEach((s, i) => setAt(mesh, i, s, 0, -0.12, BRIDGE_HALF * 2 + 0.8, 0.24, 0.78, (i % 3) * 0.02 - 0.02));
      const postsList = [];
      for (const b of level.bridges) for (let s = b.s0; s <= b.s1; s += 4) for (const sx of [-1, 1]) postsList.push({ s, x: sx * (BRIDGE_HALF + 0.3) });
      const posts = pool(GEO.cyl, plankMat, postsList.length);
      postsList.forEach((p, i) => setAt(posts, i, p.s, p.x, 0.55, 0.09, 1.1, 0.09, 0, false));
      const ropes = [];
      for (const b of level.bridges) for (const sx of [-1, 1]) ropes.push({ s: (b.s0 + b.s1) / 2, x: sx * (BRIDGE_HALF + 0.3), len: b.s1 - b.s0 });
      const ropeMesh = pool(GEO.box, new T.MeshStandardMaterial({ color: "#e8d6b0", roughness: 0.9 }), ropes.length);
      ropes.forEach((r, i) => setAt(ropeMesh, i, r.s, r.x, 1.05, 0.07, 0.07, r.len));
      // под мостом — опоры, уходящие в пропасть
      const piers = [];
      for (const b of level.bridges) for (let s = b.s0 + 6; s < b.s1 - 3; s += 12) piers.push(s);
      const pierMesh = pool(GEO.box, plankMat, piers.length * 2);
      piers.forEach((s, i) => {
        setAt(pierMesh, i * 2, s, -BRIDGE_HALF + 0.4, -14, 0.4, 28, 0.4, 0, false);
        setAt(pierMesh, i * 2 + 1, s, BRIDGE_HALF - 0.4, -14, 0.4, 28, 0.4, 0, false);
      });
    }
  }

  buildFinale(level, path, world) {
    const F = level.finale;
    const m = level.mountain;
    this.walls = [];
    this.boss = null;
    const wallMat = new T.MeshStandardMaterial({ color: m === 3 ? "#ffd6c8" : m === 2 ? "#cfdcff" : "#e6f8ff", map: this.bricks, roughness: 0.35, metalness: 0.05, envMap: this.env, envMapIntensity: 0.6 });
    this.disposables.push(wallMat);
    if (F.kind === "fortress") {
      F.walls.forEach((w, k) => {
        const group = new T.Group();
        path.place(group, w.s, 0, 0, false);
        const height = 3.4 + k * 0.35;
        const body = part(GEO.box, wallMat, HALF * 2 + 3.2, height, 1.3);
        body.position.y = height / 2;
        body.castShadow = true;
        group.add(body);
        for (let c = -HALF - 1.2; c <= HALF + 1.3; c += 1.6) group.add(at(part(GEO.box, wallMat, 0.9, 0.7, 1.4), c, height + 0.35, 0));
        // табличка с прочностью стоит на зубцах: выше кома и числа над ним
        const plaque = new T.Mesh(GEO.plane, new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
        plaque.scale.set(3.0, 1.5, 1);
        plaque.position.set(0, height + 1.45, 0.25);
        plaque.renderOrder = 3;
        group.add(plaque);
        world.add(group);
        const rec = { w, k, group, plaque, shown: -1, height };
        this.walls.push(rec);
        this.paintWall(rec, w.hp);
      });
    } else {
      const boss = snowmanModel(m);
      const scale = 1 + m * 0.12;
      boss.scale.setScalar(scale);
      path.place(boss, F.boss.s + 2, 0, 0, false);
      boss.rotation.y += Math.PI; // смотрит на игрока
      boss.traverse((n) => n.isMesh && (n.castShadow = true));
      world.add(boss);
      const sign = new T.Mesh(GEO.plane, new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      sign.scale.set(5.2, 2.6, 1);
      sign.renderOrder = 4;
      world.add(sign);
      this.boss = { model: boss, sign, scale, hp: F.boss.hp, shown: -1, down: false, laugh: 0 };
      this.paintBoss(F.boss.hp);
    }
    // ступени ×1…×10
    const B = F.bonus;
    const colors = ["#5ab8ff", "#4ad0e8", "#46dcb0", "#7ce06a", "#c6e24a", "#ffd23a", "#ffb02e", "#ff8a3a", "#ff5a6a", "#e84aff"];
    this.steps = [];
    for (let k = 0; k < B.steps; k++) {
      const s = B.s + k * B.len + B.len / 2;
      const tex = canvasTexture(256, 128, (g) => {
        g.fillStyle = colors[k];
        g.fillRect(0, 0, 256, 128);
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(0, 0, 256, 14);
        g.font = '900 78px "Trebuchet MS", system-ui, sans-serif';
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineWidth = 12;
        g.strokeStyle = "rgba(0,0,0,0.28)";
        g.strokeText("×" + (k + 1), 128, 68);
        g.fillStyle = "#ffffff";
        g.fillText("×" + (k + 1), 128, 68);
      });
      const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.45, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.12 });
      this.disposables.push(tex, mat);
      const tile = new T.Mesh(GEO.box, mat);
      path.place(tile, s, 0, 0.06);
      tile.scale.set(HALF * 2, 0.14, B.len - 0.15);
      world.add(tile);
      // столбики по краям ступени
      for (const sx of [-1, 1]) {
        const post = part(GEO.box, new T.MeshStandardMaterial({ color: colors[k], roughness: 0.4 }), 0.5, 1.4 + k * 0.25, 0.5);
        this.disposables.push(post.material);
        path.place(post, s - B.len / 2 + 0.3, sx * (HALF + 0.4), 0.7 + k * 0.12, false);
        world.add(post);
      }
      this.steps.push({ tile, mat, lit: 0 });
    }
    // арка в конце
    const arch = new T.Group();
    path.place(arch, B.s + B.len * B.steps + 2, 0, 0, false);
    const archMat = new T.MeshStandardMaterial({ color: "#ffd23a", roughness: 0.3, metalness: 0.4, envMap: this.env, emissive: "#ff9a2a", emissiveIntensity: 0.25 });
    this.disposables.push(archMat);
    for (const sx of [-1, 1]) arch.add(at(part(GEO.cyl, archMat, 0.45, 7, 0.45), sx * (HALF + 0.5), 3.5, 0));
    const top = part(new T.TorusGeometry(HALF + 0.5, 0.45, 8, 24, Math.PI), archMat, 1);
    top.position.y = 7;
    this.disposables.push(top.geometry);
    arch.add(top);
    world.add(arch);
  }
  paintWall(rec, left) {
    if (rec.shown === left) return;
    rec.shown = left;
    rec.plaque.material.map?.dispose();
    rec.plaque.material.map = signTexture(String(left));
    rec.plaque.material.needsUpdate = true;
  }
  paintBoss(hp) {
    const b = this.boss;
    if (b.shown === hp) return;
    b.shown = hp;
    b.sign.material.map?.dispose();
    b.sign.material.map = labelTexture(String(hp), { color: "#ffe27a", stroke: "#5a1424", size: 104 });
    b.sign.material.needsUpdate = true;
  }

  // ---------- Видимость предметов после подбора и ударов ----------
  hide(id, hidden = true) {
    const rec = this.items.get(id);
    if (!rec) return;
    const d = this.dummy;
    const it = rec.it;
    const path = this.path;
    if (rec.kind === "flake") rec.hidden = hidden;
    else if (rec.kind === "pile" || rec.kind === "rock") {
      if (hidden) d.scale.setScalar(0), d.position.set(0, -999, 0), d.rotation.set(0, 0, 0);
      else {
        path.place(d, it.s, it.x, rec.kind === "pile" ? -0.05 : -0.1);
        d.rotation.y += rec.kind === "pile" ? it.id : it.id * 1.7;
        if (rec.kind === "pile") d.scale.setScalar(rec.k);
        else d.scale.set(rec.sx, rec.sy, rec.sx);
      }
      d.updateMatrix();
      rec.mesh.setMatrixAt(rec.i, d.matrix);
      rec.mesh.instanceMatrix.needsUpdate = true;
    } else if (rec.kind === "fence" || rec.kind === "spikes") {
      const mesh = rec.kind === "fence" ? this.fenceMesh : this.spikeMesh;
      const parts = rec.kind === "fence" ? this.fenceParts : this.spikeParts;
      for (let i = rec.from; i < rec.to; i++) {
        const p = parts[i];
        if (hidden) d.scale.setScalar(0), d.updateMatrix();
        else {
          path.place(d, p.s ?? it.s, p.x, p.y ?? p.h / 2);
          if (rec.kind === "fence") d.scale.set(p.sx, p.sy, p.sz);
          else d.scale.set(0.24, p.h, 0.24);
          d.updateMatrix();
        }
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    rec.gone = hidden;
  }
  // после «Продолжить» предметы возвращаются такими, какими были на контрольной точке
  resync(run) {
    for (const [id, rec] of this.items) {
      if (rec.kind === "gate" || rec.kind === "log" || rec.kind === "crusher" || rec.kind === "geyser" || rec.kind === "hole") continue;
      const used = !!run.used[id];
      if (!!rec.gone !== used || rec.kind === "flake") this.hide(id, used);
    }
    this.foes.resync(run);
    for (const g of this.gates) {
      if (!run.used[g.it.id]) {
        g.passed = -1;
        g.fade = 0;
        g.model.visible = true;
        for (const p of g.model.userData.panels) (p.mat.opacity = 1), (p.label.material.opacity = 1);
      }
    }
    this.trail.length = 0;
  }

  // ---------- События заезда ----------
  event(e, run) {
    const fx = this.fx;
    const r = this.rVis;
    const bp = this.path.frame(run.s, run.x, run.y + r, this.tmp.clone());
    const fwd = this.path.forward(run.s, this.tmp2.clone());
    // монстры, подборы и пушка — у своей части сцены
    if (FOE_EVENTS.has(e.type)) {
      this.foes.event(e, run);
      if (e.type === "pow" && e.wall !== undefined) this.paintWall(this.walls[e.wall], e.left);
      if (e.type === "kill" && e.how === "bite") fx.puff(RING, bp, null, r, r * 2.6, 0.35, tone("#ff6a7a", 2), 0.8);
      return;
    }
    if (e.type === "bite" || e.type === "drain") {
      this.hurt = Math.max(this.hurt, e.type === "bite" ? 0.7 : 0.35);
      if (e.type === "bite") this.squash = 0.4;
      return;
    }
    if (e.type === "chase") {
      this.shake = Math.max(this.shake, 0.7);
      this.glanceAt("surprised", 0.9);
      return;
    }
    if (e.type === "chase-end") {
      if (e.caught) {
        this.shake = 1.3;
        this.flash = 0.8;
        this.hurt = 1;
        this.hero.react(1.6);
        for (let k = 0; k < 3; k++) fx.debris(this.path.frame(run.s - 2, rand(-5, 5), 3), ["#ffffff", "#eef6ff", "#dfeaff"], 26, 12, 0.55, { up: 0.5, life: 1.6, floor: bp.y - r, dir: fwd.clone().multiplyScalar(12) });
        for (let i = 0; i < 16; i++) fx.puff(PUFF, this.path.frame(run.s + rand(-3, 6), rand(-6, 6), rand(0, 4)), V(rand(-2, 2), rand(0, 3), 0).addScaledVector(fwd, 8), 1.4, 3.6, 1.2, tone(this.theme.dust, 1), 0.9, tone(this.theme.dust2, 1), 1.2);
      } else {
        this.joy = 1;
        this.glanceAt("joy", 1);
        fx.burst(bp, ["#ffe27a", "#ffffff", "#7fd0ff"], 40, 14, 0.18);
      }
      return;
    }
    if (e.type === "flake") {
      const rec = this.items.get(e.id);
      if (rec) {
        this.hide(e.id);
        fx.puff(STAR, rec.pos, null, 0.5, 1.4, 0.35, tone("#9fe0ff", 2.2), 1);
        fx.burst(rec.pos, ["#bfeaff", "#ffffff"], 5, 5, 0.12);
      }
    } else if (e.type === "pile") {
      this.hide(e.id);
      this.pop = Math.max(this.pop, 0.5);
      const rec = this.items.get(e.id);
      const p = this.path.frame(rec.it.s, rec.it.x, 0.4);
      for (let i = 0; i < 5; i++) fx.puff(PUFF, p, V(rand(-2, 2), rand(1, 3), rand(-2, 2)), 0.4, 1.3, 0.6, tone(this.theme.dust, 1), 0.8, tone(this.theme.dust2, 1), 2);
      fx.debris(p, ["#ffffff", "#eef6ff"], 6, 4, 0.18, { up: 1, life: 0.8, floor: p.y - 0.4 });
    } else if (e.type === "gate") {
      const g = this.items.get(e.id);
      if (g) {
        g.passed = e.panel;
        g.fade = 1;
      }
      this.pop = 1;
      if (e.good) {
        this.joy = 1;
        this.hero.react(0.8);
        if (e.op.k === "*" || e.after >= e.before * 1.8) this.glanceAt("joy", 0.95);
        else this.hero.say("joy", 0.8);
        fx.puff(RING, bp, null, r * 1.2, r * 4.5, 0.5, tone("#7fd0ff", 2.2), 0.9);
        fx.burst(bp, ["#7fd0ff", "#ffffff", "#ffe27a"], 22, 12, 0.16);
      } else {
        this.hurt = 0.8;
        this.hero.react(1);
        this.glanceAt("surprised", 0.75);
        fx.puff(RING, bp, null, r * 1.2, r * 3.5, 0.45, tone("#ff6a7a", 2), 0.8);
        fx.debris(bp, ["#ffffff", "#e6f0ff"], 14, 7, 0.22 * r, { up: 0.5, life: 1.0, floor: bp.y - r - 0.2 });
      }
    } else if (e.type === "hit") {
      const rec = this.items.get(e.id);
      this.shake = Math.max(this.shake, e.kind === "hole" || e.kind === "crusher" ? 0.9 : 0.6);
      this.hurt = 1;
      this.squash = 0.5;
      this.hero.react(1.2);
      this.glanceAt("surprised", 0.7);
      fx.debris(bp, ["#ffffff", "#f2f8ff", "#dfeaff"], 16, 8, 0.22 * r, { up: 0.6, life: 1.2, floor: bp.y - r - 0.1, dir: fwd.clone().multiplyScalar(4) });
      for (let i = 0; i < 6; i++) fx.puff(PUFF, bp, V(rand(-3, 3), rand(0, 3), rand(-3, 3)), r * 0.6, r * 1.8, 0.7, tone(this.theme.dust, 1), 0.75, tone(this.theme.dust2, 1), 2.5);
      if (rec) {
        const it = rec.it;
        const p = this.path.frame(it.s, it.x ?? run.x, 0.6);
        if (it.t === "rock") {
          this.hide(e.id);
          fx.debris(p, [this.theme.rock, "#ffffff"], 12, 7, it.r * 0.5, { up: 0.8, life: 1.6, floor: p.y - 0.6 });
        } else if (it.t === "fence") {
          this.hide(e.id);
          fx.debris(this.path.frame(it.s, run.x, 0.8), [this.theme.fence, this.theme.fenceTop], 14, 8, 0.45, { up: 0.9, life: 1.6, floor: p.y - 0.6, flat: true, dir: fwd.clone().multiplyScalar(5) });
        } else if (it.t === "spikes") {
          this.hide(e.id);
          fx.debris(this.path.frame(it.s, run.x, 0.5), ["#bff0ff", "#ffffff", "#7fd6ff"], 18, 7, 0.25, { up: 0.9, life: 1.3, floor: p.y - 0.5 });
        } else if (it.t === "geyser") {
          for (let i = 0; i < 5; i++) fx.puff(PUFF, p, V(rand(-1, 1), rand(5, 9), rand(-1, 1)), 0.6, 1.8, 0.8, tone("#ffffff", 1), 0.6, tone("#ffd2c0", 1), 1);
        } else if (it.t === "hole") {
          fx.debris(bp, ["#7fd6ff", "#ffffff"], 10, 5, 0.2, { up: 1.2, life: 1, floor: bp.y - r - 0.3 });
        }
      }
    } else if (e.type === "jump") {
      for (let i = 0; i < 6; i++) fx.puff(PUFF, bp, V(rand(-2, 2), rand(0, 2), rand(-2, 2)), r * 0.5, r * 1.5, 0.55, tone(this.theme.dust, 1), 0.7, tone(this.theme.dust2, 1), 2);
    } else if (e.type === "land") {
      this.squash = 0.45;
      this.shake = Math.max(this.shake, 0.25);
      const p = this.path.frame(run.s, run.x, 0.2);
      fx.puff(RING, p, null, r, r * 3.4, 0.45, tone(this.theme.dust, 1.1), 0.6);
      for (let i = 0; i < 8; i++) fx.puff(PUFF, p, V(rand(-4, 4), rand(0.5, 2), rand(-4, 4)), r * 0.5, r * 1.6, 0.7, tone(this.theme.dust, 1), 0.7, tone(this.theme.dust2, 1), 3);
    } else if (e.type === "melt") {
      // ком рассыпается, остаётся крошечный оглушённый Снежок
      this.rVis = radiusOf(0) * 0.85;
      this.pop = 1;
      this.hero.react(1.6);
      this.shake = 1;
      fx.debris(bp, ["#ffffff", "#eef6ff", "#dfeaff"], 40, 9, 0.3 * Math.max(0.7, r), { up: 0.8, life: 1.8, floor: bp.y - r });
      for (let i = 0; i < 12; i++) fx.puff(PUFF, bp, V(rand(-3, 3), rand(0, 4), rand(-3, 3)), r * 0.6, r * 2.4, 1.1, tone(this.theme.dust, 1), 0.85, tone(this.theme.dust2, 1), 1.8);
    } else if (e.type === "fall") {
      this.shake = 0.4;
      this.hero.say("surprised", 3);
    } else if (e.type === "finale") {
      this.glanceAt("determined", 0.8);
    } else if (e.type === "wall") {
      const w = this.walls[e.k];
      if (!w) return;
      this.hero.react(1);
      if (e.broke) {
        w.group.visible = false;
        const p = this.path.frame(w.w.s, 0, w.height / 2);
        this.shake = 1;
        this.joy = 0.6;
        for (let x = -HALF; x <= HALF; x += 3.5) fx.debris(this.path.frame(w.w.s, x, 1.5), ["#e6f8ff", "#bfeaff", "#ffffff"], 10, 11, 0.55, { up: 0.6, life: 1.8, floor: p.y - w.height / 2, dir: fwd.clone().multiplyScalar(9) });
        fx.burst(p, ["#bfeaff", "#ffffff"], Math.round(30 * this.q.dust), 16, 0.2);
        for (let i = 0; i < Math.round(10 * this.q.dust); i++) fx.puff(PUFF, this.path.frame(w.w.s, rand(-HALF, HALF), rand(0.5, 3)), V(rand(-2, 2), rand(1, 3), rand(-2, 2)), 1, 3, 1.1, tone(this.theme.dust, 1), 0.7, tone(this.theme.dust2, 1), 1.4);
        // ударная волна и вспышка: стена взрывается снегом
        fx.puff(GLOW, p, null, 9, 1, 0.3, tone("#ffffff", 2.4), 1);
        fx.puff(RING, this.path.frame(w.w.s, 0, 0.4), null, 1, 13, 0.55, tone("#bfeaff", 2.2), 1);
        for (let i = 0; i < Math.round(8 * this.q.dust); i++) fx.puff(STAR, this.path.frame(w.w.s, rand(-HALF, HALF), rand(1, 4)), V(rand(-3, 3), rand(2, 6), rand(-3, 3)), 0.4, 0.9, 0.9, tone("#ffe27a", 2.2), 1, tone("#ffffff", 1.4), 2);
        this.flash = Math.max(this.flash, 0.25);
      } else {
        this.paintWall(w, e.left);
        this.shake = 0.7;
        this.squash = 0.8;
        fx.debris(bp, ["#ffffff", "#eef6ff"], 18, 6, 0.25, { up: 0.8, life: 1.2, floor: bp.y - r });
      }
    } else if (e.type === "boss") {
      const b = this.boss;
      if (e.win) {
        b.down = true;
        b.model.visible = b.sign.visible = false;
        this.glanceAt("joy", 1.1);
        this.hero.react(1.4);
        this.shake = 1.4;
        this.joy = 1;
        const base = this.path.frame(this.level.finale.boss.s + 2, 0, 0);
        const snow = [this.theme.dust, "#ffffff", this.theme.dust2];
        for (let k = 0; k < 4; k++) fx.debris(this.path.frame(this.level.finale.boss.s + 4, rand(-3, 3), 2 + k * 2.6 * b.scale), snow, 14, 9, 0.42, { up: 0.9, life: 2.2, floor: base.y, dir: fwd.clone().multiplyScalar(9) });
        fx.debris(this.path.frame(this.level.finale.boss.s + 4, 0, 12 * b.scale), ["#ff8a1e", "#1d1f26", "#6b4a32"], 10, 8, 0.3, { up: 1.2, life: 2.2, floor: base.y, dir: fwd.clone().multiplyScalar(5) });
        for (let i = 0; i < 9; i++) fx.puff(PUFF, this.path.frame(this.level.finale.boss.s + 6, rand(-5, 5), rand(1, 10)), V(rand(-2, 2), rand(1, 3), 0).addScaledVector(fwd, 4), 1.5, 3.5, 1.3, tone(this.theme.dust, 1), 0.6, tone(this.theme.dust2, 1), 1);
        fx.burst(this.path.frame(this.level.finale.boss.s, 0, 6), ["#ffe27a", "#ffffff", "#7fd0ff"], 60, 22, 0.3);
        this.flash = 1;
      } else {
        b.laugh = 1.6;
        this.shake = 0.8;
        this.squash = 1;
      }
    } else if (e.type === "step") {
      const st = this.steps[e.k - 1];
      if (st) st.lit = 1;
      this.pop = 0.4;
      this.hero.react(0.4);
      fx.burst(bp, ["#ffe27a", "#ffffff"], 8, 7, 0.14);
    } else if (e.type === "won") {
      this.joy = 1;
      this.hero.react(1.2);
      for (let k = 0; k < 3; k++) fx.debris(this.path.frame(run.s + 3, rand(-4, 4), 7), ["#ff5a6a", "#ffd23a", "#5ab8ff", "#7ce06a", "#e84aff"], 30, 6, 0.32, { up: 1.4, life: 3.2, flat: true, flutter: 2 });
    } else if (e.type === "continue") {
      this.ball.visible = true;
      this.showT = 0;
      this.glanceAt("joy", 0.9);
      this.resync(run);
      fx.puff(RING, bp, null, r, r * 5, 0.8, tone("#ffe27a", 2.2), 1);
      fx.burst(bp, ["#ffe27a", "#ffffff"], 30, 10, 0.16);
    }
  }

  // снежок пушки разбил камень или забор
  smashItem(id, run) {
    const rec = this.items.get(id);
    if (!rec) return;
    const it = rec.it;
    const fwd = this.path.forward(run.s, V());
    this.hide(id);
    if (it.t === "rock") {
      const p = this.path.frame(it.s, it.x, 0.6);
      this.fx.debris(p, [this.theme.rock, "#ffffff"], 14, 8, it.r * 0.5, { up: 0.9, life: 1.6, floor: p.y - 0.6 });
      this.fx.puff(RING, p, null, 0.4, 3, 0.35, tone("#ffffff", 1.8), 0.9);
    } else {
      const p = this.path.frame(it.s, clamp(run.x, it.x0, it.x1), 0.8);
      this.fx.debris(p, [this.theme.fence, this.theme.fenceTop], 16, 8, 0.45, { up: 0.9, life: 1.6, floor: p.y - 0.8, flat: true, dir: fwd.multiplyScalar(6) });
    }
    this.onFoe?.("smash");
  }

  // оглянуться на игрока: лицо видно из-за спины
  glanceAt(mood, time) {
    this.glance.t = time;
    this.glance.mood = mood;
    this.hero.say(mood, time + 0.25);
  }

  // точка над комом на экране — для числа размера
  project(world, out) {
    const p = this.tmp2.copy(world).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.size.w;
    out.y = (-p.y * 0.5 + 0.5) * this.size.h;
    out.on = p.z < 1 && p.z > -1;
    return out;
  }

  // верх кома на экране: центр плюс радиус в пикселях (камера может смотреть сверху)
  ballTop(out) {
    const c = this.project(this.ball.position, {});
    const up = this.tmp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(this.rVis * 1.08).add(this.ball.position);
    const t = this.project(up, {});
    out.x = c.x;
    out.y = c.y - Math.hypot(t.x - c.x, t.y - c.y);
    out.on = c.on;
    return out;
  }

  // ---------- Кадр ----------
  draw(run, dt, mode, frameMs) {
    this.time += dt;
    const t = this.time;
    this.uniforms.uTime.value = t;
    const path = this.path;
    if (!path) return;
    const menu = mode === "menu";
    const level = this.level;
    const time = run.time;

    // ---------- ком ----------
    const goalR = radiusOf(run.size);
    this.rVis += (goalR - this.rVis) * Math.min(1, dt * 7);
    this.pop = Math.max(0, this.pop - dt * 3);
    this.squash = Math.max(0, this.squash - dt * 3.2);
    const r = this.rVis;
    const s = menu ? 0 : run.s;
    const x = menu ? 0 : run.x;
    const y = menu ? 0 : run.y;
    const bp = path.frame(s, x, y + r, this.ball.position);
    const ds = s - this.prev.s;
    const dx = x - this.prev.x;
    this.prev.s = s;
    this.prev.x = x;
    const rightAxis = path.right(s, this.tmp);
    const q = new T.Quaternion().setFromAxisAngle(rightAxis, -(menu ? 0 : ds) / r);
    this.roll.premultiply(q);
    const fwd = path.forward(s, this.tmp2);
    this.roll.premultiply(new T.Quaternion().setFromAxisAngle(fwd, dx / r));
    this.ballMesh.quaternion.copy(this.roll);
    const wob = this.pop * 0.12 * Math.sin(t * 30);
    const sq = this.squash * 0.18 * Math.sin(Math.min(1, this.squash) * Math.PI);
    this.ball.scale.set(r * (1 + wob + sq), r * (1 + wob - sq * 1.4), r * (1 + wob + sq));
    this.ball.position.y -= r * sq * 1.2;
    const ballBase = this.tmp3.copy(bp);
    // на финише Снежок радостно подпрыгивает
    if (!menu && run.mode === "won") this.ball.position.y += Math.abs(Math.sin(t * 5.2)) * r * 0.32;
    // тень
    const ground = path.frame(s, x, run.mode === "falling" ? -40 : 0.04, this.tmp);
    this.ballShadow.position.copy(ground);
    this.ballShadow.rotation.set(-Math.PI / 2 - PITCH, -path.heading(s), 0, "YXZ");
    const lift = Math.max(0, y);
    const shadowK = r * 2.6 * (1 + lift * 0.15);
    this.ballShadow.scale.set(shadowK, shadowK, 1);
    this.shadowMat.opacity = this.ball.visible ? clamp(0.42 - lift * 0.05, 0.12, 0.42) : 0;
    this.ballShadow.visible = run.mode !== "falling" && this.ball.visible;

    // ---------- след и снежная пыль ----------
    if (!menu && this.ball.visible && run.mode !== "falling") {
      const last = this.trail[this.trail.length - 1];
      if (!last || s - last.s > 0.45) {
        this.trail.push({ s, x, r, air: y > 0.15 || this.inGorge(s) });
        if (this.trail.length > this.trailMax) this.trail.shift();
      }
      if (ds > 0 && y < 0.1 && Math.random() < 0.6 * this.q.dust) {
        const p = path.frame(s - r * 0.6, x + rand(-r, r) * 0.6, 0.15);
        this.fx.puff(PUFF, p, V(rand(-1, 1), rand(0.6, 2), rand(-1, 1)), r * 0.18, r * 0.7, 0.5, tone(this.theme.dust, 1), 0.55, tone(this.theme.dust2, 1), 2);
      }
      if (Math.abs(run.vx) > 6 && y < 0.1) {
        const p = path.frame(s, x - Math.sign(run.vx) * r * 0.8, 0.2);
        const side = path.right(s, V()).multiplyScalar(-Math.sign(run.vx) * 3);
        this.fx.puff(PUFF, p, side.add(V(0, 2.5, 0)), r * 0.2, r * 0.8, 0.5, tone(this.theme.dust, 1), 0.6, tone(this.theme.dust2, 1), 1.5, 0, 6);
      }
    }
    this.drawTrail(path);

    // ---------- предметы ----------
    const d = this.dummy;
    const camQ = this.camera.quaternion;
    let n = 0;
    for (const f of this.flakes) {
      const it = f.it;
      if (f.hidden || it.s < s - 6 || it.s > s + 190) {
        if (f.shown !== false) {
          d.position.set(0, -999, 0);
          d.scale.setScalar(0);
          d.updateMatrix();
          this.flakeMesh.setMatrixAt(f.i, d.matrix);
          f.shown = false;
        }
        continue;
      }
      f.shown = true;
      d.position.copy(f.pos);
      d.position.y += Math.sin(t * 2.4 + it.id) * 0.12;
      d.quaternion.copy(camQ);
      d.rotateZ(t * 1.4 + it.id);
      const k = 0.85 + Math.sin(t * 5 + it.id * 2) * 0.08;
      d.scale.set(k, k, k);
      d.updateMatrix();
      this.flakeMesh.setMatrixAt(f.i, d.matrix);
      n++;
    }
    this.flakeMesh.instanceMatrix.needsUpdate = true;
    for (const rec of this.logs) {
      const lx = logX(rec.it, time);
      path.place(rec.group, rec.it.s, lx, 0);
      rec.spin.rotation.z = -lx / 0.6;
    }
    for (const rec of this.crushers) {
      const lift = crusherLift(rec.it, time);
      rec.block.position.y = lift * 4.6;
      rec.shadow.material.opacity = 0.2 + (1 - lift) * 0.45;
      const low = lift < 0.05;
      if (low && !rec.low && Math.abs(rec.it.s - s) < 30 && !menu) {
        this.fx.puff(RING, path.frame(rec.it.s, (rec.it.x0 + rec.it.x1) / 2, 0.2), null, 1, 3, 0.35, tone("#bfeaff", 1.4), 0.6);
        if (Math.abs(rec.it.s - s) < 14) this.shake = Math.max(this.shake, 0.15);
        this.onCrush?.();
      }
      rec.low = low;
    }
    for (const rec of this.geysers) {
      const st = geyserState(rec.it, time);
      rec.column.visible = st === 2;
      rec.pool.material.color.copy(tone("#ff7a2a", st === 1 ? 2.4 + Math.sin(t * 30) * 0.6 : st === 2 ? 2.6 : 1.1));
      if (Math.abs(rec.it.s - s) < 90) {
        const p = path.frame(rec.it.s, rec.it.x, 0.4);
        if (st === 1 && Math.random() < 0.3) this.fx.puff(PUFF, p, V(rand(-0.4, 0.4), rand(1, 2), rand(-0.4, 0.4)), 0.3, 0.9, 0.6, tone("#ffffff", 1), 0.5, tone("#ffd8c8", 1), 1);
        if (st === 2) {
          rec.column.scale.x = rec.it.r * (2.2 + Math.sin(t * 25) * 0.2);
          // струя всегда повёрнута к камере
          rec.column.rotation.y = Math.atan2(this.camera.position.x - rec.group.position.x, this.camera.position.z - rec.group.position.z) - rec.group.rotation.y;
          if (Math.random() < 0.5) this.fx.puff(PUFF, p, V(rand(-0.8, 0.8), rand(7, 11), rand(-0.8, 0.8)), 0.5, 1.5, 0.6, tone("#ffffff", 1), 0.6, tone("#ffe0d0", 1), 1);
        }
        if (st === 2 && rec.state !== 2 && Math.abs(rec.it.s - s) < 30) this.onSteam?.();
      }
      rec.state = st;
    }
    this.foes.update(run, dt, t, menu, camQ);
    for (const g of this.gates) {
      const panels = g.model.userData.panels;
      if (g.passed >= 0) {
        g.fade = Math.max(0, g.fade - dt * 2.8);
        panels.forEach((p, k) => {
          const chosen = k === g.passed;
          p.mat.opacity = chosen ? g.fade * g.fade : g.fade * g.fade * 0.5;
          p.label.material.opacity = chosen ? g.fade * g.fade : g.fade * g.fade * 0.4;
          if (chosen) p.label.scale.y = p.label.scale.x / 2 * (1 + (1 - g.fade) * 0.3);
        });
        if (g.fade <= 0) g.model.visible = false;
      } else {
        panels.forEach((p) => (p.mat.opacity = 0.93 + Math.sin(t * 3 + p.label.position.x) * 0.07));
      }
    }
    if (this.boss && !this.boss.down) {
      const b = this.boss;
      if (!menu) this.paintBoss(run.bossHp);
      const { body, head, arms } = b.model.userData;
      b.laugh = Math.max(0, b.laugh - dt);
      body.position.y = Math.abs(Math.sin(t * (b.laugh ? 14 : 2))) * (b.laugh ? 0.5 : 0.15);
      head.rotation.z = Math.sin(t * 1.3) * 0.08 + (b.laugh ? Math.sin(t * 20) * 0.12 : 0);
      arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * 2.4 + i) * 0.25 + (b.laugh ? 0.6 : 0))));
      path.frame(level.finale.boss.s - 1.6 * b.scale, 0, 4.4 * b.scale + Math.sin(t * 2) * 0.15, b.sign.position);
      b.sign.quaternion.copy(camQ);
    }
    // на крепости видна табличка только той стены, которую ком таранит сейчас
    for (const w of this.walls) w.plaque.visible = menu ? w.k === 0 : w.k === run.wall;
    for (const st of this.steps) {
      st.lit = Math.max(0, st.lit - dt * 0.4);
      st.mat.emissiveIntensity = 0.12 + st.lit * 0.9;
    }

    // ---------- падающий снег (гуще на высоком качестве) ----------
    for (let k = this.reduced ? 0 : this.theme.snowfall * this.q.snow; k > 0; k--) {
      if (k < 1 && Math.random() > k) break;
      const p = path.frame(s + rand(-6, 45), rand(-18, 18), rand(7, 16));
      this.fx.puff(GLOW, p, V(rand(-0.5, 0.5), -rand(1.2, 2.2), rand(-0.5, 0.5)), 0.07, 0.07, 5, tone("#ffffff", 1.05), 0.9);
    }
    // искрящиеся снежинки из-под кома
    if (!menu && run.mode === "run" && this.ball.visible && Math.random() < 0.25 * this.q.dust) {
      const p = path.frame(s - r * 0.4, x + rand(-r, r), rand(0.2, r * 1.4));
      this.fx.puff(STAR, p, V(rand(-1, 1), rand(1, 2.5), rand(-1, 1)), 0.12, 0.28, 0.6, tone("#dff6ff", 2.2), 0.9);
    }
    if (level.mountain === 3 && Math.random() < 0.35) {
      const p = path.frame(s + rand(0, 60), rand(-25, 25), rand(-1, 2));
      this.fx.puff(GLOW, p, V(rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5)), 0.08, 0.04, 3, tone("#ffb04a", 2.6), 0.9, tone("#ff4a10", 1.4));
    }
    this.fx.update(dt);

    // ---------- камера ----------
    this.shake = Math.max(0, this.shake - dt * 2);
    this.hurt = Math.max(0, this.hurt - dt * 2.4);
    this.joy = Math.max(0, this.joy - dt * 1.6);
    const tall = this.aspect < 0.8;
    const cam = this.camera;
    let back, up, ahead, side = 0;
    if (menu) {
      const a = t * 0.15;
      const wide = this.aspect > 1.3;
      back = wide ? 4.6 : 6.4;
      up = wide ? 1.75 : 3.0;
      ahead = 2.5;
      side = Math.sin(a) * 1.2 + (wide ? -2.6 : 0);
    } else {
      const zoom = tall ? 1.3 : this.aspect < 1.3 ? 1.15 : 1;
      back = (6.6 + r * 2.5) * zoom;
      up = (3.4 + r * 1.8) * zoom * (tall ? 1.25 : 1);
      ahead = (tall ? 17 : 9) + r * 2;
      if (run.mode === "finale" || run.mode === "won" || run.mode === "bounce") {
        const bossNear = level.finale.kind === "boss" && !this.boss?.down && run.mode !== "won";
        back += bossNear ? 7 : 3.5;
        up += bossNear ? 3.5 : 2.6;
        side = 2.4;
        this.lookUp = bossNear ? 3.5 : 0;
      } else this.lookUp = 0;
    }
    const camS = s - back;
    const goalPos = path.frame(camS, x * (menu ? 0 : 0.55) + side, up, V());
    if (run.mode === "falling") goalPos.copy(this.camPos);
    const tallMenu = menu && this.aspect <= 1.3;
    this.lookY += ((this.lookUp || 0) - (this.lookY || 0)) * Math.min(1, dt * 3) || 0;
    const look = path.frame(s + ahead, x * (menu ? 0 : 0.72) + (menu && !tallMenu ? -2.7 : 0), menu ? (tallMenu ? r - 1.6 : r + 0.4) : r * 0.6 + (this.lookY || 0), V());
    if (run.mode === "falling") look.copy(bp);
    // финиш и неудача: камера выходит вперёд и смотрит Снежку в лицо;
    // на широком экране он справа от панели, на высоком — над ней
    const show = !menu && (run.mode === "won" || run.mode === "bounce" || (run.mode === "fail" && run.failReason !== "fall"));
    this.showT = show ? this.showT + dt : 0;
    const showing = show && this.showT > (run.mode === "won" ? 0.5 : 0.2);
    if (showing) {
      const th = path.heading(s);
      const f = V(Math.sin(th), 0, -Math.cos(th));
      const rt = V(Math.cos(th), 0, Math.sin(th));
      const D = (run.mode === "won" ? 5.2 : 3.4) + r * 3.6;
      // сзади-сбоку: надписи на ступенях читаются, впереди арка и склон; Снежок оборачивается к нам
      const sideSign = x > 0.5 ? -1 : 1;
      goalPos.copy(ballBase).addScaledVector(f, -D * 0.74).addScaledVector(rt, sideSign * D * 0.5);
      goalPos.y += 0.4 + r * 0.4 + D * 0.3;
      look.copy(ballBase);
      look.y += r * 0.1;
      const dir = V().subVectors(look, goalPos).normalize();
      const camRight = V().crossVectors(dir, V(0, 1, 0)).normalize();
      if (this.aspect > 1.15) look.addScaledVector(camRight, -D * (this.aspect > 1.7 ? 0.44 : 0.36));
      else if (this.aspect < 0.8) look.y -= D * 0.36;
    }
    const k = this.snap ? 1 : Math.min(1, dt * (menu ? 2.5 : showing ? 2.4 : 6));
    this.snap = false;
    this.camPos.lerp(goalPos, k);
    this.camLook.lerp(look, Math.min(1, k * 1.4));
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    const jolt = this.reduced ? 0 : this.shake * this.shake;
    if (jolt > 0.001) {
      cam.position.x += Math.sin(t * 83) * jolt * 0.35;
      cam.position.y += Math.cos(t * 71) * jolt * 0.3;
      cam.rotation.z += Math.sin(t * 97) * jolt * 0.02;
    }
    this.drawHero(run, dt, menu, path, s);
    this.sky.position.copy(cam.position);
    this.peaks.position.set(cam.position.x, cam.position.y * 0.6, cam.position.z);
    // солнце светит сзади-сбоку, вместе с комом
    this.sun.position.copy(bp).add(V(-30, 60, 25));
    this.sun.target.position.copy(bp);
    this.grade.uniforms.hurt.value = this.hurt;
    this.grade.uniforms.joy.value = this.joy;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.grade.uniforms.flash.value = this.flash;
    const speedBlur = this.q.blur && !menu && run.mode === "run" ? clamp((run.v - 14) / 14, 0, 0.7) : 0;
    this.blurK = (this.blurK || 0) + (speedBlur - (this.blurK || 0)) * Math.min(1, dt * 4);
    this.grade.uniforms.blur.value = this.blurK;

    this.watch(frameMs);
    if (this.perf.glow) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // Снежок: куда смотрит, какое лицо, как летят хвосты шарфа
  drawHero(run, dt, menu, path, s) {
    const cam = this.camera.position;
    const b = this.ball.position;
    const th = path.heading(s);
    const vx = cam.x - b.x, vz = cam.z - b.z;
    const lx = vx * Math.cos(th) + vz * Math.sin(th); // вправо от трассы
    const lf = vx * Math.sin(th) - vz * Math.cos(th); // вперёд по трассе
    const toCam = Math.atan2(-lx, lf);
    const mode = menu ? "menu" : run.mode;
    let mood = "happy", yaw = 0, turn = 7, bob = 0, lean = 0, flow = 0, neck;
    if (mode === "menu") {
      yaw = toCam + Math.sin(this.time * 0.55) * 0.28;
      bob = 0.4;
    } else if (mode === "ready") {
      yaw = toCam * 0.92;
      bob = 1;
    } else if (mode === "won") {
      yaw = toCam;
      mood = "joy";
      turn = 5;
      neck = toCam + Math.PI + 1.25;
    } else if (mode === "fail" || mode === "bounce" || mode === "falling") {
      yaw = toCam;
      mood = run.failReason === "fall" || mode === "falling" ? "surprised" : "dizzy";
      turn = 6;
      neck = toCam + Math.PI + 1.25;
    } else {
      const F = this.level.finale;
      const smashing = mode === "finale" && run.rest === null && (F.kind === "fortress" ? run.wall < run.walls.length : !run.bossDown);
      mood = smashing ? "determined" : "happy";
      yaw = clamp(-run.vx * 0.035, -0.45, 0.45); // поглядывает туда, куда рулит
      lean = clamp(-run.vx * 0.016, -0.2, 0.2);
      flow = run.mode === "falling" ? 0 : clamp(run.v / 14, 0, 1);
      if (this.glance.t > 0) {
        yaw = toCam * 0.8;
        turn = 11;
      }
    }
    this.glance.t = Math.max(0, this.glance.t - dt);
    this.flow += (flow - this.flow) * Math.min(1, dt * 3);
    this.hero.root.rotation.set(0, -th, lean);
    this.hero.update({ t: this.time, dt, yaw, turn, mood, flow: this.flow, bob, neck });
  }

  drawTrail(path) {
    const pos = this.trailMesh.geometry.attributes.position.array;
    const col = this.trailMesh.geometry.attributes.color.array;
    const list = this.trail;
    const c = new T.Color(this.theme?.trail || "#bcd4f2");
    const p = this.tmp2;
    const rr = path.right(0, V());
    for (let i = 0; i < this.trailMax; i++) {
      const e = list[Math.min(i, list.length - 1)];
      if (!e) {
        pos.fill(0);
        col.fill(0);
        break;
      }
      path.right(e.s, rr);
      path.frame(e.s, e.x, 0.025, p);
      const w = e.r * 0.62;
      pos[i * 6] = p.x - rr.x * w;
      pos[i * 6 + 1] = p.y;
      pos[i * 6 + 2] = p.z - rr.z * w;
      pos[i * 6 + 3] = p.x + rr.x * w;
      pos[i * 6 + 4] = p.y;
      pos[i * 6 + 5] = p.z + rr.z * w;
      const a = i >= list.length || e.air ? 0 : Math.min(1, (i / list.length) * 1.6) * 0.5;
      for (const o of [0, 4]) {
        col[i * 8 + o] = c.r;
        col[i * 8 + o + 1] = c.g;
        col[i * 8 + o + 2] = c.b;
        col[i * 8 + o + 3] = a;
      }
    }
    this.trailMesh.geometry.attributes.position.needsUpdate = true;
    this.trailMesh.geometry.attributes.color.needsUpdate = true;
  }
}
export { THEMES };
