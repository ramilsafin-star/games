// Логика «Звездочёта Тишки» без графики: комната-сетка, движение мышонка, роботы-сторожа с фонариком,
// шкала внимания, телескопы, светлячок, лифт. Проверяется в node: tests/rooms.mjs (критерии IM-1…IM-4).
// Координаты в клетках: x — столбец, z — строка; центр клетки (i, j) — (i + 0.5, j + 0.5).
// Угол взгляда: 0° — вправо (+x), 90° — вниз (+z).

export const SPEED = 2.6; // клеток в секунду
export const R = 0.28; // радиус мышонка
export const FILL = 1.2; // за столько секунд на свету шкала заполняется
export const DRAIN = 0.6; // за столько секунд в тени опустошается
export const WARN = 0.5; // предупреждение (0,6 с на свету)
export const TUNE = 1.0; // настройка телескопа, секунд
export const TUNE_R = 1.15; // радиус телескопа
export const FLY_TIME = 3.5; // сколько светлячок отвлекает робота
const GUARD_SPEED = 1.5,
  TURN = (140 * Math.PI) / 180;
const rad = (d) => (d * Math.PI) / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Клетки: # стена, B ящик (закрывают свет и путь), T телескоп (только путь), D дверь, E лифт, * звёздочка, . пол
const SOLID = new Set(["#", "B", "T", " "]);
const OPAQUE = new Set(["#", "B"]);

export function parseRoom(def) {
  const rows = def.map.map((r) => r.replace(/\s+$/, ""));
  const h = rows.length,
    w = Math.max(...rows.map((r) => r.length));
  const cell = (x, z) => (x < 0 || z < 0 || x >= w || z >= h ? "#" : rows[z][x] || " ");
  const room = { def, w, h, cell, telescopes: [], door: null, exit: null, star: null };
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const c = cell(x, z),
        p = [x + 0.5, z + 0.5];
      if (c === "T") room.telescopes.push(p);
      if (c === "D") room.door = p;
      if (c === "E") room.exit = p;
      if (c === "*") room.star = p;
    }
  room.solid = (x, z) => SOLID.has(cell(Math.floor(x), Math.floor(z)));
  room.opaque = (x, z) => OPAQUE.has(cell(Math.floor(x), Math.floor(z)));
  return room;
}

// Свет: виден ли отрезок от a до b (ни стена, ни ящик не загораживают)
export function lineOfSight(room, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    d = Math.hypot(dx, dz),
    n = Math.ceil(d / 0.06);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (room.opaque(a[0] + dx * t, a[1] + dz * t)) return false;
  }
  return true;
}
// Видит ли робот точку p: в пределах дальности, в секторе и без преград
export function sees(room, g, p) {
  const dx = p[0] - g.x,
    dz = p[1] - g.z,
    d = Math.hypot(dx, dz);
  if (d > g.range) return false;
  if (d > 0.35 && Math.abs(wrap(Math.atan2(dz, dx) - g.a)) > g.fov / 2) return false;
  return lineOfSight(room, [g.x, g.z], p);
}
// Лучи света для картинки: тот же расчёт, что и для обнаружения
export function coneRays(room, g, n = 44) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = g.a - g.fov / 2 + (g.fov * k) / n,
      cx = Math.cos(a),
      cz = Math.sin(a);
    let d = 0.05;
    while (d < g.range && !room.opaque(g.x + cx * d, g.z + cz * d)) d += 0.05;
    out.push([g.x + cx * Math.min(d, g.range), g.z + cz * Math.min(d, g.range)]);
  }
  return out;
}

// ---------- Робот ----------
// Маршрут: { to: [x, z] } — идти; { look: градусы, wait: секунды } — повернуться и смотреть
export class Guard {
  constructor(def) {
    this.def = def;
    this.x = def.at[0];
    this.z = def.at[1];
    this.a = rad(def.face ?? 90);
    this.fov = rad(def.fov ?? 64);
    this.range = def.range ?? 4.6;
    this.route = def.route || [];
    this.i = 0;
    this.wait = 0;
    this.attention = 0;
    this.warned = false;
    this.distract = null;
    this.moving = false;
    this.speed = def.speed ?? GUARD_SPEED;
  }
  turnTo(target, dt) {
    const d = wrap(target - this.a),
      s = TURN * dt;
    this.a = wrap(this.a + Math.max(-s, Math.min(s, d)));
    return Math.abs(d) <= s + 1e-6;
  }
  step(dt) {
    this.moving = false;
    if (this.distract) {
      this.turnTo(Math.atan2(this.distract.z - this.z, this.distract.x - this.x), dt * 1.6);
      this.distract.t -= dt;
      if (this.distract.t <= 0) this.distract = null;
      return;
    }
    if (!this.route.length) return;
    const st = this.route[this.i];
    if (st.to) {
      const dx = st.to[0] - this.x,
        dz = st.to[1] - this.z,
        d = Math.hypot(dx, dz);
      if (d < 0.02) {
        this.x = st.to[0];
        this.z = st.to[1];
        this.next();
        return;
      }
      // Сначала повернуться по ходу, потом идти
      if (this.turnTo(Math.atan2(dz, dx), dt) || Math.abs(wrap(Math.atan2(dz, dx) - this.a)) < 0.35) {
        const s = Math.min(d, this.speed * dt);
        this.x += (dx / d) * s;
        this.z += (dz / d) * s;
        this.moving = true;
      }
    } else if (st.look !== undefined) {
      if (this.turnTo(rad(st.look), dt)) {
        this.wait += dt;
        if (this.wait >= (st.wait ?? 0)) this.next();
      }
    }
  }
  next() {
    this.wait = 0;
    this.i = (this.i + 1) % this.route.length;
  }
}

// ---------- Поиск пути по клеткам (8 направлений, углы не срезаются) ----------
export function findPath(room, from, to) {
  const key = (x, z) => z * room.w + x;
  const fx = Math.floor(from[0]),
    fz = Math.floor(from[1]);
  let tx = Math.floor(to[0]),
    tz = Math.floor(to[1]);
  const free = (x, z) => !room.solid(x + 0.5, z + 0.5);
  if (!free(tx, tz)) {
    // Нажали на ящик или стену — идём к ближайшей свободной клетке
    let best = null,
      bd = Infinity;
    for (let z = 0; z < room.h; z++)
      for (let x = 0; x < room.w; x++)
        if (free(x, z)) {
          const d = Math.hypot(x + 0.5 - to[0], z + 0.5 - to[1]);
          if (d < bd) {
            bd = d;
            best = [x, z];
          }
        }
    if (!best) return null;
    [tx, tz] = best;
    to = [tx + 0.5, tz + 0.5];
  }
  const open = [[fx, fz]],
    g = new Map([[key(fx, fz), 0]]),
    came = new Map();
  const h = (x, z) => Math.hypot(x - tx, z - tz);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (g.get(key(...open[i])) + h(...open[i]) < g.get(key(...open[bi])) + h(...open[bi])) bi = i;
    const [x, z] = open.splice(bi, 1)[0];
    if (x === tx && z === tz) {
      const cells = [[x, z]];
      let k = key(x, z);
      while (came.has(k)) {
        k = came.get(k);
        cells.unshift([k % room.w, Math.floor(k / room.w)]);
      }
      const pts = cells.slice(1).map(([cx, cz]) => [cx + 0.5, cz + 0.5]);
      if (pts.length) pts[pts.length - 1] = [...to];
      else pts.push([...to]);
      return pts;
    }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx,
          nz = z + dz;
        if (!free(nx, nz)) continue;
        if (dx && dz && (!free(x + dx, z) || !free(x, z + dz))) continue;
        const ng = g.get(key(x, z)) + (dx && dz ? 1.414 : 1);
        if (ng < (g.get(key(nx, nz)) ?? Infinity)) {
          g.set(key(nx, nz), ng);
          came.set(key(nx, nz), key(x, z));
          if (!open.some((o) => o[0] === nx && o[1] === nz)) open.push([nx, nz]);
        }
      }
  }
  return null;
}

// ---------- Комната в игре ----------
// events — что случилось за шаг: warn, caught, tuned, star, open, finish, fly, distract
export class Game {
  constructor(def) {
    this.room = parseRoom(def);
    this.def = def;
    this.guards = def.guards.map((g) => new Guard(g));
    this.p = { x: this.room.door[0], z: this.room.door[1], path: [], moving: false, dir: 0 };
    this.terms = this.room.telescopes.map(([x, z]) => ({ x, z, prog: 0, done: false }));
    this.star = this.room.star ? { x: this.room.star[0], z: this.room.star[1], got: false } : null;
    this.flies = def.flies ?? 3;
    this.fly = null;
    this.open = false;
    this.done = false;
    this.caught = 0;
    this.grace = 0.8;
    this.t = 0;
    this.events = [];
  }
  emit(e) {
    this.events.push(e);
  }
  goTo(x, z) {
    const path = findPath(this.room, [this.p.x, this.p.z], [x, z]);
    this.p.path = path || [];
  }
  stop() {
    this.p.path = [];
  }
  // Светлячок летит к тому роботу, что ближе всех к Тишке, и кружится за ним — робот поворачивается туда
  launch() {
    if (this.fly || this.flies <= 0 || this.done) return false;
    let gi = -1,
      best = Infinity;
    this.guards.forEach((g, i) => {
      const d = Math.hypot(g.x - this.p.x, g.z - this.p.z) - g.attention * 5;
      if (d < best) {
        best = d;
        gi = i;
      }
    });
    if (gi < 0) return false;
    const g = this.guards[gi];
    let dx = g.x - this.p.x,
      dz = g.z - this.p.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // Точка за роботом, подальше от Тишки, но не в стене
    let to = [g.x + dx * 1.7, g.z + dz * 1.7];
    for (let k = 1.7; k > 0.5 && this.room.solid(...to); k -= 0.2) to = [g.x + dx * k, g.z + dz * k];
    this.flies--;
    this.fly = { from: [this.p.x, this.p.z], to, gi, t: 0, dur: 0.5, phase: "go" };
    this.emit({ type: "fly", gi });
    return true;
  }
  // input.dir — направление с клавиатуры [dx, dz] или null
  step(dt, input = {}) {
    if (this.done) return;
    this.t += dt;
    this.grace = Math.max(0, this.grace - dt);
    // Движение
    const p = this.p;
    let vx = 0,
      vz = 0;
    if (input.dir && (input.dir[0] || input.dir[1])) {
      p.path = [];
      const l = Math.hypot(...input.dir);
      vx = input.dir[0] / l;
      vz = input.dir[1] / l;
    } else if (p.path.length) {
      const [tx, tz] = p.path[0],
        dx = tx - p.x,
        dz = tz - p.z,
        d = Math.hypot(dx, dz);
      if (d < 0.06) {
        p.path.shift();
      } else {
        vx = dx / d;
        vz = dz / d;
        if (d < SPEED * dt) {
          vx *= d / (SPEED * dt);
          vz *= d / (SPEED * dt);
        }
      }
    }
    p.moving = !!(vx || vz);
    if (p.moving) {
      p.dir = Math.atan2(vz, vx);
      this.moveBy(vx * SPEED * dt, vz * SPEED * dt);
    }
    // Роботы и их внимание
    for (const g of this.guards) {
      g.step(dt);
      const seen = this.grace <= 0 && sees(this.room, g, [p.x, p.z]);
      g.seeing = seen;
      g.attention = Math.max(0, Math.min(1, g.attention + (seen ? dt / FILL : -dt / DRAIN)));
      if (g.attention >= WARN && !g.warned) {
        g.warned = true;
        this.emit({ type: "warn", g });
      }
      if (g.attention < 0.25) g.warned = false;
    }
    const spotter = this.guards.find((g) => g.attention >= 1 - 1e-9);
    if (spotter) return this.catch(spotter);
    // Светлячок
    if (this.fly) {
      const f = this.fly;
      f.t += dt;
      if (f.phase === "go" && f.t >= f.dur) {
        f.phase = "buzz";
        f.t = 0;
        this.guards[f.gi].distract = { x: f.to[0], z: f.to[1], t: FLY_TIME };
        this.emit({ type: "distract", gi: f.gi });
      } else if (f.phase === "buzz" && f.t >= FLY_TIME) this.fly = null;
    }
    // Телескопы: стоишь рядом — настраивается, отошёл — сначала
    for (const tm of this.terms) {
      if (tm.done) continue;
      if (Math.hypot(tm.x - p.x, tm.z - p.z) <= TUNE_R) {
        tm.prog += dt / TUNE;
        if (tm.prog >= 1) {
          tm.prog = 1;
          tm.done = true;
          this.emit({ type: "tuned", tm });
        }
      } else tm.prog = 0;
    }
    if (!this.open && this.terms.every((t) => t.done)) {
      this.open = true;
      this.emit({ type: "open" });
    }
    if (this.star && !this.star.got && Math.hypot(this.star.x - p.x, this.star.z - p.z) < 0.6) {
      this.star.got = true;
      this.emit({ type: "star" });
    }
    if (this.open && Math.hypot(this.room.exit[0] - p.x, this.room.exit[1] - p.z) < 0.55) {
      this.done = true;
      this.emit({ type: "finish" });
    }
  }
  moveBy(dx, dz) {
    const p = this.p;
    if (!this.hits(p.x + dx, p.z)) p.x += dx;
    if (!this.hits(p.x, p.z + dz)) p.z += dz;
  }
  // Круг мышонка задевает непроходимую клетку?
  hits(x, z) {
    for (let cz = Math.floor(z - R); cz <= Math.floor(z + R); cz++)
      for (let cx = Math.floor(x - R); cx <= Math.floor(x + R); cx++) {
        if (!this.room.solid(cx + 0.5, cz + 0.5)) continue;
        const nx = Math.max(cx, Math.min(x, cx + 1)),
          nz = Math.max(cz, Math.min(z, cz + 1));
        if (Math.hypot(x - nx, z - nz) < R - 1e-6) return true;
      }
    return false;
  }
  // Заметили: Тишка у двери, настроенные телескопы остаются, начатая настройка — сначала
  catch(g) {
    this.caught++;
    const at = [this.p.x, this.p.z];
    this.p.x = this.room.door[0];
    this.p.z = this.room.door[1];
    this.p.path = [];
    for (const x of this.guards) {
      x.attention = 0;
      x.warned = false;
    }
    for (const t of this.terms) if (!t.done) t.prog = 0;
    this.fly = null;
    this.grace = 1.2;
    this.emit({ type: "caught", g, at });
  }
  stars() {
    return 1 + (this.caught === 0 ? 1 : 0) + (this.star && this.star.got ? 1 : 0);
  }
}
