// Снежок — характер кома: вязаная шапка с помпоном, шарф с хвостами по ветру и лицо.
// Тело кома катится, а шапка, шарф и лицо держатся прямо: они живут в группе root,
// которая вращается только по направлению трассы. Голова (лицо и шапка) умеет
// оглядываться на камеру; шарф остаётся по трассе, и его хвосты всегда летят по ветру.
// Всё в масштабе кома радиусом 1: сцена растягивает root вместе с комом.
import { T, TAU, GEO, part, at, lit, canvasTexture } from "./kit.js?v=51f23175";

// ---------- Наряды по обликам ----------
export const OUTFITS = {
  snow: { hat: "#ff4b5c", band: "#ffffff", pom: "#ffffff", scarf: "#ffc53a", stripe: "#ff6a3d" },
  ice: { hat: "#2c6be0", band: "#bff0ff", pom: "#ffffff", scarf: "#ffffff", stripe: "#3aa8ff" },
  candy: { hat: "#2fcf9c", band: "#ffffff", pom: "#ff4f8f", scarf: "#2fcf9c", stripe: "#ffffff" },
  orange: { leaf: true, scarf: "#36a84a", stripe: "#c8f07a" },
  disco: { hat: "#8a4cff", band: "#ffd23a", pom: "#ffd23a", scarf: "#ff4fc8", stripe: "#ffd23a" },
  night: { hat: "#ffcf3a", band: "#ff8a3a", pom: "#ffffff", scarf: "#ffcf3a", stripe: "#7a4cff" },
  hunter: { hat: "#8a5a32", band: "#f0dcb0", pom: "#f4ead2", scarf: "#2e7d4f", stripe: "#ffcf3a" },
  storm: { hat: "#3a5ae0", band: "#bff4ff", pom: "#bff4ff", scarf: "#5fd8ff", stripe: "#ffffff" },
};

// ---------- Лицо: рисунок на холсте, натянутый на кусочек сферы ----------
// Холст 512×384: по горизонтали поворот ±64°, по вертикали от +36° (вверх) до −60°, 4 пикселя на градус.
const FACE_W = (64 * Math.PI) / 180;
const FACE_UP = (36 * Math.PI) / 180;
const FACE_DOWN = (60 * Math.PI) / 180;
const INK = "#1b2246";
const EYE_Y = 112, MOUTH_Y = 184, CHEEK_Y = 160;
const EYES = [256 - 76, 256 + 76];

function faceGeometry() {
  // фронт кома — направление −z (туда он катится); u=0 у правой щеки персонажа
  return new T.SphereGeometry(1.012, 40, 28, 1.5 * Math.PI - FACE_W, FACE_W * 2, Math.PI / 2 - FACE_UP, FACE_UP + FACE_DOWN);
}

// обводка белым под каждой чертой: лицо читается и на тёмных обликах
function halo(g, path, width) {
  g.save();
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = width;
  g.lineCap = g.lineJoin = "round";
  path();
  g.stroke();
  g.restore();
}
function inkStroke(g, path, width) {
  halo(g, path, width + 7);
  g.save();
  g.strokeStyle = INK;
  g.lineWidth = width;
  g.lineCap = g.lineJoin = "round";
  path();
  g.stroke();
  g.restore();
}
function cheeks(g, k = 1) {
  for (const x of [256 - 146, 256 + 146]) {
    const grad = g.createRadialGradient(x, CHEEK_Y, 2, x, CHEEK_Y, 36);
    grad.addColorStop(0, `rgba(255,105,140,${0.8 * k})`);
    grad.addColorStop(0.6, `rgba(255,120,150,${0.45 * k})`);
    grad.addColorStop(1, "rgba(255,120,150,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, CHEEK_Y, 38, 24, 0, 0, TAU);
    g.fill();
  }
}
function ovalEyes(g, ry = 36, clip = null) {
  for (const [i, x] of EYES.entries()) {
    g.save();
    if (clip) clip(g, x, i ? 1 : -1);
    const oval = () => {
      g.beginPath();
      g.ellipse(x, EYE_Y, ry * 0.72, ry, 0, 0, TAU);
    };
    halo(g, oval, 8);
    g.fillStyle = INK;
    oval();
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(x - ry * 0.24, EYE_Y - ry * 0.36, ry * 0.3, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(x + ry * 0.24, EYE_Y + ry * 0.4, ry * 0.13, 0, TAU);
    g.fill();
    g.restore();
  }
}
function smile(g, w, depth, tongue = true) {
  const y = MOUTH_Y - depth * 0.3;
  const shape = () => {
    g.beginPath();
    g.moveTo(256 - w, y);
    g.quadraticCurveTo(256, y + depth * 1.25, 256 + w, y);
    g.quadraticCurveTo(256, y + depth * 0.22, 256 - w, y);
    g.closePath();
  };
  halo(g, shape, 12);
  g.fillStyle = "#7a1d3a";
  shape();
  g.fill();
  if (tongue) {
    g.save();
    shape();
    g.clip();
    g.fillStyle = "#ff7a96";
    g.beginPath();
    g.ellipse(256, y + depth * 0.95, w * 0.55, depth * 0.38, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.lineJoin = "round";
  shape();
  g.stroke();
}

const FACES = {
  happy(g) {
    cheeks(g);
    ovalEyes(g);
    smile(g, 31, 36);
  },
  blink(g) {
    cheeks(g);
    for (const x of EYES) inkStroke(g, () => (g.beginPath(), g.arc(x, EYE_Y + 20, 23, Math.PI * 1.18, Math.PI * 1.82)), 8);
    smile(g, 31, 36);
  },
  joy(g) {
    cheeks(g, 1.15);
    for (const x of EYES) inkStroke(g, () => (g.beginPath(), g.arc(x, EYE_Y + 14, 24, Math.PI * 1.1, Math.PI * 1.9)), 10);
    smile(g, 36, 44);
  },
  surprised(g) {
    cheeks(g, 0.7);
    for (const x of EYES) {
      const ring = () => (g.beginPath(), g.arc(x, EYE_Y - 2, 30, 0, TAU));
      halo(g, ring, 10);
      g.fillStyle = "#ffffff";
      ring();
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 5;
      ring();
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x, EYE_Y, 15, 0, TAU);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x - 5, EYE_Y - 5, 5, 0, TAU);
      g.fill();
      // брови домиком
      inkStroke(g, () => (g.beginPath(), g.arc(x, EYE_Y - 36, 24, Math.PI * 1.2, Math.PI * 1.8)), 7);
    }
    const o = () => (g.beginPath(), g.ellipse(256, MOUTH_Y + 2, 14, 18, 0, 0, TAU));
    halo(g, o, 10);
    g.fillStyle = "#7a1d3a";
    o();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 5;
    o();
    g.stroke();
  },
  determined(g) {
    cheeks(g, 0.8);
    // глаза чуть прикрыты наклонной чертой: взгляд «сейчас разнесу»
    ovalEyes(g, 32, (g, x, s) => {
      g.beginPath();
      g.moveTo(x - 40, EYE_Y - 14 + s * 9);
      g.lineTo(x + 40, EYE_Y - 14 - s * 9);
      g.lineTo(x + 40, EYE_Y + 60);
      g.lineTo(x - 40, EYE_Y + 60);
      g.closePath();
      g.clip();
    });
    for (const [i, x] of EYES.entries()) {
      const s = i ? 1 : -1; // внутренний край брови ниже
      inkStroke(g, () => (g.beginPath(), g.moveTo(x + s * 30, EYE_Y - 48), g.lineTo(x - s * 26, EYE_Y - 32)), 11);
    }
    // уверенная улыбка с зубами
    const y = MOUTH_Y - 6;
    const grin = () => {
      g.beginPath();
      g.moveTo(256 - 30, y);
      g.quadraticCurveTo(256, y + 12, 256 + 30, y);
      g.quadraticCurveTo(256 + 26, y + 26, 256, y + 27);
      g.quadraticCurveTo(256 - 26, y + 26, 256 - 30, y);
      g.closePath();
    };
    halo(g, grin, 12);
    g.fillStyle = "#ffffff";
    grin();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 5;
    grin();
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(256 - 24, y + 11);
    g.quadraticCurveTo(256, y + 19, 256 + 24, y + 11);
    g.stroke();
  },
  dizzy(g) {
    cheeks(g, 0.6);
    for (const [i, x] of EYES.entries()) {
      inkStroke(g, () => {
        g.beginPath();
        for (let a = 0; a <= TAU * 2.2; a += 0.2) {
          const r = 2 + a * 3.6;
          const px = x + Math.cos(a * (i ? 1 : -1)) * r, py = EYE_Y + Math.sin(a * (i ? 1 : -1)) * r;
          a ? g.lineTo(px, py) : g.moveTo(px, py);
        }
      }, 5);
    }
    inkStroke(g, () => {
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const px = 256 - 26 + (52 * k) / 24, py = MOUTH_Y + Math.sin((k / 24) * TAU * 2) * 5;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
    }, 5);
  },
};
const faceCache = new Map();
function faceTexture(kind) {
  if (!faceCache.has(kind)) {
    const tex = canvasTexture(512, 384, (g) => FACES[kind](g));
    tex.anisotropy = 8;
    faceCache.set(kind, tex);
  }
  return faceCache.get(kind);
}

// ---------- Вязаные текстуры ----------
function shade(g, w, h, rows, cols, dark = "rgba(0,0,0,0.13)", light = "rgba(255,255,255,0.16)") {
  // петли «ёлочкой»: столбики из V
  const cw = w / cols, rh = h / rows;
  g.lineWidth = Math.max(1.5, cw * 0.16);
  g.lineCap = "round";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * cw, y = r * rh;
      g.strokeStyle = dark;
      g.beginPath();
      g.moveTo(x + cw * 0.12, y + rh * 0.15);
      g.lineTo(x + cw * 0.5, y + rh * 0.85);
      g.lineTo(x + cw * 0.88, y + rh * 0.15);
      g.stroke();
      g.strokeStyle = light;
      g.beginPath();
      g.moveTo(x + cw * 0.2, y + rh * 0.05);
      g.lineTo(x + cw * 0.5, y + rh * 0.6);
      g.stroke();
    }
}
function knitTexture(base, band) {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    if (band) {
      g.fillStyle = band;
      g.fillRect(0, 70, 128, 22);
    }
    shade(g, 128, 128, 12, 6);
  });
  tex.wrapS = T.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}
function ribTexture(base) {
  const tex = canvasTexture(64, 32, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 32);
    for (let x = 0; x < 64; x += 16) {
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(x + 10, 0, 6, 32);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fillRect(x + 2, 0, 3, 32);
    }
  });
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(26, 1);
  return tex;
}
function scarfTexture(base, stripe) {
  const tex = canvasTexture(128, 64, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = stripe;
    g.fillRect(16, 0, 18, 64);
    g.fillRect(48, 0, 8, 64);
    shade(g, 128, 64, 4, 8);
  });
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(7, 1);
  return tex;
}
// хвост шарфа: полоски поперёк и бахрома на конце (по v: 0 у узла, 1 на кончике)
function tailTexture(base, stripe) {
  return canvasTexture(64, 256, (g) => {
    g.clearRect(0, 0, 64, 256);
    g.fillStyle = base;
    g.fillRect(0, 34, 64, 222);
    g.fillStyle = stripe;
    for (const y of [52, 120, 188]) g.fillRect(0, y, 64, 22);
    g.fillRect(0, 92, 64, 8);
    g.fillRect(0, 160, 64, 8);
    shade(g, 64, 222, 9, 4);
    // бахрома
    for (let x = 3; x < 64; x += 8) {
      g.fillStyle = base;
      g.fillRect(x, 4, 4, 34);
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(x + 3, 4, 1, 34);
    }
  });
}

// помпон: пушистый неровный шар
function pomGeometry() {
  const g = new T.SphereGeometry(1, 22, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // пушистые бугорки: сумма синусов по направлению, одинаковая на шве
    const k = 1 + 0.07 * Math.sin(x * 9 + y * 4) * Math.sin(z * 8 - y * 5) + 0.05 * Math.sin((x + z) * 13 + y * 11);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
function starGeometry() {
  const s = new T.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + Math.PI / 2;
    const r = k % 2 ? 0.45 : 1;
    k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new T.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false });
  g.translate(0, 0, -0.175);
  return g;
}

// ---------- Хвосты шарфа: две ленточки одной сеткой ----------
const SEG = 8;
const TAILS = [
  { len: 1.35, splay: -0.25, lift: 0.34, phase: 0, w: 0.2 },
  { len: 1.1, splay: 0.3, lift: -0.16, phase: 1.9, w: 0.18 },
];
const SCARF_Y = -0.5;
const KNOT = 0.62; // узел сзади-справа (угол от «спины» к правому боку)

const ANG = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Hero {
  constructor() {
    this.root = new T.Group();
    this.head = new T.Group();
    this.neck = new T.Group();
    this.root.add(this.head, this.neck);

    // лицо
    this.faceMat = new T.MeshStandardMaterial({ map: faceTexture("happy"), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.face = new T.Mesh(faceGeometry(), this.faceMat);
    this.face.renderOrder = 2;
    this.head.add(this.face);

    // шапка: макушка, отворот, помпон — чуть набекрень
    this.hat = new T.Group();
    this.hat.rotation.set(-0.1, 0, -0.16);
    this.domeMat = new T.MeshStandardMaterial({ roughness: 0.95 });
    this.cuffMat = new T.MeshStandardMaterial({ roughness: 0.95 });
    this.pomMat = new T.MeshStandardMaterial({ roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.12 });
    const dome = new T.Mesh(new T.SphereGeometry(1.04, 36, 14, 0, TAU, 0, 0.86), this.domeMat);
    dome.scale.set(1, 1.16, 1);
    const cuff = new T.Mesh(new T.TorusGeometry(0.79, 0.125, 12, 44), this.cuffMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = 0.74;
    this.pom = new T.Mesh(pomGeometry(), this.pomMat);
    this.pom.scale.setScalar(0.31);
    this.pom.position.y = 1.47;
    this.hat.add(dome, cuff, this.pom);
    this.head.add(this.hat);
    // веточка с листиками — для мандарина вместо шапки
    this.sprig = new T.Group();
    {
      const green = new T.MeshStandardMaterial({ color: "#3fae4a", roughness: 0.55 });
      const stem = new T.Mesh(GEO.cyl, new T.MeshStandardMaterial({ color: "#6a7a2a", roughness: 0.8 }));
      stem.scale.set(0.07, 0.3, 0.07);
      stem.position.y = 1.08;
      const leafA = part(GEO.ball, green, 0.36, 0.07, 0.17);
      leafA.position.set(0.24, 1.2, 0.02);
      leafA.rotation.z = 0.45;
      const leafB = part(GEO.ball, green, 0.28, 0.06, 0.14);
      leafB.position.set(-0.18, 1.16, -0.05);
      leafB.rotation.set(0.2, 0.6, -0.5);
      this.sprig.add(stem, leafA, leafB);
      this.sprig.visible = false;
    }
    this.head.add(this.sprig);

    // шарф: кольцо, узел и два хвоста
    this.scarfMat = new T.MeshStandardMaterial({ roughness: 0.95 });
    const ring = new T.Mesh(new T.TorusGeometry(0.87, 0.16, 12, 48), this.scarfMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = SCARF_Y;
    this.knot = new T.Mesh(GEO.ball, this.scarfMat);
    this.knot.scale.set(0.2, 0.19, 0.15);
    this.knot.position.set(Math.sin(KNOT) * 0.98, SCARF_Y - 0.02, Math.cos(KNOT) * 0.98);
    this.knot.rotation.y = KNOT;
    this.tailMat = new T.MeshStandardMaterial({ roughness: 0.95, side: T.DoubleSide, alphaTest: 0.5 });
    this.tails = new T.Mesh(this.tailGeometry(), this.tailMat);
    this.tails.frustumCulled = false;
    this.neck.add(ring, this.knot, this.tails);

    // звёздочки над головой, когда ком оглушён
    this.stars = new T.Group();
    const starGeo = starGeometry();
    const starMat = lit("#ffd84a", 1.7);
    for (let k = 0; k < 3; k++) this.stars.add(part(starGeo, starMat, 0.17));
    this.stars.visible = false;
    this.head.add(this.stars);

    this.yaw = 0;
    this.mood = "happy";
    this.temp = null; // временное выражение { mood, t }
    this.blink = 2;
    this.wob = 0;
    this.wobV = 0;
    this.hop = 0;
    this.dressed = null;
    this.dress("snow");
  }

  tailGeometry() {
    const g = new T.BufferGeometry();
    const n = TAILS.length * (SEG + 1) * 2;
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(n * 3), 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute("normal", new T.BufferAttribute(new Float32Array(n * 3), 3).setUsage(T.DynamicDrawUsage));
    const uv = [], idx = [];
    TAILS.forEach((_, k) => {
      const base = k * (SEG + 1) * 2;
      for (let i = 0; i <= SEG; i++) uv.push(0, i / SEG, 1, i / SEG);
      for (let i = 0; i < SEG; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.tp = { P: new T.Vector3(), D: new T.Vector3(), W: new T.Vector3(), X: new T.Vector3(), up: new T.Vector3(0, 1, 0) };
    return g;
  }

  // наряд под облик кома
  dress(id) {
    if (this.dressed === id) return;
    this.dressed = id;
    const o = OUTFITS[id] || OUTFITS.snow;
    this.cache ||= new Map();
    if (!this.cache.has(id)) {
      this.cache.set(id, {
        dome: o.hat && knitTexture(o.hat, o.band),
        cuff: o.hat && ribTexture(o.hat),
        scarf: scarfTexture(o.scarf, o.stripe),
        tail: tailTexture(o.scarf, o.stripe),
      });
    }
    const c = this.cache.get(id);
    this.hat.visible = !o.leaf;
    this.sprig.visible = !!o.leaf;
    if (!o.leaf) {
      this.domeMat.map = c.dome;
      this.cuffMat.map = c.cuff;
      this.pomMat.color.set(o.pom);
      this.pomMat.emissive.set(o.pom);
      this.domeMat.needsUpdate = this.cuffMat.needsUpdate = true;
    }
    this.scarfMat.map = c.scarf;
    this.tailMat.map = c.tail;
    this.scarfMat.needsUpdate = this.tailMat.needsUpdate = true;
    this.setGlow(this.glowK || 0);
  }

  // ночью шапка и шарф чуть светятся своим цветом: наряд не тонет в синих сумерках
  setGlow(k) {
    this.glowK = k;
    this.pomMat.emissiveIntensity = 0.12 + k * 0.6;
    for (const m of [this.domeMat, this.cuffMat, this.scarfMat, this.tailMat]) {
      m.emissive.set(k ? "#ffffff" : "#000000");
      m.emissiveIntensity = k;
      if (m.emissiveMap !== (k ? m.map : null)) {
        m.emissiveMap = k ? m.map : null;
        m.needsUpdate = true;
      }
    }
  }

  // временное выражение лица
  say(mood, time) {
    this.temp = { mood, t: time };
  }
  // шапка подпрыгивает и качается
  react(power = 1) {
    this.wobV += (Math.random() < 0.5 ? -1 : 1) * 5 * power;
    this.hop = Math.max(this.hop, 0.6 * power);
  }

  // o: { t, dt, yaw — куда смотреть (0 — вперёд), turn — скорость поворота, mood — основное выражение,
  //      flow — 0…1 насколько дует встречный ветер, lean — крен в повороте, bob — подпрыгивание на месте }
  update(o) {
    const dt = o.dt;
    // голова: кратчайший поворот к цели
    const k = 1 - Math.exp(-dt * (o.turn || 8));
    this.yaw = ANG(this.yaw + ANG(o.yaw - this.yaw) * k);
    this.head.rotation.set(0, this.yaw, 0);
    // на ходу узел сзади; когда Снежок смотрит на игрока, шарф поворачивается вместе с ним, узел сбоку
    const neckGoal = o.neck === undefined ? 0 : o.neck;
    this.neckYaw = ANG((this.neckYaw || 0) + ANG(neckGoal - (this.neckYaw || 0)) * k);
    this.neck.rotation.y = this.neckYaw;
    this.head.position.y = (o.bob || 0) * Math.abs(Math.sin(o.t * 6)) * 0.05 + Math.sin(o.t * 2.1) * 0.012;

    // выражение и моргание
    let mood = o.mood;
    if (this.temp) {
      this.temp.t -= dt;
      if (this.temp.t <= 0) this.temp = null;
      else mood = this.temp.mood;
    }
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 1.8 + Math.random() * 2.8;
    const face = mood === "happy" && this.blink < 0 ? "blink" : mood;
    if (face !== this.face.userData.kind) {
      this.face.userData.kind = face;
      this.faceMat.map = faceTexture(face);
      this.faceMat.needsUpdate = true;
    }

    // шапка на пружинке
    this.wobV += (-this.wob * 90 - this.wobV * 7) * dt;
    this.wob += this.wobV * dt;
    this.hop = Math.max(0, this.hop - dt * 3);
    const dizzy = mood === "dizzy";
    this.hat.rotation.z = -0.16 + this.wob * 0.12 + (dizzy ? 0.35 : 0);
    this.hat.rotation.x = -0.1 + (o.flow || 0) * 0.08 + (dizzy ? 0.15 : 0);
    this.hat.position.y = Math.sin(Math.min(1, this.hop) * Math.PI) * 0.12;
    this.pom.position.x = this.wob * 0.06;
    this.sprig.rotation.z = this.wob * 0.2;

    // звёздочки кругом
    this.stars.visible = dizzy;
    if (dizzy)
      this.stars.children.forEach((s, i) => {
        const a = o.t * 3.2 + (i * TAU) / 3;
        s.position.set(Math.cos(a) * 0.95, 1.25 + Math.sin(a * 2) * 0.06, Math.sin(a) * 0.95);
        s.rotation.set(0, -a + o.t * 2, 0.3);
      });

    this.updateTails(o.t, o.flow || 0);
  }

  updateTails(t, flow) {
    const { P, D, W, X, up } = this.tp;
    const pos = this.tails.geometry.attributes.position.array;
    const ax = Math.sin(KNOT) * 1.04, az = Math.cos(KNOT) * 1.04;
    const speed = 2.2 + flow * 11;
    TAILS.forEach((tail, n) => {
      // основное направление: свисает вниз без ветра, летит назад и вбок на ходу
      D.set(0.3 + flow * 0.62 + tail.splay * 0.35, -(1 - flow) + tail.lift * flow, 0.32 + flow * 0.72 + tail.splay * 0.2 * flow).normalize();
      W.set(D.z, 0, -D.x).normalize();
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const amp = (0.05 + flow * 0.19) * u;
        P.set(ax + tail.splay * 0.08, SCARF_Y - 0.04, az).addScaledVector(D, tail.len * u);
        P.y += Math.sin(t * speed - u * 4.2 + tail.phase) * amp + (flow * 0.12 - 0.04) * u * u;
        P.addScaledVector(W, Math.cos(t * speed * 0.7 - u * 3 + tail.phase) * amp * 0.7);
        // ленточка перекручивается на ветру
        const tw = Math.sin(t * speed * 0.45 + u * 2.4 + tail.phase) * 0.55 * flow * u;
        X.crossVectors(D, W);
        const hw = tail.w * (1 - 0.18 * u);
        const wx = (W.x * Math.cos(tw) + X.x * Math.sin(tw)) * hw;
        const wy = (W.y * Math.cos(tw) + X.y * Math.sin(tw)) * hw;
        const wz = (W.z * Math.cos(tw) + X.z * Math.sin(tw)) * hw;
        const j = (n * (SEG + 1) + i) * 6;
        pos[j] = P.x - wx;
        pos[j + 1] = P.y - wy;
        pos[j + 2] = P.z - wz;
        pos[j + 3] = P.x + wx;
        pos[j + 4] = P.y + wy;
        pos[j + 5] = P.z + wz;
      }
    });
    const g = this.tails.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }
}
