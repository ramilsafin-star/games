// «Маяк»: управление, приборы, подсказки, панели и сохранение. Правила — в rules.js, картинка — в view.js.
import { NIGHTS, UPGRADES, Bay } from "./rules.js?v=fe1036fe";
import { BayView } from "./view.js?v=fe1036fe";
import { Sound } from "./sound.js?v=fe1036fe";

const id = (name) => document.getElementById(name);
const canvas = id("sea");
const game = new Bay();
const view = new BayView(canvas);
const KEY = "mayak-v1";
const STEP = 1 / 60;
const coarse = window.matchMedia("(pointer: coarse)").matches;

// ---------- сохранение ----------
// night — следующая непройденная ночь (11 — кампания пройдена); ups — улучшения маяка;
// stars и best — звёзды и очки по ночам; storm — рекорд бесконечного режима; seen — какие подсказки уже были.
const profile = { night: 1, ups: {}, stars: [], best: [], storm: 0, muted: false, seen: {} };
function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {}
  const count = NIGHTS.length;
  profile.night = Number.isInteger(saved.night) ? Math.max(1, Math.min(count + 1, saved.night)) : 1;
  for (const key of Object.keys(UPGRADES)) {
    const level = saved.ups && Number.isInteger(saved.ups[key]) ? saved.ups[key] : 0;
    profile.ups[key] = Math.max(0, Math.min(UPGRADES[key].max, level));
  }
  for (let i = 0; i < count; i++) {
    profile.stars[i] = saved.stars && Number.isInteger(saved.stars[i]) ? Math.max(0, Math.min(3, saved.stars[i])) : 0;
    profile.best[i] = saved.best && Number.isFinite(saved.best[i]) ? Math.max(0, saved.best[i]) : 0;
  }
  profile.storm = Number.isFinite(saved.storm) ? Math.max(0, saved.storm) : 0;
  profile.muted = saved.muted === true;
  profile.seen = saved.seen && typeof saved.seen === "object" ? saved.seen : {};
  profile.owed = Array.isArray(saved.owed) ? saved.owed.filter((kind) => UPGRADES[kind]) : [];
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // игра работает и там, где сохранять нельзя
  }
}
await window.vkGameHost?.ready;
load();
Sound.set(!profile.muted);

// Улучшения: значок, название, что даёт
const UP_INFO = {
  wide: ["🔆", "Широкий луч", "Пятно света становится больше"],
  long: ["🏮", "Стойкие фонарики", "Гаснут на четверть медленнее"],
  quick: ["⚡", "Яркая лампа", "Фонарики заряжаются, а тени тают быстрее"],
  flash: ["✨", "Быстрая вспышка", "Чаще готова и светит дольше"],
  heart: ["❤️", "Запасное сердечко", "Можно потерять на одну лодку больше"],
  helper: ["🔦", "Малый луч", "Сам обходит бухту и светит тусклым лодкам"],
  harbor: ["⚓", "Огни гавани", "Безопасная вода у причала шире"],
};

// ---------- состояние экрана ----------
let paused = false;
let rate = 1; // ускорение времени для проверок
let acc = 0;
let last = performance.now();
let aim = null; // куда игрок ведёт луч: точка на воде
let finger = null;
let shownMode = "";
let panelAt = 0; // когда показать панель поражения
let hintUntil = 0;
let hintKey = "";
let hintQueue = [];
let beamHint = false; // подсказка первой ночи висит, пока лодку не осветят
let lastHorn = 0;
let lastDing = 0;
let sizzleIn = 0;
let lastHud = "";
let nudgeFlash = false;
let floatStep = 0;

const playing = () => game.mode === "play" || game.mode === "dawn";
const aspect = () => window.innerWidth / Math.max(1, window.innerHeight);

function text(element, value) {
  value = String(value);
  if (element.textContent !== value) element.textContent = value;
}

function announce(message, above = "") {
  const banner = id("announcement");
  banner.classList.remove("show");
  banner.textContent = "";
  if (above) {
    const small = document.createElement("small");
    small.textContent = above;
    banner.append(small);
  }
  banner.append(message);
  void banner.offsetWidth;
  banner.classList.add("show");
}

// всплывающая надпись над точкой бухты
function float(x, z, message, kind = "") {
  const box = id("floats");
  if (box.childElementCount > 14) box.firstElementChild.remove();
  const p = view.project(x, z, 1.4);
  const el = document.createElement("span");
  el.className = "float " + kind;
  el.textContent = message;
  // надписи, появившиеся подряд в одном месте, встают лесенкой
  floatStep = (floatStep + 1) % 3;
  el.style.left = Math.max(40, Math.min(window.innerWidth - 40, p.x)) + "px";
  el.style.top = Math.max(70, p.y - floatStep * 20) + "px";
  el.addEventListener("animationend", () => el.remove());
  box.append(el);
}

// ---------- подсказки ----------
// Каждая показывается один раз за всё время; очередь — чтобы не перебивали друг друга.
function hint(key, message, seconds = 4.5, urgent = false) {
  if (profile.seen[key]) return;
  profile.seen[key] = 1;
  save();
  if (urgent) {
    // срочная подсказка сменяет ту, что висит сейчас
    hintQueue.unshift({ key, message, seconds });
    hintUntil = 0;
  } else hintQueue.push({ key, message, seconds });
}
function showHint(now) {
  const box = id("lesson");
  if (hintKey && now >= hintUntil) {
    hintKey = "";
    box.hidden = true;
    id("flash").classList.remove("nudge");
    nudgeFlash = false;
  }
  if (!hintKey && hintQueue.length && playing() && !paused) {
    const next = hintQueue.shift();
    hintKey = next.key;
    hintUntil = now + next.seconds * 1000;
    box.hidden = true;
    void box.offsetWidth;
    box.textContent = next.message;
    box.hidden = false;
    if (next.key === "flash") {
      nudgeFlash = true;
      id("flash").classList.add("nudge");
    }
  }
}
function clearHints() {
  hintQueue = [];
  hintKey = "";
  beamHint = false;
  id("lesson").hidden = true;
  id("flash").classList.remove("nudge");
}

// ---------- запуск ночей ----------
function layout() {
  // сколько места сверху и снизу занято приборами: камера впишет бухту между ними
  const w = window.innerWidth;
  const h = window.innerHeight;
  const tall = h > w;
  const header = document.querySelector(".top").getBoundingClientRect();
  const bottom = h - id("probe").getBoundingClientRect().top;
  const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // сверху — полоска неба, снизу — берег с деревней и маяком
  view.insets.top = header.bottom + (tall ? clampTo(h * 0.08, 62, 70) : clampTo(h * 0.09, 38, 64));
  view.insets.bottom = bottom + clampTo(h * 0.15, 64, 126);
  view.shiftX = 0;
  if (game.mode === "demo") {
    const card = id("intro-card").getBoundingClientRect();
    if (card.height && w <= 650) view.insets.bottom = h - card.top + 34; // в меню на телефоне диорама целиком встаёт над карточкой
    else if (card.width) view.shiftX = card.right / 2; // а на широком экране — сдвигается вправо от неё
  }
  view.resize();
}

function menu() {
  paused = false;
  clearHints();
  aim = finger = null;
  game.restoreUps();
  game.ups = { ...profile.ups };
  game.startDemo({ aspect: aspect() });
  game.events.length = 0;
  paintMenu();
  paintMode();
  view.setBay(game);
  layout();
  Sound.mood(1);
}

function begin(night) {
  if (owe(() => begin(night))) return;
  paused = false;
  clearHints();
  aim = finger = null;
  game.restoreUps();
  game.ups = { ...profile.ups };
  if (night === 1 && profile.night <= 1) for (const key of ["beam", "astray", "shade", "grab"]) delete profile.seen[key];
  game.startNight(night, { aspect: aspect(), grant: night === profile.night });
  afterStart();
}

function beginStorm() {
  if (owe(beginStorm)) return;
  paused = false;
  clearHints();
  aim = finger = null;
  game.restoreUps();
  game.ups = { ...profile.ups };
  game.startEndless({ aspect: aspect() });
  afterStart();
}

function again() {
  paused = false;
  clearHints();
  aim = finger = null;
  game.retry();
  afterStart();
}

function afterStart() {
  acc = 0;
  id("floats").textContent = "";
  paintMode();
  view.setBay(game);
  layout();
  lastHud = "";
  if (game.night === 1 && !game.endless && !profile.seen.beam) {
    profile.seen.beam = 1;
    beamHint = true;
    hintQueue.push({ key: "beam", message: `Веди луч ${coarse ? "пальцем" : "мышкой"} — освещённая лодка знает дорогу`, seconds: 30 });
  }
  if (game.night === 2 && !game.endless) hint("flash", "Кнопка «Вспышка» на миг освещает всю бухту", 6);
  if (game.helper) hint("helper", "Малый луч сам ищет тусклые лодки", 4);
}

// ---------- события правил: звук, надписи, подсказки ----------
function onEvent(e, now) {
  view.handle(e, game);
  if (game.mode === "demo") return;
  switch (e.type) {
    case "night":
      Sound.night();
      if (game.endless) announce("Шторм до рассвета", "ДЕРЖИСЬ, СМОТРИТЕЛЬ");
      else announce(e.name, `НОЧЬ ${e.night} ИЗ ${NIGHTS.length}` + (game.ease ? " · МОРЕ СПОКОЙНЕЕ" : ""));
      break;
    case "hour":
      if (e.hour > 1) {
        announce(`Час ${e.hour}`, "ШТОРМ КРЕПЧАЕТ");
        Sound.night();
      }
      break;
    case "spawn":
      if (now - lastHorn > 350) {
        lastHorn = now;
        Sound.horn(e.kind);
      }
      if (e.kind === "speed") hint("speed", "Катер быстрый, но его фонарик гаснет скорее");
      else if (e.kind === "ferry") hint("ferry", "Паром большой и ценный. Одну тень он прогонит гудком сам");
      else if (e.kind === "lamp") hint("lamp", "Фонарщик светит гирляндой соседним лодкам");
      break;
    case "charged":
      if (beamHint) {
        beamHint = false;
        if (hintKey === "beam") hintUntil = now + 900;
      }
      if (now - lastDing > 140 && game.flashT <= 0) {
        lastDing = now;
        Sound.charged();
      }
      break;
    case "astray":
      Sound.astray();
      hint("astray", "Фонарик погас — лодка сбилась с пути. Посвети на неё!", 5, true);
      break;
    case "found":
      Sound.found();
      break;
    case "shade":
      Sound.shade();
      if (e.kind === "dart") hint("dart", "Тень-торопыжка быстрая, зато лопается мигом");
      else if (e.kind === "big") hint("big", "Тень-толстяк: держи её в луче подольше");
      else hint("shade", "Морская тень плывёт к лодке. Подержи её в луче — и она лопнет!", 6, true);
      break;
    case "pop":
      Sound.pop(e.kind);
      if (e.points) float(e.x, e.z, "+" + e.points, "violet");
      break;
    case "grab":
      Sound.grab();
      hint("grab", "Тень схватила лодку! Скорее свети на неё", 4, true);
      break;
    case "free":
      Sound.free();
      break;
    case "shield":
      Sound.shield();
      float(e.x, e.z, "Ту-у-у!", "");
      break;
    case "dragged":
      Sound.dragged();
      float(e.x, e.z, "утащила…", "bad");
      break;
    case "wreck":
      Sound.wreck();
      float(e.x, e.z, "на камни…", "bad");
      break;
    case "heart": {
      setTimeout(() => Sound.heart(), 350);
      lastHud = "";
      requestAnimationFrame(() => {
        const lost = id("hearts").children[e.hearts];
        if (lost) lost.classList.add("hit");
      });
      break;
    }
    case "deliver":
      Sound.bell(e.streak);
      float(e.x, e.z + 0.6, "+" + e.points + (e.streak > 2 ? "  ×" + e.streak : ""));
      break;
    case "flash": {
      Sound.flash();
      const glare = id("glare");
      glare.classList.remove("go");
      void glare.offsetWidth;
      glare.classList.add("go");
      break;
    }
    case "flash-ready":
      if (game.mode === "play" && game.time > 1) Sound.flashReady();
      break;
    case "gust-warn":
      Sound.gust();
      announce(e.dir > 0 ? "Порыв ветра  →" : "←  Порыв ветра");
      hint("gust", "Ветер сносит лодки и задувает фонарики", 4.5);
      break;
    case "dawn":
      clearHints();
      Sound.dawn();
      announce("Рассвет!", game.wrecks ? "НОЧЬ ПОЗАДИ" : "ВСЕ ЛОДКИ ДОМА");
      break;
    case "fail":
      Sound.fail();
      panelAt = now + 1300;
      break;
    case "won":
      Sound.win();
      break;
  }
}

// ---------- управление лучом ----------
function setAim(event, touch) {
  const p = view.pointAt(event.clientX, event.clientY);
  if (touch) {
    // пятно ложится чуть дальше пальца, чтобы палец его не закрывал
    const L = game.bay.light;
    const dx = p.x - L.x;
    const dz = p.z - L.z;
    const d = Math.hypot(dx, dz) || 1;
    p.x += (dx / d) * 1.0;
    p.z += (dz / d) * 1.0;
  }
  aim = p;
}
canvas.addEventListener("pointerdown", (event) => {
  if (!playing() || paused) return;
  Sound.unlock();
  if (event.pointerType === "mouse") {
    if (event.button === 0) setAim(event, false);
    return;
  }
  if (finger !== null) return;
  finger = event.pointerId;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {}
  setAim(event, true);
});
canvas.addEventListener("pointermove", (event) => {
  if (!playing() || paused) return;
  if (event.pointerType === "mouse") setAim(event, false);
  else if (event.pointerId === finger) setAim(event, true);
});
function lift(event) {
  if (event.pointerType === "mouse") {
    if (event.type === "pointerleave") aim = null;
    return;
  }
  if (event.pointerId === finger) {
    finger = null;
    aim = null; // без пальца луч стоит на месте
  }
}
for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) canvas.addEventListener(type, lift);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function fireFlash() {
  if (paused || game.mode !== "play") return;
  Sound.unlock();
  game.flash();
}
id("flash").addEventListener("pointerdown", (event) => {
  // второй палец не всегда даёт click, пока первый ведёт луч
  if (event.pointerType !== "mouse") {
    event.preventDefault();
    fireFlash();
  }
});
id("flash").addEventListener("click", fireFlash);
id("flash").addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && !event.repeat) {
    if (paused) resume();
    else if (playing()) pause();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "Space" && !event.target.closest?.("button,a")) {
    event.preventDefault();
    if (!event.repeat) fireFlash();
  }
});
window.addEventListener("blur", () => {
  finger = null;
  aim = null;
});
function quiet() {
  if (playing() && !paused) pause();
  Sound.hush();
}
function updateVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) quiet();
  else if (!paused && !adBusy) Sound.unlock();
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
// Во время рекламного ролика игра молчит, после него звук возвращается (если игрок его не выключал)
addEventListener("vk-ad", (e) => {
  if (e.detail.on) quiet();
  else if (!document.hidden && !window.vkGameHost?.hidden && !paused) Sound.unlock();
});
// Реклама VK между ночами: не чаще раза в 2 минуты и никогда сразу после запуска.
// Пока идёт ролик, нажатия и клавиши до игры не доходят: иначе касание включило бы звук.
let adBusy = false;
async function adBreak() {
  if (adBusy) return false;
  adBusy = true;
  try {
    await window.vkGameHost?.interstitial();
  } finally {
    adBusy = false;
  }
  return true;
}
for (const type of ["pointerdown", "pointerup", "click", "keydown"])
  addEventListener(
    type,
    (e) => {
      if (!adBusy) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );
// Отложенное с панели итога улучшение: выбор перед следующей ночью или штормом
let owedNext = null;
function owe(go) {
  if (!profile.owed.length) return false;
  owedNext = go;
  const keep = game.offer;
  game.offer = [...profile.owed];
  game.ups = { ...profile.ups };
  const choices = cards().replaceAll('data-action="pick"', 'data-action="owe"');
  game.offer = keep;
  // «Назад» просто закрывает панель (как «Нет, оставить» у сброса)
  showPanel(`<div class="eyebrow"><i></i> ПОДАРОК ЗА ПРОЙДЕННУЮ НОЧЬ</div><h2 id="panel-title">Улучшение для маяка</h2>
    <p>Выбери, что маяк возьмёт с собой:</p><div class="choices">${choices}</div>
    <div class="row solo"><button class="plain" data-action="reset-no">Назад</button></div>`);
  return true;
}
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 60);
});

// ---------- звук и пауза ----------
function paintSound() {
  const button = id("sound");
  button.setAttribute("aria-pressed", String(!profile.muted));
  button.setAttribute("aria-label", profile.muted ? "Включить звук" : "Выключить звук");
}
function toggleSound() {
  profile.muted = !profile.muted;
  Sound.set(!profile.muted);
  if (!profile.muted && !paused) Sound.unlock();
  save();
  paintSound();
  Sound.tap();
}
id("sound").addEventListener("click", toggleSound);
paintSound();

function pause() {
  if (!playing() || paused) return;
  paused = true;
  finger = null;
  aim = null;
  Sound.hush();
  paintMode();
}
function resume() {
  if (!paused) return;
  paused = false;
  Sound.unlock();
  last = performance.now();
  paintMode();
}
id("pause").addEventListener("click", pause);

// ---------- панели ----------
let pressedPanel = false; // нажатие началось на самой панели, а не на море под ней
function showPanel(markup) {
  pressedPanel = false;
  id("panel-body").innerHTML = markup;
  id("panel").hidden = false;
  // фокус — на саму панель, а не на кнопку: иначе пробел, которым жали вспышку, выберет первое улучшение
  id("panel-body").focus({ preventScroll: true });
  // подсказка под панелью не нужна
  hintKey = "";
  id("lesson").hidden = true;
}
id("panel").addEventListener("pointerdown", () => (pressedPanel = true));

const starsRow = (n) => `<div class="stars" aria-label="Звёзд: ${n} из 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}">★</i>`).join("")}</div>`;

function cards() {
  return game.offer
    .map((kind) => {
      const [icon, name, about] = UP_INFO[kind];
      const level = game.ups[kind];
      const max = UPGRADES[kind].max;
      const title = kind === "helper" && level === 1 ? "Малый луч сильнее" : name;
      const what = kind === "helper" && level === 1 ? "Шире и быстрее ищет лодки" : about;
      const pips = max > 1 ? `<em>${"●".repeat(level + 1)}${"○".repeat(max - level - 1)}</em>` : "";
      return `<button class="choice" data-action="pick" data-kind="${kind}"><i aria-hidden="true">${icon}</i><b>${title}</b><small>${what}</small>${pips}</button>`;
    })
    .join("");
}

function paintMode() {
  const mode = game.mode;
  shownMode = mode + (paused ? ":paused" : "");
  const inMenu = mode === "demo" || mode === "menu";
  document.body.dataset.mode = inMenu ? "menu" : mode;
  id("intro").hidden = !inMenu;
  id("hud").hidden = inMenu;
  id("controls").hidden = inMenu;
  id("pause").hidden = !playing() || paused;
  id("panel").hidden = true;
  // в самую первую ночь вспышки ещё нет: сначала учимся водить луч
  id("flash").hidden = game.night === 1 && !game.endless && profile.night <= 1;

  if (paused) {
    showPanel(`<div class="eyebrow"><i></i> МАЯК ЖДЁТ</div><h2 id="panel-title">Пауза</h2>
      <button class="primary" data-action="resume">Продолжить</button>
      <div class="row"><button class="plain" data-action="sound">Звук: ${profile.muted ? "выключен" : "включён"}</button><button class="plain" data-action="menu">В меню</button></div>`);
    return;
  }
  if (mode === "upgrade" && game.endless) {
    showPanel(`<div class="eyebrow"><i></i> ЧАС ${game.hour - 1} ПОЗАДИ</div><h2 id="panel-title">Подмога в шторм</h2>
      <p>Выбери улучшение — оно с тобой до конца шторма.</p><div class="choices">${cards()}</div>
      <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
    return;
  }
  if (mode === "upgrade" || mode === "won") {
    const r = game.result;
    const n = r.night;
    const record = r.score > profile.best[n - 1];
    profile.stars[n - 1] = Math.max(profile.stars[n - 1], r.stars);
    profile.best[n - 1] = Math.max(profile.best[n - 1], r.score);
    if (mode === "won" && profile.night <= NIGHTS.length) profile.night = NIGHTS.length + 1;
    save();
    [0, 1, 2].slice(0, r.stars).forEach((i) => setTimeout(() => Sound.star(i), 250 + i * 220));
    const facts = `<div class="facts"><span><b>${r.saved} из ${r.total}</b>лодок дома</span><span><b>${r.popped}</b>теней лопнуло</span><span><b>${r.score}</b>очков${record ? " · рекорд" : ""}</span></div>`;
    const word = r.stars === 3 ? "Все лодки дома!" : r.stars === 2 ? "Почти все дома" : "Ночь позади";
    if (mode === "won") {
      const total = profile.stars.reduce((a, b) => a + b, 0);
      showPanel(`<div class="eyebrow"><i></i> ДЕСЯТАЯ НОЧЬ ПОЗАДИ</div><h2 id="panel-title">Рассвет над бухтой!</h2>${starsRow(r.stars)}${facts}
        <p>Маяк выстоял большой шторм. Всего звёзд: ${total} из ${NIGHTS.length * 3}. Теперь открыт «Шторм до рассвета» — на рекорд.</p>
        <button class="primary" data-action="storm">Шторм до рассвета</button>
        <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
    } else if (game.offer.length) {
      showPanel(`<div class="eyebrow"><i></i> НОЧЬ ${n} ПОЗАДИ</div><h2 id="panel-title">${word}</h2>${starsRow(r.stars)}${facts}
        <p>Выбери улучшение для маяка:</p><div class="choices">${cards()}</div>
        <div class="row solo"><button class="plain" data-action="later">В меню</button></div>`);
    } else {
      const next = n + 1 <= Math.min(profile.night, NIGHTS.length);
      showPanel(`<div class="eyebrow"><i></i> НОЧЬ ${n} ПОЗАДИ</div><h2 id="panel-title">${word}</h2>${starsRow(r.stars)}${facts}
        ${next ? `<button class="primary" data-action="next">Следующая ночь</button>` : ""}
        <div class="row"><button class="plain" data-action="replay">Ещё раз</button><button class="plain" data-action="menu">В меню</button></div>`);
    }
    return;
  }
  // панель поражения появляется чуть позже: сначала видно, что случилось
  if (mode === "lost" && performance.now() >= panelAt) paintLost();
}

function paintLost() {
  shownMode = "lost:panel";
  if (game.endless) {
    const record = game.score > profile.storm;
    profile.storm = Math.max(profile.storm, game.score);
    save();
    showPanel(`<div class="eyebrow"><i></i> ШТОРМ СТИХ НА ${game.hour}-М ЧАСУ</div><h2 id="panel-title">${record ? "Новый рекорд!" : "Шторм позади"}</h2>
      <p class="big-score">✦ ${game.score}</p>
      <div class="facts"><span><b>${game.saved}</b>лодок дома</span><span><b>${game.popped}</b>теней лопнуло</span><span><b>${profile.storm}</b>рекорд</span></div>
      <button class="primary" data-action="storm">Ещё раз</button>
      <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
    return;
  }
  const tip = game.fog
    ? "В тумане луч слабее: держи его на лодке подольше."
    : game.gustQueue.length || game.gust
      ? "В ветер фонарики гаснут быстрее — береги вспышку для порыва."
      : "Лодке со знаком «!» свет нужен первой. А вспышка выручит, когда бед сразу несколько.";
  showPanel(`<div class="eyebrow"><i></i> НОЧЬ ${game.night} ИЗ ${NIGHTS.length}</div><h2 id="panel-title">Ночь не удалась</h2>
    <p>Дома ${game.saved} из ${game.total}. Экипажи спаслись на кругах — а лодки попробуем провести ещё раз.</p>
    <p class="note">${tip}</p>
    <button class="primary" data-action="again">Ещё раз</button>
    <p class="note">Море станет чуть спокойнее: меньше теней, фонарики горят дольше.</p>
    <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
}

id("panel-body").addEventListener("click", async (event) => {
  // палец, который вёл луч и отпустился уже над панелью, ничего не выбирает
  if (event.detail !== 0 && !pressedPanel) return;
  pressedPanel = false;
  const button = event.target.closest("[data-action]");
  if (!button) return;
  Sound.unlock();
  const action = button.dataset.action;
  if (action === "resume") resume();
  else if (action === "sound") {
    toggleSound();
    paintMode();
  } else if (action === "later") {
    // ночь пройдена, улучшение выберется перед следующей ночью
    Sound.tap();
    profile.owed = [...game.offer];
    if (game.night === profile.night) profile.night = game.night + 1;
    save();
    menu();
  } else if (action === "owe") {
    const kind = button.dataset.kind;
    if (!profile.owed.includes(kind)) return;
    profile.ups[kind] = Math.min(UPGRADES[kind].max, profile.ups[kind] + 1);
    profile.owed = [];
    save();
    Sound.pick();
    const go = owedNext;
    owedNext = null;
    go?.();
  } else if (action === "menu") {
    Sound.tap();
    menu();
  } else if (action === "again") {
    Sound.pick();
    if (await adBreak()) again();
  } else if (action === "storm") {
    Sound.pick();
    if (await adBreak()) beginStorm();
  } else if (action === "replay") {
    Sound.pick();
    if (await adBreak()) begin(game.night);
  } else if (action === "next") {
    Sound.pick();
    if (await adBreak()) begin(game.night + 1);
  } else if (action === "pick") {
    if (!game.pick(button.dataset.kind)) return;
    Sound.pick();
    if (game.endless) {
      last = performance.now();
      paintMode();
      return;
    }
    profile.ups = { ...game.ups };
    if (game.night === profile.night) profile.night = game.night + 1;
    save();
    if (await adBreak()) begin(game.night + 1);
  } else if (action === "reset-yes") {
    for (const key of Object.keys(profile.ups)) profile.ups[key] = 0;
    profile.night = 1;
    profile.stars.fill(0);
    profile.best.fill(0);
    profile.storm = 0;
    profile.seen = {};
    profile.owed = [];
    save();
    menu();
  } else if (action === "reset-no") {
    id("panel").hidden = true;
  }
});

// ---------- меню ----------
function paintMenu() {
  const count = NIGHTS.length;
  const next = Math.min(profile.night, count);
  const start = id("start");
  start.disabled = false;
  text(start, profile.night === 1 ? "Зажечь маяк" : profile.night > count ? `Ночь ${count} ещё раз` : `Продолжить: ночь ${next}`);
  id("load").hidden = true;
  const box = id("nights");
  box.hidden = profile.night === 1;
  box.textContent = "";
  for (let n = 1; n <= count; n++) {
    const button = document.createElement("button");
    button.dataset.night = n;
    button.disabled = n > profile.night;
    if (n === profile.night) button.className = "next";
    button.setAttribute("aria-label", `Ночь ${n}: ${NIGHTS[n - 1].name}`);
    const stars = profile.stars[n - 1];
    button.innerHTML = `${n}<small>${stars ? "★".repeat(stars) : ""}</small>`;
    box.append(button);
  }
  const storm = id("storm");
  storm.hidden = profile.night <= count;
  storm.innerHTML = `Шторм до рассвета<small>${profile.storm ? "рекорд ✦ " + profile.storm : "бесконечный режим на рекорд"}</small>`;
  id("reset").hidden = profile.night === 1;
}
id("start").addEventListener("click", () => {
  Sound.unlock();
  Sound.pick();
  begin(Math.min(profile.night, NIGHTS.length));
});
id("nights").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-night]");
  if (!button || button.disabled) return;
  Sound.unlock();
  Sound.pick();
  begin(Number(button.dataset.night));
});
id("storm").addEventListener("click", () => {
  Sound.unlock();
  Sound.pick();
  beginStorm();
});
id("reset").addEventListener("click", () => {
  showPanel(`<div class="eyebrow"><i></i> НОВЫЙ СМОТРИТЕЛЬ</div><h2 id="panel-title">Начать сначала?</h2>
    <p>Звёзды, улучшения маяка и рекорд шторма сотрутся.</p>
    <div class="row"><button class="plain" data-action="reset-no">Нет, оставить</button><button class="plain" data-action="reset-yes">Да, сначала</button></div>`);
});

// ---------- приборы ----------
function paintHud() {
  if (game.mode === "demo") return;
  const max = game.maxHearts;
  const key = `${game.hearts}/${max}/${game.saved}/${game.total}/${game.score}/${game.endless}`;
  if (key !== lastHud) {
    lastHud = key;
    const hearts = id("hearts");
    if (hearts.childElementCount !== max) {
      hearts.textContent = "";
      for (let i = 0; i < max; i++) hearts.append(document.createElement("i"));
    }
    [...hearts.children].forEach((el, i) => {
      el.textContent = "♥";
      el.classList.toggle("off", i >= game.hearts);
    });
    text(id("saved"), game.endless ? game.saved : `${game.saved}/${game.total}`);
    text(id("score"), game.score);
  }
  const flash = id("flash");
  if (!flash.hidden) {
    const lit = game.flashT > 0;
    const ready = !lit && game.flashCool <= 0 && game.mode === "play";
    flash.classList.toggle("lit", lit);
    flash.classList.toggle("ready", ready);
    const charge = lit ? game.flashT / game.flashTime : 1 - game.flashCool / game.flashCooldown;
    flash.style.setProperty("--charge", charge.toFixed(3));
  }
}

// в меню луч сам гуляет по бухте
const demoPoint = { x: 0, z: 10 };
function demoAim(t) {
  let target = null;
  for (const boat of game.boats) {
    if (boat.z < game.bay.depth && !game.inHarbor(boat.x, boat.z) && (!target || boat.id % 3 === Math.floor(t / 6) % 3)) target = boat;
  }
  const tx = target ? target.x : Math.sin(t * 0.35) * game.bay.hw * 0.6;
  const tz = target ? target.z : game.bay.depth * (0.5 + 0.25 * Math.sin(t * 0.23));
  demoPoint.x += (tx - demoPoint.x) * 0.02;
  demoPoint.z += (tz - demoPoint.z) * 0.02;
  return demoPoint;
}

// ---------- главный цикл ----------
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  let sim = 0;
  const active = game.mode === "play" || game.mode === "dawn" || game.mode === "demo";
  if (active && !paused) {
    acc += real * rate;
    let guard = 0;
    while (acc >= STEP && guard++ < 400) {
      acc -= STEP;
      game.step(STEP, game.mode === "demo" ? demoAim(game.time) : aim);
      sim += STEP;
      if (game.events.length) {
        const events = game.events.splice(0);
        for (const e of events) onEvent(e, now);
      }
      if (game.mode !== "play" && game.mode !== "dawn" && game.mode !== "demo") {
        acc = 0;
        break;
      }
    }
    // тени шипят в луче
    sizzleIn -= real;
    if (sizzleIn <= 0 && game.mode === "play" && game.shades.some((s) => s.lit > 0)) {
      sizzleIn = 0.09;
      Sound.sizzle();
    }
    if (game.mode === "play") {
      let trouble = 0;
      for (const b of game.boats) if (b.held || (b.lost && b.peril < 3.5)) trouble++;
      Sound.mood(Math.max(0, 1 - trouble * 0.5));
    }
  }
  const wanted = game.mode + (paused ? ":paused" : "");
  if (game.mode === "lost" && shownMode === "lost") {
    if (now >= panelAt) paintLost();
  } else if (wanted !== shownMode && !(game.mode === "lost" && shownMode === "lost:panel")) paintMode();
  showHint(now);
  view.frame(game, sim, real);
  paintHud();
  watchSpeed(real);
}

// Если устройство не тянет 60 кадров, картинка рисуется чуть мельче: плавность важнее резкости.
let slowTime = 0;
let slowFrames = 0;
function watchSpeed(real) {
  if (document.hidden || real <= 0 || real >= 0.05) return; // свёрнутая вкладка и заминки не в счёт
  slowTime += real;
  slowFrames++;
  if (slowFrames < 120) return;
  const average = slowTime / slowFrames;
  slowTime = slowFrames = 0;
  if (average > 1 / 43 && view.quality > 0.56) {
    view.quality = Math.max(0.55, view.quality - 0.15);
    view.resize();
  }
}

// ---------- для проверок и роботов ----------
window.mayak = {
  game,
  view,
  profile,
  sound: Sound,
  state() {
    return {
      mode: game.mode,
      paused,
      night: game.night,
      endless: game.endless,
      hour: game.hour,
      time: +game.time.toFixed(2),
      hearts: game.hearts,
      saved: game.saved,
      total: game.total,
      wrecks: game.wrecks,
      score: game.score,
      ease: game.ease,
      flash: { on: game.flashT > 0, cool: +game.flashCool.toFixed(2) },
      boats: game.boats.map((b) => ({ id: b.id, kind: b.kind, x: +b.x.toFixed(2), z: +b.z.toFixed(2), lantern: +b.lantern.toFixed(2), lost: b.lost, held: !!b.held, peril: Number.isFinite(b.peril) ? +b.peril.toFixed(1) : null })),
      shades: game.shades.map((s) => ({ id: s.id, kind: s.kind, x: +s.x.toFixed(2), z: +s.z.toFixed(2), hp: +s.hp.toFixed(2), state: s.state })),
      ups: { ...game.ups },
      profile: { night: profile.night, stars: [...profile.stars], storm: profile.storm },
    };
  },
  // сразу начать ночь n (0 — шторм); прогресс открывается до неё
  jump(n) {
    if (n === 0) return beginStorm();
    profile.night = Math.max(profile.night, Math.min(n, NIGHTS.length));
    begin(Math.min(n, NIGHTS.length));
  },
  speed(k) {
    rate = Math.max(0, Math.min(40, Number(k) || 1));
  },
  // где на экране точка бухты: для роботов, которые водят луч касаниями
  point(x, z) {
    return view.project(x, z, 0);
  },
  menu,
};

menu();
requestAnimationFrame(frame);
