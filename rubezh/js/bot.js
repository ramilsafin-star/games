// Автопилот: играет за игрока теми же кнопками (вход для game.step). Нужен для проверок:
// tests/sim.mjs проходит им все задания на каждой сложности, браузерный тест — первое задание.
// Наводится с ограниченной скоростью поворота и стреляет, только когда прицел на роботе.
import { GRENADES } from "./data.js?v=cb8e2b87";
import { rng, clamp, wrap, yawTo, lookDir, TAU } from "./util.js?v=cb8e2b87";
import { TRAINING } from "./sim.js?v=cb8e2b87";

export class Autopilot {
  constructor(game, o = {}) {
    this.g = game;
    this.rand = rng(o.seed || 7);
    this.turn = o.turn || 4.2; // рад/с
    this.react = o.react ?? 0.32; // реакция на нового робота
    this.noise = o.noise ?? 1; // дрожь прицела
    this.known = new Map(); // замеченные роботы: id → время, с которого видим
    this.jx = 0;
    this.jy = 0;
    this.jT = 0;
    this.hurtYaw = null;
    this.cover = null;
    this.coverT = 0;
    this.path = null;
    this.repathT = 0;
    this.goalKey = "";
    this.stuckT = 0;
    this.lastPos = null;
    this.lastProgress = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.visited = new Set();
    this.trainT = 0;
    this.jitter = 0;
  }
  // ---------- что видно ----------
  threats() {
    const g = this.g, p = g.player;
    const ey = g.eye();
    const out = [];
    for (const a of g.agents) {
      if (!a.alive || a.team !== "robot") continue;
      if (a.def.camera && (Math.hypot(a.x - p.x, a.z - p.z) > 22 || !g.mission.stealth)) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d > 60) continue;
      // как человек: замечает в поле зрения (около 110°), вблизи и тех, кто стреляет в него
      const ang = Math.abs(wrap(yawTo(p.x, p.z, a.x, a.z) - p.yaw));
      const seen = this.known.has(a.id);
      if (!seen && ang > 0.95 && d > 5 && !a.training && !(a.lastShotAt && g.t - a.lastShotAt < 1.5 && a.target === p)) continue;
      const aim = this.aimPoint(a, ey);
      if (!aim) {
        this.known.delete(a.id);
        continue;
      }
      if (!seen) this.known.set(a.id, g.t);
      if (g.t - this.known.get(a.id) < this.react) continue;
      out.push({ a, d, aim });
    }
    for (const id of this.known.keys()) if (!g.agents.some((a) => a.id === id && a.alive)) this.known.delete(id);
    return out;
  }
  // точка прицела: ядро, если его видно, иначе корпус
  aimPoint(a, ey) {
    const g = this.g, p = g.player;
    const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
    let fallback = null;
    const parts = a.def.parts.slice().sort((x, y) => y[4] - x[4]);
    for (const part of parts) {
      const [px, py, pz, pr, core] = part;
      if (core && a.def.boss && !(a.vent > 0)) continue;
      const wx = a.x + px * c + pz * s, wy = a.y + py, wz = a.z - px * s + pz * c;
      if (!g.world.sees(p.x, ey, p.z, wx, wy, wz, "bullet")) continue;
      if (g.smokes.length && g.smoked(p.x, ey, p.z, wx, wy, wz)) continue;
      // ядро за щитом спереди не достать
      if (core && a.def.shield && a.shield > 0 && a.stunT <= 0 && Math.abs(wrap(yawTo(a.x, a.z, p.x, p.z) - a.yaw)) < 1.4) continue;
      const pt = { x: wx, y: wy, z: wz, r: pr, core: !!core };
      if (core) return pt;
      if (!fallback) fallback = pt;
    }
    return fallback;
  }
  // ---------- куда идти ----------
  goal() {
    const g = this.g, o = g.obj, p = g.player;
    const k = o.kind;
    if (k === "training") return this.trainGoal();
    if (k === "clear" || (k === "skirmish" && !o.planted && this.g.hostileLeft() <= 2)) {
      let best = null, bd = Infinity;
      for (const a of g.agents) {
        if (!a.alive || a.team !== "robot" || a.def.camera) continue;
        const d = Math.hypot(a.x - p.x, a.z - p.z) + (a.fly ? 25 : 0);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best) {
        const seen = g.world.sees(p.x, g.eye(), p.z, best.x, best.y + best.h * 0.6, best.z, "bullet");
        return { x: best.x, y: best.fly ? null : best.y, z: best.z, r: seen ? (best.fly ? 14 : 7) : 1.2, key: "r" + best.id + (seen ? "s" : "") };
      }
      return null;
    }
    if (k === "stealth") return o.stage === "go" ? { ...o.target, r: 1.2, use: true, key: "hack" } : o.exit ? { ...o.exit, r: 1.5, key: "exit" } : null;
    if (k === "plant" || k === "skirmish") {
      if (o.planted) return { ...o.planted, r: 3.5, key: "guard", stay: true };
      let best = null, bd = Infinity;
      for (const s of o.sites) {
        const d = g.world.pathLength(p.x, p.z, p.y, s.x, s.z, s.y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return { ...best, r: 1.1, use: true, key: "site" + best.label };
    }
    if (k === "defuse") {
      const b = o.bomb;
      if (b.found) return { ...b, r: 1.1, use: true, key: "bomb" };
      const left = o.sites.filter((s) => !this.visited.has(s.label));
      let best = null, bd = Infinity;
      for (const s of left) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < 7) this.visited.add(s.label);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (!best) {
        this.visited.clear();
        best = o.sites[0];
      }
      return { ...best, r: 2, key: "look" + best.label };
    }
    if (k === "rescue") {
      const v = g.vip;
      if (v.state === "captive" || v.down) return { x: v.x, y: v.y, z: v.z, r: 1.1, use: true, key: "vip" };
      const dv = Math.hypot(v.x - p.x, v.z - p.z);
      if (dv > 7) return { x: v.x, y: v.y, z: v.z, r: 2.5, key: "wait" };
      return { ...o.exit, r: 1.5, key: "exit", slow: dv > 4.5 };
    }
    if (k === "hold") return { ...o.zone, r: o.zone.r * 0.45, key: "hold", stay: true };
    if (k === "boss") {
      const b = g.boss;
      if (!b.alive) return null;
      // пулемёт крутится, ядро закрыто — за укрытие; ядро открыто — выйти и стрелять
      if (b.burst > 0 && !(b.vent > 0) && b.stunT <= 0) {
        if (!this.bossCover || this.bossCoverT < g.t) {
          this.bossCover = g.world.cover(p.x, p.z, p.y, b.x, b.y + 4.5, b.z, 9, this.rand);
          this.bossCoverT = g.t + 2.5;
        }
        if (this.bossCover) return { x: this.bossCover[0], y: this.bossCover[2], z: this.bossCover[1], r: 0.6, key: "bcover" + this.bossCover[0].toFixed(1), stay: true, hide: true };
      }
      // держаться в 14–20 м и ходить кругом
      const ang = yawTo(b.x, b.z, p.x, p.z) + this.strafe * 0.5;
      const R = 17;
      const x = b.x - Math.sin(ang) * R, z = b.z - Math.cos(ang) * R;
      const c = g.world.randomNear(x, z, null, 2, this.rand);
      return { x: c[0], y: c[2], z: c[1], r: 2.5, key: "boss" + Math.round(ang * 2), stay: true };
    }
    return null;
  }
  trainGoal() {
    const g = this.g, o = g.obj;
    const st = TRAINING[o.step];
    if (!st) return null;
    if (st.id === "move") return { ...g.map.points.mark, r: 0.6, key: "mark" };
    if (st.id === "aim" && !g.agents.some((a) => a.alive && a.training && this.aimPoint(a, g.eye()))) {
      return { ...g.map.points.mark, r: 0.4, key: "aim" };
    }
    if (st.id === "plant") return { ...g.map.points.plant, r: 1, use: true, key: "plant" };
    if (st.id === "grenade") return { ...g.map.points.mark, r: 1, key: "mark2" };
    return null;
  }

  // ---------- кнопки на этот кадр ----------
  input(dt) {
    const g = this.g, p = g.player, o = g.obj;
    const inp = { mx: 0, mz: 0, fire: false, aim: false, crouch: false, walk: false, reload: false, use: false, grenade: false, lookDX: 0, lookDY: 0 };
    if (!p.alive || g.phase !== "live") return inp;
    const ey = g.eye();
    const W = g.weapon();
    const A = p.ammo[p.cur];
    const threats = this.threats();
    // цель
    let tgt = null, ts = Infinity;
    for (const t of threats) {
      let s = t.d;
      if (t.a.type === "kolobok") s *= 0.35;
      if (t.a.chargeT > 0) s *= 0.5;
      if (t.a.def.camera) s *= 0.7;
      if (t.a.def.boss) s *= t.a.vent > 0 ? 0.3 : 1.5;
      if (t.a.state !== "combat" && g.mission.stealth && !g.alarm) s *= 1.4;
      if (s < ts) {
        ts = s;
        tgt = t;
      }
    }
    // тренировка: особые шаги
    const st = o.kind === "training" ? TRAINING[o.step] : null;
    let lookYaw = null, lookPitch = 0;
    if (st && st.id === "look") {
      lookYaw = p.yaw + 2;
    }
    if (st && st.id === "crouch") inp.crouch = true;
    if (st && st.id === "reload") inp.reload = A.mag < A.w.mag ? true : false;
    if (st && st.id === "reload" && A.mag >= A.w.mag) inp.fire = true;
    if (st && st.id === "switch") inp.slot = p.cur === "pri" ? "sec" : "pri";
    // враг в прицеле
    let fire = false, aimHold = false;
    // дрожь прицела растёт с расстоянием
    this.jT -= dt;
    if (this.jT <= 0) {
      this.jT = 0.22;
      this.jx = this.rand.gauss();
      this.jy = this.rand.gauss();
    }
    if (tgt) {
      const t = tgt;
      const j = (0.16 + 0.02 * t.d) * this.noise;
      const dx = t.aim.x + this.jx * j * Math.cos(p.yaw) - p.x, dy = t.aim.y + this.jy * j * 0.7 - ey, dz = t.aim.z - this.jx * j * Math.sin(p.yaw) - p.z;
      const hd = Math.hypot(dx, dz);
      lookYaw = Math.atan2(-dx, -dz);
      lookPitch = Math.atan2(dy, hd);
      const err = Math.hypot(wrap(lookYaw - p.yaw) * Math.cos(p.pitch), lookPitch - p.pitch);
      const tol = Math.max(0.006, (t.aim.r / Math.max(1, t.d)) * 0.85);
      const longGun = W.scope || W.zoom >= 1.4;
      aimHold = !W.melee && !W.pellets && (t.d > 11 || (longGun && t.d > 7) || (st && st.id === "aim"));
      if (W.scope) aimHold = t.d > 5;
      const aimReady = !aimHold || p.aim > 0.85;
      if (err < tol && aimReady && !(st && (st.id === "reload" || st.id === "grenade"))) fire = true;
      if (W.melee) fire = t.d < 2.2;
      if (st && st.id === "aim") fire = fire && p.aim > 0.85;
    }
    // гранаты
    const gi = (kind) => p.grenades.indexOf(kind);
    if (tgt && p.throwT <= 0 && this.rand() < 0.08) {
      const t = tgt.a;
      let kind = null;
      if ((t.def.shield && t.shield > 0) || t.type === "molot" || t.def.boss) kind = gi("emp") >= 0 ? "emp" : gi("frag") >= 0 ? "frag" : null;
      const group = threats.filter((q) => Math.hypot(q.a.x - t.x, q.a.z - t.z) < 4.5).length;
      if (!kind && group >= 2 && gi("frag") >= 0) kind = "frag";
      if (kind && tgt.d > 6 && tgt.d < 17) this.nade = { kind, x: t.x, y: t.y, z: t.z, t: 0.6 };
    }
    if (st && st.id === "grenade" && p.grenades.length && !this.nade && g.nades.length === 0) {
      const gp = g.map.points.g2;
      this.nade = { kind: p.grenades[0], x: gp.x, y: gp.y, z: gp.z, t: 1.2 };
    }
    if (this.nade) {
      const n = this.nade;
      const D = Math.hypot(n.x - p.x, n.z - p.z);
      lookYaw = yawTo(p.x, p.z, n.x, n.z);
      const theta = 0.5 * Math.asin(clamp((D * 1.05) / 17.5, 0, 1));
      lookPitch = theta - 0.16 - 0.05;
      fire = false;
      n.t -= dt;
      const err = Math.abs(wrap(lookYaw - p.yaw)) + Math.abs(lookPitch - p.pitch);
      if (err < 0.05 || n.t <= 0) {
        const k = gi(n.kind);
        if (k >= 0) {
          inp.grenade = true;
          inp.gslot = k;
        }
        this.nade = null;
      }
    }
    // поворот с ограниченной скоростью
    // попали — обернуться в сторону выстрела
    if (lookYaw === null && g.t - p.lastHurt < 1.2 && p.hurtX !== undefined) lookYaw = yawTo(p.x, p.z, p.hurtX, p.hurtZ);
    if (lookYaw === null) {
      // смотреть по пути
      if (this.path && this.path[0]) lookYaw = yawTo(p.x, p.z, this.path[0][0], this.path[0][1]);
      else lookYaw = p.yaw;
      lookPitch = 0;
    }
    const maxT = this.turn * dt;
    inp.lookDX = clamp(wrap(lookYaw - p.yaw), -maxT, maxT);
    inp.lookDY = clamp(lookPitch - p.pitch, -maxT, maxT);
    inp.fire = inp.fire || fire;
    inp.aim = aimHold;
    // перезарядка
    if (!W.melee && A.mag === 0 && A.res === 0 && p.cur === "pri") inp.slot = "sec";
    if (!W.melee && A.mag < A.w.mag * 0.35 && A.res > 0 && (!tgt || A.mag === 0)) inp.reload = true;
    // набор
    if (p.hp < 45 && !p.kitUsed && p.kit === "battery") inp.kit = true;
    if (p.kit === "scanner" && !p.kitUsed && o.kind === "defuse") inp.kit = true;
    // движение
    const goal = this.goal();
    let mvx = 0, mvz = 0; // мировой вектор
    if (goal) {
      const dGoal = Math.hypot(goal.x - p.x, goal.z - p.z);
      const reached = dGoal < goal.r && (goal.y == null || Math.abs(goal.y - p.y) < 1.2);
      if (!reached) {
        if (goal.key !== this.goalKey || this.repathT <= 0 || ((!this.path || !this.path.length) && this.repathT <= 0.7)) {
          this.path = g.world.path(p.x, p.z, p.y, goal.x, goal.z, goal.y ?? null, 8000) || [];
          if (!this.path.length) this.path = [[goal.x, goal.z]];
          this.goalKey = goal.key;
          this.repathT = 1.0;
        }
        this.repathT -= dt;
        if (this.path) {
          while (this.path.length && Math.hypot(this.path[0][0] - p.x, this.path[0][1] - p.z) < 0.45) this.path.shift();
          const wp = this.path[0];
          if (wp) {
            const dx = wp[0] - p.x, dz = wp[1] - p.z, L = Math.hypot(dx, dz) || 1;
            mvx = dx / L;
            mvz = dz / L;
          }
        }
        if (goal.slow) {
          mvx *= 0.4;
          mvz *= 0.4;
        }
      } else {
        this.path = null;
        if (goal.use) inp.use = true;
      }
    }
    // в бою: стоять и стрелять, если цель видна (кроме срочных задач), уклоняться от «Колобков»
    if (tgt) {
      const t = tgt.a;
      const urgent = goal && (goal.use || goal.hide || o.kind === "defuse" || (o.kind === "rescue" && goal.key === "exit"));
      const usingNow = inp.use;
      if (t.type === "kolobok" && tgt.d < 6.5) {
        const ax = p.x - t.x, az = p.z - t.z, L = Math.hypot(ax, az) || 1;
        mvx = ax / L;
        mvz = az / L;
      } else if (!t.def.dummy && !urgent && !usingNow && tgt.d < 40 && !(goal && goal.stay && Math.hypot(goal.x - p.x, goal.z - p.z) > goal.r * 2)) {
        // шаг в сторону для уклонения
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = 0.6 + this.rand() * 0.9;
          this.strafe = this.rand() < 0.5 ? -1 : 1;
        }
        const yaw = p.yaw;
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const k = t.def.boss ? 0.9 : p.hp < 50 ? 0.7 : 0.35;
        mvx = mvx * 0.15 + rx * this.strafe * k;
        mvz = mvz * 0.15 + rz * this.strafe * k;
        if (tgt.d > 14 && p.speedNow < 1.5 && !t.def.boss) inp.crouch = true;
      }
      // мало щита — в укрытие от ближайшего робота
      if (p.hp < 42 && !urgent && t.type !== "kolobok") {
        this.coverT -= dt;
        if (!this.cover || this.coverT <= 0) {
          this.cover = g.world.cover(p.x, p.z, p.y, t.x, t.y + 1.2, t.z, 10, this.rand);
          this.coverT = 3;
          this.coverPath = this.cover ? g.world.path(p.x, p.z, p.y, this.cover[0], this.cover[1], this.cover[2]) : null;
        }
        if (this.coverPath && this.coverPath.length) {
          while (this.coverPath.length && Math.hypot(this.coverPath[0][0] - p.x, this.coverPath[0][1] - p.z) < 0.45) this.coverPath.shift();
          const wp = this.coverPath[0];
          if (wp) {
            const dx = wp[0] - p.x, dz = wp[1] - p.z, L = Math.hypot(dx, dz) || 1;
            mvx = dx / L;
            mvz = dz / L;
          } else {
            mvx = mvz = 0;
            inp.crouch = true;
          }
        } else {
          const ax = p.x - t.x, az = p.z - t.z, L = Math.hypot(ax, az) || 1;
          mvx = mvx * 0.3 + (ax / L) * 0.8;
          mvz = mvz * 0.3 + (az / L) * 0.8;
        }
      } else this.cover = null;
    }
    // красные круги ракет: выйти из круга, как сделал бы человек
    for (const m of g.marks) {
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      if (d < m.r + 0.8 && m.t < 1.4) {
        const ax = (p.x - m.x) / (d || 1), az = (p.z - m.z) / (d || 1);
        mvx = ax;
        mvz = az;
        break;
      }
    }
    // тихие задания: идти шагом, пока нет тревоги
    if (g.mission.stealth && !g.alarm) inp.walk = !tgt;
    // застрял — подпрыгнуть и сдвинуться
    if (this.lastPos) {
      const mv = Math.hypot(p.x - this.lastPos[0], p.z - this.lastPos[1]);
      if ((mvx || mvz) && mv < 0.4 * dt) this.stuckT += dt;
      else this.stuckT = Math.max(0, this.stuckT - dt);
    }
    this.lastPos = [p.x, p.z];
    if (this.stuckT > 1.2) {
      this.jitter = 0.6;
      this.stuckT = 0;
      this.path = null;
      this.jdir = this.rand() * TAU;
    }
    if (this.jitter > 0) {
      this.jitter -= dt;
      mvx = Math.sin(this.jdir);
      mvz = Math.cos(this.jdir);
      inp.jump = this.jitter > 0.5;
    }
    // мировой вектор → кнопки относительно взгляда (после поворота)
    const yaw = p.yaw + inp.lookDX;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    inp.mz = mvx * fx + mvz * fz;
    inp.mx = mvx * rx + mvz * rz;
    if (st && st.id === "crouch") inp.mx = inp.mz = 0;
    return inp;
  }
}

// применить поворот взгляда (так же делает main.js для мыши и пальца)
export function applyLook(game, dx, dy) {
  const p = game.player;
  p.yaw += dx || 0;
  p.pitch = clamp(p.pitch + (dy || 0), -1.45, 1.45);
}
