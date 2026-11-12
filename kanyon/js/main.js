// «Грозовой каньон»: управление, приборы, панели, звук и главный цикл.
import { LEVELS, ZONES, PERKS, PERK_COST, Raid } from "./rules.js?v=9a05a695";
import { CanyonView } from "./view.js?v=9a05a695";
import { Sound } from "./sound.js?v=9a05a695";
import { readStorage, writeStorage } from "./kit.js?v=9a05a695";

const id = name => document.getElementById(name);
const canvas = id("stage");
const game = new Raid();
const view = new CanyonView(canvas);
const SAVE = "kanyon-v1";

let saved = {};
try { saved = JSON.parse(readStorage(SAVE)) || {}; } catch {}
const whole = (n, max = 1e9) => (Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : 0);
let best = whole(saved.best);
// v2 (2026-11-12): зон стало семь. В старом сохранении «6» значило «рейд пройден».
if (!saved.v && saved.deep === 6) saved.deep = ZONES.length + 1;
let deep = whole(saved.deep, ZONES.length + 1); // ZONES.length + 1 — рейд пройден
let level = LEVELS[saved.level] ? saved.level : "normal";
let parts = whole(saved.parts); // детали для мастерской
const perks = {};
for (const kind of PERKS) perks[kind] = whole(saved.perks?.[kind], PERK_COST.length);
let longest = { wave: whole(saved.endless?.wave), score: whole(saved.endless?.score) }; // рекорд бесконечного полёта
let quality = ["auto", "high", "mid", "low"].includes(saved.quality) ? saved.quality : "auto";
const save = () => writeStorage(SAVE, JSON.stringify({ v: 2, best, deep, level, parts, perks, endless: longest, quality }));

// Сложность: три кнопки в меню, выбор запоминается
const LEVEL_NOTES = { easy: "полегче", normal: "очки ×1.5", hard: "очки ×2" };
function paintLevels() {
  const box = id("levels");
  box.textContent = "";
  for (const [key, info] of Object.entries(LEVELS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(key === level));
    button.dataset.level = key;
    button.append(info.name);
    const note = document.createElement("small");
    note.textContent = LEVEL_NOTES[key];
    button.append(note);
    box.append(button);
  }
}
id("levels").addEventListener("click", event => {
  const key = event.target.closest("[data-level]")?.dataset.level;
  if (!key || key === level) return;
  level = key;
  save();
  paintLevels();
  Sound.unlock();
  Sound.tick();
});
paintLevels();

// Мастерская: значок, название, что даёт один уровень
const PERK_INFO = {
  hull: ["🛡", "Прочный корпус", "+15 к корпусу"],
  laser: ["⚡", "Мощные лазеры", "+12% к урону лазеров и молнии"],
  rocket: ["🚀", "Ракетная шахта", "+1 ракета в залпе"],
  power: ["🔋", "Батарея", "Оружие из капсул дольше, щит крепче"],
};
// Оружие из капсул
const WEAPON_INFO = { plasma: ["ПЛАЗМА", "Плазма — широкий веер!"], chain: ["МОЛНИЯ", "Молния бьёт сама!"], shield: ["ЩИТ", "Щит — держит удары!"] };
// Короткие подписи задания на приборе
const TASK_SHORT = { kills: "Сбито", gems: "Кристаллы", cruiser: "Крейсер", rockets: "Ракетами", combo: "Серия", flock: "Звено", tough: "Урон" };

// Модули ангара: значок, название, что даёт
const MODULE_INFO = {
  rapid: ["⚡", "Скорострел", "Лазеры бьют на четверть чаще"],
  spread: ["✴", "Веер", "Ещё два луча по бокам"],
  armor: ["🛡", "Броня", "+35 к корпусу и ремонт"],
  rockets: ["🚀", "Ракетный блок", "+2 ракеты, заряжаются быстрее"],
  magnet: ["🧲", "Магнит", "Кристаллы летят сами, прицел цепче"],
  wing: ["🛩", "Ведомый", "Дрон рядом стреляет сам"],
};

function text(element, value) {
  value = String(value);
  if (element.textContent === value) return false;
  element.textContent = value;
  return true;
}
function ratio(element, value) {
  const scaled = `scaleX(${Math.max(0, Math.min(1, value)).toFixed(3)})`;
  if (element.style.transform !== scaled) element.style.transform = scaled;
}
function announce(message, above = "", alert = false) {
  const banner = id("announcement");
  banner.classList.remove("show");
  banner.classList.toggle("alert", alert);
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

// ---------- Управление ----------
const keys = new Set();
const directions = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
};
let finger = null; // палец, который ведёт истребитель: откуда начал и где тогда была машина
let target = null;
let hasMoved = false;
let usedRockets = false;
let pausedFrom = null;
let told = new Set(); // подсказки, уже показанные в этом рейде
let flight = "raid"; // raid — рейд по семи зонам, endless — бесконечный полёт
let banked = { score: 0, stars: 0 }; // что из этого полёта уже обменяно на детали
let earned = 0; // деталей за этот полёт

// Детали начисляются по ходу: за каждую пройденную зону, задания и каждые 500 очков
function bank(cleared = 0) {
  const gain = Math.max(0, Math.floor((game.score - banked.score) / 500)) + (game.stars - banked.stars) * 20 + cleared * 8;
  banked = { score: Math.max(banked.score, game.score), stars: game.stars };
  if (gain > 0) {
    parts += gain;
    earned += gain;
    save();
  }
  return gain;
}

const active = () => game.mode === "play" || game.mode === "break";

function clearInput() {
  if (finger && canvas.hasPointerCapture(finger.id)) canvas.releasePointerCapture(finger.id);
  finger = target = null;
  keys.clear();
}

canvas.addEventListener("pointerdown", event => {
  if (!active() || finger || event.button !== 0) return;
  Sound.unlock();
  finger = { id: event.pointerId, x: event.clientX, y: event.clientY, shipX: game.player.x, shipY: game.player.y };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", event => {
  if (!finger || finger.id !== event.pointerId) return;
  const scale = view.dragScale();
  const b = game.bounds;
  target = {
    x: Math.max(-b.x, Math.min(b.x, finger.shipX + (event.clientX - finger.x) * scale.x)),
    y: Math.max(b.bottom, Math.min(b.top, finger.shipY - (event.clientY - finger.y) * scale.y)),
  };
  // у края коридора точка отсчёта подтягивается, чтобы обратное движение срабатывало сразу
  finger.shipX = target.x - (event.clientX - finger.x) * scale.x;
  finger.shipY = target.y + (event.clientY - finger.y) * scale.y;
  hasMoved = true;
});
function lift(event) {
  if (finger?.id === event.pointerId) finger = target = null;
}
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, lift);
canvas.addEventListener("contextmenu", event => event.preventDefault());

window.addEventListener("keydown", event => {
  if (event.code === "Escape" && !event.repeat) {
    if (active()) pause();
    else if (game.mode === "paused") resume();
    return;
  }
  if (!active() || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "Space" && !event.target.closest?.("button,a")) {
    event.preventDefault();
    if (!event.repeat) launch();
  } else if (directions[event.code]) {
    event.preventDefault();
    keys.add(event.code);
    hasMoved = true;
    Sound.unlock();
  }
});
window.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (active()) pause();
    Sound.hush();
  }
});

function currentMove() {
  const pressed = [...keys].map(key => directions[key]);
  const x = Number(pressed.includes("right")) - Number(pressed.includes("left"));
  const y = Number(pressed.includes("up")) - Number(pressed.includes("down"));
  const length = Math.hypot(x, y) || 1;
  return { target: x || y ? null : target || { x: game.player.x, y: game.player.y }, x: x / length, y: y / length };
}

function launch() {
  Sound.unlock();
  if (game.fireRockets()) usedRockets = true;
}
id("rocket").addEventListener("pointerdown", event => {
  if (event.pointerType === "touch") launch();
});
id("rocket").addEventListener("click", launch);

function paintSound() {
  id("sound").setAttribute("aria-pressed", String(Sound.on));
  id("sound").setAttribute("aria-label", Sound.on ? "Выключить звук" : "Включить звук");
}
id("sound").onclick = () => {
  Sound.toggle();
  paintSound();
  Sound.tick();
};
paintSound();

function paintRecord() {
  id("best").hidden = best === 0 && !longest.wave;
  const reach = deep > ZONES.length ? "рейд пройден" : deep ? `зона ${deep} из ${ZONES.length}` : "";
  text(id("best"), "Рекорд рейда  ◆ " + best + (reach ? "  ·  " + reach : "") + (longest.wave ? `  ·  ∞ волна ${longest.wave}` : ""));
  text(id("parts"), parts);
  text(id("quality"), "Графика: " + QUALITY_NAMES[quality] + (quality === "auto" ? ` (${QUALITY_NAMES[view.quality]})` : ""));
}
const QUALITY_NAMES = { auto: "авто", high: "высокая", mid: "средняя", low: "низкая" };
view.setQuality(quality);
paintRecord();
id("quality").onclick = () => {
  const order = ["auto", "high", "mid", "low"];
  quality = order[(order.indexOf(quality) + 1) % order.length];
  view.setQuality(quality);
  save();
  paintRecord();
  Sound.unlock();
  Sound.tick();
};

// ---------- Панели ----------
let pressedPanel = false; // нажатие началось на самой панели, а не на экране под ней
function showPanel(markup) {
  pressedPanel = false;
  id("panel-body").innerHTML = markup;
  id("panel").hidden = false;
  id("panel-body").querySelector("button").focus({ preventScroll: true });
}
id("panel").addEventListener("pointerdown", () => (pressedPanel = true));

function pause() {
  if (!active()) return;
  pausedFrom = game.mode;
  game.mode = "paused";
  clearInput();
  Sound.hush();
}
function resume() {
  if (game.mode !== "paused") return;
  Sound.unlock();
  game.mode = pausedFrom;
  pausedFrom = null;
}
id("pause").onclick = pause;

function start() {
  clearInput();
  Sound.unlock();
  hasMoved = usedRockets = false;
  told = new Set();
  banked = { score: 0, stars: 0 };
  earned = 0;
  view.reset();
  game.start(level, { endless: flight === "endless", perks });
}
id("start").onclick = () => {
  flight = "raid";
  start();
};
id("endless").onclick = () => {
  flight = "endless";
  start();
};
id("shop").onclick = () => {
  Sound.unlock();
  Sound.tick();
  showShop();
};

// Мастерская: вечные улучшения за детали
function showShop() {
  const rows = PERKS.map(kind => {
    const [icon, name, about] = PERK_INFO[kind];
    const lvl = perks[kind];
    const cost = PERK_COST[lvl];
    const pips = PERK_COST.map((_, i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("");
    const buy = cost === undefined ? `<button class="buy" disabled>Готово</button>`
      : `<button class="buy" data-action="buy" data-kind="${kind}" ${parts < cost ? "disabled" : ""}>⚙ ${cost}</button>`;
    return `<div class="perk"><b class="icon" aria-hidden="true">${icon}</b><span><b>${name}</b><small>${about}</small><span class="pips">${pips}</span></span>${buy}</div>`;
  }).join("");
  showPanel(`<div class="eyebrow">МАСТЕРСКАЯ</div><h2 id="panel-title">Улучши «Стрижа»</h2>
    <p class="wallet">У тебя <b>⚙ ${parts}</b> деталей<span class="why">. Они даются за пройденные зоны, задания и очки</span>.</p>
    <div class="perks">${rows}</div>
    <div class="pair solo"><button class="choice" data-action="close">Готово</button></div>`);
}

// Действия панелей сверх основных (их обработчик — ниже)
function more(action, button) {
  if (action === "close") {
    id("panel").hidden = true;
    paintRecord();
  } else if (action === "buy") {
    const kind = button.dataset.kind;
    const cost = PERK_COST[perks[kind]];
    if (cost === undefined || parts < cost) return;
    parts -= cost;
    perks[kind]++;
    save();
    Sound.unlock();
    Sound.module();
    showShop();
    id("panel-body").querySelector(`[data-kind="${kind}"]`)?.closest(".perk").classList.add("pop");
  } else if (action === "shop") showShop();
}

function again() {
  clearInput();
  Sound.unlock();
  view.reset();
  game.retry();
}

function dock() {
  if (game.mode !== "menu") bank(); // брошенный полёт: детали за набранное всё равно идут
  clearInput();
  view.reset();
  game.reset();
}

function paintMode() {
  const mode = game.mode;
  document.body.dataset.mode = mode;
  document.body.dataset.flight = game.endless ? "endless" : "raid";
  id("intro").hidden = mode !== "menu";
  id("controls").hidden = mode === "menu";
  id("mission").hidden = mode === "menu";
  id("pause").hidden = !active();
  id("panel").hidden = true;
  Sound.mood(mode === "menu" ? 0 : 1);

  if (mode === "paused") {
    showPanel('<div class="eyebrow">РЕЙД «СТРИЖА»</div><h2 id="panel-title">Пауза</h2><p>Двигатели на холостом ходу.</p><button class="primary" data-action="resume">Продолжить</button>');
  } else if (mode === "upgrade") {
    clearInput();
    const cards = game.offer.map(kind => {
      const [icon, name, about] = MODULE_INFO[kind];
      return `<button class="choice" data-action="module" data-kind="${kind}"><i aria-hidden="true">${icon}</i><b>${name}</b><small>${about}</small></button>`;
    }).join("");
    const task = game.task;
    const done = task?.done ? `<span class="star">★</span> Задание выполнено: ${task.text.toLowerCase()}` : `<span class="star off">★</span> Задание не вышло: ${task?.text.toLowerCase() || ""}`;
    const head = game.endless ? `ВОЛНА ${game.wave} ПРОЙДЕНА` : `ЗОНА ${game.zone} ПРОЙДЕНА`;
    const next = game.endless ? `волна ${game.wave + 1}` : ZONES[game.zone].name.toLowerCase();
    showPanel(`<div class="eyebrow">АНГАР · ${head}</div><h2 id="panel-title">Усиль «Стрижа»</h2><p class="task-line">${done} · <b class="gain">+⚙ ${lastGain}</b></p><p>Выбери один модуль. Дальше — ${next}.</p><div class="choices">${cards}</div>`);
  } else if (mode === "lost" && game.endless) {
    // бесконечный полёт окончен: рекорд по волнам
    clearInput();
    bank();
    const record = game.wave > longest.wave || (game.wave === longest.wave && game.score > longest.score);
    if (record) longest = { wave: game.wave, score: game.score };
    save();
    paintRecord();
    showPanel(`<div class="eyebrow">БЕСКОНЕЧНЫЙ ПОЛЁТ · ${LEVELS[game.level].name.toUpperCase()}</div>
      <h2 id="panel-title">${record ? "Новый рекорд!" : "Полёт окончен"}</h2>
      <p class="result-score">∞ волна ${game.wave} · ◆ ${game.score}</p>${facts()}
      <p class="earned">Детали за полёт: <b class="gain">+⚙ ${earned}</b> · рекорд — волна ${longest.wave}</p>${rewardOffer()}
      <button class="primary" data-action="retry">Ещё полёт</button>
      <div class="pair"><button class="choice" data-action="shop">Мастерская</button><button class="choice" data-action="dock">В меню</button></div>`);
    if (record) confetti();
  } else if (mode === "won" || mode === "lost") {
    clearInput();
    const win = mode === "won";
    bank();
    const reached = win ? ZONES.length + 1 : game.zone;
    if (game.score > best || reached > deep) {
      best = Math.max(best, game.score);
      deep = Math.max(deep, reached);
      save();
    }
    paintRecord();
    if (win) {
      showPanel(`<div class="eyebrow">РЕЙД ЗАВЕРШЁН · ${LEVELS[game.level].name.toUpperCase()}</div>
        <h2 id="panel-title">Цитадель пала!</h2>
        <p class="result-score">◆ ${game.score} · <span class="star">★</span> ${game.stars} из ${ZONES.length}</p>${facts()}
        <p>«Стриж» прошёл весь каньон${game.retries ? "" : " — и ни разу не был сбит"}. Детали за рейд: <b class="gain">+⚙ ${earned}</b></p>${rewardOffer()}
        <button class="primary" data-action="retry">Новый рейд</button>
        <div class="pair"><button class="choice" data-action="shop">Мастерская</button><button class="choice" data-action="dock">В меню</button></div>`);
      confetti();
    } else {
      const bossAlive = game.enemies.some(enemy => enemy.kind === "boss");
      const tip = bossAlive ? "У хозяина зоны береги ракеты для залпа в упор и следи за метками — туда прилетит заряд."
        : "Красные кольца показывают, куда прилетит заряд. Капсулы дают оружие, а детали — улучшения в мастерской.";
      showPanel(`<div class="eyebrow">ПОТЕРЯ СВЯЗИ · ЗОНА ${game.zone} ИЗ ${ZONES.length}</div>
        <h2 id="panel-title">«Стриж» сбит</h2>
        <p class="result-score">◆ ${game.score}</p>${facts()}
        <p class="tip">${tip}</p>
        <button class="primary" data-action="again">Ещё раз с этой зоны</button>
        <p class="note">Модули останутся, стражи станут слабее, счёт −25%.</p>
        <div class="pair"><button class="choice" data-action="retry">Новый рейд</button><button class="choice" data-action="dock">В меню</button></div>`);
    }
  }
}

function facts() {
  const minutes = Math.floor(game.time / 60);
  const seconds = String(Math.floor(game.time % 60)).padStart(2, "0");
  return `<div class="facts"><span><b>${game.destroyed}</b> сбито</span><span><b>${game.collected}</b> кристаллов</span><span><b>${game.bestCombo}</b> подряд</span><span><b>${minutes}:${seconds}</b> в полёте</span></div>`;
}
// Конфетти поверх панели победы
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div");
  box.className = "confetti";
  box.setAttribute("aria-hidden", "true");
  const colors = ["#ffd76a", "#7fe9ff", "#ff7ab8", "#9dff8a", "#ffffff", "#ff9a2e"];
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement("i");
    bit.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.9).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.6).toFixed(2)}s;--spin:${Math.round(Math.random() * 900 - 450)}deg;--drift:${Math.round(Math.random() * 120 - 60)}px`;
    box.append(bit);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 4600);
}
// Кнопка «детали ×2 за ролик» — только в VK-версии (там эту функцию подменяют)
let rewardOffer = () => "";

id("panel-body").addEventListener("click", event => {
  // палец, который вёл истребитель и отпустился уже над панелью, ничего не выбирает
  if (event.detail !== 0 && !pressedPanel) return;
  pressedPanel = false;
  const button = event.target.closest("[data-action]");
  const action = button?.dataset.action;
  if (action === "resume") resume();
  else if (action === "retry") start();
  else if (action === "again") again();
  else if (action === "dock") dock();
  else if (action === "module") {
    Sound.unlock();
    game.upgrade(button.dataset.kind);
    Sound.module();
  } else more(action, button);
});

// ---------- Приборы ----------
const zoneLabel = id("zone"), score = id("score"), hp = id("hp"), hullFill = id("hull-fill");
const rocket = id("rocket"), rocketLabel = id("rocket-label");
const bossBar = id("boss"), bossFill = id("boss-fill"), bossName = id("boss-name");
const lesson = id("lesson"), combo = id("combo"), mods = id("mods");
const taskBox = id("task"), taskLabel = id("task-label"), taskCount = id("task-n");
const powerBox = id("power"), powerName = id("power-name"), powerFill = id("power-fill");
let lowAlarm = 0;
let lastGain = 0;

function paintHud(dt) {
  if (game.mode === "menu") return;
  const p = game.player;
  text(zoneLabel, game.endless ? "∞ " + game.wave : game.zone + " / " + ZONES.length);
  if (text(score, game.score)) {
    score.classList.remove("bump");
    void score.offsetWidth;
    score.classList.add("bump");
  }
  // задание зоны и оружие из капсулы
  const task = game.task;
  taskBox.hidden = !task || game.mode === "upgrade";
  if (task) {
    text(taskLabel, TASK_SHORT[task.kind]);
    text(taskCount, task.done ? "✓" : task.failed ? "✗" : `${Math.min(task.have, task.goal)}/${task.goal}`);
    taskBox.className = task.done ? "done" : task.failed ? "failed" : "";
  }
  const weapon = p.weapon || (p.shield > 0 ? "shield" : null);
  powerBox.hidden = !weapon || !active();
  if (weapon) {
    powerBox.dataset.kind = weapon;
    text(powerName, weapon === "shield" ? `ЩИТ ${"●".repeat(p.shield)}` : WEAPON_INFO[weapon][0]);
    ratio(powerFill, weapon === "shield" ? 1 : p.weaponLeft / p.weaponTime);
  }
  text(hp, Math.ceil(p.health));
  ratio(hullFill, p.health / p.maxHealth);
  const low = p.health < p.maxHealth * 0.34;
  hullFill.closest(".hull").classList.toggle("low", low);
  rocket.disabled = game.mode !== "play" || p.cooldown > 0;
  text(rocketLabel, p.cooldown > 0 ? Math.ceil(p.cooldown) + " с" : "РАКЕТЫ");
  combo.hidden = game.combo < 2 || !active();
  if (game.combo >= 2) text(combo, "серия ×" + game.multiplier().toFixed(1));
  mods.hidden = game.modules.length === 0;
  text(mods, game.modules.map(kind => MODULE_INFO[kind][0]).join(" "));
  const master = game.enemies.find(enemy => enemy.kind === "boss" && enemy.state !== "in") || game.enemies.find(enemy => enemy.kind === "cruiser" && enemy.state === "hover");
  bossBar.hidden = !master;
  if (master) {
    text(bossName, master.kind === "cruiser" ? "КРЕЙСЕР" : ZONES[game.zone - 1].boss.toUpperCase());
    ratio(bossFill, master.health / master.maxHealth);
  }
  if (game.mode === "play") Sound.mood(master || low ? 2 : 1);
  if (low && game.mode === "play") {
    lowAlarm -= dt;
    if (lowAlarm <= 0) {
      lowAlarm = 1.1;
      Sound.alarm();
    }
  }
  // две подсказки: как лететь и зачем ракеты
  const teachMove = !hasMoved && game.zone === 1 && game.zoneTime < 7;
  const teachRockets = !usedRockets && game.zone === 1 && p.cooldown === 0 && game.enemies.filter(e => e.z > -80).length >= 3;
  lesson.hidden = game.mode !== "play" || !(teachMove || teachRockets);
  if (teachMove) text(lesson, "Веди пальцем — «Стриж» летит за ним");
  else if (teachRockets) text(lesson, "РАКЕТЫ сами находят цели");
}

// первая встреча с препятствием — короткая подсказка
const ROCK_HINTS = { pillar: "Скалы — обходи!", arch: "Арка — ныряй под неё", ridge: "Гряда — перелети сверху", ring: "Пролети в кольцо" };
const ENEMY_HINTS = {
  shield: ["Щитоносец! Пробей щит ракетами", "или стреляй, когда он открылся"],
  sniper: ["Снайпер целится — уйди с линии!", "НОВЫЙ ВРАГ"],
  drone: ["Звено дронов — сбей всех!", "ЗА ВСЁ ЗВЕНО — КАПСУЛА"],
  carrier: ["Контейнер! Сбей его", "ВНУТРИ — КАПСУЛА С ОРУЖИЕМ"],
};
function hints() {
  for (const rock of game.rocks) {
    if (told.has(rock.kind) || rock.z < -120 || !ROCK_HINTS[rock.kind]) continue;
    told.add(rock.kind);
    announce(ROCK_HINTS[rock.kind]);
  }
  for (const enemy of game.enemies) {
    if (told.has(enemy.kind) || !ENEMY_HINTS[enemy.kind] || enemy.z < -110) continue;
    told.add(enemy.kind);
    const [message, above] = ENEMY_HINTS[enemy.kind];
    announce(message, above);
  }
}

let shotCount = 0;
function hear(e) {
  switch (e.type) {
    case "shot": if (shotCount++ % 2 === 0) Sound.laser(); break;
    case "impact": if (Math.random() < 0.4) Sound.hit(); break;
    case "burst": Sound.boom(e.kind === "boss" ? 2 : e.kind === "bomber" ? 1.5 : e.kind === "mine" || e.kind === "dart" ? 0.5 : 1); break;
    case "rocket": Sound.rocket(); break;
    case "rocket-hit": Sound.boom(1); break;
    case "hurt": Sound.hull(); break;
    case "crash": Sound.crash(); break;
    case "gem": Sound.pick(); break;
    case "repair": Sound.repair(); break;
    case "ring": Sound.ring(); break;
    case "zone": Sound.zone(); break;
    case "clear": Sound.clear(); break;
    case "boss-warning": Sound.boss(); break;
    case "hazard-warning": Sound.warn(); break;
    case "hazard-live": e.kind === "bolt" ? Sound.thunder() : e.kind === "geyser" ? Sound.geyser() : Sound.beam(); break;
    case "won": Sound.won(); break;
    case "lost": Sound.lost(); break;
    case "capsule": Sound.capsule(); break;
    case "weapon-off": Sound.tick(); break;
    case "chain": Sound.zap(); break;
    case "shield-hit": Sound.shield(); break;
    case "block": if (Math.random() < 0.5) Sound.block(); break;
    case "shield-break": Sound.boom(0.6); break;
    case "task": Sound.task(); break;
    case "task-failed": Sound.lost(); break;
    case "sniper-lock": Sound.lock(); break;
    case "cruiser": Sound.boss(); break;
    case "flock": Sound.clear(); break;
  }
}

const HAZARD_HINTS = { bolt: "Молния! Уйди с полосы", geyser: "Гейзер — уйди вбок или выше", beam: "Луч! Проскочи над ним или под ним", icicle: "Сосульки! Уйди вбок или вниз" };
let taskTimer = 0;
function narrate(e) {
  if (e.type === "zone") {
    announce(e.name, game.endless ? "ВОЛНА " + e.wave : "ЗОНА " + e.zone);
    // через пару секунд — задание зоны
    clearTimeout(taskTimer);
    taskTimer = setTimeout(() => game.mode === "play" && announce(e.task, "★ ЗАДАНИЕ ЗОНЫ"), 2300);
  } else if (e.type === "boss-warning") announce(e.name, "ХОЗЯИН ЗОНЫ", true);
  else if (e.type === "clear") {
    lastGain = bank(1);
    announce(!game.endless && game.zone === ZONES.length ? "Каньон свободен" : e.clean ? "Зона пройдена без пробоин! +300" : "Зона пройдена");
  } else if (e.type === "task") announce("Задание выполнено! +250", "★ " + e.text.toUpperCase());
  else if (e.type === "task-failed") announce("Задание не вышло", "★ " + game.task.text.toUpperCase(), true);
  else if (e.type === "capsule") announce(WEAPON_INFO[e.power][1], "КАПСУЛА");
  else if (e.type === "cruiser") announce("Крейсер!", "СБЕЙ — ВНУТРИ КАПСУЛА", true);
  else if (e.type === "cruiser-down") announce("Крейсер сбит!");
  else if (e.type === "flock") announce("Звено сбито! +200");
  else if (e.type === "hazard-warning" && !told.has(e.kind)) {
    told.add(e.kind);
    announce(HAZARD_HINTS[e.kind], "", true);
  }
}

function resize() {
  game.bounds = view.resize();
  const b = game.bounds;
  game.player.x = Math.max(-b.x, Math.min(b.x, game.player.x));
  game.player.y = Math.max(b.bottom, Math.min(b.top, game.player.y));
  clearInput();
}
window.addEventListener("resize", resize);
resize();

let last = 0;
let previous = "";
let accumulator = 0;
let rush = 1; // ускорение времени, только для проверок
const STEP = 1 / 60;

// Ручки для проверок из консоли и для роботов.
window.kanyon = {
  game, view, Sound,
  state: () => ({ mode: game.mode, level: game.level, zone: game.zone, wave: game.wave, endless: game.endless, score: game.score, health: game.player.health, enemies: game.enemies.length, offer: game.offer, time: game.zoneTime, task: game.task && { ...game.task }, stars: game.stars, weapon: game.player.weapon, shield: game.player.shield, parts, perks: { ...perks }, quality, look: view.quality }),
  jump(zone) {
    for (const list of [game.enemies, game.rocks, game.hazards, game.bolts, game.shots, game.rockets, game.gems]) list.length = 0;
    game.zone = Math.max(0, Math.min(ZONES.length - 1, zone - 1));
    game.nextZone();
  },
  // сразу к хозяину текущей зоны
  boss() {
    game.script.length = 0;
    game.planEnd = 0;
  },
  speed(k) { rush = Math.max(0.1, Math.min(8, k)); },
  // выдать оружие из капсулы (для проверок)
  give(kind) { game.giveWeapon(kind); },
  // пополнить детали (для проверок)
  parts(n) {
    parts = n;
    save();
    paintRecord();
  },
};

function frame(ms) {
  const raw = last ? ms - last : 16;
  const dt = Math.min(0.05, raw / 1000);
  last = ms;
  if (active()) {
    accumulator += dt * rush * view.timeScale(); // после победы над хозяином зоны — замедление
    const move = currentMove();
    while (accumulator >= STEP) {
      game.step(STEP, move);
      accumulator -= STEP;
    }
    hints();
  } else accumulator = 0;
  for (const e of game.events.splice(0)) {
    view.event(e, game);
    hear(e);
    narrate(e);
  }
  if (previous !== game.mode) {
    previous = game.mode;
    paintMode();
  }
  paintHud(dt);
  view.draw(game, game.mode === "paused" ? 0 : dt, document.hidden ? undefined : raw);
  requestAnimationFrame(frame);
}

id("start").disabled = false;
id("load").hidden = true;
requestAnimationFrame(frame);
