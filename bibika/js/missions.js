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
      if (fx === "water" || fx === "harvest") {
        const ahead = fx === "water" ? 530 : 310;
        addWorkTarget(Game.car.type, Game.car.x, Game.car.y - ahead);
      } else {
        Game.entities.push({
          kind: "traffic", type: "van", x: Game.car.x + (fx === "scoop" ? 124 : 0),
          y: Game.car.y - (fx === "plow" ? 135 : 380), pace: 0.62, drift: 0, phase: 0,
        });
        if (fx === "steamroll")
          Game.entities.push({kind:"traffic", type:"taxi", x:Game.car.x, y:Game.car.y-1000, pace:0.62, drift:0, phase:1});
        if (["wheelie", "monster", "vacuum"].includes(fx))
          Game.entities.push({kind:"cone", x:Game.car.x, y:Game.car.y-255, phase:0});
        Game.entities.push({kind:"star", x:424, y:Game.car.y-230, phase:0});
      }
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

// Погоня за стрелком: взорвал машину — сзади появляется полиция с сиреной. Догнать она не может:
// подходит почти вплотную, теряет ход и отстаёт, а пока игрок стреляет, пробует снова
const CHASE_MEMORY = 16,
  CHASE_FAR = 62,
  CHASE_CLOSE = 7.5;
function callPolice() {
  if (Game.demo || Game.farm || Game.city?.manual || Game.finished || Game.car.type === "police") return;
  if (Game.chase) {
    Game.chase.memory = CHASE_MEMORY;
    return;
  }
  const c = Game.car,
    car = {kind:"patrolActor", type:"police", x:nearestLane(c.x), y:c.y + CHASE_FAR * 22, drift:0, phase:0};
  Game.entities.push(car);
  Game.chase = {car, phase:"gaining", t:0, gap:CHASE_FAR, memory:CHASE_MEMORY, lane:car.x, tries:0, spin:0};
  Sound.horn("police");
}

function stopPoliceChase() {
  if (Game.chase) Game.chase.car.dead = true;
  Game.chase = null;
  Sound.siren(0);
}

function setChasePhase(chase, phase) {
  chase.phase = phase;
  chase.t = 0;
}

// Мешает ли кто-нибудь ехать на этой полосе рядом с этим местом
function chaseLaneBusy(x, y) {
  return Game.entities.some((e) => (e.kind === "traffic" || e.kind === "rival") && !e.dead && Math.abs(e.x - x) < 62 && Math.abs(e.y - y) < 190);
}

// Полиция теряет ход, а у машины игрока на миг вспыхивают выхлопные трубы
function dropBehind(chase) {
  setChasePhase(chase, "dropped");
  chase.tries++;
  chase.spin = chase.tries % 2 ? 0 : chase.car.x >= Game.car.x ? 1 : -1;
  if (chase.spin) Sound.screech();
  Game.car.flare = 0.7;
  Sound.turbo();
}

function updatePoliceChase(dt) {
  const chase = Game.chase;
  if (!chase) return;
  const c = Game.car,
    car = chase.car,
    lane = nearestLane(c.x);
  chase.memory -= dt;
  c.flare = Math.max(0, (c.flare || 0) - dt);
  if (Game.finished && chase.phase !== "gaveUp") setChasePhase(chase, "gaveUp");
  // На светофоре и в петле полиция ждёт позади: погоня продолжится, когда машина снова поедет.
  // Сдавшаяся полиция уезжает всегда, иначе сирена останется звучать на финише
  if (chase.phase === "gaveUp" || (Game.speedNow > 150 && !Game.loop)) {
    chase.t += dt;
    if (chase.phase === "gaining") {
      chase.gap -= (3.5 + chase.gap * 0.24) * dt;
      chase.lane = lane;
      if (chase.memory <= 0) setChasePhase(chase, "gaveUp");
      else if (chase.gap < CHASE_CLOSE) {
        // Выходит на соседнюю полосу, где свободно; если занято с обеих сторон, отстаёт сразу
        const free = LANES.filter((x) => x !== lane && Math.abs(x - lane) < 130 && !chaseLaneBusy(x, c.y + 60));
        if (!free.length) dropBehind(chase);
        else {
          setChasePhase(chase, "alongside");
          chase.lane = free[Math.floor(Math.random() * free.length)];
        }
      }
    } else if (chase.phase === "alongside") {
      // Сначала перестроение, потом рывок вперёд: бампером в машину игрока не въезжает
      const beside = Math.abs(car.x - chase.lane) < 34;
      // На вертикальном экране соседняя полоса не помещается в кадр: там полицию видно в зеркале
      if (beside) chase.gap = lerp(chase.gap, innerWidth < innerHeight ? 3.6 : 1.4, 1 - Math.exp(-dt * 2.2));
      chase.close = beside ? (chase.close || 0) + dt : 0;
      const steeredIn = beside && Math.abs(c.x - car.x) < 72,
        blocked = chaseLaneBusy(car.x, car.y);
      if (chase.close > 1.9 || steeredIn || blocked || chase.t > 4) {
        chase.close = 0;
        dropBehind(chase);
      }
    } else if (chase.phase === "dropped") {
      chase.gap += (5 + chase.t * 14) * dt;
      if (chase.spin) {
        // Занос: машина крутится на месте и дымит шинами
        const k = Math.min(1, chase.t / 0.95);
        car.spun = chase.spin * TAU * (1 - (1 - k) * (1 - k));
        chase.smoke = (chase.smoke || 0) - dt;
        if (k < 1 && chase.smoke <= 0) {
          chase.smoke = 0.07;
          Game.blasts.push({skid:true, x:car.x, y:car.y});
        }
      }
      if (chase.gap >= CHASE_FAR) {
        chase.spin = 0;
        car.spun = 0;
        setChasePhase(chase, chase.memory > 0 ? "gaining" : "gaveUp");
      }
    } else {
      chase.gap += 30 * dt;
      if (chase.gap > 105) {
        stopPoliceChase();
        return;
      }
    }
  }
  const before = car.x;
  car.x = lerp(car.x, chase.lane, 1 - Math.exp(-dt * 2.6));
  car.y = c.y + chase.gap * 22;
  car.drift = clamp(((car.x - before) / Math.max(dt, 0.001)) * 0.0035, -0.2, 0.2) + (car.spun || 0);
  // Чем ближе полиция, тем громче сирена; вплотную она сбивается на частый вой
  const near = clamp(1 - chase.gap / 90, 0, 1);
  Sound.siren(chase.phase === "gaveUp" ? near * near * 0.08 : 0.03 + near * near * 0.09, chase.gap < 14);
}
