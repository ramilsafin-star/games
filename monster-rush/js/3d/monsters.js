// Монстры: мультяшные, без крови. В каждом мире свой окрас, у каждого босса свой облик. Смотрят в +Z, на героя.
import * as T from '../../vendor/three/three.module.min.js?v=d3800c69';
import { Kit, group, part, toyMaterial, glowMaterial, flat, place } from './kit.js?v=d3800c69';

const glow = glowMaterial();
const DARK = 0x2a1a2c;
const BONE = 0xffeac4;
const STEEL = 0x8f98ad;
const STEEL_DARK = 0x5a627a;

const SKINS = {
  grunt: [[0x9ee03c, 0xd9f58c, 0x5fa828], [0xff7ac6, 0xffc2e6, 0xc94f9b], [0xff9a3d, 0xffd38c, 0xc7632a]],
  spitter: [[0xff8a3d, 0xffc98c, 0xc9601f], [0x45e0ff, 0xb5f5ff, 0x1f9dc9], [0xc9e04a, 0xeef59a, 0x8aa32a]],
  brute: [[0xa66cf2, 0xd5b5ff, 0x7240bf], [0x5a7bff, 0xb2c2ff, 0x3550c9], [0x8a4a6f, 0xc98aa8, 0x5a2d48]],
};

function fangs(k, x, y, z, n, width, h, up = true) {
  for (let i = 0; i < n; i++) {
    const px = x + (n > 1 ? (i / (n - 1) - 0.5) * width : 0);
    k.cone(BONE, px, y, z, h * 0.42, h, up ? 0 : Math.PI, 0, 0, 6);
  }
}

// Небольшие сердитые глаза: без выпученных шаров
function eyes(k, x, y, z, w, h, iris = DARK, browColor = DARK, browDrop = 0.3) {
  for (const s of [-1, 1]) {
    k.ball(0xfffbe0, s * x, y, z, w, h, w * 0.5);
    k.ball(iris, s * x * 0.94, y - h * 0.08, z + w * 0.42, w * 0.46, h * 0.56, w * 0.14);
    k.box(browColor, s * x, y + h * 0.82, z + w * 0.3, w * 2.4, h * 0.5, w * 0.6, 0, 0, s * browDrop, h * 0.14);
  }
}

function limb(c, shade, length, r, fist, claws) {
  const k = new Kit();
  k.loft(c, [
    { y: 0.12 * r / 0.2, rx: r * 0.7 },
    { y: 0, rx: r },
    { y: -length * 0.55, rx: r * 0.86 },
    { y: -length, rx: r * 0.8 },
  ], { seg: 10 });
  k.ball(shade, 0, -length - fist * 0.3, 0.02, fist, fist * 0.88, fist);
  for (let i = 0; i < claws; i++) k.cone(BONE, (i - (claws - 1) / 2) * fist * 0.62, -length - fist * 0.92, fist * 0.34, fist * 0.2, fist * 0.62, 0.35 + Math.PI, 0, 0, 5);
  return k.build();
}

function leg(c, shade, length, r, foot) {
  const k = new Kit();
  k.loft(c, [
    { y: 0.1, rx: r * 0.7 },
    { y: 0, rx: r },
    { y: -length * 0.7, rx: r * 0.82 },
    { y: -length, rx: r * 0.75 },
  ], { seg: 10 });
  k.ball(shade, 0, -length - foot * 0.25, foot * 0.4, foot * 0.9, foot * 0.5, foot * 1.25);
  for (const s of [-1, 0, 1]) k.cone(BONE, s * foot * 0.52, -length - foot * 0.42, foot * 1.48, foot * 0.16, foot * 0.42, Math.PI / 2, 0, 0, 5);
  return k.build();
}

function buildGrunt(level) {
  const [c, light, shade] = SKINS.grunt[level];
  const k = new Kit();
  const g = new Kit();
  k.loft(c, [
    { y: 0.38, rx: 0.34 },
    { y: 0.48, rx: 0.5, rz: 0.46 },
    { y: 0.8, rx: 0.6, rz: 0.54 },
    { y: 1.15, rx: 0.54, rz: 0.5 },
    { y: 1.42, rx: 0.4, rz: 0.38 },
    { y: 1.58, rx: 0.16, rz: 0.16 },
  ], { seg: 16 });
  k.ball(light, 0, 0.74, 0.36, 0.36, 0.34, 0.2);
  for (const [x, y, z, r] of [[-0.3, 1.2, -0.3, 0.13], [0.2, 1.36, -0.24, 0.11], [0.34, 0.94, -0.38, 0.12], [-0.12, 0.92, -0.5, 0.14], [0.05, 1.5, -0.08, 0.08]]) k.blob(shade, x, y, z, r, r, r * 0.6);
  eyes(k, 0.2, 1.2, 0.42, 0.105, 0.09);
  // Рот с клыками
  k.ball(DARK, 0, 0.98, 0.47, 0.26, 0.09, 0.07);
  fangs(k, 0, 0.96, 0.53, 2, 0.28, 0.13);
  fangs(k, 0, 1.05, 0.53, 3, 0.26, 0.07, false);
  for (const s of [-1, 1]) {
    k.cone(BONE, s * 0.27, 1.56, 0.02, 0.07, 0.3, 0.1, 0, s * -0.42, 7);
    k.ball(light, s * 0.52, 1.24, -0.02, 0.1, 0.05, 0.12, 0, 0, s * 0.3);
  }
  return {
    body: k.build({ y0: 0.3, y1: 1.2, low: 0.82, high: 1.04 }), light: g,
    arm: limb(c, shade, 0.34, 0.12, 0.15, 3), leg: leg(c, shade, 0.26, 0.13, 0.15),
    armAt: [0.58, 0.96, 0.05], legAt: [0.27, 0.42, 0], bodyY: 0, scale: 1,
  };
}

function buildSpitter(level) {
  const [c, light, shade] = SKINS.spitter[level];
  const k = new Kit();
  const g = new Kit();
  k.loft(c, [
    { y: 0.34, rx: 0.3 },
    { y: 0.46, rx: 0.42, rz: 0.38 },
    { y: 0.8, rx: 0.46, rz: 0.42 },
    { y: 1.12, rx: 0.34, rz: 0.32 },
    { y: 1.34, rx: 0.32, rz: 0.3 },
  ], { seg: 14 });
  k.smooth(c, 0, 1.58, 0.06, 0.42, 0.38, 0.4);
  for (let i = 0; i < 4; i++) k.loft(light, [{ y: 0.52 + i * 0.2, rx: 0.455 - Math.abs(i - 1) * 0.04, rz: 0.42 - Math.abs(i - 1) * 0.03 }, { y: 0.59 + i * 0.2, rx: 0.44 - Math.abs(i - 1.2) * 0.04, rz: 0.41 - Math.abs(i - 1.2) * 0.03 }], { seg: 14 });
  // Круглая пасть, из которой летят плевки
  k.torus(shade, 0, 1.5, 0.42, 0.17, 0.058, 0, 0, 0, Math.PI * 2, 16);
  k.ball(DARK, 0, 1.5, 0.39, 0.15, 0.15, 0.05);
  g.add(new T.SphereGeometry(0.075, 10, 8).translate(0, 1.5, 0.43), 0xfff27a, 3.2);
  fangs(k, 0, 1.33, 0.48, 3, 0.2, 0.07);
  // Глазки над пастью
  eyes(k, 0.15, 1.78, 0.38, 0.078, 0.07);
  // Железы на спине светятся
  for (const [x, y, z, r] of [[-0.2, 1.05, -0.3, 0.13], [0.21, 0.88, -0.36, 0.14], [0.0, 1.28, -0.28, 0.12]]) {
    k.blob(shade, x, y, z, r * 1.2, r * 1.2, r * 0.9);
    g.add(new T.SphereGeometry(r * 0.82, 10, 8).translate(x, y, z - r * 0.46), 0xfff27a, 2.5);
  }
  for (const s of [-1, 1]) k.cone(BONE, s * 0.2, 1.97, -0.02, 0.05, 0.2, 0, 0, s * -0.3, 6);
  return {
    body: k.build({ y0: 0.3, y1: 1.2, low: 0.84, high: 1.03 }), light: g,
    arm: limb(c, shade, 0.3, 0.085, 0.11, 3), leg: leg(c, shade, 0.26, 0.11, 0.13),
    armAt: [0.45, 0.98, 0.06], legAt: [0.21, 0.4, 0], bodyY: 0, scale: 0.98,
  };
}

function buildBrute(level) {
  const [c, light, shade] = SKINS.brute[level];
  const k = new Kit();
  const g = new Kit();
  k.loft(c, [
    { y: 0.48, rx: 0.42, rz: 0.36 },
    { y: 0.6, rx: 0.62, rz: 0.48 },
    { y: 0.95, rx: 0.74, rz: 0.56 },
    { y: 1.34, rx: 0.9, rz: 0.64, p: 2.3 },
    { y: 1.62, rx: 0.76, rz: 0.54, p: 2.3 },
    { y: 1.78, rx: 0.4, rz: 0.34 },
  ], { seg: 18 });
  k.ball(light, 0, 0.82, 0.38, 0.46, 0.3, 0.2);
  // Голова глубоко в плечах, железный шлем
  k.smooth(c, 0, 1.78, 0.24, 0.36, 0.3, 0.32);
  k.add(place(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.84, 0.22, 0.38, 0.32, 0.35), STEEL);
  k.box(STEEL_DARK, 0, 1.85, 0.53, 0.72, 0.07, 0.12, 0, 0, 0, 0.025);
  k.box(STEEL_DARK, 0, 1.98, 0.5, 0.09, 0.24, 0.06, 0.5, 0, 0, 0.02);
  for (const s of [-1, 1]) k.cone(BONE, s * 0.36, 2.04, 0.2, 0.08, 0.36, 0, 0, s * -0.65, 7);
  for (const s of [-1, 1]) {
    k.ball(0xffc94a, s * 0.14, 1.76, 0.525, 0.052, 0.038, 0.018);
    k.ball(DARK, s * 0.138, 1.752, 0.54, 0.024, 0.024, 0.008);
  }
  k.ball(DARK, 0, 1.62, 0.5, 0.21, 0.07, 0.07);
  fangs(k, 0, 1.6, 0.55, 2, 0.26, 0.14);
  // Нагрудник с заклёпками и наплечники
  k.box(STEEL, 0, 1.3, 0.56, 0.86, 0.5, 0.14, -0.12, 0, 0, 0.05);
  for (const s of [-1, 1]) for (const dy of [-0.16, 0.16]) k.ball(STEEL_DARK, s * 0.34, 1.3 + dy, 0.635 - dy * 0.12, 0.035);
  k.box(0xff5a3c, 0, 1.31, 0.635, 0.2, 0.09, 0.03, -0.12, 0, 0, 0.012);
  for (const s of [-1, 1]) {
    k.add(place(new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), s * 0.86, 1.58, 0, 0.38, 0.28, 0.4, 0, 0, s * -0.3), STEEL);
    for (let i = 0; i < 3; i++) k.cone(BONE, s * (0.72 + i * 0.16), 1.82 - i * 0.07, -0.12 + i * 0.12, 0.05, 0.26, 0, 0, s * (-0.25 - i * 0.14), 6);
  }
  return {
    body: k.build({ y0: 0.4, y1: 1.4, low: 0.82, high: 1.03 }), light: g,
    arm: limb(c, shade, 0.62, 0.17, 0.27, 3), leg: leg(c, shade, 0.34, 0.19, 0.22),
    armAt: [0.95, 1.36, 0.02], legAt: [0.36, 0.5, 0], bodyY: 0, scale: 1.05,
  };
}

function buildBarrel() {
  const k = new Kit();
  const g = new Kit();
  k.cyl(0xe53935, 0, 0.66, 0, 0.5, 0.5, 1.2, 0, 0, 0, 18);
  k.cyl(0xbd2a2c, 0, 0.66, 0, 0.53, 0.53, 0.13, 0, 0, 0, 18);
  for (const y of [0.1, 1.24]) k.cyl(0x3a3148, 0, y, 0, 0.54, 0.54, 0.13, 0, 0, 0, 18);
  k.cyl(0x6a6078, 0, 1.3, 0, 0.42, 0.46, 0.05, 0, 0, 0, 18);
  // Полосы опасности
  k.cyl(0xffc531, 0, 0.92, 0, 0.51, 0.51, 0.2, 0, 0, 0, 18);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.box(0x241d2c, Math.sin(a) * 0.51, 0.92, Math.cos(a) * 0.51, 0.13, 0.21, 0.03, 0, a, 0.5, 0.004);
  }
  // Значок взрыва спереди
  g.add(new T.SphereGeometry(0.13, 10, 8).scale(1, 1, 0.3).translate(0, 0.42, 0.5), 0xffd24a, 2.6);
  return { body: k.build({ y0: 0, y1: 0.8, low: 0.84, high: 1 }), light: g, bodyY: 0, scale: 1 };
}

// Боссы. Геометрия общая по размеру (высота около 2.1), затем модель масштабируется
function buildCrusher() {
  // Крошитель: каменный великан с шипастыми кулаками
  const c = 0xe0533f;
  const rock = 0x8c4a3f;
  const k = new Kit();
  const g = new Kit();
  k.loft(c, [
    { y: 0.45, rx: 0.45, rz: 0.4 },
    { y: 0.65, rx: 0.68, rz: 0.52 },
    { y: 1.05, rx: 0.86, rz: 0.62 },
    { y: 1.45, rx: 0.98, rz: 0.68, p: 2.3 },
    { y: 1.72, rx: 0.72, rz: 0.52 },
    { y: 1.88, rx: 0.42, rz: 0.36 },
  ], { seg: 20 });
  k.ball(0xf28a62, 0, 0.84, 0.38, 0.52, 0.32, 0.22);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI - Math.PI / 2;
    k.rock(rock, Math.sin(a) * 0.86, 1.5 + (i % 3) * 0.14, -Math.cos(a) * 0.44 - 0.1, 0.27 + (i % 2) * 0.1, 0.25, 0.25, i);
  }
  k.rock(rock, -0.86, 1.66, 0.05, 0.46, 0.34, 0.42, 3);
  k.rock(rock, 0.86, 1.66, 0.05, 0.46, 0.34, 0.42, 7);
  // Сияющее ядро на груди
  g.add(flat(place(new T.IcosahedronGeometry(1, 0), 0, 1.25, 0.66, 0.28, 0.32, 0.1, 0, 0, 0.7)), 0xffd24a, 3.3);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28;
    k.box(rock, Math.cos(a) * 0.36, 1.25 + Math.sin(a) * 0.36, 0.6, 0.16, 0.16, 0.12, 0, 0, a);
  }
  // Голова
  k.smooth(c, 0, 1.88, 0.26, 0.4, 0.32, 0.34);
  for (const s of [-1, 1]) {
    k.cone(BONE, s * 0.32, 2.16, 0.16, 0.1, 0.46, -0.15, 0, s * -0.42, 8);
    k.cone(BONE, s * 0.5, 1.96, 0.14, 0.08, 0.32, 0, 0, s * -1.05, 7);
    k.ball(0xfff27a, s * 0.15, 1.92, 0.57, 0.056, 0.038, 0.016);
    k.box(DARK, s * 0.15, 1.98, 0.57, 0.17, 0.05, 0.05, 0, 0, s * 0.35, 0.016);
  }
  k.ball(DARK, 0, 1.72, 0.55, 0.26, 0.1, 0.08);
  fangs(k, 0, 1.7, 0.62, 2, 0.34, 0.2);
  fangs(k, 0, 1.79, 0.61, 3, 0.3, 0.09, false);
  const arm = new Kit();
  arm.loft(c, [{ y: 0.18, rx: 0.2 }, { y: 0, rx: 0.27 }, { y: -0.5, rx: 0.22 }, { y: -0.72, rx: 0.2 }], { seg: 12 });
  arm.rock(rock, 0, -0.9, 0.03, 0.42, 0.38, 0.42, 5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28;
    arm.cone(BONE, Math.cos(a) * 0.36, -0.9 + Math.sin(a) * 0.32, 0.12, 0.07, 0.3, Math.PI / 2 - Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9, 6);
  }
  return {
    body: k.build({ y0: 0.4, y1: 1.5, low: 0.8, high: 1.03 }), light: g,
    arm: arm.build(), leg: leg(c, rock, 0.34, 0.24, 0.28), armAt: [1.12, 1.48, 0.04], legAt: [0.42, 0.5, 0], bodyY: 0, scale: 3.1,
  };
}

function buildQueen() {
  // Матка разлома: бирюзовая королева с кристальной короной и шипами
  const c = 0x2fbfae;
  const light = 0x9df5e0;
  const k = new Kit();
  const g = new Kit();
  k.loft(c, [
    { y: 0.42, rx: 0.42, rz: 0.4 },
    { y: 0.65, rx: 0.8, rz: 0.72 },
    { y: 1.0, rx: 0.86, rz: 0.76 },
    { y: 1.35, rx: 0.62, rz: 0.56 },
    { y: 1.62, rx: 0.42, rz: 0.4 },
    { y: 1.82, rx: 0.36, rz: 0.34 },
  ], { seg: 20 });
  for (let i = 0; i < 4; i++) k.loft(light, [{ y: 0.62 + i * 0.2, rx: 0.8 + (i === 1 ? 0.07 : 0) - i * 0.06, rz: 0.72 + (i === 1 ? 0.05 : 0) - i * 0.05 }, { y: 0.67 + i * 0.2, rx: 0.8 + (i === 1 ? 0.07 : 0) - i * 0.06, rz: 0.72 + (i === 1 ? 0.05 : 0) - i * 0.05 }], { seg: 20 });
  // Светящийся живот
  g.add(new T.SphereGeometry(1, 14, 10).scale(0.4, 0.34, 0.14).translate(0, 0.86, 0.68), 0xff5fc0, 2.7);
  // Кристаллы на спине
  const colors = [0xff5fc0, 0x8ff5ff, 0xdcb0ff];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI - Math.PI / 2;
    const h = 0.48 + (i % 3) * 0.2;
    g.add(flat(place(new T.ConeGeometry(0.13, h, 5), Math.sin(a) * 0.72, 1.06 + (i % 2) * 0.22, -Math.cos(a) * 0.54, 1, 1, 1, -0.55 * Math.cos(a), 0, -Math.sin(a) * 0.6)), colors[i % 3], 1.8);
  }
  // Голова: корона из кристаллов и три глаза
  k.smooth(c, 0, 1.92, 0.2, 0.36, 0.32, 0.32);
  for (let i = 0; i < 5; i++) {
    const a = ((i - 2) / 2) * 0.85;
    g.add(flat(place(new T.ConeGeometry(0.07, 0.42 - Math.abs(i - 2) * 0.07, 5), Math.sin(a) * 0.32, 2.3 - Math.abs(i - 2) * 0.05, 0.12, 1, 1, 1, 0, 0, -a * 0.8)), colors[i % 3], 2.5);
  }
  k.loft(0xffc531, [{ y: 2.1, rx: 0.32, rz: 0.29, z: 0.18 }, { y: 2.16, rx: 0.31, rz: 0.28, z: 0.18 }], { seg: 16 });
  for (const [x, y, r] of [[-0.16, 1.98, 0.05], [0.16, 1.98, 0.05], [0, 2.04, 0.04]]) g.add(new T.SphereGeometry(r, 10, 8).scale(1, 0.72, 0.35).translate(x, y, 0.5), 0x8ff5ff, 3.4);
  k.ball(DARK, 0, 1.76, 0.5, 0.18, 0.06, 0.06);
  fangs(k, 0, 1.75, 0.55, 2, 0.22, 0.13);
  const arm = new Kit();
  arm.loft(c, [{ y: 0.12, rx: 0.12 }, { y: 0, rx: 0.17 }, { y: -0.55, rx: 0.13 }, { y: -0.8, rx: 0.1 }], { seg: 10 });
  arm.add(flat(place(new T.ConeGeometry(0.15, 0.6, 5), 0, -1.08, 0.04, 1, 1, 1, Math.PI, 0, 0)), 0xdcb0ff);
  return {
    body: k.build({ y0: 0.4, y1: 1.5, low: 0.82, high: 1.04 }), light: g,
    arm: arm.build(), leg: leg(c, 0x1f8f88, 0.34, 0.2, 0.26), armAt: [0.86, 1.34, 0.08], legAt: [0.42, 0.48, 0], bodyY: 0, scale: 3.1,
  };
}

function buildTitan() {
  // Титан пепла: чёрный камень и лава в трещинах
  const c = 0x362436;
  const rock = 0x4e3148;
  const lava = 0xff7a1f;
  const k = new Kit();
  const g = new Kit();
  k.loft(c, [
    { y: 0.45, rx: 0.48, rz: 0.4 },
    { y: 0.68, rx: 0.72, rz: 0.54 },
    { y: 1.08, rx: 0.9, rz: 0.64 },
    { y: 1.48, rx: 1.04, rz: 0.72, p: 2.4 },
    { y: 1.74, rx: 0.78, rz: 0.56 },
    { y: 1.9, rx: 0.42, rz: 0.36 },
  ], { seg: 20 });
  // Лава в трещинах на груди и плечах
  const cracks = [
    [0, 1.12, 0.6, 0.07, 0.72, 0.1], [-0.28, 1.34, 0.6, 0.06, 0.46, -0.65], [0.28, 1.34, 0.6, 0.06, 0.46, 0.65],
    [-0.22, 0.88, 0.56, 0.05, 0.36, 0.55], [0.22, 0.88, 0.56, 0.05, 0.36, -0.55], [-0.52, 1.08, 0.46, 0.05, 0.36, 0.3], [0.52, 1.08, 0.46, 0.05, 0.36, -0.3],
  ];
  for (const [x, y, z, w, h, rz] of cracks) g.add(place(new T.BoxGeometry(w, h, 0.06), x, y, z, 1, 1, 1, 0, 0, rz), lava, 2.9);
  g.add(new T.SphereGeometry(0.22, 12, 8).scale(1, 1, 0.45).translate(0, 1.42, 0.68), 0xffd24a, 3.6);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI - Math.PI / 2;
    k.rock(rock, Math.sin(a) * 0.94, 1.5 + (i % 3) * 0.12, -Math.cos(a) * 0.5 - 0.08, 0.28 + (i % 2) * 0.12, 0.26, 0.26, i + 9);
  }
  // Жерла на плечах
  for (const s of [-1, 1]) {
    k.add(flat(place(new T.CylinderGeometry(0.18, 0.42, 0.5, 8), s * 0.9, 1.88, -0.02)), rock);
    g.add(new T.CylinderGeometry(0.17, 0.17, 0.03, 12).translate(s * 0.9, 2.13, -0.02), 0xffb347, 4);
  }
  // Голова и рога
  k.smooth(c, 0, 1.92, 0.25, 0.38, 0.32, 0.34);
  for (const s of [-1, 1]) {
    k.cone(0x201420, s * 0.34, 2.26, 0.14, 0.11, 0.66, -0.3, 0, s * -0.42, 8);
    g.add(new T.SphereGeometry(0.056, 8, 6).scale(1, 0.72, 0.3).translate(s * 0.15, 1.96, 0.56), 0xfff27a, 4.5);
    k.box(0x201420, s * 0.15, 2.02, 0.56, 0.18, 0.05, 0.05, 0, 0, s * 0.38, 0.016);
  }
  g.add(new T.SphereGeometry(1, 10, 8).scale(0.24, 0.07, 0.05).translate(0, 1.76, 0.56), lava, 3.2);
  fangs(k, 0, 1.73, 0.62, 2, 0.32, 0.2);
  const arm = new Kit();
  arm.loft(c, [{ y: 0.18, rx: 0.22 }, { y: 0, rx: 0.3 }, { y: -0.5, rx: 0.24 }, { y: -0.72, rx: 0.22 }], { seg: 12 });
  arm.rock(rock, 0, -0.92, 0.03, 0.44, 0.4, 0.44, 13);
  const armGlow = new Kit();
  armGlow.add(new T.BoxGeometry(0.06, 0.55, 0.06).translate(0.14, -0.35, 0.22), lava, 2.8);
  armGlow.add(new T.SphereGeometry(0.15, 10, 8).translate(0, -0.92, 0.38), 0xffb347, 3);
  return {
    body: k.build({ y0: 0.4, y1: 1.5, low: 0.78, high: 1.05 }), light: g,
    arm: arm.build(), armLight: armGlow.build(), leg: leg(c, rock, 0.34, 0.25, 0.3), armAt: [1.2, 1.5, 0.04], legAt: [0.44, 0.5, 0], bodyY: 0, scale: 3.2,
  };
}

function buildWall() {
  const body = new Kit(), light = new Kit();
  body.box(0x432b71, 0, 0.32, 0, 2.5, 0.58, 1);
  for (const [x, height] of [[-0.83, 1.35], [0, 2.15], [0.83, 1.55]]) {
    body.cone(0x814ade, x, height * 0.55, 0, 0.57, height, 0, 0, 0.1, 6);
    light.box(0xa1edff, x, 0.48, 0.46, 0.14, 0.49, 0.05);
  }
  return { body: body.build(), light, scale: 1 };
}

const cache = new Map();
function geometry(type, level) {
  const key = type === 'barrel' ? 'barrel' : `${type}:${level}`;
  if (cache.has(key)) return cache.get(key);
  let g;
  if (type === 'grunt') g = buildGrunt(level);
  else if (type === 'spitter') g = buildSpitter(level);
  else if (type === 'brute') g = buildBrute(level);
  else if (type === 'barrel') g = buildBarrel();
  else if (type === 'wall') g = buildWall();
  else g = [buildCrusher, buildQueen, buildTitan][level]();
  g.light = g.light.parts.length ? g.light.build() : null;
  cache.set(key, g);
  return g;
}

export const CHUNK_COLORS = {
  grunt: (l) => SKINS.grunt[l].slice(0, 3),
  spitter: (l) => SKINS.spitter[l].slice(0, 3),
  brute: (l) => [...SKINS.brute[l].slice(0, 2), STEEL],
  barrel: () => [0xe53935, 0xffc531, 0x3a3148],
  wall: () => [0xa768ff, 0x81efff, 0x52328f],
  boss: (l) => [[0xe0533f, 0x8c4a3f, 0xffd24a], [0x2fbfae, 0xff5fc0, 0x8ff5ff], [0x362436, 0x4e3148, 0xff7a1f]][l],
};

export class MonsterView {
  constructor(type, level) {
    const g = geometry(type, level);
    this.type = type;
    this.level = level;
    this.material = toyMaterial({ roughness: 0.55 });
    this.material.emissive = new T.Color(0xffffff);
    this.material.emissiveIntensity = 0;
    this.root = new T.Group();
    this.scale = g.scale;
    this.body = group(this.root);
    part(this.body, g.body, this.material);
    if (g.light) this.body.add(new T.Mesh(g.light, glow));
    this.arms = [];
    this.legs = [];
    if (g.arm) {
      for (const s of [-1, 1]) {
        const arm = group(this.body, s * g.armAt[0], g.armAt[1], g.armAt[2]);
        part(arm, g.arm, this.material);
        if (g.armLight) arm.add(new T.Mesh(g.armLight, glow));
        arm.rotation.z = s * 0.18;
        this.arms.push(arm);
        const legGroup = group(this.root, s * g.legAt[0], g.legAt[1], g.legAt[2]);
        part(legGroup, g.leg, this.material);
        this.legs.push(legGroup);
      }
    }
    if (type === 'barrel') {
      this.band = new T.Mesh(new T.TorusGeometry(0.62, 0.055, 8, 20), new T.MeshBasicMaterial());
      this.band.position.y = 1.02;
      this.band.rotation.x = Math.PI / 2;
      this.root.add(this.band);
    }
    if (type === 'spitter') {
      this.charge = new T.Mesh(new T.SphereGeometry(0.19, 12, 8), new T.MeshBasicMaterial({ color: 0xffc762 }));
      this.charge.position.set(0, 0.98, 0.64);
      this.body.add(this.charge);
      this.charge.visible = false;
    }
    this.punch = 0;
  }

  reset() {
    this.punch = 0;
    this.material.emissiveIntensity = 0;
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(this.scale);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
  }

  update(dt, item) {
    const age = item.age;
    if (this.band) this.band.material.color.setHex(item.barrelKind === 'cryo' ? 0x77ebff : item.barrelKind === 'pulse' ? 0xd99aff : item.barrelKind === 'blast' ? 0xff5136 : 0xffca58);
    if (this.charge) {
      this.charge.visible = Boolean(item.charge);
      this.charge.scale.setScalar(1 + Math.max(0, 0.4 - item.shot) * 3);
    }
    const big = this.type === 'boss' || this.type === 'brute';
    const pace = big ? 6.2 : this.type === 'spitter' ? 8.5 : 10.5;
    const stride = big ? 0.44 : 0.62;
    const p = age * pace + item.id;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(p + i * Math.PI) * stride;
    });
    this.arms.forEach((arm, i) => {
      const side = i ? 1 : -1;
      if (this.type === 'boss') {
        // Замах перед залпом
        const raise = item.shot < 0.7 ? (0.7 - item.shot) / 0.7 : 0;
        arm.rotation.x = -0.25 + Math.sin(p * 0.5 + i * Math.PI) * 0.26 - raise * 2.3;
      } else {
        arm.rotation.x = -0.35 - Math.sin(p + i * Math.PI) * 0.5;
      }
      arm.rotation.z = side * (0.2 + Math.sin(age * 3 + i) * 0.05);
    });
    this.body.position.y = Math.abs(Math.sin(p)) * (big ? 0.05 : 0.09);
    this.body.rotation.z = Math.sin(p) * 0.06;
    this.body.rotation.x = 0.1;
    if (this.type === 'barrel') {
      this.body.rotation.z = Math.sin(age * 5) * 0.012;
      this.body.rotation.x = 0;
      this.body.position.y = 0;
    }
    // Удар пули: вспышка и лёгкий толчок
    this.punch = Math.max(0, this.punch - dt * 7);
    if (item.hit > 0.07) this.punch = 1;
    const flash = Math.max(0, item.hit - 0.05) / 0.07;
    this.material.emissive.setHex(item.frost ? 0x7be9ff : 0xffffff);
    this.material.emissiveIntensity = flash * flash * (this.type === 'boss' ? 0.16 : 0.42) + (item.frost ? 0.13 : 0);
    if (this.type === 'wall') {
      this.body.position.y = 0;
      this.body.rotation.set(0, 0, 0);
    }
    this.root.scale.setScalar(this.scale * (1 + this.punch * (this.type === 'boss' ? 0.02 : 0.08)));
  }
}
