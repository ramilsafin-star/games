// Сцена «Грозового каньона»: стены и дно едут навстречу, истребитель стоит в плоскости z = 0.
// Правила (rules.js) ничего не знают о графике; здесь только то, что видно.
import { T, GEO, TAU, V, clamp, hot, lit, part, at, flare } from "./kit.js?v=ec8a7f9e";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=ec8a7f9e";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=ec8a7f9e";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=ec8a7f9e";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=ec8a7f9e";
import { ShaderPass } from "../vendor/three/postprocessing/ShaderPass.js?v=ec8a7f9e";
import { createFx, tone, GLOW, SMOKE, FIRE, RING, STAR } from "./fx.js?v=ec8a7f9e";
import { jet, wingman, enemyModels, enemyColor, pillar, arch, ridge, ringGate, GEM_GEO, gemMaterial, repairKit, capsule, CAPSULE_COLOR } from "./models.js?v=ec8a7f9e";
import { SCROLL, FAR } from "./rules.js?v=ec8a7f9e";

// Оформление зон по порядку. rock/rock2 — два оттенка скал, glow — цвет светящихся вкраплений (или null),
// rain/snow — осадки, lightning — молнии в небе.
const THEMES = [
  { top: "#2f66d0", low: "#ffb07a", fog: "#f0a273", rock: "#b0523a", rock2: "#de8a54", floor: "#c58454", lava: 0, sun: "#fff0c8", sunPower: 3.2, sky: "#ffdcc0", ground: "#7a3b2b", amb: 1.25, glow: null, stars: 0 },
  { top: "#081530", low: "#1b6c88", fog: "#14546a", rock: "#2c4667", rock2: "#44739a", floor: "#234a66", lava: 0, sun: "#bff4ff", sunPower: 2.3, sky: "#8fe6ff", ground: "#14263f", amb: 1.3, glow: "#58f0ff", stars: 0.3 },
  { top: "#1d2333", low: "#58677f", fog: "#4f5d76", rock: "#474f62", rock2: "#6b768c", floor: "#434e60", lava: 0, sun: "#dfe8ff", sunPower: 2.0, sky: "#b4c2dc", ground: "#2a3040", amb: 1.35, glow: null, stars: 0, rain: true, lightning: true },
  { top: "#2f69b8", low: "#cfeaff", fog: "#9fc7e2", rock: "#6a93bb", rock2: "#cfe8f8", floor: "#93bcd8", lava: 0, sun: "#ffffff", sunPower: 2.5, sky: "#dcefff", ground: "#56789e", amb: 1.25, glow: "#9ff0ff", stars: 0, snow: true },
  { top: "#240c10", low: "#c4421c", fog: "#8a2c16", rock: "#36201f", rock2: "#5e3029", floor: "#3a1a14", lava: 1, sun: "#ffb37a", sunPower: 2.4, sky: "#ffa060", ground: "#ff4a10", amb: 1.4, glow: "#ff8a2a", stars: 0, embers: true },
  { top: "#0e0824", low: "#57307e", fog: "#3a2462", rock: "#3a3060", rock2: "#5f4c92", floor: "#2f2550", lava: 0, sun: "#e0c4ff", sunPower: 2.1, sky: "#c4a8f4", ground: "#24183c", amb: 1.45, glow: "#c08aff", stars: 0.7, rain: true, lightning: true },
  { top: "#171a52", low: "#ff8fb0", fog: "#b287cc", rock: "#6a65a4", rock2: "#a094dc", floor: "#e6d2ff", lava: 0, sun: "#ffe6f2", sunPower: 2.8, sky: "#dccaff", ground: "#6a5a9a", amb: 1.45, glow: "#ffd27a", stars: 1, clouds: true },
];
const COLOR_KEYS = ["top", "low", "fog", "rock", "rock2", "floor", "sun", "sky", "ground"];
for (const theme of THEMES) {
  for (const key of COLOR_KEYS) theme[key] = new T.Color(theme[key]);
  theme.glowColor = new T.Color(theme.glow || "#000000");
}

function canvasTexture(size, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  paint(canvas.getContext("2d"), size);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}

// дно: светлые плиты с тёмными трещинами (цвет даёт материал) и карта жил для лавы
function floorTextures() {
  let seed = 99;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const cracks = [];
  for (let i = 0; i < 26; i++) {
    const path = [[random() * 256, random() * 256]];
    for (let j = 0; j < 6; j++) path.push([path[j][0] + (random() - 0.5) * 70, path[j][1] + (random() - 0.5) * 70]);
    cracks.push(path);
  }
  const draw = (ctx, base, line, width, blur) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = line;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.shadowColor = line;
    ctx.shadowBlur = blur;
    for (const path of cracks) {
      // рисуем с повторами по краям, чтобы плитка стыковалась
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        path.forEach(([x, y], k) => (k ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
        ctx.stroke();
      }
    }
  };
  const map = canvasTexture(256, ctx => {
    draw(ctx, "#ffffff", "#8d8d8d", 3, 0);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${random() * 0.1})`;
      ctx.fillRect(random() * 256, random() * 256, 2 + random() * 5, 2 + random() * 5);
    }
  });
  map.colorSpace = T.SRGBColorSpace;
  const veins = canvasTexture(256, ctx => draw(ctx, "#000000", "#ffffff", 4, 9));
  return { map, veins };
}

export class CanyonView {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = (this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" }));
    renderer.toneMapping = T.NeutralToneMapping;
    const scene = (this.scene = new T.Scene());
    scene.fog = new T.Fog("#f0a273", 60, 196);
    scene.background = new T.Color("#f0a273");
    this.camera = new T.PerspectiveCamera(58, 1, 0.3, 1400);
    this.camera.position.set(0, 4, 11.5);
    scene.add(this.camera);
    this.look = V(0, 3, -40);
    this.hemi = new T.HemisphereLight("#ffdcc0", "#7a3b2b", 1.25);
    this.sun = new T.DirectionalLight("#fff0c8", 3.2);
    this.sun.position.set(-40, 70, -50);
    this.fill = new T.DirectionalLight("#ffdcc0", 0.9);
    this.fill.position.set(50, 25, 40);
    scene.add(this.hemi, this.sun, this.fill);
    this.theme = { ...THEMES[0], glowPower: 0 };
    for (const key of COLOR_KEYS) this.theme[key] = THEMES[0][key].clone();
    this.theme.glowColor = THEMES[0].glowColor.clone();
    this.bounds = { x: 7, bottom: 0.9, top: 6.6 };
    this.wallX = 12;
    this.offset = 0;
    this.time = 0;
    this.shake = 0;
    this.hurt = 0;
    this.flash = 0;
    this.muzzle = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Небо: градиент, солнце впереди, звёзды в тёмных зонах ----------
    this.skyUniforms = { top: { value: new T.Color() }, low: { value: new T.Color() }, sun: { value: new T.Color() }, stars: { value: 0 }, flash: { value: 0 } };
    const sky = new T.Mesh(new T.SphereGeometry(900, 24, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 top, low, sun;
        uniform float stars, flash;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(low, top, smoothstep(-0.02, 0.55, d.y));
          float glow = max(dot(d, normalize(vec3(-0.25, 0.2, -1.0))), 0.0);
          col += sun * (pow(glow, 320.0) * 3.0 + pow(glow, 14.0) * 0.35);
          vec2 cell = floor(d.xy / max(0.2, abs(d.z)) * 190.0);
          col += vec3(step(0.994, hash(cell)) * stars * smoothstep(0.1, 0.5, d.y) * 1.6);
          col += vec3(0.75, 0.82, 1.0) * flash;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);

    // ---------- Дно ----------
    const { map, veins } = floorTextures();
    map.repeat.set(7, 14);
    veins.repeat.set(7, 14);
    this.floorMap = map;
    this.veins = veins;
    this.floorMat = new T.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, emissive: new T.Color("#ff5a14"), emissiveMap: veins, emissiveIntensity: 0 });
    const floor = new T.Mesh(new T.PlaneGeometry(140, 280), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2, -110);
    scene.add(floor);

    // ---------- Стены каньона: гранёные столбы, которые бесконечно едут навстречу ----------
    this.rockMat = new T.MeshStandardMaterial({ color: "#b0523a", roughness: 0.95, metalness: 0, flatShading: true });
    const wallMat = new T.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true });
    this.walls = [];
    const ROWS = 30;
    let seed = 2024;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const side of [-1, 1]) {
      for (let row = 0; row < ROWS; row++) {
        for (let layer = 0; layer < 3; layer++) {
          const small = layer === 2;
          this.walls.push({
            side, small, z0: (row + random() * 0.7) / ROWS, dx: small ? -2.2 - random() * 2.2 : layer * 6 + random() * 4,
            w: small ? 1.6 + random() * 2.2 : 4.5 + random() * 4.5, h: small ? 1.6 + random() * 2.6 : (layer ? 30 : 13) + random() * 18,
            turn: random() * TAU, tilt: (random() - 0.5) * 0.22, lean: (random() - 0.5) * 0.16, shade: random(),
          });
        }
      }
    }
    this.wallMesh = new T.InstancedMesh(GEO.hex, wallMat, this.walls.length);
    this.boulderMesh = new T.InstancedMesh(GEO.low, wallMat, this.walls.length);
    for (const mesh of [this.wallMesh, this.boulderMesh]) {
      mesh.frustumCulled = false;
      mesh.setColorAt(0, new T.Color());
      scene.add(mesh);
    }
    // светящиеся вкрапления (кристаллы грота, угли лавы, фонари цитадели)
    this.accents = [];
    for (let i = 0; i < 70; i++) {
      this.accents.push({ side: i % 2 ? 1 : -1, z0: random(), dx: random() * 3 - 2.5, y: -1 + random() * random() * 16, s: 0.5 + random() * 1.1, turn: random() * TAU });
    }
    this.accentMat = new T.MeshBasicMaterial({ color: "#000000", toneMapped: false });
    this.accentMesh = new T.InstancedMesh(GEO.oct, this.accentMat, this.accents.length);
    this.accentMesh.frustumCulled = false;
    scene.add(this.accentMesh);
    // дождь грозовой зоны
    this.rain = Array.from({ length: 150 }, () => ({ x: (random() - 0.5) * 60, y: random() * 30, z: -random() * 90 + 8, v: 60 + random() * 30 }));
    this.rainMesh = new T.InstancedMesh(GEO.box, new T.MeshBasicMaterial({ color: "#cfe0ff", transparent: true, opacity: 0.5, toneMapped: false }), this.rain.length);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    scene.add(this.rainMesh);
    // снег ледяного разлома
    this.snow = Array.from({ length: 220 }, () => ({ x: (random() - 0.5) * 60, y: random() * 26, z: -random() * 120 + 8, v: 2 + random() * 3, w: random() * TAU }));
    this.snowMesh = new T.InstancedMesh(GEO.oct, new T.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, fog: true }), this.snow.length);
    this.snowMesh.frustumCulled = false;
    this.snowMesh.visible = false;
    scene.add(this.snowMesh);
    // зигзаги: молния-оружие, линия прицела снайпера, молнии в небе грозовых зон
    this.zigMat = new T.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, fog: false, transparent: true, depthWrite: false });
    this.zigMesh = new T.InstancedMesh(GEO.box, this.zigMat, 260);
    this.zigMesh.frustumCulled = false;
    this.zigMesh.count = 0;
    this.zigMesh.setColorAt(0, new T.Color());
    this.zigMesh.renderOrder = 7;
    scene.add(this.zigMesh);
    this.strikes = []; // { points, color, life, max, width, jag }
    this.skyBolt = 2;

    // ---------- Истребитель, ведомые, прицел ----------
    this.ship = jet();
    this.ship.scale.setScalar(1.3);
    this.ship.rotation.order = "YXZ";
    scene.add(this.ship);
    this.wings = [wingman(), wingman()];
    this.wings.forEach(w => ((w.visible = false), scene.add(w)));
    // пузырь щита вокруг «Стрижа»
    this.bubbleMat = new T.MeshBasicMaterial({ color: hot("#6fd8ff", 1.4), transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false, blending: T.AdditiveBlending });
    this.bubble = new T.Group();
    this.bubble.add(part(GEO.low, this.bubbleMat, 2.5, 1.5, 2.6), part(GEO.ring, lit("#9fe8ff", 2.2), 2.55, 2.55, 1.2));
    this.bubble.children[1].rotation.x = Math.PI / 2;
    this.bubble.visible = false;
    this.bubblePulse = 0;
    scene.add(this.bubble);
    // инверсионные следы: две ленты от кончиков крыльев, воздух уносит их назад вместе с миром
    this.trails = [-1, 1].map(() => {
      const N = 16;
      const geometry = new T.BufferGeometry();
      const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
      geometry.setAttribute("position", new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
      geometry.setAttribute("color", new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
      const index = [];
      for (let i = 0; i < N - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geometry.setIndex(index);
      const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: T.DoubleSide }));
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      return { mesh, pos, col, N, points: Array.from({ length: N }, () => V(0, 0, 0)), age: new Float32Array(N), fresh: true };
    });
    const sightMat = new T.MeshBasicMaterial({ color: hot("#7fe9ff", 1.6), transparent: true, opacity: 0.55, toneMapped: false, depthTest: false, fog: false });
    this.sightNear = part(GEO.wave, sightMat, 1.0);
    this.lockMat = new T.MeshBasicMaterial({ color: hot("#ffb02e", 2.2), transparent: true, opacity: 0.9, toneMapped: false, depthTest: false, fog: false });
    this.sightFar = part(GEO.wave, sightMat, 1.5);
    this.sightNear.renderOrder = this.sightFar.renderOrder = 8;
    scene.add(this.sightNear, this.sightFar);
    this.sightMat = sightMat;

    // ---------- Пулы: лазеры, заряды, метки угроз, кристаллы, ракеты ----------
    const pool = (geometry, material, count) => {
      const mesh = new T.InstancedMesh(geometry, material, count);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    this.boltMesh = pool(GEO.box, lit("#6fe6ff", 3.2), 220);
    this.plasmaMesh = pool(GEO.box, lit("#ff6ad8", 3.2), 200);
    this.shotMesh = pool(GEO.ball, new T.MeshBasicMaterial({ toneMapped: false }), 110);
    this.shotMesh.setColorAt(0, new T.Color());
    this.threatMesh = pool(GEO.wave, new T.MeshBasicMaterial({ color: hot("#ff5a3a", 2.4), toneMapped: false, depthTest: false, fog: false }), 40);
    this.threatMesh.renderOrder = 7;
    this.gemMesh = pool(GEM_GEO, gemMaterial, 60);
    gemMaterial.color = hot("#6ff3ff", 2.4);
    this.rocketMesh = pool(GEO.cone, lit("#fff0c0", 2.6), 16);
    this.dummy = new T.Object3D();
    this.aimPoint = V();
    this.workPosition = V();
    this.workVelocity = V();
    this.trailHead = V();
    this.ringBoost = 0;

    this.actors = new Map(); // враги
    this.rocks = new Map();
    this.hazards = new Map();
    this.kits = new Map();
    this.kitPool = new Map();
    this.fx = createFx(scene, this.camera);
    this.fx.setFlow(SCROLL * 0.3);

    // ---------- Свечение и финальная цветокоррекция ----------
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, hurt: { value: 0 }, white: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float hurt, white;
        varying vec2 vUv;
        void main() {
          vec2 c = vUv - 0.5;
          float r2 = dot(c, c);
          vec2 shift = c * r2 * (0.008 + hurt * 0.03);
          vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
          col *= 1.0 - smoothstep(0.18, 0.75, r2) * 0.42;
          col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.12);
          col = mix(col, vec3(1.0, 0.18, 0.12), hurt * smoothstep(0.05, 0.5, r2) * 0.6);
          col = mix(col, vec3(1.0, 0.97, 0.9), white);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.42, 0.45, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
    this.perf = { sum: 0, seen: 0, dropAt: 0 };
    this.slow = 0; // замедление после победы над хозяином зоны
    this.white = 0; // белая вспышка на весь экран
    this.choice = "auto";
    this.quality = "high";
    this.applyQuality();
  }

  // Качество графики: auto (сам решает и снижает, если кадры тяжёлые), high, mid, low
  setQuality(choice) {
    this.choice = choice;
    if (choice === "auto") {
      const memory = navigator.deviceMemory ?? 8, cores = navigator.hardwareConcurrency ?? 8;
      this.quality = memory >= 4 && cores >= 6 ? "high" : "mid";
    } else this.quality = choice;
    this.perf = { sum: 0, seen: 0, dropAt: 0 };
    this.applyQuality();
  }

  applyQuality() {
    const q = this.quality;
    this.glow = q !== "low";
    this.fx.thin = q === "high" ? 1 : q === "mid" ? 0.75 : 0.45; // доля мелких частиц
    this.bloom.strength = q === "high" ? 0.5 : 0.42;
    if (this.size) this.resize();
  }

  // во сколько раз медленнее идёт время (после победы над хозяином зоны)
  timeScale() {
    return 1 - 0.68 * Math.min(1, this.slow);
  }

  // Инверсионные следы: голова ленты — у кончика крыла, старые точки уносит к камере
  drawTrails(dt, off) {
    const ship = this.ship;
    const roll = ship.rotation.z;
    this.trails.forEach((trail, k) => {
      trail.mesh.visible = !off;
      if (off) {
        trail.fresh = true;
        return;
      }
      const s = k ? 1 : -1;
      const head = this.trailHead.set(ship.position.x + Math.cos(roll) * s * 2.3, ship.position.y + 0.12 + Math.sin(roll) * s * 2.3, 1.2);
      const { points, pos, col, N } = trail;
      if (trail.fresh) {
        points.forEach(q => q.copy(head));
        trail.fresh = false;
      }
      // каждая точка отстаёт на ~0,02 с: сдвигаем «воздух» к камере и тянем цепочку за головой
      for (let i = N - 1; i > 0; i--) {
        points[i].copy(points[i - 1]);
        points[i].z += SCROLL * 0.32 * Math.max(dt, 1 / 120);
      }
      points[0].copy(head);
      const speed = Math.min(1, Math.hypot(this.lastVx || 0, 0) / 18);
      for (let i = 0; i < N; i++) {
        const q = points[i], fade = 1 - i / (N - 1);
        const w = 0.045 + 0.03 * (1 - fade);
        pos.set([q.x - w, q.y, q.z, q.x + w, q.y, q.z], i * 6);
        const c = fade * fade * fade * (0.45 + speed * 0.35);
        col.set([c * 0.9, c * 0.97, c, c * 0.9, c * 0.97, c], i * 6);
      }
      trail.mesh.geometry.attributes.position.needsUpdate = true;
      trail.mesh.geometry.attributes.color.needsUpdate = true;
    });
  }

  // Ломаная молния между точками: jag — насколько зубчатая, width — толщина
  strike(points, color, life, width = 0.09, jag = 0.6) {
    if (this.strikes.length > 14) this.strikes.shift();
    this.strikes.push({ points, color: tone(color, 2.6), life, max: life, width, jag });
  }

  drawStrikes(dt) {
    const d = this.dummy;
    let n = 0;
    const a = V(), b = V(), mid = V();
    for (let s = this.strikes.length - 1; s >= 0; s--) {
      const k = this.strikes[s];
      k.life -= dt;
      if (k.life <= 0) {
        this.strikes.splice(s, 1);
        continue;
      }
      const fade = k.life / k.max;
      for (let i = 0; i + 1 < k.points.length; i++) {
        const p0 = k.points[i], p1 = k.points[i + 1];
        const parts = k.jag ? 5 : 1;
        a.set(p0.x, p0.y, p0.z);
        for (let j = 1; j <= parts && n < 260; j++) {
          const t = j / parts;
          b.set(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, p0.z + (p1.z - p0.z) * t);
          if (j < parts) b.add(mid.set((Math.random() - 0.5) * k.jag * 2, (Math.random() - 0.5) * k.jag * 2, (Math.random() - 0.5) * k.jag));
          const len = a.distanceTo(b);
          d.position.copy(a).add(b).multiplyScalar(0.5);
          d.lookAt(b);
          d.scale.set(k.width * (0.6 + fade * 0.6), k.width * (0.6 + fade * 0.6), len);
          d.updateMatrix();
          this.zigMesh.setMatrixAt(n, d.matrix);
          this.zigMesh.setColorAt(n++, k.color);
          a.copy(b);
        }
      }
    }
    this.zigMesh.count = n;
    this.zigMesh.instanceMatrix.needsUpdate = true;
    if (this.zigMesh.instanceColor) this.zigMesh.instanceColor.needsUpdate = true;
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    const aspect = w / h;
    this.aspect = aspect;
    const ratio = Math.min(devicePixelRatio || 1, this.quality === "high" ? 2 : this.quality === "mid" ? 1.4 : 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    // стоя экран узкий: поле зрения шире, а коридор полёта выше
    this.camera.fov = aspect < 1 ? 70 : 58;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const half = 11.5 * Math.tan(this.camera.fov * Math.PI / 360) * aspect;
    this.bounds.x = clamp(half * 1.5, 3.6, 8);
    this.bounds.top = aspect < 1 ? 8.4 : 6.6;
    this.wallX = this.bounds.x + 5.5;
    this.size = { w, h };
    return this.bounds;
  }

  // сколько единиц мира приходится на пиксель при перетаскивании
  dragScale() {
    return { x: this.bounds.x * 2.3 / this.size.w, y: (this.bounds.top - this.bounds.bottom) * 1.7 / this.size.h };
  }

  shadeFor(kind) {
    return enemyColor[kind] || "#ffffff";
  }

  event(e, game) {
    const fx = this.fx;
    const p = game.player;
    if (e.type === "shot") this.muzzle = 1;
    else if (e.type === "impact") {
      fx.burst(V(e.x, e.y, e.z), [this.shadeFor(e.kind), "#ffffff"], 3, 16, 0.22);
      fx.puff(GLOW, V(e.x, e.y, e.z), null, 0.5, 1.3, 0.12, tone("#bff4ff", 2.2), 0.8);
    } else if (e.type === "spark") fx.burst(V(e.x, e.y, e.z), ["#ffd9a0", "#ffffff"], 3, 12, 0.18);
    else if (e.type === "burst") {
      const boss = e.kind === "boss";
      const big = e.kind === "cruiser" || e.kind === "bomber";
      const level = boss ? 3 : big ? 2 : e.kind === "drone" || e.kind === "mine" || e.kind === "dart" ? 0 : 1;
      const size = boss ? 6 : e.kind === "cruiser" ? 4.2 : e.kind === "bomber" ? 3 : level ? 1.5 : 1.1;
      fx.explode(V(e.x, e.y, e.z), size, this.shadeFor(e.kind), level);
      if (boss) {
        // победа над хозяином зоны: замедление, белая вспышка, ударная волна
        this.shake = 1;
        this.slow = this.reduced ? 0 : 1.5;
        this.white = 1;
        fx.puff(RING, V(e.x, e.y, e.z), null, 4, 46, 1.1, tone("#fff2c0", 2.4), 0.9);
        fx.puff(RING, V(e.x, e.y, e.z), null, 2, 30, 0.8, tone(this.shadeFor("boss"), 2.6), 0.9);
      } else if (e.kind === "cruiser") {
        this.shake = Math.max(this.shake, 0.7);
        this.slow = this.reduced ? 0 : 0.7;
        fx.puff(RING, V(e.x, e.y, e.z), null, 2, 28, 0.8, tone("#ffd9a0", 2.4), 0.9);
      } else if (e.kind === "carrier") {
        fx.burst(V(e.x, e.y, e.z), ["#ffe27a", "#ffffff"], 30, 30, 0.5);
      } else if (e.z > -30) this.shake = Math.max(this.shake, 0.25);
    } else if (e.type === "chain") {
      this.strike(e.points, "#fff3a0", 0.16, 0.1, 0.7);
      this.strike(e.points, "#9fe8ff", 0.12, 0.05, 1.1);
      const last = e.points[e.points.length - 1];
      fx.puff(GLOW, V(last.x, last.y, last.z), null, 1.4, 3, 0.18, tone("#fff3a0", 2.4), 0.9);
    } else if (e.type === "block") {
      fx.burst(V(e.x, e.y, e.z), ["#9fe8ff", "#ffffff"], 2, 10, 0.16);
    } else if (e.type === "shield-break") {
      fx.burst(V(e.x, e.y, e.z), ["#7fe9ff", "#ffffff", "#bff4ff"], 26, 26, 0.36);
      fx.puff(RING, V(e.x, e.y, e.z), null, 1, 5, 0.4, tone("#7fe9ff", 2.4), 0.9);
    } else if (e.type === "shield-hit") {
      this.bubblePulse = 1;
      fx.burst(V(p.x, p.y, 0), ["#7fe9ff", "#ffffff"], 10, 12, 0.08);
      this.shake = Math.max(this.shake, 0.3);
    } else if (e.type === "capsule" || e.type === "weapon") {
      const hex = CAPSULE_COLOR[e.power || e.kind] || "#ffffff";
      fx.puff(RING, V(p.x, p.y, -0.6), null, 1, 4.5, 0.45, tone(hex, 2.4), 0.9);
      fx.puff(STAR, V(p.x, p.y + 0.3, -0.6), null, 1.2, 3.4, 0.35, tone(hex, 2.2), 0.9);
    } else if (e.type === "flock") {
      fx.puff(RING, V(e.x, e.y, e.z), null, 1, 9, 0.6, tone("#7fe9ff", 2.4), 0.9);
    } else if (e.type === "task") {
      for (let i = 0; i < 7; i++) fx.puff(STAR, V(p.x + (Math.random() - 0.5) * 6, p.y + 1 + Math.random() * 3, -4 - Math.random() * 6), null, 0.6, 2.4, 0.6 + Math.random() * 0.3, tone("#ffd76a", 2.4), 0.9);
    } else if (e.type === "rocket-hit") {
      fx.puff(GLOW, V(e.x, e.y, e.z), null, 1, 3, 0.2, tone("#ffd9a0", 2.4), 0.8);
      fx.burst(V(e.x, e.y, e.z), ["#ffd27a", "#ffffff"], 10, 22, 0.3);
    }
    else if (e.type === "hurt") {
      this.shake = Math.max(this.shake, 0.6);
      this.hurt = 1;
      fx.burst(V(p.x, p.y, 0), ["#ffd9a0", "#ff7a2e", "#ffffff"], 12, 14, 0.09); // у самой камеры искры должны быть мелкими
    } else if (e.type === "crash") fx.debris(V(p.x, p.y, -1), "#b0523a", 8, 14, 0.5);
    else if (e.type === "lost") {
      fx.explode(V(p.x, p.y, -0.5), 2.4, "#ff7a2e", 2);
      this.shake = 1;
    }
    else if (e.type === "gem" || e.type === "repair") {
      fx.puff(STAR, V(p.x, p.y + 0.3, -0.5), null, 1, 2.6, 0.25, tone(e.type === "gem" ? "#6ff3ff" : "#5dff8f", 2), 0.9);
    } else if (e.type === "ring") {
      if (!this.reduced) this.ringBoost = 0.55;
      fx.puff(RING, V(e.x, e.y, 0), null, 1.5, 5, 0.4, tone("#ffe27a", 2.4), 0.9);
      fx.burst(V(e.x, e.y, 0), ["#ffe27a", "#ffffff"], 12, 16, 0.09);
    } else if (e.type === "hazard-live") {
      if (e.kind === "bolt") {
        this.flash = 1;
        this.shake = Math.max(this.shake, 0.3);
      }
    } else if (e.type === "rocket") {
      for (let i = 0; i < 6; i++) fx.puff(SMOKE, V(p.x + (i % 2 ? 1 : -1), p.y, 0.5), V(0, 1, 6), 0.5, 1.6, 0.6, tone("#cfd6e6", 1), 0.4);
    } else if (e.type === "clear") {
      for (let i = 0; i < 5; i++) fx.puff(STAR, V(p.x + (Math.random() - 0.5) * 9, p.y + (Math.random() - 0.5) * 5, -6 - Math.random() * 10), null, 1, 4, 0.5 + Math.random() * 0.4, tone("#ffe27a", 2.2), 0.9);
    }
  }

  reset() {
    for (const [id, kit] of this.kits) this.recycleKit(id, kit);
    this.ringBoost = 0;
    for (const record of this.hazards.values()) {
      record.warnMat.dispose();
      record.liveMat.dispose();
    }
    for (const map of [this.actors, this.rocks, this.hazards]) {
      for (const record of map.values()) this.scene.remove(record.model || record);
      map.clear();
    }
  }

  // всё оформление плавно перетекает к теме зоны
  paintTheme(index, dt) {
    const goal = THEMES[clamp(index, 0, THEMES.length - 1)];
    const now = this.theme;
    const k = Math.min(1, dt * 1.3);
    for (const key of COLOR_KEYS) now[key].lerp(goal[key], k);
    for (const key of ["lava", "sunPower", "amb", "stars"]) now[key] += (goal[key] - now[key]) * k;
    now.glowPower += ((goal.glow ? 1 : 0) - now.glowPower) * k;
    if (goal.glow) now.glowColor.lerp(goal.glowColor, k);
    this.scene.fog.color.copy(now.fog);
    this.scene.background.copy(now.fog);
    this.skyUniforms.top.value.copy(now.top);
    this.skyUniforms.low.value.copy(now.low);
    this.skyUniforms.sun.value.copy(now.sun);
    this.skyUniforms.stars.value = now.stars;
    this.skyUniforms.flash.value = this.flash * 0.3;
    this.hemi.color.copy(now.sky);
    this.hemi.groundColor.copy(now.ground);
    this.hemi.intensity = now.amb + this.flash * 1.1;
    this.sun.color.copy(now.sun);
    this.sun.intensity = now.sunPower;
    this.fill.color.copy(now.sky);
    this.fill.intensity = now.amb * 0.75;
    this.floorMat.color.copy(now.floor);
    this.floorMat.emissiveIntensity = now.lava * (2.2 + Math.sin(this.time * 2.3) * 0.5);
    this.rockMat.color.copy(now.rock);
    this.accentMat.color.copy(now.glowColor).multiplyScalar(1.5 * now.glowPower);
    this.goal = goal;
  }

  scenery(dt, speed) {
    const SPAN = 235;
    this.offset = (this.offset + speed * dt) % SPAN;
    const d = this.dummy;
    const color = (this.wallColor ||= new T.Color());
    let columns = 0, boulders = 0;
    for (const wall of this.walls) {
      const z = ((wall.z0 * SPAN + this.offset) % SPAN) - 208;
      d.rotation.set(wall.tilt, wall.turn, wall.lean);
      color.copy(this.theme.rock).lerp(this.theme.rock2, wall.shade);
      if (wall.small) {
        d.position.set(wall.side * (this.wallX + wall.dx), wall.h * 0.35 - 2, z);
        d.scale.set(wall.w, wall.h, wall.w * 1.2);
        d.updateMatrix();
        this.boulderMesh.setColorAt(boulders, color);
        this.boulderMesh.setMatrixAt(boulders++, d.matrix);
      } else {
        d.position.set(wall.side * (this.wallX + wall.dx + wall.w * 0.45), wall.h / 2 - 2.5, z);
        d.scale.set(wall.w, wall.h, wall.w * 1.25);
        d.updateMatrix();
        this.wallMesh.setColorAt(columns, color);
        this.wallMesh.setMatrixAt(columns++, d.matrix);
      }
    }
    this.wallMesh.count = columns;
    this.boulderMesh.count = boulders;
    for (const mesh of [this.wallMesh, this.boulderMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    const glow = this.theme.glowPower;
    this.accentMesh.visible = glow > 0.02;
    if (this.accentMesh.visible) {
      this.accents.forEach((a, i) => {
        const z = ((a.z0 * SPAN + this.offset) % SPAN) - 208;
        d.position.set(a.side * (this.wallX + a.dx), a.y, z);
        d.rotation.set(a.turn, a.turn * 2 + this.time * 0.6, 0);
        d.scale.set(a.s, a.s * 2.6, a.s).multiplyScalar(glow);
        d.updateMatrix();
        this.accentMesh.setMatrixAt(i, d.matrix);
      });
      this.accentMesh.instanceMatrix.needsUpdate = true;
    }
    // плитка дна — 20 единиц: сдвигаем текстуру вместе с миром
    this.floorMap.offset.y = this.veins.offset.y = (this.offset / 20) % 1;
    const goal = this.goal || THEMES[0];
    this.snowMesh.visible = !!goal.snow;
    if (goal.snow) {
      this.snow.forEach((flake, i) => {
        flake.y -= flake.v * dt;
        flake.z += speed * dt * 0.75;
        flake.w += dt * 1.3;
        if (flake.y < -2 || flake.z > 12) {
          flake.y = 18 + Math.random() * 8;
          flake.z = -Math.random() * 120 + 6;
          flake.x = this.camera.position.x + (Math.random() - 0.5) * 60;
        }
        d.position.set(flake.x + Math.sin(flake.w) * 0.8, flake.y, flake.z);
        d.rotation.set(flake.w, flake.w * 0.7, 0);
        d.scale.setScalar(0.09);
        d.updateMatrix();
        this.snowMesh.setMatrixAt(i, d.matrix);
      });
      this.snowMesh.instanceMatrix.needsUpdate = true;
    }
    // молнии в небе грозовых зон: ломаная от облаков к скалам и вспышка неба
    if (goal.lightning && !this.reduced && this.quality !== "low") {
      this.skyBolt -= dt;
      if (this.skyBolt <= 0) {
        this.skyBolt = 2.2 + Math.random() * 4;
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (this.wallX + 8 + Math.random() * 30), z = -120 - Math.random() * 60;
        const points = [];
        for (let k = 0, y = 70; k < 7; k++, y -= 10 + Math.random() * 4) points.push({ x: x + (Math.random() - 0.5) * 14, y, z: z + (Math.random() - 0.5) * 6 });
        this.strike(points, "#d8e6ff", 0.22, 0.5, 2.5);
        if (Math.random() < 0.5) this.strike(points.slice(2, 5).map(q => ({ x: q.x + side * 6, y: q.y - 4, z: q.z })), "#b8c8ff", 0.18, 0.3, 2);
        this.flash = Math.max(this.flash, 0.55);
      }
    }
    this.rainMesh.visible = !!goal.rain;
    if (goal.rain) {
      this.rain.forEach((drop, i) => {
        drop.y -= drop.v * dt;
        drop.z += speed * dt * 0.6;
        if (drop.y < -2 || drop.z > 12) {
          drop.y = 24 + Math.random() * 8;
          drop.z = -Math.random() * 90 + 6;
          drop.x = this.camera.position.x + (Math.random() - 0.5) * 60;
        }
        d.position.set(drop.x, drop.y, drop.z);
        d.rotation.set(0.35, 0, 0);
        d.scale.set(0.035, 1.6, 0.035);
        d.updateMatrix();
        this.rainMesh.setMatrixAt(i, d.matrix);
      });
      this.rainMesh.instanceMatrix.needsUpdate = true;
    }
    // угли над лавой и клочья облаков над цитаделью
    this.ambient = (this.ambient || 0) - dt;
    if (this.ambient <= 0 && (goal.embers || goal.clouds)) {
      this.ambient = goal.embers ? 0.05 : 0.16;
      const x = (Math.random() - 0.5) * (this.wallX * 2 + 6);
      if (goal.embers) this.fx.puff(FIRE, V(x, -1.5, -20 - Math.random() * 110), V(0, 3 + Math.random() * 4, -SCROLL * 0.2), 0.12, 0.3, 2.2, tone("#ffd27a", 3), 0.9, tone("#ff4a10", 1.5));
      else this.fx.puff(SMOKE, V(x, -2 + Math.random() * 2.5, -150), V(0, 0, 0), 9, 14, 4.2, tone("#f4e8ff", 1), 0.34, tone("#d6c2f2", 1));
    }
  }

  syncActors(game, dt) {
    const seen = new Set();
    const p = game.player;
    for (const e of game.enemies) {
      seen.add(e.id);
      let record = this.actors.get(e.id);
      if (!record) {
        const model = enemyModels[e.kind](game.zone);
        this.scene.add(model);
        record = { model };
        this.actors.set(e.id, record);
      }
      const m = record.model;
      m.position.set(e.x, e.y, e.z);
      // модели чуть крупнее «честного» размера: издалека их должно быть видно
      m.scale.setScalar(e.kind === "boss" ? 1.3 + e.flash * 0.3 : 1.45 * (1 + e.flash * 1.2));
      if (e.kind === "prism") m.rotation.set(this.time * 0.6, this.time * 1.5, this.time * 0.8);
      else if (e.kind === "drone") {
        m.rotation.set(e.state === "dive" ? 0.6 : 0, clamp(-e.vx * 0.03, -0.5, 0.5), clamp(-e.vx * 0.06, -0.7, 0.7));
        m.userData.spin[0].rotation.y = this.time * 34;
        m.scale.setScalar(1.35 * (1 + e.flash * 1.5));
      } else if (e.kind === "carrier") {
        m.rotation.set(Math.sin(this.time * 2) * 0.15, this.time * 1.4, e.dir * 0.2);
        m.userData.spin.forEach(r => (r.rotation.y = this.time * 30));
      } else if (e.kind === "cruiser") {
        m.scale.setScalar(1.75 + e.flash * 0.3);
        m.rotation.set(e.state === "out" ? -0.3 : 0, clamp(-e.vx * 0.015, -0.3, 0.3), clamp(-e.vx * 0.03, -0.4, 0.4));
        m.userData.radar.rotation.y = this.time * 2.5;
      } else if (e.kind === "sniper") {
        m.lookAt(this.aimPoint.set(e.charge > 0 ? e.aimX : p.x, e.charge > 0 ? e.aimY : p.y, 8));
      } else if (e.kind === "dart") {
        m.rotation.set(0, 0, this.time * 9);
        m.lookAt(this.aimPoint.set(e.x + e.vx * 0.1, e.y + e.vy * 0.1, e.z + Math.max(1, e.vz) * 0.1));
        m.rotateZ(this.time * 9);
      } else if (e.kind === "mine") m.rotation.set(this.time * 0.9 + e.phase, this.time * 0.7, 0);
      else if (e.kind === "turret") m.rotation.set(-Math.atan2(p.y - e.y, -e.z) * 0.6, Math.atan2(p.x - e.x, -e.z), 0);
      else {
        m.rotation.set(e.state === "out" ? -0.5 : 0, clamp(-e.vx * 0.02, -0.4, 0.4), clamp(-e.vx * 0.05, -0.6, 0.6));
        m.userData.spin?.forEach(blade => (blade.rotation.y = this.time * 30));
        if (e.kind === "shield") {
          const plate = m.userData.plate;
          plate.visible = e.shield > 0;
          plate.scale.setScalar(e.open > 0 ? 0.35 : 1 + Math.sin(this.time * 8) * 0.03);
        }
        if (e.kind === "boss") {
          const pulse = 1 + Math.sin(this.time * (e.health < e.maxHealth / 2 ? 14 : 6)) * 0.12;
          m.userData.core.scale.setScalar(1.05 * pulse);
          m.userData.ring.rotation.z = this.time * 1.4;
          if (m.userData.plate) m.userData.plate.visible = e.shield > 0;
          m.rotation.y += Math.sin(this.time * 0.7) * 0.12;
        }
      }
    }
    for (const [id, record] of this.actors) {
      if (seen.has(id)) continue;
      this.scene.remove(record.model);
      this.actors.delete(id);
    }
  }

  syncRocks(game) {
    const seen = new Set();
    const b = game.bounds;
    for (const rock of game.rocks) {
      seen.add(rock.id);
      let model = this.rocks.get(rock.id);
      if (!model) {
        if (rock.kind === "pillar") model = pillar(this.rockMat, rock.half, 30, rock.id);
        else if (rock.kind === "stub") {
          model = pillar(this.rockMat, rock.half, rock.y1 - 1.2, rock.id);
          model.add(at(part(GEO.hex, this.rockMat, rock.half * 1.25, 0.7, rock.half * 1.25), 0, rock.y1 - 0.35, 0));
        } else if (rock.kind === "arch") model = arch(this.rockMat, this.wallX, rock.y0, rock.id);
        else if (rock.kind === "ridge") model = ridge(this.rockMat, this.wallX, rock.y1, rock.id);
        else model = ringGate(rock.r);
        this.scene.add(model);
        this.rocks.set(rock.id, model);
      }
      if (rock.kind === "ring") {
        model.position.set(rock.x, rock.y, rock.z);
        model.rotation.z = this.time * 1.2;
        if (rock.taken && !model.userData.spent) {
          model.userData.spent = true;
          model.traverse(node => node.isMesh && (node.material = model.userData.done));
        }
        if (rock.taken) model.scale.multiplyScalar(1.06);
        model.visible = rock.z < 2.5;
      } else model.position.set(rock.x, 0, rock.z);
    }
    for (const [id, model] of this.rocks) {
      if (seen.has(id)) continue;
      this.scene.remove(model);
      this.rocks.delete(id);
    }
    void b;
  }

  syncHazards(game) {
    const seen = new Set();
    const b = game.bounds;
    for (const h of game.hazards) {
      seen.add(h.id);
      let record = this.hazards.get(h.id);
      if (!record) {
        const group = new T.Group();
        const colorHex = h.kind === "ram" ? "#ff4e43" : ["bolt", "gate"].includes(h.kind) ? "#bfe0ff" : h.kind === "geyser" ? "#ff8a2a" : h.kind === "icicle" ? "#9ff0ff" : "#ff4fb0";
        const warnMat = new T.MeshBasicMaterial({ color: hot(colorHex, 1.6), transparent: true, opacity: 0.4, toneMapped: false, depthWrite: false, fog: false });
        const liveMat = new T.MeshBasicMaterial({ color: hot(colorHex, 3.4), toneMapped: false, fog: false });
        let warn, live;
        if (h.kind === "beam") {
          warn = part(GEO.box, warnMat, this.wallX * 2 + 6, 0.12, 0.12);
          live = part(GEO.box, liveMat, this.wallX * 2 + 6, h.half * 2, 0.5);
        } else if (h.kind === "ram") {
          warn = at(part(GEO.box, warnMat, h.half * 2, 0.06, 43), 0, -1.75, -21);
          live = at(part(GEO.box, liveMat, h.half * 2, 0.08, 43), 0, -1.72, -21);
        } else if (h.kind === "gate") {
          warn = at(part(GEO.box, warnMat, h.half * 2, 0.08, 46), 0, -1.85, -20);
          live = at(part(GEO.box, warnMat, h.half * 2, 32, 0.3), 0, 14, 0);
          live.add(part(GEO.box, liveMat, 0.07, 1, 1));
        } else if (h.kind === "icicle") {
          // сосульки: полоса на дне и нить от середины высоты вверх; живые — ледяные клыки сверху
          warn = new T.Group();
          const strip = part(GEO.box, warnMat, h.half * 2, 0.05, 46);
          strip.position.set(0, -1.9, -20);
          const thread = part(GEO.box, warnMat, 0.14, 14, 0.14);
          thread.position.set(0, h.y0 + 7, 0);
          const mark = part(GEO.box, warnMat, h.half * 2.2, 0.1, 0.1);
          mark.position.y = h.y0;
          warn.add(strip, thread, mark);
          live = new T.Group();
          for (let k = -1; k <= 1; k++) {
            const fang = part(GEO.cone, liveMat, h.half * (k ? 0.32 : 0.45), 9, h.half * (k ? 0.32 : 0.45));
            fang.rotation.x = Math.PI; // остриём вниз
            fang.position.set(k * h.half * 0.6, h.y0 + 4.5 + Math.abs(k) * 0.8, k * 0.3);
            live.add(fang);
          }
        } else {
          const top = h.kind === "geyser" ? h.y1 : 32;
          // полоса на дне показывает, куда ударит; тонкая нить — на какой высоте
          warn = new T.Group();
          const strip = part(GEO.box, warnMat, h.half * 2, 0.05, 46);
          strip.position.set(0, -1.9, -20);
          const thread = part(GEO.box, warnMat, 0.14, top + 2, 0.14);
          thread.position.set(0, (top - 2) / 2, 0);
          warn.add(strip, thread);
          live = part(GEO.cyl, liveMat, h.half * (h.kind === "bolt" ? 0.22 : 0.9), top + 2, h.half * (h.kind === "bolt" ? 0.22 : 0.9));
          live.position.y = (top - 2) / 2;
        }
        group.add(warn, live);
        this.scene.add(group);
        record = { model: group, warn, live, warnMat, liveMat };
        this.hazards.set(h.id, record);
      }
      const { model, warn, live, warnMat } = record;
      if (h.kind === "beam") model.position.set(0, h.y, -0.4);
      else model.position.set(h.x, 0, -0.4);
      warn.visible = !h.on || h.kind !== "beam";
      live.visible = h.on;
      warnMat.opacity = h.on ? 0.75 : 0.28 + 0.3 * Math.abs(Math.sin(this.time * 14));
      if (h.on && h.kind === "icicle") {
        if (Math.random() < 0.5) this.fx.burst(V(h.x + (Math.random() - 0.5) * h.half * 2, h.y0, -0.4), ["#dff8ff", "#ffffff"], 1, 8, 0.15);
      } else if (h.on && h.kind !== "beam" && h.kind !== "ram" && h.kind !== "gate") {
        live.scale.x = live.scale.z = h.half * (h.kind === "bolt" ? 0.22 : 0.9) * (0.7 + Math.random() * 0.6);
        if (h.kind === "bolt") live.position.x = (Math.random() - 0.5) * h.half * 0.8;
        const hex = ["bolt", "gate"].includes(h.kind) ? "#bfe0ff" : "#ffb04a";
        if (h.kind === "bolt") this.fx.puff(GLOW, V(h.x + live.position.x, b.bottom - 2.2, -0.5), null, 1.2, 2.6, 0.14, tone(hex, 2.4), 0.8);
        else this.fx.puff(FIRE, V(h.x + (Math.random() - 0.5) * h.half, b.bottom + Math.random() * 4, -0.5), V(0, 9, 0), 0.7, 1.8, 0.3, tone(hex, 3), 0.9);
      }
    }
    for (const [id, record] of this.hazards) {
      if (seen.has(id)) continue;
      this.scene.remove(record.model);
      record.warnMat.dispose();
      record.liveMat.dispose();
      this.hazards.delete(id);
    }
  }

  recycleKit(id, kit) {
    kit.removeFromParent();
    this.kitPool.get(kit.userData.poolKey).push(kit);
    this.kits.delete(id);
  }

  syncPools(game) {
    const d = this.dummy;
    let n = 0, m = 0;
    for (const bolt of game.bolts) {
      const plasma = bolt.kind === "plasma";
      if (plasma ? m >= this.plasmaMesh.instanceMatrix.count : n >= this.boltMesh.instanceMatrix.count) continue;
      d.position.set(bolt.x, bolt.y, bolt.z);
      d.lookAt(this.aimPoint.set(bolt.x + bolt.vx, bolt.y + bolt.vy, bolt.z + bolt.vz));
      if (plasma) {
        d.scale.set(0.3, 0.3, 2.6);
        d.updateMatrix();
        this.plasmaMesh.setMatrixAt(m++, d.matrix);
      } else {
        d.scale.set(0.085, 0.085, 3.2);
        d.updateMatrix();
        this.boltMesh.setMatrixAt(n++, d.matrix);
      }
    }
    this.boltMesh.count = n;
    this.plasmaMesh.count = m;
    this.boltMesh.instanceMatrix.needsUpdate = this.plasmaMesh.instanceMatrix.needsUpdate = true;
    n = 0;

    n = 0;
    let marks = 0;
    const color = (this.shotColor ||= [hot("#ff8a2a", 3), hot("#ff4fb0", 3)]);
    d.rotation.set(0, 0, 0);
    for (const shot of game.shots) {
      if (n >= 110) break;
      const size = (shot.heavy ? 0.58 : 0.44) * (1 + Math.sin(this.time * 30 + shot.id) * 0.12);
      d.position.set(shot.x, shot.y, shot.z);
      d.scale.setScalar(size);
      d.updateMatrix();
      this.shotMesh.setMatrixAt(n, d.matrix);
      this.shotMesh.setColorAt(n++, color[shot.heavy ? 1 : 0]);
      // метка на плоскости игрока: сюда заряд прилетит через долю секунды
      const t = -shot.z / shot.vz;
      if (t > 0 && t < 0.6 && marks < 40) {
        d.position.set(shot.x + shot.vx * t, shot.y + shot.vy * t, 0.2);
        d.scale.setScalar(0.4 + t * 1.3);
        d.updateMatrix();
        this.threatMesh.setMatrixAt(marks++, d.matrix);
      }
    }
    this.shotMesh.count = n;
    this.threatMesh.count = marks;
    this.shotMesh.instanceMatrix.needsUpdate = this.threatMesh.instanceMatrix.needsUpdate = true;
    if (this.shotMesh.instanceColor) this.shotMesh.instanceColor.needsUpdate = true;

    n = 0;
    const kits = new Set();
    for (const gem of game.gems) {
      if (gem.kind === "repair" || gem.kind === "power") {
        kits.add(gem.id);
        let kit = this.kits.get(gem.id);
        if (!kit) {
          const key = gem.kind === "power" ? gem.power : "repair";
          if (!this.kitPool.has(key)) this.kitPool.set(key, []);
          kit = this.kitPool.get(key).pop() || (gem.kind === "power" ? capsule(gem.power) : repairKit());
          kit.userData.poolKey = key;
          this.scene.add(kit);
          this.kits.set(gem.id, kit);
        }
        kit.position.set(gem.x, gem.y, gem.z);
        kit.rotation.z = this.time * 2;
        if (gem.kind === "power") {
          kit.userData.ring.rotation.set(this.time * 3, this.time * 2, 0);
          kit.scale.setScalar(1.3 + Math.sin(this.time * 9) * 0.1);
        }
        continue;
      }
      if (n >= 60) continue;
      d.position.set(gem.x, gem.y, gem.z);
      d.rotation.set(this.time * 2 + gem.id, this.time * 3, 0);
      d.scale.set(0.34, 0.5, 0.34);
      d.updateMatrix();
      this.gemMesh.setMatrixAt(n++, d.matrix);
    }
    this.gemMesh.count = n;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    for (const [id, kit] of this.kits) {
      if (kits.has(id)) continue;
      this.recycleKit(id, kit);
    }

    n = 0;
    for (const r of game.rockets) {
      if (n >= 16) break;
      d.position.set(r.x, r.y, r.z);
      d.lookAt(this.aimPoint.set(r.x + r.vx, r.y + r.vy, r.z + r.vz));
      d.rotateX(Math.PI / 2);
      d.scale.set(0.16, 0.9, 0.16);
      d.updateMatrix();
      this.rocketMesh.setMatrixAt(n++, d.matrix);
      this.fx.puff(SMOKE, this.workPosition.set(r.x, r.y, r.z), this.workVelocity.set(0, 0, -SCROLL * 0.7), 0.3, 1.1, 0.5, tone("#e8ecf6", 1), 0.4);
      this.fx.puff(GLOW, this.workPosition.set(r.x, r.y, r.z), this.workVelocity.set(0, 0, -SCROLL), 0.7, 0.2, 0.12, tone("#ffb04a", 3), 0.9);
    }
    this.rocketMesh.count = n;
    this.rocketMesh.instanceMatrix.needsUpdate = true;
  }

  draw(game, dt, frameMs) {
    this.time += dt;
    const t = this.time;
    const idle = game.mode === "menu";
    const p = game.player;
    const b = game.bounds;
    this.paintTheme(Math.max(0, game.zone - 1), dt);
    this.scenery(dt, idle ? SCROLL * 0.6 : SCROLL);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.slow = Math.max(0, this.slow - (frameMs ?? 16) / 1000); // по настоящему времени, а не замедленному
    this.white = Math.max(0, this.white - dt * 1.6);
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.muzzle = Math.max(0, this.muzzle - dt * 12);

    // истребитель
    const sx = idle ? Math.sin(t * 0.6) * 1.6 : p.x;
    const sy = idle ? 3.2 + Math.sin(t * 0.9) * 0.5 : p.y;
    const vx = idle ? Math.cos(t * 0.6) * 1.2 : p.vx;
    const vy = idle ? Math.cos(t * 0.9) * 0.5 : p.vy;
    const ship = this.ship;
    this.lastVx = vx;
    ship.position.set(sx, sy + Math.sin(t * 5) * 0.04, 0);
    ship.rotation.z += (clamp(-vx * 0.045, -0.75, 0.75) - ship.rotation.z) * Math.min(1, dt * 10);
    ship.rotation.x += (clamp(vy * 0.03, -0.35, 0.35) - ship.rotation.x) * Math.min(1, dt * 10);
    ship.rotation.y = clamp(-vx * 0.012, -0.2, 0.2);
    ship.visible = p.health > 0 && (p.safe <= 0 || idle || Math.sin(t * 40) > -0.3);
    ship.userData.flames.forEach((flame, i) => flame.scale.setScalar(1 + Math.sin(t * 50 + i) * 0.18 + this.muzzle * 0.1));
    if (ship.visible && !this.reduced) {
      for (const s of [-1, 1]) this.fx.puff(GLOW, this.workPosition.set(sx + s * 0.47, sy + 0.02, 2.5), this.workVelocity.set(0, 0, 9), 0.34, 0.06, 0.1, tone("#59dcff", 1.8), 0.6);
    }
    this.drawTrails(dt, idle || !ship.visible && p.health <= 0 || this.quality === "low");
    // пузырь щита
    this.bubblePulse = Math.max(0, this.bubblePulse - dt * 3);
    this.bubble.visible = !idle && p.shield > 0 && p.health > 0;
    if (this.bubble.visible) {
      this.bubble.position.set(sx, sy, 0);
      this.bubble.children[0].rotation.set(t * 0.7, t * 1.1, 0);
      this.bubble.children[1].rotation.z = t * 2;
      this.bubble.children[1].scale.setScalar(2.55 * (1 + this.bubblePulse * 0.25));
      this.bubbleMat.opacity = 0.24 + 0.08 * Math.sin(t * 6) + this.bubblePulse * 0.4;
    }
    this.wings.forEach((wing, i) => {
      wing.visible = !idle && p.wing > i && p.health > 0;
      if (!wing.visible) return;
      const goal = this.workPosition.set(p.x + (i ? 2 : -2), p.y + 0.6 + Math.sin(t * 3 + i * 2) * 0.15, 0.6);
      wing.position.lerp(goal, Math.min(1, dt * 7));
      wing.rotation.z = clamp(-p.vx * 0.04, -0.6, 0.6);
    });

    // прицел: ближнее кольцо на линии огня, дальнее садится на цель, когда лазеры её доводят
    const aim = idle ? null : game.aim;
    this.sightNear.visible = this.sightFar.visible = !idle && p.health > 0;
    this.sightNear.position.set(sx, sy - 0.05, -26);
    if (aim) {
      this.sightFar.position.set(aim.x, aim.y, aim.z + aim.r);
      this.sightFar.material = this.lockMat;
      this.sightFar.scale.setScalar(aim.r * 1.25 * (1 + Math.sin(t * 14) * 0.06));
      this.sightFar.rotation.z = t * 3;
    } else {
      this.sightFar.position.set(sx, sy - 0.05, -58);
      this.sightFar.material = this.sightMat;
      this.sightFar.scale.setScalar(1.5);
    }

    this.syncActors(game, dt);
    for (const e of game.enemies) {
      if (e.kind !== "sniper" || e.charge <= 0) continue;
      // линия прицела: тоньше и ярче к выстрелу
      const k = 1 - e.charge / 1.05;
      this.strike([{ x: e.x, y: e.y, z: e.z + 1.5 }, { x: e.aimX, y: e.aimY, z: 0.3 }], k > 0.7 && Math.sin(t * 40) > 0 ? "#ffffff" : "#ff3a5a", Math.max(dt, 0.001) * 1.01, 0.05 + k * 0.05, 0);
    }
    this.syncRocks(game);
    this.syncHazards(game);
    this.syncPools(game);
    this.drawStrikes(dt);
    this.fx.update(dt, t);

    // камера идёт за истребителем вполсилы, чтобы он двигался по экрану, а не стоял в центре
    const jolt = this.reduced ? 0 : this.shake * this.shake;
    const cam = this.camera;
    const wide = this.aspect > 1.1;
    const tx = idle ? (wide ? sx - 4.6 : sx) : sx * 0.55;
    const ty = idle ? (wide ? sy + 1.6 : sy + 2.6) : 4.3 + sy * 0.6;
    cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 8);
    cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 8);
    this.ringBoost = Math.max(0, this.ringBoost - dt);
    const boost = Math.sin(this.ringBoost / 0.55 * Math.PI);
    cam.position.z = idle ? 8.5 : 11.5 + boost * 1.15;
    this.look.x += ((idle ? (wide ? sx - 2.4 : sx) : sx * 0.62) - this.look.x) * Math.min(1, dt * 8);
    this.look.y += ((idle ? (wide ? sy + 0.2 : sy - 3.4) : 1.9 + sy * 0.75) - this.look.y) * Math.min(1, dt * 8);
    this.look.z = idle ? -12 : -40;
    cam.lookAt(this.look);
    cam.position.x += Math.sin(t * 83) * jolt * 0.35;
    cam.position.y += Math.cos(t * 71) * jolt * 0.35;
    cam.rotation.z += clamp(-vx * 0.004, -0.06, 0.06) + Math.sin(t * 97) * jolt * 0.02;
    this.grade.uniforms.hurt.value = this.hurt;
    this.grade.uniforms.white.value = this.white * 0.75;

    // «Авто»: если средний кадр за 2,5 с тяжелее 22 мс (меньше ~45 кадров в секунду) — ступенью ниже
    if (frameMs !== undefined && this.choice === "auto" && this.quality !== "low" && frameMs < 250) {
      this.perf.sum += frameMs;
      if (++this.perf.seen >= 150) {
        if (this.perf.sum / this.perf.seen > 22) {
          this.quality = this.quality === "high" ? "mid" : "low";
          this.applyQuality();
          this.onQuality?.(this.quality);
        }
        this.perf.sum = this.perf.seen = 0;
      }
    }
    if (this.glow) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    void b;
  }
}
