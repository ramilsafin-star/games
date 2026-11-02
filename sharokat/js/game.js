// «Шарокат»: шар катится по радужным горкам в небе. Здесь игровой цикл, физика шара, камера, меню.
import * as T from "../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { Track, trackMesh, railLights, tubeMeshes, HALF } from "./track.js";
import { R, sky, scenery, supports, gates, boostPads, obstacles, gemField, skins, skinMaterial, ballMesh, effects } from "./world.js";
import { themeFor } from "./themes.js";

const LEVELS = 12;
const el = (id) => document.getElementById(id);
const clamp = T.MathUtils.clamp;
const KEY = "sharokat-v1";
// gems — кошелёк кристаллов, owned — купленные шары
let save = { open: 1, stars: [], gems: 0, skin: "rainbow", sound: true, music: true };
try {
  Object.assign(save, JSON.parse(localStorage.getItem(KEY)) || {});
} catch {}
if (!Array.isArray(save.owned)) {
  // Раньше шары открывались сами по сумме кристаллов: открытые тогда остаются подарком
  const old = { rainbow: 0, melon: 60, beach: 150, planet: 280, disco: 450, candy: 650, lava: 900, stars: 1200 };
  save.owned = Object.keys(old).filter((id) => old[id] <= save.gems);
}
if (!save.owned.includes("rainbow")) save.owned.push("rainbow");
if (!save.owned.includes(save.skin)) save.skin = "rainbow";
function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {}
}

// ---------- Сцена ----------
const canvas = el("game");
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  el("nogl").hidden = false;
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.toneMapping = T.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
const scene = new T.Scene();
scene.fog = new T.Fog(0xd8eeff, 120, 520);
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new T.PerspectiveCamera(64, 1, 0.1, 900);
const hemi = new T.HemisphereLight(0xffffff, 0xffd6e6, 1.25);
scene.add(hemi);
// Солнце едет вместе с шаром, чтобы у шара всегда была тень на дорожке
const sun = new T.DirectionalLight(0xfff4dc, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
const heaven = sky(scene);
const fx = effects(scene);
const ball = ballMesh(scene, save.skin);

// ---------- Уровень ----------
let lvl = null,
  world = null;
function disposeWorld() {
  if (!world) return;
  world.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.userData.keep) o.material.dispose?.();
  });
  scene.remove(world);
  world = null;
}
function loadLevel(n) {
  disposeWorld();
  world = new T.Group();
  scene.add(world);
  const track = new Track(n);
  const theme = themeFor(n);
  // Тема уровня: небо, туман, свет, дорожка, острова
  heaven.setTheme(theme);
  scene.fog.color.set(theme.fog);
  hemi.intensity = theme.light[0];
  sun.intensity = theme.light[1];
  sun.color.set(theme.light[2]);
  world.add(trackMesh(track, theme), railLights(track, theme), tubeMeshes(track));
  const view = scenery(world, track, theme);
  supports(world, track, theme);
  lvl = {
    n,
    theme,
    track,
    view,
    gates: gates(world, track),
    chevrons: boostPads(world, track),
    obstacles: obstacles(world, track),
    gems: gemField(world, track),
    total: track.gems.length,
  };
  resetBall(0);
  el("level-name").textContent = "Уровень " + (n + 1) + " · " + theme.name;
}
// ---------- Шар ----------
const b = { s: 0, u: 0, uTarget: 0, v: 0, h: 0, vh: 0, knock: 0, boost: 0, checkpoint: 0, gems: 0, state: "menu", fallT: 0, grace: 0 };
const F = {},
  F2 = {},
  pos = new T.Vector3(),
  vel = new T.Vector3();
let hitCooldown = new Map();
// Крейсерская скорость: 15 м/с на первом уровне, до 21 на последних
function cruise() {
  return Math.min(15 + lvl.n * 0.5, 21);
}
function resetBall(s) {
  Object.assign(b, { s, u: 0, uTarget: 0, v: s ? cruise() * 0.7 : 0, h: 0, vh: 0, knock: 0, boost: 0, fallT: 0, grace: 0.8 });
  if (!s) {
    b.checkpoint = 0;
    b.gems = 0;
  }
  ballPosition();
  snapCamera = true;
}
function ballPosition() {
  lvl.track.at(b.s, F);
  pos.copy(F.p).addScaledVector(F.r, b.u).addScaledVector(F.u, R + b.h);
  ball.position.copy(pos);
}
function startFall() {
  b.state = "fall";
  b.fallT = 0;
  vel.copy(F.f).multiplyScalar(b.v).addScaledVector(F.r, Math.sign(b.u) * 5).addScaledVector(F.u, 2);
  Sound.fall();
}
function respawn() {
  resetBall(lvl.track.checkpoints.filter((c) => c <= b.checkpoint).pop() + 3);
  b.state = "play";
  Sound.poof();
  fx.burst(ball.position, 22, 6, 0.8, 1);
}
function collect(g) {
  g.taken = true;
  b.gems++;
  Sound.gem();
  fx.burst(g.pos, 8, 4, 0.5, 1.5);
  el("gems").textContent = b.gems;
}
function step(dt) {
  const tr = lvl.track;
  const before = b.s;
  tr.at(b.s, F);
  // Скорость: держится у крейсерской, на спусках разгон, на подъёмах и в петлях замедление
  const goal = b.boost > 0 ? 28 : cruise();
  b.v += ((goal - b.v) * (b.boost > 0 ? 3 : 1.1) - 15 * F.f.y * 0.75) * dt;
  b.v = clamp(b.v, 8, 32);
  b.boost -= dt;
  b.grace -= dt;
  b.s += b.v * dt;
  // Руль: шар тянется к месту под пальцем, удар от препятствия сбивает его в сторону
  b.u += (b.uTarget - b.u) * Math.min(1, dt * 12) + b.knock * dt;
  b.uTarget += b.knock * dt * 0.8;
  b.knock *= Math.exp(-dt * 4);
  tr.at(b.s, F);
  const lim = F.half - R * 0.85;
  if (F.air || F.rails || F.tube) {
    // Бортики (и невидимые в полёте) держат шар на дорожке
    if (Math.abs(b.u) > lim) {
      b.u = Math.sign(b.u) * lim;
      b.knock *= -0.35;
    }
    b.uTarget = clamp(b.uTarget, -lim - 0.4, lim + 0.4);
  } else if (Math.abs(b.u) > F.half + 0.15) return startFall();
  else b.uTarget = clamp(b.uTarget, -F.half - 1.2, F.half + 1.2);
  // Подскок после удара
  if (b.h > 0 || b.vh > 0) {
    b.vh -= 26 * dt;
    b.h += b.vh * dt;
    if (b.h <= 0) {
      if (b.vh < -4) Sound.land();
      b.h = 0;
      b.vh = 0;
    }
  }
  // Влетел в прыжок / приземлился
  if (F.air && !b.flying) {
    b.flying = true;
    Sound.whee();
  } else if (!F.air && b.flying) {
    b.flying = false;
    Sound.land();
    fx.burst(ball.position, 10, 4, 0.5, 0.5);
    shake = 0.25;
  }
  ballPosition();
  // Качение: поворот вокруг оси «вправо» на пройденный путь
  ball.rotateOnWorldAxis(F.r, -(b.v * dt) / R);
  ball.rotateOnWorldAxis(F.f, ((b.uTarget - b.u) * dt * 3) / R);
  // Кристаллы рядом
  for (const g of tr.gems) if (!g.taken && Math.abs(g.s - b.s) < 3 && g.pos.distanceToSquared(pos) < 1.1) collect(g);
  // Ускорители
  for (const p of tr.boosts)
    if (before < p.s + 2 && b.s >= p.s + 2) {
      b.boost = 1.7;
      Sound.boost();
      fovKick = 1;
      if (!calm.matches) el("speed").classList.add("on");
      setTimeout(() => el("speed").classList.remove("on"), 1400);
    }
  // Чекпойнты
  for (const c of tr.checkpoints)
    if (c > 0 && before < c && b.s >= c) {
      b.checkpoint = c;
      Sound.checkpoint();
      fx.burst(pos.clone().addScaledVector(F.u, 2.5), 26, 7, 0.9, 2);
      flash("Чекпойнт!");
    }
  // Препятствия
  const t = clock;
  for (const o of lvl.obstacles) {
    const a = b.s - o.s;
    if (Math.abs(a) > 4 || b.grace > 0 || (hitCooldown.get(o) || 0) > t) continue;
    const hit = o.hit(a, b.u, R + b.h, t);
    if (!hit) continue;
    hitCooldown.set(o, t + 0.45);
    b.knock = hit.push;
    b.v *= hit.slow;
    b.vh = Math.max(b.vh, hit.hop);
    shake = hit.boing ? 0.2 : 0.45;
    if (hit.boing) Sound.boing();
    else Sound.bump();
    fx.burst(pos, 10, 5, 0.5, 1);
  }
  // Финиш
  if (b.s >= tr.finishAt) finishLevel();
}

// ---------- Камера ----------
// «Уменьшить движение» в настройках: без тряски, рывков обзора и полос скорости
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let snapCamera = true,
  shake = 0,
  fovKick = 0,
  clock = 0;
const camPos = new T.Vector3(),
  camUp = new T.Vector3(0, 1, 0),
  look = new T.Vector3();
function aim(dt) {
  const tall = camera.aspect < 1;
  const back = tall ? 9.4 : 8,
    high = tall ? 4.4 : 3.4;
  const tr = lvl.track;
  if (b.state === "menu") {
    // В меню камера медленно облетает шар на старте
    const a = clock * 0.25;
    tr.at(6, F);
    const p = F.p.clone().addScaledVector(F.u, R);
    camera.position.copy(p).add(new T.Vector3(Math.sin(a) * 9, 4 + Math.sin(a * 0.7), Math.cos(a) * 9));
    camera.up.set(0, 1, 0);
    camera.lookAt(p);
    return;
  }
  if (b.state === "fall") {
    camera.lookAt(ball.position);
    return;
  }
  tr.at(Math.max(0, b.s - back), F2);
  const want = F2.p.clone().addScaledVector(F2.u, high).addScaledVector(F2.r, b.u * 0.45);
  tr.at(b.s + 9, F);
  const lookWant = ball.position.clone().lerp(F.p.clone().addScaledVector(F.u, R), 0.35);
  const k = snapCamera ? 1 : 1 - Math.exp(-dt * 7);
  camPos.lerp(want, k);
  look.lerp(lookWant, snapCamera ? 1 : 1 - Math.exp(-dt * 10));
  camUp.lerp(F2.u, snapCamera ? 1 : 1 - Math.exp(-dt * 5)).normalize();
  snapCamera = false;
  camera.position.copy(camPos);
  if (calm.matches) shake = 0;
  if (shake > 0) {
    camera.position.add(new T.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    shake = Math.max(0, shake - dt * 1.6);
  }
  camera.up.copy(camUp);
  camera.lookAt(look);
  // Чем быстрее шар, тем шире обзор: так скорость чувствуется сильнее
  const base = (tall ? 76 : 64) + clamp((b.v - 15) / 13, 0, 1) * 6;
  fovKick = Math.max(0, fovKick - dt * 0.6);
  const fov = calm.matches ? base : base + (b.boost > 0 ? 9 : 0) * Math.min(1, b.boost * 2) + fovKick * 3;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
  }
}
// ---------- Финиш ----------
let finishT = -1;
function finishLevel() {
  b.state = "finish";
  finishT = 0;
  Sound.fanfare();
  Music.duck(3);
  const share = lvl.total ? b.gems / lvl.total : 1;
  const stars = share >= 0.85 ? 3 : share >= 0.55 ? 2 : 1;
  save.stars[lvl.n] = Math.max(save.stars[lvl.n] || 0, stars);
  save.gems += b.gems;
  save.open = Math.max(save.open, Math.min(LEVELS, lvl.n + 2));
  store();
  // Хватает ли теперь кристаллов на новый шар
  const fresh = skins.filter((s) => !save.owned.includes(s.id) && s.cost <= save.gems);
  setTimeout(() => {
    el("result-stars").innerHTML = [1, 2, 3].map((k) => '<span class="' + (k <= stars ? "on" : "") + '">★</span>').join("");
    el("result-gems").textContent = "+" + b.gems;
    el("next").hidden = lvl.n + 1 >= LEVELS;
    el("unlocked").hidden = !fresh.length;
    if (fresh.length) el("unlocked").textContent = "Хватает на новый шар: " + fresh[0].name + "!";
    el("wallet-finish").textContent = save.gems;
    show("finish");
  }, 1600);
}
// ---------- Цикл ----------
let last = 0;
function frame(ms) {
  const dt = last ? clamp((ms - last) / 1000, 0, 1 / 20) : 0;
  last = ms;
  clock += dt;
  if (lvl) {
    if (b.state === "play") {
      // Три шага на кадр: на большой скорости столкновения не проскакивают
      for (let k = 0; k < 3 && b.state === "play"; k++) step(dt / 3);
    } else if (b.state === "fall") {
      vel.y -= 22 * dt;
      ball.position.addScaledVector(vel, dt);
      b.fallT += dt;
      if (b.fallT > 1.25) respawn();
    } else if (b.state === "finish") {
      // После финиша шар катится дальше и останавливается, вокруг салют
      finishT += dt;
      b.v = Math.max(0, b.v - dt * 6);
      b.s = Math.min(b.s + b.v * dt, lvl.track.length - 3);
      ballPosition();
      ball.rotateOnWorldAxis(F.r, -(b.v * dt) / R);
      if (finishT < 3.2 && Math.floor(finishT / 0.45) !== Math.floor((finishT - dt) / 0.45)) {
        lvl.track.at(lvl.track.finishAt + 12, F2);
        const burst = F2.p.clone().addScaledVector(F2.u, 9 + Math.random() * 6).addScaledVector(F2.r, (Math.random() - 0.5) * 14);
        fx.burst(burst, 40, 9, 1.2, 0);
        Sound.firework();
      }
    }
    for (const o of lvl.obstacles) o.update(clock);
    lvl.gems.update(clock, b.s);
    lvl.chevrons.offset.y -= dt * 1.8;
    Sound.roll(b.state === "play" ? b.v : 0, b.state === "play" && !b.flying);
    aim(dt);
    heaven.follow(camera.position);
    sun.position.copy(ball.position).add(new T.Vector3(-14, 30, 10));
    sun.target.position.copy(ball.position);
    fx.update(dt, ball.position, b.state === "play" || b.state === "finish", trailTint());
    // Полоска прогресса
    const share = clamp(b.s / lvl.track.finishAt, 0, 1);
    el("progress-fill").style.width = share * 100 + "%";
    el("progress-ball").style.left = share * 100 + "%";
  }
  renderer.render(scene, camera);
}
function trailTint() {
  return { rainbow: "#ffd1f0", melon: "#c8ffc4", beach: "#fff2a6", planet: "#a8d8ff", disco: "#ffffff", candy: "#ffc2dc", lava: "#ffb35c", stars: "#fff07a" }[save.skin];
}
function resize() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

// ---------- Управление ----------
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary) return;
  unlock();
  drag = { id: e.pointerId, x: e.clientX };
  canvas.setPointerCapture(e.pointerId);
  if (b.state === "ready") go();
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  // Провёл пальцем на всю ширину экрана — шар переехал примерно на две ширины дорожки
  const dx = e.clientX - drag.x;
  drag.x = e.clientX;
  if (b.state === "play") b.uTarget += (dx / canvas.clientWidth) * HALF * 4.2;
});
const endDrag = (e) => {
  if (drag && drag.id === e.pointerId) drag = null;
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
const keys = new Set();
addEventListener("keydown", (e) => {
  keys.add(e.key);
  if ((e.key === " " || e.key === "Enter") && b.state === "ready") go();
  if (e.key === "Escape" && b.state !== "menu") toMenu();
});
addEventListener("keyup", (e) => keys.delete(e.key));
setInterval(() => {
  if (b.state !== "play") return;
  const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("ф"),
    right = keys.has("ArrowRight") || keys.has("d") || keys.has("в");
  b.uTarget += ((right ? 1 : 0) - (left ? 1 : 0)) * 0.16;
}, 16);

// ---------- Экраны ----------
function show(name) {
  for (const id of ["menu", "hud", "finish", "ready"]) el(id).hidden = true;
  if (name === "menu") el("menu").hidden = false;
  if (name === "ready" || name === "play") el("hud").hidden = false;
  if (name === "ready") el("ready").hidden = false;
  if (name === "finish") el("finish").hidden = false;
}
function flash(text) {
  const n = el("flash");
  n.textContent = text;
  n.classList.remove("on");
  void n.offsetWidth;
  n.classList.add("on");
}
function startLevel(n) {
  unlock();
  loadLevel(n);
  b.state = "ready";
  el("gems").textContent = "0";
  show("ready");
}
function go() {
  b.state = "play";
  b.v = cruise() * 0.6;
  el("ready").hidden = true;
  Sound.tick();
}
function toMenu() {
  b.state = "menu";
  if (!lvl || lvl.n !== Math.min(save.open, LEVELS) - 1) loadLevel(Math.min(save.open, LEVELS) - 1);
  b.state = "menu";
  menu();
  show("menu");
}
function menu() {
  el("total").textContent = save.gems;
  // Плитка уровня раскрашена под его тему
  el("levels").innerHTML = Array.from({ length: LEVELS }, (_, i) => {
    const open = i < save.open,
      stars = save.stars[i] || 0,
      theme = themeFor(i);
    return (
      '<button class="lvl' + (open ? "" : " locked") + '" data-level="' + i + '"' + (open ? "" : " disabled") +
      ' style="--theme:' + theme.ui + '" aria-label="Уровень ' + (i + 1) + ", " + theme.name + '">' +
      "<b>" + (open ? i + 1 : "🔒") + "</b><small>" + (open ? "★".repeat(stars) + "☆".repeat(3 - stars) : "") + "</small></button>"
    );
  }).join("");
  el("shop-ball").className = "ball-" + save.skin;
  const affordable = skins.some((s) => !save.owned.includes(s.id) && s.cost <= save.gems);
  el("shop-open").classList.toggle("ping", affordable);
}
// ---------- Магазин шаров ----------
function shop() {
  el("wallet-shop").textContent = save.gems;
  el("skins").innerHTML = skins
    .map((s) => {
      const own = save.owned.includes(s.id),
        can = save.gems >= s.cost;
      return (
        '<button class="skin' + (s.id === save.skin ? " on" : "") + (own ? "" : can ? " can" : " locked") + '" data-skin="' + s.id + '" aria-label="' + s.name + (own ? "" : ", " + s.cost + " кристаллов") + '">' +
        '<i class="ball-' + s.id + '"></i><small>' + (own ? s.name : "💎 " + s.cost) + "</small></button>"
      );
    })
    .join("");
}
el("shop-open").onclick = () => {
  unlock();
  Sound.tick();
  shop();
  el("shop").hidden = false;
};
el("shop-close").onclick = () => {
  el("shop").hidden = true;
  menu();
};
el("skins").onclick = (e) => {
  const btn = e.target.closest("[data-skin]");
  if (!btn) return;
  const skin = skins.find((s) => s.id === btn.dataset.skin);
  Sound.unlock();
  if (!save.owned.includes(skin.id)) {
    if (save.gems < skin.cost) {
      // Не хватает: шар вздрагивает и показывает, сколько ещё собрать
      btn.classList.remove("shake");
      void btn.offsetWidth;
      btn.classList.add("shake");
      el("shop-note").textContent = "Нужно ещё 💎 " + (skin.cost - save.gems);
      Sound.bump();
      return;
    }
    save.gems -= skin.cost;
    save.owned.push(skin.id);
    el("shop-note").textContent = "Новый шар: " + skin.name + "!";
    Sound.checkpoint();
  } else Sound.tick();
  save.skin = skin.id;
  store();
  ball.material = skinMaterial(save.skin);
  shop();
};
el("play").onclick = () => startLevel(Math.min(save.open, LEVELS) - 1);
el("home").onclick = toMenu;
el("again").onclick = () => startLevel(lvl.n);
el("next").onclick = () => startLevel(Math.min(lvl.n + 1, LEVELS - 1));
el("to-menu").onclick = toMenu;

// ---------- Звук ----------
function unlock() {
  if (!save.sound) return;
  Sound.unlock();
  if (save.music) Music.start();
}
function soundButtons() {
  Sound.setOn(save.sound);
  Music.on = save.music;
  el("sound").classList.toggle("off", !save.sound);
  el("music").classList.toggle("off", !save.music);
  el("sound").setAttribute("aria-label", save.sound ? "Выключить звук" : "Включить звук");
  el("music").setAttribute("aria-label", save.music ? "Выключить музыку" : "Включить музыку");
}
el("sound").onclick = () => {
  save.sound = !save.sound;
  store();
  soundButtons();
  if (save.sound) unlock();
  else Music.stop();
};
el("music").onclick = () => {
  save.music = !save.music;
  store();
  soundButtons();
  if (save.music) unlock();
  else Music.stop();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) Music.stop();
  else if (save.sound && save.music && Sound.ctx) Music.start();
});

// ---------- Запуск ----------
soundButtons();
resize();
loadLevel(Math.min(save.open, LEVELS) - 1);
toMenu();
renderer.setAnimationLoop(frame);
// Для проверок: адрес с ?debug открывает состояние из консоли
if (new URLSearchParams(location.search).has("debug"))
  Object.assign(window, { b, lvl: () => lvl, startLevel, go, camera, scene });
