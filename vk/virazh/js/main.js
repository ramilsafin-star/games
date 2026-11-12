// «Вираж»: меню, управление, приборы, панели, сохранение. Правила — в rules.js, картинка — в view.js.
import { TRACKS, buildTrack } from "./tracks.js?v=85f7d054";
import { Cup, DIFFS, LAPS, LIVERIES, NITRO_MAX, PHYS, Race, steerTo } from "./rules.js?v=85f7d054";
import { View } from "./view.js?v=85f7d054";
import { Sound } from "./sound.js?v=85f7d054";
import { clamp, clock, readStorage, writeStorage } from "./kit.js?v=85f7d054";

const el = (id) => document.getElementById(id);
const STEP = 1 / 120; // шаг правил, секунд
const KEY = "virazh-v1";
const MAP_BG = { sea: "#2aa5dd", pine: "#4d9d47", canyon: "#cf6f40", city: "#232757" };

// ---------- сохранение ----------
await window.vkGameHost?.ready;
// cupRun — недоигранный кубок: сложность, машина, сколько заездов пройдено и очки; null — кубка в работе нет
const save = { open: 1, best: {}, medals: {}, cups: {}, livery: 0, diff: "easy", track: 0, races: 0, cupRun: null };
try {
  const old = JSON.parse(readStorage(KEY) || "{}");
  for (const key of Object.keys(save)) if (typeof old[key] === typeof save[key]) save[key] = old[key];
} catch {
  // повреждённое сохранение — начинаем с чистого
}
save.open = clamp(Math.round(save.open) || 1, 1, TRACKS.length);
save.livery = clamp(Math.round(save.livery) || 0, 0, LIVERIES.length - 1);
if (!DIFFS.some((d) => d.id === save.diff)) save.diff = "easy";
save.track = clamp(Math.round(save.track) || 0, 0, save.open - 1);
{
  // недоигранный кубок годится, только если в нём всё на месте
  const run = save.cupRun;
  const whole = (list) => Array.isArray(list) && list.length === LIVERIES.length && list.every(Number.isFinite);
  const ok = run && DIFFS.some((d) => d.id === run.diff) && Number.isInteger(run.livery) && run.livery >= 0 && run.livery < LIVERIES.length &&
    Number.isInteger(run.round) && run.round >= 1 && run.round < TRACKS.length && whole(run.points) && whole(run.last);
  if (!ok) save.cupRun = null;
}
const store = () => writeStorage(KEY, JSON.stringify(save));

// ---------- состояние ----------
const tracks = TRACKS.map(buildTrack);
const view = new View(el("scene"));
let screen = "menu"; // menu | race | result | podium
let mode = "single"; // single | cup
let race = null;
let cup = null;
let trackIndex = save.track;
let paused = false;
let rush = 1; // ускорение времени для роботов
let acc = 0;
let last = performance.now();
let finishT = -1; // секунд после финиша игрока; −1 — ещё едет
let raceNews = [];
let teachT = 0;

// Кнопка срабатывает, когда палец нажали на ней самой и на ней же отпустили.
// Палец, державший руль или «Нитро» до появления панели, ничего не выберет; а второй палец
// нажмёт кнопку, даже пока первый ещё лежит на экране (браузер в этом случае не шлёт click).
function onPress(button, action) {
  let finger = null;
  button.addEventListener("pointerdown", (e) => (finger = e.pointerId));
  button.addEventListener("pointercancel", () => (finger = null));
  button.addEventListener("pointerup", (e) => {
    if (e.pointerId !== finger) return;
    finger = null;
    const r = button.getBoundingClientRect();
    if (e.clientX < r.left - 6 || e.clientX > r.right + 6 || e.clientY < r.top - 6 || e.clientY > r.bottom + 6) return;
    action(e);
  });
  button.addEventListener("click", (e) => {
    if (e.detail === 0) action(e); // клавиатура
  });
}

// ---------- управление ----------
const fingers = new Map(); // палец → x на экране
const keys = { left: false, right: false, brake: false };
let brakeHeld = false;
let nitroTap = false;
const scene = el("scene");
scene.addEventListener("pointerdown", (e) => {
  Sound.unlock();
  if (screen !== "race" || paused) return;
  fingers.set(e.pointerId, e.clientX);
  try {
    scene.setPointerCapture(e.pointerId);
  } catch {
    // палец уже отпустили
  }
});
scene.addEventListener("pointermove", (e) => {
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, e.clientX);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) scene.addEventListener(type, (e) => fingers.delete(e.pointerId));
scene.addEventListener("contextmenu", (e) => e.preventDefault());

const brake = el("brake"), nitro = el("nitro");
brake.addEventListener("pointerdown", (e) => {
  brakeHeld = true;
  brake.classList.add("down");
  try {
    brake.setPointerCapture(e.pointerId);
  } catch {
    // не страшно
  }
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  brake.addEventListener(type, () => {
    brakeHeld = false;
    brake.classList.remove("down");
  });
nitro.addEventListener("pointerdown", () => {
  Sound.unlock();
  nitroTap = true;
});
nitro.addEventListener("click", (e) => {
  if (e.detail === 0) nitroTap = true; // клавиатура
});

const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowDown: "brake", KeyS: "brake" };
addEventListener("keydown", (e) => {
  if (KEYMAP[e.code]) {
    keys[KEYMAP[e.code]] = true;
    if (screen === "race") e.preventDefault();
  } else if (e.code === "Space" && screen === "race") {
    if (!e.repeat) nitroTap = true;
    e.preventDefault();
  } else if (e.code === "Escape" && screen === "race") togglePause();
});
addEventListener("keyup", (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
});
function clearInput() {
  fingers.clear();
  keys.left = keys.right = keys.brake = false;
  brakeHeld = nitroTap = false;
  brake.classList.remove("down");
}

// Палец левее центра — влево, правее — вправо; чем дальше, тем круче.
// Пальцы с обеих сторон — тормоз; рулит при этом тот палец, что лёг первым.
function readInput() {
  let steer = 0, stop = keys.brake || brakeHeld;
  if (fingers.size) {
    const w = innerWidth, range = Math.min(w * 0.3, 210);
    let left = false, right = false, first = true;
    for (const x of fingers.values()) {
      const v = clamp((x - w / 2) / range, -1, 1);
      if (v < -0.1) left = true;
      if (v > 0.1) right = true;
      if (first && Math.abs(v) > 0.05) steer = Math.sign(v) * Math.pow(Math.abs(v), 1.2);
      first = false;
    }
    if (left && right) stop = true;
  }
  if (keys.left) steer -= 1;
  if (keys.right) steer += 1;
  return { steer: clamp(steer, -1, 1), brake: stop, nitro: false };
}

// ---------- меню ----------
function drawMap(canvas, track, o = {}) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const size = o.size || canvas.clientWidth || 52;
  canvas.width = canvas.height = Math.round(size * dpr);
  const g = canvas.getContext("2d"), b = track.box;
  const pad = canvas.width * (o.pad ?? 0.14);
  const k = (canvas.width - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = canvas.width / 2 - ((b.minX + b.maxX) / 2) * k, oz = canvas.height / 2 - ((b.minZ + b.maxZ) / 2) * k;
  if (o.bg) {
    g.fillStyle = o.bg;
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  g.lineJoin = g.lineCap = "round";
  const path = () => {
    g.beginPath();
    for (let i = 0; i < track.n; i += 2) g.lineTo(track.px[i] * k + ox, track.pz[i] * k + oz);
    g.closePath();
  };
  path();
  g.strokeStyle = o.rim || "#10173a";
  g.lineWidth = canvas.width * (o.thick ?? 0.1) + 3 * dpr;
  g.stroke();
  path();
  g.strokeStyle = o.line || "#ffffff";
  g.lineWidth = canvas.width * (o.thick ?? 0.1);
  g.stroke();
  // стартовая линия
  g.strokeStyle = o.start || "#ff4a4a";
  g.lineWidth = 2.5 * dpr;
  g.beginPath();
  const hw = (canvas.width * (o.thick ?? 0.1)) / 2 + 2 * dpr;
  g.moveTo(track.px[0] * k + ox + track.nx[0] * hw, track.pz[0] * k + oz + track.nz[0] * hw);
  g.lineTo(track.px[0] * k + ox - track.nx[0] * hw, track.pz[0] * k + oz - track.nz[0] * hw);
  g.stroke();
  return { k, ox, oz };
}

const LOCK = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.500" width="14" height="10" rx="2.500" fill="currentColor"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500" fill="none" stroke="currentColor" stroke-width="2.400"/></svg>';
function renderMenu() {
  // на кнопке кубка видно, что он недоигран
  el("cup-label").textContent = save.cupRun ? `Кубок ${save.cupRun.round}/${TRACKS.length}` : "Кубок";
  const box = el("tracks");
  box.textContent = "";
  TRACKS.forEach((def, i) => {
    const open = i < save.open;
    const b = document.createElement("button");
    b.className = "track" + (open ? "" : " locked");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(i === trackIndex));
    const best = save.best[def.id];
    const medal = save.medals[def.id]?.[save.diff];
    b.innerHTML = `<canvas width="10" height="10"></canvas><span><b>${def.name}</b><small>${open ? (best ? "Круг " + clock(best) : def.blurb) : "Сначала проедь предыдущую"}</small></span>${open ? "" : LOCK}${medal ? `<i class="medal p${medal}">${medal}</i>` : ""}`;
    onPress(b, () => {
      Sound.unlock();
      if (!open) return Sound.wrong();
      if (trackIndex === i) return;
      trackIndex = save.track = i;
      store();
      Sound.click();
      renderMenu();
      attract();
    });
    box.appendChild(b);
    drawMap(b.firstChild, tracks[i], { bg: MAP_BG[def.theme], size: 62, thick: 0.085 });
  });
  const diffs = el("diffs");
  diffs.textContent = "";
  for (const d of DIFFS) {
    const b = document.createElement("button");
    b.textContent = d.name;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(d.id === save.diff));
    onPress(b, () => {
      Sound.unlock();
      Sound.click();
      save.diff = d.id;
      store();
      renderMenu();
    });
    diffs.appendChild(b);
  }
  const cars = el("cars");
  cars.textContent = "";
  LIVERIES.forEach((l, i) => {
    const b = document.createElement("button");
    b.style.setProperty("--paint", l.color);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", l.name);
    b.setAttribute("aria-checked", String(i === save.livery));
    onPress(b, () => {
      Sound.unlock();
      Sound.click();
      save.livery = i;
      store();
      renderMenu();
    });
    cars.appendChild(b);
  });
}

// Сцена меню показывается там, где нет карточки: над ней или справа от неё
function placeScene() {
  const card = el("menu").firstElementChild.getBoundingClientRect();
  const w = innerWidth, h = innerHeight;
  if (!card.width) return view.setShift(0, 0);
  if (card.width > w * 0.7) view.setShift(0, card.top / 2 - h / 2 + 20);
  else view.setShift((card.right + w) / 2 - w / 2, Math.min(0, card.top / 2 - h / 4));
}

function setScreen(name) {
  screen = name;
  document.body.dataset.screen = name;
  const racing = name === "race";
  el("menu").hidden = name !== "menu";
  el("hud").hidden = !racing;
  el("map").hidden = !racing;
  el("place").hidden = el("laps").hidden = el("pause").hidden = !racing;
  if (!racing) {
    el("lights").hidden = true;
    el("banner").className = "";
  }
}

function useTrack(i) {
  const track = tracks[i];
  if (view.track !== track) view.build(track);
  return track;
}

// Меню: на выбранной трассе сами по себе едут шесть машин
function attract() {
  const track = useTrack(trackIndex);
  race = new Race(track, { attract: true });
  view.spawn(race);
  Sound.music("menu");
  Sound.idle();
}

function showMenu() {
  closePanel();
  paused = false;
  cup = null;
  clearInput();
  trackIndex = clamp(trackIndex, 0, save.open - 1);
  setScreen("menu");
  renderMenu();
  placeScene();
  attract();
}

// ---------- гонка ----------
let mapBase = null, mapFit = null;
function startRace(i) {
  closePanel();
  clearInput();
  trackIndex = i;
  const track = useTrack(i);
  race = new Race(track, { difficulty: save.diff, livery: save.livery });
  view.spawn(race);
  setScreen("race");
  paused = false;
  finishT = -1;
  raceNews = [];
  acc = 0;
  hud.reset();
  // мини-карта: дорога рисуется один раз, точки машин — каждый кадр
  const map = el("map");
  mapBase = document.createElement("canvas");
  mapFit = drawMap(mapBase, track, { size: map.clientWidth, thick: 0.065, rim: "#10173a", line: "#e9eeff", pad: 0.15 });
  map.width = map.height = mapBase.width;
  el("lights").hidden = false;
  el("lights").dataset.n = "";
  teachT = 0;
  el("hud").classList.add("teach");
  el("lesson").classList.toggle("need", save.races < 2);
  Sound.music(null);
  Sound.idle();
  race.startCountdown();
}

function banner(text, small = "") {
  const b = el("banner");
  b.className = "";
  void b.offsetWidth;
  b.innerHTML = text + (small ? `<small>${small}</small>` : "");
  b.className = "show";
}

function onEvents() {
  const me = race.player;
  for (const e of race.events) {
    if (e.type === "count") {
      if (screen !== "race") continue;
      el("lights").dataset.n = String(e.value);
      view.setLamps(e.value);
      if (e.value > 0) Sound.beep();
      else {
        Sound.go();
        Sound.music(race.track.theme);
        banner("Марш!");
        setTimeout(() => (el("lights").hidden = true), 900);
      }
      continue;
    }
    if (!me || e.car !== me.index) continue;
    if (e.type === "nitro") Sound.nitro();
    else if (e.type === "pad") Sound.pad();
    else if (e.type === "can") Sound.can();
    else if (e.type === "wall") Sound.wall(e.value);
    else if (e.type === "bump") Sound.bump();
    else if (e.type === "land") Sound.land();
    else if (e.type === "jump") Sound.jump();
    else if (e.type === "reset") {
      Sound.reset();
      banner("Возвращаем на трассу");
    } else if (e.type === "lap") {
      const record = lapRecord();
      if (e.value === LAPS) {
        Sound.last();
        banner("Последний круг!", record);
      } else {
        Sound.lap();
        banner(`Круг ${e.value} из ${LAPS}`, record);
      }
    } else if (e.type === "finish") onFinish();
  }
  view.react(race, race.events);
  race.events.length = 0;
}

// Только что закончился круг: если он лучший за всё время — запоминаем
function lapRecord() {
  const id = race.track.id, t = race.player.lastLap;
  if (race.skipped || !(t < (save.best[id] ?? Infinity))) return ""; // после skip() круг ненастоящий
  save.best[id] = Math.round(t * 100) / 100;
  store();
  // в таблице финиша остаётся одна плашка — с лучшим кругом заезда
  raceNews = raceNews.filter((line) => !line.includes("Рекорд круга"));
  raceNews.push(`<span class="gold">Рекорд круга ${clock(t)}</span>`);
  return `Рекорд круга ${clock(t)}`;
}

function onFinish() {
  const me = race.player, id = race.track.id;
  const record = lapRecord();
  finishT = 0;
  clearInput();
  Sound.idle();
  Sound.music(null);
  Sound.finish(me.place);
  banner(me.place === 1 ? "Победа!" : "Финиш!", record || `${me.place} место`);
  save.races++;
  if (trackIndex + 2 > save.open && trackIndex + 1 < TRACKS.length) {
    save.open = trackIndex + 2;
    raceNews.push(`<span class="gold">Открыта трасса «${TRACKS[trackIndex + 1].name}»</span>`);
  }
  if (me.place <= 3 && !race.skipped) {
    const m = (save.medals[id] ||= {});
    if (!(m[save.diff] <= me.place)) m[save.diff] = me.place;
  }
  store();
  el("hud").hidden = true;
  el("pause").hidden = true;
}

const ORDINAL = ["", "1-е", "2-е", "3-е", "4-е", "5-е", "6-е"];
function rowsHtml(rows, cupMode) {
  return rows
    .map(
      (r) =>
        `<div class="row${r.player ? " me" : ""}"><span class="n">${r.place}</span><i class="dot" style="--paint:${LIVERIES[r.livery].color}"></i><span>${r.name}</span>` +
        (cupMode === "final" ? "" : `<span class="t">${r.finished ? clock(r.time) : "≈" + clock(r.time)}</span>`) +
        `<span class="p">${cupMode === "final" ? r.points + " оч." : cupMode ? "+" + r.points : ""}</span></div>`,
    )
    .join("");
}

function showResult() {
  const results = race.results();
  const mine = results.find((r) => r.player);
  setScreen("result");
  let actions;
  if (mode === "cup") {
    cup.add(results);
    // кубок запоминается после каждого заезда: можно выйти в меню и продолжить позже
    save.cupRun = cup.done ? null : { diff: save.diff, livery: save.livery, round: cup.round, points: [...cup.points], last: [...cup.last] };
    store();
    const total = cup.standings(save.livery).find((r) => r.player);
    raceNews.unshift(`<span>В кубке: ${total.points} оч., ${ORDINAL[total.place]} место</span>`);
    actions = cup.done
      ? `<div class="actions one"><button class="primary" data-act="podium">К пьедесталу</button></div>`
      : `<div class="actions"><button class="primary plain" data-act="menu">В меню</button><button class="primary" data-act="next">Дальше</button></div>`;
  } else {
    const more = trackIndex + 1 < save.open && trackIndex + 1 < TRACKS.length;
    actions = `<div class="actions"><button class="primary plain" data-act="menu">В меню</button><button class="primary" data-act="again">Ещё раз</button></div>` + (more ? `<div class="actions one"><button class="primary alt" data-act="nextSingle">Следующая трасса</button></div>` : "");
  }
  const title = mine.place === 1 ? "Победа!" : mine.place <= 3 ? "Отлично!" : "Финиш!";
  const round = mode === "cup" ? `Кубок, заезд ${cup.round} из ${cup.rounds} · ` : "";
  openPanel(
    `<h2>${title}</h2><p class="sub">${round}${race.track.name} · <b>${ORDINAL[mine.place]} место</b></p>` +
      (raceNews.length ? `<div class="news">${raceNews.join("")}</div>` : "") +
      `<div class="table">${rowsHtml(results, mode === "cup" ? "race" : "")}</div>${actions}`,
    {
      menu: showMenu,
      again: () => adBreak(() => startRace(trackIndex)),
      next: () => adBreak(() => startRace(cup.round)),
      nextSingle: () => {
        save.track = trackIndex + 1;
        store();
        adBreak(() => startRace(trackIndex + 1));
      },
      podium: showPodium,
    },
  );
}

const TROPHY = '<svg class="trophy" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 8h28v6h9v8c0 7-5 12-12 12h-1.500C39 39 36 41.500 34 42.500V50h8v7H22v-7h8v-7.500C28 41.500 25 39 22.500 34H21C14 34 9 29 9 22v-8h9zm0 12h-3v2c0 2.800 1.200 5 3 6zm28 0v8c1.800-1 3-3.200 3-6v-2z" fill="#ffd23e" stroke="#b06a00" stroke-width="2.500" stroke-linejoin="round"/></svg>';
function showPodium() {
  const table = cup.standings(save.livery);
  const mine = table.find((r) => r.player);
  view.podium(table.map((r) => r.livery));
  setScreen("podium");
  race = null;
  if (!(save.cups[save.diff] <= mine.place)) save.cups[save.diff] = mine.place;
  store();
  Sound.music("menu");
  Sound.finish(mine.place);
  const diff = DIFFS.find((d) => d.id === save.diff).name;
  const title = mine.place === 1 ? "Кубок твой!" : mine.place <= 3 ? "Ты на пьедестале!" : "Кубок завершён";
  openPanel(
    `${mine.place === 1 ? TROPHY : ""}<h2>${title}</h2><p class="sub">Кубок Виража · «${diff}» · <b>${ORDINAL[mine.place]} место</b></p><div class="table cup">${rowsHtml(table, "final")}</div>` +
      `<div class="actions"><button class="primary plain" data-act="menu">В меню</button><button class="primary alt" data-act="cup">Ещё кубок</button></div>`,
    { menu: showMenu, cup: () => adBreak(startCup) },
    true,
  );
  // пьедестал виден в свободной от таблицы части экрана
  const sheet = el("panel-body").getBoundingClientRect(), w = innerWidth, h = innerHeight;
  if (sheet.width > w * 0.7) view.setShift(0, sheet.top / 2 - h / 2);
  else view.setShift(sheet.left / 2 - w / 2, 0);
}

function startCup() {
  mode = "cup";
  cup = new Cup(TRACKS.length);
  save.cupRun = null;
  store();
  startRace(0);
}

// продолжить недоигранный кубок с той же сложностью и машиной, с какими он начат
function resumeCup() {
  const run = save.cupRun;
  if (!run) return startCup();
  mode = "cup";
  cup = new Cup(TRACKS.length);
  cup.round = run.round;
  cup.points = [...run.points];
  cup.last = [...run.last];
  save.diff = run.diff;
  save.livery = run.livery;
  store();
  startRace(cup.round);
}

function askCup() {
  const run = save.cupRun;
  if (!run) return startCup();
  const diff = DIFFS.find((d) => d.id === run.diff).name;
  const mine = Object.assign(new Cup(TRACKS.length), { points: run.points, last: run.last }).standings(run.livery).find((r) => r.player);
  openPanel(
    `<h2>Кубок Виража</h2><p class="sub">Пройдено заездов: ${run.round} из ${TRACKS.length} · «${diff}» · <b>${ORDINAL[mine.place]} место, ${mine.points} оч.</b></p>` +
      `<p class="sub">Дальше — ${TRACKS[run.round].name}.</p>` +
      `<div class="actions"><button class="primary plain" data-act="fresh">Новый кубок</button><button class="primary" data-act="go">Продолжить</button></div>` +
      `<div class="actions one"><button class="primary plain" data-act="back">Назад</button></div>`,
    { go: resumeCup, fresh: startCup, back: closePanel },
  );
}

// ---------- панели ----------
function openPanel(html, actions, low = false) {
  const panel = el("panel"), sheet = el("panel-body");
  sheet.innerHTML = html;
  panel.classList.toggle("low", low);
  panel.hidden = false;
  sheet.scrollTop = 0;
  // полсекунды панель не принимает нажатия: палец, который только что жал «Нитро», ничего не выберет
  sheet.classList.add("wait");
  setTimeout(() => sheet.classList.remove("wait"), 450);
  for (const b of sheet.querySelectorAll("[data-act]"))
    onPress(b, () => {
      Sound.unlock();
      Sound.click();
      actions[b.dataset.act]();
    });
}
function closePanel() {
  el("panel").hidden = true;
  el("panel-body").textContent = "";
}

function togglePause() {
  if (screen !== "race" || finishT >= 0) return;
  paused = !paused;
  if (paused) {
    clearInput();
    Sound.hush();
    openPanel(
      `<h2>Пауза</h2><p class="sub">${race.track.name} · круг ${Math.min(LAPS, race.player.lap + 1)} из ${LAPS}</p>` +
        `<div class="stack"><button class="primary" data-act="resume">Продолжить</button><button class="primary plain" data-act="again">Заново</button>` +
        `<button class="primary plain" data-act="sound">${Sound.on ? "Звук: вкл" : "Звук: выкл"}</button><button class="primary plain" data-act="menu">В меню</button></div>`,
      {
        resume: togglePause,
        again: () => startRace(trackIndex),
        sound: () => {
          Sound.toggle();
          Sound.hush(); // на паузе всё равно тихо
          soundButton();
          el("panel-body").querySelector("[data-act=sound]").textContent = Sound.on ? "Звук: вкл" : "Звук: выкл";
        },
        menu: showMenu,
      },
    );
  } else {
    closePanel();
    Sound.unlock();
    last = performance.now();
  }
}
onPress(el("pause"), togglePause);
function soundButton() {
  el("sound").setAttribute("aria-pressed", String(Sound.on));
}
soundButton();
onPress(el("sound"), () => {
  Sound.toggle();
  soundButton();
});
onPress(el("race"), () => {
  Sound.unlock();
  Sound.pick();
  mode = "single";
  startRace(trackIndex);
});
onPress(el("cup"), () => {
  Sound.unlock();
  Sound.pick();
  askCup();
});
function quiet() {
  if (screen === "race" && !paused && finishT < 0) togglePause();
  else Sound.hush();
}
function updateVisibility() {
  if (document.hidden || window.vkGameHost?.hidden) quiet();
  // Дальше заезд и звук продолжатся по нажатию игрока.
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
// Во время рекламного ролика игра молчит, после него звук возвращается (если игрок его не выключал)
addEventListener("vk-ad", (e) => {
  if (e.detail.on) quiet();
  else if (!document.hidden && !window.vkGameHost?.hidden && Sound.on) Sound.unlock();
});
// Реклама VK между заездами: не чаще раза в 2 минуты и никогда сразу после запуска.
// Пока идёт ролик, нажатия и клавиши до игры не доходят: иначе касание включило бы звук.
let adBusy = false;
async function adBreak(go) {
  if (adBusy) return;
  adBusy = true;
  try {
    await window.vkGameHost?.interstitial();
  } finally {
    adBusy = false;
  }
  go();
}
for (const type of ["pointerdown", "pointerup", "click", "keydown"])
  addEventListener(
    type,
    (e) => {
      if (!adBusy) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );

// ---------- приборы ----------
const hud = {
  cache: {},
  set(id, text) {
    if (this.cache[id] === text) return false;
    this.cache[id] = text;
    el(id).textContent = text;
    return true;
  },
  reset() {
    this.cache = {};
    this.wrong = false;
    el("place").classList.remove("pop");
  },
  update() {
    const me = race.player;
    if (this.set("place-n", String(me.place)) && race.time > 1) {
      const p = el("place");
      p.classList.remove("pop");
      void p.offsetWidth;
      p.classList.add("pop");
    }
    this.set("lap-n", `${Math.min(LAPS, me.lap + 1)}/${LAPS}`);
    this.set("clock", clock(race.time).slice(0, -1));
    this.set("speed", String(Math.round(me.v * 4.5)));
    const pips = el("gauge").firstElementChild.children;
    for (let k = 0; k < NITRO_MAX; k++) {
      const fill = clamp(me.nitro - k, 0, 1);
      const key = "pip" + k, val = fill.toFixed(2);
      if (this.cache[key] !== val) {
        this.cache[key] = val;
        pips[k].style.setProperty("--fill", val);
        pips[k].classList.toggle("full", fill >= 1);
      }
    }
    const state = me.nitroT > 0 ? "fire" : me.nitro >= 1 ? "" : "empty";
    if (this.cache.nitro !== state) {
      this.cache.nitro = state;
      nitro.className = state;
    }
    if (me.wrong !== this.wrong) {
      this.wrong = me.wrong;
      const b = el("banner");
      if (me.wrong) {
        b.textContent = "Не туда!";
        b.className = "hold";
        Sound.wrong();
      } else if (b.className === "hold") b.className = "";
    }
    // стрелки-подсказки подсвечиваются под пальцем
    const steer = fingers.size ? readInput().steer : 0;
    const side = steer < -0.1 ? "L" : steer > 0.1 ? "R" : "";
    if (this.cache.side !== side) {
      this.cache.side = side;
      el("hud").querySelector(".zone.left").classList.toggle("on", side === "L");
      el("hud").querySelector(".zone.right").classList.toggle("on", side === "R");
    }
    this.map();
  },
  map() {
    const g = el("map").getContext("2d"), f = mapFit, dpr = mapBase.width / (el("map").clientWidth || 104);
    g.clearRect(0, 0, mapBase.width, mapBase.height);
    g.drawImage(mapBase, 0, 0);
    for (let k = race.cars.length - 1; k >= 0; k--) {
      const car = race.cars[k];
      g.beginPath();
      g.arc(car.x * f.k + f.ox, car.z * f.k + f.oz, (car.player ? 5.5 : 4) * dpr, 0, 7);
      g.fillStyle = LIVERIES[car.livery].color;
      g.fill();
      g.lineWidth = (car.player ? 2.2 : 1.2) * dpr;
      g.strokeStyle = car.player ? "#ffffff" : "#10173a";
      g.stroke();
    }
  },
};

// ---------- главный цикл ----------
function sound(me) {
  const f = clamp(me.v / (PHYS.vmax * PHYS.nitroTop), 0, 1);
  const gear = Math.min(4, Math.floor(f * 5));
  const rpm = clamp(0.25 + (f * 5 - gear) * 0.6 + gear * 0.04, 0, 1);
  const skid = me.drift ? 1 : clamp((Math.abs(me.slip) - 0.12) * 3, 0, 1) * (me.v > 10 ? 1 : 0);
  Sound.drive(rpm, me.braking ? 0 : 1, me.air > me.ground + 0.1 ? 0 : skid, me.offroad && me.v > 5 ? 1 : 0, f);
}

function tick(now) {
  requestAnimationFrame(tick);
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (paused) return;
  let camMode = "menu", t = 0;
  if (race) {
    acc += real * rush;
    const input = screen === "race" && finishT < 0 ? readInput() : { steer: 0 };
    if (nitroTap) {
      input.nitro = true;
      nitroTap = false;
    }
    let guard = 0;
    while (acc >= STEP && guard++ < 16 * Math.max(1, rush)) {
      race.step(STEP, input);
      input.nitro = false;
      acc -= STEP;
      if (race.events.length) onEvents();
    }
    if (acc > STEP * 4) acc = 0;
  }
  if (screen === "race") {
    const me = race.player;
    if (race.phase === "countdown" || race.phase === "grid") {
      camMode = "intro";
      t = clamp(race.countT / 3.1, 0, 1);
    } else camMode = finishT >= 0 ? "orbit" : "race";
    if (finishT >= 0) {
      finishT += real * rush;
      if (finishT > 2.8) showResult();
    } else {
      hud.update();
      sound(me);
      if (race.phase === "race") {
        teachT += real;
        if (teachT > 6) el("hud").classList.remove("teach");
      }
    }
  } else if (screen === "result") camMode = "orbit";
  else if (screen === "podium") camMode = "podium";
  view.frame(race, real * (screen === "menu" ? 1 : Math.min(rush, 3)), camMode, t);
}

addEventListener("resize", () => {
  view.resize();
  if (screen === "menu") placeScene();
  if (screen === "race" && race) {
    const map = el("map");
    mapFit = drawMap(mapBase, race.track, { size: map.clientWidth, thick: 0.065, rim: "#10173a", line: "#e9eeff", pad: 0.15 });
    map.width = map.height = mapBase.width;
  }
});

// Для проверок и роботов
window.virazh = {
  state() {
    const me = race?.player;
    return {
      screen, mode, paused, track: race ? race.track.id : null, trackIndex, diff: save.diff, phase: race ? race.phase : null,
      time: race ? +race.time.toFixed(2) : 0, cupRound: cup ? cup.round : null, panel: !el("panel").hidden,
      ...(me
        ? { lap: me.lap, place: me.place, speed: +me.v.toFixed(1), nitro: +me.nitro.toFixed(2), s: +me.s.toFixed(1), d: +me.d.toFixed(2), wrong: me.wrong, offroad: me.offroad, drift: me.drift, finished: me.finished, resets: me.resets, walls: me.wallHits, best: me.bestLap }
        : {}),
      save: JSON.parse(JSON.stringify(save)),
    };
  },
  speed(k) {
    rush = clamp(+k || 1, 0.1, 8);
  },
  // Куда рулил бы аккуратный водитель (−1..1): подсказка роботу, он превращает её в касание
  hint(line = 0.6) {
    const me = race?.player;
    if (!me) return null;
    const tr = race.track, look = 8 + me.v * 0.45;
    const j = (me.i + Math.round(look / tr.ds)) % tr.n;
    const k = (me.i + Math.round((me.v * 0.1) / tr.ds)) % tr.n;
    return { steer: steerTo(tr, me, tr.ideal[j] * line, look), safe: tr.vp[k], straight: tr.vp[me.i] > 55 && tr.vp[(me.i + 40) % tr.n] > 55, speed: me.v, nitro: me.nitro };
  },
  // Перенести игрока к концу заезда (для снимков финиша)
  skip(left = 80) {
    const me = race?.player;
    if (!me || race.phase !== "race") return;
    race.skipped = true;
    me.put(race.track, race.laps * race.track.length - left, 0);
    me.lap = race.laps - 1;
    me.v = 30;
  },
  get race() {
    return race;
  },
  view,
  sound: Sound,
  save,
};

renderMenu();
setScreen("menu");
placeScene();
attract();
el("load").hidden = true;
el("race").disabled = el("cup").disabled = false;
requestAnimationFrame(tick);
