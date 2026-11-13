// Сохранение и всё, что живёт между забегами: сияние, коллекция, сад, постройки, улучшения,
// задание новичка, подарок за вход, рекорд. Без three.js — проверяется в Node (tests/sim.mjs).
// Ключ fonariki-v1 в localStorage; в VK слой host.js копирует его в облако (до 4000 байт).
import {
  BUILDINGS, BUILDING_BY_ID, UPGRADES, UPGRADE_BY_ID, FIREFLY_BY_ID, MUTATION_BY_ID, BOOK_MUTATIONS, FIREFLIES,
  GARDEN, DAILY, START_COINS, QUEST_HOUSES, CREW_MAX, fireflyRate, bookKey, clamp,
} from "./config.js?v=16ea7301";

export const SAVE_KEY = "fonariki-v1";
export const SAVE_LIMIT = 4000;
const DAY = 86400000;

export function fresh() {
  return {
    v: 1,
    coins: START_COINS, // новичку — ровно на два домика (как в сетевой версии)
    best: 0, // лучший забег: ночей пройдено (5 — рассвет)
    dawns: 0,
    runs: 0,
    caught: {}, // "вид:мутация" -> сколько поймано
    garden: [], // светлячки в саду: [вид, мутация, размер]
    up: { jar: 0, boots: 0 },
    build: { house: 0, lamp: 0, flowers: 0, feeder: 0 },
    quest: 3, // 3 — построй домики, 1 — поймай, 2 — отнеси, 0 — готово
    last: 0, // когда игрок был в игре (для дохода сада без него), мс
    day: 0, // день подарка (номер суток UTC)
    streak: 0,
    lang: "ru",
    sound: true,
    quality: "auto",
    crew: 2,
    help: false, // видел «Как играть»
    total: 0, // всего сияния заработано (для итогов и проверок)
  };
}

const num = (v, lo, hi, def) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : def);
const int = (v, lo, hi, def) => Math.floor(num(v, lo, hi, def));

// Чинит любое содержимое: пустое, битое, старое, подправленное руками — всегда годное сохранение
export function clean(raw) {
  const s = fresh();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return s;
  s.coins = num(raw.coins, 0, 1e9, START_COINS);
  s.best = int(raw.best, 0, 5, 0);
  s.dawns = int(raw.dawns, 0, 1e6, 0);
  s.runs = int(raw.runs, 0, 1e7, 0);
  s.total = num(raw.total, 0, 1e12, 0);
  if (raw.caught && typeof raw.caught === "object" && !Array.isArray(raw.caught)) {
    for (const [key, n] of Object.entries(raw.caught)) {
      const [k, m] = key.split(":");
      if (FIREFLY_BY_ID[k] && BOOK_MUTATIONS.includes(m)) s.caught[key] = int(n, 1, 1e7, 1);
    }
  }
  for (const u of UPGRADES) s.up[u.id] = int(raw.up?.[u.id], 0, u.levels.length - 1, 0);
  for (const b of BUILDINGS) s.build[b.id] = int(raw.build?.[b.id], 0, b.costs.length, 0);
  if (Array.isArray(raw.garden)) {
    for (const g of raw.garden) {
      const rec = unpackRec(g);
      if (rec) s.garden.push(rec);
    }
  }
  s.garden.sort((a, b) => fireflyRate(b) - fireflyRate(a));
  s.garden.length = Math.min(s.garden.length, slots(s));
  s.quest = [0, 1, 2, 3].includes(raw.quest) ? raw.quest : Object.keys(s.caught).length ? 0 : 3;
  // старый игрок с домиками, но с заданием «построй» — задание уже выполнено
  if (s.quest === 3 && s.build.house >= QUEST_HOUSES) s.quest = 1;
  s.last = num(raw.last, 0, 1e15, 0);
  s.day = int(raw.day, 0, 1e7, 0);
  s.streak = int(raw.streak, 0, DAILY.maxStreak, 0);
  s.lang = raw.lang === "en" ? "en" : "ru";
  s.sound = raw.sound !== false;
  s.quality = ["auto", "high", "medium", "low"].includes(raw.quality) ? raw.quality : "auto";
  s.crew = int(raw.crew, 1, CREW_MAX, 2);
  s.help = raw.help === true;
  return s;
}

// Светлячок в сохранении — короткий массив [вид, мутация, размер×100]
export const packRec = (rec) => [rec.k, rec.m, Math.round(rec.s * 100)];
export function unpackRec(g) {
  if (!Array.isArray(g) || g.length !== 3) return null;
  const [k, m, s] = g;
  if (!FIREFLY_BY_ID[k] || !(m === "none" || MUTATION_BY_ID[m])) return null;
  const size = Number(s);
  if (!Number.isFinite(size)) return null;
  return { k, m, s: clamp(Math.round(size), 80, 125) / 100 };
}

export function encode(s) {
  return JSON.stringify({ ...s, coins: Math.round(s.coins * 100) / 100, total: Math.floor(s.total), garden: s.garden.map(packRec) });
}
export function decode(text) {
  try {
    return clean(JSON.parse(text));
  } catch {
    return fresh();
  }
}

// ---------- Сад ----------
export const slots = (s) => s.build.house * BUILDING_BY_ID.house.slots;
// доход сада в секунду: светлячки и сами домики, всё вместе ярче от фонарных столбов
export function gardenRate(s) {
  let rate = s.build.house * BUILDING_BY_ID.house.rate;
  for (const rec of s.garden) rate += fireflyRate(rec);
  return rate * (1 + s.build.lamp * BUILDING_BY_ID.lamp.bonus);
}
// кладём светлячков в сад; если мест не хватает, самые слабые возвращаются (их забирает костёр)
export function gardenAdd(s, recs) {
  s.garden.push(...recs.map((r) => ({ k: r.k, m: r.m, s: r.s })));
  s.garden.sort((a, b) => fireflyRate(b) - fireflyRate(a));
  const released = [];
  while (s.garden.length > slots(s)) released.push(s.garden.pop());
  return released;
}
export const offlineHours = (s) => GARDEN.offlineHours + s.build.feeder * BUILDING_BY_ID.feeder.hours;
// сколько сад принёс без игрока: четверть дохода, не дольше offlineHours
export function offlineIncome(s, now) {
  if (!s.last || now - s.last < 60000) return 0;
  const away = Math.min((now - s.last) / 1000, offlineHours(s) * 3600);
  return gardenRate(s) * away * GARDEN.offlineShare;
}
// Цветник: раз в seconds/(число цветников) секунд обычный светлячок в саду становится гигантом.
// state.growIn живёт в памяти. Возвращает выросшего или null.
export function gardenTick(s, dt, state, rng = Math.random) {
  const beds = s.build.flowers;
  if (!beds) return null;
  if (state.growIn == null) state.growIn = BUILDING_BY_ID.flowers.seconds;
  state.growIn -= dt * beds;
  if (state.growIn > 0) return null;
  state.growIn = BUILDING_BY_ID.flowers.seconds;
  const plain = s.garden.filter((r) => r.m === "none");
  if (!plain.length) return null;
  const rec = plain[Math.floor(rng() * plain.length)];
  rec.m = "giant";
  addCaught(s, rec);
  s.garden.sort((a, b) => fireflyRate(b) - fireflyRate(a));
  return rec;
}

// ---------- Коллекция ----------
// true — это первая такая запись
export function addCaught(s, rec) {
  const key = bookKey(rec);
  const isNew = !s.caught[key];
  s.caught[key] = Math.min(1e7, (s.caught[key] || 0) + 1);
  return isNew;
}
export const bookCount = (s) => Object.keys(s.caught).length;
export const bookTotal = () => FIREFLIES.length * BOOK_MUTATIONS.length;

// ---------- Магазин ----------
export const upgradeValue = (s, id) => UPGRADE_BY_ID[id].levels[s.up[id]];
export function upgradeCost(s, id) {
  const u = UPGRADE_BY_ID[id];
  return s.up[id] >= u.levels.length - 1 ? null : u.costs[s.up[id]];
}
export function buyUpgrade(s, id) {
  const cost = upgradeCost(s, id);
  if (cost == null) return "max";
  if (s.coins < cost) return "glow";
  s.coins -= cost;
  s.up[id]++;
  return "ok";
}
export function buildCost(s, id) {
  const b = BUILDING_BY_ID[id];
  return s.build[id] >= b.costs.length ? null : b.costs[s.build[id]];
}
export function build(s, id) {
  const cost = buildCost(s, id);
  if (cost == null) return "max";
  if (s.coins < cost) return "glow";
  s.coins -= cost;
  s.build[id]++;
  // задание новичка: поставил нужное число домиков — дальше «поймай светлячка»
  if (id === "house" && s.build.house >= QUEST_HOUSES && s.quest === 3) s.quest = 1;
  return "ok";
}

// ---------- Подарок за вход ----------
// раз в сутки, растёт, если заходить каждый день (20 × день подряд, до 7)
export function dailyGift(s, now) {
  const today = Math.floor(now / DAY);
  if (s.day === today) return null;
  s.streak = s.day === today - 1 ? Math.min(s.streak + 1, DAILY.maxStreak) : 1;
  s.day = today;
  const gift = DAILY.base * s.streak;
  s.coins += gift;
  return { gift, day: s.streak, next: DAILY.base * Math.min(s.streak + 1, DAILY.maxStreak) };
}

export function finishRun(s, nights, won) {
  s.runs++;
  if (won) s.dawns++;
  const record = nights > s.best;
  if (record) s.best = nights;
  return record;
}
