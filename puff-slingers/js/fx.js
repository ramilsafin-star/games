// =====================================================
// ЭФФЕКТЫ: частицы, волны, молнии, всплывающий текст
// =====================================================
const FX = {
  list: [],
  texts: [],
  decals: [],
  max: 460,

  clear() {
    this.list.length = 0;
    this.texts.length = 0;
    this.decals.length = 0;
  },

  add(p) {
    p.life = 0;
    if (this.list.length < this.max) {
      this.list.push(p);
    } else {
      this.list[Math.floor(Math.random() * this.list.length)] = p;
    }
    return p;
  },

  sparks(x, y, color, count, speed, ttl) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random() * 0.75);
      this.add({
        k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 620, drag: 0.985,
        ttl: (ttl || 0.5) * (0.6 + Math.random() * 0.7), s0: 2.2 + Math.random() * 2.4, s1: 0.4, c: color
      });
    }
  },

  // Угловатые обломки материала с отскоком от земли
  chips(x, y, colors, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.3 + Math.random() * 0.8);
      const s = 3.5 + Math.random() * 7;
      this.add({
        k: 'chip', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 130, g: 1000, drag: 0.992,
        ttl: 0.9 + Math.random() * 0.9, w: s, h: s * (0.45 + Math.random() * 0.7),
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, c: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  },

  gears(x, y, count, speed, gold) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.add({
        k: 'gear', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, g: 1050, drag: 0.992,
        ttl: 1.1 + Math.random() * 0.9, r: 4.5 + Math.random() * 6.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20,
        c: gold ? '#ffc21f' : Math.random() > 0.5 ? '#c4bcff' : '#9a8cf0'
      });
    }
  },

  smoke(x, y, color, count, spread, ttl, size) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = spread * Math.random();
      this.add({
        k: 'smoke', x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 42, g: -18, drag: 0.97,
        ttl: (ttl || 0.9) * (0.7 + Math.random() * 0.6), s0: (size || 26) * (0.5 + Math.random() * 0.5), s1: (size || 26) * (1.5 + Math.random() * 1.2), c: color, a: 0.72
      });
    }
  },

  // Огненный шар взрыва
  fire(x, y, radius, count) {
    const pal = ['#fff0a8', '#ffd23f', '#ff9a1f', '#ff5a1f', '#ff2e4d'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const d = Math.random();
      const v = radius * (1.2 + d * 2.6);
      this.add({
        k: 'fire', x: x + Math.cos(a) * radius * 0.12, y: y + Math.sin(a) * radius * 0.12,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: -60, drag: 0.91,
        ttl: 0.32 + Math.random() * 0.42, s0: radius * (0.28 + Math.random() * 0.35), s1: radius * (0.7 + Math.random() * 0.75),
        c: pal[Math.min(pal.length - 1, Math.floor(d * pal.length))]
      });
    }
  },

  ring(x, y, r1, color, width, ttl) {
    this.add({ k: 'ring', x, y, r0: r1 * 0.12, r1, c: color, w: width || 9, ttl: ttl || 0.42 });
  },

  flash(x, y, size, color, ttl) {
    this.add({ k: 'flash', x, y, s0: size * 0.55, s1: size, c: color || '#ffffff', ttl: ttl || 0.16 });
  },

  lightning(x, y, radius, count, color) {
    for (let i = 0; i < count; i++) {
      this.add({ k: 'bolt', x, y, a: Math.random() * TAU, len: radius * (0.6 + Math.random() * 0.8), c: color || '#7ef9ff', ttl: 0.13 + Math.random() * 0.13 });
    }
  },

  confetti(x, y, count, spreadX, up) {
    const cols = ['#ff2e88', '#ffd23f', '#29f3ff', '#7cff5c', '#b78cff', '#ff7a1a', '#ffffff'];
    for (let i = 0; i < count; i++) {
      this.add({
        k: 'confetti', x: x + (Math.random() - 0.5) * spreadX, y,
        vx: (Math.random() - 0.5) * 340, vy: -(up || 260) * (0.5 + Math.random()), g: 320, drag: 0.985,
        ttl: 2 + Math.random() * 1.4, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12, phase: Math.random() * TAU, c: cols[Math.floor(Math.random() * cols.length)]
      });
    }
  },

  star(x, y, color) {
    this.add({ k: 'starp', x, y, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 140, g: 280, drag: 0.98, ttl: 0.6 + Math.random() * 0.5, s0: 5 + Math.random() * 7, s1: 0, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 9, c: color || '#ffe14d' });
  },

  scorch(x, y, w) {
    this.decals.push({ x, y, w, life: 0, ttl: 7 });
    if (this.decals.length > 8) this.decals.shift();
  },

  text(x, y, text, color, size, ttl) {
    this.texts.push({ x, y, text, color, size: size || 24, life: 0, ttl: ttl || 1.1, vy: -46 });
    if (this.texts.length > 16) this.texts.shift();
  },

  update(dt) {
    const f = dt * 60;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        const last = this.list.pop();
        if (i < this.list.length) this.list[i] = last;
        continue;
      }
      if (p.vx !== undefined) {
        p.vy += (p.g || 0) * dt;
        if (p.drag) {
          const d = Math.pow(p.drag, f);
          p.vx *= d;
          p.vy *= d;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
        // Обломки отскакивают от земли
        if ((p.k === 'chip' || p.k === 'gear' || p.k === 'spark') && p.y > GROUND_Y - 2) {
          p.y = GROUND_Y - 2;
          p.vy *= -0.42;
          p.vx *= 0.7;
          if (p.vr) p.vr *= 0.6;
        }
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.97, f);
      if (t.life >= t.ttl) this.texts.splice(i, 1);
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life += dt;
      if (d.life >= d.ttl) this.decals.splice(i, 1);
    }
  },

  drawDecals(ctx) {
    this.decals.forEach((d) => {
      const k = 1 - d.life / d.ttl;
      ctx.globalAlpha = 0.5 * k;
      ctx.drawImage(softSprite('#14060c'), d.x - d.w / 2, d.y - d.w * 0.09, d.w, d.w * 0.18);
    });
    ctx.globalAlpha = 1;
  },

  drawGear(ctx, r, color) {
    const teeth = 7;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1c1450';
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU;
      const rr = i % 2 ? r * 0.72 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#1c1450';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, TAU);
    ctx.fill();
  },

  drawNormal(ctx) {
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      const k = p.life / p.ttl;
      if (p.k === 'smoke') {
        const s = lerp(p.s0, p.s1, k);
        ctx.globalAlpha = p.a * (1 - k);
        ctx.drawImage(softSprite(p.c), p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.k === 'chip') {
        ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.strokeStyle = 'rgba(20,6,40,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.k === 'gear') {
        ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        this.drawGear(ctx, p.r, p.c);
        ctx.restore();
      } else if (p.k === 'confetti') {
        ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
        ctx.save();
        ctx.translate(p.x + Math.sin(p.life * 6 + p.phase) * 8, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.life * 8 + p.phase));
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.k === 'starp') {
        const s = lerp(p.s0, p.s1, k);
        ctx.globalAlpha = 1 - k * 0.3;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const a = (j / 10) * TAU - Math.PI / 2;
          const rr = j % 2 ? s * 0.45 : s;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  },

  drawGlow(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      const k = p.life / p.ttl;
      if (p.k === 'spark') {
        const s = lerp(p.s0, p.s1, k);
        ctx.globalAlpha = 1 - k * k;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
      } else if (p.k === 'fire') {
        const s = lerp(p.s0, p.s1, Math.sqrt(k));
        ctx.globalAlpha = (1 - k) * 0.95;
        ctx.drawImage(softSprite(p.c), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.k === 'ring') {
        const e = 1 - Math.pow(1 - k, 3);
        const r = lerp(p.r0, p.r1, e);
        ctx.globalAlpha = (1 - k) * 0.95;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = p.w * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
      } else if (p.k === 'flash') {
        const s = lerp(p.s0, p.s1, k);
        ctx.globalAlpha = 1 - k;
        ctx.drawImage(softSprite(p.c), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.k === 'bolt') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        let bx = p.x;
        let by = p.y;
        const n = 5;
        for (let j = 1; j <= n; j++) {
          const q = (j / n) * p.len;
          bx = p.x + Math.cos(p.a) * q + (Math.random() - 0.5) * 18;
          by = p.y + Math.sin(p.a) * q + (Math.random() - 0.5) * 18;
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },

  // Текст одинаково читаем и на телефоне, и на большом мониторе
  drawTexts(ctx, zoom) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      const k = t.life / t.ttl;
      const pop = k < 0.14 ? 0.4 + 1.1 * Math.sin((k / 0.14) * Math.PI * 0.62) : 1;
      const fontPx = (t.size * pop) / zoom;
      ctx.globalAlpha = k > 0.68 ? (1 - k) / 0.32 : 1;
      ctx.font = `900 ${fontPx}px Rubik, system-ui, sans-serif`;
      ctx.strokeStyle = '#1a0838';
      ctx.lineWidth = fontPx * 0.26;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
};
