// Правила «Грозового каньона» без графики: их можно гонять в Node (см. tests/sim.mjs).
// Истребитель «Стриж» летит вглубь каньона. Он стоит в плоскости z = 0, а мир едет навстречу (в сторону +z).
// x — вбок, y — высота, z — глубина (далеко впереди — большие отрицательные числа).
export const SCROLL = 42; // скорость мира, единиц в секунду
export const FAR = -170; // здесь всё появляется
const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// pool — из каких сценок собирается зона, first — с чего она начинается, attacks — приёмы босса,
// mid — посреди зоны прилетает крейсер, task — задание зоны (TASKS)
export const ZONES = [
  { name: "Рассветный каньон", boss: "Сторож ущелья", hp: 520, segments: 7, task: "kills",
    first: ["line", "rings", "slalom", "darts"], pool: ["line", "slalom", "darts", "arch", "turrets", "rings", "cargo"], attacks: ["fan", "burst"] },
  { name: "Хрустальный грот", boss: "Кристальный страж", hp: 760, segments: 8, task: "gems", mid: true,
    first: ["mines", "swarm"], pool: ["line", "sweep", "slalom", "darts", "arch", "turrets", "mines", "bomber", "rings", "swarm"], attacks: ["fan", "mines", "burst"] },
  { name: "Грозовой перевал", boss: "Громовержец", hp: 980, segments: 8, task: "cruiser", mid: true,
    first: ["storm", "shield"], pool: ["sweep", "storm", "darts", "arch", "turrets", "bomber", "mines", "line", "rings", "shield", "swarm"], attacks: ["storm", "fan", "darts", "burst"] },
  { name: "Ледяной разлом", boss: "Морозный страж", hp: 1120, segments: 9, task: "rockets", mid: true,
    first: ["icicles", "sniper"], pool: ["icicles", "sweep", "slalom", "darts", "arch", "shield", "sniper", "swarm", "mines", "rings", "cargo"], attacks: ["icicles", "fan", "mines", "burst"] },
  { name: "Лавовое ущелье", boss: "Горн", hp: 1300, segments: 9, task: "combo", mid: true,
    first: ["geysers"], pool: ["geysers", "sweep", "slalom", "darts", "arch", "turrets", "bomber", "mines", "storm", "rings", "sniper", "shield"], attacks: ["beam", "fan", "geysers", "burst"] },
  { name: "Око бури", boss: "Буревестник", hp: 1500, segments: 10, task: "flock", mid: true,
    first: ["storm", "swarm"], pool: ["storm", "sweep", "swarm", "shield", "sniper", "bomber", "darts", "turrets", "arch", "icicles", "cargo", "rings"], attacks: ["storm", "beam", "fan", "darts", "burst"] },
  { name: "Небесная цитадель", boss: "Цитадель", hp: 1800, segments: 10, task: "tough", mid: true,
    first: ["sweep"], pool: ["sweep", "storm", "darts", "arch", "turrets", "bomber", "mines", "slalom", "line", "geysers", "shield", "sniper", "swarm"], attacks: ["beam", "fan", "darts", "storm", "burst", "mines", "icicles"] },
];

// Задание зоны: goal(номер зоны) — сколько нужно, text(n) — как оно звучит
export const TASKS = {
  kills: { goal: z => 10 + z * 3, text: n => `Сбей ${n} стражей` },
  gems: { goal: z => 6 + z * 2, text: n => `Собери ${n} кристаллов` },
  cruiser: { goal: () => 1, text: () => "Сбей крейсер" },
  rockets: { goal: z => 2 + Math.floor(z / 2), text: n => `Сбей ракетами ${n} стражей` },
  combo: { goal: z => 4 + z, text: n => `Сбей ${n} стражей подряд` },
  flock: { goal: () => 1, text: () => "Сбей звено дронов целиком" },
  tough: { goal: (_, level = "easy") => ({ easy: 40, normal: 50, hard: 60 })[level], text: n => `Потеряй меньше ${n} корпуса` },
};

// Оружие из капсул: сколько секунд действует (щит — сколько ударов держит)
export const WEAPONS = { plasma: 7, chain: 7, shield: 2 };

// Мастерская: вечные улучшения за детали. Цена уровня 1, 2, 3.
export const PERKS = ["hull", "laser", "rocket", "power"];
export const PERK_COST = [90, 200, 360];

// hit — урон при столкновении
const UNITS = {
  scout: { hp: 24, r: 1.5, points: 50, hit: 14 },
  dart: { hp: 12, r: 1.0, points: 40, hit: 16 },
  turret: { hp: 36, r: 1.3, points: 80, hit: 14 },
  mine: { hp: 12, r: 1.05, points: 30, hit: 18 },
  bomber: { hp: 150, r: 2.7, points: 200, hit: 20 },
  boss: { hp: 500, r: 5, points: 1000, hit: 24 },
  prism: { hp: 45, r: 1.15, points: 0, hit: 10 },
  drone: { hp: 7, r: 0.85, points: 25, hit: 10 }, // звено дронов кружит хороводом, потом бросается вперёд
  shield: { hp: 64, r: 1.6, points: 160, hit: 16 }, // щит спереди держит лазеры; ракеты его пробивают
  sniper: { hp: 40, r: 1.3, points: 130, hit: 14 }, // целится красной линией, потом стреляет
  carrier: { hp: 34, r: 1.4, points: 120, hit: 12 }, // контейнер с оружием пролетает поперёк
  cruiser: { hp: 300, r: 3.4, points: 600, hit: 22 }, // крейсер посреди зоны
};

// Сложность рейда. hp — прочность стражей, hurt — их урон, pace — паузы между их выстрелами (меньше — чаще),
// speed — скорость их зарядов, assist — как далеко от линии огня лазеры ещё доводятся на цель,
// extra — прибавка к числу роботов в строю, repair — ремонт перед зоной, score — множитель очков.
export const LEVELS = {
  easy: { name: "Прогулка", hp: 1, hurt: 1, pace: 1, speed: 1, assist: 2.5, extra: 0, repair: 15, score: 1 },
  normal: { name: "Рейд", hp: 1.2, hurt: 1.32, pace: 0.84, speed: 1.08, assist: 2.2, extra: 1, repair: 10, score: 1.5 },
  hard: { name: "Ас", hp: 1.45, hurt: 1.6, pace: 0.64, speed: 1.25, assist: 1.7, extra: 2, repair: 8, score: 2 },
};

// Модули ангара. Брать можно повторно, пока не упрёшься в предел.
export const MODULES = ["rapid", "spread", "armor", "rockets", "magnet", "wing"];
const BOLT_SPEED = 150;
const BOLT_LIFE = 1.45;
const ROCKET_TIME = 9;
const MAX_RAPID = 4;
const ROCKET_PRIORITY = { boss: -80, cruiser: -60, bomber: -30, sniper: -30, mine: 80, drone: 80 };
const rocketOrder = e => (e.shield ? -120 : ROCKET_PRIORITY[e.kind] ?? 0) - e.z;
const BOSS_SPECIAL = ["ram", "prisms", "gates", "press", "firestorm", "wind", "barrier"];
const rocketTarget = e => e.z < -3 && e.z > FAR + 15 && !(e.state === "in" && (e.kind === "boss" || e.kind === "cruiser"));

let groups = 0; // номера звеньев дронов

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// План зоны: список «что и когда долетит до игрока». Время появления считается назад от этого момента.
// wave — номер волны бесконечного полёта (0 — обычный рейд): там своя длина и накал
function plan(index, random, extra = 0, wave = 0) {
  const zone = ZONES[index];
  const list = [];
  let t = 3;
  const hard = wave ? Math.min(1.4, (wave - 1) / 5) : Math.min(1.15, index / 4.5); // 0..1.15: к пятой зоне накал прежнего финала
  const enemy = (dt, kind, u, v, extra = {}) => list.push({ at: t + dt - 1.5, type: "enemy", kind, u, v, ...extra });
  const rock = (dt, kind, u, extra = {}) => list.push({ at: t + dt + FAR / SCROLL, type: "rock", kind, u, ...extra });
  const hazard = (dt, kind, extra = {}) => list.push({ at: t + dt - 1.1, type: "hazard", kind, ...extra });
  const side = () => (random() < 0.5 ? -1 : 1);
  const P = {
    // строй разведчиков: зависают впереди и стреляют
    line() {
      const n = 4 + extra + Math.round(hard * 2) + (random() < 0.5 ? 1 : 0);
      const v = 0.45 + random() * 0.35;
      for (let i = 0; i < n; i++) enemy(i * 0.22, "scout", (i - (n - 1) / 2) / Math.max(1, n - 1) * 1.5, v + (i % 2) * 0.12, { stay: 6.5 });
      return 6;
    },
    // звено проносится поперёк каньона змейкой
    sweep() {
      const n = 5 + extra + Math.round(hard * 2);
      const s = side();
      for (let i = 0; i < n; i++) enemy(i * 0.35, "scout", s * 0.1, 0.35 + random() * 0.45, { stay: 7, sway: 0.75, rate: 0.9, phase: i * 0.55 * s });
      return 6.5;
    },
    darts() {
      const n = 3 + extra + Math.round(hard * 3);
      for (let i = 0; i < n; i++) enemy(i * 0.75, "dart", random() * 1.8 - 0.9, 0.15 + random() * 0.7);
      return n * 0.75 + 1.6;
    },
    // слалом между скалами
    slalom() {
      const n = 4 + Math.round(hard * 2);
      let s = side();
      for (let i = 0; i < n; i++) {
        rock(i * 1.05, "pillar", s * (0.35 + random() * 0.3));
        s = -s;
      }
      if (hard > 0.4) enemy(1, "scout", 0, 0.8, { stay: 5 });
      return n * 1.05 + 1;
    },
    // арка (пролети снизу), затем гряда (перелети сверху)
    arch() {
      const n = 2 + Math.round(hard * 2);
      let low = random() < 0.5;
      for (let i = 0; i < n; i++) {
        rock(i * 1.7, low ? "ridge" : "arch", 0);
        low = !low;
      }
      return n * 1.7 + 0.8;
    },
    // пушки на скальных столбах по краям
    turrets() {
      const n = 2 + Math.round(hard * 2);
      let s = side();
      for (let i = 0; i < n; i++) {
        const u = s * (0.5 + random() * 0.35);
        rock(i * 1.5, "stub", u);
        list.push({ at: t + i * 1.5 + FAR / SCROLL, type: "enemy", kind: "turret", u, v: 0.44 });
        s = -s;
      }
      return n * 1.5 + 1.5;
    },
    // кольца-ворота с кристаллами: награда за точный полёт
    rings() {
      const phase = random() * TAU;
      for (let i = 0; i < 5; i++) rock(i * 0.85, "ring", Math.sin(phase + i * 0.9) * 0.6, { v: 0.5 + Math.cos(phase * 1.3 + i * 0.7) * 0.3 });
      return 5;
    },
    mines() {
      const n = 6 + extra * 2 + Math.round(hard * 5);
      for (let i = 0; i < n; i++) list.push({ at: t + i * 0.42 + FAR / SCROLL, type: "enemy", kind: "mine", u: random() * 1.8 - 0.9, v: 0.1 + random() * 0.8 });
      return n * 0.42 + 1.2;
    },
    bomber() {
      enemy(0, "bomber", side() * 0.3, 0.72, { stay: 9 });
      enemy(0.8, "scout", -0.75, 0.4, { stay: 7 });
      enemy(1.0, "scout", 0.75, 0.4, { stay: 7 });
      return 8.5;
    },
    // гроза: молнии бьют туда, где сейчас истребитель
    storm() {
      const n = 4 + Math.round(hard * 3);
      for (let i = 0; i < n; i++) hazard(i * 0.95, "bolt", { aimed: i % 3 !== 2, u: random() * 1.8 - 0.9 });
      if (hard > 0.3) enemy(0.5, "scout", side() * 0.5, 0.75, { stay: 5 });
      return n * 0.95 + 1;
    },
    // лавовые гейзеры: столбы снизу до середины высоты
    geysers() {
      const n = 5 + Math.round(hard * 2);
      for (let i = 0; i < n; i++) hazard(i * 0.8, "geyser", { aimed: i % 2 === 0, u: random() * 1.8 - 0.9 });
      enemy(1.2, "scout", side() * 0.6, 0.85, { stay: 5 });
      return n * 0.8 + 1;
    },
    // ледяные сосульки: падают сверху до середины высоты — уходи вбок или вниз
    icicles() {
      const n = 5 + Math.round(hard * 2);
      for (let i = 0; i < n; i++) hazard(i * 0.8, "icicle", { aimed: i % 2 === 0, u: random() * 1.8 - 0.9 });
      enemy(1.2, "scout", side() * 0.6, 0.3, { stay: 5 });
      return n * 0.8 + 1;
    },
    // звено дронов: кружат хороводом, потом бросаются вперёд; сбей всех — получишь капсулу
    swarm() {
      const n = 6 + extra + Math.round(hard * 2);
      const group = ++groups;
      const u = side() * (0.2 + random() * 0.3), v = 0.45 + random() * 0.25;
      for (let i = 0; i < n; i++) enemy(i * 0.06, "drone", u, v, { group, slot: i, of: n, stay: 5.5 + i * 0.12 });
      return 7;
    },
    // щитоносцы: лазеры держат щитом, ракеты пробивают; щит открывается, когда они стреляют
    shield() {
      const n = 1 + (hard > 0.45 ? 1 : 0) + (extra > 1 ? 1 : 0);
      for (let i = 0; i < n; i++) enemy(i * 0.7, "shield", (i - (n - 1) / 2) * 0.9, 0.45 + random() * 0.25, { stay: 9 });
      enemy(1.4, "scout", -0.8, 0.8, { stay: 6 });
      enemy(1.6, "scout", 0.8, 0.8, { stay: 6 });
      return 8.5;
    },
    // снайпер далеко впереди: показывает линию прицела, потом стреляет по ней
    sniper() {
      const n = hard > 0.55 ? 2 : 1;
      let s = side();
      for (let i = 0; i < n; i++, s = -s) enemy(i * 1.2, "sniper", s * (0.45 + random() * 0.3), 0.6 + random() * 0.35, { stay: 8.5 });
      enemy(2, "dart", random() * 1.6 - 0.8, 0.5);
      return 8;
    },
    // контейнер с оружием пролетает поперёк каньона
    cargo() {
      const s = side();
      enemy(0, "carrier", -s * 1.05, 0.55 + random() * 0.3, { dir: s, stay: 7 });
      enemy(0.8, "scout", s * 0.6, 0.3, { stay: 5 });
      return 6;
    },
    // крейсер посреди зоны: держится, пока его не собьют, но не дольше stay
    cruiser() {
      enemy(0, "cruiser", 0, 0.7, { stay: 15 + hard * 3 });
      return 14 + hard * 3;
    },
  };
  let last = "";
  const count = wave ? 5 + Math.min(4, Math.floor(wave / 2)) : zone.segments;
  const mid = wave ? wave >= 2 && wave % 2 === 0 : zone.mid;
  const first = wave ? [] : zone.first;
  for (let i = 0; i < count; i++) {
    let name = first[i];
    if (mid && i === Math.floor(count / 2)) name = "cruiser";
    while (!name || name === last) name = zone.pool[Math.floor(random() * zone.pool.length)];
    last = name;
    t += P[name]() + 0.9 - hard * 0.5;
  }
  return { list: list.sort((a, b) => a.at - b.at), end: t };
}

export class Raid {
  constructor(random = Math.random) {
    this.random = random;
    // границы полёта задаёт экран: x — полуширина, bottom..top — высота
    this.bounds = { x: 7, bottom: 0.9, top: 6.6 };
    this.perks = { hull: 0, laser: 0, rocket: 0, power: 0 };
    this.endless = false;
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.level ||= "easy";
    this.tune = LEVELS[this.level];
    this.zone = 0;
    this.wave = 0; // волна бесконечного полёта
    this.time = 0;
    this.zoneTime = 0;
    this.score = 0;
    this.destroyed = 0;
    this.collected = 0;
    this.combo = 0;
    this.comboUntil = 0;
    this.bestCombo = 0;
    this.retries = 0;
    this.ease = 0; // сколько раз подряд игрок погиб в этой зоне
    this.clean = true; // зона без единой пробоины
    this.stars = 0; // выполненные задания зон
    this.starred = new Set(); // зоны, за задание которых звезда уже дана (повтор зоны второй не даёт)
    this.task = null;
    this.wind = 0;
    this.groups = new Map(); // звенья дронов: сколько сбито
    this.modules = [];
    this.serial = 0;
    const perks = this.perks;
    this.player = {
      x: 0, y: 3.4, vx: 0, vy: 0, health: 100 + perks.hull * 15, maxHealth: 100 + perks.hull * 15, safe: 0,
      next: 0, interval: 0.17, power: 6 * (1 + perks.laser * 0.12), laser: 1 + perks.laser * 0.12, spread: 0, speed: 1,
      rockets: 4 + perks.rocket, rocketPower: 1, rocketTime: ROCKET_TIME, cooldown: 0, magnet: 0, wing: 0, wingNext: 0,
      weapon: null, weaponLeft: 0, weaponTime: 0, chainNext: 0, shield: 0,
    };
    this.aim = null; // по кому сейчас доводятся лазеры
    this.offer = [];
    this.script = [];
    this.planEnd = 0;
    this.bossDone = false;
    this.enemies = [];
    this.rocks = [];
    this.hazards = [];
    this.bolts = []; // наши лазеры
    this.shots = []; // вражеские заряды
    this.rockets = [];
    this.gems = [];
    this.events = [];
  }

  emit(type, values = {}) {
    this.events.push({ type, ...values });
  }

  // opts.endless — бесконечный полёт, opts.perks — уровни мастерской
  start(level = this.level, opts = {}) {
    this.level = LEVELS[level] ? level : "easy";
    if (opts.perks) this.perks = { hull: 0, laser: 0, rocket: 0, power: 0, ...opts.perks };
    this.endless = !!opts.endless;
    this.reset();
    this.nextZone();
  }

  // накал: номер зоны в рейде, в бесконечном полёте растёт с волной
  get tier() {
    return this.endless ? (this.wave - 1) * 1.15 : this.zone - 1;
  }

  // очки с множителем сложности
  gain(points) {
    this.score += Math.round(points * this.tune.score);
  }

  nextZone() {
    if (this.endless) {
      this.wave++;
      this.zone = ((this.wave - 1) % ZONES.length) + 1;
    } else {
      if (!ZONES[this.zone]) return;
      this.zone++;
    }
    const zone = ZONES[this.zone - 1];
    this.mode = "play";
    this.zoneTime = 0;
    this.bossDone = false;
    this.clean = true;
    this.wind = 0;
    this.groups.clear();
    const p = this.player;
    p.health = Math.min(p.maxHealth, p.health + this.tune.repair);
    const extra = this.tune.extra + (this.endless ? Math.floor(this.wave / 6) : 0);
    const made = plan(this.zone - 1, seeded(Math.floor(this.random() * 1e9)), extra, this.endless ? this.wave : 0);
    this.script = made.list;
    this.planEnd = made.end;
    // задание зоны (в бесконечном полёте — по кругу)
    const kind = this.endless ? Object.keys(TASKS)[(this.wave - 1) % Object.keys(TASKS).length] : zone.task;
    const goal = TASKS[kind].goal(this.endless ? Math.min(7, 1 + Math.floor(this.wave / 2)) : this.zone, this.level);
    this.task = { kind, goal, have: 0, done: false, failed: false, text: TASKS[kind].text(goal) };
    if (kind === "flock") {
      const groups = new Set(this.script.filter(item => item.group).map(item => item.group));
      if (groups.size) this.task.groups = groups;
      else this.task.groups = new Set([this.spawnFlock(this.height(0.7), -92)]);
    }
    this.emit("zone", { zone: this.zone, wave: this.wave, name: zone.name, task: this.task.text });
  }

  // продвижение задания; для серии и «потеряй меньше» have — не сумма, а значение
  progress(kind, amount = 1, value = false) {
    const task = this.task;
    if (!task || task.kind !== kind || task.done || task.failed) return;
    task.have = value ? Math.max(task.have, amount) : task.have + amount;
    if (kind === "tough") {
      if (task.have >= task.goal) {
        task.failed = true;
        this.emit("task-failed");
      }
      return;
    }
    if (task.have >= task.goal) this.finishTask();
  }

  finishTask() {
    const task = this.task;
    task.done = true;
    task.have = Math.min(task.have, task.goal);
    const key = this.endless ? "w" + this.wave : this.zone;
    if (!this.starred.has(key)) {
      this.starred.add(key);
      this.stars++;
    }
    this.gain(250);
    this.emit("task", { text: task.text });
  }

  makeOffer() {
    const p = this.player;
    const rapid = this.modules.filter(kind => kind === "rapid").length;
    const pool = MODULES.filter(kind => !(kind === "spread" && p.spread >= 2) && !(kind === "wing" && p.wing >= 2) && !(kind === "rapid" && rapid >= MAX_RAPID));
    const offer = [];
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    return offer;
  }

  upgrade(kind) {
    if (this.mode !== "upgrade" || !this.offer.includes(kind)) return;
    const p = this.player;
    if (kind === "rapid") p.interval *= 0.8;
    else if (kind === "spread") p.spread++;
    else if (kind === "armor") {
      p.maxHealth += 35;
      p.health = Math.min(p.maxHealth, p.health + 50);
    } else if (kind === "rockets") {
      p.rockets += 2;
      p.rocketTime *= 0.82;
    } else if (kind === "magnet") p.magnet++;
    else if (kind === "wing") p.wing++;
    this.modules.push(kind);
    this.offer = [];
    this.nextZone();
  }

  // после гибели: та же зона заново, модули остаются, счёт меньше на четверть, враги слабее
  retry() {
    if (this.mode !== "lost" || this.endless) return;
    this.score = Math.round(this.score * 0.75);
    this.retries++;
    this.ease++;
    this.combo = 0;
    this.enemies.length = this.rocks.length = this.hazards.length = this.bolts.length = 0;
    this.shots.length = this.rockets.length = this.gems.length = 0;
    const p = this.player;
    Object.assign(p, { x: 0, y: 3.4, vx: 0, vy: 0, cooldown: 0, safe: 2, weapon: null, weaponLeft: 0, shield: 0 });
    this.zone--;
    this.nextZone();
    p.health = p.maxHealth;
  }

  // Детали для мастерской за этот полёт: за очки, задания и пройденные зоны (волны)
  reward() {
    const cleared = this.endless ? this.wave - (this.mode === "lost" ? 1 : 0) : this.mode === "won" ? ZONES.length : this.zone - 1;
    return Math.round(this.score / 500) + this.stars * 20 + Math.max(0, cleared) * 8;
  }

  mercy() {
    return Math.max(0.5, 1 - 0.15 * this.ease);
  }

  multiplier() {
    return 1 + Math.min(10, Math.max(0, this.combo - 1)) * 0.1;
  }

  height(v) {
    return this.bounds.bottom + v * (this.bounds.top - this.bounds.bottom);
  }

  spawn(item) {
    const b = this.bounds;
    const unit = UNITS[item.kind];
    const boss = item.kind === "boss";
    const scale = boss ? 1 : 1 + 0.12 * this.tier;
    let base = unit.hp * scale;
    if (boss) base = ZONES[this.zone - 1].hp * (this.endless ? Math.min(1.4, 0.5 + 0.08 * this.wave) : 1);
    else if (item.kind === "cruiser") base = (unit.hp + 70 * Math.max(0, this.tier - 1)) * (this.endless ? 0.8 : 1);
    const hp = Math.round(base * this.tune.hp * this.mercy());
    const fixed = item.kind === "mine" || item.kind === "turret"; // стоят в мире и едут вместе с ним
    const enemy = {
      id: ++this.serial, kind: item.kind, r: unit.r,
      x: item.x ?? item.u * b.x * (fixed ? 0.92 : 0.8), y: item.y ?? this.height(item.v), z: item.z ?? FAR,
      u: item.u, v: item.v, health: hp, maxHealth: hp, age: 0, flash: 0,
      state: item.state ?? (fixed || item.kind === "dart" ? "fly" : "in"),
      depth: boss ? -33 : item.kind === "cruiser" ? -36 : item.kind === "sniper" ? -56 - this.random() * 6 : item.kind === "bomber" ? -30 : item.kind === "carrier" ? -38 : -23 - this.random() * 9,
      stay: item.stay ?? 6, sway: item.sway ?? 0.12, rate: item.rate ?? 1.3, phase: item.phase ?? this.random() * TAU,
      fire: boss ? 2 : item.kind === "sniper" ? 1.4 + this.random() : item.kind === "cruiser" ? 2.2 : 0.9 + this.random() * 1.4,
      attack: 0, burst: 0, burstAt: 0, vx: 0, vy: 0, vz: 0,
      specialAt: Infinity, ram: 0, ramX: 0, wind: 0, shieldPhase: 0,
      group: item.group || 0, slot: item.slot || 0, of: item.of || 1, dir: item.dir || 1,
      shield: item.kind === "shield" ? 1 : 0, open: 0, charge: 0, aimX: 0, aimY: 0, launch: 3,
    };
    if (enemy.group && !this.groups.has(enemy.group)) this.groups.set(enemy.group, { of: enemy.of, killed: 0 });
    this.enemies.push(enemy);
    return enemy;
  }

  spawnFlock(y, z, count = 6) {
    const group = ++groups;
    for (let i = 0; i < count; i++) this.spawn({ kind: "drone", group, of: count, slot: i, u: 0, v: 0.7, y, z: z - i * 1.8, stay: 4.5 });
    return group;
  }

  addRock(item) {
    const b = this.bounds;
    const tall = b.top - b.bottom;
    const rock = { id: ++this.serial, kind: item.kind, z: FAR, x: item.u * b.x, half: 99, y0: -9, y1: 99, depth: 3, done: false };
    if (item.kind === "pillar") rock.half = Math.min(1.35, b.x * 0.28);
    else if (item.kind === "stub") {
      rock.half = Math.min(1.2, b.x * 0.25);
      rock.y1 = b.bottom + tall * 0.3;
      rock.x = item.u * b.x * 0.92;
    } else if (item.kind === "arch") rock.y0 = b.bottom + tall * 0.5; // свободно внизу
    else if (item.kind === "ridge") rock.y1 = b.bottom + tall * 0.46; // свободно наверху
    else if (item.kind === "ring") {
      rock.x = item.u * b.x * 0.8;
      rock.y = this.height(item.v);
      rock.r = 1.85;
    }
    this.rocks.push(rock);
  }

  addHazard(item) {
    const b = this.bounds;
    const p = this.player;
    const hazard = { id: ++this.serial, kind: item.kind, warn: item.warn ?? 1.1, live: item.live ?? 0.3, on: false };
    if (item.kind === "beam") {
      // луч босса: полоса во всю ширину, идёт сверху вниз или снизу вверх
      const down = this.random() < 0.5;
      Object.assign(hazard, { y: down ? b.top + 0.6 : b.bottom - 0.6, vy: (down ? -1 : 1) * 3.4, half: 0.55, live: 9 });
    } else {
      hazard.x = item.x ?? (item.aimed ? clamp(p.x + (this.random() - 0.5) * 1.2, -b.x, b.x) : item.u * b.x);
      hazard.half = item.half ?? Math.min(1.15, b.x * 0.26);
      hazard.y0 = -9;
      hazard.y1 = item.kind === "geyser" ? b.bottom + (b.top - b.bottom) * 0.56 : 99;
      if (item.kind === "geyser") hazard.live = 0.6;
      if (item.kind === "icicle") {
        // сосулька падает сверху до середины высоты: внизу безопасно
        hazard.y0 = b.bottom + (b.top - b.bottom) * 0.46;
        hazard.live = 0.6;
        hazard.warn = item.warn ?? 1.2;
      }
    }
    this.hazards.push(hazard);
    this.emit("hazard-warning", { kind: item.kind });
  }

  movePlayer(dt, move) {
    const p = this.player;
    const b = this.bounds;
    let vx, vy;
    if (move.target) {
      vx = (move.target.x - p.x) * 9;
      vy = (move.target.y - p.y) * 9;
    } else {
      vx = move.x * 15;
      vy = move.y * 11;
    }
    const top = 26 * p.speed;
    const speed = Math.hypot(vx, vy);
    if (speed > top) {
      vx *= top / speed;
      vy *= top / speed;
    }
    const blend = Math.min(1, dt * 14);
    p.vx += (vx - p.vx) * blend;
    p.vy += (vy - p.vy) * blend;
    p.x = clamp(p.x + (p.vx + this.wind) * dt, -b.x, b.x);
    p.y = clamp(p.y + p.vy * dt, b.bottom, b.top);
    p.safe = Math.max(0, p.safe - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.weapon && p.weapon !== "shield") {
      p.weaponLeft -= dt;
      if (p.weaponLeft <= 0) {
        p.weapon = null;
        this.emit("weapon-off");
      }
    }
  }

  // капсула: плазма и молния — на время, щит — на несколько ударов
  giveWeapon(kind) {
    const p = this.player;
    const extra = this.perks.power;
    if (kind === "shield") {
      const max = WEAPONS.shield + extra;
      p.shield = Math.min(max + 1, p.shield + max);
    } else {
      const full = WEAPONS[kind] + extra * 2.5;
      p.weaponLeft = p.weapon === kind ? Math.min(full * 1.5, p.weaponLeft + full * 0.75) : full;
      p.weapon = kind;
      p.weaponTime = p.weaponLeft;
    }
    this.emit("weapon", { kind });
  }

  // ближайшая к линии огня цель: по ней лазеры слегка доводятся
  pickAim() {
    const p = this.player;
    const reach = this.tune.assist + p.magnet * 0.3;
    let best = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.z > -5 || e.z < FAR + 8) continue;
      const off = Math.hypot(e.x - p.x, e.y - p.y) - e.r * 0.6;
      if (off > reach) continue;
      const score = off + -e.z * 0.012;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  bolt(x, y, z, target, power, tilt = 0, kind = "laser") {
    let vx = Math.sin(tilt) * BOLT_SPEED;
    let vy = 0;
    let vz = -Math.cos(tilt) * BOLT_SPEED;
    if (target) {
      const time = Math.max(0.05, (z - target.z) / (BOLT_SPEED + (target.vz || 0)));
      const dx = target.x + (target.vx || 0) * time - x;
      const dy = target.y + (target.vy || 0) * time - y;
      const dz = target.z + (target.vz || 0) * time - z;
      const length = Math.hypot(dx, dy, dz) || 1;
      vx = dx / length * BOLT_SPEED + Math.sin(tilt) * BOLT_SPEED;
      vy = dy / length * BOLT_SPEED;
      vz = dz / length * BOLT_SPEED;
    }
    this.bolts.push({ id: ++this.serial, x, y, z, vx, vy, vz, power, kind, life: BOLT_LIFE });
  }

  autoFire(dt) {
    const p = this.player;
    this.aim = this.pickAim();
    if (this.time >= p.next) {
      p.next = this.time + p.interval;
      const plasma = p.weapon === "plasma";
      const kind = plasma ? "plasma" : "laser";
      for (const s of [-1, 1]) this.bolt(p.x + s * 0.62, p.y - 0.05, -1.2, this.aim, p.power * (plasma ? 1.15 : 1), 0, kind);
      for (let i = 1; i <= p.spread; i++) {
        for (const s of [-1, 1]) this.bolt(p.x + s * 0.8, p.y, -1, null, p.power * 0.8, s * 0.055 * i, kind);
      }
      // плазма: широкий веер из четырёх лучей
      if (plasma) for (const s of [-1, 1]) for (const k of [1, 2]) this.bolt(p.x + s * 0.9, p.y + 0.1, -1, null, p.power * 0.7, s * (0.04 + 0.075 * k), kind);
      this.emit("shot", { kind });
    }
    // молния: каждые 0,4 с бьёт в цель и перескакивает ещё на двоих
    if (p.weapon === "chain" && this.time >= p.chainNext) {
      p.chainNext = this.time + 0.45;
      let first = this.aim;
      if (!first) {
        let best = Infinity;
        for (const e of this.enemies) {
          if (e.z > -4 || e.z < -110 || (e.kind === "boss" && e.state === "in")) continue;
          const score = Math.hypot(e.x - p.x, e.y - p.y) - e.z * 0.03;
          if (score < best) {
            best = score;
            first = e;
          }
        }
      }
      if (first) {
        const hits = [first];
        for (let k = 0; k < 2; k++) {
          const from = hits[hits.length - 1];
          let next = null, best = 16;
          for (const e of this.enemies) {
            if (hits.includes(e) || e.z > -3) continue;
            const d = Math.hypot(e.x - from.x, e.y - from.y, (e.z - from.z) * 0.5);
            if (d < best) {
              best = d;
              next = e;
            }
          }
          if (!next) break;
          hits.push(next);
        }
        this.emit("chain", { points: [{ x: p.x, y: p.y + 0.15, z: -1.4 }, ...hits.map(e => ({ x: e.x, y: e.y, z: e.z }))] });
        hits.forEach((e, i) => this.damage(e, (i ? 8 : 12) * p.laser, "chain"));
      }
    }
    // ведомые дроны стреляют сами по ближайшему врагу
    if (p.wing && this.time >= p.wingNext) {
      p.wingNext = this.time + 0.44;
      let target = null;
      for (const e of this.enemies) if (e.z < -4 && e.z > FAR + 20 && (!target || e.z > target.z)) target = e;
      if (target) {
        for (let i = 0; i < p.wing; i++) this.bolt(p.x + (i ? 2 : -2), p.y + 0.6, -0.5, target, 5 * p.laser);
        this.emit("wing-shot");
      }
    }
  }

  // вражеский заряд летит в точку (tx, ty) на плоскости игрока
  shoot(from, tx, ty, speed = 30, heavy = false) {
    speed *= this.tune.speed;
    const dx = tx - from.x;
    const dy = ty - from.y;
    const dz = -from.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    this.shots.push({
      id: ++this.serial, x: from.x, y: from.y, z: from.z + 1.5,
      vx: dx / length * speed, vy: dy / length * speed, vz: dz / length * speed, heavy,
    });
  }

  fireRockets() {
    const p = this.player;
    if (this.mode !== "play" || p.cooldown > 0) return false;
    p.cooldown = p.rocketTime;
    const targets = this.enemies.filter(rocketTarget).sort((a, b) => rocketOrder(a) - rocketOrder(b));
    const threats = targets.filter(e => e.kind !== "mine" && e.kind !== "drone");
    const salvo = threats.length ? threats : targets;
    for (let i = 0; i < p.rockets; i++) {
      const side = i % 2 ? 1 : -1;
      const row = Math.floor(i / 2);
      this.rockets.push({
        id: ++this.serial, x: p.x + side * 0.9, y: p.y - 0.2, z: -0.5,
        vx: side * (7 + row * 4), vy: 5 - row * 2, vz: -24, life: 3.2,
        target: salvo.length ? salvo[i % salvo.length].id : 0,
      });
    }
    this.emit("rocket");
    return true;
  }

  // 1 — урон прошёл, 2 — удар принял щит, false — неуязвим
  hurt(amount) {
    const p = this.player;
    if (p.safe > 0 || this.mode !== "play") return false;
    if (p.shield > 0) {
      p.shield--;
      p.safe = 0.6;
      this.emit("shield-hit", { left: p.shield });
      return 2;
    }
    p.safe = 1;
    const lost = Math.round(amount * (1 + 0.05 * this.tier) * this.tune.hurt * this.mercy());
    p.health = Math.max(0, p.health - lost);
    this.combo = 0;
    this.clean = false;
    this.progress("tough", lost);
    this.emit("hurt");
    if (p.health === 0) {
      this.mode = "lost";
      this.emit("lost");
    }
    return 1;
  }

  // source: "bolt" (лазер), "rocket", "chain" (молния)
  damage(enemy, amount, source = "bolt") {
    if (enemy.state === "in" && (enemy.kind === "boss" || enemy.kind === "cruiser")) return; // неуязвимы, пока прилетают
    if (enemy.shield && enemy.open <= 0 && (source === "bolt" || (enemy.kind === "boss" && source !== "rocket"))) {
      this.emit("block", { x: enemy.x, y: enemy.y, z: enemy.z + 1.6 });
      return;
    }
    if (enemy.shield && source === "rocket") {
      enemy.shield = 0; // ракета пробила щит насовсем
      this.emit("shield-break", { x: enemy.x, y: enemy.y, z: enemy.z + 1.4 });
    }
    if (enemy.kind === "boss" && this.zone === 2 && this.enemies.some(e => e.prismOwner === enemy.id)) amount *= 0.4;
    enemy.health -= amount;
    enemy.flash = 0.12;
    if (enemy.health <= 0) this.destroy(enemy, true, source);
  }

  dropGem(enemy, kind, i, power) {
    this.gems.push({
      id: ++this.serial, kind, power,
      x: enemy.x + (i ? (this.random() - 0.5) * 4 : 0), y: enemy.y + (i ? (this.random() - 0.5) * 2.4 : 0), z: enemy.z - i * 3,
    });
  }

  randomWeapon() {
    const list = ["plasma", "chain", "shield"];
    return list[Math.floor(this.random() * list.length)];
  }

  destroy(enemy, scored, source = "bolt") {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    this.emit("burst", { kind: enemy.kind, x: enemy.x, y: enemy.y, z: enemy.z });
    if (!scored) {
      this.missFlock(enemy);
      return;
    }
    if (enemy.kind === "prism") return;
    this.destroyed++;
    this.combo = this.time < this.comboUntil ? this.combo + 1 : 1;
    this.comboUntil = this.time + 3;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const boss = enemy.kind === "boss";
    const cruiser = enemy.kind === "cruiser";
    this.gain(UNITS[enemy.kind].points * (boss ? Math.min(this.zone, 5) : 1) * this.multiplier());
    this.progress("kills");
    this.progress("combo", this.combo, true);
    if (source === "rocket") this.progress("rockets");
    if (cruiser) this.progress("cruiser");
    const drops = boss ? 6 : cruiser ? 4 : enemy.kind === "bomber" ? 3 : this.destroyed % 2 === 0 ? 1 : 0;
    for (let i = 0; i < drops; i++) this.dropGem(enemy, (enemy.kind === "bomber" || boss || cruiser) && i === 0 ? "repair" : "gem", i);
    // капсулы с оружием: крейсер, контейнер, иногда бомбардировщик
    if (cruiser || enemy.kind === "carrier" || (enemy.kind === "bomber" && this.random() < 0.25)) this.dropGem(enemy, "power", 0, this.randomWeapon());
    if (cruiser) this.emit("cruiser-down");
    // звено сбито целиком — бонус и капсула
    if (enemy.group) {
      const flock = this.groups.get(enemy.group);
      if (flock && !flock.missed && ++flock.killed === flock.of) {
        this.gain(200);
        this.dropGem(enemy, "power", 0, this.randomWeapon());
        if (!this.task?.groups || this.task.groups.has(enemy.group)) this.progress("flock");
        this.emit("flock", { x: enemy.x, y: enemy.y, z: enemy.z });
      }
    }
    if (boss) {
      this.bossDone = true;
      this.wind = 0;
      this.script.length = 0;
      for (const other of [...this.enemies]) this.destroy(other, false);
    }
  }

  missFlock(e) {
    if (!e.group) return;
    const flock = this.groups.get(e.group);
    if (flock) flock.missed = true;
    const task = this.task;
    if (task?.kind !== "flock" || task.done || task.failed || !task.groups?.has(e.group)) return;
    task.groups.delete(e.group);
    if (task.groups.size === 0) {
      task.failed = true;
      this.emit("task-failed");
    }
  }

  // враг ушёл сам (улетел за спину или наверх)
  leave(e) {
    const index = this.enemies.indexOf(e);
    if (index >= 0) {
      this.enemies.splice(index, 1);
      this.missFlock(e);
    }
  }

  moveEnemy(e, dt) {
    const p = this.player;
    const b = this.bounds;
    e.age += dt;
    e.flash = Math.max(0, e.flash - dt);
    const before = { x: e.x, y: e.y, z: e.z };
    if (e.kind === "prism") {
      const owner = this.enemies.find(enemy => enemy.id === e.prismOwner);
      if (!owner) return this.leave(e);
      const angle = e.phase + e.age * 1.5;
      e.x = owner.x + Math.cos(angle) * 4.2;
      e.y = owner.y + Math.sin(angle) * 2.2;
      e.z = owner.z + 4 + Math.sin(angle) * 1.5;
    } else if (e.kind === "mine" || e.kind === "turret") {
      e.z += SCROLL * dt;
      if (e.kind === "turret" && e.z > -125 && e.z < -50) {
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = 1.3 * this.tune.pace;
          this.shoot(e, p.x, p.y, 58 / this.tune.speed); // пушка далеко: её заряд и так быстрый
          this.emit("enemy-shot", { kind: e.kind });
        }
      }
      if (e.z > 10) this.leave(e);
    } else if (e.kind === "dart" || (e.kind === "drone" && e.state === "dive")) {
      e.z += (e.kind === "dart" ? 78 : 58) * dt;
      if (e.z < -24 || e.kind === "drone") {
        const k = e.kind === "dart" ? 2.4 : 1.6;
        e.x += clamp((p.x - e.x) * k, -7, 7) * dt;
        e.y += clamp((p.y - e.y) * k, -6, 6) * dt;
      }
      if (e.z > 10) this.leave(e);
    } else if (e.kind === "carrier") {
      // контейнер: подлетает и проносится поперёк, не стреляет
      if (e.state === "in") {
        e.z += Math.min(95 * dt, e.depth - e.z);
        if (e.z >= e.depth - 0.01) e.state = "hover";
      } else {
        e.x += e.dir * b.x * 0.32 * dt;
        e.y = this.height(e.v) + Math.sin(e.age * 3) * 0.4;
        if (Math.abs(e.x) > b.x + 5 || e.age > e.stay + 4) this.leave(e);
      }
    } else {
      const boss = e.kind === "boss";
      const big = boss || e.kind === "cruiser";
      if (e.state === "in") {
        e.z += Math.min(95 * dt, e.depth - e.z);
        if (e.z >= e.depth - 0.01) {
          e.state = "hover";
          e.age = 0;
          if (boss) this.emit("boss", { name: ZONES[this.zone - 1].boss });
          if (e.kind === "cruiser") this.emit("cruiser");
        }
      } else if (e.state === "hover") {
        let tx, ty;
        if (big) {
          tx = Math.sin(e.age * (boss ? 0.55 : 0.45)) * b.x * (boss ? 0.5 : 0.45);
          ty = this.height((boss ? 0.62 : 0.7) + Math.sin(e.age * 0.8) * 0.2);
          if (boss && e.ram > 0) tx = e.ramX;
        } else if (e.kind === "drone") {
          // хоровод: центр звена медленно плывёт, дроны кружат вокруг
          const a = e.age * 1.7 + (e.slot / e.of) * TAU;
          const cx = clamp(e.u + Math.sin(e.age * 0.5) * 0.25, -0.7, 0.7) * b.x * 0.8;
          tx = cx + Math.cos(a) * 2.5;
          ty = this.height(e.v) + Math.sin(a) * 1.4;
        } else {
          tx = clamp(e.u + Math.sin(e.age * e.rate + e.phase) * e.sway, -1, 1) * b.x * 0.8;
          ty = this.height(clamp(e.v + Math.cos(e.age * e.rate * 0.8 + e.phase) * 0.07, 0.05, 1));
        }
        e.x += (tx - e.x) * Math.min(1, dt * (e.kind === "drone" ? 5 : 2.6));
        e.y += (ty - e.y) * Math.min(1, dt * (e.kind === "drone" ? 5 : 2.6));
        e.fire -= dt;
        e.open = Math.max(0, e.open - dt);
        if (boss) {
          if (e.ram > 0) {
            e.ram = Math.max(0, e.ram - dt);
            const elapsed = 1.65 - e.ram;
            e.z = elapsed < 0.8 ? e.depth - elapsed * 5 : e.depth + Math.sin(Math.min(1, (elapsed - 0.8) / 0.85) * Math.PI) * 27;
          }
          this.bossActs(e, dt);
        }
        else if (e.kind === "cruiser") this.cruiserActs(e, dt);
        else if (e.kind === "sniper") this.sniperActs(e, dt);
        else if (e.kind === "drone") {
          if (e.age > e.stay) e.state = "dive";
        } else if (e.fire <= 0) {
          if (e.kind === "bomber") {
            for (let i = -2; i <= 2; i++) this.shoot(e, p.x + i * 2.2, p.y, 20, true);
            e.fire = 2.6 * this.tune.pace;
          } else if (e.kind === "shield") {
            // щитоносец стреляет веером из трёх и на миг открывает щит
            for (let i = -1; i <= 1; i++) this.shoot(e, p.x + i * 1.8, p.y, 21, true);
            e.open = 1.1;
            e.fire = 3 * this.tune.pace;
          } else {
            this.shoot(e, p.x, p.y, 22);
            e.fire = (2.2 + this.random() * 1.2 - this.tier * 0.1) * this.tune.pace;
          }
          this.emit("enemy-shot", { kind: e.kind });
        }
        if (!boss && e.kind !== "drone" && e.age > e.stay) e.state = "out";
      } else {
        // улетает вверх и назад
        e.y += 13 * dt;
        e.z -= 22 * dt;
        e.charge = 0;
        if (e.y > b.top + 10) this.leave(e);
      }
    }
    e.vx = (e.x - before.x) / dt;
    e.vy = (e.y - before.y) / dt;
    e.vz = (e.z - before.z) / dt;
  }

  // снайпер: за секунду до выстрела запоминает, где «Стриж», и показывает линию
  sniperActs(e, dt) {
    const p = this.player;
    if (e.charge > 0) {
      e.charge -= dt;
      if (e.charge <= 0) {
        e.charge = 0;
        this.shoot(e, e.aimX, e.aimY, 74, true);
        this.emit("enemy-shot", { kind: "sniper" });
        e.fire = 3.1 * this.tune.pace;
      }
    } else if (e.fire <= 0) {
      e.charge = 1.05;
      e.aimX = p.x;
      e.aimY = p.y;
      this.emit("sniper-lock");
    }
  }

  // крейсер: веер из трёх тяжёлых зарядов и пара дротиков
  cruiserActs(e, dt) {
    const p = this.player;
    e.launch -= dt;
    if (e.fire <= 0) {
      const n = e.health < e.maxHealth / 2 ? 5 : 3;
      for (let i = 0; i < n; i++) this.shoot(e, p.x + (i - (n - 1) / 2) * 2.3, p.y + (i % 2 ? 0.6 : -0.4), 21, true);
      this.emit("enemy-shot", { kind: "cruiser" });
      e.fire = 2.6 * this.tune.pace;
    }
    if (e.launch <= 0) {
      e.launch = 5.5 * this.tune.pace;
      for (const s of [-1, 1]) this.spawn({ kind: "dart", x: e.x + s * 3.4, y: e.y - 0.4, z: e.z + 2, u: 0, v: 0 });
    }
  }

  bossSpecial(e) {
    const p = this.player, b = this.bounds;
    const kind = BOSS_SPECIAL[this.zone - 1];
    switch (kind) {
      case "ram":
        e.ram = 1.65;
        e.ramX = p.x;
        this.addHazard({ kind: "ram", x: p.x, half: Math.min(1.25, b.x * 0.27), warn: 0.95, live: 0.3 });
        break;
      case "prisms":
        for (let i = 0; i < 3; i++) {
          const prism = this.spawn({ kind: "prism", x: e.x, y: e.y, z: e.z + 4, phase: i * TAU / 3 });
          prism.prismOwner = e.id;
        }
        break;
      case "gates": {
        const gap = clamp(p.x > 0 ? -b.x * 0.22 : b.x * 0.22, -b.x * 0.55, b.x * 0.55);
        const opening = b.x * 0.29 + 0.5;
        const left = gap - opening, right = gap + opening;
        this.addHazard({ kind: "gate", x: (left - b.x) / 2, half: (left + b.x) / 2, warn: 1.35, live: 0.5 });
        this.addHazard({ kind: "gate", x: (right + b.x) / 2, half: (b.x - right) / 2, warn: 1.35, live: 0.5 });
        break;
      }
      case "press": {
        this.addHazard({ kind: "icicle", x: p.x, warn: 1.35 });
        for (let i = -1; i <= 1; i++) this.shoot(e, p.x + i * 2, b.bottom + 0.45, 17, true);
        break;
      }
      case "firestorm":
        this.addHazard({ kind: "geyser", x: p.x, warn: 1.15 });
        this.addHazard({ kind: "beam", warn: 1.6 });
        break;
      case "wind":
        e.wind = p.x > 0 ? -3.8 : 3.8;
        e.windUntil = this.time + 3.4;
        this.spawnFlock(this.height(0.68), -57, 4);
        break;
    }
    this.emit("boss-special", { kind });
  }

  bossActs(e, dt) {
    const p = this.player;
    const wild = e.health <= e.maxHealth / 2;
    if (this.zone === 7) {
      const threshold = e.shieldPhase === 0 ? 0.66 : e.shieldPhase === 1 ? 0.33 : 0;
      if (threshold && e.health <= e.maxHealth * threshold && !e.shield) {
        e.shieldPhase++;
        e.shield = 1;
        e.shieldUntil = this.time + 5.5;
        this.emit("boss-special", { kind: "barrier" });
      }
      if (e.shield && this.time >= e.shieldUntil) {
        e.shield = 0;
        this.emit("shield-break", { x: e.x, y: e.y, z: e.z + 1.4 });
      }
    }
    if (this.zone === 6) this.wind = this.time < (e.windUntil || 0) ? e.wind : 0;
    const firstSpecial = wild && this.zone !== 7 && e.specialAt === Infinity;
    if (firstSpecial) e.specialAt = this.time;
    if (e.ram > 0) return;
    if (this.time >= e.specialAt && (firstSpecial || e.fire <= 0) &&
      (this.zone !== 2 || !this.enemies.some(other => other.prismOwner === e.id))) {
      this.bossSpecial(e);
      e.specialAt = this.time + 12;
      e.fire = Math.max(2.7, 3.4 * this.tune.pace);
      return;
    }
    // очередь из трёх прицельных зарядов
    if (e.burst > 0 && this.time >= e.burstAt) {
      e.burst--;
      e.burstAt = this.time + 0.2;
      this.shoot(e, p.x, p.y, 27, true);
      this.emit("enemy-shot", { kind: "boss" });
    }
    if (e.fire > 0) return;
    const attacks = ZONES[this.zone - 1].attacks;
    const name = attacks[e.attack++ % attacks.length];
    e.fire = ((wild ? 1.7 : 2.4) + (name === "beam" ? 1.6 : 0)) * this.tune.pace;
    if (name === "fan") {
      const n = wild ? 7 : 5;
      for (let i = 0; i < n; i++) this.shoot(e, p.x + (i - (n - 1) / 2) * 2.1, p.y + (i % 2 ? 0.7 : -0.5), 21, true);
      this.emit("enemy-shot", { kind: "boss" });
    } else if (name === "burst") {
      e.burst = wild ? 5 : 3;
      e.burstAt = this.time;
    } else if (name === "darts") {
      for (const s of wild ? [-1, 0, 1] : [-1, 1]) this.spawn({ kind: "dart", x: e.x + s * 3, y: e.y - 0.5, z: e.z + 2, u: 0, v: 0 });
    } else if (name === "mines") {
      for (let i = 0; i < (wild ? 5 : 3); i++) {
        this.spawn({ kind: "mine", x: clamp(p.x + (this.random() - 0.5) * 7, -this.bounds.x, this.bounds.x), y: clamp(p.y + (this.random() - 0.5) * 3.5, this.bounds.bottom, this.bounds.top), z: e.z + 4 - i * 9, u: 0, v: 0 });
      }
    } else if (name === "storm" || name === "geysers" || name === "icicles") {
      const kind = name === "storm" ? "bolt" : name === "geysers" ? "geyser" : "icicle";
      for (let i = 0; i < (wild ? 4 : 3); i++) this.addHazard({ kind, aimed: i === 0, u: this.random() * 1.8 - 0.9, warn: 1.1 + i * 0.35 });
    } else if (name === "beam") this.addHazard({ kind: "beam", warn: 1.2 });
  }

  moveHazards(dt) {
    const p = this.player;
    const b = this.bounds;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (!h.on) {
        h.warn -= dt;
        if (h.warn <= 0) {
          h.on = true;
          this.emit("hazard-live", { kind: h.kind, x: h.x });
        }
        continue;
      }
      h.live -= dt;
      if (h.kind === "beam") {
        h.y += h.vy * dt;
        if (Math.abs(p.y - h.y) < h.half + 0.32) this.hurt(20);
        if (h.y < b.bottom - 1.2 || h.y > b.top + 1.2) h.live = 0;
      } else if (Math.abs(p.x - h.x) < h.half + 0.4 && p.y < h.y1 + 0.3 && p.y > h.y0 - 0.3) this.hurt(16);
      if (h.live <= 0) this.hazards.splice(i, 1);
    }
  }

  moveRocks(dt) {
    const p = this.player;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];
      const before = rock.z;
      rock.z += SCROLL * dt;
      if (rock.kind === "ring") {
        if (!rock.done && before < 0 && rock.z >= 0) {
          rock.done = true;
          if (Math.hypot(p.x - rock.x, p.y - rock.y) <= rock.r) {
            this.gain(60 * this.multiplier());
            p.cooldown = Math.max(0, p.cooldown - 0.8);
            p.health = Math.min(p.maxHealth, p.health + 5);
            rock.taken = true;
            this.emit("ring", { x: rock.x, y: rock.y });
          }
        }
      } else if (!rock.done && Math.abs(rock.z) < rock.depth / 2 + 0.7 &&
        Math.abs(p.x - rock.x) < rock.half + 0.45 && p.y > rock.y0 - 0.3 && p.y < rock.y1 + 0.3) {
        rock.done = true; // одна скала бьёт один раз
        if (this.hurt(18) === 1) this.emit("crash");
      }
      if (rock.z > 14) this.rocks.splice(i, 1);
    }
  }

  moveBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      const z0 = bolt.z;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      bolt.z += bolt.vz * dt;
      bolt.life -= dt;
      let gone = bolt.z < FAR + 6 || bolt.life <= 0;
      // скалы лазер не пробивает
      if (!gone) {
        for (const rock of this.rocks) {
          if (rock.kind !== "ring" && rock.z <= z0 && rock.z >= bolt.z - rock.depth &&
            Math.abs(bolt.x - rock.x) < rock.half && bolt.y > rock.y0 && bolt.y < rock.y1) {
            gone = true;
            this.emit("spark", { x: bolt.x, y: bolt.y, z: rock.z + rock.depth / 2 });
            break;
          }
        }
      }
      if (!gone) {
        for (const e of this.enemies) {
          // лазер за шаг пролетает 2.5 единицы: проверяем весь отрезок по глубине
          if (e.z > z0 + e.r || e.z < bolt.z - e.r) continue;
          if (Math.hypot(bolt.x - e.x, bolt.y - e.y) <= e.r + (bolt.kind === "plasma" ? 0.5 : 0.25)) {
            if (!(e.shield && e.open <= 0)) this.emit("impact", { kind: e.kind, x: bolt.x, y: bolt.y, z: e.z + e.r * 0.6 });
            this.damage(e, bolt.power, "bolt");
            gone = true;
            break;
          }
        }
      }
      if (gone) this.bolts.splice(i, 1);
    }
  }

  moveShots(dt) {
    const p = this.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      const z0 = shot.z;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.z += shot.vz * dt;
      if (z0 < 0.6 && shot.z >= -0.6 && Math.abs(shot.x - p.x) < 0.95 && Math.abs(shot.y - p.y) < 0.7) {
        this.hurt(shot.heavy ? 12 : 9);
        this.shots.splice(i, 1);
      } else if (shot.z > 2.2) this.shots.splice(i, 1); // пролетел мимо — исчезает, не долетая до камеры
    }
  }

  moveRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      let target = this.enemies.find(e => e.id === r.target);
      if (!target) {
        for (const e of this.enemies) {
          if (rocketTarget(e) && (!target || rocketOrder(e) < rocketOrder(target))) target = e;
        }
        r.target = target ? target.id : 0;
      }
      if (target) {
        const dx = target.x - r.x, dy = target.y - r.y, dz = target.z - r.z;
        const length = Math.hypot(dx, dy, dz) || 1;
        const turn = Math.min(1, dt * 5.5);
        r.vx += (dx / length * 95 - r.vx) * turn;
        r.vy += (dy / length * 95 - r.vy) * turn;
        r.vz += (dz / length * 95 - r.vz) * turn;
        if (length < target.r + 1.3) {
          this.emit("rocket-hit", { x: r.x, y: r.y, z: r.z });
          this.damage(target, 34 * this.player.rocketPower, "rocket");
          this.rockets.splice(i, 1);
          continue;
        }
      } else r.vz += (-95 - r.vz) * Math.min(1, dt * 3);
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      if (r.life <= 0 || r.z < FAR) this.rockets.splice(i, 1);
    }
  }

  moveGems(dt) {
    const p = this.player;
    const reach = 3 + p.magnet * 3.5;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      gem.z += SCROLL * dt;
      const off = Math.hypot(gem.x - p.x, gem.y - p.y);
      // капсулу оружия тянет сильнее: её жалко упустить
      const power = gem.kind === "power";
      if (gem.z > -45 && (off < reach || power)) {
        const pull = Math.min(1, dt * (2.2 + p.magnet * 2.5 + (power ? 1.5 : 0)));
        gem.x += (p.x - gem.x) * pull;
        gem.y += (p.y - gem.y) * pull;
      }
      if (Math.abs(gem.z) < 1.8 && off < 1.7 + p.magnet * 0.5 + (power ? 0.6 : 0)) {
        if (gem.kind === "repair") p.health = Math.min(p.maxHealth, p.health + 25);
        else if (power) this.giveWeapon(gem.power);
        else {
          this.gain(25);
          p.cooldown = Math.max(0, p.cooldown - 0.5);
          this.progress("gems");
        }
        this.collected++;
        this.emit(gem.kind === "repair" ? "repair" : power ? "capsule" : "gem", { power: gem.power });
        this.gems.splice(i, 1);
      } else if (gem.z > 9) this.gems.splice(i, 1);
    }
  }

  step(dt, move) {
    if (this.mode !== "play" && this.mode !== "break") return;
    this.time += dt;
    this.movePlayer(dt, move);
    this.moveGems(dt);
    if (this.combo > 0 && this.time >= this.comboUntil) this.combo = 0;
    if (this.mode === "break") {
      if (this.time < this.breakUntil) return;
      if (!this.endless && this.zone === ZONES.length) {
        this.mode = "won";
        this.emit("won");
      } else {
        this.offer = this.makeOffer();
        this.mode = "upgrade";
      }
      return;
    }
    this.zoneTime += dt;
    while (this.script.length && this.script[0].at <= this.zoneTime) {
      const item = this.script.shift();
      if (item.type === "enemy") this.spawn(item);
      else if (item.type === "rock") this.addRock(item);
      else this.addHazard(item);
    }
    // когда сценки кончились и небо почти чистое — выходит хозяин зоны
    if (!this.bossDone && !this.script.length && this.zoneTime > this.planEnd && !this.enemies.some(e => e.kind === "boss")) {
      const busy = this.enemies.filter(e => e.kind !== "mine" && e.kind !== "turret").length;
      if (busy === 0 || this.zoneTime > this.planEnd + 6) {
        this.emit("boss-warning", { name: ZONES[this.zone - 1].boss });
        this.spawn({ kind: "boss", u: 0, v: 0.62 });
      }
    }
    this.autoFire(dt);
    const p = this.player;
    for (const e of [...this.enemies]) {
      if (!this.enemies.includes(e)) continue; // молния или ракета уже сбили
      this.moveEnemy(e, dt);
      if (!this.enemies.includes(e)) continue;
      // столкновение: враг совсем рядом с плоскостью игрока
      if (Math.abs(e.z) < e.r + 0.5 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 0.5) {
        if (this.hurt(UNITS[e.kind].hit) && e.kind !== "boss" && e.kind !== "cruiser") this.destroy(e, false);
      }
    }
    if (this.mode === "lost") return;
    this.moveHazards(dt);
    this.moveRocks(dt);
    this.moveShots(dt);
    if (this.mode === "lost") return;
    this.moveBolts(dt);
    this.moveRockets(dt);
    if (this.bossDone && this.mode === "play") {
      this.mode = "break";
      this.shots.length = this.hazards.length = 0;
      this.breakUntil = this.time + (!this.endless && this.zone === ZONES.length ? 3 : 2.8);
      if (this.clean) this.gain(300);
      // «потеряй меньше N» засчитывается, когда зона пройдена
      if (this.task?.kind === "tough" && !this.task.failed && !this.task.done) this.finishTask();
      this.emit("clear", { clean: this.clean });
      this.ease = 0;
    }
  }
}
