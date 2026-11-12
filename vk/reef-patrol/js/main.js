import { DEPTHS, MODULES, Patrol, RULES, dayCode, dailyRule } from "./rules.js?v=387c2c1e";
import { ReefView } from "./view.js?v=387c2c1e";

const id = name => document.getElementById(name);
const canvas = id("reef");
const game = new Patrol();
const view = new ReefView(canvas);
const recordKey = "reef-patrol-v1";
await window.vkGameHost?.ready;
// Качество графики — своё у каждого устройства, поэтому в отдельном ключе (в облако VK не уходит)
const qualityKey = "reef-patrol-quality";

// ---------- Сохранение ----------
// Ключ прежний: старые сохранения {best, deep, muted} читаются как есть, остальное получает значения по умолчанию.
// v2: sh — ракушки, ws — уровни мастерской, ms — задания, dl — «Рейс дня», ab — рекорд Бездны,
// ct — продолжение экспедиции с последнего дока {w: глубина, m: модули буквами, s: счёт}.
let saved = {};
try { saved = JSON.parse(localStorage.getItem(recordKey)) || {}; } catch {}
const whole = (value, max = 1e9) => Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : 0;
let best = whole(saved.best);
let deep = whole(saved.deep, DEPTHS.length + 1); // DEPTHS.length + 1 — экспедиция пройдена
let muted = saved.muted === true;
let shells = whole(saved.sh);
const SHOP = ["hull", "laser", "pulse", "magnet", "luck"];
const shop = Object.fromEntries(SHOP.map((key, i) => [key, Math.min(5, whole(Array.isArray(saved.ws) ? saved.ws[i] : 0))]));
let abyssBest = whole(saved.ab, 999);
const daily = { d: whole(saved.dl?.d), s: whole(saved.dl?.s, 999), b: whole(saved.dl?.b), bd: whole(saved.dl?.bd) };
const LETTER = { rapid: "r", armor: "a", twin: "t", magnet: "m", pulse: "p", engine: "e", torpedo: "o", bubble: "b" };
const FROM_LETTER = Object.fromEntries(Object.entries(LETTER).map(([k, v]) => [v, k]));
// p — сколько ракушек за счёт до этого дока уже начислено (чтобы продолжение не платило дважды)
let checkpoint = saved.ct && whole(saved.ct.w, DEPTHS.length) > 1 && typeof saved.ct.m === "string"
  ? { w: saved.ct.w, m: saved.ct.m.slice(0, 12), s: whole(saved.ct.s), p: whole(saved.ct.p) } : null;
let audio = null;

// ---------- Задания ----------
// Три задания одновременно. Выполнил — ракушки и следующее задание; каждый новый круг вдвое сложнее.
const MISSIONS = [
  { key: "crab", text: n => `Сбей ${n} крабов`, goal: 25, reward: 20 },
  { key: "pearl", text: n => `Собери ${n} жемчужин`, goal: 20, reward: 20 },
  { key: "chest", text: n => `Открой ${n} сундучка`, goal: 3, reward: 25 },
  { key: "depth", text: n => `Доберись до глубины ${n} в экспедиции`, goal: 6, reward: 40, max: true },
  { key: "puffer", text: n => `Сбей ${n} рыб-ежей, пока они не раздулись`, goal: 8, reward: 30 },
  { key: "power", text: n => `Подбери ${n} бонусов`, goal: 6, reward: 25 },
  { key: "clean", text: n => `Пройди ${n} глубины без пробоин`, goal: 3, reward: 30 },
  { key: "eel", text: n => `Сбей ${n} угрей`, goal: 6, reward: 30 },
  { key: "combo", text: n => `Сбей ${n} роботов подряд — серией`, goal: 8, reward: 35, max: true },
  { key: "pulse", text: n => `Задень импульсом ${n} роботов`, goal: 30, reward: 25 },
  { key: "star", text: n => `Сбей ${n} морские звезды`, goal: 4, reward: 35 },
  { key: "boss", text: n => `Победи ${n} боссов`, goal: 2, reward: 50 },
  { key: "ray", text: n => `Сбей ${n} скатов`, goal: 6, reward: 30 },
  { key: "daily", text: n => `Пройди «Рейс дня» ${n} раз`, goal: 1, reward: 40 },
  { key: "abyss", text: n => `Доберись до глубины ${n} в Бездне`, goal: 5, reward: 60, max: true },
  { key: "perfect", text: n => `Собери «Жемчужное течение» идеально ${n} раз`, goal: 1, reward: 40 },
];
function freshTask(n) {
  const round = Math.floor(n / MISSIONS.length);
  const m = MISSIONS[n % MISSIONS.length];
  return { k: n % MISSIONS.length, g: Math.round(m.goal * (1 + round)), r: Math.round(m.reward * (1 + round * 0.5)), p: 0 };
}
const tasks = { n: whole(saved.ms?.n, 1e6), a: [] };
if (Array.isArray(saved.ms?.a)) {
  for (const t of saved.ms.a.slice(0, 3)) {
    if (MISSIONS[t?.k] && whole(t.g)) tasks.a.push({ k: t.k, g: t.g, r: whole(t.r) || MISSIONS[t.k].reward, p: Math.min(whole(t.p), t.g) });
  }
}
while (tasks.a.length < 3) {
  let task = freshTask(tasks.n++);
  while (tasks.a.some(t => t.k === task.k)) task = freshTask(tasks.n++);
  tasks.a.push(task);
}

function save() {
  const data = {
    v: 2, best, deep, muted, sh: shells, ws: SHOP.map(key => shop[key]), ab: abyssBest,
    ms: tasks, dl: daily, ct: checkpoint || undefined,
  };
  try { localStorage.setItem(recordKey, JSON.stringify(data)); } catch {}
}

// Модули дока: значок, название, что даёт
const MODULE_INFO = {
  rapid: ["⚡", "Быстрый лазер", "На 30% больше выстрелов"],
  armor: ["🛡", "Крепкий корпус", "+35 к прочности и ремонт"],
  twin: ["✴", "Ещё один ствол", "Залп шире и заметно сильнее"],
  magnet: ["🧲", "Магнит", "Жемчуг летит сам и чинит лучше"],
  pulse: ["🌊", "Мощный импульс", "Заряжается быстрее, бьёт сильнее"],
  engine: ["🚀", "Турбина", "Лодка плывёт быстрее"],
  torpedo: ["🎯", "Торпеды", "Сами летят в роботов, чем больше — тем чаще"],
  bubble: ["🫧", "Пузырь-щит", "Принимает удар, надувается снова"],
};
// Бонусы из сундучков и роботов
const POWER_INFO = {
  spread: ["✦", "Тройной залп!"], bubble: ["◯", "Пузырь-щит!"], torpedo: ["➶", "Торпеды!"],
  freeze: ["❄", "Заморозка!"], repair: ["✚", "Ремонт +40"],
};
const SHOP_INFO = {
  hull: ["🛡", "Корпус", "+10 к прочности"],
  laser: ["⚡", "Лазер", "+6% к силе выстрела"],
  pulse: ["🌊", "Импульс", "Заряжается на 6% быстрее"],
  magnet: ["🧲", "Сачок", "Жемчуг издалека, ремонт сильнее"],
  luck: ["🍀", "Удача", "Бонусы из роботов чаще"],
};
const PRICE = [60, 120, 200, 320, 480];
const BOSS_NAMES = { boss: "КРАКЕН-9", titan: "КЛЕШНЯ-ВЕЛИКАН", turtle: "ЧЕРЕПАХА-КРЕПОСТЬ" };

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
const chord = (notes, gap, length, volume, type = "triangle") => notes.forEach((f, i) => tone(f, f, length, volume, i * gap, type));

function playEvent(e) {
  switch (e.type) {
    case "shot": tone(820, 260, 0.10, 0.025, 0, "triangle"); break;
    case "enemy-shot": tone(178, 96, 0.16, 0.033, 0, "triangle"); break;
    case "impact": tone(510, 270, 0.09, 0.034); break;
    case "deflect": tone(1600, 1900, 0.06, 0.03, 0, "square"); break;
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
    case "shell-warning": tone(300, 160, 0.4, 0.07, 0, "square"); break;
    case "shell": tone(140, 90, 0.5, 0.12, 0, "triangle"); break;
    case "unshell": tone(220, 440, 0.25, 0.07, 0, "triangle"); break;
    case "dash": tone(700, 120, 0.4, 0.09, 0, "sawtooth"); break;
    case "drop": tone(700, 1100, 0.08, 0.025); break;
    case "fizz": tone(1200, 600, 0.12, 0.025); break;
    case "pearl":
      tone(660, 845, 0.18, 0.06);
      tone(990, 1270, 0.22, 0.052, 0.095);
      break;
    case "capsule-drop": chord([784, 988], 0.07, 0.16, 0.05); break;
    case "power": chord([523, 659, 784, 1047, 1319], 0.055, 0.2, 0.06); break;
    case "bubble-pop": tone(900, 220, 0.25, 0.09); break;
    case "bubble-up": tone(500, 900, 0.18, 0.04); break;
    case "torpedo": tone(300, 900, 0.22, 0.04, 0, "sawtooth"); break;
    case "blast": tone(160, 50, 0.3, 0.08, 0, "triangle"); break;
    case "rain": chord([1047, 1319, 1568, 2093], 0.08, 0.25, 0.04, "sine"); break;
    case "drip": tone(1400, 1800, 0.08, 0.02); break;
    case "boss-down":
      tone(90, 30, 1.1, 0.16, 0, "triangle");
      chord([392, 494, 587, 784, 988], 0.11, 0.5, 0.07);
      break;
    case "wave": tone(392, 588, 0.30, 0.07); break;
    case "bonus": chord([523, 659, 784, 1047, 784, 1047, 1319], 0.08, 0.22, 0.05, "sine"); break;
    case "bonus-end": if (e.perfect) chord([784, 988, 1175, 1568], 0.1, 0.4, 0.07); break;
    case "won": [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.42, 0.074, i * 0.13, "triangle")); break;
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

// Короткое сообщение сверху: выполненное задание, рекорд
let toastTimer = 0;
const toastQueue = [];
function toast(message) {
  toastQueue.push(message);
  if (!toastTimer) nextToast();
}
function nextToast() {
  const box = id("toast");
  const message = toastQueue.shift();
  if (!message) {
    box.hidden = true;
    toastTimer = 0;
    return;
  }
  box.hidden = false;
  box.classList.remove("show");
  box.textContent = message;
  void box.offsetWidth;
  box.classList.add("show");
  toastTimer = setTimeout(nextToast, 2600);
}

// Всплывающие очки над сбитым роботом
const pops = [];
function popScore(x, z, value, big = false) {
  let el = pops.find(p => !p.busy);
  if (!el) {
    if (pops.length >= 16) return;
    el = { node: document.createElement("b"), busy: false };
    el.node.addEventListener("animationend", () => (el.busy = false, el.node.className = ""));
    id("pops").append(el.node);
    pops.push(el);
  }
  const at = view.screen(x, 1.9, z);
  el.busy = true;
  el.node.textContent = typeof value === "number" ? "+" + value : value;
  el.node.style.left = at.x + "px";
  el.node.style.top = at.y + "px";
  el.node.className = "";
  void el.node.offsetWidth;
  el.node.className = big ? "big" : "";
}

// Конфетти на победе, рекорде и после босса
const confetti = { parts: [], running: false, last: 0 };
function celebrate(count = 140) {
  if (view.reduced) return;
  const cv = id("confetti");
  const colors = ["#fff59a", "#ff9ecf", "#9df5d7", "#8fd0ff", "#ffb36b", "#d6ffe0"];
  for (let i = 0; i < count; i++) {
    confetti.parts.push({
      x: innerWidth * (0.15 + Math.random() * 0.7), y: innerHeight * (0.25 + Math.random() * 0.2),
      vx: (Math.random() - 0.5) * 520, vy: -260 - Math.random() * 420, r: 4 + Math.random() * 5,
      spin: (Math.random() - 0.5) * 12, a: Math.random() * 6, life: 2.2 + Math.random() * 1.2, c: colors[i % colors.length],
    });
  }
  if (confetti.running) return;
  confetti.running = true;
  confetti.last = performance.now();
  cv.width = innerWidth * Math.min(2, devicePixelRatio || 1);
  cv.height = innerHeight * Math.min(2, devicePixelRatio || 1);
  const ctx = cv.getContext("2d");
  const tick = now => {
    const dt = Math.min(0.05, (now - confetti.last) / 1000);
    confetti.last = now;
    const k = cv.width / innerWidth;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    confetti.parts = confetti.parts.filter(p => (p.life -= dt) > 0);
    for (const p of confetti.parts) {
      p.vy += 620 * dt;
      p.vx *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.spin * dt;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      ctx.restore();
    }
    if (confetti.parts.length) requestAnimationFrame(tick);
    else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      confetti.running = false;
    }
  };
  requestAnimationFrame(tick);
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

// ---------- Качество графики ----------
// «Авто»: на сильном устройстве — высокое, на слабом — среднее; если в рейсе меньше ~45 кадров в секунду,
// качество само снижается на ступень. Можно выбрать и вручную.
const QUALITY_NAME = { auto: "авто", high: "высокое", medium: "среднее", low: "низкое" };
let qualitySet = "auto";
try { qualitySet = QUALITY_NAME[localStorage.getItem(qualityKey)] ? localStorage.getItem(qualityKey) : "auto"; } catch {}
const weak = (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
let autoLevel = weak ? "medium" : "high";
const meter = { time: 0, frames: 0 };
function applyQuality() {
  view.setQuality(qualitySet === "auto" ? autoLevel : qualitySet);
  game.bounds = view.bounds;
  const label = "Графика: " + QUALITY_NAME[qualitySet] + (qualitySet === "auto" ? " (" + QUALITY_NAME[autoLevel] + ")" : "");
  text(id("quality"), label);
  for (const chip of document.querySelectorAll("[data-action=quality]")) text(chip, label);
}
function cycleQuality() {
  const order = ["auto", "high", "medium", "low"];
  qualitySet = order[(order.indexOf(qualitySet) + 1) % order.length];
  try { localStorage.setItem(qualityKey, qualitySet); } catch {}
  applyQuality();
}
id("quality").onclick = cycleQuality;
function watchFrames(raw) {
  if (qualitySet !== "auto" || !active() || raw <= 0 || raw > 0.25) return;
  meter.time += raw;
  meter.frames++;
  if (meter.time < 4) return;
  const fps = meter.frames / meter.time;
  meter.time = meter.frames = 0;
  if (fps < 45 && autoLevel !== "low") {
    autoLevel = autoLevel === "high" ? "medium" : "low";
    applyQuality();
  }
}

function paintRecord() {
  id("best").hidden = best === 0;
  const reach = deep > DEPTHS.length ? "экспедиция пройдена" : deep ? `глубина ${deep} из ${DEPTHS.length}` : "";
  text(id("best"), "Рекорд экспедиции  ✦ " + best + (reach ? "  ·  " + reach : "") + (abyssBest ? "  ·  Бездна " + abyssBest : ""));
  // кнопки режимов в меню
  const open = abyssUnlocked();
  id("open-abyss").classList.toggle("locked", !open);
  text(id("abyss-note"), open ? abyssBest ? "рекорд: глубина " + abyssBest : "без конца" : "🔒 после 4-й глубины");
  const today = dayCode();
  text(id("daily-note"), daily.d === today ? "✓ сегодня пройден" : daily.s && daily.d === yesterday() ? "🔥 серия " + daily.s : "новый каждый день");
  text(id("shells-note"), "🐚 " + shells);
  const ready = tasks.a.filter(t => t.p >= t.g).length;
  text(id("tasks-note"), tasks.a.map(t => Math.min(t.p, t.g) + "/" + t.g).join(" · "));
  id("open-tasks").classList.toggle("ready", ready > 0);
  const cont = id("continue");
  cont.hidden = !checkpoint;
  if (checkpoint) cont.innerHTML = `Продолжить <small>глубина ${checkpoint.w}</small>`;
}
const abyssUnlocked = () => deep >= 5;
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayCode(d);
}

let pressedPanel = false; // нажатие началось на самой панели, а не на арене под ней
function showPanel(markup) {
  pressedPanel = false;
  id("panel-body").innerHTML = markup;
  id("panel-body").classList.toggle("wide", markup.includes('class="shop"') || markup.includes('class="tasks"'));
  id("panel").hidden = false;
  id("panel-body").querySelector("button").focus({ preventScroll: true });
  // числа наград «подпрыгивают» и считаются от нуля
  for (const node of id("panel-body").querySelectorAll("[data-count]")) countUp(node, Number(node.dataset.count));
}
id("panel").addEventListener("pointerdown", () => (pressedPanel = true));
function countUp(node, value) {
  const start = performance.now();
  const prefix = node.dataset.prefix || "";
  const step = now => {
    const k = Math.min(1, (now - start) / 900);
    node.textContent = prefix + Math.round(value * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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

let told = new Set(); // подсказки, которые в этом рейсе уже показаны
let usedPulse = false;
let paid = 0; // сколько ракушек уже начислено за этот рейс
let rewarded = false; // ролик за награду на этом экране уже смотрели
let chanceUsed = false; // второй шанс в Бездне — один на рейс
let ownCheckpoint = false; // продолжение экспедиции принадлежит этому рейсу (создано им или он из него продолжен)

function perks() {
  return { ...shop };
}

function start(kind = "campaign") {
  clearInput();
  wakeAudio();
  hasMoved = false;
  usedPulse = false;
  told = new Set();
  paid = 0;
  chanceUsed = false;
  view.reset();
  game.perks = perks();
  game.start(kind, kind === "daily" ? dayCode() : 0);
  // старое продолжение не стирается: его заменит следующий док этого рейса (случайное «Погрузиться» не страшно)
  ownCheckpoint = false;
}

// Продолжение экспедиции с последнего дока
function proceed() {
  if (!checkpoint) return start();
  clearInput();
  wakeAudio();
  hasMoved = usedPulse = true;
  told = new Set();
  paid = Math.min(checkpoint.p, Math.floor(checkpoint.s / 300));
  chanceUsed = false;
  ownCheckpoint = true;
  view.reset();
  game.perks = perks();
  game.resume(checkpoint.w, [...checkpoint.m].map(letter => FROM_LETTER[letter]).filter(Boolean), checkpoint.s);
}

function again() {
  clearInput();
  wakeAudio();
  view.reset();
  game.retry();
}
id("start").onclick = () => start("campaign");
id("continue").onclick = proceed;

function dock() {
  // вышли в меню посреди рейса (с паузы или из дока) — ракушки за набранный счёт всё равно начисляются
  if (game.mode === "paused" || game.mode === "upgrade") {
    const earned = payout();
    save();
    if (earned) toast(`🐚 +${earned} за рейс`);
  }
  clearInput();
  view.reset();
  game.reset();
}

// ---------- Экраны меню: Бездна, «Рейс дня», мастерская, задания ----------
function abyssPanel() {
  const open = abyssUnlocked();
  showPanel(`<div class="eyebrow">РЕЖИМ БЕЗ КОНЦА</div><h2 id="panel-title">🌀 Бездна</h2>
    <p>Глубины собираются сами и с каждым разом всё темнее и опаснее. Каждая четвёртая — босс, док — раз в три глубины.
    Одна попытка: как глубоко ты нырнёшь?</p>
    <p class="result-score">${abyssBest ? "Рекорд: глубина " + abyssBest : "Рекорда пока нет"}</p>
    ${open ? '<button class="primary" data-action="go-abyss">Нырнуть в Бездну</button>' : '<p class="note">🔒 Откроется, когда в экспедиции победишь Клешню-великана (глубина 4).</p>'}
    <div class="row solo"><button class="choice" data-action="close">Назад</button></div>`);
}
function dailyPanel() {
  const today = dayCode();
  const rule = dailyRule(today);
  const done = daily.d === today;
  const streak = daily.d === today || daily.d === yesterday() ? daily.s : 0;
  const bestToday = daily.bd === today ? daily.b : 0;
  showPanel(`<div class="eyebrow">ОДИН ДЛЯ ВСЕХ · НОВЫЙ КАЖДЫЙ ДЕНЬ</div><h2 id="panel-title">📅 Рейс дня</h2>
    <p class="rule">${RULES[rule]}</p>
    <p>Шесть глубин, без повторов. Пройди рейс — получи <b>🐚 ${30 + 10 * Math.min(7, streak + (done ? 0 : 1))}</b> и продли серию дней.</p>
    <div class="facts three"><span><b>${streak}</b> дней подряд</span><span><b>${bestToday}</b> лучший счёт сегодня</span><span><b>${done ? "✓" : "—"}</b> пройден сегодня</span></div>
    <button class="primary" data-action="go-daily">${done ? "Сыграть ещё раз" : "Начать рейс дня"}</button>
    <div class="row solo"><button class="choice" data-action="close">Назад</button></div>`);
}
function shopPanel() {
  const rows = SHOP.map(key => {
    const [icon, name, about] = SHOP_INFO[key];
    const level = shop[key];
    const price = PRICE[level];
    const pips = "●".repeat(level) + "○".repeat(5 - level);
    const button = level >= 5 ? '<button class="buy" disabled>МАКС</button>'
      : `<button class="buy" data-action="buy" data-kind="${key}"${shells < price ? " disabled" : ""}>🐚 ${price}</button>`;
    return `<div class="shop-row"><i aria-hidden="true">${icon}</i><span><b>${name}</b> <em>${pips}</em><small>${about}</small></span>${button}</div>`;
  }).join("");
  showPanel(`<div class="eyebrow">ПОСТОЯННЫЕ УЛУЧШЕНИЯ</div><h2 id="panel-title">🛠 Мастерская</h2>
    <p>Ракушки дают рейсы и задания. Улучшения работают во всех режимах.</p>
    <p class="result-score">🐚 ${shells}</p>
    <div class="shop">${rows}</div>
    <div class="row solo"><button class="choice" data-action="close">Назад</button></div>`);
}
function tasksPanel() {
  const rows = tasks.a.map(t => {
    const m = MISSIONS[t.k];
    const share = Math.min(1, t.p / t.g);
    return `<div class="task"><span><b>${m.text(t.g)}</b><small>${Math.min(t.p, t.g)} из ${t.g}</small></span><em>🐚 ${t.r}</em>
      <div class="track"><i style="transform:scaleX(${share.toFixed(3)})"></i></div></div>`;
  }).join("");
  showPanel(`<div class="eyebrow">ЗАДАНИЯ ПАТРУЛЯ</div><h2 id="panel-title">🎯 Задания</h2>
    <p>Выполняй в любом режиме — награда приходит сразу, а на месте выполненного задания появляется новое.</p>
    <div class="tasks">${rows}</div>
    <div class="row solo"><button class="choice" data-action="close">Назад</button></div>`);
}
function closePanel() {
  id("panel").hidden = true;
  paintRecord();
  id("start").focus({ preventScroll: true });
}
id("open-abyss").onclick = abyssPanel;
id("open-daily").onclick = dailyPanel;
id("open-shop").onclick = shopPanel;
id("open-tasks").onclick = tasksPanel;

// Продвижение заданий по событиям рейса
function bump(key, amount = 1) {
  if (!amount) return;
  for (let i = 0; i < tasks.a.length; i++) {
    const t = tasks.a[i];
    const m = MISSIONS[t.k];
    if (m.key !== key || t.p >= t.g) continue;
    t.p = m.max ? Math.max(t.p, amount) : t.p + amount;
    if (t.p >= t.g) {
      shells += t.r;
      toast(`🎯 Задание выполнено: ${m.text(t.g)}  +🐚 ${t.r}`);
      tone(784, 1046, 0.2, 0.06, 0.05);
      tone(1046, 1568, 0.3, 0.05, 0.18);
      let next = freshTask(tasks.n++);
      while (tasks.a.some((other, j) => j !== i && other.k === next.k)) next = freshTask(tasks.n++);
      tasks.a[i] = next;
      save();
    }
  }
}

// Ракушки за счёт рейса: одна за каждые 300 очков; при повторе глубины начисленное не забирается и не удваивается
function payout() {
  const earned = Math.max(0, Math.floor(game.score / 300) - paid);
  paid += earned;
  shells += earned;
  // счёт до последнего дока теперь оплачен
  if (checkpoint && ownCheckpoint && game.kind === "campaign") checkpoint.p = Math.min(paid, Math.floor(checkpoint.s / 300));
  return earned;
}

// Ролик за награду (только в VK; вне VK кнопок нет)
const canReward = () => !!window.vkGameHost?.inVk;
async function watchReward(grant) {
  if (rewarded || !canReward()) return;
  rewarded = true;
  const shown = await window.vkGameHost.rewarded().catch(() => false);
  if (shown) grant();
  else {
    rewarded = false;
    toast("Ролик сейчас недоступен — попробуй позже");
  }
}

function paintMode() {
  const mode = game.mode;
  document.body.dataset.mode = mode;
  id("intro").hidden = mode !== "menu";
  id("controls").hidden = mode === "menu";
  id("mission").hidden = mode === "menu";
  id("pause").hidden = !active();
  id("panel").hidden = true;

  if (mode === "menu") paintRecord();
  if (mode === "paused") {
    showPanel('<div class="eyebrow">РИФ 07</div><h2 id="panel-title">Пауза</h2><p>Субмарина ждёт команды.</p><button class="primary" data-action="resume">Продолжить</button><div class="row"><button class="choice" data-action="quality"></button><button class="choice" data-action="dock">Главное меню</button></div>');
    applyQuality();
  } else if (mode === "upgrade") {
    clearInput();
    const cards = game.offer.map((kind, i) => {
      const [icon, name, about] = MODULE_INFO[kind];
      const third = kind === "twin" && game.player.barrels === 2;
      return `<button class="choice deal" style="--i:${i}" data-action="module" data-kind="${kind}"><i aria-hidden="true">${icon}</i><b>${third ? "Третий ствол" : name}</b><small>${about}</small></button>`;
    }).join("");
    const next = game.kind === "campaign" ? DEPTHS[game.wave] : null;
    const ahead = next?.boss ? ` Впереди босс — ${BOSS_NAMES[next.boss].toLowerCase()}!` : " Впереди глубже и опаснее.";
    showPanel(`<div class="eyebrow">ДОК-СТАНЦИЯ · ГЛУБИНА ${game.wave} ПРОЙДЕНА</div><h2 id="panel-title">Улучши субмарину</h2><p>Выбери один модуль.${ahead}</p><div class="choices three">${cards}</div><div class="row solo"><button class="choice" data-action="dock">Главное меню</button></div>`);
  } else if (mode === "won" || mode === "lost") {
    clearInput();
    const win = mode === "won";
    const kind = game.kind;
    let record = false;
    let bonus = 0;
    if (kind === "campaign") {
      const reached = win ? DEPTHS.length + 1 : game.wave;
      if (game.score > best || reached > deep) {
        record = game.score > best && best > 0;
        best = Math.max(best, game.score);
        deep = Math.max(deep, reached);
      }
      if (win && ownCheckpoint) checkpoint = null;
    } else if (kind === "abyss") {
      const reached = game.wave - (win ? 0 : 1);
      if (reached > abyssBest) {
        record = abyssBest > 0;
        abyssBest = reached;
      }
      bump("abyss", reached);
    } else if (kind === "daily") {
      const today = dayCode();
      if (daily.bd !== today) daily.b = 0, daily.bd = today;
      if (game.score > daily.b) daily.b = game.score;
      if (win) {
        bump("daily");
        if (daily.d !== today) {
          daily.s = daily.d === yesterday() ? daily.s + 1 : 1;
          daily.d = today;
          bonus = 30 + 10 * Math.min(7, daily.s);
          shells += bonus;
        }
      }
    }
    const earned = payout() + bonus;
    save();
    paintRecord();
    rewarded = false;
    if (win || record) setTimeout(() => celebrate(win ? 180 : 110), 250);
    const minutes = Math.floor(game.time / 60);
    const seconds = String(Math.floor(game.time % 60)).padStart(2, "0");
    const facts = `<div class="facts"><span><b>${game.destroyed}</b> роботов</span><span><b>${game.collected}</b> жемчужин</span><span><b>${game.bestCombo}</b> подряд</span><span><b>${minutes}:${seconds}</b> в рейсе</span></div>`;
    const prize = `<p class="prize">Ракушки за рейс: <b data-count="${earned}" data-prefix="+🐚 ">+🐚 ${earned}</b>${bonus ? ` <small>(в том числе 🐚 ${bonus} за рейс дня, серия ${daily.s})</small>` : ""}</p>`;
    const double = canReward() && earned > 0 ? `<button class="choice reward" data-action="double" data-n="${earned}">▶ Ролик: ещё +🐚 ${earned}</button>` : "";
    const badge = record ? '<div class="badge">Новый рекорд!</div>' : "";
    const scoreLine = `<p class="result-score" data-count="${game.score}" data-prefix="✦ ">✦ ${game.score}</p>`;
    if (win) {
      const title = kind === "daily" ? "Рейс дня пройден!" : "Жемчужина спасена!";
      const about = kind === "daily" ? "Возвращайся завтра — будет новый рейс и новое правило." : `Кракен-9 обезврежен. Риф снова свободен${game.retries ? "" : " — и ни одной потерянной лодки"}. Теперь можно нырнуть в Бездну!`;
      showPanel(`<div class="eyebrow">${kind === "daily" ? "РЕЙС ДНЯ ЗАВЕРШЁН" : "ЭКСПЕДИЦИЯ ЗАВЕРШЕНА"}</div>${badge}
        <h2 id="panel-title">${title}</h2>
        ${scoreLine}${facts}${prize}
        <p>${about}</p>
        <button class="primary" data-action="retry">Новый рейс</button>
        <div class="row${double ? "" : " solo"}">${double}<button class="choice" data-action="dock">В док</button></div>`);
    } else if (kind === "campaign") {
      const boss = game.enemies.find(enemy => BOSS_NAMES[enemy.kind]);
      const tip = boss?.kind === "boss" ? "Луч Кракена бьёт по прямой: увидел розовую полосу — сразу в сторону."
        : boss?.kind === "titan" ? "Великан бросается по светлой полосе. Уйди вбок и стреляй, пока он пятится."
        : boss?.kind === "turtle" ? "В панцире черепаху не пробить: отплыви от колец зарядов и стреляй, когда она вылезет."
        : game.enemies.some(enemy => enemy.kind === "star") ? "Морская звезда закрывает соседей щитом — подплыви к ней ближе, лазер собьёт её первой."
        : "Подбирай жемчужины для ремонта, а импульс береги для залпов и толпы.";
      showPanel(`<div class="eyebrow">СИГНАЛ ИЗ ДОКА · ГЛУБИНА ${game.wave} ИЗ ${DEPTHS.length}</div>${badge}
        <h2 id="panel-title">Субмарина повреждена</h2>
        ${scoreLine}${facts}${prize}
        <p>${tip}</p>
        <button class="primary" data-action="again">Ещё раз с этой глубины</button>
        <p class="note">Модули останутся, роботы здесь станут слабее, счёт уменьшится на четверть.</p>
        <div class="row"><button class="choice" data-action="retry">Новый рейс</button><button class="choice" data-action="dock">В док</button></div>${double ? `<div class="row solo">${double}</div>` : ""}`);
    } else {
      const chance = kind === "abyss" && canReward() && !chanceUsed ? '<button class="primary" data-action="chance">▶ Ролик: продолжить с этой глубины</button>' : "";
      const reached = kind === "abyss" ? `Бездна: глубина ${game.wave}` : `Рейс дня: глубина ${game.wave} из 6`;
      showPanel(`<div class="eyebrow">${reached}</div>${badge}
        <h2 id="panel-title">Субмарина повреждена</h2>
        ${scoreLine}${facts}${prize}
        <p>${kind === "abyss" ? "Модули из дока помогут в следующий раз, а мастерская сделает лодку крепче." : "Попробуй ещё раз — рейс дня можно проходить сколько угодно."}</p>
        ${chance}
        <div class="row"><button class="choice" data-action="${kind === "abyss" ? "go-abyss" : "go-daily"}">Ещё раз</button><button class="choice" data-action="dock">В док</button></div>${double ? `<div class="row solo">${double}</div>` : ""}`);
    }
    if (record) toast("🏆 Новый рекорд!");
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
  if (["module", "retry", "again", "go-abyss", "go-daily"].includes(action) && !(await adBreak())) return;
  if (action === "resume") resume();
  else if (action === "retry") start(game.kind);
  else if (action === "again") again();
  else if (action === "dock") dock();
  else if (action === "close") closePanel();
  else if (action === "quality") cycleQuality();
  else if (action === "go-abyss" && abyssUnlocked()) start("abyss");
  else if (action === "go-daily") start("daily");
  else if (action === "buy") {
    const key = button.dataset.kind;
    const price = PRICE[shop[key]];
    if (shop[key] < 5 && shells >= price) {
      shells -= price;
      shop[key]++;
      save();
      wakeAudio();
      chord([523, 659, 784], 0.07, 0.2, 0.06);
      shopPanel();
      id("panel-body").querySelector(`[data-kind="${key}"]`)?.closest(".shop-row")?.classList.add("bought");
    }
  } else if (action === "double") {
    const earned = Number(button.dataset.n) || 0;
    watchReward(() => {
      shells += earned;
      save();
      button.disabled = true;
      button.textContent = `✓ Получено +🐚 ${earned}`;
      toast(`🐚 +${earned} за ролик`);
    });
  } else if (action === "chance") {
    if (chanceUsed) return;
    watchReward(() => {
      chanceUsed = true;
      clearInput();
      view.reset();
      game.secondChance();
    });
  } else if (action === "module") {
    wakeAudio();
    game.upgrade(button.dataset.kind);
    tone(523, 784, 0.2, 0.07);
    tone(784, 1046, 0.25, 0.06, 0.12);
    // продолжение экспедиции: с этой глубины, с этими модулями и этим счётом
    if (game.kind === "campaign" && game.mode === "play") {
      checkpoint = { w: game.wave, m: game.modules.map(kind => LETTER[kind]).join(""), s: game.score, p: Math.min(paid, Math.floor(game.score / 300)) };
      ownCheckpoint = true;
      save();
    }
  }
});

const wave = id("wave"), score = id("score"), hp = id("hp");
const pulse = id("pulse"), pulseLabel = id("pulse-label");
const boss = id("boss"), bossFill = id("boss-fill"), healthFill = id("health-fill");
const lesson = id("lesson");
const combo = id("combo"), mods = id("mods"), bossName = id("boss-name"), powers = id("powers");

function paintHud() {
  if (game.mode === "menu") return;
  const p = game.player;
  text(wave, game.kind === "abyss" ? "∞ " + game.wave : game.wave + " / " + game.last());
  text(score, game.score);
  combo.hidden = game.combo < 2 || !active();
  if (game.combo >= 2) text(combo, "серия ×" + game.multiplier().toFixed(1));
  mods.hidden = game.modules.length === 0;
  text(mods, game.modules.map(kind => MODULE_INFO[kind][0]).join(" "));
  // активные бонусы: тройной залп, заморозка, пузыри-щиты
  const chips = [];
  if (p.spread > 0) chips.push("✦ " + Math.ceil(p.spread));
  if (game.freeze > 0) chips.push("❄ " + Math.ceil(game.freeze));
  if (p.bubble > 0) chips.push("◯" + (p.bubble > 1 ? "×" + p.bubble : ""));
  text(powers, chips.join("  "));
  powers.hidden = chips.length === 0;
  text(hp, Math.ceil(p.health));
  ratio(healthFill, p.health / p.maxHealth);
  healthFill.closest(".health").classList.toggle("low", p.health < p.maxHealth * 0.36);
  pulse.disabled = game.mode !== "play" || p.cooldown > 0;
  pulse.classList.toggle("ready", game.mode === "play" && p.cooldown === 0);
  text(pulseLabel, p.cooldown > 0 ? Math.ceil(p.cooldown) + " с" : "ИМПУЛЬС");
  const flagship = game.enemies.find(enemy => BOSS_NAMES[enemy.kind]);
  boss.hidden = !flagship && !game.bonus;
  if (game.bonus) {
    // «Жемчужное течение»: сколько собрано и сколько осталось времени
    text(bossName, `ЖЕМЧУЖНОЕ ТЕЧЕНИЕ · ${game.bonus.got} / ${game.bonus.total}`);
    boss.dataset.kind = "bonus";
    ratio(bossFill, Math.max(0, (game.bonus.until - game.time) / 24));
  } else if (flagship) {
    text(bossName, BOSS_NAMES[flagship.kind] + (flagship.hidden ? " · В ПАНЦИРЕ" : ""));
    boss.dataset.kind = flagship.kind;
    ratio(bossFill, Math.max(0, flagship.health / flagship.maxHealth));
  }
  // две подсказки: как плыть (первая глубина) и зачем импульс (вторая, пока им не пользовались)
  const teachMove = !hasMoved && game.wave === 1 && game.kind === "campaign" && game.time < 6;
  const teachPulse = !usedPulse && game.wave === 2 && game.kind === "campaign" && p.cooldown === 0 && game.shots.some(shot => !shot.friendly);
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
applyQuality();

let last = 0;
let previous = "";
let accumulator = 0;
let rush = 1; // ускорение времени, только для проверок
const STEP = 1 / 60;

// Ручки для проверок из консоли и для роботов: состояние, прыжок на глубину, ускорение времени.
window.reefPatrol = {
  game,
  view,
  state: () => ({ mode: game.mode, kind: game.kind, wave: game.wave, score: game.score, health: game.player.health, enemies: game.enemies.length, offer: game.offer, shells, quality: view.quality, tasks: tasks.a.map(t => ({ ...t, key: MISSIONS[t.k].key })) }),
  jump(depth) {
    game.enemies.length = game.shots.length = game.pearls.length = game.queue.length = game.capsules.length = 0;
    game.beam = null;
    game.wave = Math.max(0, Math.min(game.last() - 1, depth - 1));
    game.nextWave();
  },
  speed(k) { rush = Math.max(0.1, Math.min(8, k)); },
  quality(level) { qualitySet = level; applyQuality(); },
  give(n) { shells += n; save(); paintRecord(); },
  // для роботов: куда «ведёт палец» (null — отпустить)
  steer(point) { target = point; if (point) hasMoved = true; },
  start,
};

function frame(ms) {
  const raw = last ? (ms - last) / 1000 : 0;
  const dt = Math.min(0.05, raw);
  last = ms;
  watchFrames(raw);
  // после гибели босса — короткое замедление
  const slow = view.hitStop > 0 ? 0.3 : 1;
  view.hitStop = Math.max(0, view.hitStop - dt);
  if (active()) {
    accumulator += dt * rush * slow;
    const move = currentMove();
    while (accumulator >= STEP) {
      game.step(STEP, move);
      accumulator -= STEP;
    }
  } else accumulator = 0;
  for (const e of game.events.splice(0)) {
    view.event(e);
    playEvent(e);
    if (e.type === "wave") {
      announce(e.boss ? BOSS_NAMES[e.boss] : e.name, (game.kind === "abyss" ? "БЕЗДНА · ГЛУБИНА " : "ГЛУБИНА ") + e.wave);
      if (game.kind === "campaign") bump("depth", e.wave);
      if (game.kind === "abyss") bump("abyss", e.wave - 1);
      if (game.kind === "daily" && e.wave === 1) setTimeout(() => toast("📅 " + RULES[game.rule]), 1200);
    } else if (e.type === "beam-warning") announce("Уйди с линии луча!");
    else if (e.type === "clear") {
      if (e.clean) bump("clean");
      if (e.boss) bump("boss");
      announce(game.wave >= game.last() ? "Жемчужина освобождена" : e.boss ? "Босс повержен!" : "Глубина пройдена", e.clean ? "БЕЗ ПРОБОИН · БОНУС" : "");
    } else if (e.type === "kill") {
      const big = e.points >= 400;
      popScore(e.x, e.z, e.points, big);
      if (e.kind === "crab") bump("crab");
      else if (e.kind === "puffer" && e.far) bump("puffer");
      else if (e.kind === "eel") bump("eel");
      else if (e.kind === "star") bump("star");
      else if (e.kind === "ray") bump("ray");
      else if (e.kind === "chest") bump("chest");
      if (game.combo >= 2) bump("combo", game.combo);
    } else if (e.type === "boss-down") {
      setTimeout(() => celebrate(90), 300);
    } else if (e.type === "pearl") bump("pearl");
    else if (e.type === "pulse") bump("pulse", e.hits);
    else if (e.type === "power") {
      bump("power");
      announce(POWER_INFO[e.kind][1]);
    } else if (e.type === "hurt") {
      id("vignette").classList.remove("hurt");
      void id("vignette").offsetWidth;
      id("vignette").classList.add("hurt");
    } else if (e.type === "rain") announce("Жемчужный дождь!");
    else if (e.type === "bonus") announce("Жемчужное течение!", "БОНУС · СОБЕРИ ЖЕМЧУГ");
    else if (e.type === "bonus-end") {
      announce(e.perfect ? "Идеально! +1000" : `Собрано ${e.got} из ${e.total}`, "ЖЕМЧУЖНОЕ ТЕЧЕНИЕ");
      if (e.perfect) {
        bump("perfect");
        celebrate(80);
      }
    }
    else if (e.type === "swell" && !told.has("swell")) {
      told.add("swell");
      announce("Ёж раздувается — отплыви!");
    } else if (e.type === "lane-warning" && !told.has(e.row ? "eel" : "titan")) {
      told.add(e.row ? "eel" : "titan");
      announce(e.row ? "Угорь! Уйди с полосы" : "Великан бросается — в сторону!");
    } else if (e.type === "shell" && !told.has("shell")) {
      told.add("shell");
      announce("Черепаха в панцире — уворачивайся от колец!");
    } else if (e.type === "drop" && !told.has("ray")) {
      told.add("ray");
      announce("Скат роняет пузыри-ловушки!");
    } else if (e.type === "capsule-drop" && !told.has("capsule")) {
      told.add("capsule");
      announce("Бонус! Подплыви и забери");
    }
  }
  // первая встреча с морской звездой и сундучком
  if (active() && !told.has("star") && game.enemies.some(enemy => enemy.kind === "star" && enemy.z > -9)) {
    told.add("star");
    announce("Звезда закрывает соседей щитом — подплыви и сбей её!");
  }
  if (active() && !told.has("chest") && game.enemies.some(enemy => enemy.kind === "chest" && Math.abs(enemy.x) < game.bounds.x)) {
    told.add("chest");
    announce("Сундучок! Сбей его — внутри бонус");
  }
  if (previous !== game.mode) {
    previous = game.mode;
    paintMode();
  }
  paintHud();
  view.draw(game, game.mode === "paused" ? 0 : dt * slow);
  requestAnimationFrame(frame);
}

paintRecord();
id("modes").hidden = false;
id("start").disabled = false;
id("load").hidden = true;
window.vkGameHost?.bannerWhen(() => !active());
requestAnimationFrame(frame);
