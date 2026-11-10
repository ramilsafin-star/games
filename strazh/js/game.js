// «Страж орбиты»: 3D-шутер от первого лица. Игрок — стрелок турели орбитальной станции.
// Ведёшь пальцем — прицел поворачивается и лазеры стреляют (с перегревом), кнопка ракет — залп
// самонаводящихся. Дроны идут волнами: разведчики, бомбардировщики-тараны, канонерки, на каждой
// пятой волне — флагман. Щит восстанавливается, корпус — нет. Между волнами — выбор улучшения.
import * as T from "../vendor/three/three.module.min.js?v=9b5e14d1";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=9b5e14d1";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=9b5e14d1";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=9b5e14d1";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=9b5e14d1";
import { addSpace } from "./space.js?v=9b5e14d1";

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = T.MathUtils.clamp;
const el = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const hot = (hex, k = 3) => new T.Color(hex).multiplyScalar(k); // ярче белого — светится через bloom
const SAVE = "strazh_save";
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Игра работает и в браузере, запретившем сохранение.
  }
}

const RANGE = 185;
const LASER_SPEED = 360;

// ---------- Звук: всё синтезируется ----------
const Sound = (() => {
  let ctx = null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  let on = !!Audio && readStorage("strazh_mute") !== "1";
  const ac = () => {
    if (!on) return null;
    try {
      return (ctx ||= new Audio());
    } catch {
      return null;
    }
  };
  const tone = (f, d, type = "sine", v = 0.12, slide = 1, delay = 0) => {
    const a = ac();
    if (!a || a.state !== "running") return;
    const t = a.currentTime + delay,
      o = a.createOscillator(),
      g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d + 0.05);
  };
  const noise = (d, v, from, to) => {
    const a = ac();
    if (!a || a.state !== "running") return;
    const len = Math.floor(a.sampleRate * d),
      buf = a.createBuffer(1, len, a.sampleRate),
      data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource(),
      lp = a.createBiquadFilter(),
      g = a.createGain();
    src.buffer = buf;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(from, a.currentTime);
    lp.frequency.exponentialRampToValueAtTime(to, a.currentTime + d);
    g.gain.value = v;
    src.connect(lp).connect(g).connect(a.destination);
    src.start();
  };
  return {
    get on() {
      return on;
    },
    toggle() {
      on = !!Audio && !on;
      writeStorage("strazh_mute", on ? "0" : "1");
      this.unlock();
    },
    unlock() {
      const a = ac();
      if (a?.state === "suspended" || a?.state === "interrupted") a.resume().catch(() => {});
    },
    laser: () => tone(880, 0.09, "sawtooth", 0.035, 0.3),
    hit: () => tone(1500, 0.03, "square", 0.03),
    boom: (big) => noise(big ? 1.1 : 0.55, big ? 0.5 : 0.3, big ? 1800 : 2600, 80),
    shield: () => tone(140, 0.2, "sine", 0.22, 0.6),
    hull: () => (noise(0.3, 0.35, 900, 120), tone(90, 0.3, "square", 0.12, 0.7)),
    alarm: () => tone(620, 0.12, "square", 0.05),
    rocket: () => noise(0.5, 0.2, 500, 3000),
    overheat: () => tone(220, 0.35, "sawtooth", 0.07, 0.5),
    wave: () => (tone(330, 0.2, "triangle", 0.14), tone(495, 0.3, "triangle", 0.14, 1, 0.16)),
    clear: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.28, "triangle", 0.14, 1, i * 0.11)),
    pick: () => (tone(660, 0.12, "triangle", 0.14), tone(990, 0.2, "triangle", 0.14, 1, 0.09)),
    boss: () => tone(70, 1.4, "sawtooth", 0.16, 0.7),
  };
})();

// ---------- Сцена ----------
const canvas = el("stage");
const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.toneMapping = T.NeutralToneMapping;
const scene = new T.Scene();
scene.background = new T.Color("#03040b");
const camera = new T.PerspectiveCamera(62, 1, 0.1, 3000);
scene.add(camera);
scene.add(new T.HemisphereLight(0xc3dcff, 0x4d315f, 1.55));
const sun = new T.DirectionalLight(0xfff0dd, 2.6);
sun.position.set(-300, 220, 90);
const rim = new T.DirectionalLight(0x609eff, 2.1);
rim.position.set(80, 30, -150);
scene.add(sun, rim);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.63, 0.42, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const perf = { glow: true, slow: 0, seen: 0 };

const metal = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.36, flatShading: true, ...extra });
const lit = (hex, k = 3) => new T.MeshBasicMaterial({ color: hot(hex, k), toneMapped: false });
const GEO = {
  ball: new T.SphereGeometry(1, 14, 10),
  low: new T.IcosahedronGeometry(1, 0),
  oct: new T.OctahedronGeometry(1, 0),
  box: new T.BoxGeometry(1, 1, 1),
  cone: new T.ConeGeometry(1, 1, 6),
  cyl: new T.CylinderGeometry(1, 1, 1, 10),
  ring: new T.TorusGeometry(1, 0.12, 6, 28),
  wave: new T.TorusGeometry(1, 0.025, 5, 32),
};
const part = (geo, material, sx, sy, sz) => {
  const m = new T.Mesh(geo, material);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  return m;
};
const at = (m, x, y, z) => (m.position.set(x, y, z), m);

const planet = addSpace(scene);

const deck = new T.Group();
deck.add(at(part(GEO.cyl, metal("#26364d"), 9, 0.8, 9), 0, -4.4, 0));
const track = at(part(GEO.wave, lit("#47c5ff", 2.1), 8.4, 8.4, 3), 0, -3.95, 0);
track.rotation.x = Math.PI / 2;
deck.add(track);
for (let i = 0; i < 12; i++) {
  const angle = i / 12 * TAU;
  const panel = at(part(GEO.box, metal("#324967"), 0.82, 0.5, 3.8), Math.cos(angle) * 8.4, -4.25, Math.sin(angle) * 8.4);
  panel.rotation.y = -angle + Math.PI / 2;
  deck.add(panel);
}
scene.add(deck);

const glowCanvas = document.createElement("canvas");
glowCanvas.width = glowCanvas.height = 64;
const glowContext = glowCanvas.getContext("2d");
const radial = glowContext.createRadialGradient(32, 32, 1, 32, 32, 32);
radial.addColorStop(0, "rgba(255,255,255,1)");
radial.addColorStop(0.27, "rgba(255,255,255,.56)");
radial.addColorStop(0.62, "rgba(255,255,255,.12)");
radial.addColorStop(1, "rgba(255,255,255,0)");
glowContext.fillStyle = radial;
glowContext.fillRect(0, 0, 64, 64);
const glowTexture = new T.CanvasTexture(glowCanvas);
function flare(color, width, height = width) {
  const sprite = new T.Sprite(new T.SpriteMaterial({
    color,
    map: glowTexture,
    blending: T.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  sprite.scale.set(width, height, 1);
  return sprite;
}

// Две пушки закреплены на камере, а снаряды летят в координатах мира.
const guns = new T.Group();
const barrels = [-1, 1].map((side) => {
  const barrel = new T.Group();
  const casing = at(part(GEO.cyl, metal("#203753"), 0.21, 1.02, 0.21), 0, 0, -0.49);
  const tube = at(part(GEO.cyl, metal("#7897b9"), 0.118, 1.4, 0.118), 0, 0, -1.05);
  const tip = at(part(GEO.cyl, lit("#7ce6ff", 2.0), 0.146, 0.22, 0.146), 0, 0, -1.76);
  for (const cylinder of [casing, tube, tip]) cylinder.rotation.x = Math.PI / 2;
  const rail = at(part(GEO.box, lit("#2794fd", 1.5), 0.055, 0.045, 0.88), -side * 0.115, 0.14, -0.61);
  const muzzle = at(flare("#8de5ff", 0.84), 0, 0, -1.85);
  muzzle.visible = false;
  barrel.add(casing, tube, tip, rail, muzzle);
  barrel.position.set(side * 0.62, -0.46, -1.2);
  barrel.userData = { tip, muzzle, kick: 0 };
  guns.add(barrel);
  return barrel;
});
camera.add(guns);

// ---------- Пулы: лазеры, вражеские заряды, искры, вспышки ----------
function pool(geo, material, count) {
  const mesh = new T.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new T.Color(1, 1, 1));
  scene.add(mesh);
  return mesh;
}
const dummy = new T.Object3D();
const hide = (mesh, i) => {
  dummy.position.set(0, -9999, 0);
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
};
const LASERS = 60,
  BOLTS = 70,
  SPARKS = 420;
const laserMesh = pool(new T.BoxGeometry(0.115, 0.115, 5.8), lit("#bcf7ff", 2.5), LASERS);
const laserGlow = pool(new T.BoxGeometry(0.36, 0.36, 7), new T.MeshBasicMaterial({
  color: hot("#27a8ff", 2.0),
  transparent: true,
  opacity: 0.38,
  blending: T.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
}), LASERS);
const boltMesh = pool(GEO.ball, new T.MeshBasicMaterial({ color: hot("#ff3f5f", 4), toneMapped: false }), BOLTS);
const sparkMesh = pool(GEO.low, new T.MeshBasicMaterial({ toneMapped: false }), SPARKS);
const lasers = Array.from({ length: LASERS }, () => ({ p: V(), d: V(), life: 0 }));
const bolts = Array.from({ length: BOLTS }, () => ({ p: V(), v: V(), live: false, dmg: 0 }));
const sparks = Array.from({ length: SPARKS }, () => ({ p: V(), v: V(), life: 0, max: 1, s: 1 }));
let laserNext = 0,
  sparkNext = 0;
const tint = new T.Color();
function burst(p, hexes, count, speed, size) {
  for (let i = 0; i < count; i++) {
    const s = sparks[sparkNext];
    sparkMesh.setColorAt(sparkNext, tint.copy(hot(pick(hexes), 2.5)));
    sparkNext = (sparkNext + 1) % SPARKS;
    s.p.copy(p);
    s.v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
    s.life = s.max = rand(0.4, 1.1);
    s.s = size * rand(0.5, 1.4);
  }
  sparkMesh.instanceColor.needsUpdate = true;
}
const flashes = [];
function flash(position, size, color) {
  const core = flare("#fff1bc", size * 2.0);
  const ring = part(GEO.wave, new T.MeshBasicMaterial({
    color: hot(color, 1.7),
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  }), 0.1);
  core.position.copy(position);
  ring.position.copy(position);
  ring.lookAt(camera.position);
  scene.add(core, ring);
  flashes.push({ core, ring, t: 0, size });
}

// ---------- Враги ----------
const KINDS = {
  scout: { hp: 20, r: 7.5, speed: 28, score: 10, color: "#ffd36a", size: 2.45 },
  bomber: { hp: 58, r: 8.8, speed: 17, score: 20, color: "#ff7558", size: 2.2 },
  gunship: { hp: 120, r: 10.5, speed: 15, score: 40, color: "#bc94ff", size: 2.1 },
  boss: { hp: 920, r: 21, speed: 8, score: 500, color: "#ff75cb", size: 1.55 },
};

const MODEL = {
  scout() {
    const g = new T.Group();
    const alloy = metal("#318cd2", { emissive: "#116d9d", emissiveIntensity: 0.27 });
    const gold = metal("#ffc35f", { emissive: "#dd801e", emissiveIntensity: 0.24 });
    const cyan = lit("#7ef4ff", 1.45);
    g.add(part(GEO.ball, alloy, 1.18, 0.83, 1.68));
    for (const side of [-1, 1]) {
      const wing = at(part(GEO.oct, gold, 1.58, 0.46, 1.34), side * 1.48, 0.08, 0.12);
      wing.rotation.y = side * 0.28;
      wing.rotation.z = side * 0.2;
      g.add(wing,
        at(part(GEO.ball, gold, 0.57, 0.55, 1.04), side * 2.15, 0.31, 0.21),
        at(part(GEO.ball, cyan, 0.37, 0.34, 0.3), side * 2.15, 0.31, -0.55),
        at(part(GEO.box, cyan, 0.14, 0.15, 0.83), side * 2.15, 0.79, 0.19));
    }
    g.add(at(part(GEO.ball, lit("#ffdc77", 1.55), 0.6, 0.47, 0.36), 0, 0.18, -1.43));
    return g;
  },
  bomber() {
    const g = new T.Group();
    const red = metal("#d9563a");
    const amber = metal("#ffae56");
    g.add(part(GEO.low, red, 1.83, 1.42, 2.08));
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * TAU;
      const dir = V(Math.cos(angle), Math.sin(angle), 0);
      const fin = part(GEO.cone, amber, 0.47, 1.12, 0.54);
      fin.position.copy(dir).multiplyScalar(1.66);
      fin.position.z = 0.56;
      fin.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
      g.add(fin);
    }
    const core = at(part(GEO.ball, lit("#ff743f", 2.4), 0.78, 0.78, 0.34), 0, 0, -1.93);
    g.add(core, at(part(GEO.wave, lit("#ffe096", 1.8), 1.03), 0, 0, -1.7));
    g.userData.core = core;
    return g;
  },
  gunship() {
    const g = new T.Group();
    const armor = metal("#7361a5");
    const violet = lit("#bf8aff", 2.1);
    g.add(part(GEO.oct, armor, 2.8, 1.15, 3.35));
    for (const side of [-1, 1]) {
      const wing = at(part(GEO.oct, metal("#b085dc"), 1.55, 0.58, 2.76), side * 2.9, 0, 0.2);
      wing.rotation.y = side * 0.24;
      g.add(wing,
        at(part(GEO.box, armor, 0.8, 0.62, 2.86), side * 2.62, -0.15, -0.85),
        at(part(GEO.box, violet, 0.14, 0.13, 2.42), side * 2.62, 0.26, -0.78),
        at(part(GEO.ball, lit("#ffa857", 2.3), 0.33), side * 2.62, -0.14, -2.32));
    }
    g.add(at(part(GEO.ball, violet, 0.63, 0.26, 0.71), 0, 0.81, -1.38));
    return g;
  },
  boss() {
    const g = new T.Group();
    const shell = metal("#5a5291");
    const armor = metal("#7c64ac");
    const pink = lit("#ff75cb", 1.8);
    g.add(part(GEO.ball, shell, 6.45, 3.2, 6.45));
    const ring = new T.Group();
    ring.rotation.x = Math.PI / 2.7;
    ring.add(part(GEO.ring, armor, 9.3, 9.3, 4.7), part(GEO.wave, pink, 10.35));
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * TAU;
      const x = Math.cos(angle) * 9.8;
      const y = Math.sin(angle) * 9.8;
      ring.add(at(part(GEO.box, shell, 2.05, 1.65, 1.8), x, y, 0),
        at(part(GEO.ball, pink, 0.78), x, y, -1.55));
    }
    const core = at(part(GEO.ball, lit("#ffc5ef", 2.7), 2.17, 2.17, 0.65), 0, 0, -6);
    g.add(ring, core, at(part(GEO.wave, pink, 2.55), 0, 0, -5.87));
    g.userData.ring = ring;
    return g;
  },
};

const enemies = [];
const dirFrom = (yaw, pitch) => V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
function spawn(kind) {
  const K = KINDS[kind],
    g = MODEL[kind]();
  const boss = kind === "boss";
  const first = wave === 1 && waveT < 2;
  const spread = wave === 1 ? 0.24 : wave < 4 ? 0.73 : 1.35;
  const yaw = boss ? 0 : first ? rand(-0.075, 0.075) : rand(-spread, spread);
  const pitch = first ? rand(0.22, 0.28) : rand(0.12, wave < 4 ? 0.42 : 0.58);
  const distance = boss ? 228 : wave < 4 ? rand(137, 162) : rand(162, 209);
  const pos = dirFrom(yaw, pitch).multiplyScalar(distance);
  g.position.copy(pos);
  g.scale.setScalar(K.size);
  scene.add(g);
  const hp = K.hp * (1 + 0.08 * (wave - 1)) * (boss ? 1 + (wave / 5 - 1) * 0.5 : 1);
  enemies.push({ kind, K, g, pos, vel: V(), hp, max: hp, goal: null, fireIn: rand(1.5, 3.5), burst: 0, t: 0, flashT: 0, spawnIn: 5 });
}
function newGoal(e) {
  if (e.kind === "scout") {
    const spread = wave === 1 ? 0.34 : wave < 4 ? 0.78 : 1.25;
    e.goal = dirFrom(rand(-spread, spread), rand(0.08, wave < 4 ? 0.44 : 0.65)).multiplyScalar(rand(64, 109));
  } else if (e.kind === "gunship") e.goal = dirFrom(rand(-1.2, 1.2), rand(0.1, 0.5)).multiplyScalar(rand(70, 95));
  else if (e.kind === "boss") e.goal = dirFrom(rand(-0.7, 0.7), rand(0.2, 0.45)).multiplyScalar(125);
}
function shootBolt(from, dmg, spread) {
  const b = bolts.find((x) => !x.live);
  if (!b) return;
  b.live = true;
  b.dmg = dmg;
  b.p.copy(from);
  b.v.copy(from).multiplyScalar(-1).add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread)).normalize().multiplyScalar(60);
}
function removeModel(model) {
  scene.remove(model);
  // Геометрия из GEO общая. Материалы создаются для каждого экземпляра.
  const materials = new Set();
  model.traverse((part) => {
    if (part.material) materials.add(part.material);
  });
  for (const material of materials) material.dispose();
}

function kill(e, quiet) {
  enemies.splice(enemies.indexOf(e), 1);
  removeModel(e.g);
  const big = e.kind === "boss" || e.kind === "gunship";
  flash(e.pos, e.K.r * (e.kind === "boss" ? 2.25 : 1.75), e.K.color);
  burst(e.pos, [e.K.color, "#ffd9a0", "#ffffff"], e.kind === "boss" ? 160 : big ? 50 : 26, e.kind === "boss" ? 70 : 34, e.kind === "boss" ? 1.6 : 0.7);
  Sound.boom(big);
  if (quiet) return;
  combo = Math.min(8, combo + 1);
  comboT = 3;
  score += Math.round(e.K.score * (1 + (combo - 1) * 0.25));
  kills++;
  if (e.kind === "boss") {
    el("bossbar").hidden = true;
    shake = 1.5;
  }
}
function damage(e, amount, at2) {
  if (S.state !== "play") return;
  e.hp -= amount;
  e.flashT = 0.12;
  hitMarker = 0.12;
  Sound.hit();
  burst(at2 || e.pos, [e.K.color, "#72dcff", "#ffffff"], 8, 20, 0.3);
  if (e.hp <= 0) kill(e);
}

// ---------- Игрок ----------
const S = {
  state: "menu",
  yaw: 0,
  pitch: 0.25,
  shield: 100,
  shieldMax: 100,
  hull: 100,
  hullMax: 100,
  heat: 0,
  overheated: false,
  lastHurt: -9,
  dmg: 11,
  rate: 7.5,
  cool: 30,
  rockets: 4,
  rocketCd: 9,
  rocketIn: 0,
  rocketDmg: 70,
};
let wave = 1,
  score = 0,
  kills = 0,
  combo = 0,
  comboT = 0,
  best = 0,
  shake = 0,
  hitMarker = 0,
  hurtFlash = 0,
  hurtDir = 0,
  shieldImpact = false,
  fireIn = 0,
  side = 0,
  queue = [],
  waveT = 0,
  alarmIn = 0;
const rocketsLive = [];

function hurt(amount, from) {
  if (S.state !== "play") return;
  S.lastHurt = clock;
  hurtFlash = 1;
  // с какой стороны прилетело — для красной дуги на экране
  const local = from.clone().applyQuaternion(camera.quaternion.clone().invert());
  hurtDir = Math.atan2(local.x, -local.z);
  shieldImpact = S.shield > 0;
  if (shieldImpact) {
    S.shield = Math.max(0, S.shield - amount);
    Sound.shield();
    shake = Math.max(shake, 0.25);
  } else {
    S.hull = Math.max(0, S.hull - amount);
    Sound.hull();
    shake = Math.max(shake, 0.6);
    if (S.hull <= 0) die();
  }
}

const UPGRADES = [
  { ic: "💥", name: "Мощность", text: "Урон лазеров +25%", apply: () => (S.dmg *= 1.25) },
  { ic: "⚡", name: "Скорострельность", text: "Лазеры стреляют на 15% чаще", apply: () => (S.rate *= 1.15) },
  { ic: "❄️", name: "Охлаждение", text: "Пушки остывают на 35% быстрее", apply: () => (S.cool *= 1.35) },
  { ic: "🛡️", name: "Щит", text: "Запас щита +30", apply: () => ((S.shieldMax += 30), (S.shield = S.shieldMax)) },
  { ic: "🔧", name: "Ремонт", text: "Корпус чинится полностью, запас +20", apply: () => ((S.hullMax += 20), (S.hull = S.hullMax)) },
  { ic: "🚀", name: "Ракетный блок", text: "В залпе на 2 ракеты больше", apply: () => (S.rockets += 2) },
  { ic: "⏱️", name: "Перезарядка", text: "Ракеты готовы на 25% быстрее", apply: () => (S.rocketCd *= 0.75) },
];

function banner(text) {
  const b = el("banner");
  b.hidden = true;
  void b.offsetWidth;
  b.textContent = text;
  b.hidden = false;
}
function startWave() {
  clearInput();
  S.state = "play";
  el("pause-button").hidden = false;
  waveT = 0;
  queue = [];
  const add = (kind, n, from, gap) => {
    for (let i = 0; i < n; i++) queue.push({ kind, at: from + i * gap + rand(0, 0.6) });
  };
  if (wave % 5 === 0) {
    add("boss", 1, 1.5, 0);
    add("scout", 3 + Math.floor(wave / 5), 6, 5);
    el("bossfill").style.transform = "scaleX(1)";
    el("bossbar").hidden = false;
    Sound.boss();
    banner("ФЛАГМАН");
  } else {
    add("scout", 3 + wave, 1, Math.max(1.2, 2.6 - wave * 0.1));
    if (wave >= 2) add("bomber", 1 + Math.floor(wave / 2), 5, 4.5);
    if (wave >= 4) add("gunship", Math.floor((wave - 1) / 3), 9, 9);
    Sound.wave();
    banner("ВОЛНА " + wave);
  }
  queue.sort((a, b) => a.at - b.at);
  el("wave").textContent = wave;
  for (const id of ["menu", "upgrade", "dead"]) el(id).hidden = true;
}
function clearField() {
  for (const e of enemies) removeModel(e.g);
  enemies.length = 0;
  lasers.forEach((l) => (l.life = 0));
  bolts.forEach((b) => (b.live = false));
  for (const r of rocketsLive) removeModel(r.m);
  rocketsLive.length = 0;
  el("bossbar").hidden = true;
}
function waveCleared() {
  S.state = "upgrade";
  clearField();
  clearInput();
  el("pause-button").hidden = true;
  score += 50 * wave;
  best = Math.max(best, wave);
  wave++;
  writeStorage(SAVE, JSON.stringify({ best }));
  el("best").textContent = best;
  Sound.clear();
  const cards = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  el("cards").innerHTML = "";
  for (const u of cards) {
    const b = document.createElement("button");
    b.className = "card";
    b.innerHTML = `<span class="ic">${u.ic}</span><b>${u.name}</b><small>${u.text}</small>`;
    b.addEventListener("click", () => {
      if (S.state !== "upgrade") return;
      u.apply();
      Sound.pick();
      startWave();
    });
    el("cards").appendChild(b);
  }
  setTimeout(() => {
    if (S.state !== "upgrade") return;
    el("upgrade").hidden = false;
    el("cards").firstElementChild.focus({ preventScroll: true });
  }, 550);
}
function die() {
  S.state = "dead";
  clearInput();
  el("pause-button").hidden = true;
  el("result").textContent = `Волна ${wave} · Счёт ${score}`;
  // Попадание может быть внутри обхода врагов или снарядов.
  queueMicrotask(clearField);
  Sound.boom(true);
  shake = 2;
  setTimeout(() => {
    el("dead").hidden = false;
    el("retry").focus({ preventScroll: true });
  }, 750);
}

function togglePause() {
  if (S.state === "play") {
    clearInput();
    S.state = "paused";
    el("paused").hidden = false;
    el("resume").focus({ preventScroll: true });
  } else if (S.state === "paused") {
    S.state = "play";
    el("paused").hidden = true;
    el("resume").blur();
    Sound.unlock();
  }
}

// ---------- Стрельба ----------
const fwd = V(),
  tmp = V(),
  tmp2 = V();
// Зона захвата чуть шире корпуса. Приоритет у цели ближе к центру прицела.
function assistTarget() {
  const help = (wave < 3 ? 0.17 : 0.105) + (camera.aspect < 1 ? 0.035 : 0);
  let target = null;
  let best = Infinity;
  for (const enemy of enemies) {
    const distance = enemy.pos.length();
    if (distance > RANGE) continue;
    const angle = tmp.copy(enemy.pos).normalize().angleTo(fwd);
    if (angle > help + Math.atan2(enemy.K.r, distance) * 0.65) continue;
    const priority = angle + distance * 0.00014;
    if (priority < best) {
      best = priority;
      target = enemy;
    }
  }
  return target;
}

function fireLaser() {
  const b = barrels[side];
  side = 1 - side;
  b.userData.kick = 1;
  const from = b.userData.tip.getWorldPosition(V());
  const target = assistTarget();
  const point = target ? tmp2.copy(target.pos).addScaledVector(target.vel, target.pos.length() / LASER_SPEED) : tmp2.copy(fwd).multiplyScalar(500);
  const l = lasers[laserNext];
  laserNext = (laserNext + 1) % LASERS;
  l.p.copy(from);
  l.d.copy(point).sub(from).normalize();
  l.life = RANGE / LASER_SPEED;
  S.heat = Math.min(100, S.heat + 3.9);
  if (S.heat >= 100) {
    S.overheated = true;
    Sound.overheat();
  }
  Sound.laser();
}
function fireRockets() {
  if (S.state !== "play" || S.rocketIn > 0 || !enemies.length) return;
  S.rocketIn = S.rocketCd;
  Sound.rocket();
  const sorted = [...enemies].sort((a, b) => a.pos.clone().normalize().angleTo(fwd) - b.pos.clone().normalize().angleTo(fwd));
  for (let i = 0; i < S.rockets; i++) {
    const m = new T.Group();
    m.add(part(GEO.cyl, metal("#d8e8ff"), 0.18, 1.12, 0.18),
      at(part(GEO.cone, metal("#ff9560"), 0.18, 0.41, 0.18), 0, 0.71, 0),
      at(part(GEO.cone, lit("#ffb057", 2.6), 0.18, 0.76, 0.18), 0, -0.92, 0),
      at(flare("#ffb961", 1.0), 0, -0.71, 0));
    const p = camera.position.clone().add(V((i % 2 ? 1 : -1) * 1.6, -1.2, -2.8).applyQuaternion(camera.quaternion));
    m.position.copy(p);
    m.visible = false;
    scene.add(m);
    const v = fwd.clone().add(V(rand(-0.5, 0.5), rand(0.1, 0.6), rand(-0.5, 0.5))).normalize().multiplyScalar(40);
    rocketsLive.push({ m, p, v, target: sorted[i % sorted.length], life: 6, trail: 0, delay: i * 0.07 });
  }
}

// ---------- Управление ----------
const fingers = new Map();
let firing = false;
canvas.addEventListener("pointerdown", (e) => {
  if (S.state !== "play" || e.button !== 0 || fingers.size > 0) return;
  Sound.unlock();
  canvas.setPointerCapture(e.pointerId);
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  firing = true;
});
canvas.addEventListener("pointermove", (e) => {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  const k = (T.MathUtils.degToRad(camera.fov) / innerHeight) * 1.12;
  S.yaw += (e.clientX - f.x) * k;
  S.pitch -= (e.clientY - f.y) * k;
  f.x = e.clientX;
  f.y = e.clientY;
});
const lift = (e) => {
  fingers.delete(e.pointerId);
  firing = fingers.size > 0;
};
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);
canvas.addEventListener("lostpointercapture", lift);
const keys = new Set();
const gameKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space", "KeyE", "ShiftLeft"]);
function clearInput() {
  for (const id of fingers.keys()) {
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  fingers.clear();
  keys.clear();
  firing = false;
}
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && !e.repeat) togglePause();
  if (S.state !== "play" || !gameKeys.has(e.code)) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.code === "Space" && e.target.closest?.("button,a")) return;
  e.preventDefault();
  keys.add(e.code);
  if (e.code === "KeyE" || e.code === "ShiftLeft") fireRockets();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && S.state === "play") togglePause();
});
el("pause-button").addEventListener("click", togglePause);
el("resume").addEventListener("click", togglePause);
function launchRockets() {
  Sound.unlock();
  fireRockets();
}
el("rocket").addEventListener("pointerdown", (event) => {
  // Второй палец не всегда генерирует click, пока первый ведёт прицел.
  if (event.pointerType === "touch") launchRockets();
});
el("rocket").addEventListener("click", launchRockets);
function updateSoundButton() {
  el("sound").textContent = Sound.on ? "🔊" : "🔇";
  el("sound").setAttribute("aria-pressed", String(Sound.on));
}
updateSoundButton();
el("sound").addEventListener("click", () => {
  Sound.toggle();
  updateSoundButton();
});
el("start").addEventListener("click", () => {
  if (S.state !== "menu") return;
  Sound.unlock();
  S.yaw = 0;
  Sound.pick();
  startWave();
});
el("retry").addEventListener("click", () => {
  if (S.state !== "dead") return;
  clearField();
  S.hull = S.hullMax;
  S.shield = S.shieldMax;
  S.heat = 0;
  S.overheated = false;
  S.rocketIn = 0;
  S.yaw = 0;
  S.pitch = 0.25;
  combo = comboT = hurtFlash = hitMarker = shake = fireIn = 0;
  score = Math.round(score * 0.8);
  Sound.pick();
  startWave();
});

// ---------- Экранные приборы (2D поверх сцены) ----------
const hud = el("hud"),
  hx = hud.getContext("2d");
let dpr = 1;
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 68 : 57;
  camera.updateProjectionMatrix();
  dpr = Math.min(devicePixelRatio, 2);
  hud.width = w * dpr;
  hud.height = h * dpr;
}
addEventListener("resize", resize);
const proj = V();
function drawTarget(enemy, x, y, height, locked) {
  const worldToPixels = height / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
  const radius = worldToPixels * enemy.K.r / enemy.pos.length();
  const size = clamp(radius + 7, 21, height * 0.15);
  const corner = Math.min(13, size * 0.42);
  hx.beginPath();
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      hx.moveTo(x + dx * (size - corner), y + dy * size);
      hx.lineTo(x + dx * size, y + dy * size);
      hx.lineTo(x + dx * size, y + dy * (size - corner));
    }
  }
  hx.strokeStyle = "rgba(4,11,26,.84)";
  hx.lineWidth = locked ? 6 : 5;
  hx.stroke();
  const color = enemy.flashT > 0 ? "#ffffff" : locked ? "#aaffcb" : enemy.K.color;
  hx.strokeStyle = color;
  hx.lineWidth = locked ? 3 : 2;
  hx.stroke();

  if (enemy.kind !== "boss") {
    const width = Math.max(26, size * 1.5);
    hx.fillStyle = "rgba(4,11,26,.92)";
    hx.fillRect(x - width / 2 - 2, y - size - 10, width + 4, 7);
    hx.fillStyle = color;
    hx.fillRect(x - width / 2, y - size - 8, width * (enemy.hp / enemy.max), 3);
  }
}

function drawHud(t) {
  const w = innerWidth,
    h = innerHeight,
    cx = w / 2,
    cy = h / 2;
  hx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hx.clearRect(0, 0, w, h);
  if (S.state === "menu") return;
  const target = S.state === "play" ? assistTarget() : null;
  // Рамки остаются читаемыми, даже пока корабли далеко.
  for (const e of enemies) {
    proj.copy(e.pos).project(camera);
    const behind = proj.z > 1;
    const on = !behind && Math.abs(proj.x) < 0.96 && Math.abs(proj.y) < 0.94;
    if (on) {
      drawTarget(e, (proj.x + 1) * w / 2, (1 - proj.y) * h / 2, h, e === target);
    } else {
      let ax = proj.x,
        ay = proj.y;
      if (behind) (ax = -ax), (ay = -ay);
      const a = Math.atan2(-ay * h, ax * w),
        rx = w / 2 - 34,
        ry = h / 2 - 34,
        k = 1 / Math.max(Math.abs(Math.cos(a)) / rx, Math.abs(Math.sin(a)) / ry);
      hx.save();
      hx.translate(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
      hx.rotate(a);
      hx.fillStyle = e.K.color;
      hx.strokeStyle = "rgba(4,11,26,.85)";
      hx.lineWidth = 4;
      hx.globalAlpha = e.kind === "bomber" ? 0.78 + 0.22 * Math.sin(t * 8) : 0.9;
      hx.beginPath();
      hx.moveTo(14, 0);
      hx.lineTo(-8, -10);
      hx.lineTo(-8, 10);
      hx.closePath();
      hx.stroke();
      hx.fill();
      hx.restore();
    }
  }
  // прицел и нагрев
  hx.lineWidth = 2;
  hx.strokeStyle = hitMarker > 0 ? "#ffffff" : S.overheated ? "#ff7853" : target ? "#aaffcb" : "#7fe8ff";
  hx.globalAlpha = 0.9;
  hx.beginPath();
  hx.arc(cx, cy, 16, 0, TAU);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    hx.moveTo(cx + dx * 22, cy + dy * 22);
    hx.lineTo(cx + dx * 32, cy + dy * 32);
  }
  hx.stroke();
  hx.fillStyle = hx.strokeStyle;
  hx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  hx.lineWidth = 5;
  hx.strokeStyle = "rgba(255,255,255,.15)";
  hx.beginPath();
  hx.arc(cx, cy, 44, Math.PI * 0.25, Math.PI * 0.75);
  hx.stroke();
  hx.strokeStyle = S.overheated ? "#ff3f3f" : S.heat > 70 ? "#ffb35f" : "#7fe8ff";
  hx.beginPath();
  hx.arc(cx, cy, 44, Math.PI * 0.75 - (Math.PI * 0.5 * Math.min(100, S.heat)) / 100, Math.PI * 0.75);
  hx.stroke();
  hx.globalAlpha = 1;
  if (S.overheated || target) {
    hx.fillStyle = S.overheated ? "#ff8668" : "#aaffcb";
    hx.font = "800 13px system-ui, sans-serif";
    hx.textAlign = "center";
    const label = S.overheated ? "ПЕРЕГРЕВ" : "ЦЕЛЬ ЗАХВАЧЕНА";
    const width = hx.measureText(label).width + 18;
    const textColor = hx.fillStyle;
    hx.fillStyle = "rgba(7,15,36,.76)";
    hx.fillRect(cx - width / 2, cy + 57, width, 20);
    hx.fillStyle = textColor;
    hx.fillText(label, cx, cy + 71);
  }
  if (combo > 1) {
    hx.fillStyle = "#ffd25f";
    hx.font = "800 22px sans-serif";
    hx.textAlign = "center";
    hx.fillText("×" + combo, cx, cy - 56);
  }
  // Щит вспыхивает голубым. Попадание по корпусу отмечено красным.
  if (hurtFlash > 0) {
    const rgb = shieldImpact ? "65,190,255" : "255,73,88";
    hx.strokeStyle = `rgba(${rgb},${hurtFlash})`;
    hx.lineWidth = 10;
    hx.beginPath();
    hx.arc(cx, cy, Math.min(w, h) * 0.3, hurtDir - Math.PI / 2 - 0.5, hurtDir - Math.PI / 2 + 0.5);
    hx.stroke();
    const g = hx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.7);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${hurtFlash * (shieldImpact ? 0.22 : 0.42)})`);
    hx.fillStyle = g;
    hx.fillRect(0, 0, w, h);
  }
}

// ---------- Кадр ----------
let clock = 0,
  last = 0;
const up = V(0, 1, 0),
  q = new T.Quaternion(),
  look = new T.Matrix4();
function frame(ms) {
  const dt = Math.min(0.05, (ms - last) / 1000 || 0);
  last = ms;
  if (S.state === "paused") {
    requestAnimationFrame(frame);
    return;
  }
  clock += dt;
  const t = clock,
    playing = S.state === "play";

  // прицел: палец, стрелки или WASD
  const turn = 1.5 * dt;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) S.yaw -= turn;
  if (keys.has("ArrowRight") || keys.has("KeyD")) S.yaw += turn;
  if (keys.has("ArrowUp") || keys.has("KeyW")) S.pitch += turn;
  if (keys.has("ArrowDown") || keys.has("KeyS")) S.pitch -= turn;
  if (S.state === "menu") S.yaw = Math.sin(t * 0.15) * 0.5;
  S.yaw = clamp(S.yaw, -1.9, 1.9);
  S.pitch = clamp(S.pitch, -0.2, 1.15);
  shake *= Math.pow(0.02, dt);
  camera.rotation.set(S.pitch + rand(-1, 1) * shake * 0.02, -S.yaw + rand(-1, 1) * shake * 0.02, rand(-1, 1) * shake * 0.03, "YXZ");
  camera.updateMatrixWorld();
  camera.getWorldDirection(fwd);

  // лазеры и нагрев
  const triggerHeld = playing && (firing || keys.has("Space"));
  const cooling = S.overheated ? 1.4 : triggerHeld ? 0.3 : 1;
  S.heat = Math.max(0, S.heat - S.cool * dt * cooling);
  if (S.overheated && S.heat < 35) S.overheated = false;
  fireIn -= dt;
  if (triggerHeld && !S.overheated && fireIn <= 0) {
    fireLaser();
    fireIn = 1 / S.rate;
  }
  for (const b of barrels) {
    b.userData.kick = (b.userData.kick || 0) * Math.pow(0.0005, dt);
    b.position.z = -1.2 + b.userData.kick * 0.22;
    const color = S.overheated ? "#ff7853" : "#7ce6ff";
    b.userData.tip.material.color.copy(hot(color, 1.7 + b.userData.kick * 2.2));
    b.userData.muzzle.visible = b.userData.kick > 0.1;
    b.userData.muzzle.material.opacity = b.userData.kick * 0.74;
    b.userData.muzzle.material.color.set(color);
  }
  S.rocketIn = Math.max(0, S.rocketIn - dt);
  el("rocket-cd").style.height = (S.rocketIn / S.rocketCd) * 100 + "%";
  const rocketReady = playing && S.rocketIn <= 0 && enemies.length > 0;
  el("rocket").disabled = !rocketReady;
  el("rocket").classList.toggle("ready", rocketReady);
  const rocketTime = S.rocketIn > 0 ? `${Math.ceil(S.rocketIn)} с` : "";
  if (el("rocket-time").textContent !== rocketTime) el("rocket-time").textContent = rocketTime;

  // щит восстанавливается, если какое-то время не попадали
  if (playing && t - S.lastHurt > 4.5) S.shield = Math.min(S.shieldMax, S.shield + 10 * dt);
  hurtFlash = Math.max(0, hurtFlash - dt * 2);
  hitMarker = Math.max(0, hitMarker - dt);
  comboT -= dt;
  if (comboT <= 0) combo = 0;
  if (playing && S.hull < S.hullMax * 0.3) {
    alarmIn -= dt;
    if (alarmIn <= 0) (alarmIn = 0.9), Sound.alarm();
  }

  // волна: враги появляются по расписанию
  if (playing) {
    waveT += dt;
    while (queue.length && queue[0].at <= waveT) spawn(queue.shift().kind);
    if (!queue.length && !enemies.length && waveT > 2) waveCleared();
  }

  // враги
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i],
      K = e.K;
    e.t += dt;
    e.flashT -= dt;
    const dist = e.pos.length();
    if (e.kind === "bomber") {
      // таран идёт прямо на станцию и взрывается об неё
      e.vel.copy(e.pos).normalize().multiplyScalar(-(K.speed + wave * 0.8));
      e.g.userData.core.material.color.copy(hot("#ff743f", 2.2 + 0.8 * Math.sin(t * (4 + 220 / dist))));
      if (dist < 9) {
        hurt(34, e.pos);
        kill(e, true);
        continue;
      }
    } else {
      if (!e.goal || e.pos.distanceTo(e.goal) < 8) newGoal(e);
      const approach = dist > RANGE ? 1.65 : 1;
      const speed = wave === 1 ? K.speed * 0.76 : K.speed;
      tmp.copy(e.goal).sub(e.pos).normalize().multiplyScalar(speed * approach);
      e.vel.lerp(tmp, Math.min(1, dt * (e.kind === "scout" ? 1.6 : 0.8)));
      // стреляют, только когда подошли
      e.fireIn -= dt;
      if (playing && dist < 150 && e.fireIn <= 0) {
        if (e.kind === "scout") (e.fireIn = rand(1.9, 3.3)), shootBolt(e.pos, 8, 0.012);
        else if (e.kind === "gunship") {
          shootBolt(e.pos, 9, 0.01);
          e.burst = (e.burst + 1) % 3;
          e.fireIn = e.burst ? 0.22 : rand(2.6, 3.8);
        } else if (e.kind === "boss") (e.fireIn = 1.3), shootBolt(e.pos.clone().add(V(rand(-9, 9), 0, 0)), 16, 0.006);
      }
      if (e.kind === "boss") {
        e.g.userData.ring.rotation.z = t * 0.6;
        e.spawnIn -= dt;
        if (playing && e.spawnIn <= 0 && enemies.length < 9) (e.spawnIn = 7), spawn("scout"), enemies[enemies.length - 1].pos.copy(e.pos), enemies[enemies.length - 1].g.position.copy(e.pos);
        el("bossfill").style.transform = `scaleX(${Math.max(0, e.hp / e.max)})`;
      }
    }
    e.pos.addScaledVector(e.vel, dt);
    e.g.position.copy(e.pos);
    if (e.kind === "boss") e.g.lookAt(0, 0, 0), e.g.rotateY(Math.PI);
    else if (e.vel.lengthSq() > 0.01) {
      look.lookAt(e.pos, tmp.copy(e.pos).add(e.vel), up);
      q.setFromRotationMatrix(look);
      e.g.quaternion.slerp(q, Math.min(1, dt * 6));
    }
    e.g.scale.setScalar(K.size * (e.flashT > 0 ? 1.12 : 1));
  }

  // Ближайшая точка входа луча в цель. Дрон за другой целью не перехватывает попадание.
  lasers.forEach((laser, i) => {
    if (laser.life <= 0) {
      hide(laserMesh, i);
      hide(laserGlow, i);
      return;
    }
    const travel = LASER_SPEED * Math.min(dt, laser.life);
    let hit = null;
    let nearest = travel;
    for (const enemy of enemies) {
      tmp.copy(enemy.pos).sub(laser.p);
      const along = tmp.dot(laser.d);
      const radius = enemy.K.r;
      if (along < -radius || along > nearest + radius) continue;
      const offset = tmp.lengthSq() - along * along;
      if (offset > radius * radius) continue;
      const halfChord = Math.sqrt(radius * radius - offset);
      if (along + halfChord < 0) continue;
      const entry = Math.max(0, along - halfChord);
      if (entry > nearest) continue;
      hit = enemy;
      nearest = entry;
    }
    laser.p.addScaledVector(laser.d, nearest);
    if (hit) {
      damage(hit, S.dmg, laser.p);
      laser.life = 0;
    } else {
      laser.life -= dt;
    }
    dummy.position.copy(laser.p);
    dummy.lookAt(tmp.copy(laser.p).add(laser.d));
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    laserMesh.setMatrixAt(i, dummy.matrix);
    laserGlow.setMatrixAt(i, dummy.matrix);
  });
  laserMesh.instanceMatrix.needsUpdate = true;
  laserGlow.instanceMatrix.needsUpdate = true;

  // вражеские заряды: их можно сбить лазером, иначе бьют по щиту
  bolts.forEach((b, i) => {
    if (!b.live) return hide(boltMesh, i);
    b.p.addScaledVector(b.v, dt);
    if (b.p.lengthSq() < 16) {
      b.live = false;
      hurt(b.dmg, b.p);
      return hide(boltMesh, i);
    }
    for (const l of lasers) {
      if (l.life > 0 && l.p.distanceToSquared(b.p) < 9) {
        b.live = false;
        l.life = 0;
        burst(b.p, ["#ff3f5f", "#ffffff"], 6, 10, 0.2);
        break;
      }
    }
    dummy.position.copy(b.p);
    dummy.lookAt(tmp.copy(b.p).add(b.v));
    const width = b.dmg > 10 ? 1.32 : 0.8;
    dummy.scale.set(width, width, width * 2.7);
    dummy.updateMatrix();
    boltMesh.setMatrixAt(i, dummy.matrix);
  });
  boltMesh.instanceMatrix.needsUpdate = true;

  // ракеты: разгоняются и доворачивают на цель, взрыв задевает соседей
  for (let i = rocketsLive.length - 1; i >= 0; i--) {
    const r = rocketsLive[i];
    r.delay -= dt;
    if (r.delay > 0) continue;
    r.m.visible = true;
    r.life -= dt;
    if (!enemies.includes(r.target)) r.target = enemies[0] || null;
    if (r.target) {
      tmp.copy(r.target.pos).sub(r.p).normalize().multiplyScalar(130);
      r.v.lerp(tmp, Math.min(1, dt * 3.5));
    }
    r.p.addScaledVector(r.v, dt);
    r.m.position.copy(r.p);
    r.m.quaternion.setFromUnitVectors(up, tmp.copy(r.v).normalize());
    r.trail += dt;
    if (r.trail >= 0.035) {
      r.trail %= 0.035;
      burst(r.p, ["#ff9b4e", "#ffe4a5", "#7c6bff"], 2, 7, 0.35);
    }
    const near = r.target && r.p.distanceTo(r.target.pos) < r.target.K.r + 2;
    if (near || r.life <= 0) {
      flash(r.p, 9, "#ffb35f");
      burst(r.p, ["#ffb35f", "#ffffff", "#ff5f3f"], 24, 30, 0.6);
      Sound.boom(false);
      for (const e of [...enemies]) if (e.pos.distanceTo(r.p) < e.K.r + 9) damage(e, S.rocketDmg * (e === r.target ? 1 : 0.5));
      removeModel(r.m);
      rocketsLive.splice(i, 1);
    }
  }

  // искры и вспышки
  sparks.forEach((s, i) => {
    if (s.life > 0) {
      s.life -= dt;
      s.p.addScaledVector(s.v, dt);
      s.v.multiplyScalar(Math.pow(0.25, dt));
    }
    dummy.position.copy(s.p);
    dummy.rotation.set(s.life * 5, s.life * 3, 0);
    dummy.scale.setScalar(s.life > 0 ? (s.life / s.max) * s.s : 0);
    dummy.updateMatrix();
    sparkMesh.setMatrixAt(i, dummy.matrix);
  });
  sparkMesh.instanceMatrix.needsUpdate = true;
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt * 1.85;
    const alpha = Math.max(0, 1 - f.t);
    f.core.material.opacity = alpha ** 3 * 0.76;
    f.core.scale.setScalar(f.size * (0.8 + f.t * 2.3));
    f.ring.lookAt(camera.position);
    f.ring.scale.setScalar(f.size * Math.sqrt(f.t) * 1.45 + 0.01);
    f.ring.material.opacity = alpha * 0.8;
    if (f.t >= 1) {
      removeModel(f.core);
      removeModel(f.ring);
      flashes.splice(i, 1);
    }
  }
  planet.rotation.y = t * 0.006;

  // приборы
  el("shield").style.transform = `scaleX(${S.shield / S.shieldMax})`;
  el("hull").style.transform = `scaleX(${S.hull / S.hullMax})`;
  el("hull").parentElement.classList.toggle("low", S.hull < S.hullMax * 0.3);
  el("score").textContent = score;
  drawHud(t);

  if (perf.glow) {
    composer.render();
    // слабое устройство: свечение выключается само
    perf.seen += dt;
    if (dt > 1 / 34) perf.slow += dt;
    if (perf.seen > 6) {
      if (perf.slow > 2.4) perf.glow = false;
      perf.seen = perf.slow = 0;
    }
  } else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

try {
  const saved = JSON.parse(readStorage(SAVE))?.best;
  if (Number.isSafeInteger(saved) && saved > 0) best = saved;
} catch {}
el("best").textContent = best;
resize();
requestAnimationFrame(frame);
el("start").disabled = false;
el("load-status").hidden = true;
