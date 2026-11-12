import * as T from "../vendor/three/three.module.min.js?v=151d9996";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=151d9996";

export const GEO = {
  sphere: new T.SphereGeometry(1, 22, 15),
  low: new T.IcosahedronGeometry(1, 1),
  spark: new T.OctahedronGeometry(1),
  tube: new T.CylinderGeometry(1, 1, 1, 14),
  cone: new T.ConeGeometry(1, 1, 12),
  box: new RoundedBoxGeometry(1, 1, 1, 2, 0.15),
  ring: new T.TorusGeometry(1, 0.06, 6, 28),
};

export const enamel = (color, roughness = 0.38, metalness = 0.16) =>
  new T.MeshStandardMaterial({ color, roughness, metalness });
export const glow = (color) => new T.MeshBasicMaterial({ color, toneMapped: false });

const brass = enamel("#ffc14f", 0.33);
const lemon = enamel("#ffdb77", 0.34);
const orange = enamel("#f58458");
const ink = enamel("#1d536c");
const pale = enamel("#d6fae9");
const lens = enamel("#4faee6", 0.15, 0.28);
const glassLight = glow("#b0f5ff");
const laserBlue = glow("#66fbff");
const seaGlass = enamel("#4788a7", 0.26);
const ruby = enamel("#fb6e6d");
const salmon = enamel("#ffa36d");
const copper = enamel("#be5872");
const violet = enamel("#aa81e7", 0.31);
const lilac = enamel("#e7a3ed");
const plum = enamel("#69539f");
const goldGlow = glow("#ffd77f");
const magenta = glow("#ff9ecf");
const sunny = enamel("#ffd66b", 0.42);
const cream = enamel("#fff1c9", 0.5);
const tangerine = enamel("#ff9a4d", 0.4);
const teal = enamel("#2fb3a6", 0.3);
const mint = enamel("#8cf0cf", 0.34);
const navy = enamel("#27506f", 0.36);
const voltGlow = glow("#b6fff0");
const steel = enamel("#6f8fa6", 0.3, 0.45);
const crimson = enamel("#d9485f", 0.36);
const emberGlow = glow("#ffb36b");

export function mesh(geometry, material, x, y, z, sx, sy = sx, sz = sx) {
  const object = new T.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  return object;
}

function disc(material, x, y, z, radius, thickness) {
  const object = mesh(GEO.tube, material, x, y, z, radius, thickness, radius);
  object.rotation.x = Math.PI / 2;
  return object;
}

export function submarine() {
  const g = new T.Group();
  g.add(
    mesh(GEO.sphere, brass, 0, 0, 0.06, 0.83, 0.62, 1.37),
    mesh(GEO.sphere, lemon, 0, 0.12, -0.48, 0.69, 0.52, 0.81),
    mesh(GEO.sphere, lens, 0, 0.48, -0.39, 0.52, 0.38, 0.57),
    mesh(GEO.sphere, glassLight, -0.19, 0.71, -0.59, 0.17, 0.043, 0.12),
    mesh(GEO.sphere, pale, -0.01, 0.66, -0.73, 0.065, 0.028, 0.07),
    mesh(GEO.box, orange, 0, 0.33, 0.83, 0.19, 0.7, 0.63),
    mesh(GEO.tube, ink, 0.12, 0.67, 0.45, 0.085, 0.35, 0.085),
    mesh(GEO.box, orange, 0.12, 0.84, 0.35, 0.15, 0.12, 0.29),
    mesh(GEO.sphere, pale, 0.12, 0.85, 0.18, 0.075),
    disc(ink, 0, 0, 1.39, 0.26, 0.29),
    disc(laserBlue, 0, 0, -1.26, 0.23, 0.13),
  );
  for (const s of [-1, 1]) {
    const sideFin = mesh(GEO.box, orange, s * 0.86, -0.02, 0.59, 0.82, 0.17, 0.55);
    sideFin.rotation.y = s * 0.24;
    g.add(sideFin);
    g.add(disc(ink, s * 0.73, -0.11, -0.43, 0.22, 0.66));
    g.add(disc(laserBlue, s * 0.73, -0.11, -0.77, 0.14, 0.09));
    for (const z of [0.09, 0.49]) {
      const port = mesh(GEO.tube, pale, s * 0.78, 0.13, z, 0.136, 0.047, 0.136);
      const center = mesh(GEO.tube, lens, s * 0.81, 0.13, z, 0.094, 0.05, 0.094);
      port.rotation.z = center.rotation.z = Math.PI / 2;
      g.add(port, center);
    }
  }
  const propeller = new T.Group();
  propeller.position.z = 1.56;
  for (let i = 0; i < 3; i++) {
    const blade = mesh(GEO.box, orange, 0, 0.18, 0, 0.12, 0.37, 0.065);
    const arm = new T.Group();
    arm.rotation.z = i * Math.PI * 2 / 3;
    arm.add(blade);
    propeller.add(arm);
  }
  propeller.add(mesh(GEO.sphere, pale, 0, 0, 0, 0.115));
  g.add(propeller);
  g.userData.propeller = propeller;
  // стволы модуля «Второй ствол»: сначала пара по бокам, потом верхний
  const side = new T.Group();
  for (const s of [-1, 1]) side.add(disc(ink, s * 0.73, -0.11, -0.98, 0.1, 0.5), disc(laserBlue, s * 0.73, -0.11, -1.25, 0.12, 0.07));
  const top = new T.Group();
  top.add(disc(ink, 0, 0.36, -1.12, 0.1, 0.56), disc(laserBlue, 0, 0.36, -1.42, 0.12, 0.07));
  side.visible = top.visible = false;
  g.add(side, top);
  g.userData.barrels = [side, top];
  return g;
}

function crab() {
  const g = new T.Group();
  g.add(mesh(GEO.sphere, ruby, 0, 0, 0, 0.86, 0.57, 0.71),
    mesh(GEO.sphere, salmon, 0, 0.29, 0.13, 0.72, 0.32, 0.59),
    mesh(GEO.box, copper, 0, 0, -0.57, 0.65, 0.26, 0.22));
  const limbs = [];
  for (const s of [-1, 1]) {
    g.add(mesh(GEO.sphere, ink, s * 0.29, 0.27, -0.59, 0.16));
    g.add(mesh(GEO.sphere, goldGlow, s * 0.29, 0.3, -0.714, 0.075));
    for (let i = 0; i < 3; i++) {
      const leg = mesh(GEO.box, copper, s * 0.79, -0.19, 0.46 - i * 0.34, 0.54, 0.19, 0.17);
      leg.rotation.y = s * (i - 1) * 0.34;
      g.add(leg);
    }
    const claw = new T.Group();
    claw.position.set(s * 0.81, 0.03, -0.48);
    claw.add(mesh(GEO.sphere, salmon, s * 0.17, 0, -0.23, 0.32, 0.24, 0.43),
      mesh(GEO.cone, ruby, s * 0.25, 0.01, -0.5, 0.16, 0.33, 0.16));
    claw.children[1].rotation.x = -Math.PI / 2;
    limbs.push(claw);
    g.add(claw);
  }
  g.userData.limbs = limbs;
  return g;
}

function jelly() {
  const g = new T.Group();
  g.add(mesh(GEO.sphere, violet, 0, 0.25, 0, 0.89, 0.64, 0.89),
    mesh(GEO.sphere, plum, 0, 0.02, 0, 0.95, 0.28, 0.95),
    mesh(GEO.sphere, lilac, 0, 0.65, 0, 0.49, 0.26, 0.52));
  const ring = mesh(GEO.ring, magenta, 0, 0.13, 0, 0.85);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const limbs = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const limb = new T.Group();
    limb.position.set(Math.sin(a) * 0.62, -0.12, Math.cos(a) * 0.62);
    limb.add(mesh(GEO.sphere, violet, 0, -0.24, 0, 0.14, 0.38, 0.14),
      mesh(GEO.sphere, magenta, 0, -0.57, 0, 0.11));
    g.add(limb);
    limbs.push(limb);
  }
  for (const s of [-1, 1]) g.add(mesh(GEO.sphere, glassLight, s * 0.29, 0.34, -0.8, 0.112));
  g.userData.limbs = limbs;
  return g;
}

function mine() {
  const g = new T.Group();
  g.add(mesh(GEO.low, copper, 0, 0, 0, 0.62));
  const axes = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)];
  for (const axis of axes) {
    for (const side of [-1, 1]) {
      const spike = mesh(GEO.cone, salmon, axis.x * side * 0.65, axis.y * side * 0.65, axis.z * side * 0.65, 0.22, 0.46, 0.22);
      spike.quaternion.setFromUnitVectors(axes[1], axis.clone().multiplyScalar(side));
      g.add(spike);
    }
  }
  g.add(mesh(GEO.sphere, goldGlow, 0, 0.35, -0.4, 0.23));
  return g;
}

function kraken() {
  const g = new T.Group();
  g.add(mesh(GEO.sphere, plum, 0, 0.26, 0, 1.62, 1.2, 1.44),
    mesh(GEO.sphere, violet, 0, 0.76, 0.26, 1.37, 0.85, 1.22),
    mesh(GEO.box, seaGlass, 0, 0.29, -1.05, 2.13, 0.84, 0.73),
    mesh(GEO.sphere, ink, 0, 0.33, -1.4, 0.91, 0.31, 0.23),
    mesh(GEO.sphere, goldGlow, 0, 1.3, 0, 0.42, 0.3, 0.42));
  for (const s of [-1, 1]) {
    const eye = mesh(GEO.box, magenta, s * 0.42, 0.36, -1.59, 0.38, 0.19, 0.1);
    eye.rotation.z = s * 0.28;
    g.add(eye, mesh(GEO.tube, salmon, s * 1.29, 0.87, 0.12, 0.29, 0.78, 0.29));
  }
  const limbs = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const limb = new T.Group();
    limb.rotation.y = -a;
    limb.position.set(0, -0.26, 0);
    const segments = [];
    for (let j = 0; j < 3; j++) {
      const segment = mesh(GEO.sphere, j % 2 ? lilac : violet, 0.98 + j * 0.6, -j * 0.11, 0, 0.55 - j * 0.06, 0.28 - j * 0.035, 0.32 - j * 0.04);
      limb.add(segment);
      segments.push(segment);
    }
    const tip = mesh(GEO.sphere, magenta, 2.55, -0.22, 0, 0.135);
    limb.add(tip);
    segments.push(tip);
    limb.userData.segments = segments;
    limbs.push(limb);
    g.add(limb);
  }
  g.userData.limbs = limbs;
  return g;
}

// Рыба-ёж: круглый, в шипах; userData.body раздувается перед хлопком
function puffer() {
  const g = new T.Group();
  const body = new T.Group();
  body.add(mesh(GEO.sphere, sunny, 0, 0, 0, 0.74, 0.7, 0.78),
    mesh(GEO.sphere, cream, 0, -0.2, 0.02, 0.64, 0.5, 0.68));
  const up = new T.Vector3(0, 1, 0);
  for (let i = 0; i < 14; i++) {
    // шипы по сфере золотым сечением
    const y = 1 - (i + 0.5) / 14 * 1.7;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    const dir = new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const spike = mesh(GEO.cone, tangerine, dir.x * 0.78, dir.y * 0.72, dir.z * 0.8, 0.1, 0.34, 0.1);
    spike.quaternion.setFromUnitVectors(up, dir);
    body.add(spike);
  }
  g.add(body);
  for (const s of [-1, 1]) {
    g.add(mesh(GEO.sphere, pale, s * 0.3, 0.2, -0.66, 0.17),
      mesh(GEO.sphere, ink, s * 0.31, 0.21, -0.78, 0.09));
    const fin = mesh(GEO.box, tangerine, s * 0.8, 0, 0.1, 0.3, 0.07, 0.28);
    fin.rotation.y = s * 0.5;
    g.add(fin);
  }
  g.add(mesh(GEO.box, tangerine, 0, 0.05, 0.86, 0.07, 0.42, 0.3),
    mesh(GEO.sphere, ink, 0, -0.08, -0.75, 0.12, 0.06, 0.06));
  g.userData.body = body;
  return g;
}

// Электроугорь: цепочка звеньев вдоль оси z, голова впереди (−z); userData.spine извивается
function eel() {
  const g = new T.Group();
  const spine = [];
  for (let i = 0; i < 7; i++) {
    const size = 0.5 - i * 0.045;
    const link = new T.Group();
    link.position.z = -0.55 + i * 0.52;
    link.add(mesh(GEO.sphere, i % 2 ? teal : navy, 0, 0, 0, size, size * 0.86, 0.42));
    if (i && i < 6) link.add(mesh(GEO.sphere, voltGlow, 0, size * 0.8, 0, 0.09, 0.05, 0.16));
    g.add(link);
    spine.push(link);
  }
  const head = spine[0];
  head.add(mesh(GEO.sphere, navy, 0, 0.02, -0.34, 0.47, 0.4, 0.46),
    mesh(GEO.box, mint, 0, -0.16, -0.62, 0.5, 0.14, 0.3));
  for (const s of [-1, 1]) {
    head.add(mesh(GEO.sphere, voltGlow, s * 0.25, 0.2, -0.62, 0.11),
      mesh(GEO.cone, mint, s * 0.3, 0.42, -0.2, 0.07, 0.4, 0.07));
  }
  const tail = mesh(GEO.box, mint, 0, 0, 0.3, 0.06, 0.5, 0.42);
  spine[6].add(tail);
  g.userData.spine = spine;
  return g;
}

// Клешня-великан: бронированный краб-босс с двумя огромными клешнями
function titan() {
  const g = new T.Group();
  g.add(mesh(GEO.sphere, crimson, 0, 0.1, 0, 1.7, 1.02, 1.36),
    mesh(GEO.sphere, steel, 0, 0.62, 0.18, 1.38, 0.62, 1.1),
    mesh(GEO.box, navy, 0, 0.12, -1.08, 1.5, 0.5, 0.5),
    mesh(GEO.sphere, emberGlow, 0, 1.08, 0.2, 0.34, 0.2, 0.34));
  for (let i = 0; i < 3; i++) g.add(mesh(GEO.cone, steel, (i - 1) * 0.72, 1.12, 0.42 - Math.abs(i - 1) * 0.2, 0.2, 0.5, 0.2));
  const limbs = [];
  for (const s of [-1, 1]) {
    g.add(mesh(GEO.sphere, ink, s * 0.5, 0.52, -1.18, 0.26),
      mesh(GEO.sphere, emberGlow, s * 0.5, 0.56, -1.36, 0.13));
    for (let i = 0; i < 3; i++) {
      const leg = mesh(GEO.box, navy, s * 1.72, -0.3, 0.86 - i * 0.62, 1.0, 0.3, 0.3);
      leg.rotation.y = s * (i - 1) * 0.36;
      g.add(leg);
    }
    const claw = new T.Group();
    claw.position.set(s * 1.5, 0.12, -0.9);
    const jaw = mesh(GEO.cone, steel, s * 0.52, 0.02, -1.24, 0.3, 0.74, 0.3);
    const thumb = mesh(GEO.cone, crimson, s * 0.12, 0.02, -1.1, 0.2, 0.5, 0.2);
    jaw.rotation.x = thumb.rotation.x = -Math.PI / 2;
    claw.add(mesh(GEO.box, navy, s * 0.14, 0, -0.2, 0.36, 0.3, 0.6),
      mesh(GEO.sphere, crimson, s * 0.36, 0, -0.66, 0.66, 0.46, 0.8), jaw, thumb);
    limbs.push(claw);
    g.add(claw);
  }
  g.userData.limbs = limbs;
  return g;
}

export const enemyModels = { crab, jelly, mine, puffer, eel, titan, boss: kraken };

// Рыбка для стаек у дна: тело и хвост одним куском, нос смотрит в −z; красится общим материалом стаи
export function fishGeometry() {
  const body = new T.SphereGeometry(1, 10, 7).toNonIndexed();
  body.scale(0.13, 0.19, 0.36);
  const tail = new T.ConeGeometry(0.2, 0.26, 4).toNonIndexed();
  tail.scale(0.22, 1, 1);
  tail.rotateX(-Math.PI / 2); // остриём к телу
  tail.translate(0, 0, 0.44);
  const fish = new T.BufferGeometry();
  for (const name of ["position", "normal"]) {
    const a = body.getAttribute(name).array;
    const b = tail.getAttribute(name).array;
    const joined = new Float32Array(a.length + b.length);
    joined.set(a);
    joined.set(b, a.length);
    fish.setAttribute(name, new T.BufferAttribute(joined, 3));
  }
  return fish;
}

export function pearl(rare) {
  const g = new T.Group();
  const size = rare ? 0.51 : 0.24;
  g.add(mesh(GEO.sphere, rare ? goldGlow : glassLight, 0, 0, 0, size),
    mesh(GEO.ring, rare ? lilac : laserBlue, 0, 0, 0, size * 1.48));
  return g;
}
