// Обустройство внутри: домик раскрывается, как кукольный, а в комнату можно ставить вещи и двигать их пальцем.
import * as T from "../vendor/three/three.module.min.js?v=45a02ded";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js?v=45a02ded";
import { mat, easeBack, easeOut } from "./world.js?v=45a02ded";
import { part, plank, ball, shapeOf, DECK_Y, HOUSE_W, HOUSE_FRONT, HOUSE_BACK, WALL_H } from "./house.js?v=45a02ded";

const FLOOR = DECK_Y + 0.13,
  IN_W = HOUSE_W / 2 - 0.13,
  BACK = HOUSE_BACK + 0.13,
  FRONT = HOUSE_FRONT - 0.02,
  MAX_ITEMS = 36,
  WOOD = "#c98f55",
  DARK = "#8f5f35",
  TINTS = ["#c98f55", "#ff5d5d", "#ffb02e", "#ffe14d", "#6fd36a", "#39c3f0", "#b07cff", "#ff8cc6", "#ffffff"];

const col = (c) => (typeof c === "string" ? mat(c, 0.7) : c);
const box = (g, w, h, d, c, x = 0, y = 0, z = 0, r = 0.03) => plank(g, w, h, d, col(c), x, y, z, r);
const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 18) => part(g, new T.CylinderGeometry(rt, rb, h, seg), col(c), x, y, z);
const sph = (g, x, y, z, r, c) => ball(g, x, y, z, r, col(c));
const lie = (m, axis = "x") => {
  m.rotation[axis] = Math.PI / 2;
  return m;
};
function flame(g, x, y, z, r, h, color) {
  return part(g, new T.ConeGeometry(r, h, 10), new T.MeshBasicMaterial({ color, toneMapped: false }), x, y, z);
}
function play(fn) {
  if (Sound.ready()) fn();
}
const beep = (notes, type = "triangle", step = 0.17, vol = 0.16) =>
  play(() => notes.forEach((f, i) => Sound.tone({ type, f0: f, f1: f, dur: step * 1.4, vol, at: i * step })));

// ---------- картинки на холсте ----------
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function texture(c, repeat = false) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
function star(x, cx, cy, r) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      d = i % 2 ? r * 0.45 : r;
    x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  x.closePath();
  x.fill();
}
function heart(x, cx, cy, s) {
  x.beginPath();
  x.moveTo(cx, cy + s);
  x.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.8, cy - s * 1.1, cx, cy - s * 0.35);
  x.bezierCurveTo(cx + s * 0.8, cy - s * 1.1, cx + s * 1.6, cy - s * 0.2, cx, cy + s);
  x.fill();
}
function bloom(x, cx, cy, r, color) {
  x.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    x.beginPath();
    x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.72, 0, 7);
    x.fill();
  }
  x.fillStyle = "#ffd23f";
  x.beginPath();
  x.arc(cx, cy, r * 0.6, 0, 7);
  x.fill();
}
const MOTIFS = {
  dots: (x, a, b) => {
    x.beginPath();
    x.arc(a, b, 15, 0, 7);
    x.fill();
  },
  hearts: (x, a, b) => heart(x, a, b, 18),
  stars: (x, a, b) => star(x, a, b, 21),
  flowers: (x, a, b, fg) => bloom(x, a, b, 12, fg),
  clouds: (x, a, b) => {
    x.beginPath();
    x.arc(a - 18, b + 4, 14, 0, 7);
    x.arc(a, b - 5, 19, 0, 7);
    x.arc(a + 19, b + 4, 13, 0, 7);
    x.fill();
  },
};
export const WALLPAPERS = [
  { bg: "#fff4d6" },
  { bg: "#cfeeff", fg: "#ffffff", draw: "dots" },
  { bg: "#ffd9e8", fg: "#ff9cc6", draw: "hearts" },
  { bg: "#d7f5d0", fg: "#bdeab2", draw: "stripes" },
  { bg: "#e4dcff", fg: "#ffd23f", draw: "stars" },
  { bg: "#fff0b3", fg: "#ff9d5c", draw: "flowers" },
  { bg: "#2d3a7c", fg: "#ffe14d", draw: "stars" },
  { bg: "#bfe6ff", fg: "#ffffff", draw: "clouds" },
];
export const FLOORS = [
  { bg: "#c98f55", fg: "#a9713f", draw: "planks" },
  { bg: "#e8cfa6", fg: "#cfae7d", draw: "planks" },
  { bg: "#ffffff", fg: "#9fd8f2", draw: "checks" },
  { bg: "#a6dd8a", fg: "#8fcf72", draw: "carpet" },
  { bg: "#ffc1d8", fg: "#ffffff", draw: "checks" },
];
function paintTile(look) {
  const c = canvas(256, 256),
    x = c.getContext("2d");
  x.fillStyle = look.bg;
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = look.fg || look.bg;
  if (look.draw === "stripes") for (let i = 0; i < 4; i++) x.fillRect(i * 64, 0, 30, 256);
  else if (look.draw === "planks") {
    for (let i = 0; i < 4; i++) {
      x.fillRect(0, i * 64, 256, 4);
      x.fillRect((i % 2) * 128 + 60, i * 64, 4, 64);
    }
  } else if (look.draw === "checks") {
    x.fillRect(0, 0, 128, 128);
    x.fillRect(128, 128, 128, 128);
  } else if (look.draw === "carpet") {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) if ((i * 7 + j * 11) % 5 === 0) x.fillRect(i * 16 + 3, j * 16 + 5, 8, 4);
  } else if (MOTIFS[look.draw]) {
    for (const [a, b] of [[64, 64], [192, 192]]) {
      x.fillStyle = look.fg;
      MOTIFS[look.draw](x, a, b, look.fg);
    }
  }
  return c;
}
const tiles = new Map();
function tile(look) {
  if (!tiles.has(look)) {
    const c = paintTile(look);
    tiles.set(look, { canvas: c, map: texture(c, true) });
  }
  return tiles.get(look);
}
export const swatchOf = (look) => tile(look).canvas.toDataURL();
const PICTURES = [
  (x) => {
    x.fillStyle = "#bfe9ff";
    x.fillRect(0, 0, 256, 192);
    x.fillStyle = "#ffd23f";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.28;
      x.beginPath();
      x.moveTo(128, 78);
      x.lineTo(128 + Math.cos(a - 0.14) * 66, 78 + Math.sin(a - 0.14) * 66);
      x.lineTo(128 + Math.cos(a + 0.14) * 66, 78 + Math.sin(a + 0.14) * 66);
      x.fill();
    }
    x.beginPath();
    x.arc(128, 78, 40, 0, 7);
    x.fill();
    x.fillStyle = "#6fd36a";
    x.beginPath();
    x.ellipse(70, 192, 130, 62, 0, 0, 7);
    x.ellipse(210, 192, 120, 48, 0, 0, 7);
    x.fill();
  },
  (x) => {
    x.fillStyle = "#e9f7ff";
    x.fillRect(0, 0, 256, 192);
    ["#ff5d5d", "#ffb02e", "#ffe14d", "#6fd36a", "#39c3f0", "#b07cff"].forEach((c, i) => {
      x.strokeStyle = c;
      x.lineWidth = 15;
      x.beginPath();
      x.arc(128, 176, 112 - i * 15, Math.PI, 0);
      x.stroke();
    });
  },
  (x) => {
    x.fillStyle = "#fff2c9";
    x.fillRect(0, 0, 256, 192);
    x.fillStyle = "#4fbf5f";
    x.fillRect(122, 96, 12, 96);
    x.beginPath();
    x.ellipse(160, 150, 30, 12, -0.5, 0, 7);
    x.fill();
    bloom(x, 128, 78, 30, "#ff8cc6");
  },
  (x) => {
    x.fillStyle = "#bfe9ff";
    x.fillRect(0, 0, 256, 192);
    x.fillStyle = "#39a7e0";
    x.fillRect(0, 138, 256, 54);
    x.fillStyle = "#ff5d5d";
    x.beginPath();
    x.moveTo(70, 118);
    x.lineTo(186, 118);
    x.lineTo(164, 150);
    x.lineTo(92, 150);
    x.fill();
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.moveTo(132, 36);
    x.lineTo(132, 110);
    x.lineTo(182, 110);
    x.fill();
  },
  (x) => {
    x.fillStyle = "#ffe7f1";
    x.fillRect(0, 0, 256, 192);
    x.fillStyle = "#ff5d7e";
    heart(x, 128, 96, 56);
  },
  (x) => {
    x.fillStyle = "#26336f";
    x.fillRect(0, 0, 256, 192);
    x.fillStyle = "#ffe14d";
    x.beginPath();
    x.arc(180, 62, 30, 0, 7);
    x.fill();
    x.fillStyle = "#26336f";
    x.beginPath();
    x.arc(166, 54, 28, 0, 7);
    x.fill();
    x.fillStyle = "#ffffff";
    for (const [a, b, r] of [[50, 50, 13], [96, 110, 10], [40, 142, 8], [200, 142, 12], [128, 36, 7]]) star(x, a, b, r);
  },
];
const pictureTextures = [];
function picture(i) {
  if (!pictureTextures[i]) {
    const c = canvas(256, 192);
    PICTURES[i](c.getContext("2d"));
    pictureTextures[i] = texture(c);
  }
  return pictureTextures[i];
}
function softDisc(inner, outer) {
  const c = canvas(64, 64),
    x = c.getContext("2d"),
    g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}
const shadowMat = new T.MeshBasicMaterial({ map: softDisc("rgba(60,35,20,.42)", "rgba(60,35,20,0)"), transparent: true, depthWrite: false, toneMapped: false }),
  glowMap = softDisc("rgba(255,225,160,.5)", "rgba(255,200,110,0)"),
  noPick = () => {};
function glow(g, x, y, z, size) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowMap, blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  s.position.set(x, y, z);
  s.scale.setScalar(size);
  s.raycast = noPick;
  g.add(s);
  return s;
}
function contact(g, w, d) {
  const m = new T.Mesh(new T.PlaneGeometry(w * 2.5, d * 2.5), shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.raycast = noPick;
  m.userData.keep = true;
  g.add(m);
}
// Детали одного цвета сливаются: так комнате легче рисоваться
function flatten(g) {
  const byMaterial = new Map();
  for (const n of [...g.children]) {
    if (!n.isMesh || n.userData.keep) continue;
    n.updateMatrix();
    const geo = (n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone()).applyMatrix4(n.matrix);
    if (!byMaterial.has(n.material)) byMaterial.set(n.material, { geos: [], nodes: [] });
    const e = byMaterial.get(n.material);
    e.geos.push(geo);
    e.nodes.push(n);
  }
  for (const [material, e] of byMaterial) {
    if (e.nodes.length < 2) continue;
    const merged = mergeGeometries(e.geos);
    if (!merged) continue;
    for (const n of e.nodes) g.remove(n);
    g.add(new T.Mesh(merged, material));
  }
  g.traverse((n) => {
    if (n.isMesh) n.castShadow = n.receiveShadow = false;
  });
}

// ---------- список вещей ----------
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
export const CATS = [
  { id: "furniture", name: "Мебель", icon: "🛋️" },
  { id: "cosy", name: "Уют", icon: "💡" },
  { id: "toys", name: "Игрушки", icon: "🧸" },
  { id: "walls", name: "На стену", icon: "🖼️" },
  { id: "food", name: "Вкусное", icon: "🍰" },
  { id: "pets", name: "Зверята", icon: "🐱" },
  { id: "style", name: "Обои и пол", icon: "🎨" },
];
export const ITEMS = {
  bed: {
    cat: "furniture", name: "Кроватка", icon: "🛏️", kind: "floor", w: 0.68, d: 1.06, back: true, tint: 5, top: { y: 0.64, w: 0.5, d: 0.82 },
    build(g, it) {
      box(g, 1.3, 0.2, 2.05, WOOD, 0, 0.27, 0);
      for (const a of [-1, 1]) for (const b of [-1, 1]) box(g, 0.12, 0.18, 0.12, DARK, a * 0.55, 0.09, b * 0.9);
      box(g, 1.2, 0.2, 1.92, "#fffaf2", 0, 0.46, 0, 0.07);
      box(g, 1.26, 0.12, 1.22, it.paint(), 0, 0.56, 0.36, 0.05);
      box(g, 0.86, 0.16, 0.44, "#ffffff", 0, 0.64, -0.68, 0.07);
      box(g, 1.3, 0.95, 0.1, WOOD, 0, 0.5, -1.0, 0.05);
    },
  },
  table: {
    cat: "furniture", name: "Стол", icon: svg('<ellipse cx="24" cy="15" rx="20" ry="7" fill="#c98f55"/><rect x="21" y="18" width="6" height="20" fill="#8f5f35"/><ellipse cx="24" cy="39" rx="11" ry="4" fill="#8f5f35"/>'),
    kind: "floor", w: 0.68, d: 0.68, tint: 0, top: { y: 0.84, w: 0.5, d: 0.5 },
    build(g, it) {
      cyl(g, 0.68, 0.68, 0.08, it.paint(), 0, 0.8, 0, 28);
      cyl(g, 0.07, 0.09, 0.76, DARK, 0, 0.4, 0);
      cyl(g, 0.36, 0.4, 0.06, DARK, 0, 0.03, 0, 20);
    },
  },
  chair: {
    cat: "furniture", name: "Стул", icon: "🪑", kind: "floor", w: 0.28, d: 0.28, tint: 1, turns: true,
    build(g, it) {
      for (const a of [-1, 1]) for (const b of [-1, 1]) box(g, 0.07, 0.42, 0.07, DARK, a * 0.2, 0.21, b * 0.2, 0.02);
      box(g, 0.54, 0.08, 0.54, WOOD, 0, 0.45, 0);
      box(g, 0.48, 0.06, 0.48, it.paint(), 0, 0.51, 0);
      for (const a of [-1, 1]) box(g, 0.07, 0.56, 0.07, DARK, a * 0.2, 0.74, -0.22, 0.02);
      box(g, 0.48, 0.2, 0.05, it.paint(), 0, 0.88, -0.22);
    },
  },
  sofa: {
    cat: "furniture", name: "Диван", icon: "🛋️", kind: "floor", w: 0.95, d: 0.46, back: true, tint: 6, top: { y: 0.56, w: 0.62, d: 0.2 },
    build(g, it) {
      const p = it.paint();
      box(g, 1.85, 0.28, 0.84, DARK, 0, 0.2, 0);
      for (const a of [-1, 1]) {
        box(g, 0.68, 0.2, 0.68, p, a * 0.35, 0.44, 0.05, 0.07);
        box(g, 0.24, 0.5, 0.84, p, a * 0.84, 0.46, 0, 0.09);
      }
      box(g, 1.85, 0.68, 0.22, p, 0, 0.62, -0.32, 0.09);
    },
  },
  wardrobe: {
    cat: "furniture", name: "Шкаф", icon: svg('<rect x="9" y="4" width="30" height="40" rx="3" fill="#c98f55"/><path d="M24 4v40" stroke="#8f5f35" stroke-width="3"/><circle cx="20" cy="24" r="2" fill="#fff"/><circle cx="28" cy="24" r="2" fill="#fff"/>'),
    kind: "floor", w: 0.62, d: 0.33, back: true, tint: 0, state: { open: false },
    build(g, it) {
      box(g, 1.22, 2.3, 0.62, DARK, 0, 1.17, 0);
      box(g, 1.1, 2.14, 0.02, "#4a3324", 0, 1.17, 0.31, 0.005);
      ["#ff5d5d", "#39c3f0", "#ffe14d", "#6fd36a", "#ff8cc6"].forEach((c, i) => box(g, 0.17, 0.82, 0.04, c, -0.42 + i * 0.21, 1.55, 0.335, 0.015));
      box(g, 1.02, 0.42, 0.04, "#ffb02e", 0, 0.42, 0.335, 0.015);
      it.doors = [-1, 1].map((s) => {
        const h = new T.Group();
        h.position.set(s * 0.58, 1.17, 0.39);
        box(h, 0.56, 2.12, 0.05, it.paint(), -s * 0.29, 0, 0, 0.02);
        sph(h, -s * 0.5, 0, 0.05, 0.04, "#ffd23f");
        g.add(h);
        h.userData.side = s;
        return h;
      });
    },
    tap(it, room) {
      it.state.open = !it.state.open;
      for (const h of it.doors) {
        const from = h.rotation.y,
          to = it.state.open ? h.userData.side * 1.9 : 0;
        room.world.tween(0.42, (t) => (h.rotation.y = from + (to - from) * t), null, easeBack);
      }
      Sound.tap();
    },
    restore(it) {
      if (it.state.open) for (const h of it.doors) h.rotation.y = h.userData.side * 1.9;
    },
  },
  bookcase: {
    cat: "furniture", name: "Книжки", icon: "📚", kind: "floor", w: 0.66, d: 0.24, back: true,
    build(g) {
      const colors = ["#ff5d5d", "#39c3f0", "#ffe14d", "#6fd36a", "#b07cff", "#ffb02e"];
      box(g, 1.28, 2, 0.1, DARK, 0, 1, -0.17);
      for (const a of [-1, 1]) box(g, 0.08, 2, 0.42, WOOD, a * 0.6, 1, 0);
      for (let i = 0; i < 4; i++) box(g, 1.2, 0.07, 0.42, WOOD, 0, 0.1 + i * 0.62, 0);
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 6; i++) box(g, 0.14, 0.4 + ((i * 3 + row) % 3) * 0.04, 0.26, colors[(i + row * 2) % 6], -0.42 + i * 0.17, 0.35 + row * 0.62 + ((i * 3 + row) % 3) * 0.02, 0.02, 0.015);
    },
    tap(it, room) {
      Sound.pop();
      room.burst(it, ["#ff5d5d", "#39c3f0", "#ffe14d"], 12, 1.2);
    },
  },
  dresser: {
    cat: "furniture", name: "Тумбочка", icon: svg('<rect x="10" y="12" width="28" height="28" rx="3" fill="#ffb02e"/><path d="M10 26h28" stroke="#b5701a" stroke-width="2.5"/><circle cx="24" cy="19" r="2.2" fill="#fff"/><circle cx="24" cy="33" r="2.2" fill="#fff"/>'),
    kind: "floor", w: 0.42, d: 0.28, tint: 2, top: { y: 0.76, w: 0.32, d: 0.16 },
    build(g, it) {
      box(g, 0.82, 0.72, 0.52, it.paint(), 0, 0.38, 0);
      for (const y of [0.24, 0.54]) {
        box(g, 0.72, 0.25, 0.03, "#fff4d6", 0, y, 0.26, 0.012);
        sph(g, 0, y, 0.29, 0.035, DARK);
      }
    },
  },
  stove: {
    cat: "furniture", name: "Печка", icon: "🔥", kind: "floor", w: 0.7, d: 0.27, back: true, state: { on: true }, top: { y: 1.5, w: 0.55, d: 0.14 },
    build(g, it) {
      box(g, 1.38, 1.42, 0.5, "#c96f4e", 0, 0.71, 0);
      for (let y = 0; y < 5; y++) box(g, 1.4, 0.015, 0.52, "#e8b39a", 0, 0.2 + y * 0.27, 0, 0.004);
      box(g, 1.58, 0.1, 0.62, WOOD, 0, 1.45, 0.02);
      box(g, 0.84, 0.8, 0.03, "#2b1b12", 0, 0.48, 0.25, 0.01);
      for (const a of [-1, 1]) lie(cyl(g, 0.055, 0.055, 0.62, DARK, 0, 0.17, 0.27 + a * 0.03), "z").rotation.y = a * 0.2;
      const fire = new T.Group();
      g.add(fire);
      it.fire = fire;
      fire.position.set(0, 0.2, 0.3);
      it.flames = [[-0.16, 0.3, "#ff8a1f"], [0.14, 0.34, "#ff6a2a"], [0, 0.5, "#ffb02e"], [0, 0.26, "#ffe14d"]].map(([x, h, c]) => {
        const f = flame(fire, x, h / 2, 0, 0.11, h, c);
        return f;
      });
      it.shine = glow(g, 0, 0.5, 0.42, 1.25);
    },
    frame(it, dt, time) {
      it.flames.forEach((f, i) => (f.scale.y = 0.85 + Math.sin(time * (9 + i * 2.3) + i) * 0.2));
    },
    apply(it) {
      it.fire.visible = it.shine.visible = it.state.on;
    },
    tap(it, room) {
      it.state.on = !it.state.on;
      it.def.apply(it);
      play(() => Sound.noise({ f0: 900, f1: 300, dur: 0.35, vol: 0.12 }));
      if (it.state.on) room.burst(it, ["#ff8a1f", "#ffe14d"], 14, 1.4, 0.5);
    },
  },
  piano: {
    cat: "furniture", name: "Пианино", icon: "🎹", kind: "floor", w: 0.72, d: 0.34, back: true, top: { y: 1.22, w: 0.58, d: 0.14 },
    build(g) {
      box(g, 1.42, 1.17, 0.42, "#3f2f4f", 0, 0.62, -0.08);
      for (const a of [-1, 1]) box(g, 0.1, 0.72, 0.5, "#3f2f4f", a * 0.66, 0.36, 0.12);
      box(g, 1.26, 0.07, 0.3, "#ffffff", 0, 0.72, 0.22, 0.01);
      for (let i = 0; i < 8; i++) if (i % 4 !== 2) box(g, 0.08, 0.05, 0.17, "#20202a", -0.49 + i * 0.14, 0.77, 0.15, 0.01);
    },
    tap(it, room) {
      const tunes = [[523, 659, 784, 1047, 784], [659, 587, 523, 587, 659, 659], [784, 880, 784, 659, 523], [523, 523, 784, 784, 880, 880, 784]];
      it.state.song = ((it.state.song || 0) + 1) % tunes.length;
      beep(tunes[it.state.song]);
      room.burst(it, ["#ff8cc6", "#ffe14d", "#39c3f0"], 16, 1.5, 1.2);
    },
  },
  lamp: {
    cat: "cosy", name: "Лампа", icon: "💡", kind: "floor", w: 0.3, d: 0.3, tint: 3, state: { on: true },
    build(g, it) {
      cyl(g, 0.24, 0.28, 0.05, DARK, 0, 0.03, 0);
      cyl(g, 0.03, 0.03, 1.72, DARK, 0, 0.88, 0, 10);
      it.shade = new T.MeshStandardMaterial({ color: TINTS[it.tintIndex], emissive: "#ffc66b", roughness: 0.6 });
      cyl(g, 0.2, 0.38, 0.42, it.shade, 0, 1.82, 0);
      it.shine = glow(g, 0, 1.76, 0, 1.5);
    },
    apply(it) {
      it.shade.emissiveIntensity = it.state.on ? 1 : 0;
      it.shine.visible = it.state.on;
    },
    tap(it) {
      it.state.on = !it.state.on;
      it.def.apply(it);
      Sound.tap();
    },
  },
  nightlight: {
    cat: "cosy", name: "Ночник", icon: "🍄", kind: "small", up: true, w: 0.2, d: 0.2, state: { on: true },
    build(g, it) {
      cyl(g, 0.07, 0.09, 0.2, "#fff4d6", 0, 0.1, 0, 12);
      it.shade = new T.MeshStandardMaterial({ color: "#ff5d5d", emissive: "#ff7a50", roughness: 0.5 });
      const cap = part(g, new T.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), it.shade, 0, 0.18, 0);
      cap.scale.y = 0.8;
      for (const [x, y, z] of [[0.09, 0.3, 0.09], [-0.1, 0.28, 0.08], [0, 0.34, -0.02]]) sph(g, x, y, z, 0.03, "#ffffff");
      it.shine = glow(g, 0, 0.25, 0, 0.85);
    },
    apply(it) {
      it.shade.emissiveIntensity = it.state.on ? 1.1 : 0;
      it.shine.visible = it.state.on;
    },
    tap(it) {
      it.state.on = !it.state.on;
      it.def.apply(it);
      Sound.tap();
    },
  },
  rugRound: {
    cat: "cosy", name: "Круглый коврик", icon: svg('<circle cx="24" cy="24" r="20" fill="#39c3f0"/><circle cx="24" cy="24" r="13" fill="#ffe14d"/><circle cx="24" cy="24" r="6" fill="#ff5d5d"/>'),
    kind: "flat", w: 1, d: 1, tint: 5,
    build(g, it) {
      cyl(g, 1, 1, 0.025, it.paint(), 0, 0.013, 0, 40);
      cyl(g, 0.72, 0.72, 0.03, it.paint(-2), 0, 0.015, 0, 36);
      cyl(g, 0.42, 0.42, 0.035, it.paint(3), 0, 0.018, 0, 30);
    },
  },
  rugLong: {
    cat: "cosy", name: "Коврик", icon: svg('<rect x="5" y="12" width="38" height="24" rx="4" fill="#ff8cc6"/><path d="M14 12v24M24 12v24M34 12v24" stroke="#fff" stroke-width="4"/>'),
    kind: "flat", w: 1.15, d: 0.72, tint: 7,
    build(g, it) {
      box(g, 2.3, 0.03, 1.44, it.paint(), 0, 0.015, 0, 0.012);
      for (let i = -2; i <= 2; i++) box(g, 0.16, 0.034, 1.44, i % 2 ? "#ffffff" : it.paint(-3), i * 0.42, 0.016, 0, 0.012);
    },
  },
  pouf: {
    cat: "cosy", name: "Пуфик", icon: svg('<ellipse cx="24" cy="28" rx="19" ry="13" fill="#b07cff"/><ellipse cx="24" cy="22" rx="12" ry="5" fill="#cda8ff"/><circle cx="24" cy="21" r="2.4" fill="#fff"/>'),
    kind: "floor", w: 0.36, d: 0.36, tint: 6,
    build(g, it) {
      sph(g, 0, 0.24, 0, 0.38, it.paint()).scale.y = 0.62;
      sph(g, 0, 0.47, 0, 0.05, "#ffffff");
    },
  },
  plant: {
    cat: "cosy", name: "Цветок", icon: "🪴", kind: "small", w: 0.22, d: 0.22,
    build(g) {
      cyl(g, 0.19, 0.14, 0.28, "#d8794a", 0, 0.14, 0, 16);
      cyl(g, 0.17, 0.17, 0.02, "#4a3324", 0, 0.28, 0, 16);
      for (const [x, y, z, r] of [[0, 0.62, 0, 0.17], [0.15, 0.48, 0.05, 0.13], [-0.15, 0.5, -0.03, 0.14], [0.05, 0.47, -0.15, 0.12], [-0.05, 0.45, 0.15, 0.12]]) {
        const leaf = sph(g, x, y, z, r, x > 0 ? "#4fbf5f" : "#6fd36a");
        leaf.scale.y = 1.3;
      }
      cyl(g, 0.02, 0.02, 0.32, "#3f9a4e", 0, 0.42, 0, 8);
    },
    tap(it, room) {
      it.size = it.size >= 1.6 ? 1 : it.size + 0.3;
      room.settle(it);
      Sound.star?.();
      room.burst(it, ["#6fd36a", "#ffffff"], 12, 1.3, 0.5);
    },
  },
  vase: {
    cat: "cosy", name: "Букет", icon: "💐", kind: "small", up: true, w: 0.16, d: 0.16, tint: 5,
    build(g, it) {
      cyl(g, 0.09, 0.12, 0.3, it.paint(), 0, 0.15, 0, 16);
      for (const [x, z, y, shift] of [[0, 0, 0.56, 3], [0.11, 0.03, 0.5, 4], [-0.11, 0.03, 0.48, 6], [0.02, -0.1, 0.46, 7]]) {
        const stem = cyl(g, 0.012, 0.012, y - 0.28, "#4fbf5f", x / 2, (y + 0.28) / 2, z / 2, 6);
        stem.rotation.set(z, 0, -x);
        sph(g, x, y, z, 0.075, it.paint(shift));
      }
    },
  },
  teddy: {
    cat: "toys", name: "Мишка", icon: "🧸", kind: "small", w: 0.22, d: 0.2,
    build(g) {
      const fur = "#c98f55",
        pale = "#efd3ab";
      sph(g, 0, 0.2, 0, 0.19, fur).scale.y = 1.1;
      sph(g, 0, 0.19, 0.11, 0.11, pale);
      sph(g, 0, 0.48, 0.02, 0.15, fur);
      sph(g, 0, 0.45, 0.13, 0.065, pale);
      sph(g, 0, 0.47, 0.19, 0.022, "#3b2417");
      for (const s of [-1, 1]) {
        sph(g, s * 0.13, 0.59, 0, 0.055, fur);
        sph(g, s * 0.06, 0.51, 0.145, 0.015, "#20140c");
        sph(g, s * 0.19, 0.27, 0.05, 0.07, fur);
        sph(g, s * 0.11, 0.06, 0.1, 0.08, fur);
      }
    },
    tap(it, room) {
      room.hop(it, 0.55);
      Sound.giggle();
    },
  },
  ball: {
    cat: "toys", name: "Мячик", icon: "⚽", kind: "small", w: 0.2, d: 0.2, tint: 1,
    build(g, it) {
      sph(g, 0, 0.2, 0, 0.2, it.paint());
      lie(part(g, new T.TorusGeometry(0.2, 0.022, 8, 24), mat("#ffffff", 0.5), 0, 0.2, 0));
    },
    tap(it, room) {
      room.hop(it, 0.95);
      Sound.boing();
    },
  },
  blocks: {
    cat: "toys", name: "Кубики", icon: svg('<rect x="5" y="25" width="17" height="17" rx="2" fill="#ff5d5d"/><rect x="26" y="25" width="17" height="17" rx="2" fill="#39c3f0"/><rect x="15" y="7" width="17" height="17" rx="2" fill="#ffe14d"/>'),
    kind: "small", w: 0.28, d: 0.16, tint: 1,
    build(g, it) {
      box(g, 0.25, 0.25, 0.25, it.paint(), -0.14, 0.125, 0, 0.02);
      box(g, 0.25, 0.25, 0.25, it.paint(4), 0.14, 0.125, 0, 0.02);
      box(g, 0.25, 0.25, 0.25, it.paint(2), 0, 0.375, 0, 0.02);
    },
    tap(it, room) {
      room.recolor(it);
      room.hop(it, 0.25);
    },
  },
  car: {
    cat: "toys", name: "Машинка", icon: "🚗", kind: "small", w: 0.2, d: 0.34, tint: 1,
    build(g, it) {
      const body = new T.Group();
      g.add(body);
      it.body = body;
      box(body, 0.36, 0.13, 0.66, it.paint(), 0, 0.13, 0, 0.04);
      box(body, 0.3, 0.13, 0.32, "#bfe9ff", 0, 0.25, -0.03, 0.04);
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) lie(cyl(body, 0.07, 0.07, 0.05, "#2b2b33", a * 0.18, 0.07, b * 0.2, 14), "z");
        sph(body, a * 0.1, 0.14, 0.33, 0.028, "#ffd23f");
      }
    },
    tap(it, room) {
      const far = it.on ? 0.14 : 0.42;
      beep([660, 880], "square", 0.12, 0.07);
      room.world.tween(1.2, (t) => (it.body.position.z = Math.sin(t * Math.PI * 2) * far), () => (it.body.position.z = 0), (t) => t);
    },
  },
  horse: {
    cat: "toys", name: "Лошадка", icon: "🐴", kind: "floor", w: 0.26, d: 0.5, tint: 1,
    build(g, it) {
      const body = new T.Group();
      g.add(body);
      it.body = body;
      const coat = "#d99a5b",
        hair = "#7a4a2a";
      for (const s of [-1, 1]) {
        const rocker = part(body, new T.TorusGeometry(0.72, 0.035, 8, 22, 1.5), mat("#ff5d5d", 0.6), s * 0.16, 0.76, 0);
        rocker.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.75);
        for (const b of [-1, 1]) cyl(body, 0.05, 0.06, 0.44, coat, s * 0.16, 0.3, b * 0.21, 10);
      }
      sph(body, 0, 0.62, 0, 0.23, coat).scale.z = 1.5;
      box(body, 0.36, 0.05, 0.36, it.paint(), 0, 0.84, -0.03, 0.02);
      const neck = cyl(body, 0.09, 0.13, 0.34, coat, 0, 0.86, 0.27, 12);
      neck.rotation.x = 0.55;
      sph(body, 0, 1.03, 0.37, 0.125, coat).scale.z = 1.3;
      sph(body, 0, 0.99, 0.49, 0.078, "#f3d9b5");
      for (const s of [-1, 1]) {
        sph(body, s * 0.1, 1.06, 0.42, 0.017, "#20140c");
        part(body, new T.ConeGeometry(0.035, 0.1, 8), mat(coat, 0.7), s * 0.07, 1.17, 0.33);
      }
      for (let i = 0; i < 5; i++) sph(body, 0, 1.16 - i * 0.095, 0.3 - i * 0.055, 0.052, hair);
      for (let i = 0; i < 4; i++) sph(body, 0, 0.66 - i * 0.09, -0.35 - i * 0.025, 0.055 - i * 0.006, hair);
    },
    frame(it, dt, time) {
      if (it.rock > 0) it.rock -= dt;
      it.body.rotation.x = Math.sin(time * 6) * 0.2 * Math.min(1, Math.max(it.rock || 0, 0));
    },
    tap(it) {
      it.rock = 3.2;
      Sound.whee();
    },
  },
  rocket: {
    cat: "toys", name: "Ракета", icon: "🚀", kind: "small", w: 0.2, d: 0.2, tint: 1,
    build(g, it) {
      const body = new T.Group();
      g.add(body);
      it.body = body;
      cyl(body, 0.13, 0.16, 0.52, "#ffffff", 0, 0.36, 0);
      part(body, new T.ConeGeometry(0.13, 0.24, 18), it.paint(), 0, 0.74, 0);
      sph(body, 0, 0.44, 0.12, 0.055, "#39c3f0");
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * 6.28 + 0.5,
          fin = box(body, 0.03, 0.22, 0.14, it.paint(), Math.sin(a) * 0.16, 0.2, Math.cos(a) * 0.16, 0.01);
        fin.rotation.y = a;
      }
      cyl(body, 0.09, 0.11, 0.1, "#6d6f7a", 0, 0.06, 0, 12);
    },
    tap(it, room) {
      if (it.flying) return;
      it.flying = true;
      Sound.whoosh();
      room.burst(it, ["#ff8a1f", "#ffe14d", "#ffffff"], 18, 1.4, 0.1);
      room.world.tween(1.7, (t) => {
        it.body.position.y = Math.sin(t * Math.PI) * 3.2;
        it.body.rotation.y = t * 12;
      }, () => {
        it.body.position.y = 0;
        it.flying = false;
        Sound.land();
      }, (t) => t);
    },
  },
  picture: {
    cat: "walls", name: "Картина", icon: "🖼️", kind: "wall", w: 0.52, d: 0.42, state: { pic: 0 },
    build(g, it) {
      box(g, 1.04, 0.84, 0.06, WOOD, 0, 0, 0.03, 0.02);
      it.image = new T.MeshStandardMaterial({ roughness: 0.75 });
      part(g, new T.PlaneGeometry(0.9, 0.7), it.image, 0, 0, 0.066);
    },
    apply(it) {
      it.image.map = picture(it.state.pic % PICTURES.length);
      it.image.needsUpdate = true;
    },
    tap(it) {
      it.state.pic = (it.state.pic + 1) % PICTURES.length;
      it.def.apply(it);
      Sound.pop();
    },
  },
  clock: {
    cat: "walls", name: "Часы", icon: "⏰", kind: "wall", w: 0.4, d: 0.4, tint: 5,
    build(g, it) {
      lie(cyl(g, 0.36, 0.36, 0.05, "#ffffff", 0, 0, 0.03, 30));
      part(g, new T.TorusGeometry(0.36, 0.045, 10, 30), it.paint(), 0, 0, 0.05);
      for (let i = 0; i < 12; i++) sph(g, Math.sin((i / 12) * 6.28) * 0.28, Math.cos((i / 12) * 6.28) * 0.28, 0.06, i % 3 ? 0.012 : 0.022, "#3b2417");
      it.hands = [0.17, 0.25].map((l, i) => {
        const h = new T.Group();
        h.position.z = 0.07;
        box(h, i ? 0.025 : 0.035, l, 0.012, i ? "#ff5d5d" : "#3b2417", 0, l / 2 - 0.02, 0, 0.004);
        g.add(h);
        return h;
      });
      sph(g, 0, 0, 0.08, 0.025, "#ffd23f");
      it.spin = 0;
    },
    frame(it, dt, time) {
      it.spin = Math.max(0, it.spin - dt);
      it.turn = (it.turn || 0) + dt * (0.25 + it.spin * 9);
      it.hands[1].rotation.z = -it.turn;
      it.hands[0].rotation.z = -it.turn / 12;
    },
    tap(it) {
      it.spin = 1.6;
      beep([988, 784, 988, 784], "sine", 0.26, 0.14);
    },
  },
  mirror: {
    cat: "walls", name: "Зеркало", icon: "🪞", kind: "wall", w: 0.42, d: 0.56, tint: 7,
    build(g, it) {
      const c = canvas(128, 128),
        x = c.getContext("2d"),
        sky = x.createLinearGradient(0, 0, 128, 128);
      sky.addColorStop(0, "#f4fcff");
      sky.addColorStop(1, "#a9dcf5");
      x.fillStyle = sky;
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = "#ffffff";
      x.lineWidth = 12;
      x.beginPath();
      x.moveTo(30, 90);
      x.lineTo(90, 30);
      x.moveTo(52, 108);
      x.lineTo(108, 52);
      x.stroke();
      const glass = part(g, new T.CircleGeometry(0.38, 32), new T.MeshBasicMaterial({ map: texture(c), toneMapped: false }), 0, 0, 0.055);
      glass.scale.y = 1.32;
      part(g, new T.TorusGeometry(0.39, 0.045, 10, 36), it.paint(), 0, 0, 0.05).scale.y = 1.32;
    },
    tap(it, room) {
      Sound.gift();
      room.burst(it, ["#ffffff", "#bfe9ff", "#ffe14d"], 16, 1.3);
    },
  },
  garland: {
    cat: "walls", name: "Гирлянда", icon: "✨", kind: "wall", w: 1.15, d: 0.22, state: { on: true },
    build(g, it) {
      const points = [];
      for (let i = 0; i <= 10; i++) {
        const k = i / 5 - 1;
        points.push(new T.Vector3(k * 1.1, 0.16 - (1 - k * k) * 0.3, 0.05));
      }
      part(g, new T.TubeGeometry(new T.CatmullRomCurve3(points), 28, 0.012, 6), mat("#3f9a4e", 0.7));
      it.bulbs = ["#ff5d5d", "#ffd23f", "#39c3f0", "#6fd36a", "#ff8cc6"].map((c) => new T.MeshStandardMaterial({ color: c, emissive: c, roughness: 0.4 }));
      points.forEach((p, i) => sph(g, p.x, p.y - 0.04, p.z, 0.05, it.bulbs[i % 5]));
    },
    frame(it, dt, time) {
      it.bulbs.forEach((m, i) => (m.emissiveIntensity = it.state.on ? 0.7 + Math.sin(time * 3 + i * 1.3) * 0.6 : 0));
    },
    tap(it) {
      it.state.on = !it.state.on;
      Sound.tap();
    },
  },
  star: {
    cat: "walls", name: "Звёздочка", icon: "⭐", kind: "wall", w: 0.26, d: 0.26, tint: 3,
    build(g, it) {
      const m = it.paint();
      m.userData.glow = true;
      m.emissive.set(m.color);
      m.emissiveIntensity = 0.35;
      part(g, new T.ExtrudeGeometry(shapeOf("star", 0.24), { depth: 0.04, bevelEnabled: false }), m, 0, 0, 0.01);
    },
  },
  cake: {
    cat: "food", name: "Торт", icon: "🎂", kind: "small", up: true, w: 0.26, d: 0.26, tint: 7, state: { on: true },
    build(g, it) {
      cyl(g, 0.3, 0.3, 0.02, "#ffffff", 0, 0.01, 0, 26);
      cyl(g, 0.24, 0.25, 0.16, it.paint(), 0, 0.1, 0, 24);
      cyl(g, 0.17, 0.18, 0.13, "#ffffff", 0, 0.24, 0, 22);
      for (let i = 0; i < 8; i++) sph(g, Math.cos(i * 0.785) * 0.19, 0.18, Math.sin(i * 0.785) * 0.19, 0.03, i % 2 ? "#ff5d5d" : "#ffe14d");
      cyl(g, 0.015, 0.015, 0.13, "#39c3f0", 0, 0.36, 0, 8);
      it.fire = flame(g, 0, 0.47, 0, 0.03, 0.09, "#ffb02e");
      it.fire.userData.keep = true;
    },
    frame(it, dt, time) {
      it.fire.scale.y = 1 + Math.sin(time * 13) * 0.2;
    },
    apply(it) {
      it.fire.visible = it.state.on;
    },
    tap(it, room) {
      it.state.on = !it.state.on;
      it.def.apply(it);
      if (it.state.on) beep([523, 523, 587, 523, 698, 659], "triangle", 0.2);
      else play(() => Sound.noise({ f0: 1800, f1: 500, dur: 0.3, vol: 0.12 }));
      room.burst(it, ["#ffffff", "#ffe14d", "#ff8cc6"], 14, 1.2, 0.4);
    },
  },
  teapot: {
    cat: "food", name: "Чайник", icon: "🫖", kind: "small", up: true, w: 0.24, d: 0.18, tint: 5,
    build(g, it) {
      const p = it.paint();
      sph(g, 0, 0.14, 0, 0.15, p).scale.y = 0.88;
      cyl(g, 0.09, 0.1, 0.03, p, 0, 0.27, 0, 14);
      sph(g, 0, 0.3, 0, 0.025, "#ffffff");
      const spout = cyl(g, 0.025, 0.04, 0.16, p, 0.16, 0.18, 0, 10);
      spout.rotation.z = -0.8;
      part(g, new T.TorusGeometry(0.07, 0.016, 8, 16), p, -0.16, 0.16, 0);
      cyl(g, 0.055, 0.045, 0.08, "#ffffff", 0.05, 0.04, 0.22, 12);
    },
    tap(it, room) {
      play(() => Sound.tone({ type: "sine", f0: 1100, f1: 1500, dur: 0.5, vol: 0.09 }));
      room.burst(it, ["#ffffff", "#eaf6ff"], 14, 1, 0.35);
    },
  },
  apples: {
    cat: "food", name: "Яблоки", icon: "🍎", kind: "small", up: true, w: 0.24, d: 0.24,
    build(g) {
      cyl(g, 0.25, 0.13, 0.12, "#fff4d6", 0, 0.07, 0, 22);
      for (const [x, y, z, c] of [[-0.09, 0.17, 0.05, "#ff3b3b"], [0.1, 0.17, 0.04, "#7ed957"], [0, 0.17, -0.1, "#ff3b3b"], [0.01, 0.27, 0, "#ffb02e"]]) {
        sph(g, x, y, z, 0.085, c);
        cyl(g, 0.006, 0.006, 0.04, DARK, x, y + 0.09, z, 5);
      }
    },
    tap(it, room) {
      room.hop(it, 0.3);
      Sound.pop();
    },
  },
  cat: {
    cat: "pets", name: "Котик", icon: "🐱", kind: "small", w: 0.2, d: 0.26,
    build(g, it) {
      const fur = "#f2a65a",
        pale = "#ffe9cf";
      sph(g, 0, 0.17, -0.05, 0.17, fur).scale.z = 1.25;
      sph(g, 0, 0.14, 0.05, 0.1, pale);
      sph(g, 0, 0.37, 0.12, 0.14, fur);
      sph(g, 0, 0.34, 0.23, 0.05, pale);
      sph(g, 0, 0.36, 0.26, 0.012, "#ff8cc6");
      for (const s of [-1, 1]) {
        sph(g, s * 0.06, 0.4, 0.24, 0.014, "#20140c");
        part(g, new T.ConeGeometry(0.05, 0.1, 8), mat(fur, 0.8), s * 0.09, 0.5, 0.1);
        sph(g, s * 0.08, 0.05, 0.1, 0.05, pale);
      }
      const tail = new T.Group();
      tail.position.set(0, 0.14, -0.24);
      g.add(tail);
      cyl(tail, 0.02, 0.035, 0.34, fur, 0, 0.15, -0.04, 8).rotation.x = -0.3;
      it.tail = tail;
    },
    frame(it, dt, time) {
      it.tail.rotation.z = Math.sin(time * 2.6) * 0.45;
    },
    tap(it, room) {
      room.hop(it, 0.42);
      play(() => {
        Sound.tone({ type: "triangle", f0: 640, f1: 980, dur: 0.17, vol: 0.15 });
        Sound.tone({ type: "triangle", f0: 980, f1: 540, dur: 0.3, vol: 0.14, at: 0.15 });
      });
    },
  },
  dog: {
    cat: "pets", name: "Щенок", icon: "🐶", kind: "small", w: 0.22, d: 0.28,
    build(g, it) {
      const fur = "#e4c29a",
        dark = "#9a6b42";
      sph(g, 0, 0.2, -0.05, 0.18, fur).scale.z = 1.3;
      sph(g, 0, 0.42, 0.13, 0.15, fur);
      sph(g, 0, 0.38, 0.25, 0.07, "#fff4e4");
      sph(g, 0, 0.4, 0.31, 0.022, "#2b1b12");
      for (const s of [-1, 1]) {
        sph(g, s * 0.065, 0.46, 0.25, 0.015, "#20140c");
        sph(g, s * 0.15, 0.42, 0.11, 0.06, dark).scale.y = 1.7;
        sph(g, s * 0.1, 0.05, 0.12, 0.055, fur);
        sph(g, s * 0.1, 0.05, -0.17, 0.055, fur);
      }
      const tail = new T.Group();
      tail.position.set(0, 0.26, -0.26);
      g.add(tail);
      cyl(tail, 0.018, 0.035, 0.2, dark, 0, 0.09, -0.02, 8).rotation.x = -0.4;
      it.tail = tail;
    },
    frame(it, dt, time) {
      it.tail.rotation.z = Math.sin(time * 11) * 0.5;
    },
    tap(it, room) {
      room.hop(it, 0.45);
      play(() => [0, 0.2].forEach((at) => Sound.tone({ type: "square", f0: 340, f1: 150, dur: 0.12, vol: 0.09, at })));
    },
  },
  fish: {
    cat: "pets", name: "Рыбки", icon: "🐠", kind: "small", w: 0.33, d: 0.2,
    build(g, it) {
      box(g, 0.66, 0.05, 0.38, WOOD, 0, 0.025, 0, 0.012);
      box(g, 0.6, 0.03, 0.32, "#f5ead8", 0, 0.065, 0, 0.008);
      const water = box(g, 0.62, 0.38, 0.34, new T.MeshStandardMaterial({ color: "#a6e6fa", transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }), 0, 0.24, 0, 0.012);
      water.userData.keep = true;
      for (const x of [-0.2, 0.2]) cyl(g, 0.012, 0.025, 0.2, "#3f9a4e", x, 0.17, -0.06, 6);
      it.swimmers = ["#ff8a3c", "#ffe14d", "#ff8cc6"].map((c, i) => {
        const f = new T.Group();
        sph(f, 0, 0, 0, 0.055, c).scale.x = 1.45;
        const fin = part(f, new T.ConeGeometry(0.04, 0.08, 6), mat(c, 0.6), -0.1, 0, 0);
        fin.rotation.z = -Math.PI / 2;
        f.userData.phase = i * 2.1;
        f.userData.lane = 0.15 + i * 0.075;
        g.add(f);
        return f;
      });
      it.fast = 0;
    },
    frame(it, dt) {
      it.fast = Math.max(0, it.fast - dt);
      it.swim = (it.swim || 0) + dt * (0.9 + it.fast * 2.5);
      for (const f of it.swimmers) {
        const a = it.swim + f.userData.phase,
          dir = Math.cos(a);
        f.position.set(Math.sin(a) * 0.2, f.userData.lane, Math.sin(a * 1.7) * 0.08);
        f.rotation.y = dir > 0 ? 0 : Math.PI;
      }
    },
    tap(it, room) {
      it.fast = 2.5;
      Sound.splash();
      room.burst(it, ["#ffffff", "#bfe9ff"], 10, 0.8, 0.45);
    },
  },
};

// ---------- комната ----------
const floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0),
  hitPoint = new T.Vector3();
export class Room {
  constructor(world, house) {
    this.world = world;
    this.house = house;
    this.group = new T.Group();
    this.group.position.y = FLOOR;
    this.group.visible = false;
    world.scene.add(this.group);
    this.stuff = new T.Group();
    this.group.add(this.stuff);
    this.items = [];
    this.isOpen = false;
    this.buildShell();
    this.reset();
  }
  reset() {
    for (const it of this.items) this.stuff.remove(it.group);
    this.items = [];
    this.setWall(0);
    this.setFloor(0);
    this.curtainsOpen = true;
  }
  buildShell() {
    const shell = new T.Group(),
      w = IN_W * 2,
      d = FRONT - BACK,
      sheet = (pw, ph, material, x, y, z, ry, rx = 0, scale = 0.95) => {
        const geo = new T.PlaneGeometry(pw, ph),
          uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * pw) / scale, (uv.getY(i) * ph) / scale);
        const m = new T.Mesh(geo, material);
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, 0);
        shell.add(m);
      };
    // Чуть приглушены: в комнату светит солнце, и светлые обои иначе сливаются в белое
    this.wallMat = new T.MeshStandardMaterial({ color: "#dcdcdc", roughness: 0.95 });
    this.floorMat = new T.MeshStandardMaterial({ color: "#e4e4e4", roughness: 0.8 });
    sheet(w, WALL_H, this.wallMat, 0, WALL_H / 2, BACK, 0);
    sheet(d, WALL_H, this.wallMat, -IN_W, WALL_H / 2, BACK + d / 2, Math.PI / 2);
    sheet(d, WALL_H, this.wallMat, IN_W, WALL_H / 2, BACK + d / 2, -Math.PI / 2);
    sheet(w, d, this.floorMat, 0, 0.002, BACK + d / 2, 0, -Math.PI / 2, 1.5);
    box(shell, w, 0.17, 0.05, "#fffaf2", 0, 0.085, BACK + 0.02, 0.012);
    for (const s of [-1, 1]) box(shell, 0.05, 0.17, d, "#fffaf2", s * (IN_W - 0.02), 0.085, BACK + d / 2, 0.012);
    this.windowGroup = new T.Group();
    shell.add(this.windowGroup);
    shell.traverse((n) => {
      if (n.isMesh) n.castShadow = n.receiveShadow = false;
    });
    this.group.add(shell);
  }
  // Окно на задней стене такой же формы, как снаружи. Касание раздвигает занавески
  buildWindow() {
    const g = this.windowGroup,
      { window: kind, trim } = this.house.config;
    g.clear();
    this.sky = new T.MeshBasicMaterial({ color: "#a8e4ff", toneMapped: false });
    const s = 0.56,
      y = 1.95,
      z = BACK + 0.02,
      view = new T.Mesh(new T.ShapeGeometry(shapeOf(kind || "round", s), 18), this.sky),
      rim = new T.Shape();
    view.position.set(0, y, z + 0.015);
    rim.absellipse(0, 0, 0, 0, 0, 0);
    const edge = new T.Mesh(new T.ShapeGeometry(shapeOf(kind || "round", s * 1.14), 18), mat(trim || "#ffffff", 0.5));
    edge.position.set(0, y, z + 0.005);
    g.add(edge, view);
    part(g, new T.CylinderGeometry(0.03, 0.03, 2, 10), mat(DARK, 0.6), 0, y + 0.82, z + 0.1).rotation.z = Math.PI / 2;
    this.curtains = [-1, 1].map((side) => {
      const c = new T.Group(),
        cloth = new T.MeshStandardMaterial({ color: "#ff8cc6", roughness: 0.8 });
      c.position.set(side * 0.98, y + 0.8, z + 0.1);
      for (let i = 0; i < 5; i++) box(c, 0.13, 1.5, 0.05, cloth, -side * i * 0.12, -0.75, i % 2 ? 0.02 : -0.01, 0.025);
      g.add(c);
      c.userData.side = side;
      c.scale.x = this.curtainsOpen ? 0.45 : 1.45;
      return c;
    });
    g.traverse((n) => {
      if (n.isMesh) n.castShadow = n.receiveShadow = false;
    });
  }
  toggleCurtains() {
    this.curtainsOpen = !this.curtainsOpen;
    for (const c of this.curtains) {
      const from = c.scale.x,
        to = this.curtainsOpen ? 0.45 : 1.45;
      this.world.tween(0.45, (t) => (c.scale.x = from + (to - from) * t), null, easeOut);
    }
  }
  setWall(i) {
    this.wallIndex = WALLPAPERS[i] ? i : 0;
    this.wallMat.map = tile(WALLPAPERS[this.wallIndex]).map;
    this.wallMat.needsUpdate = true;
  }
  setFloor(i) {
    this.floorIndex = FLOORS[i] ? i : 0;
    this.floorMat.map = tile(FLOORS[this.floorIndex]).map;
    this.floorMat.needsUpdate = true;
  }
  // ---------- раскрыть и закрыть ----------
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    const h = this.house,
      w = this.world;
    this.buildWindow();
    this.group.visible = true;
    this.cosyHome = this.cosyHome || w.cosy.position.clone();
    w.cosy.position.set(0, FLOOR + 3.3, 3.4);
    w.cosyMin = 8;
    w.leafFall.visible = false;
    for (const g of [h.railGroup, h.windowGroup, h.decorGroup, h.wayGroup]) g.visible = false;
    h.bird.visible = false;
    for (const p of h.frontParts) p.visible = false;
    const front = h.boards.slice(0, 10);
    front.forEach((b, i) => {
      const y = b.position.y;
      w.tween(0.32 + i * 0.022, (t) => {
        b.scale.y = Math.max(0.001, 1 - t);
        b.position.y = y - (WALL_H / 2) * t;
      }, () => {
        b.visible = false;
        b.scale.y = 1;
        b.position.y = y;
      }, easeOut);
    });
    w.tween(0.65, (t) => (h.roofGroup.position.y = t * 7), () => (h.roofGroup.visible = false), easeOut);
    const s = h.squirrel;
    s.userData.size = 1;
    s.scale.setScalar(1);
    this.resident = { def: { kind: "floor", w: 0.26, d: 0.26 }, group: s, resident: true, size: 1 };
    s.userData.item = this.resident;
    h.moveSquirrel(1.75, FLOOR, 3, -0.35);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    const h = this.house,
      w = this.world;
    w.cosy.position.copy(this.cosyHome);
    w.cosyMin = 0;
    w.leafFall.visible = true;
    for (const g of [h.railGroup, h.windowGroup, h.decorGroup, h.wayGroup]) g.visible = true;
    h.bird.visible = !!h.birdSpot;
    h.door.rotation.y = 0;
    h.doorOpen = false;
    h.boards.slice(0, 10).forEach((b, i) => {
      const y = b.position.y;
      b.visible = true;
      w.tween(0.32 + i * 0.022, (t) => {
        b.scale.y = Math.max(0.001, t);
        b.position.y = y - (WALL_H / 2) * (1 - t);
      }, null, easeOut);
    });
    h.roofGroup.visible = true;
    w.tween(0.55, (t) => (h.roofGroup.position.y = (1 - t) * 7), () => Sound.land(), (t) => t * t);
    w.tween(0.56, () => {}, () => {
      if (this.isOpen) return;
      this.group.visible = false;
      for (const p of h.frontParts) p.visible = true;
    });
    h.squirrel.userData.size = 1.5;
    h.squirrel.scale.setScalar(1.5);
    h.squirrel.userData.item = null;
  }
  // Камера ставит комнату в свободную часть экрана: над лотком и под кнопками
  fit(trayPx) {
    const c = this.world.camera,
      H = innerHeight,
      top = 58,
      free = Math.max(0.25, (H - trayPx - top) / H),
      v = T.MathUtils.degToRad(c.fov) / 2,
      h = Math.atan(Math.tan(v) * c.aspect),
      d = Math.max(2.95 / Math.tan(h), 4.5 / (2 * free * Math.tan(v))),
      down = ((trayPx - top) / H) * d * Math.tan(v);
    this.world.focus([0, FLOOR + 1.3 - down, 2.25], d * Math.sin(Math.min(v, h)), 0, 0.36);
  }
  // ---------- вещи ----------
  make(id, saved = {}) {
    const def = ITEMS[id],
      group = new T.Group(),
      it = {
        id,
        def,
        group,
        tintIndex: Number.isInteger(saved.tint) ? saved.tint : def.tint || 0,
        size: saved.size || 1,
        wall: saved.wall || 0,
        on: null,
        state: { ...def.state, ...saved.state },
        mats: [],
        paint(shift = 0) {
          const m = new T.MeshStandardMaterial({ roughness: 0.65 });
          it.mats.push({ m, shift });
          m.color.set(TINTS[(((it.tintIndex + shift) % TINTS.length) + TINTS.length) % TINTS.length]);
          return m;
        },
      };
    def.build(group, it);
    flatten(group);
    if (def.kind === "floor" || def.kind === "small") contact(group, def.w, def.d);
    group.userData.item = it;
    def.apply?.(it);
    def.restore?.(it);
    this.items.push(it);
    this.stuff.add(group);
    return it;
  }
  add(id) {
    if (this.items.length >= MAX_ITEMS) return null;
    const it = this.make(id);
    this.placeFree(it);
    const g = it.group,
      size = it.size;
    g.scale.setScalar(0.001);
    this.world.tween(0.42, (t) => g.scale.setScalar(Math.max(0.001, t) * size), null, easeBack);
    this.burst(it, ["#ffe14d", "#ffffff", "#ff8cc6"], 12, 1.4);
    return it;
  }
  remove(it) {
    this.items = this.items.filter((o) => o !== it);
    for (const o of this.items)
      if (o.on === it) {
        o.on = null;
        const g = o.group,
          y = g.position.y;
        this.world.tween(0.3, (t) => (g.position.y = y * (1 - t)), () => Sound.land(), (t) => t * t);
      }
    this.burst(it, ["#ffffff", "#e8e8e8"], 12, 1.5);
    const g = it.group,
      size = it.size;
    this.world.tween(0.2, (t) => g.scale.setScalar(Math.max(0.001, (1 - t) * size)), () => this.stuff.remove(g), (t) => t);
  }
  settle(it) {
    const g = it.group,
      from = g.scale.x,
      to = it.size;
    this.world.tween(0.3, (t) => g.scale.setScalar(from + (to - from) * t), null, easeBack);
  }
  burst(it, colors, n = 12, power = 1.4, lift = 0.4) {
    const p = new T.Vector3();
    it.group.getWorldPosition(p);
    p.y += lift;
    this.world.burst(p, colors, n, power);
  }
  hop(it, height) {
    const g = it.group;
    let last = 0;
    this.world.tween(0.5, (t) => {
      const y = Math.sin(t * Math.PI) * height;
      g.position.y += y - last;
      last = y;
    }, null, (t) => t);
  }
  jiggle(it, power = 0.14) {
    const g = it.group,
      s = it.size;
    this.world.tween(0.42, (t) => {
      const k = Math.sin(t * Math.PI * 3) * (1 - t) * power;
      g.scale.set(s * (1 + k), s * (1 - k), s * (1 + k));
    }, () => g.scale.setScalar(s), (t) => t);
  }
  recolor(it) {
    if (!it.mats.length) return false;
    it.tintIndex = (it.tintIndex + 1) % TINTS.length;
    for (const { m, shift } of it.mats) {
      m.color.set(TINTS[(((it.tintIndex + shift) % TINTS.length) + TINTS.length) % TINTS.length]);
      if (m.userData.glow) m.emissive.copy(m.color);
    }
    return true;
  }
  tap(it) {
    if (it.resident) {
      this.house.jump("squirrel", 1.3);
      Sound.giggle();
      return;
    }
    if (it.def.tap) it.def.tap(it, this);
    else {
      this.recolor(it);
      this.jiggle(it);
      Sound.pop();
      this.burst(it, [TINTS[it.tintIndex], "#ffffff"], 10, 1.2);
    }
    this.house.jump("squirrel", 0.5);
  }
  tapEmpty(x, y) {
    if (this.world.hits(x, y, [this.windowGroup]).length) {
      this.toggleCurtains();
      Sound.tap();
      return true;
    }
    return false;
  }
  // Самая близкая к пальцу вещь. Коврик выбирается, только если на нём ничего нет
  pick(x, y) {
    const owner = (o) => {
      while (o) {
        if (o.userData.item) return o.userData.item;
        o = o.parent;
      }
      return null;
    };
    let flat = null;
    for (const hit of this.world.hits(x, y, [this.stuff, this.house.squirrel])) {
      const it = owner(hit.object);
      if (!it) continue;
      if (it.def.kind !== "flat") return it;
      flat = flat || it;
    }
    if (flat) return flat;
    let best = null,
      min = 46;
    const p = new T.Vector3();
    for (const it of this.items) {
      it.group.getWorldPosition(p);
      p.y += 0.2;
      const s = this.world.toScreen(p),
        dist = Math.hypot(s.x - x, s.y - y);
      if (s.front && dist < min) {
        min = dist;
        best = it;
      }
    }
    return best;
  }
  rayTo(x, y) {
    const canvas = this.world.canvas;
    this.world.ray.setFromCamera(new T.Vector2((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1), this.world.camera);
    return this.world.ray.ray;
  }
  atHeight(ray, h) {
    floorPlane.constant = -(FLOOR + h);
    return ray.intersectPlane(floorPlane, hitPoint);
  }
  grab(it, x, y) {
    const p = it.group.position,
      base = it.resident ? p.y - FLOOR : p.y;
    it.grabbed = new T.Vector2(0, 0);
    const point = this.atHeight(this.rayTo(x, y), base);
    if (point) it.grabbed.set(p.x - point.x, p.z - point.z);
    if (!it.resident) it.group.scale.setScalar(it.size * 1.08);
    else this.house.jump("squirrel", 0.4);
  }
  dragTo(it, x, y) {
    const ray = this.rayTo(x, y),
      def = it.def;
    if (def.kind === "wall") return this.dragOnWall(it, ray);
    const before = it.group.position.clone();
    let spot = null;
    if (def.kind === "small") {
      let bestY = -1;
      for (const s of this.items) {
        const top = s.def.top;
        if (s === it || !top || top.y < bestY) continue;
        const p = this.atHeight(ray, top.y);
        if (!p) continue;
        // Для стола важно, куда смотрит палец: поправка для пола здесь только мешает
        const px = p.x,
          pz = p.z,
          sp = s.group.position,
          margin = 0.1;
        if (Math.abs(px - sp.x) <= top.w + margin && Math.abs(pz - sp.z) <= top.d + margin) {
          bestY = top.y;
          spot = { on: s, x: T.MathUtils.clamp(px, sp.x - top.w, sp.x + top.w), z: T.MathUtils.clamp(pz, sp.z - top.d, sp.z + top.d), y: top.y };
        }
      }
    }
    if (!spot) {
      const p = this.atHeight(ray, 0);
      if (!p) return;
      spot = {
        on: null,
        x: T.MathUtils.clamp(p.x + it.grabbed.x, -IN_W + def.w, IN_W - def.w),
        z: T.MathUtils.clamp(p.z + it.grabbed.y, BACK + def.d, FRONT - def.d * 0.6),
        y: 0,
      };
    }
    const g = it.group;
    g.position.x = spot.x;
    g.position.z = spot.z;
    if (!it.resident) {
      g.position.y = spot.y;
      it.on = spot.on;
    }
    if (def.turns) this.faceTable(it);
    // Что стоит на вещи, едет вместе с ней
    if (def.top)
      for (const o of this.items)
        if (o.on === it) {
          o.group.position.x += g.position.x - before.x;
          o.group.position.z += g.position.z - before.z;
          o.group.position.y = def.top.y;
        }
  }
  dragOnWall(it, ray) {
    const { w, d } = it.def,
      walls = [
        { plane: new T.Plane(new T.Vector3(0, 0, 1), -BACK), index: 0 },
        { plane: new T.Plane(new T.Vector3(1, 0, 0), IN_W), index: 1 },
        { plane: new T.Plane(new T.Vector3(-1, 0, 0), IN_W), index: 2 },
      ];
    let best = null,
      bestDist = Infinity;
    for (const wall of walls) {
      const p = ray.intersectPlane(wall.plane, new T.Vector3());
      if (!p) continue;
      const dist = p.distanceTo(ray.origin),
        inside = p.y >= FLOOR - 0.5 && p.y <= FLOOR + WALL_H + 0.8 && (wall.index === 0 ? Math.abs(p.x) <= IN_W + 0.4 : p.z >= BACK - 0.4 && p.z <= FRONT + 0.8);
      if (inside && dist < bestDist) {
        bestDist = dist;
        best = { p, index: wall.index };
      }
    }
    if (!best) return;
    it.wall = best.index;
    const y = T.MathUtils.clamp(best.p.y - FLOOR, d + 0.2, WALL_H - d - 0.05);
    if (best.index === 0) this.hang(it, T.MathUtils.clamp(best.p.x, -IN_W + w, IN_W - w), y, 0);
    else this.hang(it, best.index === 1 ? -IN_W : IN_W, y, T.MathUtils.clamp(best.p.z, BACK + w, FRONT - w));
  }
  hang(it, x, y, z) {
    const g = it.group;
    if (it.wall === 0) {
      g.position.set(x, y, BACK);
      g.rotation.y = 0;
    } else {
      g.position.set(x, y, z);
      g.rotation.y = it.wall === 1 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  // Стул сам разворачивается к столу, если стол рядом
  faceTable(it) {
    const p = it.group.position;
    let near = null,
      min = 2;
    for (const o of this.items) {
      if (o.id !== "table") continue;
      const dist = Math.hypot(o.group.position.x - p.x, o.group.position.z - p.z);
      if (dist < min) {
        min = dist;
        near = o;
      }
    }
    it.group.rotation.y = near ? Math.atan2(near.group.position.x - p.x, near.group.position.z - p.z) : 0;
  }
  drop(it) {
    if (it.resident) return;
    this.jiggle(it, 0.1);
    Sound.land();
  }
  // Новая вещь встаёт туда, где свободнее
  placeFree(it) {
    const def = it.def;
    if (def.kind === "wall") return this.hangFree(it);
    if (def.up && this.placeOnTop(it)) return;
    const flat = def.kind === "flat",
      others = this.items.filter((o) => o !== it && !o.on && o.def.kind !== "wall" && (o.def.kind === "flat") === flat);
    if (!flat && this.resident) others.push(this.resident);
    const gap = (o, x, z) => {
      const p = o.group.position;
      return Math.max(Math.abs(p.x - x) - o.def.w - def.w, Math.abs(p.z - z) - o.def.d - def.d);
    };
    let best = [0, 2.3],
      bestScore = -Infinity;
    for (let x = -IN_W + def.w; x <= IN_W - def.w + 0.001; x += 0.3)
      for (let z = BACK + def.d; z <= FRONT - def.d * 0.6 + 0.001; z += 0.3) {
        const free = others.reduce((m, o) => Math.min(m, gap(o, x, z)), 1),
          // Сначала свободное место, потом удобное: большое к стене, остальное ближе к середине
          wish = def.back ? (z - BACK) * 0.5 + Math.abs(x) * 0.03 : Math.hypot(x, z - 2.5) * (flat ? 0.3 : 0.1),
          score = Math.min(free, 0.12) * 10 - wish;
        if (score > bestScore) {
          bestScore = score;
          best = [x, z];
        }
      }
    it.group.position.set(best[0], 0, best[1]);
    if (def.turns) this.faceTable(it);
  }
  placeOnTop(it) {
    const count = (s) => this.items.filter((o) => o.on === s).length,
      s = this.items.filter((o) => o.def.top && count(o) < 3).sort((a, b) => count(a) - count(b))[0];
    if (!s) return false;
    const top = s.def.top,
      sp = s.group.position,
      neighbours = this.items.filter((o) => o.on === s);
    let spot = [0, 0],
      bestScore = -1;
    for (const q of [[0, 0], [-0.8, 0.3], [0.8, 0.3], [0, -0.6]]) {
      const free = neighbours.reduce((m, o) => Math.min(m, Math.hypot(o.group.position.x - (sp.x + q[0] * top.w), o.group.position.z - (sp.z + q[1] * top.d))), 9);
      if (free > bestScore) {
        bestScore = free;
        spot = q;
      }
    }
    it.group.position.set(sp.x + spot[0] * top.w, top.y, sp.z + spot[1] * top.d);
    it.on = s;
    return true;
  }
  hangFree(it) {
    const { w, d } = it.def,
      hung = this.items.filter((o) => o !== it && o.def.kind === "wall");
    let best = null,
      bestScore = -Infinity;
    for (const wall of [0, 1, 2]) {
      const from = wall ? BACK + w : -IN_W + w,
        to = wall ? FRONT - w : IN_W - w;
      for (let u = from; u <= to + 0.001; u += 0.25)
        for (let y = d + 0.9; y <= WALL_H - d - 0.05 + 0.001; y += 0.25) {
          let free = wall ? 1 : Math.max(Math.abs(u) - 0.72 - w, Math.abs(y - 1.95) - 0.72 - d);
          for (const o of hung) {
            if (o.wall !== wall) continue;
            const p = o.group.position;
            free = Math.min(free, Math.max(Math.abs((wall ? p.z : p.x) - u) - o.def.w - w, Math.abs(p.y - y) - o.def.d - d));
          }
          const score = Math.min(free, 0.1) * 10 - Math.abs(y - 2.25) * 0.15 - (wall ? 0.5 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = { wall, u, y };
          }
        }
    }
    it.wall = best.wall;
    if (best.wall === 0) this.hang(it, best.u, best.y, 0);
    else this.hang(it, best.wall === 1 ? -IN_W : IN_W, best.y, best.u);
  }
  frame(dt, time, night) {
    if (!this.isOpen && !this.group.visible) return;
    for (const it of this.items) it.def.frame?.(it, dt, time, night);
    this.sky?.color.set("#a8e4ff").lerp(nightSky, night);
  }
  // ---------- сохранение ----------
  serialize() {
    return {
      wall: this.wallIndex,
      floor: this.floorIndex,
      curtains: this.curtainsOpen,
      items: this.items.map((it) => ({
        id: it.id,
        x: +it.group.position.x.toFixed(3),
        y: +it.group.position.y.toFixed(3),
        z: +it.group.position.z.toFixed(3),
        ry: +it.group.rotation.y.toFixed(3),
        tint: it.tintIndex,
        size: it.size,
        wall: it.wall,
        on: it.on ? this.items.indexOf(it.on) : -1,
        state: it.state,
      })),
    };
  }
  load(data) {
    this.reset();
    if (!data) return;
    this.setWall(data.wall);
    this.setFloor(data.floor);
    this.curtainsOpen = data.curtains !== false;
    const made = (Array.isArray(data.items) ? data.items : []).slice(0, MAX_ITEMS).map((s) => {
      if (!ITEMS[s?.id]) return null;
      const it = this.make(s.id, s);
      it.group.position.set(+s.x || 0, +s.y || 0, +s.z || 0);
      it.group.rotation.y = +s.ry || 0;
      it.group.scale.setScalar(it.size);
      return it;
    });
    (data.items || []).slice(0, MAX_ITEMS).forEach((s, i) => {
      if (made[i] && made[s.on]) made[i].on = made[s.on];
    });
  }
}
const nightSky = new T.Color("#1c2a66");
