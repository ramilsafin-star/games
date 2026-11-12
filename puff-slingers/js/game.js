// =====================================================
// ЯДРО ИГРЫ: физика, ходы, способности, камера, отрисовка
// =====================================================
const { Engine, World, Bodies, Body, Events, Composite, Sleeping } = Matter;
const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 });
const world = engine.world;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// Трёхмерная отрисовка; если браузер её не тянет, остаётся прежняя двумерная
let scene3d = null;
let lockQuality = false;
let slowFrames3d = 0;

// Сколько частиц держит каждая ступень качества: низкая, средняя, высокая
const FX_MAX = [180, 320, 560];

// Настройка «Графика» из паузы: Авто (по умолчанию) или постоянная ступень 0–2
function applyGfx() {
  if (Save.gfx === 'auto') {
    lockQuality = false;
    // На слабом устройстве начинаем со средней ступени
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
    quality = weak ? 1 : 2;
  } else {
    lockQuality = true;
    quality = Save.gfx;
  }
  FX.max = FX_MAX[quality];
  slowFrames3d = 0;
  perfTime = 0;
  perfFrames = 0;
  if (vw) resize();
}

// Если 3D сломалось или не тянет, игра продолжается в двумерной отрисовке
function disable3D(why) {
  if (!scene3d) return;
  console.warn('3D выключено:', why);
  scene3d = null;
  document.getElementById('gl').hidden = true;
  document.getElementById('vignette').hidden = false;
  applyViewScale();
}

// Игровые объекты
let level = 0;
let cfg = LEVELS[0];
let blocks = [];
let bots = [];
let orbs = [];
let flying = [];
let primary = null;
let queue = [];
let queueView = [];
let slingHero = null;
let removals = [];
let presettling = false;
let levelShift = 0;        // на узких экранах крепость ближе к рогатке, поэтому всё крупнее
let queueGap = 38;
let rocks = [];            // скалы и батуты: не ломаются и не двигаются
let portals = [];
let wells = [];
let gems = [];
let gemsTaken = 0;

// Ход и прогресс
let phase = 'attract'; // attract | intro | aim | flight | settle | over
let levelOver = false;
let abilityUsed = false;
let shotsFired = 0;
let aimIdle = 0;
// После проигрыша уровень становится проще: при новой попытке даём ещё пуфов
const MAX_EXTRA_HEROES = 2;
const levelFails = new Array(LEVELS.length).fill(0);
let score = 0;
let shownScore = 0;
let combo = 0;
let comboTimer = 0;
let turnTimer = 0;
let restTimer = 0;
let settleTimer = 0;
let introTimer = 0;
let botsAtTurnStart = 0;
let lastKill = null;
let timers = [];

// Прицел
let pull = null;           // смещение пуфа от центра рогатки
let drag = null;           // активный указатель
let kbAim = null;          // прицел с клавиатуры
let recoil = { x: 0, y: 0, vx: 0, vy: 0 };
let tapPrompt = 0;
let showTutorial = false;

// Время
let time = 0;
let rafId = 0;
let lastNow = 0;
let accum = 0;
let hitStopMs = 0;
let slowmoT = 0;
let slowmoScale = 1;
let sysPaused = false;

// Экран и камера
let vw = 0;
let vh = 0;
let dpr = 1;
let viewReady = false;
let quality = 2;
let perfTime = 0;
let perfFrames = 0;
const cam = { x: 640, y: 360, zoom: 1, trauma: 0, punch: 0, focus: null };
const overview = { x: 640, y: 360, zoom: 1, groundY: 600, flightZoom: 1 };
const bounds = { left: 100, right: 1100, top: 300 };

// =====================================================
// ПОСТРОЕНИЕ УРОВНЯ
// =====================================================
function addBlock(x, y, w, h, mat, piece) {
  const m = MATERIALS[mat];
  const rng = seeded(blocks.length * 13 + level * 7 + 1);
  const b = Bodies.rectangle(x + levelShift, y, w, h, {
    label: 'block', density: m.density, friction: 0.68, frictionStatic: 0.8, restitution: 0.08, sleepThreshold: 50
  });
  b.w = w;
  b.h = h;
  b.mat = mat;
  b.hp = m.hp;
  b.maxHp = m.hp;
  b.hitFlash = 0;
  b.cracks = makeCracks(w, h, rng);
  b.piece = !!piece;
  b.kick = null;
  blocks.push(b);
  World.add(world, b);
  return b;
}

function addBot(x, y, r, isMega, opts) {
  opts = opts || {};
  const hp = opts.hp || (isMega ? 35 : 20);
  const b = Bodies.circle(x + levelShift, y, r, {
    label: 'bot', density: opts.hover ? 0.004 : 0.002, friction: 0.5, restitution: 0.3, sleepThreshold: opts.hover ? Infinity : 50
  });
  b.isMega = isMega;
  b.isBoss = !!opts.boss;
  b.shield = opts.shield ? 1 : 0;
  b.shieldT = 0;
  b.volatile = !!opts.volatile;
  b.frozenT = 0;
  b.phases = (opts.phases || []).slice();
  b.bombs = !!opts.bombs;
  b.skin = opts.boss ? 'boss' : opts.volatile ? 'volatile' : opts.hover ? 'drone' : isMega ? 'mega' : 'plain';
  if (opts.hover) {
    b.hover = {
      x: x + levelShift, y, ax: opts.hover.ax || 0, ay: opts.hover.ay || 0,
      speed: opts.hover.speed || 1, phase: opts.hover.phase || 0, t: 0
    };
  }
  b.hp = hp;
  b.maxHp = hp;
  // Шарики держат бота в воздухе: пока они целы, он неуязвим (щит)
  if (opts.lift) {
    b.lift = { n: opts.lift, home: { x: x + levelShift, y }, len: 100 };
    b.shield = 1;
    b.hpBar = true;
    Balloons.lift(b, opts.lift, b.lift.len);
  }
  b.hitFlash = 0;
  b.scared = 0;
  b.laugh = 0;
  b.lookX = -1;
  b.lookY = 0;
  bots.push(b);
  World.add(world, b);
  return b;
}

function addRock(x, y, w, h, angle) {
  const b = Bodies.rectangle(x + levelShift, y, w, h, { isStatic: true, label: 'rock', friction: 0.8, restitution: 0.2, angle: angle || 0 });
  b.w = w;
  b.h = h;
  rocks.push(b);
  World.add(world, b);
}

function addJelly(x, y, w, h, angle) {
  const b = Bodies.rectangle(x + levelShift, y, w, h, { isStatic: true, label: 'jelly', friction: 0.1, restitution: 1.02, angle: angle || 0 });
  b.w = w;
  b.h = h;
  b.wob = 0;
  rocks.push(b);
  World.add(world, b);
}

function addPortal(ax, ay, bx, by) {
  portals.push({ a: { x: ax + levelShift, y: ay }, b: { x: bx + levelShift, y: by } });
}

function addWell(x, y, radius, pull) {
  wells.push({ x: x + levelShift, y, radius, pull });
}

function addGem(x, y) {
  gems.push({ x: x + levelShift, y, taken: false, phase: gems.length * 1.7 });
}

const LEVEL_KIT = { rock: addRock, jelly: addJelly, portal: addPortal, well: addWell, gem: addGem, hang: (body, n, len) => Balloons.hang(body, n, len) };

function queueX(i) {
  return SLING_X - 74 - i * queueGap;
}

function updateLayoutForAspect() {
  const aspect = vw && vh ? vw / vh : 16 / 9;
  levelShift = -170 * clamp((1.2 - aspect) / 0.6, 0, 1);
  queueGap = aspect < 0.85 ? 26 : 38;
}

function loadLevel(index, opts) {
  opts = opts || {};
  level = clamp(index, 0, LEVELS.length - 1);
  cfg = LEVELS[level];

  // Отменяем всё запланированное со старого уровня (иначе окна всплывают поверх нового)
  timers = [];
  removals = [];
  Composite.clear(world, false);
  blocks = [];
  bots = [];
  orbs = [];
  flying = [];
  rocks = [];
  portals = [];
  wells = [];
  gems = [];
  gemsTaken = 0;
  Balloons.clear();
  primary = null;
  pull = null;
  drag = null;
  kbAim = null;
  recoil = { x: 0, y: 0, vx: 0, vy: 0 };
  tapPrompt = 0;
  FX.clear();

  levelOver = false;
  abilityUsed = false;
  shotsFired = 0;
  bossDownAt = -1;
  score = 0;
  shownScore = 0;
  combo = 0;
  comboTimer = 0;
  turnTimer = 0;
  restTimer = 0;
  settleTimer = 0;
  lastKill = null;
  hitStopMs = 0;
  slowmoT = 0;
  cam.focus = null;
  cam.trauma = 0;
  cam.punch = 0;

  updateLayoutForAspect();
  World.add(world, Bodies.rectangle(WORLD_W / 2, GROUND_Y + 100, 7000, 200, {
    isStatic: true, label: 'ground', friction: 0.95, restitution: 0.1
  }));
  cfg.build(addBlock, addBot, LEVEL_KIT);
  presettle();
  Goals.reset(cfg);

  const extras = Math.min(levelFails[level], MAX_EXTRA_HEROES);
  queue = cfg.heroes.concat(new Array(extras).fill('rocky'));
  if (queue.length > 6) queueGap = Math.min(queueGap, 22);
  aimIdle = 0;
  queueView = queue.map((type, i) => ({ type, x: queueX(i - 1) }));
  slingHero = null;
  computeBounds();
  computeOverview();
  applyViewScale();
  Music.setTrack(BIOMES[cfg.biome].music);

  takeNextHero(true);
  showTutorial = level === 0 && !Save.seen.tutorial;

  if (opts.attract) {
    phase = 'attract';
    snapCamera();
  } else if (opts.quick) {
    phase = 'aim';
    snapCamera();
    UI.clearBanner();
    showHeroHint();
  } else {
    phase = 'intro';
    introTimer = 1.25;
    cam.zoom = overview.zoom * 1.28;
    cam.x = (bounds.fortL + bounds.right) / 2 - 20;
    cam.y = baseCamY(cam.zoom);
    UI.banner(`${t('level')} ${level + 1}`, cfg.name !== undefined ? t('levelNames')[cfg.name] : t('biome')[cfg.biome], false, Goals.text());
    UI.setHint('');
  }
  UI.updateHud();
}

// Даём постройке улечься заранее: уровень не рассыпается у игрока на глазах
function presettle() {
  presettling = true;
  engine.timing.timeScale = 1;
  for (let i = 0; i < 90; i++) Engine.update(engine, STEP_MS);
  presettling = false;
  blocks.concat(bots).forEach((b) => {
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    if (!b.hover) Sleeping.set(b, true);
  });
}

function computeBounds() {
  let right = 0;
  let top = GROUND_Y;
  let fortL = WORLD_W;
  const cover = (l, tp, r) => {
    right = Math.max(right, r);
    top = Math.min(top, tp);
    fortL = Math.min(fortL, l);
  };
  blocks.concat(bots, rocks).forEach((b) => cover(b.bounds.min.x, b.bounds.min.y, b.bounds.max.x));
  bots.forEach((b) => {
    if (b.hover) cover(b.hover.x - b.hover.ax - b.circleRadius, b.hover.y - b.hover.ay - b.circleRadius * 2, b.hover.x + b.hover.ax + b.circleRadius);
  });
  portals.forEach((p) => [p.a, p.b].forEach((q) => cover(q.x - PORTAL_R, q.y - PORTAL_R, q.x + PORTAL_R)));
  wells.forEach((w) => cover(w.x - 50, w.y - 50, w.x + 50));
  gems.forEach((g) => cover(g.x - GEM_R, g.y - GEM_R * 1.5, g.x + GEM_R));
  const lastQueue = queueX(Math.max(0, queue.length - 2)) - 34;
  bounds.left = Math.min(SLING_X - 135, lastQueue);
  bounds.right = right + 60;
  bounds.top = top;
  bounds.fortL = fortL;
}

function heroHint(type) {
  const key = { rocky: 'heroRocky', zip: 'heroZip', trio: 'heroTrio', nimbus: 'heroNimbus', magma: 'heroMagma', drill: 'heroDrill', frost: 'heroFrost', dyna: 'heroDyna' }[type];
  return t(key);
}

function takeNextHero(instant) {
  const type = queue.shift();
  queueView.shift();
  slingHero = {
    type, r: HEROES[type].r, x: SLING_X, y: SLING_Y, hop: instant ? 1 : 0,
    fromX: queueX(0), fromY: GROUND_Y - HEROES[type].r, squish: 0
  };
  if (!instant) {
    Sound.hop();
    UI.setHint(heroHint(type));
  }
  pull = null;
  kbAim = null;
  phase = instant ? phase : 'aim';
  botsAtTurnStart = bots.length;
}

// =====================================================
// ВЫСТРЕЛ И СПОСОБНОСТИ
// =====================================================
function createHeroBody(type, x, y) {
  const H = HEROES[type];
  const b = Bodies.circle(x, y, H.r, {
    label: 'hero', density: H.density, restitution: H.restitution, friction: 0.55,
    collisionFilter: { group: -1 }, sleepThreshold: Infinity
  });
  b.heroType = type;
  b.hasHit = false;
  b.squish = 0;
  b.hurtT = 0;
  b.fuse = 0;
  b.trail = [];
  b.dashT = 0;
  b.drillT = 0;
  b.portalCd = 0;
  b.inWell = 0;
  return b;
}

function fire() {
  if (phase !== 'aim' || !slingHero || !pull) return;
  const type = slingHero.type;
  const start = { x: SLING_X + pull.x, y: SLING_Y + pull.y };
  const b = createHeroBody(type, start.x, start.y);
  World.add(world, b);
  Body.setVelocity(b, { x: -pull.x * LAUNCH_POWER, y: -pull.y * LAUNCH_POWER });
  flying = [b];
  primary = b;

  recoil = { x: pull.x, y: pull.y, vx: 0, vy: 0 };
  slingHero = null;
  pull = null;
  drag = null;
  kbAim = null;
  phase = 'flight';
  abilityUsed = false;
  turnTimer = 0;
  restTimer = 0;
  shotsFired++;
  botsAtTurnStart = bots.length;
  Goals.onFire();

  Sound.launch();
  Sound.voice(type);
  addTrauma(0.16);
  FX.ring(SLING_X, SLING_Y, 70, '#ffffff', 6, 0.28);
  FX.sparks(SLING_X, SLING_Y, HEROES[type].trail, 12, 280, 0.4);
  UI.setHint('');

  if (showTutorial) {
    showTutorial = false;
    Save.seen.tutorial = true;
    Platform.requestSave();
  }
  // Первый полёт с новой способностью: замедляем время и показываем, куда нажать
  if (!Save.seen[type]) {
    tapPrompt = 1.6;
    later(240, () => {
      if (phase === 'flight' && !abilityUsed) slowmo(1.3, 0.42);
    });
  }
}

// Рывок, деление и сброс молнии работают только до первого удара
function abilityReady(h) {
  if (abilityUsed || !h || !flying.includes(h)) return false;
  const kind = HEROES[h.heroType].ability;
  return !h.hasHit || kind === 'blast' || kind === 'roar' || kind === 'frost';
}

function useAbility() {
  if (phase !== 'flight' || !abilityReady(primary)) return;
  abilityUsed = true;
  tapPrompt = 0;
  slowmoT = 0;
  const h = primary;
  const type = h.heroType;
  const H = HEROES[type];
  if (!Save.seen[type]) {
    Save.seen[type] = true;
    Platform.requestSave();
  }
  const { x, y } = h.position;
  const v = Body.getVelocity(h);
  const speed = Math.hypot(v.x, v.y);

  if (H.ability === 'roar') {
    Sound.ability('roar');
    [0, 1, 2].forEach((i) => FX.ring(x, y, 90 + i * 55, i ? '#ffb07a' : '#ffffff', 11 - i * 3, 0.32 + i * 0.1));
    FX.text(x, y - 40, t('wordRoar'), '#ffb07a', 28);
    addTrauma(0.3);
    blastBodies(x, y, 170, 10, 34, h);
    Body.setVelocity(h, { x: v.x * 1.2, y: v.y * 1.2 });
  } else if (H.ability === 'dash') {
    Sound.ability('dash');
    const a = Math.atan2(v.y, v.x);
    const s = Math.max(31, speed * 1.7);
    Body.setVelocity(h, { x: Math.cos(a) * s, y: Math.sin(a) * s });
    h.dashT = 0.5;
    FX.ring(x, y, 80, H.trail, 9, 0.28);
    FX.sparks(x, y, H.trail, 22, 420, 0.42);
    FX.text(x, y - 40, t('wordTurbo'), '#fff06a', 28);
    addTrauma(0.18);
  } else if (H.ability === 'split') {
    Sound.ability('split');
    const base = Math.atan2(v.y, v.x);
    [-0.26, 0.26].forEach((off) => {
      const c = createHeroBody('trio', x, y);
      World.add(world, c);
      Body.setVelocity(c, { x: Math.cos(base + off) * speed, y: Math.sin(base + off) * speed });
      flying.push(c);
    });
    FX.flash(x, y, 60, H.trail);
    FX.sparks(x, y, H.trail, 20, 300, 0.42);
    FX.text(x, y - 40, t('wordSplit'), '#9ffbff', 28);
  } else if (H.ability === 'drop') {
    Sound.ability('drop');
    const orb = Bodies.circle(x, y + 8, 13, {
      label: 'orb', density: 0.006, restitution: 0.1, collisionFilter: { group: -1 }, sleepThreshold: Infinity
    });
    orb.dead = false;
    World.add(world, orb);
    Body.setVelocity(orb, { x: v.x * 0.35, y: 16 });
    orbs.push(orb);
    Body.setVelocity(h, { x: Math.max(v.x, 8), y: -13 });
    h.dropped = true;
    FX.flash(x, y, 70, '#7ef9ff');
    FX.lightning(x, y, 70, 4);
    FX.text(x, y - 42, t('wordOrb'), '#bff4ff', 28);
  } else if (H.ability === 'blast') {
    detonateHero(h, 190);
  } else if (H.ability === 'bomb') {
    // Шашки летят веером вперёд и вниз, сам пуф взорвётся при ударе
    Sound.ability('bomb');
    [0.5, 0.74, 0.98].forEach((k, i) => {
      const stick = Bodies.circle(x - 6 + i * 6, y + 12, 11, {
        label: 'orb', density: 0.005, restitution: 0.1, collisionFilter: { group: -1 }, sleepThreshold: Infinity
      });
      stick.dead = false;
      stick.stick = true;
      stick.turn = (i - 1) * 0.3 + 0.2;
      World.add(world, stick);
      Body.setVelocity(stick, { x: v.x * k, y: Math.max(v.y, -2) * 0.5 + 5 + i * 2 });
      orbs.push(stick);
    });
    FX.sparks(x, y - 20, '#ffb347', 14, 300, 0.4);
    FX.text(x, y - 42, t('wordDyna'), '#ffb347', 28);
  } else if (H.ability === 'drill') {
    Sound.ability('drill');
    const a = Math.atan2(v.y, v.x);
    const s = Math.max(26, speed * 1.2);
    h.drillV = { x: Math.cos(a) * s, y: Math.sin(a) * s };
    h.drillT = 28;
    h.isSensor = true;
    FX.ring(x, y, 70, H.trail, 8, 0.26);
    FX.sparks(x, y, '#e8ffd0', 16, 380, 0.4);
    FX.text(x, y - 40, t('wordDrill'), '#c8ff8a', 28);
    addTrauma(0.2);
  } else if (H.ability === 'frost') {
    Body.setVelocity(h, { x: v.x * 0.85, y: v.y * 0.85 });
    frostWave(x, y, 215);
  }
}

// Снежок превращает постройку в хрупкий лёд, сбивает дронов и щиты
function frostWave(x, y, radius) {
  Sound.ability('frost');
  addTrauma(0.22);
  FX.flash(x, y, radius * 0.95, '#bff7ff', 0.2);
  FX.ring(x, y, radius, '#ffffff', 12, 0.4);
  FX.ring(x, y, radius * 0.68, '#c8fff6', 9, 0.32);
  FX.sparks(x, y, '#e8ffff', 26, 540, 0.6);
  FX.text(x, y - 44, t('wordFrost'), '#c8fff6', 30);
  wakeAll();
  Balloons.blast(x, y, radius);
  blocks.forEach((b) => {
    if (b.mat === 'ice' || b.mat === 'boom') return;
    if (Math.hypot(b.position.x - x, b.position.y - y) > radius + Math.max(b.w, b.h) * 0.3) return;
    const k = b.hp / b.maxHp;
    b.mat = 'ice';
    b.maxHp = MATERIALS.ice.hp;
    b.hp = Math.max(1, b.maxHp * k);
    b.hitFlash = 1;
    FX.sparks(b.position.x, b.position.y, '#d9fbff', 5, 200, 0.4);
  });
  bots.forEach((b) => {
    if (Math.hypot(b.position.x - x, b.position.y - y) > radius) return;
    b.frozenT = b.isBoss ? 2.6 : 4;
    if (b.shield > 0) popShield(b);
    if (b.hover && !b.isBoss) {
      b.hover = null;
      b.sleepThreshold = 50;
    }
  });
}

// Щит гаснет целиком: сразу следом урон не проходит
function popShield(b) {
  b.shield = 0;
  b.shieldT = 0.3;
  b.hitFlash = 1;
  const { x, y } = b.position;
  Sound.shieldPop();
  FX.ring(x, y, b.circleRadius * 2.6, '#9be8ff', 8, 0.32);
  FX.sparks(x, y, '#bff4ff', 14, 340, 0.4);
  FX.text(x, y - b.circleRadius - 26, t('wordShield'), '#9be8ff', 22, 0.8);
}

function detonateHero(h, radius) {
  const { x, y } = h.position;
  flying = flying.filter((b) => b !== h);
  if (primary === h) primary = null;
  World.remove(world, h);
  explode(x, y, radius, 19, 110);
}

// =====================================================
// ВЗРЫВЫ И УРОН
// =====================================================
function blastBodies(x, y, radius, kick, dmg, source) {
  wakeAll();
  Balloons.blast(x, y, radius);
  blocks.concat(bots).forEach((b) => {
    if (b.dead) return;
    const dx = b.position.x - x;
    const dy = b.position.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist >= radius || dist < 0.1) return;
    const k = 1 - dist / radius;
    const heavy = clamp(Math.sqrt(6 / b.mass), 0.55, 1.2);
    const v = Body.getVelocity(b);
    Body.setVelocity(b, {
      x: v.x + (dx / dist) * kick * k * heavy,
      y: v.y + ((dy / dist) * kick - 4) * k * heavy
    });
    b.kick = { x: (dx / dist) * kick * k, y: (dy / dist) * kick * k - 3, burnt: true };
    Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.3 * k);
    damage(b, dmg * k, source);
  });
}

let boomWordT = 0;

// Ударная волна: в 3D кадр на миг «плывёт» кольцом от центра взрыва
function shockwave(x, y, k) {
  if (scene3d && Save.shake) scene3d.shock(x, GROUND_Y - y, k);
}

function explode(x, y, radius, kick, dmg) {
  Sound.explosion();
  addTrauma(0.72);
  shockwave(x, y, clamp(radius / 190, 0.5, 1.2));
  cam.punch = Math.max(cam.punch, 0.05);
  hitStopMs = Math.max(hitStopMs, 55);
  UI.screenFlash();

  if (scene3d) {
    // В 3D огонь и дым объёмные, вспышка лишь подсвечивает кадр
    scene3d.fireballs.blast(x, GROUND_Y - y, radius);
    FX.flash(x, y, radius * 0.8, '#fff0c8', 0.09);
    FX.flash(x, y, radius * 1.25, '#ff9a1f', 0.2);
  } else {
    FX.flash(x, y, radius * 1.05, '#ffffff', 0.15);
    FX.flash(x, y, radius * 1.5, '#ff9a1f', 0.28);
    FX.fire(x, y, radius * 0.42, quality > 0 ? 26 : 13);
    FX.smoke(x, y, '#3b2240', quality > 0 ? 12 : 6, 120, 1.15, radius * 0.45);
  }
  FX.sparks(x, y, '#ffd23f', 26, 760, 0.65);
  FX.sparks(x, y, '#ff7a1a', 14, 560, 0.5);
  FX.ring(x, y, radius, '#ffe9a8', scene3d ? 8 : 16, 0.36);
  // Надпись одна на всю цепочку взрывов, иначе за словами не видно самого обрушения
  if (boomWordT <= 0) {
    FX.text(x, y - 74, t('wordBoom'), '#ffd23f', 36, 1.0);
    boomWordT = 0.7;
  }
  if (y > GROUND_Y - 80) FX.scorch(x, GROUND_Y, radius * 1.1);
  if (phase === 'flight' || phase === 'settle') cam.focus = { x, y, zoom: overview.flightZoom, t: 0.8 };

  blastBodies(x, y, radius, kick, dmg, null);
}

function damage(b, dmg, attacker) {
  if (b.dead || presettling || b.safeUntil > simSteps) return;
  if (attacker && attacker.label === 'hero' && b.mat) {
    dmg *= HEROES[attacker.heroType].vs[b.mat] || 1;
  }
  if (b.label === 'bot') {
    if (b.shieldT > 0) return;
    if (b.lift && b.lift.n > 0) {
      liftBounce(b, dmg);
      return;
    }
    if (b.shield > 0) {
      if (dmg >= 6) popShield(b);
      return;
    }
    if (b.frozenT > 0) dmg *= 2.5;
  }
  b.hp -= dmg;
  b.hitFlash = Math.min(1, b.hitFlash + 0.6);
  if (b.hp <= 0) {
    if (b.label === 'block') killBlock(b);
    else if (b.label === 'bot') killBot(b);
  } else if (b.isBoss) {
    while (b.phases.length && b.hp / b.maxHp <= b.phases[0]) {
      b.phases.shift();
      later(30, () => bossRage(b));
    }
  }
}

function reachTop(x) {
  for (let i = 1; i < REACH_TOP.length; i++) {
    const [x1, y1] = REACH_TOP[i];
    const [x0, y0] = REACH_TOP[i - 1];
    if (x <= x1) return lerp(y0, y1, clamp((x - x0) / (x1 - x0), 0, 1));
  }
  return 0;
}

// Босс злится: снова закрывается щитом и зовёт помощников
function bossRage(b) {
  if (b.dead) return;
  const { x, y } = b.position;
  b.shield = 1;
  if (b.lift) bossRelift(b);
  else b.hover.speed *= 1.25;
  Sound.bossRage();
  addTrauma(0.5);
  FX.ring(x, y, b.circleRadius * 3, '#ff5470', 12, 0.45);
  FX.text(x, y - b.circleRadius * 2.3, t('wordRage'), '#ff7a9a', 34, 1.2);
  // Помощник один и с ближней стороны: туда, куда пуф легко долетит
  const hx = clamp(x - levelShift - 150, 640, 1060);
  const hy = Math.max(y + 60, GROUND_Y - reachTop(hx) + 110);
  const helper = addBot(hx, hy, 24, false, {
    volatile: b.bombs, hover: { ax: 30, ay: 24, speed: 0.9 }
  });
  helper.hitFlash = 1;
  FX.flash(helper.position.x, helper.position.y, 70, '#ffffff');
}

// ---------- Гигабот на шариках ----------
let liftWordT = 0;
// Удар по боссу, пока шарики целы: отскок и подсказка «Лопни шарики!»
function liftBounce(b, dmg) {
  if (dmg < 6) return;
  b.hitFlash = 1;
  const { x, y } = b.position;
  FX.ring(x, y, b.circleRadius * 2.4, '#9be8ff', 7, 0.28);
  FX.sparks(x, y, '#bff4ff', 8, 300, 0.35);
  if (liftWordT <= 0) {
    FX.text(x, y - b.circleRadius - 30, t('wordBalloonsFirst'), '#ffffff', 24, 1.1);
    liftWordT = 1.4;
  }
  Sound.shieldPop();
}

// Последний шарик лопнул: босс без щита падает на свою крепость
function bossLiftLost(b) {
  if (!b.lift || b.dead) return;
  b.lift.n = Math.max(0, b.lift.n - 1);
  if (b.lift.n > 0) return;
  b.hover = null;
  b.sleepThreshold = 50;
  b.shield = 0;
  Sleeping.set(b, false);
  wakeAll();
  Body.setVelocity(b, { x: 0, y: 2 });
  const { x, y } = b.position;
  Sound.shieldPop();
  addTrauma(0.3);
  FX.ring(x, y, b.circleRadius * 3, '#ffffff', 10, 0.4);
  FX.text(x, y - b.circleRadius - 40, t('wordFall'), '#ffd23f', 34, 1.2);
  if (slowmoT <= 0) slowmo(0.5, 0.45);
  cam.focus = { x, y: y + 60, zoom: overview.flightZoom, t: 1.1 };
}

// Ярость: босс надувает два новых шарика и снова взлетает к себе домой
function bossRelift(b) {
  b.lift.n = 2;
  b.shield = 1;
  b.sleepThreshold = Infinity;
  Sleeping.set(b, false);
  b.hover = { x: b.lift.home.x, y: b.lift.home.y - 10, ax: 40, ay: 18, speed: 0.62, phase: 0, t: 0 };
  Balloons.lift(b, 2, b.lift.len);
  FX.text(b.position.x, b.position.y - b.circleRadius - 70, t('wordInflate'), '#ff9ae0', 28, 1.2);
}

// Пыльная волна от тяжёлого обломка у земли
function dustWave(x, size) {
  const n = quality > 0 ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    FX.add({
      k: 'smoke', x: x + side * (8 + i * 6), y: GROUND_Y - 8, vx: side * (90 + Math.random() * 120), vy: -20 - Math.random() * 30, g: -10, drag: 0.95,
      ttl: 0.9 + Math.random() * 0.5, s0: size * 0.18, s1: size * 0.5, c: '#e6d6bc', a: 0.6
    });
  }
}

let collapseCount = 0;
let collapseT = 0;
let simSteps = 0;

function killBlock(b) {
  b.dead = true;
  blocks = blocks.filter((q) => q !== b);
  removals.push(b);
  const m = MATERIALS[b.mat];
  const { x, y } = b.position;
  const size = Math.max(b.w, b.h);
  Sound.shatter(m.sound);
  // Дальше всего обломки летят туда, куда их толкнули
  if (scene3d) {
    scene3d.shards.burst(b, b.kick);
    FX.chips(x, y, m.chips, 4, 260);
  } else {
    FX.chips(x, y, m.chips, b.mat === 'stone' ? 14 : 11, 340);
  }
  const dust = b.mat === 'ice' ? '#e8fbff' : b.mat === 'stone' ? '#c8c2ba' : b.mat === 'steel' ? '#5d6470' : '#d9c7a4';
  FX.smoke(x, y, dust, Math.round(clamp(size / 28, 3, 7)), 90, 0.75, clamp(size * 0.34, 20, 46));
  FX.flash(x, y, size * 0.9, b.mat === 'ice' ? '#d9fbff' : '#fff0c8', 0.1);
  if (b.mat === 'ice') FX.sparks(x, y, '#d9fbff', 14, 380, 0.45);
  if (b.mat === 'steel') FX.sparks(x, y, '#ffd38a', 18, 460, 0.5);
  addTrauma(clamp(size / 900, 0.04, 0.14));
  // Очки за блоки считаются молча: при обрушении цифры закрывали бы всё действие
  addScore(b.piece ? Math.round(m.pts / 3) : m.pts);
  Goals.onBlock(b, b.piece ? Math.round(m.pts / 3) : m.pts);
  // Тяжёлый обломок у земли поднимает облако пыли в обе стороны
  if (y > GROUND_Y - 90 && size >= 60) dustWave(x, size);
  if (b.mat === 'boom') {
    later(55 + Math.random() * 60, () => explode(x, y, 175, 17, 85));
  } else if (!b.piece && size >= 110 && b.mat !== 'steel') {
    later(0, () => snapBlock(b));
  }
  // Сломалось сразу много: короткое замедление и надпись
  collapseCount = collapseT > 0 ? collapseCount + 1 : 1;
  collapseT = 0.45;
  if (collapseCount === 5 && !levelOver) {
    FX.text(x, y - 60, t('wordCollapse'), '#ffe9a8', 34, 1.1);
    if (slowmoT <= 0) slowmo(0.42, 0.55);
    addTrauma(0.3);
  }
}

// Длинная балка ломается пополам: половины падают дальше и бьют то, что под ними
function snapBlock(b) {
  const along = b.w >= b.h;
  const half = Math.max(b.w, b.h) / 2;
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const v = Body.getVelocity(b);
  [-1, 1].forEach((side) => {
    const off = side * half * 0.5;
    const px = b.position.x + (along ? c : -s) * off;
    const py = b.position.y + (along ? s : c) * off;
    const q = addBlock(px - levelShift, py, along ? half : b.w, along ? b.h : half, b.mat, true);
    q.hp = q.maxHp = MATERIALS[b.mat].hp * 0.6;
    // Половинки сперва целы: иначе разобьются о соседей ещё в момент появления
    q.safeUntil = simSteps + 16;
    Body.setAngle(q, b.angle + side * 0.1);
    Body.setVelocity(q, { x: v.x + (along ? c : -s) * side * 1.6, y: v.y + (along ? s : c) * side * 1.6 - 1 });
    Body.setAngularVelocity(q, b.angularVelocity + side * 0.05);
  });
}

function bodyHas(q, x, y, r) {
  const c = Math.cos(q.angle);
  const s = Math.sin(q.angle);
  const dx = x - q.position.x;
  const dy = y - q.position.y;
  return Math.abs(dx * c + dy * s) < q.w / 2 + r && Math.abs(dy * c - dx * s) < q.h / 2 + r;
}

function killBot(b) {
  b.dead = true;
  bots = bots.filter((q) => q !== b);
  removals.push(b);
  const { x, y } = b.position;
  combo = comboTimer > 0 ? combo + 1 : 1;
  comboTimer = 1.5;
  lastKill = { x, y };
  Goals.onBot();
  if (b.volatile) later(70 + Math.random() * 70, () => explode(x, y, 150, 15, 90));
  if (b.isBoss) {
    for (let i = 0; i < 4; i++) {
      later(130 + i * 170, () => explode(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120, 110, 6, 30));
    }
    bossDefeated(x, y);
  }

  Sound.botDown(combo - 1);
  addTrauma(b.isMega ? 0.46 : 0.28);
  hitStopMs = Math.max(hitStopMs, b.isMega ? 75 : 45);
  FX.flash(x, y, 90, '#7ef9ff', 0.16);
  FX.ring(x, y, b.isMega ? 130 : 88, '#7ef9ff', 9, 0.34);
  FX.lightning(x, y, b.isMega ? 110 : 76, b.isMega ? 8 : 5);
  FX.gears(x, y, b.isMega ? 12 : 7, 430, b.isMega);
  FX.sparks(x, y, '#7ef9ff', 16, 480, 0.5);
  FX.sparks(x, y, '#ff2e88', 10, 360, 0.42);
  FX.smoke(x, y, '#46406e', 4, 70, 0.8, 26);

  const pts = Math.round((b.isBoss ? 10000 : b.isMega ? 3000 : 1000) * (1 + (combo - 1) * 0.5));
  addScore(pts, x, y - 18, b.isMega ? '#ffd23f' : '#7cff5c', b.isMega ? 32 : 26);
  const words = t('wordBot');
  if (combo >= 2) {
    const word = combo === 2 ? t('wordCombo2') : combo === 3 ? t('wordCombo3') : t('wordComboN');
    FX.text(x, y - 64, word, '#ff7ac6', 30 + Math.min(combo, 5) * 3, 1.25);
  } else {
    FX.text(x, y - 56, words[Math.floor(Math.random() * words.length)], '#ffffff', 22, 0.85);
  }
  queueCheer();
}

// Финал боя с боссом: замедление, белая вспышка, золотые кольца, звёзды и конфетти
let bossDownAt = -1;
function bossDefeated(x, y) {
  slowmo(1.6, 0.22);
  hitStopMs = Math.max(hitStopMs, 120);
  UI.screenFlash(true);
  shockwave(x, y, 1.6);
  cam.punch = Math.max(cam.punch, 0.09);
  [0, 1, 2, 3].forEach((i) => later(i * 140, () => FX.ring(x, y, 160 + i * 90, i % 2 ? '#ffd23f' : '#ffffff', 9 - i * 2, 0.6)));
  for (let i = 0; i < 26; i++) FX.star(x, y, i % 3 ? '#ffd23f' : '#ffffff');
  FX.confetti(x, y - 40, quality > 0 ? 90 : 40, 260, 420);
  bossDownAt = simSteps;
  Sound.bossDown();
}

let cheerT = 0;
function queueCheer() {
  cheerT = 1.1;
}

function addScore(pts, x, y, color, size) {
  score += pts;
  Goals.onScore();
  // Небольшой разброс, чтобы числа при цепной реакции не слипались
  if (x !== undefined) FX.text(x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 16, `+${pts}`, color, size);
}

function wakeAll() {
  blocks.concat(bots).forEach((b) => {
    if (b.isSleeping) Sleeping.set(b, false);
  });
}

function flushRemovals() {
  if (!removals.length) return;
  removals.forEach((b) => World.remove(world, b));
  removals = [];
  wakeAll();
}

Events.on(engine, 'collisionStart', (event) => {
  if (presettling) return;
  event.pairs.forEach((pair) => {
    const a = pair.bodyA;
    const b = pair.bodyB;

    // Шаровая молния срабатывает от любого касания
    [a, b].forEach((o) => {
      if (o.label === 'orb' && !o.dead) {
        o.dead = true;
        removals.push(o);
        orbs = orbs.filter((q) => q !== o);
        const { x, y } = o.position;
        later(0, () => {
          if (o.stick) {
            explode(x, y, 140, 14, 80);
            return;
          }
          explode(x, y, 165, 16, 100);
          FX.lightning(x, y, 150, 9);
        });
      }
    });

    const va = Body.getVelocity(a);
    const vb = Body.getVelocity(b);
    const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
    const hero = a.label === 'hero' ? a : b.label === 'hero' ? b : null;
    const other = hero === a ? b : a;

    // Бур идёт насквозь: ломает всё, чего коснётся, и не останавливается
    if (hero && hero.drillT > 0) {
      if (other.label === 'block' || other.label === 'bot') {
        damage(other, 160, hero);
        Sound.hit('stone', 14);
        addTrauma(0.14);
        FX.sparks(hero.position.x, hero.position.y, '#e8ffd0', 10, 420, 0.32);
        if (other.mat) FX.chips(hero.position.x, hero.position.y, MATERIALS[other.mat].chips, 6, 260);
      }
      return;
    }

    if (hero) {
      // Батут не считается ударом: способность после него ещё работает
      if (!hero.hasHit && other.label !== 'jelly') {
        hero.hasHit = true;
        hero.frictionAir = 0.018;
      }
      if (hero.heroType === 'magma' && !hero.fuse && flying.includes(hero)) hero.fuse = 70;
      // Динамит взрывается от первого настоящего удара
      if (hero.heroType === 'dyna' && other.label !== 'jelly' && !hero.blown && flying.includes(hero)) {
        hero.blown = true;
        later(0, () => {
          if (flying.includes(hero)) {
            abilityUsed = true;
            detonateHero(hero, 185);
          }
        });
      }
      if (rel > 3) {
        hero.squish = Math.min(0.38, 0.1 + rel * 0.012);
        hero.hurtT = 0.32;
      }
    }

    if (rel < 2.2) return;
    const contact = pair.collision && pair.collision.supports && pair.collision.supports[0];
    const cx = contact ? contact.x : (a.position.x + b.position.x) / 2;
    const cy = contact ? contact.y : (a.position.y + b.position.y) / 2;

    [[a, b], [b, a]].forEach(([target, source]) => {
      if (target.label === 'block' || target.label === 'bot') {
        // Обломки полетят по направлению удара
        if (target.label === 'block') {
          const sv = source === a ? va : vb;
          target.kick = { x: sv.x * 0.6, y: sv.y * 0.6 - 2 };
        }
        damage(target, rel * 4.3, source);
      }
    });

    // Пуф пробивает сломанное насквозь и летит дальше
    if (hero && other.dead && (other.label === 'block' || other.label === 'bot') && hero.drillT <= 0) {
      const heroV = hero === a ? va : vb;
      later(0, () => {
        if (flying.includes(hero)) Body.setVelocity(hero, { x: heroV.x * 0.72, y: heroV.y * 0.72 });
      });
    }

    const pad = a.label === 'jelly' ? a : b.label === 'jelly' ? b : null;
    if (pad) {
      pad.wob = 1;
      Sound.boing();
      FX.ring(cx, cy, 46, '#ff9ae0', 7, 0.26);
      FX.sparks(cx, cy, '#ffc4ee', 8, 280, 0.32);
      return;
    }

    const matBody = a.mat ? a : b.mat ? b : null;
    if (matBody && rel > 3) {
      const m = MATERIALS[matBody.mat];
      Sound.hit(m.sound, rel);
      FX.chips(cx, cy, m.chips, Math.min(5, Math.floor(rel / 3)), 170);
    } else if ((other.label === 'ground' || other.label === 'rock') && hero && rel > 4) {
      Sound.thud();
      FX.smoke(cx, other.label === 'ground' ? GROUND_Y - 2 : cy, '#e8dcc8', 3, 60, 0.45, 18);
    } else if (hero && other.label === 'bot' && rel > 3) {
      Sound.hit('stone', rel * 0.5);
      FX.sparks(cx, cy, '#ffffff', 8, 300, 0.3);
    }
    if (rel > 6) addTrauma(Math.min(0.26, rel * 0.012));
  });
});

// =====================================================
// ЛОГИКА ХОДА (фиксированный шаг 60 Гц)
// =====================================================
function later(ms, fn) {
  timers.push({ t: ms, fn });
}

function slowmo(seconds, scale) {
  slowmoT = seconds;
  slowmoScale = scale;
}

function speedOf(b) {
  const v = Body.getVelocity(b);
  return Math.hypot(v.x, v.y);
}

function outOfWorld(b) {
  return b.position.x > WORLD_W + 500 || b.position.x < -500 || b.position.y > GROUND_Y + 300;
}

function poof(h) {
  FX.smoke(h.position.x, h.position.y, '#ffffff', 5, 70, 0.55, 26);
  FX.sparks(h.position.x, h.position.y, HEROES[h.heroType].trail, 8, 200, 0.35);
}

function worldCalm() {
  for (let i = 0; i < blocks.length; i++) if (!blocks[i].isSleeping && speedOf(blocks[i]) > 0.55) return false;
  for (let i = 0; i < bots.length; i++) if (!bots[i].hover && !bots[i].isSleeping && speedOf(bots[i]) > 0.55) return false;
  return orbs.length === 0;
}

function endTurn() {
  flying.forEach((h) => {
    poof(h);
    World.remove(world, h);
  });
  flying = [];
  primary = null;
  tapPrompt = 0;
  slowmoT = 0;
  phase = 'settle';
  settleTimer = 0;
}

// Дроны и босс сами держатся в воздухе; после удара они возвращаются на свой маршрут
function updateHover() {
  const k = engine.timing.timeScale;
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    const h = b.hover;
    if (!h) continue;
    const v = Body.getVelocity(b);
    if (b.frozenT > 0) {
      Body.setVelocity(b, { x: v.x * 0.9, y: v.y * 0.9 - 0.2778 });
      continue;
    }
    h.t += (STEP_MS / 1000) * k;
    const tx = h.x + Math.sin(h.t * h.speed + h.phase) * h.ax;
    const ty = h.y + Math.sin(h.t * h.speed * 1.37 + h.phase) * h.ay;
    Body.setVelocity(b, {
      x: lerp(v.x, (tx - b.position.x) * 0.1, 0.25),
      y: lerp(v.y, (ty - b.position.y) * 0.1, 0.25) - 0.2778
    });
    Body.setAngle(b, b.angle * 0.92);
    Body.setAngularVelocity(b, 0);
  }
}
Events.on(engine, 'beforeUpdate', updateHover);

function stepSim() {
  simSteps++;
  engine.timing.timeScale = slowmoT > 0 ? slowmoScale : 1;
  Engine.update(engine, STEP_MS);
  flushRemovals();
  Balloons.step();
  for (let i = 0; i < bots.length; i++) {
    if (bots[i].shieldT > 0) bots[i].shieldT -= STEP_MS / 1000;
    if (bots[i].frozenT > 0) bots[i].frozenT -= STEP_MS / 1000;
  }

  // Запланированные события считаются игровым временем — на паузе они стоят
  if (timers.length) {
    const due = [];
    timers = timers.filter((q) => {
      q.t -= STEP_MS;
      if (q.t <= 0) {
        due.push(q);
        return false;
      }
      return true;
    });
    due.forEach((q) => q.fn());
    flushRemovals();
  }

  // Боты, улетевшие за край мира, считаются уничтоженными
  bots.slice().forEach((b) => {
    if (outOfWorld(b)) killBot(b);
  });
  blocks.slice().forEach((b) => {
    if (outOfWorld(b)) {
      b.dead = true;
      blocks = blocks.filter((q) => q !== b);
      removals.push(b);
    }
  });
  flushRemovals();

  updateFlight();

  if (!levelOver) {
    if (bots.length === 0 && phase !== 'attract') {
      startWin();
    } else if (phase === 'flight') {
      updateTurn();
    } else if (phase === 'settle') {
      updateSettle();
    }
  }
}

// Ускорение от вихрей в точке. Этой же формулой считается линия прицела
const wellA = { x: 0, y: 0 };
function wellAccel(x, y) {
  wellA.x = 0;
  wellA.y = 0;
  let inside = false;
  for (let i = 0; i < wells.length; i++) {
    const w = wells[i];
    const dx = w.x - x;
    const dy = w.y - y;
    const d = Math.hypot(dx, dy);
    if (d >= w.radius || d < 1) continue;
    const k = w.pull * (1 - d / w.radius);
    wellA.x += (dx / d) * k;
    wellA.y += (dy / d) * k;
    inside = true;
  }
  return inside;
}

function pullByWells(b) {
  if (!wells.length) return;
  if (wellAccel(b.position.x, b.position.y)) {
    const v = Body.getVelocity(b);
    Body.setVelocity(b, { x: v.x + wellA.x, y: v.y + wellA.y });
    b.inWell = (b.inWell || 0) + 1;
  }
}

// Куда ведёт портал в этой точке
function portalExit(x, y) {
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (Math.hypot(p.a.x - x, p.a.y - y) < PORTAL_R) return p.b;
    if (Math.hypot(p.b.x - x, p.b.y - y) < PORTAL_R) return p.a;
  }
  return null;
}

function passPortals(b) {
  if (!portals.length) return;
  if (b.portalCd > 0) {
    b.portalCd--;
    return;
  }
  if (speedOf(b) < 3) return;
  const to = portalExit(b.position.x, b.position.y);
  if (!to) return;
  const { x, y } = b.position;
  Body.setPosition(b, { x: to.x, y: to.y });
  b.portalCd = 24;
  if (b.trail) b.trail.length = 0;
  Sound.portal();
  [[x, y], [to.x, to.y]].forEach(([px, py]) => {
    FX.ring(px, py, PORTAL_R * 2.4, '#ffffff', 8, 0.3);
    FX.sparks(px, py, '#b78cff', 12, 320, 0.4);
  });
}

function takeGems(h) {
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (g.taken || Math.hypot(g.x - h.position.x, g.y - h.position.y) > h.circleRadius + GEM_R) continue;
    g.taken = true;
    gemsTaken++;
    Sound.gem();
    addScore(1500, g.x, g.y - 24, '#7ef9ff', 26);
    FX.ring(g.x, g.y, 60, '#7ef9ff', 8, 0.3);
    for (let k = 0; k < 10; k++) FX.star(g.x, g.y, '#b8fbff');
    UI.updateGems();
  }
}

function updateDrill(h) {
  Body.setVelocity(h, h.drillV);
  const r = h.circleRadius;
  const nx = h.position.x + h.drillV.x;
  const ny = h.position.y + h.drillV.y;
  h.drillT--;
  // В землю и в скалу сверло не войдёт
  const stopped = ny + r > GROUND_Y || rocks.some((q) => bodyHas(q, nx, ny, r));
  if (stopped) h.drillT = 0;
  if (h.drillT > 0) return;
  // Пока пуф внутри блока, сверло крутится: иначе физика вышвырнет его наружу
  if (!stopped && blocks.some((q) => bodyHas(q, h.position.x, h.position.y, r))) {
    h.drillT = 1;
    return;
  }
  h.isSensor = false;
  h.hasHit = true;
  h.frictionAir = 0.018;
}

function updateFlight() {
  for (let i = flying.length - 1; i >= 0; i--) {
    const h = flying[i];
    if (h.fuse > 0) {
      h.fuse--;
      if (h.fuse === 0) {
        abilityUsed = true;
        detonateHero(h, 190);
        continue;
      }
    }
    if (h.drillT > 0) updateDrill(h);
    else pullByWells(h);
    // Из вихря долго не выбраться: пуф исчезает, чтобы ход не затягивался
    if (h.inWell > 260) {
      poof(h);
      flying.splice(i, 1);
      if (primary === h) primary = null;
      World.remove(world, h);
      continue;
    }
    passPortals(h);
    takeGems(h);
    if (!h.hasHit) {
      Body.setAngle(h, 0);
      Body.setAngularVelocity(h, 0);
    }
  }
  orbs.forEach((o) => {
    pullByWells(o);
    passPortals(o);
  });
}

function updateTurn() {
  turnTimer++;
  // Магма ждёт свой запал, а Нимбус после сброса молнии просто улетает
  const done = orbs.length === 0 && flying.every((h) => h.dropped || (speedOf(h) < 0.42 && !h.fuse) || outOfWorld(h));
  restTimer = done ? restTimer + 1 : 0;
  if (flying.length === 0 || restTimer > 30 || turnTimer > 480) endTurn();
}

function updateSettle() {
  settleTimer++;
  const calm = worldCalm();
  if ((calm && settleTimer > 10) || settleTimer > 60) Goals.maybeBonus();
  if (queue.length > 0) {
    if ((calm && settleTimer > 14) || settleTimer > 70) takeNextHero(false);
  } else if ((calm && settleTimer > 30) || settleTimer > 260) {
    startLose();
  }
}

function startWin() {
  levelOver = true;
  phase = 'over';
  flying.forEach((h) => {
    h.frictionAir = 0.03;
  });
  pull = null;
  drag = null;
  UI.setHint('');
  if (lastKill) cam.focus = { x: lastKill.x, y: lastKill.y, zoom: overview.zoom * 1.22, t: 0.95 };
  if (slowmoT <= 0) slowmo(0.8, 0.28);
  if (lastKill) {
    shockwave(lastKill.x, lastKill.y, 0.9);
    FX.ring(lastKill.x, lastKill.y, 220, '#fff2a8', 10, 0.5);
  }
  // Победа над боссом — свой заголовок вместо «Зачищено!»
  UI.banner(bossDownAt >= 0 && simSteps - bossDownAt < 600 ? t('wordBossDown') : t('clear'), '', true);
  Sound.win();
  later(240, () => FX.confetti(cam.x, cam.y - vh / 2 / cam.zoom, quality > 0 ? 70 : 34, vw / cam.zoom, 120));
  // Хлопушки снизу по краям кадра
  later(420, () => {
    const half = vw / 2 / cam.zoom;
    const gy = Math.min(GROUND_Y, cam.y + vh / 2 / cam.zoom) - 10;
    [-1, 1].forEach((s) => {
      for (let i = 0; i < (quality > 0 ? 40 : 18); i++) {
        FX.add({
          k: 'confetti', x: cam.x + s * half * 0.92, y: gy, vx: -s * (120 + Math.random() * 260), vy: -(380 + Math.random() * 360), g: 320, drag: 0.985,
          ttl: 2 + Math.random() * 1.2, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
          phase: Math.random() * TAU, c: ['#ff2e88', '#ffd23f', '#29f3ff', '#7cff5c', '#b78cff', '#ffffff'][i % 6]
        });
      }
    });
    Sound.pops();
  });
  later(1000, runBonus);
}

// Каждый оставшийся пуф превращается в очки
function runBonus() {
  const leftovers = [];
  if (slingHero) leftovers.push({ x: slingHero.x, y: slingHero.y, type: slingHero.type, onSling: true });
  queueView.forEach((q, i) => leftovers.push({ x: queueX(i), y: GROUND_Y - 22, type: q.type }));
  const per = 1500;
  // Дополнительные пуфы очков не дают, иначе проигрыш стал бы способом набить счёт
  const paid = Math.min(leftovers.length, Math.max(0, cfg.heroes.length - shotsFired));
  leftovers.forEach((lv, i) => {
    later(i * 300, () => {
      if (lv.onSling) slingHero = null;
      else queueView.shift();
      if (queue.length) queue.shift();
      Sound.coin();
      FX.flash(lv.x, lv.y, 50, HEROES[lv.type].trail);
      for (let k = 0; k < 8; k++) FX.star(lv.x, lv.y);
      if (i < paid) addScore(per, lv.x, lv.y - 30, '#ffd23f', 26);
    });
  });
  later(leftovers.length * 300 + 350, () => finishLevel(true, paid * per));
}

function finishLevel(win, bonus) {
  if (win) {
    levelFails[level] = 0;
    const used = shotsFired;
    const stars = used <= cfg.par ? 3 : used <= cfg.par + 1 ? 2 : 1;
    const before = Save.best[level] || 0;
    const newBest = score > before;
    const pointsBefore = trailPoints();
    Save.gems[level] = Math.max(Save.gems[level], gemsTaken);
    const medal = Goals.finish(true);
    Save.recordWin(level, stars, score);
    const trails = TRAILS.map((tr, i) => i).filter((i) => TRAILS[i].need > pointsBefore && TRAILS[i].need <= trailPoints());
    if (trails.length) {
      Save.newTrail = true;
      Platform.requestSave();
    }
    UI.showResult({ win: true, stars, score, bonus, newBest, level, medal, trails });
  } else {
    levelFails[level]++;
    UI.showResult({ win: false, stars: 0, score, bonus: 0, newBest: false, level, medal: { earned: false } });
  }
}

function startLose() {
  levelOver = true;
  phase = 'over';
  UI.setHint('');
  Sound.lose();
  bots.forEach((b) => {
    b.laugh = 1.5;
  });
  later(1150, () => finishLevel(false));
}

// =====================================================
// УПРАВЛЕНИЕ: касание, мышь, клавиатура
// =====================================================
function pullScale() {
  // На маленьком экране полное натяжение не требует длинного свайпа
  return Math.max(cam.zoom, 110 / MAX_PULL);
}

function setPull(dx, dy) {
  if (dx > 14) dx = 14;
  const len = Math.hypot(dx, dy);
  if (len > MAX_PULL) {
    dx = (dx / len) * MAX_PULL;
    dy = (dy / len) * MAX_PULL;
  }
  pull = { x: dx, y: dy };
  Sound.stretch(Math.hypot(dx, dy) / MAX_PULL);
}

function showHeroHint() {
  // На обучении подсказка про способность только отвлекала бы от первого выстрела
  if (Balloons.total && !Save.seen.balloons) UI.setHint(t('balloonHint'));
  else UI.setHint(showTutorial ? '' : heroHint(slingHero.type));
}

function skipIntro() {
  if (phase === 'intro') {
    phase = 'aim';
    introTimer = 0;
    showHeroHint();
  }
}

function inputBlocked() {
  return sysPaused || UI.current !== null || levelOver || phase === 'attract';
}

canvas.addEventListener('pointerdown', (e) => {
  Sound.unlock();
  if (inputBlocked()) return;
  skipIntro();
  if (phase === 'aim' && slingHero) {
    if (drag) return;
    if (slingHero.hop < 1) slingHero.hop = 1;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
    kbAim = null;
    pull = { x: 0, y: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
  } else if (phase === 'flight') {
    useAbility();
  }
});

window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || sysPaused) return;
  const k = pullScale();
  setPull((e.clientX - drag.sx) / k, (e.clientY - drag.sy) / k);
});

function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  if (cancel || sysPaused || !pull || phase !== 'aim') {
    pull = null;
    return;
  }
  if (Math.hypot(pull.x, pull.y) > 18) {
    fire();
  } else {
    pull = null;
    if (!showTutorial) UI.setHint(t('dragHint'));
  }
}

window.addEventListener('pointerup', (e) => endDrag(e, false));
window.addEventListener('pointercancel', (e) => endDrag(e, true));

function applyKbAim() {
  setPull(-Math.cos(kbAim.angle) * kbAim.power * MAX_PULL, Math.sin(kbAim.angle) * kbAim.power * MAX_PULL);
}

window.addEventListener('keydown', (e) => {
  // Esc только закрывает окна; preventDefault на нём запрещён требованиями YouTube
  if (e.key === 'Escape') {
    UI.handleEsc();
    return;
  }
  if (sysPaused || UI.current !== null) return;
  if (e.code === 'KeyP') {
    UI.show('pause');
    return;
  }
  if (e.code === 'KeyR' && phase !== 'attract') {
    UI.restart();
    return;
  }
  if (inputBlocked()) return;

  const arrows = { ArrowUp: [0.05, 0], ArrowDown: [-0.05, 0], ArrowLeft: [0, 0.04], ArrowRight: [0, -0.04] };
  if (arrows[e.code]) {
    e.preventDefault();
    skipIntro();
    if (phase === 'aim' && slingHero) {
      if (!kbAim) kbAim = { angle: 0.6, power: 0.8 };
      kbAim.angle = clamp(kbAim.angle + arrows[e.code][0], -0.5, 1.45);
      kbAim.power = clamp(kbAim.power + arrows[e.code][1], 0.2, 1);
      applyKbAim();
    }
    return;
  }
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (e.repeat) return;
    skipIntro();
    if (phase === 'flight') {
      useAbility();
    } else if (phase === 'aim' && slingHero) {
      if (!kbAim) {
        kbAim = { angle: 0.6, power: 0.8 };
        applyKbAim();
      } else {
        fire();
      }
    }
  }
});

// =====================================================
// ЭКРАН: подстройка под любой размер и соотношение сторон
// =====================================================
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // На Android игра сначала грузится в скрытом WebView с нулевым размером
  if (w <= 0 || h <= 0) {
    viewReady = false;
    return;
  }
  vw = w;
  vh = h;
  const raw = window.devicePixelRatio || 1;
  dpr = Math.min(raw, quality >= 2 ? 2.5 : quality === 1 ? 2 : 1.5);
  const maxPixels = quality >= 2 ? 4.4e6 : 2.4e6;
  if (w * h * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / (w * h));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  computeOverview();
  applyViewScale();
  viewReady = true;
  snapCameraKeepFocus();
}

function computeOverview() {
  if (!vw || !vh) return;
  const spanX = bounds.right - bounds.left;
  const spanY = Math.max(GROUND_Y - bounds.top + 190, 500) + 60;
  const zoom = Math.min(vw / spanX, vh / spanY);
  const free = Math.max(0, vh - spanY * zoom);
  overview.zoom = zoom;
  overview.groundY = vh - (60 * zoom + free * 0.34);
  overview.x = (bounds.left + bounds.right) / 2;
  overview.y = baseCamY(zoom);
  overview.flightZoom = zoom < 0.75 ? zoom * 1.5 : zoom * 1.1;
}

// Где должна быть камера по вертикали, чтобы земля осталась на своём месте
function baseCamY(zoom) {
  return GROUND_Y - (overview.groundY - vh / 2) / zoom;
}

function applyViewScale() {
  if (!vw) return;
  if (scene3d) {
    Background.prepareAmbient(cfg.biome);
    return;
  }
  Art.setScale(clamp(overview.flightZoom * 1.25 * dpr, 1.5, 4));
  const layerK = lerp(overview.zoom, 1, 0.5);
  Background.build(cfg.biome, clamp(Math.max(layerK, overview.zoom) * dpr, 1, quality >= 2 ? 2 : 1.25));
}

function snapCamera() {
  cam.x = overview.x;
  cam.y = overview.y;
  cam.zoom = overview.zoom;
}

function snapCameraKeepFocus() {
  if (phase === 'flight' || phase === 'over') return;
  snapCamera();
}

function addTrauma(v) {
  if (!Save.shake) return;
  cam.trauma = Math.min(1, cam.trauma + v);
}

function updateCamera(dt) {
  let tx = overview.x;
  let ty = overview.y;
  let tz = overview.zoom;
  let rate = 3.2;

  if (phase === 'intro') {
    introTimer -= dt;
    rate = 2.6;
    if (introTimer <= 0) {
      phase = 'aim';
      showHeroHint();
    } else if (introTimer > 0.5) {
      tz = overview.zoom * 1.28;
      tx = (bounds.fortL + bounds.right) / 2 - 20;
      ty = baseCamY(tz);
    }
  } else if (cam.focus) {
    tx = cam.focus.x;
    tz = cam.focus.zoom;
    ty = Math.min(baseCamY(tz), cam.focus.y + 40);
    rate = 5;
    cam.focus.t -= dt;
    if (cam.focus.t <= 0) cam.focus = null;
  } else if (phase === 'flight' && flying.length) {
    const lead = orbs[0] || (primary && flying.includes(primary) ? primary : flying[0]);
    tz = overview.flightZoom;
    const halfW = vw / 2 / tz;
    const minX = overview.x - Math.max(0, overview.x - bounds.left - halfW);
    const maxX = Math.max(minX, bounds.right - halfW + 30);
    tx = clamp(lead.position.x + halfW * 0.25, minX, maxX);
    // Следим за пуфом и по высоте, когда он улетает вверх
    ty = Math.min(baseCamY(tz), lead.position.y + (vh / 2 - 90) / tz);
    rate = 4;
  }

  const k = 1 - Math.exp(-dt * rate);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.zoom += (tz - cam.zoom) * k;
  cam.trauma = Math.max(0, cam.trauma - dt * 1.7);
  cam.punch *= Math.exp(-dt * 7);
}

// =====================================================
// ОБНОВЛЕНИЕ ВИЗУАЛЬНЫХ ЭФФЕКТОВ
// =====================================================
function updateVisuals(dt) {
  time += dt;
  updateCamera(dt);
  FX.update(dt);

  comboTimer = Math.max(0, comboTimer - dt);
  collapseT = Math.max(0, collapseT - dt);
  boomWordT = Math.max(0, boomWordT - dt);
  liftWordT = Math.max(0, liftWordT - dt);
  Balloons.update(dt);
  UI.tickMeter(dt);
  cheerT = Math.max(0, cheerT - dt);
  aimIdle = phase === 'aim' && !pull ? aimIdle + dt : 0;
  if (tapPrompt > 0) tapPrompt = Math.max(0, tapPrompt - dt);
  if (slowmoT > 0) slowmoT = Math.max(0, slowmoT - dt);

  // Пружинящая резинка
  if (!slingHero || slingHero.hop < 1) {
    // Мелкими шагами: при редких кадрах жёсткая пружина иначе разлетается
    const steps = Math.ceil(dt / 0.012);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const ax = -recoil.x * 320 - recoil.vx * 11;
      const ay = -recoil.y * 320 - recoil.vy * 11;
      recoil.vx += ax * h;
      recoil.vy += ay * h;
      recoil.x += recoil.vx * h;
      recoil.y += recoil.vy * h;
    }
  }

  if (slingHero) {
    if (slingHero.hop < 1) {
      slingHero.hop = Math.min(1, slingHero.hop + dt / 0.36);
      if (slingHero.hop >= 1) {
        slingHero.squish = 0.28;
        FX.sparks(SLING_X, SLING_Y + 10, HEROES[slingHero.type].trail, 6, 130, 0.3);
      }
    }
    slingHero.squish *= Math.exp(-dt * 9);
  }

  flying.forEach((h) => {
    const sp = speedOf(h);
    if (!h.hasHit || sp > 6) {
      h.trail.push(h.position.x, h.position.y);
      if (h.trail.length > 44) h.trail.splice(0, 2);
    } else if (h.trail.length) {
      h.trail.splice(0, 2);
    }
    h.squish *= Math.exp(-dt * 10);
    h.hurtT = Math.max(0, h.hurtT - dt);
    h.dashT = Math.max(0, h.dashT - dt);
    if (!h.hasHit && Math.random() < dt * 28) {
      FX.star(h.position.x - 6, h.position.y, HEROES[h.heroType].trail);
    }
    if (h.heroType === 'dyna' && !h.hasHit && Math.random() < dt * 30) {
      FX.sparks(h.position.x, h.position.y - h.circleRadius * 1.9, '#ffb347', 1, 130, 0.26);
    }
    if (h.fuse > 0 && Math.random() < dt * 40) {
      FX.sparks(h.position.x, h.position.y - h.circleRadius, '#ffb347', 1, 160, 0.3);
    }
    if (h.drillT > 0 && Math.random() < dt * 70) {
      FX.sparks(h.position.x, h.position.y, '#e8ffd0', 1, 260, 0.26);
    }
  });
  rocks.forEach((q) => {
    if (q.wob > 0) q.wob = Math.max(0, q.wob - dt * 2.4);
  });

  const target = flying.length ? flying[0].position : slingHero ? { x: SLING_X, y: SLING_Y } : null;
  bots.forEach((b) => {
    b.hitFlash *= Math.exp(-dt * 9);
    if (b.laugh > 0) b.laugh -= dt;
    if (target) {
      const dx = target.x - b.position.x;
      const dy = target.y - b.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const c = Math.cos(-b.angle);
      const s = Math.sin(-b.angle);
      b.lookX += ((dx * c - dy * s) / d - b.lookX) * Math.min(1, dt * 7);
      b.lookY += ((dx * s + dy * c) / d - b.lookY) * Math.min(1, dt * 7);
      const danger = flying.length && d < 250 ? 1 : 0;
      b.scared += (danger - b.scared) * Math.min(1, dt * 9);
    }
    // Повреждённый бот дымит и искрит
    if (b.hp < b.maxHp * 0.5 && Math.random() < dt * 5) {
      FX.sparks(b.position.x, b.position.y - b.circleRadius * 0.4, '#7ef9ff', 1, 150, 0.3);
      if (Math.random() < 0.4) FX.smoke(b.position.x, b.position.y - b.circleRadius, '#46406e', 1, 16, 0.7, 14);
    }
  });
  blocks.forEach((b) => {
    if (b.hitFlash > 0) b.hitFlash *= Math.exp(-dt * 12);
  });

  // Плавный счёт очков
  if (shownScore !== score) {
    shownScore = Math.min(score, Math.ceil(shownScore + Math.max(1, (score - shownScore) * Math.min(1, dt * 12))));
    UI.setScore(shownScore);
  }

  // Если устройство не тянет, быстро снижаем качество, а не FPS
  perfTime += dt;
  perfFrames++;
  if (perfTime >= 1.2) {
    const frame = perfTime / perfFrames;
    // Ниже ~45 кадров в секунду — ступенькой ниже (настройка «Авто»)
    if (frame > 0.0225 && quality > 0 && !lockQuality) {
      quality--;
      FX.max = FX_MAX[quality];
      resize();
    } else if (scene3d && quality === 0 && frame > 0.045 && !lockQuality) {
      // Даже самые простые настройки не тянут: лучше плавная двумерная картинка
      slowFrames3d++;
      if (slowFrames3d >= 3) disable3D('слишком медленно');
    } else {
      slowFrames3d = 0;
    }
    perfTime = 0;
    perfFrames = 0;
  }
}

// =====================================================
// ОТРИСОВКА
// =====================================================
function drawTrail(h) {
  const tr = h.trail;
  const n = tr.length / 2;
  if (n < 2) return;
  // Выбранный след: в двумерной версии меняется только цвет
  const style = trailStyle();
  const color = style === 'gold' ? '#ffc21f' : style === 'fire' ? '#ff7a1a' : style === 'bubbles' ? '#7ef9ff' : style === 'stars' ? '#ffe14d' : HEROES[h.heroType].trail;
  const r = h.circleRadius;
  ctx.globalCompositeOperation = 'lighter';
  const boost = h.dashT > 0 ? 1.6 : 1;
  const stride = quality === 0 ? 2 : 1;
  for (let i = 0; i < n; i += stride) {
    const k = i / n;
    const s = r * (0.5 + k * 1.5) * boost;
    const sprite = softSprite(style === 'rainbow' ? RAINBOW[(i + Math.floor(time * 20)) % RAINBOW.length] : color);
    ctx.globalAlpha = k * k * 0.72;
    ctx.drawImage(sprite, tr[i * 2] - s, tr[i * 2 + 1] - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// След за пуфом, выбранный в «Следах» (если он ещё открыт)
const RAINBOW = ['#ff3d3d', '#ff9a1f', '#ffe14d', '#7cff5c', '#29d8ff', '#5b7bff', '#c58cff'];
function trailStyle() {
  return TRAILS[trailOpen(Save.trail) ? Save.trail : 0].id;
}

function pouchPos() {
  if (slingHero && slingHero.hop >= 1) {
    const px = pull ? pull.x : 0;
    const py = pull ? pull.y : 0;
    return { x: SLING_X + px, y: SLING_Y + py };
  }
  return { x: SLING_X + recoil.x, y: SLING_Y + recoil.y };
}

function drawBand(tip, pouch, heroR) {
  if (heroR) {
    // Передняя резинка заканчивается у края пуфа и не закрывает ему лицо
    const dx = tip.x - pouch.x;
    const dy = tip.y - pouch.y;
    const d = Math.hypot(dx, dy) || 1;
    pouch = { x: pouch.x + (dx / d) * heroR * 0.82, y: pouch.y + (dy / d) * heroR * 0.82 };
  }
  const stretch = clamp(Math.hypot(pouch.x - tip.x, pouch.y - tip.y) / 150, 0, 1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a0a22';
  ctx.lineWidth = lerp(12, 7, stretch);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(pouch.x, pouch.y);
  ctx.stroke();
  ctx.strokeStyle = stretch > 0.72 ? '#ff5a3c' : '#ff2e88';
  ctx.lineWidth = lerp(8, 4, stretch);
  ctx.stroke();
}

// Во что попадёт пуф, если лететь по этой точке траектории
function aimContact(x, y, r) {
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (Math.hypot(b.position.x - x, b.position.y - y) < b.circleRadius + r) return b;
  }
  for (let i = 0; i < blocks.length; i++) {
    const m = blocks[i].bounds;
    if (x > m.min.x - r && x < m.max.x + r && y > m.min.y - r && y < m.max.y + r) return blocks[i];
  }
  for (let i = 0; i < rocks.length; i++) {
    if (bodyHas(rocks[i], x, y, r)) return rocks[i];
  }
  return null;
}

// Прицел показывает весь путь: сквозь порталы, вихри и отскоки от батутов.
// dot(x, y, step) вызывается для каждой точки; возвращается то, во что пуф врежется
function traceAim(px, py, r, dot) {
  let x = SLING_X + px;
  let y = SLING_Y + py;
  let vx = -px * LAUNCH_POWER;
  let vy = -py * LAUNCH_POWER;
  let portalCd = 0;
  let bounceCd = 0;
  let bounces = 0;
  let hit = null;
  for (let step = 1; step <= 240; step++) {
    // Точно те же формулы, что и в физике Matter.js
    vx *= 0.99;
    vy = vy * 0.99 + 0.2778;
    if (wells.length && wellAccel(x, y)) {
      vx += wellA.x;
      vy += wellA.y;
    }
    x += vx;
    y += vy;
    if (portalCd > 0) portalCd--;
    else if (portals.length) {
      const to = portalExit(x, y);
      if (to) {
        x = to.x;
        y = to.y;
        portalCd = 24;
      }
    }
    if (y > GROUND_Y) break;
    if (bounceCd > 0) bounceCd--;
    hit = aimContact(x, y, r);
    if (hit && hit.label === 'jelly') {
      if (bounceCd === 0 && bounces < 3) {
        const c = Math.cos(hit.angle);
        const s = Math.sin(hit.angle);
        const dx = x - hit.position.x;
        const dy = y - hit.position.y;
        let lvx = vx * c + vy * s;
        let lvy = vy * c - vx * s;
        if (hit.w / 2 - Math.abs(dx * c + dy * s) < hit.h / 2 - Math.abs(dy * c - dx * s)) lvx = -lvx;
        else lvy = -lvy;
        vx = lvx * c - lvy * s;
        vy = lvx * s + lvy * c;
        bounces++;
        bounceCd = 6;
      }
      hit = null;
    }
    if (hit) return { hit, x, y };
    dot(x, y, step);
  }
  return { hit: null, x, y };
}

function drawAim() {
  if (!pull || !slingHero) return;
  if (Math.hypot(pull.x, pull.y) < 18) return;
  const shimmer = Math.floor((time * 18) % 3);
  const scale = clamp(1 / cam.zoom, 1, 2);
  ctx.lineWidth = 1.6 / cam.zoom;
  ctx.strokeStyle = 'rgba(26,8,56,0.65)';
  ctx.fillStyle = '#ffffff';
  const { hit, x, y } = traceAim(pull.x, pull.y, slingHero.r, (dx, dy, step) => {
    if ((step + shimmer) % 3 === 0) {
      const k = clamp(1 - step / 110, 0, 1);
      ctx.globalAlpha = 0.55 + k * 0.45;
      ctx.beginPath();
      ctx.arc(dx, dy, (2.4 + k * 3.4) * scale, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  // Шарики на пути пуфа обведены: видно, что они лопнут
  if (Balloons.list.length) {
    Balloons.crossed(pull.x, pull.y, slingHero.r);
    if (scene3d) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 / clamp(cam.zoom, 0.5, 1.2);
      ctx.setLineDash([7, 6]);
      Balloons.marked.forEach((bl) => {
        ctx.beginPath();
        ctx.arc(Balloons.cx(bl) + Balloons.sway(bl, time), Balloons.cy(bl), BALLOON_R + 10 + Math.sin(time * 9) * 2, 0, TAU);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
  }
  // Метка попадания: сразу видно, что выстрел придётся в бота
  if (hit && hit.label === 'bot') {
    const pulse = 0.5 + 0.5 * Math.sin(time * 10);
    const R = hit.circleRadius + 8 + pulse * 5;
    ctx.strokeStyle = '#1a0838';
    ctx.lineWidth = 7 / clamp(cam.zoom, 0.5, 1.2);
    ctx.beginPath();
    ctx.arc(hit.position.x, hit.position.y, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#7cff5c';
    ctx.lineWidth = 4 / clamp(cam.zoom, 0.5, 1.2);
    ctx.stroke();
  } else if (hit) {
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = '#1a0838';
    ctx.lineWidth = 2 / cam.zoom;
    ctx.beginPath();
    ctx.arc(x, y, 6 * scale, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

function heroLook(h) {
  const v = Body.getVelocity(h);
  const sp = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / sp, y: v.y / sp, sp };
}

function drawFlyingHero(h) {
  drawFlyingBody(h);
  drawHeroHint(h);
}

function drawFlyingBody(h) {
  const look = heroLook(h);
  const idleBlink = (time * 1000 + h.id * 733) % 2900 < 110;
  const o = {
    time,
    lookX: look.x,
    lookY: look.y,
    blink: h.hasHit && idleBlink,
    mood: h.hurtT > 0 ? 'hurt' : h.hasHit ? 'angry' : 'scream',
    rot: h.drillT > 0 ? Math.atan2(look.y, look.x) + Math.PI / 2 : h.hasHit ? h.angle : 0,
    stretch: h.hasHit || h.drillT > 0 ? 0 : Math.min(0.26, look.sp / 95),
    stretchAngle: Math.atan2(look.y, look.x),
    squish: h.squish,
    fuse: h.fuse > 0
  };
  drawHero(ctx, h.heroType, h.position.x, h.position.y, h.circleRadius, o);
}

// Кольцо-подсказка: способность ещё доступна
function drawHeroHint(h) {
  if (h === primary && abilityReady(h)) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    const R = h.circleRadius + 9 + pulse * 7;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.45 + pulse * 0.45;
    ctx.lineWidth = 3 / clamp(cam.zoom, 0.6, 1.2);
    ctx.beginPath();
    ctx.arc(h.position.x, h.position.y, R, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (tapPrompt > 0) {
      const size = (30 + pulse * 6) / cam.zoom;
      ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a0838';
      ctx.lineWidth = size * 0.26;
      ctx.strokeText(t('tapNow'), h.position.x, h.position.y - h.circleRadius - size);
      ctx.fillStyle = '#ffe14d';
      ctx.fillText(t('tapNow'), h.position.x, h.position.y - h.circleRadius - size);
      if (HAND_PATH) {
        const hs = clamp(1 / cam.zoom, 1, 2.1) * (1 - pulse * 0.12);
        ctx.save();
        ctx.translate(h.position.x + h.circleRadius * 0.6, h.position.y + h.circleRadius + 26 * hs);
        ctx.scale(hs, hs);
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1a0838';
        ctx.stroke(HAND_PATH);
        ctx.fillStyle = '#ffffff';
        ctx.fill(HAND_PATH);
        ctx.restore();
      }
    }
  }
}

function drawSlingHero() {
  const s = slingHero;
  if (!s) return;
  let x = s.x;
  let y = s.y;
  let look = { x: 0.9, y: -0.1 };
  if (s.hop < 1) {
    // Прыжок из очереди на рогатку
    const k = s.hop;
    x = lerp(s.fromX, SLING_X, k);
    y = lerp(s.fromY, SLING_Y, k) - Math.sin(k * Math.PI) * 90;
  } else if (pull) {
    x += pull.x;
    y += pull.y;
    const len = Math.hypot(pull.x, pull.y) || 1;
    look = { x: -pull.x / len, y: -pull.y / len };
  }
  const tension = pull ? Math.hypot(pull.x, pull.y) / MAX_PULL : 0;
  if (tension > 0.92) {
    x += Math.sin(time * 70) * 0.8;
    y += Math.cos(time * 63) * 0.8;
  }
  const breath = Math.sin(time * 3) * 0.018;
  const blink = (time * 1000) % 2600 < 110;
  drawHero(ctx, s.type, x, y, s.r, {
    time, lookX: look.x, lookY: look.y, blink: blink && !pull, mood: 'angry', squish: s.squish + breath + tension * 0.07
  });
}

function drawQueue() {
  const n = queueView.length;
  for (let i = n - 1; i >= 0; i--) {
    const q = queueView[i];
    const targetX = queueX(i);
    q.x += (targetX - q.x) * 0.16;
    const r = HEROES[q.type].r;
    const hop = cheerT > 0 ? Math.abs(Math.sin(time * 11 + i)) * 15 : Math.abs(Math.sin(time * 2.2 + i * 1.3)) * 2.6;
    const blink = (time * 1000 + i * 941) % 3300 < 120;
    drawHero(ctx, q.type, q.x, GROUND_Y - r - hop - 2, r, {
      time, lookX: 0.8, lookY: -0.1, blink, mood: cheerT > 0 ? 'happy' : 'angry', squish: hop > 8 ? -0.05 : 0
    });
  }
}

function drawTutorialHand() {
  // Подсказка повторяется, если игрок долго не стреляет
  const idleHint = phase === 'aim' && aimIdle > 5;
  if ((!showTutorial && !idleHint) || phase === 'over' || phase === 'attract' || pull) return;
  const cycle = (time % 2.2) / 2.2;
  const k = cycle < 0.15 ? 0 : cycle < 0.7 ? (cycle - 0.15) / 0.55 : 1;
  const ease = k * k * (3 - 2 * k);
  const dx = -92 * ease;
  const dy = 52 * ease;
  const scale = clamp(1 / cam.zoom, 1, 2.1);
  const hx = SLING_X + dx;
  const hy = SLING_Y + dy;

  // Траектория-намёк
  ctx.globalAlpha = 0.85 * ease;
  ctx.fillStyle = '#ffffff';
  let x = SLING_X;
  let y = SLING_Y;
  let vx = 92 * LAUNCH_POWER * 1.15;
  let vy = -52 * LAUNCH_POWER * 1.15;
  for (let i = 1; i < 34; i++) {
    vx *= 0.99;
    vy = vy * 0.99 + 0.2778;
    x += vx;
    y += vy;
    if (i % 3 === 0 && y < GROUND_Y) {
      ctx.beginPath();
      ctx.arc(x, y, (5 - i * 0.09) * scale * 0.8, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = cycle > 0.86 ? (1 - cycle) / 0.14 : 1;

  if (HAND_PATH) {
    ctx.save();
    ctx.translate(hx + 6 * scale, hy + 24 * scale);
    ctx.scale(scale * 1.25, scale * 1.25);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1a0838';
    ctx.stroke(HAND_PATH);
    ctx.fillStyle = '#ffffff';
    ctx.fill(HAND_PATH);
    ctx.restore();
  }

  if (!showTutorial) return;
  const size = 25 / cam.zoom;
  ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a0838';
  ctx.lineWidth = size * 0.26;
  const tx = clamp(SLING_X + 20, bounds.left + (size * 6.5), bounds.right - size * 6.5);
  const ty = SLING_Y - 92 - 24 / cam.zoom;
  ctx.globalAlpha = 1;
  ctx.strokeText(t('tutorial'), tx, ty);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText(t('tutorial'), tx, ty);
}

function render(dt) {
  if (!viewReady) return;
  const zoom = cam.zoom * (1 + cam.punch);
  const trauma = cam.trauma * cam.trauma;
  const sx = trauma * 20 * Math.sin(time * 61);
  const sy = trauma * 20 * Math.sin(time * 73 + 1.3);
  const tilt = trauma * 0.02 * Math.sin(time * 47);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gy = (GROUND_Y - cam.y) * zoom + vh / 2 + sy;
  if (scene3d) {
    try {
      scene3d.draw({ x: cam.x, y: cam.y, zoom, sx, sy, tilt, vw, vh, dpr, quality, dt, time });
    } catch (e) {
      disable3D(e && e.message);
      return;
    }
    ctx.clearRect(0, 0, vw, vh);
    const ox3 = vw / 2 + sx;
    const oy3 = vh / 2 + sy;
    const cos3 = Math.cos(tilt) * zoom;
    const sin3 = Math.sin(tilt) * zoom;
    ctx.setTransform(dpr * cos3, dpr * sin3, -dpr * sin3, dpr * cos3, dpr * (ox3 - cos3 * cam.x + sin3 * cam.y), dpr * (oy3 - sin3 * cam.x - cos3 * cam.y));
    flying.forEach(drawHeroHint);
    bots.forEach((b) => {
      if (b.isBoss) drawBossBar(ctx, b, cam.zoom);
    });
    drawAim();
    FX.drawTexts(ctx, zoom);
    drawTutorialHand();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Background.drawAmbient(ctx, vw, vh, gy, dt, time, UI.pausesSim(), quality);
    return;
  }
  Background.drawSky(ctx, vw, vh, Math.round(gy / 6) * 6, cam.x, zoom, time, quality);

  const layerK = lerp(zoom, 1, 0.5);
  Background.drawLayer(ctx, Background.far, 0.14, cam.x + sx * 0.3, layerK * 0.92, gy, vw);
  Background.drawLayer(ctx, Background.mid, 0.36, cam.x + sx * 0.6, layerK, gy, vw);

  // Мир: масштаб камеры, тряска и лёгкий наклон
  const ox = vw / 2 + sx;
  const oy = vh / 2 + sy;
  const cos = Math.cos(tilt) * zoom;
  const sin = Math.sin(tilt) * zoom;
  ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * (ox - cos * cam.x + sin * cam.y), dpr * (oy - sin * cam.x - cos * cam.y));

  const pad = 40 / zoom + 30;
  const viewL = cam.x - vw / 2 / zoom - pad;
  const viewR = cam.x + vw / 2 / zoom + pad;
  const viewB = cam.y + vh / 2 / zoom + pad;
  const overlap = 1.5 / zoom;
  Background.drawGround(ctx, viewL, viewR, viewB, overlap);
  FX.drawDecals(ctx);

  // Рогатка: задняя стойка
  stamp(ctx, slingSprite(false), SLING_X, SLING_Y);
  const pouch = pouchPos();
  drawBand(SLING_TIP_BACK, pouch);
  drawQueue();

  wells.forEach((w) => drawWell(ctx, w, time));
  portals.forEach((p) => {
    drawPortal(ctx, p.a.x, p.a.y, time, '#29f3ff', 1);
    drawPortal(ctx, p.b.x, p.b.y, time, '#ff9a1f', -1);
  });
  rocks.forEach((q) => drawRock(ctx, q, cfg.biome, time));
  Balloons.draw2D(ctx, time);
  blocks.forEach((b) => drawBlock(ctx, b, time));
  orbs.forEach((o) => drawOrb(ctx, o, time));
  bots.forEach((b) => drawBot(ctx, b, time));
  gems.forEach((g) => {
    if (!g.taken) drawGem(ctx, g, time);
  });
  bots.forEach((b) => {
    if (b.isBoss) drawBossBar(ctx, b, cam.zoom);
  });

  flying.forEach(drawTrail);
  flying.forEach(drawFlyingHero);
  drawSlingHero();

  // Рогатка: передняя стойка и прицел поверх героя
  drawBand(SLING_TIP_FRONT, pouch, slingHero && slingHero.hop >= 1 ? slingHero.r : 0);
  stamp(ctx, slingSprite(true), SLING_X, SLING_Y);
  drawAim();

  FX.drawNormal(ctx);
  FX.drawGlow(ctx);
  Background.drawFrontGrass(ctx, viewL, viewR, overlap);
  FX.drawTexts(ctx, zoom);
  drawTutorialHand();

  // Экранные слои
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  Background.drawAmbient(ctx, vw, vh, gy, dt, time, UI.pausesSim(), quality);
}

// =====================================================
// ГЛАВНЫЙ ЦИКЛ (независимо от частоты экрана: 60, 90, 120 Гц)
// =====================================================
function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (!viewReady) {
    resize();
    Platform.markFirstFrame();
    return;
  }
  let ms = now - lastNow;
  lastNow = now;
  if (ms > 100 || ms < 0) ms = 100;
  if (Math.abs(ms - STEP_MS) < 3) ms = STEP_MS;

  const dt = ms / 1000;
  if (!UI.pausesSim()) {
    accum += ms;
    let steps = 0;
    while (accum >= STEP_MS && steps < 5) {
      accum -= STEP_MS;
      steps++;
      if (hitStopMs > 0) hitStopMs -= STEP_MS;
      else stepSim();
    }
    if (steps === 5) accum = 0;
    updateVisuals(dt);
  }
  Music.tick();
  render(dt);
  Platform.markFirstFrame();
}

function startLoop() {
  if (rafId) return;
  lastNow = performance.now();
  accum = 0;
  rafId = requestAnimationFrame(frame);
}

// Системная пауза YouTube: останавливается абсолютно всё — цикл, звук, ввод, анимации интерфейса
function systemPause() {
  if (sysPaused) return;
  sysPaused = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  drag = null;
  if (phase === 'aim') pull = kbAim ? pull : null;
  Sound.pause();
  document.body.classList.add('sys-paused');
  Platform.flushSave();
}

function systemResume() {
  if (!sysPaused) return;
  sysPaused = false;
  document.body.classList.remove('sys-paused');
  Sound.resume();
  startLoop();
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
