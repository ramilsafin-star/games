// Все числа игры в одном месте. Перенесены из сетевой версии игры (см. README);
// что поменяно для одного игрока с помощниками-ботами, помечено «web:».
// Этот файл без three.js: его же читает проверка в Node (tests/sim.mjs).

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Лагерь и костёр в центре карты (x, z)
export const CAMP = { x: 0, z: 0 };
export const DEPOSIT_RADIUS = 9; // рядом с костром светлячки сами вылетают из банки и отдают ему свет

// Забег: сумерки → 5 ночей с передышками → рассвет
export const NIGHTS = 5;
export const DUSK_SECONDS = 20; // сумерки перед первой ночью (в сетевой версии — лобби)
export const NIGHT_SECONDS = 100;
export const BREAK_SECONDS = 8; // передышка между ночами
export const END_SECONDS = 4.5; // web: рассвет или погасший костёр на экране, потом итоги

// Свет костра 0..100, от него радиус безопасного круга
export const START_LIGHT = 60;
export const MAX_LIGHT = 100;
export const RADIUS_MIN = 12;
export const RADIUS_MAX = 46;
// площадь круга растёт вместе со светом, поэтому у нуля круг сжимается быстро
export function radius(light) {
  const k = clamp(light / MAX_LIGHT, 0, 1);
  return Math.sqrt(RADIUS_MIN * RADIUS_MIN + (RADIUS_MAX * RADIUS_MAX - RADIUS_MIN * RADIUS_MIN) * k);
}

// Сколько света в секунду гаснет в ночь n: 0.55, 0.75, 0.95, 1.15, 1.35 — как в сетевой версии.
// В сетевой версии каждый лишний игрок добавлял 45%; web: помощник ловит медленнее живого игрока
// и чаще застывает, поэтому каждый добавляет 15% (подобрано проверкой tests/sim.mjs).
export const CREW_DECAY = 0.15;
export const DECAY_STEP = 0.18; // web: прибавка за ночь (в сетевой версии 0.2): 0.55, 0.73, 0.91, 1.09, 1.27
export function decay(night, crew) {
  const base = 0.55 + DECAY_STEP * (night - 1);
  return base * (1 + CREW_DECAY * Math.max(0, crew));
}

// Светлячки: light — свет костру, coins — сияние за сдачу в костёр, rate — сияние в секунду в саду.
// web: rate — четверть ставки сетевой версии (0.1, 0.25, 0.4, 0.6, 0.9, 1.5, 3). С полной ставкой сад из
// мутантов окупал весь магазин за полчаса игры (tests/sim.mjs), и забег переставал что-то значить.
export const FIREFLIES = [
  { id: "spark", color: "#ffd03c", light: 9, coins: 2, rate: 0.025, size: 0.7 },
  { id: "wisp", color: "#46a0ff", light: 16, coins: 5, rate: 0.0625, size: 0.85 },
  { id: "ember", color: "#ff542c", light: 20, coins: 8, rate: 0.1, size: 0.9 },
  { id: "rose", color: "#ff5ab9", light: 26, coins: 12, rate: 0.15, size: 1.0 },
  { id: "moss", color: "#46eb64", light: 34, coins: 18, rate: 0.225, size: 1.05 },
  { id: "star", color: "#e1fffa", light: 45, coins: 30, rate: 0.375, size: 1.2 },
  { id: "moon", color: "#a078ff", light: 60, coins: 60, rate: 0.75, size: 1.35 },
];
export const FIREFLY_BY_ID = Object.fromEntries(FIREFLIES.map((f) => [f.id, f]));

// Мутации: шанс в процентах (ночью растёт), множители ценности и света, размер. Сначала самая редкая.
export const MUTATIONS = [
  { id: "rainbow", chance: 0.7, value: 10, light: 3, scale: 1.3 },
  { id: "golden", chance: 2.5, value: 4, light: 2, scale: 1.15 },
  { id: "giant", chance: 6, value: 2, light: 1.5, scale: 1.7 },
];
export const MUTATION_BY_ID = Object.fromEntries(MUTATIONS.map((m) => [m.id, m]));
export const BOOK_MUTATIONS = ["none", "giant", "golden", "rainbow"];
export const MUTATION_NIGHT_BONUS = 0.5; // ночь 5 — мутации втрое чаще
// цвет кольца мутации (у радужной — все цвета по кругу)
export const RING = { giant: "#96ffaa", golden: "#ffc428", rainbow: "#ffffff" };

// Постройки на участке (costs — цена 1-й, 2-й… постройки; сколько цен, столько и построек).
// web: первые два домика по 50, как в сетевой версии; дальше цены примерно вшестеро выше (в сетевой версии 300,
// 1200, 4500 · столбы 400/2000/8000 · цветники 600/3500 · кормушки 500/3000): иначе всё
// покупалось за первый час (tests/sim.mjs).
export const BUILDINGS = [
  { id: "house", costs: [50, 50, 1500, 6000, 25000], slots: 3, rate: 0.1 },
  { id: "lamp", costs: [2500, 12000, 45000], bonus: 0.2 },
  { id: "flowers", costs: [3500, 20000], seconds: 300 },
  { id: "feeder", costs: [3000, 18000], hours: 4 },
];
export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
export const START_COINS = 100; // новичку — ровно на два первых домика
export const QUEST_HOUSES = 2;

// Сад. web: участок один (свой), поэтому он крупнее и стоит ближе к костру, чем шесть участков в сетевой версии
export const GARDEN = {
  angle: 128, // градусы: с какой стороны от костра
  distance: 25,
  size: 7.5, // радиус лужайки
  enterRadius: 6.5, // вошёл — банка пустеет в сад
  offlineShare: 0.25, // без игрока сад светит в четверть силы
  offlineHours: 4,
};
{
  const a = (GARDEN.angle * Math.PI) / 180;
  GARDEN.x = CAMP.x + Math.cos(a) * GARDEN.distance;
  GARDEN.z = CAMP.z + Math.sin(a) * GARDEN.distance;
}

// Улучшения: значения по уровням и цены перехода
// web: цены выше, как у построек (в сетевой версии банка 150/600/2500/8000, ботинки 120/500/2000/7000)
export const UPGRADES = [
  { id: "jar", levels: [3, 4, 5, 6, 7], costs: [800, 3500, 14000, 45000] },
  { id: "boots", levels: [16, 17.5, 19, 20.5, 22], costs: [700, 3000, 12000, 40000] },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Чем дальше от лагеря, тем реже и ценнее светлячки
export const RARITY_BANDS = [
  { upTo: 85, weights: { spark: 78, wisp: 15, ember: 7 } },
  { upTo: 130, weights: { spark: 50, wisp: 26, ember: 12, rose: 9, moss: 3 } },
  { upTo: Infinity, weights: { spark: 34, wisp: 30, ember: 12, rose: 14, moss: 6, star: 3.3, moon: 0.7 } },
];

export const FOREST_MIN = 54;
export const FOREST_MAX = 185;
export const MAP_RADIUS = 196; // дальше не пускают холмы
export const WILD_BASE = 26;
export const WILD_PER = 4; // на каждого в команде (игрок и помощники)
export const WILD_MAX = 50;
export const CATCH_DISTANCE = 10;

// Тени: в погоне медленнее игрока (16), лагерь не сторожат, бродят между местами в лесу
export const SHADOW = {
  base: 1,
  perNight: 1.25,
  perCrew: 0.4, // web: в сетевой версии 0.7 на каждого лишнего игрока
  max: 13,
  roamSpeed: 4.5,
  speed: 8,
  speedPerNight: 0.6,
  lungeSpeed: 14,
  lungePerNight: 0.4,
  aggroPerNight: 1.5,
  lungeRange: 8,
  lungeTime: 0.6,
  lungeCooldown: 3.5,
  catchDistance: 3.6,
  aggroRange: 38,
  loseRange: 60,
  roamRadius: 18,
  restMin: 4,
  restMax: 9,
  graceSeconds: 3, // после съеденного зефира тени не трогают игрока
};
export function shadowCount(night, crew) {
  const s = SHADOW;
  return Math.min(s.max, Math.floor(s.base + s.perNight * night + s.perCrew * Math.max(0, crew)));
}
export const SHADOW_KINDS = {
  shadow: { scale: 1, speed: 1, reach: 1, eye: "#c8b4ff" },
  imp: { scale: 0.6, speed: 1.35, reach: 0.9, eye: "#78ffa0", fromNight: 2, share: 0.3 },
  brute: { scale: 1.7, speed: 0.62, reach: 1.7, eye: "#ffa03c", fromNight: 3, share: 0.2 },
};

// Места в лесу: тени ходят между ними, у каждого постамент с усилением
export const PLACES = [
  { id: "mushrooms", angle: 20, distance: 95 },
  { id: "pond", angle: 92, distance: 120 },
  { id: "stones", angle: 165, distance: 100 },
  { id: "oak", angle: 237, distance: 135 },
  { id: "crystals", angle: 308, distance: 110 },
];
for (const p of PLACES) {
  const a = (p.angle * Math.PI) / 180;
  p.x = CAMP.x + Math.cos(a) * p.distance;
  p.z = CAMP.z + Math.sin(a) * p.distance;
}
export const PLACE_RADIUS = 16;

// Зефир у костра: тень съедает его вместо того, чтобы заморозить
export const FOOD = { max: 2, cookSeconds: 2.5, reach: 12 };

// Застывший: друг размораживает фонарём, иначе через FREEZE_SECONDS — в лагерь
export const FREEZE_SECONDS = 12;
export const THAW_HOLD = 1.2;
export const THAW_REACH = 9;

// Большая тень в последнюю ночь; dps — от 1, 2 и 3+ фонарей рядом
export const BOSS = { hp: 100, speed: 5, drain: 3.5, reach: 16, dps: [8, 20, 34], reward: 25, spawn: 150, at: 0.35 };

// Награды
export const REWARD_PER_NIGHT = 15;
export const REWARD_DAWN = 50;
export const DAILY = { base: 20, maxStreak: 7 };
export const STARTER_DISTANCE = 26;
export const QUEST_REWARD = 60;
export const INDEX_BONUS = 10; // новая запись в коллекции: 10 + тройная цена светлячка

// Усиления у лесных мест
export const BUFFS = {
  speed: { seconds: 60, color: "#ff78be", bonus: 4 },
  luck: { seconds: 90, color: "#96cdff", giant: 20, golden: 9, rainbow: 3 },
  ward: { seconds: 40, color: "#b48cff" },
  wood: { seconds: 60, color: "#ffb464", team: true, decay: 0.5 },
  double: { seconds: 75, color: "#78e6ff", coins: 2 },
};
export const SHRINES = {
  mushrooms: { buff: "speed", cost: 30 },
  pond: { buff: "luck", cost: 50 },
  stones: { buff: "ward", cost: 40 },
  oak: { buff: "wood", cost: 45 },
  crystals: { buff: "double", cost: 40 },
};
export const SHRINE_COOLDOWN = 45;
export const SHRINE_REACH = 11;
// постамент стоит сбоку от середины места, ближе к лагерю (как в Shrines.luau)
for (const p of PLACES) {
  const dx = CAMP.x - p.x, dz = CAMP.z - p.z;
  const l = Math.hypot(dx, dz);
  const tx = dx / l, tz = dz / l;
  p.shrineX = p.x + tx * (PLACE_RADIUS - 5) + -tz * 10;
  p.shrineZ = p.z + tz * (PLACE_RADIUS - 5) + tx * 10;
}

// Случайные события ночи: со второй ночи, на ночах 4–5 их два
export const EVENTS = {
  fromNight: 2,
  twoFromNight: 4,
  from: 0.15,
  to: 0.55,
  kinds: {
    wind: { seconds: 20, decay: 1.8, weight: 3 }, // web: 1.8 (в сетевой версии 2.2 — там костёр кормят до 6 игроков)
    hungry: { seconds: 30, extra: 2, speed: 1.2, weight: 3 },
    fog: { seconds: 35, aggro: 1.5, weight: 3 },
    starfall: { seconds: 25, count: 7, weight: 2 },
  },
};

// web: помощники вместо других игроков (1–3). Ловят сами, кормят костёр, размораживают и
// идут на Большую тень. Чуть медленнее игрока, банка на 3.
export const CREW = [
  { id: "fox", speed: 14.5, jar: 3, color: "#ff8a3c" },
  { id: "bunny", speed: 15, jar: 3, color: "#f4efe8" },
  { id: "bear", speed: 13.5, jar: 3, color: "#a8714a" },
];
export const CREW_MAX = 3;

// Награды за ролик (только по кнопке, только в VK)
export const AD = { snackBonus: 1 }; // «зефир в дорогу»: +1 зефир на старте (сверх обычных двух)

// ---------- Светлячок: запись { k: вид, m: мутация, s: размер } ----------
export const kindOf = (rec) => FIREFLY_BY_ID[rec.k] || FIREFLY_BY_ID.spark;
export const mutOf = (rec) => MUTATION_BY_ID[rec.m];
export function fireflyRate(rec) {
  const m = mutOf(rec);
  return kindOf(rec).rate * (m ? m.value : 1) * rec.s;
}
export function fireflyLight(rec) {
  const m = mutOf(rec);
  return kindOf(rec).light * (m ? m.light : 1);
}
export function fireflyCoins(rec) {
  const m = mutOf(rec);
  return Math.max(1, Math.floor(kindOf(rec).coins * (m ? m.value : 1) * rec.s + 0.5));
}
export function fireflyScale(rec) {
  const m = mutOf(rec);
  return kindOf(rec).size * (m ? m.scale : 1) * rec.s;
}
export const bookKey = (rec) => rec.k + ":" + rec.m;
export const isRare = (rec) => rec.m !== "none" || rec.k === "star" || rec.k === "moon";
export const BOOK_TOTAL = FIREFLIES.length * BOOK_MUTATIONS.length; // 28

// ---------- Случайные числа с зерном (одинаковый лес у всех, повторяемые проверки) ----------
export function makeRng(seed = 1) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}
