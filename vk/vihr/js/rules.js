// Правила «Вихря»: карты, предметы, вихри, поглощение и боты.
// Ни графики, ни DOM: тесты в Node гоняют здесь целые раунды.

export const TAU = Math.PI * 2;
export const GAIN = 0.11; // прибавка к R² за предмет: need² × GAIN
export const EAT = 1.18; // во сколько раз надо быть шире соперника, чтобы втянуть его
export const BASE_TIME = 120; // секунд в раунде без улучшений
export const RESPAWN = 3; // через сколько секунд втянутый вихрь возвращается
export const SHIELD = 3; // секунд защиты после возвращения
export const BACK_TIME = 26; // через сколько возвращаются мелочи и животные
export const CELL = 6; // ячейка сетки поиска, м

// Генератор случайных чисел с зерном: одинаковое зерно — одинаковый раунд
export function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- Предметы ----------
// need — какой радиус вихря нужен, чтобы поднять; size — радиус следа на земле; h — высота.
// walk — скорость бега (животные и машинки сами ходят и убегают от вихря), roam — как далеко от дома,
// water — стоит на воде, bob — качается (шарики, лодки), spin — у модели крутится деталь,
// paint — у модели есть часть, которую красят по-разному, puff — чем «пыхает» на вершине вихря.
// мелочи и все животные со временем возвращаются на карту
const K = (id, name, need, size, h, extra = {}) => ({ id, name, need, size, h, back: need <= 1.6 || !!extra.walk, ...extra });

export const MAPS = [
  {
    id: "farm",
    name: "Ферма",
    note: "Курицы, тюки сена, коровы и мельницы",
    half: 66,
    bots: ["easy", "easy", "easy", "medium"],
    botR: 1,
    botSpeed: 1,
    botPull: 1,
    kinds: [
      K("chicken", "Курица", 0.55, 0.3, 0.55, { walk: 2.6, roam: 4, puff: "feather", voice: "cluck" }),
      K("pumpkin", "Тыква", 0.62, 0.36, 0.5),
      K("fence", "Забор", 0.9, 0.5, 0.9),
      K("bale", "Тюк сена", 1.15, 0.62, 0.95, { puff: "hay" }),
      K("sheep", "Овечка", 1.3, 0.55, 0.95, { walk: 1.8, roam: 4, puff: "wool", voice: "baa" }),
      K("cow", "Корова", 1.9, 1.0, 1.55, { walk: 1.3, roam: 3.5, voice: "moo" }),
      K("tree", "Яблоня", 2.4, 1.0, 4.2, { puff: "leaf" }),
      K("tractor", "Трактор", 2.9, 1.3, 2.3, { paint: true }),
      K("shed", "Сарай", 3.7, 1.8, 3.2),
      K("house", "Домик", 5, 2.8, 5.2, { paint: true }),
      K("barn", "Амбар", 6.6, 3.6, 6.6),
      K("tower", "Водокачка", 8.4, 2.6, 11),
      K("mill", "Мельница", 10.5, 3.2, 12.5, { spin: true }),
    ],
    blocks: { pen: 5, yard: 4, barnyard: 3, field: 4, garden: 3, orchard: 2, mill: 2, tower: 2 },
  },
  {
    id: "town",
    name: "Городок",
    note: "Скамейки, машины, автобусы и башня с часами",
    half: 70,
    bots: ["easy", "medium", "medium", "medium"],
    botR: 1.1,
    botSpeed: 1.05,
    botPull: 1.08,
    kinds: [
      K("cone", "Конус", 0.5, 0.26, 0.7, { puff: "star" }),
      K("bin", "Урна", 0.65, 0.3, 0.9),
      K("mailbox", "Почтовый ящик", 0.8, 0.3, 1.25, { puff: "paper" }),
      K("bench", "Скамейка", 0.95, 0.7, 0.8),
      K("bike", "Велосипед", 1.1, 0.6, 1, { paint: true }),
      K("lamp", "Фонарь", 1.35, 0.26, 4),
      K("car", "Машина", 2.2, 1.2, 1.5, { paint: true }),
      K("ttree", "Липа", 2.5, 0.9, 5, { puff: "leaf" }),
      K("kiosk", "Киоск", 3.3, 1.6, 3, { paint: true, puff: "paper" }),
      K("bus", "Автобус", 4.3, 2.4, 3.2, { paint: true }),
      K("house2", "Дом", 5.5, 3, 6.2, { paint: true }),
      K("shop", "Магазин", 6.7, 3.6, 5.2, { paint: true }),
      K("block", "Многоэтажка", 8.6, 4, 14),
      K("clock", "Башня с часами", 10.6, 3.5, 18),
    ],
    blocks: { houses: 7, shops: 5, park: 5, parking: 4, block: 3, square: 1 },
  },
  {
    id: "port",
    name: "Порт",
    note: "Ящики, лодки, контейнеры и настоящий теплоход",
    half: 70,
    bots: ["medium", "medium", "hard", "medium", "hard"],
    botR: 1.15,
    botSpeed: 1.08,
    botPull: 1.12,
    kinds: [
      K("gull", "Чайка", 0.5, 0.25, 0.45, { walk: 2.2, roam: 4, puff: "feather", voice: "gull" }),
      K("crate", "Ящик", 0.7, 0.4, 0.8),
      K("barrel", "Бочка", 0.85, 0.4, 1, { paint: true }),
      K("buoy", "Буёк", 1, 0.45, 1.4, { water: true, bob: true }),
      K("pallet", "Штабель", 1.4, 0.7, 1.4),
      K("rowboat", "Лодка", 1.9, 1.1, 0.8, { water: true, bob: true, paint: true }),
      K("forklift", "Погрузчик", 2.5, 1.1, 2.2),
      K("container", "Контейнер", 3.3, 1.8, 2.6, { paint: true }),
      K("truck", "Грузовик", 4, 2.2, 3, { paint: true }),
      K("yacht", "Катер", 4.8, 2.6, 3, { water: true, bob: true }),
      K("warehouse", "Склад", 6.6, 3.8, 6),
      K("crane", "Портовый кран", 8.6, 3, 14),
      K("lighthouse", "Маяк", 10.2, 2.6, 16),
      K("ship", "Теплоход", 12.2, 5, 7, { water: true, bob: true }),
    ],
    blocks: { sea: 5, basin: 2, crane: 3, lighthouse: 1, warehouse: 4, containers: 5, dock: 5 },
  },
  {
    id: "park",
    name: "Парк аттракционов",
    note: "Шарики, батуты, карусели и колесо обозрения",
    half: 66,
    bots: ["hard", "hard", "medium", "hard", "hard"],
    botR: 1.25,
    botSpeed: 1.11,
    botPull: 1.2,
    kinds: [
      K("balloon", "Шарик", 0.5, 0.25, 1.7, { bob: true, paint: true, puff: "star" }),
      K("duck", "Уточка", 0.6, 0.3, 0.5, { water: true, walk: 1.2, roam: 3, bob: true, voice: "quack" }),
      K("icecream", "Мороженое", 0.75, 0.4, 1.3, { puff: "star" }),
      K("pbench", "Скамейка", 0.95, 0.7, 0.8),
      K("bush", "Кустик", 1.15, 0.6, 1, { puff: "leaf" }),
      K("popcorn", "Попкорн", 1.5, 0.7, 1.8, { puff: "pop" }),
      K("bumper", "Машинка", 2, 1, 1.2, { walk: 2.2, roam: 5, paint: true }),
      K("trampoline", "Батут", 2.8, 1.4, 1),
      K("tent", "Шатёр", 3.6, 1.9, 3.6, { paint: true }),
      K("cups", "Чашки", 4.6, 2.5, 2.2, { spin: true }),
      K("carousel", "Карусель", 6, 3.3, 5, { spin: true }),
      K("castle", "Надувной замок", 7.6, 3.8, 6),
      K("swing", "Цепочная карусель", 9.2, 3.4, 11, { spin: true }),
      K("ferris", "Колесо обозрения", 11.6, 4.2, 18, { spin: true }),
    ],
    blocks: { pond: 3, autodrom: 3, food: 5, rides: 3, tents: 3, carousel: 3, castle: 2, swing: 2, ferris: 1 },
  },
];
for (const map of MAPS) {
  map.kindIndex = Object.fromEntries(map.kinds.map((k, i) => [k.id, i]));
  map.maxSize = Math.max(...map.kinds.map((k) => k.size));
}

// ---------- Раскладка карты ----------
const RIGHT = Math.PI / 2;
const rectOf = (x0, z0, x1, z1) => ({ x0, z0, x1, z1, w: x1 - x0, h: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
const inset = (r, m) => rectOf(r.x0 + m, r.z0 + m, r.x1 - m, r.z1 - m);

class Builder {
  constructor(map, rand) {
    this.map = map;
    this.rand = rand;
    this.half = map.half;
    this.objs = [];
    this.patches = [];
    this.roads = [];
    this.water = [];
    this.cells = new Map();
  }
  pick(list) {
    return list[Math.floor(this.rand() * list.length)];
  }
  int(a, b) {
    return a + Math.floor(this.rand() * (b - a + 1));
  }
  turn() {
    return this.pick([0, RIGHT, Math.PI, -RIGHT]) + (this.rand() - 0.5) * 0.2;
  }
  patch(type, r, extra = {}) {
    const p = { type, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, ...extra };
    this.patches.push(p);
    if (type === "water" || type === "pond") this.water.push(p);
    return p;
  }
  wet(x, z) {
    for (const w of this.water) {
      if (w.round) {
        const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2, r = (w.x1 - w.x0) / 2;
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
      } else if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1) return true;
    }
    return false;
  }
  fits(kind, x, z, s, pad) {
    const lim = this.half - 1.2;
    if (Math.abs(x) + s * 0.6 > lim || Math.abs(z) + s * 0.6 > lim) return false;
    const wantWet = !!kind.water;
    const probe = Math.max(0.2, s * 0.8);
    for (const [dx, dz] of [[0, 0], [probe, 0], [-probe, 0], [0, probe], [0, -probe]]) {
      if (this.wet(x + dx, z + dz) !== wantWet) return false;
    }
    const c = 8, cx = Math.floor(x / c), cz = Math.floor(z / c), reach = Math.ceil((s + this.map.maxSize + pad) / c);
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cz - reach; j <= cz + reach; j++) {
        const list = this.cells.get(i * 4096 + j);
        if (!list) continue;
        for (const o of list) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.size + s + pad) ** 2) return false;
      }
    }
    return true;
  }
  put(id, x, z, rot = this.rand() * TAU, pad = 0.25) {
    const k = this.map.kindIndex[id];
    if (k === undefined) throw new Error("Нет такого предмета на карте: " + id);
    const kind = this.map.kinds[k];
    const scale = 0.92 + this.rand() * 0.16;
    const size = kind.size * scale;
    if (!this.fits(kind, x, z, size, pad)) return null;
    const o = { k, x, z, rot, scale, size, tint: Math.floor(this.rand() * 6) };
    this.objs.push(o);
    const key = Math.floor(x / 8) * 4096 + Math.floor(z / 8);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(o);
    return o;
  }
  // n штук в случайных местах прямоугольника
  scatter(id, n, r, rot) {
    let made = 0;
    for (let tries = 0; made < n && tries < n * 14; tries++) {
      const x = r.x0 + this.rand() * r.w, z = r.z0 + this.rand() * r.h;
      if (this.put(id, x, z, rot ?? this.rand() * TAU)) made++;
    }
    return made;
  }
  grid(id, cols, rows, r, rot = 0, jitter = 0.3) {
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = r.x0 + (r.w * (i + 0.5)) / cols + (this.rand() - 0.5) * jitter;
        const z = r.z0 + (r.h * (j + 0.5)) / rows + (this.rand() - 0.5) * jitter;
        this.put(id, x, z, rot + (this.rand() - 0.5) * 0.12);
      }
    }
  }
  // ряд вдоль отрезка: модель длинной стороной (ось X) вдоль линии
  line(id, x0, z0, x1, z1, step, skip = () => false) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(len / step));
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      if (skip(i, n)) continue;
      const u = (i + 0.5) / n;
      this.put(id, x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, rot, 0.05);
    }
  }
  // забор вокруг прямоугольника с калиткой
  ring(id, r, step, gate) {
    const sides = [
      [r.x0, r.z0, r.x1, r.z0],
      [r.x1, r.z0, r.x1, r.z1],
      [r.x1, r.z1, r.x0, r.z1],
      [r.x0, r.z1, r.x0, r.z0],
    ];
    sides.forEach(([a, b, c, d], s) => this.line(id, a, b, c, d, step, (i, n) => s === gate && Math.abs(i - (n - 1) / 2) < 1));
  }
}

// Готовые кварталы для каждой карты. b — строитель, r — прямоугольник квартала.
const PREFABS = {
  farm: {
    pen(b, r) {
      const p = inset(r, 1.6);
      b.patch("pen", p);
      b.ring("fence", p, 2.1, b.int(0, 3));
      const inside = inset(p, 1.8);
      if (b.rand() < 0.5) b.scatter("cow", b.int(3, 4), inside);
      else b.scatter("sheep", b.int(5, 7), inside);
      b.scatter("bale", b.int(1, 2), inside);
      b.scatter("chicken", 2, inside);
    },
    yard(b, r) {
      b.patch("yard", inset(r, 1));
      b.put("house", r.cx - r.w * 0.17, r.cz - r.h * 0.12, b.turn());
      b.put("shed", r.cx + r.w * 0.26, r.cz + r.h * 0.22, b.turn());
      b.put("tractor", r.cx + r.w * 0.22, r.cz - r.h * 0.26, b.rand() * TAU);
      b.scatter("tree", 2, inset(r, 2));
      b.scatter("chicken", b.int(6, 9), inset(r, 2));
      b.scatter("pumpkin", b.int(3, 5), inset(r, 2));
      b.scatter("fence", 2, inset(r, 2), b.turn());
    },
    barnyard(b, r) {
      b.patch("yard", inset(r, 1));
      b.put("barn", r.cx, r.cz - r.h * 0.08, b.turn());
      b.scatter("bale", b.int(4, 6), inset(r, 1.8));
      b.scatter("chicken", b.int(4, 6), inset(r, 1.8));
      b.scatter("cow", b.int(1, 2), inset(r, 2));
      b.scatter("tractor", 1, inset(r, 2.5));
      b.line("fence", r.x0 + 2, r.z1 - 1.6, r.x1 - 2, r.z1 - 1.6, 2.1, (i) => i % 4 === 3);
    },
    field(b, r) {
      const p = inset(r, 1.2);
      const across = b.rand() < 0.5;
      b.patch("field", p, { across });
      if (across) b.grid("bale", 3, 5, inset(p, 1.5), RIGHT, 0.6);
      else b.grid("bale", 5, 3, inset(p, 1.5), 0, 0.6);
      b.scatter("tractor", 1, inset(p, 2));
      b.scatter("chicken", 2, inset(p, 1));
    },
    garden(b, r) {
      const p = inset(r, 1.2);
      b.patch("garden", p);
      b.grid("pumpkin", 6, 5, inset(p, 1.2), 0, 0.5);
      b.put("tree", p.x0 + 1.5, p.z0 + 1.5);
      b.put("tree", p.x1 - 1.5, p.z1 - 1.5);
      b.scatter("chicken", 2, inset(p, 1));
    },
    orchard(b, r) {
      b.patch("yard", inset(r, 1));
      b.grid("tree", 3, 3, inset(r, 2.2), 0, 1.4);
      b.scatter("pumpkin", 4, inset(r, 1.5));
      b.scatter("sheep", 2, inset(r, 2));
    },
    mill(b, r) {
      b.patch("field", inset(r, 1.2), { across: b.rand() < 0.5 });
      b.put("mill", r.cx, r.cz, b.rand() * TAU);
      b.scatter("bale", 4, inset(r, 1.8));
      b.scatter("pumpkin", 4, inset(r, 1.8));
      b.scatter("chicken", 3, inset(r, 1.8));
    },
    tower(b, r) {
      b.patch("yard", inset(r, 1));
      b.put("tower", r.cx - r.w * 0.12, r.cz - r.h * 0.1, b.rand() * TAU);
      b.put("shed", r.cx + r.w * 0.27, r.cz + r.h * 0.22, b.turn());
      b.line("fence", r.x0 + 2, r.z1 - 1.6, r.cx, r.z1 - 1.6, 2.1);
      b.scatter("cow", 2, inset(r, 2.2));
      b.scatter("chicken", 2, inset(r, 2));
    },
    street(b, seg) {
      // вдоль просёлка: заборчики, тыквы, деревья, курицы
      for (const side of [-1, 1]) {
        if (b.rand() < 0.14) b.line("fence", ...seg.edge(side, -0.6), 2.1, () => b.rand() < 0.35);
        else {
          for (const u of [0.25, 0.6, 0.85]) {
            const [x, z] = seg.at(u + (b.rand() - 0.5) * 0.1, side, 0.9);
            const roll = b.rand();
            if (roll < 0.3) b.put("tree", x + side * seg.nx * 0.8, z + side * seg.nz * 0.8);
            else if (roll < 0.6) b.put("pumpkin", x, z);
            else if (roll < 0.8) b.put("chicken", x, z);
          }
        }
      }
    },
  },
  town: {
    houses(b, r) {
      b.patch("lawn", inset(r, 1.2));
      const across = r.w > r.h;
      b.put("house2", r.cx - r.w * 0.22, r.cz - (across ? 0 : r.h * 0.2), b.turn());
      b.put("house2", r.cx + r.w * 0.22, r.cz + (across ? 0 : r.h * 0.2), b.turn());
      b.scatter("ttree", b.int(2, 3), inset(r, 2));
      b.scatter("bike", 2, inset(r, 2));
      b.scatter("bin", 2, inset(r, 1.8));
      b.scatter("mailbox", 1, inset(r, 1.8));
      b.scatter("bench", 1, inset(r, 2));
    },
    shops(b, r) {
      b.patch("plaza", inset(r, 1));
      b.put("shop", r.cx, r.cz - r.h * 0.12, b.turn());
      b.scatter("kiosk", 1, inset(r, 2.5));
      b.scatter("bench", 2, inset(r, 1.8));
      b.scatter("bin", 2, inset(r, 1.6));
      b.scatter("bike", 3, inset(r, 1.8));
      b.scatter("cone", 2, inset(r, 1.6));
    },
    park(b, r) {
      b.patch("park", inset(r, 1.2));
      b.scatter("ttree", b.int(5, 7), inset(r, 2.4));
      b.line("bench", r.x0 + 3, r.cz, r.x1 - 3, r.cz, 4.5, (i) => i % 2 === 1);
      b.scatter("lamp", 3, inset(r, 2));
      b.scatter("bin", 2, inset(r, 2));
      b.scatter("bike", 1, inset(r, 2));
    },
    parking(b, r) {
      const p = inset(r, 1.2);
      b.patch("lot", p);
      b.grid("car", 2, 4, rectOf(p.x0 + 1, p.z0 + 1, p.x1 - 1, p.cz + 4), 0, 0.2);
      b.put("bus", p.cx, p.z1 - 3.4, 0);
      b.scatter("cone", b.int(3, 5), inset(p, 1));
      b.put("lamp", p.x0 + 0.8, p.z0 + 0.8);
      b.put("lamp", p.x1 - 0.8, p.z1 - 0.8);
    },
    block(b, r) {
      b.patch("plaza", inset(r, 1));
      b.put("block", r.cx, r.cz, b.turn());
      b.scatter("car", 2, inset(r, 1.8));
      b.scatter("ttree", 3, inset(r, 2));
      b.scatter("bench", 2, inset(r, 1.8));
      b.scatter("bin", 2, inset(r, 1.6));
    },
    square(b, r) {
      b.patch("square", inset(r, 1.2), { round: true });
      b.put("clock", r.cx, r.cz, b.turn());
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.put("lamp", r.cx + sx * r.w * 0.36, r.cz + sz * r.h * 0.36);
      b.scatter("bench", 4, inset(r, 2.2));
      b.scatter("kiosk", 2, inset(r, 2.6));
      b.scatter("bin", 2, inset(r, 2));
      b.scatter("bike", 2, inset(r, 2));
    },
    street(b, seg) {
      // фонари по тротуару, машины у обочины, конусы ремонта
      for (const side of [-1, 1]) {
        for (let u = 0.1; u < 0.95; u += 0.4) {
          if (b.rand() < 0.5) b.put("lamp", ...seg.at(u, side, -0.6));
        }
        if (b.rand() < 0.5) b.put(b.pick(["bin", "mailbox", "bench"]), ...seg.at(0.3 + b.rand() * 0.4, side, -0.7), seg.rot);
        for (let u = 0.2; u < 0.85; u += 0.2) if (b.rand() < 0.28) b.put("car", ...seg.at(u, side, 1.6), seg.rot + (side < 0 ? Math.PI : 0));
      }
      if (b.rand() < 0.3) for (let i = 0; i < 3; i++) b.put("cone", ...seg.at(0.4 + i * 0.07, b.pick([-1, 1]), 2.2));
    },
  },
  port: {
    sea(b, r) {
      b.scatter("yacht", b.int(1, 2), inset(r, 3));
      b.scatter("rowboat", 3, inset(r, 2));
      b.scatter("buoy", 4, inset(r, 1.5));
    },
    basin(b, r) {
      b.patch("water", r);
      b.scatter("yacht", 1, inset(r, 3));
      b.scatter("rowboat", b.int(2, 3), inset(r, 2));
      b.scatter("buoy", 3, inset(r, 1.5));
    },
    containers(b, r) {
      const p = inset(r, 1);
      b.patch("yard", p);
      b.grid("container", 2, 3, inset(p, 1.8), 0, 0.2);
      b.scatter("forklift", 1, inset(p, 1.5));
      b.scatter("crate", 4, inset(p, 1));
      b.scatter("pallet", 1, inset(p, 1.2));
    },
    warehouse(b, r) {
      b.patch("yard", inset(r, 1));
      b.put("warehouse", r.cx, r.cz - r.h * 0.1, b.turn());
      b.scatter("truck", 1, inset(r, 2.5));
      b.scatter("pallet", 2, inset(r, 1.5));
      b.scatter("crate", 4, inset(r, 1.2));
      b.scatter("barrel", 4, inset(r, 1.2));
      b.scatter("forklift", 1, inset(r, 1.5));
    },
    dock(b, r) {
      b.scatter("crate", 7, inset(r, 1));
      b.scatter("barrel", 6, inset(r, 1));
      b.scatter("pallet", 3, inset(r, 1.2));
      b.scatter("gull", 5, inset(r, 1));
      b.scatter("truck", 1, inset(r, 2.5));
      b.scatter("forklift", 1, inset(r, 1.5));
    },
    crane(b, r, near) {
      // кран стоит у края воды
      const x = near ? r.cx + near.x * (r.w * 0.3) : r.cx, z = near ? r.cz + near.z * (r.h * 0.3) : r.cz;
      b.put("crane", x, z, near && near.x ? RIGHT : 0);
      b.scatter("container", 2, inset(r, 2));
      b.scatter("crate", 4, inset(r, 1.2));
      b.scatter("barrel", 2, inset(r, 1.2));
      b.scatter("gull", 2, inset(r, 1));
    },
    lighthouse(b, r, near) {
      const x = near ? r.cx + near.x * (r.w * 0.3) : r.cx, z = near ? r.cz + near.z * (r.h * 0.3) : r.cz;
      b.patch("rock", rectOf(x - 5, z - 5, x + 5, z + 5), { round: true });
      b.put("lighthouse", x, z, 0);
      b.scatter("barrel", 3, inset(r, 1.2));
      b.scatter("gull", 4, inset(r, 1));
      b.scatter("crate", 3, inset(r, 1.2));
    },
    street(b, seg) {
      if (seg.wet) return;
      for (const side of [-1, 1]) {
        for (let u = 0.15; u < 0.9; u += 0.24) {
          const roll = b.rand();
          if (roll < 0.25) b.put("barrel", ...seg.at(u, side, -0.5));
          else if (roll < 0.45) b.put("crate", ...seg.at(u, side, -0.5));
          else if (roll < 0.58) b.put("gull", ...seg.at(u, side, 0.6));
        }
        if (b.rand() < 0.22) b.put("truck", ...seg.at(0.5, side, 1.4), seg.rot);
      }
    },
  },
  park: {
    pond(b, r) {
      const rad = Math.min(r.w, r.h) * 0.33;
      b.patch("pond", rectOf(r.cx - rad, r.cz - rad, r.cx + rad, r.cz + rad), { round: true });
      b.patch("lawn", inset(r, 1), { under: true });
      const inner = rectOf(r.cx - rad * 0.7, r.cz - rad * 0.7, r.cx + rad * 0.7, r.cz + rad * 0.7);
      b.scatter("duck", b.int(6, 8), inner);
      b.scatter("pbench", 3, inset(r, 1.4));
      b.scatter("bush", 4, inset(r, 1.4));
      b.scatter("balloon", 2, inset(r, 1.4));
    },
    autodrom(b, r) {
      const p = inset(r, 2);
      b.patch("arena", p);
      b.scatter("bumper", b.int(5, 7), inset(p, 1.5));
      for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]]) b.put("bush", x, z);
    },
    food(b, r) {
      b.patch("plaza", inset(r, 1));
      b.scatter("popcorn", 2, inset(r, 2));
      b.scatter("icecream", 4, inset(r, 1.6));
      b.scatter("pbench", 3, inset(r, 1.6));
      b.scatter("balloon", 6, inset(r, 1.4));
      b.scatter("bush", 2, inset(r, 1.4));
    },
    rides(b, r) {
      b.patch("plaza", inset(r, 1));
      b.put("cups", r.cx - r.w * 0.12, r.cz, 0);
      b.scatter("trampoline", 2, inset(r, 2));
      b.scatter("balloon", 4, inset(r, 1.4));
      b.scatter("pbench", 2, inset(r, 1.6));
      b.scatter("bush", 2, inset(r, 1.4));
    },
    tents(b, r) {
      b.patch("lawn", inset(r, 1));
      b.scatter("tent", 2, inset(r, 2.5));
      b.scatter("trampoline", 1, inset(r, 2));
      b.scatter("balloon", 5, inset(r, 1.4));
      b.scatter("icecream", 2, inset(r, 1.6));
      b.scatter("bush", 3, inset(r, 1.4));
    },
    carousel(b, r) {
      b.patch("round", inset(r, 1.5), { round: true });
      b.put("carousel", r.cx, r.cz, 0);
      b.scatter("pbench", 3, inset(r, 1.6));
      b.scatter("balloon", 4, inset(r, 1.4));
      b.scatter("bush", 2, inset(r, 1.4));
    },
    castle(b, r) {
      b.patch("lawn", inset(r, 1));
      b.put("castle", r.cx, r.cz, b.turn());
      b.scatter("balloon", 4, inset(r, 1.4));
      b.scatter("bush", 3, inset(r, 1.4));
      b.scatter("icecream", 2, inset(r, 1.6));
    },
    swing(b, r) {
      b.patch("round", inset(r, 1.5), { round: true });
      b.put("swing", r.cx, r.cz, 0);
      b.scatter("pbench", 2, inset(r, 1.6));
      b.scatter("bush", 2, inset(r, 1.4));
      b.scatter("balloon", 3, inset(r, 1.4));
    },
    ferris(b, r) {
      b.patch("plaza", inset(r, 1));
      b.put("ferris", r.cx, r.cz, b.rand() < 0.5 ? 0 : RIGHT);
      b.scatter("balloon", 6, inset(r, 1.4));
      b.scatter("pbench", 3, inset(r, 1.6));
      b.scatter("popcorn", 1, inset(r, 2));
    },
    street(b, seg) {
      for (const side of [-1, 1]) {
        for (let u = 0.15; u < 0.9; u += 0.24) {
          const roll = b.rand();
          if (roll < 0.3) b.put("balloon", ...seg.at(u, side, -0.6));
          else if (roll < 0.55) b.put("bush", ...seg.at(u, side, -0.9));
          else if (roll < 0.68) b.put("pbench", ...seg.at(u, side, -0.9), seg.rot);
        }
      }
    },
  },
};

// Строит карту: кварталы 5×5, дороги между ними, предметы, точки появления вихрей.
export function buildMap(mapIndex, seed) {
  const map = MAPS[mapIndex];
  const rand = makeRng((seed ^ ((mapIndex + 1) * 0x9e3779b1)) >>> 0);
  const b = new Builder(map, rand);
  const H = map.half, N = 5, W = 6, M = 4;
  const B = (2 * H - 2 * M - (N - 1) * W) / N;
  const edges = []; // начало каждого квартала по оси
  for (let i = 0; i < N; i++) edges.push(-H + M + i * (B + W));
  const roadAt = [-H + M / 2, ...edges.slice(1).map((e) => e - W / 2), H - M / 2]; // середины дорог, включая кольцевую
  const blocks = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) blocks.push({ i, j, r: rectOf(edges[i], edges[j], edges[i] + B, edges[j] + B) });

  // дороги: внутренние полосы и кольцо по краю
  for (let i = 1; i < N; i++) {
    b.roads.push(rectOf(edges[i] - W, -H + M - 0.01, edges[i], H - M + 0.01));
    b.roads.push(rectOf(-H + M - 0.01, edges[i] - W, H - M + 0.01, edges[i]));
  }
  b.roads.push({ ring: true, ...rectOf(-H, -H, H, H), width: M });

  // какие кварталы чем заняты
  const types = [];
  for (const [type, n] of Object.entries(map.blocks)) for (let k = 0; k < n; k++) types.push(type);
  if (types.length !== N * N) throw new Error(`Карта ${map.id}: кварталов ${types.length}, нужно ${N * N}`);
  const assign = new Array(N * N).fill(null);
  const near = new Array(N * N).fill(null); // в какую сторону вода (для крана и маяка)
  let pool = [...types];
  const take = (type) => pool.splice(pool.indexOf(type), 1);
  if (map.id === "port") {
    // верхний ряд — море; два бассейна внутри; краны и маяк у воды
    for (let i = 0; i < N; i++) assign[i] = "sea", take("sea");
    const inner = blocks.filter((q) => q.j >= 2 && q.j <= 3 && q.i >= 1 && q.i <= 3).map((q) => q.j * N + q.i);
    const basins = [];
    while (basins.length < 2) {
      const k = inner[Math.floor(rand() * inner.length)];
      if (!basins.includes(k) && !basins.some((o) => Math.abs((o % N) - (k % N)) + Math.abs(Math.floor(o / N) - Math.floor(k / N)) < 2)) basins.push(k);
    }
    for (const k of basins) assign[k] = "basin", take("basin");
    const waterNeighbour = (k) => {
      const i = k % N, j = Math.floor(k / N);
      for (const [di, dj] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const t = assign[jj * N + ii];
        if (t === "sea" || t === "basin") return { x: di, z: dj };
      }
      return null;
    };
    const corner = rand() < 0.5 ? N : 2 * N - 1; // угол второго ряда
    assign[corner] = "lighthouse";
    near[corner] = { x: 0, z: -1 };
    take("lighthouse");
    const wetSides = blocks.map((q) => q.j * N + q.i).filter((k) => !assign[k] && waterNeighbour(k));
    for (let n = 0; n < 3 && wetSides.length; n++) {
      const k = wetSides.splice(Math.floor(rand() * wetSides.length), 1)[0];
      assign[k] = "crane";
      near[k] = waterNeighbour(k);
      take("crane");
    }
    // если мокрых сторон не хватило — краны в обычные кварталы
  }
  // ориентиры (самые большие предметы) — подальше друг от друга
  const big = new Set(["mill", "tower", "block", "square", "ferris", "swing", "castle", "crane", "lighthouse"]);
  for (let k = pool.length - 1; k > 0; k--) {
    const s = Math.floor(rand() * (k + 1));
    [pool[k], pool[s]] = [pool[s], pool[k]];
  }
  pool.sort((a, c) => Number(big.has(c)) - Number(big.has(a))); // сначала ориентиры
  const free = assign.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
  for (const type of pool) {
    let bestK = -1, bestScore = -Infinity;
    for (let t = 0; t < 8; t++) {
      const k = free[Math.floor(rand() * free.length)];
      if (assign[k]) continue;
      let score = rand() * 0.5;
      if (big.has(type)) {
        let nearest = 9;
        assign.forEach((v, o) => {
          if (v && big.has(v)) nearest = Math.min(nearest, Math.max(Math.abs((o % N) - (k % N)), Math.abs(Math.floor(o / N) - Math.floor(k / N))));
        });
        score += nearest;
      }
      if (score > bestScore) (bestScore = score), (bestK = k);
    }
    if (bestK < 0) bestK = free.find((k) => !assign[k]);
    assign[bestK] = type;
  }

  // море порта: верхний ряд вместе с дорогами
  if (map.id === "port") b.patch("water", rectOf(-H - 300, -H - 300, H + 300, edges[0] + B + W / 2));
  // теплоходы — первыми, пока в море свободно
  if (map.id === "port") {
    const sea = blocks.filter((q) => q.j === 0);
    let ships = 0;
    for (let t = 0; t < 60 && ships < 2; t++) {
      const q = sea[Math.floor(rand() * sea.length)];
      if (b.put("ship", q.r.cx + (rand() - 0.5) * 4, q.r.cz + (rand() - 0.5) * 3, (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.3, 0.4)) ships++;
    }
  }
  const prefabs = PREFABS[map.id];
  blocks.forEach((q, k) => prefabs[assign[k]](b, q.r, near[k]));
  // улицы: отрезки дорог между перекрёстками
  for (let a = 0; a < roadAt.length; a++) {
    for (let c = 0; c + 1 < roadAt.length; c++) {
      for (const along of ["x", "z"]) {
        const fixed = roadAt[a], s0 = roadAt[c], s1 = roadAt[c + 1];
        const isRing = a === 0 || a === roadAt.length - 1;
        const half = isRing ? M / 2 : W / 2;
        const seg = along === "x" ? { x0: s0, z0: fixed, x1: s1, z1: fixed } : { x0: fixed, z0: s0, x1: fixed, z1: s1 };
        const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
        const ux = (seg.x1 - seg.x0) / len, uz = (seg.z1 - seg.z0) / len;
        seg.nx = -uz;
        seg.nz = ux;
        seg.rot = Math.atan2(-uz, ux);
        // точка на отрезке: u — доля длины (без перекрёстков), side — сторона, off — сдвиг от края дороги внутрь (+) или наружу (−)
        const cut = W * 0.9;
        seg.at = (u, side, off) => {
          const d = cut + (len - 2 * cut) * u, o = side * (half - off);
          return [seg.x0 + ux * d + seg.nx * o, seg.z0 + uz * d + seg.nz * o];
        };
        seg.edge = (side, off) => [...seg.at(0, side, off), ...seg.at(1, side, off)];
        const [mx, mz] = seg.at(0.5, 0, 0);
        seg.wet = b.wet(mx, mz);
        if (isRing) {
          // у края арены ставим только на внутренней стороне
          const inward = -Math.sign(fixed);
          const keep = (side) => side * (along === "x" ? seg.nz : seg.nx) === inward;
          const at = seg.at;
          seg.at = (u, side, off) => (keep(side) ? at(u, side, off) : at(u, -side, off));
        }
        prefabs.street(b, seg);
      }
    }
  }

  // точки появления — перекрёстки, в том числе на кольце
  const spawns = [];
  for (const x of roadAt) for (const z of roadAt) if (!b.wet(x, z)) spawns.push({ x: clamp(x, -H + 3, H - 3), z: clamp(z, -H + 3, H - 3) });
  return { objs: b.objs, patches: b.patches, roads: b.roads, spawns, half: H, blocks: blocks.map((q, k) => ({ ...q.r, type: assign[k] })), water: b.water };
}

// ---------- Боты ----------
export const SKILLS = {
  easy: { think: 0.95, view: 26, samples: 5, noise: 0.5, hunt: 0.25, alert: 0.4, sense: 9, speed: 0.9, aim: 0.35 },
  medium: { think: 0.55, view: 38, samples: 9, noise: 0.28, hunt: 0.55, alert: 0.75, sense: 15, speed: 0.96, aim: 0.7 },
  hard: { think: 0.32, view: 55, samples: 14, noise: 0.12, hunt: 0.85, alert: 0.95, sense: 22, speed: 1, aim: 1 },
};
export const SKILL_NAMES = { easy: "лёгкий", medium: "средний", hard: "сильный" };

// ---------- Раунд ----------
// player: { name, look, speedMul, startR, pullMul, duration, auto, skill }
// bots: [{ name, look }] — имена и цвета ботов (выбирает main.js)
export class Round {
  constructor({ map = 0, seed = 1, player = {}, bots = [], demo = false } = {}) {
    this.mapIndex = map;
    this.map = MAPS[map];
    this.kinds = this.map.kinds;
    this.seed = seed >>> 0;
    this.rand = makeRng(this.seed * 7 + 13);
    this.demo = demo;
    const world = buildMap(map, this.seed);
    this.half = world.half;
    this.patches = world.patches;
    this.roads = world.roads;
    this.blocks = world.blocks;
    this.waterAreas = world.water;
    this.spawns = world.spawns;
    this.duration = demo ? Infinity : player.duration || BASE_TIME;
    this.t = 0;
    this.mode = "play";
    this.events = [];

    // предметы
    this.objs = world.objs.map((o, i) => {
      const kind = this.kinds[o.k];
      return {
        i, k: o.k, x: o.x, z: o.z, hx: o.x, hz: o.z, rot: o.rot, scale: o.scale, size: o.size, tint: o.tint,
        need: kind.need, g: kind.need * kind.need * GAIN, taken: false, by: -1, at: 0, backAt: 0, cell: -1,
        vx: 0, vz: 0, tx: o.x, tz: o.z, wait: 0,
      };
    });
    this.walkers = this.objs.filter((o) => this.kinds[o.k].walk);
    this.backQueue = [];
    this.gridN = Math.ceil((2 * (this.half + 8)) / CELL);
    this.grid = Array.from({ length: this.gridN * this.gridN }, () => []);
    for (const o of this.objs) this.bin(o);

    // вихри: игрок первый, затем боты
    const spots = [...this.spawns];
    for (let k = spots.length - 1; k > 0; k--) {
      const s = Math.floor(this.rand() * (k + 1));
      [spots[k], spots[s]] = [spots[s], spots[k]];
    }
    const chosen = [];
    for (const s of spots) {
      if (chosen.length >= 1 + bots.length) break;
      if (chosen.every((c) => Math.hypot(c.x - s.x, c.z - s.z) > this.half * 0.45)) chosen.push(s);
    }
    for (const s of spots) if (chosen.length < 1 + bots.length && !chosen.includes(s)) chosen.push(s);
    this.tornados = [];
    const make = (cfg, i, bot) => {
      const startR = cfg.startR || 1;
      const T = {
        i, name: cfg.name || "Вихрь", look: cfg.look ?? 0, bot, player: !bot, auto: !!cfg.auto,
        skill: cfg.skill || "medium",
        x: chosen[i].x, z: chosen[i].z, vx: 0, vz: 0, dirX: 0, dirZ: 0,
        startR2: startR * startR, r2: startR * startR, R: startR, best: startR,
        speedMul: (cfg.speedMul || 1) * (bot ? SKILLS[cfg.skill || "medium"].speed : 1), pullMul: cfg.pullMul || 1,
        alive: true, back: 0, shield: 0, lifted: 0, ate: 0, eatenTimes: 0, eatenBy: -1, slow: false, next: 0,
        ai: { clock: 0, full: 0, mode: "food", tx: chosen[i].x, tz: chosen[i].z, obj: -1, prey: -1, threat: -1, sx: chosen[i].x, sz: chosen[i].z, stuckT: 0, phase: this.rand() * 10 },
      };
      T.next = this.nextKind(T.R);
      return T;
    };
    this.player = make({ ...player, skill: player.skill || "medium" }, 0, false);
    this.tornados.push(this.player);
    bots.forEach((cfg, k) => {
      const skill = cfg.skill || this.map.bots[k % this.map.bots.length];
      this.tornados.push(make({ ...cfg, skill, startR: cfg.startR || this.map.botR, speedMul: cfg.speedMul || this.map.botSpeed, pullMul: cfg.pullMul || this.map.botPull }, k + 1, true));
    });
  }

  cellOf(x, z) {
    const n = this.gridN, off = this.half + 8;
    const cx = clamp(Math.floor((x + off) / CELL), 0, n - 1), cz = clamp(Math.floor((z + off) / CELL), 0, n - 1);
    return cz * n + cx;
  }
  bin(o) {
    const c = this.cellOf(o.x, o.z);
    if (c === o.cell) return;
    if (o.cell >= 0) {
      const list = this.grid[o.cell];
      const at = list.indexOf(o.i);
      if (at >= 0) list.splice(at, 1);
    }
    this.grid[c].push(o.i);
    o.cell = c;
  }
  // обход предметов в квадрате вокруг точки
  around(x, z, r, fn) {
    const n = this.gridN, off = this.half + 8;
    const x0 = clamp(Math.floor((x - r + off) / CELL), 0, n - 1), x1 = clamp(Math.floor((x + r + off) / CELL), 0, n - 1);
    const z0 = clamp(Math.floor((z - r + off) / CELL), 0, n - 1), z1 = clamp(Math.floor((z + r + off) / CELL), 0, n - 1);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.grid[cz * n + cx];
        for (let k = 0; k < list.length; k++) fn(this.objs[list[k]]);
      }
    }
  }
  nextKind(R) {
    let k = 0;
    while (k < this.kinds.length && this.kinds[k].need <= R) k++;
    return k;
  }
  speed(T) {
    return 9.6 * Math.pow(T.R, -0.06) * T.speedMul;
  }
  catchRadius(T) {
    return T.R * T.pullMul + 0.15;
  }
  canEat(A, B) {
    return A !== B && A.alive && B.alive && A.R >= B.R * EAT && this.t >= B.shield;
  }
  standings() {
    return [...this.tornados].sort((a, b) => b.r2 - a.r2 || a.i - b.i);
  }
  place(T = this.player) {
    return this.standings().indexOf(T) + 1;
  }
  // ввод игрока: направление и сила (0..1)
  steer(x, z) {
    const len = Math.hypot(x, z);
    const k = len > 1 ? 1 / len : 1;
    this.player.dirX = x * k;
    this.player.dirZ = z * k;
  }

  step(dt) {
    if (this.mode !== "play") return;
    this.t += dt;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.mode = "done";
      this.events.push({ type: "end" });
      return;
    }
    const H = this.half;
    for (const T of this.tornados) {
      if (!T.alive) {
        if (this.t >= T.back) this.respawn(T);
        continue;
      }
      if (T.bot || T.auto) this.think(T, dt);
      const sp = this.speed(T) * (T.slow ? 0.84 : 1);
      const k = Math.min(1, dt * 7);
      T.vx += (T.dirX * sp - T.vx) * k;
      T.vz += (T.dirZ * sp - T.vz) * k;
      T.x += T.vx * dt;
      T.z += T.vz * dt;
      const lim = H - Math.min(T.R * 0.4, 3) - 0.5;
      if (T.x > lim || T.x < -lim) (T.x = clamp(T.x, -lim, lim)), (T.vx *= 0.2);
      if (T.z > lim || T.z < -lim) (T.z = clamp(T.z, -lim, lim)), (T.vz *= 0.2);
      this.lift(T);
    }
    this.contacts();
    this.walk(dt);
    this.returns();
  }

  lift(T) {
    const C = this.catchRadius(T);
    const R = T.R;
    let slow = false;
    this.around(T.x, T.z, C + this.map.maxSize, (o) => {
      if (o.taken) return;
      const d2 = (o.x - T.x) ** 2 + (o.z - T.z) ** 2;
      if (o.need <= R) {
        const reach = C + o.size * 0.5;
        if (d2 < reach * reach) this.take(o, T);
      } else {
        const block = R * 0.6 + o.size;
        if (d2 < block * block) slow = true;
      }
    });
    T.slow = slow;
  }
  take(o, T) {
    o.taken = true;
    o.by = T.i;
    o.at = this.t;
    T.r2 += o.g;
    this.grow(T);
    T.lifted++;
    if (this.kinds[o.k].back) {
      o.backAt = this.t + BACK_TIME + this.rand() * 12;
      this.backQueue.push(o);
    }
    this.events.push({ type: "lift", o: o.i, by: T.i });
  }
  grow(T) {
    T.R = Math.sqrt(T.r2);
    if (T.R > T.best) T.best = T.R;
    const next = this.nextKind(T.R);
    if (next > T.next) {
      if (T.player) for (let k = T.next; k < next; k++) this.events.push({ type: "unlock", k, by: T.i });
      T.next = next;
    }
  }
  contacts() {
    const list = this.tornados;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a], B = list[b];
        if (!A.alive || !B.alive) continue;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
        const ab = this.canEat(A, B), ba = !ab && this.canEat(B, A);
        if (ab) {
          if (d < A.R * 0.9) this.eat(A, B);
        } else if (ba) {
          if (d < B.R * 0.9) this.eat(B, A);
        } else {
          const min = (A.R + B.R) * 0.55;
          if (d < min && d > 1e-6) {
            // равные вихри отталкиваются, лёгкий отлетает дальше
            const push = min - d, nx = dx / d, nz = dz / d, wa = B.r2 / (A.r2 + B.r2), wb = 1 - wa;
            A.x -= nx * push * wa;
            A.z -= nz * push * wa;
            B.x += nx * push * wb;
            B.z += nz * push * wb;
          }
        }
      }
    }
  }
  eat(A, B) {
    const gain = Math.max(0.4, B.r2 * 0.35);
    A.r2 += gain;
    A.ate++;
    this.grow(A);
    B.alive = false;
    B.back = this.t + RESPAWN;
    B.eatenBy = A.i;
    B.eatenTimes++;
    B.r2 = B.startR2 + Math.max(0, B.r2 - B.startR2) * 0.2;
    B.R = Math.sqrt(B.r2);
    B.next = this.nextKind(B.R);
    B.vx = B.vz = 0;
    this.events.push({ type: "eat", by: A.i, victim: B.i, x: B.x, z: B.z });
    A.ai.full = this.t + 6; // наелся: какое-то время не охотится
    if (A.ai.prey === B.i) A.ai.clock = 0;
  }
  respawn(T) {
    // подальше от тех, кто сильнее
    let best = this.spawns[0], bestScore = -Infinity;
    for (const s of this.spawns) {
      let score = this.rand() * 6;
      for (const O of this.tornados) {
        if (O === T || !O.alive) continue;
        const d = Math.hypot(O.x - s.x, O.z - s.z);
        score += Math.min(d, 60) * (O.R > T.R ? 1 : 0.3);
      }
      if (score > bestScore) (bestScore = score), (best = s);
    }
    T.x = best.x;
    T.z = best.z;
    T.vx = T.vz = 0;
    T.alive = true;
    T.shield = this.t + SHIELD;
    T.ai.clock = 0;
    T.ai.sx = T.x;
    T.ai.sz = T.z;
    this.events.push({ type: "respawn", who: T.i });
  }
  // животные бродят у дома и убегают от вихрей
  walk(dt) {
    const H = this.half - 1;
    for (const o of this.walkers) {
      if (o.taken) continue;
      const kind = this.kinds[o.k];
      let fx = 0, fz = 0, near = Infinity;
      for (const T of this.tornados) {
        if (!T.alive) continue;
        const dx = o.x - T.x, dz = o.z - T.z, d = Math.hypot(dx, dz);
        const lim = T.R * 1.4 + 5;
        if (d < lim && d < near && d > 1e-3) (near = d), (fx = dx / d), (fz = dz / d);
      }
      let tx = 0, tz = 0, sp = 0;
      if (near < Infinity) {
        tx = fx;
        tz = fz;
        sp = kind.walk * 1.3;
      } else if (o.wait > 0) {
        o.wait -= dt;
      } else {
        const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz);
        if (d < 0.3) {
          const a = this.rand() * TAU, r = this.rand() * kind.roam;
          o.tx = o.hx + Math.cos(a) * r;
          o.tz = o.hz + Math.sin(a) * r;
          o.wait = 0.6 + this.rand() * 2.4;
        } else {
          tx = dx / d;
          tz = dz / d;
          sp = kind.walk * 0.55;
        }
      }
      const k = Math.min(1, dt * 6);
      o.vx += (tx * sp - o.vx) * k;
      o.vz += (tz * sp - o.vz) * k;
      let nx = o.x + o.vx * dt, nz = o.z + o.vz * dt;
      // не уходить далеко от дома (уточки остаются в пруду, машинки — на автодроме)
      const hx = nx - o.hx, hz = nz - o.hz, hd = Math.hypot(hx, hz), max = kind.roam * 1.3;
      if (hd > max) (nx = o.hx + (hx / hd) * max), (nz = o.hz + (hz / hd) * max);
      o.x = clamp(nx, -H, H);
      o.z = clamp(nz, -H, H);
      if (o.vx * o.vx + o.vz * o.vz > 0.04) o.rot = Math.atan2(-o.vz, o.vx);
      this.bin(o);
    }
  }
  // мелочи и животные возвращаются, если рядом нет вихря
  returns() {
    if (!this.backQueue.length) return;
    for (let q = this.backQueue.length - 1; q >= 0; q--) {
      const o = this.backQueue[q];
      if (this.t < o.backAt) continue;
      const busy = this.tornados.some((T) => T.alive && Math.hypot(T.x - o.hx, T.z - o.hz) < T.R * 1.5 + 4);
      if (busy) {
        o.backAt = this.t + 3;
        continue;
      }
      this.backQueue.splice(q, 1);
      o.taken = false;
      o.by = -1;
      o.x = o.tx = o.hx;
      o.z = o.tz = o.hz;
      o.vx = o.vz = 0;
      this.bin(o);
      this.events.push({ type: "back", o: o.i });
    }
  }

  // ---------- Разум ботов (и автопилота игрока) ----------
  foodValue(x, z, R, rad) {
    let v = 0;
    this.around(x, z, rad, (o) => {
      if (!o.taken && o.need <= R) v += o.g;
    });
    return v;
  }
  nearestFood(x, z, R, rad) {
    let best = null, bd = Infinity;
    this.around(x, z, rad, (o) => {
      if (o.taken || o.need > R) return;
      const d = (o.x - x) ** 2 + (o.z - z) ** 2;
      if (d < bd) (bd = d), (best = o);
    });
    return best;
  }
  inside(x, z, m = 4) {
    const lim = this.half - m;
    return [clamp(x, -lim, lim), clamp(z, -lim, lim)];
  }
  think(T, dt) {
    const ai = T.ai;
    ai.clock -= dt;
    ai.stuckT += dt;
    if (ai.stuckT > 1.6) {
      if (Math.hypot(T.x - ai.sx, T.z - ai.sz) < 1.6) {
        ai.clock = 0;
        ai.mode = "lost";
      }
      ai.sx = T.x;
      ai.sz = T.z;
      ai.stuckT = 0;
    }
    if (ai.mode === "food" && ai.obj >= 0 && this.objs[ai.obj].taken) ai.clock = Math.min(ai.clock, 0.08);
    if (ai.mode !== "hunt" && ai.mode !== "flee" && Math.hypot(ai.tx - T.x, ai.tz - T.z) < Math.max(1.2, T.R * 0.5)) ai.clock = Math.min(ai.clock, 0);
    if (ai.clock <= 0) this.decide(T);
    if (ai.mode === "hunt") {
      const P = this.tornados[ai.prey];
      if (!P || !this.canEat(T, P)) ai.clock = 0;
      else (ai.tx = P.x + P.vx * 0.45), (ai.tz = P.z + P.vz * 0.45);
    } else if (ai.mode === "flee") {
      const D = this.tornados[ai.threat];
      if (!D || !D.alive || Math.hypot(D.x - T.x, D.z - T.z) > SKILLS[T.skill].sense + D.R * 3 + 10) ai.clock = 0;
    }
    let dx = ai.tx - T.x, dz = ai.tz - T.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) {
      T.dirX = T.dirZ = 0;
      return;
    }
    ai.phase += dt;
    const wob = Math.sin(ai.phase * 1.3) * SKILLS[T.skill].noise * 0.6;
    const c = Math.cos(wob), s = Math.sin(wob);
    dx /= d;
    dz /= d;
    const slow = ai.mode === "food" && d < 2 ? 0.6 : 1;
    T.dirX = (dx * c - dz * s) * slow;
    T.dirZ = (dx * s + dz * c) * slow;
  }
  decide(T) {
    const sk = SKILLS[T.skill];
    const ai = T.ai;
    ai.clock = sk.think * (0.75 + this.rand() * 0.5);
    const wasLost = ai.mode === "lost";
    // 1. угроза: кто может втянуть меня
    let threat = null, td = Infinity;
    for (const O of this.tornados) {
      if (O === T || !O.alive || O.R < T.R * EAT) continue;
      const d = Math.hypot(O.x - T.x, O.z - T.z);
      if (d < sk.sense + O.R * 2 + T.R && d < td) (td = d), (threat = O);
    }
    if (threat && this.rand() < sk.alert) {
      let ax = T.x - threat.x, az = T.z - threat.z;
      const al = Math.hypot(ax, az) || 1;
      ax /= al;
      az /= al;
      let best = null, bs = -Infinity;
      for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
        const c = Math.cos(turn), s = Math.sin(turn);
        const [px, pz] = this.inside(T.x + (ax * c - az * s) * 24, T.z + (ax * s + az * c) * 24, 3 + T.R * 0.3);
        const score = Math.hypot(px - threat.x, pz - threat.z) + this.foodValue(px, pz, T.R, 8) * 2;
        if (score > bs) (bs = score), (best = [px, pz]);
      }
      ai.mode = "flee";
      ai.threat = threat.i;
      ai.tx = best[0];
      ai.tz = best[1];
      ai.clock = Math.min(ai.clock, 0.5);
      return;
    }
    // 2. еда: несколько мест в поле зрения, ценность на расстояние
    let bestV = 0, bx = 0, bz = 0;
    for (let n = 0; n <= sk.samples; n++) {
      let px, pz;
      if (n === 0) {
        if (ai.mode !== "food" || wasLost) continue;
        px = ai.tx;
        pz = ai.tz;
      } else {
        const a = this.rand() * TAU, r = (0.15 + 0.85 * Math.sqrt(this.rand())) * sk.view;
        [px, pz] = this.inside(T.x + Math.cos(a) * r, T.z + Math.sin(a) * r, 2 + T.R * 0.3);
      }
      const d = Math.hypot(px - T.x, pz - T.z);
      const v = this.foodValue(px, pz, T.R, 7 + T.R * 0.5) / (d + 8 + T.R);
      if (v > bestV) (bestV = v), (bx = px), (bz = pz);
    }
    // 3. добыча: соперник, которого можно втянуть
    let prey = null;
    for (const O of this.tornados) {
      if (this.t < ai.full || !this.canEat(T, O) || T.R < O.R * 1.25) continue;
      const d = Math.hypot(O.x - T.x, O.z - T.z);
      if (d > sk.view * 0.8 + T.R * 2) continue;
      const v = (sk.hunt * O.r2 * 0.5) / (d + 10 + T.R);
      if (v > bestV) (bestV = v), (prey = O);
    }
    if (prey) {
      ai.mode = "hunt";
      ai.prey = prey.i;
      ai.clock = Math.min(ai.clock, 1.2);
      return;
    }
    if (bestV <= 0 || wasLost) {
      // ничего не видно — едем в случайное место
      const a = this.rand() * TAU, r = 15 + this.rand() * 30;
      [ai.tx, ai.tz] = this.inside(T.x + Math.cos(a) * r, T.z + Math.sin(a) * r, 6);
      ai.mode = "wander";
      ai.obj = -1;
      ai.clock = 2;
      return;
    }
    ai.mode = "food";
    ai.obj = -1;
    ai.tx = bx;
    ai.tz = bz;
    if (this.rand() < sk.aim) {
      const o = this.nearestFood(bx, bz, T.R, 7 + T.R * 0.5);
      if (o) {
        ai.obj = o.i;
        ai.tx = o.x;
        ai.tz = o.z;
      }
    }
  }

  // итог для игрока
  result() {
    const order = this.standings();
    const T = this.player;
    return {
      place: order.indexOf(T) + 1,
      R: T.R,
      D: T.R * 2,
      best: T.best * 2,
      lifted: T.lifted,
      ate: T.ate,
      eaten: T.eatenTimes,
      order: order.map((O) => ({ i: O.i, name: O.name, D: O.R * 2, player: O.player, look: O.look })),
    };
  }
}
