// Правила игры: без графики и браузера, поэтому всё проверяется обычными тестами.
export const WORLDS = [
  { name: 'Коралловый каньон', short: 'КАНЬОН', boss: 'КРОШИТЕЛЬ', color: '#ff795e' },
  { name: 'Кристальный разлом', short: 'РАЗЛОМ', boss: 'МАТКА РАЗЛОМА', color: '#69ecdb' },
  { name: 'Сердце вулкана', short: 'ВУЛКАН', boss: 'ТИТАН ПЕПЛА', color: '#ffb655' },
];
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const LANES = [-3.2, 0, 3.2];
export const HERO_Z = 5;
export const MUZZLE_X = 0.2;
export const SUPER_TIME = 11;

// Урон считаем в попаданиях базового бластера: число на клетке показывает, сколько таких попаданий она выдержит
export const WEAPONS = {
  blaster: { name: 'Бластер', color: 0x5ff2ff, rate: 0.17, damage: 1, speed: 48 },
  spread: { name: 'Дробовик', hint: 'Веер из пяти зарядов', color: 0xff9a3c, rate: 0.46, damage: 1.1, speed: 46, pellets: 5, arc: 0.075, time: SUPER_TIME },
  minigun: { name: 'Шквал', hint: 'Шестиствольный пулемёт', color: 0xffe14d, rate: 0.06, damage: 0.6, speed: 56, jitter: 0.03, time: SUPER_TIME },
  rocket: { name: 'Ракетомёт', hint: 'Взрыв задевает всех рядом', color: 0xff5a3c, rate: 0.72, damage: 5, speed: 30, splash: 3.4, time: SUPER_TIME },
  plasma: { name: 'Плазма', hint: 'Пробивает всех насквозь', color: 0xc77dff, rate: 0.44, damage: 4.5, speed: 30, pierce: true, radius: 0.55, time: SUPER_TIME },
  tesla: { name: 'Молния', hint: 'Разряд перескакивает на соседей', color: 0x7fd4ff, rate: 0.3, damage: 3, chain: 4, hop: 8, time: SUPER_TIME },
  laser: { name: 'Лазер', hint: 'Луч жжёт всё на полосе', color: 0xff4fa8, tick: 0.07, damage: 0.75, beam: true, time: SUPER_TIME },
};
// Какие пушки лежат в клетках в каждом мире
const BAGS = [
  ['spread', 'minigun', 'rocket'],
  ['spread', 'minigun', 'rocket', 'plasma', 'tesla'],
  ['minigun', 'rocket', 'plasma', 'tesla', 'laser'],
];
const MONSTERS = {
  grunt: { hp: 2, speed: 2.2, radius: 0.68, hurt: 16 },
  brute: { hp: 7, speed: 1.6, radius: 1.05, hurt: 27 },
  spitter: { hp: 3, speed: 1.8, radius: 0.75, hurt: 16 },
  barrel: { hp: 1.5, speed: 0, radius: 0.65, hurt: 16 },
};
export const BONUS_ROWS = [2, 4, 6, 9, 12];
const BONUS_GAP = 4.6;
const FAN_GAP = 2.4;
const HAZARD_REACH = 0.42;
const BONUS_LINE = 1.5;

export class Game {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.serial = 0;
    this.reset();
    this.mode = 'menu';
  }

  reset() {
    this.mode = 'menu';
    this.level = 0;
    this.hp = 100;
    this.score = 0;
    this.kills = 0;
    this.coins = 0;
    this.cagesBroken = 0;
    this.cagesMissed = 0;
    this.x = 0;
    this.targetX = 0;
    this.vx = 0;
    this.power = 1;
    this.rate = 1;
    this.shield = 0;
    this.invincible = 0;
    this.novaCharge = 100;
    this.weapon = 'blaster';
    this.weaponTime = 0;
    this.scroll = 0;
    this.runTime = 0;
    this.shotTimer = 0;
    this.combo = 0;
    this.comboTime = 0;
    this.stageTime = 38;
    this.firstCage = true;
    this.lastWeapon = null;
    this.bag = [];
    this.resetStage();
  }

  resetStage() {
    this.phase = 'run';
    this.speed = 9;
    this.time = 0;
    this.spawnTimer = 1.6;
    this.pickupTimer = 6;
    this.cageTimer = this.firstCage ? 1.2 : 2.6;
    this.lastLane = -1;
    this.laneBlock = [0, 0, 0];
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.hazards = [];
    this.boss = null;
    this.bossDefeated = false;
    this.finish = null;
    this.chest = null;
    this.bonusState = null;
    this.bonusTimer = 0;
    this.slowTime = 0;
    this.clearTime = 0;
    this.beamOn = false;
    this.beamTick = 0;
  }

  emit(type, data = {}) {
    this.onEvent({ ...data, type });
  }

  start() {
    this.reset();
    this.mode = 'playing';
    this.emit('start');
  }

  pause() {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.emit('pause');
    }
  }

  resume() {
    if (this.mode === 'paused') {
      this.mode = 'playing';
      this.emit('resume');
    }
  }

  next(upgrade) {
    if (this.mode !== 'upgrade') return;
    if (upgrade === 'power') this.power += 0.5;
    if (upgrade === 'speed') this.rate += 0.25;
    if (upgrade === 'shield') this.shield = Math.min(3, this.shield + 2);
    this.level++;
    this.hp = Math.min(100, this.hp + 45);
    this.novaCharge = 100;
    this.resetStage();
    this.mode = 'playing';
    this.emit('stage', { level: this.level });
  }

  spawnEnemy(type, x, z = -51) {
    const stats = MONSTERS[type];
    const hp = stats.hp * (1 + this.level * 0.35);
    const enemy = { id: ++this.serial, type, x, z, hp, maxHp: hp, speed: stats.speed, radius: stats.radius, hurt: stats.hurt, age: 0, shot: 1.5 + this.random() * 2, hit: 0 };
    this.enemies.push(enemy);
    return enemy;
  }

  spawnWave() {
    const free = [0, 1, 2].filter((i) => this.laneBlock[i] <= 0);
    const count = this.time < 8 ? 1 : this.random() < 0.45 ? 2 : 3;
    const first = Math.floor(this.random() * 3);
    for (let i = 0; i < count; i++) {
      const lane = (first + i) % 3;
      if (!free.includes(lane)) continue;
      const r = this.random();
      const type = r < 0.14 ? 'barrel' : r < 0.32 ? 'spitter' : r < 0.5 && this.time > 10 ? 'brute' : 'grunt';
      this.spawnEnemy(type, LANES[lane], -47 - i * 2);
    }
    this.spawnTimer = Math.max(0.85, 2.2 - this.level * 0.28 - this.time * 0.017);
  }

  nextWeapon() {
    if (!this.bag.length) {
      this.bag = BAGS[this.level].slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      // Две одинаковые пушки подряд неинтересны
      if (this.bag[this.bag.length - 1] === this.lastWeapon && this.bag.length > 1) this.bag.unshift(this.bag.pop());
    }
    this.lastWeapon = this.bag.pop();
    return this.lastWeapon;
  }

  // Клетка с супероружием. Запас прочности виден числом; пушка внутри видна заранее
  spawnCage(lane, z = -51, hp, drop = false) {
    const weapon = this.nextWeapon();
    const first = this.firstCage;
    this.firstCage = false;
    const strength = hp ?? (first ? 8 : [14, 20, 26][this.level] + Math.floor(this.random() * 5));
    const cage = { id: ++this.serial, type: 'cage', x: LANES[lane], z, hp: strength, maxHp: strength, speed: 0, radius: 1.25, age: 0, hit: 0, shot: 0, weapon, stage: 0, drop };
    this.enemies.push(cage);
    // Пока клетка не отъехала, новые монстры на её полосе не появляются: они бы догнали её и прошли сквозь
    this.laneBlock[lane] = 2.6;
    this.lastLane = lane;
    this.emit('cage', { id: cage.id, first, weapon, drop, x: cage.x, z: cage.z });
    return cage;
  }

  cageLane() {
    const options = [0, 1, 2].filter((i) => i !== this.lastLane);
    return options[Math.floor(this.random() * options.length)];
  }

  spawnBoss() {
    const hp = 130 + this.level * 80;
    this.phase = 'boss';
    this.boss = { id: ++this.serial, type: 'boss', x: 0, z: -38, hp, maxHp: hp, radius: 2.3, speed: 0, age: 0, shot: 2.8, hit: 0, hurt: 40 };
    this.enemies.push(this.boss);
    this.cageTimer = 5;
    this.spawnTimer = 4;
    this.emit('boss', { name: WORLDS[this.level].boss });
  }

  addPickup(type, x, z, extra = {}) {
    const pickup = { id: ++this.serial, type, x, z, y: 1.15, vy: 0, age: 0, ...extra };
    this.pickups.push(pickup);
    return pickup;
  }

  // На бонусной зоне огонь сильнее: это награда, а не испытание
  fireBoost() {
    return this.phase === 'bonus' ? 2 : 1;
  }

  // Ближайшая цель: снаряд чуть доворачивает к ней, а совсем на соседней полосе не помогает
  aim(range = 2.7) {
    let best = null;
    for (const e of this.enemies) {
      if (e.hp > 0 && e.z < 4 && e.z > -42 && Math.abs(e.x - this.x) < range && (!best || e.z > best.z)) best = e;
    }
    return best;
  }

  fire(w) {
    const x = this.x + MUZZLE_X;
    const z = HERO_Z - 0.9;
    if (w.chain) {
      this.zap(w, x, z);
      this.emit('shot', { x: this.x, weapon: this.weapon });
      return;
    }
    const target = this.aim();
    const slope = target ? clamp((target.x - x) / Math.max(3, z - target.z), -0.18, 0.18) : 0;
    const n = w.pellets || 1;
    const damage = w.damage * this.power * this.fireBoost();
    for (let i = 0; i < n; i++) {
      const fan = n > 1 ? (i - (n - 1) / 2) * w.arc : 0;
      const jitter = w.jitter ? (this.random() - 0.5) * 2 * w.jitter : 0;
      this.bullets.push({ id: ++this.serial, x, z, vx: (slope + fan + jitter) * w.speed, vz: -w.speed, damage, type: this.weapon, radius: w.radius || 0.18, splash: w.splash || 0, pierce: Boolean(w.pierce), seen: w.pierce ? [] : null });
    }
    this.emit('shot', { x: this.x, weapon: this.weapon });
  }

  // Молния бьёт сразу и перескакивает на ближайших
  zap(w, x, z) {
    const points = [{ x, z }];
    const seen = new Set();
    let current = this.aim(4.6);
    const hitAny = Boolean(current);
    let damage = w.damage * this.power * this.fireBoost();
    for (let i = 0; i < w.chain && current; i++) {
      seen.add(current.id);
      points.push({ x: current.x, z: current.z });
      const from = current;
      this.hit(current, damage);
      damage *= 0.8;
      current = null;
      let near = w.hop;
      for (const e of this.enemies) {
        if (e.hp <= 0 || seen.has(e.id)) continue;
        const d = Math.hypot(e.x - from.x, e.z - from.z);
        if (d < near) {
          near = d;
          current = e;
        }
      }
    }
    if (!hitAny) points.push({ x, z: z - 12 });
    this.emit('arc', { points });
  }

  // Луч задевает всё на своей линии
  burn(w, dt) {
    this.beamOn = true;
    this.beamTick -= dt;
    if (this.beamTick > 0) return;
    this.beamTick += w.tick / this.rate;
    const x = this.x + MUZZLE_X;
    const damage = w.damage * this.power * this.fireBoost();
    for (const e of this.enemies.slice()) {
      if (e.hp > 0 && e.z < HERO_Z && e.z > -46 && Math.abs(e.x - x) < e.radius + 0.3) this.hit(e, damage);
    }
    this.emit('shot', { x: this.x, weapon: 'laser' });
  }

  blast(x, z, radius, damage) {
    this.emit('blast', { x, z, radius });
    for (const e of this.enemies.slice()) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < radius + e.radius) this.hit(e, d < e.radius + 0.5 ? damage : damage * 0.7);
    }
  }

  hurt(amount) {
    if (this.invincible > 0 || this.mode !== 'playing' || this.phase === 'bonus') return;
    if (this.shield > 0) {
      this.shield--;
      this.invincible = 0.7;
      this.emit('shield');
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invincible = 1;
    this.combo = 0;
    this.emit('hurt');
    if (this.hp <= 0) {
      this.mode = 'gameover';
      this.beamOn = false;
      this.hazards = [];
      this.emit('end', { won: false });
    }
  }

  hit(enemy, damage) {
    if (enemy.hp <= 0) return;
    enemy.hp -= damage;
    enemy.hit = 0.12;
    this.emit('hit', { id: enemy.id, x: enemy.x, z: enemy.z, enemyType: enemy.type });
    if (enemy.type === 'cage') {
      this.hitCage(enemy);
      return;
    }
    if (enemy.type === 'column') {
      this.hitColumn(enemy);
      return;
    }
    if (enemy.hp > 0) return;
    this.kills += enemy.type === 'barrel' ? 0 : 1;
    this.combo++;
    this.comboTime = 2.8;
    this.score += (enemy.type === 'boss' ? 2000 : enemy.type === 'brute' ? 150 : 60) * Math.min(4, 1 + Math.floor(this.combo / 5));
    this.coins += enemy.type === 'boss' ? 50 : 3;
    this.novaCharge = Math.min(100, this.novaCharge + 4);
    this.emit('explode', { id: enemy.id, x: enemy.x, z: enemy.z, enemyType: enemy.type });
    if (enemy.type === 'barrel') {
      this.addPickup('gem', enemy.x, enemy.z);
      for (const e of this.enemies.slice()) {
        if (e !== enemy && e.hp > 0 && Math.hypot(e.x - enemy.x, e.z - enemy.z) < 5) this.hit(e, 7);
      }
    } else if (enemy.type === 'boss') {
      this.startBonus();
    } else if (this.random() < 0.17) {
      this.addPickup(this.hp < 65 ? 'heal' : 'gem', enemy.x, enemy.z);
    }
  }

  hitCage(cage) {
    const stage = cage.hp <= cage.maxHp * 0.34 ? 2 : cage.hp <= cage.maxHp * 0.67 ? 1 : 0;
    if (cage.hp > 0) {
      if (stage !== cage.stage) {
        cage.stage = stage;
        this.emit('cageCrack', { id: cage.id, stage, x: cage.x, z: cage.z });
      }
      return;
    }
    this.cagesBroken++;
    this.score += 300;
    this.novaCharge = Math.min(100, this.novaCharge + 10);
    this.slowTime = Math.max(this.slowTime, 0.14);
    // Пушка подпрыгивает и падает на дорогу: за ней надо успеть подбежать
    this.addPickup('weapon', cage.x, cage.z, { weapon: cage.weapon, y: 1.6, vy: 10 });
    this.emit('cageBreak', { id: cage.id, x: cage.x, z: cage.z, weapon: cage.weapon });
  }

  hitColumn(column) {
    if (column.hp > 0) return;
    const gems = (column.row + 1) * (2 + this.level);
    this.coins += gems;
    this.score += gems * 20;
    this.emit('columnBreak', { id: column.id, x: column.x, z: column.z, gems, row: column.row });
  }

  nova() {
    if (this.mode !== 'playing' || this.novaCharge < 100 || this.phase === 'bonus') return false;
    this.novaCharge = 0;
    this.hazards = [];
    this.invincible = 1.2;
    this.emit('nova', { x: this.x, z: HERO_Z });
    for (const e of this.enemies.slice()) {
      if (e.z > -40) this.hit(e, e.type === 'boss' ? 14 : e.type === 'cage' ? e.maxHp * 0.34 : 12);
    }
    return true;
  }

  setWeapon(weapon) {
    const same = this.weapon === weapon;
    const w = WEAPONS[weapon];
    this.weapon = weapon;
    this.weaponTime = same ? Math.min(w.time * 1.5, this.weaponTime + w.time) : w.time;
    this.shotTimer = 0;
    this.beamOn = false;
    this.slowTime = Math.max(this.slowTime, 0.2);
    this.emit('weapon', { weapon });
  }

  collect(p) {
    if (p.type === 'heal') this.hp = Math.min(100, this.hp + 25);
    else if (p.type === 'shield') this.shield = Math.min(3, this.shield + 1);
    else if (p.type === 'gem') {
      this.coins += 10;
      this.score += 150;
    } else if (p.type === 'weapon') this.setWeapon(p.weapon);
    this.emit('pickup', { pickupType: p.type, weapon: p.weapon, x: p.x, z: p.z });
  }

  // После босса: финишная черта, столбы с числами и сундук в конце
  startBonus() {
    this.phase = 'bonus';
    this.bonusState = 'wait';
    this.bonusTimer = 1.15;
    this.bossDefeated = true;
    this.boss = null;
    this.hazards = [];
    this.bullets = [];
    this.enemies = [];
    this.slowTime = 0.55;
    this.beamOn = false;
    this.emit('bossDown', { x: this.x });
  }

  rollBonus() {
    this.bonusState = 'roll';
    const line = -30;
    this.finish = { id: ++this.serial, z: line };
    BONUS_ROWS.forEach((strength, row) => {
      const hp = Math.ceil(strength * (1 + this.level * 0.5));
      for (let i = 0; i < 4; i++) {
        this.enemies.push({ id: ++this.serial, type: 'column', x: (i - 1.5) * 2.5, z: line - 8 - row * BONUS_GAP, hp, maxHp: hp, speed: 0, radius: 0.9, age: 0, hit: 0, shot: 0, row });
      }
    });
    this.chest = { id: ++this.serial, z: line - 8 - BONUS_ROWS.length * BONUS_GAP - 2, open: false };
    this.emit('bonus');
  }

  openChest() {
    this.bonusState = 'chest';
    this.bonusTimer = 1.5;
    this.chest.open = true;
    const gems = 25 + this.level * 25;
    this.coins += gems;
    this.score += gems * 20;
    this.emit('chest', { z: this.chest.z, gems });
  }

  updateBonus(dt) {
    this.bonusTimer -= dt;
    if (this.bonusState === 'wait' && this.bonusTimer <= 0) this.rollBonus();
    if (this.bonusState === 'roll') {
      this.finish.z += this.speed * dt;
      this.chest.z += this.speed * dt;
      // Плавно останавливаемся перед чертой
      if (this.finish.z >= BONUS_LINE - 0.02) {
        this.bonusState = 'break';
        this.bonusTimer = 15;
        this.speed = 0;
      }
    } else if (this.bonusState === 'break') {
      const left = this.enemies.filter((e) => e.type === 'column' && e.hp > 0);
      if (this.bonusTimer <= 0) for (const e of left) this.hit(e, 9999);
      if (!left.length || this.bonusTimer <= 0) this.openChest();
    } else if (this.bonusState === 'chest' && this.bonusTimer <= 0) {
      this.mode = 'clear';
      this.clearTime = 1.9;
      this.emit('clear');
    }
  }

  targetSpeed() {
    if (this.phase === 'boss') return 2.2;
    if (this.phase !== 'bonus') return 9;
    if (this.bonusState === 'roll') return clamp((BONUS_LINE - this.finish.z) * 2.4, 1.2, 9);
    return this.bonusState === 'wait' ? 6 : 0;
  }

  update(dt, axis = 0) {
    if (this.mode === 'clear') {
      this.clearTime -= dt;
      if (this.clearTime <= 0) {
        this.mode = this.level === 2 ? 'victory' : 'upgrade';
        this.emit('end', { won: true });
      }
      return;
    }
    if (this.mode !== 'playing') return;
    dt = Math.min(dt, 0.05);
    // Короткое замедление в важный момент: разбитая клетка, новая пушка, павший босс
    if (this.slowTime > 0) {
      this.slowTime -= dt;
      dt *= 0.3;
    }
    this.time += dt;
    this.runTime += dt;
    this.speed += (this.targetSpeed() - this.speed) * Math.min(1, dt * 4);
    const speed = this.speed;
    this.scroll += speed * dt;

    if (axis) this.targetX = clamp(this.targetX + axis * dt * 10, -4.3, 4.3);
    const was = this.x;
    this.x += (this.targetX - this.x) * Math.min(1, dt * 14);
    this.vx = dt > 0 ? (this.x - was) / dt : 0;

    this.invincible = Math.max(0, this.invincible - dt);
    this.novaCharge = Math.min(100, this.novaCharge + dt * 2.5);
    this.comboTime -= dt;
    if (this.comboTime <= 0) this.combo = 0;
    for (let i = 0; i < 3; i++) this.laneBlock[i] -= dt;

    this.updateWeapon(dt);
    if (this.mode !== 'playing') return;
    this.updateSpawns(dt);
    if (this.phase === 'bonus') this.updateBonus(dt);
    this.updateEnemies(dt, speed);
    if (this.mode !== 'playing') return;
    this.updateShots(dt);
    this.updatePickups(dt, speed);

    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.z < 12);
    this.bullets = this.bullets.filter((b) => b.z > -65);
    this.hazards = this.hazards.filter((h) => h.z < 12 && Math.abs(h.x) < 16);
    this.pickups = this.pickups.filter((p) => p.z < 12);
  }

  updateWeapon(dt) {
    const w = WEAPONS[this.weapon];
    if (!w.beam) this.beamOn = false;
    // На бонусной зоне и после неё время супероружия не тратится
    if (w.time && this.phase !== 'bonus') {
      this.weaponTime -= dt;
      if (this.weaponTime <= 0) {
        this.weaponTime = 0;
        this.weapon = 'blaster';
        this.beamOn = false;
        this.emit('weaponOut');
        return;
      }
    }
    const silent = this.phase === 'bonus' && (this.bonusState === 'wait' || this.bonusState === 'chest');
    if (silent) {
      this.beamOn = false;
      return;
    }
    if (w.beam) {
      this.burn(w, dt);
      return;
    }
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) {
      this.fire(w);
      this.shotTimer = Math.max(this.shotTimer + (w.rate / this.rate) / (this.phase === 'bonus' ? 1.5 : 1), 0);
    }
  }

  updateSpawns(dt) {
    this.spawnTimer -= dt;
    this.pickupTimer -= dt;
    this.cageTimer -= dt;
    if (this.phase === 'run') {
      if (this.time >= this.stageTime) {
        this.spawnBoss();
        return;
      }
      if (this.cageTimer <= 0) {
        this.spawnCage(this.firstCage ? 1 : this.cageLane());
        this.cageTimer = 11.5 - this.level * 0.5;
      }
      if (this.spawnTimer <= 0) this.spawnWave();
      if (this.pickupTimer <= 0) {
        const types = ['heal', 'shield', 'gem'];
        this.addPickup(types[Math.floor(this.time / 7) % 3], LANES[Math.floor(this.random() * 3)], -42);
        this.pickupTimer = 7;
      }
    } else if (this.phase === 'boss') {
      // Клетка падает сверху прямо перед боссом: можно сбить её ради пушки, а можно бить босса
      if (this.cageTimer <= 0) {
        const away = [0, 1, 2].filter((i) => Math.abs(LANES[i] - this.x) > 1.6);
        this.spawnCage(away[Math.floor(this.random() * away.length)], -7, 9 + this.level * 4, true);
        this.cageTimer = 11;
      }
      if (this.spawnTimer <= 0 && this.boss) {
        this.spawnEnemy('grunt', LANES[Math.floor(this.random() * 3)], -15);
        this.spawnTimer = Math.max(2.2, 3.6 - this.level * 0.5);
      }
    }
  }

  updateEnemies(dt, speed) {
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.age += dt;
      e.hit = Math.max(0, e.hit - dt);
      if (e.type === 'boss') {
        e.z = Math.min(-17, e.z + dt * 7);
        e.x = Math.sin(e.age * 0.7) * 2.6;
        e.shot -= dt;
        if (e.shot <= 0 && e.z >= -19) {
          e.shot = Math.max(1.6, 2.6 - this.level * 0.3);
          // Между снарядами просвет шире героя: от залпа можно увернуться из любого места
          for (let i = -2; i <= 2; i++) {
            const target = this.x + i * FAN_GAP;
            const flight = (HERO_Z - e.z - 2) / 14;
            this.hazards.push({ id: ++this.serial, x: e.x, z: e.z + 2, vx: (target - e.x) / flight, vz: 14, radius: 0.38 });
          }
          this.emit('bossShot');
        }
        continue;
      }
      e.z += (speed + e.speed) * dt;
      if (e.type === 'column') continue;
      if (e.type === 'spitter' && e.z > -32 && e.z < -7) {
        e.shot -= dt;
        if (e.shot <= 0) {
          e.shot = 3;
          this.hazards.push({ id: ++this.serial, x: e.x, z: e.z, vx: (this.x - e.x) * 0.45, vz: 16, radius: 0.28 });
          this.emit('spit', { id: e.id });
        }
      }
      if (Math.abs(e.z - HERO_Z) < e.radius + 0.55 && Math.abs(e.x - this.x) < e.radius + 0.45) {
        if (e.type === 'cage') {
          // Врезался в целую клетку: больно, и пушка пропала
          this.hurt(20);
          this.cagesMissed++;
          this.emit('cageSmash', { id: e.id, x: e.x, z: e.z });
        } else {
          this.hurt(e.hurt);
          this.emit('explode', { id: e.id, x: e.x, z: e.z, enemyType: e.type, ram: true });
        }
        e.hp = 0;
        if (this.mode !== 'playing') return;
      } else if (e.type === 'cage' && e.z > HERO_Z + 2 && !e.passed) {
        e.passed = true;
        this.cagesMissed++;
      }
    }
  }

  updateShots(dt) {
    for (const b of this.bullets) {
      const oldZ = b.z;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      for (const e of this.enemies) {
        if (e.hp <= 0 || Math.abs(e.x - b.x) >= e.radius + b.radius || e.z + e.radius < b.z || e.z - e.radius > oldZ) continue;
        if (b.pierce) {
          if (b.seen.includes(e.id)) continue;
          b.seen.push(e.id);
          this.hit(e, b.damage);
          continue;
        }
        if (b.splash) this.blast(b.x, e.z, b.splash, b.damage);
        else this.hit(e, b.damage);
        b.z = -110;
        break;
      }
    }
    for (const h of this.hazards) {
      h.x += h.vx * dt;
      h.z += h.vz * dt;
      if (Math.abs(h.z - HERO_Z) < 0.65 && Math.abs(h.x - this.x) < HAZARD_REACH + h.radius * 0.7) {
        this.hurt(10 + this.level * 3);
        h.z = 20;
        if (this.mode !== 'playing') return;
      }
    }
  }

  updatePickups(dt, speed) {
    for (const p of this.pickups) {
      p.age += dt;
      p.z += speed * dt;
      if (p.vy || p.y > 1.15) {
        p.y += p.vy * dt;
        p.vy -= 26 * dt;
        if (p.y <= 1.15) {
          p.y = 1.15;
          // Один небольшой отскок: заметно, что пушка упала
          p.vy = p.vy < -6 ? -p.vy * 0.4 : 0;
          if (p.vy) this.emit('drop', { x: p.x, z: p.z });
        }
      }
      // Близкие пушки и кристаллы сами тянутся к герою
      const dx = this.x - p.x;
      if ((p.type === 'weapon' || p.type === 'gem') && Math.abs(dx) < 2.4 && p.z > HERO_Z - 7) p.x += dx * Math.min(1, dt * 7);
      if (Math.abs(p.z - HERO_Z) < 1.2 && Math.abs(p.x - this.x) < 1.3) {
        this.collect(p);
        p.z = 20;
      }
    }
  }
}
