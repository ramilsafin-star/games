// Башенный кран: решётчатая мачта растёт вместе с домом, стрела поворачивается, тележка едет
// по стреле, груз качается на тросе. Всё движется от точки, куда ведёт палец
import * as T from "../vendor/three/three.module.min.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";

const YELLOW = "#ffc21a";
const SECTION = 4;
const MAST_W = 2.4;
const JIB = 52;
const MAST_MAX = 400;
const UP = new T.Vector3(0, 1, 0);
const tmpA = new T.Vector3();
const tmpB = new T.Vector3();
const tmpC = new T.Color();

function painted(g, color) {
  tmpC.set(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = tmpC.r;
    a[i * 3 + 1] = tmpC.g;
    a[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute("color", new T.BufferAttribute(a, 3));
  return g;
}

function block(w, h, d, x, y, z, color) {
  const g = new T.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute("uv");
  g.translate(x, y, z);
  return painted(g, color);
}

// Балка между двумя точками
function beam(a, b, t, color) {
  const from = tmpA.set(...a);
  const to = tmpB.set(...b);
  const len = from.distanceTo(to);
  const g = new T.BoxGeometry(t, len, t).toNonIndexed();
  g.deleteAttribute("uv");
  const q = new T.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize());
  g.applyQuaternion(q);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return painted(g, color);
}

function mastSection() {
  const list = [];
  const h = MAST_W / 2;
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
  corners.forEach(([x, z], i) => {
    const [nx, nz] = corners[(i + 1) % 4];
    list.push(beam([x, 0, z], [x, SECTION, z], 0.2, YELLOW));
    list.push(beam([x, 0, z], [nx, SECTION / 2, nz], 0.09, YELLOW));
    list.push(beam([nx, SECTION / 2, nz], [x, SECTION, z], 0.09, YELLOW));
    list.push(beam([x, 0, z], [nx, 0, nz], 0.12, YELLOW));
  });
  return mergeGeometries(list);
}

// Стрела треугольного сечения вдоль +X
function jibFrame(length, color) {
  const list = [];
  const w = 0.95;
  const h = 1.7;
  const step = 2.2;
  const n = Math.round(length / step);
  const at = (i) => (i / n) * length;
  list.push(beam([0, h, 0], [length, 0.3, 0], 0.18, color));
  list.push(beam([0, 0, -w], [length, 0, -w * 0.3], 0.2, color));
  list.push(beam([0, 0, w], [length, 0, w * 0.3], 0.2, color));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const k2 = (i + 1) / n;
    const wa = w * (1 - k * 0.7);
    const wb = w * (1 - k2 * 0.7);
    const ta = h + (0.3 - h) * k;
    const tb = h + (0.3 - h) * k2;
    const a = at(i);
    const b = at(i + 1);
    list.push(beam([a, 0, -wa], [b, tb, 0], 0.07, color));
    list.push(beam([a, 0, wa], [b, tb, 0], 0.07, color));
    list.push(beam([a, ta, 0], [b, 0, -wb], 0.07, color));
    list.push(beam([a, ta, 0], [b, 0, wb], 0.07, color));
    list.push(beam([b, 0, -wb], [b, 0, wb], 0.07, color));
  }
  return mergeGeometries(list);
}

function headParts() {
  const list = [jibFrame(JIB, YELLOW)];
  // Красно-белый кончик стрелы
  list.push(block(0.7, 0.7, 0.7, JIB, 0.3, 0, "#ff4f3c"));
  // Противовес и его балка
  list.push(beam([0, 0.2, -0.9], [-15, 0.2, -0.7], 0.3, YELLOW), beam([0, 0.2, 0.9], [-15, 0.2, 0.7], 0.3, YELLOW));
  for (let i = 0; i < 6; i++) list.push(beam([-i * 2.6, 0.2, -0.85], [-i * 2.6, 0.2, 0.85], 0.16, YELLOW));
  for (let i = 0; i < 4; i++) list.push(block(1.15, 2.6, 2.2, -11 - i * 1.25, -1, 0, i % 2 ? "#9ca3ac" : "#b6bcc4"));
  // Рубка крановщика
  list.push(block(2.1, 2.4, 2, 1.4, -1.6, 1.9, "#f6f7f8"));
  list.push(block(2.14, 1.1, 2.04, 1.4, -1.25, 1.9, "#25425a"));
  // Поворотный круг и вершина
  list.push(block(MAST_W + 0.7, 0.5, MAST_W + 0.7, 0, -0.35, 0, "#3c4148"));
  const top = 9.5;
  list.push(beam([-1, 0, -1], [0, top, 0], 0.26, YELLOW), beam([1, 0, -1], [0, top, 0], 0.26, YELLOW), beam([-1, 0, 1], [0, top, 0], 0.26, YELLOW), beam([1, 0, 1], [0, top, 0], 0.26, YELLOW));
  // Растяжки от вершины к стреле и противовесу
  list.push(beam([0, top, 0], [JIB * 0.72, 1, 0], 0.07, "#555a60"), beam([0, top, 0], [JIB * 0.38, 1.3, 0], 0.07, "#555a60"), beam([0, top, 0], [-13, 0.3, 0.6], 0.07, "#555a60"), beam([0, top, 0], [-13, 0.3, -0.6], 0.07, "#555a60"));
  return mergeGeometries(list);
}

function stretch(mesh, from, to) {
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  tmpA.copy(to).sub(from);
  const len = Math.max(0.001, tmpA.length());
  mesh.quaternion.setFromUnitVectors(UP, tmpA.divideScalar(len));
  mesh.scale.set(1, len, 1);
}

export class Crane {
  constructor(scene) {
    const paint = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.32 });
    const cable = new T.MeshStandardMaterial({ color: "#2b2d31", roughness: 0.6, metalness: 0.5 });
    this.root = new T.Group();
    scene.add(this.root);
    this.mast = new T.InstancedMesh(mastSection(), paint, MAST_MAX);
    this.mast.frustumCulled = false;
    this.mast.castShadow = true;
    this.mast.count = 0;
    this.root.add(this.mast);
    const base = new T.Mesh(block(7, 1, 7, 0, 0.5, 0, "#a9aeb5"), paint);
    base.castShadow = true;
    base.receiveShadow = true;
    this.root.add(base);
    this.head = new T.Group();
    this.root.add(this.head);
    const frame = new T.Mesh(headParts(), paint);
    frame.castShadow = true;
    frame.frustumCulled = false;
    this.head.add(frame);
    this.trolley = new T.Mesh(block(2, 0.5, 1.6, 0, -0.3, 0, "#e23b2e"), paint);
    this.trolley.castShadow = true;
    this.head.add(this.trolley);
    const thin = new T.CylinderGeometry(0.05, 0.05, 1, 5);
    this.rope = new T.Mesh(thin, cable);
    this.rope.frustumCulled = false;
    scene.add(this.rope);
    this.slings = [0, 1, 2, 3].map(() => {
      const m = new T.Mesh(thin, cable);
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    const hook = mergeGeometries([block(1.1, 0.8, 0.5, 0, 0.5, 0, YELLOW), block(0.5, 0.26, 0.5, 0, 0, 0, "#e23b2e")]);
    this.hook = new T.Mesh(hook, paint);
    this.hook.castShadow = true;
    scene.add(this.hook);
    this.mx = 0;
    this.mz = 0;
    this.angle = 0;
    this.radius = 20;
    this.wantAngle = 0;
    this.wantRadius = 20;
    this.jibY = 30;
    this.hookY = 20;
    this.ox = 0;
    this.oz = 0;
    this.vx = 0;
    this.vz = 0;
    this.bx = 0;
    this.bz = 0;
    this.bvx = 0;
    this.bvz = 0;
    this.speed = 0;
    this.pos = new T.Vector3();
    this.anchors = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()];
    this.attached = false;
    this.sizeCache = 0;
  }

  // Кран стоит сзади слева от участка; x, z — середина участка
  setPlot(x, z) {
    this.mx = x - 24;
    this.mz = z - 16;
    this.root.position.set(this.mx, 0, this.mz);
    this.aim(x + 16, z + 4);
    this.angle = this.wantAngle;
    this.radius = this.wantRadius;
    this.ox = this.oz = this.vx = this.vz = 0;
    this.bx = this.mx + Math.cos(this.angle) * this.radius;
    this.bz = this.mz - Math.sin(this.angle) * this.radius;
    this.bvx = this.bvz = 0;
  }

  // Куда нужно подвести крюк
  aim(x, z) {
    const dx = x - this.mx;
    const dz = z - this.mz;
    this.wantAngle = Math.atan2(-dz, dx);
    this.wantRadius = T.MathUtils.clamp(Math.hypot(dx, dz), 5, JIB - 2);
  }

  // Шаг 1/60: стрела и тележка догоняют цель, груз качается маятником
  step(dt, swing = 1) {
    let da = this.wantAngle - this.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const k = 1 - Math.exp(-dt * 6.5);
    this.angle += da * k;
    this.radius += (this.wantRadius - this.radius) * k;
    const bx = this.mx + Math.cos(this.angle) * this.radius;
    const bz = this.mz - Math.sin(this.angle) * this.radius;
    const nvx = (bx - this.bx) / dt;
    const nvz = (bz - this.bz) / dt;
    const ax = (nvx - this.bvx) / dt;
    const az = (nvz - this.bvz) / dt;
    this.bx = bx;
    this.bz = bz;
    this.bvx = nvx;
    this.bvz = nvz;
    this.speed = Math.hypot(nvx, nvz);
    // Маятник: тележка уехала, груз отстаёт и качается
    const w = 2.1;
    const damp = 1.05;
    this.vx += (-ax * 0.1 * swing - w * w * this.ox - damp * this.vx) * dt;
    this.vz += (-az * 0.1 * swing - w * w * this.oz - damp * this.vz) * dt;
    this.ox = T.MathUtils.clamp(this.ox + this.vx * dt, -2.6, 2.6);
    this.oz = T.MathUtils.clamp(this.oz + this.vz * dt, -2.6, 2.6);
    this.pos.set(this.bx + this.ox, this.hookY, this.bz + this.oz);
  }

  // Рисование: мачта по высоте стрелы, тросы от тележки до крюка и до углов груза
  draw(loadAnchors) {
    const sections = Math.min(MAST_MAX, Math.ceil((this.jibY - 1) / SECTION));
    const m = new T.Matrix4();
    for (let i = 0; i < sections; i++) {
      m.makeTranslation(0, 1 + i * SECTION, 0);
      this.mast.setMatrixAt(i, m);
    }
    if (sections !== this.mast.count) {
      this.mast.count = sections;
      this.mast.instanceMatrix.needsUpdate = true;
      this.mast.computeBoundingSphere();
    }
    this.head.position.y = this.jibY;
    this.head.rotation.y = this.angle;
    this.trolley.position.x = this.radius;
    const top = tmpB.set(this.bx, this.jibY - 0.5, this.bz).clone();
    this.hook.position.copy(this.pos);
    stretch(this.rope, top, this.pos.clone().setY(this.pos.y + 0.8));
    this.attached = !!loadAnchors;
    this.slings.forEach((s, i) => {
      s.visible = this.attached;
      if (this.attached) stretch(s, this.pos, loadAnchors[i]);
    });
  }
}
