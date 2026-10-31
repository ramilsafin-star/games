// =====================================================
// ГРАФИКА: машинки с глазами-фарами, предметы и декорации.
// Всё рисуется кодом и остаётся чётким на экране iPad.
// =====================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const LINE = '#2a1458';

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
  sprite(key, w, h, paint) {
    let sp = this.cache.get(key);
    if (sp) return sp;
    const c = makeCanvas(w * this.scale, h * this.scale);
    const g = c.getContext('2d');
    g.scale(this.scale, this.scale);
    g.translate(w / 2, h / 2);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    paint(g);
    sp = { c, w, h };
    this.cache.set(key, sp);
    return sp;
  }
};

function stamp(ctx, sp, x, y) {
  ctx.drawImage(sp.c, x - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
}

const softCache = new Map();
function softSprite(color) {
  let c = softCache.get(color);
  if (c) return c;
  c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, 64, 64);
  softCache.set(color, c);
  return c;
}

// Плавная замкнутая фигура через точки: у всех машинок мягкие игрушечные формы
function blob(g, pts) {
  const n = pts.length;
  g.beginPath();
  const mx = (pts[n - 1][0] + pts[0][0]) / 2;
  const my = (pts[n - 1][1] + pts[0][1]) / 2;
  g.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  g.closePath();
}

function ink(g, fill, width) {
  g.lineWidth = width === undefined ? 5 : width;
  g.strokeStyle = LINE;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
}

function circle(g, x, y, r, fill, width) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  if (width === 0) {
    g.fillStyle = fill;
    g.fill();
  } else {
    ink(g, fill, width);
  }
}

function vGrad(g, y0, y1, a, b, c) {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, a);
  if (c) {
    grad.addColorStop(0.55, b);
    grad.addColorStop(1, c);
  } else {
    grad.addColorStop(1, b);
  }
  return grad;
}

function glass(g, pts) {
  blob(g, pts);
  const ys = pts.map((p) => p[1]);
  ink(g, vGrad(g, Math.min(...ys), Math.max(...ys), '#e9fbff', '#8fe0ff', '#4cb6f2'), 4);
  // Блик на стекле
  g.save();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  const x0 = Math.min(...pts.map((p) => p[0]));
  const y0 = Math.min(...ys);
  g.beginPath();
  g.moveTo(x0 + 6, y0 + 34);
  g.lineTo(x0 + 22, y0 - 2);
  g.lineTo(x0 + 32, y0 - 2);
  g.lineTo(x0 + 14, y0 + 40);
  g.closePath();
  g.fill();
  g.restore();
}

function starPath(g, x, y, r, inner) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * (inner || 0.5) : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function roundClip(g, x, y, w, h) {
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
}

function drawShadow(ctx, x, y, s, k) {
  ctx.globalAlpha = 0.28 * k;
  ctx.fillStyle = '#1a0838';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 150 * s * lerp(0.7, 1, k), 14 * Math.min(s, 1.2), 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// =====================================================
// ПРЕДМЕТЫ НА ДОРОГЕ
// =====================================================
function drawStar(ctx, x, y, size, time) {
  const sp = Art.sprite('star', 120, 120, (g) => {
    starPath(g, 0, 0, 46, 0.56);
    ink(g, vGrad(g, -46, 40, '#fff9a8', '#ffd23f', '#ff9d1c'), 6);
    circle(g, -11, -5, 5, LINE, 0);
    circle(g, 11, -5, 5, LINE, 0);
    g.beginPath();
    g.arc(0, 2, 9, 0.25, Math.PI - 0.25);
    g.lineWidth = 3.5;
    g.strokeStyle = LINE;
    g.stroke();
  });
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 6);
  const gs = size * 2.1;
  ctx.drawImage(softSprite('#ffd23f'), -gs / 2, -gs / 2, gs, gs);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(Math.sin(time * 3) * 0.2);
  const k = size / 92;
  ctx.scale(k, k);
  stamp(ctx, sp, 0, 0);
  ctx.restore();
}

const ITEM_ART = {
  cone: (g) => {
    g.beginPath();
    g.moveTo(-34, 2);
    g.lineTo(-11, -72);
    g.lineTo(11, -72);
    g.lineTo(34, 2);
    g.closePath();
    ink(g, vGrad(g, -72, 2, '#ffb35c', '#ff6a1f'));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-23, -30);
    g.lineTo(-17, -50);
    g.lineTo(17, -50);
    g.lineTo(23, -30);
    g.closePath();
    g.fill();
    blob(g, [[-48, -6], [48, -6], [48, 8], [-48, 8]]);
    ink(g, '#ff8a1f');
  },
  box: (g) => {
    blob(g, [[-44, -84], [44, -84], [44, 2], [-44, 2]]);
    ink(g, vGrad(g, -84, 2, '#ffcf7a', '#e8893a'));
    g.strokeStyle = 'rgba(107,50,16,0.65)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-34, -74);
    g.lineTo(34, -8);
    g.moveTo(34, -74);
    g.lineTo(-34, -8);
    g.stroke();
  },
  gift: (g) => {
    blob(g, [[-46, -70], [46, -70], [46, 2], [-46, 2]]);
    ink(g, vGrad(g, -70, 2, '#ff8ad0', '#ff2e88'));
    g.fillStyle = '#ffe14d';
    g.fillRect(-9, -72, 18, 74);
    g.fillRect(-46, -42, 92, 15);
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.ellipse(s * 19, -82, 19, 12, s * 0.5, 0, TAU);
      ink(g, '#ffe14d', 4);
    });
    circle(g, 0, -80, 9, '#ffb31a', 4);
  }
};

function itemSprite(kind) {
  return Art.sprite(`item:${kind}`, 180, 240, (g) => {
    g.translate(0, 70);
    ITEM_ART[kind](g);
  });
}

function drawItem(ctx, kind, x, y, s, rot) {
  const sp = itemSprite(kind);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (rot) {
    ctx.translate(0, -36);
    ctx.rotate(rot);
    ctx.translate(0, 36);
  }
  ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2 - 70, sp.w, sp.h);
  ctx.restore();
}

function drawPuddle(ctx, x, y, s, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#1f7bff';
  ctx.strokeStyle = '#0a4fc9';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 100, 25, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#7fe0ff';
  ctx.beginPath();
  ctx.ellipse(-20, -5, 58 + Math.sin(time * 4) * 7, 11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-46, -9, 13, 4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawRamp(ctx, x, y, s) {
  const sp = Art.sprite('ramp', 300, 170, (g) => {
    g.translate(0, 70);
    g.beginPath();
    g.moveTo(-126, 2);
    g.lineTo(112, -90);
    g.lineTo(126, -82);
    g.lineTo(126, 4);
    g.closePath();
    ink(g, vGrad(g, -90, 4, '#ffe14d', '#ff9a1f'), 6);
    // Стрелки вверх
    g.fillStyle = '#ffffff';
    [-58, 8, 72].forEach((ax) => {
      const ay = -8 - (ax + 126) * 0.285;
      g.beginPath();
      g.moveTo(ax - 18, ay + 12);
      g.lineTo(ax + 2, ay - 4);
      g.lineTo(ax - 14, ay - 20);
      g.lineTo(ax + 6, ay - 18);
      g.lineTo(ax + 20, ay + 2);
      g.lineTo(ax - 1, ay + 12);
      g.closePath();
      g.fill();
    });
  });
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2 - 70, sp.w, sp.h);
  ctx.restore();
}

function drawBalloon(ctx, b, time) {
  const sway = Math.sin(time * 2 + b.p) * 9;
  ctx.strokeStyle = 'rgba(42,20,88,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.x + sway, b.y + b.r * 1.2);
  ctx.quadraticCurveTo(b.x + sway * 2, b.y + b.r * 2, b.x, b.y + b.r * 3);
  ctx.stroke();
  ctx.fillStyle = b.c;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(b.x + sway, b.y, b.r, b.r * 1.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(b.x + sway - b.r * 0.34, b.y - b.r * 0.46, b.r * 0.2, b.r * 0.32, 0.5, 0, TAU);
  ctx.fill();
}

// Клетчатая финишная линия поперёк дороги
function drawFinishLine(ctx, x, top, bot) {
  const rows = 8;
  const cols = 3;
  const cw = 26;
  const rh = (bot - top) / rows;
  const skew = 88 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#ffffff' : '#1a0838';
      const px = x + 44 - r * skew + (c - cols / 2) * cw;
      ctx.beginPath();
      ctx.moveTo(px, top + r * rh);
      ctx.lineTo(px + cw, top + r * rh);
      ctx.lineTo(px + cw - skew, top + (r + 1) * rh + 0.5);
      ctx.lineTo(px - skew, top + (r + 1) * rh + 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Большой клетчатый флаг на полосатом шесте
function drawFinishFlag(ctx, x, y, time) {
  const h = 280;
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff2e88';
    ctx.fillRect(x - 9, y - h + (i * h) / stripes, 18, h / stripes + 1);
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 4.5;
  ctx.strokeRect(x - 9, y - h, 18, h);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(x, y - h - 8, 14, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Полотнище развевается волной
  const cols = 8;
  const rows = 5;
  const cw = 26;
  const rh = 23;
  const top = y - h + 2;
  const wave = (i) => Math.sin(time * 6 + i * 0.9) * (3 + i * 1.5);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#1a0838';
      const x0 = x + 9 + i * cw;
      ctx.beginPath();
      ctx.moveTo(x0, top + j * rh + wave(i));
      ctx.lineTo(x0 + cw + 0.5, top + j * rh + wave(i + 1));
      ctx.lineTo(x0 + cw + 0.5, top + (j + 1) * rh + wave(i + 1));
      ctx.lineTo(x0, top + (j + 1) * rh + wave(i));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 9, top + wave(0));
  for (let i = 1; i <= cols; i++) ctx.lineTo(x + 9 + i * cw, top + wave(i));
  for (let i = cols; i >= 0; i--) ctx.lineTo(x + 9 + i * cw, top + rows * rh + wave(i));
  ctx.closePath();
  ctx.stroke();
}

// =====================================================
// ДЕКОРАЦИИ У ДОРОГИ. Опорная точка — земля, рисуем вверх от (0, 0)
// =====================================================
const PROPS = {
  barn: (g) => {
    blob(g, [[-98, 0], [-98, -110], [0, -176], [98, -110], [98, 0]]);
    ink(g, vGrad(g, -176, 0, '#ff7a6a', '#d9263f'));
    g.beginPath();
    g.moveTo(-112, -100);
    g.lineTo(0, -184);
    g.lineTo(112, -100);
    g.lineWidth = 15;
    g.strokeStyle = '#ffffff';
    g.stroke();
    blob(g, [[-36, 0], [-36, -74], [36, -74], [36, 0]]);
    ink(g, '#ffffff', 4);
    g.lineWidth = 5;
    g.strokeStyle = '#d9263f';
    g.beginPath();
    g.moveTo(-28, -66);
    g.lineTo(28, -6);
    g.moveTo(28, -66);
    g.lineTo(-28, -6);
    g.stroke();
    circle(g, 0, -122, 14, '#ffe14d', 4);
  },
  tree: (g) => {
    blob(g, [[-14, 0], [-10, -66], [10, -66], [14, 0]]);
    ink(g, '#a0632f');
    [[0, -116, 56], [-40, -82, 40], [40, -82, 42]].forEach(([x, y, r]) => {
      circle(g, x, y, r, LINE, 0);
    });
    [[0, -116, 52], [-40, -82, 36], [40, -82, 38]].forEach(([x, y, r]) => {
      const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      grad.addColorStop(0, '#c2fa6a');
      grad.addColorStop(1, '#22a24f');
      circle(g, x, y, r, grad, 0);
    });
    [[-18, -130], [22, -104], [-48, -84]].forEach(([x, y]) => circle(g, x, y, 7, '#ff4d6d', 2.5));
  },
  cow: (g) => {
    [-36, -14, 14, 36].forEach((x) => {
      blob(g, [[x - 7, 0], [x - 7, -34], [x + 7, -34], [x + 7, 0]]);
      ink(g, '#ffffff', 4);
    });
    g.beginPath();
    g.ellipse(0, -48, 52, 30, 0, 0, TAU);
    ink(g, '#ffffff');
    g.save();
    g.beginPath();
    g.ellipse(0, -48, 50, 28, 0, 0, TAU);
    g.clip();
    circle(g, -22, -60, 16, LINE, 0);
    circle(g, 22, -38, 13, LINE, 0);
    g.restore();
    circle(g, 56, -66, 25, '#ffffff', 4.5);
    blob(g, [[42, -60], [72, -60], [72, -44], [42, -44]]);
    ink(g, '#ffb3c7', 3.5);
    circle(g, 50, -74, 4.5, LINE, 0);
    circle(g, 64, -74, 4.5, LINE, 0);
    [38, 74].forEach((x, i) => {
      g.beginPath();
      g.ellipse(x, -90, 9, 5.5, i ? -0.6 : 0.6, 0, TAU);
      ink(g, '#ffffff', 3);
    });
  },
  sheep: (g) => {
    [-20, 20].forEach((x) => {
      blob(g, [[x - 6, 0], [x - 6, -26], [x + 6, -26], [x + 6, 0]]);
      ink(g, '#3a2a5a', 3);
    });
    [[-26, -44], [0, -56], [26, -44], [-12, -32], [14, -32]].forEach(([x, y]) => circle(g, x, y, 22, LINE, 0));
    [[-26, -44], [0, -56], [26, -44], [-12, -32], [14, -32]].forEach(([x, y]) => circle(g, x, y, 19, '#ffffff', 0));
    circle(g, 42, -54, 16, '#3a2a5a', 3.5);
    circle(g, 37, -58, 3.5, '#ffffff', 0);
    circle(g, 48, -58, 3.5, '#ffffff', 0);
  },
  palm: (g) => {
    blob(g, [[-13, 0], [-6, -100], [6, -150], [18, -150], [10, -100], [13, 0]]);
    ink(g, '#b57a3a');
    [[-74, -142], [-62, -192], [10, -206], [74, -180], [84, -130]].forEach(([x, y]) => {
      g.beginPath();
      g.moveTo(10, -152);
      g.quadraticCurveTo((x + 10) / 2, y - 18, x, y);
      g.quadraticCurveTo((x + 10) / 2, y + 22, 10, -146);
      g.closePath();
      ink(g, '#25c26b', 4);
    });
    circle(g, 2, -146, 10, '#a0632f', 3.5);
    circle(g, 20, -142, 10, '#a0632f', 3.5);
  },
  umbrella: (g) => {
    g.lineWidth = 8;
    g.strokeStyle = LINE;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -120);
    g.stroke();
    g.beginPath();
    g.moveTo(-82, -96);
    g.quadraticCurveTo(0, -196, 82, -96);
    g.closePath();
    ink(g, '#ffffff');
    g.save();
    g.clip();
    ['#ff4d6d', '#ffd23f', '#19c6f2', '#ff4d6d'].forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(-82 + i * 41, -190, 22, 110);
    });
    g.restore();
  },
  crab: (g) => {
    [-1, 1].forEach((s) => {
      g.lineWidth = 6;
      g.strokeStyle = '#d9263f';
      g.beginPath();
      g.moveTo(s * 24, -20);
      g.lineTo(s * 42, -4);
      g.moveTo(s * 20, -14);
      g.lineTo(s * 30, 0);
      g.stroke();
      circle(g, s * 44, -46, 13, '#ff5a5a', 4);
    });
    g.beginPath();
    g.ellipse(0, -30, 34, 23, 0, 0, TAU);
    ink(g, '#ff5a5a');
    [-11, 11].forEach((x) => {
      circle(g, x, -56, 10, '#ffffff', 3.5);
      circle(g, x + 1, -56, 4.5, LINE, 0);
    });
    g.beginPath();
    g.arc(0, -28, 10, 0.2, Math.PI - 0.2);
    g.lineWidth = 3.5;
    g.strokeStyle = LINE;
    g.stroke();
  },
  castle: (g) => {
    [[-58, -44, 40], [0, -74, 56], [58, -44, 40]].forEach(([x, h, w]) => {
      g.beginPath();
      g.moveTo(x - w / 2, 0);
      g.lineTo(x - w / 2, h);
      for (let i = 0; i < 3; i++) {
        const q = x - w / 2 + (i * w) / 3;
        g.lineTo(q + w / 6, h - 11);
        g.lineTo(q + w / 3, h);
      }
      g.lineTo(x + w / 2, 0);
      g.closePath();
      ink(g, '#ffd98a');
    });
    g.lineWidth = 4;
    g.strokeStyle = LINE;
    g.beginPath();
    g.moveTo(0, -84);
    g.lineTo(0, -116);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -116);
    g.lineTo(26, -106);
    g.lineTo(0, -96);
    g.closePath();
    ink(g, '#ff2e88', 3.5);
    blob(g, [[-12, 0], [-12, -30], [12, -30], [12, 0]]);
    ink(g, '#b57a3a', 3.5);
  },
  lollipop: (g) => {
    g.lineWidth = 15;
    g.strokeStyle = LINE;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -110);
    g.stroke();
    g.lineWidth = 8;
    g.strokeStyle = '#ffffff';
    g.stroke();
    circle(g, 0, -146, 56, '#ff4d9a', 5.5);
    g.lineWidth = 11;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 90; i++) {
      const a = i * 0.25;
      const r = i * 0.55;
      g.lineTo(Math.cos(a) * r, -146 + Math.sin(a) * r);
    }
    g.stroke();
  },
  cupcake: (g) => {
    g.beginPath();
    g.moveTo(-46, -62);
    g.lineTo(-32, 0);
    g.lineTo(32, 0);
    g.lineTo(46, -62);
    g.closePath();
    ink(g, '#7fd8ff');
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    [-20, 0, 20].forEach((x) => {
      g.moveTo(x, -6);
      g.lineTo(x * 1.35, -56);
    });
    g.stroke();
    blob(g, [[-62, -62], [-40, -104], [-16, -110], [0, -136], [18, -110], [42, -104], [62, -62]]);
    ink(g, vGrad(g, -136, -62, '#fff0fa', '#ff9ad5'));
    circle(g, 2, -142, 13, '#ff2e4d', 4);
    ['#ffd23f', '#19c6f2', '#7cff5c', '#ffffff'].forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(-34 + i * 22, -88 + (i % 2) * 11, 8, 4);
    });
  },
  cane: (g) => {
    const path = () => {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -128);
      g.arc(-30, -128, 30, 0, Math.PI, true);
    };
    path();
    g.lineWidth = 30;
    g.strokeStyle = LINE;
    g.stroke();
    path();
    g.lineWidth = 21;
    g.strokeStyle = '#ffffff';
    g.stroke();
    path();
    g.lineWidth = 21;
    g.strokeStyle = '#ff2e4d';
    g.setLineDash([17, 17]);
    g.lineCap = 'butt';
    g.stroke();
    g.setLineDash([]);
    g.lineCap = 'round';
  },
  donut: (g) => {
    circle(g, 0, -70, 68, '#e0a35c', 5.5);
    blob(g, [[-60, -94], [-34, -124], [24, -128], [58, -100], [62, -56], [36, -38], [-20, -36], [-58, -50]]);
    ink(g, '#ff7ac6', 4);
    circle(g, 0, -70, 21, '#ffd5ec', 5);
    ['#ffffff', '#ffd23f', '#19c6f2', '#7cff5c', '#ffffff', '#ffd23f'].forEach((c, i) => {
      const a = (i / 6) * TAU;
      g.fillStyle = c;
      g.fillRect(Math.cos(a) * 40 - 4, -70 + Math.sin(a) * 40 - 2, 9, 5);
    });
  },
  snowman: (g) => {
    circle(g, 0, -46, 48, '#ffffff', 5);
    circle(g, 0, -116, 34, '#ffffff', 5);
    circle(g, -11, -124, 4.5, LINE, 0);
    circle(g, 11, -124, 4.5, LINE, 0);
    g.beginPath();
    g.moveTo(-2, -116);
    g.lineTo(32, -110);
    g.lineTo(-2, -106);
    g.closePath();
    ink(g, '#ff8a1f', 3);
    [-62, -44, -26].forEach((y) => circle(g, 0, y, 5, LINE, 0));
    blob(g, [[-34, -146], [34, -146], [34, -136], [-34, -136]]);
    ink(g, '#ff2e4d', 4);
    blob(g, [[-20, -172], [20, -172], [20, -144], [-20, -144]]);
    ink(g, '#ff2e4d', 4);
    g.beginPath();
    g.arc(0, -112, 11, 0.3, Math.PI - 0.3);
    g.lineWidth = 3;
    g.strokeStyle = LINE;
    g.stroke();
  },
  pine: (g) => {
    blob(g, [[-11, 0], [-11, -24], [11, -24], [11, 0]]);
    ink(g, '#a0632f');
    [[-68, -18, -82], [-54, -68, -130], [-38, -112, -180]].forEach(([w, y, top]) => {
      g.beginPath();
      g.moveTo(w, y);
      g.lineTo(0, top);
      g.lineTo(-w, y);
      g.closePath();
      ink(g, '#2fa86f', 5);
      g.beginPath();
      g.moveTo(w * 0.42, top + (y - top) * 0.46);
      g.lineTo(0, top);
      g.lineTo(-w * 0.42, top + (y - top) * 0.46);
      g.closePath();
      g.fillStyle = '#ffffff';
      g.fill();
    });
    starPath(g, 0, -186, 17);
    ink(g, '#ffd23f', 3.5);
  },
  penguin: (g) => {
    g.beginPath();
    g.ellipse(0, -52, 38, 52, 0, 0, TAU);
    ink(g, '#2a2a5a');
    g.beginPath();
    g.ellipse(0, -44, 26, 40, 0, 0, TAU);
    g.fillStyle = '#ffffff';
    g.fill();
    circle(g, -11, -76, 8, '#ffffff', 0);
    circle(g, 11, -76, 8, '#ffffff', 0);
    circle(g, -10, -76, 4, LINE, 0);
    circle(g, 12, -76, 4, LINE, 0);
    g.beginPath();
    g.moveTo(-9, -66);
    g.lineTo(9, -66);
    g.lineTo(0, -55);
    g.closePath();
    ink(g, '#ffb31a', 3);
    [-18, 18].forEach((x) => {
      g.beginPath();
      g.ellipse(x, -1, 15, 6.5, 0, 0, TAU);
      ink(g, '#ffb31a', 3);
    });
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.ellipse(s * 40, -56, 9, 26, s * 0.42, 0, TAU);
      ink(g, '#2a2a5a', 3.5);
    });
  },
  igloo: (g) => {
    g.beginPath();
    g.arc(0, 0, 88, Math.PI, 0);
    g.closePath();
    ink(g, vGrad(g, -88, 0, '#ffffff', '#bfe9ff'));
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(70,130,190,0.65)';
    [-58, -30].forEach((y) => {
      const w = Math.sqrt(88 * 88 - y * y);
      g.beginPath();
      g.moveTo(-w, y);
      g.lineTo(w, y);
      g.stroke();
    });
    g.beginPath();
    g.arc(30, 0, 30, Math.PI, 0);
    g.closePath();
    ink(g, '#2a4aa8', 4);
  },
  rocket: (g) => {
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.moveTo(s * 26, -60);
      g.lineTo(s * 58, -8);
      g.lineTo(s * 24, -24);
      g.closePath();
      ink(g, '#ff2e4d');
    });
    blob(g, [[-30, -20], [-34, -120], [0, -214], [34, -120], [30, -20]]);
    ink(g, vGrad(g, -200, -20, '#ffffff', '#c9d6ff'));
    circle(g, 0, -124, 19, '#7fe0ff', 5);
    g.beginPath();
    g.moveTo(-24, -168);
    g.quadraticCurveTo(0, -214, 24, -168);
    g.quadraticCurveTo(0, -158, -24, -168);
    g.closePath();
    ink(g, '#ff2e4d', 4);
    blob(g, [[-18, -24], [18, -24], [14, -4], [-14, -4]]);
    ink(g, '#ffd23f', 4);
  },
  alien: (g) => {
    [-16, 16].forEach((x, i) => {
      g.lineWidth = 5;
      g.strokeStyle = LINE;
      g.beginPath();
      g.moveTo(x, -106);
      g.lineTo(x * 1.5, -130);
      g.stroke();
      circle(g, x * 1.5, -135, 7.5, i ? '#ffd23f' : '#ff5be0', 3);
    });
    blob(g, [[-30, 0], [-40, -46], [-44, -96], [0, -122], [44, -96], [40, -46], [30, 0]]);
    ink(g, vGrad(g, -120, 0, '#baff7a', '#3fd16a'));
    circle(g, 0, -80, 22, '#ffffff', 4);
    circle(g, 2, -78, 12, '#7a2bff', 0);
    circle(g, 5, -82, 4, '#ffffff', 0);
    g.beginPath();
    g.arc(0, -42, 14, 0.2, Math.PI - 0.2);
    g.lineWidth = 4;
    g.strokeStyle = LINE;
    g.stroke();
  },
  ufo: (g) => {
    g.translate(0, -70);
    g.beginPath();
    g.moveTo(-22, 28);
    g.lineTo(22, 28);
    g.lineTo(52, 70);
    g.lineTo(-52, 70);
    g.closePath();
    g.fillStyle = 'rgba(126,249,255,0.36)';
    g.fill();
    g.beginPath();
    g.arc(0, -8, 34, Math.PI, 0);
    g.closePath();
    ink(g, '#7fe0ff');
    g.beginPath();
    g.ellipse(0, 6, 70, 22, 0, 0, TAU);
    ink(g, vGrad(g, -14, 28, '#e4dcff', '#8f6bff'));
    [-44, -14, 16, 46].forEach((x, i) => circle(g, x, 8 + (i === 0 || i === 3 ? -2 : 2), 6, ['#ffe14d', '#ff5be0'][i % 2], 2.5));
  },
  rock: (g) => {
    blob(g, [[-76, 0], [-62, -56], [-14, -84], [40, -70], [76, -20], [72, 0]]);
    ink(g, vGrad(g, -84, 0, '#8f7fdc', '#4b3aa8'));
    circle(g, -20, -40, 13, '#3b2a90', 0);
    circle(g, 26, -28, 9, '#3b2a90', 0);
    circle(g, 12, -60, 6, '#3b2a90', 0);
  }
};

function propSprite(name) {
  return Art.sprite(`prop:${name}`, 300, 300, (g) => {
    g.translate(0, 110);
    PROPS[name](g);
  });
}

// Значок руки-подсказки
const HAND_PATH = new Path2D('M-5 -24 a5.5 5.5 0 0 1 11 0 v15 l13 3 a6 6 0 0 1 4.5 7 l-3 15 a6 6 0 0 1 -6 5 h-15 a6 6 0 0 1 -5 -3 l-13 -19 a4.5 4.5 0 0 1 7 -5.5 l6.5 7 z');
