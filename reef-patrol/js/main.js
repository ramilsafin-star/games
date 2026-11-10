import { DEPTHS, Patrol } from "./rules.js?v=d76d4a47";
import { ReefView } from "./view.js?v=d76d4a47";

const id = name => document.getElementById(name);
const canvas = id("reef");
const game = new Patrol();
const view = new ReefView(canvas);
const recordKey = "reef-patrol-v1";

let saved = {};
try { saved = JSON.parse(localStorage.getItem(recordKey)) || {}; } catch {}
let best = Number.isSafeInteger(saved.best) && saved.best > 0 ? saved.best : 0;
let muted = saved.muted === true;
let audio = null;

function save() {
  try { localStorage.setItem(recordKey, JSON.stringify({ best, muted })); } catch {}
}

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

function announce(message) {
  const banner = id("announcement");
  banner.classList.remove("show");
  banner.textContent = message;
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
document.addEventListener("visibilitychange", () => {
  if (document.hidden && active()) pause();
});

function currentMove() {
  const pressed = [...keys].map(key => directions[key]);
  const x = Number(pressed.includes("right")) - Number(pressed.includes("left"));
  const z = Number(pressed.includes("down")) - Number(pressed.includes("up"));
  const length = Math.hypot(x, z) || 1;
  return { target: x || z ? null : target, x: x / length, z: z / length };
}

function launch() {
  wakeAudio();
  game.pulse();
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
  text(id("best"), "Рекорд экспедиции  ✦ " + best);
}
paintRecord();

function showPanel(markup) {
  id("panel-body").innerHTML = markup;
  id("panel").hidden = false;
  id("panel-body").querySelector("button").focus({ preventScroll: true });
}

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

function start() {
  clearInput();
  wakeAudio();
  hasMoved = false;
  view.reset();
  game.start();
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
    showPanel('<div class="eyebrow">РИФ 07</div><h2 id="panel-title">Пауза</h2><p>Субмарина ждёт команды.</p><button class="primary" data-action="resume">Продолжить</button>');
  } else if (mode === "upgrade") {
    clearInput();
    showPanel('<div class="eyebrow">ПОЛОВИНА МАРШРУТА</div><h2 id="panel-title">Улучши субмарину</h2><p>Выбери один модуль для глубоководного участка.</p><div class="choices"><button class="choice" data-action="rapid"><b>⚡ Быстрый лазер</b><small>На 35% больше выстрелов</small></button><button class="choice" data-action="armor"><b>🛡 Крепкий корпус</b><small>+35 к прочности и ремонт</small></button></div>');
  } else if (mode === "won" || mode === "lost") {
    clearInput();
    const win = mode === "won";
    if (game.score > best) { best = game.score; save(); }
    paintRecord();
    showPanel(`<div class="eyebrow">${win ? "ЭКСПЕДИЦИЯ ЗАВЕРШЕНА" : "СИГНАЛ ИЗ ДОКА"}</div>
      <h2 id="panel-title">${win ? "Жемчужина спасена!" : "Субмарина повреждена"}</h2>
      <p class="result-score">✦ ${game.score}</p>
      <p>${win ? "Кракен-9 обезврежен. Риф снова свободен." : "Подбирай жемчужины для ремонта и используй импульс против залпов."}</p>
      <button class="primary" data-action="retry">Новый рейс</button>
      <button class="choice" data-action="dock">В док</button>`);
  }
}

id("panel-body").addEventListener("click", event => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "resume") resume();
  else if (action === "retry") start();
  else if (action === "dock") dock();
  else if (action === "rapid" || action === "armor") {
    wakeAudio();
    game.upgrade(action);
  }
});

const wave = id("wave"), score = id("score"), hp = id("hp");
const pulse = id("pulse"), pulseLabel = id("pulse-label");
const boss = id("boss"), bossFill = id("boss-fill"), healthFill = id("health-fill");
const lesson = id("lesson");

function paintHud() {
  if (game.mode === "menu") return;
  const p = game.player;
  text(wave, game.wave + " / " + DEPTHS.length);
  text(score, game.score);
  text(hp, Math.ceil(p.health));
  ratio(healthFill, p.health / p.maxHealth);
  healthFill.closest(".health").classList.toggle("low", p.health < p.maxHealth * 0.36);
  pulse.disabled = game.mode !== "play" || p.cooldown > 0;
  text(pulseLabel, p.cooldown > 0 ? Math.ceil(p.cooldown) + " с" : "ИМПУЛЬС");
  const flagship = game.enemies.find(enemy => enemy.kind === "boss");
  boss.hidden = !flagship;
  if (flagship) ratio(bossFill, Math.max(0, flagship.health / flagship.maxHealth));
  lesson.hidden = hasMoved || game.wave !== 1 || game.time > 6 || game.mode !== "play";
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
const STEP = 1 / 60;

function frame(ms) {
  const dt = last ? Math.min(0.05, (ms - last) / 1000) : 0;
  last = ms;
  if (active()) {
    accumulator += dt;
    const move = currentMove();
    while (accumulator >= STEP) {
      game.step(STEP, move);
      accumulator -= STEP;
    }
  } else accumulator = 0;
  for (const e of game.events.splice(0)) {
    view.event(e);
    playEvent(e);
    if (e.type === "wave") announce(e.name);
    if (e.type === "beam-warning") announce("Уйди с линии луча!");
    if (e.type === "clear") announce(game.wave === DEPTHS.length ? "Жемчужина освобождена" : "Волна отбита");
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
