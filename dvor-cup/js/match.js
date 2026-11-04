// Матч «Дворового кубка» без графики: поле сбоку, мяч, двое игроков, ворота с перекладинами, удары,
// звёздный удар, таймер, голы, розыгрыш с центра. Шаг всегда 1/120 с. Проверяется tests/match.mjs (HS-1…HS-4).
// Координаты: x — вдоль поля (−10…10), y — вверх от газона. Игрок 0 — слева (бьёт вправо), 1 — справа.

export const STEP = 1 / 120;
export const FIELD = { half: 10, line: 8.4, bar: 3.8, barT: 0.16, ceil: 11 };
export const BALL_R = 0.5;
const G = 19,
  PG = 26,
  RUN = 7,
  JUMP = 11,
  BALL_MAX = 24;
// Футболисты нарисованы в 1,25 раза крупнее модели — размеры тела под картинку
export const HEAD = { y: 2.02, r: 0.78 },
  BODY = { y: 0.78, r: 0.62 },
  FOOT = { dx: 0.78, y: 0.4, r: 0.7 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const KICKS = {
  low: { vx: 13.5, vy: 4.2 },
  lob: { vx: 8.2, vy: 12.6 },
  star: { vx: 22, vy: 3.2 },
};

function newPlayer(side) {
  return { side, face: side ? -1 : 1, x: side ? 5.2 : -5.2, y: 0, vx: 0, vy: 0, kick: 0, kickType: "low", hit: false, cool: 0, star: 0, stun: 0, onGround: true, jumpHeld: false, kickHeld: false };
}

export class Match {
  // seconds — длина матча; golden — если ничья, играть до золотого гола
  constructor({ seconds = 60, golden = false } = {}) {
    this.score = [0, 0];
    this.time = seconds;
    this.golden = golden;
    this.overtime = false;
    this.players = [newPlayer(0), newPlayer(1)];
    this.ball = { x: 0, y: 5.5, vx: 0, vy: 0, spin: 0, star: 0, last: -1 };
    this.state = "kickoff"; // kickoff | play | goal | over
    this.wait = 2.2;
    this.result = null;
    this.events = [];
    this.t = 0;
    this.kickoff(Math.random() < 0.5 ? 0 : 1);
  }
  emit(e) {
    this.events.push(e);
  }
  // Расстановка: игроки у своих ворот, мяч падает в центре и чуть катится к тому, кто пропустил
  kickoff(toward) {
    const [a, b] = this.players;
    Object.assign(a, { x: -5.2, y: 0, vx: 0, vy: 0, kick: 0, cool: 0, stun: 0 });
    Object.assign(b, { x: 5.2, y: 0, vx: 0, vy: 0, kick: 0, cool: 0, stun: 0 });
    Object.assign(this.ball, { x: 0, y: 5.5, vx: toward === 0 ? -0.8 : 0.8, vy: 0, spin: 0, star: 0, last: -1 });
    this.state = "kickoff";
    this.wait = 2.2;
    this.emit({ type: "kickoff" });
  }
  // input[i] = { left, right, jump, kick, lob }
  step(input = [{}, {}]) {
    const dt = STEP;
    this.t += dt;
    if (this.state === "over") return;
    if (this.state === "kickoff") {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.state = "play";
        this.emit({ type: "start" });
      }
      // Игроки уже могут бегать, мяч висит
      this.players.forEach((p, i) => this.movePlayer(p, input[i] || {}, dt));
      return;
    }
    if (this.state === "goal") {
      this.wait -= dt;
      // Мяч и игроки ещё двигаются, но второй гол не засчитывается
      this.players.forEach((p, i) => this.movePlayer(p, {}, dt));
      this.moveBall(dt, false);
      if (this.wait <= 0) {
        if (this.time <= 0) return this.finish();
        this.kickoff(this.lastScorer === 0 ? 1 : 0);
      }
      return;
    }
    // Игра
    this.players.forEach((p, i) => this.movePlayer(p, input[i] || {}, dt));
    this.pushApart();
    // Кто первым касается мяча — по очереди, чтобы ни у кого не было преимущества
    const order = Math.round(this.t / STEP) % 2 ? [1, 0] : [0, 1];
    for (const i of order) this.touchBall(this.players[i]);
    const goal = this.moveBall(dt, true);
    if (!this.overtime) this.time = Math.max(0, this.time - dt);
    // HS-3: гол на последнем шаге засчитывается раньше, чем свисток
    if (goal !== null) {
      this.score[goal]++;
      this.lastScorer = goal;
      this.state = "goal";
      this.wait = 2.4;
      this.emit({ type: "goal", side: goal, star: this.ball.star > 0 });
      if (this.overtime) this.time = 0;
      return;
    }
    if (this.time <= 0 && !this.overtime) {
      if (this.golden && this.score[0] === this.score[1]) {
        this.overtime = true;
        this.emit({ type: "golden" });
      } else this.finish();
    }
  }
  finish() {
    this.state = "over";
    const [a, b] = this.score;
    this.result = a > b ? 0 : b > a ? 1 : -1;
    this.emit({ type: "over", winner: this.result });
  }
  movePlayer(p, inp, dt) {
    if (p.stun > 0) p.stun -= dt;
    const free = p.stun <= 0;
    const dir = free ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
    // Разгон и торможение мягкие, на земле резче
    const target = dir * RUN;
    const acc = p.onGround ? 60 : 30;
    p.vx += clamp(target - p.vx, -acc * dt, acc * dt);
    if (free && inp.jump && !p.jumpHeld && p.onGround) {
      p.vy = JUMP;
      p.onGround = false;
      this.emit({ type: "jump", p: p.side });
    }
    p.jumpHeld = !!inp.jump;
    const want = inp.kick ? "low" : inp.lob ? "lob" : null;
    if (free && want && !p.kickHeld && p.cool <= 0) {
      p.kick = 0.2;
      p.kickType = p.star >= 1 && want === "low" ? "star" : want;
      p.hit = false;
      p.cool = 0.32;
      this.emit({ type: "swing", p: p.side });
    }
    p.kickHeld = !!want;
    p.kick = Math.max(0, p.kick - dt);
    p.cool = Math.max(0, p.cool - dt);
    p.vy -= PG * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      if (!p.onGround && p.vy < -6) this.emit({ type: "land", p: p.side });
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }
    // В свои ворота можно зайти до середины — стоять вратарём
    p.x = clamp(p.x, -FIELD.half + 0.85, FIELD.half - 0.85);
  }
  pushApart() {
    const [a, b] = this.players;
    const d = b.x - a.x,
      need = 1.5;
    if (Math.abs(d) < need && Math.abs(a.y - b.y) < 1.8) {
      const push = (need - Math.abs(d)) / 2,
        s = d >= 0 ? 1 : -1;
      a.x -= s * push;
      b.x += s * push;
    }
  }
  // Удар ногой: пока нога в замахе, мяч в зоне стопы получает скорость
  touchBall(p) {
    const b = this.ball;
    const fx = p.x + p.face * FOOT.dx,
      fy = p.y + FOOT.y;
    if (p.kick > 0 && !p.hit && Math.hypot(b.x - fx, b.y - fy) < FOOT.r + BALL_R) {
      const k = KICKS[p.kickType];
      p.hit = true;
      b.vx = p.face * k.vx + p.vx * 0.35;
      b.vy = k.vy + Math.max(0, p.vy) * 0.3;
      b.spin = -p.face * 18;
      b.last = p.side;
      if (p.kickType === "star") {
        p.star = 0;
        b.star = 1;
        this.emit({ type: "star", p: p.side });
      } else {
        b.star = 0;
        p.star = Math.min(1, p.star + 0.2);
      }
      // Мяч из стопы — чтобы не застрял в ноге
      const d = Math.hypot(b.x - fx, b.y - fy) || 1;
      b.x = fx + ((b.x - fx) / d) * (FOOT.r + BALL_R + 0.02);
      b.y = Math.max(BALL_R, fy + ((b.y - fy) / d) * (FOOT.r + BALL_R + 0.02));
      this.emit({ type: "kick", p: p.side, kind: p.kickType });
      return;
    }
    // Голова и тело: мяч отскакивает
    for (const part of [HEAD, BODY]) {
      const cx = p.x,
        cy = p.y + part.y;
      const dx = b.x - cx,
        dy = b.y - cy,
        d = Math.hypot(dx, dy),
        min = part.r + BALL_R;
      if (d >= min || d === 0) continue;
      const nx = dx / d,
        ny = dy / d;
      // Звёздный мяч сбивает с ног того, кто не бил
      if (b.star > 0 && b.last !== p.side) {
        p.stun = 0.9;
        p.vx = -p.face * 4;
        b.star = 0;
        this.emit({ type: "stun", p: p.side });
      }
      b.x = cx + nx * min;
      b.y = cy + ny * min;
      const rvx = b.vx - p.vx,
        rvy = b.vy - p.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const e = part === HEAD ? 0.85 : 0.55;
        b.vx -= (1 + e) * vn * nx;
        b.vy -= (1 + e) * vn * ny;
        // Головой — чуть вперёд и вверх
        if (part === HEAD) {
          b.vx += p.face * 2.2;
          b.vy += 1.5;
        }
        b.vx += p.vx * 0.4;
        b.vy += Math.max(0, p.vy) * 0.5;
        b.last = p.side;
        if (Math.abs(vn) > 2) this.emit({ type: part === HEAD ? "header" : "bump", p: p.side, speed: Math.abs(vn) });
      }
    }
  }
  // Возвращает сторону, которая забила (0 или 1), или null
  moveBall(dt, scoring) {
    const b = this.ball,
      F = FIELD;
    b.vy -= G * dt * (b.star > 0 ? 0.35 : 1);
    b.vx *= Math.pow(0.985, dt * 60) ** 0.15;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > BALL_MAX) {
      b.vx *= BALL_MAX / sp;
      b.vy *= BALL_MAX / sp;
    }
    const px = b.x,
      py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.spin += (b.vx / BALL_R - b.spin) * Math.min(1, dt * (b.y <= BALL_R + 0.02 ? 12 : 0.5));
    if (b.star > 0) b.star = Math.max(0, b.star - dt * 0.6);
    // Газон
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (b.vy < -1.5) this.emit({ type: "bounce", speed: -b.vy });
      b.vy = -b.vy * 0.68;
      if (Math.abs(b.vy) < 1) b.vy = 0;
      b.vx *= 0.97;
    }
    // Потолок — невысокое небо, чтобы мяч не улетал навсегда
    if (b.y > F.ceil - BALL_R) {
      b.y = F.ceil - BALL_R;
      b.vy = -Math.abs(b.vy) * 0.6;
    }
    // Перекладины: брус от линии ворот до задней стенки на высоте bar. Сверху и снизу — отскок
    for (const s of [-1, 1]) {
      const x0 = s * F.line,
        x1 = s * F.half;
      const lo = Math.min(x0, x1),
        hi = Math.max(x0, x1);
      const top = F.bar + F.barT / 2,
        bot = F.bar - F.barT / 2;
      // Ближайшая точка бруса
      const cx = clamp(b.x, lo, hi),
        cy = clamp(b.y, bot, top);
      const dx = b.x - cx,
        dy = b.y - cy,
        d = Math.hypot(dx, dy);
      if (d < BALL_R) {
        const nx = d ? dx / d : 0,
          ny = d ? dy / d : b.y > F.bar ? 1 : -1;
        b.x = cx + nx * BALL_R;
        b.y = cy + ny * BALL_R;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 1.7 * vn * nx;
          b.vy -= 1.7 * vn * ny;
          this.emit({ type: "bar", side: s > 0 ? 1 : 0 });
        }
        // Мяч лежит на перекладине — скатывается обратно в поле
        if (ny > 0.7 && Math.abs(b.vx) < 1.5) b.vx = -s * 2.5;
      }
    }
    // Задние стенки ворот и края поля над воротами
    if (b.x > F.half - BALL_R) {
      b.x = F.half - BALL_R;
      b.vx = -Math.abs(b.vx) * 0.5;
    }
    if (b.x < -F.half + BALL_R) {
      b.x = -F.half + BALL_R;
      b.vx = Math.abs(b.vx) * 0.5;
    }
    // Гол: мяч целиком за линией и ниже перекладины. Правые ворота защищает игрок 1, левые — игрок 0
    if (scoring) {
      if (b.x - BALL_R > F.line && b.y + BALL_R < F.bar - F.barT / 2 + 0.2) return 0;
      if (b.x + BALL_R < -F.line && b.y + BALL_R < F.bar - F.barT / 2 + 0.2) return 1;
    }
    void px, py;
    return null;
  }
}

// ---------- Компьютерный соперник ----------
// Три состояния: закрыть ворота, выйти на мяч, ударить. Цель пересчитывается не чаще, чем раз в think секунд.
export const LEVELS = {
  easy: { think: 0.32, speed: 0.72, aim: 0.8, star: false, lob: 0.15 },
  mid: { think: 0.2, speed: 0.88, aim: 0.6, star: true, lob: 0.3 },
  hard: { think: 0.12, speed: 1, aim: 0.45, star: true, lob: 0.4 },
};
export class Bot {
  constructor(side, level = "easy") {
    this.side = side;
    this.cfg = LEVELS[level];
    this.timer = 0;
    this.target = 0;
    this.mode = "defend";
    this.slow = 0;
  }
  // Где мяч окажется на высоте головы/ноги (простое предсказание)
  predict(b, t) {
    let x = b.x + b.vx * t,
      y = b.y + b.vy * t - 0.5 * G * t * t;
    x = clamp(x, -FIELD.half + 0.5, FIELD.half - 0.5);
    return { x, y: Math.max(BALL_R, y) };
  }
  input(m) {
    const me = m.players[this.side],
      b = m.ball,
      c = this.cfg;
    const own = this.side ? FIELD.line : -FIELD.line; // моя линия ворот
    const toward = Math.sign(own) === Math.sign(b.vx) && Math.abs(b.vx) > 2;
    this.timer -= STEP;
    if (this.timer <= 0) {
      this.timer = c.think;
      const p = this.predict(b, 0.35);
      const behind = (b.x - me.x) * me.face < -0.2; // мяч у меня за спиной
      if (m.state !== "play") {
        this.mode = "wait";
        this.target = own * 0.62;
      } else if (behind || (toward && Math.abs(b.x - own) < 7)) {
        // Закрыть ворота: встать между мячом и воротами
        this.mode = "defend";
        this.target = behind ? b.x - me.face * 1.7 : (p.x + own) / 2;
      } else {
        // Выйти на мяч и встать так, чтобы мяч был впереди
        this.mode = "attack";
        this.target = p.x - me.face * 1.1;
      }
    }
    const inp = { left: false, right: false, jump: false, kick: false, lob: false };
    const dx = this.target - me.x;
    // Скорость — не больше, чем у игрока (на лёгком медленнее): иногда «отдыхает»
    this.slow += STEP;
    const rest = this.slow % 1 > c.speed;
    if (!rest && Math.abs(dx) > 0.25) inp[dx > 0 ? "right" : "left"] = true;
    // Удар: мяч перед ногой
    const fx = me.x + me.face * FOOT.dx;
    const near = Math.hypot(b.x - fx, b.y - FOOT.y) < 1.45 && (b.x - me.x) * me.face > -0.1;
    if (m.state === "play" && near && Math.random() > c.aim * 0.2) {
      if (c.star && me.star >= 1) inp.kick = true;
      else if (Math.random() < c.lob) inp.lob = true;
      else inp.kick = true;
    }
    // Прыжок за высоким мячом над головой
    const above = Math.abs(b.x - me.x) < 1.4 && b.y > 2.8 && b.y < 5 && b.vy < 3;
    if (m.state === "play" && above && me.onGround && Math.random() < 0.5) inp.jump = true;
    return inp;
  }
}
