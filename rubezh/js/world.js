// Мир для правил: столкновения тел с коробками (в том числе повёрнутыми), лучи выстрелов и взгляда,
// сетка проходимости с поиском пути (A*) и поиск укрытий. Без графики — работает и в Node.
import { clamp } from "./util.js?v=1434d71a";

export const STEP = 0.55; // на такую высоту тело шагает без прыжка
const CELL = 0.75; // клетка сетки проходимости
const HASH = 4; // клетка пространственного индекса коробок

export class World {
  constructor(map) {
    this.map = map;
    this.floor = map.floor;
    this.bounds = map.bounds;
    this.broken = new Set(); // разбитые стёкла (номера коробок)
    this.boxes = map.boxes.map((b, i) => {
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      // описанный прямоугольник
      const ex = Math.abs(c) * b.hw + Math.abs(s) * b.hd, ez = Math.abs(s) * b.hw + Math.abs(c) * b.hd;
      return { ...b, i, c, s, minX: b.cx - ex, maxX: b.cx + ex, minZ: b.cz - ez, maxZ: b.cz + ez };
    });
    // Пространственный индекс
    const [x0, z0, x1, z1] = this.bounds;
    this.hx0 = x0 - 8;
    this.hz0 = z0 - 8;
    this.hw = Math.ceil((x1 - x0 + 16) / HASH);
    this.hh = Math.ceil((z1 - z0 + 16) / HASH);
    this.hash = Array.from({ length: this.hw * this.hh }, () => []);
    for (const b of this.boxes) {
      const a0 = this.hcol(b.minX), a1 = this.hcol(b.maxX), c0 = this.hrow(b.minZ), c1 = this.hrow(b.maxZ);
      for (let r = c0; r <= c1; r++) for (let q = a0; q <= a1; q++) this.hash[r * this.hw + q].push(b);
    }
    this.stamp = new Uint32Array(this.boxes.length);
    this.tick = 1;
    this.water = map.water || [];
    this.buildNav();
  }
  hcol(x) {
    return clamp(Math.floor((x - this.hx0) / HASH), 0, this.hw - 1);
  }
  hrow(z) {
    return clamp(Math.floor((z - this.hz0) / HASH), 0, this.hh - 1);
  }
  // коробки рядом с прямоугольником (без повторов)
  near(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const t = ++this.tick;
    const a0 = this.hcol(minX), a1 = this.hcol(maxX), c0 = this.hrow(minZ), c1 = this.hrow(maxZ);
    for (let r = c0; r <= c1; r++)
      for (let q = a0; q <= a1; q++)
        for (const b of this.hash[r * this.hw + q]) {
          if (this.stamp[b.i] === t) continue;
          this.stamp[b.i] = t;
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
    return out;
  }
  solid(b) {
    return !(b.glass === "break" && this.broken.has(b.i));
  }

  // ---------- Точка и круг против коробки ----------
  // местные координаты точки в системе коробки
  local(b, x, z) {
    const dx = x - b.cx, dz = z - b.cz;
    return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
  }
  inside(b, x, z, pad = 0) {
    const [lx, lz] = this.local(b, x, z);
    return Math.abs(lx) <= b.hw + pad && Math.abs(lz) <= b.hd + pad;
  }
  // расстояние от точки до прямоугольника коробки (0 внутри)
  gap(b, x, z) {
    const [lx, lz] = this.local(b, x, z);
    const qx = Math.max(Math.abs(lx) - b.hw, 0), qz = Math.max(Math.abs(lz) - b.hd, 0);
    return Math.hypot(qx, qz);
  }

  // высота опоры под кругом: самая высокая крыша коробки, на которую можно шагнуть
  groundAt(x, z, r, feet) {
    let g = this.floor;
    const list = this.near(x - r, z - r, x + r, z + r, this._g || (this._g = []));
    for (const b of list) {
      if (!this.solid(b) || b.y1 > feet + STEP || b.y1 <= g) continue;
      if (b.inv) continue;
      if (this.gap(b, x, z) <= r * 0.55) g = b.y1;
    }
    return g;
  }
  inWater(x, z, y) {
    for (const w of this.water) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 && y < w.y) return w;
    return null;
  }

  // Движение тела: body {x, y, z, vy, r, h, grounded}. Сдвиг dx, dz за шаг.
  move(body, dx, dz, dt, gravity = 15) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (body.r * 0.8)));
    for (let k = 0; k < n; k++) {
      body.x += dx / n;
      body.z += dz / n;
      this.pushOut(body);
    }
    const [x0, z0, x1, z1] = this.bounds;
    body.x = clamp(body.x, x0 + body.r, x1 - body.r);
    body.z = clamp(body.z, z0 + body.r, z1 - body.r);
    // по вертикали
    const ground = this.groundAt(body.x, body.z, body.r, body.y);
    if (body.fly) return;
    if (body.vy > 0 || body.y > ground + 0.02) {
      body.vy -= gravity * dt;
      body.y += body.vy * dt;
      // потолок
      if (body.vy > 0) {
        const list = this.near(body.x - body.r, body.z - body.r, body.x + body.r, body.z + body.r, this._c || (this._c = []));
        for (const b of list) {
          if (!this.solid(b) || b.inv) continue;
          if (b.y0 > body.y + 0.6 && b.y0 < body.y + body.h && this.gap(b, body.x, body.z) < body.r * 0.7) {
            body.vy = 0;
            body.y = Math.min(body.y, b.y0 - body.h);
          }
        }
      }
      if (body.y <= ground) {
        body.landed = -body.vy;
        body.y = ground;
        body.vy = 0;
        body.grounded = true;
      } else body.grounded = false;
    } else {
      // шаг вверх или вниз по ступенькам — сразу, плавность добавит камера
      body.stepped = ground - body.y;
      body.y = ground;
      body.vy = 0;
      body.grounded = true;
    }
  }
  pushOut(body) {
    const r = body.r;
    const list = this.near(body.x - r, body.z - r, body.x + r, body.z + r, this._p || (this._p = []));
    const lift = body.grounded !== false ? STEP : 0.05;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of list) {
        if (!this.solid(b)) continue;
        if (b.y1 <= body.y + lift || b.y0 >= body.y + body.h) continue;
        const [lx, lz] = this.local(b, body.x, body.z);
        const cx = clamp(lx, -b.hw, b.hw), cz = clamp(lz, -b.hd, b.hd);
        let ox = lx - cx, oz = lz - cz;
        let d2 = ox * ox + oz * oz;
        if (d2 >= r * r) continue;
        let nx, nz, push;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          nx = ox / d;
          nz = oz / d;
          push = r - d;
        } else {
          // центр внутри коробки — выталкиваем по ближней стороне
          const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
          if (px < pz) {
            nx = Math.sign(lx) || 1;
            nz = 0;
            push = px + r;
          } else {
            nx = 0;
            nz = Math.sign(lz) || 1;
            push = pz + r;
          }
        }
        // обратно в мир
        const wx = nx * b.c + nz * b.s, wz = -nx * b.s + nz * b.c;
        body.x += wx * push;
        body.z += wz * push;
        body.hitWall = true;
      }
    }
  }
  // можно ли встать в точке (для появления роботов и проверок)
  free(x, z, y, r = 0.4, h = 1.7) {
    const list = this.near(x - r, z - r, x + r, z + r, this._f || (this._f = []));
    for (const b of list) {
      if (!this.solid(b) || b.y1 <= y + STEP || b.y0 >= y + h) continue;
      if (this.gap(b, x, z) < r) return false;
    }
    return true;
  }

  // ---------- Лучи ----------
  // Луч из o в направлении d (единичный) до maxT. kind: "bullet" (стекло бьётся, сетка пропускает),
  // "sight" (стекло и сетка прозрачны, глухие окна — нет). Возвращает {t, box, nx, ny, nz} или null.
  ray(ox, oy, oz, dx, dy, dz, maxT, kind = "bullet") {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.near(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this._r || (this._r = []));
    let best = maxT, hit = null;
    for (const b of list) {
      if (b.inv || b.pass) continue;
      if (b.glass === "break" && (kind === "sight" || this.broken.has(b.i))) continue;
      const r = this.rayBox(b, ox, oy, oz, dx, dy, dz, best);
      if (r && r.t < best) {
        best = r.t;
        hit = r;
        hit.box = b;
      }
    }
    return hit;
  }
  rayBox(b, ox, oy, oz, dx, dy, dz, maxT) {
    // в местные координаты
    const qx = ox - b.cx, qz = oz - b.cz;
    const lox = qx * b.c - qz * b.s, loz = qx * b.s + qz * b.c;
    const ldx = dx * b.c - dz * b.s, ldz = dx * b.s + dz * b.c;
    let t0 = 0, t1 = maxT, axis = -1, sign = 0;
    const slab = (o, d, lo, hi, ax) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let a = (lo - o) / d, c = (hi - o) / d, sg = -1;
      if (a > c) {
        const tmp = a;
        a = c;
        c = tmp;
        sg = 1;
      }
      if (a > t0) {
        t0 = a;
        axis = ax;
        sign = sg;
      }
      if (c < t1) t1 = c;
      return t0 <= t1;
    };
    if (!slab(lox, ldx, -b.hw, b.hw, 0)) return null;
    if (!slab(oy, dy, b.y0, b.y1, 1)) return null;
    if (!slab(loz, ldz, -b.hd, b.hd, 2)) return null;
    if (axis < 0) return null; // начало внутри коробки
    let nx = 0, ny = 0, nz = 0;
    if (axis === 0) nx = sign;
    else if (axis === 1) ny = sign;
    else nz = sign;
    // нормаль обратно в мир
    const wx = nx * b.c + nz * b.s, wz = -nx * b.s + nz * b.c;
    return { t: t0, nx: wx, ny, nz: wz };
  }
  // видно ли точку b из точки a
  sees(ax, ay, az, bx, by, bz, kind = "sight") {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return true;
    return !this.ray(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, kind);
  }

  // ---------- Сетка проходимости ----------
  buildNav() {
    const [x0, z0, x1, z1] = this.bounds;
    this.nx0 = x0;
    this.nz0 = z0;
    this.nw = Math.ceil((x1 - x0) / CELL);
    this.nh = Math.ceil((z1 - z0) / CELL);
    const N = this.nw * this.nh;
    this.navG = new Float32Array(N);
    this.navOk = new Uint8Array(N);
    this.navWall = new Uint8Array(N); // рядом стена (укрытие)
    const list = [];
    const R = 0.42;
    for (let r = 0; r < this.nh; r++)
      for (let q = 0; q < this.nw; q++) {
        const x = x0 + (q + 0.5) * CELL, z = z0 + (r + 0.5) * CELL, i = r * this.nw + q;
        this.near(x - 1.2, z - 1.2, x + 1.2, z + 1.2, list);
        // опора: коробки под центром, по возрастанию низа
        const under = list.filter((b) => !b.lintelOf && this.inside(b, x, z)).sort((p, s) => p.y0 - s.y0);
        let g = this.floor, ok = true;
        for (const b of under) {
          if (b.y0 > g + STEP) continue; // над головой
          if (b.walk || b.floorOnly) g = Math.max(g, b.y1);
          else {
            ok = false;
            break;
          }
        }
        this.navG[i] = g;
        if (ok)
          for (const b of list) {
            if (b.y1 <= g + STEP || b.y0 >= g + 1.7) continue;
            if (this.gap(b, x, z) < R) {
              ok = false;
              break;
            }
          }
        this.navOk[i] = ok ? 1 : 0;
        if (ok)
          for (const b of list) {
            if (b.inv || b.pass || b.glass) continue;
            if (b.y1 >= g + 1.0 && b.y0 < g + 0.5 && this.gap(b, x, z) < 1.1) {
              this.navWall[i] = 1;
              break;
            }
          }
      }
  }
  cellOf(x, z) {
    const q = Math.floor((x - this.nx0) / CELL), r = Math.floor((z - this.nz0) / CELL);
    if (q < 0 || r < 0 || q >= this.nw || r >= this.nh) return -1;
    return r * this.nw + q;
  }
  cellPos(i) {
    const q = i % this.nw, r = (i / this.nw) | 0;
    return [this.nx0 + (q + 0.5) * CELL, this.nz0 + (r + 0.5) * CELL, this.navG[i]];
  }
  // ближайшая проходимая клетка к точке (на той же высоте, если можно)
  nearestOk(x, z, y = null, maxR = 6) {
    if (y === undefined || Number.isNaN(y)) y = null;
    const c = this.cellOf(x, z);
    if (c >= 0 && this.navOk[c] && (y === null || Math.abs(this.navG[c] - y) < 1)) return c;
    const q0 = Math.floor((x - this.nx0) / CELL), r0 = Math.floor((z - this.nz0) / CELL);
    let best = -1, bd = Infinity;
    const K = Math.ceil(maxR / CELL);
    for (let dr = -K; dr <= K; dr++)
      for (let dq = -K; dq <= K; dq++) {
        const q = q0 + dq, r = r0 + dr;
        if (q < 0 || r < 0 || q >= this.nw || r >= this.nh) continue;
        const i = r * this.nw + q;
        if (!this.navOk[i]) continue;
        const d = dq * dq + dr * dr + (y === null ? 0 : Math.abs(this.navG[i] - y) * 6);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    return best;
  }
  link(a, b) {
    return this.navOk[a] && this.navOk[b] && Math.abs(this.navG[a] - this.navG[b]) <= 0.62;
  }
  // путь A* от точки до точки: массив [x, z] (без начала), или null
  path(ax, az, ay, bx, bz, by = null, limit = 6000) {
    const s = this.nearestOk(ax, az, ay), t = this.nearestOk(bx, bz, by);
    if (s < 0 || t < 0) return null;
    if (s === t) return [[bx, bz]];
    const W = this.nw, N = W * this.nh;
    if (!this._g2 || this._g2.length !== N) {
      this._g2 = new Float32Array(N);
      this._from = new Int32Array(N);
      this._seen = new Uint32Array(N);
      this._gen = 0;
    }
    const gs = this._g2, from = this._from, seen = this._seen;
    const gen = ++this._gen;
    const tq = t % W, tr = (t / W) | 0;
    const h = (i) => {
      const dq = Math.abs((i % W) - tq), dr = Math.abs(((i / W) | 0) - tr);
      return (Math.max(dq, dr) + 0.414 * Math.min(dq, dr)) * CELL;
    };
    // двоичная куча
    const heap = [], hf = [];
    const push = (i, f) => {
      heap.push(i);
      hf.push(f);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= hf[k]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        [hf[p], hf[k]] = [hf[k], hf[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const li = heap.pop(), lf = hf.pop();
      if (heap.length) {
        heap[0] = li;
        hf[0] = lf;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && hf[l] < hf[m]) m = l;
          if (r < heap.length && hf[r] < hf[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          [hf[m], hf[k]] = [hf[k], hf[m]];
          k = m;
        }
      }
      return top;
    };
    seen[s] = gen;
    gs[s] = 0;
    from[s] = -1;
    push(s, h(s));
    const closed = new Set();
    let found = false, steps = 0;
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length && steps++ < limit) {
      const c = pop();
      if (c === t) {
        found = true;
        break;
      }
      if (closed.has(c)) continue;
      closed.add(c);
      const cq = c % W, cr = (c / W) | 0;
      for (const [dq, dr, cost] of D) {
        const q = cq + dq, r = cr + dr;
        if (q < 0 || r < 0 || q >= W || r >= this.nh) continue;
        const n = r * W + q;
        if (!this.link(c, n)) continue;
        if (dq && dr && (!this.link(c, cr * W + q) || !this.link(c, r * W + cq))) continue;
        const ng = gs[c] + cost * CELL + (this.navWall[n] ? 0.15 : 0);
        if (seen[n] === gen && ng >= gs[n]) continue;
        seen[n] = gen;
        gs[n] = ng;
        from[n] = c;
        push(n, ng + h(n));
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = t; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    // спрямление: выкидываем точки, если по прямой можно пройти
    const pts = [];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !this.walkable(cells[i], cells[j])) j--;
      const p = this.cellPos(cells[j]);
      pts.push([p[0], p[1], p[2]]);
      i = j;
    }
    if (pts.length) {
      const last = pts[pts.length - 1];
      if (this.cellOf(bx, bz) === t) {
        last[0] = bx;
        last[1] = bz;
      }
    }
    return pts;
  }
  // прямой проход между клетками (без перепадов и препятствий)
  walkable(a, b) {
    const [ax, az] = this.cellPos(a), [bx, bz] = this.cellPos(b);
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (CELL * 0.45));
    let prev = a;
    for (let k = 1; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      const c = this.cellOf(x, z);
      if (c < 0 || !this.navOk[c]) return false;
      if (c !== prev) {
        if (!this.link(prev, c)) return false;
        // соседние клетки по бокам тоже проходимы — не режем углы
        prev = c;
      }
    }
    return true;
  }
  // длина пути по сетке (для оценок)
  pathLength(ax, az, ay, bx, bz, by) {
    const p = this.path(ax, az, ay, bx, bz, by);
    if (!p) return Infinity;
    let L = 0, px = ax, pz = az;
    for (const [x, z] of p) {
      L += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
    return L;
  }
  // Укрытие от точки угрозы (tx,ty,tz) рядом с (x,z): клетка у стены, которую не видно оттуда.
  // Перебор по кольцу клеток не дальше maxR.
  cover(x, z, y, tx, ty, tz, maxR = 9, rand = Math.random) {
    const q0 = Math.floor((x - this.nx0) / CELL), r0 = Math.floor((z - this.nz0) / CELL);
    const K = Math.ceil(maxR / CELL);
    let best = null, bs = Infinity;
    const toT = Math.hypot(tx - x, tz - z);
    for (let tries = 0; tries < 40; tries++) {
      const q = q0 + Math.round((rand() * 2 - 1) * K), r = r0 + Math.round((rand() * 2 - 1) * K);
      if (q < 0 || r < 0 || q >= this.nw || r >= this.nh) continue;
      const i = r * this.nw + q;
      if (!this.navOk[i] || !this.navWall[i] || Math.abs(this.navG[i] - y) > 1.2) continue;
      const [cx, cz, cg] = this.cellPos(i);
      const d = Math.hypot(cx - x, cz - z);
      if (d > maxR) continue;
      const dt = Math.hypot(tx - cx, tz - cz);
      if (dt < 5) continue;
      if (this.sees(tx, ty, tz, cx, cg + 1.2, cz, "bullet")) continue;
      // не убегать слишком далеко и не подходить вплотную
      const s = d + Math.abs(dt - Math.min(16, toT)) * 0.4 + rand() * 1.5;
      if (s < bs) {
        bs = s;
        best = [cx, cz, cg];
      }
    }
    return best;
  }
  // случайная проходимая точка в круге
  randomNear(x, z, y, R, rand = Math.random) {
    for (let k = 0; k < 30; k++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * R;
      const c = this.cellOf(x + Math.cos(a) * d, z + Math.sin(a) * d);
      if (c >= 0 && this.navOk[c] && (y === null || Math.abs(this.navG[c] - y) < 1.3)) return this.cellPos(c);
    }
    const c = this.nearestOk(x, z, y);
    return c >= 0 ? this.cellPos(c) : [x, z, y ?? this.floor];
  }
}
