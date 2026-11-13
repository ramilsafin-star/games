// Поведение роботов ГОРНа, бойцов отряда и инженера. Без графики.
// Роботы: патруль или пост → настороженность (услышал) → бой (видит цель) → поиск.
// В бою «Стрелки» уходят в укрытия и заходят с фланга, «Бастион» прёт щитом вперёд,
// «Оса» перелетает между точками и бьёт заряженным лучом, «Колобок» катится и взрывается,
// «Молот» поливает очередями и пускает ракеты. Бойцы идут за игроком и держат позицию по команде.
import { MATE } from "./data.js?v=7c816b4c";
import { clamp, wrap, turnTo, yawTo, DEG, TAU, lerp } from "./util.js?v=7c816b4c";

const FOV = 2.1; // поле зрения робота без тревоги (рад)
const FOV_COMBAT = 3.6;

// ---------- Восприятие ----------
function candidates(g) {
  const list = [];
  if (g.player.alive) list.push(g.player);
  for (const a of g.agents) {
    if (!a.alive) continue;
    if (a.team === "squad") list.push(a);
    if (a.team === "vip" && a.state === "follow" && !a.down) list.push(a);
  }
  return list;
}
function chest(g, c) {
  return c.isPlayer ? g.eye(c) - 0.35 : c.y + c.h * 0.7;
}
function canSee(g, a, c, fov, range) {
  const dx = c.x - a.x, dz = c.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (fov < TAU && d > 1.5) {
    const ang = Math.abs(wrap(yawTo(a.x, a.z, c.x, c.z) - a.yaw));
    if (ang > fov / 2) return false;
  }
  const ey = a.fly ? a.y : a.y + a.h * 0.88;
  const cy = chest(g, c);
  if (!g.world.sees(a.x, ey, a.z, c.x, cy, c.z, "sight")) {
    // голова над укрытием тоже видна
    if (!c.isPlayer || !g.world.sees(a.x, ey, a.z, c.x, g.eye(c), c.z, "sight")) return false;
  }
  if (g.smokes.length && g.smoked(a.x, ey, a.z, c.x, cy, c.z)) return false;
  return true;
}
function perceive(g, a, step) {
  const d = a.def;
  const inCombat = a.state === "combat";
  const fov = d.camera ? 1.15 : d.fly ? TAU : inCombat ? FOV_COMBAT : FOV;
  let best = null, bs = Infinity;
  for (const c of candidates(g)) {
    let range = d.sight * g.sightK;
    if (c.isPlayer && !inCombat) {
      if (c.crouch > 0.5) range *= 0.68;
      if (c.walk) range *= 0.85;
    }
    if (!canSee(g, a, c, fov, range)) continue;
    const dist = Math.hypot(c.x - a.x, c.z - a.z);
    const score = dist * (c.isPlayer ? 0.85 : c.team === "vip" ? 1.7 : 1);
    if (score < bs) {
      bs = score;
      best = c;
    }
  }
  a.visible = null;
  if (!inCombat) {
    if (best) {
      const dist = Math.hypot(best.x - a.x, best.z - a.z);
      const sight = d.sight * g.sightK;
      let rate = (g.mission.stealth ? 0.9 : 2.6) * (0.55 + 1.7 * (1 - dist / sight));
      if (a.state === "alert") rate *= 1.8;
      if (d.camera) rate *= 1.25;
      a.aware += rate * step;
      a.seen = best;
      if (a.aware >= 1) enterCombat(g, a, best);
    } else {
      a.aware = Math.max(a.state === "alert" ? 0.4 : 0, a.aware - 0.3 * step);
      a.seen = null;
    }
    return;
  }
  if (best) {
    if (a.target !== best && (!a.target || !a.target.alive || bs < Math.hypot(a.target.x - a.x, a.target.z - a.z) * 0.7)) {
      a.target = best;
      a.seeT = Math.min(a.seeT, 0.2);
    }
    if (best === a.target) {
      a.visible = best;
      a.seeT += step;
      a.lostT = 0;
      a.lastSeen = { x: best.x, y: best.y, z: best.z, t: g.t };
    }
  } else {
    a.seeT = Math.max(0, a.seeT - step * 0.5);
  }
}
function enterCombat(g, a, target) {
  a.state = "combat";
  a.aware = 1;
  a.target = target;
  a.seeT = 0;
  a.lastSeen = { x: target.x, y: target.y, z: target.z, t: g.t };
  a.path = null;
  a.decideT = 0.2;
  g.emit("spotted", { id: a.id, camera: !!a.def.camera });
  if (g.mission.stealth && !g.alarm && !a.alarmT) a.alarmT = a.def.camera ? 0.05 : 1.7;
  // остальные рядом тоже узнают
  if (!g.mission.stealth || g.alarm)
    for (const b of g.agents) {
      if (b === a || !b.alive || b.team !== "robot" || b.state === "combat" || b.def.camera || b.def.dummy) continue;
      if (Math.hypot(b.x - a.x, b.z - a.z) < 14) {
        b.state = "alert";
        b.alertAt = { x: target.x, y: target.y, z: target.z };
        b.alertT = 8;
        b.path = null;
      }
    }
}
export function alertAll(g) {
  const p = g.player;
  for (const a of g.agents) {
    if (!a.alive || a.team !== "robot" || a.def.camera || a.def.dummy) continue;
    if (a.state !== "combat") {
      a.state = "combat";
      a.aware = 1;
      a.target = p;
      a.seeT = 0;
    }
    a.lastSeen = { x: p.x + (g.rand() - 0.5) * 6, y: p.y, z: p.z + (g.rand() - 0.5) * 6, t: g.t };
    a.path = null;
  }
}

// ---------- Робот ----------
export function thinkRobot(g, a, dt) {
  const d = a.def;
  a.flash = Math.max(0, a.flash - dt * 5);
  a.goalSpeed = 1;
  if (d.dummy) return;
  if (a.stunT > 0) {
    a.stunT -= dt;
    a.goal = null;
    a.chargeT = 0;
    if (a.def.boss) a.vent = Math.max(a.vent, 0.5);
    return;
  }
  a.thinkT -= dt;
  if (a.thinkT <= 0) {
    a.thinkT = 0.14 + g.rand() * 0.1;
    perceive(g, a, 0.19);
  }
  // знают, где игрок: волны «на охоту», после тревоги
  if (a.state === "combat" && a.hunt && !a.visible && (!a.lastSeen || g.t - a.lastSeen.t > 3.5) && g.player.alive) {
    const p = g.player;
    a.lastSeen = { x: p.x + (g.rand() - 0.5) * 4, y: p.y, z: p.z + (g.rand() - 0.5) * 4, t: g.t };
    a.path = null;
  }
  if (d.boss) return thinkBoss(g, a, dt);
  if (d.camera) return thinkCamera(g, a, dt);
  if (d.fly) return thinkOsa(g, a, dt);
  if (a.type === "kolobok") return thinkRoller(g, a, dt);
  return thinkShooter(g, a, dt);
}

// пост или патруль
function calm(g, a, dt) {
  const d = a.def;
  a.goalSpeed = 0.5;
  if (a.state === "alert") {
    a.alertT -= dt;
    if (a.alertAt) {
      a.goal = { x: a.alertAt.x, y: a.alertAt.y, z: a.alertAt.z };
      a.goalSpeed = 0.75;
      if (Math.hypot(a.x - a.alertAt.x, a.z - a.alertAt.z) < 1.6 || a.noPath) {
        a.alertAt = null;
        a.goal = null;
      }
    } else {
      a.goal = null;
      a.lookT -= dt;
      if (a.lookT <= 0) {
        a.lookT = 1 + g.rand() * 1.5;
        a.wantYaw = a.yaw + (g.rand() - 0.5) * 2.6;
      }
      if (a.wantYaw !== undefined) a.yaw = turnTo(a.yaw, a.wantYaw, d.turn * 0.6 * dt);
    }
    if (a.alertT <= 0) {
      a.state = "idle";
      a.aware = 0.3;
    }
    return;
  }
  if (a.route) {
    const pt = a.route[a.ri];
    if (a.waitT > 0) {
      a.waitT -= dt;
      a.goal = null;
      a.yaw += Math.sin(g.t * 0.9 + a.id) * dt * 0.6;
      return;
    }
    a.goal = { x: pt.x, y: null, z: pt.z };
    if (Math.hypot(a.x - pt.x, a.z - pt.z) < 0.8 || a.noPath) {
      a.ri = (a.ri + 1) % a.route.length;
      a.waitT = g.rand() < 0.4 ? 0.8 + g.rand() * 1.6 : 0;
      a.noPath = false;
    }
  } else {
    // пост: стоит и осматривается
    if (Math.hypot(a.x - a.homeX, a.z - a.homeZ) > 1.5) a.goal = { x: a.homeX, y: null, z: a.homeZ };
    else {
      a.goal = null;
      a.yaw = turnTo(a.yaw, a.guardYaw + Math.sin(g.t * 0.5 + a.id) * 0.7, d.turn * 0.4 * dt);
    }
  }
}
function lostTarget(g, a, dt) {
  a.lostT = (a.lostT || 0) + dt;
  const ls = a.lastSeen;
  if (!ls) {
    a.state = "alert";
    a.alertT = 6;
    return;
  }
  // заряд или точка удержания важнее
  a.goal = { x: ls.x, y: ls.y, z: ls.z };
  a.goalSpeed = 0.95;
  const there = Math.hypot(a.x - ls.x, a.z - ls.z) < 2 || a.noPath;
  if (there) {
    a.searchT = (a.searchT || 0) + dt;
    if (a.searchT > 1.2) {
      const c = g.world.randomNear(ls.x, ls.z, ls.y, 7, g.rand);
      a.lastSeen = { x: c[0], y: c[2], z: c[1], t: ls.t };
      a.searchT = 0;
      a.noPath = false;
    }
  }
  if (g.t - ls.t > 16 && !a.hunt && !g.alarm) {
    a.state = "alert";
    a.alertT = 6;
    a.alertAt = null;
  }
}
function targetGone(a) {
  return !a.target || !a.target.alive || (a.target.team === "vip" && a.target.down);
}
function thinkShooter(g, a, dt) {
  const d = a.def;
  if (a.state !== "combat") return calm(g, a, dt);
  if (targetGone(a)) {
    a.target = g.player.alive ? g.player : null;
    if (!a.target) {
      a.goal = null;
      return;
    }
  }
  const t = a.target;
  const dist = Math.hypot(t.x - a.x, t.z - a.z);
  const vis = a.visible === t;
  // защита заряда: часть роботов идёт его снимать
  const ch = g.obj.planted;
  if (ch && a.type !== "molot" && (!vis || a.id % 2 === 0 || dist > 14)) {
    a.goal = { x: ch.x, y: ch.y, z: ch.z };
    a.goalSpeed = 1.05;
    if (vis) aimAndFire(g, a, t, dist, dt);
    return;
  }
  if (vis) {
    aimAndFire(g, a, t, dist, dt);
    a.decideT -= dt;
    if (a.decideT <= 0 || (a.mode === "cover" && a.arrived)) decide(g, a, t, dist);
  } else {
    a.mode = "";
    lostTarget(g, a, dt);
    // зона удержания: волны идут к кругу
    if (g.obj.kind === "hold" && a.hunt && dist > 10) a.goal = { x: g.obj.zone.x + (g.rand() - 0.5) * 3, y: g.player.y, z: g.obj.zone.z + (g.rand() - 0.5) * 3 };
  }
}
function decide(g, a, t, dist) {
  const d = a.def;
  a.decideT = 1.4 + g.rand() * 1.8;
  const r = g.rand();
  a.arrived = false;
  if (a.type === "bastion") {
    a.goal = dist > 3.5 ? { x: t.x, y: t.y, z: t.z } : null;
    a.goalSpeed = 1;
    a.mode = "push";
    return;
  }
  if (a.type === "molot") {
    a.goal = dist > 15 ? { x: t.x, y: t.y, z: t.z } : null;
    a.goalSpeed = 1;
    return;
  }
  const hurt = a.hp < a.maxHp * 0.5;
  if (a.mode === "cover" && a.arrived !== undefined) {
    // из укрытия — выглянуть: шаг к цели
    a.mode = "peek";
    a.goal = { x: lerp(a.x, t.x, 0.25), y: t.y, z: lerp(a.z, t.z, 0.25) };
    a.goalSpeed = 0.8;
    return;
  }
  if ((hurt && r < 0.65) || r < d.cover) {
    const c = g.world.cover(a.x, a.z, a.y, t.x, chest(g, t), t.z, 8, g.rand);
    if (c) {
      a.mode = "cover";
      a.goal = { x: c[0], y: c[2], z: c[1] };
      a.goalSpeed = 1.1;
      a.decideT = 2 + g.rand() * 1.5;
      return;
    }
  }
  if (r < d.cover + d.flank && dist < 30) {
    const side = g.rand() < 0.5 ? -1 : 1;
    const base = yawTo(t.x, t.z, a.x, a.z) + side * (1.1 + g.rand() * 0.6);
    const R = 8 + g.rand() * 5;
    const fx = t.x - Math.sin(base) * R, fz = t.z - Math.cos(base) * R;
    const c = g.world.randomNear(fx, fz, t.y, 2.5, g.rand);
    a.mode = "flank";
    a.goal = { x: c[0], y: c[2], z: c[1] };
    a.goalSpeed = 1.1;
    a.decideT = 3 + g.rand() * 2;
    return;
  }
  if (dist > d.range * 0.85) {
    a.goal = { x: t.x, y: t.y, z: t.z };
    a.goalSpeed = 1;
    a.mode = "advance";
    return;
  }
  // боком
  const side = g.rand() < 0.5 ? -1 : 1;
  const yaw = yawTo(a.x, a.z, t.x, t.z) + side * Math.PI / 2;
  const c = g.world.randomNear(a.x - Math.sin(yaw) * 3, a.z - Math.cos(yaw) * 3, a.y, 1.5, g.rand);
  a.goal = { x: c[0], y: c[2], z: c[1] };
  a.goalSpeed = a.type === "zhuk" ? 0.9 : 0.6;
  a.mode = "strafe";
}
// повернуться к цели и стрелять очередями после реакции
function aimAndFire(g, a, t, dist, dt) {
  const d = a.def;
  const want = yawTo(a.x, a.z, t.x, t.z);
  a.faceT = 0.4;
  a.yaw = turnTo(a.yaw, want, d.turn * dt * (a.mods || 1));
  const err = Math.abs(wrap(want - a.yaw));
  const react = d.react * g.diff.react;
  if (a.seeT < react || dist > d.range * 1.25 || err > 0.3) return;
  const fast = g.mods.has("fast") ? 0.75 : 1;
  if (a.burst > 0) {
    a.fireT -= dt;
    if (a.fireT <= 0) {
      a.fireT += d.gap;
      a.burst--;
      shoot(g, a, t, dist);
      if (a.burst <= 0) a.restT = d.rest * (0.75 + g.rand() * 0.55) * fast;
    }
  } else {
    a.restT -= dt;
    if (a.restT <= 0) {
      a.burst = d.burst;
      a.fireT = a.type === "molot" ? 0.35 : 0;
      if (a.type === "molot") g.emit("spinup", { id: a.id });
    }
  }
  // ракеты «Молота»
  if (d.rocket && !d.boss) {
    a.rocketT -= dt;
    if (a.rocketT <= 0 && dist > 6) {
      a.rocketT = d.rocket.every * (0.8 + g.rand() * 0.4) * fast;
      const lead = Math.min(1.2, dist / d.rocket.speed);
      const tx = t.x + (t.vx || 0) * lead * 0.5, tz = t.z + (t.vz || 0) * lead * 0.5;
      const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
      const sx = a.x + 1.1 * c, sz = a.z - 1.1 * s;
      g.launch(a, tx, t.y + 0.6, tz, d.rocket, sx, a.y + 3, sz);
    }
  }
}
// выстрел робота (или бойца): луч с разбросом в грудь цели
export function shoot(g, a, t, dist) {
  const d = a.def;
  const muzzle = muzzleOf(a);
  const ty = chest(g, t);
  const pellets = d.pellets || 1;
  let accK = a.team === "robot" ? g.diff.acc : 1;
  const moving = Math.hypot(t.vx || 0, t.vz || 0) || t.speedNow || 0;
  accK *= 1 + clamp(moving / 6, 0, 0.8);
  if (t.isPlayer && t.crouch > 0.5) accK *= 1.12;
  if (g.mods.has("fast") && a.team === "robot") accK *= 0.9;
  for (let k = 0; k < pellets; k++) {
    let dx = t.x - muzzle[0], dy = ty - muzzle[1], dz = t.z - muzzle[2];
    const L = Math.hypot(dx, dy, dz);
    dx /= L;
    dy /= L;
    dz /= L;
    const sp = d.acc * accK * DEG * (pellets > 1 ? 1.4 : 1);
    // случайное отклонение в конусе
    const ux = -dz, uz = dx;
    const ul = Math.hypot(ux, uz) || 1;
    const r1 = g.rand.gauss() * sp * 0.6, r2 = g.rand.gauss() * sp * 0.6;
    dx += (ux / ul) * r1;
    dz += (uz / ul) * r1;
    dy += r2;
    const n = Math.hypot(dx, dy, dz);
    dx /= n;
    dy /= n;
    dz /= n;
    fireRay(g, a, muzzle, dx, dy, dz, d.shot * (a.team === "squad" && t.def?.boss ? 0.5 : 1), !!d.charge);
  }
  a.lastShotAt = g.t;
  g.emit("enemyFire", { id: a.id, type: a.type, team: a.team, x: muzzle[0], y: muzzle[1], z: muzzle[2] });
}
export function muzzleOf(a) {
  const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
  if (a.fly) return [a.x - s * 0.5, a.y - 0.05, a.z - c * 0.5];
  const side = a.type === "molot" ? 1.15 : a.type === "mate" ? 0.2 : 0.28;
  const fwd = a.type === "molot" ? 0.9 : 0.55;
  const up = a.type === "molot" ? 2.0 : a.type === "zhuk" ? 0.65 : a.def.boss ? 4.2 : a.h * 0.68;
  return [a.x + side * c - s * fwd, a.y + up, a.z - side * s - c * fwd];
}
function fireRay(g, a, m, dx, dy, dz, dmg, sniper) {
  const W = g.world;
  let from = 0;
  const MAX = 80;
  const enemyTeam = a.team === "robot" ? "friend" : "robot";
  for (let pass = 0; pass < 3; pass++) {
    const wall = W.ray(m[0] + dx * from, m[1] + dy * from, m[2] + dz * from, dx, dy, dz, MAX - from, "bullet");
    const wallT = wall ? wall.t + from : MAX;
    if (enemyTeam === "friend") {
      // игрок: две сферы (грудь и голова), бойцы и инженер — одна
      let best = null;
      const p = g.player;
      if (p.alive) {
        const ey = g.eye(p);
        for (const [cy, r] of [[ey - 0.45, 0.42], [ey - 0.05, 0.24], [p.y + 0.45, 0.32]]) {
          const t = raySphere(m, dx, dy, dz, p.x, cy, p.z, r);
          if (t !== null && t < wallT && (!best || t < best.t)) best = { t, who: p };
        }
      }
      for (const b of g.agents) {
        if (!b.alive || (b.team !== "squad" && b.team !== "vip") || (b.team === "vip" && (b.state === "captive" || b.down))) continue;
        const t = raySphere(m, dx, dy, dz, b.x, b.y + b.h * 0.6, b.z, 0.45);
        if (t !== null && t < wallT && (!best || t < best.t)) best = { t, who: b };
      }
      if (best) {
        g.hurt(best.who, dmg, { fromX: a.x, fromZ: a.z, sniper });
        g.emit("tracer", { team: a.team, type: a.type, x0: m[0], y0: m[1], z0: m[2], x1: m[0] + dx * best.t, y1: m[1] + dy * best.t, z1: m[2] + dz * best.t, hit: best.who.isPlayer ? "player" : "mate" });
        return;
      }
    } else {
      const hit = g.hitAgents(m[0], m[1], m[2], dx, dy, dz, wallT, "robot");
      if (hit) {
        const x = m[0] + dx * hit.t, y = m[1] + dy * hit.t, z = m[2] + dz * hit.t;
        g.emit("tracer", { team: a.team, type: a.type, x0: m[0], y0: m[1], z0: m[2], x1: x, y1: y, z1: z, hit: "robot" });
        if (hit.shield) {
          hit.agent.shield -= dmg * 0.7;
          g.emit("impact", { x, y, z, nx: -dx, ny: -dy, nz: -dz, kind: "shield" });
          if (hit.agent.shield <= 0) hit.agent.shield = 0;
          return;
        }
        let dd = dmg * (hit.core ? hit.agent.def.core : 1 - hit.agent.def.armor * 0.55);
        if (hit.agent.def.boss && !(hit.core && hit.agent.vent > 0)) dd *= 0.35;
        g.emit("impact", { x, y, z, nx: -dx, ny: -dy, nz: -dz, kind: hit.core ? "core" : "robot", robot: hit.agent.id });
        g.damageRobot(hit.agent, dd, { byMate: a.name, core: hit.core, byPlayer: false, by: "mate" });
        return;
      }
    }
    const x = m[0] + dx * wallT, y = m[1] + dy * wallT, z = m[2] + dz * wallT;
    if (wall && wall.box.glass === "break") {
      W.broken.add(wall.box.i);
      g.emit("glass", { box: wall.box.i, x, y, z });
      from = wallT + 0.02;
      continue;
    }
    g.emit("tracer", { team: a.team, type: a.type, x0: m[0], y0: m[1], z0: m[2], x1: x, y1: y, z1: z, hit: wall ? "wall" : "none" });
    if (wall) g.emit("impact", { x, y, z, nx: wall.nx, ny: wall.ny, nz: wall.nz, kind: "wall", enemy: true, skin: wall.box.skin });
    return;
  }
}
function raySphere(o, dx, dy, dz, cx, cy, cz, r) {
  const ux = cx - o[0], uy = cy - o[1], uz = cz - o[2];
  const t = ux * dx + uy * dy + uz * dz;
  if (t < 0) return null;
  const d2 = ux * ux + uy * uy + uz * uz - t * t;
  if (d2 > r * r) return null;
  return t - Math.sqrt(r * r - d2);
}

// камера: качается и поднимает тревогу
function thinkCamera(g, a, dt) {
  a.goal = null;
  if (a.state !== "combat") {
    a.yaw = a.baseYaw + Math.sin(g.t * 0.55 + a.id) * 0.75;
  } else if (a.visible) {
    a.yaw = turnTo(a.yaw, yawTo(a.x, a.z, a.visible.x, a.visible.z), 1.5 * dt);
  } else if (g.t - (a.lastSeen?.t || 0) > 4) {
    a.state = "idle";
    a.aware = 0.5;
  }
  if (a.state === "combat" && !g.mission.stealth && g.t - (a.camNoise || -9) > 3) {
    a.camNoise = g.t;
    if (a.visible) g.noise(a.visible.x, a.visible.y, a.visible.z, 26, null);
  }
}

// «Оса»: висит на точке, заряжает луч и перелетает
function thinkOsa(g, a, dt) {
  const d = a.def;
  if (!a.perch) a.perch = [a.x, a.y, a.z];
  if (a.state !== "combat") {
    a.yaw += dt * 0.35;
    a.goal3 = a.perch;
    if (a.state === "alert" && a.alertAt) {
      a.yaw = turnTo(a.yaw, yawTo(a.x, a.z, a.alertAt.x, a.alertAt.z), d.turn * dt);
    }
    return;
  }
  if (targetGone(a)) a.target = g.player.alive ? g.player : null;
  const t = a.target;
  if (!t) return;
  const atPerch = Math.hypot(a.x - a.perch[0], a.y - a.perch[1], a.z - a.perch[2]) < 0.6;
  a.goal3 = a.perch;
  const vis = a.visible === t;
  if (vis) a.yaw = turnTo(a.yaw, yawTo(a.x, a.z, t.x, t.z), d.turn * dt);
  if (a.chargeT > 0) {
    a.chargeT -= dt;
    // луч догоняет цель с запаздыванием: можно уйти с линии
    const ty = chest(g, t);
    const k = 1 - Math.exp(-2.6 * dt);
    a.beam[0] += (t.x - a.beam[0]) * k;
    a.beam[1] += (ty - a.beam[1]) * k;
    a.beam[2] += (t.z - a.beam[2]) * k;
    if (!vis && a.chargeT > 0.3) {
      a.chargeT = 0;
      a.beam = null;
      g.emit("chargeOff", { id: a.id });
    } else if (a.chargeT <= 0) {
      const m = [a.x, a.y - 0.05, a.z];
      let dx = a.beam[0] - m[0], dy = a.beam[1] - m[1], dz = a.beam[2] - m[2];
      const L = Math.hypot(dx, dy, dz);
      fireRay(g, a, m, dx / L, dy / L, dz / L, d.shot, true);
      g.emit("snipe", { id: a.id, x: m[0], y: m[1], z: m[2] });
      a.beam = null;
      a.restT = d.rest * (0.8 + g.rand() * 0.5);
      // сменить точку
      a.perch = pickPerch(g, a, t);
    }
    return;
  }
  a.restT -= dt;
  if (vis && atPerch && a.restT <= 0 && a.seeT > d.react * g.diff.react) {
    a.chargeT = d.charge * (g.mods.has("fast") ? 0.8 : 1);
    a.beam = [t.x + (g.rand() - 0.5) * 1.5, chest(g, t) + 0.6, t.z + (g.rand() - 0.5) * 1.5];
    g.emit("charge", { id: a.id });
  } else if (!vis && atPerch && g.t - (a.lastSeen?.t || 0) > 3) {
    a.perch = pickPerch(g, a, t);
    a.lastSeen = { ...(a.lastSeen || t), t: g.t };
  }
}
function pickPerch(g, a, t) {
  const list = g.map.perches;
  let best = null, bs = -Infinity;
  for (let k = 0; k < 6; k++) {
    const p = list[Math.floor(g.rand() * list.length)];
    if (Math.hypot(p[0] - a.x, p[2] - a.z) < 3) continue;
    const d = Math.hypot(p[0] - t.x, p[2] - t.z);
    let s = -Math.abs(d - 22) + g.rand() * 6;
    if (g.world.sees(p[0], p[1], p[2], t.x, t.y + 1.2, t.z)) s += 15;
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best ? [...best] : a.perch;
}

// «Колобок»: катится к цели, пищит и взрывается
function thinkRoller(g, a, dt) {
  const d = a.def;
  if (a.state !== "combat") return calm(g, a, dt);
  if (targetGone(a)) a.target = g.player.alive ? g.player : null;
  const t = a.target;
  if (!t) return;
  const dist = Math.hypot(t.x - a.x, t.z - a.z);
  if (a.visible === t || dist < 8) {
    a.goal = { x: t.x, y: t.y, z: t.z };
    a.goalSpeed = 1;
  } else lostTarget(g, a, dt);
  if (a.fuseT > 0) {
    a.fuseT -= dt;
    if (a.fuseT <= 0) g.killRobot(a, { byBlast: true });
    return;
  }
  if (dist < d.range && Math.abs(t.y - a.y) < 1.6) {
    a.fuseT = d.blast.fuse;
    g.emit("beep", { id: a.id });
  }
}

// «Наковальня»
function thinkBoss(g, a, dt) {
  const d = a.def;
  const p = g.player;
  a.target = p.alive ? p : a.target;
  const t = a.target;
  a.goalSpeed = 1;
  const phase = a.hp < a.maxHp * 0.33 ? 2 : a.hp < a.maxHp * 0.66 ? 1 : 0;
  if (phase > a.phase) {
    a.phase = phase;
    g.emit("bossPhase", { phase });
    g.radioSay(phase === 1 ? "«Наковальня» перегревается — ядро будет открываться чаще!" : "Последний рывок! Она зовёт всех роботов!", "Вера");
    for (let i = 0; i < 2; i++) g.spawn(i % 2 ? "kolobok" : "strelok", ["dp2", "dp3", "dp4", "dp5"][(i + phase) % 4], { hunt: true });
    a.vent = 3;
  }
  // ходит по депо
  a.walkT = (a.walkT || 0) - dt;
  if (a.walkT <= 0) {
    a.walkT = 5 + g.rand() * 3;
    const z = g.map.zones.arena;
    const c = g.world.randomNear(z.x + 2, z.z, null, 7, g.rand);
    a.goal = { x: c[0], y: c[2], z: c[1] };
  }
  if (!t) return;
  const want = yawTo(a.x, a.z, t.x, t.z);
  a.yaw = turnTo(a.yaw, want, d.turn * dt * (1 + phase * 0.3));
  // ядро открывается, когда шагоход остывает
  if (a.vent > 0) {
    a.vent -= dt;
    a.burst = 0;
    if (a.vent <= 0) g.emit("ventClose", { id: a.id });
    return;
  }
  a.ventT -= dt;
  if (a.ventT <= 0) {
    a.vent = 3.4;
    a.ventT = 10 - phase * 1.5;
    g.emit("ventOpen", { id: a.id });
    return;
  }
  const dist = Math.hypot(t.x - a.x, t.z - a.z);
  const vis = g.world.sees(a.x, a.y + 4.5, a.z, t.x, chest(g, t), t.z, "bullet");
  a.visible = vis ? t : null;
  if (vis) {
    a.seeT += dt;
    if (a.burst > 0) {
      a.fireT -= dt;
      if (a.fireT <= 0) {
        a.fireT += d.gap;
        a.burst--;
        shoot(g, a, t, dist);
        if (a.burst <= 0) a.restT = d.rest * (1 - phase * 0.2);
      }
    } else {
      a.restT -= dt;
      if (a.restT <= 0) {
        a.burst = d.burst;
        a.fireT = 0.45;
        g.emit("spinup", { id: a.id });
      }
    }
  }
  // залп ракет по кругам на полу
  a.volleyT -= dt;
  if (a.volleyT <= 0) {
    a.volleyT = d.rocket.every * (1 - phase * 0.15);
    const n = 3 + (phase > 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ang = g.rand() * TAU, r = i === 0 ? 0.5 : 2.5 + g.rand() * 3;
      const tx = t.x + Math.cos(ang) * r, tz = t.z + Math.sin(ang) * r;
      const ty = g.world.groundAt(tx, tz, 0.1, t.y + 1);
      g.marks.push({ x: tx, y: ty, z: tz, r: d.rocket.r, t: 1.3 + i * 0.18 });
      const sx = a.x + (i % 2 ? 1.8 : -1.8) * Math.cos(a.yaw), sz = a.z - (i % 2 ? 1.8 : -1.8) * Math.sin(a.yaw);
      // ракета летит дугой: старт вверх, цель — круг
      g.launch(a, tx, ty, tz, { ...d.rocket, speed: d.rocket.speed * 0.9 }, sx, a.y + 6.2, sz);
    }
  }
  // подкрепление
  a.addT -= dt;
  if (a.addT <= 0) {
    a.addT = 20 - phase * 4;
    const pts = ["dp2", "dp3", "dp4", "dp5"];
    for (let i = 0; i < 2 + (phase > 1 ? 1 : 0); i++) g.spawn(i === 2 ? "zhuk" : "kolobok", pts[Math.floor(g.rand() * 4)], { hunt: true });
    g.emit("bossCall", {});
  }
}

// ---------- Боец отряда ----------
export function thinkMate(g, a, dt) {
  const p = g.player;
  a.flash = Math.max(0, (a.flash || 0) - dt * 5);
  a.thinkT -= dt;
  if (a.thinkT <= 0) {
    a.thinkT = 0.18 + g.rand() * 0.1;
    // ближайший видимый робот, сначала те, кто бьёт по игроку
    let best = null, bs = Infinity;
    for (const r of g.agents) {
      if (!r.alive || r.team !== "robot" || r.def.dummy) continue;
      const d = Math.hypot(r.x - a.x, r.z - a.z);
      if (d > MATE.sight) continue;
      const ey = a.y + a.h * 0.88;
      const ry = r.fly ? r.y : r.y + r.h * 0.6;
      if (!g.world.sees(a.x, ey, a.z, r.x, ry, r.z, "bullet")) continue;
      if (g.smokes.length && g.smoked(a.x, ey, a.z, r.x, ry, r.z)) continue;
      const s = d * (r.target === p && r.state === "combat" ? 0.7 : 1) * (r.def.camera ? 3 : 1);
      if (s < bs) {
        bs = s;
        best = r;
      }
    }
    if (best !== a.target) a.seeT = 0;
    a.target = best;
  }
  // куда идти
  if (a.cmd === "hold" && a.hold) a.goal = Math.hypot(a.x - a.hold.x, a.z - a.hold.z) > 1 ? { ...a.hold } : null;
  else if (p.alive) {
    const back = [[-1.7, 2.3], [1.7, 2.5], [0, 3.6], [-2.6, 4.2]][a.idx % 4];
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    // «назад» от игрока — (sin, cos), «вправо» — (cos, −sin)
    const sx = p.x + back[1] * s + back[0] * c, sz = p.z + back[1] * c - back[0] * s;
    const far = Math.hypot(a.x - sx, a.z - sz);
    if (far > 2.4) {
      a.goal = { x: sx, y: p.y, z: sz };
      a.goalSpeed = far > 10 ? 1.25 : 1;
    } else a.goal = null;
    if (Math.hypot(a.x - p.x, a.z - p.z) < 1.1) {
      a.goal = { x: a.x + (a.x - p.x) * 2, y: a.y, z: a.z + (a.z - p.z) * 2 };
    }
  }
  const t = a.target;
  if (t && t.alive) {
    const dist = Math.hypot(t.x - a.x, t.z - a.z);
    a.seeT += dt;
    a.yaw = turnTo(a.yaw, yawTo(a.x, a.z, t.x, t.z), MATE.turn * dt);
    a.faceT = 0.4;
    if (a.seeT > MATE.react && dist < MATE.range) {
      if (a.burst > 0) {
        a.fireT -= dt;
        if (a.fireT <= 0) {
          a.fireT += MATE.gap;
          a.burst--;
          shoot(g, a, t, dist);
          if (a.burst <= 0) a.restT = MATE.rest * (0.8 + g.rand() * 0.6);
        }
      } else {
        a.restT -= dt;
        if (a.restT <= 0) a.burst = MATE.burst;
      }
    }
  }
}

// ---------- Инженер ----------
export function thinkVip(g, a, dt) {
  const p = g.player;
  if (a.state === "captive" || a.down) {
    a.goal = null;
    return;
  }
  const d = Math.hypot(a.x - p.x, a.z - p.z);
  if (d > 2.2 && p.alive) {
    a.goal = { x: p.x, y: p.y, z: p.z };
    a.goalSpeed = d > 8 ? 1.2 : 1;
  } else a.goal = null;
  // испуг: рядом робот — пригибается
  a.scared = g.agents.some((r) => r.alive && r.team === "robot" && r.state === "combat" && Math.hypot(r.x - a.x, r.z - a.z) < 12);
}

// ---------- Движение ----------
export function moveAgent(g, a, dt) {
  const W = g.world;
  const d = a.def;
  const ox = a.x, oz = a.z;
  if (a.fly) {
    // полёт к точке: без столкновений, с покачиванием
    const goal = a.goal3;
    if (goal && a.stunT <= 0) {
      const dx = goal[0] - a.x, dy = goal[1] - a.y, dz = goal[2] - a.z, L = Math.hypot(dx, dy, dz);
      const sp = d.speed * (g.mods.has("fast") ? 1.3 : 1) * dt;
      if (L > 0.05) {
        const k = Math.min(1, sp / L);
        a.x += dx * k;
        a.y += dy * k;
        a.z += dz * k;
        if (a.state !== "combat" || !a.visible) a.yaw = turnTo(a.yaw, yawTo(a.x, a.z, goal[0], goal[2]), d.turn * dt);
      }
    } else if (a.stunT > 0) {
      // оглушённая «Оса» проседает
      a.y = Math.max(W.groundAt(a.x, a.z, 0.3, a.y) + 1.2, a.y - dt * 1.5);
    }
    a.vx = (a.x - ox) / dt;
    a.vz = (a.z - oz) / dt;
    return;
  }
  if (d.still || d.camera || !a.goal || a.stunT > 0) {
    a.speedNow = 0;
    a.vx = a.vz = 0;
    W.move(a, 0, 0, dt);
    return;
  }
  const goal = a.goal;
  a.repathT -= dt;
  const moved = a.pathGoal ? Math.hypot(goal.x - a.pathGoal.x, goal.z - a.pathGoal.z) : 99;
  if (!a.path || (a.repathT <= 0 && moved > 0.8) || moved > 3) {
    a.path = W.path(a.x, a.z, a.y, goal.x, goal.z, goal.y ?? null, 4000);
    a.pi = 0;
    a.repathT = 0.7 + g.rand() * 0.5;
    a.pathGoal = { x: goal.x, z: goal.z };
    a.noPath = !a.path;
    if (!a.path) {
      a.goal = null;
      return;
    }
  }
  let wp = a.path[a.pi];
  while (wp && Math.hypot(wp[0] - a.x, wp[1] - a.z) < 0.4) {
    a.pi++;
    wp = a.path[a.pi];
  }
  if (!wp) {
    a.arrived = true;
    a.path = null;
    a.goal = null;
    a.speedNow = 0;
    W.move(a, 0, 0, dt);
    return;
  }
  const dx = wp[0] - a.x, dz = wp[1] - a.z, L = Math.hypot(dx, dz);
  let speed = d.speed * (a.goalSpeed || 1) * (g.mods.has("fast") && a.team === "robot" ? 1.3 : 1);
  if (a.team === "robot" && a.burst > 0 && a.type === "strelok") speed *= 0.5;
  if (W.inWater(a.x, a.z, a.y + 0.1)) speed *= 0.65;
  const step = Math.min(L, speed * dt);
  W.move(a, (dx / L) * step, (dz / L) * step, dt);
  // разойтись с соседями
  for (const b of g.agents) {
    if (b === a || !b.alive || b.fly || b.def.camera) continue;
    const ex = a.x - b.x, ez = a.z - b.z, dd = Math.hypot(ex, ez), min = a.r + b.r;
    if (dd > 0.001 && dd < min) {
      const push = (min - dd) * 0.5;
      a.x += (ex / dd) * push;
      a.z += (ez / dd) * push;
    }
  }
  a.speedNow = Math.hypot(a.x - ox, a.z - oz) / dt;
  a.vx = (a.x - ox) / dt;
  a.vz = (a.z - oz) / dt;
  a.walkPhase += a.speedNow * dt * 2.2;
  // застрял — новый путь
  if (a.speedNow < speed * 0.15) {
    a.stuckT = (a.stuckT || 0) + dt;
    if (a.stuckT > 1.2) {
      a.stuckT = 0;
      a.path = null;
      const c = W.randomNear(a.x, a.z, a.y, 2, g.rand);
      a.goal = { x: c[0], y: c[2], z: c[1] };
    }
  } else a.stuckT = 0;
  // смотреть, куда идёшь, если не на цель
  a.faceT = (a.faceT || 0) - dt;
  if (a.faceT <= 0 && L > 0.1) a.yaw = turnTo(a.yaw, Math.atan2(-dx, -dz), (d.turn || 4) * dt);
}
