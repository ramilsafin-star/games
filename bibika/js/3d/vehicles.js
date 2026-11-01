import * as T from "../../vendor/three/three.module.min.js";
import { RoundedBoxGeometry } from "../../vendor/three/RoundedBoxGeometry.js";
import { mergeGeometries } from "../../vendor/three/BufferGeometryUtils.js";
import { GLTFLoader } from "../../vendor/three/GLTFLoader.js";

// Metres. Local -Z is the nose. Animated assemblies remain separate from the body.
const surfaces = new Map(),
  shapes = new Map(),
  templates = new Map();
const spinAxis = new T.Vector3(1, 0, 0),
  turnAxis = new T.Vector3(0, 0, 1),
  spinQ = new T.Quaternion(),
  straightQ = new T.Quaternion(),
  spinDir = new T.Vector3();
function surface(color, metal = 0, rough = 0.6) {
  const key = [color, metal, rough].join("/");
  if (!surfaces.has(key))
    surfaces.set(
      key,
      new T.MeshStandardMaterial({
        color,
        metalness: metal,
        roughness: rough,
        side: T.DoubleSide,
      }),
    );
  return surfaces.get(key);
}
const rubber = surface("#141619", 0, 0.92),
  trim = surface("#1a1d21", 0.25, 0.48),
  alloy = surface("#c6ced6", 0.95, 0.2),
  chrome = surface("#f0f4f8", 1, 0.07),
  glass = surface("#0e1c27", 0.92, 0.06),
  head = surface("#f6fcff", 0.6, 0.05),
  tail = new T.MeshStandardMaterial({
    color: "#c4101c",
    emissive: "#a00712",
    emissiveIntensity: 0.55,
    metalness: 0.3,
    roughness: 0.2,
    side: T.DoubleSide,
  });
function mesh(parent, geo, mat, x, y, z) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function box(p, x, y, z, w, h, l, mat, r = 0) {
  const key = [w, h, l, r].join(":");
  if (!shapes.has(key))
    shapes.set(
      key,
      r
        ? new RoundedBoxGeometry(w, h, l, 1, Math.min(r, w / 2, h / 2, l / 2))
        : new T.BoxGeometry(w, h, l),
    );
  return mesh(p, shapes.get(key), mat, x, y, z);
}
function cyl(p, x, y, z, rt, rb, len, mat, axis = "y", segments = 16) {
  const key = `c:${rt}:${rb}:${len}:${segments}`;
  if (!shapes.has(key))
    shapes.set(key, new T.CylinderGeometry(rt, rb, len, segments));
  const m = mesh(p, shapes.get(key), mat, x, y, z);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  return m;
}
function patch(p, points, mat) {
  const geom = new T.BufferGeometry();
  geom.setAttribute("position", new T.Float32BufferAttribute(points.flat(), 3));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  mesh(p, geom, mat, 0, 0, 0);
}
function rod(p, a, b, r, mat) {
  const v = new T.Vector3(...a),
    end = new T.Vector3(...b),
    dir = end.clone().sub(v);
  const m = cyl(p, 0, 0, 0, r, r, dir.length(), mat);
  m.position.copy(v).lerp(end, 0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  return m;
}
// Batch rigid parts by material. Instances share the finished geometry and materials.
export function bake(group) {
  const batches = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    const source = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    source.applyMatrix4(child.matrix);
    for (const name of Object.keys(source.attributes))
      if (!["position", "normal"].includes(name)) source.deleteAttribute(name);
    if (!source.attributes.normal) source.computeVertexNormals();
    const list = batches.get(child.material) || [];
    list.push(source);
    batches.set(child.material, list);
    group.remove(child);
  }
  for (const [mat, parts] of batches) {
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const m = mesh(group, merged, mat, 0, 0, 0);
    m.castShadow = true;
    m.receiveShadow = true;
  }
}
// Шина вращением профиля: скруглённое плечо и канавки протектора
const tyres = new Map();
function tyreGeometry(r, width, rimR) {
  const key = [r, width, rimR].join(":");
  if (!tyres.has(key)) {
    const h = width / 2,
      profile = [
        [rimR, -h * 0.9],
        [r * 0.88, -h],
        [r * 0.975, -h * 0.84],
        [r, -h * 0.58],
        [r * 0.985, -h * 0.36],
        [r, -h * 0.26],
        [r, h * 0.26],
        [r * 0.985, h * 0.36],
        [r, h * 0.58],
        [r * 0.975, h * 0.84],
        [r * 0.88, h],
        [rimR, h * 0.9],
      ].map(([a, b]) => new T.Vector2(a, b)),
      geo = new T.LatheGeometry(profile, 30);
    geo.rotateZ(Math.PI / 2);
    tyres.set(key, geo);
  }
  return tyres.get(key);
}
const brakeSteel = surface("#6e767e", 0.9, 0.32),
  caliper = surface("#d4262c", 0.3, 0.4),
  steelRim = surface("#f2c230", 0.35, 0.45),
  // Свои материалы дисков: гараж перекрашивает только колёса выбранной машины
  rimLip = surface("#f1f5f8", 1, 0.08),
  rimSpoke = surface("#c8d0d8", 0.96, 0.2);
for (const m of [steelRim, rimLip, rimSpoke]) m.userData.isRim = true;
function wheel(parent, x, z, r, width, heavy = false) {
  const w = new T.Group();
  w.name = "axle";
  w.position.set(x, r, z);
  parent.add(w);
  const side = Math.sign(x) || 1,
    rimR = r * (heavy ? 0.56 : 0.68),
    face = side * (width / 2) * 0.86;
  mesh(w, tyreGeometry(r, width, rimR), rubber, 0, 0, 0);
  // Две порции на колесо: резина и всё тёмное вместе, диск отдельно, чтобы его можно было красить
  const disk = heavy ? steelRim : rimSpoke;
  cyl(w, side * width * 0.08, 0, 0, rimR, rimR, width * 0.72, rubber, "x", 22);
  cyl(w, face - side * 0.075, 0, 0, rimR * 0.72, rimR * 0.72, 0.03, disk, "x", 18);
  const lip = new T.TorusGeometry(rimR, r * 0.028, 6, 26);
  lip.rotateY(Math.PI / 2);
  mesh(w, lip, disk, face, 0, 0);
  if (heavy) {
    cyl(w, face - side * 0.01, 0, 0, rimR, rimR, 0.03, steelRim, "x", 20);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      cyl(w, face + side * 0.018, Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, r * 0.05, r * 0.05, 0.03, rubber, "x", 6);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12,
        lug = box(w, 0, Math.cos(a) * r, Math.sin(a) * r, width * 0.96, 0.07, r * 0.16, rubber);
      lug.rotation.x = a;
      lug.rotation.y = i % 2 ? 0.3 : -0.3;
    }
  } else
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      for (const shift of [-0.14, 0.14]) {
        const b = a + shift,
          spoke = box(w, face, Math.cos(b) * rimR * 0.52, Math.sin(b) * rimR * 0.52, 0.035, rimR * 0.92, rimR * 0.11, rimSpoke);
        spoke.rotation.x = b;
      }
    }
  cyl(w, face + side * 0.012, 0, 0, r * 0.16, r * 0.16, 0.05, disk, "x", 12);
  cyl(w, face + side * 0.03, 0, 0, r * 0.09, r * 0.09, 0.02, rubber, "x", 10);
  bake(w);
  // Тень колеса почти не видна под кузовом, а считать её дорого
  w.traverse((n) => {
    if (n.isMesh) n.castShadow = false;
  });
  return w;
}
function lights(p, w, front, rear, y) {
  for (const s of [-1, 1]) {
    box(p, s * w * 0.36, y, front, w * 0.22, 0.12, 0.09, head, 0.035);
    box(p, s * w * 0.36, y, rear, w * 0.22, 0.13, 0.09, tail, 0.04);
  }
  box(p, 0, y - 0.19, rear + 0.015, 0.5, 0.13, 0.04, surface("#f4eee0"), 0.02);
}
function cabin(p, w, front, back, base, top, paint) {
  const upperFront = front + (back - front) * 0.27,
    upperBack = back - (back - front) * 0.23,
    half = w / 2,
    roof = half * 0.81;
  const lf = [-half, base, front],
    rf = [half, base, front],
    lr = [-half, base, back],
    rr = [half, base, back],
    uf = [-roof, top, upperFront],
    vf = [roof, top, upperFront],
    ub = [-roof, top, upperBack],
    vb = [roof, top, upperBack];
  patch(p, [lf, rf, vf, uf], glass);
  patch(p, [rr, lr, ub, vb], glass);
  patch(p, [lf, uf, ub, lr], glass);
  patch(p, [rf, rr, vb, vf], glass);
  box(
    p,
    0,
    top + 0.025,
    (upperFront + upperBack) / 2,
    roof * 2 + 0.06,
    0.105,
    upperBack - upperFront + 0.12,
    paint,
    0.06,
  );
  for (const [a, b] of [
    [lf, uf],
    [rf, vf],
    [ub, lr],
    [vb, rr],
    [lf, rf],
    [lr, rr],
  ])
    rod(p, a, b, 0.045, paint);
  for (const side of [-1, 1]) {
    rod(
      p,
      [side * half, base, upperBack - 0.13],
      [side * roof, top, upperBack - 0.16],
      0.045,
      trim,
    );
    box(
      p,
      side * (half + 0.08),
      base + 0.09,
      front + 0.28,
      0.23,
      0.14,
      0.28,
      paint,
      0.05,
    );
  }
}
function carBody(p, w, l, axle, r, high, paint) {
  const half = l / 2,
    shape = new T.Shape();
  shape.moveTo(-half, 0.38);
  shape.quadraticCurveTo(-half - 0.035, 0.65, -half + 0.15, high * 0.82);
  shape.quadraticCurveTo(-half + 0.65, high + 0.06, -axle + 0.15, high + 0.08);
  shape.lineTo(axle, high + 0.09);
  shape.quadraticCurveTo(half - 0.1, high + 0.09, half, high - 0.05);
  shape.lineTo(half, 0.4);
  for (const z of [axle, -axle]) {
    const arch = r + 0.065;
    shape.lineTo(z + arch, 0.36);
    shape.lineTo(z + arch, r);
    shape.absarc(z, r, arch, 0, Math.PI, false);
    shape.lineTo(z - arch, 0.36);
  }
  shape.closePath();
  const geo = new T.ExtrudeGeometry(shape, {
    depth: w - 0.12,
    bevelEnabled: true,
    bevelSize: 0.055,
    bevelThickness: 0.06,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(w / 2 - 0.06, 0, 0);
  mesh(p, geo, paint, 0, 0, 0);
}
// Цвет кузова помечается, чтобы гараж мог перекрасить только свою машину
function bodyPaint(color, matte = false) {
  const m = new T.MeshPhysicalMaterial({
    color,
    metalness: matte ? 0.05 : 0.2,
    roughness: matte ? 0.72 : 0.42,
    clearcoat: matte ? 0 : 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1,
    side: T.DoubleSide,
  });
  m.userData.isPaint = true;
  // Яркий свет сцены выбеливает краску, поэтому основа темнее цвета на образце
  m.userData.shade = matte ? 0.85 : 0.72;
  m.color.multiplyScalar(m.userData.shade);
  return m;
}
function heart(p, x, y, z, size, mat) {
  const s = new T.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.72, 0, -0.5, 0.56, 0, 0.26);
  s.bezierCurveTo(0.5, 0.56, 0.72, 0, 0, -0.5);
  const geo = new T.ExtrudeGeometry(s, {
    depth: 0.05,
    bevelEnabled: false,
    curveSegments: 8,
  });
  geo.scale(size, size, 1);
  geo.rotateY(Math.PI / 2);
  geo.translate(-0.025, 0, 0);
  return mesh(p, geo, mat, x, y, z);
}
function lightbar(p, y, z) {
  for (const [i, color] of ["#1a7dff", "#ff332c"].entries()) {
    const mat = new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
    });
    const lamp = box(p, (i - 0.5) * 0.49, y, z, 0.46, 0.12, 0.17, mat, 0.04);
    lamp.name = i ? "beaconRed" : "beaconBlue";
    const hold = new T.Group();
    hold.name = "beaconAssembly";
    p.add(hold);
    hold.add(lamp);
  }
}
// Корпус по сечениям: плавный силуэт вместо набора коробок
function loft(p, rings, mat, power = 3) {
  const seg = 18,
    pos = [],
    idx = [],
    n = rings.length;
  for (const r of rings) {
    const cy = (r.t + r.b) / 2,
      ry = (r.t - r.b) / 2,
      rx = r.w / 2;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      const lift = Math.abs(s) ** (2 / power);
      pos.push(
        (r.x || 0) + Math.sign(c) * Math.abs(c) ** (2 / power) * rx,
        // Если задан пояс m, верх и низ сечения считаются от него отдельно
        r.m === undefined
          ? cy + Math.sign(s) * lift * ry
          : r.m + (s >= 0 ? lift * (r.t - r.m) : -lift * (r.m - r.b)),
        r.z,
      );
    }
  }
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i,
        b = j * seg + (i + 1) % seg,
        c = (j + 1) * seg + i,
        d = (j + 1) * seg + (i + 1) % seg;
      idx.push(a, b, c, b, d, c);
    }
  for (const [ring, flip] of [
    [0, true],
    [n - 1, false],
  ]) {
    const r = rings[ring],
      centre = pos.length / 3;
    pos.push(r.x || 0, (r.t + r.b) / 2, r.z);
    for (let i = 0; i < seg; i++) {
      const a = ring * seg + i,
        b = ring * seg + (i + 1) % seg;
      flip ? idx.push(centre, b, a) : idx.push(centre, a, b);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return mesh(p, geo, mat, 0, 0, 0);
}
// Плоская деталь в профиль: плавник, крылышко стабилизатора
function fin(p, points, x, thick, mat) {
  const s = new T.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const geo = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(thick / 2, 0, 0);
  return mesh(p, geo, mat, x, 0, 0);
}
const lamp = (color, power = 1.5) =>
  new T.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: power,
  });
function formula(p, paint) {
  const white = surface("#f4f6f8", 0.3, 0.35);
  loft(
    p,
    [
      { z: -2.45, w: 0.24, b: 0.26, t: 0.38 },
      { z: -1.6, w: 0.46, b: 0.2, t: 0.5 },
      { z: -0.7, w: 0.78, b: 0.18, t: 0.7 },
      { z: 0.1, w: 0.96, b: 0.18, t: 0.82 },
      { z: 1.0, w: 1.0, b: 0.2, t: 0.84 },
      { z: 1.8, w: 0.56, b: 0.24, t: 0.66 },
      { z: 2.2, w: 0.26, b: 0.3, t: 0.46 },
    ],
    paint,
  );
  loft(
    p,
    [
      { z: 0.18, w: 0.22, b: 0.8, t: 1.12 },
      { z: 0.8, w: 0.26, b: 0.8, t: 1.05 },
      { z: 1.5, w: 0.12, b: 0.6, t: 0.78 },
    ],
    paint,
  );
  for (const s of [-1, 1]) {
    loft(
      p,
      [
        { x: s * 0.72, z: -0.55, w: 0.3, b: 0.3, t: 0.5 },
        { x: s * 0.74, z: 0.1, w: 0.56, b: 0.24, t: 0.66 },
        { x: s * 0.72, z: 1.0, w: 0.52, b: 0.24, t: 0.6 },
        { x: s * 0.62, z: 1.55, w: 0.22, b: 0.28, t: 0.42 },
      ],
      paint,
    );
    wheel(p, s * 1.04, -1.6, 0.38, 0.42);
    wheel(p, s * 1.1, 1.35, 0.43, 0.58);
    rod(p, [s * 0.2, 0.42, -1.5], [s * 0.86, 0.38, -1.6], 0.03, trim);
    rod(p, [s * 0.2, 0.3, -1.7], [s * 0.86, 0.38, -1.6], 0.03, trim);
    rod(p, [s * 0.4, 0.45, 1.25], [s * 0.86, 0.43, 1.35], 0.03, trim);
    box(p, s * 1.12, 0.26, -2.62, 0.05, 0.24, 0.52, white, 0.02);
    box(p, s * 0.88, 0.95, 2.12, 0.05, 0.58, 0.5, paint, 0.02);
  }
  box(p, 0, 0.2, -2.62, 2.24, 0.05, 0.46, paint, 0.02);
  box(p, 0, 0.29, -2.5, 2.0, 0.04, 0.2, white, 0.015);
  box(p, 0, 1.24, 2.12, 1.82, 0.06, 0.44, paint, 0.02);
  box(p, 0, 1.07, 2.12, 1.72, 0.04, 0.3, white, 0.015);
  box(p, 0, 0.84, -0.18, 0.52, 0.12, 0.95, trim, 0.05);
  mesh(p, new T.SphereGeometry(0.2, 14, 10), white, 0, 1.0, 0.02);
  box(p, 0, 1.01, -0.16, 0.3, 0.09, 0.1, glass, 0.03);
  box(p, 0, 0.55, 2.28, 0.16, 0.1, 0.06, tail, 0.02);
}
function bikeWheel(p, z, r) {
  const w = new T.Group();
  w.name = "axle";
  w.position.set(0, r, z);
  p.add(w);
  const tyre = new T.TorusGeometry(r - 0.09, 0.09, 10, 28),
    rim = new T.TorusGeometry(r - 0.17, 0.03, 8, 28);
  tyre.rotateY(Math.PI / 2);
  rim.rotateY(Math.PI / 2);
  mesh(w, tyre, rubber, 0, 0, 0);
  mesh(w, rim, rimLip, 0, 0, 0);
  cyl(w, 0, 0, 0, 0.07, 0.07, 0.16, alloy, "x", 12);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    rod(
      w,
      [0, 0, 0],
      [0, Math.cos(a) * (r - 0.16), Math.sin(a) * (r - 0.16)],
      0.012,
      rimSpoke,
    );
  }
  bake(w);
}
function bike(p, paint) {
  const suit = surface("#f4f6f8", 0.15, 0.5),
    dark = surface("#20252c", 0.3, 0.55);
  bikeWheel(p, -1.0, 0.38);
  bikeWheel(p, 1.0, 0.4);
  for (const s of [-1, 1]) {
    rod(p, [s * 0.1, 0.38, -1.0], [s * 0.09, 1.05, -0.62], 0.03, alloy);
    rod(p, [s * 0.09, 1.2, -0.6], [s * 0.38, 1.22, -0.5], 0.022, trim);
    // Гонщик в шлеме: лица нет, только тёмное стекло
    rod(p, [s * 0.17, 1.5, -0.05], [s * 0.34, 1.24, -0.48], 0.05, suit);
    rod(p, [s * 0.14, 1.08, 0.42], [s * 0.2, 0.86, 0.02], 0.07, dark);
    rod(p, [s * 0.2, 0.86, 0.02], [s * 0.18, 0.46, 0.3], 0.055, dark);
  }
  rod(p, [0, 0.42, 1.0], [0, 0.62, 0.1], 0.05, trim);
  loft(
    p,
    [
      { z: -1.02, w: 0.2, b: 0.82, t: 1.1 },
      { z: -0.72, w: 0.42, b: 0.62, t: 1.2 },
      { z: -0.2, w: 0.5, b: 0.5, t: 1.1 },
      { z: 0.35, w: 0.42, b: 0.6, t: 1.05 },
      { z: 0.82, w: 0.22, b: 0.82, t: 1.02 },
      { z: 1.2, w: 0.08, b: 0.93, t: 1.02 },
    ],
    paint,
  );
  box(p, 0, 0.5, 0.1, 0.3, 0.36, 0.6, trim, 0.06);
  rod(p, [0.16, 0.42, 0.25], [0.18, 0.72, 1.2], 0.05, alloy);
  box(p, 0, 1.06, 0.55, 0.3, 0.09, 0.7, dark, 0.04);
  box(p, 0, 1.0, -1.04, 0.18, 0.14, 0.06, head, 0.03);
  box(p, 0, 1.02, 1.22, 0.12, 0.08, 0.05, tail, 0.02);
  rod(p, [0, 1.12, 0.42], [0, 1.55, -0.12], 0.17, suit);
  mesh(p, new T.SphereGeometry(0.2, 14, 10), paint, 0, 1.76, -0.22);
  box(p, 0, 1.77, -0.39, 0.3, 0.11, 0.08, glass, 0.03);
}
function buggy(p, paint) {
  const metal = surface("#39424e", 0.6, 0.35),
    seat = surface("#20252c", 0.1, 0.7);
  box(p, 0, 0.5, 0, 1.25, 0.22, 3.0, trim, 0.06);
  loft(
    p,
    [
      { z: -1.95, w: 0.7, b: 0.4, t: 0.6 },
      { z: -1.2, w: 1.2, b: 0.38, t: 0.85 },
      { z: -0.5, w: 1.32, b: 0.38, t: 0.95 },
    ],
    paint,
  );
  for (const s of [-1, 1]) {
    wheel(p, s * 1.0, -1.22, 0.52, 0.38, true);
    wheel(p, s * 1.08, 1.12, 0.68, 0.54, true);
    rod(p, [s * 0.6, 0.62, -1.15], [s * 0.86, 0.52, -1.22], 0.04, alloy);
    rod(p, [s * 0.6, 0.65, 1.05], [s * 0.85, 0.68, 1.12], 0.04, alloy);
    rod(p, [s * 0.62, 0.6, -0.5], [s * 0.52, 1.72, -0.02], 0.05, paint);
    rod(p, [s * 0.62, 0.6, 0.85], [s * 0.52, 1.72, 0.68], 0.05, paint);
    rod(p, [s * 0.52, 1.72, -0.02], [s * 0.52, 1.72, 0.68], 0.05, paint);
    rod(p, [s * 0.62, 0.6, -0.5], [s * 0.62, 0.6, 0.85], 0.05, trim);
    box(p, s * 0.28, 0.9, 0.35, 0.44, 0.7, 0.2, seat, 0.05);
    cyl(p, s * 0.26, 1.02, 1.5, 0.07, 0.09, 0.3, alloy, "z", 10);
    box(p, s * 0.42, 0.72, -1.9, 0.2, 0.09, 0.05, head, 0.02);
    box(p, s * 0.35, 0.8, 1.45, 0.18, 0.08, 0.05, tail, 0.02);
  }
  rod(p, [-0.52, 1.72, -0.02], [0.52, 1.72, -0.02], 0.05, paint);
  rod(p, [-0.52, 1.72, 0.68], [0.52, 1.72, 0.68], 0.05, paint);
  box(p, 0, 0.85, 1.08, 0.8, 0.5, 0.75, metal, 0.06);
  rod(p, [-0.5, 1.72, 0.68], [-0.5, 2.7, 0.8], 0.012, trim);
  patch(
    p,
    [
      [-0.5, 2.7, 0.8],
      [-0.5, 2.42, 0.78],
      [-0.5, 2.5, 1.25],
      [-0.5, 2.6, 1.25],
    ],
    surface("#ff4f7e"),
  );
}
function truckCab(p, paint, z, wide, tall) {
  const o = {
      L: 1.85, W: wide, r: 0.5, cz: z, wheels: [0], bottom: 0.62, power: 8, nose: 0.02, tail: 0, round: 0.12, flare: 0,
      top: [[-0.92, 0.9], [-0.9, 1.3], [-0.86, tall - 0.2], [-0.45, tall + 0.72], [0.92, tall + 0.76]],
      belt: [[-0.92, 1.4], [0.92, 1.46]],
    },
    body = shell(p, o, paint);
  patch(p, [[-wide * 0.44, 1.58, z - 0.93], [wide * 0.44, 1.58, z - 0.93], [wide * 0.4, tall + 0.58, z - 0.54], [-wide * 0.4, tall + 0.58, z - 0.54]], glass);
  box(p, 0, 1.12, z - 0.9, wide * 0.7, 0.42, 0.06, trim, 0.02);
  for (let i = 0; i < 4; i++) box(p, 0, 0.96 + i * 0.1, z - 0.94, wide * 0.66, 0.03, 0.03, alloy);
  box(p, 0, 0.74, z - 0.9, wide * 0.96, 0.24, 0.16, surface("#3a3f46", 0.5, 0.45), 0.04);
  for (const s of [-1, 1]) {
    box(p, s * (body.width(0) + 0.004), tall + 0.08, z - 0.05, 0.03, 0.7, 0.92, glass, 0.03);
    box(p, s * (wide * 0.38), 0.92, z - 0.92, wide * 0.18, 0.11, 0.06, head, 0.02);
    rod(p, [s * (wide / 2), tall + 0.2, z - 0.72], [s * (wide / 2 + 0.2), tall + 0.28, z - 0.78], 0.018, trim);
    box(p, s * (wide / 2 + 0.22), tall + 0.2, z - 0.78, 0.12, 0.36, 0.09, trim, 0.02);
  }
}
function mixer(p, paint) {
  const white = surface("#f4f6f8", 0.35, 0.35);
  box(p, 0, 0.62, 0.2, 2.0, 0.3, 6.4, trim, 0.05);
  truckCab(p, paint, -2.35, 2.2, 1.95);
  for (const s of [-1, 1]) {
    wheel(p, s * 1.08, -2.35, 0.5, 0.36);
    wheel(p, s * 1.08, 1.15, 0.5, 0.36);
    wheel(p, s * 1.08, 2.3, 0.5, 0.36);
  }
  lights(p, 2.2, -3.25, 3.42, 0.95);
  cyl(p, 0, 1.3, -1.05, 0.24, 0.3, 0.5, trim, "y", 10);
  cyl(p, 0, 1.3, 2.75, 0.24, 0.3, 0.5, trim, "y", 10);
  const drum = new T.Group();
  drum.name = "drum";
  drum.position.set(0, 2.2, 0.85);
  p.add(drum);
  cyl(drum, 0, 0, 0, 1.03, 1.03, 1.2, white, "z", 20);
  cyl(drum, 0, 0, -1.1, 1.03, 1.03, 1.0, paint, "z", 20);
  cyl(drum, 0, 0, 1.1, 1.03, 1.03, 1.0, paint, "z", 20);
  cyl(drum, 0, 0, -1.95, 1.03, 0.45, 0.7, white, "z", 20);
  cyl(drum, 0, 0, 1.95, 0.45, 1.03, 0.7, white, "z", 20);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3,
      rib = box(drum, Math.cos(a) * 1.03, Math.sin(a) * 1.03, 0, 0.14, 0.14, 3.1, trim, 0.03);
    rib.rotation.z = a;
  }
  bake(drum);
}
function dump(p, paint) {
  const metal = surface("#7f8b96", 0.6, 0.4),
    gold = surface("#ffc23b", 0.55, 0.22);
  box(p, 0, 0.72, 0.1, 2.0, 0.3, 6.2, trim, 0.05);
  truckCab(p, paint, -2.3, 2.3, 1.95);
  for (const s of [-1, 1]) {
    wheel(p, s * 1.12, -2.3, 0.56, 0.42);
    wheel(p, s * 1.12, 1.05, 0.56, 0.42);
    wheel(p, s * 1.12, 2.3, 0.56, 0.42);
  }
  lights(p, 2.3, -3.2, 3.2, 1.0);
  // Кузов поворачивается вокруг заднего края
  const bed = new T.Group();
  bed.name = "bed";
  bed.position.set(0, 1.0, 3.05);
  p.add(bed);
  box(bed, 0, 0.1, -2.05, 2.4, 0.2, 4.1, metal, 0.05);
  for (const s of [-1, 1]) box(bed, s * 1.2, 0.8, -2.05, 0.12, 1.3, 4.1, paint, 0.05);
  box(bed, 0, 0.9, -4.08, 2.4, 1.5, 0.14, paint, 0.05);
  box(bed, 0, 0.62, -0.02, 2.3, 0.95, 0.1, metal, 0.03);
  for (const [x, y, z] of [
    [-0.55, 1.1, -1.2],
    [0.45, 1.2, -1.7],
    [-0.2, 1.3, -2.6],
    [0.6, 1.05, -3.1],
    [-0.65, 1.05, -3.2],
    [0.1, 1.1, -0.8],
  ])
    mesh(bed, new T.IcosahedronGeometry(0.42, 0), gold, x, y, z);
  bake(bed);
}
function digger(p, paint) {
  const track = surface("#2d2f33", 0.3, 0.85),
    steel = surface("#5a6470", 0.6, 0.4);
  for (const s of [-1, 1]) {
    box(p, s * 1.12, 0.5, 0, 0.62, 0.95, 3.7, track, 0.3);
    for (let i = 0; i < 5; i++)
      cyl(p, s * 1.45, 0.48, (i - 2) * 0.72, 0.28, 0.28, 0.06, rimSpoke, "x", 14);
  }
  box(p, 0, 1.1, 0, 1.7, 0.28, 2.6, trim, 0.05);
  box(p, 0, 1.72, 0.35, 2.3, 1.0, 2.7, paint, 0.14);
  box(p, 0, 1.75, 1.72, 2.3, 0.85, 0.3, steel, 0.08);
  box(p, -0.58, 2.62, -0.4, 1.05, 1.3, 1.25, paint, 0.1);
  box(p, -0.58, 2.8, -1.04, 0.86, 0.75, 0.04, glass, 0.04);
  box(p, -1.12, 2.8, -0.4, 0.04, 0.75, 0.95, glass, 0.04);
  box(p, -0.58, 3.3, -0.4, 1.2, 0.08, 1.4, trim, 0.03);
  cyl(p, 0.75, 2.5, 0.9, 0.07, 0.09, 0.8, trim, "y", 10);
  box(p, 0, 1.72, 2.02, 1.6, 0.14, 0.05, tail, 0.02);
  const arm = new T.Group();
  arm.name = "arm";
  arm.position.set(0.45, 2.0, -0.7);
  p.add(arm);
  rod(arm, [0, 0, 0], [0, 1.45, -1.75], 0.15, paint);
  rod(arm, [0, 1.45, -1.75], [0, 0.1, -3.2], 0.11, paint);
  rod(arm, [0.18, 0.55, -0.5], [0.18, 1.3, -1.6], 0.04, alloy);
  box(arm, 0, -0.18, -3.3, 1.0, 0.6, 0.6, steel, 0.08);
  for (const x of [-0.36, -0.12, 0.12, 0.36])
    box(arm, x, -0.56, -3.45, 0.13, 0.2, 0.13, alloy);
  bake(arm);
}
// Двухвальцовый каток: стальной барабан виден и спереди, и из камеры за машиной
function rollDrum(p, paint, name, z) {
  const dark = surface("#2a2e34", 0.35, 0.6),
    roll = new T.Group();
  roll.name = name;
  roll.position.set(0, 0.92, z);
  p.add(roll);
  cyl(roll, 0, 0, 0, 0.92, 0.92, 2.34, surface("#b4bcc6", 0.85, 0.28), "x", 30);
  for (const s of [-1, 1]) {
    cyl(roll, s * 1.19, 0, 0, 0.96, 0.96, 0.06, dark, "x", 30);
    cyl(roll, s * 1.23, 0, 0, 0.34, 0.34, 0.06, paint, "x", 18);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      cyl(roll, s * 1.26, Math.sin(a) * 0.22, Math.cos(a) * 0.22, 0.035, 0.035, 0.04, alloy, "x", 8);
    }
  }
  // Поперечные полосы видно издалека: понятно, что барабан катится
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3,
      band = box(roll, 0, Math.sin(a) * 0.925, Math.cos(a) * 0.925, 2.3, 0.03, 0.12, dark);
    band.rotation.x = Math.PI / 2 - a;
  }
  bake(roll);
  // Вилка держит барабан с обеих сторон, сверху крыло
  for (const s of [-1, 1]) {
    box(p, s * 1.36, 1.1, z + (z < 0 ? 0.38 : -0.38), 0.14, 0.62, 1.62, paint, 0.05);
    cyl(p, s * 1.36, 0.92, z, 0.22, 0.22, 0.2, dark, "x", 14);
  }
}
function roller(p, paint) {
  const dark = surface("#2a2e34", 0.35, 0.6),
    amber = lamp("#ff9a1f", 1.1);
  rollDrum(p, paint, "roll", -1.95);
  rollDrum(p, paint, "rollRear", 1.95);
  // Переднее крыло с фарами и полосатым краем
  box(p, 0, 2.02, -1.72, 2.86, 0.16, 1.5, paint, 0.06);
  box(p, 0, 1.88, -2.46, 2.86, 0.26, 0.1, paint, 0.03);
  for (let i = -3; i <= 3; i++)
    box(p, i * 0.38, 1.88, -2.52, 0.17, 0.2, 0.03, dark).rotation.z = 0.5;
  for (const s of [-1, 1]) box(p, s * 1.02, 2.2, -2.34, 0.36, 0.2, 0.1, head, 0.03);
  // Рама между вальцами и капот над задним барабаном
  box(p, 0, 1.3, 0, 1.5, 0.9, 1.4, dark, 0.06);
  box(p, 0, 2.2, 1.55, 2.5, 0.72, 1.62, paint, 0.16);
  box(p, 0, 2.6, 1.6, 1.6, 0.12, 1.1, surface("#e09a0a", 0.1, 0.5), 0.05);
  box(p, 0, 2.2, 2.37, 2.16, 0.52, 0.04, dark, 0.02);
  for (let i = 0; i < 4; i++) box(p, 0, 2.02 + i * 0.12, 2.4, 2.04, 0.04, 0.03, alloy);
  for (const s of [-1, 1]) box(p, s * 1.2, 1.98, 2.36, 0.2, 0.14, 0.05, tail, 0.02);
  cyl(p, 0.82, 3.1, 1.2, 0.07, 0.09, 0.8, trim, "y", 10);
  cyl(p, 0.82, 3.52, 1.2, 0.1, 0.07, 0.08, alloy, "y", 10);
  // Кабина оператора с большими стёклами
  box(p, 0, 1.86, 0.02, 2.4, 0.14, 1.4, dark, 0.04);
  box(p, 0, 2.3, 0.3, 0.7, 0.7, 0.14, dark, 0.05);
  for (const [x, z] of [[-0.82, -0.56], [0.82, -0.56], [-0.82, 0.62], [0.82, 0.62]])
    rod(p, [x, 1.92, z], [x * 0.92, 3.34, z], 0.045, trim);
  box(p, 0, 2.66, -0.56, 1.54, 1.3, 0.03, glass, 0.01);
  box(p, 0, 2.66, 0.62, 1.54, 1.3, 0.03, glass, 0.01);
  for (const s of [-1, 1]) box(p, s * 0.8, 2.66, 0.03, 0.03, 1.3, 1.14, glass, 0.01);
  box(p, 0, 3.4, 0.03, 1.96, 0.13, 1.62, paint, 0.05);
  cyl(p, 0, 3.54, 0.03, 0.1, 0.13, 0.16, amber, "y", 12);
}
function garbage(p, paint) {
  const white = surface("#f4f6f8", 0.2, 0.45);
  box(p, 0, 0.66, 0.2, 2.0, 0.3, 6.3, trim, 0.05);
  truckCab(p, paint, -2.45, 2.2, 1.85);
  box(p, 0, 1.95, 0.75, 2.3, 2.55, 4.5, paint, 0.32);
  box(p, 0, 1.35, 0.75, 2.34, 0.34, 4.3, white, 0.03);
  for (const z of [-0.6, 0.75, 2.1]) box(p, 0, 3.26, z, 1.7, 0.1, 0.34, white, 0.03);
  box(p, 0, 1.45, 3.22, 2.14, 1.75, 0.6, trim, 0.1);
  box(p, 0, 1.2, 3.54, 1.6, 0.7, 0.06, surface("#3f4852", 0.3, 0.6), 0.02);
  for (const s of [-1, 1]) {
    wheel(p, s * 1.08, -2.45, 0.5, 0.36);
    wheel(p, s * 1.08, 1.4, 0.5, 0.36);
    wheel(p, s * 1.08, 2.45, 0.5, 0.36);
    box(p, s * 0.9, 2.3, 3.52, 0.2, 0.14, 0.06, tail, 0.02);
    box(p, s * 0.72, 1.05, -3.36, 0.42, 0.14, 0.06, head, 0.03);
  }
}
function train(p, paint) {
  const black = surface("#22262c", 0.5, 0.35),
    gold = surface("#ffcf4a", 0.7, 0.25);
  box(p, 0, 0.62, -0.1, 1.9, 0.26, 5.1, black, 0.05);
  cyl(p, 0, 1.5, -0.75, 0.74, 0.74, 3.1, paint, "z", 22);
  for (const z of [-2.1, -1.2, -0.3, 0.6])
    cyl(p, 0, 1.5, z, 0.77, 0.77, 0.1, gold, "z", 22);
  cyl(p, 0, 1.5, -2.33, 0.74, 0.74, 0.08, black, "z", 22);
  cyl(p, 0, 1.62, -2.41, 0.2, 0.2, 0.12, head, "z", 14);
  cyl(p, 0, 2.55, -1.75, 0.33, 0.18, 0.9, black, "y", 14);
  mesh(p, new T.SphereGeometry(0.34, 14, 10), gold, 0, 2.28, -0.75);
  box(p, 0, 2.1, 1.55, 1.95, 2.25, 1.95, paint, 0.12);
  box(p, 0, 3.3, 1.6, 2.3, 0.15, 2.4, black, 0.06);
  box(p, 0, 2.5, 2.54, 1.3, 0.8, 0.04, glass, 0.04);
  for (const s of [-1, 1]) {
    box(p, s * 0.98, 2.5, 1.5, 0.04, 0.8, 1.05, glass, 0.04);
    for (const z of [-1.7, -0.35, 1.0]) wheel(p, s * 0.98, z, 0.52, 0.22);
    rod(p, [s * 1.13, 0.52, -1.7], [s * 1.13, 0.52, 1.0], 0.04, gold);
    box(p, s * 0.7, 0.9, 2.56, 0.22, 0.14, 0.05, tail, 0.03);
  }
  loft(
    p,
    [
      { z: -3.05, w: 0.34, b: 0.1, t: 0.18 },
      { z: -2.45, w: 1.8, b: 0.1, t: 0.86 },
    ],
    gold,
    2,
  );
}
const ufoLight = lamp("#ffe36b", 2.2),
  ufoBeam = new T.MeshBasicMaterial({
    color: "#b6f7ff",
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: T.DoubleSide,
  });
function ufo(p, paint) {
  const hull = new T.Group();
  hull.name = "saucer";
  hull.position.y = 0.95;
  p.add(hull);
  const profile = [
    [0, -0.34],
    [0.9, -0.3],
    [1.7, -0.14],
    [2.05, 0],
    [1.72, 0.16],
    [1.0, 0.3],
    [0, 0.36],
  ].map(([x, y]) => new T.Vector2(x, y));
  mesh(hull, new T.LatheGeometry(profile, 32), paint, 0, 0, 0);
  mesh(
    hull,
    new T.SphereGeometry(0.86, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    surface("#9fe8ff", 0.5, 0.08),
    0,
    0.24,
    0,
  );
  cyl(hull, 0, -0.34, 0, 0.62, 0.62, 0.06, surface("#2a2f3c", 0.5, 0.3), "y", 20);
  bake(hull);
  const ring = new T.Group();
  ring.name = "lights";
  hull.add(ring);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    mesh(
      ring,
      new T.SphereGeometry(0.1, 8, 6),
      ufoLight,
      Math.cos(a) * 1.8,
      0.03,
      Math.sin(a) * 1.8,
    );
  }
  bake(ring);
  const beam = new T.Mesh(
    new T.ConeGeometry(1.4, 1.0, 24, 1, true),
    ufoBeam,
  );
  beam.position.y = 0.5;
  // В группе: отдельные меши корпуса объединяются, а луч должен включаться сам
  const holder = new T.Group();
  holder.name = "beam";
  holder.visible = false;
  holder.add(beam);
  p.add(holder);
}
function shark(p, paint) {
  const belly = surface("#f2f6f8", 0.3, 0.4),
    darkFin = surface("#3a6f97", 0.5, 0.3);
  loft(
    p,
    [
      { z: -2.6, w: 0.35, b: 0.42, t: 0.62 },
      { z: -2.0, w: 1.25, b: 0.34, t: 0.8 },
      { z: -1.0, w: 1.85, b: 0.34, t: 0.98 },
      { z: 0.2, w: 1.95, b: 0.34, t: 1.12 },
      { z: 1.3, w: 1.75, b: 0.36, t: 1.0 },
      { z: 2.25, w: 0.95, b: 0.46, t: 0.88 },
      { z: 2.75, w: 0.35, b: 0.58, t: 0.8 },
    ],
    paint,
    2.6,
  );
  loft(
    p,
    [
      { z: -2.55, w: 0.34, b: 0.38, t: 0.5 },
      { z: -2.0, w: 1.27, b: 0.3, t: 0.55 },
      { z: -1.0, w: 1.88, b: 0.3, t: 0.58 },
      { z: 0.2, w: 1.98, b: 0.3, t: 0.6 },
      { z: 1.3, w: 1.78, b: 0.32, t: 0.58 },
      { z: 2.25, w: 0.97, b: 0.42, t: 0.6 },
    ],
    belly,
    2.6,
  );
  loft(
    p,
    [
      { z: -1.05, w: 0.9, b: 0.92, t: 0.96 },
      { z: -0.35, w: 1.35, b: 0.95, t: 1.46 },
      { z: 0.55, w: 1.3, b: 0.95, t: 1.42 },
      { z: 1.2, w: 0.8, b: 0.9, t: 1.04 },
    ],
    glass,
    2.6,
  );
  fin(p, [[0.2, 1.38], [1.2, 1.3], [1.15, 2.3]], 0, 0.12, darkFin);
  fin(p, [[2.55, 0.7], [3.5, 1.75], [3.15, 0.85], [3.5, 0.2]], 0, 0.1, darkFin);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++)
      box(p, s * 0.93, 0.76, -1.2 + i * 0.22, 0.03, 0.32, 0.05, trim);
    wheel(p, s * 0.9, -1.4, 0.36, 0.26);
    wheel(p, s * 0.92, 1.35, 0.38, 0.28);
    const side = new T.Shape();
    side.moveTo(0, 0);
    side.lineTo(0.8, 0.12);
    side.lineTo(0.55, 0.6);
    side.closePath();
    const geo = new T.ExtrudeGeometry(side, { depth: 0.06, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    const m = mesh(p, geo, darkFin, s * 0.92, 0.68, -0.45);
    if (s < 0) m.rotation.y = Math.PI;
    box(p, s * 0.28, 0.72, 2.6, 0.16, 0.08, 0.05, tail, 0.02);
    box(p, s * 0.3, 0.46, -2.3, 0.28, 0.05, 0.05, head, 0.02);
  }
}
const wingGlass = new T.MeshStandardMaterial({
  color: "#ffe9d9",
  transparent: true,
  opacity: 0.55,
  metalness: 0.2,
  roughness: 0.15,
  side: T.DoubleSide,
  depthWrite: false,
});
function bug(p, paint) {
  const black = surface("#16181d", 0.3, 0.35);
  loft(
    p,
    [
      { z: -1.3, w: 1.2, b: 0.42, t: 0.92 },
      { z: -0.8, w: 1.75, b: 0.34, t: 1.3 },
      { z: 0, w: 1.95, b: 0.32, t: 1.52 },
      { z: 0.8, w: 1.75, b: 0.34, t: 1.3 },
      { z: 1.35, w: 1.0, b: 0.46, t: 0.92 },
    ],
    paint,
    2.2,
  );
  loft(
    p,
    [
      { z: -1.72, w: 0.9, b: 0.42, t: 0.74 },
      { z: -1.45, w: 1.3, b: 0.36, t: 0.96 },
      { z: -1.05, w: 1.5, b: 0.36, t: 1.1 },
    ],
    black,
    2.2,
  );
  // Чёрная полоса по спине и точки. Глаз нет: только узкие фары на бампере
  loft(
    p,
    [
      { z: -1.05, w: 0.08, b: 1.05, t: 1.13 },
      { z: 0, w: 0.08, b: 1.47, t: 1.54 },
      { z: 1.3, w: 0.08, b: 0.88, t: 0.96 },
    ],
    black,
    2,
  );
  for (const [x, y, z, r] of [
    [0.48, 1.28, -0.45, 0.22],
    [-0.48, 1.28, -0.45, 0.22],
    [0.55, 1.3, 0.4, 0.25],
    [-0.55, 1.3, 0.4, 0.25],
    [0.82, 0.98, -0.05, 0.19],
    [-0.82, 0.98, -0.05, 0.19],
    [0.42, 1.0, 0.98, 0.18],
    [-0.42, 1.0, 0.98, 0.18],
  ])
    mesh(p, new T.SphereGeometry(r, 12, 8), black, x, y, z);
  for (const s of [-1, 1]) {
    rod(p, [s * 0.22, 1.02, -1.25], [s * 0.42, 1.5, -1.62], 0.018, black);
    mesh(p, new T.SphereGeometry(0.06, 8, 6), black, s * 0.42, 1.52, -1.63);
    wheel(p, s * 0.86, -0.95, 0.32, 0.24);
    wheel(p, s * 0.86, 0.95, 0.32, 0.24);
    box(p, s * 0.28, 0.5, -1.72, 0.26, 0.05, 0.05, head, 0.02);
    box(p, s * 0.32, 0.68, 1.36, 0.16, 0.08, 0.05, tail, 0.02);
    const wing = new T.Group();
    wing.name = s < 0 ? "wingL" : "wingR";
    wing.position.set(s * 0.25, 1.5, 0.1);
    wing.visible = false;
    const leaf = new T.Mesh(new T.SphereGeometry(1, 14, 8), wingGlass);
    leaf.scale.set(1.15, 0.03, 0.62);
    leaf.position.x = s * 1.1;
    wing.add(leaf);
    p.add(wing);
  }
}
function harvester(p, paint) {
  const yellow = surface("#ffd23f", 0.25, 0.45);
  box(p, 0, 1.8, 0.6, 2.4, 2.1, 3.7, paint, 0.22);
  box(p, 0, 3.15, -0.8, 1.75, 1.3, 1.5, glass, 0.08);
  box(p, 0, 3.86, -0.75, 1.95, 0.12, 1.75, paint, 0.05);
  box(p, 0, 2.5, 2.48, 2.0, 0.8, 0.08, surface("#22262c", 0.3, 0.6), 0.03);
  cyl(p, 0.82, 3.4, 1.4, 0.08, 0.1, 1.0, trim, "y", 10);
  for (const s of [-1, 1]) {
    wheel(p, s * 1.28, -0.75, 0.95, 0.64, true);
    wheel(p, s * 1.12, 2.0, 0.56, 0.36, true);
    box(p, s * 0.9, 1.15, 2.47, 0.3, 0.12, 0.05, tail, 0.02);
    box(p, s * 1.98, 0.86, -2.6, 0.12, 0.76, 1.3, yellow, 0.04);
    rod(p, [s * 1.0, 0.95, -0.9], [s * 1.5, 0.85, -2.3], 0.05, trim);
    box(p, s * 0.5, 2.3, -1.3, 0.3, 0.14, 0.05, head, 0.03);
  }
  box(p, 0, 0.72, -2.4, 3.9, 0.42, 0.85, yellow, 0.08);
  const reel = new T.Group();
  reel.name = "reel";
  reel.position.set(0, 1.28, -2.78);
  p.add(reel);
  cyl(reel, 0, 0, 0, 0.06, 0.06, 3.9, trim, "x", 10);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3,
      paddle = box(
        reel,
        0,
        Math.sin(a) * 0.5,
        Math.cos(a) * 0.5,
        3.7,
        0.05,
        0.2,
        paint,
      );
    paddle.rotation.x = -a;
    for (const x of [-1.2, 1.2])
      rod(
        reel,
        [x, 0, 0],
        [x, Math.sin(a) * 0.5, Math.cos(a) * 0.5],
        0.02,
        trim,
      );
  }
  bake(reel);
}
const SPECIAL = {
  formula,
  bike,
  buggy,
  mixer,
  dump,
  digger,
  roller,
  garbage,
  train,
  ufo,
  shark,
  bug,
  harvester,
};
// Плавная кривая по опорным точкам [z, y]
function curveOf(points) {
  return (z) => {
    if (z <= points[0][0]) return points[0][1];
    for (let i = 0; i < points.length - 1; i++) {
      const [z0, y0] = points[i],
        [z1, y1] = points[i + 1];
      if (z <= z1) {
        const t = (z - z0) / (z1 - z0),
          prev = points[i - 1] || points[i],
          next = points[i + 2] || points[i + 1],
          m0 = (y1 - prev[1]) / (z1 - prev[0] || 1),
          m1 = (next[1] - y0) / (next[0] - z0 || 1),
          dz = z1 - z0,
          t2 = t * t,
          t3 = t2 * t;
        return (
          (2 * t3 - 3 * t2 + 1) * y0 +
          (t3 - 2 * t2 + t) * dz * m0 +
          (-2 * t3 + 3 * t2) * y1 +
          (t3 - t2) * dz * m1
        );
      }
    }
    return points[points.length - 1][1];
  };
}
// Кузов с настоящими арками: низ сечения поднимается над каждым колесом
function shell(p, o, paint) {
  const half = o.L / 2,
    cz = o.cz || 0,
    top = curveOf(o.top),
    belt = curveOf(o.belt),
    count = Math.ceil(o.L / (o.step || 0.07)),
    bottom = o.bottom ?? 0.3,
    round = o.round ?? 0.3,
    rings = [],
    arch = o.r + 0.075,
    width = (z) => {
      const t = z / half;
      let hw =
        (o.W / 2) *
        (1 -
          (o.nose ?? 0.16) * Math.max(0, -t) ** 3 -
          (o.tail ?? 0.1) * Math.max(0, t) ** 3);
      for (const wz of o.wheels)
        hw *= 1 + (o.flare ?? 0.02) * Math.exp(-(((z - wz) / (o.r * 1.5)) ** 2));
      return hw;
    };
  for (let i = 0; i <= count; i++) {
    const z = -half + (o.L * i) / count,
      end = Math.min(1, (half - Math.abs(z)) / round),
      close = Math.sqrt(Math.max(0, 1 - (1 - end) ** 2));
    let b = bottom;
    for (const wz of o.wheels) {
      const dz = z - wz;
      if (Math.abs(dz) < arch) b = Math.max(b, o.r + Math.sqrt(arch * arch - dz * dz));
    }
    const m = belt(z),
      t = top(z);
    rings.push({
      z: z + cz,
      w: width(z) * 2 * (0.62 + 0.38 * close),
      b: b + (1 - close) * (m - b) * 0.55,
      t: t - (1 - close) * (t - m) * 0.55,
      m,
    });
  }
  loft(p, rings, paint, o.power ?? 4.2);
  // Тёмные ниши колёс и днище, чтобы не просвечивал фон
  box(p, 0, (bottom + o.r * 2) / 2 + 0.02, cz, o.W * 0.72, o.r * 2 - bottom + 0.06, o.L * 0.86, trim);
  return { width, top, belt };
}
// Стекло, крыша и стойки
function glasshouse(p, g, paint, cz = 0) {
  const rings = [],
    steps = 18,
    line = curveOf([
      [g.z0, g.base - 0.02],
      [g.z0 + (g.z1 - g.z0) * 0.5, g.base + (g.top - g.base) * 0.62],
      [g.z1, g.top],
      [g.z2, g.top],
      [g.z2 + (g.z3 - g.z2) * 0.5, g.base + (g.top - g.base) * 0.6],
      [g.z3, g.base - 0.02],
    ]);
  for (let i = 0; i <= steps; i++) {
    const z = g.z0 + ((g.z3 - g.z0) * i) / steps,
      y = line(z),
      k = (y - g.base) / (g.top - g.base);
    rings.push({
      z: z + cz,
      w: 2 * (g.w0 + (g.w1 - g.w0) * Math.max(0, k)),
      b: g.base - 0.1,
      t: y,
    });
  }
  loft(p, rings, glass, g.power ?? 3.6);
  const roof = [];
  for (let i = 0; i <= 8; i++) {
    const z = g.z1 - 0.06 + ((g.z2 - g.z1 + 0.12) * i) / 8,
      end = Math.sin((i / 8) * Math.PI) ** 0.3;
    roof.push({
      z: z + cz,
      w: (2 * g.w1 + 0.05) * (0.86 + 0.14 * end),
      b: g.top - 0.05,
      t: g.top + 0.012 + 0.03 * end,
    });
  }
  loft(p, roof, g.roof || paint, 3.4);
  const base = g.w0 * 0.97,
    upper = g.w1 * 1.0;
  for (const s of [-1, 1]) {
    rod(p, [s * base, g.base, g.z0 + (g.z1 - g.z0) * 0.14 + cz], [s * upper, g.top, g.z1 + cz], 0.028, paint);
    rod(p, [s * base, g.base, g.z3 - (g.z3 - g.z2) * 0.12 + cz], [s * upper, g.top, g.z2 + cz], 0.05, paint);
    rod(p, [s * base, g.base + 0.02, (g.z0 + g.z1) / 2 + cz], [s * base, g.base + 0.02, (g.z2 + g.z3) / 2 + cz], 0.012, chrome);
    const mid = (g.z1 + g.z2) / 2 + cz + (g.bShift || 0);
    rod(p, [s * base * 1.0, g.base, mid], [s * upper, g.top, mid - 0.02], 0.024, trim);
  }
}
// Фары, решётка, ручки, зеркала: мелочи, которые и делают машину настоящей
function carDetails(p, o, body, paint, style = {}) {
  const half = o.L / 2,
    cz = o.cz || 0,
    nose = -half + cz,
    rear = half + cz,
    frontY = body.belt(-half + 0.3) - 0.04,
    rearY = body.belt(half - 0.3) + 0.03;
  // Узкие светодиодные фары
  for (const s of [-1, 1]) {
    const hw = body.width(-half + 0.34);
    box(p, s * hw * 0.62, frontY, nose + 0.2, hw * 0.56, 0.085, 0.3, head, 0.03);
    box(p, s * hw * 0.62, frontY - 0.06, nose + 0.19, hw * 0.5, 0.018, 0.3, lamp("#dff6ff", 1.2));
    cyl(p, s * hw * 0.74, frontY - 0.34, nose + 0.1, 0.05, 0.05, 0.2, head, "z", 10);
  }
  // У электромобиля закрытый нос и узкая нижняя щель.
  if (!style.electric) {
    box(p, 0, frontY - 0.1, nose + 0.07, body.width(-half + 0.1) * 0.82, 0.17, 0.16, trim, 0.03);
    for (let i = -3; i <= 3; i++)
      box(p, (i * body.width(-half + 0.1)) / 8, frontY - 0.1, nose, 0.02, 0.13, 0.03, style.grille || alloy);
  }
  box(p, 0, frontY - 0.32, nose + 0.06, body.width(-half + 0.1) * 1.05, style.electric ? 0.07 : 0.16, 0.16, trim, 0.03);
  box(p, 0, frontY - 0.22, nose + 0.0, 0.42, 0.1, 0.03, surface("#eef0ea", 0.2, 0.5), 0.01);
  // Сквозная светодиодная полоса сзади
  const rw = body.width(half - 0.3);
  box(p, 0, rearY, rear - 0.14, rw * 1.82, 0.075, 0.24, tail, 0.02);
  box(p, 0, rearY - 0.2, rear - 0.1, 0.46, 0.13, 0.2, surface("#eef0ea", 0.2, 0.5), 0.01);
  box(p, 0, rearY - 0.42, rear - 0.1, rw * 1.65, 0.2, 0.2, trim, 0.05);
  if (!style.electric) {
    for (const s of [-1, 1])
      cyl(p, s * rw * 0.62, 0.42, rear - 0.02, 0.055, 0.06, 0.2, chrome, "z", 12);
  }
  const beltAt = (z) => body.belt(z),
    sides = o.doors || [-0.55, 0.45, 1.25];
  for (const s of [-1, 1]) {
    // Швы дверей и ручки
    for (const z of sides) {
      const x = s * (body.width(z) + 0.001);
      box(p, x, (0.5 + beltAt(z)) / 2 + 0.04, z + cz, 0.012, beltAt(z) - 0.42, 0.016, trim);
    }
    for (const z of o.handles || [0.2, 1.0]) {
      const x = s * (body.width(z) + 0.012);
      box(p, x, beltAt(z) - 0.06, z + cz, 0.03, 0.035, 0.17, style.handle || paint, 0.012);
    }
    // Порог и зеркало
    const midZ = (o.wheels[0] + o.wheels[o.wheels.length - 1]) / 2 + cz;
    box(p, s * (body.width(0) - 0.03), (o.bottom ?? 0.3) + 0.04, midZ, 0.09, 0.09, (o.wheels[o.wheels.length - 1] - o.wheels[0]) * 0.68, trim, 0.03);
    if (o.glass) {
      const mz = o.glass.z0 + (o.glass.z1 - o.glass.z0) * 0.25 + cz,
        x = o.glass.w0 + 0.13;
      rod(p, [s * (x - 0.15), o.glass.base + 0.02, mz], [s * x, o.glass.base + 0.1, mz - 0.02], 0.016, trim);
      box(p, s * (x + 0.04), o.glass.base + 0.11, mz, 0.2, 0.11, 0.1, paint, 0.035);
      box(p, s * (x + 0.04), o.glass.base + 0.11, mz + 0.052, 0.17, 0.09, 0.01, chrome);
    }
  }
}
const ROAD_SPECS = {
  sedan: {
    L: 4.72, W: 1.86, r: 0.35, wheels: [-1.45, 1.42], bottom: 0.3,
    top: [[-2.36, 0.6], [-2.2, 0.8], [-1.5, 0.93], [-0.95, 1.02], [0.95, 1.05], [1.75, 1.03], [2.2, 0.97], [2.36, 0.72]],
    belt: [[-2.36, 0.66], [0, 0.78], [2.36, 0.82]],
    glass: { z0: -1.08, z1: -0.25, z2: 0.9, z3: 1.68, base: 0.99, top: 1.45, w0: 0.84, w1: 0.66 },
    doors: [-0.72, 0.28, 1.12], handles: [0.05, 0.92],
  },
  sport: {
    L: 4.5, W: 1.96, r: 0.36, wheels: [-1.38, 1.36], bottom: 0.2, nose: 0.2, power: 3.6,
    top: [[-2.25, 0.46], [-2.05, 0.62], [-1.3, 0.74], [-0.85, 0.82], [0.8, 0.9], [1.6, 0.88], [2.1, 0.84], [2.25, 0.62]],
    belt: [[-2.25, 0.5], [0, 0.62], [2.25, 0.72]],
    glass: { z0: -1.0, z1: -0.15, z2: 0.7, z3: 1.72, base: 0.82, top: 1.16, w0: 0.82, w1: 0.6 },
    doors: [-0.62, 0.62], handles: [0.5],
  },
  compact: {
    L: 3.92, W: 1.8, r: 0.335, wheels: [-1.24, 1.22], bottom: 0.3, tail: 0.04,
    top: [[-1.96, 0.62], [-1.8, 0.82], [-1.25, 0.94], [-0.8, 1.03], [0.95, 1.06], [1.65, 1.02], [1.96, 0.86]],
    belt: [[-1.96, 0.68], [0, 0.82], [1.96, 0.9]],
    glass: { z0: -0.92, z1: -0.22, z2: 1.12, z3: 1.82, base: 1.0, top: 1.53, w0: 0.82, w1: 0.68, roof: surface("#f7f4ef", 0.3, 0.35) },
    doors: [-0.62, 0.72], handles: [0.6],
  },
  suv: {
    L: 4.76, W: 1.98, r: 0.43, wheels: [-1.48, 1.46], bottom: 0.46, power: 5, tail: 0.04, nose: 0.1,
    top: [[-2.38, 0.82], [-2.22, 1.06], [-1.45, 1.2], [-0.9, 1.27], [1.55, 1.3], [2.15, 1.24], [2.38, 0.98]],
    belt: [[-2.38, 0.92], [0, 1.0], [2.38, 1.06]],
    glass: { z0: -1.06, z1: -0.45, z2: 1.7, z3: 2.18, base: 1.24, top: 1.84, w0: 0.9, w1: 0.76 },
    doors: [-0.78, 0.25, 1.2], handles: [0.05, 1.02],
  },
  pickup: {
    L: 5.0, W: 2.0, r: 0.43, wheels: [-1.58, 1.52], bottom: 0.48, power: 5.5, tail: 0.02, nose: 0.09,
    top: [[-2.5, 0.82], [-2.32, 1.08], [-1.5, 1.2], [-1.0, 1.26], [0.55, 1.28], [2.3, 1.24], [2.5, 1.02]],
    belt: [[-2.5, 0.92], [0, 1.02], [2.5, 1.08]],
    glass: { z0: -1.08, z1: -0.52, z2: 0.34, z3: 0.58, base: 1.25, top: 1.84, w0: 0.9, w1: 0.76 },
    doors: [-0.82, 0.08, 0.68], handles: [-0.08, 0.54],
  },
  open: {
    L: 4.3, W: 1.86, r: 0.35, wheels: [-1.34, 1.3], bottom: 0.26, power: 3.4, nose: 0.2,
    top: [[-2.15, 0.54], [-1.98, 0.72], [-1.2, 0.86], [-0.5, 0.94], [0.55, 0.92], [1.45, 0.94], [1.95, 0.88], [2.15, 0.64]],
    belt: [[-2.15, 0.6], [0, 0.72], [2.15, 0.76]],
    doors: [-0.55, 0.62], handles: [0.48],
  },
  retro: {
    L: 4.5, W: 1.68, r: 0.36, wheels: [-1.42, 1.4], bottom: 0.36, power: 2.9, nose: 0.1, tail: 0.2, flare: 0,
    top: [[-2.25, 0.72], [-2.1, 0.92], [-1.3, 1.0], [-0.95, 1.05], [0.95, 1.04], [1.8, 0.98], [2.25, 0.74]],
    belt: [[-2.25, 0.72], [0, 0.8], [2.25, 0.76]],
    glass: { z0: -0.98, z1: -0.42, z2: 0.68, z3: 1.32, base: 1.02, top: 1.56, w0: 0.76, w1: 0.6, power: 2.8 },
    doors: [-0.55, 0.65], handles: [0.5],
  },
};
ROAD_SPECS.limo = {
  ...ROAD_SPECS.sedan,
  L: 7.3,
  wheels: [-2.45, 2.42],
  top: [[-3.65, 0.6], [-3.48, 0.8], [-2.75, 0.93], [-2.2, 1.02], [2.2, 1.05], [3.0, 1.03], [3.48, 0.97], [3.65, 0.72]],
  belt: [[-3.65, 0.66], [0, 0.8], [3.65, 0.82]],
  glass: { z0: -2.3, z1: -1.5, z2: 2.2, z3: 2.95, base: 0.99, top: 1.46, w0: 0.84, w1: 0.66 },
  doors: [-1.9, -0.75, 0.4, 1.55],
  handles: [-0.95, 0.2, 1.35],
};
ROAD_SPECS.monster = { ...ROAD_SPECS.suv };
ROAD_SPECS.tow = { ...ROAD_SPECS.pickup };
ROAD_SPECS.taxi = ROAD_SPECS.sedan;
ROAD_SPECS.police = {
  ...ROAD_SPECS.suv,
  glass: { ...ROAD_SPECS.suv.glass, roof: surface("#224e79", 0.55, 0.32) },
};
ROAD_SPECS.ev = {
  ...ROAD_SPECS.compact, r: 0.38, bottom: 0.27,
  glass: {
    ...ROAD_SPECS.compact.glass, z0: -1.19, z1: -0.43, z2: 0.69, z3: 1.67,
    top: 1.50, roof: surface("#172832", 0.8, 0.17),
  },
};
function roadCar(p, type, paint) {
  const kind = CARS[type].kind,
    o = (type === "ev" ? ROAD_SPECS.ev : ROAD_SPECS[kind]) || ROAD_SPECS.sedan,
    monster = kind === "monster",
    tyre = monster ? 0.84 : o.r,
    body = shell(p, o, paint);
  if (o.glass) glasshouse(p, o.glass, paint);
  carDetails(p, o, body, paint, {
    electric: type === "ev",
    handle: kind === "retro" ? chrome : paint,
    grille: kind === "retro" ? chrome : alloy,
  });
  for (const side of [-1, 1]) {
    const tread = monster ? o.W * 0.6 : body.width(o.wheels[0]) - 0.1;
    wheel(p, side * tread, o.wheels[0], tyre, monster ? 0.56 : 0.27, monster);
    wheel(p, side * tread, o.wheels[1], tyre, monster ? 0.56 : 0.28, monster);
  }
  if (kind === "sport") {
    // Заднее антикрыло у дальних спортивных машин
    for (const s of [-1, 1]) box(p, s * 0.62, 1.0, 2.0, 0.05, 0.26, 0.15, trim);
    box(p, 0, 1.14, 2.02, 2.0, 0.05, 0.3, paint, 0.02);
  }
  if (kind === "open") {
    // Открытый салон: сиденья, стекло и дуги
    box(p, 0, 0.9, 0.2, 1.42, 0.12, 1.5, trim, 0.05);
    for (const x of [-0.38, 0.38]) {
      box(p, x, 1.12, 0.45, 0.5, 0.5, 0.24, surface("#a5622f", 0.05, 0.55), 0.09);
      box(p, x, 0.98, 0.1, 0.5, 0.2, 0.6, surface("#a5622f", 0.05, 0.55), 0.07);
      rod(p, [x, 0.95, 0.8], [x, 1.42, 0.72], 0.035, chrome);
    }
    loft(p, [
      { z: -0.62, w: 1.62, b: 0.88, t: 0.98 },
      { z: -0.36, w: 1.46, b: 0.9, t: 1.32 },
      { z: -0.3, w: 1.44, b: 1.26, t: 1.34 },
    ], glass, 4);
    for (const s of [-1, 1]) rod(p, [s * 0.82, 0.92, -0.62], [s * 0.72, 1.34, -0.31], 0.024, chrome);
    rod(p, [-0.72, 1.34, -0.31], [0.72, 1.34, -0.31], 0.022, chrome);
  }
  if (kind === "limo")
    for (const side of [-1, 1]) {
      // Хромированный пояс длинного салона
      box(p, side * (body.width(0) + 0.002), 0.74, 0, 0.012, 0.04, o.L * 0.74, chrome);
      for (const z of [-0.75, 0.25, 1.25])
        rod(p, [side * 0.82, 0.99, z], [side * 0.66, 1.46, z], 0.022, trim);
    }
  if (type === "police") {
    const stripe = surface("#165385", 0.38, 0.33);
    for (const side of [-1, 1]) {
      // Разметка следует поясу кузова и заканчивается над задней аркой.
      for (const [z0,z1] of [[-1.26,-0.53],[-0.53,0.13],[0.13,0.77],[0.77,1.33]]) {
        const low = (z) => body.belt(z) - 0.12 + Math.max(0,z-0.65) * 0.16;
        const point = (z,y) => [side * (body.width(z) + 0.005), y, z];
        patch(p, [point(z0,low(z0)),point(z1,low(z1)),point(z1,low(z1)+0.12),point(z0,low(z0)+0.12)], stripe);
      }
    }
    lightbar(p, 1.94, 0.22);
    for (const side of [-1, 1]) {
      rod(p, [side * 0.62, 1.91, -0.25], [side * 0.62, 1.91, 1.65], 0.035, trim);
      box(p, side * 0.49, 1.07, 2.38, 0.7, 0.12, 0.04, tail, 0.02);
    }
  }
  if (type === "ev") {
    // Тонкая световая подпись продолжается на крыльях.
    const front = -o.L / 2, rear = o.L / 2;
    box(p, 0, body.belt(front)-0.02, front+0.012, 1.04, 0.045, 0.085, head, 0.02);
    for (const side of [-1,1]) {
      rod(p,[side*0.50,body.belt(front)-0.02,front+0.015],[side*0.78,body.belt(front+0.25),front+0.23],0.023,head);
      rod(p,[side*0.59,body.belt(rear),rear-0.015],[side*0.83,body.belt(rear-0.3),rear-0.29],0.031,tail);
    }
    box(p, 0, o.glass.top+0.015, o.glass.z2+0.08, 1.34, 0.05, 0.22, glass, 0.025);
  }
  if (type === "taxi") {
    box(p, 0, 1.58, 0.32, 0.6, 0.2, 0.26, lamp("#ffe7a1", 0.7), 0.05);
    // Шашечки вдоль бортов вместо надписи
    for (const side of [-1, 1])
      for (let i = 0; i < 14; i++) {
        const z = (i - 6.5) * 0.17;
        if (Math.abs(z) > 1.15) continue;
        box(p, side * (body.width(z) + 0.004), i % 2 ? 0.7 : 0.59, z, 0.012, 0.11, 0.17, surface("#14161a"));
      }
  }
  if (kind === "pickup" || kind === "tow") {
    // Открытый кузов: дно, борта и задний борт
    box(p, 0, 1.17, 1.48, 1.62, 0.14, 1.72, trim, 0.02);
    for (const s of [-1, 1]) box(p, s * 0.85, 1.28, 1.48, 0.1, 0.05, 1.8, alloy, 0.02);
    box(p, 0, 1.28, 0.62, 1.74, 0.05, 0.08, alloy, 0.02);
    box(p, 0, 1.28, 2.38, 1.74, 0.05, 0.08, alloy, 0.02);
    if (kind === "tow") {
      box(p, 0, 1.84, 0.02, 1.2, 0.09, 0.2, lamp("#ffb020", 1.8), 0.03);
      box(p, 0, 1.42, 1.0, 0.55, 0.45, 0.65, trim, 0.05);
      rod(p, [0, 1.5, 1.0], [0, 2.5, 2.4], 0.11, paint);
      rod(p, [0.18, 1.3, 1.5], [0.12, 2.0, 1.95], 0.045, alloy);
      rod(p, [0, 2.5, 2.42], [0, 1.45, 2.62], 0.016, trim);
      mesh(p, new T.TorusGeometry(0.1, 0.028, 8, 14), alloy, 0, 1.35, 2.64);
    }
  }
  if (kind === "suv") {
    for (const s of [-1, 1])
      rod(p, [s * 0.72, 1.92, -0.3], [s * 0.72, 1.92, 1.6], 0.024, alloy);
    for (const s of [-1, 1])
      box(p, s * (body.width(0) + 0.003), 0.6, 0, 0.018, 0.22, 1.7, trim);
  }
  if (kind === "retro") {
    // Широкие крылья, круглые фары и хром
    for (const s of [-1, 1]) {
      for (const wz of o.wheels)
        loft(p, [
          { x: s * 0.82, z: wz - 0.68, w: 0.16, b: 0.5, t: 0.64 },
          { x: s * 0.84, z: wz - 0.42, w: 0.36, b: 0.74, t: 0.9 },
          { x: s * 0.86, z: wz, w: 0.42, b: 0.76, t: 0.98 },
          { x: s * 0.84, z: wz + 0.42, w: 0.36, b: 0.74, t: 0.9 },
          { x: s * 0.82, z: wz + 0.68, w: 0.16, b: 0.5, t: 0.64 },
        ], paint, 2.4);
      cyl(p, s * 0.72, 0.88, -2.08, 0.15, 0.15, 0.12, chrome, "z", 18);
      cyl(p, s * 0.72, 0.88, -2.14, 0.125, 0.125, 0.03, head, "z", 18);
    }
    box(p, 0, 0.47, -2.28, 1.72, 0.1, 0.12, chrome, 0.05);
    box(p, 0, 0.47, 2.28, 1.72, 0.1, 0.12, chrome, 0.05);
    for (let i = -5; i <= 5; i++) box(p, i * 0.075, 0.74, -2.2, 0.025, 0.28, 0.05, chrome);
  }
  if (monster) {
    // Кузов поднят над огромными колёсами, на подвеске видны амортизаторы
    for (const part of p.children) if (part.name !== "axle") part.position.y += 0.52;
    for (const side of [-1, 1])
      for (const z of o.wheels) {
        rod(p, [side * 0.62, 1.05, z], [side * o.W * 0.56, 0.84, z], 0.075, alloy);
        rod(p, [side * 0.62, 1.25, z + 0.25], [side * o.W * 0.56, 0.84, z], 0.05, surface("#ff5a2b", 0.3, 0.4));
      }
    for (const x of [-0.45, -0.15, 0.15, 0.45])
      cyl(p, x, 2.5, -0.42, 0.09, 0.09, 0.08, lamp("#fff1c2", 1.6), "z", 12);
  }
}
// Большой высокий кузов: фургон, автобус, скорая, пожарная
const TALL_SPECS = {
  van: {
    L: 5.6, W: 2.08, r: 0.4, wheels: [-1.85, 1.75], bottom: 0.42, power: 6.5, nose: 0.08, tail: 0.02, round: 0.22,
    top: [[-2.8, 0.82], [-2.7, 1.1], [-2.22, 1.32], [-1.5, 2.18], [-1.0, 2.46], [2.5, 2.52], [2.8, 2.36]],
    belt: [[-2.8, 1.0], [0, 1.28], [2.8, 1.34]],
    screen: [[-2.26, 1.36], [-1.5, 2.2]],
    windows: 3,
  },
  bus: {
    L: 7.8, W: 2.36, r: 0.46, wheels: [-2.45, 2.25], bottom: 0.46, power: 9, nose: 0.03, tail: 0.02, round: 0.12, flare: 0,
    top: [[-3.9, 0.82], [-3.86, 1.2], [-3.84, 2.3], [-3.55, 3.02], [3.6, 3.04], [3.86, 2.72], [3.9, 0.9]],
    belt: [[-3.9, 1.3], [3.9, 1.34]],
    screen: [[-3.86, 1.22], [-3.56, 2.9]],
    windows: 6,
  },
  fire: {
    L: 6.5, W: 2.3, r: 0.48, wheels: [-2.05, 1.95], bottom: 0.5, power: 8, nose: 0.05, tail: 0.01, round: 0.14, flare: 0,
    top: [[-3.25, 0.84], [-3.2, 1.2], [-3.1, 2.0], [-2.72, 2.82], [-1.1, 2.88], [-0.95, 2.72], [3.25, 2.74]],
    belt: [[-3.25, 1.2], [3.25, 1.3]],
    screen: [[-3.14, 1.74], [-2.74, 2.76]],
    windows: 1,
  },
};
TALL_SPECS.ambulance = TALL_SPECS.icecream = TALL_SPECS.van;
function commercial(p, type, paint) {
  const o = TALL_SPECS[type],
    body = shell(p, o, paint),
    bus = type === "bus",
    half = o.L / 2,
    roofY = (z) => body.top(z);
  for (const s of [-1, 1]) {
    for (const wz of o.wheels) wheel(p, s * (body.width(wz) - 0.12), wz, o.r, 0.32);
    // Боковые окна чуть выступают над бортом
    const n = o.windows,
      from = bus ? -3.0 : type === "fire" ? -2.65 : -1.45,
      to = bus ? 3.1 : type === "fire" ? -1.2 : 2.35,
      gap = (to - from) / n;
    for (let j = 0; j < n; j++) {
      const z = from + gap * (j + 0.5),
        yTop = roofY(z) - (bus ? 0.32 : 0.36),
        yLow = body.belt(z) + (bus ? 0.2 : 0.14);
      box(p, s * (body.width(z) * 0.985), (yTop + yLow) / 2, z, 0.04, yTop - yLow, gap - 0.14, glass, 0.03);
      box(p, s * (body.width(z) * 0.985 + 0.012), yLow - 0.03, z, 0.015, 0.03, gap - 0.1, chrome);
    }
    box(p, s * (body.width(0) + 0.003), 0.66, 0, 0.018, 0.14, o.L * 0.82, trim);
    // Зеркало на кронштейне
    const mz = o.screen[0][0] + 0.25;
    rod(p, [s * (o.W * 0.42), 2.05, mz], [s * (o.W * 0.58), 2.15, mz - 0.02], 0.018, trim);
    box(p, s * (o.W * 0.6), 2.05, mz, 0.14, 0.42, 0.1, trim, 0.03);
    box(p, s * (o.W * 0.42), body.belt(-half + 0.3) - 0.04, -half + 0.16, o.W * 0.2, 0.12, 0.24, head, 0.03);
    box(p, s * (o.W * 0.42), body.belt(half - 0.3) + 0.06, half - 0.08, 0.3, 0.42, 0.16, tail, 0.03);
    cyl(p, s * (o.W * 0.42), 0.68, -half + 0.08, 0.06, 0.06, 0.14, head, "z", 10);
  }
  // Лобовое стекло по линии крыши
  const [[z0, y0], [z1, y1]] = o.screen,
    wide = o.W * (bus ? 0.46 : 0.43);
  patch(p, [[-wide, y0, z0 - 0.04], [wide, y0, z0 - 0.04], [wide * 0.92, y1, z1 - 0.05], [-wide * 0.92, y1, z1 - 0.05]], glass);
  box(p, 0, body.belt(half) + 0.62, half - 0.04, o.W * 0.72, 0.85, 0.08, glass, 0.04);
  // Решётка и бампер
  box(p, 0, 0.98, -half + 0.08, o.W * 0.6, 0.3, 0.16, trim, 0.03);
  for (let i = -4; i <= 4; i++) box(p, i * 0.13, 0.98, -half + 0.01, 0.025, 0.24, 0.03, alloy);
  box(p, 0, 0.62, -half + 0.06, o.W * 0.92, 0.22, 0.18, type === "fire" ? chrome : trim, 0.05);
  box(p, 0, 0.62, half - 0.04, o.W * 0.9, 0.22, 0.16, trim, 0.05);
  if (bus) {
    // Табло, двери и блоки на крыше
    box(p, 0, 2.82, -3.72, 1.4, 0.2, 0.06, lamp("#ffb020", 1.3), 0.02);
    box(p, 1.17, 1.65, -2.6, 0.04, 1.75, 1.1, glass, 0.02);
    box(p, 1.17, 1.65, 0.2, 0.04, 1.75, 1.1, glass, 0.02);
    for (const z of [-1.2, 1.4]) box(p, 0, 3.14, z, 1.3, 0.22, 1.5, surface("#d9dde0", 0.2, 0.5), 0.07);
  }
  if (type === "van") {
    // Кемпер: выдвижная дверь, вентиляция на крыше, велосипеды не влезли
    box(p, 0, 2.62, 0.8, 0.8, 0.14, 0.8, surface("#eceff1", 0.1, 0.5), 0.05);
    box(p, 0, 2.6, -0.4, 1.5, 0.08, 0.5, surface("#26303a", 0.4, 0.3), 0.03);
    for (const s of [-1, 1]) box(p, s * (body.width(0) + 0.003), 0.92, 0, 0.012, 0.08, 3.4, surface("#f6f4ee", 0.2, 0.4));
  }
  if (type === "ambulance") {
    // Сердце вместо красного креста: крест — охраняемая эмблема
    const love = surface("#ff3d6e", 0.1, 0.35);
    for (const s of [-1, 1]) {
      heart(p, s * (body.width(0.5) + 0.03), 1.0, 0.5, 0.95, love);
      box(p, s * (body.width(0) + 0.004), 1.5, 0, 0.012, 0.13, o.L * 0.78, surface("#ff5a4a", 0.2, 0.4));
    }
    lightbar(p, 2.62, -1.0);
  }
  if (type === "fire") {
    // Шкафчики с инструментом, лестница и мигалка
    for (const s of [-1, 1])
      for (const z of [-0.5, 0.55, 1.6, 2.6])
        box(p, s * (body.width(z) + 0.004), 1.62, z, 0.02, 1.5, 0.92, surface("#d9dde0", 0.85, 0.3), 0.02);
    for (const x of [-0.42, 0.42])
      rod(p, [x, 3.08, -2.2], [x, 3.08, 3.1], 0.05, alloy);
    for (let z = -2.1; z < 3.05; z += 0.32)
      rod(p, [-0.42, 3.08, z], [0.42, 3.08, z], 0.028, alloy);
    for (const z of [-1.4, 2.4]) box(p, 0, 2.92, z, 1.2, 0.24, 0.2, trim, 0.03);
    const monitor = new T.Group();
    monitor.name = "waterMonitor";
    monitor.position.set(0.62, 3.13, -1.12);
    monitor.rotation.y = Math.PI;
    p.add(monitor);
    rod(monitor, [0,0,0], [0,0,0.75], 0.13, paint);
    rod(monitor, [0,0,0.74], [0,0,1.12], 0.105, chrome);
    const tip = new T.Object3D();
    tip.name = "monitorTip";
    tip.position.z = 1.13;
    monitor.add(tip);
    bake(monitor);
    lightbar(p, 2.98, -2.0);
  }
  if (type === "icecream") {
    for (let j = 0; j < 6; j++)
      box(p, 1.18, 2.08, (j - 2.5) * 0.46 + 0.5, 0.42, 0.07, 0.46, j % 2 ? paint : surface("#ffffff", 0, 0.5));
    box(p, 1.05, 1.6, 0.5, 0.04, 0.72, 2.3, surface("#3a3f46", 0.2, 0.5), 0.02);
    box(p, 1.06, 1.22, 0.5, 0.2, 0.05, 2.4, chrome);
    cyl(p, 0, 2.72, 0.6, 0.32, 0.05, 0.75, surface("#c78f57", 0.05, 0.7));
    mesh(p, new T.SphereGeometry(0.38, 16, 12), surface("#fa96c3", 0.05, 0.35), 0, 3.25, 0.6);
    mesh(p, new T.SphereGeometry(0.3, 14, 10), surface("#fff4dd", 0.05, 0.35), 0, 3.62, 0.62);
  }
}
function truck(p, paint) {
  const w = 2.42,
    cab = {
      L: 2.45, W: w, r: 0.53, cz: -3.3, wheels: [-0.24], bottom: 0.56, power: 9, nose: 0.02, tail: 0, round: 0.12, flare: 0,
      top: [[-1.22, 0.9], [-1.2, 1.3], [-1.17, 2.5], [-0.82, 3.12], [1.22, 3.2]],
      belt: [[-1.22, 1.5], [1.22, 1.6]],
    },
    body = shell(p, cab, paint);
  box(p, 0, 0.7, -1.2, w * 0.72, 0.28, 4.7, trim);
  // Обтекатель на крыше
  loft(p, [
    { z: -3.55, w: 2.1, b: 3.08, t: 3.14 },
    { z: -3.0, w: 2.2, b: 3.12, t: 3.45 },
    { z: -2.15, w: 2.36, b: 3.14, t: 3.62 },
  ], paint, 5);
  patch(p, [[-1.08, 1.68, -4.5], [1.08, 1.68, -4.5], [0.98, 2.92, -4.2], [-0.98, 2.92, -4.2]], glass);
  // Хромированная решётка, бампер и ступени
  box(p, 0, 1.2, -4.5, 1.7, 0.72, 0.08, trim, 0.03);
  for (let i = 0; i < 6; i++) box(p, 0, 0.96 + i * 0.1, -4.55, 1.62, 0.035, 0.03, chrome);
  box(p, 0, 0.66, -4.5, w * 0.98, 0.32, 0.2, chrome, 0.06);
  for (const s of [-1, 1]) {
    box(p, s * (w / 2 + 0.005), 2.42, -3.75, 0.03, 0.76, 1.1, glass, 0.04);
    wheel(p, s * 1.1, -3.54, 0.53, 0.36);
    wheel(p, s * 1.05, -1.64, 0.53, 0.38);
    box(p, s * 0.78, 0.86, -4.5, 0.42, 0.16, 0.06, head, 0.03);
    rod(p, [s * 1.14, 2.25, -4.12], [s * 1.42, 2.34, -4.2], 0.03, trim);
    box(p, s * 1.45, 2.3, -4.2, 0.16, 0.5, 0.12, trim, 0.03);
    // Топливный бак и выхлопная труба
    cyl(p, s * 1.0, 0.82, -2.6, 0.3, 0.3, 0.95, alloy, "z", 18);
    cyl(p, s * 1.2, 2.5, -2.12, 0.07, 0.08, 1.9, chrome, "y", 12);
    box(p, s * (w / 2 + 0.005), 1.05, -3.2, 0.02, 0.3, 0.75, surface("#2a3038", 0.4, 0.4));
  }
  for (const z of [-1.0, -0.2]) box(p, 0, 0.9, z, 1.5, 0.08, 0.6, surface("#3a3f46", 0.5, 0.5));
  const trailer = new T.Group();
  trailer.name = "trailer";
  trailer.position.z = -1.7;
  p.add(trailer);
  box(trailer, 0, 2.2, 3.18, 2.42, 2.72, 6.5, surface("#e6eaee", 0.15, 0.42), 0.06);
  box(trailer, 0, 0.82, 3.18, 2.0, 0.22, 6.2, trim);
  for (const s of [-1, 1]) {
    for (let z = 0.2; z < 6.3; z += 0.42)
      box(trailer, s * 1.216, 2.2, z, 0.022, 2.56, 0.05, surface("#c9ced4", 0.5, 0.35));
    box(trailer, s * 1.222, 1.0, 3.18, 0.016, 0.1, 6.4, paint);
    box(trailer, s * 1.222, 3.42, 3.18, 0.016, 0.1, 6.4, paint);
    box(trailer, s * 1.0, 0.72, 2.3, 0.3, 0.42, 1.3, trim, 0.03);
    for (const z of [4.53, 5.65]) wheel(trailer, s * 1.08, z, 0.5, 0.36);
  }
  for (const x of [-0.6, 0.6]) {
    box(trailer, x, 2.2, 6.45, 1.16, 2.62, 0.05, surface("#d4d9de", 0.4, 0.35), 0.02);
    rod(trailer, [x * 0.5, 1.0, 6.5], [x * 0.5, 3.4, 6.5], 0.025, chrome);
    rod(trailer, [x * 1.5, 1.0, 6.5], [x * 1.5, 3.4, 6.5], 0.025, chrome);
  }
  box(trailer, 0, 0.72, 6.42, 2.37, 0.22, 0.14, trim, 0.03);
  for (const side of [-1, 1]) {
    box(trailer, side * 1.03, 0.48, 6.05, 0.46, 0.68, 0.05, rubber);
    box(trailer, side * 0.85, 0.72, 6.5, 0.55, 0.12, 0.05, tail, 0.015);
  }
  bake(trailer);
}
function tank(p, paint) {
  const track = surface("#393a35", 0.36, 0.8);
  // Корпус с наклонными листами брони и плоская литая башня
  loft(p, [
    { z: -2.42, w: 2.3, b: 0.7, t: 0.78 },
    { z: -1.72, w: 2.5, b: 0.55, t: 1.32 },
    { z: 1.6, w: 2.5, b: 0.55, t: 1.42 },
    { z: 2.3, w: 2.4, b: 0.72, t: 1.26 },
  ], paint, 10);
  box(p, 0, 1.46, 1.6, 2.1, 0.06, 1.1, trim, 0.02);
  for (let z = 1.15; z < 2.05; z += 0.14) box(p, 0, 1.5, z, 1.5, 0.04, 0.08, surface("#3f4a2c", 0.3, 0.6));
  for (const side of [-1, 1]) {
    // Навесные экраны над гусеницей
    box(p, side * 1.56, 1.2, 0, 0.05, 0.42, 4.3, paint, 0.015);
    box(p, side * 1.25, 1.34, -2.1, 0.32, 0.1, 0.34, head, 0.03);
    const x = side * 1.27;
    box(p, x, 0.65, 0, 0.54, 1.12, 4.2, track, 0.32);
    for (let n = 0; n < 6; n++) {
      cyl(
        p,
        x + side * 0.16,
        0.56,
        (n - 2.5) * 0.6,
        0.4,
        0.4,
        0.26,
        paint,
        "x",
      );
      cyl(
        p,
        x + side * 0.31,
        0.56,
        (n - 2.5) * 0.6,
        0.16,
        0.16,
        0.07,
        rimSpoke,
        "x",
      );
    }
    const links = new T.InstancedMesh(
      new T.BoxGeometry(0.6, 0.09, 0.16),
      trim,
      36,
    );
    links.name = "trackLinks";
    links.position.x = x;
    links.frustumCulled = false;
    const belt = new T.Group();
    belt.add(links);
    p.add(belt);
    box(p, x, 1.36, 0, 0.66, 0.08, 4.35, paint, 0.03);
  }
  loft(p, [
    { z: -1.45, w: 1.0, b: 1.42, t: 1.62 },
    { z: -0.85, w: 1.85, b: 1.4, t: 1.98 },
    { z: 0.45, w: 2.0, b: 1.4, t: 2.04 },
    { z: 1.1, w: 1.6, b: 1.42, t: 1.92 },
  ], paint, 3.4);
  cyl(p, -0.42, 2.1, 0.1, 0.34, 0.37, 0.16, paint, "y", 16);
  cyl(p, 0.48, 2.08, 0.25, 0.27, 0.27, 0.1, trim, "y", 14);
  rod(p, [0.72, 2.0, 0.85], [0.8, 3.3, 1.0], 0.012, trim);
  for (const s of [-1, 1]) {
    box(p, s * 0.98, 1.74, -0.2, 0.05, 0.22, 0.7, trim);
    for (let i = 0; i < 3; i++) cyl(p, s * 1.0, 1.72, 0.25 + i * 0.16, 0.06, 0.06, 0.16, surface("#3f4a2c", 0.3, 0.6), "x", 8);
  }
  const gun = new T.Group();
  gun.name = "gun";
  p.add(gun);
  cyl(gun, 0, 1.77, -1.83, 0.115, 0.16, 2.85, paint, "z");
  cyl(gun, 0, 1.77, -3.26, 0.18, 0.18, 0.47, trim, "z");
  cyl(gun, 0, 1.77, -3.505, 0.105, 0.105, 0.035, rubber, "z");
  bake(gun);
  for (const s of [-1, 1]) box(p, s * 0.95, 1.1, 2.32, 0.28, 0.1, 0.05, tail, 0.015);
}
function tractor(p, paint) {
  const black = surface("#1b1e22", 0.3, 0.5);
  box(p, 0, 0.82, 0.1, 1.2, 0.5, 3.4, trim, 0.06);
  // Капот с жалюзи и решёткой радиатора
  loft(p, [
    { z: -2.02, w: 1.1, b: 0.82, t: 1.5 },
    { z: -1.85, w: 1.26, b: 0.8, t: 1.68 },
    { z: -0.9, w: 1.3, b: 0.8, t: 1.82 },
    { z: 0.05, w: 1.36, b: 0.8, t: 1.92 },
  ], paint, 6);
  box(p, 0, 1.2, -2.04, 0.92, 0.72, 0.05, black, 0.02);
  for (let i = 0; i < 7; i++) box(p, 0, 0.92 + i * 0.095, -2.07, 0.86, 0.03, 0.03, alloy);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) box(p, s * 0.66, 1.42, -1.55 + i * 0.22, 0.02, 0.28, 0.1, black);
    box(p, s * 0.38, 1.6, -2.02, 0.22, 0.12, 0.05, head, 0.02);
    // Колёса: большие задние и узкие передние, крылья по дуге
    wheel(p, s * 0.95, -1.22, 0.56, 0.34, true);
    wheel(p, s * 1.12, 1.13, 0.88, 0.54, true);
    const fender = new T.CylinderGeometry(0.98, 0.98, 0.62, 22, 1, true, 0.42, 2.3);
    fender.rotateZ(Math.PI / 2);
    const m = mesh(p, fender, paint, s * 1.12, 0.88, 1.13);
    m.rotation.x = 0;
    box(p, s * 0.9, 0.96, -1.22, 0.42, 0.05, 1.05, paint, 0.02);
    box(p, s * 0.92, 1.05, 1.92, 0.22, 0.34, 0.05, tail, 0.015);
  }
  // Кабина: рама и стёкла
  const cabZ = 0.76,
    cabW = 0.82,
    floor = 1.6,
    roof = 3.0,
    front = cabZ - 0.72,
    back = cabZ + 0.72;
  for (const s of [-1, 1]) {
    patch(p, [[s * cabW, floor, front], [s * cabW, floor, back], [s * cabW, roof, back], [s * cabW, roof, front]], glass);
    rod(p, [s * cabW, floor, front], [s * cabW * 0.96, roof, front], 0.032, black);
    rod(p, [s * cabW, floor, back], [s * cabW * 0.96, roof, back], 0.04, black);
    rod(p, [s * (cabW + 0.01), floor + 0.72, front], [s * (cabW + 0.01), floor + 0.72, back], 0.018, black);
    rod(p, [s * (cabW + 0.12), roof - 0.45, front - 0.12], [s * cabW, roof - 0.3, front], 0.012, black);
    box(p, s * (cabW + 0.14), roof - 0.5, front - 0.14, 0.05, 0.26, 0.14, black, 0.01);
    for (const y of [roof - 0.06]) box(p, s * 0.42, y + 0.15, front - 0.26, 0.2, 0.09, 0.06, head, 0.02);
  }
  patch(p, [[-cabW, floor, front], [cabW, floor, front], [cabW * 0.96, roof, front], [-cabW * 0.96, roof, front]], glass);
  patch(p, [[cabW, floor, back], [-cabW, floor, back], [-cabW * 0.96, roof, back], [cabW * 0.96, roof, back]], glass);
  rod(p, [-cabW, floor, back], [cabW, floor, back], 0.03, black);
  rod(p, [-cabW, floor, front], [cabW, floor, front], 0.03, black);
  loft(p, [
    { z: front - 0.32, w: 1.5, b: roof + 0.02, t: roof + 0.09 },
    { z: cabZ, w: 1.95, b: roof, t: roof + 0.2 },
    { z: back + 0.2, w: 1.75, b: roof + 0.02, t: roof + 0.1 },
  ], paint, 4);
  box(p, 0, 1.68, cabZ + 0.15, 0.5, 0.42, 0.5, black, 0.05);
  rod(p, [-0.1, 1.9, cabZ - 0.34], [-0.1, 2.25, cabZ - 0.42], 0.02, black);
  mesh(p, new T.TorusGeometry(0.17, 0.02, 6, 18), black, -0.1, 2.28, cabZ - 0.44);
  // Вертикальный глушитель и передние грузы
  cyl(p, 0.5, 2.5, -0.72, 0.065, 0.075, 1.5, trim, "y", 12);
  cyl(p, 0.5, 3.3, -0.72, 0.085, 0.065, 0.12, chrome, "y", 12);
  for (let i = 0; i < 4; i++) box(p, 0, 0.72, -2.2 - i * 0.07, 1.05, 0.34, 0.055, i % 2 ? black : surface("#3a3f46", 0.4, 0.5), 0.015);
  const blade = new T.Group();
  blade.name = "blade";
  p.add(blade);
  const ochre = surface("#f1a91f", 0.48, 0.36);
  for (const x of [-0.85, 0.85]) {
    rod(blade, [x, 1.23, -0.78], [x, 0.53, -2.48], 0.12, ochre);
    rod(blade, [x, 1.34, -1.04], [x, 0.81, -2.36], 0.06, chrome);
  }
  box(blade, 0, 0.67, -2.53, 3.15, 1.1, 0.24, ochre, 0.09);
  box(blade, 0, 0.18, -2.78, 3.2, 0.16, 0.59, alloy, 0.04);
  for (const side of [-1, 1])
    box(blade, side * 1.5, 0.48, -2.74, 0.14, 0.63, 0.53, ochre, 0.04);
  for (const x of [-1.23, -0.62, 0, 0.62, 1.23])
    box(blade, x, 0.17, -3.11, 0.18, 0.13, 0.4, chrome, 0.03);
  bake(blade);
}

let shadowMaterial;
const blobPlane = new T.PlaneGeometry(1, 1);
function blobShadow() {
  if (shadowMaterial) return shadowMaterial;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d"),
    grad = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,.62)");
  grad.addColorStop(0.62, "rgba(0,0,0,.36)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c);
  shadowMaterial = new T.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  return shadowMaterial;
}
let concept;
const sphereCore = new T.SphereGeometry(1, 16, 10);
const CONCEPT_ACCENT = {
    police: "#1459a0",
    coupe: "#10325f",
    hyper: "#23201e",
    ev: "#2bb7d8",
    comet: "#23201e",
    neon: "#ff37c7",
  },
  // Пропорции: у каждой легковой свой силуэт, хотя основа модели одна
  CONCEPT_SHAPE = {
    coupe: [0.97, 0.93, 1.05],
    hyper: [1.09, 0.82, 1.03],
    ev: [0.97, 1.1, 0.96],
    comet: [1.03, 0.88, 1.08],
    neon: [1.05, 0.86, 1.0],
  };
function wing(p, y, z, width, mat) {
  for (const x of [-width * 0.33, width * 0.33])
    box(p, x, y - 0.14, z, 0.05, 0.28, 0.13, surface("#20252c", 0.4, 0.35));
  box(p, 0, y, z, width, 0.055, 0.3, mat, 0.025);
}
export async function prepareConcept(onProgress) {
  const gltf = await new GLTFLoader().loadAsync(
    new URL("../../assets/models/car-concept.glb", import.meta.url).href,
    onProgress,
  );
  concept = gltf.scene;
  concept.traverse((n) => {
    if (!n.isMesh) return;
    n.castShadow = true;
    n.receiveShadow = true;
    const mat = n.material;
    if (mat.name === "Rim2") mat.userData.isRim = true;
    // Изнанка панелей закрывает щели, сквозь которые иначе виден фон
    mat.side = T.DoubleSide;
    if (mat.transmission) {
      mat.transmission = 0;
      mat.color.set("#253948");
      mat.metalness = 0.18;
      mat.roughness = 0.16;
      mat.envMapIntensity = 0.48;
      mat.transparent = false;
      mat.opacity = 1;
    }
  });
  templates.delete("racer");
}
function conceptModel(type) {
  const model = concept.clone(true),
    body = new Map();
  model.traverse((n) => {
    if (!n.isMesh) return;
    const name = n.material?.name;
    if (name === "Paint 1 Carmine") {
      if (!body.has(n.material)) {
        const m = n.material.clone();
        if (type !== "racer")
          m.color.set(type === "police" ? "#f6f7f8" : CARS[type].color);
        m.userData.isPaint = true;
        body.set(n.material, m);
      }
      n.material = body.get(n.material);
    } else if (name === "Paint 2 Carmine" && type !== "racer") {
      if (!body.has(n.material)) {
        const m = n.material.clone();
        m.color.set(CONCEPT_ACCENT[type] || "#20252c");
        body.set(n.material, m);
      }
      n.material = body.get(n.material);
    }
    // Логотип на номере и невидимые снаружи детали в игре не нужны
    if (
      n.name.startsWith("Interior") ||
      n.name === "Engine" ||
      n.name === "License Plate"
    )
      n.visible = false;
  });
  const root = new T.Group(),
    bounds = new T.Box3().setFromObject(model),
    size = bounds.getSize(new T.Vector3()),
    center = bounds.getCenter(new T.Vector3());
  const front = model.getObjectByName("WheelFrontL"),
    rear = model.getObjectByName("WheelRearL");
  if (front && rear) {
    const dir = front
      .getWorldPosition(new T.Vector3())
      .sub(rear.getWorldPosition(new T.Vector3()));
    root.rotation.y = Math.atan2(dir.x, -dir.z);
  }
  model.position.sub(new T.Vector3(center.x, bounds.min.y, center.z));
  root.add(model);
  root.scale.setScalar(4.65 / Math.max(size.x, size.z));
  const holder = new T.Group();
  holder.add(root);
  return holder;
}
const ballShape = new T.SphereGeometry(1, 14, 10);
function ell(p, x, y, z, rx, ry, rz, mat) {
  const m = mesh(p, ballShape, mat, x, y, z);
  m.scale.set(rx, ry, rz);
  return m;
}
// Кит и рыбы для подводного туннеля
export function whaleModel() {
  const p = new T.Group(),
    back = surface("#2b5f8f", 0.15, 0.5),
    belly = surface("#dfeef5", 0.1, 0.6);
  loft(p, [
    { z: -8.5, w: 1.6, b: -0.8, t: 0.6 },
    { z: -6, w: 4.2, b: -2, t: 1.8 },
    { z: -1.5, w: 5, b: -2.4, t: 2.4 },
    { z: 3, w: 3.4, b: -1.5, t: 1.8 },
    { z: 7, w: 1.1, b: -0.4, t: 0.7 },
    { z: 9, w: 0.5, b: -0.15, t: 0.25 },
  ], back, 2.2);
  loft(p, [
    { z: -8.2, w: 1.3, b: -0.92, t: -0.4 },
    { z: -6, w: 3.8, b: -2.08, t: -1.1 },
    { z: -1.5, w: 4.5, b: -2.46, t: -1.3 },
    { z: 3, w: 2.8, b: -1.56, t: -0.8 },
  ], belly, 2.2);
  fin(p, [[0, 0.1], [2.2, 0.15], [3.6, -0.1], [1.6, -0.3]], 0, 0.1, back);
  for (const s of [-1, 1]) {
    const flipper = ell(p, s * 3.2, -1.3, -2.6, 1.7, 0.16, 0.8, back);
    flipper.rotation.z = s * -0.45;
    const fluke = ell(p, s * 1.5, 0.05, 9.6, 1.7, 0.1, 0.8, back);
    fluke.rotation.y = s * 0.35;
  }
  ell(p, 2.2, 0.15, -6.6, 0.11, 0.11, 0.11, surface("#101418", 0.2, 0.3));
  ell(p, -2.2, 0.15, -6.6, 0.11, 0.11, 0.11, surface("#101418", 0.2, 0.3));
  bake(p);
  return p;
}
export function fishGeometry() {
  const body = new T.SphereGeometry(0.55, 8, 6);
  body.scale(0.6, 0.85, 1.25);
  const tailFin = new T.ConeGeometry(0.42, 0.75, 4);
  tailFin.rotateX(-Math.PI / 2);
  tailFin.translate(0, 0, 0.95);
  const merged = mergeGeometries([body.toNonIndexed(), tailFin.toNonIndexed()]);
  merged.computeVertexNormals();
  return merged;
}
// Вращающиеся щётки автомойки
export function washRollers() {
  const p = new T.Group(),
    rollers = [],
    a = surface("#3fb7ff", 0.05, 0.75),
    b2 = surface("#ff8cc0", 0.05, 0.75);
  const make = (x, y, z, length, horizontal) => {
    const g = new T.Group();
    g.position.set(x, y, z);
    if (horizontal) g.rotation.z = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const v = -length / 2 + (i + 0.5) * (length / 8);
      cyl(g, 0, v, 0, 0.72, 0.72, length / 8 + 0.02, i % 2 ? a : b2, "y", 12);
    }
    // Ворс выступает, поэтому вращение хорошо видно
    for (let i = 0; i < 6; i++) {
      const t = (i * Math.PI) / 3,
        tuft = box(g, Math.cos(t) * 0.74, 0, Math.sin(t) * 0.74, 0.18, length * 0.96, 0.18, i % 2 ? b2 : a);
      tuft.rotation.y = -t;
    }
    bake(g);
    p.add(g);
    rollers.push({ group: g, horizontal });
  };
  for (const z of [5, -5])
    for (const side of [-1, 1]) make(side * 7.6, 3.1, z, 6.2, false);
  make(0, 6.1, 0, 15, true);
  p.userData.rollers = rollers;
  return p;
}
// Звери у дороги: простые формы и маленькие точки глаз
const ANIMAL_BUILDERS = {
  cow(p, arms) {
    const white = surface("#f6f4ee", 0, 0.7),
      black = surface("#23252a", 0, 0.7),
      pink = surface("#f3a8b4", 0, 0.6);
    ell(p, 0, 1.2, 0, 0.6, 0.62, 1.1, white);
    ell(p, 0.3, 1.45, 0.3, 0.42, 0.34, 0.45, black);
    ell(p, -0.32, 1.15, -0.3, 0.36, 0.34, 0.4, black);
    ell(p, 0, 1.55, -1.15, 0.4, 0.42, 0.5, white);
    ell(p, 0, 1.38, -1.55, 0.3, 0.22, 0.2, pink);
    for (const s of [-1, 1]) {
      for (const z of [-0.75, 0.75]) cyl(p, s * 0.36, 0.42, z, 0.13, 0.11, 0.84, white, "y", 8);
      cyl(p, s * 0.26, 2.02, -1.1, 0.03, 0.06, 0.24, surface("#e8dcc0", 0, 0.5), "y", 6);
      ell(p, s * 0.2, 1.68, -1.56, 0.045, 0.045, 0.045, black);
    }
    const tail = new T.Group();
    tail.position.set(0, 1.5, 1.08);
    rod(tail, [0, 0, 0], [0, -0.7, 0.14], 0.03, white);
    bake(tail);
    arms.add(tail);
  },
  sheep(p, arms) {
    const wool = surface("#fbf8f1", 0, 0.9),
      black = surface("#22242a", 0, 0.7);
    ell(p, 0, 0.95, 0, 0.62, 0.6, 0.82, wool);
    for (const [x, y, z] of [[0.4, 1.3, 0.3], [-0.4, 1.3, -0.3], [0.45, 0.95, -0.5], [-0.45, 0.95, 0.5], [0, 1.45, 0]])
      ell(p, x, y, z, 0.36, 0.36, 0.36, wool);
    ell(p, 0, 1.15, -0.88, 0.28, 0.3, 0.34, black);
    for (const s of [-1, 1]) for (const z of [-0.5, 0.5]) cyl(p, s * 0.3, 0.3, z, 0.07, 0.06, 0.6, black, "y", 6);
    const ear = new T.Group();
    ear.position.set(0, 1.28, -0.88);
    for (const s of [-1, 1]) ell(ear, s * 0.34, 0, 0, 0.16, 0.07, 0.09, black);
    bake(ear);
    arms.add(ear);
  },
  dog(p, arms) {
    const fur = surface("#b9793f", 0, 0.75),
      light = surface("#f0d6ad", 0, 0.75),
      black = surface("#191b20", 0, 0.5);
    ell(p, 0, 0.7, 0.1, 0.32, 0.36, 0.62, fur);
    ell(p, 0, 1.08, -0.5, 0.32, 0.32, 0.34, fur);
    ell(p, 0, 0.98, -0.82, 0.16, 0.13, 0.2, light);
    ell(p, 0, 1.02, -1.0, 0.055, 0.05, 0.05, black);
    for (const s of [-1, 1]) {
      for (const z of [-0.3, 0.5]) cyl(p, s * 0.2, 0.26, z, 0.07, 0.06, 0.52, fur, "y", 6);
      ell(p, s * 0.32, 1.18, -0.5, 0.09, 0.24, 0.14, surface("#7c4d27", 0, 0.75));
      ell(p, s * 0.13, 1.17, -0.8, 0.035, 0.035, 0.035, black);
    }
    const tail = new T.Group();
    tail.position.set(0, 0.95, 0.68);
    rod(tail, [0, 0, 0], [0, 0.42, 0.24], 0.05, fur);
    bake(tail);
    arms.add(tail);
  },
  camel(p, arms) {
    const fur = surface("#d6a765", 0, 0.8),
      dark = surface("#8f6a3c", 0, 0.8);
    ell(p, 0, 1.7, 0, 0.58, 0.62, 1.15, fur);
    ell(p, 0, 2.4, 0.42, 0.34, 0.5, 0.42, fur);
    ell(p, 0, 2.3, -0.42, 0.3, 0.42, 0.36, fur);
    rod(p, [0, 1.8, -1.0], [0, 2.8, -1.55], 0.17, fur);
    ell(p, 0, 2.92, -1.78, 0.2, 0.2, 0.42, fur);
    for (const s of [-1, 1]) {
      for (const z of [-0.75, 0.75]) cyl(p, s * 0.35, 0.65, z, 0.1, 0.08, 1.3, fur, "y", 6);
      ell(p, s * 0.2, 3.02, -1.86, 0.04, 0.04, 0.04, dark);
    }
    const tail = new T.Group();
    tail.position.set(0, 1.95, 1.14);
    rod(tail, [0, 0, 0], [0, -0.6, 0.1], 0.03, dark);
    bake(tail);
    arms.add(tail);
  },
  penguin(p, arms) {
    const black = surface("#1d2129", 0.1, 0.45),
      white = surface("#f8fbfd", 0, 0.5),
      orange = surface("#ff9a2e", 0, 0.5);
    ell(p, 0, 0.75, 0, 0.42, 0.72, 0.38, black);
    ell(p, 0, 0.68, -0.14, 0.32, 0.58, 0.28, white);
    ell(p, 0, 1.45, 0, 0.3, 0.3, 0.3, black);
    ell(p, 0, 1.4, -0.32, 0.1, 0.05, 0.14, orange);
    for (const s of [-1, 1]) {
      ell(p, s * 0.16, 0.05, -0.16, 0.15, 0.05, 0.22, orange);
      ell(p, s * 0.12, 1.53, -0.27, 0.035, 0.035, 0.035, white);
      const wing = new T.Group();
      wing.name = "wave";
      wing.position.set(s * 0.42, 1.08, 0);
      ell(wing, s * 0.1, -0.32, 0, 0.09, 0.4, 0.18, black);
      bake(wing);
      arms.add(wing);
    }
  },
  crab(p, arms) {
    const red = surface("#ef4632", 0.1, 0.45),
      black = surface("#14161a", 0.1, 0.4);
    ell(p, 0, 0.5, 0, 0.7, 0.32, 0.5, red);
    for (const s of [-1, 1]) {
      for (const z of [-0.25, 0, 0.25]) rod(p, [s * 0.55, 0.42, z], [s * 1.0, 0.04, z * 1.4], 0.04, red);
      cyl(p, s * 0.2, 0.86, -0.32, 0.025, 0.025, 0.3, red, "y", 6);
      ell(p, s * 0.2, 1.02, -0.32, 0.06, 0.06, 0.06, black);
      const claw = new T.Group();
      claw.name = "wave";
      claw.position.set(s * 0.68, 0.55, -0.2);
      rod(claw, [0, 0, 0], [s * 0.36, 0.42, -0.1], 0.06, red);
      ell(claw, s * 0.42, 0.58, -0.12, 0.2, 0.26, 0.13, red);
      bake(claw);
      arms.add(claw);
    }
  },
  bunny(p, arms) {
    const fur = surface("#fdf3fa", 0, 0.8),
      pink = surface("#ff9ec9", 0, 0.6),
      black = surface("#14161a", 0.1, 0.4);
    ell(p, 0, 0.62, 0, 0.42, 0.52, 0.42, fur);
    ell(p, 0, 1.28, -0.05, 0.36, 0.34, 0.34, fur);
    ell(p, 0, 1.2, -0.38, 0.07, 0.05, 0.05, pink);
    ell(p, 0, 0.6, 0.44, 0.16, 0.16, 0.16, fur);
    for (const s of [-1, 1]) {
      ell(p, s * 0.2, 0.08, -0.14, 0.14, 0.08, 0.26, fur);
      ell(p, s * 0.14, 1.36, -0.32, 0.035, 0.035, 0.035, black);
      const ear = new T.Group();
      ear.position.set(s * 0.15, 1.56, 0);
      ell(ear, 0, 0.36, 0, 0.1, 0.4, 0.06, fur);
      ell(ear, 0, 0.36, -0.045, 0.055, 0.28, 0.03, pink);
      bake(ear);
      arms.add(ear);
      const paw = new T.Group();
      paw.name = "wave";
      paw.position.set(s * 0.38, 0.92, -0.1);
      ell(paw, s * 0.08, -0.16, 0, 0.09, 0.22, 0.09, fur);
      bake(paw);
      arms.add(paw);
    }
  },
  robot(p, arms) {
    const steel = surface("#c4cdd6", 0.85, 0.3),
      teal = lamp("#27e6ff", 1.4);
    box(p, 0, 0.85, 0, 0.8, 0.82, 0.55, steel, 0.08);
    box(p, 0, 1.55, 0, 0.62, 0.48, 0.5, steel, 0.08);
    box(p, 0, 1.56, -0.26, 0.42, 0.1, 0.02, teal);
    box(p, 0, 0.9, -0.29, 0.34, 0.2, 0.02, teal);
    rod(p, [0, 1.8, 0], [0, 2.15, 0], 0.02, steel);
    ell(p, 0, 2.2, 0, 0.07, 0.07, 0.07, teal);
    for (const s of [-1, 1]) {
      box(p, s * 0.22, 0.24, 0, 0.22, 0.48, 0.3, steel, 0.04);
      const arm = new T.Group();
      arm.name = "wave";
      arm.position.set(s * 0.46, 1.16, 0);
      rod(arm, [0, 0, 0], [s * 0.1, -0.6, 0], 0.07, steel);
      bake(arm);
      arms.add(arm);
    }
  },
};
export function animalModel(kind) {
  const p = new T.Group(),
    arms = new T.Group();
  ANIMAL_BUILDERS[kind](p, arms);
  bake(p);
  const body = flatten(p);
  while (p.children.length) p.remove(p.children[0]);
  p.add(body.children[0]);
  p.add(arms);
  p.userData.moving = arms.children;
  return p;
}
// Съёмная мигалка на крышу из тюнинга
export function addBeaconBar(model) {
  const bounds = new T.Box3();
  model.updateWorldMatrix(true, true);
  model.traverseVisible((n) => {
    if (n.isMesh && n.name !== "blob") bounds.expandByObject(n);
  });
  const holder = new T.Group();
  holder.name = "addonBeacon";
  const y = bounds.max.y + 0.09,
    z = (bounds.min.z + bounds.max.z) / 2;
  box(holder, 0, y - 0.07, z, 1.04, 0.05, 0.22, trim, 0.02);
  lightbar(holder, y, z);
  bake(holder);
  holder.traverse((n) => {
    if (n.isMesh && n.name.startsWith("beacon")) model.userData.beacons.push(n);
  });
  holder.visible = false;
  model.add(holder);
  model.userData.parts.addonBeacon = holder;
}
// Ночью и в туннелях задние огни и фары светятся заметнее
export function setCarLamps(k) {
  tail.emissiveIntensity = 0.55 + 2.2 * k;
}
export function helicopter() {
  const p = new T.Group(),
    red = surface("#e8321a", 0.3, 0.32),
    white = surface("#f4f6f8", 0.3, 0.35);
  loft(p, [
    { z: -2.5, w: 0.5, b: 0.95, t: 1.35 },
    { z: -1.85, w: 1.3, b: 0.45, t: 1.85 },
    { z: -0.6, w: 1.8, b: 0.3, t: 2.2 },
    { z: 0.7, w: 1.6, b: 0.42, t: 2.2 },
    { z: 1.5, w: 0.7, b: 1.2, t: 2.1 },
    { z: 2.1, w: 0.34, b: 1.6, t: 2.0 },
  ], red, 3);
  loft(p, [
    { z: -2.52, w: 0.5, b: 0.98, t: 1.32 },
    { z: -1.9, w: 1.26, b: 0.72, t: 1.88 },
    { z: -1.0, w: 1.7, b: 0.86, t: 2.14 },
    { z: -0.75, w: 1.74, b: 1.0, t: 2.14 },
  ], glass, 3);
  loft(p, [
    { z: 2.0, w: 0.36, b: 1.6, t: 2.0 },
    { z: 4.0, w: 0.2, b: 1.75, t: 1.98 },
    { z: 6.2, w: 0.1, b: 1.85, t: 1.97 },
  ], white, 3);
  fin(p, [[5.6, 1.9], [6.45, 1.95], [6.75, 3.0], [6.3, 3.0]], 0, 0.08, red);
  box(p, 0, 2.0, 5.6, 1.5, 0.05, 0.42, white, 0.015);
  cyl(p, 0, 2.5, 0, 0.1, 0.13, 0.65, trim, "y", 10);
  box(p, 0, 2.3, 0.1, 1.05, 0.28, 1.5, trim, 0.1);
  for (const s of [-1, 1]) {
    rod(p, [s * 0.55, 0.55, -0.7], [s * 0.95, 0.05, -0.75], 0.03, trim);
    rod(p, [s * 0.55, 0.55, 0.6], [s * 0.95, 0.05, 0.65], 0.03, trim);
    rod(p, [s * 0.95, 0.05, -1.7], [s * 0.95, 0.05, 1.5], 0.045, trim);
  }
  bake(p);
  const rotor = new T.Group();
  rotor.name = "rotor";
  rotor.position.y = 2.82;
  p.add(rotor);
  for (let i = 0; i < 4; i++) {
    const blade = box(rotor, 0, 0, 0, 12, 0.03, 0.34, trim);
    blade.rotation.y = (i * Math.PI) / 2;
  }
  bake(rotor);
  const blur = new T.Mesh(
    new T.CircleGeometry(6, 28),
    new T.MeshBasicMaterial({
      color: "#2a2f36",
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  blur.rotation.x = -Math.PI / 2;
  blur.position.y = 2.82;
  p.add(blur);
  const back = new T.Group();
  back.name = "tailRotor";
  back.position.set(0.14, 2.75, 6.5);
  p.add(back);
  for (let i = 0; i < 2; i++) {
    const blade = box(back, 0, 0, 0, 0.02, 1.8, 0.12, trim);
    blade.rotation.x = (i * Math.PI) / 2;
  }
  bake(back);
  p.userData.rotor = rotor;
  p.userData.tailRotor = back;
  return p;
}
// Большой грузовой теплоход с цветными контейнерами
export function shipModel() {
  const p = new T.Group(),
    hull = surface("#21456b", 0.3, 0.5),
    belly = surface("#b53a2a", 0.2, 0.6),
    white = surface("#f4f6f8", 0.2, 0.5),
    colors = ["#ff4f7e", "#ffc21a", "#2fbf71", "#2f9bff", "#ff7a1a", "#8a5cff"];
  loft(p, [
    { z: -27, w: 1, b: 4, t: 8.6 },
    { z: -22, w: 8, b: 1.6, t: 8.3 },
    { z: -10, w: 13, b: 0.6, t: 8 },
    { z: 16, w: 13, b: 0.6, t: 8 },
    { z: 25, w: 9, b: 2, t: 8.2 },
  ], hull, 6);
  loft(p, [
    { z: -24, w: 5, b: 0, t: 2.2 },
    { z: -10, w: 13.2, b: -0.2, t: 2 },
    { z: 16, w: 13.2, b: -0.2, t: 2 },
    { z: 24, w: 9.2, b: 0, t: 2.2 },
  ], belly, 6);
  let k = 0;
  for (let z = -16; z < 9; z += 6.4)
    for (let level = 0; level < 3; level++)
      for (const x of [-4, 0, 4]) {
        if (level === 2 && (k + z) % 2 === 0) continue;
        box(p, x, 9.5 + level * 2.55, z, 3.8, 2.45, 6, surface(colors[k++ % 6], 0.25, 0.5), 0.03);
      }
  box(p, 0, 12.5, 18.5, 11, 9, 7, white, 0.2);
  box(p, 0, 17.4, 17, 13, 1, 4, white, 0.1);
  box(p, 0, 17.4, 15.2, 12.6, 0.9, 0.1, glass);
  for (let i = -4; i <= 4; i++) box(p, i * 1.2, 13, 14.95, 0.8, 1, 0.08, glass);
  cyl(p, 0, 19.5, 21, 1.1, 1.3, 6, surface("#ff7a1a", 0.2, 0.5), "y", 16);
  box(p, 0, 22, 21, 2.4, 0.9, 2.4, trim, 0.05);
  // Белый след на воде
  const foam = new T.Mesh(
    new T.PlaneGeometry(18, 70),
    new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.32, depthWrite: false }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.2, 50);
  bake(p);
  p.add(foam);
  return p;
}
// Поезд для виадука под большим мостом: паровозик и цветные вагоны
export function trainModel() {
  const p = new T.Group(),
    loco = vehicle("train"),
    wagons = new T.Group(),
    colors = ["#2f9bff", "#ffc21a", "#2fbf71", "#ff4f7e", "#8a5cff", "#ff7a1a"];
  loco.scale.setScalar(1.25);
  p.add(loco);
  for (let i = 0; i < 7; i++) {
    const z = 10 + i * 10.6,
      color = surface(colors[i % 6], 0.2, 0.45);
    box(wagons, 0, 2.1, z, 2.5, 2.3, 9.6, color, 0.2);
    box(wagons, 0, 3.32, z, 2.1, 0.18, 9.2, trim, 0.06);
    box(wagons, 0, 0.9, z, 2.0, 0.4, 9.4, trim, 0.05);
    for (const s of [-1, 1]) {
      box(wagons, s * 1.26, 2.45, z, 0.03, 0.8, 7.8, glass, 0.02);
      for (const dz of [-3.2, 3.2])
        cyl(wagons, s * 0.9, 0.5, z + dz, 0.45, 0.45, 0.2, trim, "x", 14);
    }
  }
  bake(wagons);
  p.add(wagons);
  p.userData.loco = loco;
  return p;
}
// Вдали машина — одна сетка с цветом в вершинах: одна отрисовка вместо двадцати
const farMaterial = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.42,
  metalness: 0.2,
});
const paintable = (n) =>
  n.isMesh && !n.isInstancedMesh && n.name !== "blob" && !n.material.transparent;
// Копия детали в координатах машины: цвет материала переходит в вершины
function tintedCopy(n) {
  const geo = (n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone()).applyMatrix4(n.matrixWorld);
  for (const name of Object.keys(geo.attributes))
    if (!["position", "normal"].includes(name)) geo.deleteAttribute(name);
  const { r, g, b } = n.material.color,
    colors = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = r;
    colors[i + 1] = g;
    colors[i + 2] = b;
  }
  geo.setAttribute("color", new T.BufferAttribute(colors, 3));
  return geo;
}
function flatten(p) {
  const parts = [];
  p.updateWorldMatrix(true, true);
  p.traverseVisible((n) => {
    if (paintable(n)) parts.push(tintedCopy(n));
  });
  const merged = new T.Mesh(mergeGeometries(parts), farMaterial);
  parts.forEach((g) => g.dispose());
  merged.castShadow = false;
  merged.receiveShadow = false;
  const out = new T.Group();
  out.add(merged);
  return out;
}
// Обломок с центром в начале координат: так он вращается вокруг себя
function wreckPart(geometry, flags = {}) {
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new T.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingSphere();
  return { geometry, x: center.x, y: center.y, z: center.z, radius: geometry.boundingSphere.radius, ...flags };
}
// Длинные треугольники дробятся: иначе разрез проходит гребёнкой вдоль узких полос кузова
const TEAR_STEP = 0.4;
function tessellate(geometry) {
  const source = ["position", "normal", "color"].map((n) => geometry.attributes[n].array),
    pos = source[0],
    triangles = pos.length / 9,
    limit = TEAR_STEP * TEAR_STEP,
    extra = source.map(() => []),
    short = new Uint8Array(triangles);
  const gap = (i, j) => (pos[i] - pos[j]) ** 2 + (pos[i + 1] - pos[j + 1]) ** 2 + (pos[i + 2] - pos[j + 2]) ** 2;
  // Вершина длинного треугольника: девять чисел подряд — положение, нормаль, цвет
  const corner = (i) => source.flatMap((array) => [array[i], array[i + 1], array[i + 2]]);
  const between = (p, q) => p.map((v, i) => (v + q[i]) / 2);
  const span = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const split = (p, q, r) => {
    const ab = span(p, q),
      bc = span(q, r),
      ca = span(r, p),
      longest = Math.max(ab, bc, ca);
    if (longest <= limit) {
      for (const v of [p, q, r])
        for (let s = 0; s < 3; s++) extra[s].push(v[s * 3], v[s * 3 + 1], v[s * 3 + 2]);
    } else if (longest === ab) {
      const m = between(p, q);
      split(p, m, r);
      split(m, q, r);
    } else if (longest === bc) {
      const m = between(q, r);
      split(p, q, m);
      split(p, m, r);
    } else {
      const m = between(r, p);
      split(p, q, m);
      split(m, q, r);
    }
  };
  // Большинство треугольников и так мелкие: они копируются как есть
  let kept = 0;
  for (let t = 0; t < triangles; t++) {
    const i = t * 9;
    if (gap(i, i + 3) <= limit && gap(i + 3, i + 6) <= limit && gap(i + 6, i) <= limit) {
      short[t] = 1;
      kept++;
    } else split(corner(i), corner(i + 3), corner(i + 6));
  }
  return source.map((array, s) => {
    const out = new Float32Array(kept * 9 + extra[s].length);
    let at = 0;
    for (let t = 0; t < triangles; t++)
      if (short[t]) for (let k = 0; k < 9; k++) out[at++] = array[t * 9 + k];
    out.set(extra[s], at);
    return out;
  });
}
// Кузов режется сеткой с неровной линией разреза: края кусков получаются рваными.
// Низ посередине остаётся целым, остальное разлетается панелями
function sliceBody(body) {
  body.computeBoundingBox();
  const { min, max } = body.boundingBox,
    size = body.boundingBox.getSize(new T.Vector3()),
    rows = Math.min(6, Math.max(3, Math.round(size.z / 1.25))),
    middleX = (min.x + max.x) / 2,
    middleY = min.y + size.y * 0.52,
    [pos, nor, col] = tessellate(body),
    triangles = pos.length / 9,
    cells = new Uint8Array(triangles),
    counts = new Uint32Array(1 + 4 * rows);
  for (let t = 0; t < triangles; t++) {
    const i = t * 9,
      x = (pos[i] + pos[i + 3] + pos[i + 6]) / 3,
      y = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3,
      z = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3,
      wobble = Math.sin(y * 4.1 + z * 2.3) * 0.16 + Math.sin(z * 7.3 - x * 3.1) * 0.09,
      tilt = Math.sin(x * 5.3 + z * 3.7) * 0.13,
      along = (z + wobble - min.z) / (size.z || 1),
      high = y + tilt > middleY,
      cell = along > 0.2 && along < 0.8 && !high
        ? 0
        : 1 + (x + wobble > middleX ? 1 : 0) + (high ? 2 : 0) + 4 * Math.max(0, Math.min(rows - 1, Math.floor(along * rows)));
    cells[t] = cell;
    counts[cell]++;
  }
  const slices = Array.from(counts, (count) => count && {
      p: new Float32Array(count * 9),
      n: new Float32Array(count * 9),
      c: new Float32Array(count * 9),
      at: 0,
    });
  for (let t = 0; t < triangles; t++) {
    const slice = slices[cells[t]],
      i = t * 9;
    for (let k = 0; k < 9; k++, slice.at++) {
      slice.p[slice.at] = pos[i + k];
      slice.n[slice.at] = nor[i + k];
      slice.c[slice.at] = col[i + k];
    }
  }
  const out = [];
  slices.forEach((slice, cell) => {
    if (!slice) return;
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(slice.p, 3));
    g.setAttribute("normal", new T.BufferAttribute(slice.n, 3));
    g.setAttribute("color", new T.BufferAttribute(slice.c, 3));
    out.push(wreckPart(g, { hull: cell === 0 }));
  });
  return out;
}
// Из чего состоит взорванная машина: колёса отдельно, кузов кусками. Считается один раз на модель
const wrecks = new Map();
export function wreckParts(type) {
  if (wrecks.has(type)) return wrecks.get(type);
  const model = vehicle(type, "traffic"),
    body = [],
    wheels = new Map();
  model.updateWorldMatrix(true, true);
  model.traverseVisible((n) => {
    if (!paintable(n)) return;
    let axle = n.parent;
    while (axle && axle.name !== "axle") axle = axle.parent;
    if (!axle) body.push(tintedCopy(n));
    else {
      if (!wheels.has(axle)) wheels.set(axle, []);
      wheels.get(axle).push(tintedCopy(n));
    }
  });
  const list = [];
  for (const parts of wheels.values())
    list.push(wreckPart(mergeGeometries(parts), { wheel: true }));
  const merged = mergeGeometries(body),
    bounds = new T.Box3().setFromBufferAttribute(merged.attributes.position);
  list.push(...sliceBody(merged));
  const wreck = { list, length: bounds.max.z - bounds.min.z, middle: (bounds.min.z + bounds.max.z) / 2 };
  wrecks.set(type, wreck);
  return wreck;
}
const CONCEPT_TYPES = ["racer", "coupe", "hyper", "comet", "neon"];
// Модель догрузилась позже старта: простые заготовки больше не нужны
export function forgetConceptCars() {
  for (const type of CONCEPT_TYPES) templates.delete(type);
  return CONCEPT_TYPES;
}
// mode: не задан — машина игрока, "traffic" — встречная вблизи (всегда лёгкая), true — вдали
export function vehicle(type, mode = false) {
  const lod = !!mode,
    key = type + (mode === true ? "-distant" : mode ? "-near" : "");
  if (mode === true && !templates.has(key)) {
    const near = vehicle(type, "traffic");
    templates.set(key, flatten(near));
  }
  if (!templates.has(key)) {
    let p = new T.Group();
    const paint = bodyPaint(CARS[type].color, type === "tank");
    if (CONCEPT_TYPES.includes(type) && concept && !lod) {
      p = conceptModel(type);
      if (CONCEPT_SHAPE[type])
        p.children[0].scale.multiply(new T.Vector3(...CONCEPT_SHAPE[type]));
      const bounds = new T.Box3().setFromObject(p),
        size = bounds.getSize(new T.Vector3());
      // Салон убран: тёмная сердцевина не даёт фону светиться сквозь щели кузова
      const core = new T.Mesh(sphereCore, surface("#101317", 0, 0.9));
      core.position.set(0, size.y * 0.36, (bounds.min.z + bounds.max.z) / 2);
      core.scale.set(size.x * 0.44, size.y * 0.27, size.z * 0.44);
      p.add(core);
      if (type === "coupe")
        wing(p, bounds.max.y - 0.3, bounds.max.z - 0.42, 1.55, surface("#10325f", 0.5, 0.3));
      if (type === "hyper")
        wing(p, bounds.max.y - 0.02, bounds.max.z - 0.4, 2.0, surface("#23201e", 0.5, 0.3));
      if (type === "comet")
        wing(p, bounds.max.y - 0.04, bounds.max.z - 0.4, 2.05, surface("#23201e", 0.5, 0.3));
      if (type === "neon") {
        // Подсветка под днищем и по бортам
        box(p, 0, 0.05, (bounds.min.z + bounds.max.z) / 2, size.x * 0.66, 0.02, size.z * 0.7, lamp("#27e6ff", 1.4));
        for (const s of [-1, 1])
          box(p, s * size.x * 0.48, size.y * 0.36, 0, 0.03, 0.05, size.z * 0.5, lamp("#ff37c7", 2));
      }
    } else {
      if (type === "tank") tank(p, paint);
      else if (type === "truck") truck(p, paint);
      else if (type === "tractor") tractor(p, paint);
      else if (["fire", "ambulance", "bus", "icecream", "van"].includes(type))
        commercial(p, type, paint);
      else if (SPECIAL[CARS[type].kind]) SPECIAL[CARS[type].kind](p, paint);
      else roadCar(p, type, paint);
      bake(p);
    }
    // Тень отбрасывают только крупные части, мелочь её не меняет
    p.traverse((n) => {
      if (!n.isMesh || !n.geometry) return;
      n.geometry.computeBoundingSphere();
      if (n.geometry.boundingSphere.radius < 0.9) n.castShadow = false;
    });
    // Мягкая контактная тень: машина стоит на земле, а не парит над ней
    const bounds = new T.Box3(),
      blob = new T.Mesh(blobPlane, blobShadow());
    p.updateWorldMatrix(true, true);
    // Скрытые детали вроде крыльев не должны раздувать тень
    p.traverseVisible((n) => {
      if (n.isMesh) bounds.expandByObject(n);
    });
    const size = bounds.getSize(new T.Vector3());
    blob.name = "blob";
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(
      (bounds.min.x + bounds.max.x) / 2,
      0.025,
      (bounds.min.z + bounds.max.z) / 2,
    );
    const spread = CARS[type].kind === "ufo" ? 0.82 : 1;
    blob.scale.set(size.x * 1.34 * spread, size.z * 1.22 * spread, 1);
    blob.renderOrder = -1;
    p.add(blob);
    templates.set(key, p);
  }
  const clone = templates.get(key).clone(true);
  clone.userData.wheels = [];
  clone.userData.beacons = [];
  clone.userData.parts = {};
  clone.traverse((n) => {
    if (n.name) clone.userData.parts[n.name] = n;
    if (n.name === "axle" || /^Wheel(Front|Rear)[LR]$/.test(n.name)) {
      if (n.name.startsWith("WheelFront")) {
        spinDir.copy(spinAxis).applyQuaternion(n.quaternion);
        let angle = Math.atan2(spinDir.y, spinDir.x);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        n.quaternion.premultiply(straightQ.setFromAxisAngle(turnAxis, -angle));
      }
      n.userData.rest = n.quaternion.toArray();
      clone.userData.wheels.push(n);
    }
    if (n.name.startsWith("beacon") && n.isMesh) {
      n.material = n.material.clone();
      clone.userData.beacons.push(n);
    }
  });
  return clone;
}
export function pose(model, type, time, travel, ability, steer, recoil, stroke = 0) {
  for (const wheel of model.userData.wheels) {
    wheel.quaternion
      .fromArray(wheel.userData.rest)
      .multiply(
        spinQ.setFromAxisAngle(
          spinAxis,
          -travel / (type === "tractor" ? 0.7 : 0.4),
        ),
      );
  }
  if (type === "tank") animateTracks(model, travel);
  const part = model.userData.parts;
  if (part.trailer) part.trailer.rotation.y = steer * 0.35;
  if (part.blade) {
    const extend = bladeExtension(stroke);
    part.blade.position.set(0, 0.62 - extend * 0.5, -1.35 * extend);
    part.blade.rotation.x = -0.05 + 0.19 * Math.sin(stroke * Math.PI) * extend;
  }
  if (part.gun) part.gun.position.z = recoil * 0.022;
  if (part.roll) part.roll.rotation.x = part.rollRear.rotation.x = -travel / 0.92;
  if (part.drum) part.drum.rotation.z = time * (ability === "tornado" ? 9 : 1.6);
  if (part.reel) part.reel.rotation.x = -time * (ability === "harvest" ? 9 : 2.5);
  if (part.bed)
    part.bed.rotation.x = ability === "tip" ? 0.75 : 0;
  if (part.arm)
    part.arm.rotation.x =
      ability === "scoop" ? -0.42 : Math.sin(time * 1.4) * 0.05;
  if (part.arm) part.arm.rotation.y = ability === "scoop" ? 0.65 * Math.sin(time * 3.5) : 0;
  if (part.saucer) {
    part.saucer.position.y = 0.95 + Math.sin(time * 3) * 0.09;
    part.saucer.rotation.z = steer * 0.8;
    part.lights.rotation.y = time * 2.4;
    part.beam.visible = ability === "beam";
  }
  if (part.wingL) {
    const flying = ability === "fly",
      flap = Math.sin(time * 34) * 0.4;
    part.wingL.visible = part.wingR.visible = flying;
    part.wingL.rotation.z = -flap;
    part.wingR.rotation.z = flap;
  }
  for (const lamp of model.userData.beacons) {
    const lit = Math.sin(time * 15) > 0 === (lamp.name === "beaconRed");
    lamp.material.emissiveIntensity = lit
      ? ability === "siren"
        ? 4
        : 1.7
      : 0.12;
  }
}

const treadPose = new T.Object3D();
function animateTracks(model, travel) {
  const straight = 3.24,
    radius = 0.49,
    arc = Math.PI * radius,
    length = 2 * (straight + arc);
  model.traverse((n) => {
    if (n.name !== "trackLinks") return;
    for (let i = 0; i < n.count; i++) {
      let u = ((((i / n.count) * length + travel) % length) + length) % length,
        z,
        y,
        angle;
      if (u < straight) {
        z = -straight / 2 + u;
        y = 1.14;
        angle = 0;
      } else if ((u -= straight) < arc) {
        angle = u / radius;
        z = straight / 2 + Math.sin(angle) * radius;
        y = 0.65 + Math.cos(angle) * radius;
      } else if ((u -= arc) < straight) {
        angle = Math.PI;
        z = straight / 2 - u;
        y = 0.16;
      } else {
        angle = Math.PI + (u - straight) / radius;
        z = -straight / 2 + Math.sin(angle) * radius;
        y = 0.65 + Math.cos(angle) * radius;
      }
      treadPose.position.set(0, y, z);
      treadPose.rotation.x = angle;
      treadPose.updateMatrix();
      n.setMatrixAt(i, treadPose.matrix);
    }
    n.instanceMatrix.needsUpdate = true;
  });
}
