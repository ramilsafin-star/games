// Гонка «Бобрят» без графики: карта островов, дорога, вода по клеткам, мостики из брёвнышек, бегуны,
// ворота, финиш, места. Шаг 1/60 с. Проверяется tests/race.mjs (критерии SR-1…SR-4 из ТЗ).
// Координаты: x — вправо, y — вперёд (вверх по карте). Клетка (i, j) — квадрат [i, i+1] × [j, j+1].
// Курс a: 0 — прямо вперёд (+y), положительный — вправо.

export const STEP = 1 / 60;
export const CAP = 12; // больше брёвнышек в лапах не унести
export const PILE = 3; // брёвнышек в одной куче
const TURN = 2.7, // рад/с
  ASSIST = 2.4,
  PICK_R = 1.35, // кучу видно издалека — не надо попадать точно
  PILE_BACK = 1.6, // куча снова появляется через, с
  FALL = 1.1;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Дорога ----------
export function makeRoad(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const len = cum.at(-1);
  const at = (s) => {
    s = clamp(s, 0, len);
    let i = 1;
    while (i < points.length - 1 && cum[i] < s) i++;
    const [x0, y0] = points[i - 1],
      [x1, y1] = points[i],
      l = cum[i] - cum[i - 1] || 1,
      f = (s - cum[i - 1]) / l;
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  };
  // Ближайшая точка дороги: расстояние и длина пути до неё
  const nearest = (x, y) => {
    let best = { d: Infinity, s: 0 };
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1],
        [x1, y1] = points[i];
      const dx = x1 - x0,
        dy = y1 - y0,
        l2 = dx * dx + dy * dy;
      const t = l2 ? clamp(((x - x0) * dx + (y - y0) * dy) / l2, 0, 1) : 0;
      const d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
      if (d < best.d - 1e-9) best = { d, s: cum[i - 1] + t * Math.sqrt(l2) };
    }
    return best;
  };
  return { points, len, at, nearest };
}

// ---------- Карта ----------
export function makeMap(def) {
  const road = makeRoad(def.road);
  const W = def.w,
    H = def.h;
  const land = new Uint8Array(W * H);
  const isLandAt = (cx, cy) => {
    if (cy < def.start + 1.5 || cy > def.finish - 0.5) return true;
    if (road.nearest(cx, cy).d <= (def.roadW ?? 1.75)) return true;
    for (const [ix, iy, r] of def.islands || []) if (Math.hypot(cx - ix, cy - iy) <= r) return true;
    return false;
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) land[j * W + i] = isLandAt(i + 0.5, j + 0.5) ? 1 : 0;
  const cell = (x, y) => [Math.floor(x), Math.floor(y)];
  const key = (i, j) => j * W + i;
  return {
    def,
    road,
    W,
    H,
    land,
    key,
    cell,
    // За краем карты — вода (туда не убежать)
    isLand: (i, j) => i >= 0 && j >= 0 && i < W && j < H && land[key(i, j)] === 1,
    inside: (i, j) => i >= 0 && j >= 0 && i < W && j < H,
  };
}

// Кучи брёвнышек: заданные на трассе и через каждые pileEvery по дороге (длинная дорога — больше брёвнышек)
export function allPiles(def, map) {
  const out = (def.piles || []).map((p) => [...p]);
  const every = def.pileEvery ?? 5;
  const road = map.road;
  for (let s = 3.5; s < road.len; s += every) {
    const [x, y] = road.at(s);
    if (y < def.start + 2 || y > def.finish - 2) continue;
    if (out.some(([px, py]) => Math.hypot(px - x, py - y) < 2.4)) continue;
    out.push([x, y]);
  }
  return out;
}

// ---------- Гонка ----------
export class Race {
  // racers: [{ name, speed, bot: "bold" | "careful" | null }]
  constructor(def, racers) {
    this.map = makeMap(def);
    this.def = def;
    this.bridges = new Set();
    this.piles = allPiles(def, this.map).map(([x, y]) => ({ x, y, n: PILE, back: 0 }));
    this.gates = def.gates || [];
    this.t = 0;
    this.state = "ready"; // ready | run | over
    this.wait = def.countdown ?? 3;
    this.events = [];
    this.finishOrder = [];
    const lanes = racers.length;
    this.racers = racers.map((r, i) => {
      const x = def.road[0][0] + (i - (lanes - 1) / 2) * 1.1;
      return { i, lane: (i - (lanes - 1) / 2) * 0.5, name: r.name, bot: r.bot || null, speed: (r.speed ?? 4.2) * (r.bot && !r.player ? def.botSpeed ?? 1 : 1), x, y: def.start + 0.6, a: 0, planks: r.planks ?? 0, state: "run", fall: 0, safe: [x, def.start + 0.6, 0], gate: 0, done: false, time: 0, decided: new Set(), target: null, s: 0, steer: 0 };
    });
  }
  emit(e) {
    this.events.push(e);
  }
  bridged(i, j) {
    return this.bridges.has(this.map.key(i, j));
  }
  // Клетка, по которой можно бежать (суша или мостик)
  solid(i, j) {
    return this.map.isLand(i, j) || (this.map.inside(i, j) && this.bridged(i, j));
  }
  // steer[k] ∈ [−1, 1] — поворот для живого игрока (null — бот или подсказка дороги)
  step(steer = []) {
    const dt = STEP;
    if (this.state === "over") return;
    if (this.state === "ready") {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.state = "run";
        this.emit({ type: "go" });
      }
      return;
    }
    this.t += dt;
    for (const p of this.piles)
      if (p.n === 0) {
        p.back -= dt;
        if (p.back <= 0) {
          p.n = PILE;
          this.emit({ type: "pileBack", p });
        }
      }
    // Порядок обработки постоянный: при одновременном шаге на одну клетку платит тот, кто раньше в списке
    for (const r of this.racers) this.move(r, r.bot ? this.botSteer(r) : steer[r.i] ?? 0, dt);
    if (this.racers.every((r) => r.done) || (this.racers.some((r) => r.done && !r.bot) && this.t > (this.finishOrder[0]?.time ?? 0) + 6)) this.over();
  }
  over() {
    if (this.state === "over") return;
    this.state = "over";
    this.emit({ type: "over" });
  }
  move(r, steer, dt) {
    if (r.done) return;
    if (r.state === "fall") {
      r.fall -= dt;
      if (r.fall <= 0) {
        r.state = "run";
        [r.x, r.y] = r.safe;
        r.a = this.roadHeading(r);
        this.emit({ type: "respawn", r });
      }
      return;
    }
    const M = this.map;
    const [ci, cj] = M.cell(r.x, r.y);
    const onLand = M.isLand(ci, cj);
    // Поворот: игрок — от пальца; не трогает — на суше бобрёнок сам бежит по дороге, на мостике — прямо
    r.steer = steer;
    if (steer) r.a = wrap(r.a + clamp(steer, -1, 1) * TURN * dt);
    else if (onLand || r.bot) {
      const want = r.target ? Math.atan2(r.target[0] - r.x, r.target[1] - r.y) : this.roadHeading(r);
      r.a = wrap(r.a + clamp(wrap(want - r.a), -ASSIST * dt, ASSIST * dt));
    }
    // Не бегать назад к старту: курс не дальше чем вбок
    r.a = clamp(r.a, -Math.PI * 0.62, Math.PI * 0.62);
    const nx = r.x + Math.sin(r.a) * r.speed * dt,
      ny = r.y + Math.cos(r.a) * r.speed * dt;
    const [ni, nj] = M.cell(nx, ny);
    // За краем карты — стоп, поворот вдоль края
    if (!M.inside(ni, nj)) {
      r.a = wrap(r.a * 0.5);
      return;
    }
    if (!this.solid(ni, nj)) {
      if (r.planks > 0) {
        // Одно изменение: брёвнышко из лап — сразу мостик под лапами
        r.planks--;
        this.bridges.add(M.key(ni, nj));
        this.emit({ type: "plank", r, i: ni, j: nj });
      } else {
        r.state = "fall";
        r.fall = FALL;
        r.target = null;
        r.x = nx;
        r.y = ny;
        this.emit({ type: "fall", r });
        return;
      }
    }
    const py = r.y;
    r.x = nx;
    r.y = ny;
    if (M.isLand(ni, nj)) r.safe = [r.x - Math.sin(r.a) * 0.35, r.y - Math.cos(r.a) * 0.35];
    r.s = M.road.nearest(r.x, r.y).s;
    // Брёвнышки
    for (const p of this.piles) {
      if (p.n === 0 || r.planks >= CAP) continue;
      if (Math.hypot(p.x - r.x, p.y - r.y) < PICK_R) {
        const take = Math.min(p.n, CAP - r.planks);
        r.planks += take;
        p.n -= take;
        if (p.n === 0) p.back = PILE_BACK;
        this.emit({ type: "pick", r, n: take, p });
      }
    }
    // Ворота по порядку, финиш — только после всех ворот (SR-4)
    this.crossGates(r, py);
  }
  crossGates(r, py) {
    while (r.gate < this.gates.length && py < this.gates[r.gate] && r.y >= this.gates[r.gate]) {
      r.gate++;
      this.emit({ type: "gate", r, n: r.gate });
    }
    if (r.y >= this.def.finish && r.gate === this.gates.length && !r.done) {
      r.done = true;
      r.time = this.t;
      this.finishOrder.push(r);
      this.emit({ type: "finish", r, place: this.finishOrder.length });
    }
  }
  // Курс по дороге: на точку чуть впереди ближайшей, каждый по своей дорожке (не толпятся в одну линию)
  roadHeading(r) {
    const road = this.map.road;
    const n = road.nearest(r.x, r.y);
    const [px, py] = road.at(n.s + 2.4),
      [qx, qy] = road.at(n.s + 2.7);
    const d = Math.hypot(qx - px, qy - py) || 1,
      lane = r.lane || 0;
    const tx = px + ((qy - py) / d) * lane,
      ty = py - ((qx - px) / d) * lane;
    return Math.atan2(tx - r.x, ty - r.y);
  }
  // Сколько воды без мостиков на отрезке (для бота и подсказки)
  waterOn(x0, y0, x1, y1) {
    const M = this.map,
      seen = new Set();
    let n = 0;
    const L = Math.hypot(x1 - x0, y1 - y0),
      k = Math.ceil(L / 0.2);
    for (let q = 0; q <= k; q++) {
      const [i, j] = M.cell(x0 + ((x1 - x0) * q) / k, y0 + ((y1 - y0) * q) / k);
      const id = M.key(i, j);
      if (seen.has(id)) continue;
      seen.add(id);
      if (!this.solid(i, j)) n++;
    }
    return n;
  }
  // Призрачные мостики: что будет, если бежать прямо. cells — клетки воды до берега, have — брёвнышек
  preview(r, maxCells = 10) {
    const M = this.map,
      cells = [],
      seen = new Set();
    let land = false,
      water = false;
    for (let d = 0.3; d < 14; d += 0.2) {
      const [i, j] = M.cell(r.x + Math.sin(r.a) * d, r.y + Math.cos(r.a) * d);
      if (!M.inside(i, j)) break;
      const id = M.key(i, j);
      if (seen.has(id)) continue;
      seen.add(id);
      if (this.solid(i, j)) {
        if (water) {
          land = true;
          break;
        }
        if (d > 3.2) break; // вода далеко — не показываем
        continue;
      }
      water = true;
      cells.push([i, j]);
      if (cells.length >= maxCells) break;
    }
    return { cells, reach: land, need: cells.length, have: r.planks };
  }
  // Бот: бежит по дороге; у начала срезки (по пройденному пути) решает, хватит ли брёвнышек
  botSteer(r) {
    const cuts = this.def.shortcuts || [];
    if (r.target) {
      if (Math.hypot(r.target[0] - r.x, r.target[1] - r.y) < 1.1 || r.y > r.target[1] + 0.5) r.target = null;
      return 0;
    }
    const road = this.map.road;
    cuts.forEach((c, k) => {
      if (r.decided.has(k)) return;
      c.fromS ??= road.nearest(...c.from).s;
      if (r.s >= c.fromS + 2.5) r.decided.add(k);
      else if (!r.target && r.s >= c.fromS - 2.2) {
        const need = this.waterOn(r.x, r.y, ...c.to);
        const spare = r.bot === "careful" ? 3 : 1;
        if (need > 0 && r.planks >= need + spare) {
          r.decided.add(k);
          r.target = c.to;
          // Сразу развернуться к цели — путь по воде прямой, брёвнышек хватит
          r.a = Math.atan2(c.to[0] - r.x, c.to[1] - r.y);
          this.emit({ type: "botCut", r, k });
        }
      }
    });
    return 0;
  }
  // Места: финишировавшие по времени, остальные по воротам и пути по дороге
  places() {
    const rest = this.racers.filter((r) => !r.done).sort((a, b) => b.gate - a.gate || b.s - a.s);
    return [...this.finishOrder, ...rest];
  }
  placeOf(r) {
    return this.places().indexOf(r) + 1;
  }
}

// ---------- Берег ----------
// Плавная кромка суши для картинки: «сколько тут суши» от 0 до 1. Берём клетки логики (центры клеток),
// тянем между ними плавно и чуть размываем — берег идёт посередине между сушей и водой, как в правилах.
export function shoreField(def, M) {
  const at = (i, j) => (M.isLand(i, j) ? 1 : 0);
  const bil = (x, y) => {
    const u = x - 0.5,
      w = y - 0.5,
      i = Math.floor(u),
      j = Math.floor(w),
      fx = u - i,
      fy = w - j;
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  };
  const k = 0.3;
  return (x, y) => (bil(x - k, y - k) + bil(x + k, y - k) + bil(x - k, y + k) + bil(x + k, y + k)) / 4;
}
// Высота земли по «сколько суши»: под водой −0.45, на суше 0.3; кромка воды — около 0.53
export const landHeight = (v) => -0.45 + 0.75 * smooth(v, 0.2, 0.8);
const smooth = (x, a, b) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
