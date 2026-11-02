import * as T from "../vendor/three/three.module.min.js?v=a2db44a6";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=a2db44a6";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js?v=a2db44a6";

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
// Покупатели. Модели те же, что в «Пломбирчике»: порядок pals совпадает с customers в game.js.
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

// =====================================================
// ТОВАРЫ. У каждого: название, цена в рублях и модель высотой около 0,4.
// Начало координат модели — середина дна, чтобы товар ровно стоял на ленте.
// =====================================================
const coneGeo = new T.ConeGeometry(1, 1, 18);
const prism = new T.CylinderGeometry(1, 1, 1, 3);
prism.rotateZ(pie / 2);
prism.rotateX(-pie / 2);
function cone(p, x, y, z, r, h, c) {
  const m = mesh(p, coneGeo, c, x, y, z);
  m.scale.set(r, h, r);
  return m;
}
// Клетчатая крышка у варенья
const gingham = painted(
  64,
  64,
  (ctx) => {
    ctx.fillStyle = "#fff6ee";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(226,58,84,.75)";
    for (let i = 0; i < 64; i += 16) {
      ctx.fillRect(i, 0, 8, 64);
      ctx.fillRect(0, i, 64, 8);
    }
  },
  true,
);
const build = {
  apple(g) {
    glossy(() => orb(g, 0, 0.2, 0, 0.21, 0.2, 0.21, "#ef3b3b"));
    orb(g, -0.07, 0.29, 0.13, 0.05, 0.035, 0.03, "#ff9a8a");
    line(g, [[0, 0.36, 0], [0.01, 0.43, 0], [0.04, 0.47, 0]], 0.014, "#7a4b2e");
    orb(g, 0.07, 0.44, 0, 0.07, 0.022, 0.04, "#4fb05a").rotation.z = 0.5;
  },
  pear(g) {
    glossy(() => {
      orb(g, 0, 0.16, 0, 0.17, 0.16, 0.17, "#c9dc4f");
      orb(g, 0, 0.32, 0, 0.11, 0.14, 0.11, "#c9dc4f");
    });
    line(g, [[0, 0.44, 0], [0.02, 0.51, 0]], 0.013, "#7a4b2e");
    orb(g, 0.06, 0.5, 0, 0.06, 0.02, 0.035, "#4fb05a").rotation.z = 0.6;
  },
  carrot(g) {
    const body = cone(g, 0, 0.1, 0, 0.1, 0.48, "#ff8a1f");
    body.rotation.z = pie / 2;
    for (const a of [-0.5, 0, 0.5])
      orb(g, -0.28, 0.12 + a * 0.06, a * 0.05, 0.1, 0.03, 0.03, "#45b35a").rotation.z = a;
  },
  milk(g) {
    box(g, 0, 0.18, 0, 0.26, 0.36, 0.26, "#f7fbff", 0.03);
    box(g, 0, 0.17, 0, 0.27, 0.15, 0.27, "#3d9bff", 0.02);
    const roof = mesh(g, prism, "#f7fbff", 0, 0.435, 0);
    roof.scale.set(0.26, 0.15, 0.15);
    box(g, 0, 0.52, 0, 0.27, 0.035, 0.035, "#3d9bff", 0.01);
    orb(g, 0, 0.17, 0.14, 0.05, 0.065, 0.02, "#ffffff");
  },
  bread(g) {
    orb(g, 0, 0.13, 0, 0.36, 0.13, 0.15, "#e8a24f");
    for (const x of [-0.16, 0, 0.16]) {
      const cut = box(g, x, 0.25, 0, 0.04, 0.02, 0.16, "#b66d2c", 0.01);
      cut.rotation.y = 0.6;
    }
  },
  cheese(g) {
    const wedge = new T.CylinderGeometry(0.26, 0.26, 0.17, 24, 1, false, 0, pie / 3);
    mesh(g, wedge, "#ffd23f", 0, 0.085, -0.1);
    for (const [x, y, z, r] of [
      [0.04, 0.09, 0.05, 0.03],
      [0.11, 0.06, 0.02, 0.022],
      [0.07, 0.13, 0.1, 0.02],
    ])
      orb(g, x, y, z + 0.05, r, r, 0.01, "#e5a91f");
  },
  honey(g) {
    glossy(() => {
      disk(g, 0, 0.15, 0, 0.14, 0.28, "#f2a020");
      disk(g, 0, 0.32, 0, 0.12, 0.06, "#8a5a33");
    });
    disk(g, 0, 0.15, 0, 0.145, 0.12, "#fff2c4");
    orb(g, 0, 0.15, 0.145, 0.05, 0.045, 0.01, "#f2a020");
  },
  jam(g) {
    glossy(() => disk(g, 0, 0.14, 0, 0.13, 0.26, "#d62d4f"));
    disk(g, 0, 0.14, 0, 0.135, 0.1, "#fff3e6");
    orb(g, -0.02, 0.14, 0.135, 0.028, 0.028, 0.01, "#d62d4f");
    orb(g, 0.025, 0.145, 0.135, 0.028, 0.028, 0.01, "#d62d4f");
    disk(g, 0, 0.3, 0, 0.15, 0.05, gingham);
  },
  banana(g) {
    glossy(() =>
      line(
        g,
        [
          [-0.22, 0.2, 0],
          [-0.12, 0.08, 0],
          [0.05, 0.06, 0],
          [0.2, 0.14, 0],
          [0.25, 0.22, 0],
        ],
        0.055,
        "#ffd629",
      ),
    );
    orb(g, -0.22, 0.21, 0, 0.03, 0.03, 0.03, "#6b4a2b");
    orb(g, 0.255, 0.235, 0, 0.025, 0.025, 0.025, "#6b4a2b");
  },
  fish(g) {
    glossy(() => {
      orb(g, 0, 0.12, 0, 0.27, 0.12, 0.08, "#6fb4e8");
      const tail = cone(g, -0.31, 0.12, 0, 0.1, 0.14, "#4f95d6");
      tail.rotation.z = -pie / 2;
      tail.scale.z = 0.03;
    });
    orb(g, 0.02, 0.07, 0.01, 0.2, 0.05, 0.07, "#e9f4ff");
    orb(g, 0.17, 0.15, 0.07, 0.025, 0.025, 0.012, "#2b2240");
  },
  cabbage(g) {
    orb(g, 0, 0.2, 0, 0.2, 0.19, 0.2, "#b8e67a");
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * pie * 2;
      orb(g, Math.cos(a) * 0.1, 0.17, Math.sin(a) * 0.1, 0.16, 0.15, 0.06, "#8ccf55").rotation.y = -a;
    }
  },
  mushroom(g) {
    disk(g, 0, 0.12, 0, 0.07, 0.24, "#fff4e0");
    glossy(() => orb(g, 0, 0.27, 0, 0.2, 0.13, 0.2, "#ef3b3b"));
    for (const [x, z] of [
      [0, 0.12],
      [0.11, 0.06],
      [-0.1, 0.07],
      [0.05, -0.05],
      [-0.06, -0.08],
    ])
      orb(g, x, 0.34 - Math.hypot(x, z) * 0.45, z + 0.04, 0.03, 0.02, 0.03, "#ffffff");
  },
  eggs(g) {
    box(g, 0, 0.05, 0, 0.36, 0.1, 0.22, "#c9b79c", 0.03);
    for (const x of [-0.11, 0, 0.11])
      for (const z of [-0.05, 0.05]) orb(g, x, 0.13, z, 0.05, 0.065, 0.05, "#fff8ef");
  },
  juice(g) {
    glossy(() => {
      disk(g, 0, 0.16, 0, 0.09, 0.32, "#ff8c1a");
      disk(g, 0, 0.36, 0, 0.045, 0.08, "#ff8c1a");
      disk(g, 0, 0.41, 0, 0.05, 0.04, "#3fbf6a");
    });
    disk(g, 0, 0.16, 0, 0.093, 0.12, "#fff4d6");
    orb(g, 0, 0.16, 0.09, 0.035, 0.035, 0.01, "#ff8c1a");
  },
};
export const goods = {
  carrot: { name: "Морковка", price: 1 },
  apple: { name: "Яблоко", price: 2 },
  pear: { name: "Груша", price: 2 },
  banana: { name: "Банан", price: 2 },
  cabbage: { name: "Капуста", price: 2 },
  mushroom: { name: "Грибок", price: 2 },
  bread: { name: "Батон", price: 3 },
  eggs: { name: "Яйца", price: 3 },
  juice: { name: "Сок", price: 3 },
  milk: { name: "Молоко", price: 4 },
  cheese: { name: "Сыр", price: 4 },
  fish: { name: "Рыбка", price: 4 },
  honey: { name: "Мёд", price: 5 },
  jam: { name: "Варенье", price: 5 },
};
export function product(p, id, bakeIt = true) {
  const g = group(p);
  build[id](g);
  return bakeIt ? bake(g) : g;
}

// =====================================================
// МАГАЗИН. Прилавок вдоль оси x, покупатель за ним (z < 0), камера у кассира.
// =====================================================
export const spots = {
  belt: { from: -3.35, to: -1.05, z: 1.1, y: 1.12 },
  scanner: new T.Vector3(-0.45, 1.12, 1.1),
  tray: [
    [0.2, 0.9],
    [0.7, 0.9],
    [1.2, 0.9],
    [0.45, 1.38],
    [0.95, 1.38],
  ],
  bag: new T.Vector3(1.95, 1.06, 1.05),
  terminal: new T.Vector3(0.95, 1.06, 0.48),
  dish: new T.Vector3(2.65, 1.06, 0.5),
  register: new T.Vector3(3.15, 1.06, 0.95),
  customer: new T.Vector3(0.45, 0, -0.6),
};
function texture(w, h, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Лента транспортёра: полоски, park двигает текстуру
export const beltTexture = texture(128, 32, (ctx) => {
  ctx.fillStyle = "#3a4650";
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = "#4b5a66";
  for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 6, 32);
});
beltTexture.wrapS = T.RepeatWrapping;
beltTexture.repeat.set(6, 1);
const leafGreens = ["#3fae5b", "#64c56c", "#2f8f55", "#8fd65f"];
function leaf(p, x, y, z, s, c, a = 0) {
  const l = orb(p, x, y, z, 0.16 * s, 0.07 * s, 0.035 * s, c);
  l.rotation.z = a;
  return l;
}
function plant(p, x, z, s) {
  const g = group(p, x, 0, z);
  g.scale.setScalar(s);
  glossy(() => disk(g, 0, 0.3, 0, 0.32, 0.6, "#ff7a5c"));
  disk(g, 0, 0.6, 0, 0.3, 0.04, "#6b4a2b");
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * pie * 2,
      h = 0.9 + (i % 3) * 0.3;
    line(g, [[0, 0.6, 0], [Math.cos(a) * 0.2, h - 0.1, Math.sin(a) * 0.2], [Math.cos(a) * 0.45, h, Math.sin(a) * 0.45]], 0.02, "#3c8f4e");
    const l = orb(g, Math.cos(a) * 0.5, h + 0.02, Math.sin(a) * 0.5, 0.28, 0.06, 0.16, leafGreens[i % 4]);
    l.rotation.y = -a;
    l.rotation.z = 0.3;
  }
}
function lamp(p, x, y, z) {
  const g = group(p, x, y, z);
  line(g, [[0, 0, 0], [0, 1.4, 0]], 0.012, "#5b4a3c");
  glossy(() => {
    const shade = cone(g, 0, -0.05, 0, 0.42, 0.36, "#2f8a5f");
    shade.rotation.x = 0;
  });
  const bulb = mesh(g, ball, new T.MeshStandardMaterial({ color: "#fff3c4", emissive: "#ffd36b", emissiveIntensity: 1.4 }), 0, -0.24, 0);
  bulb.scale.setScalar(0.13);
}
export function shop(p) {
  const g = group(p);
  // Пол в крупную клетку
  const floorLook = new T.MeshStandardMaterial({
    roughness: 0.6,
    map: texture(128, 128, (ctx) => {
      ctx.fillStyle = "#ffe9cf";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "#ffd3b0";
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillRect(64, 64, 64, 64);
    }),
  });
  floorLook.map.wrapS = floorLook.map.wrapT = T.RepeatWrapping;
  floorLook.map.repeat.set(12, 8);
  const floor = mesh(g, new T.PlaneGeometry(26, 18), floorLook, 0, 0, 2);
  floor.rotation.x = -pie / 2;
  // Задняя стена в листиках
  const wallLook = new T.MeshStandardMaterial({
    roughness: 0.85,
    map: texture(256, 256, (ctx) => {
      ctx.fillStyle = "#c9f0dc";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#b3e6cc";
      for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 32, 256);
      for (let i = 0; i < 9; i++) {
        const x = (i * 97) % 256,
          y = (i * 61) % 256;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(i);
        ctx.fillStyle = ["#8fd6a9", "#a6e3b8", "#ffd9a8"][i % 3];
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 7, 0, 0, pie * 2);
        ctx.fill();
        ctx.restore();
      }
    }),
  });
  wallLook.map.wrapS = wallLook.map.wrapT = T.RepeatWrapping;
  wallLook.map.repeat.set(6, 2.4);
  mesh(g, new T.PlaneGeometry(26, 10), wallLook, 0, 5, -3.6);
  // Деревянный плинтус и полка-карниз
  box(g, 0, 0.15, -3.55, 26, 0.3, 0.1, "#d99a5b", 0.03);
  // Вывеска «Лавка Листик»
  const sign = group(g, 0.4, 3.55, -3.45);
  glossy(() => box(sign, 0, 0, 0, 3.6, 0.95, 0.16, "#2f8a5f", 0.2));
  mesh(
    sign,
    new T.PlaneGeometry(3.4, 0.82),
    new T.MeshBasicMaterial({
      transparent: true,
      map: texture(1024, 248, (ctx) => {
        ctx.fillStyle = "#fff6e0";
        ctx.font = '900 150px "Avenir Next", system-ui';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Лавка Листик", 560, 132, 820);
        ctx.fillStyle = "#9be06a";
        ctx.beginPath();
        ctx.ellipse(86, 124, 52, 26, -0.7, 0, pie * 2);
        ctx.fill();
        ctx.strokeStyle = "#2f8a5f";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(52, 160);
        ctx.lineTo(118, 90);
        ctx.stroke();
      }),
    }),
    0,
    0,
    0.085,
  );
  // Полки слева и справа, на них товары всех цветов
  const ids = Object.keys(goods);
  let k = 0;
  for (const side of [-1, 1]) {
    const x0 = side * 4.3;
    box(g, x0, 1.55, -3.3, 3.6, 3.1, 0.5, "#e8b07a", 0.05);
    box(g, x0, 1.55, -3.06, 3.3, 2.8, 0.06, "#fff3e2", 0.02);
    // Полосатый козырёк над полками, как навес у старой лавки
    for (let i = 0; i < 9; i++)
      box(g, x0 - 1.6 + i * 0.4, 3.2, -3.0, 0.4, 0.22, 0.5, i % 2 ? "#fff3d6" : "#ff9a3c", 0.06);
    for (const y of [0.5, 1.35, 2.2]) {
      box(g, x0, y, -2.95, 3.4, 0.08, 0.62, "#c98a4f", 0.02);
      for (let i = 0; i < 6; i++) {
        const item = product(g, ids[k++ % ids.length], false);
        item.position.set(x0 - 1.4 + i * 0.56, y + 0.04, -2.85);
        item.scale.setScalar(0.95);
        item.rotation.y = (i % 2 ? 0.3 : -0.2) * side;
      }
    }
  }
  // Корзинки у входа и растения по краям
  plant(g, -6.2, 0.4, 1.3);
  plant(g, 6.3, 0.2, 1.2);
  // Гирлянда из листьев и цветов под потолком
  const rope = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30,
      x = -7 + 14 * t,
      y = 4.75 - 0.55 * Math.sin(pie * t * 2) ** 2;
    rope.push([x, y, -2.4]);
    if (i % 2) leaf(g, x, y - 0.1, -2.4, 1.3, leafGreens[(i >> 1) % 4], 0.8 + (i % 3) * 0.6);
    else if (i % 6 === 0) orb(g, x, y - 0.06, -2.35, 0.09, 0.09, 0.06, ["#ff6f96", "#ffc93c", "#b47cff"][(i / 6) % 3]);
  }
  line(g, rope, 0.015, "#7b5a3a");
  bake(g);
  // Лампы по бокам, чтобы не закрывать вывеску
  for (const x of [-3.1, 3.9]) lamp(p, x, 4.25, -0.6);
  return g;
}
// Прилавок кассы: лента, сканер, лоток для покупок
export function counter(p) {
  const g = group(p);
  glossy(() => {
    box(g, 0.1, 0.52, 1.1, 7.6, 1.04, 1.3, "#f0a95b", 0.08);
    box(g, 0.1, 1.04, 1.1, 7.7, 0.06, 1.4, "#fff3e2", 0.03);
    // Зелёная полоса и листики на передней стенке
    box(g, 0.1, 0.62, 1.76, 7.6, 0.16, 0.04, "#2f8a5f", 0.02);
  });
  for (let i = 0; i < 8; i++) leaf(g, -3.3 + i * 0.95, 0.35, 1.78, 1.4, leafGreens[i % 4], i % 2 ? 0.5 : -0.5);
  // Корпус транспортёра и ролики
  box(g, -2.2, 1.09, 1.1, 2.6, 0.06, 0.86, "#cfd8de", 0.02);
  for (const x of [-3.45, -0.95]) {
    const roller = disk(g, x, 1.11, 1.1, 0.05, 0.78, "#9aa7b1");
    roller.rotation.x = pie / 2;
  }
  // Сканер: стекло в столешнице и стойка со стеклом за ним
  box(g, -0.45, 1.075, 1.1, 0.72, 0.03, 0.62, "#26343c", 0.02);
  glossy(() => box(g, -0.45, 1.33, 0.68, 0.72, 0.56, 0.14, "#2f3d46", 0.05));
  box(g, -0.45, 1.33, 0.75, 0.56, 0.4, 0.02, "#1f2a31", 0.02);
  // Лоток для пробитых покупок
  box(g, 0.7, 1.08, 1.12, 1.55, 0.03, 1.0, "#ffe6c4", 0.02);
  bake(g);
  // Бегущая лента — отдельно, её текстура движется
  const belt = mesh(p, new T.PlaneGeometry(2.4, 0.74), new T.MeshStandardMaterial({ map: beltTexture, roughness: 0.7 }), -2.2, 1.125, 1.1);
  belt.rotation.x = -pie / 2;
  // Красный луч сканера
  const laser = new T.MeshBasicMaterial({ color: "#ff2b4a", transparent: true, opacity: 0.85 });
  const beams = group(p, -0.45, 1.095, 1.1);
  for (const r of [0.5, -0.5]) {
    const b = mesh(beams, new T.PlaneGeometry(0.62, 0.025), laser, 0, 0, 0);
    b.rotation.set(-pie / 2, 0, r);
  }
  const face = mesh(p, new T.PlaneGeometry(0.5, 0.06), laser, -0.45, 1.33, 0.765);
  return { belt, laser, beams, face };
}
// Касса: экран с суммой, принтер чеков и ящик с монетами
export function register(p) {
  const g = group(p, spots.register.x, spots.register.y, spots.register.z);
  glossy(() => {
    box(g, 0, 0.18, 0, 0.95, 0.36, 0.8, "#2f8a5f", 0.08);
    box(g, 0, 0.66, -0.2, 0.12, 0.62, 0.12, "#2f8a5f", 0.04);
    // Большой экран с суммой, повёрнут к кассиру
    box(g, 0, 1.12, -0.14, 1.2, 0.74, 0.12, "#246f4c", 0.08);
    // Принтер справа сверху
    box(g, 0.3, 0.42, 0.12, 0.34, 0.14, 0.4, "#f4efe6", 0.05);
  });
  box(g, 0.3, 0.495, 0.12, 0.26, 0.012, 0.03, "#2a2a2a", 0.004);
  // Кнопки
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) box(g, -0.3 + i * 0.13, 0.37, 0.05 + j * 0.11, 0.1, 0.03, 0.08, ["#fff3e2", "#ffd84d", "#ff8f6a"][(i + j) % 3], 0.02);
  bake(g);
  // Экран: на нём рисует park.js
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 512;
  screenCanvas.height = 300;
  const screenTex = new T.CanvasTexture(screenCanvas);
  screenTex.colorSpace = T.SRGBColorSpace;
  const screen = mesh(g, new T.PlaneGeometry(1.08, 0.63), new T.MeshBasicMaterial({ map: screenTex }), 0, 1.12, -0.075);
  // Ящик для денег выезжает к кассиру
  const drawer = group(g, -0.05, 0.02, 0.2);
  box(drawer, 0, 0, 0, 0.82, 0.14, 0.6, "#246f4c", 0.03);
  box(drawer, 0, 0.06, 0, 0.74, 0.04, 0.52, "#1d1d22", 0.01);
  for (let i = 0; i < 4; i++) {
    const coins = group(drawer, -0.27 + i * 0.18, 0.08, 0.02);
    for (let c = 0; c < 4; c++) coin(coins).position.y = c * 0.025;
  }
  bake(drawer);
  return { group: g, screenCanvas, screenTex, drawer };
}
const coinLook = new T.MeshPhysicalMaterial({ color: "#f5c33b", roughness: 0.25, metalness: 0.75, clearcoat: 0.6 });
export function coin(p) {
  const c = disk(p, 0, 0, 0, 0.07, 0.022, coinLook);
  return c;
}
// Купюра с номиналом
export function banknote(p, value) {
  const color = { 5: "#7fc8ff", 10: "#7fdc8f", 20: "#ffb36b" }[value];
  const note = mesh(
    p,
    new T.BoxGeometry(0.5, 0.012, 0.26),
    new T.MeshStandardMaterial({
      roughness: 0.6,
      map: texture(256, 132, (ctx) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 256, 132);
        ctx.strokeStyle = "rgba(255,255,255,.7)";
        ctx.lineWidth = 6;
        ctx.strokeRect(10, 10, 236, 112);
        ctx.fillStyle = "#24453a";
        ctx.font = '900 76px "Avenir Next", system-ui';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value + " ₽", 128, 70);
      }),
    }),
    0,
    0,
    0,
  );
  return note;
}
// Терминал для карты: экран рисует park.js
export function terminal(p) {
  const g = group(p, spots.terminal.x, spots.terminal.y, spots.terminal.z);
  g.rotation.y = 0.15;
  g.scale.setScalar(1.35);
  const body = group(g);
  glossy(() => box(body, 0, 0.16, 0, 0.32, 0.12, 0.5, "#37414a", 0.05));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) box(body, -0.08 + i * 0.08, 0.225, 0.08 + j * 0.06, 0.055, 0.015, 0.04, "#d8dee3", 0.01);
  body.rotation.x = -0.35;
  bake(body);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  const screen = mesh(body, new T.PlaneGeometry(0.26, 0.16), new T.MeshBasicMaterial({ map: tex }), 0, 0.225, -0.11);
  screen.rotation.x = -pie / 2;
  return { group: g, canvas, tex };
}
// Карта покупателя
export function card(p) {
  const c = mesh(
    p,
    new T.BoxGeometry(0.34, 0.012, 0.22),
    new T.MeshPhysicalMaterial({
      roughness: 0.3,
      clearcoat: 1,
      map: texture(256, 166, (ctx) => {
        const grad = ctx.createLinearGradient(0, 0, 256, 166);
        grad.addColorStop(0, "#3fbf7f");
        grad.addColorStop(1, "#2a7fd4");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 166);
        ctx.fillStyle = "#ffd84d";
        ctx.fillRect(26, 60, 46, 36);
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = '800 26px "Avenir Next", system-ui';
        ctx.fillText("ЛЕСБАНК", 26, 40);
        ctx.beginPath();
        ctx.ellipse(205, 120, 30, 14, -0.7, 0, pie * 2);
        ctx.fillStyle = "#9be06a";
        ctx.fill();
      }),
    }),
    0,
    0,
    0,
  );
  return c;
}
// Бумажный пакет с листиком; покупки складываются внутрь
export function bag(p) {
  const g = group(p, spots.bag.x, spots.bag.y, spots.bag.z);
  const shell = group(g);
  box(shell, 0, 0.32, 0, 0.62, 0.64, 0.42, "#d9a564", 0.03);
  box(shell, 0, 0.62, 0, 0.6, 0.06, 0.4, "#c48a4a", 0.02);
  leaf(shell, 0, 0.34, 0.215, 1.3, "#2f8a5f", 0.7);
  for (const s of [-1, 1]) line(shell, [[s * 0.18, 0.62, 0.12], [s * 0.12, 0.85, 0.12], [-s * 0.0, 0.9, 0.12]], 0.012, "#a8713a");
  bake(shell);
  const inside = group(g, 0, 0.3, 0);
  return { group: g, inside };
}
// Чек: полоска бумаги, которая выползает из принтера
export function receipt(p, lines, total) {
  const tex = texture(256, 512, (ctx) => {
    ctx.fillStyle = "#fffdf6";
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = "#2f8a5f";
    ctx.font = '900 30px "Avenir Next", system-ui';
    ctx.textAlign = "center";
    ctx.fillText("ЛАВКА ЛИСТИК", 128, 52);
    ctx.strokeStyle = "#c9c2b4";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(16, 74);
    ctx.lineTo(240, 74);
    ctx.stroke();
    ctx.font = '700 24px "Avenir Next", system-ui';
    ctx.fillStyle = "#3b3a36";
    lines.slice(0, 6).forEach(([name, price], i) => {
      ctx.textAlign = "left";
      ctx.fillText(name, 18, 112 + i * 40);
      ctx.textAlign = "right";
      ctx.fillText(price + " ₽", 238, 112 + i * 40);
    });
    ctx.beginPath();
    ctx.moveTo(16, 372);
    ctx.lineTo(240, 372);
    ctx.stroke();
    ctx.font = '900 34px "Avenir Next", system-ui';
    ctx.textAlign = "left";
    ctx.fillText("Итого", 18, 418);
    ctx.textAlign = "right";
    ctx.fillText(total + " ₽", 238, 418);
    ctx.textAlign = "center";
    ctx.font = '700 22px "Avenir Next", system-ui';
    ctx.fillStyle = "#2f8a5f";
    ctx.fillText("Спасибо за покупку!", 128, 470);
  });
  tex.repeat.y = 0;
  const geo = new T.PlaneGeometry(0.3, 0.6);
  geo.translate(0, 0.3, 0);
  const paper = mesh(p, geo, new T.MeshStandardMaterial({ map: tex, roughness: 0.8, side: T.DoubleSide }), 0, 0, 0);
  return { paper, tex };
}
// Светящееся кольцо-подсказка под тем, чего нужно коснуться
export function glow(p) {
  const ring = new T.Mesh(
    new T.RingGeometry(0.28, 0.36, 40),
    new T.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide }),
  );
  ring.rotation.x = -pie / 2;
  ring.renderOrder = 5;
  p.add(ring);
  return ring;
}
