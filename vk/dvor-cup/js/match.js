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
// Чеканка: мягкие удары вверх, чтобы мяч можно было удержать в воздухе
const SOFT = { low: { vx: 1.6, vy: 9.6 }, lob: { vx: 0.7, vy: 11.2 }, star: { vx: 1.6, vy: 9.6 } };

// Бонусы на поле: висят пузырём, берёт тот, кто коснётся (или чей мяч в него попадёт).
// t — сколько секунд действует; snow действует на соперника
export const ITEMS = {
  star: { name: "Звезда", t: 0 },
  speed: { name: "Молния", t: 6 },
  snow: { name: "Снежинка", t: 2.2 },
  magnet: { name: "Магнит", t: 6 },
  big: { name: "Большая голова", t: 7 },
};
export const ITEM_R = 0.6;
// Испытания (мини-игры): одна попытка — seconds секунд или shots ударов
export const TRIALS = {
  targets: { name: "Меткий удар", seconds: 40, stars: [3, 6, 9] },
  keepy: { name: "Чеканка", seconds: 45, stars: [5, 12, 20] },
  keeper: { name: "Вратарь", shots: 10, stars: [6, 8, 10] },
};

function newPlayer(side) {
  return {
    side, face: side ? -1 : 1, x: side ? 5.2 : -5.2, y: 0, vx: 0, vy: 0, kick: 0, kickType: "low", hit: false, cool: 0, star: 0, stun: 0, onGround: true, jumpHeld: false, kickHeld: false,
    // Действие бонусов (секунды) и прибавка звёздного удара за удар
    fx: { speed: 0, snow: 0, magnet: 0, big: 0 },
    starGain: 0.2,
    power: 1,
  };
}
// Простой предсказуемый генератор случайных чисел (для проверок можно задать seed)
function rand(seed) {
  if (seed == null) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Match {
  // seconds — длина матча; golden — если ничья, играть до золотого гола; bonuses — бонусы на поле;
  // mode — "match" (матч) или испытание: "targets" (шарики), "keepy" (чеканка), "keeper" (вратарь)
  constructor({ seconds = 60, golden = false, bonuses = false, mode = "match", seed = null } = {}) {
    this.mode = mode;
    this.solo = mode !== "match";
    this.rnd = rand(seed);
    this.score = [0, 0];
    this.time = this.solo ? TRIALS[mode].seconds || 0 : seconds;
    this.golden = golden;
    this.overtime = false;
    this.players = [newPlayer(0), newPlayer(1)];
    this.ball = { x: 0, y: 5.5, vx: 0, vy: 0, spin: 0, star: 0, last: -1, how: "" };
    this.state = "kickoff"; // kickoff | play | goal | over
    this.wait = 2.2;
    this.result = null;
    this.events = [];
    this.t = 0;
    // Бонусы: первый появится через 6 с игры
    this.bonuses = bonuses && !this.solo;
    this.items = [];
    this.itemWait = 6;
    this.itemId = 0;
    if (this.solo) this.setupTrial();
    else this.kickoff(Math.random() < 0.5 ? 0 : 1);
  }
  emit(e) {
    this.events.push(e);
  }
  // Расстановка: игроки у своих ворот, мяч падает в центре и чуть катится к тому, кто пропустил
  kickoff(toward) {
    const [a, b] = this.players;
    Object.assign(a, { x: -5.2, y: 0, vx: 0, vy: 0, kick: 0, cool: 0, stun: 0 });
    Object.assign(b, { x: 5.2, y: 0, vx: 0, vy: 0, kick: 0, cool: 0, stun: 0 });
    Object.assign(this.ball, { x: 0, y: 5.5, vx: toward === 0 ? -0.8 : 0.8, vy: 0, spin: 0, star: 0, last: -1, how: "" });
    for (const p of this.players) p.fx.snow = 0;
    this.items.length = 0;
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
      this.movePlayers(input, dt);
      return;
    }
    if (this.state === "goal") {
      this.wait -= dt;
      // Мяч и игроки ещё двигаются, но второй гол не засчитывается
      this.movePlayers([{}, {}], dt);
      this.moveBall(dt, false);
      if (this.wait <= 0) {
        if (this.time <= 0) return this.finish();
        this.kickoff(this.lastScorer === 0 ? 1 : 0);
      }
      return;
    }
    if (this.solo) return this.stepTrial(input, dt);
    // Игра
    this.movePlayers(input, dt);
    this.pushApart();
    // Кто первым касается мяча — по очереди, чтобы ни у кого не было преимущества
    const order = Math.round(this.t / STEP) % 2 ? [1, 0] : [0, 1];
    for (const i of order) this.touchBall(this.players[i]);
    if (this.bonuses) this.stepItems(dt);
    const goal = this.moveBall(dt, true);
    if (!this.overtime) this.time = Math.max(0, this.time - dt);
    // HS-3: гол на последнем шаге засчитывается раньше, чем свисток
    if (goal !== null) {
      this.score[goal]++;
      this.lastScorer = goal;
      this.state = "goal";
      this.wait = 2.4;
      this.emit({ type: "goal", side: goal, star: this.ball.star > 0, how: this.ball.last === goal ? this.ball.how : "own", golden: this.overtime });
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
  movePlayers(input, dt) {
    this.players.forEach((p, i) => {
      if (this.solo && i === 1) return; // в испытании второго игрока нет
      this.movePlayer(p, input[i] || {}, dt);
    });
  }
  finish() {
    this.state = "over";
    const [a, b] = this.score;
    this.result = this.solo ? 0 : a > b ? 0 : b > a ? 1 : -1;
    this.emit({ type: "over", winner: this.result });
  }

  // ---------- Бонусы на поле ----------
  stepItems(dt) {
    const R = this.rnd;
    this.itemWait -= dt;
    if (this.itemWait <= 0 && this.items.length === 0) {
      const kinds = Object.keys(ITEMS);
      // Подальше от мяча, на высоте бега или прыжка
      let x = 0;
      for (let k = 0; k < 6; k++) {
        x = (R() * 2 - 1) * 6.4;
        if (Math.abs(x - this.ball.x) > 2.5) break;
      }
      this.items.push({ id: ++this.itemId, kind: kinds[Math.floor(R() * kinds.length)], x, y: R() < 0.55 ? 1.25 : 3.1, life: 9 });
      this.itemWait = 8 + R() * 5;
      this.emit({ type: "itemSpawn", x });
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      let who = -1;
      for (const p of this.players) {
        const hy = p.y + (p.fx.big > 0 ? HEAD.y + 0.35 : HEAD.y);
        if (Math.hypot(it.x - p.x, it.y - (p.y + BODY.y)) < BODY.r + ITEM_R || Math.hypot(it.x - p.x, it.y - hy) < HEAD.r + ITEM_R) who = p.side;
      }
      // Мяч попал в пузырь — бонус тому, кто бил последним
      if (who < 0 && this.ball.last >= 0 && Math.hypot(it.x - this.ball.x, it.y - this.ball.y) < BALL_R + ITEM_R) who = this.ball.last;
      if (who >= 0) {
        this.items.splice(i, 1);
        this.give(who, it.kind);
        this.emit({ type: "item", p: who, kind: it.kind, x: it.x, y: it.y });
      } else if (it.life <= 0) {
        this.items.splice(i, 1);
        this.emit({ type: "itemGone", x: it.x, y: it.y });
      }
    }
  }
  give(side, kind) {
    const p = this.players[side],
      other = this.players[1 - side];
    if (kind === "star") p.star = 1;
    else if (kind === "snow") {
      other.fx.snow = ITEMS.snow.t;
      other.vx = 0;
      other.kick = 0;
      this.emit({ type: "freeze", p: other.side });
    } else p.fx[kind] = ITEMS[kind].t;
  }

  // ---------- Испытания ----------
  setupTrial() {
    const [p, q] = this.players;
    Object.assign(q, { x: 30, y: 0 }); // второго игрока нет — он далеко за полем
    this.state = "kickoff";
    this.wait = 1.4;
    this.shot = 0;
    this.combo = 0;
    this.best = 0;
    this.alive = false;
    this.next = 0;
    this.still = 0;
    this.touchCool = 0;
    this.targets = [];
    this.targetId = 0;
    if (this.mode === "targets") {
      for (let k = 0; k < 3; k++) this.addTarget();
      Object.assign(this.ball, { x: p.x + 1.6, y: 3.5, vx: 0, vy: 0 });
    } else if (this.mode === "keepy") {
      this.dropBall();
    } else {
      // Вратарь: игрок перед своими воротами, подающая машинка в правых воротах
      p.x = -4.6;
      Object.assign(this.ball, { x: 8.6, y: 0.9, vx: 0, vy: 0 });
      this.next = 0.6;
    }
  }
  // Шарик в удобном для удара месте: в правых воротах, над ними или над правой половиной поля
  addTarget() {
    const R = this.rnd;
    for (let k = 0; k < 20; k++) {
      const zone = R();
      const t =
        zone < 0.4
          ? { x: 8.7 + R() * 0.8, y: 0.9 + R() * 2.2 }
          : zone < 0.75
            ? { x: 2 + R() * 5.5, y: 3.2 + R() * 2.4 }
            : { x: 3 + R() * 4.5, y: 1 + R() * 1.4 };
      if (this.targets.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 1.6)) continue;
      if (Math.hypot(t.x - this.ball.x, t.y - this.ball.y) < 1.4) continue;
      this.targets.push({ id: ++this.targetId, ...t, r: 0.55, color: Math.floor(R() * 5) });
      return;
    }
  }
  dropBall() {
    const p = this.players[0];
    Object.assign(this.ball, { x: p.x + 0.25 * p.face, y: 5.2, vx: 0, vy: 0, spin: 0, last: -1 });
    this.combo = 0;
    this.alive = true;
  }
  stepTrial(input, dt) {
    const p = this.players[0],
      b = this.ball;
    this.movePlayers(input, dt);
    const lastBefore = b.last;
    const vyBefore = b.vy;
    const touched = this.touchBall(p);
    this.touchCool = Math.max(0, this.touchCool - dt);
    if (this.mode === "targets") {
      this.moveBall(dt, false);
      for (let i = this.targets.length - 1; i >= 0; i--) {
        const t = this.targets[i];
        if (Math.hypot(t.x - b.x, t.y - b.y) < t.r + BALL_R) {
          this.targets.splice(i, 1);
          this.score[0]++;
          this.emit({ type: "pop", x: t.x, y: t.y, color: t.color, n: this.score[0] });
          this.next = Math.max(this.next, 0.5);
        }
      }
      if (this.next > 0 && (this.next -= dt) <= 0) while (this.targets.length < 3) this.addTarget();
      // Мяч улёгся или застрял в воротах — новый падает к игроку
      const slow = Math.hypot(b.vx, b.vy) < 0.6 && b.y < BALL_R + 0.05;
      this.still = slow || (b.x > FIELD.line + 0.3 && Math.abs(b.vx) < 1.5) ? this.still + dt : 0;
      if (this.still > 1.2) {
        this.still = 0;
        Object.assign(b, { x: clamp(p.x + 1.5 * p.face, -8, 7), y: 4.5, vx: 0, vy: 0, spin: 0, last: -1 });
        this.emit({ type: "newBall" });
      }
    } else if (this.mode === "keepy") {
      if (touched && this.alive && this.touchCool <= 0) {
        this.combo++;
        this.touchCool = 0.15;
        this.best = Math.max(this.best, this.combo);
        this.score[0] = this.best;
        this.emit({ type: "juggle", n: this.combo });
      }
      this.moveBall(dt, false);
      // Мяч коснулся травы — попытка закончилась
      if (this.alive && b.y <= BALL_R + 0.001 && vyBefore <= 0) {
        this.alive = false;
        this.next = 1.1;
        this.emit({ type: "drop", n: this.combo });
      }
      if (!this.alive && this.next > 0 && (this.next -= dt) <= 0) {
        this.dropBall();
        this.emit({ type: "newBall" });
      }
    } else {
      // Вратарь: мяч, которого коснулся игрок, отбит
      if (this.alive && b.last === 0 && lastBefore !== 0) this.saveShot("save");
      const goal = this.moveBall(dt, this.alive);
      if (this.alive && goal === 1) {
        this.alive = false;
        this.score[1]++;
        this.next = 1.6;
        this.emit({ type: "goal", side: 1, star: false, how: "shot" });
      } else if (this.alive) {
        // Мяч не долетел или отскочил от перекладины обратно — тоже не пропустил
        this.flight += dt;
        if (this.flight > 4 || (b.vx > 1 && b.x > -2 && this.flight > 0.6)) this.saveShot("miss");
      }
      if (!this.alive && this.next > 0 && (this.next -= dt) <= 0) {
        if (this.shot >= TRIALS.keeper.shots) return this.finish();
        this.launch();
      }
      this.time = TRIALS.keeper.shots - this.shot;
      return;
    }
    this.time = Math.max(0, this.time - dt);
    if (this.time <= 0) this.finish();
  }
  saveShot(how) {
    this.alive = false;
    this.score[0]++;
    this.next = 1.3;
    this.emit({ type: "save", how, n: this.score[0] });
  }
  // Подающая машинка: прямые удары по земле (их легко отбить телом) и навесы через голову вратаря —
  // за ними надо отойти к воротам и прыгнуть. Вершина навеса — над серединой поля, к концу всё быстрее
  launch() {
    const R = this.rnd,
      k = this.shot / (TRIALS.keeper.shots - 1);
    this.shot++;
    this.alive = true;
    this.flight = 0;
    const kind = this.shot === 1 ? "drive" : this.shot === 2 ? "lob" : R() < 0.6 ? "lob" : "drive";
    let v;
    if (kind === "lob") {
      const H = 5.6 + R() * 1.1,
        xa = -0.4 - R() * 2.2 - k;
      const vy = Math.sqrt((H - 1) * 2 * G);
      v = { vx: -((8.2 - xa) * G) / vy, vy };
    } else v = { vx: -(11 + k * 5 + R() * 2), vy: 2 + R() * 2.5 };
    Object.assign(this.ball, { x: 8.2, y: 1, ...v, spin: 0, star: 0, last: 1, how: "" });
    this.emit({ type: "launch", n: this.shot, kind });
  }
  movePlayer(p, inp, dt) {
    if (p.stun > 0) p.stun -= dt;
    // Бонусы действуют и во время паузы после гола
    for (const k in p.fx) if (p.fx[k] > 0) p.fx[k] = Math.max(0, p.fx[k] - dt);
    // Снежинка: игрок застыл в ледышке
    const free = p.stun <= 0 && p.fx.snow <= 0;
    const dir = free ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
    // Молния: быстрее бегает и выше прыгает
    const fast = p.fx.speed > 0 ? 1.4 : 1;
    // Разгон и торможение мягкие, на земле резче
    const target = dir * RUN * fast;
    const acc = (p.onGround ? 60 : 30) * fast;
    p.vx += clamp(target - p.vx, -acc * dt, acc * dt);
    if (free && inp.jump && !p.jumpHeld && p.onGround) {
      p.vy = JUMP * (p.fx.speed > 0 ? 1.12 : 1);
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
  // Удар ногой: пока нога в замахе, мяч в зоне стопы получает скорость. Вернёт true, если коснулся мяча
  touchBall(p) {
    const b = this.ball;
    const fx = p.x + p.face * FOOT.dx,
      fy = p.y + FOOT.y;
    let touched = false;
    if (p.kick > 0 && !p.hit && Math.hypot(b.x - fx, b.y - fy) < FOOT.r + BALL_R) {
      const k = (this.mode === "keepy" ? SOFT : KICKS)[p.kickType];
      p.hit = true;
      b.vx = p.face * k.vx * p.power + p.vx * 0.35;
      b.vy = k.vy * Math.sqrt(p.power) + Math.max(0, p.vy) * 0.3;
      b.spin = -p.face * 18;
      b.last = p.side;
      b.how = p.kickType;
      if (p.kickType === "star") {
        p.star = 0;
        b.star = 1;
        this.emit({ type: "star", p: p.side });
      } else {
        b.star = 0;
        p.star = Math.min(1, p.star + p.starGain);
      }
      // Мяч из стопы — чтобы не застрял в ноге
      const d = Math.hypot(b.x - fx, b.y - fy) || 1;
      b.x = fx + ((b.x - fx) / d) * (FOOT.r + BALL_R + 0.02);
      b.y = Math.max(BALL_R, fy + ((b.y - fy) / d) * (FOOT.r + BALL_R + 0.02));
      this.emit({ type: "kick", p: p.side, kind: p.kickType, x: b.x, y: b.y });
      return true;
    }
    // Голова и тело: мяч отскакивает. Большая голова (бонус) — крупнее и выше
    const big = p.fx.big > 0;
    for (const part of [HEAD, BODY]) {
      const head = part === HEAD;
      const cx = p.x,
        cy = p.y + part.y + (head && big ? 0.35 : 0);
      const dx = b.x - cx,
        dy = b.y - cy,
        d = Math.hypot(dx, dy),
        min = part.r * (head && big ? 1.45 : 1) + BALL_R;
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
        const e = head ? 0.85 : 0.55;
        b.vx -= (1 + e) * vn * nx;
        b.vy -= (1 + e) * vn * ny;
        // Головой — чуть вперёд и вверх (на чеканке почти только вверх)
        if (head) {
          const keepy = this.mode === "keepy";
          b.vx += p.face * (keepy ? 0.35 : 2.2);
          b.vy += keepy ? 2.6 : 1.5;
          if (keepy) b.vx *= 0.75;
        }
        b.vx += p.vx * 0.4;
        b.vy += Math.max(0, p.vy) * 0.5;
        b.last = p.side;
        b.how = head ? "head" : "body";
        if (Math.abs(vn) > 0.8) touched = true;
        if (Math.abs(vn) > 2) this.emit({ type: head ? "header" : "bump", p: p.side, speed: Math.abs(vn), x: b.x, y: b.y });
      }
    }
    return touched;
  }
  // Возвращает сторону, которая забила (0 или 1), или null
  moveBall(dt, scoring) {
    const b = this.ball,
      F = FIELD;
    for (const p of this.players) {
      if (p.fx.magnet <= 0 || p.fx.snow > 0) continue;
      const fx = p.x + p.face * FOOT.dx;
      const dx = fx - b.x;
      if (Math.abs(dx) < 4.5 && Math.abs(dx) > 0.3 && b.y < 3 && Math.abs(b.vx) < 9) b.vx += Math.sign(dx) * 11 * dt;
    }
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
// react — сколько секунд «соображает», подбежав к мячу, прежде чем ударить: так уровни заметно различаются
export const LEVELS = {
  easy: { think: 0.36, speed: 0.64, react: 0.5, star: false, lob: 0.15 },
  mid: { think: 0.2, speed: 0.84, react: 0.18, star: true, lob: 0.3 },
  hard: { think: 0.12, speed: 1, react: 0.03, star: true, lob: 0.4 },
};
// Характеры соперников: как играет (подсказка игроку — в game.js)
//  keeper — держится у своих ворот; rusher — всё время в атаке; jumper — прыгает за каждым мячом;
//  lobber — бьёт навесом; hunter — охотится за бонусами; strong — звёздный удар копится быстрее.
//  power — сила ударов (у вратаря выбивает недалеко), starGain — прибавка звёздного удара: их game.js
//  переносит на игрока матча (Bot.setup)
export const STYLES = {
  plain: {},
  keeper: { home: true, jump: 0.35, pace: 0.75, power: 0.6 },
  rusher: { press: true, lob: 0.08 },
  jumper: { jump: 0.95, hop: true },
  lobber: { lob: 0.7 },
  hunter: { hunt: 9 },
  strong: { starGain: 0.34 },
};
export class Bot {
  // Перенести характер на игрока матча: сила ударов и звёздный удар
  setup(m) {
    const p = m.players[this.side];
    if (this.cfg.starGain) p.starGain = this.cfg.starGain;
    if (this.cfg.power) p.power = this.cfg.power;
    return this;
  }
  constructor(side, level = "easy", style = "plain") {
    this.side = side;
    this.cfg = { ...LEVELS[level], ...STYLES[style] };
    this.style = style;
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
  // Когда мяч опустится до высоты h (или null, если уже ниже)
  landing(b, h) {
    const g = G * (b.star > 0 ? 0.35 : 1);
    const c = b.y - h;
    const disc = b.vy * b.vy + 2 * g * c;
    if (disc < 0) return null;
    const t = (b.vy + Math.sqrt(disc)) / g;
    return clamp(b.x + b.vx * t, -FIELD.half + 0.6, FIELD.half - 0.6);
  }
  input(m) {
    if (m.solo) return this.trial(m);
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
      const item = c.hunt && m.items?.[0];
      if (m.state !== "play") {
        this.mode = "wait";
        this.target = own * (c.press ? 0.35 : 0.62);
      } else if (item && Math.abs(item.x - me.x) < c.hunt && Math.abs(b.x - own) > 4.5) {
        // Хитрюга: бежит за бонусом, пока мяч далеко от его ворот
        this.mode = "item";
        this.target = item.x;
      } else if (c.home && !behind && Math.abs(b.x - own) > 7.5) {
        // Вратарь: ждёт перед воротами (навес можно перебросить через него), иногда зазевается
        this.mode = "defend";
        this.target = own * 0.5 + (p.x - own) * 0.1;
        if (Math.random() < 0.25) this.timer = 0.8;
      } else if (behind || (toward && Math.abs(b.x - own) < (c.press ? 3.5 : 7))) {
        // Закрыть ворота: встать между мячом и воротами
        this.mode = "defend";
        this.target = behind ? b.x - me.face * 1.7 : (p.x + own) / 2;
      } else {
        // Выйти на мяч и встать так, чтобы мяч был впереди
        this.mode = "attack";
        this.target = p.x - me.face * (c.press ? 0.9 : 1.1);
      }
    }
    const inp = { left: false, right: false, jump: false, kick: false, lob: false };
    const dx = this.target - me.x;
    // Скорость — не больше, чем у игрока (на лёгком медленнее): иногда «отдыхает»
    this.slow += STEP;
    // «Торпеда» и «Хитрюга» за бонусом не отдыхают
    const rest = this.slow % 1 > c.speed * (c.pace || 1) && !c.press && this.mode !== "item";
    if (!rest && Math.abs(dx) > 0.25) inp[dx > 0 ? "right" : "left"] = true;
    // Удар: мяч перед ногой
    const fx = me.x + me.face * FOOT.dx;
    const near = Math.hypot(b.x - fx, b.y - FOOT.y) < 1.45 && (b.x - me.x) * me.face > -0.1;
    // Подбежал к мячу — бьёт не сразу, а через react секунд (у лёгкого дольше)
    this.nearT = near ? (this.nearT || 0) + STEP : 0;
    // Кнопку удара бот отпускает через шаг: удар срабатывает по нажатию, а не по удержанию
    if (m.state === "play" && near && !me.kickHeld && this.nearT >= c.react * (0.5 + Math.random())) {
      if (c.star && me.star >= 1) inp.kick = true;
      else if (Math.random() < c.lob) inp.lob = true;
      else inp.kick = true;
    }
    // Прыжок за высоким мячом над головой (прыгун и вратарь прыгают охотнее и за мячом пониже)
    const low = c.jump ? 2.2 : 2.8;
    const above = Math.abs(b.x - me.x) < 1.4 && b.y > low && b.y < 5 && b.vy < 3;
    if (m.state === "play" && above && me.onGround && Math.random() < (c.jump || 0.5)) inp.jump = true;
    // Прыгун иногда подпрыгивает просто от радости
    if (c.hop && m.state === "play" && me.onGround && Math.random() < 0.006) inp.jump = true;
    // За бонусом в воздухе — прыжок
    const item = m.items?.[0];
    if (this.mode === "item" && item && item.y > 2 && Math.abs(item.x - me.x) < 1.2 && me.onGround) inp.jump = true;
    return inp;
  }
  // Испытания (для автопилота в проверках): игрок слева
  trial(m) {
    const me = m.players[this.side],
      b = m.ball,
      c = this.cfg;
    const inp = { left: false, right: false, jump: false, kick: false, lob: false };
    if (m.state !== "play" && m.mode !== "keepy") return inp;
    let target = me.x;
    if (m.mode === "keepy") {
      // Встать под мяч чуть впереди него: удар головой отправит мяч почти вертикально
      const x = this.landing(b, me.y + HEAD.y + HEAD.r + BALL_R - 0.2);
      target = x == null ? b.x : x + me.face * 0.12;
    } else if (m.mode === "keeper") {
      const x = this.landing(b, 1.6);
      target = clamp(x == null ? b.x : x, -FIELD.line + 0.6, -3);
      if (b.vx < 0 && b.x - me.x < 3 && b.y > 2.4 && me.onGround) inp.jump = true;
      if (b.vx < 0 && Math.abs(b.x - (me.x + FOOT.dx)) < 1.4 && b.y < 2) inp.kick = true;
    } else {
      // Шарики: подбежать к мячу сзади и бить — навесом, если ближайший шарик высоко
      target = b.x - me.face * 1.1;
      const near = Math.hypot(b.x - (me.x + me.face * FOOT.dx), b.y - FOOT.y) < 1.4 && (b.x - me.x) * me.face > -0.1;
      const goal = m.targets.reduce((a, t) => (!a || Math.abs(t.x - b.x) < Math.abs(a.x - b.x) ? t : a), null);
      if (near) inp[goal && goal.y > 2.6 ? "lob" : "kick"] = true;
    }
    const dx = target - me.x;
    if (Math.abs(dx) > 0.12) inp[dx > 0 ? "right" : "left"] = true;
    return inp;
  }
}
