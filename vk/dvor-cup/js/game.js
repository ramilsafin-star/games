// «Дворовой кубок»: футбол один на один. Кубок — три матча против всё более сильных соперников,
// «Вдвоём» — два игрока на одном экране. Матч — match.js (проверяется tests/match.mjs), 3D — world.js.
import { World, ANIMALS } from "./world.js?v=bb673277";
import { Match, Bot, STEP } from "./match.js?v=bb673277";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "dvorcup3d-v1";
function load() {
  const empty = { v: 1, cups: 0, hero: "fox", sound: true, music: true, heard: {} };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return { ...empty, ...s };
  } catch {}
  return empty;
}
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
};
el("pause").innerHTML = ICON.pause;

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
async function speak(...ids) {
  const token = ++speakToken;
  for (const id of ids) {
    if (token !== speakToken) return;
    await say(id, true);
    await wait(150);
  }
}
function banner(text) {
  const b = el("banner");
  b.textContent = text;
  b.classList.remove("show");
  void b.offsetWidth;
  b.classList.add("show");
}

// ---------- Мир ----------
let world;
try {
  world = new World(el("stage"));
} catch (e) {
  console.warn("3D недоступно", e);
  el("nogl").hidden = false;
  throw e;
}
const pics = {};
const pic = (k) => (pics[k] ??= world.portrait(k));

// Состояние
let mode = "title", // title | pick | ladder | play | paused | result
  kind = "cup", // cup | two
  match = null,
  bots = [null, null],
  heroes = ["fox", "raccoon"],
  stage = 0,
  ladder = [],
  acc = 0,
  lastSecond = 99,
  demo = null;
const LEVEL_OF = ["easy", "mid", "hard"];

// ---------- Демо на заставке: два бота играют сами ----------
function startDemo() {
  const kinds = Object.keys(ANIMALS);
  const a = kinds[Math.floor(Math.random() * kinds.length)];
  let b = kinds[Math.floor(Math.random() * kinds.length)];
  if (b === a) b = kinds[(kinds.indexOf(a) + 1) % kinds.length];
  world.setPlayers([a, b]);
  demo = { m: new Match({ seconds: 9999 }), bots: [new Bot(0, "mid"), new Bot(1, "mid")] };
  match = null;
}

// ---------- Выбор героя ----------
function openPick(slot = 0) {
  mode = "pick";
  el("pick-title").textContent = kind === "two" ? (slot === 0 ? "Игрок слева — выбери футболиста" : "Игрок справа — выбери футболиста") : "Выбери футболиста";
  el("heroes").innerHTML = Object.entries(ANIMALS)
    .map(([k, a]) => `<button class="hero" data-hero="${k}" data-slot="${slot}" ${kind === "two" && slot === 1 && k === heroes[0] ? "disabled" : ""}><img alt="" src="${pic(k)}"><span>${a.name}</span></button>`)
    .join("");
  el("title").hidden = true;
  el("pick").hidden = false;
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
    // Соперники: три других зверька
    const rest = Object.keys(ANIMALS).filter((k) => k !== heroes[0]);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    ladder = rest.slice(0, 3);
    stage = 0;
    el("pick").hidden = true;
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
function openLadder() {
  mode = "ladder";
  el("steps").innerHTML = ladder
    .map((k, i) => `<div class="step${i === stage ? " now" : i < stage ? " done" : ""}"><img alt="" src="${pic(k)}">${ANIMALS[k].name}<small>${["лёгкий", "средний", "сильный"][i]} соперник</small></div>`)
    .join("");
  el("ladder").hidden = false;
  if (stage > 0) say("next");
}
el("go").onclick = () => {
  unlock();
  Sound.tap();
  el("ladder").hidden = true;
  heroes[1] = ladder[stage];
  startMatch();
};

// ---------- Матч ----------
function startMatch() {
  demo = null;
  world.setPlayers(heroes);
  match = new Match({ seconds: 60, golden: kind === "cup" });
  bots = kind === "cup" ? [null, new Bot(1, LEVEL_OF[stage])] : [null, null];
  acc = 0;
  lastSecond = 99;
  el("pic0").src = pic(heroes[0]);
  el("pic1").src = pic(heroes[1]);
  el("board").hidden = false;
  el("pause").hidden = false;
  el("pad0").hidden = false;
  el("pad1").hidden = kind !== "two";
  el("result").hidden = true;
  document.body.style.setProperty("--c0", ANIMALS[heroes[0]].shirt);
  document.body.style.setProperty("--c1", ANIMALS[heroes[1]].shirt);
  mode = "play";
  paintBoard();
  Sound.whistle(false);
  banner("На старт!");
  if (kind === "cup" && !save.heard.how) {
    save.heard.how = 1;
    store();
    say("how");
  }
}
function paintBoard() {
  const m = match;
  el("score").textContent = `${m.score[0]} : ${m.score[1]}`;
  const s = Math.ceil(m.time);
  el("clock").textContent = m.overtime ? "Золотой гол" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  el("clock").classList.toggle("hot", !m.overtime && s <= 10);
  m.players.forEach((p, i) => {
    const bar = el("star" + i);
    bar.style.width = Math.round(p.star * 100) + "%";
    bar.classList.toggle("full", p.star >= 1);
    document.querySelector(`#pad${i} .kick`).classList.toggle("star", p.star >= 1);
  });
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
function updateVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) {
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
  // Дальше матч и звук продолжатся по нажатию игрока.
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);

// ---------- События матча ----------
function handle(e) {
  const m = match;
  if (e.type === "kick") {
    Sound.kick(e.kind === "star" ? 1.6 : 1);
    world.kick(e.p, e.kind);
    if (e.kind === "star") {
      Sound.starShot();
      banner("⭐ Звёздный удар!");
      say("star", false, false);
    } else if (m.players[e.p].star >= 1 && (kind === "two" || e.p === 0)) say("starReady", false, false);
  } else if (e.type === "swing") world.swing(e.p);
  else if (e.type === "header") Sound.header();
  else if (e.type === "bounce") Sound.bounce(e.speed);
  else if (e.type === "bar") {
    Sound.bar();
    world.shake(0.12);
    say("bar", false, false);
  } else if (e.type === "jump") Sound.jump();
  else if (e.type === "land") world.dust(m.players[e.p].x);
  else if (e.type === "stun") {
    Sound.dizzy();
    world.stun(e.p);
  } else if (e.type === "start") {
    Sound.whistle(false);
    banner("Начали!");
  } else if (e.type === "goal") {
    Sound.whistle(false);
    Sound.crowd(2.6);
    Sound.fanfare();
    world.goalScored(e.side, e.star);
    banner("ГОЛ!");
    if (kind === "two") say(e.side === 0 ? "goalLeft" : "goalRight");
    else if (e.side === 0) say(["goal1", "goal2", "goal3"][Math.floor(Math.random() * 3)]);
    else say("goalThem");
  } else if (e.type === "golden") {
    Sound.whistle(false);
    banner("Золотой гол!");
    say("golden");
  } else if (e.type === "over") finishMatch(e.winner);
  paintBoard();
}
async function finishMatch(winner) {
  mode = "result";
  releaseAll();
  Sound.whistle(true);
  el("pause").hidden = true;
  el("pad0").hidden = el("pad1").hidden = true;
  const [a, b] = match.score;
  let title, pictureKind, line, nextLabel;
  if (kind === "two") {
    title = winner === -1 ? "Ничья!" : winner === 0 ? "Победил игрок слева!" : "Победил игрок справа!";
    pictureKind = winner === -1 ? null : heroes[winner];
    line = winner === -1 ? "draw" : winner === 0 ? "leftWin" : "rightWin";
    nextLabel = "Меню ▶";
  } else if (winner === 0) {
    stage++;
    if (stage >= 3) {
      save.cups++;
      store();
      title = "Кубок твой!";
      pictureKind = "cup";
      line = "cup";
      nextLabel = "Меню ▶";
    } else {
      title = "Победа!";
      pictureKind = heroes[0];
      line = "win";
      nextLabel = "Дальше ▶";
    }
  } else {
    title = winner === -1 ? "Ничья!" : "Почти получилось!";
    pictureKind = heroes[1];
    line = winner === -1 ? "draw" : "lose";
    nextLabel = "Ещё раз ▶";
  }
  if (winner === 0 || (kind === "two" && winner !== -1)) {
    Sound.crowd(3);
    for (let k = 0; k < 4; k++) setTimeout(() => world.confetti({ x: -6 + k * 4, y: 6, z: 0 }), k * 250);
  }
  await wait(1100);
  el("result-title").textContent = title;
  el("result-score").textContent = `${a} : ${b}`;
  el("result-pic").innerHTML = pictureKind === "cup" ? "🏆" : pictureKind ? `<img alt="" src="${pic(pictureKind)}">` : "🤝";
  el("next").textContent = nextLabel;
  el("again").hidden = kind === "cup" && winner === 0;
  el("result").hidden = false;
  Sound.fanfare();
  say(line);
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  startMatch();
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  el("result").hidden = true;
  if (kind === "two" || stage >= 3) toTitle();
  else if (match.result === 0) openLadder();
  else startMatch();
};
function toTitle() {
  mode = "title";
  releaseAll();
  el("board").hidden = true;
  el("pause").hidden = true;
  el("pad0").hidden = el("pad1").hidden = true;
  el("result").hidden = true;
  el("title").hidden = false;
  el("cups").textContent = save.cups ? `🏆 Кубков: ${save.cups}` : "";
  startDemo();
}

// ---------- Каждый кадр: шаг матча 1/120 с ----------
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
      }
    }
    world.sync(demo.m, dt);
    return;
  }
  if (!match) return;
  if (mode === "play" || mode === "result") {
    acc += dt;
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
    if (mode === "play" && match.state === "play" && !match.overtime && s !== lastSecond) {
      if (s === 10) say("last10", false, false);
      if (s <= 5 && s > 0) Sound.beep(false);
      lastSecond = s;
      paintBoard();
    }
  }
  world.sync(match, dt);
};

// ---------- Заставка ----------
toTitle();
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
    save,
    keys,
    touch,
    startMatch,
    setKind(k) {
      kind = k;
    },
    setHeroes(a, b) {
      heroes = [a, b];
    },
    // Для проверок: левым игроком управляет бот
    autopilot(level) {
      bots[0] = new Bot(0, level);
    },
  };
