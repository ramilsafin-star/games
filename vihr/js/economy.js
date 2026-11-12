// Монеты, улучшения, облики и сохранение «Вихря». Без DOM: тесты в Node считают экономику.
import { MAPS } from "./rules.js?v=ae43a6e1";

export const SAVE_KEY = "vihr-v1";

// Улучшения: цена каждого следующего уровня
export const UPGRADES = [
  { id: "speed", name: "Скорость", note: "+4% к скорости за уровень", prices: [40, 80, 140, 220, 320, 450] },
  { id: "start", name: "Размер на старте", note: "шире с первой секунды раунда", prices: [50, 100, 170, 260, 380, 520] },
  { id: "pull", name: "Притяжение", note: "тянет предметы издалека", prices: [40, 80, 140, 220, 320, 450] },
  { id: "time", name: "Время раунда", note: "+10 секунд за уровень", prices: [100, 200, 340, 500] },
];
export function upgradeEffects(up = {}) {
  return {
    speedMul: 1 + 0.04 * (up.speed || 0),
    startR: 1 + 0.1 * (up.start || 0),
    pullMul: 1 + 0.07 * (up.pull || 0),
    duration: 120 + 10 * (up.time || 0),
  };
}

// Облики вихря: a — низ, b — верх, c — светлые прожилки; mode: 0 обычный, 1 радуга, 2 звёзды, 3 полоски, 4 пламя
export const SKINS = [
  { id: 0, name: "Ветерок", price: 0, a: "#2a66d0", b: "#a9d6ff", c: "#ffffff", mode: 0 },
  { id: 1, name: "Мята", price: 120, a: "#2fae8c", b: "#c9fff0", c: "#ffffff", mode: 0 },
  { id: 2, name: "Закат", price: 200, a: "#ff6a4a", b: "#ffd27a", c: "#fff3d6", mode: 0 },
  { id: 3, name: "Лимонад", price: 280, a: "#e0b80c", b: "#fff7a8", c: "#ffffff", mode: 0 },
  { id: 4, name: "Ночь", price: 380, a: "#262a66", b: "#7a80e6", c: "#d8ddff", mode: 2 },
  { id: 5, name: "Леденец", price: 480, a: "#ff4f86", b: "#fff4f8", c: "#ff9fbf", mode: 3 },
  { id: 6, name: "Пламя", price: 600, a: "#ff3a1a", b: "#ffbe2a", c: "#fff2a8", mode: 4 },
  { id: 7, name: "Радуга", price: 750, a: "#ff5a5a", b: "#5ab8ff", c: "#ffffff", mode: 1 },
  { id: 8, name: "Галактика", price: 900, a: "#190a3a", b: "#8a3bd8", c: "#ff9cf0", mode: 2 },
];
// Следы за вихрем: frame — картинка частицы, colors — цвета
export const TRAILS = [
  { id: 0, name: "Пыль", price: 0, frame: 0, colors: ["#e8d7b8", "#d9c39c", "#f4ead8"] },
  { id: 1, name: "Листья", price: 150, frame: 3, colors: ["#6cc04a", "#a8d840", "#f0a020", "#e06a2a"] },
  { id: 2, name: "Искры", price: 250, frame: 6, colors: ["#fff3a0", "#ffd84a", "#ffffff"] },
  { id: 3, name: "Пузыри", price: 350, frame: 5, colors: ["#bff4ff", "#ffffff", "#8fe0ff"] },
  { id: 4, name: "Сердечки", price: 480, frame: 4, colors: ["#ff6fa8", "#ff9fc8", "#ff4f7a"] },
  { id: 5, name: "Радуга", price: 650, frame: 1, colors: ["#ff5a5a", "#ffa63a", "#ffe04a", "#5ad86a", "#4ab8ff", "#a87aff"] },
];
// Соперники: имя и цвета
export const BOTS = [
  { name: "Шквал", a: "#d8343c", b: "#ffb0a8", c: "#fff0ee", mode: 0 },
  { name: "Сквозняк", a: "#2f7fe0", b: "#b8e0ff", c: "#ffffff", mode: 0 },
  { name: "Вьюн", a: "#3db04c", b: "#d0ffc0", c: "#ffffff", mode: 0 },
  { name: "Бриз", a: "#16a8ba", b: "#c8fbff", c: "#ffffff", mode: 0 },
  { name: "Буранчик", a: "#7a58e0", b: "#e2d6ff", c: "#ffffff", mode: 0 },
  { name: "Пылесос", a: "#b87a2c", b: "#ffe0b0", c: "#fff8ec", mode: 0 },
  { name: "Смерчик", a: "#e04fa6", b: "#ffd0ec", c: "#ffffff", mode: 0 },
  { name: "Суховей", a: "#c89412", b: "#fff0a0", c: "#ffffff", mode: 0 },
  { name: "Тайфунчик", a: "#1f8c60", b: "#b0f5d8", c: "#ffffff", mode: 0 },
  { name: "Мистраль", a: "#e0701c", b: "#ffd2a8", c: "#ffffff", mode: 0 },
  { name: "Сирокко", a: "#9a2f50", b: "#ffb8c8", c: "#ffffff", mode: 0 },
  { name: "Циклон", a: "#4a5468", b: "#c8d0e0", c: "#ffffff", mode: 0 }, // не «Ураган»: так зовут Урагана-великана
];

// ---------- Монеты за раунд ----------
export const PLACE_BONUS = [45, 28, 18, 8, 4, 0];
export const GOLD_COINS = 2; // за каждый золотой предмет
export const BOSS_COINS = 60; // за Урагана-великана
export const ZONE_COINS = 20; // «Буря»: продержался в круге до конца
export function roundCoins({ place, D, ate = 0, lifted = 0, golds = 0, bossWins = 0, inZone = false }) {
  const size = 10 + Math.round(D * 3) + Math.floor(lifted / 5);
  const bonus = PLACE_BONUS[place - 1] ?? 0;
  const hunt = ate * 6;
  // события: золото, Ураган-великан, выживание в «Буре»
  const extra = golds * GOLD_COINS + bossWins * BOSS_COINS + (inZone ? ZONE_COINS : 0);
  return { size, bonus, hunt, extra, total: size + bonus + hunt + extra };
}

// ---------- Задания дня ----------
// Три задания на день выбираются по дате; прогресс копится между раундами этого дня.
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
export const MISSIONS = [
  { id: "lift", goals: [40, 60, 90], coins: 40, text: (n) => `Подними ${n} предметов` },
  { id: "eat", goals: [2, 3, 5], coins: 60, text: (n) => `Втяни соперников: ${n}` },
  { id: "win", goals: [1], coins: 70, text: () => "Займи первое место" },
  { id: "top3", goals: [2, 3], coins: 50, text: (n) => `Попади в тройку ${n} ${plural(n, "раз", "раза", "раз")}` },
  { id: "power", goals: [3, 5], coins: 40, text: (n) => `Возьми ${n} ${plural(n, "бонус", "бонуса", "бонусов")}` },
  { id: "gold", goals: [4, 7], coins: 50, text: (n) => `Втяни ${n} ${plural(n, "золотой предмет", "золотых предмета", "золотых предметов")}` },
  { id: "storm", goals: [1], coins: 70, text: () => "Попади в тройку в «Буре»" },
  { id: "size", goals: [12, 16], coins: 50, text: (n) => `Вырасти до ${n} м за один раунд`, max: true },
  { id: "rounds", goals: [3, 4], coins: 30, text: (n) => `Сыграй ${n} ${plural(n, "раунд", "раунда", "раундов")}` },
];
export const ALL_DONE_COINS = 60; // за все три задания дня
export const STREAK_COINS = 10; // за каждый день серии (до 7)
const hashDay = (day) => {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619) >>> 0;
  return h;
};
// дата игрока «ГГГГ-ММ-ДД» по местному времени
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayBefore(day) {
  const [y, m, d] = day.split("-").map(Number);
  return today(new Date(y, m - 1, d - 1));
}
// три разных задания дня: [{ id, goal, coins, text }]
export function dailyMissions(day) {
  let h = hashDay(day);
  const next = () => ((h = (Math.imul(h, 1664525) + 1013904223) >>> 0), h);
  const pool = MISSIONS.map((m, k) => k);
  const out = [];
  while (out.length < 3) {
    const k = pool.splice(next() % pool.length, 1)[0];
    const m = MISSIONS[k];
    const goal = m.goals[next() % m.goals.length];
    out.push({ id: m.id, goal, coins: m.coins + (goal > m.goals[0] ? 15 : 0), text: m.text(goal), max: !!m.max });
  }
  return out;
}
// сколько раунд прибавил к заданию
function missionGain(id, r) {
  if (id === "lift") return r.lifted;
  if (id === "eat") return r.ate;
  if (id === "win") return r.place === 1 ? 1 : 0;
  if (id === "top3") return r.place <= 3 ? 1 : 0;
  if (id === "power") return r.powers || 0;
  if (id === "gold") return r.golds || 0;
  if (id === "storm") return r.variant === "storm" && r.place <= 3 ? 1 : 0;
  if (id === "size") return Math.floor(r.best || r.D);
  if (id === "rounds") return 1;
  return 0;
}
// новый день: задания заново, серия продолжается, если вчера играл
export function rollDay(save, day) {
  if (save.dm.day === day) return false;
  save.dm = { day, p: [0, 0, 0], c: [0, 0, 0] };
  return true;
}
export function missionState(save, day) {
  rollDay(save, day);
  return dailyMissions(day).map((m, k) => ({ ...m, have: Math.min(m.goal, save.dm.p[k]), done: !!save.dm.c[k] }));
}

// ---------- Сохранение ----------
export function freshSave() {
  return {
    v: 1,
    coins: 0,
    open: 1, // сколько карт открыто
    map: 0, // выбранная карта
    up: { speed: 0, start: 0, pull: 0, time: 0 },
    skins: [0],
    skin: 0,
    trails: [0],
    trail: 0,
    best: MAPS.map(() => 0), // лучший диаметр ×10 на каждой карте
    cups: MAPS.map(() => 0), // лучшее место на каждой карте (0 — ещё не играл)
    rounds: 0,
    earned: 0,
    sound: 1,
    tips: 0,
    mode: 0, // 0 — «Классика», 1 — «Буря»
    q: -1, // качество графики: -1 авто, 0 низкое, 1 среднее, 2 высокое
    dm: { day: "", p: [0, 0, 0], c: [0, 0, 0] }, // задания дня: прогресс и выполненные
    streak: 0, // серия дней подряд
    sday: "", // последний день с раундом
    boss: 0, // сколько раз втянут Ураган-великан
  };
}
const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
// Чинит что угодно, прочитанное из хранилища
export function cleanSave(raw) {
  const s = freshSave();
  if (!raw || typeof raw !== "object") return s;
  s.coins = int(raw.coins, 0, 1e7, 0);
  s.open = int(raw.open, 1, MAPS.length, 1);
  s.map = int(raw.map, 0, s.open - 1, 0);
  for (const u of UPGRADES) s.up[u.id] = int(raw.up?.[u.id], 0, u.prices.length, 0);
  const ids = (list, all) => [...new Set([0, ...(Array.isArray(list) ? list : []).filter((v) => Number.isInteger(v) && v >= 0 && v < all.length)])].sort((a, b) => a - b);
  s.skins = ids(raw.skins, SKINS);
  s.trails = ids(raw.trails, TRAILS);
  s.skin = s.skins.includes(raw.skin) ? raw.skin : 0;
  s.trail = s.trails.includes(raw.trail) ? raw.trail : 0;
  s.best = MAPS.map((_, k) => int(raw.best?.[k], 0, 99999, 0));
  s.cups = MAPS.map((_, k) => int(raw.cups?.[k], 0, 6, 0));
  s.rounds = int(raw.rounds, 0, 1e7, 0);
  s.earned = int(raw.earned, 0, 1e9, 0);
  s.sound = raw.sound === 0 ? 0 : 1;
  s.tips = int(raw.tips, 0, 1e7, 0);
  // поля, которых в старых сохранениях нет
  s.mode = raw.mode === 1 ? 1 : 0;
  s.q = int(raw.q, -1, 2, -1);
  const day = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const dm = raw.dm && typeof raw.dm === "object" ? raw.dm : {};
  s.dm = { day: day(dm.day), p: [0, 1, 2].map((k) => int(dm.p?.[k], 0, 1e6, 0)), c: [0, 1, 2].map((k) => (dm.c?.[k] ? 1 : 0)) };
  s.streak = int(raw.streak, 0, 1e5, 0);
  s.sday = day(raw.sday);
  s.boss = int(raw.boss, 0, 1e6, 0);
  return s;
}

export function upgradePrice(save, id) {
  const u = UPGRADES.find((x) => x.id === id);
  const level = save.up[id];
  return level < u.prices.length ? u.prices[level] : null;
}
export function buyUpgrade(save, id) {
  const price = upgradePrice(save, id);
  if (price === null || save.coins < price) return false;
  save.coins -= price;
  save.up[id]++;
  return true;
}
export function buyItem(save, kind, id) {
  const list = kind === "skin" ? SKINS : TRAILS;
  const owned = kind === "skin" ? save.skins : save.trails;
  const item = list[id];
  if (!item || owned.includes(id) || save.coins < item.price) return false;
  save.coins -= item.price;
  owned.push(id);
  owned.sort((a, b) => a - b);
  if (kind === "skin") save.skin = id;
  else save.trail = id;
  return true;
}

// Итог раунда в сохранение: монеты, рекорд, кубок, новая карта, задания дня и серия
export function applyResult(save, mapIndex, result, day = today()) {
  const coins = roundCoins(result);
  save.coins += coins.total;
  save.earned += coins.total;
  save.rounds++;
  save.boss += result.bossWins || 0;
  // серия дней: первый раунд нового дня
  let streakBonus = 0;
  if (save.sday !== day) {
    save.streak = save.sday && save.sday === dayBefore(day) ? save.streak + 1 : 1;
    save.sday = day;
    streakBonus = STREAK_COINS * Math.min(7, save.streak);
    save.coins += streakBonus;
    save.earned += streakBonus;
  }
  // задания дня
  rollDay(save, day);
  const missions = dailyMissions(day).map((m, k) => {
    const before = save.dm.p[k];
    const gain = missionGain(m.id, result);
    save.dm.p[k] = Math.min(1e6, m.max ? Math.max(before, gain) : before + gain);
    const now = Math.min(m.goal, save.dm.p[k]);
    let paid = 0;
    if (!save.dm.c[k] && save.dm.p[k] >= m.goal) {
      save.dm.c[k] = 1;
      paid = m.coins;
      save.coins += paid;
      save.earned += paid;
    }
    return { ...m, before: Math.min(m.goal, before), have: now, paid, done: !!save.dm.c[k] };
  });
  let allBonus = 0;
  if (missions.every((m) => m.done) && missions.some((m) => m.paid)) {
    allBonus = ALL_DONE_COINS;
    save.coins += allBonus;
    save.earned += allBonus;
  }
  const d10 = Math.round(result.D * 10);
  const newBest = d10 > save.best[mapIndex] && save.best[mapIndex] > 0;
  const better = d10 > save.best[mapIndex];
  if (better) save.best[mapIndex] = d10;
  const firstWin = result.place === 1 && save.cups[mapIndex] !== 1;
  if (!save.cups[mapIndex] || result.place < save.cups[mapIndex]) save.cups[mapIndex] = result.place;
  let unlocked = -1;
  if (result.place <= 3 && mapIndex === save.open - 1 && save.open < MAPS.length) {
    save.open++;
    unlocked = save.open - 1;
  }
  return { coins, newBest, firstWin, unlocked, missions, allBonus, streakBonus, streak: save.streak };
}

// Всё ли собрано: карты, кубки, улучшения, облики и следы
export function progress(save) {
  const parts = [
    [save.open, MAPS.length],
    [save.cups.filter((c) => c === 1).length, MAPS.length],
    [UPGRADES.reduce((n, u) => n + save.up[u.id], 0), UPGRADES.reduce((n, u) => n + u.prices.length, 0)],
    [save.skins.length, SKINS.length],
    [save.trails.length, TRAILS.length],
  ];
  const have = parts.reduce((n, [a]) => n + a, 0), all = parts.reduce((n, [, b]) => n + b, 0);
  return { have, all, done: have === all };
}
export const TOTAL_PRICE =
  UPGRADES.reduce((n, u) => n + u.prices.reduce((a, b) => a + b, 0), 0) +
  SKINS.reduce((n, s) => n + s.price, 0) +
  TRAILS.reduce((n, s) => n + s.price, 0);
