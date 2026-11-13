// Логика «Волшебного клубочка» без графики: генератор лабиринтов, правила бега, проверка уровней.
// Клетки w×h, между соседями — стенка или проход (биты open: 0 — север/вверх, 1 — восток, 2 — юг, 3 — запад).
// Котёнок бежит в выбранную сторону по коридору сам, на развилке, в тупике, у ключа, кнопки и выхода
// останавливается. На льду скользит прямо до стенки. Ворота открывает ключ своего цвета, кнопка
// переключает мостики своего цвета. Проверяется tests/maze.mjs.

export const DX = [0, 1, 0, -1],
  DY = [-1, 0, 1, 0];
export const opp = (d) => (d + 2) & 3;
export const COLORS = ["red", "blue", "green"];

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blank(w, h) {
  const n = w * h;
  return { w, h, n, open: new Uint8Array(n), ice: new Uint8Array(n), block: new Uint8Array(n), start: 0, exit: 0, items: [], keys: [], doors: [], buttons: [], bridges: [], rooms: [], dark: false };
}
export const xy = (m, c) => [c % m.w, (c / m.w) | 0];
export function nb(m, c, d) {
  const x = (c % m.w) + DX[d],
    y = ((c / m.w) | 0) + DY[d];
  return x < 0 || y < 0 || x >= m.w || y >= m.h ? -1 : y * m.w + x;
}
export const isOpen = (m, c, d) => (m.open[c] >> d) & 1;
export function link(m, a, d) {
  m.open[a] |= 1 << d;
  m.open[nb(m, a, d)] |= 1 << opp(d);
}
function unlink(m, a, d) {
  const b = nb(m, a, d);
  m.open[a] &= ~(1 << d);
  if (b >= 0) m.open[b] &= ~(1 << opp(d));
}
export const degree = (m, c) => ((m.open[c] & 1) + ((m.open[c] >> 1) & 1) + ((m.open[c] >> 2) & 1) + ((m.open[c] >> 3) & 1));
// Направление от клетки a к соседней b
export const dirTo = (m, a, b) => [0, 1, 2, 3].find((d) => nb(m, a, d) === b);
// Ребро между клетками — одно число для обеих сторон
export const edge = (m, c, d) => (d === 1 || d === 2 ? c * 4 + d : nb(m, c, d) * 4 + opp(d));

// Все клетки, куда можно дойти по проходам (без учёта ворот и мостиков)
function bfs(m, from, blocked = null) {
  const dist = new Int32Array(m.n).fill(-1),
    prev = new Int32Array(m.n).fill(-1);
  const q = [from];
  dist[from] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    for (let d = 0; d < 4; d++) {
      if (!isOpen(m, c, d)) continue;
      if (blocked && blocked.has(edge(m, c, d))) continue;
      const b = nb(m, c, d);
      if (dist[b] >= 0 || m.block[b]) continue;
      dist[b] = dist[c] + 1;
      prev[b] = c;
      q.push(b);
    }
  }
  return { dist, prev };
}
function pathTo(prev, to) {
  const p = [to];
  while (prev[p[0]] >= 0) p.unshift(prev[p[0]]);
  return p;
}

// ---------- Генератор ----------
// Лабиринт «с возвратом»: длинные извилистые коридоры, без петель
function carve(m, r, from, straight = 0.3) {
  const seen = new Uint8Array(m.n);
  const stack = [{ c: from, d: -1 }];
  seen[from] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const opts = [0, 1, 2, 3].filter((d) => {
      const b = nb(m, top.c, d);
      return b >= 0 && !seen[b] && !m.block[b];
    });
    if (!opts.length) {
      stack.pop();
      continue;
    }
    // Немного чаще прямо — коридоры длиннее, развилок меньше
    const d = opts.includes(top.d) && r() < straight ? top.d : opts[(r() * opts.length) | 0];
    link(m, top.c, d);
    const b = nb(m, top.c, d);
    seen[b] = 1;
    stack.push({ c: b, d });
  }
}
// Часть тупиков соединяется с соседями — появляются петли
function braid(m, r, p, keep) {
  for (let c = 0; c < m.n; c++) {
    if (m.block[c] || keep.has(c) || degree(m, c) !== 1 || r() >= p) continue;
    const opts = [0, 1, 2, 3].filter((d) => {
      const b = nb(m, c, d);
      return b >= 0 && !isOpen(m, c, d) && !m.block[b] && !keep.has(b);
    });
    if (!opts.length) continue;
    const dead = opts.filter((d) => degree(m, nb(m, c, d)) === 1);
    const pick = dead.length ? dead : opts;
    link(m, c, pick[(r() * pick.length) | 0]);
  }
}
// Ледяные залы: прямоугольник без внутренних стен, внутри — сугроб, об который можно остановиться
function addRooms(m, r, count, keep) {
  for (let k = 0, tries = 0; k < count && tries < 80; tries++) {
    const rw = 3 + (r() < 0.5 ? 1 : 0),
      rh = 3 + (r() < 0.4 ? 1 : 0);
    if (rw > m.w || rh > m.h - 1) continue;
    const x0 = (r() * (m.w - rw + 1)) | 0,
      y0 = (r() * (m.h - rh + 1)) | 0;
    const cells = [];
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) cells.push(y * m.w + x);
    // Не трогаем старт, выход и другие залы (между залами — хотя бы одна клетка)
    const near = (c) => m.rooms.some((room) => room.cells.some((o) => Math.abs(xy(m, o)[0] - xy(m, c)[0]) <= 1 && Math.abs(xy(m, o)[1] - xy(m, c)[1]) <= 1));
    if (cells.some((c) => keep.has(c) || near(c))) continue;
    for (const c of cells) {
      m.ice[c] = 1;
      for (const d of [1, 2]) {
        const b = nb(m, c, d);
        if (b >= 0 && cells.includes(b)) link(m, c, d);
      }
    }
    // Сугробы: внутри зала, без выходов наружу (иначе отрежут коридор)
    const inner = cells.filter((c) => {
      const [x, y] = xy(m, c);
      return [0, 1, 2, 3].every((d) => !isOpen(m, c, d) || cells.includes(nb(m, c, d))) && !(x === x0 && y === y0);
    });
    const blocks = Math.min(inner.length, rw * rh >= 12 ? 2 : 1);
    for (let i = 0; i < blocks; i++) {
      const c = inner.splice((r() * inner.length) | 0, 1)[0];
      for (let d = 0; d < 4; d++) unlink(m, c, d);
      m.block[c] = 1;
      m.ice[c] = 0;
    }
    m.rooms.push({ x0, y0, w: rw, h: rh, cells: cells.filter((c) => !m.block[c]) });
    k++;
  }
  return m.rooms.length === count;
}
// Ворота на главной дороге и ключи до них — в боковых ветках
function placeDoors(m, r, k) {
  const path = pathTo(bfs(m, m.start).prev, m.exit);
  if (path.length < 3 * (k + 1)) return false;
  const used = new Set();
  for (let i = 1; i <= k; i++) {
    let j = Math.round((path.length * i) / (k + 1) + (r() - 0.5) * (path.length / (k + 1)) * 0.6);
    j = Math.max(2, Math.min(path.length - 3, j));
    while (used.has(j) || used.has(j - 1) || used.has(j + 1)) j++;
    if (j > path.length - 3) return false;
    used.add(j);
    const a = path[j],
      b = path[j + 1];
    m.doors.push({ color: i - 1, a, d: dirTo(m, a, b), b, at: j });
  }
  m.doors.sort((p, q) => p.at - q.at).forEach((door, i) => (door.color = i));
  const onPath = new Set(path);
  // Ключ i — там, куда можно дойти, открыв ворота до i-х
  let before = new Set();
  for (let i = 0; i < k; i++) {
    const closed = new Set(m.doors.slice(i).map((door) => edge(m, door.a, door.d)));
    const { dist } = bfs(m, m.start, closed);
    const region = [];
    for (let c = 0; c < m.n; c++) if (dist[c] >= 0) region.push(c);
    const fresh = region.filter((c) => !before.has(c) && c !== m.start && c !== m.exit && !m.keys.some((key) => key.cell === c));
    // Глубина ветки: насколько далеко от главной дороги
    const prev = bfs(m, m.start).prev;
    const depth = (c) => {
      let p = c,
        steps = 0;
      while (!onPath.has(p) && prev[p] >= 0) {
        p = prev[p];
        steps++;
      }
      return steps;
    };
    let cand = fresh.filter((c) => !onPath.has(c));
    if (!cand.length) return false;
    cand.sort((a, b) => depth(b) + (degree(m, b) === 1 ? 1.5 : 0) - depth(a) - (degree(m, a) === 1 ? 1.5 : 0) + (r() - 0.5));
    m.keys.push({ color: i, cell: cand[0] });
    before = new Set(region);
  }
  return true;
}
// Мостики и кнопки (облака): кнопка переключает все мостики своего цвета
function placeBridges(m, r, colors) {
  const corridor = [];
  for (let c = 0; c < m.n; c++) if (degree(m, c) === 2 && c !== m.start && c !== m.exit && nb(m, m.start, 0) !== c) corridor.push(c);
  const free = [];
  for (let c = 0; c < m.n; c++) if (!m.block[c] && c !== m.start && c !== m.exit) free.push(c);
  const taken = new Set();
  const take = (list) => {
    const ok = list.filter((c) => !taken.has(c));
    if (!ok.length) return -1;
    const c = ok[(r() * ok.length) | 0];
    taken.add(c);
    return c;
  };
  for (let color = 0; color < colors; color++) {
    const button = take(free);
    if (button < 0) return false;
    m.buttons.push({ color, cell: button });
    const count = 1 + (r() < 0.6 ? 1 : 0) + (colors === 1 && r() < 0.4 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const c = take(corridor);
      if (c < 0) return false;
      m.bridges.push({ color, cell: c, up0: i > 0 && r() < 0.5 });
    }
  }
  return true;
}

// ---------- Правила хода ----------
// Состояние: где котёнок, какие ключи у него, какие ворота открыты, какие кнопки переключены
export const startState = (m) => ({ cell: m.start, keys: 0, opened: 0, flip: 0 });
const index = (m) => {
  if (m._ix) return m._ix;
  const door = new Map(),
    key = new Map(),
    button = new Map(),
    bridge = new Map(),
    item = new Map();
  m.doors.forEach((x, i) => door.set(edge(m, x.a, x.d), i));
  m.keys.forEach((x, i) => key.set(x.cell, i));
  m.buttons.forEach((x, i) => button.set(x.cell, i));
  m.bridges.forEach((x, i) => bridge.set(x.cell, i));
  m.items.forEach((c, i) => item.set(c, i));
  return (m._ix = { door, key, button, bridge, item });
};
export const reindex = (m) => {
  m._ix = null;
  return index(m);
};
export const bridgeUp = (m, s, b) => (m.bridges[b].up0 ? 1 : 0) ^ ((s.flip >> m.bridges[b].color) & 1);
// Можно ли шагнуть из клетки c в сторону d: ok | door (откроется ключом) | locked | gap (мостик убран) | wall
export function pass(m, s, c, d) {
  if (!isOpen(m, c, d)) return "wall";
  const b = nb(m, c, d);
  if (b < 0 || m.block[b]) return "wall";
  const ix = index(m);
  const di = ix.door.get(edge(m, c, d));
  if (di !== undefined && !((s.opened >> m.doors[di].color) & 1)) return (s.keys >> m.doors[di].color) & 1 ? "door" : "locked";
  const bi = ix.bridge.get(b);
  if (bi !== undefined && !bridgeUp(m, s, bi)) return "gap";
  return "ok";
}
// Куда из клетки видно дорогу (закрытые ворота тоже дорога — котёнок добежит до них)
export function ways(m, s, c) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const p = pass(m, s, c, d);
    if (p === "ok" || p === "door" || p === "locked") out.push(d);
  }
  return out;
}
// Пробежка в сторону d. path — клетки по порядку (без стартовой), events — что случилось на какой клетке
export function run(m, s0, d) {
  const ix = index(m);
  const s = { ...s0 };
  let cur = s.cell,
    dir = d;
  const first = pass(m, s, cur, dir);
  if (first === "wall" || first === "gap") return { ok: false, why: first };
  if (first === "locked") return { ok: false, why: "locked", color: m.doors[ix.door.get(edge(m, cur, dir))].color };
  const path = [],
    events = [],
    slide = [];
  let stop = "fork";
  for (let guard = 0; guard < m.n * 4; guard++) {
    const p = pass(m, s, cur, dir);
    if (p === "door") {
      const door = m.doors[ix.door.get(edge(m, cur, dir))];
      s.opened |= 1 << door.color;
      events.push({ type: "door", at: path.length, color: door.color, door });
    }
    slide.push(!!m.ice[cur]);
    cur = nb(m, cur, dir);
    path.push(cur);
    const at = path.length - 1;
    if (ix.item.has(cur)) events.push({ type: "item", at, item: ix.item.get(cur) });
    const ki = ix.key.get(cur);
    if (ki !== undefined && !((s.keys >> m.keys[ki].color) & 1)) {
      s.keys |= 1 << m.keys[ki].color;
      events.push({ type: "key", at, color: m.keys[ki].color });
      stop = "key";
      break;
    }
    const bi = ix.button.get(cur);
    if (bi !== undefined) {
      s.flip ^= 1 << m.buttons[bi].color;
      events.push({ type: "button", at, color: m.buttons[bi].color });
      stop = "button";
      break;
    }
    if (cur === m.exit) {
      events.push({ type: "exit", at });
      stop = "exit";
      break;
    }
    if (cur === s0.cell) break; // круг без развилок
    if (m.ice[cur]) {
      // Лёд: дальше прямо, пока можно
      const q = pass(m, s, cur, dir);
      if (q === "ok" || q === "door") continue;
      if (q === "locked") events.push({ type: "locked", at, color: m.doors[ix.door.get(edge(m, cur, dir))].color });
      stop = "ice";
      break;
    }
    const w = ways(m, s, cur);
    const fwd = w.filter((e) => e !== opp(dir));
    if (w.length === 2 && fwd.length === 1) {
      // Коридор: поворачиваем сами
      dir = fwd[0];
      const q = pass(m, s, cur, dir);
      if (q === "locked") {
        events.push({ type: "locked", at, color: m.doors[ix.door.get(edge(m, cur, dir))].color });
        stop = "locked";
        break;
      }
      continue;
    }
    stop = w.length <= 1 ? "dead" : "fork";
    if (w.length <= 1) events.push({ type: "dead", at });
    break;
  }
  s.cell = cur;
  return { ok: true, path, events, st: s, stop, slide };
}

// Ниточка: клетки от старта до котёнка без петель. Шаг назад по нитке сматывает её
export function threadStep(stack, cell) {
  const k = stack.indexOf(cell);
  if (k >= 0) stack.length = k + 1;
  else stack.push(cell);
  return stack;
}

// ---------- Поиск по ходам ----------
const code = (m, s) => s.cell + m.n * (s.keys | (s.opened << 3) | (s.flip << 6));
// Все состояния, до которых можно добежать, и ходы между ними
export function explore(m, from = startState(m), opts = {}) {
  const seen = new Map(),
    order = [],
    edges = [];
  const cover = new Uint8Array(m.n);
  cover[from.cell] = 1;
  const add = (s) => {
    const k = code(m, s);
    if (seen.has(k)) return seen.get(k);
    const i = order.length;
    seen.set(k, i);
    order.push(s);
    edges.push([]);
    return i;
  };
  add(from);
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (s.cell === m.exit) continue;
    for (let d = 0; d < 4; d++) {
      const r = run(m, s, d);
      if (!r.ok) continue;
      if (opts.noKeys && r.events.some((e) => e.type === "door")) continue;
      if (opts.noButtons && r.events.some((e) => e.type === "button")) continue;
      for (const c of r.path) cover[c] = 1;
      const j = add(r.st);
      edges[i].push({ to: j, d, cost: r.path.length });
    }
  }
  return { order, edges, cover, seen };
}
// Кратчайший путь до выхода: по клеткам, каждая остановка чуть дороже
export function guide(m, from) {
  const g = explore(m, from);
  const n = g.order.length;
  const best = new Float64Array(n).fill(Infinity),
    prev = new Int32Array(n).fill(-1),
    how = new Int8Array(n).fill(-1);
  best[0] = 0;
  const done = new Uint8Array(n);
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0) return null;
    if (g.order[u].cell === m.exit) {
      const runs = [];
      for (let v = u; prev[v] >= 0; v = prev[v]) runs.unshift({ d: how[v], from: g.order[prev[v]] });
      return runs.map((x) => ({ ...x, run: run(m, x.from, x.d) }));
    }
    done[u] = 1;
    for (const e of g.edges[u]) {
      const c = best[u] + e.cost + 1;
      if (c < best[e.to]) {
        best[e.to] = c;
        prev[e.to] = u;
        how[e.to] = e.d;
      }
    }
  }
}

// Проверка лабиринта: выход достижим, ни из какого места не застрять, всё нужное нужно
export function analyze(m) {
  const g = explore(m);
  const problems = [];
  const goals = [];
  g.order.forEach((s, i) => s.cell === m.exit && goals.push(i));
  if (!goals.length) problems.push("до выхода не добраться");
  // Из каждого места, куда можно попасть, выход должен быть достижим (нет ловушек)
  const back = g.order.map(() => []);
  g.edges.forEach((list, i) => list.forEach((e) => back[e.to].push(i)));
  const can = new Uint8Array(g.order.length);
  const q = [...goals];
  for (const i of q) can[i] = 1;
  for (let k = 0; k < q.length; k++) for (const p of back[q[k]]) if (!can[p]) (can[p] = 1), q.push(p);
  const traps = g.order.filter((s, i) => !can[i]);
  if (traps.length) problems.push(`ловушка: из клетки ${traps[0].cell} выхода нет`);
  // Ключи и кнопки должны быть нужны
  if (m.doors.length && explore(m, startState(m), { noKeys: true }).order.some((s) => s.cell === m.exit)) problems.push("выход достижим без ключей");
  if (m.buttons.length && explore(m, startState(m), { noButtons: true }).order.some((s) => s.cell === m.exit)) problems.push("выход достижим без кнопок");
  for (const key of m.keys) if (!g.cover[key.cell]) problems.push("ключ не достать");
  for (const b of m.buttons) if (!g.cover[b.cell]) problems.push("кнопку не нажать");
  let free = 0,
    covered = 0;
  for (let c = 0; c < m.n; c++)
    if (!m.block[c]) {
      free++;
      if (g.cover[c]) covered++;
    }
  const sol = goals.length ? guide(m, startState(m)) : null;
  return {
    ok: !problems.length,
    problems,
    states: g.order.length,
    cover: g.cover,
    coverage: covered / free,
    runs: sol ? sol.length : 0,
    cells: sol ? sol.reduce((s, x) => s + x.run.path.length, 0) : 0,
    solution: sol,
  };
}

// Собрать лабиринт по описанию уровня. Перебирает зёрна seed·1000+k, пока лабиринт не пройдёт проверку
export function build(spec) {
  for (let k = 0; k < 400; k++) {
    const m = generate(spec, spec.seed * 1000 + k);
    if (m) {
      m.seedUsed = spec.seed * 1000 + k;
      m.tries = k + 1;
      return m;
    }
  }
  throw new Error("не получилось собрать лабиринт " + spec.id);
}
export function generate(spec, seed) {
  const r = rng(seed);
  const m = blank(spec.w, spec.h);
  m.dark = !!spec.dark;
  m.start = (spec.h - 1) * spec.w + Math.floor(spec.w / 2);
  const keep = new Set([m.start]);
  for (let x = 0; x < spec.w; x++) keep.add(x); // верхний ряд — там выход
  if (spec.rooms && !addRooms(m, r, spec.rooms, keep)) return null;
  // Сначала залы (их клетки свободны для коридоров), потом коридоры через всё остальное
  carve(m, r, m.start, spec.straight ?? 0.3);
  for (let c = 0; c < m.n; c++) if (!m.block[c] && m.open[c] === 0) return null;
  // Выход — самая дальняя клетка верхнего ряда
  if (spec.braid) braid(m, r, spec.braid, new Set([m.start]));
  const { dist } = bfs(m, m.start);
  let ex = -1;
  for (let x = 0; x < spec.w; x++) if (!m.ice[x] && dist[x] >= 0 && (ex < 0 || dist[x] > dist[ex])) ex = x;
  if (ex < 0) return null;
  m.exit = ex;
  if (spec.ice) for (let c = 0; c < m.n; c++) if (!m.ice[c] && !m.block[c] && c !== m.start && c !== m.exit && degree(m, c) === 2 && r() < spec.ice) m.ice[c] = 1;
  if (spec.keys && !placeDoors(m, r, spec.keys)) return null;
  if (spec.colors && !placeBridges(m, r, spec.colors)) return null;
  reindex(m);
  const a = analyze(m);
  if (!a.ok) return null;
  // Дорога до выхода не слишком короткая, ледяные залы и лёд по-настоящему нужны
  if (a.cells < Math.max(4, spec.w * spec.h * (spec.minPath ?? 0.28))) return null;
  if (a.coverage < 0.999) return null;
  // Не слишком запутанно: мест, где можно остановиться (с учётом ключей и кнопок), не больше заданного
  if (spec.maxStates && a.states > spec.maxStates) return null;
  if (spec.rooms && !a.solution.some((x) => x.run.path.some((c) => m.ice[c]))) return null;
  if (spec.colors && a.solution.filter((x) => x.run.events.some((e) => e.type === "button")).length < Math.min(spec.colors, 2)) return null;
  m.solution = a;
  placeItems(m, r, spec.items || 0, a);
  reindex(m);
  return m;
}
// Угощения: в тупиках подальше от дороги к выходу, потом в любых клетках в стороне
function placeItems(m, r, count, a) {
  const main = new Set([m.start]);
  for (const x of a.solution) for (const c of x.run.path) main.add(c);
  const busy = new Set([m.start, m.exit, ...m.keys.map((k) => k.cell), ...m.buttons.map((b) => b.cell), ...m.bridges.map((b) => b.cell)]);
  const { dist } = bfs(m, m.start);
  const cand = [];
  for (let c = 0; c < m.n; c++) {
    if (m.block[c] || busy.has(c) || !a.cover[c]) continue;
    const score = (main.has(c) ? 0 : 6) + (degree(m, c) === 1 ? 4 : 0) + dist[c] * 0.15 + r() * 2;
    cand.push({ c, score });
  }
  cand.sort((p, q) => q.score - p.score);
  const out = [];
  for (const { c } of cand) {
    if (out.length >= count) break;
    // Не рядом друг с другом
    if (out.some((o) => Math.abs(xy(m, o)[0] - xy(m, c)[0]) + Math.abs(xy(m, o)[1] - xy(m, c)[1]) < 2)) continue;
    out.push(c);
  }
  m.items = out;
}
