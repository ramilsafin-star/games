// Способности, для которых важна цель или видимое движение отдельного предмета.
function closestInFront(kind, reach, width = Infinity) {
  const c = Game.car;
  let nearest = null;
  for (const e of Game.entities) {
    const ahead = c.y - e.y;
    if (e.kind === kind && !e.dead && !e.spent && ahead >= 0 && ahead <= reach &&
        Math.abs(e.x - c.x) <= width && (!nearest || nearest.y < e.y)) nearest = e;
  }
  return nearest;
}

function startVehiclePower(c, fx) {
  if (fx === "hook" || fx === "beam") {
    const target = (fx === "hook" && closestInFront("traffic", 1400)) || closestInFront("star", 1400);
    if (!target) return false;
    target.tether = fx;
    Game.hooks.push({target, tx:target.x, ty:target.y, life:1.35, beam:fx === "beam"});
  } else if (fx === "draft") {
    const lead = closestInFront("traffic", 1100, 75) || closestInFront("rival", 1100, 75);
    if (!lead) return false;
    giveWay(lead);
    c.boost = 2.2;
    addRing(c.x, c.y, "#9debf3", 160);
  } else if (fx === "whistle") {
    Sound.horn("train");
    Game.entities.push({kind:"wagon", x:c.x, y:c.y+100, phase:0});
  } else if (fx === "carpet") {
    c.carpetX = nearestLane(c.x);
    for (let i=0; i<4; i++) addStar(Game.distance + 260 + i*160, c.carpetX);
  } else if (fx === "tip") {
    for (let i=0; i<3; i++)
      addStar(Game.distance - 18, c.x + (i-1)*26, {pour:0.9+i*0.13, pourTotal:0.9+i*0.13});
  } else if (fx === "wave") {
    addRing(c.x, c.y, "#62e5ef", 440);
    Sound.splash();
  } else if (fx === "steamroll") {
    addRing(c.x, c.y, "#ffe07a", 200);
    if (!Game.demo && !Game.city?.manual) addRollTargets(c);
  }
  return true;
}

// Каток едет всё быстрее: сперва тяжело, потом разгоняется, а в конце мягко сбрасывает ход
const ROLL_BOOST = 0.7,
  ROLL_RAMP = 1.6;
function rollFactor() {
  const passed = CARS.roller.duration - Game.active;
  return 1 + ROLL_BOOST * Math.min(1, passed / ROLL_RAMP) * Math.min(1, Game.active / 0.5);
}

// Впереди на своей полосе всегда есть кого раскатать. Цели едут медленно,
// чтобы каток догнал их за время суперсилы, даже если постоял на красном
function addRollTargets(c) {
  const x = nearestLane(c.x);
  [900, 1550, 2250].forEach((ahead, i) => {
    if (!Game.trafficBag.length) Game.trafficBag = shuffled(Object.keys(CARS));
    Game.entities.push({kind:"traffic", type:Game.trafficBag.pop(), x, y:c.y - ahead, pace:0.85, size:34, phase:i, drift:0, gift:i === 0});
  });
}

// Машина сплющивается в блин, а блин кувыркается на обочину и оставляет звезду
function crush(e) {
  const c = Game.car;
  e.squash = 0.001;
  e.tx = undefined;
  e.tether = null;
  e.drift = 0;
  e.alt = 0;
  e.spin = 0;
  e.valt = 8;
  e.vx = (e.x >= c.x + 1 ? 1 : e.x <= c.x - 1 ? -1 : Math.random() < 0.5 ? -1 : 1) * (320 + Math.random() * 120);
  e.spinRate = Math.sign(e.vx) * (7 + Math.random() * 3);
  burst(e.x, e.y, e.kind === "traffic" ? CARS[e.type].color : "#f88939", 16);
  burst(e.x, e.y, "#fff4b0", 10);
  addRing(e.x, e.y, "#fff4b0", 150);
  Game.shake = Math.max(Game.shake, 0.85);
  Sound.crush();
  // Из трёх поданных катку машин звезду оставляет только первая: иначе поездка слишком быстро кончается
  if (e.kind === "traffic" && e.gift !== false)
    Game.entities.push({kind:"star", x:e.x, y:e.y - 30, size:17, phase:Math.random() * TAU});
}

function updateCrushed(e, dt, roadSpeed) {
  e.squash += dt;
  // Сначала блин лежит под вальцом, потом подпрыгивает и летит вровень с катком:
  // отстанет к камере — закроет собой весь экран
  if (e.squash < 0.09) {
    e.y += roadSpeed * dt;
    return;
  }
  e.y += Game.car.y - 40 > e.y ? roadSpeed * 0.5 * dt : 0;
  e.x += e.vx * dt;
  e.alt = Math.max(0, e.alt + e.valt * dt);
  e.valt -= 15 * dt;
  e.spin += e.spinRate * dt;
  if (e.alt === 0 && e.valt < 0) {
    e.dead = true;
    burst(e.x, e.y, "#fff4b0", 10);
    Sound.pop();
  }
}

function updateTether(e, dt) {
  const c = Game.car;
  if (e.kind === "star") {
    e.x = lerp(e.x, c.x, 1 - Math.exp(-dt * 5));
    e.y = lerp(e.y, c.y, 1 - Math.exp(-dt * 4));
    e.alt = e.tether === "beam" ? Math.min(2.5, (e.alt || 0) + dt * 3) : 0;
    if (Math.abs(e.y-c.y) < 18 && Math.abs(e.x-c.x) < 18) collect(e);
  } else {
    e.x = lerp(e.x, 494, 1 - Math.exp(-dt * 3));
    e.y = lerp(e.y, c.y - 100, 1 - Math.exp(-dt * 3));
    e.drift = -0.24;
    if (e.x > 483) {
      e.tether = null;
      e.pace = 0.15;
      e.drift = 0;
      addStar(Game.distance + 165, c.x);
    }
  }
}

function updateWagon(e, dt, fx) {
  const c = Game.car;
  if (fx === "whistle") {
    e.x = lerp(e.x, c.x, 1 - Math.exp(-dt * 2.8));
    e.y = c.y + 104;
    e.drift = (e.x - c.x) * 0.003;
  } else {
    e.y += Game.speedNow * dt;
  }
}

function addWorkTarget(type, x, y) {
  if (type === "fire") {
    Game.entities.push({kind:"brazier", x, y, heat:1, phase:0});
  } else {
    for (let i = 0; i < 3; i++)
      Game.entities.push({kind:"crop", x, y:y - i * 75, phase:i});
  }
}

function updateWorkTarget(e, dt, fx, ahead, dx, airborne) {
  if (Game.finished || e.spent) return;
  if (e.kind === "brazier") {
    if (e !== Game.waterTarget) return;
    e.heat = Math.max(0, e.heat - dt * 1.35);
    if (e.heat > 0) return;
    Sound.splash();
    burst(e.x, e.y, "#c1ecf4", 18);
  } else {
    if (fx !== "harvest" || airborne || dx > 66 || ahead < 20 || ahead > 112) return;
    burst(e.x, e.y, "#eabc54", 9);
    Sound.tap();
  }
  finishWorkTarget(e);
}

function finishWorkTarget(e) {
  e.spent = true;
  Game.entities.push({kind:"star", x:e.x, y:e.y - 45, phase:e.phase});
}

// Снаряд пожарной гасит огонь, снаряд комбайна срезает колосья
function shootWorkTarget(e) {
  if (e.kind === "brazier") {
    e.heat = Math.max(0, e.heat - 0.5);
    burst(e.x, e.y, "#c1ecf4", 8);
    if (e.heat > 0) return;
    Sound.splash();
  } else {
    burst(e.x, e.y, "#eabc54", 9);
    Sound.tap();
  }
  finishWorkTarget(e);
}
