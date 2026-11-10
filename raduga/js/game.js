// «Радужная пушка»: добрый шутер. Мир посерел, по небу плывут хмурые тучки. Касаешься тучки —
// пушка стреляет краской, тучка становится цветной и весёлой. За раскрашенных тучек в небе дуга
// за дугой загорается радуга, на последней дуге приходит Большая Хмурь. Проиграть нельзя.
import * as T from "../vendor/three/three.module.min.js?v=c8f098b5";

const TAU = Math.PI * 2;
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = T.MathUtils.clamp;
const el = (id) => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const PAINTS = ["#ff4f6d", "#ff9a3c", "#ffd23f", "#4cd964", "#3fb4ff", "#6f6bff", "#c56bff"];
const GREY = new T.Color("#9aa3ad");
const ARCS = 7;
const SAVE = "raduga_save";

// ---------- Звук ----------
const Sound = (() => {
  let ctx = null;
  let on = localStorage.getItem("raduga_mute") !== "1";
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  const tone = (f, d = 0.15, type = "sine", v = 0.16, slide = 1, delay = 0) => {
    if (!on) return;
    const a = ac(),
      t = a.currentTime + delay,
      o = a.createOscillator(),
      g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d + 0.05);
  };
  let note = 0;
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319];
  return {
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      localStorage.setItem("raduga_mute", on ? "0" : "1");
      if (on) tone(660, 0.12, "triangle");
      return on;
    },
    shoot: () => tone(300, 0.12, "sine", 0.14, 2.2),
    // каждое попадание — следующая нотка гаммы: из выстрелов складывается мелодия
    hit: () => tone(SCALE[note++ % SCALE.length], 0.22, "triangle", 0.2),
    miss: () => tone(220, 0.08, "sine", 0.06, 0.7),
    arc: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, "triangle", 0.2, 1, i * 0.1)),
    star: () => [988, 1319, 1568].forEach((f, i) => tone(f, 0.2, "square", 0.08, 1, i * 0.06)),
    boss: () => tone(110, 0.6, "sawtooth", 0.12, 0.6),
    bossHit: () => tone(180, 0.18, "square", 0.1, 1.8),
    win: () => [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.32, "triangle", 0.2, 1, i * 0.14)),
  };
})();

// ---------- Сцена ----------
const canvas = el("stage");
const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = T.NeutralToneMapping;
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(0, 3, 12);
camera.lookAt(0, 5.5, -12);
scene.add(new T.HemisphereLight(0xffffff, 0x8a93a8, 1.5));
const sun = new T.DirectionalLight(0xfff3d6, 2.2);
sun.position.set(-6, 12, 10);
scene.add(sun);

const GEO = {
  ball: new T.SphereGeometry(1, 16, 12),
  low: new T.IcosahedronGeometry(1, 0),
  cyl: new T.CylinderGeometry(1, 1, 1, 14),
  frown: new T.TorusGeometry(0.16, 0.035, 6, 12, Math.PI),
};
const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const part = (geo, material, sx, sy, sz) => {
  const m = new T.Mesh(geo, material);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  return m;
};
const at = (m, x, y, z) => (m.position.set(x, y, z), m);

// Мир сереет и расцветает: у каждой вещи есть «настоящий» цвет, colorness смешивает его с серым
const tinted = [];
function world(material, color) {
  const full = new T.Color(color),
    hsl = {};
  full.getHSL(hsl);
  tinted.push({ material, full, grey: new T.Color().setHSL(hsl.h, 0.04, hsl.l * 0.85 + 0.08) });
  return material;
}
let colorness = 0;
const skyTop = [new T.Color("#aab3bd"), new T.Color("#6fc3ff")],
  skyLow = [new T.Color("#c9cfd6"), new T.Color("#d9f3ff")],
  c1 = new T.Color(),
  c2 = new T.Color();
function applyColorness() {
  for (const t of tinted) t.material.color.copy(t.grey).lerp(t.full, colorness);
  c1.copy(skyTop[0]).lerp(skyTop[1], colorness);
  c2.copy(skyLow[0]).lerp(skyLow[1], colorness);
  document.body.style.background = `linear-gradient(#${c1.getHexString()}, #${c2.getHexString()})`;
}

// Холмы, деревья, солнце
for (const [x, z, r, c] of [[-16, -30, 15, "#6fd36a"], [15, -34, 18, "#58c460"], [0, -46, 26, "#8fe07a"], [-34, -44, 20, "#7fd872"], [36, -42, 20, "#64cc66"]]) {
  scene.add(at(part(GEO.ball, world(mat("#fff", { roughness: 1 }), c), r, r * 0.55, r), x, -8.5, z));
}
for (let i = 0; i < 14; i++) {
  const g = new T.Group(),
    s = rand(0.8, 1.5);
  g.add(at(part(GEO.cyl, world(mat("#fff"), "#9a6a44"), 0.18 * s, 1.2 * s, 0.18 * s), 0, 0.6 * s, 0));
  g.add(at(part(GEO.low, world(mat("#fff", { flatShading: true }), pick(["#3fae5b", "#57c06a", "#ff8fb8", "#ffd23f"])), 0.9 * s), 0, 1.7 * s, 0));
  g.position.set(rand(-26, 26), rand(-2.6, -1.2), rand(-26, -15));
  scene.add(g);
}
const sunBall = at(part(GEO.ball, world(new T.MeshBasicMaterial({ color: "#fff" }), "#ffe14a"), 2.4), -15, 17, -40);
scene.add(sunBall);

// Радуга: семь дуг, загораются по одной
const arcs = [];
for (let i = 0; i < ARCS; i++) {
  const m = new T.MeshBasicMaterial({ color: GREY.clone(), transparent: true, opacity: 0.55 });
  const a = new T.Mesh(new T.TorusGeometry(17 - i * 1.05, 0.5, 8, 56, Math.PI), m);
  a.position.set(0, -2.5, -33);
  scene.add(a);
  arcs.push({ mesh: a, mat: m, color: new T.Color(PAINTS[i]), lit: 0 });
}

// ---------- Пушка ----------
const cannon = new T.Group();
cannon.position.set(0, -0.1, 4);
cannon.scale.setScalar(0.92);
const barrelPivot = new T.Group();
barrelPivot.position.y = 0.9;
const barrel = new T.Group();
const tankMat = mat(PAINTS[0], { roughness: 0.25, emissive: PAINTS[0], emissiveIntensity: 0.25 });
barrel.add(at(part(GEO.cyl, mat("#ffffff", { roughness: 0.35 }), 0.42, 2.2, 0.42), 0, 0, 1.1));
barrel.children[0].rotation.x = Math.PI / 2;
barrel.add(at(part(GEO.cyl, mat("#ff7fb0", { roughness: 0.35 }), 0.52, 0.35, 0.52), 0, 0, 2.1));
barrel.children[1].rotation.x = Math.PI / 2;
barrel.add(at(part(GEO.ball, tankMat, 0.62), 0, 0.55, -0.1));
barrelPivot.add(barrel);
cannon.add(barrelPivot, at(part(GEO.ball, mat("#6f6bff", { roughness: 0.4 }), 0.95, 0.8, 0.95), 0, 0.35, 0));
for (const s of [-1, 1]) {
  const w = at(part(GEO.cyl, mat("#3a2a6b"), 0.6, 0.3, 0.6), s * 1.0, 0.1, 0);
  w.rotation.z = Math.PI / 2;
  cannon.add(w);
}
scene.add(cannon);
const aim = V(0, 6, -14);
let recoil = 0;
let paint = 0;

// ---------- Хмурые тучки ----------
const glooms = [];
function makeGloom(scale = 1) {
  const g = new T.Group(),
    body = mat(GREY.clone(), { roughness: 0.9 });
  for (const [x, y, z, s] of [[0, 0, 0, 0.85], [0.75, -0.1, 0, 0.6], [-0.75, -0.12, 0, 0.62], [0.3, 0.45, -0.05, 0.6], [-0.35, 0.4, 0, 0.55]]) g.add(at(part(GEO.ball, body, s, s * 0.85, s * 0.8), x, y, z));
  const face = new T.Group();
  face.position.z = 0.72;
  const dark = new T.MeshBasicMaterial({ color: "#2a2438" });
  face.add(at(part(GEO.ball, dark, 0.07), -0.26, 0.08, 0), at(part(GEO.ball, dark, 0.07), 0.26, 0.08, 0));
  const mouth = new T.Mesh(GEO.frown, dark);
  mouth.position.set(0, -0.3, 0);
  face.add(mouth);
  const cheeks = [-1, 1].map((s) => {
    const c = at(part(GEO.ball, new T.MeshBasicMaterial({ color: "#ff9fb8", transparent: true, opacity: 0 }), 0.11, 0.07, 0.03), s * 0.45, -0.12, 0);
    face.add(c);
    return c;
  });
  g.add(face);
  g.scale.setScalar(scale);
  return { g, body, mouth, cheeks, scale };
}
let W = 14; // полуширина неба на глубине, где летают тучки
function spawnGloom() {
  const side = Math.random() < 0.5 ? -1 : 1,
    z = rand(-16, -5),
    k = (12 - z) / 26; // дальше — шире обзор
  const m = makeGloom(rand(1.2, 1.6));
  const o = {
    ...m,
    pos: V(side * (W * k + 3), rand(3.5, 10.5), z),
    vx: -side * (rand(1.6, 2.8) + day * 0.22),
    phase: rand(0, TAU),
    state: "sad",
    t: 0,
    hp: 1,
    boss: false,
    reach: W * k + 4,
  };
  m.g.position.copy(o.pos);
  scene.add(m.g);
  glooms.push(o);
}
function spawnBoss() {
  const m = makeGloom(3.4);
  const o = { ...m, pos: V(0, 22, -15), vx: 1.1, phase: 0, state: "sad", t: 0, hp: 10, boss: true, reach: 8 };
  m.g.position.copy(o.pos);
  scene.add(m.g);
  glooms.push(o);
  Sound.boss();
}

// ---------- Золотая звезда: тройной выстрел ----------
const starShape = new T.Shape();
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * TAU + Math.PI / 2,
    r = i % 2 ? 0.42 : 1;
  starShape[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
}
const star = new T.Mesh(new T.ExtrudeGeometry(starShape, { depth: 0.3, bevelEnabled: false }), new T.MeshStandardMaterial({ color: "#ffd23f", emissive: "#ffb000", emissiveIntensity: 0.6, roughness: 0.3 }));
star.visible = false;
scene.add(star);
let starNext = 9,
  starDir = 1,
  tripleUntil = 0;

// ---------- Шарики краски и брызги ----------
const shots = [];
const SPARKS = 220;
const sparkMesh = new T.InstancedMesh(GEO.low, new T.MeshBasicMaterial(), SPARKS);
sparkMesh.frustumCulled = false;
scene.add(sparkMesh);
const sparks = Array.from({ length: SPARKS }, () => ({ p: V(), v: V(), life: 0, max: 1, s: 0.1 }));
let sparkNext = 0;
const dummy = new T.Object3D(),
  tint = new T.Color();
function burst(p, colors, count, speed, size = 0.16) {
  for (let i = 0; i < count; i++) {
    const s = sparks[sparkNext];
    sparkMesh.setColorAt(sparkNext, tint.set(pick(colors)));
    sparkNext = (sparkNext + 1) % SPARKS;
    s.p.copy(p);
    s.v.set(rand(-1, 1), rand(-0.6, 1.2), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
    s.life = s.max = rand(0.5, 1.1);
    s.s = size * rand(0.6, 1.3);
  }
  sparkMesh.instanceColor.needsUpdate = true;
}

const ray = new T.Raycaster(),
  ndc = new T.Vector2(),
  tmp = V();
function fireAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // щедрый прицел: берём тучку (или звезду), ближайшую к лучу пальца
  let target = null,
    best = Infinity;
  for (const g of glooms) {
    if (g.state !== "sad") continue;
    const d = Math.sqrt(ray.ray.distanceSqToPoint(g.pos)) / (g.scale * 1.9);
    if (d < 1 && d < best) (best = d), (target = g);
  }
  if (!target && star.visible && Math.sqrt(ray.ray.distanceSqToPoint(star.position)) < 2.4) target = "star";
  const point = target === "star" ? star.position.clone() : target ? target.pos.clone() : ray.ray.at(24, V());
  aim.copy(point);
  const n = performance.now() < tripleUntil ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const color = PAINTS[paint];
    const mesh = part(GEO.ball, new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.3 }), 0.3);
    mesh.position.copy(cannon.position).add(V(0, 0.9, 0)).add(tmp.copy(point).sub(cannon.position).normalize().multiplyScalar(2.4));
    scene.add(mesh);
    // лишние шарики тройного выстрела летят в соседние тучки
    let t = target;
    if (i > 0) t = glooms.filter((g) => g.state === "sad" && g !== target && !shots.some((s) => s.target === g))[i - 1] || null;
    shots.push({ mesh, target: t, point: i === 0 ? point : point.clone().add(V((i === 1 ? -1 : 1) * 4, rand(-1, 2), 0)), color, life: 0 });
    paint = (paint + 1) % PAINTS.length;
  }
  tankMat.color.set(PAINTS[paint]);
  tankMat.emissive.set(PAINTS[paint]);
  recoil = 1;
  Sound.shoot();
  el("hand").hidden = true;
}

// ---------- Ход игры ----------
let day = 0,
  rainbows = 0,
  arc = 0, // сколько дуг уже горит
  painted = 0, // раскрашено тучек для текущей дуги
  bossOut = false,
  party = 0, // праздник после победы, секунд осталось
  spawnIn = 0.5;
const need = () => Math.min(10, 6 + day);

function save() {
  localStorage.setItem(SAVE, JSON.stringify({ day, rainbows }));
}
function lightArc() {
  arc++;
  painted = 0;
  Sound.arc();
  const a = arcs[arc - 1];
  burst(V(0, 14, -30), [PAINTS[arc - 1], "#ffffff"], 30, 9, 0.4);
  a.pop = 1;
  if (arc === ARCS) {
    // радуга собрана: праздник, потом новый серый день
    rainbows++;
    day++;
    el("stars-n").textContent = rainbows;
    party = 6;
    Sound.win();
    save();
  }
}
function onPainted(g, color) {
  g.state = "happy";
  g.t = 0;
  g.color = new T.Color(color);
  g.mouth.rotation.z = Math.PI;
  g.mouth.position.y = -0.14;
  Sound.hit();
  burst(g.pos, [color, "#ffffff", "#fff3a0"], g.boss ? 60 : 16, g.boss ? 10 : 5, g.boss ? 0.35 : 0.18);
  if (g.boss) {
    bossOut = false;
    lightArc();
  } else if (arc < ARCS - 1) {
    painted++;
    if (painted >= need()) lightArc();
  }
}
function hitGloom(g, color) {
  if (g.state !== "sad") return;
  g.hp--;
  g.shake = 1;
  if (g.hp <= 0) return onPainted(g, color);
  // Большая Хмурь раскрашивается по кусочку
  Sound.bossHit();
  burst(g.pos, [color, "#ffffff"], 14, 6, 0.25);
  g.body.color.lerp(tint.set(color), 0.12);
  g.g.scale.setScalar(g.scale * (0.86 + 0.14 * (g.hp / 10)));
}

// ---------- Палец: коснулся — выстрел, держишь — очередь ----------
let finger = null,
  auto = 0;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
  fireAt(e.clientX, e.clientY);
  auto = 0.24;
});
canvas.addEventListener("pointermove", (e) => {
  if (finger && e.pointerId === finger.id) (finger.x = e.clientX), (finger.y = e.clientY);
});
const lift = (e) => finger && e.pointerId === finger.id && (finger = null);
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);
el("sound").textContent = Sound.on ? "🔊" : "🔇";
el("sound").addEventListener("click", () => (el("sound").textContent = Sound.toggle() ? "🔊" : "🔇"));

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  // на узком экране камера смотрит шире, чтобы радуга и тучки помещались
  camera.fov = camera.aspect < 1 ? 78 : 55;
  camera.updateProjectionMatrix();
  W = Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 26;
}
addEventListener("resize", resize);

// ---------- Кадр ----------
let last = 0;
const look = V();
function frame(ms) {
  const dt = Math.min(0.05, (ms - last) / 1000 || 0);
  last = ms;
  const t = ms / 1000;

  // мир расцветает вместе с радугой
  const want = party > 0 ? 1 : (arc + (arc < ARCS - 1 ? painted / need() : 0)) / ARCS;
  colorness += (want - colorness) * Math.min(1, dt * 2);
  applyColorness();
  arcs.forEach((a, i) => {
    const k = i < arc ? 1 : i === arc && arc < ARCS - 1 ? (painted / need()) * 0.6 : 0;
    a.lit += (k - a.lit) * Math.min(1, dt * 4);
    a.mat.color.copy(GREY).lerp(a.color, a.lit);
    a.mat.opacity = 0.5 + a.lit * 0.5;
    a.pop = (a.pop || 0) * Math.pow(0.03, dt);
    a.mesh.scale.setScalar(1 + a.pop * 0.06 + (party > 0 && !calm ? Math.sin(t * 6 + i) * 0.012 : 0));
  });

  // праздник: салют, потом новый день
  if (party > 0) {
    party -= dt;
    if (Math.random() < dt * 5) burst(V(rand(-14, 14), rand(6, 16), rand(-26, -12)), [pick(PAINTS), pick(PAINTS), "#ffffff"], 26, 8, 0.3);
    if (party <= 0) {
      arc = 0;
      painted = 0;
    }
  }

  // новые тучки
  spawnIn -= dt;
  const sad = glooms.filter((g) => g.state === "sad" && !g.boss).length;
  if (party <= 0 && spawnIn <= 0 && sad < (bossOut ? 3 : 6)) {
    spawnGloom();
    spawnIn = rand(0.7, 1.4);
  }
  if (party <= 0 && arc === ARCS - 1 && !bossOut && !glooms.some((g) => g.boss)) {
    bossOut = true;
    spawnBoss();
  }

  for (let i = glooms.length - 1; i >= 0; i--) {
    const g = glooms[i];
    g.t += dt;
    g.shake = (g.shake || 0) * Math.pow(0.01, dt);
    if (g.state === "sad") {
      if (g.boss) {
        // Большая Хмурь спускается и качается посреди неба
        g.pos.y += (9 - g.pos.y) * Math.min(1, dt * 0.8);
        g.pos.x = Math.sin(t * 0.5) * 6;
      } else {
        g.pos.x += g.vx * dt;
        if (Math.abs(g.pos.x) > g.reach && Math.sign(g.pos.x) === Math.sign(g.vx)) {
          scene.remove(g.g);
          glooms.splice(i, 1);
          continue;
        }
      }
      g.g.position.copy(g.pos);
      g.g.position.y += calm ? 0 : Math.sin(t * 1.6 + g.phase) * 0.35;
      g.g.position.x += Math.sin(t * 40) * 0.25 * g.shake;
      g.g.rotation.z = Math.sin(t * 1.1 + g.phase) * 0.06;
    } else {
      // раскрашенная: вспыхивает цветом, улыбается и весело улетает вверх
      const k = Math.min(1, g.t / 0.25);
      g.body.color.lerp(g.color, k);
      g.cheeks.forEach((c) => (c.material.opacity = k));
      const pop = 1 + Math.sin(Math.min(1, g.t / 0.35) * Math.PI) * 0.35;
      g.pos.y += dt * (1.5 + g.t * 3);
      g.g.position.copy(g.pos);
      g.g.rotation.z = calm ? 0 : Math.sin(g.t * 9) * 0.35;
      const fade = clamp((g.boss ? 3 : 2) - g.t, 0, 1);
      g.g.scale.setScalar(Math.max(0.001, g.scale * pop * fade));
      if (Math.random() < dt * 10) burst(g.pos, [g.color.getStyle(), "#ffffff"], 1, 2, 0.12);
      if (fade <= 0) {
        scene.remove(g.g);
        glooms.splice(i, 1);
      }
    }
  }

  // звезда пролетает раз в какое-то время
  starNext -= dt;
  if (!star.visible && starNext <= 0 && party <= 0) {
    star.visible = true;
    starDir = Math.random() < 0.5 ? -1 : 1;
    star.position.set(-starDir * (W * 0.8), rand(8, 11), -10);
  }
  if (star.visible) {
    star.position.x += starDir * 7 * dt;
    star.position.y += Math.sin(t * 3) * dt * 1.5;
    star.rotation.z = t * 3;
    star.rotation.y = Math.sin(t * 2) * 0.5;
    if (Math.abs(star.position.x) > W) (star.visible = false), (starNext = rand(12, 20));
  }
  el("power").hidden = ms > tripleUntil;

  // шарики краски: летят к своей тучке и не промахиваются
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.life += dt;
    const goal = s.target === "star" ? star.position : s.target && s.target.state === "sad" ? s.target.pos : s.point;
    tmp.copy(goal).sub(s.mesh.position);
    const dist = tmp.length(),
      step = 46 * dt;
    const r = s.target === "star" ? 1.2 : s.target && s.target !== "star" ? s.target.scale * 0.9 : 0.5;
    if (dist < step + r || s.life > 2) {
      if (s.target === "star" && star.visible) {
        star.visible = false;
        starNext = rand(14, 22);
        tripleUntil = ms + 7000;
        Sound.star();
        burst(star.position, ["#ffd23f", "#ffffff", "#ff9a3c"], 40, 9, 0.25);
      } else if (s.target && s.target !== "star" && s.target.state === "sad") hitGloom(s.target, s.color);
      else {
        burst(s.mesh.position, [s.color], 8, 4, 0.2);
        Sound.miss();
      }
      scene.remove(s.mesh);
      shots.splice(i, 1);
      continue;
    }
    s.mesh.position.addScaledVector(tmp.normalize(), step);
    s.mesh.scale.setScalar(0.3 * (1 + Math.sin(s.life * 40) * 0.12));
  }

  // держишь палец — очередь
  if (finger) {
    auto -= dt;
    if (auto <= 0) {
      fireAt(finger.x, finger.y);
      auto = 0.2;
    }
  }

  // пушка поворачивается к цели и отдаёт назад при выстреле
  look.lerp(aim, Math.min(1, dt * 14));
  barrelPivot.lookAt(look);
  recoil *= Math.pow(0.002, dt);
  barrel.position.z = -recoil * 0.45;
  cannon.scale.setScalar(0.92 + (ms < tripleUntil && !calm ? Math.sin(t * 14) * 0.03 : 0));

  sparks.forEach((s, i) => {
    if (s.life > 0) {
      s.life -= dt;
      s.v.y -= 9 * dt;
      s.p.addScaledVector(s.v, dt);
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

try {
  const d = JSON.parse(localStorage.getItem(SAVE) || "null");
  day = d?.day || 0;
  rainbows = d?.rainbows || 0;
} catch {}
el("stars-n").textContent = rainbows;
look.copy(aim);
resize();
applyColorness();
requestAnimationFrame(frame);
// для проверок из консоли и тестов
window.raduga = {
  state: () => ({ day, rainbows, arc, painted, need: need(), glooms: glooms.length, sad: glooms.filter((g) => g.state === "sad").length, boss: glooms.some((g) => g.boss), party, triple: performance.now() < tripleUntil }),
  // где на экране сейчас хмурые тучки (и звезда) — чтобы робот мог в них попасть
  targets: () =>
    glooms
      .filter((g) => g.state === "sad")
      .map((g) => {
        const p = g.g.position.clone().project(camera);
        return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, boss: g.boss };
      })
      .concat(star.visible ? [(() => { const p = star.position.clone().project(camera); return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, star: true }; })()] : []),
};
