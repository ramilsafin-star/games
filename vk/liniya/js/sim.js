// Симуляция уровня с постоянным шагом 1/120 с. Физика — matter.js (передаётся снаружи:
// в браузере window.Matter, в Node — require). DOM не нужен, поэтому проверки гоняют
// те же правила, что и игра.
import { dist, rng, cumLengths, pathAt, chaikin, polyLength } from "./geom.js?v=80a70cba";
import { W, H, LINE_T, HERO_R, WALKER_R, BERRY_R, icicle, drawWith } from "./world.js?v=80a70cba";

export const HZ = 120;
export const DT = 1 / HZ;
const STEP_MS = 1000 / HZ;

let M = null;
export function useMatter(m) {
  M = m;
}

const CAT = { T: 1, L: 2, H: 4, Z: 8, B: 16, D: 32, G: 64, P: 128 }; // P — привидения и огоньки
const ALL = 0xffff;

export function createSim(L) {
  return L.type === "home" ? new HomeSim(L) : new PhysSim(L);
}

// ---------- Уровни с физикой: «Защити» и «Достань» ----------
class PhysSim {
  constructor(L) {
    const { Engine, Events, Common, Bodies, Body, Composite } = M;
    Common._nextId = 0;
    Common._seed = 0;
    this.L = L;
    this.t = 0;
    this.state = "draw";
    this.why = "";
    this.endT = 0;
    this.fx = [];
    this.lines = [];
    this.heroes = [];
    this.bugs = [];
    this.hazards = []; // камни, ядра, сосульки, шары с шипами
    this.drops = [];
    this.ghosts = []; // привидения и огоньки: летят сквозь землю и камни, но не сквозь линию
    this.statics = []; // всё неподвижное, что рисуется отдельно (пушки, гвозди, пружины…)
    this.movers = [];
    this.doors = [];
    this.rand = rng(L.seed);
    this.started = [];
    this.inkUsed = 0;
    const engine = (this.engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 },
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 4,
    }));
    this.world = engine.world;
    const add = (b) => (Composite.add(this.world, b), b);
    this.add = add;
    const tag = (b, k, extra) => ((b.plugin = { k, ...extra }), b);

    // Земля и платформы
    L.terrain.forEach((p, i) => {
      const mat = MATS[p.m] || MATS.ground;
      const opt = {
        isStatic: true,
        friction: mat.f,
        frictionStatic: mat.fs,
        restitution: mat.e,
        isSensor: !!mat.sensor,
        collisionFilter: { category: CAT.T, mask: ALL },
      };
      let b;
      if (p.shape === "circle") b = Bodies.circle(p.x, p.y, p.r, opt);
      else {
        const c = M.Vertices.centre(p.verts.map(([x, y]) => ({ x, y })));
        b = Bodies.fromVertices(c.x, c.y, [p.verts.map(([x, y]) => ({ x, y }))], opt);
        // fromVertices сдвигает тело в центр масс — возвращаем углы точно туда, где они в уровне
        const v0 = b.vertices.reduce((s, v) => ({ x: s.x + v.x, y: s.y + v.y }), { x: 0, y: 0 });
        const w0 = p.verts.reduce((s, v) => ({ x: s.x + v[0], y: s.y + v[1] }), { x: 0, y: 0 });
        Body.translate(b, { x: (w0.x - v0.x) / p.verts.length, y: (w0.y - v0.y) / p.verts.length });
      }
      // matter ставит неподвижным телам трение 1 — возвращаем трение материала (иначе лёд не скользкий)
      for (const part of b.parts) (part.friction = mat.f), (part.restitution = mat.e);
      tag(b, "terrain", { m: p.m, piece: i, deadly: !!mat.deadly, spring: p.m === "spring" ? p.power || 13 : 0, a: p.a || 0 });
      add(b);
      if (p.move) this.movers.push({ b, base: { ...b.position }, ...p.move });
      if (p.door != null) this.doors.push({ b, base: { ...b.position }, id: p.door, open: 0, dx: p.dx || 0, dy: p.dy ?? -(p.h || 100) });
    });

    // Колышки — на них можно опереть линию
    for (const [x, y] of L.pegs) add(tag(Bodies.circle(x, y, 9, { isStatic: true, friction: 0.9, collisionFilter: { category: CAT.T, mask: ALL } }), "peg"));

    // Тоша и друзья
    const heroAt = (x, foot, c, main, roll = false) => {
      // круг из 48 сторон: у обычного круга matter (20 сторон) шар застревает на пологих склонах
      const b = Bodies.polygon(x, foot - HERO_R, 48, HERO_R, {
        density: 0.003,
        friction: roll ? 0.5 : 0.9,
        frictionStatic: roll ? 0.6 : 1.2,
        frictionAir: 0.002,
        restitution: 0,
        collisionFilter: { category: CAT.H, mask: ALL },
      });
      // matter по умолчанию вчетверо завышает инерцию — шар тогда катится вяло; катящемуся Тоше даём настоящую
      Body.setInertia(b, roll ? b.inertia / 4 : Infinity);
      tag(b, "hero");
      add(b);
      const h = { b, c, main, mood: 0 };
      this.heroes.push(h);
      return h;
    };
    const t = L.target;
    if (t && t.k === "roll") this.target = { ...heroAt(t.x, t.y + HERO_R, 0, true, true), k: "roll" };
    else if (L.hero) heroAt(L.hero[0], L.hero[1], 0, true);
    for (const f of L.friends) heroAt(f[0], f[1], f[2] ?? 1, false);

    // Что нужно доставить
    if (t && t.k === "berry") {
      const b = Bodies.polygon(t.x, t.y, 48, BERRY_R, {
        density: 0.002,
        friction: 0.4,
        frictionStatic: 0.5,
        restitution: 0.1,
        frictionAir: 0.002,
        collisionFilter: { category: CAT.G, mask: ALL },
      });
      Body.setInertia(b, b.inertia / 4);
      this.target = { b: add(tag(b, "berry")), k: "berry" };
    } else if (t && t.k === "star") {
      // Звёздочка-ключ: круглая, катится как ягода
      const b = Bodies.polygon(t.x, t.y, 48, BERRY_R, {
        density: 0.003,
        friction: 0.4,
        frictionStatic: 0.5,
        restitution: 0.1,
        frictionAir: 0.002,
        collisionFilter: { category: CAT.G, mask: ALL },
      });
      Body.setInertia(b, b.inertia / 4);
      this.target = { b: add(tag(b, "star")), k: "star" };
    }
    if (L.lock) {
      const [x, y] = L.lock;
      add(tag(Bodies.rectangle(x, y + 35, 100, 110, { isStatic: true, friction: 0.6, collisionFilter: { category: CAT.T, mask: ALL } }), "cage"));
    }

    // Пушки
    for (const c of L.cannons || []) this.statics.push({ k: "cannon", ...c, shot: 0, flash: 0 });
    for (const c of L.cannons || []) {
      const b = Bodies.circle(c.x, c.y, 30, { isStatic: true, collisionFilter: { category: CAT.T, mask: ALL } });
      add(tag(b, "cannon"));
    }
    // Трубы, из которых капает
    for (const d of L.drops || []) {
      add(tag(Bodies.rectangle(d.x, d.y - 25, 44, 70, { isStatic: true, collisionFilter: { category: CAT.T, mask: ALL } }), "pipe"));
      this.statics.push({ k: "pipe", ...d, made: 0 });
    }
    for (const n of L.bugs || []) this.statics.push({ k: "nest", ...n, made: 0 });
    for (const r of L.rocks || []) this.statics.push({ k: "rocks", ...r, made: 0 });
    // Лунный туман: из него вылетают привидения (fire — огоньки, которые поджигают линию)
    for (const m of L.ghosts || []) this.statics.push({ k: "mist", ...m, made: 0 });
    // Вентиляторы
    for (const f of L.fans || []) {
      add(tag(Bodies.rectangle(f.x, f.y + 7, f.w, 26, { isStatic: true, collisionFilter: { category: CAT.T, mask: ALL } }), "fanbox"));
      this.statics.push({ k: "fan", ...f });
    }
    // Кнопки
    this.buttons = (L.buttons || []).map((b) => ({ ...b, down: false }));

    // Сосульки висят до своего часа
    for (const ic of L.icicles || []) {
      const v = icicle(ic).map(([x, y]) => ({ x, y }));
      const c = M.Vertices.centre(v);
      const b = Bodies.fromVertices(c.x, c.y, [v], { density: 0.004, friction: 0.5, restitution: 0.1, collisionFilter: { category: CAT.Z, mask: ALL } });
      tag(b, "icicle");
      Body.setStatic(b, true);
      add(b);
      this.hazards.push({ b, k: "icicle", at: ic[3] ?? 0.4, life: 99, held: true });
    }
    // Шары с шипами катятся с самого начала
    for (const s of L.balls || []) {
      const b = Bodies.circle(s.x, s.y, s.r || 24, {
        density: 0.006,
        friction: 0.6,
        restitution: 0.2,
        frictionAir: 0.001,
        collisionFilter: { category: CAT.Z, mask: ALL },
      });
      tag(b, "spike");
      Body.setStatic(b, true);
      add(b);
      this.hazards.push({ b, k: "spike", at: s.at ?? 0, life: 99, held: true, v: s.v || [0, 0] });
    }

    Events.on(engine, "collisionStart", (e) => {
      for (const p of e.pairs) this.started.push(p);
    });
  }

  get inkLeft() {
    return this.L.plan.limit - this.inkUsed;
  }

  // Готовая ломаная → твёрдое тело из отрезков и кружков на стыках
  addStroke(pts, len = polyLength(pts)) {
    const { Bodies, Body, Constraint, Composite } = M;
    const parts = [];
    const opt = { density: 0.003, collisionFilter: { category: CAT.L, mask: ALL } };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i],
        l = dist(a, b);
      if (l < 0.5) continue;
      parts.push(Bodies.rectangle((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, l, LINE_T, { ...opt, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) }));
    }
    for (const p of pts) parts.push(Bodies.circle(p[0], p[1], LINE_T / 2, opt));
    const body = Body.create({
      parts,
      friction: 0.9,
      frictionStatic: 0.5,
      restitution: 0,
      frictionAir: 0.004,
      collisionFilter: { category: CAT.L, mask: ALL },
    });
    body.plugin = { k: "line" };
    Composite.add(this.world, body);
    const local = pts.map(([x, y]) => [x - body.position.x, y - body.position.y]);
    const line = { b: body, local, pts, pins: [], cons: [], burn: 0, gone: false };
    // Гвоздики: линия, прошедшая рядом, на них повисает
    for (const nail of this.L.nails) {
      let best = Infinity,
        at = null;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          b = pts[i];
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          l2 = dx * dx + dy * dy || 1;
        const k = Math.max(0, Math.min(1, ((nail[0] - a[0]) * dx + (nail[1] - a[1]) * dy) / l2));
        const q = [a[0] + dx * k, a[1] + dy * k];
        const d = dist(q, nail);
        if (d < best) (best = d), (at = q);
      }
      if (best <= 16) {
        const c = Constraint.create({
          bodyA: body,
          pointA: { x: nail[0] - body.position.x, y: nail[1] - body.position.y },
          pointB: { x: nail[0], y: nail[1] },
          length: 0,
          stiffness: 0.95,
          damping: 0.05,
        });
        Composite.add(this.world, c);
        line.pins.push(nail);
        line.cons.push(c);
      }
    }
    this.lines.push(line);
    this.inkUsed += len;
    return line;
  }

  start() {
    if (this.state !== "draw") return;
    this.state = "run";
    for (const h of this.hazards) if (h.held && h.at <= 0) this.release(h);
    if (this.target && this.L.target.v) M.Body.setVelocity(this.target.b, { x: this.L.target.v[0], y: this.L.target.v[1] });
  }

  release(h) {
    h.held = false;
    M.Body.setStatic(h.b, false);
    if (h.v) M.Body.setVelocity(h.b, { x: h.v[0], y: h.v[1] });
    if (h.k === "spike") M.Body.setAngularVelocity(h.b, (h.v?.[0] || 0) * 0.02);
  }

  end(won, why) {
    if (this.state !== "run") return;
    this.state = won ? "won" : "lost";
    this.why = why;
    this.endT = this.t;
    this.fx.push({ k: won ? "win" : "lose", why });
  }

  spawnBug(n) {
    const { Bodies, Composite } = M;
    const a = this.rand() * Math.PI * 2;
    const b = Bodies.circle(n.x + Math.cos(a) * 14, n.y + Math.sin(a) * 14, 10, {
      density: 0.0016,
      friction: 0.1,
      frictionAir: 0.03,
      restitution: 0.5,
      collisionFilter: { category: CAT.B, mask: ALL & ~CAT.D },
    });
    b.plugin = { k: "bug" };
    Composite.add(this.world, b);
    M.Body.setVelocity(b, { x: Math.cos(a) * 3, y: Math.sin(a) * 3 });
    this.bugs.push({ b, phase: this.rand() * 6.28, born: this.t, speed: (n.speed || 1) * (0.9 + this.rand() * 0.25) });
    this.fx.push({ k: "spawn", x: n.x, y: n.y });
  }

  spawnRock(s) {
    const { Bodies, Composite, Body } = M;
    const x = s.x0 + this.rand() * (s.x1 - s.x0);
    const r = (s.r || 20) * (0.8 + this.rand() * 0.45);
    const b = Bodies.polygon(x, s.y ?? -40, 6 + Math.floor(this.rand() * 3), r, {
      density: s.snow ? 0.003 : 0.005,
      friction: 0.6,
      restitution: 0.15,
      frictionAir: 0.004,
      collisionFilter: { category: CAT.Z, mask: ALL },
    });
    Body.setAngle(b, this.rand() * 6);
    Body.setVelocity(b, { x: s.vx || 0, y: 2 });
    Body.setAngularVelocity(b, (this.rand() - 0.5) * 0.1);
    b.plugin = { k: "rock", snow: !!s.snow };
    Composite.add(this.world, b);
    this.hazards.push({ b, k: s.snow ? "snow" : "rock", life: s.life || 6, born: this.t });
  }

  fire(c) {
    const { Bodies, Composite, Body } = M;
    const a = (c.angle * Math.PI) / 180;
    const x = c.x + Math.cos(a) * 46,
      y = c.y + Math.sin(a) * 46;
    const b = Bodies.circle(x, y, c.r || 15, {
      density: 0.008,
      friction: 0.3,
      restitution: 0.3,
      frictionAir: 0,
      collisionFilter: { category: CAT.Z, mask: ALL },
    });
    Body.setVelocity(b, { x: Math.cos(a) * c.speed, y: Math.sin(a) * c.speed });
    b.plugin = { k: "ball", fire: !!c.fire };
    Composite.add(this.world, b);
    this.hazards.push({ b, k: c.fire ? "fireball" : c.snow ? "snowball" : "ball", life: 4.5, born: this.t });
    c.flash = 1;
    this.fx.push({ k: "boom", x, y, fire: !!c.fire });
  }

  drip(d) {
    const { Bodies, Composite, Body } = M;
    const b = Bodies.circle(d.x + (this.rand() - 0.5) * (d.spread || 10), d.y + 22, 6, {
      density: 0.001,
      friction: 0.02,
      frictionStatic: 0,
      restitution: 0,
      frictionAir: 0.01,
      collisionFilter: { category: CAT.D, mask: ALL & ~CAT.D & ~CAT.B },
    });
    Body.setVelocity(b, { x: (this.rand() - 0.5) * 0.6 + (d.vx || 0), y: 1 });
    b.plugin = { k: "drop", lava: !!d.lava };
    Composite.add(this.world, b);
    this.drops.push({ b, born: this.t, lava: !!d.lava });
  }

  // Привидение (или огонёк): неподвижный датчик, который мы двигаем сами — физика его не толкает,
  // земля и камни ему не помеха (маска столкновений: только линии и герои)
  spawnGhost(m) {
    const { Bodies, Composite } = M;
    const a = this.rand() * Math.PI * 2;
    const x = m.x + Math.cos(a) * 10,
      y = m.y + Math.sin(a) * 10;
    const r = m.fire ? 12 : 16;
    const b = Bodies.circle(x, y, r, { isStatic: true, isSensor: true, collisionFilter: { category: CAT.P, mask: CAT.L | CAT.H } });
    b.plugin = { k: "ghost", fire: !!m.fire };
    Composite.add(this.world, b);
    this.ghosts.push({ b, x, y, r, fire: !!m.fire, phase: this.rand() * 6.28, born: this.t, speed: (m.speed || 1) * (0.92 + this.rand() * 0.16), vx: 0, vy: 0 });
    this.fx.push({ k: "mistout", x: m.x, y: m.y, fire: !!m.fire });
  }

  // Огонёк поджёг линию: через 0,8 с она сгорает
  ignite(line) {
    if (line.burn || line.gone) return;
    line.burn = this.t + 0.8;
    this.fx.push({ k: "ignite", x: line.b.position.x, y: line.b.position.y });
  }

  remove(list, i) {
    M.Composite.remove(this.world, list[i].b);
    list.splice(i, 1);
  }

  step() {
    if (this.state === "draw") return;
    const { Body, Engine } = M;
    const L = this.L,
      t = this.t,
      running = this.state === "run";

    // Источники опасностей
    for (const s of this.statics) {
      if (s.k === "nest" && running) {
        const due = Math.min(s.n, Math.floor((t - (s.delay ?? 0.3)) / (s.every || 0.3)) + 1);
        while (t >= (s.delay ?? 0.3) && s.made < due) s.made++, this.spawnBug(s);
      } else if (s.k === "rocks" && running) {
        const due = Math.min(s.n, Math.floor((t - (s.delay ?? 0.4)) / (s.every || 0.5)) + 1);
        while (t >= (s.delay ?? 0.4) && s.made < due) s.made++, this.spawnRock(s);
      } else if (s.k === "cannon") {
        s.flash = Math.max(0, s.flash - DT * 3);
        if (running && s.shot < (s.n || 3) && t >= (s.delay ?? 0.5) + s.shot * (s.every || 1.2)) s.shot++, this.fire(s);
      } else if (s.k === "mist" && running) {
        const due = Math.min(s.n || 6, Math.floor((t - (s.delay ?? 0.5)) / (s.every || 0.9)) + 1);
        while (t >= (s.delay ?? 0.5) && s.made < due) s.made++, this.spawnGhost(s);
      } else if (s.k === "pipe" && running) {
        const due = Math.min(s.n || 40, Math.floor((t - (s.delay ?? 0.4)) / (s.every || 0.12)) + 1);
        while (t >= (s.delay ?? 0.4) && s.made < due) s.made++, this.drip(s);
      }
    }
    for (const h of this.hazards) if (h.held && t >= h.at) this.release(h);

    // Жуки летят к ближайшему герою, покачиваясь; после конца уровня улетают
    const g = this.engine.gravity.scale * this.engine.gravity.y;
    for (const bug of this.bugs) {
      const b = bug.b;
      let goal = null,
        best = Infinity;
      for (const h of this.heroes) {
        const d = dist([h.b.position.x, h.b.position.y], [b.position.x, b.position.y]);
        if (d < best) (best = d), (goal = h.b.position);
      }
      let dx = 0,
        dy = -1;
      if (goal && this.state !== "won") {
        dx = goal.x - b.position.x;
        dy = goal.y - b.position.y;
      } else {
        dx = b.position.x < W / 2 ? -1 : 1;
        dy = -1.2;
      }
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      const wob = Math.sin(t * 7 + bug.phase) * 0.55;
      const acc = 0.00055 * bug.speed;
      Body.applyForce(b, b.position, {
        x: b.mass * (dx * acc - dy * acc * wob),
        y: b.mass * (dy * acc + dx * acc * wob - g),
      });
      const v = Body.getVelocity(b),
        sp = Math.hypot(v.x, v.y),
        max = 4.6 * bug.speed;
      if (sp > max) Body.setVelocity(b, { x: (v.x / sp) * max, y: (v.y / sp) * max });
    }

    // Привидения плывут к ближайшему герою, покачиваясь; после конца уровня тают и улетают вверх
    for (const gh of this.ghosts) {
      let goal = null,
        best = Infinity;
      for (const h of this.heroes) {
        const d = Math.hypot(h.b.position.x - gh.x, h.b.position.y - gh.y);
        if (d < best) (best = d), (goal = h.b.position);
      }
      let dx = 0,
        dy = -1;
      if (goal && running) (dx = goal.x - gh.x), (dy = goal.y - gh.y);
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      const wob = Math.sin(t * (gh.fire ? 6 : 3.2) + gh.phase) * (gh.fire ? 0.45 : 0.6);
      const sp = (gh.fire ? 150 : 105) * gh.speed * (running ? 1 : 1.4);
      const vx = (dx - dy * wob) * sp,
        vy = (dy + dx * wob) * sp;
      // плавный разгон: призрак не дёргается при смене цели
      gh.vx += (vx - gh.vx) * Math.min(1, DT * 4);
      gh.vy += (vy - gh.vy) * Math.min(1, DT * 4);
      gh.x += gh.vx * DT;
      gh.y += gh.vy * DT;
      Body.setPosition(gh.b, { x: gh.x, y: gh.y });
    }

    // Вентиляторы дуют на всё подвижное над собой
    for (const s of this.statics) {
      if (s.k !== "fan" || !running) continue;
      const top = s.y - (s.h || 300);
      for (const b of M.Composite.allBodies(this.world)) {
        // линии тяжёлые — ветер их не поднимает, только ягоды, звёздочки, капли и жуков
        if (b.isStatic || b.plugin?.k === "line") continue;
        const p = b.position;
        if (p.x > s.x - s.w / 2 && p.x < s.x + s.w / 2 && p.y < s.y && p.y > top) {
          const k = (s.power || 1.6) * (0.55 + (0.45 * (p.y - top)) / (s.y - top));
          const a = ((s.dir || 0) * Math.PI) / 180; // наклон потока: 0 — прямо вверх
          Body.applyForce(b, p, { x: b.mass * g * k * Math.sin(a), y: -b.mass * g * k * Math.cos(a) });
        }
      }
    }

    // Движущиеся платформы и двери
    for (const m of this.movers) {
      const k = 0.5 - 0.5 * Math.cos(((t / m.period + (m.phase || 0)) * Math.PI * 2));
      Body.setPosition(m.b, { x: m.base.x + m.dx * k, y: m.base.y + (m.dy || 0) * k }, true);
    }
    for (const btn of this.buttons) {
      if (btn.down) continue;
      const region = { min: { x: btn.x - btn.w / 2, y: btn.y - 16 }, max: { x: btn.x + btn.w / 2, y: btn.y + 2 } };
      const hit = M.Query.region(M.Composite.allBodies(this.world), region).some((b) => !b.isStatic && b.plugin?.k !== "bug" && b.plugin?.k !== "drop");
      if (hit) {
        btn.down = true;
        this.fx.push({ k: "click", x: btn.x, y: btn.y });
      }
    }
    for (const d of this.doors) {
      const open = this.buttons.some((b) => b.door === d.id && b.down);
      const was = d.open;
      d.open = Math.min(1, Math.max(0, d.open + (open ? DT * 2.2 : 0)));
      if (d.open !== was) Body.setPosition(d.b, { x: d.base.x + d.dx * d.open, y: d.base.y + d.dy * d.open }, true);
      else if (d.open === 1) Body.setVelocity(d.b, { x: 0, y: 0 });
    }

    // Линии в воде и лаве тонут медленно
    for (const line of this.lines) {
      if (this.inPool(line.b.position)) {
        const v = Body.getVelocity(line.b);
        Body.setVelocity(line.b, { x: v.x * 0.9, y: v.y * 0.9 });
      }
    }

    this.started.length = 0;
    Engine.update(this.engine, STEP_MS);
    this.t += DT;
    this.afterStep();
  }

  inPool(p) {
    for (const piece of this.L.terrain) {
      if (piece.m !== "water" && piece.m !== "lava") continue;
      if (p.x > piece.x && p.x < piece.x + piece.w && p.y > piece.y && p.y < piece.y + piece.h) return piece.m;
    }
    return null;
  }

  afterStep() {
    const { Body } = M;
    const running = this.state === "run";
    const springs = [];
    for (const pair of this.started) {
      const a = pair.bodyA.parent,
        b = pair.bodyB.parent;
      const ka = a.plugin?.k,
        kb = b.plugin?.k;
      this.contact(a, b, ka, kb, pair, springs, running);
      this.contact(b, a, kb, ka, pair, springs, running);
    }
    for (const [body, piece] of springs) {
      const ang = ((piece.plugin.a - 90) * Math.PI) / 180;
      const p = piece.plugin.spring;
      Body.setVelocity(body, { x: Math.cos(ang) * p, y: Math.sin(ang) * p });
      this.fx.push({ k: "spring", x: body.position.x, y: body.position.y });
    }

    // Подожжённые линии сгорают
    for (const line of this.lines) {
      if (line.burn && !line.gone && this.t >= line.burn) {
        line.gone = true;
        for (const c of line.cons) M.Composite.remove(this.world, c);
        M.Composite.remove(this.world, line.b);
        this.fx.push({ k: "burnt", line });
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (g.dead || this.t - g.born > 12 || g.y < -120 || g.y > H + 160 || g.x < -200 || g.x > W + 200) this.remove(this.ghosts, i);
    }
    // Капли и камни живут недолго
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.dead || this.t - d.born > 3 || d.b.position.y > H + 40) this.remove(this.drops, i);
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      const p = h.b.position;
      if (h.dead || (!h.held && this.t - (h.born ?? h.at) > h.life + 1) || p.y > H + 120 || p.x < -200 || p.x > W + 200) this.remove(this.hazards, i);
    }

    if (!running) return;
    const L = this.L;
    // Герой упал с края или утонул
    for (const h of this.heroes) {
      const p = h.b.position;
      if (p.y > H + 40 || p.x < -60 || p.x > W + 60) return this.end(false, h === this.target ? "lost" : "fall");
    }
    const tg = this.target;
    if (L.type === "shield") {
      if (this.t >= L.time) this.end(true, "safe");
      return;
    }
    // «Достань»
    const p = tg.b.position;
    if (tg.k === "berry" || tg.k === "star") {
      if (p.y > H + 40 || p.x < -60 || p.x > W + 60) return this.end(false, "lost");
    }
    if (tg.k === "star" && L.lock && dist([p.x, p.y], [L.lock[0], L.lock[1] - 36]) < 40) return this.end(true, "key");
    if (tg.k === "roll" && L.house && dist([p.x, p.y], [L.house[0], L.house[1] - 34]) < 42) return this.end(true, "home");
    const v = Body.getVelocity(tg.b);
    tg.still = Math.hypot(v.x, v.y) < 0.08 ? (tg.still || 0) + DT : 0;
    if (tg.still > 2.5 && !this.doors.some((d) => d.open > 0 && d.open < 1)) return this.end(false, "stuck");
    if (this.t > L.time) this.end(false, "time");
  }

  contact(a, b, ka, kb, pair, springs, running) {
    if (kb === "terrain" && b.plugin.spring && !a.isStatic && ka !== "drop") springs.push([a, b]);
    if (ka === "drop" && (kb === "terrain" || kb === "peg" || kb === "pipe" || kb === "cage" || kb === "fanbox")) {
      const d = this.drops.find((x) => x.b === a);
      if (d && !d.dead) {
        d.dead = true;
        this.fx.push({ k: "splash", x: a.position.x, y: a.position.y, lava: a.plugin.lava });
      }
    }
    if ((ka === "rock" || ka === "ball") && kb === "terrain" && b.plugin.deadly) {
      const h = this.hazards.find((x) => x.b === a);
      if (h) (h.dead = true), this.fx.push({ k: "splash", x: a.position.x, y: a.position.y, lava: b.plugin.m === "lava", big: true });
    }
    if (ka === "line" && (kb === "terrain" || kb === "line" || kb === "peg")) {
      const v = M.Body.getVelocity(a);
      if (Math.hypot(v.x, v.y) > 1.2) this.fx.push({ k: "thud", x: pair.collision.supports[0]?.x ?? a.position.x, y: pair.collision.supports[0]?.y ?? a.position.y });
    }
    if (ka === "bug" && kb === "line") this.fx.push({ k: "bonk", x: a.position.x, y: a.position.y });
    if ((ka === "rock" || ka === "ball" || ka === "icicle" || ka === "spike") && kb === "line") {
      const v = M.Body.getVelocity(a);
      if (Math.hypot(v.x, v.y) > 2) this.fx.push({ k: "knock", x: a.position.x, y: a.position.y, v: Math.hypot(v.x, v.y) });
    }
    if (ka === "ghost") {
      const g = this.ghosts.find((x) => x.b === a);
      if (g && !g.dead && kb === "line") {
        const line = this.lines.find((l) => l.b === b);
        if (line && !line.gone) {
          g.dead = true;
          this.fx.push({ k: g.fire ? "fizz" : "ghostpoof", x: g.x, y: g.y });
          if (g.fire) this.ignite(line);
          return;
        }
      }
    }
    if (!running) return;
    // Попадание в героя
    if (ka === "hero") {
      const h = this.heroes.find((x) => x.b === a);
      if (kb === "bug" || kb === "drop") return this.hurt(h, b, kb === "drop" ? (b.plugin.lava ? "lava" : "wet") : "bug");
      if (kb === "ghost") {
        const g = this.ghosts.find((x) => x.b === b);
        if (g && !g.dead) return this.hurt(h, b, g.fire ? "wisp" : "ghost");
      }
      if (kb === "rock" || kb === "ball" || kb === "icicle" || kb === "spike") {
        const va = M.Body.getVelocity(a),
          vb = M.Body.getVelocity(b);
        if (kb === "spike" || kb === "icicle" || Math.hypot(va.x - vb.x, va.y - vb.y) > 1.6) return this.hurt(h, b, kb);
      }
      if (kb === "terrain" && b.plugin.deadly) return this.hurt(h, b, b.plugin.m);
      if (kb === "berry") {
        this.target.eaten = true;
        this.fx.push({ k: "eat", x: b.position.x, y: b.position.y });
        return this.end(true, "eat");
      }
    }
    if ((ka === "berry" || ka === "star") && kb === "terrain" && b.plugin.deadly) return this.end(false, b.plugin.m === "spikes" ? "spikes" : "sunk");
  }

  hurt(h, by, why) {
    if (!h || this.state !== "run") return;
    h.hurt = 1;
    this.fx.push({ k: "hit", x: h.b.position.x, y: h.b.position.y, why });
    this.end(false, h === this.target ? "hurt" : why);
  }
}

// Свойства материалов земли
const MATS = {
  ground: { f: 0.9, fs: 0.6, e: 0 },
  stone: { f: 0.8, fs: 0.5, e: 0 },
  wood: { f: 0.8, fs: 0.5, e: 0 },
  sand: { f: 1, fs: 0.8, e: 0 },
  snow: { f: 0.7, fs: 0.5, e: 0 },
  ice: { f: 0.0, fs: 0.0, e: 0 },
  metal: { f: 0.3, fs: 0, e: 0 },
  cloud: { f: 0.8, fs: 1, e: 0 },
  spring: { f: 0.6, fs: 0.8, e: 0 },
  spikes: { f: 0.8, fs: 1, e: 0, deadly: true },
  lava: { f: 0, fs: 0, e: 0, deadly: true, sensor: true },
  water: { f: 0, fs: 0, e: 0, deadly: true, sensor: true },
};

// ---------- «Домой»: жители идут по нарисованным путям ----------
export const WALK = 150; // скорость жителя, единиц в секунду

export function patrolAt(p, t) {
  if (p.k === "orbit") {
    const a = ((p.a0 || 0) + (p.w || 60) * t) * (Math.PI / 180);
    return [p.c[0] + Math.cos(a) * p.R, p.c[1] + Math.sin(a) * p.R];
  }
  const len = dist(p.a, p.b),
    s = ((p.s0 || 0) * len + (p.v || 100) * t) % (2 * len);
  const k = s < len ? s / len : 2 - s / len;
  return [p.a[0] + (p.b[0] - p.a[0]) * k, p.a[1] + (p.b[1] - p.a[1]) * k];
}

class HomeSim {
  constructor(L) {
    this.L = L;
    this.t = 0;
    this.state = "draw";
    this.why = "";
    this.endT = 0;
    this.fx = [];
    this.inkUsed = 0;
    this.lines = [];
    this.walkers = L.walkers.map(([x, y, c, v]) => ({ x, y, c, v: v || WALK, path: null, s: 0, done: false, dir: 1 }));
    this.patrols = (L.patrols || []).map((p) => ({ ...p, r: p.r || 24, x: 0, y: 0 }));
    this.placePatrols();
  }
  get inkLeft() {
    return this.L.plan.limit - this.inkUsed;
  }
  placePatrols() {
    for (const p of this.patrols) {
      const [x, y] = patrolAt(p, this.t);
      p.dx = x - p.x;
      p.x = x;
      p.y = y;
    }
  }
  addPath(i, pts, len) {
    const w = this.walkers[i];
    const smooth = chaikin(pts, 2);
    w.path = smooth;
    w.cum = cumLengths(smooth);
    w.len = w.cum[w.cum.length - 1];
    this.lines.push({ walker: i, pts: smooth, c: w.c });
    this.inkUsed += len ?? polyLength(pts);
  }
  get ready() {
    return this.walkers.every((w) => w.path);
  }
  start() {
    if (this.state === "draw") this.state = "run";
  }
  end(won, why) {
    if (this.state !== "run") return;
    this.state = won ? "won" : "lost";
    this.why = why;
    this.endT = this.t;
    this.fx.push({ k: won ? "win" : "lose", why });
  }
  step() {
    if (this.state === "draw") return;
    this.t += DT;
    this.placePatrols();
    if (this.state !== "run") return;
    for (const w of this.walkers) {
      if (w.done || !w.path) continue;
      w.s = Math.min(w.len, w.s + w.v * DT);
      const [x, y] = pathAt(w.path, w.cum, w.s);
      if (Math.abs(x - w.x) > 0.05) w.dir = x > w.x ? 1 : -1;
      w.x = x;
      w.y = y;
      if (w.s >= w.len) {
        w.done = true;
        this.fx.push({ k: "home", x, y, c: w.c });
      }
    }
    const ws = this.walkers;
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i];
      if (a.done) continue;
      for (let j = i + 1; j < ws.length; j++) {
        const b = ws[j];
        if (!b.done && dist([a.x, a.y], [b.x, b.y]) < WALKER_R * 1.6) {
          a.hurt = b.hurt = 1;
          this.fx.push({ k: "crash", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          return this.end(false, "crash");
        }
      }
      for (const p of this.patrols)
        if (dist([a.x, a.y], [p.x, p.y]) < WALKER_R + p.r - 6) {
          a.hurt = 1;
          this.fx.push({ k: "crash", x: a.x, y: a.y });
          return this.end(false, "caught");
        }
    }
    if (ws.every((w) => w.done)) this.end(true, "home");
    else if (this.t > this.L.time) this.end(false, "time");
  }
}

// ---------- Прогон уровня целиком (проверки, заставка, подсчёт времени) ----------
// strokes — ломаные, как их «провёл бы палец». Возвращает итог и время.
export function play(L, strokes, { maxT = 0, keep = false } = {}) {
  const sim = createSim(L);
  const lines = [];
  const taken = [];
  let ink = L.plan.limit;
  for (const s of strokes) {
    const { res } = drawWith(L, lines, ink, s, taken);
    if (!res.ok) continue;
    if (L.type === "home") {
      sim.addPath(res.walker, res.pts, res.len);
      taken.push(res.walker);
      ink -= res.len;
    } else {
      sim.addStroke(res.pts, res.len);
      lines.push(res.pts);
      ink -= res.len;
    }
  }
  sim.start();
  const limit = maxT || L.time + 3;
  while (sim.state === "run" && sim.t < limit) sim.step();
  return { won: sim.state === "won", why: sim.why || "timeout", t: sim.t, ink: sim.inkUsed, sim: keep ? sim : null };
}
