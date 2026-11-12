// Правила «Виража» без графики: физика машин, соперники, круги, места, кубок.
// Заезд можно гонять в Node в сотни раз быстрее настоящего (tests/sim.mjs).
// Углы: yaw — куда смотрит нос, va — куда на самом деле летит машина (в заносе они расходятся).
// Руль: +1 — вправо. Поперёк трассы: d > 0 — левее оси.
import { clamp, damp, wrapAngle } from "./kit.js?v=b8d55922";
import { rampHeight, trackPoint } from "./tracks.js?v=b8d55922";

export const LAPS = 3;
export const POINTS = [10, 7, 5, 3, 2, 1];
export const NITRO_MAX = 3;

// Шесть машин. Игрок берёт одну, остальные пять — соперники.
export const LIVERIES = [
  { id: "red", name: "Искра", color: "#ff4733" },
  { id: "yellow", name: "Лимон", color: "#ffc51b" },
  { id: "green", name: "Мята", color: "#27c986" },
  { id: "blue", name: "Гром", color: "#2a86ff" },
  { id: "pink", name: "Пончик", color: "#ff74bd" },
  { id: "violet", name: "Клякса", color: "#8d5cf6" },
];
// Кто из соперников сильнее: первый в списке — лидер пелотона
const PECKING = [3, 0, 5, 2, 1, 4];

// top — доля предельной скорости, corner — смелость в поворотах, spread — разброс внутри пелотона,
// slot — место игрока на старте (с нуля), slow/fast — «резинка»: насколько соперник сбавляет впереди и прибавляет позади,
// assist — помощь рулю игрока: машина сама подруливает вдоль дороги (на «Новичке» малыш доедет, даже не трогая экран)
// ease — помощь тормозу: машина сама притормаживает, если едет быстрее безопасной скорости поворота × ease (0 — нет помощи)
export const DIFFS = [
  { id: "easy", name: "Новичок", top: 0.86, corner: 0.86, spread: 0.055, slot: 3, slow: 0.1, fast: 0.02, nitro: 0.12, assist: 0.45, ease: 1.08 },
  { id: "mid", name: "Гонщик", top: 0.93, corner: 1.0, spread: 0.05, slot: 5, slow: 0.05, fast: 0.035, nitro: 0.5, assist: 0 },
  { id: "hard", name: "Чемпион", top: 0.995, corner: 1.18, spread: 0.04, slot: 5, slow: 0.02, fast: 0.045, nitro: 0.9, assist: 0 },
];

export const PHYS = {
  vmax: 40, // предельная скорость без ускорений (на приборе ×4.5 км/ч)
  accel: 17,
  brake: 34,
  crawl: 6, // с зажатым тормозом машина всё равно ползёт — застрять нельзя
  turn: 1.55, // рад/с при полном руле
  steerIn: 5.5,
  steerBack: 9,
  grip: 9,
  driftGrip: 3.3,
  offGrip: 5,
  driftTurn: 1.4,
  slipDrag: 0.4,
  driftNitro: 0.3, // зарядов нитро за секунду заноса
  nitroTime: 1.7,
  nitroTop: 1.3,
  padTime: 1.25,
  padTop: 1.22,
  offTop: 0.62,
  gravity: 24,
  radius: 1.3, // машина — два круга такого радиуса на расстоянии axle от центра
  axle: 1.15,
};

// Куда рулить, чтобы приехать в точку трассы впереди со сдвигом offset от оси
export function steerTo(track, car, offset, look) {
  const j = (car.i + Math.max(2, Math.round(look / track.ds))) % track.n;
  const gx = track.px[j] + track.nx[j] * offset;
  const gz = track.pz[j] + track.nz[j] * offset;
  return clamp(-wrapAngle(Math.atan2(gx - car.x, gz - car.z) - car.yaw) * 2.6, -1, 1);
}

class Car {
  constructor(index, livery, player) {
    this.index = index;
    this.livery = livery;
    this.player = player;
    this.name = player ? "Ты" : LIVERIES[livery].name;
    this.x = this.y = this.z = 0;
    this.yaw = this.va = 0;
    this.v = 0;
    this.steer = 0;
    this.drift = false;
    this.driftT = 0;
    this.slip = 0;
    this.nitro = 1;
    this.nitroT = 0;
    this.boostT = 0;
    this.i = 0; // ближайший отсчёт трассы
    this.s = 0; // путь от стартовой линии в пределах круга
    this.total = 0; // весь путь с учётом кругов (на решётке — отрицательный)
    this.d = 0;
    this.lap = 0; // сколько кругов завершено
    this.lapStart = 0;
    this.lastLap = 0;
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = 0;
    this.place = index + 1;
    this.air = 0; // высота над дорогой
    this.ground = 0; // высота трамплина под машиной
    this.vy = 0;
    this.pitch = 0;
    this.offroad = false;
    this.braking = false;
    this.wallT = 9; // секунд с последнего касания борта
    this.bumpT = 9;
    this.wrongT = 0;
    this.stuckT = 0;
    this.ghostT = 0; // после возврата на трассу машина ненадолго «прозрачная»
    this.wrong = false;
    this.resets = 0;
    this.wallHits = 0;
    this.ai = null;
  }

  put(track, s, d) {
    const p = trackPoint(track, s, d);
    this.x = p.x;
    this.z = p.z;
    this.y = p.y;
    this.yaw = this.va = p.yaw;
    this.i = p.i;
    this.s = ((s % track.length) + track.length) % track.length;
    this.total = s;
    this.d = d;
  }

  // Положение относительно трассы: ищем ближайший отсчёт рядом с прошлым
  project(tr) {
    const { n, px, pz } = tr;
    let best = Infinity, bi = this.i;
    for (let k = -5; k <= 7; k++) {
      const j = (this.i + k + n) % n;
      const q = (this.x - px[j]) ** 2 + (this.z - pz[j]) ** 2;
      if (q < best) { best = q; bi = j; }
    }
    const dx = this.x - px[bi], dz = this.z - pz[bi];
    const along = dx * tr.tx[bi] + dz * tr.tz[bi];
    let s = bi * tr.ds + along;
    if (s < 0) s += tr.length;
    else if (s >= tr.length) s -= tr.length;
    let step = s - this.s;
    if (step > tr.length / 2) step -= tr.length;
    else if (step < -tr.length / 2) step += tr.length;
    this.total += step;
    this.s = s;
    this.i = bi;
    this.d = dx * tr.nx[bi] + dz * tr.nz[bi];
    const j = along >= 0 ? (bi + 1) % n : (bi + n - 1) % n;
    const f = clamp(Math.abs(along) / tr.ds, 0, 1);
    this.roadY = tr.py[bi] + (tr.py[j] - tr.py[bi]) * f;
  }

  update(dt, inp, race, moving) {
    const P = PHYS, tr = race.track;
    const want = clamp(inp.steer || 0, -1, 1);
    const back = Math.abs(want) < Math.abs(this.steer) || want * this.steer < 0;
    const rate = (back ? P.steerBack : P.steerIn) * dt;
    this.steer += clamp(want - this.steer, -rate, rate);
    this.braking = !!inp.brake && moving;
    if (!moving) return;
    this.ghostT = Math.max(0, this.ghostT - dt);
    this.wallT += dt;
    this.bumpT += dt;
    const air = this.air > this.ground + 0.05;
    const off = !air && Math.abs(this.d) > tr.half + 0.3;
    this.offroad = off;

    if (inp.nitro && this.nitroT <= 0 && this.nitro >= 1) {
      this.nitro -= 1;
      this.nitroT = P.nitroTime;
      race.emit("nitro", this);
    }
    this.nitroT = Math.max(0, this.nitroT - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    const push = this.nitroT > 0 ? P.nitroTop : this.boostT > 0 ? P.padTop : 1;
    let top = P.vmax * push * (off ? P.offTop : 1);
    top *= 1 - clamp(tr.slope[this.i], -0.1, 0.1) * 0.5 * Math.cos(this.va - tr.yaw[this.i]);

    let v = this.v;
    const gas = inp.gas ?? 1;
    if (inp.brake) v = Math.max(Math.min(v, P.crawl), v - P.brake * dt);
    else if (v < top) v = Math.min(top, v + P.accel * gas * clamp(1.25 - v / top, 0.15, 1) * (push > 1 ? 2.1 : 1) * dt);
    if (gas < 1 && !inp.brake) v = Math.max(0, v - (1 - gas) * 7 * dt);
    if (v > top) v = Math.max(top, v - (off ? 28 : 9) * dt);

    // руль и занос
    const speedK = clamp(v / 10, 0, 1) * (1 - 0.28 * clamp(v / P.vmax, 0, 1.3));
    let yawRate = -this.steer * P.turn * speedK;
    const hard = Math.abs(this.steer) > 0.72 && v > P.vmax * 0.58 && !off && !air;
    if (hard) this.driftT += dt;
    else if (Math.abs(this.steer) < 0.4 || v < P.vmax * 0.45 || off) this.driftT = 0;
    this.drift = this.driftT > 0.16;
    let grip = off ? P.offGrip : P.grip;
    if (this.drift) {
      yawRate *= P.driftTurn;
      grip = P.driftGrip;
      this.nitro = Math.min(NITRO_MAX, this.nitro + P.driftNitro * dt);
    }
    if (air) {
      yawRate *= 0.25;
      grip = 0;
    }
    this.yaw = wrapAngle(this.yaw + yawRate * dt);
    this.va = wrapAngle(this.va + wrapAngle(this.yaw - this.va) * damp(grip, dt));
    this.slip = wrapAngle(this.yaw - this.va);
    v -= v * Math.min(1, Math.abs(Math.sin(this.slip))) * P.slipDrag * dt;

    this.x += Math.sin(this.va) * v * dt;
    this.z += Math.cos(this.va) * v * dt;
    this.v = v;
    this.project(tr);

    // мягкий борт: дальше не пускает и разворачивает вдоль трассы
    const lim = tr.wall - 1.15;
    if (Math.abs(this.d) > lim) {
      const side = Math.sign(this.d), i = this.i, over = Math.abs(this.d) - lim;
      this.x -= tr.nx[i] * over * side;
      this.z -= tr.nz[i] * over * side;
      this.d = lim * side;
      const rel = wrapAngle(this.va - tr.yaw[i]);
      const along = tr.yaw[i] + (Math.cos(rel) >= 0 ? 0 : Math.PI);
      const into = Math.sin(rel) * side; // > 0 — едем в борт
      if (into > 0) {
        const hit = this.v * into;
        this.va = wrapAngle(along);
        this.v = Math.max(this.v * Math.max(0.6, Math.abs(Math.cos(rel))) - hit * 0.12, Math.min(this.v, 8));
        if (hit > 5 && this.wallT > 0.3) {
          race.emit("wall", this, hit);
          this.wallHits++;
        }
      }
      this.yaw = wrapAngle(this.yaw - wrapAngle(this.yaw - along) * damp(7, dt));
      this.v = Math.max(Math.min(this.v, 8), this.v - 4 * dt);
      this.wallT = 0;
    }

    // трамплин и полёт
    const ground = rampHeight(tr, this.s);
    if (this.air <= ground + 1e-3) {
      // на поверхности: на трамплине машину поднимает вместе с ним
      this.vy = (ground - this.air) / dt;
      this.air = ground;
    } else {
      this.vy -= P.gravity * dt;
      this.air += this.vy * dt;
      if (this.air <= ground) {
        if (this.vy < -4) race.emit("land", this, -this.vy);
        this.air = ground;
        this.vy = 0;
      }
    }
    if (this.ground > 0.5 && ground === 0 && this.vy > 2) race.emit("jump", this);
    this.ground = ground;
    this.y = this.roadY + this.air;
    this.pitch = Math.atan(tr.slope[this.i] * Math.cos(this.yaw - tr.yaw[this.i])) + (this.air > ground + 0.05 ? clamp(this.vy * 0.03, -0.3, 0.3) : ground > 0 ? 0.17 : 0);

    // круги
    const done = Math.floor(this.total / tr.length);
    if (done > this.lap && !this.finished) {
      this.lap = done;
      this.lastLap = race.time - this.lapStart;
      this.lapStart = race.time;
      const record = this.lastLap < this.bestLap;
      if (record) this.bestLap = this.lastLap;
      if (this.lap >= race.laps) {
        this.finished = true;
        this.finishTime = race.time;
        race.finish(this);
      } else race.emit("lap", this, this.lap + 1);
    }

    // едет не туда или встал — подсказка, потом возврат на трассу
    const fwd = Math.cos(this.va - tr.yaw[this.i]);
    if (fwd < -0.25 && this.v > 3) this.wrongT += dt;
    else this.wrongT = Math.max(0, this.wrongT - dt * 3);
    this.wrong = this.wrongT > 0.7;
    if (this.v < 2.5 && !inp.brake) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.wrongT > 2.6 || this.stuckT > 2.5) race.reset(this);
  }
}

export class Race {
  // opts: difficulty (id), livery (номер машины игрока), random, laps, attract (все машины едут сами, финиша нет)
  constructor(track, opts = {}) {
    this.track = track;
    this.random = opts.random || Math.random;
    this.diff = DIFFS.find((d) => d.id === opts.difficulty) || DIFFS[1];
    this.attract = !!opts.attract;
    this.laps = this.attract ? 1e9 : (opts.laps ?? LAPS);
    this.events = [];
    this.time = 0;
    this.phase = this.attract ? "race" : "grid"; // grid → countdown → race → done (игрок финишировал)
    this.countT = 0;
    this.countN = 0;
    this.cans = track.cans.map((c) => ({ ...c, wait: 0 }));
    this.finishers = 0;

    const mine = this.attract ? -1 : clamp(opts.livery ?? 0, 0, LIVERIES.length - 1);
    const rivals = PECKING.filter((l) => l !== mine).slice(0, this.attract ? 6 : 5);
    const slots = [0, 1, 2, 3, 4, 5];
    const mySlot = this.attract ? -1 : this.diff.slot;
    this.cars = [];
    this.player = null;
    if (!this.attract) {
      this.player = new Car(0, mine, true);
      this.player.ai = { top: 0.8, corner: 0.8, line: 0.6, lane: 0, offset: 0, nitroWait: 99 };
      this.cars.push(this.player);
    }
    const free = slots.filter((s) => s !== mySlot);
    rivals.forEach((livery, rank) => {
      const car = new Car(this.cars.length, livery, false);
      const jitter = (this.random() - 0.5) * 0.016;
      const weak = (rank / 4) * this.diff.spread - jitter;
      const pace = this.diff.id === "easy" ? (track.def?.novice ?? 1) : 1;
      car.ai = {
        // на «Новичке» трасса может придержать соперников (novice в описании трассы): в «Ночном городе» углы круче
        top: (this.diff.top - weak) * pace,
        corner: (this.diff.corner - weak * 1.2) * pace,
        line: 0.75 + this.random() * 0.25,
        lane: (this.random() * 2 - 1) * 1.5,
        offset: 0,
        nitroWait: 3 + this.random() * 6,
      };
      car.slot = free[rank];
      this.cars.push(car);
    });
    if (this.player) this.player.slot = mySlot;
    for (const car of this.cars) {
      const d = car.slot % 2 ? -3.4 : 3.4;
      car.put(track, -(9 + car.slot * 7.5), d);
      car.ai.offset = d;
      if (this.attract) car.v = 30;
    }
    this.rank();
  }

  emit(type, car, value) {
    this.events.push({ type, car: car ? car.index : -1, value });
  }

  startCountdown() {
    if (this.phase === "grid") this.phase = "countdown";
  }

  finish(car) {
    this.finishers++;
    this.rank();
    this.emit("finish", car, car.place);
    if (car.player) this.phase = "done";
  }

  reset(car) {
    const tr = this.track;
    car.put(tr, car.total, clamp(car.d, -tr.half * 0.5, tr.half * 0.5));
    car.v = 14;
    car.steer = 0;
    car.wrongT = car.stuckT = 0;
    car.wrong = false;
    car.air = car.vy = 0;
    car.driftT = 0;
    car.ghostT = 1.8;
    car.resets++;
    this.emit("reset", car);
  }

  step(dt, input) {
    if (this.phase === "countdown") {
      this.countT += dt;
      const marks = [0.6, 1.5, 2.4, 3.3];
      while (this.countN < 4 && this.countT >= marks[this.countN]) {
        this.emit("count", null, 3 - this.countN);
        this.countN++;
      }
      if (this.countN === 4) this.phase = "race";
    }
    const moving = this.phase === "race" || this.phase === "done";
    if (moving) this.time += dt;
    for (const car of this.cars) {
      let inp = car.player && !car.finished ? input : this.drive(car, dt);
      if (inp === input && this.diff.assist && moving) {
        // помощь рулю: тянет вдоль дороги, но палец всегда сильнее
        const tr = this.track, keep = clamp(car.d, -(tr.half - 3), tr.half - 3);
        const help = steerTo(tr, car, keep, 10 + car.v * 0.4) * this.diff.assist;
        inp = { ...input, steer: clamp((input.steer || 0) + help, -1, 1) };
        // и сама притормаживает перед крутым поворотом, если игрок летит в него слишком быстро
        if (this.diff.ease) {
          const k = (car.i + Math.round((car.v * 0.1) / tr.ds)) % tr.n;
          if (car.v > tr.vp[k] * this.diff.ease) inp.brake = true;
        }
      }
      car.update(dt, inp, this, moving);
    }
    if (!moving) return;
    this.collide();
    this.pickups(dt);
    this.rank();
  }

  // Соперник: держит линию, тормозит перед поворотом, объезжает тех, кто впереди
  drive(car, dt) {
    const tr = this.track, ai = car.ai, P = PHYS, n = tr.n;
    let band = 1;
    const pl = this.player;
    if (pl && car !== pl) {
      const gap = clamp((pl.total - car.total) / 240, -1, 1); // > 0 — соперник позади игрока
      band = 1 + (gap > 0 ? gap * this.diff.fast : gap * this.diff.slow);
    }
    if (car.finished) band = 0.78;
    const look = 8 + car.v * 0.45;
    const j = (car.i + Math.round(look / tr.ds)) % n;
    const lim = tr.half - 1.6;
    let want = tr.ideal[j] * ai.line + ai.lane;
    let lift = false;
    for (const o of this.cars) {
      if (o === car || o.ghostT > 0) continue;
      let gap = o.s - car.s;
      if (gap > tr.length / 2) gap -= tr.length;
      else if (gap < -tr.length / 2) gap += tr.length;
      if (gap < -1 || gap > 12 + car.v * 0.35) continue;
      if (Math.abs(o.d - want) < 3.3 && o.v < car.v + 3) {
        const side = want >= o.d ? 1 : -1;
        let pass = o.d + side * 3.6;
        if (Math.abs(pass) > lim) pass = o.d - side * 3.6;
        want = pass;
      }
      if (gap < 6.5 && Math.abs(o.d - car.d) < 2.3 && o.v < car.v) lift = true;
    }
    want = clamp(want, -lim, lim);
    ai.offset += (want - ai.offset) * damp(2.2, dt);
    const steer = steerTo(tr, car, ai.offset, look);
    const k = (car.i + Math.round((car.v * 0.1) / tr.ds)) % n;
    const push = car.nitroT > 0 ? P.nitroTop : car.boostT > 0 ? P.padTop : 1;
    let vt = Math.min(tr.vp[k] * ai.corner, P.vmax * ai.top * push) * band;
    if (lift) vt = Math.min(vt, car.v - 1);
    let nitro = false;
    ai.nitroWait -= dt;
    if (car.nitro >= 1 && ai.nitroWait <= 0 && !car.finished && Math.abs(steer) < 0.3 && tr.vp[car.i] > 55 && tr.vp[(car.i + 45) % n] > 55) {
      nitro = this.random() < this.diff.nitro;
      ai.nitroWait = 2.5 + this.random() * 5;
    }
    return { steer, gas: car.v < vt ? 1 : 0, brake: car.v > vt + 3, nitro };
  }

  // Мягкие столкновения: машины расталкивает, скорость вдоль удара делится пополам
  collide() {
    const R = PHYS.radius, A = PHYS.axle, cars = this.cars;
    const reach = (2 * A + 2 * R) ** 2;
    for (let p = 0; p < cars.length; p++)
      for (let q = p + 1; q < cars.length; q++) {
        const a = cars[p], b = cars[q];
        if (a.ghostT > 0 || b.ghostT > 0) continue;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > reach || Math.abs(a.y - b.y) > 1.5) continue;
        for (let u = -1; u <= 1; u += 2)
          for (let w = -1; w <= 1; w += 2) {
            const ax = a.x + Math.sin(a.yaw) * A * u, az = a.z + Math.cos(a.yaw) * A * u;
            const bx = b.x + Math.sin(b.yaw) * A * w, bz = b.z + Math.cos(b.yaw) * A * w;
            const dx = bx - ax, dz = bz - az;
            const dist = Math.hypot(dx, dz);
            if (dist >= 2 * R || dist < 1e-4) continue;
            const nx = dx / dist, nz = dz / dist, half = (2 * R - dist) / 2;
            a.x -= nx * half; a.z -= nz * half;
            b.x += nx * half; b.z += nz * half;
            let avx = Math.sin(a.va) * a.v, avz = Math.cos(a.va) * a.v;
            let bvx = Math.sin(b.va) * b.v, bvz = Math.cos(b.va) * b.v;
            const rel = (bvx - avx) * nx + (bvz - avz) * nz;
            if (rel >= 0) continue;
            const jolt = -rel * 0.55;
            avx -= nx * jolt; avz -= nz * jolt;
            bvx += nx * jolt; bvz += nz * jolt;
            a.v = Math.hypot(avx, avz); b.v = Math.hypot(bvx, bvz);
            if (a.v > 1) a.va = Math.atan2(avx, avz);
            if (b.v > 1) b.va = Math.atan2(bvx, bvz);
            if (-rel > 2.5 && a.bumpT > 0.35 && b.bumpT > 0.35) {
              this.emit("bump", a, -rel);
              this.emit("bump", b, -rel);
              a.bumpT = b.bumpT = 0;
            }
          }
      }
  }

  pickups(dt) {
    const P = PHYS, tr = this.track;
    this.cans.forEach((can, index) => {
      if (can.wait > 0) {
        can.wait -= dt;
        return;
      }
      for (const car of this.cars) {
        if (car.nitro >= NITRO_MAX || car.air > 1.5 || (car.x - can.x) ** 2 + (car.z - can.z) ** 2 > 7.8) continue;
        car.nitro = Math.min(NITRO_MAX, car.nitro + 1);
        can.wait = 7;
        this.emit("can", car, index);
        break;
      }
    });
    for (const pad of tr.pads)
      for (const car of this.cars) {
        if (car.air > 0.3 || car.boostT > P.padTime - 0.6) continue;
        let u = car.s - pad.s;
        if (u > tr.length / 2) u -= tr.length;
        else if (u < -tr.length / 2) u += tr.length;
        if (Math.abs(u) > 5 || Math.abs(car.d - pad.d) > 3.1) continue;
        car.boostT = P.padTime;
        car.v += 4;
        this.emit("pad", car);
      }
  }

  rank() {
    const order = [...this.cars].sort((a, b) =>
      a.finished || b.finished ? (a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : 1) : b.total - a.total,
    );
    order.forEach((car, k) => (car.place = k + 1));
    this.order = order;
  }

  // Итог заезда. У тех, кто ещё не доехал, время — оценка по их средней скорости.
  results() {
    const L = this.track.length;
    const rows = this.cars.map((car) => {
      let time = car.finishTime;
      if (!car.finished) time = this.time + (this.laps * L - car.total) / Math.max(20, (car.total + 60) / Math.max(1, this.time));
      return { car, time };
    });
    rows.sort((a, b) => a.time - b.time);
    return rows.map(({ car, time }, k) => ({
      index: car.index, livery: car.livery, name: car.name, player: car.player,
      place: k + 1, time, finished: car.finished, best: car.bestLap, points: POINTS[k],
    }));
  }
}

// Кубок: очки по машинам (номер раскраски) за все трассы подряд
export class Cup {
  constructor(rounds) {
    this.rounds = rounds;
    this.round = 0;
    this.points = LIVERIES.map(() => 0);
    this.last = LIVERIES.map(() => 9);
  }
  add(results) {
    for (const r of results) {
      this.points[r.livery] += r.points;
      this.last[r.livery] = r.place;
    }
    this.round++;
  }
  get done() {
    return this.round >= this.rounds;
  }
  // места в кубке: по очкам, при равенстве — кто лучше проехал последний заезд
  standings(mine) {
    return LIVERIES.map((l, livery) => ({ livery, name: livery === mine ? "Ты" : l.name, player: livery === mine, points: this.points[livery] }))
      .sort((a, b) => b.points - a.points || this.last[a.livery] - this.last[b.livery])
      .map((row, k) => ({ ...row, place: k + 1 }));
  }
}
