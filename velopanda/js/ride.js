// Заезд «Велопанды» без графики: велосипед едет сам, удержание поднимает переднее колесо.
// Шаг всегда 1/120 с. Проверяется tests/ride.mjs (критерии UW-1…UW-4 из ТЗ и проходимость трасс).
// x — путь вдоль трассы (м), y — высота. a — угол рамы от горизонта (рад): 0 — рама ровно, растёт — нос вверх.

export const STEP = 1 / 120;
// Все числа, которые настраивают ощущение, — в одном месте (ТЗ: «вынести в конфиг»)
export const CONFIG = {
  speed: 5.2, // м/с
  wheelbase: 1.1, // между осями
  wheel: 0.36, // радиус колеса
  lift: 4.4, // ускорение подъёма, рад/с² (пока палец держит — крутит педали)
  drop: 2.2, // палец отпущен — нос опускается (как притормозил)
  pop: 6, // рывок у земли: тянет руль на себя, нос отрывается сразу
  gravity: 3.0, // вес тянет нос вниз, пока центр тяжести впереди оси
  com: 0.3, // центр тяжести выше рамы: равновесие при угле ≈ 90° − 17°
  damp: 2.2, // гашение вращения
  tip: 1.62, // перевернулся назад, рад (≈ 93°)
  gate: 6, // стартовые ворота, м
};

// ---------- Профиль трассы ----------
// ground: точки [x, y]; между ними — плавный переход (косинус), чтобы не было изломов
export function makeGround(points) {
  return (x) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++)
      if (x <= points[i][0]) {
        const [x0, y0] = points[i - 1],
          [x1, y1] = points[i];
        const t = (x - x0) / (x1 - x0);
        return y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
      }
    return points.at(-1)[1];
  };
}

export class Ride {
  constructor(track, cfg = {}) {
    this.track = track;
    this.cfg = { ...CONFIG, ...(track.cfg || {}), ...cfg };
    this.g = makeGround(track.ground);
    this.x = 0;
    this.a = this.restAngle(0);
    this.w = 0;
    this.state = "start"; // start | ride | fail | done
    this.reason = null;
    this.best = 0; // самый длинный путь на заднем колесе за заезд (м)
    this.stars = new Set();
    this.events = [];
    this.t = 0;
    this.wheelieFrom = null;
    this.hold = false;
    this.front = true; // переднее колесо на земле
  }
  emit(e) {
    this.events.push(e);
  }
  // Угол, при котором оба колеса на земле (хорда профиля под велосипедом)
  restAngle(x) {
    const L = this.cfg.wheelbase;
    return Math.atan2(this.g(x + L) - this.g(x), L);
  }
  slope(x) {
    return Math.atan2(this.g(x + 0.05) - this.g(x - 0.05), 0.1);
  }
  // Точка переднего колеса (центр)
  frontWheel() {
    const { wheelbase: L, wheel: r } = this.cfg;
    const y = this.g(this.x) + r;
    return [this.x + L * Math.cos(this.a), y + L * Math.sin(this.a)];
  }
  // hold — держит ли палец прямо сейчас (читается на каждом шаге)
  step(hold) {
    const c = this.cfg,
      dt = STEP;
    this.hold = !!hold;
    if (this.state === "fail" || this.state === "done") return;
    // UW-1: на старте (и в тренировке после касания) ждёт, пока не нажмут
    if (this.state === "wait") {
      if (!hold) return;
      this.state = "ride";
      this.emit({ type: "resume" });
    }
    if (this.state === "start") {
      if (!hold) return;
      this.state = "ride";
      this.emit({ type: "go" });
    }
    this.t += dt;
    // Вращение рамы вокруг задней оси
    const rest = this.restAngle(this.x);
    const low = Math.max(0, 1 - (this.a - rest) / 0.4);
    let alpha = (hold ? c.lift + c.pop * low : -c.drop) - c.gravity * Math.cos(this.a + c.com) - c.damp * this.w;
    this.w += alpha * dt;
    this.a += this.w * dt;
    // Едет вперёд
    const prevX = this.x;
    this.x += c.speed * dt * Math.cos(this.slope(this.x));
    const newRest = this.restAngle(this.x);
    // Переднее колесо упирается в землю: нос не ниже земли
    const wasFront = this.front;
    if (this.a <= newRest) {
      this.a = newRest;
      if (this.w < 0) this.w = 0;
      this.front = true;
    } else this.front = this.a - newRest < 0.01;
    void prevX;
    // На заднем колесе: считаем путь
    if (!this.front && wasFront) {
      this.wheelieFrom = this.x;
      this.emit({ type: "up" });
    }
    if (!this.front && this.wheelieFrom !== null) this.best = Math.max(this.best, this.x - Math.max(this.wheelieFrom, c.gate));
    // После ворот касание передним колесом — конец попытки (один раз)
    if (this.front && this.x > c.gate) {
      if (this.track.training) {
        // Тренировка: не проигрыш — велосипед останавливается и ждёт, игра показывает жест
        if (this.state !== "wait") this.emit({ type: "train" });
        this.state = "wait";
        this.x = prevX;
        return;
      }
      return this.fail("front");
    }
    if (this.x > c.gate && this.lastGate !== true) {
      this.lastGate = true;
      this.emit({ type: "gate" });
    }
    if (this.a - this.slope(this.x) > c.tip) {
      // В тренировке переворот тоже не проигрыш: велосипед мягко опускается и ждёт
      if (this.track.training) {
        this.a = this.restAngle(this.x);
        this.w = 0;
        this.state = "wait";
        this.emit({ type: "train", why: "back" });
        return;
      }
      return this.fail("back");
    }
    // Звёздочки: ловит переднее колесо или голова панды
    const fw = this.frontWheel();
    (this.track.stars || []).forEach((s, i) => {
      if (this.stars.has(i)) return;
      if (Math.hypot(s[0] - fw[0], s[1] - fw[1]) < 0.36) {
        this.stars.add(i);
        this.emit({ type: "star", i });
      }
    });
    // Предупреждения: почти касается или почти опрокинулся
    const rel = this.a - newRest;
    const warn = this.x > c.gate && (rel < 0.12 ? "low" : this.a - this.slope(this.x) > c.tip - 0.22 ? "high" : null);
    if (warn && warn !== this.warned) this.emit({ type: "warn", kind: warn });
    this.warned = warn;
    if (this.x >= this.track.length) {
      this.state = "done";
      this.emit({ type: "done" });
    }
  }
  fail(reason) {
    if (this.state === "fail") return;
    this.state = "fail";
    this.reason = reason;
    this.emit({ type: "fail", reason, x: this.x });
  }
  // Пройдено после ворот (то, что показываем как метры)
  meters() {
    return Math.max(0, this.x - this.cfg.gate);
  }
}

// ---------- Автопилот для проверок: держит нужный угол ----------
// target(x) — желаемый угол (рад) над горизонтом на этом месте
export function autopilot(ride, target) {
  // Угол считаем от дороги: в горку и с горки «низко» и «высоко» значат одно и то же
  const want = target(ride.x);
  const rel = ride.a - ride.restAngle(ride.x) + ride.w * 0.28;
  return rel < want;
}

// Прогнать трассу автопилотом: результат и путь переднего колеса
export function simulate(track, target, maxSeconds = 90) {
  const r = new Ride(track);
  const path = [];
  for (let i = 0; i < maxSeconds / STEP && r.state !== "fail" && r.state !== "done"; i++) {
    r.step(autopilot(r, target));
    if (i % 6 === 0) path.push({ x: r.x, fw: r.frontWheel(), a: r.a });
    r.events.length = 0;
  }
  return { ride: r, path };
}
