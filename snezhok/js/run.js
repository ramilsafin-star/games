// Заезд «Снежного кома»: движение кома по трассе, ворота, подбор, удары, финал.
// Чистая логика без графики. Время заезда на трассе — путь / скорость, поэтому положение
// движущихся препятствий в каждой точке трассы заранее известно (и проверкам, и роботу).
import { HALF, LATERAL, GRAVITY, JUMP, BRIDGE_HALF, MAX_SIZE, START, radiusOf, applyGate, isGood, damage, touches, clamp, MONSTER, WEAPON, AVALANCHE, DRAIN, isMonster, impX, shotDamage, crushGain, bonkDamage } from "./rules.js?v=dba1bb88";
import { bridgeAt } from "./levels.js?v=dba1bb88";

const HAZARD_KINDS = new Set(["rock", "fence", "spikes", "log", "hole", "crusher", "geyser", "snowball", "volley"]);

export class Run {
  constructor(level, opts = {}) {
    this.level = level;
    this.startSize = Math.max(1, Math.round(opts.start ?? START));
    this.magnet = opts.magnet ?? 0;
    // оружие: длительности и скорострельность — из улучшений; ammo — снежки пушки «с собой» (ролик)
    this.gunTime = opts.gunTime ?? WEAPON.gun.time;
    this.gunRate = opts.gunRate ?? WEAPON.gun.rate;
    this.spikeTime = opts.spikeTime ?? WEAPON.spike.time;
    this.ammo0 = opts.ammo ?? 0;
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
    // монстры: сколько снега у каждого осталось (пушка отбивает понемногу), сколько побеждено
    this.hp = new Float32Array(L.items.length);
    L.items.forEach((it, i) => isMonster(it) && (this.hp[i] = it.hp));
    this.kills = { imp: 0, yeti: 0, thrower: 0, spirit: 0, all: 0 };
    this.gunT = 0;
    this.ammo = this.ammo0;
    this.spikeT = 0;
    this.boostT = 0;
    this.shotCD = 0;
    this.shots = []; // летящие снежки пушки
    this.shotN = 0;
    this.spirit = null; // дух, который сейчас тянет снег
    this.drainAcc = 0;
    this.drainShown = 0;
    this.chase = null; // идущая погоня лавины
    this.chaseDone = 0; // сколько погонь уже позади
    this.bossHp = L.finale.boss ? L.finale.boss.hp : 0;
    this.save();
  }
  get armed() {
    return this.gunT > 0 || this.ammo > 0;
  }
  get questProgress() {
    const q = this.level.quest;
    if (!q) return 0;
    return q.kind === "any" ? this.kills.all : this.kills[q.kind];
  }
  get questDone() {
    const q = this.level.quest;
    return !!q && this.questProgress >= q.need;
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
    this.checkpoints.push({ s: this.s, x: this.x, size: this.size, coins: this.coins, used: this.used.slice(), lo: this.lo, gate: this.checkGate, hp: this.hp?.slice(), kills: this.kills && { ...this.kills }, chaseDone: this.chaseDone });
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
    else if (this.boostT > 0) v *= WEAPON.boost.k;
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
    if (this.mode === "run" || this.mode === "finale") this.weapons(dt);
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
        case "gun":
        case "spike":
        case "wave":
        case "boost":
          if (this.y < 2 && Math.abs(it.s - s) < r + 0.7 && Math.abs(it.x - this.x) < r + 0.8) this.pickup(it, i);
          break;
        case "yeti":
        case "thrower":
        case "imp":
          if (touches(it, s, this.x, this.y, r, this.time)) this.meet(it, i);
          break;
        case "spirit":
          if (!this.spirit && s >= it.s - 16) {
            this.spirit = { i, it, life: it.life, tick: 0.5 };
            this.emit({ type: "spirit", id: i });
          }
          break;
        case "snowball":
          if (this.used[it.owner]) break; // страшила разбита — снежков больше нет
        // fall through
        default:
          if (this.invuln <= 0 && HAZARD_KINDS.has(it.t) && touches(it, s, this.x, this.y, r, this.time)) this.hit(it, i);
      }
      if (this.mode !== "run") return;
    }
    // лавина-йети: погоня начинается на своём участке
    const ch = L.chases?.[this.chaseDone];
    if (!this.chase && ch && s >= ch.s0) {
      this.chase = { gap: AVALANCHE.gap, s1: ch.s1 };
      this.emit({ type: "chase", gap: this.chase.gap });
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
    // снежки страшилы и снежища снеговика летят снова и снова; остальное — один раз
    if (it.t !== "snowball" && it.t !== "volley") this.used[i] = 1;
    if (this.chase) this.chase.gap -= AVALANCHE.stumble;
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
        // ледяные шипы пробивают снеговика на четверть легче
        const need = Math.ceil(this.bossHp * (this.spikeT > 0 ? 0.75 : 1));
        if (this.size > need) {
          this.size -= need;
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

  // ---------- Монстры ----------
  // ком встретил монстра: шипы и размер больше числа — сминает, иначе бесёнок кусает, а йети отбрасывает
  meet(it, i) {
    if (it.t === "imp") {
      if (this.spikeT > 0) return this.kill(i, "spike");
      const dmg = Math.min(this.size, it.v);
      this.size -= dmg;
      this.lost += dmg;
      this.hits++;
      if (this.chase) this.chase.gap -= AVALANCHE.stumble * 0.5;
      this.kill(i, "bite");
      this.emit({ type: "bite", id: i, dmg, size: this.size });
      if (this.size <= 0) this.melt();
      return;
    }
    if (this.spikeT > 0 || this.size > this.hp[i]) return this.kill(i, this.spikeT > 0 ? "spike" : "crush");
    const dmg = Math.min(this.size, bonkDamage(this.size));
    this.used[i] = 1;
    this.size -= dmg;
    this.lost += dmg;
    this.hits++;
    this.invuln = 0.4;
    this.slow = 0.25;
    this.vx += Math.sign(this.x - it.x || 1) * 9;
    if (this.chase) this.chase.gap -= AVALANCHE.stumble;
    this.emit({ type: "bonk", id: i, dmg, size: this.size });
    if (this.size <= 0) this.melt();
  }
  kill(i, how) {
    const it = this.level.items[i];
    this.used[i] = 1;
    this.hp[i] = 0;
    this.kills[it.t]++;
    this.kills.all++;
    let gain = 0;
    // смятый ком йети или страшилы отдаёт часть снега; разбитый снежками или волной — только снежинки
    if ((it.t === "yeti" || it.t === "thrower") && (how === "crush" || how === "spike")) {
      gain = crushGain(it.hp);
      this.grow(gain);
    }
    const coins = MONSTER[it.t].coins - (how === "bite" ? 1 : 0);
    this.coins += coins;
    if (this.spirit && this.spirit.i === i) this.spirit = null;
    this.emit({ type: "kill", id: i, kind: it.t, how, gain, coins, size: this.size });
  }
  pickup(it, i) {
    this.used[i] = 1;
    if (it.t === "gun") this.gunT = this.gunTime;
    else if (it.t === "spike") this.spikeT = this.spikeTime;
    else if (it.t === "boost") this.boostT = WEAPON.boost.time;
    this.emit({ type: "pickup", id: i, kind: it.t });
    if (it.t === "wave") this.wave();
  }
  // снежная волна: все монстры рядом разлетаются
  wave() {
    const items = this.level.items;
    const W = WEAPON.wave;
    for (let i = this.lo; i < items.length; i++) {
      const it = items[i];
      if (it.s > this.s + W.ahead) break;
      if (it.s < this.s - W.behind || this.used[i] || !isMonster(it) || it.t === "spirit") continue;
      this.kill(i, "wave");
    }
    if (this.spirit) this.kill(this.spirit.i, "wave");
    this.emit({ type: "wave" });
  }
  // где сейчас дух: летит чуть впереди кома и покачивается
  spiritPos() {
    const sp = this.spirit;
    if (!sp) return null;
    return { s: this.s + 4.5, x: this.x * 0.4 + Math.sin(sp.life * 2.2) * 2, y: 2.6 + Math.sin(sp.life * 3.1) * 0.4 };
  }

  // ---------- Оружие, дух и лавина ----------
  weapons(dt) {
    const L = this.level;
    this.gunT = Math.max(0, this.gunT - dt);
    this.spikeT = Math.max(0, this.spikeT - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    // пушка стреляет сама по ближайшей цели, которую ком сам не сомнёт
    this.shotCD -= dt;
    if (this.armed && this.shotCD <= 0) {
      const tgt = this.target();
      if (tgt) {
        this.shotCD = 1 / this.gunRate;
        if (this.gunT <= 0) this.ammo--;
        const shot = { n: ++this.shotN, s: this.s + this.radius * 0.6, x: this.x, y: this.y + this.radius * 1.6, tgt, life: 1.5 };
        this.shots.push(shot);
        this.emit({ type: "shot", n: shot.n });
      }
    }
    for (let k = this.shots.length - 1; k >= 0; k--) {
      const sh = this.shots[k];
      sh.life -= dt;
      const p = this.aim(sh.tgt);
      if (!p || sh.life <= 0) {
        this.shots.splice(k, 1);
        continue;
      }
      sh.s += (this.v + WEAPON.gun.speed) * dt;
      const f = Math.min(1, dt * 12);
      sh.x += (p.x - sh.x) * f;
      sh.y += (p.y - sh.y) * f;
      if (sh.s >= p.s - 0.6) {
        this.shots.splice(k, 1);
        this.impact(sh, p);
        if (this.mode === "fail") return;
      }
    }
    // метельный дух тянет снег, пока его не собьют или он не улетит
    const sp = this.spirit;
    if (sp && this.mode !== "run") {
      this.used[sp.i] = 1;
      this.spirit = null;
    } else if (sp) {
      sp.life -= dt;
      if (sp.life <= 0) {
        this.used[sp.i] = 1;
        this.spirit = null;
        this.emit({ type: "spirit-away", id: sp.i });
      } else {
        this.drainAcc += this.size * DRAIN * dt;
        if (this.drainAcc >= 1) {
          const dmg = Math.min(this.size, Math.floor(this.drainAcc));
          this.drainAcc -= dmg;
          this.size -= dmg;
          this.lost += dmg;
          this.drainShown += dmg;
        }
        sp.tick -= dt;
        if (sp.tick <= 0 && this.drainShown) {
          sp.tick = 0.5;
          this.emit({ type: "drain", dmg: this.drainShown, size: this.size });
          this.drainShown = 0;
        }
        if (this.size <= 0) return this.melt();
      }
    }
    // лавина: она чуть быстрее кома; удары её подпускают, ускорения отрывают
    const ch = this.chase;
    if (ch && this.mode === "run") {
      ch.gap += (this.v - L.speed * AVALANCHE.k) * dt;
      if (ch.gap <= 0) {
        const dmg = Math.min(this.size, Math.max(1, Math.ceil(this.size * AVALANCHE.bite)));
        this.size -= dmg;
        this.lost += dmg;
        this.chase = null;
        this.chaseDone++;
        this.emit({ type: "chase-end", caught: true, dmg, size: this.size });
        if (this.size <= 0) this.melt();
      } else if (this.s >= ch.s1) {
        this.coins += AVALANCHE.coins;
        this.chase = null;
        this.chaseDone++;
        this.emit({ type: "chase-end", caught: false, coins: AVALANCHE.coins });
      }
    } else if (ch) this.chase = null;
  }
  // цель для пушки: дух, бесята, страшилы, слишком крупные йети, камень или забор прямо на пути;
  // в финале — снеговик или ближняя стена
  target() {
    const L = this.level;
    const s = this.s;
    if (this.mode === "finale") {
      const F = L.finale;
      if (F.kind === "boss") return !this.bossDown && s < F.boss.s - 4 ? { kind: "boss" } : null;
      const w = this.walls[this.wall];
      return w && !w.broken && w.s - s < 24 && w.s - s > 2 ? { kind: "wall", k: this.wall } : null;
    }
    if (this.spirit) return { kind: "spirit" };
    const items = L.items;
    const r = this.radius;
    for (let i = this.lo; i < items.length; i++) {
      const it = items[i];
      if (it.s > s + WEAPON.gun.range) break;
      if (it.s < s + 1.5 || this.used[i]) continue;
      let want = false;
      if (it.t === "imp" || it.t === "thrower") want = true;
      else if (it.t === "yeti") want = this.spikeT <= 0 && this.hp[i] >= this.size;
      else if (it.t === "rock") want = it.s < s + 16 && Math.abs(it.x - this.x) < r + it.r + 0.6;
      else if (it.t === "fence") want = it.s < s + 16 && this.x > it.x0 - r && this.x < it.x1 + r;
      if (want) return { kind: "item", i };
    }
    return null;
  }
  // где цель сейчас (null — цели уже нет)
  aim(tgt) {
    const L = this.level;
    if (tgt.kind === "spirit") return this.spiritPos();
    if (tgt.kind === "boss") return this.bossDown ? null : { s: L.finale.boss.s, x: 0, y: 5 };
    if (tgt.kind === "wall") {
      const w = this.walls[tgt.k];
      return w && !w.broken ? { s: w.s, x: this.x, y: 2 } : null;
    }
    if (this.used[tgt.i]) return null;
    const it = L.items[tgt.i];
    if (it.t === "imp") return { s: it.s, x: impX(it, this.time), y: 0.6 };
    if (it.t === "fence") return { s: it.s, x: clamp(this.x, it.x0, it.x1), y: 0.8 };
    return { s: it.s, x: it.x, y: it.t === "rock" ? 0.5 : 1.6 };
  }
  impact(sh, p) {
    const tgt = sh.tgt;
    const L = this.level;
    const dmg = shotDamage(this.size);
    if (tgt.kind === "boss") {
      const k = Math.max(1, Math.ceil(L.finale.boss.hp * 0.03));
      this.bossHp = Math.max(1, this.bossHp - k);
      this.emit({ type: "pow", boss: true, dmg: k, n: sh.n, s: p.s, x: p.x, y: p.y });
    } else if (tgt.kind === "wall") {
      const w = this.walls[tgt.k];
      const k = Math.max(1, Math.ceil(w.hp * 0.06));
      w.left = Math.max(1, w.left - k);
      this.emit({ type: "pow", wall: tgt.k, left: w.left, dmg: k, n: sh.n, s: p.s, x: p.x, y: p.y });
    } else if (tgt.kind === "spirit") {
      const i = this.spirit.i;
      this.hp[i] -= dmg;
      this.emit({ type: "pow", id: i, dmg, n: sh.n, s: p.s, x: p.x, y: p.y });
      if (this.hp[i] <= 0) this.kill(i, "shot");
    } else {
      const i = tgt.i;
      const it = L.items[i];
      if (it.t === "rock" || it.t === "fence") {
        this.used[i] = 1;
        this.emit({ type: "smash", id: i, n: sh.n, s: p.s, x: p.x, y: p.y });
      } else {
        this.hp[i] -= dmg;
        this.emit({ type: "pow", id: i, dmg, n: sh.n, s: p.s, x: p.x, y: p.y });
        if (this.hp[i] <= 0) this.kill(i, "shot");
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
    if (this.failReason === "boss") size = Math.max(size, Math.ceil(this.bossHp * 1.15));
    if (cp.hp) this.hp = cp.hp.slice();
    if (cp.kills) this.kills = { ...cp.kills };
    this.chaseDone = cp.chaseDone ?? this.chaseDone;
    this.chase = this.spirit = null;
    this.gunT = this.spikeT = this.boostT = 0;
    this.shots.length = 0;
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
