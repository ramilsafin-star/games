// Правила «Патруля рифа» без графики: их можно гонять в Node (см. tests/sim.mjs).
// Рейс — восемь глубин. На четвёртой ждёт Клешня-великан, на восьмой — Кракен-9.
// После глубин 2, 4 и 6 игрок выбирает один модуль из трёх случайных.
// packs — стаи: роботы одной стаи (через пробел) приходят вместе, между стаями пауза gap секунд.
// У глубины с боссом стаи — это подмога: приходят по кругу, пока босс жив.
export const DEPTHS = [
  { name: "Коралловый сад", gap: 1.9, packs: ["crab", "crab", "jelly", "crab crab", "jelly", "crab crab"] },
  { name: "Фиолетовый каньон", gap: 1.9, packs: ["jelly", "mine mine", "crab crab", "jelly jelly", "mine crab", "crab crab jelly", "mine mine"] },
  { name: "Светящаяся пещера", gap: 1.9, packs: ["crab crab", "puffer", "jelly mine", "crab crab crab", "puffer puffer", "jelly jelly", "mine mine crab", "puffer crab crab"] },
  { name: "Клешня-великан", boss: "titan", gap: 6.5, packs: ["crab crab", "jelly", "mine mine"] },
  { name: "Затонувший корабль", gap: 1.9, packs: ["eel", "crab crab jelly", "puffer mine", "eel jelly", "crab crab crab", "mine mine jelly", "eel puffer", "crab crab jelly jelly"] },
  { name: "Тёмная впадина", gap: 1.8, packs: ["mine mine mine", "eel jelly", "puffer puffer crab", "jelly jelly mine", "eel eel", "crab crab crab mine", "puffer jelly jelly", "mine mine eel", "crab crab puffer"] },
  { name: "Сад медуз", gap: 1.8, packs: ["jelly jelly jelly", "eel puffer", "jelly jelly mine mine", "crab crab crab", "puffer puffer jelly", "eel eel jelly", "jelly jelly jelly crab", "mine mine mine", "puffer eel jelly jelly", "crab crab jelly jelly"] },
  { name: "Логово Кракена", boss: "boss", gap: 7, packs: ["jelly", "eel", "puffer", "mine mine", "crab crab"] },
];
const UPGRADE_AFTER = new Set([2, 4, 6]);

// hit — урон при столкновении; sturdy — от столкновения сам не гибнет
const UNITS = {
  crab: { hp: 25, radius: 0.96, points: 60, hit: 15 },
  jelly: { hp: 31, radius: 0.97, points: 85, hit: 12 },
  mine: { hp: 24, radius: 0.82, points: 100, hit: 23 },
  // ёж подплывает, раздувается и лопается кольцом зарядов; сбитый издалека не стреляет
  puffer: { hp: 34, radius: 0.92, points: 110, hit: 14 },
  // угорь выбирает ряд, предупреждает полосой и проносится через всю арену
  eel: { hp: 40, radius: 0.85, points: 130, hit: 18, sturdy: true },
  titan: { hp: 480, radius: 1.75, points: 600, hit: 22, sturdy: true },
  boss: { hp: 900, radius: 2.3, points: 1000, hit: 25, sturdy: true },
};

// Модули: что каждый меняет у субмарины. Брать можно повторно, эффекты складываются.
export const MODULES = ["rapid", "armor", "twin", "magnet", "pulse", "engine"];

export const PULSE_RADIUS = 8.8;
const PULSE_INTERVAL = 7.5;
const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export class Patrol {
  constructor(random = Math.random) {
    this.random = random;
    this.bounds = { x: 5.2, near: 9, far: -10 };
    this.reset();
  }

  reset() {
    this.mode = "menu";
    this.wave = 0;
    this.time = 0;
    this.score = 0;
    this.destroyed = 0;
    this.collected = 0;
    this.combo = 0;
    this.comboUntil = 0;
    this.bestCombo = 0;
    this.retries = 0;
    this.ease = 0; // сколько раз подряд игрок погиб на этой глубине: с каждым разом роботы слабее
    this.modules = []; // взятые модули по порядку
    this.serial = 0;
    this.player = {
      x: 0, z: 6.5, vx: 0, vz: 0, yaw: 0, health: 100, maxHealth: 100,
      cooldown: 0, protection: 0, pulseShield: 0, nextShot: 0, interval: 0.29,
      barrels: 1, magnet: 0, pulseRate: 1, pulsePower: 1, speed: 1,
    };
    this.beam = null;
    this.lanes = []; // полосы, по которым вот-вот пронесётся угорь или великан
    this.offer = [];
    this.queue = [];
    this.enemies = [];
    this.shots = [];
    this.pearls = [];
    this.events = [];
  }

  start() {
    this.reset();
    this.nextWave();
  }

  nextWave() {
    const depth = DEPTHS[this.wave];
    if (!depth) return;
    this.wave++;
    this.mode = "play";
    // небольшой ремонт перед каждой глубиной, перед боссом — основательный
    this.player.health = Math.min(this.player.maxHealth, this.player.health + (depth.boss ? 45 : 10));
    this.queue = [];
    let at = this.time + 0.6;
    if (depth.boss) {
      this.queue.push({ kind: depth.boss, at });
      at += 1;
    }
    // подмоги боссу хватит на полторы минуты; когда босс гибнет, очередь стирается
    const count = depth.boss ? Math.ceil(90 / depth.gap) : depth.packs.length;
    for (let i = 0; i < count; i++) {
      if (depth.boss) at += depth.gap;
      const kinds = depth.packs[i % depth.packs.length].split(" ");
      kinds.forEach((kind, k) => this.queue.push({ kind, at, slot: kinds.length > 1 ? (k + 0.5) / kinds.length : null }));
      if (!depth.boss) at += depth.gap;
    }
    this.emit("wave", { wave: this.wave, name: depth.name });
  }

  // три разных модуля на выбор; третий ствол — предел
  makeOffer() {
    const pool = MODULES.filter(kind => kind !== "twin" || this.player.barrels < 3);
    const offer = [];
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    return offer;
  }

  upgrade(kind) {
    if (this.mode !== "upgrade" || !this.offer.includes(kind)) return;
    const p = this.player;
    if (kind === "rapid") p.interval *= 0.76;
    else if (kind === "armor") {
      p.maxHealth += 35;
      p.health = Math.min(p.maxHealth, p.health + 55);
    } else if (kind === "twin") p.barrels++;
    else if (kind === "magnet") p.magnet++;
    else if (kind === "pulse") {
      p.pulseRate *= 0.72;
      p.pulsePower *= 1.3;
    } else if (kind === "engine") p.speed *= 1.14;
    this.modules.push(kind);
    this.offer = [];
    this.nextWave();
  }

  // после гибели: та же глубина заново, модули остаются, счёт меньше на четверть
  retry() {
    if (this.mode !== "lost") return;
    this.score = Math.round(this.score * 0.75);
    this.retries++;
    this.ease++;
    this.combo = 0;
    this.beam = null;
    this.enemies.length = this.shots.length = this.pearls.length = this.lanes.length = 0;
    const p = this.player;
    Object.assign(p, { x: 0, z: 6.5, vx: 0, vz: 0, health: p.maxHealth, cooldown: 0, protection: 1.5, pulseShield: 0 });
    this.wave--;
    this.nextWave();
    p.health = p.maxHealth;
  }

  emit(type, values = {}) {
    this.events.push({ type, ...values });
  }

  spawn(kind, slot = null) {
    const unit = UNITS[kind];
    const halfWidth = this.bounds.x;
    const large = kind === "boss" || kind === "titan";
    // рядовые роботы крепчают с глубиной: к седьмой — в полтора раза
    const hp = Math.round(unit.hp * (large ? 1 : 1 + 0.09 * (this.wave - 1)) * this.mercy());
    // стая встаёт в ряд по своим местам, одиночка — где придётся
    const spread = slot === null ? this.random() * 1.54 - 0.77 : (slot - 0.5) * 1.6 + (this.random() - 0.5) * 0.24;
    const side = this.random() < 0.5 ? -1 : 1;
    const enemy = {
      id: ++this.serial,
      kind,
      x: large ? 0 : kind === "eel" ? side * (halfWidth - 0.3) : spread * halfWidth,
      z: large ? -8.4 : -10.8,
      radius: unit.radius,
      health: hp,
      maxHealth: hp,
      age: 0,
      phase: this.random() * TAU,
      fire: kind === "boss" ? 2.3 : 1.8 + this.random() * 0.9,
      beamIn: 2.4,
      flash: 0,
      yaw: Math.PI,
      swell: 0, // ёж: 0 — плывёт, до 1 — раздувается
      state: kind === "eel" ? "track" : "stalk", // угорь и великан
      timer: kind === "eel" ? 1.6 : 2.4,
      side,
      lane: null,
    };
    this.enemies.push(enemy);
  }

  movePlayer(dt, move) {
    const p = this.player;
    const x = move.target ? (move.target.x - p.x) * 7.2 : move.x * 11.8;
    const z = move.target ? (move.target.z - p.z) * 7.2 : move.z * 11.8;
    const speed = Math.max(1, Math.hypot(x, z) / (14.6 * p.speed));
    const blend = Math.min(1, dt * 16);
    p.vx += (x / speed - p.vx) * blend;
    p.vz += (z / speed - p.vz) * blend;
    p.x = clamp(p.x + p.vx * dt, -this.bounds.x, this.bounds.x);
    p.z = clamp(p.z + p.vz * dt, this.bounds.far, this.bounds.near);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.protection = Math.max(0, p.protection - dt);
    p.pulseShield = Math.max(0, p.pulseShield - dt);
  }

  fireFrom(entity, yaw, speed, friendly, shift = 0) {
    const vx = -Math.sin(yaw) * speed;
    const vz = -Math.cos(yaw) * speed;
    const offset = friendly ? 0.75 : entity.radius * 0.73;
    this.shots.push({
      id: ++this.serial,
      // shift — сдвиг вбок от линии выстрела, чтобы стволы били рядом
      x: entity.x + vx / speed * offset + Math.cos(yaw) * shift,
      z: entity.z + vz / speed * offset - Math.sin(yaw) * shift,
      vx, vz, friendly, life: 1.85,
      heavy: entity.kind === "boss",
      // чем больше стволов, тем слабее каждый заряд: 9, 2×6.5, 3×5.5
      power: friendly ? [9, 6.5, 5.5][entity.barrels - 1] : 0,
    });
  }

  autoFire() {
    const p = this.player;
    let closest = Infinity;
    let target;
    for (const enemy of this.enemies) {
      const distance = distSq(p, enemy);
      if (distance < closest) {
        target = enemy;
        closest = distance;
      }
    }
    if (!target) return;
    p.yaw = Math.atan2(p.x - target.x, p.z - target.z);
    if (p.nextShot > this.time) return;
    p.nextShot = this.time + p.interval;
    const n = p.barrels;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      this.fireFrom(p, p.yaw + k * 0.05, 28, true, k * 0.42);
    }
    this.emit("shot", { x: p.x, z: p.z });
  }

  moveEnemy(enemy, dt) {
    const p = this.player;
    enemy.age += dt;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.lane = null;
    const dx = p.x - enemy.x;
    const dz = p.z - enemy.z;
    let yaw = Math.atan2(-dx, -dz);
    if (enemy.kind === "crab") {
      enemy.x += (clamp(dx * 0.85, -2.3, 2.3) + Math.cos(enemy.age * 4 + enemy.phase) * 1.5) * dt;
      enemy.z += clamp(dz * 1.25, -2.0, this.wave === 1 ? 3.1 : 3.7) * dt;
    } else if (enemy.kind === "mine") {
      const distance = Math.hypot(dx, dz) || 1;
      const speed = distance < 4 ? 5.3 : 3.7;
      enemy.x += dx / distance * dt * speed;
      enemy.z += dz / distance * dt * speed;
    } else if (enemy.kind === "puffer") {
      const distance = Math.hypot(dx, dz) || 1;
      if (enemy.swell > 0) {
        enemy.swell += dt / 1.05;
        if (enemy.swell >= 1) {
          for (let i = 0; i < 8; i++) this.fireFrom(enemy, i / 8 * TAU + enemy.phase, 6.2, false);
          this.emit("pop", { x: enemy.x, z: enemy.z });
          this.destroy(enemy, false);
          return;
        }
      } else {
        enemy.x += (dx / distance * 2.0 + Math.cos(enemy.age * 2.2 + enemy.phase) * 0.9) * dt;
        enemy.z += dz / distance * 2.0 * dt;
        if (distance < 4.3) {
          enemy.swell = 0.001;
          this.emit("swell", { x: enemy.x, z: enemy.z });
        }
      }
    } else if (enemy.kind === "eel") {
      const post = this.bounds.x - 0.3;
      enemy.timer -= dt;
      if (enemy.state === "track") {
        // скользит вдоль края к ряду, где сейчас игрок
        enemy.x += clamp((enemy.side * post - enemy.x) * 4, -9, 9) * dt;
        enemy.z += clamp((clamp(p.z, this.bounds.far + 1, this.bounds.near) - enemy.z) * 2.6, -6.5, 6.5) * dt;
        yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (enemy.timer <= 0) {
          enemy.state = "warn";
          enemy.timer = 0.8;
          this.emit("lane-warning", { row: true });
        }
      } else if (enemy.state === "warn") {
        yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        enemy.lane = { row: true, at: enemy.z, heat: 1 - enemy.timer / 0.8, live: false };
        if (enemy.timer <= 0) {
          enemy.state = "dash";
          this.emit("dash", { x: enemy.x, z: enemy.z });
        }
      } else {
        yaw = enemy.side > 0 ? Math.PI / 2 : -Math.PI / 2;
        enemy.x -= enemy.side * 17 * dt;
        enemy.lane = { row: true, at: enemy.z, heat: 1, live: true };
        if (enemy.x * -enemy.side >= post) {
          enemy.x = -enemy.side * post;
          enemy.side = -enemy.side;
          enemy.state = "track";
          enemy.timer = 1.5;
        }
      }
    } else if (enemy.kind === "titan") {
      const wild = enemy.health < enemy.maxHealth / 2;
      enemy.timer -= dt;
      yaw = Math.PI;
      if (enemy.state === "stalk") {
        enemy.x += clamp(dx * 1.6, -2.7, 2.7) * dt;
        enemy.z += clamp((-6.2 - enemy.z) * 1.6, -4, 4) * dt;
        enemy.fire -= dt;
        if (enemy.fire <= 0) {
          // щёлкает клешнями: заряды веером
          const aim = Math.atan2(-dx, -dz);
          const count = wild ? 4 : 2;
          for (let i = 0; i < count; i++) this.fireFrom(enemy, aim + (i - (count - 1) / 2) * 0.3, 7.6, false);
          enemy.fire = wild ? 1.05 : 1.35;
          this.emit("enemy-shot", { x: enemy.x, z: enemy.z, kind: enemy.kind });
        }
        if (enemy.timer <= 0) {
          enemy.state = "warn";
          enemy.timer = 0.85;
          this.emit("lane-warning", { row: false });
        }
      } else if (enemy.state === "warn") {
        enemy.lane = { row: false, at: enemy.x, heat: 1 - enemy.timer / 0.85, live: false };
        if (enemy.timer <= 0) {
          enemy.state = "charge";
          this.emit("dash", { x: enemy.x, z: enemy.z });
        }
      } else if (enemy.state === "charge") {
        enemy.z += 15 * dt;
        enemy.lane = { row: false, at: enemy.x, heat: 1, live: true };
        if (enemy.z >= this.bounds.near - 0.6) enemy.state = "return";
      } else {
        enemy.z -= 6.5 * dt;
        if (enemy.z <= -6.2) {
          enemy.state = "stalk";
          enemy.timer = wild ? 2.0 : 2.8;
          enemy.fire = 0.5;
        }
      }
    } else {
      const boss = enemy.kind === "boss";
      const goalX = Math.sin(enemy.age * (boss ? 0.76 : 1.15) + enemy.phase) * this.bounds.x * (boss ? 0.56 : 0.78);
      const goalZ = boss ? -6.65 + Math.sin(enemy.age * 0.85) * 1.35 : -4.8 + Math.sin(enemy.phase + enemy.age * 1.18) * 1.8;
      enemy.x += clamp((goalX - enemy.x) * 1.6, -4.2, 4.2) * dt;
      enemy.z += clamp((goalZ - enemy.z) * 1.3, -4.4, 4.4) * dt;
      enemy.fire -= dt;
      if (boss) {
        enemy.beamIn -= dt;
        if (enemy.beamIn <= 0 && !this.beam) {
          const wild = enemy.health < enemy.maxHealth / 2;
          enemy.beamIn = wild ? 1.75 : 2.3;
          this.beam = { x: p.x, z: enemy.z - 0.2, charge: 1.0, flash: 0.38 };
          this.emit("beam-warning");
        }
      }
      if (enemy.fire <= 0) {
        const wild = boss && enemy.health < enemy.maxHealth / 2;
        const count = boss ? wild ? 5 : 3 : 1;
        for (let i = 0; i < count; i++) this.fireFrom(enemy, yaw + (i - (count - 1) / 2) * 0.22, boss ? 8.4 : 7.4, false);
        enemy.fire = boss ? wild ? 1.12 : 1.73 : 2.3;
        this.emit("enemy-shot", { x: enemy.x, z: enemy.z, kind: enemy.kind });
      }
    }
    enemy.x = clamp(enemy.x, -this.bounds.x, this.bounds.x);
    enemy.yaw = yaw;
  }

  hurt(amount, beam = false) {
    const p = this.player;
    if (p.pulseShield > 0 || (!beam && p.protection > 0) || this.mode !== "play") return false;
    p.protection = 0.92;
    // на каждой следующей глубине роботы бьют на 5% больнее
    p.health = Math.max(0, p.health - Math.round(amount * (1 + 0.05 * (this.wave - 1)) * this.mercy()));
    this.combo = 0;
    this.emit("hurt", { x: p.x, z: p.z });
    if (p.health === 0) {
      this.mode = "lost";
      this.emit("lost");
    }
    return true;
  }

  damage(enemy, amount) {
    enemy.health -= amount;
    enemy.flash = 0.14;
    this.emit("impact", { x: enemy.x, z: enemy.z, kind: enemy.kind });
    if (enemy.health <= 0) this.destroy(enemy, true);
  }

  destroy(enemy, scored) {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    this.emit("burst", { x: enemy.x, z: enemy.z, kind: enemy.kind });
    if (!scored) return;
    this.destroyed++;
    // серия: каждый следующий робот, сбитый без паузы и без пробоин, даёт на 10% больше
    this.combo = this.time < this.comboUntil ? this.combo + 1 : 1;
    this.comboUntil = this.time + 2.8;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += Math.round(UNITS[enemy.kind].points * this.multiplier());
    const large = enemy.kind === "boss" || enemy.kind === "titan";
    if (this.destroyed % 3 === 0 || large) {
      this.pearls.push({ id: ++this.serial, x: enemy.x, z: enemy.z, life: 10, rare: large });
    }
    if (large) {
      this.queue.length = 0;
      this.beam = null;
    }
  }

  // поблажка после гибели: −15% к прочности и урону роботов за каждую неудачу подряд, но не больше половины
  mercy() {
    return Math.max(0.5, 1 - 0.15 * this.ease);
  }

  multiplier() {
    return 1 + Math.min(10, Math.max(0, this.combo - 1)) * 0.1;
  }

  pulse() {
    const p = this.player;
    if (this.mode !== "play" || p.cooldown > 0) return false;
    p.cooldown = PULSE_INTERVAL * p.pulseRate;
    p.pulseShield = 0.52;
    this.shots = this.shots.filter(shot => shot.friendly || distSq(shot, p) > PULSE_RADIUS ** 2);
    for (const enemy of [...this.enemies]) {
      if (distSq(enemy, p) <= (PULSE_RADIUS + enemy.radius * 0.4) ** 2) {
        this.damage(enemy, (enemy.kind === "boss" || enemy.kind === "titan" ? 48 : 39) * p.pulsePower);
      }
    }
    this.emit("pulse", { x: p.x, z: p.z });
    return true;
  }

  moveShots(dt) {
    const p = this.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      shot.life -= dt;
      shot.x += shot.vx * dt;
      shot.z += shot.vz * dt;
      if (shot.life <= 0 || Math.abs(shot.x) > this.bounds.x + 5 || shot.z < -16 || shot.z > 14) {
        this.shots.splice(i, 1);
      } else if (shot.friendly) {
        const target = this.enemies.find(enemy => distSq(shot, enemy) <= (enemy.radius + 0.18) ** 2);
        if (target) {
          this.damage(target, shot.power);
          this.shots.splice(i, 1);
        }
      } else if (distSq(shot, p) < (shot.heavy ? 1.04 : 0.88) ** 2) {
        this.hurt(shot.heavy ? 13 : 9);
        this.shots.splice(i, 1);
      }
    }
  }

  advanceBeam(dt) {
    const beam = this.beam;
    if (!beam) return;
    if (beam.charge > 0) {
      beam.charge -= dt;
      if (beam.charge <= 0) {
        this.emit("beam-fire");
        const p = this.player;
        if (Math.abs(p.x - beam.x) < 1.12 && p.z >= beam.z) this.hurt(30, true);
      }
    } else {
      beam.flash -= dt;
      if (beam.flash <= 0) this.beam = null;
    }
  }

  collect(dt) {
    const p = this.player;
    const reach = 3.1 + p.magnet * 2.8;
    for (let i = this.pearls.length - 1; i >= 0; i--) {
      const pearl = this.pearls[i];
      pearl.life -= dt;
      const distance = Math.sqrt(distSq(pearl, p));
      if (distance < 1.35) {
        p.health = Math.min(p.maxHealth, p.health + 12 + p.magnet * 4);
        p.cooldown = Math.max(0, p.cooldown - 1.7);
        this.score += pearl.rare ? 250 : 45;
        this.collected++;
        this.emit("pearl", { x: pearl.x, z: pearl.z });
        this.pearls.splice(i, 1);
      } else if (pearl.life <= 0) {
        this.pearls.splice(i, 1);
      } else if (distance < reach || pearl.rare) {
        const speed = Math.min(1, dt * (pearl.rare ? 6 : 3.4 + p.magnet * 1.6));
        pearl.x += (p.x - pearl.x) * speed;
        pearl.z += (p.z - pearl.z) * speed;
      }
    }
  }

  step(dt, move) {
    if (this.mode !== "play" && this.mode !== "break") return;
    this.time += dt;
    this.movePlayer(dt, move);
    this.collect(dt);
    if (this.combo > 0 && this.time >= this.comboUntil) this.combo = 0;
    if (this.mode === "break") {
      if (this.time < this.breakUntil) return;
      if (this.wave === DEPTHS.length) {
        this.mode = "won";
        this.emit("won");
      } else if (UPGRADE_AFTER.has(this.wave)) {
        this.offer = this.makeOffer();
        this.mode = "upgrade";
      } else this.nextWave();
      return;
    }

    while (this.queue.length && this.queue[0].at <= this.time) {
      const next = this.queue.shift();
      this.spawn(next.kind, next.slot);
    }
    this.autoFire();
    this.lanes.length = 0;
    for (const enemy of [...this.enemies]) {
      this.moveEnemy(enemy, dt);
      if (!this.enemies.includes(enemy)) continue; // ёж мог лопнуть
      if (enemy.lane) this.lanes.push(enemy.lane);
      if (distSq(enemy, this.player) < (enemy.radius + 0.7) ** 2 && this.hurt(UNITS[enemy.kind].hit) && !UNITS[enemy.kind].sturdy) {
        this.destroy(enemy, false);
      }
    }
    if (this.mode === "lost") return;
    this.advanceBeam(dt);
    if (this.mode === "lost") return;
    this.moveShots(dt);
    if (this.mode === "play" && this.queue.length === 0 && this.enemies.length === 0) {
      this.mode = "break";
      this.shots.length = 0;
      this.lanes.length = 0;
      this.breakUntil = this.time + (this.wave === DEPTHS.length ? 1.75 : 2.15);
      this.ease = 0;
      this.emit("clear");
    }
  }
}
