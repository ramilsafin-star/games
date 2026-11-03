import { Match, STEP } from "./match.js?v=56e154f2";
import { Field } from "./field.js?v=56e154f2";
const $ = (id) => document.getElementById(id);
const names = { fox: "Лисёнок", raccoon: "Енот" };
const renderer = new Field($("field"));
let hero = "fox",
  match,
  running = false,
  previous = 0,
  accumulator = 0,
  audio;
let sound = true;
try {
  sound = localStorage.getItem("dvor-cup.sound") !== "off";
  const saved = localStorage.getItem("dvor-cup.hero");
  if (Object.hasOwn(names, saved)) hero = saved;
} catch {}
function remember(k, v) {
  try {
    localStorage.setItem("dvor-cup." + k, v);
  } catch {}
}
function soundLabel() {
  const name = sound ? "Звук вкл." : "Без звука";
  $("sound").textContent = name;
  $("sound").setAttribute("aria-pressed", sound);
  $("sound").setAttribute(
    "aria-label",
    sound ? "Выключить звук" : "Включить звук",
  );
}
function unlock() {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume().catch(() => {});
  } catch {}
}
function tone(f, end, length, type = "sine", volume = 0.08, delay = 0) {
  if (!audio || !sound || audio.state !== "running") return;
  const t = audio.currentTime + delay,
    o = audio.createOscillator(),
    g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(end, t + length);
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  o.connect(g);
  g.connect(audio.destination);
  o.start(t);
  o.stop(t + length + 0.01);
}
function playSound(n) {
  if (n === "kick") tone(150, 49, 0.11, "triangle", 0.24);
  if (n === "bounce") tone(88, 46, 0.07, "triangle", 0.09);
  if (n === "bar") tone(850, 640, 0.17);
  if (n === "jump") tone(270, 430, 0.1, "sine", 0.035);
  if (n === "start") tone(1520, 1280, 0.16, "sine", 0.045);
  if (n === "goal")
    for (const [i, f] of [392, 494, 587, 784].entries())
      tone(f, f * 1.01, 0.2, "triangle", 0.12, i * 0.1);
  if (n === "end") tone(1380, 910, 0.36, "sine", 0.055);
}
$("sound").onclick = () => {
  sound = !sound;
  remember("sound", sound ? "on" : "off");
  soundLabel();
  unlock();
  if (sound) tone(470, 580, 0.12);
};
function pick(team) {
  hero = team;
  remember("hero", hero);
  for (const b of document.querySelectorAll("[data-team]"))
    b.setAttribute("aria-pressed", b.dataset.team === hero);
}
for (const b of document.querySelectorAll("[data-team]"))
  b.onclick = () => pick(b.dataset.team);
const held = new Map(),
  pulses = new Set();
const buttons = [...document.querySelectorAll("[data-control]")];
function pressed(v) {
  return [...held.values()].includes(v);
}
function paintKeys() {
  for (const b of buttons)
    b.classList.toggle("held", pressed(b.dataset.control));
}
function resetInput() {
  held.clear();
  pulses.clear();
  paintKeys();
}
function keyDown(id, action) {
  if (!running || match.paused || match.phase === "end" || held.has(id)) return;
  held.set(id, action);
  if (match.phase === "play" && ["jump", "low", "lob"].includes(action))
    pulses.add(action);
  paintKeys();
}
function keyUp(id) {
  held.delete(id);
  paintKeys();
}
for (const b of buttons) {
  b.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keyDown(e.pointerId, b.dataset.control);
  };
  b.onpointerup =
    b.onpointercancel =
    b.onlostpointercapture =
      (e) => keyUp(e.pointerId);
}
const layout = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "jump",
  Space: "jump",
  KeyZ: "low",
  KeyX: "lob",
};
window.addEventListener("keydown", (e) => {
  if (!running || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.code === "Escape") {
    if (!e.repeat && match.phase !== "end") pause(!match.paused);
    return;
  }
  if (match.paused || match.phase === "end") return;
  if (layout[e.code]) {
    e.preventDefault();
    keyDown(e.code, layout[e.code]);
  }
});
window.addEventListener("keyup", (e) => keyUp(e.code));
function inputs() {
  const on = (v) => pressed(v) || pulses.has(v);
  return {
    move: Number(pressed("right")) - Number(pressed("left")),
    jump: on("jump"),
    shot: on("lob") ? "lob" : on("low") ? "low" : null,
  };
}
function label(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}
function sync() {
  label("score", match.score.join(" : "));
  const t = Math.ceil(match.remaining);
  label("clock", Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"));
  label(
    "callout",
    match.paused
      ? ""
      : match.phase === "kickoff"
        ? "К мячу! →"
        : match.phase === "goal"
          ? match.lastScorer === 0
            ? "Гол! Твой мяч!"
            : "Гол соперника"
          : "",
  );
}
function popup(kicker, title, msg, action) {
  $("overline").textContent = kicker;
  $("headline").textContent = title;
  $("message").textContent = msg;
  $("resume").textContent = action;
  $("overlay").hidden = false;
  $("resume").focus({ preventScroll: true });
}
function pause(on) {
  if (!running || match.phase === "end") return;
  match.paused = on;
  resetInput();
  accumulator = 0;
  previous = 0;
  if (on) popup("ПЕРЕРЫВ", "Пауза", "Мяч и часы подождут.", "Продолжить");
  else {
    $("overlay").hidden = true;
    $("pause").focus({ preventScroll: true });
  }
  sync();
}
function end() {
  resetInput();
  const [a, b] = match.score;
  popup(
    "ФИНАЛЬНЫЙ СВИСТОК",
    a > b ? "Кубок твой!" : a < b ? "До реванша!" : "Ничья!",
    names[hero] +
      " " +
      a +
      " : " +
      b +
      " " +
      names[hero === "fox" ? "raccoon" : "fox"],
    "Реванш →",
  );
  $("pause").disabled = true;
}
function start() {
  unlock();
  resetInput();
  match = new Match();
  running = true;
  renderer.hero = hero;
  renderer.fx = [];
  renderer.trail = [];
  renderer.net = [0, 0];
  previous = 0;
  accumulator = 0;
  $("home").hidden = true;
  $("game").hidden = false;
  $("overlay").hidden = true;
  $("pause").disabled = false;
  $("home-name").textContent = names[hero];
  $("away-name").textContent = names[hero === "fox" ? "raccoon" : "fox"];
  sync();
  window.scrollTo(0, 0);
}
$("start").onclick = start;
$("pause").onclick = () => pause(!match.paused);
$("resume").onclick = () => (match.phase === "end" ? start() : pause(false));
$("menu").onclick = () => {
  resetInput();
  running = false;
  $("home").hidden = false;
  $("game").hidden = true;
  $("start").focus({ preventScroll: true });
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause(true);
});
window.addEventListener("blur", () => pause(true));
function frame(now) {
  requestAnimationFrame(frame);
  if (!running || document.hidden) return;
  const dt = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
  previous = now;
  if (!match.paused && match.phase !== "end") {
    accumulator += dt;
    while (accumulator >= STEP) {
      match.step(STEP, inputs());
      pulses.clear();
      accumulator -= STEP;
      for (const event of match.events) {
        renderer.event(event, match);
        playSound(event);
        if (event === "end") end();
      }
    }
    sync();
  }
  renderer.frame(match, match.paused ? 0 : dt);
}
soundLabel();
pick(hero);
requestAnimationFrame(frame);
