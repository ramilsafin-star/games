// «Зубик»: ход приёма, инструменты, подсказки, голос, галерея улыбок. Всё 3D — в mouth.js.
import { Clinic, decorations, braceKinds } from "./mouth.js?v=013fe0bd";
import { tools as TOOL_ART, gems, ui } from "./icons.js?v=013fe0bd";

import { patients, portraitUrl } from "./patients.js?v=013fe0bd";
import { postcard } from "./postcard.js?v=013fe0bd";

const el = (id) => document.getElementById(id);
const KEY = "zubik-v1";
const save = { served: 0, sound: true, music: true, photos: [] };
try {
  Object.assign(save, JSON.parse(localStorage.getItem(KEY)) || {});
} catch {}
function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Если место кончилось, оставляем меньше фото
    save.photos = save.photos.slice(0, 4);
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {}
  }
}
// Украшения: четыре сразу, потом по одному новому за каждого вылеченного зверька
const unlocked = () => decorations.slice(0, Math.min(decorations.length, 4 + save.served));

// ---------- Голос ----------
let utterance = 0,
  voices = [];
const recordings = new Map();
function unlock() {
  if (!save.sound) return;
  Sound.unlock();
  if (save.music) Music.start();
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
// Голос берётся из локальной записи. Запуск AudioContext происходит при касании.
async function say(id, delay = 0) {
  stopVoice();
  if (!save.sound) return;
  const token = utterance;
  const ctx = Sound.ctx;
  try {
    if (!ctx) throw Error("нет звука");
    if (!recordings.has(id)) {
      const loading = fetch("./voices/" + id + ".mp3")
        .then((r) => {
          if (!r.ok) throw Error("нет записи");
          return r.arrayBuffer();
        })
        .then((d) => ctx.decodeAudioData(d));
      loading.catch(() => {});
      recordings.set(id, loading);
    }
    const buf = await recordings.get(id);
    if (token !== utterance) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(Sound.master);
    src.start(ctx.currentTime + delay);
    voices.push(src);
    Music.duck(buf.duration + delay + 0.3);
    return buf.duration + delay;
  } catch {}
}
const praise = () => say("hint/praise" + (1 + Math.floor(Math.random() * 7)));

// ---------- Шаги приёма ----------
let clinic,
  patient,
  steps = [],
  stepAt = 0,
  tool = null,
  deco = null,
  braceKind = "rainbow",
  busy = true,
  idleAt = 0,
  heard = new Set();
let beforePhoto,
  currentPhoto,
  greeting = false;
const happyPortrait = new Image();
const app = document.querySelector(".app");
const STEP = {
  crumbs: { tools: ["tweezers"], say: "crumbs", pending: () => clinic.crumbs.filter((c) => !c.done) },
  floss: { tools: ["floss"], say: "floss", pending: () => clinic.gaps.filter((g) => !g.done) },
  brush: { tools: ["brush"], say: "brush", pending: () => clinic.teeth.filter((t) => t.plaque > 0).map((t) => ({ tooth: t, pos: t.anchor })) },
  rinse: { tools: ["water"], say: "rinse", pending: () => clinic.foam.map((f) => ({ pos: () => f.p })) },
  cavity: {
    tools: ["drill", "paste", "lamp"],
    say: "cavity",
    pending: () => clinic.teeth.filter((t) => t.cavity && t.cavity.state !== "done").map((t) => t.cavity),
  },
  chip: { tools: ["paste", "lamp"], say: "chip", pending: () => clinic.teeth.filter((t) => t.chip && t.chip.state !== "done").map((t) => t.chip) },
  decorate: { tools: [], say: "decorate", pending: () => [] },
};
function plan() {
  const list = [];
  if (clinic.crumbs.length) list.push("crumbs");
  if (clinic.gaps.length) list.push("floss");
  list.push("brush", "rinse");
  if (clinic.teeth.some((t) => t.cavity)) list.push("cavity");
  if (clinic.teeth.some((t) => t.chip)) list.push("chip");
  list.push("decorate");
  return list;
}
const current = () => STEP[steps[stepAt]];

const descriptions = {
  crumbs: "Коснись крошки пинцетом",
  floss: "Подвигай ниточкой между зубками",
  brush: "Потри пятнышки щёткой",
  rinse: "Смой пенку водичкой",
  drill: "Подержи жужжалку на пятнышке",
  paste: "Коснись ямки пастой",
  chip: "Подержи пасту на сколе",
  lamp: "Подержи лампу над зубиком",
  decorate: "Выбери украшение и коснись зубика",
};
function describe() {
  const step = steps[stepAt];
  const id = step === "cavity" || step === "chip" ? (step === "chip" && tool === "paste" ? "chip" : tool) : step;
  el("instruction").textContent = descriptions[id] || "";
}
function nextPatient() {
  busy = true;
  greeting = false;
  beforePhoto = null;
  tool = deco = null;
  el("photo").hidden = true;
  const index = save.served % patients.length;
  patient = patients[index];
  const src = portraitUrl(patient);
  happyPortrait.src = portraitUrl(patient, true);
  el("guest-art").src = el("buddy-img").src = src;
  el("patient-name").textContent = el("who").textContent = patient.name;
  el("story").textContent = patient.story;
  el("story-token").textContent = patient.token;
  if (patient.food === "berry") el("story-token").innerHTML = raspberry;
  el("buddy").hidden = true;
  el("welcome").hidden = false;
  el("start").disabled = el("greet").disabled = false;
  el("start").firstChild.textContent = "Поздороваться ";
  el("tray").replaceChildren();
  el("steps").replaceChildren();
  app.dataset.screen = "welcome";
  clinic.build(index, save.served);
  steps = plan();
  stepAt = 0;
  finishing = -1;
}
const raspberry =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#529568" d="M32 23Q12 23 12 11q13-4 20 8 3-15 18-14-1 15-18 18Z"/><g fill="#df4263" stroke="#bc3455" stroke-width="1.7"><circle cx="32" cy="48" r="8"/><circle cx="24" cy="39" r="9"/><circle cx="40" cy="39" r="9"/><circle cx="20" cy="27" r="9"/><circle cx="44" cy="27" r="9"/><circle cx="32" cy="27" r="10"/></g><ellipse cx="29" cy="24" rx="3" ry="2.7" fill="#ffa0a7"/></svg>';
const waitVoice = (seconds) => new Promise((done) => setTimeout(done, (seconds || 0.2) * 1000));
async function greet() {
  if (app.dataset.screen !== "welcome") return;
  if (greeting) return enterMirror();
  greeting = true;
  unlock();
  Sound.bell();
  el("start").firstChild.textContent = "К зеркалу ";
  const guest = patient;
  await waitVoice(await say(guest.kind + "/hello"));
  if (app.dataset.screen !== "welcome" || guest !== patient) return;
  await waitVoice(await say(guest.kind + "/story"));
  if (app.dataset.screen === "welcome" && guest === patient) enterMirror();
}
async function enterMirror() {
  el("welcome").hidden = true;
  app.dataset.screen = "treat";
  el("buddy").hidden = false;
  const aaa = await say(patient.kind + "/aaa");
  await waitVoice(aaa);
  await el("guest-art").decode();
  beforePhoto = postcard(el("guest-art"), clinic.smileDetail(), patient, false);
  busy = false;
  startStep();
}
el("start").onclick = el("greet").onclick = greet;
function startStep() {
  const st = current();
  tool = st.tools[0] || null;
  deco = null;
  idleAt = performance.now();
  renderTray();
  renderSteps();
  describe();
  // Пропустить шаг, если делать нечего (например, пены не осталось)
  if (steps[stepAt] !== "decorate" && !st.pending().length) return finishStep(true);
  say("hint/" + st.say, 0.15);
}
// Шаг засчитывается один раз, даже если несколько действий закончились одновременно
let finishing = -1;
function finishStep(quiet = false) {
  if (finishing === stepAt) return;
  finishing = stepAt;
  busy = true;
  releaseTool();
  if (!quiet) {
    el("buddy").animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(0deg)" }], {
      duration: clinic.motion.matches ? 0 : 420,
      composite: "add",
    });
    praise();
    Sound.sparkle();
    flash("★");
  }
  setTimeout(
    () => {
      stepAt++;
      busy = false;
      if (stepAt >= steps.length) finishPatient();
      else startStep();
    },
    quiet ? 50 : 1100,
  );
}
function checkStep() {
  if (finishing === stepAt || !steps[stepAt]) return;
  if (steps[stepAt] !== "decorate" && !current().pending().length) finishStep();
}
function smileMarks() {
  const teeth = clinic.teeth.map((t) => ({ tooth: t, x: clinic.screenPoint(t.anchor()).x }));
  const xs = teeth.map((item) => item.x),
    left = Math.min(...xs),
    width = Math.max(...xs) - left;
  return {
    braces: clinic.bracesKind,
    gems: teeth.flatMap(({ tooth, x }) => {
      const id = tooth.deco?.id || (tooth.gold && "gold") || (tooth.glitter && "glitter");
      return id ? [{ id, x: (x - left) / width, lower: tooth.side === "down" }] : [];
    }),
  };
}
async function finishPatient() {
  busy = true;
  tool = null;
  renderTray();
  say("hint/photo");
  await clinic.tween(1.6, () => {});
  clinic.cheer();
  Sound.fanfare();
  Sound.shutter();
  el("flashwhite").classList.remove("on");
  void el("flashwhite").offsetWidth;
  el("flashwhite").classList.add("on");
  await happyPortrait.decode();
  el("buddy-img").src = happyPortrait.src;
  const pic = postcard(happyPortrait, clinic.smileDetail(), patient, true, smileMarks());
  say(patient.kind + "/thanks", 0.4);
  const before = unlocked().length;
  save.served++;
  currentPhoto = { pic, before: beforePhoto, who: patient.name };
  save.photos.unshift(currentPhoto);
  save.photos = save.photos.slice(0, 12);
  store();
  const fresh = unlocked().length > before ? unlocked().at(-1) : null;
  await clinic.tween(1.8, () => {});
  showView(el("compare"), el("photo-img"), currentPhoto, "after");
  el("photo-who").textContent = patient.name;
  el("photo-new").hidden = !fresh;
  if (fresh) el("photo-new").innerHTML = img(fresh.id) + "<span>Новое украшение!</span>";
  el("photo").hidden = false;
  if (fresh) say("hint/unlock", 1.2);
  el("count").textContent = save.served;
}

// ---------- Панель инструментов ----------
// Объёмные картинки инструментов и украшений, отрисованные из тех же 3D-моделей
let bracePics;
const img = (id) => (bracePics?.[id] ? `<img alt="" src="${bracePics[id]}">` : TOOL_ART[id] || gems[id] || "");
const TOOL_NAMES = { tweezers: "Пинцет", floss: "Ниточка", brush: "Щётка", water: "Водичка", drill: "Жужжалка", paste: "Паста", lamp: "Лампа" };
function renderTray() {
  const tray = el("tray");
  if (!steps.length || busy || stepAt >= steps.length) {
    if (!tool) tray.innerHTML = "";
  }
  const name = steps[stepAt];
  if (name === "decorate") {
    tray.innerHTML =
      unlocked()
        .map((d) => {
          const b = `<button class="tool gem${patient.wish === d.id ? " wish" : ""}${deco === d.id ? " on" : ""}" data-deco="${d.id}" aria-label="${d.name}">${img(d.id)}</button>`;
          if (d.id !== "braces" || deco !== "braces") return b;
          // Выбраны брекеты — рядом с кнопкой появляются их виды
          return (
            b +
            braceKinds
              .map(
                (k) =>
                  `<button class="tool gem kind${clinic.bracesKind === k.id ? " on" : ""}" data-kind="${k.id}" aria-label="${k.name}">${img("braces-" + k.id)}</button>`,
              )
              .join("")
          );
        })
        .join("") + `<button class="tool done" data-done="1" aria-label="Готово">${TOOL_ART.done}</button>`;
    return;
  }
  const st = current();
  tray.innerHTML = st
    ? st.tools.map((t) => `<button class="tool${tool === t ? " on" : ""}" data-tool="${t}" aria-label="${TOOL_NAMES[t]}">${img(t)}</button>`).join("")
    : "";
}
function renderSteps() {
  const icon = { crumbs: "tweezers", floss: "floss", brush: "brush", rinse: "water", cavity: "drill", chip: "paste", decorate: null };
  el("steps").innerHTML = steps
    .map((s, i) => `<i class="${i < stepAt ? "done" : i === stepAt ? "now" : ""}">${img(s === "decorate" ? "diamond" : icon[s])}</i>`)
    .join("");
}
el("tray").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || busy) return;
  unlock();
  Sound.tap();
  if (b.dataset.done) {
    finishStep();
    return;
  }
  if (b.dataset.kind) {
    // Другой вид брекетов: снимаются старые, надеваются новые
    braceKind = b.dataset.kind;
    clinic.braces(braceKind);
    Sound.sparkle();
    say("hint/braces-" + braceKind);
  } else if (b.dataset.deco) {
    const was = deco;
    deco = b.dataset.deco;
    if (deco === "braces") {
      if (!bracePics) bracePics = clinic.braceIcons();
      // Первое касание надевает брекеты и показывает их виды, повторное — снимает
      if (was === "braces" && clinic.bracesKind) clinic.braces(null);
      else if (!clinic.bracesKind) {
        clinic.braces(braceKind);
        Sound.sparkle();
        say("hint/braces-" + braceKind);
      }
    } else if (!heard.has(deco)) {
      heard.add(deco);
      say("hint/" + deco);
    }
  } else {
    const requested = b.dataset.tool;
    const pending = current().pending();
    const needed = remedy(pending[0]);
    if (needed && !pending.some((item) => remedy(item) === requested)) {
      guide(needed);
      return;
    }
    tool = requested;
    describe();
  }
  idleAt = performance.now();
  renderTray();
});

// ---------- Касания ----------
let press = null,
  lastScrub = 0;
const R = () => Math.max(34, clinic.pixelRadius(0.3));
// 3D-инструмент в руке: кончик чуть выше пальца, чтобы палец его не закрывал
function cursor(x, y, show) {
  if (!show) return clinic.hidePointer();
  const name = steps[stepAt] === "decorate" ? (deco && deco !== "braces" ? deco : null) : tool;
  clinic.pointer(name, x, y, !!press, press?.touch);
}

function down(e) {
  if (!e.isPrimary) return;
  unlock();
  if (busy) return;
  idleAt = performance.now();
  const y = e.clientY;
  press = { x: e.clientX, y, id: e.pointerId, touch: e.pointerType === "touch" };
  el("stage").setPointerCapture(e.pointerId);
  cursor(e.clientX, y, true);
  act("down", e.clientX, y, 0);
}
function move(e) {
  if (!press || press.id !== e.pointerId) return;
  const y = e.clientY;
  const dist = Math.hypot(e.clientX - press.x, y - press.y);
  press.x = e.clientX;
  press.y = y;
  idleAt = performance.now();
  cursor(e.clientX, y, true);
  act("move", e.clientX, y, dist);
}
function up(e) {
  if (!press || press.id !== e.pointerId) return;
  releaseTool();
}
function releaseTool() {
  press = null;
  el("hold-ring").hidden = true;
  cursor(0, 0, false);
  Sound.stopHum();
  clinic.glowAt(null, false);
}
const remedies = { dirty: "drill", clean: "paste", broken: "paste", soft: "lamp" };
const remedy = (item) => item && remedies[item.state];
function guide(next) {
  tool = next;
  renderTray();
  describe();
  el("tray").querySelector(`[data-tool="${next}"]`)?.classList.add("suggest");
  idleAt = performance.now() - 4200;
  say("hint/" + (next === "drill" ? "cavity" : next === "paste" ? (steps[stepAt] === "chip" ? "chip" : "fill") : "lamp"));
}
function ring(item) {
  const elRing = el("hold-ring");
  elRing.hidden = !item || !press;
  if (elRing.hidden) return;
  const pt = clinic.screenPoint(item.pos());
  elRing.style.left = pt.x + "px";
  elRing.style.top = pt.y + "px";
  elRing.style.setProperty("--p", Math.round(item.progress * 100) + "%");
}
// Что делает инструмент: down — касание, move — ведёт пальцем, hold — держит (каждый кадр)
function act(kind, x, y, dist, dt = 0) {
  if (busy) return;
  const name = steps[stepAt];
  if (kind === "down" && (name === "cavity" || name === "chip")) {
    const target = clinic.nearest(current().pending(), x, y, R() * 1.6);
    if (target && remedy(target) !== tool) {
      guide(remedy(target));
      return;
    }
  }
  if (name === "decorate") {
    if (kind !== "down" || !deco || deco === "braces") return;
    const t = clinic.nearest(clinic.toothTargets(), x, y, R() * 1.4);
    if (t) {
      clinic.decorate(t.tooth, deco);
      Sound.sparkle();
    }
    return;
  }
  if (tool === "tweezers" && kind === "down") {
    const c = clinic.nearest(current().pending(), x, y, R() * 1.6);
    if (c) {
      Sound.pluck();
      // Крошка вылетает из ротика вверх и в сторону
      const p = c.pos();
      clinic.pluck(c, p.clone().set(p.x * 1.6 + (p.x >= 0 ? 2.5 : -2.5), 4, 4)).then(checkStep);
    }
  } else if (tool === "floss" && kind === "move" && dist > 3) {
    const g = clinic.nearest(current().pending(), x, y, R() * 1.4);
    if (g) {
      Sound.squeak();
      if (clinic.floss(g)) {
        Sound.sparkle();
        checkStep();
      }
    }
  } else if (tool === "brush" && (kind === "move" || kind === "down")) {
    const t = clinic.nearest(current().pending(), x, y, R() * 1.5);
    if (t) {
      clinic.brush(t.tooth, Math.max(0.05, dist * 0.006));
      if (performance.now() - lastScrub > 90) {
        Sound.scrub();
        lastScrub = performance.now();
      }
      checkStep();
    }
  } else if (tool === "water" && (kind === "move" || kind === "down")) {
    const n = clinic.rinse(x, y, R() * 1.8);
    const t = clinic.nearest(clinic.toothTargets(), x, y, R() * 3);
    if (t) clinic.spray(t.pos());
    if (performance.now() - lastScrub > 140) {
      Sound.splash();
      lastScrub = performance.now();
    }
    if (n) checkStep();
  } else if (tool === "paste" && kind === "down") {
    // Пломба: касание очищенной дырочки
    const c = clinic.nearest(
      current()
        .pending()
        .filter((c) => c.state === "clean"),
      x,
      y,
      R() * 1.6,
    );
    if (c) {
      clinic.fill(c);
      Sound.squish();
      tool = "lamp";
      ring(null);
      describe();
      renderTray();
      say("hint/lamp");
    }
  } else if (kind === "hold" && (name === "cavity" || name === "chip")) hold(x, y, dt);
}
// Инструменты, которые держат: жужжалка, паста на сколе, лампа
function hold(x, y, dt) {
  const list = current().pending();
  if (tool === "drill") {
    const c = clinic.nearest(
      list.filter((c) => c.state === "dirty"),
      x,
      y,
      R() * 1.6,
    );
    ring(c);
    if (!c) return Sound.stopHum();
    Sound.hum("drill");
    if (clinic.drill(c, dt)) {
      Sound.stopHum();
      Sound.sparkle();
      tool = "paste";
      ring(null);
      describe();
      renderTray();
      say("hint/fill");
    }
  } else if (tool === "paste") {
    const c = clinic.nearest(
      list.filter((c) => c.frag && c.state === "broken"),
      x,
      y,
      R() * 1.6,
    );
    ring(c);
    if (!c) return;
    if (Math.random() < 0.15) Sound.squish();
    if (clinic.grow(c, dt)) {
      tool = "lamp";
      ring(null);
      describe();
      renderTray();
      say("hint/lamp");
    }
  } else if (tool === "lamp") {
    const c = clinic.nearest(
      list.filter((c) => c.state === "soft"),
      x,
      y,
      R() * 1.8,
    );
    clinic.glowAt(c ? c.pos() : null, !!c);
    ring(c);
    if (!c) return Sound.stopHum();
    Sound.hum("lamp");
    if (clinic.harden(c, dt)) {
      Sound.stopHum();
      Sound.sparkle();
      clinic.glowAt(null, false);
      const left = current().pending();
      if (left.length) {
        // Следующая дырочка или скол
        tool = steps[stepAt] === "cavity" ? "drill" : "paste";
        ring(null);
        describe();
        renderTray();
        praise();
      } else checkStep();
    }
  }
}
// ---------- Подсказка рукой ----------
function hintTarget() {
  const name = steps[stepAt];
  if (busy || !name || name === "decorate") return null;
  const list = current().pending();
  if (name === "cavity") {
    const need = { drill: "dirty", paste: "clean", lamp: "soft" }[tool];
    return list.find((c) => c.state === need) || null;
  }
  if (name === "chip") {
    const need = { paste: "broken", lamp: "soft" }[tool];
    return list.find((c) => c.state === need) || null;
  }
  return list[0] || null;
}
let lastFrame = 0;
function loop(ms) {
  const dt = lastFrame ? Math.min(0.1, (ms - lastFrame) / 1000) : 0;
  lastFrame = ms;
  if (press) act("hold", press.x, press.y, 0, dt);
  const idle = !busy && !el("gallery").open && !press && performance.now() - idleAt > 4000;
  let point;
  if (idle && steps[stepAt] === "decorate") {
    const finished = clinic.bracesKind || clinic.teeth.some((t) => t.deco || t.gold || t.glitter);
    const button = finished ? el("tray").querySelector("[data-done]") : !deco && el("tray").querySelector(".wish");
    if (button) {
      const rect = button.getBoundingClientRect();
      point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    } else {
      const tooth = clinic.teeth.find((t) => t.side === "up" && t.type === "central");
      point = clinic.screenPoint(tooth.anchor());
    }
  } else if (idle) {
    const target = hintTarget();
    if (target) point = clinic.screenPoint(target.pos());
  }
  const hand = el("hand");
  hand.hidden = !point;
  if (point) hand.style.transform = `translate(${point.x - 10}px, ${Math.min(point.y, innerHeight - 38)}px)`;
  requestAnimationFrame(loop);
}
function flash(text) {
  const f = el("flash");
  f.textContent = text;
  f.classList.remove("on");
  void f.offsetWidth;
  f.classList.add("on");
}

// ---------- Галерея и кнопки ----------
function buttons() {
  Sound.setOn(save.sound);
  Music.on = save.music;
  el("sound").innerHTML = save.sound ? ui.sound : ui.mute;
  el("music").innerHTML = save.music ? ui.note : ui.noteOff;
  el("sound").setAttribute("aria-label", save.sound ? "Выключить звук" : "Включить звук");
  el("music").setAttribute("aria-label", save.music ? "Выключить музыку" : "Включить музыку");
}
el("sound").onclick = () => {
  save.sound = !save.sound;
  store();
  buttons();
  if (save.sound) unlock();
  else {
    stopVoice();
    Music.stop();
  }
};
el("music").onclick = () => {
  save.music = !save.music;
  store();
  buttons();
  if (save.music) unlock();
  else Music.stop();
};
function showView(switcher, image, record, view) {
  image.src = view === "before" && record.before ? record.before : record.pic;
  switcher.hidden = !record.before;
  for (const button of switcher.children) button.setAttribute("aria-pressed", String(button.dataset.view === view));
}
function compareClick(event, switcher, image, record) {
  const button = event.target.closest("[data-view]");
  if (button) showView(switcher, image, record, button.dataset.view);
}
el("compare").onclick = (e) => compareClick(e, el("compare"), el("photo-img"), currentPhoto);
el("gallery-open").onclick = () => {
  unlock();
  releaseTool();
  const grid = el("gallery-grid");
  grid.replaceChildren();
  if (!save.photos.length) grid.textContent = "Здесь появится первый портрет после приёма.";
  for (const record of save.photos) {
    const item = document.createElement("figure"),
      image = new Image();
    const caption = document.createElement("figcaption");
    caption.textContent = record.who;
    image.alt = record.who;
    const switcher = el("compare").cloneNode(true);
    switcher.removeAttribute("id");
    showView(switcher, image, record, "after");
    switcher.onclick = (e) => compareClick(e, switcher, image, record);
    item.append(image, caption, switcher);
    grid.append(item);
  }
  el("gallery").showModal();
};
el("gallery-close").onclick = () => el("gallery").close();
el("next").onclick = () => {
  unlock();
  say("hint/next");
  nextPatient();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (clinic) releaseTool();
    stopVoice();
    Music.stop();
    Sound.stopHum?.();
  } else if (save.sound && save.music && Sound.ctx) Music.start();
});
el("gallery-open").innerHTML = ui.photos;
el("gallery-close").innerHTML = ui.close;
el("count").textContent = save.served;
buttons();
try {
  clinic = new Clinic(el("stage"));
  const stage = el("stage");
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  if (new URLSearchParams(location.search).has("debug"))
    window.zubik = {
      clinic,
      get step() {
        return steps[stepAt];
      },
      get steps() {
        return steps;
      },
      get tool() {
        return tool;
      },
      set tool(t) {
        tool = t;
        renderTray();
      },
      get busy() {
        return busy;
      },
      act,
      save,
      nextPatient,
    };
  nextPatient();
  requestAnimationFrame(loop);
} catch (error) {
  console.warn("3D недоступно", error);
  el("nogl").hidden = false;
}
