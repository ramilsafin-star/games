// «Лунный оракул»: экраны, навигация, сохранение и связь с VK.
// Экраны рисуются строками HTML в #view; кнопки с data-go открывают экран, с data-a — действие.
import { DECK, byId } from "./deck.js?v=3f732425";
import { RUNES, canFlip } from "./runes.js?v=3f732425";
import { SPREADS, spreadById, NORNS, yesNo, bounds, detailReading } from "./spreads.js?v=3f732425";
import * as C from "./calc.js?v=3f732425";
import * as S from "./store.js?v=3f732425";
import { paintCard, backImage, runeSVG } from "./art.js?v=3f732425";
import { storyCanvas, canStory, postStory, canFriend, shareFriend, shareFile } from "./story.js?v=3f732425";
import { Sound } from "./sound.js?v=3f732425";
import { APP } from "./config.js?v=3f732425";

const host = window.vkGameHost;
// В мобильном клиенте VK справа сверху «капсула» с меню — шапка оставляет ей место
if (host?.inVk && /^mobile_(android|iphone|ipad)/.test(new URLSearchParams(location.search).get("vk_platform") || "")) document.body.classList.add("vk-capsule");
// В VK облачное сохранение должно успеть попасть в localStorage до чтения
await host?.ready;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const paras = (t) =>
  String(t)
    .split("\n\n")
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plural = (n, [one, few, many]) => {
  const a = n % 100,
    b = n % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_OF = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const dateLabel = (d = new Date()) => `${d.getDate()} ${MONTHS_OF[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;

// ---------- Сохранение ----------
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // приложение работает и без сохранения
  }
}
const stored = read(S.SAVE_KEY);
let save = S.decode(stored);
const persist = () => write(S.SAVE_KEY, S.encode(save));
// «Соль» карты дня должна сохраниться сразу, иначе после перезапуска карта сменится
if (!stored) persist();
Sound.set(save.sound);

// ---------- Тексты (грузятся по требованию, но заранее, пока человек смотрит главный экран) ----------
const lazy = (fn) => {
  let p = null;
  return () => (p ??= fn());
};
// Пути записаны целиком, чтобы сборка (bust.mjs) могла пометить их версией
const tarotTexts = lazy(() =>
  Promise.all([import("./data/tarot-major.js?v=3f732425"), import("./data/tarot-wands.js?v=3f732425"), import("./data/tarot-cups.js?v=3f732425"), import("./data/tarot-swords.js?v=3f732425"), import("./data/tarot-pentacles.js?v=3f732425")]).then((ms) =>
    Object.assign({}, ...ms.map((m) => m.TEXTS)),
  ),
);
const runeTexts = lazy(() => import("./data/runes-text.js?v=3f732425").then((m) => m.RUNE_TEXTS));
const numberTexts = lazy(() => import("./data/numbers-text.js?v=3f732425"));
const syucaiTexts = lazy(() => import("./data/syucai-text.js?v=3f732425"));

// ---------- Общие куски разметки ----------
const ICON = {
  flame: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.8 2.4-5 .2 1.6.9 2.6 2 3 0-3 .2-5.5.6-8z"/></svg>`,
  spreads: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="12" width="15" height="23" rx="2" transform="rotate(-14 13 23)"/><rect x="27" y="12" width="15" height="23" rx="2" transform="rotate(14 35 23)"/><rect x="16.5" y="9" width="15" height="25" rx="2"/><path d="M24 17l1.6 3.4 3.4 1.6-3.4 1.6L24 27l-1.6-3.4-3.4-1.6 3.4-1.6z"/></svg>`,
  runes: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5c9 0 15 7 15 19s-6 19-15 19S9 36 9 24 15 5 24 5z"/><path d="M20 14v21M20 14l9 6-9 6 9 9"/></svg>`,
  numbers: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="12.5" stroke-dasharray="2 3"/><path d="M19 18h10l-6 13"/></svg>`,
  syucai: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="8" width="32" height="32" rx="3"/><path d="M18.7 8v32M29.3 8v32M8 18.7h32M8 29.3h32"/><circle cx="13.3" cy="13.3" r="2"/><circle cx="24" cy="24" r="2"/><circle cx="34.7" cy="34.7" r="2"/></svg>`,
  career: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17"/><path d="M24 9l4 15-4 15-4-15z"/><path d="M9 24h4M35 24h4"/><circle cx="24" cy="24" r="2"/></svg>`,
};
function moonIcon(f) {
  // f: 0 — новолуние, 0,5 — полнолуние; освещённая часть рисуется двумя дугами
  const r = 7,
    cx = 8,
    cy = 8;
  const rx = Math.abs(Math.cos(f * 2 * Math.PI)) * r;
  let d;
  if (f < 0.5) d = `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx.toFixed(2)} ${r} 0 0 ${f < 0.25 ? 0 : 1} ${cx} ${cy - r}Z`;
  else d = `M${cx} ${cy - r}A${r} ${r} 0 0 0 ${cx} ${cy + r}A${rx.toFixed(2)} ${r} 0 0 ${f < 0.75 ? 0 : 1} ${cx} ${cy - r}Z`;
  return `<svg class="moon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="rgba(255,255,255,.08)"/><path d="${d}" fill="#f3dca0"/></svg>`;
}
const faces = (idx) => `<span class="flip"><span class="face back"></span><span class="face front"><canvas data-card="${idx}"></canvas></span></span>`;
function paintAll(root) {
  for (const cv of root.querySelectorAll("canvas[data-card]")) if (!cv.dataset.done) (cv.dataset.done = "1"), paintCard(cv, DECK[+cv.dataset.card]);
}
const medal = (n, label, big = false) => `<div class="medal${big ? " big" : ""}"><b>${n}</b><span>${esc(label)}</span></div>`;
const note = `<p class="note">Предсказания носят развлекательный характер.</p>`;
function docsLine() {
  const links = [APP.terms && `<a href="${esc(APP.terms)}" target="_blank" rel="noopener">Пользовательское соглашение</a>`, APP.privacy && `<a href="${esc(APP.privacy)}" target="_blank" rel="noopener">Политика конфиденциальности</a>`].filter(Boolean);
  return links.length ? `<p class="small docs">${links.join(" · ")}</p>` : "";
}

// Выбор даты тремя списками — одинаково выглядит на всех телефонах и в браузере
function dateSelects(p, iso) {
  const b = C.parseDate(iso);
  const year = new Date().getFullYear();
  const opt = (v, t, sel) => `<option value="${v}"${sel ? " selected" : ""}>${t}</option>`;
  let d = opt("", "День", !b),
    m = opt("", "Месяц", !b),
    y = opt("", "Год", !b);
  for (let i = 1; i <= 31; i++) d += opt(i, i, b?.d === i);
  MONTHS_OF.forEach((name, i) => (m += opt(i + 1, name, b?.m === i + 1)));
  for (let i = year; i >= 1930; i--) y += opt(i, i, b?.y === i);
  return `<div class="date"><select id="${p}-d" aria-label="День">${d}</select><select id="${p}-m" aria-label="Месяц">${m}</select><select id="${p}-y" aria-label="Год">${y}</select></div>`;
}
function readDate(p) {
  const d = +$(`${p}-d`).value,
    m = +$(`${p}-m`).value,
    y = +$(`${p}-y`).value;
  if (!d && !m && !y) return { state: "empty" };
  if (!C.validDate(d, m, y)) return { state: "bad" };
  return { state: "ok", iso: C.isoDate({ d, m, y }) };
}

// ---------- Всплывашки и окна ----------
let toastTimer = 0;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}
let sheetActions = {};
function showSheet(html, kind, actions = {}) {
  $("sheet-body").innerHTML = html;
  $("sheet").hidden = false;
  $("sheet").dataset.kind = kind;
  sheetActions = actions;
}
function hideSheet() {
  $("sheet").hidden = true;
  $("sheet").dataset.kind = "";
  sheetActions = {};
}
$("sheet").addEventListener("click", async (e) => {
  if (adBusy) return;
  if (e.target === $("sheet")) return hideSheet();
  const b = e.target.closest("[data-a]");
  if (!b || b.disabled) return;
  Sound.tap();
  if (b.dataset.a === "close") return hideSheet();
  await (sheetActions[b.dataset.a] || actions[b.dataset.a])?.(b);
});

// ---------- Навигация ----------
const TITLES = {
  daily: "Карта дня",
  spreads: "Расклады таро",
  table: (p) => spreadById[p.id]?.name || "Расклад",
  runes: "Руны",
  runeDay: "Руна дня",
  norns: "Три норны",
  numbers: "Нумерология",
  syucai: "Сюцай",
  career: "Предназначение",
  profile: "Профиль",
};
const state = { screen: "", params: {}, depth: 0 };
let actions = {}; // действия текущего экрана: data-a → функция
let timers = [];
let renderToken = 0;
const alive = (token) => token === renderToken;

async function show(name, params = {}, how = "push") {
  hideSheet();
  timers.forEach(clearInterval);
  timers = [];
  const token = ++renderToken;
  if (how === "push") {
    history.pushState({ name, params }, "");
    state.depth++;
  } else if (how === "replace") history.replaceState({ name, params }, "");
  state.screen = name;
  state.params = params;
  actions = {};
  document.body.dataset.screen = name;
  $("bar").hidden = name === "welcome";
  $("back").hidden = name === "home";
  $("brand").hidden = name !== "home";
  const title = TITLES[name];
  $("bar-title").textContent = typeof title === "function" ? title(params) : title || "";
  $("bar-title").hidden = name === "home";
  const view = $("view");
  view.scrollTop = 0;
  view.classList.remove("enter");
  await SCREENS[name](view, params, token);
  if (!alive(token)) return;
  void view.offsetWidth;
  view.classList.add("enter");
  paintAll(view);
}
function goBack() {
  if (state.depth > 0) history.back();
  else show("home", {}, "replace");
}
addEventListener("popstate", (e) => {
  if (adBusy) return;
  state.depth = Math.max(0, state.depth - 1);
  const st = e.state || { name: "home", params: {} };
  show(save.onboarded || st.name !== "home" ? st.name : "welcome", st.params || {}, "none");
});
$("back").onclick = () => {
  Sound.tap();
  goBack();
};
$("profile").onclick = () => {
  Sound.unlock();
  Sound.tap();
  if (state.screen !== "profile") show("profile");
};
function paintSound() {
  $("sound").setAttribute("aria-pressed", String(save.sound));
}
$("sound").onclick = () => {
  if (adBusy) return;
  save.sound = !save.sound;
  Sound.set(save.sound);
  if (save.sound) Sound.unlock();
  persist();
  paintSound();
  Sound.tap();
  toast(save.sound ? "Тихие звуки включены" : "Звук выключен");
};
$("view").addEventListener("click", async (e) => {
  if (adBusy) return;
  const go = e.target.closest("[data-go]");
  if (go) {
    Sound.unlock();
    Sound.tap();
    return show(go.dataset.go, go.dataset.tab ? { tab: go.dataset.tab } : {});
  }
  const b = e.target.closest("[data-a]");
  if (!b || b.disabled) return;
  Sound.unlock();
  await actions[b.dataset.a]?.(b, e);
});

// Общие действия, доступные с любого экрана
const common = {
  about() {
    showSheet(aboutHTML(), "about");
  },
  share: (b) => share(b.dataset.kind),
  async friend() {
    try {
      const r = await shareFriend(`${APP.name}: карта дня, таро, руны и нумерология`);
      if (r?.copied) toast("Ссылка скопирована — отправь её другу");
    } catch {
      // человек закрыл окно — ничего страшного
    }
  },
};

// ---------- Экран: знакомство ----------
async function welcome(view) {
  view.innerHTML = `
  <section class="screen welcome">
    <div class="hero">
      <img class="emblem" src="./assets/emblem.jpg" alt="" width="148" height="148">
      <h1 class="logo">${esc(APP.name)}</h1>
      <p class="lead">Карта дня, расклады таро, руны, нумерология и сюцай — спокойные подсказки на каждый день.</p>
    </div>
    <form class="panel form" id="welcome-form" novalidate>
      <label class="field"><span>Как тебя зовут?</span><input id="f-name" maxlength="40" autocomplete="given-name" placeholder="Имя — можно не указывать"></label>
      <div class="field"><span>Дата рождения</span>${dateSelects("f", "")}</div>
      <p class="small">Дата нужна для нумерологии, сюцай и подбора профессий. Имя и дата хранятся только на твоём устройстве и в облачном хранилище приложения ВКонтакте — больше никуда не отправляются.</p>
      <button class="btn primary big" type="submit" id="start">Начать</button>
      <button class="btn ghost" type="button" data-a="skip" id="skip">Пропустить — заполню потом</button>
    </form>
    <p class="note">Предсказания носят развлекательный характер.${APP.age ? ` <b class="age">${esc(APP.age)}</b>` : ""}</p>
    ${docsLine()}
  </section>`;
  const done = () => {
    save.onboarded = true;
    persist();
    state.depth = 0;
    show("home", {}, "replace");
  };
  $("welcome-form").onsubmit = (e) => {
    e.preventDefault();
    Sound.unlock();
    const date = readDate("f");
    if (date.state === "bad") return toast("Проверь дату рождения — такого дня нет");
    save.name = $("f-name").value.trim().slice(0, 40);
    if (date.state === "ok") save.birth = date.iso;
    done();
  };
  actions = { skip: done };
}

// ---------- Экран: главный ----------
async function home(view, _p, token) {
  const day = C.dayNumber();
  const idx = C.dailyPick(save.salt, day, "tarot", DECK.length);
  const opened = save.lastDay === day;
  const T = opened ? await tarotTexts() : null;
  if (!alive(token)) return;
  const streak = S.liveStreak(save, day);
  const hour = new Date().getHours();
  const hello = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 17 ? "Добрый день" : hour < 23 ? "Добрый вечер" : "Доброй ночи";
  const moon = C.moonPhase();
  const card = DECK[idx];
  view.innerHTML = `
  <section class="screen home">
    <div class="hello">
      <p class="eyebrow">${dateLabel()} · ${moonIcon(moon.f)} ${moon.name}</p>
      <h2 class="greet">${hello}${save.name ? ", " + esc(save.name) : ""}</h2>
    </div>
    <button class="daily-tile${opened ? " open" : ""}" data-go="daily" id="daily-tile">
      <span class="mini tcard${opened ? " open" : ""}">${faces(idx)}</span>
      <span class="dt">
        <b>Карта дня</b>
        <span>${opened ? `${esc(card.name)} — ${esc(T[card.id].keys)}` : "Одна карта на весь день. Открой и узнай, о чём он."}</span>
        <em class="streak">${ICON.flame} ${streak ? `Серия: ${streak} ${plural(streak, ["день", "дня", "дней"])}` : "Открывай карту каждый день — начни серию"}</em>
      </span>
    </button>
    <div class="tiles">
      <button class="tile" data-go="spreads" id="go-spreads">${ICON.spreads}<b>Расклады таро</b><span>Да или нет, отношения, работа, Кельтский крест</span></button>
      <button class="tile" data-go="runes" id="go-runes">${ICON.runes}<b>Руны</b><span>Руна дня и «Три норны»</span></button>
      <button class="tile" data-go="numbers" id="go-numbers">${ICON.numbers}<b>Нумерология</b><span>Числа по дате, имени и совместимость</span></button>
      <button class="tile" data-go="syucai" id="go-syucai">${ICON.syucai}<b>Сюцай</b><span>Сознание, миссия и матрица</span></button>
      <button class="tile wide" data-go="career" id="go-career">${ICON.career}<b>Предназначение и профессии</b><span>Сильные стороны и подходящие сферы работы по дате рождения</span></button>
    </div>
    <p class="note">Предсказания носят развлекательный характер · <button class="link" data-a="about">О сервисе</button></p>
  </section>`;
  actions = { ...common };
  // остальное догружается заранее, пока человек смотрит главный экран
  setTimeout(() => {
    tarotTexts();
    runeTexts();
    numberTexts();
    syucaiTexts();
  }, 300);
}

// ---------- Экран: карта дня ----------
function untilTomorrow() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const min = Math.max(1, Math.round((next - now) / 60000));
  const h = Math.floor(min / 60),
    m = min % 60;
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}
function dailyReading(card, t) {
  const day = C.dayNumber();
  const streak = S.liveStreak(save, day);
  return `
    <p class="eyebrow">${dateLabel()}</p>
    <h2 class="card-name">${esc(card.name)}</h2>
    <p class="keys">${esc(t.keys)}</p>
    <p class="lead-text">${esc(t.day)}</p>
    <div class="advice"><b>Совет дня</b><p>${esc(t.advice)}</p></div>
    <details class="more"><summary>Значение карты</summary><p>${esc(t.up)}</p></details>
    <div class="streak-box">${ICON.flame}<div><b>${streak} ${plural(streak, ["день", "дня", "дней"])} подряд</b> · рекорд ${save.best}<br><small>Завтра будет новая карта — через <span id="countdown">${untilTomorrow()}</span></small></div></div>
    <div class="actions">
      <button class="btn primary" data-a="share" data-kind="daily" id="share-daily">${storyOK ? "Поделиться в истории" : "Поделиться картинкой"}</button>
      ${friendOK ? `<button class="btn" data-a="friend" id="friend">Поделиться с другом</button>` : ""}
    </div>
    ${note}`;
}
async function daily(view, _p, token) {
  const day = C.dayNumber();
  const idx = C.dailyPick(save.salt, day, "tarot", DECK.length);
  const card = DECK[idx];
  const T = await tarotTexts();
  if (!alive(token)) return;
  const t = T[card.id];
  const opened = save.lastDay === day;
  view.innerHTML = `
  <section class="screen daily${opened ? " is-open" : ""}">
    <div class="stage">
      <button class="tcard big${opened ? " open" : ""}" id="daily-card" aria-label="${opened ? esc(card.name) : "Открыть карту дня"}">${faces(idx)}</button>
      <p class="hint" id="daily-hint">${opened ? "" : "Коснись карты, чтобы открыть"}</p>
    </div>
    <div class="reading" id="daily-reading">${opened ? dailyReading(card, t) : `<p class="intro">Карта дня одна на весь день — сколько ни заходи, она не поменяется. Сделай вдох и открой её.</p>${note}`}</div>
  </section>`;
  state.share = { kind: "daily", card, t };
  const tick = () => $("countdown") && ($("countdown").textContent = untilTomorrow());
  timers.push(setInterval(tick, 30000));
  actions = { ...common };
  $("daily-card").onclick = async () => {
    if (adBusy || save.lastDay === day) return;
    Sound.unlock();
    S.openDaily(save, day, idx);
    persist();
    $("daily-card").classList.add("open");
    $("daily-card").setAttribute("aria-label", card.name);
    $("daily-hint").textContent = "";
    Sound.chime();
    await sleep(650);
    if (!alive(token)) return;
    $("daily-reading").innerHTML = dailyReading(card, t);
    $("daily-reading").classList.add("appear");
    view.querySelector(".daily").classList.add("is-open");
  };
}

// ---------- Экран: расклады ----------
const today = () => C.dayNumber();
// Кельтский крест: раз в день бесплатно, ещё раз — за ролик (вне VK рекламы нет, и он всегда свободен)
const celticFree = () => !host?.inVk || save.celticDay !== today();
let celticPass = false;
function celticLabel() {
  if (celticFree()) return host?.inVk ? "сегодня бесплатно" : "";
  return "бесплатный уже был сегодня";
}
async function spreads(view) {
  view.innerHTML = `
  <section class="screen spreads">
    <p class="intro">Выбери расклад и задай вопрос про себя. Карты не решают за тебя — они подсказывают, куда посмотреть.</p>
    <div class="list">
      ${SPREADS.map(
        (s) => `<button class="spread-row" data-a="spread" data-id="${s.id}" id="spread-${s.id}">
          <span class="fan f${Math.min(s.count, 5)}">${"<i></i>".repeat(Math.min(s.count, 5))}</span>
          <span class="sr"><b>${s.name}</b><span>${s.lead}</span><em>${s.count} ${plural(s.count, ["карта", "карты", "карт"])}${s.big && celticLabel() ? " · " + celticLabel() : ""}</em></span>
        </button>`,
      ).join("")}
    </div>
    ${note}
  </section>`;
  actions = {
    ...common,
    spread(b) {
      Sound.tap();
      const id = b.dataset.id;
      if (id === "celtic" && !celticFree() && !celticPass) return celticSheet(() => show("table", { id }));
      show("table", { id });
    },
  };
}
function celticSheet(then) {
  const ready = host?.inVk && host.rewardReady;
  showSheet(
    `<h2>Кельтский крест</h2>
    <p>Бесплатный большой расклад сегодня уже был — завтра он снова бесплатный.</p>
    ${ready ? `<button class="btn gold" data-a="celtic-ad" id="celtic-ad">Посмотреть рекламу <small>и сразу разложить Кельтский крест</small></button>` : `<p class="small">Реклама сейчас недоступна — загляни чуть позже или завтра.</p>`}
    <button class="btn ghost" data-a="close">Понятно</button>`,
    "celtic",
    {
      async "celtic-ad"() {
        if (!(host?.inVk && host.rewardReady)) return;
        const ok = await host.rewarded();
        if (ok) {
          celticPass = true;
          hideSheet();
          then();
        } else toast("Реклама не показалась — попробуй чуть позже");
      },
    },
  );
}
addEventListener("vk-reward-ready", () => {
  if ($("sheet").dataset.kind === "celtic") celticSheet(() => show("table", { id: "celtic" }));
  if (tbl?.phase === "read") renderDetailSlot();
});

// ---------- Экран: расклад на столе ----------
let tbl = null;
function layoutTable() {
  const el = $("table");
  if (!el || !tbl) return;
  const box = bounds(tbl.spread);
  const W = el.clientWidth,
    H = el.clientHeight;
  const unit = Math.min(W / (box.w + 0.3), H / (box.h + 0.25), tbl.spread.count === 1 ? 190 : 150);
  const cx = W / 2,
    cy = H / 2;
  el.style.setProperty("--cw", unit + "px");
  tbl.spread.pos.forEach((p, i) => {
    const c = el.querySelector(`[data-slot="${i}"]`);
    if (!c) return;
    const x = (p.x - (box.x0 + box.w / 2)) * unit,
      y = (p.y - (box.y0 + box.h / 2)) * unit;
    c.style.left = cx + x - unit / 2 + "px";
    c.style.top = cy + y - (unit * 1.5) / 2 + "px";
    // откуда карта прилетает при раздаче — из колоды в центре стола
    c.style.setProperty("--dx", -x + "px");
    c.style.setProperty("--dy", -y + "px");
  });
}
function tableHeight() {
  // В книжной ориентации стол — верхняя часть экрана, высота по раскладу; в альбомной — вся левая колонка
  const box = bounds(tbl.spread);
  const wide = innerWidth > innerHeight && innerWidth >= 640;
  if (wide) return null;
  const W = Math.min(innerWidth, 560) - 32;
  const unit = Math.min(W / (box.w + 0.3), tbl.spread.count === 1 ? 190 : 150);
  return Math.min(innerHeight * 0.62, Math.max(unit * (box.h + 0.25), 240));
}
async function table(view, { id }, token) {
  const spread = spreadById[id] || SPREADS[0];
  const T = await tarotTexts();
  if (!alive(token)) return;
  tbl = { spread, T, phase: "ask", draws: [], detail: false };
  view.innerHTML = `
  <section class="screen table-screen">
    <div class="table-wrap"><div class="table" id="table"></div></div>
    <div class="side" id="side"></div>
  </section>`;
  const h = tableHeight();
  if (h) $("table").style.height = h + "px";
  actions = {
    ...common,
    shuffle: () => startSpread(token),
    "open-all": () => openAll(),
    again: () => {
      Sound.tap();
      askPhase();
    },
    detail: () => unlockDetail(false),
    "detail-ad": () => unlockDetail(true),
  };
  askPhase();
  $("table").onclick = (e) => {
    const c = e.target.closest("[data-slot]");
    if (c && !adBusy) openCard(+c.dataset.slot);
  };
}
function deckHTML() {
  return `<div class="deck" id="deck">${"<i class='face back'></i>".repeat(6)}</div>`;
}
function askPhase() {
  tbl.phase = "ask";
  tbl.draws = [];
  tbl.detail = false;
  $("table").innerHTML = deckHTML();
  $("table").classList.remove("dealt");
  layoutTable();
  $("side").innerHTML = `
    <div class="ask">
      <p class="eyebrow">${tbl.spread.count} ${plural(tbl.spread.count, ["карта", "карты", "карт"])}</p>
      <h2>${tbl.spread.name}</h2>
      <p>${tbl.spread.ask}</p>
      <button class="btn primary big" data-a="shuffle" id="shuffle">Перемешать колоду</button>
    </div>
    ${note}`;
  $("view").scrollTop = 0;
}
async function startSpread(token) {
  if (tbl.phase !== "ask" || adBusy) return;
  const spread = tbl.spread;
  if (spread.id === "celtic") {
    if (celticFree()) {
      if (host?.inVk) save.celticDay = today();
      persist();
    } else if (celticPass) celticPass = false;
    else return celticSheet(() => startSpread(token));
  }
  tbl.phase = "shuffle";
  $("side").innerHTML = `<div class="ask"><p class="eyebrow">Колода тасуется</p><h2>${spread.name}</h2><p>Держи вопрос в мыслях…</p></div>`;
  // Явный момент загрузки — здесь (и только здесь) может быть реклама между экранами
  await adBreak();
  if (!alive(token)) return;
  Sound.unlock();
  Sound.riffle();
  $("deck").classList.add("shuffling");
  await sleep(1700);
  if (!alive(token)) return;
  // Вытягиваем карты: перемешанная колода, треть карт перевёрнута
  const order = C.shuffled(DECK.length);
  tbl.draws = spread.pos.map((p, i) => ({ card: DECK[order[i]], reversed: Math.random() < 0.3, open: false }));
  const el = $("table");
  el.innerHTML = tbl.draws
    .map(
      (d, i) =>
        `<button class="tcard slot${d.reversed ? " rev" : ""}${spread.pos[i].cross ? " cross" : ""}" data-slot="${i}" aria-label="Карта ${i + 1}: ${spread.pos[i].name}" style="--i:${i}">${faces(DECK.indexOf(d.card))}<span class="pos-num">${i + 1}</span></button>`,
    )
    .join("");
  layoutTable();
  paintAll(el);
  void el.offsetWidth;
  el.classList.add("dealt");
  tbl.phase = "pick";
  $("side").innerHTML = `<div class="ask"><p class="eyebrow">Карты на столе</p><h2>${spread.name}</h2><p>Открывай карты по одной — или все сразу.</p><button class="btn primary" data-a="open-all" id="open-all">Открыть все</button></div>${note}`;
}
function openCard(i) {
  if (tbl.phase !== "pick") return;
  const d = tbl.draws[i];
  if (!d || d.open) return;
  d.open = true;
  $("table").querySelector(`[data-slot="${i}"]`).classList.add("open");
  Sound.chime(1 + (i % 5) * 0.12);
  if (tbl.draws.every((x) => x.open)) setTimeout(readPhase, 700);
}
async function openAll() {
  for (let i = 0; i < tbl.draws.length; i++) {
    if (tbl.phase !== "pick") return;
    if (!tbl.draws[i].open) {
      openCard(i);
      await sleep(140);
    }
  }
}
function readPhase() {
  if (tbl.phase !== "pick") return;
  tbl.phase = "read";
  const { spread, draws, T } = tbl;
  const yn = spread.id === "yesno" ? yesNo(T[draws[0].card.id].yes, draws[0].reversed) : null;
  $("side").innerHTML = `
    <div class="reading appear" id="reading">
      ${yn ? `<div class="answer a${yn.v}" id="answer"><span>Ответ карт</span><b>${yn.label}</b></div>` : ""}
      ${draws
        .map((d, i) => {
          const t = T[d.card.id];
          const p = spread.pos[i];
          return `<article class="pos">
            <h3><span class="num">${i + 1}</span>${p.name}<small>${p.hint}</small></h3>
            <p class="cname">${esc(d.card.name)}${d.reversed ? " <em>перевёрнута</em>" : ""}</p>
            <p class="keys">${esc(t.keys)}</p>
            <p>${esc(d.reversed ? t.rev : t.up)}</p>
            ${draws.length === 1 ? `<p class="advice-line"><b>Совет.</b> ${esc(t.advice)}</p>` : ""}
          </article>`;
        })
        .join("")}
      <div class="detail" id="detail"></div>
      <div class="actions">
        <button class="btn primary" data-a="share" data-kind="spread" id="share-spread">${storyOK ? "Поделиться в истории" : "Поделиться картинкой"}</button>
        <button class="btn" data-a="again" id="again">Новый расклад</button>
        ${friendOK ? `<button class="btn ghost" data-a="friend">Поделиться с другом</button>` : ""}
      </div>
      ${note}
    </div>`;
  state.share = { kind: "spread" };
  renderDetailSlot();
  if (innerWidth <= innerHeight) $("view").scrollTo({ top: Math.max(0, $("side").offsetTop - $("view").offsetTop - 150), behavior: "smooth" });
}
// Подробное толкование: раз в день бесплатно, дальше — по ролику (в VK). Вне VK — всегда открыто.
function detailState() {
  if (!host?.inVk || save.detailDay !== today()) return "free";
  return host.rewardReady ? "ad" : "wait";
}
function renderDetailSlot() {
  const el = $("detail");
  if (!el || !tbl) return;
  if (tbl.detail) {
    const r = detailReading(tbl.spread, tbl.draws, tbl.T);
    el.innerHTML = `
      <h3 class="dt-title">Подробное толкование</h3>
      ${r.theme.map((p) => `<p>${esc(p)}</p>`).join("")}
      ${r.cards
        .map(
          (c) => `<div class="facet"><b>${esc(c.pos)} · ${esc(c.name)}</b>${c.lines.map(([k, v]) => `<p><i>${k}.</i> ${esc(v)}</p>`).join("")}</div>`,
        )
        .join("")}
      <div class="advice"><b>Совет расклада</b><p>${esc(r.advice)}</p></div>`;
    el.classList.add("open");
    return;
  }
  const st = detailState();
  el.innerHTML =
    st === "free"
      ? `<button class="btn gold" data-a="detail" id="detail-btn">Подробное толкование <small>${host?.inVk ? "бесплатно раз в день" : "общая тема расклада и советы по сферам"}</small></button>`
      : st === "ad"
        ? `<button class="btn gold" data-a="detail-ad" id="detail-ad">Посмотреть рекламу <small>и открыть подробное толкование</small></button><p class="small">Бесплатное толкование сегодня уже было — завтра снова бесплатно.</p>`
        : `<p class="small">Бесплатное подробное толкование сегодня уже было — завтра оно снова бесплатно.</p>`;
}
async function unlockDetail(byAd) {
  if (!tbl || tbl.phase !== "read" || tbl.detail) return;
  Sound.tap();
  if (byAd) {
    if (!(host?.inVk && host.rewardReady)) return;
    const ok = await host.rewarded();
    if (!ok) return toast("Реклама не показалась — попробуй чуть позже");
  } else {
    if (detailState() !== "free") return;
    if (host?.inVk) save.detailDay = today();
    persist();
  }
  tbl.detail = true;
  renderDetailSlot();
  Sound.chime(1.25);
}

// ---------- Экран: руны ----------
async function runes(view) {
  view.innerHTML = `
  <section class="screen runes">
    <p class="intro">Руны Старшего футарка — 24 древних знака, вырезанных на камнях, и пустая руна Вирд. Вытяни руну дня или разложи «Три норны» — прошлое, настоящее и будущее.</p>
    <div class="choice">
      <button class="rune-choice" data-go="runeDay" id="go-rune-day"><span class="stones s1">${runeSVG(RUNES[0], { hidden: true })}</span><b>Руна дня</b><span>Одна руна на весь день</span></button>
      <button class="rune-choice" data-go="norns" id="go-norns"><span class="stones s3">${[RUNES[3], RUNES[9], RUNES[17]].map((r) => runeSVG(r, { hidden: true })).join("")}</span><b>Три норны</b><span>Урд, Верданди и Скульд</span></button>
    </div>
    ${note}
  </section>`;
  actions = { ...common };
}
async function runeDay(view, _p, token) {
  const day = today();
  const rune = RUNES[C.dailyPick(save.salt, day, "rune", RUNES.length)];
  const T = await runeTexts();
  if (!alive(token)) return;
  const t = T[rune.id];
  const opened = save.runeDay === day;
  const reading = () => `
    <h2 class="card-name">${rune.name} <small>${rune.latin}</small></h2>
    <p class="keys">${esc(t.keys)}</p>
    <p class="lead-text">${esc(t.day)}</p>
    <p>${esc(t.up)}</p>
    <div class="advice"><b>Совет руны</b><p>${esc(t.advice)}</p></div>
    <p class="small">Завтра будет новая руна — через ${untilTomorrow()}.</p>
    <div class="actions"><button class="btn primary" data-a="share" data-kind="runeDay" id="share-rune">${storyOK ? "Поделиться в истории" : "Поделиться картинкой"}</button>${friendOK ? `<button class="btn" data-a="friend">Поделиться с другом</button>` : ""}</div>
    ${note}`;
  view.innerHTML = `
  <section class="screen daily rune-day">
    <div class="stage"><button class="rune-big${opened ? " open" : ""}" id="rune-stone" aria-label="${opened ? "Руна " + rune.name : "Перевернуть камень"}">
      <span class="r-hidden">${runeSVG(rune, { hidden: true })}</span><span class="r-shown">${runeSVG(rune)}</span></button>
      <p class="hint" id="rune-hint">${opened ? "" : "Коснись камня, чтобы перевернуть"}</p></div>
    <div class="reading" id="rune-reading">${opened ? reading() : `<p class="intro">Руна дня одна на весь день. Подумай о том, что ждёт тебя сегодня, и переверни камень.</p>${note}`}</div>
  </section>`;
  state.share = { kind: "runeDay", rune, t };
  actions = { ...common };
  $("rune-stone").onclick = async () => {
    if (adBusy || save.runeDay === day) return;
    Sound.unlock();
    save.runeDay = day;
    persist();
    $("rune-stone").classList.add("open");
    $("rune-hint").textContent = "";
    Sound.chime(0.75);
    await sleep(600);
    if (!alive(token)) return;
    $("rune-reading").innerHTML = reading();
    $("rune-reading").classList.add("appear");
  };
}
let nrn = null;
async function norns(view, _p, token) {
  const T = await runeTexts();
  if (!alive(token)) return;
  nrn = { T, phase: "ask", draws: [] };
  view.innerHTML = `
  <section class="screen norns">
    <div class="bag" id="bag"></div>
    <div class="side" id="nside"></div>
  </section>`;
  actions = {
    ...common,
    cast: () => cast(token),
    again: () => {
      Sound.tap();
      nornsAsk();
    },
  };
  nornsAsk();
  $("bag").onclick = (e) => {
    const s = e.target.closest("[data-stone]");
    if (s && !adBusy) openStone(+s.dataset.stone);
  };
}
function nornsAsk() {
  nrn.phase = "ask";
  $("bag").innerHTML = `<div class="pouch" id="pouch">${[RUNES[1], RUNES[5], RUNES[12]].map((r) => runeSVG(r, { hidden: true })).join("")}</div>`;
  $("nside").innerHTML = `<div class="ask"><p class="eyebrow">Три руны</p><h2>Три норны</h2><p>Норны — хранительницы судьбы из северных сказаний: Урд помнит прошлое, Верданди видит настоящее, Скульд знает, что прорастает. Подумай о своей ситуации и вытяни три камня.</p><button class="btn primary big" data-a="cast" id="cast">Вытянуть руны</button></div>${note}`;
}
async function cast(token) {
  if (nrn.phase !== "ask" || adBusy) return;
  nrn.phase = "shuffle";
  $("nside").innerHTML = `<div class="ask"><p class="eyebrow">Камни перемешиваются</p><h2>Три норны</h2><p>Держи вопрос в мыслях…</p></div>`;
  await adBreak();
  if (!alive(token)) return;
  Sound.unlock();
  Sound.riffle(9, 0.11);
  $("pouch").classList.add("shaking");
  await sleep(1300);
  if (!alive(token)) return;
  const order = C.shuffled(RUNES.length);
  nrn.draws = [0, 1, 2].map((i) => {
    const r = RUNES[order[i]];
    return { rune: r, reversed: canFlip(r) && Math.random() < 0.3, open: false };
  });
  $("bag").innerHTML = `<div class="stones-row">${nrn.draws
    .map(
      (d, i) =>
        `<button class="rune-slot" data-stone="${i}" style="--i:${i}" aria-label="${NORNS[i].name}"><span class="r-hidden">${runeSVG(d.rune, { hidden: true })}</span><span class="r-shown">${runeSVG(d.rune, { reversed: d.reversed })}</span><b>${NORNS[i].name}</b></button>`,
    )
    .join("")}</div>`;
  nrn.phase = "pick";
  $("nside").innerHTML = `<div class="ask"><p class="eyebrow">Руны вытянуты</p><h2>Три норны</h2><p>Переверни камни по очереди.</p><button class="btn primary" data-a="open-stones" id="open-stones">Перевернуть все</button></div>${note}`;
  actions["open-stones"] = async () => {
    for (let i = 0; i < 3; i++) {
      if (nrn.phase !== "pick") return;
      openStone(i);
      await sleep(160);
    }
  };
}
function openStone(i) {
  if (nrn.phase !== "pick") return;
  const d = nrn.draws[i];
  if (!d || d.open) return;
  d.open = true;
  $("bag").querySelector(`[data-stone="${i}"]`).classList.add("open");
  Sound.chime(0.7 + i * 0.1);
  if (nrn.draws.every((x) => x.open)) setTimeout(nornsRead, 650);
}
function nornsRead() {
  if (nrn.phase !== "pick") return;
  nrn.phase = "read";
  const { draws, T } = nrn;
  $("nside").innerHTML = `
    <div class="reading appear" id="nreading">
      ${draws
        .map((d, i) => {
          const t = T[d.rune.id];
          return `<article class="pos"><h3><span class="num">${i + 1}</span>${NORNS[i].name}<small>${NORNS[i].hint}</small></h3>
          <p class="cname">${d.rune.name}${d.reversed ? " <em>перевёрнута</em>" : ""}</p><p class="keys">${esc(t.keys)}</p><p>${esc(d.reversed ? t.rev : t.up)}</p></article>`;
        })
        .join("")}
      <div class="advice"><b>Совет Скульд</b><p>${esc(T[draws[2].rune.id].advice)}</p></div>
      <div class="actions"><button class="btn primary" data-a="share" data-kind="norns" id="share-norns">${storyOK ? "Поделиться в истории" : "Поделиться картинкой"}</button><button class="btn" data-a="again" id="norns-again">Вытянуть ещё раз</button></div>
      ${note}
    </div>`;
  state.share = { kind: "norns" };
  if (innerWidth <= innerHeight) $("view").scrollTo({ top: Math.max(0, $("nside").offsetTop - $("view").offsetTop - 150), behavior: "smooth" });
}

// ---------- Дата рождения, если её ещё нет ----------
function needBirth(view, why) {
  view.innerHTML = `
  <section class="screen need">
    <div class="panel form">
      <h2>Нужна дата рождения</h2>
      <p>${why}</p>
      <div class="field"><span>Дата рождения</span>${dateSelects("nb", "")}</div>
      <p class="small">Хранится только на твоём устройстве и в облачном хранилище приложения ВКонтакте.</p>
      <button class="btn primary" data-a="save-birth" id="save-birth">Сохранить и посчитать</button>
    </div>
    ${note}
  </section>`;
  actions = {
    ...common,
    "save-birth"() {
      const d = readDate("nb");
      if (d.state !== "ok") return toast(d.state === "empty" ? "Выбери день, месяц и год" : "Проверь дату — такого дня нет");
      save.birth = d.iso;
      persist();
      Sound.chime();
      show(state.screen, state.params, "none");
    },
  };
}

// ---------- Экран: нумерология ----------
async function numbers(view, params, token) {
  const b = C.parseDate(save.birth);
  if (!b) return needBirth(view, "Числа жизненного пути, дня рождения и личного года считаются по дате рождения.");
  const N = await numberTexts();
  if (!alive(token)) return;
  const tab = params.tab || "date";
  const tabs = `<div class="tabs" role="tablist">${[
    ["date", "По дате"],
    ["name", "По имени"],
    ["pair", "Совместимость"],
  ]
    .map(([k, t]) => `<button role="tab" class="${k === tab ? "on" : ""}" aria-selected="${k === tab}" data-a="tab" data-tab="${k}" id="tab-${k}">${t}</button>`)
    .join("")}</div>`;
  let body = "";
  const now = new Date();
  if (tab === "date") {
    const lp = C.lifePath(b),
      bd = C.birthdayNumber(b),
      py = C.personalYear(b, now.getFullYear()),
      pm = C.personalMonth(b, now.getFullYear(), now.getMonth() + 1);
    const L = N.NUMBERS[lp.n];
    body = `
      <div class="medals four">${medal(lp.n, "Жизненный путь", true)}${medal(bd.n, "День рождения")}${medal(py.n, "Личный год")}${medal(pm.n, "Личный месяц")}</div>
      <article class="block" id="lp-block"><h3>Число жизненного пути — ${lp.n}<small>${esc(L.title)}</small></h3>${paras(L.text)}
        <ul class="chips">${L.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <p class="how">Как считали: ${lp.how}</p></article>
      <article class="block"><h3>Число дня рождения — ${bd.n}</h3><p>${esc(N.NUMBERS[bd.n].birthday)}</p><p class="how">Как считали: ${bd.how}</p></article>
      <article class="block"><h3>Личный год ${now.getFullYear()} — ${py.n}</h3><p>${esc(N.PERSONAL_YEAR[py.n])}</p><p class="how">Как считали: ${py.how}</p></article>
      <article class="block"><h3>Личный месяц: ${MONTHS[now.getMonth()]} — ${pm.n}</h3><p>${esc(N.PERSONAL_MONTH[pm.n])}</p><p class="how">Как считали: ${pm.how}</p></article>`;
    state.share = { kind: "num-date", n: lp.n, L };
  } else if (tab === "name") {
    const name = params.name ?? save.name;
    const r = name ? C.nameNumber(name) : null;
    body = `
      <form class="panel form inline" id="name-form" novalidate>
        <label class="field"><span>Имя для расчёта</span><input id="n-name" maxlength="60" value="${esc(name || "")}" placeholder="Например, Анна или Анна Иванова"></label>
        <button class="btn primary" type="submit" id="calc-name">Рассчитать</button>
      </form>
      ${
        r
          ? `<div class="medals">${medal(r.n, "Число судьбы", true)}</div>
        <div class="letters">${r.letters.map(([c, v]) => `<span><b>${esc(c)}</b>${v}</span>`).join("")}</div>
        <article class="block" id="name-block"><h3>Число судьбы — ${r.n}<small>${esc(N.NUMBERS[r.n].title)}</small></h3>${paras(N.NUMBERS[r.n].text)}
        <ul class="chips">${N.NUMBERS[r.n].strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <p class="how">Как считали: каждой букве соответствует число от 1 до 9 (А, И, С, Ъ — 1; Б, Й, Т, Ы — 2 … З, Р, Щ — 9); ${r.how}</p></article>`
          : name
            ? `<p class="intro">В имени нет букв — попробуй ещё раз.</p>`
            : `<p class="intro">Впиши имя — можно с фамилией — и узнай его число судьбы.</p>`
      }`;
    state.share = r ? { kind: "num-name", n: r.n, L: N.NUMBERS[r.n], name } : null;
  } else {
    const p = C.parseDate(save.partner);
    const r = p ? C.compatibility(b, p) : null;
    body = `
      <form class="panel form inline" id="pair-form" novalidate>
        <div class="field"><span>Твоя дата</span><p class="fixed">${C.formatDate(b)}</p></div>
        <div class="field"><span>Дата второго человека</span>${dateSelects("pp", save.partner)}</div>
        <label class="field"><span>Имя (по желанию)</span><input id="pp-name" maxlength="40" value="${esc(save.partnerName)}" placeholder="Как подписать на картинке"></label>
        <button class="btn primary" type="submit" id="calc-pair">Рассчитать совместимость</button>
      </form>
      ${
        r
          ? `<div class="medals pair">${medal(r.a, "Ты")}<i class="plus">+</i>${medal(r.b, save.partnerName || "Второй человек")}<i class="plus">=</i>${medal(r.pair, "Число пары", true)}</div>
        <div class="score" id="score"><span>Совместимость</span><b>${r.score}%</b><i style="--p:${r.score}%"></i></div>
        <article class="block" id="pair-block"><h3>Число пары — ${r.pair}</h3><p>${esc(N.PAIR[r.pair])}</p><p>${esc(r.same ? N.PAIR_GROUP.same : N.PAIR_GROUP.mixed)}</p>
        <p class="how">Как считали: числа жизненного пути ${r.a} и ${r.b} приводятся к одной цифре и складываются; группы 1-5-7, 2-4-8 и 3-6-9 — «одна семья чисел». Процент — игровой, для настроения.</p></article>`
          : `<p class="intro">Укажи дату рождения партнёра, друга или коллеги — и посмотри, в чём ваша сильная сторона.</p>`
      }`;
    state.share = r ? { kind: "num-pair", r, N } : null;
  }
  view.innerHTML = `<section class="screen numbers">${tabs}${body}
    ${state.share ? `<div class="actions"><button class="btn primary" data-a="share" data-kind="numbers" id="share-num">${storyOK ? "Поделиться в истории" : "Поделиться картинкой"}</button></div>` : ""}
    <p class="note">Предсказания носят развлекательный характер. <button class="link" data-a="edit">Изменить дату</button></p></section>`;
  actions = {
    ...common,
    tab(btn) {
      Sound.tap();
      show("numbers", { tab: btn.dataset.tab }, "replace");
    },
    edit: () => show("profile"),
  };
  if ($("name-form"))
    $("name-form").onsubmit = (e) => {
      e.preventDefault();
      Sound.chime();
      show("numbers", { tab: "name", name: $("n-name").value.trim() }, "replace");
    };
  if ($("pair-form"))
    $("pair-form").onsubmit = (e) => {
      e.preventDefault();
      const d = readDate("pp");
      if (d.state !== "ok") return toast(d.state === "empty" ? "Выбери день, месяц и год" : "Проверь дату — такого дня нет");
      save.partner = d.iso;
      save.partnerName = $("pp-name").value.trim().slice(0, 40);
      persist();
      Sound.chime();
      show("numbers", { tab: "pair" }, "replace");
    };
}

// ---------- Экран: сюцай ----------
async function syucai(view, params, token) {
  const b = C.parseDate(save.birth);
  if (!b) return needBirth(view, "Число сознания, число миссии и матрица сюцай считаются по дате рождения.");
  const X = await syucaiTexts();
  if (!alive(token)) return;
  const cs = C.consciousness(b),
    ms = C.mission(b),
    mx = C.matrix(b);
  const pick = params.cell || [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => mx.counts[d] >= 2) || cs.n;
  const cell = (d) => {
    const k = mx.counts[d];
    const cls = k >= 2 ? "strong" : k ? "has" : "none";
    const marks = (d === cs.n ? `<i class="mk" title="число сознания">С</i>` : "") + (d === ms.n ? `<i class="mk" title="число миссии">М</i>` : "");
    return `<button class="cell ${cls}${[1, 4, 7].includes(d) ? " money" : ""}${d === pick ? " on" : ""}" data-a="cell" data-d="${d}" id="cell-${d}" aria-label="Цифра ${d}: ${X.ENERGY[d].name}, ${k ? k + " " + plural(k, ["раз", "раза", "раз"]) : "нет в дате"}">
      <span class="digits">${k ? String(d).repeat(k) : "—"}</span><span class="en">${X.ENERGY[d].name}</span>${marks ? `<span class="mks">${marks}</span>` : ""}</button>`;
  };
  const E = X.ENERGY[pick];
  const k = mx.counts[pick];
  const CS = X.CONSCIOUSNESS[cs.n],
    MS = X.MISSION[ms.n];
  view.innerHTML = `
  <section class="screen syucai">
    <div class="medals">${medal(cs.n, "Число сознания", true)}${medal(ms.n, "Число миссии", true)}</div>
    <div class="matrix-box">
      <div class="matrix" id="matrix">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(cell).join("")}</div>
      <p class="legend"><span class="money-l">Линия денег 1 — 4 — 7: ${mx.money.full ? "собрана" : "не хватает " + mx.money.missing.join(", ")}</span><span>С — сознание, М — миссия</span></p>
    </div>
    <article class="block energy" id="energy"><h3>Цифра ${pick} · ${esc(E.name)}<small>${k ? `в дате ${k} ${plural(k, ["раз", "раза", "раз"])}` : "в дате нет"}</small></h3><p>${esc(k >= 2 ? E.strong : k ? E.has : E.none)}</p></article>
    <article class="block"><h3>Число сознания — ${cs.n}<small>${esc(CS.title)}</small></h3>${paras(CS.text)}
      <ul class="chips">${CS.plus.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      <p><b>Зона роста.</b> ${esc(CS.growth)}</p><p class="how">Как считали: ${cs.how}</p></article>
    <article class="block"><h3>Число миссии — ${ms.n}<small>${esc(MS.title)}</small></h3><p>${esc(MS.text)}</p><p class="how">Как считали: ${ms.how}</p></article>
    <article class="block"><h3>Линия денег</h3><p>${esc(mx.money.full ? X.MONEY_LINE.full : X.MONEY_LINE.partial)}</p>
      <p class="how">Матрица — сколько раз каждая цифра от 1 до 9 встречается в дате ${C.formatDate(b)} (нули не считаются).</p></article>
    <div class="actions"><button class="btn primary" data-a="share" data-kind="syucai" id="share-syucai">${storyOK ? "Поделиться в истории" : "Поделиться картинкой"}</button></div>
    <p class="note">Сюцай — популярная «цифровая психология», развлекательная практика. <button class="link" data-a="about">Как считаем</button></p>
  </section>`;
  state.share = { kind: "syucai", cs: cs.n, ms: ms.n, CS, MS };
  actions = {
    ...common,
    cell(btn) {
      Sound.tap();
      const d = +btn.dataset.d;
      const e = X.ENERGY[d],
        n = mx.counts[d];
      view.querySelectorAll(".cell.on").forEach((c) => c.classList.remove("on"));
      btn.classList.add("on");
      $("energy").innerHTML = `<h3>Цифра ${d} · ${esc(e.name)}<small>${n ? `в дате ${n} ${plural(n, ["раз", "раза", "раз"])}` : "в дате нет"}</small></h3><p>${esc(n >= 2 ? e.strong : n ? e.has : e.none)}</p>`;
      history.replaceState({ name: "syucai", params: { cell: d } }, "");
    },
  };
}

// ---------- Экран: предназначение ----------
async function career(view, _p, token) {
  const b = C.parseDate(save.birth);
  if (!b) return needBirth(view, "Сильные стороны и подходящие сферы работы подбираются по числу жизненного пути — его считают по дате рождения.");
  const N = await numberTexts();
  if (!alive(token)) return;
  const lp = C.lifePath(b),
    bd = C.birthdayNumber(b);
  const L = N.NUMBERS[lp.n];
  view.innerHTML = `
  <section class="screen career">
    <div class="medals">${medal(lp.n, "Число пути", true)}</div>
    <h2 class="title">${esc(L.title)}</h2>
    <article class="block"><h3>Предназначение</h3><p>${esc(L.career.text)}</p></article>
    <article class="block"><h3>Сильные стороны</h3><ul class="checks">${L.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></article>
    <article class="block" id="spheres"><h3>Подходящие сферы</h3><ul class="spheres">${L.career.spheres
      .map((s) => {
        const [head, ...rest] = s.split(" — ");
        return `<li><b>${esc(head)}</b>${rest.length ? " — " + esc(rest.join(" — ")) : ""}</li>`;
      })
      .join("")}</ul></article>
    <article class="block"><h3>Рабочий стиль<small>число дня рождения — ${bd.n}</small></h3><p>${esc(N.NUMBERS[bd.n].birthday)}</p></article>
    <article class="block tip"><h3>Практичный совет</h3><p>${esc(L.career.tip)}</p></article>
    <div class="actions"><button class="btn primary" data-a="share" data-kind="career" id="share-career">${storyOK ? "Поделиться в истории" : "Поделиться картинкой"}</button></div>
    <p class="note">Это повод подумать о себе, а не профориентационный тест. Предсказания носят развлекательный характер.</p>
  </section>`;
  state.share = { kind: "career", n: lp.n, L };
  actions = { ...common };
}

// ---------- Экран: профиль ----------
function aboutHTML() {
  return `<h2>О сервисе</h2>
    <p>«${esc(APP.name)}» — развлекательный сервис: карта дня, расклады таро, руны, нумерология, сюцай и подсказки о профессии по дате рождения. <b>Предсказания носят развлекательный характер</b> и не заменяют советов врача, юриста или финансового консультанта.</p>
    <p><b>Данные.</b> Имя и дату рождения ты вводишь сам. Они хранятся только на твоём устройстве и в облачном хранилище приложения ВКонтакте (чтобы на телефоне и компьютере было одно и то же) и никуда больше не отправляются. Удалить их можно в профиле.</p>
    <p><b>Как считаем.</b> Карта и руна дня зависят от даты и случайного числа, которое приложение один раз создаёт для тебя, — поэтому весь день они одинаковые. Расклады тасуются честно и каждый раз заново. Число жизненного пути — день, месяц и год, сведённые к одной цифре по отдельности, затем сложенные (11, 22 и 33 сохраняются). Число судьбы — сумма букв имени по таблице 1–9. Сюцай: сознание — день рождения, сведённый к одной цифре; миссия — сумма всех цифр даты; матрица — сколько раз в дате встречается каждая цифра 1–9.</p>
    <p class="small">Тексты толкований написаны для этого приложения. Шрифт Cormorant Garamond — SIL Open Font License.</p>
    ${docsLine()}
    <button class="btn ghost" data-a="close">Закрыть</button>`;
}
async function profile(view) {
  view.innerHTML = `
  <section class="screen profile">
    <form class="panel form" id="profile-form" novalidate>
      <h2>Профиль</h2>
      <label class="field"><span>Имя</span><input id="p-name" maxlength="40" value="${esc(save.name)}" placeholder="Как к тебе обращаться"></label>
      <div class="field"><span>Дата рождения</span>${dateSelects("p", save.birth)}</div>
      <p class="small">Хранится только на твоём устройстве и в облачном хранилище приложения ВКонтакте.</p>
      <button class="btn primary" type="submit" id="p-save">Сохранить</button>
    </form>
    <div class="panel">
      <label class="switch"><input type="checkbox" id="p-sound"${save.sound ? " checked" : ""}><span>Тихие звуки при открытии карт</span></label>
      <p class="small">Серия карт дня: ${save.streak} · рекорд: ${save.best}</p>
    </div>
    <div class="panel about">${aboutHTML().replace(/<button[^>]*data-a="close"[^>]*>.*?<\/button>/, "")}</div>
    <button class="btn danger" data-a="wipe" id="wipe">Удалить мои данные</button>
  </section>`;
  $("profile-form").onsubmit = (e) => {
    e.preventDefault();
    const d = readDate("p");
    if (d.state === "bad") return toast("Проверь дату — такого дня нет");
    save.name = $("p-name").value.trim().slice(0, 40);
    save.birth = d.state === "ok" ? d.iso : "";
    persist();
    Sound.chime();
    toast("Сохранено");
  };
  $("p-sound").onchange = (e) => {
    save.sound = e.target.checked;
    Sound.set(save.sound);
    if (save.sound) Sound.unlock();
    persist();
    paintSound();
  };
  actions = {
    ...common,
    wipe() {
      showSheet(
        `<h2>Удалить данные?</h2><p>Имя, дата рождения, дата партнёра и серия карт дня сотрутся на этом устройстве и в облачном хранилище приложения. Карта дня станет другой.</p>
        <button class="btn danger" data-a="wipe-yes" id="wipe-yes">Удалить</button><button class="btn ghost" data-a="close">Отмена</button>`,
        "wipe",
        {
          "wipe-yes"() {
            save = S.fresh();
            persist();
            Sound.set(save.sound);
            paintSound();
            hideSheet();
            state.depth = 0;
            show("welcome", {}, "replace");
            toast("Данные удалены");
          },
        },
      );
    },
  };
}

const SCREENS = { welcome, home, daily, spreads, table, runes, runeDay, norns, numbers, syucai, career, profile };

// ---------- Поделиться ----------
let storyOK = false,
  friendOK = false;
async function shareSpec(kind) {
  const sh = state.share;
  if (kind === "daily" && sh?.card) return { title: "Моя карта дня", sub: dateLabel(), cards: [{ card: sh.card }], name: sh.card.name, keys: sh.t.keys, text: sh.t.day };
  if (kind === "spread" && tbl?.draws.length) {
    const { spread, draws, T } = tbl;
    const pickIdx = spread.id === "celtic" ? [0, 4, 9] : spread.id === "love" ? [0, 1, 2] : draws.map((_, i) => i);
    const last = draws[draws.length - 1];
    const yn = spread.id === "yesno" ? yesNo(T[last.card.id].yes, last.reversed) : null;
    return {
      title: "Мой расклад",
      sub: spread.name,
      cards: pickIdx.map((i) => draws[i]),
      name: yn ? `Ответ: ${yn.label}` : `${spread.pos[draws.length - 1].name}: ${last.card.name}`,
      keys: T[last.card.id].keys,
      text: T[last.card.id].advice,
    };
  }
  if (kind === "runeDay" && sh?.rune) return { title: "Моя руна дня", sub: dateLabel(), runes: [{ rune: sh.rune }], name: sh.rune.name, keys: sh.t.keys, text: sh.t.day };
  if (kind === "norns" && nrn?.draws.length) {
    const T = nrn.T;
    return { title: "Три норны", sub: "Расклад на рунах", runes: nrn.draws, name: nrn.draws.map((d) => d.rune.name).join(" · "), keys: "прошлое · настоящее · будущее", text: T[nrn.draws[2].rune.id].advice };
  }
  if (kind === "numbers" && sh) {
    if (sh.kind === "num-date") return { title: "Моё число пути", sub: "Нумерология", numbers: [{ n: sh.n, label: "Жизненный путь" }], name: sh.L.title, text: sh.L.text.split("\n\n")[0] };
    if (sh.kind === "num-name") return { title: "Число имени", sub: sh.name, numbers: [{ n: sh.n, label: "Число судьбы" }], name: sh.L.title, text: sh.L.text.split("\n\n")[0] };
    if (sh.kind === "num-pair")
      return {
        title: "Наша совместимость",
        sub: "Нумерология",
        numbers: [
          { n: sh.r.a, label: "Я" },
          { n: sh.r.b, label: save.partnerName || "Ты" },
        ],
        name: `${sh.r.score}% · число пары ${sh.r.pair}`,
        text: sh.N.PAIR[sh.r.pair],
      };
  }
  if (kind === "syucai" && sh) return { title: "Мой сюцай", sub: "Сознание и миссия", numbers: [{ n: sh.cs, label: "Сознание" }, { n: sh.ms, label: "Миссия" }], name: sh.CS.title, keys: sh.MS.title, text: sh.MS.text };
  if (kind === "career" && sh) return { title: "Моё предназначение", sub: "По дате рождения", numbers: [{ n: sh.n, label: "Число пути" }], name: sh.L.title, text: sh.L.career.text };
  return null;
}
let sharing = false;
async function share(kind) {
  if (sharing || adBusy) return;
  const spec = await shareSpec(kind);
  if (!spec) return;
  sharing = true;
  Sound.tap();
  try {
    if (storyOK) {
      toast("Готовим картинку для истории…");
      const url = (await storyCanvas(spec)).toDataURL("image/jpeg", 0.88);
      state.lastStory = url;
      try {
        await postStory(url);
      } catch {
        // человек закрыл редактор истории — это нормально
      }
      return;
    }
    showSheet(`<h2>Поделиться</h2><div class="preview"><i class="spin"></i></div>`, "share");
    const url = (await storyCanvas(spec)).toDataURL("image/jpeg", 0.88);
    state.lastStory = url;
    if ($("sheet").dataset.kind !== "share") return;
    showSheet(
      `<h2>Поделиться</h2>
      <img class="story-preview" id="story-preview" src="${url}" alt="Картинка для истории">
      <p class="small center">Картинку можно сохранить и выложить в историю. На телефоне её можно сохранить и долгим нажатием.</p>
      <button class="btn primary" data-a="save-img" id="save-img">Сохранить или отправить картинку</button>
      ${friendOK ? `<button class="btn" data-a="friend">Поделиться с другом</button>` : ""}
      <button class="btn ghost" data-a="close">Закрыть</button>`,
      "share",
      {
        async "save-img"() {
          try {
            const r = await shareFile(url, "lunnyi-orakul.jpg");
            if (r?.saved) toast("Картинка сохранена");
          } catch {}
        },
      },
    );
  } finally {
    sharing = false;
  }
}

// ---------- VK: баннер, сворачивание, реклама ----------
// Баннер внизу ведёт общий слой (vk-host.js → bannerWhen): VK уменьшает окно на высоту баннера
// (resize), слой прячет баннер на время роликов и при сворачивании и показывает его через секунду
// спокойного экрана. Мы только говорим, какой экран спокойный: всё, кроме знакомства и тех моментов,
// когда колода тасуется и карты (или руны) раздаются и открываются касаниями.
function calmScreen() {
  if (!save.onboarded || state.screen === "welcome" || state.screen === "") return false;
  if (state.screen === "table" && tbl && tbl.phase !== "ask" && tbl.phase !== "read") return false;
  if (state.screen === "norns" && nrn && nrn.phase !== "ask" && nrn.phase !== "read") return false;
  return true;
}
let adBusy = false;
function updateVisibility() {
  if (document.hidden || host?.hidden) Sound.hush();
  // звук вернётся по нажатию
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
addEventListener("vk-ad", (e) => {
  if (e.detail?.on) {
    adBusy = true;
    document.body.classList.add("ad-on");
    Sound.hush();
  } else {
    adBusy = false;
    document.body.classList.remove("ad-on");
    if (!document.hidden && !host?.hidden && save.sound) Sound.unlock();
  }
});
// Реклама между экранами — только перед тасованием нового расклада, не чаще паузы (её держит слой VK)
// и никогда при запуске (отсчёт паузы идёт от запуска)
async function adBreak() {
  if (!host?.inVk) return true;
  if (adBusy) return false;
  adBusy = true;
  try {
    await host.interstitial();
  } finally {
    adBusy = false;
  }
  return true;
}
// Пока идёт ролик, нажатия до приложения не доходят
for (const type of ["pointerdown", "pointerup", "click", "keydown", "touchstart"])
  addEventListener(
    type,
    (e) => {
      if (!document.body.classList.contains("ad-on")) return;
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    },
    { capture: true, passive: false },
  );
addEventListener("pointerdown", () => save.sound && Sound.unlock());
const relayout = () => {
  if (state.screen === "table" && tbl) {
    const h = tableHeight();
    $("table").style.height = h ? h + "px" : "";
    layoutTable();
  }
};
addEventListener("resize", relayout);
addEventListener("vk-banner", relayout);

// ---------- Запуск ----------
[storyOK, friendOK] = await Promise.all([canStory(), canFriend()]);
try {
  await document.fonts?.load(`600 20px "Cormorant Garamond"`);
} catch {}
document.documentElement.style.setProperty("--back", `url(${await backImage()})`);
paintSound();
await show(save.onboarded ? "home" : "welcome", {}, "replace");
host?.bannerWhen?.(calmScreen);
$("loading").classList.add("gone");
setTimeout(() => $("loading").remove(), 600);

// Для проверок и отладки
window.oracle = { save: () => save, state, show, DECK, byId, tbl: () => tbl, nrn: () => nrn, C };
