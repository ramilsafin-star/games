// Снежинки (монеты), улучшения, облики кома и сохранение. Без DOM — проверяется в Node.
import { LEVEL_COUNT } from "./levels.js?v=9883aac5";
import { START, WEAPON } from "./rules.js?v=9883aac5";

export const SAVE_KEY = "snezhok-v1";

export const UPGRADES = [
  { id: "start", name: "Большой старт", max: 10, base: 70, grow: 1.66 },
  { id: "coin", name: "Снежный бонус", max: 10, base: 90, grow: 1.68 },
  { id: "magnet", name: "Магнит", max: 8, base: 80, grow: 1.8 },
  // оружие: дольше пушка, чаще снежки, дольше шипы
  { id: "gun", name: "Пушка дольше", max: 8, base: 160, grow: 1.6, arms: true },
  { id: "rate", name: "Скорострельность", max: 8, base: 180, grow: 1.62, arms: true },
  { id: "spike", name: "Шипы дольше", max: 8, base: 150, grow: 1.6, arms: true },
];
const round5 = (v) => (v < 1000 ? Math.round(v / 5) * 5 : Math.round(v / 50) * 50);
export const upgradeCost = (index, k) => {
  const u = UPGRADES[index];
  return k >= u.max ? null : round5(u.base * u.grow ** k);
};
export const startSize = (k) => START + 2 * k;
export const coinBonus = (k) => 1 + 0.08 * k;
export const magnetRadius = (k) => (k ? 0.6 + 0.45 * k : 0);
export const gunTime = (k) => WEAPON.gun.time + 0.6 * k;
export const gunRate = (k) => WEAPON.gun.rate + 0.35 * k;
export const spikeTime = (k) => WEAPON.spike.time + 0.6 * k;
// снаряжение заезда из улучшений
export function gear(up, skinIndex = 0) {
  const sk = SKINS[skinIndex] || SKINS[0];
  return {
    start: startSize(up[0]),
    magnet: magnetRadius(up[2]) + (sk.magnetAdd || 0),
    gunTime: gunTime(up[3] || 0) + (sk.weaponAdd || 0),
    gunRate: gunRate(up[4] || 0),
    spikeTime: spikeTime(up[5] || 0) + (sk.weaponAdd || 0),
    skin: sk,
  };
}
// снежки пушки «с собой» за ролик
export const AD_AMMO = 40;
export function upgradeText(index, k) {
  if (index === 0) return `Ком на старте: ${startSize(k)}`;
  if (index === 1) return k ? `Снежинок за уровень +${k * 8}%` : "Снежинки без надбавки";
  if (index === 3) return `Пушка стреляет ${gunTime(k).toFixed(1).replace(".", ",")} с`;
  if (index === 4) return `${gunRate(k).toFixed(1).replace(".", ",")} снежка в секунду`;
  if (index === 5) return `Шипы держатся ${spikeTime(k).toFixed(1).replace(".", ",")} с`;
  return k ? `Тянет снежинки издалека: ${magnetRadius(k).toFixed(1)} м` : "Снежинки — только вплотную";
}

export const SKINS = [
  { id: "snow", name: "Снежок", price: 0, perk: "Классический ком" },
  { id: "ice", name: "Ледышка", price: 500, perk: "−20% урона от льда и камней", iceArmor: 0.8 },
  { id: "candy", name: "Карамелька", price: 1200, perk: "+15% снега из сугробов", pileK: 1.15 },
  { id: "orange", name: "Мандарин", price: 2500, perk: "Магнит шире на +0,8 м", magnetAdd: 0.8 },
  { id: "disco", name: "Диско-шар", price: 4500, perk: "+15% снежинок за уровень", coinK: 1.15 },
  { id: "night", name: "Звёздная ночь", price: 7000, perk: "Духи тянут вдвое слабее", spiritK: 0.5 },
  { id: "hunter", name: "Охотник на йети", price: 0, kills: 40, perk: "+25% снега за монстров", crushK: 1.25 },
  { id: "storm", name: "Буран", price: 0, kills: 120, perk: "Пушка и шипы на +1,5 с дольше", weaponAdd: 1.5 },
];
export const skinOpen = (s, i) => !!(s.sk & (1 << i)) || (SKINS[i].kills && s.kl >= SKINS[i].kills);

// Награда за уровень: снежинки × ступень финала × бонус, плюс за сам уровень, за босса — сверху
export function levelReward(level, run, coinLevel, skinIndex = 0) {
  const base = 10 + 2 * level.n;
  const mult = Math.max(1, run.mult || 1);
  const bonus = coinBonus(coinLevel) * (SKINS[skinIndex]?.coinK || 1);
  const boss = level.boss && run.bossDown ? 100 * (level.mountain + 1) : 0;
  const quest = level.quest && run.questDone ? level.quest.reward : 0;
  const total = Math.round(run.coins * mult * bonus) + base + boss + quest;
  return { base, flakes: run.coins, mult, bonus, boss, quest, kills: run.kills?.all || 0, total };
}

// ---------- Сохранение ----------
// lv — первый непройденный уровень (LEVEL_COUNT + 1 — пройдено всё), at — выбранный в меню,
// co — снежинки, up — уровни улучшений, sk — купленные облики (биты), cur — надетый облик,
// snd — звук, best — лучшая ступень по уровням (символы 0-9, a = ×10), kl — побеждено монстров
// за всё время (облики за охоту), q — качество графики (0 — само, 1 — высокое, 2 — среднее, 3 — низкое)
export function freshSave() {
  return { v: 1, lv: 1, at: 1, co: 0, up: [0, 0, 0, 0, 0, 0], sk: 1, cur: 0, snd: 1, best: "", kl: 0, q: 0 };
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
  s.kl = int(raw.kl, 0, 1e7, 0);
  s.q = int(raw.q, 0, 3, 0);
  s.cur = int(raw.cur, 0, SKINS.length - 1, 0);
  if (!skinOpen(s, s.cur)) s.cur = 0;
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
