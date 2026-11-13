// Данные игры без графики: оружие, гранаты, снаряжение, роботы, сложность, звания, достижения.
// Все названия придуманы для «Рубежа». Числа проверяет tests/sim.mjs (время уничтожения, экономика).

// ---------- Оружие ----------
// dmg — урон за попадание (у дробовика — за дробинку), rpm — выстрелов в минуту,
// hip / ads — разброс от бедра и в прицеле (градусы), move — во сколько раз разброс больше на бегу,
// bloom — прибавка разброса за выстрел, kick — подброс ствола (градусы), kickX — увод в сторону,
// range [полный урон до, падение до, остаток], pen — пробитие брони роботов (0..1),
// speed — скорость бега с оружием, zoom — приближение в прицеле, noise — на сколько метров слышен выстрел,
// price — лицензия в кампании (купить один раз), cost — цена за раунд в «Схватке», unlock — после какого задания.
export const WEAPONS = {
  iskra: {
    name: "Искра", kind: "Пистолет", slot: "sec", icon: "pistol",
    dmg: 25, rpm: 400, auto: false, mag: 12, reserve: 72, reload: 1.25, equip: 0.35,
    hip: 1.3, ads: 0.45, move: 1.6, bloom: 0.55, bloomMax: 3.2, recover: 9,
    kick: 1.1, kickX: 0.35, range: [16, 40, 0.6], pen: 0.25, speed: 1.0, zoom: 1.2, noise: 16,
    price: 0, cost: 0, unlock: 0,
    blurb: "Надёжный пистолет отряда. Тихий: роботы слышат его только вблизи.",
  },
  grom: {
    name: "Гром", kind: "Тяжёлый пистолет", slot: "sec", icon: "revolver",
    dmg: 54, rpm: 160, auto: false, mag: 7, reserve: 42, reload: 1.7, equip: 0.45,
    hip: 1.8, ads: 0.35, move: 1.7, bloom: 1.4, bloomMax: 4.5, recover: 6,
    kick: 3.2, kickX: 0.8, range: [20, 45, 0.65], pen: 0.55, speed: 0.98, zoom: 1.25, noise: 32,
    price: 900, cost: 600, unlock: 1,
    blurb: "Мощный выстрел, медленный темп. Два попадания в ядро — и «Стрелка» нет.",
  },
  strizh: {
    name: "Стриж", kind: "Пистолет-пулемёт", slot: "pri", icon: "smg",
    dmg: 17, rpm: 950, auto: true, mag: 36, reserve: 170, reload: 1.7, equip: 0.4,
    hip: 1.6, ads: 0.85, move: 1.15, bloom: 0.18, bloomMax: 3.4, recover: 10,
    kick: 0.38, kickX: 0.3, range: [12, 32, 0.45], pen: 0.2, speed: 1.0, zoom: 1.25, noise: 30,
    price: 1300, cost: 1200, unlock: 1,
    blurb: "Быстрый и лёгкий: бегаешь с ним как с пистолетом. Хорош в тесноте.",
  },
  taran: {
    name: "Таран", kind: "Дробовик", slot: "pri", icon: "shotgun", pellets: 9, cone: 3.4,
    dmg: 15, rpm: 72, auto: false, mag: 6, reserve: 36, reload: 0.5, shell: true, equip: 0.5,
    hip: 0.6, ads: 0.4, move: 1.2, bloom: 0.4, bloomMax: 2, recover: 6,
    kick: 4.2, kickX: 1.2, range: [8, 22, 0.25], pen: 0.35, speed: 0.95, zoom: 1.15, noise: 34,
    price: 1800, cost: 1100, unlock: 3,
    blurb: "Девять дробин за выстрел. Вблизи сносит щиты «Бастионов» с одного залпа.",
  },
  shkval: {
    name: "Шквал", kind: "Штурмовая винтовка", slot: "pri", icon: "rifle",
    dmg: 29, rpm: 620, auto: true, mag: 30, reserve: 150, reload: 2.2, equip: 0.5,
    hip: 2.1, ads: 0.32, move: 1.6, bloom: 0.3, bloomMax: 3.6, recover: 8,
    kick: 0.75, kickX: 0.42, range: [26, 60, 0.7], pen: 0.45, speed: 0.92, zoom: 1.4, noise: 36,
    price: 2600, cost: 2700, unlock: 2,
    blurb: "Основа отряда «Рубеж»: точна короткими очередями на любой дистанции.",
  },
  sokol: {
    name: "Сокол", kind: "Боевая винтовка", slot: "pri", icon: "dmr", scope: 2,
    dmg: 60, rpm: 330, auto: false, mag: 20, reserve: 100, reload: 2.5, equip: 0.55,
    hip: 2.8, ads: 0.1, move: 1.9, bloom: 0.65, bloomMax: 3.4, recover: 7,
    kick: 1.6, kickX: 0.5, range: [45, 90, 0.85], pen: 0.75, speed: 0.88, zoom: 2.0, noise: 38,
    price: 3500, cost: 3300, unlock: 4,
    blurb: "Прицел 2×, тяжёлая пуля. Каждое попадание в ядро — почти всегда последнее.",
  },
  igla: {
    name: "Игла", kind: "Снайперская винтовка", slot: "pri", icon: "sniper", scope: 4,
    dmg: 115, rpm: 46, auto: false, mag: 5, reserve: 30, reload: 3.0, equip: 0.7,
    hip: 7, ads: 0.02, move: 3, bloom: 1, bloomMax: 2, recover: 4,
    kick: 5.5, kickX: 0.9, range: [70, 120, 0.9], pen: 0.95, speed: 0.82, zoom: 4.2, noise: 44,
    price: 4600, cost: 4500, unlock: 6,
    blurb: "Прицел 4×, пробивает любую броню. Без прицела стрелять бесполезно.",
  },
  bur: {
    name: "Бур", kind: "Ручной пулемёт", slot: "pri", icon: "lmg",
    dmg: 27, rpm: 660, auto: true, mag: 90, reserve: 180, reload: 4.3, equip: 0.8,
    hip: 3.0, ads: 1.05, move: 1.7, bloom: 0.3, bloomMax: 4.6, recover: 6,
    kick: 0.8, kickX: 0.55, range: [30, 65, 0.7], pen: 0.6, speed: 0.78, zoom: 1.35, noise: 42,
    price: 5400, cost: 5000, unlock: 8,
    blurb: "Девяносто патронов без перезарядки. Тяжёлый, зато «Молоты» тают на глазах.",
  },
  rezak: {
    name: "Резак", kind: "Плазменный нож", slot: "melee", icon: "knife", melee: true,
    dmg: 70, rpm: 110, auto: true, mag: 0, reload: 0, equip: 0.25, reach: 2.1,
    hip: 0, ads: 0, move: 1, bloom: 0, bloomMax: 0, recover: 0,
    kick: 0, kickX: 0, range: [2.1, 2.1, 1], pen: 1, speed: 1.06, zoom: 1, noise: 4,
    price: 0, cost: 0, unlock: 0,
    blurb: "Удар со спины по ничего не подозревающему роботу отключает его сразу и бесшумно.",
  },
};
export const PRIMARY = ["strizh", "taran", "shkval", "sokol", "igla", "bur"];
export const SECONDARY = ["iskra", "grom"];
export const GUNS = [...SECONDARY, ...PRIMARY];

// Улучшения оружия: цена = доля цены оружия (не меньше min), открываются по числу звёзд
export const UPGRADES = {
  mag: { name: "Магазин+", text: "+40% патронов в магазине", share: 0.3, min: 300, stars: 3 },
  scope: { name: "Прицел", text: "−30% разброса в прицеле, прицел ближе", share: 0.35, min: 350, stars: 8 },
  stab: { name: "Стабилизатор", text: "−35% отдачи и разброса от очередей", share: 0.4, min: 400, stars: 14 },
};
export const UPGRADE_IDS = ["mag", "scope", "stab"];
export const upgradePrice = (weaponId, up) => {
  const w = WEAPONS[weaponId], u = UPGRADES[up];
  return Math.max(u.min, Math.round(((w.price || 600) * u.share) / 50) * 50);
};

// ---------- Гранаты (два слота) ----------
export const GRENADES = {
  frag: { name: "Осколочная", short: "Оск.", price: 300, radius: 6.5, dmg: 150, fuse: 1.8, color: "#ffb03a" },
  emp: { name: "ЭМИ", short: "ЭМИ", price: 350, radius: 7.5, stun: 5.5, fuse: 1.5, color: "#5fd8ff" },
  smoke: { name: "Дымовая", short: "Дым", price: 200, radius: 5.5, time: 13, fuse: 1.4, color: "#c9d2dc" },
};
export const GRENADE_IDS = ["frag", "emp", "smoke"];

// ---------- Броня и набор ----------
export const GEAR = {
  vest: { name: "Бронежилет", text: "100 брони: поглощает 60% урона", price: 650 },
  helmet: { name: "Шлем", text: "−35% урона от снайперов и взрывов, меньше сбивает прицел", price: 350 },
};
export const KITS = {
  none: { name: "Без набора", text: "", price: 0 },
  battery: { name: "Батарея щита", text: "Кнопка набора: +50 к щиту за 2 секунды", price: 400 },
  sapper: { name: "Сапёрный набор", text: "Установка и снятие зарядов вдвое быстрее", price: 300 },
  scanner: { name: "Сканер", text: "Кнопка набора: 12 секунд роботы видны на радаре и сквозь стены", price: 450 },
};
export const KIT_IDS = ["none", "battery", "sapper", "scanner"];

// ---------- Игрок ----------
export const PLAYER = {
  hp: 100, run: 5.4, walk: 0.5, crouch: 0.45, aimMove: 0.62, accel: 38, air: 6,
  radius: 0.34, height: 1.78, crouchHeight: 1.18, eye: 1.62, crouchEye: 1.06, jump: 4.6, gravity: 15,
  armorAbsorb: 0.6, helmetCut: 0.35,
};

// ---------- Роботы ГОРНа ----------
// hp — прочность, armor — броня корпуса (урон × (1 − armor × (1 − пробитие))),
// core — множитель урона по светящемуся ядру, parts — сферы попадания [x, y, z, радиус, ядро?]
// в местных координатах (вперёд — −z), shot — урон за выстрел, burst — выстрелов в очереди,
// gap — пауза между выстрелами очереди, rest — между очередями, acc — точность (меньше — точнее, градусы),
// sight — дальность зрения, react — время до первого выстрела после того, как увидел.
export const ROBOTS = {
  zhuk: {
    name: "Жук", role: "Патрульный дрон", hp: 60, armor: 0, core: 2, speed: 3.3, turn: 4, radius: 0.45, height: 1.0,
    parts: [[0, 0.55, 0, 0.5, 0], [0, 0.72, -0.38, 0.2, 1]],
    shot: 6, burst: 3, gap: 0.12, rest: 1.3, acc: 3.4, sight: 26, react: 0.75, range: 22, cover: 0.2, flank: 0.2,
    score: 100, xp: 10, color: "#ffcf3a",
  },
  strelok: {
    name: "Стрелок", role: "Штурмовой бот", hp: 120, armor: 0.2, core: 2, speed: 3.0, turn: 3.2, radius: 0.42, height: 1.9,
    parts: [[0, 1.25, 0, 0.42, 0], [0, 0.65, 0, 0.36, 0], [0, 1.72, 0, 0.24, 0], [0, 1.3, -0.3, 0.17, 1]],
    shot: 8, burst: 4, gap: 0.11, rest: 1.25, acc: 2.6, sight: 34, react: 0.6, range: 32, cover: 0.6, flank: 0.35,
    score: 200, xp: 18, color: "#ff6a3a",
  },
  bastion: {
    name: "Бастион", role: "Бот со щитом", hp: 190, armor: 0.35, core: 2.5, speed: 2.4, turn: 1.6, radius: 0.55, height: 2.0,
    parts: [[0, 1.2, 0, 0.55, 0], [0, 0.6, 0, 0.45, 0], [0, 1.35, 0.42, 0.22, 1]],
    shield: { hp: 260, front: 0.62, depth: -0.75, w: 1.5, h: 2.0 },
    shot: 7, pellets: 5, burst: 1, gap: 0, rest: 1.5, acc: 5.5, sight: 26, react: 0.7, range: 11, cover: 0, flank: 0,
    score: 300, xp: 26, color: "#4fa8ff",
  },
  osa: {
    name: "Оса", role: "Дрон-снайпер", hp: 70, armor: 0, core: 2, speed: 4.2, turn: 3, radius: 0.5, height: 0.6, fly: 5.5,
    parts: [[0, 0, 0, 0.55, 0], [0, -0.05, -0.42, 0.2, 1]],
    shot: 38, burst: 1, gap: 0, rest: 3.2, acc: 0.7, charge: 1.35, sight: 60, react: 0.4, range: 60, cover: 0, flank: 0,
    score: 250, xp: 22, color: "#ff3fd0",
  },
  kolobok: {
    name: "Колобок", role: "Робот-камикадзе", hp: 45, armor: 0, core: 1.6, speed: 6.4, turn: 6, radius: 0.45, height: 0.9,
    parts: [[0, 0.45, 0, 0.48, 1]],
    blast: { r: 3.8, dmg: 52, fuse: 0.7 }, sight: 30, react: 0.25, range: 2.2, cover: 0, flank: 0,
    score: 150, xp: 12, color: "#ff3a3a",
  },
  molot: {
    name: "Молот", role: "Тяжёлый шагоход", hp: 650, armor: 0.55, core: 2, speed: 1.6, turn: 1.1, radius: 1.1, height: 3.2,
    parts: [[0, 2.3, 0, 1.05, 0], [0, 1.1, 0, 0.8, 0], [-1.12, 2.35, 0.1, 0.32, 1], [1.12, 2.35, 0.1, 0.32, 1]],
    shot: 6, burst: 14, gap: 0.075, rest: 2.2, acc: 3.8, rocket: { dmg: 34, r: 3.2, every: 6.5, speed: 16 },
    sight: 40, react: 0.9, range: 36, cover: 0, flank: 0,
    score: 800, xp: 70, color: "#ffa32a",
  },
  glaz: {
    name: "Глаз", role: "Камера наблюдения", hp: 30, armor: 0, core: 1, speed: 0, turn: 0.8, radius: 0.3, height: 0.4, still: true,
    parts: [[0, 0, 0, 0.32, 1]], sight: 18, react: 1.0, range: 0, cover: 0, flank: 0, camera: true,
    score: 60, xp: 4, color: "#ff2b2b",
  },
  nakovalnya: {
    name: "Наковальня", role: "Шагоход-ядро ГОРНа", hp: 8500, armor: 0.7, core: 1.8, speed: 1.1, turn: 0.7, radius: 2.6, height: 7,
    parts: [[0, 4.6, 0, 2.3, 0], [0, 2.4, 0, 1.6, 0], [0, 5.0, -2.0, 0.85, 1], [-2.4, 2.0, 0, 0.55, 1], [2.4, 2.0, 0, 0.55, 1]],
    shot: 4, burst: 18, gap: 0.07, rest: 2.6, acc: 4.4, rocket: { dmg: 21, r: 3.0, every: 6.5, speed: 14 },
    sight: 80, react: 0.6, range: 60, cover: 0, flank: 0, boss: true,
    score: 5000, xp: 400, color: "#ff5a1f",
  },
};

// Боец отряда (напарник) — тоже «робот» для общих правил движения, но на нашей стороне
export const MATE = {
  hp: 120, speed: 3.6, turn: 5, radius: 0.36, height: 1.8, shot: 15, burst: 3, gap: 0.1, rest: 0.9, acc: 2.4, sight: 40, react: 0.45, range: 38,
};
export const MATE_NAMES = ["Лис", "Гроза", "Тихий", "Сова"];

// ---------- Сложность ----------
// dmg — урон роботов по нам, hp — их прочность, acc — их разброс (больше — мажут), react — их реакция,
// pay — множитель награды, hold — время удержания
export const DIFFICULTY = [
  { id: 0, name: "Новичок", dmg: 0.5, hp: 0.85, acc: 1.5, react: 1.45, pay: 0.85, regen: 1, time: 1.25 },
  { id: 1, name: "Боец", dmg: 0.8, hp: 1, acc: 1.12, react: 1.1, pay: 1, regen: 0.6, time: 1 },
  { id: 2, name: "Ветеран", dmg: 1.08, hp: 1.12, acc: 0.94, react: 0.95, pay: 1.3, regen: 0.3, time: 0.92 },
];

// ---------- Экономика ----------
export const ECON = {
  start: 1000, // кредиты нового профиля
  core: 0.5, // надбавка за уничтожение выстрелом в ядро
  accuracy: { from: 0.3, per: 30 }, // за каждый процент точности выше 30% — 30 кредитов
  time: 400, // бонус за время не хуже нормы
  noDeath: 300,
  replay: 0.5, // повторное прохождение задания — половина награды за задание
  // «Схватка»: экономика матча как в жанре
  match: { start: 800, win: 2600, loss: 1600, lossStreak: 400, kill: 300, max: 9000, toWin: 4 },
};

// ---------- Звания профиля ----------
export const RANKS = [
  { xp: 0, name: "Новобранец" },
  { xp: 150, name: "Курсант" },
  { xp: 400, name: "Боец" },
  { xp: 800, name: "Стрелок" },
  { xp: 1400, name: "Разведчик" },
  { xp: 2200, name: "Сапёр" },
  { xp: 3300, name: "Ветеран" },
  { xp: 4800, name: "Командир звена" },
  { xp: 7000, name: "Командир «Рубежа»" },
  { xp: 10000, name: "Легенда «Рубежа»" },
];
export function rankOf(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1];
  return { index: i, name: RANKS[i].name, next: next ? next.xp : null, from: RANKS[i].xp, k: next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1 };
}

// ---------- Достижения ----------
export const ACHIEVEMENTS = [
  { id: "first", name: "Первый болт", text: "Отключить первого робота" },
  { id: "range", name: "Выпускник полигона", text: "Пройти тренировку" },
  { id: "core50", name: "В самое ядро", text: "50 роботов отключено выстрелом в ядро" },
  { id: "sharp", name: "Меткий глаз", text: "Точность 60% и выше за задание" },
  { id: "ghost", name: "Тень", text: "Пройти тихое задание без тревоги" },
  { id: "saver", name: "Спасатель", text: "Вывести инженера живым и невредимым" },
  { id: "sapper", name: "Сапёр", text: "Отключить 5 ретрансляторов и бомб" },
  { id: "emp", name: "Электрик", text: "Оглушить ЭМИ 15 роботов" },
  { id: "knife", name: "Тихий шаг", text: "Отключить 10 роботов ударом ножа" },
  { id: "molot", name: "Кузнец", text: "Отключить 5 «Молотов»" },
  { id: "boss", name: "Наковальня разбита", text: "Победить главного шагохода ГОРНа" },
  { id: "match", name: "Командный игрок", text: "Выиграть «Схватку»" },
  { id: "daily", name: "Каждый день", text: "Выполнить 3 задания дня" },
  { id: "arsenal", name: "Коллекционер", text: "Открыть всё оружие" },
  { id: "master", name: "Мастер оружия", text: "Все три улучшения на одном оружии" },
  { id: "stars", name: "Звездопад", text: "Собрать все 36 звёзд кампании" },
  { id: "veteran", name: "Ветеран «Рубежа»", text: "Пройти кампанию на «Ветеране»" },
];

// ---------- Задание дня: условия ----------
export const DAILY_MODS = [
  { id: "pistols", name: "Только пистолеты", text: "Основное оружие на складе. Зато награда ×1,6", pay: 1.6 },
  { id: "cores", name: "Ядерная точность", text: "По ядрам ×3, по корпусу ×0,6", pay: 1.4 },
  { id: "rollers", name: "Колобки повсюду", text: "Каждые 25 секунд — стая «Колобков»", pay: 1.5 },
  { id: "fog", name: "Густой туман", text: "Видно на 18 метров — и тебе, и роботам", pay: 1.3 },
  { id: "noarmor", name: "Налегке", text: "Без брони и шлема, бег на 15% быстрее", pay: 1.4 },
  { id: "fast", name: "Разгон", text: "Роботы на 30% быстрее и чаще стреляют", pay: 1.5 },
];
