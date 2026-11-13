// Клетки с супероружием, числа прочности, столбы бонусной зоны, сундук и подбираемые предметы.
import * as T from '../../vendor/three/three.module.min.js?v=4d3622b6';
import { Kit, group, part, toyMaterial, metalMaterial, glowMaterial, canvasTexture, flat, place, hdr } from './kit.js?v=4d3622b6';
import { makeGun } from './guns.js?v=4d3622b6';
import { WEAPONS, BONUS_ROWS } from '../game.js?v=4d3622b6';

const toy = toyMaterial({ roughness: 0.5 });
const metal = metalMaterial();
const glow = glowMaterial();

const FONT = '900 150px "Arial Black", "Helvetica Neue", Arial, sans-serif';

// Цифры в одной текстуре: число меняется без перерисовки картинки
const DIGIT_W = 128;
const DIGIT_H = 180;
let digits = null;
function digitAtlas() {
  if (digits) return digits;
  digits = canvasTexture(DIGIT_W * 10, DIGIT_H, (c) => {
    c.font = FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (let i = 0; i < 10; i++) {
      const x = DIGIT_W * (i + 0.5);
      c.lineWidth = 24;
      c.strokeStyle = '#1b1830';
      c.strokeText(String(i), x, DIGIT_H / 2 + 6);
      c.fillStyle = '#ffffff';
      c.fillText(String(i), x, DIGIT_H / 2 + 6);
    }
  }, { aniso: 4 });
  return digits;
}

const digitMaterial = () => new T.MeshBasicMaterial({ map: digitAtlas(), transparent: true, depthWrite: false, fog: false, toneMapped: false });

export class NumberMesh {
  constructor(height) {
    const count = 3;
    this.height = height;
    this.width = height * (DIGIT_W / DIGIT_H) * 0.84;
    const pos = new Float32Array(count * 4 * 3);
    const uv = new Float32Array(count * 4 * 2);
    const idx = [];
    for (let i = 0; i < count; i++) {
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new T.Mesh(geo, digitMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.value = -1;
  }

  set(value) {
    const n = Math.max(0, Math.ceil(value));
    if (n === this.value) return false;
    this.value = n;
    const text = String(Math.min(999, n));
    const geo = this.mesh.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const w = this.width;
    const h = this.height;
    const full = (text.length * w) / 2;
    for (let i = 0; i < 3; i++) {
      const v = i * 4;
      if (i >= text.length) {
        for (let q = 0; q < 4; q++) pos.setXYZ(v + q, 0, 0, 0);
        continue;
      }
      const d = Number(text[i]);
      const x0 = -full + i * w - w * 0.09;
      const x1 = x0 + w * 1.18;
      pos.setXYZ(v, x0, h / 2, 0);
      pos.setXYZ(v + 1, x0, -h / 2, 0);
      pos.setXYZ(v + 2, x1, h / 2, 0);
      pos.setXYZ(v + 3, x1, -h / 2, 0);
      const u0 = d / 10;
      const u1 = (d + 1) / 10;
      uv.setXY(v, u0, 1);
      uv.setXY(v + 1, u0, 0);
      uv.setXY(v + 2, u1, 1);
      uv.setXY(v + 3, u1, 0);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    return true;
  }
}

const panelCache = new Map();
function panelTexture(weapon, extended = false) {
  const key = extended ? weapon + ':extended' : weapon;
  if (panelCache.has(key)) return panelCache.get(key);
  const w = WEAPONS[weapon];
  const hex = `#${new T.Color(w.color).getHexString()}`;
  const tex = canvasTexture(420, 300, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#17142b';
    c.strokeStyle = hex;
    c.lineWidth = 14;
    c.beginPath();
    c.roundRect(10, 10, W - 20, H - 20, 44);
    c.fill();
    c.stroke();
    c.fillStyle = hex;
    c.font = '900 52px "Avenir Next", "Arial Black", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(w.name.toUpperCase() + (extended ? ' · ×2' : ''), W / 2, H - 58, W - 60);
  });
  panelCache.set(key, tex);
  return tex;
}

const planeGeo = new T.PlaneGeometry(1, 1);

// Светлый столб, видный издалека
const beamTexture = () => canvasTexture(8, 128, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0.72)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}, { aniso: 1 });
let beamTex = null;
function beamMesh(radius, height, color, power = 1.5) {
  if (!beamTex) beamTex = beamTexture();
  const m = new T.Mesh(
    new T.CylinderGeometry(radius, radius, height, 18, 1, true).translate(0, height / 2, 0),
    new T.MeshBasicMaterial({ map: beamTex, color: hdr(color, power), transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false, toneMapped: false }),
  );
  m.renderOrder = 7;
  return m;
}

// ---------- Клетка ----------
const CAGE_H = 2.42;
const CAGE_R = 1.02;
let cageGeo = null;
function cageGeometry() {
  if (cageGeo) return cageGeo;
  const frame = new Kit();
  const r = CAGE_R;
  // Основание с полосами опасности
  frame.box(0x3a3550, 0, 0.1, 0, r * 2 + 0.34, 0.2, r * 2 + 0.34);
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const x = -r - 0.17 + t * (r * 2 + 0.34);
    for (const s of [-1, 1]) {
      frame.box(i % 2 ? 0xffc531 : 0x1d1a2c, x, 0.1, s * (r + 0.17), (r * 2 + 0.34) / 8, 0.15, 0.022, 0, 0, 0, 0.004);
      frame.box(i % 2 ? 0xffc531 : 0x1d1a2c, s * (r + 0.17), 0.1, x, 0.022, 0.15, (r * 2 + 0.34) / 8, 0, 0, 0, 0.004);
    }
  }
  // Стойки и нижняя рама
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      frame.box(0xffb21f, sx * r, CAGE_H / 2, sz * r, 0.24, CAGE_H, 0.24, 0, 0, 0, 0.05);
      frame.box(0xc97a12, sx * r, 0.33, sz * r, 0.28, 0.16, 0.28, 0, 0, 0, 0.03);
      frame.box(0xc97a12, sx * r, CAGE_H - 0.3, sz * r, 0.28, 0.14, 0.28, 0, 0, 0, 0.03);
    }
  }
  for (const s of [-1, 1]) {
    frame.box(0xd9921a, 0, 0.27, s * r, r * 2, 0.14, 0.16, 0, 0, 0, 0.03);
    frame.box(0xd9921a, s * r, 0.27, 0, 0.16, 0.14, r * 2, 0, 0, 0, 0.03);
  }
  const roof = new Kit();
  for (const s of [-1, 1]) {
    roof.box(0xffb21f, 0, 0.0, s * r, r * 2 + 0.24, 0.2, 0.22, 0, 0, 0, 0.04);
    roof.box(0xffb21f, s * r, 0.0, 0, 0.22, 0.2, r * 2 + 0.24, 0, 0, 0, 0.04);
  }
  roof.box(0x6b7388, 0, 0.1, 0, r * 2 - 0.12, 0.05, r * 2 - 0.12, 0, 0, 0, 0.012);
  roof.cyl(0xffc531, 0, 0.17, 0, 0.32, 0.38, 0.1, 0, 0, 0, 16);
  const bar = new Kit().cyl(0xc5ccdb, 0, 0, 0, 0.052, 0.052, CAGE_H - 0.42, 0, 0, 0, 8).build();
  // Навесной замок на передней стороне
  const lock = new Kit();
  lock.torus(0xb9c2d6, 0, 0.17, 0, 0.11, 0.03, 0, 0, 0, Math.PI, 14);
  lock.cyl(0xb9c2d6, -0.11, 0.12, 0, 0.03, 0.03, 0.1, 0, 0, 0, 8);
  lock.cyl(0xb9c2d6, 0.11, 0.12, 0, 0.03, 0.03, 0.1, 0, 0, 0, 8);
  lock.box(0xffc531, 0, 0, 0, 0.36, 0.28, 0.13, 0, 0, 0, 0.04);
  lock.box(0x1b1830, 0, -0.01, 0.068, 0.05, 0.1, 0.012, 0, 0, 0, 0.004);
  lock.ball(0x1b1830, 0, 0.04, 0.068, 0.038, 0.038, 0.012);
  cageGeo = { frame: frame.build({ y0: 0, y1: 1.2, low: 0.82, high: 1 }), roof: roof.build(), bar, lock: lock.build() };
  return cageGeo;
}

export class CageView {
  constructor(weapon) {
    const g = cageGeometry();
    this.weapon = weapon;
    this.root = new T.Group();
    this.frame = part(this.root, g.frame, toy);
    this.roof = part(this.root, g.roof, toy, 0, CAGE_H, 0);
    this.lock = part(this.root, g.lock, toy, 0, 1.22, CAGE_R + 0.09);

    // Прутья: каждый можно выбить отдельно
    this.bars = new T.InstancedMesh(g.bar, metal, 16);
    this.bars.castShadow = true;
    this.barAt = [];
    const r = CAGE_R;
    const spots = [-0.6, -0.2, 0.2, 0.6];
    for (const x of spots) this.barAt.push([x, r], [x, -r], [r, x], [-r, x]);
    this.root.add(this.bars);
    // Сначала ломаются прутья спереди, чтобы пушка становилась виднее
    this.order = [0, 4, 8, 12, 2, 3, 6, 7, 10, 11, 14, 15, 1, 5, 9, 13];

    this.holder = group(this.root, 0, 1.25, 0);
    const gun = makeGun(weapon);
    gun.root.position.z = 0.3;
    gun.root.position.y = -0.1;
    gun.root.scale.setScalar(1.42);
    this.holder.add(gun.root);
    this.gun = gun;

    const color = WEAPONS[weapon].color;
    this.inner = beamMesh(0.78, CAGE_H - 0.3, color, 0.55);
    this.inner.position.y = 0.16;
    this.root.add(this.inner);
    this.floor = new T.Mesh(new T.CircleGeometry(0.86, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: hdr(color, 0.72) }));
    this.floor.position.y = 0.205;
    this.root.add(this.floor);

    // Табличка с запасом прочности всегда смотрит в камеру
    this.plate = group(this.root, 0, CAGE_H + 1.18, 0);
    this.panel = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ map: panelTexture(weapon), transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.panel.scale.set(2.1, 1.5, 1);
    this.panel.renderOrder = 10;
    this.plate.add(this.panel);
    this.number = new NumberMesh(0.92);
    this.number.mesh.position.set(0, 0.18, 0.01);
    this.plate.add(this.number.mesh);
    this.barBack = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ color: 0x3b3656, depthWrite: false, fog: false, transparent: true, toneMapped: false }));
    this.barBack.scale.set(1.68, 0.1, 1);
    this.barBack.position.set(0, -0.27, 0.012);
    this.barBack.renderOrder = 11;
    this.plate.add(this.barBack);
    this.barFill = new T.Mesh(planeGeo, new T.MeshBasicMaterial({ color: hdr(color, 1.1), depthWrite: false, fog: false, transparent: true, toneMapped: false }));
    this.barFill.position.set(0, -0.27, 0.014);
    this.barFill.renderOrder = 12;
    this.plate.add(this.barFill);
    this.reset();
  }

  reset() {
    this.root.visible = true;
    this.root.position.y = 0;
    this.root.rotation.set(0, 0, 0);
    this.roof.rotation.set(0, 0, 0);
    this.roof.position.y = CAGE_H;
    this.lock.visible = true;
    this.lock.rotation.set(0, 0, 0);
    this.lost = 0;
    this.pulse = 0;
    this.shake = 0;
    this.landed = false;
    this.number.value = -1;
    const m = new T.Matrix4();
    this.barAt.forEach(([x, z], i) => {
      m.makeTranslation(x, CAGE_H / 2 + 0.03, z);
      this.bars.setMatrixAt(i, m);
    });
    this.bars.count = 16;
    this.bars.instanceMatrix.needsUpdate = true;
  }

  // Выбивает n прутьев, возвращает их места: там view устроит разлёт обломков
  breakBars(n) {
    const out = [];
    const m = new T.Matrix4();
    const zero = new T.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n && this.lost < 16; i++) {
      const index = this.order[this.lost++];
      this.bars.getMatrixAt(index, m);
      out.push(new T.Vector3().setFromMatrixPosition(m));
      this.bars.setMatrixAt(index, zero);
    }
    this.bars.instanceMatrix.needsUpdate = true;
    return out;
  }

  crack(stage) {
    this.pulse = 1;
    if (stage >= 2) {
      // Перекосило крышу, замок сорван
      this.roof.rotation.z = 0.13;
      this.roof.rotation.x = -0.07;
      this.roof.position.y = CAGE_H - 0.05;
      this.lock.visible = false;
    } else {
      this.lock.rotation.z = 0.45;
    }
    return this.breakBars(stage >= 2 ? 6 : 5);
  }

  update(dt, item, time, camera) {
    this.holder.rotation.y = time * 1.5;
    this.holder.position.y = 1.25 + Math.sin(time * 2.4) * 0.07;
    if (this.gun.spin) this.gun.spin.rotation.z = time * 6;
    const panel = panelTexture(this.weapon, item.duration > 1);
    if (this.panel.material.map !== panel) this.panel.material.map = panel;
    this.number.set(item.hp);
    const f = Math.max(0, item.hp / item.maxHp);
    this.barFill.scale.set(Math.max(0.001, 1.64 * f), 0.075, 1);
    this.barFill.position.x = -0.82 * (1 - f);
    this.plate.quaternion.copy(camera.quaternion);
    if (item.hit > 0.07) {
      this.pulse = 1;
      this.shake = 1;
    }
    this.pulse = Math.max(0, this.pulse - dt * 6);
    this.shake = Math.max(0, this.shake - dt * 7);
    const s = 1 + this.pulse * 0.13;
    this.plate.scale.setScalar(s);
    this.root.position.x = item.x + Math.sin(time * 70) * 0.05 * this.shake;
    this.root.rotation.z = Math.sin(time * 53) * 0.014 * this.shake;
    // Клетка, сброшенная при боссе, падает сверху
    const fall = item.drop ? Math.max(0, 0.5 - item.age) / 0.5 : 0;
    this.root.position.y = fall * fall * 16;
    const justLanded = item.drop && !this.landed && fall === 0;
    if (justLanded) this.landed = true;
    return justLanded;
  }
}

// ---------- Бонусная зона ----------
const ROW_COLORS = [0xff5fa2, 0xffa23c, 0xffd24a, 0x4dde8a, 0x45b8ff];
const columnGeos = [];
function columnGeometry(row) {
  if (columnGeos[row]) return columnGeos[row];
  const k = new Kit();
  const c = ROW_COLORS[row % ROW_COLORS.length];
  k.add(flat(new T.CylinderGeometry(0.8, 0.9, 1.7, 6).translate(0, 0.85, 0)), 0x8c95b8);
  k.add(flat(new T.CylinderGeometry(0.84, 0.84, 0.16, 6).translate(0, 1.72, 0)), c);
  k.add(flat(new T.CylinderGeometry(0.94, 0.98, 0.14, 6).translate(0, 0.07, 0)), c);
  k.add(flat(new T.CylinderGeometry(0.46, 0.6, 0.1, 6).translate(0, 1.84, 0)), 0xffc531);
  columnGeos[row] = k.build({ y0: 0, y1: 1.3, low: 0.8, high: 1.04 });
  return columnGeos[row];
}
const gemGeo = new Kit().add(flat(new T.OctahedronGeometry(0.34, 0).scale(1, 1.32, 1)), 0xffffff).build();

export class ColumnView {
  constructor(row) {
    this.root = new T.Group();
    part(this.root, columnGeometry(row), toy);
    this.gem = new T.Mesh(gemGeo, new T.MeshBasicMaterial({ color: hdr(ROW_COLORS[row % ROW_COLORS.length], 1.7) }));
    this.gem.position.y = 2.45;
    this.root.add(this.gem);
    this.number = new NumberMesh(0.72);
    this.number.mesh.position.set(0, 0.92, 0.92);
    this.root.add(this.number.mesh);
    this.shake = 0;
  }

  reset() {
    this.root.visible = true;
    this.number.value = -1;
    this.shake = 0;
    this.root.scale.setScalar(1);
  }

  update(dt, item, time) {
    this.gem.rotation.y = time * 2 + item.id;
    this.gem.position.y = 2.45 + Math.sin(time * 3 + item.id) * 0.08;
    this.number.set(item.hp);
    if (item.hit > 0.07) this.shake = 1;
    this.shake = Math.max(0, this.shake - dt * 8);
    this.root.position.x = item.x + Math.sin(time * 80) * 0.05 * this.shake;
    this.root.scale.set(1 + this.shake * 0.05, 1 - this.shake * 0.04, 1 + this.shake * 0.05);
  }
}

// Шахматная черта и радужный пол под столбами
export class FinishView {
  constructor() {
    this.root = new T.Group();
    const check = canvasTexture(320, 40, (c, w, h) => {
      const size = h / 2;
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < w / size; x++) {
          c.fillStyle = (x + y) % 2 ? '#111019' : '#fffdf5';
          c.fillRect(x * size, y * size, size, size);
        }
      }
    }, { aniso: 8 });
    const line = new T.Mesh(new T.PlaneGeometry(10.9, 1.35).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: check }));
    line.position.y = 0.035;
    this.root.add(line);
    this.floors = BONUS_ROWS.map((_, i) => {
      const m = new T.Mesh(new T.PlaneGeometry(11.2, 4.62, 2, 4).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: hdr(ROW_COLORS[i], 0.82) }));
      m.position.set(0, 0.03, -8 - i * 4.6);
      this.root.add(m);
      return m;
    });
    this.line = line;
  }
}

export class ChestView {
  constructor() {
    this.root = new T.Group();
    const k = new Kit();
    k.add(flat(new T.CylinderGeometry(1.7, 1.95, 0.9, 6).translate(0, 0.45, 0)), 0x7f88ac);
    k.add(flat(new T.CylinderGeometry(1.8, 1.8, 0.14, 6).translate(0, 0.95, 0)), 0xffc531);
    // Короб
    k.box(0xb0462f, 0, 1.6, 0, 2.3, 1.1, 1.5);
    k.box(0xffc531, 0, 1.08, 0, 2.38, 0.14, 1.58, 0, 0, 0, 0.03);
    for (const s of [-1, 1]) k.box(0xffc531, s * 0.84, 1.6, 0, 0.2, 1.16, 1.56, 0, 0, 0, 0.03);
    part(this.root, k.build(), toy);
    const lidKit = new Kit();
    lidKit.add(place(new T.CylinderGeometry(0.76, 0.76, 2.3, 18, 1, false, 0, Math.PI), 0, 0, 0.76, 1, 0.75, 1, 0, 0, Math.PI / 2), 0xc9553a);
    lidKit.box(0xffc531, 0, 0.0, 0.76, 2.38, 0.1, 1.58, 0, 0, 0, 0.03);
    for (const s of [-1, 1]) lidKit.add(place(new T.CylinderGeometry(0.8, 0.8, 0.2, 18, 1, false, 0, Math.PI), s * 0.84, 0, 0.76, 1, 0.78, 1, 0, 0, Math.PI / 2), 0xffc531);
    lidKit.ball(0x45d6ff, 0, 0.3, 1.46, 0.2, 0.2, 0.1);
    this.lid = group(this.root, 0, 2.15, -0.76);
    part(this.lid, lidKit.build(), toy);
    // Сияние изнутри
    const light = new Kit();
    light.add(new T.BoxGeometry(2.0, 0.08, 1.2).translate(0, 2.12, 0), 0xffe08a, 4);
    this.shine = new T.Mesh(light.build(), glow);
    this.shine.visible = false;
    this.root.add(this.shine);
    this.beam = beamMesh(1.2, 16, 0xffd24a);
    this.beam.position.y = 2.1;
    this.beam.visible = false;
    this.root.add(this.beam);
    this.open = 0;
  }

  reset() {
    this.open = 0;
    this.lid.rotation.x = 0;
    this.shine.visible = false;
    this.beam.visible = false;
    this.root.visible = true;
  }

  update(dt, item) {
    if (item.open) {
      this.open = Math.min(1, this.open + dt * 3.2);
      const e = 1 - (1 - this.open) ** 3;
      this.lid.rotation.x = -e * 1.95 * (1 + Math.sin(this.open * 9) * (1 - this.open) * 0.2);
      this.shine.visible = true;
      this.beam.visible = true;
    }
  }
}

// ---------- Подбираемые предметы ----------
const PICK_COLOR = { heal: 0xff4d7a, shield: 0x4df0e0, gem: 0x62d6ff };
const pickGeo = {};
function pickGeometry(type) {
  if (pickGeo[type]) return pickGeo[type];
  const k = new Kit();
  if (type === 'heal') {
    k.ball(0xff4d7a, -0.2, 0.14, 0, 0.27, 0.27, 0.2);
    k.ball(0xff4d7a, 0.2, 0.14, 0, 0.27, 0.27, 0.2);
    k.add(flat(new T.ConeGeometry(0.42, 0.56, 4).rotateX(Math.PI).scale(1.08, 1, 0.42).rotateY(Math.PI / 4).translate(0, -0.16, 0)), 0xff4d7a);
    k.ball(0xffd3df, -0.24, 0.24, 0.13, 0.07, 0.07, 0.04);
  } else if (type === 'shield') {
    k.box(0x2fb9c9, 0, 0.1, 0, 0.62, 0.5, 0.12, 0, 0, 0, 0.05);
    k.add(flat(new T.ConeGeometry(0.42, 0.4, 4).rotateX(Math.PI).scale(1.04, 1, 0.14).rotateY(Math.PI / 4).translate(0, -0.33, 0)), 0x2fb9c9);
    k.box(0xdffcff, 0, 0.12, 0.07, 0.1, 0.44, 0.02, 0, 0, 0, 0.006);
    k.box(0xdffcff, 0, 0.12, 0.07, 0.44, 0.1, 0.02, 0, 0, 0, 0.006);
  } else {
    k.add(flat(new T.OctahedronGeometry(0.34, 0).scale(1, 1.3, 1)), 0x62d6ff);
    k.add(flat(new T.OctahedronGeometry(0.17, 0).scale(1, 1.3, 1).translate(0, 0, 0.17)), 0xd9f6ff);
  }
  pickGeo[type] = k.build();
  return pickGeo[type];
}
const groundRing = new T.RingGeometry(0.72, 1, 36, 1).rotateX(-Math.PI / 2);

export class PickupView {
  constructor(type, weapon) {
    this.type = type;
    this.root = new T.Group();
    this.spin = group(this.root);
    let color = PICK_COLOR[type];
    if (type === 'weapon') {
      color = WEAPONS[weapon].color;
      const gun = makeGun(weapon);
      gun.root.position.z = 0.3;
      gun.root.scale.setScalar(1.3);
      this.spin.add(gun.root);
      this.gun = gun;
      this.beam = beamMesh(0.8, 6.5, color, 0.8);
      this.root.add(this.beam);
    } else {
      const m = new T.Mesh(pickGeometry(type), toy);
      m.castShadow = true;
      this.spin.add(m);
      this.spin.scale.setScalar(1.2);
    }
    this.ring = new T.Mesh(groundRing, new T.MeshBasicMaterial({ color: hdr(color, 2), transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    this.ring.position.y = 0.06;
    this.root.add(this.ring);
  }

  reset() {
    this.root.visible = true;
  }

  update(dt, item, time) {
    this.root.position.set(item.x, 0, item.z);
    this.spin.position.y = item.y + Math.sin(time * 3.2 + item.id) * 0.12;
    this.spin.rotation.y = time * 2.1;
    if (this.gun?.spin) this.gun.spin.rotation.z = time * 6;
    const s = 1 + Math.sin(time * 5 + item.id) * 0.1;
    this.ring.scale.set(s * (this.type === 'weapon' ? 1.2 : 0.8), 1, s * (this.type === 'weapon' ? 1.2 : 0.8));
  }
}

