// «Маяк»: управление, приборы, подсказки, панели и сохранение. Правила — в rules.js, картинка — в view.js.
import { NIGHTS, UPGRADES, Bay, STORM_AT, FINDS } from "./rules.js?v=092eaf93";
import { BayView } from "./view.js?v=092eaf93";
import { Sound } from "./sound.js?v=092eaf93";

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
// Вторая глава (ноябрь 2026): tasks — выполненные задания по ночам (биты 0–2); shells — ракушки;
// owned — купленное в мастерской (биты 0–7 — цвета луча, 8–15 — краски маяка); beam, paint — что надето;
// daily — дата пройденной «Ночи дня» (ГГГГММДД); hour — лучший час шторма; q — графика (0 авто, 1–3 низкая–высокая).
// Старые сохранения (без этих полей) грузятся как есть: недостающее берётся по умолчанию.
const profile = { night: 1, ups: {}, stars: [], best: [], storm: 0, muted: false, seen: {}, tasks: [], shells: 0, owned: 257, beam: 0, paint: 0, daily: 0, hour: 0, q: 0 };
const int = (v, lo, hi, d) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : d);
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
  for (let i = 0; i < count; i++) profile.tasks[i] = int(saved.tasks && saved.tasks[i], 0, 7, 0);
  profile.shells = int(saved.shells, 0, 99999, 0);
  profile.owned = int(saved.owned, 0, 65535, 257) | 257; // тёплый луч и красная полоска есть всегда
  profile.beam = int(saved.beam, 0, BEAMS.length - 1, 0);
  profile.paint = int(saved.paint, 0, PAINTS.length - 1, 0);
  if (!(profile.owned & (1 << profile.beam))) profile.beam = 0;
  if (!(profile.owned & (1 << (8 + profile.paint)))) profile.paint = 0;
  profile.daily = int(saved.daily, 0, 99999999, 0);
  profile.hour = int(saved.hour, 0, 999, 0);
  profile.q = int(saved.q, 0, 3, 0);
  profile.seen = saved.seen && typeof saved.seen === "object" ? saved.seen : {};
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // игра работает и там, где сохранять нельзя
  }
}
// Мастерская: цвета луча и краски маяка за ракушки
const BEAMS = [
  { name: "Тёплый", price: 0, color: [1.0, 0.84, 0.52] },
  { name: "Лунный", price: 15, color: [0.72, 0.86, 1.0] },
  { name: "Мятный", price: 20, color: [0.6, 1.0, 0.78] },
  { name: "Розовый", price: 25, color: [1.0, 0.66, 0.82] },
  { name: "Сиреневый", price: 30, color: [0.82, 0.7, 1.0] },
  { name: "Радужный", price: 60, color: null },
];
const PAINTS = [
  { name: "Красная полоска", price: 0, stripe: "#e2483e", roof: "#d8443b" },
  { name: "Синяя полоска", price: 20, stripe: "#3f7fe0", roof: "#2f5fb8" },
  { name: "Зелёная полоска", price: 25, stripe: "#3fb56a", roof: "#2e8a54" },
  { name: "Золотая полоска", price: 40, stripe: "#f2b632", roof: "#e08a1e" },
];
const DAILY_SHELLS = 15;
const today = () => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
const MEDALS = [
  [15, "🥇", "золотая медаль"],
  [10, "🥈", "серебряная медаль"],
  [5, "🥉", "бронзовая медаль"],
];
const medalOf = (hour) => MEDALS.find(([h]) => hour >= h) || null;

load();
Sound.set(!profile.muted);

function applyLook() {
  view.setLook(BEAMS[profile.beam].color, PAINTS[profile.paint]);
}
applyLook();
view.setLevel(profile.q);

// Задания ночи: значок и как назвать
// третье — короткое название для строки с ходом «3/5» во время ночи
function taskText(task) {
  switch (task.kind) {
    case "stars3": return ["⭐", "Все лодки дома"];
    case "noflash": return ["🌙", "Без вспышки"];
    case "pop": return ["🫧", `Лопни ${task.n} теней`, "Тени"];
    case "streak": return ["⛵", `${task.n} лодок подряд`, "Подряд"];
    case "finds": return ["🍾", `Находок: ${task.n}`, "Находки"];
    case "whale": return ["🐋", "Разбуди кита"];
    case "score": return ["✦", `${task.n} очков`, "Очки"];
  }
  return ["•", task.kind];
}
// Строка задания: в игре — с ходом «3/5»
function taskLine(task, live = false) {
  const [icon, full, short] = taskText(task);
  const progress = live && !task.done && task.n ? ` <em>${game.taskProgress(task)}/${task.n}</em>` : "";
  const label = progress && short ? short : full;
  return `<span class="task${task.done ? " done" : ""}${task.old ? " old" : ""}"><i aria-hidden="true">${task.done ? "✓" : icon}</i>${label}${progress}</span>`;
}
let lastTasks = "";
function paintTasks() {
  const box = id("tasks");
  const show = playing() && !paused && game.tasks.length > 0;
  box.hidden = !show;
  if (!show) return;
  const html = game.tasks.map((task) => taskLine(task, true)).join("");
  if (html !== lastTasks) {
    lastTasks = html;
    box.innerHTML = html;
  }
}
// Подсчёт цифр вверх в панели итога («подпрыгивающие» награды)
function countUp(root) {
  for (const el of root.querySelectorAll("[data-count]")) {
    const to = Number(el.dataset.count) || 0;
    const prefix = el.dataset.prefix || "";
    const start = performance.now();
    const dur = Math.min(1100, 350 + to * 4);
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      el.textContent = prefix + Math.round(to * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(tick);
      else el.classList.add("bump");
    };
    el.textContent = prefix + "0";
    setTimeout(() => requestAnimationFrame(tick), 250);
  }
}
// Конфетти поверх панели итога: лёгкие CSS-полоски, без холста
function confetti(n = 46) {
  const box = id("confetti");
  box.textContent = "";
  const colors = ["#ffd98a", "#ff8fb1", "#8fd8ff", "#b9f59a", "#d4a8ff", "#fff3c8"];
  for (let i = 0; i < n; i++) {
    const piece = document.createElement("i");
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
    piece.style.animationDuration = (1.8 + Math.random() * 1.4).toFixed(2) + "s";
    piece.style.setProperty("--x", (Math.random() * 120 - 60).toFixed(0) + "px");
    piece.style.setProperty("--r", (Math.random() * 720 - 360).toFixed(0) + "deg");
    box.append(piece);
  }
  setTimeout(() => (box.textContent = ""), 3600);
}
// Ракушки: прибавить и сохранить
function addShells(n) {
  if (!n) return;
  profile.shells += n;
  save();
}
// Хук для наград за ролик в VK-версии: на портале кнопки нет
function bonusRow(gain) {
  return "";
}

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
let slow = 0; // сколько ещё длится замедление на победе ночи

const playing = () => game.mode === "play" || game.mode === "dawn";
const aspect = () => window.innerWidth / Math.max(1, window.innerHeight);

function text(element, value) {
  value = String(value);
  if (element.textContent !== value) element.textContent = value;
}

// Надписи не перебивают друг друга: следующая ждёт, пока прочитают предыдущую
let announceFree = 0;
const announceQueue = [];
function announce(message, above = "") {
  const now = performance.now();
  if (now < announceFree) {
    if (announceQueue.length < 3) announceQueue.push([message, above]);
    if (announceQueue.length === 1) setTimeout(nextAnnounce, announceFree - now);
    return;
  }
  announceFree = now + 1300;
  showAnnounce(message, above);
}
function nextAnnounce() {
  const item = announceQueue.shift();
  if (!item) return;
  announceFree = 0;
  announce(...item);
  if (announceQueue.length) setTimeout(nextAnnounce, 1300);
}
function showAnnounce(message, above) {
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
  Sound.rain(false); // ушли из грозовой ночи в меню — дождь стихает
  paintMenu();
  paintMode();
  view.setBay(game);
  layout();
  Sound.mood(1);
}

function begin(night) {
  paused = false;
  clearHints();
  aim = finger = null;
  game.restoreUps();
  game.ups = { ...profile.ups };
  if (night === 1 && profile.night <= 1) for (const key of ["beam", "astray", "shade", "grab"]) delete profile.seen[key];
  game.startNight(night, { aspect: aspect(), grant: night === profile.night, done: profile.tasks[night - 1] || 0 });
  afterStart();
}

// «Ночь дня»: одна на всех в этот день; награда — раз в день
function beginDaily() {
  paused = false;
  clearHints();
  aim = finger = null;
  game.restoreUps();
  game.ups = { ...profile.ups };
  game.startDaily({ aspect: aspect(), seed: today() });
  afterStart();
}

function beginStorm() {
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
  slow = 0;
  lastTasks = "";
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
  if (game.tasks.length && game.night >= 2 && !profile.seen.task) hint("task", "Внизу слева — задания ночи. За каждое — ракушки 🐚", 5);
  if (game.rain) hint("rain", "Гроза! В дождь фонарики гаснут быстрее, а молния на миг освещает всю бухту", 5.5);
}

// ---------- события правил: звук, надписи, подсказки ----------
function onEvent(e, now) {
  view.handle(e, game);
  if (game.mode === "demo") return;
  switch (e.type) {
    case "night":
      Sound.night();
      Sound.rain(game.rain);
      if (game.endless) announce("Шторм до рассвета", "ДЕРЖИСЬ, СМОТРИТЕЛЬ");
      else if (game.daily) announce("Ночь дня", (profile.daily === today() ? "НАГРАДА УЖЕ ПОЛУЧЕНА" : `НАГРАДА ${DAILY_SHELLS} 🐚`) + " · " + game.dailyEvents.map((k) => ({ rain: "ГРОЗА", fog: "ТУМАН", gusts: "ВЕТЕР", whale: "КИТ", finds: "НАХОДКИ" })[k]).join(" + "));
      else announce(e.name, `НОЧЬ ${e.night} ИЗ ${NIGHTS.length}` + (game.ease ? " · МОРЕ СПОКОЙНЕЕ" : ""));
      break;
    case "hour":
      if (e.hour > 1) {
        const medal = MEDALS.find(([h]) => h === e.hour);
        announce(medal ? `${medal[1]} Час ${e.hour}` : `Час ${e.hour}`, medal ? medal[2].toUpperCase() : "ШТОРМ КРЕПЧАЕТ");
        Sound.night();
      }
      Sound.rain(game.rain);
      break;
    case "hour-shell":
      addShells(e.shells);
      break;
    case "task": {
      const task = game.tasks[e.i];
      if (!game.daily && game.night) {
        profile.tasks[game.night - 1] = (profile.tasks[game.night - 1] || 0) | (1 << e.i);
      }
      addShells(e.shells);
      Sound.task();
      announce(`+${e.shells} 🐚`, "ЗАДАНИЕ: " + taskText(task)[1].toUpperCase());
      lastTasks = "";
      break;
    }
    case "find-up":
      Sound.findUp();
      hint("find", "В море находка! Подержи её в луче — и она твоя", 5);
      break;
    case "find": {
      Sound.find(e.kind);
      addShells(e.shells);
      const word = e.kind === "bottle" ? `+${e.shells} 🐚` : e.kind === "buoy" ? "Светобуй!" : "Вспышка скорее!";
      float(e.x, e.z, word, "gold");
      break;
    }
    case "whale":
      Sound.whale();
      hint("whale", "Кит-фонарик! Посвети на него — он поможет лодкам", 5, true);
      break;
    case "spout":
      Sound.spout();
      addShells(e.shells);
      announce("Кит проснулся!", `+${e.points} · +${e.shells} 🐚`);
      break;
    case "bolt":
      Sound.thunder();
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
    case "flash":
      Sound.flash();
      glare();
      break;
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
      Sound.rain(false);
      // победа ночи: на миг всё замедляется, вспышка и салют над деревней
      slow = 1.1;
      glare();
      if (!game.wrecks) Sound.fireworks();
      announce("Рассвет!", game.wrecks ? "НОЧЬ ПОЗАДИ" : "ВСЕ ЛОДКИ ДОМА");
      break;
    case "fail":
      Sound.fail();
      Sound.rain(false);
      panelAt = now + 1300;
      break;
    case "won":
      Sound.win();
      break;
  }
}

function glare() {
  const el = id("glare");
  el.classList.remove("go");
  void el.offsetWidth;
  el.classList.add("go");
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
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (playing() && !paused) pause();
    Sound.hush();
  } else if (!paused) Sound.unlock();
});
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
    const tasks = game.tasks.length ? `<div class="task-list">${game.tasks.map((task) => taskLine(task, true)).join("")}</div>` : "";
    showPanel(`<div class="eyebrow"><i></i> МАЯК ЖДЁТ</div><h2 id="panel-title">Пауза</h2>${tasks}
      <button class="primary" data-action="resume">Продолжить</button>
      <div class="row"><button class="plain" data-action="sound">Звук: ${profile.muted ? "выключен" : "включён"}</button><button class="plain" data-action="menu">В меню</button></div>
      <div class="row solo"><button class="plain" data-action="quality">${qualityLabel()}</button></div>`);
    return;
  }
  if (mode === "upgrade" && game.endless) {
    showPanel(`<div class="eyebrow"><i></i> ЧАС ${game.hour - 1} ПОЗАДИ</div><h2 id="panel-title">Подмога в шторм</h2>
      <p>Выбери улучшение — оно с тобой до конца шторма.</p><div class="choices">${cards()}</div>`);
    return;
  }
  if ((mode === "upgrade" || mode === "won") && game.result && game.result.daily) {
    paintDaily();
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
    const facts = `<div class="facts"><span><b>${r.saved} из ${r.total}</b>лодок дома</span><span><b data-count="${r.popped}">${r.popped}</b>теней лопнуло</span><span><b data-count="${r.score}">${r.score}</b>очков${record ? " · рекорд" : ""}</span></div>`;
    const word = r.stars === 3 ? "Все лодки дома!" : r.stars === 2 ? "Почти все дома" : "Ночь позади";
    // задания ночи и ракушки
    const tasks = r.tasks.length ? `<div class="task-list">${r.tasks.map((task) => taskLine(task)).join("")}</div>` : "";
    const gain = r.shells ? `<p class="gain">Ракушек за ночь: <b data-count="${r.shells}" data-prefix="+">+${r.shells}</b> 🐚 · всего ${profile.shells}</p>${bonusRow(r.shells)}` : "";
    const unlock = n === STORM_AT && profile.night <= STORM_AT + 1 ? `<p class="note gold">Открыт «Шторм до рассвета» — бесконечный режим на рекорд. А впереди — вторая глава: Грозовой берег!</p>` : "";
    const extra = tasks + gain + unlock;
    if (r.stars === 3 || mode === "won") setTimeout(() => confetti(), 300);
    setTimeout(() => countUp(id("panel-body")), 0);
    if (mode === "won") {
      const total = profile.stars.reduce((a, b) => a + b, 0);
      showPanel(`<div class="eyebrow"><i></i> ПОСЛЕДНЯЯ НОЧЬ ПОЗАДИ</div><h2 id="panel-title">Рассвет над бухтой!</h2>${starsRow(r.stars)}${facts}${extra}
        <p>Маяк выстоял все грозы. Всего звёзд: ${total} из ${NIGHTS.length * 3}. Дальше — «Шторм до рассвета» на рекорд и «Ночь дня» каждый день.</p>
        <button class="primary" data-action="storm">Шторм до рассвета</button>
        <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
    } else if (game.offer.length) {
      showPanel(`<div class="eyebrow"><i></i> НОЧЬ ${n} ПОЗАДИ</div><h2 id="panel-title">${word}</h2>${starsRow(r.stars)}${facts}${extra}
        <p>Выбери улучшение для маяка:</p><div class="choices">${cards()}</div>`);
    } else {
      const next = n + 1 <= Math.min(profile.night, NIGHTS.length);
      showPanel(`<div class="eyebrow"><i></i> НОЧЬ ${n} ПОЗАДИ</div><h2 id="panel-title">${word}</h2>${starsRow(r.stars)}${facts}${extra}
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
    const medalBefore = medalOf(profile.hour);
    profile.hour = Math.max(profile.hour, game.hour);
    const medal = medalOf(profile.hour);
    save();
    const nextMedal = [...MEDALS].reverse().find(([h]) => h > profile.hour);
    const medalLine = medal && medal !== medalBefore ? `<p class="gain">${medal[1]} Новая награда: ${medal[2]}!</p>` : nextMedal ? `<p class="note">Следующая награда ${nextMedal[1]} — продержаться до ${nextMedal[0]}-го часа.</p>` : `<p class="note">У тебя все медали шторма ${medal ? medal[1] : ""}</p>`;
    if (record || (medal && medal !== medalBefore)) setTimeout(() => confetti(), 300);
    showPanel(`<div class="eyebrow"><i></i> ШТОРМ СТИХ НА ${game.hour}-М ЧАСУ</div><h2 id="panel-title">${record ? "Новый рекорд!" : "Шторм позади"}</h2>
      <p class="big-score">✦ ${game.score}</p>
      <div class="facts"><span><b>${game.saved}</b>лодок дома</span><span><b>${game.popped}</b>теней лопнуло</span><span><b>${profile.storm}</b>рекорд</span></div>
      ${game.shells ? `<p class="gain">Ракушек за шторм: +${game.shells} 🐚</p>` : ""}${medalLine}
      <button class="primary" data-action="storm">Ещё раз</button>
      <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
    return;
  }
  const tip = game.fog
    ? "В тумане луч слабее: держи его на лодке подольше."
    : game.gustQueue.length || game.gust
      ? "В ветер фонарики гаснут быстрее — береги вспышку для порыва."
      : "Лодке со знаком «!» свет нужен первой. А вспышка выручит, когда бед сразу несколько.";
  showPanel(`<div class="eyebrow"><i></i> ${game.daily ? "НОЧЬ ДНЯ" : `НОЧЬ ${game.night} ИЗ ${NIGHTS.length}`}</div><h2 id="panel-title">Ночь не удалась</h2>
    <p>Дома ${game.saved} из ${game.total}. Экипажи спаслись на кругах — а лодки попробуем провести ещё раз.</p>
    <p class="note">${tip}</p>
    <button class="primary" data-action="again">Ещё раз</button>
    <p class="note">Море станет чуть спокойнее: меньше теней, фонарики горят дольше.</p>
    <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
}

// Итог «Ночи дня»: награда раз в день
function paintDaily() {
  const r = game.result;
  const first = profile.daily !== today();
  if (first) {
    profile.daily = today();
    addShells(DAILY_SHELLS);
  }
  const total = r.shells + (first ? DAILY_SHELLS : 0);
  if (first) setTimeout(() => confetti(), 300);
  showPanel(`<div class="eyebrow"><i></i> НОЧЬ ДНЯ ПОЗАДИ</div><h2 id="panel-title">${first ? "Награда дня!" : "Отличная ночь!"}</h2>${starsRow(r.stars)}
    <div class="facts"><span><b>${r.saved} из ${r.total}</b>лодок дома</span><span><b data-count="${r.popped}">${r.popped}</b>теней лопнуло</span><span><b data-count="${r.score}">${r.score}</b>очков</span></div>
    <p class="gain">Ракушек: <b data-count="${total}" data-prefix="+">+${total}</b> 🐚 · всего ${profile.shells}</p>${bonusRow(total)}
    <p class="note">${first ? "Завтра будет новая «Ночь дня» — с другими событиями." : "Награду за сегодня ты уже получил. Завтра — новая ночь!"}</p>
    <div class="row solo"><button class="plain" data-action="menu">В меню</button></div>`);
  setTimeout(() => countUp(id("panel-body")), 0);
}

// Мастерская маяка: цвета луча и краски
function swatch(color) {
  if (!color) return "conic-gradient(#ff8a8a, #ffd27a, #b9f59a, #8fd8ff, #d4a8ff, #ff8a8a)";
  return `rgb(${color.map((c) => Math.round(c * 255)).join(",")})`;
}
function paintShop() {
  const item = (group, i, look, name, price) => {
    const bit = group === "beam" ? i : 8 + i;
    const has = profile.owned & (1 << bit);
    const worn = group === "beam" ? profile.beam === i : profile.paint === i;
    const label = worn ? "✓ Надето" : has ? "Надеть" : `${price} 🐚`;
    const can = worn ? false : has || profile.shells >= price;
    return `<button class="shop-item${worn ? " worn" : ""}" data-action="${has ? "wear" : "buy"}" data-group="${group}" data-i="${i}" ${can ? "" : "disabled"}><i style="background:${look}"></i><b>${name}</b><small>${label}</small></button>`;
  };
  showPanel(`<div class="eyebrow"><i></i> ЗА РАКУШКИ</div><h2 id="panel-title">Мастерская маяка</h2>
    <p class="gain">У тебя <b>${profile.shells}</b> 🐚 <small>— ракушки дают задания ночей, письма в бутылках, кит и «Ночь дня»</small></p>
    <h3>Цвет луча</h3><div class="shop">${BEAMS.map((b, i) => item("beam", i, swatch(b.color), b.name, b.price)).join("")}</div>
    <h3>Краска маяка</h3><div class="shop paints">${PAINTS.map((p, i) => item("paint", i, `repeating-linear-gradient(180deg, ${p.stripe} 0 8px, #f6f3ea 8px 16px)`, p.name, p.price)).join("")}</div>
    <div class="row solo"><button class="plain" data-action="close">Готово</button></div>`);
}

const QUALITY = ["Авто", "Низкая", "Средняя", "Высокая"];
function qualityLabel() {
  return `Графика: ${QUALITY[profile.q]}${profile.q === 0 ? " (" + QUALITY[view.level + 1].toLowerCase() + ")" : ""}`;
}

id("panel-body").addEventListener("click", (event) => {
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
  } else if (action === "menu") {
    Sound.tap();
    menu();
  } else if (action === "again") {
    Sound.pick();
    again();
  } else if (action === "storm") {
    Sound.pick();
    beginStorm();
  } else if (action === "replay") {
    Sound.pick();
    begin(game.night);
  } else if (action === "next") {
    Sound.pick();
    begin(game.night + 1);
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
    begin(game.night + 1);
  } else if (action === "reset-yes") {
    for (const key of Object.keys(profile.ups)) profile.ups[key] = 0;
    profile.night = 1;
    profile.stars.fill(0);
    profile.best.fill(0);
    profile.storm = 0;
    profile.tasks.fill(0);
    profile.shells = 0;
    profile.owned = 257;
    profile.beam = 0;
    profile.paint = 0;
    profile.daily = 0;
    profile.hour = 0;
    applyLook();
    profile.seen = {};
    save();
    menu();
  } else if (action === "reset-no" || action === "close") {
    id("panel").hidden = true;
    if (game.mode === "demo") paintMenu();
  } else if (action === "quality") {
    profile.q = (profile.q + 1) % 4;
    save();
    view.setLevel(profile.q);
    Sound.tap();
    button.textContent = qualityLabel();
    if (game.mode === "demo") text(id("quality"), qualityLabel());
  } else if (action === "daily") {
    Sound.pick();
    beginDaily();
  } else if (action === "buy" || action === "wear") {
    const group = button.dataset.group;
    const i = Number(button.dataset.i);
    const list = group === "beam" ? BEAMS : PAINTS;
    const bit = 1 << (group === "beam" ? i : 8 + i);
    if (!list[i]) return;
    if (action === "buy") {
      if (profile.owned & bit || profile.shells < list[i].price) return;
      profile.shells -= list[i].price;
      profile.owned |= bit;
      Sound.buy();
    } else Sound.pick();
    if (group === "beam") profile.beam = i;
    else profile.paint = i;
    save();
    applyLook();
    paintShop();
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
  storm.hidden = profile.night <= STORM_AT;
  const medal = medalOf(profile.hour);
  storm.innerHTML = `Шторм до рассвета<small>${profile.storm ? (medal ? medal[1] + " " : "") + "рекорд ✦ " + profile.storm : "бесконечный режим на рекорд"}</small>`;
  id("reset").hidden = profile.night === 1;
  // ракушки, мастерская и «Ночь дня» — с третьей ночи
  const extras = profile.night >= 3 || profile.shells > 0;
  id("extras").hidden = !extras;
  const done = profile.daily === today();
  id("daily").innerHTML = `🌟 Ночь дня<small>${done ? "✓ сегодня пройдена" : `+${DAILY_SHELLS} 🐚 сегодня`}</small>`;
  id("daily").classList.toggle("done", done);
  id("shop").innerHTML = `🐚 Мастерская<small>ракушек: ${profile.shells}</small>`;
  text(id("quality"), qualityLabel());
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
id("daily").addEventListener("click", () => {
  Sound.unlock();
  Sound.pick();
  beginDaily();
});
id("shop").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  paintShop();
});
id("quality").addEventListener("click", () => {
  profile.q = (profile.q + 1) % 4;
  save();
  view.setLevel(profile.q);
  Sound.unlock();
  Sound.tap();
  text(id("quality"), qualityLabel());
});
id("reset").addEventListener("click", () => {
  showPanel(`<div class="eyebrow"><i></i> НОВЫЙ СМОТРИТЕЛЬ</div><h2 id="panel-title">Начать сначала?</h2>
    <p>Звёзды, улучшения маяка, ракушки, мастерская и рекорд шторма сотрутся.</p>
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
    // замедление на победе ночи
    slow = Math.max(0, slow - real);
    acc += real * rate * (slow > 0 ? 0.3 + 0.7 * (1 - Math.min(1, slow / 1.1)) ** 2 : 1);
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
  paintTasks();
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
  // сначала ниже уровень графики (если выбрано «Авто»), потом мельче картинка
  if (average > 1 / 45) {
    if (profile.q === 0 && view.level > 0) view.setLevel(0, view.level - 1);
    else if (view.quality > 0.56) {
      view.quality = Math.max(0.55, view.quality - 0.15);
      view.resize();
    }
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
      finds: game.finds.map((f) => ({ id: f.id, kind: f.kind, x: +f.x.toFixed(2), z: +f.z.toFixed(2), glow: +f.glow.toFixed(2) })),
      whales: game.whales.map((w) => ({ id: w.id, x: +w.x.toFixed(2), z: +w.z.toFixed(2), state: w.state, woke: +w.woke.toFixed(2) })),
      rain: game.rain,
      tasks: game.tasks.map((t) => ({ ...t })),
      shells: game.shells,
      daily: game.daily,
      level: view.level,
      profile: { night: profile.night, stars: [...profile.stars], storm: profile.storm, shells: profile.shells, tasks: [...profile.tasks], daily: profile.daily, hour: profile.hour },
    };
  },
  // сразу начать ночь n (0 — шторм); прогресс открывается до неё
  jump(n) {
    if (n === 0) return beginStorm();
    if (n === "daily") return beginDaily();
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
  today,
  save,
};

menu();
requestAnimationFrame(frame);
