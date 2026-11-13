// Текстуры поверхностей, нарисованные на холсте при загрузке (файлов картинок нет).
// Рисунок светлый: цвет даёт цвет вершин коробки, текстура — фактуру.
import { canvasTexture, noiseRand, T } from "./kit.js?v=83cf1cc4";

// метров на один повтор текстуры
export const TEX_SCALE = {
  asphalt: 5, concrete: 3, panel: 3, brick: 2.4, metal: 2.2, hazard: 1.2, crate: 0, corr: 2.44, sand: 7, rock: 3,
  tile: 1.5, carpet: 2.4, wood: 1.6, solar: 1.3, glass: 3, server: 2.2, none: 4,
};
// шероховатость и металличность материалов
export const TEX_PBR = {
  asphalt: [0.88, 0], concrete: [0.9, 0], panel: [0.7, 0.05], brick: [0.92, 0], metal: [0.42, 0.65], hazard: [0.6, 0.2], crate: [0.85, 0],
  corr: [0.55, 0.35], sand: [0.97, 0], rock: [0.95, 0], tile: [0.32, 0], carpet: [0.98, 0], wood: [0.7, 0], solar: [0.18, 0.4],
  glass: [0.05, 0.1], server: [0.4, 0.5], none: [0.9, 0],
};

function speckle(c, w, h, n, a, b, r, rnd) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(a + rnd() * (b - a));
    c.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.5})`;
    c.fillRect(rnd() * w, rnd() * h, r * (0.5 + rnd()), r * (0.5 + rnd()));
  }
}
function blotches(c, w, h, n, dark, rnd, size = 0.3) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, R = w * size * (0.3 + rnd());
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    const v = dark ? 0 : 255;
    g.addColorStop(0, `rgba(${v},${v},${v},${0.05 + rnd() * 0.08})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    c.fillStyle = g;
    c.fillRect(x - R, y - R, R * 2, R * 2);
  }
}
function base(c, w, h, v) {
  c.fillStyle = `rgb(${v},${v},${v})`;
  c.fillRect(0, 0, w, h);
}
// грязь книзу (v растёт вниз на холсте; низ стены — низ картинки)
function grime(c, w, h, k = 0.25) {
  const g = c.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, "rgba(40,30,20,0)");
  g.addColorStop(1, `rgba(40,30,20,${k})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

const PAINT = {
  asphalt(c, w, h, r) {
    base(c, w, h, 205);
    blotches(c, w, h, 14, true, r, 0.35);
    speckle(c, w, h, w * 6, 150, 255, w / 256, r);
    // трещины
    c.strokeStyle = "rgba(40,40,40,0.35)";
    c.lineWidth = w / 400;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      let x = r() * w, y = r() * h;
      c.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (r() - 0.5) * w * 0.12;
        y += (r() - 0.5) * h * 0.12;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  },
  concrete(c, w, h, r) {
    base(c, w, h, 218);
    blotches(c, w, h, 18, true, r, 0.25);
    blotches(c, w, h, 8, false, r, 0.3);
    speckle(c, w, h, w * 3, 170, 240, w / 300, r);
    c.fillStyle = "rgba(60,60,60,0.35)";
    c.fillRect(0, 0, w, Math.max(1, w / 220));
    c.fillRect(0, 0, Math.max(1, w / 220), h);
    // отверстия опалубки
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      c.fillStyle = "rgba(70,70,70,0.4)";
      c.beginPath();
      c.arc(x * w, y * h, w / 110, 0, 7);
      c.fill();
    }
  },
  panel(c, w, h, r) {
    base(c, w, h, 228);
    blotches(c, w, h, 10, true, r, 0.3);
    c.fillStyle = "rgba(50,50,60,0.45)";
    for (let i = 0; i < 3; i++) c.fillRect(0, (i * h) / 3, w, Math.max(1, w / 200));
    c.fillRect(0, 0, Math.max(1, w / 200), h);
    c.fillStyle = "rgba(255,255,255,0.25)";
    for (let i = 0; i < 3; i++) c.fillRect(0, (i * h) / 3 + w / 200, w, Math.max(1, w / 400));
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 6; k++) {
        c.fillStyle = "rgba(40,40,50,0.5)";
        c.beginPath();
        c.arc(((k + 0.5) * w) / 6, (i * h) / 3 + w / 40, w / 260, 0, 7);
        c.fill();
      }
    grime(c, w, h, 0.18);
  },
  brick(c, w, h, r) {
    base(c, w, h, 150);
    const rows = 12, cols = 4;
    for (let y = 0; y < rows; y++)
      for (let x = -1; x < cols; x++) {
        const off = (y % 2) * 0.5;
        const v = 175 + r() * 70;
        c.fillStyle = `rgb(${v},${v * 0.97},${v * 0.95})`;
        c.fillRect(((x + off) * w) / cols + w / 160, (y * h) / rows + h / 160, w / cols - w / 80, h / rows - h / 80);
      }
    speckle(c, w, h, w * 2, 120, 230, w / 300, r);
    grime(c, w, h, 0.3);
  },
  metal(c, w, h, r) {
    base(c, w, h, 210);
    for (let i = 0; i < h; i += 2) {
      const v = 190 + r() * 40;
      c.fillStyle = `rgba(${v},${v},${v},0.35)`;
      c.fillRect(0, i, w, 1);
    }
    c.strokeStyle = "rgba(255,255,255,0.25)";
    c.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      const x = r() * w, y = r() * h;
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * w * 0.3, y + (r() - 0.5) * h * 0.05);
      c.stroke();
    }
    c.fillStyle = "rgba(30,30,30,0.5)";
    c.fillRect(0, 0, w, w / 160);
    c.fillRect(0, 0, w / 160, h);
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.arc(((k + 0.5) * w) / 4, w / 40, w / 200, 0, 7);
      c.fill();
    }
    blotches(c, w, h, 8, true, r, 0.25);
  },
  hazard(c, w, h) {
    base(c, w, h, 245);
    c.fillStyle = "rgb(28,28,28)";
    for (let i = -4; i < 8; i++) {
      c.beginPath();
      const x = (i * w) / 4;
      c.moveTo(x, 0);
      c.lineTo(x + w / 8, 0);
      c.lineTo(x + w / 8 + w / 2, h);
      c.lineTo(x + w / 2, h);
      c.fill();
    }
  },
  crate(c, w, h, r) {
    base(c, w, h, 205);
    for (let i = 0; i < 6; i++) {
      const v = 185 + r() * 50;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(0, (i * h) / 6 + 1, w, h / 6 - 2);
      c.fillStyle = "rgba(60,40,20,0.25)";
      for (let k = 0; k < 6; k++) c.fillRect(r() * w, (i * h) / 6 + r() * (h / 6), w * 0.2 * r(), 1);
    }
    const f = w * 0.09;
    c.fillStyle = "rgb(150,140,130)";
    c.fillRect(0, 0, w, f);
    c.fillRect(0, h - f, w, f);
    c.fillRect(0, 0, f, h);
    c.fillRect(w - f, 0, f, h);
    c.save();
    c.translate(w / 2, h / 2);
    c.rotate(Math.PI / 4);
    c.fillRect(-w * 0.7, -f / 2, w * 1.4, f);
    c.restore();
    c.strokeStyle = "rgba(40,30,20,0.6)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, w - 2, h - 2);
  },
  corr(c, w, h, r) {
    base(c, w, h, 210);
    const n = 24;
    for (let i = 0; i < n; i++) {
      const x = (i * w) / n;
      const g = c.createLinearGradient(x, 0, x + w / n, 0);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(0.45, "rgba(0,0,0,0.0)");
      g.addColorStop(0.55, "rgba(0,0,0,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0.15)");
      c.fillStyle = g;
      c.fillRect(x, 0, w / n, h);
    }
    // ржавчина и потёки
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(110,50,20,${0.08 + r() * 0.18})`;
      const x = r() * w;
      c.fillRect(x, r() * h * 0.3, w / 90, h * (0.1 + r() * 0.5));
    }
    c.fillStyle = "rgba(30,30,30,0.55)";
    c.fillRect(0, 0, w, h * 0.035);
    c.fillRect(0, h * 0.965, w, h * 0.035);
    grime(c, w, h, 0.3);
  },
  sand(c, w, h, r) {
    base(c, w, h, 228);
    blotches(c, w, h, 30, true, r, 0.4);
    blotches(c, w, h, 16, false, r, 0.35);
    c.strokeStyle = "rgba(120,90,60,0.12)";
    c.lineWidth = w / 120;
    for (let i = 0; i < 14; i++) {
      c.beginPath();
      const y = (i / 14) * h + r() * 8;
      c.moveTo(0, y);
      for (let x = 0; x <= w; x += w / 16) c.lineTo(x, y + Math.sin(x * 0.05 + i) * h * 0.012);
      c.stroke();
    }
    speckle(c, w, h, w * 1.2, 190, 245, w / 700, r);
  },
  rock(c, w, h, r) {
    base(c, w, h, 200);
    blotches(c, w, h, 30, true, r, 0.2);
    blotches(c, w, h, 14, false, r, 0.2);
    c.strokeStyle = "rgba(50,35,25,0.35)";
    c.lineWidth = w / 200;
    for (let i = 0; i < 10; i++) {
      c.beginPath();
      c.moveTo(r() * w, r() * h);
      c.lineTo(r() * w, r() * h);
      c.stroke();
    }
    speckle(c, w, h, w * 3, 140, 240, w / 250, r);
  },
  tile(c, w, h, r) {
    base(c, w, h, 160);
    const n = 3;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 220 + r() * 30;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect((x * w) / n + w / 120, (y * h) / n + h / 120, w / n - w / 60, h / n - h / 60);
        const g = c.createLinearGradient((x * w) / n, (y * h) / n, ((x + 1) * w) / n, ((y + 1) * h) / n);
        g.addColorStop(0, "rgba(255,255,255,0.18)");
        g.addColorStop(1, "rgba(0,0,0,0.06)");
        c.fillStyle = g;
        c.fillRect((x * w) / n + w / 120, (y * h) / n + h / 120, w / n - w / 60, h / n - h / 60);
      }
    blotches(c, w, h, 6, true, r, 0.3);
  },
  carpet(c, w, h, r) {
    base(c, w, h, 205);
    speckle(c, w, h, w * 10, 160, 250, w / 380, r);
    c.strokeStyle = "rgba(255,255,255,0.12)";
    c.lineWidth = w / 70;
    c.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
  },
  wood(c, w, h, r) {
    base(c, w, h, 200);
    for (let i = 0; i < h; i += 2) {
      const v = 175 + Math.sin(i * 0.08 + Math.sin(i * 0.013) * 4) * 25 + r() * 10;
      c.fillStyle = `rgba(${v},${v * 0.92},${v * 0.85},0.6)`;
      c.fillRect(0, i, w, 2);
    }
    c.fillStyle = "rgba(60,40,20,0.35)";
    for (let i = 0; i < 4; i++) c.fillRect(0, (i * h) / 4, w, Math.max(1, w / 260));
  },
  solar(c, w, h) {
    base(c, w, h, 120);
    const n = 6;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const g = c.createLinearGradient((x * w) / n, (y * h) / n, ((x + 1) * w) / n, ((y + 1) * h) / n);
        g.addColorStop(0, "rgb(190,200,230)");
        g.addColorStop(1, "rgb(120,130,170)");
        c.fillStyle = g;
        c.fillRect((x * w) / n + 2, (y * h) / n + 2, w / n - 4, h / n - 4);
      }
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillRect(0, h / 2 - 1, w, 2);
  },
  glass(c, w, h) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgb(255,255,255)");
    g.addColorStop(0.45, "rgb(200,220,235)");
    g.addColorStop(0.5, "rgb(255,255,255)");
    g.addColorStop(0.56, "rgb(205,222,235)");
    g.addColorStop(1, "rgb(235,245,255)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(60,70,80,0.8)";
    c.fillRect(0, 0, w, w / 64);
    c.fillRect(0, h - w / 64, w, w / 64);
  },
  server(c, w, h, r) {
    base(c, w, h, 70);
    const rows = 10;
    for (let y = 0; y < rows; y++) {
      c.fillStyle = "rgb(95,100,110)";
      c.fillRect(w * 0.04, (y * h) / rows + 2, w * 0.92, h / rows - 4);
      c.fillStyle = "rgb(40,44,50)";
      for (let k = 0; k < 14; k++) c.fillRect(w * 0.08 + k * w * 0.045, (y * h) / rows + h / rows * 0.35, w * 0.03, h / rows * 0.3);
    }
    void r;
  },
  none(c, w, h) {
    base(c, w, h, 255);
  },
};

// огоньки серверных стоек (карта свечения)
function serverGlow(c, w, h, r) {
  c.fillStyle = "#000";
  c.fillRect(0, 0, w, h);
  const rows = 10;
  for (let y = 0; y < rows; y++)
    for (let k = 0; k < 4; k++) {
      c.fillStyle = r() < 0.7 ? "#3dff8a" : r() < 0.5 ? "#4fb8ff" : "#ff5a3a";
      c.fillRect(w * 0.74 + k * w * 0.045, (y * h) / rows + h / rows * 0.4, w * 0.022, h / rows * 0.2);
    }
}

const cache = new Map();
export function surfaceTexture(kind, size = 256) {
  const key = kind + size;
  if (!cache.has(key)) {
    const rnd = noiseRand(kind.length * 977 + 13);
    const t = canvasTexture(size, size, (c, w, h) => (PAINT[kind] || PAINT.none)(c, w, h, rnd), { aniso: 8 });
    cache.set(key, t);
  }
  return cache.get(key);
}
export function serverGlowTexture(size = 256) {
  const rnd = noiseRand(4242);
  return canvasTexture(size, size, (c, w, h) => serverGlow(c, w, h, rnd));
}
// надпись-табличка
export function signTexture(text, o = {}) {
  const w = o.w || 512, h = o.h || 128;
  return canvasTexture(w, h, (c) => {
    c.fillStyle = o.bg || "#1b2430";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = o.edge || "#ffb02e";
    c.lineWidth = 8;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = o.fg || "#f4f1ea";
    c.font = `800 ${Math.round(h * 0.5)}px Rubik, Arial, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, w / 2, h / 2 + 4, w - 40);
  }, { clamp: true });
}
export { T };
