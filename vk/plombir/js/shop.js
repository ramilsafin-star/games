await window.vkGameHost?.ready;
import { flavors } from "./models.js?v=9a976c52";
import { Park } from "./park.js?v=9a976c52";
import { icon, speaker, picto, tune } from "./icons.js?v=9a976c52";

const el = (id) => document.getElementById(id);
// Порядок гостей совпадает с pals в models.js. voice — файл в voices/ со словами из thanks.
const scene = el("park"),
  guests = [
    { name: "Мишка Топа", emoji: "🐻", voice: "bear", thanks: "М-м-м, как вкусно!" },
    { name: "Лисичка Ириска", emoji: "🦊", voice: "fox", thanks: "Вот это сюрприз!" },
    { name: "Зайка Плюша", emoji: "🐰", voice: "bunny", thanks: "Ура! Спасибо за угощение!" },
    { name: "Котёнок Мурка", emoji: "🐱", voice: "cat", thanks: "Мяу! Очень вкусно!" },
    { name: "Поросёнок Хрюня", emoji: "🐷", voice: "pig", thanks: "Хрю-хрю! Спасибо!" },
    { name: "Панда Бусинка", emoji: "🐼", voice: "panda", thanks: "Какое красивое мороженое!" },
  ];
const toppings = [
  { id: "syrup", name: "Сироп", with: "с сиропом", tile: "#ffdde4", rim: "#cb91a0" },
  { id: "stars", name: "Посыпка", with: "с посыпкой", tile: "#fff0b8", rim: "#d3ad63" },
  { id: "cherry", name: "Вишенка", with: "с вишенкой", tile: "#eddff7", rim: "#b199be" },
];
const tasty = ["Клубничное", "Ванильное", "Шоколадное", "Мятное"];
// Заказы по кругу: сначала один шарик, потом украшение и два шарика.
// Пустой scoops — «хочу сюрприз», подходит любой вкус.
// 17 заказов на 6 гостей: одни и те же пары гость-заказ повторяются нескоро.
const requests = [
  { scoops: [0] },
  { scoops: [] },
  { scoops: [2] },
  { scoops: [1], top: "cherry" },
  { scoops: [3] },
  { scoops: [0, 2] },
  { scoops: [] },
  { scoops: [2], top: "stars" },
  { scoops: [1, 0] },
  { scoops: [3], top: "syrup" },
  { scoops: [0], top: "cherry" },
  { scoops: [3, 2] },
  { scoops: [] },
  { scoops: [1], top: "stars" },
  { scoops: [1, 3], top: "cherry" },
  { scoops: [2], top: "syrup" },
  { scoops: [0, 2], top: "stars" },
];
// Раньше игра жила внутри «Бибики» с ключами bibika-ice-*: счёт оттуда не теряется
function read(key) {
  try {
    return (
      localStorage.getItem("plombir-" + key) ??
      localStorage.getItem("bibika-ice-" + key)
    );
  } catch {
    return null;
  }
}
function save(key, value) {
  try {
    localStorage.setItem("plombir-" + key, String(value));
  } catch {}
}
const saved = Number(read("served"));
let served = Number.isSafeInteger(saved) && saved >= 0 ? saved : 0;
let round = served,
  step = 1,
  stack = [],
  chosen = null,
  perfect = false,
  matched = 0,
  guest,
  order;
let sound = read("sound") !== "off",
  music = read("music") !== "off",
  park,
  noteTimer,
  drag,
  stroke;
let utterance = 0,
  voices = [];
const recordings = new Map();
try {
  park = new Park(scene);
  // Для проверок: адрес с ?debug открывает сцену из консоли
  if (new URLSearchParams(location.search).has("debug")) window.park = park;
} catch (error) {
  console.warn("Парк переключён в плоский режим", error);
  el("fallback").hidden = false;
}
el("again-scoop").insertAdjacentHTML("afterbegin", picto.more);
el("serve").insertAdjacentHTML("afterbegin", picto.serve);
el("next").insertAdjacentHTML("afterbegin", picto.bell);
const art = el("paper-cone");
function paper() {
  art.replaceChildren();
  const cone = document.createElement("i");
  cone.className = "paper-waffle";
  art.append(cone);
  stack.forEach((f, i) => {
    const ball = document.createElement("i");
    ball.className = "paper-ball";
    ball.style.backgroundColor = flavors[f].color;
    ball.style.bottom = 39 + 17 * i + "px";
    art.append(ball);
  });
  if (chosen && stack.length) {
    const top = document.createElement("i");
    top.className = "paper-top";
    top.style.bottom = 55 + 17 * (stack.length - 1) + "px";
    top.innerHTML = icon(chosen);
    art.append(top);
  }
}
function soundButton() {
  Sound.setOn(sound);
  el("sound").innerHTML = speaker(sound);
  el("sound").setAttribute(
    "aria-label",
    sound ? "Выключить звук" : "Включить звук",
  );
  el("sound").setAttribute("aria-pressed", String(sound));
}
// Звук на iPad включается только от касания; музыка стартует вместе с ним
function unlock() {
  if (!sound) return;
  Sound.unlock();
  if (music) Music.start();
}
function musicButton() {
  Music.on = music;
  el("music").innerHTML = tune(music);
  el("music").setAttribute(
    "aria-label",
    music ? "Выключить музыку" : "Включить музыку",
  );
  el("music").setAttribute("aria-pressed", String(music));
}
function stopVoice() {
  utterance++;
  for (const source of voices) {
    try {
      source.stop();
    } catch {}
    source.disconnect();
  }
  voices = [];
}
function clip(id, ctx) {
  if (!recordings.has(id)) {
    const loading = fetch("./voices/" + id + ".mp3")
      .then((response) => {
        if (!response.ok) throw Error("voice");
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    loading.catch(() => recordings.delete(id));
    recordings.set(id, loading);
  }
  return recordings.get(id);
}
// Фразы звучат одна за другой: «Клубничное!» + «С вишенкой!»
async function talk(ids, delay = 0) {
  stopVoice();
  if (!sound || !Sound.ctx) return;
  const token = utterance,
    ctx = Sound.ctx;
  try {
    const clips = await Promise.all(ids.map((id) => clip(id, ctx)));
    if (token !== utterance || document.hidden) return;
    let at = ctx.currentTime + delay;
    for (const buffer of clips) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(Sound.master);
      source.onended = () => {
        source.disconnect();
        voices = voices.filter((v) => v !== source);
      };
      source.start(at);
      voices.push(source);
      at += buffer.duration + 0.06;
    }
    // Пока гость говорит, музыка затихает
    Music.duck(at - ctx.currentTime + 0.2);
  } catch {}
}
// Записи голосов Google лежат по папкам гостей: voices/bear/berry.mp3 и т. п.
function orderVoice(delay = 0) {
  const own = (id) => guest.voice + "/" + id;
  if (step === 3) return talk([own(perfect ? "perfect" : "thanks")], delay);
  const ids = !order.scoops.length
    ? ["surprise"]
    : order.scoops.length === 1
      ? [flavors[order.scoops[0]].id]
      : ["two-" + order.scoops.map((i) => flavors[i].id).join("-")];
  if (order.top) ids.push("top-" + order.top);
  talk(ids.map(own), delay);
}
function wishText() {
  if (!order.scoops.length) return "Хочу сюрприз!";
  const what =
    order.scoops.length === 1
      ? tasty[order.scoops[0]]
      : order.scoops
          .map((i, k) => (k ? flavors[i].name.toLowerCase() : flavors[i].name))
          .join(" и ");
  const top = toppings.find((t) => t.id === order.top);
  return what + (top ? " " + top.with : "") + "!";
}
// Что из заказа уже на рожке. Шарики считаются без порядка, лишний шарик не мешает.
function check() {
  const left = [...stack];
  const scoops = order.scoops.map((f) => {
    const at = left.indexOf(f);
    if (at < 0) return false;
    left.splice(at, 1);
    return true;
  });
  if (!order.scoops.length) scoops.push(stack.length > 0);
  const top = order.top ? chosen === order.top : null;
  const marks = top === null ? scoops : [...scoops, top];
  return { scoops, top, good: marks.filter(Boolean).length, all: marks.every(Boolean) };
}
// Звенит и кивает, когда на рожке появилось ещё что-то из заказа
function cheer() {
  const { good } = check();
  if (good > matched) {
    Sound.star();
    park?.nod();
  }
  matched = good;
}
function note(msg) {
  clearTimeout(noteTimer);
  el("scene-note").textContent = msg;
  if (msg)
    noteTimer = setTimeout(() => {
      el("scene-note").textContent = "";
    }, 2800);
}
function wants() {
  if (step === 3) return '<span class="want love">♥</span>';
  const { scoops, top } = check();
  const cells = order.scoops.length
    ? order.scoops.map((f, k) => [icon(flavors[f].id), scoops[k]])
    : [["★", scoops[0]]];
  if (order.top) cells.push([icon(order.top), top, true]);
  return cells
    .map(
      ([art, ok, plus]) =>
        '<span class="want' + (ok ? " ok" : "") + (plus ? " plus" : "") + '">' + art + "</span>",
    )
    .join("");
}
function show() {
  el("served").textContent = served;
  el("step-icon").textContent = step;
  el("action-title").textContent =
    step === 3
      ? perfect
        ? "Всё как в заказе!"
        : "Гость доволен!"
      : step === 2
        ? "Укрась рожок"
        : stack.length
          ? "Добавь шарик"
          : "Выбери вкус";
  el("flavors").hidden = step === 2;
  el("toppings").hidden = step !== 2;
  el("pick").classList.toggle("away", step === 3);
  el("happy").classList.toggle("away", step !== 3);
  el("again-scoop").classList.toggle("away", step !== 2);
  el("again-scoop").disabled = step !== 2 || stack.length >= 3;
  el("again-scoop").querySelector("span").textContent =
    stack.length >= 3 ? "Три шарика!" : "Ещё шарик";
  el("serve").disabled = !stack.length || step === 3;
  el("thanks").textContent = perfect ? "Ура! Всё как я люблю!" : guest.thanks;
  el("guest-name").textContent = guest.name;
  el("wish").textContent = step === 3 ? "Спасибо!" : wishText();
  el("order-icon").innerHTML = wants();
  el("order").classList.toggle("done", step !== 3 && check().all);
  el("order").setAttribute(
    "aria-label",
    step === 3 ? "Послушать гостя" : "Послушать заказ: " + wishText(),
  );
  document.querySelectorAll(".dots li").forEach((dot, i) => {
    dot.className = i === step - 1 ? "on" : i < step - 1 ? "done" : "";
    dot.setAttribute("aria-label", ["Вкус", "Украшение", "Угощение"][i]);
    if (i === step - 1) dot.setAttribute("aria-current", "step");
    else dot.removeAttribute("aria-current");
  });
  for (const btn of el("toppings").children)
    btn.setAttribute("aria-pressed", String(chosen === btn.dataset.kind));
  if (!park) paper();
}
function begin() {
  order = requests[round % requests.length];
  const i = round % guests.length;
  guest = guests[i];
  stack = [];
  step = 1;
  chosen = null;
  perfect = false;
  matched = 0;
  note("");
  park?.reset(i);
  el("paper-guest").textContent = guest.emoji;
  el("fallback").classList.remove("given");
  show();
}
function add(i) {
  if (step !== 1 || stack.length >= 3) return;
  unlock();
  Sound.pop();
  stack.push(i);
  chosen = null;
  park?.add(i);
  step = 2;
  note("");
  show();
  cheer();
}
function decorate(kind) {
  if (step !== 2) return;
  unlock();
  Sound.tap();
  chosen = kind;
  park?.decorate(kind);
  show();
  cheer();
}
function give() {
  if (step === 3 || !stack.length) return;
  unlock();
  perfect = check().all;
  if (perfect) Sound.fanfare();
  else Sound.gift();
  step = 3;
  park?.give(perfect, flavors[stack.at(-1)].color);
  el("fallback").classList.add("given");
  served++;
  save("served", served);
  note("");
  show();
  bump();
  orderVoice(perfect ? 1.1 : 0);
}
// Билетик со счётом подпрыгивает при каждом угощении
function bump() {
  const ticket = document.querySelector(".ticket");
  ticket.classList.remove("bump");
  void ticket.offsetWidth;
  ticket.classList.add("bump");
}
function card(item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "choice";
  btn.style.setProperty("--tile", item.tile);
  btn.style.setProperty("--rim", item.rim);
  btn.innerHTML = icon(item.id) + "<span>" + item.name + "</span>";
  return btn;
}
function ownsDrag(e) {
  return drag?.pointer === e.pointerId;
}
function clearDrag() {
  drag?.token?.remove();
  drag = null;
}
for (const [i, f] of flavors.entries()) {
  const btn = card(f);
  el("flavors").append(btn);
  let skipClick = false;
  btn.addEventListener("click", (e) => {
    if (skipClick && e.detail) {
      skipClick = false;
      return;
    }
    add(i);
  });
  btn.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0 || step !== 1) return;
    unlock();
    skipClick = false;
    clearDrag();
    drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY, token: null };
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener("pointermove", (e) => {
    if (!ownsDrag(e)) return;
    if (!drag.token && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10)
      return;
    if (!drag.token) {
      drag.token = document.createElement("div");
      drag.token.className = "drag-token";
      drag.token.innerHTML = icon(f.id);
      document.body.append(drag.token);
    }
    drag.token.style.left = e.clientX + "px";
    drag.token.style.top = e.clientY + "px";
  });
  btn.addEventListener("pointerup", (e) => {
    if (!ownsDrag(e)) return;
    if (drag.token) {
      skipClick = true;
      const r = scene.getBoundingClientRect();
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      if (inside && (!park || park.nearCone(e.clientX, e.clientY))) add(i);
      else if (inside) {
        park?.missed(i);
        Sound.boing();
        note("Щенок поймал! Возьми ещё шарик.");
      }
    }
    clearDrag();
  });
  btn.addEventListener("lostpointercapture", (e) => {
    if (ownsDrag(e)) clearDrag();
  });
}
for (const t of toppings) {
  const btn = card(t);
  btn.dataset.kind = t.id;
  btn.addEventListener("click", () => decorate(t.id));
  el("toppings").append(btn);
}
scene.addEventListener("pointerdown", (e) => {
  if (!park || !e.isPrimary || e.button !== 0) return;
  unlock();
  // Мыльные пузыри лопаются от касания
  if (park.popBubble(e.clientX, e.clientY)) {
    Sound.bubble();
    return;
  }
  // Касание гостя с готовым рожком — угостить, без рожка — послушать заказ
  if (park.nearGuest(e.clientX, e.clientY)) {
    if (step !== 3 && stack.length) give();
    else orderVoice();
    return;
  }
  if (step !== 2 || !park.nearCone(e.clientX, e.clientY)) return;
  scene.setPointerCapture(e.pointerId);
  stroke = { pointer: e.pointerId, points: [], line: null };
  const pt = park.inkPoint(e.clientX, e.clientY);
  if (pt) stroke.points.push(pt);
});
scene.addEventListener("pointermove", (e) => {
  if (!stroke || stroke.pointer !== e.pointerId || stroke.points.length >= 64)
    return;
  const pt = park.inkPoint(e.clientX, e.clientY);
  if (!pt) return;
  const last = stroke.points.at(-1);
  if (last && Math.hypot(...pt.map((v, i) => v - last[i])) < 0.036) return;
  stroke.points.push(pt);
  if (stroke.points.length > 1) {
    if (!stroke.line) {
      park.clearDecoration();
      chosen = "syrup";
      show();
      cheer();
    }
    stroke.line = park.ink(stroke.points, stroke.line);
  }
});
scene.addEventListener("pointerup", (e) => {
  if (!stroke || stroke.pointer !== e.pointerId) return;
  if (park.nearGuest(e.clientX, e.clientY)) give();
  else if (stroke.points.length === 1) decorate("syrup");
  stroke = null;
});
scene.addEventListener("lostpointercapture", () => {
  stroke = null;
});
el("again-scoop").onclick = () => {
  if (step === 2 && stack.length < 3) {
    unlock();
    Sound.tap();
    step = 1;
    show();
  }
};
el("serve").onclick = give;
el("next").onclick = () => {
  if (step !== 3) return;
  round++;
  begin();
  unlock();
  // Колокольчик фургона, и новый гость говорит заказ, когда добежит
  Sound.bell();
  orderVoice(0.75);
};
el("order").onclick = () => {
  unlock();
  orderVoice();
};
el("sound").onclick = () => {
  sound = !sound;
  save("sound", sound ? "on" : "off");
  soundButton();
  if (sound) {
    unlock();
    orderVoice();
  } else {
    stopVoice();
    Music.stop();
  }
};
el("music").onclick = () => {
  music = !music;
  save("music", music ? "on" : "off");
  musicButton();
  if (music) unlock();
  else Music.stop();
};
window.addEventListener("pagehide", () => {
  clearDrag();
  stopVoice();
  Music.stop();
});
// В свёрнутой вкладке музыка молчит, а при возвращении играет снова
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopVoice();
    Music.stop();
  } else if (sound && music && Sound.ctx) Music.start();
});
begin();
soundButton();
musicButton();
