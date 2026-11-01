// Ход стройки: палец ведёт груз, кран следует за ним, отпустил — этаж опускается на дом.
// Проиграть нельзя и читать ничего не нужно: сорвавшийся этаж просто падает, кран несёт следующий
import * as T from "../vendor/three/three.module.min.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";
import { Post } from "./post.js";
import { Floors, MODULES, FLOOR_IDS, ROOF_IDS, FLOOR_W, FLOOR_H } from "./floors.js";
import { Crane } from "./crane.js";
import { City, PLOT_STEP, PLOTS } from "./city.js";
import { Fx } from "./fx.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const FOV = 38;
const TAN = Math.tan(T.MathUtils.degToRad(FOV / 2));
const PAD_TOP = 0.5;
// Насколько можно промахнуться: ближе PERFECT этаж сам ложится ровно, дальше STAYS срывается
const PERFECT = FLOOR_W * 0.25;
const STAYS = FLOOR_W * 0.62;
const REACH = FLOOR_W * 1.45;
const HOVER = 7;
const ROPE = 2.4;
const HANG = { spire: 22.5, dome: 15, helipad: 2.4, pool: 6 };
const FALL_COLORS = {
  glass: ["#6fc0f0", "#cfd5dc", "#3c4754"],
  brick: ["#ac4832", "#e9e1d4", "#88c7e8"],
  garden: ["#f4f5f1", "#4cbb4a", "#8fd5e0"],
  classic: ["#ead9b8", "#fff3da", "#3f6d8c"],
  rainbow: ["#ff5d7e", "#ffd23f", "#39c3f0", "#fbfbff"],
  clock: ["#b9c0c9", "#fff6dc", "#d9a93a"],
  neon: ["#14142a", "#ff4fb8", "#33e0ff"],
  gold: ["#ffc94f", "#ffb44d", "#2a1d0a"],
  aqua: ["#37b9ee", "#d8e2ea", "#ff6b8a"],
  spire: ["#c8d3de", "#7f8c9a"],
  dome: ["#ffc94f", "#f2eadb"],
  helipad: ["#6e7782", "#ffd23f"],
  pool: ["#efe4cf", "#38c6f4", "#4cbb4a"]
};
// Что можно встретить на этой высоте: появляется значок и маленькая награда
const MILESTONES = [
  { floors: 12, icon: "🐦" },
  { floors: 23, icon: "☁️" },
  { floors: 32, icon: "🎈" },
  { floors: 45, icon: "✈️" },
  { floors: 66, icon: "🛸" },
  { floors: 100, icon: "🌙" }
];

const save = { stars: 0, plot: 0, sound: true, towers: {}, learned: false };
try {
  const old = JSON.parse(localStorage.getItem("neboskreb_save") || "{}");
  Object.assign(save, old);
} catch (_) {}
function store() {
  try {
    localStorage.setItem("neboskreb_save", JSON.stringify(save));
  } catch (_) {}
}

const renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(FOV, 1, 1, 9000);
const floors = new Floors(scene);
const city = new City(renderer, scene, floors.shared);
const crane = new Crane(scene);
const fx = new Fx(scene);
const post = new Post(renderer);
post.extract.uniforms.uThreshold.value = 1.05;

// Метка под грузом: куда он ляжет. Зелёная, когда этаж встанет ровно
function markTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "#ffffff";
  g.lineWidth = 9;
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.beginPath();
  g.roundRect(8, 8, 112, 112, 12);
  g.fill();
  g.stroke();
  const t = new T.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
const markMat = new T.MeshBasicMaterial({ map: markTexture(), transparent: true, depthWrite: false, toneMapped: false, color: new T.Color(1, 1, 1) });
const mark = new T.Mesh(new T.PlaneGeometry(FLOOR_W, FLOOR_W).rotateX(-Math.PI / 2), markMat);
mark.renderOrder = 3;
mark.visible = false;
scene.add(mark);
const dropGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
const dropLine = new T.Line(dropGeo, new T.LineDashedMaterial({ color: "#ffffff", dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.85, toneMapped: false }));
dropLine.frustumCulled = false;
dropLine.visible = false;
scene.add(dropLine);

function makeHelicopter() {
  const paint = (g, hex) => {
    const c = new T.Color(hex);
    const out = g.index ? g.toNonIndexed() : g;
    out.deleteAttribute("uv");
    const a = new Float32Array(out.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
    out.setAttribute("color", new T.BufferAttribute(a, 3));
    return out;
  };
  const body = mergeGeometries([
    paint(new T.SphereGeometry(1.7, 16, 12).scale(1.5, 1, 1), "#e23b2e"),
    paint(new T.SphereGeometry(1.25, 14, 10).scale(1, 0.8, 0.9).translate(1.4, 0.2, 0), "#a9dcf3"),
    paint(new T.BoxGeometry(5.4, 0.42, 0.42).translate(-4, 0.5, 0), "#e23b2e"),
    paint(new T.BoxGeometry(1, 1.6, 0.14).translate(-6.6, 1.1, 0), "#ffd23f"),
    paint(new T.BoxGeometry(5, 0.14, 0.22).translate(0, -2, 1.15), "#30343a"),
    paint(new T.BoxGeometry(5, 0.14, 0.22).translate(0, -2, -1.15), "#30343a"),
    paint(new T.BoxGeometry(0.14, 0.9, 0.14).translate(1, -1.5, 1.05), "#30343a"),
    paint(new T.BoxGeometry(0.14, 0.9, 0.14).translate(-1, -1.5, 1.05), "#30343a"),
    paint(new T.BoxGeometry(0.14, 0.9, 0.14).translate(1, -1.5, -1.05), "#30343a"),
    paint(new T.BoxGeometry(0.14, 0.9, 0.14).translate(-1, -1.5, -1.05), "#30343a"),
    paint(new T.CylinderGeometry(0.16, 0.16, 0.8, 8).translate(0, 2, 0), "#30343a")
  ]);
  const mesh = new T.Mesh(body, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3 }));
  const rotor = new T.Mesh(new T.BoxGeometry(11, 0.07, 0.42), new T.MeshStandardMaterial({ color: "#2b2d31" }));
  rotor.position.y = 2.42;
  mesh.add(rotor);
  mesh.userData.rotor = rotor;
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}
const heli = makeHelicopter();
scene.add(heli);

const S = {
  mode: "aim",
  plot: 0,
  tower: null,
  load: null,
  kind: "floor",
  pickedFloor: "glass",
  pickedRoof: "spire",
  aimX: 0,
  aimZ: 0,
  timer: 0,
  hoverBase: 0,
  streak: 0,
  sway: { x: 0, z: 0, vx: 0, vz: 0 },
  shake: 0,
  time: 0,
  fallers: [],
  idle: 0,
  focus: new T.Vector3(0, 10, 0),
  camY: 12,
  camD: 50,
  camYaw: 0.52,
  camPitch: 0.24,
  finale: null,
  milestones: new Set(),
  roofOffered: false
};

const towers = {};

function plotX(i = S.plot) {
  return i * PLOT_STEP;
}

// Дома держатся на смещениях этажей относительно середины участка
function makeTower(plot, data) {
  const t = { plot, floors: [], top: PAD_TOP, roof: null };
  if (data) {
    data.floors.forEach(([id, x, z]) => addFloor(t, id, x, z));
    if (data.roof) {
      const last = t.floors.at(-1);
      addFloor(t, data.roof, last ? last.x : 0, last ? last.z : 0);
      t.roof = data.roof;
    }
  }
  return t;
}

function addFloor(t, id, x, z) {
  if (floors.full(id)) return null;
  const f = { id, x, z, y: t.top, h: MODULES[id].height, item: floors.add(id), squash: 0 };
  t.floors.push(f);
  t.top += f.h;
  floors.place(f.item, plotX(t.plot) + x, f.y, z);
  return f;
}

function removeTower(t) {
  t.floors.forEach((f) => floors.remove(f.item));
}

function storeTower(t) {
  const list = t.floors.filter((f) => !MODULES[f.id].roof).map((f) => [f.id, +f.x.toFixed(2), +f.z.toFixed(2)]);
  save.towers[t.plot] = { floors: list, roof: t.roof };
  save.plot = S.plot;
  store();
}

const unlocked = (id) => save.stars >= MODULES[id].at;

// ---------- интерфейс ----------
const thumbs = {};
function makeThumbnails() {
  const size = 170;
  const was = { fog: scene.fog };
  scene.fog = null;
  city.group.visible = false;
  city.sky.visible = false;
  [crane.root, crane.rope, crane.hook, ...crane.slings].forEach((o) => (o.visible = false));
  // На кнопках этаж светлее, чем в городе: без бликов неба и свечения он выглядел бы тёмным
  const envWas = scene.environmentIntensity;
  scene.environmentIntensity = envWas * 1.5;
  renderer.toneMappingExposure = city.exposure * 1.3;
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const cam = new T.PerspectiveCamera(30, 1, 1, 200);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(size * size * 4);
  for (const id of [...FLOOR_IDS, ...ROOF_IDS]) {
    floors.only(id);
    const item = floors.add(id);
    floors.place(item, 0, 0, 0);
    const h = HANG[id] || FLOOR_H;
    const reach = Math.max(FLOOR_W * 1.02, h * 1.05);
    cam.position.set(reach * 1.25, h * 0.6 + reach * 0.5, reach * 1.55);
    cam.lookAt(0, h / 2, 0);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, cam);
    // Пиксели читаются напрямую: отложенное копирование с холста WebGL в браузере может оказаться пустым
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx2d = c.getContext("2d");
    const image = ctx2d.createImageData(size, size);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = (size - 1 - y) * size * 4 + x * 4;
        const to = y * size * 4 + x * 4;
        const al = pixels[from + 3];
        const k = al ? 255 / al : 0;
        image.data[to] = pixels[from] * k;
        image.data[to + 1] = pixels[from + 1] * k;
        image.data[to + 2] = pixels[from + 2] * k;
        image.data[to + 3] = al;
      }
    }
    ctx2d.putImageData(image, 0, 0);
    thumbs[id] = c;
    floors.remove(item);
  }
  floors.only(null);
  scene.environmentIntensity = envWas;
  scene.fog = was.fog;
  city.group.visible = true;
  city.sky.visible = true;
  [crane.root, crane.rope, crane.hook, ...crane.slings].forEach((o) => (o.visible = true));
}

function chip(id) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.dataset.id = id;
  b.setAttribute("aria-label", id);
  const art = document.createElement("canvas");
  art.width = art.height = 170;
  art.getContext("2d").drawImage(thumbs[id], 0, 0);
  b.appendChild(art);
  const locked = !MODULES[id].roof && !unlocked(id);
  if (locked) {
    b.classList.add("locked");
    const tag = document.createElement("span");
    tag.className = "cost";
    tag.textContent = "⭐" + MODULES[id].at;
    b.appendChild(tag);
  }
  b.addEventListener("click", () => {
    Sound.unlock();
    S.idle = 0;
    if (!MODULES[id].roof && !unlocked(id)) {
      Sound.pop();
      b.classList.remove("nope");
      void b.offsetWidth;
      b.classList.add("nope");
      return;
    }
    Sound.tap();
    if (MODULES[id].roof) S.pickedRoof = id;
    else S.pickedFloor = id;
    syncTray();
    // Висящий груз сразу меняется на выбранный
    if (S.load && S.mode === "aim") swapLoad();
  });
  return b;
}

function buildTray() {
  const tray = $("tray");
  tray.replaceChildren(...(S.kind === "roof" ? ROOF_IDS : FLOOR_IDS).map(chip));
  syncTray();
  fitTray();
}

// Кнопки не влезают на узкий экран: тогда лента листается, а пока влезают, между ними можно вести груз
function fitTray() {
  const tray = $("tray");
  tray.style.pointerEvents = tray.scrollWidth > tray.clientWidth ? "auto" : "";
}

function syncTray() {
  const picked = S.kind === "roof" ? S.pickedRoof : S.pickedFloor;
  document.querySelectorAll(".chip").forEach((b) => b.classList.toggle("picked", b.dataset.id === picked));
}

function syncHud() {
  $("stars").textContent = "⭐ " + save.stars;
  const count = S.tower ? S.tower.floors.filter((f) => !MODULES[f.id].roof).length : 0;
  $("floors").textContent = "🏢 " + count;
  const can = S.kind === "floor" && count >= 5 && !S.finale;
  $("btn-roof").hidden = !can;
  $("btn-roof").classList.toggle("call", count >= 12 + S.plot * 3);
}

function toast(icon) {
  const el = $("toast");
  el.textContent = icon;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

// Звезда летит с места событий на счётчик
function award(n, world) {
  const before = save.stars;
  save.stars += n;
  store();
  const p = world.clone().project(camera);
  const box = $("stars").getBoundingClientRect();
  const x0 = (p.x * 0.5 + 0.5) * innerWidth;
  const y0 = (-p.y * 0.5 + 0.5) * innerHeight;
  for (let i = 0; i < Math.min(n, 6); i++) {
    const s = document.createElement("div");
    s.className = "fly";
    s.textContent = "⭐";
    s.style.left = x0 + "px";
    s.style.top = y0 + "px";
    document.body.appendChild(s);
    const dx = box.left + box.width * 0.3 - x0;
    const dy = box.top + box.height / 2 - y0;
    s.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.4)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.1}px), calc(-50% + ${dy * 0.1 - 60}px)) scale(1.5)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 1 }
      ],
      { duration: 650 + i * 90, easing: "cubic-bezier(.3,.1,.5,1)" }
    ).onfinish = () => s.remove();
  }
  // Хватило звёзд на новый вид этажа
  const fresh = FLOOR_IDS.filter((id) => MODULES[id].at > before && MODULES[id].at <= save.stars);
  if (fresh.length) {
    Sound.gift();
    S.pickedFloor = S.kind === "floor" ? fresh[0] : S.pickedFloor;
    if (S.kind === "floor") buildTray();
    const b = document.querySelector(`.chip[data-id="${fresh[0]}"]`);
    if (b) {
      b.classList.add("fresh");
      b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }
  syncHud();
}

// ---------- стройка ----------
const hookOf = (load, base) => base + load.hang + ROPE;

function topCenter() {
  const t = S.tower;
  const last = t.floors.at(-1);
  const sway = swayAt(t.floors.length, t.floors.length);
  return { x: plotX() + (last ? last.x : 0) + sway.x, z: (last ? last.z : 0) + sway.z };
}

// Высокий дом качается: верх сильнее низа
const swayOut = { x: 0, z: 0 };
function swayAt(i, n) {
  if (n < 2) {
    swayOut.x = swayOut.z = 0;
    return swayOut;
  }
  const f = Math.pow(i / n, 1.7);
  const a = Math.min(1.3, n * 0.035);
  const wind = Math.min(0.9, n * 0.014);
  swayOut.x = (S.sway.x * a + Math.sin(S.time * 0.72) * wind) * f;
  swayOut.z = (S.sway.z * a + Math.cos(S.time * 0.51) * wind * 0.6) * f;
  return swayOut;
}

function pickPoint() {
  const c = topCenter();
  return { x: c.x + FLOOR_W * 0.95, z: c.z + FLOOR_W * 0.42 };
}

// Самая большая высота: дальше кран предлагает только крышу
const MAX_FLOORS = 300;

function startFetch() {
  const count = S.tower.floors.length;
  if (S.kind === "floor" && (count >= MAX_FLOORS || floors.full(S.pickedFloor))) {
    S.kind = "roof";
    buildTray();
  }
  const id = S.kind === "roof" ? S.pickedRoof : S.pickedFloor;
  const item = floors.add(id);
  S.load = { id, item, h: MODULES[id].height, hang: HANG[id] || FLOOR_H, x: 0, y: 0, z: 0 };
  S.mode = "fetch";
  S.timer = 0;
  const top = S.tower.top;
  S.hoverBase = top + HOVER;
  S.fromBase = Math.max(PAD_TOP + 1, top - 16);
  const p = pickPoint();
  S.aimX = p.x;
  S.aimZ = p.z;
  crane.aim(S.aimX, S.aimZ);
}

function swapLoad() {
  const id = S.kind === "roof" ? S.pickedRoof : S.pickedFloor;
  if (S.load.id === id) return;
  floors.remove(S.load.item);
  S.load = { id, item: floors.add(id), h: MODULES[id].height, hang: HANG[id] || FLOOR_H, x: S.load.x, y: S.load.y, z: S.load.z };
  crane.hookY = hookOf(S.load, S.hoverBase);
  placeLoad();
  fx.sparkle(S.load.x, S.load.y + 2, S.load.z, FLOOR_W * 0.4, 0);
}

function placeLoad() {
  const L = S.load;
  floors.place(L.item, L.x, L.y, L.z, 0, 0, 0);
}

function beginDrop() {
  if (S.mode !== "aim") return;
  S.mode = "lower";
  S.timer = 0;
  S.dropFrom = S.load.y;
  save.learned = true;
  $("hand").hidden = true;
}

function landed() {
  const L = S.load;
  const t = S.tower;
  const c = topCenter();
  const dx = L.x - c.x;
  const dz = L.z - c.z;
  const off = Math.max(Math.abs(dx), Math.abs(dz));
  const roof = !!MODULES[L.id].roof;
  const perfectR = roof ? FLOOR_W * 0.45 : PERFECT;
  if (off > STAYS) return missed(dx, dz, off);
  const last = t.floors.at(-1);
  const exact = off <= perfectR;
  const x = (last ? last.x : 0) + (exact ? 0 : dx);
  const z = (last ? last.z : 0) + (exact ? 0 : dz);
  floors.remove(L.item);
  const f = addFloor(t, L.id, x, z);
  f.squash = 1;
  S.load = null;
  if (roof) t.roof = L.id;
  storeTower(t);
  const at = new T.Vector3(c.x + (exact ? 0 : dx), f.y, c.z + (exact ? 0 : dz));
  fx.landing(at.x, at.y, at.z, FLOOR_W / 2, exact ? 1 : 1.3);
  S.sway.vx += (exact ? 0.1 : dx * 0.1) * (Math.random() < 0.5 ? -1 : 1);
  S.sway.vz += (exact ? 0.06 : dz * 0.1);
  S.shake = Math.max(S.shake, exact ? 0.4 : 0.8);
  Sound.thud(exact ? 0.9 : 1);
  if (exact) {
    S.streak++;
    fx.sparkle(at.x, f.y, at.z, FLOOR_W * 0.55, S.streak);
    Sound.chime(S.streak - 1);
    award(S.streak % 5 === 0 ? 3 : 1, at.clone().setY(f.y + f.h));
  } else {
    S.streak = 0;
  }
  const count = t.floors.filter((q) => !MODULES[q.id].roof).length;
  for (const m of MILESTONES) {
    if (count >= m.floors && !S.milestones.has(m.floors)) {
      S.milestones.add(m.floors);
      toast(m.icon);
      Sound.gift();
      award(5, at.clone().setY(f.y + f.h + 3));
    }
  }
  syncHud();
  if (roof) return startFinale();
  S.mode = "settle";
  S.timer = 0;
  S.emptyHook = hookOf({ hang: FLOOR_H }, S.tower.top);
}

function missed(dx, dz, off) {
  const L = S.load;
  S.streak = 0;
  const away = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const tips = off < FLOOR_W * 1.02;
  S.fallers.push({
    id: L.id,
    item: L.item,
    x: L.x,
    y: L.y,
    z: L.z,
    vx: away[0] * (tips ? 6 : 2),
    vy: -3,
    vz: away[1] * (tips ? 6 : 2),
    rx: 0,
    rz: 0,
    wx: away[1] * (tips ? 2.4 : 0.8),
    wz: -away[0] * (tips ? 2.4 : 0.8)
  });
  S.load = null;
  Sound.whistle();
  S.mode = "settle";
  S.timer = 0;
  S.emptyHook = hookOf({ hang: FLOOR_H }, S.tower.top);
  S.shake = Math.max(S.shake, 0.3);
}

function updateFallers(dt) {
  S.fallers = S.fallers.filter((f) => {
    f.vy -= 34 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    f.rx += f.wx * dt;
    f.rz += f.wz * dt;
    if (f.y <= 0.3) {
      floors.remove(f.item);
      fx.debris(f.x, 0.5, f.z, FALL_COLORS[f.id] || FALL_COLORS.glass);
      const near = S.tower.top < 60;
      if (near) {
        Sound.crash();
        S.shake = Math.max(S.shake, 0.5);
      }
      return false;
    }
    floors.place(f.item, f.x, f.y, f.z, f.rx, 0, f.rz);
    return true;
  });
}

function askRoof() {
  S.kind = "roof";
  buildTray();
  syncHud();
  if (S.load && S.mode === "aim") swapLoad();
}

// ---------- финал: вечер, свет в окнах, салют ----------
function startFinale() {
  S.mode = "finale";
  S.finale = { t: 0, lastFire: 3.6, nextShown: false };
  $("tray").hidden = true;
  $("btn-roof").hidden = true;
  $("hand").hidden = true;
  mark.visible = false;
  dropLine.visible = false;
  Sound.fanfare();
  const t = S.tower;
  const c = new T.Vector3(plotX() + (t.floors.at(-1)?.x || 0), t.top + 2, t.floors.at(-1)?.z || 0);
  fx.confetti(c.x, c.y, c.z, 110);
  award(8, c);
  floors.shared.uSweep.value = 0;
  // Кран отворачивается, чтобы не загораживать дом
  crane.aim(plotX() - 44, -48);
  crane.hookY = crane.jibY - 6;
  if (t.roof === "helipad") {
    heli.visible = true;
    S.finale.heli = 0;
  }
}

function updateFinale(dt) {
  const F = S.finale;
  F.t += dt;
  const t = S.tower;
  city.setMood(2 * T.MathUtils.smoothstep(F.t, 0.5, 3.4));
  floors.shared.uSweep.value = T.MathUtils.smoothstep(F.t, 2.6, 5.4) * (t.top + 30);
  crane.step(dt, 0.2);
  if (F.t > F.lastFire) {
    F.lastFire = F.t + 0.45 + Math.random() * 0.6;
    fireworkNear(t);
  }
  if (!F.nextShown && F.t > 4.8) {
    F.nextShown = true;
    $("btn-next").hidden = false;
  }
  if (heli.visible) {
    const k = T.MathUtils.smoothstep(F.t, 1.2, 6.5);
    const last = t.floors.at(-1);
    const hx = plotX() + last.x;
    const hz = last.z;
    heli.position.set(hx + (1 - k) * 46, t.top + 2.4 + (1 - k) * 26 + Math.sin(F.t * 3) * 0.2 * (1 - k), hz + (1 - k) * 18);
    heli.rotation.y = 0.6 * (1 - k) + Math.PI;
    heli.userData.rotor.rotation.y = S.time * 34;
  }
}

function fireworkNear(t) {
  const k = S.camD / 75;
  const y = t.top * (0.55 + Math.random() * 0.7) + 18 * k;
  // Букеты раскрываются слева и справа от дома, за ним
  const side = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.85) * S.camD * TAN * camera.aspect * 0.8;
  const rx = Math.cos(S.camYaw);
  const rz = -Math.sin(S.camYaw);
  fx.firework(plotX() + rx * side - Math.sin(S.camYaw) * 10, y, rz * side - Math.cos(S.camYaw) * 10, k);
  Sound.firework();
}

function nextTower() {
  Sound.tap();
  $("fade").classList.add("on");
  setTimeout(() => {
    startPlot((S.plot + 1) % PLOTS);
    $("fade").classList.remove("on");
  }, 260);
}

function startPlot(plot) {
  S.plot = plot;
  S.finale = null;
  S.kind = "floor";
  S.streak = 0;
  S.milestones = new Set();
  S.fallers.forEach((f) => floors.remove(f.item));
  S.fallers = [];
  if (S.load) floors.remove(S.load.item);
  S.load = null;
  heli.visible = false;
  // На заново занятом участке старый дом разбирают
  if (towers[plot] && towers[plot].roof) {
    removeTower(towers[plot]);
    delete towers[plot];
    delete save.towers[plot];
  }
  towers[plot] = towers[plot] || makeTower(plot);
  S.tower = towers[plot];
  save.plot = plot;
  store();
  city.setMood(0);
  floors.shared.uSweep.value = 1e5;
  crane.setPlot(plotX(), 0);
  city.site.position.x = plotX();
  crane.jibY = Math.max(30, S.tower.top + 22);
  crane.hookY = S.tower.top + 10;
  S.sway = { x: 0, z: 0, vx: 0, vz: 0 };
  S.camYaw = 0.52;
  S.mode = "down";
  S.timer = 0.2;
  fx.clear();
  $("tray").hidden = false;
  $("btn-next").hidden = true;
  Music.setTrack(plot % Music.TRACKS.length);
  buildTray();
  syncHud();
  snapCamera();
}

// ---------- шаг времени ----------
function simStep(dt) {
  S.time += dt;
  floors.shared.uTime.value = S.time;
  // Качание дома затухает пружиной
  const w = 1.5;
  S.sway.vx += (-w * w * S.sway.x - 0.32 * S.sway.vx) * dt;
  S.sway.vz += (-w * w * S.sway.z - 0.32 * S.sway.vz) * dt;
  S.sway.x += S.sway.vx * dt;
  S.sway.z += S.sway.vz * dt;
  S.shake = Math.max(0, S.shake - dt * 2.6);
  updateFallers(dt);
  const t = S.tower;
  const wantJib = Math.max(30, t.top + HOVER + (S.load ? S.load.hang : FLOOR_H) + ROPE + 7);
  crane.jibY += (wantJib - crane.jibY) * (1 - Math.exp(-dt * 1.4));
  if (S.mode === "finale") {
    updateFinale(dt);
    return;
  }
  const c = topCenter();
  if (S.mode === "settle") {
    // Крюк отцепился и поднимается, тележка едет за следующим этажом
    S.timer += dt;
    crane.hookY += (S.emptyHook + 6 - crane.hookY) * (1 - Math.exp(-dt * 7));
    if (S.timer > 0.24) {
      const p = pickPoint();
      crane.aim(p.x, p.z);
    }
    if (S.timer > 0.55) {
      S.mode = "down";
      S.timer = 0.3;
    }
  } else if (S.mode === "down") {
    // Крюк быстро уходит вниз за край кадра
    const p = pickPoint();
    crane.aim(p.x, p.z);
    S.timer -= dt;
    crane.hookY += (Math.max(4, t.top - 18) - crane.hookY) * (1 - Math.exp(-dt * 11));
    if (S.timer <= 0) startFetch();
  } else if (S.mode === "fetch") {
    // Этаж поднимается снизу
    S.timer += dt / 0.72;
    const k = Math.min(1, S.timer);
    const e = 1 - (1 - k) * (1 - k);
    S.load.y = S.fromBase + (S.hoverBase - S.fromBase) * e;
    crane.hookY = S.load.y + S.load.hang + ROPE;
    const p = pickPoint();
    S.aimX = p.x;
    S.aimZ = p.z;
    crane.aim(p.x, p.z);
    if (k >= 1) {
      S.mode = "aim";
      S.idle = 0;
    }
  } else if (S.mode === "aim") {
    S.hoverBase = t.top + HOVER;
    S.load.y += (S.hoverBase - S.load.y) * (1 - Math.exp(-dt * 6));
    crane.hookY = S.load.y + S.load.hang + ROPE;
    crane.aim(S.aimX, S.aimZ);
    S.idle += dt;
  } else if (S.mode === "lower") {
    S.timer += dt / 0.46;
    const k = Math.min(1, S.timer);
    S.load.y = S.dropFrom + (t.top - S.dropFrom) * k * k;
    crane.hookY = S.load.y + S.load.hang + ROPE;
    crane.aim(S.aimX, S.aimZ);
  }
  crane.step(dt, S.mode === "lower" ? 0.3 : 1);
  if (S.load) {
    S.load.x = crane.pos.x;
    S.load.z = crane.pos.z;
    if (S.mode === "lower") {
      // Близкий этаж плавно подтягивается на место, как будто его поправили руками
      const dx = c.x - S.load.x;
      const dz = c.z - S.load.z;
      const roof = !!MODULES[S.load.id].roof;
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= (roof ? FLOOR_W * 0.45 : PERFECT)) {
        const pull = Math.min(1, S.timer) * 0.9;
        S.load.x += dx * pull;
        S.load.z += dz * pull;
      }
    }
    placeLoad();
  }
  if (S.mode === "lower" && S.timer >= 1) landed();
}

function placeTower() {
  const t = S.tower;
  const n = t.floors.length;
  const base = plotX(t.plot);
  for (let i = 0; i < n; i++) {
    const f = t.floors[i];
    const s = swayAt(i, n);
    let squash = 1;
    let drop = 0;
    if (f.squash > 0) {
      f.squash = Math.max(0, f.squash - 1 / 28);
      const q = f.squash;
      squash = 1 - 0.09 * q * Math.cos((1 - q) * 11);
      drop = -0.04 * q;
    }
    floors.place(f.item, base + f.x + s.x, f.y + drop, f.z + s.z, s.z * 0.012, 0, -s.x * 0.012, squash);
  }
}

// ---------- камера ----------
function cameraWanted() {
  const aspect = camera.aspect;
  const t = S.tower;
  if (S.finale) {
    const span = t.top * 1.18 + 34;
    const D = Math.max(span / (2 * TAN), 56 / (2 * TAN * aspect));
    return { fx: plotX(), fy: t.top * 0.52 + 2, fz: 0, D, pitch: 0.1, rate: 0.9 };
  }
  // В кадре верх дома, груз над ним и стрела крана
  const D = Math.max(46 / (2 * TAN), 62 / (2 * TAN * aspect));
  const pitch = 0.24 + Math.min(0.16, t.top * 0.0022);
  return { fx: plotX() + 3, fy: t.top + (innerHeight < 500 ? 3.5 : 6.5), fz: 0, D, pitch, rate: 2.2 };
}

function snapCamera() {
  const w = cameraWanted();
  S.focus.set(w.fx, w.fy, w.fz);
  S.camD = w.D;
  S.camPitch = w.pitch;
  applyCamera();
}

function applyCamera() {
  const cp = Math.cos(S.camPitch);
  camera.position.set(
    S.focus.x + Math.sin(S.camYaw) * cp * S.camD,
    S.focus.y + Math.sin(S.camPitch) * S.camD,
    S.focus.z + Math.cos(S.camYaw) * cp * S.camD
  );
  camera.lookAt(S.focus);
  if (S.shake > 0) {
    camera.rotateZ(Math.sin(S.time * 57) * S.shake * 0.006);
    camera.rotateX(Math.cos(S.time * 43) * S.shake * 0.005);
  }
  camera.updateMatrixWorld();
}

function updateCamera(dt) {
  const w = cameraWanted();
  const k = 1 - Math.exp(-dt * w.rate);
  S.focus.x += (w.fx - S.focus.x) * k;
  S.focus.y += (w.fy - S.focus.y) * k;
  S.focus.z += (w.fz - S.focus.z) * k;
  S.camD += (w.D - S.camD) * k;
  S.camPitch += (w.pitch - S.camPitch) * k;
  if (S.finale && !drag) S.camYaw += dt * 0.09;
  applyCamera();
}

// ---------- метка и подсказка ----------
const tmpV = new T.Vector3();
function updateGuides() {
  const aim = S.mode === "aim" && S.load;
  mark.visible = dropLine.visible = !!aim;
  const hand = $("hand");
  if (!aim) {
    hand.hidden = true;
    return;
  }
  const L = S.load;
  const c = topCenter();
  const off = Math.max(Math.abs(L.x - c.x), Math.abs(L.z - c.z));
  const roof = !!MODULES[L.id].roof;
  const good = off <= (roof ? FLOOR_W * 0.45 : PERFECT);
  mark.position.set(L.x, S.tower.top + 0.12, L.z);
  markMat.color.set(good ? "#39f07a" : off > STAYS ? "#ffb02e" : "#ffffff");
  markMat.opacity = good ? 0.95 : 0.7;
  const a = dropGeo.attributes.position;
  a.setXYZ(0, L.x, L.y, L.z);
  a.setXYZ(1, L.x, S.tower.top + 0.15, L.z);
  a.needsUpdate = true;
  dropLine.computeLineDistances();
  dropLine.material.color.copy(markMat.color);
  // Если ребёнок не знает, что делать, рука показывает движение от груза к дому
  const show = !drag && (!save.learned || S.idle > 7);
  hand.hidden = !show;
  if (show) {
    const k = (S.time * 0.55) % 1;
    const e = k < 0.75 ? k / 0.75 : 1;
    tmpV.set(L.x + (c.x - L.x) * e, L.y + 2, L.z + (c.z - L.z) * e).project(camera);
    hand.style.left = (tmpV.x * 0.5 + 0.5) * innerWidth + "px";
    hand.style.top = (-tmpV.y * 0.5 + 0.5) * innerHeight + "px";
    hand.style.opacity = k < 0.85 ? 1 : (1 - k) / 0.15;
  }
}

// ---------- управление ----------
let drag = null;
function moveAim(dx, dy) {
  const span = (2 * S.camD * TAN) / innerHeight;
  const rx = Math.cos(S.camYaw);
  const rz = -Math.sin(S.camYaw);
  const fx0 = -Math.sin(S.camYaw);
  const fz0 = -Math.cos(S.camYaw);
  S.aimX += (rx * dx - fx0 * dy * 1.7) * span;
  S.aimZ += (rz * dx - fz0 * dy * 1.7) * span;
  const c = topCenter();
  S.aimX = T.MathUtils.clamp(S.aimX, c.x - REACH, c.x + REACH);
  S.aimZ = T.MathUtils.clamp(S.aimZ, c.z - REACH, c.z + REACH);
}

canvas.addEventListener("pointerdown", (e) => {
  Sound.unlock();
  S.idle = 0;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {}
  if (S.finale) {
    // В финале касание запускает салют
    fireworkAt(e.clientX, e.clientY);
  }
});
window.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.moved += Math.hypot(dx, dy);
  S.idle = 0;
  if (S.finale) {
    S.camYaw -= dx * 0.005;
    return;
  }
  if (S.mode === "aim" || S.mode === "fetch") moveAim(dx, dy);
});
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = drag.moved;
  drag = null;
  if (cancel) return;
  // Простое касание без движения этаж не роняет: показываем, как его вести
  if (S.mode === "aim") {
    if (moved > 12) beginDrop();
    else S.idle = 8;
  }
}
window.addEventListener("pointerup", (e) => endDrag(e, false));
window.addEventListener("pointercancel", (e) => endDrag(e, true));
window.addEventListener("contextmenu", (e) => e.preventDefault());

function fireworkAt(x, y) {
  const p = tmpV.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).unproject(camera);
  const dir = p.sub(camera.position).normalize();
  const dist = S.camD * 0.92;
  fx.firework(camera.position.x + dir.x * dist, camera.position.y + dir.y * dist, camera.position.z + dir.z * dist, S.camD / 75);
  Sound.firework();
}

// Клавиатура для тех, кто играет на компьютере
window.addEventListener("keydown", (e) => {
  const arrows = { ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] };
  if (arrows[e.code]) {
    e.preventDefault();
    Sound.unlock();
    if (S.mode === "aim") moveAim(...arrows[e.code]);
  } else if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    Sound.unlock();
    if (S.mode === "aim") beginDrop();
  }
});

$("btn-roof").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  askRoof();
});
$("btn-next").addEventListener("click", nextTower);
function syncSound() {
  Sound.setOn(save.sound);
  $("btn-sound").textContent = save.sound ? "🔊" : "🔇";
  $("btn-sound").setAttribute("aria-label", save.sound ? "Выключить звук" : "Включить звук");
}
$("btn-sound").addEventListener("click", () => {
  Sound.unlock();
  save.sound = !save.sound;
  store();
  syncSound();
});

// ---------- размеры и качество ----------
let quality = 2;
const shadowSize = [1024, 1536, 2048];
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  const cap = [1, 1.5, 2][quality];
  const budget = [1.3e6, 2.2e6, 3.3e6][quality];
  const pr = Math.min(devicePixelRatio || 1, cap, Math.sqrt(budget / (w * h)));
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  post.setSize(Math.round(w * pr), Math.round(h * pr), [0, 2, 4][quality], quality >= 2 ? 4 : 3);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitTray();
  const size = shadowSize[quality];
  if (city.sun.shadow.mapSize.x !== size) {
    city.sun.shadow.mapSize.set(size, size);
    if (city.sun.shadow.map) {
      city.sun.shadow.map.dispose();
      city.sun.shadow.map = null;
    }
  }
}
window.addEventListener("resize", resize);

// Если планшет не успевает, упрощаем картинку, а не тормозим игру
let frames = 0;
let total = 0;
function adapt(ms) {
  if (ms > 200 || window.Neboskreb.lockQuality) return;
  total += ms;
  frames++;
  if (frames < 50) return;
  if (total / frames > 27 && quality > 0) {
    quality--;
    resize();
  }
  frames = total = 0;
}

// ---------- кадр ----------
let last = performance.now();
let accum = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) {
    last = now;
    return;
  }
  const ms = now - last;
  last = now;
  tick(Math.min(ms, 100) / 1000);
  adapt(ms);
}

function tick(dt) {
  accum += dt;
  const stepDt = 1 / 60;
  let steps = 0;
  while (accum >= stepDt && steps < 6) {
    simStep(stepDt);
    accum -= stepDt;
    steps++;
  }
  if (steps === 6) accum = 0;
  placeTower();
  updateCamera(dt);
  fx.update(dt);
  updateGuides();
  const anchors = S.load && S.mode !== "settle" ? loadAnchors() : null;
  crane.draw(anchors);
  crane.hook.visible = crane.rope.visible = true;
  city.update(dt, new T.Vector3(plotX(), S.tower.top, 0), camera);
  Sound.motor(crane.speed / 16);
  Sound.ambience(S.tower.top);
  Music.tick();
  draw();
}

const anchorV = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()];
function loadAnchors() {
  const L = S.load;
  const q = FLOOR_W * 0.38;
  const y = L.y + Math.min(L.hang, FLOOR_H + 0.2);
  anchorV[0].set(L.x - q, y, L.z - q);
  anchorV[1].set(L.x + q, y, L.z - q);
  anchorV[2].set(L.x + q, y, L.z + q);
  anchorV[3].set(L.x - q, y, L.z + q);
  return anchorV;
}

function draw() {
  post.final.uniforms.uExposure.value = city.exposure;
  post.final.uniforms.uBloom.value = city.bloom;
  if (post.enabled && quality > 0) post.render(scene, camera);
  else {
    renderer.toneMappingExposure = city.exposure;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
}

// ---------- запуск ----------
function boot() {
  makeThumbnails();
  // Уже построенные дома снова стоят на своих местах
  for (const [plot, data] of Object.entries(save.towers)) {
    towers[plot] = makeTower(+plot, data);
  }
  const unfinished = towers[save.plot] && !towers[save.plot].roof;
  const plot = unfinished ? save.plot : towers[save.plot] ? (save.plot + 1) % PLOTS : save.plot;
  resize();
  startPlot(plot);
  syncSound();
  $("load").hidden = true;
  window.Neboskreb.ready = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

window.Neboskreb = { S, save, floors, city, crane, fx, renderer, tick, draw, lockQuality: false, beginDrop, askRoof, startPlot, addFloor, storeTower, startFinale, moveAim, topCenter, setQuality: (q) => { quality = q; resize(); } };
boot();
