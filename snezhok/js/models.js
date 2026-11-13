// Модели «Снежного кома»: ёлки, камни, ворота, заборы, прессы, снеговик-босс, облики кома.
// Всё собирается из простых фигур и текстур, нарисованных на холсте, — без файлов.
import { T, TAU, GEO, hot, lit, part, at, canvasTexture, labelTexture, thinFog } from "./kit.js?v=c359cce9";

// ---------- Склейка геометрий в одну (вершинные цвета) ----------
export function merge(list) {
  const pos = [];
  const nor = [];
  const col = [];
  const color = new T.Color();
  for (const { geo, hex, m, tint } of list) {
    const local = geo.index ? geo.toNonIndexed() : geo.clone();
    const l = local.attributes.position.array.slice(); // цвет считается по своим координатам фигуры
    const g = local.applyMatrix4(m || new T.Matrix4());
    g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      nor.push(n[i], n[i + 1], n[i + 2]);
      color.set(typeof hex === "function" ? hex(l[i], l[i + 1], l[i + 2]) : hex);
      if (tint) color.multiplyScalar(tint);
      col.push(color.r, color.g, color.b);
    }
  }
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const M = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) =>
  new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));

// Ёлка: три яруса со снежными шапками и ствол. Высота около 1 (масштаб задаёт сцена).
export function firGeometry(green = "#2e7d4f", snow = "#f4f9ff") {
  const tiers = [];
  const levels = [
    [0.28, 0.42, 0.44],
    [0.5, 0.34, 0.36],
    [0.7, 0.24, 0.3],
  ];
  for (const [y, r, h] of levels) {
    const g = new T.ConeGeometry(r, h, 8, 1);
    // верх яруса — снег
    tiers.push({ geo: g, m: M(0, y, 0), hex: (px, py) => (py > h * 0.12 ? snow : green) });
  }
  tiers.push({ geo: new T.CylinderGeometry(0.05, 0.07, 0.24, 6), m: M(0, 0.1, 0), hex: "#6b4a32" });
  return merge(tiers);
}
// Ледяной шпиль ущелья
export function spireGeometry() {
  return merge([
    { geo: new T.OctahedronGeometry(1, 0), m: M(0, 0.5, 0, 0.32, 0.6, 0.32), hex: "#bdf2ff" },
    { geo: new T.OctahedronGeometry(1, 0), m: M(0.22, 0.28, 0.05, 0.16, 0.34, 0.16, 0, 0, -0.4), hex: "#8fe0ff" },
    { geo: new T.OctahedronGeometry(1, 0), m: M(-0.2, 0.22, -0.06, 0.14, 0.28, 0.14, 0, 0, 0.5), hex: "#d9f8ff" },
  ]);
}
// Камень со снежной шапкой
export function rockGeometry(stone = "#8a93a6", snow = "#f6faff", seed = 3) {
  const g = new T.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  let a = seed;
  const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.82 + r() * 0.3);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  return merge([{ geo: g, m: M(0, 0.25, 0), hex: (x, y) => (y > 0.38 ? snow : stone) }]);
}
// Сугробик: бугристая горка снега
export function pileGeometry() {
  const g = new T.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 1 + 0.09 * Math.sin(x * 7 + z * 3) + 0.07 * Math.cos(z * 9 - x * 2);
    p.setXYZ(i, x * bump, y * 0.62 * bump, z * bump);
  }
  g.computeVertexNormals();
  return g;
}
// Клин трамплина: длина 1 вдоль −z, высота 1 у дальнего края, ширина 1
export function rampGeometry() {
  const v = [
    // низ
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5,
    // верх (наклон)
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, -0.5, -0.5, 1, -0.5,
  ];
  const idx = [
    4, 5, 6, 4, 6, 7, // наклон
    3, 2, 6, 3, 6, 7, // задняя стенка
    0, 4, 7, 0, 7, 3, // левый бок
    1, 2, 6, 1, 6, 5, // правый бок
  ];
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

// ---------- Текстуры ----------
export function snowTexture() {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 256);
    let a = 7;
    const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
    // мягкие голубые наплывы — рельеф наста (рисуются с переносом через край, чтобы плитка не шила швов)
    const soft = (x, y, rad, color) => {
      for (const dx of [-256, 0, 256])
        for (const dy of [-256, 0, 256]) {
          const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
          grad.addColorStop(0, color);
          grad.addColorStop(1, "rgba(200,225,255,0)");
          g.fillStyle = grad;
          g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
        }
    };
    for (let i = 0; i < 34; i++) soft(r() * 256, r() * 256, 16 + r() * 36, "rgba(196,222,255,0.2)");
    // крупинки: голубые тени и белые искры, без серой «грязи»
    for (let i = 0; i < 900; i++) {
      const cold = r() < 0.55;
      g.fillStyle = cold ? "rgba(190,216,250,0.5)" : "rgba(255,255,255,1)";
      g.beginPath();
      g.arc(r() * 256, r() * 256, 0.5 + r() * 1.3, 0, TAU);
      g.fill();
    }
  }, true);
}
export function flakeTexture() {
  return canvasTexture(128, 128, (g) => {
    g.translate(64, 64);
    g.lineCap = "round";
    const arm = (width, color) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      for (let k = 0; k < 6; k++) {
        g.save();
        g.rotate((k * Math.PI) / 3);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -50);
        g.moveTo(0, -24);
        g.lineTo(-14, -36);
        g.moveTo(0, -24);
        g.lineTo(14, -36);
        g.moveTo(0, -38);
        g.lineTo(-8, -46);
        g.moveTo(0, -38);
        g.lineTo(8, -46);
        g.stroke();
        g.restore();
      }
    };
    g.shadowColor = "#3aa8ff";
    g.shadowBlur = 10;
    arm(15, "#1f7fe0");
    g.shadowBlur = 0;
    arm(7, "#ffffff");
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(0, 0, 9, 0, TAU);
    g.fill();
  });
}
export function crackTexture() {
  return canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, "rgba(10,30,70,1)");
    grad.addColorStop(0.62, "rgba(30,80,150,0.95)");
    grad.addColorStop(0.8, "rgba(120,200,255,0.75)");
    grad.addColorStop(1, "rgba(160,220,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    let a = 11;
    const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k <= 24; k++) {
      const ang = (k / 24) * TAU;
      const rad = 92 + r() * 30;
      const x = 128 + Math.cos(ang) * rad, y = 128 + Math.sin(ang) * rad;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(200,240,255,0.9)";
    g.lineWidth = 3;
    for (let k = 0; k < 7; k++) {
      g.beginPath();
      let x = 128, y = 128;
      g.moveTo(x, y);
      const ang = r() * TAU;
      for (let j = 0; j < 5; j++) {
        x += Math.cos(ang + (r() - 0.5)) * 22;
        y += Math.sin(ang + (r() - 0.5)) * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}
export function bricksTexture(top = "#dff6ff", line = "#8cc8ea") {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = top;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = line;
    g.lineWidth = 6;
    for (let row = 0; row < 4; row++) {
      const y = row * 64;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
      for (let c = 0; c < 3; c++) {
        const x = (c * 256) / 3 + (row % 2 ? 42 : 0);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 64);
        g.stroke();
      }
    }
    const grad = g.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(120,190,240,0.25)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }, true);
}

// Табличка с числом: синяя доска с белой каймой (на стенах крепости)
export function signTexture(text, fill = "#1d5fb8") {
  return canvasTexture(256, 128, (g) => {
    const box = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    g.fillStyle = "rgba(10,30,70,0.35)";
    box(10, 14, 236, 108, 28);
    g.fill();
    g.fillStyle = fill;
    box(8, 6, 240, 108, 28);
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = "#ffffff";
    box(12, 10, 232, 100, 24);
    g.stroke();
    const size = text.length > 3 ? 64 : 80;
    g.font = `900 ${size}px "Trebuchet MS", "Avenir Next", system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 12;
    g.strokeStyle = "#0c2f66";
    g.strokeText(text, 128, 62);
    g.fillStyle = "#ffffff";
    g.fillText(text, 128, 62);
  });
}

// ---------- Ворота ----------
const panelMats = new Map();
function panelMaterial(good) {
  const key = good ? "g" : "b";
  if (!panelMats.has(key)) {
    const tex = canvasTexture(64, 256, (g) => {
      // сочная заливка сверху вниз, светлая кайма по краям и блик наискосок
      const grad = g.createLinearGradient(0, 0, 0, 256);
      const [c0, c1] = good ? ["16,104,255", "52,156,255"] : ["240,30,70", "255,84,104"];
      // плотнее у чисел: на белом снегу и в голубом ущелье створка читается издалека
      grad.addColorStop(0, `rgba(${c0},1)`);
      grad.addColorStop(0.12, `rgba(${c0},0.95)`);
      grad.addColorStop(0.65, `rgba(${c1},0.84)`);
      grad.addColorStop(1, `rgba(${c1},0.62)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 256);
      g.fillStyle = "rgba(255,255,255,0.14)";
      g.beginPath();
      g.moveTo(0, 150);
      g.lineTo(64, 70);
      g.lineTo(64, 110);
      g.lineTo(0, 190);
      g.fill();
      g.fillStyle = good ? "rgba(225,245,255,0.95)" : "rgba(255,230,234,0.95)";
      g.fillRect(0, 0, 64, 12);
      g.fillRect(0, 0, 3, 256);
      g.fillRect(61, 0, 3, 256);
    });
    panelMats.set(key, tex);
  }
  return thinFog(new T.MeshBasicMaterial({ map: panelMats.get(key), transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false, fog: true }), 0.3);
}
const postMat = thinFog(new T.MeshStandardMaterial({ color: "#f6faff", roughness: 0.4, metalness: 0.1 }), 0.4);
const capGood = thinFog(lit("#7fd0ff", 1.6), 0.3);
const capBad = thinFog(lit("#ff6a7a", 1.6), 0.3);
export const GATE_H = 4.6;
const gateLabels = new Map();
export function gateModel(gate, labels) {
  const group = new T.Group();
  const panels = [];
  for (const [k, p] of gate.panels.entries()) {
    const good = p.op.k === "+" || p.op.k === "*";
    const w = p.x1 - p.x0;
    const mat = panelMaterial(good);
    const panel = part(GEO.plane, mat, w - 0.25, GATE_H - 0.2, 1);
    panel.position.set((p.x0 + p.x1) / 2, GATE_H / 2, 0);
    const key = `${labels[k]}:${good}`;
    if (!gateLabels.has(key)) {
      gateLabels.set(key, labelTexture(labels[k], { color: "#ffffff", stroke: good ? "#0c4f9a" : "#8a1424", size: 100 }));
    }
    const tex = gateLabels.get(key);
    const label = new T.Mesh(GEO.plane, thinFog(new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }), 0.2));
    const lw = Math.min(w - 0.4, 4.2);
    label.scale.set(lw, lw / 2, 1);
    label.position.set((p.x0 + p.x1) / 2, GATE_H * 0.68, 0.05);
    label.renderOrder = 3;
    group.add(panel, label);
    panels.push({ panel, label, good, mat });
  }
  // столбики на стыках створок и по краям
  const xs = [gate.panels[0].x0, ...gate.panels.map((p) => p.x1)];
  for (const [i, x] of xs.entries()) {
    const post = part(GEO.cyl, postMat, 0.16, GATE_H + 0.3, 0.16);
    post.position.set(x, (GATE_H + 0.3) / 2, 0);
    const neighbour = gate.panels[Math.min(i, gate.panels.length - 1)];
    const good = neighbour.op.k === "+" || neighbour.op.k === "*";
    const cap = part(GEO.ball, good ? capGood : capBad, 0.26);
    cap.position.set(x, GATE_H + 0.4, 0);
    group.add(post, cap);
  }
  group.userData.panels = panels;
  return group;
}

// ---------- Снеговик-босс ----------
const HATS = ["#d6283c", "#5fd4ff", "#7a4cff", "#2a2226"];
const SCARVES = ["#2a8a4a", "#2b6cd6", "#ffcf3a", "#ff6a2a"];
const snow = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.75 });
const coal = new T.MeshStandardMaterial({ color: "#1d1f26", roughness: 0.5 });
const carrot = new T.MeshStandardMaterial({ color: "#ff8a1e", roughness: 0.6 });
const stick = new T.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.9 });
const hats = HATS.map((color, i) => new T.MeshStandardMaterial({ color, roughness: 0.6, emissive: i === 1 ? "#2a8ab0" : "#000000", emissiveIntensity: 0.3 }));
const scarves = SCARVES.map((color) => new T.MeshStandardMaterial({ color, roughness: 0.7 }));
const hatStar = lit("#ffe27a", 2.2);
const hatBand = lit("#ff6a2a", 1.8);
const snowmanMaterials = new Set([snow, coal, carrot, stick, ...hats, ...scarves, hatStar, hatBand]);
export const keepSnowmanMaterial = (material) => snowmanMaterials.has(material);

export function snowmanModel(mountain) {
  const g = new T.Group();
  const hatMat = hats[mountain], scarfMat = scarves[mountain];
  const body = new T.Group();
  g.add(body);
  const bottom = at(part(GEO.ball, snow, 3.3), 0, 3.0, 0);
  const middle = at(part(GEO.ball, snow, 2.4), 0, 7.0, 0);
  const head = new T.Group();
  head.position.set(0, 10.2, 0);
  head.add(part(GEO.ball, snow, 1.75));
  body.add(bottom, middle, head);
  for (const s of [-1, 1]) {
    head.add(at(part(GEO.ball, coal, 0.24), s * 0.62, 0.35, 1.5));
    // сердитые брови
    const brow = at(part(GEO.box, coal, 0.7, 0.14, 0.14), s * 0.62, 0.85, 1.45);
    brow.rotation.z = s * -0.35;
    head.add(brow);
  }
  const nose = at(part(GEO.cone, carrot, 0.28, 1.4, 0.28), 0, -0.05, 2.1);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);
  for (let i = 0; i < 7; i++) {
    const ang = -0.9 + (i / 6) * 1.8;
    head.add(at(part(GEO.ball, coal, 0.11), Math.sin(ang) * 0.95, -0.6 - Math.cos(ang) * 0.25 + 0.2, 1.4));
  }
  for (let i = 0; i < 3; i++) middle.add(at(part(GEO.ball, coal, 0.11), 0, 0.5 - i * 0.4, 0.97));
  // шляпа по горе
  if (mountain === 0) {
    head.add(at(part(GEO.cone, hatMat, 1.5, 1.8), 0, 1.75, -0.1));
    head.add(at(part(GEO.ball, snow, 0.38), 0, 2.75, -0.1));
    head.add(at(part(GEO.cyl, snow, 1.55, 0.4, 1.55), 0, 0.95, -0.1));
  } else if (mountain === 1) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      head.add(at(part(GEO.oct, hatMat, 0.28, 0.75, 0.28), Math.cos(a) * 1.1, 1.65, Math.sin(a) * 1.1));
    }
  } else if (mountain === 2) {
    const cone = at(part(GEO.cone, hatMat, 1.5, 2.8), 0, 2.4, -0.1);
    cone.rotation.z = 0.25;
    head.add(cone, at(part(GEO.cyl, hatMat, 1.9, 0.18, 1.9), 0, 1.15, -0.1), at(part(GEO.oct, hatStar, 0.22), 0.5, 3.6, 0));
  } else {
    head.add(at(part(GEO.cyl, hatMat, 1.1, 1.7, 1.1), 0, 2.1, -0.1), at(part(GEO.cyl, hatMat, 1.8, 0.16, 1.8), 0, 1.3, -0.1));
    head.add(at(part(GEO.cyl, hatBand, 1.12, 0.25, 1.12), 0, 1.55, -0.1));
  }
  const scarf = at(part(GEO.cyl, scarfMat, 1.85, 0.5, 1.85), 0, 8.75, 0);
  const tail = at(part(GEO.box, scarfMat, 0.6, 1.8, 0.2), 0.9, 7.9, 1.6);
  tail.rotation.z = 0.2;
  body.add(scarf, tail);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(s * 2.2, 7.4, 0);
    const bar = at(part(GEO.cyl, stick, 0.12, 3.6, 0.12), s * 1.6, 0.6, 0);
    bar.rotation.z = s * -1.1;
    arm.add(bar);
    for (const k of [-1, 1]) {
      const twig = at(part(GEO.cyl, stick, 0.07, 0.9, 0.07), s * 3.1, 1.5 + k * 0.1, 0);
      twig.rotation.z = s * -1.1 + k * 0.6;
      arm.add(twig);
    }
    body.add(arm);
    arms.push(arm);
  }
  g.userData = { body, head, arms };
  return g;
}

// ---------- Облики кома ----------
function skinTexture(id) {
  if (id === "candy")
    return canvasTexture(256, 128, (g) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#ff3d7f";
      for (let k = -4; k < 12; k++) {
        g.beginPath();
        g.moveTo(k * 32, 0);
        g.lineTo(k * 32 + 16, 0);
        g.lineTo(k * 32 + 16 + 64, 128);
        g.lineTo(k * 32 + 64, 128);
        g.fill();
      }
      g.fillStyle = "#ff9ac0";
      for (let k = -4; k < 12; k++) g.fillRect(k * 32 + 20, 0, 3, 128);
    });
  if (id === "orange")
    return canvasTexture(256, 128, (g) => {
      g.fillStyle = "#ff8a1a";
      g.fillRect(0, 0, 256, 128);
      let a = 5;
      const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,190,90,0.5)" : "rgba(200,80,0,0.35)";
        g.beginPath();
        g.arc(r() * 256, r() * 128, 1 + r() * 2, 0, TAU);
        g.fill();
      }
    });
  if (id === "disco")
    return canvasTexture(256, 128, (g) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 32; x++) {
          const v = 120 + ((x * 37 + y * 91) % 120);
          g.fillStyle = `rgb(${v},${v},${v + 20})`;
          g.fillRect(x * 8, y * 8, 7, 7);
        }
    });
  if (id === "night")
    return canvasTexture(256, 128, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, "#0b1340");
      grad.addColorStop(1, "#2a1a5e");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 128);
      let a = 9;
      const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 110; i++) {
        g.fillStyle = r() < 0.2 ? "#ffe27a" : "#ffffff";
        g.beginPath();
        g.arc(r() * 256, r() * 128, 0.6 + r() * 1.6, 0, TAU);
        g.fill();
      }
    });
  if (id === "storm")
    return canvasTexture(256, 128, (g) => {
      // буран: голубые вихри по белому
      g.fillStyle = "#e6f6ff";
      g.fillRect(0, 0, 256, 128);
      g.lineCap = "round";
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = k % 2 ? "rgba(58,90,224,0.75)" : "rgba(95,216,255,0.85)";
        g.lineWidth = 5 + (k % 3) * 2;
        g.beginPath();
        for (let x = -10; x <= 266; x += 8) g.lineTo(x, 8 + k * 14 + Math.sin(x * 0.05 + k) * 7);
        g.stroke();
      }
    });
  if (id === "hunter")
    return canvasTexture(256, 128, (g) => {
      // снег с отпечатками лап йети
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = "rgba(122,150,190,0.55)";
      for (let k = 0; k < 10; k++) {
        const x = (k * 53) % 256, y = (k * 37) % 128;
        g.beginPath();
        g.ellipse(x, y, 9, 12, 0.4, 0, TAU);
        g.fill();
        for (let t = 0; t < 3; t++) {
          g.beginPath();
          g.arc(x - 8 + t * 8, y - 15, 3.4, 0, TAU);
          g.fill();
        }
      }
    });
  if (id === "ice")
    return canvasTexture(256, 128, (g) => {
      g.fillStyle = "#bfeeff";
      g.fillRect(0, 0, 256, 128);
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = 2;
      let a = 3;
      const r = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 30; i++) {
        g.beginPath();
        g.moveTo(r() * 256, r() * 128);
        g.lineTo(r() * 256, r() * 128);
        g.stroke();
      }
    });
  return null;
}
// Материал облика; snow — общий снежный с бликами (его даёт сцена)
export function skinMaterial(id, env, snow) {
  const map = skinTexture(id);
  switch (id) {
    case "ice":
      return new T.MeshStandardMaterial({ map, color: "#8fdcff", roughness: 0.1, metalness: 0.2, envMap: env, envMapIntensity: 1.5, flatShading: true, emissive: "#1a7ac0", emissiveIntensity: 0.35 });
    case "candy":
      return new T.MeshStandardMaterial({ map, roughness: 0.25, metalness: 0, envMap: env, envMapIntensity: 0.8 });
    case "orange":
      return new T.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0, envMap: env, envMapIntensity: 0.5 });
    case "disco":
      return new T.MeshStandardMaterial({ map, roughness: 0.18, metalness: 1, envMap: env, envMapIntensity: 2.2, flatShading: true });
    case "storm":
      return new T.MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.1, envMap: env, envMapIntensity: 1.1, emissive: "#5fd8ff", emissiveMap: map, emissiveIntensity: 0.25 });
    case "hunter":
      return new T.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0 });
    case "night":
      return new T.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.2, envMap: env, envMapIntensity: 0.9, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 0.55 });
    default:
      return snow;
  }
}
const smoothSkin = new T.SphereGeometry(1, 40, 26);
const iceSkin = new T.IcosahedronGeometry(1, 2);
const discoSkin = new T.SphereGeometry(1, 24, 14);
export function skinGeometry(id) {
  if (id === "ice") return iceSkin;
  if (id === "disco") return discoSkin;
  return smoothSkin;
}
// Хвостик мандарина
export function leafModel() {
  const g = new T.Group();
  const leaf = part(GEO.ball, new T.MeshStandardMaterial({ color: "#3aa84a", roughness: 0.6 }), 0.32, 0.06, 0.16);
  leaf.position.set(0.2, 1.02, 0);
  leaf.rotation.z = -0.4;
  g.add(leaf, at(part(GEO.cyl, new T.MeshStandardMaterial({ color: "#5a7a2a" }), 0.05, 0.2, 0.05), 0, 1.0, 0));
  return g;
}
export { hot };
