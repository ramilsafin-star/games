// Домик на дереве: каждая часть появляется по мере того, как её строит ребёнок.
import * as T from "../vendor/three/three.module.min.js?v=92e09217";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=92e09217";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js?v=92e09217";
import { mat, easeBack, easeOut, TRUNK_Z } from "./world.js?v=92e09217";

export const DECK_Y = 5.6;
export const WALL_H = 3.1,
  HOUSE_W = 5,
  HOUSE_FRONT = 3.7,
  HOUSE_BACK = 0.7;
const DECK_W = 8.8,
  DECK_FRONT = 5.1,
  DECK_BACK = 0,
  WOODS = ["#c98f55", "#bd8349", "#d29a60", "#b57c44"],
  RAW = "#dcb88a";

export function part(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const boxes = new Map();
function rounded(w, h, d, r = 0.04) {
  const key = [w, h, d, r].join("/");
  if (!boxes.has(key))
    boxes.set(key, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)));
  return boxes.get(key);
}
export function plank(parent, w, h, d, color, x, y, z, r) {
  return part(parent, rounded(w, h, d, r), typeof color === "string" ? mat(color, 0.78) : color, x, y, z);
}
function pole(parent, a, b, r, color) {
  const from = new T.Vector3(...a),
    to = new T.Vector3(...b),
    dir = to.clone().sub(from),
    m = part(parent, new T.CylinderGeometry(r, r, dir.length(), 10), typeof color === "string" ? mat(color, 0.8) : color);
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  return m;
}
export function ball(parent, x, y, z, r, color, rough = 0.6) {
  return part(parent, new T.SphereGeometry(r, 14, 10), typeof color === "string" ? mat(color, rough) : color, x, y, z);
}
export function shapeOf(kind, s) {
  const p = new T.Shape();
  if (kind === "round") p.absarc(0, 0, s, 0, Math.PI * 2, false);
  else if (kind === "arch") {
    p.moveTo(-s * 0.85, -s);
    p.lineTo(s * 0.85, -s);
    p.lineTo(s * 0.85, 0);
    p.absarc(0, 0, s * 0.85, 0, Math.PI, false);
    p.closePath();
  } else if (kind === "heart") {
    p.moveTo(0, -s);
    p.bezierCurveTo(-s * 1.5, -s * 0.2, -s * 0.9, s * 1.1, 0, s * 0.42);
    p.bezierCurveTo(s * 0.9, s * 1.1, s * 1.5, -s * 0.2, 0, -s);
  } else {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 + Math.PI / 2,
        r = i % 2 ? s * 0.5 : s * 1.12;
      i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.closePath();
  }
  return p;
}
export const glassMat = new T.MeshStandardMaterial({
  color: "#7fd2ee",
  roughness: 0.12,
  metalness: 0.25,
  emissive: "#ffb648",
  emissiveIntensity: 0,
});
const spotMat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75, emissive: "#ffffff", emissiveIntensity: 0.14 });
const lampMat = new T.MeshStandardMaterial({
  color: "#ffd98a",
  emissive: "#ffb040",
  emissiveIntensity: 0.25,
  roughness: 0.5,
});

export class TreeHouse {
  constructor(world) {
    this.world = world;
    this.root = new T.Group();
    world.scene.add(this.root);
    this.reset();
  }
  reset() {
    this.root.clear();
    this.config = {
      colors: [],
      roof: null,
      roofColor: "#ff5d5d",
      window: null,
      trim: "#ffffff",
      way: null,
      decor: {},
    };
    this.deck = [];
    this.nails = [];
    this.boards = [];
    this.spinners = [];
    this.swingers = [];
    this.door = null;
    this.slidePath = null;
    this.sliding = false;
    this.bucket = null;
    this.birdSpot = null;
    this.swingItem = null;
    this.birdFly = 0;
    this.lightsOn = true;
    this.hammer = null;
    this.frontParts = [];
    this.frameGroup = new T.Group();
    this.deckGroup = new T.Group();
    this.railGroup = new T.Group();
    this.wallGroup = new T.Group();
    this.roofGroup = new T.Group();
    this.windowGroup = new T.Group();
    this.wayGroup = new T.Group();
    this.decorGroup = new T.Group();
    this.friends = new T.Group();
    this.root.add(this.frameGroup, this.deckGroup, this.railGroup, this.wallGroup, this.roofGroup, this.windowGroup, this.wayGroup, this.decorGroup, this.friends);
    this.decorItems = {};
    this.addFriends();
  }
  // Пружинка: деталь вырастает из нуля
  pop(obj, delay = 0, from = 0) {
    obj.scale.setScalar(from);
    obj.visible = delay === 0;
    const start = () => {
      obj.visible = true;
      this.world.tween(0.5, (t) => obj.scale.setScalar(from + (1 - from) * t), null, easeBack);
    };
    if (delay) this.world.tween(delay, () => {}, start);
    else start();
  }
  // Опоры появляются, как только выбрано дерево
  buildFrame(instant = false) {
    const g = this.frameGroup,
      wood = "#a9713f",
      y = DECK_Y - 0.28;
    plank(g, DECK_W + 0.2, 0.32, 0.32, wood, 0, y, DECK_FRONT - 0.2, 0.05);
    plank(g, DECK_W + 0.2, 0.32, 0.32, wood, 0, y, DECK_BACK + 0.2, 0.05);
    for (const s of [-1, 1]) {
      plank(g, 0.32, 0.32, DECK_FRONT - DECK_BACK, wood, s * (DECK_W / 2 - 0.1), y, (DECK_FRONT + DECK_BACK) / 2, 0.05);
      // Столбы до земли и подкосы к стволу
      pole(g, [s * 3.8, 0, DECK_FRONT - 0.3], [s * 3.8, y, DECK_FRONT - 0.3], 0.2, wood);
      pole(g, [s * 3.8, 1.8, DECK_FRONT - 0.3], [s * 1.2, y, DECK_FRONT - 0.3], 0.1, wood);
      pole(g, [s * 0.9, 3.2, TRUNK_Z + 0.7], [s * 3.4, y, DECK_BACK + 0.2], 0.14, wood);
      ball(g, s * 3.8, 0.1, DECK_FRONT - 0.3, 0.32, "#9aa4a0", 0.9);
    }
    pole(g, [0, 3, TRUNK_Z + 1.05], [0, y, DECK_FRONT - 0.3], 0.14, wood);
    if (!instant) this.pop(g);
  }
  // Стопка досок на траве, откуда они летят наверх
  buildPile(count = 7) {
    this.pile = [];
    const step = (DECK_FRONT - DECK_BACK) / count;
    for (let i = 0; i < count; i++) {
      const m = plank(this.deckGroup, DECK_W, 0.16, step - 0.05, WOODS[i % 4], 0, 0, 0, 0.05);
      m.userData.home = new T.Vector3(0, DECK_Y - 0.05, DECK_BACK + step * (i + 0.5));
      m.userData.index = i;
      m.position.set(5.6 + (i % 2) * 0.1, 0.2 + i * 0.17, 8.2);
      m.rotation.y = 0.5 + (i % 2) * 0.06;
      this.pile.push(m);
    }
  }
  flyPlank(m, done) {
    const from = m.position.clone(),
      rot = m.rotation.y,
      to = m.userData.home;
    this.world.tween(
      0.72,
      (t) => {
        m.position.lerpVectors(from, to, t);
        m.position.y += Math.sin(t * Math.PI) * 3.2;
        m.rotation.y = rot * (1 - t);
        m.rotation.x = Math.sin(t * Math.PI) * 0.45;
      },
      done,
      easeOut,
    );
  }
  placeDeck() {
    this.buildPile();
    for (const m of this.pile) {
      m.position.copy(m.userData.home);
      m.rotation.set(0, 0, 0);
    }
    this.pile = [];
  }
  buildNails() {
    this.nails = [];
    for (const [x, z] of [[-3.7, 0.7], [3.7, 0.7], [-3.7, 4.5], [3.7, 4.5]]) {
      const n = new T.Group();
      n.position.set(x, DECK_Y + 0.2, z);
      part(n, new T.CylinderGeometry(0.15, 0.15, 0.06, 12), mat("#aab4bd", 0.3, 0.8), 0, 0.2, 0);
      part(n, new T.CylinderGeometry(0.045, 0.02, 0.4, 8), mat("#8f9aa3", 0.35, 0.8));
      // Светящееся кольцо показывает, куда нажать
      const ring = new T.Mesh(
        new T.TorusGeometry(0.36, 0.05, 8, 26),
        new T.MeshBasicMaterial({ color: "#ffe14d", toneMapped: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      n.add(ring);
      n.userData.ring = ring;
      this.deckGroup.add(n);
      this.nails.push(n);
    }
    if (!this.hammer) {
      const h = new T.Group();
      part(h, rounded(0.6, 0.3, 0.3, 0.05), mat("#7f8c97", 0.35, 0.7), 0, 1.0, 0);
      part(h, new T.CylinderGeometry(0.07, 0.08, 1.2, 10), mat("#c9743a", 0.6), 0, 0.42, 0);
      this.hammer = h;
    }
    this.hammer.visible = false;
    this.root.add(this.hammer);
  }
  hitNail(n, done) {
    const h = this.hammer,
      p = n.position;
    h.visible = true;
    h.position.set(p.x + 0.5, p.y - 0.05, p.z);
    n.userData.ring.visible = false;
    this.world.tween(
      0.34,
      (t) => {
        const swing = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
        h.rotation.z = 1.3 - swing * 1.25 + 0.4;
        if (t > 0.42) n.position.y = DECK_Y + 0.2 - Math.min(1, (t - 0.42) * 3) * 0.35;
      },
      () => {
        h.visible = false;
        done?.();
      },
      (t) => t,
    );
  }
  buildRails(instant = false) {
    const g = this.railGroup,
      wood = "#b67e46",
      y = DECK_Y + 0.5;
    const posts = [];
    for (let i = 0; i <= 8; i++) posts.push([-DECK_W / 2 + 0.15 + (i / 8) * (DECK_W - 0.3), DECK_FRONT - 0.14]);
    for (let i = 0; i <= 4; i++)
      for (const s of [-1, 1]) posts.push([s * (DECK_W / 2 - 0.15), DECK_BACK + 0.15 + (i / 4) * (DECK_FRONT - DECK_BACK - 0.3)]);
    for (const [x, z] of posts) {
      // Проём спереди для лестницы
      if (x > 1.5 && x < 3.5 && z > 4) continue;
      plank(g, 0.14, 1.05, 0.14, wood, x, y, z, 0.03);
    }
    plank(g, 3.62 + 2, 0.13, 0.15, wood, -1.25, y + 0.56, DECK_FRONT - 0.14, 0.03);
    plank(g, 1.2, 0.13, 0.15, wood, 3.85, y + 0.56, DECK_FRONT - 0.14, 0.03);
    for (const s of [-1, 1])
      plank(g, 0.15, 0.13, DECK_FRONT - DECK_BACK - 0.2, wood, s * (DECK_W / 2 - 0.15), y + 0.56, (DECK_FRONT + DECK_BACK) / 2, 0.03);
    if (!instant) this.pop(g);
  }
  // Стены из отдельных досок: каждую можно покрасить пальцем
  buildWalls(instant = false) {
    const g = this.wallGroup,
      base = DECK_Y + 0.03,
      add = (w, d, x, z, ang = 0) => {
        const material = new T.MeshStandardMaterial({ color: RAW, roughness: 0.7 }),
          m = part(g, rounded(w, WALL_H, d, 0.04), material, x, base + WALL_H / 2, z);
        m.rotation.y = ang;
        m.userData.board = this.boards.length;
        m.userData.color = null;
        this.boards.push(m);
        return m;
      },
      n = 10,
      bw = HOUSE_W / n;
    for (let i = 0; i < n; i++) add(bw - 0.03, 0.14, -HOUSE_W / 2 + bw * (i + 0.5), HOUSE_FRONT);
    const sideN = 6,
      sw = (HOUSE_FRONT - HOUSE_BACK) / sideN;
    for (const s of [-1, 1])
      for (let i = 0; i < sideN; i++) add(0.14, sw - 0.03, (s * HOUSE_W) / 2, HOUSE_BACK + sw * (i + 0.5));
    // Задняя стена и пол внутри красятся автоматически
    plank(g, HOUSE_W, WALL_H, 0.14, "#a9713f", 0, base + WALL_H / 2, HOUSE_BACK, 0.03);
    plank(g, HOUSE_W, 0.1, HOUSE_FRONT - HOUSE_BACK, "#8f5f35", 0, base + 0.05, (HOUSE_FRONT + HOUSE_BACK) / 2, 0.02);
    // Брусья по углам держат доски
    for (const x of [-HOUSE_W / 2, HOUSE_W / 2])
      for (const z of [HOUSE_BACK, HOUSE_FRONT])
        plank(g, 0.24, WALL_H + 0.05, 0.24, "#8f5f35", x, base + WALL_H / 2, z, 0.04);
    this.buildDoorway();
    if (!instant) {
      this.boards.forEach((b, i) => {
        b.scale.y = 0.001;
        b.position.y = base;
        this.world.tween(0.45 + i * 0.035, (t) => {
          b.scale.y = Math.max(0.001, t);
          b.position.y = base + (WALL_H / 2) * t;
        }, null, easeBack);
      });
    }
  }
  buildDoorway() {
    const hinge = new T.Group(),
      w = 1.25,
      h = 2.25;
    hinge.position.set(-w / 2, DECK_Y + 0.05, HOUSE_FRONT + 0.1);
    const material = new T.MeshStandardMaterial({ color: "#8f4d2c", roughness: 0.55 }),
      leaf = new T.Mesh(new T.ExtrudeGeometry(shapeOf("arch", 0.74), { depth: 0.1, bevelEnabled: false, curveSegments: 14 }), material);
    leaf.position.set(w / 2, 0.74, 0);
    leaf.scale.set(1, 1.08, 1);
    leaf.castShadow = true;
    hinge.add(leaf);
    ball(hinge, w - 0.2, 0.92, 0.14, 0.075, "#ffd23f", 0.3);
    for (const dy of [0.55, 1.25]) plank(hinge, w * 0.82, 0.06, 0.03, "#6e3a20", w / 2, dy, 0.1, 0.01);
    // Тёмный проём виден, когда дверь открыта
    const hole = new T.Mesh(new T.ShapeGeometry(shapeOf("arch", 0.76), 12), new T.MeshBasicMaterial({ color: "#2b1b12" }));
    hole.position.set(0, DECK_Y + 0.79, HOUSE_FRONT + 0.085);
    hole.scale.set(1, 1.08, 1);
    this.wallGroup.add(hole);
    this.wallGroup.add(hinge);
    const lintel = plank(this.wallGroup, 1.55, 0.14, 0.22, "#8f5f35", 0, DECK_Y + 0.05 + h * 1.03, HOUSE_FRONT + 0.1, 0.03);
    this.frontParts = [hole, hinge, lintel];
    this.door = hinge;
    this.door.userData.act = "door";
    this.doorMaterial = material;
    this.doorOpen = false;
  }
  toggleDoor() {
    this.doorOpen = !this.doorOpen;
    const from = this.door.rotation.y,
      to = this.doorOpen ? -1.9 : 0;
    this.world.tween(0.5, (t) => (this.door.rotation.y = from + (to - from) * t), null, easeBack);
    return this.doorOpen;
  }
  paintBoard(board, color) {
    if (board.userData.color === color) return false;
    board.userData.color = color;
    const m = board.material,
      from = m.color.clone(),
      to = new T.Color(color);
    this.world.tween(0.24, (t) => m.color.lerpColors(from, to, t));
    return true;
  }
  paintedColors() {
    return this.boards.map((b) => b.userData.color);
  }
  applyColors(list) {
    this.boards.forEach((b, i) => {
      if (list[i]) {
        b.userData.color = list[i];
        b.material.color.set(list[i]);
      }
    });
  }
  // ---------- крыша ----------
  setRoof(kind, color, instant = false) {
    this.config.roof = kind;
    this.config.roofColor = color;
    const g = this.roofGroup;
    g.clear();
    g.userData.baked = false;
    const paint = new T.MeshStandardMaterial({ color, roughness: 0.5 }),
      base = DECK_Y + WALL_H + 0.05,
      cz = (HOUSE_FRONT + HOUSE_BACK) / 2,
      W = HOUSE_W + 1,
      D = HOUSE_FRONT - HOUSE_BACK + 1.3;
    plank(g, W, 0.2, D, "#8f5f35", 0, base, cz, 0.05);
    if (kind === "gable") {
      const rise = 2,
        half = D / 2,
        len = Math.hypot(half, rise),
        ang = Math.atan2(rise, half);
      for (const s of [-1, 1]) {
        const side = new T.Group();
        side.position.set(0, base + rise / 2 + 0.08, cz + (s * half) / 2);
        side.rotation.x = s * ang;
        g.add(side);
        // Черепица рядами
        const rows = 6;
        for (let r = 0; r < rows; r++) {
          const tile = plank(side, W + 0.4, 0.12, len / rows + 0.14, paint, 0, 0.02 + (r % 2) * 0.02, -len / 2 + (len / rows) * (r + 0.5) - 0.02, 0.05);
          tile.scale.y = 1;
        }
      }
      plank(g, W + 0.5, 0.18, 0.28, "#ffffff", 0, base + rise + 0.14, cz, 0.06);
      const tri = new T.Shape();
      tri.moveTo(-half, 0);
      tri.lineTo(half, 0);
      tri.lineTo(0, rise);
      tri.closePath();
      for (const s of [-1, 1]) {
        const gable = part(g, new T.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false }), mat("#d29a60", 0.7));
        gable.rotation.y = Math.PI / 2;
        gable.position.set(s * (HOUSE_W / 2 + 0.02) - 0.06, base + 0.08, cz);
      }
      g.userData.top = base + rise + 0.3;
    } else if (kind === "mushroom") {
      // Снизу вверх: иначе нормали смотрят внутрь шляпки и она темнеет
      const curve = [[0, 2.5], [1.6, 2.28], [3, 1.42], [3.65, 0.45]],
        points = [[0, 0.02], [3.4, 0.05], ...[...curve].reverse()].map(([a, b]) => new T.Vector2(a, b)),
        cap = part(g, new T.LatheGeometry(points, 34), paint);
      cap.position.set(0, base + 0.1, cz);
      cap.scale.set(1.1, 1, 0.94);
      // Белые пятнышки лежат на поверхности шляпки
      for (const [a, u, r] of [[1.57, 1.35, 0.42], [0.72, 1.62, 0.34], [2.4, 1.68, 0.36], [1.12, 2.42, 0.3], [2.02, 2.46, 0.32], [0.05, 1.95, 0.3], [3.05, 1.95, 0.32], [4.4, 1.3, 0.36], [5.4, 1.6, 0.34], [0, 0, 0.38]]) {
        const i = Math.min(2, Math.floor(u)),
          [ax, ay] = curve[i],
          [bx, by] = curve[i + 1],
          f = u - i,
          rad = ax + (bx - ax) * f,
          normal = new T.Vector3(Math.cos(a) * (ay - by), bx - ax, Math.sin(a) * (ay - by)).normalize(),
          dot = ball(g, Math.cos(a) * rad * 1.1, base + 0.1 + ay + (by - ay) * f, cz + Math.sin(a) * rad * 0.94, r, spotMat);
        dot.scale.y = 0.26;
        dot.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), normal);
      }
      g.userData.top = base + 2.7;
    } else if (kind === "tower") {
      const roof = part(g, new T.ConeGeometry(4.1, 4.2, 8), paint, 0, base + 2.2, cz);
      roof.scale.set(1, 1, 0.82);
      for (let i = 0; i < 3; i++) {
        const band = part(g, new T.CylinderGeometry(3.6 - i * 1.04, 3.72 - i * 1.04, 0.12, 8), mat("#ffffff", 0.5), 0, base + 0.7 + i, cz);
        band.scale.set(1, 1, 0.82);
      }
      ball(g, 0, base + 4.4, cz, 0.24, "#ffd23f", 0.3);
      g.userData.top = base + 4.6;
    } else {
      // Соломенная: шершавые ярусы
      for (let i = 0; i < 5; i++) {
        const r = 4.1 - i * 0.75,
          layer = part(g, new T.CylinderGeometry(r - 0.6, r, 0.68, 14), new T.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }), 0, base + 0.4 + i * 0.56, cz);
        layer.scale.set(1, 1, 0.82);
      }
      ball(g, 0, base + 3.3, cz, 0.56, color, 0.95);
      g.userData.top = base + 3.7;
    }
    if (instant) return;
    g.position.y = 6;
    this.world.tween(0.55, (t) => (g.position.y = 6 * (1 - t)), null, easeBack);
  }
  // ---------- окна ----------
  setWindow(kind, trim, instant = false) {
    this.config.window = kind;
    this.config.trim = trim;
    const g = this.windowGroup;
    g.clear();
    const frame = new T.MeshStandardMaterial({ color: trim, roughness: 0.5 }),
      y = DECK_Y + 1.85,
      spots = [
        [-1.72, y, HOUSE_FRONT + 0.08, 0],
        [1.72, y, HOUSE_FRONT + 0.08, 0],
        [-HOUSE_W / 2 - 0.08, y, 2.2, -Math.PI / 2],
        [HOUSE_W / 2 + 0.08, y, 2.2, Math.PI / 2],
      ];
    for (const [x, py, z, a] of spots) {
      const w = new T.Group();
      w.position.set(x, py, z);
      w.rotation.y = a;
      const outer = new T.Mesh(new T.ExtrudeGeometry(shapeOf(kind, 0.68), { depth: 0.08, bevelEnabled: false, curveSegments: 16 }), frame);
      outer.position.z = -0.02;
      outer.castShadow = true;
      w.add(outer);
      const pane = new T.Mesh(new T.ShapeGeometry(shapeOf(kind, 0.54), 16), glassMat);
      pane.position.z = 0.075;
      w.add(pane);
      plank(w, 0.05, 1.05, 0.02, frame, 0, 0, 0.09, 0.01);
      plank(w, 1.05, 0.05, 0.02, frame, 0, 0, 0.09, 0.01);
      w.userData.act = "window";
      g.add(w);
      if (!instant) this.pop(w);
    }
    this.doorMaterial?.color.set(trim === "#ffffff" ? "#8f4d2c" : trim);
  }
  setLights(on) {
    this.lightsOn = on;
  }
  // Когда домик готов, неподвижные детали сливаются в одну: планшету легче рисовать
  bake() {
    const groups = [this.frameGroup, this.deckGroup, this.railGroup, this.roofGroup];
    if (!this.swingers.some((s) => s.tag === "way")) groups.push(this.wayGroup);
    for (const g of groups) {
      if (g.userData.baked) continue;
      g.userData.baked = true;
      g.updateWorldMatrix(true, true);
      const inverse = g.matrixWorld.clone().invert(),
        byMaterial = new Map();
      // Сама группа может быть скрыта, пока открыта комната: смотрим только на её детали
      for (const child of g.children)
        child.traverseVisible((n) => {
          if (!n.isMesh) return;
          const geo = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone();
          geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, n.matrixWorld));
          if (!byMaterial.has(n.material)) byMaterial.set(n.material, []);
          byMaterial.get(n.material).push(geo);
        });
      if (!byMaterial.size) continue;
      const merged = [];
      for (const [material, list] of byMaterial) {
        const geo = mergeGeometries(list);
        if (!geo) return;
        const m = new T.Mesh(geo, material);
        m.castShadow = m.receiveShadow = true;
        merged.push(m);
      }
      g.clear();
      g.add(...merged);
    }
  }
  // ---------- как забраться ----------
  setWay(kind, instant = false) {
    this.config.way = kind;
    const g = this.wayGroup;
    g.clear();
    g.userData.baked = false;
    this.swingers = this.swingers.filter((s) => s.tag !== "way");
    const wood = "#b67e46",
      topY = DECK_Y,
      x = 2.5;
    if (kind === "ladder") {
      const foot = 8.6,
        top = DECK_FRONT;
      for (const s of [-0.62, 0.62]) pole(g, [x + s, 0, foot], [x + s, topY + 0.9, top - 0.1], 0.1, wood);
      for (let i = 1; i < 9; i++) {
        const t = i / 9,
          y = t * (topY + 0.1),
          z = foot + (top - foot) * t;
        plank(g, 1.3, 0.1, 0.24, "#d29a60", x, y, z, 0.03);
      }
    } else if (kind === "rope") {
      const hang = new T.Group();
      hang.position.set(x, topY + 0.1, DECK_FRONT + 0.1);
      g.add(hang);
      for (const s of [-0.55, 0.55]) pole(hang, [s, 0, 0], [s, -topY - 0.1, 0], 0.045, "#d9c08a");
      for (let i = 1; i < 9; i++) plank(hang, 1.3, 0.1, 0.22, "#d29a60", 0, -(i / 9) * topY, 0, 0.03);
      this.swingers.push({ tag: "way", group: hang, axis: "x", amp: 0.025, speed: 1.1 });
    } else if (kind === "spiral") {
      // Ступеньки вокруг ствола
      const steps = 20,
        R = 2.05;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1),
          a = -1.25 + t * 5.5,
          y = 0.3 + t * (topY - 0.4),
          step = plank(g, 1.75, 0.14, 0.62, "#d29a60", Math.cos(a) * R, y, TRUNK_Z + Math.sin(a) * R, 0.04);
        step.rotation.y = -a;
        if (i % 2 === 0) pole(g, [Math.cos(a) * (R + 0.8), y, TRUNK_Z + Math.sin(a) * (R + 0.8)], [Math.cos(a) * (R + 0.8), y + 1, TRUNK_Z + Math.sin(a) * (R + 0.8)], 0.04, wood);
      }
    } else {
      // Лесенка-скалодром: цветные зацепы на столбе и сетка
      const net = new T.Group();
      net.position.set(x, 0, DECK_FRONT + 0.15);
      g.add(net);
      const colors = ["#ff5d5d", "#ffd23f", "#39c3f0", "#6fd36a", "#b07cff"];
      plank(net, 2, topY + 0.2, 0.14, "#d29a60", 0, (topY + 0.2) / 2, 0, 0.04);
      for (let i = 0; i < 16; i++)
        ball(net, -0.72 + ((i * 7) % 5) * 0.36, 0.5 + (i / 16) * (topY - 0.7), 0.13, 0.12, colors[i % 5], 0.45).scale.z = 0.7;
    }
    if (!instant) this.pop(g, 0, 0.2);
  }
  // ---------- украшения ----------
  toggleDecor(id, instant = false) {
    const on = !this.config.decor[id];
    if (on) this.config.decor[id] = true;
    else delete this.config.decor[id];
    if (!on) {
      const item = this.decorItems[id];
      if (item) {
        this.decorGroup.remove(item);
        this.spinners = this.spinners.filter((s) => s.tag !== id);
        this.swingers = this.swingers.filter((s) => s.tag !== id);
        delete this.decorItems[id];
        if (id === "slide") this.slidePath = null;
        if (id === "bucket") this.bucket = null;
        if (id === "swing") this.swingItem = null;
        if (id === "birdhouse") {
          this.birdSpot = null;
          this.bird.visible = false;
        }
      }
      return false;
    }
    const item = new T.Group();
    this.decorItems[id] = item;
    this.decorGroup.add(item);
    this["add" + id[0].toUpperCase() + id.slice(1)](item);
    if (!instant) this.pop(item, 0, 0.3);
    return true;
  }
  addFlags(g) {
    const colors = ["#ff5d5d", "#ffd23f", "#39c3f0", "#6fd36a", "#ff8cc6", "#b07cff"],
      y = DECK_Y + 1.35,
      z = DECK_FRONT - 0.12,
      tri = new T.Shape();
    tri.moveTo(-0.17, 0);
    tri.lineTo(0.17, 0);
    tri.lineTo(0, -0.42);
    tri.closePath();
    const geo = new T.ShapeGeometry(tri);
    for (let i = 0; i < 15; i++) {
      const t = i / 14,
        x = -4.2 + t * 8.4,
        sag = Math.sin(t * Math.PI) * -0.42,
        flag = new T.Mesh(geo, new T.MeshStandardMaterial({ color: colors[i % 6], roughness: 0.7, side: T.DoubleSide }));
      flag.position.set(x, y + 0.3 + sag, z);
      g.add(flag);
      if (i < 14) {
        const t2 = (i + 1) / 14;
        pole(g, [x, y + 0.3 + sag, z], [-4.2 + t2 * 8.4, y + 0.3 + Math.sin(t2 * Math.PI) * -0.42, z], 0.012, "#7a6a55");
      }
    }
    for (const s of [-1, 1]) plank(g, 0.08, 0.95, 0.08, "#b67e46", s * 4.25, y - 0.1, z, 0.02);
  }
  addLanterns(g) {
    const colors = ["#ff7a5c", "#ffd23f", "#ff8cc6", "#7fd4ff"];
    [-2.4, -0.8, 0.8, 2.4].forEach((x, i) => {
      const z = HOUSE_FRONT + 0.52,
        top = DECK_Y + WALL_H - 0.02,
        hang = new T.Group();
      hang.position.set(x, top, z);
      pole(hang, [0, 0, 0], [0, -0.32, 0], 0.012, "#5a4a35");
      const material = lampMat.clone();
      material.color.set(colors[i]);
      material.emissive.set(colors[i]);
      material.userData.lamp = true;
      const lamp = ball(hang, 0, -0.56, 0, 0.27, material, 0.5);
      lamp.scale.y = 1.15;
      plank(hang, 0.2, 0.05, 0.2, "#5a4a35", 0, -0.32, 0, 0.01);
      g.add(hang);
      this.swingers.push({ tag: "lanterns", group: hang, axis: "z", amp: 0.05, speed: 1.4 + i * 0.2 });
    });
  }
  addFlowers(g) {
    const spots = [[-1.72, HOUSE_FRONT + 0.25], [1.72, HOUSE_FRONT + 0.25]],
      colors = ["#ff5d8f", "#ffd23f", "#ffffff", "#ff8a3c", "#b07cff"],
      y = DECK_Y + 1.05;
    for (const [x, z] of spots) {
      plank(g, 1.5, 0.28, 0.36, "#c9743a", x, y, z, 0.05);
      for (let i = 0; i < 7; i++) {
        const fx = x - 0.6 + i * 0.2;
        pole(g, [fx, y + 0.1, z], [fx, y + 0.34, z], 0.015, "#3f9c34");
        ball(g, fx, y + 0.4, z, 0.1, colors[i % 5], 0.6);
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28;
      ball(g, 5.2 + Math.cos(a) * 1.2, 0.3, 5 + Math.sin(a) * 0.9, 0.2, colors[i % 5], 0.6);
    }
  }
  addSwing(g) {
    // Качели на толстой ветке слева
    const hang = new T.Group();
    hang.position.set(-6.2, 11.1, 0.4);
    g.add(hang);
    for (const s of [-0.62, 0.62]) pole(hang, [s, 0, 0], [s, -9.5, 0], 0.035, "#d9c08a");
    plank(hang, 1.6, 0.12, 0.55, "#ff8a3c", 0, -9.5, 0, 0.04);
    hang.userData.act = "swing";
    this.swingers.push({ tag: "swing", group: hang, axis: "x", amp: 0.035, speed: 1.3, boost: 0 });
    this.swingItem = this.swingers[this.swingers.length - 1];
    hang.userData.seat = hang.children[hang.children.length - 1];
  }
  addSlide(g) {
    // Горка со скруглённым жёлобом
    const path = new T.CatmullRomCurve3(
        [[-3.4, DECK_Y + 0.15, DECK_FRONT - 0.2], [-3.9, DECK_Y - 0.5, DECK_FRONT + 1.6], [-5, 2.4, DECK_FRONT + 3.7], [-6.2, 0.9, DECK_FRONT + 5.6], [-7.2, 0.42, DECK_FRONT + 7]].map((p) => new T.Vector3(...p)),
      ),
      rows = 30,
      cols = 12,
      pos = [],
      idx = [],
      // Поперёк хода всегда по горизонтали, чтобы горка не перекручивалась
      across = (u) => {
        const d = path.getTangentAt(u);
        return new T.Vector3(d.z, 0, -d.x).normalize();
      };
    for (let i = 0; i <= rows; i++) {
      const p = path.getPointAt(i / rows),
        side = across(i / rows),
        up = new T.Vector3(0, 1, 0);
      for (let j = 0; j <= cols; j++) {
        const a = Math.PI * (j / cols),
          px = p.clone().addScaledVector(side, Math.cos(a) * 0.82).addScaledVector(up, -Math.sin(a) * 0.3 + 0.25);
        pos.push(px.x, px.y, px.z);
        if (i < rows && j < cols) {
          const n = i * (cols + 1) + j;
          idx.push(n, n + 1, n + cols + 1, n + 1, n + cols + 2, n + cols + 1);
        }
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const chute = new T.Mesh(geo, new T.MeshStandardMaterial({ color: "#ffb02e", roughness: 0.3, side: T.DoubleSide }));
    chute.castShadow = true;
    g.add(chute);
    for (const t of [0.34, 0.62]) {
      const p = path.getPointAt(t),
        side = across(t);
      for (const s of [-0.62, 0.62]) pole(g, [p.x + side.x * s, 0, p.z + side.z * s], [p.x + side.x * s, p.y, p.z + side.z * s], 0.09, "#39c3f0");
    }
    this.slidePath = path;
    g.userData.act = "slide";
  }
  addBirdhouse(g) {
    const x = 1.05,
      y = 9.3,
      z = TRUNK_Z + 1.05,
      bh = new T.Group();
    bh.position.set(x, y, z);
    bh.rotation.y = 0.25;
    g.add(bh);
    plank(bh, 0.9, 1.05, 0.8, "#39c3f0", 0, 0, 0, 0.06);
    const hole = part(bh, new T.CylinderGeometry(0.2, 0.2, 0.04, 16), new T.MeshBasicMaterial({ color: "#20303a" }), 0, 0.1, 0.41);
    hole.rotation.x = Math.PI / 2;
    const roof = part(bh, new T.ConeGeometry(0.86, 0.6, 4), mat("#ff5d5d", 0.5), 0, 0.82, 0);
    roof.rotation.y = Math.PI / 4;
    pole(bh, [0, -0.2, 0.4], [0, -0.2, 0.68], 0.03, "#8f5f35");
    this.birdSpot = bh;
    this.bird.visible = true;
    g.userData.act = "bird";
  }
  addTelescope(g) {
    const t = new T.Group();
    t.position.set(3.3, DECK_Y + 0.05, 1.1);
    g.add(t);
    for (const [dx, dz] of [[-0.3, 0.2], [0.3, 0.2], [0, -0.34]]) pole(t, [dx, 0, dz], [0, 1.15, 0], 0.03, "#6e3a20");
    const tube = new T.Group();
    tube.position.y = 1.2;
    tube.rotation.set(0.55, 0.6, 0);
    t.add(tube);
    const body = part(tube, new T.CylinderGeometry(0.13, 0.17, 1.3, 14), mat("#ffd23f", 0.3, 0.6));
    body.rotation.x = Math.PI / 2;
    const cap = part(tube, new T.CylinderGeometry(0.2, 0.2, 0.14, 14), mat("#39474f", 0.4, 0.5), 0, 0, -0.7);
    cap.rotation.x = Math.PI / 2;
  }
  addPinwheel(g) {
    // Вертушка на крыше крутится от ветра
    const top = this.roofGroup.userData.top || DECK_Y + 6,
      cz = (HOUSE_FRONT + HOUSE_BACK) / 2,
      stick = new T.Group();
    stick.position.set(1.05, top - 0.5, cz + 0.2);
    g.add(stick);
    pole(stick, [0, 0, 0], [0, 1.3, 0], 0.035, "#ffffff");
    const wheel = new T.Group();
    wheel.position.set(0, 1.35, 0.1);
    stick.add(wheel);
    const colors = ["#ff5d5d", "#ffd23f", "#39c3f0", "#6fd36a"];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2,
        s = new T.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.58, 0.12);
      s.lineTo(0.42, 0.42);
      s.closePath();
      const blade = new T.Mesh(new T.ShapeGeometry(s), new T.MeshStandardMaterial({ color: colors[i], roughness: 0.5, side: T.DoubleSide }));
      blade.rotation.z = a;
      wheel.add(blade);
    }
    ball(wheel, 0, 0, 0.02, 0.06, "#ffffff", 0.4);
    this.spinners.push({ tag: "pinwheel", group: wheel, speed: 3 });
  }
  addBucket(g) {
    // Ведёрко на верёвке катается вверх и вниз
    const x = 3.95,
      z = DECK_FRONT + 0.4;
    plank(g, 0.14, 0.14, 1.05, "#8f5f35", x, DECK_Y + 1.4, DECK_FRONT, 0.03);
    plank(g, 0.14, 1.4, 0.14, "#8f5f35", x, DECK_Y + 0.7, DECK_FRONT - 0.4, 0.03);
    const pail = new T.Group();
    g.add(pail);
    pole(g, [x, DECK_Y + 1.35, z], [x, 0.2, z], 0.018, "#d9c08a");
    part(pail, new T.CylinderGeometry(0.3, 0.22, 0.42, 14, 1, true), new T.MeshStandardMaterial({ color: "#ff8cc6", roughness: 0.4, side: T.DoubleSide }));
    ball(pail, 0, 0.1, 0, 0.17, "#ff3b3b", 0.3);
    pail.position.set(x, 1, z);
    pail.userData.act = "bucket";
    this.bucket = pail;
    this.bucketT = 0;
    g.userData.act = "bucket";
  }
  // ---------- жители ----------
  addFriends() {
    // Белочка-помощница: глаза маленькие, как точки, никаких больших глаз
    const fur = "#e88b3c",
      belly = "#ffe2bf",
      s = new T.Group();
    const body = ball(s, 0, 0.42, 0, 0.3, fur, 0.85);
    body.scale.set(0.88, 1.15, 0.8);
    const tummy = ball(s, 0, 0.4, 0.13, 0.22, belly, 0.85);
    tummy.scale.set(0.8, 1.1, 0.7);
    ball(s, 0, 0.92, 0.04, 0.25, fur, 0.85);
    const snout = ball(s, 0, 0.86, 0.22, 0.11, belly, 0.8);
    snout.scale.set(1.1, 0.8, 0.8);
    ball(s, 0, 0.9, 0.31, 0.03, "#3b2417", 0.4);
    for (const side of [-1, 1]) {
      ball(s, side * 0.1, 0.98, 0.24, 0.024, "#20140c", 0.3);
      const ear = part(s, new T.ConeGeometry(0.07, 0.2, 8), mat(fur, 0.85), side * 0.15, 1.2, 0);
      ear.rotation.z = -side * 0.2;
      const foot = ball(s, side * 0.15, 0.06, 0.12, 0.09, fur, 0.85);
      foot.scale.set(1, 0.6, 1.5);
      const paw = ball(s, side * 0.2, 0.55, 0.16, 0.06, fur, 0.85);
      paw.scale.y = 1.4;
    }
    // Пушистый хвост
    const tail = new T.Group();
    tail.position.set(0, 0.3, -0.26);
    s.add(tail);
    [[0.05, 0.02, -0.06, 0.15], [0.15, 0.22, -0.2, 0.2], [0.27, 0.46, -0.24, 0.23], [0.37, 0.72, -0.14, 0.21], [0.36, 0.9, 0.02, 0.15]].forEach(([x, y, z, r]) => ball(tail, x, y, z, r, "#d97a2e", 0.95));
    this.tail = tail;
    s.scale.setScalar(1.5);
    s.userData.size = 1.5;
    this.squirrel = s;
    this.friends.add(s);
    s.position.set(-5.2, 0.05, 6.4);
    s.rotation.y = 0.5;
    // Птичка
    const bird = new T.Group();
    const bd = ball(bird, 0, 0.12, 0, 0.14, "#ffd23f", 0.6);
    bd.scale.set(0.9, 1, 1.2);
    ball(bird, 0, 0.25, 0.1, 0.09, "#ffd23f", 0.6);
    const beak = part(bird, new T.ConeGeometry(0.03, 0.08, 6), mat("#ff8a3c", 0.5), 0, 0.25, 0.2);
    beak.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const wing = ball(bird, side * 0.12, 0.13, -0.02, 0.09, "#ffb02e", 0.6);
      wing.scale.set(0.3, 0.8, 1.2);
    }
    bird.scale.setScalar(1.9);
    bird.visible = false;
    this.bird = bird;
    this.friends.add(bird);
    // Зайчик появляется, когда домик готов
    const r = new T.Group();
    const rb = ball(r, 0, 0.42, 0, 0.3, "#fdf6ee", 0.9);
    rb.scale.set(0.9, 1.1, 0.95);
    ball(r, 0, 0.86, 0.06, 0.24, "#fdf6ee", 0.9);
    ball(r, 0, 0.82, 0.29, 0.035, "#ff9ec0", 0.5);
    ball(r, 0, 0.38, -0.3, 0.1, "#ffffff", 0.95);
    for (const side of [-1, 1]) {
      ball(r, side * 0.09, 0.93, 0.25, 0.022, "#20140c", 0.3);
      const ear = ball(r, side * 0.1, 1.28, 0, 0.09, "#fdf6ee", 0.9);
      ear.scale.y = 3;
      const inner = ball(r, side * 0.1, 1.28, 0.05, 0.05, "#ffc2d6", 0.8);
      inner.scale.y = 3;
      const foot = ball(r, side * 0.16, 0.07, 0.13, 0.09, "#fdf6ee", 0.9);
      foot.scale.set(1, 0.6, 1.5);
    }
    r.scale.setScalar(1.4);
    r.visible = false;
    r.position.set(4.6, 0.02, 9);
    r.rotation.y = -0.5;
    this.rabbit = r;
    this.friends.add(r);
    this.hop = { squirrel: 0, rabbit: 0 };
  }
  jump(who, power = 1) {
    this.hop[who] = Math.max(this.hop[who], power);
  }
  moveSquirrel(x, y, z, face = 0, done) {
    const s = this.squirrel,
      from = s.position.clone(),
      to = new T.Vector3(x, y, z),
      rot = s.rotation.y,
      height = Math.min(4, 0.8 + from.distanceTo(to) * 0.28);
    this.world.tween(
      0.8,
      (t) => {
        s.position.lerpVectors(from, to, t);
        s.position.y += Math.sin(t * Math.PI) * height;
        s.rotation.y = rot + (face - rot) * t;
      },
      done,
    );
  }
  slideSquirrel(done) {
    if (!this.slidePath || this.sliding) return;
    this.sliding = true;
    const s = this.squirrel,
      from = s.position.clone(),
      start = new T.Vector3(-3.4, DECK_Y + 0.25, DECK_FRONT - 0.7);
    this.world.tween(0.5, (t) => {
      s.position.lerpVectors(from, start, t);
      s.position.y += Math.sin(t * Math.PI) * 2.5;
    }, () => {
      this.world.tween(1.25, (t) => {
        const p = this.slidePath.getPointAt(t);
        s.position.set(p.x, p.y + 0.28, p.z);
        s.rotation.y = -0.55;
      }, () => {
        this.sliding = false;
        done?.();
      }, (t) => t * t);
    });
  }
  // ---------- кадр ----------
  frame(dt, time, night) {
    glassMat.emissiveIntensity = (this.lightsOn === false ? 0 : 1) * night * 1.9;
    glassMat.color.set("#7fd2ee").lerp(new T.Color("#ffd27a"), this.lightsOn === false ? 0 : night);
    for (const s of this.spinners) s.group.rotation.z += dt * s.speed;
    for (const s of this.swingers) {
      const extra = s.boost || 0;
      s.boost = Math.max(0, extra - dt * 0.09);
      s.group.rotation[s.axis] = Math.sin(time * s.speed) * (s.amp + extra);
    }
    this.decorGroup.traverse((n) => {
      if (n.material?.userData?.lamp) n.material.emissiveIntensity = 0.25 + night * 2.6;
    });
    // Прыжки жителей и взмахи хвоста
    for (const who of ["squirrel", "rabbit"]) {
      const o = this[who];
      if (this.hop[who] > 0) {
        this.hop[who] = Math.max(0, this.hop[who] - dt * 1.1);
        o.userData.lift = Math.abs(Math.sin(time * 9)) * this.hop[who] * 0.9;
      } else o.userData.lift = 0;
      const lift = o.userData.lift;
      o.scale.y = (o.userData.size || 1.4) * (1 + lift * 0.1);
      o.position.y += lift - (o.userData.lastLift || 0);
      o.userData.lastLift = lift;
    }
    this.tail.rotation.x = Math.sin(time * 3.2) * 0.14;
    if (this.bucket) {
      const y = 3 + Math.sin(time * 0.5) * 2.6;
      this.bucket.position.y = y;
    }
    if (this.bird.visible) {
      if (this.birdFly > 0) {
        this.birdFly -= dt;
        const a = time * 1.6;
        this.bird.position.set(Math.cos(a) * 5, 10.5 + Math.sin(a * 2) * 0.8, 2 + Math.sin(a) * 4);
        this.bird.rotation.y = -a;
        this.bird.children.slice(-2).forEach((w, i) => (w.rotation.z = Math.sin(time * 26) * (i ? 1 : -1)));
      } else if (this.birdSpot) {
        const p = this.birdSpot.position;
        this.bird.position.set(p.x, p.y - 0.15, p.z + 0.72);
        this.bird.rotation.y = 0.2;
      }
    }
  }
}
