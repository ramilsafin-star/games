// «Рубеж: Железный бунт» — экраны, ход задания по раундам, магазин, «Схватка», задание дня, связь с VK.
import { WEAPONS, PRIMARY, SECONDARY, GUNS, UPGRADES, UPGRADE_IDS, upgradePrice, GRENADES, GRENADE_IDS, GEAR, KITS, KIT_IDS, DIFFICULTY, ECON, ACHIEVEMENTS, DAILY_MODS, rankOf, ROBOTS } from "./data.js?v=1434d71a";
import { MISSIONS, TIMES } from "./missions.js?v=1434d71a";
import { MAP_INFO, MAP_IDS, getMap } from "./maps.js?v=1434d71a";
import { Game, trainingMission, weaponStats } from "./sim.js?v=1434d71a";
import { Autopilot, applyLook } from "./bot.js?v=1434d71a";
import * as S from "./save.js?v=1434d71a";
import { View, QUALITY, detectTier } from "./view.js?v=1434d71a";
import { Hud } from "./hud.js?v=1434d71a";
import { Input } from "./input.js?v=1434d71a";
import { Sound } from "./sound.js?v=1434d71a";
import { fmtNum, fmtTime, clamp, wrap, yawTo, lookDir, DEG, hashString, rng } from "./util.js?v=1434d71a";

const $ = (id) => document.getElementById(id);
const host = () => window.vkGameHost;
const bootBar = (k, t) => {
  $("boot-bar").style.width = Math.round(k * 100) + "%";
  if (t) $("boot-text").textContent = t;
};

// ---------- Сохранение (облако VK успевает попасть в localStorage до чтения) ----------
bootBar(0.15, "Связь со штабом…");
await window.vkGameHost?.ready;
function readSave() {
  try {
    return S.decodeSave(localStorage.getItem(S.SAVE_KEY) || "");
  } catch {
    return S.freshSave();
  }
}
let save = readSave();
function store() {
  try {
    localStorage.setItem(S.SAVE_KEY, S.encodeSave(save));
  } catch {}
}
Sound.set(!!save.o.snd);
Sound.setMusic(!!save.o.mus);
Sound.volume(save.o.vol);

// ---------- Вид, приборы, управление ----------
bootBar(0.35, "Строим порт…");
const canvas = $("stage");
const view = new View(canvas, save.o.q === "auto" ? detectTier() : save.o.q);
view.fixedQuality = save.o.q !== "auto";
view.onTier = (t) => toast("Качество графики снижено: " + QUALITY[t].name);
const hud = new Hud(view);
let screen = "boot";
let adBusy = false;
const input = new Input(canvas, {
  sens: () => save.o.sens,
  tsens: () => save.o.tsens,
  inv: () => !!save.o.inv,
  enabled: () => screen === "play" && !adBusy,
});
input.onUnlock = () => {
  if (screen === "play" && game && game.phase === "live" && !input.touchMode) pause();
};
if (input.touchMode) document.body.classList.add("touch");

// ---------- Мелочи ----------
function text(el, v) {
  if (typeof el === "string") el = $(el);
  v = String(v);
  if (el && el.textContent !== v) el.textContent = v;
}
let toastT = 0;
function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("on"), 2600);
}
const history = [];
function go(name, push = true) {
  if (push && screen !== name && !["loading", "play", "boot"].includes(screen)) history.push(screen);
  screen = name;
  document.body.dataset.screen = name;
  if (name !== "play") {
    input.unlock();
    input.reset();
  }
  if (RENDER[name]) RENDER[name]();
  paintTop();
  Sound.music(name === "play" ? (game && game.mode !== "training" ? "fight" : null) : "menu");
}
function back() {
  const prev = history.pop() || "menu";
  if (screen === "arsenal" && run && arsenalReturn) {
    const r = arsenalReturn;
    arsenalReturn = null;
    return go(r, false);
  }
  go(prev, false);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  Sound.unlock();
  if (b.dataset.back !== undefined) {
    Sound.click();
    back();
  }
  if (b.dataset.go) {
    Sound.click();
    const to = b.dataset.go;
    if (to === "training") return startTraining();
    if (to === "arsenal") arsenalReturn = screen === "briefing" || screen === "between" || screen === "lost" ? screen : null;
    go(to);
  }
});
function modal(title, body, yes) {
  text("md-title", title);
  text("md-text", body);
  $("modal").hidden = false;
  $("md-yes").onclick = () => {
    $("modal").hidden = true;
    yes();
  };
  $("md-no").onclick = () => ($("modal").hidden = true);
}
function paintTop() {
  text("credits", fmtNum(save.c));
  const r = rankOf(save.xp);
  $("rank-chip").innerHTML = `Звание <b>${r.name}</b>`;
  const sb = $("sound");
  sb.setAttribute("aria-pressed", String(!!save.o.snd));
  sb.setAttribute("aria-label", save.o.snd ? "Выключить звук" : "Включить звук");
}
$("sound").onclick = () => {
  if (adBusy) return;
  save.o.snd = save.o.snd ? 0 : 1;
  store();
  Sound.set(!!save.o.snd);
  if (save.o.snd) Sound.unlock();
  paintTop();
  Sound.click();
};
const starStr = (n) => [0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}">★</i>`).join("");

// ---------- VK: сворачивание и реклама ----------
function quiet() {
  if (screen === "play" && game && game.phase === "live") pause();
  Sound.hush();
}
function visibility() {
  if (document.hidden || host()?.hidden) quiet();
}
document.addEventListener("visibilitychange", visibility);
addEventListener("vk-game-visibility", visibility);
addEventListener("vk-ad", (e) => {
  if (e.detail?.on) {
    adBusy = true;
    quiet();
  } else {
    adBusy = false;
    if (!document.hidden && !host()?.hidden && save.o.snd) Sound.unlock();
  }
});
addEventListener("vk-reward-ready", () => {
  if (screen === "debrief") paintDouble();
  if (screen === "lost") paintRevive();
  if (screen === "arsenal") renderArsenal();
});
// пока идёт ролик, нажатия до игры не доходят
for (const type of ["pointerdown", "pointerup", "click", "keydown", "touchstart", "mousedown"]) {
  addEventListener(type, (e) => {
    if (!adBusy) return;
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });
}
addEventListener("pointerdown", () => {
  if (save.o.snd && !document.hidden && !host()?.hidden && screen !== "pause") Sound.unlock();
});
const canReward = () => !!(host()?.inVk && host().rewardReady);
async function adBreak() {
  if (adBusy || !host()?.inVk) return;
  adBusy = true;
  try {
    await host().interstitial();
  } catch {}
  adBusy = false;
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

// ---------- Состояние задания ----------
let game = null; // текущий раунд
let bot = null; // автопилот (для проверок)
let run = null; // задание целиком: раунды, статистика, кредиты
let arsenalReturn = null;
let speedK = 1;
let endT = 0;
let lastResult = null;

function newRun(kind, mission, diff, extra = {}) {
  run = { kind, mission, diff, round: 0, time: 0, credits: 0, deaths: 0, alarm: false, stats: {}, revived: false, trial: null, mods: [], payK: 1, ...extra };
}

// ---------- Главное меню ----------
const RENDER = {};
RENDER.menu = () => {
  const done = S.missionsDone(save);
  text("menu-progress", done ? `${done} из 12 заданий · ★ ${S.totalStars(save)}` : "12 заданий на 4 картах");
  const d = dailyInfo();
  text("menu-daily", d.done ? "выполнено сегодня" : `+${fmtNum(d.reward)} кредитов`);
  if (!view.vistaOn) startVista();
};
function startVista() {
  view.vista("port", "dusk", "drizzle");
  view.vistaOn = true;
  Sound.ambient("drizzle");
}

// ---------- Кампания ----------
RENDER.campaign = () => {
  paintDiffSeg($("diff-seg"));
  const box = $("maps");
  box.innerHTML = "";
  const colors = { port: "#ff8a2a", dome: "#ffc04a", tower: "#4fe3ff", metro: "#ff4d3a" };
  let next = MISSIONS.findIndex((m) => !S.missionDone(save, m.id));
  for (const id of MAP_IDS) {
    const card = document.createElement("div");
    card.className = "mapcard";
    card.style.setProperty("--c", colors[id]);
    card.innerHTML = `<h3>${MAP_INFO[id].name}</h3><p>${MAP_INFO[id].blurb}</p>`;
    for (const m of MISSIONS.filter((q) => q.map === id)) {
      const b = document.createElement("button");
      b.className = "mission" + (m.id === next ? " next" : "");
      const open = S.missionOpen(save, m.id);
      b.disabled = !open;
      const kinds = m.rounds.map((r) => KIND_NAME[r.kind]).join(" → ");
      b.innerHTML = `<span class="n">${m.id + 1}</span><span><b>${m.name}</b><small>${open ? kinds : "Пройди предыдущее задание"}</small></span><span class="stars">${open ? starStr(S.starsOf(save, m.id)) : "🔒"}</span>`;
      b.onclick = () => openBriefing(m.id);
      card.append(b);
    }
    box.append(card);
  }
};
const KIND_NAME = { clear: "Зачистка", stealth: "Тихое проникновение", plant: "Заряд у А/Б", defuse: "Обезвредить бомбу", rescue: "Спасение", hold: "Удержание", boss: "Бой с боссом", training: "Тренировка", skirmish: "Схватка" };
function paintDiffSeg(el, onChange) {
  el.innerHTML = "";
  for (const d of DIFFICULTY) {
    const b = document.createElement("button");
    b.textContent = d.name;
    b.className = save.diff === d.id ? "on" : "";
    b.onclick = () => {
      save.diff = d.id;
      store();
      Sound.click();
      paintDiffSeg(el, onChange);
      onChange && onChange();
    };
    el.append(b);
  }
}

// ---------- Брифинг ----------
let briefIdx = 0;
function openBriefing(i) {
  briefIdx = i;
  newRun("campaign", MISSIONS[i], save.diff);
  go("briefing");
}
RENDER.briefing = () => {
  const m = run.mission;
  text("b-title", run.kind === "daily" ? "Задание дня: " + m.name : `${m.id + 1}. ${m.name}`);
  text("b-where", MAP_INFO[m.map].name + " · " + TIME_NAME[m.time] + (m.mates ? ` · с тобой бойцов: ${m.mates}` : ""));
  text("b-text", m.brief);
  text("b-goal", m.goal);
  $("b-tips").innerHTML = (m.tips || []).map((t) => `<li>${t}</li>`).join("") + (run.kind === "daily" ? `<li><b>${run.mod.name}:</b> ${run.mod.text}</li>` : "");
  const st = S.starsOf(save, m.id);
  $("b-stars").innerHTML = run.kind === "daily" ? "" : `<span>★ Задание выполнено ${st >= 1 ? "✓" : ""}</span><span>★ Без потерь (ни разу не выбыл)</span><span>★ ${m.star3 === "ghost" ? "Без тревоги" : `Не дольше ${fmtTime(m.par)} и точность от 35%`}</span>`;
  paintDiffSeg($("b-diff"), () => (run.diff = save.diff));
  run.diff = save.diff;
  paintLoadline($("b-loadout"));
  drawSketch($("sketch"), m);
};
const TIME_NAME = { dusk: "сумерки", night: "ночь, ливень", dawn: "рассвет, туман", day: "день, песчаная дымка", sunset: "закат", metro: "под землёй", emergency: "аварийный свет", forge: "сердце завода", range: "ангар" };
function paintLoadline(el, match = null) {
  const lo = save.lo;
  const chips = [];
  const pri = run?.trial || lo.p;
  chips.push(`<span class="chip"><b>${pri ? WEAPONS[pri].name : "без основного"}</b>${run?.trial ? " (проба)" : ""}</span>`);
  chips.push(`<span class="chip"><b>${WEAPONS[lo.s].name}</b></span>`);
  const nades = lo.g.filter(Boolean).map((g) => GRENADES[g].short).join(" + ") || "без гранат";
  chips.push(`<span class="chip">${nades}</span>`);
  chips.push(`<span class="chip">${lo.v ? "броня" : "без брони"}${lo.h ? " + шлем" : ""}</span>`);
  if (lo.k !== "none") chips.push(`<span class="chip">${KITS[lo.k].name}</span>`);
  const cost = S.gearCost(lo);
  if (!match) chips.push(`<span class="chip ${cost > save.c ? "warn" : ""}">снаряжение <b>${fmtNum(cost)}</b></span>`);
  el.innerHTML = chips.join("");
}
// Схема карты сверху: коробки, точки старта и целей
function drawSketch(cv, m) {
  const map = getMap(m.map);
  const c = cv.getContext("2d");
  const [x0, z0, x1, z1] = map.bounds;
  const W = cv.width, H = cv.height, pad = 14;
  const k = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (z1 - z0));
  const ox = W / 2 - ((x0 + x1) / 2) * k, oz = H / 2 + ((z0 + z1) / 2) * k;
  const P = (x, z) => [ox + x * k, oz - z * k];
  c.clearRect(0, 0, W, H);
  c.fillStyle = "#0d1626";
  const [a, b] = P(x0, z1);
  c.fillRect(a, b, (x1 - x0) * k, (z1 - z0) * k);
  c.strokeStyle = "rgba(120,170,220,0.25)";
  c.strokeRect(a, b, (x1 - x0) * k, (z1 - z0) * k);
  for (const bx of map.boxes) {
    if (bx.inv || bx.floorOnly) continue;
    const h = bx.y1 - map.floor;
    c.fillStyle = bx.glass ? "rgba(120,200,255,0.5)" : h > 4 ? "#6a7d96" : h > 2 ? "#4f5f75" : h > 0.9 ? "#3a475a" : "#2a3444";
    c.save();
    const [cx, cz] = P(bx.cx, bx.cz);
    c.translate(cx, cz);
    c.rotate(bx.yaw);
    c.fillRect(-bx.hw * k, -bx.hd * k, bx.hw * 2 * k, bx.hd * 2 * k);
    c.restore();
  }
  const dot = (pt, color, label) => {
    if (!pt) return;
    const [x, y] = P(pt.x, pt.z);
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff";
    c.font = "800 12px Rubik, Arial";
    c.textAlign = "center";
    if (label) c.fillText(label, x, y - 10);
  };
  for (const r of m.rounds) {
    dot(map.points[r.spawn || "S"], "#4fe3ff", m.rounds.length > 1 ? "старт " + (m.rounds.indexOf(r) + 1) : "старт");
    if (r.sites) r.sites.forEach((s, i) => dot(map.points[s], "#ff8a2a", "АБ"[i]));
    if (r.target) dot(map.points[r.target], "#ff8a2a", "пульт");
    if (r.hostage) dot(map.points[r.hostage], "#ffd27a", "инженер");
    if (r.exit) dot(map.points[r.exit], "#5fff9a", "выход");
    if (r.zone) {
      const z = map.zones[r.zone];
      const [x, y] = P(z.x, z.z);
      c.strokeStyle = "#ff8a2a";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, z.r * k, 0, Math.PI * 2);
      c.stroke();
      dot(z, "#ff8a2a", "точка");
    }
    if (r.boss) dot(map.points[r.boss], "#ff4d3a", "«Наковальня»");
  }
}

// ---------- Арсенал и снаряжение ----------
let arTab = "pri";
let arSel = null;
RENDER.arsenal = () => renderArsenal();
const MATCH = () => run && run.kind === "skirmish" && run.match;
function renderArsenal() {
  const match = MATCH();
  text("ar-title", match ? `Закупка · раунд ${run.match.round}` : "Арсенал");
  const tabs = $("ar-tabs");
  tabs.innerHTML = "";
  for (const [id, name] of [["pri", "Основное"], ["sec", "Пистолеты"], ["gear", "Снаряжение"]]) {
    const b = document.createElement("button");
    b.textContent = name;
    b.className = arTab === id ? "on" : "";
    b.onclick = () => {
      arTab = id;
      arSel = null;
      Sound.click();
      renderArsenal();
    };
    tabs.append(b);
  }
  text("ar-money", match ? `◆ ${fmtNum(run.match.money)} на раунд` : "");
  const list = $("ar-list");
  list.innerHTML = "";
  if (arTab === "gear") return renderGear(list);
  const ids = arTab === "pri" ? PRIMARY : SECONDARY;
  if (!arSel || !ids.includes(arSel)) arSel = (arTab === "pri" ? save.lo.p : save.lo.s) || ids[0];
  for (const id of ids) {
    const w = WEAPONS[id];
    const own = S.owns(save, id), open = S.weaponOpen(save, id);
    const eq = match ? run.match.hold[w.slot] === id : save.lo.p === id || save.lo.s === id || run?.trial === id;
    const b = document.createElement("button");
    b.className = "card" + (id === arSel ? " sel" : "") + (eq ? " eq" : "") + (!open ? " locked" : "");
    let price;
    if (match) price = own ? (w.cost ? `◆ ${fmtNum(w.cost)}` : "бесплатно") : "нет лицензии";
    else price = own ? "куплено" : open ? `◆ ${fmtNum(w.price)}` : `после задания ${w.unlock}`;
    b.innerHTML = `<b>${w.name}</b><small>${w.kind}</small><span class="price ${own && !match ? "own" : ""}">${price}</span>`;
    b.onclick = () => {
      arSel = id;
      Sound.click();
      renderArsenal();
      view.showcase = id;
    };
    list.append(b);
  }
  view.showcase = arSel;
  renderWeaponDetail(arSel);
  paintArsenalFoot();
}
function bars(w) {
  const W = weaponStats(w.id || arSel, S.upsOf(save, w.id || arSel));
  const dps = ((W.pellets || 1) * W.dmg * W.rpm) / 60;
  const rows = [
    ["Урон", W.dmg * (W.pellets || 1), 140, (W.pellets ? W.pellets + "×" + W.dmg : W.dmg)],
    ["Темп", W.rpm, 1000, W.rpm],
    ["Мощь в секунду", dps, 520, Math.round(dps)],
    ["Точность", 1 / (W.ads + 0.15), 1 / 0.15, ""],
    ["Дальность", W.range[1], 120, W.range[1] + " м"],
    ["Подвижность", W.speed, 1.06, Math.round(W.speed * 100) + "%"],
    ["Магазин", W.mag || 0, 100, W.mag || "—"],
  ];
  return `<div class="statbars">${rows.map(([n, v, max, s]) => `<div>${n}<i style="--k:${Math.round(clamp(v / max, 0.04, 1) * 100)}%"></i><em>${s}</em></div>`).join("")}</div>`;
}
function renderWeaponDetail(id) {
  const w = { ...WEAPONS[id], id };
  const box = $("ar-detail");
  const match = MATCH();
  const own = S.owns(save, id), open = S.weaponOpen(save, id);
  let html = `<div class="kind">${w.kind}</div><h3>${w.name}</h3><p>${w.blurb}</p>${bars(w)}`;
  if (!match) {
    html += '<div class="ups">';
    for (const up of UPGRADE_IDS) {
      const U = UPGRADES[up];
      const have = S.hasUp(save, id, up);
      const starsOk = S.totalStars(save) >= U.stars;
      const p = upgradePrice(id, up);
      html += `<button class="up ${have ? "have" : ""}" data-up="${up}" ${have || !own || !starsOk ? "disabled" : ""}><span><b>${U.name}</b><small>${U.text}${!starsOk ? ` · нужно ★ ${U.stars}` : ""}</small></span><span class="p">${have ? "есть" : "◆ " + fmtNum(p)}</span></button>`;
    }
    html += "</div>";
  }
  html += '<div class="actions">';
  if (match) {
    const held = run.match.hold[w.slot] === id;
    if (own && !held) html += `<button class="primary" data-act="mbuy">${w.cost ? "Купить на раунд · ◆ " + fmtNum(w.cost) : "Взять"}</button>`;
    else if (held) html += `<span class="chip"><b>В руках</b></span>`;
    else html += `<span class="chip">Купи лицензию в кампании</span>`;
  } else if (own) {
    const eq = save.lo.p === id || save.lo.s === id;
    html += eq && !run?.trial ? `<span class="chip"><b>В руках</b></span>` : `<button class="primary" data-act="equip">Взять</button>`;
    if (w.slot === "pri" && save.lo.p === id) html += `<button class="ghost" data-act="unequip">Без основного</button>`;
  } else if (open) {
    html += `<button class="primary" data-act="buy" ${save.c < w.price ? "disabled" : ""}>Купить · ◆ ${fmtNum(w.price)}</button>`;
    if (run && run.kind !== "skirmish" && canReward() && w.slot === "pri" && run.trial !== id) html += `<button class="reward" data-act="trial">Проба на задание за рекламу</button>`;
  } else {
    html += `<span class="chip">Откроется после задания ${w.unlock}</span>`;
    if (run && run.kind !== "skirmish" && canReward() && w.slot === "pri") html += `<button class="reward" data-act="trial">Проба на задание за рекламу</button>`;
  }
  html += "</div>";
  box.innerHTML = html;
  box.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.up) {
      if (S.buyUpgrade(save, id, b.dataset.up)) {
        store();
        Sound.buy();
        toast(`${UPGRADES[b.dataset.up].name} для «${w.name}» установлен`);
        S.checkAchievements(save);
      } else Sound.error();
      return renderArsenal();
    }
    const act = b.dataset.act;
    if (act === "buy") {
      if (S.buyWeapon(save, id)) {
        store();
        Sound.buy();
        toast(`«${w.name}» в арсенале`);
        S.checkAchievements(save);
      } else Sound.error();
    }
    if (act === "equip") {
      if (w.slot === "pri") save.lo.p = id;
      else save.lo.s = id;
      if (run) run.trial = null;
      store();
      Sound.equip();
    }
    if (act === "unequip") {
      save.lo.p = null;
      store();
    }
    if (act === "trial") {
      const ok = await rewarded();
      if (ok && run) {
        run.trial = id;
        toast(`«${w.name}» — на это задание`);
      }
    }
    if (act === "mbuy") matchBuy(id);
    renderArsenal();
  };
}
function renderGear(list) {
  const match = MATCH();
  const lo = match ? run.match.lo : save.lo;
  const money = () => (match ? run.match.money : save.c);
  const items = [
    ...GRENADE_IDS.map((g) => ({ id: "g:" + g, name: GRENADES[g].name + " граната", text: { frag: "Взрыв в радиусе 6 м. Хороша против групп.", emp: "Оглушает роботов, снимает щиты, открывает ядро босса.", smoke: "Облако на 13 секунд: роботы сквозь него не видят." }[g], price: GRENADES[g].price, on: lo.g.filter((x) => x === g).length })),
    { id: "v", name: GEAR.vest.name, text: GEAR.vest.text, price: GEAR.vest.price, on: lo.v },
    { id: "h", name: GEAR.helmet.name, text: GEAR.helmet.text, price: GEAR.helmet.price, on: lo.h },
    ...(match ? [] : KIT_IDS.filter((k) => k !== "none").map((k) => ({ id: "k:" + k, name: KITS[k].name, text: KITS[k].text, price: KITS[k].price, on: lo.k === k ? 1 : 0 }))),
  ];
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "card" + (it.on ? " eq sel" : "");
    b.innerHTML = `<b>${it.name}${it.on > 1 ? " ×2" : ""}</b><small>${it.text}</small><span class="price">◆ ${fmtNum(it.price)}${match ? "" : " на задание"}</span>`;
    b.onclick = () => {
      Sound.click();
      if (it.id.startsWith("g:")) {
        const g = it.id.slice(2);
        // две ячейки гранат: нажатие добавляет, третье — убирает все этого вида
        const n = lo.g.filter((x) => x === g).length;
        const free = lo.g.indexOf(null);
        if (n >= 1 && (free < 0 || n >= 2)) lo.g = lo.g.map((x) => (x === g ? null : x));
        else if (free >= 0) lo.g[free] = g;
        else lo.g[1] = g;
      }
      if (it.id === "v") lo.v = lo.v ? 0 : 1;
      if (it.id === "h") lo.h = lo.h ? 0 : 1;
      if (it.id.startsWith("k:")) lo.k = lo.k === it.id.slice(2) ? "none" : it.id.slice(2);
      if (match) {
        const cost = S.gearCost(lo) - run.match.paidGear;
        if (cost > run.match.money) {
          Sound.error();
          toast("Не хватает денег матча");
          if (it.id === "v") lo.v = 0;
          if (it.id === "h") lo.h = 0;
          if (it.id.startsWith("g:")) lo.g = lo.g.map((x, i) => (i === lo.g.lastIndexOf(it.id.slice(2)) ? null : x));
        }
      } else store();
      renderArsenal();
    };
    list.append(b);
  }
  $("ar-detail").innerHTML = `<div class="kind">Снаряжение</div><h3>${match ? "На этот раунд" : "На задание"}</h3><p>${match ? "Броня и гранаты оплачиваются из денег матча. Погиб — снаряжение потеряно." : "Броня, шлем, набор и гранаты оплачиваются один раз при выходе на задание и пополняются в начале каждого раунда."}</p><p>Гранаты: две ячейки. Нажми на гранату, чтобы положить её в свободную ячейку; ещё раз — убрать.</p>`;
  paintArsenalFoot();
  void money;
}
function paintArsenalFoot() {
  const match = MATCH();
  paintLoadline($("ar-loadout"), match);
  if (match) {
    $("ar-loadout").innerHTML = `<span class="chip"><b>${run.match.hold.pri ? WEAPONS[run.match.hold.pri].name : "без основного"}</b></span><span class="chip"><b>${WEAPONS[run.match.hold.sec].name}</b></span><span class="chip">${run.match.lo.g.filter(Boolean).map((g) => GRENADES[g].short).join(" + ") || "без гранат"}</span><span class="chip">${run.match.lo.v ? "броня" : "без брони"}${run.match.lo.h ? " + шлем" : ""}</span>`;
    $("ar-cost").innerHTML = `осталось <b>◆ ${fmtNum(run.match.money - (S.gearCost(run.match.lo) - run.match.paidGear))}</b>`;
  } else $("ar-cost").innerHTML = `снаряжение на задание <b>◆ ${fmtNum(S.gearCost(save.lo))}</b> из ◆ ${fmtNum(save.c)}`;
  text("ar-done", match ? "В бой" : arsenalReturn ? "Готово" : "Готово");
}
$("ar-done").onclick = () => {
  Sound.click();
  view.showcase = null;
  if (MATCH()) return matchStartRound();
  if (arsenalReturn) {
    const r = arsenalReturn;
    arsenalReturn = null;
    return go(r, false);
  }
  back();
};

// ---------- Старт задания и раундов ----------
$("b-go").onclick = () => {
  Sound.click();
  run.diff = save.diff;
  // снаряжение оплачивается при выходе на задание
  if (run.kind !== "skirmish") {
    const before = S.gearCost(save.lo);
    const paid = S.payGear(save);
    run.paidGear = paid;
    if (paid < before) toast("На всё снаряжение не хватило — взято, что по карману");
    store();
  }
  run.round = 0;
  startRound();
};
function loadoutNow() {
  const { loadout, ups } = S.loadoutForGame(save);
  if (run.trial) loadout.pri = run.trial;
  if (run.kind === "skirmish") {
    const m = run.match;
    loadout.pri = m.hold.pri;
    loadout.sec = m.hold.sec;
    loadout.g = m.lo.g.filter(Boolean);
    loadout.vest = !!m.lo.v;
    loadout.helmet = !!m.lo.h;
    loadout.kit = "none";
  }
  if (run.kind === "training") {
    loadout.pri = "shkval";
    loadout.sec = "iskra";
    loadout.g = ["frag", "emp"];
    loadout.vest = true;
    loadout.helmet = true;
    loadout.kit = "battery";
  }
  return { loadout, ups };
}
function startRound(fromRetry = false) {
  const m = run.mission;
  const tips = [
    "Ядро робота светится — по нему урон вдвое больше.", "Приседай за укрытием: так в тебя труднее попасть.", "ЭМИ снимает щит «Бастиона» и оглушает всех роботов рядом.",
    "Шагом и пригнувшись ты почти не шумишь.", "Короткие очереди точнее длинных.", "«Оса» целится красным лучом — уйди с его линии.", "Красные круги на полу — сюда летят ракеты.",
  ];
  text("ld-kicker", run.kind === "skirmish" ? `Схватка · раунд ${run.match.round}` : run.kind === "training" ? "Полигон" : `${MAP_INFO[m.map].name}${m.rounds.length > 1 ? ` · раунд ${run.round + 1} из ${m.rounds.length}` : ""}`);
  text("ld-title", m.name);
  text("ld-tip", tips[Math.floor(Math.random() * tips.length)]);
  $("ld-bar").style.width = "10%";
  go("loading", false);
  view.vistaOn = false;
  // даём экрану загрузки показаться, потом строим сцену
  setTimeout(() => {
    const { loadout, ups } = loadoutNow();
    const seed = (Date.now() & 0xffff) + run.round * 7;
    game = new Game({ mission: m, round: run.round, diff: run.diff, seed, loadout, ups, mods: run.mods, mode: run.kind, payK: run.payK, mateTier: 1 });
    $("ld-bar").style.width = "45%";
    setTimeout(() => {
      view.load(game.world, m, { fogK: run.mods.includes("fog") ? 0.35 : 1 });
      Sound.ambient(m.weather === "rain" ? "rain" : m.weather === "drizzle" ? "drizzle" : m.map === "dome" ? "wind" : m.map === "metro" || m.map === "tower" || m.map === "range" ? "hum" : "fog");
      $("ld-bar").style.width = "100%";
      hud.reset();
      endT = 0;
      bot = autoOn ? new Autopilot(game, { seed: 3 }) : null;
      setTimeout(() => {
        go("play", false);
        Sound.roundStart();
        const kindName = KIND_NAME[game.spec.kind] || "";
        hud.banner(run.kind === "training" ? "Тренировка" : run.kind === "skirmish" ? `Раунд ${run.match.round}` : m.rounds.length > 1 ? `Раунд ${run.round + 1}: ${kindName}` : kindName, "small");
        if (game.mission.mates) hud.radio("Лис", "Отряд на месте. Идём за тобой.");
        // захват мыши — только по нажатию игрока (щелчок по полю боя), иначе браузер ругается
        if (!input.touchMode && !input.locked && !input.lockFailed) hud.hint("Щёлкни по полю боя, чтобы управлять мышью");
      }, 120);
    }, 30);
  }, 60);
}
function pause() {
  if (screen !== "play" || !game || game.phase !== "live") return;
  text("pause-title", game.mission.name);
  text("pause-goal", game.obj.text || "");
  go("pause", false);
  Sound.music("menu");
}
function resume() {
  go("play", false);
  if (!input.touchMode) input.lock();
}
$("pause-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  pause();
});
$("ps-resume").onclick = () => resume();
$("ps-settings").onclick = () => {
  settingsFrom = "pause";
  go("settings", false);
};
$("ps-restart").onclick = () => {
  accumulate(game);
  startRound(true);
};
$("ps-menu").onclick = () => modal("Выйти в меню?", "Прогресс этого задания не сохранится, заработанные кредиты останутся.", () => {
  accumulate(game);
  toMenu();
});
let settingsFrom = null;
addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (screen === "play") pause();
    else if (screen === "pause") resume();
  }
});
function toMenu() {
  run = null;
  game = null;
  history.length = 0;
  view.vistaOn = false;
  go("menu", false);
}

// результат раунда → профиль (кредиты боя — сразу в кошелёк)
function accumulate(g) {
  if (!g || g._counted) return;
  g._counted = true;
  if (run.kind === "skirmish") return;
  run.time += g.t;
  run.credits += g.credits;
  save.c += g.credits;
  for (const [k, v] of Object.entries(g.stats)) run.stats[k] = (run.stats[k] || 0) + v;
  if (g.alarm) run.alarm = true;
  S.addFightStats(save, g.stats, g.t);
  store();
}
function roundOver() {
  const g = game;
  if (run.kind === "skirmish") return matchRoundOver(g);
  if (g.phase === "won") {
    accumulate(g);
    if (run.kind === "training") {
      save.tut = 1;
      S.checkAchievements(save);
      store();
      return showDebrief(null);
    }
    if (run.round + 1 < run.mission.rounds.length) {
      run.round++;
      text("bw-kicker", `Раунд ${run.round} выигран`);
      text("bw-title", run.mission.name);
      text("bw-text", `Дальше: ${KIND_NAME[run.mission.rounds[run.round].kind]}. Можно докупить снаряжение и сменить оружие.`);
      $("bw-rows").innerHTML = `<div><span>Роботы отключены</span><b>${g.stats.kills}</b></div><div><span>Кредиты за раунд</span><b>+${fmtNum(g.credits)}</b></div>`;
      Sound.win();
      return go("between", false);
    }
    return finishMission();
  }
  // проигрыш
  accumulate(g);
  run.deaths++;
  const R = { down: ["Щит пробит", "Тебя эвакуировали с поля боя. Попробуй другой путь или другое оружие."], time: ["Время вышло", "Задание нужно выполнить быстрее."], defused: ["Заряд снят", "Робот добрался до заряда. Держи подходы к нему."], bomb: ["Бомба взорвалась", "Не успели обезвредить. Сапёрный набор ускоряет работу вдвое."] }[g.reason] || ["Раунд проигран", ""];
  text("lost-title", R[0]);
  text("lost-text", R[1]);
  paintRevive();
  Sound.lose();
  go("lost", false);
}
function paintRevive() {
  $("lost-revive").hidden = !(game && game.reason === "down" && !run.revived && canReward() && run.kind !== "skirmish");
}
// снаряжение, добавленное между раундами, доплачивается
function payExtraGear() {
  if (!run || run.kind === "skirmish" || run.kind === "training" || run.paidGear === undefined) return;
  const extra = S.gearCost(save.lo) - run.paidGear;
  if (extra <= 0) return;
  const was = S.gearCost(save.lo);
  save.c += run.paidGear;
  const paid = S.payGear(save);
  run.paidGear = paid;
  if (paid < was) toast("На всё снаряжение не хватило — взято, что по карману");
  store();
}
$("bw-go").onclick = () => {
  Sound.click();
  payExtraGear();
  startRound();
};
$("lost-retry").onclick = () => {
  Sound.click();
  payExtraGear();
  startRound(true);
};
$("lost-menu").onclick = () => toMenu();
$("lost-revive").onclick = async () => {
  const round = game;
  const missionRun = run;
  if (screen !== "lost" || !round?._counted || round.reason !== "down" || missionRun.revived) return;
  const ok = await rewarded();
  if (!ok || screen !== "lost" || game !== round || run !== missionRun) return;
  run.revived = true;
  run.deaths--;
  game._counted = false;
  // откатываем учёт проигранного раунда: бой продолжается
  run.time -= game.t;
  run.credits -= game.credits;
  save.c -= game.credits;
  for (const [k, v] of Object.entries(game.stats)) run.stats[k] -= v;
  S.addFightStats(save, game.stats, game.t, -1);
  game.revive();
  store();
  go("play", false);
};

// ---------- Итоги задания ----------
function finishMission() {
  const m = run.mission;
  if (run.kind === "daily") return finishDaily();
  const res = S.missionResult(save, { mission: m, diff: run.diff, time: run.time, stats: run.stats, credits: run.credits, deaths: run.deaths, alarm: run.alarm });
  const acc = res.acc;
  const got = S.checkAchievements(save, { acc, won: true, rescueClean: run.stats.rescue === 2 });
  store();
  lastResult = { ...res, mission: m, got, doubled: false };
  showDebrief(lastResult);
}
function showDebrief(res) {
  Sound.win();
  if (!res) {
    // тренировка
    text("db-kicker", "Тренировка пройдена");
    text("db-title", "Полигон «Рубежа»");
    $("db-stars").innerHTML = starStr(3);
    $("db-checks").innerHTML = "";
    $("db-rows").innerHTML = `<div><span>Все 10 шагов</span><b>✓</b></div>`;
    text("db-total", "");
    $("db-extra").innerHTML = '<div class="ach-new">Достижение: «Выпускник полигона»</div>';
    $("db-double").hidden = true;
    $("db-again").hidden = true;
    text("db-next", "К кампании");
    $("db-next").onclick = () => {
      run = null;
      go("campaign", false);
    };
    lastResult = null;
    return go("debrief", false);
  }
  const m = res.mission;
  text("db-kicker", "Задание выполнено");
  text("db-title", `${m.id + 1}. ${m.name} · ${DIFFICULTY[run.diff].name}`);
  $("db-stars").innerHTML = [0, 1, 2].map((i) => `<i class="${i < res.stars ? "on" : ""}" style="animation-delay:${0.25 + i * 0.28}s">★</i>`).join("");
  for (let i = 0; i < res.stars; i++) setTimeout(() => Sound.star(i), 300 + i * 280);
  $("db-checks").innerHTML = `<span class="ok">✓ выполнено</span><span class="${run.deaths === 0 ? "ok" : ""}">${run.deaths === 0 ? "✓" : "✗"} без потерь</span><span class="${(m.star3 === "ghost" ? res.ghost : res.fast) ? "ok" : ""}">${(m.star3 === "ghost" ? res.ghost : res.fast) ? "✓" : "✗"} ${m.star3 === "ghost" ? "без тревоги" : `норма ${fmtTime(m.par)} и точность 35%`}</span><span>время ${fmtTime(run.time)} · точность ${Math.round(res.acc * 100)}%</span>`;
  $("db-rows").innerHTML = res.rows.map((r, i) => `<div style="animation-delay:${0.9 + i * 0.12}s"><span>${r.name}</span><b>+${fmtNum(r.amount)}</b></div>`).join("");
  // счётчик итога
  const total = res.total * (res.doubled ? 2 : 1);
  let shown = 0;
  const t0 = performance.now() + 900;
  const tick = () => {
    const k = clamp((performance.now() - t0) / 900, 0, 1);
    shown = Math.round(total * k * k * (3 - 2 * k));
    text("db-total", "◆ " + fmtNum(shown));
    if (k < 1 && screen === "debrief") requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const extra = [];
  extra.push(`<div>Опыт +${res.xp}${res.rankUp ? ` · новое звание: <b>${rankOf(save.xp).name}</b>` : ""}</div>`);
  for (const a of res.got || []) extra.push(`<div class="ach-new">Достижение: «${a.name}» — ${a.text}</div>`);
  const nextM = MISSIONS[m.id + 1];
  if (nextM && WEAPONS && Object.values(WEAPONS).some((w) => w.unlock === m.id + 1 && w.price)) {
    const nw = Object.values(WEAPONS).filter((w) => w.unlock === m.id + 1 && w.price).map((w) => "«" + w.name + "»");
    extra.push(`<div>В арсенале открылось: ${nw.join(", ")}</div>`);
  }
  $("db-extra").innerHTML = extra.join("");
  $("db-again").hidden = false;
  text("db-next", nextM ? "Дальше" : "К кампании");
  $("db-next").onclick = async () => {
    Sound.click();
    // межстраничная реклама — только здесь, при переходе к следующему заданию
    await adBreak();
    if (nextM) openBriefing(nextM.id);
    else {
      run = null;
      go("campaign", false);
    }
  };
  paintDouble();
  go("debrief", false);
  paintTop();
}
function paintDouble() {
  $("db-double").hidden = !(lastResult && !lastResult.doubled && canReward());
}
$("db-double").onclick = async () => {
  if (!lastResult || lastResult.doubled) return;
  const ok = await rewarded();
  if (!ok || !lastResult || lastResult.doubled) return;
  lastResult.doubled = true;
  save.c += lastResult.total;
  store();
  Sound.buy();
  toast(`+${fmtNum(lastResult.total)} кредитов`);
  showDebrief(lastResult);
};
$("db-menu").onclick = () => toMenu();
$("db-again").onclick = async () => {
  Sound.click();
  await adBreak();
  if (lastResult) openBriefing(lastResult.mission.id);
};

// ---------- Тренировка ----------
function startTraining() {
  newRun("training", trainingMission(), 0);
  startRound();
}

// ---------- Задание дня ----------
function dailyInfo() {
  const day = S.dayNumber();
  const r = rng(hashString("rubezh" + day));
  const pool = MISSIONS.filter((m) => S.missionDone(save, m.id));
  const mission = pool.length ? pool[Math.floor(r() * pool.length)] : MISSIONS[0];
  const mod = DAILY_MODS[Math.floor(r() * DAILY_MODS.length)];
  const streak = save.dy.day === day - 1 || save.dy.day === day ? save.dy.streak : 0;
  const reward = Math.round((900 + Math.min(5, streak) * 200) * mod.pay / 50) * 50;
  return { day, mission, mod, done: save.dy.day === day && save.dy.done, reward, streak };
}
RENDER.daily = () => {
  const d = dailyInfo();
  $("daily-card").innerHTML = `<small>Задание дня</small><h2>${d.mod.name}</h2><p>${d.mod.text}</p><p>Задание: <b>${d.mission.id + 1}. ${d.mission.name}</b> (${MAP_INFO[d.mission.map].name}), сложность «Боец».</p><p>Награда: <b>◆ ${fmtNum(d.reward)}</b>${d.streak ? ` · серия дней: ${d.streak}` : ""}</p>${d.done ? "<p><b>Сегодня уже выполнено.</b> Можно сыграть ещё раз без награды — новое задание завтра.</p>" : ""}<div class="btns"><button class="ghost" data-back>Назад</button><button class="primary" id="daily-go">Начать</button></div>`;
  $("daily-go").onclick = () => {
    newRun("daily", d.mission, 1, { mods: [d.mod.id], payK: d.mod.pay, mod: d.mod, dailyReward: d.done ? 0 : d.reward });
    go("briefing");
  };
};
function finishDaily() {
  const d = dailyInfo();
  const reward = run.dailyReward || 0;
  if (reward) {
    save.c += reward;
    save.dy = { day: d.day, done: 1, streak: (save.dy.day === d.day - 1 ? save.dy.streak : 0) + 1, total: save.dy.total + 1 };
    S.addStat(save, "dailies", 1);
  }
  S.checkAchievements(save, {});
  store();
  text("db-kicker", "Задание дня выполнено");
  text("db-title", run.mod.name + " · " + run.mission.name);
  $("db-stars").innerHTML = starStr(3);
  $("db-checks").innerHTML = `<span>время ${fmtTime(run.time)}</span><span>отключено роботов: ${run.stats.kills || 0}</span>`;
  $("db-rows").innerHTML = `<div><span>Роботы и цели</span><b>+${fmtNum(run.credits)}</b></div><div style="animation-delay:.2s"><span>Награда дня</span><b>+${fmtNum(reward)}</b></div>`;
  text("db-total", "◆ " + fmtNum(run.credits + reward));
  $("db-extra").innerHTML = reward ? `<div>Серия дней: ${save.dy.streak}. Завтра — новое задание.</div>` : "<div>Награда за сегодня уже получена.</div>";
  $("db-double").hidden = true;
  $("db-again").hidden = true;
  text("db-next", "В меню");
  $("db-next").onclick = async () => {
    await adBreak();
    toMenu();
  };
  lastResult = null;
  Sound.win();
  go("debrief", false);
}

// ---------- «Схватка» 5×5 ----------
RENDER.skirmish = () => {
  paintDiffSeg($("sk-diff"));
  const box = $("sk-maps");
  box.innerHTML = "";
  for (const id of MAP_IDS) {
    const open = S.mapOpen(save, id);
    const b = document.createElement("button");
    b.className = "card" + (open ? "" : " locked");
    b.disabled = !open;
    b.innerHTML = `<b>${MAP_INFO[id].name}</b><small>${open ? MAP_INFO[id].blurb : "Пройди первое задание этой карты"}</small><span class="price">${open ? "Играть" : "🔒"}</span>`;
    b.onclick = () => startMatch(id);
    box.append(b);
  }
};
function startMatch(mapId) {
  const mission = { id: "sk-" + mapId, map: mapId, name: "Схватка: " + MAP_INFO[mapId].name, time: { port: "dusk", dome: "sunset", tower: "day", metro: "metro" }[mapId], weather: mapId === "port" ? "drizzle" : mapId === "dome" ? "haze" : null, mates: 4, rounds: [] };
  newRun("skirmish", mission, save.diff, {
    match: { map: mapId, money: ECON.match.start, wins: 0, losses: 0, streak: 0, round: 1, seed: Math.floor(Math.random() * 0xffffffff), hold: { pri: null, sec: "iskra" }, lo: { g: [null, null], v: 0, h: 0, k: "none" }, paidGear: 0, kills: 0 },
  });
  arTab = "pri";
  go("arsenal");
}
function matchBuy(id) {
  const m = run.match, w = WEAPONS[id];
  if (m.hold[w.slot] === id) return;
  if (m.money < w.cost) {
    Sound.error();
    return toast("Не хватает денег матча");
  }
  m.money -= w.cost;
  m.hold[w.slot] = id;
  Sound.buy();
}
// раунд «Схватки»: состав роботов растёт от раунда к раунду
function matchSpec(round, seed) {
  const comp = [
    ["zhuk", "zhuk", "zhuk", "strelok", "strelok"],
    ["zhuk", "zhuk", "strelok", "strelok", "strelok"],
    ["zhuk", "strelok", "strelok", "strelok", "bastion"],
    ["strelok", "strelok", "strelok", "bastion", "kolobok"],
    ["strelok", "strelok", "bastion", "osa", "kolobok"],
    ["strelok", "strelok", "bastion", "osa", "molot"],
    ["strelok", "strelok", "bastion", "bastion", "molot"],
  ][Math.min(6, round - 1)];
  const random = rng(seed ^ round);
  const spots = ["A", "A", "B", "B", "TB"];
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  return { kind: "skirmish", spawn: "TA", sites: ["A", "B"], plant: 3, defend: 30, time: 115, robots: comp.map((t, i) => [t, t === "osa" ? "perch" : spots[i], i === 4 ? { hunt: true } : {}]), waves: [] };
}
function matchStartRound() {
  const m = run.match;
  // снаряжение раунда
  const gear = S.gearCost(m.lo) - m.paidGear;
  m.money -= Math.max(0, gear);
  m.paidGear = S.gearCost(m.lo);
  run.mission.rounds = [matchSpec(m.round, m.seed)];
  run.round = 0;
  startRound();
}
function matchRoundOver(g) {
  const m = run.match;
  const won = g.phase === "won";
  const kills = g.stats.kills;
  m.kills += kills;
  if (won) {
    m.wins++;
    m.streak = 0;
    m.money += ECON.match.win;
  } else {
    m.losses++;
    m.money += ECON.match.loss + Math.min(3, m.streak) * ECON.match.lossStreak;
    m.streak++;
  }
  m.money = Math.min(ECON.match.max, m.money + kills * ECON.match.kill);
  S.addFightStats(save, g.stats, g.t);
  // погиб — оружие и снаряжение потеряны
  if (!g.player.alive) {
    m.hold = { pri: null, sec: "iskra" };
    m.lo = { g: [null, null], v: 0, h: 0, k: "none" };
    m.paidGear = 0;
  } else {
    // гранаты расходуются, броня — если пробита
    m.lo.g = [null, null];
    if (g.player.armor <= 0) m.lo.v = 0;
    m.paidGear = S.gearCost(m.lo);
  }
  if (won) S.addStat(save, "rounds", 1);
  const over = m.wins >= ECON.match.toWin || m.losses >= ECON.match.toWin;
  if (over) {
    const pay = DIFFICULTY[run.diff].pay;
    const reward = Math.round(((m.wins * 250 + (m.wins >= ECON.match.toWin ? 1000 : 300)) * pay) / 10) * 10;
    save.c += reward;
    if (m.wins >= ECON.match.toWin) S.addStat(save, "matches", 1);
    const got = S.checkAchievements(save, {});
    store();
    text("db-kicker", m.wins >= ECON.match.toWin ? "Матч выигран" : "Матч проигран");
    text("db-title", `${run.mission.name} · ${m.wins} : ${m.losses}`);
    $("db-stars").innerHTML = "";
    $("db-checks").innerHTML = `<span>отключено роботов: ${m.kills}</span><span>${DIFFICULTY[run.diff].name}</span>`;
    $("db-rows").innerHTML = `<div><span>Победы в раундах</span><b>${m.wins}</b></div><div style="animation-delay:.15s"><span>Награда в кампанию</span><b>+${fmtNum(reward)}</b></div>`;
    text("db-total", "◆ " + fmtNum(reward));
    $("db-extra").innerHTML = got.map((a) => `<div class="ach-new">Достижение: «${a.name}»</div>`).join("");
    $("db-double").hidden = true;
    $("db-again").hidden = true;
    text("db-next", "В меню");
    $("db-next").onclick = async () => {
      await adBreak();
      toMenu();
    };
    lastResult = null;
    won ? Sound.win() : Sound.lose();
    return go("debrief", false);
  }
  m.round++;
  store();
  won ? Sound.win() : Sound.lose();
  toast(won ? `Раунд за нами! Счёт ${m.wins} : ${m.losses}` : `Раунд за роботами. Счёт ${m.wins} : ${m.losses}`);
  arTab = "pri";
  go("arsenal", false);
}

// ---------- Профиль ----------
RENDER.profile = () => {
  const r = rankOf(save.xp);
  $("pf-rank").innerHTML = `<small>Звание</small><b>${r.name}</b><div class="bar" style="width:100%"><i style="width:${Math.round(r.k * 100)}%"></i></div><small>Опыт ${fmtNum(save.xp)}${r.next ? ` из ${fmtNum(r.next)}` : ""} · звёзд ${S.totalStars(save)} из 36 · заданий ${S.missionsDone(save)} из 12</small>`;
  const st = (k) => S.stat(save, k);
  const acc = st("shots") ? Math.round((st("hits") / st("shots")) * 100) : 0;
  const rows = [["Роботов отключено", st("kills")], ["Выстрелом в ядро", st("coreKills")], ["Ножом", st("knife")], ["Точность", acc + "%"], ["Оглушено ЭМИ", st("emp")], ["«Молотов» разбито", st("molot")], ["Ретрансляторы и бомбы", st("relays")], ["Спасено инженеров", st("rescues")], ["Схваток выиграно", st("matches")], ["Заданий дня", save.dy.total], ["Время в бою", Math.round(st("secs") / 60) + " мин"]];
  $("pf-stats").innerHTML = rows.map(([n, v]) => `<div>${n}<b>${typeof v === "number" ? fmtNum(v) : v}</b></div>`).join("");
  $("pf-ach").innerHTML = ACHIEVEMENTS.map((a, i) => `<div class="${save.a & (1 << i) ? "got" : ""}"><b>${save.a & (1 << i) ? "★ " : ""}${a.name}</b>${a.text}</div>`).join("");
};

// ---------- Настройки ----------
RENDER.settings = () => {
  const o = save.o;
  const box = $("set-body");
  const tog = (key, name) => `<div class="set"><span>${name}</span><button class="toggle" data-t="${key}" aria-pressed="${!!o[key]}" aria-label="${name}"></button></div>`;
  const rng = (key, name, min, max, step) => `<div class="set"><span>${name}</span><input type="range" data-r="${key}" min="${min}" max="${max}" step="${step}" value="${o[key]}"></div>`;
  box.innerHTML =
    tog("snd", "Звук") + tog("mus", "Музыка") + rng("vol", "Громкость", 0, 1, 0.05) + rng("sens", "Чувствительность мыши", 0.2, 3, 0.05) + rng("tsens", "Чувствительность пальца", 0.2, 3, 0.05) +
    tog("af", "Автоогонь при наведении (телефон)") + tog("aa", "Помощь в прицеливании (телефон)") + tog("inv", "Инверсия по вертикали") + rng("fov", "Угол обзора", 60, 95, 1) +
    `<div class="set"><span>Качество графики</span><div class="seg" id="q-seg">${[["auto", "Авто"], ["high", "Высокое"], ["mid", "Среднее"], ["low", "Низкое"]].map(([k, n]) => `<button data-q="${k}" class="${o.q === k ? "on" : ""}">${n}</button>`).join("")}</div></div>` +
    `<div class="set"><span>Сейчас: ${QUALITY[view.tier].name}, ${Math.round(view.fps.avg)} кадров/с</span><span></span></div>` +
    `<div class="set"><span>Сбросить прогресс</span><button class="ghost" id="reset">Сбросить</button></div>` +
    `<div class="set"><span>Управление: WASD, мышь, ПКМ — прицел, Shift — шагом, C/Ctrl — присесть, R, G, F — нож, E — действие</span><span></span></div>`;
  box.onclick = (e) => {
    const t = e.target.closest("[data-t]");
    if (t) {
      o[t.dataset.t] = o[t.dataset.t] ? 0 : 1;
      Sound.set(!!o.snd);
      Sound.setMusic(!!o.mus);
      if (o.snd) Sound.unlock();
      store();
      Sound.click();
      RENDER.settings();
      paintTop();
    }
    const q = e.target.closest("[data-q]");
    if (q) {
      o.q = q.dataset.q;
      store();
      view.fixedQuality = o.q !== "auto";
      view.setTier(o.q === "auto" ? detectTier() : o.q, o.q !== "auto");
      if (o.q === "auto") {
        try {
          localStorage.removeItem("rubezh-tier");
        } catch {}
        view.setTier(detectTier(), false);
      }
      view.vistaOn = false;
      if (settingsFrom !== "pause") startVista();
      toast("Качество: " + QUALITY[view.tier].name + (settingsFrom === "pause" ? " (полностью — со следующего раунда)" : ""));
      RENDER.settings();
    }
    if (e.target.id === "reset") modal("Сбросить прогресс?", "Пропадут кредиты, оружие, звёзды и достижения. Настройки останутся.", () => {
      const keep = save.o;
      save = S.freshSave();
      save.o = keep;
      store();
      toast("Прогресс сброшен");
      paintTop();
    });
  };
  box.oninput = (e) => {
    const r = e.target.closest("[data-r]");
    if (!r) return;
    o[r.dataset.r] = Number(r.value);
    if (r.dataset.r === "vol") Sound.volume(o.vol);
    store();
  };
};
// из настроек паузы — назад в паузу
document.querySelectorAll("#settings [data-back]").forEach((b) =>
  b.addEventListener("click", (e) => {
    if (settingsFrom === "pause") {
      e.stopImmediatePropagation();
      settingsFrom = null;
      go("pause", false);
    }
  }, true),
);

// ---------- Помощь в прицеливании и автоогонь (телефон) ----------
function crosshairTarget(g, coneDeg) {
  const p = g.player;
  const ey = g.eye();
  const d = lookDir(p.yaw, p.pitch);
  const W = g.weapon();
  const maxR = W.melee ? 2.4 : W.range[1] * 1.2;
  const wall = g.world.ray(p.x, ey, p.z, d[0], d[1], d[2], maxR, "bullet");
  const hit = g.hitAgents(p.x, ey, p.z, d[0], d[1], d[2], wall ? wall.t : maxR, "robot");
  if (hit && !hit.agent.def.dummy) return { agent: hit.agent, exact: true };
  if (hit && hit.agent.def.dummy && hit.agent.training) return { agent: hit.agent, exact: true };
  // ближайший к прицелу робот в небольшом конусе
  let best = null, bs = coneDeg * DEG;
  for (const a of g.agents) {
    if (!a.alive || a.team !== "robot" || a.def.camera) continue;
    const ty = a.fly ? a.y : a.y + a.h * 0.6;
    const dx = a.x - p.x, dy = ty - ey, dz = a.z - p.z, L = Math.hypot(dx, dy, dz);
    if (L > maxR) continue;
    const yaw = Math.atan2(-dx, -dz), pitch = Math.asin(dy / L);
    const err = Math.hypot(wrap(yaw - p.yaw) * Math.cos(p.pitch), pitch - p.pitch);
    if (err < bs && g.world.sees(p.x, ey, p.z, a.x, ty, a.z, "bullet")) {
      bs = err;
      best = { agent: a, yaw, pitch, exact: false };
    }
  }
  return best;
}

// ---------- Игровой цикл ----------
let last = performance.now();
let acc = 0;
let photoShot = null;
let autoOn = false;
const DT = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.06, (now - last) / 1000);
  last = now;
  if (screen === "play" && game) {
    playFrame(real);
  } else if (view.scene && game && ["pause", "lost", "between", "loading"].includes(screen)) {
    view.render(real);
  } else if (view.vistaOn || screen === "boot") {
    if (view.scene) view.vistaFrame(real, photoShot);
  } else if (view.scene && game) view.render(real);
}
function playFrame(real) {
  const g = game;
  const dt = real * g.tickSlowmo(real) * speedK;
  acc += dt;
  const inp = input.read(acc >= DT);
  const p = g.player;
  // помощь прицеливанию на телефоне: медленнее у робота и мягкое притяжение при стрельбе
  let onTarget = false;
  if (p.alive && g.phase === "live") {
    const t = crosshairTarget(g, input.touchMode && save.o.aa ? 5 : 1.2);
    onTarget = !!(t && t.exact);
    input.assistK = t && input.touchMode && save.o.aa ? 0.55 : 1;
    if (t && !t.exact && input.touchMode && save.o.aa && (inp.fire || Math.abs(inp.lookDX) > 0)) {
      inp.lookDX += clamp(wrap(t.yaw - p.yaw), -0.012, 0.012);
      inp.lookDY += clamp(t.pitch - p.pitch, -0.008, 0.008);
    }
    if (input.touchMode && save.o.af && t && t.exact && !bot && !g.weapon().melee) inp.fire = true;
  }
  const look = { x: 0, y: 0 };
  if (!bot) {
    look.x = inp.lookDX;
    look.y = inp.lookDY;
    applyLook(g, look.x, look.y);
  }
  // фиксированный шаг правил; замедление на победе над боссом
  let n = 0;
  while (acc >= DT && n < 8 * speedK) {
    if (bot) {
      const controls = bot.input(DT);
      applyLook(g, controls.lookDX, controls.lookDY);
      look.x += controls.lookDX;
      look.y += controls.lookDY;
      g.step(DT, controls);
    } else {
      g.step(DT, n === 0 ? inp : { ...inp, reload: false, grenade: false, melee: false, jump: false, next: false, slot: null, last: false, kit: false, squad: false, gnext: false, lookDX: 0, lookDY: 0 });
    }
    acc -= DT;
    n++;
  }
  if (!bot && n > 0 && inp.gnext && g.player.grenades.length > 1) g.player.grenades.push(g.player.grenades.shift());
  view.frame(g, dt, real, look, { fov: save.o.fov });
  for (const e of g.events) hud.handle(g, e);
  g.events.length = 0;
  hud.update(g, real, { onTarget, touch: input.touchMode, heart: () => Sound.heart(), match: run.match, daily: run.mod });
  if (g.phase !== "live") {
    endT += real;
    if (endT > (g.phase === "won" ? 1.6 : 1.3)) {
      endT = 0;
      roundOver();
    }
  }
}

// ---------- Проверки (браузерные тесты) ----------
window.rubezh = {
  state: () => ({ screen, phase: game?.phase, reason: game?.reason, t: game?.t, kind: run?.kind, mission: run?.mission?.id, round: run?.round, credits: save.c, hp: game?.player.hp, weapon: game?.player.cur, weaponId: game ? game.weapon().id : null, mag: game ? game.player.ammo[game.player.cur].mag : null, nades: game?.player.grenades.length, left: game?.hostileLeft(), obj: game?.obj.text, fps: view.fps.avg, tier: view.tier, scale: view.scale, stars: S.totalStars(save), owned: save.w.slice(), touch: input.touchMode }),
  auto: (on = true) => {
    autoOn = on;
    bot = on && game ? new Autopilot(game, { seed: 3 }) : null;
  },
  speed: (k) => (speedK = k),
  start: (i, diff = 1, round = 0) => {
    if (i === "training") newRun("training", trainingMission(), 0);
    else newRun("campaign", MISSIONS[i], diff);
    save.diff = diff;
    run.round = round;
    startRound(true);
  },
  // поставить игрока в точку и повернуть (для снимков)
  place: (x, z, yaw, pitch = 0) => {
    const p = game.player;
    p.x = x;
    p.z = z;
    p.y = game.world.groundAt(x, z, 0.3, 50);
    p.yaw = yaw;
    p.pitch = pitch;
  },
  briefing: (i) => openBriefing(i),
  give: (n) => {
    save.c += n;
    store();
    paintTop();
  },
  finish: () => game && game.win(),
  audioState: () => (Sound.ctx ? Sound.ctx.state : "нет"),
  // кадр для карточки: камера в точке, оружие на витрине (null — обычный облёт меню)
  photo: (shot, gun = null) => {
    photoShot = shot;
    view.showcase = gun;
  },
  game: () => game,
  save: () => save,
  view,
  reset: () => {
    save = S.freshSave();
    store();
  },
};

// ---------- Запуск ----------
bootBar(0.6, "Прогреваем шейдеры…");
addEventListener("resize", () => view.resize());
startVista();
requestAnimationFrame(frame);
bootBar(1, "Готово");
setTimeout(() => {
  go("menu", false);
  host()?.bannerWhen?.(() => BANNER_SCREENS.has(screen) && !adBusy);
}, 250);
const BANNER_SCREENS = new Set(["menu", "campaign", "briefing", "arsenal", "debrief", "between", "skirmish", "daily", "profile", "settings"]);
void ROBOTS;
void TIMES;
void SECONDARY;
void GUNS;
