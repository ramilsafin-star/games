// =====================================================
// ГРАФИКА: спрайты пуфов, ботов и блоков.
// Всё рисуется кодом, поэтому чётко на любой плотности экрана.
// =====================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;

function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(str) {
  let h = 7;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const Art = {
  scale: 2,
  cache: new Map(),

  setScale(s) {
    if (Math.abs(s - this.scale) > 0.05) {
      this.scale = s;
      this.cache.clear();
    }
  },

  // Спрайт рисуется в мировых единицах, центр — (0, 0)
  sprite(key, w, h, paint) {
    let sp = this.cache.get(key);
    if (sp) return sp;
    const c = makeCanvas(w * this.scale, h * this.scale);
    const g = c.getContext('2d');
    g.scale(this.scale, this.scale);
    g.translate(w / 2, h / 2);
    paint(g);
    sp = { c, w, h };
    this.cache.set(key, sp);
    return sp;
  }
};

function stamp(ctx, sp, x, y) {
  ctx.drawImage(sp.c, x - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
}

function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Мягкие круглые спрайты: основа свечения, огня и дыма
const softCache = new Map();
function softSprite(color) {
  let c = softCache.get(color);
  if (c) return c;
  c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.38, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  // Прозрачный край без потемнения при обычном смешивании
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, 64, 64);
  softCache.set(color, c);
  return c;
}

// =====================================================
// ПУФЫ
// =====================================================
function furPath(g, r, lumps, rng, depth) {
  const step = TAU / lumps;
  g.beginPath();
  for (let i = 0; i < lumps; i++) {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step;
    const m = (a0 + a1) / 2;
    const base = r * 0.96;
    const tip = r * (1 + depth * (0.8 + rng() * 0.6));
    if (i === 0) g.moveTo(Math.cos(a0) * base, Math.sin(a0) * base);
    g.quadraticCurveTo(Math.cos(m) * tip, Math.sin(m) * tip, Math.cos(a1) * base, Math.sin(a1) * base);
  }
  g.closePath();
}

function outlined(g, line, width, fill) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = width;
  g.strokeStyle = line;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
}

function heroDecorBack(g, type, r, H) {
  const lw = Math.max(2, r * 0.12);
  if (type === 'rocky') {
    // Два коротких рога
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.moveTo(s * r * 0.3, -r * 0.82);
      g.quadraticCurveTo(s * r * 0.62, -r * 1.62, s * r * 0.98, -r * 1.34);
      g.quadraticCurveTo(s * r * 0.9, -r * 0.98, s * r * 0.8, -r * 0.55);
      g.closePath();
      const hg = g.createLinearGradient(0, -r * 1.5, 0, -r * 0.6);
      hg.addColorStop(0, '#fffbe0');
      hg.addColorStop(1, '#ffbf5e');
      outlined(g, H.line, lw, hg);
    });
  } else if (type === 'zip') {
    // Хохолок-молния
    [[-0.5, -1.72, -0.72], [0.02, -2.0, -0.28], [0.58, -1.62, 0.2]].forEach(([tx, ty, bx]) => {
      g.beginPath();
      g.moveTo(r * bx, -r * 0.82);
      g.lineTo(r * (tx - 0.12), r * (ty + 0.42));
      g.lineTo(r * (tx + 0.12), r * (ty + 0.36));
      g.lineTo(r * tx, r * ty);
      g.lineTo(r * (tx + 0.5), r * (ty + 0.7));
      g.lineTo(r * (tx + 0.24), r * (ty + 0.72));
      g.lineTo(r * (bx + 0.56), -r * 0.8);
      g.closePath();
      outlined(g, H.line, lw, '#ff9d1c');
    });
  } else if (type === 'trio') {
    // Маленькие ушки
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.arc(s * r * 0.68, -r * 0.88, r * 0.36, 0, TAU);
      outlined(g, H.line, lw, H.fur[1]);
      g.beginPath();
      g.arc(s * r * 0.68, -r * 0.88, r * 0.17, 0, TAU);
      g.fillStyle = '#ffb3dd';
      g.fill();
    });
  } else if (type === 'nimbus') {
    // Клубящееся облачко на макушке
    [[-0.5, -1.04, 0.42], [0.08, -1.26, 0.54], [0.62, -1.0, 0.4]].forEach(([x, y, s]) => {
      g.beginPath();
      g.arc(r * x, r * y, r * s, 0, TAU);
      outlined(g, H.line, lw, '#f6f0ff');
    });
  } else if (type === 'magma') {
    // Вулканические шипы
    [-0.7, -0.24, 0.24, 0.7].forEach((x, i) => {
      g.beginPath();
      g.moveTo(r * (x - 0.26), -r * 0.8);
      g.lineTo(r * (x * 1.2), -r * (1.5 + (i % 2) * 0.2));
      g.lineTo(r * (x + 0.26), -r * 0.8);
      g.closePath();
      outlined(g, H.line, lw, '#ff7a1a');
    });
  }
}

function paintHeroBody(g, type, r) {
  const H = HEROES[type];
  const rng = seeded(hashStr(type));
  const lw = Math.max(2.4, r * 0.15);

  // Лапки
  g.fillStyle = H.fur[2];
  g.strokeStyle = H.line;
  g.lineWidth = lw * 0.75;
  [-0.42, 0.42].forEach((x) => {
    g.beginPath();
    g.ellipse(r * x, r * 0.98, r * 0.28, r * 0.16, 0, 0, TAU);
    g.fill();
    g.stroke();
  });

  heroDecorBack(g, type, r, H);

  // Шерсть с объёмным градиентом
  const depth = type === 'nimbus' ? 0.2 : type === 'magma' ? 0.1 : 0.17;
  furPath(g, r, H.lumps, rng, depth);
  const grad = g.createRadialGradient(-r * 0.38, -r * 0.5, r * 0.1, 0, 0, r * 1.2);
  grad.addColorStop(0, H.fur[0]);
  grad.addColorStop(0.55, H.fur[1]);
  grad.addColorStop(1, H.fur[2]);
  outlined(g, H.line, lw, grad);

  // Светлое брюшко
  const belly = g.createRadialGradient(0, r * 0.45, 0, 0, r * 0.45, r * 0.62);
  belly.addColorStop(0, type === 'magma' ? 'rgba(255,122,26,0.75)' : 'rgba(255,255,255,0.7)');
  belly.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = belly;
  g.beginPath();
  g.arc(0, r * 0.45, r * 0.62, 0, TAU);
  g.fill();

  // Мелкие пряди
  g.strokeStyle = type === 'magma' ? 'rgba(255,160,70,0.5)' : 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1.1, r * 0.06);
  for (let i = 0; i < 9; i++) {
    const a = -2.6 + i * 0.28 + rng() * 0.1;
    const rr = r * (0.66 + rng() * 0.2);
    g.beginPath();
    g.arc(0, 0, rr, a, a + 0.16);
    g.stroke();
  }

  // Блик
  const hi = g.createRadialGradient(-r * 0.42, -r * 0.56, 0, -r * 0.42, -r * 0.56, r * 0.46);
  hi.addColorStop(0, 'rgba(255,255,255,0.8)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.beginPath();
  g.arc(-r * 0.42, -r * 0.56, r * 0.46, 0, TAU);
  g.fill();

  if (type === 'magma') {
    // Лавовые трещины
    g.strokeStyle = '#ff9a2e';
    g.lineWidth = Math.max(1.5, r * 0.08);
    g.lineCap = 'round';
    [[-0.8, 0.5, -0.45, 0.25, -0.5, 0.72], [0.82, 0.42, 0.5, 0.24, 0.42, 0.72], [-0.1, 0.92, 0.1, 0.62, -0.04, 0.42]].forEach((p) => {
      g.beginPath();
      g.moveTo(r * p[0], r * p[1]);
      g.lineTo(r * p[2], r * p[3]);
      g.lineTo(r * p[4], r * p[5]);
      g.stroke();
    });
  }
}

function heroBodySprite(type, r) {
  const size = r * 5;
  return Art.sprite(`hero:${type}:${r}`, size, size, (g) => paintHeroBody(g, type, r));
}

// Мимика: mood = angry | scream | happy | scared | hurt
function drawHeroFace(ctx, type, r, o) {
  const H = HEROES[type];
  const lookX = o.lookX === undefined ? 0.7 : o.lookX;
  const lookY = o.lookY === undefined ? 0 : o.lookY;
  const mood = o.mood || 'angry';
  const eyeR = r * 0.3;
  const ey = -r * 0.14;
  const blink = o.blink;
  const line = H.line;

  [-1, 1].forEach((side) => {
    const cx = side * r * 0.33 + r * 0.05;
    const R = eyeR * (mood === 'scared' || mood === 'scream' ? 1.12 : 1);
    if (blink || mood === 'hurt') {
      ctx.strokeStyle = line;
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (mood === 'hurt') {
        ctx.moveTo(cx - R * 0.7, ey - R * 0.6);
        ctx.lineTo(cx + R * 0.7, ey + R * 0.6);
        ctx.moveTo(cx + R * 0.7, ey - R * 0.6);
        ctx.lineTo(cx - R * 0.7, ey + R * 0.6);
      } else {
        ctx.moveTo(cx - R * 0.8, ey);
        ctx.quadraticCurveTo(cx, ey + R * 0.6, cx + R * 0.8, ey);
      }
      ctx.stroke();
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.4, r * 0.075);
    ctx.beginPath();
    ctx.arc(cx, ey, R, 0, TAU);
    ctx.fill();
    ctx.stroke();

    const px = cx + lookX * R * 0.4;
    const py = ey + lookY * R * 0.4;
    ctx.fillStyle = H.iris;
    ctx.beginPath();
    ctx.arc(px, py, R * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#10062e';
    ctx.beginPath();
    ctx.arc(px, py, R * 0.36, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px - R * 0.2, py - R * 0.24, R * 0.2, 0, TAU);
    ctx.fill();
  });

  // Брови
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(2.2, r * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  [-1, 1].forEach((side) => {
    const cx = side * r * 0.33 + r * 0.05;
    const by = ey - eyeR * 1.08;
    if (mood === 'angry') {
      ctx.moveTo(cx + side * eyeR * 0.95, by - r * 0.14);
      ctx.lineTo(cx - side * eyeR * 0.85, by + r * 0.13);
    } else if (mood === 'scared' || mood === 'scream') {
      ctx.moveTo(cx - side * eyeR * 0.7, by - r * 0.22);
      ctx.lineTo(cx + side * eyeR * 0.7, by - r * 0.04);
    } else if (mood === 'happy') {
      ctx.moveTo(cx - eyeR * 0.75, by - r * 0.03);
      ctx.quadraticCurveTo(cx, by - r * 0.2, cx + eyeR * 0.75, by - r * 0.03);
    }
  });
  ctx.stroke();

  // Рот
  const my = r * 0.42;
  ctx.lineWidth = Math.max(1.6, r * 0.09);
  ctx.strokeStyle = line;
  if (mood === 'scream' || mood === 'scared') {
    ctx.fillStyle = '#4a0a2c';
    ctx.beginPath();
    ctx.ellipse(r * 0.05, my, r * 0.26, r * (mood === 'scream' ? 0.3 : 0.18), 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff5e8a';
    ctx.beginPath();
    ctx.ellipse(r * 0.05, my + r * 0.13, r * 0.16, r * 0.09, 0, 0, TAU);
    ctx.fill();
  } else if (mood === 'happy') {
    ctx.fillStyle = '#4a0a2c';
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, my - r * 0.1);
    ctx.quadraticCurveTo(r * 0.05, my + r * 0.52, r * 0.4, my - r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.14, my - r * 0.1, r * 0.38, r * 0.1);
  } else if (mood === 'hurt') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.24, my);
    ctx.lineTo(-r * 0.08, my - r * 0.08);
    ctx.lineTo(r * 0.08, my + r * 0.04);
    ctx.lineTo(r * 0.3, my - r * 0.06);
    ctx.stroke();
  } else {
    // Задорная ухмылка с клыком
    ctx.beginPath();
    ctx.moveTo(-r * 0.24, my + r * 0.03);
    ctx.quadraticCurveTo(r * 0.08, my + r * 0.22, r * 0.36, my - r * 0.08);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(r * 0.1, my + r * 0.09);
    ctx.lineTo(r * 0.26, my + r * 0.03);
    ctx.lineTo(r * 0.2, my + r * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.stroke();
  }
}

function drawHero(ctx, type, x, y, r, o) {
  o = o || {};
  ctx.save();
  ctx.translate(x, y);
  if (o.stretch) {
    ctx.rotate(o.stretchAngle);
    ctx.scale(1 + o.stretch, 1 - o.stretch * 0.7);
    ctx.rotate(-o.stretchAngle);
  }
  if (o.squish) ctx.scale(1 + o.squish, 1 - o.squish);
  if (o.rot) ctx.rotate(o.rot);
  stamp(ctx, heroBodySprite(type, r), 0, 0);
  if (type === 'magma') {
    // Пульсирующая раскалённая сердцевина
    const pulse = 0.35 + 0.3 * Math.sin((o.time || 0) * (o.fuse ? 22 : 4));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(pulse + (o.fuse ? 0.45 : 0), 0, 1);
    const glow = r * 2.6;
    ctx.drawImage(softSprite('#ff6a1f'), -glow / 2, -glow / 2, glow, glow);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  drawHeroFace(ctx, type, r, o);
  ctx.restore();
}

// =====================================================
// БОТЫ
// =====================================================
function paintBotBody(g, r, mega) {
  const line = mega ? '#5a2c00' : '#1c1450';
  const lw = Math.max(2.6, r * 0.11);
  const c = mega ? ['#fff5b8', '#ffc21f', '#b86a00'] : ['#e9e4ff', '#9a8cf0', '#4a3bb0'];
  const metal = mega ? '#ffdd66' : '#c4bcff';

  if (mega) {
    // Шипы брони Мегабота
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42;
      g.beginPath();
      g.moveTo(Math.cos(a - 0.15) * r * 0.96, Math.sin(a - 0.15) * r * 0.96);
      g.lineTo(Math.cos(a) * r * 1.34, Math.sin(a) * r * 1.34);
      g.lineTo(Math.cos(a + 0.15) * r * 0.96, Math.sin(a + 0.15) * r * 0.96);
      g.closePath();
      outlined(g, line, lw * 0.8, '#ff4d7e');
    }
  }

  // Боковые болты-уши
  [-1, 1].forEach((s) => {
    roundRectPath(g, s > 0 ? r * 0.88 : -r * 1.2, -r * 0.28, r * 0.32, r * 0.5, r * 0.1);
    outlined(g, line, lw * 0.8, metal);
  });

  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  const grad = g.createRadialGradient(-r * 0.4, -r * 0.5, r * 0.08, 0, 0, r * 1.1);
  grad.addColorStop(0, c[0]);
  grad.addColorStop(0.55, c[1]);
  grad.addColorStop(1, c[2]);
  outlined(g, line, lw, grad);

  // Шов корпуса и заклёпки
  g.strokeStyle = 'rgba(20,10,60,0.35)';
  g.lineWidth = Math.max(1, r * 0.05);
  g.beginPath();
  g.arc(0, 0, r * 0.8, 0.6, Math.PI - 0.6);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 6; i++) {
    const a = 0.7 + (i / 5) * (Math.PI - 1.4);
    g.beginPath();
    g.arc(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88, Math.max(0.9, r * 0.04), 0, TAU);
    g.fill();
  }
  // Блик металла
  const hi = g.createRadialGradient(-r * 0.4, -r * 0.62, 0, -r * 0.4, -r * 0.62, r * 0.42);
  hi.addColorStop(0, 'rgba(255,255,255,0.9)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.beginPath();
  g.arc(-r * 0.4, -r * 0.62, r * 0.42, 0, TAU);
  g.fill();
}

function drawBot(ctx, b, time) {
  const r = b.circleRadius;
  const mega = b.isMega;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);

  // Антенны со светодиодом
  const wob = Math.sin(time * 6 + b.id) * r * 0.06 + b.hitFlash * r * 0.3 * Math.sin(time * 40);
  const ants = mega ? [-0.28, 0.28] : [0.12];
  ants.forEach((ax, i) => {
    const base = ax * r;
    const tx = base * 1.25 + wob;
    const ty = -r * (mega ? 1.62 : 1.5);
    ctx.strokeStyle = '#1c1450';
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(base, -r * 0.9);
    ctx.quadraticCurveTo(base, -r * 1.25, tx, ty);
    ctx.stroke();
    const led = (Math.sin(time * 5 + i * 2 + b.id) + 1) / 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + led * 0.6;
    const gs = r * 0.95;
    ctx.drawImage(softSprite('#ff2e88'), tx - gs / 2, ty - gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = led > 0.5 ? '#ffd0e6' : '#ff2e88';
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(2, r * 0.13), 0, TAU);
    ctx.fill();
  });

  stamp(ctx, Art.sprite(`bot:${r}:${mega ? 1 : 0}`, r * 3.2, r * 3.2, (g) => paintBotBody(g, r, mega)), 0, 0);

  // Визор
  const vw = r * 1.32;
  const vh = r * 0.66;
  const vy = -r * 0.26;
  roundRectPath(ctx, -vw / 2, vy - vh / 2, vw, vh, vh * 0.48);
  const vg = ctx.createLinearGradient(0, vy - vh / 2, 0, vy + vh / 2);
  vg.addColorStop(0, '#120a3a');
  vg.addColorStop(1, '#2d1a70');
  ctx.fillStyle = vg;
  ctx.fill();
  ctx.strokeStyle = '#0c0628';
  ctx.lineWidth = Math.max(1.4, r * 0.06);
  ctx.stroke();

  // Глаз-светодиод следит за пуфом
  const flicker = b.hp < b.maxHp * 0.5 && Math.sin(time * 37 + b.id) > 0.72;
  const scared = b.scared > 0.5;
  const eyeColor = scared ? '#ffe14d' : mega ? '#ff3b3b' : '#ff2e88';
  const ex = clamp(b.lookX || 0, -1, 1) * vw * 0.27;
  const ey = vy + clamp(b.lookY || 0, -1, 1) * vh * 0.1;
  const er = vh * (scared ? 0.42 : 0.33);
  if (!flicker) {
    ctx.globalCompositeOperation = 'lighter';
    const gs = er * 5;
    ctx.drawImage(softSprite(eyeColor), ex - gs / 2, ey - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, er * 0.5, 0, TAU);
    ctx.fill();
  }

  // Злая «бровь»-козырёк (исчезает, когда бот боится)
  if (!scared) {
    ctx.strokeStyle = mega ? '#7a3c00' : '#1c1450';
    ctx.lineWidth = Math.max(2.4, r * 0.13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-vw * 0.48, vy - vh * 0.64);
    ctx.lineTo(vw * 0.02, vy - vh * 0.28);
    ctx.lineTo(vw * 0.48, vy - vh * 0.64);
    ctx.stroke();
  }

  // Рот-решётка: дёргается, когда бот смеётся над промахом
  const mouthY = r * 0.48 + (b.laugh > 0 ? Math.sin(time * 34) * r * 0.05 : 0);
  const mouthH = r * (b.laugh > 0 ? 0.36 : scared ? 0.3 : 0.2);
  const mouthW = r * 0.78;
  roundRectPath(ctx, -mouthW / 2, mouthY - mouthH / 2, mouthW, mouthH, r * 0.06);
  ctx.fillStyle = '#120a3a';
  ctx.fill();
  ctx.strokeStyle = '#0c0628';
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const mx = -mouthW / 2 + (mouthW * i) / 4;
    ctx.moveTo(mx, mouthY - mouthH / 2 + 1);
    ctx.lineTo(mx, mouthY + mouthH / 2 - 1);
  }
  ctx.stroke();

  // Трещины при повреждении
  const hpK = b.hp / b.maxHp;
  if (hpK < 0.72) {
    ctx.strokeStyle = 'rgba(14,6,40,0.85)';
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, r * 0.1);
    ctx.lineTo(-r * 0.5, r * 0.28);
    ctx.lineTo(-r * 0.56, r * 0.52);
    ctx.lineTo(-r * 0.3, r * 0.62);
    if (hpK < 0.4) {
      ctx.moveTo(r * 0.82, -r * 0.42);
      ctx.lineTo(r * 0.52, -r * 0.62);
      ctx.lineTo(r * 0.36, -r * 0.5);
      ctx.moveTo(r * 0.78, r * 0.3);
      ctx.lineTo(r * 0.5, r * 0.24);
      ctx.lineTo(r * 0.36, r * 0.46);
    }
    ctx.stroke();
  }

  // Белая вспышка при попадании
  if (b.hitFlash > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = b.hitFlash * 0.75;
    const gs = r * 3;
    ctx.drawImage(softSprite('#ffffff'), -gs / 2, -gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

// =====================================================
// БЛОКИ
// =====================================================
function paintWood(g, w, h) {
  const rng = seeded(hashStr(`w${w}x${h}`));
  const vertical = h > w;
  const x = -w / 2;
  const y = -h / 2;
  roundRectPath(g, x, y, w, h, 5);
  const grad = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#ffcf7a');
  grad.addColorStop(0.5, '#f5a13f');
  grad.addColorStop(1, '#d6731f');
  outlined(g, '#6b3210', 3, grad);

  g.save();
  roundRectPath(g, x + 1, y + 1, w - 2, h - 2, 4);
  g.clip();
  // Волокна дерева
  g.strokeStyle = 'rgba(120,60,15,0.42)';
  g.lineWidth = 1.2;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  for (let i = 1; i <= 4; i++) {
    const o = -short / 2 + (short * i) / 5 + (rng() - 0.5) * 2;
    g.beginPath();
    for (let s = -long / 2; s <= long / 2; s += 10) {
      const q = o + Math.sin(s * 0.05 + i * 1.7) * 1.5;
      if (vertical) g.lineTo(q, s);
      else g.lineTo(s, q);
    }
    g.stroke();
  }
  // Сучок
  const kx = (rng() - 0.5) * long * 0.5;
  g.fillStyle = 'rgba(110,55,15,0.5)';
  g.beginPath();
  if (vertical) g.ellipse(0, kx, short * 0.14, short * 0.22, 0, 0, TAU);
  else g.ellipse(kx, 0, short * 0.22, short * 0.14, 0, 0, TAU);
  g.fill();
  // Блик и тень по краям
  g.strokeStyle = 'rgba(255,245,200,0.75)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + 3, y + 2.5);
  g.lineTo(x + w - 3, y + 2.5);
  g.stroke();
  g.restore();

  // Гвозди
  g.fillStyle = '#ffe9b0';
  g.strokeStyle = '#6b3210';
  g.lineWidth = 0.8;
  const nx = vertical ? 0 : long / 2 - 7;
  const ny = vertical ? long / 2 - 7 : 0;
  [-1, 1].forEach((s) => {
    g.beginPath();
    g.arc(nx * s, ny * s, 2, 0, TAU);
    g.fill();
    g.stroke();
  });
}

function paintStone(g, w, h) {
  const rng = seeded(hashStr(`s${w}x${h}`));
  const x = -w / 2;
  const y = -h / 2;
  roundRectPath(g, x, y, w, h, 4);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#d8def8');
  grad.addColorStop(0.5, '#a5aedd');
  grad.addColorStop(1, '#6f78b0');
  outlined(g, '#2e3268', 3, grad);

  g.save();
  roundRectPath(g, x + 1, y + 1, w - 2, h - 2, 3);
  g.clip();
  // Кладка
  const vertical = h > w;
  const bw = vertical ? w : 34;
  const bh = vertical ? 28 : h / 2;
  g.strokeStyle = 'rgba(40,44,100,0.5)';
  g.lineWidth = 1.5;
  let row = 0;
  for (let yy = y + bh; yy < y + h; yy += bh) {
    g.beginPath();
    g.moveTo(x, yy);
    g.lineTo(x + w, yy);
    g.stroke();
  }
  for (let yy = y; yy < y + h; yy += bh, row++) {
    for (let xx = x + (row % 2 ? bw / 2 : bw); xx < x + w; xx += bw) {
      if (vertical && row % 2 === 0) continue;
      g.beginPath();
      g.moveTo(xx, yy);
      g.lineTo(xx, yy + bh);
      g.stroke();
    }
  }
  // Крапинки
  g.fillStyle = 'rgba(255,255,255,0.32)';
  for (let i = 0; i < (w * h) / 110; i++) {
    g.fillRect(x + rng() * w, y + rng() * h, 1.6, 1.6);
  }
  g.fillStyle = 'rgba(30,30,80,0.22)';
  for (let i = 0; i < (w * h) / 110; i++) {
    g.fillRect(x + rng() * w, y + rng() * h, 1.6, 1.6);
  }
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + 2, y + 2.5);
  g.lineTo(x + w - 2, y + 2.5);
  g.stroke();
  g.restore();
}

function paintIce(g, w, h) {
  const rng = seeded(hashStr(`i${w}x${h}`));
  const x = -w / 2;
  const y = -h / 2;
  roundRectPath(g, x, y, w, h, 5);
  const grad = g.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, 'rgba(225,253,255,0.96)');
  grad.addColorStop(0.5, 'rgba(120,226,255,0.86)');
  grad.addColorStop(1, 'rgba(40,160,245,0.9)');
  outlined(g, '#0f6fc9', 3, grad);

  g.save();
  roundRectPath(g, x + 1, y + 1, w - 2, h - 2, 4);
  g.clip();
  // Грани кристалла
  g.fillStyle = 'rgba(255,255,255,0.28)';
  const long = Math.max(w, h);
  for (let i = 0; i < 3; i++) {
    const p = -long / 2 + rng() * long;
    g.beginPath();
    if (h > w) {
      g.moveTo(x, p);
      g.lineTo(x + w, p - 16);
      g.lineTo(x + w, p + 2);
      g.lineTo(x, p + 18);
    } else {
      g.moveTo(p, y);
      g.lineTo(p + 18, y);
      g.lineTo(p + 2, y + h);
      g.lineTo(p - 16, y + h);
    }
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(x + 3, y + 3);
  g.lineTo(x + w * 0.62, y + 3);
  g.moveTo(x + 3, y + 3);
  g.lineTo(x + 3, y + h * 0.5);
  g.stroke();
  // Искорка
  const sx = x + w * 0.72;
  const sy = y + h * 0.28;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(sx, sy - 4.5);
  g.lineTo(sx + 1.2, sy - 1.2);
  g.lineTo(sx + 4.5, sy);
  g.lineTo(sx + 1.2, sy + 1.2);
  g.lineTo(sx, sy + 4.5);
  g.lineTo(sx - 1.2, sy + 1.2);
  g.lineTo(sx - 4.5, sy);
  g.lineTo(sx - 1.2, sy - 1.2);
  g.closePath();
  g.fill();
  g.restore();
}

function paintBoom(g, w, h) {
  const x = -w / 2;
  const y = -h / 2;
  roundRectPath(g, x, y, w, h, 5);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#ff7a4d');
  grad.addColorStop(1, '#d11f42');
  outlined(g, '#5a0a1f', 3, grad);

  g.save();
  roundRectPath(g, x + 1.5, y + 1.5, w - 3, h - 3, 4);
  g.clip();
  // Предупреждающие полосы сверху и снизу
  [y, y + h - 8].forEach((sy) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(x, sy, w, 8);
    g.fillStyle = '#1e0d2e';
    for (let sx = x - 8; sx < x + w + 8; sx += 11) {
      g.beginPath();
      g.moveTo(sx, sy + 8);
      g.lineTo(sx + 5.5, sy + 8);
      g.lineTo(sx + 11, sy);
      g.lineTo(sx + 5.5, sy);
      g.closePath();
      g.fill();
    }
  });
  g.restore();

  // Значок-вспышка: понятно без единого слова на любом языке
  const R = Math.min(w, h) * 0.3;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - Math.PI / 2;
    const rr = i % 2 ? R * 0.52 : R;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  outlined(g, '#5a0a1f', 2.2, '#ffe14d');
  g.beginPath();
  g.arc(0, 0, R * 0.26, 0, TAU);
  g.fillStyle = '#ff5a3c';
  g.fill();
}

function blockSprite(mat, w, h) {
  return Art.sprite(`b:${mat}:${w}:${h}`, w + 8, h + 8, (g) => {
    if (mat === 'wood') paintWood(g, w, h);
    else if (mat === 'stone') paintStone(g, w, h);
    else if (mat === 'ice') paintIce(g, w, h);
    else paintBoom(g, w, h);
  });
}

function drawBlock(ctx, b, time) {
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  const sp = blockSprite(b.mat, b.w, b.h);
  stamp(ctx, sp, 0, 0);

  // Трещины в зависимости от урона (рисунок свой у каждого блока)
  const k = b.hp / b.maxHp;
  if (b.mat !== 'boom' && k < 0.8) {
    ctx.strokeStyle = b.mat === 'ice' ? 'rgba(255,255,255,0.95)' : 'rgba(30,14,40,0.75)';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    const n = k < 0.35 ? b.cracks.length : k < 0.6 ? 2 : 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const c = b.cracks[i];
      ctx.moveTo(c[0], c[1]);
      for (let j = 2; j < c.length; j += 2) ctx.lineTo(c[j], c[j + 1]);
    }
    ctx.stroke();
  }

  if (b.mat === 'boom') {
    // Ящик пульсирует, привлекая взгляд
    const pulse = 0.14 + 0.14 * Math.sin(time * 5 + b.id);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pulse;
    const gs = Math.max(b.w, b.h) * 1.9;
    ctx.drawImage(softSprite('#ff7a1a'), -gs / 2, -gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  if (b.hitFlash > 0.02) {
    ctx.globalAlpha = b.hitFlash * 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function makeCracks(w, h, rng) {
  const cracks = [];
  for (let i = 0; i < 4; i++) {
    const c = [];
    const vertical = h > w;
    let x = (rng() - 0.5) * w * 0.8;
    let y = (rng() - 0.5) * h * 0.8;
    c.push(x, y);
    for (let j = 0; j < 4; j++) {
      x = clamp(x + (rng() - 0.5) * (vertical ? w * 0.7 : 26), -w / 2 + 2, w / 2 - 2);
      y = clamp(y + (rng() - 0.5) * (vertical ? 26 : h * 0.7), -h / 2 + 2, h / 2 - 2);
      c.push(x, y);
    }
    cracks.push(c);
  }
  return cracks;
}

// Шаровая молния Нимбуса
function drawOrb(ctx, o, time) {
  const r = o.circleRadius;
  ctx.save();
  ctx.translate(o.position.x, o.position.y);
  ctx.globalCompositeOperation = 'lighter';
  const gs = r * 5;
  ctx.drawImage(softSprite('#7a5cff'), -gs / 2, -gs / 2, gs, gs);
  ctx.drawImage(softSprite('#6fe8ff'), -gs / 3, -gs / 3, gs / 1.5, gs / 1.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#bff4ff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = time * 9 + (i * TAU) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    ctx.lineTo(Math.cos(a + 0.5) * r * 1.05, Math.sin(a + 0.5) * r * 1.05);
    ctx.lineTo(Math.cos(a + 0.2) * r * 1.5, Math.sin(a + 0.2) * r * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

// =====================================================
// РОГАТКА
// =====================================================
const SLING_TIP_BACK = { x: SLING_X + 36, y: SLING_Y - 26 };
const SLING_TIP_FRONT = { x: SLING_X - 36, y: SLING_Y - 22 };

function paintSlingPart(g, front) {
  const base = { x: 0, y: GROUND_Y + 12 - SLING_Y };
  const fork = { x: 0, y: 50 };
  const tip = front ? { x: -36, y: -22 } : { x: 36, y: -26 };
  const stroke = (color, width, offset) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    if (front) {
      g.moveTo(fork.x + offset, fork.y);
      g.quadraticCurveTo(tip.x + offset - 8, fork.y - 18, tip.x + offset, tip.y);
    } else {
      g.moveTo(base.x + offset, base.y);
      g.lineTo(fork.x + offset, fork.y);
      g.quadraticCurveTo(tip.x + offset + 8, fork.y - 18, tip.x + offset, tip.y);
    }
    g.stroke();
  };
  stroke('#3a1b0a', 20, 0);
  stroke(front ? '#c9782f' : '#a65f24', 14, 0);
  stroke(front ? '#ffc47a' : '#d98e45', 4, -3);

  // Цветная обмотка
  g.strokeStyle = '#ff2e88';
  g.lineWidth = 16;
  g.lineCap = 'butt';
  g.beginPath();
  if (front) {
    g.moveTo(tip.x + 1, tip.y + 12);
    g.lineTo(tip.x, tip.y + 4);
  } else {
    g.moveTo(tip.x - 1, tip.y + 12);
    g.lineTo(tip.x, tip.y + 4);
    g.moveTo(0, fork.y + 20);
    g.lineTo(0, fork.y + 30);
  }
  g.stroke();
}

function slingSprite(front) {
  const w = 130;
  const h = (GROUND_Y + 20 - SLING_Y) * 2 + 40;
  return Art.sprite(front ? 'sling:f' : 'sling:b', w, h, (g) => paintSlingPart(g, front));
}

// Значок руки-подсказки на обучающем уровне
const HAND_PATH = (typeof Path2D !== 'undefined')
  ? new Path2D('M-5 -24 a5.5 5.5 0 0 1 11 0 v15 l13 3 a6 6 0 0 1 4.5 7 l-3 15 a6 6 0 0 1 -6 5 h-15 a6 6 0 0 1 -5 -3 l-13 -19 a4.5 4.5 0 0 1 7 -5.5 l6.5 7 z')
  : null;
