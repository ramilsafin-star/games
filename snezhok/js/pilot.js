// Робот-водитель: им проверяется проходимость уровней (Node), он же — автопилот для проверок
// в браузере. Видит то же, что игрок: ворота, сугробы и препятствия впереди. Умение задаётся
// временем реакции, дальностью взгляда, дрожью руки, вниманием к препятствиям и тем,
// насколько он думает у ворот.
import { HALF, LATERAL, GRAVITY, BRIDGE_HALF, radiusOf, applyGate, touches, rng, clamp } from "./rules.js?v=bd3554ee";

export const SKILLS = {
  // внимательный игрок: выбирает лучшие ворота, объезжает почти всё
  good: { think: 0.1, look: 1.15, noise: 0.15, smart: 1, avoid: 1, greed: 1, wander: 0 },
  // новичок: реагирует медленнее, иногда ошибается воротами и не замечает препятствие
  novice: { think: 0.2, look: 0.95, noise: 0.4, smart: 0.8, avoid: 0.72, greed: 0.5, wander: 0.4 },
  // небрежный: ворота почти наугад, замечает лишь часть препятствий, рука гуляет
  careless: { think: 0.32, look: 0.75, noise: 0.75, smart: 0.4, avoid: 0.35, greed: 0.15, wander: 1.4 },
};
const HAZARD = new Set(["rock", "fence", "spikes", "log", "hole", "crusher", "geyser"]);
const STEP = 0.04;

function extentS(it) {
  if (it.r) return [it.s - it.r, it.s + it.r];
  return [it.s - (it.len || 1) / 2, it.s + (it.len || 1) / 2];
}

export function makePilot(level, kind = "good", seed = 1) {
  const sk = SKILLS[kind];
  const rnd = rng(seed * 2654435761 + 17);
  const choice = new Map(); // решение по воротам: s ворот → номер створки
  const noticed = new Map(); // заметил ли робот препятствие
  let timer = 0;
  let target = 0;
  let wander = 0;
  let wanderTimer = 0;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 0.82;

  function nextGate(run) {
    for (const g of level.gates) if (g.s > run.s) return g;
    return null;
  }
  function pickPanel(g, run) {
    if (choice.has(g.s)) return choice.get(g.s);
    let k = 0;
    if (rnd() < sk.smart) {
      let bestValue = -1;
      g.panels.forEach((p, i) => {
        const value = applyGate(p.op, run.size);
        if (value > bestValue) (bestValue = value), (k = i);
      });
    } else k = Math.floor(rnd() * g.panels.length);
    choice.set(g.s, k);
    return k;
  }

  // Сколько «стоит» поехать к cx: удары взвешены по времени — ближний хуже дальнего,
  // поэтому робот сначала проходит ближнюю преграду и только потом думает о следующей.
  function cost(run, cx, hazards, ramps, r, lim, horizon, bridge) {
    let x = run.x;
    let vx = run.vx;
    let total = 0;
    const hit = new Set();
    const v = Math.max(1, run.v);
    let air = run.air;
    let y = run.y;
    let vy = run.vy;
    const goal = clamp(cx, -lim, lim);
    for (let t = STEP; t <= horizon; t += STEP) {
      const want = clamp((goal - x) * 11, -LATERAL, LATERAL);
      vx += (want - vx) * Math.min(1, STEP * 18);
      x = clamp(x + vx * STEP, -lim, lim);
      const ss = run.s + v * t;
      if (air) {
        vy -= GRAVITY * STEP;
        y += vy * STEP;
        if (y <= 0) (y = 0), (air = false);
      } else {
        for (const rp of ramps) {
          if (ss - v * STEP < rp.s && ss >= rp.s && x > rp.x0 - 0.2 && x < rp.x1 + 0.2) {
            air = true;
            vy = 10.5;
          }
        }
      }
      const weight = 1.7 - t / horizon;
      for (const it of hazards) {
        if (hit.has(it)) continue;
        const [a, b] = extentS(it);
        if (ss < a - r - 0.3 || ss > b + r + 0.3) continue;
        if (touches(it, ss, x, y, r, ss / level.speed)) {
          hit.add(it);
          total += (it.t === "hole" || it.t === "crusher" || it.t === "geyser" ? 14 : 10) * weight;
        }
      }
      if (bridge && !air && ss >= bridge.s0 - 0.5 && ss <= bridge.s1 && Math.abs(x) > BRIDGE_HALF - 0.35) {
        total += 80 * weight;
        break;
      }
    }
    return total;
  }

  function plan(run) {
    const r = radiusOf(run.size);
    const lim = HALF - r;
    const v = Math.max(1, run.v);
    const horizon = sk.look;
    const g = nextGate(run);
    let desired = run.x;
    if (g) {
      const p = g.panels[pickPanel(g, run)];
      const pad = Math.min(1.2, (p.x1 - p.x0) / 3);
      desired = clamp((p.x0 + p.x1) / 2, p.x0 + pad, p.x1 - pad);
    }
    // жадность: сугробы впереди, если до ворот ещё далеко
    if (sk.greed > 0 && (!g || g.s - run.s > 20)) {
      for (let i = run.lo; i < level.items.length; i++) {
        const it = level.items[i];
        if (it.s < run.s + 2) continue;
        if (it.s > run.s + 24) break;
        if (it.t === "pile" && !run.used[i]) {
          if (rnd() < sk.greed) desired = it.x;
          break;
        }
      }
    }
    if (sk.wander) {
      wanderTimer -= sk.think;
      if (wanderTimer <= 0) {
        wanderTimer = 0.6 + rnd() * 1.4;
        wander = (rnd() * 2 - 1) * sk.wander;
      }
      desired += wander;
    }
    const reach = run.s + horizon * v + 3;
    const bridge = level.bridges.find((b) => b.s1 > run.s && b.s0 < reach) || null;
    if (bridge) desired = clamp(desired, -(BRIDGE_HALF - 1), BRIDGE_HALF - 1);

    const hazards = [];
    const ramps = [];
    for (let i = run.lo; i < level.items.length; i++) {
      const it = level.items[i];
      if (it.s > reach) break;
      if (it.s < run.s - 4 || run.used[i]) continue;
      if (it.t === "ramp") ramps.push(it);
      else if (HAZARD.has(it.t)) {
        if (sk.avoid < 1) {
          if (!noticed.has(it)) noticed.set(it, rnd() < sk.avoid);
          if (!noticed.get(it)) continue;
        }
        hazards.push(it);
      }
    }
    let best = clamp(desired, -lim, lim);
    if (hazards.length || bridge) {
      let bestCost = Infinity;
      const consider = (cx) => {
        cx = clamp(cx, -lim, lim);
        const c = cost(run, cx, hazards, ramps, r, lim, horizon, bridge) + Math.abs(cx - desired) * 0.35 + Math.abs(cx - run.x) * 0.05;
        if (c < bestCost) (bestCost = c), (best = cx);
      };
      consider(desired);
      consider(run.x);
      for (let cx = -lim; cx <= lim + 0.01; cx += 0.5) consider(cx);
    }
    return clamp(best + gauss() * sk.noise, -lim, lim);
  }

  return function steer(run, dt) {
    timer -= dt;
    if (timer <= 0) {
      timer = sk.think * (0.75 + rnd() * 0.5);
      target = plan(run);
    }
    return { target };
  };
}

// Прогон одного уровня роботом. Run передаётся снаружи (opts.Run), чтобы не было круговых
// зависимостей. Возвращает итог заезда.
export function drive(level, kind, seed, opts = {}, dt = 1 / 60) {
  const run = new opts.Run(level, opts);
  const pilot = makePilot(level, kind, seed);
  run.begin();
  let t = 0;
  let continues = 0;
  while (t < 600) {
    run.step(dt, pilot(run, dt));
    run.events.length = 0;
    t += dt;
    if (run.mode === "won") break;
    if (run.mode === "fail") {
      if (opts.continues && continues < opts.continues && run.continueRun()) {
        continues++;
        continue;
      }
      break;
    }
  }
  return { won: run.mode === "won", reason: run.failReason, mult: run.mult, size: run.size, coins: run.coins, hits: run.hits, time: t, peak: run.peak, finaleSize: run.finaleSize, continues, run };
}
