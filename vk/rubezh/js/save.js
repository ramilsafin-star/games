// Профиль игрока «Рубежа»: сохранение (ключ rubezh-v1, меньше 4000 байт), покупки, итоги заданий,
// звёзды, звание и достижения. Без графики — проверяется в tests/sim.mjs.
import { WEAPONS, GUNS, PRIMARY, SECONDARY, UPGRADES, UPGRADE_IDS, upgradePrice, GRENADES, GRENADE_IDS, GEAR, KITS, KIT_IDS, ECON, DIFFICULTY, ACHIEVEMENTS, rankOf } from "./data.js?v=7c816b4c";
import { MISSIONS } from "./missions.js?v=7c816b4c";

export const SAVE_KEY = "rubezh-v1";
const N = MISSIONS.length;
const STAT_KEYS = ["kills", "cores", "coreKills", "knife", "emp", "molot", "relays", "rescues", "shots", "hits", "missions", "secs", "matches", "rounds", "dailies", "boss", "deaths", "ghost"];

export const DEFAULT_OPTIONS = { snd: 1, mus: 1, vol: 0.8, sens: 1, tsens: 1, af: 1, aa: 1, q: "auto", inv: 0, fov: 74, hints: 1 };

export function freshSave() {
  return {
    v: 1,
    c: ECON.start,
    s: "0".repeat(N), // звёзды по заданиям
    d: "-".repeat(N), // лучшая пройденная сложность
    w: ["iskra"],
    u: {},
    lo: { p: null, s: "iskra", g: ["frag", null], v: 0, h: 0, k: "none" },
    diff: 1,
    xp: 0,
    a: 0,
    n: {},
    o: { ...DEFAULT_OPTIONS },
    dy: { day: 0, done: 0, streak: 0, total: 0 },
    tut: 0,
    sk: {}, // «Схватка»: открытые карты (по первому заданию карты) — считаются из d
  };
}

const int = (v, a, b, def) => {
  v = Math.round(Number(v));
  return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : def;
};
// Починить что угодно: старое, обрезанное или чужое сохранение
export function cleanSave(raw) {
  const s = freshSave();
  if (!raw || typeof raw !== "object") return s;
  s.c = int(raw.c, 0, 9999999, s.c);
  if (typeof raw.s === "string") s.s = raw.s.replace(/[^0-3]/g, "0").padEnd(N, "0").slice(0, N);
  if (typeof raw.d === "string") s.d = raw.d.replace(/[^\-0-2]/g, "-").padEnd(N, "-").slice(0, N);
  // звёзды без пройденного задания не бывают
  s.s = [...s.s].map((c, i) => (s.d[i] === "-" ? "0" : c === "0" ? "1" : c)).join("");
  if (Array.isArray(raw.w)) s.w = [...new Set(["iskra", ...raw.w.filter((id) => GUNS.includes(id))])];
  if (raw.u && typeof raw.u === "object")
    for (const [id, m] of Object.entries(raw.u)) if (GUNS.includes(id) && s.w.includes(id)) s.u[id] = int(m, 0, 7, 0);
  const lo = raw.lo && typeof raw.lo === "object" ? raw.lo : {};
  s.lo.p = PRIMARY.includes(lo.p) && s.w.includes(lo.p) ? lo.p : null;
  s.lo.s = SECONDARY.includes(lo.s) && s.w.includes(lo.s) ? lo.s : "iskra";
  s.lo.g = [0, 1].map((i) => (Array.isArray(lo.g) && GRENADE_IDS.includes(lo.g[i]) ? lo.g[i] : null));
  s.lo.v = lo.v ? 1 : 0;
  s.lo.h = lo.h ? 1 : 0;
  s.lo.k = KIT_IDS.includes(lo.k) ? lo.k : "none";
  s.diff = int(raw.diff, 0, 2, 1);
  s.xp = int(raw.xp, 0, 9999999, 0);
  s.a = int(raw.a, 0, 2 ** 30, 0);
  if (raw.n && typeof raw.n === "object") for (const k of STAT_KEYS) if (raw.n[k] !== undefined) s.n[k] = int(raw.n[k], 0, 99999999, 0);
  const o = raw.o && typeof raw.o === "object" ? raw.o : {};
  s.o = {
    snd: o.snd === 0 ? 0 : 1,
    mus: o.mus === 0 ? 0 : 1,
    vol: Number.isFinite(+o.vol) ? Math.min(1, Math.max(0, +o.vol)) : 0.8,
    sens: Number.isFinite(+o.sens) ? Math.min(3, Math.max(0.2, +o.sens)) : 1,
    tsens: Number.isFinite(+o.tsens) ? Math.min(3, Math.max(0.2, +o.tsens)) : 1,
    af: o.af === 0 ? 0 : 1,
    aa: o.aa === 0 ? 0 : 1,
    q: ["auto", "low", "mid", "high"].includes(o.q) ? o.q : "auto",
    inv: o.inv ? 1 : 0,
    fov: int(o.fov, 60, 95, 74),
    hints: o.hints === 0 ? 0 : 1,
  };
  const dy = raw.dy && typeof raw.dy === "object" ? raw.dy : {};
  s.dy = { day: int(dy.day, 0, 1e6, 0), done: dy.done ? 1 : 0, streak: int(dy.streak, 0, 9999, 0), total: int(dy.total, 0, 99999, 0) };
  s.tut = raw.tut ? 1 : 0;
  return s;
}
export function encodeSave(s) {
  return JSON.stringify(s);
}
export function decodeSave(text) {
  try {
    return cleanSave(JSON.parse(text));
  } catch {
    return cleanSave(null);
  }
}

// ---------- Прогресс ----------
export const missionsDone = (s) => [...s.d].filter((c) => c !== "-").length;
export const missionDone = (s, i) => s.d[i] !== "-";
export const missionOpen = (s, i) => i === 0 || missionDone(s, i - 1);
export const starsOf = (s, i) => Number(s.s[i]) || 0;
export const totalStars = (s) => [...s.s].reduce((a, c) => a + (Number(c) || 0), 0);
export const mapOpen = (s, mapId) => MISSIONS.some((m) => m.map === mapId && missionDone(s, m.id));
export const owns = (s, id) => s.w.includes(id);
export const weaponOpen = (s, id) => WEAPONS[id].unlock <= missionsDone(s);
export const hasUp = (s, id, up) => !!((s.u[id] || 0) & (1 << UPGRADE_IDS.indexOf(up)));
export const upsOf = (s, id) => ({ mag: hasUp(s, id, "mag"), scope: hasUp(s, id, "scope"), stab: hasUp(s, id, "stab") });
export const stat = (s, k) => s.n[k] || 0;
export const addStat = (s, k, v) => (s.n[k] = (s.n[k] || 0) + Math.round(v));

export function buyWeapon(s, id) {
  const w = WEAPONS[id];
  if (!w || owns(s, id) || !weaponOpen(s, id) || s.c < w.price) return false;
  s.c -= w.price;
  s.w.push(id);
  if (w.slot === "pri") s.lo.p = id;
  else s.lo.s = id;
  return true;
}
export function canUpgrade(s, id, up) {
  return owns(s, id) && !hasUp(s, id, up) && totalStars(s) >= UPGRADES[up].stars && s.c >= upgradePrice(id, up);
}
export function buyUpgrade(s, id, up) {
  if (!canUpgrade(s, id, up)) return false;
  s.c -= upgradePrice(id, up);
  s.u[id] = (s.u[id] || 0) | (1 << UPGRADE_IDS.indexOf(up));
  return true;
}
// снаряжение на задание: броня, шлем, набор, гранаты — оплачивается при выходе на задание
export function gearCost(lo) {
  let c = 0;
  if (lo.v) c += GEAR.vest.price;
  if (lo.h) c += GEAR.helmet.price;
  c += KITS[lo.k || "none"].price;
  for (const g of lo.g || []) if (g) c += GRENADES[g].price;
  return c;
}
// заплатить за снаряжение; не хватает — снимаем самое дорогое, пока не хватит
export function payGear(s) {
  const lo = s.lo;
  while (gearCost(lo) > s.c) {
    if (lo.k !== "none") lo.k = "none";
    else if (lo.h) lo.h = 0;
    else if (lo.g[1]) lo.g[1] = null;
    else if (lo.v) lo.v = 0;
    else if (lo.g[0]) lo.g[0] = null;
    else break;
  }
  const cost = gearCost(lo);
  s.c -= cost;
  return cost;
}
export function loadoutForGame(s) {
  const lo = s.lo;
  const ups = {};
  for (const id of s.w) ups[id] = upsOf(s, id);
  return { loadout: { pri: lo.p, sec: lo.s, g: lo.g.filter(Boolean), vest: !!lo.v, helmet: !!lo.h, kit: lo.k }, ups };
}

// ---------- Итоги задания ----------
// r: { mission, diff, time, stats (сумма по раундам), credits (в бою), deaths, alarm, mods, daily }
export function missionResult(s, r) {
  const m = r.mission;
  const diff = DIFFICULTY[r.diff];
  const pay = diff.pay * (r.payK || 1);
  const first = !missionDone(s, m.id);
  const acc = r.stats.shots ? r.stats.hits / r.stats.shots : 0;
  const fast = r.time <= m.par * (r.diff === 0 ? 1.25 : 1) && acc >= 0.35;
  const ghost = !r.alarm;
  const stars = 1 + (r.deaths === 0 ? 1 : 0) + ((m.star3 === "ghost" ? ghost : fast) ? 1 : 0);
  const rows = [];
  rows.push({ id: "fight", name: "Роботы и цели", amount: r.credits });
  const base = Math.round((m.reward * pay * (first ? 1 : ECON.replay)) / 10) * 10;
  rows.push({ id: "mission", name: first ? "Награда за задание" : "Повторное прохождение", amount: base });
  const accB = Math.max(0, Math.round((acc - ECON.accuracy.from) * 100) * ECON.accuracy.per);
  if (accB) rows.push({ id: "acc", name: `Точность ${Math.round(acc * 100)}%`, amount: accB });
  if (r.time <= m.par) rows.push({ id: "time", name: "Быстрее нормы", amount: ECON.time });
  if (r.deaths === 0) rows.push({ id: "safe", name: "Без потерь", amount: ECON.noDeath });
  if (m.stealth && ghost) rows.push({ id: "ghost", name: "Без тревоги", amount: 500 });
  const total = rows.reduce((a, b) => a + b.amount, 0);
  const before = starsOf(s, m.id);
  // запись
  s.c += total - r.credits; // боевые кредиты уже начислены по ходу
  if (stars > before) s.s = s.s.slice(0, m.id) + stars + s.s.slice(m.id + 1);
  const bestD = s.d[m.id] === "-" ? -1 : Number(s.d[m.id]);
  if (r.diff > bestD) s.d = s.d.slice(0, m.id) + r.diff + s.d.slice(m.id + 1);
  const xp = Math.round(60 + r.stats.kills * 6 + stars * 25 + (first ? 60 : 0)) * (1 + r.diff * 0.25);
  const rankBefore = rankOf(s.xp).index;
  s.xp += Math.round(xp);
  addStat(s, "missions", 1);
  if (m.stealth && ghost) addStat(s, "ghost", 1);
  if (r.stats.rescue) addStat(s, "rescues", 1);
  return { stars, before, rows, total, acc, fast, ghost, xp: Math.round(xp), rankUp: rankOf(s.xp).index > rankBefore, first };
}
// статистика боя → профиль (и за проигранные раунды тоже)
export function addFightStats(s, st, secs) {
  for (const k of ["kills", "cores", "coreKills", "knife", "emp", "molot", "relays", "shots", "hits", "boss"]) addStat(s, k, st[k] || 0);
  addStat(s, "secs", secs);
}

// ---------- Достижения ----------
export function checkAchievements(s, ctx = {}) {
  const got = [];
  const test = {
    first: () => stat(s, "kills") >= 1,
    range: () => s.tut,
    core50: () => stat(s, "coreKills") >= 50,
    sharp: () => ctx.acc >= 0.6 && ctx.won,
    ghost: () => stat(s, "ghost") >= 1,
    saver: () => ctx.rescueClean,
    sapper: () => stat(s, "relays") >= 5,
    emp: () => stat(s, "emp") >= 15,
    knife: () => stat(s, "knife") >= 10,
    molot: () => stat(s, "molot") >= 5,
    boss: () => stat(s, "boss") >= 1,
    match: () => stat(s, "matches") >= 1,
    daily: () => s.dy.total >= 3,
    arsenal: () => GUNS.every((id) => owns(s, id)),
    master: () => Object.values(s.u).some((m) => m === 7),
    stars: () => totalStars(s) >= N * 3,
    veteran: () => [...s.d].every((c) => c === "2"),
  };
  ACHIEVEMENTS.forEach((a, i) => {
    if (s.a & (1 << i)) return;
    if (test[a.id] && test[a.id]()) {
      s.a |= 1 << i;
      got.push(a);
    }
  });
  return got;
}

// ---------- Задание дня ----------
export const dayNumber = (date = new Date()) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
