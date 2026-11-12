// Правила «Патруля рифа» без графики: их можно гонять в Node (см. tests/sim.mjs).
// Три режима:
//  • «Экспедиция» — двенадцать глубин: на 4-й ждёт Клешня-великан, на 8-й — Черепаха-крепость, на 12-й — Кракен-9.
//    После глубин 2, 4, 6, 8, 10 — док: один модуль из трёх случайных. После гибели глубину можно начать заново.
//  • «Бездна» — бесконечное погружение после экспедиции: глубины собираются сами, каждая четвёртая — босс.
//  • «Рейс дня» — шесть глубин, одинаковых для всех в этот день, и особое правило дня.
// packs — стаи: роботы одной стаи (через пробел) приходят вместе, между стаями пауза gap секунд.
// У глубины с боссом стаи — это подмога: приходят по кругу, пока босс жив.
// theme — оформление (номер в THEMES у view.js), rain — посреди глубины идёт жемчужный дождь.
export const DEPTHS = [
  { name: "Коралловый сад", theme: 0, gap: 2.3, packs: ["crab", "crab", "jelly", "crab crab", "chest", "jelly", "crab crab", "jelly jelly", "crab", "crab crab jelly", "jelly crab", "crab crab", "jelly jelly crab"] },
  { name: "Фиолетовый каньон", theme: 1, gap: 2.25, packs: ["jelly", "mine mine", "crab crab", "jelly jelly", "mine crab", "chest", "crab crab jelly", "mine mine", "jelly mine", "crab crab crab", "jelly jelly mine", "mine crab crab", "jelly jelly jelly"] },
  { name: "Светящаяся пещера", theme: 2, gap: 2.2, rain: true, packs: ["crab crab", "puffer", "jelly mine", "crab crab crab", "puffer puffer", "chest", "jelly jelly", "mine mine crab", "puffer crab crab", "jelly jelly jelly", "puffer mine", "crab crab jelly", "puffer puffer jelly", "mine mine"] },
  { name: "Клешня-великан", theme: 3, boss: "titan", gap: 6.5, packs: ["crab crab", "jelly", "mine mine", "chest"] },
  { name: "Затонувший корабль", theme: 4, gap: 2.2, packs: ["eel", "crab crab jelly", "puffer mine", "chest", "eel jelly", "crab crab crab", "mine mine jelly", "eel puffer", "crab crab jelly jelly", "puffer puffer", "eel mine mine", "jelly jelly crab", "eel crab crab", "puffer jelly jelly", "crab crab crab jelly", "eel puffer"] },
  { name: "Тёмная впадина", theme: 5, gap: 2.15, packs: ["ray", "mine mine mine", "eel jelly", "puffer puffer crab", "chest", "ray jelly", "jelly jelly mine", "eel eel", "crab crab crab mine", "ray puffer", "mine mine eel", "crab crab puffer", "ray jelly jelly", "eel puffer mine", "puffer puffer jelly", "ray crab crab"] },
  { name: "Сад медуз", theme: 6, gap: 2.15, rain: true, packs: ["jelly jelly jelly", "star crab crab", "eel puffer", "chest", "jelly jelly mine mine", "star jelly jelly", "puffer puffer jelly", "eel eel jelly", "ray jelly", "star crab crab crab", "mine mine mine", "puffer eel jelly jelly", "ray crab crab", "jelly jelly jelly jelly", "star jelly jelly", "eel eel"] },
  { name: "Черепаха-крепость", theme: 7, boss: "turtle", gap: 6.8, packs: ["jelly jelly", "eel", "chest", "crab crab crab", "ray"] },
  { name: "Ледяной грот", theme: 8, gap: 2.1, packs: ["ray ray", "star jelly jelly", "crab crab crab", "chest", "eel puffer", "mine mine mine", "star crab crab puffer", "ray jelly", "eel eel", "jelly jelly jelly mine", "puffer puffer ray", "star eel jelly", "crab crab crab crab", "ray mine mine", "star puffer jelly", "ray ray jelly"] },
  { name: "Вулканические трубы", theme: 9, gap: 2.05, rain: true, packs: ["puffer puffer", "eel eel", "mine mine mine crab", "chest", "ray ray", "star puffer puffer", "crab crab crab crab", "eel jelly jelly", "ray mine mine", "star jelly jelly jelly", "puffer eel mine", "crab crab ray", "eel eel puffer", "star crab crab crab", "ray puffer puffer", "mine mine jelly jelly"] },
  { name: "Жемчужный город", theme: 10, gap: 2.0, packs: ["star crab crab crab", "eel eel", "ray ray", "chest", "puffer puffer jelly", "mine mine mine mine", "star jelly jelly eel", "ray puffer crab", "eel eel jelly", "crab crab crab mine mine", "star puffer puffer", "ray ray jelly", "jelly jelly jelly jelly", "eel puffer puffer", "star eel eel", "ray crab crab crab"] },
  { name: "Логово Кракена", theme: 11, boss: "boss", gap: 7.5, packs: ["jelly", "eel", "puffer", "chest", "mine mine", "ray", "crab crab"] },
];
const UPGRADE_AFTER = new Set([2, 4, 6, 8, 10]);
// После этих глубин экспедиции — бонусный этап «Жемчужное течение»: роботов нет, жемчуг плывёт потоком
const BONUS_AFTER = new Set([3, 7, 10]);
const BONUS_TIME = 24;
export const THEME_COUNT = 12;
export const BOSSES = ["titan", "turtle", "boss"];

// hit — урон при столкновении; sturdy — от столкновения сам не гибнет; calm — не враг (не мешает пройти глубину)
const UNITS = {
  crab: { hp: 25, radius: 0.96, points: 60, hit: 15 },
  jelly: { hp: 31, radius: 0.97, points: 85, hit: 12 },
  mine: { hp: 24, radius: 0.82, points: 100, hit: 23 },
  // ёж подплывает, раздувается и лопается кольцом зарядов; сбитый издалека не стреляет
  puffer: { hp: 34, radius: 0.92, points: 110, hit: 14 },
  // угорь выбирает ряд, предупреждает полосой и проносится через всю арену
  eel: { hp: 40, radius: 0.85, points: 130, hit: 18, sturdy: true },
  // скат скользит поперёк арены и роняет пузыри-ловушки
  ray: { hp: 40, radius: 1.0, points: 125, hit: 16 },
  bubble: { hp: 5, radius: 0.55, points: 15, hit: 10 },
  // морская звезда держится позади и закрывает щитом троих соседей: пока она цела, их не пробить
  star: { hp: 44, radius: 0.92, points: 150, hit: 12 },
  // сундучок-поплавок — не враг: собьёшь — выпадет бонус
  chest: { hp: 16, radius: 0.85, points: 40, hit: 0, calm: true },
  titan: { hp: 920, radius: 1.75, points: 600, hit: 22, sturdy: true },
  turtle: { hp: 1180, radius: 2.0, points: 800, hit: 22, sturdy: true },
  boss: { hp: 1400, radius: 2.3, points: 1000, hit: 25, sturdy: true },
};
export const LARGE = { titan: true, turtle: true, boss: true };

// Модули: что каждый меняет у субмарины. Брать можно повторно, эффекты складываются.
export const MODULES = ["rapid", "armor", "twin", "magnet", "pulse", "engine", "torpedo", "bubble"];
// Бонусы из сундучков: тройной залп, пузырь-щит, торпеды, заморозка, ремонт
export const POWERS = ["spread", "bubble", "torpedo", "freeze", "repair"];
// Правило «Рейса дня»: одно на весь день
export const RULES = {
  puffers: "Ежиный день: в стаях больше рыб-ежей",
  pearls: "Жемчужный день: жемчуг падает вдвое чаще",
  speedy: "Быстрая вода: роботы шустрее, очки ×1.3",
  glass: "Стеклянный корпус: прочность 60, лазер сильнее, очки ×1.5",
  swarm: "Рой: роботов больше, но они слабее",
  chests: "Сундучный день: бонусы на каждом шагу",
};

export const PULSE_RADIUS = 8.8;
const PULSE_INTERVAL = 7.5;
const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

// Генератор случайных чисел по зерну: «Рейс дня» одинаков у всех, Бездна — своя у каждого рейса
export function seeded(seed) {
  seed = seed >>> 0 || 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
// Номер дня (YYYYMMDD) — зерно «Рейса дня»
export function dayCode(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
export function dailyRule(code) {
  const keys = Object.keys(RULES);
  return keys[seeded(code * 31 + 7)() * keys.length | 0];
}

const ABYSS_NAMES = ["Синяя бездна", "Шёпот течений", "Сумрачный риф", "Колодец звёзд", "Холодный разлом", "Тихие руины", "Дно без дна", "Огни глубины"];
// Глубина Бездны или «Рейса дня»: n — сложность, theme — оформление, met — сколько боссов уже было в рейсе
export function makeDepth(n, random, rule = null, met = 0) {
  const bossTurn = n % 4 === 0;
  const theme = (n - 1) % THEME_COUNT;
  if (bossTurn) {
    const boss = BOSSES[met % 3];
    const help = ["crab crab", "jelly jelly", "chest", "eel", "mine mine", "ray"].slice(0, 3 + Math.min(3, n / 8 | 0));
    return { name: { titan: "Клешня-великан", turtle: "Черепаха-крепость", boss: "Кракен-9" }[boss], theme, boss, gap: 6.5, packs: help };
  }
  const pool = ["crab", "jelly"];
  if (n >= 2) pool.push("mine");
  if (n >= 3) pool.push("puffer");
  if (n >= 5) pool.push("eel");
  if (n >= 6) pool.push("ray");
  if (n >= 7) pool.push("star");
  const count = 10 + Math.min(5, n >> 1) + (rule === "swarm" ? 4 : 0);
  const packs = [];
  for (let i = 0; i < count; i++) {
    const size = 1 + Math.floor(random() * Math.min(4, 1 + n / 3));
    const kinds = [];
    for (let k = 0; k < size; k++) kinds.push(pool[Math.floor(random() * pool.length)]);
    // звёзд и скатов в одной стае не больше одной
    const once = new Set();
    const pack = kinds.filter(kind => (kind === "star" || kind === "ray") ? !once.has(kind) && once.add(kind) : true);
    if (rule === "puffers" && random() < 0.5) pack.push("puffer");
    if (rule === "swarm") pack.push(pool[Math.floor(random() * 2)]);
    packs.push(pack.join(" "));
  }
  packs.splice(3 + Math.floor(random() * 4), 0, "chest");
  if (rule === "chests") packs.splice(8, 0, "chest"), packs.push("chest");
  const name = ABYSS_NAMES[Math.floor(random() * ABYSS_NAMES.length)];
  return { name, theme, gap: Math.max(1.6, 2.05 - n * 0.02), packs, rain: n % 3 === 0 };
}

export class Patrol {
  constructor(random = Math.random) {
    this.random = random;
    this.bounds = { x: 5.2, near: 9, far: -10 };
    // постоянные улучшения из мастерской (по уровням): корпус, лазер, импульс, магнит, удача
    this.perks = { hull: 0, laser: 0, pulse: 0, magnet: 0, luck: 0 };
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.kind = "campaign"; // campaign | abyss | daily
    this.rule = null; // правило «Рейса дня»
    this.wave = 0;
    this.time = 0;
    this.score = 0;
    this.destroyed = 0;
    this.collected = 0;
    this.powered = 0; // сколько бонусов подобрано
    this.combo = 0;
    this.comboUntil = 0;
    this.bestCombo = 0;
    this.retries = 0;
    this.clean = 0; // глубин без единой пробоины
    this.ease = 0; // сколько раз подряд игрок погиб на этой глубине: с каждым разом роботы слабее
    this.modules = []; // взятые модули по порядку
    this.bosses = 0; // сколько боссов уже встретилось в рейсе
    this.serial = 0;
    this.depth = null;
    this.theme = 0;
    this.freeze = 0; // бонус «заморозка»: роботы и их заряды медленнее
    this.damaged = false; // была ли пробоина на этой глубине
    this.rainAt = Infinity;
    this.rainLeft = 0;
    this.bonus = null; // идёт «Жемчужное течение»
    this.bonusDue = false;
    this.perfect = 0; // сколько течений собрано идеально
    const k = this.perks;
    const hull = 100 + k.hull * 10;
    this.player = {
      x: 0, z: 6.5, vx: 0, vz: 0, yaw: 0, health: hull, maxHealth: hull,
      cooldown: 0, protection: 0, pulseShield: 0, nextShot: 0, interval: 0.29,
      barrels: 1, magnet: 0, pulseRate: 1 - k.pulse * 0.06, pulsePower: 1, speed: 1,
      laser: 1 + k.laser * 0.06, reach: k.magnet * 0.5, luck: 0.035 + k.luck * 0.03,
      spread: 0, bubble: 0, bubbleMax: 0, bubbleIn: 0, torpedoes: 0, torpedoIn: 0,
    };
    this.beam = null;
    this.lanes = []; // полосы, по которым вот-вот пронесётся угорь или великан
    this.links = []; // лучи щита от морских звёзд к соседям
    this.offer = [];
    this.queue = [];
    this.enemies = [];
    this.shots = [];
    this.pearls = [];
    this.capsules = [];
    this.events = [];
  }

  // kind: campaign | abyss | daily; seed — зерно для Бездны и «Рейса дня»
  start(kind = "campaign", seed = 0) {
    this.reset();
    this.kind = kind;
    if (kind !== "campaign") this.levels = seeded(seed || (this.random() * 4294967296) >>> 0);
    if (kind === "daily") {
      this.rule = dailyRule(seed);
      if (this.rule === "glass") {
        this.player.maxHealth = this.player.health = 60;
        this.player.laser *= 1.35;
      }
    }
    this.nextWave();
  }

  // Продолжение экспедиции с дока: глубина, модули и счёт из сохранения
  resume(wave, modules, score) {
    this.start("campaign");
    this.events.length = 0;
    this.queue.length = 0;
    for (const kind of modules) if (MODULES.includes(kind)) this.applyModule(kind);
    this.score = score;
    this.wave = Math.max(0, Math.min(DEPTHS.length - 1, wave - 1));
    this.player.health = this.player.maxHealth;
    this.nextWave();
  }

  // Сложность глубины: «Рейс дня» начинается сразу с третьей, Бездна — с пятой
  offset() {
    return this.kind === "daily" ? 2 : this.kind === "abyss" ? 4 : 0;
  }
  tier() {
    return this.wave + this.offset();
  }

  // Последняя глубина режима (у Бездны её нет)
  last() {
    return this.kind === "campaign" ? DEPTHS.length : this.kind === "daily" ? 6 : Infinity;
  }

  dockAfter(wave) {
    if (this.kind === "campaign") return UPGRADE_AFTER.has(wave);
    // в Бездне док реже: раз в три глубины
    return wave % (this.kind === "abyss" ? 3 : 2) === 0;
  }

  nextWave() {
    const n = this.wave + 1;
    const depth = this.kind === "campaign" ? DEPTHS[this.wave] : makeDepth(n + this.offset(), this.levels, this.rule, this.bosses);
    if (!depth || n > this.last()) return;
    this.wave = n;
    this.depth = depth;
    if (depth.boss) this.bosses++;
    this.theme = depth.theme;
    this.mode = "play";
    this.damaged = false;
    // небольшой ремонт перед каждой глубиной, перед боссом — основательный
    this.player.health = Math.min(this.player.maxHealth, this.player.health + (depth.boss ? 45 : 10));
    this.queue = [];
    let at = this.time + 0.6;
    if (depth.boss) {
      this.queue.push({ kind: depth.boss, at });
      at += 1;
    }
    // подмоги боссу хватит на полторы минуты; когда босс гибнет, очередь стирается
    const count = depth.boss ? Math.ceil(90 / depth.gap) : depth.packs.length;
    for (let i = 0; i < count; i++) {
      if (depth.boss) at += depth.gap;
      const kinds = depth.packs[i % depth.packs.length].split(" ");
      kinds.forEach((kind, k) => this.queue.push({ kind, at, slot: kinds.length > 1 ? (k + 0.5) / kinds.length : null }));
      if (!depth.boss) at += depth.gap;
    }
    if (this.rule === "chests" && depth.boss) this.queue.push({ kind: "chest", at: this.time + 12 });
    this.queue.sort((a, b) => a.at - b.at);
    // жемчужный дождь — посреди глубины
    this.rainAt = depth.rain ? this.time + depth.packs.length * depth.gap * 0.45 : Infinity;
    this.rainLeft = 0;
    this.emit("wave", { wave: this.wave, name: depth.name, boss: depth.boss || null });
  }

  // три разных модуля на выбор; третий ствол — предел
  makeOffer() {
    const pool = MODULES.filter(kind => (kind !== "twin" || this.player.barrels < 3) && (kind !== "bubble" || this.player.bubbleMax < 2));
    const offer = [];
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    return offer;
  }

  applyModule(kind) {
    const p = this.player;
    if (kind === "rapid") p.interval = Math.max(0.12, p.interval * 0.76);
    else if (kind === "armor") {
      p.maxHealth += 35;
      p.health = Math.min(p.maxHealth, p.health + 55);
    } else if (kind === "twin") p.barrels = Math.min(3, p.barrels + 1);
    else if (kind === "magnet") p.magnet++;
    else if (kind === "pulse") {
      p.pulseRate *= 0.72;
      p.pulsePower *= 1.3;
    } else if (kind === "engine") p.speed *= 1.14;
    else if (kind === "torpedo") p.torpedoes++;
    else if (kind === "bubble") {
      p.bubbleMax = Math.min(2, p.bubbleMax + 1);
      p.bubble = p.bubbleMax;
    }
    this.modules.push(kind);
  }

  upgrade(kind) {
    if (this.mode !== "upgrade" || !this.offer.includes(kind)) return;
    this.applyModule(kind);
    this.offer = [];
    this.nextWave();
  }

  // после гибели: та же глубина заново, модули остаются, счёт меньше на четверть (только в экспедиции)
  retry() {
    if (this.mode !== "lost") return;
    this.score = Math.round(this.score * 0.75);
    this.retries++;
    this.ease++;
    this.revive();
    this.wave--;
    this.nextWave();
    this.player.health = this.player.maxHealth;
  }

  // второй шанс в Бездне (за просмотр ролика в VK): та же глубина, полный корпус, счёт сохраняется
  secondChance() {
    if (this.mode !== "lost") return;
    this.retries++;
    this.revive();
    this.wave--;
    this.nextWave();
    this.player.health = this.player.maxHealth;
  }

  revive() {
    this.combo = 0;
    this.bonus = null;
    this.bonusDue = false;
    this.beam = null;
    this.freeze = 0;
    this.enemies.length = this.shots.length = this.pearls.length = this.lanes.length = this.capsules.length = this.links.length = 0;
    const p = this.player;
    Object.assign(p, { x: 0, z: 6.5, vx: 0, vz: 0, health: p.maxHealth, cooldown: 0, protection: 1.5, pulseShield: 0, spread: 0, bubble: p.bubbleMax });
  }

  emit(type, values = {}) {
    this.events.push({ type, ...values });
  }

  spawn(kind, slot = null, at = null) {
    const unit = UNITS[kind];
    const halfWidth = this.bounds.x;
    const large = !!LARGE[kind];
    const tier = this.tier();
    // рядовые роботы крепчают с глубиной: к седьмой — в полтора раза; боссы Бездны — с каждым кругом
    // глубже двадцатой Бездна крепчает всё быстрее: бесконечный рейс когда-нибудь кончается
    const deep = Math.max(0, tier - 20) ** 2 * 0.006;
    const grow = (large ? (this.kind === "campaign" ? 1 : 0.82 + 0.03 * tier) : 1 + 0.09 * (tier - 1)) + deep;
    const hp = Math.round(unit.hp * grow * this.mercy() * (this.rule === "swarm" && !large ? 0.62 : 1));
    // стая встаёт в ряд по своим местам, одиночка — где придётся
    const spread = slot === null ? this.random() * 1.54 - 0.77 : (slot - 0.5) * 1.6 + (this.random() - 0.5) * 0.24;
    const side = this.random() < 0.5 ? -1 : 1;
    const edge = kind === "eel" || kind === "ray" || kind === "chest";
    const enemy = {
      id: ++this.serial,
      kind,
      x: at ? at.x : large ? 0 : edge ? side * (halfWidth + (kind === "eel" ? -0.3 : 0.6)) : spread * halfWidth,
      z: at ? at.z : large ? -8.4 : kind === "ray" ? -8 + this.random() * 4 : kind === "chest" ? -6 + this.random() * 6 : kind === "star" ? -10.8 : -10.8,
      radius: unit.radius,
      health: hp,
      maxHealth: hp,
      age: 0,
      phase: this.random() * TAU,
      fire: kind === "boss" ? 2.3 : 1.8 + this.random() * 0.9,
      beamIn: 2.4,
      flash: 0,
      yaw: Math.PI,
      swell: 0, // ёж: 0 — плывёт, до 1 — раздувается
      state: kind === "eel" ? "track" : "stalk", // угорь, великан и черепаха
      timer: kind === "eel" ? 1.6 : kind === "turtle" ? 5 : 2.4,
      side,
      lane: null,
      drop: 0.8, // скат: через сколько уронит пузырь
      shield: 0, // время, пока этого робота закрывает морская звезда
      hidden: false, // черепаха спряталась в панцирь
    };
    this.enemies.push(enemy);
    return enemy;
  }

  movePlayer(dt, move) {
    const p = this.player;
    const x = move.target ? (move.target.x - p.x) * 7.2 : move.x * 11.8;
    const z = move.target ? (move.target.z - p.z) * 7.2 : move.z * 11.8;
    const speed = Math.max(1, Math.hypot(x, z) / (14.6 * p.speed));
    const blend = Math.min(1, dt * 16);
    p.vx += (x / speed - p.vx) * blend;
    p.vz += (z / speed - p.vz) * blend;
    p.x = clamp(p.x + p.vx * dt, -this.bounds.x, this.bounds.x);
    p.z = clamp(p.z + p.vz * dt, this.bounds.far, this.bounds.near);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.protection = Math.max(0, p.protection - dt);
    p.pulseShield = Math.max(0, p.pulseShield - dt);
    p.spread = Math.max(0, p.spread - dt);
    this.freeze = Math.max(0, this.freeze - dt);
    // модуль «Пузырь-щит» сам надувает новый пузырь раз в 14 секунд
    if (p.bubble < p.bubbleMax) {
      p.bubbleIn -= dt;
      if (p.bubbleIn <= 0) {
        p.bubble++;
        p.bubbleIn = 14;
        this.emit("bubble-up", { x: p.x, z: p.z });
      }
    } else p.bubbleIn = 14;
  }

  fireFrom(entity, yaw, speed, friendly, shift = 0) {
    const vx = -Math.sin(yaw) * speed;
    const vz = -Math.cos(yaw) * speed;
    const offset = friendly ? 0.75 : entity.radius * 0.73;
    const shot = {
      id: ++this.serial,
      // shift — сдвиг вбок от линии выстрела, чтобы стволы били рядом
      x: entity.x + vx / speed * offset + Math.cos(yaw) * shift,
      z: entity.z + vz / speed * offset - Math.sin(yaw) * shift,
      vx, vz, friendly, life: 1.85,
      heavy: entity.kind === "boss",
      // чем больше стволов, тем слабее каждый заряд: 9, 2×6.5, 3×5.5
      power: friendly ? [9, 6.5, 5.5][entity.barrels - 1] * entity.laser : 0,
    };
    this.shots.push(shot);
    return shot;
  }

  // торпеда: медленнее лазера, сама доворачивает на ближайшего робота и бьёт сильно
  torpedo(angle) {
    const p = this.player;
    const shot = this.fireFrom(p, p.yaw + angle, 9, true);
    shot.torpedo = true;
    shot.power = 24 * p.laser;
    shot.life = 3.2;
    return shot;
  }

  // ближайшая цель лазера; закрытых щитом звезды и спрятавшуюся черепаху лазер выбирает в последнюю очередь
  aim() {
    const p = this.player;
    let closest = Infinity;
    let target = null;
    for (const enemy of this.enemies) {
      const guarded = enemy.shield > 0 || enemy.hidden;
      const near = Math.sqrt(distSq(p, enemy));
      // далёкие пузыри подождут: сначала те, кто стреляет
      const distance = near + (guarded ? 7 : 0) + (enemy.kind === "bubble" && near > 4 ? 4 : 0);
      if (distance < closest) {
        target = enemy;
        closest = distance;
      }
    }
    return target;
  }

  autoFire(dt) {
    const p = this.player;
    const target = this.aim();
    if (p.torpedoes) {
      p.torpedoIn -= dt;
      if (p.torpedoIn <= 0 && target) {
        p.torpedoIn = Math.max(2.6, 6.5 - (p.torpedoes - 1) * 1.6);
        this.torpedo(0.5);
        this.torpedo(-0.5);
        this.emit("torpedo", { x: p.x, z: p.z });
      }
    }
    if (!target) return;
    p.yaw = Math.atan2(p.x - target.x, p.z - target.z);
    if (p.nextShot > this.time) return;
    p.nextShot = this.time + p.interval;
    const n = p.barrels;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      this.fireFrom(p, p.yaw + k * 0.05, 28, true, k * 0.42);
    }
    // бонус «тройной залп»: ещё два луча веером
    if (p.spread > 0) for (const s of [-1, 1]) this.fireFrom(p, p.yaw + s * 0.26, 28, true);
    this.emit("shot", { x: p.x, z: p.z });
  }

  moveEnemy(enemy, dt) {
    const p = this.player;
    enemy.age += dt;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.shield = Math.max(0, enemy.shield - dt);
    enemy.lane = null;
    const dx = p.x - enemy.x;
    const dz = p.z - enemy.z;
    let yaw = Math.atan2(-dx, -dz);
    const kind = enemy.kind;
    if (kind === "crab") {
      enemy.x += (clamp(dx * 0.85, -2.3, 2.3) + Math.cos(enemy.age * 4 + enemy.phase) * 1.5) * dt;
      enemy.z += clamp(dz * 1.25, -2.0, this.tier() === 1 ? 3.1 : 3.7) * dt;
    } else if (kind === "mine") {
      const distance = Math.hypot(dx, dz) || 1;
      const speed = distance < 4 ? 5.3 : 3.7;
      enemy.x += dx / distance * dt * speed;
      enemy.z += dz / distance * dt * speed;
    } else if (kind === "puffer") {
      const distance = Math.hypot(dx, dz) || 1;
      if (enemy.swell > 0) {
        enemy.swell += dt / 1.05;
        if (enemy.swell >= 1) {
          for (let i = 0; i < 8; i++) this.fireFrom(enemy, i / 8 * TAU + enemy.phase, 6.2, false);
          this.emit("pop", { x: enemy.x, z: enemy.z });
          this.destroy(enemy, false);
          return;
        }
      } else {
        enemy.x += (dx / distance * 2.0 + Math.cos(enemy.age * 2.2 + enemy.phase) * 0.9) * dt;
        enemy.z += dz / distance * 2.0 * dt;
        if (distance < 4.3) {
          enemy.swell = 0.001;
          this.emit("swell", { x: enemy.x, z: enemy.z });
        }
      }
    } else if (kind === "eel") {
      const post = this.bounds.x - 0.3;
      enemy.timer -= dt;
      if (enemy.state === "track") {
        // скользит вдоль края к ряду, где сейчас игрок
        enemy.x += clamp((enemy.side * post - enemy.x) * 4, -9, 9) * dt;
        enemy.z += clamp((clamp(p.z, this.bounds.far + 1, this.bounds.near) - enemy.z) * 2.6, -6.5, 6.5) * dt;
        yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (enemy.timer <= 0) {
          enemy.state = "warn";
          enemy.timer = 0.8;
          this.emit("lane-warning", { row: true });
        }
      } else if (enemy.state === "warn") {
        yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        enemy.lane = { row: true, at: enemy.z, heat: 1 - enemy.timer / 0.8, live: false };
        if (enemy.timer <= 0) {
          enemy.state = "dash";
          this.emit("dash", { x: enemy.x, z: enemy.z });
        }
      } else {
        yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        enemy.x -= enemy.side * 17 * dt;
        enemy.lane = { row: true, at: enemy.z, heat: 1, live: true };
        if (enemy.x * -enemy.side >= post) {
          enemy.x = -enemy.side * post;
          enemy.side = -enemy.side;
          enemy.state = "track";
          enemy.timer = 1.5;
        }
      }
    } else if (kind === "ray") {
      // скользит от края к краю, на каждом проходе опускается ближе к игроку и роняет пузыри
      const goal = -enemy.side * (this.bounds.x + 0.4);
      enemy.x += clamp((goal - enemy.x) * 2, -4.3, 4.3) * dt;
      enemy.z += clamp((clamp(p.z - 5, -8.5, 2.5) - enemy.z) * 0.8, -1.6, 1.6) * dt + Math.sin(enemy.age * 3 + enemy.phase) * 0.6 * dt;
      yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      enemy.drop -= dt;
      if (enemy.drop <= 0 && Math.abs(enemy.x) < this.bounds.x - 0.3) {
        enemy.drop = 0.95;
        const bubble = this.spawn("bubble", null, { x: enemy.x, z: enemy.z + 0.6 });
        bubble.age = 0;
        this.emit("drop", { x: enemy.x, z: enemy.z });
      }
      if (Math.abs(enemy.x - goal) < 0.35) enemy.side = -enemy.side;
    } else if (kind === "bubble") {
      // пузырь-ловушка медленно сносится к игроку и сам лопается через 9 секунд
      enemy.z += 1.5 * dt;
      enemy.x += clamp(dx, -0.6, 0.6) * dt;
      if (enemy.age > 9 || enemy.z > this.bounds.near + 1) {
        this.emit("fizz", { x: enemy.x, z: enemy.z });
        this.destroy(enemy, false);
        return;
      }
    } else if (kind === "star") {
      // держится позади стаи, подальше от лодки, и раздаёт щиты троим ближайшим соседям
      const goalX = clamp(-p.x * 0.6 + Math.sin(enemy.age * 0.9 + enemy.phase) * 2, -this.bounds.x + 0.8, this.bounds.x - 0.8);
      enemy.x += clamp((goalX - enemy.x) * 1.2, -2.2, 2.2) * dt;
      enemy.z += clamp((-7.4 + Math.sin(enemy.age * 0.7) * 0.8 - enemy.z) * 1.2, -2.5, 2.5) * dt;
      yaw = enemy.age * 1.6;
      const guarded = this.enemies
        .filter(other => other !== enemy && !LARGE[other.kind] && other.kind !== "star" && other.kind !== "bubble" && other.kind !== "chest" && distSq(other, enemy) < 64)
        .sort((a, b) => distSq(a, enemy) - distSq(b, enemy))
        .slice(0, 3);
      for (const other of guarded) {
        other.shield = 0.15;
        this.links.push({ x1: enemy.x, z1: enemy.z, x2: other.x, z2: other.z });
      }
    } else if (kind === "chest") {
      // сундучок проплывает арену поперёк и уплывает, если его не сбили
      enemy.x -= enemy.side * 2.6 * dt;
      enemy.z += Math.sin(enemy.age * 1.4 + enemy.phase) * 0.5 * dt;
      yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (Math.abs(enemy.x) > this.bounds.x + 1.2 && enemy.age > 2) {
        this.destroy(enemy, false, true);
        return;
      }
    } else if (kind === "titan") {
      const wild = enemy.health < enemy.maxHealth / 2;
      enemy.timer -= dt;
      yaw = Math.PI;
      if (enemy.state === "stalk") {
        enemy.x += clamp(dx * 1.6, -2.7, 2.7) * dt;
        enemy.z += clamp((-6.2 - enemy.z) * 1.6, -4, 4) * dt;
        enemy.fire -= dt;
        if (enemy.fire <= 0) {
          // щёлкает клешнями: заряды веером
          const aim = Math.atan2(-dx, -dz);
          const count = wild ? 4 : 2;
          for (let i = 0; i < count; i++) this.fireFrom(enemy, aim + (i - (count - 1) / 2) * 0.3, 7.6, false);
          enemy.fire = wild ? 1.05 : 1.35;
          this.emit("enemy-shot", { x: enemy.x, z: enemy.z, kind });
        }
        if (enemy.timer <= 0) {
          enemy.state = "warn";
          enemy.timer = 0.85;
          this.emit("lane-warning", { row: false });
        }
      } else if (enemy.state === "warn") {
        enemy.lane = { row: false, at: enemy.x, heat: 1 - enemy.timer / 0.85, live: false };
        if (enemy.timer <= 0) {
          enemy.state = "charge";
          this.emit("dash", { x: enemy.x, z: enemy.z });
        }
      } else if (enemy.state === "charge") {
        enemy.z += 15 * dt;
        enemy.lane = { row: false, at: enemy.x, heat: 1, live: true };
        if (enemy.z >= this.bounds.near - 0.6) enemy.state = "return";
      } else {
        enemy.z -= 6.5 * dt;
        if (enemy.z <= -6.2) {
          enemy.state = "stalk";
          enemy.timer = wild ? 2.0 : 2.8;
          enemy.fire = 0.5;
        }
      }
    } else if (kind === "turtle") {
      // Черепаха-крепость: бьёт веером из трёх башенок, потом прячется в панцирь (не пробить),
      // крутится и выпускает кольца зарядов и мины. Вылезла — снова уязвима.
      const wild = enemy.health < enemy.maxHealth / 2;
      enemy.timer -= dt;
      yaw = Math.PI;
      if (enemy.state === "stalk") {
        enemy.x += clamp(dx * 0.9, -1.6, 1.6) * dt;
        enemy.z += clamp((-6.4 - enemy.z) * 1.4, -3, 3) * dt;
        enemy.fire -= dt;
        if (enemy.fire <= 0) {
          const aim = Math.atan2(-dx, -dz);
          const count = wild ? 5 : 3;
          for (let i = 0; i < count; i++) this.fireFrom(enemy, aim + (i - (count - 1) / 2) * 0.24, 7.4, false);
          enemy.fire = wild ? 1.05 : 1.35;
          this.emit("enemy-shot", { x: enemy.x, z: enemy.z, kind });
        }
        if (enemy.timer <= 0) {
          enemy.state = "warn";
          enemy.timer = 0.9;
          this.emit("shell-warning", { x: enemy.x, z: enemy.z });
        }
      } else if (enemy.state === "warn") {
        if (enemy.timer <= 0) {
          enemy.state = "hide";
          enemy.hidden = true;
          enemy.timer = wild ? 2.4 : 2.0;
          enemy.rings = 0;
          this.emit("shell", { x: enemy.x, z: enemy.z });
        }
      } else if (enemy.state === "hide") {
        yaw = enemy.age * 9;
        const passed = (wild ? 2.4 : 2.0) - enemy.timer;
        const due = wild ? 3 : 2;
        if (enemy.rings < due && passed >= 0.45 + enemy.rings * 0.6) {
          const count = wild ? 10 : 8;
          const turn = enemy.rings * 0.5 + enemy.phase;
          for (let i = 0; i < count; i++) this.fireFrom(enemy, i / count * TAU + turn, 5.6, false);
          enemy.rings++;
          this.emit("pop", { x: enemy.x, z: enemy.z, big: true });
        }
        if (enemy.timer <= 0) {
          enemy.state = "stalk";
          enemy.hidden = false;
          enemy.timer = wild ? 4.2 : 5.4;
          enemy.fire = 0.8;
          const mines = this.enemies.filter(other => other.kind === "mine").length;
          if (mines < 4) for (const s of [-1, 1]) this.spawn("mine", null, { x: enemy.x + s * 2.4, z: enemy.z + 0.5 });
          this.emit("unshell", { x: enemy.x, z: enemy.z });
        }
      }
    } else {
      const boss = kind === "boss";
      const goalX = Math.sin(enemy.age * (boss ? 0.76 : 1.15) + enemy.phase) * this.bounds.x * (boss ? 0.56 : 0.78);
      const goalZ = boss ? -6.65 + Math.sin(enemy.age * 0.85) * 1.35 : -4.8 + Math.sin(enemy.phase + enemy.age * 1.18) * 1.8;
      enemy.x += clamp((goalX - enemy.x) * 1.6, -4.2, 4.2) * dt;
      enemy.z += clamp((goalZ - enemy.z) * 1.3, -4.4, 4.4) * dt;
      enemy.fire -= dt;
      if (boss) {
        enemy.beamIn -= dt;
        if (enemy.beamIn <= 0 && !this.beam) {
          const wild = enemy.health < enemy.maxHealth / 2;
          enemy.beamIn = wild ? 1.75 : 2.3;
          this.beam = { x: p.x, z: enemy.z - 0.2, charge: 1.0, flash: 0.38 };
          this.emit("beam-warning");
        }
      }
      if (enemy.fire <= 0) {
        const wild = boss && enemy.health < enemy.maxHealth / 2;
        const count = boss ? wild ? 5 : 3 : 1;
        for (let i = 0; i < count; i++) this.fireFrom(enemy, yaw + (i - (count - 1) / 2) * 0.22, boss ? 8.4 : 7.4, false);
        enemy.fire = boss ? wild ? 1.12 : 1.73 : 2.3;
        this.emit("enemy-shot", { x: enemy.x, z: enemy.z, kind });
      }
    }
    if (kind !== "chest" && kind !== "ray") enemy.x = clamp(enemy.x, -this.bounds.x, this.bounds.x);
    else enemy.x = clamp(enemy.x, -this.bounds.x - 1.5, this.bounds.x + 1.5);
    enemy.yaw = yaw;
  }

  hurt(amount, beam = false) {
    const p = this.player;
    if (p.pulseShield > 0 || (!beam && p.protection > 0) || this.mode !== "play") return false;
    // пузырь-щит принимает удар на себя
    if (p.bubble > 0) {
      p.bubble--;
      p.bubbleIn = 14;
      p.protection = 0.8;
      this.emit("bubble-pop", { x: p.x, z: p.z });
      return true;
    }
    p.protection = 0.92;
    // на каждой следующей глубине роботы бьют на 5% больнее
    const tier = this.tier();
    p.health = Math.max(0, p.health - Math.round(amount * (1 + 0.05 * (tier - 1) + Math.max(0, tier - 20) * 0.03) * this.mercy()));
    this.combo = 0;
    this.damaged = true;
    this.emit("hurt", { x: p.x, z: p.z });
    if (p.health === 0) {
      this.mode = "lost";
      this.emit("lost");
    }
    return true;
  }

  damage(enemy, amount) {
    if (enemy.shield > 0 || enemy.hidden) {
      // щит звезды и панцирь черепахи держат удар
      enemy.flash = 0.06;
      this.emit("deflect", { x: enemy.x, z: enemy.z, kind: enemy.kind });
      return;
    }
    enemy.health -= amount;
    enemy.flash = 0.14;
    this.emit("impact", { x: enemy.x, z: enemy.z, kind: enemy.kind });
    if (enemy.health <= 0) this.destroy(enemy, true);
  }

  destroy(enemy, scored, quiet = false) {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    if (!quiet) this.emit("burst", { x: enemy.x, z: enemy.z, kind: enemy.kind });
    if (!scored) return;
    const large = !!LARGE[enemy.kind];
    if (enemy.kind === "chest") {
      this.drop(enemy.x, enemy.z);
      this.score += UNITS.chest.points;
      this.emit("kill", { kind: enemy.kind, x: enemy.x, z: enemy.z, points: UNITS.chest.points });
      return;
    }
    this.destroyed++;
    // серия: каждый следующий робот, сбитый без паузы и без пробоин, даёт на 10% больше
    this.combo = this.time < this.comboUntil ? this.combo + 1 : 1;
    this.comboUntil = this.time + 2.8;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gain = Math.round(UNITS[enemy.kind].points * this.multiplier() * this.ruleBonus());
    this.score += gain;
    this.emit("kill", { kind: enemy.kind, x: enemy.x, z: enemy.z, points: gain, far: enemy.kind === "puffer" && enemy.swell === 0 });
    const every = this.rule === "pearls" ? 2 : 3;
    if ((this.destroyed % every === 0 && enemy.kind !== "bubble") || large) {
      this.pearls.push({ id: ++this.serial, x: enemy.x, z: enemy.z, life: 10, rare: large });
    }
    // удача из мастерской: иногда из робота выпадает бонус
    if (!large && enemy.kind !== "bubble" && this.random() < this.player.luck) this.drop(enemy.x, enemy.z);
    if (large) {
      this.queue.length = 0;
      this.beam = null;
      for (const other of [...this.enemies]) if (other.kind !== "chest") this.destroy(other, false);
      // заряды роботов гаснут (массив не подменяем: его может обходить moveShots)
      for (const shot of this.shots) if (!shot.friendly) shot.life = -1;
      this.emit("boss-down", { x: enemy.x, z: enemy.z, kind: enemy.kind });
    }
  }

  // капсула с бонусом: какой — решает случай (ремонт чаще, когда корпус побит)
  drop(x, z) {
    const p = this.player;
    const pool = ["spread", "spread", "bubble", "torpedo", "torpedo", "freeze"];
    if (p.health < p.maxHealth * 0.6) pool.push("repair", "repair", "repair");
    const kind = pool[Math.floor(this.random() * pool.length)];
    this.capsules.push({ id: ++this.serial, x, z, kind, life: 11 });
    this.emit("capsule-drop", { x, z, kind });
  }

  power(kind) {
    const p = this.player;
    if (kind === "spread") p.spread = 9;
    else if (kind === "bubble") p.bubble = Math.min(p.bubble + 1, Math.max(1, p.bubbleMax) + 1);
    else if (kind === "torpedo") for (let i = 0; i < 6; i++) this.torpedo((i - 2.5) * 0.4);
    else if (kind === "freeze") this.freeze = 6;
    else if (kind === "repair") p.health = Math.min(p.maxHealth, p.health + 40);
    this.powered++;
    this.emit("power", { kind, x: p.x, z: p.z });
  }

  // поблажка после гибели: −15% к прочности и урону роботов за каждую неудачу подряд, но не больше половины
  mercy() {
    return Math.max(0.5, 1 - 0.15 * this.ease);
  }

  multiplier() {
    return 1 + Math.min(10, Math.max(0, this.combo - 1)) * 0.1;
  }

  // очки за правило дня
  ruleBonus() {
    return this.rule === "glass" ? 1.5 : this.rule === "speedy" ? 1.3 : 1;
  }

  pulse() {
    const p = this.player;
    if (this.mode !== "play" || p.cooldown > 0) return false;
    p.cooldown = PULSE_INTERVAL * p.pulseRate;
    p.pulseShield = 0.52;
    for (const shot of this.shots) if (!shot.friendly && distSq(shot, p) <= PULSE_RADIUS ** 2) shot.life = -1;
    let hits = 0;
    for (const enemy of [...this.enemies]) {
      if (enemy.kind === "chest") continue;
      if (distSq(enemy, p) <= (PULSE_RADIUS + enemy.radius * 0.4) ** 2) {
        // импульс пробивает щит звезды, но не панцирь черепахи
        if (enemy.shield > 0) enemy.shield = 0;
        if (!enemy.hidden) hits++;
        this.damage(enemy, (LARGE[enemy.kind] ? 48 : 39) * p.pulsePower);
      }
    }
    this.emit("pulse", { x: p.x, z: p.z, hits });
    return true;
  }

  moveShots(dt) {
    const p = this.player;
    const slow = this.freeze > 0 ? 0.45 : 1;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      const step = shot.friendly ? dt : dt * slow * (this.rule === "speedy" ? 1.15 : 1);
      shot.life -= step;
      if (shot.torpedo) {
        // торпеда доворачивает на ближайшего робота
        let goal = null, best = Infinity;
        for (const enemy of this.enemies) {
          if (enemy.kind === "chest") continue;
          const d = distSq(shot, enemy) + (enemy.shield > 0 || enemy.hidden ? 60 : 0);
          if (d < best) best = d, goal = enemy;
        }
        if (goal) {
          const want = Math.atan2(goal.x - shot.x, goal.z - shot.z);
          const now = Math.atan2(shot.vx, shot.vz);
          const turn = clamp(((want - now + Math.PI * 3) % TAU) - Math.PI, -5 * dt, 5 * dt);
          const speed = Math.min(16, Math.hypot(shot.vx, shot.vz) + dt * 10);
          shot.vx = Math.sin(now + turn) * speed;
          shot.vz = Math.cos(now + turn) * speed;
        }
      }
      shot.x += shot.vx * step;
      shot.z += shot.vz * step;
      if (shot.life <= 0 || Math.abs(shot.x) > this.bounds.x + 5 || shot.z < -16 || shot.z > 14) {
        this.shots.splice(i, 1);
      } else if (shot.friendly) {
        const target = this.enemies.find(enemy => distSq(shot, enemy) <= (enemy.radius + (shot.torpedo ? 0.3 : 0.18)) ** 2);
        if (target) {
          this.damage(target, shot.power);
          if (shot.torpedo) this.emit("blast", { x: shot.x, z: shot.z });
          this.shots.splice(i, 1);
        }
      } else if (distSq(shot, p) < (shot.heavy ? 1.04 : 0.88) ** 2) {
        this.hurt(shot.heavy ? 13 : 9);
        this.shots.splice(i, 1);
      }
    }
  }

  advanceBeam(dt) {
    const beam = this.beam;
    if (!beam) return;
    if (beam.charge > 0) {
      beam.charge -= dt;
      if (beam.charge <= 0) {
        this.emit("beam-fire");
        const p = this.player;
        if (Math.abs(p.x - beam.x) < 1.12 && p.z >= beam.z) this.hurt(30, true);
      }
    } else {
      beam.flash -= dt;
      if (beam.flash <= 0) this.beam = null;
    }
  }

  collect(dt) {
    const p = this.player;
    const reach = 3.1 + p.magnet * 2.8 + p.reach;
    for (let i = this.pearls.length - 1; i >= 0; i--) {
      const pearl = this.pearls[i];
      pearl.life -= dt;
      if (pearl.vz) {
        pearl.z += pearl.vz * dt;
        pearl.x += Math.sin(this.time * 2 + pearl.id) * 0.4 * dt;
        if (pearl.z > this.bounds.near + 1) {
          this.pearls.splice(i, 1);
          continue;
        }
      }
      const distance = Math.sqrt(distSq(pearl, p));
      if (distance < 1.35) {
        if (pearl.flow && this.bonus) this.bonus.got++;
        p.health = Math.min(p.maxHealth, p.health + 12 + p.magnet * 4 + this.perks.magnet);
        p.cooldown = Math.max(0, p.cooldown - 1.7);
        this.score += pearl.rare ? 250 : 45;
        this.collected++;
        this.emit("pearl", { x: pearl.x, z: pearl.z, rare: pearl.rare });
        this.pearls.splice(i, 1);
      } else if (pearl.life <= 0) {
        this.pearls.splice(i, 1);
      } else if ((distance < reach || pearl.rare) && !pearl.flow) {
        const speed = Math.min(1, dt * (pearl.rare ? 6 : 3.4 + p.magnet * 1.6));
        pearl.x += (p.x - pearl.x) * speed;
        pearl.z += (p.z - pearl.z) * speed;
      }
    }
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const capsule = this.capsules[i];
      capsule.life -= dt;
      const distance = Math.sqrt(distSq(capsule, p));
      if (distance < 1.45) {
        this.capsules.splice(i, 1);
        this.power(capsule.kind);
      } else if (capsule.life <= 0) this.capsules.splice(i, 1);
      else if (distance < reach + 1) {
        const speed = Math.min(1, dt * (2.6 + p.magnet * 1.4));
        capsule.x += (p.x - capsule.x) * speed;
        capsule.z += (p.z - capsule.z) * speed;
      } else capsule.z += 0.4 * dt; // капсула медленно опускается к лодке
    }
  }

  // жемчужный дождь: десяток жемчужин падает по всей арене
  rain(dt) {
    if (this.time >= this.rainAt) {
      this.rainAt = Infinity;
      this.rainLeft = 10;
      this.rainNext = this.time;
      this.emit("rain");
    }
    if (this.rainLeft > 0 && this.time >= this.rainNext) {
      this.rainLeft--;
      this.rainNext = this.time + 0.3;
      const x = (this.random() * 2 - 1) * (this.bounds.x - 0.6);
      const z = this.bounds.far + 3 + this.random() * 11;
      this.pearls.push({ id: ++this.serial, x, z, life: 9, rare: false });
      this.emit("drip", { x, z });
    }
  }

  // «Жемчужное течение»: жемчуг плывёт извилистым потоком сверху вниз, иногда золотой;
  // сундучки с бонусами и пузыри-ловушки, от которых надо уворачиваться
  startBonus() {
    this.mode = "play";
    this.bonus = { until: this.time + BONUS_TIME, total: 0, got: 0, next: this.time + 0.9, trap: this.time + 3 };
    this.queue = [{ kind: "chest", at: this.time + 6 }, { kind: "chest", at: this.time + 15 }];
    this.emit("bonus", { time: BONUS_TIME });
  }

  flow() {
    const b = this.bonus;
    if (this.time >= b.next && this.time < b.until - 3) {
      b.next = this.time + 0.32;
      b.total++;
      const t = this.time - (b.until - BONUS_TIME);
      const x = Math.sin(t * 0.9) * this.bounds.x * 0.72 + Math.sin(t * 2.7) * 0.5;
      this.pearls.push({ id: ++this.serial, x, z: this.bounds.far + 0.5, vz: 3.6, life: 12, rare: b.total % 9 === 0, flow: true });
    }
    if (this.time >= b.trap && this.time < b.until - 4) {
      b.trap = this.time + 1.5;
      const x = (this.random() * 2 - 1) * (this.bounds.x - 0.5);
      this.spawn("bubble", null, { x, z: this.bounds.far + 0.5 });
    }
  }

  finishBonus() {
    const b = this.bonus;
    const perfect = b.total > 0 && b.got >= b.total * 0.9;
    if (perfect) {
      this.perfect++;
      this.score += 1000;
    }
    this.bonus = null;
    for (const enemy of [...this.enemies]) this.destroy(enemy, false, true);
    this.queue.length = 0;
    this.shots.length = 0;
    this.pearls = this.pearls.filter(pearl => !pearl.flow);
    this.mode = "break";
    this.breakUntil = this.time + 2.4;
    this.emit("bonus-end", { got: b.got, total: b.total, perfect });
  }

  step(dt, move) {
    if (this.mode !== "play" && this.mode !== "break") return;
    this.time += dt;
    this.movePlayer(dt, move);
    this.collect(dt);
    if (this.combo > 0 && this.time >= this.comboUntil) this.combo = 0;
    if (this.mode === "break") {
      if (this.time < this.breakUntil) return;
      if (this.bonusDue) {
        this.bonusDue = false;
        this.startBonus();
      } else if (this.wave >= this.last()) {
        this.mode = "won";
        this.emit("won");
      } else if (this.dockAfter(this.wave)) {
        this.offer = this.makeOffer();
        this.mode = "upgrade";
        this.emit("dock");
      } else this.nextWave();
      return;
    }

    while (this.queue.length && this.queue[0].at <= this.time) {
      const next = this.queue.shift();
      this.spawn(next.kind, next.slot);
    }
    this.rain(dt);
    if (this.bonus) this.flow();
    this.autoFire(dt);
    this.lanes.length = 0;
    this.links.length = 0;
    // роботов замедляет бонус «заморозка» и ускоряет правило «быстрая вода»
    const pace = dt * (this.freeze > 0 ? 0.45 : 1) * (this.rule === "speedy" ? 1.15 : 1);
    for (const enemy of [...this.enemies]) {
      this.moveEnemy(enemy, pace);
      if (!this.enemies.includes(enemy)) continue; // ёж мог лопнуть
      if (enemy.lane) this.lanes.push(enemy.lane);
      const unit = UNITS[enemy.kind];
      if (unit.hit && distSq(enemy, this.player) < (enemy.radius + 0.7) ** 2 && this.hurt(unit.hit) && !unit.sturdy) {
        this.destroy(enemy, false);
      }
    }
    if (this.mode === "lost") return;
    this.advanceBeam(dt);
    if (this.mode === "lost") return;
    this.moveShots(dt);
    if (this.mode === "lost") return;
    if (this.bonus) {
      if (this.time >= this.bonus.until) this.finishBonus();
      return;
    }
    const hostile = this.enemies.some(enemy => !UNITS[enemy.kind].calm);
    if (this.mode === "play" && this.queue.every(item => UNITS[item.kind].calm) && !hostile && this.rainLeft === 0) {
      this.mode = "break";
      this.queue.length = 0;
      this.shots.length = 0;
      this.lanes.length = 0;
      for (const chest of [...this.enemies]) this.destroy(chest, false, true);
      this.breakUntil = this.time + (this.wave >= this.last() ? 1.75 : 2.15);
      this.ease = 0;
      const clean = !this.damaged;
      if (clean) {
        this.clean++;
        this.score += 100 + 25 * this.tier();
      }
      // бонусный этап — в экспедиции после глубин 3, 7, 10, в Бездне — после каждой пятой
      this.bonusDue = this.kind === "campaign" ? BONUS_AFTER.has(this.wave) : this.kind === "abyss" && this.wave % 5 === 0;
      if (this.bonusDue) this.breakUntil = this.time + 1.6;
      this.emit("clear", { wave: this.wave, clean, boss: !!this.depth.boss });
    }
  }
}
