// Обломки блоков: куски того же материала с той же текстурой. Сначала лежат точно на месте блока,
// потом разлетаются, кувыркаются и отскакивают от земли. Форм мало, поэтому отрисовок тоже мало
import * as T from '../../vendor/three/three.module.min.js?v=fdffe6b3';
import { boxUV, rockBox, seededRandom } from './shapes.js?v=fdffe6b3';
import { BLOCK_DEPTH } from './blocks.js?v=fdffe6b3';

const CAPACITY = 150;
// Сколько обломков держать одновременно на каждом уровне качества
const LIMITS = [170, 300, 460];
const GRAVITY = 1000;
// Размер куска по материалу: камень крупнее, лёд мельче
const CELL = { stone: 30, steel: 40, ice: 26, boom: 30 };

// Щепа: коробка с рваными торцами вдоль оси X
function splinter(seed) {
  const rng = seededRandom(seed);
  const g = new T.BoxGeometry(1, 1, 1, 5, 3, 2).toNonIndexed();
  const pos = g.attributes.position;
  const jag = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (Math.abs(x) < 0.49) continue;
    const key = `${x}:${pos.getY(i).toFixed(2)}:${pos.getZ(i).toFixed(2)}`;
    if (!jag.has(key)) jag.set(key, rng() * 0.34);
    pos.setX(i, x - Math.sign(x) * jag.get(key));
  }
  g.computeVertexNormals();
  boxUV(g, 6, 6, false, rng(), rng());
  return g;
}

// Рваный камень
function rubble(seed) {
  const rng = seededRandom(seed);
  const g = rockBox(30, 30, 30, 7, 5, rng() * 90, 8);
  boxUV(g, 200, 200, false, rng(), rng());
  g.scale(1 / 30, 1 / 30, 1 / 30);
  return g;
}

// Лист железа, изогнутый ударом
function plate(seed) {
  const rng = seededRandom(seed);
  const g = new T.BoxGeometry(1, 1, 1, 4, 4, 1).toNonIndexed();
  const pos = g.attributes.position;
  const a = rng() * 3;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, pos.getZ(i) + Math.sin(pos.getX(i) * 3 + a) * 0.5 + Math.sin(pos.getY(i) * 3.4 - a) * 0.34);
  }
  g.computeVertexNormals();
  boxUV(g, 6, 6, false, rng(), rng());
  return g;
}

// Острый осколок льда с плоскими гранями
function sliver(seed) {
  const rng = seededRandom(seed);
  const g = new T.IcosahedronGeometry(0.62, 0);
  const pos = g.attributes.position;
  const stretch = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)}:${pos.getY(i).toFixed(3)}:${pos.getZ(i).toFixed(3)}`;
    if (!stretch.has(key)) stretch.set(key, 0.62 + rng() * 0.8);
    const k = stretch.get(key);
    pos.setXYZ(i, pos.getX(i) * k * 1.3, pos.getY(i) * k * 0.8, pos.getZ(i) * k * 0.7);
  }
  g.computeVertexNormals();
  boxUV(g, 6, 6, false, rng(), rng());
  return g;
}

const SHAPES = {
  wood: [splinter(3), splinter(11)],
  stone: [rubble(5), rubble(17), rubble(29)],
  steel: [plate(7), plate(21)],
  ice: [sliver(9), sliver(31)],
  boom: [splinter(13)]
};

const dummy = new T.Object3D();
const tint = new T.Color();

export class Shards {
  constructor(stage, materials) {
    this.meshes = {};
    this.list = [];
    this.last = 0;
    this.limit = LIMITS[2];
    for (const mat of Object.keys(SHAPES)) {
      this.meshes[mat] = SHAPES[mat].map((geo) => {
        const material = materials[mat].clone();
        material.side = T.DoubleSide;
        const m = new T.InstancedMesh(geo, material, CAPACITY);
        m.frustumCulled = false;
        m.castShadow = true;
        m.count = 0;
        m.setColorAt(0, tint.set('#ffffff'));
        stage.add(m);
        return m;
      });
    }
  }

  clear() {
    this.list.length = 0;
  }

  setQuality(q) {
    this.limit = LIMITS[q];
    for (const mat in this.meshes) for (const m of this.meshes[mat]) m.castShadow = q > 0;
  }

  // b — блок на момент разрушения, kick — куда его толкнули (скорость за шаг физики)
  burst(b, kick) {
    const upright = b.h > b.w;
    // Дерево колется вдоль волокон длинной щепой, остальное кусками
    const along = b.mat === 'wood' ? 62 : CELL[b.mat];
    const across = b.mat === 'wood' ? 15 : CELL[b.mat];
    const nx = clamp(Math.round(b.w / (upright ? across : along)), 1, 7);
    const ny = clamp(Math.round(b.h / (upright ? along : across)), 1, 7);
    const nz = nx * ny > 9 ? 1 : 2;
    const c = Math.cos(b.angle);
    const s = Math.sin(b.angle);
    const vel = Matter.Body.getVelocity(b);
    const shapes = this.meshes[b.mat];
    const burnt = kick && kick.burnt;
    const kx = (kick ? kick.x : 0) * 60;
    const ky = (kick ? kick.y : 0) * 60;
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let iz = 0; iz < nz; iz++) {
          const lx = ((ix + 0.5) / nx - 0.5) * b.w;
          const ly = ((iy + 0.5) / ny - 0.5) * b.h;
          const lz = ((iz + 0.5) / nz - 0.5) * BLOCK_DEPTH;
          const gx = b.position.x + lx * c - ly * s;
          const gy = b.position.y + lx * s + ly * c;
          const dx = lx * c - ly * s;
          const dy = lx * s + ly * c;
          const dist = Math.hypot(dx, dy) || 1;
          const out = 50 + Math.random() * (burnt ? 300 : 170);
          const cw = b.w / nx;
          const ch = b.h / ny;
          const depth = BLOCK_DEPTH / nz;
          let sx;
          let sy;
          let sz;
          if (b.mat === 'steel') {
            sx = cw * 0.95;
            sy = ch * 0.95;
            sz = 7 + Math.random() * 6;
          } else if (b.mat === 'boom') {
            sx = cw * 1.05;
            sy = ch * 0.5;
            sz = depth * 0.9;
          } else if (b.mat === 'wood') {
            sx = Math.max(cw, ch) * (0.9 + Math.random() * 0.35);
            sy = Math.min(cw, ch) * (0.7 + Math.random() * 0.5);
            sz = depth * (0.35 + Math.random() * 0.45);
          } else {
            sx = cw * (0.85 + Math.random() * 0.25);
            sy = ch * (0.85 + Math.random() * 0.25);
            sz = depth * (0.7 + Math.random() * 0.3);
          }
          const g = burnt ? 0.5 + Math.random() * 0.3 : 0.86 + Math.random() * 0.28;
          this.list.push({
            mesh: shapes[Math.floor(Math.random() * shapes.length)],
            x: gx,
            y: GROUND_Y - gy,
            z: lz,
            vx: vel.x * 60 + (dx / dist) * out + kx * (0.45 + Math.random() * 0.75),
            vy: -vel.y * 60 - (dy / dist) * out - ky * (0.45 + Math.random() * 0.75) + 70 + Math.random() * 130,
            vz: Math.sign(lz || 1) * (20 + Math.random() * 130),
            rx: 0,
            ry: 0,
            rz: -b.angle + (upright && b.mat === 'wood' ? Math.PI / 2 : 0),
            wx: (Math.random() - 0.5) * 10,
            wy: (Math.random() - 0.5) * 8,
            wz: (Math.random() - 0.5) * 13,
            sx,
            sy,
            sz,
            rest: Math.min(sx, sy, sz) * 0.42,
            age: 0,
            life: 1.7 + Math.random() * 1.5,
            g
          });
        }
      }
    }
    // Лишнее убираем с самых старых
    if (this.list.length > this.limit) this.list.splice(0, this.list.length - this.limit);
  }

  update(time) {
    const dt = clamp(time - this.last, 0, 0.05);
    this.last = time;
    for (const mat in this.meshes) for (const m of this.meshes[mat]) m.count = 0;
    let write = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      this.list[write++] = p;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.wx * dt;
      p.ry += p.wy * dt;
      p.rz += p.wz * dt;
      if (p.y < p.rest) {
        p.y = p.rest;
        if (p.vy < -70) {
          p.vy *= -0.34;
          p.vx *= 0.6;
          p.vz *= 0.6;
          p.wx *= 0.5;
          p.wy *= 0.5;
          p.wz *= 0.5;
        } else {
          p.vy = 0;
          const slide = Math.exp(-dt * 7);
          p.vx *= slide;
          p.vz *= slide;
          p.wx = p.wy = p.wz = 0;
        }
      }
      const m = p.mesh;
      if (m.count >= CAPACITY) continue;
      const shrink = Math.min(1, (p.life - p.age) / 0.35);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(p.sx * shrink, p.sy * shrink, p.sz * shrink);
      dummy.updateMatrix();
      m.setMatrixAt(m.count, dummy.matrix);
      m.setColorAt(m.count, tint.setScalar(p.g));
      m.count++;
    }
    this.list.length = write;
    for (const mat in this.meshes) {
      for (const m of this.meshes[mat]) {
        if (!m.count) continue;
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
      }
    }
  }
}
