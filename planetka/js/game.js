// «Планетка»: маленькая планета, которую можно крутить пальцем. Сажаем цветы, деревья и грибы,
// поливаем из тучки — они вырастают, и на планету приходят жители: бабочка, пчела, птица, улитка,
// кот и радуга. Проиграть нельзя, читать не нужно: всё показано картинками.
import * as T from "../vendor/three/three.module.min.js?v=d6bba6e0";

const TAU = Math.PI * 2;
const R = 3; // радиус планеты
const NEAR = Math.cos(0.19); // ближе этого к другой вещи сажать нельзя
const RAIN_REACH = Math.cos(0.5); // докуда достаёт дождь
const MAX_ITEMS = 60;
const BIG = 1.45; // всё на планете крупное, чтобы малышу было видно
const FULL_TURN = TAU * -Math.log(0.2); // начальная скорость, при которой затухающее вращение даёт один оборот
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const el = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const UP = V(0, 1, 0);

// ---------- Звук: короткие нотки без файлов ----------
const Sound = (() => {
  let ctx = null;
  let on = localStorage.getItem("planetka_mute") !== "1";
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  const tone = (f, d = 0.15, type = "sine", v = 0.18, slide = 1, delay = 0) => {
    if (!on) return;
    const a = ac(),
      t = a.currentTime + delay,
      o = a.createOscillator(),
      g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d + 0.05);
  };
  return {
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      localStorage.setItem("planetka_mute", on ? "0" : "1");
      if (on) tone(660, 0.12, "triangle");
      return on;
    },
    plant: () => tone(420, 0.14, "triangle", 0.2, 1.6),
    grow: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, "triangle", 0.16, 1, i * 0.07)),
    deny: () => tone(190, 0.1, "sine", 0.15, 0.8),
    erase: () => tone(360, 0.16, "sine", 0.16, 0.45),
    found: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.28, "triangle", 0.2, 1, i * 0.11)),
    win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, "triangle", 0.2, 1, i * 0.14)),
    rain() {
      if (!on) return;
      const a = ac(),
        len = a.sampleRate * 1.6,
        buf = a.createBuffer(1, len, a.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI) * 0.5;
      const src = a.createBufferSource(),
        lp = a.createBiquadFilter(),
        g = a.createGain();
      src.buffer = buf;
      lp.type = "bandpass";
      lp.frequency.value = 2600;
      g.gain.value = 0.22;
      src.connect(lp).connect(g).connect(a.destination);
      src.start();
    },
  };
})();

// ---------- Сцена ----------
const canvas = el("stage");
const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = T.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
scene.add(new T.HemisphereLight(0xd6ecff, 0x39407a, 1.25));
const sun = new T.DirectionalLight(0xfff0d0, 2.7);
sun.position.set(6, 7, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 30 });
sun.shadow.bias = -0.0015;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, ...extra });
const glow = (color) => new T.MeshBasicMaterial({ color });

// Звёзды и мягкое сияние вокруг планеты
{
  const n = 420,
    pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(40, 70));
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(pos, 3));
  scene.add(new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9 })));
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const x = cv.getContext("2d"),
    gr = x.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, "rgba(160,200,255,0.55)");
  gr.addColorStop(1, "rgba(160,200,255,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  const halo = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false }));
  halo.scale.setScalar(R * 3.3);
  halo.renderOrder = -1;
  scene.add(halo);
}

// Планета крутится целиком: всё, что на ней растёт и живёт, — её дети
const world = new T.Group();
scene.add(world);
const PALETTES = [
  { land: ["#6fcf5f", "#58bd57", "#8fdc6a", "#e8d58a"], petals: ["#ff6fa8", "#ffd23f", "#ffffff", "#c58bff", "#ff8a4a"], crown: ["#3fae5b", "#57c06a"] },
  { land: ["#ffb7a0", "#ff9f8f", "#ffd0a8", "#fff0c4"], petals: ["#ff4f8b", "#7fe0ff", "#ffffff", "#b77cff", "#ffe14a"], crown: ["#ff7fb0", "#ffa0c8"] },
  { land: ["#9fe6d8", "#7fd8c8", "#c4f2e6", "#ffffff"], petals: ["#ff8fd0", "#ffe98a", "#ffffff", "#7fa8ff", "#ff9f6b"], crown: ["#3fb8a0", "#62d0b4"] },
];
let palette = PALETTES[0];
let planet = null;
function buildPlanet() {
  if (planet) {
    world.remove(planet);
    planet.geometry.dispose();
  }
  const geo = new T.IcosahedronGeometry(R, 11);
  const p = geo.attributes.position,
    colors = new Float32Array(p.count * 3),
    c = new T.Color(),
    a = V(),
    seed = Math.random() * 10;
  const bump = (v) => Math.sin(v.x * 1.9 + seed) * Math.sin(v.y * 2.3 + seed * 2) * Math.sin(v.z * 2.1 + seed * 3);
  for (let i = 0; i < p.count; i++) {
    a.fromBufferAttribute(p, i);
    a.multiplyScalar(1 + bump(a) * 0.012);
    p.setXYZ(i, a.x, a.y, a.z);
  }
  for (let f = 0; f < p.count; f += 3) {
    a.set(0, 0, 0);
    for (let k = 0; k < 3; k++) a.add(V().fromBufferAttribute(p, f + k));
    a.divideScalar(3);
    const n = bump(a) + Math.sin(a.x * 4.3 + a.y * 3.1 + seed) * 0.25;
    c.set(palette.land[n > 0.42 ? 3 : n > 0.12 ? 2 : n > -0.25 ? 0 : 1]).offsetHSL(0, 0, rand(-0.02, 0.02));
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  geo.setAttribute("color", new T.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  planet = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  planet.receiveShadow = true;
  world.add(planet);
}

// Ставит вещь на поверхность: «вверх» — от центра планеты
function seat(obj, n, lift = 0) {
  obj.position.copy(n).multiplyScalar(R + lift);
  obj.quaternion.setFromUnitVectors(UP, n);
}
// Летящего ставит в точку pos носом к next
const mx = new T.Matrix4();
function fly(obj, pos, next) {
  const up = pos.clone().normalize(),
    fwd = next.clone().sub(pos);
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const right = V().crossVectors(up, fwd).normalize();
  mx.makeBasis(right, up, fwd);
  obj.quaternion.setFromRotationMatrix(mx);
  obj.position.copy(pos);
}
const shadowed = (g) => (g.traverse((o) => o.isMesh && (o.castShadow = true)), g);
const at = (m, x, y, z) => (m.position.set(x, y, z), m);

// ---------- Что растёт: у каждой вещи росток (sprout) и взрослый вид (full) ----------
const GEO = {
  ball: new T.SphereGeometry(1, 12, 9),
  low: new T.IcosahedronGeometry(1, 0),
  cyl: new T.CylinderGeometry(1, 1, 1, 8),
  cone: new T.ConeGeometry(1, 1, 4),
  box: new T.BoxGeometry(1, 1, 1),
  cap: new T.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2),
};
const part = (geo, material, sx, sy, sz) => {
  const m = new T.Mesh(geo, material);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  return m;
};
const GREEN = mat("#4caf50");
const BUILD = {
  flower(v) {
    const sprout = new T.Group(),
      full = new T.Group();
    sprout.add(at(part(GEO.cyl, GREEN, 0.02, 0.16, 0.02), 0, 0.08, 0));
    for (const s of [-1, 1]) {
      const leaf = at(part(GEO.ball, GREEN, 0.07, 0.02, 0.04), s * 0.06, 0.13, 0);
      leaf.rotation.z = s * 0.6;
      sprout.add(leaf);
    }
    const h = 0.34 + (v % 3) * 0.05;
    full.add(at(part(GEO.cyl, GREEN, 0.022, h, 0.022), 0, h / 2, 0));
    const head = new T.Group();
    head.position.y = h;
    const petal = mat(palette.petals[v % palette.petals.length], { roughness: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      head.add(at(part(GEO.ball, petal, 0.075, 0.035, 0.075), Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09));
    }
    head.add(at(part(GEO.ball, mat("#ffcf33"), 0.06, 0.05, 0.06), 0, 0.02, 0));
    head.rotation.x = 0.5;
    full.add(head);
    return { sprout, full, head };
  },
  tree(v) {
    const sprout = new T.Group(),
      full = new T.Group(),
      trunk = mat("#8a5a3a"),
      crown = mat(palette.crown[v % palette.crown.length]);
    sprout.add(at(part(GEO.cyl, trunk, 0.025, 0.18, 0.025), 0, 0.09, 0), at(part(GEO.low, crown, 0.1), 0, 0.22, 0));
    full.add(at(part(GEO.cyl, trunk, 0.075, 0.55, 0.075), 0, 0.27, 0));
    if (v % 2) {
      for (let i = 0; i < 3; i++) full.add(at(part(GEO.cone, crown, 0.42 - i * 0.1, 0.4, 0.42 - i * 0.1), 0, 0.55 + i * 0.25, 0));
    } else {
      full.add(at(part(GEO.low, crown, 0.4), 0, 0.82, 0), at(part(GEO.low, crown, 0.28), 0.2, 0.62, 0.1), at(part(GEO.low, crown, 0.26), -0.2, 0.66, -0.08));
    }
    return { sprout, full };
  },
  mushroom(v) {
    const sprout = new T.Group(),
      full = new T.Group(),
      stem = mat("#fff4e0"),
      cap = mat(["#ff5a5a", "#ff9a3c", "#c58bff"][v % 3], { roughness: 0.4 });
    sprout.add(at(part(GEO.cyl, stem, 0.03, 0.06, 0.03), 0, 0.03, 0), at(part(GEO.cap, cap, 0.06, 0.05, 0.06), 0, 0.06, 0));
    full.add(at(part(GEO.cyl, stem, 0.07, 0.2, 0.07), 0, 0.1, 0), at(part(GEO.cap, cap, 0.2, 0.15, 0.2), 0, 0.19, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      full.add(at(part(GEO.ball, glow("#ffffff"), 0.028, 0.012, 0.028), Math.cos(a) * 0.11, 0.3, Math.sin(a) * 0.11));
    }
    return { sprout, full };
  },
  house(v) {
    const sprout = new T.Group(),
      full = new T.Group(),
      wall = mat(["#ffe9c4", "#ffd0dc", "#cfe8ff", "#e3f7c8"][v % 4]),
      roof = mat(["#ff6b5a", "#7c6bff", "#ff9a3c", "#3fb8a0"][v % 4]);
    full.add(at(part(GEO.box, wall, 0.46, 0.34, 0.4), 0, 0.17, 0));
    const top = at(part(GEO.cone, roof, 0.4, 0.26, 0.36), 0, 0.47, 0);
    top.rotation.y = Math.PI / 4;
    full.add(top, at(part(GEO.box, mat("#8a5a3a"), 0.1, 0.18, 0.02), -0.08, 0.09, 0.2), at(part(GEO.box, glow("#ffe98a"), 0.11, 0.11, 0.02), 0.1, 0.2, 0.2));
    full.add(at(part(GEO.box, roof, 0.07, 0.16, 0.07), 0.12, 0.52, -0.05));
    return { sprout, full };
  },
};

// ---------- Состояние ----------
const SAVE = "planetka_save";
let items = []; // { type, n, v, grown, g, inner, sprout, full, head, phase }
let rains = 0;
let stars = 0;
let pal = 0;
let tool = "flower";
const tweens = [];
const tween = (seconds, f, ease = (p) => p) =>
  new Promise((done) => tweens.push({ t: 0, d: calm ? 0.001 : seconds, f, ease, done }));
const back = (p) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);

function save() {
  localStorage.setItem(
    SAVE,
    JSON.stringify({ pal, stars, rains, items: items.map((i) => ({ t: i.type, n: i.n.toArray().map((x) => +x.toFixed(4)), v: i.v, g: i.grown ? 1 : 0 })) }),
  );
}

function addItem(type, n, v, grown, animate) {
  const b = BUILD[type](v);
  const g = new T.Group(),
    inner = new T.Group();
  inner.add(b.sprout, b.full);
  inner.rotation.y = v * 1.7;
  g.add(inner);
  seat(g, n);
  g.scale.setScalar(BIG);
  shadowed(g);
  world.add(g);
  const it = { type, n: n.clone(), v, grown, g, inner, sprout: b.sprout, full: b.full, head: b.head, phase: Math.random() * TAU };
  b.full.scale.setScalar(grown ? 1 : 0.001);
  b.sprout.scale.setScalar(grown ? 0.001 : 1);
  b.full.visible = grown;
  b.sprout.visible = !grown;
  items.push(it);
  if (animate) {
    inner.scale.setScalar(0.001);
    tween(0.45, (p) => inner.scale.setScalar(Math.max(0.001, p)), back);
  }
  return it;
}

function grow(it, delay = 0) {
  if (it.grown) return;
  it.grown = true;
  setTimeout(() => {
    if (!items.includes(it)) return;
    it.full.visible = true;
    Sound.grow();
    burst(it.n, ["#ffffff", "#ffe98a", "#9be7ff"], 8, 0.6);
    tween(0.6, (p) => {
      it.full.scale.setScalar(Math.max(0.001, p));
      it.sprout.scale.setScalar(Math.max(0.001, 1 - p));
    }, back).then(() => (it.sprout.visible = false));
    setTimeout(checkVisitors, 700);
  }, delay * 1000);
}

function removeItem(it) {
  items.splice(items.indexOf(it), 1);
  burst(it.n, ["#ffffff", "#d9d4e6"], 10, 0.8);
  tween(0.25, (p) => it.inner.scale.setScalar(Math.max(0.001, 1 - p))).then(() => world.remove(it.g));
}

// ---------- Искры ----------
const SPARKS = 160;
const sparkMesh = new T.InstancedMesh(GEO.low, new T.MeshBasicMaterial(), SPARKS);
sparkMesh.frustumCulled = false;
world.add(sparkMesh);
const sparks = Array.from({ length: SPARKS }, () => ({ p: V(), v: V(), life: 0, max: 1, s: 0.05 }));
let sparkNext = 0;
const dummy = new T.Object3D();
const tint = new T.Color();
function burst(n, colors, count, speed, lift = 0.3) {
  for (let i = 0; i < count; i++) {
    const s = sparks[sparkNext];
    sparkMesh.setColorAt(sparkNext, tint.set(pick(colors)));
    sparkNext = (sparkNext + 1) % SPARKS;
    s.p.copy(n).multiplyScalar(R + lift);
    s.v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1)).addScaledVector(n, speed * 0.8);
    s.life = s.max = rand(0.5, 1);
    s.s = rand(0.03, 0.07);
  }
  sparkMesh.instanceColor.needsUpdate = true;
}

// ---------- Дождь ----------
const drops = [];
const cloudMat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true });
const dropMat = new T.MeshBasicMaterial({ color: "#8fd4ff", transparent: true, opacity: 0.85 });
function rain(n) {
  rains++;
  Sound.rain();
  const g = new T.Group();
  const mats = cloudMat.clone();
  for (const [x, y, z, s] of [[0, 0, 0, 0.38], [0.34, -0.03, 0.05, 0.28], [-0.33, -0.04, -0.04, 0.3], [0.05, 0.14, 0.1, 0.26]]) g.add(at(part(GEO.ball, mats, s, s * 0.8, s), x, y, z));
  seat(g, n, 1.7);
  world.add(g);
  const rainDrops = [];
  for (let i = 0; i < 26; i++) {
    const d = part(GEO.cyl, dropMat, 0.012, 0.12, 0.012);
    d.userData = { x: rand(-0.5, 0.5), z: rand(-0.4, 0.4), ph: Math.random() };
    g.add(d);
    rainDrops.push(d);
  }
  const rec = { g, mats, rainDrops, t: 0 };
  drops.push(rec);
  g.scale.setScalar(0.001);
  tween(0.3, (p) => g.scale.setScalar(Math.max(0.001, p)), back);
  // всё, что рядом, вырастает; взрослые цветы радостно качаются
  let grew = 0;
  for (const it of items) {
    if (it.n.dot(n) < RAIN_REACH) continue;
    if (!it.grown) grow(it, rand(0.5, 1.3)), grew++;
    else it.happy = performance.now();
  }
  setTimeout(checkVisitors, 1600);
  save();
  return grew;
}

// ---------- Жители ----------
const VISITORS = [
  { id: "butterfly", icon: "🦋", need: "🌼3", ok: (c) => c.flower >= 3 },
  { id: "bee", icon: "🐝", need: "🌼6", ok: (c) => c.flower >= 6 },
  { id: "bird", icon: "🐦", need: "🌳2", ok: (c) => c.tree >= 2 },
  { id: "snail", icon: "🐌", need: "🍄2", ok: (c) => c.mushroom >= 2 },
  { id: "cat", icon: "🐱", need: "🏠1", ok: (c) => c.house >= 1 },
  { id: "rainbow", icon: "🌈", need: "🌧️3", ok: (c) => c.rain >= 3 },
];
const found = new Set();
const alive = {}; // id -> { g, ... }
const dot = (r = 0.02) => part(GEO.ball, glow("#1d1420"), r);
const MAKE = {
  butterfly() {
    const g = new T.Group(),
      wm = new T.MeshStandardMaterial({ color: "#ff8fd0", side: T.DoubleSide, roughness: 0.6 });
    const wings = [1, -1].map((s) => {
      const hinge = new T.Group(),
        w = new T.Mesh(new T.CircleGeometry(0.11, 10), wm);
      w.rotation.x = -Math.PI / 2;
      w.position.x = 0.1;
      w.scale.z = 1.3;
      hinge.scale.x = s;
      hinge.add(w);
      g.add(hinge);
      return hinge;
    });
    g.add(part(GEO.ball, mat("#5b3a6b"), 0.022, 0.022, 0.09));
    return { g, wings, a: 0, target: null, until: 0 };
  },
  bee() {
    const g = new T.Group();
    g.add(part(GEO.ball, mat("#ffcf33"), 0.05, 0.05, 0.075), at(part(GEO.cyl, mat("#2a2030"), 0.052, 0.025, 0.052), 0, 0, 0));
    g.children[1].rotation.x = Math.PI / 2;
    const wm = new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, side: T.DoubleSide });
    const wings = [1, -1].map((s) => {
      const w = at(part(GEO.ball, wm, 0.05, 0.005, 0.03), s * 0.05, 0.05, 0);
      g.add(w);
      return w;
    });
    g.add(at(dot(0.012), 0.02, 0.015, 0.068), at(dot(0.012), -0.02, 0.015, 0.068));
    return { g, wings, a: 0, target: null, until: 0 };
  },
  bird() {
    const g = new T.Group(),
      body = mat("#5fb6ff");
    g.add(part(GEO.ball, body, 0.1, 0.09, 0.15), at(part(GEO.ball, body, 0.075), 0, 0.07, 0.13), at(part(GEO.cone, mat("#ffb02e"), 0.03, 0.07, 0.03), 0, 0.06, 0.22));
    g.children[2].rotation.x = Math.PI / 2;
    g.add(at(dot(0.013), 0.045, 0.09, 0.18), at(dot(0.013), -0.045, 0.09, 0.18));
    const wings = [1, -1].map((s) => {
      const hinge = new T.Group();
      hinge.add(at(part(GEO.ball, mat("#3f8fe0"), 0.13, 0.015, 0.08), 0.13, 0, 0));
      hinge.scale.x = s;
      hinge.position.y = 0.03;
      g.add(hinge);
      return hinge;
    });
    return { g, wings, a: Math.random() * TAU, axis: V(0.35, 1, 0.2).normalize() };
  },
  snail() {
    const g = new T.Group(),
      skin = mat("#ffd9a8");
    g.add(at(part(GEO.ball, skin, 0.05, 0.035, 0.13), 0, 0.03, 0), at(part(GEO.ball, mat("#c9783c", { roughness: 0.4 }), 0.085, 0.085, 0.06), 0, 0.1, -0.03));
    g.children[1].rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) g.add(at(part(GEO.cyl, skin, 0.008, 0.07, 0.008), s * 0.025, 0.08, 0.11), at(dot(0.012), s * 0.025, 0.12, 0.11));
    return { g, a: Math.random() * TAU, axis: V(1, 0.3, 0.4).normalize() };
  },
  cat() {
    const g = new T.Group(),
      fur = mat("#ff9f4a");
    g.add(at(part(GEO.ball, fur, 0.085, 0.1, 0.085), 0, 0.09, 0), at(part(GEO.ball, fur, 0.075), 0, 0.22, 0.02));
    for (const s of [-1, 1]) {
      g.add(at(part(GEO.cone, fur, 0.03, 0.05, 0.03), s * 0.045, 0.3, 0.02), at(dot(0.011), s * 0.03, 0.235, 0.088));
    }
    g.add(at(part(GEO.ball, mat("#ff7fa8"), 0.012), 0, 0.215, 0.095));
    const tail = new T.Group();
    tail.position.set(0, 0.05, -0.07);
    tail.add(at(part(GEO.cyl, fur, 0.016, 0.16, 0.016), 0, 0.08, 0));
    g.add(tail);
    return { g, tail, home: null };
  },
  rainbow() {
    const g = new T.Group();
    ["#ff5c7a", "#ff9e4a", "#ffd84a", "#5ed69a", "#58b4ff", "#a67cff"].forEach((c, i) => {
      g.add(new T.Mesh(new T.TorusGeometry(1.15 - i * 0.07, 0.036, 6, 28, Math.PI), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 })));
    });
    return { g, placed: false };
  },
};

function counts() {
  const c = { flower: 0, tree: 0, mushroom: 0, house: 0, rain: rains };
  for (const it of items) if (it.grown) c[it.type]++;
  return c;
}

function checkVisitors(quiet = false) {
  const c = counts();
  for (const v of VISITORS) {
    if (found.has(v.id) || !v.ok(c)) continue;
    found.add(v.id);
    const who = MAKE[v.id]();
    alive[v.id] = who;
    shadowed(who.g);
    world.add(who.g);
    who.g.scale.setScalar(0.001);
    tween(0.6, (p) => who.g.scale.setScalar(Math.max(0.001, p * BIG)), back);
    const slot = el("st-" + v.id);
    slot.classList.add("got");
    if (!quiet) {
      Sound.found();
      const n = items.length ? pick(items).n : V(0, 1, 0);
      burst(n, ["#ffe14a", "#ff8fd0", "#7fe0ff", "#ffffff"], 30, 1.4, 0.8);
    }
  }
  el("fresh").classList.toggle("ready", found.size === VISITORS.length);
  if (!quiet && found.size === VISITORS.length && !world.userData.won) {
    world.userData.won = true;
    stars++;
    el("stars-n").textContent = stars;
    setTimeout(() => {
      Sound.win();
      for (let i = 0; i < 8; i++) setTimeout(() => burst(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), ["#ffe14a", "#ff8fd0", "#7fe0ff", "#9bff8a", "#ffffff"], 20, 2, 1), i * 180);
      spinBoost = FULL_TURN; // ровно один оборот: сад возвращается к игроку
    }, 900);
    save();
  }
  updateHints();
}

function removeVisitors() {
  for (const id in alive) {
    world.remove(alive[id].g);
    delete alive[id];
  }
  found.clear();
  for (const v of VISITORS) el("st-" + v.id).classList.remove("got");
}

const grownOf = (type) => items.filter((i) => i.type === type && i.grown);
const tmpA = V(),
  tmpB = V();
// точка на маленьком круге вокруг n
function around(n, a, r, h, out) {
  const t1 = tmpA.crossVectors(n, Math.abs(n.y) > 0.9 ? V(1, 0, 0) : UP).normalize(),
    t2 = tmpB.crossVectors(n, t1);
  return out.copy(n).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize().multiplyScalar(R + h);
}
const p1 = V(),
  p2 = V();
function animateVisitors(t, dt) {
  for (const id of ["butterfly", "bee"]) {
    const w = alive[id];
    if (!w) continue;
    const flowers = grownOf("flower");
    if (!w.target || !items.includes(w.target) || t > w.until) {
      w.target = flowers.length ? pick(flowers) : null;
      w.until = t + rand(4, 8);
    }
    const n = w.target ? w.target.n : UP,
      fast = id === "bee" ? 2.6 : 1.3;
    w.a += dt * fast;
    const r = id === "bee" ? 0.2 : 0.32,
      h = (id === "bee" ? 0.6 : 0.78) + Math.sin(t * 3 + (id === "bee" ? 1 : 0)) * 0.06;
    around(n, w.a, r, h, p1);
    around(n, w.a + 0.2, r, h, p2);
    // плавно перелетает к новому цветку
    w.pos = (w.pos || p1.clone()).lerp(p1, Math.min(1, dt * 2.5));
    fly(w.g, w.pos, p2);
    const flap = Math.sin(t * (id === "bee" ? 60 : 16));
    if (id === "bee") w.wings.forEach((x, i) => (x.rotation.z = (i ? -1 : 1) * (0.3 + flap * 0.5)));
    else w.wings.forEach((x, i) => (x.rotation.z = (i ? -1 : 1) * flap * 1.0));
  }
  const bird = alive.bird;
  if (bird) {
    bird.a += dt * 0.55;
    const q = new T.Quaternion().setFromAxisAngle(bird.axis, bird.a),
      base = tmpA.crossVectors(bird.axis, UP).normalize();
    p1.copy(base).applyQuaternion(q).multiplyScalar(R + 1.25 + Math.sin(t * 1.3) * 0.12);
    q.setFromAxisAngle(bird.axis, bird.a + 0.1);
    p2.copy(tmpB.crossVectors(bird.axis, UP).normalize()).applyQuaternion(q).multiplyScalar(R + 1.25);
    fly(bird.g, p1, p2);
    const flap = Math.sin(t * 9) * 0.8;
    bird.wings.forEach((x, i) => (x.rotation.z = (i ? -1 : 1) * flap));
  }
  const snail = alive.snail;
  if (snail) {
    snail.a += dt * 0.035;
    const q = new T.Quaternion().setFromAxisAngle(snail.axis, snail.a),
      base = tmpA.crossVectors(snail.axis, UP).normalize();
    p1.copy(base).applyQuaternion(q).multiplyScalar(R + 0.01);
    q.setFromAxisAngle(snail.axis, snail.a + 0.05);
    p2.copy(tmpB.crossVectors(snail.axis, UP).normalize()).applyQuaternion(q).multiplyScalar(R + 0.01);
    fly(snail.g, p1, p2);
    snail.g.scale.z = BIG * (1 + Math.sin(t * 2.5) * 0.08);
  }
  const cat = alive.cat;
  if (cat) {
    const houses = grownOf("house");
    if (houses.length && (!cat.home || !items.includes(cat.home))) {
      cat.home = houses[0];
      around(cat.home.n, 1.2, 0.2, 0, p1);
      seat(cat.g, p1.clone().normalize());
    }
    cat.g.visible = houses.length > 0;
    cat.tail.rotation.z = Math.sin(t * 3) * 0.5;
    cat.tail.rotation.x = -0.5;
  }
  const rb = alive.rainbow;
  if (rb && !rb.placed) {
    rb.placed = true;
    seat(rb.g, world.userData.lastRain || V(0.3, 0.9, 0.3).normalize(), -0.05);
  }
}

// ---------- Подсказки без слов ----------
function updateHints() {
  const sprouts = items.some((i) => !i.grown);
  document.querySelector('[data-tool="rain"]').classList.toggle("pulse", sprouts && rains === 0 && tool !== "rain");
  el("hand").hidden = items.length > 0 || rains > 0;
}

// ---------- Новая планета ----------
function newPlanet(next) {
  for (const it of items) world.remove(it.g);
  items = [];
  rains = 0;
  removeVisitors();
  world.userData.won = false;
  world.userData.lastRain = null;
  if (next) pal = (pal + 1) % PALETTES.length;
  palette = PALETTES[pal];
  buildPlanet();
  el("fresh").classList.remove("ready", "ask");
  updateHints();
  save();
}

function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE) || "null");
  } catch {}
  pal = data?.pal % PALETTES.length || 0;
  stars = data?.stars || 0;
  palette = PALETTES[pal];
  buildPlanet();
  rains = data?.rains || 0;
  for (const i of data?.items || []) {
    if (BUILD[i.t] && Array.isArray(i.n)) addItem(i.t, V(...i.n).normalize(), i.v || 0, !!i.g, false);
  }
  el("stars-n").textContent = stars;
  checkVisitors(true);
  world.userData.won = found.size === VISITORS.length;
}

// ---------- Интерфейс ----------
el("stickers").innerHTML = VISITORS.map((v) => `<div class="sticker" id="st-${v.id}"><span class="who">${v.icon}</span><span class="need">${v.need}</span></div>`).join("");
const toolButtons = [...document.querySelectorAll("#tools button")];
function setTool(name) {
  tool = name;
  toolButtons.forEach((b) => b.classList.toggle("on", b.dataset.tool === name));
  updateHints();
}
toolButtons.forEach((b) =>
  b.addEventListener("click", () => {
    setTool(b.dataset.tool);
    Sound.plant();
  }),
);
el("sound").textContent = Sound.on ? "🔊" : "🔇";
el("sound").addEventListener("click", () => (el("sound").textContent = Sound.toggle() ? "🔊" : "🔇"));
// «Новая планета» — в два касания, чтобы малыш не стёр всё случайно
let askTimer = 0;
el("fresh").addEventListener("click", () => {
  const b = el("fresh");
  if (b.classList.contains("ask")) {
    clearTimeout(askTimer);
    Sound.win();
    spinBoost = FULL_TURN;
    newPlanet(true);
  } else {
    b.classList.add("ask");
    Sound.deny();
    askTimer = setTimeout(() => b.classList.remove("ask"), 2500);
  }
});

// ---------- Палец: вести — крутить планету, коснуться — действовать ----------
const ray = new T.Raycaster();
const ndc = new T.Vector2();
let drag = null;
let spinX = 0,
  spinY = 0.12,
  spinBoost = 0,
  idle = 0;
const qStep = new T.Quaternion(),
  eul = new T.Euler();
function rotate(dx, dy) {
  qStep.setFromEuler(eul.set(dy, dx, 0));
  world.quaternion.premultiply(qStep);
}
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
  spinX = spinY = 0;
  idle = 0;
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 10) drag.moved = true;
  if (drag.moved) {
    const k = 3.2 / Math.min(innerWidth, innerHeight);
    rotate(dx * k, dy * k);
    spinY = dx * k * 60;
    spinX = dy * k * 60;
  }
  drag.x = e.clientX;
  drag.y = e.clientY;
});
const release = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved) touch(e.clientX, e.clientY);
  drag = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", () => (drag = null));

function touch(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(planet, false)[0];
  if (!hit) return;
  const n = world.worldToLocal(hit.point.clone()).normalize();
  let near = null,
    best = NEAR;
  for (const it of items) {
    const d = it.n.dot(n);
    if (d > best) (best = d), (near = it);
  }
  if (tool === "erase") {
    if (near) {
      removeItem(near);
      Sound.erase();
      save();
      updateHints();
    }
    return;
  }
  if (tool === "rain") {
    world.userData.lastRain = n.clone();
    rain(n);
    updateHints();
    return;
  }
  if (near || items.length >= MAX_ITEMS) {
    // место занято: вещь качается, ничего страшного
    if (near) near.happy = performance.now();
    Sound.deny();
    return;
  }
  const it = addItem(tool, n, Math.floor(Math.random() * 12), tool === "house", true);
  Sound.plant();
  burst(n, ["#ffffff", "#9bff8a"], 6, 0.5);
  if (it.grown) setTimeout(checkVisitors, 500);
  save();
  updateHints();
}

// ---------- Кадр ----------
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // планета целиком помещается и по ширине, и по высоте (сверху наклейки, снизу инструменты)
  const need = R * 1.55,
    half = T.MathUtils.degToRad(camera.fov / 2),
    dist = Math.max(need / Math.tan(half), need / (Math.tan(half) * camera.aspect));
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

let last = 0;
function frame(ms) {
  const dt = Math.min(0.05, (ms - last) / 1000 || 0);
  last = ms;
  const t = ms / 1000;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t = Math.min(1, tw.t + dt / tw.d);
    tw.f(tw.ease(tw.t));
    if (tw.t === 1) {
      tweens.splice(i, 1);
      tw.done();
    }
  }
  // планета докручивается по инерции, а без пальца медленно вращается сама
  if (!drag) {
    idle += dt;
    spinX *= Math.pow(0.05, dt);
    spinY = spinY * Math.pow(0.05, dt) + (idle > 2.5 && !calm ? 0.1 * (1 - Math.pow(0.05, dt)) : 0);
    spinBoost *= Math.pow(0.2, dt);
    rotate((spinY + spinBoost) * dt, spinX * dt);
  }
  // растения покачиваются; тронутые и политые — радуются
  for (const it of items) {
    const joy = it.happy ? Math.max(0, 1 - (ms - it.happy) / 900) : 0;
    const sway = it.type === "house" ? 0 : Math.sin(t * 1.8 + it.phase) * 0.06;
    it.inner.rotation.z = calm ? 0 : sway + Math.sin(t * 22) * 0.16 * joy;
    if (it.head) it.head.rotation.y = t * 0.6 + it.phase;
  }
  // тучки и капли
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.t += dt;
    for (const r of d.rainDrops) {
      const u = r.userData,
        k = (d.t * 1.6 + u.ph) % 1;
      r.position.set(u.x, -0.15 - k * 1.45, u.z);
      r.visible = d.t < 1.5;
    }
    d.g.position.addScaledVector(d.g.position.clone().normalize(), Math.sin(d.t * 3) * 0.002);
    if (d.t > 1.5) d.mats.opacity = Math.max(0, 1 - (d.t - 1.5) / 0.5);
    if (d.t > 2) {
      world.remove(d.g);
      drops.splice(i, 1);
    }
  }
  animateVisitors(t, dt);
  sparks.forEach((s, i) => {
    if (s.life > 0) {
      s.life -= dt;
      s.p.addScaledVector(s.v, dt);
      s.v.multiplyScalar(Math.pow(0.2, dt));
    }
    dummy.position.copy(s.p);
    dummy.rotation.set(s.life * 6, s.life * 4, 0);
    dummy.scale.setScalar(s.life > 0 ? (s.life / s.max) * s.s : 0);
    dummy.updateMatrix();
    sparkMesh.setMatrixAt(i, dummy.matrix);
  });
  sparkMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

world.quaternion.setFromEuler(new T.Euler(0.35, 0.4, 0));
load();
setTool("flower");
resize();
requestAnimationFrame(frame);
// для проверок из консоли и тестов
window.planetka = {
  items: () => items,
  found: () => [...found],
  rain: (n) => rain(V(...n).normalize()),
  add: (type, n) => addItem(type, V(...n).normalize(), Math.floor(Math.random() * 12), true, false),
  check: () => checkVisitors(true),
  touch,
};
