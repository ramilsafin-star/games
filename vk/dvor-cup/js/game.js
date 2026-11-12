// «Дворовой кубок»: футбол один на один. Кубок — лига из трёх кубков (двор, улица, город) с соперниками-характерами
// и испытаниями, «Вдвоём» — два игрока на одном экране, «Испытания» — мини-игры, «Раздевалка» — мячи, форма,
// украшения двора за монетки, «Награды» — значки. Матч — match.js, лига — league.js (проверки в tests/), 3D — world.js.
import { World, ANIMALS, QUALITY, ITEM_COLORS } from "./world.js?v=aaeea594";
import { Match, Bot, STEP, TRIALS } from "./match.js?v=aaeea594";
import { HEROES, LOCKED, TIERS, STYLE_TEXT, stepsFor, SHOP, ACH, migrate, unlockedTier, heroLocked, owns, buy, wear, matchCoins, trialStars, trialCoins, award } from "./league.js?v=aaeea594";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
// Ключ прежний: старые сохранения (кубки, герой, звук) читаются и дополняются новыми полями (league.js → migrate)
const KEY = "dvorcup3d-v1";
function load() {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return migrate(null);
  }
}
await window.vkGameHost?.ready;
const save = load();
function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {}
}

// ---------- Значки ----------
const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const ICON = {
  pause: svg('<rect x="16" y="12" width="11" height="40" rx="4" fill="#1f3a5a"/><rect x="37" y="12" width="11" height="40" rx="4" fill="#1f3a5a"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#3f8cff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#3f8cff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#9aa8b8"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#8f5bff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#8f5bff"/><circle cx="46" cy="40" r="8" fill="#8f5bff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#9aa8b8" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#9aa8b8"/><circle cx="46" cy="40" r="8" fill="#9aa8b8"/><path d="M8 8l48 48" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  gear: svg('<path d="M32 8l5 7 8-3 1 9 8 2-3 8 6 6-7 5 2 8-8 1-2 8-8-3-5 7-5-7-8 3-2-8-8-1 2-8-7-5 6-6-3-8 8-2 1-9 8 3z" fill="#5a6f8a"/><circle cx="32" cy="32" r="9" fill="#fff"/>'),
};
el("pause").innerHTML = ICON.pause;
el("gear").innerHTML = ICON.gear;

// ---------- Звук и голос ----------
function unlock() {
  Sound.unlock();
  if (save.music) Music.start();
}
function paintToggles() {
  el("sound").innerHTML = save.sound ? ICON.soundOn : ICON.soundOff;
  el("sound").setAttribute("aria-label", save.sound ? "Выключить звук" : "Включить звук");
  el("music").innerHTML = save.music ? ICON.musicOn : ICON.musicOff;
  el("music").setAttribute("aria-label", save.music ? "Выключить музыку" : "Включить музыку");
}
Sound.setOn(save.sound);
Music.on = save.music;
paintToggles();
el("sound").onclick = () => {
  save.sound = !save.sound;
  Sound.setOn(save.sound);
  unlock();
  store();
  paintToggles();
};
el("music").onclick = () => {
  save.music = !save.music;
  Music.on = save.music;
  if (save.music) unlock();
  else Music.stop();
  store();
  paintToggles();
};
const recordings = new Map();
let voice = null,
  speakToken = 0,
  voiceBusyUntil = 0;
async function say(id, chain = false, force = true) {
  if (!chain) speakToken++;
  if (!save.sound || !Sound.ctx) return;
  // Во время игры фразы не перебивают друг друга, если не важные
  if (!force && performance.now() < voiceBusyUntil) return;
  if (voice) {
    try {
      voice.stop();
    } catch {}
  }
  const ctx = Sound.ctx;
  try {
    if (!recordings.has(id)) {
      const p = fetch("./voices/" + id + ".mp3")
        .then((r) => {
          if (!r.ok) throw Error("нет записи");
          return r.arrayBuffer();
        })
        .then((d) => ctx.decodeAudioData(d));
      p.catch(() => {});
      recordings.set(id, p);
    }
    const buf = await recordings.get(id);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(Sound.master);
    src.start();
    voice = src;
    voiceBusyUntil = performance.now() + buf.duration * 1000;
    Music.duck(buf.duration + 0.2, 0.3);
    await new Promise((r) => (src.onended = r));
  } catch {}
}
function banner(text) {
  const b = el("banner");
  b.textContent = text;
  b.classList.remove("show");
  void b.offsetWidth;
  b.classList.add("show");
}
// Короткие подсказки и новые значки — плашкой сверху, по очереди
const toasts = [];
let toastBusy = false;
function toast(text) {
  toasts.push(text);
  if (!toastBusy) nextToast();
}
async function nextToast() {
  const t = toasts.shift();
  if (!t) return (toastBusy = false);
  toastBusy = true;
  const b = el("toast");
  b.textContent = t;
  b.classList.remove("show");
  void b.offsetWidth;
  b.classList.add("show");
  await wait(2300);
  nextToast();
}
function flash(strong = false) {
  const f = el("flash");
  f.classList.remove("on", "strong");
  void f.offsetWidth;
  f.classList.add("on");
  if (strong) f.classList.add("strong");
}

// ---------- Мир ----------
let world;
try {
  world = new World(el("stage"), save.q);
} catch (e) {
  console.warn("3D недоступно", e);
  el("nogl").hidden = false;
  throw e;
}
world.setBall(save.ball);
world.setDecor(save.decor);
world.setSky(TIERS[save.tier].sky);
// Авто-качество снизило графику — коротко скажем, почему
world.onQuality = (q) => {
  if (mode === "play") toast(`Графика: ${QUALITY[q].name.toLowerCase()} — для плавности`);
};
world.onBoom = () => Sound.boom();
const pics = {};
const pic = (k) => (pics[k] ??= world.portrait(k));

// Состояние
let mode = "title", // title | pick | ladder | play | paused | result | trials | shop | awards | settings
  kind = "cup", // cup | two | trial
  match = null,
  bots = [null, null],
  heroes = [save.hero, "raccoon"],
  tier = save.tier,
  stage = 0,
  steps = [],
  trialMode = null,
  acc = 0,
  lastSecond = 99,
  demo = null,
  slow = 0, // замедление после гола, секунды
  myGoals = 0,
  last = null, // итог последней игры: { won, trial, cup, coins }
  settingsFrom = "title",
  shopTab = "ball",
  rewardBusy = false;
const TRIAL_ICON = { targets: "🎈", keepy: "⚽", keeper: "🧤" };
const TRIAL_TEXT = {
  targets: "Сбей мячом как можно больше шариков за 40 секунд",
  keepy: "Подбивай мяч головой и не роняй на траву",
  keeper: "Отбей 10 мячей подающей машинки. Навесы лови в прыжке!",
};
const TRIAL_GO = { targets: "Сбей шарики!", keepy: "Чеканка!", keeper: "Лови мячи!" };
const FX_ICON = { speed: "⚡", snow: "❄️", magnet: "🧲", big: "😃" };
const ITEM_TOAST = { star: "⭐ Звёздный удар готов!", speed: "⚡ Молния: бегаешь быстрее!", snow: "❄️ Снежинка: соперник замёрз!", magnet: "🧲 Магнит: мяч липнет к ноге!", big: "😃 Большая голова!" };
const curStep = () => (kind === "cup" ? steps[stage] : null);
const solo = () => match && match.solo;

// ---------- Монетки ----------
function paintCoins() {
  el("coins").textContent = `🪙 ${save.coins}`;
  el("shop-coins").textContent = `🪙 ${save.coins}`;
}
// Число монеток в итогах растёт, а значок подпрыгивает
function countUp(node, from, to, prefix = "+") {
  const t0 = performance.now(),
    dur = Math.min(1200, 250 + (to - from) * 40);
  let lastN = from;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const n = Math.round(from + (to - from) * (1 - (1 - k) * (1 - k)));
    if (n !== lastN) {
      Sound.coin(n);
      lastN = n;
    }
    node.innerHTML = `${prefix}${n} <i>🪙</i>`;
    if (k < 1) requestAnimationFrame(tick);
    else node.classList.add("bump");
  };
  node.classList.remove("bump");
  requestAnimationFrame(tick);
}
function badgesNow(list) {
  for (const a of list) {
    toast(`${a.icon} ${a.name}! +10 🪙`);
    Sound.badge();
  }
}

// ---------- Демо на заставке: два бота играют сами ----------
function startDemo() {
  const kinds = Object.keys(ANIMALS);
  const a = kinds[Math.floor(Math.random() * kinds.length)];
  let b = kinds[Math.floor(Math.random() * kinds.length)];
  if (b === a) b = kinds[(kinds.indexOf(a) + 1) % kinds.length];
  world.setPlayers([a, b]);
  world.setSky(TIERS[save.tier].sky);
  demo = { m: new Match({ seconds: 9999, bonuses: true }), bots: [new Bot(0, "mid"), new Bot(1, "mid", "hunter")] };
  match = null;
}

// ---------- Выбор героя ----------
function openPick(slot = 0) {
  mode = "pick";
  el("pick-title").textContent = kind === "two" ? (slot === 0 ? "Игрок слева — выбери футболиста" : "Игрок справа — выбери футболиста") : "Выбери футболиста";
  el("heroes").innerHTML = HEROES.map((k) => {
    const locked = kind !== "two" && heroLocked(save, k);
    const same = kind === "two" && slot === 1 && k === heroes[0];
    return `<button class="hero${locked ? " locked" : ""}" data-hero="${k}" data-slot="${slot}" ${same || locked ? "disabled" : ""}><img alt="" src="${pic(k)}"><span>${ANIMALS[k].name}</span>${locked ? `<small>🔒 ${TIERS[LOCKED[k]].name}</small>` : ""}</button>`;
  }).join("");
  hideScreens();
  el("pick").hidden = false;
  paintTop();
  if (!save.heard.pick) {
    save.heard.pick = 1;
    store();
    say("pick");
  }
}
el("heroes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  unlock();
  Sound.tap();
  const slot = +b.dataset.slot;
  heroes[slot] = b.dataset.hero;
  if (kind === "cup") {
    save.hero = heroes[0];
    store();
    el("pick").hidden = true;
    setTier(save.tier);
    openLadder();
  } else if (slot === 0) openPick(1);
  else {
    el("pick").hidden = true;
    startMatch();
  }
});
el("mode-cup").onclick = () => {
  unlock();
  Sound.tap();
  kind = "cup";
  document.body.classList.remove("two");
  openPick(0);
};
el("mode-two").onclick = () => {
  unlock();
  Sound.tap();
  kind = "two";
  document.body.classList.add("two");
  openPick(0);
  say("two");
};

// ---------- Лесенка кубка ----------
// Начатый кубок продолжается с того же шага (save.run), другой кубок — с начала
function setTier(t) {
  tier = Math.max(0, Math.min(TIERS.length - 1, t));
  steps = stepsFor(tier, heroes[0]);
  stage = save.run && save.run[0] === tier ? Math.min(save.run[1], steps.length - 1) : 0;
}
function openLadder() {
  mode = "ladder";
  const T = TIERS[tier],
    open = tier <= unlockedTier(save);
  hideScreens();
  world.setSky(T.sky);
  el("tier-name").textContent = T.name;
  el("tier-prev").disabled = tier === 0;
  el("tier-next").disabled = tier === TIERS.length - 1;
  el("tier-sub").textContent = open ? `Приз: 🏆 и ${T.prize} 🪙${save.won[tier] ? ` · выигран ${save.won[tier]} раз` : ""}` : `🔒 Сначала выиграй «${TIERS[tier - 1].name}»`;
  el("steps").innerHTML = steps
    .map((s, i) => {
      const cls = `step${s.trial ? " trial" : ""}${s.boss ? " boss" : ""}${open && i === stage ? " now" : i < stage ? " done" : ""}`;
      return s.trial
        ? `<div class="${cls}"><span class="ico">${TRIAL_ICON[s.trial]}</span>${TRIALS[s.trial].name}<small>испытание</small></div>`
        : `<div class="${cls}"><img alt="" src="${pic(s.rival)}">${ANIMALS[s.rival].name}<small>«${s.nick}»</small></div>`;
    })
    .join("");
  const s = steps[stage];
  el("tip").textContent = !open ? "" : s.trial ? `Испытание: ${TRIAL_TEXT[s.trial]}. Звёзды дают монетки.` : `${ANIMALS[s.rival].name} «${s.nick}» ${STYLE_TEXT[s.style].tag}. Совет: ${STYLE_TEXT[s.style].tip.toLowerCase()}.`;
  el("go").disabled = !open;
  el("go").textContent = s.trial ? "Испытание ▶" : s.boss ? "Финал ▶" : "На поле ▶";
  el("ladder").hidden = false;
  paintTop();
  if (stage > 0 && open) say("next");
}
el("go").onclick = () => {
  unlock();
  Sound.tap();
  el("ladder").hidden = true;
  startMatch();
};
el("tier-prev").onclick = () => {
  Sound.tap();
  setTier(tier - 1);
  openLadder();
};
el("tier-next").onclick = () => {
  Sound.tap();
  setTier(tier + 1);
  openLadder();
};
el("ladder-back").onclick = () => {
  Sound.tap();
  toTitle();
};

// ---------- Матч и испытание ----------
// startMatch запускает текущую игру: матч или испытание (кнопки «На поле», «Ещё раз», «Дальше»)
function startMatch() {
  const step = curStep();
  if (kind === "trial") return beginTrial(trialMode);
  if (step?.trial) return beginTrial(step.trial);
  beginMatch(step);
}
function showPlay() {
  hideScreens();
  el("board").hidden = false;
  el("pause").hidden = false;
  el("pad0").hidden = false;
  el("pad1").hidden = kind !== "two";
  mode = "play";
  acc = 0;
  slow = 0;
  lastSecond = 99;
  myGoals = 0;
  paintTop();
}
function beginMatch(step) {
  demo = null;
  if (step) heroes[1] = step.rival;
  document.body.classList.remove("solo");
  world.setPlayers(heroes, kind === "cup" ? save.kit : "home");
  world.setSky(kind === "cup" ? TIERS[tier].sky : ["day", "sunset", "night"][Math.floor(Math.random() * 3)]);
  match = new Match({ seconds: 60, golden: kind === "cup", bonuses: true });
  bots = kind === "cup" ? [null, new Bot(1, step.level, step.style).setup(match)] : [null, null];
  if (kind === "cup") {
    save.run = [tier, stage];
    store();
  }
  el("pic0").src = pic(heroes[0]);
  el("pic1").src = pic(heroes[1]);
  document.body.style.setProperty("--c0", ANIMALS[heroes[0]].shirt);
  document.body.style.setProperty("--c1", ANIMALS[heroes[1]].shirt);
  showPlay();
  paintBoard();
  Sound.whistle(false);
  banner(step?.boss ? "Финал!" : "На старт!");
  if (kind === "cup" && !save.heard.how) {
    save.heard.how = 1;
    store();
    say("how");
  }
}
function beginTrial(m) {
  demo = null;
  trialMode = m;
  document.body.classList.add("solo");
  world.setPlayers([heroes[0], heroes[0]], save.kit, true);
  world.setSky(kind === "cup" ? TIERS[tier].sky : "day");
  match = new Match({ mode: m });
  bots = [null, null];
  el("pic0").src = pic(heroes[0]);
  document.body.style.setProperty("--c0", ANIMALS[heroes[0]].shirt);
  showPlay();
  paintBoard();
  Sound.whistle(false);
  banner(TRIAL_GO[m]);
}
function paintBoard() {
  const m = match;
  const s = Math.ceil(m.time);
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  if (m.mode === "targets") {
    el("score").textContent = `🎈 ${m.score[0]}`;
    el("clock").textContent = clock;
  } else if (m.mode === "keepy") {
    el("score").textContent = `⚽ ${m.combo}`;
    el("clock").textContent = `рекорд ${m.best} · ${clock}`;
  } else if (m.mode === "keeper") {
    el("score").textContent = `🧤 ${m.score[0]}`;
    el("clock").textContent = `мячей: ${Math.max(0, TRIALS.keeper.shots - m.shot + (m.alive ? 1 : 0))}`;
  } else {
    el("score").textContent = `${m.score[0]} : ${m.score[1]}`;
    el("clock").textContent = m.overtime ? "Золотой гол" : clock;
  }
  el("clock").classList.toggle("hot", m.mode !== "keeper" && !m.overtime && s <= 10);
  m.players.forEach((p, i) => {
    const bar = el("star" + i);
    bar.style.width = Math.round(p.star * 100) + "%";
    bar.classList.toggle("full", p.star >= 1);
    document.querySelector(`#pad${i} .kick`).classList.toggle("star", p.star >= 1);
    // Действующие бонусы — значки у портрета
    const on = Object.entries(p.fx).filter(([, v]) => v > 0);
    const chip = el("fx" + i);
    const text = on.map(([k, v]) => `${FX_ICON[k]}${Math.ceil(v)}`).join(" ");
    if (chip.textContent !== text) chip.textContent = text;
    if (on[0]) chip.style.background = ITEM_COLORS[on[0][0]];
  });
}
function popScore() {
  const sc = el("score");
  sc.classList.remove("pop");
  void sc.offsetWidth;
  sc.classList.add("pop");
}

// ---------- Ввод: экранные кнопки (каждый палец отдельно) и клавиатура ----------
const touch = [{}, {}];
const keys = [{}, {}];
for (const i of [0, 1]) {
  const pad = el("pad" + i);
  const fingers = new Map();
  const set = (btn, on) => {
    touch[i][btn.dataset.k] = on;
    btn.classList.toggle("on", on);
  };
  pad.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    e.preventDefault();
    unlock();
    btn.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, btn);
    set(btn, true);
  });
  const up = (e) => {
    const btn = fingers.get(e.pointerId);
    if (!btn) return;
    fingers.delete(e.pointerId);
    if (![...fingers.values()].includes(btn)) set(btn, false);
  };
  pad.addEventListener("pointerup", up);
  pad.addEventListener("pointercancel", up);
  pad.addEventListener("lostpointercapture", up);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
}
function releaseAll() {
  for (const t of [...touch, ...keys]) for (const k in t) t[k] = false;
  document.querySelectorAll(".btn.on").forEach((b) => b.classList.remove("on"));
}
// Один игрок: стрелки или WASD, прыжок ↑/W/пробел, удар Z/K/F, навес X/L/G.
// Вдвоём: левый — A D W, удар F, навес G; правый — ← → ↑, удар K, навес L
const SOLO = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "jump", KeyW: "jump", Space: "jump", KeyZ: "kick", KeyK: "kick", KeyF: "kick", KeyX: "lob", KeyL: "lob", KeyG: "lob" };
const DUO = [
  { KeyA: "left", KeyD: "right", KeyW: "jump", KeyF: "kick", KeyG: "lob" },
  { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "jump", KeyK: "kick", Period: "kick", KeyL: "lob", Comma: "lob" },
];
function keyAction(code) {
  if (kind === "two") {
    for (const i of [0, 1]) if (DUO[i][code]) return [i, DUO[i][code]];
    return null;
  }
  return SOLO[code] ? [0, SOLO[code]] : null;
}
addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (mode === "play") pause();
    else if (mode === "paused") resume();
    return;
  }
  const a = keyAction(e.code);
  if (a && mode === "play") {
    e.preventDefault();
    unlock();
    keys[a[0]][a[1]] = true;
  }
});
addEventListener("keyup", (e) => {
  const a = keyAction(e.code);
  if (a) keys[a[0]][a[1]] = false;
});
addEventListener("blur", releaseAll);
const merged = (i) => {
  const t = touch[i],
    k = keys[i];
  return { left: t.left || k.left, right: t.right || k.right, jump: t.jump || k.jump, kick: t.kick || k.kick, lob: t.lob || k.lob };
};

// ---------- Пауза ----------
function pause() {
  if (mode !== "play") return;
  mode = "paused";
  releaseAll();
  el("paused").hidden = false;
}
function resume() {
  if (mode !== "paused") return;
  el("paused").hidden = true;
  mode = "play";
  acc = 0;
}
el("pause").onclick = () => {
  unlock();
  pause();
};
el("resume").onclick = () => {
  unlock();
  resume();
};
el("quit").onclick = () => {
  Sound.tap();
  el("paused").hidden = true;
  toTitle();
};
function quiet() {
  pause();
  Music.stop();
  speakToken++;
  if (voice) {
    try {
      voice.stop();
    } catch {}
    voice = null;
  }
  Sound.ctx?.suspend().catch(() => {});
}
function updateVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) quiet();
  // Дальше матч и звук продолжатся по нажатию игрока.
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
// Во время рекламного ролика игра молчит, после него звук возвращается
addEventListener("vk-ad", (e) => {
  if (e.detail.on) quiet();
  else if (!document.hidden && !window.vkGameHost?.hidden) {
    Sound.ctx?.resume().catch(() => {});
    if (save.music) Music.start();
  }
});
// Реклама VK между матчами: не чаще раза в 2 минуты и никогда сразу после запуска
let adBusy = false;
async function adBreak() {
  if (adBusy) return false;
  adBusy = true;
  await window.vkGameHost?.interstitial();
  adBusy = false;
  return true;
}

// ---------- События матча ----------
function handle(e) {
  const m = match;
  const mine = kind === "two" || e.p === 0;
  if (e.type === "kick") {
    Sound.kick(e.kind === "star" ? 1.6 : 1);
    world.kick(e.p, e.kind);
    if (e.kind === "star") {
      Sound.starShot();
      banner("⭐ Звёздный удар!");
      say("star", false, false);
    } else if (!m.solo && m.players[e.p].star >= 1 && mine) say("starReady", false, false);
  } else if (e.type === "swing") world.swing(e.p);
  else if (e.type === "header") {
    if (m.mode !== "keepy") Sound.header();
    world.header(e.x, e.y);
  } else if (e.type === "bounce") Sound.bounce(e.speed);
  else if (e.type === "bar") {
    Sound.bar();
    world.shake(0.12);
    if (!m.solo) say("bar", false, false);
  } else if (e.type === "jump") Sound.jump();
  else if (e.type === "land") world.dust(m.players[e.p].x);
  else if (e.type === "stun") {
    Sound.dizzy();
    world.stun(e.p);
  } else if (e.type === "itemSpawn") Sound.bubble();
  else if (e.type === "item") {
    Sound.item();
    world.itemFx(e.x, e.y, e.kind);
    if (mine) toast(ITEM_TOAST[e.kind]);
    if (kind === "cup" && e.p === 0) {
      save.stats.items++;
      badgesNow(award(save, { type: "item" }));
      store();
    }
  } else if (e.type === "freeze") Sound.freeze();
  else if (e.type === "start") {
    Sound.whistle(false);
    banner(m.solo ? TRIAL_GO[m.mode] : "Начали!");
  } else if (e.type === "goal" && m.mode === "keeper") {
    // Испытание «Вратарь»: мяч пролетел в ворота
    Sound.boing();
    world.shake(0.1);
    banner("Мимо вратаря!");
  } else if (e.type === "goal") {
    Sound.whistle(false);
    Sound.crowd(2.6);
    Sound.fanfare();
    world.goalScored(e.side, e.star);
    // Замедление, вспышка и прыгающий счёт
    if (!world.motion.matches) slow = 0.75;
    flash(e.star);
    popScore();
    banner("ГОЛ!");
    if (kind === "two") say(e.side === 0 ? "goalLeft" : "goalRight");
    else if (e.side === 0) say(["goal1", "goal2", "goal3"][Math.floor(Math.random() * 3)]);
    else say("goalThem");
    if (kind === "cup" && e.side === 0) {
      myGoals++;
      save.stats.goals++;
      badgesNow(award(save, { type: "goal", how: e.how, count: myGoals }));
      store();
    }
  } else if (e.type === "golden") {
    Sound.whistle(false);
    banner("Золотой гол!");
    say("golden");
  } else if (e.type === "pop") {
    Sound.pop();
    Sound.star();
    world.balloonPop(e.x, e.y, e.color);
    popScore();
  } else if (e.type === "juggle") {
    Sound.star();
    popScore();
    if (e.n % 5 === 0) {
      world.wave(world.ballMesh.position, "#ffe066", 2.4, 0.4);
      banner(`${e.n}!`);
    }
  } else if (e.type === "drop") {
    Sound.boing();
    if (e.n >= 3) banner(`Серия ${e.n}!`);
  } else if (e.type === "save") {
    Sound.star();
    popScore();
    if (e.how === "save") {
      world.wave(world.ballMesh.position, "#7fe8ff", 2.6, 0.4);
      banner(["Отбил!", "Поймал!", "Вот это вратарь!"][Math.floor(Math.random() * 3)]);
    }
  } else if (e.type === "launch") {
    Sound.launch();
    world.launchFx();
  } else if (e.type === "over") {
    if (m.solo) finishTrial();
    else finishMatch(e.winner);
  }
  paintBoard();
}

// ---------- Итоги ----------
function resultCard({ title, picture, score, stars = -1, coins = 0, badges = [], note = "", nextLabel, again = true }) {
  el("result-title").textContent = title;
  el("result-score").textContent = score;
  el("result-pic").innerHTML = picture === "cup" ? "🏆" : picture === "draw" ? "🤝" : ANIMALS[picture] ? `<img alt="" src="${pic(picture)}">` : picture;
  const st = el("result-stars");
  st.hidden = stars < 0;
  st.innerHTML = [0, 1, 2].map((i) => `<i class="${i < stars ? "on" : ""}" style="animation-delay:${0.25 + i * 0.22}s">★</i>`).join("");
  const rc = el("result-coins");
  rc.hidden = !coins;
  if (coins) countUp(rc, 0, coins);
  el("result-badges").innerHTML = badges.map((a) => `<span class="chip">${a.icon} ${a.name} <b>+10</b></span>`).join("");
  el("result-note").hidden = !note;
  el("result-note").textContent = note;
  el("next").textContent = nextLabel;
  el("again").hidden = !again;
  el("next").disabled = el("again").disabled = false;
  // В VK: удвоить монетки за ролик — только по нажатию на кнопку, где написана награда
  const host = window.vkGameHost;
  const dbl = el("double");
  dbl.hidden = !(coins > 0 && host?.inVk && host.rewardReady);
  dbl.textContent = `🎬 Ещё +${coins} 🪙 за ролик`;
  dbl.dataset.coins = coins;
  el("result").hidden = false;
  // Табло уходит: счёт и так на карточке
  el("board").hidden = true;
  if (stars >= 0 || coins > 0) confettiCard(Math.max(stars, 1) * 14);
}
el("double").onclick = async () => {
  const host = window.vkGameHost,
    n = +el("double").dataset.coins || 0;
  if (rewardBusy || !host?.inVk || !n) return;
  rewardBusy = true;
  if (last) last.doubled = true;
  el("double").hidden = true;
  el("next").disabled = el("again").disabled = true;
  const ok = await host.rewarded();
  rewardBusy = false;
  el("next").disabled = el("again").disabled = false;
  if (ok) {
    save.coins += n;
    store();
    paintCoins();
    countUp(el("result-coins"), n, n * 2);
    el("result-coins").hidden = false;
    toast(`🎬 Спасибо! +${n} 🪙`);
  }
};
addEventListener("vk-reward-ready", () => {
  const dbl = el("double");
  if (!el("result").hidden && dbl.hidden && +dbl.dataset.coins > 0 && !rewardBusy && window.vkGameHost?.rewardReady && last && !last.doubled) dbl.hidden = false;
});
// Конфетти над карточкой итогов (рисуются в canvas поверх, касания не перехватывают)
const confCanvas = document.createElement("canvas");
confCanvas.className = "card-confetti";
document.body.appendChild(confCanvas);
function confettiCard(n = 30) {
  if (world.motion.matches) return;
  const c = confCanvas,
    x = c.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const cols = ["#ff4f6d", "#ffc533", "#3fdc7a", "#3fb4ff", "#8f5bff", "#ff8f3f"];
  const parts = Array.from({ length: n }, (_, i) => ({ x: innerWidth / 2, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 600, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: cols[i % 6], s: 6 + Math.random() * 6 }));
  let t0 = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - t0) / 1000);
    t0 = now;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of parts) {
      p.vy += 900 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      if (p.y > innerHeight + 20) continue;
      alive++;
      x.save();
      x.translate(p.x, p.y);
      x.rotate(p.r);
      x.fillStyle = p.c;
      x.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
      x.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else x.clearRect(0, 0, innerWidth, innerHeight);
  };
  requestAnimationFrame(tick);
}
// Кубок выигран: кубки, приз, значок, новые герой и кубок
function cupWon() {
  const notes = [];
  save.cups++;
  save.won[tier]++;
  save.coins += TIERS[tier].prize;
  save.run = null;
  const badges = award(save, { type: "cup", tier });
  for (const [k, t] of Object.entries(LOCKED)) if (t === tier && save.won[tier] === 1) notes.push(`Новый футболист: ${ANIMALS[k].name}!`);
  if (tier < TIERS.length - 1 && save.won[tier] === 1) notes.push(`Открыт «${TIERS[tier + 1].name}»!`);
  el("cups").textContent = `🏆 Кубков: ${save.cups}`;
  world.fireworks(6);
  return { badges, notes, prize: TIERS[tier].prize };
}
async function finishMatch(winner) {
  mode = "result";
  releaseAll();
  Sound.whistle(true);
  el("pause").hidden = true;
  el("pad0").hidden = el("pad1").hidden = true;
  const [a, b] = match.score;
  let card;
  last = { won: winner === 0, trial: false, cup: null, doubled: false };
  if (kind === "two") {
    card = {
      title: winner === -1 ? "Ничья!" : winner === 0 ? "Победил игрок слева!" : "Победил игрок справа!",
      picture: winner === -1 ? "draw" : heroes[winner],
      nextLabel: "Меню ▶",
    };
    card.line = winner === -1 ? "draw" : winner === 0 ? "leftWin" : "rightWin";
  } else {
    const won = winner === 0;
    const coins = matchCoins(tier, a, won);
    save.coins += coins;
    if (won) save.stats.wins++;
    const badges = award(save, { type: "match", my: a, their: b, won, golden: match.overtime });
    let cup = null;
    if (won) {
      stage++;
      if (stage >= steps.length) cup = cupWon();
      else save.run = [tier, stage];
    }
    store();
    last.cup = cup;
    if (cup) card = { title: `${TIERS[tier].name} твой!`, picture: "cup", line: "cup", coins: coins + cup.prize, badges: [...badges, ...cup.badges], note: cup.notes.join(" "), nextLabel: tier < TIERS.length - 1 ? "Дальше ▶" : "Меню ▶", again: false };
    else if (won) card = { title: "Победа!", picture: heroes[0], line: "win", coins, badges, nextLabel: "Дальше ▶", again: false };
    else card = { title: winner === -1 ? "Ничья!" : "Почти получилось!", picture: heroes[1], line: winner === -1 ? "draw" : "lose", coins, badges, nextLabel: "Ещё раз ▶" };
  }
  card.score = `${a} : ${b}`;
  if (winner === 0 || (kind === "two" && winner !== -1)) {
    Sound.crowd(3);
    for (let k = 0; k < 4; k++) setTimeout(() => world.confetti({ x: -6 + k * 4, y: 6, z: 0 }), k * 250);
  }
  await wait(1100);
  if (mode !== "result") return;
  resultCard(card);
  paintCoins();
  Sound.fanfare();
  say(card.line);
}
async function finishTrial() {
  mode = "result";
  releaseAll();
  Sound.whistle(true);
  el("pause").hidden = true;
  el("pad0").hidden = el("pad1").hidden = true;
  const m = match.mode,
    score = match.score[0];
  const stars = trialStars(m, score);
  const record = score > save.best[m];
  save.best[m] = Math.max(save.best[m], score);
  const coins = trialCoins(stars);
  save.coins += coins;
  const badges = award(save, { type: "trial", mode: m, score });
  store();
  last = { won: true, trial: true, cup: null, doubled: false };
  if (stars) for (let k = 0; k < stars + 1; k++) setTimeout(() => world.confetti({ x: -6 + k * 4, y: 6, z: 0 }), k * 220);
  await wait(900);
  if (mode !== "result") return;
  const scoreText = m === "targets" ? `Шариков: ${score}` : m === "keepy" ? `Лучшая серия: ${score}` : `Отбито: ${score} из ${TRIALS.keeper.shots}`;
  resultCard({
    title: TRIALS[m].name,
    picture: TRIAL_ICON[m],
    score: scoreText,
    stars,
    coins,
    badges,
    note: record && score > 0 ? "Новый рекорд!" : stars < 3 ? `Для ${stars + 1}-й звезды: ${TRIALS[m].stars[stars]}` : "",
    nextLabel: "Дальше ▶",
  });
  paintCoins();
  if (stars) Sound.fanfare();
  else Sound.boing();
}
el("again").onclick = async () => {
  if (adBusy) return; // во время ролика кнопки молчат, иначе нажатие включило бы звук
  unlock();
  Sound.tap();
  if (!(await adBreak())) return;
  startMatch();
};
el("next").onclick = async () => {
  if (adBusy) return;
  unlock();
  Sound.tap();
  if (!(await adBreak())) return;
  el("result").hidden = true;
  if (kind === "two") return toTitle();
  if (kind === "trial") return openTrials();
  // Испытание в кубке пройдено (любой результат) — следующий шаг
  if (last?.trial) {
    stage++;
    if (stage >= steps.length) last.cup = cupWon();
    else save.run = [tier, stage];
    store();
  }
  if (last?.cup) {
    // Кубок выигран: следующий кубок (если есть) или меню
    if (tier < TIERS.length - 1) {
      save.tier = tier + 1;
      store();
      setTier(save.tier);
      openLadder();
    } else toTitle();
  } else if (last?.won) openLadder();
  else startMatch();
};

// ---------- Испытания из меню ----------
function openTrials() {
  mode = "trials";
  kind = "trial";
  hideScreens();
  world.setSky("day");
  el("trial-cards").innerHTML = Object.entries(TRIALS)
    .map(([k, t]) => {
      const st = trialStars(k, save.best[k]);
      return `<button class="trial-card" data-trial="${k}"><span class="ico">${TRIAL_ICON[k]}</span><b>${t.name}</b><small>${TRIAL_TEXT[k]}</small><span class="mini-stars">${[0, 1, 2].map((i) => `<i class="${i < st ? "on" : ""}">★</i>`).join("")}</span><small>Рекорд: ${save.best[k]} · ★ ${t.stars.join(" · ")}</small></button>`;
    })
    .join("");
  el("trials").hidden = false;
  paintTop();
}
el("mode-trials").onclick = () => {
  unlock();
  Sound.tap();
  heroes[0] = save.hero;
  openTrials();
};
el("trial-cards").addEventListener("click", (e) => {
  const b = e.target.closest("[data-trial]");
  if (!b) return;
  unlock();
  Sound.tap();
  trialMode = b.dataset.trial;
  kind = "trial";
  startMatch();
});
el("trials-back").onclick = () => {
  Sound.tap();
  toTitle();
};

// ---------- Раздевалка ----------
const BALL_LOOK = {
  classic: "radial-gradient(circle at 30% 38%, #ff4f6d 0 7px, transparent 8px), radial-gradient(circle at 70% 32%, #3fb4ff 0 7px, transparent 8px), radial-gradient(circle at 52% 72%, #ffc533 0 8px, transparent 9px), radial-gradient(circle at 35% 30%, #fff, #e8ecf8 60%, #c9d2e8)",
  melon: "repeating-linear-gradient(90deg, #3fae4a 0 9px, #1f6a2a 9px 13px)",
  sun: "radial-gradient(circle at 35% 30%, #fff3a0, #ffc533 55%, #ff8f1f)",
  planet: "radial-gradient(ellipse 12px 8px at 35% 40%, #4fd36a 98%, transparent), radial-gradient(ellipse 9px 6px at 66% 66%, #4fd36a 98%, transparent), radial-gradient(circle at 35% 30%, #7fd0ff, #3f8cff 60%, #2a5ab8)",
};
const KIT_LOOK = { home: null, stripes: "repeating-linear-gradient(90deg, var(--k) 0 8px, #fff 8px 13px)", dots: "radial-gradient(circle, #fff6a8 2px, transparent 3px) 0 0/10px 10px, var(--k)", gold: "linear-gradient(#fff3b0, #ffc533 50%, #d9921a)" };
const DECOR_LOOK = { balloons: "🎈", lights: "✨", fireworks: "🎆" };
function openShop(tab = shopTab) {
  mode = "shop";
  shopTab = tab;
  hideScreens();
  el("shop").hidden = false;
  document.querySelectorAll("#shop-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  const shirt = ANIMALS[save.hero].shirt;
  el("shop-items").innerHTML = SHOP[tab]
    .map((it) => {
      const have = owns(save, it.id);
      const on = tab === "decor" ? save.decor.includes(it.id) : save[tab] === it.id;
      const look =
        tab === "ball"
          ? `<i class="ball-ico" style="background:${BALL_LOOK[it.id]}"></i>`
          : tab === "kit"
            ? `<i class="kit-ico" style="--k:${shirt};background:${KIT_LOOK[it.id] || shirt}"></i>`
            : `<i class="decor-ico">${DECOR_LOOK[it.id]}</i>`;
      const label = !have ? `🪙 ${it.price}` : tab === "decor" ? (on ? "✓ Включено" : "Включить") : on ? "✓ Надето" : "Надеть";
      return `<button class="shop-item${on ? " on" : ""}${have ? "" : save.coins >= it.price ? " can" : " poor"}" data-id="${it.id}">${look}<b>${it.name}</b><span>${label}</span></button>`;
    })
    .join("");
  el("shop-note").textContent = "Монетки дают за голы, победы, испытания и награды.";
  paintCoins();
  paintTop();
}
el("mode-shop").onclick = () => {
  unlock();
  Sound.tap();
  openShop("ball");
};
el("shop-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  Sound.tap();
  openShop(b.dataset.tab);
});
el("shop-items").addEventListener("click", (e) => {
  const b = e.target.closest("[data-id]");
  if (!b) return;
  const id = b.dataset.id;
  if (!owns(save, id)) {
    if (!buy(save, id)) {
      Sound.boing();
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      el("shop-note").textContent = `Не хватает ${SHOP[shopTab].find((it) => it.id === id).price - save.coins} 🪙 — сыграй ещё матч!`;
      return;
    }
    Sound.gift();
    confettiCard(24);
    if (shopTab === "decor" && id === "fireworks") world.fireworks(3);
  } else Sound.tap();
  wear(save, id);
  store();
  world.setBall(save.ball);
  world.setDecor(save.decor);
  // Форма видна на герое в демо-матче за раздевалкой
  if (shopTab === "kit" && demo) world.setPlayers([save.hero, world.players[1]?.kind || "raccoon"], save.kit);
  openShop(shopTab);
});
el("shop-back").onclick = () => {
  Sound.tap();
  toTitle();
};

// ---------- Награды ----------
function openAwards() {
  mode = "awards";
  hideScreens();
  el("awards").hidden = false;
  el("awards-title").textContent = `Награды: ${save.ach.length} из ${ACH.length}`;
  el("badges").innerHTML = ACH.map((a) => {
    const got = save.ach.includes(a.id);
    return `<button class="badge${got ? " got" : ""}" data-ach="${a.id}"><span class="ico">${got ? a.icon : "🔒"}</span><b>${a.name}</b><small>${a.text}</small></button>`;
  }).join("");
  el("stats").textContent = `Голов: ${save.stats.goals} · Побед: ${save.stats.wins} · Кубков: ${save.cups} · Бонусов: ${save.stats.items}`;
  paintTop();
}
// Нажал на значок — внизу написано, как его получить (на телефоне подписи не помещаются)
el("badges").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ach]");
  if (!b) return;
  Sound.tap();
  const a = ACH.find((x) => x.id === b.dataset.ach);
  el("stats").textContent = `${a.icon} ${a.name}: ${a.text.toLowerCase()}${save.ach.includes(a.id) ? " — есть!" : ""}`;
});
el("mode-awards").onclick = () => {
  unlock();
  Sound.tap();
  openAwards();
};
el("awards-back").onclick = () => {
  Sound.tap();
  toTitle();
};

// ---------- Настройки графики ----------
function openSettings(from) {
  settingsFrom = from;
  mode = "settings";
  el("settings").hidden = false;
  const opts = [["auto", "Авто"], ...Object.entries(QUALITY).map(([k, q]) => [k, q.name])];
  el("quality").innerHTML = opts.map(([k, n]) => `<button class="pill${save.q === k ? " on" : ""}" data-q="${k}">${n}</button>`).join("");
  el("quality-now").textContent = `Сейчас: ${QUALITY[world.quality].name.toLowerCase()}${save.q === "auto" ? " (подбирается само)" : ""}`;
  paintTop();
}
el("gear").onclick = () => {
  unlock();
  Sound.tap();
  openSettings("title");
};
el("pause-gear").onclick = () => {
  Sound.tap();
  el("paused").hidden = true;
  openSettings("paused");
};
el("quality").addEventListener("click", (e) => {
  const b = e.target.closest("[data-q]");
  if (!b) return;
  Sound.tap();
  save.q = b.dataset.q;
  store();
  world.setQuality(save.q);
  openSettings(settingsFrom);
});
el("settings-ok").onclick = () => {
  Sound.tap();
  el("settings").hidden = true;
  if (settingsFrom === "paused") {
    mode = "paused";
    el("paused").hidden = false;
  } else toTitle();
};

// ---------- Экраны ----------
function hideScreens() {
  for (const id of ["title", "pick", "ladder", "trials", "shop", "awards", "settings", "result", "paused"]) el(id).hidden = true;
  el("board").hidden = true;
  el("pause").hidden = true;
  el("pad0").hidden = el("pad1").hidden = true;
}
// Монетки и шестерёнка — на спокойных экранах, в игре их место занимает табло
function paintTop() {
  const calm = ["title", "pick", "ladder", "trials", "shop", "awards"].includes(mode);
  el("coins").hidden = !calm;
  el("gear").hidden = mode !== "title";
  paintCoins();
}
// Спокойный экран (меню, выбор, лесенка, испытания, раздевалка, награды, итог) — для баннера VK
function calmScreen() {
  return ["title", "pick", "ladder", "trials", "shop", "awards"].includes(mode) || (mode === "settings" && settingsFrom === "title") || (mode === "result" && !el("result").hidden);
}
function toTitle() {
  mode = "title";
  kind = "cup";
  document.body.classList.remove("two", "solo");
  releaseAll();
  hideScreens();
  el("title").hidden = false;
  el("cups").textContent = save.cups ? `🏆 Кубков: ${save.cups}` : "";
  el("awards-count").textContent = `${save.ach.length}/${ACH.length}`;
  paintTop();
  startDemo();
}

// ---------- Каждый кадр: шаг матча 1/120 с ----------
let boardT = 0;
world.onFrame = (dt) => {
  if (demo) {
    acc += dt;
    for (let n = 0; acc >= STEP && n < 20; n++) {
      acc -= STEP;
      demo.m.step([demo.bots[0].input(demo.m), demo.bots[1].input(demo.m)]);
      for (const e of demo.m.events.splice(0)) {
        if (e.type === "kick") world.kick(e.p, e.kind);
        else if (e.type === "swing") world.swing(e.p);
        else if (e.type === "goal") world.goalScored(e.side, e.star);
        else if (e.type === "item") world.itemFx(e.x, e.y, e.kind);
      }
    }
    world.sync(demo.m, dt);
    return;
  }
  if (!match) return;
  if (mode === "play" || mode === "result") {
    // После гола — короткое замедление
    const k = slow > 0 ? 0.3 : 1;
    slow = Math.max(0, slow - dt);
    acc += dt * k;
    for (let n = 0; acc >= STEP && n < 20; n++) {
      acc -= STEP;
      if (mode === "play" || match.state === "goal") {
        const inp = [0, 1].map((i) => (bots[i] ? bots[i].input(match) : merged(i)));
        match.step(inp);
        for (const e of match.events.splice(0)) handle(e);
      }
    }
    // Последние 10 секунд: голос и пиканье
    const s = Math.ceil(match.time);
    if (mode === "play" && match.state === "play" && !match.overtime && match.mode !== "keeper" && s !== lastSecond) {
      if (s === 10 && !match.solo) say("last10", false, false);
      if (s <= 5 && s > 0) Sound.beep(false);
      lastSecond = s;
    }
    // Табло — десять раз в секунду
    boardT -= dt;
    if (mode === "play" && boardT <= 0) {
      boardT = 0.1;
      paintBoard();
    }
  }
  world.sync(match, dt);
};

// ---------- Заставка ----------
toTitle();
window.vkGameHost?.bannerWhen(calmScreen);
el("title").addEventListener("pointerdown", () => {
  unlock();
  if (!save.heard.hello) {
    save.heard.hello = 1;
    store();
    say("hello");
  }
});
el("portrait-ok").onclick = () => {
  document.body.classList.add("portrait-ok");
  try {
    sessionStorage.setItem("dvorcup-portrait", "1");
  } catch {}
};
try {
  if (sessionStorage.getItem("dvorcup-portrait")) document.body.classList.add("portrait-ok");
} catch {}
if (new URLSearchParams(location.search).has("debug"))
  window.cup = {
    world,
    get match() {
      return match;
    },
    get mode() {
      return mode;
    },
    get stage() {
      return stage;
    },
    get tier() {
      return tier;
    },
    get steps() {
      return steps;
    },
    get kind() {
      return kind;
    },
    save,
    keys,
    touch,
    startMatch,
    store,
    calmScreen,
    setKind(k) {
      kind = k;
    },
    setHeroes(a, b) {
      heroes = [a, b];
    },
    setTier(t) {
      setTier(t);
    },
    // Для проверок: левым игроком управляет бот
    autopilot(level) {
      bots[0] = new Bot(0, level);
    },
  };
