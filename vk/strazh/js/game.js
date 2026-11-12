// «Страж орбиты»: 3D-шутер от первого лица. Игрок — стрелок турели орбитальной станции.
// Коснись врага — турель наведётся сама и откроет огонь; можно и вести прицел пальцем.
// Лазеры греются, ракеты наводятся сами. Дроны идут волнами: разведчики, осы звеном, тараны,
// канонерки, копья с заряжаемым лучом; на каждой пятой волне — флагман с узлами щита.
// Щит восстанавливается, корпус — нет. Между волнами — выбор улучшения.
// На 3-й, 8-й, 13-й… волне — бонусный «Метеорный поток»; на каждой десятой вместо флагмана — Улей.
// Позже приходят минёры (сбрасывают мины) и щитоносцы (закрывают соседей щитом).
// Между боями: ангар (постоянные улучшения за кристаллы), задания, «Бой дня» с серией дней.
import { T, TAU, rand, pick, clamp, V, hot, metal, lit, GEO, part, at, flare, removeModel, readStorage, writeStorage } from "./kit.js?v=ab118089";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=ab118089";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=ab118089";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=ab118089";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=ab118089";
import { ShaderPass } from "../vendor/three/postprocessing/ShaderPass.js?v=ab118089";
import { buildSpace, SUN_DIR } from "./space.js?v=ab118089";
import { createFx, tone, GLOW, SMOKE, RING, STAR } from "./fx.js?v=ab118089";
import { MODEL, buildGuns, buildDrone } from "./models.js?v=ab118089";
import { Sound } from "./sound.js?v=ab118089";

const el = (id) => document.getElementById(id);
const SAVE = "strazh_save";
const RANGE = 185;
const LASER_SPEED = 360;

// ---------- Сцена ----------
const canvas = el("stage");
const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); // уточняется в applyQuality
renderer.toneMapping = T.NeutralToneMapping;
const scene = new T.Scene();
scene.background = new T.Color("#03040b");
const camera = new T.PerspectiveCamera(62, 1, 0.1, 3000);
scene.add(camera);
// Сверху слабый свет туманности, снизу — голубой от Земли, сбоку — Солнце.
scene.add(new T.HemisphereLight(0x9a8cff, 0x2f6fe0, 0.5));
const sunLight = new T.DirectionalLight(0xfff0dd, 3);
sunLight.position.copy(SUN_DIR).multiplyScalar(300);
const earthLight = new T.DirectionalLight(0x4f8fff, 0.9);
earthLight.position.set(0.2, -1, -0.5);
scene.add(sunLight, earthLight);
const muzzleLight = new T.PointLight(0x7ce6ff, 0, 7, 1);
muzzleLight.position.set(0, -0.25, -2.9);
camera.add(muzzleLight);

// Последний проход: виньетка, лёгкое расслоение цвета к краям (сильнее при попадании), зерно.
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, hurt: { value: 0 }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float hurt;
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 shift = c * r2 * (0.012 + hurt * 0.028);
      vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
      col *= 1.0 - smoothstep(0.16, 0.72, r2) * 0.5;
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.1);
      col += (fract(sin(dot(vUv * 937.0 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.014;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.72, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(grade);
// Качество графики: «Высокое» — двойное разрешение и свечение (bloom), «Среднее» — меньше разрешение,
// «Низкое» — без свечения. «Авто»: на слабом устройстве сразу среднее; если в бою меньше ~45 кадров
// в секунду, качество само снижается на ступень. MSAA в цели композера не включаем (правило репозитория).
const QUALITY = { high: { ratio: 2, glow: true }, medium: { ratio: 1.35, glow: true }, low: { ratio: 1, glow: false } };
const QUALITY_NAME = { auto: "авто", high: "высокое", medium: "среднее", low: "низкое" };
const weak = (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const perf = { glow: true, set: QUALITY_NAME[readStorage("strazh_quality")] ? readStorage("strazh_quality") : "auto", auto: weak ? "medium" : "high", time: 0, frames: 0 };
perf.level = () => (perf.set === "auto" ? perf.auto : perf.set);

const space = buildSpace(renderer, scene);
const fx = createFx(scene, camera);
// Две пушки закреплены на камере, а снаряды летят в координатах мира.
const { guns, barrels } = buildGuns();
camera.add(guns);

// ---------- Пулы: лазеры и вражеские заряды ----------
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
  BOLTS = 70;
// Луч начинается в точке выстрела и тянется вперёд, поэтому не протыкает саму пушку.
// Круглое сечение: летящий от камеры луч выглядит точкой, а не квадратом.
const rod = (radius, length) => new T.CylinderGeometry(radius, radius, length, 8).rotateX(Math.PI / 2).translate(0, 0, length / 2);
const laserMesh = pool(rod(0.17, 9), new T.MeshBasicMaterial({ toneMapped: false }), LASERS);
const laserGlow = pool(
  rod(0.46, 10.5),
  new T.MeshBasicMaterial({ transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }),
  LASERS,
);
const boltMesh = pool(GEO.ball, new T.MeshBasicMaterial({ color: hot("#ff3f5f", 4), toneMapped: false }), BOLTS);
const lasers = Array.from({ length: LASERS }, () => ({ p: V(), from: V(), d: V(), life: 0, dmg: 0, w: 1 }));
const bolts = Array.from({ length: BOLTS }, () => ({ p: V(), v: V(), live: false, dmg: 0, size: 1, trail: 0 }));
let laserNext = 0;
const LASER_COLOR = { cool: [tone("#bcf7ff", 2.6), tone("#27a8ff", 2)], over: [tone("#fff0b0", 3), tone("#ff9a2a", 2.4)], drone: [tone("#d8ffe0", 2.6), tone("#3fdc7a", 2)] };

// ---------- Враги ----------
// r — радиус попадания: он заметно шире корпуса, чтобы в цель было легко попасть с телефона.
const KINDS = {
  scout: { hp: 28, r: 8.5, speed: 28, score: 10, color: "#ffd36a", size: 3 },
  wasp: { hp: 9, r: 6, speed: 34, score: 6, color: "#b6ff5a", size: 1.9 },
  bomber: { hp: 58, r: 9.5, speed: 17, score: 20, color: "#ff7558", size: 2.6 },
  gunship: { hp: 120, r: 12, speed: 15, score: 40, color: "#bc94ff", size: 2.5 },
  lancer: { hp: 85, r: 10.5, speed: 13, score: 50, color: "#5ff2e0", size: 2.6 },
  node: { hp: 64, r: 7.5, speed: 0, score: 30, color: "#ff9ad8", size: 1 },
  boss: { hp: 900, r: 16, speed: 8, score: 500, color: "#ff75cb", size: 2.4, boss: true },
  pod: { hp: 26, r: 7.5, speed: 9, score: 0, color: "#6dffb0", size: 1.7 },
  // минёр подходит и сбрасывает мины; мина медленно плывёт к станции и взрывается об неё
  miner: { hp: 70, r: 10, speed: 16, score: 35, color: "#ffb347", size: 2.2 },
  mine: { hp: 14, r: 6, speed: 9, score: 5, color: "#ff6a3a", size: 1.8 },
  // щитоносец держится позади и накрывает щитом двоих соседей: пока он цел, урон по ним вдвое меньше
  warden: { hp: 90, r: 11, speed: 12, score: 60, color: "#7fe0ff", size: 2.3 },
  // метеор бонусного «Метеорного потока»: не стреляет, пролетает мимо
  meteor: { hp: 8, r: 7, speed: 0, score: 25, color: "#7ff6ff", size: 2.2 },
  hive: { hp: 650, r: 17, speed: 7, score: 600, color: "#ffc94a", size: 2.4, boss: true },
};
const hostile = (e) => e.kind !== "pod";
// С каждой волной враги бьют больнее и стреляют чаще.
const threat = () => 1 + 0.05 * (wave - 1);
const pace = () => Math.max(0.65, 1 - 0.03 * (wave - 1));
const enemies = [];
const squads = [];
const doomed = [];
let uid = 0;
const dirFrom = (yaw, pitch) => V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
// На вертикальном экране обзор узкий и высокий: враги держатся ближе к центру и выше по небу,
// иначе почти все они оказались бы за краем экрана.
const place = (yaw, pitch) => (camera.aspect < 1 ? dirFrom(yaw * 0.64, Math.min(1, pitch * 1.45)) : dirFrom(yaw, pitch));
const WHITE = new T.Color(1, 1, 1);

// Материалы модели запоминают своё свечение, чтобы вспыхивать белым при попадании.
function glowing(model) {
  const list = [];
  model.traverse((node) => {
    const m = node.material;
    if (m?.isMeshStandardMaterial && !list.includes(m)) {
      m.userData.em = m.emissive.clone();
      m.userData.ei = m.emissiveIntensity;
      list.push(m);
    }
  });
  return list;
}
function make(kind, pos) {
  const K = KINDS[kind];
  const g = MODEL[kind]();
  g.position.copy(pos);
  g.scale.setScalar(K.size);
  // Мягкий ореол в цвет корабля: далёкая цель не теряется на фоне космоса.
  const halo = flare(K.color, (K.r * 2.7) / K.size);
  halo.material.opacity = 0.2;
  g.add(halo);
  scene.add(g);
  const hp = K.hp * (kind === "pod" || kind === "meteor" ? 1 : 1 + 0.1 * (wave - 1)) * (K.boss ? 1 + (wave / 5 - 1) * 0.5 : 1) * (rule === "swarm" && !K.boss ? 0.7 : 1);
  const e = { id: ++uid, kind, K, g, pos: pos.clone(), vel: V(), hp, max: hp, goal: null, fireIn: rand(1.5, 3.5), burst: 0, t: 0, flashT: 0, lit: false, mats: glowing(g), trail: 0, smoke: 0, sx: 0, sy: 0, ss: 30, on: false };
  enemies.push(e);
  return e;
}
const beamGeometry = new T.CylinderGeometry(0.07, 1, 1, 8, 1, true).rotateX(Math.PI / 2);
function makeBeam() {
  const beam = new T.Mesh(
    beamGeometry,
    new T.MeshBasicMaterial({ color: hot("#ff4a3a", 2.4), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }),
  );
  beam.visible = false;
  beam.frustumCulled = false;
  scene.add(beam);
  return beam;
}
// Луч упирается в основание турели: игрок видит, как он проходит через низ экрана.
const beamEnd = V(0, -2.6, 0);
function aimBeam(beam, from, width, opacity) {
  beam.position.copy(from).add(beamEnd).multiplyScalar(0.5);
  beam.lookAt(beamEnd);
  beam.scale.set(width, width, from.distanceTo(beamEnd));
  beam.material.opacity = opacity;
  beam.visible = true;
}

function spawn(kind) {
  if (kind === "squad") return spawnSquad();
  if (kind === "pod") return spawnPod();
  if (kind === "meteor" || kind === "gold") return spawnMeteor(kind === "gold");
  const boss = !!KINDS[kind].boss;
  const first = wave === 1 && waveT < 2;
  const spread = wave === 1 ? 0.24 : wave < 4 ? 0.73 : 1.25;
  const yaw = boss ? 0 : first ? rand(-0.075, 0.075) : rand(-spread, spread);
  const pitch = first ? rand(0.22, 0.28) : rand(0.12, wave < 4 ? 0.42 : 0.58);
  const distance = boss ? 228 : wave < 4 ? rand(137, 162) : rand(162, 209);
  const e = make(kind, place(yaw, pitch).multiplyScalar(distance));
  if (kind === "lancer") (e.phase = "move"), (e.beam = makeBeam());
  if (kind === "miner") (e.drops = 0), (e.dropIn = 0);
  if (kind === "boss") armBoss(e);
  if (kind === "hive") armHive(e);
  return e;
}
// Метеоры летят ручьями поперёк неба: сторона и высота ручья — у каждой четвёрки своя
function spawnMeteor(gold) {
  const n = meteors.total++;
  const side = Math.floor(n / 4) % 2 ? 1 : -1;
  const pitch = 0.18 + ((Math.floor(n / 4) * 0.37) % 0.4);
  const from = place(side * 1.25, pitch + rand(-0.04, 0.04)).multiplyScalar(rand(110, 130));
  const to = place(-side * 1.25, pitch + rand(0.02, 0.12)).multiplyScalar(rand(110, 130));
  const e = make("meteor", from);
  e.vel.copy(to).sub(from).divideScalar(rand(7.5, 9));
  e.spin = V(rand(-2, 2), rand(-2, 2), rand(-2, 2));
  if (gold) {
    e.gold = true;
    e.g.userData.vein.color.copy(tone("#ffd25f", 2.6));
  }
}
function spawnSquad(from = null) {
  const squad = { pos: from ? from.clone() : place(rand(-1.1, 1.1), rand(0.2, 0.55)).multiplyScalar(rand(170, 200)), vel: V(), goal: null, alive: 5 };
  squads.push(squad);
  for (let i = 0; i < 5; i++) {
    const row = Math.ceil(i / 2),
      wing = i % 2 ? 1 : -1;
    const e = make("wasp", squad.pos);
    e.squad = squad;
    e.off = V(wing * row * 8, row * 1.6, row * 7); // клин
    e.pos.add(e.off);
    e.fireIn = rand(2.5, 6);
  }
}
function spawnPod() {
  const side = pick([-1, 1]),
    pitch = rand(0.34, 0.55);
  const e = make("pod", place(side * 1.2, pitch).multiplyScalar(92));
  e.vel.copy(place(-side * 1.2, pitch).multiplyScalar(92)).sub(e.pos).normalize().multiplyScalar(KINDS.pod.speed);
  floater("КОНТЕЙНЕР СНАБЖЕНИЯ", null, "#6dffb0", 2.2);
}
// Улей: четыре люка — отдельные цели. Открытый люк уязвим, закрытый почти нет; пока цел хоть один люк,
// сам улей под щитом. Люки открываются парами и выпускают ос.
function armHive(e) {
  Object.assign(e, { nodes: [], shielded: true, hatchT: 2.5, open: false, fanIn: 3, spawnIn: 7, beam: makeBeam() });
  const K = KINDS.node;
  for (const anchor of e.g.userData.anchors) {
    const hp = K.hp * 1.4 * (1 + 0.1 * (wave - 1));
    const node = { id: ++uid, kind: "node", hatch: true, open: false, K, g: anchor, pos: V(), vel: V(), hp, max: hp, parent: e, t: 0, flashT: 0, lit: false, mats: glowing(anchor), sx: 0, sy: 0, ss: 20, on: false };
    anchor.getWorldPosition(node.pos);
    enemies.push(node);
    e.nodes.push(node);
  }
}
function armBoss(e) {
  Object.assign(e, { nodes: [], shielded: true, nodeFire: 2.5, fanIn: 3, megaIn: 7, spawnIn: 6, beam: makeBeam() });
  const K = KINDS.node;
  for (const anchor of e.g.userData.anchors) {
    const hp = K.hp * (1 + 0.1 * (wave - 1));
    const node = { id: ++uid, kind: "node", K, g: anchor, pos: V(), vel: V(), hp, max: hp, parent: e, t: 0, flashT: 0, lit: false, mats: glowing(anchor), sx: 0, sy: 0, ss: 20, on: false };
    anchor.getWorldPosition(node.pos);
    enemies.push(node);
    e.nodes.push(node);
  }
}
function newGoal(e) {
  if (e.kind === "scout") {
    const spread = wave === 1 ? 0.34 : wave < 4 ? 0.78 : 1.25;
    e.goal = place(rand(-spread, spread), rand(0.08, wave < 4 ? 0.44 : 0.65)).multiplyScalar(rand(56, 96));
  } else if (e.kind === "gunship") e.goal = place(rand(-1.2, 1.2), rand(0.1, 0.5)).multiplyScalar(rand(70, 95));
  else if (e.kind === "boss" || e.kind === "hive") e.goal = place(rand(-0.7, 0.7), rand(0.2, 0.45)).multiplyScalar(e.kind === "hive" ? 120 : 112);
  else if (e.kind === "miner") e.goal = place(rand(-1, 1), rand(0.15, 0.5)).multiplyScalar(rand(95, 120));
  else if (e.kind === "warden") e.goal = place(rand(-0.8, 0.8), rand(0.25, 0.55)).multiplyScalar(rand(95, 118));
}
function shootBolt(from, dmg, spread) {
  const b = bolts.find((x) => !x.live);
  if (!b) return;
  b.live = true;
  b.size = dmg > 10 ? 1.32 : dmg < 6 ? 0.6 : 0.85;
  b.dmg = dmg * threat();
  b.p.copy(from);
  b.v.copy(from).multiplyScalar(-1).add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(spread)).normalize().multiplyScalar(60);
  fx.puff(GLOW, from, null, 5, 1.5, 0.16, tone("#ff5f6f", 3));
}

function kill(e, quiet) {
  const index = enemies.indexOf(e);
  if (index < 0) return;
  enemies.splice(index, 1);
  e.gone = true;
  if (track === e) track = null;
  if (e.beam) removeModel(e.beam);
  if (e.squad) e.squad.alive--;
  const level = e.K.boss ? 3 : e.kind === "gunship" || e.kind === "lancer" || e.kind === "warden" ? 2 : e.kind === "wasp" || e.kind === "mine" ? 0 : 1;
  fx.explode(e.pos, e.K.r * (level === 3 ? 1.5 : level === 0 ? 0.7 : 0.82), e.K.color, level);
  removeModel(e.g);
  Sound.boom(level >= 2 ? 2 : level);
  shake = Math.max(shake, level === 3 ? 1.6 : clamp(26 / e.pos.length(), 0.08, 0.5));
  if (e.kind === "node") {
    const boss = e.parent;
    boss.nodes.splice(boss.nodes.indexOf(e), 1);
    if (!boss.nodes.length && !boss.gone && boss.dying === undefined) dropBossShield(boss);
  }
  if (e.K.boss) {
    for (const node of e.nodes) {
      node.gone = true;
      enemies.splice(enemies.indexOf(node), 1);
    }
    e.nodes.length = 0;
    el("bossbar").hidden = true;
    whiteout = 1;
  }
  if (quiet) return;
  marks.push({ pos: e.pos.clone(), t: 0 });
  if (e.kind === "pod") {
    bump("pod");
    return grantBonus(e.pos);
  }
  combo = Math.min(8, combo + 1);
  comboT = 3;
  comboPop = 1;
  const gain = Math.round((e.gold ? 100 : e.K.score) * (1 + (combo - 1) * 0.25) * (rule === "glass" ? 1.5 : 1));
  score += gain;
  kills++;
  if (e.kind === "meteor") meteors.got++;
  floater("+" + gain, e.pos, combo > 2 ? "#ffd25f" : "#dff6ff", 0.9);
  // задания
  bump("kill");
  if (e.kind === "wasp") bump("wasp");
  else if (e.kind === "mine") bump("mine");
  else if (e.kind === "warden") bump("warden");
  else if (e.kind === "meteor") bump("meteor");
  else if (e.K.boss) bump("boss");
  if (e.byRocket) bump("rocket");
  bump("combo", combo);
}
function dropBossShield(boss) {
  boss.shielded = false;
  boss.megaIn = 5;
  fx.puff(RING, boss.pos, null, 10, 70, 0.7, tone("#ff75cb", 3), 1);
  fx.burst(boss.pos, ["#ff75cb", "#ffffff"], 60, 60, 0.8);
  Sound.shieldDown();
  banner(boss.kind === "hive" ? "ЯДРО УЛЬЯ ОТКРЫТО" : "ЩИТ ФЛАГМАНА СНЯТ");
}
function startBossDeath(e) {
  e.dying = 1.9;
  e.pops = 0;
  e.charge = null;
  e.beam.visible = false;
  for (const node of [...e.nodes]) kill(node, true);
  el("bossbar").hidden = true;
  Sound.boss();
}
function damage(e, amount, at2) {
  if (S.state !== "play" || e.gone || e.dying !== undefined) return;
  let dealt = amount;
  if (e.K.boss && e.shielded) {
    dealt *= e.kind === "hive" ? 0.1 : 0.25;
    e.g.userData.bubble.material.uniforms.power.value = 1;
  }
  // закрытый люк улья и корабль под щитом щитоносца держат удар
  if ((e.hatch && !e.open) || e.guard > 0) {
    dealt *= e.hatch ? 0.1 : 0.5;
    if (Math.random() < 0.3) fx.burst(at2 || e.pos, ["#bff4ff", "#ffffff"], 3, 14, 0.25);
  }
  e.hp -= dealt;
  if (e.charge) e.charge.taken += dealt;
  e.flashT = 0.12;
  hitMarker = 0.12;
  Sound.hit();
  const where = at2 || e.pos;
  fx.burst(where, [e.K.color, "#72dcff", "#ffffff"], 6, 22, 0.32);
  fx.puff(GLOW, where, null, 2.4, 6, 0.14, tone("#dff8ff", 3));
  if (e.hp > 0) return;
  if (e.K.boss) startBossDeath(e);
  else kill(e);
}

// Заряд тяжёлого луча (копьё и флагман): его видно заранее и можно сорвать огнём.
function startCharge(e, dur, need, power) {
  e.charge = { t: 0, dur, need, taken: 0, power };
  Sound.charge(dur);
}
const gather = V();
function updateCharge(e, dt, from) {
  const c = e.charge;
  c.t += dt;
  const k = Math.min(1, c.t / c.dur);
  if (c.taken >= c.need) {
    e.charge = null;
    e.beam.visible = false;
    fx.burst(from, ["#ff4a3a", "#ffffff", "#ffd9a0"], 34, 42, 0.6);
    fx.puff(STAR, from, null, 6, 18, 0.35, tone("#ffffff", 4));
    Sound.stagger();
    score += 15;
    bump("stagger");
    floater("ЗАЛП СОРВАН", e.pos, "#aaffcb", 1.3);
    return false;
  }
  if (c.t >= c.dur) {
    e.charge = null;
    e.beamFlash = 0.3;
    hurt(c.power * threat(), from, "beam");
    Sound.beam();
    shake = Math.max(shake, 1);
    fx.light(beamEnd, "#ff6a4a", 60, 0.4);
    return false;
  }
  aimBeam(e.beam, from, 0.25 + k * 1.05, (0.16 + 0.55 * k) * (0.75 + 0.25 * Math.sin(clock * 36)));
  if (Math.random() < dt * 45) {
    gather.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(12 - 6 * k);
    fx.puff(GLOW, tmp3.copy(from).add(gather), gather.multiplyScalar(-3.2), 1.4, 0.2, 0.3, tone("#ff7a5a", 3));
  }
  return true;
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
  overdrive: 0,
  boost: false,
  drones: 0, // особые улучшения: дроны-напарники, цепная молния, кассетные ракеты
  chain: 0,
  cluster: 0,
  heatK: 1,
};
// Начальные числа турели: новый бой (из меню или «Бой дня») начинается с них
const START = { ...S };
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
  whiteout = 0,
  timeScale = 1,
  fireIn = 0,
  side = 0,
  queue = [],
  waveT = 0,
  alarmIn = 0,
  track = null, // враг, за которым турель ведёт прицел сама
  lockPulse = 0,
  comboPop = 0,
  mode = "battle", // battle — обычный бой без конца, daily — «Бой дня»
  rule = null, // правило «Боя дня»
  meteorStage = false,
  meteors = { total: 0, got: 0 },
  paid = 0; // сколько кристаллов за этот бой уже начислено
const marks = []; // крестики над сбитыми врагами
const arcs = []; // разряды цепной молнии
const blasts = []; // осколки кассетных ракет
const rocketsLive = [];
const floaters = [];

function floater(text, pos, color = "#dff6ff", life = 1.1) {
  floaters.push({ text, pos: pos ? pos.clone() : null, color, t: 0, life });
  if (floaters.length > 14) floaters.shift();
}
const local = V();
const tally = { bolt: 0, ram: 0, beam: 0 }; // откуда пришёл урон — для проверок баланса
function hurt(amount, from, why = "bolt") {
  if (S.state !== "play") return;
  tally[why] += amount;
  S.lastHurt = clock;
  hurtFlash = 1;
  // с какой стороны прилетело — для дуги на экране
  local.copy(from).applyQuaternion(q.copy(camera.quaternion).invert());
  hurtDir = Math.atan2(local.x, -local.z);
  shieldImpact = S.shield > 0;
  if (shieldImpact) {
    S.shield = Math.max(0, S.shield - amount);
    fx.shieldHit(local.copy(from).normalize(), S.shield <= 0, clamp(amount / 26, 0.4, 1.1));
    if (S.shield <= 0) Sound.shieldDown(), floater("ЩИТ ПРОБИТ", null, "#7fd6ff", 1.4);
    else Sound.shield();
    shake = Math.max(shake, 0.25);
  } else {
    S.hull = Math.max(0, S.hull - amount);
    Sound.hull();
    shake = Math.max(shake, 0.7);
    // Искры сыплются из-под пульта.
    fx.burst(local.copy(fwd).multiplyScalar(2.6).add(V(rand(-1, 1), -1.1, 0)), ["#ffb35f", "#ffffff"], 8, 4, 0.022);
    if (S.hull <= 0) die();
  }
}
function grantBonus(pos) {
  const options = ["overdrive", "overdrive", "rockets"];
  if (S.hull < S.hullMax * 0.75) options.push("repair", "repair", "repair");
  if (S.shield < S.shieldMax * 0.5) options.push("shield");
  const bonus = pick(options);
  let text;
  if (bonus === "repair") (S.hull = Math.min(S.hullMax, S.hull + 30)), (text = "РЕМОНТ +30");
  else if (bonus === "shield") (S.shield = S.shieldMax), (text = "ЩИТ ЗАРЯЖЕН");
  else if (bonus === "rockets") (S.rocketIn = 0), (S.boost = true), (text = "РАКЕТЫ ×2");
  else (S.overdrive = 8), (S.heat = 0), (S.overheated = false), (text = "ОВЕРДРАЙВ");
  Sound.bonus();
  fx.puff(RING, pos, null, 4, 30, 0.6, tone("#6dffb0", 3), 1);
  floater(text, null, "#6dffb0", 1.8);
}

// ---------- Сохранение, кристаллы, ангар, задания, «Бой дня» ----------
// strazh_save — тот же ключ: старое {best} читается, остальное получает значения по умолчанию.
// cr — кристаллы, hg — уровни ангара, ms — задания {n, a}, dl — «Бой дня» {d, s, b, bd}
const whole = (v, max = 1e9) => (Number.isSafeInteger(v) && v > 0 ? Math.min(v, max) : 0);
let save = {};
try {
  save = JSON.parse(readStorage(SAVE)) || {};
} catch {}
let credits = whole(save.cr);
const HANGAR = ["armor", "shield", "caliber", "rockets", "repair"];
const hangar = Object.fromEntries(HANGAR.map((k, i) => [k, Math.min(5, whole(Array.isArray(save.hg) ? save.hg[i] : 0))]));
const daily = { d: whole(save.dl?.d), s: whole(save.dl?.s, 999), b: whole(save.dl?.b), bd: whole(save.dl?.bd) };
const HANGAR_INFO = {
  armor: ["🛡️", "Броня", "+10 к корпусу"],
  shield: ["🔷", "Щит", "+10 к щиту"],
  caliber: ["💥", "Калибр", "+6% к урону лазеров"],
  rockets: ["🚀", "Ракеты", "Быстрее перезарядка, на 2-м и 4-м уровне +1 ракета"],
  repair: ["🔧", "Ремонт", "+4 к ремонту между волнами"],
};
const PRICE = [50, 100, 170, 260, 380];
const MISSIONS = [
  { key: "kill", text: (n) => `Сбей ${n} врагов`, goal: 60, reward: 30 },
  { key: "wave", text: (n) => `Дойди до волны ${n}`, goal: 6, reward: 40, max: true },
  { key: "pod", text: (n) => `Сбей ${n} контейнера снабжения`, goal: 3, reward: 30 },
  { key: "wasp", text: (n) => `Сбей ${n} ос`, goal: 30, reward: 30 },
  { key: "meteor", text: (n) => `Разбей ${n} метеоров`, goal: 25, reward: 35 },
  { key: "stagger", text: (n) => `Сорви ${n} залпа копий`, goal: 3, reward: 40 },
  { key: "combo", text: (n) => `Набери комбо ×${n}`, goal: 6, reward: 35, max: true },
  { key: "rocket", text: (n) => `Сбей ракетами ${n} врагов`, goal: 15, reward: 30 },
  { key: "boss", text: (n) => `Уничтожь ${n} босса`, goal: 1, reward: 60 },
  { key: "mine", text: (n) => `Сбей ${n} мин`, goal: 12, reward: 35 },
  { key: "perfect", text: (n) => `Разбей все метеоры потока ${n} раз`, goal: 1, reward: 50 },
  { key: "warden", text: (n) => `Сбей ${n} щитоносца`, goal: 3, reward: 45 },
  { key: "daily", text: (n) => `Пройди «Бой дня» ${n} раз`, goal: 1, reward: 50 },
];
function freshTask(n) {
  const round = Math.floor(n / MISSIONS.length);
  const m = MISSIONS[n % MISSIONS.length];
  return { k: n % MISSIONS.length, g: Math.round(m.goal * (1 + round)), r: Math.round(m.reward * (1 + round * 0.5)), p: 0 };
}
const tasks = { n: whole(save.ms?.n, 1e6), a: [] };
for (const t of Array.isArray(save.ms?.a) ? save.ms.a.slice(0, 3) : []) {
  if (MISSIONS[t?.k] && whole(t.g)) tasks.a.push({ k: t.k, g: t.g, r: whole(t.r) || MISSIONS[t.k].reward, p: Math.min(whole(t.p), t.g) });
}
while (tasks.a.length < 3) {
  let t = freshTask(tasks.n++);
  while (tasks.a.some((o) => o.k === t.k)) t = freshTask(tasks.n++);
  tasks.a.push(t);
}
function store() {
  writeStorage(SAVE, JSON.stringify({ best, cr: credits, hg: HANGAR.map((k) => hangar[k]), ms: tasks, dl: daily }));
}
function bump(key, amount = 1) {
  if (!amount) return;
  tasks.a.forEach((t, i) => {
    const m = MISSIONS[t.k];
    if (m.key !== key || t.p >= t.g) return;
    t.p = m.max ? Math.max(t.p, amount) : t.p + amount;
    if (t.p < t.g) return;
    credits += t.r;
    floater(`ЗАДАНИЕ ВЫПОЛНЕНО +◆${t.r}`, null, "#9dffb0", 2.4);
    Sound.bonus();
    let next = freshTask(tasks.n++);
    while (tasks.a.some((o, j) => j !== i && o.k === next.k)) next = freshTask(tasks.n++);
    tasks.a[i] = next;
    store();
  });
}
// Кристаллы за бой: один за каждые 40 очков; после «Ещё раз» счёт меньше, уже начисленное не забирается
function payout() {
  const earned = Math.max(0, Math.floor(score / 40) - paid);
  paid += earned;
  credits += earned;
  store();
  return earned;
}
const dayCode = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayCode(d);
}
const RULES = {
  wasps: "Осиный день: звеньев ос вдвое больше",
  heavy: "Тяжёлые лазеры: урон +40%, нагрев +30%",
  rockets: "Ракетный день: ракеты перезаряжаются вдвое быстрее",
  glass: "Без щита: щита нет, корпус +60, очки ×1.5",
  swarm: "Рой: врагов больше, но они слабее",
};
// «Бой дня» одинаков у всех в этот день: правило и волна, с которой он начинается
function dailyPlan(code = dayCode()) {
  let seed = (code * 2654435761) >>> 0;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const keys = Object.keys(RULES);
  return { rule: keys[Math.floor(next() * keys.length)], start: 4 + Math.floor(next() * 4) };
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
// Особые улучшения: появляются с 4-й волны золотой карточкой
const SPECIALS = [
  { id: "drones", max: 2, ic: "🛰️", name: "Дрон-напарник", text: "Летает рядом с турелью и сам стреляет по врагам", apply: () => S.drones++ },
  { id: "chain", max: 2, ic: "🌩️", name: "Цепная молния", text: "Попадание иногда перескакивает на соседние цели", apply: () => S.chain++ },
  { id: "cluster", max: 1, ic: "🎆", name: "Кассетные ракеты", text: "Каждая ракета рвётся ещё на четыре осколка", apply: () => S.cluster++ },
];

// Панель может появиться прямо под пальцем, которым игрок ещё стреляет. Если он его отпустит,
// браузер засчитает щелчок по кнопке под пальцем. Поэтому кнопка срабатывает, только когда
// нажатие началось на ней самой (или с клавиатуры: у такого щелчка detail равен 0).
function onPress(button, action) {
  let pressed = false;
  button.addEventListener("pointerdown", () => (pressed = true));
  button.addEventListener("click", (event) => {
    if (event.detail !== 0 && !pressed) return;
    pressed = false;
    action();
  });
}
// Перед новой волной и новой попыткой: в VK-версии здесь реклама (games-portal/vk/games/strazh.mjs).
// На портале — сразу дальше.
let gating = false;
async function gate() {
  await window.vkGameHost?.interstitial();
}
function ungate() {
  updateVisibility();
}

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
  meteorStage = false;
  bump("wave", wave);
  const more = rule === "swarm" ? 1.4 : 1;
  if (wave % 5 === 0) {
    // каждая пятая — босс: флагман, а на каждой десятой — Улей
    const hive = (wave / 5) % 2 === 0;
    add(hive ? "hive" : "boss", 1, 1.5, 0);
    add("scout", 2 + Math.floor(wave / 5), 8, 6);
    if (wave >= 15) add("miner", 1, 14, 0);
    el("bossfill").style.transform = "scaleX(1)";
    el("bossbar").querySelector("span").textContent = hive ? "УЛЕЙ" : "ФЛАГМАН";
    el("bossbar").hidden = false;
    Sound.boss();
    banner(hive ? "УЛЕЙ" : "ФЛАГМАН");
  } else if (wave % 5 === 3) {
    // бонус «Метеорный поток»: метеоры не стреляют, пять ручьёв по четыре, каждый шестой — золотой
    meteorStage = true;
    meteors = { total: 0, got: 0 };
    for (let i = 0; i < 20; i++) queue.push({ kind: i % 6 === 5 ? "gold" : "meteor", at: 1.4 + Math.floor(i / 4) * 3.4 + (i % 4) * 0.42 });
    Sound.wave();
    banner("МЕТЕОРНЫЙ ПОТОК");
    floater("РАЗБЕЙ ВСЕ МЕТЕОРЫ — БУДЕТ БОНУС", null, "#7ff6ff", 2.8);
  } else {
    // Состав растёт плавно: новый тип врага приходит по одному, а не толпой.
    add("scout", Math.round((4 + Math.floor(wave / 2)) * more), 1, Math.max(1.2, 2.6 - wave * 0.1));
    if (wave >= 2) add("bomber", Math.round((2 + Math.floor((wave - 2) / 3)) * more), 5, Math.max(3, 4.5 - wave * 0.1));
    if (wave >= 4) add("squad", (1 + Math.floor((wave - 4) / 4)) * (rule === "wasps" ? 2 : 1), 7, 11);
    if (wave >= 4) add("gunship", 1 + Math.floor((wave - 4) / 4), 9, 9);
    if (wave >= 6) add("lancer", 1 + Math.floor((wave - 6) / 3), 6, 10);
    if (wave >= 7) add("miner", 1 + Math.floor((wave - 7) / 4), 8, 12);
    if (wave >= 11) add("warden", 1 + Math.floor((wave - 11) / 6), 10, 14);
    Sound.wave();
    banner("ВОЛНА " + wave);
  }
  if (wave >= 2 && !meteorStage) queue.push({ kind: "pod", at: rand(7, 13) });
  queue.sort((a, b) => a.at - b.at);
  el("wave").textContent = wave;
  Sound.mood(wave % 5 === 0 ? 2 : 1);
  for (const id of ["menu", "upgrade", "dead"]) el(id).hidden = true;
}
function clearField() {
  for (const e of enemies) {
    if (e.beam) removeModel(e.beam);
    if (e.kind !== "node") removeModel(e.g);
    e.gone = true;
  }
  enemies.length = 0;
  squads.length = 0;
  doomed.length = 0;
  track = null;
  lasers.forEach((l) => (l.life = 0));
  bolts.forEach((b) => (b.live = false));
  for (const r of rocketsLive) removeModel(r.m);
  rocketsLive.length = 0;
  marks.length = arcs.length = blasts.length = 0;
  el("bossbar").hidden = true;
}
function waveCleared() {
  S.state = "upgrade";
  clearField();
  clearInput();
  el("pause-button").hidden = true;
  score += 50 * wave;
  let note = "";
  if (meteorStage) {
    // итог метеорного потока: разбил все — ремонт, полный щит и 1000 очков
    const all = meteors.got >= meteors.total && meteors.total > 0;
    if (all) {
      score += 1000;
      S.hull = Math.min(S.hullMax, S.hull + 30);
      S.shield = S.shieldMax;
      bump("perfect");
      celebrate();
    }
    note = all ? "Метеорный поток: ИДЕАЛЬНО! +1000 очков, корпус +30, щит заряжен. " : `Метеорный поток: разбито ${meteors.got} из ${meteors.total}. `;
  }
  // Между волнами ремонтные дроны немного латают корпус.
  const patched = Math.round(Math.min(S.hullMax, S.hull + 12 + hangar.repair * 4) - S.hull);
  S.hull += patched;
  el("patch").textContent = note + (patched > 0 ? `Ремонтные дроны подлатали корпус: +${patched}` : "");
  if (mode === "battle") best = Math.max(best, wave);
  wave++;
  store();
  el("best").textContent = best;
  Sound.clear();
  Sound.mood(0);
  if (mode === "daily" && wave > dailyEnd) return dailyDone();
  // с 4-й волны одна из карточек может быть особой (золотой)
  const regular = [...UPGRADES].sort(() => Math.random() - 0.5);
  const special = SPECIALS.filter((u) => S[u.id] < u.max);
  const cards = wave >= 5 && special.length && Math.random() < 0.5 ? [...regular.slice(0, 2), pick(special)] : regular.slice(0, 3);
  el("cards").innerHTML = "";
  cards.forEach((u, i) => {
    const b = document.createElement("button");
    b.className = "card" + (u.id ? " special" : "");
    b.style.setProperty("--i", i);
    b.innerHTML = `${u.id ? '<em class="tag">ОСОБОЕ</em>' : ""}<span class="ic">${u.ic}</span><b>${u.name}</b><small>${u.text}</small>`;
    onPress(b, async () => {
      if (S.state !== "upgrade" || gating) return;
      Sound.unlock();
      Sound.pick();
      gating = true;
      await gate();
      gating = false;
      if (S.state !== "upgrade") return;
      u.apply();
      startWave();
      ungate();
    });
    el("cards").appendChild(b);
  });
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
  const earned = payout();
  const record = mode === "daily" && finishDaily(false);
  el("result").textContent = `Волна ${wave} · Счёт ${score}`;
  showResult(earned, mode === "daily" ? "Бой дня окончен" : "Корпус пробит", mode === "daily" ? (record ? "Новый лучший счёт дня! Попробуй ещё — правило дня то же." : "Попробуй ещё раз — правило дня то же, начнёшь с той же волны.") : "Щит и корпус восстановятся. Улучшения останутся, счёт уменьшится на 20%.");
  // Попадание может быть внутри обхода врагов или снарядов.
  queueMicrotask(clearField);
  Sound.boom(2);
  Sound.mood(0);
  shake = 2;
  whiteout = 0.6;
  setTimeout(() => {
    if (S.state !== "dead") return;
    el("dead").hidden = false;
    el("retry").focus({ preventScroll: true });
  }, 750);
}
// Панель итога: заголовок, пояснение, заработанные кристаллы (числа «подпрыгивают»), ролик за награду в VK
function showResult(earned, title, text) {
  el("dead-title").textContent = title;
  el("dead-text").textContent = text;
  el("earned").innerHTML = `Кристаллы за бой: <b>+◆ ${earned}</b> · всего ◆ ${credits}`;
  countUp(el("earned").querySelector("b"), earned, "+◆ ");
  const reward = el("reward");
  reward.hidden = !(window.vkGameHost?.inVk && earned > 0);
  reward.disabled = false;
  reward.dataset.n = earned;
  reward.textContent = `▶ Ролик: ещё +◆ ${earned}`;
}
function countUp(node, value, prefix) {
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 900);
    node.textContent = prefix + Math.round(value * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// Ролик за награду (только в VK, только по кнопке): ещё столько же кристаллов
let rewarding = false;
onPress(el("reward"), async () => {
  const button = el("reward");
  if (rewarding || button.disabled || !window.vkGameHost?.inVk) return;
  rewarding = true;
  const shown = await window.vkGameHost.rewarded().catch(() => false);
  rewarding = false;
  if (!shown) return floater("РОЛИК СЕЙЧАС НЕДОСТУПЕН", null, "#ffb35f", 1.8);
  const n = Number(button.dataset.n) || 0;
  credits += n;
  store();
  button.disabled = true;
  button.textContent = `✓ Получено +◆ ${n}`;
  el("earned").innerHTML = `Кристаллы за бой: <b>+◆ ${n * 2}</b> · всего ◆ ${credits}`;
});
// ---------- «Бой дня» ----------
let dailyEnd = 0;
// Итог «Боя дня»: лучший счёт дня; при победе — серия дней и награда
function finishDaily(win) {
  const today = dayCode();
  if (daily.bd !== today) (daily.b = 0), (daily.bd = today);
  const record = score > daily.b;
  daily.b = Math.max(daily.b, score);
  let bonus = 0;
  if (win && daily.d !== today) {
    daily.s = daily.d === yesterday() ? daily.s + 1 : 1;
    daily.d = today;
    bonus = 40 + 10 * Math.min(7, daily.s);
    credits += bonus;
  }
  if (win) bump("daily");
  store();
  return win ? bonus : record;
}
function dailyDone() {
  S.state = "dead";
  el("pause-button").hidden = true;
  const earned = payout();
  const bonus = finishDaily(true);
  el("result").textContent = `Пять волн отбито · Счёт ${score}`;
  showResult(earned + bonus, "Бой дня пройден!", bonus ? `Серия: ${daily.s} ${daily.s === 1 ? "день" : "дн."} подряд, награда ◆ ${bonus}. Завтра будет новое правило.` : "Сегодня ты его уже проходил — награда за день получена. Завтра будет новое правило.");
  celebrate();
  setTimeout(() => {
    el("dead").hidden = false;
    el("retry").focus({ preventScroll: true });
  }, 600);
}
// Праздничные искры поверх экрана: победа в «Бою дня», идеальный метеорный поток, сбитый босс
const sparks = [];
function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 120; i++) {
    const a = rand(0, TAU);
    const v = rand(160, 520);
    sparks.push({ x: innerWidth / 2, y: innerHeight * 0.38, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: rand(0.9, 1.8), c: pick(["#ffd25f", "#7fe8ff", "#ff9ad8", "#9dffb0", "#ffffff"]) });
  }
}

function togglePause() {
  if (S.state === "play") {
    clearInput();
    S.state = "paused";
    el("paused").hidden = false;
    el("resume").focus({ preventScroll: true });
    Sound.hush();
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
  tmp2 = V(),
  tmp3 = V();
// Зона захвата чуть шире корпуса. Приоритет у цели ближе к центру прицела.
function assistTarget() {
  const help = (wave < 3 ? 0.17 : 0.115) + (camera.aspect < 1 ? 0.035 : 0);
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
// Пока прицел доворачивается к выбранной цели, лазеры бьют по тому, что уже под прицелом.
function laserTarget() {
  if (track && tmp.copy(track.pos).normalize().angleTo(fwd) < 0.22) return track;
  return assistTarget();
}

// Луч из точки from в точку point: у каждого свой урон и цвет
function shoot(from, point, dmg, colors, w = 1) {
  const l = lasers[laserNext];
  l.w = w;
  laserMesh.setColorAt(laserNext, colors[0]);
  laserGlow.setColorAt(laserNext, colors[1]);
  laserMesh.instanceColor.needsUpdate = laserGlow.instanceColor.needsUpdate = true;
  laserNext = (laserNext + 1) % LASERS;
  l.p.copy(from);
  l.from.copy(from);
  l.d.copy(point).sub(from).normalize();
  l.life = RANGE / LASER_SPEED;
  l.dmg = dmg;
}
function fireLaser() {
  const b = barrels[side];
  side = 1 - side;
  b.userData.kick = 1;
  const from = b.userData.tip.getWorldPosition(tmp3);
  const target = laserTarget();
  const point = target ? tmp2.copy(target.pos).addScaledVector(target.vel, target.pos.length() / LASER_SPEED) : tmp2.copy(fwd).multiplyScalar(500);
  shoot(from, point, S.dmg, S.overdrive > 0 ? LASER_COLOR.over : LASER_COLOR.cool);
  if (S.overdrive <= 0) {
    S.heat = Math.min(100, S.heat + 3.9 * S.heatK);
    if (S.heat >= 100) {
      S.overheated = true;
      Sound.overheat();
    }
  }
  muzzleLight.intensity = 3.2;
  Sound.laser(S.overdrive > 0);
}
function fireRockets() {
  const targets = enemies.filter(hostile);
  if (S.state !== "play" || S.rocketIn > 0 || !targets.length) return;
  S.rocketIn = S.rocketCd;
  Sound.rocket();
  shake = Math.max(shake, 0.3);
  const angle = (e) => tmp.copy(e.pos).normalize().angleTo(fwd);
  targets.sort((a, b) => angle(a) - angle(b));
  const count = S.rockets * (S.boost ? 2 : 1);
  S.boost = false;
  for (let i = 0; i < count; i++) {
    const m = new T.Group();
    m.add(
      part(GEO.cyl, metal("#d8e8ff"), 0.18, 1.12, 0.18),
      at(part(GEO.cone, metal("#ff9560"), 0.18, 0.41, 0.18), 0, 0.71, 0),
      at(part(GEO.cone, lit("#ffb057", 2.6), 0.18, 0.76, 0.18), 0, -0.92, 0),
      at(flare("#ffb961", 1.6), 0, -0.9, 0),
    );
    const p = camera.position.clone().add(V((i % 2 ? 1 : -1) * 1.6, -1.2, -2.8).applyQuaternion(camera.quaternion));
    m.position.copy(p);
    m.visible = false;
    scene.add(m);
    const v = fwd.clone().add(V(rand(-0.5, 0.5), rand(0.1, 0.6), rand(-0.5, 0.5))).normalize().multiplyScalar(40);
    rocketsLive.push({ m, p, v, target: targets[i % targets.length], life: 6, trail: 0, delay: i * 0.07 });
  }
}

// ---------- Дроны-напарники ----------
// Висят по бокам от турели и сами бьют по ближайшей к прицелу цели (зелёные лучи).
const drones = [-1, 1].map((side) => {
  const d = buildDrone();
  d.visible = false;
  d.userData.side = side;
  d.userData.fireIn = rand(0.2, 0.5);
  camera.add(d);
  return d;
});
function updateDrones(dt, t, playing) {
  drones.forEach((d, i) => {
    d.visible = S.drones > i && S.state !== "menu";
    if (!d.visible) return;
    const u = d.userData;
    d.position.set(u.side * (camera.aspect < 1 ? 0.55 : 1.15), 0.62 + Math.sin(t * 2.2 + i * 2) * 0.04, -2.6);
    u.eye.scale.setScalar(0.09 * (1 + Math.max(0, u.flash || 0) * 1.5)); // 0.09 — исходный размер глаза
    u.flash = Math.max(0, (u.flash || 0) - dt * 5);
    if (!playing || (u.fireIn -= dt) > 0) return;
    u.fireIn = 0.42;
    let target = null;
    let bestAngle = 0.9;
    for (const e of enemies) {
      if (!hostile(e) || e.pos.length() > RANGE) continue;
      const angle = tmp.copy(e.pos).normalize().angleTo(fwd);
      if (angle < bestAngle) (bestAngle = angle), (target = e);
    }
    if (!target) return;
    // луч дрона тоньше и рождается чуть впереди: у самой камеры его свечение закрыло бы пол-экрана
    const from = d.getWorldPosition(tmp3);
    const aim = tmp2.copy(target.pos).addScaledVector(target.vel, target.pos.length() / LASER_SPEED);
    from.addScaledVector(tmp.copy(aim).sub(from).normalize(), 6);
    shoot(from, aim, S.dmg * 0.55, LASER_COLOR.drone, 0.5);
    u.flash = 1;
    Sound.drone();
  });
}
// Цепная молния: разряд перескакивает с цели на ближайших соседей
function chainFrom(from, dmg) {
  const near = enemies
    .filter((e) => e !== from && hostile(e) && !e.gone && e.pos.distanceTo(from.pos) < 60)
    .sort((a, b) => a.pos.distanceTo(from.pos) - b.pos.distanceTo(from.pos))
    .slice(0, 1 + S.chain);
  let prev = from.pos;
  for (const e of near) {
    arcs.push({ a: prev.clone(), b: e.pos.clone(), t: 0 });
    prev = e.pos;
    damage(e, dmg, e.pos);
  }
  if (near.length) Sound.zap();
}

// ---------- Управление ----------
const fingers = new Map();
let firing = false;
// Касание по рамке врага или по стрелке у края экрана выбирает цель.
function pickAt(x, y) {
  let found = null,
    nearest = Infinity;
  for (const e of enemies) {
    const reach = e.on ? e.ss + 30 : 46;
    const dx = Math.abs(x - e.sx),
      dy = Math.abs(y - e.sy);
    if (dx > reach || dy > reach) continue;
    if (dx + dy < nearest) (nearest = dx + dy), (found = e);
  }
  return found;
}
canvas.addEventListener("pointerdown", (e) => {
  if (S.state !== "play" || e.button !== 0 || fingers.size > 0) return;
  Sound.unlock();
  canvas.setPointerCapture(e.pointerId);
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
  firing = true;
  track = pickAt(e.clientX, e.clientY);
  if (track) Sound.lock(), (lockPulse = 1);
});
canvas.addEventListener("pointermove", (e) => {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  const dx = e.clientX - f.x,
    dy = e.clientY - f.y;
  f.x = e.clientX;
  f.y = e.clientY;
  if (track) {
    // Палец дрожит — цель не теряется. Отвёл далеко — прицел снова в руках игрока.
    if (Math.hypot(f.x - f.x0, f.y - f.y0) < 42) return;
    track = null;
  }
  const k = (T.MathUtils.degToRad(camera.fov) / innerHeight) * 1.12;
  S.yaw += dx * k;
  S.pitch -= dy * k;
});
const lift = (e) => {
  fingers.delete(e.pointerId);
  firing = fingers.size > 0;
  if (!firing) track = null;
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
  track = null;
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
function quiet() {
  if (S.state === "play") togglePause();
  Sound.hush();
}
function updateVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) quiet();
  // Дальше бой и звук продолжатся по нажатию игрока («Продолжить»).
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
// Во время рекламного ролика игра молчит, после него звук возвращается
addEventListener("vk-ad", (e) => {
  if (e.detail.on) quiet();
  else if (!document.hidden && !window.vkGameHost?.hidden && S.state !== "paused") Sound.unlock();
});
el("pause-button").addEventListener("click", togglePause);
onPress(el("resume"), togglePause);
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
  if (gating || rewarding) return; // во время ролика кнопка звука молчит
  Sound.toggle();
  updateSoundButton();
});
// Новый бой: начальные числа турели, улучшения ангара, правило дня
function newRun(kind) {
  clearInput();
  clearField();
  Object.assign(S, START);
  S.hullMax = S.hull = 100 + hangar.armor * 10;
  S.shieldMax = S.shield = 100 + hangar.shield * 10;
  S.dmg *= 1 + hangar.caliber * 0.06;
  S.rockets += (hangar.rockets >= 2 ? 1 : 0) + (hangar.rockets >= 4 ? 1 : 0);
  S.rocketCd *= 1 - hangar.rockets * 0.06;
  mode = kind;
  rule = null;
  wave = 1;
  score = kills = paid = 0;
  combo = comboT = hurtFlash = hitMarker = shake = whiteout = fireIn = waveT = 0;
  timeScale = 1;
  if (kind === "daily") {
    const plan = dailyPlan();
    rule = plan.rule;
    wave = plan.start;
    dailyEnd = plan.start + 4;
    // пропущенные волны — случайные улучшения, чтобы не начинать с голой турелью
    for (let i = 1; i < plan.start; i++) pick(UPGRADES).apply();
    if (rule === "heavy") (S.dmg *= 1.4), (S.heatK = 1.3);
    if (rule === "rockets") S.rocketCd *= 0.5;
    if (rule === "glass") (S.shieldMax = S.shield = 0), (S.hullMax = S.hull = S.hullMax + 60);
  }
  S.yaw = 0;
  S.pitch = 0.25;
  el("score").textContent = 0;
  Sound.unlock();
  Sound.pick();
  startWave();
}
el("start").addEventListener("click", () => {
  if (S.state !== "menu") return;
  newRun("battle");
});
// Главное меню из боя: кристаллы за набранный счёт начисляются, бой начнётся заново с первой волны
function toMenu() {
  if (gating || rewarding || S.state === "menu") return;
  if (S.state === "play" || S.state === "paused" || S.state === "upgrade") payout();
  clearInput();
  clearField();
  Object.assign(S, START);
  wave = 1;
  score = kills = paid = 0;
  mode = "battle";
  rule = null;
  combo = comboT = hurtFlash = hitMarker = shake = whiteout = fireIn = waveT = 0;
  timeScale = 1;
  queue = [];
  el("wave").textContent = wave;
  el("score").textContent = score;
  for (const id of ["paused", "upgrade", "dead", "banner", "sheet"]) el(id).hidden = true;
  el("pause-button").hidden = true;
  paintMenu();
  el("menu").hidden = false;
  el("start").focus({ preventScroll: true });
  Sound.mood(0);
  Sound.unlock();
  Sound.pick();
}
for (const id of ["pause-menu", "upgrade-menu", "dead-menu"]) onPress(el(id), toMenu);
onPress(el("retry"), async () => {
  if (S.state !== "dead" || gating) return;
  Sound.unlock();
  gating = true;
  await gate();
  gating = false;
  if (S.state !== "dead") return;
  // «Бой дня» после поражения или победы начинается заново, обычный бой — с той же волны
  if (mode === "daily") {
    el("dead").hidden = true;
    newRun("daily");
    ungate();
    return;
  }
  clearField();
  S.hull = S.hullMax;
  S.shield = S.shieldMax;
  S.heat = 0;
  S.overheated = false;
  S.rocketIn = 0;
  S.overdrive = 0;
  S.boost = false;
  S.yaw = 0;
  S.pitch = 0.25;
  combo = comboT = hurtFlash = hitMarker = shake = fireIn = 0;
  timeScale = 1;
  score = Math.round(score * 0.8);
  Sound.unlock();
  Sound.pick();
  startWave();
  ungate();
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
  camera.fov = camera.aspect < 1 ? 80 : 57;
  camera.updateProjectionMatrix();
  // На узком экране пушки сдвигаются к центру, иначе их не видно.
  const spread = clamp(0.2 + 0.4 * camera.aspect, 0.4, 0.72);
  for (const b of barrels) b.position.x = b.userData.side * spread;
  dpr = Math.min(devicePixelRatio, 2);
  hud.width = w * dpr;
  hud.height = h * dpr;
}
addEventListener("resize", resize);
const proj = V();
const LABEL = { pod: "БОНУС", lancer: "КОПЬЁ", miner: "МИНЁР", warden: "ЩИТОНОСЕЦ", mine: "МИНА" };
function drawTarget(enemy, x, y, height, locked, t) {
  const worldToPixels = height / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
  const radius = (worldToPixels * enemy.K.r) / enemy.pos.length();
  const size = clamp(radius + 7, enemy.kind === "node" ? 15 : 21, height * 0.15);
  enemy.ss = size;
  const danger = !!enemy.charge;
  const tracked = enemy === track;
  const pulse = tracked ? lockPulse * 14 : 0;
  if (enemy.kind === "node") {
    // Узлов шесть и они рядом: вместо рамки — кольцо, заполненное по оставшейся прочности.
    const ring = Math.max(10, size * 0.62) + pulse;
    hx.lineWidth = 5;
    hx.strokeStyle = "rgba(4,11,26,.84)";
    hx.beginPath();
    hx.arc(x, y, ring, 0, TAU);
    hx.stroke();
    hx.lineWidth = locked || tracked ? 3 : 2;
    // люк улья: закрытый — тусклый, открытый — яркий
    const hatchColor = enemy.hatch ? (enemy.open ? "#ffe08a" : "#7a6a4a") : enemy.K.color;
    hx.strokeStyle = enemy.flashT > 0 ? "#ffffff" : locked || tracked ? "#aaffcb" : hatchColor;
    hx.beginPath();
    hx.arc(x, y, ring, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(enemy.hp / enemy.max, 0, 1));
    hx.stroke();
    return;
  }
  const corner = Math.min(13, size * 0.42);
  hx.beginPath();
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      hx.moveTo(x + dx * (size + pulse - corner), y + dy * (size + pulse));
      hx.lineTo(x + dx * (size + pulse), y + dy * (size + pulse));
      hx.lineTo(x + dx * (size + pulse), y + dy * (size + pulse - corner));
    }
  }
  hx.strokeStyle = "rgba(4,11,26,.84)";
  hx.lineWidth = locked || danger ? 6 : 5;
  hx.stroke();
  const guarded = enemy.guard > 0;
  const color = enemy.flashT > 0 ? "#ffffff" : danger ? (Math.sin(t * 22) > 0 ? "#ff5a4a" : "#ffd0c8") : locked ? "#aaffcb" : guarded ? "#7fe0ff" : enemy.gold ? "#ffd25f" : enemy.K.color;
  hx.strokeStyle = color;
  hx.lineWidth = locked || danger ? 3 : 2;
  hx.stroke();
  if (tracked) {
    // Выбранная цель: ромб вокруг рамки.
    hx.beginPath();
    hx.moveTo(x, y - size - 9);
    hx.lineTo(x + 7, y - size - 2);
    hx.lineTo(x, y - size + 5);
    hx.lineTo(x - 7, y - size - 2);
    hx.closePath();
    hx.fillStyle = "#aaffcb";
    hx.fill();
  }
  if (guarded) {
    // под щитом щитоносца: шестиугольник вокруг рамки
    hx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * TAU + t * 0.8;
      const r = size + 7;
      k ? hx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : hx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    hx.strokeStyle = "rgba(127,224,255,.7)";
    hx.lineWidth = 2;
    hx.stroke();
  }
  if (!enemy.K.boss && enemy.kind !== "meteor") {
    const width = Math.max(26, size * 1.5);
    hx.fillStyle = "rgba(4,11,26,.92)";
    hx.fillRect(x - width / 2 - 2, y - size - 10 - (tracked ? 12 : 0), width + 4, 7);
    hx.fillStyle = color;
    hx.fillRect(x - width / 2, y - size - 8 - (tracked ? 12 : 0), width * clamp(enemy.hp / enemy.max, 0, 1), 3);
  }
  const label = danger ? "⚠ СБЕЙ ЗАЛП" : guarded ? "ПОД ЩИТОМ" : LABEL[enemy.kind];
  if (label) {
    hx.font = "800 12px system-ui, sans-serif";
    hx.textAlign = "center";
    const width = hx.measureText(label).width + 12;
    hx.fillStyle = "rgba(7,15,36,.8)";
    hx.fillRect(x - width / 2, y + size + 6, width, 18);
    hx.fillStyle = color;
    hx.fillText(label, x, y + size + 19);
    if (danger) {
      // Сколько осталось до выстрела.
      hx.fillRect(x - width / 2, y + size + 26, width * (1 - enemy.charge.t / enemy.charge.dur), 3);
    }
  }
}
// Трещины на стекле кабины копятся вместе с повреждениями корпуса.
const CRACKS = [
  [0.08, 0.2],
  [0.93, 0.72],
  [0.86, 0.12],
].map(([x, y], n) => {
  const lines = [];
  let seed = 7 + n * 13;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  // Лучи расходятся от точки удара и слегка ломаются по дороге.
  for (let branch = 0; branch < 9; branch++) {
    let px = x,
      py = y,
      angle = (branch / 9) * TAU + next() * 0.3;
    const line = [[px, py]];
    const steps = 2 + Math.round(Math.abs(next()) * 3);
    for (let step = 0; step < steps; step++) {
      angle += next() * 0.32;
      px += Math.cos(angle) * 0.02;
      py += Math.sin(angle) * 0.027;
      line.push([px, py]);
    }
    lines.push(line);
  }
  return lines;
});
const sunPoint = V();

function drawHud(t, dt) {
  const w = innerWidth,
    h = innerHeight,
    cx = w / 2,
    cy = h / 2;
  hx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hx.clearRect(0, 0, w, h);

  // Блики объектива, когда в кадре Солнце.
  sunPoint.copy(SUN_DIR).multiplyScalar(2000).project(camera);
  if (sunPoint.z < 1 && Math.abs(sunPoint.x) < 1.15 && Math.abs(sunPoint.y) < 1.15) {
    const sx = (sunPoint.x + 1) * cx,
      sy = (1 - sunPoint.y) * cy;
    const fade = clamp(1.15 - Math.max(Math.abs(sunPoint.x), Math.abs(sunPoint.y)), 0, 0.4) / 0.4;
    hx.globalCompositeOperation = "lighter";
    for (const [k, size, rgb, alpha] of [
      [0.42, 46, "120,190,255", 0.1],
      [0.74, 22, "255,170,110", 0.13],
      [1.25, 74, "150,120,255", 0.07],
      [1.72, 120, "110,220,255", 0.05],
    ]) {
      const gx = sx + (cx - sx) * k,
        gy = sy + (cy - sy) * k;
      const ghost = hx.createRadialGradient(gx, gy, size * 0.55, gx, gy, size);
      ghost.addColorStop(0, `rgba(${rgb},${alpha * fade})`);
      ghost.addColorStop(0.85, `rgba(${rgb},${alpha * fade * 1.5})`);
      ghost.addColorStop(1, `rgba(${rgb},0)`);
      hx.fillStyle = ghost;
      hx.fillRect(gx - size, gy - size, size * 2, size * 2);
    }
    hx.globalCompositeOperation = "source-over";
  }
  if (S.state === "menu") return;

  const target = S.state === "play" ? laserTarget() : null;
  // Рамки остаются читаемыми, даже пока корабли далеко.
  for (const e of enemies) {
    proj.copy(e.pos).project(camera);
    const behind = proj.z > 1;
    e.on = !behind && Math.abs(proj.x) < 0.96 && Math.abs(proj.y) < 0.94;
    if (e.on) {
      e.sx = ((proj.x + 1) * w) / 2;
      e.sy = ((1 - proj.y) * h) / 2;
      drawTarget(e, e.sx, e.sy, h, e === target, t);
    } else {
      let ax = proj.x,
        ay = proj.y;
      if (behind) (ax = -ax), (ay = -ay);
      const a = Math.atan2(-ay * h, ax * w),
        rx = w / 2 - 34,
        ry = h / 2 - 34,
        k = 1 / Math.max(Math.abs(Math.cos(a)) / rx, Math.abs(Math.sin(a)) / ry);
      e.sx = cx + Math.cos(a) * k;
      e.sy = cy + Math.sin(a) * k;
      if (e.kind === "node") continue;
      const danger = !!e.charge;
      const grow = danger ? 1.5 : e === track ? 1.3 : 1;
      hx.save();
      hx.translate(e.sx, e.sy);
      hx.rotate(a);
      hx.scale(grow, grow);
      hx.fillStyle = danger ? "#ff5a4a" : e.K.color;
      hx.strokeStyle = "rgba(4,11,26,.85)";
      hx.lineWidth = 4;
      hx.globalAlpha = e.kind === "bomber" || danger ? 0.72 + 0.28 * Math.sin(t * (danger ? 20 : 8)) : 0.9;
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

  // лучи щитоносцев к тем, кого они закрывают
  hx.setLineDash([6, 6]);
  hx.lineDashOffset = -t * 30;
  for (const e of enemies) {
    if (e.kind !== "warden" || !e.on || !e.links) continue;
    for (const x of e.links) {
      if (!x.on || x.gone) continue;
      hx.strokeStyle = "rgba(127,224,255,.55)";
      hx.lineWidth = 2;
      hx.beginPath();
      hx.moveTo(e.sx, e.sy);
      hx.lineTo(x.sx, x.sy);
      hx.stroke();
    }
  }
  hx.setLineDash([]);
  // разряды цепной молнии: ломаная линия между целями
  for (let i = arcs.length - 1; i >= 0; i--) {
    const arc = arcs[i];
    arc.t += dt;
    if (arc.t > 0.18) {
      arcs.splice(i, 1);
      continue;
    }
    const a = proj.copy(arc.a).project(camera);
    if (a.z > 1) continue;
    const ax = ((a.x + 1) * w) / 2,
      ay = ((1 - a.y) * h) / 2;
    const b = proj.copy(arc.b).project(camera);
    if (b.z > 1) continue;
    const bx = ((b.x + 1) * w) / 2,
      by = ((1 - b.y) * h) / 2;
    for (const [width, style] of [[6, "rgba(120,200,255,.35)"], [2, "#e8fbff"]]) {
      hx.strokeStyle = style;
      hx.lineWidth = width;
      hx.beginPath();
      hx.moveTo(ax, ay);
      for (let k = 1; k < 7; k++) {
        const f = k / 7;
        hx.lineTo(ax + (bx - ax) * f + rand(-9, 9), ay + (by - ay) * f + rand(-9, 9));
      }
      hx.lineTo(bx, by);
      hx.stroke();
    }
  }
  // крестик над только что сбитым врагом
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    m.t += dt;
    if (m.t > 0.32) {
      marks.splice(i, 1);
      continue;
    }
    const p = proj.copy(m.pos).project(camera);
    if (p.z > 1) continue;
    const mx = ((p.x + 1) * w) / 2,
      my = ((1 - p.y) * h) / 2,
      r = 8 + m.t * 40;
    hx.globalAlpha = 1 - m.t / 0.32;
    hx.strokeStyle = "#ffd25f";
    hx.lineWidth = 3;
    hx.beginPath();
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      hx.moveTo(mx + dx * r * 0.45, my + dy * r * 0.45);
      hx.lineTo(mx + dx * r, my + dy * r);
    }
    hx.stroke();
    hx.globalAlpha = 1;
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
  if (hitMarker > 0) {
    // Отметка попадания: четыре косые черты.
    hx.beginPath();
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      hx.moveTo(cx + dx * 9, cy + dy * 9);
      hx.lineTo(cx + dx * 15, cy + dy * 15);
    }
    hx.stroke();
  }
  hx.fillStyle = hx.strokeStyle;
  hx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  hx.lineWidth = 5;
  hx.strokeStyle = "rgba(255,255,255,.15)";
  hx.beginPath();
  hx.arc(cx, cy, 44, Math.PI * 0.25, Math.PI * 0.75);
  hx.stroke();
  const over = S.overdrive > 0;
  hx.strokeStyle = over ? "#ffd25f" : S.overheated ? "#ff3f3f" : S.heat > 70 ? "#ffb35f" : "#7fe8ff";
  hx.beginPath();
  hx.arc(cx, cy, 44, Math.PI * 0.75 - Math.PI * 0.5 * (over ? S.overdrive / 8 : Math.min(100, S.heat) / 100), Math.PI * 0.75);
  hx.stroke();
  hx.globalAlpha = 1;
  if (S.overheated || target || over) {
    hx.fillStyle = S.overheated ? "#ff8668" : over ? "#ffd25f" : "#aaffcb";
    hx.font = "800 13px system-ui, sans-serif";
    hx.textAlign = "center";
    const label = S.overheated ? "ПЕРЕГРЕВ" : over ? "ОВЕРДРАЙВ " + Math.ceil(S.overdrive) : "ЦЕЛЬ ЗАХВАЧЕНА";
    const width = hx.measureText(label).width + 18;
    const textColor = hx.fillStyle;
    hx.fillStyle = "rgba(7,15,36,.76)";
    hx.fillRect(cx - width / 2, cy + 57, width, 20);
    hx.fillStyle = textColor;
    hx.fillText(label, cx, cy + 71);
  }
  if (combo > 1) {
    // комбо «подпрыгивает» на каждом новом сбитом
    hx.fillStyle = "#ffd25f";
    hx.font = `800 ${Math.round(22 * (1 + comboPop * 0.6))}px sans-serif`;
    hx.textAlign = "center";
    hx.fillText("×" + combo, cx, cy - 56);
  }
  comboPop = Math.max(0, comboPop - dt * 4);

  // Всплывающие надписи: очки над сбитым врагом, сообщения по центру.
  hx.textAlign = "center";
  let row = 0;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    if (f.t >= f.life) {
      floaters.splice(i, 1);
      continue;
    }
    const u = f.t / f.life;
    let x = cx,
      y = h * 0.34 + row * 30;
    if (f.pos) {
      proj.copy(f.pos).project(camera);
      if (proj.z > 1) continue;
      x = ((proj.x + 1) * w) / 2;
      y = ((1 - proj.y) * h) / 2 - 18 - u * 42;
      hx.font = "800 17px system-ui, sans-serif";
    } else {
      row++;
      hx.font = "800 22px system-ui, sans-serif";
    }
    hx.globalAlpha = Math.min(1, u * 8) * Math.min(1, (1 - u) * 3);
    hx.lineWidth = 4;
    hx.strokeStyle = "rgba(4,11,26,.85)";
    hx.strokeText(f.text, x, y);
    hx.fillStyle = f.color;
    hx.fillText(f.text, x, y);
  }
  hx.globalAlpha = 1;

  const wear = 1 - S.hull / S.hullMax;
  if (wear > 0.35 && S.state !== "upgrade") {
    hx.strokeStyle = "rgba(205,235,255,.42)";
    hx.lineWidth = 1.2;
    hx.beginPath();
    CRACKS.slice(0, wear > 0.8 ? 3 : wear > 0.6 ? 2 : 1).forEach((lines) => {
      for (const line of lines) {
        line.forEach(([x, y], i) => (i ? hx.lineTo(x * w, y * h) : hx.moveTo(x * w, y * h)));
      }
    });
    hx.stroke();
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
  if (whiteout > 0.01) {
    hx.fillStyle = `rgba(255,244,230,${Math.min(1, whiteout) * 0.85})`;
    hx.fillRect(0, 0, w, h);
  }
}

// ---------- Кадр ----------
let clock = 0,
  last = 0,
  warmFrames = 3,
  debugSpeed = 1;
const up = V(0, 1, 0),
  q = new T.Quaternion(),
  look = new T.Matrix4(),
  enginePos = V(),
  seg = V();
let lastYaw = 0,
  lastPitch = 0.25,
  swayX = 0,
  swayY = 0;
// Первые кадры все модели стоят далеко в кадре: шейдеры собираются до боя, а не в его начале.
const warm = Object.keys(MODEL).map((kind) => {
  const g = MODEL[kind]();
  g.position.set(0, 240, -1500);
  scene.add(g);
  return g;
});

function steer(e, goal, speed, turn, dt) {
  tmp.copy(goal).sub(e.pos).normalize().multiplyScalar(speed);
  e.vel.lerp(tmp, Math.min(1, dt * turn));
}

function frame(ms) {
  const raw = (ms - last) / 1000 || 0;
  const real = Math.min(0.05, raw * debugSpeed);
  last = ms;
  if (S.state === "paused") {
    requestAnimationFrame(frame);
    return;
  }
  // Гибель флагмана идёт в замедлении.
  const slow = enemies.some((e) => e.dying !== undefined);
  timeScale += ((slow ? 0.35 : 1) - timeScale) * Math.min(1, real * 5);
  const dt = real * timeScale;
  clock += dt;
  const t = clock,
    playing = S.state === "play";

  // прицел: палец, стрелки или WASD
  const turn = 1.5 * real;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) S.yaw -= turn;
  if (keys.has("ArrowRight") || keys.has("KeyD")) S.yaw += turn;
  if (keys.has("ArrowUp") || keys.has("KeyW")) S.pitch += turn;
  if (keys.has("ArrowDown") || keys.has("KeyS")) S.pitch -= turn;
  if (S.state === "menu") S.yaw = Math.sin(t * 0.15) * 0.5;
  const triggerHeld = playing && (firing || keys.has("Space"));

  // Турель сама ведёт выбранную цель; в ручном режиме прицел лишь мягко «прилипает» к захваченной.
  if (track && (track.gone || !playing)) track = null;
  const follow = playing ? track || (triggerHeld ? assistTarget() : null) : null;
  if (follow) {
    tmp2.copy(follow.pos).addScaledVector(follow.vel, follow.pos.length() / LASER_SPEED);
    const wantYaw = Math.atan2(tmp2.x, -tmp2.z),
      wantPitch = Math.asin(clamp(tmp2.y / tmp2.length(), -1, 1));
    if (track) {
      // Турель тяжёлая: на дальнюю цель она доворачивается заметную долю секунды.
      const k = 1 - Math.exp(-real * 8);
      S.yaw += clamp((wantYaw - S.yaw) * k, -2.8 * real, 2.8 * real);
      S.pitch += clamp((wantPitch - S.pitch) * k, -2.8 * real, 2.8 * real);
    } else {
      const k = 1 - Math.exp(-real * (wave < 3 ? 3.4 : 2.4));
      S.yaw += (wantYaw - S.yaw) * k;
      S.pitch += (wantPitch - S.pitch) * k;
    }
  }
  S.yaw = clamp(S.yaw, -1.9, 1.9);
  S.pitch = clamp(S.pitch, -0.2, 1.15);
  shake *= Math.pow(0.02, real);
  camera.rotation.set(S.pitch + rand(-1, 1) * shake * 0.02, -S.yaw + rand(-1, 1) * shake * 0.02, rand(-1, 1) * shake * 0.03, "YXZ");
  camera.updateMatrixWorld();
  camera.getWorldDirection(fwd);

  // лазеры и нагрев
  S.overdrive = Math.max(0, S.overdrive - dt);
  const cooling = S.overheated ? 1.4 : triggerHeld ? 0.3 : 1;
  S.heat = Math.max(0, S.heat - S.cool * dt * cooling);
  if (S.overheated && S.heat < 35) S.overheated = false;
  fireIn -= dt;
  if (triggerHeld && !S.overheated && fireIn <= 0) {
    fireLaser();
    fireIn = 1 / (S.rate * (S.overdrive > 0 ? 1.7 : 1));
  }
  // Пушки чуть отстают от поворота турели и подпрыгивают от отдачи.
  if (real > 0) {
    swayX += (clamp((S.yaw - lastYaw) / real, -3, 3) * 0.035 - swayX) * Math.min(1, real * 9);
    swayY += (clamp((S.pitch - lastPitch) / real, -3, 3) * 0.035 - swayY) * Math.min(1, real * 9);
  }
  lastYaw = S.yaw;
  lastPitch = S.pitch;
  guns.rotation.set(swayY, swayX, 0);
  guns.position.set(-swayX * 0.6, -0.5 + swayY * 0.5 + Math.sin(t * 1.3) * 0.004, -1.6);
  const heatColor = S.overdrive > 0 ? "#ffd25f" : S.overheated ? "#ff5a3a" : S.heat > 70 ? "#ffa860" : "#7ce6ff";
  for (const b of barrels) {
    const u = b.userData;
    u.kick *= Math.pow(0.0005, real);
    b.position.z = u.kick * 0.12;
    u.glow.color.copy(tone(heatColor, 1.2)).multiplyScalar(0.85 + u.kick * 0.8 + (S.heat / 100) * 0.6);
    u.muzzle.visible = u.kick > 0.1;
    u.muzzle.material.opacity = u.kick * 0.8;
    u.muzzle.material.color.set(heatColor);
    u.muzzle.scale.setScalar(0.5 + u.kick * 0.7);
  }
  muzzleLight.intensity *= Math.pow(0.0003, real);
  muzzleLight.color.set(heatColor);

  updateDrones(dt, t, playing);
  S.rocketIn = Math.max(0, S.rocketIn - dt);
  el("rocket-cd").style.height = (S.rocketIn / S.rocketCd) * 100 + "%";
  const rocketReady = playing && S.rocketIn <= 0 && enemies.some(hostile);
  el("rocket").disabled = !rocketReady;
  el("rocket").classList.toggle("ready", rocketReady);
  el("rocket").classList.toggle("boost", S.boost);
  const rocketTime = S.rocketIn > 0 ? `${Math.ceil(S.rocketIn)} с` : S.boost ? "×2" : "";
  if (el("rocket-time").textContent !== rocketTime) el("rocket-time").textContent = rocketTime;

  // щит восстанавливается, если какое-то время не попадали
  if (playing && t - S.lastHurt > 5) S.shield = Math.min(S.shieldMax, S.shield + 9 * dt);
  hurtFlash = Math.max(0, hurtFlash - real * 2);
  hitMarker = Math.max(0, hitMarker - real);
  lockPulse = Math.max(0, lockPulse - real * 4);
  whiteout *= Math.pow(0.03, real);
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
    if (!queue.some((item) => item.kind !== "pod") && !enemies.some(hostile) && waveT > 2) waveCleared();
  }

  // звенья ос: невидимый ведущий летает между точками, осы держат строй за ним
  for (let i = squads.length - 1; i >= 0; i--) {
    const squad = squads[i];
    if (squad.alive <= 0) {
      squads.splice(i, 1);
      continue;
    }
    if (!squad.goal || squad.pos.distanceTo(squad.goal) < 10) squad.goal = place(rand(-1.2, 1.2), rand(0.12, 0.6)).multiplyScalar(rand(58, 96));
    tmp.copy(squad.goal).sub(squad.pos).normalize().multiplyScalar(KINDS.wasp.speed * (squad.pos.length() > RANGE ? 1.6 : 1));
    squad.vel.lerp(tmp, Math.min(1, dt * 1.4));
    squad.pos.addScaledVector(squad.vel, dt);
  }

  // враги
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i],
      K = e.K;
    e.t += dt;
    e.flashT -= dt;
    // белая вспышка при попадании
    const flashK = Math.max(0, e.flashT) / 0.12;
    if (flashK > 0 || e.lit) {
      for (const m of e.mats) {
        m.emissive.copy(m.userData.em).lerp(WHITE, flashK);
        m.emissiveIntensity = m.userData.ei + flashK * 1.5;
      }
      e.lit = flashK > 0;
    }
    if (e.guard > 0) e.guard -= dt;
    if (e.kind === "node") {
      // узел едет вместе с кольцом флагмана (люк — вместе с кольцом улья)
      tmp.copy(e.pos);
      e.g.getWorldPosition(e.pos);
      if (dt > 1e-4) e.vel.copy(e.pos).sub(tmp).divideScalar(dt);
      e.g.scale.setScalar(e.flashT > 0 ? 1.15 : 1);
      if (e.hatch) {
        const { lid, glow } = e.g.userData;
        lid.rotation.x += ((e.open ? 0.1 : Math.PI / 2) - lid.rotation.x) * Math.min(1, dt * 8);
        glow.visible = e.open;
      }
      continue;
    }
    const dist = e.pos.length();
    if (e.dying !== undefined) {
      // флагман разваливается: цепочка взрывов по корпусу
      e.dying -= real;
      e.vel.multiplyScalar(Math.pow(0.2, dt));
      if ((e.pops -= real) <= 0) {
        e.pops = 0.11;
        tmp.set(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)).multiplyScalar(K.r * 1.1).add(e.pos);
        fx.explode(tmp, 5, K.color, 1);
        Sound.boom(0);
        shake = Math.max(shake, 0.35);
      }
      e.g.rotation.z += dt * 0.5;
      if (e.dying <= 0) doomed.push(e);
    } else if (e.kind === "bomber") {
      // таран идёт прямо на станцию и взрывается об неё
      e.vel.copy(e.pos).normalize().multiplyScalar(-(K.speed + wave * 0.8));
      e.g.userData.core.material.color.copy(tone("#ff743f", 1)).multiplyScalar(2.2 + 0.8 * Math.sin(t * (4 + 220 / dist)));
      if (dist < 9) {
        hurt(34 * threat(), e.pos, "ram");
        kill(e, true);
        continue;
      }
    } else if (e.kind === "mine") {
      // мина плывёт к станции, мигает всё чаще и взрывается об неё
      e.vel.copy(e.pos).normalize().multiplyScalar(-(K.speed + wave * 0.3));
      e.g.rotation.x += dt * 1.5;
      e.g.rotation.y += dt;
      e.g.userData.core.material.color.copy(tone("#ff5a3a", 1)).multiplyScalar(1.6 + 1.2 * Math.max(0, Math.sin(t * (5 + 300 / dist))));
      if (dist < 9) {
        hurt(12 * threat(), e.pos, "ram");
        kill(e, true);
        continue;
      }
    } else if (e.kind === "meteor") {
      // метеор пролетает поперёк неба и исчезает вдали, если его не разбили
      e.g.rotation.x += e.spin.x * dt;
      e.g.rotation.y += e.spin.y * dt;
      if ((e.trail -= dt) <= 0) {
        e.trail = 0.05;
        fx.puff(GLOW, e.pos, null, 3.2, 0.4, 0.45, tone(e.gold ? "#ffd25f" : "#7ff6ff", 2), 0.7);
      }
      if (e.t > 10.5) {
        enemies.splice(i, 1);
        e.gone = true;
        if (track === e) track = null;
        removeModel(e.g);
        continue;
      }
    } else if (e.kind === "pod") {
      e.g.rotation.x += dt * 0.5;
      e.g.rotation.y += dt * 0.35;
      if (e.t > 21) {
        // улетел несбитым
        enemies.splice(i, 1);
        e.gone = true;
        if (track === e) track = null;
        removeModel(e.g);
        continue;
      }
    } else if (e.kind === "wasp") {
      tmp.copy(e.squad.pos).add(e.off).sub(e.pos).multiplyScalar(2.2).clampLength(0, K.speed * 1.7);
      e.vel.lerp(tmp, Math.min(1, dt * 3));
      e.fireIn -= dt;
      if (playing && dist < 125 && e.fireIn <= 0) (e.fireIn = rand(3.5, 6.5) * pace()), shootBolt(e.pos, 4, 0.014);
    } else if (e.kind === "lancer") {
      const lens = e.g.userData.lens.getWorldPosition(enginePos);
      if (e.phase === "move") {
        e.goal ||= place(rand(-0.95, 0.95), rand(0.16, 0.5)).multiplyScalar(rand(112, 138));
        steer(e, e.goal, K.speed * (dist > RANGE ? 2.4 : 1.5), 1.2, dt);
        if (e.pos.distanceTo(e.goal) < 7) (e.phase = "aim"), (e.wait = rand(1.2, 2.2));
      } else {
        e.vel.multiplyScalar(Math.pow(0.05, dt)); // тормозит и зависает
        if (e.phase === "aim") {
          if (playing && (e.wait -= dt) <= 0) (e.phase = "charge"), startCharge(e, 2.7, e.max * 0.3, 24);
        } else if (!e.charge || !updateCharge(e, dt, lens)) (e.phase = "move"), (e.goal = null);
      }
      e.g.userData.lens.scale.setScalar(0.7 * (1 + (e.charge ? (e.charge.t / e.charge.dur) * 1.4 : 0)));
    } else {
      if (!e.goal || e.pos.distanceTo(e.goal) < 8) newGoal(e);
      const approach = dist > RANGE ? 1.65 : 1;
      const speed = wave === 1 ? K.speed * 0.76 : K.speed;
      steer(e, e.goal, speed * approach, e.kind === "scout" ? 1.6 : 0.8, dt);
      // стреляют, только когда подошли
      e.fireIn -= dt;
      if (e.kind === "miner") {
        // минёр сбрасывает мины по одной, пока не подойдёт слишком близко
        if (playing && dist < 150 && (e.dropIn -= dt) <= 0 && enemies.filter((x) => x.kind === "mine").length < 6) {
          e.dropIn = rand(3, 4) * pace();
          const m = make("mine", tmp.copy(e.pos).add(V(0, -3.5, 0)));
          m.fireIn = 99;
          Sound.drop();
        }
      } else if (e.kind === "warden") {
        // щитоносец накрывает щитом двоих ближайших соседей (кроме боссов и других щитоносцев)
        e.g.userData.ring.rotation.z += dt * 1.6;
        e.links = enemies
          .filter((x) => x !== e && hostile(x) && !x.K.boss && x.kind !== "node" && x.kind !== "warden" && x.kind !== "mine" && x.pos.distanceTo(e.pos) < 80)
          .sort((a, b) => a.pos.distanceTo(e.pos) - b.pos.distanceTo(e.pos))
          .slice(0, 2);
        for (const x of e.links) x.guard = 0.2;
      } else if (e.kind === "hive") {
        const u = e.g.userData;
        u.spin.rotation.z += dt * 0.35;
        u.bubble.visible = e.shielded;
        u.bubble.material.uniforms.power.value *= Math.pow(0.02, dt);
        el("bossfill").style.transform = `scaleX(${Math.max(0, e.hp / e.max)})`;
        if (playing && dist < 175) {
          // люки открываются парами и выпускают ос; открытый люк можно разбить
          if ((e.hatchT -= dt) <= 0) {
            e.open = !e.open && e.nodes.length > 0;
            e.hatchT = e.open ? 3.6 : 2.4;
            for (const n of e.nodes) n.open = false;
            if (e.open) {
              const two = [...e.nodes].sort(() => Math.random() - 0.5).slice(0, 2);
              for (const n of two) n.open = true;
              if (squads.length < 2) spawnSquad(two[0].pos);
              if (!e.told) (e.told = true), floater("ЛЮКИ ОТКРЫТЫ — БЕЙ ПО НИМ!", null, "#ffe08a", 2);
            }
          }
          if (e.shielded) {
            const open = e.nodes.filter((n) => n.open);
            if ((e.nodeFire = (e.nodeFire ?? 1.2) - dt) <= 0 && open.length) (e.nodeFire = 1.1), shootBolt(pick(open).pos, 9, 0.012);
          } else {
            // ядро открыто: веер спор и новые звенья ос
            if ((e.fanIn -= dt) <= 0) {
              e.fanIn = 1.8;
              for (const k of [-2, -1, 0, 1, 2]) shootBolt(tmp.copy(e.pos).add(tmp2.set(k * 5, 0, 0)), 9, 0.016);
            }
            if ((e.spawnIn -= dt) <= 0 && squads.length < 2) (e.spawnIn = 8), spawnSquad(e.pos);
          }
        }
      }
      if (playing && dist < 150 && e.fireIn <= 0 && (e.kind === "scout" || e.kind === "gunship")) {
        if (e.kind === "scout") (e.fireIn = rand(1.9, 3.3) * pace()), shootBolt(e.pos, 8, 0.012);
        else {
          shootBolt(e.pos, 9, 0.01);
          e.burst = (e.burst + 1) % 3;
          e.fireIn = e.burst ? 0.22 : rand(2.6, 3.8) * pace();
        }
      }
      if (e.kind === "boss") {
        const u = e.g.userData;
        u.ring.rotation.z += dt * 0.6;
        u.bubble.visible = e.shielded;
        u.bubble.material.uniforms.power.value *= Math.pow(0.02, dt);
        el("bossfill").style.transform = `scaleX(${Math.max(0, e.hp / e.max)})`;
        if (playing && dist < 170) {
          if ((e.spawnIn -= dt) <= 0 && enemies.length < 12) (e.spawnIn = 7), make("scout", e.pos);
          if (e.shielded) {
            // узлы щита стреляют по очереди
            if ((e.nodeFire -= dt) <= 0 && e.nodes.length) (e.nodeFire = 1.05), shootBolt(pick(e.nodes).pos, 9, 0.01);
          } else if (e.charge) {
            updateCharge(e, dt, u.core.getWorldPosition(enginePos));
          } else if ((e.megaIn -= dt) <= 0) {
            e.megaIn = 12;
            startCharge(e, 3.2, e.max * 0.06, 36);
            floater("ГЛАВНЫЙ КАЛИБР — СБЕЙ ЗАЛП", null, "#ff8a7a", 2.2);
          } else if ((e.fanIn -= dt) <= 0) {
            e.fanIn = 2.2;
            for (const k of [-1, 0, 1]) shootBolt(tmp.copy(e.pos).add(tmp2.set(k * 7, 0, 0)), 11, 0.012);
          }
        }
        u.core.scale.z = 0.65 * (1 + (e.charge ? (e.charge.t / e.charge.dur) * 1.2 : 0));
      }
    }
    // короткая белая вспышка луча после выстрела
    if (e.beamFlash > 0) {
      e.beamFlash -= dt;
      const from = e.kind === "boss" ? e.g.userData.core.getWorldPosition(enginePos) : e.g.userData.lens.getWorldPosition(enginePos);
      aimBeam(e.beam, from, 1 + 3.2 * (e.beamFlash / 0.3), 1);
      if (e.beamFlash <= 0) e.beam.visible = false;
    }
    e.pos.addScaledVector(e.vel, dt);
    e.g.position.copy(e.pos);
    if (e.K.boss || e.kind === "warden" || (e.kind === "lancer" && e.phase !== "move")) {
      look.lookAt(e.pos, tmp.set(0, 0, 0), up);
      e.g.quaternion.slerp(q.setFromRotationMatrix(look), Math.min(1, dt * 4));
    } else if (e.kind !== "pod" && e.kind !== "meteor" && e.kind !== "mine" && e.vel.lengthSq() > 0.01) {
      look.lookAt(e.pos, tmp.copy(e.pos).add(e.vel), up);
      e.g.quaternion.slerp(q.setFromRotationMatrix(look), Math.min(1, dt * 6));
    }
    e.g.scale.setScalar(K.size * (e.flashT > 0 ? 1.12 : 1));
    // след двигателей и дым подбитого корабля
    const engines = e.g.userData.engines;
    if (engines && e.t > 0.15 && (e.trail -= dt) <= 0) {
      e.trail = 0.045;
      for (const point of engines) {
        fx.puff(GLOW, enginePos.copy(point).applyMatrix4(e.g.matrixWorld), null, K.size * 0.55, 0.05, 0.3, tone(K.color, 1.5), 0.8);
      }
    }
    if (e.hp < e.max * 0.45 && e.kind !== "wasp" && e.kind !== "meteor" && e.kind !== "mine" && (e.smoke -= dt) <= 0) {
      e.smoke = 0.09;
      tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(K.r * 0.25).add(e.pos);
      fx.puff(SMOKE, tmp, null, K.r * 0.22, K.r * 0.7, 0.9, tone("#4a4048", 1), 0.4, tone("#17151c", 1), 0.5, rand(-1, 1));
      if (Math.random() < 0.3) fx.burst(tmp, ["#ffb35f", "#ffffff"], 2, 12, 0.25);
    }
  }
  // Флагман взрывается и уносит с собой свою свиту.
  for (const boss of doomed) {
    banner(boss.kind === "hive" ? "УЛЕЙ УНИЧТОЖЕН" : "ФЛАГМАН УНИЧТОЖЕН");
    celebrate();
    kill(boss);
    for (const other of enemies.filter(hostile)) kill(other, true);
    queue = []; // подкрепление, которое ещё не прилетело, остаётся без флагмана и уходит
  }
  doomed.length = 0;

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
    laser.from.copy(laser.p);
    laser.p.addScaledVector(laser.d, nearest);
    if (hit) {
      damage(hit, laser.dmg, laser.p);
      if (S.chain && Math.random() < 0.18 + 0.12 * S.chain) chainFrom(hit, laser.dmg * 0.6);
      laser.life = 0;
      hide(laserMesh, i);
      hide(laserGlow, i);
      return;
    }
    laser.life -= dt;
    dummy.position.copy(laser.p);
    dummy.lookAt(tmp.copy(laser.p).add(laser.d));
    dummy.scale.set(laser.w, laser.w, 1);
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
      if (l.life <= 0) continue;
      // расстояние от заряда до отрезка, который луч прошёл за кадр
      seg.copy(l.p).sub(l.from);
      const length2 = seg.lengthSq();
      const along = length2 > 0 ? clamp(tmp.copy(b.p).sub(l.from).dot(seg) / length2, 0, 1) : 0;
      if (tmp.copy(l.from).addScaledVector(seg, along).distanceToSquared(b.p) < 12) {
        b.live = false;
        l.life = 0;
        fx.burst(b.p, ["#ff3f5f", "#ffffff"], 8, 14, 0.25);
        fx.puff(GLOW, b.p, null, 3, 8, 0.18, tone("#ff6f7f", 3));
        score += 1;
        return hide(boltMesh, i);
      }
    }
    const close = Math.min(1, b.p.length() / 26);
    if (close >= 1 && (b.trail -= dt) <= 0) {
      b.trail = 0.04;
      fx.puff(GLOW, b.p, null, b.size * 2.1, 0.2, 0.26, tone("#ff3f5f", 2.2), 0.7);
    }
    dummy.position.copy(b.p);
    dummy.lookAt(tmp.copy(b.p).add(b.v));
    const width = b.size * (1 + 0.15 * Math.sin(t * 30 + i)) * (0.35 + 0.65 * close);
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
    if (!r.target || r.target.gone) r.target = enemies.find(hostile) || null;
    if (r.target) {
      tmp.copy(r.target.pos).sub(r.p).normalize().multiplyScalar(130);
      r.v.lerp(tmp, Math.min(1, dt * 3.5));
    }
    r.p.addScaledVector(r.v, dt);
    r.m.position.copy(r.p);
    r.m.quaternion.setFromUnitVectors(up, tmp.copy(r.v).normalize());
    r.trail += dt;
    if (r.trail >= 0.03) {
      r.trail %= 0.03;
      fx.puff(GLOW, r.p, null, 1.5, 0.3, 0.3, tone("#ffb35f", 2.6));
      fx.puff(SMOKE, r.p, null, 0.6, 2.6, 0.9, tone("#7a7480", 1), 0.3, tone("#2a2830", 1), 0, rand(-1, 1));
    }
    const near = r.target && r.p.distanceTo(r.target.pos) < r.target.K.r + 2;
    if (near || r.life <= 0) {
      fx.explode(r.p, 5.5, "#ffb35f", 1);
      Sound.boom(1);
      shake = Math.max(shake, 0.25);
      for (const e of [...enemies]) {
        if (e.pos.distanceTo(r.p) >= e.K.r + 9) continue;
        e.byRocket = true;
        damage(e, S.rocketDmg * (e === r.target ? 1 : 0.5));
        e.byRocket = false;
      }
      // кассетные ракеты: четыре осколка разлетаются и рвутся рядом
      if (S.cluster) for (let k = 0; k < 4; k++) blasts.push({ p: r.p.clone().add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(8, 14))), t: 0.12 + k * 0.07 });
      removeModel(r.m);
      rocketsLive.splice(i, 1);
    }
  }
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    if ((b.t -= dt) > 0) continue;
    blasts.splice(i, 1);
    fx.explode(b.p, 4, "#ffd27a", 1);
    Sound.boom(0);
    for (const e of [...enemies]) {
      if (e.pos.distanceTo(b.p) >= e.K.r + 8) continue;
      e.byRocket = true;
      damage(e, S.rocketDmg * 0.35);
      e.byRocket = false;
    }
  }

  fx.update(dt, t);
  space.update(t, dt);
  if (warmFrames > 0 && --warmFrames === 0) warm.forEach(removeModel);

  drawParty(real);
  // приборы
  el("shield").style.transform = `scaleX(${Math.max(0, S.shield) / Math.max(1, S.shieldMax)})`;
  el("hull").style.transform = `scaleX(${S.hull / S.hullMax})`;
  el("hull").parentElement.classList.toggle("low", S.hull < S.hullMax * 0.3);
  el("score").textContent = score;
  drawHud(t, real);
  if (playing) Sound.mood(wave % 5 === 0 || S.hull < S.hullMax * 0.3 ? 2 : 1);

  if (perf.glow) {
    grade.uniforms.hurt.value = shieldImpact ? hurtFlash * 0.4 : hurtFlash;
    grade.uniforms.time.value = t % 10;
    composer.render();
  } else renderer.render(scene, camera);
  // «Авто»: если в бою стабильно меньше ~45 кадров в секунду — на ступень ниже
  if (playing && perf.set === "auto" && raw > 0 && raw < 0.25) {
    perf.time += raw;
    perf.frames++;
    if (perf.time >= 4) {
      if (perf.frames / perf.time < 45 && perf.auto !== "low") {
        perf.auto = perf.auto === "high" ? "medium" : "low";
        applyQuality();
      }
      perf.time = perf.frames = 0;
    }
  }
  requestAnimationFrame(frame);
}

const party = el("party"),
  px = party.getContext("2d");
let partyOn = false;
function drawParty(dt) {
  if (!sparks.length && !partyOn) return;
  const k = Math.min(devicePixelRatio, 2);
  if (party.width !== Math.round(innerWidth * k)) (party.width = Math.round(innerWidth * k)), (party.height = Math.round(innerHeight * k));
  px.setTransform(k, 0, 0, k, 0, 0);
  px.clearRect(0, 0, innerWidth, innerHeight);
  partyOn = sparks.length > 0;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    if ((p.life -= dt) <= 0) {
      sparks.splice(i, 1);
      continue;
    }
    p.vy += 520 * dt;
    p.vx *= 1 - dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    px.globalAlpha = Math.min(1, p.life * 2);
    px.fillStyle = p.c;
    px.fillRect(p.x - 3, p.y - 1.5, 6, 3);
  }
  px.globalAlpha = 1;
}
function applyQuality() {
  const q = QUALITY[perf.level()];
  perf.glow = q.glow;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.ratio));
  resize();
  const label = "Графика: " + QUALITY_NAME[perf.set] + (perf.set === "auto" ? ` (${QUALITY_NAME[perf.auto]})` : "");
  el("quality").textContent = label;
  el("pause-quality").textContent = label.toUpperCase();
}
function cycleQuality() {
  const order = ["auto", "high", "medium", "low"];
  perf.set = order[(order.indexOf(perf.set) + 1) % order.length];
  writeStorage("strazh_quality", perf.set);
  applyQuality();
}
el("quality").addEventListener("click", cycleQuality);
onPress(el("pause-quality"), cycleQuality);

// ---------- Меню: ангар, задания, «Бой дня» ----------
function paintMenu() {
  el("best").textContent = best;
  el("credits-note").textContent = "◆ " + credits;
  el("tasks-note").textContent = tasks.a.map((t) => Math.min(t.p, t.g) + "/" + t.g).join(" · ");
  const today = dayCode();
  el("daily-note").textContent = daily.d === today ? "✓ сегодня пройден" : daily.d === yesterday() && daily.s ? "🔥 серия " + daily.s : "новый каждый день";
}
let sheetKind = "";
let sheetPressed = false;
function openSheet(kind) {
  sheetKind = kind;
  const body = el("sheet-body");
  if (kind === "hangar") {
    const rows = HANGAR.map((key) => {
      const [ic, name, about] = HANGAR_INFO[key];
      const level = hangar[key];
      const price = PRICE[level];
      const buy = level >= 5 ? '<button class="buy" disabled>МАКС</button>' : `<button class="buy" data-buy="${key}"${credits < price ? " disabled" : ""}>◆ ${price}</button>`;
      return `<div class="row-item" data-row="${key}"><i>${ic}</i><span><b>${name}</b> <em>${"●".repeat(level)}${"○".repeat(5 - level)}</em><small>${about}</small></span>${buy}</div>`;
    }).join("");
    body.innerHTML = `<h2 id="sheet-title">🛠️ Ангар</h2><p class="lead">Кристаллы дают бои и задания. Улучшения ангара действуют в каждом бою.</p><p><b>◆ ${credits}</b></p><div class="rows">${rows}</div>`;
  } else if (kind === "tasks") {
    const rows = tasks.a.map((t) => {
      const m = MISSIONS[t.k];
      return `<div class="row-item"><i>🎯</i><span><b>${m.text(t.g)}</b><small>${Math.min(t.p, t.g)} из ${t.g}</small></span><em>◆ ${t.r}</em><div class="meter"><i style="transform:scaleX(${Math.min(1, t.p / t.g).toFixed(3)})"></i></div></div>`;
    }).join("");
    body.innerHTML = `<h2 id="sheet-title">🎯 Задания</h2><p class="lead">Выполняй в любом бою — награда сразу, на месте выполненного появится новое задание.</p><div class="rows">${rows}</div>`;
  } else {
    const plan = dailyPlan();
    const today = dayCode();
    const done = daily.d === today;
    const streak = daily.d === today || daily.d === yesterday() ? daily.s : 0;
    body.innerHTML = `<h2 id="sheet-title">📅 Бой дня</h2><p class="rule">${RULES[plan.rule]}</p>
      <p class="lead">Один для всех в этот день: начни с волны ${plan.start} и отбей пять волн подряд без повторов. Награда: ◆ ${40 + 10 * Math.min(7, streak + (done ? 0 : 1))} и серия дней.</p>
      <p>Серия: <b>${streak}</b> · лучший счёт сегодня: <b>${daily.bd === today ? daily.b : 0}</b>${done ? " · ✓ пройден" : ""}</p>
      <button class="big" data-go="daily">${done ? "ЕЩЁ РАЗ" : "В БОЙ"}</button>`;
  }
  el("menu").hidden = true;
  el("sheet").hidden = false;
  sheetPressed = false;
  el("sheet-back").focus({ preventScroll: true });
}
function closeSheet() {
  el("sheet").hidden = true;
  if (S.state === "menu") {
    paintMenu();
    el("menu").hidden = false;
  }
}
el("sheet").addEventListener("pointerdown", () => (sheetPressed = true));
el("sheet-body").addEventListener("click", (event) => {
  if (event.detail !== 0 && !sheetPressed) return;
  const buy = event.target.closest("[data-buy]");
  const go = event.target.closest("[data-go]");
  if (buy) {
    const key = buy.dataset.buy;
    const price = PRICE[hangar[key]];
    if (hangar[key] >= 5 || credits < price) return;
    credits -= price;
    hangar[key]++;
    store();
    Sound.unlock();
    Sound.bonus();
    openSheet("hangar");
    el("sheet-body").querySelector(`[data-row="${key}"]`)?.classList.add("bought");
  } else if (go && S.state === "menu") {
    el("sheet").hidden = true;
    newRun("daily");
  }
});
onPress(el("sheet-back"), closeSheet);
onPress(el("open-hangar"), () => openSheet("hangar"));
onPress(el("open-tasks"), () => openSheet("tasks"));
onPress(el("open-daily"), () => openSheet("daily"));

best = whole(save.best, 9999);
paintMenu();
el("menu-row").hidden = false;
applyQuality();
requestAnimationFrame(frame);
el("start").disabled = false;
el("load-status").hidden = true;
window.vkGameHost?.bannerWhen(() => S.state !== "play");

// Для проверок роботом: состояние боя и цели с экранными координатами.
window.strazh = {
  look: (yaw, pitch) => ((S.yaw = yaw), (S.pitch = pitch)),
  speed: (k) => (debugSpeed = k),
  tally: () => ({ ...tally }),
  glow: (value) => (perf.glow = value),
  quality: (level) => ((perf.set = level), applyQuality(), perf.level()),
  give: (n) => ((credits += n), store(), paintMenu(), credits),
  special: (id) => SPECIALS.find((u) => u.id === id)?.apply(),
  score: (n) => (score += n),
  turret: () => ({ ...S }),
  extra: () => ({ arcs: arcs.length, marks: marks.length, meteors: { ...meteors }, meteorStage, drones: drones.filter((d) => d.visible).length }),
  enemies: () => enemies.map((e) => ({ id: e.id, kind: e.kind, hp: e.hp, max: e.max, guard: e.guard > 0, open: !!e.open, hatch: !!e.hatch, shielded: !!e.shielded, dist: e.pos.length() })),
  hitId: (id, amount) => enemies.filter((e) => e.id === id).forEach((e) => damage(e, amount)),
  meta: () => ({ credits, hangar: { ...hangar }, tasks: tasks.a.map((t) => ({ ...t, key: MISSIONS[t.k].key })), daily: { ...daily }, mode, rule, quality: perf.level() }),
  hit: (kind, amount) => enemies.filter((e) => e.kind === kind).forEach((e) => damage(e, amount)),
  audio: () => Sound.level(),
  face(id, dYaw = 0, dPitch = 0) {
    const e = enemies.find((x) => x.id === id);
    if (e) (S.yaw = Math.atan2(e.pos.x, -e.pos.z) + dYaw), (S.pitch = Math.asin(e.pos.y / e.pos.length()) + dPitch);
  },
  win: () => ((queue = []), enemies.filter(hostile).forEach((e) => kill(e, true))),
  clock: () => clock,
  spawn: (kind) => spawn(kind),
  jump: (n) => ((wave = n), clearField(), startWave()),
  hurt: (n) => hurt(n, dirFrom(S.yaw + 0.3, S.pitch + 0.2).multiplyScalar(50)),
  state: () => ({ state: S.state, wave, score, kills, hull: S.hull, shield: S.shield, heat: S.heat, rocketIn: S.rocketIn, overdrive: S.overdrive, yaw: S.yaw, pitch: S.pitch, enemies: enemies.length, glow: perf.glow, track: track?.id ?? null, firing }),
  targets: () => enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.sx, y: e.sy, on: e.on, dist: e.pos.length(), hp: e.hp, charge: !!e.charge })),
};
