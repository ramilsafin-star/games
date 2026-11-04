// «Велопанда»: панда едет на заднем колесе. Держишь палец — колесо поднимается, отпустил — опускается.
// Физика — ride.js (проверяется tests/ride.mjs), трассы — tracks.js, 3D — world.js.
import { World, THEMES, BIKES } from "./world.js?v=7ab9d98d";
import { TRACKS } from "./tracks.js?v=7ab9d98d";
import { Ride, STEP, CONFIG } from "./ride.js?v=7ab9d98d";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение: рекорд и звёзды каждой трассы, открытые трассы, велосипед ----------
const KEY = "velopanda-v1";
function load() {
  const empty = { v: 1, open: 1, best: {}, stars: {}, got: {}, done: {}, bike: "red", sound: true, music: true, heard: {}, last: 0 };
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
const totalStars = () => Object.values(save.got).reduce((a, b) => a + b.length, 0);

// ---------- Значки ----------
const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const ICON = {
  map: svg('<path d="M6 14l16-6 20 6 16-6v42l-16 6-20-6-16 6z" fill="#7fe08f"/><path d="M22 8v42M42 14v42" stroke="#3fbf5a" stroke-width="3"/><path d="M12 40c8-10 16 4 22-8s14-6 18-12" fill="none" stroke="#ff4f6d" stroke-width="4" stroke-dasharray="5 4" stroke-linecap="round"/>'),
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
  ride = null,
  mode = "title",
  acc = 0,
  hold = false,
  lastWarn = 0,
  fails = { front: 0, back: 0 },
  saidGood = false;
const bike = () => BIKES.find((b) => b.id === save.bike) || BIKES[0];

function startTrack(i, quiet = false) {
  ti = Math.max(0, Math.min(TRACKS.length - 1, i));
  track = TRACKS[ti];
  save.last = ti;
  store();
  world.setTrack(track);
  world.setBike(bike(), track.parcel);
  el("track-name").textContent = `${ti + 1}. ${track.name}`;
  el("marks").innerHTML = track.stars.map(([x, , h]) => `<i class="${h}" style="left:${(x / track.length) * 100}%"></i>`).join("");
  fails = { front: 0, back: 0 };
  resetRide(quiet);
}
function resetRide(quiet = false) {
  ride = new Ride(track);
  hold = false;
  acc = 0;
  saidGood = false;
  world.placeAtStart(ride);
  world.resetStars();
  const best = save.best[track.id] || 0;
  world.showRecord(best ? CONFIG.gate + best : 0);
  el("rec").hidden = !best;
  el("rec").style.left = `${Math.min(100, ((CONFIG.gate + best) / track.length) * 100)}%`;
  el("result").hidden = true;
  mode = quiet ? "title" : "play";
  paintHud();
  el("hold-hint").hidden = quiet;
  if (quiet) return;
  // Голос: что делать, что нового
  if (!save.heard.hello) {
    save.heard.hello = 1;
    store();
    speak("hello", "how");
  } else if (ti === 2 && !save.heard.uphill) {
    save.heard.uphill = 1;
    store();
    say("uphill");
  }
}
function paintHud() {
  if (!ride) return;
  el("meters").textContent = Math.floor(ride.meters());
  el("star-count").textContent = `${ride.stars.size}/${track.stars.length}`;
  el("bar").style.width = `${Math.min(100, (ride.x / track.length) * 100)}%`;
  [...el("marks").children].forEach((m, i) => m.classList.toggle("got", ride.stars.has(i)));
}

// ---------- Ввод: держать палец где угодно на поле (или пробел / стрелку вверх) ----------
const canvas = el("stage");
const fingers = new Set();
canvas.addEventListener("pointerdown", (e) => {
  unlock();
  if (mode !== "play") return;
  canvas.setPointerCapture(e.pointerId);
  fingers.add(e.pointerId);
  hold = true;
});
const up = (e) => {
  fingers.delete(e.pointerId);
  hold = fingers.size > 0 || keyHold;
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("lostpointercapture", up);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
let keyHold = false;
addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    if (mode === "title") return el("play").click();
    if (mode === "result") return el("result").querySelector(".big:not([hidden])")?.click();
    unlock();
    keyHold = true;
    hold = true;
  }
});
addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    keyHold = false;
    hold = fingers.size > 0;
  }
});
// UW-4: потеря касания или фокуса — подъём прекращается
function releaseAll() {
  fingers.clear();
  keyHold = false;
  hold = false;
}
addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseAll();
    Sound.ride(false);
    Music.stop();
  } else if (save.music && Sound.ctx && mode !== "title") Music.start();
});

// ---------- События заезда ----------
function handle(e) {
  if (e.type === "go") {
    el("hold-hint").hidden = true;
    Sound.bell();
  } else if (e.type === "up") Sound.lift();
  else if (e.type === "gate") {
    toast("Старт!");
    Sound.ding();
    if (!save.heard.gate) {
      save.heard.gate = 1;
      store();
      say("gate", false, false);
    }
  } else if (e.type === "star") {
    Sound.star();
    world.starTaken(e.i);
    if (ride.stars.size === track.stars.length) say("allStars", false, false);
  } else if (e.type === "warn") {
    const now = performance.now();
    if (now - lastWarn > 1500) {
      lastWarn = now;
      Sound.warn(e.kind);
      if (Math.random() < 0.4) say(e.kind === "high" ? "high" : "low", false, false);
    }
  } else if (e.type === "train") {
    Sound.oops();
    el("hold-hint").hidden = false;
    say(e.why === "back" ? "tipHint" : "train");
  } else if (e.type === "resume") el("hold-hint").hidden = true;
  else if (e.type === "fail") failed(e.reason);
  else if (e.type === "done") finished();
}
async function failed(reason) {
  mode = "fail";
  releaseAll();
  Sound.ride(false);
  Sound.oops();
  world.fall(reason);
  fails[reason]++;
  const m = ride.meters();
  const prev = save.best[track.id] || 0;
  const record = m >= 1 && m > prev + 0.5;
  if (record) {
    save.best[track.id] = m;
    store();
  }
  keepStars();
  // Подсказка по причине: после двух одинаковых ошибок — совет, что делать иначе
  const line = fails[reason] >= 2 ? (reason === "back" ? "tipHint" : "lowHint") : reason;
  await wait(400);
  speak(line, ...(record && prev ? ["record"] : []));
  await wait(1100);
  showResult(false, m, record && prev > 0);
}
function keepStars() {
  const got = new Set(save.got[track.id] || []);
  ride.stars.forEach((i) => got.add(i));
  save.got[track.id] = [...got];
  store();
}
async function finished() {
  mode = "done";
  releaseAll();
  Sound.ride(false);
  Sound.fanfare();
  world.finish();
  const m = ride.meters();
  const prev = save.best[track.id] || 0;
  save.best[track.id] = Math.max(prev, m);
  const n = ride.stars.size,
    all = track.stars.length;
  const stars = 1 + (n >= all / 2 ? 1 : 0) + (n === all ? 1 : 0);
  save.stars[track.id] = Math.max(save.stars[track.id] || 0, stars);
  const before = totalStars();
  keepStars();
  const bikeBefore = BIKES.filter((b) => b.need <= before).length,
    bikeAfter = BIKES.filter((b) => b.need <= totalStars()).length;
  const opened = ti + 1 >= save.open && ti + 1 < TRACKS.length;
  if (opened) save.open = ti + 2;
  save.done[track.id] = 1;
  store();
  speak("finish", "thanks", ...(n === all ? ["allStars"] : []), ...(opened ? ["newTrack"] : []), ...(bikeAfter > bikeBefore ? ["newBike"] : []));
  await wait(1800);
  showResult(true, m, false, stars, bikeAfter > bikeBefore);
}
function showResult(done, m, record, stars = 0, newBike = false) {
  mode = "result";
  el("result-icon").textContent = done ? track.parcel : record ? "🏆" : "🐼";
  el("result-title").textContent = done ? "Посылка доставлена!" : record ? "Новый рекорд!" : "Ой, упали!";
  el("stars").hidden = !done;
  [...el("stars").children].forEach((s, i) => s.classList.toggle("on", i < stars));
  const best = save.best[track.id] || 0;
  el("result-text").textContent = done
    ? `Звёздочек: ${ride.stars.size} из ${track.stars.length}${newBike ? " · новый велосипед!" : ""}`
    : `На заднем колесе: ${Math.floor(m)} м · рекорд ${Math.floor(best)} м`;
  el("next").hidden = !done || ti >= TRACKS.length - 1;
  el("result").hidden = false;
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  world.setBike(bike(), track.parcel);
  resetRide();
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

// ---------- Трассы и велосипеды ----------
const TRACK_BG = { park: "linear-gradient(#7fe08f,#3fbf5a)", meadow: "linear-gradient(#c2e85f,#7fbf3f)", beach: "linear-gradient(#7fd8ff,#3fa8e8)", city: "linear-gradient(#b8a8ff,#8f7fe8)", snow: "linear-gradient(#a8c8ff,#6f8fff)", candy: "linear-gradient(#ff9fd0,#e86fb0)" };
const TRACK_IC = { park: "🌳", meadow: "🌻", beach: "🏖️", city: "🏙️", snow: "🏔️", candy: "🍭" };
function openMap() {
  mode = mode === "play" ? "map" : mode;
  releaseAll();
  el("tracks").innerHTML = TRACKS.map((t, i) => {
    const open = i < save.open,
      st = save.stars[t.id] || 0,
      best = save.best[t.id] || 0;
    const s = [0, 1, 2].map((k) => (k < st ? "<em>★</em>" : "★")).join("");
    return `<button class="trk${i === ti ? " now" : ""}" style="--bg:${TRACK_BG[t.theme]}" data-track="${i}" ${open ? "" : "disabled"} aria-label="${t.name}"><span class="ic">${open ? (i === 0 ? "🚲" : TRACK_IC[t.theme]) : "🔒"}</span><b>${t.name}</b><small>${best ? "рекорд " + Math.floor(best) + " м" : t.length - CONFIG.gate + " м"}</small><span class="st">${s}</span></button>`;
  }).join("");
  const total = totalStars();
  el("star-total").textContent = `⭐ ${total}`;
  el("bikes").innerHTML = BIKES.map((b) => {
    const open = total >= b.need;
    const c = b.frame === "rainbow" ? "linear-gradient(90deg,#ff4f6d,#ffb02e,#ffe14d,#3fdc7a,#3f8cff,#9b5cff)" : b.frame;
    return `<button class="bk${save.bike === b.id ? " on" : ""}" data-bike="${b.id}" ${open ? "" : "disabled"}><i style="--c:${c}"></i>${open ? b.name : "⭐ " + b.need}</button>`;
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
  if (mode === "map" || mode === "title") resetRide();
  else if (mode === "result") el("result").hidden = false;
};
el("map").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.dataset.track) {
    Sound.tap();
    el("map").hidden = true;
    el("title").hidden = true;
    startTrack(+b.dataset.track);
  } else if (b.dataset.bike) {
    Sound.gift();
    save.bike = b.dataset.bike;
    store();
    world.setBike(bike(), track.parcel);
    world.placeAtStart(ride);
    openMap();
  }
});

// ---------- Кадр: шаг 1/120 с, указатель угла над пандой ----------
const gauge = el("gauge"),
  gx = gauge.getContext("2d");
function drawGauge() {
  if (!ride || mode !== "play" || ride.state === "start") {
    gauge.hidden = true;
    return;
  }
  gauge.hidden = false;
  const rel = ride.a - ride.slope(ride.x);
  const p = world.screen([ride.x - 0.3, (world.g ? world.g(ride.x) : 0) + 2.9, 0]);
  gauge.style.transform = `translate(${p.x - 75}px, ${p.y - 60}px)`;
  const W = 200,
    H = 120,
    cx = 100,
    cy = 108,
    r = 82;
  gx.clearRect(0, 0, W, H);
  const arc = (a0, a1, color, w = 18) => {
    gx.strokeStyle = color;
    gx.lineWidth = w;
    gx.beginPath();
    gx.arc(cx, cy, r, Math.PI + a0, Math.PI + a1);
    gx.stroke();
  };
  gx.lineCap = "butt";
  // 0° — колесо на земле (слева), 90° — свечкой (справа); зелёная — хорошая зона
  const k = Math.PI / CONFIG.tip;
  arc(0, 0.14 * k, "#ff6f8f");
  arc(0.14 * k, (CONFIG.tip - 0.24) * k, "#5fe08a");
  arc((CONFIG.tip - 0.24) * k, Math.PI, "#ff6f8f");
  arc(0, Math.PI, "#ffffff55", 4);
  const ang = Math.PI + Math.max(0, Math.min(Math.PI, rel * k));
  gx.strokeStyle = "#23305a";
  gx.lineWidth = 7;
  gx.lineCap = "round";
  gx.beginPath();
  gx.moveTo(cx, cy);
  gx.lineTo(cx + Math.cos(ang) * (r - 6), cy + Math.sin(ang) * (r - 6));
  gx.stroke();
  gx.fillStyle = "#23305a";
  gx.beginPath();
  gx.arc(cx, cy, 9, 0, 7);
  gx.fill();
}
world.onFrame = (dt) => {
  if (!ride) return;
  if (mode === "play") {
    acc += dt;
    for (let n = 0; acc >= STEP && n < 20; n++) {
      acc -= STEP;
      ride.step(hold);
      for (const e of ride.events.splice(0)) handle(e);
      if (mode !== "play") break;
    }
    if (ride.state === "ride") Sound.ride(true, !ride.front);
    else Sound.ride(false);
    // Похвала за долгое заднее колесо
    if (!saidGood && ride.meters() > 25 && !ride.front) {
      saidGood = true;
      say("good", false, false);
    }
    paintHud();
  }
  world.syncRide(ride, dt);
  drawGauge();
};

// ---------- Заставка ----------
startTrack(Math.min(save.last || 0, save.open - 1), true);
el("play").onclick = () => {
  unlock();
  Sound.bell();
  el("title").hidden = true;
  resetRide();
};
if (new URLSearchParams(location.search).has("debug"))
  window.panda = {
    world,
    TRACKS,
    get ride() {
      return ride;
    },
    get mode() {
      return mode;
    },
    save,
    startTrack,
    setHold(v) {
      hold = v;
    },
  };
