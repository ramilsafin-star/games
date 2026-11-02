import * as T from "../vendor/three/three.module.min.js?v=c154e7bd";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=c154e7bd";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js?v=c154e7bd";

const materials = new Map(),
  boxes = new Map();
const ball = new T.SphereGeometry(1, 20, 14);
const bead = new T.SphereGeometry(1, 12, 8);
const tube = new T.CylinderGeometry(1, 1, 1, 32);
const pie = Math.PI;
const cream = "#ffebc7",
  teal = "#22aaa3",
  berry = "#f36475",
  cocoa = "#422b40";
export const flavors = [
  {
    id: "berry",
    name: "Клубника",
    color: "#ff879e",
    tile: "#ffdce1",
    rim: "#c58b99",
    fleck: "#b74161",
  },
  {
    id: "vanilla",
    name: "Ваниль",
    color: "#ffe4a4",
    tile: "#fff0bd",
    rim: "#d3ae62",
    fleck: "#ba8b55",
  },
  {
    id: "choco",
    name: "Шоколад",
    color: "#aa6a50",
    tile: "#eed6c1",
    rim: "#ba937b",
    fleck: "#613c38",
  },
  {
    id: "mint",
    name: "Мята",
    color: "#8bddb2",
    tile: "#cef0db",
    rim: "#88b39c",
    fleck: "#3e9e83",
  },
];
// Отделка: soft — бархатистые зверята и парк, gloss — лакированный фургон и леденцы
let finish = "soft";
function mat(color) {
  if (typeof color !== "string") return color;
  const key = color + finish;
  if (!materials.has(key))
    materials.set(
      key,
      finish === "gloss"
        ? new T.MeshPhysicalMaterial({
            color,
            roughness: 0.3,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
          })
        : new T.MeshStandardMaterial({ color, roughness: 0.44 }),
    );
  return materials.get(key);
}
// Всё, что построено внутри, блестит как леденец
function glossy(build) {
  const was = finish;
  finish = "gloss";
  try {
    return build();
  } finally {
    finish = was;
  }
}
export function group(parent, x = 0, y = 0, z = 0) {
  const g = new T.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function mesh(p, geo, color, x, y, z) {
  const m = new T.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  p.add(m);
  return m;
}
function box(p, x, y, z, w, h, d, c, r = 0.08) {
  const key = [w, h, d, r].join(",");
  if (!boxes.has(key))
    boxes.set(
      key,
      new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)),
    );
  return mesh(p, boxes.get(key), c, x, y, z);
}
export function orb(p, x, y, z, w, h, d, c) {
  const geometry = Math.max(w, h, d) < 0.19 ? bead : ball;
  const m = mesh(p, geometry, c, x, y, z);
  m.scale.set(w, h, d);
  return m;
}
function disk(p, x, y, z, r, h, c) {
  const m = mesh(p, tube, c, x, y, z);
  m.scale.set(r, h, r);
  return m;
}
function line(p, points, r, c) {
  const path = new T.CatmullRomCurve3(points.map((v) => new T.Vector3(...v)));
  return mesh(
    p,
    new T.TubeGeometry(path, Math.max(6, points.length * 3), r, 7, false),
    c,
    0,
    0,
    0,
  );
}
// Bake fixed parts relative to their moving parent so a whole toy needs only a few draws.
export function bake(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(),
    batches = new Map();
  root.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
    if (!batches.has(m.material)) batches.set(m.material, []);
    batches.get(m.material).push(g);
  });
  root.clear();
  for (const [material, parts] of batches) {
    const mesh = new T.Mesh(mergeGeometries(parts), material);
    mesh.castShadow = mesh.receiveShadow = !material.transparent;
    root.add(mesh);
    for (const part of parts) part.dispose();
  }
  return root;
}
function painted(w, h, draw, lit = false) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"));
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return lit
    ? new T.MeshStandardMaterial({ map: texture, roughness: 0.72 })
    : new T.MeshBasicMaterial({ map: texture, transparent: true });
}
const waffle = painted(
  256,
  256,
  (ctx) => {
    ctx.fillStyle = "#e9aa5d";
    ctx.fillRect(0, 0, 256, 256);
    for (const [dy, color, width] of [
      [0, "#bf783f", 7],
      [-3, "#ffe3a0", 4],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = -256; x <= 512; x += 32)
        for (const slope of [-1, 1]) {
          ctx.moveTo(x, dy);
          ctx.lineTo(x + slope * 256, 256 + dy);
        }
      ctx.stroke();
    }
  },
  true,
);
// Subtle churn marks follow the scoop surface and catch the sidelight.
const creams = flavors.map((flavor, index) => {
  const material = painted(
    256,
    128,
    (ctx) => {
      ctx.fillStyle = flavor.color;
      ctx.fillRect(0, 0, 256, 128);
      let seed = 1729 + index;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 2200; i++) {
        const x = random() * 256,
          y = random() * 128;
        ctx.fillStyle =
          i % 3 ? "rgba(255,246,216,.13)" : "rgba(106,52,50,.065)";
        ctx.fillRect(x, y, 1 + 2 * random(), 1 + random());
      }
      for (let i = 0; i < 75; i++) {
        const x = random() * 256,
          y = random() * 128,
          w = 5 + random() * 22;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + w * 0.55, y + 3, x + w, y - 2);
        ctx.lineWidth = 0.45 + random() * 1.1;
        ctx.strokeStyle =
          i % 3 ? "rgba(255,243,216,.24)" : "rgba(116,59,55,.10)";
        ctx.stroke();
      }
    },
    true,
  );
  // Сливочный бархат по краям шарика и тонкий влажный блеск сверху
  return new T.MeshPhysicalMaterial({
    map: material.map,
    bumpMap: material.map,
    bumpScale: 0.016,
    roughness: 0.6,
    sheen: 0.8,
    sheenRoughness: 0.45,
    sheenColor: new T.Color("#fff4e4"),
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
  });
});
const coneGeo = new T.CylinderGeometry(0.43, 0.028, 0.92, 50, 1);
export function cone(p) {
  const g = group(p);
  mesh(g, coneGeo, waffle, 0, 0.46, 0);
  disk(g, 0, 0.91, 0, 0.445, 0.075, "#efb975");
  return g;
}
export function scoop(p, flavor, index = 0) {
  const f = flavors[flavor],
    g = group(p, 0, 1.11 + index * 0.51, 0);
  orb(g, 0, 0.04, 0, 0.52, 0.47, 0.52, creams[flavor]);
  for (let i = 0; i < 10; i++) {
    const a = (i * pie) / 5;
    orb(
      g,
      0.4 * Math.cos(a),
      -0.15 + Math.sin(i * 3) * 0.018,
      0.4 * Math.sin(a),
      0.165,
      0.125,
      0.165,
      creams[flavor],
    );
  }
  for (let i = 0; i < 13; i++) {
    const y = 0.05 + (i % 4) * 0.1,
      a = i * 2.4 + index,
      radius = 0.52 * Math.sqrt(1 - (y / 0.47) ** 2);
    const bit = orb(
      g,
      Math.cos(a) * radius,
      y + 0.04,
      Math.sin(a) * radius,
      0.029,
      0.013,
      0.034,
      f.fleck,
    );
    bit.rotation.z = a;
  }
  return bake(g);
}
export function topping(p, kind, height) {
  return glossy(() => toppingParts(p, kind, height));
}
function toppingParts(p, kind, height) {
  const g = group(p, 0, height, 0);
  if (kind === "syrup") {
    const path = [];
    for (let i = 0; i <= 62; i++) {
      const a = i * 0.21,
        r = 0.43 * (1 - i / 67);
      path.push([
        Math.cos(a) * r,
        Math.sqrt(1 - (r / 0.52) ** 2) * 0.47 + 0.06,
        Math.sin(a) * r,
      ]);
    }
    line(g, path, 0.033, "#a33e63");
  } else if (kind === "stars") {
    for (let i = 0; i < 17; i++) {
      const a = i * 2.4,
        r = 0.12 + (i % 5) * 0.08;
      const s = box(
        g,
        Math.cos(a) * r,
        0.06 + Math.sqrt(1 - (r / 0.52) ** 2) * 0.47,
        Math.sin(a) * r,
        0.09,
        0.042,
        0.04,
        [cream, berry, "#49bfc6", "#ffc82d"][i % 4],
        0.019,
      );
      s.rotation.y = a;
    }
  } else {
    orb(g, 0.08, 0.55, 0, 0.17, 0.16, 0.17, "#e74753");
    line(
      g,
      [
        [0.09, 0.65, 0],
        [0.13, 0.79, -0.01],
        [0.23, 0.82, -0.03],
      ],
      0.017,
      "#597b50",
    );
    orb(g, 0.19, 0.76, -0.02, 0.09, 0.028, 0.04, "#65b878").rotation.z = 0.5;
  }
  return bake(g);
}
export function syrupStroke(p, points) {
  if (points.length > 1)
    return glossy(() => line(p, points, 0.031, "#a33e63"));
}
function label(p, x, y, z, w, h, draw) {
  return mesh(p, new T.PlaneGeometry(w, h), painted(768, 192, draw), x, y, z);
}
function wheel(p, x) {
  for (const [z, r, h, c] of [
    [0.87, 0.49, 0.36, cocoa],
    [1.08, 0.34, 0.07, cream],
    [1.125, 0.236, 0.06, "#ff8e91"],
    [1.165, 0.1, 0.045, "#ffd263"],
  ]) {
    disk(p, x, 0.55, z, r, h, c).rotation.x = pie / 2;
  }
}
// Лампочки гирлянды: у каждого цвета свой материал, park.js заставляет их перемигиваться
export const bulbs = ["#ff4f7b", "#ffcc33", "#3fc8ff", "#6eea8e", "#c27dff"].map(
  (color) =>
    new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      roughness: 0.25,
    }),
);
export function truck(p) {
  const g = glossy(() => truckBody(p));
  // Рожок-вывеска на крыше крутится отдельно от фургона
  const sign = group(g, -1.4, 2.78, 0.24);
  sign.scale.setScalar(0.82);
  const spin = group(sign);
  cone(spin);
  scoop(spin, 0);
  topping(spin, "cherry", 1.11);
  bake(spin);
  return { body: g, spin };
}
function truckBody(p) {
  const g = group(p, -2.05, 0, -0.25);
  g.rotation.y = 0.18;
  box(g, 0, 0.73, 0, 4.85, 0.34, 1.8, "#176f77", 0.14);
  box(g, 0.43, 1.64, 0, 3.97, 2.14, 1.9, teal, 0.29);
  box(g, -1.84, 1.15, 0, 1.64, 0.99, 1.77, "#47c9bb", 0.28);
  box(g, -1.68, 1.98, 0, 1.32, 1.39, 1.68, "#78e1d3", 0.25);
  box(g, -1.71, 2.16, 0.82, 1.02, 0.67, 0.11, "#2a6878", 0.13);
  box(g, -1.72, 2.19, 0.885, 0.82, 0.49, 0.035, "#9cdee7", 0.09);
  box(g, -2.32, 2.13, 0.06, 0.07, 0.56, 1.18, "#82cbd8", 0.03);
  box(g, -1.49, 1.68, 0.91, 0.23, 0.057, 0.05, cream, 0.02);
  box(g, -2.53, 0.98, 0.61, 0.13, 0.21, 0.32, "#ffdf87", 0.06);
  box(g, -2.63, 0.74, 0, 0.21, 0.2, 1.65, cream);
  box(g, 0.34, 1.12, 0.96, 4.04, 0.18, 0.08, "#ffdba1", 0.035);
  box(g, 0.61, 1.91, 0.96, 2.87, 1.25, 0.12, cream, 0.16);
  box(g, 0.6, 1.98, 1.029, 2.64, 0.94, 0.07, "#356773", 0.09);
  box(g, 0.64, 2.03, 1.067, 2.48, 0.76, 0.035, "#5d9296", 0.06);
  box(g, 0.6, 1.48, 1.16, 3.05, 0.15, 0.68, "#ffda96", 0.07);
  for (let i = 0; i < 6; i++) {
    const x = -0.44 + i * 0.39;
    disk(g, x, 1.63, 1.14, 0.17, 0.15, "#fff4d7");
    orb(g, x, 1.73, 1.14, 0.17, 0.14, 0.16, flavors[i % 4].color);
  }
  box(g, 0.34, 2.82, 0.02, 4.2, 0.24, 2.04, "#ff9b9e", 0.12);
  for (let i = 0; i < 11; i++) {
    const x = -0.83 + i * 0.29,
      col = i % 2 ? "#fff3d8" : "#f46d80";
    const strip = box(g, x, 2.67, 1.24, 0.305, 0.1, 0.81, col, 0.04);
    strip.rotation.x = 0.22;
    orb(g, x, 2.5, 1.59, 0.151, 0.155, 0.06, col);
  }
  // Painted coachwork, headlamps and glints in the driver’s window.
  for (const z of [-0.56, 0.56]) {
    box(g, -2.65, 1.21, z, 0.1, 0.19, 0.26, "#fff1ac", 0.045);
  }
  for (let i = 0; i < 4; i++)
    box(g, -2.666, 0.96, -0.2 + i * 0.14, 0.036, 0.1, 0.043, "#236c72", 0.016);
  box(g, -1.76, 2.21, 0.93, 0.07, 0.33, 0.018, "#d9f6eb", 0.015).rotation.z =
    -0.48;
  box(g, -1.62, 2.2, 0.93, 0.035, 0.26, 0.018, "#d9f6eb", 0.012).rotation.z =
    -0.48;
  label(g, -0.46, 0.96, 1.012, 1.1, 0.3, (ctx) => {
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff1c7";
    ctx.font = "900 134px system-ui";
    ctx.fillText("★  01  ★", 384, 147);
  });
  for (let i = 0; i < 5; i++)
    orb(
      g,
      0.5 + i * 0.16,
      0.98,
      1.0,
      0.042,
      0.042,
      0.017,
      [berry, cream, "#ffbd50"][i % 3],
    );
  wheel(g, -1.79);
  wheel(g, 1.62);
  const badge = group(g, 0.61, 3.3, 0.15);
  box(badge, 0, 0, 0, 2.46, 0.78, 0.18, "#ad485d", 0.26);
  box(badge, 0, 0.027, 0.085, 2.39, 0.69, 0.15, cream, 0.25);
  box(badge, 0, 0.025, 0.155, 2.26, 0.56, 0.09, "#ea687b", 0.22);
  label(badge, 0, 0.04, 0.207, 2.21, 0.54, (ctx) => {
    ctx.fillStyle = "#fff9dd";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = 'italic 900 145px "Avenir Next", system-ui';
    ctx.fillText("Пломбир", 384, 89, 710);
  });
  // Гирлянда по переднему краю крыши
  for (let i = 0; i < 14; i++)
    mesh(g, bead, bulbs[i % bulbs.length], -1.62 + i * 0.3, 2.83, 1.07).scale.setScalar(0.075);
  return bake(g);
}
// Гости по кругу. Порядок совпадает со списком гостей в shop.js.
// hop — радостно прыгает с рожком, lick — облизывает мороженое.
export const pals = [
  { kind: "bear", fur: "#be7a4e", muzzle: "#f4ca90", shirt: "#6fb9be", ear: "#de9e75", brow: "#945b42", lick: true },
  { kind: "fox", fur: "#ed874e", muzzle: "#fff0cd", shirt: "#b3a7df", ear: "#864c4b", brow: "#945b42" },
  { kind: "bunny", fur: "#c3b5dd", muzzle: "#fff0df", shirt: "#f3bd65", ear: "#eb9cae", brow: "#a290b5", hop: true },
  { kind: "cat", fur: "#aab4c9", muzzle: "#fff6ea", shirt: "#ff9fae", ear: "#f6b3c0", brow: "#727c98", nose: "#e9798d", lick: true },
  { kind: "pig", fur: "#f7b0bf", muzzle: "#ffc9d4", shirt: "#7dc3e6", ear: "#e7869d", brow: "#c46a82", hop: true },
  { kind: "panda", fur: "#fbf7ef", muzzle: "#fffaf2", shirt: "#ffcf5c", ear: "#4a3c45", brow: "#4a3c45", limb: "#4a3c45", lick: true },
];
export function animal(p, index) {
  const { kind, fur, muzzle, shirt, ear, brow, nose = cocoa } = pals[index],
    limb = pals[index].limb || fur,
    root = group(p),
    body = group(root);
  orb(body, 0, 0.94, 0, 0.58, 0.77, 0.48, fur);
  orb(body, 0, 0.84, 0.05, 0.6, 0.54, 0.48, shirt);
  orb(body, -0.29, 0.21, 0.13, 0.28, 0.21, 0.33, limb);
  orb(body, 0.29, 0.21, 0.13, 0.28, 0.21, 0.33, limb);
  for (const s of [-1, 1]) {
    box(body, s * 0.28, 1.2, 0.35, 0.11, 0.4, 0.08, shirt, 0.03).rotation.z =
      s * 0.24;
    orb(body, s * 0.23, 1.21, 0.416, 0.048, 0.05, 0.035, "#ffe897");
    orb(body, s * 0.56, 1.1, 0.19, 0.2, 0.34, 0.2, limb).rotation.z = s * 0.48;
  }
  bake(body);
  const tail = group(root, 0.4, 0.63, -0.22);
  if (kind === "fox") {
    orb(tail, 0.29, 0.24, 0, 0.23, 0.48, 0.23, fur).rotation.z = -0.78;
    orb(tail, 0.55, 0.49, 0, 0.155, 0.25, 0.15, muzzle).rotation.z = -0.72;
  } else if (kind === "cat") {
    // Длинный хвост загибается вверх сбоку от туловища
    line(
      tail,
      [
        [0, 0, 0],
        [0.3, -0.04, -0.02],
        [0.52, 0.22, 0],
        [0.58, 0.6, 0.02],
        [0.47, 0.86, 0.04],
      ],
      0.06,
      fur,
    );
    orb(tail, 0.47, 0.88, 0.04, 0.075, 0.08, 0.075, "#7d87a2");
  } else if (kind === "pig") {
    const curl = [];
    for (let i = 0; i <= 18; i++) {
      const a = i * 0.62;
      curl.push([0.1 + i * 0.012 + Math.cos(a) * 0.07, 0.1 + Math.sin(a) * 0.07, -0.02 * i]);
    }
    line(tail, curl, 0.026, ear);
  } else if (kind === "panda") {
    orb(tail, 0.02, 0.02, -0.12, 0.12, 0.11, 0.1, fur);
  }
  if (tail.children.length) bake(tail);
  const head = group(root, 0, 1.9, 0.04),
    mask = group(head);
  orb(mask, 0, 0, 0, 0.76, 0.68, 0.6, fur);
  for (const s of [-1, 1]) {
    if (kind === "fox" || kind === "cat") {
      // Треугольные ушки: у кошки поменьше и ближе к макушке
      const cat = kind === "cat",
        shape = new T.ConeGeometry(cat ? 0.25 : 0.31, cat ? 0.46 : 0.65, 3);
      shape.rotateY(pie / 2);
      const outer = mesh(mask, shape, fur, s * (cat ? 0.42 : 0.48), cat ? 0.53 : 0.54, 0);
      outer.rotation.z = -s * (cat ? 0.3 : 0.24);
      const inside = mesh(mask, shape, ear, s * (cat ? 0.43 : 0.49), cat ? 0.55 : 0.57, 0.095);
      inside.rotation.z = outer.rotation.z;
      inside.scale.set(0.65, 0.65, 0.66);
    } else if (kind === "pig") {
      // Мягкие ушки торчат в стороны и свисают кончиком вперёд
      const flap = orb(mask, s * 0.4, 0.5, 0.12, 0.17, 0.25, 0.07, ear);
      flap.rotation.set(0.85, 0, -s * 0.75);
    } else {
      const h = kind === "bunny" ? 0.56 : 0.26,
        y = kind === "bunny" ? 0.73 : 0.5,
        outer = kind === "panda" ? ear : fur,
        inner = kind === "panda" ? "#5d4d57" : ear;
      orb(mask, s * 0.45, y, -0.01, 0.242, h, 0.18, outer).rotation.z = -s * 0.21;
      orb(
        mask,
        s * 0.46,
        y + 0.02,
        0.125,
        0.145,
        h * 0.7,
        0.08,
        inner,
      ).rotation.z = -s * 0.21;
    }
    if (kind === "panda") {
      // Тёмные пятна вокруг глаз, слегка опущены наружу
      orb(mask, s * 0.27, 0.07, 0.49, 0.15, 0.18, 0.085, "#5a4a54").rotation.z =
        s * 0.5;
    }
    orb(mask, s * 0.42, -0.11, 0.45, 0.125, 0.068, 0.058, "#ef9a8f");
    if (kind !== "pig")
      orb(mask, s * 0.13, -0.14, 0.53, 0.23, 0.16, 0.16, muzzle);
    if (kind === "cat")
      for (const dy of [-0.06, 0.03])
        line(
          mask,
          [
            [s * 0.27, -0.1, 0.6],
            [s * 0.45, -0.1 + dy, 0.56],
            [s * 0.62, -0.12 + dy * 1.6, 0.47],
          ],
          0.009,
          "#8b8399",
        );
  }
  // У поросёнка рот ниже пятачка и прямо на щеках, без белой мордочки
  const my = kind === "pig" ? -0.05 : 0,
    mz = kind === "pig" ? -0.1 : 0;
  line(
    mask,
    [
      [-0.12, -0.2 + my, 0.661 + mz],
      [-0.064, -0.249 + my, 0.675 + mz],
      [0, -0.202 + my, 0.68 + mz],
      [0.064, -0.249 + my, 0.675 + mz],
      [0.12, -0.2 + my, 0.661 + mz],
    ],
    0.013,
    cocoa,
  );
  for (const s of [-1, 1])
    line(
      mask,
      [
        [s * 0.18, 0.245, 0.528],
        [s * 0.252, 0.264, 0.53],
        [s * 0.332, 0.23, 0.5],
      ],
      0.024,
      brow,
    );
  if (kind === "pig") {
    // Пятачок с двумя дырочками
    const snout = disk(mask, 0, -0.09, 0.6, 0.17, 0.14, muzzle);
    snout.rotation.x = pie / 2;
    snout.scale.set(0.2, 0.14, 0.15);
    for (const s of [-1, 1])
      orb(mask, s * 0.06, -0.09, 0.672, 0.036, 0.052, 0.016, "#a8445f");
  } else orb(mask, 0, -0.06, 0.68, 0.102, 0.073, 0.061, nose);
  bake(mask);
  const eyes = group(head);
  for (const s of [-1, 1]) {
    orb(eyes, s * 0.276, 0.09, 0.538, 0.069, 0.094, 0.043, cocoa);
    orb(eyes, s * 0.276 - 0.017, 0.122, 0.578, 0.022, 0.027, 0.013, "#fffaf0");
  }
  bake(eyes);
  const dab = orb(head, 0.048, -0.047, 0.732, 0.065, 0.044, 0.022, "#ff9bb0");
  // Своя краска: капля на носу берёт цвет последнего шарика
  dab.material = dab.material.clone();
  const tongue = orb(head, 0.015, -0.22, 0.7, 0.048, 0.071, 0.019, "#e88b92");
  tongue.visible = dab.visible = false;
  return { root, head, eyes, dab, tongue, tail, ...pals[index] };
}
// Сердечко для гостя, которому принесли именно то, что он просил
const heartShape = new T.Shape();
heartShape.moveTo(0, 0.25);
heartShape.bezierCurveTo(0, 0.3, -0.05, 0.45, -0.25, 0.45);
heartShape.bezierCurveTo(-0.55, 0.45, -0.55, 0.1, -0.55, 0.1);
heartShape.bezierCurveTo(-0.55, -0.1, -0.35, -0.32, 0, -0.5);
heartShape.bezierCurveTo(0.35, -0.32, 0.55, -0.1, 0.55, 0.1);
heartShape.bezierCurveTo(0.55, 0.1, 0.55, 0.45, 0.25, 0.45);
heartShape.bezierCurveTo(0.1, 0.45, 0, 0.3, 0, 0.25);
const heartGeo = new T.ExtrudeGeometry(heartShape, {
  depth: 0.16,
  bevelEnabled: true,
  bevelSize: 0.07,
  bevelThickness: 0.07,
  bevelSegments: 3,
  curveSegments: 10,
});
heartGeo.center();
export function heart(p, color) {
  return mesh(p, heartGeo, color, 0, 0, 0);
}
export function puppy(p) {
  const g = group(p);
  orb(g, 0, 0.28, 0, 0.3, 0.31, 0.28, "#ffdeb1");
  orb(g, 0, 0.63, 0.03, 0.38, 0.31, 0.33, "#ffe3ba");
  for (const s of [-1, 1]) {
    orb(g, s * 0.32, 0.62, 0.035, 0.116, 0.255, 0.16, "#aa694e").rotation.z =
      s * 0.16;
    orb(g, s * 0.13, 0.69, 0.318, 0.039, 0.054, 0.029, cocoa);
    orb(g, s * 0.19, 0.09, 0.16, 0.13, 0.086, 0.14, "#ffe3ba");
  }
  orb(g, 0, 0.58, 0.37, 0.073, 0.055, 0.037, cocoa);
  orb(g, 0.32, 0.38, -0.13, 0.1, 0.22, 0.089, "#c48663").rotation.z = -0.65;
  return bake(g);
}
function tree(p, x, z, s, color) {
  const g = group(p, x, 0, z);
  g.scale.setScalar(s);
  disk(g, 0, 0.72, 0, 0.15, 1.44, "#b48b65");
  orb(g, 0, 1.98, 0, 0.85, 1.01, 0.76, color);
  orb(g, -0.52, 1.67, 0, 0.53, 0.59, 0.5, color);
  orb(g, 0.51, 1.78, 0, 0.53, 0.64, 0.5, color);
}
function flower(p, x, z, c) {
  const g = group(p, x, 0, z);
  disk(g, 0, 0.17, 0, 0.018, 0.34, "#54a477");
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * pie) / 5;
    orb(
      g,
      Math.cos(a) * 0.09,
      0.34 + Math.sin(a) * 0.09,
      0,
      0.068,
      0.069,
      0.04,
      c,
    );
  }
  orb(g, 0, 0.34, 0.042, 0.048, 0.047, 0.036, "#f9bd49");
}
const shade = painted(128, 128, (ctx) => {
  const grad = ctx.createRadialGradient(64, 64, 3, 64, 64, 63);
  grad.addColorStop(0, "rgba(87,59,56,.39)");
  grad.addColorStop(0.55, "rgba(87,59,56,.22)");
  grad.addColorStop(1, "rgba(87,59,56,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
});
shade.depthWrite = false;
export function shadow(p, x, z, w, d, y = 0.012) {
  const m = mesh(p, new T.PlaneGeometry(w, d), shade, x, y, z);
  m.rotation.x = -pie / 2;
  return m;
}
// Конфетные цвета парка: из них плитка, клумбы, флажки и шары
const candy = ["#ff6f96", "#ffc93c", "#38cfa9", "#5aa8ff", "#b47cff", "#ff8f4a"];
const pastel = ["#ffc4d6", "#ffe7a1", "#bdf0de", "#c6dcff", "#e3cdff", "#ffd2b5"];
// Леденец на палочке: спираль нарисована на круглой крышке диска
function swirl(a, b, c) {
  const material = painted(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = a;
      ctx.fillRect(0, 0, 256, 256);
      ctx.lineWidth = 17;
      ctx.lineCap = "round";
      for (const [color, shift] of [
        [b, 0],
        [c, pie],
      ]) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        for (let i = 0; i <= 160; i++) {
          const k = i / 160,
            ang = shift + k * pie * 7,
            r = 6 + k * 120;
          const x = 128 + Math.cos(ang) * r,
            y = 128 + Math.sin(ang) * r;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    },
    true,
  );
  return new T.MeshPhysicalMaterial({
    map: material.map,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
}
function lollipop(p, x, z, h, look) {
  const g = group(p, x, 0, z);
  disk(g, 0, h / 2, 0, 0.06, h, "#fff7ec");
  const head = mesh(g, tube, look, 0, h + 0.55, 0);
  head.scale.set(0.62, 0.16, 0.62);
  head.rotation.x = pie / 2;
  return g;
}
export function scenery(p) {
  const g = group(p);
  box(g, 0, -0.19, -4, 100, 0.35, 29, "#a6df7c", 0.02);
  box(g, 0, -0.075, 0.2, 100, 0.15, 4.8, "#f7d8a6", 0.02);
  box(g, 0, -0.077, 5.1, 100, 0.15, 5.0, "#fff4e6", 0.02);
  // Мозаика всех цветов радуги у переднего края сцены
  for (let i = -8; i <= 8; i++)
    for (let j = 0; j < 4; j++)
      box(
        g,
        i * 1.3 + (j % 2) * 0.65,
        0.004,
        3.2 + j * 1.25,
        1.18,
        0.012,
        1.12,
        pastel[(i + j * 2 + 24) % pastel.length],
        0.03,
      );
  // Дальние холмы разных конфетных цветов, туман делает их нежнее
  const hills = ["#86d8a4", "#b8a3f5", "#ffaecb", "#8fd3f7", "#ffd27f", "#9be6c2"];
  for (let i = -8; i < 9; i++) {
    const x = i * 2.1;
    orb(
      g,
      x,
      0,
      -12 - (i % 3),
      3.1,
      1.8 + Math.cos(i * 4) * 0.7,
      2.1,
      hills[(i + 16) % hills.length],
    );
    if (i % 2 === 0)
      tree(
        g,
        x + 0.45,
        -6 + Math.sin(i * 3) * 0.7,
        1 + Math.cos(i) * 0.27,
        ["#55c78f", "#ff9cc6", "#9bdc5f", "#6fd2c0"][(i + 8) % 4],
      );
  }
  for (const [x, z, s, c] of [
    [-6.3, -1.9, 1.22, "#5cc48a"],
    [5.9, -2.4, 1.29, "#ff9ec8"],
    [8, -0.7, 1.02, "#8fd65f"],
    [-8, 0.1, 0.9, "#ffb3d4"],
  ])
    tree(g, x, z, s, c);
  // Забор в цветную полоску
  for (let i = -14; i <= 14; i++)
    box(g, i * 0.65, 0.49, -3.45, 0.16, 0.94, 0.12, i % 3 ? "#fff3d4" : pastel[(i + 15) % 6], 0.075);
  for (const y of [0.3, 0.65])
    box(g, 0, y, -3.5, 20, 0.1, 0.1, "#f8dcb0", 0.035);
  for (let i = -13; i <= 14; i++)
    if (i < -6 || i > 6)
      flower(g, i * 0.64, -0.56 + Math.sin(i) * 0.74, candy[(i + 13) % candy.length]);
  // Клумбы у забора
  for (let i = -15; i <= 15; i++)
    flower(g, i * 0.6 + 0.3, -3.05 + Math.sin(i * 1.7) * 0.12, candy[(i + 30) % candy.length]);
  // Карамельная радуга над деревьями
  for (const [i, c] of [
    "#ff6f8e",
    "#ffa35c",
    "#ffd84d",
    "#5fd6a0",
    "#5bb8f5",
    "#a98bff",
  ].entries()) {
    const band = mesh(
      g,
      new T.TorusGeometry(3.75 - i * 0.15, 0.094, 8, 66, pie),
      c,
      5.2,
      -0.12,
      -9,
    );
    band.rotation.y = -0.1;
  }
  // Гирлянда флажков над окошком на двух полосатых столбиках
  for (const x of [-5.3, 5.6]) {
    disk(g, x, 1.76, -2.6, 0.057, 3.52, "#ffe2b8");
    for (let k = 0; k < 6; k++)
      disk(g, x, 0.3 + k * 0.58, -2.6, 0.062, 0.22, candy[k]);
    orb(g, x, 3.57, -2.6, 0.12, 0.12, 0.12, "#ffd23f");
  }
  const rope = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22,
      x = -5.3 + 10.9 * t,
      y = 3.55 - 0.85 * Math.sin(pie * t);
    rope.push([x, y, -2.6]);
    if (i % 2) {
      const flag = mesh(
        g,
        new T.ConeGeometry(0.19, 0.37, 3),
        candy[(i >> 1) % candy.length],
        x,
        y - 0.17,
        -2.6,
      );
      flag.rotation.set(0, pie / 2, pie);
    }
  }
  line(g, rope, 0.018, "#b88e66");
  // Огромные леденцы за забором
  for (const [x, z, h, look] of [
    [-4.4, -4.6, 2.3, swirl("#fff4f7", "#ff5f8a", "#ffb3c8")],
    [5.3, -5.2, 2.7, swirl("#fffbea", "#5aa8ff", "#ffc93c")],
    [7.9, -4.3, 2.0, swirl("#f4fff9", "#38cfa9", "#b47cff")],
    [-8.6, -4.4, 2.6, swirl("#fff7ef", "#ff8f4a", "#ffd84d")],
  ])
    lollipop(g, x, z, h, look);
  bake(g);
  shadow(p, -1.9, -0.13, 6.3, 2.8);
  shadow(p, 2.65, 0.68, 2.7, 1.7);
}
// Облака плывут по небу, park.js двигает их по кругу
export function clouds(p) {
  return [
    [-6, 3.3, -10, 1.2],
    [1, 3.1, -11, 0.85],
    [7.8, 3, -10, 0.8],
    [-11, 2.9, -9, 0.6],
    [12, 3.4, -11, 1],
  ].map(([x, y, z, s]) => {
    const cloud = group(p, x, y, z);
    cloud.scale.setScalar(s);
    orb(cloud, 0, 0, 0, 0.99, 0.22, 0.34, "#ffffff");
    orb(cloud, -0.21, 0.15, 0, 0.4, 0.3, 0.32, "#ffffff");
    orb(cloud, 0.23, 0.12, 0, 0.36, 0.24, 0.29, "#ffffff");
    bake(cloud);
    cloud.traverse((m) => (m.castShadow = false));
    return cloud;
  });
}
// Связка воздушных шаров, привязанная к заднему углу крыши фургона
export function balloons(p) {
  const root = group(p, 0.17, 2.95, -1.47);
  glossy(() => {
    const tops = [
      [-0.55, 1.35, 0.1],
      [0.1, 1.65, -0.15],
      [0.65, 1.3, 0.05],
      [-0.2, 1.05, 0.35],
      [0.35, 0.95, 0.4],
      [-0.75, 0.85, -0.2],
    ];
    tops.forEach(([x, y, z], i) => {
      orb(root, x, y, z, 0.3, 0.37, 0.3, candy[i]);
      // Узелок внизу шарика
      orb(root, x, y - 0.38, z, 0.05, 0.05, 0.05, candy[i]);
      line(root, [[0, 0, 0], [x * 0.4, y * 0.45, z * 0.4], [x, y - 0.4, z]], 0.007, "#fffaf2");
    });
  });
  bake(root);
  return root;
}
// Бабочка: тельце и два крылышка, park.js машет крыльями и водит её над цветами
const wingShape = new T.Shape();
wingShape.moveTo(0, 0);
wingShape.bezierCurveTo(0.08, 0.32, 0.42, 0.36, 0.4, 0.1);
wingShape.bezierCurveTo(0.42, -0.08, 0.3, -0.12, 0.22, -0.06);
wingShape.bezierCurveTo(0.3, -0.3, 0.06, -0.34, 0, -0.05);
const wingGeo = new T.ShapeGeometry(wingShape, 10);
export function butterfly(p, color) {
  const root = group(p);
  const look = new T.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    side: T.DoubleSide,
    iridescence: 0.6,
    sheen: 0.5,
  });
  orb(root, 0, 0, 0, 0.026, 0.026, 0.075, "#5b3f5e");
  const wings = [-1, 1].map((s) => {
    const hinge = group(root);
    const w = new T.Mesh(wingGeo, look);
    w.rotation.x = -pie / 2;
    w.scale.set(s * 0.55, 0.55, 0.55);
    hinge.add(w);
    return hinge;
  });
  root.traverse((m) => (m.castShadow = false));
  return { root, wings };
}
export function stand(p, x, z) {
  return glossy(() => standParts(p, x, z));
}
function standParts(p, x, z) {
  const g = group(p, x, 0, z);
  disk(g, 0, 0.1, 0, 0.95, 0.2, "#dc8794");
  disk(g, 0, 0.215, 0, 0.91, 0.1, "#fff1cf");
  disk(g, 0, 0.29, 0, 0.84, 0.073, "#79d0c1");
  disk(g, 0, 0.4, 0, 0.36, 0.19, "#f4ba62");
  disk(g, 0, 0.51, 0, 0.31, 0.1, "#ffd895");
  shadow(p, x, z, 2.4, 2.05);
  return bake(g);
}
