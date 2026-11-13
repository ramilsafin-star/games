// Правила раунда «Рубежа» без графики: игрок, оружие, роботы, гранаты, ракеты, цели задания.
// Один и тот же код идёт в браузере и в Node (tests/sim.mjs гоняет автопилот по всем заданиям).
// Вид и звук читают состояние и очередь событий game.events.
import { WEAPONS, GRENADES, ROBOTS, MATE, MATE_NAMES, DIFFICULTY, PLAYER, ECON, KITS } from "./data.js?v=cb8e2b87";
import { getMap } from "./maps.js?v=cb8e2b87";
import { World } from "./world.js?v=cb8e2b87";
import { rng, clamp, wrap, lookDir, yawTo, DEG, TAU, lerp } from "./util.js?v=cb8e2b87";
import { thinkRobot, thinkMate, thinkVip, moveAgent, alertAll } from "./ai.js?v=cb8e2b87";

// Учебная мишень полигона
const DUMMY = {
  name: "Мишень", role: "Учебная мишень", hp: 40, armor: 0, core: 2, speed: 0, turn: 0, radius: 0.45, height: 1.6, still: true, dummy: true,
  parts: [[0, 1.15, 0, 0.42, 0], [0, 0.55, 0, 0.3, 0], [0, 1.2, -0.3, 0.17, 1]], sight: 0, react: 9, range: 0, score: 0, xp: 0, color: "#7cf0ff",
};
export const ROBOT_DEFS = { ...ROBOTS, mishen: DUMMY };

// Оружие с улучшениями
export function weaponStats(id, up = {}) {
  const w = { ...WEAPONS[id], id };
  if (up.mag) w.mag = Math.round(w.mag * 1.4);
  if (up.scope) {
    w.ads *= 0.7;
    w.zoom = w.zoom * 1.15;
    w.scoped = true;
  }
  if (up.stab) {
    w.kick *= 0.65;
    w.kickX *= 0.65;
    w.bloom *= 0.65;
  }
  return w;
}

const V3 = () => ({ x: 0, y: 0, z: 0 });
const EYE_UP = 0.08;

export class Game {
  constructor(o) {
    this.o = o;
    this.mission = o.mission;
    this.roundIndex = o.round || 0;
    this.spec = this.mission.rounds[this.roundIndex];
    this.mode = o.mode || "campaign";
    this.diff = DIFFICULTY[o.diff ?? 1];
    this.mods = new Set(o.mods || []);
    this.rand = rng(o.seed || 1);
    this.map = getMap(this.mission.map);
    this.world = new World(this.map);
    this.t = 0;
    this.phase = "live"; // live | won | lost
    this.reason = "";
    this.events = [];
    this.agents = [];
    this.nades = [];
    this.rockets = [];
    this.smokes = [];
    this.marks = []; // красные круги ракет босса
    this.uid = 1;
    this.alarm = false;
    this.alarmT = 0;
    this.slowmo = 0;
    this.sightK = (this.mission.sight || 1) * (this.mods.has("fog") ? 0.55 : 1);
    this.credits = 0;
    this.earned = { kills: 0, cores: 0, objective: 0 };
    this.stats = { shots: 0, hits: 0, cores: 0, kills: 0, coreKills: 0, knife: 0, emp: 0, molot: 0, dmgTaken: 0, alarms: 0, relays: 0, rescue: 0, vipHurt: 0, boss: 0 };
    this.feed = [];
    this.say = null;
    this.radio = [];
    this.wavesDone = new Set();
    this.trig = {}; // моменты событий: plant, rescue, hack
    this.reveal = 0; // сканер
    this.setupPlayer(o.loadout || {}, o.ups || {});
    this.setupRound();
  }
  emit(type, data = {}) {
    const ev = { type, ...data };
    this.events.push(ev);
    if (this.obj && this.obj.kind === "training") this.noteTraining(ev);
  }
  radioSay(text, who = "Штаб") {
    this.radio.push({ text, who, t: this.t });
    this.emit("radio", { text, who });
  }

  // ---------- Игрок ----------
  setupPlayer(lo, ups) {
    const sp = this.map.points[this.spec.spawn || "S"];
    const p = (this.player = {
      isPlayer: true, team: "squad", id: 0, name: "Ты",
      x: sp.x, y: this.world.groundAt(sp.x, sp.z, 0.3, sp.y + 0.5), z: sp.z, vx: 0, vz: 0, vy: 0, r: PLAYER.radius, h: PLAYER.height, grounded: true,
      yaw: sp.yaw || 0, pitch: 0, hp: PLAYER.hp, maxHp: PLAYER.hp, alive: true,
      armor: lo.vest && !this.mods.has("noarmor") ? 100 : 0, helmet: !!lo.helmet && !this.mods.has("noarmor"),
      crouch: 0, crouching: false, aim: 0, aiming: false, walk: false,
      slots: { pri: null, sec: null, melee: "rezak" }, ammo: {}, cur: "sec", last: "melee",
      fireT: 0, reloadT: 0, equipT: 0.3, bloom: 0, recP: 0, recY: 0, shotN: 0, lastShot: -9, trigger: false,
      meleeT: 0, swingT: 0, throwT: 0,
      grenades: (lo.g || []).filter(Boolean).slice(0, 2), kit: lo.kit || "none", kitUsed: false, healLeft: 0,
      useT: 0, useKind: "", stepD: 0, lastHurt: -9, hurtDir: 0, speedNow: 0, invul: 0, lookTotal: 0,
    });
    if (this.mods.has("pistols")) lo = { ...lo, pri: null };
    const set = (slot, id) => {
      if (!id) return;
      const w = weaponStats(id, ups[id] || {});
      p.slots[slot] = id;
      p.ammo[slot] = { w, mag: w.mag, res: w.reserve ?? 0 };
    };
    set("pri", lo.pri);
    set("sec", lo.sec || "iskra");
    p.ammo.melee = { w: weaponStats("rezak"), mag: 0, res: 0 };
    p.cur = p.slots.pri ? "pri" : "sec";
  }
  weapon() {
    return this.player.ammo[this.player.cur].w;
  }
  eye(p = this.player) {
    return p.y + (p.isPlayer ? lerp(PLAYER.eye, PLAYER.crouchEye, p.crouch) + EYE_UP : p.h * 0.88);
  }

  // ---------- Раунд ----------
  setupRound() {
    const s = this.spec;
    const m = this.mission;
    // напарники
    const mates = m.mates || 0;
    for (let i = 0; i < mates; i++) {
      const a = this.spawnMate(i);
      if (a && this.mode === "skirmish") a.weaponTier = this.o.mateTier ?? 1;
    }
    for (const r of s.robots || []) this.spawn(r[0], r[1], r[2] || {});
    // цели
    const obj = (this.obj = { kind: s.kind, text: "", done: false });
    if (s.kind === "plant") {
      obj.sites = s.sites.map((k, i) => ({ key: k, label: "АБ"[i], ...this.map.points[k] }));
      obj.planted = null;
      obj.left = s.defend;
    }
    if (s.kind === "defuse") {
      obj.sites = s.sites.map((k, i) => ({ key: k, label: "АБ"[i], ...this.map.points[k] }));
      const site = obj.sites[Math.floor(this.rand() * obj.sites.length)];
      obj.bomb = { x: site.x, y: site.y, z: site.z, label: site.label, found: false, progress: 0 };
      obj.left = s.time * this.diff.time;
    }
    if (s.kind === "rescue") {
      const h = this.map.points[s.hostage];
      this.vip = this.spawnVip(h);
      obj.exit = this.map.points[s.exit];
    }
    if (s.kind === "stealth") {
      obj.target = this.map.points[s.target];
      obj.hacked = 0;
      obj.exit = s.exit ? this.map.points[s.exit] : null;
      obj.stage = "go";
    }
    if (s.kind === "hold") {
      obj.zone = this.map.zones[s.zone];
      obj.need = s.time * this.diff.time;
      obj.held = 0;
    }
    if (s.kind === "boss") {
      const b = this.map.points[s.boss];
      this.boss = this.spawn("nakovalnya", s.boss, { wake: true });
      this.boss.vent = 0;
      this.boss.ventT = 8;
      this.boss.addT = 14;
      this.boss.volleyT = 4;
      this.boss.phase = 0;
      void b;
    }
    if (s.kind === "training") {
      obj.step = 0;
      obj.stepT = 0;
      obj.count = 0;
    }
    if (s.kind === "skirmish") {
      obj.sites = s.sites.map((k, i) => ({ key: k, label: "АБ"[i], ...this.map.points[k] }));
      obj.planted = null;
      obj.left = s.defend;
      obj.clock = s.time;
    }
    if (this.mods.has("rollers")) this.rollerT = 25;
    this.limit = s.limit || 600;
    this.updateObjective(0);
  }
  pointPos(name) {
    if (name === "perch") {
      const list = this.map.perches;
      const p = list[Math.floor(this.rand() * list.length)];
      return { x: p[0], y: p[1], z: p[2], fly: true };
    }
    const p = this.map.points[name];
    if (!p) throw new Error("Нет точки " + name + " на карте " + this.map.id);
    return p;
  }
  spawn(type, at, o = {}) {
    const def = ROBOT_DEFS[type];
    const p = typeof at === "string" ? this.pointPos(at) : at;
    let x = p.x, z = p.z, y = p.y ?? this.map.floor;
    if (def.fly) {
      if (!p.fly) y = (p.y ?? this.map.floor) + def.fly;
    } else if (def.camera) {
      y = p.y;
    } else {
      // не ставим двух роботов в одну точку
      for (let k = 0; k < 8 && this.agents.some((a) => a.alive && Math.hypot(a.x - x, a.z - z) < 1.1); k++) {
        const c = this.world.randomNear(p.x, p.z, y, 2.5, this.rand);
        x = c[0];
        z = c[1];
        y = c[2];
      }
      // точка не на проходимой клетке (стол, ящик) — ближайшая проходимая
      const cell = this.world.cellOf(x, z);
      if (cell < 0 || !this.world.navOk[cell] || Math.abs(this.world.navG[cell] - y) > 0.7) {
        const c = this.world.nearestOk(x, z, y, 4);
        if (c >= 0) [x, z, y] = this.world.cellPos(c);
      }
      y = this.world.groundAt(x, z, def.radius, y + 0.6);
    }
    const hpK = def.dummy ? 1 : def.boss ? [0.75, 1, 1.05][this.o.diff ?? 1] : this.diff.hp;
    const a = {
      id: this.uid++, team: "robot", type, def, x, y, z, vy: 0, r: def.radius, h: def.height, grounded: true, fly: !!def.fly, alive: true,
      yaw: o.face ?? p.yaw ?? this.rand() * TAU, hp: Math.round(def.hp * hpK), maxHp: Math.round(def.hp * hpK),
      shield: def.shield ? def.shield.hp : 0, state: "idle", aware: 0, target: null, seeT: 0, lastSeen: null, lostT: 0,
      path: null, pi: 0, repathT: 0, goal: null, thinkT: this.rand() * 0.2, decideT: 1 + this.rand() * 2,
      fireT: 0, burst: 0, restT: this.rand(), stunT: 0, chargeT: 0, fuseT: 0, rocketT: def.rocket ? def.rocket.every * (0.4 + this.rand() * 0.4) : 0,
      route: o.route ? this.map.routes[o.route] : null, ri: 0, guardYaw: o.face ?? p.yaw ?? 0, lookT: 0, waitT: 0, mode: "", hurtT: -9, deadT: 0,
      walkPhase: this.rand() * TAU, flash: 0, defuse: 0, perch: p.fly ? [p.x, p.y, p.z] : null, alarmT: 0, homeX: x, homeZ: z, speedNow: 0,
    };
    if (a.route) a.ri = this.nearestRouteIndex(a);
    if (def.camera) a.baseYaw = a.yaw;
    this.agents.push(a);
    if (o.wake || o.hunt) {
      a.state = "combat";
      a.aware = 1;
      a.target = this.player;
      a.lastSeen = { x: this.player.x, y: this.player.y, z: this.player.z, t: this.t };
      a.hunt = !!o.hunt;
    }
    return a;
  }
  nearestRouteIndex(a) {
    let best = 0, bd = Infinity;
    a.route.forEach((p, i) => {
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  spawnMate(i) {
    const p = this.player;
    const ang = p.yaw + Math.PI + (i - 1) * 0.7;
    // бойцы появляются за спиной игрока, а не перед ним
    let x = p.x - Math.sin(ang) * 2.4, z = p.z - Math.cos(ang) * 2.4;
    if (!this.world.free(x, z, p.y)) {
      const c = this.world.randomNear(p.x, p.z, p.y, 3, this.rand);
      x = c[0];
      z = c[1];
    }
    const a = {
      id: this.uid++, team: "squad", type: "mate", def: MATE, name: MATE_NAMES[i % MATE_NAMES.length], idx: i,
      x, y: this.world.groundAt(x, z, 0.3, p.y + 0.6), z, vy: 0, r: MATE.radius, h: MATE.height, grounded: true, alive: true,
      yaw: p.yaw, hp: MATE.hp, maxHp: MATE.hp, state: "follow", target: null, seeT: 0, path: null, pi: 0, repathT: 0,
      thinkT: this.rand() * 0.2, fireT: 0, burst: 0, restT: 0, cmd: "follow", hold: null, hurtT: -9, walkPhase: 0, flash: 0, speedNow: 0, decideT: 1,
    };
    this.agents.push(a);
    return a;
  }
  spawnVip(h) {
    const a = {
      id: this.uid++, team: "vip", type: "vip", def: { speed: 3.9, radius: 0.36, height: 1.75, turn: 6 }, name: this.mission.map === "metro" ? "Тимур" : "Вера",
      x: h.x, y: this.world.groundAt(h.x, h.z, 0.3, h.y + 0.6), z: h.z, vy: 0, r: 0.36, h: 1.75, grounded: true, alive: true,
      yaw: 0, hp: 160, maxHp: 160, state: "captive", path: null, pi: 0, repathT: 0, thinkT: 0, hurtT: -9, walkPhase: 0, speedNow: 0, down: false,
    };
    this.agents.push(a);
    return a;
  }
  robots() {
    return this.agents.filter((a) => a.team === "robot" && a.alive);
  }
  hostileLeft() {
    return this.agents.filter((a) => a.team === "robot" && a.alive && !a.def.camera && !a.def.dummy).length;
  }

  // ---------- Шаг ----------
  // input: mx, mz (−1..1), fire, aim, crouch, walk, jump, reload, use, grenade, melee, slot, next, kit, squad, gslot
  step(dt, input) {
    if (this.phase !== "live") {
      this.events.length > 400 && (this.events.length = 0);
      this.stepWorld(dt);
      return;
    }
    this.t += dt;
    const p = this.player;
    this.stepPlayer(dt, input);
    this.stepWorld(dt);
    // напарники, инженер, роботы
    for (const a of this.agents) {
      if (!a.alive) {
        a.deadT += dt;
        continue;
      }
      if (a.team === "robot") thinkRobot(this, a, dt);
      else if (a.team === "squad") thinkMate(this, a, dt);
      else thinkVip(this, a, dt);
      moveAgent(this, a, dt);
    }
    // убираем давно отключённых (кроме тех, что ещё видны как обломки)
    if (this.agents.length > 60) this.agents = this.agents.filter((a) => a.alive || a.deadT < 6 || a === this.vip);
    // тревога: робот, заметивший игрока, успевает передать по рации
    for (const a of this.agents) {
      if (a.alive && a.alarmT > 0) {
        a.alarmT -= dt;
        if (a.alarmT <= 0) this.raiseAlarm(a);
      }
    }
    if (this.rollerT !== undefined) {
      this.rollerT -= dt;
      if (this.rollerT <= 0) {
        this.rollerT = 25;
        for (let i = 0; i < 3; i++) this.spawnNear("kolobok", 22, true);
      }
    }
    if (this.reveal > 0) this.reveal -= dt;
    this.updateObjective(dt, input);
    this.checkWaves();
    if (p.alive && this.t > this.limit && this.phase === "live") this.lose("time");
  }
  stepWorld(dt) {
    this.stepNades(dt);
    this.stepRockets(dt);
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      s.r = Math.min(s.R, s.r + dt * 5);
      if (s.t > s.life) this.smokes.splice(i, 1);
    }
    for (let i = this.marks.length - 1; i >= 0; i--) if ((this.marks[i].t -= dt) <= -0.3) this.marks.splice(i, 1);
  }
  // точка появления робота вне поля зрения игрока на расстоянии
  spawnNear(type, R, hunt) {
    const p = this.player;
    for (let k = 0; k < 20; k++) {
      const c = this.world.randomNear(p.x, p.z, null, R, this.rand);
      const d = Math.hypot(c[0] - p.x, c[1] - p.z);
      if (d < R * 0.6) continue;
      if (this.world.sees(c[0], c[2] + 1, c[1], p.x, this.eye(), p.z)) continue;
      return this.spawn(type, { x: c[0], y: c[2], z: c[1] }, { hunt });
    }
    return null;
  }

  stepPlayer(dt, inp) {
    const p = this.player;
    if (!p.alive) return;
    const W = this.weapon();
    if (p.invul > 0) p.invul -= dt;
    // приседание и прицел
    p.crouching = !!inp.crouch;
    p.crouch = clamp(p.crouch + (p.crouching ? 1 : -1) * dt * 7, 0, 1);
    p.h = lerp(PLAYER.height, PLAYER.crouchHeight, p.crouch);
    const canAim = !W.melee && p.reloadT <= 0 && p.equipT <= 0;
    p.aiming = !!inp.aim && canAim;
    p.aim = clamp(p.aim + (p.aiming ? 1 : -1) * dt * (W.scope ? 4.5 : 6), 0, 1);
    p.walk = !!inp.walk;
    // движение
    let mx = clamp(inp.mx || 0, -1, 1), mz = clamp(inp.mz || 0, -1, 1);
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const water = this.world.inWater(p.x, p.z, p.y + 0.1);
    let speed = PLAYER.run * W.speed * (this.mods.has("noarmor") ? 1.15 : 1);
    if (p.walk) speed *= PLAYER.walk;
    speed *= lerp(1, PLAYER.crouch, p.crouch);
    speed *= lerp(1, PLAYER.aimMove, p.aim);
    if (water) speed *= 0.62;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    // вперёд (−sin, −cos), вправо (cos, −sin)
    const wx = (-sy * mz + cy * mx) * speed, wz = (-cy * mz - sy * mx) * speed;
    const k = p.grounded ? 1 - Math.exp(-14 * dt) : 1 - Math.exp(-2.5 * dt);
    p.vx += (wx - p.vx) * k;
    p.vz += (wz - p.vz) * k;
    if (inp.jump && p.grounded && p.crouch < 0.3) {
      p.vy = PLAYER.jump;
      p.grounded = false;
      this.emit("jump");
    }
    const ox = p.x, oz = p.z;
    this.world.move(p, p.vx * dt, p.vz * dt, dt, PLAYER.gravity);
    // игрок не проходит сквозь роботов и своих
    for (const a of this.agents) {
      if (!a.alive || a.fly || a.def.camera || a.def.dummy || (a.team === "vip" && a.state === "captive")) continue;
      if (Math.abs(a.y - p.y) > 1.6) continue;
      const ex = p.x - a.x, ez = p.z - a.z, d = Math.hypot(ex, ez), min = p.r + a.r;
      if (d < min && d > 1e-4) {
        p.x += (ex / d) * (min - d);
        p.z += (ez / d) * (min - d);
      }
    }
    const moved = Math.hypot(p.x - ox, p.z - oz);
    p.speedNow = moved / dt;
    if (p.landed > 6) this.emit("land", { v: p.landed });
    p.landed = 0;
    // шаги: бегом слышно, шагом и пригнувшись — нет
    if (p.grounded && moved > 0) {
      p.stepD += moved;
      const stride = p.walk || p.crouch > 0.5 ? 1.5 : 2.1;
      if (p.stepD > stride) {
        p.stepD = 0;
        const loud = !p.walk && p.crouch < 0.5 && p.speedNow > 3;
        this.emit("step", { surface: water ? "water" : this.surfaceAt(p), loud, x: p.x, z: p.z });
        if (loud) this.noise(p.x, p.y, p.z, water ? 9 : 6.5, p);
        else if (water) this.noise(p.x, p.y, p.z, 3, p);
      }
    }
    // восстановление щита
    const cap = this.diff.regen * p.maxHp;
    if (this.t - p.lastHurt > 4.5 && p.hp < cap) p.hp = Math.min(cap, p.hp + 14 * dt);
    if (p.healLeft > 0) {
      const h = Math.min(p.healLeft, 25 * dt);
      p.hp = Math.min(p.maxHp, p.hp + h);
      p.healLeft -= h;
    }
    // оружие
    this.stepWeapon(dt, inp);
    // набор
    if (inp.kit && !p.kitUsed && p.kit !== "none" && p.kit !== "sapper") {
      p.kitUsed = true;
      if (p.kit === "battery") {
        p.healLeft = 50;
        this.emit("kit", { kind: "battery" });
      }
      if (p.kit === "scanner") {
        this.reveal = 12;
        this.emit("kit", { kind: "scanner" });
        if (this.obj.bomb) this.obj.bomb.found = true;
      }
    }
    if (inp.squad) {
      const mates = this.agents.filter((a) => a.team === "squad" && a.alive);
      if (mates.length) {
        const hold = mates[0].cmd !== "hold";
        for (const a of mates) {
          a.cmd = hold ? "hold" : "follow";
          a.hold = hold ? { x: a.x, z: a.z, y: a.y } : null;
          a.path = null;
        }
        this.emit("squad", { hold });
        this.radioSay(hold ? "Держим позицию!" : "Идём за тобой!", mates[0].name);
      }
    }
    // смотрели ли вокруг (для тренировки)
    if (inp.lookDX) p.lookTotal += Math.abs(inp.lookDX);
  }
  surfaceAt(p) {
    const list = this.world.near(p.x - 0.2, p.z - 0.2, p.x + 0.2, p.z + 0.2);
    for (const b of list) if (Math.abs(b.y1 - p.y) < 0.05 && this.world.inside(b, p.x, p.z)) return b.cont || b.stair || b.skin === "metal" ? "metal" : "hard";
    return this.map.ground === "sand" ? "sand" : this.map.ground === "carpet" ? "soft" : "hard";
  }

  stepWeapon(dt, inp) {
    const p = this.player;
    // смена оружия
    let want = null;
    if (inp.slot && p.slots[inp.slot] && inp.slot !== p.cur) want = inp.slot;
    if (inp.next) {
      const order = ["pri", "sec", "melee"].filter((s) => p.slots[s]);
      want = order[(order.indexOf(p.cur) + 1) % order.length];
      if (want === p.cur) want = null;
    }
    if (inp.last && p.slots[p.last] && p.last !== p.cur) want = p.last;
    if (want) {
      p.last = p.cur;
      p.cur = want;
      p.reloadT = 0;
      p.shellLoop = false;
      const w = p.ammo[want].w;
      p.equipT = w.equip;
      p.aim = 0;
      p.bloom *= 0.5;
      this.emit("equip", { weapon: w.id });
    }
    const A = p.ammo[p.cur], W = A.w;
    if (p.equipT > 0) p.equipT -= dt;
    p.fireT -= dt;
    if (p.throwT > 0) {
      p.throwT -= dt;
      if (p.throwT <= 0) this.throwNade();
    }
    // разброс остывает
    if (this.t - p.lastShot > 0.08) p.bloom = Math.max(0, p.bloom - W.recover * dt);
    // отдача возвращается
    if (this.t - p.lastShot > 0.12) {
      const back = Math.min(p.recP, dt * 7 * DEG + p.recP * dt * 5);
      p.recP -= back;
      p.pitch -= back;
      const backY = clamp(p.recY, -dt * 4 * DEG, dt * 4 * DEG);
      p.recY -= backY;
      p.yaw -= backY;
      if (this.t - p.lastShot > 0.35) p.shotN = 0;
    }
    // перезарядка
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (W.shell && inp.fire && A.mag > 0) {
        p.reloadT = 0;
        p.shellLoop = false;
      } else if (p.reloadT <= 0) {
        if (W.shell) {
          A.mag++;
          A.res--;
          this.emit("shell");
          if (A.mag < W.mag && A.res > 0) p.reloadT = W.reload;
          else this.emit("reloaded", { weapon: W.id });
        } else {
          const need = W.mag - A.mag, take = Math.min(need, A.res);
          A.mag += take;
          A.res -= take;
          this.emit("reloaded", { weapon: W.id });
        }
      }
    }
    if (p.autoReload > 0) {
      p.autoReload -= dt;
      if (p.autoReload <= 0 && p.reloadT <= 0 && A.mag === 0 && A.res > 0 && p.equipT <= 0) this.startReload();
    }
    if (inp.reload && !W.melee && p.reloadT <= 0 && A.mag < W.mag && A.res > 0 && p.equipT <= 0) this.startReload();
    // граната
    if (inp.grenade && p.throwT <= 0 && p.grenades.length && p.equipT <= 0) {
      let gi = inp.gslot ?? 0;
      if (gi >= p.grenades.length) gi = 0;
      p.throwing = p.grenades.splice(gi, 1)[0];
      p.throwT = 0.32;
      p.reloadT = 0;
      this.emit("pin", { kind: p.throwing });
    }
    // нож отдельной кнопкой
    if (inp.melee && p.meleeT <= 0) this.swing();
    if (p.meleeT > 0) p.meleeT -= dt;
    if (p.swingT > 0) {
      p.swingT -= dt;
      if (p.swingT <= 0) this.meleeHit();
    }
    // огонь
    const busy = p.equipT > 0 || p.throwT > 0 || p.swingT > 0;
    if (inp.fire && !busy) {
      if (W.melee) {
        if (p.meleeT <= 0) this.swing();
      } else if (p.reloadT <= 0 && p.fireT <= 0) {
        if (A.mag <= 0) {
          if (!p.trigger) this.emit("dry");
          if (A.res > 0) this.startReload();
        } else if (W.auto || !p.trigger || (this.t - p.lastShot) * (W.rpm / 60) > 1.45) {
          this.fire();
        }
      }
    }
    p.trigger = !!inp.fire;
  }
  startReload() {
    const p = this.player, A = p.ammo[p.cur], W = A.w;
    p.reloadT = W.shell ? W.reload : W.reload;
    p.shellLoop = !!W.shell;
    p.aim = 0;
    this.emit("reload", { weapon: W.id, shell: !!W.shell });
  }
  swing() {
    const p = this.player;
    p.meleeT = 0.6;
    p.swingT = 0.12;
    this.emit("swing");
  }
  meleeHit() {
    const p = this.player;
    const reach = WEAPONS.rezak.reach;
    const ey = this.eye();
    let best = null, bd = Infinity;
    for (const a of this.agents) {
      if (!a.alive || a.team !== "robot") continue;
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz) - a.r;
      if (d > reach) continue;
      const ang = Math.abs(wrap(yawTo(p.x, p.z, a.x, a.z) - p.yaw));
      if (ang > 0.75 && d > 0.4) continue;
      if (a.fly && Math.abs(a.y - ey) > 2.2) continue;
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    if (!best) {
      this.emit("whiff");
      return;
    }
    // со спины по ничего не подозревающему — бесшумно и сразу
    const behind = Math.abs(wrap(yawTo(best.x, best.z, p.x, p.z) - best.yaw)) > 1.9;
    const unaware = best.state !== "combat" || best.stunT > 0;
    const quiet = behind && unaware && !best.def.boss && best.type !== "molot";
    const dmg = quiet ? best.hp + 1 : WEAPONS.rezak.dmg * (best.def.boss ? 0.4 : 1);
    const hx = best.x, hy = best.y + best.h * 0.6, hz = best.z;
    this.emit("impact", { x: hx, y: hy, z: hz, nx: p.x - hx, ny: 0, nz: p.z - hz, kind: "robot", knife: true });
    this.damageRobot(best, dmg, { core: quiet, by: "rezak", knife: true, fromX: p.x, fromZ: p.z, quiet });
    this.stats.hits++;
    this.stats.shots++;
    if (!quiet) this.noise(p.x, p.y, p.z, 6, p);
  }

  // выстрел игрока
  fire() {
    const p = this.player, A = p.ammo[p.cur], W = A.w;
    A.mag--;
    p.fireT += 60 / W.rpm;
    if (p.fireT < 0) p.fireT = 0;
    p.lastShot = this.t;
    p.shotN++;
    this.stats.shots++;
    // разброс
    const moving = clamp(p.speedNow / 3.5, 0, 1);
    let spread = lerp(W.hip, W.ads, p.aim) * lerp(1, W.move, moving) * lerp(1, 0.78, p.crouch);
    if (!p.grounded) spread *= 2.4;
    if (W.scope && p.aim < 0.9) spread = Math.max(spread, W.hip * (1 - p.aim));
    spread += p.bloom;
    p.bloom = Math.min(W.bloomMax, p.bloom + W.bloom);
    const ey = this.eye();
    const pellets = W.pellets || 1;
    const shots = [];
    for (let i = 0; i < pellets; i++) {
      let yaw = p.yaw, pitch = p.pitch;
      const cone = pellets > 1 ? W.cone : spread;
      const r = Math.sqrt(this.rand()) * cone * 0.5 * (pellets > 1 ? 1 : 1), a = this.rand() * TAU;
      yaw += Math.cos(a) * r * DEG;
      pitch += Math.sin(a) * r * DEG;
      if (pellets > 1 && spread > W.hip) {
        yaw += (this.rand() - 0.5) * (spread - W.hip) * DEG;
        pitch += (this.rand() - 0.5) * (spread - W.hip) * DEG;
      }
      const d = lookDir(yaw, pitch);
      shots.push(this.trace(p.x, ey, p.z, d[0], d[1], d[2], W));
    }
    // отдача: ствол вверх, увод по узору
    const kick = W.kick * (0.85 + this.rand() * 0.3) * lerp(1, 0.75, p.crouch);
    const side = W.kickX * Math.sin(p.shotN * 0.85 + W.dmg) * (0.5 + Math.min(1, p.shotN / 8)) * (this.rand() < 0.5 ? 1 : 1);
    p.pitch = clamp(p.pitch + kick * DEG, -1.45, 1.45);
    p.recP += kick * DEG;
    p.yaw += side * DEG;
    p.recY += side * DEG;
    this.emit("shot", { weapon: W.id, hits: shots, aim: p.aim, crouch: p.crouch });
    this.noise(p.x, p.y, p.z, W.noise, p);
    if (A.mag <= 0 && A.res > 0) p.autoReload = 0.25;
  }
  // луч пули: стекло бьётся, роботы и щиты принимают урон
  trace(ox, oy, oz, dx, dy, dz, W) {
    let dmgK = 1, from = 0;
    const MAX = 140;
    for (let pass = 0; pass < 4; pass++) {
      const wall = this.world.ray(ox + dx * from, oy + dy * from, oz + dz * from, dx, dy, dz, MAX - from, "bullet");
      const wallT = wall ? wall.t + from : MAX;
      const hit = this.hitAgents(ox, oy, oz, dx, dy, dz, wallT, "robot");
      if (hit) {
        const x = ox + dx * hit.t, y = oy + dy * hit.t, z = oz + dz * hit.t;
        const dist = hit.t;
        const fall = W.range ? (dist <= W.range[0] ? 1 : dist >= W.range[1] ? W.range[2] : lerp(1, W.range[2], (dist - W.range[0]) / (W.range[1] - W.range[0]))) : 1;
        const a = hit.agent;
        if (hit.shield) {
          a.shield -= W.dmg * fall * dmgK * (W.pellets ? 2 : 1);
          this.emit("impact", { x, y, z, nx: -dx, ny: -dy, nz: -dz, kind: "shield" });
          if (a.shield <= 0) {
            a.shield = 0;
            this.emit("shieldBreak", { id: a.id, x, y, z });
            this.radioSay("Щит «Бастиона» сбит!", "Штаб");
          }
          this.stats.hits++;
          this.emit("hitmark", { core: false, shield: true });
          return { x, y, z, kind: "shield" };
        }
        let dmg = W.dmg * fall * dmgK;
        const coreMul = this.mods.has("cores") ? 3 : a.def.core;
        if (hit.core && !(a.def.boss && !a.vent)) dmg *= coreMul;
        else {
          dmg *= 1 - a.def.armor * (1 - W.pen);
          if (this.mods.has("cores")) dmg *= 0.6;
          if (a.def.boss) dmg *= hit.core ? 0.25 : 0.35;
        }
        this.stats.hits++;
        if (hit.core) this.stats.cores++;
        this.emit("impact", { x, y, z, nx: -dx, ny: -dy, nz: -dz, kind: hit.core ? "core" : "robot", robot: a.id });
        this.damageRobot(a, dmg, { core: hit.core && !(a.def.boss && !a.vent), by: W.id, fromX: ox, fromZ: oz });
        return { x, y, z, kind: hit.core ? "core" : "robot" };
      }
      if (!wall) return { x: ox + dx * MAX, y: oy + dy * MAX, z: oz + dz * MAX, kind: "none" };
      const x = ox + dx * wallT, y = oy + dy * wallT, z = oz + dz * wallT;
      if (wall.box.glass === "break") {
        this.world.broken.add(wall.box.i);
        this.emit("glass", { box: wall.box.i, x, y, z });
        this.noise(x, y, z, 10, null);
        dmgK *= 0.8;
        from = wallT + 0.02;
        continue;
      }
      this.emit("impact", { x, y, z, nx: wall.nx, ny: wall.ny, nz: wall.nz, kind: wall.box.glass ? "glassHard" : "wall", skin: wall.box.skin });
      return { x, y, z, kind: "wall" };
    }
    return { x: ox + dx * MAX, y: oy + dy * MAX, z: oz + dz * MAX, kind: "none" };
  }
  // попадание луча в агентов команды team: ближайшая сфера или щит
  hitAgents(ox, oy, oz, dx, dy, dz, maxT, team) {
    let best = null;
    for (const a of this.agents) {
      if (!a.alive || a.team !== team) continue;
      // быстрая отсечка по описанной сфере
      const cy = a.fly ? a.y : a.y + a.h * 0.5;
      const R = a.fly ? 1.2 : a.h * 0.75 + a.r + 0.4;
      const qx = a.x - ox, qy = cy - oy, qz = a.z - oz;
      const tc = qx * dx + qy * dy + qz * dz;
      if (tc < -R || tc > maxT + R) continue;
      const d2 = qx * qx + qy * qy + qz * qz - tc * tc;
      if (d2 > R * R) continue;
      const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
      // щит «Бастиона»: прямоугольник перед корпусом
      if (a.def.shield && a.shield > 0 && a.stunT <= 0) {
        const S = a.def.shield;
        const lo = this.toLocal(a, ox, oy, oz), ld = this.toLocalDir(a, dx, dy, dz);
        const t = this.slabLocal(lo, ld, -S.w / 2, S.w / 2, 0.1, S.h, S.depth - 0.12, S.depth + 0.12);
        if (t !== null && t < maxT && (!best || t < best.t)) best = { t, agent: a, shield: true };
      }
      for (const part of a.def.parts) {
        const [px, py, pz, pr, core] = part;
        const wx = a.x + px * c + pz * s, wy = (a.fly ? a.y : a.y) + py, wz = a.z - px * s + pz * c;
        const ux = wx - ox, uy = wy - oy, uz = wz - oz;
        const tt = ux * dx + uy * dy + uz * dz;
        if (tt < 0) continue;
        const dd = ux * ux + uy * uy + uz * uz - tt * tt;
        const rr = pr * (core ? 1.15 : 1);
        if (dd > rr * rr) continue;
        const t = tt - Math.sqrt(rr * rr - dd);
        if (t > maxT) continue;
        // ядро «Бастиона» за щитом не видно спереди — щит перехватит раньше
        if (!best || t < best.t - (core ? 0.12 : 0)) best = { t, agent: a, core: !!core, shield: false };
      }
    }
    return best;
  }
  toLocal(a, x, y, z) {
    const dx = x - a.x, dz = z - a.z, c = Math.cos(a.yaw), s = Math.sin(a.yaw);
    return [dx * c - dz * s, y - a.y, dx * s + dz * c];
  }
  toLocalDir(a, dx, dy, dz) {
    const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
    return [dx * c - dz * s, dy, dx * s + dz * c];
  }
  slabLocal(o, d, x0, x1, y0, y1, z0, z1) {
    let t0 = 0, t1 = 1e9;
    const B = [[x0, x1], [y0, y1], [z0, z1]];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < B[k][0] || o[k] > B[k][1]) return null;
        continue;
      }
      let a = (B[k][0] - o[k]) / d[k], b = (B[k][1] - o[k]) / d[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    return t0 > 0 ? t0 : null;
  }

  // урон роботу
  damageRobot(a, dmg, o = {}) {
    if (!a.alive || dmg <= 0) return;
    // учебная мишень «в прицел»: без прицела не считается
    if (a.needAim && this.player.aim < 0.7 && !o.byMate) {
      this.emit("needAim");
      return;
    }
    a.hp -= dmg;
    a.hurtT = this.t;
    a.flash = 1;
    // под огнём робот собирается быстрее
    if (a.state === "combat") a.seeT = Math.max(a.seeT, a.def.react * this.diff.react * 0.6);
    if (a.state !== "combat" && !a.def.dummy && !o.quiet) {
      a.state = "combat";
      a.aware = 1;
      a.target = this.player;
      a.lastSeen = { x: o.fromX ?? this.player.x, y: this.player.y, z: o.fromZ ?? this.player.z, t: this.t };
      if (this.mission.stealth && !this.alarm) a.alarmT = 1.4;
    }
    if (o.byPlayer !== false && !o.byMate) this.emit("hitmark", { core: !!o.core, kill: a.hp <= 0 });
    if (a.hp <= 0) this.killRobot(a, o);
  }
  killRobot(a, o = {}) {
    a.alive = false;
    a.hp = 0;
    a.deadT = 0;
    a.alarmT = 0;
    const byPlayer = !o.byMate && !o.byBlast;
    const pay = this.diff.pay * (this.o.payK || 1);
    if (o.byMate && !o.shutdown) {
      // за роботов, отключённых бойцами, — половина
      const half = Math.round((a.def.score || 0) * pay * 0.5);
      this.credits += half;
      this.earned.kills += half;
    }
    if (byPlayer || o.byPlayerBlast) {
      this.stats.kills++;
      if (o.core) this.stats.coreKills++;
      if (o.knife) this.stats.knife++;
      if (a.type === "molot") this.stats.molot++;
      const base = Math.round((a.def.score || 0) * pay);
      const bonus = o.core ? Math.round(base * ECON.core) : 0;
      this.credits += base + bonus;
      this.earned.kills += base;
      this.earned.cores += bonus;
      if (base) this.emit("credits", { amount: base + bonus, core: !!o.core });
    }
    this.feed.push({ t: this.t, who: o.byMate ? o.byMate : "Ты", what: a.def.name, weapon: o.by || "", core: !!o.core, knife: !!o.knife });
    if (this.feed.length > 6) this.feed.shift();
    this.emit("kill", { id: a.id, type: a.type, x: a.x, y: a.y, z: a.z, core: !!o.core, by: o.by, byPlayer, quiet: !!o.quiet, boss: !!a.def.boss });
    if (a.type === "kolobok" && !o.noBlast) this.blast(a.x, a.y + 0.5, a.z, a.def.blast.r, a.def.blast.dmg, { from: a, kind: "roller" });
    if (a.def.boss) {
      this.slowmo = 2.2;
      this.stats.boss = 1;
      for (const b of this.agents) if (b.alive && b.team === "robot" && b !== a) this.killRobot(b, { byBlast: true, noBlast: true, shutdown: true });
    }
    if (a.type !== "glaz" && a.def.dummy !== true && this.mission.stealth && !this.alarm && !o.quiet) {
      // громкое отключение рядом с другими роботами насторожит их
      this.noise(a.x, a.y, a.z, 12, this.player);
    }
  }

  // ---------- Шум и тревога ----------
  noise(x, y, z, R, src) {
    if (R <= 0) return;
    for (const a of this.agents) {
      if (!a.alive || a.team !== "robot" || a.def.camera || a.def.dummy) continue;
      const d = Math.hypot(a.x - x, a.z - z, (a.y - y) * 0.5);
      let r = R;
      if (d < r && !this.world.sees(a.x, a.y + 1, a.z, x, y + 1, z)) r *= 0.6;
      if (d > r) continue;
      if (a.state === "combat") {
        if (src && src.isPlayer && (!a.lastSeen || this.t - a.lastSeen.t > 2)) a.lastSeen = { x, y, z, t: this.t };
        continue;
      }
      a.state = "alert";
      a.alertAt = { x, y, z };
      a.alertT = 9;
      a.path = null;
      a.aware = Math.max(a.aware, 0.55);
      this.emit("robotAlert", { id: a.id });
    }
  }
  raiseAlarm(by) {
    if (this.alarm) return;
    this.alarm = true;
    this.stats.alarms++;
    this.emit("alarm", { x: by?.x, z: by?.z });
    this.radioSay("Тревога! ГОРН знает, где ты!", "Штаб");
    alertAll(this);
  }

  // ---------- Урон игроку и своим ----------
  hurt(target, dmg, o = {}) {
    if (!target.alive || dmg <= 0) return;
    if (target.isPlayer) {
      if (target.invul > 0) return;
      const p = target;
      dmg *= this.diff.dmg;
      if (p.helmet && (o.sniper || o.blast)) dmg *= 1 - 0.35;
      if (p.armor > 0) {
        const soak = Math.min(p.armor, dmg * 0.6);
        p.armor -= soak;
        dmg -= soak;
      }
      p.hp -= dmg;
      p.lastHurt = this.t;
      p.hurtX = o.fromX ?? p.x;
      p.hurtZ = o.fromZ ?? p.z;
      this.stats.dmgTaken += dmg;
      const punch = (p.helmet ? 0.5 : 1.4) * DEG * Math.min(2, dmg / 10);
      p.pitch = clamp(p.pitch + punch * (this.rand() * 0.8 + 0.4), -1.45, 1.45);
      p.yaw += punch * (this.rand() - 0.5);
      this.emit("hurt", { amount: dmg, fromX: o.fromX ?? p.x, fromZ: o.fromZ ?? p.z, blast: !!o.blast });
      if (p.hp <= 0) {
        p.hp = 0;
        p.alive = false;
        this.emit("down");
        this.lose("down");
      }
      return;
    }
    if (target.team === "squad") {
      target.hp -= dmg * 0.6 * this.diff.dmg;
      target.hurtT = this.t;
      if (target.hp <= 0) {
        target.alive = false;
        target.deadT = 0;
        this.emit("mateDown", { id: target.id, name: target.name, x: target.x, y: target.y, z: target.z });
        this.radioSay("Щит пробит, отхожу!", target.name);
      }
      return;
    }
    if (target.team === "vip") {
      if (target.state === "captive" || target.down) return;
      target.hp -= dmg * 0.5 * this.diff.dmg;
      target.hurtT = this.t;
      this.stats.vipHurt += dmg;
      if (target.hp <= 0) {
        target.hp = 0;
        target.down = true;
        target.state = "down";
        this.emit("vipDown", { name: target.name });
        const he = target.name === "Тимур";
        this.radioSay(`${target.name} ${he ? "оглушён" : "оглушена"}! Подними ${he ? "его" : "её"}!`, "Штаб");
      }
    }
  }
  lose(reason) {
    if (this.phase !== "live") return;
    this.phase = "lost";
    this.reason = reason;
    this.emit("roundLost", { reason });
  }
  win() {
    if (this.phase !== "live") return;
    this.phase = "won";
    this.emit("roundWon", {});
  }
  // вернуть игрока в бой (ролик за награду или повтор)
  revive() {
    const p = this.player;
    p.alive = true;
    p.hp = 70;
    p.invul = 2.5;
    p.lastHurt = this.t;
    this.phase = "live";
    this.reason = "";
    for (const a of this.agents) if (a.alive && a.team === "robot" && Math.hypot(a.x - p.x, a.z - p.z) < 3 && a.type === "kolobok") this.killRobot(a, { byBlast: true, noBlast: true });
    this.emit("revive");
  }

  // ---------- Гранаты, ракеты, взрывы ----------
  throwNade() {
    const p = this.player;
    const kind = p.throwing;
    p.throwing = null;
    if (!kind) return;
    const d = lookDir(p.yaw, p.pitch + 0.16);
    const ey = this.eye();
    const sp = 15.5;
    this.nades.push({
      id: this.uid++, kind, x: p.x + d[0] * 0.4, y: ey - 0.15, z: p.z + d[2] * 0.4,
      vx: d[0] * sp + p.vx * 0.5, vy: d[1] * sp + 1.2, vz: d[2] * sp + p.vz * 0.5, t: 0, fuse: GRENADES[kind].fuse, owner: "player", spin: 0,
    });
    this.emit("throw", { kind });
  }
  stepNades(dt) {
    const w = this.world;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.t += dt;
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const h = dt / sub;
        n.vy -= 15 * h;
        const sp = Math.hypot(n.vx, n.vy, n.vz);
        if (sp > 0.01) {
          const dx = n.vx / sp, dy = n.vy / sp, dz = n.vz / sp, L = sp * h;
          const hit = w.ray(n.x, n.y, n.z, dx, dy, dz, L + 0.08, "bullet");
          if (hit) {
            n.x += dx * Math.max(0, hit.t - 0.08);
            n.y += dy * Math.max(0, hit.t - 0.08);
            n.z += dz * Math.max(0, hit.t - 0.08);
            const vn = n.vx * hit.nx + n.vy * hit.ny + n.vz * hit.nz;
            n.vx = (n.vx - 2 * vn * hit.nx) * 0.5;
            n.vy = (n.vy - 2 * vn * hit.ny) * 0.4;
            n.vz = (n.vz - 2 * vn * hit.nz) * 0.5;
            if (Math.abs(vn) > 2) this.emit("bounce", { x: n.x, y: n.y, z: n.z });
            if (hit.box.glass === "break") {
              w.broken.add(hit.box.i);
              this.emit("glass", { box: hit.box.i, x: n.x, y: n.y, z: n.z });
            }
          } else {
            n.x += n.vx * h;
            n.y += n.vy * h;
            n.z += n.vz * h;
          }
        }
        const g = w.groundAt(n.x, n.z, 0.05, n.y + 0.05);
        if (n.y < g + 0.06) {
          n.y = g + 0.06;
          if (n.vy < -2.5) this.emit("bounce", { x: n.x, y: n.y, z: n.z });
          n.vy = Math.abs(n.vy) > 1.5 ? -n.vy * 0.32 : 0;
          n.vx *= 0.7;
          n.vz *= 0.7;
        }
        // граница карты
        const [x0, z0, x1, z1] = this.map.bounds;
        if (n.x < x0 || n.x > x1) n.vx *= -0.4;
        if (n.z < z0 || n.z > z1) n.vz *= -0.4;
        n.x = clamp(n.x, x0 + 0.1, x1 - 0.1);
        n.z = clamp(n.z, z0 + 0.1, z1 - 0.1);
      }
      if (n.t >= n.fuse) {
        this.nades.splice(i, 1);
        this.detonate(n);
      }
    }
  }
  detonate(n) {
    const G = GRENADES[n.kind];
    if (n.kind === "frag") this.blast(n.x, n.y + 0.2, n.z, G.radius, G.dmg, { kind: "frag", player: true });
    if (n.kind === "emp") {
      this.emit("emp", { x: n.x, y: n.y + 0.3, z: n.z, r: G.radius });
      let stunned = 0;
      for (const a of this.agents) {
        if (!a.alive || a.team !== "robot") continue;
        const d = Math.hypot(a.x - n.x, (a.fly ? a.y : a.y + 1) - n.y, a.z - n.z);
        if (d > G.radius) continue;
        const k = a.def.boss ? 0.5 : 1;
        a.stunT = Math.max(a.stunT, G.stun * k);
        a.chargeT = 0;
        a.fuseT = 0;
        a.burst = 0;
        if (a.def.boss) {
          a.vent = Math.max(a.vent || 0, 4.5);
        }
        if (a.def.camera) {
          a.stunT = 12;
          a.aware = 0;
        }
        a.alarmT = 0;
        a.flash = 1;
        stunned++;
        this.damageRobot(a, a.def.dummy ? 50 : 8, { byPlayer: false, by: "emp" });
        this.emit("stun", { id: a.id });
      }
      this.stats.emp += stunned;
      this.noise(n.x, n.y, n.z, 14, this.player);
    }
    if (n.kind === "smoke") {
      this.smokes.push({ x: n.x, y: n.y + 1.2, z: n.z, r: 1, R: G.radius, t: 0, life: G.time });
      this.emit("smoke", { x: n.x, y: n.y, z: n.z, r: G.radius, life: G.time });
    }
  }
  // взрыв: урон с затуханием, стены гасят часть урона
  blast(x, y, z, R, dmg, o = {}) {
    this.emit("explosion", { x, y, z, r: R, kind: o.kind || "frag" });
    const w = this.world;
    const factor = (bx, by, bz) => {
      const d = Math.hypot(bx - x, by - y, bz - z);
      if (d > R) return 0;
      const open = w.sees(x, y, z, bx, by, bz, "bullet") ? 1 : 0.3;
      return (1 - (d / R) * 0.8) * open;
    };
    for (const a of this.agents) {
      if (!a.alive || a === o.from) continue;
      const k = factor(a.x, a.fly ? a.y : a.y + a.h * 0.5, a.z);
      if (k <= 0) continue;
      if (a.team === "robot") {
        let d = dmg * k;
        if (a.def.boss) d *= 0.35;
        if (a.def.shield && a.shield > 0) a.shield -= d * 0.5;
        this.damageRobot(a, d, { byBlast: !o.player, byPlayerBlast: !!o.player, by: o.kind, byPlayer: !!o.player });
      } else if (o.kind !== "frag" || a.team !== "squad") this.hurt(a, dmg * k * (o.kind === "frag" ? 0.25 : 0.7), { blast: true, fromX: x, fromZ: z });
    }
    const p = this.player;
    const k = factor(p.x, this.eye() - 0.6, p.z);
    if (k > 0) this.hurt(p, dmg * k * (o.player ? 0.5 : 1), { blast: true, fromX: x, fromZ: z });
    this.noise(x, y, z, 40, null);
  }
  // ракета робота
  launch(from, tx, ty, tz, def, sx, sy, sz) {
    const dx = tx - sx, dy = ty - sy, dz = tz - sz, d = Math.hypot(dx, dy, dz) || 1;
    this.rockets.push({ id: this.uid++, x: sx, y: sy, z: sz, vx: (dx / d) * def.speed, vy: (dy / d) * def.speed, vz: (dz / d) * def.speed, dmg: def.dmg, r: def.r, t: 0, from });
    this.emit("rocket", { x: sx, y: sy, z: sz });
  }
  stepRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      const sp = Math.hypot(r.vx, r.vy, r.vz), L = sp * dt;
      const dx = r.vx / sp, dy = r.vy / sp, dz = r.vz / sp;
      const hit = this.world.ray(r.x, r.y, r.z, dx, dy, dz, L, "bullet");
      let boom = !!hit;
      let nx = r.x + dx * (hit ? hit.t : L), ny = r.y + dy * (hit ? hit.t : L), nz = r.z + dz * (hit ? hit.t : L);
      if (ny < this.world.groundAt(nx, nz, 0.05, ny + 0.1)) boom = true;
      // близко к игроку или своим
      const p = this.player;
      if (p.alive && Math.hypot(p.x - nx, this.eye() - 0.5 - ny, p.z - nz) < 0.9) boom = true;
      for (const a of this.agents) if (a.alive && a.team !== "robot" && Math.hypot(a.x - nx, a.y + 1 - ny, a.z - nz) < 0.8) boom = true;
      r.x = nx;
      r.y = ny;
      r.z = nz;
      if (boom || r.t > 6) {
        this.rockets.splice(i, 1);
        this.blast(r.x, r.y, r.z, r.r, r.dmg, { from: r.from, kind: "rocket" });
      }
    }
  }
  // заслоняет ли дым отрезок
  smoked(ax, ay, az, bx, by, bz) {
    for (const s of this.smokes) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz;
      let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / L2;
      t = clamp(t, 0, 1);
      const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
      if (px * px + py * py * 0.6 + pz * pz < s.r * s.r * 0.8) return true;
    }
    return false;
  }

  // ---------- Цели ----------
  near(pt, R) {
    const p = this.player;
    return p.alive && Math.hypot(p.x - pt.x, p.z - pt.z) < R && Math.abs(p.y - (pt.y ?? p.y)) < 2;
  }
  updateObjective(dt, inp = {}) {
    const o = this.obj, p = this.player, s = this.spec;
    const sapper = p.kit === "sapper" ? 2 : 1;
    o.useHint = "";
    o.useK = 0;
    const holdUse = (kind, need, key) => {
      if (inp.use) {
        if (p.useKind !== key) {
          p.useKind = key;
          p.useT = 0;
        }
        p.useT += dt;
        o.useK = p.useT / need;
        if (p.useT >= need) {
          p.useT = 0;
          p.useKind = "";
          return true;
        }
      } else if (p.useKind === key) {
        p.useT = Math.max(0, p.useT - dt * 2);
        o.useK = p.useT / need;
      }
      return false;
    };
    let usingSomething = false;
    // инженер: освободить или поднять
    if (this.vip) {
      const v = this.vip;
      if (v.state === "captive" && this.near(v, 2.2)) {
        usingSomething = true;
        o.useHint = "Освободить: " + v.name;
        if (holdUse("rescue", 2.2, "rescue")) {
          v.state = "follow";
          this.trig.rescue = this.t;
          this.credits += 500;
          this.earned.objective += 500;
          this.emit("rescued", { name: v.name });
          this.radioSay(v.name === "Тимур" ? "Спасибо! Я за тобой." : "Спасибо, «Рубеж»! Иду за тобой.", v.name);
        }
      } else if (v.down && this.near(v, 2.2)) {
        usingSomething = true;
        o.useHint = "Поднять: " + v.name;
        if (holdUse("revive", 1.8, "revive")) {
          v.down = false;
          v.hp = v.maxHp * 0.6;
          v.state = "follow";
          this.emit("vipUp");
        }
      }
    }
    if (o.kind === "clear") {
      const left = this.hostileLeft();
      const pending = (s.waves || []).some((w, i) => !this.wavesDone.has(i));
      o.text = left ? `Отключите роботов: ${left}` : "Зачистка…";
      if (!left && !pending) this.win();
    }
    if (o.kind === "stealth") {
      if (o.stage === "go") {
        o.text = this.alarm ? "Тревога! Доберитесь до пульта" : "Тихо доберитесь до пульта";
        if (this.near(o.target, 2.2)) {
          usingSomething = true;
          o.useHint = "Подключиться к пульту";
          if (holdUse("hack", s.hack, "hack")) {
            o.stage = o.exit ? "exit" : "done";
            this.trig.hack = this.t;
            const bonus = this.alarm ? 400 : 900;
            this.credits += bonus;
            this.earned.objective += bonus;
            this.emit("hacked");
            if (!o.exit) this.win();
          } else if (p.useKind === "hack") o.text = `Подключение… ${Math.round(o.useK * 100)}%`;
        }
      } else if (o.stage === "exit") {
        o.text = "Уходите к точке эвакуации";
        if (this.near(o.exit, 3.2)) this.win();
      }
    }
    if (o.kind === "plant" || o.kind === "skirmish") {
      if (o.kind === "skirmish" && !o.planted) {
        o.clock -= dt;
        if (o.clock <= 0) this.lose("time");
        if (this.hostileLeft() === 0) this.win();
      }
      if (!o.planted) {
        o.text = o.kind === "skirmish" ? "Заряд к точке А или Б — или отключите всех" : "Установите заряд у ретранслятора А или Б";
        for (const site of o.sites) {
          if (this.near(site, 2.2)) {
            usingSomething = true;
            o.useHint = "Установить заряд: " + site.label;
            if (holdUse("plant", (s.plant || 3) / sapper, "plant" + site.label)) {
              o.planted = { x: site.x, y: site.y, z: site.z, label: site.label, left: s.defend, defuse: 0 };
              this.trig.plant = this.t;
              this.emit("planted", { label: site.label, x: site.x, z: site.z });
              this.radioSay("Заряд установлен у точки " + site.label + ". Держим!", "Штаб");
              for (const a of this.robots()) if (!a.def.camera) {
                a.state = "combat";
                a.target = a.target || this.player;
                a.lastSeen = { x: site.x, y: site.y, z: site.z, t: this.t };
              }
            }
          }
        }
      } else {
        const c = o.planted;
        c.left -= dt;
        o.text = `Защищайте заряд ${c.label}: ${Math.ceil(c.left)} с`;
        // роботы снимают заряд
        let defusing = false;
        for (const a of this.robots()) {
          if (a.def.camera || a.fly || a.type === "kolobok" || a.stunT > 0) continue;
          if (Math.hypot(a.x - c.x, a.z - c.z) < 1.8) defusing = true;
        }
        if (defusing) {
          c.defuse += dt;
          o.text = `Робот снимает заряд! ${Math.round((c.defuse / 5) * 100)}%`;
          if (c.defuse >= 5) {
            this.emit("defusedByRobot");
            this.lose("defused");
          }
        } else c.defuse = Math.max(0, c.defuse - dt * 0.5);
        if (c.left <= 0) {
          this.emit("relayBoom", { x: c.x, y: c.y, z: c.z });
          this.stats.relays++;
          this.credits += 700;
          this.earned.objective += 700;
          this.win();
        }
      }
    }
    if (o.kind === "defuse") {
      const b = o.bomb;
      o.left -= dt;
      if (!b.found) {
        if (Math.hypot(p.x - b.x, p.z - b.z) < 13 && this.world.sees(p.x, this.eye(), p.z, b.x, b.y + 0.6, b.z)) {
          b.found = true;
          this.emit("bombFound", { label: b.label });
          this.radioSay("Бомба у точки " + b.label + "!", "Штаб");
        }
      }
      o.text = b.found ? `Обезвредьте бомбу у точки ${b.label}: ${Math.ceil(o.left)} с` : `Найдите бомбу у А или Б: ${Math.ceil(o.left)} с`;
      if (this.near(b, 2)) {
        usingSomething = true;
        o.useHint = "Обезвредить бомбу";
        if (holdUse("defuse", s.defuse / sapper, "defuse")) {
          this.stats.relays++;
          this.credits += 800;
          this.earned.objective += 800;
          this.emit("defused", {});
          this.win();
        } else if (p.useKind === "defuse") o.text = `Обезвреживание… ${Math.round(o.useK * 100)}%`;
      }
      if (o.left <= 0 && this.phase === "live") {
        this.emit("bombBoom", { x: b.x, y: b.y, z: b.z });
        this.lose("bomb");
      }
    }
    if (o.kind === "rescue") {
      const v = this.vip;
      if (v.state === "captive") o.text = `Найдите и освободите: ${v.name}`;
      else if (v.down) o.text = `${v.name} оглушен${v.name === "Тимур" ? "" : "а"} — поднимите!`;
      else {
        o.text = `Доведите ${v.name === "Тимур" ? "Тимура" : "Веру"} до точки эвакуации`;
        if (Math.hypot(v.x - o.exit.x, v.z - o.exit.z) < 4.6 && Math.abs(v.y - o.exit.y) < 2) {
          this.stats.rescue = this.stats.vipHurt < 1 ? 2 : 1;
          this.credits += 600;
          this.earned.objective += 600;
          this.win();
        }
      }
    }
    if (o.kind === "hold") {
      const inZone = this.near(o.zone, o.zone.r);
      if (inZone && p.alive) {
        o.held += dt;
        if (o.held - dt <= 0) this.trig.hold = this.t;
      }
      o.text = inZone ? `Удерживайте точку: ${Math.ceil(o.need - o.held)} с` : `Вернитесь в круг! Осталось ${Math.ceil(o.need - o.held)} с`;
      o.inZone = inZone;
      if (o.held >= o.need) {
        this.credits += 600;
        this.earned.objective += 600;
        this.win();
      }
    }
    if (o.kind === "boss") {
      const b = this.boss;
      o.text = b.alive ? (b.vent > 0 ? "Ядро открыто — огонь по ядру!" : "Победите «Наковальню»") : "«Наковальня» повержена!";
      if (!b.alive) {
        this.credits += 2000;
        this.earned.objective += 2000;
        if (this.slowmo <= 0 || this.t - b.deadT > 1) this.win();
      }
    }
    if (o.kind === "training" && this.trainingStep(dt, inp)) usingSomething = true;
    if (!usingSomething && p.useKind) {
      p.useKind = "";
      p.useT = 0;
    }
  }
  // Задержка победы над боссом: замедление на 2 секунды
  tickSlowmo(realDt) {
    if (this.slowmo > 0) {
      this.slowmo -= realDt;
      if (this.slowmo <= 0 && this.obj.kind === "boss" && !this.boss.alive) this.win();
      return 0.25;
    }
    return 1;
  }
  // волны подкрепления
  checkWaves() {
    const s = this.spec;
    (s.waves || []).forEach((w, i) => {
      if (this.wavesDone.has(i)) return;
      const [kind, arg] = w.when.split(":");
      const n = Number(arg);
      let go = false;
      if (kind === "t") go = this.t >= n;
      if (kind === "left") go = this.hostileLeft() <= n;
      if (kind === "alarm") go = this.alarm;
      if (kind === "hack") go = this.trig.hack !== undefined && this.t - this.trig.hack >= (n || 0);
      if (kind === "plant") go = this.trig.plant !== undefined && this.t - this.trig.plant >= (n || 0);
      if (kind === "rescue") go = this.trig.rescue !== undefined && this.t - this.trig.rescue >= (n || 0);
      if (kind === "hold") go = this.obj.held !== undefined && this.obj.held >= this.obj.need * n && this.obj.held > 0;
      if (!go) return;
      this.wavesDone.add(i);
      for (const [type, at, extra] of w.list) {
        const a = this.spawn(type, at, { hunt: !!w.hunt, ...(extra || {}) });
        if (this.obj.planted && a.type !== "osa") a.lastSeen = { x: this.obj.planted.x, y: this.obj.planted.y, z: this.obj.planted.z, t: this.t };
        if (this.obj.kind === "hold") a.lastSeen = { x: this.obj.zone.x, y: this.player.y, z: this.obj.zone.z, t: this.t };
      }
      if (w.say) this.radioSay(w.say, "Штаб");
      this.emit("wave", { count: w.list.length });
    });
  }

  // ---------- Тренировка ----------
  trainingStep(dt, inp) {
    const o = this.obj, p = this.player;
    const steps = TRAINING;
    const st = steps[o.step];
    if (!st) return;
    o.text = st.text;
    o.hint = st.hint;
    o.stepT += dt;
    let done = false;
    if (st.id === "look") done = p.lookTotal > 2.2;
    if (st.id === "move") {
      o.marker = this.map.points.mark;
      done = this.near(o.marker, 1.3);
    }
    if (st.id === "crouch") done = p.crouch > 0.9 && o.stepT > 0.4;
    if (st.id === "shoot" || st.id === "aim" || st.id === "grenade" || st.id === "fight") {
      if (!o.spawned) {
        o.spawned = true;
        for (const [type, at, extra] of st.spawn) {
          const a = this.spawn(type, at, extra || {});
          a.training = true;
        }
      }
      const left = this.agents.filter((a) => a.alive && a.training).length;
      o.text = st.text + (left ? ` (${left})` : "");
      done = left === 0 || (st.id === "grenade" && left <= 1 && o.stepT > 1);
      if (st.id === "grenade" && !p.grenades.length && this.nades.length === 0 && !done && o.stepT > 2) {
        p.grenades.push("frag");
      }
      if (st.id === "aim") {
        o.marker = this.map.points.t6;
        // мишень только для прицела: без прицела не засчитываем
        for (const a of this.agents) if (a.training && a.alive) a.needAim = true;
      }
      if (done) for (const a of this.agents) if (a.training && a.alive) this.killRobot(a, { byBlast: true, noBlast: true });
    }
    if (st.id === "reload") done = o.reloaded || false;
    if (st.id === "switch") done = o.switched || false;
    let using = false;
    if (st.id === "plant") {
      o.marker = this.map.points.plant;
      if (this.near(o.marker, 2.2)) {
        o.useHint = "Установить заряд";
        using = true;
        if (inp.use) {
          if (p.useKind !== "train") p.useT = 0;
          p.useT += dt;
          o.useK = p.useT / 2;
          p.useKind = "train";
          if (p.useT >= 2) {
            done = true;
            p.useT = 0;
            p.useKind = "";
            this.emit("planted", { label: "А", x: o.marker.x, z: o.marker.z });
          }
        }
      }
    }
    if (done) {
      o.step++;
      o.stepT = 0;
      o.spawned = false;
      o.marker = null;
      this.emit("trainStep", { step: o.step, total: steps.length });
      if (o.step >= steps.length) this.win();
    }
    return using;
  }
  // события для тренировки, которые удобнее ловить снаружи шага
  noteTraining(ev) {
    if (this.obj.kind !== "training") return;
    if (ev.type === "reloaded") this.obj.reloaded = true;
    if (ev.type === "equip") this.obj.switched = true;
  }
}

// Шаги тренировки
export const TRAINING = [
  { id: "look", text: "Осмотрись вокруг", hint: "Мышь или правая половина экрана" },
  { id: "move", text: "Подойди к огневому рубежу", hint: "WASD или левый джойстик" },
  { id: "crouch", text: "Пригнись", hint: "C / Ctrl или кнопка «Присесть»" },
  { id: "shoot", text: "Отключи мишени", hint: "Левая кнопка мыши или кнопка огня", spawn: [["mishen", "t1", { face: 0 }], ["mishen", "t2", { face: 0 }], ["mishen", "t3", { face: 0 }]] },
  { id: "reload", text: "Перезарядись", hint: "R или кнопка перезарядки" },
  { id: "aim", text: "Прицелься и попади в мишень под меткой", hint: "Из прохода: ПКМ или кнопка прицела", spawn: [["mishen", "t6", { face: 0 }]] },
  { id: "grenade", text: "Брось гранату в группу мишеней", hint: "G или кнопка гранаты", spawn: [["mishen", "g1", { face: 0 }], ["mishen", "g2", { face: 0 }], ["mishen", "g3", { face: 0 }]] },
  { id: "switch", text: "Смени оружие", hint: "1–3, колесо мыши или кнопки оружия" },
  { id: "plant", text: "Установи учебный заряд у отметки", hint: "Держи E или кнопку действия" },
  { id: "fight", text: "Бой: отключи двух патрульных «Жуков»", hint: "Цельтесь в светящееся ядро", spawn: [["zhuk", "l1", { wake: true }], ["zhuk", "l2", { wake: true }]] },
];

// Особые задания: тренировка и схватка в общем формате
export function trainingMission() {
  return { id: "training", map: "range", name: "Тренировка", time: "range", mates: 0, rounds: [{ kind: "training", spawn: "S", robots: [] }] };
}
