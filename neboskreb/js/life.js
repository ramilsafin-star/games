// Жизнь в готовых домах: вход и жильцы, садовник на балконе, сосед машет рукой, зонт у бассейна,
// пловец, водолаз в аквариуме, вертолёт на площадке и гости, которые приезжают к открытию.
// Лиц у человечков нет: на таком расстоянии хватает головы и яркой одежды
import * as T from "../vendor/three/three.module.min.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";
import { FLOOR_W } from "./floors.js";

const HALF = FLOOR_W / 2;
const WALK_Z = 26.8;
const CURB_Z = 40.3;
const LANE_Z = 41.7;
const PAD = 9.5;
const PEOPLE_MAX = 170;
const TOWERS_MAX = 48;
// Дальше этого расстояния от камеры ноги и руки уже не разглядеть
const LIMBS_NEAR = 240;
const DROPS_NEAR = 170;

const palette = (list) => list.map((c) => new T.Color(c));
const CLOTHES = palette(["#e8503f", "#2f7fd1", "#ffc23c", "#3fb26a", "#b56be0", "#ff8a3c", "#22a6b3", "#f7f7f2", "#ff6fa8"]);
const PANTS = palette(["#2b3a55", "#3b3f46", "#5a4632", "#27506b", "#6b3f5a"]);
const SKIN = palette(["#f6cfa8", "#e3aa7c", "#b97a50", "#8a5a3b", "#f2c39b"]);
const CANOPY = palette(["#e23b2e", "#2f7fd1", "#3fb26a", "#ff8a3c", "#b56be0", "#22a6b3"]);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const tmpRoot = new T.Matrix4();
const tmpLocal = new T.Matrix4();
const tmpOut = new T.Matrix4();
const tmpQ = new T.Quaternion();
const tmpE = new T.Euler();
const tmpV = new T.Vector3();
const tmpS = new T.Vector3();
const tmpC = new T.Color();

function painted(g, color) {
  tmpC.set(color);
  const out = g.index ? g.toNonIndexed() : g;
  if (out.attributes.uv) out.deleteAttribute("uv");
  const n = out.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  out.setAttribute("color", new T.BufferAttribute(a, 3));
  return out;
}
const box = (w, h, d, x, y, z, color) => painted(new T.BoxGeometry(w, h, d).translate(x, y, z), color);
const wheel = (r, x, y, z) => painted(new T.CylinderGeometry(r, r, 0.42, 12).rotateX(Math.PI / 2).translate(x, y, z), "#202226");

// Вход выступает из фасада: так он перекрывает и балконы, и кусты на первом этаже
function doorGeometry() {
  const list = [
    box(4.6, 3.2, 2.9, 0, 1.6, -1.45, "#f2efe8"),
    box(2.6, 2.5, 0.1, 0, 1.25, 0.03, "#22343f"),
    box(3, 0.18, 0.12, 0, 2.6, 0.03, "#c8a75f"),
    box(0.18, 2.5, 0.12, -1.4, 1.25, 0.03, "#c8a75f"),
    box(0.18, 2.5, 0.12, 1.4, 1.25, 0.03, "#c8a75f"),
    box(0.08, 2.5, 0.12, 0, 1.25, 0.03, "#c8a75f"),
    box(4.2, 0.14, 1.1, 0, 0.07, 0.55, "#cfcabd"),
    box(3.4, 0.14, 0.6, 0, 0.21, 0.3, "#dcd7ca")
  ];
  return mergeGeometries(list);
}

function umbrellaGeometry() {
  const cone = new T.ConeGeometry(2.3, 0.9, 10).toNonIndexed();
  cone.deleteAttribute("uv");
  const n = cone.attributes.position.count;
  const col = new Float32Array(n * 3);
  const a = new T.Color("#ff5d7e");
  const b = new T.Color("#fff6e3");
  for (let i = 0; i < n; i++) {
    const v = Math.atan2(cone.attributes.position.getZ(i), cone.attributes.position.getX(i));
    const stripe = Math.floor(((v + Math.PI * 2.05) / (Math.PI * 2)) * 10) % 2;
    (stripe ? a : b).toArray(col, i * 3);
  }
  // Полоса считается по грани, а не по вершине: весь треугольник одного цвета
  for (let i = 0; i < n; i += 3) {
    col.copyWithin(i * 3 + 3, i * 3, i * 3 + 3);
    col.copyWithin(i * 3 + 6, i * 3, i * 3 + 3);
  }
  cone.setAttribute("color", new T.BufferAttribute(col, 3));
  cone.computeVertexNormals();
  return cone;
}

function canGeometry() {
  return mergeGeometries([
    painted(new T.CylinderGeometry(0.2, 0.22, 0.34, 8), "#3fb26a"),
    box(0.08, 0.08, 0.5, 0, 0.08, 0.34, "#3fb26a"),
    box(0.2, 0.04, 0.04, 0, 0.26, 0, "#2c8a50")
  ]);
}

function busGeometry(body, stripe) {
  return mergeGeometries([
    box(11, 2.5, 2.7, 0, 1.85, 0, body),
    box(11.04, 0.22, 2.74, 0, 1.62, 0, stripe),
    box(10.4, 0.2, 2.4, 0, 3.2, 0, body),
    box(1.3, 2, 0.06, 3.6, 1.7, 1.41, "#27384a"),
    box(0.3, 0.3, 2.3, 5.45, 1, 0, "#fff3b0"),
    wheel(0.56, 3.4, 0.56, 1.28), wheel(0.56, 3.4, 0.56, -1.28), wheel(0.56, -3.4, 0.56, 1.28), wheel(0.56, -3.4, 0.56, -1.28)
  ]);
}

function vanGeometry() {
  return mergeGeometries([
    box(2.2, 2, 2.4, 2.7, 1.6, 0, "#e9eef2"),
    box(5.2, 2.8, 2.6, -1, 2, 0, "#ff8a3c"),
    box(5.24, 0.3, 2.64, -1, 1.2, 0, "#ffffff"),
    wheel(0.5, 2.6, 0.5, 1.2), wheel(0.5, 2.6, 0.5, -1.2), wheel(0.5, -2, 0.5, 1.2), wheel(0.5, -2, 0.5, -1.2)
  ]);
}

function taxiGeometry() {
  return mergeGeometries([
    box(4.6, 0.85, 2, 0, 0.85, 0, "#ffc21a"),
    box(4.62, 0.16, 2.02, 0, 1.02, 0, "#22262b"),
    box(0.7, 0.24, 0.32, -0.2, 2.12, 0, "#ffffff"),
    wheel(0.42, 1.5, 0.42, 0.92), wheel(0.42, 1.5, 0.42, -0.92), wheel(0.42, -1.5, 0.42, 0.92), wheel(0.42, -1.5, 0.42, -0.92)
  ]);
}

function makeHelicopter() {
  const body = mergeGeometries([
    painted(new T.SphereGeometry(1.7, 16, 12).scale(1.5, 1, 1), "#e23b2e"),
    painted(new T.SphereGeometry(1.25, 14, 10).scale(1, 0.8, 0.9).translate(1.4, 0.2, 0), "#a9dcf3"),
    box(5.4, 0.42, 0.42, -4, 0.5, 0, "#e23b2e"),
    box(1, 1.6, 0.14, -6.6, 1.1, 0, "#ffd23f"),
    box(5, 0.14, 0.22, 0, -2, 1.15, "#30343a"),
    box(5, 0.14, 0.22, 0, -2, -1.15, "#30343a"),
    box(0.14, 0.9, 0.14, 1, -1.5, 1.05, "#30343a"),
    box(0.14, 0.9, 0.14, -1, -1.5, 1.05, "#30343a"),
    box(0.14, 0.9, 0.14, 1, -1.5, -1.05, "#30343a"),
    box(0.14, 0.9, 0.14, -1, -1.5, -1.05, "#30343a"),
    painted(new T.CylinderGeometry(0.16, 0.16, 0.8, 8).translate(0, 2, 0), "#30343a")
  ]);
  const mesh = new T.Mesh(body, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.3 }));
  const rotor = new T.Mesh(new T.BoxGeometry(11, 0.07, 0.42), new T.MeshStandardMaterial({ color: "#2b2d31" }));
  rotor.position.y = 2.42;
  mesh.add(rotor);
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}

// Стёкла отдельно: ночью они светятся
const busGlass = () => mergeGeometries([new T.BoxGeometry(11.04, 0.95, 2.74).translate(0, 2.45, 0), new T.BoxGeometry(0.1, 1.25, 2.3).translate(5.53, 2.3, 0)]);

// На чём приезжают гости: exit — где они выходят относительно середины машины, если смотреть по ходу
const CARS = {
  bus: { make: () => busGeometry("#2f7fd1", "#ffffff"), glass: busGlass, riders: 5, size: 1, exit: 3.6 },
  school: { make: () => busGeometry("#ffc21a", "#22262b"), glass: busGlass, riders: 7, size: 0.72, exit: 3.6 },
  van: { make: vanGeometry, glass: () => new T.BoxGeometry(0.1, 0.9, 2.1).translate(3.82, 2.1, 0), riders: 3, size: 1, exit: -3.8, boxes: 2 },
  taxi: { make: taxiGeometry, glass: () => new T.BoxGeometry(2.4, 0.75, 1.8).translate(-0.2, 1.62, 0), riders: 2, size: 1, exit: 0 }
};

const outBack = (k) => {
  const s = 1.7;
  const q = k - 1;
  return 1 + (s + 1) * q * q * q + s * q * q;
};

export class Life {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.recs = new Map();
    this.people = [];
    this.trip = null;
    this.time = 0;
    this.doorsDirty = false;
    const copies = (g, mat, n, shadow = true) => {
      const m = new T.InstancedMesh(g, mat, n);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = shadow;
      m.setColorAt(0, tmpC.set("#ffffff"));
      scene.add(m);
      return m;
    };
    const tinted = new T.MeshStandardMaterial({ roughness: 0.72 });
    const paint = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 });
    this.doors = copies(doorGeometry(), paint, TOWERS_MAX);
    const canopy = mergeGeometries([new T.BoxGeometry(5.6, 0.24, 3.6).translate(0, 3.34, -0.3), new T.BoxGeometry(5.6, 0.3, 0.08).translate(0, 3.12, 1.46)]);
    this.canopies = copies(canopy, tinted, TOWERS_MAX);
    const lamps = mergeGeometries([new T.SphereGeometry(0.2, 10, 8).translate(-1.9, 2.4, 0.2), new T.SphereGeometry(0.2, 10, 8).translate(1.9, 2.4, 0.2)]);
    this.lampMat = new T.MeshBasicMaterial({ toneMapped: false });
    this.lamps = copies(lamps, this.lampMat, TOWERS_MAX, false);
    this.paths = copies(new T.BoxGeometry(1, 0.06, 1), new T.MeshStandardMaterial({ color: "#ddd6c4", roughness: 0.95 }), TOWERS_MAX, false);
    this.paths.receiveShadow = true;
    this.poles = copies(new T.CylinderGeometry(0.07, 0.07, 2.9, 6).translate(0, 1.45, 0), new T.MeshStandardMaterial({ color: "#e9e4d6", roughness: 0.5 }), TOWERS_MAX);
    this.umbrellas = copies(umbrellaGeometry(), paint, TOWERS_MAX);
    const body = new T.CylinderGeometry(0.23, 0.31, 0.95, 8);
    this.heads = copies(new T.IcosahedronGeometry(0.28, 1), tinted, PEOPLE_MAX);
    this.bodies = copies(body, tinted, PEOPLE_MAX);
    this.limbs = copies(new T.BoxGeometry(0.15, 1, 0.15).translate(0, -0.5, 0), tinted, PEOPLE_MAX * 4, false);
    this.cans = copies(canGeometry(), paint, TOWERS_MAX, false);
    this.boxes = copies(new T.BoxGeometry(0.72, 0.56, 0.56), new T.MeshStandardMaterial({ color: "#c89b62", roughness: 0.9 }), 12, false);
    this.heli = makeHelicopter();
    scene.add(this.heli);
    this.carGlass = new T.MeshBasicMaterial({ toneMapped: false });
    this.cars = {};
    for (const [kind, def] of Object.entries(CARS)) {
      const car = new T.Mesh(def.make(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.2 }));
      car.add(new T.Mesh(def.glass(), this.carGlass));
      car.castShadow = true;
      car.visible = false;
      car.rotation.y = Math.PI;
      scene.add(car);
      this.cars[kind] = car;
    }
  }

  // Дом закончен и находится рядом: fresh значит, что всё появляется прямо сейчас, на глазах
  enter(t, x0, fresh) {
    if (this.recs.has(t)) return;
    const first = t.floors[0];
    if (!first) return;
    const rec = {
      t,
      x0,
      door: { x: x0 + first.x, z: first.z + HALF + 1.7 },
      y0: first.y,
      k: fresh ? 0 : 1,
      color: CANOPY[t.plot % CANOPY.length],
      umbrella: null,
      parked: null,
      delay: fresh ? 0.35 : 0
    };
    this.recs.set(t, rec);
    this.doorsDirty = true;
    // Двое жильцов ходят по бульвару к дому и обратно
    for (let i = 0; i < 2; i++) {
      const p = this.person(rec, { kind: "walker", inward: i === 0, wait: fresh ? 1.6 + i * 2.4 : Math.random() * 5 });
      this.people.push(p);
    }
    const body = t.floors.filter((f) => !f.roofPart);
    const highest = (id, skipFirst) => {
      for (let i = body.length - 1; i >= (skipFirst ? 1 : 0); i--) if (body[i].id === id) return body[i];
      return null;
    };
    const garden = highest("garden");
    if (garden) this.people.push(this.person(rec, { kind: "gardener", pose: "water", x: x0 + garden.x + 4.15, y: garden.y + 0.3, z: garden.z + 6.5, rot: Math.PI / 2, tree: { x: x0 + garden.x + 6.7, y: garden.y + 2.1, z: garden.z + 6.7 }, emit: 0 }));
    const brick = highest("brick", true);
    if (brick) this.people.push(this.person(rec, { kind: "waver", pose: "wave", x: x0 + brick.x - 0.7, y: brick.y + 0.79, z: brick.z + 7.45, rot: 0 }));
    const aqua = highest("aqua");
    if (aqua) this.people.push(this.person(rec, { kind: "diver", pose: "swim", cx: x0 + aqua.x, cz: aqua.z, y: aqua.y + 2, size: 0.8, cloth: CLOTHES[6] }));
    const roof = t.roof ? t.floors.at(-1) : null;
    if (t.roof === "pool" && roof) {
      rec.umbrella = { x: x0 + roof.x + 6, y: roof.y + 0.9, z: roof.z + 0.8, k: fresh ? 0 : 1, wait: fresh ? 1.2 : 0 };
      this.people.push(this.person(rec, { kind: "swimmer", pose: "swim", cx: x0 + roof.x - 1.6, cz: roof.z + 2, y: roof.y + 0.86, size: 0.86, cloth: CLOTHES[0] }));
    }
    if (t.roof === "helipad" && roof) {
      rec.parked = this.heli.clone();
      rec.parked.position.set(x0 + roof.x, t.top + 2.15, roof.z);
      rec.parked.rotation.y = Math.PI;
      rec.parked.visible = !fresh;
      this.scene.add(rec.parked);
    }
  }

  leave(t) {
    const rec = this.recs.get(t);
    if (!rec) return;
    if (rec.parked) this.scene.remove(rec.parked);
    if (this.trip && this.trip.rec === rec) this.endTrip();
    this.people = this.people.filter((p) => p.rec !== rec);
    this.recs.delete(t);
    this.doorsDirty = true;
  }

  // Вертолёт, прилетевший в финале, остаётся на своей площадке
  park(t) {
    const rec = this.recs.get(t);
    if (rec && rec.parked) rec.parked.visible = true;
  }

  // Игрок пришёл посмотреть на дом: зонт раскрывается снова
  replay(t) {
    const rec = this.recs.get(t);
    if (rec && rec.umbrella) {
      rec.umbrella.k = 0;
      rec.umbrella.wait = 0.7;
    }
  }

  person(rec, o) {
    return Object.assign({ rec, x: 0, y: 0.34, z: 0, rot: 0, size: 0.88 + Math.random() * 0.22, show: 0, phase: Math.random() * 6, walking: false, pose: null, wait: 0, path: null, cloth: pick(CLOTHES), pants: pick(PANTS), skin: pick(SKIN) }, o);
  }

  setPath(p, points, speed) {
    p.path = points;
    p.at = 0;
    p.x = points[0][0];
    p.z = points[0][1];
    p.speed = speed;
    p.walking = true;
    p.done = 0;
    p.len = 0;
    for (let i = 1; i < points.length; i++) p.len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }

  // Шаг по дорожке; true, когда человек дошёл. В начале и в конце он плавно появляется и исчезает
  stepPath(p, dt) {
    let d = p.speed * dt;
    while (d > 0 && p.at < p.path.length - 1) {
      const n = p.path[p.at + 1];
      const dx = n[0] - p.x;
      const dz = n[1] - p.z;
      const L = Math.hypot(dx, dz);
      if (L < 1e-4 || L <= d) {
        p.x = n[0];
        p.z = n[1];
        p.at++;
        d -= L;
        p.done += L;
      } else {
        p.x += (dx / L) * d;
        p.z += (dz / L) * d;
        p.done += d;
        let turn = Math.atan2(dx, dz) - p.rot;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        p.rot += turn * (1 - Math.exp(-dt * 12));
        d = 0;
      }
    }
    p.show = Math.min(1, Math.min(p.done, p.len - p.done) / 0.55);
    p.y = Math.abs(p.x - p.rec.x0) < PAD && Math.abs(p.z) < PAD ? 0.52 : 0.34;
    p.phase += dt * p.speed * 2.9;
    return p.at >= p.path.length - 1;
  }

  sendWalker(p) {
    const r = p.rec;
    const side = Math.random() < 0.5 ? -1 : 1;
    const far = r.door.x + side * (15 + Math.random() * 19);
    const off = (Math.random() - 0.5) * 1.1;
    const walk = WALK_Z + (Math.random() - 0.5) * 2.2;
    const points = [[far, walk], [r.door.x + off, walk], [r.door.x + off, r.door.z + 0.35]];
    this.setPath(p, p.inward ? points : points.reverse(), 2.5 + Math.random() * 1);
  }

  // Гости подъезжают к дому и идут к двери
  visit(t, kind) {
    const rec = this.recs.get(t);
    if (!rec) return;
    if (this.trip) this.endTrip();
    const def = CARS[kind] || CARS.bus;
    const car = this.cars[kind] || this.cars.bus;
    const stop = rec.door.x + def.exit;
    car.position.set(stop + 230, 0.02, LANE_Z);
    car.visible = true;
    this.trip = { rec, def, car, stop, phase: "in", t: 0, sent: 0, v: 0, riders: [] };
  }

  endTrip() {
    const trip = this.trip;
    trip.car.visible = false;
    this.people = this.people.filter((p) => p.trip !== trip);
    this.trip = null;
  }

  stepTrip(dt) {
    const trip = this.trip;
    trip.t += dt;
    const { car, def, rec } = trip;
    if (trip.phase === "in") {
      const k = Math.min(1, trip.t / 3.6);
      car.position.x = trip.stop + 230 * Math.pow(1 - k, 2.4);
      if (k >= 1) {
        trip.phase = "stop";
        trip.t = 0;
        Sound.horn();
      }
    } else if (trip.phase === "stop") {
      if (trip.sent < def.riders && trip.t > 0.55 + trip.sent * 0.7) {
        const exit = rec.door.x + (Math.random() - 0.5) * 0.5;
        const off = (Math.random() - 0.5) * 1.3;
        const p = this.person(rec, { kind: "guest", trip, size: def.size * (0.92 + Math.random() * 0.16), carry: trip.sent < (def.boxes || 0), pose: trip.sent < (def.boxes || 0) ? "carry" : null });
        this.setPath(p, [[exit, CURB_Z], [rec.door.x + off, CURB_Z - 2.4], [rec.door.x + off, rec.door.z + 0.35]], 4.2);
        p.rot = Math.PI;
        this.people.push(p);
        trip.sent++;
      }
      if (trip.sent >= def.riders && trip.t > 1 + trip.sent * 0.7 + 1) {
        trip.phase = "out";
        trip.t = 0;
      }
    } else {
      trip.v = Math.min(24, trip.v + dt * 9);
      car.position.x -= trip.v * dt;
      if (car.position.x < trip.stop - 300) {
        car.visible = false;
        trip.phase = "gone";
      }
    }
    if (trip.phase === "gone" && !this.people.some((p) => p.trip === trip)) this.trip = null;
  }

  stepPerson(p, dt) {
    if (p.kind === "walker") {
      if (p.wait > 0) {
        p.wait -= dt;
        p.show = 0;
        p.walking = false;
        if (p.wait <= 0) this.sendWalker(p);
      } else if (this.stepPath(p, dt)) {
        p.wait = 1.5 + Math.random() * 5;
        p.inward = !p.inward;
      }
    } else if (p.kind === "guest") {
      if (this.stepPath(p, dt)) p.gone = true;
    } else if (p.kind === "diver") {
      p.show = 1;
      const a = this.time * 0.42 + p.phase;
      p.x = p.cx + Math.cos(a) * 3.8;
      p.z = p.cz + Math.sin(a) * 3.8;
      p.rot = -a;
      p.stroke = this.time * 3;
    } else if (p.kind === "swimmer") {
      p.show = 1;
      const s = Math.sin(this.time * 0.45 + p.phase);
      p.x = p.cx + s * 2.6;
      p.z = p.cz;
      p.rot = Math.cos(this.time * 0.45 + p.phase) > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.stroke = this.time * 4;
    } else {
      p.show = p.rec.k;
    }
  }

  update(dt, camera, light) {
    this.time += dt;
    for (const rec of this.recs.values()) {
      if (rec.k < 1) {
        if (rec.delay > 0) rec.delay -= dt;
        else rec.k = Math.min(1, rec.k + dt / 0.55);
        this.doorsDirty = true;
      }
    }
    if (this.trip) this.stepTrip(dt);
    for (const p of this.people) this.stepPerson(p, dt);
    if (this.people.some((p) => p.gone)) this.people = this.people.filter((p) => !p.gone);
    if (this.doorsDirty) this.drawDoors();
    this.drawUmbrellas(dt);
    this.drawPeople(camera, dt);
    const lamp = 0.5 + light * 2.8;
    this.lampMat.color.setRGB(lamp * 1.15, lamp, lamp * 0.62);
    this.carGlass.color.setRGB(0.55 + light * 0.38, 0.74 + light * 0.02, 0.86 - light * 0.46);
  }

  drawDoors() {
    this.doorsDirty = false;
    let n = 0;
    for (const rec of this.recs.values()) {
      if (n >= TOWERS_MAX) break;
      const s = rec.k <= 0 ? 0.001 : outBack(rec.k);
      tmpQ.identity();
      tmpOut.compose(tmpV.set(rec.door.x, rec.y0, rec.door.z), tmpQ, tmpS.setScalar(s));
      this.doors.setMatrixAt(n, tmpOut);
      this.canopies.setMatrixAt(n, tmpOut);
      this.canopies.setColorAt(n, rec.color);
      this.lamps.setMatrixAt(n, tmpOut);
      const len = Math.max(0.01, (CURB_Z - rec.door.z - 0.6) * Math.min(1, rec.k));
      tmpOut.compose(tmpV.set(rec.door.x, 0.31, rec.door.z + 0.6 + len / 2), tmpQ, tmpS.set(3.2, 1, len));
      this.paths.setMatrixAt(n, tmpOut);
      n++;
    }
    for (const m of [this.doors, this.canopies, this.lamps, this.paths]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    this.canopies.instanceColor.needsUpdate = true;
  }

  drawUmbrellas(dt) {
    let n = 0;
    for (const rec of this.recs.values()) {
      const u = rec.umbrella;
      if (!u || n >= TOWERS_MAX) continue;
      if (u.k < 1) {
        if (u.wait > 0) u.wait -= dt;
        else {
          if (u.k === 0) Sound.pop();
          u.k = Math.min(1, u.k + dt / 0.5);
        }
      }
      tmpQ.identity();
      tmpOut.compose(tmpV.set(u.x, u.y, u.z), tmpQ, tmpS.setScalar(1));
      this.poles.setMatrixAt(n, tmpOut);
      const open = 0.12 + 0.88 * outBack(u.k);
      tmpOut.compose(tmpV.set(u.x, u.y + 2.62 + (1 - u.k) * 0.25, u.z), tmpQ, tmpS.set(open, 1 + (1 - u.k) * 0.7, open));
      this.umbrellas.setMatrixAt(n, tmpOut);
      n++;
    }
    this.poles.count = this.umbrellas.count = n;
    if (n) this.poles.instanceMatrix.needsUpdate = this.umbrellas.instanceMatrix.needsUpdate = true;
  }

  // Рука или нога поворачивается вокруг своего верхнего конца
  limb(i, x, y, z, rx, rz, len, color) {
    tmpE.set(rx, 0, rz, "XYZ");
    tmpLocal.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE), tmpS.set(1, len, 1));
    tmpOut.multiplyMatrices(tmpRoot, tmpLocal);
    this.limbs.setMatrixAt(i, tmpOut);
    this.limbs.setColorAt(i, color);
  }

  part(mesh, i, x, y, z) {
    tmpLocal.makeTranslation(x, y, z);
    tmpOut.multiplyMatrices(tmpRoot, tmpLocal);
    mesh.setMatrixAt(i, tmpOut);
  }

  drawPeople(camera, dt) {
    let n = 0;
    let l = 0;
    let c = 0;
    let b = 0;
    const eye = camera.position;
    for (const p of this.people) {
      if (p.show <= 0.01 || n >= PEOPLE_MAX) continue;
      const far = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
      const moving = p.walking && p.kind !== "gardener" && p.kind !== "waver";
      const bob = moving ? Math.abs(Math.sin(p.phase)) * 0.07 : 0;
      tmpE.set(p.pose === "swim" ? Math.PI / 2 : 0, p.rot, 0, "YXZ");
      tmpRoot.compose(tmpV.set(p.x, p.y + bob, p.z), tmpQ.setFromEuler(tmpE), tmpS.setScalar(p.size * p.show));
      this.part(this.bodies, n, 0, 1.33, 0);
      this.part(this.heads, n, 0, 2.06, 0);
      this.bodies.setColorAt(n, p.cloth);
      this.heads.setColorAt(n, p.skin);
      n++;
      if (far < LIMBS_NEAR) {
        let la = 0;
        let ra = 0;
        let lz = 0;
        let rz = 0;
        let lega = 0;
        if (moving) {
          lega = Math.sin(p.phase) * 0.62;
          la = -lega * 0.8;
          ra = lega * 0.8;
        }
        if (p.pose === "swim") {
          const s = p.stroke || 0;
          la = s;
          ra = s + Math.PI;
          lega = Math.sin(s * 2) * 0.28;
        } else if (p.pose === "water") {
          ra = -1.25 + Math.sin(this.time * 1.4) * 0.08;
        } else if (p.pose === "wave") {
          rz = 2.55 + Math.sin(this.time * 7.5) * 0.42 * (Math.sin(this.time * 0.8 + p.phase) > -0.25 ? 1 : 0);
          ra = 0;
        } else if (p.pose === "carry") {
          la = ra = -1.25;
        }
        this.limb(l++, -0.14, 0.87, 0, lega, 0, 0.87, p.pants);
        this.limb(l++, 0.14, 0.87, 0, -lega, 0, 0.87, p.pants);
        this.limb(l++, -0.34, 1.72, 0, la, lz, 0.72, p.cloth);
        this.limb(l++, 0.34, 1.72, 0, ra, rz, 0.72, p.cloth);
        if (p.pose === "water" && c < TOWERS_MAX) {
          const end = 1.72 - 0.72 * Math.cos(ra);
          const ahead = -0.72 * Math.sin(ra);
          tmpE.set(0.42, 0, 0, "XYZ");
          tmpLocal.compose(tmpV.set(0.34, end, ahead + 0.05), tmpQ.setFromEuler(tmpE), tmpS.setScalar(1));
          tmpOut.multiplyMatrices(tmpRoot, tmpLocal);
          this.cans.setMatrixAt(c++, tmpOut);
          if (far < DROPS_NEAR) {
            p.emit += dt * 13;
            while (p.emit > 1) {
              p.emit -= 1;
              tmpV.set(0.34, end - 0.02, ahead + 0.62).applyMatrix4(tmpRoot);
              const dx = p.tree.x - tmpV.x;
              const dz = p.tree.z - tmpV.z;
              this.fx.spark(tmpV.x, tmpV.y, tmpV.z, dx * 1.15 + (Math.random() - 0.5) * 0.5, 0.7 + Math.random() * 0.5, dz * 1.15 + (Math.random() - 0.5) * 0.5, 0.5, 0.82, 1.6, 0.17, 0.5, 8);
            }
          }
        }
        if (p.pose === "carry" && b < 12) {
          this.part(this.boxes, b++, 0, 1.5, 0.62);
        }
      }
    }
    this.bodies.count = this.heads.count = n;
    this.limbs.count = l;
    this.cans.count = c;
    this.boxes.count = b;
    if (n) {
      this.bodies.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = true;
      this.bodies.instanceColor.needsUpdate = this.heads.instanceColor.needsUpdate = true;
    }
    if (l) {
      this.limbs.instanceMatrix.needsUpdate = true;
      this.limbs.instanceColor.needsUpdate = true;
    }
    if (c) this.cans.instanceMatrix.needsUpdate = true;
    if (b) this.boxes.instanceMatrix.needsUpdate = true;
  }
}
