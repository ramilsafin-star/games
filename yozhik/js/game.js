// «Ёжик-почтальон»: ребёнок рисует пальцем рельсы от почты до станции, вагончик с ёжиком едет сам.
// Физика — physics.js (шаг 1/120 с, заезд повторяется точно), картинка — world.js, уровни — levels.js.
import { World, SKINS, railUp } from "./world.js?v=1913a63e";
import { LEVELS, WORLDS } from "./levels.js?v=1913a63e";
import { Run, DT, processStroke, makeRail, anchors, canDraw, blockedSegment, SNAP, drawStrokes, fixedRails, railAt } from "./physics.js?v=1913a63e";

const el = (id) => document.getElementById(id);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------- Сохранение ----------
const KEY = "yozhik-v1";
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return { stars: {}, rings: {}, drawings: {}, heard: {}, ...s };
  } catch {}
  return { v: 1, stars: {}, rings: {}, drawings: {}, heard: {}, skin: "cart", sound: true, music: true, level: 0 };
}
const save = load();
function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Хранилище недоступно (частный режим): играть можно, прогресс живёт до закрытия
  }
}
const totalStamps = () => Object.values(save.rings).reduce((a, b) => a + b, 0);

// ---------- Значки ----------
const svg = (body, view = "0 0 64 64") => `<svg viewBox="${view}" aria-hidden="true">${body}</svg>`;
const ICON = {
  pencil: svg('<g transform="rotate(45 32 32)"><rect x="24" y="4" width="16" height="40" rx="3" fill="#ffb02e"/><rect x="24" y="4" width="16" height="8" rx="3" fill="#ff7ab0"/><rect x="24" y="12" width="16" height="4" fill="#c9cde6"/><path d="M24 44h16L32 60z" fill="#f6d7a7"/><path d="M29.5 54h5L32 60z" fill="#23264a"/></g>'),
  eraser: svg('<g transform="rotate(-35 32 32)"><rect x="12" y="20" width="40" height="24" rx="6" fill="#ff8fb1"/><rect x="12" y="20" width="16" height="24" rx="6" fill="#7fb8ff"/></g><path d="M10 56h44" stroke="#c9cde6" stroke-width="4" stroke-linecap="round"/>'),
  undo: svg('<path d="M22 18 8 30l14 12" fill="none" stroke="#2f6bff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 30h24a16 16 0 0 1 0 32h-8" fill="none" stroke="#2f6bff" stroke-width="7" stroke-linecap="round" transform="translate(0 -8)"/>'),
  clear: svg('<rect x="14" y="18" width="36" height="40" rx="6" fill="#ff6f8f"/><rect x="10" y="10" width="44" height="9" rx="4" fill="#ff4f6d"/><rect x="26" y="5" width="12" height="7" rx="3" fill="#ff4f6d"/><path d="M24 28v20M32 28v20M40 28v20" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'),
  hint: svg('<circle cx="32" cy="26" r="17" fill="#ffd23f"/><rect x="24" y="40" width="16" height="12" rx="4" fill="#c9cde6"/><path d="M32 14v4M20 26h-3M47 26h-3" stroke="#fff" stroke-width="4" stroke-linecap="round"/><rect x="27" y="52" width="10" height="5" rx="2" fill="#8d93b5"/>'),
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
let voice = null;
function stopVoice() {
  if (voice) {
    try {
      voice.stop();
    } catch {}
    voice = null;
  }
}
// Говорит ёжик (записи Gemini). Нет записи — молчит
async function say(id, delay = 0) {
  if (!save.sound || !Sound.ctx) return;
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
    stopVoice();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(Sound.master);
    src.start(ctx.currentTime + delay);
    voice = src;
    Music.duck(buf.duration + delay + 0.2, 0.35);
  } catch {}
}
// Подсказку один раз на уровень, не повторять каждую секунду
const said = new Set();
function sayOnce(id) {
  if (said.has(id)) return;
  said.add(id);
  say(id);
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

let li = 0,
  level = null,
  rails = [],
  handles = [],
  colorNext = 0,
  mode = "title",
  tool = "pencil",
  stroke = null,
  run = null,
  acc = 0,
  fails = 0,
  lastLeave = false,
  hand = null,
  fixedSides = new Map();

function sideOf(rail) {
  if (rail.kind === "user") return World.side(rail.pts);
  return fixedSides.get(rail.kind) ?? 1;
}
// quiet — тихо построить уровень под заставкой, без голоса и подсказок
function startLevel(i, quiet = false) {
  li = Math.max(0, Math.min(LEVELS.length - 1, i));
  level = LEVELS[li];
  const worldChanged = !world.data || world.data.world !== level.world;
  save.level = li;
  store();
  world.setLevel(level);
  for (const h of handles) world.removeRail(h);
  rails = [];
  handles = [];
  colorNext = 0;
  for (const d of save.drawings[level.id] || []) addRail(d.pts, d.c, true, false);
  fixedSides = new Map(fixedRails(level).map((r) => [r.kind, World.side(r.pts)]));
  fails = 0;
  said.clear();
  el("hint").hidden = true;
  el("lvl-num").textContent = level.id;
  el("lvl-name").textContent = level.name;
  setMode("edit");
  resetWagon();
  updateMagnets();
  hideHand();
  world.ghost(null);
  if (quiet) return;
  // Подсказки голосом: на первой горке — знакомство и рука, на особых — что тут нового
  if (level.id === 1 && !rails.length) {
    if (!save.heard.hello) {
      save.heard.hello = 1;
      store();
      say("hello");
      setTimeout(() => level.id === 1 && !rails.length && mode === "edit" && say("draw"), 3600);
    } else say("draw");
    showGhost(true);
  } else if (level.hint && !save.heard[level.hint]) {
    save.heard[level.hint] = 1;
    store();
    say(level.hint, 0.4);
  } else if (level.id === 2 && !save.heard.rings) {
    save.heard.rings = 1;
    store();
    say("rings", 0.4);
  } else if (level.rocks.length && !save.heard.cave) {
    save.heard.cave = 1;
    store();
    say("cave", 0.4);
  } else if (worldChanged && li > 0) say("world", 0.3);
}
function resetWagon() {
  const start = fixedRails(level)[0],
    s = 0.15,
    at = railAt(start, s);
  world.placeWagon(at.p, at.t, railUp(start, s, 1), 0, 0, true);
  world.resetWagonParcel();
  world.ringsReset();
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
  for (const id of ["pencil", "eraser", "undo", "clear", "hint"]) el(id).disabled = m !== "edit";
  go.disabled = m === "result";
  updateReady();
}
// Кнопка «Поехали» зовёт, когда рельс уже отходит от почты
function updateReady() {
  const touches = rails.some((r) => dist(r.pts[0], level.start) < 1e-3 || dist(r.pts.at(-1), level.start) < 1e-3);
  el("go").classList.toggle("ready", mode === "edit" && touches);
}
function updateMagnets(hot = -1) {
  if (mode !== "edit") return world.setMagnets([]);
  world.setMagnets(anchors(level, rails), hot);
}
function persist() {
  save.drawings[level.id] = rails.map((r) => ({ pts: r.pts, c: r.color }));
  store();
}
function addRail(pts, color, animate = true, keep = true) {
  const rail = makeRail(pts, "user", "u" + Math.random().toString(36).slice(2));
  rail.color = color;
  rails.push(rail);
  handles.push(world.buildRail(pts, world.railColor(color), animate));
  colorNext = Math.max(colorNext, color + 1);
  if (keep) persist();
  return rail;
}
function removeRail(i) {
  const [r] = rails.splice(i, 1),
    [h] = handles.splice(i, 1);
  for (let k = 0; k < r.pts.length; k += 5) world.puff(r.pts[k], 1, "#ffffff", 0.8, 0.45);
  world.removeRail(h);
  persist();
  updateMagnets();
  updateReady();
}

// ---------- Рисование ----------
const canvas = el("stage");
function point(e) {
  return world.pick(e.clientX, e.clientY);
}
function blocked(p, last) {
  return !canDraw(level, p) || (last && blockedSegment(level, last, p));
}
function warnBlocked() {
  world.flashNoDraw();
  Sound.nope();
  if (level.nodraw.length) sayOnce("nodraw");
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
    removeRail(best);
    Sound.erase();
  }
}
canvas.addEventListener("pointerdown", (e) => {
  unlock();
  if (mode !== "edit" || stroke) return;
  const p = point(e);
  if (!p) return;
  canvas.setPointerCapture(e.pointerId);
  hideHand();
  world.ghost(null);
  world.clearTrace();
  if (tool === "eraser") {
    stroke = { id: e.pointerId, erase: true };
    eraseAt(p);
    return;
  }
  if (blocked(p)) return warnBlocked();
  stroke = { id: e.pointerId, raw: [p] };
  world.preview(stroke.raw, false);
});
canvas.addEventListener("pointermove", (e) => {
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
    updateMagnets(hot);
  }
  world.preview(stroke.raw, hot >= 0);
});
function endStroke(e) {
  if (!stroke || (e && e.pointerId !== stroke.id)) return;
  const s = stroke;
  stroke = null;
  world.preview([], false);
  if (s.erase) return;
  const pts = processStroke(s.raw, level, rails);
  if (!pts) return updateMagnets();
  if (rails.length >= 24) removeRail(0);
  addRail(pts, colorNext);
  Sound.build();
  updateMagnets();
  updateReady();
  // Первая горка: рельс от почты есть — показать кнопку «Поехали»
  if (el("go").classList.contains("ready") && !save.heard.play) {
    save.heard.play = 1;
    store();
    say("play", 0.5);
    pointAtGo();
  }
}
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("lostpointercapture", endStroke);

function setTool(t) {
  tool = t;
  el("pencil").classList.toggle("on", t === "pencil");
  el("eraser").classList.toggle("on", t === "eraser");
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
  if (!rails.length) return;
  removeRail(rails.length - 1);
  Sound.erase();
  world.clearTrace();
};
el("clear").onclick = () => {
  unlock();
  if (!rails.length) return;
  while (rails.length) removeRail(rails.length - 1);
  Sound.whoosh();
  world.clearTrace();
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
  hideHand();
  world.ghost(null);
  world.clearTrace();
  resetWagon();
  run = new Run(level, rails);
  acc = 0;
  lastLeave = false;
  setMode("run");
  updateMagnets();
  Sound.whistle();
  say("go", 0.15);
}
function stopRun() {
  run = null;
  Sound.stopRoll();
  setMode("edit");
  resetWagon();
  updateMagnets();
}
function handle(ev) {
  if (ev.type === "ring") {
    world.ringTaken(ev.i);
    Sound.stamp();
    flyStamp(ev.i);
  } else if (ev.type === "leave") {
    lastLeave = true;
    Sound.whoosh();
    if (!said.has("whee") && Math.random() < 0.6) sayOnce("whee");
  } else if (ev.type === "land") {
    lastLeave = false;
    Sound.clack();
    world.burst(ev.at, 12, ["#ffd23f", "#ffffff"], 2.2);
    world.shake(0.08);
  } else if (ev.type === "boost") {
    Sound.boost();
    world.burst(run.pos, 30, ["#ff9a3f", "#ffd23f", "#ffffff"], 3.5);
  } else if (ev.type === "finish") finished();
  else if (ev.type === "fail") failed(ev.reason, ev.at);
}
let got = 0;
function flyStamp(i) {
  got++;
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
  const before = totalStamps(),
    unlockedBefore = SKINS.filter((s) => s.need <= before).length;
  save.stars[level.id] = Math.max(save.stars[level.id] || 0, stars);
  save.rings[level.id] = Math.max(save.rings[level.id] || 0, rings);
  store();
  const fresh = SKINS.filter((s) => s.need <= totalStamps()).slice(unlockedBefore);
  setMode("result");
  setTimeout(() => {
    world.deliver(run ? run.pos : level.finish);
    world.celebrate([level.finish[0] + 1.3, level.finish[1] + 0.5]);
    Sound.fanfare();
    say(rings === level.rings.length ? "perfect" : "delivered", 0.3);
  }, 700);
  setTimeout(() => showResult(stars, fresh), 2300);
}
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
  say(why, 0.25);
  const trace = run.trace;
  setMode("fail");
  world.showTrace(trace, at);
  fails++;
  // После двух неудач появляется лампочка-подсказка
  if (fails >= 2) el("hint").hidden = false;
  setTimeout(() => {
    run = null;
    setMode("edit");
    resetWagon();
    updateMagnets();
  }, 1700);
}
function showResult(stars, fresh) {
  const box = el("result");
  el("result-title").textContent = stars === 3 ? "Все печати!" : "Посылка доставлена!";
  [...el("result-stars").children].forEach((s, i) => s.classList.toggle("on", i < stars));
  const nw = el("result-new");
  if (fresh.length) {
    const s = fresh.at(-1);
    nw.innerHTML = `<img alt="" src="${skinIcon(s.id)}"><span>Новый вагончик: ${s.name}!</span>`;
    nw.hidden = false;
    say("unlock", 1.2);
  } else nw.hidden = true;
  box.hidden = false;
  Sound.star();
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  el("result").hidden = true;
  run = null;
  setMode("edit");
  resetWagon();
  updateMagnets();
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  el("result").hidden = true;
  run = null;
  if (li < LEVELS.length - 1) startLevel(li + 1);
  else openMap();
};

// ---------- Каждый кадр ----------
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
world.onFrame = (dt) => {
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
      if (mode === "run") Sound.roll(run.speed, run.mode === "air");
      else Sound.stopRoll();
    }
  }
  if (hand) moveHand(dt);
};

// ---------- Рука-подсказка ----------
// Призрачная линия эталонного решения и рука, которая её «рисует»
function showGhost(tutorial) {
  const ref = drawStrokes(level, level.solution);
  world.ghost(ref);
  const path = ref.flatMap((r) => r.pts);
  hand = { path, t: 0, loop: tutorial ? Infinity : 2, k: 0 };
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
  box.innerHTML = WORLDS.map((w) => {
    const items = LEVELS.map((l, i) => ({ l, i })).filter((x) => x.l.world === w.id);
    return `<div class="world"><h3>${w.name}</h3><div class="levels">${items
      .map(({ l, i }) => {
        const st = save.stars[l.id] || 0,
          open = unlockedLevel(i);
        const stars = [0, 1, 2].map((k) => (k < st ? "<em>★</em>" : "★")).join("");
        return `<button class="lvl ${l.world}${i === li ? " now" : ""}" data-level="${i}" ${open ? "" : "disabled"} aria-label="Горка ${l.id}: ${l.name}"><b>${open ? l.id : "🔒"}</b><small>${l.name}</small><span class="st">${stars}</span></button>`;
      })
      .join("")}</div></div>`;
  }).join("");
  const total = totalStamps();
  el("stamp-total").textContent = `✉ ${total} печатей`;
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
};
el("map").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.dataset.level) {
    Sound.tap();
    el("map").hidden = true;
    el("result").hidden = true;
    run = null;
    startLevel(+b.dataset.level);
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
startLevel(Math.min(save.level || 0, LEVELS.length - 1), true);
setMode("title");
el("play").onclick = () => {
  unlock();
  Sound.whistle();
  el("title").hidden = true;
  startLevel(li);
};
// Свернули вкладку во время заезда — заезд останавливается, рисунок остаётся
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "run") stopRun();
    if (stroke) endStroke();
    Music.stop();
    stopVoice();
  } else if (save.music && Sound.ctx && mode !== "title") Music.start();
});
// Клавиатура: пробел — поехали/стоп, Z или Backspace — отменить
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
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
    save,
    startLevel,
    // Нарисовать эталонное решение, как будто пальцем
    solve() {
      while (rails.length) removeRail(rails.length - 1);
      for (const r of drawStrokes(level, level.solution)) addRail(r.pts, colorNext);
      updateMagnets();
      updateReady();
    },
  };
