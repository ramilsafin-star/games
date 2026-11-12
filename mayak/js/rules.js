// Правила «Маяка» без графики и DOM: их можно гонять в Node (см. tests/sim.mjs).
// Бухта лежит в плоскости XZ: z = 0 — ближний берег с маяком и гаванью, z = depth — открытое море.
// Форма бухты зависит от экрана (в портрете она узкая и длинная), но площадь и время пути лодок одни и те же.

const TAU = Math.PI * 2;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

export function seeded(seed) {
  seed = seed >>> 0 || 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// ---------- Лодки ----------
// cross — за сколько секунд лодка проходит бухту; fade — за сколько гаснет фонарик;
// turn — как быстро поворачивает (рад/с); shield — сколько теней выдерживает сама; aura — радиус своего света.
export const BOATS = {
  row: { name: "Шлюпка", cross: 30, fade: 3.5, radius: 0.65, turn: 2.0, points: 100 },
  sail: { name: "Парусник", cross: 24, fade: 3.5, radius: 0.75, turn: 1.8, points: 130 },
  speed: { name: "Катер", cross: 16, fade: 2.4, radius: 0.65, turn: 2.6, points: 170 },
  ferry: { name: "Паром", cross: 33, fade: 3.5, radius: 1.1, turn: 1.1, points: 320, shield: 1 },
  lamp: { name: "Фонарщик", cross: 27, fade: 4.4, radius: 0.75, turn: 1.8, points: 190, aura: 3.0 },
};

// ---------- Тени ----------
// melt — сколько секунд держать в луче; speed — единиц в секунду; hold — сколько держит лодку, прежде чем утащить.
export const SHADES = {
  blob: { name: "Тень", melt: 0.8, speed: 1.85, radius: 0.7, hold: 2.0, points: 40 },
  dart: { name: "Тень-торопыжка", melt: 0.45, speed: 2.6, radius: 0.5, hold: 1.7, points: 55 },
  big: { name: "Тень-толстяк", melt: 1.6, speed: 1.2, radius: 1.0, hold: 2.6, points: 90 },
};

// ---------- Улучшения ----------
export const UPGRADES = {
  wide: { max: 3 }, // шире луч
  long: { max: 3 }, // фонарики горят дольше
  quick: { max: 3 }, // ярче лампа: быстрее заряжает и быстрее лопает тени
  flash: { max: 3 }, // вспышка заряжается быстрее и светит дольше
  heart: { max: 2 }, // лишнее сердечко
  helper: { max: 2 }, // второй маленький луч, сам обходит бухту
  harbor: { max: 2 }, // огни гавани светят дальше
};

// ---------- Ночи ----------
// boats: «секунда:лодки» через пробел, лодки одной волны — через запятую. shades — так же.
// gusts — секунды, когда налетает порыв. fog — полоса тумана на всю ночь.
// rain — гроза: дождь гасит фонарики быстрее, а молнии на миг освещают всю бухту.
// whales — секунды, когда через бухту плывёт кит-фонарик. finds — сколько находок всплывёт за ночь.
// tasks — три задания ночи (за каждое — ракушки): stars3 — все лодки дома, pop:N — лопни N теней,
// streak:N — N лодок подряд, finds:N — подбери N находок, noflash — без вспышки, whale — разбуди кита, score:N — очки.
export const NIGHTS = [
  { name: "Тихая ночь", ridges: 2, cover: 0.36, finds: 1, tasks: "stars3 pop:1 streak:3", boats: "1.5:row 18:row 30:sail 41:row 49:sail", shades: "34:blob" },
  { name: "Первая вспышка", ridges: 2, cover: 0.45, tasks: "stars3 pop:3 finds:1", boats: "1:sail 9:row 18:sail 25:row 35:sail,row 46:sail 53:row", shades: "14:blob 31:blob 44:blob" },
  { name: "Туманная ночь", ridges: 3, cover: 0.45, fog: true, tasks: "streak:5 pop:3 finds:2", boats: "1:sail 8:row 16:speed 23:sail 31:row,sail 41:speed 49:sail 55:row", shades: "13:blob 28:blob 44:blob" },
  { name: "Ветреная ночь", ridges: 3, cover: 0.52, gusts: "21 44", tasks: "stars3 pop:5 finds:2", boats: "1:sail,row 11:speed 19:sail 27:row,sail 37:speed 45:sail,row 55:sail", shades: "8:blob 17:blob 26:blob 34:blob 42:blob 51:blob" },
  { name: "Ночной паром", ridges: 3, cover: 0.62, tasks: "streak:6 pop:8 noflash", boats: "1:ferry 8:sail 15:row 22:speed,sail 31:ferry 39:sail,row 48:speed 54:sail,row", shades: "8:blob 14:blob 20:blob 26:blob,blob 33:blob 39:blob 45:blob,blob 52:blob" },
  { name: "Гирлянда", ridges: 3, cover: 0.66, gusts: "36", tasks: "stars3 pop:9 finds:3", boats: "1:lamp,row 8:sail 14:speed 20:sail,row 27:lamp 33:speed,sail 40:speed 46:row,sail 52:speed,sail", shades: "6:blob 11:dart 16:blob 21:dart,blob 27:blob 32:dart 37:blob,dart 43:blob 48:dart,blob 54:blob" },
  { name: "Туман и ветер", ridges: 4, cover: 0.62, fog: true, gusts: "18 44", tasks: "streak:7 pop:10 finds:3", boats: "1:sail,sail 7:speed 12:row 17:ferry 23:sail,speed 29:lamp 34:speed,sail 40:sail 45:row,speed 51:sail,speed", shades: "5:blob 10:dart 15:blob 20:blob,dart 26:blob 31:dart 36:blob,blob 42:dart 47:blob,dart 53:blob 57:dart" },
  { name: "Большая тень", ridges: 4, cover: 0.64, gusts: "30 52", tasks: "stars3 pop:12 noflash", boats: "1:ferry,sail 7:speed 12:row,sail 18:lamp,speed 24:sail 29:speed,sail 35:ferry 40:speed,row 46:sail 51:lamp,speed", shades: "5:blob 9:big 14:dart 19:blob,blob 24:dart 28:big 33:blob,dart 38:blob 42:big,dart 47:blob 51:dart 55:blob,dart" },
  { name: "Караван", ridges: 4, cover: 0.7, fog: true, gusts: "23 46", tasks: "streak:8 pop:12 finds:3", boats: "1:sail,sail,row 9:speed 14:lamp 19:sail,speed 25:ferry 30:speed 35:sail,sail 41:speed,lamp 47:sail 52:speed,row", shades: "4:blob 9:dart 14:blob,blob 19:big 24:dart 28:blob,dart 33:blob 37:big 41:blob,dart 46:blob 50:big 54:dart 58:blob" },
  { name: "Большой шторм", ridges: 4, cover: 0.76, fog: true, gusts: "13 28 42 56", tasks: "stars3 pop:14 finds:3", boats: "1:sail,row 7:speed 11:ferry 16:sail,lamp 22:speed,speed 27:sail 31:ferry,sail 37:speed 41:lamp,speed 46:sail,sail 51:speed 55:sail,row", shades: "4:blob 8:dart 12:blob,blob 16:big 20:dart 24:blob,dart 28:big 32:dart,blob 36:blob 40:big,dart 44:blob 48:blob,dart 52:big 56:dart,blob 59:blob" },
  // вторая глава: Грозовой берег
  { name: "Гроза", ridges: 3, cover: 0.6, rain: true, finds: 3, tasks: "stars3 pop:8 finds:3", boats: "1:sail,row 8:speed 14:sail 20:row,sail 27:lamp 33:speed,sail 40:sail 46:row,speed 52:sail", shades: "6:blob 11:blob 16:dart 21:blob 26:blob,dart 32:blob 37:big 42:blob,dart 48:blob 54:dart" },
  { name: "Кит-фонарик", ridges: 3, cover: 0.64, gusts: "40", whales: "12 42", finds: 3, tasks: "whale pop:10 streak:8", boats: "1:sail,sail 7:speed 13:row,sail 19:ferry 25:speed,sail 31:lamp 36:sail,row 42:speed 48:sail,speed 54:row", shades: "5:blob 10:dart 14:blob,blob 19:big 24:dart,blob 29:blob 34:big 38:blob,dart 43:blob 48:dart,blob 53:blob" },
  { name: "Письма в бутылках", ridges: 4, cover: 0.64, fog: true, whales: "30", finds: 7, tasks: "finds:6 stars3 pop:10", boats: "1:sail,row 7:speed 12:sail 17:lamp,row 23:speed 28:sail,ferry 34:speed 39:sail,row 45:speed,lamp 51:sail", shades: "5:blob 9:dart 13:blob 18:blob,dart 23:big 28:blob 32:dart,blob 37:blob 41:big,dart 46:blob 51:dart 55:blob" },
  { name: "Последняя гроза", ridges: 4, cover: 0.72, rain: true, gusts: "24 50", whales: "16 44", finds: 4, tasks: "whale stars3 finds:4", boats: "1:sail,row 6:speed 11:ferry 16:sail,lamp 21:speed,speed 26:sail 31:ferry,sail 36:speed 41:lamp,speed 46:sail,sail 51:speed 55:sail,row", shades: "4:blob 8:dart 12:blob,blob 16:big 20:dart 24:blob,dart 28:big 32:dart,blob 36:blob 40:big,dart 44:blob 48:blob,dart 52:big 56:dart" },
];
export const STORM_AT = 10; // после этой ночи открыт «Шторм до рассвета» (как и до второй главы)

// ---------- Находки: всплывают в бухте, подбираются лучом ----------
// bottle — письмо в бутылке (ракушки), buoy — светобуй (светит сам 10 с), spark — звёздочка (вспышка готова скорее)
export const FINDS = {
  bottle: { name: "Письмо в бутылке", points: 60, shells: 2 },
  buoy: { name: "Светобуй", points: 40, light: 10 },
  spark: { name: "Звёздочка", points: 40, flash: 8 },
};
const FIND_TIME = 0.7; // столько держать находку в луче
const FIND_LIFE = 15; // потом она уходит под воду
export const BUOY_R = 2.6; // радиус света светобуя
// Кит-фонарик: проплывает поперёк бухты; подержи его в луче — пустит светящийся фонтан
export const WHALE = { speed: 1.5, wake: 1.0, reach: 5.5, points: 150, shells: 1 };
export const TASK_SHELLS = 5; // ракушек за задание
const BOLT_TIME = 0.28; // сколько светит молния
const RAIN_FADE = 0.8; // в дождь фонарики гаснут быстрее

const AREA = 380; // площадь бухты в любых пропорциях
const LIGHT_Z = -1.4; // лампа маяка стоит на берегу чуть позади кромки воды
const AIM_LIMIT = 1.72; // дальше луч не поворачивается (почти вдоль берега)
const CHARGE_TIME = 0.6; // фонарик в луче заряжается за столько секунд
const FLASH_TIME = 3;
const FLASH_COOLDOWN = 25;
const FLASH_PER_BOAT = 1.5; // каждая доставленная лодка ускоряет перезарядку
const FLASH_REST = 8; // но чаще чем раз в столько секунд вспышка не бывает
const LOST_SPEED = 0.7; // заблудившаяся лодка плывёт медленнее
const VEER_MIN = 0.5; // на сколько радиан лодка сбивается с курса, когда гаснет фонарик
const VEER_MORE = 0.5;
const WAKE_AT = 0.3; // с такого заряда фонарика лодка снова знает дорогу
const HARBOR_GLOW = 3.4; // радиус огней гавани: тут лодки не теряются, а тени не заходят
const GUST_WARN = 1.5;
const GUST_BLOW = 2.8;
const GUST_SPEED = 0.95;
const GUST_FADE = 1.7; // во сколько раз быстрее гаснут фонарики на ветру
const HOUR = 40; // длина «часа» в бесконечном режиме

// Форма бухты под экран: aspect = ширина / высота.
export function bayFor(aspect) {
  const k = clamp(aspect || 1, 0.42, 2.3);
  const ratio = clamp(0.13 + 0.74 * k, 0.46, 1.75);
  const depth = Math.sqrt(AREA / ratio);
  const hw = AREA / depth / 2;
  const light = { x: 0, z: LIGHT_Z };
  const harbor = { x: -Math.min(3.8, hw * 0.52), z: 0.5 };
  // типичная длина пути лодки — по ней считаются скорости, чтобы путь занимал одно и то же время на любом экране
  const route = Math.hypot(depth, hw * 0.6);
  const fan = 2 * Math.atan(hw / (depth * 0.45 - LIGHT_Z));
  // луч перекидывается через всю бухту примерно за 0.45 с: turn — поворот (рад/с), slide — ближе-дальше (ед/с)
  return { hw, depth, light, harbor, route, fan, reach: depth + 2.5, turn: Math.max(2.2, fan / 0.45), slide: depth / 0.45 };
}

// ---------- Поле направлений: из любой клетки — куда плыть к гавани в обход рифов ----------
class Field {
  constructor(bay, rocks) {
    this.cell = 0.5;
    this.x0 = -bay.hw - 1;
    this.z0 = -1;
    this.nx = Math.ceil((bay.hw * 2 + 2) / this.cell) + 1;
    this.nz = Math.ceil((bay.depth + 4.5) / this.cell) + 1;
    const { cell, nx, nz, x0, z0 } = this;
    const n = nx * nz;
    const pen = new Float32Array(n); // штраф клетки; -1 — непроходима
    const awayX = new Float32Array(n);
    const awayZ = new Float32Array(n);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const x = x0 + ix * cell;
        const z = z0 + iz * cell;
        let edge = Infinity;
        let near = null;
        for (const r of rocks) {
          const e = Math.hypot(x - r.x, z - r.z) - r.r;
          if (e < edge) {
            edge = e;
            near = r;
          }
        }
        const atHarbor = Math.abs(x - bay.harbor.x) < 1.7;
        if (edge < 0.2) {
          pen[i] = -1;
          const d = Math.hypot(x - near.x, z - near.z) || 1;
          awayX[i] = (x - near.x) / d;
          awayZ[i] = (z - near.z) / d;
        } else if (z < -0.6 || (z < 0.35 && !atHarbor)) {
          pen[i] = -1;
          awayX[i] = Math.sign(bay.harbor.x - x) * 0.6;
          awayZ[i] = 0.8;
        } else {
          let p = edge < 1.5 ? 7 * (1 - edge / 1.5) ** 2 : 0;
          const over = Math.abs(x) - (bay.hw - 0.7);
          if (over > 0) p += over * 4;
          if (z < 1.2 && !atHarbor) p += (1.2 - z) * 3;
          pen[i] = p;
        }
      }
    }
    // Дейкстра от гавани
    const dist = new Float64Array(n).fill(Infinity);
    const heap = [];
    const push = (d, i) => {
      heap.push([d, i]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let p = 0;
        for (;;) {
          let c = p * 2 + 1;
          if (c >= heap.length) break;
          if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
          if (heap[p][0] <= heap[c][0]) break;
          [heap[p], heap[c]] = [heap[c], heap[p]];
          p = c;
        }
      }
      return top;
    };
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + ix * cell;
        const z = z0 + iz * cell;
        if (Math.hypot(x - bay.harbor.x, z - bay.harbor.z) < 0.9) {
          dist[iz * nx + ix] = 0;
          pen[iz * nx + ix] = 0;
          push(0, iz * nx + ix);
        }
      }
    }
    const steps = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      const ix = i % nx;
      const iz = (i - ix) / nx;
      for (const [sx, sz, len] of steps) {
        const jx = ix + sx;
        const jz = iz + sz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const j = jz * nx + jx;
        if (pen[j] < 0) continue;
        const nd = d + len * cell * (1 + pen[j]);
        if (nd < dist[j]) {
          dist[j] = nd;
          push(nd, j);
        }
      }
    }
    // направление — против градиента расстояния; из рифа и с берега — прочь от них
    const dirX = new Float32Array(n);
    const dirZ = new Float32Array(n);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (pen[i] < 0 || dist[i] === Infinity) {
          dirX[i] = awayX[i];
          dirZ[i] = awayZ[i] || (pen[i] < 0 ? 0 : -1);
          continue;
        }
        const d = dist[i];
        const at = (jx, jz) => {
          if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) return d + cell * 3;
          const v = dist[jz * nx + jx];
          return v === Infinity ? d + cell * 3 : v;
        };
        let gx = at(ix - 1, iz) - at(ix + 1, iz);
        let gz = at(ix, iz - 1) - at(ix, iz + 1);
        const len = Math.hypot(gx, gz);
        if (len < 1e-5) {
          gx = bay.harbor.x - (x0 + ix * cell);
          gz = bay.harbor.z - (z0 + iz * cell);
        }
        const l = Math.hypot(gx, gz) || 1;
        dirX[i] = gx / l;
        dirZ[i] = gz / l;
      }
    }
    this.dist = dist;
    this.pen = pen;
    this.dirX = dirX;
    this.dirZ = dirZ;
  }

  index(x, z) {
    const ix = clamp(Math.round((x - this.x0) / this.cell), 0, this.nx - 1);
    const iz = clamp(Math.round((z - this.z0) / this.cell), 0, this.nz - 1);
    return iz * this.nx + ix;
  }

  // длина пути до гавани из точки (Infinity — пути нет)
  path(x, z) {
    return this.dist[this.index(x, z)];
  }

  // куда плыть из точки: единичный вектор, сглаженный между клетками
  dir(x, z, out) {
    const fx = clamp((x - this.x0) / this.cell, 0, this.nx - 1.001);
    const fz = clamp((z - this.z0) / this.cell, 0, this.nz - 1.001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * this.nx + ix;
    const a = (1 - tx) * (1 - tz);
    const b = tx * (1 - tz);
    const c = (1 - tx) * tz;
    const d = tx * tz;
    const { dirX, dirZ, nx } = this;
    const vx = dirX[i] * a + dirX[i + 1] * b + dirX[i + nx] * c + dirX[i + nx + 1] * d;
    const vz = dirZ[i] * a + dirZ[i + 1] * b + dirZ[i + nx] * c + dirZ[i + nx + 1] * d;
    const l = Math.hypot(vx, vz) || 1;
    out.x = vx / l;
    out.z = vz / l;
    return out;
  }
}

// Рифы стоят грядами поперёк бухты. Гряда — либо «остров» с проходами по бокам, либо «ворота»:
// камни от стен и проход (на широком экране — два). Проходы соседних гряд не стоят друг против друга,
// поэтому лодка без света, плывя прямо, рано или поздно упрётся в камни.
// cfg: ridges — сколько гряд, cover — какую долю ширины гряда перекрывает.
function makeReefs(random, bay, cfg) {
  const W = bay.hw * 2;
  const PASS = 3.1; // самый узкий проход между камнями
  const zMin = Math.max(bay.depth * 0.2 + 1.5, 6.4);
  const zMax = bay.depth * 0.84;
  const fit = 1 + Math.floor((zMax - zMin) / 4.8);
  const wide = W > 19;
  for (let attempt = 0; attempt < 30; attempt++) {
    const n = Math.max(1, Math.min(cfg.ridges, fit));
    const rocks = [];
    let cluster = 0;
    let lastGap = 0.2 + random() * 0.6; // где (в долях ширины) был проход прошлой гряды: новый встанет в стороне
    let twin = random() < 0.5;
    const flip = random() < 0.5 ? 0 : 1;
    for (let i = 0; i < n; i++) {
      const zc = n === 1 ? (zMin + zMax) / 2 : zMin + (zMax - zMin) * i / (n - 1);
      const tilt = (random() - 0.5) * 0.22;
      const bend = (random() - 0.5) * 1.2;
      const spans = []; // перекрытые отрезки по x
      const gate = cfg.cover >= 0.58 && (i + flip) % 2 === 0;
      if (gate) {
        const gap = Math.max(PASS + 0.2, W * (1 - cfg.cover) / (wide ? 2 : 1));
        let centers;
        if (wide) {
          centers = twin ? [0.16, 0.63] : [0.37, 0.84];
          twin = !twin;
        } else {
          const options = [0.2, 0.5, 0.8].filter((c) => Math.abs(c - lastGap) >= 0.28);
          centers = [options[Math.floor(random() * options.length)]];
          lastGap = centers[0];
        }
        let from = -bay.hw - 0.4;
        for (const f of centers) {
          const c = clamp(-bay.hw + (f + (random() - 0.5) * 0.06) * W, -bay.hw + gap / 2 + 0.2, bay.hw - gap / 2 - 0.2);
          if (c - gap / 2 - from > 0.9) spans.push([from, c - gap / 2]);
          from = c + gap / 2;
        }
        if (bay.hw + 0.4 - from > 0.9) spans.push([from, bay.hw + 0.4]);
      } else {
        // острова: вокруг каждого — проходы не уже PASS; если места мало, остров прижимается к стене
        const parts = wide ? 2 : 1;
        const part = W / parts;
        const len = Math.min(Math.min(cfg.cover, 0.56) * part, part - PASS - 0.3);
        for (let k = 0; k < parts; k++) {
          const lo = -bay.hw + k * part;
          const wallLeft = k === 0;
          const wallRight = k === parts - 1;
          // отступы: от стены — целый проход, от соседнего острова — половина (вторую половину даст он)
          const padLeft = wallLeft ? PASS : PASS / 2;
          const padRight = wallRight ? PASS : PASS / 2;
          const room = part - len - padLeft - padRight;
          if (parts > 1) {
            if (room >= 0) {
              const a = lo + padLeft + room * random();
              spans.push([a, a + len]);
            } else if (wallLeft) spans.push([-bay.hw - 0.4, -bay.hw + len]);
            else spans.push([bay.hw - len, bay.hw + 0.4]);
          } else if (room >= 0) {
            // остров встаёт поперёк прежнего прохода
            const a = clamp(-bay.hw + lastGap * W - len / 2 + (random() - 0.5) * 1.2, lo + padLeft, lo + padLeft + room);
            spans.push([a, a + len]);
            const left = a + bay.hw;
            const right = bay.hw - (a + len);
            lastGap = left > right ? left / 2 / W : 1 - right / 2 / W;
          } else if (lastGap < 0.5) {
            spans.push([-bay.hw - 0.4, -bay.hw + len]);
            lastGap = (len + (W - len) / 2) / W;
          } else {
            spans.push([bay.hw - len, bay.hw + 0.4]);
            lastGap = (W - len) / 2 / W;
          }
        }
      }
      for (const [a, b] of spans) {
        let x = a;
        while (x < b - 0.2) {
          const r = Math.min(0.68 + random() * 0.45, Math.max(0.5, (b - x) / 2));
          const cx = x + r;
          const t = cx / bay.hw;
          rocks.push({ x: cx, z: zc + tilt * cx + bend * (t * t - 0.4) + (random() - 0.5) * 0.7, r, cluster });
          x += r * (1.35 + random() * 0.25);
        }
        cluster++;
      }
    }
    const field = new Field(bay, rocks);
    // с любой точки дальнего края есть путь, и он не слишком длинный
    let ok = true;
    for (let lane = 0; lane <= 12 && ok; lane++) {
      const x = (lane / 12 * 2 - 1) * bay.hw * 0.9;
      const path = field.path(x, bay.depth + 1);
      const straight = Math.hypot(x - bay.harbor.x, bay.depth + 1 - bay.harbor.z);
      if (!(path < straight * 1.7 + 18)) ok = false;
    }
    if (ok) return { rocks, field };
  }
  return { rocks: [], field: new Field(bay, []) };
}

function parseWaves(text) {
  if (!text) return [];
  return text.split(" ").map((item) => {
    const [t, kinds] = item.split(":");
    return { t: Number(t), kinds: kinds.split(",") };
  });
}

export class Bay {
  constructor(random = Math.random) {
    this.random = random;
    this.ups = {};
    for (const key of Object.keys(UPGRADES)) this.ups[key] = 0;
    this.aspect = 0.46;
    this.events = [];
    this.serial = 0;
    this.ease = 0; // сколько раз подряд ночь не удалась: море с каждым разом спокойнее
    this.mode = "menu";
    this.night = 0;
    this.endless = false;
    this.best = 0;
    this.tmp = { x: 0, z: 0 };
    this.setLayout(this.aspect, 1);
    this.clearNight();
  }

  // ---- производные от улучшений ----
  get maxHearts() { return 3 + this.ups.heart; }
  get widthMul() { return 1 + 0.22 * this.ups.wide; }
  // на последнем сердечке море добрее: фонарики горят на четверть дольше, а тень в полтора раза дольше держит лодку
  get lastHeart() { return !this.endless && this.hearts <= 1 ? 1 : 0; }
  get fadeMul() { return (1 + 0.25 * this.ups.long) * (1 + 0.12 * Math.min(this.ease, 3)) * (1 + 0.25 * this.lastHeart) * (1 - this.gale) * (this.rain ? RAIN_FADE : 1); }
  get quickMul() { return 1 + 0.25 * this.ups.quick; }
  get flashCooldown() { return FLASH_COOLDOWN * 0.8 ** this.ups.flash; }
  get flashTime() { return FLASH_TIME + 0.4 * this.ups.flash; }
  get harborGlow() { return HARBOR_GLOW * (1 + 0.4 * this.ups.harbor); }

  // Пятно луча на воде — овал, вытянутый от маяка. Ставит пятно в точку (x, z) и считает его полуоси.
  placeSpot(beam, x, z, helper = false) {
    const L = this.bay.light;
    const dx = x - L.x;
    const dz = z - L.z;
    const dist = Math.hypot(dx, dz) || 1;
    const k = this.widthMul * (helper ? (this.ups.helper > 1 ? 0.8 : 0.64) : 1);
    beam.x = x;
    beam.z = z;
    beam.sin = dx / dist;
    beam.cos = dz / dist;
    beam.a = (1.9 + 0.05 * dist) * k; // вдоль луча
    beam.b = 1.25 * k; // поперёк
    return beam;
  }

  // накрывает ли пятно круг радиуса radius в точке (x, z)
  inSpot(beam, x, z, radius = 0) {
    const dx = x - beam.x;
    const dz = z - beam.z;
    const along = (dx * beam.sin + dz * beam.cos) / (beam.a + radius * 0.5);
    const across = (dx * beam.cos - dz * beam.sin) / (beam.b + radius * 0.5);
    return along * along + across * across <= 1;
  }

  emit(type, values = {}) {
    this.events.push({ type, ...values });
  }

  setLayout(aspect, seed) {
    this.aspect = aspect;
    this.bay = bayFor(aspect);
    this.rocks = [];
    this.field = new Field(this.bay, []);
    this.reefSeed = seed;
  }

  clearNight() {
    this.time = 0;
    this.score = 0;
    this.streak = 0;
    this.hearts = this.maxHearts;
    this.saved = 0;
    this.wrecks = 0;
    this.total = 0;
    this.popped = 0;
    this.boats = [];
    this.shades = [];
    this.queue = []; // лодки по времени
    this.shadeQueue = [];
    this.gustQueue = [];
    this.fog = null; // { z, half }
    this.gust = null; // { dir, t, state: "warn" | "blow" }
    // луч: angle — поворот от направления «прямо в море», dist — как далеко от маяка лежит пятно
    this.beam = { angle: 0, dist: this.bay.depth * 0.45 };
    this.placeSpot(this.beam, 0, this.bay.light.z + this.beam.dist);
    this.helper = null;
    if (this.ups.helper > 0) this.addHelper();
    this.flashT = 0;
    this.flashCool = 0;
    this.flashRest = 0; // сколько ещё вспышка «отдыхает» после прошлой
    this.flashUsed = 0;
    this.gale = 0; // в шторме ветер крепчает: фонарики гаснут быстрее
    this.offer = [];
    this.result = null;
    this.dawnT = 0;
    this.hour = 0;
    this.lastLane = undefined;
    // вторая глава: находки, светобуи, киты, гроза, задания
    this.finds = [];
    this.findQueue = []; // { t, kind }
    this.buoys = []; // { x, z, t } — подобранные светобуи светят сами
    this.found = 0;
    this.whales = [];
    this.whaleQueue = [];
    this.woke = 0; // скольких китов разбудили
    this.rain = false;
    this.boltIn = 4;
    this.boltT = 0;
    this.bestStreak = 0;
    this.tasks = []; // { kind, n, done, old } — old: выполнено раньше, ракушек не даёт
    this.shells = 0; // ракушки, заработанные за эту ночь
  }

  buildReefs(cfg, seed) {
    const made = makeReefs(seeded(seed), this.bay, cfg);
    this.rocks = made.rocks;
    this.field = made.field;
  }

  // ---- запуск ----
  // grant — за эту ночь положено улучшение (первое прохождение); keepEase — это повтор после неудачи
  startNight(n, { aspect = this.aspect, grant = true, keepEase = false, done = 0 } = {}) {
    const cfg = NIGHTS[n - 1];
    if (!cfg) return;
    this.restoreUps();
    if (!keepEase) this.ease = 0;
    this.endless = false;
    this.daily = 0;
    this.night = n;
    this.grant = grant;
    this.setLayout(aspect, n * 7919 + Math.round(bayFor(aspect).hw * 10));
    this.buildReefs(cfg, this.reefSeed);
    this.clearNight();
    const stretch = 1 + 0.08 * Math.min(this.ease, 3);
    this.queue = parseWaves(cfg.boats).map((w) => ({ t: w.t * stretch, kinds: w.kinds }));
    this.total = this.queue.reduce((sum, w) => sum + w.kinds.length, 0);
    // после неудач теней меньше: на 20% за каждую, но не меньше половины
    const keep = Math.max(0.5, 1 - 0.2 * this.ease);
    let credit = 0;
    for (const w of parseWaves(cfg.shades)) {
      for (const kind of w.kinds) {
        credit += keep;
        if (credit >= 1 - 1e-9) {
          credit -= 1;
          this.shadeQueue.push({ t: w.t * stretch, kind });
        }
      }
    }
    this.gustQueue = (cfg.gusts ? cfg.gusts.split(" ").map(Number) : []).map((t) => t * stretch);
    if (cfg.fog) this.fog = { z: this.bay.depth * 0.55, half: this.bay.depth * 0.11, phase: this.random() * TAU };
    this.rain = !!cfg.rain;
    this.whaleQueue = (cfg.whales ? cfg.whales.split(" ").map(Number) : []).map((t) => t * stretch);
    // находки — поровну по ночи, между первой и последней волной лодок
    const count = cfg.finds ?? (n >= 2 ? 3 : 0);
    const end = this.queue.length ? this.queue[this.queue.length - 1].t : 50;
    const kinds = n < 3 ? ["bottle"] : ["bottle", "buoy", "spark"];
    for (let i = 0; i < count; i++) {
      const t = 8 + (i + 0.3 + this.random() * 0.4) * (end - 4) / count;
      this.findQueue.push({ t, kind: kinds[(i + n) % kinds.length] });
    }
    this.setTasks(cfg.tasks, done);
    this.mode = "play";
    this.emit("night", { night: n, name: cfg.name });
  }

  // задания ночи; done — битовая маска уже выполненных раньше
  setTasks(text, done = 0) {
    this.tasks = (text ? text.split(" ") : []).map((item, i) => {
      const [kind, n] = item.split(":");
      const old = !!(done & (1 << i));
      return { kind, n: Number(n) || 0, done: old, old };
    });
  }

  // выполнено ли задание (end — ночь уже кончилась рассветом)
  taskOk(task, end) {
    switch (task.kind) {
      case "stars3": return end && this.wrecks === 0;
      case "noflash": return end && this.flashUsed === 0;
      case "pop": return this.popped >= task.n;
      case "streak": return this.bestStreak >= task.n;
      case "finds": return this.found >= task.n;
      case "whale": return this.woke >= 1;
      case "score": return this.score >= task.n;
    }
    return false;
  }

  // сколько уже сделано: для подсказки «3/5»
  taskProgress(task) {
    switch (task.kind) {
      case "pop": return Math.min(task.n, this.popped);
      case "streak": return Math.min(task.n, this.bestStreak);
      case "finds": return Math.min(task.n, this.found);
      case "whale": return Math.min(1, this.woke);
      case "score": return Math.min(task.n, this.score);
    }
    return 0;
  }

  checkTasks(end = false) {
    if (this.mode === "demo") return;
    this.tasks.forEach((task, i) => {
      if (task.done || !this.taskOk(task, end)) return;
      task.done = true;
      this.shells += TASK_SHELLS;
      this.emit("task", { i, kind: task.kind, n: task.n, shells: TASK_SHELLS });
    });
  }

  retry() {
    if (this.mode !== "lost") return;
    if (this.endless) return this.startEndless({ aspect: this.aspect });
    if (this.daily) return this.startDaily({ aspect: this.aspect, seed: this.daily });
    const done = this.tasks.reduce((mask, task, i) => mask | (task.done ? 1 << i : 0), 0);
    this.ease++;
    this.startNight(this.night, { aspect: this.aspect, grant: this.grant, keepEase: true, done });
  }

  startEndless({ aspect = this.aspect } = {}) {
    this.restoreUps();
    this.ease = 0;
    this.endless = true;
    this.daily = 0;
    this.night = 0;
    this.grant = false;
    this.setLayout(aspect, Math.floor(this.random() * 1e9) + 1);
    this.buildReefs({ ridges: 3, cover: 0.62 }, this.reefSeed);
    this.clearNight();
    this.baseUps = { ...this.ups }; // улучшения, взятые в шторме, действуют только до его конца
    this.mode = "play";
    this.hourEnd = 0;
    this.emit("night", { night: 0, name: "Шторм до рассвета" });
    this.nextHour();
  }

  // вернуть улучшения кампании после бесконечного режима
  restoreUps() {
    if (this.baseUps) this.ups = { ...this.baseUps };
    this.baseUps = null;
  }

  nextHour() {
    this.hour++;
    const h = this.hour;
    const from = this.hourEnd;
    this.hourEnd = from + HOUR;
    this.gale = Math.min(0.78, 0.035 * (h - 1));
    const rate = Math.min(0.9, 0.13 + 0.034 * h); // лодок в секунду: шторм крепчает с каждым часом
    const pool = ["sail", "row", "sail", "speed"];
    if (h >= 2) pool.push("ferry", "lamp");
    if (h >= 4) pool.push("speed", "sail");
    let t = from + (h === 1 ? 1.5 : 3);
    while (t < this.hourEnd - 1) {
      const kinds = [pool[Math.floor(this.random() * pool.length)]];
      if (this.random() < Math.min(0.5, 0.1 * h)) kinds.push(pool[Math.floor(this.random() * 3)]);
      this.queue.push({ t, kinds });
      this.total += kinds.length;
      t += kinds.length / rate * (0.75 + this.random() * 0.5);
    }
    const shades = Math.min(22, 2 + Math.floor(h * 1.3));
    for (let i = 0; i < shades; i++) {
      const roll = this.random();
      const kind = h >= 3 && roll < 0.3 ? "dart" : h >= 5 && roll > 0.82 ? "big" : "blob";
      this.shadeQueue.push({ t: from + 4 + (i + this.random() * 0.7) * (HOUR - 6) / shades, kind });
    }
    this.shadeQueue.sort((a, b) => a.t - b.t);
    if (h >= 2) {
      const gusts = h >= 9 ? 3 : h >= 5 ? 2 : 1;
      for (let i = 0; i < gusts; i++) this.gustQueue.push(from + 8 + (i + this.random()) * (HOUR - 12) / gusts);
    }
    // находки, кит и гроза в шторме тоже бывают
    for (let i = 0; i < 2; i++) this.findQueue.push({ t: from + 6 + i * 17 + this.random() * 8, kind: ["bottle", "buoy", "spark"][Math.floor(this.random() * 3)] });
    if (h >= 2) this.whaleQueue.push(from + 10 + this.random() * 18);
    this.rain = h >= 3 && h % 4 === 3;
    if (h > 1) {
      this.shells++;
      this.emit("hour-shell", { hour: h, shells: 1 });
    }
    const foggy = h % 3 === 0 || (h >= 7 && h % 3 === 1);
    if (foggy && !this.fog) this.fog = { z: this.bay.depth * 0.55, half: this.bay.depth * 0.11, phase: this.random() * TAU };
    else if (!foggy) this.fog = null;
    this.emit("hour", { hour: h });
    // каждые три часа — подарок: улучшение на выбор
    if (h > 1 && h % 3 === 1) {
      this.offer = this.makeOffer();
      if (this.offer.length) this.mode = "upgrade";
    }
  }

  // фоновая сценка для меню: лодки плывут сами, никто не теряется
  startDemo({ aspect = this.aspect } = {}) {
    this.restoreUps();
    this.endless = false;
    this.daily = 0;
    this.night = 0;
    this.setLayout(aspect, Math.floor(this.random() * 1e9) + 1);
    this.buildReefs({ ridges: 3, cover: 0.5 }, this.reefSeed);
    this.clearNight();
    this.mode = "demo";
    this.demoNext = 0.5;
  }

  makeOffer() {
    const pool = Object.keys(UPGRADES).filter((key) => this.ups[key] < UPGRADES[key].max);
    const offer = [];
    while (offer.length < 3 && pool.length) offer.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    return offer;
  }

  // взять улучшение из предложенных
  pick(kind) {
    if (this.mode !== "upgrade" || !this.offer.includes(kind)) return false;
    this.ups[kind]++;
    this.offer = [];
    if (kind === "heart") this.hearts = Math.min(this.maxHearts, this.hearts + 1);
    if (kind === "helper") this.addHelper();
    if (this.endless) this.mode = "play";
    return true;
  }

  addHelper() {
    this.helper = this.placeSpot(this.helper || {}, this.helper ? this.helper.x : this.bay.hw * 0.4, this.helper ? this.helper.z : this.bay.depth * 0.5, true);
  }

  flash() {
    if (this.mode !== "play" || this.flashCool > 0 || this.flashT > 0) return false;
    this.flashT = this.flashTime;
    this.flashCool = this.flashCooldown;
    this.flashUsed++;
    this.emit("flash");
    return true;
  }

  // ---- лодки ----
  spawnBoat(kind, lane) {
    const spec = BOATS[kind];
    const bay = this.bay;
    const x = (lane * 2 - 1) * bay.hw * 0.86;
    const z = bay.depth + 1.6;
    // скорость — по длине своего пути в обход рифов: дорога до гавани занимает около cross секунд из любой точки
    const path = clamp(this.field.path(x, z), bay.route * 0.85, bay.route * 1.6);
    const boat = {
      id: ++this.serial,
      kind,
      x,
      z,
      hx: 0,
      hz: -1,
      radius: spec.radius,
      speed: path / spec.cross,
      lantern: 1,
      lit: 0, // сколько света сейчас падает на лодку (0 — темно)
      lost: false,
      held: null, // тень, которая держит лодку
      shield: spec.shield || 0,
      entered: false, // уже вошла в бухту
      veer: 0, // на сколько ещё отвернёт заблудившаяся лодка
      peril: Infinity, // через сколько секунд заблудившаяся лодка во что-нибудь упрётся
      perilIn: 0,
      age: 0,
    };
    this.boats.push(boat);
    this.emit("spawn", { id: boat.id, kind, x: boat.x, z: boat.z });
    return boat;
  }

  // свет в точке от всех источников: главный луч, малый луч, вспышка
  lightAt(x, z, radius) {
    if (this.flashT > 0) return 1;
    const fog = this.fog && Math.abs(z - this.fog.z) < this.fog.half ? 0.5 : 1;
    if (this.inSpot(this.beam, x, z, radius)) return fog;
    let light = this.boltT > 0 ? 0.8 : 0; // молния на миг освещает всю бухту
    if (this.helper && this.inSpot(this.helper, x, z, radius)) light = Math.max(light, 0.6 * fog);
    for (const b of this.buoys) if (Math.hypot(x - b.x, z - b.z) < BUOY_R + radius * 0.5) light = Math.max(light, 0.7);
    return light;
  }

  // свет только от лучей (главного и малого): им подбирают находки и будят китов
  beamAt(x, z, radius) {
    const fog = this.fog && Math.abs(z - this.fog.z) < this.fog.half ? 0.5 : 1;
    if (this.inSpot(this.beam, x, z, radius)) return fog;
    if (this.helper && this.inSpot(this.helper, x, z, radius)) return 0.6 * fog;
    return 0;
  }

  // ---- находки ----
  spawnFind(kind) {
    const bay = this.bay;
    let best = null;
    for (let i = 0; i < 30; i++) {
      const x = (this.random() * 2 - 1) * (bay.hw - 1.2);
      const z = bay.depth * (0.25 + this.random() * 0.6);
      if (this.rocks.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + 1.1)) continue;
      if (this.inHarbor(x, z, 1)) continue;
      let room = Infinity;
      for (const f of this.finds) room = Math.min(room, Math.hypot(x - f.x, z - f.z));
      if (!best || room > best.room) best = { x, z, room };
      if (room > 4) break;
    }
    if (!best) return null;
    const find = { id: ++this.serial, kind, x: best.x, z: best.z, glow: 0, lit: 0, age: 0 };
    this.finds.push(find);
    this.emit("find-up", { id: find.id, kind, x: find.x, z: find.z });
    return find;
  }

  moveFinds(dt) {
    for (const b of this.buoys) b.t -= dt;
    this.buoys = this.buoys.filter((b) => b.t > 0);
    for (const find of [...this.finds]) {
      find.age += dt;
      const lit = this.beamAt(find.x, find.z, 0.4);
      find.lit = lit;
      if (lit > 0) find.glow = Math.min(1, find.glow + dt / FIND_TIME * lit * this.quickMul);
      else find.glow = Math.max(0, find.glow - dt * 0.4);
      if (find.glow >= 1) this.collect(find);
      else if (find.age > FIND_LIFE) {
        this.finds.splice(this.finds.indexOf(find), 1);
        this.emit("find-gone", { id: find.id, x: find.x, z: find.z });
      }
    }
  }

  collect(find) {
    this.finds.splice(this.finds.indexOf(find), 1);
    const spec = FINDS[find.kind];
    this.found++;
    this.score += spec.points;
    let shells = 0;
    if (spec.shells) {
      shells = spec.shells;
      this.shells += shells;
    }
    if (spec.light) this.buoys.push({ x: find.x, z: find.z, t: spec.light });
    if (spec.flash && this.flashCool > 0) {
      this.flashCool = Math.max(this.flashRest, this.flashCool - spec.flash);
      if (this.flashCool === 0) this.emit("flash-ready");
    }
    this.emit("find", { id: find.id, kind: find.kind, x: find.x, z: find.z, points: spec.points, shells });
    this.checkTasks();
  }

  // ---- кит-фонарик ----
  spawnWhale() {
    const bay = this.bay;
    // плывёт поперёк бухты там, где дальше всего от камней
    let bestZ = bay.depth * 0.5;
    let bestGap = -Infinity;
    for (let k = 0; k < 24; k++) {
      const z = bay.depth * (0.3 + 0.5 * k / 23);
      let gap = Infinity;
      for (const r of this.rocks) gap = Math.min(gap, Math.abs(r.z - z) - r.r);
      if (gap > bestGap + 0.05) {
        bestGap = gap;
        bestZ = z;
      }
    }
    const dir = this.random() < 0.5 ? 1 : -1;
    const whale = { id: ++this.serial, x: -dir * (bay.hw + 1.5), z: bestZ, dir, woke: 0, lit: 0, state: "swim", t: 0 };
    this.whales.push(whale);
    this.emit("whale", { id: whale.id, x: whale.x, z: whale.z, dir });
  }

  moveWhales(dt) {
    const bay = this.bay;
    for (const whale of [...this.whales]) {
      whale.t += dt;
      if (whale.state === "swim") {
        whale.x += whale.dir * WHALE.speed * dt;
        const lit = this.beamAt(whale.x, whale.z, 1.2);
        whale.lit = lit;
        if (lit > 0) whale.woke = Math.min(1, whale.woke + dt / WHALE.wake * lit * this.quickMul);
        else whale.woke = Math.max(0, whale.woke - dt * 0.3);
        if (whale.woke >= 1) this.spout(whale);
        else if (whale.x * whale.dir > bay.hw + 1.6) {
          whale.state = "gone";
          whale.t = 0;
          this.emit("whale-gone", { id: whale.id, x: whale.x, z: whale.z });
        }
      } else if (whale.t > 2.6) this.whales.splice(this.whales.indexOf(whale), 1);
    }
  }

  // проснувшийся кит пускает светящийся фонтан: фонарики рядом горят, тени рядом лопаются
  spout(whale) {
    whale.state = "spout";
    whale.t = 0;
    this.woke++;
    this.score += WHALE.points;
    this.shells += WHALE.shells;
    for (const boat of this.boats) {
      if (Math.hypot(boat.x - whale.x, boat.z - whale.z) > WHALE.reach) continue;
      boat.lantern = 1;
      if (boat.lost) {
        boat.lost = false;
        boat.veer = 0;
        this.emit("found", { id: boat.id, x: boat.x, z: boat.z });
      }
    }
    this.emit("spout", { id: whale.id, x: whale.x, z: whale.z, points: WHALE.points, shells: WHALE.shells });
    for (const shade of [...this.shades]) if (Math.hypot(shade.x - whale.x, shade.z - whale.z) < WHALE.reach) this.popShade(shade, true);
    this.checkTasks();
  }

  // ---- «Ночь дня»: своя на каждый день, одинаковая у всех ----
  startDaily({ aspect = this.aspect, seed = 1 } = {}) {
    const r = seeded(seed * 31 + 7);
    this.restoreUps();
    this.ease = 0;
    this.endless = false;
    this.daily = seed;
    this.night = 0;
    this.grant = false;
    this.setLayout(aspect, seed);
    this.buildReefs({ ridges: 3, cover: 0.58 + r() * 0.1 }, seed);
    this.clearNight();
    // два события из пяти
    const all = ["rain", "fog", "gusts", "whale", "finds"];
    const events = [];
    while (events.length < 2) {
      const e = all.splice(Math.floor(r() * all.length), 1)[0];
      events.push(e);
    }
    this.dailyEvents = events;
    const pool = ["sail", "row", "sail", "speed", "ferry", "lamp"];
    let t = 1;
    while (t < 56) {
      const kinds = [pool[Math.floor(r() * pool.length)]];
      if (r() < 0.3) kinds.push(pool[Math.floor(r() * 3)]);
      this.queue.push({ t, kinds });
      this.total += kinds.length;
      t += kinds.length * (4.6 + r() * 2.2);
    }
    for (let i = 0; i < 12; i++) {
      const roll = r();
      this.shadeQueue.push({ t: 5 + i * 4.4 + r() * 2, kind: roll < 0.25 ? "dart" : roll > 0.85 ? "big" : "blob" });
    }
    if (events.includes("gusts")) this.gustQueue = [18 + r() * 8, 40 + r() * 8];
    if (events.includes("fog")) this.fog = { z: this.bay.depth * 0.55, half: this.bay.depth * 0.11, phase: r() * TAU };
    this.rain = events.includes("rain");
    if (events.includes("whale")) this.whaleQueue = [12 + r() * 6, 36 + r() * 8];
    const finds = events.includes("finds") ? 6 : 2;
    for (let i = 0; i < finds; i++) this.findQueue.push({ t: 8 + (i + 0.5) * 48 / finds, kind: ["bottle", "buoy", "spark"][Math.floor(r() * 3)] });
    this.setTasks("");
    this.mode = "play";
    this.emit("night", { night: 0, name: "Ночь дня", daily: true });
  }

  inHarbor(x, z, extra = 0) {
    return Math.hypot(x - this.bay.harbor.x, z - this.bay.harbor.z) < this.harborGlow + extra;
  }

  // через сколько секунд лодка, плывя прямо без света, упрётся в риф или берег
  perilOf(boat) {
    const bay = this.bay;
    const speed = boat.speed * LOST_SPEED;
    for (let s = 0; s < 16; s += 0.3) {
      const x = boat.x + boat.hx * s;
      const z = boat.z + boat.hz * s;
      if (this.inHarbor(x, z, -0.4)) return Infinity;
      if (z < 0.45) return s / speed;
      for (const r of this.rocks) {
        if (Math.hypot(x - r.x, z - r.z) < r.r + boat.radius * 0.45) return s / speed;
      }
      if (Math.abs(x) > bay.hw + 2 || z > bay.depth + 4) return Infinity;
    }
    return Infinity;
  }

  loseBoat(boat, how) {
    const i = this.boats.indexOf(boat);
    if (i < 0) return;
    this.boats.splice(i, 1);
    this.emit(how, { id: boat.id, kind: boat.kind, x: boat.x, z: boat.z });
    if (this.mode === "demo") return;
    this.wrecks++;
    this.streak = 0;
    this.hearts--;
    this.emit("heart", { hearts: this.hearts });
    if (this.hearts <= 0) {
      this.mode = "lost";
      if (this.endless) this.best = Math.max(this.best, this.score);
      this.emit("fail");
    }
  }

  deliver(boat) {
    const i = this.boats.indexOf(boat);
    if (i < 0) return;
    this.boats.splice(i, 1);
    if (this.mode === "demo") return this.emit("deliver", { id: boat.id, kind: boat.kind, x: boat.x, z: boat.z, points: 0, demo: true });
    this.saved++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const points = Math.round(BOATS[boat.kind].points * (1 + 0.1 * Math.min(10, this.streak - 1)));
    this.score += points;
    if (this.flashCool > 0) {
      this.flashCool = Math.max(this.flashRest, this.flashCool - FLASH_PER_BOAT);
      if (this.flashCool === 0) this.emit("flash-ready");
    }
    this.emit("deliver", { id: boat.id, kind: boat.kind, x: boat.x, z: boat.z, points, streak: this.streak });
    this.checkTasks();
  }

  moveBoats(dt) {
    const bay = this.bay;
    const demo = this.mode === "demo";
    const drift = this.gust && this.gust.state === "blow" ? this.gust.dir * GUST_SPEED * Math.sin(Math.PI * clamp(this.gust.t / GUST_BLOW, 0, 1)) ** 0.6 : 0;
    const blowing = drift !== 0;
    // фонарщики светят соседям
    const lamps = this.boats.filter((b) => b.kind === "lamp" && b.lantern > 0.35 && !b.held);
    for (const boat of [...this.boats]) {
      boat.age += dt;
      const spec = BOATS[boat.kind];
      // --- свет и фонарик ---
      let light = this.lightAt(boat.x, boat.z, boat.radius);
      if (light < 0.7 && this.inHarbor(boat.x, boat.z)) light = 0.7;
      if (light < 0.4) {
        for (const lamp of lamps) {
          if (lamp !== boat && Math.hypot(lamp.x - boat.x, lamp.z - boat.z) < spec.radius + BOATS.lamp.aura) light = 0.4;
        }
      }
      if (demo) light = 1;
      boat.lit = light;
      const before = boat.lantern;
      if (light > 0) boat.lantern = Math.min(1, boat.lantern + dt / CHARGE_TIME * light * this.quickMul);
      else if (boat.z > bay.depth) boat.lantern = Math.max(boat.lantern, 1); // в открытом море фонарик ещё не гаснет
      else boat.lantern = Math.max(0, boat.lantern - dt / (spec.fade * this.fadeMul) * (blowing ? GUST_FADE : 1)); // на ветру фонарик гаснет быстрее
      if (before < 1 && boat.lantern === 1 && light > 0 && !demo) this.emit("charged", { id: boat.id, x: boat.x, z: boat.z });
      if (!boat.lost && boat.lantern <= 0) {
        boat.lost = true;
        boat.perilIn = 0;
        // сбилась с курса: отворачивает в сторону и дальше плывёт прямо
        boat.veer = (this.random() < 0.5 ? -1 : 1) * (VEER_MIN + this.random() * VEER_MORE);
        this.emit("astray", { id: boat.id, kind: boat.kind, x: boat.x, z: boat.z });
      } else if (boat.lost && boat.lantern >= WAKE_AT) {
        boat.lost = false;
        boat.veer = 0;
        this.emit("found", { id: boat.id, x: boat.x, z: boat.z });
      }
      if (boat.held) continue; // тень держит: лодка стоит

      // --- движение ---
      let speed = boat.speed;
      if (boat.lost) {
        speed *= LOST_SPEED;
        if (boat.veer) {
          const step = clamp(boat.veer, -1.3 * dt, 1.3 * dt);
          boat.veer -= step;
          const cs = Math.cos(step);
          const sn = Math.sin(step);
          const hx = boat.hx * cs - boat.hz * sn;
          boat.hz = boat.hx * sn + boat.hz * cs;
          boat.hx = hx;
        }
      } else {
        const want = this.field.dir(boat.x, boat.z, this.tmp);
        // до входа в бухту лодка идёт прямо, чтобы не толпиться у края
        if (boat.z < bay.depth + 0.5) boat.entered = true;
        const turn = boat.entered ? spec.turn * dt : 0;
        const cross = boat.hx * want.z - boat.hz * want.x;
        const dot = boat.hx * want.x + boat.hz * want.z;
        const angle = Math.atan2(cross, dot); // на сколько надо повернуть
        const step = clamp(angle, -turn, turn);
        const cs = Math.cos(step);
        const sn = Math.sin(step);
        const hx = boat.hx * cs - boat.hz * sn;
        const hz = boat.hx * sn + boat.hz * cs;
        boat.hx = hx;
        boat.hz = hz;
        // перед крутым поворотом лодка притормаживает
        speed *= 0.55 + 0.45 * clamp(dot, 0, 1);
      }
      boat.x += boat.hx * speed * dt + drift * (boat.lost ? 1 : 0.45) * dt;
      boat.z += boat.hz * speed * dt;
      boat.x = clamp(boat.x, -bay.hw - 0.2, bay.hw + 0.2);
      if (boat.z > bay.depth + 2.5 && boat.hz > 0) boat.hz = -boat.hz; // в открытое море не уплывает

      // --- рифы и берег ---
      let wrecked = false;
      for (const r of this.rocks) {
        const d = Math.hypot(boat.x - r.x, boat.z - r.z);
        if (boat.lost) {
          if (d < r.r + boat.radius * 0.45) wrecked = true;
        } else {
          const min = r.r + boat.radius * 0.8;
          if (d < min && d > 1e-4) {
            boat.x = r.x + (boat.x - r.x) / d * min;
            boat.z = r.z + (boat.z - r.z) / d * min;
          }
        }
      }
      const toHarbor = Math.hypot(boat.x - bay.harbor.x, boat.z - bay.harbor.z);
      if (toHarbor < 1.25) {
        this.deliver(boat);
        continue;
      }
      if (boat.z < 0.45 && Math.abs(boat.x - bay.harbor.x) > 1.7) {
        if (boat.lost) wrecked = true;
        else boat.z = 0.45;
      }
      if (wrecked) {
        this.loseBoat(boat, "wreck");
        if (this.mode === "lost") return;
        continue;
      }
      // --- оценка опасности: раз в 0.15 с ---
      boat.perilIn -= dt;
      if (boat.perilIn <= 0) {
        boat.perilIn = 0.15;
        boat.peril = this.perilOf(boat);
      }
    }
    // лодки не налезают друг на друга
    for (let i = 0; i < this.boats.length; i++) {
      const a = this.boats[i];
      for (let j = i + 1; j < this.boats.length; j++) {
        const b = this.boats[j];
        const min = a.radius + b.radius + 0.25;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5 * Math.min(1, dt * 6);
        const ka = a.lost || a.held ? 0 : 1;
        const kb = b.lost || b.held ? 0 : 1;
        a.x -= dx / d * push * ka;
        a.z -= dz / d * push * ka;
        b.x += dx / d * push * kb;
        b.z += dz / d * push * kb;
      }
    }
  }

  // ---- тени ----
  spawnShade(kind) {
    const bay = this.bay;
    const free = this.boats.filter((b) => !b.held && !this.inHarbor(b.x, b.z, 2) && b.z < bay.depth);
    const target = free.length ? free[Math.floor(this.random() * free.length)] : null;
    const tx = target ? target.x : 0;
    const tz = target ? target.z : bay.depth * 0.6;
    // точка на краю бухты в 6–9 единицах от цели: тень успеют заметить
    let best = null;
    for (let i = 0; i < 24; i++) {
      const side = this.random();
      let x, z;
      if (side < 0.38) {
        x = -bay.hw + 0.4;
        z = bay.depth * (0.3 + this.random() * 0.68);
      } else if (side < 0.76) {
        x = bay.hw - 0.4;
        z = bay.depth * (0.3 + this.random() * 0.68);
      } else {
        x = (this.random() * 2 - 1) * (bay.hw - 0.5);
        z = bay.depth - 0.4;
      }
      if (this.rocks.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + 0.9)) continue;
      const d = Math.hypot(x - tx, z - tz);
      const score = Math.abs(d - 7.5) + (d < 5.5 ? 6 : 0);
      if (!best || score < best.score) best = { x, z, score };
    }
    if (!best) best = { x: bay.hw - 0.4, z: bay.depth * 0.7 };
    const spec = SHADES[kind];
    const shade = {
      id: ++this.serial,
      kind,
      x: best.x,
      z: best.z,
      radius: spec.radius,
      hp: 1, // 1 — целая, 0 — лопнула
      lit: 0,
      state: "rise", // rise — всплывает, swim — плывёт к лодке, hold — держит лодку
      t: 1.3,
      target: null,
      holdT: 0,
      idle: 0,
      age: 0,
    };
    this.shades.push(shade);
    this.emit("shade", { id: shade.id, kind, x: shade.x, z: shade.z });
  }

  popShade(shade, scored, why = "pop") {
    const i = this.shades.indexOf(shade);
    if (i < 0) return;
    this.shades.splice(i, 1);
    if (shade.state === "hold") {
      const boat = this.boats.find((b) => b.held === shade.id);
      if (boat) {
        boat.held = null;
        boat.lantern = Math.max(boat.lantern, 0.5);
        boat.lost = false;
        this.emit("free", { id: boat.id, x: boat.x, z: boat.z });
      }
    }
    let points = 0;
    if (scored) {
      points = SHADES[shade.kind].points;
      this.score += points;
      this.popped++;
    }
    this.emit(why, { id: shade.id, kind: shade.kind, x: shade.x, z: shade.z, points });
    if (scored) this.checkTasks();
  }

  moveShades(dt) {
    for (const shade of [...this.shades]) {
      const spec = SHADES[shade.kind];
      shade.age += dt;
      let light = this.lightAt(shade.x, shade.z, shade.radius);
      if (light < 0.5 && this.inHarbor(shade.x, shade.z, -0.3)) light = 0.5;
      // гирлянда фонарщика тоже щиплет тени
      if (light < 0.4) {
        for (const b of this.boats) {
          if (b.kind === "lamp" && b.lantern > 0.35 && !b.held && Math.hypot(b.x - shade.x, b.z - shade.z) < BOATS.lamp.aura) light = 0.4;
        }
      }
      shade.lit = light;
      if (light > 0) shade.hp -= dt / spec.melt * light * this.quickMul;
      else shade.hp = Math.min(1, shade.hp + dt * 0.22);
      if (shade.hp <= 0) {
        this.popShade(shade, true);
        continue;
      }
      if (shade.state === "rise") {
        shade.t -= dt;
        if (shade.t <= 0) shade.state = "swim";
        continue;
      }
      if (shade.state === "hold") {
        const boat = this.boats.find((b) => b.held === shade.id);
        if (!boat) {
          shade.state = "swim";
          continue;
        }
        shade.x = boat.x;
        shade.z = boat.z;
        if (light <= 0) shade.holdT -= dt; // пока тень в луче, она никого не утащит
        if (shade.holdT <= 0) {
          this.shades.splice(this.shades.indexOf(shade), 1);
          this.emit("sink", { id: shade.id, kind: shade.kind, x: shade.x, z: shade.z });
          this.loseBoat(boat, "dragged");
          if (this.mode === "lost") return;
        }
        continue;
      }
      // плывёт к ближайшей свободной лодке
      let target = null;
      let closest = Infinity;
      for (const b of this.boats) {
        if (b.held || this.inHarbor(b.x, b.z, 0.2) || b.z > this.bay.depth + 0.8) continue;
        const d = Math.hypot(b.x - shade.x, b.z - shade.z);
        if (d < closest) {
          closest = d;
          target = b;
        }
      }
      shade.target = target ? target.id : null;
      if (!target) {
        // некого ловить: покружит и уйдёт на дно
        shade.idle += dt;
        if (shade.idle > 5) this.popShade(shade, false, "dive");
        continue;
      }
      shade.idle = 0;
      const speed = spec.speed * (light > 0 ? 0.35 : 1) * (1 + 1.2 * this.gale); // в шторме тени шустрее
      shade.x += (target.x - shade.x) / closest * speed * dt;
      shade.z += (target.z - shade.z) / closest * speed * dt;
      if (closest < target.radius + shade.radius * 0.6) {
        if (target.shield > 0) {
          // паром гудит — тень лопается от испуга
          target.shield--;
          this.emit("shield", { id: target.id, x: target.x, z: target.z });
          this.popShade(shade, true);
        } else {
          shade.state = "hold";
          shade.holdT = spec.hold * (1 + 0.15 * Math.min(this.ease, 3)) * (1 + 0.5 * this.lastHeart) * (1 - 0.5 * this.gale);
          shade.x = target.x;
          shade.z = target.z;
          target.held = shade.id;
          this.emit("grab", { id: target.id, shade: shade.id, x: target.x, z: target.z });
        }
      }
    }
  }

  // ---- шаг игры ----
  // aim — точка на воде { x, z }, куда игрок ведёт луч (null — палец отпущен, луч стоит)
  step(dt, aim = null) {
    const mode = this.mode;
    if (mode !== "play" && mode !== "dawn" && mode !== "demo") return;
    this.time += dt;
    const bay = this.bay;

    const L = bay.light;
    if (aim) {
      const dx = aim.x - L.x;
      const dz = aim.z - L.z;
      const angle = clamp(Math.atan2(dx, dz), -AIM_LIMIT, AIM_LIMIT);
      const dist = clamp(Math.hypot(dx, dz), 3.2, bay.reach);
      this.beam.angle += clamp(angle - this.beam.angle, -bay.turn * dt, bay.turn * dt);
      this.beam.dist += clamp(dist - this.beam.dist, -bay.slide * dt, bay.slide * dt);
    }
    this.placeSpot(this.beam, L.x + Math.sin(this.beam.angle) * this.beam.dist, L.z + Math.cos(this.beam.angle) * this.beam.dist);
    if (this.helper) {
      // малый луч сам обходит бухту: плывёт к самой тусклой лодке, а без дела — по восьмёрке
      const h = this.helper;
      let tx = Math.sin(this.time * 0.31) * bay.hw * 0.62;
      let tz = bay.depth * (0.52 + 0.3 * Math.sin(this.time * 0.19 + 1));
      let low = 0.8;
      for (const b of this.boats) {
        if (b.lantern >= low || b.z > bay.depth || this.inHarbor(b.x, b.z) || this.inSpot(this.beam, b.x, b.z, b.radius)) continue;
        low = b.lantern;
        tx = b.x;
        tz = b.z;
      }
      const d = Math.hypot(tx - h.x, tz - h.z);
      const move = Math.min(d, (this.ups.helper > 1 ? 4.4 : 3) * dt);
      if (d > 1e-4) this.placeSpot(h, h.x + (tx - h.x) / d * move, h.z + (tz - h.z) / d * move, true);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 0;
        this.flashRest = Math.min(FLASH_REST, this.flashCool);
        this.emit("flash-end");
      }
    } else if (this.flashCool > 0) {
      this.flashRest = Math.max(0, this.flashRest - dt);
      this.flashCool -= dt;
      if (this.flashCool <= 0) {
        this.flashCool = 0;
        this.emit("flash-ready");
      }
    }

    if (mode === "dawn") {
      this.dawnT -= dt;
      this.moveShades(dt);
      if (this.dawnT <= 0) this.finishNight();
      return;
    }

    if (mode === "demo") {
      this.demoNext -= dt;
      if (this.demoNext <= 0 && this.boats.length < 5) {
        this.demoNext = 5 + this.random() * 3;
        const kinds = ["sail", "row", "sail", "speed", "lamp", "ferry"];
        this.spawnBoat(kinds[Math.floor(this.random() * kinds.length)], 0.1 + this.random() * 0.8);
      }
      this.moveBoats(dt);
      return;
    }

    if (this.endless && this.time >= this.hourEnd) {
      this.nextHour();
      if (this.mode !== "play") return;
    }

    // туман медленно ходит по бухте
    if (this.fog) this.fog.z = bay.depth * (0.55 + 0.13 * Math.sin(this.time * 0.11 + this.fog.phase));
    // гроза: раз в 6–11 с молния освещает всю бухту
    if (this.boltT > 0) this.boltT = Math.max(0, this.boltT - dt);
    if (this.rain) {
      this.boltIn -= dt;
      if (this.boltIn <= 0) {
        this.boltIn = 6 + this.random() * 5;
        this.boltT = BOLT_TIME;
        this.emit("bolt", { at: this.random() * 2 - 1 });
      }
    }
    while (this.findQueue.length && this.findQueue[0].t <= this.time) this.spawnFind(this.findQueue.shift().kind);
    while (this.whaleQueue.length && this.whaleQueue[0] <= this.time) {
      this.whaleQueue.shift();
      this.spawnWhale();
    }
    // порывы шторма
    if (this.gust) {
      this.gust.t += dt;
      if (this.gust.state === "warn" && this.gust.t >= GUST_WARN) {
        this.gust.state = "blow";
        this.gust.t = 0;
        this.emit("gust", { dir: this.gust.dir });
      } else if (this.gust.state === "blow" && this.gust.t >= GUST_BLOW) this.gust = null;
    } else if (this.gustQueue.length && this.gustQueue[0] <= this.time) {
      this.gustQueue.shift();
      this.gust = { dir: this.random() < 0.5 ? -1 : 1, t: 0, state: "warn" };
      this.emit("gust-warn", { dir: this.gust.dir });
    }

    // новые лодки и тени
    while (this.queue.length && this.queue[0].t <= this.time) {
      const wave = this.queue.shift();
      const first = this.night === 1 && this.saved + this.wrecks + this.boats.length === 0;
      let base = first ? 0.42 + this.random() * 0.16 : this.random();
      if (!first && this.lastLane !== undefined && Math.abs(base - this.lastLane) < 0.18) base = (base + 0.5) % 1;
      this.lastLane = base;
      wave.kinds.forEach((kind, k) => {
        // лодки одной волны расходятся по краю
        const lane = wave.kinds.length === 1 ? base : (base + k / wave.kinds.length + (this.random() - 0.5) * 0.08) % 1;
        this.spawnBoat(kind, 0.04 + lane * 0.92);
      });
    }
    while (this.shadeQueue.length && this.shadeQueue[0].t <= this.time) {
      const next = this.shadeQueue.shift();
      // тень не всплывает в пустой бухте: подождёт лодку
      if (!this.boats.some((b) => b.z < bay.depth && !this.inHarbor(b.x, b.z, 2))) {
        if (this.queue.length || this.boats.length) {
          next.t = this.time + 1.5;
          this.shadeQueue.push(next);
          this.shadeQueue.sort((a, b) => a.t - b.t);
        }
        break;
      }
      this.spawnShade(next.kind);
    }

    this.moveBoats(dt);
    if (this.mode === "lost") return;
    this.moveShades(dt);
    if (this.mode === "lost") return;
    this.moveFinds(dt);
    this.moveWhales(dt);

    // ночь кончается, когда все лодки пришли или потеряны
    if (!this.endless && this.queue.length === 0 && this.boats.length === 0) {
      this.mode = "dawn";
      this.dawnT = 2.6;
      this.shadeQueue.length = 0;
      this.gustQueue.length = 0;
      this.gust = null;
      for (const shade of [...this.shades]) this.popShade(shade, false, "dive");
      for (const find of this.finds) this.emit("find-gone", { id: find.id, x: find.x, z: find.z });
      this.finds = [];
      this.findQueue.length = 0;
      this.whaleQueue.length = 0;
      this.rain = false;
      const bonus = this.hearts * 100;
      this.score += bonus;
      this.emit("dawn", { bonus });
      this.checkTasks(true);
    }
  }

  finishNight() {
    const stars = clamp(3 - this.wrecks, 1, 3);
    this.result = { night: this.night, daily: this.daily, stars, saved: this.saved, total: this.total, score: this.score, popped: this.popped, wrecks: this.wrecks, found: this.found, shells: this.shells, tasks: this.tasks.map((t) => ({ ...t })) };
    this.ease = 0;
    if (this.daily) {
      this.offer = [];
      this.mode = "upgrade";
      this.emit("clear");
    } else if (this.night >= NIGHTS.length) {
      this.mode = "won";
      this.emit("won");
    } else {
      this.offer = this.grant ? this.makeOffer() : [];
      this.mode = "upgrade";
      this.emit("clear");
    }
  }
}
