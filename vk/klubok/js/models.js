// Фигурки «Волшебного клубочка»: котёнок Пуговка, клубочек, друзья у выхода, угощения, ключи.
// Всё из простых фигур Three.js, без загружаемых моделей.
import * as T from "../vendor/three/three.module.min.js?v=498e67fe";

const pie = Math.PI;
export const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
export const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
export const glowColor = (c, k = 2.2) => new T.Color(c).multiplyScalar(k);
export const KEY_COLORS = ["#ff4f6d", "#3f8cff", "#3fcf6a"];

export function canvasTexture(w, h, draw, repeat = null) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}
export const glowTex = canvasTexture(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
});
export const glowSprite = (color, size, opacity = 0.9) => {
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
};

const ball = (r, mat, w = 20, h = 14) => new T.Mesh(new T.SphereGeometry(r, w, h), mat);
const at = (mesh, x, y, z) => {
  mesh.position.set(x, y, z);
  return mesh;
};
const EYE_W = glossy("#ffffff", { roughness: 0.15 }),
  EYE_D = glossy("#1a1420", { roughness: 0.15 }),
  SHINE = new T.MeshBasicMaterial({ color: "#ffffff" });
// Большие блестящие глазки
function eyes(parent, x, y, z, r = 0.085, spread = 1) {
  const out = [];
  for (const s of [-1, 1]) {
    const e = new T.Group();
    e.position.set(s * x * spread, y, z);
    e.add(ball(r, EYE_W, 16, 12));
    const p = at(ball(r * 0.72, EYE_D, 14, 10), 0, 0, r * 0.45);
    e.add(p);
    e.add(at(ball(r * 0.22, SHINE, 8, 6), r * 0.25, r * 0.3, r * 0.95));
    parent.add(e);
    out.push(e);
  }
  return out;
}

// ---------- Котёнок Пуговка ----------
export function kitten() {
  const g = new T.Group();
  const fur = matte("#ffa04a", { roughness: 0.7 }),
    dark = matte("#e0702a", { roughness: 0.7 }),
    white = matte("#fff6ec", { roughness: 0.75 }),
    pink = matte("#ff9fb8", { roughness: 0.6 });
  const body = new T.Group();
  g.add(body);
  const torso = at(ball(0.3, fur, 22, 16), 0, 0.4, -0.02);
  torso.scale.set(1, 0.92, 1.15);
  torso.castShadow = true;
  body.add(torso);
  const chest = at(ball(0.2, white, 18, 12), 0, 0.38, 0.2);
  chest.scale.set(1, 1.1, 0.7);
  body.add(chest);
  // Полоски на спинке
  for (let i = 0; i < 3; i++) {
    const st = at(new T.Mesh(new T.TorusGeometry(0.255, 0.025, 6, 20, pie * 0.9), dark), 0, 0.42, -0.18 + i * 0.12);
    st.rotation.set(0, pie / 2, pie * 0.55);
    st.scale.set(1, 1, 1.15);
    body.add(st);
  }
  // Голова
  const head = new T.Group();
  head.position.set(0, 0.84, 0.1);
  body.add(head);
  const skull = ball(0.33, fur, 24, 18);
  skull.scale.set(1.12, 0.96, 1);
  skull.castShadow = true;
  head.add(skull);
  const muzzle = at(ball(0.14, white, 16, 12), 0, -0.1, 0.26);
  muzzle.scale.set(1.35, 0.8, 0.8);
  head.add(muzzle);
  head.add(at(ball(0.045, pink, 10, 8), 0, -0.04, 0.37));
  const mouth = at(new T.Mesh(new T.TorusGeometry(0.035, 0.009, 6, 12, pie), EYE_D), 0, -0.12, 0.36);
  mouth.rotation.z = pie;
  head.add(mouth);
  const eyeL = eyes(head, 0.13, 0.04, 0.26, 0.085);
  for (const s of [-1, 1]) {
    const ear = at(new T.Mesh(new T.ConeGeometry(0.12, 0.22, 4), fur), s * 0.2, 0.28, -0.02);
    ear.rotation.set(0, pie / 4, -s * 0.32);
    head.add(ear);
    (head.userData.ears ||= []).push(ear);
    const inner = at(new T.Mesh(new T.ConeGeometry(0.065, 0.13, 4), pink), s * 0.195, 0.26, 0.025);
    inner.rotation.set(0, pie / 4, -s * 0.32);
    head.add(inner);
    // Усы
    for (let k = -1; k <= 1; k++) {
      const wh = at(new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.22, 4), white), s * 0.2, -0.08 + k * 0.03, 0.3);
      wh.rotation.z = pie / 2 + s * k * 0.15;
      head.add(wh);
    }
    // Щёчки
    const cheek = at(ball(0.04, matte("#ff8fa8", { roughness: 0.6, transparent: true, opacity: 0.7 }), 10, 8), s * 0.21, -0.07, 0.22);
    cheek.scale.set(1, 0.6, 0.4);
    head.add(cheek);
  }
  // Ошейник с колокольчиком (ночью колокольчик — фонарик)
  const collar = at(new T.Mesh(new T.TorusGeometry(0.2, 0.03, 8, 24), glossy("#3f8cff")), 0, 0.62, 0.08);
  collar.rotation.x = pie / 2 - 0.25;
  body.add(collar);
  const bell = at(ball(0.055, glossy("#ffc533", { metalness: 0.5, roughness: 0.25, emissive: new T.Color("#000000") }), 14, 10), 0, 0.56, 0.28);
  body.add(bell);
  // Лапки
  const legs = [];
  for (const [x, z] of [
    [-0.14, 0.17],
    [0.14, 0.17],
    [-0.14, -0.2],
    [0.14, -0.2],
  ]) {
    const leg = new T.Group();
    leg.position.set(x, 0.2, z);
    const paw = at(new T.Mesh(new T.CapsuleGeometry(0.075, 0.12, 4, 10), fur), 0, -0.08, 0);
    leg.add(paw);
    leg.add(at(ball(0.08, white, 12, 8), 0, -0.16, 0.02));
    body.add(leg);
    legs.push(leg);
  }
  // Хвост
  const tail = new T.Group();
  tail.position.set(0, 0.42, -0.32);
  const curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0, 0.12, -0.2), new T.Vector3(0, 0.38, -0.26), new T.Vector3(0.06, 0.56, -0.16)]);
  tail.add(new T.Mesh(new T.TubeGeometry(curve, 20, 0.055, 8, false), fur));
  tail.add(at(ball(0.065, white, 10, 8), 0.06, 0.56, -0.16));
  body.add(tail);
  return { g, body, head, legs, tail, bell, eyes: eyeL };
}

// ---------- Клубочек ----------
export const YARN = "#ff4f8a";
const yarnTex = canvasTexture(256, 128, (x, w, h) => {
  x.fillStyle = YARN;
  x.fillRect(0, 0, w, h);
  x.lineWidth = 5;
  for (let k = 0; k < 3; k++) {
    x.strokeStyle = ["#ff7fae", "#d92f6a", "#ff9fc4"][k];
    for (let i = -8; i < 16; i++) {
      x.beginPath();
      const a = k * 0.7;
      for (let u = 0; u <= w; u += 8) {
        const v = i * 14 + Math.sin(u / 40 + a + i) * 10 + (u * (k - 1)) / 8;
        u ? x.lineTo(u, v) : x.moveTo(u, v);
      }
      x.stroke();
    }
  }
});
export function yarnBall(r = 0.24) {
  const g = new T.Group();
  const m = new T.Mesh(new T.SphereGeometry(r, 24, 18), new T.MeshStandardMaterial({ map: yarnTex, roughness: 0.75, emissive: new T.Color(YARN), emissiveIntensity: 0.12 }));
  m.castShadow = true;
  g.add(m);
  // Волшебный ореол
  const halo = glowSprite("#ff9fd0", r * 4.5, 0.35);
  g.add(halo);
  return { g, mesh: m, halo, r };
}

// ---------- Друзья у выхода ----------
function bunny() {
  const g = new T.Group();
  const w = matte("#ffffff", { roughness: 0.7 }),
    p = matte("#ffb8cc", { roughness: 0.6 });
  const b = at(ball(0.32, w), 0, 0.38, 0);
  b.scale.set(1, 1.05, 0.95);
  g.add(b);
  const head = new T.Group();
  head.position.set(0, 0.85, 0.05);
  g.add(head);
  const sk = ball(0.3, w);
  sk.scale.set(1.08, 0.95, 1);
  head.add(sk);
  eyes(head, 0.12, 0.05, 0.24, 0.075);
  head.add(at(ball(0.045, p, 10, 8), 0, -0.05, 0.3));
  for (const s of [-1, 1]) {
    const ear = new T.Group();
    ear.position.set(s * 0.12, 0.22, 0);
    ear.rotation.z = -s * 0.18;
    const e = at(new T.Mesh(new T.CapsuleGeometry(0.075, 0.42, 4, 10), w), 0, 0.25, 0);
    ear.add(e);
    const inner = at(new T.Mesh(new T.CapsuleGeometry(0.04, 0.34, 4, 8), p), 0, 0.25, 0.045);
    ear.add(inner);
    head.add(ear);
    g.add(at(ball(0.1, w, 12, 8), s * 0.15, 0.06, 0.12));
  }
  g.add(at(ball(0.11, w, 12, 8), 0, 0.3, -0.33));
  return g;
}
function mouse() {
  const g = new T.Group();
  const grey = matte("#b8b4c8", { roughness: 0.7 }),
    pink = matte("#ffb8cc", { roughness: 0.6 }),
    dress = glossy("#ff7fc8");
  const skirt = at(new T.Mesh(new T.ConeGeometry(0.36, 0.6, 24), dress), 0, 0.3, 0);
  g.add(skirt);
  g.add(at(ball(0.2, dress), 0, 0.6, 0));
  const head = new T.Group();
  head.position.set(0, 0.92, 0.04);
  g.add(head);
  head.add(ball(0.26, grey));
  const snout = at(ball(0.12, grey, 14, 10), 0, -0.06, 0.2);
  snout.scale.set(1, 0.8, 1.2);
  head.add(snout);
  head.add(at(ball(0.04, pink, 10, 8), 0, -0.04, 0.34));
  eyes(head, 0.1, 0.06, 0.2, 0.065);
  for (const s of [-1, 1]) {
    const ear = at(new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.04, 20), grey), s * 0.22, 0.2, -0.02);
    ear.rotation.x = pie / 2;
    head.add(ear);
    const inner = at(new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.045, 18), pink), s * 0.22, 0.2, 0.0);
    inner.rotation.x = pie / 2;
    head.add(inner);
  }
  // Корона
  const gold = glossy("#ffc533", { metalness: 0.6, roughness: 0.25 });
  const crown = at(new T.Mesh(new T.CylinderGeometry(0.11, 0.12, 0.08, 16, 1, true), gold), 0, 0.27, 0);
  head.add(crown);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * pie * 2;
    head.add(at(new T.Mesh(new T.ConeGeometry(0.03, 0.08, 6), gold), Math.sin(a) * 0.11, 0.34, Math.cos(a) * 0.11));
  }
  head.add(at(ball(0.03, glossy("#ff4f6d", { emissive: new T.Color("#ff4f6d"), emissiveIntensity: 0.5 }), 8, 6), 0, 0.28, 0.12));
  return g;
}
function penguin() {
  const g = new T.Group();
  const black = matte("#2a3048", { roughness: 0.5 }),
    white = matte("#ffffff", { roughness: 0.6 }),
    orange = glossy("#ff9f2e");
  const b = at(ball(0.34, black), 0, 0.45, 0);
  b.scale.set(1, 1.3, 0.95);
  g.add(b);
  const belly = at(ball(0.27, white), 0, 0.42, 0.1);
  belly.scale.set(1, 1.3, 0.8);
  g.add(belly);
  const face = at(ball(0.2, white), 0, 0.82, 0.14);
  face.scale.set(1.1, 0.9, 0.7);
  g.add(face);
  const head = new T.Group();
  head.position.set(0, 0.82, 0.18);
  g.add(head);
  eyes(head, 0.09, 0.04, 0.08, 0.06);
  const beak = at(new T.Mesh(new T.ConeGeometry(0.06, 0.14, 10), orange), 0, -0.04, 0.17);
  beak.rotation.x = pie / 2;
  head.add(beak);
  for (const s of [-1, 1]) {
    const fl = at(ball(0.13, black, 12, 8), s * 0.34, 0.45, 0);
    fl.scale.set(0.35, 1, 0.7);
    fl.rotation.z = s * 0.3;
    g.add(fl);
    const foot = at(ball(0.09, orange, 10, 8), s * 0.12, 0.03, 0.15);
    foot.scale.set(1, 0.4, 1.4);
    g.add(foot);
  }
  // Шапочка с помпоном
  const hat = at(new T.Mesh(new T.ConeGeometry(0.2, 0.28, 18), glossy("#ff4f6d")), 0, 1.12, 0.02);
  g.add(hat);
  g.add(at(ball(0.07, white, 10, 8), 0, 1.27, 0.02));
  return g;
}
function owl() {
  const g = new T.Group();
  const brown = matte("#a8784a", { roughness: 0.7 }),
    light = matte("#f2dcb0", { roughness: 0.7 }),
    gold = glossy("#ffc533");
  const b = at(ball(0.36, brown), 0, 0.5, 0);
  b.scale.set(1, 1.15, 0.95);
  g.add(b);
  const belly = at(ball(0.25, light), 0, 0.42, 0.14);
  belly.scale.set(1, 1.2, 0.7);
  g.add(belly);
  const head = new T.Group();
  head.position.set(0, 0.86, 0.1);
  g.add(head);
  for (const s of [-1, 1]) {
    const ring = at(new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.03, 20), gold), s * 0.12, 0.03, 0.18);
    ring.rotation.x = pie / 2;
    head.add(ring);
    const tuft = at(new T.Mesh(new T.ConeGeometry(0.07, 0.2, 8), brown), s * 0.2, 0.2, 0);
    tuft.rotation.z = -s * 0.4;
    head.add(tuft);
    const wing = at(ball(0.2, brown, 12, 8), s * 0.34, 0.5, -0.02);
    wing.scale.set(0.35, 1, 0.8);
    g.add(wing);
  }
  eyes(head, 0.12, 0.03, 0.2, 0.085);
  const beak = at(new T.Mesh(new T.ConeGeometry(0.04, 0.1, 8), gold), 0, -0.08, 0.24);
  beak.rotation.x = pie / 2 + 0.4;
  head.add(beak);
  return g;
}
function lamb() {
  const g = new T.Group();
  const wool = matte("#ffffff", { roughness: 0.95 }),
    face = matte("#5a4a5a", { roughness: 0.6 });
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4,
      y = 0.3 + (k % 3) * 0.14;
    g.add(at(ball(0.17, wool, 12, 8), Math.sin(a) * 0.22, y, Math.cos(a) * 0.2));
  }
  const head = new T.Group();
  head.position.set(0, 0.78, 0.22);
  g.add(head);
  const sk = ball(0.19, face);
  sk.scale.set(1, 1.1, 1);
  head.add(sk);
  for (let k = 0; k < 5; k++) head.add(at(ball(0.08, wool, 10, 8), (k - 2) * 0.07, 0.17, -0.02));
  eyes(head, 0.08, 0.03, 0.15, 0.06);
  for (const s of [-1, 1]) {
    const ear = at(ball(0.07, face, 10, 8), s * 0.2, 0.04, -0.02);
    ear.scale.set(1.6, 0.6, 0.8);
    head.add(ear);
    g.add(at(new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.2, 8), face), s * 0.12, 0.1, 0.08));
  }
  g.add(at(new T.Mesh(new T.TorusGeometry(0.12, 0.025, 6, 16), glossy("#ff9f4a")), 0, 0.6, 0.22));
  return g;
}
export const FRIENDS = [bunny, mouse, penguin, owl, lamb];

// ---------- Угощения: ягодка, кристалл, снежинка, светлячок, конфетка ----------
const seeds = canvasTexture(64, 64, (x) => {
  x.fillStyle = "#ff3f5a";
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = "#ffe08a";
  for (let i = 0; i < 18; i++) x.fillRect((i * 23) % 60, (i * 37) % 60, 3, 4);
});
function berry() {
  const g = new T.Group();
  const b = ball(0.2, glossy("#ff3f5a", { map: seeds, emissive: new T.Color("#ff2040"), emissiveIntensity: 0.25 }));
  b.scale.set(1, 1.15, 1);
  b.geometry.translate(0, -0.03, 0);
  g.add(b);
  const leaf = matte("#3fbf4a", { roughness: 0.5 });
  for (let k = 0; k < 5; k++) {
    const l = at(new T.Mesh(new T.ConeGeometry(0.05, 0.14, 4), leaf), Math.sin(k * 1.26) * 0.08, 0.2, Math.cos(k * 1.26) * 0.08);
    l.rotation.set(Math.cos(k * 1.26) * 1.1, 0, -Math.sin(k * 1.26) * 1.1);
    g.add(l);
  }
  return { g, color: "#ff5f7a" };
}
function gem() {
  const g = new T.Group();
  const c = ["#ff6fd0", "#8f7bff", "#5fd0ff"][(Math.random() * 3) | 0];
  const m = new T.Mesh(new T.OctahedronGeometry(0.2, 0), glossy(c, { emissive: new T.Color(c), emissiveIntensity: 0.55, roughness: 0.1, flatShading: true }));
  m.scale.set(1, 1.45, 1);
  g.add(m);
  return { g, color: c };
}
function flake() {
  const g = new T.Group();
  const mat = new T.MeshStandardMaterial({ color: "#9fe0ff", emissive: new T.Color("#3fb4ff"), emissiveIntensity: 1.1, roughness: 0.2 });
  for (let k = 0; k < 3; k++) {
    const arm = new T.Mesh(new T.BoxGeometry(0.46, 0.05, 0.04), mat);
    arm.rotation.z = (k * pie) / 3;
    g.add(arm);
    for (const s of [-1, 1]) {
      const tw = new T.Mesh(new T.BoxGeometry(0.12, 0.035, 0.035), mat);
      const a = (k * pie) / 3;
      tw.position.set(Math.cos(a) * 0.15 * s, Math.sin(a) * 0.15 * s, 0);
      tw.rotation.z = a + pie / 2;
      g.add(tw);
    }
  }
  return { g, color: "#3fb4ff" };
}
function firefly() {
  const g = new T.Group();
  g.add(at(ball(0.11, new T.MeshStandardMaterial({ color: "#fff27a", emissive: glowColor("#ffe84a", 2.5), toneMapped: false }), 14, 10), 0, -0.04, -0.05));
  g.add(at(ball(0.07, matte("#3a2a40"), 10, 8), 0, 0.03, 0.09));
  const wingMat = new T.MeshStandardMaterial({ color: "#e8f8ff", transparent: true, opacity: 0.6, side: T.DoubleSide, roughness: 0.2 });
  for (const s of [-1, 1]) {
    const w = at(new T.Mesh(new T.CircleGeometry(0.1, 12), wingMat), s * 0.09, 0.09, 0);
    w.rotation.set(-pie / 2 + 0.3, s * 0.4, 0);
    w.scale.set(0.6, 1, 1);
    g.add(w);
  }
  return { g, color: "#ffe84a", glow: true };
}
const stripes = canvasTexture(64, 64, (x) => {
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = "#ff5fa8";
  for (let i = -2; i < 6; i++) {
    x.beginPath();
    x.moveTo(i * 16, 0);
    x.lineTo(i * 16 + 8, 0);
    x.lineTo(i * 16 + 24, 64);
    x.lineTo(i * 16 + 16, 64);
    x.fill();
  }
});
function candy() {
  const g = new T.Group();
  const c = ["#ff9f2e", "#5fd0ff", "#8dff8a"][(Math.random() * 3) | 0];
  const b = ball(0.15, glossy("#ffffff", { map: stripes, emissive: new T.Color(c), emissiveIntensity: 0.15 }));
  b.scale.set(1.25, 1, 1);
  g.add(b);
  for (const s of [-1, 1]) {
    const w = at(new T.Mesh(new T.ConeGeometry(0.1, 0.16, 10), glossy(c)), s * 0.24, 0, 0);
    w.rotation.z = (s * pie) / 2;
    g.add(w);
  }
  return { g, color: c };
}
export const ITEMS = [berry, gem, flake, firefly, candy];

// ---------- Ключ ----------
export function keyModel(color) {
  const g = new T.Group();
  const mat = glossy(color, { metalness: 0.35, roughness: 0.22, emissive: new T.Color(color), emissiveIntensity: 0.35 });
  const ring = at(new T.Mesh(new T.TorusGeometry(0.12, 0.045, 10, 22), mat), 0, 0.17, 0);
  g.add(ring);
  g.add(at(new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.34, 10), mat), 0, -0.08, 0));
  g.add(at(new T.Mesh(new T.BoxGeometry(0.1, 0.05, 0.05), mat), 0.05, -0.18, 0));
  g.add(at(new T.Mesh(new T.BoxGeometry(0.07, 0.05, 0.05), mat), 0.04, -0.08, 0));
  g.add(at(ball(0.035, SHINE, 8, 6), 0, 0.17, 0));
  return g;
}
