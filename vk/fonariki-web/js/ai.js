// Помощники (вместо других игроков сетевой версии) и автопилот игрока для проверок.
// Помощник ловит светлячков рядом с лагерем, носит их к костру, убегает от теней, размораживает
// застывших и идёт с фонарём на Большую тень. Возвращает «куда бежать» и «жать ли кнопку».
import { CAMP, DEPOSIT_RADIUS, THAW_REACH, CATCH_DISTANCE, GARDEN, NIGHT_SECONDS, PLACES, SHRINE_REACH, SHRINES, BOSS, FOOD, TAU } from "./config.js?v=6e619b94";
import { slots } from "./save.js?v=6e619b94";

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const toward = (from, to, k = 1) => {
  const dx = to.x - from.x, dz = to.z - from.z;
  const l = Math.hypot(dx, dz) || 1;
  return { mx: (dx / l) * k, mz: (dz / l) * k };
};
const stay = { mx: 0, mz: 0, act: false, press: false };

// застрял у дерева — шаг вбок
function unstick(a, out, dt) {
  const ai = a.ai;
  const want = Math.hypot(out.mx, out.mz);
  const moved = Math.hypot(a.vx, a.vz);
  ai.stuck = want > 0.5 && moved < a.speed * 0.25 ? (ai.stuck || 0) + dt : 0;
  if (ai.stuck > 0.4) {
    ai.side = (ai.side || 1) * -1;
    ai.sideT = 0.7;
    ai.stuck = 0;
  }
  if (ai.sideT > 0) {
    ai.sideT -= dt;
    const s = ai.side;
    return { ...out, mx: out.mx * 0.3 - out.mz * s, mz: out.mz * 0.3 + out.mx * s };
  }
  return out;
}

// ближайшая тень, которая гонится за мной (или опасно близко в темноте)
function threat(run, a) {
  let best = null, bd = Infinity;
  for (const s of run.shadows) {
    const d = dist(s, a);
    const danger = s.target === a ? 32 : s.kind === "imp" && !a.jar.length ? 0 : 16;
    if (d < danger && d < bd) (best = s), (bd = d);
  }
  return best;
}

// у края света караулит тень — не выходить из круга, пока она рядом
function lurker(run, a) {
  const r = Math.hypot(a.x, a.z);
  // костёр почти погас — ждать нельзя, идём, даже если страшно
  if (r > run.radius + 4 || run.light < 30) return false;
  for (const s of run.shadows) if (dist(s, a) < 13 + (s.kind === "brute" ? 4 : 0)) return true;
  return false;
}
function hide(run, a) {
  const r = Math.hypot(a.x, a.z);
  if (r < run.radius - 4) return stay;
  return { mx: -a.x / r, mz: -a.z / r, act: false, press: false };
}

// куда бежать от тени: от неё и к лагерю
function flee(run, a, s) {
  const away = toward(s, a);
  const home = toward(a, CAMP);
  const mx = away.mx * 0.55 + home.mx * 0.75, mz = away.mz * 0.55 + home.mz * 0.75;
  return { mx, mz, act: false, press: false };
}

// расстояние от точки до отрезка (путь к светлячку не должен идти мимо тени)
function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - a.x - dx * k, p.z - a.z - dz * k);
}

// выбор светлячка: близко ко мне, не слишком далеко от лагеря, не у теней, не занятый другим
function pickFirefly(run, a, maxCamp) {
  let best = null, score = Infinity;
  const taken = new Set(run.crew.filter((c) => c !== a && c.ai.target).map((c) => c.ai.target));
  if (!a.isPlayer && run.player.ai?.target) taken.add(run.player.ai.target);
  for (const w of run.wild) {
    if (taken.has(w)) continue;
    const dc = Math.hypot(w.hx, w.hz);
    if (dc > maxCamp) continue;
    let risky = false;
    for (const s of run.shadows) if (dist(s, w) < (s.target ? 26 : 30) || segDist(s, a, w) < 13) risky = true;
    if (run.boss && dist(run.boss, w) < 30) risky = true;
    const value = w.rec.m !== "none" || w.rec.k === "moon" || w.rec.k === "star" ? 25 : 0;
    const sc = dist(a, w) + dc * 0.35 + (risky ? 80 : 0) - value;
    if (sc < score) (score = sc), (best = w);
  }
  return best;
}

export function crewThink(run, c, dt) {
  const ai = c.ai;
  if (c.frozen) return stay;
  // Большая тень: все с фонарями к ней, когда она подходит к свету (раньше незачем бросать костёр)
  if (run.boss && Math.hypot(run.boss.x, run.boss.z) < run.radius + 45) {
    const b = run.boss;
    const a = (c.index / Math.max(1, run.crewN)) * TAU + run.time * 0.2;
    const spot = { x: b.x + Math.cos(a) * 8, z: b.z + Math.sin(a) * 8 };
    ai.mode = "boss";
    if (dist(c, spot) > 2) return unstick(c, { ...toward(c, spot), act: false }, dt);
    return stay;
  }
  // застывший друг рядом — бежать размораживать
  let frozen = null, fd = 75;
  for (const p of run.people) {
    if (p !== c && p.frozen && p.frozen < p.frozenTotal - 0.6) {
      const d = dist(p, c);
      if (d < fd) (frozen = p), (fd = d);
    }
  }
  if (frozen) {
    ai.mode = "rescue";
    if (fd > THAW_REACH - 3) return unstick(c, { ...toward(c, frozen), act: false }, dt);
    return { mx: 0, mz: 0, act: true, press: false };
  }
  // тень гонится — бежать к свету
  const s = threat(run, c);
  if (s && run.inDark(c)) {
    ai.mode = "flee";
    return unstick(c, flee(run, c, s), dt);
  }

  const endSoon = run.phase === "night" && run.t > NIGHT_SECONDS - 7;
  // костёр слабеет — несём что есть; поздней ночью не бродим с полупустой банкой
  const need = run.light < 55 || endSoon || run.phase === "break" || (run.night >= 3 && c.jar.length >= 2 && run.light < 75);
  if (c.jar.length >= c.jarMax || (c.jar.length && need)) {
    ai.target = null;
    ai.mode = "home";
    if (Math.hypot(c.x - CAMP.x, c.z - CAMP.z) > DEPOSIT_RADIUS - 1.5) return unstick(c, { ...toward(c, CAMP), act: false }, dt);
    return stay;
  }
  if (lurker(run, c)) {
    ai.mode = "hide";
    return hide(run, c);
  }
  // охота
  ai.mode = "hunt";
  ai.retarget = (ai.retarget || 0) - dt;
  if (!ai.target || !run.wild.includes(ai.target) || ai.retarget <= 0) {
    ai.target = pickFirefly(run, c, run.phase === "night" ? 120 + run.night * 6 : 140);
    ai.retarget = 1.6;
  }
  const w = ai.target;
  if (!w) return unstick(c, { ...toward(c, { x: Math.cos(c.index * 2) * 40, z: Math.sin(c.index * 2) * 40 }, 0.6), act: false }, dt);
  const d = dist(c, w);
  if (d > 4.5) return unstick(c, { ...toward(c, w), act: false }, dt);
  return { mx: 0, mz: 0, act: true, press: false };
}

// Автопилот игрока («осторожный бот»): жарит зефир в сумерках, кормит костёр, когда свет слабеет,
// иначе несёт в сад; размораживает помощников, убегает от теней, бьёт Большую тень фонарём.
// opts.garden — носить ли в сад, opts.shrines — покупать ли усиления по пути.
export function autopilot(run, dt, opts = {}) {
  const p = run.player;
  const ai = p.ai;
  const press = (ctxKind) => {
    const c = run.context(p);
    return c && c.kind === ctxKind;
  };
  if (p.frozen || run.over) return stay;
  // зефир в сумерках и в передышках
  if ((run.phase === "dusk0" || run.phase === "break") && p.snacks < FOOD.max && run.time < (ai.cookUntil ?? 1e9)) {
    if (Math.hypot(p.x, p.z) > FOOD.reach - 4) return unstick(p, { ...toward(p, CAMP), act: false }, dt);
    if (press("cook")) return { mx: 0, mz: 0, act: true, press: false };
  }
  if (run.boss && Math.hypot(run.boss.x, run.boss.z) < run.radius + 45) {
    const b = run.boss;
    if (dist(p, b) > BOSS.reach - 5) return unstick(p, { ...toward(p, b), act: false }, dt);
    return stay;
  }
  // застывший помощник — к нему
  let frozen = null, fd = 90;
  for (const c of run.crew) {
    if (c.frozen) {
      const d = dist(p, c);
      if (d < fd) (frozen = c), (fd = d);
    }
  }
  if (frozen) {
    if (fd > THAW_REACH - 3) return unstick(p, { ...toward(p, frozen), act: false }, dt);
    return { mx: 0, mz: 0, act: true, press: false };
  }
  const s = threat(run, p);
  if (s && run.inDark(p) && !(p.snacks > 0 && s.kind !== "imp")) return unstick(p, flee(run, p, s), dt);

  // усиление по пути (дрова и кристалл — самые полезные)
  if (opts.shrines) {
    for (const pl of PLACES) {
      const def = SHRINES[pl.id];
      const near = Math.hypot(p.x - pl.shrineX, p.z - pl.shrineZ);
      if (near < 30 && !(run.shrineRest[pl.id] > 0) && run.save.coins > def.cost + 60 && (def.buff === "wood" || def.buff === "double" || def.buff === "luck")) {
        if (near > SHRINE_REACH - 3) return unstick(p, { ...toward(p, { x: pl.shrineX, z: pl.shrineZ }), act: false }, dt);
        if (press("shrine")) return { mx: 0, mz: 0, act: true, press: false };
      }
    }
  }

  const endSoon = run.phase === "night" && run.t > NIGHT_SECONDS - 8;
  const full = p.jar.length >= p.jarMax;
  const lowLight = run.light < 50 || endSoon || (run.night >= 3 && p.jar.length >= 2 && run.light < 70);
  const useGarden = opts.garden !== false && slots(run.save) > 0 && run.light > 62 && !endSoon;
  if (full || (p.jar.length && (lowLight || run.phase === "break"))) {
    ai.target = null;
    const goal = useGarden && !lowLight ? { x: GARDEN.x, z: GARDEN.z } : CAMP;
    const r = goal === CAMP ? DEPOSIT_RADIUS - 1.5 : GARDEN.enterRadius - 1.5;
    if (dist(p, goal) > r) return unstick(p, { ...toward(p, goal), act: false }, dt);
    return stay;
  }
  // тени караулят у края, а зефира нет — к костру жарить зефир (с ним можно выходить)
  if (lurker(run, p) && !(p.snacks > 0)) ai.cooking = true;
  if (ai.cooking) {
    if (p.snacks >= FOOD.max || run.light < 30) ai.cooking = false;
    else {
      if (Math.hypot(p.x, p.z) > FOOD.reach - 4) return unstick(p, { ...toward(p, CAMP), act: false }, dt);
      return { mx: 0, mz: 0, act: press("cook"), press: false };
    }
  }
  ai.retarget = (ai.retarget || 0) - dt;
  if (!ai.target || !run.wild.includes(ai.target) || ai.retarget <= 0) {
    ai.target = pickFirefly(run, p, run.light > 55 ? 175 : 115);
    ai.retarget = 1.2;
  }
  const w = ai.target;
  if (!w) return stay;
  const d = dist(p, w);
  if (d > CATCH_DISTANCE * 0.55) return unstick(p, { ...toward(p, w), act: false }, dt);
  return { mx: 0, mz: 0, act: true, press: true };
}
