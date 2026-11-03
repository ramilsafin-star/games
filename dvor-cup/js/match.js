// Размеры поля в мировых единицах. Высота отсчитывается от газона.
export const FIELD = { left: 7, right: 93, bar: 15.5, post: 0.56, r: 1.9 };
export const STEP = 1 / 120;
const GRAVITY = 85,
  SPEED = 26;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const idle = { move: 0, jump: false, shot: null };
const player = (x, side) => ({
  x,
  y: 0,
  vy: 0,
  vx: 0,
  side,
  run: 0,
  kick: 0,
  cooldown: 0,
  jumpHeld: false,
  shotHeld: false,
});
export class Match {
  constructor() {
    this.score = [0, 0];
    this.remaining = 60;
    this.phase = "kickoff";
    this.wait = 0.85;
    this.paused = false;
    this.lastScorer = null;
    this.events = [];
    this.resetField(0);
  }
  resetField(kicker) {
    this.players = [
      player(kicker === 0 ? 40 : 27, 0),
      player(kicker === 1 ? 60 : 73, 1),
    ];
    this.ball = { x: 50, y: FIELD.r, vx: 0, vy: 0, spin: 0 };
    this.botClock = 0;
    this.bot = { ...idle };
    this.botTarget = 70;
  }
  ai(dt) {
    const p = this.players[1],
      b = this.ball;
    this.botClock -= dt;
    if (this.botClock <= 0) {
      this.botClock = 0.3;
      // Выходит к мячу из своей половины. У чужих ворот страхует навес.
      // С перевесом в два гола бот отходит за центр и встречает следующую атаку.
      const line = this.score[1] - this.score[0] >= 2 ? 58 : 39;
      const intercept = b.x > line || b.vx > 4;
      this.botTarget = intercept ? clamp(b.x + b.vx * 0.12 + 1.8, 17, 94) : 64;
      const near = Math.abs(b.x - p.x) < 8 && b.y < p.y + 11;
      this.bot = {
        move: 0,
        jump: b.y > 8 && b.y < 22 && Math.abs(b.x - p.x) < 10,
        shot: near
          ? this.players[0].x > 27 && b.x > 36
            ? "lob"
            : "low"
          : null,
      };
    }
    const dx = this.botTarget - p.x;
    return { ...this.bot, move: Math.abs(dx) < 0.75 ? 0 : Math.sign(dx) };
  }
  step(h, input = idle) {
    this.events = [];
    if (this.paused || this.phase === "end") return;
    if (this.phase !== "play") {
      this.wait -= h;
      if (this.wait <= 0) {
        if (this.phase === "goal") {
          this.resetField(1 - this.lastScorer);
          this.phase = "kickoff";
          this.wait = 0.65;
        } else {
          this.phase = "play";
          this.events.push("start");
        }
      }
      return;
    }
    const bot = this.ai(h);
    this.move(this.players[0], input, h);
    this.move(this.players[1], bot, h);
    const [a, c] = this.players;
    const overlap = 4.9 - Math.abs(c.x - a.x);
    if (overlap > 0 && Math.abs(c.y - a.y) < 7) {
      const dir = c.x >= a.x ? 1 : -1;
      a.x = clamp(a.x - dir * overlap * 0.5, 5, 95);
      c.x = clamp(c.x + dir * overlap * 0.5, 5, 95);
    }
    const shot = this.strike(a) || this.strike(c);
    if (shot) this.events.push("kick");
    const b = this.ball,
      f = FIELD,
      before = b.x;
    b.vy -= GRAVITY * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.spin += b.vx * h * 0.34;
    if (b.y < f.r) {
      b.y = f.r;
      if (b.vy < -5) {
        b.vy = -b.vy * 0.62;
        if (b.vy > 6) this.events.push("bounce");
      } else b.vy = 0;
      b.vx *= Math.exp(-0.58 * h);
    }
    b.vx *= Math.exp(-0.1 * h);
    for (const x of [f.left, f.right]) {
      if (this.repel(x, f.bar, f.post, 0, 0, 0.82)) this.events.push("bar");
    }
    if (!shot) {
      for (const p of this.players) {
        this.repel(p.x, p.y + 7.6, 3.35, p.vx, p.vy, 0.6);
        this.repel(p.x, p.y + 3.5, 2.8, p.vx, p.vy, 0.57);
      }
    }
    if (b.y > 42) {
      b.y = 42;
      b.vy = -Math.abs(b.vy) * 0.65;
    }
    const crossedLeft = before + f.r > f.left && b.x + f.r <= f.left;
    const crossedRight = before - f.r < f.right && b.x - f.r >= f.right;
    if (b.y + f.r < f.bar - f.post && (crossedLeft || crossedRight)) {
      this.lastScorer = b.x < 50 ? 1 : 0;
      this.score[this.lastScorer]++;
      this.events.push("goal");
      this.phase = "goal";
      this.wait = 1.15;
      b.vx = b.vy = 0;
    } else if (crossedLeft || crossedRight) {
      b.x = crossedLeft ? f.left - f.r + 0.01 : f.right + f.r - 0.01;
      b.vx = (crossedLeft ? 1 : -1) * Math.abs(b.vx) * 0.78;
    }
    this.remaining = Math.max(0, this.remaining - h);
    if (this.remaining < 0.000001) {
      this.remaining = 0;
      this.phase = "end";
      this.events.push("end");
    }
  }
  move(p, input, h) {
    p.vx = clamp(input.move || 0, -1, 1) * SPEED;
    p.x = clamp(p.x + p.vx * h, 5, 95);
    p.run += Math.abs(p.vx) * h * 0.45;
    if (input.jump && !p.jumpHeld && p.y === 0) {
      p.vy = 43;
      this.events.push("jump");
    }
    p.jumpHeld = !!input.jump;
    p.vy -= GRAVITY * h;
    p.y += p.vy * h;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
    }
    p.kick = Math.max(0, p.kick - h);
    p.cooldown = Math.max(0, p.cooldown - h);
    // Окно удара открывается по нажатию и живёт 150 мс, даже если кнопку уже отпустили.
    if (input.shot && (!p.shotHeld || p.side === 1) && p.cooldown === 0) {
      p.shotType = input.shot;
      p.kick = 0.24;
      p.swing = 0.15;
      p.cooldown = 0.33;
    }
    p.shotHeld = !!input.shot;
    p.swing = Math.max(0, (p.swing || 0) - h);
  }
  strike(p) {
    if (!p.swing) return false;
    const b = this.ball,
      dir = p.side === 0 ? 1 : -1,
      dx = (b.x - p.x) * dir,
      dy = b.y - p.y;
    if (dx < -2.5 || dx > 8.8 || dy < -1 || dy > 12.5) return false;
    const lob = p.shotType === "lob";
    b.vx = (lob ? 34 : 65) * dir;
    b.vy = lob ? 55 : 12;
    p.swing = 0;
    return true;
  }
  repel(x, y, r, vx, vy, restitution) {
    const b = this.ball,
      dx = b.x - x,
      dy = b.y - y,
      dist = Math.hypot(dx, dy),
      reach = r + FIELD.r;
    if (dist >= reach) return false;
    const nx = dist ? dx / dist : 0,
      ny = dist ? dy / dist : 1;
    b.x = x + nx * reach;
    b.y = y + ny * reach;
    const rel = (b.vx - vx) * nx + (b.vy - vy) * ny;
    if (rel >= 0) return false;
    const impulse = -(1 + restitution) * rel;
    b.vx = clamp(b.vx + impulse * nx, -79, 79);
    b.vy = clamp(b.vy + impulse * ny, -55, 50);
    return true;
  }
}
