// Ход стройки: палец ведёт груз, кран следует за ним, отпустил — этаж опускается на дом.
// Проиграть нельзя и читать ничего не нужно: сорвавшийся этаж просто падает, кран несёт следующий.
// Готовые дома остаются навсегда: город растёт кварталами, и на него можно посмотреть с высоты
import * as T from "../vendor/three/three.module.min.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";
import { Post } from "./post.js";
import { Floors, MODULES, FLOOR_IDS, ROOF_IDS, FLOOR_W, FLOOR_H } from "./floors.js";
import { Crane } from "./crane.js";
import { City, PLOTS, DISTRICT, plotX as plotAt } from "./city.js";
import { Fx } from "./fx.js";
import { Life } from "./life.js";

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
// Необязательные заказы: открытка у свободного участка просит один вид этажа и одну крышу,
// всё остальное выбирает игрок. Выполнил заказ — к дому приезжают гости
const ORDERS = [
  { id: "hotel", title: "Отель у парка", icon: "🏨", floor: "garden", roof: "pool", car: "bus" },
  { id: "family", title: "Дом для семьи", icon: "🏠", floor: "brick", roof: "dome", car: "van" },
  { id: "office", title: "Новый офис", icon: "💼", floor: "glass", roof: "helipad", car: "taxi" },
  { id: "museum", title: "Музей", icon: "🏛️", floor: "classic", roof: "spire", car: "school" },
  { id: "kids", title: "Детский сад", icon: "🧸", floor: "rainbow", roof: "pool", car: "school" },
  { id: "station", title: "Вокзал", icon: "🚉", floor: "clock", roof: "spire", car: "bus" },
  { id: "cinema", title: "Кинотеатр", icon: "🎬", floor: "neon", roof: "dome", car: "taxi" },
  { id: "palace", title: "Золотой дворец", icon: "👑", floor: "gold", roof: "dome", car: "bus" },
  { id: "ocean", title: "Океанариум", icon: "🐠", floor: "aqua", roof: "pool", car: "school" }
];
const ORDER_BY_ID = Object.fromEntries(ORDERS.map((o) => [o.id, o]));
// Дальше этого расстояния готовые дома рисуются простой коробкой: их всё равно почти не видно
const NEAR = 640;
// Цвет простой коробки: примерно как у этажей, из которых дом собран
const FAR_COLORS = { glass: "#7fa9c9", brick: "#a85a45", garden: "#8fae8a", classic: "#d9c8a6", clock: "#aab2bb", neon: "#39396e", gold: "#b8923f", aqua: "#6fb7d2", rainbow: "#e0d6ea" };

const save = { stars: 0, plot: 0, sound: true, towers: {}, learned: false, opened: 1, done: [] };
try {
  const old = JSON.parse(localStorage.getItem("neboskreb_save") || "{}");
  Object.assign(save, old);
} catch (_) {}
// В старых сохранениях кварталов не было: считаем их по занятым участкам
for (const plot of Object.keys(save.towers)) save.opened = Math.max(save.opened, Math.floor(+plot / PLOTS) + 1);
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
const city = new City(renderer, scene, floors.shared, save.opened);
const crane = new Crane(scene);
const fx = new Fx(scene);
const life = new Life(scene, fx);
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

// Неподвижный силуэт этажа на его будущем месте: пунктир, а когда груз совпал с ним, сплошной контур
function outlineGeometry(dashes) {
  const parts = [];
  const h = FLOOR_W / 2;
  const t = 0.22;
  const edge = (ax, ay, az, bx, by, bz, n) => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const piece = (Math.hypot(dx, dy, dz) / n) * (dashes ? 0.58 : 1);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      parts.push(new T.BoxGeometry(dx ? piece : t, dy ? piece : t, dz ? piece : t).translate(ax + dx * k, ay + dy * k, az + dz * k));
    }
  };
  const along = dashes ? 7 : 1;
  const up = dashes ? 3 : 1;
  for (const y of [0, FLOOR_H]) {
    edge(-h, y, -h, h, y, -h, along);
    edge(-h, y, h, h, y, h, along);
    edge(-h, y, -h, -h, y, h, along);
    edge(h, y, -h, h, y, h, along);
  }
  for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) edge(x, 0, z, x, FLOOR_H, z, up);
  return mergeGeometries(parts);
}
const ghostMat = new T.MeshBasicMaterial({ color: "#1fd4ff", transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
const ghostFillMat = new T.MeshBasicMaterial({ color: "#1fd4ff", transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
const ghost = new T.Group();
const ghostDash = new T.Mesh(outlineGeometry(true), ghostMat);
const ghostLine = new T.Mesh(outlineGeometry(false), ghostMat);
const ghostFill = new T.Mesh(new T.PlaneGeometry(FLOOR_W, FLOOR_W).rotateX(-Math.PI / 2), ghostFillMat);
ghostFill.position.y = 0.05;
for (const m of [ghostDash, ghostLine, ghostFill]) {
  m.renderOrder = 3;
  ghost.add(m);
}
ghost.visible = false;
scene.add(ghost);

// На карте: свободный участок отмечен пунктирным квадратом с плюсом
function plotMarkTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,0.22)";
  g.beginPath();
  g.roundRect(14, 14, 228, 228, 26);
  g.fill();
  g.strokeStyle = "#ffffff";
  g.lineWidth = 12;
  g.setLineDash([30, 22]);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "#ffffff";
  g.fillRect(112, 62, 32, 132);
  g.fillRect(62, 112, 132, 32);
  const t = new T.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
const marks = new T.InstancedMesh(new T.PlaneGeometry(21, 21).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: plotMarkTexture(), transparent: true, depthWrite: false, toneMapped: false }), 128);
marks.frustumCulled = false;
marks.renderOrder = 3;
marks.visible = false;
marks.count = 0;
scene.add(marks);

const S = {
  mode: "aim",
  plot: 0,
  tower: null,
  load: null,
  kind: "floor",
  pickedFloor: "glass",
  pickedRoof: "dome",
  order: null,
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
  roofOffered: false,
  windK: 1,
  wasGood: false,
  snapAt: -9,
  mapX: 0,
  mapV: 0,
  opening: null,
  viewPlot: 0,
  viewY: 20,
  shotUntil: 0,
  fading: false
};

const towers = {};

function plotX(i = S.plot) {
  return plotAt(i);
}

const inCity = () => S.mode === "map" || S.mode === "view";
const building = () => !inCity() && S.mode !== "finale";
const floorCount = (t) => t.floors.filter((f) => !MODULES[f.id].roof).length;
const finishedCount = () => Object.values(save.towers).filter((d) => d.roof).length;

// Дома держатся на смещениях этажей относительно середины участка.
// Пока дом далеко, его этажей нет в сцене, а сам он описан только в сохранении
function makeTower(plot) {
  const data = save.towers[plot];
  const t = { plot, floors: [], top: PAD_TOP, roof: data ? data.roof : null, order: data ? data.order || null : null, on: false };
  if (data) t.top += data.floors.length * FLOOR_H + (data.roof ? MODULES[data.roof].height : 0);
  return t;
}

function wake(t) {
  t.on = true;
  t.floors = [];
  t.top = PAD_TOP;
  const data = save.towers[t.plot];
  if (data) {
    data.floors.forEach(([id, x, z]) => addFloor(t, id, x, z));
    if (data.roof) {
      const last = t.floors.at(-1);
      addFloor(t, data.roof, last ? last.x : 0, last ? last.z : 0);
      if (t !== S.tower || !S.finale) life.enter(t, plotX(t.plot), false);
    }
  }
}

function sleep(t) {
  t.on = false;
  life.leave(t);
  t.floors.forEach((f) => floors.remove(f.item));
  t.floors = [];
}

// Близкие дома целиком, далёкие коробками: так город может расти сколько угодно
let syncedAt = null;
function syncCity(cx, force) {
  if (!force && syncedAt !== null && Math.abs(cx - syncedAt) < 120) return;
  syncedAt = cx;
  let changed = false;
  for (const t of Object.values(towers)) {
    const near = t === S.tower || Math.abs(plotX(t.plot) - cx) < NEAR;
    if (near && !t.on) {
      wake(t);
      changed = true;
    } else if (!near && t.on) {
      sleep(t);
      changed = true;
    }
  }
  if (force || changed || Math.abs(cx - city.center) > 500) city.layout(cx, farTowers());
}

function farTowers() {
  const list = [];
  for (const t of Object.values(towers)) {
    if (t.on) continue;
    const data = save.towers[t.plot];
    const tally = {};
    let best = "glass";
    for (const [id] of data.floors) {
      tally[id] = (tally[id] || 0) + 1;
      if (tally[id] > (tally[best] || 0)) best = id;
    }
    list.push({ x: plotX(t.plot), h: t.top, color: new T.Color(FAR_COLORS[best]) });
  }
  return list;
}

function addFloor(t, id, x, z) {
  const f = { id, x, z, y: t.top, h: MODULES[id].height, item: floors.add(id), squash: 0 };
  t.floors.push(f);
  t.top += f.h;
  floors.place(f.item, plotX(t.plot) + x, f.y, z);
  return f;
}

function storeTower(t) {
  const list = t.floors.filter((f) => !MODULES[f.id].roof).map((f) => [f.id, +f.x.toFixed(2), +f.z.toFixed(2)]);
  save.towers[t.plot] = { floors: list, roof: t.roof, order: t.order };
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
    paintRoofButton();
    // Висящий груз сразу меняется на выбранный
    swapIfHanging();
  });
  // Отметка: этого этажа или этой крыши ждёт заказ
  if (S.order && (S.order.floor === id || S.order.roof === id)) {
    const need = document.createElement("span");
    need.className = "need";
    need.textContent = "✉️";
    b.appendChild(need);
  }
  return b;
}

// Первая кнопка среди крыш: передумал, дом ещё низковат
function moreChip() {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip more";
  b.dataset.id = "more";
  b.setAttribute("aria-label", "Ещё этаж");
  const art = document.createElement("canvas");
  art.width = art.height = 170;
  art.getContext("2d").drawImage(thumbs[S.pickedFloor], 0, 0);
  b.appendChild(art);
  const plus = document.createElement("span");
  plus.className = "plus";
  plus.textContent = "+";
  b.appendChild(plus);
  const tag = document.createElement("span");
  tag.className = "cost";
  tag.textContent = "Ещё этаж";
  b.appendChild(tag);
  b.addEventListener("click", () => {
    Sound.unlock();
    Sound.tap();
    S.idle = 0;
    S.kind = "floor";
    buildTray();
    syncHud();
    swapIfHanging();
  });
  return b;
}

function buildTray() {
  const tray = $("tray");
  const chips = (S.kind === "roof" ? ROOF_IDS : FLOOR_IDS).map(chip);
  if (S.kind === "roof" && floorCount(S.tower) < MAX_FLOORS) chips.unshift(moreChip());
  tray.replaceChildren(...chips);
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
  const t = S.mode === "view" ? towers[S.viewPlot] : S.tower;
  const count = t ? floorCount(t) : 0;
  $("floors").textContent = S.mode === "map" ? "🏙️ " + finishedCount() : "🏢 " + count;
  const can = S.kind === "floor" && count >= 5 && building();
  $("btn-roof").hidden = !can;
  $("btn-roof").classList.toggle("call", count >= 12 + Math.min(S.plot, 8) * 3);
  syncOrderCard();
  syncButtons();
}

// Вместо флага на кнопке картинка крыши: та, которую просит заказ, или последняя выбранная
function paintRoofButton() {
  const art = $("btn-roof").querySelector("canvas");
  const g = art.getContext("2d");
  g.clearRect(0, 0, 170, 170);
  g.drawImage(thumbs[S.order ? S.order.roof : S.pickedRoof], 0, 0);
}

// Кнопки меняются вместе с тем, что происходит на экране
function syncButtons() {
  const scene = (S.finale && S.finale.nextShown) || S.mode === "view";
  $("btn-next").hidden = !(scene || (S.mode === "map" && !S.opening));
  $("btn-city").hidden = !(scene || (building() && finishedCount() > 0));
  document.body.classList.toggle("scene", !!scene);
}

// Открытка заказа: название и две картинки. Подходит для кнопки на карте и для угла экрана
function fillCard(el, order) {
  const name = document.createElement("b");
  name.textContent = order.icon + " " + order.title;
  const row = document.createElement("span");
  row.className = "pics";
  for (const id of [order.floor, order.roof]) {
    const pic = document.createElement("span");
    pic.className = "pic";
    pic.dataset.id = id;
    const art = document.createElement("canvas");
    art.width = art.height = 170;
    art.getContext("2d").drawImage(thumbs[id], 0, 0);
    pic.appendChild(art);
    row.appendChild(pic);
  }
  el.replaceChildren(name, row);
}

function syncOrderCard() {
  const el = $("order");
  const t = S.mode === "view" ? towers[S.viewPlot] : S.tower;
  let order = null;
  if (S.mode === "view") order = t.order ? ORDER_BY_ID[t.order] : null;
  else if (S.finale) order = S.finale.order;
  else if (S.mode !== "map") order = S.order;
  el.hidden = !order;
  if (!order) return;
  const fresh = el.dataset.order !== order.id;
  if (fresh) {
    el.dataset.order = order.id;
    fillCard(el, order);
  }
  el.querySelectorAll(".pic").forEach((pic) => {
    const id = pic.dataset.id;
    const done = MODULES[id].roof ? t.roof === id : t.floors.some((f) => f.id === id);
    if (done && !fresh && !pic.classList.contains("ok") && building()) Sound.gift();
    pic.classList.toggle("ok", done);
  });
}

// Какая открытка лежит у какого свободного участка: каждый третий участок с заказом, остальные пустые
function assignOrders() {
  const taken = new Set(Object.values(towers).map((t) => t.order).filter(Boolean));
  const waiting = ORDERS.filter((o) => !save.done.includes(o.id) && !taken.has(o.id) && unlocked(o.floor));
  const out = new Map();
  for (let i = 0; i < save.opened * PLOTS; i++) {
    if (save.towers[i]) continue;
    if (towers[i] && towers[i].order) out.set(i, ORDER_BY_ID[towers[i].order]);
    else if (i % 3 === 1 && waiting.length) out.set(i, waiting.shift());
  }
  return out;
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
  const wind = Math.min(0.9, n * 0.014) * S.windK;
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
  if (S.kind === "floor" && floorCount(S.tower) >= MAX_FLOORS) {
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

function swapIfHanging() {
  if (S.load && (S.mode === "aim" || S.mode === "fetch")) swapLoad();
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
  // Подсказки нужны, пока не получилось в первый раз
  save.learned = true;
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
  if (S.order) S.pickedRoof = S.order.roof;
  buildTray();
  syncHud();
  swapIfHanging();
}

// ---------- финал: вечер, свет в окнах, салют ----------
function startFinale() {
  S.mode = "finale";
  S.finale = { t: 0, lastFire: 3.6, nextShown: false, opened: false, order: null, shot: false, visited: false };
  $("tray").hidden = true;
  $("btn-roof").hidden = true;
  $("hand").hidden = true;
  $("hint").hidden = true;
  mark.visible = false;
  dropLine.visible = false;
  ghost.visible = false;
  Sound.fanfare();
  const t = S.tower;
  const c = new T.Vector3(plotX() + (t.floors.at(-1)?.x || 0), t.top + 2, t.floors.at(-1)?.z || 0);
  fx.confetti(c.x, c.y, c.z, 110);
  // Заказ выполнен, только если в доме есть нужный этаж и нужная крыша. Нет — ничего страшного, открытка подождёт
  const o = S.order;
  const done = o && t.roof === o.roof && t.floors.some((f) => f.id === o.floor);
  t.order = done ? o.id : null;
  if (done) {
    S.finale.order = o;
    if (!save.done.includes(o.id)) save.done.push(o.id);
  }
  storeTower(t);
  award(done ? 18 : 8, c);
  floors.shared.uSweep.value = 0;
  // Кран отворачивается, чтобы не загораживать дом
  crane.aim(plotX() - 44, -48);
  crane.hookY = crane.jibY - 6;
  if (t.roof === "helipad") life.heli.visible = true;
  syncHud();
}

// Забор и бытовка исчезают в облаке пыли, у дома появляется вход
function openHouse(t) {
  const x0 = plotX(t.plot);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    fx.puff(x0 + Math.cos(a) * 15, 1 + Math.random() * 1.5, Math.sin(a) * 15, Math.cos(a) * 5, 1, Math.sin(a) * 5, [0.74, 0.7, 0.64], 7 + Math.random() * 5, 0.9 + Math.random() * 0.5);
  }
  for (let i = 0; i < 12; i++) fx.puff(x0 - 20 + Math.random() * 12, 1.5, -26 + Math.random() * 24, 0, 1, 0, [0.74, 0.7, 0.64], 6 + Math.random() * 4, 0.9);
  city.site.visible = false;
  life.enter(t, x0, true);
  Sound.pop();
}

function updateFinale(dt) {
  const F = S.finale;
  F.t += dt;
  const t = S.tower;
  city.setMood(2 * T.MathUtils.smoothstep(F.t, 0.5, 3.4));
  floors.shared.uSweep.value = T.MathUtils.smoothstep(F.t, 2.6, 5.4) * (t.top + 30);
  crane.step(dt, 0.2);
  if (!F.opened && F.t > 1.4) {
    F.opened = true;
    openHouse(t);
  }
  if (F.order && !F.visited && F.t > 2.6) {
    F.visited = true;
    life.visit(t, F.order.car);
  }
  // Гостей показываем вблизи, а потом камера снова отъезжает к дому и салюту
  F.shot = !!F.order && F.t > 4.2 && F.t < 13;
  if (F.t > F.lastFire) {
    F.lastFire = F.t + 0.45 + Math.random() * 0.6;
    fireworkNear(t);
  }
  if (!F.nextShown && F.t > 4.8) {
    F.nextShown = true;
    syncButtons();
  }
  if (life.heli.visible) {
    const k = T.MathUtils.smoothstep(F.t, 1.2, 6.5);
    const last = t.floors.at(-1);
    const hx = plotX() + last.x;
    const hz = last.z;
    life.heli.position.set(hx + (1 - k) * 46, t.top + 2.15 + (1 - k) * 26 + Math.sin(F.t * 3) * 0.2 * (1 - k), hz + (1 - k) * 18);
    life.heli.rotation.y = 0.6 * (1 - k) + Math.PI;
    life.heli.children[0].rotation.y = S.time * 34;
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

function fadeTo(fn) {
  if (S.fading) return;
  S.fading = true;
  $("fade").classList.add("on");
  setTimeout(() => {
    fn();
    $("fade").classList.remove("on");
    S.fading = false;
  }, 260);
}

function nextFree() {
  for (let i = 0; i < save.opened * PLOTS; i++) if (!save.towers[i]) return i;
  return null;
}

// Кнопка ▶: вернуться к недостроенному дому или начать следующий. Квартал кончился — открывается соседний
function buildNext() {
  if (S.opening || S.fading) return;
  Sound.unlock();
  Sound.tap();
  const plot = S.tower && !S.tower.roof ? S.plot : nextFree();
  if (plot === null) openDistrict();
  else fadeTo(() => startPlot(plot));
}

function startPlot(plot) {
  if (S.finale) life.park(S.tower);
  const old = S.tower;
  // Участок, на который так и не поставили этажа, снова свободен
  if (old && old.plot !== plot && !save.towers[old.plot]) {
    old.on = false;
    delete towers[old.plot];
  }
  S.plot = plot;
  S.finale = null;
  S.kind = "floor";
  S.streak = 0;
  S.fallers.forEach((f) => floors.remove(f.item));
  S.fallers = [];
  if (S.load) floors.remove(S.load.item);
  S.load = null;
  life.heli.visible = false;
  towers[plot] = towers[plot] || makeTower(plot);
  const t = towers[plot];
  // Новый участок забирает свою открытку, недостроенный дом помнит свою
  if (!save.towers[plot] && !t.order) {
    const offer = assignOrders().get(plot);
    t.order = offer ? offer.id : null;
  }
  S.order = t.order ? ORDER_BY_ID[t.order] : null;
  S.tower = t;
  S.mode = "down";
  S.timer = 0.2;
  syncCity(plotX(plot), true);
  S.milestones = new Set(MILESTONES.filter((m) => floorCount(t) >= m.floors).map((m) => m.floors));
  save.plot = plot;
  store();
  if (S.order && !t.floors.length) S.pickedFloor = S.order.floor;
  city.setMood(0);
  city.setShadow(60);
  floors.shared.uSweep.value = 1e5;
  crane.setPlot(plotX(), 0);
  crane.shown = true;
  city.site.position.x = plotX();
  city.site.visible = true;
  crane.jibY = Math.max(30, t.top + 22);
  crane.hookY = t.top + 10;
  S.sway = { x: 0, z: 0, vx: 0, vz: 0 };
  S.windK = 1;
  S.camYaw = 0.52;
  fx.clear();
  clearPins();
  marks.visible = false;
  $("tray").hidden = false;
  Music.setTrack(plot % Music.TRACKS.length);
  buildTray();
  paintRoofButton();
  syncHud();
  snapCamera();
  // Новая открытка сначала показывается крупно, потом отъезжает в угол
  if (S.order && !t.floors.length) {
    const card = $("order");
    card.classList.add("intro");
    clearTimeout(S.introTimer);
    S.introTimer = setTimeout(() => card.classList.remove("intro"), 2400);
  }
}

// ---------- мой город ----------
// Метки над домами и открытки на участках живут поверх холста и следуют за камерой
const pins = [];
function clearPins() {
  pins.forEach((p) => p.el.remove());
  pins.length = 0;
}
function addPin(el, x, y, z) {
  $("pins").appendChild(el);
  pins.push({ el, x, y, z });
}
function updatePins() {
  for (const p of pins) {
    tmpV.set(p.x, p.y, p.z).project(camera);
    const on = tmpV.z < 1 && Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15;
    p.el.style.visibility = on ? "visible" : "hidden";
    if (on) p.el.style.transform = `translate(${((tmpV.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-tmpV.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  }
}

const markList = [];
function refreshMap() {
  clearPins();
  markList.length = 0;
  const offers = assignOrders();
  const next = S.tower && !S.tower.roof ? S.plot : nextFree();
  for (let i = 0; i < save.opened * PLOTS; i++) {
    const x = plotX(i);
    const data = save.towers[i];
    if (data) {
      const t = towers[i];
      const icon = !data.roof ? "🏗️" : data.order ? ORDER_BY_ID[data.order].icon : "";
      if (icon && t) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = icon;
        addPin(tag, x, t.top + 3, 0);
      }
      continue;
    }
    if (markList.length < marks.instanceMatrix.count) markList.push({ x, next: i === next });
    const offer = offers.get(i);
    if (offer) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "postcard pinned";
      card.setAttribute("aria-label", offer.title);
      fillCard(card, offer);
      card.addEventListener("click", () => chooseFromMap(i));
      addPin(card, x, 3, 2);
    }
  }
  marks.visible = S.mode === "map";
}

function updateMarks() {
  if (!marks.visible) return;
  const m = tmpMatrix;
  let n = 0;
  for (const k of markList) {
    const s = k.next ? 1 + Math.sin(S.time * 4) * 0.07 : 1;
    m.makeScale(s, 1, s);
    m.setPosition(k.x, 0.62, 0);
    marks.setMatrixAt(n++, m);
  }
  marks.count = n;
  marks.instanceMatrix.needsUpdate = true;
}

// Широкий экран видит весь квартал, узкий несколько участков: остальное листается пальцем
function mapWidth() {
  return T.MathUtils.clamp(camera.aspect * 300, 170, 470);
}

// Весь город сверху. Стройка замирает: висящий груз убран, недостроенный дом ждёт на своём месте
function openMap(plot) {
  if (S.mode === "map") return;
  const from = plot !== undefined ? plot : S.mode === "view" ? S.viewPlot : S.plot;
  if (S.finale) {
    life.park(S.tower);
    if (S.finale.visited && life.trip) life.endTrip();
  }
  if (S.load) floors.remove(S.load.item);
  S.load = null;
  S.finale = null;
  S.mode = "map";
  S.mapX = mapWidth() >= 400 ? Math.floor(from / PLOTS) * DISTRICT + 175 : plotX(from);
  S.mapV = 0;
  life.heli.visible = false;
  crane.shown = !S.tower.roof;
  crane.speed = 0;
  city.site.visible = !S.tower.roof;
  floors.shared.uSweep.value = 1e5;
  city.setShadow(340);
  $("tray").hidden = true;
  $("btn-roof").hidden = true;
  $("hand").hidden = true;
  $("hint").hidden = true;
  mark.visible = false;
  dropLine.visible = false;
  ghost.visible = false;
  syncCity(S.mapX);
  refreshMap();
  syncHud();
}

// Один дом вблизи: можно покрутить его и посмотреть, кто в нём живёт
function openView(plot) {
  S.mode = "view";
  S.viewPlot = plot;
  const t = towers[plot];
  syncCity(plotX(plot));
  S.viewY = t.top * 0.5;
  clearPins();
  marks.visible = false;
  city.setShadow(Math.max(70, t.top * 0.75));
  life.replay(t);
  S.shotUntil = 0;
  if (t.order) {
    life.visit(t, ORDER_BY_ID[t.order].car);
    S.shotUntil = S.time + 9.5;
  }
  syncHud();
}

function chooseFromMap(plot) {
  if (S.opening || S.fading) return;
  Sound.unlock();
  Sound.tap();
  fadeTo(() => startPlot(plot));
}

// Касание на карте: ближайший к пальцу дом или участок. Высокий дом можно нажать по всей его высоте
function mapTap(px, py) {
  if (S.opening || S.fading) return;
  let best = -1;
  let bestD = Infinity;
  const a = new T.Vector3();
  const b = new T.Vector3();
  const toPx = (v) => [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  for (let i = 0; i < save.opened * PLOTS; i++) {
    const x = plotX(i);
    const t = towers[i];
    a.set(x, 0, 0).project(camera);
    b.set(x, t ? Math.max(t.top, 8) : 1, 0).project(camera);
    const [ax, ay] = toPx(a);
    const [bx, by] = toPx(b);
    const dx = bx - ax;
    const dy = by - ay;
    const k = T.MathUtils.clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
    const d = Math.hypot(px - ax - dx * k, py - ay - dy * k);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  // Участок шириной в половину шага между домами: ошибиться соседом трудно
  a.set(plotX(0), 0, 0).project(camera);
  b.set(plotX(1), 0, 0).project(camera);
  const reach = Math.max(30, (Math.abs(b.x - a.x) * innerWidth) / 4);
  if (best < 0 || bestD > reach) return;
  if (save.towers[best] && save.towers[best].roof && towers[best]) {
    Sound.tap();
    openView(best);
  } else chooseFromMap(best);
}

// Кварталы кончились: камера едет к соседнему, старые дома уходят под землю, появляются новые участки
function openDistrict() {
  const k = save.opened;
  openMap(k * PLOTS);
  S.mapX = plotX(k * PLOTS) + 175;
  syncCity(S.mapX, true);
  S.opening = { t: 0, k, stage: 0 };
  syncButtons();
}

function stepOpening(dt) {
  const O = S.opening;
  O.t += dt;
  if (O.stage === 0 && O.t > 1.2) {
    O.stage = 1;
    Sound.rumble();
    const list = city.clearDistrict(O.k);
    for (let i = 0; i < list.length; i += Math.max(1, Math.floor(list.length / 70))) {
      const h = list[i];
      fx.puff(h.x, 2 + Math.random() * 6, h.z, (Math.random() - 0.5) * 8, 2, (Math.random() - 0.5) * 8, [0.74, 0.7, 0.64], 18 + Math.random() * 16, 1.3 + Math.random() * 0.8);
    }
  } else if (O.stage === 1 && O.t > 2.45) {
    save.opened = O.k + 1;
    city.opened = save.opened;
    store();
    S.opening = null;
    syncCity(S.mapX, true);
    refreshMap();
    fx.confetti(plotX(O.k * PLOTS) + 175, 40, 0, 160);
    Sound.fanfare();
    toast("🎉");
    syncHud();
  }
}

function stepCity(dt) {
  if (city.mood > 0) city.setMood(Math.max(0, city.mood - dt * 0.7));
  if (S.mode !== "map") return;
  if (S.mapV && !drag) {
    S.mapX += S.mapV * dt;
    S.focus.x += S.mapV * dt;
    S.mapV *= Math.exp(-dt * 3);
    if (Math.abs(S.mapV) < 3) S.mapV = 0;
  }
  const last = (save.opened + (S.opening ? 1 : 0)) * PLOTS - 1;
  const clamped = T.MathUtils.clamp(S.mapX, plotX(0) - 30, plotX(last) + 30);
  if (clamped !== S.mapX) {
    S.mapX = clamped;
    S.mapV = 0;
  }
  syncCity(S.mapX);
  if (S.opening) stepOpening(dt);
}

// ---------- шаг времени ----------
function simStep(dt) {
  S.time += dt;
  floors.shared.uTime.value = S.time;
  // Качание дома затухает пружиной
  const w = 1.5;
  // Достроенный дом быстро успокаивается и больше не качается: на нём теперь живут
  const still = S.mode === "finale" || inCity();
  const damp = still ? 2.4 : 0.32;
  S.windK += ((still ? 0 : 1) - S.windK) * (1 - Math.exp(-dt * 1.5));
  S.sway.vx += (-w * w * S.sway.x - damp * S.sway.vx) * dt;
  S.sway.vz += (-w * w * S.sway.z - damp * S.sway.vz) * dt;
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
  if (inCity()) {
    stepCity(dt);
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
  if (S.mode === "map") {
    return { fx: S.mapX, fy: 12, fz: 8, D: mapWidth() / (2 * TAN * aspect), pitch: 0.66, yaw: 0.2, rate: 2.2 };
  }
  if (S.mode === "view") {
    const v = towers[S.viewPlot];
    if (S.time < S.shotUntil) return guestShot(v, aspect);
    const span = v.top * 1.16 + 22;
    const D = T.MathUtils.clamp(Math.max(span / (2 * TAN), 46 / (2 * TAN * aspect)), 64, 200);
    // Вход остаётся над кнопками внизу, а высокий дом целиком не влезет: палец ведёт камеру вдоль него
    const lo = D * TAN * 0.55;
    S.viewY = T.MathUtils.clamp(S.viewY, lo, Math.max(lo, v.top + 5 - D * TAN * 0.78));
    return { fx: plotX(v.plot), fy: S.viewY, fz: 0, D, pitch: 0.13, rate: 2 };
  }
  if (S.finale) {
    if (S.finale.shot) return guestShot(t, aspect);
    const span = t.top * 1.18 + 34;
    const D = Math.max(span / (2 * TAN), 56 / (2 * TAN * aspect));
    return { fx: plotX(), fy: t.top * 0.52 + 2, fz: 0, D, pitch: 0.1, rate: 0.9 };
  }
  // В кадре верх дома, груз над ним и стрела крана
  const D = Math.max(46 / (2 * TAN), 62 / (2 * TAN * aspect));
  const pitch = 0.24 + Math.min(0.16, t.top * 0.0022);
  return { fx: plotX() + 3, fy: t.top + (innerHeight < 500 ? 3.5 : 6.5), fz: 0, D, pitch, rate: 2.2 };
}

// Вид на вход и улицу: сюда приезжают гости
function guestShot(t, aspect) {
  const rec = life.recs.get(t);
  const x = rec ? rec.door.x : plotX(t.plot);
  return { fx: x - 2, fy: 4, fz: 24, D: Math.max(62, 42 / (2 * TAN * aspect)), pitch: 0.26, yaw: 0.36, rate: 1.4 };
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
  if (w.yaw !== undefined) {
    const d = w.yaw - S.camYaw;
    S.camYaw += Math.atan2(Math.sin(d), Math.cos(d)) * k;
  } else if ((S.finale || S.mode === "view") && !drag) S.camYaw += dt * 0.09;
  applyCamera();
}

// ---------- метка и подсказка ----------
const tmpV = new T.Vector3();
const tmpMatrix = new T.Matrix4();
const tmpFocus = new T.Vector3();
function updateGuides() {
  const aim = S.mode === "aim" && S.load;
  mark.visible = dropLine.visible = !!aim;
  const hand = $("hand");
  const hint = $("hint");
  // Силуэт стоит на месте всё время, пока кран несёт этаж
  ghost.visible = !!S.load && (S.mode === "aim" || S.mode === "fetch" || S.mode === "lower");
  if (ghost.visible) {
    const c0 = topCenter();
    ghost.position.set(c0.x, S.tower.top + 0.04, c0.z);
  }
  if (!aim) {
    hand.hidden = true;
    hint.hidden = true;
    S.wasGood = false;
    if (ghost.visible) showGhost(false);
    return;
  }
  const L = S.load;
  const c = topCenter();
  const off = Math.max(Math.abs(L.x - c.x), Math.abs(L.z - c.z));
  const roof = !!MODULES[L.id].roof;
  const good = off <= (roof ? FLOOR_W * 0.45 : PERFECT);
  if (good && !S.wasGood) {
    S.snapAt = S.time;
    Sound.snap();
  }
  S.wasGood = good;
  showGhost(good);
  // Контуры смыкаются: пока груз над своим местом, метка стоит ровно на силуэте и коротко вздрагивает
  const pulse = 1 + Math.exp(-(S.time - S.snapAt) * 9) * 0.07;
  ghost.scale.set(good ? pulse : 1, roof ? 0.5 : 1, good ? pulse : 1);
  mark.position.set(good ? c.x : L.x, S.tower.top + 0.12, good ? c.z : L.z);
  mark.scale.setScalar(good ? pulse : 1);
  markMat.color.set(good ? "#39f07a" : off > STAYS ? "#ff9a2e" : "#ffd23f");
  markMat.opacity = good ? 0.95 : 0.8;
  const a = dropGeo.attributes.position;
  a.setXYZ(0, L.x, L.y, L.z);
  a.setXYZ(1, L.x, S.tower.top + 0.15, L.z);
  a.needsUpdate = true;
  dropLine.computeLineDistances();
  dropLine.material.color.copy(markMat.color);
  // Первый раз: когда всё сошлось, подсказка просит отпустить палец
  const hintOn = !!drag && good && !save.learned;
  hint.hidden = !hintOn;
  if (hintOn) {
    tmpV.set(L.x, L.y + L.hang + 3.5, L.z).project(camera);
    hint.style.left = (tmpV.x * 0.5 + 0.5) * innerWidth + "px";
    hint.style.top = Math.max(132, (-tmpV.y * 0.5 + 0.5) * innerHeight) + "px";
  }
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

function showGhost(good) {
  ghostDash.visible = !good;
  ghostLine.visible = good;
  ghostMat.color.set(good ? "#39f07a" : "#1fd4ff");
  ghostFillMat.color.copy(ghostMat.color);
  ghostFillMat.opacity = good ? 0.3 : 0.16;
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
  S.mapV = 0;
  S.shotUntil = 0;
  $("order").classList.remove("intro");
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, at: performance.now(), v: 0 };
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
  if (S.mode === "view") {
    S.camYaw -= dx * 0.005;
    S.viewY += (dy * 2 * S.camD * TAN) / innerHeight;
    return;
  }
  if (S.mode === "map") {
    // Город едет за пальцем без задержки, а отпущенный ещё немного катится
    const shift = -(dx * 2 * S.camD * TAN) / innerHeight / Math.cos(S.camYaw);
    S.mapX += shift;
    S.focus.x += shift;
    const now = performance.now();
    drag.v = (shift / Math.max(1, now - drag.at)) * 1000;
    drag.at = now;
    return;
  }
  if (S.mode === "aim" || S.mode === "fetch") moveAim(dx, dy);
});
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = drag.moved;
  const v = drag.v;
  const stale = performance.now() - drag.at > 90;
  drag = null;
  if (cancel) return;
  if (S.mode === "map") {
    if (moved <= 12) mapTap(e.clientX, e.clientY);
    else S.mapV = stale ? 0 : T.MathUtils.clamp(v, -900, 900);
    return;
  }
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
    if (S.mode === "map") S.mapX += arrows[e.code][0] * 3;
  } else if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    Sound.unlock();
    if (S.mode === "aim") beginDrop();
    else if (S.mode === "map" || S.mode === "view") buildNext();
  }
});

$("btn-roof").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  askRoof();
});
$("btn-next").addEventListener("click", buildNext);
$("btn-city").addEventListener("click", () => {
  if (S.opening || S.fading) return;
  Sound.unlock();
  Sound.tap();
  openMap();
});
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
  updateMarks();
  updatePins();
  life.update(dt, camera, floors.shared.uLight.value);
  const anchors = S.load && S.mode !== "settle" ? loadAnchors() : null;
  crane.draw(anchors);
  city.quiet = S.mode === "map";
  city.update(dt, cityFocus(), camera);
  Sound.motor(building() ? crane.speed / 16 : 0);
  Sound.ambience(S.mode === "map" ? 60 : S.tower.top);
  Music.tick();
  draw();
}

// Вокруг этой точки живёт город: летают птицы и считаются тени
function cityFocus() {
  if (S.mode === "map") return tmpFocus.set(S.mapX, 0, 0);
  if (S.mode === "view") return tmpFocus.set(plotX(S.viewPlot), S.viewY, 0);
  if (S.finale && S.finale.shot) return tmpFocus.set(plotX(), 6, 18);
  return tmpFocus.set(plotX(), S.tower.top, 0);
}

const anchorV = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()];
// Куда цепляются стропы: у этажа за углы крыши, у купола за край кольца, у остальных крыш за основание
const SLINGS = { spire: { y: 2.4, q: 5.4 }, dome: { y: 2, q: 6.2, round: true }, helipad: { y: 2.06, q: 5.3 }, pool: { y: 1, q: 6.4 } };
function loadAnchors() {
  const L = S.load;
  const s = SLINGS[L.id];
  const q = s ? s.q : FLOOR_W * 0.38;
  const y = L.y + (s ? s.y : FLOOR_H + 0.2);
  if (s && s.round) {
    anchorV[0].set(L.x - q, y, L.z);
    anchorV[1].set(L.x, y, L.z - q);
    anchorV[2].set(L.x + q, y, L.z);
    anchorV[3].set(L.x, y, L.z + q);
    return anchorV;
  }
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
  for (const plot of Object.keys(save.towers)) towers[plot] = makeTower(+plot);
  const unfinished = towers[save.plot] && !towers[save.plot].roof;
  let plot = unfinished ? save.plot : towers[save.plot] ? nextFree() : save.plot;
  // Квартал закончился ещё в прошлый раз: соседний просто уже открыт
  if (plot === null) {
    save.opened++;
    city.opened = save.opened;
    plot = nextFree();
  }
  resize();
  startPlot(plot);
  syncSound();
  $("load").hidden = true;
  window.Neboskreb.ready = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

window.Neboskreb = { S, save, towers, floors, city, crane, fx, life, ORDERS, renderer, camera, tick, draw, lockQuality: false, beginDrop, askRoof, startPlot, addFloor, storeTower, startFinale, moveAim, topCenter, openMap, openView, openDistrict, buildNext, nextFree, plotX, setQuality: (q) => { quality = q; resize(); } };
boot();
