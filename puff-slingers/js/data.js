// =====================================================
// ДАННЫЕ ИГРЫ: МИР, ГЕРОИ, МАТЕРИАЛЫ, БИОМЫ, УРОВНИ
// =====================================================
const WORLD_W = 1280;
const GROUND_Y = 650;
const SLING_X = 240;
const SLING_Y = GROUND_Y - 140;
const MAX_PULL = 115;
const LAUNCH_POWER = 0.22;
const STEP_MS = 1000 / 60;
const PORTAL_R = 34;
const GEM_R = 20;
// Как высоко над землёй долетает пуф на этом расстоянии (x, высота)
const REACH_TOP = [[450, 723], [600, 687], [700, 649], [800, 602], [900, 543], [1000, 474], [1100, 392], [1150, 346], [1200, 295]];

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
  },
  dyna: {
    r: 24, density: 0.005, restitution: 0.2, ability: 'bomb',
    fur: ['#ffd08a', '#ff8a1f', '#c24a08'], line: '#5a2200', iris: '#0a8cff',
    trail: '#ff9a2e', lumps: 13, vs: { wood: 1, ice: 1, stone: 1 }
  }
};

const MATERIALS = {
  ice:   { hp: 14,  density: 0.0014, pts: 50,  chips: ['#d9fbff', '#7fe3ff', '#ffffff'], sound: 'ice' },
  wood:  { hp: 26,  density: 0.0022, pts: 80,  chips: ['#ffc46b', '#e8893a', '#8a4a1c'], sound: 'wood' },
  stone: { hp: 52, density: 0.0040, pts: 150, chips: ['#c9d2f2', '#8b95c7', '#565e96'], sound: 'stone' },
  steel: { hp: 130, density: 0.0062, pts: 300, chips: ['#f2f5ff', '#a3aec9', '#515b7a'], sound: 'stone' },
  boom:  { hp: 10,  density: 0.0020, pts: 200, chips: ['#ff5a3c', '#ffd23f', '#6d0f24'], sound: 'wood' }
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

// Строитель крупных построек: всё считается снизу вверх, base — высота опоры над землёй.
// Функции возвращают высоту, на которой можно строить дальше
const G = GROUND_Y;
function fort(addB, addP) {
  const F = {
    post(x, base, h, mat, t = 34) {
      addB(x, G - base - h / 2, t, h, mat);
      return base + h;
    },
    slab(x, base, w, mat, t = 30) {
      addB(x, G - base - t / 2, w, t, mat);
      return base + t;
    },
    // Где стоит столб зала и где середина его пролёта
    pillar: (x, span, bays, i, t = 34) => x - span / 2 + t / 2 + ((span - t) * i) / bays,
    mid: (x, span, bays, i, t = 34) => F.pillar(x, span, bays, i + 0.5, t),
    // Зал: столбы и над каждым пролётом своя балка. Рухнет столб, просядет только его часть.
    // post — материал столбов или список материалов по одному на столб
    hall(x, base, span, bays, h, post, beam = post, t = 34, bt = 30) {
      for (let i = 0; i <= bays; i++) F.post(F.pillar(x, span, bays, i, t), base, h, Array.isArray(post) ? post[i] : post, t);
      for (let i = 0; i < bays; i++) {
        const left = i === 0 ? x - span / 2 : F.pillar(x, span, bays, i, t) + 0.5;
        const right = i === bays - 1 ? x + span / 2 : F.pillar(x, span, bays, i + 1, t) - 0.5;
        addB((left + right) / 2, G - base - h - bt / 2, right - left, bt, Array.isArray(beam) ? beam[i] : beam);
      }
      return base + h + bt;
    },
    crate(x, base, s = 48) {
      addB(x, G - base - s / 2, s, s, 'boom');
      return base + s;
    },
    // Кладка из кубов одним столбиком
    cubes(x, base, count, mat, s = 44) {
      for (let i = 0; i < count; i++) addB(x, G - base - s * (i + 0.5), s, s, mat);
      return base + s * count;
    },
    // Зубцы поверх стены
    teeth(x, base, span, count, mat, s = 38) {
      for (let i = 0; i < count; i++) addB(x - span / 2 + (span * i) / (count - 1), G - base - s / 2, s, s, mat);
      return base + s;
    },
    bot(x, base, r = 24, opts) {
      addP(x, G - base - r, r, r >= 28, opts);
    }
  };
  return F;
}

// Уровни. par — сколько пуфов нужно потратить на 3 звезды.
// В третьем аргументе build набор из скал, батутов, порталов, вихрей и кристаллов.
const LEVELS = [
  // 1. Знакомство: большой деревянный дом и ящик-бум посередине
  {
    biome: 0, par: 2, goal: ['collapse', 25], heroes: ['rocky', 'rocky', 'zip', 'rocky'],
    build(addB, addP) {
      const F = fort(addB, addP);
      const x = 930;
      const first = F.hall(x, 0, 440, 3, 130, 'wood');
      F.bot(F.mid(x, 440, 3, 0), 0, 26);
      F.crate(x, 0);
      F.cubes(F.mid(x, 440, 3, 2), 0, 2, 'wood');
      const second = F.hall(x, first, 270, 2, 110, 'wood');
      F.bot(F.mid(x, 270, 2, 0), first, 24);
      F.cubes(F.mid(x, 270, 2, 1), first, 1, 'wood', 46);
      F.hall(x, second, 150, 1, 80, 'wood', 'wood', 30, 26);
    }
  },
  // 2. Ледяная башня и деревянная крепость с первым Мегаботом
  {
    biome: 1, par: 3, goal: ['boom'], heroes: ['trio', 'nimbus', 'zip', 'rocky', 'rocky'],
    build(addB, addP) {
      const F = fort(addB, addP);
      const a = 725;
      const b = 1035;
      let top = F.hall(a, 0, 200, 1, 135, 'ice');
      F.bot(a, 0, 24);
      top = F.hall(a, top, 150, 1, 105, 'ice', 'ice', 30, 26);
      F.teeth(a, top, 100, 2, 'ice', 32);

      top = F.hall(b, 0, 340, 2, 130, 'wood');
      F.crate(F.mid(b, 340, 2, 0), 0);
      F.bot(F.mid(b, 340, 2, 1), 0, 24);
      const roof = F.hall(b, top, 210, 1, 125, 'wood');
      F.bot(b, top, 28);
      F.crate(b, roof, 46);
    }
  },
  // 3. Каньон: цепная реакция, знакомство с Динамитом
  {
    biome: 2, par: 3, goal: ['boom'], heroes: ['dyna', 'zip', 'nimbus', 'rocky', 'rocky'],
    build(addB, addP) {
      const F = fort(addB, addP);
      const x = 945;
      const first = F.hall(x, 0, 500, 3, 135, ['stone', 'wood', 'wood', 'stone'], 'stone');
      F.bot(F.mid(x, 500, 3, 0), 0, 24);
      F.crate(x, 0);
      F.bot(F.mid(x, 500, 3, 2), 0, 24);
      const second = F.hall(x, first, 320, 2, 115, 'wood', 'stone');
      F.bot(F.mid(x, 320, 2, 0), first, 28);
      F.crate(F.mid(x, 320, 2, 1), first, 46);
      const third = F.hall(x, second, 160, 1, 90, 'wood', 'wood', 30, 26);
      F.crate(x, third, 42);
    }
  },
  // 4. Ледник: две высокие башни и мост между ними
  {
    biome: 3, par: 4, goal: ['combo', 3], heroes: ['nimbus', 'trio', 'dyna', 'zip', 'rocky', 'dyna', 'rocky'],
    build(addB, addP) {
      const F = fort(addB, addP);
      [765, 1080].forEach((x, i) => {
        const mat = i ? 'stone' : 'ice';
        const first = F.hall(x, 0, i ? 250 : 240, 1, 130, mat, 'wood');
        F.bot(x, 0, i ? 30 : 24);
        const second = F.hall(x, first, 170, 1, 100, mat, 'wood', 30, 26);
        F.crate(x, first, 44);
        F.bot(x, second, 22);
      });
      const bridge = F.slab(922, 160, 143, 'wood', 24);
      F.bot(922, bridge, 22);
    }
  },
  // 5. Неоновая крепость: четыре пролёта, галерея и зубцы
  {
    biome: 4, par: 4, goal: ['boom'], heroes: ['trio', 'dyna', 'nimbus', 'zip', 'rocky', 'rocky'],
    build(addB, addP) {
      const F = fort(addB, addP);
      const x = 945;
      const first = F.hall(x, 0, 520, 4, 130, ['ice', 'stone', 'stone', 'stone', 'ice'], 'stone');
      F.crate(F.mid(x, 520, 4, 0), 0);
      F.bot(F.mid(x, 520, 4, 1), 0, 32);
      F.bot(F.mid(x, 520, 4, 2), 0, 24);
      F.crate(F.mid(x, 520, 4, 3), 0);
      const second = F.hall(x, first, 340, 2, 105, 'wood', 'stone');
      F.bot(F.mid(x, 340, 2, 0), first, 22);
      F.bot(F.mid(x, 340, 2, 1), first, 22);
      F.teeth(x, second, 270, 4, 'ice');
    }
  },
  // 6. Цитадель в жерле вулкана: три этажа и ящик на вершине
  {
    biome: 5, par: 3, goal: ['collapse', 34], heroes: ['trio', 'zip', 'dyna', 'nimbus', 'magma', 'rocky'],
    build(addB, addP) {
      const F = fort(addB, addP);
      const x = 945;
      const first = F.hall(x, 0, 500, 3, 130, ['stone', 'wood', 'wood', 'stone'], 'stone');
      F.bot(F.mid(x, 500, 3, 0), 0, 23);
      F.crate(x, 0);
      F.bot(F.mid(x, 500, 3, 2), 0, 23);
      const second = F.hall(x, first, 340, 2, 110, 'ice', 'stone');
      F.bot(F.mid(x, 340, 2, 0), first, 30);
      F.crate(F.mid(x, 340, 2, 1), first);
      const third = F.hall(x, second, 190, 1, 90, 'wood', 'stone');
      F.bot(x, second, 22);
      F.crate(x, third, 44);
    }
  },
  // 7. Силовые щиты: первый удар только снимает щит
  {
    biome: 0, par: 5, goal: ['score', 18000], name: 0, gems: 2, heroes: ['rocky', 'trio', 'zip', 'dyna', 'rocky', 'magma', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      const a = 770;
      const b = 1070;
      let top = F.hall(a, 0, 240, 1, 130, 'wood');
      F.bot(a, 0, 24, { shield: true });
      const roof = F.hall(a, top, 170, 1, 100, 'wood');
      F.bot(a, top, 22);
      F.teeth(a, roof, 100, 2, 'wood', 32);

      top = F.hall(b, 0, 300, 2, 130, 'stone', 'wood');
      F.bot(F.mid(b, 300, 2, 0), 0, 28, { shield: true });
      F.crate(F.mid(b, 300, 2, 1), 0);
      F.crate(b - 60, top, 44);
      F.bot(b + 55, top, 24);

      L.gem(640, G - 330);
      L.gem(895, G - 420);
    }
  },
  // 8. Дроны: две цели летают над большой крепостью
  {
    biome: 1, par: 4, goal: ['combo', 2], name: 1, gems: 2, heroes: ['trio', 'zip', 'dyna', 'rocky', 'nimbus', 'trio', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      addP(790, G - 350, 26, false, { hover: { ax: 40, speed: 0.7 } });
      addP(1010, G - 365, 26, false, { hover: { ay: 26, speed: 0.7, phase: 1 } });
      const x = 960;
      const first = F.hall(x, 0, 440, 2, 125, 'ice', 'wood');
      F.bot(F.mid(x, 440, 2, 0), 0, 24);
      F.crate(F.mid(x, 440, 2, 1), 0);
      const second = F.hall(x, first, 220, 1, 95, 'wood');
      F.crate(x, first, 44);
      F.teeth(x, second, 130, 2, 'wood', 32);

      L.gem(690, G - 260);
      L.gem(920, G - 470);
    }
  },
  // 9. Батут: стенка невысокая, поверх неё тоже можно перекинуть
  {
    biome: 2, par: 3, goal: ['shots', 2], name: 2, gems: 2, heroes: ['dyna', 'zip', 'rocky', 'nimbus', 'trio', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.rock(760, G - 80, 60, 160);
      L.jelly(590, G - 10, 210, 20);
      F.bot(850, 0, 24);
      const x = 1050;
      const first = F.hall(x, 0, 310, 1, 125, 'wood');
      F.crate(x - 62, 0, 44);
      F.bot(x + 55, 0, 24);
      const second = F.hall(x, first, 220, 1, 100, 'wood');
      F.bot(x, first, 22);
      F.teeth(x, second, 130, 2, 'wood', 32);

      L.gem(590, G - 240);
      L.gem(790, G - 340);
    }
  },
  // 10. Бур: стальной бункер проще всего пройти насквозь, но ящики взрываются и так
  {
    biome: 3, par: 3, goal: ['score', 15000], name: 3, gems: 1, heroes: ['drill', 'dyna', 'rocky', 'drill', 'magma', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      const x = 950;
      F.post(x - 228, 0, 150, 'steel', 44);
      F.post(x, 0, 150, 'stone', 38);
      F.post(x + 228, 0, 150, 'steel', 44);
      F.slab(x - 125, 150, 250, 'stone');
      const first = F.slab(x + 125, 150, 250, 'stone');
      F.bot(x - 115, 0, 28);
      F.crate(x + 70, 0);
      F.bot(x + 150, 0, 24);
      F.hall(x, first, 280, 2, 100, 'wood');
      F.bot(F.mid(x, 280, 2, 0), first, 24);
      F.crate(F.mid(x, 280, 2, 1), first, 46);

      L.gem(590, G - 170);
    }
  },
  // 11. Портал: влетел здесь, вылетел за стеной. Стену можно и перекинуть
  {
    biome: 4, par: 5, goal: ['collapse', 18], name: 4, gems: 2, heroes: ['rocky', 'dyna', 'zip', 'dyna', 'trio', 'nimbus', 'magma', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.rock(700, G - 65, 50, 130);
      L.portal(500, G - 330, 830, G - 330);
      const x = 1010;
      const first = F.hall(x, 0, 400, 2, 125, 'ice', 'wood');
      F.bot(F.mid(x, 400, 2, 0), 0, 28);
      F.crate(F.mid(x, 400, 2, 1), 0);
      const second = F.hall(x - 40, first, 240, 1, 100, 'wood');
      F.bot(x - 40, first, 24);
      F.teeth(x - 40, second, 140, 2, 'ice', 32);
      F.bot(x + 150, first, 22);

      L.gem(830, G - 180);
      L.gem(1140, G - 340);
    }
  },
  // 12. Гигабот: первый босс парит над каменным залом с ящиками
  {
    biome: 5, par: 6, goal: ['score', 21000], name: 5, gems: 2, boss: true, heroes: ['dyna', 'magma', 'rocky', 'zip', 'nimbus', 'dyna', 'trio'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.rock(745, G - 60, 80, 120);
      F.crate(745, 120);
      const x = 1000;
      const first = F.hall(x, 0, 400, 2, 125, 'stone', 'wood');
      F.bot(F.mid(x, 400, 2, 0), 0, 24);
      F.crate(F.mid(x, 400, 2, 1), 0);
      F.hall(x, first, 240, 1, 85, 'wood');
      addP(930, G - 400, 56, true, { boss: true, hp: 150, hover: { ax: 30, ay: 28, speed: 0.55 } });

      L.gem(620, G - 360);
      L.gem(860, G - 460);
    }
  },
  // 13. Снежок: стальные балки хрупкие на морозе, но взрыв их тоже берёт
  {
    biome: 3, par: 5, goal: ['combo', 3], name: 6, gems: 1, heroes: ['frost', 'dyna', 'rocky', 'frost', 'dyna', 'rocky', 'zip'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      [[775, 250], [1070, 270]].forEach(([x, span], i) => {
        const first = F.hall(x, 0, span, 1, 130, 'stone', 'steel');
        F.bot(x, 0, i ? 28 : 25);
        F.crate(x - 62, first, 44);
        const second = F.hall(x + 42, first, 130, 1, 90, 'ice', 'ice', 28, 24);
        F.bot(x + 42, first, 20);
        F.teeth(x + 42, second, 70, 2, 'ice', 28);
      });

      L.gem(925, G - 360);
    }
  },
  // 14. Вихрь: полёт изгибается, а постройки стоят открыто
  {
    biome: 4, par: 4, goal: ['collapse', 9], name: 7, gems: 3, heroes: ['trio', 'dyna', 'zip', 'rocky', 'nimbus', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.well(600, G - 320, 170, 0.35);
      const x = 850;
      const first = F.hall(x, 0, 230, 1, 120, 'ice', 'wood');
      F.bot(x, 0, 24);
      F.crate(x, first, 46);
      L.rock(1095, G - 150, 240, 28);
      const top = F.hall(1095, 164, 210, 1, 90, 'wood');
      F.bot(1095, 164, 24);
      F.crate(1045, top, 40);
      F.bot(1145, top, 22);

      L.gem(640, G - 470);
      L.gem(540, G - 240);
      L.gem(760, G - 340);
    }
  },
  // 15. Бомботы: один взрыв тянет за собой другой
  {
    biome: 2, par: 4, goal: ['combo', 8], name: 8, gems: 1, heroes: ['rocky', 'zip', 'trio', 'dyna', 'rocky', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      [750, 945, 1130].forEach((x) => {
        const first = F.hall(x, 0, 180, 1, 130, 'stone', 'wood');
        F.bot(x, 0, 24, { volatile: true });
        F.bot(x - 45, first, 22, { volatile: true });
        F.bot(x + 45, first, 22, { volatile: true });
      });

      L.gem(945, G - 370);
    }
  },
  // 16. Небесные острова: у каждого острова свой подход, портал только помогает
  {
    biome: 1, par: 5, goal: ['shots', 2], name: 9, gems: 3, heroes: ['dyna', 'trio', 'zip', 'dyna', 'nimbus', 'rocky', 'drill', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      // Острова лесенкой вверх: ближние низкие, дальние высокие, траектория идёт над всеми
      L.rock(745, G - 90, 210, 28);
      const a = F.hall(745, 104, 180, 1, 90, 'wood');
      F.bot(745, 104, 24);
      F.teeth(745, a, 100, 2, 'wood', 32);

      L.rock(935, G - 190, 170, 28);
      F.crate(890, 204, 44);
      F.bot(960, 204, 26);

      L.rock(1105, G - 280, 170, 28);
      F.bot(1105, 294, 26);
      F.teeth(1105, 294, 110, 2, 'wood', 30);

      L.portal(500, G - 110, 880, G - 480);
      L.jelly(1000, G - 10, 220, 20);

      L.gem(630, G - 400);
      L.gem(960, G - 400);
      L.gem(1040, G - 130);
    }
  },
  // 17. Лабиринт: три этажа с открытым входом, в каждый можно попасть сверху или сбоку
  {
    biome: 0, par: 5, goal: ['score', 15000], name: 10, gems: 3, heroes: ['dyna', 'drill', 'dyna', 'frost', 'zip', 'magma', 'trio', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.rock(1010, G - 140, 300, 24);
      L.rock(1010, G - 280, 300, 24);
      L.rock(1172, G - 175, 30, 350);
      F.post(872, 0, 128, 'wood');
      F.bot(960, 0, 24);
      F.crate(1030, 0, 46);
      F.bot(1100, 0, 24);
      F.post(872, 152, 116, 'ice');
      F.bot(1000, 152, 24, { volatile: true });
      const top = F.hall(1010, 292, 200, 1, 85, 'wood');
      F.bot(1010, 292, 26);
      F.teeth(1010, top, 120, 2, 'wood', 32);
      L.jelly(1147, G - 64, 14, 118);
      L.portal(560, G - 430, 930, G - 220);

      L.gem(700, G - 200);
      L.gem(560, G - 280);
      L.gem(900, G - 440);
    }
  },
  // 18. Гигабот возвращается: ярость и бомботы-помощники, зато взрывчатки хватает
  {
    biome: 5, par: 6, goal: ['score', 22000], name: 11, gems: 3, boss: true, heroes: ['dyna', 'magma', 'dyna', 'frost', 'rocky', 'dyna', 'nimbus', 'zip'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.rock(735, G - 50, 60, 100);
      F.crate(735, 100);
      const x = 1000;
      const first = F.hall(x, 0, 420, 3, 125, 'stone', 'wood');
      F.crate(F.mid(x, 420, 3, 0), 0);
      F.crate(x, 0);
      F.cubes(F.mid(x, 420, 3, 2), 0, 2, 'stone');
      F.hall(x, first, 260, 1, 85, 'wood');
      L.portal(520, G - 90, 800, G - 470);
      addP(925, G - 410, 60, true, { boss: true, hp: 210, phases: [0.5], bombs: true, hover: { ax: 40, ay: 26, speed: 0.5 } });

      L.gem(630, G - 300);
      L.gem(800, G - 340);
      L.gem(1040, G - 280);
    }
  },
  // ---------- Мир 4: «Воздушный парад». Новое: шарики держат гири, мосты и ботов ----------
  // L.hang(тело, сколько шариков, длина нитки): лопни шарики — и то, что они держат, упадёт.
  // Пуф пролетает шарик насквозь, способность после этого ещё работает.
  // 19. Шарики: каменная гиря висит над двумя ботами, рядом летучий бот
  {
    biome: 0, par: 4, goal: ['balloons'], name: 12, heroes: ['rocky', 'zip', 'trio', 'rocky', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      const x = 905;
      F.post(x - 125, 0, 110, 'wood');
      F.post(x + 125, 0, 110, 'wood');
      F.bot(x - 52, 0, 24);
      F.bot(x + 52, 0, 24);
      L.hang(addB(x, G - 290, 150, 44, 'stone'), 2, 62);
      L.hang(addP(715, G - 270, 23, false), 2, 52);
      F.hall(1125, 0, 170, 1, 120, 'wood');
      F.bot(1125, 0, 24);
    }
  },
  // 20. Воздушный мост: два бота на доске, доску держат три шарика, внизу ящики-бум
  {
    biome: 1, par: 3, goal: ['score', 12000], name: 13, heroes: ['trio', 'zip', 'rocky', 'dyna', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      const x = 885;
      L.hang(addB(x, G - 250, 270, 26, 'wood'), 3, 64);
      F.bot(x - 75, 263, 22);
      F.bot(x + 75, 263, 22);
      F.crate(x - 70, 0);
      F.crate(x + 70, 0);
      const top = F.hall(1120, 0, 190, 1, 125, 'stone', 'wood');
      F.bot(1120, 0, 26);
      F.teeth(1120, top, 110, 2, 'wood', 32);
    }
  },
  // 21. Канатка над каньоном: три бота висят на шариках на разной высоте
  {
    biome: 2, par: 4, goal: ['balloons'], name: 14, heroes: ['trio', 'nimbus', 'zip', 'dyna', 'trio', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.hang(addP(700, G - 350, 23, false), 2, 52);
      L.hang(addP(860, G - 240, 23, false), 2, 52);
      L.hang(addP(1015, G - 300, 23, false), 2, 52);
      const top = F.hall(1140, 0, 170, 1, 120, 'wood');
      F.bot(1140, 0, 24);
      F.crate(1140, top, 42);
    }
  },
  // 22. Стальные гири: лопни шарики над крышей — гиря проломит её до самых ботов
  {
    biome: 3, par: 4, goal: ['collapse', 13], name: 15, heroes: ['frost', 'dyna', 'rocky', 'zip', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      const x = 905;
      const first = F.hall(x, 0, 340, 2, 115, ['stone', 'ice', 'stone'], 'ice');
      F.bot(F.mid(x, 340, 2, 0), 0, 26);
      F.bot(F.mid(x, 340, 2, 1), 0, 26);
      const second = F.hall(x, first, 200, 1, 90, 'ice', 'wood');
      F.bot(x, first, 24);
      L.hang(addB(x - 55, G - (second + 125), 76, 58, 'steel'), 2, 48);
      L.hang(addB(x + 55, G - (second + 125), 76, 58, 'steel'), 1, 48);
      F.bot(1130, 0, 26);
      F.post(1075, 0, 110, 'ice');
      F.post(1185, 0, 110, 'ice');
      F.slab(1130, 110, 150, 'wood');
    }
  },
  // 23. Неоновый карнавал: ящик-бум на трёх шариках над каменной крепостью, портал поднимает к нему
  {
    biome: 4, par: 5, goal: ['score', 10000], name: 16, heroes: ['zip', 'trio', 'dyna', 'nimbus', 'rocky', 'trio', 'rocky'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      const x = 1005;
      const first = F.hall(x, 0, 380, 2, 120, 'stone', 'stone');
      F.bot(F.mid(x, 380, 2, 0), 0, 26);
      F.bot(F.mid(x, 380, 2, 1), 0, 26);
      F.bot(x, first, 24);
      L.hang(addB(x, G - 320, 64, 64, 'boom'), 3, 52);
      L.hang(addP(770, G - 290, 23, false), 2, 50);
      L.portal(520, G - 110, 840, G - 430);
    }
  },
  // 24. Гигабот-воздухоплаватель: пока его держат шарики, он неуязвим. Лопни шарики — он рухнет.
  // На половине здоровья надувает новые шарики и зовёт помощника
  {
    biome: 5, par: 6, goal: ['score', 21000], name: 17, boss: true, heroes: ['trio', 'dyna', 'zip', 'magma', 'dyna', 'trio', 'rocky', 'dyna'],
    build(addB, addP, L) {
      const F = fort(addB, addP);
      L.rock(735, G - 50, 60, 100);
      F.crate(735, 100);
      const x = 1015;
      const first = F.hall(x, 0, 400, 2, 115, 'stone', 'wood');
      F.crate(F.mid(x, 400, 2, 0), 0);
      F.bot(F.mid(x, 400, 2, 1), 0, 24);
      F.teeth(x, first, 300, 3, 'wood');
      addP(905, G - 280, 56, true, { boss: true, hp: 170, lift: 3, phases: [0.5], bombs: true, hover: { ax: 30, ay: 14, speed: 0.5 } });
    }
  }
];

// Главы на экране уровней: по шесть уровней
const CHAPTERS = [[0, 5], [6, 11], [12, 17], [18, 23]];

// Следы за пуфом: открываются за звёзды и медали вместе (всего 72 звезды и 24 медали)
const TRAILS = [
  { id: 'basic', need: 0, c: '#ffffff' },
  { id: 'rainbow', need: 10, c: '#ff5fb7' },
  { id: 'stars', need: 24, c: '#ffe14d' },
  { id: 'bubbles', need: 40, c: '#7ef9ff' },
  { id: 'fire', need: 56, c: '#ff7a1a' },
  { id: 'gold', need: 76, c: '#ffc21f' }
];

// Шарики: размер, цвета, сколько очков за лопнувший
const BALLOON_R = 21;
const BALLOON_COLORS = ['#ff4f7b', '#ffd23f', '#3fc8ff', '#7cff5c', '#c58cff', '#ff9a3d'];
const BALLOON_PTS = 500;
// Разрушомер: какая доля очков за все блоки уровня даёт бонусного пуфа
const METER_SHARE = 0.5;
