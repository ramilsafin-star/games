// «Почта Дракоши»: на письме стёрлось слово — угадывай буквы, пока не улетели четыре марки.
// Правила — rules.js (проверяются tests/rules.mjs), 3D — world.js, слова и картинки — words.js.
import { World } from "./world.js?v=9aa9927a";
import { CARDS, THEMES } from "./words.js?v=9aa9927a";
import { Round, Deck, ALPHABET, STAMPS } from "./rules.js?v=9aa9927a";

const el = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Сохранение ----------
const KEY = "drakosha3d-v1";
function load() {
  const empty = { v: 1, album: {}, seen: {}, sound: true, music: true, heard: {}, packs: 0 };
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
  envelope: svg('<rect x="6" y="14" width="52" height="36" rx="6" fill="#ff8f5f"/><path d="M6 18l26 18 26-18" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><circle cx="32" cy="38" r="6" fill="#ff3f6d"/>'),
  album: svg('<rect x="10" y="8" width="44" height="50" rx="6" fill="#4f6bff"/><rect x="18" y="16" width="28" height="22" rx="3" fill="#fff"/><circle cx="26" cy="24" r="4" fill="#ffd25f"/><path d="M20 36l8-8 6 5 4-3 6 6" fill="#3fbf7a"/><rect x="18" y="44" width="28" height="4" rx="2" fill="#ffffff88"/>'),
  riddle: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#ff8f3f"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#ff8f3f" stroke-width="5" stroke-linecap="round"/>'),
  bulb: svg('<circle cx="32" cy="26" r="17" fill="#ffd23f"/><circle cx="27" cy="20" r="5" fill="#fff8c8"/><rect x="24" y="40" width="16" height="12" rx="4" fill="#c9b8aa"/><path d="M32 3v4M12 10l3 3M52 10l-3 3" stroke="#ff9f3f" stroke-width="4" stroke-linecap="round"/>'),
  soundOn: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#4f6bff"/><path d="M42 22a14 14 0 0 1 0 20M48 16a22 22 0 0 1 0 32" fill="none" stroke="#4f6bff" stroke-width="5" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M8 24h12l14-12v40L20 40H8z" fill="#c9b8aa"/><path d="M42 24l14 16M56 24 42 40" stroke="#ff6f8f" stroke-width="5" stroke-linecap="round"/>'),
  musicOn: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#b47cff" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#b47cff"/><circle cx="46" cy="40" r="8" fill="#b47cff"/>'),
  musicOff: svg('<path d="M24 44V12l28-6v32" fill="none" stroke="#c9b8aa" stroke-width="6" stroke-linejoin="round"/><circle cx="18" cy="46" r="8" fill="#c9b8aa"/><circle cx="46" cy="40" r="8" fill="#c9b8aa"/><path d="M8 8l48 48" stroke="#ff6f8f" stroke-width="5" stroke-linecap="round"/>'),
  close: svg('<path d="M16 16l32 32M48 16 16 48" stroke="#ff6f8f" stroke-width="8" stroke-linecap="round"/>'),
  again: svg('<path d="M50 30a18 18 0 1 1-6-13" fill="none" stroke="#4f6bff" stroke-width="7" stroke-linecap="round"/><path d="M46 6v14H32" fill="none" stroke="#4f6bff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
};
el("themes-open").innerHTML = ICON.envelope;
el("to-themes").innerHTML = ICON.envelope;
el("album-open").innerHTML = ICON.album;
el("album-close").innerHTML = ICON.close;
el("riddle").innerHTML = ICON.riddle;
el("bulb").innerHTML = ICON.bulb;
el("retry").innerHTML = ICON.again;

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
async function say(id, chain = false) {
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
    src.start();
    voice = src;
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

// ---------- Мир ----------
let world;
try {
  world = new World(el("stage"));
} catch (e) {
  console.warn("3D недоступно", e);
  el("nogl").hidden = false;
  throw e;
}

let theme = null,
  pack = [],
  pi = 0,
  results = [],
  round = null,
  streak = 0,
  bulbUsed = false,
  saidRepeat = false,
  mode = "title";
const card = () => pack[pi];

// ---------- Конверты (темы) ----------
function openThemes() {
  mode = "themes";
  el("theme-list").innerHTML = THEMES.map((t) => {
    const got = CARDS.filter((c) => c.theme === t.id && save.album[c.asset]).length;
    return `<button class="env" style="--c:${t.color}" data-theme="${t.id}" aria-label="Конверт: ${t.name}"><span class="ic">${t.icon}</span><span class="seal"></span><b>${t.name}</b><small>открыток ${got} из 12</small></button>`;
  }).join("");
  el("themes").hidden = false;
}
el("theme-list").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  unlock();
  Sound.gift();
  startPack(b.dataset.theme);
});
el("themes-open").onclick = () => {
  unlock();
  Sound.tap();
  openThemes();
};
el("to-themes").onclick = () => {
  Sound.tap();
  el("done").hidden = true;
  openThemes();
};
function startPack(id) {
  theme = id;
  const cards = CARDS.filter((c) => c.theme === id);
  const deck = new Deck(cards, Math.random, save.seen[id] || []);
  pack = deck.pack(6);
  save.seen[id] = [...deck.seen];
  store();
  pi = 0;
  results = [];
  el("themes").hidden = true;
  el("done").hidden = true;
  startCard();
  // Первый раз Дракоша объясняет правила
  if (!save.heard.how) {
    save.heard.how = 1;
    store();
    speak("how", "stamps");
  }
}
function paintPack() {
  el("pack").innerHTML = pack.map((c, i) => `<i class="${i === pi && round && round.state === "play" ? "now" : results[i] || ""}"></i>`).join("");
}

// ---------- Письмо ----------
function startCard() {
  mode = "play";
  round = new Round(card());
  streak = 0;
  bulbUsed = false;
  saidRepeat = false;
  world.setCard(card(), round);
  buildKeys();
  el("keys").classList.remove("off");
  el("after").hidden = true;
  el("riddle-text").hidden = true;
  el("bulb").disabled = false;
  el("riddle").disabled = false;
  paintPack();
}
function buildKeys() {
  el("keys").innerHTML = ALPHABET.map((k) => `<button class="key" data-key="${k}" aria-label="Буква ${k}">${k}</button>`).join("");
}
function keyButton(k) {
  return el("keys").querySelector(`[data-key="${k}"]`);
}
el("keys").addEventListener("pointerdown", (e) => {
  const b = e.target.closest(".key");
  if (!b) return;
  e.preventDefault();
  unlock();
  press(b.dataset.key);
});
// Физическая клавиатура: русская раскладка или те же клавиши в английской (ЙЦУКЕН)
const LATIN = { KeyQ: "Й", KeyW: "Ц", KeyE: "У", KeyR: "К", KeyT: "Е", KeyY: "Н", KeyU: "Г", KeyI: "Ш", KeyO: "Щ", KeyP: "З", BracketLeft: "Х", BracketRight: "Ъ", KeyA: "Ф", KeyS: "Ы", KeyD: "В", KeyF: "А", KeyG: "П", KeyH: "Р", KeyJ: "О", KeyK: "Л", KeyL: "Д", Semicolon: "Ж", Quote: "Э", KeyZ: "Я", KeyX: "Ч", KeyC: "С", KeyV: "М", KeyB: "И", KeyN: "Т", KeyM: "Ь", Comma: "Б", Period: "Ю", Backquote: "Ё" };
addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (mode === "title" && (e.key === "Enter" || e.key === " ")) return el("play").click();
  if (mode === "after" && (e.key === "Enter" || e.key === " ")) return el("next").click();
  if (mode !== "play") return;
  let k = e.key.length === 1 ? e.key.toUpperCase() : "";
  if (!/[А-ЯЁ]/.test(k)) k = LATIN[e.code] || "";
  if (k) {
    e.preventDefault();
    unlock();
    press(k);
  }
});

function press(k) {
  if (mode !== "play" || !round) return;
  const r = round.guess(k);
  apply(r, keyButton(r.key || k));
}
function apply(r, btn) {
  if (r.type === "ignored") return;
  if (r.type === "repeat") {
    Sound.nope();
    if (btn) {
      btn.classList.remove("shake");
      void btn.offsetWidth;
      btn.classList.add("shake");
    }
    if (!saidRepeat) {
      saidRepeat = true;
      say("repeat");
    }
    return;
  }
  if (r.type === "hit") {
    if (btn) {
      btn.classList.add("hit");
      btn.disabled = true;
    }
    world.reveal(r.at);
    world.happy();
    Sound.flip(streak++);
    if (r.won) return win();
    // Похвала не на каждую букву — иногда
    if (r.at.length > 1 || Math.random() < 0.35) say(["yes1", "yes2", "yes3"][Math.floor(Math.random() * 3)]);
  } else if (r.type === "miss") {
    streak = 0;
    if (btn) {
      btn.classList.add("miss");
      btn.disabled = true;
    }
    world.loseStamp(round.misses - 1);
    Sound.tear();
    if (r.lost) return lose();
    if (r.left === 1) say("last");
    else if (round.misses === 2 && !bulbUsed) speak(Math.random() < 0.5 ? "no1" : "no2", "helpme");
    else say(Math.random() < 0.5 ? "no1" : "no2");
  }
}
el("bulb").onclick = () => {
  unlock();
  if (mode !== "play" || bulbUsed) return;
  const r = round.hint();
  if (!r) return;
  bulbUsed = true;
  el("bulb").disabled = true;
  Sound.sparkle ? Sound.sparkle() : Sound.gift();
  apply(r, keyButton(r.key));
};
el("riddle").onclick = () => {
  unlock();
  if (!card()) return;
  const t = el("riddle-text");
  t.textContent = card().hint;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.hidden = true), 6000);
  say("h-" + card().asset);
};

async function win() {
  mode = "after";
  results[pi] = "won";
  const fresh = !save.album[card().asset];
  save.album[card().asset] = 1;
  store();
  paintPack();
  el("keys").classList.add("off");
  el("after-word").textContent = card().word;
  el("retry").hidden = true;
  el("after").hidden = false;
  speak("won", "w-" + card().asset);
  Sound.flame();
  world.flame(1.2);
  const w = world.won();
  setTimeout(() => Sound.whoosh(), 900);
  await w;
  Sound.clunk();
  Sound.fanfare();
  if (fresh) card()._fresh = true;
}
async function lose() {
  mode = "after";
  results[pi] = "lost";
  paintPack();
  const hidden = [...round.text].map((ch, i) => i).filter((i) => !round.tried.has(round.text[i] === "Ё" ? "Е" : round.text[i]) && round.text[i] !== " " && round.text[i] !== "-");
  world.lost(hidden);
  el("keys").classList.add("off");
  el("after-word").textContent = card().word;
  el("retry").hidden = false;
  el("after").hidden = false;
  speak("lost", "w-" + card().asset);
}
el("retry").onclick = () => {
  unlock();
  Sound.tap();
  results[pi] = undefined;
  startCard();
};
el("next").onclick = () => {
  unlock();
  Sound.tap();
  if (pi < pack.length - 1) {
    pi++;
    startCard();
  } else finishPack();
};
function finishPack() {
  mode = "done";
  save.packs++;
  store();
  const solved = results.filter((r) => r === "won").length;
  const stars = solved >= 6 ? 3 : solved >= 4 ? 2 : 1;
  [...el("stars").children].forEach((s, k) => s.classList.toggle("on", k < stars));
  el("done-text").textContent = `Доставлено писем: ${solved} из 6.`;
  el("done-cards").innerHTML = pack.map((c, i) => `<img alt="${c.word}" class="${results[i] === "won" ? "" : "off"}" src="./art/${c.asset}.webp">`).join("");
  el("done").hidden = false;
  Sound.fanfare();
  const fresh = pack.some((c) => c._fresh);
  speak("pack", ...(fresh ? ["album"] : []));
  for (const c of pack) delete c._fresh;
}
el("more").onclick = () => {
  unlock();
  Sound.gift();
  startPack(theme);
};

// ---------- Альбом ----------
function openAlbum() {
  const got = Object.keys(save.album).length;
  el("album-count").textContent = `${got} из ${CARDS.length}`;
  el("album-list").innerHTML = THEMES.map(
    (t) =>
      `<div class="atheme"><h3>${t.icon} ${t.name}</h3><div class="cards">${CARDS.filter((c) => c.theme === t.id)
        .map((c) => (save.album[c.asset] ? `<button class="pc" data-asset="${c.asset}" aria-label="${c.word}"><img alt="" src="./art/${c.asset}.webp"><span>${c.word}</span></button>` : `<div class="pc"><div class="q">?</div><span></span></div>`))
        .join("")}</div></div>`,
  ).join("");
  el("album").hidden = false;
}
el("album-open").onclick = () => {
  unlock();
  Sound.tap();
  openAlbum();
};
el("album-close").onclick = () => {
  Sound.tap();
  el("album").hidden = true;
};
el("album-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-asset]");
  if (!b) return;
  unlock();
  say("w-" + b.dataset.asset);
});

// ---------- Заставка ----------
// Под заставкой — первое слово темы «Животные», чтобы сцена была живой
pack = [CARDS.find((c) => c.word === "ЁЖИК")];
pi = 0;
round = new Round(pack[0]);
world.setCard(pack[0], round);
el("keys").classList.add("off");
el("play").onclick = () => {
  unlock();
  Sound.tap();
  el("title").hidden = true;
  if (!save.heard.hello) {
    save.heard.hello = 1;
    store();
    speak("hello", "pick");
  } else say("pick");
  openThemes();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) Music.stop();
  else if (save.music && Sound.ctx && mode !== "title") Music.start();
});
if (new URLSearchParams(location.search).has("debug"))
  window.drakosha = {
    world,
    CARDS,
    get round() {
      return round;
    },
    get mode() {
      return mode;
    },
    get pack() {
      return pack;
    },
    save,
    press,
    startPack,
  };
