// 3D «Волшебного клубочка»: лабиринт-диорама в одном из пяти миров, котёнок Пуговка с клубочком,
// ниточка от старта до котёнка, следы лапок, подсказка-дорожка из искр, друг у выхода, салют.
// Логика (maze.js) решает, куда бежит котёнок; здесь всё рисуется по тем же клеткам.
import * as T from "../vendor/three/three.module.min.js?v=bad15ac6";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=bad15ac6";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=bad15ac6";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=bad15ac6";
import { polish } from "./gfx.js?v=bad15ac6";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=bad15ac6";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=bad15ac6";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=bad15ac6";
import { DX, DY, isOpen, nb, xy, threadStep } from "./maze.js?v=bad15ac6";
import { kitten, yarnBall, YARN, FRIENDS, ITEMS, keyModel, KEY_COLORS, glossy, matte, glowColor, glowSprite, canvasTexture } from "./models.js?v=bad15ac6";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
export const S = 2; // клетка
const WALL_H = 0.95,
  WALL_T = 0.44;
const RUN = 4.4, // клеток в секунду
  SLIDE = 6.5;
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
const noiseTex = (base, dots, n = 900, size = 3, rep = [1, 1]) =>
  canvasTexture(
    128,
    128,
    (x) => {
      x.fillStyle = base;
      x.fillRect(0, 0, 128, 128);
      const r = rng(7);
      for (let i = 0; i < n; i++) {
        x.fillStyle = dots[i % dots.length];
        x.globalAlpha = 0.35 + r() * 0.5;
        x.beginPath();
        x.arc(r() * 128, r() * 128, size * (0.5 + r()), 0, pie * 2);
        x.fill();
      }
    },
    rep,
  );
const brickTex = canvasTexture(
  128,
  64,
  (x) => {
    x.fillStyle = "#8a76bd";
    x.fillRect(0, 0, 128, 64);
    x.fillStyle = "#b7a3e6";
    for (let row = 0; row < 4; row++)
      for (let col = -1; col < 5; col++) {
        const off = row % 2 ? 16 : 0;
        x.fillRect(col * 32 + off + 2, row * 16 + 2, 28, 12);
      }
  },
  [2, 1],
);
const pawTex = canvasTexture(64, 64, (x) => {
  x.fillStyle = "#fff";
  x.beginPath();
  x.ellipse(32, 40, 13, 11, 0, 0, pie * 2);
  x.fill();
  for (const [px, py] of [
    [17, 22],
    [27, 15],
    [38, 15],
    [48, 22],
  ]) {
    x.beginPath();
    x.ellipse(px, py, 5.5, 6.5, 0, 0, pie * 2);
    x.fill();
  }
});

// Оформление миров
const THEMES = [
  { sky: ["#7cc8ff", "#e6f7ff"], fog: "#d6f0ff", ground: "#6fc24c", groundDots: ["#8fd862", "#4fa03c", "#ffffff"], side: "#a87a4a", floor: ["#f6dfa0", "#ecd08a"], wall: "#3a9a46", wallDots: ["#52b45a", "#24782f", "#6fcf62"], post: "#2f8a3c", arch: "#ff7fb0", sun: 1.7, hemi: 0.85 },
  { sky: ["#ff9fd4", "#fff0fa"], fog: "#ffe2f3", ground: "#7fcf6a", groundDots: ["#9fe080", "#5fb050", "#ffe0f0"], side: "#8a76bd", floor: ["#ffe6f4", "#f6cfe6"], wall: "#a993d8", post: "#9480c8", roof: ["#ff6fa8", "#5fb4ff", "#ffc533"], arch: "#ffc533", sun: 1.7, hemi: 0.85 },
  { sky: ["#8fd0ff", "#f0fbff"], fog: "#e2f5ff", ground: "#e6f2fd", groundDots: ["#d2e6f8", "#ffffff"], side: "#7fbfe6", floor: ["#f6faff", "#e6f0fb"], ice: "#7fd2ff", wall: "#3fa6e8", post: "#c8f0ff", arch: "#5fb4ff", sun: 1.5, hemi: 0.85 },
  { sky: ["#0a1030", "#24306a"], fog: "#141c40", ground: "#1d3a28", groundDots: ["#2a5034", "#163020"], side: "#3a2a20", floor: ["#3e7046", "#35633d"], wall: "#24603a", wallDots: ["#2f7a48", "#174a2a", "#3a8a50"], post: "#5a3e28", arch: "#9f8aff", sun: 0.5, hemi: 0.42, night: true },
  { sky: ["#ffb8dc", "#cfe8ff"], fog: "#ffe8f4", ground: null, side: "#ffb8d8", floor: ["#cfe0ff", "#bccfff"], wall: "#ffffff", post: "#fff4fa", arch: "#ff9f4a", sun: 1.5, hemi: 0.8 },
];

// Ломаная через центры клеток со скруглёнными углами; mid[i] — где на ней клетка i
function rounded(pts, r = 0.62) {
  const out = [pts[0].clone()],
    mid = [0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (i < pts.length - 1) {
      const a = pts[i - 1],
        b = pts[i + 1];
      const din = p.clone().sub(a).normalize(),
        dout = b.clone().sub(p).normalize();
      if (din.dot(dout) < 0.99 && din.dot(dout) > -0.99) {
        const p0 = p.clone().addScaledVector(din, -r),
          p1 = p.clone().addScaledVector(dout, r);
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          const q = p0
            .clone()
            .multiplyScalar((1 - t) * (1 - t))
            .addScaledVector(p, 2 * (1 - t) * t)
            .addScaledVector(p1, t * t);
          out.push(q);
          if (k === 3) mid.push(out.length - 1);
        }
        continue;
      }
    }
    out.push(p.clone());
    mid.push(out.length - 1);
  }
  // Длины вдоль ломаной
  const len = [0];
  for (let i = 1; i < out.length; i++) len.push(len[i - 1] + out[i].distanceTo(out[i - 1]));
  return { pts: out, len, mid: mid.map((k) => len[k]), total: len[len.length - 1] };
}
function sample(poly, s, v = new T.Vector3()) {
  const { pts, len } = poly;
  if (s <= 0) return v.copy(pts[0]);
  if (s >= poly.total) return v.copy(pts[pts.length - 1]);
  let lo = 0,
    hi = len.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    len[m] <= s ? (lo = m) : (hi = m);
  }
  const t = (s - len[lo]) / (len[hi] - len[lo] || 1);
  return v.copy(pts[lo]).lerp(pts[hi], t);
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
    this.scene.fog = new T.Fog(0xd6f0ff, 40, 120);
    this.camera = new T.PerspectiveCamera(40, 1, 0.1, 900);
    this.hemi = new T.HemisphereLight(0xffffff, 0x6a7a5a, 1);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff2d8, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    // Фонарик котёнка (ночью)
    this.lamp = new T.PointLight(0xffd890, 0, 14, 1.2);
    this.scene.add(this.lamp);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.55, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
    // Небо
    const skyGeo = new T.SphereGeometry(600, 24, 16);
    skyGeo.setAttribute("color", new T.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
    this.sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    this.scene.add(this.sky);
    this.makeParticles();
    // Котёнок и клубочек
    this.cat = kitten();
    this.cat.g.scale.setScalar(1.25);
    this.scene.add(this.cat.g);
    this.cat.g.traverse((o) => o.isMesh && (o.castShadow = true));
    this.ball = yarnBall(0.26);
    this.scene.add(this.ball.g);
    this.threadMat = new T.MeshStandardMaterial({ color: YARN, roughness: 0.6, emissive: new T.Color(YARN), emissiveIntensity: 0.25 });
    this.thread = new T.Mesh(new T.BufferGeometry(), this.threadMat);
    this.tail = new T.Mesh(new T.BufferGeometry(), this.threadMat);
    this.thread.castShadow = this.tail.castShadow = true;
    this.scene.add(this.thread, this.tail);
    // Стрелки «куда можно»
    const chev = new T.Shape();
    chev.moveTo(-0.28, -0.12);
    chev.lineTo(0, 0.2);
    chev.lineTo(0.28, -0.12);
    chev.lineTo(0.16, -0.12);
    chev.lineTo(0, 0.06);
    chev.lineTo(-0.16, -0.12);
    const chevGeo = new T.ShapeGeometry(chev);
    chevGeo.rotateX(-pie / 2);
    this.arrowMat = new T.MeshBasicMaterial({ color: glowColor("#ffffff", 1.3), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.arrows = [0, 1, 2, 3].map((d) => {
      const m = new T.Mesh(chevGeo, this.arrowMat);
      m.rotation.y = -Math.atan2(DX[d], -DY[d]);
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    this.arrowsOn = 0;
    // Подсказка: дорожка из искр
    this.hintMesh = new T.InstancedMesh(new T.SphereGeometry(0.1, 10, 8), new T.MeshBasicMaterial({ color: glowColor("#ffd84a", 2.4), toneMapped: false }), 160);
    this.hintMesh.frustumCulled = false;
    this.hintMesh.count = 0;
    this.scene.add(this.hintMesh);
    this.hintOrb = glowSprite("#ffe88a", 1.6, 0);
    this.scene.add(this.hintOrb);
    this.hintDots = [];
    this.levelGroup = new T.Group();
    this.scene.add(this.levelGroup);
    this.cam = { target: new T.Vector3(), dist: 20, pitch: 1, mode: "all", look: 0 };
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
      if (this.m) this.fitCamera();
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
  center(c, y = 0, v = new T.Vector3()) {
    const [x, z] = xy(this.m, c);
    return v.set((x - (this.m.w - 1) / 2) * S, y, (z - (this.m.h - 1) / 2) * S);
  }

  // ---------- Уровень ----------
  setLevel(level, m, wi) {
    this.m = m;
    this.wi = wi;
    const th = (this.th = THEMES[wi]);
    const G = this.levelGroup;
    // Старый уровень убираем вместе с геометрией и материалами
    G.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const mt of [].concat(o.material || [])) {
        if (mt.map) mt.map.dispose();
        mt.dispose();
      }
    });
    for (const o of [...G.children]) G.remove(o);
    this.twinkles = [];
    this.bobbers = [];
    this.cheer = false;
    const r = rng(m.seedUsed || 1);
    // Небо, туман, свет
    const sky = this.sky.geometry,
      top = new T.Color(th.sky[0]),
      bot = new T.Color(th.sky[1]),
      pos = sky.attributes.position,
      col = sky.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const k = clamp(pos.getY(i) / 600, -0.2, 1);
      const c = bot.clone().lerp(top, Math.pow(Math.max(0, k), 0.6));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    this.scene.fog.color.set(th.fog);
    this.renderer.setClearColor(th.fog);
    this.hemi.intensity = th.hemi;
    this.hemi.color.set(th.night ? "#8fa0ff" : "#ffffff");
    this.hemi.groundColor.set(th.night ? "#1a2030" : wi === 4 ? "#ffd8ec" : "#7a8a6a");
    this.sun.intensity = th.sun;
    this.sun.color.set(th.night ? "#9fb0ff" : "#fff2d8");
    this.lamp.intensity = th.night ? 12 : 0;
    this.scene.environmentIntensity = th.night ? 0.12 : wi === 4 ? 0.2 : 0.35;
    this.bloom.strength = th.night ? 0.7 : 0.32;
    this.bloom.threshold = th.night ? 0.88 : 1.05;
    const W = m.w * S,
      H = m.h * S;
    this.bounds = { x0: -W / 2, x1: W / 2, z0: -H / 2, z1: H / 2 };
    const big = Math.max(W, H);
    Object.assign(this.sun.shadow.camera, { left: -big * 0.75, right: big * 0.75, top: big * 0.75, bottom: -big * 0.75, near: 1, far: big * 3 + 30 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.set(-big * 0.4, big * 0.9 + 8, big * 0.6);
    this.sun.target.position.set(0, 0, 0);
    this.buildGround(m, th, r);
    this.buildFloor(m, th, r);
    this.buildWalls(m, th, r);
    this.buildThings(m, th, wi);
    this.buildExit(m, th, wi);
    this.buildDecor(m, th, wi, r);
    this.motes.material.color.set(th.night ? glowColor("#c8ff6a", 1.8) : wi === 2 ? "#ffffff" : wi === 1 ? glowColor("#ffc0f0", 1.2) : glowColor("#fff6b0", 1.1));
    this.cat.bell.material.emissive.set(th.night ? "#ffc040" : "#000000");
    this.cat.bell.material.emissiveIntensity = th.night ? 2.2 : 0;
    // Котёнок на старте
    this.stack = [m.start];
    this.walking = null;
    this.paws = 0;
    this.pawMesh.count = 0;
    this.hintDots = [];
    this.hintMesh.count = 0;
    this.hintOrb.material.opacity = 0;
    this.yaw = 0;
    this.heroAt(m.start, 2);
    this.rebuildThread();
    this.tail.visible = false;
    this.showArrows(null);
    this.cam.look = 0;
    this.cam.party = null;
    this.fitCamera(true);
  }
  heroAt(c, dir = 0) {
    this.hero = this.center(c);
    this.heroDir = new T.Vector3(DX[dir], 0, DY[dir]);
    this.placeHero(0);
  }
  buildGround(m, th, r) {
    const G = this.levelGroup;
    const W = m.w * S,
      H = m.h * S;
    // Плита-диорама под лабиринтом: сверху пол, по бокам — земля
    const slab = new T.Mesh(new RoundedBoxGeometry(W + 1.4, 1.6, H + 1.4, 3, 0.35), matte(th.side, { roughness: 0.9 }));
    slab.position.y = -0.9;
    slab.receiveShadow = true;
    G.add(slab);
    if (th.ground) {
      const g = new T.Mesh(new T.PlaneGeometry(260, 260), matte(th.ground, { map: noiseTex(th.ground, th.groundDots, 1200, 2.5, [40, 40]) }));
      g.rotation.x = -pie / 2;
      g.position.y = -0.62;
      g.receiveShadow = true;
      G.add(g);
    } else {
      // Облака: остров висит в небе, под ним облачка
      for (let k = 0; k < 26; k++) {
        const a = r() * pie * 2,
          d = 10 + r() * 50;
        const puff = new T.Mesh(new T.SphereGeometry(2 + r() * 3, 14, 10), matte(k % 3 ? "#ffffff" : "#ffe8f6", { roughness: 1 }));
        puff.scale.y = 0.45;
        puff.position.set(Math.cos(a) * d, -6 - r() * 10, Math.sin(a) * d);
        G.add(puff);
      }
    }
  }
  buildFloor(m, th, r) {
    const G = this.levelGroup;
    const cloud = this.wi === 4;
    const geo = new RoundedBoxGeometry(S * (cloud ? 0.94 : 1.0), cloud ? 0.5 : 0.24, S * (cloud ? 0.94 : 1.0), 2, cloud ? 0.22 : 0.06);
    geo.translate(0, cloud ? -0.25 : -0.12, 0);
    const bridgeCells = new Set(m.bridges.map((b) => b.cell));
    const normal = [],
      ice = [];
    for (let c = 0; c < m.n; c++) {
      if (m.block[c] && this.wi !== 2) continue;
      if (bridgeCells.has(c)) continue;
      (m.ice[c] ? ice : normal).push(c);
    }
    const mat = matte("#ffffff", { roughness: cloud ? 1 : 0.8 });
    const tiles = new T.InstancedMesh(geo, mat, Math.max(1, normal.length));
    const d = new T.Object3D(),
      v = new T.Vector3(),
      c1 = new T.Color(th.floor[0]),
      c2 = new T.Color(th.floor[1]);
    normal.forEach((c, i) => {
      this.center(c, 0, v);
      d.position.copy(v);
      d.rotation.set(0, cloud ? r() * 0.3 : 0, 0);
      d.updateMatrix();
      tiles.setMatrixAt(i, d.matrix);
      const [x, y] = xy(m, c);
      tiles.setColorAt(i, ((x + y) % 2 ? c1 : c2).clone().offsetHSL(0, 0, (r() - 0.5) * 0.02));
    });
    tiles.receiveShadow = true;
    G.add(tiles);
    if (cloud) {
      // Пушистые края у облачных плиток
      const puffs = new T.InstancedMesh(new T.SphereGeometry(0.42, 12, 8), matte("#ffffff", { roughness: 1 }), normal.length * 4);
      let k = 0;
      for (const c of normal) {
        this.center(c, -0.6, v);
        for (let j = 0; j < 4; j++) {
          const a = j * (pie / 2) + r();
          d.position.set(v.x + Math.cos(a) * 0.55, v.y - r() * 0.15, v.z + Math.sin(a) * 0.55);
          d.scale.setScalar(0.8 + r() * 0.5);
          d.updateMatrix();
          puffs.setMatrixAt(k++, d.matrix);
        }
      }
      d.scale.setScalar(1);
      G.add(puffs);
    }
    if (ice.length) {
      const iceMat = new T.MeshPhysicalMaterial({ color: th.ice || "#9fe2ff", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new T.Color("#5fc8ff"), emissiveIntensity: 0.18, map: noiseTex("#bfeeff", ["#ffffff", "#8fd8ff"], 60, 6) });
      const it = new T.InstancedMesh(geo, iceMat, ice.length);
      ice.forEach((c, i) => {
        this.center(c, 0.02, v);
        d.position.copy(v);
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        it.setMatrixAt(i, d.matrix);
      });
      it.receiveShadow = true;
      G.add(it);
      // Искорки на льду
      for (let i = 0; i < Math.min(ice.length, 30); i++) {
        const s = glowSprite("#ffffff", 0.35, 0.7);
        this.center(ice[(i * 7) % ice.length], 0.08, s.position);
        s.position.x += (r() - 0.5) * 1.2;
        s.position.z += (r() - 0.5) * 1.2;
        s.userData.tw = r() * 6;
        G.add(s);
        (this.twinkles ||= []).push(s);
      }
    }
    // Следы лапок
    this.pawMesh = new T.InstancedMesh(new T.PlaneGeometry(0.34, 0.34).rotateX(-pie / 2), new T.MeshBasicMaterial({ map: pawTex, transparent: true, opacity: th.night ? 0.35 : 0.28, color: th.night ? "#c8ffb0" : "#7a4a2a", depthWrite: false }), m.n * 3);
    this.pawMesh.count = 0;
    this.pawMesh.frustumCulled = false;
    G.add(this.pawMesh);
    this.pawSeen = new Set();
  }
  buildWalls(m, th, r) {
    const G = this.levelGroup;
    const segs = [];
    const blockSide = (a, b) => (a >= 0 && m.block[a]) || (b >= 0 && m.block[b]);
    // Горизонтальные стенки (на севере клетки x,y)
    for (let y = 0; y <= m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const a = y > 0 ? (y - 1) * m.w + x : -1,
          b = y < m.h ? y * m.w + x : -1;
        let wall = a < 0 ? b !== m.exit : b < 0 ? true : !isOpen(m, b, 0);
        if (wall && a >= 0 && b >= 0 && blockSide(a, b)) wall = false;
        if (wall) segs.push({ x: x - (m.w - 1) / 2, z: y - 0.5 - (m.h - 1) / 2, h: true, gx: x, gy: y });
      }
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x <= m.w; x++) {
        const a = x > 0 ? y * m.w + x - 1 : -1,
          b = x < m.w ? y * m.w + x : -1;
        let wall = a < 0 || b < 0 ? true : !isOpen(m, a, 1);
        if (wall && a >= 0 && b >= 0 && blockSide(a, b)) wall = false;
        if (wall) segs.push({ x: x - 0.5 - (m.w - 1) / 2, z: y - (m.h - 1) / 2, h: false, gx: x, gy: y });
      }
    // Столбики на углах, где сходятся стенки
    const posts = new Map();
    const addPost = (gx, gy) => posts.set(gx + "," + gy, { x: gx - 0.5 - (m.w - 1) / 2, z: gy - 0.5 - (m.h - 1) / 2 });
    for (const s of segs) {
      if (s.h) addPost(s.gx, s.gy), addPost(s.gx + 1, s.gy);
      else addPost(s.gx, s.gy), addPost(s.gx, s.gy + 1);
    }
    const d = new T.Object3D();
    const wi = this.wi;
    const place = (mesh, list, fn) => {
      list.forEach((s, i) => {
        d.position.set(0, 0, 0);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        fn(s, d, i);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      G.add(mesh);
      return mesh;
    };
    const segPos = (s, o, y) => {
      o.position.set(s.x * S, y, s.z * S);
      if (!s.h) o.rotation.y = pie / 2;
    };
    const postList = [...posts.values()];
    if (wi === 4) {
      // Облачные стенки — пушистые шарики
      const puff = new T.InstancedMesh(new T.SphereGeometry(0.42, 14, 10), matte("#ffffff", { roughness: 1, emissive: new T.Color("#ffd8ec"), emissiveIntensity: 0.12 }), segs.length * 3);
      let k = 0;
      for (const s of segs)
        for (let j = -1; j <= 1; j++) {
          d.position.set(s.x * S + (s.h ? j * 0.62 : 0), 0.42 + r() * 0.12, s.z * S + (s.h ? 0 : j * 0.62));
          d.scale.setScalar(0.85 + r() * 0.35);
          d.rotation.set(0, 0, 0);
          d.updateMatrix();
          puff.setMatrixAt(k++, d.matrix);
        }
      puff.castShadow = puff.receiveShadow = true;
      G.add(puff);
      place(new T.InstancedMesh(new T.SphereGeometry(0.5, 14, 10), matte("#fff4fa", { roughness: 1 }), postList.length), postList, (p, o) => {
        o.position.set(p.x * S, 0.5, p.z * S);
      });
      return;
    }
    // Стенки
    let wallGeo, wallMat;
    if (wi === 0 || wi === 3) {
      wallGeo = new RoundedBoxGeometry(S + 0.04, WALL_H, WALL_T, 3, 0.18);
      wallMat = matte("#ffffff", { map: noiseTex(th.wall, th.wallDots, 700, 4, [2, 1]), roughness: 0.9 });
    } else if (wi === 1) {
      wallGeo = new RoundedBoxGeometry(S + 0.04, WALL_H * 1.05, WALL_T, 2, 0.05);
      wallMat = matte("#ffffff", { map: brickTex, roughness: 0.85 });
    } else {
      wallGeo = new RoundedBoxGeometry(S + 0.04, WALL_H, WALL_T, 2, 0.12);
      wallMat = new T.MeshPhysicalMaterial({ color: th.wall, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.93, emissive: new T.Color("#2f8fe0"), emissiveIntensity: 0.25 });
    }
    wallGeo.translate(0, WALL_H / 2, 0);
    place(new T.InstancedMesh(wallGeo, wallMat, segs.length), segs, (s, o) => segPos(s, o, 0));
    // Столбики
    if (wi === 1) {
      const pg = new RoundedBoxGeometry(WALL_T * 1.5, WALL_H * 1.45, WALL_T * 1.5, 2, 0.05);
      pg.translate(0, (WALL_H * 1.45) / 2, 0);
      place(new T.InstancedMesh(pg, matte("#e8e0ff", { map: brickTex }), postList.length), postList, (p, o) => o.position.set(p.x * S, 0, p.z * S));
      const roof = new T.InstancedMesh(new T.ConeGeometry(WALL_T * 1.05, 0.55, 4), glossy("#ffffff"), postList.length);
      place(roof, postList, (p, o) => {
        o.position.set(p.x * S, WALL_H * 1.45 + 0.27, p.z * S);
        o.rotation.y = pie / 4;
      });
      postList.forEach((p, i) => roof.setColorAt(i, new T.Color(th.roof[i % 3])));
    } else if (wi === 2) {
      // Ледяные кристаллы и снежные шапки
      const pg = new T.OctahedronGeometry(0.36, 0);
      place(new T.InstancedMesh(pg, new T.MeshPhysicalMaterial({ color: "#d8f6ff", roughness: 0.05, clearcoat: 1, emissive: new T.Color("#8fe0ff"), emissiveIntensity: 0.4, flatShading: true }), postList.length), postList, (p, o) => {
        o.position.set(p.x * S, WALL_H + 0.1, p.z * S);
        o.scale.set(0.9, 1.6, 0.9);
        o.rotation.y = r();
      });
      // Снег лежит комочками только на части стенок — сверху видно голубой лёд
      const lumps = segs.filter(() => r() < 0.45);
      place(new T.InstancedMesh(new T.SphereGeometry(0.3, 12, 8), matte("#ffffff", { roughness: 0.9 }), lumps.length), lumps, (s, o) => {
        segPos(s, o, WALL_H - 0.02);
        o.position.x += s.h ? (r() - 0.5) * 1.1 : 0;
        o.position.z += s.h ? 0 : (r() - 0.5) * 1.1;
        o.scale.set(1.3, 0.45, 0.8);
      });
    } else {
      // Сад и лес: круглые кусты на углах
      const pg = new T.SphereGeometry(WALL_T * 0.95, 14, 10);
      place(new T.InstancedMesh(pg, matte("#ffffff", { map: noiseTex(wi === 3 ? th.wall : th.post, th.wallDots, 500, 4), roughness: 0.9 }), postList.length), postList, (p, o) => {
        o.position.set(p.x * S, WALL_H * 0.82, p.z * S);
        o.scale.set(1, 1.15, 1);
      });
      // Цветочки на кустах (в саду) и светящиеся грибы (в лесу)
      if (wi === 0) {
        const fl = new T.InstancedMesh(new T.SphereGeometry(0.09, 8, 6), matte("#ffffff", { roughness: 0.5 }), segs.length * 2);
        const cols = ["#ff6fa8", "#ffe14a", "#ffffff", "#ff9f4a", "#c79bff"];
        let k = 0;
        for (const s of segs)
          for (let j = 0; j < 2; j++) {
            const off = (r() - 0.5) * 1.5;
            d.position.set(s.x * S + (s.h ? off : (r() - 0.5) * 0.2), WALL_H + 0.02, s.z * S + (s.h ? (r() - 0.5) * 0.2 : off));
            d.scale.setScalar(0.8 + r() * 0.6);
            d.rotation.set(0, 0, 0);
            d.updateMatrix();
            fl.setMatrixAt(k, d.matrix);
            fl.setColorAt(k++, new T.Color(cols[(r() * cols.length) | 0]));
          }
        G.add(fl);
      } else {
        const some = postList.filter(() => r() < 0.18);
        const stem = new T.InstancedMesh(new T.CylinderGeometry(0.05, 0.07, 0.3, 8), matte("#f2e8d8"), some.length);
        place(stem, some, (p, o) => o.position.set(p.x * S + 0.32, 0.15, p.z * S + 0.32));
        const capM = new T.InstancedMesh(new T.SphereGeometry(0.16, 12, 8, 0, pie * 2, 0, pie / 2), new T.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), some.length);
        place(capM, some, (p, o) => o.position.set(p.x * S + 0.32, 0.28, p.z * S + 0.32));
        some.forEach((p, i) => capM.setColorAt(i, glowColor(["#5fe8ff", "#ff7fd8", "#b8ff6a"][i % 3], 1.3)));
        capM.castShadow = false;
      }
    }
    // Ледяные глыбы-сугробы на месте закрытых клеток зала: снеговик
    for (let c = 0; c < m.n; c++) if (m.block[c]) G.add(this.snowman(c, r));
  }
  snowman(c, r) {
    const g = new T.Group();
    this.center(c, 0, g.position);
    const snow = matte("#ffffff", { roughness: 0.9 });
    const b1 = new T.Mesh(new T.SphereGeometry(0.62, 18, 14), snow);
    b1.position.y = 0.55;
    const b2 = new T.Mesh(new T.SphereGeometry(0.44, 18, 14), snow);
    b2.position.y = 1.25;
    const b3 = new T.Mesh(new T.SphereGeometry(0.32, 18, 14), snow);
    b3.position.y = 1.78;
    const nose = new T.Mesh(new T.ConeGeometry(0.07, 0.3, 10), glossy("#ff8f2e"));
    nose.rotation.x = pie / 2;
    nose.position.set(0, 1.78, 0.42);
    g.add(b1, b2, b3, nose);
    for (const s of [-1, 1]) {
      const e = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), glossy("#20202a"));
      e.position.set(s * 0.12, 1.88, 0.27);
      g.add(e);
    }
    const scarf = new T.Mesh(new T.TorusGeometry(0.36, 0.08, 8, 20), glossy("#ff4f6d"));
    scarf.rotation.x = pie / 2;
    scarf.position.y = 1.52;
    g.add(scarf);
    const hat = new T.Mesh(new T.CylinderGeometry(0.2, 0.22, 0.28, 16), glossy("#3f8cff"));
    hat.position.y = 2.1;
    g.add(hat);
    g.rotation.y = (r() - 0.5) * 0.8;
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  // Угощения, ключи, ворота, кнопки, мостики
  buildThings(m, th, wi) {
    const G = this.levelGroup;
    this.items = m.items.map((c, i) => {
      const it = ITEMS[wi]();
      const g = it.g;
      g.scale.setScalar(1.5);
      this.center(c, 0.7, g.position);
      g.userData.base = g.position.clone();
      g.userData.ph = i * 1.7;
      const halo = glowSprite(it.color, it.glow ? 2.4 : 1.4, it.glow ? 0.8 : 0.45);
      g.add(halo);
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(g);
      return { g, taken: false, color: it.color };
    });
    this.keys = m.keys.map((k) => {
      const g = keyModel(KEY_COLORS[k.color]);
      this.center(k.cell, 0.7, g.position);
      g.userData.base = g.position.clone();
      g.add(glowSprite(KEY_COLORS[k.color], 1.6, 0.6));
      g.scale.setScalar(1.5);
      G.add(g);
      return { g, taken: false, color: k.color };
    });
    this.doors = m.doors.map((door) => {
      const g = new T.Group();
      const a = this.center(door.a),
        b = this.center(door.b);
      g.position.copy(a).lerp(b, 0.5);
      if (DX[door.d]) g.rotation.y = pie / 2;
      const col = KEY_COLORS[door.color];
      const frame = glossy(wi === 3 ? "#8a5a3a" : "#fff4fa");
      for (const s of [-1, 1]) {
        const p = new T.Mesh(new RoundedBoxGeometry(0.34, 1.5, 0.5, 2, 0.08), frame);
        p.position.set(s * (S / 2 - 0.05), 0.75, 0);
        g.add(p);
        const ball = new T.Mesh(new T.SphereGeometry(0.16, 12, 8), glossy(col, { emissive: new T.Color(col), emissiveIntensity: 0.4 }));
        ball.position.set(s * (S / 2 - 0.05), 1.62, 0);
        g.add(ball);
      }
      const bars = new T.Group();
      const barMat = glossy(col, { metalness: 0.3, roughness: 0.25, emissive: new T.Color(col), emissiveIntensity: 0.25 });
      for (let k = -2; k <= 2; k++) {
        const bar = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 1.3, 10), barMat);
        bar.position.set(k * 0.34, 0.66, 0);
        bars.add(bar);
      }
      const beam = new T.Mesh(new RoundedBoxGeometry(S - 0.2, 0.18, 0.2, 2, 0.06), barMat);
      beam.position.y = 1.2;
      bars.add(beam);
      const lock = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.12, 20), glossy("#ffd84a", { metalness: 0.5, roughness: 0.2 }));
      lock.rotation.x = pie / 2;
      lock.position.set(0, 0.7, 0.08);
      bars.add(lock);
      const hole = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.14, 10), matte("#3a2a20"));
      hole.rotation.x = pie / 2;
      hole.position.set(0, 0.74, 0.1);
      bars.add(hole);
      const keyIcon = new T.Group();
      const lockBody = new T.Mesh(new RoundedBoxGeometry(0.7, 0.56, 0.24, 2, 0.1), glossy(col, { emissive: new T.Color(col), emissiveIntensity: 0.45 }));
      const shackle = new T.Mesh(new T.TorusGeometry(0.22, 0.07, 10, 22, pie), glossy("#eef0f8", { metalness: 0.6, roughness: 0.25 }));
      shackle.position.y = 0.28;
      const kh = new T.Mesh(new T.CircleGeometry(0.08, 14), new T.MeshBasicMaterial({ color: "#2a1a30" }));
      kh.position.set(0, 0.04, 0.125);
      const slot = new T.Mesh(new T.PlaneGeometry(0.06, 0.14), new T.MeshBasicMaterial({ color: "#2a1a30" }));
      slot.position.set(0, -0.07, 0.125);
      keyIcon.add(lockBody, shackle, kh, slot, glowSprite(col, 1.8, 0.45));
      keyIcon.position.copy(g.position).add(new T.Vector3(0, 2.15, 0));
      keyIcon.userData.y = 2.15;
      G.add(keyIcon);
      const seal = new T.Mesh(new T.RingGeometry(0.45, 0.8, 32).rotateX(-pie / 2), new T.MeshBasicMaterial({ color: glowColor(col, 1.2), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
      seal.position.copy(g.position);
      seal.position.y = 0.03;
      G.add(seal);
      g.add(bars);
      g.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(g);
      return { g, bars, keyIcon, seal, open: false, door };
    });
    this.buttons = m.buttons.map((b) => {
      const g = new T.Group();
      this.center(b.cell, 0, g.position);
      const col = KEY_COLORS[b.color];
      const base = new T.Mesh(new T.CylinderGeometry(0.62, 0.7, 0.12, 28), glossy("#ffffff"));
      base.position.y = 0.06;
      const pad = new T.Mesh(new T.CylinderGeometry(0.46, 0.5, 0.16, 28), glossy(col, { emissive: new T.Color(col), emissiveIntensity: 0.45 }));
      pad.position.y = 0.18;
      g.add(base, pad, glowSprite(col, 2, 0.4));
      g.children[2].position.y = 0.3;
      G.add(g);
      return { g, pad, color: b.color };
    });
    this.bridges = m.bridges.map((b) => {
      const g = new T.Group();
      this.center(b.cell, 0, g.position);
      // Мостик вдоль коридора
      const along = isOpen(m, b.cell, 1) || isOpen(m, b.cell, 3);
      g.rotation.y = along ? 0 : pie / 2;
      const col = KEY_COLORS[b.color];
      const plank = new T.Group();
      for (let k = -2; k <= 2; k++) {
        const p = new T.Mesh(new RoundedBoxGeometry(0.36, 0.14, 1.3, 2, 0.05), glossy(k % 2 ? "#ffe2a8" : col, { emissive: new T.Color(col), emissiveIntensity: 0.15 }));
        p.position.set(k * 0.4, -0.07, 0);
        plank.add(p);
      }
      for (const s of [-1, 1]) {
        const rope = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, S, 8), glossy(col));
        rope.rotation.z = pie / 2;
        rope.position.set(0, 0.45, s * 0.68);
        plank.add(rope);
        for (const e of [-1, 1]) {
          const post = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.5, 8), glossy("#ffffff"));
          post.position.set(e * 0.95, 0.22, s * 0.68);
          plank.add(post);
        }
      }
      // Пунктир на месте убранного мостика
      const ghost = new T.Mesh(new T.RingGeometry(0.55, 0.7, 28).rotateX(-pie / 2), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false }));
      ghost.position.y = -0.3;
      g.add(plank, ghost);
      plank.traverse((o) => o.isMesh && (o.castShadow = true));
      G.add(g);
      return { g, plank, ghost, b, up: null };
    });
    this.setBridges({ flip: 0 }, true);
  }
  setBridges(st, instant = false) {
    for (const br of this.bridges) {
      const up = (br.b.up0 ? 1 : 0) ^ ((st.flip >> br.b.color) & 1);
      if (br.up === up) continue;
      br.up = up;
      const from = br.plank.position.y,
        to = up ? 0 : -2.5;
      br.ghost.visible = !up;
      if (instant) {
        br.plank.position.y = to;
        br.plank.visible = !!up;
        continue;
      }
      br.plank.visible = true;
      this.tween(0.6, (p) => {
        const e = up ? 1 - Math.pow(1 - p, 3) : p * p;
        br.plank.position.y = from + (to - from) * e;
        if (p === 1) br.plank.visible = !!up;
      });
      const at = br.g.position.clone();
      at.y = 0.3;
      this.burst(at, 20, [KEY_COLORS[br.b.color], "#ffffff"], 3);
    }
  }
  buildExit(m, th, wi) {
    const G = this.levelGroup;
    const g = new T.Group();
    this.center(m.exit, 0, g.position);
    g.position.z -= S / 2;
    const mat = glossy(th.arch, { emissive: new T.Color(th.arch), emissiveIntensity: 0.3 });
    for (const s of [-1, 1]) {
      const p = new T.Mesh(new T.CylinderGeometry(0.2, 0.24, 2, 16), mat);
      p.position.set(s * 0.95, 1, 0);
      g.add(p);
    }
    const arc = new T.Mesh(new T.TorusGeometry(0.95, 0.2, 12, 30, pie), mat);
    arc.position.y = 2;
    g.add(arc);
    // Звёздочка на арке
    const star = new T.Mesh(new T.OctahedronGeometry(0.28, 0), new T.MeshStandardMaterial({ color: "#ffe14a", emissive: glowColor("#ffd84a", 1.6), toneMapped: false }));
    star.position.y = 3.05;
    g.add(star, glowSprite("#ffe88a", 2.4, 0.7));
    g.children[g.children.length - 1].position.y = 3.05;
    // Волшебное свечение в проёме
    const portal = glowSprite(th.arch, 3.2, 0.45);
    portal.position.y = 1.1;
    g.add(portal);
    // Площадка за выходом и друг
    const pad = new T.Mesh(new RoundedBoxGeometry(S * 1.6, 0.4, S * 1.3, 2, 0.15), matte(th.floor[1]));
    pad.position.set(0, -0.2, -S * 0.8);
    pad.receiveShadow = true;
    g.add(pad);
    const friend = FRIENDS[wi]();
    friend.position.set(0, 0, -S * 0.75);
    friend.scale.setScalar(1.6);
    friend.traverse((o) => o.isMesh && (o.castShadow = true));
    g.add(friend);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    G.add(g);
    this.exit = { g, star, friend, portal };
  }
  buildDecor(m, th, wi, r) {
    const G = this.levelGroup;
    const W = m.w * S,
      H = m.h * S;
    const spots = [];
    for (let k = 0; k < 46; k++) {
      const a = r() * pie * 2,
        d = 1.6 + r() * 9;
      let x = Math.cos(a) * (W / 2 + d),
        z = Math.sin(a) * (H / 2 + d);
      if (Math.abs(x) < W / 2 + 1.4 && Math.abs(z) < H / 2 + 1.4) continue;
      // Не между камерой и лабиринтом (камера смотрит с юга)
      if (z > H / 2 - 1 && Math.abs(x) < W / 2 + 6) continue;
      // Не перед выходом
      if (z < -H / 2 && Math.abs(x - this.exit.g.position.x) < 3.2) continue;
      // Высокое (деревья, башни) — подальше от краёв и не в южной половине, чтобы не закрывало лабиринт
      const far = Math.abs(x) > W / 2 + 2.5 || z < -H / 2 - 2.5;
      spots.push([x, z, r(), far && z < H / 2 - 3]);
    }
    for (const [x, z, k0, tall] of spots) {
      let o;
      // Невысокое (цветы, кристаллы, грибы) можно и ближе
      const k = tall ? k0 : 0.99;
      if (wi === 0) o = k < 0.5 ? this.tree(r, "#5fc062", "#8a5a3a") : this.flowers(r);
      else if (wi === 1) o = k < 0.25 ? this.tower(r) : k < 0.7 ? this.tree(r, "#7fd06a", "#8a5a3a") : this.flowers(r);
      else if (wi === 2) o = k < 0.55 ? this.pine(r, true) : this.crystal(r);
      else if (wi === 3) o = k < 0.75 ? this.pine(r, false) : this.mushroom(r);
      else o = k < 0.4 ? this.balloon(r) : tall ? this.cloudPuff(r) : this.balloon(r);
      o.position.set(x, wi === 4 ? -0.5 - r() * 3 : -0.62, z);
      G.add(o);
    }
    if (wi === 4) {
      // Радуга за лабиринтом
      const cols = ["#ff5f6d", "#ffa04a", "#ffe14a", "#5fd06a", "#5fb4ff", "#9f7bff"];
      cols.forEach((c, i) => {
        const arc = new T.Mesh(new T.TorusGeometry(H * 0.75 + 6 - i * 0.7, 0.36, 8, 60, pie), new T.MeshStandardMaterial({ color: c, emissive: new T.Color(c), emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }));
        arc.position.set(0, -4, -H / 2 - 10);
        G.add(arc);
      });
    }
    if (th.night) {
      const moon = new T.Mesh(new T.SphereGeometry(4, 24, 16), new T.MeshBasicMaterial({ color: glowColor("#fff4d0", 1.4), fog: false, toneMapped: false }));
      moon.position.set(-W * 0.8 - 10, 30, -H - 40);
      G.add(moon);
    }
  }
  tree(r, leaf, trunk) {
    const g = new T.Group();
    const t = new T.Mesh(new T.CylinderGeometry(0.22, 0.3, 1.6, 8), matte(trunk));
    t.position.y = 0.8;
    g.add(t);
    const c = new T.Color(leaf).offsetHSL((r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.1);
    for (let k = 0; k < 3; k++) {
      const b = new T.Mesh(new T.SphereGeometry(0.9 - k * 0.15, 14, 10), matte(c));
      b.position.set((r() - 0.5) * 0.6, 1.9 + k * 0.55, (r() - 0.5) * 0.6);
      g.add(b);
    }
    // Яблочки
    for (let k = 0; k < 4; k++) {
      const a = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), glossy("#ff4f5a"));
      const ang = r() * pie * 2;
      a.position.set(Math.cos(ang) * 0.8, 1.9 + r() * 0.8, Math.sin(ang) * 0.8);
      g.add(a);
    }
    g.scale.setScalar(0.9 + r() * 0.7);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  flowers(r) {
    const g = new T.Group();
    const cols = ["#ff6fa8", "#ffe14a", "#ffffff", "#ff9f4a", "#c79bff", "#5fb4ff"];
    for (let k = 0; k < 6; k++) {
      const f = new T.Group();
      const stem = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.5, 5), matte("#3fa04a"));
      stem.position.y = 0.25;
      const head = new T.Mesh(new T.SphereGeometry(0.16, 10, 8), matte(cols[(r() * cols.length) | 0], { roughness: 0.5 }));
      head.scale.y = 0.6;
      head.position.y = 0.52;
      f.add(stem, head);
      f.position.set((r() - 0.5) * 1.4, 0, (r() - 0.5) * 1.4);
      g.add(f);
    }
    return g;
  }
  tower(r) {
    const g = new T.Group();
    const h = 3 + r() * 2;
    const t = new T.Mesh(new T.CylinderGeometry(0.9, 1, h, 16), matte("#d8c8f2", { map: brickTex }));
    t.position.y = h / 2;
    const roof = new T.Mesh(new T.ConeGeometry(1.15, 1.6, 16), glossy(["#ff6fa8", "#5fb4ff", "#ffc533"][(r() * 3) | 0]));
    roof.position.y = h + 0.8;
    const flag = new T.Mesh(new T.PlaneGeometry(0.6, 0.35), new T.MeshStandardMaterial({ color: "#ffe14a", side: T.DoubleSide }));
    flag.position.set(0.3, h + 1.9, 0);
    const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.7, 5), matte("#ffffff"));
    pole.position.y = h + 1.8;
    g.add(t, roof, flag, pole);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  pine(r, snowy) {
    const g = new T.Group();
    const t = new T.Mesh(new T.CylinderGeometry(0.15, 0.2, 0.8, 6), matte("#6a4a32"));
    t.position.y = 0.4;
    g.add(t);
    const green = new T.Color(snowy ? "#3f9a7a" : "#1f5a3a").offsetHSL(0, 0, (r() - 0.5) * 0.08);
    for (let k = 0; k < 3; k++) {
      const c = new T.Mesh(new T.ConeGeometry(1.1 - k * 0.28, 1.2, 10), matte(green));
      c.position.y = 1.1 + k * 0.7;
      g.add(c);
      if (snowy) {
        const s = new T.Mesh(new T.ConeGeometry(0.75 - k * 0.2, 0.5, 10), matte("#ffffff"));
        s.position.y = 1.5 + k * 0.7;
        g.add(s);
      }
    }
    g.scale.setScalar(1 + r() * 1.2);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }
  crystal(r) {
    const g = new T.Group();
    const c = ["#9fe8ff", "#c8b8ff", "#ffffff"][(r() * 3) | 0];
    for (let k = 0; k < 3; k++) {
      const m = new T.Mesh(new T.OctahedronGeometry(0.4, 0), new T.MeshPhysicalMaterial({ color: c, roughness: 0.05, clearcoat: 1, emissive: new T.Color(c), emissiveIntensity: 0.35, flatShading: true }));
      m.scale.set(0.7, 1.8 + r(), 0.7);
      m.position.set((r() - 0.5) * 0.8, 0.5, (r() - 0.5) * 0.8);
      m.rotation.z = (r() - 0.5) * 0.6;
      g.add(m);
    }
    return g;
  }
  mushroom(r) {
    const g = new T.Group();
    const c = ["#5fe8ff", "#ff7fd8", "#b8ff6a"][(r() * 3) | 0];
    const s = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 0.6, 8), matte("#f2e8d8"));
    s.position.y = 0.3;
    const cap = new T.Mesh(new T.SphereGeometry(0.4, 14, 10, 0, pie * 2, 0, pie / 2), new T.MeshStandardMaterial({ color: c, emissive: new T.Color(c), emissiveIntensity: 1.4, toneMapped: false }));
    cap.position.y = 0.58;
    g.add(s, cap, glowSprite(c, 2.2, 0.5));
    g.children[2].position.y = 0.7;
    g.scale.setScalar(0.8 + r() * 0.8);
    return g;
  }
  balloon(r) {
    const g = new T.Group();
    const c = ["#ff5f8f", "#ffc533", "#5fb4ff", "#8dff8a", "#c79bff"][(r() * 5) | 0];
    const b = new T.Mesh(new T.SphereGeometry(0.6, 16, 12), glossy(c));
    b.scale.y = 1.2;
    b.position.y = 3 + r() * 2;
    const s = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 2.5, 4), matte("#ffffff"));
    s.position.y = b.position.y - 1.9;
    g.add(b, s);
    g.userData.bob = r() * 6;
    (this.bobbers ||= []).push(g);
    return g;
  }
  cloudPuff(r) {
    const g = new T.Group();
    for (let k = 0; k < 4; k++) {
      const p = new T.Mesh(new T.SphereGeometry(0.8 + r() * 0.6, 14, 10), matte("#ffffff", { roughness: 1 }));
      p.position.set((k - 1.5) * 0.9, r() * 0.4, (r() - 0.5) * 0.6);
      g.add(p);
    }
    return g;
  }

  // ---------- Котёнок, ниточка, следы ----------
  placeHero(dt) {
    const p = this.hero;
    const c = this.cat;
    c.g.position.copy(p);
    // Поворот к направлению движения
    const want = Math.atan2(this.heroDir.x, this.heroDir.z);
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dt ? dy * Math.min(1, dt * 14) : dy;
    c.g.rotation.y = this.yaw;
    // Клубочек катится перед котёнком
    const bp = this.ballPos || (this.ballPos = new T.Vector3());
    const prev = bp.clone();
    bp.copy(p).addScaledVector(this.heroDir, 0.56);
    bp.y = this.ball.r;
    this.ball.g.position.copy(bp);
    const move = bp.clone().sub(prev);
    move.y = 0;
    const dist = move.length();
    if (dist > 1e-4 && dist < 2) {
      const axis = new T.Vector3(move.z, 0, -move.x).normalize();
      this.ball.mesh.rotateOnWorldAxis(axis, dist / this.ball.r);
    }
    if (this.lamp.intensity) this.lamp.position.set(p.x, 3.4, p.z + 0.6);
  }
  // Ниточка: центры клеток со стека, скруглённые; конец — у клубочка
  rebuildThread(base = this.stack) {
    const pts = base.map((c) => this.center(c, 0.07));
    if (pts.length < 2) {
      this.thread.visible = false;
      this.threadEnd = pts[0];
      return;
    }
    const poly = rounded(pts, 0.6);
    const curve = new T.CatmullRomCurve3(poly.pts, false, "catmullrom", 0.05);
    this.thread.geometry.dispose();
    this.thread.geometry = new T.TubeGeometry(curve, Math.min(900, poly.pts.length * 3), 0.06, 6, false);
    this.thread.visible = true;
    this.threadEnd = pts[pts.length - 1];
  }
  updateTail() {
    const a = this.threadEnd;
    const b = this.ballPos.clone().addScaledVector(this.heroDir, -0.18);
    b.y = 0.07;
    if (!a || a.distanceTo(b) < 0.05) {
      this.tail.visible = false;
      return;
    }
    const curve = new T.LineCurve3(a.clone(), b);
    this.tail.geometry.dispose();
    this.tail.geometry = new T.TubeGeometry(curve, 2, 0.06, 6, false);
    this.tail.visible = true;
  }
  addPaw(c, dir) {
    const key = c + ":" + dir;
    if (this.pawSeen.has(key) || this.pawMesh.count >= this.pawMesh.instanceMatrix.count) return;
    this.pawSeen.add(key);
    const d = this.dummy;
    const p = this.center(c, 0.02);
    const side = new T.Vector3(-DY[dir], 0, DX[dir]);
    for (const s of [-1, 1]) {
      if (this.pawMesh.count >= this.pawMesh.instanceMatrix.count) break;
      d.position.copy(p).addScaledVector(side, s * 0.2).addScaledVector(new T.Vector3(DX[dir], 0, DY[dir]), s * 0.3);
      d.rotation.set(0, -Math.atan2(DX[dir], -DY[dir]), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.pawMesh.setMatrixAt(this.pawMesh.count++, d.matrix);
    }
    this.pawMesh.instanceMatrix.needsUpdate = true;
  }
  // Пробежка по клеткам. onCell(i) — котёнок добежал до path[i]; onLeave(i) — отправляется к path[i]
  walk(res, from, onCell, onLeave) {
    const cells = [from, ...res.path];
    const poly = rounded(
      cells.map((c) => this.center(c)),
      0.62,
    );
    this.showArrows(null);
    this.hintFade();
    return new Promise((done) => {
      this.walking = { res, cells, poly, s: 0, k: 0, onCell, onLeave, done, slow: new Set(res.events.filter((e) => e.type === "door").map((e) => e.at)) };
      this.segmentStart(0);
    });
  }
  segmentStart(k) {
    const w = this.walking;
    const next = w.cells[k + 1];
    // Назад по нитке — сматываем
    const st = this.stack;
    w.base = st.length >= 2 && st[st.length - 2] === next ? st.slice(0, -1) : st;
    this.rebuildThread(w.base);
    if (w.onLeave) w.onLeave(k);
  }
  stepWalk(dt) {
    const w = this.walking;
    if (!w) return;
    const sliding = w.res.slide[w.k];
    const door = w.slow.has(w.k);
    const v = (sliding ? SLIDE : RUN) * S * (door ? 0.45 : 1);
    // Разгон в начале и торможение у конца
    const rest = w.poly.total - w.s;
    const ease = Math.min(1, 0.35 + w.s / 1.2) * Math.min(1, 0.25 + rest / 1.4);
    w.s = Math.min(w.poly.total, w.s + v * ease * dt);
    const prev = this.hero.clone();
    sample(w.poly, w.s, this.hero);
    const dir = this.hero.clone().sub(prev);
    if (dir.lengthSq() > 1e-8) this.heroDir.copy(dir.normalize());
    this.heroSliding = sliding;
    // Добежали до следующей клетки
    while (w.k < w.cells.length - 1 && w.s >= w.poly.mid[w.k + 1] - 1e-6) {
      w.k++;
      const c = w.cells[w.k];
      const d = [0, 1, 2, 3].find((e) => nb(this.m, w.cells[w.k - 1], e) === c);
      threadStep(this.stack, c);
      this.addPaw(c, d);
      if (w.onCell) w.onCell(w.k - 1);
      if (w.k < w.cells.length - 1) this.segmentStart(w.k);
      else this.rebuildThread(this.stack);
    }
    if (w.s >= w.poly.total - 1e-6 && w.k >= w.cells.length - 1) {
      this.walking = null;
      this.heroSliding = false;
      this.hero.copy(this.center(w.cells[w.cells.length - 1]));
      w.done();
    }
  }
  // Котёнок упёрся: прыжок к стенке и назад
  bump(d) {
    const from = this.hero.clone();
    this.heroDir.set(DX[d], 0, DY[d]);
    this.showArrows(null);
    return this.tween(0.36, (p) => {
      const k = Math.sin(p * pie) * 0.32;
      this.hero.copy(from).addScaledVector(this.heroDir, k);
      this.cat.body.scale.set(1 + k * 0.4, 1 - k * 0.5, 1 + k * 0.4);
      if (p === 1) {
        this.hero.copy(from);
        this.cat.body.scale.set(1, 1, 1);
      }
    });
  }
  showArrows(dirs) {
    this.arrowsWant = dirs;
    if (dirs) this.arrows.forEach((a, d) => (a.visible = dirs.includes(d)));
  }

  // ---------- События ----------
  takeItem(i) {
    const it = this.items[i];
    if (!it || it.taken) return;
    it.taken = true;
    this.joyAt = this.time;
    const at = it.g.position.clone();
    this.burst(at, 34, [it.color, "#ffffff", "#ffe14a"], 4);
    const s0 = it.g.scale.x;
    this.tween(0.45, (p) => {
      it.g.position.y = at.y + p * 1.6;
      it.g.scale.setScalar(s0 * (1 + p * 0.6) * (1 - p));
      if (p === 1) it.g.visible = false;
    });
  }
  takeKey(color) {
    const k = this.keys.find((x) => x.color === color && !x.taken);
    if (!k) return;
    k.taken = true;
    const at = k.g.position.clone();
    this.burst(at, 40, [KEY_COLORS[color], "#ffffff", "#ffe14a"], 4.5);
    this.tween(0.7, (p) => {
      k.g.position.y = at.y + Math.sin(p * pie) * 1.2;
      k.g.rotation.y += 0.4;
      k.g.scale.setScalar(1.5 * (1 - p * p));
      if (p === 1) k.g.visible = false;
    });
  }
  openDoor(color) {
    const dr = this.doors.find((x) => x.door.color === color && !x.open);
    if (!dr) return;
    dr.open = true;
    const at = dr.g.position.clone();
    at.y = 1;
    this.burst(at, 50, [KEY_COLORS[color], "#ffe14a", "#ffffff"], 5);
    this.tween(0.5, (p) => {
      dr.bars.position.y = -1.45 * p * p;
      dr.keyIcon.scale.setScalar(1 + p * 0.6);
      dr.keyIcon.position.y = dr.keyIcon.userData.y + p * 1.2;
      dr.keyIcon.traverse((o) => o.material && ((o.material.transparent = true), (o.material.opacity = 1 - p)));
      dr.seal.material.opacity = 0.6 * (1 - p);
      if (p === 1) dr.keyIcon.visible = dr.seal.visible = false;
    });
  }
  lockedShake(color) {
    const dr = this.doors.find((x) => x.door.color === color && !x.open);
    if (!dr) return;
    this.tween(0.45, (p) => (dr.bars.position.x = Math.sin(p * pie * 6) * 0.06 * (1 - p)));
    this.tween(0.8, (p) => {
      dr.keyIcon.scale.setScalar(1 + Math.sin(p * pie) * 0.45);
      dr.keyIcon.rotation.z = Math.sin(p * pie * 6) * 0.25 * (1 - p);
    });
  }
  pressButton(color, st) {
    const b = this.buttons.find((x) => x.color === color);
    if (b) {
      this.tween(0.4, (p) => (b.pad.scale.y = 1 - Math.sin(p * pie) * 0.6));
      const at = b.g.position.clone();
      at.y = 0.4;
      this.burst(at, 30, [KEY_COLORS[color], "#ffffff"], 3.5);
    }
    this.setBridges(st);
  }
  gapShake(c) {
    const br = this.bridges.find((x) => x.b.cell === c);
    if (!br) return;
    this.tween(0.8, (p) => {
      br.ghost.scale.setScalar(1 + Math.sin(p * pie * 3) * 0.25);
      br.ghost.material.opacity = 0.55 + Math.sin(p * pie) * 0.4;
    });
  }
  // Подсказка: искорки по дороге, бегут от котёнка
  showHint(cells) {
    if (cells.length < 2) return;
    const poly = rounded(
      cells.map((c) => this.center(c, 0.18)),
      0.62,
    );
    this.hintDots = [];
    const n = Math.min(160, Math.floor(poly.total / 0.42));
    for (let i = 1; i <= n; i++) {
      const s = (i / n) * poly.total;
      this.hintDots.push({ p: sample(poly, s, new T.Vector3()), at: this.time + s / 7, until: this.time + s / 7 + 7 });
    }
    this.hintOrbPath = { poly, t0: this.time };
    this.hintMesh.count = this.hintDots.length;
  }
  hintFade() {
    for (const d of this.hintDots) d.until = Math.min(d.until, this.time + 0.4);
  }
  celebrate() {
    const e = this.exit;
    const top = e.g.position.clone();
    top.y = 3;
    this.confetti(top, 160);
    let k = 0;
    const fire = () => {
      if (k++ >= 6) return;
      const p = e.g.position.clone().add(new T.Vector3((Math.random() - 0.5) * 8, 5 + Math.random() * 3, -2 - Math.random() * 3));
      this.burst(p, 60, [["#ff5f8f", "#ffe14a"], ["#5fb4ff", "#ffffff"], ["#8dff8a", "#ffe14a"]][k % 3], 6);
      if (this.onFirework) this.onFirework();
      setTimeout(fire, 380);
    };
    fire();
    // Друг выпрыгивает из арки навстречу, котёнок встаёт рядом — оба лицом к камере
    const fr = e.friend,
      f0 = fr.position.clone(),
      f1 = new T.Vector3(0.55, 0, 0.6);
    const ex = e.g.position.clone().add(new T.Vector3(0, 0.7, 0.5));
    this.cam.party = { target: ex, dist: this.camera.aspect < 0.8 ? 16 : 11, pitch: 0.9 };
    this.tween(0.9, (p) => {
      fr.position.lerpVectors(f0, f1, p);
      fr.position.y = Math.sin(p * pie) * 1.1;
      fr.scale.setScalar(1.6 - p * 0.3);
      fr.rotation.y = 0;
    }).then(() =>
      this.tween(1.8, (p) => {
        fr.position.y = Math.abs(Math.sin(p * pie * 4)) * 0.35;
        fr.rotation.y = Math.sin(p * pie * 3) * 0.35;
      }),
    );
    const from = this.hero.clone(),
      to = e.g.position.clone().add(new T.Vector3(-0.5, 0, 0.65));
    this.cheer = true;
    return this.tween(0.8, (p) => {
      this.hero.copy(from).lerp(to, p);
      this.hero.y = Math.abs(Math.sin(p * pie * 2)) * 0.3;
      this.heroDir.set(0.25, 0, 1).normalize();
    });
  }
  // ---------- Камера ----------
  // Вид из-за южного края под наклоном; весь лабиринт — если клетки получаются крупными, иначе за котёнком
  fitCamera(snap = false) {
    const cam = this.camera,
      b = this.bounds;
    if (!b) return;
    const W = this.canvas.clientWidth || 1,
      Hh = this.canvas.clientHeight || 1;
    // На узком (портретном) экране смотрим круче сверху — лабиринт меньше сжат по высоте
    const pitch = W / Hh < 0.8 ? 1.12 : 0.98;
    const all = this.fitRect(b.x0 - 0.4, b.x1 + 0.4, b.z0 - 2.4, b.z1 + 0.4, pitch);
    const cellPx = (dist) => {
      this.pose(new T.Vector3(), dist, pitch);
      const p = new T.Vector3(-S / 2, 0, 0).project(cam),
        q = new T.Vector3(S / 2, 0, 0).project(cam);
      return (Math.abs(q.x - p.x) / 2) * W;
    };
    const want = clamp(Math.min(W, Hh) / 8, 40, 100);
    const pxAll = cellPx(all.dist);
    if (pxAll >= want * 0.8) {
      this.cam.mode = "all";
      this.cam.all = all;
    } else {
      // Ближе: подбираем расстояние под нужный размер клетки
      let lo = 3,
        hi = all.dist;
      for (let k = 0; k < 24; k++) {
        const m = (lo + hi) / 2;
        cellPx(m) > want ? (lo = m) : (hi = m);
      }
      this.cam.mode = "follow";
      this.cam.followDist = hi;
      this.cam.all = all;
      // Видимая область на земле при этом расстоянии
      this.pose(new T.Vector3(), hi, pitch);
      const ground = (nx, ny) => {
        const v = new T.Vector3(nx, ny, 0.5).unproject(cam);
        const dir = v.sub(cam.position).normalize();
        const t = -cam.position.y / dir.y;
        return cam.position.clone().addScaledVector(dir, t);
      };
      const tl = ground(-0.94, 0.74),
        bl = ground(-0.94, -0.84);
      this.cam.view = { halfX: Math.min(Math.abs(tl.x), Math.abs(bl.x)), zFar: tl.z, zNear: bl.z };
    }
    this.cam.pitch = pitch;
    this.cam.overview = this.fitRect(b.x0 - 0.4, b.x1 + 0.4, b.z0 - 3.2, b.z1 + 0.4, 1.2);
    if (snap) {
      const g = this.camGoal();
      this.cam.cur = { target: g.target.clone(), dist: g.dist, pitch: g.pitch };
      if (this.cam.mode === "follow") {
        // В начале — показать весь лабиринт и друга, потом подлететь к котёнку
        this.cam.cur = { ...this.cam.overview, target: this.cam.overview.target.clone() };
        this.cam.intro = this.time + 1.8;
      }
    }
  }
  pose(target, dist, pitch) {
    this.camera.position.set(target.x, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }
  fitRect(x0, x1, z0, z1, pitch) {
    const cam = this.camera;
    const pts = [];
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, WALL_H * 1.6]) pts.push(new T.Vector3(x, y, z));
    const v = new T.Vector3();
    let best = null;
    const all = [];
    for (let off = -0.4; off <= 0.4001; off += 0.05) {
      const target = new T.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2 + off * (z1 - z0));
      const fits = (dist) => {
        this.pose(target, dist, pitch);
        return pts.every((p) => {
          v.copy(p).project(cam);
          return Math.abs(v.x) <= 0.94 && v.y >= -0.84 && v.y <= 0.74 && v.z < 1;
        });
      };
      let lo = 2,
        hi = 200;
      if (!fits(hi)) continue;
      for (let k = 0; k < 26; k++) {
        const m = (lo + hi) / 2;
        fits(m) ? (hi = m) : (lo = m);
      }
      all.push({ target, dist: hi, pitch });
    }
    if (!all.length) return { target: new T.Vector3(), dist: 40, pitch };
    // Из почти одинаково близких — тот, где лабиринт по центру экрана (между шапкой и низом)
    const dmin = Math.min(...all.map((x) => x.dist));
    for (const x of all) {
      if (x.dist > dmin * 1.1) continue;
      this.pose(x.target, x.dist, pitch);
      let lo = 9,
        hi = -9;
      for (const p of pts) {
        v.copy(p).project(cam);
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
      }
      x.off = Math.abs((lo + hi) / 2) + (x.dist / dmin - 1) * 2;
      if (!best || x.off < best.off) best = x;
    }
    return best;
  }
  camGoal() {
    const c = this.cam;
    if (c.party) return c.party;
    if (c.look || (c.intro && this.time < c.intro)) return c.overview;
    if (c.mode === "all") return c.all;
    const b = this.bounds,
      v = c.view;
    const t = new T.Vector3(this.hero.x, 0, this.hero.z);
    const lx = b.x0 - 0.6 + v.halfX,
      hx = b.x1 + 0.6 - v.halfX;
    t.x = lx > hx ? 0 : clamp(t.x, lx, hx);
    const lz = b.z0 - 2.6 - v.zFar,
      hz = b.z1 + 0.6 - v.zNear;
    t.z = lz > hz ? (lz + hz) / 2 : clamp(t.z, lz, hz);
    return { target: t, dist: c.followDist, pitch: c.pitch };
  }
  overview(on) {
    this.cam.look = on ? 1 : 0;
    this.cam.intro = 0;
  }
  // Куда на экране показывает каждое направление из клетки котёнка (для свайпов)
  screenDirs() {
    const cam = this.camera;
    const h = this.hero.clone(),
      W = this.canvas.clientWidth,
      Hh = this.canvas.clientHeight;
    const p0 = h.clone().project(cam);
    const sx = (p0.x + 1) * 0.5 * W,
      sy = (1 - p0.y) * 0.5 * Hh;
    const dirs = [0, 1, 2, 3].map((d) => {
      const q = h.clone().add(new T.Vector3(DX[d] * S, 0, DY[d] * S)).project(cam);
      const x = (q.x + 1) * 0.5 * W - sx,
        y = (1 - q.y) * 0.5 * Hh - sy;
      const l = Math.hypot(x, y) || 1;
      return { x: x / l, y: y / l };
    });
    return { x: sx, y: sy, dirs };
  }

  // ---------- Частицы ----------
  makeParticles() {
    const n = 500;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.08, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    const c = 260;
    this.conf = new T.InstancedMesh(new T.PlaneGeometry(0.14, 0.24), new T.MeshBasicMaterial({ side: T.DoubleSide }), c);
    this.conf.frustumCulled = false;
    this.confPool = Array.from({ length: c }, () => ({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Vector3(), life: 0 }));
    this.confNext = 0;
    const cols = ["#ff4f6d", "#ffc533", "#3fdc7a", "#3fb4ff", "#8f5bff", "#ff8fd0"];
    for (let i = 0; i < c; i++) this.conf.setColorAt(i, new T.Color(cols[i % cols.length]));
    // Пыльца, снежинки, светлячки в воздухе
    const m = 160;
    const pos = new Float32Array(m * 3);
    this.moteData = [];
    for (let i = 0; i < m; i++) this.moteData.push({ x: (Math.random() - 0.5) * 40, y: Math.random() * 8, z: (Math.random() - 0.5) * 40, ph: Math.random() * 6 });
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    this.motes = new T.Points(geo, new T.PointsMaterial({ map: glowTexFor(), size: 0.35, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    this.motes.frustumCulled = false;
    this.scene.add(this.sparks, this.conf, this.motes);
    this.dummy = new T.Object3D();
  }
  burst(at, count, colors, speed) {
    if (this.motion.matches) count = Math.ceil(count / 3);
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, glowColor(colors[k % colors.length], 1.6));
      this.next = (this.next + 1) % this.pool.length;
      s.p.copy(at);
      s.v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
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
      s.v.set((Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 5);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.life = 2.2 + Math.random();
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
    if (this.m) {
      this.stepWalk(dt);
      this.animateHero(dt, t);
      this.animateThings(dt, t);
      this.moveCamera(dt);
    }
    this.animateParticles(dt, t);
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
  animateHero(dt, t) {
    this.placeHero(dt);
    const c = this.cat;
    const moving = !!this.walking && !this.heroSliding;
    this.gait = (this.gait || 0) + dt * (moving ? 16 : 0);
    const g = this.gait;
    c.legs.forEach((leg, i) => (leg.rotation.x = moving ? Math.sin(g + (i % 2 ? pie : 0) + (i > 1 ? pie : 0)) * 0.7 : leg.rotation.x * 0.8));
    c.body.position.y = moving ? Math.abs(Math.sin(g)) * 0.08 : this.cheer ? 0 : Math.sin(t * 2.4) * 0.012;
    c.body.rotation.x = this.heroSliding ? -0.18 : moving ? 0.08 : 0;
    c.tail.rotation.z = Math.sin(t * (moving ? 9 : 2.5)) * (moving ? 0.35 : 0.22);
    c.head.rotation.z = this.heroSliding ? Math.sin(t * 8) * 0.12 : Math.sin(t * 1.3) * 0.05;
    // Моргание
    const blink = t % 3.6 < 0.12 ? 0.1 : 1;
    c.eyes.forEach((e) => (e.scale.y = blink));
    // Ушки подрагивают: по очереди, раз в пару секунд
    (c.head.userData.ears || []).forEach((e, i) => {
      const k = (t * 0.7 + i * 0.37) % 2.6;
      e.rotation.x = k < 0.25 ? Math.sin((k / 0.25) * pie * 2) * 0.35 : 0;
    });
    // Радость от находки: котёнок подпрыгивает и вытягивается
    const joy = clamp(1 - (t - (this.joyAt ?? -9)) / 0.55, 0, 1);
    if (joy > 0 && !this.cheer) {
      const up = Math.sin((1 - joy) * pie);
      c.body.position.y += up * 0.35;
      c.g.scale.set(1.25 * (1 - up * 0.08), 1.25 * (1 + up * 0.14), 1.25 * (1 - up * 0.08));
    } else if (!this.cheer) c.g.scale.setScalar(1.25);
    // Стоит на месте — с любопытством поглядывает на ближайшую находку
    let lookY = 0;
    if (!moving && !this.cheer) {
      let best = 4.5 * 4.5,
        near = null;
      for (const it of this.items || []) {
        if (it.taken) continue;
        const d2 = it.g.userData.base.distanceToSquared(this.hero);
        if (d2 < best) (best = d2), (near = it.g.userData.base);
      }
      if (near) {
        const want = Math.atan2(near.x - this.hero.x, near.z - this.hero.z) - c.g.rotation.y;
        lookY = clamp(Math.atan2(Math.sin(want), Math.cos(want)), -0.7, 0.7);
      }
    }
    c.head.rotation.y += (lookY - c.head.rotation.y) * Math.min(1, dt * 5);
    // Ниточка до клубочка
    this.updateTail();
    // Стрелки «куда можно»: светятся и покачиваются
    const want = this.arrowsWant && !this.walking ? 1 : 0;
    this.arrowsOn += (want - this.arrowsOn) * Math.min(1, dt * 6);
    this.arrowMat.opacity = this.arrowsOn * (0.65 + Math.sin(t * 5) * 0.25);
    this.arrows.forEach((a, d) => {
      a.position.copy(this.hero).add(new T.Vector3(DX[d], 0, DY[d]).multiplyScalar(0.95 + Math.sin(t * 5) * 0.08));
      a.position.y = 0.08;
      if (!this.arrowsOn) a.visible = false;
    });
  }
  animateThings(dt, t) {
    for (const it of this.items || [])
      if (!it.taken) {
        it.g.position.y = it.g.userData.base.y + Math.sin(t * 2.2 + it.g.userData.ph) * 0.1;
        it.g.rotation.y = t * 1.4 + it.g.userData.ph;
        if (this.wi === 3) {
          it.g.position.x = it.g.userData.base.x + Math.sin(t * 1.3 + it.g.userData.ph) * 0.2;
          it.g.position.z = it.g.userData.base.z + Math.cos(t * 1.1 + it.g.userData.ph) * 0.2;
        }
      }
    for (const k of this.keys || []) if (!k.taken) (k.g.rotation.y = t * 1.8), (k.g.position.y = k.g.userData.base.y + Math.sin(t * 2.5) * 0.12);
    // Замки на воротах смотрят в камеру и покачиваются
    for (const d of this.doors || [])
      if (!d.open) {
        const k = d.keyIcon;
        k.rotation.y = Math.atan2(this.camera.position.x - k.position.x, this.camera.position.z - k.position.z);
        k.position.y = k.userData.y + Math.sin(t * 2.2) * 0.08;
        d.seal.material.opacity = 0.45 + Math.sin(t * 3) * 0.15;
      }
    if (this.exit) {
      this.exit.star.rotation.y = t * 1.6;
      this.exit.portal.material.opacity = 0.35 + Math.sin(t * 2.5) * 0.12;
      if (!this.cheer) {
        this.exit.friend.rotation.y = Math.sin(t * 0.9) * 0.25;
        // Друг замечает котёнка и нетерпеливо подпрыгивает, когда тот уже близко
        const fp = this.exit.friend.getWorldPosition(new T.Vector3());
        const close = clamp(1 - fp.distanceTo(this.hero) / (S * 3.2), 0, 1);
        this.exit.friend.position.y = Math.abs(Math.sin(t * 7)) * 0.3 * close;
      }
    }
    // Бабочки в цветущем саду
    if (this.wi === 0 && !this.motion.matches) {
      if (!this.flies) {
        const wingGeo = new T.PlaneGeometry(0.22, 0.28);
        wingGeo.translate(0.11, 0, 0);
        wingGeo.rotateX(-pie / 2);
        this.flies = ["#ff8fc7", "#ffd84a", "#8fd0ff"].map((col, i) => {
          const g = new T.Group();
          const mat = new T.MeshBasicMaterial({ color: col, side: T.DoubleSide });
          const wings = [1, -1].map((sd) => {
            const h = new T.Group();
            h.scale.x = sd;
            h.add(new T.Mesh(wingGeo, mat));
            g.add(h);
            return h;
          });
          this.scene.add(g);
          return { g, wings, ph: i * 2.1 };
        });
      }
      for (const f of this.flies) {
        f.g.visible = true;
        const a = t * 0.5 + f.ph;
        const at = (q, v) => v.set(this.hero.x + Math.sin(q) * (3 + f.ph * 0.4), 1.5 + Math.sin(q * 2.3) * 0.4, this.hero.z + Math.cos(q * 1.3) * 2.6);
        f.g.lookAt(at(a + 0.03, new T.Vector3()));
        at(a, f.g.position);
        f.g.position.y += Math.sin(t * 8 + f.ph) * 0.06;
        const flap = Math.sin(t * 17 + f.ph) * 0.95;
        f.wings[0].rotation.z = flap;
        f.wings[1].rotation.z = -flap;
      }
    } else for (const f of this.flies || []) f.g.visible = false;
    for (const s of this.twinkles || []) if (s.parent) s.material.opacity = 0.25 + Math.max(0, Math.sin(t * 2 + s.userData.tw)) * 0.75;
    for (const b of this.bobbers || []) if (b.parent) b.position.y = -1 + Math.sin(t * 0.8 + b.userData.bob) * 0.4;
    // Подсказка
    const d = this.dummy;
    let live = 0;
    this.hintDots.forEach((h, i) => {
      const a = clamp((t - h.at) / 0.25, 0, 1) * clamp((h.until - t) / 0.6, 0, 1);
      if (a > 0) live++;
      d.position.copy(h.p);
      d.position.y += Math.sin(t * 6 + i * 0.6) * 0.05;
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(a * (0.8 + Math.sin(t * 8 + i) * 0.25));
      d.updateMatrix();
      this.hintMesh.setMatrixAt(i, d.matrix);
    });
    this.hintMesh.instanceMatrix.needsUpdate = true;
    if (!live && this.hintDots.length && t > this.hintDots[this.hintDots.length - 1].at) {
      this.hintDots = [];
      this.hintMesh.count = 0;
    }
    const ho = this.hintOrbPath;
    if (ho) {
      const s = (t - ho.t0) * 7;
      if (s > ho.poly.total + 1) {
        this.hintOrb.material.opacity *= 0.9;
        if (this.hintOrb.material.opacity < 0.02) this.hintOrbPath = null;
      } else {
        sample(ho.poly, s, this.hintOrb.position);
        this.hintOrb.position.y = 0.5;
        this.hintOrb.material.opacity = 0.95;
      }
    }
  }
  moveCamera(dt) {
    const goal = this.camGoal();
    const c = this.cam;
    if (!c.cur) c.cur = { target: goal.target.clone(), dist: goal.dist, pitch: goal.pitch };
    const k = 1 - Math.exp(-dt * (c.party ? 1.6 : c.look || (c.intro && this.time < c.intro + 1.5) ? 2.6 : 4));
    c.cur.target.lerp(goal.target, k);
    c.cur.dist += (goal.dist - c.cur.dist) * k;
    c.cur.pitch += (goal.pitch - c.cur.pitch) * k;
    this.pose(c.cur.target, c.cur.dist, c.cur.pitch);
    this.scene.fog.near = c.cur.dist * 1.2 + 10;
    this.scene.fog.far = c.cur.dist * 2.5 + 60;
  }
  animateParticles(dt, t) {
    const d = this.dummy;
    this.pool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 3 * dt;
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
    // Пылинки в воздухе вокруг камеры
    const pos = this.motes.geometry.attributes.position;
    const ct = this.cam.cur ? this.cam.cur.target : new T.Vector3();
    const snow = this.wi === 2;
    this.moteData.forEach((p, i) => {
      if (snow) {
        p.y -= dt * 0.8;
        if (p.y < 0) p.y = 8;
      }
      const x = ct.x + p.x + Math.sin(t * 0.5 + p.ph) * 0.8,
        z = ct.z + p.z + Math.cos(t * 0.4 + p.ph) * 0.8,
        y = (snow ? p.y : 0.6 + p.y * 0.6 + Math.sin(t * 0.9 + p.ph) * 0.4) + 0.2;
      pos.setXYZ(i, x, y, z);
    });
    pos.needsUpdate = true;
    this.motes.material.size = this.wi === 3 ? 0.42 : 0.3;
  }
}
function glowTexFor() {
  return canvasTexture(32, 32, (x) => {
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
  });
}
