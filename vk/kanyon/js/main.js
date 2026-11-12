// «Грозовой каньон»: управление, приборы, панели, звук и главный цикл.
import { LEVELS, ZONES, Raid } from "./rules.js?v=7aee9fb1";
import { CanyonView } from "./view.js?v=7aee9fb1";
import { Sound } from "./sound.js?v=7aee9fb1";
import { readStorage, writeStorage } from "./kit.js?v=7aee9fb1";

const id = name => document.getElementById(name);
const canvas = id("stage");
const game = new Raid();
const view = new CanyonView(canvas);
const SAVE = "kanyon-v1";

let saved = {};
try { saved = JSON.parse(readStorage(SAVE)) || {}; } catch {}
let best = Number.isSafeInteger(saved.best) && saved.best > 0 ? saved.best : 0;
let deep = Number.isSafeInteger(saved.deep) && saved.deep > 0 ? Math.min(saved.deep, ZONES.length + 1) : 0; // ZONES.length + 1 — рейд пройден
let level = LEVELS[saved.level] ? saved.level : "normal";
const save = () => writeStorage(SAVE, JSON.stringify({ best, deep, level }));

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
  if (element.textContent !== value) element.textContent = value;
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
function quiet() {
  if (active()) pause();
  Sound.hush();
}
function updateVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) quiet();
  // Дальше полёт и звук продолжатся по нажатию игрока («Продолжить»).
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
// Во время рекламного ролика игра молчит, после него звук возвращается
addEventListener("vk-ad", (e) => {
  if (e.detail.on) quiet();
  else if (!document.hidden && !window.vkGameHost?.hidden && game.mode !== "paused") Sound.unlock();
});
// Реклама VK между зонами: не чаще раза в 2 минуты и никогда сразу после запуска
let adBusy = false;
async function adBreak() {
  if (adBusy) return false;
  adBusy = true;
  await window.vkGameHost?.interstitial();
  adBusy = false;
  return true;
}

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
  if (adBusy) return;
  Sound.toggle();
  paintSound();
  Sound.tick();
};
paintSound();

function paintRecord() {
  id("best").hidden = best === 0;
  const reach = deep > ZONES.length ? "рейд пройден" : deep ? `зона ${deep} из ${ZONES.length}` : "";
  text(id("best"), "Рекорд рейда  ◆ " + best + (reach ? "  ·  " + reach : ""));
}
paintRecord();

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
  view.reset();
  game.start(level);
}
id("start").onclick = start;

function again() {
  clearInput();
  Sound.unlock();
  view.reset();
  game.retry();
}

function dock() {
  clearInput();
  view.reset();
  game.reset();
}

function paintMode() {
  const mode = game.mode;
  document.body.dataset.mode = mode;
  id("intro").hidden = mode !== "menu";
  id("controls").hidden = mode === "menu";
  id("mission").hidden = mode === "menu";
  id("pause").hidden = !active();
  id("panel").hidden = true;
  Sound.mood(mode === "menu" ? 0 : 1);

  if (mode === "paused") {
    showPanel('<div class="eyebrow">РЕЙД «СТРИЖА»</div><h2 id="panel-title">Пауза</h2><p>Двигатели на холостом ходу.</p><button class="primary" data-action="resume">Продолжить</button><div class="pair solo"><button class="choice" data-action="dock">В меню</button></div>');
  } else if (mode === "upgrade") {
    clearInput();
    const cards = game.offer.map(kind => {
      const [icon, name, about] = MODULE_INFO[kind];
      return `<button class="choice" data-action="module" data-kind="${kind}"><i aria-hidden="true">${icon}</i><b>${name}</b><small>${about}</small></button>`;
    }).join("");
    showPanel(`<div class="eyebrow">АНГАР · ЗОНА ${game.zone} ПРОЙДЕНА</div><h2 id="panel-title">Усиль «Стрижа»</h2><p>Выбери один модуль. Дальше — ${ZONES[game.zone].name.toLowerCase()}.</p><div class="choices">${cards}</div><div class="pair solo"><button class="choice" data-action="dock">В меню</button></div>`);
  } else if (mode === "won" || mode === "lost") {
    clearInput();
    const win = mode === "won";
    const reached = win ? ZONES.length + 1 : game.zone;
    if (game.score > best || reached > deep) {
      best = Math.max(best, game.score);
      deep = Math.max(deep, reached);
      save();
    }
    paintRecord();
    const minutes = Math.floor(game.time / 60);
    const seconds = String(Math.floor(game.time % 60)).padStart(2, "0");
    const facts = `<div class="facts"><span><b>${game.destroyed}</b> сбито</span><span><b>${game.collected}</b> кристаллов</span><span><b>${game.bestCombo}</b> подряд</span><span><b>${minutes}:${seconds}</b> в рейде</span></div>`;
    if (win) {
      showPanel(`<div class="eyebrow">РЕЙД ЗАВЕРШЁН · ${LEVELS[game.level].name.toUpperCase()}</div>
        <h2 id="panel-title">Цитадель пала!</h2>
        <p class="result-score">◆ ${game.score}</p>${facts}
        <p>«Стриж» прошёл весь каньон${game.retries ? "" : " — и ни разу не был сбит"}.</p>
        <button class="primary" data-action="retry">Новый рейд</button>
        <div class="pair solo"><button class="choice" data-action="dock">В меню</button></div>`);
    } else {
      const bossAlive = game.enemies.some(enemy => enemy.kind === "boss");
      const tip = bossAlive ? "У хозяина зоны береги ракеты для залпа в упор и следи за метками на экране — туда прилетит заряд."
        : "Красные кольца показывают, куда прилетит заряд. Скалы обходи заранее, а кристаллы заряжают ракеты.";
      showPanel(`<div class="eyebrow">ПОТЕРЯ СВЯЗИ · ЗОНА ${game.zone} ИЗ ${ZONES.length}</div>
        <h2 id="panel-title">«Стриж» сбит</h2>
        <p class="result-score">◆ ${game.score}</p>${facts}
        <p>${tip}</p>
        <button class="primary" data-action="again">Ещё раз с этой зоны</button>
        <p class="note">Модули останутся, стражи здесь станут слабее, счёт уменьшится на четверть.</p>
        <div class="pair"><button class="choice" data-action="retry">Новый рейд</button><button class="choice" data-action="dock">В меню</button></div>`);
    }
  }
}

id("panel-body").addEventListener("click", async event => {
  if (adBusy) return; // во время ролика кнопки молчат
  // палец, который вёл истребитель и отпустился уже над панелью, ничего не выбирает
  if (event.detail !== 0 && !pressedPanel) return;
  pressedPanel = false;
  const button = event.target.closest("[data-action]");
  const action = button?.dataset.action;
  if (action === "resume") resume();
  else if (action === "dock") {
    // Ушёл в меню посреди рейда — набранные очки и зона всё равно идут в рекорд
    if (game.mode !== "won" && game.mode !== "lost" && (game.score > best || game.zone > deep)) {
      best = Math.max(best, game.score);
      deep = Math.max(deep, game.zone);
      save();
      paintRecord();
    }
    Sound.unlock();
    dock();
  } else if (action === "retry" || action === "again" || action === "module") {
    const mode = game.mode;
    Sound.unlock();
    if (action === "module") Sound.module();
    await adBreak();
    if (game.mode !== mode) return;
    if (action === "retry") start();
    else if (action === "again") again();
    else game.upgrade(button.dataset.kind);
    updateVisibility(); // игру свернули во время ролика — полёт ждёт на паузе
  }
});

// ---------- Приборы ----------
const zoneLabel = id("zone"), score = id("score"), hp = id("hp"), hullFill = id("hull-fill");
const rocket = id("rocket"), rocketLabel = id("rocket-label");
const bossBar = id("boss"), bossFill = id("boss-fill"), bossName = id("boss-name");
const lesson = id("lesson"), combo = id("combo"), mods = id("mods");
let lowAlarm = 0;

function paintHud(dt) {
  if (game.mode === "menu") return;
  const p = game.player;
  text(zoneLabel, game.zone + " / " + ZONES.length);
  text(score, game.score);
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
  const master = game.enemies.find(enemy => enemy.kind === "boss" && enemy.state !== "in");
  bossBar.hidden = !master;
  if (master) {
    text(bossName, ZONES[game.zone - 1].boss.toUpperCase());
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
function hints() {
  for (const rock of game.rocks) {
    if (told.has(rock.kind) || rock.z < -120 || !ROCK_HINTS[rock.kind]) continue;
    told.add(rock.kind);
    announce(ROCK_HINTS[rock.kind]);
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
  }
}

const HAZARD_HINTS = { bolt: "Молния! Уйди с полосы", geyser: "Гейзер — уйди вбок или выше", beam: "Луч! Проскочи над ним или под ним" };
function narrate(e) {
  if (e.type === "zone") announce(e.name, "ЗОНА " + e.zone);
  else if (e.type === "boss-warning") announce(e.name, "ХОЗЯИН ЗОНЫ", true);
  else if (e.type === "clear") announce(game.zone === ZONES.length ? "Каньон свободен" : e.clean ? "Зона пройдена без пробоин! +300" : "Зона пройдена");
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
  state: () => ({ mode: game.mode, level: game.level, zone: game.zone, score: game.score, health: game.player.health, enemies: game.enemies.length, offer: game.offer, time: game.zoneTime }),
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
};

function frame(ms) {
  const raw = last ? ms - last : 16;
  const dt = Math.min(0.05, raw / 1000);
  last = ms;
  if (active()) {
    accumulator += dt * rush;
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
window.vkGameHost?.bannerWhen(() => !active());
requestAnimationFrame(frame);
