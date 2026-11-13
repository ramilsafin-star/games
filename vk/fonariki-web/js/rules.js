// Правила забега без графики: сумерки → 5 ночей → рассвет. Перенос серверной части сетевой версии
// (Round, Fireflies, Shadows, Food, Freeze, Buffs, Shrines, Events). Игрок один, вместо других
// игроков — помощники (ai.js). Экран читает состояние и забирает события из run.out.
import {
  CAMP, DEPOSIT_RADIUS, NIGHTS, DUSK_SECONDS, NIGHT_SECONDS, BREAK_SECONDS, START_LIGHT, MAX_LIGHT, radius, decay,
  FIREFLY_BY_ID, MUTATIONS, MUTATION_NIGHT_BONUS, RARITY_BANDS, FOREST_MIN, FOREST_MAX, WILD_BASE, WILD_PER, WILD_MAX,
  CATCH_DISTANCE, SHADOW, shadowCount, SHADOW_KINDS, PLACES, FOOD, FREEZE_SECONDS, THAW_HOLD, THAW_REACH, BOSS,
  REWARD_PER_NIGHT, REWARD_DAWN, STARTER_DISTANCE, QUEST_REWARD, INDEX_BONUS, BUFFS, SHRINES, SHRINE_COOLDOWN,
  SHRINE_REACH, EVENTS, GARDEN, CREW, fireflyLight, fireflyCoins, isRare, makeRng, clamp, TAU,
} from "./config.js?v=6e619b94";
import { collide, blocked } from "./layout.js?v=6e619b94";
import { addCaught, gardenAdd, slots, upgradeValue, gardenRate, finishRun } from "./save.js?v=6e619b94";
import { crewThink } from "./ai.js?v=6e619b94";

const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const campDist = (a) => Math.hypot(a.x - CAMP.x, a.z - CAMP.z);

function actor(o) {
  return {
    x: 0, z: 0, dir: 0, vx: 0, vz: 0, speed: 16, jar: [], jarMax: 3, frozen: 0, frozenTotal: 0, snacks: 0, grace: 0,
    buffs: {}, hold: { kind: null, ref: null, t: 0 }, repeat: 0, isPlayer: false, ai: {}, bump: 0, ...o,
  };
}

export class Run {
  constructor(save, layout, opts = {}) {
    this.save = save;
    this.layout = layout;
    this.rng = makeRng(opts.seed ?? Math.floor(Math.random() * 1e9));
    this.crewN = clamp(opts.crew ?? save.crew, 0, CREW.length);
    this.phase = "dusk0";
    this.night = 0;
    this.t = 0;
    this.time = 0;
    this.endT = 0;
    this.light = START_LIGHT;
    this.radius = radius(START_LIGHT);
    this.out = [];
    this.over = false;
    this.won = false;
    this.player = actor({
      id: "player",
      isPlayer: true,
      x: 0,
      z: 8.5,
      dir: Math.PI,
      speed: upgradeValue(save, "boots"),
      jarMax: upgradeValue(save, "jar"),
      snacks: opts.snacks || 0,
    });
    this.crew = CREW.slice(0, this.crewN).map((c, i) => {
      const a = Math.PI / 2 + ((i + 1) / (this.crewN + 1)) * Math.PI * 1.2 - 0.6 * Math.PI;
      return actor({ id: c.id, x: Math.cos(a) * 7.5, z: Math.sin(a) * 7.5, speed: c.speed, jarMax: c.jar, index: i });
    });
    this.people = [this.player, ...this.crew];
    this.wild = [];
    this.wildId = 0;
    this.shadows = [];
    this.shadowId = 0;
    this.boss = null;
    this.bossSpawned = false;
    this.event = null;
    this.eventQueue = [];
    this.lastEvent = "";
    this.mods = { decayEvent: 1, extraShadows: 0, shadowSpeed: 1, aggroMult: 1 };
    this.team = { wood: 0 };
    this.shrineRest = {};
    this.announced = {};
    this.selfThawUsed = false;
    this.needHouseAt = -99;
    this.lowLightAt = -99;
    this.stats = { glow: 0, caught: 0, fed: 0, newEntries: [], frozen: 0, rescues: 0, eaten: 0, nights: 0, minLight: START_LIGHT, nightEnd: [], bossHit: false, bossBeaten: false, record: false, crewFrozen: 0 };
    this.spawnClock = 0;
    for (let i = 0; i < this.wanted(); i++) this.spawnRandom();
    // новичку — два светлячка у самого лагеря, чтобы первый улов был за полминуты
    if (save.quest === 1 || save.quest === 3) {
      for (let i = 1; i <= 2; i++) {
        // в стороне от сада (иначе игрок с первым светлячком сразу стоит на лужайке)
        const a = Math.PI / 3 + this.rng.range(-0.35, 0.35);
        const d = STARTER_DISTANCE + i * 3;
        this.spawnAt(this.roll(d), Math.cos(a) * d, 3, Math.sin(a) * d);
      }
    }
    this.toast("dusk", null, "info");
  }

  // ---------- мелочи ----------
  emit(e) {
    this.out.push(e);
  }
  toast(key, args, kind = "info", who = null) {
    if (who && !who.isPlayer) return; // подсказки только игроку
    this.emit({ type: "toast", key, args: args || {}, kind });
  }
  wanted() {
    return Math.min(WILD_MAX, WILD_BASE + WILD_PER * (1 + this.crewN));
  }
  setLight(v) {
    this.light = clamp(v, 0, MAX_LIGHT);
    this.radius = radius(this.light);
    if (this.phase === "night") this.stats.minLight = Math.min(this.stats.minLight, this.light);
  }
  addLight(d) {
    this.setLight(this.light + d);
  }
  inDark(a) {
    return campDist(a) > this.radius + 0.5;
  }
  addCoins(n) {
    this.save.coins += n;
    this.save.total += n;
    this.stats.glow += n;
  }
  buffOn(a, id) {
    return (a.buffs[id] || 0) > 0 || (BUFFS[id].team && this.team[id] > 0);
  }
  speedOf(a) {
    if (!a.isPlayer) return a.speed;
    return upgradeValue(this.save, "boots") + (this.buffOn(a, "speed") ? BUFFS.speed.bonus : 0);
  }

  // ---------- светлячки ----------
  pickKind(distance) {
    for (const band of RARITY_BANDS) {
      if (distance <= band.upTo) {
        const entries = Object.entries(band.weights);
        let total = 0;
        for (const [, w] of entries) total += w;
        let roll = this.rng.next() * total;
        for (const [id, w] of entries) {
          roll -= w;
          if (roll <= 0) return id;
        }
        return entries[0][0];
      }
    }
    return "spark";
  }
  // ночью мутации чаще, к пятой ночи втрое
  pickMutation() {
    const bonus = this.phase === "night" ? 1 + MUTATION_NIGHT_BONUS * (this.night - 1) : 1;
    for (const m of MUTATIONS) if (this.rng.next() * 100 < m.chance * bonus) return m.id;
    return "none";
  }
  roll(distance) {
    return { k: this.pickKind(distance), m: this.pickMutation(), s: Math.round(this.rng.range(0.8, 1.25) * 100) / 100 };
  }
  spawnAt(rec, x, y, z, from = null) {
    const w = {
      id: ++this.wildId, rec, hx: x, hy: y, hz: z, x, y, z,
      f: [this.rng.range(0.3, 0.7), this.rng.range(0.5, 1.1), this.rng.range(0.3, 0.7)],
      born: this.time, from, taken: null,
    };
    this.placeWild(w);
    this.wild.push(w);
    return w;
  }
  spawnRandom() {
    for (let tries = 0; tries < 6; tries++) {
      const a = this.rng.range(0, TAU);
      const d = this.rng.range(FOREST_MIN, FOREST_MAX);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (blocked(this.layout, x, z, 3)) continue;
      return this.spawnAt(this.roll(d), x, this.rng.range(2.5, 4.5), z);
    }
    return null;
  }
  placeWild(w) {
    const t = this.time, f = w.f;
    w.x = w.hx + Math.sin(t * f[0] + f[2] * 10) * 2.5;
    w.y = w.hy + Math.sin(t * f[1] * 1.7 + f[0] * 10) * 0.7;
    w.z = w.hz + Math.cos(t * f[2] + f[1] * 10) * 2.5;
  }
  removeWild(w) {
    const i = this.wild.indexOf(w);
    if (i >= 0) this.wild.splice(i, 1);
  }
  // звездопад: редкие светлячки садятся у самого края света, виды — как в дальнем лесу
  rain(count) {
    const points = [];
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, TAU);
      const d = this.radius + this.rng.range(8, 26);
      const w = this.spawnAt(this.roll(FOREST_MAX), Math.cos(a) * d, this.rng.range(2.5, 4.5), Math.sin(a) * d);
      w.star = true;
      points.push(w);
    }
    this.emit({ type: "starfall", wild: points });
  }
  // рассыпать банку: светлячки разлетаются вокруг и снова дикие
  scatter(a) {
    if (!a.jar.length) return false;
    for (const rec of a.jar) {
      this.spawnAt(rec, a.x + this.rng.range(-6, 6), this.rng.range(2.5, 4), a.z + this.rng.range(-6, 6), a);
    }
    this.emit({ type: "scatter", who: a, n: a.jar.length });
    a.jar = [];
    return true;
  }

  catchWild(a, w) {
    if (a.frozen || !this.wild.includes(w)) return;
    if (a.jar.length >= a.jarMax) {
      this.toast("jarFull", null, "info", a);
      return;
    }
    this.removeWild(w);
    let rec = w.rec;
    // «Лунная вода»: обычный светлячок при ловле может оказаться с мутацией
    let lucky = false;
    if (a.isPlayer && rec.m === "none" && this.buffOn(a, "luck")) {
      const L = BUFFS.luck, c = this.rng.next() * 100;
      const m = c < L.rainbow ? "rainbow" : c < L.rainbow + L.golden ? "golden" : c < L.rainbow + L.golden + L.giant ? "giant" : null;
      if (m) {
        rec = { k: rec.k, m, s: rec.s };
        lucky = true;
      }
    }
    a.jar.push(rec);
    a.catchAnim = 0.4;
    this.emit({ type: "catch", who: a, rec, x: w.x, y: w.y, z: w.z });
    if (!a.isPlayer) return;
    this.stats.caught++;
    if (lucky) this.toast("luckHit", { rec }, rec.m);
    if (this.save.quest === 1) {
      this.save.quest = 2;
      this.emit({ type: "quest", step: 2 });
    }
    const isNew = addCaught(this.save, rec);
    if (isNew) {
      // новая запись в коллекции: награда тем больше, чем ценнее находка
      const bonus = INDEX_BONUS + fireflyCoins(rec) * 3;
      this.addCoins(bonus);
      this.stats.newEntries.push(rec);
      this.toast("newBook", { rec, n: bonus }, "good");
      this.emit({ type: "newBook", rec, n: bonus });
    } else if (isRare(rec)) this.toast("caughtRare", { rec }, rec.m !== "none" ? rec.m : rec.k);
    else if (rec.k !== "spark") this.toast("caught", { rec }, rec.k);
  }

  // светлячки отдают свет костру; игрок получает сияние
  feed(a, recs) {
    let light = 0, coins = 0;
    for (const rec of recs) {
      light += fireflyLight(rec);
      coins += fireflyCoins(rec);
    }
    this.addLight(light);
    this.emit({ type: "feed", who: a, recs, light });
    if (!a.isPlayer) return 0;
    if (this.buffOn(a, "double")) coins *= BUFFS.double.coins; // «Кристалл удачи»
    this.addCoins(coins);
    this.stats.fed += recs.length;
    return coins;
  }
  questDone() {
    if (this.save.quest !== 2) return;
    this.save.quest = 0;
    this.addCoins(QUEST_REWARD);
    this.toast("questDone", { n: QUEST_REWARD }, "good");
    this.emit({ type: "quest", step: 0 });
  }
  depositFire(a) {
    const list = a.jar;
    a.jar = [];
    const coins = this.feed(a, list);
    if (a.isPlayer) {
      this.toast("fed", { n: coins }, "good");
      this.questDone();
    }
  }
  depositGarden(a) {
    const list = a.jar;
    a.jar = [];
    this.questDone();
    const before = gardenRate(this.save);
    const released = gardenAdd(this.save, list);
    const gain = gardenRate(this.save) - before;
    this.emit({ type: "garden", recs: list, released });
    if (gain > 0.001) this.toast("gardenGain", { x: gain.toFixed(2) }, "good");
    if (released.length) {
      // лишние улетают к костру — не пропадают зря
      this.feed(a, released);
      this.toast("gardenFull", null, "info");
    }
  }

  // ---------- заморозка ----------
  freeze(a) {
    if (a.frozen) return;
    a.frozen = FREEZE_SECONDS;
    a.frozenTotal = FREEZE_SECONDS;
    a.hold = { kind: null, ref: null, t: 0 };
    if (a.jar.length) {
      this.scatter(a);
      this.toast("escaped", null, "warn", a);
    }
    this.emit({ type: "freeze", who: a });
    if (a.isPlayer) {
      this.stats.frozen++;
      this.toast("frozenBy", null, "warn");
    } else {
      this.stats.crewFrozen++;
      this.toast("crewFrozen", { who: a.id }, "warn");
    }
  }
  thaw(a, toCamp, helper = null) {
    if (!a.frozen) return;
    a.frozen = 0;
    a.thawing = 0;
    a.grace = Math.max(a.grace, 2);
    if (toCamp) {
      const ang = this.rng.range(0, TAU), r = this.rng.range(6, 9);
      a.x = Math.cos(ang) * r;
      a.z = Math.sin(ang) * r;
    }
    this.emit({ type: "thaw", who: a, by: helper, toCamp });
    if (helper && helper.isPlayer) {
      this.stats.rescues++;
      this.toast("crewThawed", { who: a.id }, "good");
    } else if (a.isPlayer && helper) this.toast("thawedBy", { helper: helper.id }, "good");
    else if (a.isPlayer && toCamp) this.toast("backToCamp", null, "info");
  }
  // награда за ролик: оттаять на месте, один раз за ночь
  selfThaw() {
    if (!this.player.frozen || this.selfThawUsed) return false;
    this.selfThawUsed = true;
    this.thaw(this.player, false, null);
    this.player.grace = 3;
    return true;
  }

  // ---------- кнопка действия: что можно сделать прямо сейчас ----------
  context(a) {
    if (a.frozen || this.over) return null;
    // разморозить друга — важнее всего
    let best = null, bd = THAW_REACH;
    for (const p of this.people) {
      if (p !== a && p.frozen) {
        const d = flatDist(a, p);
        if (d < bd) (best = p), (bd = d);
      }
    }
    if (best) return { kind: "thaw", ref: best, hold: THAW_HOLD };
    // поймать светлячка
    const reach = a.isPlayer ? CATCH_DISTANCE : 5.5;
    let fw = null, fd = reach;
    for (const w of this.wild) {
      const d = flatDist(a, w);
      if (d < fd) (fw = w), (fd = d);
    }
    if (fw) return a.jar.length >= a.jarMax ? { kind: "full", ref: fw, hold: 0 } : { kind: "catch", ref: fw, hold: a.isPlayer ? 0 : 0.35 };
    if (!a.isPlayer) return null;
    for (const p of PLACES) {
      if (Math.hypot(a.x - p.shrineX, a.z - p.shrineZ) < SHRINE_REACH) {
        const rest = this.shrineRest[p.id] || 0;
        return rest > 0 ? { kind: "rest", ref: p, hold: 0, left: rest } : { kind: "shrine", ref: p, hold: 0.5, cost: SHRINES[p.id].cost };
      }
    }
    if (campDist(a) < FOOD.reach) return a.snacks >= this.snackMax() ? { kind: "snackFull", hold: 0 } : { kind: "cook", hold: FOOD.cookSeconds };
    if (Math.hypot(a.x - GARDEN.x, a.z - GARDEN.z) < GARDEN.size + 1.5) return { kind: "garden", hold: 0 };
    return null;
  }
  snackMax() {
    return Math.max(FOOD.max, this.player.snacks);
  }
  // act — кнопка зажата, press — только что нажата
  doAction(a, act, press, dt) {
    const c = this.context(a);
    const h = a.hold;
    if (!c || !act) {
      h.kind = null;
      h.t = 0;
      return;
    }
    if (h.kind !== c.kind || h.ref !== c.ref) {
      h.kind = c.kind;
      h.ref = c.ref;
      h.t = 0;
      if (!press && c.hold === 0 && a.isPlayer && c.kind !== "catch") return; // мгновенное — только по нажатию
    }
    if (c.hold === 0) {
      if (c.kind === "catch") {
        // зажатая кнопка ловит подряд, раз в 0.2 с
        a.repeat -= dt;
        if (press || a.repeat <= 0) {
          a.repeat = 0.2;
          this.catchWild(a, c.ref);
        }
      } else if (press) {
        if (c.kind === "garden") this.emit({ type: "openGarden" });
        else if (c.kind === "full") this.toast("jarFull", null, "info", a);
        else if (c.kind === "rest") this.toast("shrineBusy", null, "info", a);
        else if (c.kind === "snackFull") this.toast("snackFull", null, "info", a);
      }
      return;
    }
    h.t += dt;
    if (h.t < c.hold) return;
    h.t = 0;
    h.kind = null;
    if (c.kind === "thaw") this.thaw(c.ref, false, a);
    else if (c.kind === "catch") this.catchWild(a, c.ref);
    else if (c.kind === "cook") this.cook(a);
    else if (c.kind === "shrine") this.buyShrine(a, c.ref);
  }
  cook(a) {
    if (a.snacks >= this.snackMax()) return this.toast("snackFull", null, "info", a);
    a.snacks++;
    this.toast("snackReady", null, "good", a);
    this.emit({ type: "cook", who: a });
  }
  buyShrine(a, place) {
    const def = SHRINES[place.id];
    if ((this.shrineRest[place.id] || 0) > 0) return this.toast("shrineBusy", null, "info", a);
    if (this.save.coins < def.cost) return this.toast("err_glow", null, "warn", a);
    this.save.coins -= def.cost;
    const buff = BUFFS[def.buff];
    if (buff.team) this.team[def.buff] = buff.seconds;
    else a.buffs[def.buff] = buff.seconds;
    this.shrineRest[place.id] = SHRINE_COOLDOWN;
    this.toast("shrineGot", { buff: def.buff, s: buff.seconds }, "good");
    this.emit({ type: "buff", id: def.buff, place: place.id });
  }

  // ---------- тени ----------
  roamPoint(i) {
    const a = this.rng.range(0, TAU), r = Math.sqrt(this.rng.next()) * SHADOW.roamRadius;
    return { x: PLACES[i].x + Math.cos(a) * r, z: PLACES[i].z + Math.sin(a) * r };
  }
  nextPlace(i) {
    const roll = this.rng.next();
    if (roll < 0.25) return i;
    const step = roll < 0.625 ? -1 : 1;
    return (i + step + PLACES.length) % PLACES.length;
  }
  nearestPlace(at) {
    let best = 0, bd = Infinity;
    PLACES.forEach((p, i) => {
      const d = flatDist(p, at);
      if (d < bd) (best = i), (bd = d);
    });
    return best;
  }
  farPlace(from) {
    const options = [];
    PLACES.forEach((p, i) => flatDist(p, from) > 70 && options.push(i));
    return options.length ? this.rng.pick(options) : this.rng.int(0, PLACES.length - 1);
  }
  pickShadowKind() {
    for (const id of ["brute", "imp"]) {
      const k = SHADOW_KINDS[id];
      if (this.night >= k.fromNight && this.rng.next() < k.share) {
        if (!this.announced[id]) {
          this.announced[id] = true;
          this.toast(id + "Coming", null, "warn");
        }
        return id;
      }
    }
    return "shadow";
  }
  spawnShadow(forced = null, at = null) {
    const kind = forced || this.pickShadowKind();
    const place = this.rng.int(0, PLACES.length - 1);
    const pos = at || this.roamPoint(place);
    const s = {
      id: ++this.shadowId, kind, x: pos.x, z: pos.z, place, goal: { ...pos }, restUntil: 0, target: null,
      seed: this.rng.next() * 10, lungeUntil: 0, lungeReady: 0, fx: -pos.x, fz: -pos.z, angry: false, born: this.time,
    };
    this.shadows.push(s);
    this.emit({ type: "shadowIn", s });
    return s;
  }
  setShadowCount(n) {
    if (this.peace) n = 0;
    while (this.shadows.length < n) this.spawnShadow();
    while (this.shadows.length > n) {
      const s = this.shadows.pop();
      this.emit({ type: "poof", x: s.x, z: s.z, y: 3, color: "#5a3caa", scale: 1, gone: s });
    }
  }
  clearShadows() {
    this.announced = {};
    this.setShadowCount(0);
    if (this.boss) {
      this.emit({ type: "poof", x: this.boss.x, z: this.boss.z, y: 7, color: "#5a3caa", scale: 3, gone: this.boss });
      this.boss = null;
      this.emit({ type: "boss", on: false });
    }
  }
  safeFrom(a) {
    return a.grace > 0 || (a.isPlayer && this.buffOn(a, "ward"));
  }
  stepShadow(s, dt) {
    const K = SHADOW_KINDS[s.kind];
    const now = this.time;
    let target = null;
    if (s.target) {
      const p = s.target;
      if (!p.frozen && this.inDark(p) && !this.safeFrom(p) && flatDist(p, s) < SHADOW.loseRange) target = p;
      else {
        // потеряла след: возвращается к ближайшему месту
        s.target = null;
        s.place = this.nearestPlace(s);
        s.goal = this.roamPoint(s.place);
        s.restUntil = 0;
      }
    }
    // новую цель замечает только вблизи; с каждой ночью и в тумане — чуть дальше
    if (!s.target) {
      let best = (SHADOW.aggroRange + SHADOW.aggroPerNight * this.night) * this.mods.aggroMult;
      for (const p of this.people) {
        if (p.frozen || !this.inDark(p) || this.safeFrom(p)) continue;
        const d = flatDist(p, s);
        if (d < best) (best = d), (s.target = p), (target = p);
      }
    }
    let gx, gz, speed;
    if (target) {
      gx = target.x;
      gz = target.z;
      speed = (SHADOW.speed + SHADOW.speedPerNight * this.night) * K.speed * this.mods.shadowSpeed;
    } else {
      if (Math.hypot(s.goal.x - s.x, s.goal.z - s.z) < 1) {
        if (s.restUntil === 0) s.restUntil = now + this.rng.range(SHADOW.restMin, SHADOW.restMax);
        else if (now >= s.restUntil) {
          s.restUntil = 0;
          s.place = this.nextPlace(s.place);
          s.goal = this.roamPoint(s.place);
        }
      }
      gx = s.goal.x;
      gz = s.goal.z;
      speed = SHADOW.roamSpeed;
    }
    const dx = gx - s.x, dz = gz - s.z;
    const dist = Math.hypot(dx, dz);
    if (target && dist < SHADOW.lungeRange && now >= s.lungeReady) {
      s.lungeUntil = now + SHADOW.lungeTime;
      s.lungeReady = now + SHADOW.lungeCooldown;
    }
    const lunging = !!target && now < s.lungeUntil;
    if (lunging) speed = (SHADOW.lungeSpeed + SHADOW.lungePerNight * this.night) * K.speed * this.mods.shadowSpeed;
    if (dist > 0.05) {
      const k = Math.min(dist, speed * dt) / dist;
      s.x += dx * k;
      s.z += dz * k;
      s.fx = dx / dist;
      s.fz = dz / dist;
    }
    s.moving = dist > 0.05 && (target || s.restUntil === 0) ? speed : 0;
    // свет выталкивает тень наружу
    const fc = campDist(s), minR = this.radius + 1.5;
    if (fc < minR) {
      const ux = fc > 0.01 ? s.x / fc : 1, uz = fc > 0.01 ? s.z / fc : 0;
      s.x = CAMP.x + ux * minR;
      s.z = CAMP.z + uz * minR;
    }
    s.angry = !!target && (lunging || flatDist(target, s) < SHADOW.lungeRange * 1.5);
    s.target = target;
    if (target && flatDist(target, s) < SHADOW.catchDistance * K.reach) {
      const v = target;
      if (s.kind === "imp") {
        // проказник не морозит: рассыпает светлячков из банки и удирает
        const stole = this.scatter(v);
        if (v.isPlayer) this.toast(stole ? "impStole" : "impBoo", null, stole ? "warn" : "info");
        this.emit({ type: "poof", x: s.x, z: s.z, y: 2, color: "#78ffa0", scale: 0.7 });
      } else if (v.snacks > 0) {
        // съела зефир и довольная убежала: розовые искры вместо мрачного облачка
        v.snacks--;
        v.grace = SHADOW.graceSeconds;
        this.stats.eaten++;
        this.toast("snackEaten", null, "good", v);
        this.emit({ type: "eaten", who: v, x: s.x, z: s.z });
        this.emit({ type: "poof", x: s.x, z: s.z, y: 3, color: "#ffaad2", scale: 1 });
      } else {
        this.freeze(v);
        this.emit({ type: "poof", x: s.x, z: s.z, y: 3, color: "#5a3caa", scale: 1 });
      }
      // после поимки тень рассыпается и появляется у дальнего места
      s.place = this.farPlace(s);
      const p = this.roamPoint(s.place);
      s.x = p.x;
      s.z = p.z;
      s.goal = { ...p };
      s.restUntil = 0;
      s.target = null;
      s.lungeUntil = 0;
      s.angry = false;
      this.emit({ type: "shadowIn", s });
    }
  }

  spawnBoss() {
    if (this.boss) return;
    const a = this.rng.range(0, TAU);
    const d = Math.max(this.radius + 30, BOSS.spawn);
    this.boss = { x: Math.cos(a) * d, z: Math.sin(a) * d, hp: BOSS.hp, helpers: new Set(), near: 0, born: this.time };
    this.bossSpawned = true;
    this.toast("bossComing", null, "warn");
    this.emit({ type: "boss", on: true });
  }
  stepBoss(b, dt) {
    const d = campDist(b);
    if (d > 7) {
      const k = Math.min(d - 7, BOSS.speed * dt) / d;
      b.x -= b.x * k;
      b.z -= b.z * k;
    }
    // внутри круга света Большая тень пьёт свет
    if (campDist(b) < this.radius) this.addLight(-BOSS.drain * dt);
    // фонари рядом жгут её; чем больше фонарей, тем быстрее
    let near = 0;
    for (const p of this.people) {
      if (!p.frozen && flatDist(p, b) <= BOSS.reach) {
        near++;
        b.helpers.add(p);
      }
    }
    b.near = near;
    if (near > 0) b.hp -= BOSS.dps[Math.min(near, BOSS.dps.length) - 1] * dt;
    if (b.hp <= 0) {
      this.stats.bossBeaten = true;
      this.emit({ type: "poof", x: b.x, z: b.z, y: 7, color: "#ffd890", scale: 3, gone: b, win: true });
      this.boss = null;
      this.emit({ type: "boss", on: false, beaten: true });
      if (b.helpers.has(this.player)) {
        this.addCoins(BOSS.reward);
        this.stats.bossHit = true;
      }
      this.toast("bossGone", { n: b.helpers.has(this.player) ? BOSS.reward : 0 }, "good");
    }
  }

  // ---------- события ночи ----------
  planEvents(n) {
    this.eventQueue = [];
    this.lastEvent = "";
    if (n < EVENTS.fromNight) return;
    // в ночи с двумя событиями первое начинается пораньше, чтобы второе успело пройти до утра
    const two = n >= EVENTS.twoFromNight;
    const first = this.rng.range(EVENTS.from, two ? 0.3 : EVENTS.to) * NIGHT_SECONDS;
    this.eventQueue.push(first);
    if (two) {
      // второе начинается, когда первое уже кончилось, и успевает пройти до конца ночи
      const second = first + this.rng.range(38, 46);
      if (second < NIGHT_SECONDS - 22) this.eventQueue.push(second);
    }
  }
  pickEvent() {
    const kinds = Object.entries(EVENTS.kinds).filter(([id]) => id !== this.lastEvent);
    let total = 0;
    for (const [, d] of kinds) total += d.weight;
    let roll = this.rng.next() * total;
    for (const [id, d] of kinds) {
      roll -= d.weight;
      if (roll <= 0) return id;
    }
    return kinds[0][0];
  }
  beginEvent(id) {
    const def = EVENTS.kinds[id];
    if (!def) return;
    this.finishEvent(false);
    this.lastEvent = id;
    this.event = { id, left: def.seconds, total: def.seconds };
    this.toast("eventStart_" + id, null, id === "starfall" ? "good" : "warn");
    this.emit({ type: "event", id, on: true });
    if (id === "wind") this.mods.decayEvent = def.decay;
    else if (id === "hungry") {
      this.mods.extraShadows = def.extra;
      this.mods.shadowSpeed = def.speed;
    } else if (id === "fog") this.mods.aggroMult = def.aggro;
    else if (id === "starfall") this.rain(def.count);
  }
  finishEvent(announce) {
    if (!this.event) return;
    const id = this.event.id;
    this.event = null;
    this.mods = { decayEvent: 1, extraShadows: 0, shadowSpeed: 1, aggroMult: 1 };
    this.emit({ type: "event", id, on: false });
    if (announce && id !== "starfall") this.toast("eventEnd", null, "good");
  }

  // ---------- фазы ----------
  startNight(n) {
    this.phase = "night";
    this.night = n;
    this.t = 0;
    this.selfThawUsed = false;
    this.planEvents(n);
    if (n === NIGHTS) this.toast("lastNight", null, "warn");
    else this.toast("nightStart", { n }, "warn");
    this.emit({ type: "night", n });
  }
  endNight() {
    const n = this.night;
    this.stats.nights = n;
    this.stats.nightEnd.push(Math.round(this.light));
    this.finishEvent(false);
    this.eventQueue = [];
    this.clearShadows();
    if (n < NIGHTS) {
      this.phase = "break";
      this.t = 0;
      this.toast("nightSurvived", { n }, "good");
      this.emit({ type: "survived", n });
    } else this.finish(true);
  }
  finish(won) {
    this.over = true;
    this.won = won;
    this.phase = won ? "dawn" : "lost";
    this.t = 0;
    this.finishEvent(false);
    this.clearShadows();
    for (const p of this.people) if (p.frozen) this.thaw(p, false, null);
    const nights = this.stats.nights;
    const coins = nights * REWARD_PER_NIGHT + (won ? REWARD_DAWN : 0);
    if (coins > 0) this.addCoins(coins);
    this.stats.runReward = coins;
    this.stats.record = finishRun(this.save, nights, won);
    if (won) this.toast("dawn", null, "good");
    else this.toast("lost", { n: nights, total: NIGHTS }, "warn");
    this.emit({ type: won ? "dawn" : "lost" });
  }

  // ---------- шаг ----------
  // input: { mx, mz } — куда бежать (в мире, длина до 1), act — кнопка зажата, press — нажата сейчас
  step(dt, input = {}) {
    this.time += dt;
    // в меню: светлячки кружат, все сидят у костра, время забега не идёт
    if (this.showcase) {
      for (const w of this.wild) this.placeWild(w);
      for (const p of this.people) p.vx = p.vz = 0;
      return;
    }
    this.t += dt;
    if (this.over) {
      this.endT += dt;
      for (const w of this.wild) this.placeWild(w);
      this.movePeople(dt, { mx: 0, mz: 0 }, true);
      return;
    }
    if (this.phase === "dusk0" && this.t >= DUSK_SECONDS) this.startNight(1);
    else if (this.phase === "break" && this.t >= BREAK_SECONDS) this.startNight(this.night + 1);
    else if (this.phase === "night") {
      // события
      if (this.event) {
        this.event.left -= dt;
        if (this.event.left <= 0) this.finishEvent(true);
      }
      if (!this.event && this.eventQueue.length && this.t >= this.eventQueue[0]) {
        this.eventQueue.shift();
        this.beginEvent(this.pickEvent());
      }
      this.setShadowCount(shadowCount(this.night, this.crewN) + this.mods.extraShadows);
      // ветер торопит костёр, дубовые дрова его берегут
      const wood = this.team.wood > 0 ? BUFFS.wood.decay : 1;
      this.addLight(-decay(this.night, this.crewN) * this.mods.decayEvent * wood * dt);
      if (this.night === NIGHTS && !this.bossSpawned && this.t > NIGHT_SECONDS * BOSS.at) this.spawnBoss();
      if (this.light < 22 && this.time - this.lowLightAt > 14) {
        this.lowLightAt = this.time;
        this.toast("lowLight", null, "warn");
      }
      if (this.light <= 0) {
        this.finish(false);
        return;
      }
      if (this.t >= NIGHT_SECONDS) {
        this.endNight();
        if (this.over) return;
      }
    }

    // светлячки кружат вокруг своего места, лес пополняется (до 2 в секунду)
    for (const w of this.wild) this.placeWild(w);
    this.spawnClock += dt;
    if (this.spawnClock >= 1) {
      this.spawnClock -= 1;
      const need = this.wanted() - this.wild.length;
      for (let i = 0; i < Math.min(2, need); i++) this.spawnRandom();
    }

    this.movePeople(dt, input, false);

    // таймеры
    for (const p of this.people) {
      if (p.grace > 0) p.grace -= dt;
      if (p.catchAnim > 0) p.catchAnim -= dt;
      for (const id in p.buffs) if (p.buffs[id] > 0) p.buffs[id] = Math.max(0, p.buffs[id] - dt);
      if (p.frozen) {
        p.frozen -= dt;
        if (p.frozen <= 0) {
          p.frozen = 0.0001;
          this.thaw(p, true, null);
          if (!p.isPlayer) this.toast("crewHome", { who: p.id }, "info");
        }
      }
    }
    if (this.team.wood > 0) this.team.wood = Math.max(0, this.team.wood - dt);
    for (const id in this.shrineRest) if (this.shrineRest[id] > 0) this.shrineRest[id] = Math.max(0, this.shrineRest[id] - dt);

    // банка сама пустеет: у костра — в костёр, на своём участке — в сад
    for (const p of this.people) {
      if (!p.jar.length || p.frozen) continue;
      if (campDist(p) <= DEPOSIT_RADIUS) this.depositFire(p);
      else if (p.isPlayer && Math.hypot(p.x - GARDEN.x, p.z - GARDEN.z) <= GARDEN.enterRadius) {
        if (slots(this.save) > 0) this.depositGarden(p);
        else if (this.time - this.needHouseAt > 5) {
          // мест ещё нет: светлячков не забираем, подсказываем построить домик
          this.needHouseAt = this.time;
          this.toast("needHouse", null, "info");
        }
      }
    }

    if (this.phase === "night") {
      for (const s of this.shadows) this.stepShadow(s, dt);
      if (this.boss) this.stepBoss(this.boss, dt);
    }
  }

  movePeople(dt, input, idle) {
    for (const p of this.people) {
      let mx = 0, mz = 0, act = false, press = false;
      if (p.isPlayer) {
        mx = input.mx || 0;
        mz = input.mz || 0;
        act = !!input.act;
        press = !!input.press;
      } else if (!idle) {
        const o = crewThink(this, p, dt);
        mx = o.mx;
        mz = o.mz;
        act = o.act;
        press = o.press;
      }
      if (p.frozen || idle) mx = mz = 0;
      const len = Math.hypot(mx, mz);
      if (len > 1) (mx /= len), (mz /= len);
      const sp = this.speedOf(p);
      const ox = p.x, oz = p.z;
      p.x += mx * sp * dt;
      p.z += mz * sp * dt;
      collide(this.layout, p, 1.0);
      p.vx = dt > 0 ? (p.x - ox) / dt : 0;
      p.vz = dt > 0 ? (p.z - oz) / dt : 0;
      if (len > 0.08) p.dir = Math.atan2(mx, mz);
      if (!idle) this.doAction(p, act, press, dt);
    }
  }

  // ---------- для отладки и проверок ----------
  debugFreeze(who) {
    const a = who === "player" ? this.player : this.crew.find((c) => c.id === who) || this.crew[0];
    if (a) this.freeze(a);
    return a;
  }
}

export { flatDist, campDist };
