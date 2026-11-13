// Мир вокруг дороги: небо, горы, облака, дорога и разные пейзажи для трёх миров.
import * as T from '../../vendor/three/three.module.min.js?v=ccdbda82';
import { Kit, group, toyMaterial, glowMaterial, canvasTexture, rand, rimColor, rimPower, flat, place, hdr } from './kit.js?v=ccdbda82';

export const PALETTES = [
  {
    // Коралловый каньон: жаркий день
    zenith: 0x1a7fff, sky: 0x57bdff, horizon: 0xbfe6ff, sun: 0xfff3c4, sunAt: [-0.5, 0.42, -0.76], fog: 0xc9e4f4, fogNear: 70, fogFar: 240,
    hemi: [0xdff1ff, 0xffb27a, 1.1], light: [0xfff1dc, 2.5], rim: 0xfff0d0, rimK: 0.15,
    ground: ['#ffb765', '#f39f4f', '#ffc985'], road: '#675788', roadLight: '#74649a', line: '#fff6d2', curb: ['#ff5247', '#fff4e0'], glowLine: 0xffb347,
    far: [0xeeb09a, 0xf3bfa6, 0xe6a494], cloud: 0xffffff, cloudShade: 0xc9e2f7, floor: [0xff4d9d, 0xff7a3d, 0xffc531, 0x3ddc84, 0x2fb5ff],
  },
  {
    // Кристальный разлом: сиреневый вечер и светящиеся кристаллы
    zenith: 0x4a23c9, sky: 0xa45cf2, horizon: 0xf39ae0, sun: 0xfff0ff, sunAt: [0.46, 0.38, -0.8], fog: 0xd98ae0, fogNear: 65, fogFar: 225,
    hemi: [0xd9d0ff, 0x70e3e1, 1.18], light: [0xffe6f6, 2.35], rim: 0xc9f5ff, rimK: 0.2,
    ground: ['#3fd6bf', '#2bb9ae', '#7cf0d8'], road: '#3f3a86', roadLight: '#4b45a0', line: '#c9fff4', curb: ['#ff5fc0', '#7ffff0'], glowLine: 0x7ffff0,
    far: [0x7a4fd6, 0x9a68e8, 0x5d3fc0], cloud: 0xffe6fb, cloudShade: 0xd6a8f0, floor: [0xff5fc0, 0xb76bff, 0x5f8dff, 0x35e0ff, 0x4dffa6],
  },
  {
    // Сердце вулкана: раскалённый закат и лава
    zenith: 0x4a1c63, sky: 0xc6405c, horizon: 0xf58b42, sun: 0xffe08a, sunAt: [-0.32, 0.3, -0.9], fog: 0xcf5a3c, fogNear: 60, fogFar: 210,
    hemi: [0xffc9a8, 0xb85c72, 1.25], light: [0xffd9b0, 2.45], rim: 0xffb37a, rimK: 0.22,
    ground: ['#5b3350', '#4a2843', '#7a4560'], road: '#37293f', roadLight: '#43324c', line: '#ffd28a', curb: ['#ffb02e', '#3a2238'], glowLine: 0xff7a26,
    far: [0x5a2a4c, 0x6e3456, 0x472242], cloud: 0x8a5a78, cloudShade: 0x4f2f4a, floor: [0xff3d3d, 0xff7a26, 0xffc531, 0xfff06a, 0xffffff],
  },
];

const SKY_VERT = `
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
varying vec3 vDir; uniform vec3 uZenith; uniform vec3 uSky; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunAt;
void main(){
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uSky, smoothstep(0.0, 0.2, y));
  c = mix(c, uZenith, smoothstep(0.14, 0.75, y));
  float s = max(dot(d, normalize(uSunAt)), 0.0);
  c += uSun * (pow(s, 900.0) * 7.0 + pow(s, 26.0) * 0.5 + pow(s, 4.0) * 0.16);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function srgb(hex) {
  return new T.Color(hex);
}

function noisy(ctx, w, h, colors, count, size) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.1 + Math.random() * 0.24;
    const s = size * (0.4 + Math.random());
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

// Асфальт с разметкой. Текстура повторяется вдоль дороги
function roadTexture(p) {
  return canvasTexture(512, 1024, (c, w, h) => {
    c.fillStyle = p.road;
    c.fillRect(0, 0, w, h);
    noisy(c, w, h, ['#00000030', '#ffffff24', p.roadLight], 5200, 3);
    // Полосы движения и края
    const strip = (x, width) => c.fillRect(x - width / 2, 0, width, h);
    c.fillStyle = p.roadLight;
    c.globalAlpha = 0.35;
    strip(w * 0.215, 92);
    strip(w * 0.5, 92);
    strip(w * 0.785, 92);
    c.globalAlpha = 1;
    c.fillStyle = p.line;
    strip(w * 0.018, 10);
    strip(w * 0.982, 10);
    for (const x of [w * 0.357, w * 0.643]) {
      for (let y = 0; y < h; y += 256) c.fillRect(x - 5, y + 40, 10, 140);
    }
  }, { repeat: true, aniso: 8 });
}

function groundTexture(p, world) {
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = p.ground[0];
    c.fillRect(0, 0, w, h);
    noisy(c, w, h, [p.ground[1], p.ground[2]], 1400, 7);
    if (world === 0) {
      // Волны на песке
      c.strokeStyle = p.ground[1];
      c.lineWidth = 5;
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 26 + Math.random() * 44;
        c.globalAlpha = 0.35;
        c.beginPath();
        c.arc(x, y, r, Math.PI * 1.15, Math.PI * 1.85);
        c.stroke();
      }
    } else if (world === 1) {
      // Блёстки на бирюзовом мху
      for (let i = 0; i < 120; i++) {
        c.globalAlpha = 0.5 + Math.random() * 0.5;
        c.fillStyle = i % 3 ? '#caffef' : '#ffb7ec';
        c.beginPath();
        c.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 2.5, 0, 7);
        c.fill();
      }
    } else {
      // Трещины с лавой
      c.strokeStyle = '#ff8a2a';
      c.shadowColor = '#ffb347';
      c.shadowBlur = 8;
      for (let i = 0; i < 12; i++) {
        c.lineWidth = 1.5 + Math.random() * 3;
        c.globalAlpha = 0.85;
        c.beginPath();
        let x = Math.random() * w;
        let y = Math.random() * h;
        c.moveTo(x, y);
        for (let j = 0; j < 5; j++) {
          x += (Math.random() - 0.5) * 70;
          y += 12 + Math.random() * 34;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;
  }, { repeat: true, aniso: 4 });
}

function curbTexture(p) {
  return canvasTexture(16, 64, (c, w, h) => {
    c.fillStyle = p.curb[0];
    c.fillRect(0, 0, w, h / 2);
    c.fillStyle = p.curb[1];
    c.fillRect(0, h / 2, w, h / 2);
  }, { repeat: true, aniso: 4 });
}

// ---------- Пейзаж ----------

function cactus(k, x, z, s, seed) {
  const green = rand(seed) > 0.5 ? 0x2fa84f : 0x3cbb5c;
  const dark = 0x1f7a3a;
  k.cyl(green, x, 1.25 * s, z, 0.3 * s, 0.34 * s, 2.5 * s, 0, 0, 0, 10);
  k.ball(green, x, 2.5 * s, z, 0.3 * s);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box(dark, x + Math.cos(a) * 0.3 * s, 1.25 * s, z + Math.sin(a) * 0.3 * s, 0.05 * s, 2.3 * s, 0.05 * s);
  }
  for (const side of [-1, 1]) {
    const y = (1.1 + rand(seed + side) * 0.7) * s;
    k.cyl(green, x + side * 0.52 * s, y, z, 0.16 * s, 0.16 * s, 0.5 * s, 0, 0, Math.PI / 2, 8);
    k.cyl(green, x + side * 0.78 * s, y + 0.34 * s, z, 0.15 * s, 0.17 * s, 0.82 * s, 0, 0, 0, 8);
    k.ball(green, x + side * 0.78 * s, y + 0.74 * s, z, 0.15 * s);
    k.ball(green, x + side * 0.77 * s, y, z, 0.17 * s);
  }
  // Цветок на макушке
  k.ball(0xff5fa2, x, 2.82 * s, z, 0.14 * s, 0.1 * s, 0.14 * s);
  k.ball(0xffe14d, x, 2.87 * s, z, 0.06 * s);
}

function mesa(k, x, z, s, seed, colors) {
  // Столовая гора: цветные слои, как в настоящих каньонах
  let y = 0;
  let r = (2.6 + rand(seed) * 1.5) * s;
  const layers = 4 + Math.floor(rand(seed + 2) * 3);
  for (let i = 0; i < layers; i++) {
    const h = (1.0 + rand(seed + i * 3) * 1.1) * s;
    const top = r * (0.84 + rand(seed + i) * 0.12);
    k.add(flat(place(new T.CylinderGeometry(top, r, h, 7), x, y + h / 2, z, 1, 1, 0.82, 0, seed + i * 0.7, 0)), colors[i % colors.length]);
    y += h;
    r = top * (0.96 - rand(seed + i * 5) * 0.08);
  }
}

function palm(k, x, z, s, seed) {
  const bend = (rand(seed) - 0.5) * 0.9;
  let px = x;
  let py = 0;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const nx = x + bend * (t + 1 / segs) ** 2 * 2.2 * s;
    const ny = py + 0.72 * s;
    k.cyl(i % 2 ? 0xb37a45 : 0x9c6636, (px + nx) / 2, (py + ny) / 2, z, (0.16 - t * 0.07) * s, (0.2 - t * 0.07) * s, 0.76 * s, 0, 0, -Math.atan2(nx - px, 0.72 * s), 7);
    px = nx;
    py = ny;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    const len = 1.5 * s;
    const c = Math.cos(a);
    const d = Math.sin(a);
    k.add(flat(place(new T.ConeGeometry(0.3 * s, len, 4), px + c * len * 0.42, py + 0.02 * s, z + d * len * 0.42, 1, 1, 0.25, 0, -a, Math.PI / 2 + 0.24)), i % 2 ? 0x31b957 : 0x48d06e);
  }
  k.ball(0x7a4a24, px + 0.14 * s, py - 0.16 * s, z, 0.13 * s);
  k.ball(0x7a4a24, px - 0.12 * s, py - 0.16 * s, z + 0.08 * s, 0.13 * s);
}

function crate(k, x, z, s, ry) {
  k.box(0xc98a4b, x, 0.5 * s, z, s, s, s, 0, ry);
  for (const dy of [-0.42, 0.42]) k.box(0x9c6636, x, 0.5 * s + dy * s, z, s * 1.04, 0.14 * s, s * 1.04, 0, ry);
}

function tire(k, x, z, s) {
  k.torus(0x2c2a35, x, 0.3 * s, z, 0.5 * s, 0.24 * s, Math.PI / 2, 0, 0, Math.PI * 2, 14);
  k.torus(0x4a4757, x, 0.42 * s, z, 0.5 * s, 0.1 * s, Math.PI / 2, 0, 0, Math.PI * 2, 14);
}

function bush(k, x, z, s, seed, colors) {
  for (let i = 0; i < 5; i++) {
    const a = rand(seed + i) * 6.28;
    const r = rand(seed + i * 2) * 0.55 * s;
    const q = (0.42 + rand(seed + i * 3) * 0.35) * s;
    k.blob(colors[i % colors.length], x + Math.cos(a) * r, q * 0.72, z + Math.sin(a) * r, q);
  }
}

function crystal(k, g, x, z, s, seed, colors) {
  const count = 3 + Math.floor(rand(seed) * 3);
  for (let i = 0; i < count; i++) {
    const a = rand(seed + i) * 6.28;
    const r = i ? 0.5 * s : 0;
    const h = (i ? 1.6 + rand(seed + i * 2) * 1.8 : 3.6) * s;
    const w = (i ? 0.26 : 0.42) * s;
    const color = colors[(i + Math.floor(seed)) % colors.length];
    const tiltX = i ? Math.sin(a) * 0.32 : 0;
    const tiltZ = i ? -Math.cos(a) * 0.32 : 0;
    const shard = new T.CylinderGeometry(w * 0.82, w, h * 0.72, 6);
    const tip = new T.ConeGeometry(w * 0.82, h * 0.28, 6).translate(0, h * 0.5, 0);
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    k.add(flat(place(shard, px, h * 0.34, pz, 1, 1, 1, tiltX, a, tiltZ)), color);
    g.add(flat(place(tip, px, h * 0.34, pz, 1, 1, 1, tiltX, a, tiltZ)), color, 1.55);
  }
}

function mushroom(k, g, x, z, s, seed) {
  const caps = [0xff5fc0, 0xb76bff, 0x35e0ff, 0xffc531];
  const cap = caps[Math.floor(rand(seed) * caps.length)];
  k.cyl(0xf3e7ff, x, 1.0 * s, z, 0.2 * s, 0.34 * s, 2 * s, 0, 0, 0, 10);
  k.add(place(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, 1.85 * s, z, 1.15 * s, 0.82 * s, 1.15 * s), cap);
  k.cyl(0xe2d0ff, x, 1.84 * s, z, 1.12 * s, 0.45 * s, 0.1 * s, 0, 0, 0, 16);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + seed;
    g.add(place(new T.SphereGeometry(1, 8, 6), x + Math.cos(a) * 0.66 * s, 2.38 * s, z + Math.sin(a) * 0.66 * s, 0.14 * s), 0xfff6c9, 1.5);
  }
}

function spike(k, g, x, z, s, seed) {
  const n = 3 + Math.floor(rand(seed) * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(seed + i) * 6.28;
    const r = i ? rand(seed + i * 2) * 1.1 * s : 0;
    const h = (i ? 1.8 + rand(seed + i * 3) * 2.2 : 4.6) * s;
    const w = (i ? 0.5 : 0.8) * s;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    k.add(flat(place(new T.ConeGeometry(w, h, 5), px, h / 2, pz, 1, 1, 1, Math.sin(a) * 0.12, a, -Math.cos(a) * 0.12)), i % 2 ? 0x37233f : 0x4c2f50);
    // Раскалённая трещина
    g.add(place(new T.BoxGeometry(0.07 * s, h * 0.5, 0.07 * s), px + Math.cos(a) * w * 0.3, h * 0.26, pz + Math.sin(a) * w * 0.3, 1, 1, 1, 0, a, 0), 0xff8a2a, 2.6);
  }
}

function lavaPool(g, k, x, z, s, seed) {
  const pool = new T.CircleGeometry(1, 18).rotateX(-Math.PI / 2);
  g.add(place(pool, x, 0.05, z, 2.4 * s, 1, (1.2 + rand(seed)) * s), 0xff7a1f, 2.3);
  g.add(place(pool, x + 0.3 * s, 0.07, z, 1.2 * s, 1, 0.7 * s), 0xffd24a, 3.2);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28;
    k.rock(0x2a1b30, x + Math.cos(a) * 2.5 * s, 0.1, z + Math.sin(a) * (1.3 + rand(seed)) * s, 0.5 * s, 0.32 * s, 0.5 * s, seed + i);
  }
}

// Арка над дорогой: пролетает над головой и хорошо передаёт скорость
function arch(k, g, z, p) {
  const [a, b] = p.far;
  for (const s of [-1, 1]) {
    k.box(a, s * 8.1, 4.6, z, 1.5, 9.2, 1.5);
    k.box(b, s * 8.1, 0.45, z, 2.1, 0.9, 2.1);
    k.box(b, s * 8.1, 8.9, z, 2.0, 0.7, 2.0);
    g.add(place(new T.BoxGeometry(0.25, 6.4, 0.08), s * 8.1 - s * 0.55, 4.6, z + 0.78), p.glowLine, 2.2);
  }
  k.box(b, 0, 10, z, 18.2, 1.3, 1.5);
  g.add(place(new T.BoxGeometry(15.5, 0.2, 0.08), 0, 10, z + 0.78), p.glowLine, 2.2);
}

// Один участок длиной L по обе стороны дороги
function buildSegment(world, p, L, seedBase) {
  const k = new Kit();
  const big = new Kit();
  const g = new Kit();
  const seed = (i) => seedBase + i * 1.37;
  const side = (i) => (rand(seed(i) + 3) > 0.5 ? 1 : -1);
  if (world === 0) {
    const bands = [[0xe2654a, 0xee8e5c, 0xcc5343, 0xf0a064], [0xd8604f, 0xec9561, 0xbb4d49, 0xeea86e]];
    for (let i = 0; i < 9; i++) {
      const z = -((i + rand(seed(i))) / 9) * L;
      mesa(big, side(i) * (19 + rand(seed(i) + 1) * 20), z, 1.9 + rand(seed(i) + 7) * 1.7, seed(i), bands[i % 2]);
    }
    for (let i = 0; i < 26; i++) {
      const s = side(i + 20);
      const x = s * (7.6 + rand(seed(i) + 11) * 11);
      const z = -rand(seed(i) + 13) * L;
      const r = rand(seed(i) + 17);
      if (r < 0.34) cactus(k, x, z, 0.75 + rand(seed(i)) * 0.5, seed(i));
      else if (r < 0.48) palm(k, x * 1.1, z, 1.15 + rand(seed(i)) * 0.5, seed(i));
      else if (r < 0.62) crate(k, x, z, 0.8 + rand(seed(i)) * 0.5, rand(seed(i)) * 3);
      else if (r < 0.74) tire(k, x, z, 1 + rand(seed(i)) * 0.3);
      else if (r < 0.88) k.rock(0xe88a68, x, 0.35, z, 0.9 + rand(seed(i)) * 0.9, 0.7 + rand(seed(i) + 1) * 0.5, 0.9, seed(i));
      else bush(k, x, z, 0.8 + rand(seed(i)) * 0.5, seed(i), [0x6fcf5a, 0x9be05e, 0xff8fb5]);
    }
  } else if (world === 1) {
    const hues = [[0xff5fc0, 0xff9ee0], [0x35e0ff, 0x8ff5ff], [0xb76bff, 0xdcb0ff], [0x4dffa6, 0xb4ffd8]];
    for (let i = 0; i < 26; i++) {
      const s = side(i + 20);
      const x = s * (7.8 + rand(seed(i) + 11) * 22);
      const z = -rand(seed(i) + 13) * L;
      const r = rand(seed(i) + 17);
      if (r < 0.48) crystal(k, g, x, z, 0.9 + rand(seed(i)) * 1.5 + Math.abs(x) * 0.03, seed(i), hues[i % hues.length]);
      else if (r < 0.74) mushroom(k, g, x, z, 0.8 + rand(seed(i)) * 1.1, seed(i));
      else if (r < 0.88) k.rock(0x5a4bb8, x, 0.4, z, 1 + rand(seed(i)) * 1.3, 0.8 + rand(seed(i) + 1) * 0.8, 1.1, seed(i));
      else bush(k, x, z, 0.8 + rand(seed(i)) * 0.5, seed(i), [0x2fe0b8, 0x8bf5d6, 0xff9ee0]);
    }
    for (let i = 0; i < 6; i++) {
      const z = -((i + rand(seed(i))) / 6) * L;
      big.rock(0x6d56cf, side(i) * (24 + rand(seed(i) + 1) * 16), 1.4, z, 4.5 + rand(seed(i)) * 4, 3 + rand(seed(i) + 2) * 4.5, 4.5, seed(i));
    }
  } else {
    for (let i = 0; i < 22; i++) {
      const s = side(i + 20);
      const x = s * (7.8 + rand(seed(i) + 11) * 22);
      const z = -rand(seed(i) + 13) * L;
      const r = rand(seed(i) + 17);
      if (r < 0.46) spike(k, g, x, z, 0.8 + rand(seed(i)) * 1 + Math.abs(x) * 0.03, seed(i));
      else if (r < 0.72) lavaPool(g, k, x * 1.1, z, 0.9 + rand(seed(i)) * 0.8, seed(i));
      else k.rock(0x3b2640, x, 0.45, z, 1 + rand(seed(i)) * 1.4, 0.8 + rand(seed(i) + 1) * 1, 1.1, seed(i));
    }
    for (let i = 0; i < 7; i++) {
      const z = -((i + rand(seed(i))) / 7) * L;
      big.rock(0x4c2f50, side(i) * (24 + rand(seed(i) + 1) * 16), 1.2, z, 4.5 + rand(seed(i)) * 4, 3 + rand(seed(i) + 2) * 5, 4.5, seed(i));
    }
  }
  arch(big, g, -L * 0.5, p);
  return { body: k.build({ y0: 0, y1: 3.5, low: 0.72, high: 1 }), big: big.build({ y0: 0, y1: 5, low: 0.78, high: 1 }), light: g.parts.length ? g.build() : null };
}

function buildBackdrop(world, p) {
  const k = new Kit();
  const g = new Kit();
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const a = -2.4 + t * 1.7 * Math.PI * 0.9;
    const dist = 205 + rand(i) * 60;
    const x = Math.cos(a) * dist * 1.25;
    const z = Math.sin(a) * dist;
    if (z > -70) continue;
    const h = 26 + rand(i + 3) * 50;
    const w = 26 + rand(i + 5) * 34;
    const color = p.far[i % p.far.length];
    if (world === 0) {
      let y = -6;
      let r = w;
      for (let j = 0; j < 3; j++) {
        const layer = h * (0.32 + rand(i + j) * 0.12);
        k.add(flat(place(new T.CylinderGeometry(r * 0.84, r, layer, 6), x, y + layer / 2, z, 1, 1, 1, 0, i + j, 0)), p.far[(i + j) % p.far.length]);
        y += layer;
        r *= 0.8;
      }
    } else {
      k.add(flat(place(new T.ConeGeometry(w, h, world === 1 ? 5 : 6), x, h / 2 - 8, z, 1, 1, 1, 0, i, 0)), color);
    }
  }
  if (world === 2) {
    // Вулкан на горизонте: жерло светится
    const x = 52;
    const z = -225;
    k.add(flat(place(new T.CylinderGeometry(24, 96, 100, 9, 3), x, 42, z)), 0x4a2545);
    g.add(place(new T.CylinderGeometry(23, 23, 2.5, 18), x, 92.5, z), 0xffb347, 3.6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28;
      g.add(place(new T.BoxGeometry(4.6, 66, 1.5), x + Math.cos(a) * 44, 54, z + 20 + Math.sin(a) * 7, 1, 1, 1, 0, a * 0.2, Math.cos(a) * 0.5), 0xff7a1f, 2.5);
    }
  }
  return { body: k.build(), light: g.parts.length ? g.build() : null };
}

function buildClouds(p, world) {
  const k = new Kit();
  const count = world === 2 ? 11 : 16;
  for (let i = 0; i < count; i++) {
    const x = (rand(i + 1) - 0.5) * 340;
    const y = 38 + rand(i + 2) * 42;
    const z = -80 - rand(i + 3) * 170;
    const s = 5 + rand(i + 4) * 8;
    for (let j = 0; j < 6; j++) {
      const q = s * (0.55 + rand(i * 5 + j) * 0.6);
      const dx = (j - 2.5) * s * 0.72;
      k.ball(p.cloud, x + dx, y + rand(i + j) * s * 0.3, z, q * 1.2, q * 0.74, q);
    }
  }
  const geo = k.build();
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  const top = srgb(p.cloud);
  const low = srgb(p.cloudShade);
  const c = new T.Color();
  for (let i = 0; i < nor.count; i++) {
    c.copy(low).lerp(top, Math.max(0, Math.min(1, nor.getY(i) * 0.8 + 0.55)));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return geo;
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.index = -1;
    this.cache = [];
    this.L = 110;
    this.body = toyMaterial({ roughness: 0.82, rim: 0.35 });
    this.glow = glowMaterial();
    this.farMat = new T.MeshLambertMaterial({ vertexColors: true, fog: false });

    this.uniforms = {
      uZenith: { value: new T.Color() }, uSky: { value: new T.Color() }, uHorizon: { value: new T.Color() },
      uSun: { value: new T.Color() }, uSunAt: { value: new T.Vector3() },
    };
    this.sky = new T.Mesh(new T.SphereGeometry(1, 32, 16), new T.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uniforms, side: T.BackSide, depthWrite: false, depthTest: true, fog: false,
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.groundMat = new T.MeshStandardMaterial({ roughness: 0.96 });
    this.ground = new T.Mesh(new T.PlaneGeometry(420, 420, 12, 70).rotateX(-Math.PI / 2), this.groundMat);
    this.ground.position.set(0, -0.32, -120);
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    this.roadMat = new T.MeshStandardMaterial({ roughness: 0.82 });
    this.road = new T.Mesh(new T.PlaneGeometry(11.6, 260, 2, 90).rotateX(-Math.PI / 2), this.roadMat);
    this.road.position.set(0, 0, -105);
    this.road.receiveShadow = true;
    scene.add(this.road);

    this.curbMat = new T.MeshStandardMaterial({ roughness: 0.6 });
    this.curbs = [-1, 1].map((s) => {
      const m = new T.Mesh(new T.BoxGeometry(0.62, 0.42, 260, 1, 1, 90), this.curbMat);
      m.position.set(s * 6.05, 0.0, -105);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    });
    this.edgeMat = new T.MeshBasicMaterial({ color: 0xffffff });
    this.edges = [-1, 1].map((s) => {
      const m = new T.Mesh(new T.BoxGeometry(0.07, 0.05, 260, 1, 1, 90), this.edgeMat);
      m.position.set(s * 5.68, 0.03, -105);
      scene.add(m);
      return m;
    });

    this.segments = [0, 1].map(() => {
      const root = group(scene);
      const body = new T.Mesh(new T.BufferGeometry(), this.body);
      body.castShadow = true;
      body.receiveShadow = true;
      const big = new T.Mesh(new T.BufferGeometry(), this.body);
      big.receiveShadow = true;
      const light = new T.Mesh(new T.BufferGeometry(), this.glow);
      root.add(body, big, light);
      return { root, body, big, light };
    });
    this.backdrop = group(scene);
    this.backBody = new T.Mesh(new T.BufferGeometry(), this.farMat);
    this.backLight = new T.Mesh(new T.BufferGeometry(), this.glow);
    this.backdrop.add(this.backBody, this.backLight);
    this.clouds = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ vertexColors: true, fog: false }));
    scene.add(this.clouds);

    this.hemi = new T.HemisphereLight(0xffffff, 0xffffff, 1);
    scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -26;
    cam.right = 26;
    cam.top = 42;
    cam.bottom = -42;
    cam.near = 1;
    cam.far = 110;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    scene.fog = new T.Fog(0xffffff, 60, 200);
    this.setWorld(0);
  }

  // Всё тяжёлое считается один раз на мир и остаётся в памяти: смена мира не тормозит
  assets(world) {
    if (this.cache[world]) return this.cache[world];
    const p = PALETTES[world];
    const pm = new T.PMREMGenerator(this.renderer);
    const dome = new T.Scene();
    const geo = new T.SphereGeometry(50, 24, 14);
    const col = new Float32Array(geo.attributes.position.count * 3);
    const c = new T.Color();
    const pos = geo.attributes.position;
    const sunDir = new T.Vector3(...p.sunAt).normalize();
    const v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      if (v.y < 0) c.set(p.ground[0]).lerp(srgb(p.horizon), Math.max(0, 1 + v.y * 5));
      else c.set(p.horizon).lerp(srgb(p.sky), Math.min(1, v.y * 3.5)).lerp(srgb(p.zenith), Math.min(1, Math.max(0, v.y - 0.3) * 1.4));
      c.multiplyScalar(1 + Math.pow(Math.max(0, v.dot(sunDir)), 12) * 4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    dome.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const env = pm.fromScene(dome, 0.03).texture;
    geo.dispose();
    pm.dispose();

    const road = roadTexture(p);
    road.repeat.set(1, 13);
    const ground = groundTexture(p, world);
    ground.repeat.set(22, 22);
    const curb = curbTexture(p);
    curb.repeat.set(1, 40);
    this.cache[world] = {
      env, road, ground, curb,
      segments: [buildSegment(world, p, this.L, 10 + world * 100), buildSegment(world, p, this.L, 60 + world * 100)],
      backdrop: buildBackdrop(world, p),
      clouds: buildClouds(p, world),
    };
    return this.cache[world];
  }

  setWorld(world) {
    if (world === this.index) return;
    this.index = world;
    const p = PALETTES[world];
    const a = this.assets(world);
    this.palette = p;
    this.uniforms.uZenith.value.set(p.zenith);
    this.uniforms.uSky.value.set(p.sky);
    this.uniforms.uHorizon.value.set(p.horizon);
    this.uniforms.uSun.value.set(p.sun);
    this.uniforms.uSunAt.value.set(...p.sunAt).normalize();
    this.scene.environment = a.env;
    this.scene.environmentIntensity = 0.45;
    this.scene.fog.color.set(p.fog);
    this.scene.fog.near = p.fogNear;
    this.scene.fog.far = p.fogFar;
    this.hemi.color.set(p.hemi[0]);
    this.hemi.groundColor.set(p.hemi[1]);
    this.hemi.intensity = p.hemi[2];
    this.sun.color.set(p.light[0]);
    this.sun.intensity = p.light[1];
    // Свет падает сзади и сбоку от камеры: фигуры объёмные, а тени ложатся вперёд и вбок
    this.sun.position.set(-p.sunAt[0] * 34 + 9, 44, 34);
    this.sun.target.position.set(0, 0, -14);
    rimColor.value.set(p.rim);
    rimPower.value = p.rimK;
    this.roadMat.map = a.road;
    this.groundMat.map = a.ground;
    this.curbMat.map = a.curb;
    this.roadMat.needsUpdate = this.groundMat.needsUpdate = this.curbMat.needsUpdate = true;
    this.edgeMat.color.copy(hdr(p.glowLine, 1.35));
    this.segments.forEach((seg, i) => {
      seg.body.geometry = a.segments[i].body;
      seg.big.geometry = a.segments[i].big;
      seg.light.geometry = a.segments[i].light || new T.BufferGeometry();
    });
    this.backBody.geometry = a.backdrop.body;
    this.backLight.geometry = a.backdrop.light || new T.BufferGeometry();
    this.clouds.geometry = a.clouds;
  }

  update(dt, scroll, camera, time) {
    const a = this.cache[this.index];
    a.road.offset.y = (scroll / 20) % 1;
    a.ground.offset.y = (scroll / (420 / 22)) % 1;
    a.curb.offset.y = (scroll / (260 / 40)) % 1;
    const L = this.L;
    this.segments.forEach((seg, i) => {
      seg.root.position.z = ((scroll + i * L) % (2 * L)) + 40 - L;
    });
    this.sky.position.copy(camera.position);
    this.sky.scale.setScalar(300);
    this.backdrop.position.x = camera.position.x * 0.5;
    this.clouds.position.x = camera.position.x * 0.3 + Math.sin(time * 0.03) * 8;
    if (this.index === 2) this.glow.color.setScalar(1 + Math.sin(time * 2.2) * 0.14);
    else this.glow.color.setScalar(1);
  }
}
