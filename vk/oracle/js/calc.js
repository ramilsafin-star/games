// Расчёты «Лунного оракула»: даты, детерминированный выбор карты и руны дня, нумерология,
// сюцай, фаза Луны. Без DOM — работает и в Node (tests/logic.mjs).
// Методики подробно описаны в README.md (раздел «Как считаем»).

// ---------- Даты ----------
// Номер дня по местному календарю (1 января 1970 = 0): одинаков весь день с полуночи до полуночи
export const dayNumber = (date = new Date()) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);

// "1991-03-14" → { d: 14, m: 3, y: 1991 } или null, если дата неправильная
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  if (!validDate(d, mo, y)) return null;
  return { d, m: mo, y };
}
export function validDate(d, m, y) {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const formatDate = ({ d, m, y }) => `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
export const isoDate = ({ d, m, y }) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// ---------- Случайность ----------
// Хеш строки в 32 бита (xmur3) — одинаковый в любом браузере и в Node
export function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// Карта дня: зависит только от «соли» пользователя (случайное число из сохранения) и номера дня.
// Чтобы карта не повторялась два дня подряд: в чётные дни берётся «сырая» карта дня, а в нечётные —
// сырая, если она не совпадает с картами соседних чётных дней, иначе следующая по хешу.
function rawPick(salt, day, kind, n) {
  return hash(`${salt}:${day}:${kind}`) % n;
}
export function dailyPick(salt, day, kind, n) {
  const raw = rawPick(salt, day, kind, n);
  if (((day % 2) + 2) % 2 === 0) return raw;
  const avoid = [rawPick(salt, day - 1, kind, n), rawPick(salt, day + 1, kind, n)];
  let c = raw;
  for (let k = 1; avoid.includes(c); k++) c = hash(`${salt}:${day}:${kind}:${k}`) % n;
  return c;
}

// Честная случайность для раскладов: перемешивание колоды (Фишер — Йетс)
export function randomInt(n, rnd = Math.random) {
  return Math.floor(rnd() * n);
}
export function shuffled(n, rnd = Math.random) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1, rnd);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Генератор псевдослучайных чисел с зерном (mulberry32) — для узоров и проверок
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Нумерология ----------
export const digitSum = (n) => String(n).split("").reduce((s, c) => s + (+c || 0), 0);

// Сводит число к одной цифре, по пути запоминает шаги; keep — мастер-числа, которые не сокращаются
export function reduce(n, keep = []) {
  const steps = [n];
  while (n > 9 && !keep.includes(n)) {
    n = digitSum(n);
    steps.push(n);
  }
  return { n, steps };
}
const chain = (r) => r.steps.join(" → ");
export const MASTER = [11, 22, 33];

// Число жизненного пути: день, месяц и год сводятся отдельно (мастер-числа 11 и 22 сохраняются),
// затем складываются и снова сводятся с сохранением 11, 22, 33.
export function lifePath(b) {
  const d = reduce(b.d, [11, 22]);
  const m = reduce(b.m, [11]);
  const y = reduce(b.y, [11, 22]);
  const total = reduce(d.n + m.n + y.n, MASTER);
  return {
    n: total.n,
    how: `день ${chain(d)}, месяц ${chain(m)}, год ${chain(y)}; ${d.n} + ${m.n} + ${y.n} = ${total.steps.join(" → ")}`,
  };
}

// Число дня рождения: день месяца, сведённый к одной цифре; 11 и 22 остаются
export function birthdayNumber(b) {
  const r = reduce(b.d, [11, 22]);
  return { n: r.n, how: `день ${chain(r)}` };
}

// Личный год: день + месяц рождения + текущий год, всё сведено к 1–9
export function personalYear(b, year) {
  const d = reduce(b.d).n,
    m = reduce(b.m).n,
    y = reduce(year).n;
  const r = reduce(d + m + y);
  return { n: r.n, how: `${d} (день) + ${m} (месяц) + ${y} (${year} год) = ${r.steps.join(" → ")}` };
}
// Личный месяц: личный год + номер текущего месяца, сведено к 1–9
export function personalMonth(b, year, month) {
  const py = personalYear(b, year).n;
  const mo = reduce(month).n;
  const r = reduce(py + mo);
  return { n: r.n, how: `${py} (личный год) + ${mo} (месяц) = ${r.steps.join(" → ")}` };
}

// Пифагорейская таблица для русского алфавита: А И С Ъ = 1, Б Й Т Ы = 2 … З Р Щ = 9
const RU = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
const EN = "abcdefghijklmnopqrstuvwxyz";
export function letterValue(ch) {
  const c = ch.toLowerCase();
  let i = RU.indexOf(c);
  if (i >= 0) return (i % 9) + 1;
  i = EN.indexOf(c);
  if (i >= 0) return (i % 9) + 1;
  return 0;
}
// Число судьбы по имени: сумма значений всех букв, сведённая с сохранением 11, 22, 33
export function nameNumber(name) {
  const letters = [...(name || "")].filter((c) => letterValue(c) > 0);
  if (!letters.length) return null;
  const sum = letters.reduce((s, c) => s + letterValue(c), 0);
  const r = reduce(sum, MASTER);
  return { n: r.n, letters: letters.map((c) => [c.toUpperCase(), letterValue(c)]), how: `${letters.map((c) => letterValue(c)).join(" + ")} = ${r.steps.join(" → ")}` };
}

// Совместимость: числа жизненного пути двух людей приводятся к 1–9 (11 → 2, 22 → 4, 33 → 6),
// «число пары» — их сумма, сведённая к 1–9. Группы 1-5-7, 2-4-8, 3-6-9 — «одна семья чисел».
export const base9 = (n) => (n > 9 ? reduce(n).n : n);
const GROUP = { 1: "a", 5: "a", 7: "a", 2: "b", 4: "b", 8: "b", 3: "c", 6: "c", 9: "c" };
export function compatibility(a, b) {
  const pa = lifePath(a),
    pb = lifePath(b);
  const x = base9(pa.n),
    y = base9(pb.n);
  const pair = reduce(x + y).n;
  const same = GROUP[x] === GROUP[y];
  // Процент симметричен и всегда доброжелателен: 72–94
  const score = 68 + (same ? 14 : 4) + ((x * y + pair * 3) % 13);
  return { a: pa.n, b: pb.n, pair, same, score };
}

// ---------- Сюцай ----------
const dateDigits = (b) => (String(b.d).padStart(2, "0") + String(b.m).padStart(2, "0") + String(b.y)).split("").map(Number);

// Число сознания: день рождения, сведённый к одной цифре 1–9 (мастер-чисел нет)
export function consciousness(b) {
  const r = reduce(b.d);
  return { n: r.n, how: `день ${chain(r)}` };
}
// Число миссии: сумма всех цифр даты ДД.ММ.ГГГГ, сведённая к 1–9
export function mission(b) {
  const digits = dateDigits(b);
  const r = reduce(digits.reduce((s, x) => s + x, 0));
  return { n: r.n, how: `${digits.join(" + ")} = ${r.steps.join(" → ")}` };
}
// Матрица 3×3: сколько раз каждая цифра 1–9 встречается в дате (нули не считаются).
// Раскладка ячеек: 1 2 3 / 4 5 6 / 7 8 9; «линия денег» — цифры 1, 4, 7 (левый столбец).
export function matrix(b) {
  const counts = Array(10).fill(0);
  for (const x of dateDigits(b)) if (x) counts[x]++;
  const missing = [1, 4, 7].filter((x) => !counts[x]);
  return { counts, money: { full: missing.length === 0, missing } };
}

// ---------- Луна ----------
// Возраст Луны в днях от новолуния 6 января 2000 (18:14 UTC), синодический месяц 29,53 суток
const SYNODIC = 29.530588853;
export function moonPhase(date = new Date()) {
  const age = ((((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % SYNODIC) + SYNODIC) % SYNODIC;
  const f = age / SYNODIC; // 0 — новолуние, 0,5 — полнолуние
  const names = ["Новолуние", "Растущий серп", "Первая четверть", "Растущая Луна", "Полнолуние", "Убывающая Луна", "Последняя четверть", "Убывающий серп"];
  return { age, f, name: names[Math.round(f * 8) % 8] };
}
