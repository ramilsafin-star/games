// «Фонарики до рассвета»: сцена, камера, экраны, интерфейс, звук и связь с VK.
// Правила забега — rules.js, помощники — ai.js, сохранение — save.js.
import { T, TAU, clamp, lerp, damp, hot, readStorage, writeStorage, rand } from "./kit.js?v=16ea7301";
import * as C from "./config.js?v=16ea7301";
import { buildLayout } from "./layout.js?v=16ea7301";
import { Run } from "./rules.js?v=16ea7301";
import { autopilot } from "./ai.js?v=16ea7301";
import * as S from "./save.js?v=16ea7301";
import { t, setLang, getLang, fireflyName, KINDS } from "./lang.js?v=16ea7301";
import { Renderer, LEVELS, guessLevel } from "./post.js?v=16ea7301";
import { makeSky, MOON_DIR, SUN_DIR } from "./sky.js?v=16ea7301";
import { buildWorld, U } from "./world.js?v=16ea7301";
import { makeCharacter, makeShadow } from "./actors.js?v=16ea7301";
import { Glows, GroundGlows, Particles, makeFlame, makeBeams } from "./fx.js?v=16ea7301";
import { Sound } from "./sound.js?v=16ea7301";
import { Input } from "./input.js?v=16ea7301";

const $ = (id) => document.getElementById(id);
const host = () => window.vkGameHost;
const loadFill = (k) => ($("load-fill").style.width = Math.round(k * 100) + "%");
loadFill(0.2);

// ---------- Сохранение (облако VK успевает попасть в localStorage до чтения) ----------
await window.vkGameHost?.ready;
const save = S.decode(readStorage(S.SAVE_KEY));
setLang(save.lang);
const startNotes = [];
{
  const now = Date.now();
  const off = S.offlineIncome(save, now);
  if (off >= 1) {
    save.coins += off;
    save.total += off;
    startNotes.push(["offline", { n: Math.floor(off) }, "good"]);
  }
  const gift = S.dailyGift(save, now);
  if (gift) startNotes.push(["daily", { d: gift.day, n: gift.gift, m: gift.next }, "good"]);
}
let lastStore = 0;
function storeSave() {
  save.last = Date.now();
  writeStorage(S.SAVE_KEY, S.encode(save));
  lastStore = performance.now();
}
storeSave();
Sound.set(save.sound);
document.body.classList.toggle("touch", matchMedia("(pointer: coarse)").matches);

// ---------- Сцена ----------
const canvas = $("stage");
const R = new Renderer(canvas);
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 1400);
scene.fog = new T.FogExp2("#0b1028", 0.0085);
R.setup(scene, camera);
const layout = buildLayout();
loadFill(0.4);

const hemi = new T.HemisphereLight("#4a5cae", "#0b0d1c", 1.1);
const moon = new T.DirectionalLight("#9fb4ff", 0.75);
moon.position.copy(MOON_DIR).multiplyScalar(200);
scene.add(hemi, moon, moon.target);
const fireLight = new T.PointLight("#ff8a36", 70, 60, 1.5);
fireLight.position.set(0, 2.6, 0);
scene.add(fireLight);
const lanternLights = [0, 1, 2].map(() => {
  const l = new T.PointLight("#ffb860", 0, 18, 1.7);
  scene.add(l);
  return l;
});

const level0 = save.quality === "auto" ? guessLevel() : save.quality;
const sky = makeSky(LEVELS[level0].sky);
scene.add(sky.mesh);
const world = buildWorld(scene, layout, 18000);
world.garden.update(save.build);
loadFill(0.6);
const glows = new Glows(scene);
const ground = new GroundGlows(scene);
const sparks = new Particles(scene, 1600, true);
const smoke = new Particles(scene, 700, false);
const flame = makeFlame(scene);
const beams = makeBeams(scene, 4);
const chars = { player: makeCharacter("player") };
for (const c of C.CREW) chars[c.id] = makeCharacter(c.id);
for (const ch of Object.values(chars)) scene.add(ch.root);
const shadowViews = new Map(); // id тени → вид
const shadowPool = { shadow: [], imp: [], brute: [] };
let bossView = null;
loadFill(0.8);

R.onLevel = (level, L) => {
  world.setGrass(L.grass);
  for (const p of [sparks, smoke]) p.setScale(innerHeight, R.ratio);
};
R.setLevel(level0, save.quality === "auto");

// ---------- Состояние ----------
let screen = "load"; // load | menu | play | result
let run = null;
let paused = false;
let panel = null; // открытая панель: garden | book | up | settings | help | pause | confirm
let auto = false; // автопилот (для проверок)
let speedK = 1;
let adBusy = false;
let snackBonus = false;
let rewardUsed = false;
let lastResult = null;
let resultAt = 0;
const gardenState = {};
const cam = { yaw: 0.6, pitch: 0.3, dist: 12.5, idle: 0, menuT: 0 };
const flyers = [];
const trails = new Map();
const input = new Input(canvas, $("stick"), $("knob"));
input.bindButton($("act"));
input.onPause = () => {
  if (panel) return closeSheet();
  if (screen === "play") pauseMenu();
};
let dawnK = 0.22; // 0 — ночь, 1 — день; сумерки около 0.25
let forceDawn = null; // для съёмки карточки
let fogK = 0;
let windK = 1;
let flash = 0; // вспышка костра при подкормке
let frostK = 0;
let shake = 0;
let time = 0;
let tintTarget = [0, 0, 0, 0];
const tint = [0, 0, 0, 0];

// ---------- Мелочи интерфейса ----------
const CREW_IDS = C.CREW.map((c) => c.id);
const FACE = { fox: "#ff8a3c", bunny: "#f4efe8", bear: "#b07a52" };
const fmt = (n) => Math.floor(n).toLocaleString("ru-RU");
function argsText(args) {
  const a = { ...args };
  if (a.rec) a.name = fireflyName(a.rec);
  if (a.who && CREW_IDS.includes(a.who)) a.who = t("crew_" + a.who);
  if (a.helper && CREW_IDS.includes(a.helper)) a.helper = t("crew_" + a.helper);
  if (a.buff) {
    a.name = t("buff_" + a.buff);
    a.info = t("buffInfo_" + a.buff);
  }
  return a;
}
function toast(key, args = {}, kind = "info") {
  const box = $("toasts");
  const el = document.createElement("div");
  const cls = kind === "good" ? "good" : kind === "warn" ? "warn" : ["giant", "golden", "rainbow", "star", "moon"].includes(kind) ? "rare" : "";
  el.className = "toast " + cls;
  el.textContent = t(key, argsText(args));
  box.append(el);
  while (box.children.length > (innerHeight < 500 ? 2 : 3)) box.firstChild.remove();
  setTimeout(() => el.classList.add("out"), 2900);
  setTimeout(() => el.remove(), 3400);
}
const ICONS = {
  catch: '<svg viewBox="0 0 24 24"><circle cx="12" cy="10" r="3.2" fill="currentColor"/><path d="M12 3v2M12 15v2M5 10h2M17 10h2M7 5l1.4 1.4M15.6 13.6L17 15M7 15l1.4-1.4M15.6 6.4L17 5"/><path d="M8 21c1-2 2.5-3 4-3s3 1 4 3"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M8 4h8M9 4v3l-2 3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9l-2-3V4"/><circle cx="11" cy="14" r="1.6" fill="currentColor"/><circle cx="14" cy="17" r="1.4" fill="currentColor"/></svg>',
  thaw: '<svg viewBox="0 0 24 24"><path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9 4l3 2 3-2M9 20l3-2 3 2"/></svg>',
  cook: '<svg viewBox="0 0 24 24"><path d="M3 21L14 10"/><rect x="13" y="4" width="6" height="7" rx="2.5" transform="rotate(45 16 7.5)" fill="currentColor" fill-opacity="0.35"/></svg>',
  snackFull: '<svg viewBox="0 0 24 24"><path d="M3 21L14 10"/><rect x="13" y="4" width="6" height="7" rx="2.5" transform="rotate(45 16 7.5)"/><path d="M5 5l3 3M8 5L5 8"/></svg>',
  shrine: '<svg viewBox="0 0 24 24"><path d="M12 2l6 7-6 13-6-13z" fill="currentColor" fill-opacity="0.3"/><path d="M6 9h12"/></svg>',
  rest: '<svg viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/></svg>',
  garden: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/></svg>',
  none: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/></svg>',
};

// ---------- Камера ----------
const camTarget = new T.Vector3();
const tmpV = new T.Vector3();
function placeCamera(dt) {
  // съёмка для карточки игры: камера ставится руками
  if (cam.override) {
    const o = cam.override;
    camera.position.set(o.px, o.py, o.pz);
    camTarget.set(o.tx, o.ty, o.tz);
    camera.lookAt(camTarget);
    if (o.fov && camera.fov !== o.fov) {
      camera.fov = o.fov;
      camera.updateProjectionMatrix();
    }
    return;
  }
  if (screen === "menu" || screen === "load") {
    cam.menuT += dt;
    const yaw = 0.9 + Math.sin(cam.menuT * 0.07) * 0.5;
    const d = 23, pitch = 0.3;
    const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    // костёр справа от карточки меню
    const shift = innerWidth > innerHeight ? 6.5 : 0;
    camTarget.set(0, 2.2, 0).addScaledVector(right, -shift);
    camera.position.set(camTarget.x + Math.sin(yaw) * Math.cos(pitch) * d, 1.2 + Math.sin(pitch) * d, camTarget.z + Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(camTarget);
    return;
  }
  const p = run.player;
  const look = input.takeLook();
  if (!paused && screen === "play") {
    cam.yaw -= look.dx * 0.0062;
    cam.pitch = clamp(cam.pitch + look.dy * 0.0045, 0.12, 1.15);
    cam.dist = clamp(cam.dist + look.zoom * 1.2, 9, 26);
    if (look.dx || look.dy) cam.idle = 0;
    else cam.idle += dt;
    // камера сама мягко встаёт за спину, когда бежишь вперёд
    const sp = Math.hypot(p.vx, p.vz);
    if ((cam.idle > 1.2 || auto) && sp > 3) {
      // камера смотрит туда же, куда бежит игрок: значит, стоит позади него
      const behind = Math.atan2(-p.vx, -p.vz);
      const d = Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw));
      if (Math.abs(d) < 2 || auto) cam.yaw += d * Math.min(1, dt * (auto ? 1.5 : 0.7));
    }
  }
  let pitch = cam.pitch, dist = cam.dist;
  if (screen === "result" || (run && run.over)) {
    pitch = lerp(cam.pitch, 0.2, clamp(run.endT / 3, 0, 1));
    dist = cam.dist + clamp(run.endT, 0, 4) * 2;
  }
  const want = tmpV.set(p.x, 2.6, p.z);
  camTarget.lerp(want, 1 - Math.exp(-10 * dt));
  if (camTarget.distanceTo(want) > 30) camTarget.copy(want);
  camera.position.set(camTarget.x + Math.sin(cam.yaw) * Math.cos(pitch) * dist, camTarget.y + Math.sin(pitch) * dist, camTarget.z + Math.cos(cam.yaw) * Math.cos(pitch) * dist);
  clearView(dt);
  if (camera.position.y < 1.2) camera.position.y = 1.2;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  camera.lookAt(camTarget.x, camTarget.y + (screen === "result" ? 2 : 0), camTarget.z);
}
// Камера не залезает в кроны: деревья в сетке, луч от игрока к камере укорачивается до первой кроны
const treeGrid = new Map();
for (const tr of layout.trees) {
  if (Math.hypot(tr.x, tr.z) > C.MAP_RADIUS + 10) continue;
  const k = Math.floor(tr.x / 8) * 1000 + Math.floor(tr.z / 8);
  if (!treeGrid.has(k)) treeGrid.set(k, []);
  treeGrid.get(k).push(tr);
}
function blockedAt(x, y, z) {
  const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
  for (let i = cx - 1; i <= cx + 1; i++)
    for (let j = cz - 1; j <= cz + 1; j++) {
      const list = treeGrid.get(i * 1000 + j);
      if (!list) continue;
      for (const tr of list) {
        // только ствол и низ кроны: остальное в кадре становится прозрачным само (world.js)
        const r = 1.4 * tr.s;
        if (y < 6 * tr.s && Math.hypot(x - tr.x, z - tr.z) < r) return true;
      }
    }
  return false;
}
let camReach = 1;
function clearView(dt) {
  const tx = camTarget.x, ty = camTarget.y, tz = camTarget.z;
  const dx = camera.position.x - tx, dy = camera.position.y - ty, dz = camera.position.z - tz;
  const len = Math.hypot(dx, dy, dz);
  let k = 1;
  for (let s = 1.5; s <= len; s += 0.8) {
    if (blockedAt(tx + (dx * s) / len, ty + (dy * s) / len, tz + (dz * s) / len)) {
      k = Math.max(0.55, (s - 1.2) / len);
      break;
    }
  }
  camReach = k < camReach ? k : damp(camReach, k, 2.5, dt);
  camera.position.set(tx + dx * camReach, ty + dy * camReach, tz + dz * camReach);
}

// куда бежать: джойстик/клавиши относительно камеры
function moveInput() {
  const a = input.axes();
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  return { mx: fx * a.y + -fz * a.x, mz: fz * a.y + fx * a.x };
}

// ---------- Забег: события правил → эффекты, звук, подсказки ----------
const fireTop = new T.Vector3(0, 3.2, 0);
function charOf(a) {
  return chars[a.id];
}
function jarPos(a, out = new T.Vector3()) {
  return out.set(a.x, 2.4, a.z);
}
function fly(from, to, color, delay = 0, dur = 0.6, size = 0.45, arc = 3) {
  flyers.push({ from: from.clone(), to, color: new T.Color(color), t: -delay, dur, size, arc });
}
function handle(e) {
  switch (e.type) {
    case "toast":
      toast(e.key, e.args, e.kind);
      break;
    case "catch": {
      const color = C.kindOf(e.rec).color;
      sparks.burst(e.who.isPlayer ? 14 : 6, e.x, e.y, e.z, color, 4, 0.35, 0.6, { k: 2, drag: 0.1 });
      fly(new T.Vector3(e.x, e.y, e.z), { actor: e.who }, color, 0, 0.3, 0.4, 1);
      if (e.who.isPlayer) {
        if (e.rec.m !== "none" || e.rec.k === "star" || e.rec.k === "moon") Sound.rare();
        else Sound.catch(e.who.jar.length);
      }
      break;
    }
    case "feed": {
      e.recs.forEach((rec, i) => fly(jarPos(e.who), fireTop, C.kindOf(rec).color, i * 0.13, 0.7, 0.5, 4));
      flash = Math.min(1.6, flash + 0.4 + e.recs.length * 0.12);
      setTimeout(() => sparks.burst(30, 0, 3, 0, "#ffb050", 7, 0.45, 1.2, { k: 2.5, up: 5, grav: 2, drag: 0.4 }), 600);
      if (e.who.isPlayer || distTo(e.who) < 30) Sound.feed(e.recs.length);
      bumpCoins();
      break;
    }
    case "garden":
      e.recs.forEach((rec, i) => fly(jarPos(run.player), new T.Vector3(C.GARDEN.x, 3, C.GARDEN.z), C.kindOf(rec).color, i * 0.1, 0.6, 0.45, 2.5));
      Sound.garden();
      setTimeout(() => world.garden && refreshGardenFlies(), 700);
      break;
    case "freeze": {
      const a = e.who;
      sparks.burst(40, a.x, 2, a.z, "#9fe0ff", 7, 0.5, 1, { k: 2, drag: 0.2 });
      if (a.isPlayer || distTo(a) < 45) Sound.freeze();
      if (a.isPlayer) shake = 0.5;
      break;
    }
    case "thaw": {
      const a = e.who;
      sparks.burst(30, a.x, 2, a.z, "#ffd890", 6, 0.45, 0.9, { k: 2.2, up: 2 });
      if (a.isPlayer || e.by?.isPlayer || distTo(a) < 40) Sound.thaw();
      break;
    }
    case "eaten":
      for (let i = 0; i < 14; i++) sparks.emit({ x: e.x + rand(-1, 1), y: 3 + rand(0, 1.5), z: e.z + rand(-1, 1), vx: rand(-1.5, 1.5), vy: rand(1.5, 4), vz: rand(-1.5, 1.5), life: 1.2, size: 0.5, color: "#ffb0d8", k: 2, grav: 1 });
      if (e.who.isPlayer) Sound.eaten();
      break;
    case "scatter":
      if (e.who.isPlayer) Sound.scatter();
      break;
    case "poof": {
      const col = new T.Color(e.color);
      const n = Math.round(26 * e.scale);
      smoke.burst(n, e.x, e.y, e.z, "#120a26", 5 * e.scale, 1.4 * e.scale, 1.1, { alpha: 0.75, drag: 0.15, grow: 1.2 });
      sparks.burst(Math.round(n * 0.8), e.x, e.y, e.z, col, 6 * e.scale, 0.5, 0.9, { k: e.win ? 3 : 1.8, drag: 0.2 });
      if (e.win) sparks.burst(120, e.x, e.y, e.z, "#ffd890", 14, 0.7, 1.8, { k: 3, up: 3, drag: 0.35, grav: 2 });
      break;
    }
    case "shadowIn":
      smoke.burst(10, e.s.x, 2.5, e.s.z, "#120a26", 2.5, 1.2, 0.8, { alpha: 0.6, grow: 1 });
      break;
    case "boss":
      if (e.on) {
        Sound.boss();
        shake = 0.6;
      } else if (e.beaten) Sound.bossGone();
      break;
    case "event":
      if (e.on) {
        if (e.id === "wind") Sound.wind();
        if (e.id === "starfall") Sound.starfall();
        if (e.id === "hungry") Sound.growl();
      }
      break;
    case "starfall":
      e.wild.forEach((w, i) => fly(new T.Vector3(w.hx + rand(-30, 30), 70, w.hz + rand(-30, 30)), { wild: w }, C.kindOf(w.rec).color, i * 0.25, 1.4, 0.8, 0));
      break;
    case "night":
      Sound.night();
      break;
    case "survived":
      Sound.thaw();
      break;
    case "dawn":
      Sound.dawn();
      confetti(160);
      break;
    case "lost":
      Sound.lost();
      smoke.burst(60, 0, 2, 0, "#2a2a3a", 3, 2, 3, { alpha: 0.6, up: 2.5, drag: 0.6, grow: 2 });
      break;
    case "openGarden":
      openSheet("garden");
      break;
    case "quest":
      updateQuest();
      if (e.step === 0) confetti(60);
      break;
    case "newBook":
      bumpCoins();
      break;
    case "buff":
      Sound.buy();
      bumpCoins();
      {
        const p = C.PLACES.find((q) => q.id === e.place);
        sparks.burst(40, p.shrineX, 4, p.shrineZ, C.BUFFS[e.id].color, 6, 0.5, 1, { k: 2.5, up: 2 });
      }
      break;
    case "cook":
      Sound.snack();
      break;
  }
}
const distTo = (a) => (run ? Math.hypot(a.x - run.player.x, a.z - run.player.z) : 99);

// ---------- Светлячки в саду ----------
let gardenFlies = [];
function refreshGardenFlies() {
  gardenFlies = save.garden.map((rec, i) => ({ rec, i }));
}
refreshGardenFlies();

// ---------- Конфетти (на холсте поверх всего) ----------
const conf = { list: [], ctx: $("confetti").getContext("2d") };
function confetti(n) {
  const w = innerWidth;
  for (let i = 0; i < n; i++)
    conf.list.push({ x: rand(0, w), y: rand(-60, -10), vx: rand(-60, 60), vy: rand(80, 220), r: rand(0, 6), vr: rand(-6, 6), s: rand(5, 10), c: ["#ffd36a", "#ff8ad0", "#8fe3ff", "#9dff9a", "#c8a0ff", "#ffb050"][i % 6], life: rand(2.5, 4.5) });
}
function drawConfetti(dt) {
  const cv = $("confetti");
  if (!conf.list.length) {
    if (cv.width) cv.width = 0;
    return;
  }
  if (cv.width !== innerWidth) {
    cv.width = innerWidth;
    cv.height = innerHeight;
  }
  const g = conf.ctx;
  g.clearRect(0, 0, cv.width, cv.height);
  for (let i = conf.list.length - 1; i >= 0; i--) {
    const p = conf.list[i];
    p.life -= dt;
    p.vy += 60 * dt;
    p.x += (p.vx + Math.sin(p.life * 4) * 30) * dt;
    p.y += p.vy * dt;
    p.r += p.vr * dt;
    if (p.life <= 0 || p.y > cv.height + 20) {
      conf.list.splice(i, 1);
      continue;
    }
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.r);
    g.fillStyle = p.c;
    g.globalAlpha = Math.min(1, p.life);
    g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    g.restore();
  }
}

// ---------- Подписи в мире и метки по краям ----------
const labels = new Map();
function label(key, cls) {
  let el = labels.get(key);
  if (!el) {
    el = document.createElement("div");
    el.className = "label " + cls;
    $("labels").append(el);
    labels.set(key, el);
  }
  el.dataset.seen = "1";
  return el;
}
const proj = new T.Vector3();
function toScreen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, in: proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05, behind: proj.z > 1 };
}
// подпись в мире: прячем, если она под верхней панелью
function placeLabel(el, s) {
  el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  // не под верхней панелью и не на плашках слева
  el.style.visibility = s.y < 92 || (s.x < 320 && s.y < 150) ? "hidden" : "";
}
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
function setHTML(el, html) {
  if (el._html !== html) {
    el._html = html;
    el.innerHTML = html;
  }
}
function drawLabels() {
  for (const el of labels.values()) el.dataset.seen = "";
  const people = run ? run.people : [];
  if (screen === "play" && run) {
    for (const a of run.crew) {
      const s = toScreen(a.x, 4.3, a.z);
      if (!s.in || distTo(a) > 80) continue;
      const el = label("crew-" + a.id, a.frozen ? "frozen" : "");
      el.className = "label " + (a.frozen ? "frozen" : "");
      setText(el, (a.frozen ? "❄ " : "") + t("crew_" + a.id));
      placeLabel(el, s);
    }
    const p = run.player;
    for (const pl of C.PLACES) {
      const d = Math.hypot(p.x - pl.x, p.z - pl.z);
      if (d < 55) {
        const s = toScreen(pl.x, 9, pl.z);
        if (s.in) {
          const el = label("place-" + pl.id, "place");
          setText(el, t("place_" + pl.id));
          placeLabel(el, s);
          el.style.opacity = String(clamp((55 - d) / 15, 0, 1));
        }
      }
      const ds = Math.hypot(p.x - pl.shrineX, p.z - pl.shrineZ);
      if (ds < 32) {
        const s = toScreen(pl.shrineX, 6.2, pl.shrineZ);
        if (s.in) {
          const def = C.SHRINES[pl.id];
          const el = label("shrine-" + pl.id, "shrine");
          const rest = run.shrineRest[pl.id] || 0;
          setHTML(el, `${t("buff_" + def.buff)} · ✦${def.cost}<small>${rest > 0 ? t("act_rest", { s: Math.ceil(rest) }) : t("buffInfo_" + def.buff)}</small>`);
          placeLabel(el, s);
        }
      }
    }
    const dg = Math.hypot(p.x - C.GARDEN.x, p.z - C.GARDEN.z);
    if (dg < 45) {
      const s = toScreen(C.GARDEN.x, 5.5, C.GARDEN.z);
      if (s.in) {
        const el = label("garden", "place");
        setText(el, t("gardenTitle") + " · " + t("rate", { rate: S.gardenRate(save).toFixed(2) }));
        placeLabel(el, s);
        el.style.opacity = "1";
      }
    }
  }
  for (const [k, el] of labels) if (!el.dataset.seen) (el.remove(), labels.delete(k));
  drawMarks();
}
const marks = new Map();
function drawMarks() {
  for (const el of marks.values()) el.dataset.seen = "";
  if (screen === "play" && run && !run.over) {
    const want = [];
    for (const a of run.crew) if (a.frozen) want.push({ key: "f" + a.id, x: a.x, z: a.z, cls: "ice", text: "❄" });
    if (run.boss) want.push({ key: "boss", x: run.boss.x, z: run.boss.z, cls: "boss", text: "!" });
    const p = run.player;
    const far = Math.hypot(p.x, p.z) > run.radius + 6;
    if (far && (p.jar.length >= p.jarMax || run.light < 35 || save.quest === 2)) want.push({ key: "camp", x: 0, z: 0, cls: "", text: "🔥" });
    for (const m of want) {
      let el = marks.get(m.key);
      if (!el) {
        el = document.createElement("div");
        el.innerHTML = "<i></i><span></span>";
        $("marks").append(el);
        marks.set(m.key, el);
      }
      el.dataset.seen = "1";
      el.className = "mark " + m.cls;
      setText(el.lastChild, m.text);
      const s = toScreen(m.x, 2, m.z);
      if (s.in && !s.behind) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      // точка за краем экрана: на рамку, стрелкой в её сторону
      let dx = s.x - innerWidth / 2, dy = s.y - innerHeight / 2;
      if (s.behind) (dx = -dx), (dy = -dy);
      const pad = 46;
      const k = Math.min((innerWidth / 2 - pad) / Math.max(1, Math.abs(dx)), (innerHeight / 2 - pad) / Math.max(1, Math.abs(dy)));
      // по краям, но не на верхней панели и не на кнопке действия
      const x = clamp(innerWidth / 2 + dx * k, pad, innerWidth - pad);
      const y = clamp(innerHeight / 2 + dy * k, 96, innerHeight - (x > innerWidth - 190 ? 190 : 60));
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.firstChild.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    }
  }
  for (const [k, el] of marks) if (!el.dataset.seen) (el.remove(), marks.delete(k));
}

// ---------- Интерфейс забега ----------
let shownCoins = save.coins;
function bumpCoins() {
  const b = $("coins");
  b.classList.remove("pop");
  void b.offsetWidth;
  b.classList.add("pop");
}
function updateWallet(dt) {
  shownCoins = Math.abs(save.coins - shownCoins) < 1 ? save.coins : lerp(shownCoins, save.coins, 1 - Math.exp(-8 * dt));
  setText($("coins"), fmt(shownCoins));
  const rate = S.gardenRate(save);
  setText($("rate"), rate > 0 ? t("rate", { rate: rate < 10 ? rate.toFixed(2) : rate.toFixed(1) }) : "");
}
function updateQuest() {
  const q = save.quest;
  const text = q === 3 ? t("quest3", { n: C.QUEST_HOUSES }) : q === 1 ? t("quest1") : q === 2 ? t("quest2") : "";
  $("quest").hidden = !text || screen !== "play";
  setText($("quest-text"), text);
  setText($("quest-title"), t("questTitle"));
  $("menu-quest").hidden = !text;
  setText($("menu-quest"), text ? "✦ " + t("questTitle") + ": " + text : "");
  $("open-garden").classList.toggle("pulse", q === 3);
}
let lastHud = 0;
function updateHud(dt) {
  if (!run || screen !== "play") return;
  const r = run;
  const phase = r.phase === "night" ? t("phase_night", { n: r.night, total: C.NIGHTS }) : t("phase_" + r.phase, { n: r.night });
  setText($("phase-text"), phase);
  const len = r.phase === "night" ? C.NIGHT_SECONDS : r.phase === "dusk0" ? C.DUSK_SECONDS : r.phase === "break" ? C.BREAK_SECONDS : 1;
  $("phase-bar").style.width = clamp((r.t / len) * 100, 0, 100) + "%";
  $("fire-fill").style.width = r.light + "%";
  setText($("fire-text"), t("light", { n: Math.ceil(r.light) }));
  $("fire").classList.toggle("low", r.light < 25 && r.phase === "night");
  // Большая тень
  $("boss").hidden = !r.boss;
  $("toasts").classList.toggle("boss", !!r.boss);
  if (r.boss) {
    $("boss-fill").style.width = clamp(r.boss.hp, 0, 100) + "%";
    setText($("boss-text"), t("boss"));
  }
  // событие ночи
  $("event").hidden = !r.event;
  if (r.event) setHTML($("event"), `${t("event_" + r.event.id)} <em>${Math.ceil(r.event.left)}</em>`);
  // усиления
  const chips = [];
  for (const id in r.player.buffs) if (r.player.buffs[id] > 0) chips.push([id, r.player.buffs[id]]);
  if (r.team.wood > 0) chips.push(["wood", r.team.wood]);
  setHTML($("buffs"), chips.map(([id, s]) => `<div class="buff" style="color:${C.BUFFS[id].color}"><i></i><span style="color:var(--ink)">${t("buff_" + id)} ${Math.ceil(s)}</span></div>`).join(""));
  // помощники
  setHTML($("crew"), r.crew.map((a) => `<div class="mate ${a.frozen ? "frozen" : ""}"><span class="face" style="background:${FACE[a.id]}">${a.frozen ? "❄" : t("crew_" + a.id).split(" ").pop()[0]}</span>${a.frozen ? Math.ceil(a.frozen) : a.jar.length ? "✦".repeat(a.jar.length) : ""}</div>`).join(""));
  // банка и зефир
  const p = r.player;
  setHTML($("jar"), Array.from({ length: p.jarMax }, (_, i) => (i < p.jar.length ? `<i class="on" style="color:${C.kindOf(p.jar[i]).color}"></i>` : "<i></i>")).join(""));
  $("jar").classList.toggle("full", p.jar.length >= p.jarMax);
  setHTML($("snacks"), "<i></i>".repeat(p.snacks));
  // кнопка действия
  const c = r.context(p);
  const kind = c ? c.kind : "none";
  setHTML($("act-icon"), ICONS[kind] || ICONS.none);
  const lab = !c ? "" : kind === "shrine" ? `${t("buff_" + C.SHRINES[c.ref.id].buff)} ✦${c.cost}` : kind === "rest" ? t("act_rest", { s: Math.ceil(c.left) }) : kind === "catch" ? `${t("act_catch")}: ${fireflyName(c.ref.rec)}` : t("act_" + kind);
  setText($("act-label"), lab);
  $("act").classList.toggle("ready", !!c && !["full", "rest", "snackFull"].includes(kind));
  $("act").classList.toggle("idle", !c);
  const hold = c && c.hold > 0 && p.hold.kind === c.kind ? p.hold.t / c.hold : 0;
  $("act-ring").style.strokeDashoffset = String(283 * (1 - clamp(hold, 0, 1)));
  if (kind === "cook" && hold > 0 && Math.random() < dt * 6) Sound.cookTick();
  // заморозка
  $("frozen").hidden = !p.frozen;
  if (p.frozen) {
    setText($("frozen-title"), t("frozenTitle"));
    setText($("frozen-text"), t("frozenText", { s: Math.ceil(p.frozen) }));
    const can = canReward() && !r.selfThawUsed;
    $("thaw-ad").hidden = !can;
    if (can) setHTML($("thaw-ad"), `❄ ${t("thawSelf")} <small>${t("ad")}</small>`);
  }
  updateQuest();
}

// ---------- Экраны ----------
function setScreen(s) {
  screen = s;
  document.body.dataset.screen = s;
  input.enabled = s === "play" && !paused && !panel;
  if (s !== "play") input.reset();
}
function makeShowcase() {
  run = new Run(save, layout, { crew: save.crew, seed: 11 });
  run.showcase = true;
  run.out.length = 0; // подсказка «наступает ночь» — только в забеге
  // все сидят у костра на брёвнах
  const seats = layout.benches;
  run.people.forEach((a, i) => {
    const b = seats[i % seats.length];
    a.x = b.x * 1.05;
    a.z = b.z * 1.05;
  });
  for (const ch of Object.values(chars)) ch.setVisible(false);
  for (const a of run.people) charOf(a).setVisible(true);
  dawnK = 0.22;
}
function menu() {
  closeSheet(true);
  paused = false;
  makeShowcase();
  setScreen("menu");
  clearShadowViews();
  paintMenu();
  $("result").innerHTML = "";
  if (!save.help) openSheet("help");
}
function paintMenu() {
  setText($("tagline"), t("tagline"));
  setText($("eyebrow"), getLang() === "en" ? "5 NIGHTS IN THE FOREST" : "5 НОЧЕЙ В ЛЕСУ");
  setHTML($("title"), getLang() === "en" ? "Lanterns <span>Till Dawn</span>" : "Фонарики <span>до рассвета</span>");
  setText($("play-text"), t("play"));
  setText($("garden-text"), t("garden"));
  setText($("book-text"), t("book") + " " + S.bookCount(save) + "/28");
  setText($("up-text"), t("upgrades"));
  setText($("crew-label"), t("crew"));
  setText($("help"), t("help"));
  setText($("record"), save.best >= 5 ? t("bestDawn", { n: save.dawns }) : save.best > 0 ? t("best", { n: save.best }) : t("bestNone"));
  setHTML(
    $("crew-btns"),
    [1, 2, 3].map((n) => `<button class="crewbtn ${save.crew === n ? "on" : ""}" data-crew="${n}" aria-label="${t("crew")}: ${n}"><span class="faces">${C.CREW.slice(0, n).map((c) => `<i style="background:${FACE[c.id]}"></i>`).join("")}</span>${n}</button>`).join(""),
  );
  const ad = $("snack-ad");
  ad.hidden = !canReward() && !snackBonus;
  ad.disabled = snackBonus;
  setHTML(ad, snackBonus ? "✓ " + t("snackAdGot") : `🍡 ${t("snackAd")}: +1 <small>${t("ad")}</small>`);
  updateQuest();
}
function play() {
  closeSheet(true);
  Sound.unlock();
  run = new Run(save, layout, { crew: save.crew, snacks: snackBonus ? C.FOOD.max + C.AD.snackBonus : 0 });
  snackBonus = false;
  rewardUsed = false;
  paused = false;
  clearShadowViews();
  trails.clear();
  flyers.length = 0;
  for (const ch of Object.values(chars)) ch.setVisible(false);
  for (const a of run.people) charOf(a).setVisible(true);
  // камера сбоку: игрок на переднем плане, костёр слева, а не прямо за его спиной
  cam.yaw = 0.95;
  cam.pitch = 0.3;
  cam.dist = 12.5;
  camTarget.set(run.player.x, 2.6, run.player.z);
  dawnK = 0.25;
  setScreen("play");
  setText($("keys-hint"), t("keys"));
  updateQuest();
  storeSave();
}
function pauseMenu() {
  if (screen !== "play" || !run || run.over) return;
  openSheet("pause");
}
function setPaused(v) {
  paused = v;
  input.enabled = screen === "play" && !paused && !panel;
  if (v) input.reset();
}
function showResult() {
  const r = run;
  lastResult = r.stats;
  setScreen("result");
  resultAt = performance.now();
  paintResult();
  storeSave();
}
function paintResult() {
  const r = run, st = r.stats;
  const moons = Array.from({ length: 5 }, (_, i) => `<i class="${i < st.nights ? "on" : ""}" style="animation-delay:${0.15 * i}s"></i>`).join("");
  const can = canReward() && !rewardUsed && st.glow > 0;
  const newB = st.newEntries.map((rec) => `<i style="color:${C.kindOf(rec).color}" title="${fireflyName(rec)}"></i>`).join("");
  setHTML(
    $("result"),
    `<div class="res ${r.won ? "" : "lost"}">
      <h2>${t(r.won ? "resDawn" : "resLost")}</h2>
      <div class="moons">${moons}</div>
      ${st.record ? `<div class="badge">${t("resRecord")}</div>` : ""}
      <div class="rows">
        <span>${t("resNights")}</span><b>${st.nights} / 5</b>
        <span>${t("resCaught")}</span><b>${st.caught}</b>
        ${st.rescues ? `<span>${t("resRescues")}</span><b>${st.rescues}</b>` : ""}
        ${st.newEntries.length ? `<span>${t("resNew")}</span><b>${st.newEntries.length}</b>` : ""}
        <span>${t("resGlow")}</span><b class="big" id="res-glow">✦ ${fmt(st.glow * (rewardUsed ? 2 : 1))}</b>
      </div>
      ${newB ? `<div class="newbook">${newB}</div>` : ""}
      ${can ? `<button class="ad" id="res-double">✦ ${t("double")} (+${fmt(st.glow)}) <small>${t("ad")}</small></button>` : rewardUsed ? `<small class="note">${t("doubled")}</small>` : ""}
      <div class="btnrow"><button class="primary" id="res-again">${t("again")}</button><button class="ghost" id="res-menu">${t("toMenu")}</button></div>
    </div>`,
  );
}

// ---------- Панели ----------
function openSheet(kind) {
  panel = kind;
  $("sheet").hidden = false;
  if (screen === "play") setPaused(true);
  paintSheet();
}
function closeSheet(silent) {
  const was = panel;
  panel = null;
  $("sheet").hidden = true;
  if (was === "help" && !save.help) {
    save.help = true;
    storeSave();
  }
  if (screen === "play" && !silent) setPaused(false);
  if (screen === "menu") paintMenu();
}
const PIC = {
  house: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/></svg>',
  lamp: '<svg viewBox="0 0 24 24"><path d="M12 22V8M8 8h8l-1 -4H9zM12 4V2"/><circle cx="12" cy="10" r="1.5" fill="currentColor"/></svg>',
  flowers: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M12 11v10M12 16c-3 0-5-2-5-4M12 18c3 0 5-2 5-4"/></svg>',
  feeder: '<svg viewBox="0 0 24 24"><path d="M4 10l8-6 8 6M6 10v6h12v-6M12 16v6"/></svg>',
  jar: '<svg viewBox="0 0 24 24"><path d="M8 3h8M9 3v3l-2 3v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9l-2-3V3"/><circle cx="12" cy="14" r="2" fill="currentColor"/></svg>',
  boots: '<svg viewBox="0 0 24 24"><path d="M7 3h5v9l7 3v4H5v-4z"/><path d="M3 8h3M2 12h4"/></svg>',
};
function buyButton(cost, data) {
  if (cost == null) return `<button class="buy max" disabled>${t("max")}</button>`;
  return `<button class="buy ${save.coins < cost ? "poor" : ""}" ${data}><span class="spark"></span>${fmt(cost)}</button>`;
}
function paintSheet() {
  const body = $("sheet-body");
  const title = $("sheet-title");
  let html = "";
  if (panel === "garden") {
    setText(title, t("gardenTitle"));
    const rate = S.gardenRate(save);
    const dots = save.garden.map((r) => `<i style="color:${C.kindOf(r).color}" title="${fireflyName(r)}"></i>`).join("");
    html += `<div class="stat"><span>${t("gardenInfo", { count: save.garden.length, max: S.slots(save), rate: rate.toFixed(2) })}</span><div class="dots">${dots || `<small class="note">${t("gardenEmpty")}</small>`}</div></div>`;
    html += `<p class="note">${t("gardenHint")}</p>`;
    for (const b of C.BUILDINGS) {
      const have = save.build[b.id];
      const info = t("buildInfo_" + b.id, { slots: b.slots, rate: b.rate, pct: Math.round((b.bonus || 0) * 100), hours: b.hours });
      const pips = b.costs.map((_, i) => `<i class="${i < have ? "on" : ""}"></i>`).join("");
      const pulse = save.quest === 3 && b.id === "house" ? ' style="box-shadow:0 0 18px rgba(255,190,80,.6);border-color:var(--gold)"' : "";
      html += `<div class="item"${pulse}><div class="pic">${PIC[b.id]}</div><div><b>${t("build_" + b.id)}</b><small>${info}</small><div class="pips">${pips}</div></div>${buyButton(S.buildCost(save, b.id), `data-build="${b.id}"`)}</div>`;
    }
  } else if (panel === "up") {
    setText(title, t("upgrades"));
    for (const u of C.UPGRADES) {
      const lv = save.up[u.id];
      const a = u.levels[lv], b = u.levels[lv + 1];
      const info = b == null ? t("upMax", { a, unit: t("unit_" + u.id) }) : t("upInfo", { a, b, unit: t("unit_" + u.id) });
      const pips = u.levels.slice(1).map((_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("");
      html += `<div class="item"><div class="pic">${PIC[u.id]}</div><div><b>${t("up_" + u.id)}</b><small>${info}</small><div class="pips">${pips}</div></div>${buyButton(S.upgradeCost(save, u.id), `data-up="${u.id}"`)}</div>`;
    }
  } else if (panel === "book") {
    const found = S.bookCount(save);
    setText(title, t("bookTitle", { found, total: 28 }));
    html += `<div class="progress"><i style="width:${(found / 28) * 100}%"></i></div><p class="note">${t("bookHint")}</p>`;
    html += `<div class="book"><span></span>${C.BOOK_MUTATIONS.map((m) => `<span class="h">${t("col_" + m)}</span>`).join("")}`;
    for (const f of C.FIREFLIES) {
      const any = C.BOOK_MUTATIONS.some((m) => save.caught[f.id + ":" + m]);
      html += `<span class="name"><i style="color:${any ? f.color : "#555"}"></i>${any ? fireflyName({ k: f.id, m: "none" }) : t("unknown")}</span>`;
      for (const m of C.BOOK_MUTATIONS) {
        const n = save.caught[f.id + ":" + m];
        const ring = m === "none" ? "transparent" : C.RING[m];
        html += n ? `<span class="cell got ${m === "rainbow" ? "rainbow" : ""}" style="--c:${f.color};--ring:${ring}" title="${fireflyName({ k: f.id, m })} ×${n}"></span>` : `<span class="cell">?</span>`;
      }
    }
    html += "</div>";
  } else if (panel === "settings") {
    setText(title, t("settings"));
    const q = save.quality;
    const cur = R.level;
    html += `<div class="setrow"><b>${t("quality")}</b><div class="seg">${["auto", "high", "medium", "low"].map((l) => `<button data-q="${l}" class="${q === l ? "on" : ""}">${t("q_" + l)}${l === "auto" && q === "auto" ? " · " + t("q_" + cur) : ""}</button>`).join("")}</div></div>`;
    html += `<div class="setrow"><b>${t("language")}</b><div class="seg"><button data-lang="ru" class="${getLang() === "ru" ? "on" : ""}">Русский</button><button data-lang="en" class="${getLang() === "en" ? "on" : ""}">English</button></div></div>`;
    html += `<div class="setrow"><b>${t("sound")}</b><div class="seg"><button data-snd="1" class="${save.sound ? "on" : ""}">${t("on")}</button><button data-snd="0" class="${!save.sound ? "on" : ""}">${t("off")}</button></div></div>`;
    html += `<p class="note">${t("keys")}</p>`;
  } else if (panel === "help") {
    setText(title, t("help"));
    const cols = ["#ffd65c", "#ffaa50", "#6ed282", "#ffecd6", "#966ee6", "#ff6ec4"];
    html += `<div class="cards">${[1, 2, 3, 4, 5, 6].map((i) => `<div style="--c:${cols[i - 1]}"><b>${t("h" + i + "t")}</b><span>${t("h" + i)}</span></div>`).join("")}</div><p class="note">${t("hFoot")}</p><div class="btnrow"><button class="primary" data-close>${t("go")}</button></div>`;
  } else if (panel === "pause") {
    setText(title, t("pause"));
    html += `<div class="btnrow"><button class="primary" data-close>${t("resume")}</button></div><div class="btnrow"><button class="ghost" data-open="settings">${t("settings")}</button><button class="ghost" data-open="help">${t("help")}</button><button class="ghost" data-open="confirm">${t("toMenu")}</button></div>`;
  } else if (panel === "confirm") {
    setText(title, t("toMenu"));
    html += `<p class="note">${t("leaveRun")}</p><div class="btnrow"><button class="primary" data-leave>${t("toMenu")}</button><button class="ghost" data-open="pause">${t("resume")}</button></div>`;
  }
  setHTML(body, html);
}
$("sheet").addEventListener("click", (e) => {
  if (e.target === $("sheet") && panel !== "help") return closeSheet();
  const b = e.target.closest("button");
  if (!b) return;
  Sound.unlock();
  const d = b.dataset;
  if (b.id === "sheet-close" || d.close !== undefined) {
    Sound.tap();
    return closeSheet();
  }
  if (d.open) {
    Sound.tap();
    panel = d.open;
    return paintSheet();
  }
  if (d.leave !== undefined) {
    // выйти из забега: пройденные ночи засчитываются
    if (run && !run.over) {
      run.finish(false);
      run.out.length = 0;
    }
    storeSave();
    return menu();
  }
  if (d.build || d.up) {
    const res = d.build ? S.build(save, d.build) : S.buyUpgrade(save, d.up);
    if (res === "ok") {
      Sound.buy();
      toast(d.build ? "built" : "upgraded", { name: t(d.build ? "build_" + d.build : "up_" + d.up) }, "good");
      if (d.build) {
        world.garden.update(save.build);
        sparks.burst(40, C.GARDEN.x, 3, C.GARDEN.z, "#ffd890", 7, 0.5, 1.2, { k: 2.5, up: 3 });
      }
      if (run && !run.showcase && d.up) {
        run.player.jarMax = S.upgradeValue(save, "jar");
      }
      updateQuest();
      storeSave();
    } else {
      Sound.error();
      toast(res === "max" ? "err_max" : "err_glow", {}, "warn");
    }
    return paintSheet();
  }
  if (d.q) {
    save.quality = d.q;
    R.extraDrop = 1;
    R.setLevel(d.q === "auto" ? guessLevel() : d.q, d.q === "auto");
    storeSave();
    Sound.tap();
    return paintSheet();
  }
  if (d.lang) {
    save.lang = d.lang;
    setLang(d.lang);
    storeSave();
    Sound.tap();
    paintSheet();
    return paintMenu();
  }
  if (d.snd) {
    setSound(d.snd === "1");
    return paintSheet();
  }
});
function setSound(on) {
  save.sound = on;
  Sound.set(on);
  if (on) Sound.unlock();
  $("sound").setAttribute("aria-pressed", String(on));
  storeSave();
}

// ---------- Кнопки ----------
$("play").addEventListener("click", () => {
  Sound.unlock();
  Sound.tap();
  play();
});
$("open-garden").addEventListener("click", () => (Sound.unlock(), Sound.tap(), openSheet("garden")));
$("open-book").addEventListener("click", () => (Sound.unlock(), Sound.tap(), openSheet("book")));
$("open-up").addEventListener("click", () => (Sound.unlock(), Sound.tap(), openSheet("up")));
$("settings").addEventListener("click", () => (Sound.unlock(), Sound.tap(), openSheet("settings")));
$("help").addEventListener("click", () => (Sound.unlock(), Sound.tap(), openSheet("help")));
$("pause").addEventListener("click", () => (Sound.tap(), pauseMenu()));
$("sound").addEventListener("click", () => setSound(!save.sound));
$("sound").setAttribute("aria-pressed", String(save.sound));
$("crew-btns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-crew]");
  if (!b) return;
  Sound.unlock();
  Sound.tap();
  save.crew = Number(b.dataset.crew);
  storeSave();
  makeShowcase();
  paintMenu();
});
$("snack-ad").addEventListener("click", async () => {
  if (snackBonus || !canReward() || adBusy) return;
  if (await rewarded()) {
    snackBonus = true;
    Sound.buy();
  }
  paintMenu();
});
$("thaw-ad").addEventListener("click", async () => {
  if (!run || !run.player.frozen || run.selfThawUsed || adBusy) return;
  if (await rewarded()) {
    run.selfThaw();
    Sound.thaw();
  }
});
$("result").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || performance.now() - resultAt < 600) return;
  Sound.unlock();
  if (b.id === "res-double") {
    if (rewardUsed || !canReward() || adBusy) return;
    const ok = await rewarded();
    if (ok && !rewardUsed && screen === "result") {
      rewardUsed = true;
      save.coins += lastResult.glow;
      save.total += lastResult.glow;
      storeSave();
      Sound.buy();
      confetti(50);
      bumpCoins();
    }
    return paintResult();
  }
  if (b.id === "res-again") {
    Sound.tap();
    await adBreak();
    return play();
  }
  if (b.id === "res-menu") {
    Sound.tap();
    await adBreak();
    return menu();
  }
});

// ---------- VK: сворачивание, реклама, баннер ----------
const canReward = () => !!(host()?.inVk && host().rewardReady);
let hiddenAt = 0;
function quiet() {
  if (screen === "play" && run && !run.over && !panel) openSheet("pause");
  Sound.hush();
  if (!hiddenAt) hiddenAt = Date.now();
  storeSave();
}
function wake() {
  if (hiddenAt) {
    // свёрнутая игра: сад работал «без игрока» — четверть силы, как офлайн
    const away = Date.now() - hiddenAt;
    hiddenAt = 0;
    if (away > 60000) {
      const was = save.last;
      save.last = Date.now() - away;
      const gain = S.offlineIncome(save, Date.now());
      save.last = was;
      if (gain >= 1) {
        save.coins += gain;
        save.total += gain;
        toast("offline", { n: Math.floor(gain) }, "good");
        storeSave();
      }
    }
  }
}
function visibility() {
  if (document.hidden || host()?.hidden) quiet();
  else wake();
}
document.addEventListener("visibilitychange", visibility);
addEventListener("vk-game-visibility", visibility);
addEventListener("pagehide", storeSave);
addEventListener("vk-ad", (e) => {
  if (e.detail?.on) {
    adBusy = true;
    Sound.hush();
    input.reset();
  } else {
    adBusy = false;
    if (!document.hidden && !host()?.hidden && save.sound) Sound.unlock();
  }
});
addEventListener("vk-reward-ready", () => {
  if (screen === "result") paintResult();
  if (screen === "menu" && !panel) paintMenu();
});
// пока идёт ролик, нажатия и клавиши до игры не доходят
for (const type of ["pointerdown", "pointerup", "click", "keydown", "touchstart"]) {
  addEventListener(
    type,
    (e) => {
      if (!adBusy) return;
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    },
    { capture: true, passive: false },
  );
}
addEventListener("pointerdown", () => {
  if (save.sound && !document.hidden && !host()?.hidden && !adBusy) Sound.unlock();
});
async function adBreak() {
  if (adBusy) return false;
  adBusy = true;
  try {
    await host()?.interstitial?.();
  } catch {}
  adBusy = false;
  return true;
}
async function rewarded() {
  if (adBusy || !canReward()) return false;
  adBusy = true;
  let ok = false;
  try {
    ok = await host().rewarded();
  } catch {}
  adBusy = false;
  return ok;
}
// Баннер VK — только на спокойных экранах: меню (с садом, коллекцией, улучшениями, настройками),
// сад и коллекция поверх забега, итоги. Не в забеге, не на паузе и не на первом «Как играть».
const calm = () => {
  if (adBusy) return false;
  if (panel === "help" && !save.help) return false;
  if (screen === "menu" || screen === "result") return true;
  return screen === "play" && (panel === "garden" || panel === "book" || panel === "up");
};
host()?.bannerWhen?.(calm);
addEventListener("resize", () => {
  R.resize();
  for (const p of [sparks, smoke]) p.setScale(innerHeight, R.ratio);
});

// ---------- Кадр ----------
const fireColor = new T.Color("#ff8a36");
const fogNight = new T.Color("#0b1028"), fogDawn = new T.Color("#b8a6b8"), fogThick = new T.Color("#1a2140");
const tmpC = new T.Color();
let last = performance.now();
let emberClock = 0, smokeClock = 0, leafClock = 0, moteClock = 0;
let saveClock = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, Math.min(0.1, (now - last) / 1000)); // метка кадра бывает раньше performance.now()
  last = now;
  const dt = Math.min(raw, 0.05);
  time += dt;
  U.uTime.value = time;
  const active = !document.hidden && !host()?.hidden && !adBusy;

  // правила
  if (run && active && !(screen === "play" && paused)) {
    if (screen === "play" || run.showcase || screen === "result") {
      const steps = Math.max(1, Math.round(speedK));
      const sdt = (dt * speedK) / steps;
      for (let i = 0; i < steps; i++) {
        let inp = { mx: 0, mz: 0, act: false, press: false };
        if (screen === "play" && !run.over) {
          if (auto) inp = autopilot(run, sdt, { shrines: true });
          else {
            inp = moveInput();
            inp.act = input.act;
            inp.press = i === 0 && input.takePress();
          }
        }
        run.step(sdt, inp);
        // сад приносит сияние каждую секунду
        save.coins += S.gardenRate(save) * sdt;
        save.total += S.gardenRate(save) * sdt;
        const grown = S.gardenTick(save, sdt, gardenState);
        if (grown) {
          toast("gardenGrew", { rec: grown }, "giant");
          refreshGardenFlies();
        }
      }
      for (const e of run.out) handle(e);
      run.out.length = 0;
      if (screen === "play" && run.over && run.endT > C.END_SECONDS) showResult();
    }
  } else if (screen === "menu" && active) {
    save.coins += S.gardenRate(save) * dt;
  }
  saveClock += dt;
  if (saveClock > 15) {
    saveClock = 0;
    storeSave();
  }

  // небо и свет
  if (run && !run.showcase) {
    const r = run;
    let target = r.phase === "dusk0" ? lerp(0.25, 0.04, clamp(r.t / C.DUSK_SECONDS, 0, 1)) : r.phase === "break" ? 0.06 : 0;
    if (r.phase === "dawn") target = clamp(r.endT / 3.5, 0, 1);
    dawnK = damp(dawnK, target, r.phase === "dawn" ? 3 : 2, dt);
    fogK = damp(fogK, r.event?.id === "fog" ? 1 : 0, 1.2, dt);
    windK = damp(windK, r.event?.id === "wind" ? 3.2 : 1, 1.5, dt);
    tintTarget = r.event?.id === "hungry" ? [0.25, 0.02, 0.15, 0.25] : r.player.frozen ? [0.4, 0.7, 1, 0.12] : r.boss ? [0.18, 0.02, 0.3, 0.2] : [0, 0, 0, 0];
  } else {
    dawnK = damp(dawnK, forceDawn ?? 0.22, 2, dt);
    fogK = damp(fogK, 0, 2, dt);
    windK = damp(windK, 1, 2, dt);
    tintTarget = [0, 0, 0, 0];
  }
  for (let i = 0; i < 4; i++) tint[i] = damp(tint[i], tintTarget[i], 3, dt);
  R.setTint(tint[0], tint[1], tint[2], tint[3]);
  sky.uniforms.uTime.value = time;
  sky.uniforms.uDawn.value = dawnK;
  sky.uniforms.uFog.value = fogK;
  U.uDawn.value = dawnK;
  U.uWind.value = windK;
  R.setDawn(dawnK);
  scene.fog.color.copy(fogNight).lerp(fogThick, fogK).lerp(fogDawn, dawnK * 0.8);
  scene.fog.density = lerp(0.0085, 0.022, fogK) * (1 - dawnK * 0.55);
  U.uFogColor.value.copy(scene.fog.color);
  U.uFogDensity.value = scene.fog.density;
  hemi.intensity = lerp(1.1, 2.6, dawnK);
  hemi.color.set("#4a5cae").lerp(tmpC.set("#bcd4ff"), dawnK);
  hemi.groundColor.set("#0b0d1c").lerp(tmpC.set("#5a4a3a"), dawnK);
  moon.intensity = lerp(0.75, 2.4, dawnK);
  moon.color.set("#9fb4ff").lerp(tmpC.set("#ffd6a8"), dawnK);
  moon.position.copy(MOON_DIR).lerp(SUN_DIR, dawnK).multiplyScalar(200);
  R.gl.toneMappingExposure = lerp(1.05, 0.95, dawnK);

  // костёр
  const lightK = run ? run.light / 100 : 0.6;
  flash = Math.max(0, flash - dt * 1.2);
  const flick = 0.85 + Math.sin(time * 13) * 0.05 + Math.sin(time * 7.3) * 0.06 + Math.sin(time * 23.1) * 0.03;
  const power = run && run.phase === "lost" ? Math.max(0, 0.3 - run.endT * 0.1) : (0.25 + lightK * 0.85 + flash * 0.4) * (1 - dawnK * 0.3);
  flame.update(power * flick, (windK - 1) * 0.35 + Math.sin(time * 1.7) * 0.05, camera);
  fireLight.intensity = 70 * power * flick * (1 - dawnK * 0.6);
  fireLight.distance = (run ? run.radius : 30) * 1.35 + 8;
  U.uFire.value.set(0, 2.6, 0, power * flick * (1 - dawnK * 0.5));
  U.uRadius.value = run ? run.radius : C.radius(60);
  world.camp.embersBed.material.color.copy(fireColor).multiplyScalar(0.6 + power * 1.4);
  emberClock += dt * (8 + power * 30);
  while (emberClock > 1) {
    emberClock--;
    sparks.emit({ x: rand(-0.8, 0.8), y: 1 + rand(0, 1.5), z: rand(-0.8, 0.8), vx: rand(-0.6, 0.6) + (windK - 1) * 1.5, vy: rand(2.5, 5.5), vz: rand(-0.6, 0.6), life: rand(1, 2.4), size: rand(0.12, 0.26), color: Math.random() < 0.5 ? "#ff8a2a" : "#ffc85a", k: 2.6, wob: 3, drag: 0.7 });
  }
  smokeClock += dt * 3 * power;
  while (smokeClock > 1) {
    smokeClock--;
    smoke.emit({ x: rand(-0.5, 0.5), y: 3.5, z: rand(-0.5, 0.5), vx: (windK - 1) * 2 + rand(-0.3, 0.3), vy: rand(1.2, 2), vz: rand(-0.3, 0.3), life: rand(3, 5), size: 1.4, color: "#1a1a26", alpha: 0.28, grow: 2.5, drag: 0.9 });
  }

  // персонажи
  const people = run ? run.people : [];
  let li = 0;
  for (const a of people) {
    const ch = charOf(a);
    const extra = {};
    if (run.showcase) extra.face = Math.atan2(-a.x, -a.z);
    if (a.isPlayer && screen === "play") {
      const c = run.context(a);
      extra.cooking = c && c.kind === "cook" && a.hold.kind === "cook" && a.hold.t > 0;
      extra.cookT = c && c.hold ? a.hold.t / c.hold : 0;
      extra.thawing = c && c.kind === "thaw" && a.hold.kind === "thaw" && a.hold.t > 0;
    } else if (!a.isPlayer && a.hold.kind === "thaw" && a.hold.t > 0) extra.thawing = true;
    if (run.won && run.over) extra.happy = true;
    ch.animate(a, dt, time, extra);
    if (a.frozen && Math.random() < dt * 8) sparks.emit({ x: a.x + rand(-1.2, 1.2), y: rand(0.5, 3.8), z: a.z + rand(-1.2, 1.2), vy: rand(-0.3, 0.4), life: 1, size: 0.18, color: "#d8f4ff", k: 2 });
  }
  // три фонаря со светом: игрок и два ближайших к камере помощника
  const lit = people.filter((a) => !a.frozen).sort((a, b) => (a.isPlayer ? -1 : b.isPlayer ? 1 : distTo(a) - distTo(b)));
  for (let i = 0; i < 3; i++) {
    const a = lit[i];
    const L = lanternLights[i];
    if (a && !run.showcase) {
      const w = charOf(a).lampWorld;
      // свет чуть выше и впереди фонаря: иначе рядом стоящий плащ пересвечивается
      const ox = w.x - a.x, oz = w.z - a.z, ol = Math.hypot(ox, oz) || 1;
      L.position.set(w.x + (ox / ol) * 1.6, w.y + 0.8, w.z + (oz / ol) * 1.6);
      L.intensity = (a.isPlayer ? 20 : 12) * (1 - dawnK * 0.8);
      U.uLamps.value[i].set(w.x, w.y, w.z, (a.isPlayer ? 1 : 0.7) * (1 - dawnK * 0.8));
      U.uLampCol.value[i].set("#ffb860");
    } else {
      L.intensity = 0;
      U.uLamps.value[i].w = 0;
    }
  }
  U.uLamps.value[3].w = 0;
  if (run) U.uPlayer.value.set(run.player.x, 0, run.player.z);

  // тени
  updateShadows(dt);

  // камера
  placeCamera(dt);
  U.uCenter.value.set(camTarget.x, 0, camTarget.z);
  U.uCam.value.copy(camera.position);
  U.uTgt.value.copy(camTarget);

  // светлячки, следы, полёты, пятна света
  drawGlows(dt);
  world.update(time, run && !run.showcase ? run : null);
  sparks.update(dt, time, (windK - 1) * 4);
  smoke.update(dt, time, (windK - 1) * 3);
  // ветер: листья; споры у грибов
  if (windK > 1.3) {
    leafClock += dt * 30 * (windK - 1);
    while (leafClock > 1) {
      leafClock--;
      smoke.emit({ x: camTarget.x + rand(-30, 10), y: rand(1, 9), z: camTarget.z + rand(-25, 25), vx: rand(8, 14), vy: rand(-1, 1), vz: rand(-2, 2), life: 3, size: 0.25, color: Math.random() < 0.5 ? "#7a5a2a" : "#4a6a2a", alpha: 0.9, wob: 6, drag: 1 });
    }
  }
  moteClock += dt * 6;
  while (moteClock > 1) {
    moteClock--;
    const a = rand(0, TAU), d = rand(10, 45);
    sparks.emit({ x: camTarget.x + Math.cos(a) * d, y: rand(0.5, 6), z: camTarget.z + Math.sin(a) * d, vx: rand(-0.3, 0.3), vy: rand(0.1, 0.5), vz: rand(-0.3, 0.3), life: rand(3, 6), size: rand(0.06, 0.12), color: "#bfe0ff", k: 1.4 * (1 - dawnK), wob: 0.6 });
  }

  // звук
  if (run) {
    Sound.env.night = screen === "load" ? 0 : 1 - dawnK;
    Sound.env.dawn = dawnK;
    Sound.env.fire = clamp(power, 0, 1.5) / 1.5;
    const fd = Math.hypot(camTarget.x, camTarget.z);
    Sound.env.fireNear = clamp(1 - fd / 40, 0, 1);
    Sound.env.wind = clamp((windK - 1) / 2, 0, 1);
    let danger = 0;
    if (screen === "play") for (const s of run.shadows) if (s.target === run.player) danger = Math.max(danger, clamp(1 - Math.hypot(s.x - run.player.x, s.z - run.player.z) / 30, 0, 1));
    if (run.boss) danger = Math.max(danger, 0.5);
    Sound.env.danger = danger;
    Sound.tick(dt);
  }

  frostK = damp(frostK, run && run.player.frozen && screen === "play" ? 1 : 0, 4, dt);
  R.setFrost(frostK);
  R.paused = paused || !!panel;
  R.render(dt, time);

  drawLabels();
  updateHud(dt);
  updateWallet(dt);
  drawConfetti(dt);
  document.body.classList.toggle("sticking", !!input.stick);
}

// Тени: вид на каждую тень из правил, лучи фонарей к Большой тени
function clearShadowViews() {
  for (const v of shadowViews.values()) {
    scene.remove(v.root);
    shadowPool[v.kind].push(v);
  }
  shadowViews.clear();
  if (bossView) bossView.root.visible = false;
  beams.hideFrom(0);
}
let trailClock = 0;
function updateShadows(dt) {
  const list = run && !run.showcase ? run.shadows : [];
  const seen = new Set();
  for (const s of list) {
    seen.add(s.id);
    let v = shadowViews.get(s.id);
    if (!v) {
      v = shadowPool[s.kind].pop() || makeShadow(s.kind);
      scene.add(v.root);
      v.root.position.set(s.x, 3, s.z);
      shadowViews.set(s.id, v);
    }
    v.animate(s, dt, time);
  }
  for (const [id, v] of shadowViews) {
    if (!seen.has(id)) {
      scene.remove(v.root);
      shadowPool[v.kind].push(v);
      shadowViews.delete(id);
    }
  }
  trailClock += dt;
  if (trailClock > 0.07) {
    trailClock = 0;
    for (const s of list) {
      const k = C.SHADOW_KINDS[s.kind].scale;
      smoke.emit({ x: s.x + rand(-0.6, 0.6) * k, y: 1.2 * k + rand(0, 1), z: s.z + rand(-0.6, 0.6) * k, vx: -(s.fx || 0) * 1.5, vy: rand(0.2, 0.8), vz: -(s.fz || 0) * 1.5, life: rand(0.8, 1.4), size: 0.9 * k, color: "#0e0820", alpha: 0.55, grow: 1, drag: 0.5 });
    }
  }
  // Большая тень
  const b = run && !run.showcase ? run.boss : null;
  if (b) {
    if (!bossView) {
      bossView = makeShadow("boss");
      scene.add(bossView.root);
    }
    bossView.root.visible = true;
    const near = run.people.filter((p) => !p.frozen && Math.hypot(p.x - b.x, p.z - b.z) <= C.BOSS.reach);
    bossView.animate({ x: b.x, z: b.z, fx: -b.x, fz: -b.z, angry: true }, dt, time, { size: 0.55 + 0.45 * clamp(b.hp / C.BOSS.hp, 0, 1), flash: near.length > 0 && Math.sin(time * 30) > 0 });
    const bp = new T.Vector3(b.x, 6.5, b.z);
    near.forEach((p, i) => beams.set(i, charOf(p).lampWorld, bp));
    beams.hideFrom(near.length);
    if (near.length && Math.random() < dt * 20) {
      sparks.emit({ x: b.x + rand(-2, 2), y: rand(4, 9), z: b.z + rand(-2, 2), vx: rand(-3, 3), vy: rand(1, 4), vz: rand(-3, 3), life: 0.7, size: 0.4, color: "#ffe0a0", k: 3 });
      if (Math.random() < 0.15) Sound.bossHit();
    }
    if (Math.random() < dt * 25) sparks.emit({ x: b.x + rand(-4, 4), y: rand(1, 10), z: b.z + rand(-4, 4), vy: rand(0.5, 2), life: 1.2, size: 0.35, color: "#9a3cff", k: 2 });
  } else {
    if (bossView) bossView.root.visible = false;
    beams.hideFrom(0);
  }
}

const tmpCol = new T.Color();
function drawGlows(dt) {
  glows.begin();
  ground.begin();
  const fade = 1 - dawnK * 0.6;
  const camX = camera.position.x, camZ = camera.position.z;
  // дикие светлячки и их следы
  const showTrails = LEVELS[R.level].trails;
  const alive = new Set();
  if (run) {
    for (const w of run.wild) {
      alive.add(w.id);
      const rec = w.rec;
      const sc = C.fireflyScale(rec);
      const pulse = 0.75 + 0.25 * Math.sin(time * 5 + w.id);
      tmpCol.set(C.kindOf(rec).color).multiplyScalar(pulse * fade);
      const ring = rec.m === "giant" ? 1 : rec.m === "golden" ? 2 : rec.m === "rainbow" ? 3 : 0;
      const born = clamp((run.time - w.born) * 2, 0, 1);
      glows.add(w.x, w.y, w.z, tmpCol, sc * (ring ? 0.95 : 0.6) * born, ring, born);
      const d = Math.hypot(w.x - camX, w.z - camZ);
      if (d < 70) ground.add(w.x, w.z, tmpCol, 2.2 + sc * 2, 0.3 * born);
      if (showTrails) {
        let tr = trails.get(w.id);
        if (!tr) trails.set(w.id, (tr = []));
        const lastP = tr[tr.length - 1];
        if (!lastP || Math.hypot(lastP[0] - w.x, lastP[1] - w.y, lastP[2] - w.z) > 0.12) {
          tr.push([w.x, w.y, w.z]);
          if (tr.length > 16) tr.shift();
        }
        for (let i = 0; i < tr.length - 1; i++) {
          const k = (i + 1) / tr.length;
          glows.add(tr[i][0], tr[i][1], tr[i][2], tmpCol, sc * 0.28 * k, 0, 0.42 * k * born);
        }
      }
    }
    if (showTrails) for (const id of trails.keys()) if (!alive.has(id)) trails.delete(id);
  }
  // светлячки в саду кружат над лужайкой
  const n = gardenFlies.length;
  gardenFlies.forEach(({ rec }, i) => {
    const a = time * 0.45 + (i / Math.max(n, 1)) * TAU;
    const r = 1.8 + (i % 3) * 1.4;
    const x = C.GARDEN.x + Math.cos(a) * r, z = C.GARDEN.z + Math.sin(a) * r, y = 2.4 + (i % 2) * 1 + Math.sin(time * 1.4 + i) * 0.4;
    tmpCol.set(C.kindOf(rec).color).multiplyScalar(fade);
    const ring = rec.m === "giant" ? 1 : rec.m === "golden" ? 2 : rec.m === "rainbow" ? 3 : 0;
    glows.add(x, y, z, tmpCol, C.fireflyScale(rec) * (ring ? 0.8 : 0.5), ring, 1);
    ground.add(x, z, tmpCol, 2.6, 0.25);
  });
  // летящие огоньки: в банку, к костру, в сад, звездопад
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt;
    if (f.t < 0) continue;
    const k = clamp(f.t / f.dur, 0, 1);
    let to = f.to;
    if (to.actor) to = jarPos(to.actor, new T.Vector3());
    else if (to.wild) to = new T.Vector3(to.wild.x, to.wild.y, to.wild.z);
    const e = k * k * (3 - 2 * k);
    const x = lerp(f.from.x, to.x, e), z = lerp(f.from.z, to.z, e), y = lerp(f.from.y, to.y, e) + Math.sin(k * Math.PI) * f.arc;
    glows.add(x, y, z, f.color, f.size * (1 - k * 0.4), f.arc === 0 ? 4 : 0, 1);
    if (Math.random() < 0.6) sparks.emit({ x, y, z, life: 0.4, size: 0.18, color: f.color, k: 2 });
    if (k >= 1) flyers.splice(i, 1);
  }
  // дорожка света для новичка: к ближайшему светлячку или к костру
  if (run && !run.showcase && screen === "play" && (save.quest === 1 || save.quest === 2) && !run.player.frozen) {
    const p = run.player;
    let tgt = null;
    if (save.quest === 2) tgt = { x: 0, z: 0 };
    else {
      let bd = Infinity;
      for (const w of run.wild) {
        const d = Math.hypot(w.x - p.x, w.z - p.z);
        if (d < bd) (bd = d), (tgt = w);
      }
    }
    if (tgt) {
      const dx = tgt.x - p.x, dz = tgt.z - p.z, len = Math.hypot(dx, dz);
      const steps = Math.min(40, Math.floor(len / 1.6));
      for (let i = 1; i < steps; i++) {
        const k = i / steps;
        const glow = 0.5 + 0.5 * Math.sin(k * 20 - time * 6);
        glows.add(p.x + dx * k, 0.45, p.z + dz * k, "#ffd890", 0.28 + glow * 0.12, 0, 0.35 + glow * 0.5);
      }
    }
  }
  // искорки у постаментов
  if (run) {
    for (const p of C.PLACES) {
      if (Math.random() < dt * 3 && !(run.shrineRest[p.id] > 0)) sparks.emit({ x: p.shrineX + rand(-0.8, 0.8), y: 4, z: p.shrineZ + rand(-0.8, 0.8), vy: rand(0.5, 1.5), life: 1.4, size: 0.2, color: C.BUFFS[C.SHRINES[p.id].buff].color, k: 2.5, wob: 1 });
    }
  }
  // неподвижные пятна света: грибы, кристаллы, постаменты, сад, костёр, фонари
  for (const g of world.glows) {
    const d = Math.hypot(g.x - camX, g.z - camZ);
    if (d < 140) ground.add(g.x, g.z, g.color, g.size, g.k * fade);
  }
  for (const g of world.garden.glows) ground.add(g.x, g.z, g.color, g.size, g.k * fade);
  // тёплое марево над костром
  glows.add(0, 2.6, 0, tmpCol.set("#ff8a3a").multiplyScalar(0.22 * (0.4 + lightK()) * (1 - dawnK * 0.7)), 5 + lightK() * 3, 5, 1);
  const fireR = run ? run.radius : 30;
  ground.add(0, 0, "#ff8a3a", fireR * 0.5 + 4, 0.16 * (0.3 + lightK()) * (1 - dawnK));
  for (const a of people()) if (!a.frozen && !run.showcase) ground.add(a.x, a.z, "#ffb860", a.isPlayer ? 7 : 5, 0.22 * fade);
  glows.end();
  ground.end();
}
const lightK = () => (run ? run.light / 100 : 0.6);
const people = () => (run ? run.people : []);

// ---------- Для проверок роботом ----------
window.fonariki = {
  get run() {
    return run;
  },
  save,
  state: () => ({
    screen,
    panel,
    paused,
    phase: run?.phase,
    night: run?.night,
    t: run?.t,
    light: run?.light,
    over: run?.over,
    won: run?.won,
    coins: Math.floor(save.coins),
    quest: save.quest,
    book: S.bookCount(save),
    build: { ...save.build },
    snacks: run?.player.snacks,
    frozen: run?.player.frozen,
    crewFrozen: run?.crew.filter((c) => c.frozen).length,
    boss: !!run?.boss,
    stats: run?.stats,
    level: R.level,
    fps: Math.round(R.perf.fps),
    fpsHistory: R.perf.history.slice(),
    sound: Sound.state,
    adBusy,
  }),
  play: () => play(),
  menu: () => menu(),
  auto: (on = true) => (auto = on),
  speed: (k) => (speedK = k),
  open: (k) => openSheet(k),
  close: () => closeSheet(),
  pause: () => pauseMenu(),
  give: (n) => ((save.coins += n), storeSave()),
  freeze: (who = "fox") => run?.debugFreeze(who),
  night: (n) => {
    if (!run || run.showcase) return;
    run.clearShadows();
    run.startNight(n);
  },
  skip: (sec) => {
    if (run && !run.showcase) run.t += sec;
  },
  quality: (l) => R.setLevel(l, false),
  lookAt: (yaw, pitch, dist) => {
    cam.yaw = yaw;
    if (pitch != null) cam.pitch = pitch;
    if (dist != null) cam.dist = dist;
  },
  teleport: (x, z) => {
    if (run) {
      run.player.x = x;
      run.player.z = z;
    }
  },
  hud: (on) => document.body.classList.toggle("nohud", !on),
  // тень рядом с игроком (для проверки зефира и заморозки)
  shadowNear: (kind = "shadow", dist = 5) => {
    if (!run || run.showcase) return;
    if (run.phase !== "night") run.startNight(Math.max(1, run.night || 1));
    const p = run.player;
    const a = Math.atan2(p.z, p.x);
    const at = { x: p.x + Math.cos(a) * dist, z: p.z + Math.sin(a) * dist };
    // ночь держит своё число теней: лишнюю правила сразу уберут, поэтому переносим одну из живых
    const s = run.shadows.find((q) => q.kind === kind) || run.shadows.find((q) => q.kind !== "imp");
    if (!s) return run.spawnShadow(kind, at);
    Object.assign(s, { x: at.x, z: at.z, goal: { ...at }, target: null, lungeReady: 0, restUntil: 0 });
    return s;
  },
  addLight: (n) => run && !run.showcase && run.addLight(n),
  sky: (d) => (forceDawn = d),
  artCam: (o) => {
    cam.override = o;
    if (!o) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
  },
  finish: (won = true) => {
    if (!run || run.showcase || run.over) return;
    if (won) run.stats.nights = 5;
    run.finish(won);
  },
  store: storeSave,
};

// ---------- Пуск ----------
setText($("load-text"), t("loading"));
setText($("rotate-text"), t("rotate"));
loadFill(1);
menu();
R.resize();
for (const p of [sparks, smoke]) p.setScale(innerHeight, R.ratio);
// первый кадр — до снятия заставки, чтобы шейдеры успели собраться
R.render(0.016, 0);
requestAnimationFrame(frame);
await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]);
$("load").classList.add("gone");
setTimeout(() => $("load").remove(), 700);
for (const [k, a, kind] of startNotes) setTimeout(() => toast(k, a, kind), 900);
