// «Зубик»: ход приёма, инструменты, подсказки, голос, галерея улыбок. Всё 3D — в mouth.js.
import { Clinic, patients, decorations } from "./mouth.js?v=9a893b63";
import { tools as TOOL_ART, gems, ui } from "./icons.js?v=9a893b63";

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
// Только записи Gemini из voices/; роботного голоса устройства нет — без записи игра молчит
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
  busy = true,
  idleAt = 0,
  heard = new Set();
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

async function nextPatient() {
  busy = true;
  el("photo").hidden = true;
  const index = save.served % patients.length;
  patient = patients[index];
  clinic.build(index, save.served);
  steps = plan();
  stepAt = 0;
  finishing = -1;
  el("who").textContent = patient.name;
  Sound.bell();
  // Мордочка выезжает снизу
  await clinic.tween(0.8, (p) => (clinic.face.position.y = -9 * (1 - p) ** 3));
  say(patient.kind + "/hello");
  await clinic.tween(2.7, () => {});
  // «Скажи: А-а-а!» — зверёк отвечает и шире открывает ротик
  say("hint/open");
  await clinic.tween(1.7, () => {});
  say(patient.kind + "/aaa");
  await clinic.tween(1.2, (p) => (clinic.down.position.y = -1.08 - Math.sin(p * Math.PI) * 0.18));
  startStep();
  busy = false;
}
function startStep() {
  const st = current();
  tool = st.tools[0] || null;
  deco = null;
  idleAt = performance.now();
  renderTray();
  renderSteps();
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
  Sound.stopHum();
  clinic.glowAt(null, false);
  if (!quiet) {
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
  const pic = clinic.snapshot();
  say(patient.kind + "/thanks", 0.4);
  const before = unlocked().length;
  save.served++;
  save.photos.unshift({ pic, who: patient.name });
  save.photos = save.photos.slice(0, 12);
  store();
  const fresh = unlocked().length > before ? unlocked().at(-1) : null;
  await clinic.tween(1.8, () => {});
  el("photo-img").src = pic;
  el("photo-who").textContent = patient.name;
  el("photo-new").hidden = !fresh;
  if (fresh) el("photo-new").innerHTML = gems[fresh.id] + "<span>Новое украшение!</span>";
  el("photo").hidden = false;
  if (fresh) say("hint/unlock", 1.2);
  el("count").textContent = save.served;
}

// ---------- Панель инструментов ----------
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
        .map((d) => `<button class="tool gem${deco === d.id ? " on" : ""}" data-deco="${d.id}" aria-label="${d.name}">${gems[d.id]}</button>`)
        .join("") + `<button class="tool done" data-done="1" aria-label="Готово">${TOOL_ART.done}</button>`;
    return;
  }
  const st = current();
  tray.innerHTML = st
    ? st.tools.map((t) => `<button class="tool${tool === t ? " on" : ""}" data-tool="${t}" aria-label="${TOOL_NAMES[t]}">${TOOL_ART[t]}</button>`).join("")
    : "";
}
function renderSteps() {
  const icon = { crumbs: "tweezers", floss: "floss", brush: "brush", rinse: "water", cavity: "drill", chip: "paste", decorate: null };
  el("steps").innerHTML = steps
    .map((s, i) => `<i class="${i < stepAt ? "done" : i === stepAt ? "now" : ""}">${s === "decorate" ? gems.diamond : TOOL_ART[icon[s]]}</i>`)
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
  if (b.dataset.deco) {
    deco = b.dataset.deco;
    if (deco === "braces") {
      clinic.bracesOn = !clinic.bracesOn;
      clinic.braces(clinic.bracesOn);
      Sound.sparkle();
      say("hint/braces");
    } else if (!heard.has(deco)) {
      heard.add(deco);
      say("hint/" + deco);
    }
  } else tool = b.dataset.tool;
  idleAt = performance.now();
  renderTray();
});

// ---------- Касания ----------
let press = null,
  lastScrub = 0;
const R = () => Math.max(34, clinic.pixelRadius(0.3));
function cursor(x, y, show) {
  const c = el("cursor");
  c.hidden = !show;
  if (!show) return;
  c.innerHTML = deco ? gems[deco] : TOOL_ART[tool] || "";
  c.style.transform = `translate(${x - 30}px, ${y - 64}px)`;
}
function down(e) {
  if (!e.isPrimary) return;
  unlock();
  if (busy) return;
  idleAt = performance.now();
  press = { x: e.clientX, y: e.clientY, id: e.pointerId };
  el("stage").setPointerCapture(e.pointerId);
  cursor(e.clientX, e.clientY, true);
  act("down", e.clientX, e.clientY, 0);
}
function move(e) {
  if (!press || press.id !== e.pointerId) return;
  const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  press.x = e.clientX;
  press.y = e.clientY;
  idleAt = performance.now();
  cursor(e.clientX, e.clientY, true);
  act("move", e.clientX, e.clientY, dist);
}
function up(e) {
  if (!press || press.id !== e.pointerId) return;
  press = null;
  cursor(0, 0, false);
  Sound.stopHum();
  clinic.glowAt(null, false);
}
// Что делает инструмент: down — касание, move — ведёт пальцем, hold — держит (каждый кадр)
function act(kind, x, y, dist, dt = 0) {
  if (busy) return;
  const name = steps[stepAt];
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
    const c = clinic.nearest(current().pending().filter((c) => c.state === "clean"), x, y, R() * 1.6);
    if (c) {
      clinic.fill(c);
      Sound.squish();
      tool = "lamp";
      renderTray();
      say("hint/lamp");
    }
  } else if (kind === "hold") hold(x, y, dt);
}
// Инструменты, которые держат: жужжалка, паста на сколе, лампа
function hold(x, y, dt) {
  const list = current().pending();
  if (tool === "drill") {
    const c = clinic.nearest(list.filter((c) => c.state === "dirty"), x, y, R() * 1.6);
    if (!c) return Sound.stopHum();
    Sound.hum("drill");
    if (clinic.drill(c, dt)) {
      Sound.stopHum();
      Sound.sparkle();
      tool = "paste";
      renderTray();
      say("hint/fill");
    }
  } else if (tool === "paste") {
    const c = clinic.nearest(list.filter((c) => c.frag && c.state === "broken"), x, y, R() * 1.6);
    if (!c) return;
    if (Math.random() < 0.15) Sound.squish();
    if (clinic.grow(c, dt)) {
      tool = "lamp";
      renderTray();
      say("hint/lamp");
    }
  } else if (tool === "lamp") {
    const c = clinic.nearest(list.filter((c) => c.state === "soft"), x, y, R() * 1.8);
    clinic.glowAt(c ? c.pos() : null, !!c);
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
  const target = !press && performance.now() - idleAt > 4000 ? hintTarget() : null;
  const hand = el("hand");
  hand.hidden = !target;
  if (target) {
    const p = clinic.screenPoint(target.pos());
    hand.style.transform = `translate(${p.x - 10}px, ${p.y}px)`;
  }
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
el("gallery-open").onclick = () => {
  unlock();
  el("gallery-grid").innerHTML = save.photos.length
    ? save.photos.map((p) => `<figure><img alt="" src="${p.pic}"><figcaption>${p.who}</figcaption></figure>`).join("")
    : "<p>Здесь будут улыбки твоих пациентов</p>";
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
    window.zubik = { clinic, get step() { return steps[stepAt]; }, get steps() { return steps; }, get tool() { return tool; }, set tool(t) { tool = t; renderTray(); }, get busy() { return busy; }, act, save, nextPatient };
  nextPatient();
  requestAnimationFrame(loop);
} catch (error) {
  console.warn("3D недоступно", error);
  el("nogl").hidden = false;
}
