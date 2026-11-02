// «Лавка Листик»: ход покупки, касания, голоса, наклейки. Всё, что видно в 3D, — в store.js.
import { Store } from "./store.js";
import { goods } from "./models.js";
import { icon } from "./icons.js";

const el = (id) => document.getElementById(id);
// pal — номер модели зверька в models.js. Первые трое — покупатели из первой версии лавки.
const customers = [
  { pal: 1, name: "Лисёнок Рыжик", voice: "fox", likes: ["milk", "bread", "eggs", "cheese", "apple"] },
  { pal: 2, name: "Зайка Тося", voice: "bunny", likes: ["carrot", "cabbage", "pear", "apple"] },
  { pal: 0, name: "Мишка Топтыж", voice: "bear", likes: ["honey", "jam", "bread", "fish", "mushroom"] },
  { pal: 3, name: "Котёнок Мурка", voice: "cat", likes: ["fish", "milk", "cheese"] },
  { pal: 4, name: "Поросёнок Хрюня", voice: "pig", likes: ["apple", "banana", "mushroom", "juice"] },
  { pal: 5, name: "Панда Бусинка", voice: "panda", likes: ["banana", "cabbage", "juice", "pear"] },
];
const steps = [
  { id: "scan", title: "Пробей покупки" },
  { id: "bag", title: "Сложи в пакет" },
  { id: "card", title: "Прими оплату" },
  { id: "receipt", title: "Отдай чек" },
];
// Наклейки в альбоме: сначала все покупатели, потом все товары
const album = [
  ...customers.map((c, i) => ({ kind: "customer", id: c.pal, key: "c" + i, name: c.name.split(" ")[1] })),
  ...Object.entries(goods).map(([id, g]) => ({ kind: "product", id, key: id, name: g.name })),
];
const KEY = "listik-v2";
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(KEY)) || {};
} catch {}
let served = Number.isSafeInteger(saved.served) && saved.served >= 0 ? saved.served : 0;
let got = new Set(Array.isArray(saved.got) ? saved.got : []);
let sound = saved.sound !== false,
  music = saved.music !== false;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ served, got: [...got], sound, music }));
  } catch {}
}
let store,
  step = -1,
  guest,
  order,
  scanned = 0,
  packed = 0,
  coins = 0,
  busy = true,
  idleAt = 0,
  utterance = 0,
  voices = [];
const recordings = new Map(),
  pictures = new Map();

// ---------- Голос и звук ----------
function unlock() {
  if (!sound) return;
  Sound.unlock();
  if (music) Music.start();
}
function stopVoice() {
  utterance++;
  for (const v of voices) {
    try {
      v.stop();
    } catch {}
    v.disconnect();
  }
  voices = [];
}
function clip(id, ctx) {
  if (!recordings.has(id)) {
    const loading = fetch("./voices/" + id + ".mp3")
      .then((r) => {
        if (!r.ok) throw Error("voice");
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    loading.catch(() => recordings.delete(id));
    recordings.set(id, loading);
  }
  return recordings.get(id);
}
// Записи голосов Google: у каждого покупателя своя папка, счёт и сумма — в папке кассы
const mine = (id) => guest.voice + "/" + id;
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
    Music.duck(at - ctx.currentTime + 0.2);
  } catch {}
}

// ---------- Заказ ----------
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeOrder() {
  guest = customers[served % customers.length];
  // Первая смена — по три покупки, дальше до пяти
  const size = served < 3 ? 3 : served < 9 ? 3 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3);
  const pick = shuffle(guest.likes).slice(0, Math.min(size, guest.likes.length - 1));
  for (const id of shuffle(Object.keys(goods))) if (pick.length < size && !pick.includes(id)) pick.push(id);
  const total = pick.reduce((s, id) => s + goods[id].price, 0);
  // Через раз платят наличными: денег чуть больше, сдача от одной до пяти монеток по рублю
  const cash = served % 2 === 1,
    given = Math.ceil((total + 1) / 5) * 5,
    notes = [];
  for (let left = given; left > 0; ) {
    const v = [20, 10, 5].find((n) => n <= left);
    notes.push(v);
    left -= v;
  }
  order = { items: pick, total, cash, given, change: given - total, notes };
}

// ---------- Экран ----------
function stepsBar() {
  el("steps").innerHTML = steps
    .map((s, i) => {
      const pic = i === 2 && order?.cash ? "coin" : s.id;
      return (
        '<span class="step ' + (i < step ? "done" : i === step ? "now" : "") + '" aria-label="' + s.title + '">' +
        icon(i < step ? "check" : pic) + "</span>"
      );
    })
    .join("");
  // step -1 — покупатель идёт к кассе, 4 — уходит: подписи нет
  el("task").textContent = !steps[step] ? "" : step === 2 && order.cash ? "Дай сдачу" : steps[step].title;
  el("shift").textContent = "Смена " + (Math.floor(served / 3) + 1) + " · покупатель " + ((served % 3) + 1) + " из 3";
}
function changeBar() {
  const box = el("change");
  box.hidden = !(step === 2 && order.cash);
  if (box.hidden) return;
  box.innerHTML =
    '<span class="change-label">Сдача</span>' +
    Array.from({ length: order.change }, (_, i) => '<i class="' + (i < coins ? "on" : "") + '"></i>').join("");
}
// Сумма дублируется плашкой: стоя камера не всегда показывает экран кассы
function sumChip(value, label) {
  el("sum").hidden = value === null;
  if (value !== null) el("sum").textContent = label + " " + value + " ₽";
}
function screen() {
  if (step === 2 && order.cash) {
    store.screen({ mode: "cash", total: order.total, given: order.given, change: order.change, coins });
    sumChip(order.given, "Дали");
  } else if (step === 3) {
    store.screen({ mode: "done", total: order.total, count: order.items.length, of: order.items.length });
    sumChip(order.total, "Оплачено");
  } else {
    store.screen({ total: sumScanned(), count: scanned, of: order.items.length });
    sumChip(step < 0 ? null : step === 0 ? sumScanned() : order.total, "К оплате");
  }
}
function sumScanned() {
  return store.items.filter((it) => it.scanned).reduce((s, it) => s + goods[it.id].price, 0);
}
function albumCount() {
  el("album-count").textContent = got.size + "/" + album.length;
}
function setStep(n) {
  step = n;
  idleAt = performance.now();
  store.hint(null);
  stepsBar();
  changeBar();
  screen();
  store.focusOn(["belt", "bag", order.cash ? "cash" : "card", "receipt"][n]);
}

// ---------- Ход покупки ----------
async function nextCustomer() {
  busy = true;
  step = -1;
  makeOrder();
  scanned = packed = coins = 0;
  sumChip(null);
  stepsBar();
  changeBar();
  store.focusOn("customer");
  Sound.door();
  await store.enter(guest.pal, order.items);
  talk([mine("hello")]);
  setStep(0);
  busy = false;
}
function onScanned(it) {
  it.scanned = true;
  scanned++;
  Sound.beep();
  talk(["register/n" + Math.min(scanned, 5)]);
  idleAt = performance.now();
  screen();
  if (scanned === order.items.length) {
    busy = true;
    // Всё пробито: касса звенит и называет сумму
    setTimeout(() => {
      Sound.ching();
      talk(["register/total-" + order.total], 0.35);
      setStep(1);
      busy = false;
    }, 700);
  }
}
async function packOne(it) {
  if (!it || it.state !== "tray") return;
  Sound.rustle();
  packed++;
  idleAt = performance.now();
  const last = packed === order.items.length;
  if (last) busy = true;
  await store.pack(it);
  if (last) await startPay();
}
async function startPay() {
  setStep(2);
  if (order.cash) {
    talk([mine("pay-cash")]);
    await store.offerCash(order.notes);
    Sound.ching();
  } else {
    store.offerCard();
    store.terminalScreen("amount", order.total);
    talk([mine("pay-card")]);
  }
  busy = false;
}
async function payCard() {
  busy = true;
  await store.payCard(() => {
    Sound.blip();
  });
  Sound.ching();
  await finishPay();
}
async function giveCoin() {
  if (coins >= order.change) return;
  coins++;
  const n = coins;
  idleAt = performance.now();
  Sound.coin(n);
  talk(["register/n" + n]);
  changeBar();
  screen();
  store.giveCoin(n - 1);
  if (n === order.change) {
    busy = true;
    await store.wait(0.7);
    await store.takeChange();
    Sound.ching();
    await finishPay();
  }
}
async function finishPay() {
  setStep(3);
  Sound.print(1.1);
  await store.print(
    order.items.map((id) => [goods[id].name, goods[id].price]),
    order.total,
  );
  busy = false;
}
async function giveReceipt() {
  busy = true;
  store.hint(null);
  await store.giveReceipt();
  const shiftEnd = (served + 1) % 3 === 0;
  talk([mine(served % 2 ? "bye2" : "bye1")]);
  store.cheer(shiftEnd);
  if (shiftEnd) Sound.fanfare();
  else Sound.gift();
  step = 4;
  stepsBar();
  sumChip(null);
  await store.leave();
  served++;
  const prize = reward();
  save();
  if (prize) await showPrize(prize);
  if (shiftEnd) await party();
  nextCustomer();
}
// Наклейка: сначала сам покупатель, потом товар из его покупки, которого ещё нет в альбоме
function reward() {
  const index = customers.indexOf(guest);
  const choices = ["c" + index, ...order.items];
  const key = choices.find((k) => !got.has(k));
  if (!key) return null;
  got.add(key);
  albumCount();
  return album.find((s) => s.key === key);
}
function picture(s) {
  if (!pictures.has(s.key)) pictures.set(s.key, store.sticker(s.kind, s.id));
  return pictures.get(s.key);
}
function showPrize(s) {
  return new Promise((done) => {
    const toast = el("toast");
    toast.querySelector("img").src = picture(s);
    toast.querySelector("span").textContent = s.name;
    toast.hidden = false;
    toast.className = "toast show";
    Sound.star();
    // Наклейка подпрыгивает и улетает в альбом
    setTimeout(() => {
      const from = toast.getBoundingClientRect(),
        to = el("album").getBoundingClientRect();
      toast.style.setProperty("--dx", to.left + to.width / 2 - (from.left + from.width / 2) + "px");
      toast.style.setProperty("--dy", to.top + to.height / 2 - (from.top + from.height / 2) + "px");
      toast.className = "toast fly";
    }, 1300);
    setTimeout(() => {
      toast.hidden = true;
      toast.className = "toast";
      el("album").classList.remove("bump");
      void el("album").offsetWidth;
      el("album").classList.add("bump");
      done();
    }, 1900);
  });
}
function party() {
  return new Promise((done) => {
    el("party").hidden = false;
    setTimeout(() => {
      el("party").hidden = true;
      done();
    }, 2200);
  });
}

// ---------- Касания в сцене ----------
let press = null;
function onDown(e) {
  if (!store || !e.isPrimary || e.button !== 0) return;
  unlock();
  const x = e.clientX,
    y = e.clientY;
  if (busy) return;
  if (step === 0) {
    const it = store.itemOnBelt(x, y);
    if (it) {
      press = { it, x, y, pointer: e.pointerId, moved: false };
      el("store").setPointerCapture(e.pointerId);
      return;
    }
  } else if (step === 1) {
    // На этом шаге действие одно, поэтому любое касание прилавка или пакета кладёт следующую покупку
    const it =
      store.itemInTray(x, y) ||
      ((store.hit("bag", x, y) || store.onCounter(x, y)) && store.items.find((i) => i.state === "tray"));
    if (it) return packOne(it);
  } else if (step === 2 && !order.cash) {
    if (store.hit("card", x, y) || store.hit("terminal", x, y) || store.hit("customer", x, y)) return payCard();
  } else if (step === 2) {
    if (store.hit("drawer", x, y) || store.hit("dish", x, y) || store.hit("register", x, y)) return giveCoin();
  } else if (step === 3) {
    if (store.hit("receipt", x, y) || store.hit("register", x, y) || store.hit("customer", x, y)) return giveReceipt();
  }
  if (store.hit("customer", x, y)) talk([mine("hello")]);
}
function onMove(e) {
  if (!press || press.pointer !== e.pointerId) return;
  if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10) return;
  if (!press.moved) {
    press.moved = true;
    store.grab(press.it);
  }
  if (store.move(e.clientX, e.clientY)) onScanned(press.it);
}
function onUp(e) {
  if (!press || press.pointer !== e.pointerId) return;
  const p = press;
  press = null;
  if (p.moved) store.release();
  else if (p.it.state === "belt") store.scan(p.it, () => onScanned(p.it));
}

// ---------- Подсказка-рука ----------
// Если ребёнок долго ничего не делает, кольцо и рука показывают, куда нажать
function hintLoop() {
  const wait = performance.now() - idleAt > 4000;
  const name = busy || step < 0 || step > 3 ? null : wait ? ["item", "tray", order?.cash ? "drawer" : "card", "receipt"][step] : null;
  store?.hint(name);
  const spot = store?.hintSpot(),
    hand = el("hand");
  hand.hidden = !spot;
  if (spot) {
    const p = store.screenPoint(spot),
      r = el("theatre").getBoundingClientRect();
    hand.style.left = p.x - r.left + "px";
    hand.style.top = p.y - r.top + "px";
  }
  requestAnimationFrame(hintLoop);
}

// ---------- Альбом и кнопки ----------
function openAlbum() {
  unlock();
  el("book-grid").innerHTML = album
    .map((s) =>
      got.has(s.key)
        ? '<figure class="sticker"><img alt="" src="' + picture(s) + '"><figcaption>' + s.name + "</figcaption></figure>"
        : '<figure class="sticker locked"><b>?</b><figcaption>…</figcaption></figure>',
    )
    .join("");
  el("book-count").textContent = got.size + " из " + album.length;
  el("book").showModal();
}
function buttons() {
  Sound.setOn(sound);
  Music.on = music;
  el("sound").innerHTML = icon(sound ? "sound" : "mute");
  el("sound").setAttribute("aria-label", sound ? "Выключить звук" : "Включить звук");
  el("music").innerHTML = icon(music ? "note" : "note-off");
  el("music").setAttribute("aria-label", music ? "Выключить музыку" : "Включить музыку");
}
el("sound").onclick = () => {
  sound = !sound;
  save();
  buttons();
  if (sound) unlock();
  else {
    stopVoice();
    Music.stop();
  }
};
el("music").onclick = () => {
  music = !music;
  save();
  buttons();
  if (music) unlock();
  else Music.stop();
};
el("album").onclick = openAlbum;
el("book-close").onclick = () => el("book").close();
el("book").addEventListener("click", (e) => {
  if (e.target === el("book")) el("book").close();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopVoice();
    Music.stop();
  } else if (sound && music && Sound.ctx) Music.start();
});
window.addEventListener("pagehide", () => {
  stopVoice();
  Music.stop();
});
document.querySelectorAll("[data-icon]").forEach((n) => (n.innerHTML = icon(n.dataset.icon)));
buttons();
albumCount();
try {
  store = new Store(el("store"));
  // Для проверок: адрес с ?debug открывает сцену и состояние игры из консоли
  if (new URLSearchParams(location.search).has("debug")) {
    window.store = store;
    window.listik = {
      get step() { return step; },
      get busy() { return busy; },
      get order() { return order; },
      get coins() { return coins; },
      get served() { return served; },
    };
  }
  const canvas = el("store");
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  nextCustomer();
  hintLoop();
} catch (error) {
  console.warn("3D недоступно", error);
  el("nogl").hidden = false;
}
