import { CARDS, THEMES } from "./words.js?v=429ae180";
import { ALPHABET, keyOf, STAMPS } from "./rules.js?v=429ae180";
import { Mailbag, SAVE_KEY } from "./mailbag.js?v=429ae180";

const $ = (id) => document.getElementById(id);
const art = (c) => "./art/" + c.asset + ".webp";
const seal = "./art/seal.svg";
const nice = (word) => word[0] + word.slice(1).toLocaleLowerCase("ru");
const cardById = new Map(CARDS.map((c) => [c.id, c]));
const stampColors = ["#f7a8a0", "#edc86a", "#94cfaa", "#a6c5e8"];
const stampSigns = ["✿", "★", "☘", "☾"];
const themePics = ["home-11", "animals-02", "city-06"];
const themeNames = Object.fromEntries(THEMES.map((t) => [t.id, t.name]));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let saved;
try {
  saved = JSON.parse(localStorage.getItem(SAVE_KEY));
} catch {}
const bag = new Mailbag(saved);
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(bag));
  } catch {}
  $("album-count").textContent = bag.album.size + "/36";
}

const voice = new Audio();
voice.preload = "none";
let voiceRun = 0;
function stopVoice() {
  voiceRun++;
  voice.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
function soundIcon() {
  const tail = bag.sound
    ? '<path d="M15 9c2 1.6 2 4.4 0 6m3-9c4 3 4 9 0 12"/>'
    : '<path d="m16 9 6 6m0-6-6 6"/>';
  $("sound").innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/>' +
    tail +
    "</svg>";
  $("sound").setAttribute("aria-pressed", String(bag.sound));
  $("sound").setAttribute(
    "aria-label",
    bag.sound ? "Выключить звук" : "Включить звук",
  );
}
function speak(name, text, explicit = false) {
  if (explicit && !bag.sound) {
    bag.sound = true;
    soundIcon();
    save();
  }
  if (!bag.sound) return;
  stopVoice();
  const version = voiceRun;
  voice.src = "./voices/" + name + ".mp3";
  voice.play().catch(() => {
    if (version !== voiceRun || !bag.sound || !("speechSynthesis" in window))
      return;
    const line = new SpeechSynthesisUtterance(text);
    line.lang = "ru-RU";
    line.rate = 0.94;
    speechSynthesis.speak(line);
  });
}
$("sound").onclick = () => {
  bag.sound = !bag.sound;
  stopVoice();
  soundIcon();
  save();
};
$("welcome-voice").onclick = () =>
  speak(
    "welcome",
    "Привет! Я Дракоша. Выбери конверт, посмотри на картинку и угадай слово по буквам.",
    true,
  );

let screen,
  returnScreen = "lobby",
  epoch = 0;
let world,
  loading,
  noWorld = false;
const scene = $("scene");
function changeScreen(id) {
  epoch++;
  stopVoice();
  screen = id;
  for (const el of document.querySelectorAll(".screen"))
    el.hidden = el.id !== id;
  $("album-link").hidden = id === "album";
  if (world) world.active = id === "game";
  window.scrollTo(0, 0);
}
function lobby() {
  changeScreen("lobby");
  $("riddle-mode").checked = bag.riddleFirst;
  $("routes").replaceChildren(
    ...THEMES.map((t, i) => {
      const r = bag.routes[t.id];
      const active = r && r.index < 6;
      const button = document.createElement("button");
      button.className = "route " + t.id;
      button.dataset.theme = t.id;
      button.innerHTML =
        '<span class="eyebrow">МАРШРУТ 0' +
        (i + 1) +
        "</span><strong>" +
        t.name +
        "</strong><small>" +
        (active
          ? "Продолжить · " + (r.index + 1) + "/6"
          : "Открыть конверт →") +
        '</small><span class="mini-stamp"><img alt="" src="./art/' +
        themePics[i] +
        '.webp"></span>';
      button.onclick = () => {
        bag.open(t.id);
        save();
        game();
      };
      return button;
    }),
  );
}
$("riddle-mode").onchange = (e) => {
  bag.riddleFirst = e.target.checked;
  save();
};
$("brand").onclick = $("back").onclick = $("other").onclick = lobby;

const keys = new Map(
  ALPHABET.map((ch) => {
    const key = document.createElement("button");
    key.className = "key";
    key.dataset.key = ch;
    key.innerHTML =
      ch +
      (ch === "Е" ? '<span class="yo">Ё</span>' : "") +
      '<span class="mark" aria-hidden="true"></span>';
    key.onclick = () => guess(ch);
    $("keyboard").append(key);
    return [ch, key];
  }),
);
function knownKey(key) {
  return [...bag.round.text].some((ch) => keyOf(ch) === key);
}
function updateBoard() {
  const r = bag.round;
  const remaining = STAMPS - r.misses;
  $("stamp-count").textContent = "Марки · " + remaining + "/" + STAMPS;
  $("stamps").innerHTML = stampSigns
    .map(
      (sign, i) =>
        '<i class="stamp' +
        (i < r.misses ? " spent" : "") +
        '" style="--tone:' +
        stampColors[i] +
        '">' +
        (i < r.misses ? "×" : sign) +
        "</i>",
    )
    .join("");
  let index = 0,
    spoken = [];
  $("tiles").replaceChildren(
    ...r.text.split(" ").map((word) => {
      const row = document.createElement("div");
      row.className = "tile-row";
      for (const ch of word) {
        const visible = r.shown(index++);
        const tile = document.createElement("span");
        const missed =
          visible &&
          r.state === "lost" &&
          !r.tried.has(keyOf(ch)) &&
          ch !== "-";
        tile.className =
          "tile" + (visible ? (missed ? " lost" : " shown") : "");
        tile.textContent = visible ? ch : "?";
        row.append(tile);
        spoken.push(visible ? ch : "пропуск");
      }
      index++;
      spoken.push(" ");
      return row;
    }),
  );
  $("tiles").setAttribute("aria-label", "Буквы: " + spoken.join(" "));
  for (const [ch, key] of keys) {
    const status = r.tried.has(ch) ? (knownKey(ch) ? "hit" : "miss") : "";
    key.className = "key " + status;
    key.disabled = r.state !== "play";
    key.lastElementChild.textContent =
      status === "hit" ? "✓" : status === "miss" ? "×" : "";
    key.setAttribute(
      "aria-label",
      (ch === "Е" ? "Е или Ё" : ch) +
        (status ? (status === "hit" ? ", есть в слове" : ", нет в слове") : ""),
    );
  }
  $("help").disabled = bag.route.helped || r.state !== "play";
  $("help").textContent = bag.route.helped
    ? "✓ Буква открыта"
    : "✧ Открыть букву";
}
function pictureHidden() {
  return bag.riddleFirst && !bag.route.peeked && bag.round.state === "play";
}
function picture() {
  const hidden = pictureHidden();
  const path = hidden ? seal : art(bag.round.card);
  $("hint-art").src = $("fallback-pic").src = path;
  $("picture").setAttribute(
    "aria-label",
    hidden ? "Открыть рисунок-подсказку" : "Увеличить рисунок-подсказку",
  );
  $("picture").classList.toggle("sealed", hidden);
  world?.setPicture(bag.round.card, hidden);
}
async function prepareWorld() {
  if (noWorld || world) return;
  if (!loading) {
    const canvas = $("world");
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) {
      noWorld = true;
      return;
    }
    loading = import("./world.js?v=429ae180")
      .then(({ World }) => {
        if (screen !== "game") return;
        world = new World(canvas, gl);
        world.active = true;
        world.setCard(bag.round.card, bag.round, pictureHidden());
        scene.classList.add("ready");
      })
      .catch((error) => {
        noWorld = true;
        console.info("Иллюстрированная мастерская", error.message);
      })
      .finally(() => {
        loading = null;
      });
  }
  await loading;
}
$("world").addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  if (world) {
    world.active = false;
    world.renderer.setAnimationLoop(null);
  }
  world = null;
  noWorld = true;
  scene.classList.remove("ready");
});
function game() {
  changeScreen("game");
  const r = bag.round,
    route = bag.route;
  scene.classList.remove("sending");
  $("route-name").textContent =
    "МАРШРУТ · " + themeNames[bag.active].toLocaleUpperCase("ru");
  $("letter-number").textContent = "Слово " + (route.index + 1) + " из 6";
  $("riddle").textContent = r.card.hint;
  $("feedback").textContent = r.tried.size
    ? "Названные буквы сохранены"
    : "Е открывает и Ё";
  $("playing-panel").hidden = false;
  $("result").hidden = true;
  updateBoard();
  if (world) {
    world.resize();
    world.setCard(r.card, r, pictureHidden());
  }
  picture();
  if (r.state !== "play") result();
  void prepareWorld();
}
function guess(key, help = false) {
  if (screen !== "game" || !bag.round || $("detail").open) return;
  const r = bag.round,
    event = bag.play(key, help);
  if (event.type === "ignored") return;
  if (event.type === "repeat") {
    $("feedback").textContent = "Эту букву уже пробовали";
    return;
  }
  save();
  updateBoard();
  if (event.type === "hit") {
    world?.reveal(event.at);
    world?.happy();
    $("feedback").textContent = help
      ? "Дракоша открыл букву " + event.key
      : "Есть буква " + event.key + "!";
  } else {
    world?.loseStamp(r.misses - 1);
    $("feedback").textContent = "Буквы " + event.key + " здесь нет";
  }
  if (r.state !== "play") finish(r);
}
async function finish(r) {
  const version = epoch;
  picture();
  speak(r.card.asset + "-word", nice(r.text));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let animation;
  if (r.state === "won") {
    scene.classList.add("sending");
    $("feedback").textContent = "Дракоша запечатывает письмо!";
    animation = world ? world.won() : delay(reduced ? 180 : 1450);
  } else {
    const hidden = [...r.text].flatMap((ch, i) =>
      ch !== " " && ch !== "-" && !r.tried.has(keyOf(ch)) ? [i] : [],
    );
    world?.lost(hidden);
    animation = delay(reduced ? 160 : 850);
  }
  await Promise.race([animation, delay(3500)]);
  if (epoch === version && bag.round === r) result();
}
function result() {
  const r = bag.round,
    won = r.state === "won";
  $("playing-panel").hidden = true;
  $("result").hidden = false;
  $("result-kicker").textContent = won
    ? "ПИСЬМО ОТПРАВЛЕНО"
    : "ПОСМОТРИМ ВМЕСТЕ";
  $("result-art").src = art(r.card);
  $("answer").textContent = nice(r.text);
  $("result-copy").textContent = won
    ? "Открытка в твоём альбоме."
    : "Марки закончились. Теперь ты знаешь слово!";
  $("retry").hidden = won;
  $("next").textContent =
    bag.route.index === 5 ? "Завершить конверт →" : "Следующее слово →";
}
$("listen").onclick = () =>
  speak(bag.round.card.asset + "-hint", bag.round.card.hint, true);
$("help").onclick = () => guess("", true);
$("say-word").onclick = () =>
  speak(bag.round.card.asset + "-word", nice(bag.round.text), true);
$("retry").onclick = () => {
  if (bag.retry()) {
    save();
    game();
  }
};
$("next").onclick = () => {
  if (bag.advance()) {
    save();
    if (bag.route.index === 6) summary();
    else game();
  }
};

const latinLayout = "QЙWЦEУRКTЕYНUГIШOЩPЗAФSЫDВFАGПHРJОKЛLДZЯXЧCСVМBИNТMЬ";
const physical = Object.fromEntries(
  latinLayout.match(/../g).map((pair) => ["Key" + pair[0], pair[1]]),
);
Object.assign(physical, {
  BracketLeft: "Х",
  BracketRight: "Ъ",
  Semicolon: "Ж",
  Quote: "Э",
  Comma: "Б",
  Period: "Ю",
  Backquote: "Е",
});
document.addEventListener("keydown", (e) => {
  if (
    screen !== "game" ||
    e.repeat ||
    e.isComposing ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    $("detail").open
  )
    return;
  const c = keyOf(e.key.toLocaleUpperCase("ru"));
  const key = ALPHABET.includes(c)
    ? c
    : e.key.length === 1
      ? physical[e.code]
      : null;
  if (key) {
    e.preventDefault();
    guess(key);
  }
});

function summary() {
  changeScreen("summary");
  const r = bag.route;
  $("summary-count").textContent =
    "Угадано слов: " +
    r.wins.length +
    " из 6. В альбоме уже " +
    bag.album.size +
    " из 36 открыток.";
  $("summary-cards").replaceChildren(
    ...r.pack.map((id) => {
      const img = new Image();
      img.src = art(cardById.get(id));
      img.alt = nice(id) + (r.wins.includes(id) ? ", отгадано" : ", пропущено");
      if (!r.wins.includes(id)) img.className = "missed";
      return img;
    }),
  );
}
$("more").onclick = () => {
  bag.open(bag.active);
  save();
  game();
};

function album() {
  if (screen !== "album") returnScreen = screen;
  changeScreen("album");
  $("album-score").textContent = bag.album.size + " / 36";
  $("pages").replaceChildren(
    ...THEMES.map((t) => {
      const cards = CARDS.filter((c) => c.theme === t.id);
      const section = document.createElement("section");
      section.className = "album-page";
      section.innerHTML =
        "<h2>" +
        t.name +
        " <small>" +
        cards.filter((c) => bag.album.has(c.id)).length +
        ' / 12</small></h2><div class="slots"></div>';
      const slots = section.querySelector(".slots");
      cards.forEach((c, i) => {
        const collected = bag.album.has(c.id);
        const slot = document.createElement(collected ? "button" : "div");
        slot.className = "slot" + (collected ? "" : " empty");
        const number = "№ " + String(i + 1).padStart(2, "0");
        if (collected) {
          slot.innerHTML =
            '<img alt="" loading="lazy" src="' +
            art(c) +
            '"><small>' +
            nice(c.word) +
            "</small>";
          slot.onclick = () => detail(c, true);
        } else {
          slot.innerHTML =
            '<b aria-hidden="true">✉</b><small>' + number + "</small>";
          slot.setAttribute("aria-label", "Закрытая открытка " + number);
        }
        slots.append(slot);
      });
      return section;
    }),
  );
}
$("album-link").onclick = album;
$("album-back").onclick = () =>
  returnScreen === "game"
    ? game()
    : returnScreen === "summary"
      ? summary()
      : lobby();
function detail(c, collected) {
  $("detail-kicker").textContent = collected
    ? "ОТКРЫТКА · " + themeNames[c.theme].toLocaleUpperCase("ru")
    : "РИСУНОК НА МАРКЕ";
  $("detail-art").src = art(c);
  $("detail-title").textContent = collected ? nice(c.word) : "Что на рисунке?";
  $("detail-text").textContent = c.hint;
  $("detail-voice").textContent = collected
    ? "▷ Послушать слово"
    : "▷ Послушать загадку";
  $("detail-voice").onclick = () =>
    speak(
      c.asset + (collected ? "-word" : "-hint"),
      collected ? nice(c.word) : c.hint,
      true,
    );
  $("detail").showModal();
}
$("picture").onclick = () => {
  if (pictureHidden()) {
    bag.route.peeked = true;
    save();
    picture();
  }
  detail(bag.round.card, false);
};
$("close-detail").onclick = () => $("detail").close();
$("detail").addEventListener("click", (e) => {
  if (e.target === $("detail")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
$("detail").addEventListener("close", stopVoice);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopVoice();
});
soundIcon();
$("album-count").textContent = bag.album.size + "/36";
lobby();
