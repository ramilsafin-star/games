import { DEPTHS, Patrol } from "./rules.js?v=7eccd9cb";
import { ReefView } from "./view.js?v=7eccd9cb";

const id = name => document.getElementById(name);
const canvas = id("reef");
const game = new Patrol();
const view = new ReefView(canvas);
const recordKey = "reef-patrol-v1";
await window.vkGameHost?.ready;

let saved = {};
try { saved = JSON.parse(localStorage.getItem(recordKey)) || {}; } catch {}
let best = Number.isSafeInteger(saved.best) && saved.best > 0 ? saved.best : 0;
let deep = Number.isSafeInteger(saved.deep) && saved.deep > 0 ? Math.min(saved.deep, DEPTHS.length + 1) : 0; // DEPTHS.length + 1 — рейс пройден
let muted = saved.muted === true;
let audio = null;

function save() {
  try { localStorage.setItem(recordKey, JSON.stringify({ best, deep, muted })); } catch {}
}

// Модули дока: значок, название, что даёт
const MODULE_INFO = {
  rapid: ["⚡", "Быстрый лазер", "На 30% больше выстрелов"],
  armor: ["🛡", "Крепкий корпус", "+35 к прочности и ремонт"],
  twin: ["✴", "Ещё один ствол", "Залп шире и заметно сильнее"],
  magnet: ["🧲", "Магнит", "Жемчуг летит сам и чинит лучше"],
  pulse: ["🌊", "Мощный импульс", "Заряжается быстрее, бьёт сильнее"],
  engine: ["🚀", "Турбина", "Лодка плывёт быстрее"],
};
const BOSS_NAMES = { boss: "КРАКЕН-9", titan: "КЛЕШНЯ-ВЕЛИКАН" };

function wakeAudio() {
  if (muted) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ||= new Audio();
    if (audio.state !== "running") audio.resume().catch(() => {});
  } catch {}
}

function tone(frequency, endFrequency, duration, volume, delay = 0, type = "sine") {
  if (muted || audio?.state !== "running") return;
  const time = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, time);
  osc.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + 0.009);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

function playEvent(e) {
  switch (e.type) {
    case "shot": tone(820, 260, 0.10, 0.025, 0, "triangle"); break;
    case "enemy-shot": tone(178, 96, 0.16, 0.033, 0, "triangle"); break;
    case "impact": tone(510, 270, 0.09, 0.034); break;
    case "burst": tone(145, 42, 0.37, 0.095, 0, "triangle"); break;
    case "pulse":
      tone(108, 56, 0.48, 0.16, 0, "triangle");
      tone(470, 158, 0.45, 0.06, 0.03);
      break;
    case "beam-warning":
      tone(285, 620, 0.32, 0.09, 0, "triangle");
      tone(356, 740, 0.25, 0.073, 0.39, "triangle");
      break;
    case "beam-fire": tone(260, 70, 0.36, 0.14, 0, "sawtooth"); break;
    case "hurt": tone(178, 70, 0.24, 0.11, 0, "triangle"); break;
    case "swell": tone(190, 420, 0.5, 0.05, 0, "triangle"); break;
    case "pop":
      tone(240, 60, 0.3, 0.11, 0, "triangle");
      tone(900, 300, 0.12, 0.04);
      break;
    case "lane-warning":
      tone(520, 780, 0.14, 0.06, 0, "square");
      tone(520, 780, 0.14, 0.06, 0.2, "square");
      break;
    case "dash": tone(700, 120, 0.4, 0.09, 0, "sawtooth"); break;
    case "pearl":
      tone(660, 845, 0.18, 0.06);
      tone(990, 1270, 0.22, 0.052, 0.095);
      break;
    case "wave": tone(392, 588, 0.30, 0.07); break;
    case "won": [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.42, 0.074, i * 0.13, "triangle")); break;
    case "lost": tone(220, 68, 0.64, 0.1, 0, "triangle"); break;
  }
}

function text(element, value) {
  value = String(value);
  if (element.textContent !== value) element.textContent = value;
}

function ratio(element, value) {
  const scaled = `scaleX(${value.toFixed(3)})`;
  if (element.style.transform !== scaled) element.style.transform = scaled;
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

const keys = new Set();
const directions = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
};
let finger = null;
let target = null;
let hasMoved = false;
let pausedFrom = null;

function active() {
  return game.mode === "play" || game.mode === "break";
}

function clearInput() {
  if (finger && canvas.hasPointerCapture(finger.id)) canvas.releasePointerCapture(finger.id);
  finger = target = null;
  keys.clear();
}

canvas.addEventListener("pointerdown", event => {
  if (!active() || finger || event.button !== 0) return;
  const position = view.pointAt(event.clientX, event.clientY);
  if (!position) return;
  wakeAudio();
  finger = { id: event.pointerId, x: game.player.x - position.x, z: game.player.z - position.z };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", event => {
  if (!finger || finger.id !== event.pointerId) return;
  const position = view.pointAt(event.clientX, event.clientY);
  if (!position) return;
  target = {
    x: Math.max(-game.bounds.x, Math.min(game.bounds.x, position.x + finger.x)),
    z: Math.max(game.bounds.far, Math.min(game.bounds.near, position.z + finger.z)),
  };
  hasMoved = true;
});
function lift(event) {
  if (finger?.id === event.pointerId) finger = target = null;
}
for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, lift);
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
  }
});
window.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", clearInput);
// Свёрнутая игра и игра под рекламным роликом стоит на паузе и молчит
function quiet() {
  pause();
  clearInput();
  audio?.suspend().catch(() => {});
}
function updateVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) quiet();
  // Дальше рейс и звук продолжатся по нажатию игрока («Продолжить»).
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
addEventListener("vk-ad", (e) => {
  if (e.detail.on) quiet();
  else if (!document.hidden && !window.vkGameHost?.hidden && !muted) audio?.resume().catch(() => {});
});
// Реклама VK между экранами: не чаще раза в 2 минуты и никогда сразу после запуска.
// Пока идёт ролик, нажатия и клавиши до игры не доходят (иначе нажатие включило бы звук).
let adBusy = false;
for (const type of ["pointerdown", "pointerup", "click", "keydown"]) {
  addEventListener(type, (e) => {
    if (!adBusy) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
}
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

function currentMove() {
  const pressed = [...keys].map(key => directions[key]);
  const x = Number(pressed.includes("right")) - Number(pressed.includes("left"));
  const z = Number(pressed.includes("down")) - Number(pressed.includes("up"));
  const length = Math.hypot(x, z) || 1;
  return { target: x || z ? null : target, x: x / length, z: z / length };
}

function launch() {
  wakeAudio();
  if (game.pulse()) usedPulse = true;
}
id("pulse").addEventListener("pointerdown", event => {
  if (event.pointerType === "touch") launch();
});
id("pulse").addEventListener("click", launch);

function paintSound() {
  id("sound").setAttribute("aria-pressed", String(!muted));
  id("sound").setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
}
id("sound").onclick = () => {
  muted = !muted;
  wakeAudio();
  paintSound();
  save();
  tone(523, 660, 0.13, 0.07);
};
paintSound();

function paintRecord() {
  id("best").hidden = best === 0;
  const reach = deep > DEPTHS.length ? "рейс пройден" : deep ? `глубина ${deep} из ${DEPTHS.length}` : "";
  text(id("best"), "Рекорд экспедиции  ✦ " + best + (reach ? "  ·  " + reach : ""));
}
paintRecord();

let pressedPanel = false; // нажатие началось на самой панели, а не на арене под ней
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
}

function resume() {
  if (game.mode !== "paused") return;
  wakeAudio();
  game.mode = pausedFrom;
  pausedFrom = null;
}
id("pause").onclick = pause;

let told = new Set(); // подсказки, которые в этом рейсе уже показаны
let usedPulse = false;

function start() {
  clearInput();
  wakeAudio();
  hasMoved = false;
  usedPulse = false;
  told = new Set();
  view.reset();
  game.start();
}

function again() {
  clearInput();
  wakeAudio();
  view.reset();
  game.retry();
}
id("start").onclick = start;

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

  if (mode === "paused") {
    showPanel('<div class="eyebrow">РИФ 07</div><h2 id="panel-title">Пауза</h2><p>Субмарина ждёт команды.</p><button class="primary" data-action="resume">Продолжить</button><div class="row solo"><button class="choice" data-action="dock">Главное меню</button></div>');
  } else if (mode === "upgrade") {
    clearInput();
    const cards = game.offer.map(kind => {
      const [icon, name, about] = MODULE_INFO[kind];
      const third = kind === "twin" && game.player.barrels === 2;
      return `<button class="choice" data-action="module" data-kind="${kind}"><i aria-hidden="true">${icon}</i><b>${third ? "Третий ствол" : name}</b><small>${about}</small></button>`;
    }).join("");
    showPanel(`<div class="eyebrow">ДОК-СТАНЦИЯ · ГЛУБИНА ${game.wave} ПРОЙДЕНА</div><h2 id="panel-title">Улучши субмарину</h2><p>Выбери один модуль. Впереди глубже и опаснее.</p><div class="choices three">${cards}</div><div class="row solo"><button class="choice" data-action="dock">Главное меню</button></div>`);
  } else if (mode === "won" || mode === "lost") {
    clearInput();
    const win = mode === "won";
    const reached = win ? DEPTHS.length + 1 : game.wave;
    if (game.score > best || reached > deep) {
      best = Math.max(best, game.score);
      deep = Math.max(deep, reached);
      save();
    }
    paintRecord();
    const minutes = Math.floor(game.time / 60);
    const seconds = String(Math.floor(game.time % 60)).padStart(2, "0");
    const facts = `<div class="facts"><span><b>${game.destroyed}</b> роботов</span><span><b>${game.collected}</b> жемчужин</span><span><b>${game.bestCombo}</b> подряд</span><span><b>${minutes}:${seconds}</b> в рейсе</span></div>`;
    if (win) {
      showPanel(`<div class="eyebrow">ЭКСПЕДИЦИЯ ЗАВЕРШЕНА</div>
        <h2 id="panel-title">Жемчужина спасена!</h2>
        <p class="result-score">✦ ${game.score}</p>${facts}
        <p>Кракен-9 обезврежен. Риф снова свободен${game.retries ? "" : " — и ни одной потерянной лодки"}.</p>
        <button class="primary" data-action="retry">Новый рейс</button>
        <div class="row solo"><button class="choice" data-action="dock">В док</button></div>`);
    } else {
      const tip = game.enemies.some(enemy => enemy.kind === "boss") ? "Луч Кракена бьёт по прямой: увидел розовую полосу — сразу в сторону."
        : game.enemies.some(enemy => enemy.kind === "titan") ? "Великан бросается по светлой полосе. Уйди вбок и стреляй, пока он пятится."
        : "Подбирай жемчужины для ремонта, а импульс береги для залпов и толпы.";
      showPanel(`<div class="eyebrow">СИГНАЛ ИЗ ДОКА · ГЛУБИНА ${game.wave} ИЗ ${DEPTHS.length}</div>
        <h2 id="panel-title">Субмарина повреждена</h2>
        <p class="result-score">✦ ${game.score}</p>${facts}
        <p>${tip}</p>
        <button class="primary" data-action="again">Ещё раз с этой глубины</button>
        <p class="note">Модули останутся, роботы здесь станут слабее, счёт уменьшится на четверть.</p>
        <div class="row"><button class="choice" data-action="retry">Новый рейс</button><button class="choice" data-action="dock">В док</button></div>`);
    }
  }
}

id("panel-body").addEventListener("click", async event => {
  if (adBusy) return;
  // палец, который вёл лодку и отпустился уже над панелью, ничего не выбирает
  if (event.detail !== 0 && !pressedPanel) return;
  pressedPanel = false;
  const button = event.target.closest("[data-action]");
  const action = button?.dataset.action;
  // Реклама — после выбора модуля (переход на следующую глубину) и перед новым рейсом или повтором глубины
  if ((action === "module" || action === "retry" || action === "again") && !(await adBreak())) return;
  if (action === "resume") resume();
  else if (action === "retry") start();
  else if (action === "again") again();
  else if (action === "dock") dock();
  else if (action === "module") {
    wakeAudio();
    game.upgrade(button.dataset.kind);
    tone(523, 784, 0.2, 0.07);
    tone(784, 1046, 0.25, 0.06, 0.12);
  }
});

const wave = id("wave"), score = id("score"), hp = id("hp");
const pulse = id("pulse"), pulseLabel = id("pulse-label");
const boss = id("boss"), bossFill = id("boss-fill"), healthFill = id("health-fill");
const lesson = id("lesson");
const combo = id("combo"), mods = id("mods"), bossName = id("boss-name");

function paintHud() {
  if (game.mode === "menu") return;
  const p = game.player;
  text(wave, game.wave + " / " + DEPTHS.length);
  text(score, game.score);
  combo.hidden = game.combo < 2 || !active();
  if (game.combo >= 2) text(combo, "серия ×" + game.multiplier().toFixed(1));
  mods.hidden = game.modules.length === 0;
  text(mods, game.modules.map(kind => MODULE_INFO[kind][0]).join(" "));
  text(hp, Math.ceil(p.health));
  ratio(healthFill, p.health / p.maxHealth);
  healthFill.closest(".health").classList.toggle("low", p.health < p.maxHealth * 0.36);
  pulse.disabled = game.mode !== "play" || p.cooldown > 0;
  text(pulseLabel, p.cooldown > 0 ? Math.ceil(p.cooldown) + " с" : "ИМПУЛЬС");
  const flagship = game.enemies.find(enemy => BOSS_NAMES[enemy.kind]);
  boss.hidden = !flagship;
  if (flagship) {
    text(bossName, BOSS_NAMES[flagship.kind]);
    boss.dataset.kind = flagship.kind;
    ratio(bossFill, Math.max(0, flagship.health / flagship.maxHealth));
  }
  // две подсказки: как плыть (первая глубина) и зачем импульс (вторая, пока им не пользовались)
  const teachMove = !hasMoved && game.wave === 1 && game.time < 6;
  const teachPulse = !usedPulse && game.wave === 2 && p.cooldown === 0 && game.shots.some(shot => !shot.friendly);
  lesson.hidden = game.mode !== "play" || !(teachMove || teachPulse);
  if (teachMove) text(lesson, "Проведи пальцем, чтобы плыть");
  else if (teachPulse) text(lesson, "ИМПУЛЬС сбивает заряды и роботов рядом");
}

function resize() {
  game.bounds = view.resize();
  game.player.x = Math.max(-game.bounds.x, Math.min(game.bounds.x, game.player.x));
  clearInput();
}
window.addEventListener("resize", resize);
resize();

let last = 0;
let previous = "";
let accumulator = 0;
let rush = 1; // ускорение времени, только для проверок
const STEP = 1 / 60;

// Ручки для проверок из консоли и для роботов: состояние, прыжок на глубину, ускорение времени.
window.reefPatrol = {
  game,
  view,
  state: () => ({ mode: game.mode, wave: game.wave, score: game.score, health: game.player.health, enemies: game.enemies.length, offer: game.offer }),
  jump(depth) {
    game.enemies.length = game.shots.length = game.pearls.length = game.queue.length = 0;
    game.beam = null;
    game.wave = Math.max(0, Math.min(DEPTHS.length - 1, depth - 1));
    game.nextWave();
  },
  speed(k) { rush = Math.max(0.1, Math.min(8, k)); },
};

function frame(ms) {
  const dt = last ? Math.min(0.05, (ms - last) / 1000) : 0;
  last = ms;
  if (active()) {
    accumulator += dt * rush;
    const move = currentMove();
    while (accumulator >= STEP) {
      game.step(STEP, move);
      accumulator -= STEP;
    }
  } else accumulator = 0;
  for (const e of game.events.splice(0)) {
    view.event(e);
    playEvent(e);
    if (e.type === "wave") announce(e.name, "ГЛУБИНА " + e.wave);
    else if (e.type === "beam-warning") announce("Уйди с линии луча!");
    else if (e.type === "clear") announce(game.wave === DEPTHS.length ? "Жемчужина освобождена" : "Глубина пройдена");
    else if (e.type === "swell" && !told.has("swell")) {
      told.add("swell");
      announce("Ёж раздувается — отплыви!");
    } else if (e.type === "lane-warning" && !told.has(e.row ? "eel" : "titan")) {
      told.add(e.row ? "eel" : "titan");
      announce(e.row ? "Угорь! Уйди с полосы" : "Великан бросается — в сторону!");
    }
  }
  if (previous !== game.mode) {
    previous = game.mode;
    paintMode();
  }
  paintHud();
  view.draw(game, game.mode === "paused" ? 0 : dt);
  requestAnimationFrame(frame);
}

id("start").disabled = false;
id("load").hidden = true;
requestAnimationFrame(frame);
