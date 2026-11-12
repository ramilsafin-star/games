// «Лига двора»: три кубка с соперниками-характерами и испытаниями, монетки, раздевалка (мячи, форма,
// украшения двора), награды-значки и сохранение. Без графики — проверяется tests/league.mjs.
import { TRIALS } from "./match.js?v=b03c5ace";

// Все футболисты. Котик и Коала открываются победой в кубке (номер кубка — в LOCKED)
export const HEROES = ["fox", "raccoon", "bunny", "bear", "frog", "panda", "cat", "koala"];
export const LOCKED = { cat: 0, koala: 1 };

// Характеры соперников: подпись в лесенке и подсказка, как обыграть
export const STYLE_TEXT = {
  plain: { tag: "", tip: "" },
  jumper: { tag: "прыгает за каждым мячом", tip: "Бей низом — он перепрыгнет мяч" },
  hunter: { tag: "хватает бонусы", tip: "Успей к бонусу первым" },
  keeper: { tag: "стоит в воротах", tip: "Бей навесом через него" },
  lobber: { tag: "бьёт навесом", tip: "Прыгай и отбивай головой" },
  rusher: { tag: "всё время в атаке", tip: "Отбери мяч и беги к его воротам" },
  strong: { tag: "часто бьёт звёздным", tip: "Прыгай над звёздным мячом" },
};

// Кубки: день, закат и вечер с огнями. step — соперник (rival, nick, level, style) или испытание (trial)
export const TIERS = [
  {
    id: "yard",
    name: "Кубок двора",
    sky: "day",
    prize: 20,
    steps: [
      { rival: "bunny", nick: "Попрыгунья", level: "easy", style: "jumper" },
      { rival: "raccoon", nick: "Хитрюга", level: "easy", style: "hunter" },
      { rival: "bear", nick: "Вратарь", level: "easy", style: "keeper" },
    ],
  },
  {
    id: "street",
    name: "Кубок улицы",
    sky: "sunset",
    prize: 30,
    steps: [
      { rival: "frog", nick: "Прыгун", level: "mid", style: "jumper" },
      { rival: "cat", nick: "Навесник", level: "mid", style: "lobber" },
      { trial: "targets" },
      { rival: "fox", nick: "Торпеда", level: "mid", style: "rusher" },
      { rival: "panda", nick: "Силач", level: "hard", style: "strong" },
    ],
  },
  {
    id: "city",
    name: "Кубок города",
    sky: "night",
    prize: 50,
    steps: [
      { rival: "koala", nick: "Облачко", level: "mid", style: "lobber" },
      { rival: "raccoon", nick: "Хитрюга", level: "hard", style: "hunter" },
      { trial: "keepy" },
      { rival: "bunny", nick: "Попрыгунья", level: "hard", style: "jumper" },
      { rival: "bear", nick: "Вратарь", level: "hard", style: "keeper" },
      { trial: "keeper" },
      { rival: "panda", nick: "Чемпион", level: "hard", style: "rusher", boss: true },
    ],
  },
];

// Шаги кубка для выбранного героя: если герой — тот же зверёк, что соперник, соперника играет другой
export function stepsFor(tier, hero) {
  const steps = TIERS[tier].steps;
  const used = new Set(steps.filter((s) => s.rival).map((s) => s.rival));
  const spare = HEROES.filter((k) => k !== hero && !used.has(k));
  return steps.map((s) => (s.rival === hero ? { ...s, rival: spare.shift() || HEROES.find((k) => k !== hero) } : { ...s }));
}

// Раздевалка. id у всех вещей разные
export const SHOP = {
  ball: [
    { id: "classic", name: "Пятнистый", price: 0 },
    { id: "melon", name: "Арбуз", price: 25 },
    { id: "sun", name: "Солнышко", price: 40 },
    { id: "planet", name: "Планета", price: 60 },
  ],
  kit: [
    { id: "home", name: "Своя форма", price: 0 },
    { id: "stripes", name: "Полоски", price: 30 },
    { id: "dots", name: "Звёздочки", price: 45 },
    { id: "gold", name: "Золотая", price: 90 },
  ],
  decor: [
    { id: "balloons", name: "Шарики на заборе", price: 30 },
    { id: "lights", name: "Гирлянда огоньков", price: 50 },
    { id: "fireworks", name: "Салют после гола", price: 70 },
  ],
};
export const ITEM_BY_ID = Object.fromEntries(Object.entries(SHOP).flatMap(([cat, list]) => list.map((it) => [it.id, { ...it, cat }])));

// Награды-значки: за каждую +10 монеток
export const ACH = [
  { id: "goal", icon: "⚽", name: "Первый гол", text: "Забей гол в кубке" },
  { id: "hat", icon: "🎩", name: "Хет-трик", text: "Три гола за один матч" },
  { id: "clean", icon: "🧱", name: "Сухая победа", text: "Победи, не пропустив ни одного гола" },
  { id: "star", icon: "🌟", name: "Звёздный гол", text: "Забей звёздным ударом" },
  { id: "head", icon: "🙌", name: "Головой!", text: "Забей гол головой" },
  { id: "lob", icon: "🌈", name: "Навесом", text: "Забей гол навесом" },
  { id: "bonus", icon: "🎁", name: "Собиратель", text: "Возьми 10 бонусов" },
  { id: "golden", icon: "🥇", name: "Золотой гол", text: "Победи золотым голом" },
  { id: "cup1", icon: "🏆", name: "Чемпион двора", text: "Выиграй Кубок двора" },
  { id: "cup2", icon: "🏆", name: "Чемпион улицы", text: "Выиграй Кубок улицы" },
  { id: "cup3", icon: "👑", name: "Чемпион города", text: "Выиграй Кубок города" },
  { id: "aim", icon: "🎯", name: "Снайпер", text: "9 шариков в «Метком ударе»" },
  { id: "juggle", icon: "🤹", name: "Жонглёр", text: "20 касаний в «Чеканке»" },
  { id: "wall", icon: "🧤", name: "Стена", text: "Отбей все 10 мячей в «Вратаре»" },
];
export const ACH_COINS = 10;

// ---------- Сохранение ----------
// Старое сохранение (v1: cups, hero, sound, music, heard) читается как есть, новые поля — по умолчанию
export function migrate(raw) {
  const s = raw && typeof raw === "object" && raw.v === 1 ? raw : {};
  const num = (v, max = 1e6) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 40) : []);
  const out = {
    v: 1,
    cups: num(s.cups),
    hero: HEROES.includes(s.hero) ? s.hero : "fox",
    sound: s.sound !== false,
    music: s.music !== false,
    heard: s.heard && typeof s.heard === "object" ? s.heard : {},
    coins: num(s.coins),
    // Сколько раз выигран каждый кубок; старые кубки засчитываются Кубку двора
    won: [0, 1, 2].map((i) => num(s.won?.[i])),
    tier: num(s.tier, 2),
    // Начатый кубок: [номер кубка, шаг] — можно продолжить после перерыва
    run: Array.isArray(s.run) && s.run.length === 2 ? [num(s.run[0], 2), num(s.run[1], 9)] : null,
    own: list(s.own).filter((id) => ITEM_BY_ID[id]),
    ball: ITEM_BY_ID[s.ball]?.cat === "ball" ? s.ball : "classic",
    kit: ITEM_BY_ID[s.kit]?.cat === "kit" ? s.kit : "home",
    decor: list(s.decor).filter((id) => ITEM_BY_ID[id]?.cat === "decor"),
    ach: list(s.ach).filter((id) => ACH.some((a) => a.id === id)),
    best: { targets: num(s.best?.targets), keepy: num(s.best?.keepy), keeper: num(s.best?.keeper) },
    stats: { goals: num(s.stats?.goals), items: num(s.stats?.items), wins: num(s.stats?.wins) },
    q: ["auto", "high", "mid", "low"].includes(s.q) ? s.q : "auto",
  };
  if (!raw?.won && out.cups > 0) out.won[0] = out.cups;
  return out;
}
export const unlockedTier = (save) => (save.won[1] > 0 ? 2 : save.won[0] > 0 ? 1 : 0);
export const heroLocked = (save, kind) => kind in LOCKED && !(save.won[LOCKED[kind]] > 0);
export const owns = (save, id) => ITEM_BY_ID[id]?.price === 0 || save.own.includes(id);

// Покупка: вернёт true, если хватило монеток
export function buy(save, id) {
  const it = ITEM_BY_ID[id];
  if (!it || owns(save, id) || save.coins < it.price) return false;
  save.coins -= it.price;
  save.own.push(id);
  return true;
}
// Надеть мяч или форму, включить или выключить украшение
export function wear(save, id) {
  const it = ITEM_BY_ID[id];
  if (!it || !owns(save, id)) return false;
  if (it.cat === "decor") save.decor = save.decor.includes(id) ? save.decor.filter((d) => d !== id) : [...save.decor, id];
  else save[it.cat] = id;
  return true;
}

// ---------- Монетки ----------
// Матч в кубке: гол +1, победа +5/+7/+9 (по кубку), ничья или поражение +1 за старание
export function matchCoins(tier, my, won) {
  return my + (won ? 5 + tier * 2 : 1);
}
export function trialStars(mode, score) {
  return TRIALS[mode].stars.filter((n) => score >= n).length;
}
export const trialCoins = (stars) => 2 + stars * 3;

// ---------- Награды ----------
// ev: { type: "match", my, their, won, golden, hows: [как забиты голы игрока] }
//     { type: "cup", tier } | { type: "trial", mode, score } | { type: "item" }
// Возвращает новые значки (уже записанные в save) и начисляет за них монетки
export function award(save, ev) {
  const got = [];
  const give = (id) => {
    if (!save.ach.includes(id)) {
      save.ach.push(id);
      save.coins += ACH_COINS;
      got.push(ACH.find((a) => a.id === id));
    }
  };
  if (ev.type === "goal") {
    give("goal");
    if (ev.how === "star") give("star");
    if (ev.how === "head") give("head");
    if (ev.how === "lob") give("lob");
    if (ev.count >= 3) give("hat");
  } else if (ev.type === "match") {
    if (ev.won && ev.their === 0) give("clean");
    if (ev.won && ev.golden) give("golden");
  } else if (ev.type === "cup") give(["cup1", "cup2", "cup3"][ev.tier]);
  else if (ev.type === "item" && save.stats.items >= 10) give("bonus");
  else if (ev.type === "trial") {
    if (ev.mode === "targets" && ev.score >= 9) give("aim");
    if (ev.mode === "keepy" && ev.score >= 20) give("juggle");
    if (ev.mode === "keeper" && ev.score >= 10) give("wall");
  }
  return got;
}
