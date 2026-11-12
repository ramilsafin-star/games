// Снежинки (монеты), улучшения, облики кома и сохранение. Без DOM — проверяется в Node.
import { LEVEL_COUNT } from "./levels.js?v=bd3554ee";
import { START } from "./rules.js?v=bd3554ee";

export const SAVE_KEY = "snezhok-v1";

export const UPGRADES = [
  { id: "start", name: "Большой старт", max: 10, base: 70, grow: 1.66 },
  { id: "coin", name: "Снежный бонус", max: 10, base: 90, grow: 1.68 },
  { id: "magnet", name: "Магнит", max: 8, base: 80, grow: 1.8 },
];
const round5 = (v) => (v < 1000 ? Math.round(v / 5) * 5 : Math.round(v / 50) * 50);
export const upgradeCost = (index, k) => {
  const u = UPGRADES[index];
  return k >= u.max ? null : round5(u.base * u.grow ** k);
};
export const startSize = (k) => START + 2 * k;
export const coinBonus = (k) => 1 + 0.08 * k;
export const magnetRadius = (k) => (k ? 0.6 + 0.45 * k : 0);
export function upgradeText(index, k) {
  if (index === 0) return `Ком на старте: ${startSize(k)}`;
  if (index === 1) return k ? `Снежинок за уровень +${k * 8}%` : "Снежинки без надбавки";
  return k ? `Тянет снежинки издалека: ${magnetRadius(k).toFixed(1)} м` : "Снежинки — только вплотную";
}

export const SKINS = [
  { id: "snow", name: "Снежок", price: 0 },
  { id: "ice", name: "Ледышка", price: 500 },
  { id: "candy", name: "Карамелька", price: 1200 },
  { id: "orange", name: "Мандарин", price: 2500 },
  { id: "disco", name: "Диско-шар", price: 4500 },
  { id: "night", name: "Звёздная ночь", price: 7000 },
];

// Награда за уровень: снежинки × ступень финала × бонус, плюс за сам уровень, за босса — сверху
export function levelReward(level, run, coinLevel) {
  const base = 10 + 2 * level.n;
  const mult = Math.max(1, run.mult || 1);
  const bonus = coinBonus(coinLevel);
  const boss = level.boss && run.bossDown ? 100 * (level.mountain + 1) : 0;
  const total = Math.round(run.coins * mult * bonus) + base + boss;
  return { base, flakes: run.coins, mult, bonus, boss, total };
}

// ---------- Сохранение ----------
// lv — первый непройденный уровень (LEVEL_COUNT + 1 — пройдено всё), at — выбранный в меню,
// co — снежинки, up — уровни улучшений, sk — купленные облики (биты), cur — надетый облик,
// snd — звук, best — лучшая ступень по уровням (символы 0-9, a = ×10)
export function freshSave() {
  return { v: 1, lv: 1, at: 1, co: 0, up: [0, 0, 0], sk: 1, cur: 0, snd: 1, best: "" };
}
const int = (v, a, b, d) => (Number.isInteger(v) && v >= a && v <= b ? v : d);
export function readSave(text) {
  const s = freshSave();
  let raw = null;
  try {
    raw = JSON.parse(text);
  } catch {}
  if (!raw || typeof raw !== "object") return s;
  s.lv = int(raw.lv, 1, LEVEL_COUNT + 1, 1);
  s.at = int(raw.at, 1, Math.min(s.lv, LEVEL_COUNT), Math.min(s.lv, LEVEL_COUNT));
  s.co = int(raw.co, 0, 1e9, 0);
  if (Array.isArray(raw.up)) s.up = UPGRADES.map((u, i) => int(raw.up[i], 0, u.max, 0));
  s.sk = int(raw.sk, 0, (1 << SKINS.length) - 1, 1) | 1;
  s.cur = int(raw.cur, 0, SKINS.length - 1, 0);
  if (!(s.sk & (1 << s.cur))) s.cur = 0;
  s.snd = raw.snd === 0 ? 0 : 1;
  s.best = typeof raw.best === "string" ? raw.best.replace(/[^0-9a]/g, "").slice(0, LEVEL_COUNT) : "";
  return s;
}
export const writeSave = (s) => JSON.stringify(s);
export const bestOf = (s, n) => {
  const c = s.best[n - 1];
  return !c || c === "0" ? 0 : c === "a" ? 10 : Number(c);
};
export function setBest(s, n, mult) {
  const chars = s.best.padEnd(n, "0").split("");
  const now = bestOf(s, n);
  if (mult > now) chars[n - 1] = mult >= 10 ? "a" : String(mult);
  s.best = chars.join("");
}
