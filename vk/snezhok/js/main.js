// «Снежный ком»: экраны, управление, звук, сохранение, реклама VK и главный цикл.
import { HALF, radiusOf, gateLabel, START } from "./rules.js?v=3cff0128";
import { buildLevel, LEVEL_COUNT, MOUNTAINS, PER_MOUNTAIN, INTRO, FOE_INTRO, QUEST_TEXT, mountainOf } from "./levels.js?v=3cff0128";
import { Run } from "./run.js?v=3cff0128";
import { makePilot } from "./pilot.js?v=3cff0128";
import { SAVE_KEY, UPGRADES, SKINS, upgradeCost, upgradeText, levelReward, readSave, writeSave, setBest, bestOf, gear, skinOpen, AD_AMMO } from "./economy.js?v=3cff0128";
import { readStorage, writeStorage } from "./kit.js?v=3cff0128";
import { Sound } from "./sound.js?v=3cff0128";
import { SnowView, TIERS } from "./view.js?v=3cff0128";
import { FOE_ICONS, CONFETTI } from "./icons.js?v=3cff0128";

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
view.onFoe = (kind) => (kind === "thud" ? Sound.thud() : Sound.smash());
// Качество графики: «само» выбирает по устройству и снижает, если кадров меньше ~45 в секунду
const QUALITY = ["auto", "high", "medium", "low"];
function startTier() {
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  if ((mem && mem <= 2) || cores <= 2) return "low";
  if ((mem === undefined || mem >= 6) && cores >= 4) return "high";
  return "medium";
}
view.setQuality(QUALITY[save.q] || "auto", startTier());

let screen = "title"; // title | play
let paused = false;
let level = null;
let run = null;
let pilot = null; // автопилот для проверок
let pilotKind = null;
let pilotSeed = 1;
let panel = null; // что открыто на панели
let adBusy = false;
let adOverlay = false;
const adLocked = () => adBusy || adOverlay;
let resultDelay = null;
let intros = []; // подсказки уровня: о новом препятствии, монстре, подборе
let introAt = 0;
let slowmo = 0; // замедление после удара по снеговику
let finaleShown = false; // объявление крепости или босса — до удара, а не поверх него
let reward = null; // награда последнего уровня (для ×3)
let tripled = false;
let failCredit = null; // часть заезда, уже начисленная при поражении

// ---------- Управление ----------
const keys = { left: false, right: false };
const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
let finger = null; // { id, x, from } — откуда тянут и где тогда был ком
let target = null;
const playing = () => screen === "play" && run && (run.mode === "ready" || run.playing);
const canPause = () => screen === "play" && (playing() || resultDelay !== null);

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
    if (canPause() && !paused && run.mode !== "ready") pause();
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
  if (canPause() && !paused && run.mode !== "ready") pause();
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
    adOverlay = true;
    quiet();
  } else {
    adOverlay = false;
    if (!document.hidden && !host()?.hidden && save.snd && !paused) Sound.unlock();
  }
});
// Пока идёт ролик, нажатия и клавиши до игры не доходят
for (const type of ["pointerdown", "pointerup", "click", "keydown"])
  addEventListener(
    type,
    (e) => {
      if (!adLocked()) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );
addEventListener("vk-reward-ready", () => paintRewardButtons());
const rewardOk = () => !!(host()?.inVk && host().rewardReady);
// Межэкранная реклама: только после уровня, частоту ограничивает vk-host.
async function showAd(button, kind) {
  if (adLocked()) return false;
  const rewarded = kind === "rewarded";
  if (rewarded && !rewardOk()) return false;
  const notice = $("ad-notice");
  if (notice) notice.hidden = true;
  adBusy = true;
  button.disabled = true;
  let shown = false;
  try {
    shown = Boolean(await host()?.[kind]?.());
  } catch {
    // Игра продолжает работать, если SDK недоступен.
  } finally {
    button.disabled = false;
    adBusy = false;
  }
  if (rewarded && !shown && notice) notice.hidden = false;
  return !rewarded || shown;
}

// ---------- Надписи ----------
function text(el, value) {
  value = String(value);
  if (el.textContent !== value) el.textContent = value;
}
// kind: "" — крупное объявление, "quick" — короткое (уходит до удара в финале),
// "tip" — плашка-подсказка под верхней полосой, чтобы не закрывать ворота
function banner(message, above = "", warn = false, kind = "", icon = "") {
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
  if (icon && FOE_ICONS[icon]) {
    const ico = document.createElement("i");
    ico.className = "ico";
    ico.innerHTML = FOE_ICONS[icon];
    box.append(ico);
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
  $("gear").hidden = true;
}
function paintSound() {
  $("sound").setAttribute("aria-pressed", String(!!save.snd));
}
$("sound").addEventListener("click", () => {
  if (adLocked()) return;
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
  if (canPause() && !paused) pause();
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
  for (const b of mountainButtons) {
    b.disabled = Number(b.dataset.level) > save.lv;
    b.setAttribute("aria-pressed", String(mountainOf(Number(b.dataset.level)) === m));
  }
  text($("play"), save.lv > LEVEL_COUNT && n === LEVEL_COUNT ? "Играть ещё" : n < Math.min(save.lv, LEVEL_COUNT) ? "Переиграть" : "Играть");
  paintCoins();
}
const mountains = $("mountains");
mountains.innerHTML = MOUNTAINS.map(({ name }, i) =>
  `<button type="button" data-level="${1 + i * PER_MOUNTAIN}" aria-pressed="false">${name}</button>`
).join("");
const mountainButtons = mountains.querySelectorAll("button");
mountains.addEventListener("click", (e) => {
  const button = e.target.closest("button[data-level]");
  if (button && !button.disabled) pickLevel(Number(button.dataset.level));
});
$("prev").addEventListener("click", () => pickLevel(save.at - 1));
$("next").addEventListener("click", () => pickLevel(save.at + 1));
function pickLevel(requested) {
  const n = Math.max(1, Math.min(Math.min(save.lv, LEVEL_COUNT), requested));
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
$("open-settings").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  openSettings();
});

function showMenuScene() {
  const L = buildLevel(save.at);
  if (view.level !== L) view.load(L);
  run = new Run(L, gear(save.up));
  level = L;
  view.snap = true;
}
function toTitle() {
  resultDelay = null;
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
function startLevel(n, extra = {}) {
  closePanel();
  level = buildLevel(n);
  save.at = n;
  persist();
  view.load(level); // предметы и следы — с чистого листа
  run = new Run(level, { ...gear(save.up), ...extra });
  paused = false;
  resultDelay = null;
  slowmo = 0;
  intros = [];
  if (level.intro) intros.push({ at: level.introAt, text: INTRO[level.intro], icon: "" });
  for (const q of level.intros) intros.push({ at: q.at, text: FOE_INTRO[q.key], icon: q.key });
  intros.sort((p, q) => p.at - q.at);
  buildGear();
  reward = null;
  tripled = false;
  failCredit = null;
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
    n <= 2
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
  if (level.n > 2) $("hint").hidden = true;
  $("gear").hidden = false;
  Sound.start();
}
function pause() {
  if (paused || !canPause()) return;
  paused = true;
  finger = target = null;
  keys.left = keys.right = false;
  Sound.hush();
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
    const spent = b.dataset.reward === "triple" ? tripled : b.dataset.reward === "gun" ? false : !run?.canContinue();
    b.hidden = !ok || spent;
  }
}
const ICONS = {
  start: '<svg viewBox="0 0 32 32"><circle cx="11" cy="20" r="5"/><circle cx="21" cy="16" r="8"/><path d="M4 9l4-4M8 9V5H4"/></svg>',
  coin: '<svg viewBox="0 0 32 32"><path d="M16 4v24M5.6 10l20.8 12M5.6 22L26.4 10"/><path d="M24 4v6M21 7h6"/></svg>',
  magnet: '<svg viewBox="0 0 32 32"><path d="M8 6v10a8 8 0 0 0 16 0V6"/><path d="M8 6h5v10a3 3 0 0 0 6 0V6h5"/><path d="M4 26l3-2M28 26l-3-2M16 30v-3"/></svg>',
  gun: '<svg viewBox="0 0 32 32"><path d="M5 20l14-8 3 5-14 8z"/><circle cx="9" cy="25" r="3"/><circle cx="26" cy="9" r="3"/><path d="M28 4l1-2M30 8h2"/></svg>',
  rate: '<svg viewBox="0 0 32 32"><circle cx="8" cy="16" r="3"/><circle cx="17" cy="16" r="3"/><circle cx="26" cy="16" r="3"/><path d="M4 9h24M4 23h24"/></svg>',
  spike: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.5 3.5M21.5 21.5L25 25M25 7l-3.5 3.5M10.5 21.5L7 25"/></svg>',
};
function bankHtml() {
  return `<div class="bank"><i class="flake"></i>${fmt(save.co)}</div>`;
}
let upgradeTab = "ball";
function openUpgrades(tab = upgradeTab) {
  upgradeTab = tab;
  const cards = UPGRADES.map((u, i) => {
    if (!!u.arms !== (tab === "arms")) return "";
    const k = save.up[i];
    const cost = upgradeCost(i, k);
    const pips = Array.from({ length: u.max }, (_, j) => `<i class="${j < k ? "on" : ""}"></i>`).join("");
    const btn = cost === null ? `<button class="buy on" disabled>Всё</button>` : `<button class="buy" data-action="upgrade" data-index="${i}" ${save.co >= cost ? "" : "disabled"}><i class="flake"></i>${fmt(cost)}</button>`;
    return `<div class="card"><div class="ico">${ICONS[u.id]}</div><div><b>${u.name}</b><small>${upgradeText(i, k)}</small><div class="lv">${pips}</div></div>${btn}</div>`;
  }).join("");
  const tabs = `<div class="tabs"><button class="tab ${tab === "ball" ? "on" : ""}" data-action="tab" data-tab="ball">Ком</button><button class="tab ${tab === "arms" ? "on" : ""}" data-action="tab" data-tab="arms">Оружие</button></div>`;
  openPanel("upgrades", `<h2 id="panel-title">Улучшения</h2>${bankHtml()}${tabs}<div class="list">${cards}</div>
    <div class="pair" style="grid-template-columns:1fr"><button class="choice" data-action="back">Назад</button></div>`);
}
const ORBS = {
  snow: "radial-gradient(circle at 35% 30%, #ffffff, #dfe9f6 60%, #b8c8e0)",
  ice: "radial-gradient(circle at 35% 30%, #ffffff, #a8ecff 45%, #3aa8e0)",
  candy: "repeating-linear-gradient(45deg, #ff3d7f 0 7px, #ffffff 7px 14px)",
  orange: "radial-gradient(circle at 35% 30%, #ffd08a, #ff8a1a 55%, #c85a00)",
  disco: "conic-gradient(#e6e6f0, #8a8aa0, #ffffff, #6a6a80, #f0f0ff, #9a9ab0, #e6e6f0)",
  night: "radial-gradient(circle at 30% 30%, #ffe27a 0 2px, transparent 3px), radial-gradient(circle at 65% 55%, #fff 0 1.5px, transparent 2.5px), radial-gradient(circle at 45% 75%, #fff 0 1.5px, transparent 2.5px), linear-gradient(160deg, #1a2a7a, #2a1a5e)",
  hunter: "radial-gradient(circle at 35% 30%, #ffffff, #f2e6d2 50%, #b8946a)",
  storm: "conic-gradient(from 30deg, #bff4ff, #5f8cff, #ffffff, #3a5ae0, #9fe8ff, #bff4ff)",
};
function openSkins() {
  const cards = SKINS.map((sk, i) => {
    const owned = skinOpen(save, i);
    const worn = save.cur === i;
    const btn = worn
      ? `<button class="buy on" disabled>Надет</button>`
      : owned
        ? `<button class="buy" data-action="wear" data-index="${i}">Надеть</button>`
        : sk.kills
          ? `<button class="buy hunt" disabled>Монстров ${Math.min(save.kl, sk.kills)}/${sk.kills}</button>`
          : `<button class="buy" data-action="skin" data-index="${i}" ${save.co >= sk.price ? "" : "disabled"}><i class="flake"></i>${fmt(sk.price)}</button>`;
    return `<div class="skin ${worn ? "worn" : ""}"><i class="orb" style="background:${ORBS[sk.id]}"></i><b>${sk.name}</b>${btn}</div>`;
  }).join("");
  openPanel("skins", `<h2 id="panel-title">Облики кома</h2>${bankHtml()}<div class="skins">${cards}</div>
    <div class="pair" style="grid-template-columns:1fr"><button class="choice" data-action="back">Назад</button></div>`);
}

function creditFinish() {
  if (reward) return;
  const r = (reward = levelReward(level, run, save.up[1]));
  save.kl += run.kills.all;
  tripled = false;
  save.co += r.total;
  setBest(save, level.n, r.mult);
  if (level.n === save.lv && save.lv <= LEVEL_COUNT) save.lv = level.n + 1;
  save.at = Math.min(LEVEL_COUNT, Math.max(save.at, level.n < LEVEL_COUNT ? level.n + 1 : level.n));
  persist();
}
function showFinish() {
  const r = reward;
  const broke = level.finale.kind === "boss" ? true : run.walls.every((w) => w.broken);
  const title = level.finale.kind === "boss" ? "Снеговик повержен!" : broke ? "Крепость разбита!" : "Уровень пройден!";
  const facts = [
    `<span><b>${r.flakes}</b>снежинок</span>`,
    `<span><b>×${r.mult}</b>ступень</span>`,
    r.bonus > 1 ? `<span><b>+${Math.round((r.bonus - 1) * 100)}%</b>бонус</span>` : "",
    `<span><b>+${r.base}</b>за уровень</span>`,
    r.boss ? `<span><b>+${r.boss}</b>за босса</span>` : "",
    r.kills ? `<span><b>${r.kills}</b>${plural(r.kills, "монстр", "монстра", "монстров")}</span>` : "",
    r.quest ? `<span class="done"><b>+${r.quest}</b>задание</span>` : "",
  ].join("");
  const last = level.n >= LEVEL_COUNT;
  openPanel("finish", `<div class="eyebrow"><i></i> УРОВЕНЬ ${level.n} · ${MOUNTAINS[level.mountain].name.toUpperCase()}</div>
    <h2 id="panel-title">${title}</h2>
    <div class="big-mult">×${r.mult}</div>
    <div class="facts">${facts}</div>
    <div class="reward" id="reward"><i class="flake"></i><b class="count">+0</b></div>
    <button class="ad" data-reward="triple" data-action="triple" hidden>×3 снежинки за рекламу</button>
    ${adNotice}
    <button class="primary" data-action="next">${last ? "Все горы пройдены!" : "Дальше"}</button>
    <div class="pair"><button class="choice" data-action="again">Ещё раз</button><button class="choice" data-action="menu">В меню</button></div>`);
  paintCoins();
  $("coins").classList.remove("bump");
  void $("coins").offsetWidth;
  $("coins").classList.add("bump");
  countUp($("reward")?.querySelector(".count"), r.total);
  confetti(r.mult >= 8 || level.boss ? 70 : 40);
}
// награда набегает числом и подпрыгивает
function countUp(el, total) {
  if (!el) return;
  const t0 = performance.now();
  const tick = (now) => {
    const u = Math.min(1, (now - t0) / 900);
    el.textContent = "+" + fmt(Math.round(total * (1 - Math.pow(1 - u, 3))));
    if (u < 1 && el.isConnected) requestAnimationFrame(tick);
    else el.parentElement?.classList.add("pop");
  };
  requestAnimationFrame(tick);
}
// конфетти поверх экрана итога: разноцветные снежинки и звёздочки
function confetti(count) {
  const box = $("confetti");
  box.textContent = "";
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    el.innerHTML = CONFETTI[i % CONFETTI.length];
    el.style.left = `${Math.random() * 100}%`;
    el.style.setProperty("--dx", `${(Math.random() * 2 - 1) * 120}px`);
    el.style.setProperty("--r", `${(Math.random() * 2 - 1) * 540}deg`);
    el.style.animationDelay = `${Math.random() * 0.5}s`;
    el.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    el.style.scale = String(0.6 + Math.random() * 0.8);
    box.append(el);
  }
  clearTimeout(confetti.timer);
  confetti.timer = setTimeout(() => (box.textContent = ""), 4200);
}
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
const adNotice = '<p id="ad-notice" role="status" hidden>Ролик недоступен. Можно попробовать снова.</p>';
function showFail() {
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
    <p>Снежинки зачислены: <b>+${run.coins}</b></p>
    <button class="ad" data-reward="continue" data-action="continue" hidden>Продолжить с этого места за рекламу</button>
    ${level.n >= 2 ? `<button class="ad gun" data-reward="gun" data-action="gun-ad" hidden>Ещё раз со снежной пушкой</button>` : ""}
    ${adNotice}
    <button class="primary" data-action="again">Ещё раз</button>
    <div class="pair" style="grid-template-columns:1fr"><button class="choice" data-action="menu">В меню</button></div>`);
}
function creditFail() {
  if (failCredit) return;
  failCredit = { coins: run.coins, kills: run.kills.all };
  save.co += failCredit.coins;
  save.kl += failCredit.kills;
  persist();
}

$("sheet").addEventListener("click", async (e) => {
  if (adLocked()) return;
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const action = b.dataset.action;
  Sound.unlock();
  Sound.tap();
  if (action === "resume") resume();
  else if (action === "restart") startLevel(level.n);
  else if (action === "menu") toTitle();
  else if (action === "back") {
    closePanel();
    paintTitle();
  } else if (action === "tab") {
    openUpgrades(b.dataset.tab);
  } else if (action === "quality") {
    save.q = Number(b.dataset.q);
    persist();
    view.setQuality(QUALITY[save.q], startTier());
    openSettings();
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
    if (!skinOpen(save, i)) return;
    save.cur = i;
    persist();
    view.setSkin(i);
    openSkins();
  } else if (action === "next" || action === "again") {
    // реклама — только здесь, между уровнями, и не чаще, чем разрешит vk-host
    const n = action === "next" ? Math.min(LEVEL_COUNT, level.n + 1) : level.n;
    if (!(await showAd(b, "interstitial"))) return;
    if (action === "next" && level.n >= LEVEL_COUNT) {
      toTitle();
      banner("Все четыре горы пройдены!", "ПОБЕДА");
      return;
    }
    startLevel(n);
    updateVisibility();
  } else if (action === "triple") {
    if (tripled || !reward) return;
    const ok = await showAd(b, "rewarded");
    if (!ok) return;
    tripled = true;
    save.co += reward.total * 2;
    persist();
    Sound.coin();
    const el = $("reward");
    if (el) el.innerHTML = `<i class="flake"></i>+${fmt(reward.total * 3)}`;
    paintCoins();
    paintRewardButtons();
  } else if (action === "gun-ad") {
    // ролик за награду: тот же уровень заново, а в пушке — снежки с собой
    const ok = await showAd(b, "rewarded");
    if (!ok) return;
    startLevel(level.n, { ammo: AD_AMMO });
    banner(`${AD_AMMO} снежков в пушке!`, "СНЕЖНАЯ ПУШКА", false, "tip", "gun");
    updateVisibility();
  } else if (action === "continue") {
    if (!run.canContinue()) return;
    const ok = await showAd(b, "rewarded");
    if (!ok || !run.continueRun()) return;
    if (failCredit) {
      save.co -= failCredit.coins;
      save.kl -= failCredit.kills;
      failCredit = null;
      persist();
    }
    closePanel();
    resultDelay = null;
    Sound.mood(1);
    finaleShown = run.s >= level.length;
    handleEvents();
    Sound.unlock();
    updateVisibility();
  }
});

// ---------- События заезда ----------
let lastSize = START;
const sizePoint = { x: 0, y: 0, on: false };
const testLog = []; // для проверок в браузере: кто кого и чем победил
function handleEvents() {
  for (const e of run.events) {
    view.event(e, run);
    if (e.type === "kill" || e.type === "pickup") (testLog.push({ type: e.type, kind: e.kind, how: e.how }), testLog.length > 200 && testLog.shift());
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
          slowmo = 0.9;
        } else Sound.bounce();
        break;
      case "kill":
        Sound.kill(e.kind, e.how);
        if (e.gain) floatText("+" + e.gain, "good", false, 24);
        else if (e.how !== "bite") floatText("+" + e.coins, "coin", false, 30);
        break;
      case "bite":
        Sound.bite();
        floatText("−" + e.dmg, "bad", false, -20);
        break;
      case "bonk":
        Sound.bonk();
        floatText("−" + e.dmg, "bad", true);
        break;
      case "drain":
        Sound.drain();
        floatText("−" + e.dmg, "bad", false, Math.random() * 40 - 20);
        break;
      case "pow":
        Sound.pow();
        break;
      case "shot":
        Sound.shot();
        break;
      case "pickup":
        Sound.pickup(e.kind);
        floatText(PICK_NAMES[e.kind], "good", true);
        break;
      case "wave":
        Sound.wave();
        break;
      case "spirit":
        Sound.spirit();
        break;
      case "chase":
        Sound.chase();
        banner("Лавина-йети!", "БЕГИ!", true, "quick", "chase");
        break;
      case "chase-end":
        if (e.caught) {
          Sound.caught();
          floatText("−" + e.dmg, "bad", true);
        } else {
          Sound.escape();
          banner(`Ушёл от лавины! +${e.coins}`, "", false, "quick");
        }
        break;
      case "step":
        Sound.step(e.k);
        floatText("×" + e.k, "good", e.k >= 5);
        break;
      case "won":
        Sound.won();
        Sound.mood(0);
        creditFinish();
        resultDelay = 1.1;
        break;
      case "fail":
        Sound.mood(0);
        creditFail();
        resultDelay = 1.3;
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
  if (screen === "play" && run && !paused && !adLocked() && !document.hidden && !host()?.hidden) {
    // после удара по снеговику мир на миг замирает
    const slow = slowmo > 0 ? 0.3 : 1;
    slowmo = Math.max(0, slowmo - dt);
    let left = dt * speed * slow;
    while (left > 1e-6 && run.mode !== "won" && run.mode !== "fail") {
      const h = Math.min(1 / 60, left);
      run.step(h, input(h));
      left -= h;
      if (run.events.length) handleEvents();
    }
    if (run.events.length) handleEvents();
    // подсказки по очереди: не чаще раза в три секунды
    if (intros.length && run.s > intros[0].at && now - introAt > 3000 && run.mode === "run") {
      const q = intros.shift();
      introAt = now;
      banner(q.text, q.icon ? "НОВОЕ" : "ВНИМАНИЕ", true, "tip", q.icon);
      Sound.hint();
    }
    if (!finaleShown && run.mode === "run" && run.s > level.length - 12) finaleBanner();
    if (resultDelay !== null) {
      resultDelay -= dt;
      if (resultDelay <= 0) {
        resultDelay = null;
        if (run.mode === "won") showFinish();
        else if (run.mode === "fail") showFail();
      }
    }
  }
  if (paused || adLocked()) {
    // на паузе сцена стоит — рисуем редко, только чтобы не пропал кадр после поворота экрана
    if (!view.needsDraw) return;
    view.needsDraw = false;
  }
  view.draw(run, paused || adLocked() ? 0 : dt * (slowmo > 0 ? 0.3 : 1), screen === "title" ? "menu" : "play", ms);
  if (screen === "play") paintHud();
}
// ---------- Оружие, задание и лавина: плашки в левом нижнем углу ----------
const PICK_NAMES = { gun: "Пушка!", spike: "Шипы!", wave: "Волна!", boost: "Рывок!" };
const QUEST_ICON = { imp: "imps", yeti: "yeti", any: "bigyeti" };
function buildGear() {
  const q = level.quest;
  $("gear").innerHTML = `
    <div class="gp chase" hidden><i class="ico">${FOE_ICONS.chase}</i><b>Лавина</b><span class="bar"><i></i></span></div>
    <div class="gp gun" hidden><i class="ico">${FOE_ICONS.gun}</i><b>Пушка</b><span class="bar"><i></i></span></div>
    <div class="gp spike" hidden><i class="ico">${FOE_ICONS.spike}</i><b>Шипы</b><span class="bar"><i></i></span></div>
    ${q ? `<div class="gp quest"><i class="ico">${FOE_ICONS[QUEST_ICON[q.kind]]}</i><b>${QUEST_TEXT[q.kind]}</b><em>0/${q.need}</em></div>` : ""}`;
  gearEls = {};
  for (const k of ["chase", "gun", "spike", "quest"]) gearEls[k] = $("gear").querySelector("." + k);
  gearShown = {};
}
let gearEls = {};
let gearShown = {};
function gearPill(name, on, k, label = null) {
  const el = gearEls[name];
  if (!el) return;
  if (gearShown[name] !== on) {
    el.hidden = !on;
    gearShown[name] = on;
  }
  if (!on) return;
  const bar = el.querySelector(".bar i");
  if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})`;
  if (label !== null) text(el.querySelector("b"), label);
}
function paintGear() {
  if (!gearEls.quest && !level.chases.length && !run.armed && run.spikeT <= 0) return;
  const ch = run.chase;
  gearPill("chase", !!ch, ch ? ch.gap / 14 : 0);
  if (gearEls.chase) gearEls.chase.classList.toggle("close", !!ch && ch.gap < 5);
  gearPill("gun", run.armed, run.gunT > 0 ? run.gunT / run.gunTime : run.ammo / AD_AMMO, run.gunT > 0 ? "Пушка" : `Пушка · ${run.ammo}`);
  gearPill("spike", run.spikeT > 0, run.spikeT / run.spikeTime);
  const q = level.quest;
  if (q && gearEls.quest) {
    const done = run.questDone;
    text(gearEls.quest.querySelector("em"), done ? "✓" : `${run.questProgress}/${q.need}`);
    if (gearEls.quest.classList.contains("done") !== done) {
      gearEls.quest.classList.toggle("done", done);
      if (done) Sound.coin(), banner(`Задание выполнено! +${q.reward}`, "", false, "quick");
    }
  }
}

function paintHud() {
  if (run.s >= 26 || run.mode === "won" || run.mode === "fail") $("hint").hidden = true;
  paintGear();
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

// ---------- Настройки: качество графики ----------
function openSettings() {
  const now = view.perf.tier;
  const opts = QUALITY.map((m, i) => {
    const label = m === "auto" ? `Само · ${TIERS[now].name.toLowerCase()}` : TIERS[m].name;
    const note = m === "auto" ? "по устройству, ниже — если тормозит" : m === "high" ? "тени, свечение, больше снега" : m === "medium" ? "свечение без теней" : "для слабых телефонов";
    return `<button class="opt ${save.q === i ? "on" : ""}" data-action="quality" data-q="${i}"><b>${label}</b><small>${note}</small></button>`;
  }).join("");
  openPanel("settings", `<h2 id="panel-title">Графика</h2><div class="opts">${opts}</div>
    <div class="pair" style="grid-template-columns:1fr"><button class="choice" data-action="back">Назад</button></div>`);
}

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
  state: () => ({ screen, paused, panel, adBusy: adLocked(), mode: run?.mode, s: run?.s, size: run?.size, coins: save.co, lv: save.lv, at: save.at, n: level?.n, fps: fps.value, perf: { ...view.perf }, kills: run?.kills.all, armed: run?.armed, spikeT: run?.spikeT, ammo: run?.ammo }),
  quality: (mode) => view.setQuality(mode, startTier()),
  log: testLog,
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
