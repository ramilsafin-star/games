// Монеты, улучшения, облики и сохранение «Вихря». Без DOM: тесты в Node считают экономику.
import { MAPS } from "./rules.js?v=aa0c23d8";

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
  { name: "Ураган", a: "#4a5468", b: "#c8d0e0", c: "#ffffff", mode: 0 },
];

// ---------- Монеты за раунд ----------
export const PLACE_BONUS = [45, 28, 18, 8, 4, 0];
export function roundCoins({ place, D, ate = 0, lifted = 0 }) {
  const size = 10 + Math.round(D * 3) + Math.floor(lifted / 5);
  const bonus = PLACE_BONUS[place - 1] ?? 0;
  const hunt = ate * 6;
  return { size, bonus, hunt, total: size + bonus + hunt };
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

// Итог раунда в сохранение: монеты, рекорд, кубок, новая карта
export function applyResult(save, mapIndex, result) {
  const coins = roundCoins(result);
  save.coins += coins.total;
  save.earned += coins.total;
  save.rounds++;
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
  return { coins, newBest, firstWin, unlocked };
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
