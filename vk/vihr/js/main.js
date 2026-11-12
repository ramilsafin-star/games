// «Вихрь»: экраны, управление, раунд, магазин, звук и связь с VK.
import { MAPS, Round, SKILL_NAMES } from "./rules.js?v=7cc311db";
import { View } from "./view.js?v=7cc311db";
import { Sound } from "./sound.js?v=7cc311db";
import { readStorage, writeStorage } from "./kit.js?v=7cc311db";
import {
  SAVE_KEY, cleanSave, UPGRADES, SKINS, TRAILS, BOTS, upgradeEffects, upgradePrice, buyUpgrade, buyItem, applyResult, progress,
} from "./economy.js?v=7cc311db";

const id = (name) => document.getElementById(name);
const host = () => window.vkGameHost;

// Облачное сохранение VK успевает попасть в localStorage до чтения
await window.vkGameHost?.ready;
let save = load();
function load() {
  try {
    return cleanSave(JSON.parse(readStorage(SAVE_KEY)));
  } catch {
    return cleanSave(null);
  }
}
function store() {
  writeStorage(SAVE_KEY, JSON.stringify(save));
}
Sound.set(!!save.sound);

const canvas = id("stage");
const view = new View(canvas);
let round = null; // текущий раунд (или показ в меню)
let looks = [];
let screen = "load"; // load | menu | count | play | paused | ending | result
let mapIndex = save.map;
let trialSkin = null; // облик на один раунд за рекламу
let speedK = 1; // для проверок: ускорение времени
let lastResult = null;
let rewardUsed = false;
let adBusy = false;

// ---------- Мелочи ----------
const fmt = (d) => d.toFixed(1).replace(".", ",") + " м";
const coinsFmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
function text(el, value) {
  value = String(value);
  if (el.textContent !== value) el.textContent = value;
}
function say(message, small = "", kind = "") {
  const box = id("say");
  box.className = "";
  box.textContent = "";
  if (small) {
    const s = document.createElement("small");
    s.textContent = small;
    box.append(s);
  }
  box.append(message);
  void box.offsetWidth;
  box.className = "show " + kind;
}
function toast(html) {
  const box = id("toast");
  box.innerHTML = html;
  box.classList.remove("show");
  void box.offsetWidth;
  box.classList.add("show");
}

// ---------- Вихри соперников и облик игрока ----------
function playerLook() {
  return SKINS[trialSkin ?? save.skin] || SKINS[0];
}
function pickBots(n, seed) {
  const list = [...BOTS];
  let s = seed;
  for (let k = list.length - 1; k > 0; k--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (k + 1);
    [list[k], list[j]] = [list[j], list[k]];
  }
  return list.slice(0, n);
}
function makeRound(map, seed, demo) {
  const fx = upgradeEffects(save.up);
  const bots = pickBots(MAPS[map].bots.length, seed);
  const r = new Round({
    map, seed, demo,
    player: { name: "Ты", look: 0, auto: demo, skill: "medium", speedMul: fx.speedMul, startR: fx.startR, pullMul: fx.pullMul, duration: fx.duration },
    bots: bots.map((b) => ({ name: b.name, look: b })),
  });
  looks = [playerLook(), ...bots];
  return r;
}
function useRound(r) {
  round = r;
  view.setRound(r, looks);
  view.mode = r.demo ? "menu" : "play";
}

// ---------- Меню ----------
function menu() {
  screen = "menu";
  view.hidePodium();
  trialSkin = null;
  closePanel();
  mapIndex = Math.min(save.map, save.open - 1);
  useRound(makeRound(mapIndex, (Math.random() * 1e9) >>> 0, true));
  document.body.dataset.mode = "menu";
  paintMenu();
}
function paintMenu() {
  const map = MAPS[mapIndex];
  const open = mapIndex < save.open;
  text(id("map-name"), map.name);
  text(id("map-note"), open ? map.note : `Займи место в тройке на карте «${MAPS[mapIndex - 1].name}»`);
  id("map-card").classList.toggle("locked", !open);
  id("map-num").innerHTML = MAPS.map((_, k) => `<i class="${k === mapIndex ? "on" : ""} ${k < save.open ? "" : "shut"} ${save.cups[k] === 1 ? "cup" : ""}"></i>`).join("");
  id("prev-map").disabled = mapIndex === 0;
  id("next-map").disabled = mapIndex === MAPS.length - 1;
  id("play").disabled = !open;
  const best = save.best[mapIndex];
  const cups = save.cups.filter((c) => c === 1).length;
  text(id("record"), best ? `Рекорд здесь: ${fmt(best / 10)} · Кубков ${cups} из ${MAPS.length}` : `Кубков ${cups} из ${MAPS.length} · рекорда на этой карте пока нет`);
  paintCoins();
}
function paintCoins() {
  for (const el of document.querySelectorAll("[data-coins]")) text(el, coinsFmt(save.coins));
}
function changeMap(step) {
  const next = Math.max(0, Math.min(MAPS.length - 1, mapIndex + step));
  if (next === mapIndex) return;
  mapIndex = next;
  if (mapIndex < save.open) {
    save.map = mapIndex;
    store();
  }
  Sound.tap();
  useRound(makeRound(mapIndex, (Math.random() * 1e9) >>> 0, true));
  paintMenu();
}
id("prev-map").onclick = () => changeMap(-1);
id("next-map").onclick = () => changeMap(1);
id("play").onclick = () => {
  if (mapIndex >= save.open) return Sound.nope();
  Sound.tap();
  start(mapIndex);
};
id("open-upgrades").onclick = () => (Sound.tap(), openUpgrades());
id("open-skins").onclick = () => (Sound.tap(), openSkins("skin"));

// ---------- Раунд ----------
let countT = 0, lastCount = 0, endT = 0, hintT = 0, hudT = 0, lastSec = -1, myLifts = 0;
let thumbs = [];
function start(map, seed = (Math.random() * 1e9) >>> 0) {
  closePanel();
  view.hidePodium();
  mapIndex = map;
  save.map = map;
  store();
  useRound(makeRound(map, seed, false));
  thumbs = view.thumbs(map);
  screen = "count";
  countT = 2.4;
  lastCount = 0;
  myLifts = 0;
  lastSec = -1;
  document.body.dataset.mode = "play";
  input.x = input.z = 0;
  stick.on = false;
  paintStick();
  paintNext(true);
  paintBoard(true);
  paintTimer();
  id("toast").classList.remove("show");
  if (save.tips < 3) {
    hintT = 6;
    id("hint").hidden = false;
    text(id("hint"), save.tips === 0 ? (matchMedia("(pointer: coarse)").matches ? "Веди пальцем по экрану — вихрь поедет туда" : "Веди мышью с зажатой кнопкой или жми WASD") : save.tips === 1 ? "Втягивай всё, что меньше тебя, и расти" : "Вихрь крупнее тебя может втянуть — убегай!");
    save.tips++;
    store();
  } else id("hint").hidden = true;
}
function finish() {
  screen = "ending";
  endT = 1.5;
  input.x = input.z = 0;
  stick.on = false;
  paintStick();
  say("Время вышло!", "", "big");
  Sound.beep(true);
}
function showResult() {
  screen = "result";
  const res = (lastResult = round.result());
  const applied = applyResult(save, mapIndex, res);
  res.applied = applied;
  rewardUsed = false;
  store();
  document.body.dataset.mode = "result";
  view.showPodium(res.order.slice(0, 3), looks);
  trialSkin = null; // примерка была на один раунд
  if (res.place <= 3) Sound.fanfare();
  else Sound.sad();
  paintResult();
}
function paintResult() {
  const res = lastResult, a = res.applied;
  const place = res.place;
  const head = place === 1 ? "Первое место!" : place === 2 ? "Второе место!" : place === 3 ? "Третье место!" : `${place} место`;
  const nextMap = mapIndex + 1 < save.open ? mapIndex + 1 : -1;
  const news = [];
  if (a.unlocked >= 0) news.push(`<div class="news good">Открыта новая карта: <b>${MAPS[a.unlocked].name}</b>!</div>`);
  else if (place > 3 && mapIndex === save.open - 1 && save.open < MAPS.length) news.push(`<div class="news">Займи место в тройке, чтобы открыть карту «${MAPS[mapIndex + 1].name}»</div>`);
  if (a.firstWin) news.push(`<div class="news gold">Кубок карты «${MAPS[mapIndex].name}»!</div>`);
  else if (a.newBest) news.push(`<div class="news">Новый рекорд на этой карте</div>`);
  const coins = a.coins.total * (rewardUsed ? 2 : 1);
  const canDouble = canReward() && !rewardUsed;
  id("result").innerHTML = `
    <div class="eyebrow">ИТОГИ РАУНДА · ${MAPS[mapIndex].name.toUpperCase()}</div>
    <h2 class="${place <= 3 ? "win" : ""}">${head}</h2>
    <div class="facts">
      <span><b>${fmt(res.D)}</b>размер</span>
      <span><b>${res.lifted}</b>поднято</span>
      <span><b>${res.ate}</b>втянуто вихрей</span>
    </div>
    <div class="earn"><span class="coin"></span><b id="earned">+${coins}</b>
      <small>за размер и добычу ${a.coins.size} · за место ${a.coins.bonus}${a.coins.hunt ? " · за охоту " + a.coins.hunt : ""}${rewardUsed ? " · ×2" : ""}</small></div>
    ${news.join("")}
    ${canDouble ? `<button class="reward" data-act="double"><span class="play-ico"></span>×2 монеты за рекламу</button>` : ""}
    <div class="row">
      <button class="primary" data-act="next">Дальше<small>${nextMap >= 0 && nextMap !== mapIndex ? MAPS[nextMap].name : "к улучшениям"}</small></button>
      <button class="ghost" data-act="again">Ещё раз</button>
      <button class="ghost" data-act="menu">В меню</button>
    </div>`;
  paintCoins();
}
id("result").addEventListener("click", async (event) => {
  const act = event.target.closest("[data-act]")?.dataset.act;
  if (!act || adBusy || screen !== "result") return;
  Sound.tap();
  if (act === "menu") return menu();
  if (act === "double") return doubleCoins();
  // реклама VK — только здесь, между законченным раундом и следующим шагом
  if (!(await adBreak()) || screen !== "result") return;
  const nextMap = mapIndex + 1 < save.open ? mapIndex + 1 : -1;
  if (act === "again") start(mapIndex);
  else if (act === "next") {
    if (nextMap >= 0) start(nextMap);
    else {
      menu();
      openUpgrades();
    }
  }
  updateVisibility(); // свернули во время ролика — раунд ждёт на паузе
});

// ---------- Пауза ----------
function pause() {
  if (screen !== "play" && screen !== "count") return;
  pausedFrom = screen;
  screen = "paused";
  input.x = input.z = 0;
  stick.on = false;
  paintStick();
  openPanel(`<div class="eyebrow">ПАУЗА</div><h2>Вихрь отдыхает</h2>
    <div class="stack"><button class="primary" data-act="resume">Продолжить</button>
    <button class="ghost" data-act="restart">Заново</button><button class="ghost" data-act="menu">В меню</button></div>`, "pause");
}
let pausedFrom = "play";
function resume() {
  if (screen !== "paused") return;
  closePanel();
  screen = pausedFrom;
  Sound.unlock();
}
id("pause").onclick = () => (Sound.tap(), pause());

// ---------- Панели: пауза, улучшения, облики ----------
let panelKind = "";
function openPanel(html, kind = "") {
  panelKind = kind;
  id("panel-body").innerHTML = html;
  id("panel-body").classList.toggle("narrow", kind === "pause");
  document.body.classList.add("panel-open");
  id("panel").hidden = false;
  id("panel-body").scrollTop = 0;
}
function closePanel() {
  document.body.classList.remove("panel-open");
  id("panel").hidden = true;
  panelKind = "";
}
const ICONS = {
  speed: '<svg viewBox="0 0 24 24"><path d="M3 12h9M5 7h8M5 17h8M14 5l7 7-7 7"/></svg>',
  start: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>',
  pull: '<svg viewBox="0 0 24 24"><path d="M6 4v7a6 6 0 0 0 12 0V4M6 4h3v7a3 3 0 0 0 6 0V4h3"/></svg>',
  time: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
};
function openUpgrades() {
  const rows = UPGRADES.map((u) => {
    const level = save.up[u.id], max = u.prices.length, price = upgradePrice(save, u.id);
    const pips = Array.from({ length: max }, (_, k) => `<i class="${k < level ? "on" : ""}"></i>`).join("");
    const fx = upgradeEffects(save.up);
    const now = { speed: `+${Math.round((fx.speedMul - 1) * 100)}%`, start: fmt(fx.startR * 2), pull: `+${Math.round((fx.pullMul - 1) * 100)}%`, time: `${fx.duration} с` }[u.id];
    const btn = price === null ? `<button class="buy done" disabled>Макс.</button>` : `<button class="buy" data-up="${u.id}" ${save.coins < price ? "disabled" : ""}><span class="coin"></span>${price}</button>`;
    return `<div class="up"><span class="ico">${ICONS[u.id]}</span><div class="what"><b>${u.name}</b><small>${u.note} · сейчас ${now}</small><div class="pips">${pips}</div></div>${btn}</div>`;
  }).join("");
  openPanel(`<div class="head"><div><div class="eyebrow">МАСТЕРСКАЯ</div><h2>Улучшения</h2></div><div class="wallet"><span class="coin"></span><b data-coins>${coinsFmt(save.coins)}</b></div></div>
    <div class="ups">${rows}</div>
    <div class="stack solo"><button class="primary" data-act="close">Готово</button></div>`, "up");
}
function swatch(s) {
  if (s.mode === 1) return "conic-gradient(#ff5a5a,#ffa63a,#ffe04a,#5ad86a,#4ab8ff,#a87aff,#ff5a5a)";
  if (s.mode === 3) return `repeating-linear-gradient(135deg,${s.a} 0 8px,${s.b} 8px 16px)`;
  return `linear-gradient(180deg,${s.b},${s.a})`;
}
let skinTab = "skin";
function openSkins(tab = skinTab) {
  skinTab = tab;
  const list = tab === "skin" ? SKINS : TRAILS;
  const owned = tab === "skin" ? save.skins : save.trails;
  const chosen = tab === "skin" ? save.skin : save.trail;
  const cards = list.map((s) => {
    const have = owned.includes(s.id);
    const look = tab === "skin" ? `<i class="sw" style="background:${swatch(s)}"></i>` : `<i class="sw trail" style="background:radial-gradient(circle at 30% 40%,${s.colors[0]} 0 18%,transparent 19%),radial-gradient(circle at 65% 60%,${s.colors[1 % s.colors.length]} 0 14%,transparent 15%),radial-gradient(circle at 45% 78%,${s.colors[2 % s.colors.length]} 0 10%,transparent 11%),#eef2ff"></i>`;
    let act;
    if (have) act = s.id === chosen ? `<span class="tag on">Выбран</span>` : `<button class="buy" data-pick="${s.id}">Выбрать</button>`;
    else act = `<button class="buy" data-buy="${s.id}" ${save.coins < s.price ? "disabled" : ""}><span class="coin"></span>${s.price}</button>`;
    const trial = !have && tab === "skin" && canReward() && trialSkin !== s.id ? `<button class="try" data-try="${s.id}"><span class="play-ico"></span>на раунд</button>` : trialSkin === s.id ? `<span class="tag">на раунд</span>` : "";
    return `<div class="skin ${s.id === chosen ? "chosen" : ""}">${look}<b>${s.name}</b>${act}${trial}</div>`;
  }).join("");
  openPanel(`<div class="head"><div><div class="eyebrow">ГАРДЕРОБ ВИХРЯ</div><h2>Облики</h2></div><div class="wallet"><span class="coin"></span><b data-coins>${coinsFmt(save.coins)}</b></div></div>
    <div class="tabs"><button data-tab="skin" class="${tab === "skin" ? "on" : ""}">Вихри</button><button data-tab="trail" class="${tab === "trail" ? "on" : ""}">Следы</button></div>
    <div class="skins">${cards}</div>
    <div class="stack solo"><button class="primary" data-act="close">Готово</button></div>`, "skins");
}
id("panel-body").addEventListener("click", async (event) => {
  if (adBusy) return;
  const b = event.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.act === "resume") return resume();
  if (d.act === "restart") return (Sound.tap(), start(mapIndex));
  if (d.act === "menu") return (Sound.tap(), menu());
  if (d.act === "close") return (Sound.tap(), closePanel(), paintMenu());
  if (d.up) {
    if (buyUpgrade(save, d.up)) {
      store();
      Sound.buy();
      if (round?.demo) useRound(makeRound(mapIndex, (Math.random() * 1e9) >>> 0, true));
    } else Sound.nope();
    return openUpgrades();
  }
  if (d.tab) return (Sound.tap(), openSkins(d.tab));
  if (d.buy !== undefined || d.pick !== undefined) {
    const idn = Number(d.buy ?? d.pick);
    if (d.buy !== undefined) {
      if (!buyItem(save, skinTab, idn)) return Sound.nope();
      Sound.buy();
    } else {
      if (skinTab === "skin") save.skin = idn;
      else save.trail = idn;
      Sound.tap();
    }
    if (skinTab === "skin") trialSkin = null;
    store();
    looks[0] = playerLook();
    view.setPlayerLook(looks[0]);
    return openSkins();
  }
  if (d.try !== undefined) {
    // примерка облика на один раунд — за ролик; купить его можно и без рекламы
    const idn = Number(d.try);
    if (!canReward()) return;
    adBusy = true;
    let ok = false;
    try {
      ok = await host().rewarded();
    } finally {
      adBusy = false;
    }
    if (ok) {
      trialSkin = idn;
      looks[0] = playerLook();
      view.setPlayerLook(looks[0]);
      toast(`Облик «${SKINS[idn].name}» — на следующий раунд`);
    }
    openSkins();
  }
});

// ---------- Звук ----------
function paintSound() {
  const b = id("sound");
  b.setAttribute("aria-pressed", String(!!save.sound));
  b.setAttribute("aria-label", save.sound ? "Выключить звук" : "Включить звук");
}
id("sound").onclick = () => {
  if (adBusy) return;
  save.sound = save.sound ? 0 : 1;
  store();
  Sound.set(!!save.sound);
  if (save.sound) Sound.unlock();
  paintSound();
  Sound.tap();
};
paintSound();

// ---------- Управление: палец, мышь, клавиши ----------
const input = { x: 0, z: 0 };
const stick = { on: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
const keys = new Set();
const DIRS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
const steering = () => screen === "play" || screen === "count";
canvas.addEventListener("pointerdown", (e) => {
  if (!steering() || stick.on) return;
  stick.on = true;
  stick.id = e.pointerId;
  stick.x = e.clientX;
  stick.y = e.clientY;
  stick.dx = stick.dy = 0;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  paintStick();
});
canvas.addEventListener("pointermove", (e) => {
  if (!stick.on || e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
  const R = stickRadius(), len = Math.hypot(dx, dy);
  // палец ушёл дальше круга — круг едет за ним
  if (len > R) {
    stick.x += (dx / len) * (len - R);
    stick.y += (dy / len) * (len - R);
    dx = e.clientX - stick.x;
    dy = e.clientY - stick.y;
  }
  stick.dx = dx;
  stick.dy = dy;
  paintStick();
});
const lift = (e) => {
  if (e.pointerId !== stick.id) return;
  stick.on = false;
  stick.id = -1;
  paintStick();
};
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, lift);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
const stickRadius = () => Math.max(38, Math.min(60, Math.min(innerWidth, innerHeight) * 0.11));
function paintStick() {
  const el = id("stick");
  el.hidden = !stick.on;
  if (!stick.on) return;
  el.style.transform = `translate(${stick.x}px, ${stick.y}px)`;
  id("knob").style.transform = `translate(${stick.dx}px, ${stick.dy}px)`;
}
addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (screen === "play" || screen === "count") pause();
    else if (screen === "paused") resume();
    return;
  }
  if (e.code === "Enter" && screen === "menu" && id("panel").hidden && !e.target.closest?.("button")) id("play").click();
  if (DIRS[e.code] && steering()) {
    e.preventDefault();
    keys.add(e.code);
    Sound.unlock();
  }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
function readInput() {
  let x = 0, z = 0;
  for (const k of keys) {
    x += DIRS[k][0];
    z += DIRS[k][1];
  }
  if (x || z) {
    const l = Math.hypot(x, z);
    return [x / l, z / l];
  }
  if (stick.on) {
    const R = stickRadius(), l = Math.hypot(stick.dx, stick.dy);
    if (l < 6) return [0, 0];
    const m = Math.min(1, l / (R * 0.75));
    return [(stick.dx / l) * m, (stick.dy / l) * m];
  }
  return [0, 0];
}

// ---------- VK: сворачивание, реклама ----------
function quiet() {
  if (screen === "play" || screen === "count") pause();
  Sound.hush();
}
function updateVisibility() {
  if (document.hidden || host()?.hidden) quiet();
  // звук и раунд продолжатся только по нажатию игрока
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
addEventListener("vk-ad", (e) => {
  if (e.detail?.on) {
    adBusy = true;
    quiet();
  } else if (!document.hidden && !host()?.hidden && save.sound) Sound.unlock();
});
addEventListener("vk-reward-ready", () => {
  if (screen === "result") paintResult();
  if (panelKind === "skins") openSkins();
});
// пока идёт ролик, нажатия и клавиши до игры не доходят
for (const type of ["pointerdown", "pointerup", "click", "keydown", "touchstart"]) {
  addEventListener(
    type,
    (e) => {
      if (!adBusy) return;
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    },
    { capture: true, passive: false },
  );
}
// любое нажатие возвращает звук (браузеры требуют жеста игрока)
addEventListener("pointerdown", () => {
  if (save.sound && !document.hidden && !host()?.hidden && screen !== "paused") Sound.unlock();
});
const canReward = () => !!(host()?.inVk && host().rewardReady);
async function adBreak() {
  if (adBusy) return false;
  adBusy = true;
  try {
    await host()?.interstitial?.();
  } catch {}
  adBusy = false;
  return true;
}
async function doubleCoins() {
  if (adBusy || rewardUsed || !canReward() || !lastResult) return;
  adBusy = true;
  let ok = false;
  try {
    ok = await host().rewarded();
  } catch {}
  adBusy = false;
  if (ok && !rewardUsed && screen === "result") {
    rewardUsed = true;
    const extra = lastResult.applied.coins.total;
    save.coins += extra;
    save.earned += extra;
    store();
    Sound.buy();
    paintResult();
  }
}

// ---------- Приборы раунда ----------
function paintTimer() {
  const left = Math.max(0, Math.ceil(round.duration - round.t));
  text(id("time"), `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
  id("timer").classList.toggle("hurry", left <= 10 && screen === "play");
}
let boardRows = [];
function paintBoard(force) {
  const order = round.standings();
  const box = id("board");
  if (force || boardRows.length !== order.length) {
    box.innerHTML = order.map(() => `<li><i></i><span></span><b></b></li>`).join("");
    boardRows = [...box.children];
  }
  order.forEach((T, k) => {
    const li = boardRows[k];
    li.className = (T.player ? "me" : "") + (T.alive ? "" : " gone");
    li.children[0].style.background = looks[T.i].a;
    text(li.children[1], `${k + 1}. ${T.player ? "Ты" : T.name}`);
    text(li.children[2], fmt(T.R * 2));
  });
  const P = round.player, place = order.indexOf(P) + 1;
  text(id("me"), `${place} место · ${fmt(P.R * 2)}`);
}
function paintNext(force) {
  const P = round.player, kinds = round.kinds;
  const k = P.next;
  const box = id("next");
  if (k >= kinds.length) {
    if (force || box.dataset.k !== "max") {
      box.dataset.k = "max";
      box.innerHTML = `<span class="label">Тебе по силам всё на карте!</span>`;
    }
    return;
  }
  if (force || box.dataset.k !== String(k)) {
    box.dataset.k = String(k);
    box.innerHTML = `<img alt="" src="${thumbs[k]}"><div><span class="label">Дальше: <b>${kinds[k].name}</b></span><div class="bar"><i id="next-fill"></i></div></div>`;
  }
  const prev = k > 0 ? kinds[k - 1].need : 0;
  const lo = Math.min(prev, P.startR2 ** 0.5), need = kinds[k].need;
  const v = Math.max(0, Math.min(1, (P.r2 - lo * lo) / (need * need - lo * lo)));
  id("next-fill").style.transform = `scaleX(${v.toFixed(3)})`;
}
// стрелки к соперникам за краем экрана
const arrows = [];
let hudRects = [], rectsT = 0;
function paintArrows() {
  const box = id("arrows");
  if (performance.now() > rectsT) {
    rectsT = performance.now() + 500;
    hudRects = [id("board").getBoundingClientRect(), id("next").getBoundingClientRect()];
  }
  const P = round.player;
  const W = innerWidth, Hh = innerHeight;
  round.tornados.forEach((T, k) => {
    if (T.player) return;
    let a = arrows[k];
    if (!a) {
      a = arrows[k] = document.createElement("i");
      box.append(a);
    }
    if (!T.alive || screen !== "play") return void (a.hidden = true);
    const p = view.project(T.x, T.R * 1.5, T.z);
    const m = 26, top = 70, bottom = 78;
    // видно на экране (хоть у самого края) — стрелка не нужна
    const inside = p.x > 8 && p.x < W - 8 && p.y > 8 && p.y < Hh - 8 && !p.behind;
    const far = Math.hypot(T.x - P.x, T.z - P.z) > 90;
    if (inside || far) return void (a.hidden = true);
    a.hidden = false;
    const cx = W / 2, cy = (top + Hh - bottom) / 2;
    let dx = p.x - cx, dy = p.y - cy;
    if (p.behind) (dx = -dx), (dy = -dy);
    const s = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), ((Hh - top - bottom) / 2) / Math.abs(dy || 1e-6));
    const x = cx + dx * s;
    let y = cy + dy * s;
    // не налезать на таблицу и подсказку о следующем предмете
    for (const r of hudRects) if (x > r.left - 14 && x < r.right + 14 && y > r.top - 14 && y < r.bottom + 14) y = r.top > Hh / 2 ? r.top - 16 : r.bottom + 16;
    const danger = T.R >= P.R * 1.18, food = P.R >= T.R * 1.18;
    a.className = danger ? "danger" : food ? "food" : "";
    a.style.background = looks[T.i].a;
    a.style.transform = `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx)}rad)`;
  });
}

// ---------- События раунда ----------
function handleEvents() {
  const ev = round.events;
  for (let n = 0; n < ev.length; n++) {
    const e = ev[n];
    if (e.type === "lift") {
      const o = round.objs[e.o];
      view.onLift(o);
      if (e.by === 0 && !round.demo) {
        myLifts++;
        const kind = round.kinds[o.k];
        Sound.pop(kind.size);
        if (kind.voice && Math.random() < 0.45) Sound.voice(kind.voice);
      }
    } else if (e.type === "back") view.onBack(round.objs[e.o]);
    else if (e.type === "eat") {
      view.onEat(e);
      if (round.demo) continue;
      const A = round.tornados[e.by], B = round.tornados[e.victim];
      if (e.by === 0) {
        Sound.gulp();
        say(`Втянут «${B.name}»!`, "ОХОТА", "good");
      } else if (e.victim === 0) {
        Sound.swallowed();
        say("Вернёшься через 3 секунды", `ТЕБЯ ВТЯНУЛ «${A.name.toUpperCase()}»`, "bad");
      }
    } else if (e.type === "respawn") {
      view.onRespawn(round.tornados[e.who]);
      if (e.who === 0 && !round.demo) Sound.respawn();
    } else if (e.type === "unlock" && !round.demo) {
      const kind = round.kinds[e.k];
      Sound.unlockKind();
      toast(`<img alt="" src="${thumbs[e.k]}"><span><small>Теперь по силам</small>${kind.name}</span>`);
    } else if (e.type === "end") finish();
  }
  ev.length = 0;
}

// ---------- Главный цикл ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  const frameMs = now - last;
  last = now;
  if (screen === "load") return;
  const dt = raw * speedK;
  if (screen === "count") {
    countT -= dt;
    const n = Math.ceil(countT / 0.8);
    if (n !== lastCount && n > 0) {
      lastCount = n;
      say(String(n), "", "count");
      Sound.beep(false);
    }
    if (countT <= 0) {
      screen = "play";
      say("Вперёд!", "", "count");
      Sound.beep(true);
    }
  }
  if (screen === "play" || screen === "menu") {
    if (screen === "play") {
      const [x, z] = readInput();
      if (!round.player.auto) round.steer(x, z);
    }
    // шаги правил не длиннее 1/60 с
    let left = dt;
    while (left > 1e-6) {
      const step = Math.min(left, 1 / 60);
      round.step(step);
      left -= step;
      if (round.mode !== "play") break;
    }
    handleEvents();
  }
  if (screen === "ending") {
    endT -= raw;
    if (endT <= 0) showResult();
  }
  if (screen === "play" || screen === "count" || screen === "ending" || screen === "paused") {
    hudT -= raw;
    if (hudT <= 0) {
      hudT = 0.15;
      paintBoard();
      paintNext();
    }
    paintTimer();
    if (screen === "play") {
      const left = Math.ceil(round.duration - round.t);
      if (left <= 10 && left !== lastSec && left > 0) Sound.tick();
      lastSec = left;
    }
    paintArrows();
  }
  if (hintT > 0) {
    hintT -= raw;
    if (hintT <= 0 || (screen === "play" && round.t > 5 && (save.tips > 1 || myLifts > 6))) {
      hintT = 0;
      id("hint").hidden = true;
    }
  }
  const P = round?.player;
  if (P) Sound.wind(P.R, Math.min(1, Math.hypot(P.vx, P.vz) / 10), screen === "play" || screen === "count");
  // в меню и на итогах вихрь сдвинут от панели
  const portrait = innerHeight > innerWidth * 1.05;
  let shift = { x: 0, y: 0 };
  if (screen === "menu") shift = portrait ? { x: 0, y: -0.2 } : { x: 0.2, y: 0 };
  if (screen === "result") shift = portrait ? { x: 0, y: -0.27 } : { x: -0.24, y: 0 };
  view.render(raw * (screen === "paused" ? 0 : 1) * (screen === "ending" ? 0.35 : 1) * speedK, {
    frameMs: screen === "play" ? frameMs : undefined,
    trail: save.trail,
    shift,
  });
}

addEventListener("resize", () => view.resize());

// ---------- Для проверок ----------
window.vihr = {
  view, Sound,
  get round() {
    return round;
  },
  get save() {
    return save;
  },
  get screen() {
    return screen;
  },
  state: () => ({ screen, map: mapIndex, t: round?.t, place: round?.place(), D: round ? round.player.R * 2 : 0, coins: save.coins, quality: view.quality, adBusy }),
  auto(on = true) {
    if (round) round.player.auto = on;
  },
  speed(k) {
    speedK = k;
  },
  start: (map = mapIndex, seed) => start(map, seed),
  finish() {
    if (round && !round.demo) round.t = round.duration - 0.05;
  },
  give(coins) {
    save.coins += coins;
    store();
    paintCoins();
  },
  reset() {
    save = cleanSave(null);
    store();
    menu();
  },
};

// ---------- Запуск ----------
try {
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
} catch {}
menu();
view.resize();
requestAnimationFrame(frame);
id("load").hidden = true;
document.body.classList.add("ready");
