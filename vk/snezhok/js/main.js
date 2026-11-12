// «Снежный ком»: экраны, управление, звук, сохранение, реклама VK и главный цикл.
import { HALF, radiusOf, gateLabel, START } from "./rules.js?v=8ae2940b";
import { buildLevel, LEVEL_COUNT, MOUNTAINS, INTRO, mountainOf } from "./levels.js?v=8ae2940b";
import { Run } from "./run.js?v=8ae2940b";
import { makePilot } from "./pilot.js?v=8ae2940b";
import { SAVE_KEY, UPGRADES, SKINS, upgradeCost, upgradeText, startSize, magnetRadius, levelReward, readSave, writeSave, setBest, bestOf } from "./economy.js?v=8ae2940b";
import { readStorage, writeStorage } from "./kit.js?v=8ae2940b";
import { Sound } from "./sound.js?v=8ae2940b";
import { SnowView } from "./view.js?v=8ae2940b";

const $ = (name) => document.getElementById(name);
const host = () => window.vkGameHost;

// Облачное сохранение VK к этому моменту уже лежит в localStorage
await host()?.ready;
const save = readSave(readStorage(SAVE_KEY));
const persist = () => writeStorage(SAVE_KEY, writeSave(save));
Sound.set(!!save.snd);

const view = new SnowView($("stage"));
view.onCrush = () => Sound.crush();
view.onSteam = () => Sound.steam();

let screen = "title"; // title | play
let paused = false;
let level = null;
let run = null;
let pilot = null; // автопилот для проверок
let pilotKind = null;
let pilotSeed = 1;
let panel = null; // что открыто на панели
let adBusy = false;
let resultShown = false;
let introShown = false;
let finaleShown = false; // объявление крепости или босса — до удара, а не поверх него
let reward = null; // награда последнего уровня (для ×3)
let tripled = false;
let failCredit = 0; // снежинки неудачного заезда: зачисляются, если игрок не продолжил
let shownCoins = save.co;

// ---------- Управление ----------
const keys = { left: false, right: false };
const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
let finger = null; // { id, x, from } — откуда тянут и где тогда был ком
let target = null;
const playing = () => screen === "play" && run && (run.mode === "ready" || run.playing);

function dragScale() {
  const w = view.size?.w || innerWidth;
  return (HALF * 2 * 1.05) / Math.max(260, Math.min(w * 0.62, 700));
}
addEventListener("pointerdown", (e) => {
  if (!e.isPrimary && finger) return;
  if (e.target.closest("button, a, .sheet, .title-card")) return;
  Sound.unlock();
  if (!playing() || paused) return;
  if (run.mode === "ready") begin();
  finger = { id: e.pointerId, x: e.clientX, from: run.x };
  target = run.x;
});
addEventListener("pointermove", (e) => {
  if (!finger || finger.id !== e.pointerId || !run) return;
  const lim = HALF - radiusOf(run.size);
  const want = finger.from + (e.clientX - finger.x) * dragScale();
  target = Math.max(-lim, Math.min(lim, want));
  // у края трассы точка отсчёта подтягивается, чтобы обратное движение срабатывало сразу
  if (want !== target) finger.from = target - (e.clientX - finger.x) * dragScale();
});
const lift = (e) => {
  if (finger?.id === e.pointerId) finger = target = null;
};
addEventListener("pointerup", lift);
addEventListener("pointercancel", lift);
addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && !e.repeat) {
    if (playing() && !paused && run.mode !== "ready") pause();
    else if (paused && panel === "pause") resume();
    return;
  }
  if (KEYMAP[e.code]) {
    e.preventDefault();
    keys[KEYMAP[e.code]] = true;
    if (playing() && !paused && run.mode === "ready") {
      Sound.unlock();
      begin();
    }
  } else if ((e.code === "Space" || e.code === "Enter") && playing() && !paused && run.mode === "ready" && !e.target.closest?.("button")) {
    e.preventDefault();
    Sound.unlock();
    begin();
  }
});
addEventListener("keyup", (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
});
addEventListener("blur", () => {
  keys.left = keys.right = false;
  finger = target = null;
});
function input(h) {
  if (pilot) return pilot(run, h);
  const push = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (push) return { push };
  return { target };
}

// ---------- VK: свёрнутая игра, реклама ----------
function quiet() {
  if (playing() && !paused && run.mode !== "ready") pause();
  Sound.hush();
}
function updateVisibility() {
  if (document.hidden || host()?.hidden) quiet();
  // Дальше заезд и звук продолжатся по нажатию игрока
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
addEventListener("vk-ad", (e) => {
  if (e.detail?.on) {
    adBusy = true;
    quiet();
  } else {
    adBusy = false;
    if (!document.hidden && !host()?.hidden && save.snd && !paused) Sound.unlock();
  }
});
// Пока идёт ролик, нажатия и клавиши до игры не доходят
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
addEventListener("vk-reward-ready", () => paintRewardButtons());
const rewardOk = () => !!(host()?.inVk && host().rewardReady);
// Межэкранная реклама: только после уровня, частоту ограничивает vk-host
async function adBreak() {
  if (adBusy) return false;
  adBusy = true;
  try {
    await host()?.interstitial?.();
  } finally {
    adBusy = false;
  }
  return true;
}
async function rewarded() {
  if (adBusy || !rewardOk()) return false;
  adBusy = true;
  let ok = false;
  try {
    ok = !!(await host().rewarded());
  } finally {
    adBusy = false;
  }
  return ok;
}

// ---------- Надписи ----------
function text(el, value) {
  value = String(value);
  if (el.textContent !== value) el.textContent = value;
}
// kind: "" — крупное объявление, "quick" — короткое (уходит до удара в финале),
// "tip" — плашка-подсказка под верхней полосой, чтобы не закрывать ворота
function banner(message, above = "", warn = false, kind = "") {
  const el = $("banner");
  el.className = "";
  el.classList.toggle("warn", warn);
  if (kind) el.classList.add(kind);
  el.textContent = "";
  const box = kind === "tip" ? document.createElement("span") : el;
  if (kind === "tip") {
    box.className = "pill";
    el.append(box);
  }
  if (above) {
    const small = document.createElement("small");
    small.textContent = above;
    box.append(small);
  }
  box.append(message);
  void el.offsetWidth;
  el.classList.add("show");
}
const floats = [];
let floatLane = 0;
let floatLast = 0;
// всплывающие числа появляются над табличкой размера и не ложатся друг на друга;
// они едут вместе с табличкой (камера в финале отъезжает, ком подпрыгивает), поэтому не наползают на неё
function floatText(value, kind = "", big = false, dx = 0, dy = 0) {
  const el = document.createElement("div");
  el.className = `float ${kind} ${big ? "big" : ""}`;
  el.textContent = value;
  const now = performance.now();
  floatLane = now - floatLast < 650 ? floatLane + 1 : 0;
  floatLast = now;
  const lane = [0, -1, 1][floatLane % 3];
  const tagH = $("size").offsetHeight || 36;
  el.dx = dx + lane * (big ? 62 : 48);
  el.dy = dy - 14 - tagH - 16 - Math.abs(lane) * 6;
  placeFloat(el);
  $("floats").append(el);
  floats.push(el);
  if (floats.length > 10) floats.shift().remove();
  setTimeout(() => {
    el.remove();
    const i = floats.indexOf(el);
    if (i >= 0) floats.splice(i, 1);
  }, 950);
}
function placeFloat(el) {
  el.style.left = `${sizePoint.x + el.dx}px`;
  el.style.top = `${sizePoint.y + el.dy}px`;
}
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(".", ",") + " тыс." : String(n));
function paintCoins(value = null) {
  const v = value ?? save.co;
  text($("coin-count"), fmt(v));
}

// ---------- Экраны ----------
function setScreen(name) {
  screen = name;
  document.body.dataset.screen = name;
  $("title").hidden = name !== "title";
  $("hud").hidden = name !== "play";
  $("pause").hidden = name !== "play";
  $("size").hidden = name !== "play";
  $("hint").hidden = true;
}
function paintSound() {
  $("sound").setAttribute("aria-pressed", String(!!save.snd));
}
$("sound").addEventListener("click", () => {
  if (adBusy) return;
  save.snd = save.snd ? 0 : 1;
  Sound.set(!!save.snd);
  if (save.snd) {
    Sound.unlock();
    Sound.tap();
  }
  persist();
  paintSound();
});
$("pause").addEventListener("click", () => {
  Sound.tap();
  if (playing() && !paused) pause();
});

function paintTitle() {
  save.at = Math.max(1, Math.min(save.at, Math.min(save.lv, LEVEL_COUNT)));
  const n = save.at;
  const m = mountainOf(n);
  const best = bestOf(save, n);
  text($("pick-level"), n % 10 === 0 ? `Уровень ${n} · босс` : `Уровень ${n}`);
  text($("pick-mountain"), MOUNTAINS[m].name + (best ? ` · лучшее ×${best}` : ""));
  $("prev").disabled = n <= 1;
  $("next").disabled = n >= Math.min(save.lv, LEVEL_COUNT);
  text($("play"), save.lv > LEVEL_COUNT && n === LEVEL_COUNT ? "Играть ещё" : n < Math.min(save.lv, LEVEL_COUNT) ? "Переиграть" : "Играть");
  paintCoins();
}
$("prev").addEventListener("click", () => pickLevel(-1));
$("next").addEventListener("click", () => pickLevel(1));
function pickLevel(step) {
  const n = Math.max(1, Math.min(Math.min(save.lv, LEVEL_COUNT), save.at + step));
  if (n === save.at) return;
  Sound.tap();
  save.at = n;
  persist();
  paintTitle();
  showMenuScene();
}
$("play").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  startLevel(save.at);
});
$("open-upgrades").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  openUpgrades();
});
$("open-skins").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  openSkins();
});

function showMenuScene() {
  const L = buildLevel(save.at);
  if (view.level !== L) view.load(L);
  run = new Run(L, { start: startSize(save.up[0]) });
  level = L;
  view.snap = true;
}
function toTitle() {
  closePanel();
  paused = false;
  pilot = null;
  finger = target = null;
  setScreen("title");
  Sound.mood(0);
  paintTitle();
  showMenuScene();
}

// ---------- Уровень ----------
function startLevel(n) {
  closePanel();
  level = buildLevel(n);
  save.at = n;
  persist();
  if (view.level !== level) view.load(level);
  else view.load(level); // предметы и следы — с чистого листа
  run = new Run(level, { start: startSize(save.up[0]), magnet: magnetRadius(save.up[2]) });
  paused = false;
  resultShown = false;
  introShown = false;
  reward = null;
  tripled = false;
  failCredit = 0;
  finger = target = null;
  setScreen("play");
  view.snap = true;
  text($("hud-level"), n);
  paintCoins(0);
  lastSize = run.size;
  text($("size"), run.size);
  Sound.mood(1);
  const hint = $("hint");
  hint.hidden = false;
  const touch = matchMedia("(pointer: coarse)").matches;
  hint.innerHTML =
    n === 1 || save.lv <= 2
      ? `<i class="swipe"></i>${touch ? "Тяни пальцем влево-вправо" : "Тяни мышью или жми A/D"}<br><b>Синие ворота</b> растят ком, <span class="bad">красные</span> — тают`
      : `<i class="swipe"></i>${touch ? "Коснись и тяни — ком покатится" : "Нажми и тяни — ком покатится"}`;
  finaleShown = false;
  if (level.boss) banner(level.finale.boss.name, `УРОВЕНЬ ${n} · БОСС`, true);
  else banner(MOUNTAINS[level.mountain].name, `УРОВЕНЬ ${n}`);
  pilot = pilotKind ? makePilot(level, pilotKind, pilotSeed) : null;
  if (pilot) begin();
}
function begin() {
  if (!run || run.mode !== "ready") return;
  run.begin();
  $("hint").hidden = true;
  Sound.start();
}
function pause() {
  if (paused) return;
  paused = true;
  finger = target = null;
  keys.left = keys.right = false;
  openPanel("pause", `<div class="eyebrow"><i></i> УРОВЕНЬ ${level.n}</div><h2 id="panel-title">Пауза</h2>
    <button class="primary" data-action="resume">Продолжить</button>
    <div class="pair"><button class="choice" data-action="restart">Заново</button><button class="choice" data-action="menu">В меню</button></div>`);
}
function resume() {
  if (!paused) return;
  closePanel();
  paused = false;
  Sound.unlock();
}

// ---------- Панели ----------
function openPanel(kind, html) {
  panel = kind;
  document.body.dataset.panel = kind;
  $("sheet").innerHTML = html;
  $("panel").hidden = false;
  paintRewardButtons();
}
function closePanel() {
  panel = null;
  delete document.body.dataset.panel;
  $("panel").hidden = true;
  $("sheet").innerHTML = "";
}
function paintRewardButtons() {
  const ok = rewardOk();
  for (const b of document.querySelectorAll("[data-reward]")) {
    const spent = b.dataset.reward === "triple" ? tripled : !run?.canContinue();
    b.hidden = !ok || spent;
  }
}
const ICONS = {
  start: '<svg viewBox="0 0 32 32"><circle cx="11" cy="20" r="5"/><circle cx="21" cy="16" r="8"/><path d="M4 9l4-4M8 9V5H4"/></svg>',
  coin: '<svg viewBox="0 0 32 32"><path d="M16 4v24M5.6 10l20.8 12M5.6 22L26.4 10"/><path d="M24 4v6M21 7h6"/></svg>',
  magnet: '<svg viewBox="0 0 32 32"><path d="M8 6v10a8 8 0 0 0 16 0V6"/><path d="M8 6h5v10a3 3 0 0 0 6 0V6h5"/><path d="M4 26l3-2M28 26l-3-2M16 30v-3"/></svg>',
};
function bankHtml() {
  return `<div class="bank"><i class="flake"></i>${fmt(save.co)}</div>`;
}
function openUpgrades() {
  const cards = UPGRADES.map((u, i) => {
    const k = save.up[i];
    const cost = upgradeCost(i, k);
    const pips = Array.from({ length: u.max }, (_, j) => `<i class="${j < k ? "on" : ""}"></i>`).join("");
    const btn = cost === null ? `<button class="buy on" disabled>Всё</button>` : `<button class="buy" data-action="upgrade" data-index="${i}" ${save.co >= cost ? "" : "disabled"}><i class="flake"></i>${fmt(cost)}</button>`;
    return `<div class="card"><div class="ico">${ICONS[u.id]}</div><div><b>${u.name}</b><small>${upgradeText(i, k)}</small><div class="lv">${pips}</div></div>${btn}</div>`;
  }).join("");
  openPanel("upgrades", `<h2 id="panel-title">Улучшения</h2>${bankHtml()}<div class="list">${cards}</div>
    <div class="pair" style="grid-template-columns:1fr"><button class="choice" data-action="back">Назад</button></div>`);
}
const ORBS = {
  snow: "radial-gradient(circle at 35% 30%, #ffffff, #dfe9f6 60%, #b8c8e0)",
  ice: "radial-gradient(circle at 35% 30%, #ffffff, #a8ecff 45%, #3aa8e0)",
  candy: "repeating-linear-gradient(45deg, #ff3d7f 0 7px, #ffffff 7px 14px)",
  orange: "radial-gradient(circle at 35% 30%, #ffd08a, #ff8a1a 55%, #c85a00)",
  disco: "conic-gradient(#e6e6f0, #8a8aa0, #ffffff, #6a6a80, #f0f0ff, #9a9ab0, #e6e6f0)",
  night: "radial-gradient(circle at 30% 30%, #ffe27a 0 2px, transparent 3px), radial-gradient(circle at 65% 55%, #fff 0 1.5px, transparent 2.5px), radial-gradient(circle at 45% 75%, #fff 0 1.5px, transparent 2.5px), linear-gradient(160deg, #1a2a7a, #2a1a5e)",
};
function openSkins() {
  const cards = SKINS.map((sk, i) => {
    const owned = !!(save.sk & (1 << i));
    const worn = save.cur === i;
    const btn = worn
      ? `<button class="buy on" disabled>Надет</button>`
      : owned
        ? `<button class="buy" data-action="wear" data-index="${i}">Надеть</button>`
        : `<button class="buy" data-action="skin" data-index="${i}" ${save.co >= sk.price ? "" : "disabled"}><i class="flake"></i>${fmt(sk.price)}</button>`;
    return `<div class="skin ${worn ? "worn" : ""}"><i class="orb" style="background:${ORBS[sk.id]}"></i><b>${sk.name}</b>${btn}</div>`;
  }).join("");
  openPanel("skins", `<h2 id="panel-title">Облики кома</h2>${bankHtml()}<div class="skins">${cards}</div>
    <div class="pair" style="grid-template-columns:1fr"><button class="choice" data-action="back">Назад</button></div>`);
}

function showFinish() {
  const r = levelReward(level, run, save.up[1]);
  reward = r;
  tripled = false;
  save.co += r.total;
  setBest(save, level.n, r.mult);
  if (level.n === save.lv && save.lv <= LEVEL_COUNT) save.lv = level.n + 1;
  save.at = Math.min(LEVEL_COUNT, Math.max(save.at, level.n < LEVEL_COUNT ? level.n + 1 : level.n));
  persist();
  const broke = level.finale.kind === "boss" ? true : run.walls.every((w) => w.broken);
  const title = level.finale.kind === "boss" ? "Снеговик повержен!" : broke ? "Крепость разбита!" : "Уровень пройден!";
  const facts = [
    `<span><b>${r.flakes}</b>снежинок</span>`,
    `<span><b>×${r.mult}</b>ступень</span>`,
    r.bonus > 1 ? `<span><b>+${Math.round((r.bonus - 1) * 100)}%</b>бонус</span>` : "",
    `<span><b>+${r.base}</b>за уровень</span>`,
    r.boss ? `<span><b>+${r.boss}</b>за босса</span>` : "",
  ].join("");
  const last = level.n >= LEVEL_COUNT;
  openPanel("finish", `<div class="eyebrow"><i></i> УРОВЕНЬ ${level.n} · ${MOUNTAINS[level.mountain].name.toUpperCase()}</div>
    <h2 id="panel-title">${title}</h2>
    <div class="big-mult">×${r.mult}</div>
    <div class="facts">${facts}</div>
    <div class="reward" id="reward"><i class="flake"></i>+${fmt(r.total)}</div>
    <button class="ad" data-reward="triple" data-action="triple" hidden>×3 снежинки за рекламу</button>
    <button class="primary" data-action="next">${last ? "Все горы пройдены!" : "Дальше"}</button>
    <div class="pair"><button class="choice" data-action="again">Ещё раз</button><button class="choice" data-action="menu">В меню</button></div>`);
  paintCoins();
  $("coins").classList.remove("bump");
  void $("coins").offsetWidth;
  $("coins").classList.add("bump");
}
function showFail() {
  failCredit = run.coins;
  const why = run.failReason === "fall" ? "Сорвался с моста!" : run.failReason === "boss" ? `${level.finale.boss.name} крупнее!` : "Ком растаял!";
  const tip =
    run.failReason === "boss"
      ? `Нужно больше ${level.finale.boss.hp}. Ворота ×2 и ×3 растят ком быстрее всего.`
      : run.failReason === "fall"
        ? "На мосту держись середины."
        : "Красные ворота и препятствия отнимают снег.";
  openPanel("fail", `<div class="eyebrow"><i></i> УРОВЕНЬ ${level.n}</div>
    <h2 id="panel-title">${why}</h2>
    <p>${tip}</p>
    <p>Собранные снежинки останутся: <b>+${run.coins}</b></p>
    <button class="ad" data-reward="continue" data-action="continue" hidden>Продолжить с этого места за рекламу</button>
    <button class="primary" data-action="again">Ещё раз</button>
    <div class="pair" style="grid-template-columns:1fr"><button class="choice" data-action="menu">В меню</button></div>`);
}
function creditFail() {
  if (!failCredit) return;
  save.co += failCredit;
  failCredit = 0;
  persist();
}

$("sheet").addEventListener("click", async (e) => {
  if (adBusy) return;
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const action = b.dataset.action;
  Sound.unlock();
  Sound.tap();
  if (action === "resume") resume();
  else if (action === "restart") startLevel(level.n);
  else if (action === "menu") {
    creditFail();
    toTitle();
  } else if (action === "back") {
    closePanel();
    paintTitle();
  } else if (action === "upgrade") {
    const i = Number(b.dataset.index);
    const cost = upgradeCost(i, save.up[i]);
    if (cost === null || save.co < cost) return;
    save.co -= cost;
    save.up[i]++;
    persist();
    Sound.buy();
    openUpgrades();
    paintCoins();
  } else if (action === "skin") {
    const i = Number(b.dataset.index);
    if (save.sk & (1 << i) || save.co < SKINS[i].price) return;
    save.co -= SKINS[i].price;
    save.sk |= 1 << i;
    save.cur = i;
    persist();
    Sound.buy();
    view.setSkin(i);
    openSkins();
    paintCoins();
  } else if (action === "wear") {
    const i = Number(b.dataset.index);
    if (!(save.sk & (1 << i))) return;
    save.cur = i;
    persist();
    view.setSkin(i);
    openSkins();
  } else if (action === "next" || action === "again") {
    // реклама — только здесь, между уровнями, и не чаще, чем разрешит vk-host
    creditFail();
    const n = action === "next" ? Math.min(LEVEL_COUNT, level.n + 1) : level.n;
    if (action === "next" && level.n >= LEVEL_COUNT) {
      if (!(await adBreak())) return;
      toTitle();
      banner("Все четыре горы пройдены!", "ПОБЕДА");
      return;
    }
    if (!(await adBreak())) return;
    startLevel(n);
    updateVisibility();
  } else if (action === "triple") {
    if (tripled || !reward) return;
    const ok = await rewarded();
    if (!ok) return;
    tripled = true;
    save.co += reward.total * 2;
    persist();
    Sound.coin();
    const el = $("reward");
    if (el) el.innerHTML = `<i class="flake"></i>+${fmt(reward.total * 3)}`;
    paintCoins();
    paintRewardButtons();
  } else if (action === "continue") {
    if (!run.canContinue()) return;
    const ok = await rewarded();
    if (!ok || !run.continueRun()) return;
    failCredit = 0;
    closePanel();
    resultShown = false;
    finaleShown = run.s >= level.length;
    handleEvents();
    Sound.unlock();
    updateVisibility();
  }
});

// ---------- События заезда ----------
let lastSize = START;
const sizePoint = { x: 0, y: 0, on: false };
function handleEvents() {
  for (const e of run.events) {
    view.event(e, run);
    switch (e.type) {
      case "flake":
        Sound.flake();
        break;
      case "pile":
        Sound.pile(e.v > 5);
        floatText("+" + e.v, "good", false, Math.random() * 40 - 20);
        break;
      case "gate":
        if (e.good) Sound.good(e.op.k === "*");
        else Sound.bad();
        floatText(gateLabel(e.op), e.good ? "good" : "bad", true);
        break;
      case "hit":
        Sound.hit(e.kind === "hole" || e.kind === "crusher");
        floatText("−" + e.dmg, "bad");
        break;
      case "jump":
        Sound.jump();
        break;
      case "land":
        Sound.land();
        break;
      case "fall":
        Sound.fall();
        break;
      case "melt":
        Sound.melt();
        break;
      case "finale":
        Sound.mood(2);
        finaleBanner();
        break;
      case "wall":
        Sound.wall(e.broke);
        if (e.broke) floatText("−" + level.finale.walls[e.k].hp, "bad", false, -64);
        break;
      case "boss":
        if (e.win) {
          Sound.boss();
          banner("Бах!", "СНЕГОВИК ПОВЕРЖЕН");
        } else Sound.bounce();
        break;
      case "step":
        Sound.step(e.k);
        floatText("×" + e.k, "good", e.k >= 5);
        break;
      case "won":
        Sound.won();
        Sound.mood(0);
        setTimeout(() => run?.mode === "won" && !resultShown && ((resultShown = true), showFinish()), 1100);
        break;
      case "fail":
        Sound.mood(0);
        setTimeout(() => run?.mode === "fail" && !resultShown && ((resultShown = true), showFail()), 1300);
        break;
    }
  }
  run.events.length = 0;
}

// Объявление финала: появляется на подъезде и исчезает до первого удара
function finaleBanner() {
  if (finaleShown) return;
  finaleShown = true;
  if (level.boss) banner(`Нужно больше ${level.finale.boss.hp}!`, level.finale.boss.name.toUpperCase(), true, "quick");
  else banner("Круши стены!", "ЛЕДЯНАЯ КРЕПОСТЬ", false, "quick");
}

// ---------- Главный цикл ----------
let last = performance.now();
let speed = 1;
const fps = { frames: 0, since: performance.now(), value: 0, log: [] };
function frame(now) {
  requestAnimationFrame(frame);
  const ms = now - last;
  last = now;
  const dt = Math.min(0.05, ms / 1000);
  fps.frames++;
  if (now - fps.since >= 1000) {
    fps.value = (fps.frames * 1000) / (now - fps.since);
    fps.log.push(fps.value);
    if (fps.log.length > 30) fps.log.shift();
    fps.frames = 0;
    fps.since = now;
  }
  if (screen === "play" && run && !paused && !adBusy) {
    let left = dt * speed;
    while (left > 1e-6 && run.mode !== "won" && run.mode !== "fail") {
      const h = Math.min(1 / 60, left);
      run.step(h, input(h));
      left -= h;
      if (run.events.length) handleEvents();
    }
    if (run.events.length) handleEvents();
    if (!introShown && level.intro && run.s > level.introAt) {
      introShown = true;
      banner(INTRO[level.intro], "ВНИМАНИЕ", true, "tip");
      Sound.hint();
    }
    if (!finaleShown && run.mode === "run" && run.s > level.length - 12) finaleBanner();
  }
  if (paused || adBusy) {
    // на паузе сцена стоит — рисуем редко, только чтобы не пропал кадр после поворота экрана
    if (!view.needsDraw) return;
    view.needsDraw = false;
  }
  view.draw(run, paused || adBusy ? 0 : dt, screen === "title" ? "menu" : "play", ms);
  if (screen === "play") paintHud();
}
function paintHud() {
  $("hud-progress").style.transform = `scaleX(${Math.min(1, run.s / (level.finale.end - 4)).toFixed(3)})`;
  // в заезде — снежинки этого заезда, на панелях — копилка
  if (panel) paintCoins();
  else text($("coin-count"), run.coins);
  const tag = $("size");
  const p = view.ballTop(sizePoint);
  const show = p.on && view.ball.visible && run.mode !== "falling" && run.mode !== "won" && run.mode !== "fail" && !panel;
  tag.style.visibility = show ? "visible" : "hidden";
  // у самых ворот число над комом бледнеет и уменьшается, чтобы не закрывать числа на створках
  const gate = level.gates.find((g) => g.s > run.s - 0.5);
  const near = !!gate && gate.s - run.s < 11 && run.mode === "run";
  if (tag.classList.contains("near") !== near) tag.classList.toggle("near", near);
  tag.style.translate = `calc(${p.x.toFixed(1)}px - 50%) calc(${(p.y - 14).toFixed(1)}px - 100%)`;
  for (const f of floats) placeFloat(f);
  if (run.size !== lastSize) {
    tag.classList.remove("up", "down");
    void tag.offsetWidth;
    tag.classList.add(run.size > lastSize ? "up" : "down");
    lastSize = run.size;
    text(tag, run.size);
  }
}
function resize() {
  view.resize();
  view.needsDraw = true;
}
addEventListener("resize", resize);
resize();

// ---------- Старт ----------
view.setSkin(save.cur);
paintSound();
toTitle();
$("play").disabled = false;
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

// Для проверок в браузере
window.snezhok = {
  view,
  Sound,
  get run() {
    return run;
  },
  get level() {
    return level;
  },
  save,
  persist,
  state: () => ({ screen, paused, panel, adBusy, mode: run?.mode, s: run?.s, size: run?.size, coins: save.co, lv: save.lv, at: save.at, n: level?.n, fps: fps.value, perf: { ...view.perf } }),
  fps: () => [...fps.log],
  play: (n) => startLevel(n),
  autopilot(kind = "good", seed = 1) {
    pilotKind = kind;
    pilotSeed = seed;
    pilot = kind && screen === "play" ? makePilot(level, kind, seed) : null;
    if (pilot && run.mode === "ready") begin();
  },
  speed: (k) => (speed = k),
  menu: () => toTitle(),
  pause,
  resume,
  // совет робота для проверки настоящими движениями мыши/пальца
  advice() {
    if (!advisor || advisor.level !== level) advisor = { level, steer: makePilot(level, "good", 7) };
    const want = advisor.steer(run, 0.12).target;
    return { want, x: run.x, scale: dragScale(), finger: finger && { x: finger.x, from: finger.from }, mode: run.mode, s: run.s, panel };
  },
};
let advisor = null;
