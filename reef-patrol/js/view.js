import * as T from "../vendor/three/three.module.min.js?v=f98bc4f8";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=f98bc4f8";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=f98bc4f8";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=f98bc4f8";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=f98bc4f8";
import { GEO, enamel, glow, mesh, submarine, enemyModels, pearl, fishGeometry, capsule, torpedo, POWER_COLOR } from "./models.js?v=f98bc4f8";
import { PULSE_RADIUS } from "./rules.js?v=f98bc4f8";

const TAU = Math.PI * 2;
const PLANE = new T.Plane(new T.Vector3(0, 1, 0), -1.4);
// Оформление глубин: вода, туман, свет, дно, планктон и стайки рыб. Номер темы — depth.theme в rules.js.
const THEMES = [
  { bg: "#5eb7c3", fog: "#6fbccf", floor: "#8eced1", sky: "#ccf7ed", ground: "#286591", hemi: 1.78, key: "#fff0cc", keyPower: 3.0, rim: "#80dfff", rimPower: 2.15, motes: "#d4fbef", fish: "#ffb37a" },
  { bg: "#6d7fc4", fog: "#7f8fd0", floor: "#a9a6e0", sky: "#dcd6ff", ground: "#3a3f8f", hemi: 1.7, key: "#ffe1f0", keyPower: 2.7, rim: "#9fb4ff", rimPower: 2.2, motes: "#e6dcff", fish: "#ffd36b" },
  { bg: "#1f6f78", fog: "#27808a", floor: "#4fb5ad", sky: "#9ff5e0", ground: "#123f55", hemi: 1.45, key: "#c8ffe9", keyPower: 2.1, rim: "#5fffd9", rimPower: 2.4, motes: "#a8ffdf", fish: "#8dfbd0" },
  { bg: "#c26a5c", fog: "#cf7d6a", floor: "#f0b08c", sky: "#ffe2c4", ground: "#7a2f45", hemi: 1.6, key: "#fff0d0", keyPower: 2.8, rim: "#ffb38a", rimPower: 2.0, motes: "#ffe8c0", fish: "#fff0b0" },
  { bg: "#3f8f7a", fog: "#4f9d86", floor: "#86c7a2", sky: "#d2f5c8", ground: "#1f5a4c", hemi: 1.6, key: "#f4f6c0", keyPower: 2.5, rim: "#7fe0b8", rimPower: 2.0, motes: "#e2f7b8", fish: "#c0f08a" },
  { bg: "#14365f", fog: "#1b4470", floor: "#3f6fae", sky: "#8fb8ff", ground: "#0b1f44", hemi: 1.35, key: "#b8d4ff", keyPower: 1.9, rim: "#58b6ff", rimPower: 2.5, motes: "#8fd0ff", fish: "#7fd7ff" },
  { bg: "#a765b8", fog: "#b377c4", floor: "#e3a6dc", sky: "#ffdcf6", ground: "#5b2f7f", hemi: 1.65, key: "#fff0f8", keyPower: 2.6, rim: "#ff9be0", rimPower: 2.1, motes: "#ffd4f4", fish: "#ffe17f" },
  // 8. Черепаха-крепость: замшелые нефритовые руины
  { bg: "#3d7f6a", fog: "#4a8e78", floor: "#9cc9a0", sky: "#d9f5d0", ground: "#24513f", hemi: 1.6, key: "#fff3d0", keyPower: 2.7, rim: "#9fe8b0", rimPower: 2.0, motes: "#e8ffd0", fish: "#ffd28a" },
  // 9. Ледяной грот: светлая голубая вода, лёд и иней
  { bg: "#5f9cc4", fog: "#74aed2", floor: "#b4d6ea", sky: "#e2f4ff", ground: "#2f5f8a", hemi: 1.45, key: "#f4fbff", keyPower: 2.1, rim: "#a8e4ff", rimPower: 2.2, motes: "#ffffff", fish: "#9fd8ff" },
  // 10. Вулканические трубы: тёплая вода, тёмный камень, рыжие огоньки
  { bg: "#6e3a3a", fog: "#80463f", floor: "#b07a62", sky: "#ffd0a8", ground: "#3a1414", hemi: 1.4, key: "#ffc890", keyPower: 2.6, rim: "#ff8a5a", rimPower: 2.6, motes: "#ffb080", fish: "#ffe07a" },
  // 11. Жемчужный город: колонны, арки и золотые купола
  { bg: "#4f8fb0", fog: "#5f9ebd", floor: "#e6d6b0", sky: "#fff3d8", ground: "#2c5a7a", hemi: 1.7, key: "#fff2c8", keyPower: 2.9, rim: "#ffe0a0", rimPower: 2.1, motes: "#fff4c8", fish: "#ff9ec0" },
  // 12. Логово Кракена
  { bg: "#2a1d55", fog: "#35266a", floor: "#6a55b0", sky: "#b9a3ff", ground: "#150c33", hemi: 1.3, key: "#e0c8ff", keyPower: 1.9, rim: "#ff7fd0", rimPower: 2.4, motes: "#e0a8ff", fish: "#ff9ecf" },
];
const ICE = new T.Color("#cfefff");
for (const theme of THEMES) {
  for (const key of ["bg", "fog", "floor", "sky", "ground", "key", "rim", "motes", "fish"]) theme[key] = new T.Color(theme[key]);
}
const radiance = color => new T.Color(color).multiplyScalar(1.5);
const vec = (x, y, z) => new T.Vector3(x, y, z);

function texture(size, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  paint(context, size);
  const result = new T.CanvasTexture(canvas);
  result.colorSpace = T.SRGBColorSpace;
  return result;
}

function makeSand() {
  const map = texture(256, (ctx, n) => {
    const data = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n * TAU;
        const v = y / n * TAU;
        const a = Math.sin(u * 3 + Math.sin(v * 2.0) * 1.3) + Math.cos(v * 3 + Math.sin(u * 2) * 1.8);
        const b = Math.sin((u + v) * 2.0 + Math.cos(u * 3 - v) * 0.88);
        const light = Math.pow(Math.max(0, 1 - Math.abs(a * 0.61 + b * 0.72) * 2), 3);
        const grit = 2.3 * Math.sin(13 * u + 24 * v) * Math.cos(29 * v - 51 * u);
        const index = (y * n + x) * 4;
        data.data[index] = 167 + light * 45 + grit;
        data.data[index + 1] = 207 + light * 30 + grit;
        data.data[index + 2] = 197 + light * 36 + grit;
        data.data[index + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  });
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(7, 7);
  return map;
}

function makeReef(scene) {
  const sand = makeSand();
  const floorMat = enamel("#8eced1", 0.91);
  floorMat.map = sand;
  // Блики от волн на дне (каустика): узор считается в шейдере, без текстур
  const caustic = { uTime: { value: 0 }, uCaustic: { value: 0.24 }, uTint: { value: new T.Color("#e9fff6") } };
  floorMat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, caustic);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uCaustic;\nuniform vec3 uTint;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      {
        vec2 p = vMapUv * 20.0;
        float t = uTime * 0.6;
        vec2 q = p + vec2(sin(p.y * 0.9 + t), cos(p.x * 0.8 - t * 0.8)) * 0.8;
        float a = sin(q.x * 1.7 + t) + sin(q.y * 1.9 - t * 0.7) + 0.5 * sin((q.x + q.y) * 1.3 + t * 0.4);
        float c = pow(max(0.0, 1.0 - abs(a) * 0.75), 4.0);
        totalEmissiveRadiance += uTint * c * uCaustic;
      }`);
  };
  const floor = new T.Mesh(new T.PlaneGeometry(140, 140), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.37;
  scene.add(floor);

  let seed = 77921;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const rocks = ["#3e8e9e", "#437da1", "#638bac", "#3f7d8b"].map(color => enamel(color, 0.78));
  const tips = ["#ff8b9c", "#ffbb7c", "#b48ff0", "#8bdbc8"].map(color => enamel(color, 0.59));
  const stalks = ["#e96891", "#ef9468", "#9064d1", "#3baaa6"].map(color => enamel(color, 0.59));
  const kelp = enamel("#45aa8f", 0.58);
  const shell = enamel("#e1c29c", 0.72);
  const seaStar = enamel("#f8ab7c", 0.6);
  const up = vec(0, 1, 0);
  const banks = [];

  function branch(group, x, z, index) {
    const scale = 0.7 + random() * 0.65;
    const root = vec(x, -0.1, z);
    for (let i = 0; i < 4; i++) {
      const target = vec(x + (i - 1.5) * 0.51 * scale, (1.0 + random() * 1.3) * scale, z + (random() - 0.5) * 1.3);
      const diff = target.clone().sub(root);
      const mid = root.clone().lerp(target, 0.52);
      const limb = mesh(GEO.tube, stalks[index], mid.x, mid.y, mid.z, 0.14 * scale, diff.length(), 0.14 * scale);
      limb.quaternion.setFromUnitVectors(up, diff.normalize());
      group.add(limb, mesh(GEO.sphere, tips[index], target.x, target.y, target.z, 0.21 * scale, 0.29 * scale, 0.21 * scale));
    }
  }

  for (const side of [-1, 1]) {
    const bank = new T.Group();
    for (let i = 0; i < 8; i++) {
      const z = -14 + i * 3.45;
      const x = side * (0.35 + random() * 1.4);
      const ridge = mesh(GEO.low, rocks[i % rocks.length], x + side * 1.3, -0.15, z, 2.0 + random(), 0.86 + random() * 1.05, 1.75);
      ridge.rotation.set(0.15, random() * TAU, 0.1);
      bank.add(ridge);
      if (i % 2 === 0) {
        branch(bank, x - side * 0.51, z + 0.43, (i + (side > 0 ? 1 : 0)) % tips.length);
      } else {
        for (let j = 0; j < 4; j++) {
          const leaf = mesh(GEO.sphere, kelp, x - side * 0.32 + (j - 1.5) * 0.22, 0.59, z + (j - 2) * 0.25, 0.12, 0.72 + random() * 0.52, 0.27);
          leaf.rotation.z = (j - 1.5) * 0.26;
          bank.add(leaf);
        }
      }
    }
    scene.add(bank);
    banks.push(bank);
  }

  for (let i = 0; i < 39; i++) {
    const x = (random() - 0.5) * 28;
    const z = (random() - 0.5) * 33;
    if (i % 8 === 0) {
      const star = new T.Group();
      star.position.set(x, -0.22, z);
      for (let arm = 0; arm < 5; arm++) {
        const tip = arm / 5 * TAU;
        const ray = mesh(GEO.sphere, seaStar, 0.18 * Math.cos(tip), 0, 0.18 * Math.sin(tip), 0.22, 0.048, 0.105);
        ray.rotation.y = -tip;
        star.add(ray);
      }
      star.rotation.y = random() * TAU;
      scene.add(star);
    } else {
      const pebble = mesh(GEO.low, i % 3 === 0 ? shell : rocks[i % rocks.length], x, -0.32, z, 0.11 + random() * 0.28, 0.11, 0.2);
      pebble.rotation.y = random() * TAU;
      scene.add(pebble);
    }
  }

  const arch = new T.Group();
  for (let i = 0; i < 8; i++) {
    const angle = i / 7 * Math.PI;
    arch.add(mesh(GEO.low, rocks[(i + 1) % rocks.length], Math.cos(angle) * 4.8, Math.sin(angle) * 2.7, -13.5, 1.31, 1.03, 1.35));
  }
  branch(arch, -2.8, -13.0, 2);
  branch(arch, 3.8, -13.0, 0);
  scene.add(arch);

  const motes = new Float32Array(192 * 3);
  for (let i = 0; i < motes.length; i += 3) {
    motes[i] = (random() - 0.5) * 37;
    motes[i + 1] = 0.5 + random() * 11;
    motes[i + 2] = (random() - 0.5) * 34;
  }
  const light = texture(64, (ctx, n) => {
    const gradient = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gradient.addColorStop(0, "#edfffb");
    gradient.addColorStop(0.38, "#bff5ffb0");
    gradient.addColorStop(1, "#bff5ff00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, n, n);
  });
  const cloud = new T.BufferGeometry();
  cloud.setAttribute("position", new T.BufferAttribute(motes, 3));
  const plankton = new T.Points(cloud, new T.PointsMaterial({
    map: light, color: "#d4fbef", size: 0.17, opacity: 0.65, transparent: true, depthWrite: false,
  }));
  scene.add(plankton);
  // Лучи света сверху: наклонные полупрозрачные полосы, медленно покачиваются
  const shaftMap = texture(64, (ctx, n) => {
    const g = ctx.createLinearGradient(0, 0, n, 0);
    g.addColorStop(0, "#ffffff00");
    g.addColorStop(0.5, "#ffffffff");
    g.addColorStop(1, "#ffffff00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    const fade = ctx.createLinearGradient(0, 0, 0, n);
    fade.addColorStop(0, "#000000ff");
    fade.addColorStop(0.75, "#00000000");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, n, n);
  });
  const shaftMat = new T.MeshBasicMaterial({ map: shaftMap, color: "#fff6dc", transparent: true, opacity: 0.11, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  const shafts = new T.Group();
  for (let i = 0; i < 6; i++) {
    const shaft = new T.Mesh(new T.PlaneGeometry(1, 1), shaftMat);
    shaft.scale.set(1.6 + random() * 2.2, 26, 1);
    shaft.position.set(-9 + i * 3.6 + random() * 1.5, 7, -6 + random() * 8);
    shaft.rotation.set(0, 0.6, -0.55);
    shaft.userData.phase = random() * TAU;
    shafts.add(shaft);
  }
  scene.add(shafts);
  return { banks, sand, floorMat, plankton, light, caustic, shafts, shaftMat };
}

// Декорации дна: у каждой глубины свой набор невысоких предметов прямо на арене.
// Они ниже субмарины и роботов и ничего не заслоняют. Возвращает двенадцать групп по порядку глубин.
function makeSets(scene) {
  let seed = 4127;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const spot = (wide = 8, deep = 11) => [(random() - 0.5) * 2 * wide, (random() - 0.5) * 2 * deep - 1];
  const up = vec(0, 1, 0);
  const sets = [];
  const begin = () => {
    const group = new T.Group();
    group.visible = false;
    group.userData.show = 0;
    scene.add(group);
    sets.push(group);
    return group;
  };
  const lean = (object, x, z) => {
    object.rotation.set(x, random() * TAU, z);
    return object;
  };

  // 1. Коралловый сад: кустики кораллов и морская трава
  let g = begin();
  const buds = ["#ff8fa6", "#ffb877", "#ffd98a", "#f59ad8"].map(c => enamel(c, 0.6));
  const grass = enamel("#58c79a", 0.6);
  for (let i = 0; i < 26; i++) {
    const [x, z] = spot();
    if (i % 3) {
      for (let j = 0; j < 3; j++) g.add(mesh(GEO.sphere, buds[(i + j) % 4], x + (j - 1) * 0.3, 0.0, z + (random() - 0.5) * 0.4, 0.2, 0.3 + random() * 0.2, 0.2));
    } else {
      for (let j = 0; j < 4; j++) {
        const blade = mesh(GEO.sphere, grass, x + (j - 1.5) * 0.16, 0.05, z, 0.07, 0.45 + random() * 0.3, 0.14);
        blade.rotation.z = (j - 1.5) * 0.22;
        g.add(blade);
      }
    }
  }

  // 2. Фиолетовый каньон: плоские плиты и кристаллы
  g = begin();
  const slab = ["#7a78c4", "#8f86d6", "#6b6ab6"].map(c => enamel(c, 0.8));
  const crystal = enamel("#d7b8ff", 0.25, 0.3);
  for (let i = 0; i < 22; i++) {
    const [x, z] = spot();
    if (i % 3) g.add(lean(mesh(GEO.low, slab[i % 3], x, -0.25, z, 0.7 + random() * 0.9, 0.22, 0.5 + random() * 0.6), 0, 0));
    else {
      for (let j = 0; j < 3; j++) {
        const shard = mesh(GEO.cone, crystal, x + (j - 1) * 0.26, 0.05, z + (random() - 0.5) * 0.3, 0.13, 0.5 + random() * 0.4, 0.13);
        shard.rotation.z = (j - 1) * 0.35;
        g.add(shard);
      }
    }
  }

  // 3. Светящаяся пещера: светящиеся грибы и камни
  g = begin();
  const stem = enamel("#2c7f86", 0.6);
  const caps = [glow("#8dffe0"), glow("#b7ff9a"), glow("#7fe9ff")];
  const dark = enamel("#2d7d87", 0.85);
  for (let i = 0; i < 26; i++) {
    const [x, z] = spot();
    if (i % 4 === 0) g.add(lean(mesh(GEO.low, dark, x, -0.2, z, 0.6 + random() * 0.6, 0.35, 0.6), 0.1, 0.1));
    else {
      const h = 0.25 + random() * 0.3;
      g.add(mesh(GEO.tube, stem, x, h / 2 - 0.3, z, 0.05, h, 0.05),
        mesh(GEO.sphere, caps[i % 3], x, h - 0.26, z, 0.17 + random() * 0.1, 0.09, 0.17 + random() * 0.1));
    }
  }

  // 4. Клешня-великан: арена из красных камней и старых панцирей
  g = begin();
  const red = ["#c85a52", "#b0483f", "#de7a5e"].map(c => enamel(c, 0.75));
  const shellOld = enamel("#f6c9a4", 0.6);
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * TAU;
    g.add(lean(mesh(GEO.low, red[i % 3], Math.cos(a) * 7.4, -0.2, Math.sin(a) * 8.6 - 0.5, 0.45 + random() * 0.35, 0.3 + random() * 0.3, 0.45), 0.2, 0.2));
  }
  for (let i = 0; i < 9; i++) {
    const [x, z] = spot(7, 9);
    g.add(mesh(GEO.sphere, shellOld, x, -0.28, z, 0.5, 0.16, 0.42), mesh(GEO.cone, red[i % 3], x + 0.5, -0.18, z, 0.09, 0.4, 0.09));
  }

  // 5. Затонувший корабль: рёбра корпуса, мачта, бочки, сундук
  g = begin();
  const wood = ["#8a6a4a", "#6f5338", "#a07c56"].map(c => enamel(c, 0.85));
  const gold = glow("#ffe08a");
  for (let i = 0; i < 9; i++) {
    const z = -8 + i * 1.5;
    const width = 3.3 - Math.abs(i - 4) * 0.45;
    for (const s of [-1, 1]) {
      const rib = mesh(GEO.box, wood[i % 3], s * width, -0.05, z, 0.16, 0.75, 0.2);
      rib.rotation.z = -s * 0.5;
      g.add(rib);
    }
    g.add(mesh(GEO.box, wood[(i + 1) % 3], 0, -0.31, z, width * 2, 0.08, 0.5));
  }
  const mast = mesh(GEO.tube, wood[0], -1.2, -0.18, 1.2, 0.16, 7.5, 0.16);
  mast.rotation.set(Math.PI / 2, 0, 0.5);
  g.add(mast, mesh(GEO.box, wood[2], 2.2, -0.12, 4.6, 0.8, 0.45, 0.55), mesh(GEO.box, gold, 2.2, 0.12, 4.6, 0.6, 0.06, 0.4));
  for (let i = 0; i < 5; i++) {
    const [x, z] = spot(6, 9);
    const barrel = mesh(GEO.tube, wood[i % 3], x, -0.15, z, 0.28, 0.6, 0.28);
    barrel.rotation.set(Math.PI / 2, 0, random() * TAU);
    g.add(barrel);
  }

  // 6. Тёмная впадина: светящиеся трещины и чёрные камни
  g = begin();
  const crack = glow("#5fd0ff");
  const coal = enamel("#1d3e73", 0.85);
  for (let i = 0; i < 12; i++) {
    const [x, z] = spot();
    const angle = random() * TAU;
    for (let j = 0; j < 4; j++) {
      const piece = mesh(GEO.box, crack, x + Math.cos(angle) * j * 0.55 + (random() - 0.5) * 0.2, -0.34, z + Math.sin(angle) * j * 0.55, 0.6, 0.03, 0.07);
      piece.rotation.y = -angle + (random() - 0.5) * 0.7;
      g.add(piece);
    }
    g.add(lean(mesh(GEO.low, coal, x + 0.9, -0.15, z - 0.6, 0.5 + random() * 0.5, 0.4 + random() * 0.3, 0.5), 0.2, 0.1));
  }

  // 7. Сад медуз: актинии со светящимися кончиками
  g = begin();
  const stalk = ["#d07ad0", "#e79ad6", "#b56fd0"].map(c => enamel(c, 0.55));
  const tipGlow = [glow("#ffd0f4"), glow("#fff0a8"), glow("#b8f4ff")];
  for (let i = 0; i < 24; i++) {
    const [x, z] = spot();
    const h = 0.35 + random() * 0.3;
    for (let j = 0; j < 5; j++) {
      const a = j / 5 * TAU;
      const dir = vec(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize();
      const arm = mesh(GEO.tube, stalk[i % 3], x + dir.x * h / 2, -0.3 + dir.y * h / 2, z + dir.z * h / 2, 0.05, h, 0.05);
      arm.quaternion.setFromUnitVectors(up, dir);
      g.add(arm, mesh(GEO.sphere, tipGlow[i % 3], x + dir.x * h, -0.3 + dir.y * h, z + dir.z * h, 0.075));
    }
  }

  // 8. Черепаха-крепость: замшелые глыбы, обломки стен и водоросли
  g = begin();
  const moss = ["#4f8f6a", "#3f7a5c", "#6aa47a"].map(c => enamel(c, 0.85));
  const wall = enamel("#a9b9a0", 0.8);
  const weed = enamel("#7fd08a", 0.6);
  for (let i = 0; i < 14; i++) {
    const [x, z] = spot();
    g.add(lean(mesh(GEO.low, moss[i % 3], x, -0.15, z, 0.6 + random() * 0.6, 0.4 + random() * 0.3, 0.6 + random() * 0.4), 0.15, 0.1));
  }
  for (let i = 0; i < 6; i++) {
    const [x, z] = spot(7, 9);
    const block = mesh(GEO.box, wall, x, -0.1, z, 1.2, 0.45, 0.5);
    block.rotation.y = random() * TAU;
    g.add(block);
  }
  for (let i = 0; i < 14; i++) {
    const [x, z] = spot();
    for (let j = 0; j < 3; j++) {
      const blade = mesh(GEO.sphere, weed, x + (j - 1) * 0.15, 0.1, z, 0.07, 0.55 + random() * 0.3, 0.12);
      blade.rotation.z = (j - 1) * 0.3;
      g.add(blade);
    }
  }

  // 9. Ледяной грот: ледяные кристаллы, льдины и сугробы инея
  g = begin();
  const ice = enamel("#e8f8ff", 0.18, 0.1);
  const iceGlow = glow("#bff0ff");
  const floe = enamel("#cfe9f7", 0.35);
  for (let i = 0; i < 16; i++) {
    const [x, z] = spot();
    for (let j = 0; j < 3; j++) {
      const shard = mesh(GEO.cone, j === 1 ? iceGlow : ice, x + (j - 1) * 0.28, 0.1, z + (random() - 0.5) * 0.3, 0.16, 0.6 + random() * 0.6, 0.16);
      shard.rotation.set((random() - 0.5) * 0.5, 0, (j - 1) * 0.4);
      g.add(shard);
    }
  }
  for (let i = 0; i < 10; i++) {
    const [x, z] = spot();
    g.add(lean(mesh(GEO.low, floe, x, -0.25, z, 0.8 + random() * 0.7, 0.18, 0.6 + random() * 0.5), 0.05, 0.05));
  }

  // 10. Вулканические трубы: тёмные трубы с огоньками и застывшая лава
  g = begin();
  const basalt = enamel("#4a2f2c", 0.9);
  const ember = glow("#ffad5a");
  const lava = glow("#ff7a3a");
  for (let i = 0; i < 9; i++) {
    const [x, z] = spot(7.5, 10);
    const h = 0.6 + random() * 0.9;
    g.add(mesh(GEO.tube, basalt, x, h / 2 - 0.3, z, 0.36, h, 0.36), mesh(GEO.tube, ember, x, h - 0.28, z, 0.24, 0.05, 0.24));
  }
  for (let i = 0; i < 10; i++) {
    const [x, z] = spot();
    const angle = random() * TAU;
    for (let j = 0; j < 3; j++) {
      const piece = mesh(GEO.box, lava, x + Math.cos(angle) * j * 0.5, -0.34, z + Math.sin(angle) * j * 0.5, 0.55, 0.03, 0.08);
      piece.rotation.y = -angle + (random() - 0.5) * 0.6;
      g.add(piece);
    }
    g.add(lean(mesh(GEO.low, basalt, x + 0.8, -0.18, z, 0.5 + random() * 0.4, 0.35, 0.5), 0.2, 0.1));
  }

  // 11. Жемчужный город: колонны, обломки арок и золотые купола
  g = begin();
  const marble = enamel("#f2e6cf", 0.55);
  const domeGold = enamel("#eadcbc", 0.45, 0.2);
  const pearlGlow = glow("#fff6e0");
  for (let i = 0; i < 10; i++) {
    const [x, z] = spot(7.5, 10);
    const h = 0.4 + random() * 0.9;
    g.add(mesh(GEO.tube, marble, x, h / 2 - 0.3, z, 0.22, h, 0.22), mesh(GEO.box, marble, x, h - 0.27, z, 0.55, 0.1, 0.55));
    if (i % 3 === 0) g.add(mesh(GEO.sphere, pearlGlow, x, h - 0.12, z, 0.15));
  }
  for (let i = 0; i < 5; i++) {
    const [x, z] = spot(7, 9);
    g.add(mesh(GEO.sphere, domeGold, x, -0.32, z, 0.75, 0.3, 0.75), mesh(GEO.cone, enamel("#ffd36a", 0.3, 0.5), x, 0.05, z, 0.08, 0.3, 0.08));
  }
  for (let i = 0; i < 8; i++) {
    const [x, z] = spot();
    const block = mesh(GEO.box, marble, x, -0.25, z, 0.9, 0.2, 0.45);
    block.rotation.y = random() * TAU;
    g.add(block);
  }

  // 12. Логово Кракена: кости, тёмные шипы и светящиеся икринки
  g = begin();
  const bone = enamel("#d9cfee", 0.6);
  const spike = enamel("#3b2a7a", 0.7);
  const egg = [glow("#ff9be0"), glow("#c79bff")];
  const skeleton = new T.Group();
  skeleton.position.set(-2.6, 0, 2.6);
  skeleton.rotation.y = 0.5;
  for (let i = 0; i < 8; i++) {
    const z = (i - 3.5) * 0.62;
    const reach = 1.25 - Math.abs(i - 3) * 0.14;
    skeleton.add(mesh(GEO.sphere, bone, 0, -0.2, z, 0.17, 0.12, 0.2));
    if (i === 7) break;
    for (const s of [-1, 1]) {
      const rib = mesh(GEO.tube, bone, s * reach * 0.5, -0.12, z + 0.1, 0.06, reach, 0.06);
      rib.rotation.set(0, -s * 0.25, Math.PI / 2 - s * 0.22);
      skeleton.add(rib);
    }
  }
  skeleton.add(mesh(GEO.sphere, bone, 0, -0.1, -2.75, 0.5, 0.3, 0.62), mesh(GEO.sphere, spike, -0.2, 0.05, -3.0, 0.11), mesh(GEO.sphere, spike, 0.2, 0.05, -3.0, 0.11));
  g.add(skeleton);
  for (let i = 0; i < 22; i++) {
    const [x, z] = spot();
    if (i % 2) g.add(lean(mesh(GEO.cone, spike, x, 0.0, z, 0.2, 0.7 + random() * 0.5, 0.2), 0.25, 0.2));
    else for (let j = 0; j < 3; j++) g.add(mesh(GEO.sphere, egg[(i / 2 + j) % 2 | 0], x + (j - 1) * 0.3, -0.2, z + (random() - 0.5) * 0.3, 0.15));
  }
  return sets;
}

const enemyColor = {
  crab: "#ffba8a", mine: "#ffa887", jelly: "#dca3ff", boss: "#ffb5ee",
  puffer: "#ffd66b", eel: "#8cf0cf", titan: "#ff8f7a",
  ray: "#8fb4ff", bubble: "#bff6ff", star: "#ff9fd0", chest: "#ffd35a", turtle: "#7fe0a8",
};
const LARGE = { boss: true, titan: true, turtle: true };
// Уровни качества: разрешение, свечение (bloom), лучи и каустика, сколько частиц
export const QUALITY = {
  high: { ratio: 2, bloom: true, shafts: true, caustic: true, particles: 620 },
  medium: { ratio: 1.35, bloom: false, shafts: true, caustic: true, particles: 380 },
  low: { ratio: 1, bloom: false, shafts: false, caustic: false, particles: 200 },
};
const GUARD = new T.MeshBasicMaterial({ color: "#9ffcff", transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
const SHELL = new T.MeshBasicMaterial({ color: "#ffd38a", transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
const LINK = new T.MeshBasicMaterial({ color: "#9ffcff", transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
const SHIELD_SKIN = new T.MeshBasicMaterial({ color: "#8ff4ff", transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
const FRIENDLY = glow("#d6ffff");
const HOSTILE = glow("#ffa75e");
const HEAVY = glow("#ff78b1");
const BUBBLE = radiance("#d9fbff");
const RING_GEO = new T.RingGeometry(0.87, 1, 58);
const SHADOW_GEO = new T.PlaneGeometry(1, 1);

function sprite(color, texture) {
  return new T.Sprite(new T.SpriteMaterial({
    map: texture, color, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, toneMapped: false,
  }));
}

export class ReefView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.07;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#5eb7c3");
    this.scene.fog = new T.FogExp2("#6fbccf", 0.010);
    this.camera = new T.OrthographicCamera(-6, 6, 10, -10, 0.5, 145);
    this.camera.position.set(0, 27.5, 23.5);
    this.camera.lookAt(0, 0.15, -0.8);
    const key = new T.DirectionalLight("#fff0cc", 3.0);
    key.position.set(-12, 22, -10);
    const rim = new T.DirectionalLight("#80dfff", 2.15);
    rim.position.set(14, 10, 15);
    const hemi = new T.HemisphereLight("#ccf7ed", "#286591", 1.78);
    this.lights = { key, rim, hemi };
    this.scene.add(hemi, key, rim);
    this.reef = makeReef(this.scene);
    this.sets = makeSets(this.scene);
    this.depth = 0;
    this.lane = 5;
    this.bounds = { x: 5, far: -9.3, near: 9.3 };
    this.ray = new T.Raycaster();
    this.ndc = new T.Vector2();
    this.intersection = new T.Vector3();
    this.player = submarine();
    this.player.rotation.order = "YXZ";
    this.scene.add(this.player);
    this.shadowMaterial = new T.MeshBasicMaterial({
      map: texture(64, (ctx, n) => {
        const gradient = ctx.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n / 2);
        gradient.addColorStop(0, "#0e4769ad");
        gradient.addColorStop(0.43, "#0e476966");
        gradient.addColorStop(1, "#0e476900");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, n, n);
      }),
      transparent: true, depthWrite: false, opacity: 0.8,
    });
    this.playerShadow = this.shadow(3.7);
    this.shipLight = sprite("#5ff7ff", this.reef.light);
    this.shipLight.position.set(0, 0.02, -1.49);
    this.player.add(this.shipLight);
    this.shotGlow = 0;
    this.actors = new Map();
    this.drops = new Map();
    this.bolts = new Map();
    this.ripples = [];
    this.particles = [];
    this.particleMesh = new T.InstancedMesh(GEO.spark, new T.MeshBasicMaterial({ toneMapped: false }), 620);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    const laneMaterial = new T.MeshBasicMaterial({
      color: "#f5899e", transparent: true, depthWrite: false, toneMapped: false,
    });
    this.beamBand = new T.Mesh(SHADOW_GEO, laneMaterial);
    this.beamBand.rotation.x = -Math.PI / 2;
    this.beamCore = new T.Mesh(SHADOW_GEO, new T.MeshBasicMaterial({
      color: "#fff4db", transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.beamCore.rotation.x = -Math.PI / 2;
    this.scene.add(this.beamBand, this.beamCore);
    // полосы-предупреждения: ряд, по которому пронесётся угорь, и колонна под рывок великана
    this.laneBands = [];
    for (let i = 0; i < 5; i++) {
      const fill = new T.MeshBasicMaterial({ color: "#fff8dc", transparent: true, depthWrite: false, toneMapped: false });
      const edge = new T.MeshBasicMaterial({ color: "#fff2a0", transparent: true, depthWrite: false, toneMapped: false });
      const band = new T.Group();
      band.add(new T.Mesh(SHADOW_GEO, fill), new T.Mesh(SHADOW_GEO, edge), new T.Mesh(SHADOW_GEO, edge));
      band.children[1].position.x = -0.5;
      band.children[2].position.x = 0.5;
      band.rotation.x = -Math.PI / 2;
      band.visible = false;
      band.userData = { fill, edge };
      this.scene.add(band);
      this.laneBands.push(band);
    }
    // стайка рыбок у самого дна — просто жизнь на фоне
    const fishMaterial = new T.MeshStandardMaterial({ color: "#ffb37a", roughness: 0.5 });
    this.school = new T.InstancedMesh(fishGeometry(), fishMaterial, 16);
    this.school.frustumCulled = false;
    this.scene.add(this.school);
    this.fish = [];
    for (let i = 0; i < 16; i++) {
      this.fish.push({ x: (i % 4 - 1.5) * 0.7 + Math.sin(i * 7.3) * 0.3, z: (Math.floor(i / 4) - 1.5) * 0.6 + Math.cos(i * 4.1) * 0.3, phase: i * 1.7 });
    }
    this.schoolPath = { from: -1, z: 2, start: -99 };
    // вспышки взрывов: пул светящихся пятен
    this.flashes = [];
    for (let i = 0; i < 18; i++) {
      const flash = sprite("#ffffff", this.reef.light);
      flash.visible = false;
      this.scene.add(flash);
      this.flashes.push({ sprite: flash, age: 1, ttl: 1, size: 1 });
    }
    // обломки роботов: кубики летят, падают на дно и гаснут
    this.chunks = [];
    this.chunkMesh = new T.InstancedMesh(GEO.box, new T.MeshStandardMaterial({ roughness: 0.5, metalness: 0.15 }), 160);
    this.chunkMesh.count = 0;
    this.chunkMesh.frustumCulled = false;
    this.scene.add(this.chunkMesh);
    // лучи щита морской звезды
    this.linkBeams = [];
    for (let i = 0; i < 9; i++) {
      const beam = new T.Mesh(SHADOW_GEO, LINK);
      beam.rotation.x = -Math.PI / 2;
      beam.visible = false;
      this.scene.add(beam);
      this.linkBeams.push(beam);
    }
    // пузырь-щит вокруг лодки и кольцо «тройного залпа»
    this.playerShield = new T.Mesh(GEO.sphere, SHIELD_SKIN);
    this.playerShield.visible = false;
    this.scene.add(this.playerShield);
    this.spreadRing = new T.Mesh(RING_GEO, new T.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.spreadRing.rotation.x = -Math.PI / 2;
    this.spreadRing.visible = false;
    this.scene.add(this.spreadRing);
    this.capsules = new Map();
    this.freezeLook = 0;
    this.hitStop = 0;
    this.quality = "high";
    this.preset = QUALITY.high;
    this.shake = 0;
    this.trail = 0;
    this.cameraBase = this.camera.position.clone();
    this.dummy = new T.Object3D();
    this.visualTime = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    const aspect = w / h;
    const height = 20.7;
    const width = height * aspect;
    this.aspect = aspect;
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.preset?.ratio ?? 1.65));
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
    }
    this.bounds.x = Math.max(2.8, Math.min(9.6, width * 0.5 - 1.04));
    this.reef.banks.forEach((bank, i) => { bank.position.x = (i ? 1 : -1) * (this.bounds.x + 0.45); });
    return this.bounds;
  }

  // Качество картинки: high | medium | low. Свечение (bloom) — только на «Высоком».
  // Сглаживание MSAA в цели композера не включаем: на «Высоком» края сглаживает двойное разрешение.
  setQuality(level) {
    if (!QUALITY[level]) return;
    this.quality = level;
    this.preset = QUALITY[level];
    if (this.preset.bloom && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.42, 0.5, 1.0);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.reef.shafts.visible = this.preset.shafts;
    this.reef.caustic.uCaustic.value = this.preset.caustic ? 0.24 : 0;
    this.resize();
  }

  // Экранные координаты точки сцены (для всплывающих очков)
  screen(x, y, z) {
    const v = this.tmp || (this.tmp = new T.Vector3());
    v.set(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  flash(x, y, z, color, size, ttl = 0.32) {
    const slot = this.flashes.find(f => f.age >= f.ttl) || this.flashes[0];
    slot.age = 0;
    slot.ttl = ttl;
    slot.size = size;
    slot.sprite.material.color.copy(radiance(color));
    slot.sprite.position.set(x, y, z);
    slot.sprite.visible = true;
  }

  debris(x, z, color, count, speed = 4) {
    const tint = new T.Color(color);
    const room = (this.preset.particles >> 2) - this.chunks.length;
    for (let i = 0; i < Math.min(count, room); i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.chunks.push({ x, y: 1.3, z, vx: Math.sin(a) * s, vz: Math.cos(a) * s, vy: 2 + Math.random() * 4, rx: Math.random() * TAU, ry: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 14, life: 1.2 + Math.random() * 0.6, size: 0.09 + Math.random() * 0.12, tint });
    }
  }

  // пузырьки поднимаются к поверхности, покачиваясь
  bubbles(x, z, count, spread = 0.8) {
    const room = this.preset.particles - this.particles.length;
    for (let i = 0; i < Math.min(count, room); i++) {
      this.particles.push({ x: x + (Math.random() - 0.5) * spread, y: 1 + Math.random() * 0.6, z: z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: 1.6 + Math.random() * 1.8, life: 0.7 + Math.random() * 0.7,
        size: 0.05 + Math.random() * 0.08, tint: BUBBLE, wobble: Math.random() * TAU });
    }
  }

  pointAt(x, y) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(PLANE, this.intersection);
  }

  shadow(size) {
    const shadow = new T.Mesh(SHADOW_GEO, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.31;
    shadow.scale.set(size, size * 0.82, 1);
    this.scene.add(shadow);
    return shadow;
  }

  ripple(x, z, color, size, ttl) {
    const material = new T.MeshBasicMaterial({
      color: radiance(color), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const ring = new T.Mesh(RING_GEO, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.37, z);
    this.scene.add(ring);
    this.ripples.push({ ring, age: 0, size, ttl });
  }

  spray(x, z, color, count, speed) {
    const tint = radiance(color);
    const remaining = this.preset.particles - this.particles.length;
    for (let i = 0; i < Math.min(count, remaining); i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.38 + Math.random() * 0.62);
      this.particles.push({
        x, y: 1.32, z, vx: Math.sin(a) * s, vz: Math.cos(a) * s, vy: 1.1 + Math.random() * 3,
        life: 0.28 + Math.random() * 0.53, size: 0.07 + Math.random() * 0.13, tint,
      });
    }
  }

  event(e) {
    if (e.type === "shot") this.shotGlow = 1;
    else if (e.type === "impact") {
      this.spray(e.x, e.z, enemyColor[e.kind], 5, 3.3);
      this.flash(e.x, 1.4, e.z, "#ffffff", 1.1, 0.12);
    } else if (e.type === "burst") {
      const big = !!LARGE[e.kind];
      const color = enemyColor[e.kind] || "#ffffff";
      if (big) this.shake = 0.7;
      this.spray(e.x, e.z, color, big ? 75 : 23, big ? 8 : 5.1);
      this.spray(e.x, e.z, "#c9fbff", big ? 35 : 8, big ? 7 : 4.4);
      this.ripple(e.x, e.z, color, big ? 5.1 : 2.5, big ? 0.92 : 0.46);
      this.flash(e.x, 1.5, e.z, "#fff6d8", big ? 7 : 3.2, big ? 0.5 : 0.28);
      this.flash(e.x, 1.4, e.z, color, big ? 10 : 4.6, big ? 0.7 : 0.4);
      if (e.kind !== "bubble") this.debris(e.x, e.z, color, big ? 26 : 7, big ? 6 : 4);
      this.bubbles(e.x, e.z, big ? 26 : 6, big ? 3 : 0.8);
    } else if (e.type === "boss-down") {
      // босс повержен: три волны, вспышка во весь экран и град обломков
      this.shake = 1.3;
      this.hitStop = 0.9;
      for (let i = 0; i < 3; i++) this.ripple(e.x, e.z, i ? "#fff6c8" : enemyColor[e.kind], 7 + i * 3, 0.8 + i * 0.35);
      this.flash(e.x, 2, e.z, "#ffffff", 18, 0.9);
      this.spray(e.x, e.z, "#fff3a8", 90, 10);
      this.debris(e.x, e.z, "#ffd38a", 30, 8);
    } else if (e.type === "deflect") {
      this.spray(e.x, e.z, e.kind === "turtle" ? "#ffd38a" : "#9ffcff", 4, 2.6);
    } else if (e.type === "drop") {
      this.bubbles(e.x, e.z, 3, 0.4);
    } else if (e.type === "fizz") {
      this.ripple(e.x, e.z, "#bff6ff", 1.2, 0.3);
      this.bubbles(e.x, e.z, 6, 0.5);
    } else if (e.type === "shell-warning") {
      this.ripple(e.x, e.z, "#ffd38a", 3.6, 0.5);
    } else if (e.type === "shell" || e.type === "unshell") {
      this.ripple(e.x, e.z, e.type === "shell" ? "#ffb36b" : "#9df5d7", 4.6, 0.55);
      this.bubbles(e.x, e.z, 14, 3);
      if (e.type === "shell") this.shake = Math.max(this.shake, 0.3);
    } else if (e.type === "capsule-drop") {
      this.ripple(e.x, e.z, POWER_COLOR[e.kind], 2.2, 0.5);
      this.flash(e.x, 1.5, e.z, POWER_COLOR[e.kind], 3.5, 0.4);
    } else if (e.type === "power") {
      this.ripple(e.x, e.z, POWER_COLOR[e.kind], 3.4, 0.55);
      this.spray(e.x, e.z, POWER_COLOR[e.kind], 26, 5.5);
      this.flash(e.x, 1.5, e.z, POWER_COLOR[e.kind], 4.5, 0.45);
    } else if (e.type === "bubble-pop") {
      this.shake = Math.max(this.shake, 0.25);
      this.ripple(e.x, e.z, "#8ff4ff", 3, 0.45);
      this.spray(e.x, e.z, "#c8faff", 22, 5);
    } else if (e.type === "bubble-up") {
      this.ripple(e.x, e.z, "#8ff4ff", 2.2, 0.4);
    } else if (e.type === "torpedo") {
      this.bubbles(e.x, e.z, 6, 0.6);
    } else if (e.type === "blast") {
      this.ripple(e.x, e.z, "#ffb36b", 2.2, 0.35);
      this.flash(e.x, 1.4, e.z, "#ffc27a", 3.2, 0.3);
      this.spray(e.x, e.z, "#ffd3a0", 12, 5);
    } else if (e.type === "drip") {
      this.ripple(e.x, e.z, "#fff59a", 1.4, 0.4);
      this.flash(e.x, 1.6, e.z, "#fff6c8", 2.2, 0.35);
    } else if (e.type === "clear" && e.clean) {
      this.ripple(this.player.position.x, this.player.position.z, "#fff59a", 6, 0.8);
    } else if (e.type === "pulse") {
      this.ripple(e.x, e.z, "#71fff0", PULSE_RADIUS, 0.62);
      this.ripple(e.x, e.z, "#eefff6", PULSE_RADIUS * 0.82, 0.45);
      this.spray(e.x, e.z, "#91ffee", 36, 9);
    } else if (e.type === "hurt") {
      this.shake = Math.max(this.shake, 0.3);
      this.ripple(e.x, e.z, "#ff897e", 2.5, 0.36);
      this.spray(e.x, e.z, "#ffce99", 14, 4.1);
    } else if (e.type === "pop") {
      this.shake = Math.max(this.shake, 0.16);
      this.ripple(e.x, e.z, "#ffd66b", 3.4, 0.5);
      this.spray(e.x, e.z, "#fff0b0", 20, 6);
    } else if (e.type === "swell") {
      this.ripple(e.x, e.z, "#ffb36b", 1.9, 0.4);
    } else if (e.type === "dash") {
      this.ripple(e.x, e.z, "#b6fff0", 2.6, 0.4);
      this.spray(e.x, e.z, "#b6fff0", 14, 6);
    } else if (e.type === "beam-fire") {
      this.shake = Math.max(this.shake, 0.35);
    } else if (e.type === "pearl") {
      this.ripple(e.x, e.z, "#fff59a", 2.15, 0.49);
      this.spray(e.x, e.z, "#fff4aa", 16, 4.5);
    }
  }

  effects(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const fx = this.ripples[i];
      fx.age += dt;
      const f = fx.age / fx.ttl;
      if (f >= 1) {
        this.scene.remove(fx.ring);
        fx.ring.material.dispose();
        this.ripples.splice(i, 1);
      } else {
        fx.ring.scale.setScalar(Math.max(0.01, fx.size * (1 - (1 - f) ** 2)));
        fx.ring.material.opacity = 0.68 * (1 - f);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
      else {
        p.x += p.vx * dt + (p.wobble !== undefined ? Math.sin(p.life * 9 + p.wobble) * 0.6 * dt : 0);
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
    }
    this.particleMesh.count = this.particles.length;
    this.particles.forEach((p, i) => {
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.x * 4, p.z * 3, p.y);
      this.dummy.scale.setScalar(p.size * Math.min(1, p.life * 3.4));
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, p.tint);
    });
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    for (const f of this.flashes) {
      if (f.age >= f.ttl) continue;
      f.age += dt;
      const k = f.age / f.ttl;
      f.sprite.visible = k < 1;
      f.sprite.scale.setScalar(f.size * (0.45 + 0.55 * Math.sqrt(Math.min(1, k * 2.2))));
      f.sprite.material.opacity = (1 - k) ** 1.5;
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.chunks.splice(i, 1);
        continue;
      }
      c.vy -= 9 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      if (c.y < -0.2) {
        // упал на дно: подпрыгнул и затих
        c.y = -0.2;
        c.vy = Math.abs(c.vy) * 0.3;
        c.vx *= 0.5;
        c.vz *= 0.5;
        c.spin *= 0.5;
      }
      c.rx += c.spin * dt;
      c.ry += c.spin * 0.7 * dt;
    }
    this.chunkMesh.count = this.chunks.length;
    this.chunks.forEach((c, i) => {
      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(c.rx, c.ry, 0);
      this.dummy.scale.setScalar(c.size * Math.min(1, c.life * 2.5));
      this.dummy.updateMatrix();
      this.chunkMesh.setMatrixAt(i, this.dummy.matrix);
      this.chunkMesh.setColorAt(i, c.tint);
    });
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;
  }

  updateActors(game, time) {
    const active = new Set();
    for (const e of game.enemies) {
      active.add(e.id);
      let record = this.actors.get(e.id);
      if (!record) {
        const model = enemyModels[e.kind]();
        if (e.kind === "chest") model.scale.setScalar(1.35);
        const shadow = this.shadow({ boss: 6.2, titan: 5.4, turtle: 6, eel: 3.3, ray: 3.6, bubble: 1.3 }[e.kind] || 2.65);
        const warning = sprite(e.kind === "boss" ? "#ff9ad1" : e.kind === "eel" ? "#9dfff0" : e.kind === "chest" ? "#ffe07a" : "#ffbc81", this.reef.light);
        warning.position.set(0, 0.38, -0.54);
        model.add(warning);
        const bar = new T.Group();
        const barBack = mesh(GEO.box, glow("#113b61"), 0, 0, 0, 1.64, 0.12, 0.044);
        const barFill = mesh(GEO.box, glow(enemyColor[e.kind]), -0.78, 0, 0.025, 1.55, 0.067, 0.035);
        const anchor = new T.Group();
        anchor.position.x = -0.77;
        barFill.position.x = 0.77;
        anchor.add(barFill);
        bar.add(barBack, anchor);
        this.scene.add(model, bar);
        // щит морской звезды (у черепахи — сияние панциря)
        const guard = new T.Mesh(GEO.sphere, e.kind === "turtle" ? SHELL : GUARD);
        guard.visible = false;
        model.add(guard);
        guard.scale.setScalar(e.kind === "turtle" ? 2.6 : e.radius * 1.25);
        record = { model, shadow, warning, bar, anchor, guard };
        this.actors.set(e.id, record);
      }
      const { model, shadow, warning, bar, anchor, guard } = record;
      const isBoss = !!LARGE[e.kind];
      const bob = Math.sin(time * (isBoss ? 2.2 : 4.3) + e.phase);
      const y = e.kind === "crab" ? 1.03 + bob * 0.07 : e.kind === "titan" ? 1.2 + bob * 0.05 : e.kind === "turtle" ? 1.0 + bob * 0.05 : e.kind === "chest" ? 1.25 + bob * 0.2 : 1.55 + bob * 0.15;
      model.position.set(e.x, y, e.z);
      model.rotation.y = e.kind === "mine" ? time * 2.8 : e.kind === "bubble" ? 0 : e.yaw;
      model.scale.setScalar((e.kind === "chest" ? 1.35 : 1) + e.flash * (isBoss ? 0.25 : 0.63));
      shadow.position.x = e.x;
      shadow.position.z = e.z + 0.23;
      // огонёк-предупреждение: вспышка от попадания либо «сейчас выстрелю / лопну / брошусь»
      let alarm = 0;
      if (e.kind === "jelly" || e.kind === "boss") alarm = (0.49 - e.fire) * 1.25;
      else if (e.kind === "titan") alarm = e.state === "stalk" ? (0.4 - e.fire) * 1.5 : e.state === "warn" ? 0.7 : 0;
      else if (e.kind === "puffer") alarm = e.swell > 0 ? 0.35 + 0.45 * Math.abs(Math.sin(e.swell * e.swell * 22)) : 0;
      else if (e.kind === "eel") alarm = e.state === "warn" ? 0.75 : e.state === "dash" ? 0.5 : 0;
      else if (e.kind === "turtle") alarm = e.state === "warn" ? 0.8 : e.state === "stalk" ? (0.4 - e.fire) * 1.5 : 0;
      else if (e.kind === "chest") alarm = 0.45 + 0.25 * Math.sin(time * 6); // сундучок мерцает золотом
      guard.visible = e.shield > 0 || (e.kind === "turtle" && e.hidden);
      if (guard.visible) guard.material.opacity = 0.22 + 0.1 * Math.sin(time * 9);
      warning.visible = e.flash > 0 || alarm > 0;
      warning.material.opacity = e.flash > 0 ? e.flash * 5.0 : alarm;
      warning.scale.setScalar(isBoss ? 3.7 : e.kind === "puffer" ? 2.3 + e.swell * 1.6 : 2.3);
      if (e.kind === "puffer") {
        // раздувается рывками, как будто набирает воздух
        const puff = 1 + e.swell * 0.7 + (e.swell > 0 ? Math.sin(e.swell * 40) * 0.05 : 0);
        model.userData.body.scale.setScalar(puff);
      } else if (e.kind === "eel") {
        const stretch = e.state === "dash" ? 1.25 : 1;
        model.userData.spine.forEach((link, i) => {
          link.position.x = Math.sin(time * (e.state === "dash" ? 22 : 7) - i * 0.9 + e.phase) * 0.05 * i * (e.state === "warn" ? 0.4 : 1);
          link.position.z = (-0.55 + i * 0.52) * stretch;
        });
        if (e.state === "warn") model.position.x += Math.sin(time * 60) * 0.05; // дрожит перед рывком
      } else if (e.kind === "titan" && e.state === "warn") {
        model.position.z -= 0.5 * e.lane?.heat || 0; // приседает перед броском
      } else if (e.kind === "ray") {
        model.userData.wings.forEach((wing, i) => { wing.rotation.z = (i ? -1 : 1) * Math.sin(time * 5 + e.phase) * 0.45; });
        model.position.y = 1.7 + bob * 0.2;
      } else if (e.kind === "bubble") {
        model.scale.setScalar(1 + Math.sin(time * 6 + e.phase) * 0.08 + e.flash * 0.6);
        model.position.y = 1.35 + bob * 0.25;
      } else if (e.kind === "star") {
        model.userData.halo.rotation.z = time * 2;
        model.userData.halo.scale.setScalar(1.25 + Math.sin(time * 4) * 0.08);
      } else if (e.kind === "chest") {
        model.userData.float.position.y = 1.15 + Math.sin(time * 3 + e.phase) * 0.06;
        model.rotation.z = Math.sin(time * 2 + e.phase) * 0.15;
      } else if (e.kind === "turtle") {
        // прячет голову и ласты в панцирь
        const tuck = e.hidden ? 1 : e.state === "warn" ? 0.5 : 0;
        const ud = model.userData;
        ud.tuck = (ud.tuck || 0) + (tuck - (ud.tuck || 0)) * 0.2;
        ud.head.scale.setScalar(1 - ud.tuck * 0.8);
        ud.head.position.z = -2.0 + ud.tuck * 1.3;
        ud.flippers.forEach((f, i) => {
          f.scale.setScalar(1 - ud.tuck * 0.85);
          f.rotation.y = Math.sin(time * 3 + i) * 0.3 * (1 - ud.tuck);
        });
        ud.turrets.forEach(t => (t.visible = ud.tuck < 0.6));
      }
      model.userData.limbs?.forEach((limb, i) => {
        if (e.kind === "titan") {
          // клешни: щёлкают в засаде, широко раскрыты в броске
          const side = i ? 1 : -1;
          limb.rotation.y = side * (e.state === "charge" ? 0.5 : e.state === "warn" ? -0.35 : Math.sin(time * 5 + i * 2) * 0.22);
          return;
        }
        limb.rotation.z = Math.sin(time * 4.5 + i * 0.68) * (isBoss ? 0.22 : 0.24);
        limb.userData.segments?.forEach((segment, j) => {
          segment.position.y = Math.sin(time * 5 + i * 0.4 + j * 0.7) * (j * 0.12);
        });
      });
      bar.visible = e.health < e.maxHealth && !isBoss && e.kind !== "bubble";
      bar.position.set(model.position.x, y + 0.55, e.z - 1.15);
      bar.quaternion.copy(this.camera.quaternion);
      anchor.scale.x = Math.max(0, e.health / e.maxHealth);
    }
    // лучи щита от морских звёзд к соседям
    const links = game.links || [];
    this.linkBeams.forEach((beam, i) => {
      const link = links[i];
      beam.visible = !!link;
      if (!link) return;
      const dx = link.x2 - link.x1, dz = link.z2 - link.z1;
      beam.position.set((link.x1 + link.x2) / 2, 1.45, (link.z1 + link.z2) / 2);
      beam.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
      beam.scale.set(0.16 + 0.05 * Math.sin(time * 14 + i), Math.hypot(dx, dz), 1);
    });
    for (const [id, record] of this.actors) {
      if (active.has(id)) continue;
      record.warning.material.dispose();
      // Each bar has two small materials. Enemy models share their materials.
      record.bar.traverse(part => part.material?.dispose());
      this.scene.remove(record.model, record.shadow, record.bar);
      this.actors.delete(id);
    }

    const pearlIds = new Set();
    for (const data of game.pearls) {
      pearlIds.add(data.id);
      let gem = this.drops.get(data.id);
      if (!gem) {
        gem = pearl(data.rare);
        // жемчуг «течения» и дождя крупнее и светится, чтобы его было видно на бликах дна
        const halo = sprite(data.rare ? "#ffd77f" : "#e8fbff", this.reef.light);
        halo.scale.setScalar(data.rare ? 2.2 : 1.5);
        halo.material.opacity = 0.75;
        gem.add(halo);
        if (data.flow) gem.scale.setScalar(1.35);
        this.drops.set(data.id, gem);
        this.scene.add(gem);
      }
      gem.position.set(data.x, 1.42 + Math.sin(time * 6 + data.id) * 0.18, data.z);
      gem.rotation.set(time * 1.7, time * 3.5, time * 0.64);
    }
    for (const [id, gem] of this.drops) {
      if (!pearlIds.has(id)) {
        gem.children[2]?.material.dispose();
        this.scene.remove(gem);
        this.drops.delete(id);
      }
    }

    const capsuleIds = new Set();
    for (const data of game.capsules || []) {
      capsuleIds.add(data.id);
      let model = this.capsules.get(data.id);
      if (!model) {
        model = capsule(data.kind);
        this.capsules.set(data.id, model);
        this.scene.add(model);
      }
      model.position.set(data.x, 1.5 + Math.sin(time * 5 + data.id) * 0.15, data.z);
      model.userData.inner.rotation.set(time * 2, time * 3, 0);
      model.children[2].rotation.set(Math.PI / 2, 0, time * 2);
      // перед тем как исчезнуть, капсула мигает
      model.visible = data.life > 2.5 || Math.sin(time * 20) > 0;
    }
    for (const [id, model] of this.capsules) {
      if (!capsuleIds.has(id)) {
        this.scene.remove(model);
        this.capsules.delete(id);
      }
    }

    const shotIds = new Set();
    for (const b of game.shots) {
      shotIds.add(b.id);
      let bolt = this.bolts.get(b.id);
      if (!bolt && b.torpedo) {
        bolt = torpedo();
        this.scene.add(bolt);
        this.bolts.set(b.id, bolt);
      }
      if (!bolt) {
        const material = b.friendly ? FRIENDLY : b.heavy ? HEAVY : HOSTILE;
        bolt = mesh(GEO.sphere, material, 0, 0, 0, b.friendly ? 0.113 : b.heavy ? 0.24 : 0.18, 0.13, b.friendly ? 0.84 : 0.51);
        const halo = sprite(b.friendly ? "#42effc" : b.heavy ? "#fa67c5" : "#ff9f4c", this.reef.light);
        // Attach the halo in world units outside the scaled projectile mesh.
        const group = new T.Group();
        group.add(bolt, halo);
        halo.scale.setScalar(b.friendly ? 1.45 : b.heavy ? 1.7 : 1.31);
        halo.material.opacity = 0.63;
        bolt = group;
        this.scene.add(bolt);
        this.bolts.set(b.id, bolt);
      }
      bolt.position.set(b.x, b.friendly ? 1.42 : 1.22, b.z);
      bolt.rotation.y = Math.atan2(b.vx, b.vz) + (b.torpedo ? Math.PI : 0);
      if (b.torpedo && Math.random() < 0.35) this.bubbles(b.x - b.vx * 0.03, b.z - b.vz * 0.03, 1, 0.1);
    }
    for (const [id, bolt] of this.bolts) {
      if (!shotIds.has(id)) {
        if (bolt.children[1].isSprite) bolt.children[1].material.dispose();
        this.scene.remove(bolt);
        this.bolts.delete(id);
      }
    }
  }

  reset() {
    // Clear render-only state before a new game reuses entity IDs.
    for (const fx of this.ripples) {
      fx.ring.material.dispose();
      this.scene.remove(fx.ring);
    }
    this.ripples.length = this.particles.length = this.chunks.length = 0;
    this.updateActors({ enemies: [], shots: [], pearls: [], capsules: [] }, this.visualTime);
  }

  draw(game, dt) {
    this.visualTime += dt;
    const t = this.visualTime;
    const idle = game.mode === "menu";
    const p = game.player;
    const heroScale = idle ? (this.aspect > 1.16 ? 2.55 : 2.22) : 1;
    this.player.position.set(idle ? this.aspect > 1.16 ? 4.9 : 0 : p.x,
      idle ? 2.65 + Math.sin(t * 1.9) * 0.17 : 1.4 + Math.sin(t * 4.5) * 0.06,
      idle ? -2.8 : p.z);
    const yaw = idle ? -0.92 + Math.sin(t * 0.85) * 0.38 : p.yaw;
    const delta = T.MathUtils.euclideanModulo(yaw - this.player.rotation.y + Math.PI, TAU) - Math.PI;
    this.player.rotation.y += delta * Math.min(1, dt * (idle ? 5 : 14));
    this.player.rotation.z = idle ? 0.14 : T.MathUtils.clamp(-p.vx * 0.024, -0.31, 0.31);
    this.player.rotation.x = idle ? -0.09 : T.MathUtils.clamp(p.vz * 0.018, -0.18, 0.18);
    this.player.scale.setScalar(heroScale);
    this.player.userData.propeller.rotation.z += dt * (idle ? 4.5 : 8.4);
    this.player.visible = p.health > 0;
    this.player.userData.barrels[0].visible = p.barrels >= 2;
    this.player.userData.barrels[1].visible = p.barrels >= 3;
    // пузырьки из-под винта, пока лодка движется
    this.trail -= dt;
    if (!idle && this.trail <= 0 && p.health > 0 && Math.hypot(p.vx, p.vz) > 2.5 && this.particles.length < 380) {
      this.trail = 0.07;
      const back = this.player.rotation.y;
      this.particles.push({
        x: p.x + Math.sin(back) * 1.5 + (Math.random() - 0.5) * 0.3, y: 1.3, z: p.z + Math.cos(back) * 1.5 + (Math.random() - 0.5) * 0.3,
        vx: -p.vx * 0.12, vz: -p.vz * 0.12, vy: 0.9 + Math.random() * 0.8,
        life: 0.5 + Math.random() * 0.35, size: 0.05 + Math.random() * 0.06, tint: BUBBLE,
      });
    }
    const lanes = game.lanes || [];
    this.laneBands.forEach((band, i) => {
      const lane = lanes[i];
      band.visible = !!lane;
      if (!lane) return;
      // группа лежит на дне: её ось x — поперёк полосы, ось y — вдоль
      const width = lane.row ? 2.3 : 3.9;
      const length = lane.row ? this.bounds.x * 2 + 4 : this.bounds.near + 7.5;
      band.rotation.z = lane.row ? Math.PI / 2 : 0;
      if (lane.row) band.position.set(0, -0.24, lane.at);
      else band.position.set(lane.at, -0.24, this.bounds.near + 1 - length / 2);
      band.children[0].scale.set(width, length, 1);
      for (const k of [1, 2]) {
        band.children[k].scale.set(0.12, length, 1);
        band.children[k].position.x = (k === 1 ? -0.5 : 0.5) * width;
      }
      const blink = 0.5 + 0.5 * Math.sin(t * 24);
      band.userData.fill.opacity = lane.live ? 0.5 : 0.12 + lane.heat * 0.2 + blink * 0.1;
      band.userData.edge.opacity = lane.live ? 1 : 0.45 + blink * 0.45;
    });
    const beam = game.beam;
    this.beamBand.visible = !!beam;
    this.beamCore.visible = !!beam && beam.charge <= 0;
    if (beam) {
      const length = 12 - beam.z;
      const x = beam.x;
      const z = beam.z + length / 2;
      const active = beam.charge <= 0;
      this.beamBand.position.set(x, -0.25, z);
      this.beamBand.scale.set(2.24, length, 1);
      this.beamBand.material.opacity = active ? beam.flash * 1.9 : 0.28 + 0.18 * Math.sin(t * 16);
      this.beamCore.position.set(x, 1.27, z);
      this.beamCore.scale.set(0.76, length, 1);
      this.beamCore.material.opacity = beam.flash * 2.15;
    }
    // пузырь-щит и кольцо «тройного залпа»
    const shielded = !idle && p.bubble > 0 && p.health > 0;
    this.playerShield.visible = shielded;
    if (shielded) {
      this.playerShield.position.copy(this.player.position);
      this.playerShield.scale.setScalar(1.55 + Math.sin(t * 5) * 0.05 + (p.bubble > 1 ? 0.15 : 0));
      SHIELD_SKIN.opacity = 0.18 + 0.06 * Math.sin(t * 7);
    }
    this.spreadRing.visible = !idle && p.spread > 0;
    if (this.spreadRing.visible) {
      this.spreadRing.position.set(this.player.position.x, 0.4, this.player.position.z);
      this.spreadRing.scale.setScalar(1.6 + Math.sin(t * 10) * 0.1);
      this.spreadRing.material.opacity = Math.min(0.7, p.spread / 2);
    }
    this.playerShadow.position.x = this.player.position.x;
    this.playerShadow.position.z = this.player.position.z;
    this.playerShadow.scale.set(heroScale * 3.35, heroScale * 2.82, 1);
    this.shotGlow = Math.max(0, this.shotGlow - dt * 7.5);
    this.shipLight.visible = this.shotGlow > 0;
    this.shipLight.material.opacity = this.shotGlow * 0.56;
    this.shipLight.scale.setScalar(1.35 + this.shotGlow * 0.35);
    if (!this.reduced) {
      this.reef.sand.offset.set(t * 0.012, Math.sin(t * 0.24) * 0.08);
      this.reef.plankton.position.set(Math.sin(t * 0.33) * 1.5, Math.sin(t * 0.18) * 0.7, Math.cos(t * 0.26) * 0.5);
      this.reef.caustic.uTime.value = t;
      this.reef.shafts.children.forEach(shaft => {
        shaft.rotation.z = -0.55 + Math.sin(t * 0.3 + shaft.userData.phase) * 0.06;
        shaft.material.opacity = 0.11;
      });
    }
    this.freezeLook += ((game.freeze > 0 ? 1 : 0) - this.freezeLook) * Math.min(1, dt * 4);
    this.paintDepth(idle ? 0 : game.theme ?? Math.max(0, game.wave - 1), dt);
    this.swim(t, dt);
    this.updateActors(game, t);
    this.effects(dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const jolt = this.reduced ? 0 : this.shake * this.shake;
    this.camera.position.set(this.cameraBase.x + Math.sin(t * 71) * jolt * 0.5, this.cameraBase.y, this.cameraBase.z + Math.cos(t * 57) * jolt * 0.5);
    if (this.composer && this.preset.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // вода, свет и дно плавно перетекают в оформление текущей глубины
  paintDepth(index, dt) {
    const theme = THEMES[Math.min(index, THEMES.length - 1)];
    const k = Math.min(1, dt * 1.6);
    const { key, rim, hemi } = this.lights;
    // бонус «заморозка»: вода светлеет и голубеет
    const ice = this.freezeLook;
    this.scene.background.lerp(ice > 0.01 ? this.mix(theme.bg, ice) : theme.bg, k);
    this.scene.fog.color.lerp(ice > 0.01 ? this.mix(theme.fog, ice) : theme.fog, k);
    this.reef.shaftMat.color.lerp(theme.key, k);
    this.reef.caustic.uTint.value.lerp(theme.sky, k);
    this.reef.floorMat.color.lerp(theme.floor, k);
    hemi.color.lerp(theme.sky, k);
    hemi.groundColor.lerp(theme.ground, k);
    hemi.intensity += (theme.hemi - hemi.intensity) * k;
    key.color.lerp(theme.key, k);
    key.intensity += (theme.keyPower - key.intensity) * k;
    rim.color.lerp(theme.rim, k);
    rim.intensity += (theme.rimPower - rim.intensity) * k;
    this.reef.plankton.material.color.lerp(theme.motes, k);
    this.school.material.color.lerp(theme.fish, k);
    // декорации: прежние уходят в песок, новые вырастают
    this.sets.forEach((set, i) => {
      const goal = i === index ? 1 : 0;
      if (set.userData.show === goal) return;
      set.userData.show = Math.abs(goal - set.userData.show) < 0.01 ? goal : set.userData.show + (goal - set.userData.show) * Math.min(1, dt * 2.4);
      set.visible = set.userData.show > 0.01;
      set.scale.y = Math.max(0.01, set.userData.show);
    });
  }

  mix(color, amount) {
    return (this.mixed || (this.mixed = new T.Color())).copy(color).lerp(ICE, amount * 0.45);
  }

  // стайка проплывает арену наискосок у самого дна и появляется снова с другой стороны
  swim(t, dt) {
    const path = this.schoolPath;
    const travel = (t - path.start) / 15;
    if (travel > 1 || travel < 0) {
      path.start = t;
      path.from = Math.random() < 0.5 ? -1 : 1;
      path.z = -7 + Math.random() * 13;
      path.tilt = (Math.random() - 0.5) * 6;
      return;
    }
    const span = this.bounds.x + 5;
    const cx = path.from * span * (1 - travel * 2);
    const cz = path.z + path.tilt * (travel - 0.5);
    const heading = Math.atan2(path.from * span * 2, -path.tilt); // нос рыбки смотрит в −z
    this.fish.forEach((fish, i) => {
      const wave = this.reduced ? 0 : Math.sin(t * 9 + fish.phase);
      this.dummy.position.set(cx + fish.x + Math.sin(t * 0.7 + fish.phase) * 0.2, 0.05 + (i % 3) * 0.14, cz + fish.z + Math.cos(t * 0.9 + fish.phase) * 0.2);
      this.dummy.rotation.set(0, heading + wave * 0.22, 0);
      this.dummy.scale.setScalar(0.8 + (i % 4) * 0.12);
      this.dummy.updateMatrix();
      this.school.setMatrixAt(i, this.dummy.matrix);
    });
    this.school.instanceMatrix.needsUpdate = true;
  }
}
