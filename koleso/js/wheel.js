// Логика «Колеса огоньков» без графики: колесо обозрения вращается по программе скоростей,
// енотик снизу бросает огонёк, через 0,18 с огонёк садится на обод в самой нижней точке.
// Если рядом (ближе минимального зазора) уже горит огонёк — встреча: показываем место,
// огонёк возвращается в корзину. Проверяется tests/wheel.mjs (критерии HK-1…HK-4 из ТЗ).
// Углы в градусах, против часовой стрелки от направления «вправо»; 270° — низ колеса.

export const FLIGHT = 0.18; // полёт огонька, с
export const CONTACT = 270; // где огонёк встречает обод (в мире) — внизу
export const BUMP = 1.1; // после встречи: столько показываем место, потом снова можно бросать
export const GAP = { small: 18, big: 14 }; // наименьшее расстояние между огоньками на ободе, градусы
export const RADIUS = { small: 2.5, big: 3.3 }; // радиус обода в мире (для картинки и камеры)

export const norm = (a) => ((a % 360) + 360) % 360;
// Расстояние по кратчайшей дуге: 359° и 1° — соседи (2°)
export const arc = (a, b) => {
  const d = Math.abs(norm(a) - norm(b));
  return Math.min(d, 360 - d);
};

// Программа вращения: отрезки { d: секунд, w: градусов в секунду }, повторяются по кругу.
// Угол — точный интеграл, поэтому посадка считается по настоящему углу колеса в момент касания.
export function program(level) {
  const segs = level.segs;
  const period = segs.reduce((s, q) => s + q.d, 0);
  const perLoop = segs.reduce((s, q) => s + q.d * q.w, 0);
  const find = (t) => {
    const loops = Math.floor(t / period);
    let r = t - loops * period,
      acc = loops * perLoop,
      i = 0;
    for (; i < segs.length; i++) {
      if (r < segs[i].d || i === segs.length - 1) break;
      r -= segs[i].d;
      acc += segs[i].d * segs[i].w;
    }
    return { i, r, acc, loops };
  };
  return {
    period,
    theta(t) {
      const { i, r, acc } = find(Math.max(0, t));
      return level.a0 + acc + r * segs[i].w;
    },
    omega(t) {
      return segs[find(Math.max(0, t)).i].w;
    },
    // Через сколько секунд колесо поменяет направление и куда будет крутиться
    nextTurn(t) {
      const { i, r } = find(Math.max(0, t));
      const w = segs[i].w;
      let ahead = segs[i].d - r;
      for (let k = 1; k <= segs.length; k++) {
        const q = segs[(i + k) % segs.length];
        if (Math.sign(q.w) !== Math.sign(w) && q.w !== 0) return { in: ahead, dir: Math.sign(q.w) };
        ahead += q.d;
      }
      return null;
    },
  };
}

export class Wheel {
  constructor(level) {
    this.level = level;
    this.gap = level.gap ?? GAP[level.size];
    this.prog = program(level);
    this.lamps = (level.preset || []).map((a) => ({ a: norm(a), preset: true }));
    this.balloons = (level.balloons || []).map((a, k) => ({ a: norm(a), k, popped: false }));
    this.left = level.supply;
    this.t = 0;
    this.flying = null;
    this.state = "play"; // play | bump | done
    this.bumps = 0;
    this.events = [];
  }
  emit(e) {
    this.events.push(e);
  }
  theta(t = this.t) {
    return this.prog.theta(t);
  }
  // Куда на колесе сядет огонёк, если бросить сейчас
  predict(t = this.t) {
    return norm(CONTACT - this.theta(t + FLIGHT));
  }
  blocker(local) {
    return this.lamps.find((l) => arc(l.a, local) < this.gap - 1e-9) || null;
  }
  // Нажатие: один огонёк в полёте; пока летит или показываем встречу — нажатия не считаются
  press() {
    if (this.state !== "play" || this.flying || this.left <= 0) return false;
    this.flying = { t0: this.t, land: this.t + FLIGHT };
    this.emit({ type: "launch", t: this.t });
    return true;
  }
  advance(dt) {
    const t1 = this.t + dt;
    if (this.flying && this.flying.land <= t1 + 1e-12) {
      this.t = this.flying.land;
      this.land();
    }
    if (this.state === "bump" && this.bumpUntil <= t1) {
      this.state = "play";
      this.emit({ type: "ready" });
    }
    this.t = Math.max(this.t, t1);
  }
  land() {
    this.flying = null;
    const local = norm(CONTACT - this.theta());
    const hit = this.blocker(local);
    if (hit) {
      this.bumps++;
      this.state = "bump";
      this.bumpUntil = this.t + BUMP;
      this.emit({ type: "bump", at: local, with: hit });
      return;
    }
    const lamp = { a: local, preset: false, n: this.level.supply - this.left };
    this.lamps.push(lamp);
    this.left--;
    this.emit({ type: "land", at: local, lamp, left: this.left });
    for (const b of this.balloons)
      if (!b.popped && arc(b.a, local) <= this.gap * 0.6) {
        b.popped = true;
        this.emit({ type: "pop", b });
      }
    if (this.left === 0) {
      this.state = "done";
      this.emit({ type: "done", bumps: this.bumps, popped: this.balloons.filter((b) => b.popped).length });
    }
  }
}

// ---------- Проверка уровня ----------
// Сколько новых огоньков влезет между готовыми (при самой плотной расстановке)
export function capacity(level) {
  const g = level.gap ?? GAP[level.size];
  const pre = (level.preset || []).map(norm).sort((a, b) => a - b);
  if (!pre.length) return Math.floor(360 / g + 1e-9);
  let n = 0;
  for (let i = 0; i < pre.length; i++) {
    const L = i + 1 < pre.length ? pre[i + 1] - pre[i] : 360 - pre[i] + pre[0];
    n += Math.max(0, Math.floor(L / g + 1e-9) - 1);
  }
  return n;
}
// Уровень годится: готовые огоньки не теснятся, всё влезает, тупика нет даже при неудачной расстановке
// (каждый огонёк закрывает не больше 2·зазора обода), шарики можно лопнуть, повороты предупреждаются
export function validate(level) {
  const g = level.gap ?? GAP[level.size];
  const pre = level.preset || [];
  const problems = [];
  for (let i = 0; i < pre.length; i++) for (let j = i + 1; j < pre.length; j++) if (arc(pre[i], pre[j]) < g - 1e-9) problems.push(`готовые огоньки ${pre[i]}° и ${pre[j]}° ближе ${g}°`);
  if (capacity(level) < level.supply) problems.push(`влезает ${capacity(level)}, а нужно ${level.supply}`);
  if ((pre.length + level.supply - 1) * 2 * g > 360 - 10) problems.push(`возможен тупик: ${pre.length}+${level.supply} огоньков по ${g}°`);
  for (const b of level.balloons || []) if (pre.some((p) => arc(p, b) < g)) problems.push(`шарик ${b}° у самого огонька — не лопнуть`);
  if (level.segs.some((q) => Math.abs(q.w) > 100)) problems.push("слишком быстро");
  const wait = maxWait(level);
  if (wait > 14) problems.push(`некоторые места обода ждать ${wait.toFixed(1)} с`);
  return problems;
}
// Самое долгое ожидание, пока нужное место обода подъедет к точке посадки (при любом моменте начала)
export function maxWait(level, step = 1 / 60) {
  const p = program(level);
  let worst = 0;
  for (let a = 0; a < 360; a += 5)
    for (let t0 = 0; t0 < p.period; t0 += 0.5) {
      let prev = null,
        found = 30;
      for (let t = t0; t < t0 + 30; t += step) {
        const d = ((norm(CONTACT - p.theta(t) - a) + 180) % 360) - 180;
        if (Math.abs(d) < 1 || (prev !== null && Math.sign(d) !== Math.sign(prev) && Math.abs(d - prev) < 90)) {
          found = t - t0;
          break;
        }
        prev = d;
      }
      worst = Math.max(worst, found);
    }
  return worst;
}

// ---------- Автопилот (для проверки и для конструктора уровней) ----------
// Целится в шарики, потом в середину самого большого свободного места; бросает, когда
// предсказанная точка посадки подъезжает к цели. jitter — разброс момента нажатия, с (как у ребёнка).
export function autopilot(level, { jitter = 0, seed = 1, step = 1 / 240, limit = 240 } = {}) {
  const w = new Wheel(level);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const minWin = [];
  let target = null,
    delay = 0,
    armed = null;
  const free = (a) => !w.blocker(a);
  // Свободный промежуток посадки вокруг угла (в градусах)
  const span = (a) => {
    if (!free(a)) return 0;
    let lo = 0,
      hi = 0;
    while (lo < 180 && free(a - lo - 0.5)) lo += 0.5;
    while (hi < 180 && free(a + hi + 0.5)) hi += 0.5;
    return lo + hi;
  };
  const pickTarget = () => {
    const balloon = w.balloons.find((b) => !b.popped && free(b.a));
    if (balloon) return balloon.a;
    let best = null;
    for (let a = 0; a < 360; a += 1) {
      const sp = span(a);
      if (sp > 0 && (!best || sp > best.sp)) best = { a, sp };
    }
    if (!best) return null;
    // Середина этого промежутка
    let lo = best.a;
    while (free(lo - 0.5) && best.a - lo < 180) lo -= 0.5;
    return norm(lo + best.sp / 2);
  };
  while (w.state !== "done" && w.t < limit) {
    if (w.state === "play" && !w.flying) {
      if (target === null || !free(target)) target = pickTarget();
      if (target !== null && armed === null && arc(w.predict(), target) < 0.8) {
        // Ребёнок нажимает чуть раньше или позже
        armed = w.t + Math.max(0, delay + rnd() * jitter);
        const om = Math.abs(w.prog.omega(w.t + FLIGHT)) || 1;
        minWin.push(span(target) / om);
      }
      if (armed !== null && w.t >= armed) {
        w.press();
        armed = null;
        target = null;
      }
    }
    w.advance(step);
    w.events.length = 0;
  }
  return { done: w.state === "done", t: w.t, bumps: w.bumps, popped: w.balloons.filter((b) => b.popped).length, minWindow: Math.min(...minWin), wheel: w };
}
