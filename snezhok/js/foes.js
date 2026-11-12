// Монстры, подборы и оружие «Снежного кома» на сцене: йети, ледяные бесята, снежная страшила,
// метельный дух, снежища снеговика, шарики-подборы, снежки пушки, шипы и пушечка на Снежке.
// Модели — мягкий low-poly в стиле Снежка: простые фигуры, лица нарисованы на холсте.
// Правила (rules.js, run.js) о графике не знают; здесь только то, что видно.
import { T, TAU, GEO, V, rand, lit, hot, part, at, canvasTexture, labelTexture, flare } from "./kit.js?v=dba1bb88";
import { tone, GLOW, PUFF, STAR, RING } from "./fx.js?v=dba1bb88";
import { merge } from "./models.js?v=dba1bb88";
import { impX, throwPos, volleyState, isMonster, isPickup } from "./rules.js?v=dba1bb88";

// ---------- Общие материалы: живут всю игру, уровень их не освобождает ----------
const std = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.75, ...o });
export const FOE_MATS = {
  fur: std("#f4f8ff", { roughness: 0.95, flatShading: true }),
  furLight: std("#ffffff", { roughness: 0.9 }),
  skin: std("#7fb8f0", { roughness: 0.6 }),
  horn: std("#fff1d2", { roughness: 0.5 }),
  dark: std("#2a2440", { roughness: 0.6 }),
  imp: std("#5fd0ff", { roughness: 0.18, metalness: 0.15, emissive: "#1f7ec8", emissiveIntensity: 0.55, flatShading: true }),
  impBelly: std("#d8f6ff", { roughness: 0.3, emissive: "#6ad0ff", emissiveIntensity: 0.3 }),
  snow: std("#ffffff", { roughness: 0.85 }),
  carrot: std("#ff8a1e", { roughness: 0.6 }),
  twig: std("#6b4a32", { roughness: 0.9 }),
  bucket: std("#7a6ea8", { roughness: 0.5, metalness: 0.4 }),
  rag: std("#8a3a8a", { roughness: 0.95 }),
  spirit: new T.MeshBasicMaterial({ color: hot("#bfe8ff", 1.6), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
  spiritCore: new T.MeshBasicMaterial({ color: hot("#ffffff", 1.9), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
  bubble: new T.MeshStandardMaterial({ color: "#d8f2ff", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false }),
  icon: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: "#ffffff", emissiveIntensity: 0.18 }),
  shot: new T.MeshBasicMaterial({ color: hot("#ffffff", 1.6), toneMapped: false }),
  spikes: new T.MeshStandardMaterial({ color: "#bff4ff", roughness: 0.08, metalness: 0.2, emissive: "#5fd8ff", emissiveIntensity: 1.1, flatShading: true }),
  cannon: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 }),
  volley: std("#ffffff", { roughness: 0.8 }),
  ring: new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  arrow: new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }),
};
const KEEP = new Set(Object.values(FOE_MATS));
export const keepFoeMaterial = (m) => KEEP.has(m);

// ---------- Геометрии ----------
let furGeo = null;
function fur() {
  if (furGeo) return furGeo;
  const g = new T.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.09 * Math.sin(x * 11 + y * 5) * Math.sin(z * 9 - y * 7) + 0.05 * Math.sin((x - z) * 15 + y * 13);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return (furGeo = g);
}
const Mx = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), V(sx, sy, sz));
const ICONS = {};
// значки внутри шариков-подборов: одна сетка с вершинными цветами
function icon(kind) {
  if (ICONS[kind]) return ICONS[kind];
  const parts = [];
  if (kind === "gun") {
    parts.push({ geo: GEO.cyl, hex: "#2f7cff", m: Mx(0, 0.05, -0.05, 0.22, 0.75, 0.22, Math.PI / 2 - 0.35) });
    parts.push({ geo: GEO.cyl, hex: "#ffd23a", m: Mx(0, 0.18, -0.42, 0.27, 0.1, 0.27, Math.PI / 2 - 0.35) });
    parts.push({ geo: GEO.ball, hex: "#ffffff", m: Mx(0, 0.3, -0.62, 0.17, 0.17, 0.17) });
    for (const sx of [-1, 1]) parts.push({ geo: GEO.cyl, hex: "#ff5a6a", m: Mx(sx * 0.24, -0.22, 0.12, 0.22, 0.08, 0.22, 0, 0, Math.PI / 2) });
  } else if (kind === "spike") {
    parts.push({ geo: GEO.low, hex: "#9fe8ff", m: Mx(0, 0, 0, 0.32, 0.32, 0.32) });
    const dirs = new T.IcosahedronGeometry(1, 0).attributes.position;
    for (let i = 0; i < dirs.count; i += 3) {
      const d = V(dirs.getX(i), dirs.getY(i), dirs.getZ(i)).normalize();
      const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
      const m = new T.Matrix4().compose(d.clone().multiplyScalar(0.42), q, V(0.1, 0.32, 0.1));
      parts.push({ geo: GEO.cone, hex: "#e6fbff", m });
    }
  } else if (kind === "wave") {
    const torus = new T.TorusGeometry(1, 0.14, 6, 20);
    parts.push({ geo: torus, hex: "#5fd8ff", m: Mx(0, 0, 0, 0.5, 0.5, 0.5, Math.PI / 2) });
    parts.push({ geo: torus, hex: "#ffffff", m: Mx(0, 0, 0, 0.3, 0.3, 0.3, Math.PI / 2) });
    parts.push({ geo: GEO.ball, hex: "#bff4ff", m: Mx(0, 0, 0, 0.14, 0.14, 0.14) });
  }
  return (ICONS[kind] = merge(parts));
}
let spikeGeo = null;
// ледяные шипы на коме: конусы по нормалям сферы
function ballSpikes() {
  if (spikeGeo) return spikeGeo;
  const parts = [];
  const dirs = new T.IcosahedronGeometry(1, 1).attributes.position;
  const seen = new Set();
  for (let i = 0; i < dirs.count; i++) {
    const d = V(dirs.getX(i), dirs.getY(i), dirs.getZ(i)).normalize();
    const key = d.toArray().map((v) => v.toFixed(2)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
    parts.push({ geo: GEO.cone, hex: "#ffffff", m: new T.Matrix4().compose(d.clone().multiplyScalar(1.05), q, V(0.14, 0.5, 0.14)) });
  }
  return (spikeGeo = merge(parts));
}
let cannonGeo = null;
// пушечка Снежка: ствол смотрит вперёд (в сторону −z головы)
function cannonGeometry() {
  if (cannonGeo) return cannonGeo;
  cannonGeo = merge([
    { geo: GEO.cyl, hex: "#2f7cff", m: Mx(0, 0, -0.25, 0.17, 0.62, 0.17, -Math.PI / 2) },
    { geo: GEO.cyl, hex: "#ffd23a", m: Mx(0, 0, -0.56, 0.21, 0.08, 0.21, -Math.PI / 2) },
    { geo: GEO.ball, hex: "#2f7cff", m: Mx(0, 0, 0.05, 0.22, 0.22, 0.22) },
    { geo: GEO.box, hex: "#ffd23a", m: Mx(0, -0.18, 0.02, 0.16, 0.12, 0.3) },
  ]);
  return cannonGeo;
}

// ---------- Лица: нарисованы на холсте, натянуты на маленькую плоскость перед головой ----------
const faces = new Map();
function face(kind) {
  if (faces.has(kind)) return faces.get(kind);
  const tex = canvasTexture(256, 192, (g) => {
    const eye = (x, y, r, look = 0) => {
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#1b2246";
      g.lineWidth = 7;
      g.beginPath();
      g.ellipse(x, y, r, r * 1.12, 0, 0, TAU);
      g.fill();
      g.stroke();
      g.fillStyle = "#1b2246";
      g.beginPath();
      g.arc(x + look, y + 4, r * 0.52, 0, TAU);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x + look - r * 0.18, y - r * 0.12, r * 0.16, 0, TAU);
      g.fill();
    };
    const brow = (x, y, a, w = 46) => {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = "#1b2246";
      g.beginPath();
      g.roundRect(-w / 2, -7, w, 14, 7);
      g.fill();
      g.restore();
    };
    g.lineCap = g.lineJoin = "round";
    if (kind === "yeti") {
      eye(88, 82, 30, 4);
      eye(168, 82, 30, -4);
      brow(86, 38, 0.38);
      brow(170, 38, -0.38);
      // рот с двумя клычками: сердитый, но смешной
      g.fillStyle = "#3a1830";
      g.beginPath();
      g.ellipse(128, 150, 40, 22, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = "#ffffff";
      for (const x of [104, 152]) {
        g.beginPath();
        g.moveTo(x - 9, 150);
        g.lineTo(x + 9, 150);
        g.lineTo(x, 168);
        g.fill();
      }
      g.fillStyle = "#ff8aa0";
      g.beginPath();
      g.ellipse(128, 164, 16, 7, 0, 0, TAU);
      g.fill();
    } else if (kind === "imp") {
      eye(84, 84, 38, 6);
      eye(172, 84, 38, -6);
      brow(84, 34, 0.45, 40);
      brow(172, 34, -0.45, 40);
      // ехидная улыбка до ушей
      g.strokeStyle = "#0b3a66";
      g.lineWidth = 9;
      g.beginPath();
      g.arc(128, 128, 46, 0.2, Math.PI - 0.2);
      g.stroke();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(112, 170);
      g.lineTo(122, 170);
      g.lineTo(117, 182);
      g.fill();
    } else if (kind === "thrower") {
      g.fillStyle = "#1d1f26";
      for (const [x, y, r] of [[92, 80, 16], [164, 70, 20]]) {
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
      brow(92, 50, 0.5, 40);
      brow(166, 38, -0.2, 44);
      g.fillStyle = "#1d1f26";
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(84 + k * 18, 150 + Math.sin(k * 1.4) * 8, 7, 0, TAU);
        g.fill();
      }
    } else if (kind === "spirit") {
      g.fillStyle = "#1d3a7a";
      for (const x of [92, 164]) {
        g.beginPath();
        g.ellipse(x, 86, 22, 30, 0, 0, TAU);
        g.fill();
      }
      g.fillStyle = "#bff4ff";
      for (const x of [86, 158]) {
        g.beginPath();
        g.arc(x, 76, 7, 0, TAU);
        g.fill();
      }
      g.fillStyle = "#1d3a7a";
      g.beginPath();
      g.ellipse(128, 152, 18, 22, 0, 0, TAU);
      g.fill();
    }
  });
  const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  KEEP.add(mat);
  faces.set(kind, mat);
  return mat;
}
const facePlane = (kind, w, h) => {
  const m = new T.Mesh(GEO.plane, face(kind));
  m.scale.set(w, h, 1);
  m.renderOrder = 2;
  return m;
};
const shadowed = (g) => (g.traverse((n) => n.isMesh && !n.material.transparent && (n.castShadow = true)), g);

// ---------- Модели (смотрят на +z; сцена поворачивает их к игроку) ----------
export function yetiModel() {
  const M = FOE_MATS;
  const g = new T.Group();
  const body = new T.Group();
  g.add(body);
  body.add(at(part(fur(), M.fur, 1.12, 1.18, 1.0), 0, 1.3, 0));
  body.add(at(part(GEO.ball, M.furLight, 0.72, 0.78, 0.45), 0, 1.15, 0.66));
  const head = new T.Group();
  head.position.y = 2.4;
  head.add(part(fur(), M.fur, 0.8));
  head.add(at(part(GEO.ball, M.skin, 0.58, 0.5, 0.32), 0, -0.04, 0.6));
  head.add(at(facePlane("yeti", 0.95, 0.72), 0, 0, 0.93));
  for (const sx of [-1, 1]) {
    const horn = at(part(GEO.cone, M.horn, 0.16, 0.55, 0.16), sx * 0.55, 0.6, 0);
    horn.rotation.z = -sx * 0.55;
    head.add(horn);
  }
  body.add(head);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(sx * 1.0, 1.85, 0.05);
    arm.add(at(part(fur(), M.fur, 0.32, 0.72, 0.32), 0, -0.55, 0));
    arm.add(at(part(GEO.ball, M.skin, 0.27), 0, -1.15, 0.05));
    body.add(arm);
    arms.push(arm);
  }
  for (const sx of [-1, 1]) g.add(at(part(GEO.ball, M.skin, 0.36, 0.18, 0.48), sx * 0.45, 0.12, 0.2));
  g.userData = { body, head, arms, top: 3.6 };
  return shadowed(g);
}
export function impModel() {
  const M = FOE_MATS;
  const g = new T.Group();
  const body = new T.Group();
  g.add(body);
  body.add(at(part(GEO.low, M.imp, 0.5, 0.56, 0.46), 0, 0.68, 0));
  body.add(at(part(GEO.ball, M.impBelly, 0.3, 0.32, 0.2), 0, 0.6, 0.3));
  body.add(at(facePlane("imp", 0.68, 0.51), 0, 0.82, 0.47));
  for (const sx of [-1, 1]) {
    const horn = at(part(GEO.cone, M.impBelly, 0.09, 0.32, 0.09), sx * 0.24, 1.25, 0);
    horn.rotation.z = -sx * 0.3;
    body.add(horn);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = at(part(GEO.ball, M.imp, 0.13, 0.2, 0.13), sx * 0.2, 0.16, 0);
    body.add(leg);
    legs.push(leg);
  }
  const tail = at(part(GEO.cone, M.imp, 0.07, 0.5, 0.07), 0, 0.5, -0.45);
  tail.rotation.x = -1.1;
  body.add(tail);
  g.userData = { body, legs, tail, top: 1.55 };
  return shadowed(g);
}
export function throwerModel() {
  const M = FOE_MATS;
  const g = new T.Group();
  const body = new T.Group();
  g.add(body);
  body.add(at(part(fur(), M.snow, 1.0, 0.95, 0.95), 0, 0.95, 0));
  body.add(at(part(fur(), M.snow, 0.72, 0.7, 0.7), 0.06, 2.15, 0));
  const head = new T.Group();
  head.position.set(-0.05, 3.1, 0);
  head.add(part(fur(), M.snow, 0.55));
  head.add(at(facePlane("thrower", 0.8, 0.6), 0, 0.02, 0.56));
  const nose = at(part(GEO.cone, M.carrot, 0.1, 0.7, 0.1), 0.05, -0.02, 0.75);
  nose.rotation.set(Math.PI / 2 + 0.25, 0, 0.3);
  head.add(nose);
  head.add(at(part(GEO.cyl, M.bucket, 0.42, 0.5, 0.42), 0.05, 0.62, 0), at(part(GEO.cyl, M.bucket, 0.52, 0.06, 0.52), 0.05, 0.38, 0));
  head.rotation.z = 0.12;
  body.add(head);
  body.add(at(part(new T.TorusGeometry(0.62, 0.13, 6, 14), M.rag, 1), 0.04, 2.62, 0));
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(sx * 0.62, 2.25, 0);
    const twig = at(part(GEO.cyl, M.twig, 0.07, 1.3, 0.07), 0, 0.6, 0);
    arm.add(twig);
    arm.rotation.z = -sx * 0.5;
    body.add(arm);
    arms.push(arm);
  }
  const held = at(part(GEO.ball, M.snow, 0.3), 0, 1.3, 0);
  arms[1].add(held);
  g.userData = { body, head, arms, held, top: 4.1 };
  return shadowed(g);
}
export function spiritModel() {
  const M = FOE_MATS;
  const g = new T.Group();
  const head = part(GEO.ball, M.spirit, 0.85, 0.8, 0.75);
  const core = part(GEO.ball, M.spiritCore, 0.5);
  const tail = part(GEO.cone, M.spirit, 0.6, 1.6, 0.6);
  tail.position.set(0, -0.2, -1.1);
  tail.rotation.x = -Math.PI / 2 - 0.3;
  const f = at(facePlane("spirit", 1.0, 0.75), 0, 0.05, 0.78);
  g.add(head, core, tail, f);
  g.userData = { head, tail, top: 1.6 };
  return g;
}
export function cannonMesh() {
  const m = new T.Mesh(cannonGeometry(), FOE_MATS.cannon);
  m.castShadow = true;
  return m;
}
export function spikeMesh() {
  return new T.Mesh(ballSpikes(), FOE_MATS.spikes);
}

// табличка с числом над монстром: синяя — ком его сомнёт, красная — монстр крупнее кома
function numberTexture(value, danger) {
  return labelTexture(String(value), { color: "#ffffff", stroke: danger ? "#a01428" : "#0c4f9a", size: 92, glow: danger ? "#ff5a6a" : "#5fb8ff" });
}
function ringTexture(hex) {
  return canvasTexture(128, 128, (g) => {
    g.strokeStyle = hex;
    g.lineWidth = 12;
    g.beginPath();
    g.arc(64, 64, 52, 0, TAU);
    g.stroke();
    g.globalAlpha = 0.35;
    g.fillStyle = hex;
    g.beginPath();
    g.arc(64, 64, 52, 0, TAU);
    g.fill();
  });
}
function arrowTexture() {
  return canvasTexture(64, 128, (g) => {
    g.fillStyle = "#ffd23a";
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      g.moveTo(32, 14 + k * 54);
      g.lineTo(58, 50 + k * 54);
      g.lineTo(44, 50 + k * 54);
      g.lineTo(32, 34 + k * 54);
      g.lineTo(20, 50 + k * 54);
      g.lineTo(6, 50 + k * 54);
      g.fill();
    }
  });
}
FOE_MATS.ring.map = ringTexture("#ff4a5e");
FOE_MATS.arrow.map = arrowTexture();
const PICK_COLORS = { gun: "#5fb8ff", spike: "#9ff4ff", wave: "#7fd0ff", boost: "#ffd23a" };

// ---------- Всё вместе: строит, двигает и взрывает ----------
export class FoeView {
  constructor(view) {
    this.view = view;
    this.fx = view.fx;
    this.recs = [];
    this.byId = new Map();
    this.tmp = V();
    // снежки пушки: один пул на всё
    this.shotMesh = new T.InstancedMesh(GEO.ball, FOE_MATS.shot, 16);
    this.shotMesh.frustumCulled = false;
    this.shotMesh.count = 0;
    view.scene.add(this.shotMesh);
    // шипы на коме и пушечка на Снежке
    this.spikes = spikeMesh();
    this.spikes.visible = false;
    view.ballMesh.add(this.spikes);
    this.cannon = cannonMesh();
    this.cannon.visible = false;
    this.cannon.position.set(0.9, 0.78, 0.05);
    this.cannon.rotation.set(0.38, -0.12, -0.25);
    view.hero.root.add(this.cannon);
    this.cannonK = 0;
    this.kick = 0;
    this.spikeK = 0;
  }

  build(level, path, world) {
    this.level = level;
    this.path = path;
    this.recs = [];
    this.byId = new Map();
    this.labels = [];
    const add = (rec) => {
      this.recs.push(rec);
      this.byId.set(rec.it.id, rec);
      world.add(rec.group);
      return rec;
    };
    for (const it of level.items) {
      if (isMonster(it)) {
        const group = new T.Group();
        const model = it.t === "yeti" ? yetiModel() : it.t === "imp" ? impModel() : it.t === "thrower" ? throwerModel() : spiritModel();
        const k = it.t === "yeti" ? (it.weak ? 1.05 : 1.4) : it.t === "imp" ? 1.45 : it.t === "thrower" ? 1.25 : 1.2;
        model.scale.setScalar(k);
        group.add(model);
        const label = new T.Mesh(GEO.plane, new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
        const lw = it.t === "imp" ? 1.8 : 2.6;
        label.scale.set(lw, lw / 2, 1);
        label.renderOrder = 5;
        world.add(label);
        const rec = add({ it, kind: it.t, group, model, label, lw, top: model.userData.top * k + 0.6, hp: -1, danger: null, dead: false, flash: 0, stun: 0, seed: it.id * 1.7 });
        this.labels.push(rec);
        if (it.t === "spirit") group.visible = label.visible = false;
        else path.place(group, it.s, it.x ?? 0, 0, false);
      } else if (isPickup(it)) {
        const group = new T.Group();
        if (it.t === "boost") {
          const arrow = new T.Mesh(GEO.plane, FOE_MATS.arrow);
          arrow.rotation.x = -Math.PI / 2;
          arrow.scale.set(1.6, 3.2, 1);
          arrow.position.y = 0.06;
          group.add(arrow);
          path.place(group, it.s, it.x, 0);
          group.rotation.y += Math.PI;
          add({ it, kind: "boost", group, arrow, dead: false });
        } else {
          const bubble = part(GEO.ball, FOE_MATS.bubble, 0.72);
          const inner = new T.Mesh(icon(it.t), FOE_MATS.icon);
          const glow = flare(tone(PICK_COLORS[it.t], 1.6), 2.6);
          group.add(bubble, inner, glow);
          path.place(group, it.s, it.x, 0.95, false);
          add({ it, kind: "pickup", group, inner, glow, dead: false, base: group.position.y });
        }
      } else if (it.t === "snowball") {
        const group = new T.Group();
        const ball = part(GEO.ball, FOE_MATS.snow, 0.45);
        ball.castShadow = true;
        group.add(ball);
        add({ it, kind: "snowball", group, ball, dead: false });
      } else if (it.t === "volley") {
        const group = new T.Group();
        const ring = new T.Mesh(GEO.plane, FOE_MATS.ring);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        const ball = part(GEO.ball, FOE_MATS.volley, 1.1);
        ball.castShadow = true;
        group.add(ring, ball);
        path.place(group, it.s, it.x, 0);
        add({ it, kind: "volley", group, ring, ball, dead: false, landed: -1 });
      }
    }
  }
  disposeLabels() {
    for (const rec of this.labels || []) rec.label.material.map?.dispose(), rec.label.material.dispose();
    this.labels = [];
  }
  // после «Продолжить» всё возвращается к контрольной точке
  resync(run) {
    for (const rec of this.recs) {
      rec.dead = !!run.used[rec.it.id] && rec.kind !== "snowball" && rec.kind !== "volley";
      rec.group.visible = !rec.dead && rec.kind !== "spirit";
      if (rec.label) rec.label.visible = rec.group.visible;
      rec.stun = 0;
    }
  }
  worldPos(rec, run) {
    const it = rec.it;
    if (rec.kind === "spirit") {
      const p = run.spiritPos();
      return p ? this.path.frame(p.s, p.x, p.y, this.tmp) : null;
    }
    const x = it.t === "imp" ? impX(it, run.time) : it.x;
    return this.path.frame(it.s, x, (rec.top || 1) * 0.5, this.tmp);
  }

  // ---------- Кадр ----------
  update(run, dt, t, menu, camQ) {
    const path = this.path;
    if (!path) return;
    const fx = this.fx;
    const view = this.view;
    const s = menu ? 0 : run.s;
    const time = run.time;
    const quality = view.q;
    for (const rec of this.recs) {
      const it = rec.it;
      if (rec.dead) continue;
      const near = it.s > s - 14 && it.s < s + 125;
      if (rec.kind === "spirit") {
        const active = !menu && run.spirit && run.spirit.i === it.id;
        rec.group.visible = rec.label.visible = !!active;
        if (!active) continue;
        const p = run.spiritPos();
        path.frame(p.s, p.x, p.y, rec.group.position);
        rec.group.rotation.set(0, -path.heading(p.s), Math.sin(t * 3) * 0.2);
        rec.model.userData.tail.rotation.z = Math.sin(t * 6) * 0.4;
        rec.model.scale.setScalar(1 + Math.sin(t * 5) * 0.05);
        // снег утекает от кома к духу
        if (Math.random() < 0.7 * quality.dust) {
          const from = view.ball.position;
          const to = rec.group.position;
          const v = V().subVectors(to, from).multiplyScalar(1.8);
          fx.puff(GLOW, from.clone().add(V(rand(-0.4, 0.4), rand(0, 0.6), rand(-0.4, 0.4))), v, 0.18, 0.06, 0.55, tone("#bff0ff", 1.8), 0.9);
        }
        this.paintLabel(rec, run, path.frame(p.s, p.x, p.y + 1.4, V()), camQ);
        continue;
      }
      rec.group.visible = near;
      if (rec.label) rec.label.visible = near && rec.kind !== "snowball";
      if (!near) continue;
      if (rec.kind === "yeti") this.animYeti(rec, run, t, dt);
      else if (rec.kind === "imp") {
        const x = impX(it, time);
        const vx = impX(it, time + 0.02) - x;
        path.place(rec.group, it.s, x, 0, false);
        rec.group.rotation.y += vx > 0 ? 0.6 : vx < 0 ? -0.6 : 0;
        const { body, legs, tail } = rec.model.userData;
        const ph = t * 16 + rec.seed;
        body.position.y = Math.abs(Math.sin(ph)) * 0.18;
        legs[0].position.z = Math.sin(ph) * 0.14;
        legs[1].position.z = -Math.sin(ph) * 0.14;
        tail.rotation.z = Math.sin(ph * 0.5) * 0.5;
      } else if (rec.kind === "thrower") this.animThrower(rec, run, t);
      else if (rec.kind === "snowball") {
        const owner = !menu && run.used[it.owner];
        const p = owner ? null : throwPos(it, time);
        rec.ball.visible = !!p;
        if (p) {
          path.frame(it.s, p.x, p.y, rec.group.position);
          rec.ball.rotation.x += dt * 9;
          if (Math.random() < 0.5 * quality.dust) fx.puff(PUFF, rec.group.position, V(rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3)), 0.18, 0.5, 0.4, tone("#ffffff", 1), 0.6);
        }
      } else if (rec.kind === "volley") this.animVolley(rec, run, t);
      else if (rec.kind === "pickup") {
        rec.group.position.y = rec.base + Math.sin(t * 2.6 + it.id) * 0.18;
        rec.inner.rotation.y = t * 1.8;
        rec.glow.scale.setScalar(2.4 + Math.sin(t * 4 + it.id) * 0.25);
      } else if (rec.kind === "boost") {
        rec.arrow.material.opacity = 0.65 + Math.sin(t * 8 - it.s * 0.3) * 0.35;
      }
      if (rec.label) this.paintLabel(rec, run, null, camQ);
    }

    // ---------- снежки пушки и их хвосты ----------
    const shots = menu ? [] : run.shots;
    const d = view.dummy;
    this.shotMesh.count = Math.min(16, shots.length);
    for (let k = 0; k < this.shotMesh.count; k++) {
      const sh = shots[k];
      path.frame(sh.s, sh.x, sh.y, d.position);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.42);
      d.updateMatrix();
      this.shotMesh.setMatrixAt(k, d.matrix);
      fx.puff(GLOW, d.position, null, 0.42, 0.05, 0.28 * (0.6 + quality.dust * 0.4), tone("#9fe0ff", 2.2), 0.9);
      if (quality.dust > 0.9) fx.puff(PUFF, d.position, V(rand(-0.5, 0.5), rand(-0.2, 0.5), rand(-0.5, 0.5)), 0.12, 0.35, 0.35, tone("#ffffff", 1), 0.5);
    }
    this.shotMesh.instanceMatrix.needsUpdate = true;

    // ---------- шипы и пушечка ----------
    const spikeOn = !menu && run.spikeT > 0;
    this.spikeK += ((spikeOn ? 1 : 0) - this.spikeK) * Math.min(1, dt * 10);
    this.spikes.visible = this.spikeK > 0.02;
    this.spikes.scale.setScalar(0.4 + this.spikeK * 0.6);
    FOE_MATS.spikes.emissiveIntensity = 0.9 + Math.sin(t * 9) * 0.35 + (spikeOn && run.spikeT < 1.2 ? Math.sin(t * 30) * 0.5 : 0);
    if (spikeOn && Math.random() < 0.4 * quality.dust) {
      const p = view.ball.position.clone().add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(view.rVis * 1.4));
      fx.puff(STAR, p, null, 0.3, 0.6, 0.4, tone("#bff4ff", 2.2), 0.9);
    }
    const armed = !menu && run.armed;
    this.cannonK += ((armed ? 1 : 0) - this.cannonK) * Math.min(1, dt * 9);
    this.cannon.visible = this.cannonK > 0.02;
    this.kick = Math.max(0, this.kick - dt * 8);
    this.cannon.scale.setScalar(1.15 * this.cannonK);
    this.cannon.position.z = 0.05 + this.kick * 0.25;
  }
  animYeti(rec, run, t, dt) {
    const { body, head, arms } = rec.model.userData;
    rec.stun = Math.max(0, rec.stun - dt);
    rec.flash = Math.max(0, rec.flash - dt * 4);
    const close = rec.it.s - run.s < 16 && rec.it.s > run.s;
    const ph = t * 2.2 + rec.seed;
    body.position.y = Math.abs(Math.sin(ph * (close ? 2.4 : 1))) * 0.12;
    body.rotation.z = rec.stun ? Math.sin(t * 14) * 0.15 : Math.sin(ph * 0.5) * 0.05;
    head.rotation.y = rec.stun ? Math.sin(t * 9) * 0.5 : Math.sin(ph * 0.7) * 0.15;
    arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * (close ? 2.3 + Math.sin(t * 12 + i) * 0.25 : 0.25 + Math.sin(ph + i * 1.5) * 0.2)));
    rec.model.scale.y = rec.model.scale.x * (1 + rec.flash * 0.18);
    if (rec.stun && Math.random() < 0.3) this.fx.puff(STAR, this.path.frame(rec.it.s, rec.it.x, rec.top + Math.sin(t * 8) * 0.2, V()).add(V(Math.cos(t * 7) * 0.7, 0, Math.sin(t * 7) * 0.7)), null, 0.3, 0.5, 0.35, tone("#ffd84a", 2), 1);
  }
  animThrower(rec, run, t) {
    const it = rec.it;
    const { body, head, arms, held } = rec.model.userData;
    // замах перед броском, бросок, отдых; рука и снежок в руке по фазе снежка
    const line = this.lineOf(it);
    let u = 0.5;
    if (line) u = (run.time / line.period + line.phase) % 1;
    const alive = !run.used[it.id];
    const wind = u > 0.75 ? (u - 0.75) / 0.25 : 0;
    const throwK = u < 0.12 ? 1 - u / 0.12 : 0;
    arms[1].rotation.x = -wind * 1.6 + throwK * 1.2;
    arms[1].rotation.z = -0.5 - wind * 0.4;
    arms[0].rotation.z = 0.5 + Math.sin(t * 3) * 0.2;
    held.visible = alive && (u > 0.4 || u < 0.02);
    body.rotation.y = wind * 0.3 - throwK * 0.4;
    head.rotation.z = 0.12 + Math.sin(t * 2 + rec.seed) * 0.08;
    rec.flash = Math.max(0, rec.flash - 0.05);
    rec.model.scale.y = 1 + rec.flash * 0.15;
  }
  lineOf(owner) {
    if (!this.lines) {
      this.lines = new Map();
      for (const it of this.level.items) if (it.t === "snowball") this.lines.set(it.owner, it);
    }
    return this.lines.get(owner.id);
  }
  animVolley(rec, run, t) {
    const st = volleyState(rec.it, run.time);
    const near = Math.abs(rec.it.s - run.s) < 70;
    rec.ring.visible = near;
    rec.ball.visible = near && st.u < 0.55;
    const k = 1.3 + st.fall * 1.6;
    rec.ring.scale.set(k * 2, k * 2, 1);
    rec.ring.material.opacity = st.hot ? 1 : 0.35 + st.fall * 0.55 + Math.sin(t * 20) * 0.1 * st.fall;
    rec.ball.position.set(0, 1.1 + (1 - st.fall) * 16, -(1 - st.fall) * 10);
    rec.ball.rotation.x += 0.2;
    const cycle = Math.floor(run.time / rec.it.period + rec.it.phase);
    if (near && st.hot && rec.landed !== cycle) {
      rec.landed = cycle;
      const p = this.path.frame(rec.it.s, rec.it.x, 0.5, V());
      this.fx.puff(RING, p, null, 0.6, 4.5, 0.5, tone("#ffffff", 1.6), 0.9);
      for (let i = 0; i < 8; i++) this.fx.puff(PUFF, p, V(rand(-4, 4), rand(1, 4), rand(-4, 4)), 0.5, 1.6, 0.8, tone(this.view.theme.dust, 1), 0.85, tone(this.view.theme.dust2, 1), 2);
      this.fx.debris(p, ["#ffffff", "#eef6ff"], 10, 7, 0.35, { up: 0.9, life: 1.2, floor: p.y - 0.5 });
      if (Math.abs(rec.it.s - run.s) < 20) this.view.shake = Math.max(this.view.shake, 0.4);
      this.view.onFoe?.("thud");
    }
  }
  paintLabel(rec, run, pos, camQ) {
    const it = rec.it;
    const hp = Math.max(0, Math.ceil(run.hp?.[it.id] ?? it.hp));
    const danger = it.t === "imp" ? true : hp >= run.size;
    const shown = it.t === "imp" ? it.v : hp;
    if (rec.hp !== shown || rec.danger !== danger) {
      rec.hp = shown;
      rec.danger = danger;
      rec.label.material.map?.dispose();
      rec.label.material.map = numberTexture(it.t === "imp" ? "−" + shown : shown, danger);
      rec.label.material.needsUpdate = true;
    }
    if (pos) rec.label.position.copy(pos);
    else this.path.frame(it.s, it.t === "imp" ? impX(it, run.time) : it.x, rec.top + (it.t === "imp" ? 0.15 : 0.3), rec.label.position);
    rec.label.quaternion.copy(camQ);
    // издалека число крупнее: читается на телефоне за полсотни метров
    const far = Math.min(2.4, Math.max(1, rec.label.position.distanceTo(this.view.camera.position) / 20));
    const k = rec.lw * far * (rec.flash ? 1 + rec.flash * 0.3 : 1);
    rec.label.scale.set(k, k / 2, 1);
  }

  // ---------- События ----------
  event(e, run) {
    const fx = this.fx;
    const view = this.view;
    const rec = e.id !== undefined ? this.byId.get(e.id) : null;
    if (e.type === "kill" && rec) {
      const p = this.worldPos(rec, run)?.clone() || view.ball.position.clone();
      rec.dead = true;
      rec.group.visible = false;
      if (rec.label) rec.label.visible = false;
      this.boom(p, rec.kind === "imp" ? 0.6 : rec.kind === "spirit" ? 0.9 : 1.2, rec.kind === "imp" ? "#7fd8ff" : rec.kind === "spirit" ? "#d8f4ff" : "#ffffff");
      view.shake = Math.max(view.shake, rec.kind === "imp" ? 0.25 : 0.55);
      if (e.how === "crush" || e.how === "spike") view.squash = 0.6;
      if (rec.kind !== "imp" || e.how !== "bite") view.joy = Math.max(view.joy, 0.5);
      if (e.how === "bite") view.hurt = Math.max(view.hurt, 0.6);
    } else if (e.type === "bonk" && rec) {
      rec.stun = 1.6;
      view.shake = Math.max(view.shake, 0.8);
      view.hurt = 1;
      view.squash = 0.9;
      view.hero.react(1.4);
      view.glanceAt("surprised", 0.8);
      const p = this.path.frame(run.s, run.x, view.rVis, V());
      fx.puff(RING, p, null, 0.6, 3, 0.4, tone("#ffd84a", 2), 0.9);
      for (let i = 0; i < 6; i++) fx.puff(STAR, p, V(rand(-3, 3), rand(1, 4), rand(-3, 3)), 0.4, 0.7, 0.6, tone("#ffd84a", 2), 1);
    } else if (e.type === "pow") {
      if (e.boss || e.wall !== undefined) {
        const p = this.path.frame(e.s, e.x, e.y, V());
        this.splat(p, 0.8);
        return;
      }
      if (rec) {
        rec.flash = 1;
        const p = this.worldPos(rec, run);
        if (p) this.splat(p.clone().add(V(0, 0.4, 0)), 0.6);
      }
    } else if (e.type === "smash") {
      view.smashItem(e.id, run);
    } else if (e.type === "pickup" && rec) {
      rec.dead = true;
      rec.group.visible = false;
      const p = rec.group.position.clone();
      const c = PICK_COLORS[rec.it.t];
      fx.puff(RING, p, null, 0.5, 4, 0.5, tone(c, 2.4), 1);
      fx.burst(p, [c, "#ffffff"], 26, 12, 0.16);
      for (let i = 0; i < 10; i++) fx.puff(STAR, p, V(rand(-3, 3), rand(0, 4), rand(-3, 3)), 0.3, 0.7, 0.7, tone(c, 2.2), 1);
      view.joy = Math.max(view.joy, 0.7);
      view.hero.react(1);
      if (rec.it.t !== "boost") view.glanceAt("joy", 0.7);
    } else if (e.type === "wave") {
      const p = this.path.frame(run.s, run.x, 0.6, V());
      for (let k = 0; k < 3; k++) fx.puff(RING, p, null, 1, 14 + k * 4, 0.6 + k * 0.12, tone(k ? "#ffffff" : "#7fd0ff", 2.4), 1);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        fx.puff(PUFF, p, V(Math.cos(a) * 14, rand(1, 3), Math.sin(a) * 14), 0.8, 2.4, 0.8, tone(view.theme.dust, 1), 0.85, tone(view.theme.dust2, 1), 2.5);
      }
      view.flash = 1;
      view.shake = Math.max(view.shake, 1);
    } else if (e.type === "spirit" && rec) {
      const p = this.path.frame(run.s + 4.5, run.x * 0.4, 2.6, V());
      fx.puff(RING, p, null, 0.5, 3.5, 0.6, tone("#bff0ff", 2.2), 0.9);
      for (let i = 0; i < 12; i++) fx.puff(GLOW, p, V(rand(-3, 3), rand(-1, 3), rand(-3, 3)), 0.3, 0.1, 0.8, tone("#bff0ff", 2), 0.9);
    } else if (e.type === "spirit-away" && rec) {
      rec.dead = true;
      rec.group.visible = rec.label.visible = false;
    } else if (e.type === "shot") {
      this.kick = 1;
      const p = this.cannon.getWorldPosition(V());
      fx.puff(GLOW, p, null, 0.6, 0.1, 0.18, tone("#bfeaff", 2.4), 1);
      fx.puff(PUFF, p, null, 0.2, 0.7, 0.3, tone("#ffffff", 1), 0.8);
    }
  }
  // снежный взрыв: вспышка, ударная волна, комья и звёздочки
  boom(p, k, hex) {
    const fx = this.fx;
    const q = this.view.q.dust;
    fx.puff(GLOW, p, null, 2.6 * k, 0.4, 0.25, tone("#ffffff", 2.6), 1);
    fx.puff(RING, p, null, 0.5 * k, 5.5 * k, 0.45, tone(hex, 2.2), 1);
    fx.debris(p, ["#ffffff", "#eef6ff", hex], Math.round(22 * k * (0.6 + q * 0.4)), 9 * k, 0.32 * k, { up: 1, life: 1.5, floor: p.y - 1.4 * k });
    for (let i = 0; i < Math.round(10 * q); i++) fx.puff(PUFF, p, V(rand(-4, 4), rand(0, 4), rand(-4, 4)).multiplyScalar(k), 0.7 * k, 2.2 * k, 0.9, tone(this.view.theme.dust, 1), 0.85, tone(this.view.theme.dust2, 1), 2.2);
    for (let i = 0; i < Math.round(8 * q); i++) fx.puff(STAR, p, V(rand(-5, 5), rand(1, 6), rand(-5, 5)), 0.35, 0.8, 0.8, tone("#ffe27a", 2.2), 1, tone("#ffffff", 1.5), 1.5);
    fx.burst(p, ["#ffffff", "#bfeaff", "#ffe27a"], Math.round(24 * q), 14 * k, 0.16);
  }
  splat(p, k) {
    const fx = this.fx;
    fx.puff(GLOW, p, null, 1.4 * k, 0.2, 0.15, tone("#ffffff", 2.2), 1);
    fx.puff(RING, p, null, 0.3, 2.2 * k, 0.3, tone("#bfeaff", 2), 0.9);
    fx.debris(p, ["#ffffff", "#eef6ff"], 6, 6, 0.18, { up: 0.6, life: 0.8, floor: p.y - 2 });
  }
}
