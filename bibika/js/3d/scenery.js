import * as T from "../../vendor/three/three.module.min.js";
import { mergeGeometries } from "../../vendor/three/BufferGeometryUtils.js";

export const UNITS_PER_METRE = 22,
  TILE = 64;
// Рисунок поворотов у каждой трассы свой: [амплитуда, частота] двух волн
const CURVES = [
  [12, 0.012, 4, 0.029],
  [18, 0.009, 3, 0.024],
  [24, 0.007, 2, 0.031],
  [10, 0.018, 5, 0.037],
  [16, 0.011, 6, 0.026],
  [9, 0.02, 4, 0.04],
  [26, 0.008, 5, 0.022],
];
let curve = CURVES[0], trackWorld = 0;
export function setTrack(world) {
  trackWorld = world;
  curve = CURVES[world % CURVES.length];
  hillHeight = HILL_HEIGHT[world % HILL_HEIGHT.length];
}
export function bend(s) {
  return curve[0] * Math.sin(s * curve[1]) + curve[2] * Math.sin(s * curve[3]);
}
export function heading(s) {
  return -Math.atan(
    curve[0] * curve[1] * Math.cos(s * curve[1]) +
      curve[2] * curve[3] * Math.cos(s * curve[3]),
  );
}
// Мосты и туннели идут по плиткам дороги: цикл из 10 плиток, это около 40 секунд езды
// Разметка дороги по плиткам (64 м): цикл длиннее обычного заезда, каждые 15–20 секунд что-то новое
const CYCLE = 24,
  ZONES = {
    2: ["tunnel", 2, 0],
    3: ["tunnel", 2, 1],
    4: ["loop", 2, 0],
    5: ["loop", 2, 1],
    6: ["bridge", 3, 0, true],
    7: ["bridge", 3, 1, true],
    8: ["bridge", 3, 2, true],
    11: ["pit", 2, 0],
    12: ["pit", 2, 1],
    13: ["tunnel", 2, 0],
    14: ["tunnel", 2, 1],
    17: ["bridge", 3, 0],
    18: ["bridge", 3, 1],
    19: ["bridge", 3, 2],
    20: ["loop", 2, 0],
    21: ["loop", 2, 1],
  },
  // Горки идут парами плиток, высота зависит от трассы
  HILL_STARTS = [0, 9, 15, 22],
  HILL_HEIGHT = [2.6, 4.6, 6, 5, 1.2, 5, 7],
  BRIDGE_RISE = 9,
  // Недостроенный мост: разрыв в середине, подъём к краю и дуга полёта над водой
  LEAP_LENGTH = 32,
  LEAP_KICK = 24,
  LEAP_RAMP = 4,
  LEAP_ARC = 2.64,
  WATER_Y = -11,
  TOWER_TOP = 36,
  WASH_HALF = 12;
export const LOOP_RADIUS = 9.5;
let hillHeight = HILL_HEIGHT[0];
function zoneOf(index) {
  if (index < 0) return null;
  // Первые кварталы и поля открыты для заданий. У моря начинаем со стеклянной галереи.
  if ((trackWorld === 0 || trackWorld === 1) && index >= 2 && index <= 5) return null;
  if ([2, 3, 6].includes(trackWorld) && (index === 2 || index === 3)) return null;
  const at = ZONES[index % CYCLE];
  if (!at) return null;
  return {
    kind: at[0],
    parts: at[1],
    part: at[2],
    start: (index - at[2]) * TILE,
    broken: !!at[3],
  };
}
function hillAt(s, index) {
  if (index < 0) return 0;
  const n = index % CYCLE,
    first = HILL_STARTS.includes(n),
    start = (first ? index : index - 1) * TILE,
    t = (s - start) / (2 * TILE);
  return hillHeight * Math.sin(2 * Math.PI * t) ** 2;
}
export function onHill(s) {
  return s >= 0 && !zoneOf(Math.floor(s / TILE));
}
function centerOf(zone) {
  return zone.start + TILE;
}
// Петля на середине своего участка: возвращает её координату, когда машина подъехала
export function loopAt(s) {
  const zone = zoneOf(Math.floor(s / TILE));
  if (zone?.kind !== "loop") return null;
  const c = centerOf(zone);
  return s >= c - 1 && s < c + 3 ? c : null;
}
export function loopAhead(from, to) {
  for (let i = Math.floor(from / TILE); i <= Math.floor(to / TILE); i++) {
    const zone = zoneOf(i);
    if (zone?.kind === "loop" && zone.part === 1) {
      const c = centerOf(zone);
      if (c >= from && c <= to) return c;
    }
  }
  return null;
}
export function pitAt(s) {
  const zone = zoneOf(Math.floor(s / TILE));
  if (zone?.kind !== "pit") return false;
  return Math.abs(s - centerOf(zone)) < WASH_HALF;
}
export function washNear(d) {
  const first = Math.floor(d / TILE);
  for (let i = first - 1; i <= first + 3; i++) {
    const zone = zoneOf(i);
    if (zone?.kind === "pit" && zone.part === 1) return centerOf(zone);
  }
  return null;
}
// На обычной плитке у дороги могут стоять животные
export function openGround(index) {
  const zone = zoneOf(index);
  return index >= 0 && (!zone || zone.kind === "loop");
}
function leapStart(zone) {
  return zone.start + TILE + 16;
}
// В разрыве дорогу не рисуем, но по этой дуге летят машина, встречные и звёзды
export function leapAt(s) {
  const zone = zoneOf(Math.floor(s / TILE));
  if (!zone?.broken) return false;
  const a = leapStart(zone);
  return s > a && s < a + LEAP_LENGTH;
}
// Здесь не ставим конусы, лужи и трамплины: разрыв, петля или автомойка рядом
export function leapNear(s) {
  const zone = zoneOf(Math.floor(s / TILE));
  // Запас вокруг петли и мойки небольшой, остальной участок остаётся живым
  if (zone?.kind === "loop") return Math.abs(s - centerOf(zone)) < 32;
  if (zone?.kind === "pit") return Math.abs(s - centerOf(zone)) < 28;
  if (!zone?.broken) return false;
  const a = leapStart(zone);
  return s > a - LEAP_KICK - 4 && s < a + LEAP_LENGTH + LEAP_KICK + 4;
}
// Ближайший мост впереди: под ним идут корабль или поезд
export function bridgeNear(d) {
  const first = Math.floor(d / TILE);
  for (let i = first - 4; i <= first + 5; i++) {
    const zone = zoneOf(i);
    if (zone?.kind === "bridge")
      return {
        mid: zone.broken ? leapStart(zone) + LEAP_LENGTH / 2 : zone.start + TILE + 32,
        broken: zone.broken,
      };
  }
  return null;
}
export function tunnelStart(d) {
  const zone = zoneOf(Math.floor(d / TILE));
  return zone?.kind === "tunnel" ? zone.start : null;
}
// Голос и звук объявляют только туннели и мосты, у петли и мойки свои события
export function zoneAt(s) {
  const kind = zoneOf(Math.floor(s / TILE))?.kind;
  return kind === "tunnel" || kind === "bridge" ? kind : "";
}
// Дорога поднимается только на мостах: земля вокруг остаётся ровной
export function rise(s) {
  const index = Math.floor(s / TILE),
    zone = zoneOf(index);
  if (!zone) return hillAt(s, index);
  if (zone.kind !== "bridge") return 0;
  let h =
    BRIDGE_RISE *
    Math.sin(((s - zone.start) / (zone.parts * TILE)) * Math.PI) ** 2;
  if (zone.broken) {
    const a = leapStart(zone),
      b = a + LEAP_LENGTH;
    if (s > a - LEAP_KICK && s <= a)
      h += LEAP_RAMP * ((s - a + LEAP_KICK) / LEAP_KICK) ** 2;
    else if (s > a && s < b) {
      const u = (s - a) / LEAP_LENGTH;
      h += LEAP_RAMP + LEAP_ARC * 4 * u * (1 - u);
    } else if (s >= b && s < b + LEAP_KICK)
      h += LEAP_RAMP * (1 - (s - b) / LEAP_KICK) ** 2;
  }
  return h;
}
export function riseSlope(s) {
  return (rise(s + 1) - rise(s - 1)) / 2;
}
// 0 снаружи, 1 в глубине туннеля: от этого зависит свет
export function tunnelAmount(s) {
  const zone = zoneOf(Math.floor(s / TILE));
  if (zone?.kind !== "tunnel") return 0;
  const inside = s - zone.start,
    left = zone.parts * TILE - inside;
  return Math.min(1, inside / 9, left / 9);
}
const TUNNEL_STYLE = [
  { walls: ["#9aa1a8", "#7f868e"], rock: "#8f8a80", frame: "#f2c230", glow: "#fff2c0", top: ["#7d9a5f", "#94ad6c"] },
  { walls: ["#a99a84", "#8d7e69"], rock: "#94836b", frame: "#c9b18a", glow: "#ffe9b5", top: ["#6fa04e", "#88b85a"] },
  { walls: ["#c9925a", "#ad7843"], rock: "#c28a52", frame: "#e8c07e", glow: "#ffd28a", top: ["#d9a968", "#c79556"] },
  { walls: ["#9edcf0", "#7fc4de"], rock: "#a9cfe0", frame: "#e9f8ff", glow: "#c9f6ff", top: ["#f4fbff", "#dcecf3"] },
  { walls: ["#3fa7c4", "#2a8bab"], rock: "#7f9f92", frame: "#ffe08a", glow: "#a8f4ff", top: ["#7cb86a", "#94c777"] },
  { walls: ["#ff9ec9", "#fff0f6"], rock: "#c98fbd", frame: "#ff5fa8", glow: "#fff0a8", top: ["#d9a0cf", "#efc0dc"] },
  { walls: ["#2b2558", "#1d1940"], rock: "#4a4168", frame: "#27e6ff", glow: "#27e6ff", top: ["#5d5380", "#6d6392"] },
];
const BRIDGE_STYLE = [
  { tower: "#d9432f", cable: "#b5352a", under: "#3e8ec4", bank: "#7d7a72", deck: "#5d6268", rail: "#e8e4d8", deco: "boat" },
  { tower: "#b98c5a", cable: "#6d5238", under: "#4ea6c8", bank: "#7c8a57", deck: "#8d7355", rail: "#d9c49c", deco: "boat" },
  { tower: "#d97a2b", cable: "#8a4e22", under: "#b6763f", bank: "#b98a52", deck: "#6a5f55", rail: "#ecd7ae", deco: "rock" },
  { tower: "#5fb6dc", cable: "#d9f3fb", under: "#c5ecf7", bank: "#d7e8ef", deck: "#8fa7b4", rail: "#ffffff", deco: "floe" },
  { tower: "#f7f7f2", cable: "#ff8a5c", under: "#1f9dbd", bank: "#d6c288", deck: "#7c8c90", rail: "#ffffff", deco: "boat" },
  { tower: "#ff5fa8", cable: "#fff0f6", under: "#8a5235", bank: "#d48fbf", deck: "#b06a9c", rail: "#fff0a8", deco: "candy" },
  { tower: "#7c5cff", cable: "#27e6ff", under: "#0d0b24", bank: "#4a4168", deck: "#3a3560", rail: "#27e6ff", deco: "asteroid" },
];
const glowMats = new Map();
function glow(color) {
  if (!glowMats.has(color))
    glowMats.set(
      color,
      new T.MeshBasicMaterial({ color, toneMapped: false }),
    );
  return glowMats.get(color);
}
const palettes = [
  ["#1f7fe0", "#bfe6fa", "#6fbf4a"],
  ["#2a8cf0", "#dcf3c2", "#63c244"],
  ["#2f8fe0", "#fbd49a", "#e8b45e"],
  ["#2f86e8", "#e8f8ff", "#f2f8fc"],
  ["#0c8fe8", "#bdf2f2", "#f2d893"],
  ["#a35ff0", "#ffd9ea", "#ffb3d6"],
  ["#120f3a", "#6a4fb0", "#6a5a96"],
];
export function skyColors(world) {
  return palettes[world % palettes.length];
}
// Земля: пятна и точки вместо заливки одним цветом
const GROUND_TONES = [
  ["#6fbf4a", "#4f9f3a", "#9bd85f"],
  ["#63c244", "#3f9e36", "#a5e05a"],
  ["#e8b45e", "#cf9342", "#f7d78a"],
  ["#f2f8fc", "#cfe3f0", "#ffffff"],
  ["#f2d893", "#dcbc6e", "#fff0bd"],
  ["#ffb3d6", "#f58cc0", "#ffe0ef"],
  ["#6a5a96", "#4c3f78", "#9484c4"],
];
const groundMats = new Map();
function groundTexture(wi) {
  const [base, dark, light] = GROUND_TONES[wi];
  return texture(512, 512, (g) => {
    const rng = random(wi * 97 + 11);
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 420; i++) {
      g.globalAlpha = 0.08 + rng() * 0.18;
      g.fillStyle = rng() > 0.5 ? dark : light;
      const x = rng() * 512,
        y = rng() * 512,
        r = 8 + rng() * 46;
      for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let i = 0; i < 2600; i++) {
      g.globalAlpha = 0.25 + rng() * 0.4;
      g.fillStyle = rng() > 0.5 ? dark : light;
      g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 2.4, 1 + rng() * 5);
    }
    g.globalAlpha = 1;
  });
}
function groundMaterial(wi) {
  if (!groundMats.has(wi))
    groundMats.set(
      wi,
      new T.MeshStandardMaterial({
        map: groundTexture(wi),
        roughness: wi === 3 ? 0.55 : 0.95,
        side: T.DoubleSide,
      }),
    );
  return groundMats.get(wi);
}
// Бордюр у дороги: полосатый, как на гоночной трассе
const KERBS = [
  ["#e8321a", "#ffffff"],
  ["#ff8a1e", "#ffffff"],
  ["#d9531e", "#fff0c9"],
  ["#2f9bff", "#ffffff"],
  ["#17b6c9", "#ffffff"],
  ["#ff4f9e", "#ffffff"],
  ["#27e6ff", "#2b2558"],
];
const WALK_TONES = ["#c9c3b6", "#c9b78f", "#dcc08a", "#dbe7ee", "#e8d9a8", "#f3c9df", "#55497e"];
const kerbMats = new Map();
function kerbMaterial(wi, inner) {
  const key = wi + "/" + inner;
  if (!kerbMats.has(key)) {
    const [a, b2] = KERBS[wi],
      tex = texture(64, 64, (g) => {
        g.fillStyle = WALK_TONES[wi];
        g.fillRect(0, 0, 64, 64);
        const x = inner ? 44 : 0;
        for (let i = 0; i < 2; i++) {
          g.fillStyle = i ? b2 : a;
          g.fillRect(x, i * 32, 20, 32);
        }
      });
    tex.repeat.set(1, 3);
    kerbMats.set(key, new T.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  }
  return kerbMats.get(key);
}
// Вода с рябью: блестит и течёт
const waterMats = new Map();
const WATER = [
  ["#1e8fe0", "#7fd6ff"],
  ["#24a8e8", "#a4e8ff"],
  ["#c98a4a", "#e8b77a"],
  ["#9fe0f5", "#ffffff"],
  ["#0fa8d0", "#8ff2f2"],
  ["#8a4a2a", "#c98a5a"],
  ["#120f3a", "#4a3f8f"],
];
function waterMaterial(wi) {
  if (!waterMats.has(wi)) {
    const [base, shine] = WATER[wi],
      tex = texture(256, 256, (g) => {
        const rng = random(wi + 301);
        g.fillStyle = base;
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = shine;
        for (let i = 0; i < 150; i++) {
          g.globalAlpha = 0.14 + rng() * 0.4;
          g.lineWidth = 1 + rng() * 2;
          const x = rng() * 256,
            y = rng() * 256,
            w = 8 + rng() * 26;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + w / 2, y - 3 - rng() * 3, x + w, y);
          g.stroke();
        }
        g.globalAlpha = 1;
      });
    waterMats.set(
      wi,
      new T.MeshStandardMaterial({
        map: tex,
        roughness: wi === 2 ? 0.9 : 0.14,
        metalness: wi === 2 ? 0 : 0.35,
      }),
    );
  }
  return waterMats.get(wi);
}
function waterStrip(start, wi) {
  const geo = new T.PlaneGeometry(450, TILE + 0.02),
    uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 2);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WATER_Y, -TILE / 2);
  const m = new T.Mesh(geo, waterMaterial(wi));
  m.receiveShadow = true;
  return m;
}
// Панорама на горизонте у каждой трассы своя
const backdrops = new Map();
function backdropTexture(wi) {
  if (backdrops.has(wi)) return backdrops.get(wi);
  const tex = texture(2048, 256, (g) => {
    const rng = random(wi * 53 + 3),
      W = 2048,
      H = 256,
      ridge = (color, base, height, rough, alpha = 1) => {
        g.globalAlpha = alpha;
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, H);
        const a = rng() * 6,
          b = rng() * 6,
          k = Math.round(2 + rng() * 3);
        for (let x = 0; x <= W; x += 8) {
          const t = (x / W) * Math.PI * 2,
            y =
              base -
              height * (0.5 + 0.5 * Math.sin(t * k + a)) -
              height * rough * (0.5 + 0.5 * Math.sin(t * (k * 5 + 1) + b)) -
              height * rough * 0.4 * (0.5 + 0.5 * Math.sin(t * (k * 13 + 2) + a));
          g.lineTo(x, y);
        }
        g.lineTo(W, H);
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
      };
    g.clearRect(0, 0, W, H);
    if (wi === 0) {
      for (let row = 0; row < 3; row++) {
        const shade = ["#a9c6dc", "#86a8c4", "#688bab"][row];
        for (let x = 0; x < W; x += 20 + rng() * 34) {
          const w = 16 + rng() * 34,
            h = 40 + rng() * (150 - row * 34);
          g.fillStyle = shade;
          g.fillRect(x, H - h, w, h);
          g.fillStyle = "#fff3b8";
          for (let wy = H - h + 5; wy < H - 6; wy += 9)
            for (let wx = x + 3; wx < x + w - 3; wx += 7)
              if (rng() > 0.72) g.fillRect(wx, wy, 3, 4);
        }
      }
    } else if (wi === 1) {
      ridge("#a9d4b0", 210, 70, 0.3, 0.9);
      ridge("#7fc070", 236, 62, 0.25);
      ridge("#58a84c", 250, 42, 0.2);
    } else if (wi === 2) {
      ridge("#f2b483", 205, 44, 0.3, 0.85);
      for (let i = 0; i < 16; i++) {
        const x = rng() * W,
          w = 60 + rng() * 120,
          h = 44 + rng() * 96;
        g.fillStyle = ["#c9673a", "#b4552e", "#d97a44"][i % 3];
        g.beginPath();
        g.moveTo(x, H);
        g.lineTo(x + w * 0.14, H - h);
        g.lineTo(x + w * 0.86, H - h);
        g.lineTo(x + w, H);
        g.closePath();
        g.fill();
        g.fillStyle = "#f2a06a";
        g.fillRect(x + w * 0.14, H - h, w * 0.72, 6);
      }
    } else if (wi === 3) {
      ridge("#c4dcee", 180, 100, 0.8, 0.9);
      ridge("#9dc0dc", 216, 100, 0.8);
      ridge("#f4fbff", 244, 56, 0.5);
    } else if (wi === 4) {
      for (let i = 0; i < 9; i++) {
        const x = rng() * W,
          w = 90 + rng() * 240,
          h = 20 + rng() * 58;
        g.fillStyle = i % 2 ? "#5cc79a" : "#3fb18a";
        g.beginPath();
        g.ellipse(x, H - 26, w, h, 0, Math.PI, 0);
        g.fill();
      }
      g.fillStyle = "#17a8d4";
      g.fillRect(0, H - 26, W, 26);
    } else if (wi === 5) {
      ridge("#ffd0e8", 206, 66, 0.25, 0.9);
      ridge("#f79ccd", 240, 56, 0.2);
      for (let i = 0; i < 26; i++) {
        const x = rng() * W,
          h = 50 + rng() * 80;
        g.fillStyle = "#fff4f9";
        g.fillRect(x - 3, H - h, 6, h);
        g.fillStyle = ["#ff5fa8", "#ffd23f", "#7be0c3", "#b57bff"][i % 4];
        g.beginPath();
        g.arc(x, H - h, 16 + rng() * 14, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const x = rng() * W,
          y = 20 + rng() * 110,
          r = 10 + rng() * 34,
          grad = g.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
        grad.addColorStop(0, ["#ffd9a8", "#a8e8ff", "#ffb3d6", "#c9b3ff"][i % 4]);
        grad.addColorStop(1, ["#c9673a", "#2f6fc9", "#b53a8a", "#5a3fb0"][i % 4]);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      ridge("#463a78", 226, 56, 0.6);
      ridge("#352a60", 248, 40, 0.5);
    }
  });
  tex.repeat.set(2, 1);
  backdrops.set(wi, tex);
  return tex;
}
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const mats = new Map();
function material(color, rough = 0.83) {
  const k = color + rough;
  if (!mats.has(k)) {
    const m = new T.MeshStandardMaterial({ color, roughness: rough });
    m.userData.flat = true;
    mats.set(k, m);
  }
  return mats.get(k);
}
// Все простые цветные детали участка рисуются одной сеткой с цветом в вершинах
const flatMats = new Map();
function flatMaterial(rough) {
  const key = rough < 0.3 ? 0 : rough < 0.6 ? 1 : 2;
  if (!flatMats.has(key))
    flatMats.set(
      key,
      new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: [0.18, 0.45, 0.82][key],
        metalness: [0.3, 0.1, 0][key],
      }),
    );
  return flatMats.get(key);
}
function texture(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"));
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
let facadeAtlas;
export async function prepareFacades() {
  const im = new Image();
  im.src = new URL("../../assets/scenery/facades.webp", import.meta.url).href;
  await im.decode();
  facadeAtlas = im;
}
function facade(index, height = 14) {
  if (facadeAtlas) {
    const cell = index % 4,
      repeats = Math.max(1, Math.round(height / 14)),
      key = "photo" + cell + "/" + repeats;
    if (!mats.has(key)) {
      const tex = texture(512, 512, (g) => {
        const w = facadeAtlas.width / 2,
          h = facadeAtlas.height / 2;
        g.drawImage(
          facadeAtlas,
          (cell % 2) * w,
          Math.floor(cell / 2) * h,
          w,
          h,
          0,
          0,
          512,
          512,
        );
      });
      tex.repeat.y = repeats;
      mats.set(
        key,
        new T.MeshStandardMaterial({
          map: tex,
          roughness: cell === 1 ? 0.31 : 0.76,
          metalness: cell === 1 ? 0.22 : 0.04,
        }),
      );
    }
    return mats.get(key);
  }
  const key = "facade" + index;
  if (mats.has(key)) return mats.get(key);
  const tex = texture(256, 512, (g) => {
    const rng = random(index + 75),
      hues = ["#caa78e", "#e5d5b4", "#93a7ae", "#c19483", "#a8b2b5"];
    g.fillStyle = hues[index % 5];
    g.fillRect(0, 0, 256, 512);
    for (let row = 0; row < 8; row++) {
      let y = row * 64;
      g.fillStyle = "#ffffff66";
      g.fillRect(0, y, 256, 3);
      g.fillStyle = "#483c3528";
      g.fillRect(0, y + 4, 256, 2);
      for (let col = 0; col < 4; col++) {
        const x = col * 64 + 12;
        g.fillStyle = "#6b6f70";
        g.fillRect(x - 3, y + 11, 44, 42);
        const glass = g.createLinearGradient(x, y, x + 35, y + 48);
        glass.addColorStop(0, rng() > 0.6 ? "#d0c9a6" : "#99baca");
        glass.addColorStop(0.48, "#7796a7");
        glass.addColorStop(1, "#354957");
        g.fillStyle = glass;
        g.fillRect(x, y + 13, 38, 37);
        g.fillStyle = "#c7c2ae";
        g.fillRect(x + 18, y + 13, 2, 37);
        g.fillRect(x, y + 28, 38, 2);
        g.fillStyle = "#e5ddc8";
        g.fillRect(x - 4, y + 50, 46, 3);
        g.fillStyle = "#514d492f";
        g.fillRect(x - 3, y + 54, 43, 4);
      }
    }
  });
  const m = new T.MeshStandardMaterial({ map: tex, roughness: 0.68 });
  mats.set(key, m);
  return m;
}
const assetRock = new T.IcosahedronGeometry(1, 0);
const cube = new T.BoxGeometry(),
  ball = new T.SphereGeometry(1, 12, 9),
  cone = new T.ConeGeometry(1, 1, 12),
  pole = new T.CylinderGeometry(1, 1, 1, 10);
// Merge a tile once; scrolling only changes its transform. Shared primitives and textures stay resident.
class TileBuilder {
  constructor() {
    this.batches = new Map();
    this.dummy = new T.Object3D();
    this.lift = 0;
  }
  part(geo, m, x, y, z, w, h, l, rx = 0, ry = 0, rz = 0) {
    const a = this.batches.get(m) || [];
    this.batches.set(m, a);
    const o = this.dummy;
    o.position.set(x, y + this.lift, z);
    o.scale.set(w, h, l);
    o.rotation.set(rx, ry, rz);
    o.updateMatrix();
    a.push({ geo, matrix: o.matrix.clone() });
  }
  box(x, y, z, w, h, l, color) {
    this.part(
      cube,
      typeof color === "string" ? material(color) : color,
      x,
      y,
      z,
      w,
      h,
      l,
    );
  }
  ell(x, y, z, w, h, l, color) {
    this.part(ball, material(color), x, y, z, w, h, l);
  }
  trunk(x, y, z, r, h, color) {
    this.part(pole, material(color), x, y, z, r, h, r);
  }
  build() {
    const group = new T.Group(),
      flats = new Map();
    for (const [m, list] of this.batches) {
      if (m.userData.flat) {
        const target = flatMaterial(m.roughness),
          store = flats.get(target) || [];
        flats.set(target, store);
        for (const { geo, matrix } of list) {
          const part = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix),
            count = part.attributes.position.count,
            colors = new Float32Array(count * 3);
          for (let i = 0; i < count; i++)
            colors.set([m.color.r, m.color.g, m.color.b], i * 3);
          part.setAttribute("color", new T.BufferAttribute(colors, 3));
          store.push(part);
        }
        continue;
      }
      const parts = list.map(({ geo, matrix }) =>
        (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix),
      );
      const merged = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      const mesh = new T.Mesh(merged, m);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      group.add(mesh);
    }
    for (const [m, parts] of flats) {
      const merged = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      const mesh = new T.Mesh(merged, m);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      group.add(mesh);
    }
    return group;
  }
}
// Alpha-tested leaves give the crown small gaps and a detailed outline in sunlight.
const foliages = [];
const LEAF_TONES = [
  ["#2c8a3a", "#38a040", "#55b848", "#7bcc50", "#a4dc5e"],
  ["#ff7ab5", "#ff93c4", "#ffb0d4", "#ffc9e2", "#ff5fa0"],
  ["#ff9a2e", "#ffb53f", "#ffd058", "#f27a26", "#ffe07a"],
];
function leaves(variant = 0) {
  if (foliages[variant]) return foliages[variant];
  const tones = LEAF_TONES[variant],
    tex = texture(128, 128, (g) => {
    const rand = random(5321 + variant);
    g.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 890; i++) {
      const a = rand() * Math.PI * 2,
        r = Math.sqrt(rand()),
        x = 64 + Math.cos(a) * r * 61,
        y = 64 + Math.sin(a) * r * 59;
      g.fillStyle = tones[Math.floor(rand() * 5)];
      g.beginPath();
      g.ellipse(x, y, 2 + rand() * 3, 1 + rand() * 2, a, 0, Math.PI * 2);
      g.fill();
    }
  });
  foliages[variant] = new T.MeshStandardMaterial({
    map: tex,
    alphaTest: 0.43,
    roughness: 0.93,
    side: T.DoubleSide,
  });
  return foliages[variant];
}
const leafCard = new T.PlaneGeometry(1, 1);
function tree(b, x, z, rng, pine = false, snow = false) {
  const h = 4 + rng() * 3.4,
    // Часть деревьев цветёт или желтеет, на зиму это не влияет
    pick = rng(),
    variant = pick > 0.82 ? 1 : pick > 0.7 ? 2 : 0;
  b.trunk(x, h * 0.27, z, 0.19, h * 0.55, "#76583d");
  if (pine) {
    for (let i = 0; i < 3; i++) {
      const r = h * (0.31 - i * 0.065);
      b.part(
        cone,
        material(snow ? "#689493" : "#447851"),
        x,
        h * (0.45 + i * 0.23),
        z,
        r,
        h * 0.53,
        r,
      );
      if (snow)
        b.part(
          cone,
          material("#e5f3f3"),
          x,
          h * (0.5 + i * 0.23),
          z,
          r * 0.85,
          h * 0.44,
          r * 0.85,
        );
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4,
        r = 0.4 + rng() * 0.8;
      b.part(
        leafCard,
        leaves(variant),
        x + Math.sin(a) * r,
        h * (0.54 + rng() * 0.35),
        z + Math.cos(a) * r,
        2.8 + rng(),
        2.8 + rng() * 1.3,
        1,
        (rng() - 0.5) * 0.65,
        a,
        0,
      );
    }
  }
}
function building(b, x, z, w, h, l, i) {
  b.box(x, h / 2, z, w, h, l, facade(i, h));
  b.box(x, h + 0.18, z, w + 0.46, 0.36, l + 0.46, "#e0d5b9");
  b.box(x, h + 0.52, z, w * 0.9, 0.4, l * 0.87, "#887f72");
  b.box(x + w * 0.16, h + 1, z + l * 0.1, w * 0.24, 1.1, l * 0.21, "#b4b2a6");
  const front = x > 0 ? x - w / 2 : x + w / 2;
  b.box(front, 1.52, z, 0.12, 2.9, l * 0.88, "#3f5357");
  b.box(
    front + (x > 0 ? -0.45 : 0.45),
    3.1,
    z,
    1.1,
    0.19,
    l * 0.9,
    ["#e2a15e", "#657e7b", "#b45e4d"][i % 3],
  );
  for (let j = -1; j <= 1; j++)
    b.box(front, 1.52, z + j * l * 0.31, 0.19, 2.9, 0.13, "#dbceb8");
}
const signalLenses = {
  red: new T.MeshBasicMaterial({ color: "#ff363c" }),
  green: new T.MeshBasicMaterial({ color: "#3dff90" }),
  off: new T.MeshStandardMaterial({ color: "#302e30" }),
};
function hasIntersection(index) {
  return index >= 0 && index % 3 === 1 && !zoneOf(index);
}
export function nextSignal(from) {
  for (let i = Math.max(0, Math.floor(from / TILE)); ; i++) {
    const centre = i * TILE + 22;
    if (centre >= from && hasIntersection(i)) return centre;
  }
}
function intersection(b, extras, start) {
  const s = start + 22, center = bend(s), z = -22;
  b.box(center, 0.05, z, 105, 0.035, 7.6, "#595e62");
  for (let i = 0; i < 8; i++) {
    b.box(center - 5.3 + i * 1.5, 0.08, z - 5, 0.64, 0.025, 2.3, "#ede8d6");
    b.box(center - 5.3 + i * 1.5, 0.08, z + 5, 0.64, 0.025, 2.3, "#ede8d6");
  }
  const line = s - 8;
  const lift = b.lift;
  b.lift = rise(line);
  b.box(bend(line), 0.11, -14, 12.4, 0.06, 0.55, "#fff6cb");
  b.lift = lift;
  for (const side of [-1, 1]) {
    const x = center + side * 7.7;
    b.trunk(x, 2.5, z, 0.11, 5, "#53626b");
    b.box(x, 4.6, z, 0.7, 1.8, 0.46, "#26323d");
    for (const [i, color] of ["red", "amber", "green"].entries()) {
      const lens = new T.Mesh(new T.SphereGeometry(0.23, 10, 8), signalLenses.off);
      lens.scale.z = 0.35;
      lens.position.set(x, b.lift + 5.16 - i * 0.53, z + 0.26);
      lens.userData.signalColor = color;
      extras.add(lens);
    }
  }
}
// Фонари загораются вечером: материал общий на все участки
const streetGlow = new T.MeshStandardMaterial({
  color: "#e1e3d4",
  emissive: "#ffe6a8",
  emissiveIntensity: 0,
});
function lamp(b, x, z) {
  b.trunk(x, 2.6, z, 0.095, 5.2, "#526267");
  b.box(x - Math.sign(x) * 0.67, 5.18, z, 1.45, 0.12, 0.15, "#56656a");
  b.box(x - Math.sign(x) * 1.33, 5.05, z, 0.63, 0.15, 0.3, streetGlow);
}
// Воздушный шар над полем
function balloon(b, x, y, z, a, c) {
  b.ell(x, y, z, 6, 7.2, 6, a);
  b.part(ball, material(c), x, y + 0.3, z, 6.12, 2.3, 6.12);
  b.part(ball, material(c), x, y + 4.4, z, 3.9, 1.1, 3.9);
  b.box(x, y - 10.4, z, 1.8, 1.3, 1.8, "#a5692f");
  for (const dx of [-0.7, 0.7])
    for (const dz of [-0.7, 0.7])
      b.part(cube, material("#5a4632"), x + dx, y - 7.6, z + dz, 0.05, 4.6, 0.05);
}
function palm(b, x, z, rng) {
  const h = 5 + rng() * 2;
  b.trunk(x, h / 2, z, 0.23, h, "#9e8060");
  for (let j = 0; j < 7; j++) {
    const a = j * 0.897;
    b.part(
      ball,
      material(j % 2 ? "#4d9153" : "#699d55"),
      x + Math.sin(a) * 1.14,
      h - 0.13,
      z + Math.cos(a) * 1.14,
      0.45,
      0.2,
      1.8,
      0.14,
      a,
      0,
    );
  }
}
function bridgeCable(s, zone) {
  const length = zone.parts * TILE,
    t = (s - zone.start) / length;
  if (t >= 0.25 && t <= 0.75) {
    const u = (t - 0.5) / 0.25;
    return BRIDGE_RISE + 3.5 + (TOWER_TOP - BRIDGE_RISE - 3.5) * u * u;
  }
  const u = t < 0.25 ? t / 0.25 : (1 - t) / 0.25;
  return 1.5 + (TOWER_TOP - 1.5) * u;
}
// Оборванный край: арматура, бетон и полосатые щиты
function brokenEdge(b, center, y, z, dir, st) {
  const rebar = material("#3b3f44", 0.5);
  b.part(cube, material(st.deck, 0.9), center, y - 1.6, z - dir * 0.3, 21, 2.2, 0.8);
  for (let i = -9; i <= 9; i++) {
    const len = 1.1 + Math.abs(Math.sin(i * 12.9)) * 1.9;
    b.part(cube, rebar, center + i * 1.08, y - 0.5 - (i % 3) * 0.3, z - dir * len * 0.5, 0.09, 0.09, len);
  }
  for (const side of [-1, 1]) {
    const x = center + side * 7.9;
    b.part(cube, material("#ffd21f", 0.5), x, y + 1.0, z + dir * 1.2, 1.5, 1.5, 0.22);
    for (let i = -1; i <= 1; i++)
      b.part(cube, material("#22262c", 0.5), x + i * 0.48, y + 1.0, z + dir * 1.09, 0.18, 1.5, 0.05, 0, 0, 0.6);
    for (let i = 0; i < 3; i++)
      b.part(cone, material("#ff7a2b", 0.6), center + side * (6.2 - i * 0.9), y + 0.4, z + dir * (3 + i * 2.2), 0.28, 0.8, 0.28);
  }
}
// Башенный кран несёт следующий пролёт: мост ещё строят
function constructionCrane(b, center, zone, ts, start, y) {
  const x = center + 26,
    z = -(ts - start),
    yellow = material("#ffc21a", 0.5),
    dark = material("#2d3136", 0.5);
  b.part(cube, dark, x, WATER_Y + 1, z, 16, 1.6, 12);
  b.part(cube, yellow, x, (WATER_Y + 46) / 2, z, 2, 46 - WATER_Y, 2);
  for (let k = 0; k < 12; k++)
    b.part(cube, dark, x, WATER_Y + 3 + k * 4.6, z, 2.15, 0.14, 2.15);
  b.part(cube, yellow, x - 13, 47, z, 44, 1.2, 1.2);
  b.part(cube, dark, x + 12, 46, z, 6, 2.2, 2.2);
  b.part(cube, yellow, x, 49, z, 3, 3, 3);
  const hookX = x - 25;
  b.part(cube, dark, hookX, 38, z, 0.12, 17, 0.12);
  b.part(cube, material("#8d9299", 0.7), hookX, 29, z, 10, 1.2, 4);
}
function bridge(b, index, zone, wi, rng) {
  const st = BRIDGE_STYLE[wi],
    start = index * TILE,
    length = zone.parts * TILE,
    cable = material(st.cable, 0.45),
    steel = material(st.tower, 0.5),
    rail = material(st.rail, 0.5),
    deck = material(st.deck, 0.8),
    leapA = zone.broken ? leapStart(zone) : 0,
    leapB = leapA + LEAP_LENGTH;
  // Обрывы берегов
  if (zone.part === 0)
    b.box(0, WATER_Y / 2 - 0.3, -0.5, 450, -WATER_Y, 1, st.bank);
  if (zone.part === zone.parts - 1)
    b.box(0, WATER_Y / 2 - 0.3, -TILE + 0.5, 450, -WATER_Y, 1, st.bank);
  for (let j = 0; j < 8; j++) {
    const s = start + 4 + j * 8,
      center = bend(s),
      z = -(s - start),
      y = rise(s),
      pitch = Math.atan(riseSlope(s)),
      yaw = heading(s);
    // В разрыве настила и перил нет
    if (zone.broken && s > leapA && s < leapB) continue;
    b.part(cube, deck, center, y - 1.05, z, 21, 1.9, 8.6, pitch, yaw);
    for (const side of [-1, 1]) {
      b.part(cube, rail, center + side * 8.85, y + 1.2, z, 0.16, 0.16, 8.4, pitch, yaw);
      b.part(cube, rail, center + side * 8.85, y + 0.7, z, 0.1, 0.1, 8.4, pitch, yaw);
      b.part(cube, rail, center + side * 8.85, y + 0.6, z, 0.16, 1.25, 0.16, 0, yaw);
    }
  }
  if (zone.broken) {
    // Опоры у обрыва, края с арматурой и кран над разрывом
    for (const [s, dir] of [
      [leapA, 1],
      [leapB, -1],
    ]) {
      if (s < start || s >= start + TILE) continue;
      const center = bend(s),
        z = -(s - start),
        y = rise(s);
      brokenEdge(b, center, y, z, dir, st);
      // Опора стоит чуть раньше обрыва и не поднимается выше настила
      const pierY = rise(s - dir * 6) - 2.2,
        pier = z + dir * 6;
      for (const side of [-1, 1])
        b.part(cube, steel, center + side * 7, (pierY + WATER_Y) / 2, pier, 2.6, pierY - WATER_Y, 3.4);
      b.part(cube, steel, center, pierY - 0.6, pier, 19, 1.6, 3.6);
    }
    const crane = leapA + LEAP_LENGTH / 2;
    if (crane >= start && crane < start + TILE)
      constructionCrane(b, bend(crane), zone, crane, start, rise(crane));
    // Опоры под подъездами к разрыву
    for (const s of [zone.start + 32, zone.start + length - 32])
      if (s >= start && s < start + TILE)
        for (const side of [-1, 1])
          b.part(cube, steel, bend(s) + side * 7, (rise(s) - 2 + WATER_Y) / 2, -(s - start), 2.2, rise(s) - 2 - WATER_Y, 3);
  }
  // Два огромных пилона, между ними дорога проходит насквозь
  for (const ts of zone.broken ? [] : [zone.start + length * 0.25, zone.start + length * 0.75]) {
    if (ts < start || ts >= start + TILE) continue;
    const center = bend(ts),
      z = -(ts - start),
      deckY = rise(ts);
    for (const side of [-1, 1]) {
      const x = center + side * 10.4;
      if (wi === 5) {
        // Леденцовые полосы на конфетной трассе
        for (let k = 0; k < 12; k++)
          b.part(cube, k % 2 ? material("#fff0f6", 0.4) : steel, x, WATER_Y + 2 + k * 4, z, 2.2, 4, 3);
      } else b.part(cube, steel, x, (TOWER_TOP + WATER_Y) / 2, z, 2.2, TOWER_TOP - WATER_Y, 3);
      b.part(cube, steel, x, WATER_Y + 3, z, 4.5, 6, 6);
      b.part(ball, glow("#ff5a4a"), x, TOWER_TOP + 1.1, z, 0.55, 0.55, 0.55);
    }
    for (const y of [deckY + 11.5, TOWER_TOP * 0.74, TOWER_TOP - 0.6])
      b.part(cube, steel, center, y, z, 22.5, 1.5, 2.2);
  }
  // Несущие тросы и подвески есть только у готового моста
  for (let k = 0; k < (zone.broken ? 0 : 16); k++) {
    const s = start + 2 + k * 4,
      center = bend(s),
      z = -(s - start),
      y = bridgeCable(s, zone),
      pitch = Math.atan((bridgeCable(s + 1, zone) - bridgeCable(s - 1, zone)) / 2),
      yaw = heading(s);
    for (const side of [-1, 1]) {
      const x = center + side * 10.4;
      b.part(cube, cable, x, y, z, 0.42, 0.42, 4.5, pitch, yaw);
      if (k % 2 === 0) {
        const deckY = rise(s),
          h = y - deckY;
        if (h > 1) b.part(cube, cable, x, deckY + h / 2, z, 0.12, h, 0.12);
      }
    }
  }
  // Под большим мостом проходит железнодорожный виадук
  if (!zone.broken && zone.part === 1) {
    const c = bend(start + 32);
    b.box(c, -5.3, -32, 460, 1, 7.5, "#8d8a84");
    for (const dx of [-1.15, 1.15]) b.part(cube, material("#55595e", 0.4), c, -4.72, -32 + dx, 460, 0.16, 0.16);
    for (let k = -6; k <= 6; k++)
      b.box(c + k * 26, (WATER_Y - 5.8) / 2, -32, 3.6, -5.8 - WATER_Y, 5.4, "#8d8a84");
  }
  // Внизу есть на что посмотреть
  for (let k = 0; k < 3; k++) {
    const side = rng() > 0.5 ? 1 : -1,
      x = bend(start + 30) + side * (26 + rng() * 70),
      z = -(8 + rng() * 48);
    if (st.deco === "boat") {
      b.box(x, WATER_Y + 0.9, z, 2.2, 0.9, 5.6, "#f7f3ea");
      b.part(cone, material(k % 2 ? "#ff6d3b" : "#ffffff"), x, WATER_Y + 3.6, z, 1.5, 4.6, 0.25);
    } else if (st.deco === "rock")
      b.part(assetRock, material("#a86b3a"), x, WATER_Y + 2.5, z, 6, 6, 5);
    else if (st.deco === "floe")
      b.box(x, WATER_Y + 0.5, z, 8, 0.7, 6, "#f4fbff");
    else if (st.deco === "candy")
      b.ell(x, WATER_Y + 1.5, z, 3.6, 2.6, 3.6, ["#fff0f6", "#ffd23f", "#7be0c3"][k]);
    else b.part(assetRock, material("#6b6288"), x, WATER_Y + 3 + rng() * 9, z, 3 + rng() * 3, 3, 3);
  }
}
const ARCH_W = 9.4,
  ARCH_WALL = 4.6,
  ARCH_TOP = 9,
  ROCK_W = 64;
function archPoints() {
  const pts = [[-ARCH_W, 0], [-ARCH_W, ARCH_WALL]];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    pts.push([Math.cos(a) * ARCH_W, ARCH_WALL + Math.sin(a) * (ARCH_TOP - ARCH_WALL)]);
  }
  pts.push([ARCH_W, ARCH_WALL], [ARCH_W, 0]);
  return pts;
}
function rockHeight(u, s) {
  const k = Math.max(0, 1 - Math.abs(u / ROCK_W) ** 2.2);
  return k * (17 + 5 * Math.sin(u * 0.11 + s * 0.04) + 2.5 * Math.sin(u * 0.27 - s * 0.07));
}
function faceMaterial(color) {
  const key = "face" + color;
  if (!mats.has(key))
    mats.set(key, new T.MeshStandardMaterial({ color, roughness: 0.9, side: T.DoubleSide }));
  return mats.get(key);
}
// Гора с аркой: стены внутри, склон снаружи, лицевая стена с настоящим отверстием
// Земля на горке: полоса, повторяющая высоту дороги
function hillGround(start, wi) {
  const rows = 17,
    pos = [],
    uvs = [],
    idx = [];
  for (let row = 0; row < rows; row++) {
    const ds = (TILE * row) / (rows - 1),
      y = rise(start + ds) - 0.03,
      v = (start + ds) / 26;
    pos.push(-225, y, -ds, 225, y, -ds);
    uvs.push(-8.65, v, 8.65, v);
    if (row < rows - 1) {
      const a = row * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const m = new T.Mesh(geom, groundMaterial(wi));
  m.receiveShadow = true;
  return m;
}
// Мёртвая петля: цветная лента во всю ширину дороги
function loopRing(group, b, zone, wi) {
  const st = TUNNEL_STYLE[wi],
    c = bend(zone.start + TILE),
    R = LOOP_RADIUS,
    rows = 72,
    half = 7.2,
    pos = [],
    col = [],
    idx = [],
    color = new T.Color(),
    edge = material(st.frame, 0.45);
  for (let i = 0; i <= rows; i++) {
    const a = (i / rows) * Math.PI * 2,
      y = R * (1 - Math.cos(a)) + 0.06,
      z = -R * Math.sin(a);
    color.set(Math.floor(i / 4) % 2 ? st.frame : "#ffffff").multiplyScalar(1.2);
    pos.push(c - half, y, z, c + half, y, z);
    col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    if (i < rows) {
      const n = i * 2;
      idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geom.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const ring = new T.Mesh(geom, earth);
  ring.receiveShadow = true;
  group.add(ring);
  for (let i = 0; i < rows; i++) {
    const a = ((i + 0.5) / rows) * Math.PI * 2,
      y = R * (1 - Math.cos(a)) + 0.06,
      z = -R * Math.sin(a);
    for (const side of [-1, 1]) {
      b.part(cube, edge, c + side * (half + 0.12), y, z, 0.3, 0.32, 0.95, a);
      if (i % 6 === 0)
        b.part(ball, glow(st.glow), c + side * (half + 0.12), y + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3, 0.26, 0.26, 0.26);
    }
  }
  // Опоры по бокам держат петлю над дорогой
  for (const side of [-1, 1])
    for (const z of [-R, R]) {
      b.part(cube, edge, c + side * (half + 0.9), R / 2, z, 0.7, R, 0.7);
      b.part(cube, edge, c + side * (half + 0.5), R, z, 1.1, 0.5, 0.7);
    }
}
// Автомойка поперёк всей дороги и заправка перед ней
function pitStop(b, zone, start, wi, rng) {
  const center = zone.start + TILE,
    c = bend(center);
  if (zone.part === 1) {
    const blue = material("#2f9bff", 0.4),
      pink = material("#ff7ab5", 0.45),
      white = material("#f7f9fb", 0.35),
      foam = material("#ffffff", 0.7);
    for (const side of [-1, 1])
      for (const z of [WASH_HALF, 0, -WASH_HALF]) {
        b.part(cube, blue, c + side * 9.7, 4.6, z, 1.1, 9.2, 1.3);
        b.part(cube, white, c + side * 9.7, 9.3, z, 1.5, 0.5, 1.7);
      }
    for (const side of [-1, 1])
      b.part(cube, material("#bfe8ff", 0.15), c + side * 10.1, 3.4, 0, 0.12, 5.6, WASH_HALF * 2);
    b.part(cube, white, c, 9.75, 0, 22, 0.6, WASH_HALF * 2 + 2);
    b.part(cube, pink, c, 10.2, WASH_HALF, 22, 0.8, 1.2);
    b.part(cube, pink, c, 10.2, -WASH_HALF, 22, 0.8, 1.2);
    // Пена и большая капля на крыше видны издалека
    for (let k = 0; k < 16; k++) {
      const r = 0.7 + rng() * 1.1;
      b.part(ball, foam, c + (rng() - 0.5) * 18, 10.5 + rng() * 0.6, (rng() - 0.5) * 20, r, r * 0.8, r);
    }
    b.part(ball, blue, c, 13.3, 0, 1.9, 1.9, 1.9);
    b.part(cone, blue, c, 15.2, 0, 1.65, 2.6, 1.65);
    // Висячие полосы на въезде и выезде
    for (const z of [WASH_HALF - 0.6, -WASH_HALF + 0.6])
      for (let x = -8.7; x <= 8.7; x += 1.45)
        b.part(cube, Math.round(x / 1.45) % 2 ? pink : blue, c + x, 6.6, z, 1.05, 4.6, 0.05);
  } else {
    // Заправка: навес, колонки, магазинчик и звезда вместо вывески
    // Навес привязан к своему месту на дороге: она здесь уже успела повернуть
    const z = -(center - 42 - start),
      x = bend(center - 42) + 22,
      roof = material("#ff7a1a", 0.45),
      white = material("#f7f9fb", 0.4);
    b.box(x - 3, 0.03, z, 24, 0.05, 30, "#62676d");
    b.part(cube, roof, x, 6.3, z, 14, 0.7, 13);
    b.part(cube, white, x, 5.85, z, 14.2, 0.25, 13.2);
    for (const dx of [-5, 5]) {
      b.part(cube, white, x + dx, 2.9, z - 3.5, 0.4, 5.8, 0.4);
      b.part(cube, white, x + dx, 2.9, z + 3.5, 0.4, 5.8, 0.4);
      for (const dz of [-3.5, 3.5]) {
        b.part(cube, material("#e8321a", 0.4), x + dx * 0.45, 0.95, z + dz, 0.9, 1.9, 0.6);
        b.part(cube, material("#16191d", 0.2), x + dx * 0.45, 1.35, z + dz - 0.32, 0.6, 0.5, 0.04);
      }
    }
    b.box(x + 15, 3, z, 9, 6, 16, "#f4efe4");
    b.part(cube, material("#bfe8ff", 0.12), x + 10.45, 2.3, z, 0.1, 3, 13);
    b.part(cube, roof, x + 15, 6.2, z, 9.8, 0.5, 16.8);
    b.part(cube, white, x - 11, 4.2, z + 9, 0.4, 8.4, 0.4);
    b.part(ball, glow("#ffc21a"), x - 11, 9.2, z + 9, 1.35, 1.35, 0.4);
    if (wi !== 6) tree(b, bend(start + 24) - 15, -24, rng, wi === 3, wi === 3);
    if (wi !== 6) tree(b, bend(start + 44) - 19, -44, rng, wi === 3, wi === 3);
  }
}
const seaGlass = new T.MeshStandardMaterial({
    color: "#c7f2ff",
    transparent: true,
    opacity: 0.14,
    roughness: 0.05,
    metalness: 0.3,
    side: T.DoubleSide,
    depthWrite: false,
  }),
  seaEnd = new T.MeshBasicMaterial({
    color: "#1f86b8",
    side: T.DoubleSide,
    fog: false,
    toneMapped: false,
  }),
  seaWater = new T.MeshBasicMaterial({
    vertexColors: true,
    side: T.DoubleSide,
    fog: false,
    toneMapped: false,
  });
function tunnel(group, b, index, zone, wi) {
  const st = TUNNEL_STYLE[wi],
    sea = wi === 4,
    // Морской туннель идёт сквозь большой риф: внутри хватает места рыбам и киту
    rock = (u, s) => rockHeight(u, s) * (sea ? 2.1 : 1),
    start = index * TILE,
    arch = archPoints(),
    rows = 17,
    inner = [],
    innerColor = [],
    innerIdx = [],
    outer = [],
    outerColor = [],
    outerIdx = [],
    cols = 25,
    color = new T.Color();
  for (let row = 0; row < rows; row++) {
    const ds = (TILE * row) / (rows - 1),
      s = start + ds,
      c = bend(s);
    color.set(st.walls[row % 2]);
    arch.forEach(([x, y]) => {
      inner.push(c + x, y, -ds);
      innerColor.push(color.r, color.g, color.b);
    });
    for (let col = 0; col < cols; col++) {
      const u = -ROCK_W + (2 * ROCK_W * col) / (cols - 1),
        h = rock(u, s);
      outer.push(c + u, h, -ds);
      color.set(st.top[(col + row) % 2]);
      if (wi === 3 || h < 9) color.lerp(new T.Color(st.rock), wi === 3 ? 0 : 0.5);
      outerColor.push(color.r, color.g, color.b);
      if (row < rows - 1 && col < cols - 1) {
        const a = row * cols + col;
        outerIdx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
    if (row < rows - 1)
      for (let i = 0; i < arch.length - 1; i++) {
        const a = row * arch.length + i,
          n = arch.length;
        innerIdx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
  }
  for (const [pos, col, idx] of [
    [inner, innerColor, innerIdx],
    [outer, outerColor, outerIdx],
  ]) {
    const geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geom.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    const m = new T.Mesh(geom, sea && pos === inner ? seaGlass : earth);
    m.receiveShadow = pos === outer;
    group.add(m);
  }
  if (sea) {
    // Толща воды изнутри рифа: сверху светлее, у дна темнее
    const water = [],
      waterColor = [],
      waterIdx = [];
    for (let row = 0; row < rows; row++) {
      const ds = (TILE * row) / (rows - 1),
        s = start + ds,
        c = bend(s);
      for (let col = 0; col < cols; col++) {
        const u = (-ROCK_W + (2 * ROCK_W * col) / (cols - 1)) * 0.95,
          h = rock(u, s) * 0.93;
        water.push(c + u, h, -ds);
        color.set("#0d6c9e").lerp(new T.Color("#4fd0f0"), Math.min(1, h / 30));
        waterColor.push(color.r, color.g, color.b);
        if (row < rows - 1 && col < cols - 1) {
          const a = row * cols + col;
          waterIdx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
        }
      }
    }
    const geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.Float32BufferAttribute(water, 3));
    geom.setAttribute("color", new T.Float32BufferAttribute(waterColor, 3));
    geom.setIndex(waterIdx);
    group.add(new T.Mesh(geom, seaWater));
    // Рёбра стеклянной трубы, кораллы и камни на дне
    const rib = material("#e8f6fa", 0.3),
      rng = random(index * 41 + 7);
    for (let j = 0; j < 8; j++) {
      const s = start + 4 + j * 8,
        cx = bend(s),
        z = -(s - start);
      for (let i = 0; i < arch.length - 1; i++) {
        const [x0, y0] = arch[i],
          [x1, y1] = arch[i + 1],
          len = Math.hypot(x1 - x0, y1 - y0);
        b.part(cube, rib, cx + (x0 + x1) / 2, (y0 + y1) / 2, z, len + 0.06, 0.2, 0.34, 0, 0, Math.atan2(y1 - y0, x1 - x0));
      }
    }
    for (let k = 0; k < 18; k++) {
      const s = start + rng() * TILE,
        side = rng() > 0.5 ? 1 : -1,
        x = bend(s) + side * (11.5 + rng() * 40),
        z = -(s - start),
        kind = k % 3;
      if (kind === 0)
        b.part(ball, material(["#ff6d8a", "#ffb03b", "#c77dff"][k % 9 % 3]), x, 1 + rng(), z, 1.5, 2.2 + rng() * 1.4, 1.5);
      else if (kind === 1)
        b.part(cone, material("#2fbf71"), x, 2.4, z, 0.5, 5 + rng() * 4, 0.5);
      else b.part(assetRock, material("#7f9f92"), x, 0.7, z, 2.6, 1.6, 2.2);
    }
  }
  // Лампы на потолке и цветные полосы на стенах мелькают и дают ощущение скорости
  for (let j = 0; j < 8; j++) {
    const s = start + 4 + j * 8,
      center = bend(s),
      z = -(s - start),
      yaw = heading(s);
    if (!sea)
      for (const x of [-3.2, 3.2])
        b.part(cube, glow(st.glow), center + x, ARCH_TOP - 0.55, z, 0.9, 0.1, 4.2, 0, yaw);
    if (j % 2 === 0)
      for (const side of [-1, 1])
        b.part(cube, glow(wi === 5 ? "#ffd23f" : st.glow), center + side * (ARCH_W - 0.12), 2.6, z, 0.1, 0.34, 7, 0, yaw);
  }
  // Лицевая стена у входа и выхода
  const faces = [];
  if (zone.part === 0) faces.push([start, 0]);
  if (zone.part === zone.parts - 1) faces.push([start + TILE, -TILE]);
  for (const [s, z] of faces) {
    const c = bend(s),
      wall = new T.Shape();
    wall.moveTo(-ROCK_W, 0);
    for (let col = 1; col < 24; col++) {
      const u = -ROCK_W + (2 * ROCK_W * col) / 24;
      wall.lineTo(u, rock(u, s));
    }
    wall.lineTo(ROCK_W, 0);
    wall.closePath();
    const hole = new T.Path();
    arch.forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    wall.holes.push(hole);
    const face = new T.Mesh(new T.ShapeGeometry(wall), faceMaterial(st.rock));
    face.position.set(c, 0, z);
    group.add(face);
    if (sea) {
      // Изнутри торцы рифа тоже закрыты толщей воды
      const inside = new T.Mesh(face.geometry, seaEnd);
      inside.position.set(c, 0, z + (z === 0 ? -0.8 : 0.8));
      group.add(inside);
    }
    // Яркая рамка и огни вокруг въезда
    const ring = new T.Shape();
    ring.moveTo(-ARCH_W - 1.5, 0);
    ring.lineTo(-ARCH_W - 1.5, ARCH_WALL);
    for (let i = 1; i < 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      ring.lineTo(Math.cos(a) * (ARCH_W + 1.5), ARCH_WALL + Math.sin(a) * (ARCH_TOP - ARCH_WALL + 1.5));
    }
    ring.lineTo(ARCH_W + 1.5, ARCH_WALL);
    ring.lineTo(ARCH_W + 1.5, 0);
    ring.closePath();
    const gap = new T.Path();
    arch.forEach(([x, y], i) => (i ? gap.lineTo(x, y) : gap.moveTo(x, y)));
    ring.holes.push(gap);
    const frameGeo = new T.ExtrudeGeometry(ring, { depth: 1.5, bevelEnabled: false, curveSegments: 4 }),
      frame = new T.Mesh(frameGeo, faceMaterial(st.frame));
    frame.position.set(c, 0, z - 0.2);
    group.add(frame);
    for (let i = 1; i < 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      b.part(ball, glow(st.glow), c + Math.cos(a) * (ARCH_W + 0.75), ARCH_WALL + Math.sin(a) * (ARCH_TOP - ARCH_WALL + 0.75), z + 1.45, 0.3, 0.3, 0.3);
    }
  }
}
// Детали мира подальше от дороги: они и создают ощущение места
function decor(b, wi, j, side, center, z, rng) {
  const far = center + side * (24 + rng() * 34),
    pick = rng();
  if (wi === 0) {
    // Клумбы вдоль дороги
    if (j % 2) return;
    for (let i = 0; i < 5; i++)
      b.ell(center + side * (9.4 + rng() * 1.6), 0.28, z + (i - 2) * 1.4, 0.42, 0.34, 0.42, ["#ff5f8f", "#ffd23f", "#ff7a2b", "#b57bff", "#ffffff"][i]);
  } else if (wi === 1) {
    if (pick < 0.3) {
      // Красный амбар с силосом
      b.box(far, 2.6, z, 7, 5.2, 9, "#c9362b");
      b.part(cube, material("#7a2a22"), far, 5.9, z, 5.4, 0.3, 9.4, 0, 0, 0.6);
      b.part(cube, material("#7a2a22"), far + side * 0, 5.9, z, 5.4, 0.3, 9.4, 0, 0, -0.6);
      b.box(far - side * 3.52, 2.2, z, 0.1, 3.4, 3.2, "#f7f3ea");
      b.trunk(far + side * 6, 4, z + 2, 1.5, 8, "#d9dde0");
      b.ell(far + side * 6, 8, z + 2, 1.55, 1.3, 1.55, "#9aa6ae");
    } else if (pick < 0.65) {
      // Подсолнухи рядами
      for (let i = 0; i < 9; i++) {
        const x = center + side * (15 + (i % 3) * 2.6),
          zz = z + (Math.floor(i / 3) - 1) * 2.6;
        b.trunk(x, 0.8, zz, 0.05, 1.6, "#4f9f3a");
        b.ell(x, 1.72, zz, 0.42, 0.42, 0.16, "#ffc21a");
        b.ell(x, 1.72, zz - 0.1, 0.18, 0.18, 0.1, "#6d4522");
      }
    } else {
      // Тюки сена
      for (let i = 0; i < 3; i++)
        b.part(pole, material("#e8c25a"), far + i * 3, 0.9, z + i, 0.95, 1.8, 0.95, 0, 0, Math.PI / 2);
    }
  } else if (wi === 2) {
    if (pick < 0.3) {
      // Красные столовые скалы
      const w = 8 + rng() * 10,
        h = 6 + rng() * 12;
      b.box(far + side * 12, h / 2, z, w, h, w * 0.8, "#c9673a");
      b.box(far + side * 12, h + 0.5, z, w * 1.08, 1, w * 0.86, "#e88a52");
      b.box(far + side * 12, h * 0.5, z, w * 1.02, 0.6, w * 0.82, "#a84f2a");
    } else if (pick < 0.75) {
      // Кактусы с руками
      const x = center + side * (15 + rng() * 14),
        h = 2.2 + rng() * 1.8;
      b.trunk(x, h / 2, z, 0.28, h, "#3f9e4a");
      for (const s of [-1, 1]) {
        b.part(pole, material("#3f9e4a"), x + s * 0.5, h * 0.55, z, 0.14, 0.9, 0.14, 0, 0, Math.PI / 2);
        b.trunk(x + s * 0.92, h * 0.72, z, 0.14, h * 0.4, "#46ad52");
      }
    } else b.part(assetRock, material("#b4552e"), far, 0.8, z, 2.6, 1.9, 2.2);
  } else if (wi === 3) {
    if (pick < 0.3) {
      // Домик с горящими окнами
      b.box(far, 2, z, 7, 4, 6, "#8f5a34");
      b.part(cone, material("#f4fbff"), far, 5.2, z, 6, 3.2, 5.4);
      b.part(cube, glow("#ffc85a"), far - side * 3.52, 2.2, z - 1.3, 0.06, 1.2, 1.2);
      b.part(cube, glow("#ffc85a"), far - side * 3.52, 2.2, z + 1.3, 0.06, 1.2, 1.2);
    } else if (pick < 0.65) {
      // Снеговик
      const x = center + side * (12 + rng() * 5);
      b.ell(x, 0.7, z, 0.75, 0.72, 0.75, "#ffffff");
      b.ell(x, 1.72, z, 0.52, 0.5, 0.52, "#ffffff");
      b.ell(x, 2.45, z, 0.36, 0.36, 0.36, "#ffffff");
      b.part(cone, material("#ff7a1a"), x - side * 0.42, 2.45, z, 0.07, 0.42, 0.07, 0, 0, side * 1.57);
      b.trunk(x, 2.86, z, 0.26, 0.42, "#22262c");
    } else b.part(cone, material("#9fe0f5", 0.2), far, 2.4, z, 1.1, 5, 1.1);
  } else if (wi === 4) {
    if (side < 0) return;
    if (pick < 0.5) {
      // Зонтик и шезлонг
      const x = center + side * (12 + rng() * 10);
      b.trunk(x, 1.3, z, 0.05, 2.6, "#f7f3ea");
      b.part(cone, material(["#ff5f8f", "#ffc21a", "#2f9bff"][j % 3]), x, 2.85, z, 1.7, 0.9, 1.7);
      b.box(x + 1.5, 0.3, z, 0.8, 0.14, 2, "#ffffff");
    } else if (j === 1) {
      // Маяк
      for (let i = 0; i < 5; i++)
        b.trunk(far, 1.6 + i * 3.2, z, 1.5 - i * 0.14, 3.2, i % 2 ? "#ffffff" : "#e8321a");
      b.part(ball, glow("#fff1b0"), far, 17.4, z, 1, 1, 1);
    }
  } else if (wi === 5) {
    if (pick < 0.35) {
      // Кекс с вишней
      const x = center + side * (14 + rng() * 12);
      b.trunk(x, 0.9, z, 1.4, 1.8, "#c98a5a");
      b.ell(x, 2.2, z, 1.8, 1.05, 1.8, ["#ff9ac6", "#fff0f6", "#b57bff"][j % 3]);
      b.ell(x, 3.35, z, 0.36, 0.36, 0.36, "#e8321a");
    } else if (pick < 0.7) {
      // Леденцовая трость
      const x = center + side * (13 + rng() * 14);
      for (let i = 0; i < 6; i++)
        b.trunk(x, 0.4 + i * 0.8, z, 0.3, 0.8, i % 2 ? "#ffffff" : "#ff3b6b");
      b.ell(x + side * 0.55, 5, z, 0.75, 0.35, 0.35, "#ff3b6b");
    } else b.ell(far, 1.2, z, 2.6, 1.8, 2.6, ["#7be0c3", "#ffd23f", "#ff7ab5"][j % 3]);
  } else {
    if (pick < 0.5) {
      // Светящиеся кристаллы
      const x = center + side * (13 + rng() * 22),
        c = ["#27e6ff", "#ff5fd2", "#b57bff"][j % 3];
      for (let i = 0; i < 3; i++)
        b.part(cone, glow(c), x + (i - 1) * 0.9, 1 + i * 0.4, z + (i % 2) * 0.8, 0.45, 2 + i * 0.8, 0.45);
    } else if (j === 2) {
      // Купол базы
      b.ell(far, 0, z, 6, 5, 6, "#c9d4e8");
      b.part(cube, glow("#ffe36b"), far - side * 5.2, 1.5, z, 0.1, 0.9, 2.4);
    }
  }
}
function tile(index, originWorld) {
  const start = index * TILE,
    rng = random(index * 719 + originWorld * 133 + 7009),
    wi = originWorld % 7,
    zone = zoneOf(index);
  const b = new TileBuilder(),
    // На этих участках своя постройка, обычных домов и деревьев у дороги нет
    bare = ["tunnel", "bridge", "pit", "loop"].includes(zone?.kind),
    hilly = !zone;
  if (zone?.kind === "bridge") bridge(b, index, zone, wi, rng);
  const extras = new T.Group();
  if (zone?.kind === "bridge") extras.add(waterStrip(start, wi));
  else extras.add(hillGround(start, wi));
  if (zone?.kind === "tunnel") tunnel(extras, b, index, zone, wi);
  if (zone?.kind === "loop" && zone.part === 1) loopRing(extras, b, zone, wi);
  if (zone?.kind === "pit") pitStop(b, zone, start, wi, rng);
  for (let j = 0; j < (bare ? 0 : 4); j++) {
    const s = start + j * 16 + 6,
      center = bend(s),
      z = -(s - start);
    b.lift = hilly ? rise(s) : 0;
    for (const side of [-1, 1]) {
      const x = center + side * (13 + rng() * 3);
      decor(b, wi, j, side, center, z, rng);
      if (wi === 0) {
        if (j % 2 === 0) {
          const w = 8 + rng() * 7,
            l = 10 + rng() * 5,
            h = 8 + rng() * 23;
          building(
            b,
            x + side * (w / 2 + 1),
            z,
            w,
            h,
            l,
            Math.floor(rng() * 5),
          );
          building(
            b,
            x + side * (25 + rng() * 10),
            z,
            15,
            20 + rng() * 43,
            16,
            Math.floor(rng() * 5),
          );
        } else {
          tree(b, x, z, rng);
          lamp(b, center + side * 8.05, z);
        }
      } else if (wi === 1) {
        tree(b, x, z, rng);
        if (j === 1) {
          building(b, x + side * 11, z, 7, 4.5, 7, 0);
          for (let k = 0; k < 5; k++)
            b.box(
              center + side * 9,
              0.7,
              z - k * 2,
              0.18,
              1.4,
              0.18,
              "#d7c398",
            );
          b.box(center + side * 9, 0.95, z - 4, 0.14, 0.13, 8, "#dbc9b2");
        }
        rng();
      } else if (wi === 2) {
        if (j % 2 === 0) {
          b.trunk(x, 1.7, z, 0.26, 3.4, "#62834e");
          b.trunk(x - 0.5, 1.8, z, 0.15, 1.02, "#789653");
          b.box(x - 0.24, 1.4, z, 0.6, 0.27, 0.28, "#789653");
        } else b.ell(x, 0.39, z, 1.4, 0.74, 1.12, "#ae8062");
      } else if (wi === 3) {
        tree(b, x, z, rng, true, true);
        b.ell(x + side * 4, 0, z, 4.6, 1.15, 4.2, "#ecf5f7");
      } else if (wi === 4) {
        if (side < 0) {
          b.box(center - 96, -0.07, z, 156, 0.08, 16.04, "#49aeb9");
          for (let k = 0; k < 3; k++)
            b.box(
              center - 22 - k * 13,
              0.01,
              z - k * 3,
              3 + rng() * 5,
              0.025,
              0.12,
              "#c0e8da",
            );
        } else {
          palm(b, x, z, rng);
          b.ell(x + 27, -1, z, 16, 5, 20, "#b4bb74");
        }
      } else if (wi === 5) {
        b.trunk(x, 1.75, z, 0.16, 3.5, "#f7e5ce");
        b.ell(
          x,
          4,
          z,
          1.25,
          1.25,
          0.53,
          ["#f7acbd", "#b767a8", "#edb66c"][j % 3],
        );
        b.ell(x + side * 32, -1, z, 14, 7, 20, "#b980b1");
      } else {
        b.part(assetRock, material("#85799e"), x, 0.4, z, 1.8, 1.2, 1.5);
        b.part(
          cone,
          material("#8477c0"),
          x + side * 18,
          1,
          z,
          7,
          14 + rng() * 9,
          8,
        );
      }
    }
  }
  if (index === 1 && wi === 1) {
    b.lift = rise(start + 32);
    const x = bend(start + 32) + 17, z = -32;
    b.box(x, 2.8, z, 9, 5.6, 11, "#a63727");
    for (const side of [-1, 1])
      b.part(cube, material("#593b31"), x + side * 2.3, 6.25, z, 5.3, 0.36, 12, 0, 0, -side * 0.37);
    b.box(x, 2.1, z + 5.55, 4.4, 4.2, 0.13, "#63332b");
    for (const side of [-1, 1])
      b.part(cube, material("#f5dec1"), x + side * 1.02, 2.1, z + 5.68, 0.15, 4.5, 0.14, 0, 0, side * 0.48);
    for (let row = 0; row < 6; row++)
      b.box(x + 7 + row * 1.0, 0.09, z, 0.4, 0.16, 42, "#987144");
  }
  if (index === 1 && wi === 0) {
    b.lift = rise(start + 40);
    const x = bend(start + 40) - 19;
    b.box(x, 7, -40, 6.8, 14, 6.8, "#bc8867");
    b.box(x, 14.4, -40, 7.4, 0.65, 7.4, "#e8d5ad");
    b.ell(x, 11.1, -36.5, 2.05, 2.05, 0.15, "#fceab5");
    b.box(x, 11.62, -36.3, 0.15, 1.12, 0.1, "#32444a");
    b.box(x + 0.43, 11.14, -36.3, 0.93, 0.14, 0.1, "#32444a");
  }
  b.lift = 0;
  if (wi === 0 && hasIntersection(index)) {
    b.lift = hilly ? rise(start + 22) : 0;
    intersection(b, extras, start);
    b.lift = 0;
  }
  // Участки до старта тоже строятся, если машину отвести назад: шаров там нет
  if (index >= 0 && zone?.kind !== "tunnel" && wi !== 6 && index % 2 === 0) {
    const side = rng() > 0.5 ? 1 : -1,
      colors = [["#ff4f7e", "#ffd23f"], ["#2f9bff", "#ffffff"], ["#7be04f", "#ff7a1a"], ["#b57bff", "#ffd23f"]][index % 4];
    balloon(b, bend(start + 30) + side * (32 + rng() * 55), 22 + rng() * 22, -(8 + rng() * 44), colors[0], colors[1]);
  }
  const group = b.build();
  // У петли нет домов и деревьев: сбоку на неё смотрит камера. Дальние холмы остаются
  if ((!bare || zone?.kind === "loop") && [1, 2, 3].includes(wi))
    group.add(terrain(start, wi));
  group.userData.signals = extras.children.filter((n) => n.userData.signalColor);
  while (extras.children.length) group.add(extras.children[0]);
  group.position.z = -start;
  return group;
}
const earth = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.94,
  side: T.DoubleSide,
});
function terrain(start, wi) {
  const vertices = [],
    colors = [],
    indices = [],
    color = new T.Color();
  const cols = 31,
    rows = 17;
  for (const side of [-1, 1]) {
    const offset = vertices.length / 3;
    for (let row = 0; row < rows; row++) {
      const ds = (TILE * row) / (rows - 1),
        s = start + ds;
      for (let col = 0; col < cols; col++) {
        const lateral = 16 + col * 4.1,
          profile = Math.min(1, (lateral - 16) / 45),
          u = lateral * side;
        const ridge = Math.abs(
          Math.sin(u * 0.041 + s * 0.018) +
            0.47 * Math.sin(s * 0.052 - u * 0.079) +
            0.18 * Math.sin(s * 0.112 + u * 0.137),
        );
        const h =
          wi === 3
            ? profile * (8 + ridge * 22)
            : wi === 2
              ? profile *
                (3 +
                  8 * (0.5 + 0.5 * Math.sin(s * 0.043 + u * 0.061)) ** 1.7 +
                  3 * Math.sin(u * 0.027 - s * 0.012))
              : profile * (4 + 4 * Math.sin(u * 0.031 + s * 0.024) + ridge * 2);
        vertices.push(bend(s) + u, h - 0.04 + rise(s), -ds);
        if (wi === 3)
          color.set(
            ridge > 1.08 ? "#f1f5f6" : ridge > 0.78 ? "#aebfc5" : "#dbe5e8",
          );
        else
          color.set(
            wi === 2
              ? h > 7
                ? "#d9803f"
                : "#efbb68"
              : h > 7
                ? "#8fd05a"
                : "#57b344",
          );
        color.multiplyScalar(0.84 + 0.18 * Math.sin(s * 0.06 + u * 0.12));
        colors.push(color.r, color.g, color.b);
        if (row < rows - 1 && col < cols - 1) {
          const a = offset + row * cols + col;
          if (side > 0)
            indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
          else indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
    }
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const m = new T.Mesh(geom, earth);
  m.receiveShadow = true;
  return m;
}
function roadSurface() {
  return texture(512, 512, (g) => {
    const rng = random(822);
    g.fillStyle = "#5a5f64";
    g.fillRect(0, 0, 512, 512);
    const bitmap = g.getImageData(0, 0, 512, 512);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      const n = (rng() - 0.5) * 26;
      for (let k = 0; k < 3; k++) bitmap.data[i + k] += n;
    }
    g.putImageData(bitmap, 0, 0);
    g.fillStyle = "#fbfaf2";
    for (const x of [6, 503]) g.fillRect(x, 0, 5, 512);
    for (const x of [170, 340]) {
      g.fillRect(x, 0, 4, 72);
      g.fillRect(x, 256, 4, 72);
    }
    for (const x of [63, 110, 232, 280, 400, 447]) {
      const grad = g.createLinearGradient(x - 14, 0, x + 14, 0);
      grad.addColorStop(0, "#10141800");
      grad.addColorStop(0.5, "#1014181c");
      grad.addColorStop(1, "#10141800");
      g.fillStyle = grad;
      g.fillRect(x - 14, 0, 28, 512);
    }
  });
}
function ribbon(left, right, y, mat) {
  const rows = 97,
    pos = new Float32Array(rows * 6),
    uv = new Float32Array(rows * 4),
    indices = [];
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute(
    "position",
    new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage),
  );
  geom.setAttribute(
    "uv",
    new T.BufferAttribute(uv, 2).setUsage(T.DynamicDrawUsage),
  );
  geom.setAttribute(
    "normal",
    new T.BufferAttribute(
      new Float32Array(rows * 6).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  geom.setIndex(indices);
  const m = new T.Mesh(geom, mat);
  m.receiveShadow = true;
  m.frustumCulled = false;
  m.userData = { left, right, y, rows };
  return m;
}
const tunnelDark = new T.Color("#14171d"),
  seaDeep = new T.Color("#0d6c9e");
export class Scenery {
  constructor(scene) {
    this.scene = scene;
    this.tiles = new Map();
    this.sky = new T.Mesh(
      new T.SphereGeometry(420, 36, 20),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new T.Color() },
          horizon: { value: new T.Color() },
          night: { value: 0 },
        },
        vertexShader:
          "varying vec3 dir; void main(){dir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: `varying vec3 dir; uniform vec3 zenith,horizon;uniform float night;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){vec3 n=normalize(dir);float h=max(n.y,0.);vec3 color=mix(horizon,zenith,pow(h,.52));vec2 cp=n.xz/max(.09,n.y+.04)*1.55;float clouds=noise(cp)*.56+noise(cp*2.1)*.28+noise(cp*4.3)*.16;color=mix(color,vec3(.95,.96,.97)*(1.-.84*night),smoothstep(.52,.72,clouds)*smoothstep(.035,.16,h)*.66);color+=vec3(.95)*night*step(.9968,hash(floor(n.xz/max(.12,n.y+.12)*150.)))*smoothstep(.05,.22,h);float sun=max(dot(n,normalize(vec3(-.37,.39,-.84))),0.);color+=vec3(1.,.78,.48)*(.18*pow(sun,20.)+1.8*smoothstep(.9994,.9998,sun))*(1.-night);float moon=max(dot(n,normalize(vec3(.34,.5,-.8))),0.);color+=vec3(1.,.98,.86)*night*smoothstep(.9972,.9984,moon);gl_FragColor=vec4(color,1.);\n#include <colorspace_fragment>\n}`,
      }),
    );
    scene.add(this.sky);
    scene.fog = new T.Fog("#d8e3ec", 68, 240);
    const asphalt = new T.MeshStandardMaterial({
      map: roadSurface(),
      roughness: 0.91,
    });
    this.road = ribbon(-6.5, 6.5, 0.035, asphalt);
    this.verges = [
      ribbon(-8.5, -6.5, 0.055, material("#b5ada1")),
      ribbon(6.5, 8.5, 0.055, material("#b5ada1")),
    ];
    scene.add(this.road, ...this.verges);
    this.road.material.map.anisotropy = 4;
    this.backdrop = new T.Mesh(
      new T.CylinderGeometry(330, 330, 130, 64, 1, true),
      new T.MeshBasicMaterial({
        transparent: true,
        side: T.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    this.backdrop.renderOrder = -1;
    scene.add(this.backdrop);
  }
  reset(origin) {
    this.origin = origin;
    setTrack(origin);
    const wi = origin % 7;
    this.backdrop.material.map = backdropTexture(wi);
    this.backdrop.material.needsUpdate = true;
    this.verges[0].material = kerbMaterial(wi, true);
    this.verges[1].material = kerbMaterial(wi, false);
    for (const group of this.tiles.values()) this.remove(group);
    this.tiles.clear();
  }
  remove(group) {
    this.scene.remove(group);
    group.traverse((n) => {
      if (n.isMesh) n.geometry.dispose();
    });
  }
  update(d, world, previous, fade, mood, city) {
    const base = Math.floor(d / TILE),
      rx = bend(d),
      here = rise(d);
    for (const [idx, group] of this.tiles) {
      if (idx < base - 1 || idx > base + 4) {
        this.remove(group);
        this.tiles.delete(idx);
      }
    }
    for (let i = base - 1; i <= base + 4; i++) {
      if (!this.tiles.has(i)) {
        const group = tile(i, this.origin);
        this.scene.add(group);
        this.tiles.set(i, group);
      }
      const group = this.tiles.get(i);
      group.position.set(-rx, -here, d - i * TILE);
      const red = city?.signal === i * TILE + 22 && city.phase !== "green";
      for (const lens of group.userData.signals) {
        const on = lens.userData.signalColor === (red ? "red" : "green");
        lens.material = on ? signalLenses[lens.userData.signalColor] : signalLenses.off;
      }
      for (const mesh of group.children) mesh.castShadow = i <= base + 1;
    }
    for (const strip of [this.road, ...this.verges]) {
      const { rows, left, right, y } = strip.userData,
        pos = strip.geometry.attributes.position,
        uv = strip.geometry.attributes.uv;
      for (let i = 0; i < rows; i++) {
        let s = d - 35 + i * 3.3,
          l = left,
          r = right;
        // Лента дороги обрывается ровно по краям разрыва, внутри него ширина нулевая
        if (leapAt(s)) {
          const before = leapAt(s - 3.3),
            after = leapAt(s + 3.3),
            start = Math.floor(s / TILE) * TILE + 16;
          if (before && after) l = r = (left + right) / 2;
          s = !before || (after && s < start + LEAP_LENGTH / 2) ? start : start + LEAP_LENGTH;
        }
        const x = bend(s) - rx,
          z = d - s,
          lift = rise(s) - here;
        pos.setXYZ(i * 2, l + x, y + lift, z);
        pos.setXYZ(i * 2 + 1, r + x, y + lift, z);
        uv.setXY(i * 2, 0, s / 18);
        uv.setXY(i * 2 + 1, 1, s / 18);
      }
      pos.needsUpdate = uv.needsUpdate = true;
    }
    const u = this.sky.material.uniforms;
    u.zenith.value
      .set(palettes[previous][0])
      .lerp(new T.Color(palettes[world][0]), fade);
    u.horizon.value
      .set(palettes[previous][1])
      .lerp(new T.Color(palettes[world][1]), fade);
    if (mood) {
      u.zenith.value.lerp(mood.zenith, mood.k);
      u.horizon.value.lerp(mood.horizon, mood.k);
      u.night.value = mood.night;
      this.backdrop.material.color
        .setRGB(1, 1, 1)
        .lerp(mood.backdrop, mood.k);
      streetGlow.emissiveIntensity = mood.lamps * 2.4;
    }
    this.scene.fog.color
      .copy(u.horizon.value)
      .lerp(world === 4 ? seaDeep : tunnelDark, tunnelAmount(d) * 0.85);
    this.road.material.color.set(
      world === 3 ? "#d7e8f2" : world === 6 ? "#9b9ac2" : "#ffffff",
    );
    this.backdrop.position.set(0, 52 - here, 0);
    const flow = performance.now() * 0.00002;
    for (const m of waterMats.values()) m.map.offset.y = flow;
    // Мокрый асфальт темнее и отражает небо
    const wet = mood?.wet || 0;
    this.road.material.color.multiplyScalar(1 - 0.42 * wet);
    this.road.material.roughness = 0.91 - 0.68 * wet;
    this.road.material.metalness = 0.55 * wet;
  }
}
