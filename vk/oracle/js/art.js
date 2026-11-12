// Рисунки «Лунного оракула»: лицевая сторона карт таро и рубашка (canvas), руны на камне (SVG).
// Если для карты есть картинка (js/art-list.js → assets/tarot/<id>.webp|.jpg), она ложится под
// рамку и табличку с именем; если нет — карта рисуется кодом: золотые линии ар-нуво на индиго.
// Все размеры карты — в условной сетке 300×450 (2:3), вызывающий код только масштабирует.
import { SUITS, ROMAN } from "./deck.js?v=3f732425";
import { ART } from "./art-list.js?v=3f732425";
import { hash, seeded } from "./calc.js?v=3f732425";

export const FONT = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
export const CW = 300,
  CH = 450;
const TAU = Math.PI * 2;

// ---------- Готовые картинки ----------
const images = new Map();
export function artImage(id) {
  if (!ART[id]) return Promise.resolve(null);
  if (!images.has(id))
    images.set(
      id,
      new Promise((done) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => done(img);
        img.onerror = () => done(null);
        // путь от самого модуля: так картинки находятся и со страницы приложения, и с tests/cards.html
        img.src = new URL("../assets/" + ART[id], import.meta.url).href;
      }),
    );
  return images.get(id);
}

// ---------- Краски ----------
const TONES = {
  major: ["#1a1140", "#2d1b5c", "#4a2a78", "rgba(255,214,150,.38)"],
  wands: ["#1d1236", "#3a1f4f", "#5e3146", "rgba(255,176,96,.34)"],
  cups: ["#0f1739", "#1b2c5b", "#22476e", "rgba(140,200,255,.30)"],
  swords: ["#141536", "#262a5e", "#3c3f7e", "rgba(205,212,255,.30)"],
  pentacles: ["#131a2d", "#1f3249", "#2e4a3d", "rgba(206,232,150,.26)"],
};
function gold(c, x0, y0, x1, y1) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "#f8e8b4");
  g.addColorStop(0.45, "#ddb56c");
  g.addColorStop(1, "#a8773b");
  return g;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
// Звёздная пыль: точки разной яркости, узор зависит от зерна
function dust(c, seed, n, x, y, w, h, color = "255,236,200") {
  const rnd = seeded(seed);
  for (let i = 0; i < n; i++) {
    const r = 0.3 + rnd() * rnd() * 1.6;
    c.fillStyle = `rgba(${color},${(0.15 + rnd() * 0.7).toFixed(2)})`;
    c.beginPath();
    c.arc(x + rnd() * w, y + rnd() * h, r, 0, TAU);
    c.fill();
  }
}
// Четырёхлучевая искорка
function sparkle(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

// ---------- Простые фигуры для эмблем (сетка −50…50) ----------
const P = {
  circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.stroke();
  },
  line(c, ...pts) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.stroke();
  },
  poly(c, pts) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.stroke();
  },
  star(c, x, y, n, r1, r2, rot = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n;
      const r = i % 2 ? r2 : r1;
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    P.poly(c, pts);
  },
  rays(c, x, y, r1, r2, n, from = 0, to = TAU) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const full = to - from >= TAU - 1e-6;
      const a = full ? from + (i * TAU) / n : from + ((to - from) * i) / (n - 1);
      c.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      c.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
    }
    c.stroke();
  },
  crescent(c, x, y, r, tilt = -0.5) {
    c.beginPath();
    c.arc(x, y, r, tilt + 0.9, tilt + TAU - 0.9);
    const ix = x + Math.cos(tilt) * r * 0.55,
      iy = y + Math.sin(tilt) * r * 0.55;
    c.arc(ix, iy, r * 0.82, tilt + TAU - 1.55, tilt + 1.55, true);
    c.closePath();
    c.stroke();
  },
  lemniscate(c, x, y, a) {
    c.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * TAU;
      const d = 1 + Math.sin(t) ** 2;
      const px = x + (a * Math.cos(t)) / d,
        py = y + (a * Math.sin(t) * Math.cos(t)) / d;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();
  },
  ellipse(c, x, y, rx, ry, rot = 0) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, TAU);
    c.stroke();
  },
  cup(c, x, y, s) {
    c.beginPath();
    c.moveTo(x - 0.34 * s, y - 0.36 * s);
    c.quadraticCurveTo(x - 0.32 * s, y + 0.08 * s, x, y + 0.1 * s);
    c.quadraticCurveTo(x + 0.32 * s, y + 0.08 * s, x + 0.34 * s, y - 0.36 * s);
    c.closePath();
    c.stroke();
    P.line(c, x, y + 0.1 * s, x, y + 0.34 * s);
    c.beginPath();
    c.ellipse(x, y + 0.38 * s, 0.2 * s, 0.05 * s, 0, 0, TAU);
    c.stroke();
  },
};

// Эмблемы Старших арканов — простые знаки золотой линией (не копия какой-либо колоды)
const EMBLEM = {
  fool(c) {
    P.circle(c, 26, -28, 8);
    P.rays(c, 26, -28, 12, 17, 8);
    c.beginPath();
    c.moveTo(-40, 42);
    c.bezierCurveTo(-6, 30, -34, 6, -6, -2);
    c.bezierCurveTo(16, -8, 0, -26, -16, -34);
    c.stroke();
    c.save();
    c.fillStyle = c.strokeStyle;
    sparkle(c, -18, -40, 6);
    c.restore();
  },
  magician(c) {
    P.lemniscate(c, 0, -32, 18);
    P.line(c, 0, -14, 0, 34);
    P.poly(c, [[0, -18], [4, -13], [0, -8], [-4, -13]]);
    P.line(c, -32, 40, 32, 40);
    P.line(c, -24, 34, -24, 40);
    P.line(c, 24, 34, 24, 40);
  },
  "high-priestess"(c) {
    for (const x of [-38, 26]) {
      P.poly(c, [[x, -36], [x + 12, -36], [x + 12, 40], [x, 40]]);
      P.line(c, x - 3, -40, x + 15, -40);
      P.line(c, x - 3, 44, x + 15, 44);
    }
    P.crescent(c, 0, -2, 13, 0);
    P.circle(c, 0, -2, 20);
  },
  empress(c) {
    P.circle(c, 0, -6, 16);
    P.line(c, 0, 10, 0, 40);
    P.line(c, -11, 27, 11, 27);
    c.save();
    c.fillStyle = c.strokeStyle;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + 0.25 + (i * (Math.PI - 0.5)) / 8;
      sparkle(c, Math.cos(a) * 36, -6 + Math.sin(a) * 36, 3.4);
    }
    c.restore();
  },
  emperor(c) {
    P.poly(c, [[-28, -4], [-28, -30], [-14, -14], [0, -36], [14, -14], [28, -30], [28, -4]]);
    P.poly(c, [[-22, 6], [22, 6], [22, 40], [-22, 40]]);
    P.poly(c, [[0, 14], [7, 23], [0, 32], [-7, 23]]);
  },
  hierophant(c) {
    P.line(c, 0, -40, 0, 42);
    P.line(c, -10, -28, 10, -28);
    P.line(c, -16, -16, 16, -16);
    P.line(c, -22, -4, 22, -4);
    P.circle(c, 0, -44, 3);
    P.circle(c, -24, 30, 6);
    P.circle(c, 24, 30, 6);
    P.line(c, -18, 30, -6, 30);
    P.line(c, 18, 30, 6, 30);
  },
  lovers(c) {
    P.circle(c, -11, 8, 19);
    P.circle(c, 11, 8, 19);
    P.circle(c, 0, -34, 6);
    P.rays(c, 0, -34, 9, 14, 8);
  },
  chariot(c) {
    for (const x of [-24, 24]) {
      P.circle(c, x, 28, 12);
      P.rays(c, x, 28, 0, 12, 4, 0.4);
    }
    c.beginPath();
    c.moveTo(-34, 14);
    c.lineTo(34, 14);
    c.moveTo(-28, 14);
    c.quadraticCurveTo(0, -24, 28, 14);
    c.stroke();
    P.star(c, 0, -34, 6, 9, 4);
  },
  strength(c) {
    P.lemniscate(c, 0, -34, 15);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      P.ellipse(c, Math.cos(a) * 12, 12 + Math.sin(a) * 12, 10, 6, a);
    }
    P.circle(c, 0, 12, 5);
  },
  hermit(c) {
    P.line(c, -22, -40, -22, 44);
    P.line(c, -22, -32, 6, -24);
    const pts = [];
    for (let i = 0; i < 6; i++) pts.push([6 + Math.cos((i * TAU) / 6) * 14, -6 + Math.sin((i * TAU) / 6) * 14]);
    P.poly(c, pts);
    P.line(c, 6, -24, 6, -20);
    P.star(c, 6, -6, 6, 7, 3);
  },
  wheel(c) {
    P.circle(c, 0, 0, 36);
    P.circle(c, 0, 0, 12);
    P.rays(c, 0, 0, 12, 36, 8);
    c.save();
    c.fillStyle = c.strokeStyle;
    for (let i = 0; i < 4; i++) sparkle(c, Math.cos((i * TAU) / 4 + Math.PI / 4) * 44, Math.sin((i * TAU) / 4 + Math.PI / 4) * 44, 4);
    c.restore();
  },
  justice(c) {
    P.line(c, 0, -36, 0, 40);
    P.line(c, -16, 40, 16, 40);
    P.line(c, -34, -24, 34, -24);
    P.circle(c, 0, -40, 3);
    for (const x of [-34, 34]) {
      P.line(c, x, -24, x - 10, 6);
      P.line(c, x, -24, x + 10, 6);
      c.beginPath();
      c.arc(x, 6, 11, 0, Math.PI);
      c.closePath();
      c.stroke();
    }
  },
  "hanged-man"(c) {
    P.line(c, -34, -40, 34, -40);
    P.line(c, -30, -40, -30, -28);
    P.line(c, 30, -40, 30, -28);
    P.line(c, 0, -40, 0, -12);
    P.poly(c, [[-16, -12], [16, -12], [0, 16]]);
    P.circle(c, 0, 30, 9);
    P.rays(c, 0, 30, 12, 17, 10);
  },
  death(c) {
    // Аркан перемен: рассвет над водой
    P.line(c, -44, 14, 44, 14);
    c.beginPath();
    c.arc(0, 14, 22, Math.PI, TAU);
    c.stroke();
    P.rays(c, 0, 14, 28, 40, 9, Math.PI + 0.2, TAU - 0.2);
    for (const y of [26, 36]) {
      c.beginPath();
      for (let x = -36; x <= 36; x += 2) {
        const yy = y + Math.sin(x / 5) * 2;
        x === -36 ? c.moveTo(x, yy) : c.lineTo(x, yy);
      }
      c.stroke();
    }
  },
  temperance(c) {
    P.cup(c, -26, 16, 34);
    P.cup(c, 26, -8, 34);
    c.beginPath();
    c.moveTo(-20, 4);
    c.bezierCurveTo(-14, -30, 14, -40, 22, -20);
    c.stroke();
    P.star(c, 0, -40, 4, 6, 2);
  },
  devil(c) {
    // Цепь привычек и ключ, который её открывает
    P.ellipse(c, -26, -8, 14, 9);
    P.ellipse(c, 0, -8, 9, 14);
    P.ellipse(c, 26, -8, 14, 9);
    P.circle(c, 0, 26, 6);
    P.line(c, 0, 32, 0, 46);
    P.line(c, 0, 40, 6, 40);
    P.line(c, 0, 45, 5, 45);
  },
  tower(c) {
    P.poly(c, [[-14, -24], [14, -24], [16, 42], [-16, 42]]);
    P.line(c, -18, -24, -18, -34, -10, -34, -10, -28, -3, -28, -3, -34, 3, -34, 3, -28, 10, -28, 10, -34, 18, -34, 18, -24);
    c.beginPath();
    c.moveTo(-5, 12);
    c.lineTo(-5, 4);
    c.arc(0, 4, 5, Math.PI, TAU);
    c.lineTo(5, 12);
    c.stroke();
    P.line(c, 40, -46, 22, -26, 32, -24, 14, -4);
  },
  star(c) {
    P.star(c, 0, -8, 8, 28, 10, -Math.PI / 2);
    c.save();
    c.fillStyle = c.strokeStyle;
    const pts = [[-36, -36], [34, -38], [-40, 6], [40, 4], [-24, 30], [24, 28], [0, 40]];
    for (const [x, y] of pts) sparkle(c, x, y, 4);
    c.restore();
  },
  moon(c) {
    P.crescent(c, 4, -10, 28, 0.3);
    for (const [x, y] of [[-16, 32], [0, 40], [16, 32]]) {
      c.beginPath();
      c.moveTo(x, y - 7);
      c.quadraticCurveTo(x + 5, y, x, y + 4);
      c.quadraticCurveTo(x - 5, y, x, y - 7);
      c.stroke();
    }
  },
  sun(c) {
    P.circle(c, 0, 0, 18);
    P.circle(c, 0, 0, 10);
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16;
      const r2 = i % 2 ? 32 : 42;
      P.line(c, Math.cos(a) * 24, Math.sin(a) * 24, Math.cos(a) * r2, Math.sin(a) * r2);
    }
  },
  judgement(c) {
    P.line(c, -38, 30, 12, -12);
    P.poly(c, [[12, -12], [20, -32], [34, -16]]);
    P.poly(c, [[-10, 6], [6, 20], [-6, 34], [-22, 20]]);
    P.line(c, -14, 20, 2, 20);
    P.line(c, -6, 12, -6, 28);
    P.rays(c, 27, -24, 14, 22, 5, -1.9, -0.1);
  },
  world(c) {
    P.ellipse(c, 0, 0, 26, 38);
    for (let i = 0; i < 20; i++) {
      const a = (i * TAU) / 20;
      const x = Math.cos(a) * 26,
        y = Math.sin(a) * 38;
      P.ellipse(c, x * 1.08, y * 1.04, 4.5, 2, a + Math.PI / 2);
    }
    c.save();
    c.fillStyle = c.strokeStyle;
    for (const [x, y] of [[-40, -42], [40, -42], [-40, 42], [40, 42]]) sparkle(c, x, y, 5);
    c.restore();
  },
};

// Знаки мастей (центр x, y; размер s)
const SUIT = {
  wands(c, x, y, s) {
    P.line(c, x - 0.08 * s, y + 0.48 * s, x + 0.08 * s, y - 0.44 * s);
    P.circle(c, x + 0.085 * s, y - 0.47 * s, 0.035 * s);
    for (const [t, side] of [[0.25, 1], [0.45, -1], [0.65, 1]]) {
      const px = x - 0.08 * s + 0.16 * s * t,
        py = y + 0.48 * s - 0.92 * s * t;
      P.ellipse(c, px + side * 0.1 * s, py - 0.03 * s, 0.1 * s, 0.04 * s, side * -0.6);
    }
  },
  cups(c, x, y, s) {
    P.cup(c, x, y, s);
  },
  swords(c, x, y, s) {
    P.poly(c, [[x, y - 0.5 * s], [x + 0.08 * s, y - 0.36 * s], [x + 0.08 * s, y + 0.18 * s], [x - 0.08 * s, y + 0.18 * s], [x - 0.08 * s, y - 0.36 * s]]);
    P.line(c, x, y - 0.34 * s, x, y + 0.12 * s);
    P.line(c, x - 0.22 * s, y + 0.21 * s, x + 0.22 * s, y + 0.21 * s);
    P.line(c, x, y + 0.21 * s, x, y + 0.4 * s);
    P.circle(c, x, y + 0.44 * s, 0.04 * s);
  },
  pentacles(c, x, y, s) {
    P.circle(c, x, y, 0.42 * s);
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * TAU) / 5;
      pts.push([x + Math.cos(a) * 0.36 * s, y + Math.sin(a) * 0.36 * s]);
    }
    P.poly(c, pts);
  },
};
// Расположение знаков на числовых картах (доли области 140×230 вокруг центра)
const PIPS = (() => {
  const a = {
    2: [[0, -0.33], [0, 0.33]],
    3: [[0, -0.38], [0, 0], [0, 0.38]],
    4: [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.3], [0.25, 0.3]],
    6: [[-0.25, -0.36], [0.25, -0.36], [-0.25, 0], [0.25, 0], [-0.25, 0.36], [0.25, 0.36]],
    8: [[-0.25, -0.4], [0.25, -0.4], [-0.25, -0.13], [0.25, -0.13], [-0.25, 0.13], [0.25, 0.13], [-0.25, 0.4], [0.25, 0.4]],
  };
  a[5] = [...a[4], [0, 0]];
  a[7] = [...a[6], [0, -0.18]];
  a[9] = [...a[8], [0, 0]];
  a[10] = [...a[8], [0, -0.265], [0, 0.265]];
  return a;
})();

// Мотивы придворных карт над знаком масти
const COURT = {
  11(c) {
    c.save();
    c.fillStyle = c.strokeStyle;
    sparkle(c, 0, 0, 12);
    c.restore();
  },
  12(c) {
    c.beginPath();
    c.moveTo(-22, 8);
    c.quadraticCurveTo(-8, -14, 0, -2);
    c.quadraticCurveTo(8, -14, 22, 8);
    c.moveTo(-16, 12);
    c.quadraticCurveTo(0, -4, 16, 12);
    c.stroke();
  },
  13(c) {
    P.crescent(c, 0, 0, 13, -Math.PI / 2);
    for (const x of [-18, 18]) P.circle(c, x, 2, 2.5);
  },
  14(c) {
    P.poly(c, [[-20, 10], [-20, -10], [-10, 0], [0, -14], [10, 0], [20, -10], [20, 10]]);
  },
};

// Угловой завиток ар-нуво: (x, y) — угол рамки, sx/sy — направление внутрь
function corner(c, x, y, sx, sy) {
  c.beginPath();
  c.moveTo(x, y + sy * 46);
  c.bezierCurveTo(x, y + sy * 20, x + sx * 6, y + sy * 6, x + sx * 46, y);
  c.moveTo(x + sx * 8, y + sy * 30);
  c.bezierCurveTo(x + sx * 10, y + sy * 14, x + sx * 16, y + sy * 10, x + sx * 30, y + sy * 8);
  c.stroke();
  c.beginPath();
  c.arc(x + sx * 15, y + sy * 15, 3.2, 0, TAU);
  c.stroke();
  c.beginPath();
  c.moveTo(x + sx * 15 + sx * 3, y + sy * 15 + sy * 3);
  c.quadraticCurveTo(x + sx * 26, y + sy * 26, x + sx * 22, y + sy * 34);
  c.stroke();
}
function frame(c, light = false) {
  c.lineJoin = "round";
  c.lineCap = "round";
  c.strokeStyle = gold(c, 0, 0, CW, CH);
  c.lineWidth = 2.2;
  roundRect(c, 8, 8, CW - 16, CH - 16, 12);
  c.stroke();
  c.lineWidth = 0.9;
  c.globalAlpha = 0.75;
  roundRect(c, 15, 15, CW - 30, CH - 30, 8);
  c.stroke();
  c.globalAlpha = 1;
  c.lineWidth = 1.3;
  corner(c, 15, 15, 1, 1);
  corner(c, CW - 15, 15, -1, 1);
  corner(c, 15, CH - 15, 1, -1);
  corner(c, CW - 15, CH - 15, -1, -1);
  // ромбики посередине сторон
  c.fillStyle = c.strokeStyle;
  for (const [x, y] of [[15, CH / 2], [CW - 15, CH / 2]]) {
    c.beginPath();
    c.moveTo(x, y - 7);
    c.lineTo(x + 4, y);
    c.lineTo(x, y + 7);
    c.lineTo(x - 4, y);
    c.closePath();
    c.fill();
  }
  if (light) return;
}

// Фон процедурной карты: градиент, мягкое свечение в центре, звёздная пыль
function backdrop(c, tone, seed) {
  const [a, b, d, glow] = tone;
  const g = c.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, a);
  g.addColorStop(0.55, b);
  g.addColorStop(1, d);
  c.fillStyle = g;
  c.fillRect(0, 0, CW, CH);
  const r = c.createRadialGradient(CW / 2, 200, 10, CW / 2, 200, 190);
  r.addColorStop(0, glow);
  r.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = r;
  c.fillRect(0, 0, CW, CH);
  dust(c, seed, 70, 18, 18, CW - 36, CH - 36);
}

// Табличка с именем внизу карты: имя подбирается по ширине
function namePlate(c, text) {
  const y = 398,
    h = 34,
    x0 = 34,
    x1 = CW - 34;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(x0 + 12, y - h / 2);
  c.lineTo(x1 - 12, y - h / 2);
  c.lineTo(x1, y);
  c.lineTo(x1 - 12, y + h / 2);
  c.lineTo(x0 + 12, y + h / 2);
  c.closePath();
  c.fillStyle = "rgba(16,10,38,.88)";
  c.fill();
  c.strokeStyle = gold(c, x0, 0, x1, 0);
  c.lineWidth = 1.4;
  c.stroke();
  let size = 23;
  c.font = `600 ${size}px ${FONT}`;
  while (c.measureText(text).width > x1 - x0 - 34 && size > 13) c.font = `600 ${--size}px ${FONT}`;
  c.fillStyle = "#f6e6bb";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, CW / 2, y + 1);
}
// Медальон сверху: римская цифра или маленький знак масти
function medallion(c, card) {
  c.beginPath();
  c.arc(CW / 2, 40, 17, 0, TAU);
  c.fillStyle = "rgba(16,10,38,.9)";
  c.fill();
  c.strokeStyle = gold(c, 130, 20, 170, 60);
  c.lineWidth = 1.4;
  c.stroke();
  c.fillStyle = "#f6e6bb";
  if (card.arcana === "major" || card.n <= 10) {
    const t = card.arcana === "major" ? ROMAN[card.n] : ROMAN[card.n];
    let size = t.length > 3 ? 13 : 16;
    c.font = `700 ${size}px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(t, CW / 2, 41);
  } else {
    c.lineWidth = 1.2;
    SUIT[card.arcana](c, CW / 2, 40, 22);
  }
}

// Центральный рисунок процедурной карты
function emblem(c, card, k) {
  c.save();
  c.lineJoin = "round";
  c.lineCap = "round";
  c.strokeStyle = gold(c, 60, 90, 240, 330);
  c.shadowColor = "rgba(255,214,150,.55)";
  c.shadowBlur = 9 * k;
  if (card.arcana === "major") {
    c.translate(CW / 2, 212);
    c.scale(1.5, 1.5);
    c.lineWidth = 2 / 1.5;
    EMBLEM[card.id.slice(9)]?.(c);
  } else if (card.n === 1) {
    // Туз: большой знак в сиянии
    c.lineWidth = 2;
    c.globalAlpha = 0.5;
    P.rays(c, CW / 2, 212, 74, 92, 24);
    c.globalAlpha = 1;
    P.circle(c, CW / 2, 212, 70);
    c.lineWidth = 2.2;
    SUIT[card.arcana](c, CW / 2, 212, 120);
  } else if (card.n <= 10) {
    const s = card.n <= 3 ? 64 : card.n <= 4 ? 60 : card.n <= 7 ? 50 : 42;
    c.lineWidth = 1.8;
    // мечи и жезлы — узкие вытянутые знаки, их можно рисовать крупнее
    const k = card.arcana === "swords" || card.arcana === "wands" ? 1.2 : 1;
    for (const [dx, dy] of PIPS[card.n]) SUIT[card.arcana](c, CW / 2 + dx * 140, 214 + dy * 230, s * k);
  } else {
    c.lineWidth = 2;
    P.circle(c, CW / 2, 236, 66);
    SUIT[card.arcana](c, CW / 2, 238, 100);
    c.translate(CW / 2, 140);
    c.scale(1.3, 1.3);
    c.lineWidth = 2 / 1.3;
    COURT[card.n](c);
  }
  c.restore();
}

// Лицевая сторона карты в контексте с уже заданным масштабом (единицы 300×450).
// img — готовая картинка или null; k — во сколько раз сетка увеличена (для мягкой тени).
export function drawFace(c, card, img, k = 1) {
  c.save();
  roundRect(c, 0, 0, CW, CH, 16);
  c.clip();
  if (img) {
    const s = Math.max(CW / img.width, CH / img.height);
    const w = img.width * s,
      h = img.height * s;
    c.drawImage(img, (CW - w) / 2, (CH - h) / 2, w, h);
    const v = c.createLinearGradient(0, CH - 120, 0, CH);
    v.addColorStop(0, "rgba(14,8,34,0)");
    v.addColorStop(1, "rgba(14,8,34,.75)");
    c.fillStyle = v;
    c.fillRect(0, CH - 120, CW, 120);
  } else {
    backdrop(c, TONES[card.arcana], hash(card.id));
    emblem(c, card, k);
  }
  frame(c);
  medallion(c, card);
  namePlate(c, card.name);
  c.restore();
}

// Рубашка: полумесяц со звездой в золотой мандале — как на иконке
export function drawBack(c, k = 1, img = null) {
  c.save();
  roundRect(c, 0, 0, CW, CH, 16);
  c.clip();
  if (img) {
    const s = Math.max(CW / img.width, CH / img.height);
    c.drawImage(img, (CW - img.width * s) / 2, (CH - img.height * s) / 2, img.width * s, img.height * s);
    c.restore();
    return;
  }
  backdrop(c, ["#1b1243", "#2b1b5a", "#3d2470", "rgba(255,214,150,.30)"], 77);
  frame(c);
  c.lineJoin = "round";
  c.lineCap = "round";
  c.strokeStyle = gold(c, 60, 120, 240, 330);
  c.shadowColor = "rgba(255,214,150,.5)";
  c.shadowBlur = 8 * k;
  const cx = CW / 2,
    cy = CH / 2;
  c.lineWidth = 1.4;
  P.circle(c, cx, cy, 78);
  P.circle(c, cx, cy, 70);
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    P.ellipse(c, cx + Math.cos(a) * 48, cy + Math.sin(a) * 48, 20, 8, a);
  }
  c.lineWidth = 1.8;
  P.circle(c, cx, cy, 30);
  P.crescent(c, cx - 2, cy - 2, 20, -0.4);
  c.fillStyle = c.strokeStyle;
  sparkle(c, cx + 9, cy + 2, 7);
  // лучики сверху и снизу
  c.lineWidth = 1.2;
  for (const dir of [-1, 1]) {
    P.line(c, cx, cy + dir * 86, cx, cy + dir * 150);
    P.poly(c, [[cx, cy + dir * 156], [cx + 6, cy + dir * 166], [cx, cy + dir * 176], [cx - 6, cy + dir * 166]]);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx, cy + dir * 104);
      c.quadraticCurveTo(cx + s * 34, cy + dir * 112, cx + s * 40, cy + dir * 140);
      c.stroke();
    }
  }
  c.shadowBlur = 0;
  for (const [x, y, r] of [[60, 70, 4], [242, 92, 5], [52, 360, 5], [246, 376, 4], [94, 200, 3], [208, 252, 3]]) sparkle(c, x, y, r);
  c.restore();
}

// Нарисовать карту в canvas по его размеру на экране (с учётом плотности пикселей)
export async function paintCard(canvas, card) {
  const img = await artImage(card.id);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(60, Math.round(canvas.clientWidth * ratio)) || 300;
  canvas.width = w;
  canvas.height = Math.round((w * CH) / CW);
  const c = canvas.getContext("2d");
  c.setTransform(w / CW, 0, 0, w / CW, 0, 0);
  drawFace(c, card, img, w / CW);
}

// Рубашка картинкой (data URL) — одна на все карты, рисуется один раз
let backURL = null;
export async function backImage() {
  if (backURL) return backURL;
  const img = await artImage("back");
  const cv = document.createElement("canvas");
  cv.width = 360;
  cv.height = 540;
  const c = cv.getContext("2d");
  c.setTransform(1.2, 0, 0, 1.2, 0, 0);
  drawBack(c, 1.2, img);
  backURL = cv.toDataURL("image/png");
  return backURL;
}

// ---------- Руны на камне (SVG) ----------
let uid = 0;
function stonePath(seed) {
  const rnd = seeded(seed);
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    pts.push([60 + Math.cos(a) * (47 + rnd() * 7), 80 + Math.sin(a) * (64 + rnd() * 8)]);
  }
  // сглаженный замкнутый контур через середины отрезков
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = pts[i],
      q = pts[(i + 1) % n];
    const m = mid(p, q);
    if (!i) d += `M${mid(pts[n - 1], p).map((v) => v.toFixed(1)).join(" ")} `;
    d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)} `;
  }
  return d + "Z";
}
// rune — запись из runes.js; hidden — камень гладкой стороной вверх
export function runeSVG(rune, { reversed = false, hidden = false } = {}) {
  const id = "r" + ++uid;
  const rnd = seeded(hash(rune.id + "speck"));
  let specks = "";
  for (let i = 0; i < 14; i++)
    specks += `<circle cx="${(20 + rnd() * 80).toFixed(1)}" cy="${(24 + rnd() * 112).toFixed(1)}" r="${(0.6 + rnd() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.05 + rnd() * 0.12).toFixed(2)}"/>`;
  const strokes = hidden ? [] : rune.glyph;
  const glyph = strokes
    .map((pts) => `<polyline points="${pts}" fill="none" stroke-linecap="round" stroke-linejoin="round"`)
    .map((p) => `${p} stroke="#140f26" stroke-width="13" opacity=".55" transform="translate(1.5 2)"/>${p} stroke="url(#${id}a)" stroke-width="9"/>`)
    .join("");
  const blank = rune.blank && !hidden ? `<ellipse cx="60" cy="80" rx="20" ry="28" fill="none" stroke="url(#${id}a)" stroke-width="2" stroke-dasharray="3 5" opacity=".7"/>` : "";
  return `<svg class="stone" viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${hidden ? "Руна лицом вниз" : "Руна " + rune.name}">
<defs><radialGradient id="${id}g" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#9a93b8"/><stop offset=".5" stop-color="#5e5679"/><stop offset="1" stop-color="#2c2743"/></radialGradient>
<linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbeab4"/><stop offset=".5" stop-color="#e0b66a"/><stop offset="1" stop-color="#b07f40"/></linearGradient></defs>
<path d="${stonePath(hash(rune.id))}" fill="url(#${id}g)" stroke="#1b1730" stroke-opacity=".6" stroke-width="1.5"/>
<path d="M30 44 Q46 22 74 24" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>
${specks}${blank}
<g transform="translate(60 80) ${reversed ? "rotate(180)" : ""} scale(.66) translate(-50 -70)">${glyph}</g></svg>`;
}

// SVG → картинка для canvas (истории)
export function svgImage(svg) {
  return new Promise((done) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

export { roundRect, gold, sparkle, dust, corner };
