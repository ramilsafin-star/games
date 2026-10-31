// Короткие задания используют те же координаты, физику и кнопки, что и прогулка.
function missionHint(text, brake = false) {
  const label = $("mission-hint");
  if (label.textContent !== text) label.textContent = text;
  label.hidden = !text;
  $("btn-brake").hidden = !brake;
}

function garageMission() {
  const city = save.world === 0, farm = save.world === 1 && save.car === "tractor";
  const button = $("btn-mission");
  button.hidden = !city && !farm;
  button.textContent = city
    ? save.car === "police" ? "🚓 На дежурство" : "🚦 Правила города"
    : "🌾 Собрать три тюка";
}

function beginEpisode(mode) {
  Game.demo = mode === "demo";
  Game.farm = mode === "mission" && Game.world === 1 && Game.car.type === "tractor"
    ? { count: 0, bale: null, next: 0.25 } : null;
  Game.city = !Game.demo && Game.world === 0 ? {
    manual: mode === "mission", signal: driveView.nextSignal(0), phase: "approach",
    lesson: true, brake: false, elapsed: 0, npc: null,
  } : null;
  missionHint(Game.demo ? CARS[Game.car.type].icon + " " + CARS[Game.car.type].power
    : Game.farm ? "🌾   0 / 3   ·   Подъедь к тюку" : "");
}

function bladeExtension(t) {
  // Один взмах: выдвижение, короткая выдержка и возврат.
  return Math.max(0, Math.min(1, t / 0.34, (1 - t) / 0.38));
}

function pushWithBlade(e, ahead, dx) {
  const info = CARS.tractor, t = 1 - Game.active / info.duration;
  if (Game.car.struck || t < 0.12 || t > 0.78 || dx > 47 || ahead <= 0) return false;
  const rear = e.kind === "traffic" ? carSize(e.type).h * 0.015 : e.kind === "bale" ? 0.88 : 0.38;
  const reach = (3.22 + 1.35 * bladeExtension(t) + rear) * 22;
  if (ahead > reach) return false;
  Game.car.struck = true;
  e.kick = 1;
  e.kickX = e.x;
  e.tx = undefined;
  e.pushSide = e.kind === "bale" || e.x >= Game.car.x ? 1 : -1;
  burst(e.x, e.y + rear * 22, "#ffcf65", 12);
  Sound.land();
  Game.shake = Math.max(Game.shake, 0.38);
  return true;
}

function movePushed(e, dt, roadSpeed) {
  e.kick = Math.max(0, e.kick - dt);
  const k = e.kick;
  if (e.kind === "bale") {
    e.y += (roadSpeed - 25) * dt;
    e.x = lerp(e.kickX, e.cart.x, 1 - k * k);
  } else {
    e.y += (roadSpeed - Game.cruise - 480 * k) * dt;
    e.x += e.pushSide * 150 * (0.3 + k) * dt;
  }
  e.alt = Math.sin(k * Math.PI) * (e.kind === "bale" ? 0.75 : 0.32);
  e.drift = e.pushSide * k * 0.28;
  if (e.kind === "bale") e.spin = (1 - k) * 4.2;
  if (k > 0) return;
  e.alt = e.drift = 0;
  if (e.kind === "bale") {
    e.dead = true;
    e.cart.loaded = true;
    if (Game.farm?.bale !== e) return;
    const farm = Game.farm;
    farm.count++;
    farm.bale = null;
    farm.next = 0.8;
    missionHint("🌾   " + farm.count + " / 3");
    Sound.gift();
    if (farm.count === 3) finish();
  } else if (e.kind === "cone") launchCone(e);
  else e.tx = nearestLane(e.x);
}

function episodeAction() {
  const city = Game.city;
  if (!city || Game.paused || Game.finished) return;
  if (city.phase === "approach") city.brake = true;
  if (city.phase === "chase" && city.elapsed >= 1) {
    city.phase = "pullOver";
    city.elapsed = 0;
    missionHint("↗️   Съезжаем к обочине");
  }
}

function startChase(city, playerIsPatrol) {
  city.phase = playerIsPatrol ? "pursue" : "chase";
  city.elapsed = 0;
  if (!playerIsPatrol) {
    city.npc = {kind:"patrolActor", type:"police", x:Game.car.x, y:Game.car.y+380, drift:0, phase:0};
    Game.entities.push(city.npc);
  }
  city.startGap = Game.car.y - city.npc.y;
  Sound.horn("police");
  missionHint(playerIsPatrol ? "🚕   Нарушитель впереди · включи сирену" : "🚓   Патруль догоняет");
  Voice.say(playerIsPatrol ? "Останови жёлтое такси сиреной!" : "Патруль! Приготовься остановиться.");
}

function releaseSignal(city) {
  city.phase = "green";
  city.brake = false;
  city.elapsed = 0;
  missionHint("🟢   Можно ехать");
}

// Расстояние до стоп-линии измеряем от переда машины, как и при отрисовке дороги.
function citySpeed(city, base, dt) {
  const c = Game.car, metres = (Game.distance + CAR_Y - c.y) / 22;
  const gap = (city.signal - 10 - metres) * 22;
  city.elapsed += dt;
  switch (city.phase) {
    case "approach": {
      if (gap > 1000) return base;
      const policeJob = city.manual && !city.lesson && c.type === "police";
      if (policeJob && gap < 650) {
        city.phase = "observe";
        city.npc = {kind:"patrolActor", type:"taxi", x:300, y:c.y - gap + 150, drift:0, phase:0};
        Game.entities.push(city.npc);
        missionHint("🚦   Следи за жёлтым такси");
        return base * 0.5;
      }
      missionHint(city.lesson || !city.manual ? "🚦   Красный · останавливаемся" : "🔴   Нажми тормоз", city.manual);
      if (Game.steered && Game.idle < 7) city.engaged = true;
      const auto = !city.manual || city.lesson || city.brake || !city.engaged || c.air > 0 || Game.leap;
      if (auto && gap <= 10) {
        city.phase = "waiting";
        city.elapsed = 0;
        missionHint("🔴   Ждём зелёный");
        return 0;
      }
      if (!auto && gap <= 0) {
        startChase(city, false);
        return base * 0.48;
      }
      return auto ? Math.min(base, Math.max(65, gap * 1.45), Math.max(0, gap / dt))
        : Math.min(base, 240);
    }
    case "observe": {
      const speed = base * 0.5;
      city.npc.y += (speed - 480) * dt;
      const taxiMetres = metres + (c.y - city.npc.y) / 22;
      if (taxiMetres >= city.signal - 8) startChase(city, true);
      return speed;
    }
    case "waiting":
      if (city.elapsed >= 1.45) releaseSignal(city);
      return 0;
    case "green":
      if (metres > city.signal + 12) {
        city.lesson = false;
        city.engaged = false;
        city.signal = driveView.nextSignal(city.signal + 1);
        city.phase = "approach";
        city.elapsed = 0;
        missionHint("");
      }
      return base;
    case "chase":
    case "pursue": {
      const playerIsPatrol = city.phase === "pursue";
      const other = city.npc;
      other.y = c.y + (playerIsPatrol ? -125 - (city.startGap - 125) * Math.exp(-city.elapsed) : -166 + 546 * Math.exp(-city.elapsed * 0.58));
      const lane = nearestLane(c.x);
      const alongside = lane === LANES[1] ? LANES[0] : LANES[1];
      other.x = lerp(other.x, playerIsPatrol || city.elapsed > 0.8 ? (playerIsPatrol ? 300 : alongside) : c.x,
        1 - Math.exp(-dt * 2.1));
      if (!playerIsPatrol && city.elapsed >= 1)
        missionHint("🚓   Патруль рядом · нажми тормоз", true);
      if ((playerIsPatrol && effect() === "siren") || city.elapsed >= 8) {
        city.phase = "pullOver";
        city.elapsed = 0;
        missionHint("↗️   Остановка у обочины");
      }
      return base * 0.5;
    }
    case "pullOver":
      city.npc.x = lerp(city.npc.x, 480, 1 - Math.exp(-dt * 2.6));
      city.npc.y = lerp(city.npc.y, c.y - 122, 1 - Math.exp(-dt * 3));
      if (city.elapsed >= 2.8) {
        city.npc.dead = true;
        city.npc = null;
        city.manual = false;
        releaseSignal(city);
        Sound.gift();
      }
      return base * 0.35 * Math.max(0, 1 - city.elapsed);
  }
}

function episodeSpeed(dt, base) {
  if (Game.finished) return base;
  if (Game.demo) {
    if (!Game.usedPower && Game.runTime >= 0.7) {
      const fx = CARS[Game.car.type].effect;
      Game.entities.push({kind: "traffic", type: "van", x: Game.car.x + (fx === "scoop" ? 124 : 0),
        y: Game.car.y - (fx === "plow" ? 135 : 380), pace: 0.62, drift: 0, phase: 0});
      if (["wheelie", "harvest", "monster", "vacuum"].includes(fx))
        Game.entities.push({kind:"cone", x:Game.car.x, y:Game.car.y-255, phase:0});
      Game.entities.push({kind: "star", x: 424, y: Game.car.y - 230, phase: 0});
      activatePower();
    }
    return base * 0.62;
  }
  if (Game.city) return citySpeed(Game.city, base, dt);
  const farm = Game.farm;
  if (!farm) return base;
  if (!farm.bale) {
    farm.next -= dt;
    if (farm.next <= 0) {
      const cart = {kind:"hayCart", x:565, y:Game.car.y - 815, phase:0};
      farm.bale = {kind:"bale", x:nearestLane(Game.car.x), y:Game.car.y - 790, phase:0, cart};
      Game.entities.push(cart, farm.bale);
    }
  }
  if (farm.bale?.kick > 0) return base * 0.035;
  if (farm.bale) {
    const gap = Game.car.y - farm.bale.y;
    if (gap < 240) {
      missionHint("🌾   " + farm.count + " / 3   ·   Ударь ковшом");
      return Math.max(0, Math.min(base * 0.36, (gap - 79) * 1.6));
    }
  }
  return base * 0.55;
}
