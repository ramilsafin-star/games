// «Линия спасения»: экраны, ввод, игровой цикл, сохранение и связь с VK.
import { LEVELS, CHAPTERS, PER_CHAPTER, ATTRACT, dailyLevel } from "./levels.js?v=80a70cba";
import { useMatter, createSim, DT, play } from "./sim.js?v=80a70cba";
import { Pen, starsFor, W, H, flyHit } from "./world.js?v=80a70cba";
import { View, THEMES } from "./view.js?v=80a70cba";
import { Sound } from "./sound.js?v=80a70cba";
import { FOLK, critter } from "./art.js?v=80a70cba";
import * as R from "./rules.js?v=80a70cba";

useMatter(window.Matter);
const host = window.vkGameHost;
// В VK облачное сохранение должно успеть попасть в localStorage до чтения
await host?.ready;

const $ = (id) => document.getElementById(id);
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // игра работает и без сохранения
  }
}
let save = R.decode(read(R.SAVE_KEY), LEVELS.length);
const persist = () => write(R.SAVE_KEY, R.encode(save));
Sound.set(!save.mute);
const CTX = { per: PER_CHAPTER, chapters: CHAPTERS.length }; // для наград
const fails = {}; // сколько раз подряд не вышло на уровне (в этой игре) — для умной подсказки

const view = new View($("stage"));
// Качество графики: «Авто» — высокое, но на слабом устройстве (или если кадры проседают) — низкое
const weakDevice = (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
let autoLow = !!weakDevice;
const QUALITY_NAMES = ["Авто", "Высокое", "Низкое"];
function applyQuality() {
  view.setQuality(save.quality === 1 || (save.quality === 0 && !autoLow));
  layout();
}
// Линия и шапка из Мастерской
function applyLook() {
  view.inkStyle = R.INKS[save.ink];
  view.hat = R.HATS[save.hat].id;
}
applyLook();
const game = {
  mode: "load",
  chapter: 0,
  L: null,
  sim: null,
  pen: null,
  lines: [],
  taken: [],
  strokes: 0,
  hint: false,
  paused: false,
  ended: false,
  resultAt: 0,
  wonAt: 0,
  open: 0,
  dt: 0,
  demo: false,
  attractAt: 0,
  levelTime: 0,
};
let adBusy = false;

// ---------- Раскладка ----------
function safeInsets() {
  const probe = $("safe-probe") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "safe-probe" }));
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  const cs = getComputedStyle(probe);
  const v = (x) => Math.max(8, parseFloat(x) || 0);
  return { t: v(cs.paddingTop), r: v(cs.paddingRight), b: v(cs.paddingBottom), l: v(cs.paddingLeft) };
}
function layout() {
  const w = innerWidth,
    h = innerHeight;
  view.resize(w, h, safeInsets());
  document.body.classList.toggle("side", view.mode === "side");
  document.body.classList.toggle("top", view.mode === "top");
  const st = document.documentElement.style;
  st.setProperty("--wx", view.ox + "px");
  st.setProperty("--wy", view.oy + "px");
  st.setProperty("--ww", W * view.s + "px");
  st.setProperty("--wh", H * view.s + "px");
  st.setProperty("--wr", w - view.ox - W * view.s + "px");
  st.setProperty("--wb", h - view.oy - H * view.s + "px");
}
addEventListener("resize", layout);
layout();
if (autoLow || save.quality === 2) applyQuality();

// ---------- Экраны ----------
function screen(name) {
  game.mode = name;
  document.body.dataset.screen = name;
  $("menu").hidden = name !== "menu";
  $("map").hidden = name !== "map";
  $("hud").hidden = name !== "level";
  hideSheet();
}

function showMenu() {
  screen("menu");
  Sound.music(0, true);
  startAttract();
  paintMenu();
}
function paintMenu() {
  const total = R.totalStars(save),
    done = R.solved(save);
  $("play").innerHTML = done ? `Продолжить<small>уровень ${LEVELS[R.nextLevel(save)].id}</small>` : "Играть";
  $("menu-stat").innerHTML = done
    ? `Пройдено ${done} из ${LEVELS.length} · ★ ${total} · <span class="fly-ico"></span>${save.wallet}`
    : "Рисуй пальцем или мышью";
  const key = R.dayKey();
  const streak = R.streakNow(save, key);
  $("daily-sub").textContent = R.dailyDone(save, key) ? "решена ✓" : streak ? `серия ${streak}` : "+" + R.DAILY_REWARD;
  $("daily").classList.toggle("done", R.dailyDone(save, key));
  $("shop-sub").innerHTML = `<span class="fly-ico"></span>${save.wallet}`;
  const ach = R.ACHIEVEMENTS.filter((_, i) => save.ach & (1 << i)).length;
  $("awards-sub").textContent = `${ach} из ${R.ACHIEVEMENTS.length}`;
}

// Заставка в меню: первый уровень решается сам, по кругу
function startAttract() {
  const L = ATTRACT;
  game.chapter = 0;
  game.L = L;
  game.sim = createSim(L);
  game.pen = null;
  game.hint = false;
  game.demo = false;
  game.ended = false;
  game.fly = null;
  game.hint = false;
  const line = L.sol[0].map(([x, y]) => [x, y]);
  game.attractLine = line;
  game.attractAt = performance.now();
  game.attractDrawn = 0;
}
function attractTick(now) {
  const sim = game.sim;
  const since = (now - game.attractAt) / 1000;
  if (sim.state === "draw") {
    // «рука» рисует купол
    const line = game.attractLine;
    const k = Math.min(1, Math.max(0, (since - 0.6) / 1.1));
    const n = Math.max(1, Math.round(k * (line.length - 1)));
    game.pen = { pts: line.slice(0, n + 1), stop: "" };
    if (k >= 1) {
      game.pen = null;
      sim.addStroke(line);
      sim.start();
    }
  } else if (sim.state !== "run" && sim.t - sim.endT > 2.2) startAttract();
}

function showMap(ch = game.chapter) {
  screen("map");
  game.chapter = ch;
  game.L = null;
  game.sim = null;
  Sound.music(ch, true);
  const tabs = $("chapters");
  tabs.innerHTML = CHAPTERS.map((c, i) => {
    const open = R.isOpen(save, i * PER_CHAPTER);
    return `<button role="tab" data-ch="${i}" aria-selected="${i === ch}" class="${open ? "" : "locked"}" aria-label="${i + 1}. ${c.name}">${open ? "" : lockIcon(14)}${i + 1}<span class="nm">. ${c.short}</span></button>`;
  }).join("");
  $("chapter-name").textContent = CHAPTERS[ch].name;
  $("map-stars").innerHTML = `★ ${R.totalStars(save)} · <span class="fly-ico"></span>${R.flies(save)}`;
  const now = R.nextLevel(save);
  let html = "";
  for (let n = 0; n < PER_CHAPTER; n++) {
    const i = ch * PER_CHAPTER + n,
      L = LEVELS[i];
    if (!L) break;
    const st = save.stars[i];
    const open = R.isOpen(save, i);
    const cls = ["lv", st ? "done" : "", i === now && open ? "now" : ""].join(" ");
    html += open
      ? `<button class="${cls}" data-lv="${i}" aria-label="Уровень ${L.id}${st ? ", звёзд: " + st : ""}${save.fly[i] ? ", светлячок пойман" : ""}">${typeIcon(L.type)}<i class="fl ${save.fly[i] ? "on" : ""}"></i><b>${n + 1}</b><span class="st">${[0, 1, 2].map((k) => `<i class="${k < st ? "on" : ""}"></i>`).join("")}</span></button>`
      : `<button class="lv" disabled aria-label="Уровень ${L.id} закрыт">${lockIcon(26)}</button>`;
  }
  $("grid").innerHTML = html;
  tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
}
const lockIcon = (s) => `<svg class="lock" style="width:${s}px;height:${s}px" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
function typeIcon(type) {
  if (type === "shield") return '<svg class="ty" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18a9 9 0 0 1 18 0"/></svg>';
  if (type === "home") return '<svg class="ty" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/></svg>';
  return '<svg class="ty" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l18 10"/><circle cx="7" cy="4" r="2"/></svg>';
}

// ---------- Уровень ----------
function startLevel(i, opts = {}) {
  const L = opts.daily ? opts.daily : LEVELS[i];
  if (!L) return showMenu();
  // название главы показываем при входе в главу (из меню, с карты или с прошлой главы)
  const newChapter = game.mode !== "level" || game.L?.chapter !== L.chapter;
  screen("level");
  Object.assign(game, {
    L,
    chapter: L.chapter,
    sim: createSim(L),
    pen: null,
    lines: [],
    taken: [],
    strokes: L.strokes,
    hint: !!opts.hint,
    paused: false,
    ended: false,
    resultAt: 0,
    wonAt: 0,
    open: 0,
    demo: !!L.demo && !save.stars[i] && !opts.hint && !L.daily,
    levelTime: 0,
    pending: false,
    fly: L.fly && !L.daily ? { x: L.fly[0], y: L.fly[1], state: save.fly[i] ? "old" : "free" } : null,
    flyGot: false,
  });
  if (!L.daily) {
    save.last = i;
    persist();
  }
  Sound.music(L.chapter, true);
  $("lvl").textContent = L.daily ? "День" : L.id;
  $("lvl").classList.toggle("daily", !!L.daily);
  $("hint").hidden = !!L.daily;
  $("hint").classList.toggle("nudge", !L.daily && (fails[i] || 0) >= 2 && !game.hint);
  $("flyhud").hidden = !game.fly;
  $("flyhud").className = "flyhud" + (game.fly?.state === "old" ? " old" : "");
  $("timer").hidden = true;
  $("go").hidden = true;
  setTask(taskText(L));
  updateHud();
  if (L.daily && !opts.retry) banner(`<small>ЗАДАЧА ДНЯ</small>Уровень ${LEVELS[L.of].id} в зеркале`);
  else if (newChapter && !opts.retry && !opts.hint) banner(`<small>ГЛАВА ${L.chapter + 1}</small>${CHAPTERS[L.chapter].name}`);
}
// Тот же уровень заново (обычный или задача дня)
function restart(opts = {}) {
  const L = game.L;
  if (!L) return;
  if (L.daily) startLevel(0, { ...opts, retry: true, daily: L });
  else startLevel(L.index, { retry: true, hint: game.hint, ...opts });
}
function taskText(L) {
  if (L.daily) return "Задача дня: знакомый уровень, только наоборот. Чернил — как обычно";
  if (L.tip) return L.tip;
  const names = [FOLK[0].name, ...L.friends.map((f) => FOLK[f[2] ?? 1].name)];
  if (L.type === "shield" && L.ghosts) return `Защити ${names.length > 1 ? "всех" : "Тошу"} от привидений — продержись ${L.time} с`;
  if (L.type === "shield") return `Защити ${names.length > 1 ? "всех" : "Тошу"} — продержись ${L.time} с`;
  if (L.type === "home") return "Проведи каждого к домику его цвета";
  if (L.target.k === "berry") return "Помоги ягоде попасть к Тоше";
  if (L.target.k === "star") return "Доставь звёздочку-ключ на замок клетки";
  return "Помоги Тоше докатиться до домика";
}
function setTask(text) {
  const el = $("task");
  el.textContent = text;
  el.classList.remove("fade");
  el.hidden = !text;
}
let bannerTimer = 0;
function banner(html) {
  const el = $("banner");
  el.innerHTML = html;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove("show"), 2500);
}
let toastTimer = 0;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

function inkUsedNow() {
  return game.sim.inkUsed + (game.pen?.len || 0);
}
function updateHud() {
  const L = game.L,
    sim = game.sim;
  if (!L || !sim) return;
  const left = Math.max(0, 1 - inkUsedNow() / L.plan.limit);
  const fill = $("ink-fill");
  const side = view.mode === "side";
  fill.style.height = side ? left * 100 + "%" : "";
  fill.style.width = side ? "" : left * 100 + "%";
  const m3 = 1 - L.plan.s3 / L.plan.limit,
    m2 = 1 - L.plan.s2 / L.plan.limit;
  for (const [id, m] of [
    ["ink-3", m3],
    ["ink-2", m2],
  ]) {
    const b = $(id);
    b.style.bottom = side ? m * 100 + "%" : "";
    b.style.left = side ? "" : m * 100 + "%";
    b.hidden = m <= 0.01;
  }
  $("ink").classList.toggle("low", left < 0.15);
  const total = L.type === "home" ? L.walkers.length : L.strokes;
  const used = L.type === "home" ? sim.walkers.filter((w) => w.path).length : total - game.strokes;
  $("dots").innerHTML = total > 1 ? Array.from({ length: total }, (_, i) => `<i class="${i < used ? "used" : ""}"></i>`).join("") : "";
  const n = R.hintsLeft(save);
  const free = L.daily ? 0 : save.hinted[L.index];
  $("hint-n").textContent = free ? "✓" : n;
  $("hint").classList.toggle("free", !!free);
  $("hint").classList.toggle("on", game.hint);
}

// ---------- Рисование ----------
const stage = $("stage");
let lastMove = null;
function worldPoint(e) {
  const r = stage.getBoundingClientRect();
  return view.toWorld(e.clientX - r.left, e.clientY - r.top);
}
function canDraw() {
  const { sim, L } = game;
  if (game.mode !== "level" || game.paused || adBusy || !sim || sim.state !== "draw" || !$("sheet").hidden) return false;
  if (L.type === "home") return sim.walkers.some((w) => !w.path);
  return game.strokes > 0 && sim.inkLeft > 4;
}
stage.addEventListener("pointerdown", (e) => {
  if (!canDraw() || game.pen) return;
  const p = worldPoint(e);
  const pen = new Pen(game.L, game.lines, game.sim.inkLeft);
  game.demo = false;
  if (game.L.type === "home") {
    if (!pen.begin(p, game.taken)) {
      toast("Начни линию от жителя");
      return;
    }
  } else if (!pen.begin(p)) game.pending = true;
  game.pen = pen;
  game.pointer = e.pointerId;
  stage.setPointerCapture?.(e.pointerId);
  lastMove = { p, t: performance.now() };
  $("task").classList.add("fade");
});
stage.addEventListener("pointermove", (e) => {
  const pen = game.pen;
  if (!pen || e.pointerId !== game.pointer || adBusy) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events.length ? events : [e]) {
    const p = worldPoint(ev);
    if (game.pending) {
      if (pen.begin(p)) game.pending = false;
      continue;
    }
    const was = pen.stop;
    pen.move(p);
    if (!was && pen.stop === "wall") (Sound.blocked(), view.shake(0.15));
    if (!was && pen.stop === "ink") toast("Чернила кончились");
  }
  const now = performance.now();
  const p = worldPoint(e);
  if (lastMove) {
    const sp = Math.hypot(p[0] - lastMove.p[0], p[1] - lastMove.p[1]) / Math.max(1, now - lastMove.t);
    Sound.scratch(pen.stop ? 0 : sp * 400);
  }
  lastMove = { p, t: now };
  // искры с кончика пера (в высоком качестве — гуще)
  if (pen.pts.length && !pen.stop && Math.random() < (view.hq ? 0.95 : 0.4)) {
    const tip = pen.pts[pen.pts.length - 1];
    view.burst("ink", tip[0], tip[1]);
    if (view.hq) view.burst("ink", tip[0], tip[1]);
  }
  updateHud();
});
function penUp(e) {
  const pen = game.pen;
  if (!pen || (e && e.pointerId !== game.pointer)) return;
  game.pen = null;
  game.pending = false;
  Sound.scratch(0);
  if (!pen.pts.length) return;
  const res = pen.finish();
  const { sim, L } = game;
  if (!res.ok) {
    if (L.type === "home") toast(res.why === "wall" ? "Сквозь препятствия ходить нельзя" : "Веди до домика того же цвета");
    else toast("Линия слишком короткая");
    Sound.short();
    updateHud();
    return;
  }
  Sound.penUp();
  // светлячок: линия прошла через него — он летит в баночку (засчитается, если уровень пройден)
  if (game.fly?.state === "free" && flyHit(L, res.pts)) {
    game.fly.state = "got";
    game.flyGot = true;
    view.burst("flyget", game.fly.x, game.fly.y);
    Sound.fly();
    $("flyhud").className = "flyhud on";
  }
  if (L.type === "home") {
    sim.addPath(res.walker, res.pts, res.len);
    game.taken.push(res.walker);
    if (sim.ready) launch();
  } else {
    sim.addStroke(res.pts, res.len);
    game.lines.push(res.pts);
    game.strokes--;
    if (game.strokes <= 0 || sim.inkLeft < 12) launch();
    else $("go").hidden = false;
  }
  updateHud();
}
stage.addEventListener("pointerup", penUp);
stage.addEventListener("pointercancel", penUp);
stage.addEventListener("lostpointercapture", penUp);

function launch() {
  const sim = game.sim;
  if (sim.state !== "draw") return;
  sim.start();
  Sound.go();
  $("go").hidden = true;
  $("task").classList.add("fade");
  if (game.L.type === "shield") $("timer").hidden = false;
}
$("go").onclick = () => {
  if (adBusy) return;
  Sound.unlock();
  launch();
};

// ---------- Конец уровня ----------
const WIN_TEXT = {
  safe: (L) => (L.friends.length ? "Все целы!" : "Тоша спасён!"),
  eat: () => "Ням!",
  key: () => "Клетка открыта!",
  home: (L) => (L.type === "home" ? "Все дома!" : "Тоша дома!"),
};
const LOSE_TEXT = {
  bug: "Жук ужалил!",
  wet: "Тоша промок!",
  lava: "Горячо!",
  rock: "Камень попал!",
  ball: "Ядро попало!",
  icicle: "Сосулька упала!",
  spike: "Колючий шар!",
  spikes: "Ой, шипы!",
  water: "Плюх в воду!",
  fall: "Упал!",
  lost: "Укатилось!",
  sunk: "Утонуло!",
  stuck: "Застряло!",
  time: "Не успели",
  crash: "Столкнулись!",
  caught: "Попались жуку!",
  ghost: "Бу! Привидение!",
  wisp: "Огонёк догнал!",
  hurt: "Ой!",
  timeout: "Не успели",
};
const LOSE_TIP = {
  bug: "Жуки летят прямо к цели. Закрой Тошу со всех сторон, откуда они прилетят.",
  wet: "Капли скатываются по линии — пусть стекают мимо.",
  lava: "Капли скатываются по линии — пусть стекают мимо.",
  fall: "Линия падает и толкает. Рисуй так, чтобы она не сбросила Тошу.",
  lost: "Линия падает, как настоящая. Обопри её на землю или колышки.",
  stuck: "Нужен уклон, чтобы катилось дальше.",
  crash: "Все идут одновременно и с одной скоростью. Пусти кого-то в обход.",
  caught: "Следи за дозорным: обходи его или пропусти вперёд.",
  ghost: "Привидения летят сквозь землю и камни, но не сквозь линию. Закрой Тошу с той стороны, откуда они летят.",
  wisp: "Огонёк сжигает линию, которой коснётся. Нарисуй ещё одну — запасную.",
};
function finish() {
  const { sim, L } = game;
  game.ended = true;
  $("timer").hidden = true;
  const won = sim.state === "won";
  if (L.daily) return finishDaily(won);
  const i = L.index;
  let stars = 0,
    newFly = false;
  if (won) {
    stars = starsFor(L, sim.inkUsed);
    const before = save.stars[i];
    save.stars[i] = Math.max(before, stars);
    if (i + 1 < LEVELS.length) save.last = i + 1;
    if (game.flyGot && !save.fly[i]) {
      save.fly[i] = 1;
      save.wallet++;
      newFly = true;
    }
    fails[i] = 0;
  } else fails[i] = (fails[i] || 0) + 1;
  save.time += game.levelTime;
  const awards = won ? R.grantAchievements(save, CTX) : [];
  persist();
  const pct = Math.round((sim.inkUsed / L.plan.limit) * 100);
  const p3 = Math.round((L.plan.s3 / L.plan.limit) * 100);
  const last = i === LEVELS.length - 1;
  const chapterDone = won && L.n === PER_CHAPTER - 1;
  const typeName = { shield: "Защити", deliver: "Достань", home: "Домой" }[L.type];
  let html;
  if (won) {
    const head = last ? "Все уровни пройдены!" : chapterDone ? `Глава «${CHAPTERS[L.chapter].name}» пройдена!` : WIN_TEXT[sim.why]?.(L) || "Готово!";
    const fly = newFly
      ? `<p class="flyline got"><span class="fly-ico big"></span>Светлячок пойман! <b class="bump">+1</b></p>`
      : save.fly[i]
        ? ""
        : `<p class="flyline">Где-то здесь прячется светлячок — проведи линию через него</p>`;
    html = `<p class="eyebrow">УРОВЕНЬ ${L.id} · ${typeName.toUpperCase()}</p><h2 id="result-title">${head}</h2>
      <div class="stars" aria-label="Звёзд: ${stars}">${[0, 1, 2].map((k) => `<i class="${k < stars ? "on" : ""}"></i>`).join("")}</div>
      <p class="inkline">Чернил потрачено: ${pct}%${stars < 3 ? `. Три звезды — если не больше ${p3}%` : ""}</p>
      ${fly}${awardsHtml(awards)}
      ${last ? `<p>Звёзд собрано: ${R.totalStars(save)} из ${LEVELS.length * 3}.</p>` : ""}
      <div class="row">${last ? `<button class="btn primary" data-a="map">К уровням</button>` : `<button class="btn primary" data-a="next">Дальше <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`}</div>
      <div class="row"><button class="btn" data-a="again">Ещё раз</button><button class="btn" data-a="menu">В меню</button></div>`;
    stars && [0, 1, 2].slice(0, stars).forEach((k) => setTimeout(() => Sound.star(k), 260 + k * 250));
    if (newFly) setTimeout(() => Sound.fly(), 1000);
    if (awards.length) setTimeout(() => Sound.reward(), 1300);
  } else {
    const why = sim.why;
    const tip = LOSE_TIP[why] || "Попробуй нарисовать иначе.";
    const hinted = save.hinted[i];
    const head = why === "caught" && L.patrols?.some((p) => p.ghost) ? "Попались привидению!" : LOSE_TEXT[why] || "Ой!";
    // умная подсказка: после двух неудач подряд кнопка подсказки становится главной
    const nudge = fails[i] >= 2 && !(hinted && game.hint);
    const hintBtn = hinted && game.hint ? "" : `<button class="btn ${nudge ? "gold" : ""}" data-a="hint">${hinted ? "Показать подсказку" : nudge ? "Подсказка: покажет линию" : "Подсказка"}</button>`;
    html = `<p class="eyebrow">УРОВЕНЬ ${L.id} · ${typeName.toUpperCase()}</p><h2 id="result-title">${head}</h2><p>${tip}</p>
      <div class="row"><button class="btn primary" data-a="again">Ещё раз</button></div>
      <div class="row">${hintBtn}<button class="btn" data-a="menu">В меню</button></div>`;
  }
  showSheet(html, won ? "win" : "lose");
}
function awardsHtml(list) {
  return list
    .map((a) => `<p class="award"><b>Награда «${a.name}»</b> <span class="bump"><span class="fly-ico"></span>+${a.reward}</span></p>`)
    .join("");
}

// ---------- Задача дня ----------
// Знакомый уровень в зеркале. Перед показом проверяем, что отражённый эталон проходит его (почти всегда да).
function todayDaily() {
  const key = R.dayKey();
  for (const i of R.dailyCandidates(save, key).slice(0, 8)) {
    const D = dailyLevel(i);
    if (play(D, D.sol).won) return D;
  }
  return dailyLevel(0);
}
function dailySheet() {
  const key = R.dayKey();
  const done = R.dailyDone(save, key);
  const streak = R.streakNow(save, key);
  showSheet(
    `<p class="eyebrow">ЗАДАЧА ДНЯ</p><h2>Уровень наоборот</h2>
    <p>Каждый день — знакомый уровень, отражённый в зеркале: всё, что было справа, теперь слева.</p>
    <p>${done ? "Сегодня задача уже решена — можно сыграть ещё раз для удовольствия." : `Награда: <span class="chip"><span class="fly-ico"></span>+${R.DAILY_REWARD}</span>, а каждый 7-й день подряд — ещё <span class="chip"><span class="fly-ico"></span>+${R.STREAK_BONUS}</span>`}</p>
    <p class="streak">${streak ? `Серия: ${streak} ${plural(streak, "день", "дня", "дней")} подряд` : "Серия начнётся с сегодняшней задачи"}</p>
    <div class="row"><button class="btn primary" data-a="daily-go">${done ? "Сыграть ещё раз" : "Начать"}</button></div>
    <div class="row"><button class="btn" data-a="close">Назад</button></div>`,
    "daily",
  );
}
function finishDaily(won) {
  const { L } = game;
  let got = 0,
    awards = [];
  if (won) {
    got = R.solveDaily(save, R.dayKey());
    awards = R.grantAchievements(save, CTX);
    persist();
  }
  const html = won
    ? `<p class="eyebrow">ЗАДАЧА ДНЯ · УРОВЕНЬ ${LEVELS[L.of].id} В ЗЕРКАЛЕ</p><h2 id="result-title">Задача решена!</h2>
      ${got ? `<p class="flyline got"><span class="fly-ico big"></span>Награда <b class="bump">+${got}</b></p><p class="streak">Серия: ${save.streak} ${plural(save.streak, "день", "дня", "дней")} подряд. Приходи завтра!</p>` : `<p>Сегодня награда уже получена. Новая задача — завтра.</p>`}
      ${awardsHtml(awards)}
      <div class="row"><button class="btn primary" data-a="menu">В меню</button></div>
      <div class="row"><button class="btn" data-a="again">Ещё раз</button><button class="btn" data-a="map">Уровни</button></div>`
    : `<p class="eyebrow">ЗАДАЧА ДНЯ</p><h2 id="result-title">${LOSE_TEXT[game.sim.why] || "Ой!"}</h2><p>${LOSE_TIP[game.sim.why] || "Вспомни, как решался этот уровень, — только всё наоборот."}</p>
      <div class="row"><button class="btn primary" data-a="again">Ещё раз</button></div>
      <div class="row"><button class="btn" data-a="menu">В меню</button></div>`;
  if (won && (got || awards.length)) setTimeout(() => Sound.reward(), 700);
  showSheet(html, won ? "win" : "lose");
}
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

// ---------- Мастерская, награды, настройки ----------
let shopTab = "ink";
function shopSheet(tab = shopTab) {
  shopTab = tab;
  const list = tab === "ink" ? R.INKS : R.HATS;
  const chosen = tab === "ink" ? save.ink : save.hat;
  const items = list
    .map((it, i) => {
      const have = R.owned(save, tab, i);
      const act = have
        ? i === chosen
          ? `<span class="tag">Выбрано</span>`
          : `<button class="btn mini" data-pick="${i}">Выбрать</button>`
        : `<button class="btn mini gold" data-buy="${i}" ${save.wallet < it.price ? "disabled" : ""}><span class="fly-ico"></span>${it.price}</button>`;
      return `<div class="item ${i === chosen ? "on" : ""}"><canvas class="pv" data-pv="${tab}:${i}" width="96" height="72"></canvas><b>${it.name}</b>${act}</div>`;
    })
    .join("");
  showSheet(
    `<div class="shop-head"><div><p class="eyebrow">МАСТЕРСКАЯ</p><h2>Линии и шапки</h2></div><span class="wallet"><span class="fly-ico"></span>${save.wallet}</span></div>
    <p class="note">Светлячки ловятся на уровнях: проведи линию через светлячка. Ещё — за задачу дня и награды.</p>
    <div class="tabs"><button class="${tab === "ink" ? "on" : ""}" data-tab="ink">Линии</button><button class="${tab === "hat" ? "on" : ""}" data-tab="hat">Шапки Тоши</button></div>
    <div class="items">${items}</div>
    <div class="row"><button class="btn primary" data-a="close">Готово</button></div>`,
    "shop",
  );
  paintPreviews();
}
function paintPreviews() {
  for (const cv of document.querySelectorAll("canvas.pv")) {
    const [tab, i] = cv.dataset.pv.split(":");
    const c = cv.getContext("2d");
    const k = Math.min(2, devicePixelRatio || 1);
    cv.width = 96 * k;
    cv.height = 72 * k;
    c.setTransform(k, 0, 0, k, 0, 0);
    if (tab === "ink") {
      const pts = [];
      for (let x = 12; x <= 84; x += 6) pts.push([x, 40 + Math.sin(x / 11) * 14]);
      view.drawInk.call({ hq: true, s: 0.7, dpr: k, inkStyle: R.INKS[i] }, c, pts, THEMES[0], 1, false);
    } else critter(c, 48, 44, 22, 0, { t: performance.now() / 1000, mood: "joy", hat: R.HATS[i].id });
  }
}
function awardsSheet() {
  if (R.grantAchievements(save, CTX).length) persist();
  const rows = R.ACHIEVEMENTS.map((a, i) => {
    const have = !!(save.ach & (1 << i));
    const v = R.achProgress(save, a, CTX);
    const pct = Math.round((v / a.goal) * 100);
    const shown = a.goal === 1 ? (have ? "готово" : `${pct}%`) : `${Math.floor(v)} / ${a.goal}`;
    return `<div class="ach ${have ? "on" : ""}"><span class="medal">${have ? "✓" : i + 1}</span><div class="what"><b>${a.name}</b><small>${a.text}</small><i class="bar"><i style="width:${pct}%"></i></i></div><span class="rew"><span class="fly-ico"></span>+${a.reward}<small>${shown}</small></span></div>`;
  }).join("");
  const n = R.ACHIEVEMENTS.filter((_, i) => save.ach & (1 << i)).length;
  showSheet(
    `<p class="eyebrow">НАГРАДЫ · ${n} ИЗ ${R.ACHIEVEMENTS.length}</p><h2>Награды</h2>
    <div class="achs">${rows}</div>
    <div class="row"><button class="btn primary" data-a="close">Готово</button></div>`,
    "awards",
  );
}
function settingsSheet() {
  const eff = view.hq ? "высокое" : "низкое";
  showSheet(
    `<p class="eyebrow">НАСТРОЙКИ</p><h2>Графика</h2>
    <p>«Авто» включает высокое качество (свечение, облака, больше искр) и само снижает его, если игра начнёт подтормаживать.</p>
    <div class="seg">${QUALITY_NAMES.map((n, q) => `<button class="${save.quality === q ? "on" : ""}" data-q="${q}">${n}</button>`).join("")}</div>
    <p class="note">Сейчас: ${eff} качество${save.quality === 0 && autoLow ? " (снижено автоматически)" : ""}</p>
    <div class="row"><button class="btn primary" data-a="${game.mode === "level" ? "pause-back" : "close"}">Готово</button></div>`,
    "settings",
  );
}

// ---------- Окна ----------
function showSheet(html, kind) {
  $("sheet-body").innerHTML = html;
  $("sheet").hidden = false;
  $("sheet").dataset.kind = kind;
  $("go").hidden = true;
  const first = $("sheet-body").querySelector(".btn.primary, .btn");
  first?.focus({ preventScroll: true });
}
function hideSheet() {
  $("sheet").hidden = true;
  $("sheet").dataset.kind = "";
}
function pause() {
  if (game.mode !== "level" || game.paused || game.ended) return;
  game.paused = true;
  if (game.pen) penUp();
  pauseSheet();
}
function pauseSheet() {
  showSheet(
    `<h2>Пауза</h2><p>${game.L.daily ? "Задача дня" : "Уровень " + game.L.id} · ${CHAPTERS[game.L.chapter].name}</p>
    <div class="row"><button class="btn primary" data-a="resume">Продолжить</button></div>
    <div class="row"><button class="btn" data-a="restart">Заново</button><button class="btn" data-a="map">Уровни</button></div>
    <div class="row"><button class="btn" data-a="menu">В меню</button><button class="btn" data-a="settings">Графика</button></div>`,
    "pause",
  );
}
function resume() {
  game.paused = false;
  hideSheet();
  Sound.unlock();
  if (game.sim?.state === "draw" && game.strokes < game.L.strokes && game.L.type !== "home") $("go").hidden = false;
}

function hintSheet() {
  const L = game.L;
  const n = R.hintsLeft(save);
  const rewarded = host?.inVk && host.rewardReady;
  showSheet(
    `<h2>Подсказка</h2><p>Подсказка покажет, где провести линии на этом уровне. Потом она открыта здесь навсегда.</p>
    <div class="hintbox">
      <button class="btn primary" data-a="usehint" ${n ? "" : "disabled"}>${n ? `Показать подсказку <small>осталось подсказок: ${n}</small>` : "Подсказок пока нет"}</button>
      ${rewarded ? `<button class="btn gold" data-a="adhint">Посмотреть рекламу <small>и сразу получить подсказку для этого уровня</small></button>` : ""}
    </div>
    <p>Новая подсказка — за каждые ${R.STARS_PER_HINT} звёзд. До следующей: <span class="chip">★ ${R.starsToHint(save)}</span></p>
    <div class="row"><button class="btn" data-a="close">Назад</button></div>`,
    "hint",
  );
}
function openHint() {
  const L = game.L;
  if (!L) return;
  if (save.hinted[L.index]) {
    // уже открыта — просто показать или спрятать
    if (game.sim.state === "draw") {
      game.hint = !game.hint;
      updateHud();
    } else startLevel(L.index, { hint: true, retry: true });
    return;
  }
  if (game.sim.state === "run") game.paused = true;
  hintSheet();
}
function grantHint(byAd) {
  const i = game.L.index;
  if (!save.hinted[i]) {
    if (byAd) save.ad++;
    save.hinted[i] = 1;
    save.used++;
    persist();
  }
  Sound.hint();
  startLevel(i, { hint: true, retry: true });
  toast("Повтори линию по точкам");
}

$("sheet-body").addEventListener("click", async (e) => {
  if (adBusy) return; // во время ролика кнопки молчат
  const b = e.target.closest("[data-a], [data-tab], [data-q], [data-buy], [data-pick]");
  if (!b || b.disabled) return;
  const a = b.dataset.a;
  Sound.unlock();
  Sound.tap();
  const L = game.L;
  if (a === "resume") resume();
  else if (a === "restart") restart();
  else if (a === "map") showMap(L ? L.chapter : game.chapter);
  else if (a === "menu") showMenu();
  else if (a === "close") {
    hideSheet();
    if (game.mode === "level") {
      game.paused = false;
      if (game.ended) finish();
    } else if (game.mode === "menu") paintMenu();
  } else if (a === "settings") settingsSheet();
  else if (a === "pause-back") pauseSheet();
  else if (a === "daily-go") startLevel(0, { daily: todayDaily() });
  else if (b.dataset.tab) shopSheet(b.dataset.tab);
  else if (b.dataset.q != null) {
    save.quality = Number(b.dataset.q);
    if (save.quality === 1) autoLow = false;
    persist();
    applyQuality();
    settingsSheet();
  } else if (b.dataset.buy != null) {
    if (R.buy(save, shopTab, Number(b.dataset.buy))) {
      Sound.buy();
      const awards = R.grantAchievements(save, CTX);
      persist();
      applyLook();
      shopSheet();
      if (awards.length) (toast(`Награда «${awards[0].name}» +${awards[0].reward}`), Sound.reward());
    }
  } else if (b.dataset.pick != null) {
    save[shopTab] = Number(b.dataset.pick);
    persist();
    applyLook();
    shopSheet();
  } else if (a === "hint") {
    if (save.hinted[L.index]) startLevel(L.index, { hint: true, retry: true });
    else hintSheet();
  } else if (a === "usehint") {
    if (R.hintsLeft(save) > 0) grantHint(false);
  } else if (a === "adhint") {
    if (!(host?.inVk && host.rewardReady)) return;
    const ok = await host.rewarded();
    if (ok) grantHint(true);
    else {
      toast("Реклама не показалась — подсказка не списана");
      hintSheet();
    }
  } else if (a === "next" || a === "again") {
    // Переход после законченного уровня: здесь (и только здесь) может быть реклама
    const at = L.index;
    if (!(await adBreak())) return;
    if (game.L !== L) return;
    if (a === "next") startLevel(at + 1);
    else restart();
    updateVisibility();
  }
});
addEventListener("vk-reward-ready", () => {
  if ($("sheet").dataset.kind === "hint") hintSheet();
});

// ---------- Кнопки ----------
$("play").onclick = () => {
  Sound.unlock();
  Sound.tap();
  startLevel(R.nextLevel(save));
};
$("levels").onclick = () => {
  Sound.unlock();
  Sound.tap();
  showMap(LEVELS[R.nextLevel(save)].chapter);
};
$("daily").onclick = () => {
  Sound.unlock();
  Sound.tap();
  dailySheet();
};
$("shop").onclick = () => {
  Sound.unlock();
  Sound.tap();
  shopSheet();
};
$("awards").onclick = () => {
  Sound.unlock();
  Sound.tap();
  awardsSheet();
};
$("gear").onclick = () => {
  Sound.tap();
  settingsSheet();
};
$("map-back").onclick = () => {
  Sound.back();
  showMenu();
};
$("chapters").onclick = (e) => {
  const b = e.target.closest("[data-ch]");
  if (!b) return;
  Sound.tap();
  const ch = Number(b.dataset.ch);
  if (!R.isOpen(save, ch * PER_CHAPTER)) {
    toast("Сначала пройди предыдущую главу");
    return;
  }
  showMap(ch);
};
$("grid").onclick = (e) => {
  const b = e.target.closest("[data-lv]");
  if (!b) return;
  Sound.unlock();
  Sound.tap();
  startLevel(Number(b.dataset.lv));
};
$("pause").onclick = () => {
  Sound.tap();
  pause();
};
$("retry").onclick = () => {
  Sound.tap();
  restart();
};
$("hint").onclick = () => {
  Sound.tap();
  openHint();
};
function paintSound() {
  $("sound").setAttribute("aria-pressed", String(Sound.on));
}
$("sound").onclick = () => {
  if (adBusy) return;
  const on = Sound.toggle();
  save.mute = !on;
  persist();
  paintSound();
  if (on) Sound.tap();
};
addEventListener("keydown", (e) => {
  if (game.mode !== "level") return;
  if (e.key === "Escape") {
    if (game.paused && $("sheet").dataset.kind === "pause") resume();
    else pause();
  } else if ((e.key === "r" || e.key === "к") && $("sheet").hidden) restart();
  else if ((e.key === " " || e.key === "Enter") && !$("go").hidden) launch();
});
// любое нажатие разрешает звук (браузеры требуют жест игрока)
addEventListener("pointerdown", () => Sound.on && Sound.unlock());

// ---------- VK: сворачивание, реклама ----------
function quiet() {
  if (game.mode === "level" && !game.ended && !game.paused) pause();
  if (game.pen) penUp();
  Sound.hush();
}
function updateVisibility() {
  if (document.hidden || host?.hidden) quiet();
  // звук вернётся по нажатию игрока
}
document.addEventListener("visibilitychange", updateVisibility);
addEventListener("vk-game-visibility", updateVisibility);
addEventListener("vk-ad", (e) => {
  if (e.detail?.on) {
    adBusy = true;
    if (game.pen) penUp();
    Sound.hush();
  } else {
    adBusy = false;
    if (!document.hidden && !host?.hidden && Sound.on) Sound.unlock();
  }
});
// Реклама между уровнями: не чаще раза в 2 минуты (это решает слой VK) и никогда при запуске
async function adBreak() {
  if (!host?.inVk) return true;
  if (adBusy) return false;
  adBusy = true;
  try {
    await host.interstitial();
  } finally {
    adBusy = false;
  }
  return true;
}
// Пока идёт ролик, нажатия и клавиши до игры не доходят
for (const type of ["pointerdown", "pointerup", "pointermove", "click", "keydown", "touchstart"])
  addEventListener(
    type,
    (e) => {
      if (!adBusy) return;
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
    },
    { capture: true, passive: false },
  );

// ---------- Цикл ----------
let last = performance.now(),
  acc = 0,
  bonkAt = 0,
  spawnAt = 0,
  ghostAt = 0;
// замер кадров для «Авто»: если в среднем медленнее ~45 кадров/с — снижаем качество
const perf = { sum: 0, n: 0, skip: 90 };
function handleFx() {
  const sim = game.sim;
  if (!sim) return;
  const now = performance.now();
  const audible = game.mode === "level" || game.mode === "menu";
  const list = sim.fx.splice(0);
  for (const f of list) {
    if (f.k === "thud") {
      view.burst("dust", f.x, f.y);
      if (view.hq) view.burst("spark", f.x, f.y);
      if (audible) Sound.thud(0.7);
    } else if (f.k === "bonk") {
      if (now - bonkAt > 45) (bonkAt = now), view.burst("spark", f.x, f.y), audible && Sound.bonk();
    } else if (f.k === "knock") {
      view.burst("spark", f.x, f.y);
      if (f.v > 4) view.shake(0.12);
      Sound.knock(f.v);
    } else if (f.k === "spawn") {
      if (now - spawnAt > 90 && audible) (spawnAt = now), Sound.spawn();
    } else if (f.k === "boom") {
      view.burst("smoke", f.x, f.y, f);
      view.shake(0.25);
      Sound.boom();
    } else if (f.k === "splash") {
      view.burst("splash", f.x, f.y, f);
      Sound.splash(f.lava);
    } else if (f.k === "mistout") {
      if (now - ghostAt > 400 && audible) (ghostAt = now), Sound.ghost();
    } else if (f.k === "ghostpoof") {
      view.burst("ghostpoof", f.x, f.y);
      Sound.ghostPoof();
    } else if (f.k === "fizz") {
      view.burst("fizz", f.x, f.y);
      Sound.ghostPoof();
    } else if (f.k === "ignite") Sound.ignite();
    else if (f.k === "burnt") {
      const pts = view.linePts(f.line);
      for (let i = 0; i < pts.length; i += 2) view.burst("smokeLine", pts[i][0], pts[i][1]);
      view.shake(0.15);
      Sound.burnt();
    } else if (f.k === "spring") Sound.spring();
    else if (f.k === "click") (Sound.click(), Sound.door());
    else if (f.k === "eat") (view.burst("heart", f.x, f.y), Sound.eat());
    else if (f.k === "hit") (view.burst("hit", f.x, f.y), view.shake(0.6), Sound.hit());
    else if (f.k === "crash") (view.burst("hit", f.x, f.y), view.shake(0.5), Sound.crash());
    else if (f.k === "home") (view.burst("poof", f.x, f.y, { col: FOLK[f.c].hi }), Sound.home());
    else if (f.k === "win") {
      game.wonAt = performance.now() / 1000;
      if (game.mode === "level") {
        const home = game.L.homes?.[0];
        const p = game.sim.heroes?.[0]?.b.position || (home ? { x: home[0], y: home[1] } : { x: W / 2, y: H / 2 });
        view.burst("confetti", p.x, p.y - 60);
        view.burst("stars", p.x, p.y - 30);
        view.flash(p.x, p.y - 30);
        Sound.win();
      }
    } else if (f.k === "lose" && game.mode === "level") setTimeout(() => Sound.lose(), 350);
  }
  if (game.mode === "level" || game.mode === "menu") {
    const bugs = sim.bugs ? sim.bugs.length : 0;
    Sound.buzz(sim.state === "run" ? bugs : 0);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.dt = dt;
  if ((game.mode === "level" || game.mode === "menu") && !document.hidden) {
    if (perf.skip > 0) perf.skip--;
    else {
      perf.sum += dt;
      perf.n++;
      if (perf.n >= 120) {
        if (save.quality === 0 && view.hq && perf.sum / perf.n > 1 / 45) {
          autoLow = true;
          applyQuality();
        }
        perf.sum = perf.n = 0;
      }
    }
  }
  const sim = game.sim;
  if (sim && !game.paused && !adBusy && (game.mode === "level" || game.mode === "menu")) {
    if (game.mode === "menu") attractTick(now);
    if (sim.state !== "draw") {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 10) {
        sim.step();
        acc -= DT;
        n++;
      }
      if (n === 10) acc = 0;
      if (sim.L.lock && sim.state === "won") game.open = Math.min(1, game.open + dt * 1.5);
    } else acc = 0;
    if (game.mode === "level") {
      game.levelTime += dt;
      if (sim.state === "run" && game.L.type === "shield") {
        const left = Math.max(0, game.L.time - sim.t);
        $("timer").innerHTML = `Держись: ${left.toFixed(1).replace(".", ",")} с<i style="transform:scaleX(${left / game.L.time})"></i>`;
      }
      if (sim.state !== "draw" && sim.state !== "run" && !game.ended) {
        if (!game.resultAt) game.resultAt = now + (sim.state === "won" ? 1300 : 1000);
        if (now >= game.resultAt) finish();
      }
    }
    handleFx();
  }
  view.render(game, now);
}

// ---------- Для проверок ----------
window.liniya = {
  game,
  view,
  levels: LEVELS,
  start: (i, o) => startLevel(i, o),
  daily: () => startLevel(0, { daily: todayDaily() }),
  quality: () => ({ setting: save.quality, hq: view.hq, autoLow }),
  // для проверок: изобразить медленное устройство (кадры по 40 мс)
  slow: () => ((perf.skip = 0), (perf.sum = 0.04 * 119), (perf.n = 119)),
  toScreen: (x, y) => view.toScreen(x, y),
  save: () => save,
  sound: Sound,
};
window.Sound = Sound;

// Награды за то, что уже сделано (например, у старого сохранения) — сразу при запуске
const startAwards = R.grantAchievements(save, CTX);
if (startAwards.length) {
  persist();
  setTimeout(() => toast(`Награды за прошлые успехи: +${startAwards.reduce((n, a) => n + a.reward, 0)} светлячков`), 900);
}

paintSound();
$("loading").remove();
showMenu();
host?.bannerWhen(() => game.mode === "menu" || game.mode === "map" || !$("sheet").hidden);
requestAnimationFrame(frame);
