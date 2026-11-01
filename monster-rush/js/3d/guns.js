// Оружие. У каждой пушки своя модель: она видна в клетке, в руках героя и на подборе.
// Модель смотрит в -Z, начало координат в месте правой руки. grip и fore — куда ставить руки, muzzle — откуда летит огонь.
import * as T from '../../vendor/three/three.module.min.js';
import { Kit, metalMaterial, glowMaterial, group } from './kit.js';

const metal = metalMaterial();
const glow = glowMaterial();
const DARK = 0x23283a;
const STEEL = 0x8b95a8;
const WOOD = 0x8a5230;

function finish(body, light, spinBody, spinLight) {
  return { body: body.build(), light: light?.parts.length ? light.build() : null, spinBody: spinBody?.build() || null, spinLight: spinLight?.parts.length ? spinLight.build() : null };
}

const BUILD = {
  blaster() {
    const b = new Kit();
    const g = new Kit();
    b.box(0xf1f4fa, 0, 0.09, -0.22, 0.13, 0.17, 0.72);
    b.box(0x2fb6d6, 0, 0.17, -0.2, 0.09, 0.05, 0.5);
    b.box(DARK, 0, -0.06, 0.02, 0.09, 0.22, 0.12, 0.28);
    b.box(0xf1f4fa, 0, 0.08, 0.19, 0.1, 0.13, 0.2);
    b.box(DARK, 0, 0.02, -0.34, 0.1, 0.1, 0.26);
    b.cyl(DARK, 0, 0.1, -0.64, 0.05, 0.06, 0.2, Math.PI / 2);
    g.add(new T.CylinderGeometry(0.042, 0.042, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0.1, -0.75), 0x5ff2ff, 3.2);
    g.add(new T.BoxGeometry(0.02, 0.03, 0.32).translate(0.068, 0.11, -0.22), 0x5ff2ff, 2.4);
    g.add(new T.BoxGeometry(0.02, 0.03, 0.32).translate(-0.068, 0.11, -0.22), 0x5ff2ff, 2.4);
    return finish(b, g);
  },
  spread() {
    const b = new Kit();
    const g = new Kit();
    b.box(0xe07a26, 0, 0.09, -0.08, 0.16, 0.17, 0.44);
    b.box(WOOD, 0, 0.05, 0.22, 0.12, 0.14, 0.24, -0.12);
    b.box(DARK, 0, -0.06, 0.02, 0.09, 0.22, 0.12, 0.28);
    for (const s of [-1, 1]) b.cyl(STEEL, s * 0.052, 0.13, -0.58, 0.05, 0.05, 0.8, Math.PI / 2);
    b.box(WOOD, 0, 0.03, -0.42, 0.15, 0.09, 0.26);
    for (const z of [-0.36, -0.42, -0.48]) b.box(0x5e3418, 0, -0.02, z, 0.155, 0.015, 0.025);
    b.box(0xffc531, 0, 0.19, -0.1, 0.03, 0.03, 0.34);
    for (const s of [-1, 1]) g.add(new T.CylinderGeometry(0.036, 0.036, 0.02, 10).rotateX(Math.PI / 2).translate(s * 0.052, 0.13, -0.99), 0xffa64d, 3.4);
    return finish(b, g);
  },
  minigun() {
    const b = new Kit();
    const g = new Kit();
    const s = new Kit();
    b.box(0x39414f, 0, 0.1, -0.04, 0.26, 0.26, 0.5);
    b.box(0xffc531, 0, 0.25, -0.05, 0.27, 0.05, 0.3);
    for (let i = 0; i < 4; i++) b.box(0x1b1f2b, 0, 0.255, -0.17 + i * 0.08, 0.275, 0.052, 0.035);
    b.torus(DARK, 0, 0.32, -0.04, 0.09, 0.018, 0, Math.PI / 2);
    b.box(DARK, 0, -0.06, 0.05, 0.09, 0.2, 0.12, 0.28);
    // Лента и короб с патронами сбоку
    b.box(0x6b7a3a, 0.2, 0.0, 0.05, 0.16, 0.22, 0.3);
    b.box(0xffc531, 0.28, 0.0, 0.05, 0.012, 0.1, 0.16);
    b.box(DARK, 0, 0.03, -0.42, 0.13, 0.08, 0.14);
    b.cyl(STEEL, 0, 0.1, -0.34, 0.11, 0.13, 0.14, Math.PI / 2, 0, 0, 14);
    // Вращается вокруг своей оси: центр блока стволов в начале группы
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s.cyl(0xb4bdcc, Math.cos(a) * 0.072, Math.sin(a) * 0.072, -0.42, 0.024, 0.024, 0.84, Math.PI / 2, 0, 0, 7);
    }
    for (const z of [-0.2, -0.72]) s.cyl(DARK, 0, 0, z, 0.105, 0.105, 0.035, Math.PI / 2, 0, 0, 14);
    return { ...finish(b, g, s), spinAt: [0, 0.1, -0.4], spinAxis: 'z' };
  },
  rocket() {
    const b = new Kit();
    const g = new Kit();
    b.cyl(0x4f7a3a, 0, 0.17, -0.3, 0.135, 0.135, 1.36, Math.PI / 2, 0, 0, 16);
    b.cyl(0x38592a, 0, 0.17, 0.42, 0.17, 0.135, 0.16, Math.PI / 2, 0, 0, 16);
    b.cyl(0x38592a, 0, 0.17, -0.98, 0.15, 0.15, 0.1, Math.PI / 2, 0, 0, 16);
    b.cyl(0xffc531, 0, 0.17, -0.5, 0.139, 0.139, 0.06, Math.PI / 2, 0, 0, 16);
    b.cyl(0xffc531, 0, 0.17, 0.12, 0.139, 0.139, 0.06, Math.PI / 2, 0, 0, 16);
    b.box(DARK, 0, -0.06, 0.02, 0.09, 0.24, 0.12, 0.2);
    b.box(DARK, 0, -0.04, -0.44, 0.09, 0.22, 0.1, 0.1);
    b.box(DARK, -0.15, 0.32, -0.1, 0.05, 0.1, 0.2);
    // Боеголовка торчит из трубы
    b.cone(0xe53935, 0, 0.17, -1.12, 0.12, 0.26, -Math.PI / 2, 0, 0, 14);
    g.add(new T.CylinderGeometry(0.02, 0.02, 0.04, 8).rotateX(Math.PI / 2).translate(-0.15, 0.32, -0.21), 0xff5a3c, 3);
    return finish(b, g);
  },
  plasma() {
    const b = new Kit();
    const g = new Kit();
    b.box(0x4a2a78, 0, 0.1, -0.1, 0.2, 0.22, 0.64);
    b.box(0x2d1a4d, 0, 0.05, 0.25, 0.13, 0.15, 0.2);
    b.box(DARK, 0, -0.07, 0.03, 0.09, 0.22, 0.12, 0.28);
    b.box(0x2d1a4d, 0, 0.0, -0.32, 0.12, 0.1, 0.22);
    for (const z of [-0.06, -0.24, -0.42]) b.torus(0xb9c2d6, 0, 0.1, z, 0.135, 0.022, 0, 0, 0, Math.PI * 2, 16);
    for (const s of [-1, 1]) b.box(0xb9c2d6, s * 0.08, 0.1, -0.68, 0.035, 0.1, 0.44);
    g.add(new T.CylinderGeometry(0.075, 0.075, 0.46, 14).rotateX(Math.PI / 2).translate(0, 0.1, -0.24), 0xc77dff, 3);
    g.add(new T.SphereGeometry(0.075, 14, 10).translate(0, 0.1, -0.76), 0xe6b8ff, 4);
    return finish(b, g);
  },
  tesla() {
    const b = new Kit();
    const g = new Kit();
    b.box(WOOD, 0, 0.06, 0.2, 0.11, 0.14, 0.22, -0.1);
    b.box(DARK, 0, -0.06, 0.02, 0.09, 0.22, 0.12, 0.28);
    b.cyl(0x3d4660, 0, 0.1, -0.16, 0.08, 0.1, 0.64, Math.PI / 2, 0, 0, 14);
    b.box(WOOD, 0, 0.01, -0.34, 0.1, 0.08, 0.2);
    // Медная катушка
    for (let i = 0; i < 7; i++) b.torus(0xd98a3d, 0, 0.1, -0.08 - i * 0.06, 0.1 - i * 0.004, 0.02, 0, 0, 0, Math.PI * 2, 14);
    for (let i = 0; i < 3; i++) b.torus(0xd98a3d, 0, 0.1, -0.56 - i * 0.075, 0.12 - i * 0.03, 0.022, 0, 0, 0, Math.PI * 2, 14);
    b.cyl(STEEL, 0, 0.1, -0.68, 0.02, 0.04, 0.3, Math.PI / 2, 0, 0, 8);
    g.add(new T.SphereGeometry(0.075, 14, 10).translate(0, 0.1, -0.86), 0x9fe0ff, 4.5);
    return finish(b, g);
  },
  laser() {
    const b = new Kit();
    const g = new Kit();
    b.box(0xf6f2fa, 0, 0.1, -0.22, 0.16, 0.19, 0.9);
    b.box(0xff4fa8, 0, 0.2, -0.22, 0.09, 0.03, 0.7);
    b.box(0xf6f2fa, 0, 0.06, 0.28, 0.11, 0.14, 0.22);
    b.box(DARK, 0, -0.06, 0.03, 0.09, 0.22, 0.12, 0.28);
    b.box(DARK, 0, 0.0, -0.36, 0.11, 0.09, 0.24);
    b.cyl(0xd9d3e6, 0, 0.1, -0.76, 0.09, 0.075, 0.2, Math.PI / 2, 0, 0, 14);
    b.torus(0xff4fa8, 0, 0.1, -0.87, 0.09, 0.016, 0, 0, 0, Math.PI * 2, 18);
    g.add(new T.BoxGeometry(0.04, 0.02, 0.6).translate(0.09, 0.1, -0.22), 0xff4fa8, 3);
    g.add(new T.BoxGeometry(0.04, 0.02, 0.6).translate(-0.09, 0.1, -0.22), 0xff4fa8, 3);
    g.add(new T.CylinderGeometry(0.066, 0.066, 0.02, 14).rotateX(Math.PI / 2).translate(0, 0.1, -0.87), 0xffb3dc, 4.5);
    return finish(b, g);
  },
};

// Где пушка держится относительно груди героя и куда ставить левую руку
export const GUN_POSE = {
  blaster: { at: [0.17, 0.25, -0.3], fore: [0, 0.0, -0.3], muzzle: [0, 0.1, -0.78] },
  spread: { at: [0.17, 0.24, -0.3], fore: [0, -0.02, -0.4], muzzle: [0, 0.13, -1.0] },
  minigun: { at: [0.2, 0.13, -0.3], fore: [0, -0.02, -0.42], muzzle: [0, 0.1, -0.86], kick: 0.35 },
  rocket: { at: [0.215, 0.33, -0.14], fore: [0, -0.13, -0.44], muzzle: [0, 0.17, -1.2], kick: 1.3 },
  plasma: { at: [0.17, 0.22, -0.3], fore: [0, -0.05, -0.32], muzzle: [0, 0.1, -0.86], kick: 1.1 },
  tesla: { at: [0.17, 0.23, -0.3], fore: [0, -0.03, -0.34], muzzle: [0, 0.1, -0.92], kick: 0.7 },
  laser: { at: [0.17, 0.23, -0.3], fore: [0, -0.04, -0.36], muzzle: [0, 0.1, -0.9], kick: 0.15 },
};

const cache = new Map();
function geometry(type) {
  if (!cache.has(type)) cache.set(type, BUILD[type]());
  return cache.get(type);
}

export function makeGun(type, { shadow = true } = {}) {
  const parts = geometry(type);
  const root = new T.Group();
  const body = new T.Mesh(parts.body, metal);
  body.castShadow = shadow;
  root.add(body);
  if (parts.light) root.add(new T.Mesh(parts.light, glow));
  let spin = null;
  if (parts.spinBody) {
    spin = group(root, ...parts.spinAt);
    const barrels = new T.Mesh(parts.spinBody, metal);
    barrels.castShadow = shadow;
    spin.add(barrels);
  }
  return { root, spin, type };
}
