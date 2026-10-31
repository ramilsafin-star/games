// =====================================================
// ДАННЫЕ ИГРЫ: МИР, ГЕРОИ, МАТЕРИАЛЫ, БИОМЫ, УРОВНИ
// =====================================================
const WORLD_W = 1280;
const GROUND_Y = 650;
const SLING_X = 240;
const SLING_Y = GROUND_Y - 140;
const MAX_PULL = 115;
const LAUNCH_POWER = 0.2;
const STEP_MS = 1000 / 60;
const PORTAL_R = 34;
const GEM_R = 20;
// Как высоко над землёй долетает пуф на этом расстоянии (x, высота)
const REACH_TOP = [[450, 615], [600, 572], [700, 528], [800, 471], [900, 401], [1000, 318], [1100, 216], [1150, 160], [1200, 99]];

// Пуфы — герои игры. vs: множитель урона по материалу (кто что лучше ломает).
const HEROES = {
  rocky: {
    r: 22, density: 0.0042, restitution: 0.34, ability: 'roar',
    fur: ['#ffb07a', '#ff4d5e', '#b3123f'], line: '#5c0a2c', iris: '#7a2bff',
    trail: '#ff5470', lumps: 17, vs: { wood: 1.1, ice: 1, stone: 1 }
  },
  zip: {
    r: 20, density: 0.0034, restitution: 0.4, ability: 'dash',
    fur: ['#fff79a', '#ffcf1f', '#e6890a'], line: '#6b3a00', iris: '#00a6c8',
    trail: '#ffe14d', lumps: 15, vs: { wood: 1.4, ice: 1, stone: 0.6, steel: 0.4 }
  },
  trio: {
    r: 16, density: 0.0036, restitution: 0.42, ability: 'split',
    fur: ['#9ffbff', '#19c6f2', '#0a76c9'], line: '#04386e', iris: '#ff3d9a',
    trail: '#38e1ff', lumps: 14, vs: { wood: 0.8, ice: 2, stone: 0.5, steel: 0.35 }
  },
  nimbus: {
    r: 24, density: 0.0036, restitution: 0.38, ability: 'drop',
    fur: ['#ffffff', '#ecdfff', '#a98bf5'], line: '#4a2fa0', iris: '#2b7bff',
    trail: '#d6c2ff', lumps: 10, vs: { wood: 1, ice: 1, stone: 1 }
  },
  magma: {
    r: 25, density: 0.0055, restitution: 0.25, ability: 'blast',
    fur: ['#8c52ff', '#44209a', '#1c0b45'], line: '#0e0528', iris: '#ff8a1f',
    trail: '#ff7a1a', lumps: 12, vs: { wood: 1, ice: 1, stone: 1 }
  },
  drill: {
    r: 21, density: 0.0048, restitution: 0.28, ability: 'drill',
    fur: ['#e4ffb8', '#7ed957', '#2e8f3e'], line: '#14501f', iris: '#ff2e88',
    trail: '#9cff6a', lumps: 13, vs: { wood: 1, ice: 1, stone: 1 }
  },
  frost: {
    r: 21, density: 0.0038, restitution: 0.36, ability: 'frost',
    fur: ['#f4fffd', '#a8f0e8', '#2fa8a8'], line: '#0b4f5a', iris: '#ff6a3d',
    trail: '#c8fff6', lumps: 16, vs: { wood: 1, ice: 1.6, stone: 1 }
  }
};

const MATERIALS = {
  ice:   { hp: 20,  density: 0.0014, pts: 50,  chips: ['#d9fbff', '#7fe3ff', '#ffffff'], sound: 'ice' },
  wood:  { hp: 40,  density: 0.0022, pts: 80,  chips: ['#ffc46b', '#e8893a', '#8a4a1c'], sound: 'wood' },
  stone: { hp: 85, density: 0.0040, pts: 150, chips: ['#c9d2f2', '#8b95c7', '#565e96'], sound: 'stone' },
  steel: { hp: 300, density: 0.0062, pts: 300, chips: ['#f2f5ff', '#a3aec9', '#515b7a'], sound: 'stone' },
  boom:  { hp: 12,  density: 0.0020, pts: 200, chips: ['#ff5a3c', '#ffd23f', '#6d0f24'], sound: 'wood' }
};

// Шесть разных миров: у каждого своя палитра, рельеф и атмосфера
const BIOMES = [
  { id: 'meadow', sky: ['#1f9dff', '#6fd6ff', '#d9fbff'], sun: { x: 0.8, y: 0.2, r: 62, c: '#fff6a8', glow: '#ffe066' },
    cloud: '#ffffff', cloudShade: '#bfe6ff', far: ['#b6ecff', '#7fcdf2'], mid: ['#8df08f', '#2fbf63'],
    grass: ['#a6f25a', '#34c84a', '#1b8f3c'], dirt: ['#b86e32', '#7c4019', '#4a240d'], ambient: 'pollen', music: 0 },
  { id: 'blossom', sky: ['#ff5fb7', '#ffa4dd', '#fff0d9'], sun: { x: 0.2, y: 0.24, r: 74, c: '#fff4e0', glow: '#ffd0e8' },
    cloud: '#fff4fb', cloudShade: '#ffbfe3', far: ['#ffc6ea', '#d98fe0'], mid: ['#ff9ad5', '#d84fb0'],
    grass: ['#ffe36e', '#7ee05a', '#2aa35a'], dirt: ['#a8527e', '#6e2f6b', '#3e1a4a'], ambient: 'petals', music: 1 },
  { id: 'canyon', sky: ['#5d1ea8', '#ff4f7b', '#ffc04d'], sun: { x: 0.72, y: 0.52, r: 92, c: '#fff0a0', glow: '#ff9d3d' },
    cloud: '#ffc1a1', cloudShade: '#d9568a', far: ['#d9568a', '#8f2f8c'], mid: ['#ff9a3d', '#b5401f'],
    grass: ['#ffd25e', '#f09a24', '#b75a13'], dirt: ['#b0471d', '#6f2412', '#3d0f0c'], ambient: 'dust', music: 2 },
  { id: 'glacier', sky: ['#2340e8', '#2fb2ff', '#c9fcff'], sun: { x: 0.26, y: 0.2, r: 56, c: '#ffffff', glow: '#a8f0ff' },
    cloud: '#ffffff', cloudShade: '#a6d9ff', far: ['#e4fbff', '#6aa8f0'], mid: ['#bdf2ff', '#3c86d9'],
    grass: ['#ffffff', '#bdefff', '#6fc0ec'], dirt: ['#6f8fe0', '#3e4fa8', '#1f2466'], ambient: 'snow', music: 3 },
  { id: 'neon', sky: ['#07032b', '#2a0f7a', '#d42bb0'], moon: { x: 0.8, y: 0.18, r: 50 }, stars: 90, aurora: true,
    cloud: '#6a3bd0', cloudShade: '#2a1470', far: ['#43188f', '#1b0a55'], mid: ['#1c1a6b', '#0a0a33'],
    grass: ['#3dffc8', '#13b58f', '#0a5c63'], dirt: ['#27246f', '#15124a', '#090726'], ambient: 'fireflies', music: 4 },
  { id: 'volcano', sky: ['#14041f', '#7d0f3f', '#ff6a1f'], stars: 40, lavaGlow: true,
    cloud: '#5a1a33', cloudShade: '#22081a', far: ['#5c1136', '#2b0a22'], mid: ['#3a1224', '#170711'],
    grass: ['#ff9a2e', '#d13f12', '#5a1208'], dirt: ['#3d1420', '#240a15', '#10040a'], ambient: 'embers', music: 5 }
];

// Уровни. par — сколько пуфов нужно потратить на 3 звезды.
// В третьем аргументе build набор из скал, батутов, порталов, вихрей и кристаллов.
const G = GROUND_Y;
const LEVELS = [
  // 1. Знакомство: рогатка и ящик-бум
  {
    biome: 0, par: 1, heroes: ['rocky', 'zip', 'rocky', 'rocky'],
    build(addB, addP) {
      const x = 840;
      addB(x - 65, G - 60, 24, 120, 'wood');
      addB(x + 65, G - 60, 24, 120, 'wood');
      addP(x, G - 25, 25, false);
      addB(x, G - 132, 170, 24, 'wood');
      addB(x - 45, G - 166, 44, 44, 'boom');
      addP(x + 35, G - 166, 22, false);
    }
  },
  // 2. Ледяная башня и первый Мегабот
  {
    biome: 1, par: 2, heroes: ['trio', 'nimbus', 'zip', 'rocky'],
    build(addB, addP) {
      const a = 720, b = 950;
      addB(a - 50, G - 55, 22, 110, 'ice');
      addB(a + 50, G - 55, 22, 110, 'ice');
      addP(a, G - 24, 24, false);
      addB(a, G - 121, 140, 22, 'ice');
      addP(a, G - 152, 20, false);

      addB(b - 60, G - 60, 24, 120, 'wood');
      addB(b + 60, G - 60, 24, 120, 'wood');
      addB(b, G - 23, 46, 46, 'boom');
      addB(b, G - 132, 160, 24, 'wood');
      addP(b, G - 172, 28, true);
    }
  },
  // 3. Каньон: цепная реакция
  {
    biome: 2, par: 2, heroes: ['zip', 'nimbus', 'magma', 'rocky', 'rocky'],
    build(addB, addP) {
      const x = 850;
      addB(x - 110, G - 65, 26, 130, 'stone');
      addB(x, G - 65, 26, 130, 'wood');
      addB(x + 110, G - 65, 26, 130, 'stone');
      addP(x - 55, G - 24, 24, false);
      addB(x + 55, G - 23, 46, 46, 'boom');
      addB(x, G - 142, 260, 24, 'stone');

      addB(x - 65, G - 204, 24, 100, 'wood');
      addB(x + 65, G - 204, 24, 100, 'wood');
      addP(x, G - 184, 30, true);
      addB(x, G - 266, 170, 24, 'wood');
    }
  },
  // 4. Ледник: двойной бункер
  {
    biome: 3, par: 3, heroes: ['nimbus', 'trio', 'magma', 'zip', 'rocky'],
    build(addB, addP) {
      [730, 990].forEach((x, i) => {
        addB(x - 65, G - 60, 26, 120, i ? 'stone' : 'ice');
        addB(x + 65, G - 60, 26, 120, i ? 'stone' : 'ice');
        addP(x, G - (i ? 30 : 24), i ? 30 : 24, i === 1);
        addB(x, G - 132, 170, 24, 'wood');
        addB(x, G - 166, 44, 44, 'boom');
      });
      addP(860, G - 24, 24, false);
    }
  },
  // 5. Неоновая крепость
  {
    biome: 4, par: 2, heroes: ['trio', 'nimbus', 'magma', 'zip', 'rocky'],
    build(addB, addP) {
      const x = 870;
      addB(x - 140, G - 60, 26, 120, 'ice');
      addB(x - 50, G - 60, 26, 120, 'stone');
      addB(x + 50, G - 60, 26, 120, 'stone');
      addB(x + 140, G - 60, 26, 120, 'ice');

      addB(x - 95, G - 22, 44, 44, 'boom');
      addP(x, G - 32, 32, true);
      addB(x + 95, G - 22, 44, 44, 'boom');

      addB(x - 95, G - 132, 120, 24, 'wood');
      addB(x + 95, G - 132, 120, 24, 'wood');
      addB(x, G - 156, 150, 24, 'stone');
      addP(x - 45, G - 190, 22, false);
      addP(x + 45, G - 190, 22, false);
    }
  },
  // 6. Финальная цитадель в жерле вулкана
  {
    biome: 5, par: 3, heroes: ['trio', 'zip', 'nimbus', 'magma', 'magma', 'rocky'],
    build(addB, addP) {
      const x = 880;
      addB(x - 170, G - 65, 26, 130, 'stone');
      addB(x - 75, G - 65, 26, 130, 'wood');
      addB(x + 75, G - 65, 26, 130, 'wood');
      addB(x + 170, G - 65, 26, 130, 'stone');

      addP(x - 122, G - 23, 23, false);
      addB(x - 30, G - 22, 44, 44, 'boom');
      addP(x + 25, G - 25, 25, false);
      addP(x + 122, G - 23, 23, false);

      addB(x - 123, G - 142, 94, 24, 'stone');
      addB(x, G - 142, 148, 24, 'wood');
      addB(x + 123, G - 142, 94, 24, 'stone');

      addB(x - 55, G - 209, 24, 110, 'ice');
      addB(x + 55, G - 209, 24, 110, 'ice');
      addP(x, G - 188, 34, true);
      addB(x, G - 276, 150, 24, 'stone');
      addB(x, G - 310, 44, 44, 'boom');
    }
  },
  // 7. Силовые щиты: первый удар только снимает щит
  {
    biome: 0, par: 3, name: 0, gems: 2, heroes: ['rocky', 'trio', 'zip', 'rocky', 'magma'],
    build(addB, addP, L) {
      const a = 770, b = 1020;
      addB(a - 55, G - 60, 24, 120, 'wood');
      addB(a + 55, G - 60, 24, 120, 'wood');
      addB(a, G - 132, 150, 24, 'wood');
      addP(a, G - 24, 24, false, { shield: true });
      addP(a, G - 168, 24, false, { shield: true });

      addB(b - 60, G - 60, 26, 120, 'stone');
      addB(b + 60, G - 60, 26, 120, 'stone');
      addB(b, G - 132, 170, 24, 'wood');
      addB(b - 45, G - 166, 44, 44, 'boom');
      addP(b, G - 28, 28, true, { shield: true });
      addP(b + 40, G - 168, 24, false);

      L.gem(640, G - 330);
      L.gem(895, G - 250);
    }
  },
  // 8. Дроны: цели в воздухе, под ними нечего обрушить
  {
    biome: 1, par: 3, name: 1, gems: 2, heroes: ['trio', 'zip', 'trio', 'rocky', 'nimbus'],
    build(addB, addP, L) {
      addP(780, G - 340, 22, false, { hover: { ax: 90, speed: 1.1 } });
      addP(960, G - 230, 22, false, { hover: { ay: 70, speed: 1.4, phase: 1 } });
      addP(860, G - 370, 22, false, { hover: { ax: 50, ay: 25, speed: 0.9, phase: 2 } });
      const x = 900;
      addB(x - 55, G - 50, 22, 100, 'ice');
      addB(x + 55, G - 50, 22, 100, 'ice');
      addB(x, G - 111, 140, 22, 'wood');
      addP(x, G - 24, 24, false);

      L.gem(690, G - 230);
      L.gem(930, G - 340);
    }
  },
  // 9. Батут: стена закрывает ботов, зато можно перепрыгнуть
  {
    biome: 2, par: 3, name: 2, gems: 2, heroes: ['zip', 'rocky', 'nimbus', 'trio', 'rocky'],
    build(addB, addP, L) {
      L.rock(790, G - 160, 60, 320);
      L.jelly(590, G - 10, 210, 20);
      L.jelly(1170, G - 130, 24, 260);
      addB(950, G - 50, 24, 100, 'wood');
      addB(1070, G - 50, 24, 100, 'wood');
      addB(1010, G - 112, 170, 24, 'wood');
      addP(1010, G - 22, 22, false);
      addP(880, G - 24, 24, false, { shield: true });
      addP(1010, G - 146, 22, false);

      L.gem(590, G - 230);
      L.gem(790, G - 400);
    }
  },
  // 10. Бур: сквозь стальные стены проходит только он
  {
    biome: 3, par: 3, name: 3, gems: 1, heroes: ['drill', 'rocky', 'drill', 'magma'],
    build(addB, addP, L) {
      const x = 900;
      addB(x - 150, G - 70, 44, 140, 'steel');
      addB(x - 105, G - 70, 44, 140, 'stone');
      addB(x + 150, G - 70, 44, 140, 'steel');
      addB(x, G - 153, 360, 26, 'steel');
      addP(x - 25, G - 28, 28, true);
      addP(x + 70, G - 22, 22, false);
      addP(x + 60, G - 188, 22, false, { shield: true });
      addB(x - 60, G - 196, 44, 60, 'stone');

      L.gem(590, G - 150);
    }
  },
  // 11. Портал: влетел здесь, вылетел за стеной
  {
    biome: 4, par: 3, name: 4, gems: 2, heroes: ['rocky', 'zip', 'trio', 'nimbus', 'magma', 'rocky'],
    build(addB, addP, L) {
      L.rock(740, G - 240, 50, 480);
      L.portal(500, G - 330, 830, G - 300);
      addB(930, G - 60, 26, 120, 'ice');
      addB(1040, G - 60, 26, 120, 'ice');
      addB(985, G - 132, 150, 24, 'wood');
      addP(985, G - 28, 28, true, { shield: true });
      addP(985, G - 168, 24, false);
      addB(1130, G - 50, 26, 100, 'wood');
      addB(1130, G - 112, 90, 24, 'wood');
      addP(1130, G - 148, 24, false);

      L.gem(830, G - 180);
      L.gem(1100, G - 310);
    }
  },
  // 12. Гигабот: первый босс
  {
    biome: 5, par: 5, name: 5, gems: 2, boss: true, heroes: ['magma', 'rocky', 'zip', 'nimbus', 'magma', 'trio', 'rocky'],
    build(addB, addP, L) {
      L.rock(780, G - 90, 90, 180);
      addB(780, G - 202, 44, 44, 'boom');
      L.rock(1100, G - 70, 80, 140);
      addB(1100, G - 162, 44, 44, 'boom');
      addB(880, G - 40, 24, 80, 'stone');
      addB(1020, G - 40, 24, 80, 'stone');
      addP(950, G - 24, 24, false, { shield: true });
      addP(950, G - 280, 56, true, { boss: true, hp: 300, phases: [0.5], hover: { ax: 40, ay: 70, speed: 0.8 } });

      L.gem(620, G - 360);
      L.gem(860, G - 420);
    }
  },
  // 13. Снежок: сталь почти ничего не берёт, пока её не заморозить
  {
    biome: 3, par: 4, name: 6, gems: 1, heroes: ['frost', 'rocky', 'frost', 'rocky', 'zip'],
    build(addB, addP, L) {
      [760, 1040].forEach((x, i) => {
        addB(x - 72, G - 60, 34, 120, 'steel');
        addB(x + 72, G - 60, 34, 120, 'steel');
        addB(x, G - 132, 190, 24, 'steel');
        addP(x, G - 26, 26, i === 1);
        addP(x, G - 168, 24, false);
      });

      L.gem(900, G - 300);
    }
  },
  // 14. Вихрь: полёт изгибается, прямых путей больше нет
  {
    biome: 4, par: 3, name: 7, gems: 3, heroes: ['trio', 'zip', 'rocky', 'nimbus'],
    build(addB, addP, L) {
      L.well(640, G - 290, 240, 0.6);
      L.rock(800, G - 80, 44, 160);
      addB(860, G - 40, 20, 80, 'ice');
      addB(940, G - 40, 20, 80, 'ice');
      addB(900, G - 91, 110, 22, 'ice');
      addP(900, G - 24, 24, false);
      L.rock(1040, G - 170, 170, 28);
      addB(1000, G - 214, 22, 60, 'wood');
      addB(1080, G - 214, 22, 60, 'wood');
      addB(1040, G - 255, 120, 22, 'wood');
      addP(1040, G - 208, 24, false, { shield: true });
      addP(1040, G - 288, 22, false, { shield: true });
      addP(780, G - 410, 22, false, { hover: { ax: 50, ay: 30, speed: 1 } });

      L.gem(640, G - 440);
      L.gem(540, G - 230);
      L.gem(760, G - 330);
    }
  },
  // 15. Бомботы: один взрыв тянет за собой другой
  {
    biome: 2, par: 2, name: 8, gems: 1, heroes: ['rocky', 'zip', 'trio', 'rocky'],
    build(addB, addP, L) {
      [740, 920, 1100].forEach((x, i) => {
        addB(x - 50, G - 45, 26, 90, 'stone');
        addB(x + 50, G - 45, 26, 90, 'stone');
        addB(x, G - 101, 150, 22, 'wood');
        addP(x, G - 24, 24, false, i === 2 ? { shield: true } : { volatile: true });
        addP(x - 40, G - 136, 24, false, { volatile: true });
        addP(x + 40, G - 136, 24, false, i === 2 ? { shield: true } : { volatile: true });
      });

      L.gem(920, G - 330);
    }
  },
  // 16. Небесные острова: у каждого острова свой подход
  {
    biome: 1, par: 4, name: 9, gems: 3, heroes: ['trio', 'zip', 'nimbus', 'magma', 'rocky', 'drill', 'rocky'],
    build(addB, addP, L) {
      L.rock(760, G - 230, 170, 28);
      addB(715, G - 274, 22, 60, 'wood');
      addB(805, G - 274, 22, 60, 'wood');
      addB(760, G - 315, 130, 22, 'wood');
      addP(760, G - 266, 22, false);
      addP(760, G - 348, 22, false);

      L.rock(950, G - 270, 160, 28);
      addB(910, G - 314, 20, 60, 'ice');
      addB(990, G - 314, 20, 60, 'ice');
      addB(950, G - 355, 120, 22, 'stone');
      addP(950, G - 308, 24, false, { shield: true });

      L.rock(1120, G - 100, 140, 28);
      addP(1120, G - 144, 30, true);

      addP(880, G - 130, 20, false, { hover: { ay: 60, speed: 1.3 } });
      L.portal(500, G - 110, 880, G - 500);
      L.jelly(1000, G - 10, 220, 20);

      L.gem(630, G - 400);
      L.gem(880, G - 420);
      L.gem(1060, G - 230);
    }
  },
  // 17. Хитрый лабиринт: три этажа, в каждый свой ключ
  {
    biome: 0, par: 5, name: 10, gems: 3, heroes: ['drill', 'frost', 'zip', 'magma', 'trio', 'rocky'],
    build(addB, addP, L) {
      L.rock(1000, G - 130, 300, 24);
      L.rock(1000, G - 262, 300, 24);
      L.rock(1165, G - 170, 30, 340);
      addB(865, G - 59, 30, 118, 'steel');
      addP(950, G - 24, 24, false);
      addP(1060, G - 24, 24, false, { shield: true });
      addB(865, G - 196, 30, 108, 'stone');
      addP(960, G - 166, 24, false, { volatile: true });
      addP(1060, G - 166, 24, false);
      addB(930, G - 309, 22, 70, 'ice');
      addB(1070, G - 309, 22, 70, 'ice');
      addB(1000, G - 355, 170, 22, 'wood');
      addP(1000, G - 302, 28, true);
      L.jelly(1143, G - 59, 14, 118);
      L.portal(560, G - 430, 930, G - 196);

      L.gem(700, G - 200);
      L.gem(560, G - 280);
      L.gem(900, G - 380);
    }
  },
  // 18. Гигабот возвращается: щит, бомботы-помощники и ярость
  {
    biome: 5, par: 6, name: 11, gems: 3, boss: true, heroes: ['magma', 'frost', 'drill', 'rocky', 'magma', 'nimbus', 'zip', 'rocky'],
    build(addB, addP, L) {
      L.rock(760, G - 60, 60, 120);
      addB(760, G - 142, 44, 44, 'boom');
      L.rock(1120, G - 70, 60, 140);
      addB(1120, G - 162, 44, 44, 'boom');
      addB(880, G - 50, 26, 100, 'stone');
      addB(1040, G - 50, 26, 100, 'stone');
      addB(960, G - 112, 190, 24, 'steel');
      addP(960, G - 24, 24, false);
      L.portal(520, G - 90, 800, G - 470);
      addP(930, G - 290, 60, true, { boss: true, hp: 360, shield: true, phases: [0.5], bombs: true, hover: { ax: 90, ay: 70, speed: 0.7 } });

      L.gem(630, G - 300);
      L.gem(800, G - 330);
      L.gem(1040, G - 260);
    }
  }
];
