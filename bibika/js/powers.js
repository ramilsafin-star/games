// Способности, для которых важна цель или видимое движение отдельного предмета.
function closestInFront(kind, reach, width = Infinity) {
  const c = Game.car;
  let nearest = null;
  for (const e of Game.entities) {
    const ahead = c.y - e.y;
    if (e.kind === kind && !e.dead && ahead >= 0 && ahead <= reach &&
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
  }
  return true;
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
