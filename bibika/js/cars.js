// Автопарк: данные машин и векторные заглушки, пока не готовы 3D-модели.
const CARS = {
  racer: {
    name: "Вспышка",
    kind: "sport",
    color: "#ff3e48",
    light: "#ff9271",
    dark: "#ab163c",
    horn: "high",
    power: "Нитро",
    icon: "🔥",
    effect: "nitro",
    duration: 4,
    cooldown: 8,
    description:
      "Огненное ускорение! Мчится вперёд и мягко расталкивает машины.",
  },
  tank: {
    name: "Танк «Бум»",
    kind: "tank",
    color: "#76b945",
    light: "#c6ec6c",
    dark: "#3a7434",
    horn: "low",
    power: "Хлопушка",
    icon: "🎉",
    effect: "cannon",
    duration: 1.2,
    cooldown: 3,
    description: "Бум! Три залпа конфетти превращают преграды в звёзды.",
    fresh: true,
  },
  truck: {
    name: "Фура «Гром»",
    kind: "truck",
    color: "#8157ed",
    light: "#ba9bff",
    dark: "#4f299b",
    horn: "truck",
    power: "Мегагудок",
    icon: "📣",
    effect: "megahorn",
    duration: 4,
    cooldown: 8,
    description: "Мощная звуковая волна раздвигает весь поток по сторонам.",
    fresh: true,
  },
  tractor: {
    name: "Трактор «Тяп»",
    kind: "tractor",
    color: "#3dc36d",
    light: "#9ef079",
    dark: "#177d56",
    horn: "low",
    power: "Суперковш",
    icon: "🚜",
    effect: "plow",
    duration: 1.35,
    cooldown: 1.8,
    description: "Толкает машину или тюк перед собой одним взмахом ковша.",
    fresh: true,
  },
  coupe: {
    name: "Синий вихрь",
    kind: "sport",
    color: "#2686f2",
    light: "#83d8ff",
    dark: "#1748b0",
    horn: "high",
    power: "Слоу-мо",
    icon: "🐢",
    effect: "slow",
    duration: 5,
    cooldown: 9,
    description: "Замедляет встречные препятствия: больше времени на манёвр.",
  },
  ev: {
    name: "Электро",
    kind: "sedan",
    color: "#e7f6ff",
    light: "#ffffff",
    dark: "#6f9fbc",
    horn: "high",
    power: "Электрощит",
    icon: "🛡️",
    effect: "shield",
    duration: 6,
    cooldown: 9,
    description: "Голубой купол принимает один удар, вспыхивает и гаснет.",
  },
  hyper: {
    name: "Ракета",
    kind: "sport",
    color: "#ff881e",
    light: "#ffce69",
    dark: "#c84b17",
    horn: "high",
    power: "Гиперпрыжок",
    icon: "🚀",
    effect: "jump",
    duration: 3,
    cooldown: 7,
    description: "Взлетает над потоком и перелетает через все препятствия.",
  },
  roadster: {
    name: "Солнышко",
    kind: "open",
    color: "#ffcf32",
    light: "#fff4a0",
    dark: "#d29416",
    horn: "mid",
    power: "Звездопад",
    icon: "🌟",
    effect: "starfall",
    duration: 1.2,
    cooldown: 14,
    description: "Создаёт дорожку из трёх новых звёзд прямо перед собой.",
  },
  hatch: {
    name: "Зефирка",
    kind: "compact",
    color: "#fa67a7",
    light: "#ffb7d5",
    dark: "#ba337c",
    horn: "mid",
    power: "Мини-машинка",
    icon: "🐭",
    effect: "mini",
    duration: 6,
    cooldown: 9,
    description: "Становится крошечной и легко пролезает между машинами.",
  },
  suv: {
    name: "Лесной друг",
    kind: "suv",
    color: "#1ccab5",
    light: "#7ef2cf",
    dark: "#0b827e",
    horn: "mid",
    power: "Вездеход",
    icon: "🌲",
    effect: "allterrain",
    duration: 6,
    cooldown: 9,
    description: "Выезжает на обочину, а грязь и лёд больше не мешают.",
  },
  pickup: {
    name: "Пикап",
    kind: "pickup",
    color: "#fa783d",
    light: "#ffc478",
    dark: "#aa4725",
    horn: "low",
    power: "Магнит",
    icon: "🧲",
    effect: "magnet",
    duration: 6,
    cooldown: 9,
    description: "Сильный магнит притягивает звёзды с соседних полос.",
  },
  retro: {
    name: "Ретро",
    kind: "retro",
    color: "#b48bfa",
    light: "#e5ceff",
    dark: "#7555ab",
    horn: "mid",
    power: "Призрак",
    icon: "👻",
    effect: "ghost",
    duration: 5,
    cooldown: 9,
    description: "Становится прозрачной и проходит сквозь весь поток.",
  },
  taxi: {
    name: "Такси",
    kind: "sedan",
    color: "#ffce31",
    light: "#fff390",
    dark: "#ba8217",
    horn: "mid",
    power: "Звёздный тариф",
    icon: "✌️",
    effect: "double",
    duration: 4,
    cooldown: 14,
    description: "Каждая собранная звезда считается за две!",
  },
  van: {
    name: "Кемпер",
    kind: "van",
    color: "#5ab9e3",
    light: "#c0edff",
    dark: "#3277b1",
    horn: "mid",
    power: "Попутный ветер",
    icon: "💨",
    effect: "wind",
    duration: 5,
    cooldown: 9,
    description: "Ветер сдувает препятствия, а кемпер едет быстрее.",
  },
  police: {
    name: "Полицейская",
    kind: "police",
    color: "#e4edf5",
    light: "#c1e8ff",
    dark: "#194392",
    horn: "siren",
    power: "Сирена",
    icon: "🚨",
    effect: "siren",
    duration: 6,
    cooldown: 9,
    description: "Включает мигалки: машины впереди уступают твою полосу.",
  },
  fire: {
    name: "Пожарная",
    kind: "fire",
    color: "#f44335",
    light: "#ff9e68",
    dark: "#a5222b",
    horn: "siren",
    power: "Водомёт",
    icon: "💦",
    effect: "water",
    duration: 4,
    cooldown: 8,
    description: "Лафет направляет воду на огонь, пока пламя не погаснет.",
  },
  ambulance: {
    name: "Скорая",
    kind: "ambulance",
    color: "#f2f5e8",
    light: "#ffffff",
    dark: "#93b6a6",
    horn: "siren",
    power: "Помощь рядом",
    icon: "💖",
    effect: "rescue",
    duration: 5,
    cooldown: 12,
    description: "Освобождает место вокруг и превращает помехи в звёзды.",
  },
  offroad: {
    name: "Монстр",
    kind: "monster",
    color: "#a6d83b",
    light: "#e5fa85",
    dark: "#5a8e25",
    horn: "low",
    power: "Большие колёса",
    icon: "💪",
    effect: "monster",
    duration: 6,
    cooldown: 9,
    description: "Вырастает и перекатывается через машины и препятствия.",
  },
  tow: {
    name: "Эвакуатор",
    kind: "tow",
    color: "#ffad30",
    light: "#ffe189",
    dark: "#bd731a",
    horn: "truck",
    power: "Крюк",
    icon: "⚓",
    effect: "hook",
    duration: 1.35,
    cooldown: 5,
    description: "Трос тянет машину на обочину или подбирает звезду.",
  },
  bus: {
    name: "Весёлый автобус",
    kind: "bus",
    color: "#ffb829",
    light: "#ffe48a",
    dark: "#bd7619",
    horn: "truck",
    power: "Звёздный экспресс",
    icon: "🌠",
    effect: "express",
    duration: 6,
    cooldown: 10,
    description: "Собирает звёзды со всей ширины дороги, как пассажиров.",
  },
  icecream: {
    name: "Мороженка",
    kind: "icecream",
    color: "#f68ac4",
    light: "#ffd6ea",
    dark: "#b74b93",
    horn: "mid",
    power: "Заморозка",
    icon: "❄️",
    effect: "freeze",
    duration: 5,
    cooldown: 9,
    description:
      "Замораживает поток: машины останавливаются, а ты едешь дальше.",
  },
  formula: {
    name: "Болид",
    kind: "formula",
    color: "#12c7d6",
    light: "#8ff2f7",
    dark: "#0a7f8c",
    horn: "high",
    power: "Турбо",
    icon: "🏁",
    effect: "draft",
    duration: 3.5,
    cooldown: 7,
    description: "За машиной впереди ловит воздушный след и совершает обгон.",
  },
  bike: {
    name: "Байк",
    kind: "bike",
    color: "#ff5a1f",
    light: "#ffa06e",
    dark: "#b5360c",
    horn: "high",
    power: "Вилли",
    icon: "🏍️",
    effect: "wheelie",
    duration: 1.4,
    cooldown: 6,
    description: "Поднимает переднее колесо и переезжает конусы на заднем.",
  },
  buggy: {
    name: "Багги",
    kind: "buggy",
    color: "#ffd000",
    light: "#fff07a",
    dark: "#b89400",
    horn: "low",
    power: "Прыг-скок",
    icon: "🦘",
    effect: "bounce",
    duration: 5,
    cooldown: 9,
    description: "Скачет как кенгуру прямо над машинами и конусами.",
  },
  mixer: {
    name: "Миксер",
    kind: "mixer",
    color: "#ff7a1a",
    light: "#ffb36e",
    dark: "#b84f06",
    horn: "truck",
    power: "Вихрь",
    icon: "🌀",
    effect: "tornado",
    duration: 3.5,
    cooldown: 10,
    description: "Барабан раскручивает вихрь, и дорога впереди чистая.",
  },
  dump: {
    name: "Самосвал",
    kind: "dump",
    color: "#ffc21a",
    light: "#ffe27a",
    dark: "#b58600",
    horn: "truck",
    power: "Звёздный кузов",
    icon: "🎁",
    effect: "tip",
    duration: 1.5,
    cooldown: 14,
    description: "Поднимает кузов и высыпает три звезды по дуге.",
  },
  roller: {
    name: "Каток «Блинчик»",
    kind: "roller",
    color: "#ffae00",
    light: "#ffe07a",
    dark: "#b36f00",
    horn: "low",
    power: "Раскатай в блин",
    icon: "🥞",
    effect: "steamroll",
    duration: 4.5,
    cooldown: 12,
    description: "Разгоняется всё быстрее и раскатывает машины в блинчики.",
  },
  digger: {
    name: "Копатель",
    kind: "digger",
    color: "#ffb300",
    light: "#ffd97a",
    dark: "#a87500",
    horn: "low",
    power: "Боковой подхват",
    icon: "🏗️",
    effect: "scoop",
    duration: 6,
    cooldown: 9,
    description: "Подхватывает помехи сбоку и оставляет звезду.",
  },
  garbage: {
    name: "Чистюля",
    kind: "garbage",
    color: "#2fbf71",
    light: "#8fe8b4",
    dark: "#16794a",
    horn: "truck",
    power: "Чистая дорога",
    icon: "♻️",
    effect: "vacuum",
    duration: 5,
    cooldown: 10,
    description: "Всасывает всё лишнее с двух полос и отдаёт звёздами.",
  },
  train: {
    name: "Паровозик",
    kind: "train",
    color: "#e5352e",
    light: "#ff8f86",
    dark: "#96150f",
    horn: "truck",
    power: "Чух-чух",
    icon: "🚂",
    effect: "whistle",
    duration: 4,
    cooldown: 8,
    description: "Свистком подзывает вагончик, и он повторяет повороты.",
  },
  ufo: {
    name: "Тарелка",
    kind: "ufo",
    color: "#7c5cff",
    light: "#c3b3ff",
    dark: "#4427c0",
    horn: "high",
    power: "Луч",
    icon: "🛸",
    effect: "beam",
    duration: 6,
    cooldown: 10,
    description: "Поднимает ближайшую звезду лучом с любой полосы.",
  },
  limo: {
    name: "Лимузин",
    kind: "limo",
    color: "#1c1f2b",
    light: "#4a5068",
    dark: "#0b0d14",
    horn: "low",
    power: "Звёздный приём",
    icon: "🎩",
    effect: "carpet",
    duration: 4,
    cooldown: 14,
    description: "Расстилает красную дорожку в своей полосе. На ней звёзды стоят втрое дороже.",
  },
  shark: {
    name: "Акула",
    kind: "shark",
    color: "#4f8fc0",
    light: "#a8d4ef",
    dark: "#23597f",
    horn: "low",
    power: "Волна",
    icon: "🦈",
    effect: "wave",
    duration: 4,
    cooldown: 8,
    description: "Волна от плавника сдвигает машины и конусы на соседние полосы.",
  },
  bug: {
    name: "Коровка",
    kind: "bug",
    color: "#ef2b2d",
    light: "#ff8d8d",
    dark: "#9c1012",
    horn: "high",
    power: "Крылышки",
    icon: "🐞",
    effect: "fly",
    duration: 5,
    cooldown: 10,
    description: "Расправляет крылья и летит над дорогой за высокими звёздами.",
  },
  harvester: {
    name: "Комбайн",
    kind: "harvester",
    color: "#45b649",
    light: "#a4e8a0",
    dark: "#22792a",
    horn: "low",
    power: "Жатва",
    icon: "🌾",
    effect: "harvest",
    duration: 6,
    cooldown: 9,
    description: "Жатка срезает колосья. На дороге остаются стерня и звёзды.",
  },
  comet: {
    name: "Комета",
    kind: "sport",
    color: "#ffb700",
    light: "#ffe07a",
    dark: "#b57a00",
    horn: "high",
    power: "Хвост кометы",
    icon: "☄️",
    effect: "comet",
    duration: 4.5,
    cooldown: 9,
    description: "Мчится с золотым хвостом и притягивает звёзды.",
  },
  neon: {
    name: "Неон",
    kind: "sport",
    color: "#171b27",
    light: "#3a4058",
    dark: "#07090f",
    horn: "high",
    power: "Радуга",
    icon: "🌈",
    effect: "rainbow",
    duration: 5,
    cooldown: 10,
    description: "Рисует радугу и расчищает всё на своём пути.",
  },
};
// Рядом стоят разные силуэты: так гараж не выглядит однообразным
const CAR_ORDER = [
  "racer",
  "formula",
  "ufo",
  "train",
  "tank",
  "bike",
  "roller",
  "offroad",
  "shark",
  "truck",
  "comet",
  "tractor",
  "bug",
  "police",
  "buggy",
  "fire",
  "neon",
  "digger",
  "hyper",
  "mixer",
  "ambulance",
  "coupe",
  "dump",
  "taxi",
  "limo",
  "bus",
  "ev",
  "harvester",
  "roadster",
  "garbage",
  "hatch",
  "suv",
  "icecream",
  "pickup",
  "tow",
  "retro",
  "van",
];

function rr(g, x, y, w, h, r, fill, stroke) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1.5;
    g.stroke();
  }
}
function ellipse(g, x, y, rx, ry, fill) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}
function line(g, x1, y1, x2, y2, color, width = 2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
}
function gradient(g, x, y, w, h, a, b, c) {
  const v = g.createLinearGradient(x, y, x + w, y + h);
  v.addColorStop(0, a);
  v.addColorStop(0.46, b);
  v.addColorStop(1, c || b);
  return v;
}
function slab(g, x, y, w, h, r, a, b, c, depth = 6) {
  rr(g, x + 2, y + depth, w, h, r, c);
  rr(g, x, y, w, h, r, gradient(g, x, y, w, 0, a, b, c));
  rr(g, x + 3, y + 2, w - 6, 3, 1, "#ffffff65");
}
function tire(g, x, y, w, h, t) {
  rr(g, x + 3, y + 5, w, h, 6, "#112e3440");
  rr(
    g,
    x,
    y,
    w,
    h,
    5,
    gradient(g, x, y, w, 0, "#5d6370", "#202d39", "#101d2a"),
  );
  for (let k = 2; k < h - 2; k += 7) {
    line(
      g,
      x + 2,
      y + ((k + t * 25) % (h - 4)) + 2,
      x + w - 2,
      y + ((k + t * 25) % (h - 4)) + 2,
      "#73808b",
      1.3,
    );
  }
  rr(g, x + 3, y + 4, 2, h - 8, 1, "#ffffff25");
}
function glass(g, x, y, w, h) {
  rr(g, x + 1, y + 3, w, h, 6, "#163955");
  rr(
    g,
    x,
    y,
    w,
    h,
    6,
    gradient(g, x, y, w, h, "#b2edff", "#4689ab", "#25546c"),
    "#e7ffff65",
  );
  g.save();
  g.beginPath();
  rr(g, x, y, w, h, 6);
  g.clip();
  g.fillStyle = "#f1ffff66";
  g.beginPath();
  g.moveTo(x + w * 0.2, y);
  g.lineTo(x + w * 0.48, y);
  g.lineTo(x + w * 0.12, y + h);
  g.lineTo(x - w * 0.15, y + h);
  g.fill();
  g.restore();
}
const CAR_SIZES = {
  formula: [66, 118],
  bike: [40, 104],
  buggy: [74, 100],
  mixer: [84, 170],
  dump: [84, 160],
  digger: [84, 130],
  roller: [88, 140],
  garbage: [82, 160],
  train: [76, 150],
  ufo: [84, 84],
  limo: [70, 178],
  shark: [70, 130],
  bug: [72, 92],
  harvester: [96, 150],
};
function carSize(type) {
  const k = CARS[type].kind;
  if (CAR_SIZES[k]) return { w: CAR_SIZES[k][0], h: CAR_SIZES[k][1] };
  return {
    w: k === "tank" ? 84 : k === "monster" ? 90 : k === "tractor" ? 85 : 70,
    h:
      k === "truck"
        ? 206
        : k === "bus"
          ? 164
          : k === "tank"
            ? 122
            : k === "tractor"
              ? 112
              : ["van", "fire", "ambulance", "icecream"].includes(k)
                ? 142
                : k === "compact"
                  ? 100
                  : 122,
  };
}

function drawVehicle(g, type, x, y, s = 1, o = {}) {
  const c = CARS[type] || CARS.racer,
    k = c.kind,
    dim = carSize(type),
    w = dim.w,
    h = dim.h,
    t = o.time || 0;
  g.save();
  g.translate(x, y);
  g.rotate(o.angle || 0);
  g.scale(s, s);
  g.lineJoin = "round";
  g.lineCap = "round";
  if (o.shadow !== false) {
    ellipse(g, 10, 12 + (o.lift || 0), w * 0.61, h * 0.5, "#132d3e2c");
    ellipse(g, 6, 8 + (o.lift || 0), w * 0.48, h * 0.44, "#132d3e22");
  }
  g.translate(0, -(o.lift || 0));
  if (o.ghost) g.globalAlpha = 0.43;
  if (o.boost) {
    for (const xx of [-18, 18]) {
      const len = 38 + Math.sin(t * 35) * 12;
      g.fillStyle = "#ff8b20";
      g.beginPath();
      g.moveTo(xx - 9, h / 2 - 3);
      g.quadraticCurveTo(xx - 8, h / 2 + 22, xx, h / 2 + len);
      g.quadraticCurveTo(xx + 8, h / 2 + 22, xx + 9, h / 2 - 3);
      g.fill();
      ellipse(g, xx, h / 2 + 10, 4, 16, "#fff4a2");
    }
  }
  if (k === "tank") {
    tire(g, -45, -53, 23, 111, t);
    tire(g, 22, -53, 23, 111, t);
    slab(g, -33, -55, 66, 112, 11, c.light, c.color, c.dark, 7);
    for (const xx of [-28, 18]) {
      rr(g, xx, -44, 10, 84, 4, "#315c3988");
      for (let q = 0; q < 5; q++)
        rr(g, xx + 2, q * 16 - 39, 6, 9, 2, "#bde06688");
    }
    slab(g, -25, -26, 50, 57, 15, c.light, c.color, c.dark, 9);
    slab(
      g,
      -7,
      -91 + (o.recoil || 0),
      14,
      66,
      4,
      "#d8ef94",
      "#82b747",
      "#385e30",
      4,
    );
    rr(g, -10, -98 + (o.recoil || 0), 20, 16, 4, "#42682f");
    rr(g, -6, -98 + (o.recoil || 0), 12, 3, 1, "#193d30");
    ellipse(g, 4, 3, 15, 15, "#3b7039");
    ellipse(g, 2, 0, 13, 13, "#a3ce61");
    line(g, -6, 0, 9, 0, "#eff8a7", 2);
    starShape(g, -18, 41, 8, "#f7ed95");
    rr(g, -29, -49, 9, 5, 2, "#fffbb9");
    rr(g, 20, -49, 9, 5, 2, "#fffbb9");
  } else if (k === "truck") {
    for (const yy of [-73, 30, 65])
      for (const xx of [-37, 24]) tire(g, xx, yy, 14, 25, t);
    slab(g, -33, -104, 66, 59, 10, c.light, c.color, c.dark, 7);
    glass(g, -26, -91, 52, 20);
    rr(g, -24, -102, 48, 4, 2, "#ecfaff");
    slab(g, -29, -60, 58, 12, 4, "#d6edff", "#86a6bc", "#4d657b", 4);
    slab(g, -36, -38, 72, 139, 8, "#fff9d6", "#ffdf8d", "#d39e4d", 8);
    for (let q = 0; q < 9; q++)
      line(g, -29, q * 14 - 28, 29, q * 14 - 28, "#fff9df", 2);
    rr(g, -25, -10, 50, 77, 8, c.color);
    starShape(g, 0, 26, 19, "#fff3bb");
    rr(g, -30, 92, 60, 5, 2, "#fff7da");
    rr(g, -31, -98, 12, 5, 2, "#fffadc");
    rr(g, 19, -98, 12, 5, 2, "#fffadc");
  } else if (k === "tractor") {
    for (const xx of [-41, 22]) tire(g, xx, 6, 21, 49, t);
    for (const xx of [-34, 20]) tire(g, xx, -50, 15, 28, t);
    slab(g, -23, -54, 46, 91, 8, c.light, c.color, c.dark, 8);
    for (let n = 0; n < 5; n++)
      line(g, -13, -43 + n * 5, 13, -43 + n * 5, "#218a54", 2);
    rr(g, 21, -37, 7, 28, 3, "#253f48");
    ellipse(g, 24, -37, 5, 3, "#4c6270");
    slab(g, -28, -4, 56, 44, 8, "#e4ff9b", "#7bd05a", "#2b8b52", 7);
    glass(g, -22, 2, 44, 28);
    slab(g, -28, 0, 56, 8, 3, "#f5f9b3", "#b5df6e", "#3c8554", 2);
    rr(g, -22, -51, 10, 6, 2, "#fff6b1");
    rr(g, 12, -51, 10, 6, 2, "#fff6b1");
    if (o.active) {
      line(g, -18, -42, -30, -77, "#c5a335", 8);
      line(g, 18, -42, 30, -77, "#c5a335", 8);
      slab(g, -60, -85, 120, 22, 6, "#fff58a", "#ffc342", "#b97820", 8);
      for (let n = 0; n < 7; n++) rr(g, -48 + n * 16, -87, 7, 8, 2, "#fff8b4");
    }
  } else {
    const wide = k === "monster",
      compact = k === "compact",
      box = ["van", "bus", "fire", "ambulance", "icecream"].includes(k),
      bodyW = wide ? 65 : 58;
    for (const yy of [-h * 0.31, h * 0.22])
      for (const xx of [-(wide ? 46 : 37), wide ? 25 : 24])
        tire(g, xx, yy, wide ? 22 : 14, wide ? 42 : 27, t);
    if (k === "bus") for (const xx of [-37, 24]) tire(g, xx, 0, 14, 26, t);
    slab(
      g,
      -bodyW / 2,
      -h / 2,
      bodyW,
      h,
      box ? 12 : 17,
      c.light,
      c.color,
      c.dark,
      8,
    );
    rr(g, -bodyW / 2 + 2, -h / 2 + 10, 3, h - 23, 2, "#fff7d77a");
    rr(g, bodyW / 2 - 5, -h / 2 + 13, 3, h - 26, 2, c.dark);
    if (k === "pickup" || k === "tow") {
      glass(g, -23, -40, 46, 22);
      slab(g, -25, -18, 50, 24, 5, c.light, c.color, c.dark, 4);
      rr(g, -23, 14, 46, 38, 5, "#325269");
      rr(g, -18, 19, 36, 28, 3, "#45667c");
      for (let n = 0; n < 4; n++)
        line(g, -12 + n * 8, 22, -12 + n * 8, 44, "#7293a1", 1);
      if (k === "tow") {
        line(g, 0, 2, 0, 37, "#f6f0c6", 10);
        line(g, 0, 36, 13, 47, "#405265", 4);
        g.beginPath();
        g.arc(10, 49, 6, 0, Math.PI);
        g.stroke();
      }
    } else if (k === "fire") {
      glass(g, -23, -56, 46, 24);
      slab(g, -22, -23, 44, 79, 5, "#f2efdd", "#cbd9d7", "#789397", 4);
      for (const xx of [-15, 15]) line(g, xx, -18, xx, 48, "#fff9da", 4);
      for (let n = 0; n < 7; n++)
        line(g, -15, -14 + n * 9, 15, -14 + n * 9, "#fff9da", 3);
    } else if (box) {
      glass(g, -24, -h / 2 + 10, 48, 22);
      slab(g, -23, -h / 2 + 40, 46, h - 56, 7, c.light, c.color, c.dark, 4);
      if (k === "bus") {
        for (let n = 0; n < 5; n++)
          for (const xx of [-29, 24])
            rr(g, xx, -31 + n * 19, 5, 12, 2, "#83cde7");
        rr(g, -14, -16, 28, 40, 8, "#fff2ad");
        starShape(g, 0, 3, 10, "#eda82e");
      }
      if (k === "ambulance") {
        rr(g, -6, -1, 12, 36, 3, "#f15165");
        rr(g, -18, 11, 36, 12, 3, "#f15165");
      }
      if (k === "icecream") {
        g.fillStyle = "#db9d56";
        g.beginPath();
        g.moveTo(-13, 13);
        g.lineTo(13, 13);
        g.lineTo(0, 44);
        g.fill();
        ellipse(g, 0, 9, 16, 16, "#bc5d8e");
        ellipse(g, -2, 5, 16, 16, "#fff2d7");
        ellipse(g, -5, -1, 5, 5, "#ffffff");
        ellipse(g, 3, -10, 4, 4, "#f45a70");
      }
      if (k === "van") {
        rr(g, -16, 1, 32, 41, 7, "#fff5dd");
        glass(g, -12, 6, 24, 20);
      }
    } else {
      glass(g, -25, -h * 0.22, 50, 29);
      glass(g, -22, h * 0.25, 44, 16);
      if (k === "open") {
        rr(g, -22, 1, 44, 35, 5, "#344750");
        for (const xx of [-18, 3])
          slab(g, xx, 7, 15, 21, 4, "#ffeac3", "#b57b51", "#5a4f46", 3);
      } else {
        slab(g, -23, -1, 46, h * 0.28, 7, c.light, c.color, c.dark, 4);
        rr(g, -17, 4, 3, h * 0.2, 2, "#ffffff80");
      }
      if (k === "sport") {
        for (const xx of [-9, 4]) {
          rr(g, xx, -h / 2 + 6, 5, h * 0.25, 2, "#fff7dc");
          rr(g, xx, h * 0.4, 5, 12, 2, "#fff7dc");
        }
        slab(g, -36, h / 2 - 9, 72, 8, 3, "#385164", "#243443", "#122f40", 4);
      }
      if (k === "retro") {
        ellipse(g, -21, -h / 2 + 8, 6, 7, "#fff5ce");
        ellipse(g, 21, -h / 2 + 8, 6, 7, "#fff5ce");
        rr(g, -14, -h / 2 + 8, 28, 13, 4, "#b7d2d3");
        for (let n = 0; n < 4; n++)
          line(
            g,
            -9 + n * 6,
            -h / 2 + 10,
            -9 + n * 6,
            -h / 2 + 19,
            "#597a8b",
            2,
          );
      }
      if (k === "sedan" && type === "taxi") {
        slab(g, -17, 1, 34, 15, 4, "#fff7c2", "#ffdf49", "#ba921d", 3);
        g.font = "bold 8px system-ui";
        g.textAlign = "center";
        g.fillStyle = "#4b552f";
        g.fillText("TAXI", 0, 12);
      }
      if (type === "ev") {
        rr(g, -18, 4, 36, 24, 5, "#426c84");
        line(g, -12, 30, 12, 30, "#a6fdff", 2);
      }
      if (k === "suv" || wide) {
        for (const xx of [-20, 18]) rr(g, xx, 1, 3, 30, 2, "#f6f0bd");
        if (wide) {
          rr(g, -17, 0, 34, 28, 4, "#4b6329");
          starShape(g, 0, 14, 10, "#e9f595");
        }
      }
    }
    if (["police", "ambulance", "fire"].includes(k)) {
      rr(g, -24, box ? -29 : 0, 48, 10, 3, "#233c57");
      const yy = box ? -28 : 1;
      rr(g, -22, yy, 20, 7, 2, Math.sin(t * 11) > 0 ? "#f96778" : "#b83e5e");
      rr(g, 2, yy, 20, 7, 2, Math.sin(t * 11) > 0 ? "#3462c5" : "#95efff");
      if (k === "police") {
        starShape(g, 0, 26, 10, "#e9f4e6");
        rr(g, -29, -52, 58, 13, 5, "#f0f8ed");
      }
    }
    for (const xx of [-25, 15]) {
      rr(g, xx, -h / 2 + 5, 10, 5, 2, "#fff8b7");
      rr(g, xx, h / 2 - 7, 10, 4, 2, "#ff644f");
    }
    if (type !== "racer" && k !== "sport")
      rr(g, -21, h / 2 - 1, 42, 4, 2, "#d0e9df");
    // Боковые зеркала с отдельной тенью.
    for (const xx of [-37, 29])
      slab(g, xx, -h * 0.15, 8, 12, 3, c.light, c.color, c.dark, 3);
  }
  g.restore();
}
function starShape(g, x, y, r, color) {
  g.beginPath();
  for (let n = 0; n < 10; n++) {
    const a = (n * Math.PI) / 5 - Math.PI / 2,
      rrr = n % 2 ? r * 0.48 : r;
    const xx = x + Math.cos(a) * rrr,
      yy = y + Math.sin(a) * rrr;
    n ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

// Чем стреляет каждая машина: значок на кнопке, форма снаряда, цвета и звук.
// rate — пауза между выстрелами, size — размер, twin — сразу два снаряда,
// bounce — снаряд скачет по дороге, blast — разрыв задевает соседние преграды.
const PARTY_COLORS = ["#ff4f7e", "#ffd23f", "#3fd1ff", "#7be04f", "#b57bff"];
const AMMO = {
  racer: { name: "огнём", icon: "🔥", shape: "ball", colors: ["#ff7a1f", "#ffc23b", "#ff4f2e"], sound: "whoosh", rate: 0.18, size: 0.28 },
  tank: { name: "конфетти", icon: "🎉", shape: "ball", colors: PARTY_COLORS, sound: "boom", rate: 0.42, size: 0.5, blast: true },
  truck: { name: "гудком", icon: "📣", shape: "ring", colors: ["#ffe14d", "#fff4b0"], sound: "honk", rate: 0.3, size: 0.55 },
  tractor: { name: "сеном", icon: "🌾", shape: "cube", colors: ["#e6c14f", "#cfa23a"], sound: "thud", rate: 0.26, size: 0.26 },
  coupe: { name: "кольцами", icon: "💫", shape: "ring", colors: ["#b57bff", "#e3c8ff"], sound: "pop", rate: 0.24, size: 0.4 },
  ev: { name: "молнией", icon: "⚡", shape: "star", colors: ["#7ff4ff", "#ffffff"], sound: "laser", rate: 0.2, size: 0.42 },
  hyper: { name: "искрами", icon: "✨", shape: "flake", colors: ["#ffffff", "#bfe9ff", "#ffd6f5"], sound: "laser", rate: 0.18, size: 0.22, twin: true },
  roadster: { name: "звёздами", icon: "⭐", shape: "star", colors: ["#ffd23f", "#fff0a0"], sound: "ding", rate: 0.24, size: 0.46 },
  hatch: { name: "конфетами", icon: "🍬", shape: "ball", colors: ["#ff8fc7", "#7fd8ff", "#fff07a"], sound: "pop", rate: 0.16, size: 0.2 },
  suv: { name: "листьями", icon: "🍀", shape: "flake", colors: ["#6fd36a", "#3fb04f"], sound: "whoosh", rate: 0.2, size: 0.3 },
  pickup: { name: "магнитами", icon: "🧲", shape: "ring", colors: ["#ff5148", "#d9dfe6"], sound: "clank", rate: 0.28, size: 0.36 },
  retro: { name: "музыкой", icon: "🎵", shape: "ball", colors: ["#b57bff", "#ff8fc7", "#7fd8ff"], sound: "note", rate: 0.26, size: 0.24 },
  taxi: { name: "монетками", icon: "🪙", shape: "coin", colors: ["#ffc23b", "#ffe27a"], sound: "clank", rate: 0.24, size: 0.3 },
  van: { name: "ветром", icon: "🌬️", shape: "ring", colors: ["#d9f6ff", "#ffffff"], sound: "whoosh", rate: 0.24, size: 0.55 },
  police: { name: "огоньками", icon: "🚨", shape: "ball", colors: ["#ff3b3b", "#3b7bff"], sound: "siren", rate: 0.2, size: 0.24, twin: true },
  fire: { name: "водой", icon: "💧", shape: "drop", colors: ["#59c8ff", "#bff0ff"], sound: "water", rate: 0.14, size: 0.28, douses: "brazier" },
  ambulance: { name: "сердечками", icon: "❤️", shape: "heart", colors: ["#ff5d7e", "#ffb3c4"], sound: "ding", rate: 0.26, size: 0.34 },
  offroad: { name: "мячами", icon: "🏀", shape: "ball", colors: ["#ff8a2b", "#e56a12"], sound: "thud", rate: 0.34, size: 0.48, bounce: true },
  tow: { name: "шестерёнками", icon: "⚙️", shape: "ring", colors: ["#c9d2dc", "#8f9aa6"], sound: "clank", rate: 0.26, size: 0.34 },
  bus: { name: "билетиками", icon: "🎟️", shape: "card", colors: ["#ffd23f", "#ff8fc7", "#7fd8ff"], sound: "pop", rate: 0.2, size: 0.24 },
  icecream: { name: "мороженым", icon: "🍦", shape: "ball", colors: ["#ffd1e6", "#fff6e0", "#bff5d8"], sound: "pop", rate: 0.24, size: 0.34 },
  formula: { name: "флажками", icon: "🏁", shape: "card", colors: ["#ffffff", "#22262b"], sound: "whoosh", rate: 0.14, size: 0.2 },
  bike: { name: "искрами", icon: "💥", shape: "flake", colors: ["#ffe14d", "#ff9a2e"], sound: "laser", rate: 0.14, size: 0.22 },
  buggy: { name: "мячиками", icon: "🎾", shape: "ball", colors: ["#c6f24d", "#a8dd2e"], sound: "thud", rate: 0.24, size: 0.3, bounce: true },
  mixer: { name: "красками", icon: "🎨", shape: "ball", colors: PARTY_COLORS, sound: "pop", rate: 0.22, size: 0.36 },
  dump: { name: "камнями", icon: "🪨", shape: "rock", colors: ["#9a8f86", "#7d736b"], sound: "thud", rate: 0.32, size: 0.4 },
  roller: { name: "блинчиками", icon: "🥞", shape: "coin", colors: ["#f2c46d", "#e0a84a"], sound: "thud", rate: 0.3, size: 0.42 },
  digger: { name: "землёй", icon: "🪣", shape: "rock", colors: ["#a8754a", "#7f5532"], sound: "thud", rate: 0.28, size: 0.3 },
  garbage: { name: "кубиками", icon: "♻️", shape: "cube", colors: ["#57c785", "#2f9e64"], sound: "clank", rate: 0.26, size: 0.26 },
  train: { name: "паром", icon: "☁️", shape: "puff", colors: ["#ffffff", "#e8eef2"], sound: "whoosh", rate: 0.3, size: 0.6 },
  ufo: { name: "лучом", icon: "🛸", shape: "ring", colors: ["#7cff8a", "#c8ffd0"], sound: "laser", rate: 0.18, size: 0.42 },
  limo: { name: "розами", icon: "🌹", shape: "flake", colors: ["#ff3b5c", "#ff8fa6"], sound: "ding", rate: 0.22, size: 0.3 },
  shark: { name: "пузырями", icon: "🐟", shape: "bubble", colors: ["#bff0ff", "#ffffff"], sound: "bubble", rate: 0.16, size: 0.34 },
  bug: { name: "цветами", icon: "🌸", shape: "flake", colors: ["#ff9ec7", "#ffd6e8"], sound: "pop", rate: 0.2, size: 0.3 },
  harvester: { name: "зерном", icon: "🌽", shape: "ball", colors: ["#ffd23f", "#f0b52c"], sound: "pop", rate: 0.14, size: 0.2, douses: "crop" },
  comet: { name: "кометами", icon: "☄️", shape: "star", colors: ["#7fd8ff", "#ffffff"], sound: "whoosh", rate: 0.2, size: 0.5 },
  neon: { name: "радугой", icon: "🌈", shape: "ball", colors: ["#ff4f7e", "#ffb02e", "#ffe14d", "#7be04f", "#3fd1ff", "#b57bff"], sound: "laser", rate: 0.14, size: 0.26 },
};
