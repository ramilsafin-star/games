await window.vkGameHost?.ready;
// «Ёжик-почтальон»: ребёнок рисует пальцем рельсы от почты до станции, вагончик с ёжиком едет сам.
// Физика — physics.js (шаг 1/120 с, заезд повторяется точно), картинка — world.js, уровни — levels.js.
import { World, SKINS, railUp } from "./world.js?v=46671f0f";
import { LEVELS, WORLDS, STORIES, FREE_LEVEL } from "./levels.js?v=46671f0f";
import { Run, DT, processStroke, makeRail, anchors, canDraw, blockedSegment, SNAP, drawStrokes, fixedRails, railAt, predictJumps, bendRail } from "./physics.js?v=46671f0f";

const el = (id) => document.getElementById(id);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const MAX_RAILS = 24;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "yozhik-v1";
function load() {
  const empty = { v: 1, stars: {}, rings: {}, tricks: {}, drawings: {}, heard: {}, skin: "cart", sound: true, music: true, level: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return { ...empty, ...s, tricks: s.tricks || {} };
  } catch {}
  return empty;
}
const save = load();
function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Хранилище недоступно (частный режим): играть можно, прогресс живёт до закрытия
  }
}
// Печати: кольца лучших заездов и особые печати за трюки
const trickCount = () => Object.values(save.tricks).reduce((a, b) => a + b.length, 0);
const totalStamps = () => Object.values(save.rings).reduce((a, b) => a + b, 0) + trickCount();
const TRICKS = {
  loop: { icon: "🎢", name: "Петля" },
  jump: { icon: "✈️", name: "Полёт" },
  tunnel: { icon: "🔦", name: "Тоннель" },
  rocket: { icon: "🚀", name: "Ракета" },
};

// ---------- Значки ----------
const svg = (body, view = "0 0 64 64") => `<svg viewBox="${view}" aria-hidden="true">${body}</svg>`;
const ICON = {
  pencil: svg('<g transform="rotate(45 32 32)"><rect x="24" y="4" width="16" height="40" rx="3" fill="#ffb02e"/><rect x="24" y="4" width="16" height="8" rx="3" fill="#ff7ab0"/><rect x="24" y="12" width="16" height="4" fill="#c9cde6"/><path d="M24 44h16L32 60z" fill="#f6d7a7"/><path d="M29.5 54h5L32 60z" fill="#23264a"/></g>'),
  eraser: svg('<g transform="rotate(-35 32 32)"><rect x="12" y="20" width="40" height="24" rx="6" fill="#ff8fb1"/><rect x="12" y="20" width="16" height="24" rx="6" fill="#7fb8ff"/></g><path d="M10 56h44" stroke="#c9cde6" stroke-width="4" stroke-linecap="round"/>'),
  undo: svg('<path d="M22 18 8 30l14 12" fill="none" stroke="#2f6bff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 30h24a16 16 0 0 1 0 32h-8" fill="none" stroke="#2f6bff" stroke-width="7" stroke-linecap="round" transform="translate(0 -8)"/>'),
  clear: svg('<rect x="14" y="18" width="36" height="40" rx="6" fill="#ff6f8f"/><rect x="10" y="10" width="44" height="9" rx="4" fill="#ff4f6d"/><rect x="26" y="5" width="12" height="7" rx="3" fill="#ff4f6d"/><path d="M24 28v20M32 28v20M40 28v20" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'),
  hint: svg('<circle cx="32" cy="26" r="17" fill="#ffd23f"/><circle cx="27" cy="20" r="5" fill="#fff8c8"/><rect x="24" y="40" width="16" height="12" rx="4" fill="#c9cde6"/><path d="M32 3v4M12 10l3 3M52 10l-3 3" stroke="#ff9f3f" stroke-width="4" stroke-linecap="round"/><rect x="27" y="52" width="10" height="5" rx="2" fill="#8d93b5"/>'),
  map: svg('<path d="M6 14l16-6 20 6 16-6v42l-16 6-20-6-16 6z" fill="#7fe08f"/><path d="M22 8v42M42 14v42" stroke="#3fbf5a" stroke-width="3"/><path d="M12 40c8-10 16 4 22-8s14-6 18-12" fill="none" stroke="#ff4f6d" stroke-width="4" stroke-dasharray="5 4" stroke-linecap="round"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#2f6bff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#2f6bff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#9aa0bf"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#b47cff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#b47cff"/><circle cx="46" cy="40" r="8" fill="#b47cff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#9aa0bf" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#9aa0bf"/><circle cx="46" cy="40" r="8" fill="#9aa0bf"/><path d="M8 8l48 48" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  close: svg('<path d="M16 16l32 32M48 16 16 48" stroke="#ff4f6d" stroke-width="8" stroke-linecap="round"/>'),
  again: svg('<path d="M50 30a18 18 0 1 1-6-13" fill="none" stroke="#2f6bff" stroke-width="7" stroke-linecap="round"/><path d="M46 6v14H32" fill="none" stroke="#2f6bff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
};
el("pencil").innerHTML = ICON.pencil;
el("eraser").innerHTML = ICON.eraser;
el("undo").innerHTML = ICON.undo;
el("clear").innerHTML = ICON.clear;
el("hint").innerHTML = ICON.hint;
el("map-open").innerHTML = ICON.map;
el("map-close").innerHTML = ICON.close;
el("again").innerHTML = ICON.again;

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
  if (!save.sound) stopVoice();
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
  voiceToken = 0,
  speakToken = 0;
function stopVoice() {
  if (voice) {
    try {
      voice.stop();
    } catch {}
    voice = null;
  }
}
// Говорит ёжик (записи Gemini). Нет записи — молчит. Ждать окончания: await say(...)
async function say(id, delay = 0, chain = false) {
  if (!chain) speakToken++;
  if (!save.sound || !Sound.ctx) return;
  const token = ++voiceToken;
  stopVoice();
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
    if (token !== voiceToken) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(Sound.master);
    src.start(ctx.currentTime + delay);
    voice = src;
    Music.duck(buf.duration + delay + 0.2, 0.35);
    await new Promise((r) => (src.onended = r));
  } catch {}
}
// Несколько фраз подряд; новая фраза прерывает цепочку
async function speak(...ids) {
  const token = ++speakToken;
  for (const id of ids) {
    if (token !== speakToken) return;
    await say(id, 0, true);
    await wait(180);
  }
}
const said = new Set();
function sayOnce(id) {
  if (said.has(id)) return;
  said.add(id);
  say(id);
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
world.setSkin(save.skin);

const levelTimers = new Set();
function afterLevel(ms, callback) {
  const timer = setTimeout(() => {
    levelTimers.delete(timer);
    callback();
  }, ms);
  levelTimers.add(timer);
}
function clearLevelTimers() {
  for (const timer of levelTimers) clearTimeout(timer);
  levelTimers.clear();
}
let idle = 0;
let li = 0,
  level = null,
  rails = [],
  handles = [],
  colorNext = 0,
  mode = "title",
  tool = "pencil",
  stroke = null,
  drag = null,
  run = null,
  acc = 0,
  fails = 0,
  failsBy = {},
  blockedTries = 0,
  lastLeave = false,
  hand = null,
  hintAt = null,
  history = [],
  fixedSides = new Map();

const story = () => STORIES[level.story] || STORIES.carrot;
function sideOf(rail) {
  if (rail.kind === "user") return World.side(rail.pts);
  return fixedSides.get(rail.kind) ?? 1;
}
// quiet — тихо построить уровень под заставкой, без голоса и подсказок
function startLevel(i, quiet = false) {
  clearLevelTimers();
  run = null;
  stroke = drag = null;
  idle = 0;
  speakToken++;
  voiceToken++;
  stopVoice();
  el("result").hidden = true;
  el("title-stamps").textContent = `✉ Печатей: ${totalStamps()}`;
  const free = i === "free";
  li = free ? "free" : Math.max(0, Math.min(LEVELS.length - 1, i));
  level = free ? FREE_LEVEL : LEVELS[li];
  const worldChanged = !world.data || world.data.world !== level.world;
  save.level = li;
  store();
  world.setLevel(level);
  rails = [];
  handles = [];
  history = [];
  colorNext = 0;
  for (const d of save.drawings[level.id] || []) insertRail(makeRail(d.pts, "user", rid()), rails.length, d.c, true);
  fixedSides = new Map(fixedRails(level).map((r) => [r.kind, World.side(r.pts)]));
  fails = 0;
  failsBy = {};
  blockedTries = 0;
  hintAt = null;
  said.clear();
  el("hint").hidden = true;
  el("lvl-num").textContent = free ? "∞" : level.id;
  el("lvl-name").textContent = level.name;
  world.clearTrace();
  // Посылка уже доставлена — у станции её результат, иначе получатель ждёт с облачком
  const delivered = !free && (save.stars[level.id] || 0) > 0;
  world.showGift(delivered ? story().gift : null, false);
  world.setBubble(delivered || free ? null : story().icon);
  setMode("edit");
  resetWagon();
  refresh();
  hideHand();
  world.ghost(null);
  if (quiet || free) return;
  // Голос: знакомство, кто ждёт посылку, что нового на этой горке
  const seq = [];
  if (level.id === 1 && !save.heard.hello) {
    save.heard.hello = 1;
    seq.push("hello");
  }
  if (!delivered) seq.push("story-" + level.story);
  if (!delivered && level.id > 12) toast(story().text);
  if (level.id === 1 && !rails.length) seq.push("draw");
  const tip = level.hint || (level.id === 2 ? "rings" : level.rocks.length ? "cave" : null);
  if (tip && !save.heard[tip]) {
    save.heard[tip] = 1;
    seq.push(tip);
  } else if (worldChanged && li > 0 && delivered) seq.push("world");
  store();
  speak(...seq);
  if (level.id === 1 && !rails.length) showGhost(true);
}
function resetWagon() {
  const start = fixedRails(level)[0],
    s = 0.15,
    at = railAt(start, s);
  world.placeWagon(at.p, at.t, railUp(start, s, 1), 0, 0, true);
  world.resetWagonParcel();
  world.ringsReset();
  world.follow(null);
  paintStamps(0);
}
function paintStamps(n) {
  [...el("stamps").children].forEach((i, k) => i.classList.toggle("on", k < n));
}
function setMode(m) {
  mode = m;
  const go = el("go");
  go.classList.toggle("stop", m === "run");
  go.querySelector("span").textContent = m === "run" ? "Стоп" : "Поехали!";
  go.setAttribute("aria-label", m === "run" ? "Остановить" : "Поехали");
  for (const id of ["pencil", "eraser", "undo", "clear"]) el(id).disabled = m !== "edit";
  el("undo").disabled = m !== "edit" || !history.length;
  go.disabled = m === "result" || m === "fail";
  if (m !== "edit") el("hint").hidden = true;
  else if (hintAt) el("hint").hidden = false;
  updateReady();
}
// Кнопка «Поехали» зовёт, когда рельс уже отходит от почты
function updateReady() {
  const touches = rails.some((r) => dist(r.pts[0], level.start) < 1e-3 || dist(r.pts.at(-1), level.start) < 1e-3);
  el("go").classList.toggle("ready", mode === "edit" && touches);
}
// Свободные кончики: не прицеплены ни к станции, ни к почте, ни к другому рельсу
function freeEnds() {
  const out = [];
  rails.forEach((r, i) => {
    for (const end of [0, 1]) {
      const p = end ? r.pts.at(-1) : r.pts[0];
      const others = anchors(level, rails.filter((q) => q !== r));
      others.push(end ? r.pts[0] : r.pts.at(-1));
      if (!others.some((a) => dist(a, p) < 1e-3)) out.push({ i, end, p, color: world.railColor(r.color) });
    }
  });
  return out;
}
// После любого изменения рельсов: магниты, ручки на кончиках, пунктир будущих прыжков
function refresh(hot = -1) {
  if (mode !== "edit") {
    world.setMagnets([]);
    world.setHandles([]);
    world.showArcs([]);
    return;
  }
  world.setMagnets(anchors(level, rails), hot);
  world.setHandles(tool === "pencil" ? freeEnds() : []);
  world.showArcs(predictJumps(level, rails));
  el("undo").disabled = !history.length;
  updateReady();
}
function persist() {
  save.drawings[level.id] = rails.map((r) => ({ pts: r.pts, c: r.color }));
  store();
}
const rid = () => "u" + Math.random().toString(36).slice(2);
// Рельсы и их 3D хранятся в двух параллельных списках
function insertRail(rail, i, color, animate = true) {
  rail.color = color;
  rails.splice(i, 0, rail);
  handles.splice(i, 0, world.buildRail(rail.pts, world.railColor(color), animate));
  colorNext = Math.max(colorNext, color + 1);
}
function deleteRail(i, puff = true) {
  const [r] = rails.splice(i, 1),
    [h] = handles.splice(i, 1);
  if (puff) for (let k = 0; k < r.pts.length; k += 5) world.puff(r.pts[k], 1, "#ffffff", 0.8, 0.45);
  world.removeRail(h);
  return r;
}
// Отмена: вернуть нарисованное, стёртое ластиком, корзиной или изменённый кончик
function undo() {
  const a = history.pop();
  if (!a) return;
  if (a.t === "add") deleteRail(rails.indexOf(a.rail));
  else if (a.t === "erase") insertRail(a.rail, Math.min(a.i, rails.length), a.rail.color);
  else if (a.t === "clear") a.list.forEach(({ rail, i }) => insertRail(rail, Math.min(i, rails.length), rail.color));
  else if (a.t === "bend") {
    const i = rails.indexOf(a.after);
    if (i >= 0) {
      deleteRail(i, false);
      insertRail(a.before, i, a.before.color, false);
    }
  }
  persist();
  refresh();
}

// ---------- Рисование и кончики ----------
const canvas = el("stage");
const point = (e) => world.pick(e.clientX, e.clientY);
function blocked(p, last) {
  return !canDraw(level, p) || (last && blockedSegment(level, last, p));
}
function warnBlocked() {
  world.flashNoDraw();
  Sound.nope();
  if (!level.nodraw.length) return;
  blockedTries++;
  // Ребёнок снова и снова тянет линию над пропастью — объяснить, что нужен трамплин
  if (blockedTries === 1) sayOnce("nodraw");
  else if (blockedTries === 6) say("coachJump");
}
function eraseAt(p) {
  let best = -1,
    bd = 0.5;
  rails.forEach((r, i) => {
    for (const q of r.pts) {
      const d = dist(p, q);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  });
  if (best >= 0) {
    const rail = rails[best];
    deleteRail(best);
    history.push({ t: "erase", rail, i: best });
    Sound.erase();
    persist();
    refresh();
  }
}
canvas.addEventListener("pointerdown", (e) => {
  unlock();
  if (mode !== "edit" || stroke || drag) return;
  const p = point(e);
  if (!p) return;
  idle = 0;
  canvas.setPointerCapture(e.pointerId);
  hideHand();
  world.ghost(null);
  if (tool === "eraser") {
    stroke = { id: e.pointerId, erase: true };
    eraseAt(p);
    return;
  }
  // За ручку на кончике рельса — тянуть кончик
  const reach = Math.max(0.55, 30 / world.pixelsPerUnit());
  const h = freeEnds().find((f) => dist(f.p, p) < reach);
  if (h) {
    drag = { id: e.pointerId, i: h.i, end: h.end, rail: rails[h.i], target: p, moved: false, at: 0 };
    handles[h.i].group.visible = false;
    world.setHandles([]);
    Sound.tap();
    dragPreview();
    return;
  }
  if (blocked(p)) return warnBlocked();
  stroke = { id: e.pointerId, raw: [p] };
  world.preview(stroke.raw, false);
});
function dragPreview() {
  const others = rails.filter((r) => r !== drag.rail);
  const b = bendRail(level, drag.rail.pts, drag.end === 1, drag.target, others);
  drag.pts = b.pts;
  world.preview(b.pts, b.snapped);
  // Пунктир прыжка пересчитывается не чаще 15 раз в секунду
  const now = performance.now();
  if (now - drag.at > 66) {
    drag.at = now;
    const tmp = rails.map((r) => (r === drag.rail ? makeRail(b.pts, "user", "tmp") : r));
    world.showArcs(predictJumps(level, tmp));
  }
}
canvas.addEventListener("pointermove", (e) => {
  if (drag && e.pointerId === drag.id) {
    const p = point(e);
    if (!p || blocked(p)) return;
    if (dist(p, drag.target) > 0.02) drag.moved = true;
    drag.target = p;
    Sound.scratch();
    dragPreview();
    return;
  }
  if (!stroke || e.pointerId !== stroke.id) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events.length ? events : [e]) {
    const p = point(ev);
    if (!p) continue;
    if (stroke.erase) {
      eraseAt(p);
      continue;
    }
    const last = stroke.raw.at(-1);
    if (dist(p, last) < 0.1) continue;
    if (blocked(p, last)) {
      warnBlocked();
      continue;
    }
    stroke.raw.push(p);
    if (stroke.raw.length > 2500) break;
    Sound.scratch();
  }
  if (stroke.erase) return;
  // Магнит рядом с пальцем светится ярче
  const list = anchors(level, rails),
    tip = stroke.raw.at(-1);
  let hot = -1,
    bd = SNAP;
  list.forEach((a, i) => {
    const d = dist(a, tip);
    if (d < bd) {
      bd = d;
      hot = i;
    }
  });
  if (hot !== stroke.hot) {
    stroke.hot = hot;
    world.setMagnets(list, hot);
  }
  world.preview(stroke.raw, hot >= 0);
});
function endPointer(e) {
  if (drag && (!e || e.pointerId === drag.id)) {
    const d = drag;
    drag = null;
    world.preview([], false);
    const i = rails.indexOf(d.rail);
    if (d.moved && d.pts && i >= 0) {
      const after = makeRail(d.pts, "user", rid());
      deleteRail(i, false);
      insertRail(after, i, d.rail.color, false);
      history.push({ t: "bend", before: d.rail, after });
      Sound.build();
      persist();
    } else if (i >= 0) handles[i].group.visible = true;
    refresh();
    return;
  }
  if (!stroke || (e && e.pointerId !== stroke.id)) return;
  const s = stroke;
  stroke = null;
  world.preview([], false);
  if (s.erase) return;
  const pts = processStroke(s.raw, level, rails);
  if (!pts) return refresh();
  if (rails.length >= MAX_RAILS) {
    toast("На горке уже 24 рельса. Сотри ненужный ластиком.");
    refresh();
    return;
  }
  idle = 0;
  const rail = makeRail(pts, "user", rid());
  insertRail(rail, rails.length, colorNext);
  history.push({ t: "add", rail });
  Sound.build();
  persist();
  refresh();
  // Рельс от почты есть — показать кнопку «Поехали»
  if (el("go").classList.contains("ready") && !save.heard.play) {
    save.heard.play = 1;
    store();
    say("play", 0.5);
    pointAtGo();
  }
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("lostpointercapture", endPointer);

function setTool(t) {
  tool = t;
  el("pencil").classList.toggle("on", t === "pencil");
  el("eraser").classList.toggle("on", t === "eraser");
  refresh();
}
el("pencil").onclick = () => {
  unlock();
  Sound.tap();
  setTool("pencil");
};
el("eraser").onclick = () => {
  unlock();
  Sound.tap();
  setTool("eraser");
};
el("undo").onclick = () => {
  unlock();
  if (!history.length) return;
  undo();
  Sound.erase();
};
el("clear").onclick = () => {
  unlock();
  if (!rails.length) return;
  const list = rails.map((rail, i) => ({ rail, i }));
  while (rails.length) deleteRail(rails.length - 1);
  history.push({ t: "clear", list });
  Sound.whoosh();
  persist();
  setTool("pencil");
};
el("hint").onclick = () => {
  unlock();
  say("hint");
  showGhost(false);
};

// ---------- Заезд ----------
el("go").onclick = () => {
  unlock();
  if (mode === "edit") startRun();
  else if (mode === "run") stopRun();
};
function startRun() {
  idle = 0;
  if (stroke || drag) endPointer();
  hideHand();
  world.ghost(null);
  world.clearTrace();
  world.setBubble(null);
  resetWagon();
  run = new Run(level, rails);
  acc = 0;
  lastLeave = false;
  setMode("run");
  refresh();
  Sound.whistle();
  say("go", 0.15);
}
function stopRun() {
  run = null;
  Sound.stopRoll();
  setMode("edit");
  resetWagon();
  if (li !== "free" && !(save.stars[level.id] > 0)) world.setBubble(story().icon);
  refresh();
}
function handle(ev) {
  if (ev.type === "ring") {
    world.ringTaken(ev.i);
    Sound.stamp();
    flyStamp(ev.i);
  } else if (ev.type === "leave") {
    lastLeave = true;
    Sound.whoosh();
  } else if (ev.type === "land") {
    lastLeave = false;
    Sound.clack();
    world.burst(ev.at, 12, ["#ffd23f", "#ffffff"], 2.2);
    world.shake(0.08);
  } else if (ev.type === "boost") {
    Sound.boost();
    world.burst(run.pos, 30, ["#ff9a3f", "#ffd23f", "#ffffff"], 3.5);
  } else if (ev.type === "trick") {
    const t = TRICKS[ev.name];
    toast(t.icon + " " + t.name + "!");
    Sound.star();
    world.burst(run.pos, 24, ["#ffd23f", "#ff8fd0", "#7fe8ff"], 3);
    say("trick-" + ev.name);
  } else if (ev.type === "finish") finished();
  else if (ev.type === "fail") failed(ev.reason, ev.at);
}
function flyStamp(i) {
  const from = world.screen(level.rings[i]),
    slot = el("stamps").children[i].getBoundingClientRect();
  const f = el("fly");
  f.style.background = i ? "#2f6bff" : "#ff4f6d";
  f.style.boxShadow = `0 0 0 3px ${i ? "#2f6bff" : "#ff4f6d"}`;
  f.animate(
    [
      { transform: `translate(${from.x - 20}px, ${from.y - 20}px) scale(1.6)`, opacity: 1 },
      { transform: `translate(${(from.x + slot.left) / 2 - 20}px, ${Math.min(from.y, slot.top) - 80}px) scale(1.3)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${slot.left + 2}px, ${slot.top + 2}px) scale(1)`, opacity: 1 },
    ],
    { duration: 650, easing: "ease-in-out" },
  ).onfinish = () => {
    el("stamps").children[i].classList.add("on");
  };
}
function finished() {
  Sound.stopRoll();
  const r = run.result,
    rings = r.rings.length,
    stars = 1 + rings;
  if (li === "free") {
    setMode("result");
    afterLevel(900, () => showResult(stars, r.tricks, [], []));
    return;
  }
  const before = totalStamps(),
    unlockedBefore = SKINS.filter((s) => s.need <= before).length,
    first = !(save.stars[level.id] > 0);
  const known = save.tricks[level.id] || [];
  const newTricks = r.tricks.filter((t) => !known.includes(t));
  save.stars[level.id] = Math.max(save.stars[level.id] || 0, stars);
  save.rings[level.id] = Math.max(save.rings[level.id] || 0, rings);
  save.tricks[level.id] = [...known, ...newTricks];
  store();
  const fresh = SKINS.filter((s) => s.need <= totalStamps()).slice(unlockedBefore);
  hintAt = null;
  setMode("result");
  afterLevel(700, () => {
    world.deliver(run ? run.pos : level.finish);
    world.celebrate([level.finish[0] + 1.3, level.finish[1] + 0.5]);
    Sound.fanfare();
    const line = rings === level.rings.length ? "perfect" : "delivered";
    if (first) speak(line, "gift");
    else say(line, 0.3);
  });
  // Коробка у получателя — открывается, у станции появляется подарок
  afterLevel(1400, () => {
    world.showGift(story().gift, first);
    world.burst([level.finish[0] + 1.3, level.finish[1] + 1.2], 40, ["#ffd23f", "#ff8fd0", "#7fe8ff", "#ffffff"], 3.5);
  });
  afterLevel(2800, () => showResult(stars, r.tricks, newTricks, fresh));
}
// Неудача: что случилось, где, и голосом — что сделать
function failed(reason, at) {
  Sound.stopRoll();
  const why = reason === "crash" && lastLeave ? "gap" : reason;
  if (why === "water") {
    Sound.splashBig();
    world.splash(at);
  } else if (why === "slow") Sound.slide();
  else if (why === "away") Sound.whoosh();
  else {
    Sound.crash();
    world.dust(at);
    world.shake(0.35);
  }
  if (why !== "slow" && why !== "away") world.tumble(why);
  world.follow(null);
  fails++;
  failsBy[why] = (failsBy[why] || 0) + 1;
  // Рядом с пропастью или речкой: прыжок не получился — подсказать про трамплин
  const nearGap = level.nodraw.some(([x0, , x1]) => at[0] > x0 - 2.5 && at[0] < x1 + 2.5);
  const jumpFail = nearGap && (why === "water" || why === "gap" || why === "crash" || why === "away");
  let line = why;
  if (jumpFail) line = failsBy[why] === 1 && fails === 1 ? "coachJump" : freeEnds().length ? "coachDrag" : "coachLand";
  else if (fails >= 2)
    line = { slow: "coachSlow", gap: "coachGap", crash: "coachCrash", away: "coachLand", water: "coachJump" }[why] || why;
  if (fails === 3 || fails === 6) line = "coachBulb";
  say(line, 0.25);
  const trace = run.trace;
  setMode("fail");
  world.showTrace(trace, at);
  // После двух неудач на поле рядом с этим местом загорается лампочка
  if (fails >= 2) hintAt = [...at];
  afterLevel(1700, () => {
    run = null;
    setMode("edit");
    resetWagon();
    if (li !== "free" && !(save.stars[level.id] > 0)) world.setBubble(story().icon);
    refresh();
  });
}
function showResult(stars, tricks, newTricks, fresh) {
  el("result-title").textContent = li === "free" ? "Вагончик на станции!" : stars === 3 ? "Все печати!" : "Посылка доставлена!";
  el("next").setAttribute("aria-label", li === "free" || li === LEVELS.length - 1 ? "Открыть карту" : "Следующая горка");
  [...el("result-stars").children].forEach((s, i) => s.classList.toggle("on", i < stars));
  const tr = el("result-tricks");
  tr.innerHTML = tricks.map((t) => `<span class="${newTricks.includes(t) ? "new" : ""}">${TRICKS[t].icon} ${TRICKS[t].name}</span>`).join("");
  tr.hidden = !tricks.length;
  const nw = el("result-new");
  if (fresh.length) {
    const s = fresh.at(-1);
    nw.innerHTML = `<img alt="" src="${skinIcon(s.id)}"><span>Новый вагончик: ${s.name}!</span>`;
    nw.hidden = false;
    afterLevel(1600, () => say("unlock"));
  } else nw.hidden = true;
  el("result").hidden = false;
  Sound.star();
}
function backToEdit() {
  clearLevelTimers();
  el("result").hidden = true;
  run = null;
  setMode("edit");
  resetWagon();
  refresh();
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  backToEdit();
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  el("result").hidden = true;
  run = null;
  if (li !== "free" && li < LEVELS.length - 1) startLevel(li + 1);
  else {
    backToEdit();
    openMap();
  }
};

// ---------- Каждый кадр ----------
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
world.onFrame = (dt) => {
  if (mode === "edit" && el("map").hidden && !stroke && !drag && !hintAt && !hand) {
    idle += dt;
    if (idle >= 25) {
      hintAt = level.start;
      el("hint").hidden = false;
    }
  }
  if (run && (mode === "run" || mode === "result")) {
    // В полёте время чуть замедляется — красиво и видно, куда летит
    const slow = run.mode === "air" && !reduced.matches ? 0.62 : 1;
    acc += dt * slow;
    let n = 0;
    while (acc >= DT && n < 40 && run.mode !== "fail" && run.mode !== "done") {
      run.step();
      acc -= DT;
      n++;
      for (const ev of run.events.splice(0)) handle(ev);
      if (!run || run.mode === "fail") break;
    }
    if (run && run.mode !== "fail") {
      let up;
      if (run.mode === "air") up = run.dir[0] >= 0 ? [-run.dir[1], run.dir[0]] : [run.dir[1], -run.dir[0]];
      else up = railUp(run.rail, run.s, sideOf(run.rail));
      world.placeWagon(run.pos, run.dir, up, run.speed, dt);
      world.follow(mode === "run" ? run.pos : null);
      if (mode === "run") Sound.roll(run.speed, run.mode === "air");
      else Sound.stopRoll();
    }
  }
  if (hand) moveHand(dt);
  // Лампочка держится у места, где не получилось
  if (hintAt && !el("hint").hidden) {
    const p = world.screen(hintAt),
      r = canvas.getBoundingClientRect();
    const size = el("hint").offsetWidth || 70;
    const x = Math.max(r.left + 8, Math.min(r.right - size - 8, p.x - size / 2)),
      y = Math.max(r.top + 8, Math.min(r.bottom - size - 8, p.y - size - 50));
    el("hint").style.transform = `translate(${x}px, ${y}px)`;
  }
};

// ---------- Рука-подсказка ----------
// Призрачная линия эталонного решения и рука, которая её «рисует»
function showGhost(tutorial) {
  const ref = drawStrokes(level, level.solution);
  world.ghost(ref);
  const path = ref.flatMap((r) => r.pts);
  hand = { path, t: 0, loop: tutorial ? Infinity : 2 };
  el("hand").hidden = false;
}
function pointAtGo() {
  hand = { go: true, t: 0 };
  el("hand").hidden = false;
}
function hideHand() {
  hand = null;
  el("hand").hidden = true;
}
function moveHand(dt) {
  const h = el("hand");
  hand.t += dt;
  if (hand.go) {
    const r = el("go").getBoundingClientRect();
    const bob = Math.abs(Math.sin(hand.t * 4)) * 14;
    h.style.transform = `translate(${r.left + r.width * 0.45}px, ${r.top - 10 - bob}px) rotate(180deg)`;
    if (hand.t > 6 || mode !== "edit") hideHand();
    return;
  }
  const dur = 3.2,
    cycle = hand.t / (dur + 0.8);
  if (cycle >= hand.loop) {
    hideHand();
    world.ghost(null);
    return;
  }
  const f = Math.min(1, (hand.t % (dur + 0.8)) / dur),
    i = Math.min(hand.path.length - 1, Math.floor(f * (hand.path.length - 1)));
  const p = world.screen(hand.path[i]);
  h.style.transform = `translate(${p.x - 18}px, ${p.y - 6}px)`;
}

// ---------- Карта горок и гараж ----------
const icons = {};
function skinIcon(id) {
  return (icons[id] ??= world.skinIcon(id));
}
function unlockedLevel(i) {
  return i === 0 || (save.stars[LEVELS[i - 1].id] || 0) > 0 || (save.stars[LEVELS[i].id] || 0) > 0;
}
function openMap() {
  const box = el("worlds");
  const hasFinal = Boolean(save.stars[LEVELS.at(-1).id]);
  el("free-level").hidden = !hasFinal;
  box.innerHTML = WORLDS.map((w) => {
    const items = LEVELS.map((l, i) => ({ l, i })).filter((x) => x.l.world === w.id);
    return `<div class="world"><h3>${w.name}</h3><div class="levels">${items
      .map(({ l, i }) => {
        const st = save.stars[l.id] || 0,
          open = unlockedLevel(i);
        const stars = [0, 1, 2].map((k) => (k < st ? "<em>★</em>" : "★")).join("");
        const gift = st ? STORIES[l.story].icon : open ? "📦" : "";
        const known = save.tricks[l.id] || [];
        const possible = new Set([...(l.tricks || []), ...known]);
        const tricks = [...possible].map((id) => {
          const trick = TRICKS[id];
          return `<span class="${known.includes(id) ? "earned" : "pending"}" title="${trick.name}">${trick.icon}</span>`;
        }).join("");
        return `<button class="lvl ${l.world}${i === li ? " now" : ""}" data-level="${i}" ${open ? "" : "disabled"} aria-label="Горка ${l.id}: ${l.name}"><span class="gift">${gift}</span><b>${open ? l.id : "🔒"}</b><small>${l.name}</small><span class="st">${stars}</span><span class="tr">${tricks}</span></button>`;
      })
      .join("")}</div></div>`;
  }).join("");
  const total = totalStamps(),
    tc = trickCount();
  el("stamp-total").textContent = `✉ ${total} печатей${tc ? ` · трюков ${tc}` : ""}`;
  el("garage").innerHTML = SKINS.map((s) => {
    const open = total >= s.need;
    return `<button class="skin${save.skin === s.id ? " on" : ""}" data-skin="${s.id}" ${open ? "" : "disabled"} aria-label="${s.name}"><img alt="" src="${skinIcon(s.id)}"><span>${open ? s.name : "✉ " + s.need}</span></button>`;
  }).join("");
  el("map").hidden = false;
}
el("map-open").onclick = () => {
  unlock();
  Sound.tap();
  if (mode === "run") stopRun();
  openMap();
};
el("map-close").onclick = () => {
  Sound.tap();
  el("map").hidden = true;
  // После последней горки карта открывается поверх итога — вернуть живое поле
  if (mode === "result" && el("result").hidden) backToEdit();
};
el("map").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.dataset.level) {
    Sound.tap();
    el("map").hidden = true;
    el("result").hidden = true;
    run = null;
    startLevel(b.dataset.level === "free" ? "free" : Number(b.dataset.level));
  } else if (b.dataset.skin) {
    Sound.gift();
    save.skin = b.dataset.skin;
    store();
    world.setSkin(save.skin);
    resetWagon();
    openMap();
  }
});

// ---------- Заставка ----------
startLevel(save.level === "free" && save.stars[LEVELS.at(-1).id] ? "free" : Math.min(Number(save.level) || 0, LEVELS.length - 1), true);
setMode("title");
el("play").onclick = () => {
  unlock();
  Sound.whistle();
  el("title").hidden = true;
  startLevel(li);
};
// Телефон стоя: можно играть и так
el("portrait-ok").onclick = () => {
  document.body.classList.add("portrait-ok");
  try {
    sessionStorage.setItem("yozhik-portrait", "1");
  } catch {}
};
try {
  if (sessionStorage.getItem("yozhik-portrait")) document.body.classList.add("portrait-ok");
} catch {}
// Свернули вкладку во время заезда — заезд останавливается, рисунок остаётся
function handleVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) {
    if (mode === "run") stopRun();
    if (stroke || drag) endPointer();
    speakToken++;
    voiceToken++;
    stopVoice();
    Sound.ctx?.suspend().catch(() => {});
  } else Sound.ctx?.resume().catch(() => {});
}
document.addEventListener("visibilitychange", handleVisibility);
window.addEventListener("vk-game-visibility", handleVisibility);
// Клавиатура: пробел — поехали/стоп, Z или Backspace — отменить
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
  if (!el("map").hidden || e.target.matches?.("button")) return;
  if (mode === "edit" && (e.code === "Digit1" || e.code === "Digit2")) {
    setTool(e.code === "Digit1" ? "pencil" : "eraser");
    return;
  }
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    el("go").click();
  } else if ((e.key === "z" || e.key === "я" || e.key === "Backspace") && mode === "edit") el("undo").click();
});
if (new URLSearchParams(location.search).has("debug"))
  window.yozhik = {
    world,
    LEVELS,
    get run() {
      return run;
    },
    get mode() {
      return mode;
    },
    get rails() {
      return rails;
    },
    get level() {
      return level;
    },
    get history() {
      return history;
    },
    freeEnds,
    save,
    startLevel,
    // Нарисовать эталонное решение, как будто пальцем
    solve() {
      while (rails.length) deleteRail(rails.length - 1, false);
      history = [];
      for (const r of drawStrokes(level, level.solution)) {
        insertRail(r, rails.length, colorNext);
        history.push({ t: "add", rail: r });
      }
      persist();
      refresh();
    },
  };
