// Миры и лабиринты «Волшебного клубочка». Лабиринт строит генератор (maze.js) из описания:
// w×h — клетки, seed — зерно, braid — доля тупиков, превращённых в петли, items — угощения,
// keys — ворота с ключами, rooms — ледяные залы, ice — доля коридорных клеток со льдом,
// colors — цвета кнопок с мостиками, dark — ночь (видно вокруг фонарика).
// Каждый уровень проверяет tests/maze.mjs; лёгкий вариант (easy) — на случай, если ребёнку трудно.

export const WORLDS = [
  { id: "garden", name: "Цветущий сад", item: "ягодки", itemOne: "ягодка", icon: "🍓", friend: "зайчик", friendIcon: "🐰", bg: "linear-gradient(#a8f07a,#3fc86a)" },
  { id: "castle", name: "Сказочный замок", item: "кристаллы", itemOne: "кристалл", icon: "💎", friend: "мышка-принцесса", friendIcon: "🐭", bg: "linear-gradient(#ffb8e8,#c86adc)" },
  { id: "ice", name: "Ледяная пещера", item: "снежинки", itemOne: "снежинка", icon: "❄️", friend: "пингвинёнок", friendIcon: "🐧", bg: "linear-gradient(#bff0ff,#5fb4ff)" },
  { id: "forest", name: "Ночной лес", item: "светлячки", itemOne: "светлячок", icon: "✨", friend: "совёнок", friendIcon: "🦉", bg: "linear-gradient(#7a8aff,#2f3a8a)" },
  { id: "clouds", name: "Облачный город", item: "конфетки", itemOne: "конфетка", icon: "🍬", friend: "барашек", friendIcon: "🐑", bg: "linear-gradient(#ffe0a0,#ff9fc8)" },
];

const L = (world, n, spec) => ({ id: `${WORLDS[world].id}-${n}`, world, n, name: `${WORLDS[world].name} · ${n}`, ...spec });
export const LEVELS = [
  // Сад: просто дойти до зайчика и собрать ягодки
  L(0, 1, { w: 4, h: 4, seed: 11, items: 1, straight: 0.5, minPath: 0.35 }),
  L(0, 2, { w: 5, h: 5, seed: 12, items: 2, straight: 0.4 }),
  L(0, 3, { w: 6, h: 6, seed: 13, items: 3, braid: 0.1 }),
  L(0, 4, { w: 7, h: 7, seed: 14, items: 3, braid: 0.15 }),
  L(0, 5, { w: 8, h: 8, seed: 15, items: 4, braid: 0.2 }),
  // Замок: цветные ключи открывают ворота своего цвета
  L(1, 1, { w: 5, h: 5, seed: 21, items: 2, keys: 1 }),
  L(1, 2, { w: 6, h: 6, seed: 22, items: 3, keys: 1 }),
  L(1, 3, { w: 7, h: 7, seed: 23, items: 3, keys: 2 }),
  L(1, 4, { w: 8, h: 8, seed: 24, items: 3, keys: 2 }),
  L(1, 5, { w: 9, h: 9, seed: 25, items: 4, keys: 3 }),
  // Ледяная пещера: на льду котёнок скользит до стенки
  L(2, 1, { w: 5, h: 5, seed: 31, items: 2, rooms: 1, minPath: 0.22 }),
  L(2, 2, { w: 6, h: 6, seed: 32, items: 3, rooms: 1, ice: 0.15, minPath: 0.22 }),
  L(2, 3, { w: 7, h: 7, seed: 33, items: 3, rooms: 2, ice: 0.15, minPath: 0.2 }),
  L(2, 4, { w: 8, h: 8, seed: 34, items: 3, rooms: 2, ice: 0.2, minPath: 0.18 }),
  L(2, 5, { w: 9, h: 9, seed: 35, items: 4, rooms: 3, ice: 0.2, minPath: 0.18 }),
  // Ночной лес: темно, светлячки светятся издалека
  L(3, 1, { w: 6, h: 6, seed: 41, items: 3, dark: true, braid: 0.1 }),
  L(3, 2, { w: 7, h: 7, seed: 42, items: 3, dark: true, braid: 0.15 }),
  L(3, 3, { w: 7, h: 7, seed: 43, items: 3, dark: true, keys: 1 }),
  L(3, 4, { w: 8, h: 8, seed: 44, items: 4, dark: true, keys: 1 }),
  L(3, 5, { w: 9, h: 9, seed: 45, items: 4, dark: true, keys: 2 }),
  // Облачный город: кнопка переключает мостики своего цвета
  L(4, 1, { w: 5, h: 5, seed: 51, items: 2, colors: 1, braid: 0.3, minPath: 0.24 }),
  L(4, 2, { w: 6, h: 6, seed: 52, items: 3, colors: 1, braid: 0.3, minPath: 0.22 }),
  L(4, 3, { w: 7, h: 7, seed: 53, items: 3, colors: 1, braid: 0.3, minPath: 0.2, maxStates: 20 }),
  L(4, 4, { w: 8, h: 8, seed: 54, items: 3, colors: 2, braid: 0.3, minPath: 0.25, maxStates: 36 }),
  L(4, 5, { w: 9, h: 9, seed: 55, items: 4, colors: 2, braid: 0.3, minPath: 0.32, maxStates: 44 }),
];

// Лёгкий вариант: поменьше и с одной хитростью — если на прошлом лабиринте понадобилось много подсказок
export function easy(level) {
  if (level.n <= 2) return level;
  return {
    ...level,
    id: level.id + "-easy",
    easy: true,
    w: Math.max(4, level.w - 2),
    h: Math.max(4, level.h - 2),
    seed: level.seed + 500,
    items: Math.max(1, level.items - 1),
    keys: Math.min(level.keys || 0, 1),
    rooms: Math.min(level.rooms || 0, 1),
    colors: Math.min(level.colors || 0, 1),
  };
}

// Сюрприз-лабиринт: каждый раз новый, в одном из открытых миров
export function surprise(world, seed) {
  const pool = LEVELS.filter((l) => l.world === world && l.n >= 2);
  const base = pool[seed % pool.length];
  return { ...base, id: `surprise-${world}`, n: 0, surprise: true, name: `${WORLDS[world].name} · сюрприз`, seed: 9000 + (seed % 100000) };
}
