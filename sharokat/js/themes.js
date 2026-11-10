// Темы трасс: у каждого уровня своя — небо, дорожка, бортики, острова, облака, море внизу.
// Уровень n берёт тему themes[n % themes.length].
import * as T from "../vendor/three/three.module.min.js?v=8580e2bc";

function tile(draw) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  draw(c.getContext("2d"), 64, 128);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// Обычная полосатая дорожка: светлые и чуть тёмные полосы, белые края, пунктир посередине
const stripes = (light = "#ffffff", dark = "#d4d4e2", line = "#ffffff") => (ctx) => {
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = line;
  ctx.fillRect(0, 0, 5, 128);
  ctx.fillRect(59, 0, 5, 128);
  for (let y = 10; y < 128; y += 32) ctx.fillRect(29, y, 6, 14);
};
const hsl = (h, s, l) => new T.Color().setHSL(((h % 1) + 1) % 1, s, l);

export const themes = [
  {
    id: "rainbow",
    trim: () => new T.Color("#ffffff"),
    water: { deep: "#1677d6", shallow: "#43c8f0", sky: "#cfeeff", sun: "#fff3c4" },
    name: "Радуга",
    ui: "linear-gradient(135deg,#ff4f7b,#ffc93c,#2fd0a6,#4aa3ff)",
    sky: [[-1, "#ffc6e0"], [-0.08, "#ffd6ea"], [0.03, "#fff0f6"], [0.16, "#9fd8ff"], [0.45, "#4aa8ff"], [1, "#2a6fe0"]],
    fog: "#d8eeff",
    sea: "#fff4fa",
    cloud: "#ffffff",
    light: [1.25, 2.1, "#fff4dc"],
    road: { tex: tile(stripes()), color: (h) => hsl(h, 0.95, 0.55), roughness: 0.35, clearcoat: 0.6 },
    rail: (h, i) => hsl(h + 0.5 + (i % 6) * 0.08, 1, 0.55),
    leg: (h) => hsl(h, 0.85, 0.6),
    rock: (r) => hsl(0.05 + r * 0.08, 0.45, 0.6),
    grass: (r) => hsl(0.28 + r * 0.12, 0.65, 0.55),
    crowns: ["#5ccf73", "#ff8fc0", "#9be04f", "#ffd24f"],
    decor: "rainbow",
  },
  {
    id: "sunset",
    trim: () => new T.Color("#fff1e6"),
    water: { deep: "#3b2f86", shallow: "#ff8a7a", sky: "#ffc3a8", sun: "#ffd08a" },
    name: "Закат",
    ui: "linear-gradient(135deg,#ffb36b,#ff6f91,#8f5bd8)",
    sky: [[-1, "#ffb36b"], [-0.08, "#ff9a7a"], [0.03, "#ffd1a1"], [0.16, "#ff8fb1"], [0.45, "#a36bd8"], [1, "#4b3aa8"]],
    fog: "#ffc3a8",
    sea: "#ffdcc8",
    cloud: "#ffe3d6",
    light: [1.15, 2.0, "#ffbf8a"],
    road: { tex: tile(stripes("#ffffff", "#f1dccf")), color: (h) => hsl(0.8 + (h * 3) % 0.32, 0.85, 0.6), roughness: 0.3, clearcoat: 0.7 },
    rail: (h, i) => hsl(0.1 + (i % 4) * 0.25, 1, 0.6),
    leg: (h) => hsl(0.85 + (h * 2) % 0.25, 0.7, 0.62),
    rock: (r) => hsl(0.02 + r * 0.05, 0.4, 0.55),
    grass: (r) => hsl(0.06 + r * 0.06, 0.85, 0.62),
    crowns: ["#ff8f8f", "#ffb26b", "#c38bff", "#ffd36b"],
    decor: "rainbow",
  },
  {
    id: "ice",
    trim: () => new T.Color("#ffffff"),
    water: { deep: "#1f6aa8", shallow: "#9fe0ff", sky: "#e2f4ff", sun: "#ffffff" },
    name: "Лёд",
    ui: "linear-gradient(135deg,#e6f6ff,#8fd3ff,#4a9ae0)",
    sky: [[-1, "#e6f6ff"], [-0.08, "#d8f0ff"], [0.03, "#f4fbff"], [0.16, "#bfe7ff"], [0.45, "#7cc6f5"], [1, "#4a9ae0"]],
    fog: "#e2f4ff",
    sea: "#f6fbff",
    cloud: "#ffffff",
    light: [1.3, 2.0, "#f0f8ff"],
    road: {
      // Лёд с белыми трещинками
      tex: tile((ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 64, 128);
        ctx.strokeStyle = "#c8ecff";
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          ctx.beginPath();
          let x = (i * 23) % 64,
            y = (i * 37) % 128;
          ctx.moveTo(x, y);
          for (let k = 0; k < 4; k++) ctx.lineTo((x += ((k * 13 + i * 7) % 21) - 10), (y += 9));
          ctx.stroke();
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 4, 128);
        ctx.fillRect(60, 0, 4, 128);
      }),
      color: (h) => hsl(0.53 + (h * 2) % 0.08, 0.7, 0.8),
      roughness: 0.06,
      clearcoat: 1,
    },
    rail: (h, i) => (i % 2 ? hsl(0.55, 1, 0.75) : new T.Color("#ffffff")),
    leg: () => hsl(0.55, 0.5, 0.85),
    rock: () => hsl(0.57, 0.3, 0.78),
    grass: () => new T.Color("#f6fbff"),
    crowns: ["#ffffff", "#d6f0ff", "#bfe2ff", "#eaf7ff"],
    pines: true,
    decor: "rainbow",
  },
  {
    id: "caramel",
    trim: () => new T.Color("#ff3d63"),
    water: { deep: "#e0569c", shallow: "#ffb3d6", sky: "#ffe0f0", sun: "#ffffff" },
    name: "Карамель",
    ui: "repeating-linear-gradient(135deg,#ff4f6e 0 8px,#fff 8px 16px)",
    sky: [[-1, "#ffd0e8"], [-0.08, "#ffe0f0"], [0.03, "#fff0f8"], [0.16, "#ffc2e2"], [0.45, "#ff9ed2"], [1, "#e06ab8"]],
    fog: "#ffd8ee",
    sea: "#fff0f7",
    cloud: "#fff5fb",
    light: [1.25, 2.0, "#fff0f6"],
    road: {
      // Карамельная трость: косые красно-белые полосы
      tex: tile((ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 64, 128);
        ctx.fillStyle = "#ff3d63";
        for (let y = -64; y < 128; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(64, y + 32);
          ctx.lineTo(64, y + 48);
          ctx.lineTo(0, y + 16);
          ctx.fill();
        }
      }),
      color: (h) => hsl(0.95, 0.4, 0.95 - (h % 0.2) * 0.3),
      roughness: 0.15,
      clearcoat: 1,
    },
    rail: (h, i) => (i % 2 ? new T.Color("#ff3d63") : new T.Color("#ffffff")),
    leg: (h) => (Math.floor(h * 10) % 2 ? new T.Color("#ff3d63") : new T.Color("#fff4f8")),
    rock: () => new T.Color("#7a4a3a"),
    grass: (r) => hsl(0.92 + r * 0.05, 0.85, 0.75),
    crowns: ["#ff5fa0", "#ffd24f", "#7fd8ff", "#b47cff"],
    decor: "rainbow",
  },
  {
    id: "neon",
    trim: () => new T.Color("#3a2a7a"),
    name: "Ночной неон",
    ui: "linear-gradient(135deg,#120a2e,#ff2fd6,#2ff3ff)",
    sky: [[-1, "#120a2e"], [-0.08, "#1e1452"], [0.03, "#3a2380"], [0.16, "#22175c"], [0.45, "#120c3a"], [1, "#070420"]],
    fog: "#1c1450",
    sea: "#160f3c",
    cloud: "#3a2e78",
    light: [0.65, 1.1, "#9fb4ff"],
    stars: true,
    road: {
      tex: tile(stripes("#ffffff", "#e8e0ff")),
      // Тёмная дорожка, края и пунктир светятся
      glow: tile((ctx) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 64, 128);
        ctx.fillStyle = "#2ff3ff";
        ctx.fillRect(0, 0, 4, 128);
        ctx.fillStyle = "#ff2fd6";
        ctx.fillRect(60, 0, 4, 128);
        ctx.fillStyle = "#fff36b";
        for (let y = 10; y < 128; y += 32) ctx.fillRect(29, y, 6, 14);
      }),
      color: (h) => hsl(0.7 + (h % 0.2) * 0.5, 0.55, 0.2),
      roughness: 0.2,
      clearcoat: 1,
    },
    rail: (h, i) => hsl(i % 2 ? 0.86 : 0.5, 1, 0.6),
    railGlow: 1.2,
    leg: (h) => hsl(0.75, 0.6, 0.3),
    rock: () => hsl(0.72, 0.4, 0.2),
    grass: () => hsl(0.72, 0.5, 0.28),
    crowns: ["#2ff3ff", "#ff2fd6", "#fff36b", "#7cff8f"],
    glowCrowns: true,
    decor: "planets",
  },
  {
    id: "lava",
    trim: () => new T.Color("#3a2420"),
    water: { deep: "#d42a00", shallow: "#ffb000", sky: "#ff7a2a", sun: "#ffe08a", glow: 1.4 },
    name: "Вулкан",
    ui: "linear-gradient(135deg,#2a0a14,#ff6a2a,#ffd23f)",
    sky: [[-1, "#ff5a1f"], [-0.08, "#ff7a2a"], [0.03, "#ff9a4a"], [0.16, "#b83a2a"], [0.45, "#6a1c24"], [1, "#2a0a14"]],
    fog: "#8a3020",
    sea: "#ff5a1f",
    seaGlow: true,
    cloud: "#5a4646",
    light: [0.9, 1.6, "#ffb07a"],
    road: {
      // Тёмный камень с огненными трещинами
      tex: tile((ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 64, 128);
      }),
      glow: tile((ctx) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 64, 128);
        ctx.strokeStyle = "#ff8a1a";
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          let x = (i * 19) % 64,
            y = (i * 29) % 128;
          ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) ctx.lineTo((x += ((k * 11 + i * 5) % 17) - 8), (y += 12));
          ctx.stroke();
        }
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(0, 0, 3, 128);
        ctx.fillRect(61, 0, 3, 128);
      }),
      color: (h) => hsl(0.02, 0.25, 0.16 + (h % 0.2) * 0.2),
      roughness: 0.7,
      clearcoat: 0.2,
    },
    rail: (h, i) => hsl(0.06 + (i % 3) * 0.04, 1, 0.55),
    railGlow: 1.0,
    leg: () => hsl(0.02, 0.3, 0.22),
    rock: () => hsl(0.02, 0.3, 0.18),
    grass: () => hsl(0.03, 0.3, 0.26),
    crowns: ["#ff7a1a", "#ffd23f", "#ff3d2a", "#ffa53d"],
    glowCrowns: true,
    decor: "none",
  },
  {
    id: "gold",
    trim: () => new T.Color("#ffffff"),
    water: { deep: "#1a5fd0", shallow: "#5fc8ff", sky: "#e8eeff", sun: "#fff0c8" },
    name: "Золото",
    ui: "linear-gradient(135deg,#fff3b0,#e8b73a,#4d7ff0)",
    sky: [[-1, "#ffe9b0"], [-0.08, "#fff1cc"], [0.03, "#fff6dc"], [0.16, "#9fc4ff"], [0.45, "#4d7ff0"], [1, "#2a4ac0"]],
    fog: "#e8eeff",
    sea: "#fff8e8",
    cloud: "#ffffff",
    light: [1.2, 2.2, "#fff0c8"],
    road: { tex: tile(stripes("#ffffff", "#e9e2c8")), color: (h) => hsl(0.12, 0.8, 0.55 + (h % 0.2) * 0.3), roughness: 0.22, metalness: 0.75, clearcoat: 1 },
    rail: (h, i) => (i % 2 ? new T.Color("#ffd23f") : new T.Color("#ffffff")),
    leg: () => new T.Color("#e8b73a"),
    rock: (r) => hsl(0.08, 0.35, 0.6),
    grass: (r) => hsl(0.3 + r * 0.08, 0.6, 0.5),
    crowns: ["#ffd23f", "#ffffff", "#7cd36b", "#ffb43a"],
    decor: "rainbow",
  },
  {
    id: "space",
    trim: () => new T.Color("#2a2060"),
    name: "Космос",
    ui: "linear-gradient(135deg,#05030f,#5b35c9,#2ff3ff)",
    sky: [[-1, "#05030f"], [-0.08, "#0f0a2a"], [0.03, "#2a1660"], [0.16, "#140c38"], [0.45, "#0a0620"], [1, "#020108"]],
    fog: "#120a30",
    sea: "#0c0820",
    cloud: "#5b3fa8",
    light: [0.6, 1.2, "#c8b8ff"],
    stars: true,
    road: {
      tex: tile(stripes("#ffffff", "#e0e8ff")),
      glow: tile((ctx) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 64, 128);
        ctx.strokeStyle = "#7a5cff";
        ctx.lineWidth = 2;
        for (let x = 0; x <= 64; x += 16) ctx.strokeRect(x, 0, 0.1, 128);
        for (let y = 0; y <= 128; y += 16) ctx.strokeRect(0, y, 64, 0.1);
        ctx.fillStyle = "#2ff3ff";
        ctx.fillRect(0, 0, 4, 128);
        ctx.fillRect(60, 0, 4, 128);
      }),
      color: (h) => hsl(0.68 + (h % 0.3) * 0.4, 0.6, 0.3),
      roughness: 0.15,
      metalness: 0.4,
      clearcoat: 1,
    },
    rail: (h, i) => hsl(i % 2 ? 0.52 : 0.78, 1, 0.65),
    railGlow: 1.1,
    leg: () => hsl(0.72, 0.4, 0.35),
    rock: () => hsl(0.7, 0.2, 0.3),
    grass: () => hsl(0.74, 0.45, 0.38),
    crowns: ["#2ff3ff", "#b47cff", "#ff8ff0", "#7cffd1"],
    glowCrowns: true,
    decor: "planets",
  },
  {
    id: "forest",
    name: "Лес",
    ui: "linear-gradient(135deg,#2f9a5f,#8ad66b,#c98a4a)",
    sky: [[-1, "#cfeee0"], [-0.08, "#d8f4e6"], [0.03, "#f2fff6"], [0.16, "#a6e3ff"], [0.45, "#5bb8f5"], [1, "#2f7fe0"]],
    fog: "#d6f0ea",
    sea: "#2a9a8a",
    cloud: "#ffffff",
    light: [1.2, 2.2, "#fff2d0"],
    trim: () => new T.Color("#7a4f2c"),
    water: { deep: "#11707a", shallow: "#3fcbb0", sky: "#d6f0ea", sun: "#fff2c4" },
    road: {
      // Деревянные мостки: доски поперёк, щели между ними, сучки
      tex: tile((ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 64, 128);
        for (let y = 0; y < 128; y += 16) {
          ctx.fillStyle = y % 32 ? "#f2e6d6" : "#ffffff";
          ctx.fillRect(0, y + 1, 64, 13);
          ctx.fillStyle = "#6b4a2b";
          ctx.fillRect(0, y + 14, 64, 2);
          ctx.fillStyle = "#c9a57a";
          ctx.fillRect(((y * 7) % 40) + 8, y + 6, 4, 3);
        }
        ctx.fillStyle = "#8a6a4a";
        ctx.fillRect(6, 0, 2, 128);
        ctx.fillRect(56, 0, 2, 128);
      }),
      color: (h) => hsl(0.07 + (h % 0.1) * 0.2, 0.55, 0.58),
      roughness: 0.7,
      clearcoat: 0.15,
    },
    rail: (h, i) => hsl(0.13, 1, 0.6 + (i % 2) * 0.15),
    leg: () => new T.Color("#8a5a33"),
    rock: (r) => hsl(0.08, 0.2, 0.5 + r * 0.1),
    grass: (r) => hsl(0.3 + r * 0.06, 0.65, 0.45),
    crowns: ["#2f9a4f", "#3fb85a", "#1f7a42", "#5ccf73"],
    pines: true,
    decor: "none",
  },
  {
    id: "city",
    name: "Город будущего",
    ui: "linear-gradient(135deg,#1a1a4a,#ff6fb0,#3fd6ff)",
    sky: [[-1, "#ff9a6b"], [-0.08, "#ff8fa8"], [0.03, "#ffb8a0"], [0.16, "#c07ad8"], [0.45, "#5a3aa8"], [1, "#1a1450"]],
    fog: "#c08ac8",
    sea: "#2a2a6a",
    cloud: "#e8c8f0",
    light: [1.0, 1.8, "#ffc8a8"],
    trim: () => new T.Color("#e8ecff"),
    water: { deep: "#1a1f5a", shallow: "#5a6ad8", sky: "#ffb8c8", sun: "#ffd0a0" },
    road: {
      tex: tile(stripes("#ffffff", "#e6eaf4")),
      glow: tile((ctx) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 64, 128);
        ctx.fillStyle = "#3fd6ff";
        ctx.fillRect(0, 0, 3, 128);
        ctx.fillRect(61, 0, 3, 128);
        ctx.fillStyle = "#ff6fb0";
        for (let y = 10; y < 128; y += 32) ctx.fillRect(30, y, 4, 14);
      }),
      color: (h) => hsl(0.66, 0.15, 0.72 + (h % 0.2) * 0.3),
      roughness: 0.15,
      metalness: 0.6,
      clearcoat: 1,
    },
    rail: (h, i) => hsl(i % 2 ? 0.92 : 0.52, 1, 0.62),
    railGlow: 1.1,
    leg: () => new T.Color("#c8d0e8"),
    rock: () => hsl(0.68, 0.2, 0.4),
    grass: () => hsl(0.5, 0.5, 0.45),
    crowns: ["#3fd6ff", "#ff6fb0", "#b47cff", "#7cffd1"],
    glowCrowns: true,
    decor: "city",
  },
];
export const themeFor = (level) => themes[level % themes.length];
