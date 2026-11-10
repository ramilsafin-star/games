// «Звездочёт Тишка»: мышонок пробирается по обсерватории, настраивает телескопы и не попадается в свет
// фонарика робота-сторожа. Логика — sim.js (проверяется tests/rooms.mjs), 3D — world.js, комнаты — rooms.js.
import { World } from "./world.js?v=dbc40355";
import { ROOMS } from "./rooms.js?v=dbc40355";
import { Game } from "./sim.js?v=dbc40355";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "tishka-v1";
function load() {
  const empty = { v: 1, stars: {}, open: 1, sound: true, music: true, heard: {}, last: 0 };
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
  atlas: svg('<circle cx="32" cy="32" r="26" fill="#2e2380"/><path d="M14 40l12-14 10 8 14-16" fill="none" stroke="#ffe066" stroke-width="3"/><circle cx="14" cy="40" r="4" fill="#fff"/><circle cx="26" cy="26" r="4" fill="#fff"/><circle cx="36" cy="34" r="4" fill="#fff"/><circle cx="50" cy="18" r="5" fill="#ffe066"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#fff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#ffffff88"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff6f9f" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#fff"/><circle cx="46" cy="40" r="8" fill="#fff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#ffffff88" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#ffffff88"/><circle cx="46" cy="40" r="8" fill="#ffffff88"/><path d="M8 8l48 48" stroke="#ff6f9f" stroke-width="5" stroke-linecap="round"/>'),
  close: svg('<path d="M16 16l32 32M48 16 16 48" stroke="#ff8fb1" stroke-width="8" stroke-linecap="round"/>'),
  again: svg('<path d="M50 30a18 18 0 1 1-6-13" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M46 6v14H32" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
};
el("atlas-open").innerHTML = ICON.atlas;
el("atlas-close").innerHTML = ICON.close;
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
  speakToken = 0;
async function say(id, delay = 0, chain = false) {
  if (!chain) speakToken++;
  if (!save.sound || !Sound.ctx) return;
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
    src.start(ctx.currentTime + delay);
    voice = src;
    Music.duck(buf.duration + delay + 0.2, 0.35);
    await new Promise((r) => (src.onended = r));
  } catch {}
}
async function speak(...ids) {
  const token = ++speakToken;
  for (const id of ids) {
    if (token !== speakToken) return;
    await say(id, 0, true);
    await wait(200);
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
let ri = 0,
  game = null,
  mode = "title",
  keys = new Set(),
  hold = null,
  caughtHere = 0,
  handTimer = 0;

function startRoom(i, quiet = false) {
  ri = Math.max(0, Math.min(ROOMS.length - 1, i));
  save.last = ri;
  store();
  const def = ROOMS[ri];
  game = new Game(def);
  world.setRoom(game);
  caughtHere = 0;
  el("room-num").textContent = ri + 1;
  el("room-name").textContent = def.name;
  paintGoals();
  paintFly();
  el("result").hidden = true;
  el("atlas").hidden = true;
  mode = quiet ? "title" : "play";
  if (quiet) return;
  // Подсказки голосом: что нового в этой комнате
  const seq = [];
  if (ri === 0 && !save.heard.hello) {
    save.heard.hello = 1;
    seq.push("hello", "walk", "light", "scope");
    showHand();
  } else if (def.hint && !save.heard[def.hint]) {
    save.heard[def.hint] = 1;
    seq.push(def.hint);
  }
  store();
  speak(...seq);
}
function paintGoals() {
  const g = game;
  el("goals").innerHTML =
    g.terms.map((t) => `<i class="${t.done ? "on" : ""}" aria-label="Телескоп">🔭</i>`).join("") + (g.star ? `<i class="star${g.star.got ? " on" : ""}" aria-label="Звёздочка">⭐</i>` : "");
}
function paintFly() {
  el("fly-count").textContent = game.flies;
  el("fly").disabled = game.flies <= 0 || !!game.fly;
  el("fly").classList.toggle("ready", ROOMS[ri].needFly && game.flies > 0 && !game.fly && !save.heard.flyUsed);
}

// ---------- Управление: нажми на пол — Тишка идёт туда; держишь палец — идёт за пальцем ----------
const canvas = el("stage");
canvas.addEventListener("pointerdown", (e) => {
  unlock();
  if (mode !== "play") return;
  const p = world.pick(e.clientX, e.clientY);
  if (!p) return;
  hold = { id: e.pointerId, at: performance.now() };
  canvas.setPointerCapture(e.pointerId);
  game.goTo(p[0], p[1]);
  hideHand();
  Sound.tap();
});
canvas.addEventListener("pointermove", (e) => {
  if (!hold || e.pointerId !== hold.id || mode !== "play") return;
  const now = performance.now();
  if (now - hold.at < 90) return;
  hold.at = now;
  const p = world.pick(e.clientX, e.clientY);
  if (p) game.goTo(p[0], p[1]);
});
const release = (e) => {
  if (hold && e.pointerId === hold.id) hold = null;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
// Второй палец — кнопка светлячка (работает одновременно с ходьбой)
el("fly").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  unlock();
  if (mode !== "play") return;
  if (game.launch()) {
    save.heard.flyUsed = 1;
    store();
    Sound.fly();
  } else Sound.thud?.();
  paintFly();
});
const DIRS = { arrowup: [0, -1], w: [0, -1], ц: [0, -1], arrowdown: [0, 1], s: [0, 1], ы: [0, 1], arrowleft: [-1, 0], a: [-1, 0], ф: [-1, 0], arrowright: [1, 0], d: [1, 0], в: [1, 0] };
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (mode === "title" && (k === "enter" || k === " ")) return el("play").click();
  if (DIRS[k]) {
    keys.add(k);
    e.preventDefault();
  }
  if ((k === "f" || k === "а" || k === " ") && mode === "play") el("fly").dispatchEvent(new PointerEvent("pointerdown"));
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
function keyDir() {
  let x = 0,
    z = 0;
  for (const k of keys) {
    x += DIRS[k][0];
    z += DIRS[k][1];
  }
  return x || z ? [x, z] : null;
}

// ---------- Рука-подсказка: первая комната, показывает на ящик рядом ----------
function showHand() {
  handTimer = 6;
  el("hand").hidden = false;
}
function hideHand() {
  handTimer = 0;
  el("hand").hidden = true;
}

// ---------- Каждый кадр ----------
world.onFrame = (dt) => {
  if (!game) return;
  if (handTimer > 0) {
    handTimer -= dt;
    const tm = game.terms[0];
    const s = world.screen(tm.x + 1, tm.z, 0.2);
    el("hand").style.transform = `translate(${s.x - 18}px, ${s.y - 6 + Math.abs(Math.sin(world.time * 4)) * -14}px)`;
    if (handTimer <= 0) hideHand();
  }
  if (mode !== "play") return;
  game.step(dt, { dir: keyDir() });
  if (game.p.moving) Sound.step();
  if (game.terms.some((t) => !t.done && t.prog > 0)) Sound.tuning();
  for (const ev of game.events.splice(0)) handle(ev);
  paintFly();
};
function handle(ev) {
  if (ev.type === "warn") {
    Sound.hmm();
    say("warn");
  } else if (ev.type === "caught") {
    caughtHere++;
    Sound.spotted();
    world.caught(ev.at, ev.g);
    toast("Бип? Кто тут?");
    // Подсказка, если не получается: сначала «подожди», потом совет комнаты
    if (caughtHere === 1) say("caught", 0.5);
    else if (caughtHere === 2) say("wait", 0.5);
    else if (ROOMS[ri].hint) say(ROOMS[ri].hint, 0.5);
  } else if (ev.type === "tuned") {
    Sound.tunedSound();
    world.tuned(game.terms.indexOf(ev.tm));
    toast("Телескоп настроен!");
    if (!game.terms.every((t) => t.done)) say("tuned");
    paintGoals();
  } else if (ev.type === "open") {
    Sound.ding();
    world.opened();
    say("open", 0.4);
  } else if (ev.type === "star") {
    Sound.star();
    world.gotStar();
    say("star");
    paintGoals();
  } else if (ev.type === "distract") Sound.beep(false);
  else if (ev.type === "finish") finish();
}
async function finish() {
  mode = "result";
  hold = null;
  Sound.whoosh();
  world.finished();
  const stars = game.stars();
  save.stars[ri] = Math.max(save.stars[ri] || 0, stars);
  const opened = ri + 1 >= save.open && ri + 1 < ROOMS.length;
  if (opened) save.open = ri + 2;
  store();
  await wait(900);
  Sound.fanfare();
  showResult(stars, opened);
  speak("win", "sky-" + ri, ...(opened || ri === ROOMS.length - 1 ? ["atlas"] : []));
}

// ---------- Созвездие: рисуется звёздами и линиями ----------
function drawSky(canvas, sky, progress = 1, small = false) {
  const x = canvas.getContext("2d"),
    W = canvas.width,
    H = canvas.height;
  const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
  g.addColorStop(0, "#2e2380");
  g.addColorStop(1, "#0c0828");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // Мелкие звёзды фона
  let seed = sky.name.length * 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = "#ffffff88";
  for (let k = 0; k < (small ? 30 : 70); k++) {
    x.beginPath();
    x.arc(rnd() * W, rnd() * H, rnd() * 1.4 + 0.3, 0, 7);
    x.fill();
  }
  const pad = W * 0.16,
    P = (s) => [pad + s[0] * (W - 2 * pad), pad + s[1] * (H - 2 * pad)];
  x.strokeStyle = "#9fe8ff";
  x.lineWidth = small ? 2 : 3;
  x.shadowColor = "#9fe8ff";
  x.shadowBlur = 10;
  sky.lines.forEach(([a, b], i) => {
    const q = Math.max(0, Math.min(1, progress * sky.lines.length - i));
    if (!q) return;
    const A = P(sky.stars[a]),
      B = P(sky.stars[b]);
    x.beginPath();
    x.moveTo(...A);
    x.lineTo(A[0] + (B[0] - A[0]) * q, A[1] + (B[1] - A[1]) * q);
    x.stroke();
  });
  x.shadowColor = "#ffe066";
  x.shadowBlur = 16;
  for (const s of sky.stars) {
    const [px, py] = P(s);
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.arc(px, py, small ? 4 : 7, 0, 7);
    x.fill();
    x.fillStyle = "#ffe066";
    x.beginPath();
    x.arc(px, py, small ? 2 : 3.5, 0, 7);
    x.fill();
  }
  x.shadowBlur = 0;
}
function showResult(stars, opened) {
  const def = ROOMS[ri];
  el("sky-name").textContent = def.sky.name;
  [...el("stars").children].forEach((s, k) => s.classList.toggle("on", k < stars));
  const parts = ["Телескопы настроены"];
  parts.push(caughtHere ? `Робот заметил ${caughtHere} раз` : "Робот ни разу не заметил");
  if (game.star) parts.push(game.star.got ? "звёздочка найдена" : "звёздочка осталась в комнате");
  el("result-text").textContent = parts.join(" · ") + ".";
  el("next").hidden = ri >= ROOMS.length - 1;
  el("result").hidden = false;
  // Созвездие проявляется линия за линией
  const c = el("sky");
  const t0 = performance.now();
  const anim = () => {
    const p = Math.min(1, (performance.now() - t0) / 1600);
    drawSky(c, def.sky, p);
    if (p < 1 && !el("result").hidden) requestAnimationFrame(anim);
  };
  anim();
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  startRoom(ri);
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  startRoom(ri + 1);
};

// ---------- Звёздный атлас ----------
function openAtlas() {
  if (mode === "play") mode = "paused";
  const box = el("rooms");
  box.innerHTML = ROOMS.map((r, i) => {
    const st = save.stars[i] || 0,
      open = i < save.open;
    const s = [0, 1, 2].map((k) => (k < st ? "<em>★</em>" : "★")).join("");
    return `<button class="roomcard${i === ri ? " now" : ""}" data-room="${i}" ${open ? "" : "disabled"} aria-label="Комната ${i + 1}: ${r.name}"><canvas width="150" height="150" data-sky="${i}"></canvas><b>${st ? r.sky.name : open ? "?" : "🔒"}</b><small>${i + 1}. ${r.name}</small><span class="st">${s}</span></button>`;
  }).join("");
  box.querySelectorAll("canvas").forEach((c) => {
    const i = +c.dataset.sky,
      sky = ROOMS[i].sky;
    if (save.stars[i]) drawSky(c, sky, 1, true);
    else drawSky(c, { ...sky, lines: [], stars: [] }, 1, true);
  });
  el("atlas").hidden = false;
}
el("atlas-open").onclick = () => {
  unlock();
  Sound.tap();
  openAtlas();
};
el("atlas-close").onclick = () => {
  Sound.tap();
  el("atlas").hidden = true;
  if (mode === "paused") mode = "play";
};
el("rooms").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  Sound.tap();
  startRoom(+b.dataset.room);
});

// ---------- Заставка ----------
startRoom(Math.min(save.last || 0, save.open - 1), true);
el("play").onclick = () => {
  unlock();
  Sound.tap();
  el("title").hidden = true;
  startRoom(ri);
};
el("portrait-ok").onclick = () => {
  document.body.classList.add("portrait-ok");
  try {
    sessionStorage.setItem("tishka-portrait", "1");
  } catch {}
};
try {
  if (sessionStorage.getItem("tishka-portrait")) document.body.classList.add("portrait-ok");
} catch {}
// Свернули вкладку — всё замирает (роботы тоже)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    hold = null;
    Music.stop();
  } else if (save.music && Sound.ctx && mode !== "title") Music.start();
});
if (new URLSearchParams(location.search).has("debug"))
  window.tishka = {
    world,
    ROOMS,
    get game() {
      return game;
    },
    get mode() {
      return mode;
    },
    save,
    startRoom,
  };
