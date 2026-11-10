// «Заводной Скок»: заводной зайчик сам едет по верстаку; нажатие — прыжок.
// Перепрыгнуть гайки, винтики и кнопки, забраться на кубики, собрать шестерёнки, доехать до коробки.
// Логика — jump.js (проверяется tests/jump.mjs), трассы — tracks.js, 3D — world.js.
import { World } from "./world.js?v=cc40c0ef";
import { TRACKS } from "./tracks.js?v=cc40c0ef";
import { Run, plan, STEP } from "./jump.js?v=cc40c0ef";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "skok-v1";
function load() {
  const empty = { v: 1, open: 1, best: {}, toys: {}, golden: {}, sound: true, music: true, heard: {}, last: 0 };
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
  shelf: svg('<rect x="6" y="40" width="52" height="8" rx="3" fill="#d9a066"/><circle cx="18" cy="30" r="9" fill="#ff6f8f"/><rect x="30" y="20" width="12" height="20" rx="3" fill="#3fb4ff"/><path d="M48 40l6-18 6 18z" fill="#ffc533"/>'),
  pause: svg('<rect x="16" y="12" width="11" height="40" rx="4" fill="#3f8cff"/><rect x="37" y="12" width="11" height="40" rx="4" fill="#3f8cff"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#3f8cff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#3f8cff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#9aa8b8"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#8f5bff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#8f5bff"/><circle cx="46" cy="40" r="8" fill="#8f5bff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#9aa8b8" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#9aa8b8"/><circle cx="46" cy="40" r="8" fill="#9aa8b8"/><path d="M8 8l48 48" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  close: svg('<path d="M16 16l32 32M48 16 16 48" stroke="#ff4f6d" stroke-width="8" stroke-linecap="round"/>'),
};
for (const id of ["map-open", "to-map", "pause-map"]) el(id).innerHTML = ICON.shelf;
el("map-close").innerHTML = ICON.close;
el("pause").innerHTML = ICON.pause;

// ---------- Звук и голос ----------
function unlock() {
  Sound.unlock();
  if (save.music && !paused) Music.start();
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
  busyUntil = 0;
async function say(id, chain = false, force = true) {
  if (!chain) speakToken++;
  if (!save.sound || !Sound.ctx) return;
  if (!force && performance.now() < busyUntil) return;
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
    busyUntil = performance.now() + buf.duration * 1000;
    Music.duck(buf.duration + 0.2, 0.35);
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
function toast(text) {
  const t = el("toast");
  t.textContent = text;
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
}
function advise(kind) {
  const a = el("advice");
  const text = { earlier: ["⏪", "Прыгай раньше!"], later: ["⏩", "Прыгай позже!"], jump: ["👆", "Тут прыгай!"], again: ["↻", "Ещё раз!"] }[kind] || ["↻", "Ещё раз!"];
  a.innerHTML = `<b>${text[0]}</b>${text[1]}`;
  a.classList.remove("show");
  void a.offsetWidth;
  a.classList.add("show");
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
const plans = new Map();
const planOf = (i) => {
  if (!plans.has(i)) plans.set(i, plan(TRACKS[i]));
  return plans.get(i);
};
let ti = 0,
  track = null,
  P = null,
  run = null,
  mode = "title",
  paused = false,
  acc = 0,
  combo = 0,
  comboAt = 0,
  missAt = new Map(),
  saidBlock = false,
  saidHigh = false;

function startTrack(i, quiet = false) {
  ti = Math.max(0, Math.min(TRACKS.length - 1, i));
  track = TRACKS[ti];
  save.last = ti;
  store();
  P = planOf(ti);
  run = new Run(track, { obs: P.obs });
  run.windowFor = P.windowFor;
  world.setTrack(track, P);
  world.resetBands();
  el("track-name").textContent = `${ti + 1}. ${track.name}`;
  el("progress").innerHTML =
    track.checks.map((c, k) => `<i class="flag" data-k="${k}" style="left:${(c / track.end) * 100}%"></i>`).join("") + `<span class="box">📦</span><span class="me" id="me">🐰</span>`;
  el("gears-all").textContent = "/" + track.gears.length;
  el("result").hidden = true;
  el("paused").hidden = true;
  paused = false;
  acc = 0;
  combo = 0;
  missAt = new Map();
  saidBlock = saidHigh = false;
  mode = quiet ? "title" : "play";
  paintHud();
  if (quiet) {
    el("tap").hidden = true;
    return;
  }
  el("tap").hidden = false;
  // Подсказки голосом
  const seq = [];
  if (!save.heard.hello) {
    save.heard.hello = 1;
    seq.push("hello", "how");
  }
  if (track.training && !save.heard.zone) {
    save.heard.zone = 1;
    seq.push("zone");
  }
  store();
  if (seq.length) speak(...seq);
}
function paintHud() {
  if (!run) return;
  el("gears").textContent = run.got.size;
  el("me").style.left = `${Math.min(100, Math.max(0, (run.hero.x / track.end) * 100))}%`;
  el("progress")
    .querySelectorAll(".flag")
    .forEach((f, k) => f.classList.toggle("on", run.cp > k));
}

// ---------- Ввод: нажатие в любом месте, пробел, ↑, W ----------
const canvas = el("stage");
function press() {
  unlock();
  if (mode !== "play" || paused) return;
  const before = run.state;
  run.press();
  for (const e of run.events.splice(0)) handle(e);
  if (before === "ready" && run.state === "run") el("tap").hidden = true;
}
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  press();
});
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
  if (["Space", "ArrowUp", "KeyW", "Enter"].includes(e.code)) {
    e.preventDefault();
    // Удержание клавиши не прыгает повторно
    if (!e.repeat && el("map").hidden && el("result").hidden) press();
  }
  if (e.code === "Escape" && mode === "play") setPaused(!paused);
});
function setPaused(v) {
  if (mode !== "play") return;
  paused = v;
  el("paused").hidden = !v;
  if (v) Music.stop();
  else if (save.music && Sound.ctx) Music.start();
}
el("pause").onclick = () => {
  unlock();
  Sound.tap();
  setPaused(true);
};
el("resume").onclick = () => {
  unlock();
  Sound.tap();
  setPaused(false);
};
// Смена вкладки: стоп-кадр, звук выключен, после возврата ждём «Дальше»
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "play") setPaused(true);
    Music.stop();
  } else if (save.music && Sound.ctx && !paused && mode !== "title") Music.start();
});

// ---------- События ----------
function handle(e) {
  world.event(e, run);
  if (e.type === "go") {
    Sound.windup();
  } else if (e.type === "jump") {
    Sound.jump();
  } else if (e.type === "land") {
    Sound.land();
  } else if (e.type === "gear") {
    const now = performance.now();
    combo = now - comboAt < 1300 ? combo + 1 : 0;
    comboAt = now;
    Sound.gear(combo);
    const pill = el("gears-pill");
    pill.classList.remove("bump");
    void pill.offsetWidth;
    pill.classList.add("bump");
    if (e.g.y > 1.5 && !saidHigh && !save.heard.high) {
      saidHigh = true;
      save.heard.high = 1;
      store();
      say("high", false, false);
    }
    if (e.n === track.gears.length) {
      toast("Все шестерёнки!");
      say("allGears", false, false);
    }
  } else if (e.type === "check") {
    Sound.flag();
    toast("Флажок!");
    if (!save.heard.flag) {
      save.heard.flag = 1;
      store();
      say("flag", false, false);
    }
  } else if (e.type === "hit") {
    Sound.clank();
    advise(e.advice);
    say(e.advice);
    // Две ошибки у одного места — зелёная полоска «прыгай здесь» остаётся
    const s = P.cover.get(e.o.i) || P.steps.find((q) => q.o === e.o);
    const k = P.steps.indexOf(s);
    if (k >= 0) {
      missAt.set(k, (missAt.get(k) || 0) + 1);
      if (missAt.get(k) >= 2) world.keepBandFor(k);
    }
  } else if (e.type === "respawn") {
    el("tap").hidden = false;
    if (!save.heard.tap) {
      save.heard.tap = 1;
      store();
      setTimeout(() => say("tap", false, false), 200);
    }
  } else if (e.type === "finish") {
    finished();
  }
}
async function finished() {
  if (mode !== "play") return;
  mode = "done";
  el("tap").hidden = true;
  Sound.fanfare();
  const id = track.id,
    got = run.got.size,
    all = track.gears.length;
  const newToy = !save.toys[id];
  const golden = got === all;
  const newGolden = golden && !save.golden[id];
  save.toys[id] = 1;
  if (golden) save.golden[id] = 1;
  save.best[id] = Math.max(save.best[id] || 0, got);
  const opened = ti + 1 >= save.open && ti + 1 < TRACKS.length;
  if (opened) save.open = ti + 2;
  store();
  speak("finish", ...(newToy ? ["toy"] : []), ...(newGolden ? ["golden"] : []), ...(opened ? ["newTrack"] : []));
  await wait(1900);
  showResult({ got, all, newToy, golden, hits: run.hits });
}
function showResult({ got, all, newToy, golden, hits }) {
  mode = "result";
  el("tap").hidden = true;
  el("prize").innerHTML = `<span class="toy">${track.toy}</span>${golden ? '<span class="goldgear">⚙</span>' : ""}`;
  el("result-title").textContent = newToy ? `Новая игрушка: ${track.toyName}!` : "Скок в коробке!";
  const parts = [`Шестерёнок: ${got} из ${all}.`];
  if (golden) parts.push("Золотая шестерёнка за точность!");
  else parts.push("Высокие шестерёнки — в прыжке.");
  if (!hits) parts.push("Ни разу не врезался!");
  el("result-text").textContent = parts.join(" ");
  el("next").hidden = ti >= TRACKS.length - 1;
  el("result").hidden = false;
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  startTrack(ti);
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  startTrack(ti + 1);
};
el("to-map").onclick = () => {
  unlock();
  Sound.tap();
  openMap();
};
el("pause-map").onclick = () => {
  unlock();
  Sound.tap();
  el("paused").hidden = true;
  openMap();
};

// ---------- Полка игрушек и трассы ----------
function openMap() {
  if (mode === "play") {
    paused = true;
    Music.stop();
  }
  el("shelf").innerHTML = TRACKS.map((t) => `<span class="${save.toys[t.id] ? "" : "empty"}" title="${t.toyName}">${t.toy}</span>`).join("");
  const bg = ["linear-gradient(#ffd27a,#ff9f1f)", "linear-gradient(#ff9fc0,#ff5f8f)", "linear-gradient(#c8b0ff,#8f5bff)", "linear-gradient(#6f8fff,#33417e)"];
  el("tracks").innerHTML = TRACKS.map((t, i) => {
    const open = i < save.open,
      best = save.best[t.id];
    return `<button class="trk${i === ti ? " now" : ""}" style="--bg:${bg[i % 4]}" data-track="${i}" ${open ? "" : "disabled"}><span class="ic">${open ? (save.toys[t.id] ? t.toy : "🎁") : "🔒"}</span><b>${t.name}</b><small class="gear-best">${best !== undefined ? `⚙ ${best} из ${t.gears.length}` : open ? "ещё не пройдена" : "закрыта"}</small>${save.golden[t.id] ? '<span class="gold">🏅</span>' : ""}</button>`;
  }).join("");
  el("result").hidden = true;
  el("map").hidden = false;
}
el("map-open").onclick = () => {
  unlock();
  Sound.tap();
  if (mode === "title") el("title").hidden = true;
  openMap();
};
el("map-close").onclick = () => {
  Sound.tap();
  el("map").hidden = true;
  if (mode === "result") el("result").hidden = false;
  else if (mode === "title") startTrack(ti);
  else if (mode === "play") setPaused(true);
};
el("tracks").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  Sound.tap();
  el("map").hidden = true;
  el("title").hidden = true;
  startTrack(+b.dataset.track);
  if (save.music && Sound.ctx) Music.start();
});

// ---------- Каждый кадр ----------
world.onFrame = (dt) => {
  if (!run) return;
  if (mode === "title") {
    world.sync(run, dt);
    world.idle(dt);
    return;
  }
  if ((mode === "play" || mode === "done") && !paused) {
    acc += dt;
    for (let n = 0; acc >= STEP && n < 16; n++) {
      acc -= STEP;
      run.step();
      for (const e of run.events.splice(0)) handle(e);
    }
    if (run.state === "run" && run.hero.ground) Sound.tick();
    // Первый кубик на трассе — подсказка голосом
    if (!saidBlock && !save.heard.block && run.state === "run") {
      const b = P.obs.find((o) => o.solid && o.x0 > run.hero.x && o.x0 - run.hero.x < 8);
      if (b) {
        saidBlock = true;
        save.heard.block = 1;
        store();
        say("block", false, false);
      }
    }
    paintHud();
  } else acc = 0;
  world.sync(run, paused ? 0 : dt);
};

// ---------- Заставка ----------
startTrack(Math.min(save.last || 0, save.open - 1), true);
el("play").onclick = () => {
  unlock();
  Sound.tap();
  el("title").hidden = true;
  startTrack(ti);
};
if (new URLSearchParams(location.search).has("debug"))
  window.skok = {
    world,
    TRACKS,
    get run() {
      return run;
    },
    get P() {
      return P;
    },
    get mode() {
      return mode;
    },
    save,
    startTrack,
    press,
    planOf,
  };
