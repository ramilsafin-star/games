// «Светлячковый концерт»: светлячки-нотки летят по дорожкам, ребёнок нажимает на кружок в такт —
// звучит нота мелодии, светлячок зажигает окошко концертного домика. Ритм — rhythm.js, 3D — world.js.
import { Stage, LANE_COLORS } from "./world.js?v=8dc05680";
import { SONGS, CHORDS } from "./songs.js?v=8dc05680";
import { parseSong, Judge, Clock, WINDOW } from "./rhythm.js?v=8dc05680";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "svetlyachki-v1";
function load() {
  const empty = { v: 1, best: {}, open: 1, sound: true, music: true, heard: {}, last: 0 };
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
  list: svg('<rect x="8" y="10" width="48" height="44" rx="8" fill="#ffe066"/><path d="M18 24h28M18 34h28M18 44h18" stroke="#7a3fb8" stroke-width="5" stroke-linecap="round"/>'),
  pause: svg('<rect x="16" y="12" width="11" height="40" rx="4" fill="#fff"/><rect x="37" y="12" width="11" height="40" rx="4" fill="#fff"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#fff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#ffffff88"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff6f9f" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#fff"/><circle cx="46" cy="40" r="8" fill="#fff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#ffffff88" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#ffffff88"/><circle cx="46" cy="40" r="8" fill="#ffffff88"/><path d="M8 8l48 48" stroke="#ff6f9f" stroke-width="5" stroke-linecap="round"/>'),
  again: svg('<path d="M50 30a18 18 0 1 1-6-13" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M46 6v14H32" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
};
el("list").innerHTML = ICON.list;
el("to-list").innerHTML = ICON.list;
el("pause").innerHTML = ICON.pause;
el("again").innerHTML = ICON.again;

// ---------- Звук и голос ----------
function unlock() {
  Sound.unlock();
}
function paintToggles() {
  el("sound").innerHTML = save.sound ? ICON.soundOn : ICON.soundOff;
  el("sound").setAttribute("aria-label", save.sound ? "Выключить звук" : "Включить звук");
  el("music").innerHTML = save.music ? ICON.musicOn : ICON.musicOff;
  el("music").setAttribute("aria-label", save.music ? "Выключить музыку" : "Включить музыку");
}
Sound.setOn(save.sound);
Band.on = save.music;
paintToggles();
el("sound").onclick = () => {
  unlock();
  save.sound = !save.sound;
  Sound.setOn(save.sound);
  store();
  paintToggles();
};
el("music").onclick = () => {
  unlock();
  save.music = !save.music;
  Band.setOn(save.music);
  store();
  paintToggles();
};
const recordings = new Map();
let voice = null;
async function say(id, delay = 0) {
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
    Band.duck(buf.duration + delay + 0.3);
    await new Promise((r) => (src.onended = r));
  } catch {}
}

// ---------- Сцена ----------
let stage;
try {
  stage = new Stage(el("stage"));
} catch (e) {
  console.warn("3D недоступно", e);
  el("nogl").hidden = false;
  throw e;
}
stage.onBoom = () => Sound.boom();

// Часы песни идут по performance.now() — одинаково и до, и после включения звука.
// Аккомпанемент планируется относительно них; задержку вывода звука вычитаем из того,
// что видно и что оценивается (lat), — тогда светлячок садится на кружок ровно со звуком
const audioNow = () => performance.now() / 1000;
const lat = () => {
  const c = Sound.ctx;
  return c ? Math.min(0.25, c.outputLatency || c.baseLatency || 0) : 0;
};

let mode = "title",
  song = null,
  si = 0,
  judge = null,
  clock = null,
  lastBeat = -99,
  resumeAt = 0,
  demo = null,
  handShown = false;
const LIGHTS = () => stage.lightList().length;

// ---------- Демо в меню: песенка играет сама, светлячки ловятся сами ----------
function startDemo() {
  const s = parseSong(SONGS[4]);
  const c = new Clock(audioNow);
  c.start(-0.5);
  demo = { song: s, clock: c, done: new Set(), lit: 0 };
  stage.setLanes(s.lanes);
  stage.resetLights();
  if (Sound.ctx) Band.play(s, c, CHORDS, true);
}
function stopDemo() {
  demo = null;
  Band.stop();
}

// ---------- Песня ----------
function openMenu() {
  mode = "menu";
  el("menu").hidden = false;
  el("paused").hidden = true;
  el("result").hidden = true;
  el("pause").hidden = true;
  el("score").hidden = true;
  el("song-name").textContent = "Светлячковый концерт";
  el("songs").innerHTML = SONGS.map((s, i) => {
    const b = save.best[s.id],
      open = i < save.open;
    const st = [0, 1, 2].map((k) => (b && k < b.stars ? "<em>★</em>" : "★")).join("");
    const lanes = parseSong(s).lanes.length;
    return `<button class="songcard${i === si ? " now" : ""}" data-song="${i}" ${open ? "" : "disabled"} aria-label="${s.name}"><span class="ic">${open ? s.icon : "🔒"}</span><b>${s.name}</b><small>${lanes === 1 ? "1 дорожка" : lanes + " дорожки"} · ${s.bpm < 75 ? "🐢 медленно" : s.bpm < 90 ? "🐇 бодро" : "🚀 быстро"}</small><span class="st">${st}</span></button>`;
  }).join("");
  if (!demo) startDemo();
}
el("songs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  unlock();
  Sound.tap();
  startSong(+b.dataset.song);
});
async function startSong(i) {
  stopDemo();
  si = i;
  save.last = i;
  store();
  song = parseSong(SONGS[i]);
  judge = new Judge(song.notes);
  clock = new Clock(audioNow);
  lastBeat = -99;
  handShown = false;
  el("menu").hidden = true;
  el("result").hidden = true;
  el("paused").hidden = true;
  el("song-name").textContent = song.icon + " " + song.name;
  el("score").hidden = false;
  el("pause").hidden = false;
  el("hits").textContent = 0;
  el("total").textContent = song.notes.length;
  stage.setLanes(song.lanes);
  stage.resetLights();
  // Сова объясняет новое: как играть, две дорожки, четыре дорожки
  const tip = song.lanes.length === 1 ? "how" : song.lanes.length === 2 ? "two" : "four";
  mode = "intro";
  if (!save.heard[tip]) {
    save.heard[tip] = 1;
    store();
    await say(tip);
  } else await say("ready");
  if (mode !== "intro") return;
  // Отсчёт: четыре доли перед первой нотой, щелчки и большие цифры
  const lead = 4 * song.beat + 0.4;
  clock.start(-lead);
  for (let k = 0; k < 4; k++) Sound.click(k === 0, lead - (4 - k) * song.beat);
  Band.play(song, clock, CHORDS, false);
  mode = "play";
}
function finishSong() {
  mode = "result";
  Band.stop();
  const stars = judge.stars(),
    total = song.notes.length,
    ratio = judge.hits / total;
  const prev = save.best[song.id] || { stars: 0, hits: 0 };
  save.best[song.id] = { stars: Math.max(prev.stars, stars), hits: Math.max(prev.hits, judge.hits) };
  const opened = si + 1 >= save.open && si + 1 < SONGS.length;
  if (opened) save.open = si + 2;
  store();
  stage.celebrate(ratio >= 0.75);
  Sound.fanfare();
  el("pause").hidden = true;
  setTimeout(() => {
    el("result-title").textContent = stars === 3 ? "Браво!" : stars === 2 ? "Чудесно!" : "Хорошо сыграли!";
    [...el("stars").children].forEach((s, k) => s.classList.toggle("on", k < stars));
    el("result-text").textContent = `Поймано светлячков: ${judge.hits} из ${total}. Самая длинная серия: ${judge.best}.`;
    el("result-new").hidden = !opened;
    el("result-new").textContent = opened ? `Открыта новая песенка: ${SONGS[si + 1].icon} ${SONGS[si + 1].name}` : "";
    el("next").hidden = si + 1 >= SONGS.length || si + 1 >= save.open;
    el("result").hidden = false;
    Sound.star();
  }, 1600);
  // Сова хвалит и подсказывает: рано жмёт или опаздывает
  (async () => {
    await wait(700);
    await say(ratio >= 0.75 ? "endGreat" : "endGood");
    if (judge.early >= 6 && judge.early > judge.miss) await say("early");
    else if (judge.miss >= Math.max(4, total * 0.3)) await say("late");
    if (opened) await say("newSong");
  })();
}
el("again").onclick = () => {
  unlock();
  Sound.tap();
  startSong(si);
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  startSong(Math.min(si + 1, SONGS.length - 1));
};

// ---------- Пауза: часы стоят, после — четыре доли отсчёта и с того же места ----------
function pause() {
  if (mode !== "play") return;
  clock.pause();
  Band.pause();
  mode = "paused";
  el("paused").hidden = false;
  say("pause");
}
function resume() {
  if (mode !== "paused") return;
  el("paused").hidden = true;
  mode = "resume";
  const beat = song.beat,
    now = audioNow();
  resumeAt = now + 4 * beat;
  for (let k = 0; k < 4; k++) Sound.click(k === 0, k * beat + 0.05);
}
el("pause").onclick = () => {
  unlock();
  pause();
};
el("resume").onclick = () => {
  unlock();
  resume();
};
el("to-list").onclick = () => {
  Sound.tap();
  Band.stop();
  openMenu();
};
el("list").onclick = () => {
  unlock();
  Sound.tap();
  if (mode === "play") {
    clock.pause();
    Band.stop();
  }
  openMenu();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "play") pause();
});

// ---------- Касания и клавиши ----------
function press(lane, timeStamp) {
  if (mode !== "play" || lane < 0) return;
  const t = clock.time() - lat() - Math.max(0, (performance.now() - timeStamp) / 1000);
  const r = judge.tap(lane, t);
  stage.tap(lane);
  if (r.type === "hit" || r.type === "perfect") {
    Sound.bell(r.note.f);
    const idx = Math.floor(((judge.hits - 1) * LIGHTS()) / song.notes.length);
    stage.hit(lane, r.type === "perfect", idx);
    el("hits").textContent = judge.hits;
    if (judge.combo > 0 && judge.combo % 10 === 0) {
      const c = el("combo");
      c.textContent = `Серия ×${judge.combo}!`;
      c.classList.remove("show");
      void c.offsetWidth;
      c.classList.add("show");
      Sound.star();
    }
    el("hand").hidden = true;
  } else if (r.type === "early") {
    Sound.soft();
    stage.early(lane);
  } else Sound.thud();
}
el("stage").addEventListener("pointerdown", (e) => {
  unlock();
  if (mode !== "play") return;
  e.preventDefault();
  press(stage.laneAt(e.clientX, e.clientY, song.lanes), e.timeStamp);
});
// D F J K — дорожки слева направо; 1 2 3 4 тоже. Если дорожек меньше, клавиша ведёт к ближайшей
const KEYS = { d: 0, f: 1, j: 2, k: 3, в: 0, а: 1, о: 2, л: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
  if (e.key === "Escape" || e.key === "p" || e.key === "з") return mode === "play" ? pause() : mode === "paused" ? resume() : null;
  if (mode === "paused" && (e.key === "Enter" || e.key === " ")) return resume();
  const k = KEYS[e.key.toLowerCase()];
  if (k === undefined || mode !== "play") return;
  const lane = song.lanes.reduce((best, l) => (Math.abs(l - k) < Math.abs(best - k) ? l : best), song.lanes[0]);
  press(lane, e.timeStamp);
});

// ---------- Каждый кадр ----------
const count = el("count");
function showCount(n) {
  count.textContent = n;
  count.classList.remove("show");
  void count.offsetWidth;
  count.classList.add("show");
}
stage.onFrame = () => {
  if (demo) {
    const t = demo.clock.time() - lat();
    // Без звука (до первого касания) демо крутится по кругу само
    if (t > demo.song.length + 1) demo.clock.start(-1);
    stage.drawNotes(
      demo.song.notes.map((n) => ({ ...n, state: demo.done.has(n.i) ? "hit" : "wait" })),
      t,
    );
    for (const n of demo.song.notes)
      if (!demo.done.has(n.i) && t >= n.t) {
        demo.done.add(n.i);
        stage.hit(n.lane, false, demo.lit++ % LIGHTS());
      }
    if (t < 0 && demo.done.size) {
      demo.done.clear();
      demo.lit = 0;
      stage.resetLights();
    }
    return;
  }
  if (!song || !clock) return;
  if (mode === "resume") {
    const left = resumeAt - audioNow(),
      n = Math.ceil(left / song.beat);
    if (n !== lastBeat && n > 0 && n <= 4) {
      lastBeat = n;
      showCount(n);
      stage.beat(n === 4);
    }
    if (left <= 0) {
      clock.resume();
      Band.resume();
      mode = "play";
    }
    stage.drawNotes(judge.notes, clock.time() - lat());
    return;
  }
  const t = clock.time() - lat();
  stage.drawNotes(judge.notes, t);
  if (mode !== "play") return;
  // Доли: точки в шапке, дорожки вспыхивают, сова машет палочкой; до песни — большие цифры
  const b = Math.floor((t + 0.0001) / song.beat);
  if (b !== lastBeat) {
    lastBeat = b;
    stage.beat(((b % 4) + 4) % 4 === 0);
    const dots = [...el("beats").children];
    dots.forEach((d, k) => d.classList.toggle("on", k === ((b % 4) + 4) % 4));
    if (b < 0 && b >= -4) showCount(-b);
  }
  for (const n of judge.update(t)) Sound.thud();
  // Первая песенка: рука показывает на кружок, когда светлячок подлетает
  if (si === 0 && !handShown && judge.hits === 0) {
    const near = judge.notes.find((n) => n.state === "wait" && n.t - t < 0.6);
    if (near) {
      handShown = true;
      const p = stage.padScreen(near.lane);
      const h = el("hand");
      h.style.transform = `translate(${p.x - 18}px, ${p.y + 10}px)`;
      h.hidden = false;
      setTimeout(() => (h.hidden = true), 3000);
    }
  }
  if (t > song.length + 0.3) finishSong();
};

// ---------- Заставка ----------
el("play").onclick = async () => {
  unlock();
  Sound.tap();
  el("title").hidden = true;
  openMenu();
  Band.stop();
  startDemo();
  if (!save.heard.hello) {
    save.heard.hello = 1;
    store();
    say("hello", 0.3);
  }
};
// До первого касания звука нет — демо крутится беззвучно
startDemo();
if (new URLSearchParams(location.search).has("debug"))
  window.koncert = {
    stage,
    SONGS,
    get judge() {
      return judge;
    },
    get clock() {
      return clock;
    },
    get mode() {
      return mode;
    },
    get song() {
      return song;
    },
    save,
    startSong,
    press,
    openMenu,
    pause,
    resume,
  };
