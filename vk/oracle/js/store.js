// Сохранение «Лунного оракула»: одна короткая строка JSON в localStorage под ключом oracle-v1.
// В VK слой vk-host.js сам копирует её в облачное хранилище приложения (VKWebAppStorageSet),
// больше никуда данные не уходят. Размер — пара сотен байт (лимит облака VK — 4096).
export const SAVE_KEY = "oracle-v1";
const HISTORY = 30; // сколько последних карт дня помним
const NAME_MAX = 40;

export function fresh(salt = (Math.random() * 2 ** 31) | 0) {
  return {
    salt, // случайная «соль» пользователя: от неё зависит карта дня
    onboarded: false,
    name: "",
    birth: "", // "ГГГГ-ММ-ДД"
    partner: "", // дата второго человека для совместимости
    partnerName: "",
    lastDay: -1, // день, когда последний раз открыта карта дня
    streak: 0,
    best: 0,
    history: [], // номера карт дня (по колоде), последние HISTORY штук
    celticDay: -1, // день бесплатного «Кельтского креста»
    detailDay: -1, // день бесплатного подробного толкования
    runeDay: -1, // день, когда перевёрнута руна дня
    sound: true,
  };
}

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v, def) => (Number.isFinite(+v) ? Math.trunc(+v) : def);
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function decode(text) {
  const s = fresh();
  if (!text) return s;
  try {
    const o = JSON.parse(text);
    if (o.v !== 1) return s;
    s.salt = int(o.s, s.salt) | 0;
    s.onboarded = !!o.o;
    s.name = str(o.n, NAME_MAX);
    s.birth = isDate(o.b) ? o.b : "";
    s.partner = isDate(o.p) ? o.p : "";
    s.partnerName = str(o.q, NAME_MAX);
    s.lastDay = int(o.d, -1);
    s.streak = Math.max(0, int(o.k, 0));
    s.best = Math.max(s.streak, int(o.m, 0));
    s.history = String(o.h || "")
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((x) => x >= 0 && x < 78)
      .slice(-HISTORY);
    s.celticDay = int(o.c, -1);
    s.detailDay = int(o.r, -1);
    s.runeDay = int(o.u, -1);
    s.sound = o.x !== 0;
  } catch {
    // испорченное сохранение — начинаем заново, приложение не падает
  }
  return s;
}

export function encode(s) {
  const o = { v: 1, s: s.salt, o: s.onboarded ? 1 : 0, d: s.lastDay, k: s.streak, m: s.best, c: s.celticDay, r: s.detailDay, u: s.runeDay, x: s.sound ? 1 : 0 };
  if (s.name) o.n = s.name.slice(0, NAME_MAX);
  if (s.birth) o.b = s.birth;
  if (s.partner) o.p = s.partner;
  if (s.partnerName) o.q = s.partnerName.slice(0, NAME_MAX);
  if (s.history.length) o.h = s.history.slice(-HISTORY).join(",");
  return JSON.stringify(o);
}

// Открыть карту дня: серия растёт, если вчера тоже открывали; повторное открытие в тот же день ничего не меняет
export function openDaily(s, day, cardIndex) {
  if (s.lastDay === day) return false;
  s.streak = s.lastDay === day - 1 ? s.streak + 1 : 1;
  s.best = Math.max(s.best, s.streak);
  s.lastDay = day;
  s.history = [...s.history, cardIndex].slice(-HISTORY);
  return true;
}
// Серия, которую видно сегодня: если пропущен вчерашний день, она уже прервалась
export const liveStreak = (s, day) => (s.lastDay === day || s.lastDay === day - 1 ? s.streak : 0);
