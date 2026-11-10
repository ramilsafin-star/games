// «Волшебный клубочек»: котёнок Пуговка проходит лабиринты. Свайп (или нажатие в сторону) — котёнок
// бежит по коридору до развилки; клубочек тянет за собой ниточку; кнопка-клубочек показывает дорогу.
// Логика — maze.js (tests/maze.mjs), миры и уровни — levels.js, 3D — world.js.
import { World } from "./world.js?v=9240d4b6";
import { LEVELS, WORLDS, easy, surprise } from "./levels.js?v=9240d4b6";
import * as M from "./maze.js?v=9240d4b6";
import { KEY_COLORS } from "./models.js?v=9240d4b6";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "klubok-v1";
function load() {
  const empty = { v: 1, done: {}, stars: {}, heard: {}, sound: true, music: true, last: 0, easyNext: false, surprises: 0 };
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
const inWorld = (w) => LEVELS.filter((l) => l.world === w);
const doneIn = (w) => inWorld(w).filter((l) => save.done[l.id]).length;
// Уровень открыт: первый в мире — если в прошлом мире пройдено 3 лабиринта; дальше — по порядку
function isOpen(l) {
  if (l.n === 1) return l.world === 0 || doneIn(l.world - 1) >= 3;
  return !!save.done[inWorld(l.world)[l.n - 2].id];
}

// ---------- Значки ----------
const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const ICON = {
  map: svg('<path d="M8 14l16-6 16 6 16-6v42l-16 6-16-6-16 6z" fill="#ffe08a" stroke="#c88a1a" stroke-width="3" stroke-linejoin="round"/><path d="M24 8v42M40 14v42" stroke="#c88a1a" stroke-width="3"/><path d="M14 40c6-10 14 2 20-8s10-4 14-10" fill="none" stroke="#ff4f8a" stroke-width="4" stroke-dasharray="5 4" stroke-linecap="round"/>'),
  pause: svg('<rect x="16" y="12" width="11" height="40" rx="4" fill="#3f8cff"/><rect x="37" y="12" width="11" height="40" rx="4" fill="#3f8cff"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#3f8cff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#3f8cff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#9aa8b8"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#8f5bff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#8f5bff"/><circle cx="46" cy="40" r="8" fill="#8f5bff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#9aa8b8" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#9aa8b8"/><circle cx="46" cy="40" r="8" fill="#9aa8b8"/><path d="M8 8l48 48" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  close: svg('<path d="M16 16l32 32M48 16 16 48" stroke="#ff4f6d" stroke-width="8" stroke-linecap="round"/>'),
  eye: svg('<path d="M4 32c8-12 17-18 28-18s20 6 28 18c-8 12-17 18-28 18S12 44 4 32z" fill="#fff" stroke="#3f8cff" stroke-width="4"/><circle cx="32" cy="32" r="11" fill="#3f8cff"/><circle cx="32" cy="32" r="5" fill="#16204a"/><circle cx="36" cy="28" r="3" fill="#fff"/>'),
  yarn: svg('<circle cx="30" cy="34" r="22" fill="#ff4f8a"/><path d="M12 26c10 2 24 10 34 24M10 36c12 0 26 6 32 18M18 16c8 6 18 18 22 34M30 12c2 10 2 26-4 44M44 18c-6 8-10 22-10 36" fill="none" stroke="#ff9fc4" stroke-width="3"/><path d="M50 40c6 4 8 10 6 16" fill="none" stroke="#ff4f8a" stroke-width="3" stroke-linecap="round"/><path d="M44 8l3 6 6 1-5 4 2 6-6-3-5 3 1-6-4-4 6-1z" fill="#ffd84a"/>'),
};
for (const id of ["map-open", "to-map", "pause-map"]) el(id).innerHTML = ICON.map;
el("map-close").innerHTML = ICON.close;
el("pause").innerHTML = ICON.pause;
el("look").innerHTML = ICON.eye;
el("hint").innerHTML = ICON.yarn;

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
// Сказать один раз за всё время
function once(id, force = false) {
  if (save.heard[id]) return false;
  save.heard[id] = 1;
  store();
  say(id, false, force);
  return true;
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
let base = LEVELS[0], // уровень из списка (для карты и звёзд)
  spec = null, // что построено (может быть лёгкий вариант или сюрприз)
  maze = null,
  st = null,
  got = new Set(),
  held = 0,
  mode = "title",
  paused = false,
  busy = false,
  queued = null,
  hints = 0,
  walls = 0,
  runs = 0,
  best = Infinity,
  bestAt = 0,
  offers = 0,
  idle = 0,
  look = false;

function startLevel(level, { quiet = false, plain = false } = {}) {
  base = level;
  spec = level.surprise || plain || !save.easyNext ? level : easy(level);
  maze = M.build(spec);
  st = M.startState(maze);
  if (!level.surprise) {
    save.last = LEVELS.indexOf(level);
    store();
  }
  world.setLevel(spec, maze, spec.world);
  got = new Set();
  held = 0;
  hints = walls = runs = offers = 0;
  best = distance();
  bestAt = 0;
  idle = 0;
  busy = false;
  queued = null;
  setLook(false);
  el("hint").classList.remove("call");
  el("level-name").textContent = level.surprise ? `${WORLDS[spec.world].icon} Сюрприз` : `${WORLDS[spec.world].icon} ${WORLDS[spec.world].name} · ${level.n}`;
  el("result").hidden = true;
  el("paused").hidden = true;
  paused = false;
  mode = quiet ? "title" : "play";
  el("hint").hidden = el("look").hidden = quiet;
  paintHud();
  el("swipe").hidden = quiet || !!save.heard.swiped;
  if (quiet) return;
  const seq = [];
  if (!save.heard.hello) {
    save.heard.hello = 1;
    seq.push("hello", "how");
  }
  const intro = { 2: "ice", 3: "dark" }[spec.world];
  if (intro && !save.heard[intro]) {
    save.heard[intro] = 1;
    seq.push(intro);
  }
  if (level.surprise) seq.push("surprise");
  store();
  if (seq.length) setTimeout(() => speak(...seq), 300);
  later(world.cam.mode === "follow" ? 2600 : 900);
}
function paintHud(bump = false) {
  if (!maze) return;
  const items = el("items");
  items.textContent = maze.items.length ? `${WORLDS[spec.world].icon} ${got.size}/${maze.items.length}` : "";
  if (bump) {
    items.classList.remove("bump");
    void items.offsetWidth;
    items.classList.add("bump");
  }
  el("keys").innerHTML = maze.keys.map((k) => `<i class="${(held >> k.color) & 1 ? "on" : ""}" style="--c:${KEY_COLORS[k.color]}"></i>`).join("");
}
// Сколько клеток до выхода по подсказке — чтобы понять, что ребёнок заблудился
function distance() {
  const g = M.guide(maze, st);
  return g ? g.reduce((s, x) => s + x.run.path.length, 0) : 0;
}

// ---------- Ввод: свайп, нажатие в сторону, стрелки ----------
const canvas = el("stage");
let ptr = null;
// Направление на экране → сторона в лабиринте (по тому, как камера видит клетки вокруг котёнка)
function dirOf(dx, dy) {
  const l = Math.hypot(dx, dy);
  if (l < 1) return -1;
  const sd = world.screenDirs();
  let bestD = -1,
    bestDot = 0.3;
  sd.dirs.forEach((v, d) => {
    const dot = (v.x * dx + v.y * dy) / l;
    if (dot > bestDot) (bestDot = dot), (bestD = d);
  });
  return bestD;
}
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  unlock();
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
});
canvas.addEventListener("pointermove", (e) => {
  if (!ptr || ptr.id !== e.pointerId || ptr.fired) return;
  const dx = e.clientX - ptr.x,
    dy = e.clientY - ptr.y;
  if (Math.hypot(dx, dy) > 24) {
    ptr.fired = true;
    go(dirOf(dx, dy));
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!ptr || ptr.id !== e.pointerId) return;
  if (!ptr.fired) {
    // Нажатие: бежим в сторону пальца от котёнка
    const sd = world.screenDirs();
    const dx = e.clientX - sd.x,
      dy = e.clientY - sd.y;
    if (Math.hypot(dx, dy) > 30) go(dirOf(dx, dy));
  }
  ptr = null;
});
canvas.addEventListener("pointercancel", () => (ptr = null));
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
  if (e.code in KEYS) {
    e.preventDefault();
    if (!e.repeat && el("map").hidden && el("result").hidden) go(KEYS[e.code]);
  }
  if (e.code === "KeyH" || e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) hint();
  }
  if (e.code === "Escape" && mode === "play") setPaused(!paused);
});

// ---------- Ход ----------
function go(d) {
  if (mode !== "play" || paused || d < 0) return;
  idle = 0;
  if (look) setLook(false);
  if (busy) {
    queued = d;
    return;
  }
  const res = M.run(maze, st, d);
  if (!res.ok) {
    busy = true;
    world.bump(d).then(() => {
      busy = false;
      later(700);
    });
    Sound.bonk();
    if (res.why === "locked") {
      Sound.locked();
      world.lockedShake(res.color);
      say("locked");
    } else if (res.why === "gap") {
      world.gapShake(M.nb(maze, st.cell, d));
      say("gap");
    } else {
      walls++;
      if (walls <= 2 || walls % 5 === 0) say("wall", false, false);
    }
    return;
  }
  busy = true;
  runs++;
  if (!save.heard.swiped) {
    save.heard.swiped = 1;
    store();
  }
  el("swipe").hidden = true;
  if (res.slide.some((x) => x)) Sound.slide();
  let k = 0;
  const from = st.cell;
  world
    .walk(
      res,
      from,
      (i) => {
        if (!res.slide[i]) Sound.step(k++);
        for (const e of res.events) if (e.at === i && e.type !== "door") event(e, res);
      },
      (i) => {
        for (const e of res.events) if (e.at === i && e.type === "door") event(e, res);
      },
    )
    .then(() => {
      st = res.st;
      busy = false;
      if (mode !== "play") return;
      progress();
      if (queued !== null) {
        const q = queued;
        queued = null;
        go(q);
      } else later(500);
    });
}
// Через паузу показать стрелки «куда можно»
let arrowTimer = 0;
function later(ms) {
  clearTimeout(arrowTimer);
  arrowTimer = setTimeout(() => {
    if (mode !== "play" || busy) return;
    const dirs = [0, 1, 2, 3].filter((d) => {
      const r = M.run(maze, st, d);
      return r.ok || r.why === "locked";
    });
    world.showArrows(dirs);
  }, ms);
}
// Заблудился: много пробежек без продвижения к выходу — предложить клубочек
function progress() {
  const dist = distance();
  if (dist < best) {
    best = dist;
    bestAt = runs;
  }
  if (runs - bestAt >= 7) {
    bestAt = runs;
    offer();
  }
  // После нескольких пробежек — про ниточку
  if (runs === 4 && !save.heard.thread) setTimeout(() => once("thread"), 400);
}
function offer() {
  if (offers >= 3 || mode !== "play") return;
  offers++;
  el("hint").classList.add("call");
  say("offer", false, false);
}
function event(e, res) {
  if (e.type === "item") {
    if (got.has(e.item)) return;
    got.add(e.item);
    world.takeItem(e.item);
    Sound.item();
    paintHud(true);
    if (got.size === maze.items.length && maze.items.length > 1) setTimeout(() => say("allItems", false, false), 500);
    else if (!once("item" + spec.world)) toast(WORLDS[spec.world].itemOne + "!");
  } else if (e.type === "key") {
    held |= 1 << e.color;
    world.takeKey(e.color);
    Sound.key();
    paintHud();
    toast("Ключик!");
    once("key", true);
  } else if (e.type === "door") {
    world.openDoor(e.color);
    Sound.door();
    once("opened") || toast("Открыто!");
  } else if (e.type === "button") {
    world.pressButton(e.color, res.st);
    Sound.button();
    setTimeout(() => Sound.bridge(), 350);
    once("button") || toast("Мостики!");
  } else if (e.type === "locked") {
    world.lockedShake(e.color);
    Sound.locked();
    say("locked", false, false);
  } else if (e.type === "dead") {
    Sound.dead();
    once("dead");
  } else if (e.type === "exit") finished();
}

// ---------- Подсказка и вид сверху ----------
function hint() {
  unlock();
  if (mode !== "play" || paused) return;
  const g = M.guide(maze, st);
  if (!g) return;
  hints++;
  el("hint").classList.remove("call");
  // Первые подсказки — до ближайших развилок, потом — до ключа, кнопки или выхода
  const cells = [st.cell];
  let n = 0;
  for (const x of g) {
    cells.push(...x.run.path);
    n++;
    const stop = x.run.events.some((e) => e.type === "key" || e.type === "button" || e.type === "exit");
    if (stop || (hints < 3 && (cells.length >= 8 || n >= 3))) break;
  }
  world.showHint(cells);
  Sound.hint();
  if (hints <= 2) say("hint");
  idle = 0;
}
el("hint").onclick = hint;
function setLook(v) {
  look = v;
  world.overview(v);
  el("look").classList.toggle("on", v);
}
el("look").onclick = () => {
  unlock();
  if (mode !== "play") return;
  setLook(!look);
  Sound.look(look);
  if (look) once("look");
};

// ---------- Пауза ----------
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
el("restart").onclick = () => {
  unlock();
  Sound.tap();
  startLevel(base, { plain: spec !== base && !spec.easy });
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "play") setPaused(true);
    Music.stop();
  } else if (save.music && Sound.ctx && !paused && mode !== "title") Music.start();
});

// ---------- Выход ----------
async function finished() {
  if (mode !== "play") return;
  mode = "done";
  el("hint").hidden = el("look").hidden = true;
  world.showArrows(null);
  setLook(false);
  el("hint").classList.remove("call");
  Sound.fanfare();
  const all = got.size === maze.items.length;
  const stars = 1 + (all ? 1 : 0) + (hints === 0 ? 1 : 0);
  let opened = false,
    newWorld = false,
    allDone = false;
  if (!base.surprise) {
    const before = LEVELS.filter(isOpen).length,
      worldsBefore = WORLDS.filter((w, i) => isOpen(inWorld(i)[0])).length;
    save.stars[base.id] = Math.max(save.stars[base.id] || 0, stars);
    const first = !save.done[base.id];
    save.done[base.id] = 1;
    opened = LEVELS.filter(isOpen).length > before;
    newWorld = WORLDS.filter((w, i) => isOpen(inWorld(i)[0])).length > worldsBefore;
    allDone = first && LEVELS.every((l) => save.done[l.id]);
    // Много подсказок — следующий лабиринт поменьше; справился легко — снова обычный
    save.easyNext = hints >= 3;
  }
  store();
  world.celebrate();
  speak("friend" + spec.world, ...(stars === 3 ? ["stars3"] : []), ...(allDone ? ["allDone"] : newWorld ? ["world"] : opened ? ["next"] : []));
  await wait(2900);
  showResult({ stars, all, allDone });
}
function nextLevel() {
  if (base.surprise) return base;
  const i = LEVELS.indexOf(base);
  for (let k = i + 1; k < LEVELS.length; k++) if (isOpen(LEVELS[k])) return LEVELS[k];
  return null;
}
function showResult({ stars, all, allDone }) {
  mode = "result";
  el("hint").hidden = el("look").hidden = true;
  const w = WORLDS[spec.world];
  const f = el("friend");
  f.textContent = w.friendIcon;
  f.style.setProperty("--bg", w.bg);
  el("stars")
    .querySelectorAll("i")
    .forEach((s, k) => s.classList.toggle("on", k < stars));
  el("result-title").textContent = allDone ? "Все лабиринты пройдены!" : `Привет, ${w.friend}!`;
  const parts = ["★ нашли выход"];
  if (maze.items.length) parts.push(all ? `★ все ${w.item}` : `${w.item}: ${got.size} из ${maze.items.length}`);
  parts.push(hints === 0 ? "★ без подсказок" : `подсказок: ${hints}`);
  el("result-text").textContent = parts.join(" · ");
  const nx = nextLevel();
  el("next").hidden = !nx;
  el("next").textContent = base.surprise ? "🎁 Ещё сюрприз" : "Дальше ▶";
  el("result").hidden = false;
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  startLevel(base, { plain: !spec.easy });
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  if (base.surprise) return startSurprise();
  const nx = nextLevel();
  if (nx) startLevel(nx);
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

// ---------- Карта ----------
function openMap() {
  if (mode === "play") {
    paused = true;
    Music.stop();
  }
  el("worlds").innerHTML = WORLDS.map((w, wi) => {
    const list = inWorld(wi);
    const open = isOpen(list[0]);
    const lv = list
      .map((l) => {
        const o = isOpen(l),
          s = save.stars[l.id] || 0;
        return `<button class="lvl${l === base ? " now" : ""}${save.done[l.id] ? " done" : ""}" data-id="${l.id}" ${o ? "" : "disabled"} aria-label="${w.name}, лабиринт ${l.n}">${o ? l.n : "🔒"}<small>${[0, 1, 2].map((k) => (k < s ? "<em>★</em>" : "★")).join("")}</small></button>`;
      })
      .join("");
    return `<div class="world${open ? "" : " locked"}" style="--bg:${w.bg}"><div class="wname"><span>${open ? w.icon : "🔒"}</span>${w.name}</div>${lv}</div>`;
  }).join("");
  el("surprise").hidden = doneIn(0) < 5;
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
  else if (mode === "title") startLevel(base);
  else if (mode === "play") setPaused(true);
};
el("worlds").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  Sound.tap();
  el("map").hidden = true;
  el("title").hidden = true;
  startLevel(LEVELS.find((l) => l.id === b.dataset.id));
  if (save.music && Sound.ctx) Music.start();
});
function startSurprise() {
  const open = WORLDS.map((w, i) => i).filter((i) => isOpen(inWorld(i)[0]));
  save.surprises++;
  store();
  const seed = (Date.now() % 100000) + save.surprises * 7919;
  startLevel(surprise(open[seed % open.length], seed));
}
el("surprise").onclick = () => {
  unlock();
  Sound.tap();
  el("map").hidden = true;
  el("title").hidden = true;
  startSurprise();
  if (save.music && Sound.ctx) Music.start();
};

// ---------- Каждый кадр ----------
world.onFrame = (dt) => {
  if (mode !== "play" || paused) return;
  idle += dt;
  // Долго стоит на месте — клубочек предлагает помощь
  if (!busy && idle > 16) {
    idle = 0;
    offer();
  }
  // В самом начале — напомнить про свайп
  if (!save.heard.swiped && idle > 6) el("swipe").hidden = false;
};

// ---------- Заставка ----------
startLevel(LEVELS[Math.min(save.last || 0, LEVELS.length - 1)], { quiet: true });
el("play").onclick = () => {
  unlock();
  Sound.tap();
  el("title").hidden = true;
  startLevel(base);
};
if (new URLSearchParams(location.search).has("debug"))
  window.klubok = {
    world,
    LEVELS,
    M,
    save,
    startLevel,
    go,
    hint,
    get maze() {
      return maze;
    },
    get st() {
      return st;
    },
    get mode() {
      return mode;
    },
    get busy() {
      return busy;
    },
    get hints() {
      return hints;
    },
    guide: () => M.guide(maze, st),
  };
