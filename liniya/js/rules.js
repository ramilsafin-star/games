// Прогресс игрока: звёзды, открытые уровни, подсказки, светлячки, вещи из Мастерской, задача дня,
// награды и качество графики. Одна строка в localStorage («liniya-v1»), меньше 400 байт —
// в облако VK (до 4000) помещается с огромным запасом. Старые сохранения читаются: новые поля
// просто получают значения по умолчанию.
export const SAVE_KEY = "liniya-v1";
export const FREE_HINTS = 3; // подсказки на старте
export const STARS_PER_HINT = 10; // новая подсказка за каждые 10 звёзд
export const SKIP_AHEAD = 2; // сколько уровней можно открыть, перепрыгнув непройденный

export function fresh(n) {
  return {
    stars: new Array(n).fill(0),
    hinted: new Array(n).fill(0),
    fly: new Array(n).fill(0), // светлячок пойман на уровне
    used: 0,
    ad: 0,
    mute: false,
    last: 0,
    time: 0,
    wallet: 0, // светлячки в кошельке
    inks: 1, // купленные линии (биты), классическая есть всегда
    hats: 1, // купленные шапки (биты), «без шапки» есть всегда
    ink: 0,
    hat: 0,
    day: 0, // последняя решённая задача дня (ГГГГММДД)
    streak: 0, // дней подряд
    bestStreak: 0,
    dailies: 0, // всего решено задач дня
    ach: 0, // полученные награды (биты)
    quality: 0, // 0 — авто, 1 — высокое, 2 — низкое
  };
}
const bitsOut = (arr) => {
  let h = "";
  for (let i = 0; i < arr.length; i += 4) {
    let d = 0;
    for (let j = 0; j < 4; j++) if (arr[i + j]) d |= 1 << j;
    h += d.toString(16);
  }
  return h.replace(/0+$/, "");
};
const bitsIn = (text, arr) => {
  const bits = String(text || "");
  for (let i = 0; i < arr.length; i++) arr[i] = (parseInt(bits[i >> 2] || "0", 16) >> (i & 3)) & 1;
};
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

export function decode(text, n) {
  const s = fresh(n);
  if (!text) return s;
  try {
    const o = JSON.parse(text);
    if (o.v !== 1) return s;
    const st = String(o.s || "");
    for (let i = 0; i < n; i++) s.stars[i] = Math.max(0, Math.min(3, Number(st[i]) || 0));
    bitsIn(o.h, s.hinted);
    bitsIn(o.f, s.fly);
    s.used = Math.max(0, o.u | 0);
    s.ad = Math.max(0, o.a | 0);
    s.mute = !!o.m;
    s.last = Math.max(0, Math.min(n - 1, o.l | 0));
    s.time = Math.max(0, Number(o.t) || 0);
    s.wallet = num(o.w, 0, 99999);
    s.inks = num(o.oi, 0, 2 ** 30) | 1;
    s.hats = num(o.oh, 0, 2 ** 30) | 1;
    s.ink = num(o.ci, 0, INKS.length - 1);
    s.hat = num(o.ch, 0, HATS.length - 1);
    if (!(s.inks & (1 << s.ink))) s.ink = 0;
    if (!(s.hats & (1 << s.hat))) s.hat = 0;
    s.day = num(o.dd, 0, 99999999);
    s.streak = num(o.ds, 0, 99999);
    s.bestStreak = Math.max(s.streak, num(o.db, 0, 99999));
    s.dailies = num(o.dn, 0, 99999);
    s.ach = num(o.ac, 0, 2 ** 30);
    s.quality = num(o.q, 0, 2);
  } catch {
    // испорченное сохранение — начинаем заново, игра не падает
  }
  return s;
}

export function encode(s) {
  const o = { v: 1, s: s.stars.join("").replace(/0+$/, ""), h: bitsOut(s.hinted), u: s.used, a: s.ad, m: s.mute ? 1 : 0, l: s.last, t: Math.round(s.time) };
  const extra = { f: bitsOut(s.fly), w: s.wallet, oi: s.inks, oh: s.hats, ci: s.ink, ch: s.hat, dd: s.day, ds: s.streak, db: s.bestStreak, dn: s.dailies, ac: s.ach, q: s.quality };
  // пустые и стартовые значения не пишем — строка короче
  for (const [k, v] of Object.entries(extra)) if (v && !(k === "oi" && v === 1) && !(k === "oh" && v === 1)) o[k] = v;
  return JSON.stringify(o);
}

export const totalStars = (s) => s.stars.reduce((a, b) => a + b, 0);
export const solved = (s) => s.stars.filter((x) => x > 0).length;
export function firstGap(s) {
  const i = s.stars.findIndex((x) => x === 0);
  return i < 0 ? s.stars.length : i;
}
export const isOpen = (s, i) => s.stars[i] > 0 || i <= firstGap(s) + SKIP_AHEAD;
export const hintsLeft = (s) => Math.max(0, FREE_HINTS + Math.floor(totalStars(s) / STARS_PER_HINT) + s.ad - s.used);
export const starsToHint = (s) => STARS_PER_HINT - (totalStars(s) % STARS_PER_HINT);

// Куда вести кнопку «Продолжить»: первый непройденный уровень (или последний сыгранный, если всё пройдено)
export function nextLevel(s) {
  const g = firstGap(s);
  return g < s.stars.length ? g : s.last;
}

// ---------- Светлячки ----------
export const flies = (s) => s.fly.reduce((a, b) => a + b, 0);

// ---------- Мастерская: линии и шапки Тоши (за светлячков) ----------
// glow — светится, rainbow — радуга вдоль линии, dots — искорки
export const INKS = [
  { id: "classic", name: "Классика", price: 0 },
  { id: "mint", name: "Мята", price: 6, ink: "#16a382", hi: "#8ff5d6", edge: "#064a3a" },
  { id: "berry", name: "Малина", price: 8, ink: "#d8326e", hi: "#ff9cc0", edge: "#5a0a2a" },
  { id: "sea", name: "Морская", price: 10, ink: "#1d7fd8", hi: "#9fd8ff", edge: "#0a2c5a" },
  { id: "gold", name: "Золото", price: 15, ink: "#e8a316", hi: "#fff2a6", edge: "#6a4006", glow: "rgba(255,200,60,.85)" },
  { id: "lava", name: "Лава", price: 18, ink: "#ff5a1a", hi: "#ffd36a", edge: "#5a1406", glow: "rgba(255,110,40,.9)" },
  { id: "rainbow", name: "Радуга", price: 25, ink: "#ff5a7a", hi: "#ffffff", edge: "#2a1a4a", rainbow: true },
  { id: "stars", name: "Звёздная", price: 30, ink: "#2a2a8a", hi: "#c8ccff", edge: "#0a0a2a", glow: "rgba(140,160,255,.8)", dots: true },
];
export const HATS = [
  { id: "none", name: "Без шапки", price: 0 },
  { id: "cap", name: "Кепка", price: 6 },
  { id: "bow", name: "Бантик", price: 8 },
  { id: "flower", name: "Цветок", price: 10 },
  { id: "phones", name: "Наушники", price: 14 },
  { id: "ushanka", name: "Ушанка", price: 16 },
  { id: "wizard", name: "Колпак", price: 22 },
  { id: "crown", name: "Корона", price: 30 },
];
export function buy(s, kind, i) {
  const list = kind === "ink" ? INKS : HATS;
  const key = kind === "ink" ? "inks" : "hats";
  const item = list[i];
  if (!item || s[key] & (1 << i) || s.wallet < item.price) return false;
  s.wallet -= item.price;
  s[key] |= 1 << i;
  s[kind] = i;
  return true;
}
export const owned = (s, kind, i) => !!(s[kind === "ink" ? "inks" : "hats"] & (1 << i));
export const boughtCount = (s) => bitCount(s.inks) - 1 + bitCount(s.hats) - 1;
function bitCount(v) {
  let n = 0;
  for (; v; v >>>= 1) n += v & 1;
  return n;
}

// ---------- Задача дня ----------
export const DAILY_REWARD = 3; // светлячков за задачу дня
export const STREAK_BONUS = 5; // и ещё столько за каждый 7-й день подряд
export function dayKey(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
function prevDay(key) {
  const d = new Date(Math.floor(key / 10000), Math.floor(key / 100) % 100 - 1, key % 100);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}
// Какие уровни подходят в задачу дня: пройденные (а пока их мало — первые 12), по кругу от «хэша» даты
export function dailyCandidates(s, key) {
  let pool = s.stars.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
  if (pool.length < 6) pool = Array.from({ length: 12 }, (_, i) => i);
  let h = key >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  const start = h % pool.length;
  return pool.map((_, k) => pool[(start + k) % pool.length]);
}
// Задача дня решена: награда, серия дней. Возвращает, сколько светлячков дали (0 — сегодня уже решали)
export function solveDaily(s, key) {
  if (s.day === key) return 0;
  s.streak = s.day === prevDay(key) ? s.streak + 1 : 1;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  s.day = key;
  s.dailies++;
  const got = DAILY_REWARD + (s.streak % 7 === 0 ? STREAK_BONUS : 0);
  s.wallet += got;
  return got;
}
export const dailyDone = (s, key) => s.day === key;
// серия ещё жива, если вчера или сегодня решали
export const streakNow = (s, key) => (s.day === key || s.day === prevDay(key) ? s.streak : 0);

// ---------- Награды ----------
// ctx: { per — уровней в главе, chapters — число глав }
export const ACHIEVEMENTS = [
  { id: "first", name: "Первая линия", text: "Пройди первый уровень", reward: 2, goal: 1, value: (s) => solved(s) },
  { id: "stars30", name: "Горсть звёзд", text: "Собери 30 звёзд", reward: 3, goal: 30, value: (s) => totalStars(s) },
  { id: "stars100", name: "Звездопад", text: "Собери 100 звёзд", reward: 6, goal: 100, value: (s) => totalStars(s) },
  { id: "stars200", name: "Созвездие", text: "Собери 200 звёзд", reward: 10, goal: 200, value: (s) => totalStars(s) },
  { id: "fly10", name: "Ловец светлячков", text: "Поймай 10 светлячков", reward: 3, goal: 10, value: (s) => flies(s) },
  { id: "fly50", name: "Фонарик", text: "Поймай 50 светлячков", reward: 6, goal: 50, value: (s) => flies(s) },
  { id: "chapter", name: "Глава пройдена", text: "Пройди любую главу целиком", reward: 4, goal: 1, value: (s, c) => best(c, (ch) => countIn(s.stars, c, ch, (x) => x > 0) / c.per) },
  { id: "perfect", name: "Три звезды везде", text: "Собери все звёзды одной главы", reward: 8, goal: 1, value: (s, c) => best(c, (ch) => countIn(s.stars, c, ch, (x) => x === 3) / c.per) },
  { id: "lamp", name: "Светлая глава", text: "Поймай всех светлячков одной главы", reward: 6, goal: 1, value: (s, c) => best(c, (ch) => countIn(s.fly, c, ch, (x) => x > 0) / c.per) },
  { id: "daily1", name: "Задача дня", text: "Реши задачу дня", reward: 2, goal: 1, value: (s) => s.dailies },
  { id: "streak3", name: "Три дня подряд", text: "Решай задачу дня 3 дня подряд", reward: 4, goal: 3, value: (s) => s.bestStreak },
  { id: "streak7", name: "Неделя подряд", text: "Решай задачу дня 7 дней подряд", reward: 10, goal: 7, value: (s) => s.bestStreak },
  { id: "style", name: "Модник", text: "Купи 2 вещи в Мастерской", reward: 3, goal: 2, value: (s) => boughtCount(s) },
  { id: "grove", name: "Лунный свет", text: "Пройди Лунную рощу", reward: 8, goal: 1, value: (s, c) => countIn(s.stars, c, c.chapters - 1, (x) => x > 0) / c.per },
  { id: "all", name: "Мастер линий", text: "Пройди все уровни", reward: 15, goal: 1, value: (s) => solved(s) / s.stars.length },
];
function countIn(arr, c, ch, test) {
  let n = 0;
  for (let i = ch * c.per; i < (ch + 1) * c.per && i < arr.length; i++) if (test(arr[i])) n++;
  return n;
}
function best(c, f) {
  let m = 0;
  for (let ch = 0; ch < c.chapters; ch++) m = Math.max(m, f(ch));
  return m;
}
export const achProgress = (s, a, c) => Math.min(a.goal, a.value(s, c));
// Выдать все заслуженные награды; вернуть список новых
export function grantAchievements(s, c) {
  const got = [];
  ACHIEVEMENTS.forEach((a, i) => {
    if (s.ach & (1 << i)) return;
    if (a.value(s, c) >= a.goal) {
      s.ach |= 1 << i;
      s.wallet += a.reward;
      got.push(a);
    }
  });
  return got;
}
