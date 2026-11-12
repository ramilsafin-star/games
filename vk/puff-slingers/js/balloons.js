// =====================================================
// ШАРИКИ (мир «Воздушный парад»): держат на нитках гири, мосты, ботов и самого Гигабота.
// Лопаются от пуфа, шаровой молнии, взрыва, волны или летящего блока; то, что они держали, падает.
// Пуф пролетает шарик насквозь: это не удар, способность после него ещё работает.
// Подключается до game.js; переменные игры (world, flying, blocks…) берутся в момент вызова.
// =====================================================
const Balloons = {
  list: [],
  popped: 0,
  total: 0,

  clear() {
    this.list = [];
    this.popped = 0;
    this.total = 0;
  },

  alive() {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if (this.list[i].alive) n++;
    return n;
  },

  // Повесить тело (блок или бота, уже в мире) на n шариков с ниткой длины len
  hang(body, n, len) {
    const bot = body.label === 'bot';
    const half = bot ? body.circleRadius : body.h / 2;
    const width = bot ? 46 * (n - 1) : Math.max(46 * (n - 1), Math.min(body.w * 0.78, 64 * (n - 1)));
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -width / 2 + (width * i) / (n - 1);
      const bx = bot ? off * 0.3 : clamp(off, -body.w / 2 + 6, body.w / 2 - 6);
      const ax = body.position.x + off;
      const ay = body.position.y - half - len;
      // Длина нитки — как есть: тело не дёргается при старте уровня
      const length = Math.hypot(ax - (body.position.x + bx), ay - (body.position.y - half));
      const c = Matter.Constraint.create({
        pointA: { x: ax, y: ay }, bodyB: body, pointB: { x: bx, y: -half }, length, stiffness: 0.9, damping: 0.06
      });
      World.add(world, c);
      this.add({ x: ax, y: ay, body, c, owner: null, dx: off, len });
    }
    body.hung = (body.hung || 0) + n;
    return body;
  },

  // Гигабот на шариках: шарики летят вместе с ним, пока целы — он неуязвим
  lift(boss, n, len) {
    for (let i = 0; i < n; i++) {
      // Шарики над полоской здоровья босса: длинные нитки, чуть врозь
      const off = n === 1 ? 0 : -boss.circleRadius * 1.1 + (boss.circleRadius * 2.2 * i) / (n - 1);
      this.add({ x: boss.position.x + off, y: boss.position.y - boss.circleRadius - len, body: null, c: null, owner: boss, dx: off, len, born: 0 });
    }
  },

  add(o) {
    o.alive = true;
    o.away = 0;
    o.pop = 0;
    o.ph = Math.random() * TAU;
    o.color = BALLOON_COLORS[(this.total + Math.floor(o.x / 7)) % BALLOON_COLORS.length];
    o.born = o.born === undefined ? 1 : o.born;
    this.list.push(o);
    this.total++;
  },

  // Центр шарика (узелок снизу, в точке x, y)
  cx(bl) {
    return bl.x;
  },
  cy(bl) {
    return bl.y - BALLOON_R * 1.15;
  },

  // Куда привязана нитка внизу
  anchor(bl) {
    if (bl.owner) return { x: bl.owner.position.x + bl.dx * 0.35, y: bl.owner.position.y - bl.owner.circleRadius * 0.92 };
    if (bl.c) return { x: bl.body.position.x + bl.c.pointB.x, y: bl.body.position.y + bl.c.pointB.y };
    return null;
  },

  // Каждый шаг физики: шарики босса летят за ним, всё, что быстро летит, их лопает
  step() {
    const L = this.list;
    if (!L.length) return;
    for (let i = 0; i < L.length; i++) {
      const bl = L[i];
      if (!bl.alive) continue;
      if (bl.born < 1) bl.born = Math.min(1, bl.born + 1 / 40);
      if (bl.owner) {
        if (bl.owner.dead) {
          this.release(bl);
          continue;
        }
        bl.x = bl.owner.position.x + bl.dx;
        bl.y = bl.owner.position.y - bl.owner.circleRadius - bl.len;
      } else if (bl.body && bl.body.dead) {
        this.release(bl);
        continue;
      }
      // Пока шарик надувается, лопнуть его нельзя
      if (bl.born < 1) continue;
      const cx = this.cx(bl);
      const cy = this.cy(bl);
      const R = BALLOON_R * 1.05;
      let hit = false;
      for (let k = 0; k < flying.length && !hit; k++) {
        const h = flying[k];
        if (Math.hypot(h.position.x - cx, h.position.y - cy) < R + h.circleRadius) hit = true;
      }
      for (let k = 0; k < orbs.length && !hit; k++) {
        const o = orbs[k];
        if (Math.hypot(o.position.x - cx, o.position.y - cy) < R + o.circleRadius) hit = true;
      }
      // Летящий блок или бот тоже лопает шарик (но не тот, что на нём висит)
      if (!hit) {
        for (let k = 0; k < blocks.length && !hit; k++) {
          const b = blocks[k];
          if (b === bl.body || b.isSleeping || b.hung) continue;
          if (speedOf(b) > 2.5 && bodyHas(b, cx, cy, R)) hit = true;
        }
        for (let k = 0; k < bots.length && !hit; k++) {
          const b = bots[k];
          if (b === bl.body || b === bl.owner || b.isSleeping || b.hover || b.hung) continue;
          if (speedOf(b) > 2.5 && Math.hypot(b.position.x - cx, b.position.y - cy) < R + b.circleRadius) hit = true;
        }
      }
      if (hit) this.pop(bl);
    }
  },

  // Хлоп! Нитка рвётся, тело падает
  pop(bl) {
    if (!bl.alive) return;
    bl.alive = false;
    bl.pop = 0.001;
    const target = this.cut(bl);
    this.popped++;
    const cx = this.cx(bl);
    const cy = this.cy(bl);
    Sound.balloon();
    FX.ring(cx, cy, 62, bl.color, 8, 0.3);
    FX.flash(cx, cy, 70, '#ffffff', 0.12);
    FX.sparks(cx, cy, bl.color, 12, 340, 0.42);
    FX.confetti(cx, cy, quality > 0 ? 18 : 9, 26, 190);
    FX.text(cx, cy - 34, t('wordPop'), bl.color, 24, 0.8);
    addScore(BALLOON_PTS);
    addTrauma(0.08);
    if (!Save.seen.balloons) {
      Save.seen.balloons = true;
      Platform.requestSave();
    }
    if (bl.owner) bossLiftLost(bl.owner);
    else if (target) target.hung = Math.max(0, (target.hung || 0) - 1);
    Goals.onBalloon();
  },

  // Тело погибло: его шарики тихо улетают в небо
  release(bl) {
    bl.alive = false;
    bl.away = 0.001;
    this.cut(bl);
  },

  cut(bl) {
    if (bl.c) {
      World.remove(world, bl.c);
      bl.c = null;
    }
    const b = bl.body || bl.owner;
    if (b && b.isSleeping) Sleeping.set(b, false);
    return bl.body;
  },

  // Взрыв, рык, мороз: лопаются все шарики в радиусе
  blast(x, y, radius) {
    for (let i = 0; i < this.list.length; i++) {
      const bl = this.list[i];
      if (bl.alive && bl.born >= 1 && Math.hypot(this.cx(bl) - x, this.cy(bl) - y) < radius + BALLOON_R) this.pop(bl);
    }
  },

  // Сколько шариков лопнет на этом пути прицела (для бота-проверяльщика и подсветки)
  crossed(px, py, r) {
    if (!this.alive()) return 0;
    const seen = new Set();
    traceAim(px, py, r, (x, y) => {
      for (let i = 0; i < this.list.length; i++) {
        const bl = this.list[i];
        if (bl.alive && !seen.has(bl) && Math.hypot(this.cx(bl) - x, this.cy(bl) - y) < BALLOON_R + r) seen.add(bl);
      }
    });
    this.marked = seen;
    return seen.size;
  },

  // Улетающие и лопнувшие шарики живут ещё немного ради картинки
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const bl = this.list[i];
      if (bl.away > 0) {
        bl.away += dt;
        bl.y -= dt * 160;
        bl.x += Math.sin(bl.away * 3 + bl.ph) * dt * 30;
      }
      if (bl.pop > 0) bl.pop += dt;
      if (bl.away > 2.5 || bl.pop > 0.3) this.list.splice(i, 1);
    }
  },

  sway(bl, time) {
    return Math.sin(time * 1.7 + bl.ph) * 3.2;
  },

  // Двумерная отрисовка (запасной режим без 3D)
  draw2D(c, time) {
    for (let i = 0; i < this.list.length; i++) {
      const bl = this.list[i];
      if (bl.pop > 0) continue;
      const sw = this.sway(bl, time);
      const kx = bl.x + sw;
      const ky = bl.y;
      const a = bl.alive ? this.anchor(bl) : null;
      const fade = bl.away > 0 ? clamp(1 - bl.away / 2.5, 0, 1) : 1;
      c.globalAlpha = fade;
      if (a) {
        c.strokeStyle = 'rgba(255,255,255,0.85)';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(kx, ky);
        c.quadraticCurveTo((kx + a.x) / 2 + sw * 2, (ky + a.y) / 2, a.x, a.y);
        c.stroke();
      }
      const s = BALLOON_R * (bl.born < 1 ? 0.3 + bl.born * 0.7 : 1);
      const cx = kx;
      const cy = ky - s * 1.15;
      const g = c.createRadialGradient(cx - s * 0.35, cy - s * 0.45, s * 0.1, cx, cy, s * 1.25);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, bl.color);
      g.addColorStop(1, shade(bl.color, -0.35));
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(cx, cy, s, s * 1.17, 0, 0, TAU);
      c.fill();
      c.fillStyle = shade(bl.color, -0.3);
      c.beginPath();
      c.moveTo(kx - 4, ky + 2);
      c.lineTo(kx + 4, ky + 2);
      c.lineTo(kx, ky - 4);
      c.fill();
      if (this.marked && this.marked.has(bl) && pull) {
        c.strokeStyle = '#ffffff';
        c.lineWidth = 3;
        c.setLineDash([6, 5]);
        c.beginPath();
        c.arc(cx, cy, s + 9 + Math.sin(time * 9) * 2, 0, TAU);
        c.stroke();
        c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }
  }
};

// Чуть светлее или темнее цвет (#rrggbb, k от −1 до 1)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
