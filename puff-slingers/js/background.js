// =====================================================
// ФОНЫ: шесть миров с параллаксом, небом и атмосферой
// =====================================================
const LAYER_W = 1600;

function periodic(W, seed, terms) {
  const rng = seeded(seed);
  const t = terms.map(([n, a]) => ({ k: (TAU * n) / W, a, p: rng() * TAU }));
  return (x) => {
    let s = 0;
    for (let i = 0; i < t.length; i++) s += t[i].a * Math.sin(t[i].k * x + t[i].p);
    return s;
  };
}

function fillRidge(g, W, H, yFn, top, bottom, rim) {
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, yFn(x));
  g.lineTo(W, H);
  g.closePath();
  let minY = H;
  for (let x = 0; x <= W; x += 24) minY = Math.min(minY, yFn(x));
  const grad = g.createLinearGradient(0, minY, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fill();
  if (rim) {
    g.strokeStyle = rim;
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y = yFn(x) + 1.5;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
}

// Рисуем с учётом бесшовного повторения по горизонтали
function wrapDraw(W, x, span, fn) {
  fn(x);
  if (x - span < 0) fn(x + W);
  if (x + span > W) fn(x - W);
}

// ---------- Дальние планы ----------
const FAR_PAINTERS = {
  meadow(g, W, H, b) {
    const f = periodic(W, 11, [[2, 70], [5, 34], [9, 14]]);
    fillRidge(g, W, H, (x) => H - 300 + f(x), b.far[0], b.far[1]);
    const n = periodic(W, 12, [[3, 50], [7, 22]]);
    fillRidge(g, W, H, (x) => H - 180 + n(x), '#9fe3f5', '#7fd4c0');
  },
  blossom(g, W, H, b) {
    const rng = seeded(21);
    for (let i = 0; i < 4; i++) {
      const x = (i + 0.2 + rng() * 0.5) * (W / 4);
      const h = 240 + rng() * 150;
      const w = h * 1.35;
      wrapDraw(W, x, w, (px) => {
        g.beginPath();
        g.moveTo(px - w, H);
        g.quadraticCurveTo(px - w * 0.3, H - h * 0.5, px, H - h);
        g.quadraticCurveTo(px + w * 0.3, H - h * 0.5, px + w, H);
        g.closePath();
        const grad = g.createLinearGradient(0, H - h, 0, H);
        grad.addColorStop(0, b.far[0]);
        grad.addColorStop(1, b.far[1]);
        g.fillStyle = grad;
        g.fill();
        // Снежная шапка
        g.beginPath();
        g.moveTo(px - w * 0.2, H - h * 0.74);
        g.quadraticCurveTo(px - w * 0.1, H - h * 0.92, px, H - h);
        g.quadraticCurveTo(px + w * 0.1, H - h * 0.92, px + w * 0.2, H - h * 0.74);
        for (let k = 3; k >= -3; k--) {
          g.lineTo(px + k * w * 0.056, H - h * 0.72 + (k % 2 ? 12 : -4));
        }
        g.closePath();
        g.fillStyle = '#fff8fc';
        g.fill();
      });
    }
  },
  canyon(g, W, H, b) {
    const rng = seeded(31);
    for (let i = 0; i < 7; i++) {
      const x = (i + rng() * 0.6) * (W / 7);
      const h = 170 + rng() * 210;
      const w = 90 + rng() * 120;
      wrapDraw(W, x, w * 1.5, (px) => {
        g.beginPath();
        g.moveTo(px - w * 1.4, H);
        g.lineTo(px - w * 0.9, H - h * 0.48);
        g.lineTo(px - w * 0.72, H - h * 0.56);
        g.lineTo(px - w * 0.62, H - h);
        g.lineTo(px + w * 0.58, H - h);
        g.lineTo(px + w * 0.72, H - h * 0.52);
        g.lineTo(px + w * 0.94, H - h * 0.44);
        g.lineTo(px + w * 1.4, H);
        g.closePath();
        const grad = g.createLinearGradient(0, H - h, 0, H);
        grad.addColorStop(0, b.far[0]);
        grad.addColorStop(1, b.far[1]);
        g.fillStyle = grad;
        g.fill();
        // Слои породы
        g.save();
        g.clip();
        g.strokeStyle = 'rgba(255,220,180,0.2)';
        g.lineWidth = 3;
        for (let y = H - h + 22; y < H; y += 26) {
          g.beginPath();
          g.moveTo(px - w * 1.5, y);
          g.lineTo(px + w * 1.5, y + 5);
          g.stroke();
        }
        g.restore();
      });
    }
  },
  glacier(g, W, H, b) {
    const rng = seeded(41);
    for (let i = 0; i < 6; i++) {
      const x = (i + rng() * 0.5) * (W / 6);
      const h = 240 + rng() * 210;
      const w = 170 + rng() * 110;
      wrapDraw(W, x, w, (px) => {
        const pts = [[-w, 0], [-w * 0.55, -h * 0.42], [-w * 0.34, -h * 0.5], [-w * 0.12, -h * 0.9], [0, -h], [w * 0.16, -h * 0.78], [w * 0.36, -h * 0.56], [w * 0.5, -h * 0.34], [w, 0]];
        g.beginPath();
        pts.forEach(([a, c], k) => (k ? g.lineTo(px + a, H + c) : g.moveTo(px + a, H + c)));
        g.closePath();
        const grad = g.createLinearGradient(px - w * 0.4, 0, px + w * 0.5, 0);
        grad.addColorStop(0, b.far[0]);
        grad.addColorStop(1, b.far[1]);
        g.fillStyle = grad;
        g.fill();
        // Ледяная шапка
        g.beginPath();
        g.moveTo(px - w * 0.2, H - h * 0.7);
        g.lineTo(px - w * 0.12, H - h * 0.9);
        g.lineTo(px, H - h);
        g.lineTo(px + w * 0.16, H - h * 0.78);
        g.lineTo(px + w * 0.26, H - h * 0.66);
        g.lineTo(px + w * 0.12, H - h * 0.72);
        g.lineTo(px + w * 0.04, H - h * 0.62);
        g.lineTo(px - w * 0.08, H - h * 0.74);
        g.closePath();
        g.fillStyle = '#ffffff';
        g.fill();
      });
    }
  },
  neon(g, W, H, b) {
    const rng = seeded(51);
    let x = 0;
    while (x < W) {
      const w = 46 + rng() * 80;
      const h = 130 + rng() * 300;
      const wide = Math.min(w, W - x);
      const grad = g.createLinearGradient(0, H - h, 0, H);
      grad.addColorStop(0, b.far[0]);
      grad.addColorStop(1, b.far[1]);
      g.fillStyle = grad;
      g.fillRect(x, H - h, wide, h);
      // Окна
      const colors = ['#ffe28a', '#7ef9ff', '#ff8ad8'];
      const col = colors[Math.floor(rng() * 3)];
      g.fillStyle = col;
      for (let wy = H - h + 10; wy < H - 8; wy += 16) {
        for (let wx = x + 7; wx < x + wide - 8; wx += 13) {
          if (rng() > 0.6) {
            g.globalAlpha = 0.45 + rng() * 0.55;
            g.fillRect(wx, wy, 6, 8);
          }
        }
      }
      g.globalAlpha = 1;
      if (rng() > 0.55) {
        // Неоновый контур крыши
        g.strokeStyle = rng() > 0.5 ? '#ff2bd6' : '#29f3ff';
        g.lineWidth = 2.5;
        g.shadowColor = g.strokeStyle;
        g.shadowBlur = 14;
        g.beginPath();
        g.moveTo(x + 1, H - h + 1);
        g.lineTo(x + wide - 1, H - h + 1);
        g.stroke();
        g.shadowBlur = 0;
      }
      x += wide + 3;
    }
  },
  volcano(g, W, H, b) {
    const f = periodic(W, 61, [[3, 46], [8, 20], [17, 8]]);
    fillRidge(g, W, H, (x) => H - 140 + f(x), b.far[0], b.far[1]);
    // Главный вулкан
    const px = W * 0.58;
    const h = 430;
    const w = 460;
    g.beginPath();
    g.moveTo(px - w, H);
    g.quadraticCurveTo(px - w * 0.3, H - h * 0.46, px - 54, H - h);
    g.lineTo(px + 54, H - h);
    g.quadraticCurveTo(px + w * 0.3, H - h * 0.46, px + w, H);
    g.closePath();
    const grad = g.createLinearGradient(0, H - h, 0, H);
    grad.addColorStop(0, '#6e1838');
    grad.addColorStop(1, '#2a0a20');
    g.fillStyle = grad;
    g.fill();
    // Сияние кратера и потоки лавы
    g.shadowColor = '#ff7a1a';
    g.shadowBlur = 26;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.ellipse(px, H - h + 3, 54, 11, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#ff8a1f';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    [[-34, -88, 90], [8, 24, 200], [40, 110, 120]].forEach(([a, c, len]) => {
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(px + a, H - h + 5);
      g.bezierCurveTo(px + a + c * 0.2, H - h + len * 0.5, px + c * 0.8, H - h + len * 0.8, px + c, H - h + len * 1.5);
      g.stroke();
    });
    g.shadowBlur = 0;
  }
};

// ---------- Средние планы ----------
function lollipopTree(g, x, y, h, leafTop, leafBot, trunk, rng, speckle) {
  const R = h * 0.42;
  g.strokeStyle = trunk;
  g.lineWidth = Math.max(5, h * 0.1);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y + 8);
  g.lineTo(x, y - h * 0.55);
  g.stroke();
  const puffs = [[0, -h * 0.72, R], [-R * 0.7, -h * 0.52, R * 0.72], [R * 0.72, -h * 0.5, R * 0.76]];
  puffs.forEach(([a, c, rr]) => {
    const grad = g.createRadialGradient(x + a - rr * 0.35, y + c - rr * 0.4, rr * 0.1, x + a, y + c, rr);
    grad.addColorStop(0, leafTop);
    grad.addColorStop(1, leafBot);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x + a, y + c, rr, 0, TAU);
    g.fill();
  });
  if (speckle) {
    g.fillStyle = speckle;
    for (let i = 0; i < 14; i++) {
      const a = rng() * TAU;
      const d = rng() * R * 1.25;
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y - h * 0.62 + Math.sin(a) * d * 0.8, 1.6 + rng() * 1.6, 0, TAU);
      g.fill();
    }
  }
}

const MID_PAINTERS = {
  meadow(g, W, H, b) {
    const rng = seeded(13);
    const f = periodic(W, 14, [[2, 40], [4, 22], [9, 8]]);
    const y = (x) => H - 150 + f(x);
    for (let i = 0; i < 13; i++) {
      const x = (i + rng() * 0.8) * (W / 13);
      const h = 80 + rng() * 80;
      wrapDraw(W, x, 90, (px) => lollipopTree(g, px, y(x) + 6, h, '#b9f76a', '#1fa455', '#7c4a22', rng, null));
    }
    fillRidge(g, W, H, y, b.mid[0], b.mid[1], 'rgba(255,255,255,0.5)');
    // Цветочные поляны
    const colors = ['#ffffff', '#ffe14d', '#ff7ac6', '#ff5e62'];
    for (let i = 0; i < 90; i++) {
      const x = rng() * W;
      g.fillStyle = colors[Math.floor(rng() * 4)];
      g.beginPath();
      g.arc(x, y(x) + 14 + rng() * 80, 1.6 + rng() * 1.8, 0, TAU);
      g.fill();
    }
  },
  blossom(g, W, H, b) {
    const rng = seeded(23);
    const f = periodic(W, 24, [[2, 46], [5, 18]]);
    const y = (x) => H - 150 + f(x);
    for (let i = 0; i < 12; i++) {
      const x = (i + rng() * 0.8) * (W / 12);
      const h = 96 + rng() * 90;
      wrapDraw(W, x, 100, (px) => lollipopTree(g, px, y(x) + 6, h, '#ffe0f2', '#ff5fb7', '#7a2f5c', rng, '#ffffff'));
    }
    fillRidge(g, W, H, y, b.mid[0], b.mid[1], 'rgba(255,255,255,0.6)');
    g.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 70; i++) {
      const x = rng() * W;
      g.beginPath();
      g.ellipse(x, y(x) + 14 + rng() * 80, 3, 1.6, rng() * 3, 0, TAU);
      g.fill();
    }
  },
  canyon(g, W, H, b) {
    const rng = seeded(33);
    const f = periodic(W, 34, [[3, 26], [7, 12]]);
    const y = (x) => H - 110 + f(x);
    // Скальные столбы
    for (let i = 0; i < 9; i++) {
      const x = (i + rng() * 0.7) * (W / 9);
      const h = 90 + rng() * 150;
      const w = 22 + rng() * 34;
      wrapDraw(W, x, w * 2, (px) => {
        const base = y(x) + 10;
        g.beginPath();
        g.moveTo(px - w * 1.3, base);
        g.lineTo(px - w * 0.8, base - h * 0.5);
        g.lineTo(px - w, base - h * 0.62);
        g.lineTo(px - w * 0.7, base - h);
        g.lineTo(px + w * 0.7, base - h);
        g.lineTo(px + w, base - h * 0.62);
        g.lineTo(px + w * 0.8, base - h * 0.5);
        g.lineTo(px + w * 1.3, base);
        g.closePath();
        const grad = g.createLinearGradient(px - w, 0, px + w, 0);
        grad.addColorStop(0, '#ffb35c');
        grad.addColorStop(1, '#b5401f');
        g.fillStyle = grad;
        g.fill();
      });
    }
    fillRidge(g, W, H, y, b.mid[0], b.mid[1], 'rgba(255,230,160,0.55)');
    // Кактусы
    for (let i = 0; i < 12; i++) {
      const x = rng() * W;
      const yy = y(x) + 6;
      const h = 26 + rng() * 26;
      g.strokeStyle = '#2f8f4a';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, yy);
      g.lineTo(x, yy - h);
      g.moveTo(x, yy - h * 0.5);
      g.quadraticCurveTo(x + 12, yy - h * 0.5, x + 12, yy - h * 0.8);
      g.moveTo(x, yy - h * 0.34);
      g.quadraticCurveTo(x - 11, yy - h * 0.34, x - 11, yy - h * 0.64);
      g.stroke();
    }
  },
  glacier(g, W, H, b) {
    const rng = seeded(43);
    const f = periodic(W, 44, [[2, 36], [5, 16]]);
    const y = (x) => H - 130 + f(x);
    // Ели под снегом
    for (let i = 0; i < 26; i++) {
      const x = (i + rng() * 0.8) * (W / 26);
      const h = 58 + rng() * 74;
      wrapDraw(W, x, 50, (px) => {
        const base = y(x) + 8;
        for (let k = 0; k < 3; k++) {
          const top = base - h + (k * h) / 4;
          const bot = top + h * 0.5;
          const w = h * (0.2 + k * 0.1);
          g.fillStyle = k === 0 ? '#2d8fa8' : k === 1 ? '#1f7a96' : '#176482';
          g.beginPath();
          g.moveTo(px, top);
          g.lineTo(px + w, bot);
          g.lineTo(px - w, bot);
          g.closePath();
          g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.moveTo(px, top);
          g.lineTo(px + w * 0.5, top + h * 0.25);
          g.lineTo(px, top + h * 0.19);
          g.lineTo(px - w * 0.5, top + h * 0.25);
          g.closePath();
          g.fill();
        }
      });
    }
    fillRidge(g, W, H, y, b.mid[0], b.mid[1], 'rgba(255,255,255,0.85)');
  },
  neon(g, W, H, b) {
    const rng = seeded(53);
    const f = periodic(W, 54, [[3, 18], [7, 7]]);
    const y = (x) => H - 90 + f(x);
    // Гигантские светящиеся грибы
    for (let i = 0; i < 11; i++) {
      const x = (i + rng() * 0.8) * (W / 11);
      const h = 70 + rng() * 130;
      const R = 28 + rng() * 40;
      const pal = [['#29f3ff', '#0a7dff'], ['#ff5be0', '#9a19e8'], ['#b6ff5c', '#14c48a']][Math.floor(rng() * 3)];
      wrapDraw(W, x, R * 2, (px) => {
        const base = y(x) + 8;
        g.strokeStyle = '#d6c6ff';
        g.lineWidth = 7 + R * 0.1;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(px, base);
        g.quadraticCurveTo(px + 8, base - h * 0.5, px, base - h);
        g.stroke();
        g.shadowColor = pal[0];
        g.shadowBlur = 24;
        const grad = g.createLinearGradient(0, base - h - R, 0, base - h);
        grad.addColorStop(0, pal[0]);
        grad.addColorStop(1, pal[1]);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(px, base - h, R, Math.PI, 0);
        g.quadraticCurveTo(px, base - h + R * 0.4, px - R, base - h);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(px - R * 0.6 + k * R * 0.4, base - h - R * (0.28 + 0.26 * (k % 2)), R * 0.08, 0, TAU);
          g.fill();
        }
      });
    }
    fillRidge(g, W, H, y, b.mid[0], b.mid[1], '#29f3ff');
  },
  volcano(g, W, H, b) {
    const rng = seeded(63);
    const f = periodic(W, 64, [[4, 22], [11, 10], [23, 5]]);
    const y = (x) => H - 100 + f(x);
    // Базальтовые шпили
    for (let i = 0; i < 16; i++) {
      const x = (i + rng() * 0.8) * (W / 16);
      const h = 50 + rng() * 130;
      const w = 18 + rng() * 26;
      wrapDraw(W, x, w * 2, (px) => {
        const base = y(x) + 8;
        g.beginPath();
        g.moveTo(px - w, base);
        g.lineTo(px - w * 0.25, base - h);
        g.lineTo(px + w * 0.15, base - h * 0.7);
        g.lineTo(px + w, base);
        g.closePath();
        g.fillStyle = '#2a0d1c';
        g.fill();
        g.strokeStyle = 'rgba(255,122,26,0.65)';
        g.lineWidth = 2;
        g.stroke();
      });
    }
    fillRidge(g, W, H, y, b.mid[0], b.mid[1], '#ff6a1f');
    // Лавовые озёра
    g.shadowColor = '#ff7a1a';
    g.shadowBlur = 18;
    for (let i = 0; i < 7; i++) {
      const x = rng() * W;
      const grad = g.createLinearGradient(0, y(x) + 20, 0, y(x) + 44);
      grad.addColorStop(0, '#ffe14d');
      grad.addColorStop(1, '#ff4d1a');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y(x) + 32, 34 + rng() * 44, 6 + rng() * 5, 0, 0, TAU);
      g.fill();
    }
    g.shadowBlur = 0;
  }
};

// ---------- Земля ----------
const GROUND_TILE_W = 640;
const GROUND_TILE_H = 210;
const GROUND_TILE_TOP = 50;

function paintGroundTile(g, b) {
  const W = GROUND_TILE_W;
  const H = GROUND_TILE_H;
  const top = GROUND_TILE_TOP;
  const rng = seeded(hashStr(b.id));

  // Почва со слоями
  const dirt = g.createLinearGradient(0, top, 0, H);
  dirt.addColorStop(0, b.dirt[0]);
  dirt.addColorStop(0.5, b.dirt[1]);
  dirt.addColorStop(1, b.dirt[2]);
  g.fillStyle = dirt;
  g.fillRect(0, top + 8, W, H - top);
  g.fillStyle = 'rgba(0,0,0,0.13)';
  const strata = periodic(W, 71, [[2, 9], [5, 5]]);
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, top + 64 + k * 40 + strata(x + k * 90));
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }
  // Камешки
  for (let i = 0; i < 26; i++) {
    const x = rng() * W;
    const y = top + 30 + rng() * (H - top - 40);
    const rr = 2 + rng() * 6;
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.beginPath();
    g.ellipse(x, y, rr, rr * 0.7, rng(), 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath();
    g.ellipse(x + 1, y + 1.6, rr * 0.9, rr * 0.5, 0, 0, TAU);
    g.fill();
  }

  // Низ тайла приходит точно в цвет глубинного слоя
  const fade = g.createLinearGradient(0, H - 50, 0, H);
  fade.addColorStop(0, b.dirt[2] + '00');
  fade.addColorStop(1, b.dirt[2]);
  g.fillStyle = fade;
  g.fillRect(0, H - 50, W, 50);

  // Трава или снег с волнистым краем
  const scallop = (x) => top + 24 + 6 * Math.sin((x / W) * TAU * 16);
  g.beginPath();
  g.moveTo(0, top);
  g.lineTo(W, top);
  g.lineTo(W, scallop(W));
  for (let x = W; x >= 0; x -= 5) g.lineTo(x, scallop(x));
  g.closePath();
  const grass = g.createLinearGradient(0, top, 0, top + 30);
  grass.addColorStop(0, b.grass[0]);
  grass.addColorStop(1, b.grass[1]);
  g.fillStyle = grass;
  g.fill();
  g.strokeStyle = b.grass[2];
  g.lineWidth = 3;
  g.beginPath();
  for (let x = 0; x <= W; x += 5) {
    const y = scallop(x);
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(0, top, W, 2.5);
}

// Глубинный слой: на вертикальных экранах под землёй не пусто
const DEEP_TILE_H = 420;

function paintDeepTile(g, b) {
  const W = GROUND_TILE_W;
  const H = DEEP_TILE_H;
  const rng = seeded(hashStr(b.id) + 21);
  g.fillStyle = b.dirt[2];
  g.fillRect(0, 0, W, H);

  // Слои породы
  const wave = periodic(W, hashStr(b.id) + 2, [[2, 12], [5, 6]]);
  [90, 210, 330].forEach((y, k) => {
    g.fillStyle = `rgba(0,0,0,${0.09 + k * 0.03})`;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, y + wave(x + k * 140));
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  });

  // Камни
  for (let i = 0; i < 26; i++) {
    const x = rng() * W;
    const y = 20 + rng() * (H - 30);
    const rr = 3 + rng() * 9;
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.ellipse(x, y, rr, rr * 0.68, rng(), 0, TAU);
    g.fill();
  }

  // Кристаллы в цветах мира
  const gems = [b.grass[0], b.sky[1], '#ff5bb5', '#7ef9ff', '#ffd23f'];
  for (let i = 0; i < 11; i++) {
    const x = ((i + 0.2 + rng() * 0.6) * W) / 11;
    const y = 40 + rng() * (H - 80);
    const size = 7 + rng() * 11;
    const c = gems[Math.floor(rng() * gems.length)];
    const shards = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < shards; k++) {
      const a = -0.5 + k * 0.5 + rng() * 0.2;
      const len = size * (1.1 + rng() * 0.7);
      g.save();
      g.translate(x + (k - 1) * size * 0.45, y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, -len);
      g.lineTo(size * 0.42, -len * 0.62);
      g.lineTo(size * 0.36, 0);
      g.lineTo(-size * 0.36, 0);
      g.lineTo(-size * 0.42, -len * 0.62);
      g.closePath();
      g.globalAlpha = 0.9;
      g.fillStyle = c;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.stroke();
      g.globalAlpha = 0.55;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(-size * 0.1, -len * 0.92);
      g.lineTo(size * 0.06, -len * 0.62);
      g.lineTo(-size * 0.18, -len * 0.18);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  g.globalAlpha = 1;

  // Нижний край уходит в темноту
  const dark = g.createLinearGradient(0, H - 150, 0, H);
  dark.addColorStop(0, 'rgba(0,0,0,0)');
  dark.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = dark;
  g.fillRect(0, H - 150, W, 150);
}

function paintGroundProps(g, b) {
  const rng = seeded(hashStr(b.id) + 5);
  const W = GROUND_TILE_W;
  const top = GROUND_TILE_TOP;
  const id = b.id;
  const count = 14;
  for (let i = 0; i < count; i++) {
    const x = ((i + rng() * 0.8) * W) / count;
    const size = 0.7 + rng() * 0.8;
    if (id === 'meadow' || id === 'blossom') {
      const h = 14 + rng() * 14;
      g.strokeStyle = '#1c9c45';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, top + 2);
      g.quadraticCurveTo(x + 3, top - h * 0.5, x, top - h);
      g.stroke();
      const pal = id === 'meadow' ? ['#ffffff', '#ffe14d', '#ff7ac6', '#ff5e62', '#b78cff'] : ['#ffffff', '#ff8ad0', '#ffd0ec'];
      g.fillStyle = pal[Math.floor(rng() * pal.length)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.beginPath();
        g.arc(x + Math.cos(a) * 3.6 * size, top - h + Math.sin(a) * 3.6 * size, 2.7 * size, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#ffb31a';
      g.beginPath();
      g.arc(x, top - h, 2.2 * size, 0, TAU);
      g.fill();
    } else if (id === 'canyon') {
      g.fillStyle = rng() > 0.5 ? '#d9792a' : '#a84e1c';
      g.beginPath();
      g.ellipse(x, top + 2, 10 * size, 7 * size, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = 'rgba(255,230,180,0.4)';
      g.beginPath();
      g.ellipse(x - 2, top - 3, 4 * size, 2 * size, 0, 0, TAU);
      g.fill();
    } else if (id === 'glacier') {
      const h = 14 + rng() * 22;
      g.fillStyle = rng() > 0.5 ? '#9ff0ff' : '#5ec8f5';
      g.strokeStyle = '#1f7fd1';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x - 6 * size, top + 3);
      g.lineTo(x - 2 * size, top - h);
      g.lineTo(x + 5 * size, top - h * 0.6);
      g.lineTo(x + 7 * size, top + 3);
      g.closePath();
      g.fill();
      g.stroke();
    } else if (id === 'neon') {
      const h = 10 + rng() * 14;
      const c = ['#29f3ff', '#ff5be0', '#b6ff5c'][Math.floor(rng() * 3)];
      g.strokeStyle = '#d6c6ff';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(x, top + 2);
      g.lineTo(x, top - h);
      g.stroke();
      g.shadowColor = c;
      g.shadowBlur = 12;
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, top - h, 6 * size, Math.PI, 0);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
    } else if (id === 'volcano') {
      g.fillStyle = '#2a0d1c';
      g.strokeStyle = '#ff6a1f';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - 10 * size, top + 3);
      g.lineTo(x - 3 * size, top - 12 * size);
      g.lineTo(x + 8 * size, top + 3);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
}

function paintFrontGrass(g, b) {
  const rng = seeded(hashStr(b.id) + 9);
  const W = GROUND_TILE_W;
  const H = 34;
  const base = H - 6;
  g.fillStyle = b.grass[1];
  g.fillRect(0, base, W, 6);
  for (let x = 0; x < W; x += 5) {
    const h = 5 + rng() * 11;
    const lean = (rng() - 0.5) * 7;
    g.fillStyle = rng() > 0.5 ? b.grass[0] : b.grass[1];
    g.beginPath();
    g.moveTo(x - 3.2, base + 1);
    g.quadraticCurveTo(x + lean * 0.3, base - h * 0.6, x + lean, base - h);
    g.quadraticCurveTo(x + lean * 0.5 + 2, base - h * 0.4, x + 3.2, base + 1);
    g.closePath();
    g.fill();
  }
}

// =====================================================
// СБОРКА БИОМА И ОТРИСОВКА НЕБА
// =====================================================
const Background = {
  index: -1,
  biome: null,
  far: null,
  mid: null,
  ground: null,
  front: null,
  deep: null,
  cloudSprites: [],
  clouds: [],
  stars: [],
  ambient: [],
  sunSprite: null,
  raysSprite: null,
  skyGrad: null,
  skyH: 0,
  pxScale: 1.5,

  // Спрайты неба и фона строятся один раз на биом
  build(index, pxScale) {
    if (index === this.index && Math.abs(pxScale - this.pxScale) < 0.05) return;
    const b = BIOMES[index];
    this.index = index;
    this.biome = b;
    this.pxScale = pxScale;
    this.skyGrad = null;

    // Масштаб подгоняем под целое число пикселей: так на стыках тайлов нет швов
    const layer = (W, H, scale, painter) => {
      const c = makeCanvas(Math.round(W * scale), Math.round(H * scale));
      const g = c.getContext('2d');
      g.scale(c.width / W, c.height / H);
      painter(g, W, H, b);
      return { c, W, H };
    };

    this.far = layer(LAYER_W, 520, Math.min(pxScale, 1.25), FAR_PAINTERS[b.id]);
    this.mid = layer(LAYER_W, 380, Math.min(pxScale, 1.6), MID_PAINTERS[b.id]);
    this.ground = layer(GROUND_TILE_W, GROUND_TILE_H, pxScale, (g) => {
      paintGroundProps(g, b);
      paintGroundTile(g, b);
    });
    this.front = layer(GROUND_TILE_W, 34, pxScale, (g) => paintFrontGrass(g, b));
    this.deep = layer(GROUND_TILE_W, DEEP_TILE_H, Math.min(pxScale, 1.25), (g) => paintDeepTile(g, b));

    this.buildSky(b);
    this.buildAmbient(b);
  },

  buildSky(b) {
    // Солнце, луна и лучи
    this.sunSprite = null;
    this.raysSprite = null;
    const S = 360;
    const center = S / 2;
    if (b.sun) {
      const c = makeCanvas(S, S);
      const g = c.getContext('2d');
      const glow = g.createRadialGradient(center, center, 0, center, center, center);
      glow.addColorStop(0, b.sun.glow);
      glow.addColorStop(0.3, b.sun.glow + '88');
      glow.addColorStop(1, b.sun.glow + '00');
      g.fillStyle = glow;
      g.fillRect(0, 0, S, S);
      g.fillStyle = b.sun.c;
      g.beginPath();
      g.arc(center, center, 58, 0, TAU);
      g.fill();
      this.sunSprite = c;

      const R = makeCanvas(S, S);
      const q = R.getContext('2d');
      q.translate(center, center);
      for (let i = 0; i < 12; i++) {
        q.rotate(TAU / 12);
        const grad = q.createLinearGradient(0, 0, center, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0.32)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        q.fillStyle = grad;
        q.beginPath();
        q.moveTo(0, 0);
        q.lineTo(center, -18 - (i % 3) * 8);
        q.lineTo(center, 18 + (i % 3) * 8);
        q.closePath();
        q.fill();
      }
      this.raysSprite = R;
    } else if (b.moon) {
      const c = makeCanvas(S, S);
      const g = c.getContext('2d');
      const glow = g.createRadialGradient(center, center, 0, center, center, center);
      glow.addColorStop(0, 'rgba(190,170,255,0.7)');
      glow.addColorStop(0.32, 'rgba(160,120,255,0.3)');
      glow.addColorStop(1, 'rgba(120,80,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, S, S);
      const disc = g.createRadialGradient(center - 18, center - 20, 8, center, center, 58);
      disc.addColorStop(0, '#ffffff');
      disc.addColorStop(1, '#c9b8ff');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(center, center, 58, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(120,90,210,0.3)';
      [[-20, -8, 12], [14, 16, 16], [20, -24, 8], [-12, 28, 7]].forEach(([x, y, r]) => {
        g.beginPath();
        g.arc(center + x, center + y, r, 0, TAU);
        g.fill();
      });
      this.sunSprite = c;
    }

    // Облака
    this.cloudSprites = [0, 1, 2].map((v) => {
      const rng = seeded(100 + v * 17 + hashStr(b.id));
      const w = 300;
      const h = 130;
      const c = makeCanvas(w, h);
      const g = c.getContext('2d');
      const puffs = [];
      const n = 6 + v;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const rr = (22 + rng() * 22) * (1 - Math.abs(k - 0.5) * 0.9);
        puffs.push([34 + k * (w - 68), h * 0.62 - rng() * 14, rr + 8]);
      }
      g.fillStyle = b.cloudShade;
      puffs.forEach(([x, y, r]) => {
        g.beginPath();
        g.arc(x, y + 7, r, 0, TAU);
        g.fill();
      });
      g.fillRect(34, h * 0.62, w - 68, 26);
      g.fillStyle = b.cloud;
      puffs.forEach(([x, y, r]) => {
        g.beginPath();
        g.arc(x, y, r * 0.95, 0, TAU);
        g.fill();
      });
      return { c, w, h };
    });
    const rng = seeded(hashStr(b.id) + 3);
    this.clouds = [];
    for (let i = 0; i < 12; i++) {
      this.clouds.push({
        u: rng() * 1.4,
        v: 0.03 + rng() * 0.62,
        s: 0.45 + rng() * 0.7,
        speed: 0.004 + rng() * 0.008,
        sprite: Math.floor(rng() * 3),
        a: 0.65 + rng() * 0.3
      });
    }

    this.stars = [];
    if (b.stars) {
      for (let i = 0; i < b.stars; i++) {
        this.stars.push({ u: rng(), v: rng() * 0.85, r: 0.6 + rng() * 1.5, p: rng() * TAU, sp: 1 + rng() * 3 });
      }
    }
  },

  buildAmbient(b) {
    const rng = seeded(hashStr(b.id) + 8);
    this.ambient = [];
    const kind = b.ambient;
    const n = kind === 'snow' ? 60 : 36;
    for (let i = 0; i < n; i++) {
      this.ambient.push({
        x: rng(),
        y: rng(),
        p: rng() * TAU,
        s: 0.6 + rng() * 1.2,
        v: 0.5 + rng() * 0.8,
        kind
      });
    }
  },

  // Небо рисуется в экранных координатах и заполняет весь экран
  drawSky(ctx, vw, vh, gy, camX, zoom, time, quality) {
    const b = this.biome;
    if (!this.skyGrad || this.skyH !== gy) {
      const grad = ctx.createLinearGradient(0, 0, 0, Math.max(gy, 1));
      grad.addColorStop(0, b.sky[0]);
      grad.addColorStop(0.62, b.sky[1]);
      grad.addColorStop(1, b.sky[2]);
      this.skyGrad = grad;
      this.skyH = gy;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, vw, vh);

    // Звёзды
    if (this.stars.length) {
      ctx.fillStyle = '#ffffff';
      this.stars.forEach((s) => {
        ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.sp + s.p));
        const x = (s.u * vw - camX * 0.02 * zoom + vw) % vw;
        ctx.beginPath();
        ctx.arc(x, s.v * gy, s.r, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // Северное сияние в неоновом мире
    if (b.aurora && quality > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const cols = ['rgba(41,243,255,0.1)', 'rgba(255,43,214,0.1)', 'rgba(120,255,160,0.07)'];
      cols.forEach((col, k) => {
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        (quality > 1 ? [90, 44] : [64]).forEach((w) => {
          ctx.lineWidth = w;
          ctx.beginPath();
          for (let i = 0; i <= 14; i++) {
            const x = (i / 14) * vw;
            const y = gy * (0.22 + k * 0.1) + Math.sin(i * 0.7 + time * 0.35 + k * 2) * gy * 0.06 + Math.sin(i * 0.23 + time * 0.2) * gy * 0.05;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        });
      });
      ctx.globalCompositeOperation = 'source-over';
    }

    // Светило
    const lightDef = b.sun || b.moon;
    if (lightDef && this.sunSprite) {
      const scale = clamp(zoom, 0.75, 1.3);
      const size = (lightDef.r / 58) * 360 * scale;
      const lx = lightDef.x * vw - camX * 0.03 * zoom;
      const ly = lightDef.y * gy;
      if (this.raysSprite && quality > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(lx, ly);
        ctx.rotate(time * 0.05);
        const rs = size * 1.9;
        ctx.drawImage(this.raysSprite, -rs / 2, -rs / 2, rs, rs);
        ctx.restore();
      }
      ctx.drawImage(this.sunSprite, lx - size / 2, ly - size / 2, size, size);
    }

    // Зарево вулкана
    if (b.lavaGlow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.34 + 0.12 * Math.sin(time * 1.7);
      const w = Math.max(vw * 1.3, 900);
      ctx.drawImage(softSprite('#ff5a1f'), vw / 2 - w / 2, gy - w * 0.4, w, w * 0.8);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Облака плывут и заполняют небо даже на высоком экране
    const count = clamp(Math.round(gy / 75), 4, this.clouds.length);
    for (let i = 0; i < count; i++) {
      const c = this.clouds[i];
      const sp = this.cloudSprites[c.sprite];
      const k = c.s * clamp(zoom, 0.7, 1.2);
      const w = sp.w * k;
      const h = sp.h * k;
      const range = vw + w * 2;
      let x = ((c.u + time * c.speed) * range - camX * 0.06 * zoom) % range;
      if (x < 0) x += range;
      ctx.globalAlpha = c.a;
      ctx.drawImage(sp.c, x - w, c.v * gy - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  },

  // Параллакс-слои привязаны к линии земли
  drawLayer(ctx, layer, parallax, camX, scale, gy, vw) {
    const w = layer.W * scale;
    const h = layer.H * scale;
    let x = -((camX * parallax * scale) % w);
    if (x > 0) x -= w;
    for (; x < vw; x += w) {
      ctx.drawImage(layer.c, Math.floor(x), gy - h + 4, Math.ceil(w) + 1, h);
    }
  },

  // Земля тайлится по видимой области мира
  drawGround(ctx, viewL, viewR, bottom, overlap) {
    const y = GROUND_Y - GROUND_TILE_TOP;
    const deepY = y + GROUND_TILE_H - 0.5;
    const start = Math.floor(viewL / GROUND_TILE_W) * GROUND_TILE_W;
    if (bottom > deepY) {
      for (let x = start; x < viewR; x += GROUND_TILE_W) {
        ctx.drawImage(this.deep.c, x, deepY, GROUND_TILE_W + overlap, DEEP_TILE_H);
      }
      const end = deepY + DEEP_TILE_H - 0.5;
      if (bottom > end) {
        ctx.fillStyle = this.biome.dirt[2];
        ctx.fillRect(viewL, end, viewR - viewL, bottom - end);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(viewL, end, viewR - viewL, bottom - end);
      }
    }
    for (let x = start; x < viewR; x += GROUND_TILE_W) {
      ctx.drawImage(this.ground.c, x, y, GROUND_TILE_W + overlap, GROUND_TILE_H);
    }
  },

  drawFrontGrass(ctx, viewL, viewR, overlap) {
    const tile = this.front;
    const y = GROUND_Y - 34 + 8;
    let x = Math.floor(viewL / GROUND_TILE_W) * GROUND_TILE_W;
    for (; x < viewR; x += GROUND_TILE_W) {
      ctx.drawImage(tile.c, x, y, GROUND_TILE_W + overlap, 34);
    }
  },

  // Пыльца, лепестки, снег, светлячки и искры поверх сцены
  drawAmbient(ctx, vw, vh, gy, dt, time, paused, quality) {
    const list = this.ambient;
    const h = Math.max(gy + 20, 1);
    const stride = quality === 0 ? 2 : 1;
    for (let i = 0; i < list.length; i += stride) {
      const a = list[i];
      if (!paused) {
        if (a.kind === 'snow') {
          a.y += dt * 0.07 * a.v;
          a.x += dt * 0.012 * Math.sin(time * 0.7 + a.p);
        } else if (a.kind === 'petals') {
          a.y += dt * 0.05 * a.v;
          a.x += dt * (0.02 + 0.03 * Math.sin(time * 0.9 + a.p));
        } else if (a.kind === 'embers') {
          a.y -= dt * 0.1 * a.v;
          a.x += dt * 0.02 * Math.sin(time * 1.3 + a.p);
        } else if (a.kind === 'dust') {
          a.x += dt * 0.035 * a.v;
          a.y += dt * 0.006 * Math.sin(time + a.p);
        } else if (a.kind === 'fireflies') {
          a.x += dt * 0.022 * Math.sin(time * 0.6 + a.p * 3);
          a.y += dt * 0.018 * Math.cos(time * 0.5 + a.p * 2);
        } else {
          a.y -= dt * 0.012 * a.v;
          a.x += dt * 0.012 * Math.sin(time * 0.5 + a.p);
        }
        if (a.y > 1) a.y -= 1;
        if (a.y < 0) a.y += 1;
        if (a.x > 1) a.x -= 1;
        if (a.x < 0) a.x += 1;
      }
      const x = a.x * vw;
      const y = a.y * h;
      if (a.kind === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(x, y, 1.5 * a.s, 0, TAU);
        ctx.fill();
      } else if (a.kind === 'petals') {
        ctx.fillStyle = 'rgba(255,225,242,0.92)';
        ctx.beginPath();
        ctx.ellipse(x, y, 4.2 * a.s, 2 * a.s, time * 1.6 + a.p, 0, TAU);
        ctx.fill();
      } else {
        const color = a.kind === 'embers' ? '#ff7a1a' : a.kind === 'fireflies' ? '#c8ff5c' : a.kind === 'dust' ? '#ffd9a0' : '#fff6a0';
        const pulse = a.kind === 'fireflies' ? 0.35 + 0.65 * Math.abs(Math.sin(time * 1.5 + a.p)) : 0.7;
        const size = (a.kind === 'embers' || a.kind === 'fireflies' ? 13 : 7) * a.s;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pulse;
        ctx.drawImage(softSprite(color), x - size / 2, y - size / 2, size, size);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
};

// Мини-картинка мира для карточки уровня
function biomeThumb(index, w, h) {
  const b = BIOMES[index];
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, b.sky[0]);
  sky.addColorStop(0.7, b.sky[1]);
  sky.addColorStop(1, b.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  if (b.sun || b.moon) {
    const l = b.sun || b.moon;
    g.fillStyle = b.sun ? b.sun.c : '#e8ddff';
    g.beginPath();
    g.arc(l.x * w, l.y * h + 8, h * 0.14, 0, TAU);
    g.fill();
  }
  const hills = (base, amp, seed, col) => {
    const f = periodic(w, seed, [[1, amp], [2, amp * 0.5], [5, amp * 0.2]]);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 2) g.lineTo(x, h * base + f(x));
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  };
  hills(0.55, h * 0.1, 3 + index, b.far[0]);
  hills(0.72, h * 0.07, 9 + index, b.mid[1]);
  g.fillStyle = b.grass[1];
  g.fillRect(0, h * 0.84, w, h * 0.16);
  return c;
}
