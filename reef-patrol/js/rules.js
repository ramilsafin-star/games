export const DEPTHS = [
  { name: "Коралловый сад", units: ["crab", "crab", "jelly", "crab", "jelly"] },
  { name: "Фиолетовый каньон", units: ["jelly", "mine", "crab", "jelly", "mine", "crab", "jelly"] },
  { name: "Светящаяся пещера", units: ["crab", "mine", "jelly", "mine", "crab", "jelly", "crab", "mine", "jelly"] },
  { name: "Логово Кракена", units: ["boss", "crab", "jelly"] },
];

const UNITS = {
  crab: { hp: 25, radius: 0.96, points: 60, hit: 15 },
  jelly: { hp: 31, radius: 0.97, points: 85, hit: 12 },
  mine: { hp: 24, radius: 0.82, points: 100, hit: 23 },
  boss: { hp: 350, radius: 2.3, points: 1000, hit: 25 },
};

export const PULSE_RADIUS = 8.8;
const PULSE_INTERVAL = 7.5;
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
    this.serial = 0;
    this.player = {
      x: 0, z: 6.5, vx: 0, vz: 0, yaw: 0, health: 100, maxHealth: 100,
      cooldown: 0, protection: 0, pulseShield: 0, nextShot: 0, interval: 0.29,
    };
    this.beam = null;
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
    const bossWave = this.wave === DEPTHS.length;
    this.mode = "play";
    this.player.health = Math.min(this.player.maxHealth, this.player.health + 9);
    this.queue = depth.units.map((kind, i) => ({
      kind,
      at: this.time + (bossWave ? [0.65, 6, 11][i] : 0.5 + i * (this.wave === 1 ? 1.3 : 0.86)),
    }));
    this.emit("wave", { wave: this.wave, name: depth.name });
  }

  upgrade(kind) {
    if (this.mode !== "upgrade") return;
    if (kind === "rapid") this.player.interval *= 0.74;
    else if (kind === "armor") {
      this.player.maxHealth += 35;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 55);
    } else return;
    this.nextWave();
  }

  emit(type, values = {}) {
    this.events.push({ type, ...values });
  }

  spawn(kind) {
    const unit = UNITS[kind];
    const halfWidth = this.bounds.x;
    const phase = this.random() * 6.28;
    const enemy = {
      id: ++this.serial,
      kind,
      x: kind === "boss" ? 0 : (this.random() * 1.54 - 0.77) * halfWidth,
      z: kind === "boss" ? -8.4 : -10.8,
      radius: unit.radius,
      health: unit.hp,
      maxHealth: unit.hp,
      age: 0,
      phase,
      fire: kind === "boss" ? 2.3 : 1.8 + this.random() * 0.9,
      beamIn: 2.4,
      flash: 0,
      yaw: Math.PI,
    };
    this.enemies.push(enemy);
  }

  movePlayer(dt, move) {
    const p = this.player;
    const x = move.target ? (move.target.x - p.x) * 7.2 : move.x * 11.8;
    const z = move.target ? (move.target.z - p.z) * 7.2 : move.z * 11.8;
    const speed = Math.max(1, Math.hypot(x, z) / 14.6);
    const blend = Math.min(1, dt * 16);
    p.vx += (x / speed - p.vx) * blend;
    p.vz += (z / speed - p.vz) * blend;
    p.x = clamp(p.x + p.vx * dt, -this.bounds.x, this.bounds.x);
    p.z = clamp(p.z + p.vz * dt, this.bounds.far, this.bounds.near);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.protection = Math.max(0, p.protection - dt);
    p.pulseShield = Math.max(0, p.pulseShield - dt);
  }

  fireFrom(entity, yaw, speed, friendly) {
    const vx = -Math.sin(yaw) * speed;
    const vz = -Math.cos(yaw) * speed;
    const offset = friendly ? 0.75 : entity.radius * 0.73;
    this.shots.push({
      id: ++this.serial,
      x: entity.x + vx / speed * offset,
      z: entity.z + vz / speed * offset,
      vx, vz, friendly, life: 1.85,
      heavy: entity.kind === "boss",
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
    this.fireFrom(p, p.yaw, 28, true);
    this.emit("shot", { x: p.x, z: p.z });
  }

  moveEnemy(enemy, dt) {
    const p = this.player;
    enemy.age += dt;
    enemy.flash = Math.max(0, enemy.flash - dt);
    const dx = p.x - enemy.x;
    const dz = p.z - enemy.z;
    if (enemy.kind === "crab") {
      enemy.x += (clamp(dx * 0.85, -2.3, 2.3) + Math.cos(enemy.age * 4 + enemy.phase) * 1.5) * dt;
      enemy.z += clamp(dz * 1.25, -2.0, this.wave === 1 ? 3.1 : 3.7) * dt;
    } else if (enemy.kind === "mine") {
      const distance = Math.hypot(dx, dz) || 1;
      const speed = distance < 4 ? 5.3 : 3.7;
      enemy.x += dx / distance * dt * speed;
      enemy.z += dz / distance * dt * speed;
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
        const yaw = Math.atan2(-dx, -dz);
        for (let i = 0; i < count; i++) this.fireFrom(enemy, yaw + (i - (count - 1) / 2) * 0.22, boss ? 8.4 : 7.4, false);
        enemy.fire = boss ? wild ? 1.12 : 1.73 : 2.3;
        this.emit("enemy-shot", { x: enemy.x, z: enemy.z, kind: enemy.kind });
      }
    }
    enemy.x = clamp(enemy.x, -this.bounds.x, this.bounds.x);
    enemy.yaw = Math.atan2(-dx, -dz);
  }

  hurt(amount, beam = false) {
    const p = this.player;
    if (p.pulseShield > 0 || (!beam && p.protection > 0) || this.mode !== "play") return false;
    p.protection = 0.92;
    p.health = Math.max(0, p.health - amount);
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
    this.score += UNITS[enemy.kind].points;
    if (this.destroyed % 2 === 0 || enemy.kind === "boss") {
      this.pearls.push({ id: ++this.serial, x: enemy.x, z: enemy.z, life: 10, rare: enemy.kind === "boss" });
    }
    if (enemy.kind === "boss") {
      this.queue.length = 0;
      this.beam = null;
    }
  }

  pulse() {
    const p = this.player;
    if (this.mode !== "play" || p.cooldown > 0) return false;
    p.cooldown = PULSE_INTERVAL;
    p.pulseShield = 0.52;
    this.shots = this.shots.filter(shot => shot.friendly || distSq(shot, p) > PULSE_RADIUS ** 2);
    for (const enemy of [...this.enemies]) {
      if (distSq(enemy, p) <= (PULSE_RADIUS + enemy.radius * 0.4) ** 2) {
        this.damage(enemy, enemy.kind === "boss" ? 48 : 39);
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
          this.damage(target, 9);
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
        if (Math.abs(p.x - beam.x) < 1.12 && p.z >= beam.z) this.hurt(39, true);
      }
    } else {
      beam.flash -= dt;
      if (beam.flash <= 0) this.beam = null;
    }
  }

  collect(dt) {
    const p = this.player;
    for (let i = this.pearls.length - 1; i >= 0; i--) {
      const pearl = this.pearls[i];
      pearl.life -= dt;
      const distance = Math.sqrt(distSq(pearl, p));
      if (distance < 1.35) {
        p.health = Math.min(p.maxHealth, p.health + 15);
        p.cooldown = Math.max(0, p.cooldown - 1.7);
        this.score += pearl.rare ? 250 : 45;
        this.collected++;
        this.emit("pearl", { x: pearl.x, z: pearl.z });
        this.pearls.splice(i, 1);
      } else if (pearl.life <= 0) {
        this.pearls.splice(i, 1);
      } else if (distance < 3.1 || pearl.rare) {
        const speed = Math.min(1, dt * (pearl.rare ? 6 : 3.4));
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
    if (this.mode === "break") {
      if (this.time < this.breakUntil) return;
      if (this.wave === DEPTHS.length) {
        this.mode = "won";
        this.emit("won");
      } else if (this.wave === 2) this.mode = "upgrade";
      else this.nextWave();
      return;
    }

    while (this.queue.length && this.queue[0].at <= this.time) this.spawn(this.queue.shift().kind);
    this.autoFire();
    for (const enemy of [...this.enemies]) {
      this.moveEnemy(enemy, dt);
      if (distSq(enemy, this.player) < (enemy.radius + 0.7) ** 2 && this.hurt(UNITS[enemy.kind].hit) && enemy.kind !== "boss") {
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
      this.breakUntil = this.time + (this.wave === DEPTHS.length ? 1.75 : 2.15);
      this.emit("clear");
    }
  }
}
