// Заезд «Снежного кома»: движение кома по трассе, ворота, подбор, удары, финал.
// Чистая логика без графики. Время заезда на трассе — путь / скорость, поэтому положение
// движущихся препятствий в каждой точке трассы заранее известно (и проверкам, и роботу).
import { HALF, LATERAL, GRAVITY, JUMP, BRIDGE_HALF, MAX_SIZE, START, radiusOf, applyGate, isGood, damage, touches, clamp } from "./rules.js?v=bd3554ee";
import { bridgeAt } from "./levels.js?v=bd3554ee";

const HAZARD_KINDS = new Set(["rock", "fence", "spikes", "log", "hole", "crusher", "geyser"]);

export class Run {
  constructor(level, opts = {}) {
    this.level = level;
    this.startSize = Math.max(1, Math.round(opts.start ?? START));
    this.magnet = opts.magnet ?? 0;
    this.reset();
  }

  reset() {
    const L = this.level;
    this.mode = "ready"; // ready → run → finale → won; при неудаче falling/bounce → fail
    this.s = 0;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.vx = 0;
    this.air = false;
    this.size = this.startSize;
    this.peak = this.size;
    this.coins = 0; // собранные снежинки
    this.time = 0;
    this.v = L.speed;
    this.used = new Uint8Array(L.items.length);
    this.walls = L.finale.walls.map((w) => ({ s: w.s, hp: w.hp, left: w.hp, broken: false }));
    this.wall = 0;
    this.bossDown = false;
    this.stair = 0; // ступень ×N, на которой ком (0 — ещё не на ступенях)
    this.mult = 0;
    this.rest = null; // где ком остановится в финале
    this.decided = false;
    this.payNext = false;
    this.restTimer = 0;
    this.slow = 0;
    this.invuln = 0;
    this.fallTimer = 0;
    this.failReason = null;
    this.failS = 0;
    this.continued = false;
    this.hits = 0;
    this.lost = 0; // сколько снега отняли препятствия
    this.finaleSize = 0; // с каким размером ком въехал в финал
    this.lo = 0;
    this.events = [];
    this.checkpoints = [];
    this.checkGate = 0;
    this.save();
  }

  get radius() {
    return radiusOf(this.size);
  }
  get progress() {
    return clamp(this.s / this.level.length, 0, 1);
  }
  get playing() {
    return this.mode === "run" || this.mode === "finale" || this.mode === "falling" || this.mode === "bounce";
  }

  begin() {
    if (this.mode === "ready") {
      this.mode = "run";
      this.events.push({ type: "start" });
    }
  }

  save() {
    this.checkpoints.push({ s: this.s, x: this.x, size: this.size, coins: this.coins, used: this.used.slice(), lo: this.lo, gate: this.checkGate });
  }

  emit(e) {
    this.events.push(e);
  }

  // input: { target: x | null, push: -1..1 }  (target — палец/мышь, push — клавиши)
  step(dt, input = {}) {
    const L = this.level;
    if (this.mode === "ready" || this.mode === "won" || this.mode === "fail") return;
    if (this.mode === "falling") {
      this.fallTimer += dt;
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      this.s += this.v * 0.5 * dt;
      this.x += this.vx * dt;
      if (this.fallTimer > 1.1) this.fail("fall");
      return;
    }
    if (this.mode === "bounce") {
      this.restTimer += dt;
      this.s -= Math.max(0, 9 - this.restTimer * 14) * dt;
      if (this.restTimer > 1.0) this.fail("boss");
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    const r = this.radius;
    const lim = HALF - r;

    // ---------- вбок ----------
    const steering = this.mode === "run";
    if (steering && input.push) {
      this.vx += (input.push * 12 - this.vx) * Math.min(1, dt * 14);
    } else {
      const goal = steering ? (input.target ?? this.x) : 0;
      const want = clamp((clamp(goal, -lim, lim) - this.x) * 11, -LATERAL, LATERAL);
      this.vx += (want - this.vx) * Math.min(1, dt * 18);
    }
    this.x += this.vx * dt;
    if (this.x < -lim || this.x > lim) {
      this.x = clamp(this.x, -lim, lim);
      this.vx = 0;
    }

    // ---------- вперёд ----------
    const s0 = this.s;
    let v = L.speed;
    if (this.mode === "finale") v = this.stair > 0 ? 10 : 13;
    if (this.slow > 0) {
      this.slow -= dt;
      v *= 0.45;
    }
    if (this.rest !== null) {
      v = Math.max(0, Math.min(v, (this.rest - this.s) * 3.2));
      if (this.rest - this.s < 0.05) {
        this.restTimer += dt;
        if (this.restTimer > 0.7) return this.win();
      }
    }
    this.v = v;
    this.s += v * dt;
    if (this.mode === "run") this.time = this.s / L.speed;

    // ---------- вверх-вниз ----------
    if (this.air) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.air = false;
        this.emit({ type: "land", size: this.size });
      }
    }

    if (this.mode === "run") this.track(s0, r);
    else this.finale(r);
  }

  track(s0, r) {
    const L = this.level;
    const items = L.items;
    const s = this.s;
    while (this.lo < items.length && items[this.lo].s < s - 8) this.lo++;
    for (let i = this.lo; i < items.length && items[i].s < s + 8; i++) {
      if (this.used[i]) continue;
      const it = items[i];
      switch (it.t) {
        case "gate":
          if (s0 < it.s && s >= it.s) this.gate(it, i);
          break;
        case "pile":
          if (this.y < 0.7 && Math.abs(it.s - s) < r + 0.45 && Math.abs(it.x - this.x) < r + 0.45) {
            this.used[i] = 1;
            this.grow(it.v);
            this.emit({ type: "pile", id: i, v: it.v, size: this.size });
          }
          break;
        case "flake": {
          const reach = r + 0.45 + this.magnet;
          const dy = Math.abs(this.y + r - it.y);
          if (dy < r + 0.8 + this.magnet * 0.5 && Math.hypot(it.s - s, it.x - this.x) < reach) {
            this.used[i] = 1;
            this.coins++;
            this.emit({ type: "flake", id: i, far: Math.hypot(it.s - s, it.x - this.x) > r + 0.6 });
          }
          break;
        }
        case "ramp":
          if (!this.air && s0 < it.s && s >= it.s && this.x > it.x0 - 0.2 && this.x < it.x1 + 0.2) {
            this.air = true;
            this.vy = JUMP;
            this.emit({ type: "jump", id: i });
          }
          break;
        default:
          if (this.invuln <= 0 && HAZARD_KINDS.has(it.t) && touches(it, s, this.x, this.y, r, this.time)) this.hit(it, i);
      }
      if (this.mode !== "run") return;
    }
    // мост: центр кома должен быть над ним
    if (!this.air && Math.abs(this.x) > BRIDGE_HALF + 0.15 && bridgeAt(L, s)) {
      this.mode = "falling";
      this.failS = s;
      this.vy = 0;
      this.vx = Math.sign(this.x) * 3;
      this.emit({ type: "fall" });
      return;
    }
    // контрольная точка после каждых ворот
    const g = L.gates[this.checkGate];
    if (g && s > g.s + 1.5) {
      this.checkGate++;
      this.save();
    }
    if (s >= L.length) {
      this.mode = "finale";
      this.finaleSize = this.size;
      this.emit({ type: "finale", size: this.size });
    }
  }

  grow(v) {
    this.size = clamp(this.size + v, 0, MAX_SIZE);
    this.peak = Math.max(this.peak, this.size);
  }

  gate(it, i) {
    this.used[i] = 1;
    let k = it.panels.findIndex((p) => this.x >= p.x0 && this.x < p.x1);
    if (k < 0) k = this.x < 0 ? 0 : it.panels.length - 1;
    const op = it.panels[k].op;
    const before = this.size;
    this.size = applyGate(op, before);
    this.peak = Math.max(this.peak, this.size);
    this.emit({ type: "gate", id: i, panel: k, op, before, after: this.size, good: isGood(op), best: k === it.best });
    if (this.size <= 0) this.melt();
  }

  hit(it, i) {
    this.used[i] = 1;
    const dmg = Math.min(this.size, damage(it.t, this.size));
    this.size -= dmg;
    this.lost += dmg;
    this.hits++;
    this.invuln = 0.35;
    if (it.t === "rock") this.vx += Math.sign(this.x - it.x || 1) * 6;
    this.emit({ type: "hit", id: i, kind: it.t, dmg, size: this.size });
    if (this.size <= 0) this.melt();
  }

  melt() {
    this.size = 0;
    this.failS = this.s;
    this.emit({ type: "melt" });
    this.fail("melt");
  }

  fail(reason) {
    this.mode = "fail";
    this.failReason = reason;
    if (!this.failS) this.failS = this.s;
    this.emit({ type: "fail", reason });
  }

  win() {
    this.mode = "won";
    this.mult = Math.max(1, this.stair);
    this.emit({ type: "won", mult: this.mult, size: this.size });
  }

  finale(r) {
    const F = this.level.finale;
    const s = this.s;
    if (this.rest !== null) return;
    if (F.kind === "fortress") {
      const w = this.walls[this.wall];
      if (w && s + r >= w.s - 0.75) {
        if (this.size > w.left) {
          this.size -= w.left;
          w.left = 0;
          w.broken = true;
          this.emit({ type: "wall", k: this.wall, broke: true, size: this.size });
          this.wall++;
          this.slow = 0.18;
        } else {
          // крепость устояла: ком отдаёт ей весь снег, кроме последнего комочка
          w.left -= this.size - 1;
          this.size = 1;
          this.rest = this.s;
          this.emit({ type: "wall", k: this.wall, broke: false, size: this.size, left: w.left });
          return;
        }
      }
    } else if (!this.bossDown) {
      const b = F.boss;
      if (s + r >= b.s - 2.6) {
        if (this.size > b.hp) {
          this.size -= b.hp;
          this.bossDown = true;
          this.slow = 0.35;
          this.emit({ type: "boss", win: true, size: this.size });
        } else {
          this.mode = "bounce";
          this.restTimer = 0;
          this.failS = s;
          this.emit({ type: "boss", win: false, size: this.size });
          return;
        }
      }
    }
    const B = F.bonus;
    if (s >= B.s && this.stair === 0) {
      this.stair = 1;
      this.emit({ type: "step", k: 1, size: this.size });
    }
    if (this.stair > 0 && this.rest === null) {
      const edge = B.s + this.stair * B.len;
      if (this.stair >= B.steps) {
        if (s >= edge - B.len * 0.5) this.rest = s;
      } else {
        // за 4 единицы до края ступени ком «платит» снегом за следующую или тормозит
        if (!this.decided && s >= edge - 4) {
          this.decided = true;
          if (this.size > B.cost) {
            this.size -= B.cost;
            this.payNext = true;
            this.emit({ type: "pay", cost: B.cost, size: this.size });
          } else this.rest = edge - 1.2;
        }
        if (this.payNext && s >= edge) {
          this.payNext = false;
          this.decided = false;
          this.stair++;
          this.emit({ type: "step", k: this.stair, size: this.size });
        }
      }
    }
  }

  // ---------- «Продолжить с этого места» ----------
  canContinue() {
    return this.mode === "fail" && !this.continued;
  }
  continueRun() {
    if (!this.canContinue()) return false;
    const L = this.level;
    let cp = this.checkpoints[0];
    for (const c of this.checkpoints) if (c.s <= this.failS - 6 || (this.failReason === "boss" && c.s <= L.length)) cp = c;
    this.s = cp.s;
    this.x = cp.x;
    this.coins = cp.coins;
    this.used = cp.used.slice();
    this.lo = cp.lo;
    this.checkGate = cp.gate;
    this.checkpoints = this.checkpoints.filter((c) => c.s <= cp.s);
    let size = Math.max(3, Math.round(cp.size * 1.3));
    if (this.failReason === "boss") size = Math.max(size, Math.ceil(L.finale.boss.hp * 1.15));
    this.size = size;
    this.peak = Math.max(this.peak, size);
    this.y = this.vy = this.vx = 0;
    this.air = false;
    this.mode = this.s >= L.length ? "finale" : "run";
    this.time = this.s / L.speed;
    this.invuln = 2;
    this.rest = null;
    this.restTimer = 0;
    this.fallTimer = 0;
    this.failReason = null;
    this.failS = 0;
    this.continued = true;
    this.emit({ type: "continue", size });
    return true;
  }
}
