// «Гонка бобрят»: бобрёнок сам бежит по дороге между островами, игрок поворачивает пальцем.
// Брёвнышки с куч превращаются в мостик, когда бежишь в воду — так срезается путь.
// Логика — race.js (проверяется tests/race.mjs), трассы — tracks.js, 3D — world.js.
import { World, CAPS } from "./world.js?v=0ee46457";
import { TRACKS, BOTS } from "./tracks.js?v=0ee46457";
import { Race, STEP } from "./race.js?v=0ee46457";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "bobryata-v1";
function load() {
  const empty = { v: 1, open: 1, best: {}, sound: true, music: true, heard: {}, last: 0 };
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
  map: svg('<rect x="8" y="12" width="48" height="40" rx="6" fill="#fffaf0" stroke="#e8c8a0" stroke-width="4"/><rect x="36" y="18" width="14" height="16" rx="2" fill="#ff4f6d"/><path d="M14 40c6-6 12 4 18-2" fill="none" stroke="#3fb4ff" stroke-width="4" stroke-linecap="round"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#3f8cff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#3f8cff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#9aa8b8"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#8f5bff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#8f5bff"/><circle cx="46" cy="40" r="8" fill="#8f5bff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#9aa8b8" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#9aa8b8"/><circle cx="46" cy="40" r="8" fill="#9aa8b8"/><path d="M8 8l48 48" stroke="#ff4f6d" stroke-width="5" stroke-linecap="round"/>'),
  close: svg('<path d="M16 16l32 32M48 16 16 48" stroke="#ff4f6d" stroke-width="8" stroke-linecap="round"/>'),
};
el("map-open").innerHTML = ICON.map;
el("to-map").innerHTML = ICON.map;
el("map-close").innerHTML = ICON.close;

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
let ti = 0,
  track = null,
  race = null,
  me = null,
  mode = "title",
  acc = 0,
  steer = 0,
  lastCount = 99,
  lastPlace = 4,
  falls = 0,
  usedCut = false,
  ghostSaid = false;
const caps = [CAPS[0], ...BOTS.map((b) => b.cap)];

function startTrack(i, quiet = false) {
  ti = Math.max(0, Math.min(TRACKS.length - 1, i));
  track = TRACKS[ti];
  save.last = ti;
  store();
  race = new Race(track, [{ name: "Ты", speed: 4.2, player: true }, ...BOTS.map((b) => ({ ...b }))]);
  me = race.racers[0];
  world.setRace(race, caps);
  el("track-name").textContent = `${ti + 1}. ${track.name}`;
  el("progress").innerHTML =
    track.gates.map((g) => `<i class="gate" style="left:${(g / track.finish) * 100}%"></i>`).join("") +
    race.racers.map((r, k) => `<span class="dot${k ? "" : " me"}" style="background:${caps[k]}">${k ? "" : "🦫"}</span>`).join("");
  el("result").hidden = true;
  falls = 0;
  usedCut = false;
  ghostSaid = false;
  lastCount = 99;
  lastPlace = 4;
  acc = 0;
  steer = 0;
  mode = quiet ? "title" : "play";
  if (quiet) {
    race.wait = 9999;
    return;
  }
  paintHud();
  // Подсказки голосом
  const seq = [];
  if (!save.heard.hello) {
    save.heard.hello = 1;
    seq.push("hello", "how"); // про брёвнышки — у первой кучи, чтобы не держать малыша на старте
  } else if (ti === 0 && !save.heard.water) seq.push("water");
  store();
  if (seq.length) {
    race.wait = 99;
    speak(...seq).then(() => {
      race.wait = 3;
    });
  } else race.wait = 3;
  el("steer").hidden = ti > 0 && save.heard.steered;
}
function paintHud() {
  if (!race) return;
  const place = race.placeOf(me);
  const p = el("place");
  p.textContent = place;
  p.className = "place p" + place;
  el("planks").textContent = me.planks;
  const dots = el("progress").querySelectorAll(".dot");
  race.racers.forEach((r, k) => (dots[k].style.left = `${Math.min(100, Math.max(0, (r.y / track.finish) * 100))}%`));
}

// ---------- Ввод: водить пальцем влево-вправо (как руль), стрелки или A/D ----------
const canvas = el("stage");
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  unlock();
  if (mode !== "play") return;
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  // Чем дальше палец от места касания, тем круче поворот
  const dx = e.clientX - drag.x,
    k = Math.min(innerWidth, innerHeight) * 0.09;
  steer = Math.max(-1, Math.min(1, dx / k));
  if (Math.abs(steer) > 0.3 && !save.heard.steered) {
    save.heard.steered = 1;
    store();
    el("steer").hidden = true;
  }
});
const up = (e) => {
  if (drag && e.pointerId === drag.id) {
    drag = null;
    steer = 0;
  }
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("lostpointercapture", up);
const keys = new Set();
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(e.code)) {
    unlock();
    keys.add(e.code);
    e.preventDefault();
  }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  drag = null;
  steer = 0;
});
function keySteer() {
  let s = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) s -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) s += 1;
  return s;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    drag = null;
    steer = 0;
    Music.stop();
  } else if (save.music && Sound.ctx && mode !== "title") Music.start();
});

// ---------- События гонки ----------
function handle(e) {
  if (e.type === "go") {
    toast("Марш!");
    Sound.count(true);
  } else if (e.type === "plank") {
    world.placePlank(e.i, e.j, e.r.a);
    if (e.r === me) {
      Sound.plank();
      el("planks").textContent = me.planks;
    }
  } else if (e.type === "pick") {
    if (e.r === me) {
      Sound.pick(e.n);
      world.pick(me);
      if (!save.heard.logs) {
        save.heard.logs = 1;
        store();
        // Дождаться, пока договорит «Марш!»
        setTimeout(() => say("logs"), Math.max(0, busyUntil - performance.now()) + 100);
      }
      const b = el("planks").parentElement;
      b.classList.remove("bump");
      void b.offsetWidth;
      b.classList.add("bump");
    }
  } else if (e.type === "fall") {
    world.fall(e.r);
    if (e.r === me) {
      Sound.splash();
      falls++;
      say(falls === 1 ? "splash" : "more", false, falls > 1);
    }
  } else if (e.type === "gate") {
    if (e.r === me) {
      Sound.gate();
      toast("Ворота!");
    }
  } else if (e.type === "finish") {
    world.celebrate(e.r);
    if (e.r === me) finished(e.place);
  } else if (e.type === "over") {
    if (!me.done) finished(race.placeOf(me));
  }
}
async function finished(place) {
  if (mode !== "play") return;
  mode = "done";
  Sound.fanfare();
  const prev = save.best[track.id] || 9;
  save.best[track.id] = Math.min(prev, place);
  const opened = ti + 1 >= save.open && ti + 1 < TRACKS.length;
  if (opened) save.open = ti + 2;
  store();
  const line = ["first", "second", "third", "fourth"][place - 1];
  speak(line, ...(prev === 9 ? ["postcard"] : []), ...(opened ? ["newTrack"] : []));
  await wait(1700);
  showResult(place);
}
function showResult(place) {
  mode = "result";
  const medal = ["🥇", "🥈", "🥉", "🎗️"][place - 1];
  const colors = ["#ffb000", "#8a98b0", "#d0844a", "#3fb4ff"];
  el("postcard").innerHTML = `<span class="wave"></span><span class="pic">${track.parcel}🦫</span><span class="stamp" style="--c:${colors[place - 1]}"><span>${medal}<small>${track.name}</small></span></span>`;
  el("result-title").textContent = place === 1 ? "Первое место!" : place === 4 ? "Добежали!" : `${place}-е место!`;
  el("result-text").textContent = usedCut ? `Мостиков построено: ${race.bridges.size}. Срезка удалась!` : "Попробуй срезать путь по мостику — так быстрее!";
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
// ---------- Трассы и открытки ----------
function openMap() {
  el("tracks").innerHTML = TRACKS.map((t, i) => {
    const open = i < save.open,
      best = save.best[t.id];
    const medal = best ? ["🥇", "🥈", "🥉", "🎗️"][best - 1] : "";
    return `<button class="trk${i === ti ? " now" : ""}" style="--bg:${["linear-gradient(#7fe08f,#3fbf5a)", "linear-gradient(#7fb8ff,#3f8cff)", "linear-gradient(#ffb36b,#ff7a5f)", "linear-gradient(#5fe0c0,#1fa08a)", "linear-gradient(#4fe0f0,#1f8fe8)"][i % 5]}" data-track="${i}" ${open ? "" : "disabled"}><span class="ic pc">${open ? t.parcel : "🔒"}</span><b>${t.name}</b><small>${best ? "лучшее место " + best : "ещё не пройдена"}</small><span class="st">${medal}</span></button>`;
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
};
el("tracks").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  Sound.tap();
  el("map").hidden = true;
  el("title").hidden = true;
  startTrack(+b.dataset.track);
});

// ---------- Каждый кадр ----------
function showCount(n) {
  const c = el("count");
  c.textContent = n;
  c.classList.remove("show");
  void c.offsetWidth;
  c.classList.add("show");
}
world.onFrame = (dt) => {
  if (!race) return;
  if (mode === "play" || mode === "done") {
    // Отсчёт перед стартом
    if (race.state === "ready" && race.wait < 3.05) {
      const n = Math.ceil(race.wait);
      if (n !== lastCount && n > 0) {
        lastCount = n;
        showCount(n);
        Sound.count(false);
      }
    }
    acc += dt;
    const s = keySteer() || steer;
    for (let n = 0; acc >= STEP && n < 10; n++) {
      acc -= STEP;
      race.step([mode === "play" ? s : 0]);
      for (const e of race.events.splice(0)) handle(e);
    }
    if (race.state === "run" && me.state === "run" && !me.done) {
      Sound.step();
      // Срезка: бежит по мостику
      const [i, j] = race.map.cell(me.x, me.y);
      if (!race.map.isLand(i, j) && !usedCut) {
        usedCut = true;
        say("shortcut", false, false);
      }
      // Призрачные мостики, когда смотрит на воду
      const pv = race.preview(me);
      world.showPreview(pv.cells.length ? pv : null);
      if (pv.cells.length && !ghostSaid && !save.heard.ghost) {
        ghostSaid = true;
        save.heard.ghost = 1;
        store();
        say("ghost", false, false);
      }
    } else world.showPreview(null);
    const place = race.placeOf(me);
    if (place === 1 && lastPlace > 1 && race.state === "run" && race.t > 3) say("lead", false, false);
    lastPlace = place;
    paintHud();
  }
  world.sync(race, dt);
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
  window.bob = {
    world,
    TRACKS,
    get race() {
      return race;
    },
    get mode() {
      return mode;
    },
    save,
    startTrack,
    setSteer(v) {
      steer = v;
    },
  };
