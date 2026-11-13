await window.vkGameHost?.ready;
// «Колесо огоньков»: колесо обозрения крутится, енотик Фоня бросает огоньки снизу.
// Нажатие — огонёк летит 0,18 с и садится на обод внизу. Занято рядом — отскок, место встречи видно.
// Все огоньки на колесе — колесо и парк загораются. Логика — wheel.js (tests/wheel.mjs), уровни — levels.js.
import { World, LIGHTS } from "./world.js?v=c0baf5a6";
import { LEVELS } from "./levels.js?v=c0baf5a6";
import { Wheel } from "./wheel.js?v=c0baf5a6";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "koleso-v1";
function load() {
  const empty = { v: 1, open: 1, stars: {}, lit: {}, sound: true, music: true, heard: {}, last: 0 };
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
  park: svg('<circle cx="32" cy="28" r="20" fill="none" stroke="#ff6fa8" stroke-width="5"/><path d="M32 28 L32 8M32 28L49 38M32 28L15 38" stroke="#ffc533" stroke-width="4"/><path d="M18 58 32 28 46 58" fill="none" stroke="#3f8cff" stroke-width="5" stroke-linejoin="round"/>'),
  pause: svg('<rect x="16" y="12" width="11" height="40" rx="4" fill="#3f8cff"/><rect x="37" y="12" width="11" height="40" rx="4" fill="#3f8cff"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#3f8cff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#3f8cff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#9aa8b8"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#8f5bff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#8f5bff"/><circle cx="46" cy="40" r="8" fill="#8f5bff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#9aa8b8" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#9aa8b8"/><circle cx="46" cy="40" r="8" fill="#9aa8b8"/><path d="M8 8l48 48" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  close: svg('<path d="M16 16l32 32M48 16 16 48" stroke="#ff4f6d" stroke-width="8" stroke-linecap="round"/>'),
};
for (const id of ["map-open", "to-map", "pause-map"]) el(id).innerHTML = ICON.park;
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

// ---------- Мир ----------
let world;
try {
  world = new World(el("stage"));
} catch (e) {
  console.warn("3D недоступно", e);
  el("nogl").hidden = false;
  throw e;
}
world.onFirework = () => Sound.firework();
let li = 0,
  level = null,
  wheel = null,
  mode = "title",
  paused = false,
  assist = false,
  bumpsHere = 0,
  turnSaid = false,
  lastSaid = false;

function startLevel(i, quiet = false) {
  li = Math.max(0, Math.min(LEVELS.length - 1, i));
  level = LEVELS[li];
  save.last = li;
  store();
  wheel = new Wheel(level);
  world.setLevel(level, wheel, li);
  el("level-name").textContent = `${li + 1}. ${level.name}`;
  el("result").hidden = true;
  el("paused").hidden = true;
  paused = false;
  assist = !!level.assist;
  bumpsHere = 0;
  turnSaid = lastSaid = false;
  mode = quiet ? "title" : "play";
  paintHud();
  el("tap").hidden = quiet;
  if (quiet) return;
  const seq = [];
  if (!save.heard.hello) {
    save.heard.hello = 1;
    seq.push("hello", "how");
  }
  if (assist && !save.heard.ring) {
    save.heard.ring = 1;
    seq.push("ring");
  }
  store();
  if (seq.length) speak(...seq);
}
function paintHud() {
  if (!wheel) return;
  const placed = level.supply - wheel.left;
  el("lamps").innerHTML = Array.from({ length: level.supply }, (_, k) => `<i class="${k < placed ? "on" : ""}" style="--c:${LIGHTS[k % LIGHTS.length]}"></i>`).join("");
  el("balloons").textContent = `${wheel.balloons.filter((b) => b.popped).length}/${wheel.balloons.length}`;
}

// ---------- Ввод: нажатие в любом месте, пробел, ↑ ----------
const canvas = el("stage");
function press() {
  unlock();
  if (mode !== "play" || paused) return;
  if (wheel.press()) {
    el("tap").hidden = true;
    for (const e of wheel.events.splice(0)) handle(e);
  }
}
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  press();
});
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
  if (["Space", "ArrowUp", "KeyW", "Enter"].includes(e.code)) {
    e.preventDefault();
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
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "play") setPaused(true);
    Music.stop();
  } else if (save.music && Sound.ctx && !paused && mode !== "title") Music.start();
});

// ---------- События ----------
function handle(e) {
  world.event(e, wheel);
  if (e.type === "launch") Sound.launch();
  else if (e.type === "land") {
    Sound.light(level.supply - wheel.left);
    paintHud();
    if (wheel.left === 1 && !lastSaid) {
      lastSaid = true;
      say("last", false, false);
    }
  } else if (e.type === "pop") {
    Sound.pop();
    toast("Бах!");
    paintHud();
    const b = el("balloons").parentElement;
    b.classList.remove("bump");
    void b.offsetWidth;
    b.classList.add("bump");
    if (!save.heard.balloon) {
      save.heard.balloon = 1;
      store();
      say("balloon", false, false);
    }
  } else if (e.type === "bump") {
    Sound.bump();
    bumpsHere++;
    say(bumpsHere % 3 === 2 ? "wait" : "bump");
    // Три встречи на колесе — включается подсказка-кружок
    if (bumpsHere >= 3 && !assist) {
      assist = true;
      if (!save.heard.ring) {
        save.heard.ring = 1;
        store();
        setTimeout(() => say("ring", false, false), 1300);
      }
    }
  } else if (e.type === "done") finished(e);
}
async function finished(e) {
  if (mode !== "play") return;
  mode = "done";
  el("tap").hidden = true;
  Sound.fanfare();
  const stars = 1 + (e.popped === wheel.balloons.length ? 1 : 0) + (e.bumps === 0 ? 1 : 0);
  const prev = save.stars[level.id] || 0;
  save.stars[level.id] = Math.max(prev, stars);
  const firstLit = !save.lit[level.id];
  save.lit[level.id] = 1;
  const opened = li + 1 >= save.open && li + 1 < LEVELS.length;
  if (opened) save.open = li + 2;
  const all = LEVELS.every((l) => save.lit[l.id]);
  store();
  speak("done", ...(firstLit ? ["park"] : []), ...(stars === 3 ? ["stars3"] : []), ...(all && firstLit ? ["allDone"] : opened ? ["next"] : []));
  await wait(2600);
  showResult({ stars, firstLit, popped: e.popped, bumps: e.bumps, all });
}
function showResult({ stars, firstLit, popped, bumps, all }) {
  mode = "result";
  el("ride").textContent = level.ride;
  el("stars")
    .querySelectorAll("i")
    .forEach((s, k) => s.classList.toggle("on", k < stars));
  el("result-title").textContent = all && firstLit ? "Весь парк сияет!" : firstLit ? `Зажёгся аттракцион: ${level.rideName}!` : "Колесо светится!";
  const parts = ["★ огоньки на месте"];
  parts.push(popped === wheel.balloons.length ? "★ все шарики лопнули" : `шариков ${popped} из ${wheel.balloons.length}`);
  parts.push(bumps === 0 ? "★ ни одной встречи" : `встреч с огоньками: ${bumps}`);
  el("result-text").textContent = parts.join(" · ");
  el("next").hidden = li >= LEVELS.length - 1;
  el("result").hidden = false;
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  startLevel(li);
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  startLevel(li + 1);
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

// ---------- Ночной парк: колёса и аттракционы ----------
function openMap() {
  if (mode === "play") {
    paused = true;
    Music.stop();
  }
  const bg = ["linear-gradient(#ff9fc8,#ff5f9f)", "linear-gradient(#7fd0ff,#3f8cff)", "linear-gradient(#ffc87a,#ff8f2e)", "linear-gradient(#a8ffa8,#3fc86a)", "linear-gradient(#d8b8ff,#8f5bff)", "linear-gradient(#ff9f9f,#ff4f6d)"];
  el("levels").innerHTML = LEVELS.map((l, i) => {
    const open = i < save.open,
      st = save.stars[l.id] || 0;
    return `<button class="trk${i === li ? " now" : ""}${save.lit[l.id] ? "" : " dark"}" style="--bg:${bg[i % 6]}" data-level="${i}" ${open ? "" : "disabled"}><span class="ic">${open ? l.ride : "🔒"}</span><b>${l.name}</b><small>${save.lit[l.id] ? l.rideName : open ? "ещё темно" : "закрыто"}</small><span class="st">${[0, 1, 2].map((k) => (k < st ? "<em>★</em>" : "★")).join("")}</span></button>`;
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
  else if (mode === "title") startLevel(li);
  else if (mode === "play") setPaused(true);
};
el("levels").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  Sound.tap();
  el("map").hidden = true;
  el("title").hidden = true;
  startLevel(+b.dataset.level);
  if (save.music && Sound.ctx) Music.start();
});

// ---------- Каждый кадр ----------
world.onFrame = (dt) => {
  if (!wheel) return;
  if (mode === "title") {
    // На заставке колесо просто крутится
    wheel.t += dt;
  } else if ((mode === "play" || mode === "done") && !paused) {
    // Шагами по 1/120 с, посадка — в точный момент
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 120);
      wheel.advance(h);
      left -= h;
      for (const e of wheel.events.splice(0)) handle(e);
    }
    // Стрелка перед поворотом — один раз скажем голосом
    const turn = wheel.prog.nextTurn(wheel.t);
    if (turn && turn.in < 1.3 && wheel.state !== "done") {
      if (!turnSaid) {
        turnSaid = true;
        Sound.turn();
        if (!save.heard.turn) {
          save.heard.turn = 1;
          store();
          say("turn", false, false);
        }
      }
    } else turnSaid = false;
  }
  world.sync(wheel, paused ? 0 : dt, assist && mode === "play");
};

// ---------- Заставка ----------
startLevel(Math.min(save.last || 0, save.open - 1), true);
el("play").onclick = () => {
  unlock();
  Sound.tap();
  el("title").hidden = true;
  startLevel(li);
};
if (new URLSearchParams(location.search).has("debug"))
  window.koleso = {
    world,
    LEVELS,
    get wheel() {
      return wheel;
    },
    get mode() {
      return mode;
    },
    save,
    startLevel,
    press,
  };
