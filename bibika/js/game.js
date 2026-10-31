"use strict";
// Поездка без проигрыша. Всё время симуляции останавливается на паузе.
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const TARGET_STARS = 92,
  // Скорость растёт весь заезд: чем дальше, тем быстрее
  CRUISE_START = 600,
  CRUISE_MAX = 800,
  CRUISE_GAIN = 3.2,
  LOOP_RATE = 2.5,
  BOOST_TIME = 1.7,
  BOOST_FACTOR = 1.5,
  ROAD_H = 900,
  CAR_Y = ROAD_H * 0.73,
  SPAWN_AHEAD = 4800,
  LANES = [176, 300, 424],
  AIR_TIME = 1.25,
  AIR_HEIGHT = 3.1,
  FINALE_DELAY = 2.8;
// Новые цвета открываются за все собранные звёзды, тратить их не нужно
const PAINTS = [
  { id: "own", at: 0 },
  { id: "sun", color: "#ffc61f", at: 25 },
  { id: "gold", color: "#ffb52e", at: 60, metal: true },
  { id: "mint", color: "#19d3a2", at: 120 },
  { id: "sky", color: "#2f9bff", at: 170 },
  { id: "rose", color: "#ff5fa8", at: 200 },
  { id: "grape", color: "#8a5cff", at: 300 },
  { id: "flame", color: "#ff5a2b", at: 440 },
  { id: "pearl", color: "#f4f6f8", at: 600 },
  { id: "night", color: "#20273a", at: 800 },
];
// В начале заезда на дорогу выезжают самые заметные машины автопарка
const FIRST_TRAFFIC = ["tractor", "truck", "tank", "bus", "fire", "police"];
// Друзья в гонке: лёгкие модели, тяжёлая спортивная остаётся только у игрока
const CONCEPT_CARS = ["racer", "coupe", "hyper", "police", "ev", "comet", "neon"];
const RAINBOW = ["#ff4f7e", "#ff9a3c", "#ffe14d", "#7be04f", "#3fd1ff", "#b57bff"];
// Диски: один тап — следующий цвет
const RIMS = [
  { id: "own" },
  { id: "gold", color: "#ffc02e" },
  { id: "black", color: "#23272e" },
  { id: "red", color: "#ff3b45" },
  { id: "blue", color: "#2f9bff" },
];
// За заезд небо меняется: день, закат, ночь, дождь. Очередь зависит от номера заезда
const MOOD_ORDER = [
  ["day", "sunset", "night"],
  ["day", "rain", "day"],
  ["night", "sunset", "day"],
  ["sunset", "rain", "night"],
];
const CONFETTI_COLORS = ["#ff4f7e", "#ffd23f", "#3fd1ff", "#7be04f", "#b57bff"];
const EVENTS = ["row", "zig", "ramp", "boost", "big", "wave", "ramp", "row", "boost", "zig", "big", "wave"];
// Длинные машины взлетают ровно: бочка с прицепом выглядит как авария
const NO_SPIN = ["truck", "bus", "fire", "mixer", "dump", "garbage", "train", "harvester", "limo"];
const save = {
  version: 3,
  stars: 0,
  world: 0,
  car: "racer",
  sound: true,
  musicLevel: 0.52,
  effectsLevel: 0.82,
  farCamera: false,
  paint: {},
  stickers: {},
  rims: {},
  beacon: {},
  runs: 0,
};
try {
  const old = JSON.parse(localStorage.getItem("bibika_save") || "{}");
  if (Number.isFinite(old.stars))
    save.stars = Math.max(0, Math.floor(old.stars));
  if (CARS[old.car]) save.car = old.car;
  for (const key of ["musicLevel", "effectsLevel"])
    if (Number.isFinite(old[key])) save[key] = clamp(old[key], 0, 1);
  save.farCamera = old.farCamera === true;
  if (typeof old.sound === "boolean") save.sound = old.sound;
  if (Number.isInteger(old.world) && old.world >= 0) {
    const id =
      old.version >= 2
        ? WORLDS[old.world]?.id
        : ["farm", "beach", "candy", "snow", "space"][old.world];
    const index = WORLDS.findIndex((w) => w.id === id);
    if (index >= 0) save.world = index;
  }
  for (const [type, id] of Object.entries(old.paint || {}))
    if (CARS[type] && PAINTS.some((p) => p.id === id)) save.paint[type] = id;
  for (const [type, id] of Object.entries(old.rims || {}))
    if (CARS[type] && RIMS.some((r) => r.id === id)) save.rims[type] = id;
  for (const [type, on] of Object.entries(old.beacon || {}))
    if (CARS[type] && on === true) save.beacon[type] = true;
  if (Number.isFinite(old.runs)) save.runs = Math.max(0, Math.floor(old.runs));
  for (const w of WORLDS)
    if (Number.isFinite(old.stickers?.[w.id]))
      save.stickers[w.id] = Math.max(0, Math.floor(old.stickers[w.id]));
} catch (_) {}
function store() {
  try {
    localStorage.setItem("bibika_save", JSON.stringify(save));
  } catch (_) {}
}
const Game = {
  mode: "garage",
  paused: false,
  finished: false,
  // Логика дороги не зависит от экрана: 600 единиц в ширину, 900 в глубину
  w: 600,
  h: ROAD_H,
  airTime: AIR_TIME,
  airHeight: AIR_HEIGHT,
  time: 0,
  runTime: 0,
  distance: 0,
  world: save.world,
  previousWorld: save.world,
  worldFade: 1,
  cruise: CRUISE_START,
  speedNow: CRUISE_START,
  combo: 0,
  shake: 0,
  smokeIn: 0,
  zone: "",
  leap: false,
  heli: null,
  heliIn: 9,
  moods: ["day"],
  loop: null,
  loopedAt: null,
  ringStars: null,
  washing: false,
  lastSlope: 0,
  hornAt: -9,
  rivals: [],
  trafficBag: [],
  stars: 0,
  sinceStar: 0,
  entities: [],
  particles: [],
  shots: [],
  rings: [],
  hooks: [],
  birds: [],
  nextEvent: 0,
  nextHazard: 0,
  eventCount: 0,
  spawnCount: 0,
  lastLane: 1,
  active: 0,
  cooldown: 0,
  toast: 0,
  steered: false,
  idle: 0,
  finale: 0,
  fireworkIn: 0,
  finishShown: false,
  usedPower: false,
  spoken: new Set(),
  newPaints: [],
  pointer: null,
  keys: new Set(),
  car: {
    type: save.car,
    x: 300,
    y: CAR_Y,
    tx: 300,
    ty: CAR_Y,
    angle: 0,
    bump: 0,
    recoil: 0,
    air: 0,
    airMax: AIR_TIME,
    airLift: AIR_HEIGHT,
    spin: 0,
    boost: 0,
  },
};
function effect() {
  return Game.active > 0 ? CARS[Game.car.type].effect : "";
}
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function nearestLane(x) {
  return LANES.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
}
function showToast(text) {
  $("world-toast").textContent = text;
  $("world-toast").classList.add("show");
  Game.toast = 2.5;
}
function setWorld(index, announce = true) {
  Game.previousWorld = Game.world;
  Game.world = index % WORLDS.length;
  Game.worldFade = 0;
  save.world = Game.world;
  store();
  Music.setTrack(WORLDS[Game.world].music);
  if (announce) {
    showToast(WORLDS[Game.world].icon);
    Voice.say(WORLDS[Game.world].name);
  }
}
function paintSpec(type) {
  const p = PAINTS.find((p) => p.id === save.paint[type]);
  return p?.color ? { color: p.color, metal: !!p.metal } : null;
}
function rimColor(type) {
  return RIMS.find((r) => r.id === save.rims[type])?.color || null;
}
// Векторная заглушка: пока 3D грузится или если WebGL недоступен
function paintPlaceholder(el, type) {
  const box = el.getBoundingClientRect(),
    width = box.width || 220,
    height = box.height || 150,
    dpr = Math.min(devicePixelRatio || 1, 2);
  if (
    el.width !== Math.round(width * dpr) ||
    el.height !== Math.round(height * dpr)
  ) {
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
  }
  const g = el.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);
  const dim = carSize(type);
  if (type === "tank") dim.h += 70;
  const size = Math.min(
    (width / (dim.w * 0.9 + dim.h * 0.55)) * 0.8,
    (height / (dim.h * 0.84 + dim.w * 0.55)) * 0.82,
  );
  drawVehicle(g, type, width * 0.51, height * 0.49, size, {
    angle: -0.58,
    time: 0,
  });
}
function paintHero() {
  const hero = $("hero-car");
  if (window.driveView?.ready)
    window.driveView.preview(hero, save.car, Game.time);
  else paintPlaceholder(hero, save.car);
}
// Миниатюры рисуются по одной за кадр, чтобы гараж не замирал
let thumbQueue = [];
function paintCards() {
  if (window.driveView?.ready) thumbQueue = [...CAR_ORDER];
  else
    document
      .querySelectorAll(".car-card")
      .forEach((el) =>
        paintPlaceholder(el.querySelector("canvas"), el.dataset.car),
      );
  paintHero();
}
function paintNextThumb() {
  const type = thumbQueue.shift(),
    card = document.querySelector(`.car-card[data-car="${type}"]`);
  window.driveView.thumbnail(card.querySelector("canvas"), type);
}
function selectCar(type, speak = false) {
  save.car = type;
  store();
  const c = CARS[type];
  $("selected-name").textContent = c.name + ". " + c.power;
  $("hero-car").setAttribute("aria-label", c.name);
  $("hero-power").textContent = c.icon;
  $("hero-power").setAttribute("aria-label", "Показать: " + c.power);
  garageMission();
  document
    .querySelectorAll(".car-card")
    .forEach((el) =>
      el.setAttribute("aria-pressed", String(el.dataset.car === type)),
    );
  syncPaints();
  syncTune();
  paintHero();
  if (speak) Voice.say(c.name);
}
function buildGarage() {
  const list = $("car-list");
  CAR_ORDER.forEach((type) => {
    const c = CARS[type],
      b = document.createElement("button");
    b.className = "car-card";
    b.dataset.car = type;
    b.type = "button";
    b.style.setProperty("--tint", c.color);
    b.setAttribute(
      "aria-label",
      c.name + ". " + c.power + ". " + c.description,
    );
    b.setAttribute("aria-pressed", String(type === save.car));
    b.innerHTML = `<canvas aria-hidden="true"></canvas><span class="card-power" aria-hidden="true">${c.icon}</span>`;
    b.addEventListener("click", () => {
      Sound.unlock();
      // Второе касание той же машины — сразу в путь
      if (save.car === type && window.driveView?.ready) {
        startDrive();
        return;
      }
      Sound.tap();
      selectCar(type, true);
    });
    list.appendChild(b);
  });
  WORLDS.forEach((w, i) => {
    const b = document.createElement("button");
    b.className = "world-chip";
    b.type = "button";
    b.setAttribute("aria-label", w.name);
    b.innerHTML = `<span aria-hidden="true">${w.icon}</span><i aria-hidden="true"></i>`;
    b.addEventListener("click", () => {
      Sound.unlock();
      // Второе касание той же трассы, как и у машины, сразу запускает поездку
      if (save.world === i && window.driveView?.ready) {
        startDrive();
        return;
      }
      Sound.tap();
      save.world = i;
      store();
      syncWorldChips();
      Voice.say(w.name);
    });
    $("world-list").appendChild(b);
  });
  PAINTS.forEach((p) => {
    const b = document.createElement("button");
    b.className = "paint-chip";
    b.type = "button";
    b.addEventListener("click", () => choosePaint(p));
    $("paint-list").appendChild(b);
  });
  $("total-count").textContent = save.stars;
  syncWorldChips();
  selectCar(save.car);
  paintCards();
}
function syncPaints() {
  const type = save.car,
    chosen = save.paint[type] || "own";
  let nextFound = false;
  [...$("paint-list").children].forEach((b, i) => {
    const p = PAINTS[i],
      open = save.stars >= p.at;
    b.style.setProperty("--swatch", p.color || CARS[type].color);
    b.classList.toggle("locked", !open);
    b.setAttribute("aria-pressed", String(open && p.id === chosen));
    b.setAttribute(
      "aria-label",
      open ? "Цвет " + (i + 1) : `Откроется за ${p.at} звёзд`,
    );
    // Кольцо прогресса только у ближайшего закрытого цвета
    const next = !open && !nextFound;
    if (next) nextFound = true;
    b.classList.toggle("next", next);
    if (next) {
      const from = PAINTS[i - 1].at;
      b.style.setProperty(
        "--progress",
        `${((save.stars - from) / (p.at - from)) * 100}%`,
      );
    }
  });
}
function choosePaint(p) {
  Sound.unlock();
  if (save.stars < p.at) {
    Sound.boing();
    Voice.say("Собери ещё звёзды!");
    const chip = $("paint-list").children[PAINTS.indexOf(p)];
    chip.classList.remove("nope");
    void chip.offsetWidth;
    chip.classList.add("nope");
    return;
  }
  const type = save.car;
  if ((save.paint[type] || "own") === p.id) return;
  save.paint[type] = p.id;
  store();
  syncPaints();
  Sound.splash();
  washBubbles(p.color || CARS[type].color);
  // Кузов меняет цвет в самой пене, а не до неё
  setTimeout(() => {
    window.driveView?.setPaint(type, paintSpec(type));
    Sound.gift();
    if (window.driveView?.ready) thumbQueue.unshift(type);
    paintHero();
  }, 420);
}
// Тюнинг одним касанием: диски по кругу, мигалка вкл/выкл
function syncTune() {
  const rim = RIMS.find((r) => r.id === save.rims[save.car]);
  // У тарелки колёс нет, и кнопки дисков у неё тоже нет
  $("tune-wheels").hidden =
    !!window.driveView?.ready &&
    !window.driveView.selection(save.car).userData.rims.length;
  $("tune-wheels").style.setProperty("--rim", rim?.color || "#dfe5ea");
  const on = !!save.beacon[save.car];
  $("tune-beacon").classList.toggle("on", on);
  $("tune-beacon").setAttribute("aria-pressed", String(on));
}
function refreshCar(type) {
  if (window.driveView?.ready) thumbQueue.unshift(type);
  paintHero();
}
function nextRims() {
  Sound.unlock();
  Sound.gift();
  const type = save.car,
    index = RIMS.findIndex((r) => r.id === (save.rims[type] || "own")),
    next = RIMS[(index + 1) % RIMS.length];
  save.rims[type] = next.id;
  store();
  syncTune();
  washBubbles(next.color || "#ffffff");
  window.driveView?.setRims(type, next.color || null);
  refreshCar(type);
}
function toggleBeacon() {
  Sound.unlock();
  const type = save.car;
  save.beacon[type] = !save.beacon[type];
  if (!save.beacon[type]) delete save.beacon[type];
  store();
  if (save.beacon[type]) Sound.horn("police");
  else Sound.tap();
  syncTune();
  window.driveView?.setBeacon(type, !!save.beacon[type]);
  refreshCar(type);
}
function washBubbles(color) {
  const box = $("bubbles");
  for (let i = 0; i < 26; i++) {
    const bubble = document.createElement("i"),
      size = 14 + Math.random() * 46;
    bubble.style.cssText = `left:${15 + Math.random() * 70}%;top:${25 + Math.random() * 55}%;width:${size}px;height:${size}px;animation-delay:${Math.random() * 0.45}s;--bubble:${i % 3 ? "#ffffffdd" : color}`;
    bubble.addEventListener("animationend", () => bubble.remove());
    box.appendChild(bubble);
  }
}
function syncWorldChips() {
  garageMission();
  [...$("world-list").children].forEach((b, i) => {
    b.setAttribute("aria-pressed", String(i === save.world));
    const count = save.stickers[WORLDS[i].id] || 0;
    b.classList.toggle("earned", count > 0);
    b.querySelector("i").textContent = count > 0 ? "★".repeat(Math.min(count, 3)) : "";
  });
}
function clearInput() {
  Game.keys.clear();
  if (Game.pointer !== null) {
    try {
      canvas.releasePointerCapture(Game.pointer);
    } catch (_) {}
  }
  Game.pointer = null;
}
function startDrive(mode) {
  if (!window.driveView?.ready) return;
  driveView.begin(save.world);
  driveView.far = save.farCamera;
  Sound.unlock();
  Sound.tap();
  Game.mode = "drive";
  Game.finished = false;
  Game.finishShown = false;
  document.body.dataset.finished = "no";
  Game.paused = false;
  Game.distance = 0;
  Game.runTime = 0;
  Game.stars = 0;
  Game.sinceStar = 0;
  Game.cruise = Game.speedNow = CRUISE_START;
  Game.combo = 0;
  Game.shake = 0;
  Game.zone = "";
  Game.leap = false;
  Game.heli = null;
  Game.heliIn = 9;
  Game.loop = null;
  Game.loopedAt = null;
  Game.ringStars = null;
  Game.washing = false;
  Game.lastSlope = 0;
  Game.hornAt = -9;
  // Космос всегда ночной, в пустыне и зиме дождя не бывает
  {
    const world = WORLDS[save.world].id,
      order = MOOD_ORDER[save.runs % MOOD_ORDER.length];
    Game.moods =
      world === "space"
        ? ["night"]
        : world === "desert" || world === "snow"
          ? order.map((m) => (m === "rain" ? "sunset" : m))
          : order;
    if (mode !== "demo") {
      save.runs++;
      store();
    }
  }
  Game.trafficBag = [
    ...shuffled(Object.keys(CARS).filter((t) => !FIRST_TRAFFIC.includes(t))),
    ...shuffled(FIRST_TRAFFIC),
  ];
  Game.entities = [];
  Game.rivals = [];
  $("rival-dots").replaceChildren();
  Game.particles = [];
  Game.shots = [];
  Game.rings = [];
  Game.hooks = [];
  Game.birds = [];
  // Первые звёзды появляются сразу, дальше темп задают короткие паузы между группами
  Game.nextEvent = CRUISE_START * 1.3;
  Game.nextHazard = CRUISE_START * 2.6;
  Game.eventCount = 0;
  Game.spawnCount = 0;
  Game.cooldown = 0;
  Game.active = 0;
  Game.steered = false;
  Game.idle = 0;
  Game.usedPower = false;
  Game.spoken = new Set();
  Game.newPaints = [];
  clearInput();
  document.body.dataset.mode = "drive";
  $("dialog-backdrop").hidden = true;
  $("finish").hidden = true;
  Game.car = {
    type: save.car,
    x: 300,
    tx: 300,
    y: CAR_Y,
    ty: CAR_Y,
    angle: 0,
    bump: 0,
    recoil: 0,
    air: 0,
    airMax: AIR_TIME,
    airLift: AIR_HEIGHT,
    spin: 0,
    boost: 0,
  };
  setWorld(save.world, false);
  beginEpisode(mode);
  if (!Game.demo && !Game.farm) {
    fillRoad();
    addRivals();
  }
  Game.previousWorld = Game.world;
  Game.worldFade = 1;
  showToast(WORLDS[Game.world].icon);
  syncCameraButton();
  $("star-end").textContent = Game.farm ? "🌾" : "★";
  $("power-icon").textContent = CARS[save.car].icon;
  $("btn-power").setAttribute(
    "aria-label",
    CARS[save.car].power + ": " + CARS[save.car].description,
  );
  $("steer-hint").style.opacity = Game.demo || Game.farm ? "0" : "1";
  hud.stars = hud.power = hud.fill = null;
  updateHUD();
  $("btn-pause").focus({ preventScroll: true });
  Voice.say(Game.demo ? CARS[save.car].power : Game.farm ? "Подтолкни ковшом три тюка!" : "Собери звёзды!");
}
function garage() {
  Sound.engine(Game.car.type, false, false);
  Voice.stop();
  clearInput();
  Game.mode = "garage";
  Game.demo = false;
  Game.farm = Game.city = null;
  missionHint("");
  Game.paused = false;
  Game.finished = false;
  Game.active = 0;
  Game.shots = [];
  Game.entities = [];
  $("dialog-backdrop").hidden = true;
  $("finish").hidden = true;
  document.body.dataset.mode = "garage";
  $("total-count").textContent = save.stars;
  syncWorldChips();
  syncPaints();
  if (detailWaiting) applyDetail();
  else paintCards();
  $("btn-play").focus({ preventScroll: true });
}
let dialogReturnFocus = null;
function pause() {
  if (Game.mode !== "drive" || Game.paused || Game.finished) return;
  // Фокус возвращаем только внутрь игры: возврат в чужой iframe снова вызвал бы blur и паузу
  dialogReturnFocus = document.activeElement?.closest?.("#game-stage")
    ? document.activeElement
    : $("btn-pause");
  Game.paused = true;
  Sound.engine(Game.car.type, false, false);
  Voice.stop();
  clearInput();
  $("dialog-backdrop").hidden = false;
  $("btn-resume").focus();
  if (Sound.ctx) Sound.ctx.suspend().catch(() => {});
}
function resume() {
  Game.paused = false;
  $("dialog-backdrop").hidden = true;
  Sound.unlock();
  if (dialogReturnFocus?.isConnected)
    dialogReturnFocus.focus({ preventScroll: true });
}
function nextRun() {
  save.world = (Game.world + 1) % WORLDS.length;
  store();
  startDrive();
}
function finish() {
  if (Game.finished) return;
  Sound.engine(Game.car.type, false, false);
  Game.finished = true;
  document.body.dataset.finished = "yes";
  Game.finale = 0;
  Game.fireworkIn = 0.15;
  clearInput();
  if (!Game.farm) missionHint("");
  Sound.fanfare();
  Voice.say(Game.farm ? "Все три тюка собраны!" : "Ура! Первое место!");
  const id = WORLDS[Game.world].id;
  save.stickers[id] = (save.stickers[id] || 0) + 1;
  store();
  // Дорога расчищается под салют
  for (const e of Game.entities)
    if (isObstacle(e)) {
      e.dead = true;
      confetti(e.x, e.y, 8);
    }
  $("steer-hint").style.opacity = "0";
}
function showFinish() {
  Game.finishShown = true;
  $("finish-sticker").textContent = Game.farm ? "🌾" : WORLDS[Game.world].icon;
  const fresh = PAINTS.find((p) => p.id === Game.newPaints[0]);
  $("finish-paint").hidden = !fresh;
  if (fresh) {
    $("finish-paint").style.setProperty("--swatch", fresh.color);
    Voice.say("Новый цвет!");
  }
  $("finish").hidden = false;
  // Медали получают все: у игрока золото, друзья рядом с ним
  const friends = [...Game.rivals].sort((a, b) => b.score - a.score),
    list = $("finish-friends");
  list.textContent = "";
  friends.forEach((r, i) => {
    const place = document.createElement("span"),
      art = document.createElement("canvas"),
      medal = document.createElement("i");
    place.className = "friend-medal";
    medal.textContent = ["🥈", "🥉", "🏅"][i];
    place.append(art, medal);
    list.appendChild(place);
    if (window.driveView?.ready) driveView.thumbnail(art, r.type);
  });
  $("btn-next").focus({ preventScroll: true });
}
function collect(e) {
  if (e.dead || Game.finished) return;
  e.dead = true;
  Game.combo = Game.sinceStar < 1.6 ? Game.combo + 1 : 1;
  Game.sinceStar = 0;
  const fare = effect() === "carpet" && Math.abs(Game.car.x - Game.car.carpetX) < 56 ? 3
    : effect() === "double" ? 2 : 1;
  const n = (e.big ? 3 : 1) * fare,
    before = save.stars;
  Game.stars = Math.min(TARGET_STARS, Game.stars + n);
  if (!Game.demo) save.stars += n;
  for (const p of PAINTS)
    if (p.at > before && p.at <= save.stars) Game.newPaints.push(p.id);
  store();
  Sound.star();
  burst(e.x, e.y, "#ffe17a", e.big ? 26 : 10);
  if (e.big) Sound.gift();
  // Серия звёзд подряд — маленький праздник
  if (Game.combo % 6 === 0) {
    addRing(Game.car.x, Game.car.y, "#ffe17a", 260);
    confetti(Game.car.x, Game.car.y, 20);
    Sound.gift();
  }
  updateHUD();
  sayOnce(TARGET_STARS / 2, "Молодец!");
  sayOnce(TARGET_STARS - 10, "Ещё чуть-чуть!");
  if (!Game.demo && !Game.farm && Game.stars >= TARGET_STARS) finish();
}
function sayOnce(stars, text) {
  if (Game.stars < stars || Game.stars >= TARGET_STARS || Game.spoken.has(text))
    return;
  Game.spoken.add(text);
  Voice.say(text);
}
function burst(x, y, color, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU,
      s = 35 + Math.random() * 150;
    Game.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.45 + Math.random() * 0.4,
      max: 0.85,
      color,
      size: 3 + Math.random() * 5,
    });
  }
}
function confetti(x, y, n = 20) {
  for (let i = 0; i < 5; i++) burst(x, y, CONFETTI_COLORS[i], Math.ceil(n / 5));
}
// Салют: частицы со своей высотой над дорогой
function firework() {
  const c = Game.car,
    x = 120 + Math.random() * 360,
    y = c.y - 420 - Math.random() * 420,
    alt = 9 + Math.random() * 6,
    color = CONFETTI_COLORS[Math.floor(Math.random() * 5)];
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * TAU,
      s = 90 + Math.random() * 170;
    Game.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.5,
      alt,
      valt: Math.sin(a) * 6 + (Math.random() - 0.3) * 5,
      life: 0.9 + Math.random() * 0.7,
      max: 1.6,
      color: i % 4 ? color : "#fff6c8",
      size: 8 + Math.random() * 7,
    });
  }
  Sound.firework();
}
function clearObstacle(e, bonus = false) {
  if (e.dead) return;
  e.dead = true;
  burst(e.x, e.y, CARS[Game.car.type].color, 14);
  burst(e.x, e.y, "#fff4b0", 8);
  if (bonus)
    Game.entities.push({
      kind: "star",
      x: e.x,
      y: e.y,
      size: 17,
      phase: Math.random() * TAU,
    });
  Sound.pop();
}
function isObstacle(e) {
  return ["traffic", "cone"].includes(e.kind) && !e.dead;
}
function addRing(x, y, color, max = 220) {
  Game.rings.push({ x, y, r: 12, max, life: 1, color });
}
function nopePower() {
  const b = $("btn-power");
  b.classList.remove("nope");
  void b.offsetWidth;
  b.classList.add("nope");
}
function activatePower() {
  if (
    Game.mode !== "drive" ||
    Game.paused ||
    Game.finished ||
    Game.cooldown > 0
  )
    return false;
  const c = Game.car,
    info = CARS[c.type],
    fx = info.effect;
  if (!startVehiclePower(c, fx)) {
    nopePower();
    return false;
  }
  Sound.unlock();
  Sound.power(fx);
  Game.usedPower = true;
  if (fx === "plow") c.struck = false;
  Game.active = info.duration;
  Game.cooldown = info.cooldown;
  if (fx === "cannon") {
    // Вплотную залп накрывает сразу, остальные преграды находят самонаводящиеся шары:
    // сначала ближние и на любой полосе, а не только дальние прямо по курсу
    const ahead = Game.entities
      .filter((e) => isObstacle(e) && e.y < c.y + 60 && c.y - e.y < 2300)
      .sort((a, b) => b.y - a.y);
    for (const e of ahead)
      if (c.y - e.y < 380 && Math.abs(e.x - c.x) < 170) {
        confetti(e.x, e.y, 24);
        clearObstacle(e, true);
      }
    const rest = ahead.filter((e) => !e.dead);
    for (let i = 0; i < 3; i++)
      Game.shots.push({
        x: c.x + (i - 1) * 24,
        y: c.y - 60 - i * 8,
        vx: (i - 1) * 35,
        vy: -2050,
        life: 2.3,
        target: rest[i] || rest[0] || null,
      });
    c.recoil = 12;
    confetti(c.x, c.y - 85, 30);
  }
  if (fx === "starfall") {
    for (let i = 0; i < 3; i++)
      Game.entities.push({
        kind: "star",
        x: clamp(c.x + Math.sin(i * 0.8) * 30, 145, 455),
        y: c.y - 220 - i * 130,
        size: 17,
        phase: i,
      });
  }
  if (["megahorn", "siren", "rescue", "wind"].includes(fx)) {
    addRing(c.x, c.y, fx === "rescue" ? "#ffcad8" : "#f9f6b0", 360);
    Sound.horn(c.type);
  }
  if (fx === "freeze") {
    Game.entities.forEach((e) => {
      if (isObstacle(e)) burst(e.x, e.y, "#b3faff", 5);
    });
    addRing(c.x, c.y, "#b9faff", 420);
  }
  updateHUD();
  return true;
}
function honk() {
  if (Game.mode !== "drive" || Game.paused || Game.finished) return;
  Sound.unlock();
  Sound.horn(Game.car.type);
  const c = Game.car;
  addRing(c.x, c.y, "#fff4b0", 130);
  // Звери у дороги радостно подпрыгивают
  Game.hornAt = Game.time;
  Sound.giggle();
  // С обочины взлетают птицы
  for (let i = 0; i < 8 && Game.birds.length < 24; i++) {
    const side = i % 2 ? 1 : -1;
    Game.birds.push({
      x: 300 + side * (205 + Math.random() * 70),
      y: c.y - 300 - Math.random() * 800,
      alt: 0.8 + Math.random() * 1.6,
      vx: side * (60 + Math.random() * 90),
      vy: -40 - Math.random() * 90,
      valt: 3 + Math.random() * 3,
      life: 2.6,
      phase: i,
    });
  }
  // Машина впереди уступает дорогу и перестраивается
  for (const e of Game.entities) {
    if (e.kind !== "traffic" || e.dead) continue;
    const ahead = c.y - e.y;
    if (ahead < 40 || ahead > 1000 || Math.abs(e.x - c.x) > 70) continue;
    giveWay(e);
  }
}
function giveWay(e) {
  const c = Game.car,
    index = LANES.indexOf(nearestLane(e.x)),
    dir = index === 0 ? 1 : index === 2 ? -1 : e.x >= c.x ? 1 : -1;
  e.tx = LANES[index + dir];
}
// Три друга едут рядом и тоже будто собирают звёзды, но первым приходит игрок
function addRivals() {
  const pool = shuffled(
      CAR_ORDER.filter((t) => t !== save.car && !CONCEPT_CARS.includes(t)),
    ).slice(0, 3),
    bases = [340, 680, 180],
    dots = $("rival-dots");
  dots.textContent = "";
  Game.rivals = pool.map((type, i) => {
    const dot = document.createElement("b");
    dot.style.background = CARS[type].color;
    dots.appendChild(dot);
    const rival = {
      kind: "rival",
      type,
      x: LANES[i],
      lane: i,
      y: CAR_Y - bases[i],
      base: bases[i],
      score: 0,
      phase: i * 2.1,
      drift: 0,
      size: 34,
      think: 1 + i * 0.4,
      index: i,
      dot,
      shown: -1,
    };
    Game.entities.push(rival);
    return rival;
  });
}
function moveRival(e, dt) {
  const c = Game.car;
  if (!Game.finished)
    e.score = Math.max(
      0,
      Math.min(
        TARGET_STARS - 2 - e.index * 3,
        e.score +
          dt * (1 + (Game.stars - e.score) * 0.14 + Math.sin(Game.time * 0.4 + e.phase) * 0.25),
      ),
    );
  const gap = clamp(
    e.base + (e.score - Game.stars) * 30 + Math.sin(Game.time * 0.6 + e.phase) * 90,
    160,
    1050,
  );
  e.y = lerp(e.y, c.y - gap, 1 - Math.exp(-dt * (Game.loop ? 0.5 : 1.5)));
  e.think -= dt;
  if (e.think <= 0) {
    e.think = 0.5 + Math.random() * 0.8;
    const blocked = (lane) =>
      (Math.abs(e.y - c.y) < 300 && Math.abs(LANES[lane] - c.x) < 90) ||
      Game.entities.some(
        (o) =>
          o.kind === "traffic" &&
          !o.dead &&
          o.y < e.y &&
          e.y - o.y < 480 &&
          Math.abs(o.x - LANES[lane]) < 70,
      );
    if (blocked(e.lane) || Math.random() < 0.1) {
      const free = [0, 1, 2].filter((l) => l !== e.lane && !blocked(l));
      if (free.length) e.lane = free[Math.floor(Math.random() * free.length)];
    }
  }
  const before = e.x;
  e.x = lerp(e.x, LANES[e.lane], 1 - Math.exp(-dt * 4));
  e.drift = clamp(((e.x - before) / Math.max(dt, 0.001)) * 0.0035, -0.2, 0.2);
  const pct = Math.round((e.score / TARGET_STARS) * 100);
  if (pct !== e.shown) {
    e.shown = pct;
    e.dot.style.left = pct + "%";
  }
}
const hud = { stars: null, power: null, fill: null };
function updateHUD() {
  const progress = Game.farm ? Game.farm.count : Game.stars;
  const goal = Game.farm ? 3 : TARGET_STARS;
  if (hud.stars !== progress) {
    const grew = hud.stars !== null && progress > hud.stars;
    hud.stars = progress;
    $("star-fill").style.width = `${(progress / goal) * 100}%`;
    $("star-progress").setAttribute(
      "aria-label",
      Game.farm ? `${progress} из 3 тюков` : `${progress} из ${goal} звёзд`,
    );
    if (grew) {
      const end = $("star-end");
      end.classList.remove("pop");
      void end.offsetWidth;
      end.classList.add("pop");
    }
  }
  const disabled = Game.cooldown > 0,
    state = Game.active > 0 ? "active" : disabled ? "charging" : "ready";
  if (hud.power !== state) {
    hud.power = state;
    $("btn-power").dataset.state = state;
    $("btn-power").setAttribute("aria-disabled", String(disabled));
  }
  const fill = disabled
    ? Math.round((1 - Game.cooldown / CARS[Game.car.type].cooldown) * 100)
    : 100;
  if (hud.fill !== fill) {
    hud.fill = fill;
    $("power-fill").style.height = fill + "%";
  }
}
// Координата s отсчитывается вдоль дороги, поэтому темп не зависит от скорости машины
function roadY(s) {
  return CAR_Y - (s - Game.distance);
}
function addStar(s, x, extra) {
  Game.entities.push({
    kind: "star",
    x,
    y: roadY(s),
    size: 17,
    phase: s * 0.013,
    ...extra,
  });
}
function addRamp(s, x) {
  Game.entities.push({ kind: "ramp", x, y: roadY(s), phase: 0 });
}
// Какой будет крейсерская скорость, когда машина доедет до точки s
function cruiseAt(s) {
  const seconds = Math.max(0, s - Game.distance) / Game.cruise;
  return Math.min(CRUISE_MAX, Game.cruise + CRUISE_GAIN * seconds);
}
function spawnEvent() {
  const s = Game.nextEvent,
    v = cruiseAt(s),
    planned = EVENTS[Game.eventCount++ % EVENTS.length],
    // Трамплин или ускоритель в воздухе над разрывом не нужны
    pattern =
      ["ramp", "boost"].includes(planned) && window.driveView?.nearLeap(s / 22)
        ? "row"
        : planned;
  // Новая группа идёт не по той же полосе, что прошлая: так есть повод рулить
  const lane = (Game.lastLane + 1 + Math.floor(Math.random() * 2)) % 3,
    other = lane === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1;
  Game.lastLane = lane;
  let length = 0;
  if (pattern === "row") {
    for (let i = 0; i < 5; i++) addStar(s + i * v * 0.4, LANES[lane]);
    length = v * 1.6;
  } else if (pattern === "zig") {
    for (let i = 0; i < 6; i++)
      addStar(s + i * v * 0.48, LANES[i % 4 < 2 ? lane : other]);
    length = v * 2.4;
  } else if (pattern === "wave") {
    // Волна через все три полосы
    const order = lane === 0 ? [0, 1, 2, 1, 0] : lane === 2 ? [2, 1, 0, 1, 2] : [1, 2, 1, 0, 1];
    order.forEach((l, i) => addStar(s + i * v * 0.55, LANES[l]));
    length = v * 2.2;
  } else if (pattern === "big") {
    addStar(s, LANES[lane]);
    addStar(s + v * 0.4, LANES[lane]);
    addStar(s + v * 1.0, LANES[lane], { big: true });
    length = v;
  } else if (pattern === "boost") {
    // Ускоритель и за ним длинный ряд звёзд на большой скорости
    Game.entities.push({ kind: "boost", x: LANES[lane], y: roadY(s), phase: 0 });
    for (let i = 0; i < 6; i++)
      addStar(s + v * 0.9 + i * v * BOOST_FACTOR * 0.28, LANES[lane]);
    length = v * 0.9 + v * BOOST_FACTOR * 1.4;
  } else {
    // Трамплин: звёзды висят на дуге полёта, последняя ждёт после приземления
    addRamp(s, LANES[lane]);
    for (const t of [0.25, 0.5, 0.75])
      addStar(s + v * AIR_TIME * t, LANES[lane], {
        air: Math.sin(t * Math.PI) * AIR_HEIGHT + 0.95,
      });
    addStar(s + v * AIR_TIME + v * 0.3, LANES[lane]);
    addStar(s + v * AIR_TIME + v * 0.7, LANES[lane]);
    length = v * AIR_TIME + v * 0.7;
  }
  Game.nextEvent = s + length + v * (3 + Math.random() * 0.7);
}
function spawnHazard() {
  const s = Game.nextHazard,
    n = Game.spawnCount++,
    y = roadY(s),
    v = cruiseAt(s),
    busy = (x) =>
      Game.entities.some(
        (e) =>
          ["star", "ramp", "boost"].includes(e.kind) &&
          Math.abs(e.y - y) < v * 0.55 &&
          Math.abs(e.x - x) < 65,
      );
  const start = Math.floor(Math.random() * 3);
  let x = LANES[start];
  for (let i = 0; i < 3 && busy(x); i++) x = LANES[(start + i + 1) % 3];
  Game.nextHazard = s + v * (1.9 + Math.random() * 0.7);
  if (busy(x) || window.driveView?.nearLeap(s / 22)) return;
  if (n % 7 === 6) {
    addRamp(s, x);
    return;
  }
  if (n % 5 === 0) {
    Game.entities.push({
      kind: Game.world === 3 ? "ice" : "mud",
      x,
      y,
      size: 25,
      phase: n,
    });
    return;
  }
  if (n % 3 === 0) {
    // Ряд конусов: их весело сбивать, штрафа нет
    for (let i = 0; i < 3; i++)
      Game.entities.push({
        kind: "cone",
        x,
        y: y - i * 90,
        size: 25,
        phase: n,
      });
    return;
  }
  if (!Game.trafficBag.length) Game.trafficBag = shuffled(Object.keys(CARS));
  Game.entities.push({
    kind: "traffic",
    // Весь наш автопарк ездит по всем трассам: трактор, фура, танк и остальные
    type: Game.trafficBag.pop(),
    x,
    y,
    pace: 0.58 + Math.random() * 0.25,
    size: 34,
    phase: n,
    drift: 0,
  });
}
function fillRoad() {
  // Звёзды внутри петли появляются заранее, чтобы их было видно издалека
  const ringAt = window.driveView?.loopAhead(
    Game.distance / 22,
    (Game.distance + SPAWN_AHEAD) / 22,
  );
  if (ringAt != null && Game.ringStars !== ringAt) {
    Game.ringStars = ringAt;
    for (let i = 1; i <= 6; i++)
      Game.entities.push({
        kind: "star",
        x: 300,
        y: roadY(ringAt * 22),
        size: 17,
        phase: i,
        ring: (i * TAU) / 7,
      });
  }
  while (Game.nextEvent < Game.distance + SPAWN_AHEAD) spawnEvent();
  while (Game.nextHazard < Game.distance + SPAWN_AHEAD) spawnHazard();
}
function hitBoost(e) {
  const c = Game.car;
  e.used = true;
  c.boost = BOOST_TIME;
  Game.shake = Math.max(Game.shake, 0.45);
  burst(c.x, c.y, "#7ff1ff", 22);
  addRing(c.x, c.y, "#7ff1ff", 240);
  Sound.turbo();
}
function launchRamp(e) {
  const c = Game.car;
  e.used = true;
  c.air = c.airMax = AIR_TIME;
  c.airLift = AIR_HEIGHT;
  c.spin = NO_SPIN.includes(c.type) ? 0 : c.x > 300 ? -1 : 1;
  Sound.whee();
  burst(c.x, c.y, "#fff4b0", 12);
}
function launchCone(e) {
  const c = Game.car;
  e.kind = "flyer";
  e.look = "cone";
  e.fly = 1.15;
  e.alt = 0;
  e.valt = 6.5 + Math.random() * 3;
  e.vx = (e.x >= c.x ? 1 : -1) * (130 + Math.random() * 110);
  e.spin = 0;
  e.spinRate = 7 + Math.random() * 5;
  burst(e.x, e.y, "#f88939", 6);
  Sound.pop();
}
function splash(e) {
  e.used = true;
  burst(e.x, e.y, e.kind === "ice" ? "#d6f7ff" : "#7fd4ff", 22);
  burst(e.x, e.y, "#ffffff", 8);
  Sound.splash();
}
function update(dt) {
  if (Game.mode !== "drive" || Game.paused) return;
  Game.time += dt;
  Game.runTime += dt;
  Game.sinceStar += dt;
  Game.cooldown = Math.max(0, Game.cooldown - dt);
  Game.active = Math.max(0, Game.active - dt);
  Game.worldFade = Math.min(1, Game.worldFade + dt * 0.8);
  Game.shake = Math.max(0, Game.shake - dt * 2.2);
  Game.cruise = Math.min(CRUISE_MAX, CRUISE_START + Game.runTime * CRUISE_GAIN);
  const c = Game.car,
    done = Game.finished,
    fx = done ? "" : effect(),
    boost = ["nitro", "wind", "comet"].includes(fx) || c.boost > 0,
    // Слоу-мо замедляет всю сцену: дорога и предметы всегда едут вместе
    speed = Game.cruise * (boost ? BOOST_FACTOR : fx === "slow" ? 0.5 : 1);
  c.bump = Math.max(0, c.bump - dt);
  c.boost = Math.max(0, c.boost - dt);
  c.recoil = Math.max(0, c.recoil - dt * 55);
  if (c.air > 0) {
    c.air = Math.max(0, c.air - dt);
    if (c.air === 0) {
      const big = c.airLift > 2;
      c.spin = 0;
      if (big) {
        Sound.land();
        addRing(c.x, c.y, "#fff4b0", 120);
        Game.shake = Math.max(Game.shake, 0.6);
      }
      burst(c.x, c.y, "#fff4b0", big ? 14 : 5);
    }
  }
  // Прыг-скок: короткие прыжки один за другим
  if (fx === "bounce" && c.air === 0) {
    c.air = c.airMax = 0.62;
    c.airLift = 1.35;
    c.spin = 0;
    Sound.boing();
  }
  // Мёртвая петля: дорога замирает, машина проходит круг и вылетает с ускорением
  const metres = Game.distance / 22;
  if (!Game.loop && !done) {
    const start = window.driveView?.loopAt(metres);
    if (start != null && Game.loopedAt !== start) {
      Game.loop = { theta: 0, s: start };
      Game.loopedAt = start;
      c.air = 0;
      c.spin = 0;
      Sound.whee();
      if (!Game.spoken.has("loop")) {
        Game.spoken.add("loop");
        Voice.say("Мёртвая петля!");
      }
    }
  }
  if (Game.loop) {
    Game.loop.theta += dt * LOOP_RATE;
    if (Game.loop.theta >= TAU) {
      Game.loop = null;
      Sound.land();
      Game.shake = Math.max(Game.shake, 0.8);
      addRing(c.x, c.y, "#fff4b0", 180);
      hitBoost({});
    }
  }
  // Автомойка: сбавляем ход, пена и щётки, на выезде заряд и ускорение
  const washing = !done && !!window.driveView?.washing(metres);
  if (washing !== Game.washing) {
    Game.washing = washing;
    if (washing) {
      Sound.splash();
      Voice.say("Моем машину!");
    } else if (!done) {
      Sound.gift();
      Voice.say("Как новая!");
      Game.cooldown = 0;
      burst(c.x, c.y, "#ffffff", 26);
      hitBoost({});
    }
  }
  const roadSpeed = episodeSpeed(dt, Game.loop ? 0 : speed * (c.bump > 0 ? 0.62 : 1) * (washing ? 0.48 : 1));
  Game.speedNow = Game.loop ? Game.cruise : roadSpeed;
  Game.distance += roadSpeed * dt;
  // На гребне горки машина слегка взлетает
  const slope = window.driveView?.slope(metres) ?? 0;
  if (
    !done &&
    c.air === 0 &&
    !Game.loop &&
    Game.lastSlope > 0.05 &&
    slope <= 0.05 &&
    window.driveView?.hill(metres)
  ) {
    c.air = c.airMax = 0.46;
    c.airLift = 0.8;
    c.spin = 0;
    Sound.tap();
  }
  Game.lastSlope = slope;
  const zone = window.driveView?.zone(Game.distance / 22) || "";
  if (zone !== Game.zone) {
    Game.zone = zone;
    if (zone && !done) {
      Sound.whoosh();
      if (!Game.spoken.has(zone)) {
        Game.spoken.add(zone);
        Voice.say(
          zone === "bridge"
            ? "Большой мост!"
            : Game.world === 4
              ? "Подводный туннель!"
              : "Туннель!",
        );
      }
    }
  }
  // Вертолёт прилетает, кружит над дорогой и сбрасывает подарки на парашютах
  if (!done && !Game.farm && !Game.demo && !(Game.city?.manual)) {
    Game.heliIn -= dt;
    if (!Game.heli && Game.heliIn <= 0) {
      Game.heli = { t: 0, x: -520, y: c.y - 860, alt: 11, vx: 0, drops: 2, dropIn: 2.6 };
      Sound.whoosh();
      if (!Game.spoken.has("heli")) {
        Game.spoken.add("heli");
        Voice.say("Смотри, вертолёт!");
      }
    }
  }
  if (Game.heli) {
    const h = Game.heli,
      was = h.x;
    h.t += dt;
    h.x =
      h.t < 1.7
        ? lerp(-520, 300, 1 - (1 - h.t / 1.7) ** 2)
        : h.t < 8.2
          ? 300 + Math.sin((h.t - 1.7) * 1.05) * 124
          : was + 620 * dt;
    h.vx = (h.x - was) / Math.max(dt, 0.001);
    h.dropIn -= dt;
    if (!done && h.drops > 0 && h.dropIn <= 0 && h.t < 8.2) {
      const metres = (Game.distance + (c.y - h.y)) / 22;
      h.dropIn = 0.2;
      // Сквозь гору ящик не падает, над разрывом ловить его негде
      if (
        window.driveView?.zone(metres) !== "tunnel" &&
        !window.driveView?.nearLeap(metres)
      ) {
        h.drops--;
        h.dropIn = 2.3;
        Game.entities.push({
          kind: "gift",
          x: nearestLane(h.x),
          y: h.y,
          alt: h.alt - 2,
          valt: -7.5,
          phase: 0,
        });
      }
    }
    if (h.t > 9.8) {
      Game.heli = null;
      Game.heliIn = 11 + Math.random() * 5;
    }
  }
  // Прыжок через разрыв: высоту задаёт дорога, поэтому долететь можно при любой скорости
  const leap = !!window.driveView?.leaping(Game.distance / 22);
  if (leap !== Game.leap) {
    Game.leap = leap;
    if (leap) {
      Sound.whee();
      Game.shake = Math.max(Game.shake, 0.35);
      burst(c.x, c.y, "#fff4b0", 16);
      if (!done && !Game.spoken.has("leap")) {
        Game.spoken.add("leap");
        Voice.say("Прыжок!");
      }
    } else {
      Sound.land();
      Game.shake = Math.max(Game.shake, 0.9);
      addRing(c.x, c.y, "#fff4b0", 180);
      burst(c.x, c.y, "#fff4b0", 22);
    }
  }
  const keys = Game.keys;
  if (keys.size) {
    if (keys.has("left")) c.tx -= 520 * dt;
    if (keys.has("right")) c.tx += 520 * dt;
    if (keys.has("up")) c.ty -= 280 * dt;
    if (keys.has("down")) c.ty += 280 * dt;
    markSteered();
  }
  const held = Game.pointer !== null || keys.size > 0;
  Game.idle = held ? 0 : Game.idle + dt;
  // Без руля машина мягко встаёт на ближайшую полосу и не застревает между ними
  if (!held && fx !== "allterrain")
    c.tx = lerp(c.tx, nearestLane(c.tx), 1 - Math.exp(-dt * 3.5));
  const bounds = fx === "allterrain" ? [53, 547] : [145, 455];
  c.tx = Game.city?.phase === "pullOver" ? 483 : clamp(c.tx, ...bounds);
  c.ty = clamp(c.ty, Game.h * 0.38, Game.h - 165);
  const blend = 1 - Math.exp(-dt * 20),
    oldX = c.x;
  c.x = lerp(c.x, c.tx, blend);
  c.y = lerp(c.y, c.ty, blend);
  const sideways = (c.x - oldX) / Math.max(dt, 0.001);
  c.angle = lerp(
    c.angle,
    clamp(sideways * 0.0009, -0.3, 0.3),
    1 - Math.exp(-dt * 8),
  );
  if (done) {
    Game.finale += dt;
    Game.fireworkIn -= dt;
    if (Game.fireworkIn <= 0) {
      firework();
      Game.fireworkIn = 0.42 + Math.random() * 0.3;
    }
    if (!Game.finishShown && Game.finale >= FINALE_DELAY) showFinish();
  } else if (!Game.demo && !Game.farm) fillRoad();
  const airborne =
      c.air > 0 || fx === "jump" || fx === "fly" || leap || !!Game.loop,
    // Ребёнок не рулит: звёзды и трамплины сами подъезжают, машины уступают
    helping = !done && Game.idle > 7,
    reach = Game.sinceStar > 8 ? 200 : 100,
    dimensions = carSize(c.type),
    factor = fx === "mini" ? 0.52 : fx === "monster" ? 1.25 : 1,
    cw = dimensions.w * 0.39 * factor,
    ch = dimensions.h * 0.39 * factor;
  // Дымок от резкого манёвра и следы суперсил
  const trail = (x, y, color, size, life) =>
    Game.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 50,
      vy: roadSpeed * 0.85,
      life,
      max: life,
      color,
      size,
    });
  if (Math.abs(sideways) > 200 && c.air === 0)
    trail(c.x + (Math.random() < 0.5 ? -30 : 30), c.y + ch, "#e8ecef", 7, 0.4);
  if (fx === "comet") trail(c.x, c.y + ch, Math.random() < 0.5 ? "#ffd23f" : "#ff9a3c", 9, 0.7);
  if (fx === "rainbow")
    for (let i = 0; i < 3; i++)
      trail(c.x + (i - 1) * 24, c.y + ch, RAINBOW[Math.floor(Game.time * 12 + i) % 6], 9, 0.8);
  // Брызги из-под колёс на мокрой дороге
  if ((window.driveView?.rainNow || 0) > 0.35 && c.air === 0 && !leap)
    trail(c.x + (Math.random() < 0.5 ? -26 : 26), c.y + ch, "#dfeaf2", 4, 0.26);
  if (washing)
    for (let i = 0; i < 4; i++)
      Game.particles.push({
        x: c.x + (Math.random() - 0.5) * 120,
        y: c.y + (Math.random() - 0.5) * 120,
        vx: (Math.random() - 0.5) * 40,
        vy: roadSpeed * 0.6,
        alt: 0.2 + Math.random() * 3.4,
        valt: Math.random() * 2,
        life: 0.75,
        max: 0.75,
        color: ["#ffffff", "#ffffff", "#ffc4dd", "#bfe8ff"][i],
        size: 5 + Math.random() * 6,
      });
  if (c.boost > 0) trail(c.x + (Math.random() - 0.5) * 50, c.y + ch, "#7ff1ff", 6, 0.45);
  if (fx === "tornado")
    for (let i = 0; i < 3; i++) {
      const a = Game.time * 9 + (i * TAU) / 3;
      Game.particles.push({
        x: c.x + Math.cos(a) * 90,
        y: c.y + Math.sin(a) * 90,
        vx: 0,
        vy: 0,
        alt: 0.6 + i * 1.1,
        valt: 2.5,
        life: 0.5,
        max: 0.5,
        color: "#dfe7ef",
        size: 8,
      });
    }
  if (c.type === "train") {
    Game.smokeIn -= dt;
    if (Game.smokeIn <= 0) {
      Game.smokeIn = 0.14;
      Game.particles.push({
        x: c.x,
        y: c.y - 38,
        vx: (Math.random() - 0.5) * 30,
        vy: roadSpeed * 0.6,
        alt: 3.1,
        valt: 2.8,
        life: 1,
        max: 1,
        color: "#f4f6f8",
        size: 12,
      });
    }
  }
  for (const e of Game.entities) {
    if (e.dead) continue;
    if (e.kind === "patrolActor") continue;
    if (e.kind === "wagon") {
      updateWagon(e, dt, fx);
      continue;
    }
    if (e.tether) {
      updateTether(e, dt);
      continue;
    }
    if (e.pour > 0) {
      e.pour = Math.max(0, e.pour - dt);
      e.y -= (240 + 190 * e.pourTotal) * dt;
      e.alt = 0.6 + 2.8 * Math.sin(Math.PI * e.pour / e.pourTotal);
      continue;
    }
    if (e.kick > 0) {
      movePushed(e, dt, roadSpeed);
      continue;
    }
    if (e.kind === "rival") {
      moveRival(e, dt);
      continue;
    }
    // Своя скорость есть только у машин, остальное лежит на дороге
    const pace =
      e.kind === "traffic" && fx !== "freeze" ? (e.pace ?? 0.72) : 1;
    e.y += (roadSpeed - (1 - pace) * Game.cruise) * dt;
    const ahead = c.y - e.y,
      dx = Math.abs(e.x - c.x);
    if (!done && !airborne && fx === "plow" && (isObstacle(e) || e.kind === "bale") &&
        pushWithBlade(e, ahead, dx)) continue;
    if (e.kind === "bale" || e.kind === "hayCart") continue;
    if (e.kind === "traffic") {
      if (helping && ahead > 170 && ahead < 1800 && dx < 70) giveWay(e);
      if (e.tx !== undefined) {
        const before = e.x;
        e.x = lerp(e.x, e.tx, 1 - Math.exp(-dt * 3.2));
        e.drift = clamp(((e.x - before) / Math.max(dt, 0.001)) * 0.0035, -0.2, 0.2);
      } else e.drift = (e.drift || 0) * Math.exp(-dt * 3);
    }
    if (e.kind === "flyer") {
      e.x += e.vx * dt;
      e.alt = Math.max(0, e.alt + e.valt * dt);
      e.valt -= 15 * dt;
      e.spin += e.spinRate * dt;
      e.fly -= dt;
      if (e.fly <= 0) e.dead = true;
      continue;
    }
    if (e.kind === "gift") {
      e.alt = Math.max(0, e.alt + e.valt * dt);
      if (done) continue;
      if (dx < reach && ahead > 0 && ahead < 640)
        e.x = lerp(e.x, c.x, 1 - Math.exp(-dt * 4.4));
      if (
        Math.abs(e.x - c.x) < cw + 34 &&
        Math.abs(e.y - c.y) < ch + 32 &&
        (e.alt < 3.4 || airborne)
      ) {
        // Подарок: большая звезда, конфетти и через раз ускорение
        e.big = true;
        collect(e);
        confetti(e.x, e.y, 34);
        Sound.gift();
        Game.giftCount = (Game.giftCount || 0) + 1;
        if (Game.giftCount % 2 === 0) hitBoost(e);
      }
      continue;
    }
    if (["ramp", "boost", "star"].includes(e.kind)) {
      if (helping && ahead > 360 && ahead < 2600)
        e.x = lerp(e.x, c.x, 1 - Math.exp(-dt * 1.6));
    }
    if (e.kind === "ramp") {
      if (!done && !e.used && !airborne && dx < 62 && Math.abs(ahead) < 40)
        launchRamp(e);
      continue;
    }
    if (e.kind === "boost") {
      if (!done && !e.used && !airborne && dx < 74 && Math.abs(ahead) < 60)
        hitBoost(e);
      continue;
    }
    if (e.kind === "star") {
      if (done) continue;
      if (e.ring !== undefined) {
        if (Game.loop) {
          e.x = c.x;
          if (Game.loop.theta >= e.ring) collect(e);
        } else if (ahead < -60) e.dead = true;
        continue;
      }
      const magnet =
          (fx === "magnet" || fx === "comet") &&
          Math.hypot(e.x - c.x, e.y - c.y) < 430,
        rescue = fx === "rescue" && Math.hypot(e.x - c.x, e.y - c.y) < 360,
        express = fx === "express" && Math.abs(e.y - c.y) < 300;
      if (magnet || express || rescue) {
        e.x = lerp(e.x, c.x, 1 - Math.exp(-dt * 9));
        e.y = lerp(e.y, c.y, 1 - Math.exp(-dt * 9));
      } else if (!e.air && dx < reach && ahead > 0 && ahead < 640)
        // Лёгкий магнит прощает неточный палец и сильнее помогает после долгой неудачи
        e.x = lerp(e.x, c.x, 1 - Math.exp(-dt * (reach > 100 ? 7 : 3.6)));
      const reachable = !e.air || airborne || magnet || express || rescue;
      if (
        reachable &&
        Math.abs(e.x - c.x) < cw + 20 &&
        Math.abs(e.y - c.y) < ch + 22
      )
        collect(e);
      continue;
    }
    if (done) continue;
    const size = e.kind === "traffic" ? carSize(e.type) : null,
      hit =
        Math.abs(e.x - c.x) < cw + (size ? size.w * 0.36 : 23) &&
        Math.abs(e.y - c.y) < ch + (size ? size.h * 0.36 : 20);
    // Лужа не преграда: суперсилы её не трогают, а брызги — награда
    if (e.kind === "mud" || e.kind === "ice") {
      if (hit && !airborne && !e.used && fx !== "wheelie") splash(e);
      continue;
    }
    if (
      fx === "megahorn" ||
      fx === "wind" ||
      (fx === "siren" && e.kind === "traffic" && dx < 95 && ahead > 0)
    ) {
      if (ahead > -80 && ahead < 1550) {
        e.tx = undefined;
        e.x += (e.x < c.x ? -1 : 1) * dt * (fx === "megahorn" ? 420 : 320);
        e.drift = e.x < c.x ? -0.19 : 0.19;
        if (e.x < 65 || e.x > 535) e.dead = true;
      }
    }
    if (fx === "wave" && ahead > 0 && ahead < (CARS.shark.duration - Game.active) * 540 && ahead < 1050 && !e.washed) {
      e.washed = true;
      e.kick = 1;
      e.pushSide = e.x >= c.x ? 1 : -1;
      burst(e.x, e.y, "#92eaff", 12);
      continue;
    }
    if (fx === "tornado" && ahead > -60 && ahead < 1250) {
      if (e.kind === "cone") launchCone(e);
      else clearObstacle(e, true);
      continue;
    }
    if (fx === "vacuum" && ahead > -40 && ahead < 1020 && dx < 175)
      clearObstacle(e, true);
    // Суперсилы действуют и вплотную, и с запасом на большой скорости
    if (fx === "water" && ahead > -40 && ahead < 1150 && dx < 105)
      clearObstacle(e);
    if (fx === "scoop" && ahead > 0 && ahead < 160 && dx > 67 && dx < 165 && !e.lifted) {
      e.lifted = true;
      e.kick = 1;
      e.pushSide = e.x > c.x ? 1 : -1;
      addStar(Game.distance + ahead, e.x);
      continue;
    }
    if (fx === "harvest" && e.kind === "cone" && ahead > 0 && ahead < 155 && dx < 67)
      clearObstacle(e, true);
    if (fx === "rescue" && Math.hypot(e.x - c.x, e.y - c.y) < 340)
      clearObstacle(e, true);
    if (e.dead || !hit || airborne) continue;
    if (e.kind === "cone") {
      if (fx === "wheelie") addStar(Game.distance + 130, c.x);
      launchCone(e);
    } else if (fx !== "ghost") {
      if (["nitro", "comet", "monster", "rainbow", "freeze", "shield"].includes(fx) || c.boost > 0) {
        clearObstacle(e, fx === "freeze");
        if (fx === "shield") Game.active = 0;
      }
      else if (c.bump <= 0) {
        c.bump = 0.9;
        Game.shake = Math.max(Game.shake, 0.7);
        giveWay(e);
        Sound.boing();
        addRing(c.x, c.y, "#fff1b9", 80);
      }
    }
  }
  for (const p of Game.shots) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.target && !p.target.dead)
      p.x = lerp(p.x, p.target.x, 1 - Math.exp(-dt * 16));
    Game.particles.push({
      x: p.x,
      y: p.y,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60,
      life: 0.55,
      max: 0.55,
      color: CONFETTI_COLORS[Math.floor(Math.random() * 5)],
      size: 4 + Math.random() * 3,
    });
    const hit = Game.entities.find(
      (e) =>
        isObstacle(e) && Math.abs(e.x - p.x) < 62 && Math.abs(e.y - p.y) < 110,
    );
    if (hit && p.life > 0) {
      confetti(hit.x, hit.y, 24);
      clearObstacle(hit, true);
      p.life = 0;
    }
  }
  Game.entities = Game.entities.filter((e) => !e.dead && (e.kind === "patrolActor" || e.y < Game.h + 200));
  Game.shots = Game.shots.filter((p) => p.life > 0 && p.y > c.y - 2200);
  for (const p of Game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 80 * dt;
    if (p.alt !== undefined) {
      p.alt += p.valt * dt;
      p.valt -= 4 * dt;
    }
    p.life -= dt;
  }
  Game.particles = Game.particles.filter((p) => p.life > 0).slice(-300);
  for (const b of Game.birds) {
    b.x += b.vx * dt;
    b.y += (b.vy + roadSpeed) * dt;
    b.alt += b.valt * dt;
    b.life -= dt;
  }
  Game.birds = Game.birds.filter((b) => b.life > 0);
  for (const r of Game.rings) {
    r.r += r.max * dt;
    r.life -= dt;
  }
  Game.rings = Game.rings.filter((r) => r.life > 0);
  for (const h of Game.hooks) {
    h.life -= dt;
    h.tx = h.target.x;
    h.ty = h.target.y;
    if (h.target.dead || !h.target.tether) h.life = 0;
  }
  Game.hooks = Game.hooks.filter((h) => h.life > 0);
  if (Game.runTime > 9) $("steer-hint").style.opacity = "0";
  Game.toast -= dt;
  if (Game.toast <= 0) $("world-toast").classList.remove("show");
  if (!done && !Game.usedPower && Game.runTime > 14 && !Game.spoken.has("power")) {
    Game.spoken.add("power");
    Voice.say("Нажми волшебную кнопку!");
  }
  updateHUD();
  if (!done)
    Sound.engine(
      c.type,
      boost,
      true,
      (roadSpeed / CRUISE_START) * (c.bump > 0 ? 0.8 : 1),
      WORLDS[Game.world].id,
    );
  Music.tick();
  if (Game.demo && Game.runTime >= 4.2) {
    garage();
    $("hero-power").focus({ preventScroll: true });
  }
}
function markSteered() {
  Game.steered = true;
  Game.idle = 0;
  $("steer-hint").style.opacity = "0";
}
function steer(e) {
  const r = canvas.getBoundingClientRect(),
    // На широком экране дорога занимает меньшую долю ширины, палец проходит меньше
    reach = clamp(r.width / r.height / 0.8, 1, 2.2),
    raw = 300 + ((e.clientX - r.left) / r.width - 0.5) * 600 * reach;
  Game.car.tx =
    effect() === "allterrain" ? raw : lerp(raw, nearestLane(raw), 0.35);
  markSteered();
}
canvas.addEventListener("pointerdown", (e) => {
  if (Game.mode !== "drive" || Game.paused || Game.finished || e.button > 0)
    return;
  e.preventDefault();
  Sound.unlock();
  // Рулит последний палец: забытая на экране ладонь не блокирует управление
  Game.pointer = e.pointerId;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {}
  steer(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (Game.pointer === e.pointerId) {
    e.preventDefault();
    steer(e);
  }
});
function release(e) {
  if (Game.pointer === e.pointerId) {
    Game.pointer = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", release);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
// Кнопки поездки срабатывают сразу на касание: на iPad click от второго пальца не приходит
function pressButton(id, action) {
  $(id).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  });
  $(id).addEventListener("click", (e) => {
    if (e.detail === 0) action();
  });
}
pressButton("btn-power", activatePower);
pressButton("btn-horn", honk);
pressButton("btn-pause", pause);
// Домой можно в любой момент: собранные звёзды уже записаны в копилку
pressButton("btn-home", garage);
$("btn-play").addEventListener("click", startDrive);
$("btn-mission").addEventListener("click", () => startDrive("mission"));
$("hero-power").addEventListener("click", () => startDrive("demo"));
pressButton("btn-brake", episodeAction);
$("tune-wheels").addEventListener("click", nextRims);
$("tune-beacon").addEventListener("click", toggleBeacon);
$("btn-garage").addEventListener("click", garage);
$("btn-resume").addEventListener("click", resume);
$("btn-next").addEventListener("click", nextRun);
$("btn-finish-garage").addEventListener("click", garage);
function syncSound() {
  Sound.setOn(save.sound);
  Sound.setLevels(save.musicLevel, save.effectsLevel);
  document.querySelectorAll(".sound-button").forEach((b) => {
    b.classList.toggle("off", !save.sound);
    b.textContent = save.sound ? "🔊" : "🔇";
    b.setAttribute(
      "aria-label",
      save.sound ? "Выключить звук" : "Включить звук",
    );
    b.setAttribute("aria-pressed", String(save.sound));
  });
  if (!save.sound) Voice.stop();
}
document.querySelectorAll(".sound-button").forEach((b) =>
  b.addEventListener("click", () => {
    if (!Game.paused) Sound.unlock();
    save.sound = !save.sound;
    syncSound();
    store();
    if (!Game.paused) Sound.tap();
  }),
);
const DIRS = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
};
// В гараже стрелки выбирают машину, Enter и пробел запускают поездку
function garageKeys(e) {
  if (e.code === "Enter" || e.code === "Space") {
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.matches("button,a,input"))
      return;
    e.preventDefault();
    startDrive();
    return;
  }
  const cards = [...document.querySelectorAll(".car-card")],
    columns = cards.filter((c) => c.offsetTop === cards[0].offsetTop).length,
    step = {
      left: -1,
      right: 1,
      up: -columns,
      down: columns,
    }[DIRS[e.code]];
  if (!step) return;
  e.preventDefault();
  const index = cards.findIndex((c) => c.dataset.car === save.car),
    next = cards[clamp(index + step, 0, cards.length - 1)];
  Sound.unlock();
  if (next.dataset.car !== save.car) {
    Sound.tap();
    selectCar(next.dataset.car, true);
  }
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest" });
}
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$("dialog-backdrop").hidden && e.code === "Tab") {
    const buttons = [...$("dialog-backdrop").querySelectorAll("input,button")],
      first = buttons[0],
      last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
    return;
  }
  if (e.target?.type === "range") return;
  if (e.code === "KeyM" && !e.repeat) {
    document.querySelector(".sound-button").click();
    return;
  }
  if (Game.mode !== "drive") {
    garageKeys(e);
    return;
  }
  if (Game.finished) return;
  if (e.code === "KeyB") {
    if (!e.repeat) episodeAction();
    return;
  }
  if (DIRS[e.code]) {
    e.preventDefault();
    if (!Game.paused) {
      const dir = DIRS[e.code];
      // Короткое нажатие — ровно одна полоса
      if (!e.repeat && (dir === "left" || dir === "right")) {
        const index = LANES.indexOf(nearestLane(Game.car.tx));
        Game.car.tx = LANES[clamp(index + (dir === "left" ? -1 : 1), 0, 2)];
      }
      markSteered();
      Game.keys.add(dir);
    }
    return;
  }
  if (e.code === "Space") {
    if (Game.paused) return;
    e.preventDefault();
    if (!e.repeat) activatePower();
    return;
  }
  if (e.repeat) return;
  if (e.code === "KeyH") honk();
  if (e.code === "KeyP" || e.code === "Escape") {
    e.preventDefault();
    if (Game.paused) resume();
    else pause();
  }
});
window.addEventListener("keyup", (e) => {
  if (DIRS[e.code]) Game.keys.delete(DIRS[e.code]);
});
window.addEventListener("blur", () => {
  clearInput();
  pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
    pause();
    Voice.stop();
    if (Sound.ctx) Sound.ctx.suspend().catch(() => {});
  }
});
// На iPad панель Safari дёргает высоту при поездке: палец сбрасываем только при повороте
let screenWidth = innerWidth;
window.addEventListener("resize", () => {
  if (innerWidth !== screenWidth) clearInput();
  screenWidth = innerWidth;
  if (window.driveView) driveView.dirty = true;
  if (Game.mode === "garage") paintCards();
});
let last = performance.now(),
  garageFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.max((now - last) / 1000, 0);
  const dt = Math.min(elapsed, 0.15);
  last = now;
  if (document.hidden) return;
  if (Game.mode === "drive") {
    if (!Game.paused) {
      driveView.adapt(elapsed);
      const steps = Math.max(1, Math.ceil(dt / 0.035));
      for (let i = 0; i < steps; i++) update(dt / steps);
    }
    if (Game.mode === "drive" && (!Game.paused || driveView.dirty)) {
      driveView.drive(Game, effect(), dt);
      driveView.dirty = false;
    }
  } else {
    Game.time += dt;
    if (window.driveView?.ready) {
      if (thumbQueue.length) paintNextThumb();
      // Машина медленно крутится сама, пока её не трогают
      if (!orbitDrag) driveView.yaw += dt * 0.3;
      if (now - garageFrame > 33) {
        paintHero();
        garageFrame = now;
      }
    }
  }
}
let orbitDrag = null;
const orbit = $("hero-car");
orbit.addEventListener("pointerdown", (e) => {
  if (orbitDrag || !window.driveView?.ready) return;
  orbitDrag = { id: e.pointerId, x: e.clientX };
  orbit.setPointerCapture(e.pointerId);
});
orbit.addEventListener("pointermove", (e) => {
  if (orbitDrag?.id !== e.pointerId) return;
  driveView.yaw -= (e.clientX - orbitDrag.x) * 0.014;
  orbitDrag.x = e.clientX;
  garageFrame = 0;
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  orbit.addEventListener(event, () => {
    orbitDrag = null;
  });
function syncCameraButton() {
  $("btn-camera").setAttribute(
    "aria-label",
    save.farCamera ? "Приблизить камеру" : "Отдалить камеру",
  );
  $("btn-camera").setAttribute("aria-pressed", String(save.farCamera));
}
$("btn-camera").addEventListener("click", () => {
  save.farCamera = !save.farCamera;
  driveView.far = save.farCamera;
  driveView.dirty = true;
  store();
  syncCameraButton();
});
for (const [id, key] of [
  ["music-level", "musicLevel"],
  ["effects-level", "effectsLevel"],
]) {
  const slider = $(id);
  slider.value = Math.round(save[key] * 100);
  slider.addEventListener("input", () => {
    save[key] = Number(slider.value) / 100;
    Sound.setLevels(save.musicLevel, save.effectsLevel);
    store();
  });
}
// Загрузка 3D: гараж уже виден, кнопка «Поехали» наполняется по мере загрузки
window.addEventListener("bibika-progress", (e) => {
  $("btn-play").style.setProperty("--load", `${Math.round(e.detail * 100)}%`);
});
// Подробная модель пришла позже: в гараже заменяем сразу, из поездки — по возвращении
let detailWaiting = false;
function applyDetail() {
  detailWaiting = false;
  driveView.refreshDetail();
  paintCards();
}
window.addEventListener("bibika-detail", () => {
  if (Game.mode === "garage") applyDetail();
  else detailWaiting = true;
});
window.addEventListener("bibika-ready", () => {
  driveView.paintOf = paintSpec;
  driveView.rimOf = rimColor;
  driveView.beaconOf = (type) => !!save.beacon[type];
  syncTune();
  $("btn-play").disabled = false;
  $("btn-play").style.setProperty("--load", "100%");
  $("load-status").hidden = true;
  paintCards();
});
// Бесплатный тариф Netlify добавляет плашку в правый нижний угол: кнопки ставим выше неё
function noteHostBadge() {
  document.body.classList.toggle(
    "host-badge",
    !!document.querySelector("script[data-nf-variant], #nl-badge-frame"),
  );
}
noteHostBadge();
window.addEventListener("load", noteHostBadge);
buildGarage();
syncSound();
requestAnimationFrame(frame);
// Офлайн-кэш доступен на HTTPS и localhost.
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" ||
    ["localhost", "127.0.0.1"].includes(location.hostname))
)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
