// Отрисовка уровня: фон главы, земля (кэш в отдельном холсте), линии, герои, опасности, частицы.
import { W, H, LINE_VIEW, HERO_R, WALKER_R, BERRY_R, HOUSE_R } from "./world.js?v=dbaf642d";
import { patrolAt } from "./sim.js?v=dbaf642d";
import { rng, dist, cumLengths, pathAt } from "./geom.js?v=dbaf642d";
import * as A from "./art.js?v=dbaf642d";

const { ellipse, TAU } = A;

// ---------- Темы глав ----------
export const THEMES = [
  {
    // Солнечная опушка
    sky: ["#9fdcff", "#d8f3ff", "#fff3d2"],
    sun: "#fff6c0",
    far: "#a8dc8e",
    mid: "#7cc46a",
    fill: "#8a5e3c",
    dots: "#a8764c",
    top: "#6fc94a",
    topHi: "#a6e86a",
    line: "#3a2616",
    ink: "#3b2f8f",
    inkHi: "#8a7dff",
    inkEdge: "#1a1440",
    home: ["#9bd86e", "#86cb5c"],
    obstacle: "bush",
    mote: "rgba(255,255,220,.8)",
  },
  {
    // Каменистые холмы
    sky: ["#ffc98a", "#ffe2b8", "#fff4dc"],
    sun: "#fff0b0",
    far: "#f0b27a",
    mid: "#d98c52",
    fill: "#c27a46",
    dots: "#a8623a",
    top: "#efb06e",
    topHi: "#ffd39a",
    line: "#4a2412",
    ink: "#2f2a7a",
    inkHi: "#7d78ff",
    inkEdge: "#15123a",
    home: ["#e9c38a", "#ddb47a"],
    obstacle: "rock",
    mote: "rgba(255,230,190,.7)",
  },
  {
    // Тёплая бухта
    sky: ["#7fd2ff", "#bdeaff", "#f1fbff"],
    sun: "#ffffff",
    far: "#3fb2d6",
    mid: "#7ad0c0",
    fill: "#e2bb7a",
    dots: "#c99e5c",
    top: "#f6dfa6",
    topHi: "#fff3cc",
    line: "#6a4a22",
    ink: "#3a2a86",
    inkHi: "#8f80ff",
    inkEdge: "#191242",
    home: ["#f1d79e", "#e8cb8c"],
    obstacle: "shell",
    mote: "rgba(255,255,255,.8)",
  },
  {
    // Снежный перевал
    sky: ["#a9c4ff", "#d6e4ff", "#f3f7ff"],
    sun: "#ffffff",
    far: "#dbe7ff",
    mid: "#b4c9f0",
    fill: "#8ea6d6",
    dots: "#a9bde6",
    top: "#f8fbff",
    topHi: "#ffffff",
    line: "#3a4a7a",
    ink: "#2b2f86",
    inkHi: "#7c86ff",
    inkEdge: "#121540",
    home: ["#eef4ff", "#e2ebfb"],
    obstacle: "drift",
    mote: "rgba(255,255,255,.95)",
  },
  {
    // Огненная гора
    sky: ["#3a1830", "#8a3040", "#ff9a5a"],
    sun: "#ffcf8a",
    far: "#5a2434",
    mid: "#3e1a26",
    fill: "#4e3a40",
    dots: "#5e4850",
    top: "#7a5a5a",
    topHi: "#9a7a72",
    line: "#160c10",
    ink: "#2a3a9a",
    inkHi: "#9fb0ff",
    inkEdge: "#0a0e30",
    home: ["#5a464a", "#4e3c40"],
    obstacle: "basalt",
    mote: "rgba(255,170,90,.9)",
  },
  {
    // Ночные крыши
    sky: ["#141a40", "#262e66", "#43407a"],
    sun: "#fff6d6",
    far: "#2c3266",
    mid: "#222652",
    fill: "#b05a4c",
    dots: "#9a4a40",
    top: "#d87a62",
    topHi: "#f2a084",
    line: "#1a1228",
    ink: "#ffd75a",
    inkHi: "#fff6c8",
    inkEdge: "#7a4a10",
    home: ["#3a3f72", "#343868"],
    obstacle: "chimney",
    mote: "rgba(255,240,140,.9)",
    glow: "rgba(255,210,80,.8)",
  },
  {
    // Лунная роща
    sky: ["#0b1430", "#1d2c5a", "#3a4a80"],
    sun: "#f6f4ff",
    far: "#1b2a50",
    mid: "#132040",
    fill: "#3b4d48",
    dots: "#4a5e56",
    top: "#4f9a6a",
    topHi: "#8fe0a0",
    line: "#0a1018",
    ink: "#3fdcc8",
    inkHi: "#e2fff8",
    inkEdge: "#0a4248",
    home: ["#273a4c", "#22344a"],
    obstacle: "grove",
    mote: "rgba(210,255,150,.95)",
    glow: "rgba(90,240,220,.85)",
  },
];

export class View {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext("2d");
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.s = 1;
    this.ox = 0;
    this.oy = 0;
    this.mode = "side";
    this.parts = [];
    this.shakeT = 0;
    this.bg = null;
    this.terrain = null;
    this.key = "";
    this.motes = [];
    const r = rng(7);
    for (let i = 0; i < 44; i++) this.motes.push({ x: r() * W, y: r() * H, s: 1 + r() * 2.5, p: r() * 6, v: 6 + r() * 14 });
    this.hq = true; // высокое качество: свечение, параллакс, облака и больше частиц
    this.flashT = 0;
    this.par = { x: 0, y: 0 }; // сдвиг фона (параллакс)
    this.inkStyle = null; // линия из Мастерской
    this.hat = null; // шапка Тоши
    this.clouds = null;
  }
  setQuality(hq) {
    if (this.hq === hq) return;
    this.hq = hq;
    this.key = "";
    if (!hq) this.parts.length = Math.min(this.parts.length, 150);
  }

  // Размер окна → где мир и где кнопки (сбоку или сверху)
  resize(w, h, safe) {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.hq ? 2 : 1);
    this.w = w;
    this.h = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    const side = w < 900 ? 60 : 72,
      top = h < 450 ? 54 : 64;
    const aw = w - safe.l - safe.r,
      ah = h - safe.t - safe.b;
    const sA = Math.min((aw - 2 * side) / W, (ah - 6) / H);
    const sB = Math.min((aw - 8) / W, (ah - top - 4) / H);
    if (sA >= sB) {
      this.mode = "side";
      this.s = sA;
      this.ox = safe.l + side + (aw - 2 * side - W * sA) / 2;
      this.oy = safe.t + (ah - H * sA) / 2;
    } else {
      this.mode = "top";
      this.s = sB;
      this.ox = safe.l + (aw - W * sB) / 2;
      this.oy = safe.t + top + (ah - top - H * sB) / 2;
    }
    this.key = "";
  }
  toWorld(px, py) {
    return [(px - this.ox) / this.s, (py - this.oy) / this.s];
  }
  toScreen(x, y) {
    return [this.ox + x * this.s, this.oy + y * this.s];
  }
  worldTransform(c, shake = true) {
    const k = this.dpr;
    let sx = 0,
      sy = 0;
    if (shake && this.shakeT > 0) {
      const a = this.shakeT * 9;
      sx = Math.sin(performance.now() * 0.09) * a;
      sy = Math.cos(performance.now() * 0.11) * a;
    }
    c.setTransform(k * this.s, 0, 0, k * this.s, k * (this.ox + sx), k * (this.oy + sy));
  }
  shake(v) {
    this.shakeT = Math.max(this.shakeT, v);
  }

  // ---------- Кэш фона и земли ----------
  prepare(L, chapter) {
    const key = `${L ? L.index : "c" + chapter}:${this.w}x${this.h}:${this.dpr}`;
    if (key === this.key) return;
    this.key = key;
    const th = THEMES[chapter];
    this.th = th;
    this.bg = this.layer();
    const home = L && L.type === "home";
    if (home) this.homeGround(this.bg.getContext("2d"), th, chapter);
    else this.backdrop(this.bg.getContext("2d"), th, chapter);
    this.clouds = this.hq && chapter < 4 ? this.cloudSprites() : null;
    this.grade = this.hq ? this.gradeLayer(th, chapter, L && L.type === "home") : null;
    this.terrain = this.layer();
    if (L) {
      const c = this.terrain.getContext("2d");
      this.worldTransform(c, false);
      if (home) this.homeObstacles(c, L, th);
      else this.ground(c, L, th, chapter);
    }
  }
  // «Свет и виньетка» поверх мира: тёплый свет со стороны солнца (луны), мягкое затемнение краёв.
  // Рисуется один раз на размер экрана, в кадре — одно наложение.
  gradeLayer(th, ch, flat) {
    const cv = this.layer();
    const c = cv.getContext("2d");
    const w = cv.width,
      h = cv.height;
    if (!flat) {
      const [sx, sy] = this.toScreen(ch === 5 ? 1040 : ch === 6 ? 1010 : 980, ch === 4 ? 520 : 120);
      const lg = c.createRadialGradient(sx * this.dpr, sy * this.dpr, 0, sx * this.dpr, sy * this.dpr, Math.max(w, h) * 0.9);
      const warm = ch >= 4 ? (ch === 4 ? "255,150,80" : "190,210,255") : "255,236,190";
      lg.addColorStop(0, `rgba(${warm},.55)`);
      lg.addColorStop(0.45, `rgba(${warm},.18)`);
      lg.addColorStop(1, `rgba(${warm},0)`);
      c.fillStyle = lg;
      c.fillRect(0, 0, w, h);
    }
    const vg = c.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, ch >= 4 ? "rgba(0,0,10,.62)" : "rgba(10,0,30,.42)");
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
    return cv;
  }
  // Облака плывут по небу отдельно от фона (только в высоком качестве)
  cloudSprites() {
    const out = [];
    const r = rng(77);
    for (let k = 0; k < 3; k++) {
      const s = 34 * Math.max(this.s, 0.5) * this.dpr;
      const cv = document.createElement("canvas");
      cv.width = Math.ceil(s * (3.4 + (4 + k) * 0.85));
      cv.height = Math.ceil(s * 2.8);
      const c = cv.getContext("2d");
      c.fillStyle = "rgba(255,255,255,.78)";
      for (let j = 0; j < 4 + k; j++) {
        c.beginPath();
        c.arc(s * 1.1 + j * s * 0.85, s * 1.5 - (j % 2) * s * 0.3, s * (0.62 + r() * 0.35), 0, TAU);
        c.fill();
      }
      c.fillStyle = "rgba(255,255,255,.35)";
      c.fillRect(s * 0.6, s * 1.6, s * (3.4 + k * 0.6), s * 0.3);
      out.push(cv);
    }
    return out;
  }
  layer() {
    const cv = document.createElement("canvas");
    cv.width = this.cv.width;
    cv.height = this.cv.height;
    return cv;
  }

  backdrop(c, th, ch) {
    const k = this.dpr,
      w = this.w,
      h = this.h;
    c.setTransform(k, 0, 0, k, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(0.55, th.sky[1]);
    g.addColorStop(1, th.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const r = rng(ch * 31 + 5);
    // солнце или луна
    const [sx, sy] = this.toScreen(ch === 5 ? 1040 : ch === 6 ? 1010 : 980, ch === 4 ? 520 : ch === 6 ? 140 : 120);
    const sr = 46 * this.s;
    const glow = c.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 4);
    glow.addColorStop(0, ch === 4 ? "rgba(255,200,120,.55)" : "rgba(255,255,230,.6)");
    glow.addColorStop(1, "rgba(255,255,230,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    c.fillStyle = th.sun;
    c.beginPath();
    c.arc(sx, sy, sr, 0, TAU);
    c.fill();
    if (ch === 6) {
      // полная луна с кратерами и звёзды
      c.fillStyle = "rgba(180,190,230,.45)";
      for (const [dx, dy, rr] of [
        [-0.3, -0.2, 0.22],
        [0.25, 0.1, 0.16],
        [-0.05, 0.4, 0.12],
        [0.35, -0.35, 0.09],
      ]) {
        c.beginPath();
        c.arc(sx + dx * sr, sy + dy * sr, rr * sr, 0, TAU);
        c.fill();
      }
      for (let i = 0; i < 120; i++) {
        c.fillStyle = `rgba(255,255,240,${0.25 + r() * 0.75})`;
        const x = r() * w,
          y = r() * h * 0.65,
          s = 0.6 + r() * 1.8;
        c.fillRect(x, y, s, s);
      }
    }
    if (ch === 5) {
      c.fillStyle = th.sky[0];
      c.beginPath();
      c.arc(sx + sr * 0.45, sy - sr * 0.25, sr * 0.85, 0, TAU);
      c.fill();
      for (let i = 0; i < 90; i++) {
        c.fillStyle = `rgba(255,255,230,${0.3 + r() * 0.7})`;
        const x = r() * w,
          y = r() * h * 0.6,
          s = 0.6 + r() * 1.6;
        c.fillRect(x, y, s, s);
      }
    }
    // облака (в высоком качестве они плывут отдельно)
    if (ch < 4 && !this.hq) {
      c.fillStyle = "rgba(255,255,255,.75)";
      for (let i = 0; i < 6; i++) {
        const x = r() * w,
          y = (0.08 + r() * 0.3) * h,
          s = (30 + r() * 40) * Math.max(this.s, 0.5);
        for (let j = 0; j < 4; j++) {
          c.beginPath();
          c.arc(x + j * s * 0.7, y + (j % 2) * s * 0.2, s * (0.6 + (j % 2) * 0.3), 0, TAU);
          c.fill();
        }
      }
    }
    // дальний и средний планы
    const base = this.oy + 470 * this.s;
    const layer = (col, y0, amp, freq, seed, jag) => {
      const q = rng(seed);
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, h);
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * w;
        let y = y0 + Math.sin(i * freq + q() * 2) * amp + q() * amp * 0.4;
        if (jag) y -= (i % 2) * amp * 0.9;
        c.lineTo(x, y);
      }
      c.lineTo(w, h);
      c.fill();
    };
    if (ch === 0) {
      layer(th.far, base - 120 * this.s, 36 * this.s, 0.7, 3);
      layer(th.mid, base - 40 * this.s, 26 * this.s, 1.1, 4);
      // деревья на среднем плане
      const q = rng(9);
      for (let i = 0; i < 9; i++) {
        const x = q() * w,
          y = base - (40 + q() * 30) * this.s,
          s = (26 + q() * 22) * this.s;
        c.fillStyle = "#6a4a2a";
        c.fillRect(x - s * 0.12, y, s * 0.24, s * 1.2);
        c.fillStyle = i % 2 ? "#5fb257" : "#4ea64a";
        c.beginPath();
        c.arc(x, y, s, 0, TAU);
        c.arc(x - s * 0.6, y + s * 0.3, s * 0.7, 0, TAU);
        c.arc(x + s * 0.6, y + s * 0.3, s * 0.7, 0, TAU);
        c.fill();
      }
    } else if (ch === 1) {
      // столовые горы
      const q = rng(11);
      c.fillStyle = th.far;
      for (let i = 0; i < 5; i++) {
        const x = q() * w,
          ww = (120 + q() * 160) * this.s,
          hh = (110 + q() * 120) * this.s;
        c.beginPath();
        c.moveTo(x - ww / 2 - 30 * this.s, base);
        c.lineTo(x - ww / 2, base - hh);
        c.lineTo(x + ww / 2, base - hh);
        c.lineTo(x + ww / 2 + 30 * this.s, base);
        c.fill();
      }
      layer(th.mid, base - 20 * this.s, 22 * this.s, 0.9, 12);
    } else if (ch === 2) {
      // море и острова
      c.fillStyle = th.far;
      c.fillRect(0, base - 60 * this.s, w, h);
      c.fillStyle = "rgba(255,255,255,.35)";
      for (let i = 0; i < 40; i++) c.fillRect(r() * w, base - 60 * this.s + r() * 200 * this.s, (10 + r() * 30) * this.s, 2 * this.s);
      c.fillStyle = "#5aa58a";
      for (let i = 0; i < 3; i++) {
        const x = (0.15 + i * 0.33 + r() * 0.1) * w;
        c.beginPath();
        c.ellipse(x, base - 60 * this.s, (70 + r() * 60) * this.s, (30 + r() * 20) * this.s, 0, Math.PI, 0);
        c.fill();
      }
    } else if (ch === 3) {
      layer(th.far, base - 170 * this.s, 70 * this.s, 1.6, 21, true);
      layer(th.mid, base - 70 * this.s, 40 * this.s, 1.3, 22, true);
      // снежные шапки — светлые полосы
      c.fillStyle = "rgba(255,255,255,.5)";
      for (let i = 0; i < 12; i++) c.fillRect(r() * w, base - (150 + r() * 80) * this.s, 40 * this.s, 6 * this.s);
    } else if (ch === 4) {
      // вулкан со свечением
      const vx = w * 0.3,
        vy = base - 230 * this.s;
      c.fillStyle = th.far;
      c.beginPath();
      c.moveTo(vx - 420 * this.s, base + 40 * this.s);
      c.lineTo(vx - 70 * this.s, vy);
      c.lineTo(vx + 70 * this.s, vy);
      c.lineTo(vx + 420 * this.s, base + 40 * this.s);
      c.fill();
      const lg = c.createRadialGradient(vx, vy, 4, vx, vy, 180 * this.s);
      lg.addColorStop(0, "rgba(255,160,60,.8)");
      lg.addColorStop(1, "rgba(255,100,40,0)");
      c.fillStyle = lg;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(255,120,40,.7)";
      c.lineWidth = 5 * this.s;
      c.beginPath();
      c.moveTo(vx - 20 * this.s, vy + 4);
      c.quadraticCurveTo(vx - 40 * this.s, vy + 120 * this.s, vx - 110 * this.s, vy + 210 * this.s);
      c.stroke();
      layer(th.mid, base - 10 * this.s, 30 * this.s, 1.4, 41, true);
    } else if (ch === 6) {
      // лунная роща: холмы, силуэты деревьев, светящиеся грибы и полосы тумана
      layer(th.far, base - 110 * this.s, 34 * this.s, 0.8, 61);
      const q = rng(63);
      for (let i = 0; i < 16; i++) {
        const x = q() * w,
          y = base - (10 + q() * 50) * this.s,
          s = (30 + q() * 34) * this.s;
        c.fillStyle = i % 3 ? th.mid : "#0f1a34";
        c.fillRect(x - s * 0.1, y, s * 0.2, s * 1.6);
        if (i % 2) {
          // ёлка
          for (let j = 0; j < 3; j++) {
            c.beginPath();
            c.moveTo(x - s * (0.9 - j * 0.2), y + s * (0.4 - j * 0.55));
            c.lineTo(x, y - s * (0.6 + j * 0.55));
            c.lineTo(x + s * (0.9 - j * 0.2), y + s * (0.4 - j * 0.55));
            c.fill();
          }
        } else {
          c.beginPath();
          c.arc(x, y - s * 0.3, s, 0, TAU);
          c.arc(x - s * 0.7, y + s * 0.1, s * 0.7, 0, TAU);
          c.arc(x + s * 0.7, y + s * 0.1, s * 0.7, 0, TAU);
          c.fill();
        }
      }
      layer(th.mid, base - 20 * this.s, 22 * this.s, 1.2, 64);
      // светящиеся грибочки
      for (let i = 0; i < 14; i++) {
        const x = q() * w,
          y = base - (8 + q() * 20) * this.s,
          s = (5 + q() * 6) * this.s;
        const gl = c.createRadialGradient(x, y, 1, x, y, s * 4);
        gl.addColorStop(0, "rgba(120,255,220,.5)");
        gl.addColorStop(1, "rgba(120,255,220,0)");
        c.fillStyle = gl;
        c.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
        c.fillStyle = i % 2 ? "#7ff5d6" : "#c9a6ff";
        c.beginPath();
        c.ellipse(x, y, s, s * 0.6, 0, Math.PI, 0);
        c.fill();
        c.fillStyle = "#e8f0ff";
        c.fillRect(x - s * 0.18, y, s * 0.36, s * 0.8);
      }
      // туман
      for (let i = 0; i < 5; i++) {
        c.fillStyle = "rgba(170,190,255,.07)";
        ellipse(c, q() * w, base - (40 + q() * 160) * this.s, (200 + q() * 260) * this.s, (16 + q() * 18) * this.s);
        c.fill();
      }
    } else {
      // ночной город
      const q = rng(51);
      for (let layerN = 0; layerN < 2; layerN++) {
        c.fillStyle = layerN ? th.mid : th.far;
        let x = -20;
        while (x < w) {
          const bw = (50 + q() * 70) * this.s,
            bh = (layerN ? 80 : 160) * this.s + q() * 120 * this.s;
          c.fillRect(x, base - bh + layerN * 60 * this.s, bw, h);
          for (let i = 0; i < 10; i++)
            if (q() < 0.45) {
              c.fillStyle = `rgba(255,220,120,${0.35 + q() * 0.5})`;
              c.fillRect(x + q() * (bw - 8 * this.s), base - bh + layerN * 60 * this.s + 10 * this.s + q() * bh * 0.8, 6 * this.s, 8 * this.s);
              c.fillStyle = layerN ? th.mid : th.far;
            }
          x += bw + 6 * this.s;
        }
      }
    }
  }

  homeGround(c, th, ch) {
    const k = this.dpr,
      w = this.w,
      h = this.h;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = th.home[0];
    c.fillRect(0, 0, w, h);
    const r = rng(ch * 13 + 2);
    // пятна и мелочи на земле
    for (let i = 0; i < 70; i++) {
      c.fillStyle = th.home[1];
      ellipse(c, r() * w, r() * h, (20 + r() * 60) * this.s, (10 + r() * 30) * this.s, r() * 3);
      c.fill();
    }
    const deco = [
      ["#ffe96a", "#ff8ab0", "#ffffff"],
      ["#b48a5a", "#9a7048", "#d8b080"],
      ["#ffffff", "#ffb0a0", "#d8c090"],
      ["#ffffff", "#d0e0ff", "#c0d4f8"],
      ["#ff8a3a", "#7a5a5a", "#ffb060"],
      ["#ffe9a0", "#8a90c8", "#6a70b0"],
      ["#9ff5c8", "#c8b8ff", "#5a7a8a"],
    ][ch];
    for (let i = 0; i < 110; i++) {
      c.fillStyle = deco[i % 3];
      c.globalAlpha = 0.75;
      const s = (2 + r() * 3) * this.s;
      ellipse(c, r() * w, r() * h, s, s);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  ground(c, L, th, ch) {
    const solid = L.terrain.filter((p) => p.m !== "water" && p.m !== "lava" && p.m !== "spring" && !p.move && p.door == null);
    const path = (p) => {
      c.beginPath();
      if (p.verts) {
        p.verts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
      } else c.arc(p.x, p.y, p.r, 0, TAU);
    };
    // тень
    c.save();
    c.shadowColor = "rgba(20,10,30,.35)";
    c.shadowBlur = 22 * this.s * this.dpr;
    c.shadowOffsetY = 8 * this.s * this.dpr;
    for (const p of solid) {
      path(p);
      c.fillStyle = th.line;
      c.fill();
    }
    c.restore();
    // контур (толстая обводка всех кусков, потом заливка поверх — внутренние швы пропадают)
    c.lineJoin = "round";
    for (const p of solid) {
      path(p);
      c.lineWidth = 8;
      c.strokeStyle = MAT_LINE[p.m] || th.line;
      c.stroke();
    }
    for (const p of solid) {
      path(p);
      c.fillStyle = this.matFill(c, p, th);
      c.fill();
      this.matDetail(c, p, th, path);
      // объём: верх куска чуть светлее, низ темнее
      const b = bounds(p);
      c.save();
      path(p);
      c.clip();
      const vg = c.createLinearGradient(0, b.y0, 0, Math.min(b.y1, b.y0 + 260));
      vg.addColorStop(0, "rgba(255,255,255,.14)");
      vg.addColorStop(0.35, "rgba(255,255,255,0)");
      vg.addColorStop(1, "rgba(10,0,30,.16)");
      c.fillStyle = vg;
      c.fillRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
      c.restore();
    }
    // верхняя кромка (трава, песок, снег) по рёбрам, смотрящим вверх
    const isGround = (p) => p.m === "ground";
    for (const p of solid) {
      if (!p.verts) continue;
      const band = p.m === "ground" ? th.top : p.m === "stone" ? "#c9c2ba" : p.m === "snow" ? "#ffffff" : null;
      if (!band) continue;
      const v = p.verts;
      for (let i = 0; i < v.length; i++) {
        const a = v[i],
          b = v[(i + 1) % v.length];
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          len = Math.hypot(dx, dy);
        if (len < 2 || dx <= 0 || Math.abs(dy / dx) > 1.6) continue;
        // ребро, по которому идём слева направо — верхнее (для обхода по часовой стрелке)
        const n = Math.ceil(len / 10);
        for (let j = 0; j < n; j++) {
          const t0 = j / n,
            t1 = (j + 1) / n;
          const mx = a[0] + dx * (t0 + t1) * 0.5,
            my = a[1] + dy * (t0 + t1) * 0.5;
          if (solid.some((o) => o !== p && inside(o, mx, my - 6))) continue;
          c.strokeStyle = band;
          c.lineWidth = 14;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(a[0] + dx * t0, a[1] + dy * t0 + 5);
          c.lineTo(a[0] + dx * t1, a[1] + dy * t1 + 5);
          c.stroke();
          if (isGround(p) && (ch === 0 || ch === 2 || ch === 3)) {
            c.strokeStyle = th.topHi;
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(a[0] + dx * t0, a[1] + dy * t0 + 1);
            c.lineTo(a[0] + dx * t1, a[1] + dy * t1 + 1);
            c.stroke();
          }
          // травинки и камушки
          if (isGround(p) && ch === 0 && (j * 7 + i) % 3 === 0) {
            c.strokeStyle = "#4fa83a";
            c.lineWidth = 2.5;
            c.beginPath();
            c.moveTo(mx - 4, my);
            c.lineTo(mx - 6, my - 9);
            c.moveTo(mx, my);
            c.lineTo(mx + 1, my - 12);
            c.moveTo(mx + 4, my);
            c.lineTo(mx + 7, my - 8);
            c.stroke();
            if ((j + i) % 11 === 0) {
              c.fillStyle = ["#ffe14a", "#ff8ab0", "#ffffff"][(j + i) % 3];
              ellipse(c, mx + 2, my - 14, 4, 4);
              c.fill();
            }
          }
        }
      }
    }
  }
  matFill(c, p, th) {
    switch (p.m) {
      case "stone":
        return "#9d958f";
      case "wood":
        return "#c88f55";
      case "ice":
        return "#c4efff";
      case "metal":
        return "#8f9bb0";
      case "spikes":
        return "#7d7a86";
      case "cloud":
        return "#f4f6ff";
      case "snow":
        return "#d9e5fa";
      default:
        return th.fill;
    }
  }
  matDetail(c, p, th, path) {
    c.save();
    path(p);
    c.clip();
    const b = bounds(p);
    const r = rng(Math.round(b.x0 * 7 + b.y0 * 13));
    if (p.m === "ground") {
      c.fillStyle = th.dots;
      for (let i = 0; i < ((b.x1 - b.x0) * Math.min(400, b.y1 - b.y0)) / 2600; i++) {
        ellipse(c, b.x0 + r() * (b.x1 - b.x0), b.y0 + r() * Math.min(400, b.y1 - b.y0), 4 + r() * 6, 3 + r() * 4, r());
        c.fill();
      }
    } else if (p.m === "snow") {
      c.fillStyle = "rgba(140,170,225,.35)";
      for (let i = 0; i < ((b.x1 - b.x0) * Math.min(400, b.y1 - b.y0)) / 3000; i++) {
        ellipse(c, b.x0 + r() * (b.x1 - b.x0), b.y0 + 20 + r() * Math.min(380, b.y1 - b.y0), 5 + r() * 9, 3 + r() * 4, r() * 0.4);
        c.fill();
      }
    } else if (p.m === "wood") {
      c.strokeStyle = "rgba(90,52,24,.45)";
      c.lineWidth = 2;
      for (let y = b.y0 + 9; y < b.y1; y += 12) {
        c.beginPath();
        c.moveTo(b.x0, y);
        c.lineTo(b.x1, y + (r() - 0.5) * 6);
        c.stroke();
      }
    } else if (p.m === "stone" || p.m === "spikes") {
      c.strokeStyle = "rgba(50,40,40,.3)";
      c.lineWidth = 2.5;
      for (let i = 0; i < ((b.x1 - b.x0) * Math.min(300, b.y1 - b.y0)) / 5000 + 1; i++) {
        const x = b.x0 + r() * (b.x1 - b.x0),
          y = b.y0 + r() * Math.min(300, b.y1 - b.y0);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 10, y + 8);
        c.lineTo(x + 6, y + 18);
        c.stroke();
      }
    } else if (p.m === "ice") {
      c.strokeStyle = "rgba(255,255,255,.8)";
      c.lineWidth = 4;
      for (let x = b.x0 - 200; x < b.x1; x += 46) {
        c.beginPath();
        c.moveTo(x, b.y1);
        c.lineTo(x + 200, b.y0);
        c.stroke();
      }
    } else if (p.m === "metal") {
      c.fillStyle = "#5a6478";
      for (let x = b.x0 + 10; x < b.x1; x += 30)
        for (let y = b.y0 + 9; y < Math.min(b.y1, b.y0 + 300); y += 30) {
          ellipse(c, x, y, 3, 3);
          c.fill();
        }
    }
    c.restore();
    if (p.m === "spikes" && p.verts) {
      // шипы по верхнему ребру
      const [a, bb] = topEdge(p.verts);
      const len = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
      const n = Math.max(2, Math.round(len / 22));
      const nx = (a[1] - bb[1]) / len,
        ny = (bb[0] - a[0]) / len;
      c.fillStyle = "#e6e9f2";
      c.strokeStyle = "#3a3d48";
      c.lineWidth = 2.5;
      for (let i = 0; i < n; i++) {
        const t0 = i / n,
          t1 = (i + 1) / n,
          tm = (t0 + t1) / 2;
        c.beginPath();
        c.moveTo(a[0] + (bb[0] - a[0]) * t0, a[1] + (bb[1] - a[1]) * t0);
        c.lineTo(a[0] + (bb[0] - a[0]) * tm - nx * 20, a[1] + (bb[1] - a[1]) * tm - ny * 20);
        c.lineTo(a[0] + (bb[0] - a[0]) * t1, a[1] + (bb[1] - a[1]) * t1);
        c.fill();
        c.stroke();
      }
    }
  }

  homeObstacles(c, L, th) {
    for (const p of L.terrain) {
      c.save();
      c.shadowColor = "rgba(20,10,30,.3)";
      c.shadowBlur = 14 * this.s * this.dpr;
      c.shadowOffsetY = 6 * this.s * this.dpr;
      if (p.m === "water" || p.m === "lava") {
        c.fillStyle = p.m === "lava" ? "#ff7a2a" : "#4fb0e8";
        c.strokeStyle = p.m === "lava" ? "#8a2a10" : "#2a6a9a";
      } else {
        const style = {
          bush: ["#4ea64a", "#2a6a2a"],
          rock: ["#b0a59c", "#5a4a40"],
          shell: ["#c9b08a", "#6a5032"],
          drift: ["#fbfdff", "#6f88c0"],
          basalt: ["#3a2c30", "#120a0e"],
          chimney: ["#a8564a", "#3a1a1a"],
          grove: ["#6a5a8a", "#221a3a"],
        }[th.obstacle];
        c.fillStyle = p.m === "stone" ? "#a39a92" : style[0];
        c.strokeStyle = p.m === "stone" ? "#4a3e36" : style[1];
      }
      c.lineWidth = 5;
      c.lineJoin = "round";
      c.beginPath();
      if (p.verts) {
        p.verts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
      } else if (th.obstacle === "bush" && p.m !== "stone") {
        // куст — несколько кругов
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          c.moveTo(p.x + Math.cos(a) * p.r * 0.55 + p.r * 0.45, p.y + Math.sin(a) * p.r * 0.55);
          c.arc(p.x + Math.cos(a) * p.r * 0.55, p.y + Math.sin(a) * p.r * 0.55, p.r * 0.45, 0, TAU);
        }
      } else c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
      c.restore();
      c.stroke();
      const b = bounds(p);
      // тень снизу справа — объём
      c.save();
      c.clip();
      c.fillStyle = th.obstacle === "drift" && p.m !== "stone" && p.m !== "water" && p.m !== "lava" ? "rgba(120,150,210,.28)" : "rgba(0,0,0,.12)";
      ellipse(c, b.x1 - (b.x1 - b.x0) * 0.2, b.y1 - (b.y1 - b.y0) * 0.15, (b.x1 - b.x0) * 0.55, (b.y1 - b.y0) * 0.45);
      c.fill();
      c.restore();
      // блик
      c.fillStyle = "rgba(255,255,255,.25)";
      ellipse(c, b.x0 + (b.x1 - b.x0) * 0.35, b.y0 + (b.y1 - b.y0) * 0.3, (b.x1 - b.x0) * 0.18, (b.y1 - b.y0) * 0.1, -0.4);
      c.fill();
    }
  }

  // ---------- Кадр ----------
  render(g, now) {
    const c = this.c,
      k = this.dpr;
    const L = g.L;
    this.prepare(L, g.chapter);
    const t = now / 1000;
    const dt = g.dt || 0.016;
    c.setTransform(1, 0, 0, 1, 0, 0);
    // Параллакс: фон чуть сдвигается за пальцем (или героем) — земля стоит на месте
    const ch = g.chapter;
    if (this.hq && L?.type !== "home") {
      let fx = W / 2,
        fy = H / 2;
      const tip = g.pen?.pts?.length ? g.pen.pts[g.pen.pts.length - 1] : null;
      const hero = g.sim?.heroes?.[0]?.b.position;
      if (tip) (fx = tip[0]), (fy = tip[1]);
      else if (hero) (fx = hero.x), (fy = hero.y);
      const tx = ((W / 2 - fx) / W) * 22 + Math.sin(t * 0.21) * 5,
        ty = ((H / 2 - fy) / H) * 10 + Math.sin(t * 0.17) * 3;
      const k = Math.min(1, dt * 2.5);
      this.par.x += (tx - this.par.x) * k;
      this.par.y += (ty - this.par.y) * k;
      const m = 18 * this.dpr,
        cw = this.cv.width,
        chh = this.cv.height;
      c.drawImage(this.bg, -m + this.par.x * this.dpr, -m + this.par.y * this.dpr, cw + 2 * m, chh + 2 * m);
      // облака плывут и сдвигаются сильнее фона — глубина
      if (this.clouds) {
        const r = rng(ch * 17 + 3);
        for (let i = 0; i < 6; i++) {
          const img = this.clouds[i % 3];
          const span = cw + img.width;
          const x = ((r() * span + t * (6 + r() * 8) * this.dpr + this.par.x * 1.8 * this.dpr) % span) - img.width;
          const y = (0.04 + r() * 0.3) * chh + this.par.y * 1.5 * this.dpr;
          c.drawImage(img, x, y);
        }
      }
    } else c.drawImage(this.bg, 0, 0);
    // пылинки, снежинки, искры, светлячки — фоновая жизнь
    this.worldTransform(c, false);
    c.fillStyle = this.th.mote;
    const motes = this.hq ? this.motes.length : 20;
    for (let i = 0; i < motes; i++) {
      const m = this.motes[i];
      let x = m.x + Math.sin(t * 0.5 + m.p) * 30,
        y = m.y;
      if (ch === 3) y = (m.y + t * m.v * 3) % H;
      else if (ch === 4) y = H - ((m.y + t * m.v * 2.5) % H);
      else y = m.y + Math.sin(t * 0.7 + m.p) * 20;
      if (ch === 6) {
        // светлячки рощи мигают и тепло светятся
        const a = Math.max(0, Math.sin(t * 1.6 + m.p * 3));
        if (a < 0.05) continue;
        if (this.hq) {
          const gl = c.createRadialGradient(x, y, 0, x, y, 10 + m.s * 3);
          gl.addColorStop(0, `rgba(220,255,140,${0.5 * a})`);
          gl.addColorStop(1, "rgba(220,255,140,0)");
          c.fillStyle = gl;
          c.globalAlpha = 1;
          ellipse(c, x, y, 10 + m.s * 3, 10 + m.s * 3);
          c.fill();
          c.fillStyle = this.th.mote;
        }
        c.globalAlpha = a;
      } else c.globalAlpha = ch === 5 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + m.p)) : 0.55;
      ellipse(c, x, y, m.s, m.s);
      c.fill();
    }
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.shakeT > 0) {
      const a = this.shakeT * 9 * k;
      c.drawImage(this.terrain, Math.sin(now * 0.09) * a, Math.cos(now * 0.11) * a);
    } else c.drawImage(this.terrain, 0, 0);
    if (!L || !g.sim) return;
    this.worldTransform(c);
    if (L.type === "home") this.drawHome(c, g, t);
    else this.drawPhys(c, g, t);
    if (this.grade) {
      // «мягкий свет»: тёплое прибавляет сочности, края — глубины, картинка не бледнеет
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "soft-light";
      c.drawImage(this.grade, 0, 0);
      c.globalCompositeOperation = "source-over";
      this.worldTransform(c);
    }
    this.drawParts(c, g.dt || 0.016);
    this.shakeT = Math.max(0, this.shakeT - (g.dt || 0.016) * 2.2);
    // вспышка победы: мягкий свет от героя на весь экран
    if (this.flashT > 0) {
      const k = this.flashT;
      c.setTransform(1, 0, 0, 1, 0, 0);
      const [fx, fy] = this.toScreen(this.flashAt?.[0] ?? W / 2, this.flashAt?.[1] ?? H / 2);
      const R = Math.max(this.w, this.h) * this.dpr;
      const gr = c.createRadialGradient(fx * this.dpr, fy * this.dpr, 0, fx * this.dpr, fy * this.dpr, R);
      gr.addColorStop(0, `rgba(255,252,220,${0.75 * k})`);
      gr.addColorStop(0.35, `rgba(255,245,200,${0.35 * k})`);
      gr.addColorStop(1, "rgba(255,245,200,0)");
      c.fillStyle = gr;
      c.fillRect(0, 0, this.cv.width, this.cv.height);
      this.flashT = Math.max(0, this.flashT - (g.dt || 0.016) * 2.2);
    }
  }
  flash(x, y) {
    this.flashT = 1;
    this.flashAt = [x, y];
  }

  drawInk(c, pts, th, alpha = 1, live = false, burn = 0) {
    if (pts.length < 2) return;
    const st = this.inkStyle && this.inkStyle.ink ? this.inkStyle : null;
    const ink = st ? st.ink : th.ink,
      hi = st ? st.hi : th.inkHi,
      edge = st ? st.edge : th.inkEdge,
      glow = st ? st.glow : th.glow;
    c.save();
    c.globalAlpha = alpha;
    c.lineCap = c.lineJoin = "round";
    const line = () => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    };
    // мягкая тень линии на фоне — объём (только в высоком качестве)
    if (this.hq && !live) {
      c.save();
      c.translate(3, 7);
      line();
      c.strokeStyle = "rgba(20,10,40,.16)";
      c.lineWidth = LINE_VIEW + 6;
      c.stroke();
      c.restore();
    }
    // свечение: у светящихся линий всегда, у остальных — пока линию рисуют (только в высоком качестве)
    if (this.hq && (glow || live || burn)) {
      c.shadowColor = burn ? "rgba(255,140,40,.95)" : glow || "rgba(255,255,255,.7)";
      c.shadowBlur = (burn ? 22 : live ? 18 : 16) * this.s * this.dpr;
    }
    line();
    c.strokeStyle = burn ? "#5a1a06" : edge;
    c.lineWidth = LINE_VIEW + 5;
    c.stroke();
    c.shadowBlur = 0;
    line();
    if (burn) {
      // горит: от тёмно-оранжевого к жёлтому, мерцает
      const f = 0.5 + 0.5 * Math.sin(performance.now() / 60);
      c.strokeStyle = `rgb(255,${Math.round(90 + 90 * f * burn)},${Math.round(30 * f)})`;
    } else if (st?.rainbow) {
      let x0 = Infinity,
        x1 = -Infinity;
      for (const p of pts) (x0 = Math.min(x0, p[0])), (x1 = Math.max(x1, p[0]));
      const gr = c.createLinearGradient(x0 - 1, 0, x1 + 1, 0);
      ["#ff4a6a", "#ff9a3a", "#ffe04a", "#4fd27a", "#4ab0ff", "#9a6aff"].forEach((col, i) => gr.addColorStop(i / 5, col));
      c.strokeStyle = gr;
    } else c.strokeStyle = ink;
    c.lineWidth = LINE_VIEW;
    c.stroke();
    c.translate(-1.2, -2);
    line();
    c.strokeStyle = burn ? "#fff2a0" : hi;
    c.globalAlpha = alpha * 0.8;
    c.lineWidth = 3;
    c.stroke();
    c.restore();
    if (st?.dots && pts.length > 2) {
      // звёздная линия: искорки вдоль
      const t = performance.now() / 1000;
      for (let i = 1; i < pts.length; i += 3) {
        const k = 0.5 + 0.5 * Math.sin(t * 5 + i);
        sparkleDot(c, pts[i][0], pts[i][1] - 1, 3 + 3 * k, "#ffffff", alpha * k);
      }
    }
  }

  linePts(line) {
    const b = line.b,
      co = Math.cos(b.angle),
      si = Math.sin(b.angle);
    return line.local.map(([x, y]) => [b.position.x + x * co - y * si, b.position.y + x * si + y * co]);
  }

  drawPhys(c, g, t) {
    const { sim, L } = g;
    const th = this.th;
    // лава и вода — живая поверхность
    for (const p of L.terrain) {
      if (p.m !== "water" && p.m !== "lava") continue;
      const lava = p.m === "lava";
      c.fillStyle = lava ? "#ff6a1e" : "rgba(60,160,230,.82)";
      c.beginPath();
      c.moveTo(p.x, p.y + p.h);
      for (let x = p.x; x <= p.x + p.w + 1; x += 12) c.lineTo(x, p.y + Math.sin(x * 0.05 + t * (lava ? 2 : 3)) * 4);
      c.lineTo(p.x + p.w, p.y + p.h);
      c.fill();
      c.strokeStyle = lava ? "#ffd06a" : "rgba(255,255,255,.8)";
      c.lineWidth = 4;
      c.beginPath();
      for (let x = p.x; x <= p.x + p.w + 1; x += 12) c.lineTo(x, p.y + Math.sin(x * 0.05 + t * (lava ? 2 : 3)) * 4);
      c.stroke();
      if (lava) {
        c.fillStyle = "#ffd06a";
        for (let i = 0; i < p.w / 50; i++) {
          const k = (t * 0.6 + i * 0.37) % 1;
          ellipse(c, p.x + ((i * 53) % p.w), p.y + 18 - k * 10, 5 * (1 - k), 5 * (1 - k));
          c.fill();
        }
      }
    }
    // батуты, двери, движущиеся платформы
    for (const s of sim.engine.world.bodies) {
      const pl = s.plugin;
      if (pl?.k !== "terrain") continue;
      const piece = L.terrain[pl.piece];
      if (piece.m === "spring") A.spring(c, piece.verts, piece.a || 0, sim.springT?.[pl.piece] || 0);
      else if (piece.move || piece.door != null) {
        A.polyFill(c, s.vertices);
        c.fillStyle = this.matFill(c, piece, th);
        c.fill();
        c.strokeStyle = MAT_LINE[piece.m] || th.line;
        c.lineWidth = 5;
        c.stroke();
        c.strokeStyle = "rgba(255,255,255,.35)";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(s.vertices[0].x + 4, s.vertices[0].y + 4);
        c.lineTo(s.vertices[1].x - 4, s.vertices[1].y + 4);
        c.stroke();
      }
    }
    for (const b of sim.buttons) A.button(c, b);
    for (const p of L.pegs) A.peg(c, p[0], p[1]);
    for (const s of sim.statics) {
      if (s.k === "fan") A.fan(c, s, t);
      else if (s.k === "pipe") A.pipe(c, s, s.lava);
      else if (s.k === "mist") A.mist(c, s.x, s.y, t, s.fire, sim.state === "draw" ? 0.4 : s.made < (s.n || 6) ? 1 : 0.2);
    }
    // светлячок уровня
    if (g.fly) {
      if (g.fly.state === "free") A.firefly(c, g.fly.x, g.fly.y, t, false, this.hq);
      else if (g.fly.state === "old") A.firefly(c, g.fly.x, g.fly.y, t, true);
    }
    // цель «Достань»: домик, клетка
    if (L.house) A.house(c, L.house[0], L.house[1], 0, sim.state === "won" ? 1 : 0);
    // подсказка — под линиями
    if (g.hint) this.drawHint(c, L, t);
    if (g.demo && sim.state === "draw" && !sim.lines.length && !g.pen) this.drawDemo(c, L, t);
    // линии
    for (const line of sim.lines) {
      if (line.gone) continue;
      const burn = line.burn ? Math.min(1, 1 - (line.burn - sim.t) / 0.8) : 0;
      const pts = this.linePts(line);
      this.drawInk(c, pts, th, 1, false, burn);
      if (burn && Math.random() < (this.hq ? 0.8 : 0.3)) {
        const q = pts[Math.floor(Math.random() * pts.length)];
        this.burst("ember", q[0], q[1]);
      }
    }
    for (const n of L.nails) A.nail(c, n[0], n[1], sim.lines.some((l) => l.pins.includes(n)), t);
    // герои
    for (const h of sim.heroes) {
      const p = h.b.position;
      if (h === sim.target) continue;
      A.groundShadow(c, p.x, p.y + HERO_R, HERO_R);
      const mood = this.moodOf(h, g, t);
      const jump = sim.state === "won" ? Math.abs(Math.sin((t - g.wonAt) * 7)) * 16 : 0;
      // пока рисуют — иногда подпрыгивает и переминается (живой, а не картинка)
      const idle = sim.state === "draw" ? idleHop(t, h.c) : 0;
      A.critter(c, p.x, p.y - jump - idle * 10, HERO_R, h.c, {
        t,
        mood,
        look: this.lookOf(h, g),
        blink: blink(t, h.c),
        squash: h.hurt ? -0.08 : jump ? -0.04 : idle ? -0.05 * Math.sin(idle * Math.PI) : 0,
        hat: h.c === 0 ? this.hat : null,
      });
    }
    // клетка с другом поверх друга
    if (L.lock) A.cage(c, L.lock[0], L.lock[1], g.open || 0, t);
    if (sim.target) {
      const tg = sim.target,
        p = tg.b.position;
      if (tg.k === "berry" && !tg.eaten) A.berry(c, p.x, p.y, BERRY_R, tg.b.angle);
      else if (tg.k === "star") A.starKey(c, p.x, p.y, BERRY_R, tg.b.angle, t);
      else if (tg.k === "roll") {
        if (sim.state === "won") {
          // докатился: разворачивается у двери
          A.critter(c, p.x, p.y, HERO_R, 0, { t, mood: "joy", hat: this.hat });
        } else A.critter(c, p.x, p.y, HERO_R, 0, { t, angle: tg.b.angle });
      }
    }
    // опасности
    for (const h of sim.hazards) {
      const b = h.b,
        p = b.position;
      if (h.k === "rock" || h.k === "snow") A.rock(c, b, h.k === "snow");
      else if (h.k === "icicle") A.icicle(c, b.vertices);
      else if (h.k === "spike") A.spikeBall(c, p.x, p.y, b.circleRadius || 24, b.angle);
      else A.ball(c, p.x, p.y, b.circleRadius || 15, h.k, t);
    }
    for (const d of sim.drops) {
      const v = d.b.velocity;
      A.drop(c, d.b.position.x, d.b.position.y, 6, d.lava, v.x, v.y);
    }
    for (const s of sim.statics) {
      if (s.k === "nest") A.nest(c, s.x, s.y, t, sim.state === "draw" ? 0.3 : s.made < s.n ? 1 : 0);
      else if (s.k === "cannon") A.cannon(c, s, t);
    }
    for (const bug of sim.bugs) {
      const p = bug.b.position,
        v = bug.b.velocity;
      A.bug(c, p.x, p.y, 10, t, bug.phase, v.x >= 0 ? 1 : -1);
    }
    for (const gh of sim.ghosts || []) {
      const fade = sim.state === "run" || sim.state === "draw" ? Math.min(1, (sim.t - gh.born) * 3) : Math.max(0, 1 - (sim.t - sim.endT) * 0.8);
      if (gh.fire) {
        A.wisp(c, gh.x, gh.y, gh.r * 1.3, t, gh.phase, this.hq);
        if (this.hq && Math.random() < 0.35) this.burst("wispTrail", gh.x, gh.y + 6);
      } else A.ghost(c, gh.x, gh.y, gh.r, t, gh.phase, gh.vx >= 0 ? 1 : -1, fade, this.hq);
    }
    // текущий штрих
    if (g.pen && g.pen.pts.length) {
      this.drawInk(c, g.pen.pts, th, 0.92, true);
      const tip = g.pen.pts[g.pen.pts.length - 1];
      if (g.pen.stop === "wall") {
        c.strokeStyle = "#ff3a4a";
        c.lineWidth = 5;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(tip[0] - 9, tip[1] - 9);
        c.lineTo(tip[0] + 9, tip[1] + 9);
        c.moveTo(tip[0] + 9, tip[1] - 9);
        c.lineTo(tip[0] - 9, tip[1] + 9);
        c.stroke();
      } else A.sparkle(c, tip[0], tip[1], 9 + Math.sin(t * 20) * 3, "#fff8c0");
    }
    // запретные зоны поверх всего, но полупрозрачно
    for (const z of L.nodraw) this.drawNoDraw(c, z, t);
  }

  drawNoDraw(c, z, t) {
    c.save();
    c.beginPath();
    c.roundRect(z[0], z[1], z[2], z[3], 10);
    c.fillStyle = "rgba(255,60,80,.16)";
    c.fill();
    c.clip();
    c.strokeStyle = "rgba(255,60,80,.35)";
    c.lineWidth = 6;
    const off = (t * 20) % 24;
    for (let x = z[0] - z[3] - 24 + off; x < z[0] + z[2]; x += 24) {
      c.beginPath();
      c.moveTo(x, z[1] + z[3]);
      c.lineTo(x + z[3], z[1]);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = "rgba(230,40,60,.75)";
    c.lineWidth = 3;
    c.setLineDash([10, 7]);
    c.beginPath();
    c.roundRect(z[0], z[1], z[2], z[3], 10);
    c.stroke();
    c.setLineDash([]);
  }

  moodOf(h, g, t) {
    const sim = g.sim;
    if (h.hurt) return "hurt";
    if (sim.state === "won") return sim.why === "eat" && t - g.wonAt < 0.8 ? "eat" : "joy";
    if (sim.state === "lost") return "fear";
    if (sim.target && sim.target.k === "berry") {
      const p = sim.target.b.position;
      if (dist([p.x, p.y], [h.b.position.x, h.b.position.y]) < 170) return "eat";
    }
    const near = this.nearest(h, sim);
    if (near && near.d < 210 && sim.state === "run") return "fear";
    return "idle";
  }
  nearest(h, sim) {
    let best = null;
    const hp = h.b.position;
    const scan = (b) => {
      const d = Math.hypot(b.position.x - hp.x, b.position.y - hp.y);
      if (!best || d < best.d) best = { d, p: b.position };
    };
    for (const b of sim.bugs) scan(b.b);
    for (const z of sim.hazards) if (!z.held) scan(z.b);
    for (const d of sim.drops) scan(d.b);
    for (const gh of sim.ghosts || []) scan(gh.b);
    return best;
  }
  lookOf(h, g) {
    const sim = g.sim,
      hp = h.b.position;
    let p = null;
    if (sim.target && sim.target !== h) p = sim.target.b.position;
    else {
      const n = this.nearest(h, sim);
      if (n && n.d < 500) p = n.p;
      else if (g.pen?.pts.length) {
        const q = g.pen.pts[g.pen.pts.length - 1];
        p = { x: q[0], y: q[1] };
      }
    }
    if (!p) return [Math.sin(performance.now() / 1300) * 0.6, 0];
    const dx = p.x - hp.x,
      dy = p.y - hp.y,
      l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }

  // Обучение на первых уровнях: призрачный палец рисует первую линию эталона
  drawDemo(c, L, t) {
    const line = L.sol[0];
    const cum = cumLengths(line),
      total = cum[cum.length - 1];
    const k = Math.min(1, ((t % 3.2) - 0.3) / 1.8);
    if (k <= 0) return;
    const pts = [];
    for (let s = 0; s <= total * k; s += 8) pts.push(pathAt(line, cum, s));
    const tip = pathAt(line, cum, total * k);
    pts.push(tip);
    c.save();
    c.globalAlpha = 0.5 * (t % 3.2 > 2.6 ? Math.max(0, 1 - (t % 3.2 - 2.6) / 0.6) : 1);
    if (L.type === "home") this.drawPath(c, pts, A.FOLK[L.walkers[0][2]].col, 1);
    else this.drawInk(c, pts, this.th, 1);
    c.globalAlpha = 1;
    A.finger(c, tip[0], tip[1]);
    c.restore();
  }

  drawHint(c, L, t) {
    c.save();
    L.sol.forEach((line, n) => {
      // в «Домой» путь рисуем от жителя; в физике — как есть
      c.lineCap = c.lineJoin = "round";
      c.beginPath();
      line.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = "rgba(255,255,255,.75)";
      c.lineWidth = LINE_VIEW + 6;
      c.setLineDash([2, 22]);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = "rgba(40,30,110,.28)";
      c.lineWidth = LINE_VIEW;
      c.stroke();
      // бегущая точка показывает направление и порядок
      const cum = cumLengths(line);
      const k = ((t * 0.45 + n * 0.5) % 1.2) / 1.0;
      if (k <= 1) {
        const [x, y] = pathAt(line, cum, k * cum[cum.length - 1]);
        A.sparkle(c, x, y, 14, "#fff7b8");
      }
      const [sx, sy] = line[0];
      c.fillStyle = "#fff7b8";
      c.strokeStyle = "#3a2f8f";
      c.lineWidth = 3;
      ellipse(c, sx, sy - 26, 13, 13);
      c.fill();
      c.stroke();
      c.fillStyle = "#3a2f8f";
      c.font = "900 17px ui-rounded, system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(String(n + 1), sx, sy - 25);
    });
    c.restore();
  }

  drawHome(c, g, t) {
    const { sim, L } = g;
    // домики
    for (const h of L.homes) {
      const w = sim.walkers.find((w) => w.c === h[2]);
      A.house(c, h[0], h[1] + 34, h[2], w?.done ? 1 : 0, 0.62);
    }
    if (g.hint) this.drawHint(c, L, t);
    if (g.demo && sim.state === "draw" && !sim.lines.length && !g.pen) this.drawDemo(c, L, t);
    // пути
    for (const line of sim.lines) this.drawPath(c, line.pts, A.FOLK[line.c].col, 1);
    if (g.pen && g.pen.pts.length) {
      const w = L.walkers[g.pen.walker];
      this.drawPath(c, g.pen.pts, A.FOLK[w[2]].col, 0.85);
      const tip = g.pen.pts[g.pen.pts.length - 1];
      if (g.pen.stop === "wall") {
        c.strokeStyle = "#ff3a4a";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(tip[0] - 9, tip[1] - 9);
        c.lineTo(tip[0] + 9, tip[1] + 9);
        c.moveTo(tip[0] + 9, tip[1] - 9);
        c.lineTo(tip[0] - 9, tip[1] + 9);
        c.stroke();
      }
      // свой домик подсвечивается
      const home = L.homes.find((h) => h[2] === w[2]);
      c.strokeStyle = "rgba(255,255,255,.9)";
      c.lineWidth = 4;
      c.setLineDash([8, 8]);
      c.lineDashOffset = -t * 30;
      ellipse(c, home[0], home[1], HOUSE_R, HOUSE_R);
      c.stroke();
      c.setLineDash([]);
    }
    // дозорные жуки
    for (const p of sim.patrols) {
      const nx = patrolAt(p, sim.t + 0.05);
      if (p.ghost) A.ghost(c, p.x, p.y, p.r * 0.95, t, p.r, nx[0] >= p.x ? 1 : -1, 0.9, this.hq);
      else A.beetle(c, p.x, p.y, p.r, Math.atan2(nx[1] - p.y, nx[0] - p.x), t);
    }
    if (g.fly) {
      if (g.fly.state === "free") A.firefly(c, g.fly.x, g.fly.y, t, false, this.hq);
      else if (g.fly.state === "old") A.firefly(c, g.fly.x, g.fly.y, t, true);
    }
    // жители
    for (const w of sim.walkers) {
      if (w.done) continue;
      const moving = sim.state === "run" && w.path;
      c.fillStyle = "rgba(20,30,10,.22)";
      ellipse(c, w.x, w.y + WALKER_R * 0.85, WALKER_R * 0.9, WALKER_R * 0.28);
      c.fill();
      const hop = moving ? Math.abs(Math.sin(sim.t * 9 + w.c)) * 6 : 0;
      const mood = w.hurt ? "hurt" : sim.state === "won" ? "joy" : !w.path && g.pen?.walker !== sim.walkers.indexOf(w) ? "idle" : "idle";
      A.critter(c, w.x, w.y - hop, WALKER_R, w.c, { t, mood, step: moving ? sim.t * 12 : null, blink: blink(t, w.c), look: [w.dir * 0.6, 0.2], hat: w.c === 0 ? this.hat : null });
      if (!w.path && sim.state === "draw" && !g.pen?.pts.length) {
        // мягкое кольцо: «начни отсюда»
        c.strokeStyle = A.FOLK[w.c].col;
        c.globalAlpha = 0.5 + 0.4 * Math.sin(t * 5);
        c.lineWidth = 4;
        ellipse(c, w.x, w.y, WALKER_R + 10 + Math.sin(t * 5) * 3, WALKER_R + 10 + Math.sin(t * 5) * 3);
        c.stroke();
        c.globalAlpha = 1;
      }
    }
  }
  drawPath(c, pts, col, alpha) {
    if (pts.length < 2) return;
    c.save();
    c.globalAlpha = alpha;
    c.lineCap = c.lineJoin = "round";
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = "rgba(255,255,255,.85)";
    c.lineWidth = 13;
    c.stroke();
    c.strokeStyle = col;
    c.lineWidth = 7;
    c.setLineDash([14, 9]);
    c.stroke();
    c.restore();
  }

  // ---------- Частицы ----------
  burst(kind, x, y, o = {}) {
    const r = Math.random;
    const add = (p) => this.parts.length < (this.hq ? 600 : 160) && this.parts.push({ life: 0, ...p });
    if (kind === "dust") for (let i = 0; i < 6; i++) add({ x, y, vx: (r() - 0.5) * 120, vy: -r() * 60, ttl: 0.5, s: 6 + r() * 6, col: "rgba(240,230,210,.8)", k: "dot", g: 60 });
    else if (kind === "spark") for (let i = 0; i < 4; i++) add({ x, y, vx: (r() - 0.5) * 220, vy: (r() - 0.5) * 220, ttl: 0.3, s: 4, col: "#fff6a0", k: "star", g: 0 });
    else if (kind === "splash") for (let i = 0; i < 7; i++) add({ x, y, vx: (r() - 0.5) * 200, vy: -80 - r() * 160, ttl: 0.6, s: 3 + r() * 3, col: o.lava ? "#ffb04a" : "#8fd4ff", k: "dot", g: 700 });
    else if (kind === "hit") {
      for (let i = 0; i < 10; i++) add({ x, y, vx: Math.cos(i * 0.63) * 260, vy: Math.sin(i * 0.63) * 260, ttl: 0.55, s: 10, col: "#ffe14a", k: "star", g: 0 });
      add({ x, y, vx: 0, vy: 0, ttl: 0.45, s: 70, col: "rgba(255,255,255,.9)", k: "ring", g: 0 });
    } else if (kind === "confetti")
      for (let i = 0; i < 70; i++)
        add({
          x: x + (r() - 0.5) * 300,
          y: y - r() * 120,
          vx: (r() - 0.5) * 400,
          vy: -300 - r() * 300,
          ttl: 1.6 + r(),
          s: 6 + r() * 6,
          col: ["#ff5a7a", "#ffd23a", "#4fd08a", "#5aa8ff", "#c07aff"][i % 5],
          k: "paper",
          g: 600,
          rot: r() * 6,
        });
    else if (kind === "heart") for (let i = 0; i < 6; i++) add({ x: x + (r() - 0.5) * 40, y, vx: (r() - 0.5) * 80, vy: -120 - r() * 80, ttl: 1, s: 12, col: "#ff6a8a", k: "heart", g: -30 });
    else if (kind === "smoke") for (let i = 0; i < 8; i++) add({ x, y, vx: (r() - 0.5) * 90, vy: -30 - r() * 60, ttl: 0.9, s: 14 + r() * 12, col: o.fire ? "rgba(255,150,60,.5)" : "rgba(230,230,240,.7)", k: "puff", g: -20 });
    else if (kind === "ink") add({ x, y, vx: (r() - 0.5) * 60, vy: (r() - 0.5) * 60, ttl: 0.4, s: 5, col: this.th?.inkHi || "#fff", k: "star", g: 0 });
    else if (kind === "poof") for (let i = 0; i < 12; i++) add({ x, y, vx: Math.cos(i) * 140, vy: Math.sin(i) * 140, ttl: 0.6, s: 12, col: o.col || "#fff", k: "puff", g: 0 });
    else if (kind === "ghostpoof") {
      for (let i = 0; i < 8; i++) add({ x, y, vx: Math.cos(i * 0.8) * 110, vy: Math.sin(i * 0.8) * 110 - 30, ttl: 0.55, s: 13, col: "rgba(235,240,255,.85)", k: "puff", g: -40 });
      for (let i = 0; i < 6; i++) add({ x, y, vx: (r() - 0.5) * 240, vy: (r() - 0.5) * 240, ttl: 0.5, s: 7, col: "#cfe0ff", k: "star", g: 0 });
    } else if (kind === "fizz") for (let i = 0; i < 10; i++) add({ x, y, vx: (r() - 0.5) * 200, vy: -60 - r() * 120, ttl: 0.5, s: 6, col: i % 2 ? "#7fe0ff" : "#ffffff", k: "star", g: 120 });
    else if (kind === "ember") add({ x: x + (r() - 0.5) * 8, y, vx: (r() - 0.5) * 40, vy: -60 - r() * 60, ttl: 0.6, s: 4 + r() * 4, col: r() < 0.5 ? "#ffb03a" : "#ffe27a", k: "dot", g: -80 });
    else if (kind === "wispTrail") add({ x: x + (r() - 0.5) * 8, y, vx: (r() - 0.5) * 30, vy: 20 + r() * 30, ttl: 0.4, s: 3 + r() * 3, col: "#9fe6ff", k: "dot", g: 0 });
    else if (kind === "smokeLine") add({ x, y, vx: (r() - 0.5) * 50, vy: -40 - r() * 50, ttl: 0.9, s: 10 + r() * 8, col: "rgba(80,70,80,.45)", k: "puff", g: -20 });
    else if (kind === "flyget") {
      for (let i = 0; i < 14; i++) add({ x, y, vx: Math.cos(i * 0.45) * (90 + r() * 90), vy: Math.sin(i * 0.45) * (90 + r() * 90), ttl: 0.8, s: 6 + r() * 5, col: i % 2 ? "#fff36a" : "#ffffff", k: "star", g: 60 });
      add({ x, y, vx: 0, vy: 0, ttl: 0.5, s: 46, col: "rgba(255,245,150,.95)", k: "ring", g: 0 });
    } else if (kind === "stars") for (let i = 0; i < 16; i++) add({ x, y, vx: Math.cos(i * 0.39) * (160 + r() * 140), vy: Math.sin(i * 0.39) * (160 + r() * 140) - 80, ttl: 1, s: 9 + r() * 6, col: ["#ffe14a", "#ffffff", "#ffb8d0"][i % 3], k: "star", g: 260 });
  }
  drawParts(c, dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life > p.ttl) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.ttl;
      c.globalAlpha = Math.min(1, k * 1.5);
      c.fillStyle = p.col;
      if (p.k === "dot") {
        ellipse(c, p.x, p.y, p.s * k, p.s * k);
        c.fill();
      } else if (p.k === "puff") {
        ellipse(c, p.x, p.y, p.s * (1.4 - k * 0.6), p.s * (1.4 - k * 0.6));
        c.fill();
      } else if (p.k === "star") A.sparkle(c, p.x, p.y, p.s * k + 2, p.col);
      else if (p.k === "ring") {
        c.strokeStyle = p.col;
        c.lineWidth = 6 * k;
        ellipse(c, p.x, p.y, p.s * (1 - k) + 10, p.s * (1 - k) + 10);
        c.stroke();
      } else if (p.k === "paper") {
        p.rot += dt * 8;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillRect(-p.s / 2, -p.s / 4 * Math.abs(Math.cos(p.rot * 1.3)), p.s, (p.s / 2) * Math.abs(Math.cos(p.rot * 1.3)));
        c.restore();
      } else if (p.k === "heart") {
        c.save();
        c.translate(p.x, p.y);
        c.beginPath();
        c.moveTo(0, p.s * 0.3);
        c.bezierCurveTo(-p.s, -p.s * 0.4, -p.s * 0.4, -p.s, 0, -p.s * 0.4);
        c.bezierCurveTo(p.s * 0.4, -p.s, p.s, -p.s * 0.4, 0, p.s * 0.3);
        c.fill();
        c.restore();
      }
    }
    c.globalAlpha = 1;
  }
}

const MAT_LINE = { stone: "#4a403a", wood: "#5a3418", ice: "#4a98c0", metal: "#2a3040", spikes: "#2a2a34", cloud: "#9aa6d8", snow: "#6a80b8" };

function blink(t, seed) {
  const p = (t + seed * 1.7) % 4.3;
  return p < 0.12 ? Math.sin((p / 0.12) * Math.PI) : 0;
}
function bounds(p) {
  if (p.verts) {
    const xs = p.verts.map((v) => v[0]),
      ys = p.verts.map((v) => v[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r };
}
function inside(p, x, y) {
  if (!p.verts) return Math.hypot(x - p.x, y - p.y) < p.r;
  let ins = false;
  const v = p.verts;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const a = v[i],
      b = v[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}
function topEdge(v) {
  let best = null,
    by = Infinity;
  for (let i = 0; i < v.length; i++) {
    const a = v[i],
      b = v[(i + 1) % v.length];
    const my = (a[1] + b[1]) / 2;
    if (b[0] > a[0] && my < by) (by = my), (best = [a, b]);
  }
  return best || [v[0], v[1]];
}

// Короткий прыжок раз в несколько секунд (0..1 — фаза прыжка)
function idleHop(t, seed) {
  const p = (t + seed * 1.37) % 5.2;
  return p < 0.36 ? Math.sin((p / 0.36) * Math.PI) : 0;
}
function sparkleDot(c, x, y, r, col, a) {
  c.save();
  c.globalAlpha = a;
  A.sparkle(c, x, y, r, col);
  c.restore();
}
