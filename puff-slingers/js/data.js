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
    trail: '#ffe14d', lumps: 15, vs: { wood: 1.4, ice: 1, stone: 0.6 }
  },
  trio: {
    r: 16, density: 0.0036, restitution: 0.42, ability: 'split',
    fur: ['#9ffbff', '#19c6f2', '#0a76c9'], line: '#04386e', iris: '#ff3d9a',
    trail: '#38e1ff', lumps: 14, vs: { wood: 0.8, ice: 2, stone: 0.5 }
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
  }
};

const MATERIALS = {
  ice:   { hp: 20,  density: 0.0014, pts: 50,  chips: ['#d9fbff', '#7fe3ff', '#ffffff'], sound: 'ice' },
  wood:  { hp: 40,  density: 0.0022, pts: 80,  chips: ['#ffc46b', '#e8893a', '#8a4a1c'], sound: 'wood' },
  stone: { hp: 85, density: 0.0040, pts: 150, chips: ['#c9d2f2', '#8b95c7', '#565e96'], sound: 'stone' },
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

// Шесть уровней. par — сколько пуфов нужно потратить на 3 звезды.
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
  }
];
