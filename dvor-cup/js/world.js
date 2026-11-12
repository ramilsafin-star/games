// 3D «Дворового кубка»: двор с полем, ворота с сеткой, забор, домики, зрители-зверята, гирлянда флажков,
// футболисты с большими головами, мяч, следы и искры. Игра идёт в плоскости z = 0, вид сбоку.
import * as T from "../vendor/three/three.module.min.js?v=b03c5ace";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=b03c5ace";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=b03c5ace";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=b03c5ace";
import { polish } from "./gfx.js?v=b03c5ace";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=b03c5ace";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=b03c5ace";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=b03c5ace";
import { FIELD, BALL_R } from "./match.js?v=b03c5ace";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const glowing = (color, k = 2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const glowTex = canvasTexture(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
});
const shadowTex = canvasTexture(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
});
function blobShadow(size) {
  const m = new T.Mesh(new T.PlaneGeometry(size, size * 0.55), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -pie / 2;
  m.position.y = 0.015;
  return m;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Футболисты ----------
// fur — шерсть, belly — мордочка и животик, shirt/shorts — форма, ear — уши
export const ANIMALS = {
  fox: { name: "Лисёнок", fur: "#ff8a3d", belly: "#fff3e4", ear: "pointy", inner: "#3a2a2e", nose: "#2b2030", shirt: "#2fbf8a", shorts: "#ffffff", tail: "fox" },
  raccoon: { name: "Енотик", fur: "#9aa0b4", belly: "#f2f2f6", ear: "round", inner: "#5a5f72", nose: "#22222e", shirt: "#8f5bff", shorts: "#2b2b3d", mask: true, tail: "ring" },
  bunny: { name: "Зайка", fur: "#ffffff", belly: "#fff0f4", ear: "long", inner: "#ffb3c8", nose: "#ff7fa0", shirt: "#3f9cff", shorts: "#ffffff" },
  bear: { name: "Мишка", fur: "#b07a4a", belly: "#f2d6b0", ear: "round", inner: "#8a5a34", nose: "#3b2730", shirt: "#ff4f6d", shorts: "#ffffff" },
  frog: { name: "Лягушонок", fur: "#6fd35f", belly: "#efffd8", ear: "none", inner: "#ff9fb0", nose: "#2a6a2a", shirt: "#ffc533", shorts: "#3a7aff", eyesTop: true },
  panda: { name: "Панда", fur: "#ffffff", belly: "#ffffff", ear: "round", inner: "#22222e", nose: "#22222e", shirt: "#ff8f3f", shorts: "#22222e", panda: true },
  cat: { name: "Котик", fur: "#f7b267", belly: "#fff4e6", ear: "pointy", inner: "#ff9fb0", nose: "#ff7f9a", shirt: "#ff5fa2", shorts: "#ffffff", tail: "cat", whiskers: true, stripes: "#e08a3c" },
  koala: { name: "Коала", fur: "#a9b4c6", belly: "#eef2f8", ear: "fluffy", inner: "#f4f6fb", nose: "#3a3646", shirt: "#2fc7b8", shorts: "#2b2b3d", bigNose: true },
};
// Форма из раздевалки: рисунок футболки
function shirtTexture(color, number, kit) {
  return canvasTexture(256, 128, (x, w, h) => {
    x.fillStyle = kit === "gold" ? "#ffcf3f" : color;
    x.fillRect(0, 0, w, h);
    if (kit === "stripes") {
      x.fillStyle = "#ffffff";
      for (let i = 0; i < w; i += 40) x.fillRect(i + 12, 0, 14, h);
    } else if (kit === "dots") {
      x.fillStyle = "#fff6a8";
      for (let i = 0; i < 18; i++) {
        const cx = (i * 47) % w,
          cy = 14 + ((i * 29) % (h - 20));
        x.beginPath();
        for (let v = 0; v < 10; v++) {
          const a = (v * Math.PI) / 5 - Math.PI / 2,
            r = v % 2 ? 4 : 10;
          x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        x.fill();
      }
    } else if (kit === "gold") {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#fff3b0");
      g.addColorStop(0.5, "#ffc533");
      g.addColorStop(1, "#d9921a");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    x.fillStyle = kit === "gold" ? "#b0306a" : "#ffffff";
    x.fillRect(0, 52, w, 12);
    x.font = "900 68px system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.lineWidth = 8;
    x.strokeStyle = "#0004";
    for (const cx of [64, 192]) {
      x.strokeText(String(number), cx, 72);
      x.fillText(String(number), cx, 72);
    }
  });
}
function footballer(kind, number, kit = "home") {
  const A = ANIMALS[kind];
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  const fur = matte(A.fur, { roughness: 0.75 }),
    light = matte(A.belly),
    dark = matte(A.inner);
  // Тело в футболке с номером
  const shirtTex = shirtTexture(A.shirt, number, kit);
  const shirtMat = kit === "gold" ? new T.MeshPhysicalMaterial({ map: shirtTex, roughness: 0.3, metalness: 0.35, clearcoat: 0.8 }) : new T.MeshStandardMaterial({ map: shirtTex, roughness: 0.6 });
  const torso = new T.Mesh(new T.SphereGeometry(0.46, 24, 18), shirtMat);
  torso.scale.set(1, 1.05, 0.92);
  torso.position.y = 0.72;
  body.add(torso);
  const shorts = new T.Mesh(new T.CylinderGeometry(0.42, 0.44, 0.3, 20), matte(A.shorts));
  shorts.position.y = 0.38;
  body.add(shorts);
  // Ноги: бедро вращается — так бьёт по мячу
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new T.Group();
    hip.position.set(0, 0.36, s * 0.18);
    const leg = new T.Mesh(new T.CylinderGeometry(0.1, 0.11, 0.28, 10), fur);
    leg.position.y = -0.14;
    hip.add(leg);
    const sock = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 0.08, 10), matte("#ffffff"));
    sock.position.y = -0.26;
    hip.add(sock);
    const boot = new T.Mesh(new RoundedBoxGeometry(0.34, 0.14, 0.2, 2, 0.06), glossy(A.shirt === "#ffc533" ? "#3a7aff" : "#2b2b3d", { roughness: 0.3 }));
    boot.position.set(0.08, -0.32, 0);
    hip.add(boot);
    body.add(hip);
    legs.push(hip);
  }
  // Ручки
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new T.Mesh(new T.CapsuleGeometry(0.09, 0.22, 6, 10), fur);
    arm.position.set(0, 0.78, s * 0.46);
    arm.rotation.x = s * 0.5;
    body.add(arm);
    arms.push(arm);
  }
  // Большая голова
  const head = new T.Group();
  head.position.y = 1.62;
  body.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(0.62, 32, 24), fur);
  head.add(skull);
  if (A.panda) {
    for (const s of [-1, 1]) {
      const patch = new T.Mesh(new T.SphereGeometry(0.16, 14, 10), dark);
      patch.scale.set(0.6, 1, 1.2);
      patch.position.set(0.5, 0.06, s * 0.2);
      head.add(patch);
    }
  }
  const muzzle = new T.Mesh(new T.SphereGeometry(0.3, 20, 14), light);
  muzzle.scale.set(0.7, 0.75, 1);
  muzzle.position.set(0.44, -0.16, 0);
  head.add(muzzle);
  if (A.mask) {
    const mask = new T.Mesh(new T.SphereGeometry(0.62, 32, 12, -0.9, 1.8, 1.25, 0.45), dark);
    mask.scale.setScalar(1.015);
    head.add(mask);
  }
  const nose = new T.Mesh(new T.SphereGeometry(0.075, 12, 10), glossy(A.nose, { roughness: 0.2 }));
  nose.position.set(0.66, -0.08, 0);
  if (A.bigNose) {
    nose.scale.set(1.4, 2.2, 1.9);
    nose.position.set(0.66, -0.04, 0);
  }
  head.add(nose);
  // Усы котика
  if (A.whiskers) {
    const wm = matte("#5a4a4a");
    for (const s of [-1, 1])
      for (const k of [-1, 1]) {
        const wsk = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.34, 4), wm);
        wsk.rotation.x = pie / 2 + s * 0.15;
        wsk.rotation.z = k * 0.12;
        wsk.position.set(0.66, -0.16 + k * 0.03, s * 0.2);
        head.add(wsk);
      }
  }
  // Полоски на лбу котика
  if (A.stripes) {
    for (const k of [-1, 0, 1]) {
      const st = new T.Mesh(new T.CapsuleGeometry(0.035, 0.16, 4, 6), matte(A.stripes));
      st.position.set(0.3, 0.5, k * 0.13);
      st.rotation.z = 0.9;
      head.add(st);
    }
  }
  // Глаза смотрят вперёд (+x)
  const eyes = [];
  for (const s of [-1, 1]) {
    const ey = A.eyesTop ? 0.5 : 0.1,
      ex = A.eyesTop ? 0.25 : 0.5;
    if (A.eyesTop) {
      const bulge = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), fur);
      bulge.position.set(0.2, 0.46, s * 0.26);
      head.add(bulge);
    }
    const white = new T.Mesh(new T.SphereGeometry(0.14, 16, 12), matte("#ffffff"));
    white.position.set(ex, ey, s * 0.22);
    head.add(white);
    const pupil = new T.Mesh(new T.SphereGeometry(0.085, 12, 10), glossy("#1d1420", { roughness: 0.1 }));
    pupil.position.set(ex + 0.1, ey + 0.01, s * 0.22);
    head.add(pupil);
    const shine = new T.Mesh(new T.SphereGeometry(0.025, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(ex + 0.18, ey + 0.05, s * 0.2);
    head.add(shine);
    eyes.push(white, pupil, shine);
    const cheek = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), matte("#ff9fb8"));
    cheek.scale.set(0.4, 0.6, 1);
    cheek.position.set(0.5, -0.18, s * 0.34);
    head.add(cheek);
    // Уши
    if (A.ear === "pointy") {
      const ear = new T.Mesh(new T.ConeGeometry(0.2, 0.42, 4), fur);
      ear.position.set(-0.05, 0.62, s * 0.3);
      ear.rotation.x = s * 0.35;
      head.add(ear);
      const tip = new T.Mesh(new T.ConeGeometry(0.1, 0.18, 4), dark);
      tip.position.set(-0.05, 0.8, s * 0.36);
      tip.rotation.x = s * 0.35;
      head.add(tip);
    } else if (A.ear === "round") {
      const ear = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), A.panda ? dark : fur);
      ear.position.set(-0.1, 0.52, s * 0.4);
      head.add(ear);
      if (!A.panda) {
        const inner = new T.Mesh(new T.SphereGeometry(0.11, 12, 8), dark);
        inner.position.set(0.0, 0.52, s * 0.43);
        head.add(inner);
      }
    } else if (A.ear === "fluffy") {
      // Коала: большие пушистые уши со светлой серединкой
      const ear = new T.Mesh(new T.SphereGeometry(0.3, 16, 12), fur);
      ear.scale.set(0.7, 1, 1);
      ear.position.set(-0.12, 0.42, s * 0.56);
      head.add(ear);
      const inner = new T.Mesh(new T.SphereGeometry(0.18, 12, 10), light);
      inner.scale.set(0.5, 1, 1);
      inner.position.set(-0.02, 0.42, s * 0.6);
      head.add(inner);
    } else if (A.ear === "long") {
      const ear = new T.Mesh(new T.CapsuleGeometry(0.11, 0.62, 6, 12), fur);
      ear.position.set(-0.12, 0.92, s * 0.2);
      ear.rotation.x = s * 0.18;
      head.add(ear);
      const inner = new T.Mesh(new T.CapsuleGeometry(0.05, 0.5, 6, 8), dark);
      inner.position.set(-0.02, 0.92, s * 0.2);
      inner.rotation.x = s * 0.18;
      head.add(inner);
    }
  }
  // Ротик-улыбка
  const smile = new T.Mesh(new T.TorusGeometry(0.09, 0.022, 6, 16, pie), matte("#5a2a3a"));
  smile.position.set(0.6, -0.27, 0);
  smile.rotation.set(pie, pie / 2, 0);
  head.add(smile);
  // Хвост
  if (A.tail) {
    const tail = new T.Group();
    tail.position.set(-0.4, 0.5, 0);
    const n = 5;
    for (let k = 0; k < n; k++) {
      const thin = A.tail === "cat";
      const seg = new T.Mesh(new T.SphereGeometry(thin ? 0.09 : 0.15 + Math.sin((k / n) * pie) * 0.06, 12, 10), A.tail === "ring" && k % 2 ? dark : k === n - 1 && (A.tail === "fox" || thin) ? (thin ? matte(A.stripes) : light) : fur);
      // Кошачий хвост — тонкий, загнут вверх
      if (thin) seg.position.set(-k * 0.1, k * k * 0.05, 0);
      else seg.position.set(-k * 0.14, k * 0.1, 0);
      tail.add(seg);
    }
    body.add(tail);
    body.userData.tail = tail;
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  const shadow = blobShadow(1.6);
  g.add(shadow);
  return { group: g, body, head, legs, arms, eyes, shadow, kind };
}


// ---------- Значки бонусов ----------
export const ITEM_COLORS = { star: "#ffd84a", speed: "#ffb02e", snow: "#7fe0ff", magnet: "#ff5f7f", big: "#ff8fd0" };
function itemIcon(kind) {
  return canvasTexture(128, 128, (x) => {
    x.translate(64, 64);
    x.lineJoin = "round";
    x.lineCap = "round";
    const outline = (fill) => {
      x.fillStyle = fill;
      x.fill();
      x.lineWidth = 7;
      x.strokeStyle = "#1f3a5a";
      x.stroke();
    };
    if (kind === "star") {
      x.beginPath();
      for (let v = 0; v < 10; v++) {
        const a = (v * Math.PI) / 5 - Math.PI / 2,
          r = v % 2 ? 22 : 50;
        x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      x.closePath();
      outline("#ffd84a");
    } else if (kind === "speed") {
      x.beginPath();
      [[8, -52], [-30, 6], [-2, 6], [-12, 52], [30, -8], [2, -8], [14, -52]].forEach(([a, b]) => x.lineTo(a, b));
      x.closePath();
      outline("#ffb02e");
    } else if (kind === "snow") {
      x.strokeStyle = "#1f3a5a";
      x.lineWidth = 16;
      const flake = () => {
        for (let k = 0; k < 6; k++) {
          x.rotate(Math.PI / 3);
          x.beginPath();
          x.moveTo(0, 0);
          x.lineTo(0, -48);
          x.moveTo(0, -30);
          x.lineTo(-13, -42);
          x.moveTo(0, -30);
          x.lineTo(13, -42);
          x.stroke();
        }
      };
      flake();
      x.strokeStyle = "#bff4ff";
      x.lineWidth = 7;
      flake();
    } else if (kind === "magnet") {
      x.beginPath();
      x.arc(0, 0, 38, Math.PI, 0, true);
      x.lineTo(38, -36);
      x.lineTo(14, -36);
      x.lineTo(14, 0);
      x.arc(0, 0, 14, 0, Math.PI, false);
      x.lineTo(-14, -36);
      x.lineTo(-38, -36);
      x.closePath();
      x.rotate(0);
      outline("#ff4f6d");
      x.fillStyle = "#ffffff";
      x.fillRect(-36, -36, 20, 14);
      x.fillRect(16, -36, 20, 14);
    } else {
      // Большая голова: смешная мордочка
      x.beginPath();
      x.arc(0, 4, 44, 0, Math.PI * 2);
      outline("#ff8fd0");
      x.fillStyle = "#1f3a5a";
      x.beginPath();
      x.arc(-15, -4, 7, 0, 7);
      x.arc(15, -4, 7, 0, 7);
      x.fill();
      x.lineWidth = 6;
      x.beginPath();
      x.arc(0, 12, 16, 0.2, Math.PI - 0.2);
      x.stroke();
    }
  });
}

// ---------- Мяч ----------
// Мячи из раздевалки: пятнистый, арбуз, солнышко, планета
function ballTexture(kind = "classic") {
  return canvasTexture(256, 128, (x, w, h) => {
    if (kind === "melon") {
      x.fillStyle = "#3fae4a";
      x.fillRect(0, 0, w, h);
      x.strokeStyle = "#1f6a2a";
      x.lineWidth = 9;
      for (let i = 0; i < 8; i++) {
        x.beginPath();
        for (let y = 0; y <= h; y += 8) x.lineTo((i * w) / 8 + Math.sin(y * 0.15 + i) * 5, y);
        x.stroke();
      }
      return;
    }
    if (kind === "sun") {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#fff3a0");
      g.addColorStop(0.5, "#ffc533");
      g.addColorStop(1, "#ff8f1f");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#ff7a1a";
      for (let i = 0; i < 12; i++) {
        x.beginPath();
        x.moveTo((i * w) / 12, h / 2 - 22);
        x.lineTo((i * w) / 12 + 10, h / 2);
        x.lineTo((i * w) / 12, h / 2 + 22);
        x.lineTo((i * w) / 12 - 10, h / 2);
        x.fill();
      }
      // Улыбка солнышка на одной стороне
      x.strokeStyle = "#a0400a";
      x.lineWidth = 5;
      x.beginPath();
      x.arc(64, 62, 16, 0.2, Math.PI - 0.2);
      x.stroke();
      x.fillStyle = "#a0400a";
      x.fillRect(54, 46, 6, 8);
      x.fillRect(70, 46, 6, 8);
      return;
    }
    if (kind === "planet") {
      x.fillStyle = "#3f8cff";
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#4fd36a";
      for (let i = 0; i < 9; i++) {
        x.beginPath();
        x.ellipse((i * 61) % w, 20 + ((i * 37) % 90), 20 + (i % 3) * 8, 10 + (i % 2) * 8, i, 0, 7);
        x.fill();
      }
      x.fillStyle = "#ffffffcc";
      x.fillRect(0, 0, w, 10);
      x.fillRect(0, h - 10, w, 10);
      return;
    }
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, w, h);
    // Цветные «заплатки» — как у детского мячика, а не строгого футбольного
    const cols = ["#ff4f6d", "#3fb4ff", "#ffc533", "#3fdc7a", "#8f5bff"];
    let k = 0;
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 6; i++) {
        const cx = (i + (row % 2) * 0.5) * (w / 6),
          cy = 20 + row * 44;
        x.fillStyle = cols[k++ % cols.length];
        x.beginPath();
        for (let v = 0; v < 5; v++) {
          const a = (v * 2 * pie) / 5 - pie / 2;
          x.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 12);
        }
        x.fill();
      }
    x.strokeStyle = "#dfe4f0";
    x.lineWidth = 2;
    for (let i = 0; i < w; i += 21) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i + 10, h);
      x.stroke();
    }
  });
}

// Небо и свет трёх кубков: день, закат, вечер под прожекторами
const SKIES = {
  day: { bot: [1.0, 0.86, 0.78], mid: [0.55, 0.82, 1.0], top: [0.3, 0.6, 1.0], hemi: [0xffffff, 0x88c870, 1.15], sun: [0xfff0d8, 2.2, -8, 16, 12], fog: [0xcfeeff, 60, 160], disc: [1.6, 1.5, 1.1, -60, 55], env: 0.45, night: 0, bg: "#7fd0ff" },
  sunset: { bot: [1.0, 0.6, 0.36], mid: [1.0, 0.74, 0.58], top: [0.42, 0.42, 0.86], hemi: [0xffd6c0, 0x7a9860, 0.8], sun: [0xffa860, 2.7, -14, 8, 11], fog: [0xffa888, 22, 62], disc: [2.2, 1.3, 0.6, -70, 20], env: 0.42, night: 0, bg: "#ffb48a" },
  night: { bot: [0.24, 0.18, 0.5], mid: [0.1, 0.12, 0.38], top: [0.03, 0.05, 0.2], hemi: [0x8f9cff, 0x2a4a48, 0.4], sun: [0xf2f6ff, 2.6, 2, 18, 14], fog: [0x232a62, 19, 40], disc: [1.3, 1.35, 1.5, 50, 48], env: 0.22, night: 1, bg: "#1c2358" },
};
// Качество графики: «Высокое» по умолчанию на сильных устройствах, авто-снижение при fps ниже 45
export const QUALITY = {
  high: { name: "Высокое", ratio: 2, shadows: 2048, bloom: true, fx: 1 },
  mid: { name: "Среднее", ratio: 1.4, shadows: 1024, bloom: true, fx: 0.65 },
  low: { name: "Низкое", ratio: 1, shadows: 0, bloom: false, fx: 0.4 },
};
const DOWN = { high: "mid", mid: "low", low: "low" };

export class World {
  constructor(canvas, quality = "auto") {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.fog = new T.Fog(0xcfeeff, 60, 160);
    this.camera = new T.PerspectiveCamera(32, 1, 0.1, 400);
    this.hemi = new T.HemisphereLight(0xffffff, 0x88c870, 1.15);
    this.scene.add(this.hemi);
    const sun = new T.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(-8, 16, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -6, near: 1, far: 50 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.sun = sun;
    // Вспышка света у ворот после гола
    this.flashLight = new T.PointLight(0xfff2c0, 0, 26, 1.6);
    this.flashLight.position.set(0, 3, 3);
    this.scene.add(this.flashLight);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.4, 1.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = polish(this.composer, { vignette: 0.26, vibrance: 0.45 });
    this.glow = { on: true };
    this.shakeAmp = 0;
    this.punchAt = null;
    this.fxScale = 1;
    this.build();
    this.resize = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
      this.fit(w / h);
    };
    new ResizeObserver(this.resize).observe(canvas);
    // Качество: «auto» — начинаем с высокого (или среднего на слабом устройстве) и снижаем при просадке fps
    this.auto = { on: true, frames: 0, time: 0 };
    this.onQuality = null;
    this.setQuality(quality);
    this.onFrame = null;
    this.last = 0;
    this.renderer.setAnimationLoop((ms) => this.frame(ms));
  }
  setQuality(q) {
    this.auto.on = q === "auto";
    if (q === "auto") {
      const weak = (navigator.hardwareConcurrency || 8) < 6 || (navigator.deviceMemory || 8) < 4;
      q = weak ? "mid" : "high";
    }
    this.auto.frames = this.auto.time = 0;
    this.quality = q;
    const Q = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.ratio));
    const shadows = Q.shadows > 0;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => o.material && (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)));
    }
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== Q.shadows) {
      this.sun.shadow.mapSize.set(Q.shadows, Q.shadows / 2);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.glow.on = Q.bloom;
    this.fxScale = Q.fx;
    if (this.grass) this.grass.visible = q === "high";
    this.resize();
  }
  // Небо, свет и огни: "day" | "sunset" | "night"
  setSky(name) {
    const k = SKIES[name] || SKIES.day;
    this.skyName = name;
    const u = this.sky.material.uniforms;
    u.bot.value.setRGB(...k.bot);
    u.mid.value.setRGB(...k.mid);
    u.top.value.setRGB(...k.top);
    this.hemi.color.set(k.hemi[0]);
    this.hemi.groundColor.set(k.hemi[1]);
    this.hemi.intensity = k.hemi[2];
    this.sun.color.set(k.sun[0]);
    this.sun.intensity = k.sun[1];
    this.sun.position.set(k.sun[2], k.sun[3], k.sun[4]);
    this.scene.fog.color.set(k.fog[0]);
    this.scene.fog.near = k.fog[1];
    this.scene.fog.far = k.fog[2];
    this.sunDisc.material.color.setRGB(k.disc[0], k.disc[1], k.disc[2]);
    this.sunDisc.position.set(k.disc[3], k.disc[4], -150);
    this.sunDisc.scale.setScalar(name === "sunset" ? 2.2 : name === "night" ? 0.8 : 1);
    this.scene.environmentIntensity = k.env;
    this.stars.visible = this.moonDetail.visible = k.night > 0;
    this.towers.visible = k.night > 0 || name === "sunset";
    for (const b of this.beams) b.visible = k.night > 0;
    for (const w of this.windows) w.material.emissiveIntensity = k.night ? 1.6 : name === "sunset" ? 0.6 : 0.15;
    for (const c of this.clouds) c.children.forEach((m) => m.material.emissive.set(name === "night" ? "#30366a" : name === "sunset" ? "#ffb08a" : "#ffffff"));
    this.lampMat.emissiveIntensity = k.night ? 4 : name === "sunset" ? 1.2 : 0;
    this.bloom.strength = k.night ? 0.75 : 0.5;
    document.body.style.background = k.bg;
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.time, dur: this.motion.matches ? seconds * 0.5 : seconds, update, done }));
  }
  // Всё поле от ворот до ворот и высота до перекладины с запасом — при любой форме экрана
  // Камера сверху-сбоку: поле между табло и кнопками, ворота целиком, двор и забор — фоном сверху.
  // Отодвигаемся, пока важные точки не войдут в рамку
  fit(aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight), margin = null) {
    const cam = this.camera;
    cam.fov = 30;
    cam.aspect = aspect;
    const F = FIELD;
    const pts = [
      [-F.half, 0, 0],
      [F.half, 0, 0],
      [-F.half, F.bar, 0],
      [F.half, F.bar, 0],
      [-F.line, 0, 1.3],
      [F.line, 0, 1.3],
      [-F.half, F.bar, 1.3],
      [F.half, F.bar, 1.3],
      [-F.half, 0, 1.3],
      [F.half, 0, 1.3],
      [0, 6.4, 0],
    ].map((p) => new T.Vector3(...p));
    // Снизу место под кнопки, сверху — под табло
    const bottom = margin ? margin[0] : aspect > 1.9 ? -0.55 : -0.62,
      top = margin ? margin[1] : 0.8;
    const pitch = 0.3;
    let dist = 12;
    for (let k = 0; k < 80; k++) {
      this.look = new T.Vector3(0, 2.6, 0);
      this.home = new T.Vector3(0, 2.6 + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
      cam.position.copy(this.home);
      cam.lookAt(this.look);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const pr = pts.map((p) => p.clone().project(cam));
      const ok = pr.every((v) => Math.abs(v.x) < 0.97 && v.y > bottom && v.y < top);
      if (ok) break;
      dist *= 1.04;
    }
    // Сдвиг кадра по вертикали: середина поля — посередине между кнопками и табло
    const pr = pts.map((p) => p.clone().project(cam));
    const lo = Math.min(...pr.map((v) => v.y)),
      hi = Math.max(...pr.map((v) => v.y));
    const shift = (bottom + top) / 2 - (lo + hi) / 2;
    const full = 1000,
      h = full / aspect;
    cam.setViewOffset(full, h, 0, (shift * h) / 2, full, h);
  }
  // ---------- Двор ----------
  build() {
    const S = this.scene,
      R = rng(11);
    // Небо
    const sky = new T.Mesh(
      new T.SphereGeometry(300, 32, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { bot: { value: new T.Color(1.0, 0.86, 0.78) }, mid: { value: new T.Color(0.55, 0.82, 1.0) }, top: { value: new T.Color(0.3, 0.6, 1.0) } },
        vertexShader: "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `uniform vec3 bot, mid, top; varying vec3 p; void main(){ float h = p.y;
          vec3 c = mix(bot, mid, smoothstep(-0.05, 0.25, h));
          c = mix(c, top, smoothstep(0.25, 0.8, h)); gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    S.add(sky);
    this.sky = sky;
    const sunDisc = new T.Mesh(new T.CircleGeometry(6, 40), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.5, 1.1), fog: false, toneMapped: false }));
    sunDisc.position.set(-60, 55, -150);
    S.add(sunDisc);
    this.sunDisc = sunDisc;
    // Луна с «морями» и звёзды — только вечером
    this.moonDetail = new T.Group();
    for (const [x, y, r] of [[-1.5, 1.2, 1.4], [1.8, -0.6, 1.1], [0.2, -2.2, 0.8]]) {
      const m = new T.Mesh(new T.CircleGeometry(r, 20), new T.MeshBasicMaterial({ color: new T.Color(0.9, 0.95, 1.1), fog: false, toneMapped: false }));
      m.position.set(x, y, 0.1);
      this.moonDetail.add(m);
    }
    sunDisc.add(this.moonDetail);
    const starPos = [];
    const SR = rng(5);
    for (let i = 0; i < 260; i++) {
      const a = SR() * pie * 2,
        h = 0.12 + SR() * 0.85;
      const r = Math.sqrt(1 - h * h);
      starPos.push(Math.cos(a) * r * 280, h * 280, Math.sin(a) * r * 280 - 40);
    }
    const starGeo = new T.BufferGeometry();
    starGeo.setAttribute("position", new T.Float32BufferAttribute(starPos, 3));
    this.stars = new T.Points(starGeo, new T.PointsMaterial({ color: new T.Color(1.6, 1.6, 1.8), size: 2.2, sizeAttenuation: false, fog: false, toneMapped: false, transparent: true }));
    this.stars.visible = false;
    S.add(this.stars);
    // Облака
    this.clouds = [];
    for (let k = 0; k < 8; k++) {
      const c = new T.Group();
      for (let p = 0; p < 5; p++) {
        const s = new T.Mesh(new T.SphereGeometry(2 + R() * 1.6, 16, 12), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.3 }));
        s.position.set(p * 2.2 - 4.4, Math.sin(p) * 0.8, R());
        s.scale.y = 0.7;
        c.add(s);
      }
      c.position.set(-60 + k * 17 + R() * 6, 26 + R() * 12, -70 - R() * 40);
      c.userData.speed = 0.5 + R() * 0.6;
      S.add(c);
      this.clouds.push(c);
    }
    // Газон: полосы скоса, разметка
    const grass = canvasTexture(1024, 256, (x, w, h) => {
      for (let i = 0; i < 16; i++) {
        x.fillStyle = i % 2 ? "#5fcf5a" : "#6edc66";
        x.fillRect((i * w) / 16, 0, w / 16 + 1, h);
      }
      x.strokeStyle = "#ffffffe6";
      x.lineWidth = 6;
      const X = (v) => ((v + 13) / 26) * w;
      const Z = (v) => ((v + 4) / 8) * h;
      x.strokeRect(X(-FIELD.line), Z(-2.4), X(FIELD.line) - X(-FIELD.line), Z(2.4) - Z(-2.4));
      x.beginPath();
      x.moveTo(X(0), Z(-2.4));
      x.lineTo(X(0), Z(2.4));
      x.stroke();
      x.beginPath();
      x.ellipse(X(0), Z(0), (1.8 / 26) * w, (1.8 / 8) * h, 0, 0, 7);
      x.stroke();
      for (const s of [-1, 1]) {
        x.strokeRect(Math.min(X(s * FIELD.line), X(s * (FIELD.line - 2.2))), Z(-1.6), Math.abs(X(s * FIELD.line) - X(s * (FIELD.line - 2.2))), Z(1.6) - Z(-1.6));
      }
      x.fillStyle = "#ffffff";
      x.beginPath();
      x.arc(X(0), Z(0), 6, 0, 7);
      x.fill();
    });
    const field = new T.Mesh(new T.PlaneGeometry(26, 8), new T.MeshStandardMaterial({ map: grass, roughness: 0.9 }));
    field.rotation.x = -pie / 2;
    field.receiveShadow = true;
    S.add(field);
    const lawn = new T.Mesh(new T.PlaneGeometry(200, 120), matte("#58c050"));
    lawn.rotation.x = -pie / 2;
    lawn.position.y = -0.02;
    lawn.receiveShadow = true;
    S.add(lawn);
    // Забор из цветных досок
    const plankCols = ["#ff8f5f", "#ffd25f", "#7fd0ff", "#ff9fd0", "#9fe07a", "#c8a0ff"];
    const plankGeo = new RoundedBoxGeometry(0.62, 3.2, 0.14, 2, 0.06);
    const planks = new T.InstancedMesh(plankGeo, new T.MeshStandardMaterial({ roughness: 0.8 }), 60);
    const d = new T.Object3D();
    for (let i = 0; i < 60; i++) {
      d.position.set(-21 + i * 0.7, 1.55 + Math.sin(i * 1.7) * 0.08, -4.6);
      d.rotation.set(0, 0, Math.sin(i * 2.3) * 0.03);
      d.updateMatrix();
      planks.setMatrixAt(i, d.matrix);
      planks.setColorAt(i, new T.Color(plankCols[i % plankCols.length]));
    }
    planks.castShadow = planks.receiveShadow = true;
    S.add(planks);
    const rail = new T.Mesh(new T.BoxGeometry(42, 0.18, 0.1), matte("#a8743f"));
    rail.position.set(0, 2.4, -4.5);
    S.add(rail);
    // Зрители за забором: головы зверят подпрыгивают
    this.fans = [];
    const fanKinds = ["bunny", "bear", "frog", "panda", "raccoon", "fox", "bunny", "bear", "frog", "panda"];
    fanKinds.forEach((k, i) => {
      const f = footballer(k, 0);
      f.group.position.set(-15 + i * 3.3 + R(), 2.05, -5.2);
      f.group.rotation.y = pie / 2 - 0.2 + (R() - 0.5) * 0.4;
      f.group.scale.setScalar(0.8);
      f.shadow.visible = false;
      S.add(f.group);
      this.fans.push({ ...f, base: 2.05, ph: R() * 6 });
    });
    // Домики и деревья за забором
    const houseCols = [
      ["#fff3d6", "#ff6b5f"],
      ["#ffe0e8", "#5f8bff"],
      ["#e0f0ff", "#ffb02e"],
      ["#e8ffe0", "#c85fff"],
    ];
    this.windows = [];
    for (let k = 0; k < 7; k++) {
      const h = new T.Group();
      const [wc, rc] = houseCols[k % 4];
      const H = 3 + R() * 2;
      const wall = new T.Mesh(new RoundedBoxGeometry(4, H, 3, 2, 0.15), matte(wc));
      wall.position.y = H / 2;
      h.add(wall);
      const roof = new T.Mesh(new T.ConeGeometry(3.2, 2, 4), matte(rc, { flatShading: true }));
      roof.position.y = H + 1;
      roof.rotation.y = pie / 4;
      h.add(roof);
      for (let w = 0; w < 2; w++) {
        const win = new T.Mesh(new RoundedBoxGeometry(0.8, 0.9, 0.1, 2, 0.08), glossy("#9fe0ff", { emissive: "#fff3c0", emissiveIntensity: 0.15 }));
        win.position.set(-0.9 + w * 1.8, H * 0.62, 1.52);
        h.add(win);
        this.windows.push(win);
      }
      h.position.set(-24 + k * 8 + R() * 2, 0, -12 - R() * 5);
      h.rotation.y = (R() - 0.5) * 0.4;
      h.traverse((o) => o.isMesh && (o.castShadow = true));
      S.add(h);
    }
    for (let k = 0; k < 16; k++) {
      const t = new T.Group();
      const trunk = new T.Mesh(new T.CylinderGeometry(0.2, 0.28, 2, 8), matte("#8a5a35"));
      trunk.position.y = 1;
      t.add(trunk);
      const crown = new T.Mesh(new T.IcosahedronGeometry(1.5 + R(), 1), matte(["#3fbf5a", "#5bd46d", "#2fa04c", "#7fdc6a"][k % 4], { flatShading: true }));
      crown.position.y = 3;
      t.add(crown);
      t.position.set(-30 + k * 4 + R() * 2, 0, -8 - R() * 10);
      t.traverse((o) => o.isMesh && (o.castShadow = true));
      S.add(t);
    }
    // Гирлянда флажков над полем
    this.flags = [];
    const flagCols = ["#ff4f6d", "#ffc533", "#3fdc7a", "#3fb4ff", "#8f5bff"];
    for (const [x0, x1] of [[-12, 0], [0, 12]]) {
      for (let i = 0; i <= 12; i++) {
        const u = i / 12,
          x = x0 + (x1 - x0) * u,
          y = 9.4 - Math.sin(u * pie) * 1.3;
        const f = new T.Mesh(new T.ConeGeometry(0.28, 0.6, 3), matte(flagCols[(i + (x0 < 0 ? 0 : 2)) % 5], { side: T.DoubleSide }));
        f.rotation.set(pie, 0, 0);
        f.scale.z = 0.12;
        f.position.set(x, y - 0.3, -3.8);
        S.add(f);
        this.flags.push(f);
      }
    }
    // Ворота
    this.goals = [-1, 1].map((s) => this.goal(s));
    // Цветы вдоль края поля спереди (ниже уровня игры, не мешают)
    const petal = new T.SphereGeometry(0.12, 8, 6);
    for (let k = 0; k < 40; k++) {
      const x = -14 + k * 0.72 + R() * 0.3;
      const f = new T.Group();
      const c = ["#ff6fa8", "#ffd23f", "#ffffff", "#b47cff", "#ff8f3f"][k % 5];
      for (let p = 0; p < 5; p++) {
        const pe = new T.Mesh(petal, matte(c));
        pe.position.set(Math.cos((p / 5) * pie * 2) * 0.12, 0.25, Math.sin((p / 5) * pie * 2) * 0.12);
        pe.scale.y = 0.5;
        f.add(pe);
      }
      const mid = new T.Mesh(petal, matte("#ffd23f"));
      mid.position.y = 0.27;
      mid.scale.setScalar(0.7);
      f.add(mid);
      f.position.set(x, 0, 4.4 + R() * 0.6);
      S.add(f);
    }
    // Мяч
    this.ballMesh = new T.Mesh(new T.SphereGeometry(BALL_R, 32, 24), new T.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.35, clearcoat: 0.8 }));
    this.ballMesh.castShadow = true;
    S.add(this.ballMesh);
    this.ballShadow = blobShadow(1.1);
    S.add(this.ballShadow);
    this.ballGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: "#ffe066", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    this.ballGlow.scale.setScalar(2.6);
    S.add(this.ballGlow);
    // След звёздного мяча
    this.trail = new T.InstancedMesh(new T.SphereGeometry(0.3, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false, transparent: true, opacity: 0.85 }), 40);
    this.trail.frustumCulled = false;
    this.trail.count = 0;
    this.trailPts = [];
    for (let i = 0; i < 40; i++) this.trail.setColorAt(i, new T.Color("#ffffff"));
    S.add(this.trail);
    this.makeParticles();
    this.buildExtras();
    this.players = [];
  }
  // ---------- Огни, украшения, бонусы, шарики, подавалка, кольца ----------
  buildExtras() {
    const S = this.scene,
      R = rng(23);
    // Прожекторные мачты за забором: светятся на закате и вечером, вечером — лучи на поле
    this.lampMat = new T.MeshStandardMaterial({ color: "#fffbe8", emissive: "#fff3c8", emissiveIntensity: 0, roughness: 0.3 });
    this.towers = new T.Group();
    this.beams = [];
    for (const sx of [-1, 1]) {
      const t = new T.Group();
      const pole = new T.Mesh(new T.CylinderGeometry(0.16, 0.24, 11, 10), matte("#7a86a0", { metalness: 0.4, roughness: 0.5 }));
      pole.position.y = 5.5;
      t.add(pole);
      const head = new T.Mesh(new RoundedBoxGeometry(2.6, 1.3, 0.4, 2, 0.1), matte("#4a5470"));
      head.position.set(0, 11.2, 0);
      t.add(head);
      for (let i = 0; i < 6; i++) {
        const lamp = new T.Mesh(new T.CircleGeometry(0.28, 16), this.lampMat);
        lamp.position.set(-0.85 + (i % 3) * 0.85, 11.5 - Math.floor(i / 3) * 0.6, 0.21);
        t.add(lamp);
      }
      t.position.set(sx * 15.5, 0, -6.8);
      t.rotation.y = -sx * 0.3;
      this.towers.add(t);
      // Луч: мягкий светящийся конус от ламп к полю
      const from = new T.Vector3(sx * 15.5, 11.2, -6.4),
        to = new T.Vector3(sx * 4.5, 0, 0.5);
      const dir = from.clone().sub(to);
      const beam = new T.Mesh(
        new T.ConeGeometry(4.2, dir.length(), 28, 1, true),
        new T.MeshBasicMaterial({ color: new T.Color(1, 0.96, 0.8), transparent: true, opacity: 0.06, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }),
      );
      beam.position.copy(from).add(to).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
      beam.visible = false;
      S.add(beam);
      this.beams.push(beam);
    }
    this.towers.visible = false;
    S.add(this.towers);

    // Украшения двора из раздевалки
    this.decor = {};
    // Шарики на заборе
    const bal = new T.Group();
    const balCols = ["#ff4f6d", "#ffc533", "#3fb4ff", "#3fdc7a", "#c85fff", "#ff8f3f"];
    const balGeo = new T.SphereGeometry(0.36, 18, 14);
    for (let i = 0; i < 8; i++) {
      const cl = new T.Group();
      for (let k = 0; k < 3; k++) {
        const b = new T.Mesh(balGeo, glossy(balCols[(i + k * 2) % balCols.length], { roughness: 0.15, clearcoat: 1 }));
        b.scale.set(1, 1.18, 1);
        b.position.set((k - 1) * 0.42, 1.05 + (k === 1 ? 0.3 : 0), (k - 1) * 0.1);
        cl.add(b);
        const str = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 1, 4), matte("#ffffff"));
        str.position.set((k - 1) * 0.21, 0.5 + (k === 1 ? 0.15 : 0), 0);
        str.rotation.z = (k - 1) * -0.35;
        cl.add(str);
      }
      cl.position.set(-17 + i * 4.9 + R(), 3.1, -4.3);
      cl.userData.ph = R() * 6;
      bal.add(cl);
    }
    bal.visible = false;
    S.add(bal);
    this.decor.balloons = bal;
    // Гирлянда огоньков по верху забора: перемигивается, вечером светится сильнее
    const bulbPos = [];
    for (let x = -19; x <= 19; x += 0.8) {
      const u = (((x + 19) / 4.8) % 1) - 0.5;
      bulbPos.push([x, 3.38 - (0.25 - u * u) * 0.9, -4.3]);
    }
    const bulbs = new T.InstancedMesh(new T.SphereGeometry(0.1, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(1, 1, 1), toneMapped: false }), bulbPos.length);
    const wire = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(bulbPos.map((p) => new T.Vector3(p[0], p[1] + 0.08, p[2]))), 200, 0.015, 4), matte("#2a3a2a"));
    const bulbCols = ["#ff5f7f", "#ffd84a", "#5fd8ff", "#7fff8a", "#d08fff"].map((c) => new T.Color(c));
    bulbPos.forEach((p, i) => {
      this.dummy0 ??= new T.Object3D();
      this.dummy0.position.set(...p);
      this.dummy0.updateMatrix();
      bulbs.setMatrixAt(i, this.dummy0.matrix);
      bulbs.setColorAt(i, bulbCols[i % 5]);
    });
    const lights = new T.Group();
    lights.add(bulbs, wire);
    lights.visible = false;
    S.add(lights);
    this.decor.lights = lights;
    this.bulbs = { mesh: bulbs, cols: bulbCols };

    // Трава кочками по краям поля — только на высоком качестве
    const tuft = new T.ConeGeometry(0.07, 0.34, 4);
    tuft.translate(0, 0.17, 0);
    this.grass = new T.InstancedMesh(tuft, matte("#4fbf4a", { flatShading: true }), 900);
    const gd = new T.Object3D();
    for (let i = 0; i < 900; i++) {
      // Кочки у забора за полем и немного у цветов спереди (спереди мельче — они ближе к камере)
      const near = i % 5 === 0;
      gd.position.set(-16 + R() * 32, 0, near ? 4.1 + R() * 0.5 : -2.95 - R() * 1.4);
      gd.rotation.set((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5);
      gd.scale.setScalar(near ? 0.35 + R() * 0.3 : 0.6 + R() * 0.9);
      gd.updateMatrix();
      this.grass.setMatrixAt(i, gd.matrix);
      this.grass.setColorAt(i, new T.Color().setHSL(0.27 + R() * 0.08, 0.55, 0.38 + R() * 0.18));
    }
    S.add(this.grass);

    // Бонусы на поле: пузырь со значком внутри
    this.itemTex = {};
    for (const kind of ["star", "speed", "snow", "magnet", "big"]) this.itemTex[kind] = itemIcon(kind);
    this.itemPool = [];
    for (let i = 0; i < 2; i++) {
      const g = new T.Group();
      const bubble = new T.Mesh(new T.SphereGeometry(0.58, 28, 20), new T.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.32, roughness: 0.05, clearcoat: 1, emissive: "#ffffff", emissiveIntensity: 0.25, depthWrite: false }));
      const icon = new T.Sprite(new T.SpriteMaterial({ map: this.itemTex.star, depthWrite: false }));
      icon.scale.setScalar(0.82);
      const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: "#ffe066", transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending }));
      halo.scale.setScalar(2.4);
      g.add(halo, bubble, icon);
      g.visible = false;
      S.add(g);
      this.itemPool.push({ g, bubble, icon, halo, id: 0 });
    }

    // Шарики-мишени (испытание «Меткий удар»)
    this.balloonPool = [];
    const tCols = ["#ff4f6d", "#ffc533", "#3fb4ff", "#3fdc7a", "#c85fff"];
    for (let i = 0; i < 4; i++) {
      const g = new T.Group();
      const mat = glossy("#ff4f6d", { roughness: 0.12, clearcoat: 1 });
      const ball = new T.Mesh(new T.SphereGeometry(0.55, 24, 18), mat);
      ball.scale.set(1, 1.18, 1);
      ball.castShadow = true;
      const knot = new T.Mesh(new T.ConeGeometry(0.1, 0.16, 8), mat);
      knot.position.y = -0.68;
      const str = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 1.1, 4), matte("#ffffff"));
      str.position.y = -1.3;
      const shine = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
      shine.position.set(0.2, 0.25, 0.42);
      g.add(ball, knot, str, shine);
      g.visible = false;
      S.add(g);
      this.balloonPool.push({ g, mat, id: 0, cols: tCols });
    }

    // Подающая машинка (испытание «Вратарь»): весёлый барабан на колёсах с глазками
    const L = new T.Group();
    const drum = new T.Mesh(new RoundedBoxGeometry(1.3, 1.1, 1.2, 3, 0.25), glossy("#3fb4ff"));
    drum.position.y = 0.85;
    const tube = new T.Mesh(new T.CylinderGeometry(0.34, 0.4, 0.8, 18), glossy("#ffc533"));
    tube.rotation.z = pie / 2;
    tube.position.set(-0.8, 1.0, 0);
    const ring = new T.Mesh(new T.TorusGeometry(0.36, 0.08, 10, 20), glossy("#ff4f6d"));
    ring.rotation.y = pie / 2;
    ring.position.set(-1.2, 1.0, 0);
    L.add(drum, tube, ring);
    for (const z of [-0.45, 0.45]) {
      const wh = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.16, 16), matte("#2b2b3d"));
      wh.rotation.x = pie / 2;
      wh.position.set(0, 0.3, z);
      L.add(wh);
      const eye = new T.Mesh(new T.SphereGeometry(0.15, 12, 10), matte("#ffffff"));
      eye.position.set(-0.45, 1.25, z * 0.6);
      const pup = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), glossy("#1d1420", { roughness: 0.1 }));
      pup.position.set(-0.58, 1.25, z * 0.6);
      L.add(eye, pup);
    }
    L.traverse((o) => o.isMesh && (o.castShadow = true));
    L.position.set(9.0, 0, 0);
    L.visible = false;
    S.add(L);
    this.launcher = { g: L, kick: 0 };

    // Ударные волны: плоские кольца, всегда повёрнуты к камере
    this.rings = [];
    for (let i = 0; i < 12; i++) {
      const m = new T.Mesh(new T.RingGeometry(0.82, 1, 48), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
      m.visible = false;
      S.add(m);
      this.rings.push({ m, life: 0, max: 1, size: 1 });
    }
    this.ringNext = 0;
    // Ракеты салюта
    this.rockets = [];
  }
  // Ударная волна: кольцо растёт и тает
  wave(at, color = "#ffffff", size = 3, dur = 0.5) {
    if (this.motion.matches) size *= 0.6;
    const r = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.m.position.copy(at);
    r.m.material.color.set(color).multiplyScalar(1.6);
    r.life = r.max = dur;
    r.size = size;
    r.m.visible = true;
  }
  // Салют: ракеты взлетают из-за забора и рассыпаются звёздочками
  fireworks(n = 3) {
    for (let k = 0; k < n; k++)
      this.rockets.push({ p: new T.Vector3(-10 + Math.random() * 20, 2, -5), v: new T.Vector3((Math.random() - 0.5) * 2, 12 + Math.random() * 3, 0.8), life: 0.75 + Math.random() * 0.35 + k * 0.18, delay: k * 0.22, col: ["#ff5f7f", "#ffd84a", "#5fd8ff", "#7fff8a", "#d08fff"][Math.floor(Math.random() * 5)] });
  }
  // Украшения из раздевалки
  setDecor(list) {
    for (const k in this.decor) this.decor[k].visible = list.includes(k);
    this.fireworksOn = list.includes("fireworks");
  }
  setBall(kind) {
    const m = this.ballMesh.material;
    m.map?.dispose();
    m.map = ballTexture(kind);
    m.emissive.set(kind === "sun" ? "#ff9f1f" : "#000000");
    m.emissiveIntensity = kind === "sun" ? 0.35 : 0;
    m.needsUpdate = true;
    this.ballKind = kind;
  }
  // Бонус взят: вспышка цвета бонуса и кольцо
  itemFx(x, y, kind) {
    const col = ITEM_COLORS[kind] || "#ffffff";
    const at = new T.Vector3(x, y, 0);
    this.burst(at, 30, [col, "#ffffff"], 4);
    this.wave(at, col, 2.6, 0.45);
  }
  balloonPop(x, y, color) {
    const col = this.balloonPool[0].cols[color % 5];
    const at = new T.Vector3(x, y, 0);
    this.burst(at, 36, [col, "#ffffff", col], 5);
    this.wave(at, col, 2.2, 0.35);
    for (let k = 0; k < 30; k++) {
      const s = this.confPool[this.confNext];
      this.confNext = (this.confNext + 1) % this.confPool.length;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 7, Math.random() * 6, (Math.random() - 0.5) * 3);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.life = 1.2 + Math.random();
    }
  }
  launchFx() {
    this.launcher.kick = 1;
    this.puff(new T.Vector3(7.9, 1, 0), 6);
  }
  // Ворота: стойка на линии, перекладина до задней стенки, сетка
  goal(s) {
    const g = new T.Group(),
      F = FIELD;
    const white = glossy("#ffffff", { roughness: 0.25 });
    const post = (h) => new T.Mesh(new T.CylinderGeometry(0.1, 0.1, h, 12), white);
    for (const z of [-1.3, 1.3]) {
      const p = post(F.bar);
      p.position.set(s * F.line, F.bar / 2, z);
      g.add(p);
      const bar = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, F.half - F.line, 12), white);
      bar.rotation.z = pie / 2;
      bar.position.set((s * (F.line + F.half)) / 2, F.bar, z);
      g.add(bar);
      const back = post(F.bar);
      back.position.set(s * F.half, F.bar / 2, z);
      back.scale.x = back.scale.z = 0.7;
      g.add(back);
    }
    const cross = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 2.6, 12), white);
    cross.rotation.x = pie / 2;
    cross.position.set(s * F.line, F.bar, 0);
    g.add(cross);
    // Сетка: прозрачные квадратики
    const netTex = canvasTexture(64, 64, (x) => {
      x.clearRect(0, 0, 64, 64);
      x.strokeStyle = "rgba(255,255,255,0.85)";
      x.lineWidth = 3;
      x.strokeRect(0, 0, 64, 64);
    });
    netTex.wrapS = netTex.wrapT = T.RepeatWrapping;
    const netMat = (rx, ry) => {
      const t = netTex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return new T.MeshBasicMaterial({ map: t, transparent: true, side: T.DoubleSide, depthWrite: false });
    };
    const backNet = new T.Mesh(new T.PlaneGeometry(2.6, F.bar, 8, 8), netMat(8, 10));
    backNet.rotation.y = pie / 2;
    backNet.position.set(s * F.half, F.bar / 2, 0);
    g.add(backNet);
    const topNet = new T.Mesh(new T.PlaneGeometry(F.half - F.line, 2.6), netMat(5, 8));
    topNet.rotation.x = -pie / 2;
    topNet.position.set((s * (F.line + F.half)) / 2, F.bar, 0);
    g.add(topNet);
    const sideNet = new T.Mesh(new T.PlaneGeometry(F.half - F.line, F.bar), netMat(5, 10));
    sideNet.position.set((s * (F.line + F.half)) / 2, F.bar / 2, -1.3);
    g.add(sideNet);
    g.traverse((o) => o.isMesh && o.material === white && (o.castShadow = true));
    this.scene.add(g);
    return { group: g, backNet, base: Float32Array.from(backNet.geometry.attributes.position.array), shake: 0 };
  }
  // kinds — [левый, правый]; kit — форма левого игрока (из раздевалки); solo — правого нет (испытание)
  setPlayers(kinds, kit = "home", solo = false) {
    for (const p of this.players) p.group.removeFromParent();
    this.players = kinds.map((k, i) => {
      const f = footballer(k, i ? 7 : 10, i ? "home" : kit);
      f.group.scale.setScalar(1.25);
      f.group.visible = !(solo && i === 1);
      // Ледышка (бонус «Снежинка» у соперника) и кольцо магнита
      const ice = new T.Mesh(new RoundedBoxGeometry(1.7, 2.6, 1.4, 3, 0.3), new T.MeshPhysicalMaterial({ color: "#c8f4ff", transparent: true, opacity: 0.5, roughness: 0.08, clearcoat: 1, emissive: "#7fdcff", emissiveIntensity: 0.25, depthWrite: false }));
      ice.position.y = 1.25;
      ice.visible = false;
      f.group.add(ice);
      const magnet = new T.Mesh(new T.TorusGeometry(0.75, 0.05, 8, 40), new T.MeshBasicMaterial({ color: new T.Color(2, 0.5, 0.7), toneMapped: false, transparent: true, opacity: 0.85 }));
      magnet.rotation.x = pie / 2;
      magnet.position.y = 0.06;
      magnet.visible = false;
      f.group.add(magnet);
      const boots = [];
      f.group.traverse((o) => o.isMesh && o.geometry.type === "RoundedBoxGeometry" && o !== ice && boots.push(o));
      this.scene.add(f.group);
      return { ...f, swing: 0, stunned: 0, celebrate: 0, ice, magnet, boots, bigK: 1 };
    });
  }
  // ---------- События ----------
  kick(side, kind) {
    const p = this.players[side];
    if (p) p.swing = 1;
    const b = this.ballMesh.position;
    const star = kind === "star";
    this.burst(b, star ? 50 : 12, star ? ["#ffe066", "#ff8fd0", "#7fe8ff", "#ffffff"] : ["#ffffff", "#fff3a0"], star ? 6 : 2.5);
    this.wave(b, star ? "#ffe066" : "#ffffff", star ? 3.2 : 1.5, star ? 0.5 : 0.28);
    if (star) {
      this.shake(0.25);
      this.wave(b, "#ff8fd0", 4.5, 0.7);
    }
  }
  header(x, y) {
    this.wave(new T.Vector3(x, y, 0), "#ffffff", 1.3, 0.25);
  }
  swing(side) {
    const p = this.players[side];
    if (p) p.swing = 1;
  }
  goalScored(side, star) {
    // Сетка ворот, в которые забили, колышется
    const gi = side === 0 ? 1 : 0;
    this.goals[gi].shake = 1;
    const at = new T.Vector3(gi ? 9 : -9, 1.6, 0);
    this.confetti(at);
    this.confetti(at.clone().setY(3));
    this.burst(at, 70, ["#ffe066", "#ff4f6d", "#3fb4ff", "#3fdc7a", "#ffffff"], 7);
    // Ударная волна, вспышка света у ворот, камера подъезжает к воротам
    this.wave(at, "#ffffff", 6, 0.6);
    this.wave(at, star ? "#ff8fd0" : "#ffe066", 9, 0.9);
    this.flashLight.position.set(at.x * 0.85, 3, 2.5);
    this.flashLight.intensity = 14;
    this.punch(at.x * 0.55, 1.6, 0.9);
    if (this.fireworksOn) this.fireworks(3);
    this.shake(star ? 0.45 : 0.3);
    const p = this.players[side];
    if (p) p.celebrate = 2.2;
    for (const f of this.fans) f.cheer = 2.5;
  }
  // Камера ненадолго подъезжает к точке (x, y)
  punch(x, y, dur = 0.9) {
    if (this.motion.matches) return;
    this.punchAt = { x, y, t: 0, dur };
  }
  stun(side) {
    const p = this.players[side];
    if (p) p.stunned = 0.9;
    this.burst(new T.Vector3(p.group.position.x, 2.4, 0), 14, ["#ffe066", "#ffffff"], 2);
  }
  dust(x) {
    this.puff(new T.Vector3(x, 0.1, 0), 6);
  }
  shake(a) {
    if (!this.motion.matches) this.shakeAmp = Math.max(this.shakeAmp, a);
  }
  // ---------- Частицы ----------
  makeParticles() {
    const n = 900;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.08, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    const c = 300;
    this.conf = new T.InstancedMesh(new T.PlaneGeometry(0.18, 0.28), new T.MeshBasicMaterial({ side: T.DoubleSide }), c);
    this.conf.frustumCulled = false;
    this.confPool = Array.from({ length: c }, () => ({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Vector3(), life: 0 }));
    this.confNext = 0;
    const cols = ["#ff4f6d", "#ffc533", "#3fdc7a", "#3fb4ff", "#8f5bff", "#ff8f3f"];
    for (let i = 0; i < c; i++) this.conf.setColorAt(i, new T.Color(cols[i % cols.length]));
    this.puffs = new T.InstancedMesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshStandardMaterial({ color: "#f4ead8", roughness: 1, transparent: true, opacity: 0.8 }), 80);
    this.puffs.frustumCulled = false;
    this.puffPool = Array.from({ length: 80 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
    this.puffNext = 0;
    this.scene.add(this.sparks, this.conf, this.puffs);
    this.dummy = new T.Object3D();
  }
  burst(at, count, colors, speed) {
    count = Math.max(1, Math.round(count * this.fxScale));
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, new T.Color(colors[k % colors.length]));
      this.next = (this.next + 1) % this.pool.length;
      s.p.copy(at);
      s.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, (Math.random() - 0.5) * 0.6).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.45 + Math.random() * 0.6;
      s.s = 0.7 + Math.random();
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  confetti(at) {
    for (let k = 0, n = Math.round(120 * this.fxScale); k < n; k++) {
      const s = this.confPool[this.confNext];
      this.confNext = (this.confNext + 1) % this.confPool.length;
      s.p.copy(at).add(new T.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2));
      s.v.set((Math.random() - 0.5) * 9, 5 + Math.random() * 7, (Math.random() - 0.5) * 4);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.life = 2.5 + Math.random() * 1.5;
    }
  }
  puff(at, count) {
    for (let k = 0; k < count; k++) {
      const s = this.puffPool[this.puffNext];
      this.puffNext = (this.puffNext + 1) % this.puffPool.length;
      s.p.copy(at).add(new T.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
      s.v.set((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 1);
      s.max = s.life = 0.5 + Math.random() * 0.3;
    }
  }
  // ---------- Кадр: состояние матча → картинка ----------
  sync(m, dt) {
    const t = this.time,
      calm = this.motion.matches ? 0.3 : 1;
    if (!m) return;
    m.players.forEach((p, i) => {
      const v = this.players[i];
      if (!v) return;
      v.group.position.set(p.x, p.y, 0);
      // Смотрит на соперника, чуть повернувшись к нам
      v.group.rotation.y = p.face > 0 ? -0.55 : pie + 0.55;
      const run = Math.abs(p.vx) > 0.5 && p.y < 0.05;
      const ph = t * 16;
      // Удар: бьющая нога (ближняя к мячу) махом вперёд
      v.swing = Math.max(0, v.swing - dt * 5);
      const sw = Math.sin((1 - v.swing) * pie) * v.swing * 1.6;
      v.legs[0].rotation.z = run ? Math.sin(ph) * 0.7 : 0;
      v.legs[1].rotation.z = sw > 0.01 ? sw * 1.6 : run ? -Math.sin(ph) * 0.7 : 0;
      v.arms[0].rotation.z = run ? -Math.sin(ph) * 0.6 : 0;
      v.arms[1].rotation.z = run ? Math.sin(ph) * 0.6 : 0;
      v.body.position.y = run ? Math.abs(Math.sin(ph)) * 0.08 : Math.sin(t * 3 + i) * 0.02 * calm;
      v.body.rotation.z = p.vy > 0.5 ? 0.15 : 0;
      // Сбит звёздным мячом: кружится голова, звёздочки
      v.stunned = Math.max(0, v.stunned - dt);
      v.head.rotation.x = v.stunned > 0 ? Math.sin(t * 20) * 0.25 : 0;
      // Следит за мячом: задирает голову, когда мяч летит высоко
      const up = v.stunned > 0 ? 0 : clamp((m.ball.y - 1.6) * 0.11, -0.12, 0.45) * calm;
      v.lookUp = (v.lookUp || 0) + (up - (v.lookUp || 0)) * Math.min(1, dt * 8);
      v.head.rotation.z = v.lookUp;
      // Радость после гола: прыгает, машет руками
      v.celebrate = Math.max(0, v.celebrate - dt);
      if (v.celebrate > 0) {
        v.body.position.y += Math.abs(Math.sin(t * 9)) * 0.5;
        v.arms[0].rotation.x = 2.6;
        v.arms[1].rotation.x = -2.6;
      } else {
        v.arms[0].rotation.x = -0.5;
        v.arms[1].rotation.x = 0.5;
      }
      if (v.body.userData.tail) v.body.userData.tail.rotation.z = Math.sin(t * 6 + i) * 0.3;
      const blink = (t + i * 1.3) % 3.6 > 3.48;
      for (const e of v.eyes) e.scale.y = blink ? 0.15 : 1;
      v.shadow.position.y = 0.015 - p.y;
      v.shadow.scale.setScalar(Math.max(0.4, 1 - p.y * 0.2));
      // Бонусы: ледышка, большая голова, светящиеся бутсы, кольцо магнита
      const fx = p.fx || {};
      v.ice.visible = fx.snow > 0;
      if (v.ice.visible) {
        const k = Math.min(1, fx.snow * 4, (2.2 - fx.snow) * 8);
        v.ice.scale.set(k, k, k);
        if (Math.random() < 0.15) this.burst(new T.Vector3(p.x + (Math.random() - 0.5) * 1.6, p.y + Math.random() * 3, 0.6), 1, ["#ffffff", "#bff4ff"], 1);
      }
      v.bigK += ((fx.big > 0 ? 1.45 : 1) - v.bigK) * Math.min(1, dt * 10);
      v.head.scale.setScalar(v.bigK);
      v.head.position.y = 1.62 + (v.bigK - 1) * 0.62;
      const fast = fx.speed > 0;
      for (const b of v.boots) {
        b.material.emissive?.set(fast ? "#ffb02e" : "#000000");
        if (b.material.emissiveIntensity !== undefined) b.material.emissiveIntensity = fast ? 1.6 : 0;
      }
      if (fast && Math.abs(p.vx) > 2 && Math.random() < 0.5) this.burst(new T.Vector3(p.x - Math.sign(p.vx) * 0.4, p.y + 0.2, 0.3), 1, ["#ffd84a", "#ff8f3f"], 1.2);
      v.magnet.visible = fx.magnet > 0;
      if (v.magnet.visible) {
        v.magnet.rotation.z = t * 4;
        v.magnet.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
      }
    });
    this.syncItems(m, t);
    this.syncTargets(m, t);
    this.launcher.g.visible = m.mode === "keeper";
    if (this.launcher.g.visible) {
      this.launcher.kick = Math.max(0, this.launcher.kick - dt * 4);
      this.launcher.g.position.x = 9.0 + this.launcher.kick * 0.35;
      this.launcher.g.scale.set(1 - this.launcher.kick * 0.1, 1 + this.launcher.kick * 0.15, 1);
    }
    const b = m.ball;
    // Мяч сплющивается при отскоке от земли, от сильного удара — облачко пыли
    if (this.ballVy < -1 && b.vy > 0 && b.y < 1) {
      this.ballSquash = clamp(-this.ballVy / 14, 0.15, 0.45);
      if (this.ballVy < -7) this.dust(b.x);
    }
    this.ballVy = b.vy;
    this.ballSquash = (this.ballSquash || 0) * Math.pow(0.0005, dt);
    const sq = this.ballSquash * calm;
    this.ballMesh.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    this.ballX = b.x;
    this.ballMesh.position.set(b.x, b.y, 0);
    this.ballMesh.rotation.z -= b.spin * dt * 0.5;
    this.ballShadow.position.set(b.x, 0.016, 0);
    this.ballShadow.scale.setScalar(Math.max(0.3, 1 - b.y * 0.1));
    this.ballGlow.position.copy(this.ballMesh.position);
    this.ballGlow.material.opacity = b.star > 0 ? 0.9 : 0;
    // След: у звёздного мяча — радуга, у просто быстрого — светлая полоса
    const speed = Math.hypot(b.vx, b.vy);
    const fastBall = speed > 12.5 && !this.motion.matches;
    if (b.star > 0 || fastBall) {
      this.trailPts.unshift(this.ballMesh.position.clone());
      if (this.trailPts.length > (b.star > 0 ? 40 : 16)) this.trailPts.pop();
    } else if (this.trailPts.length) this.trailPts.pop();
    if (this.trailPts.length > 16 && b.star <= 0) this.trailPts.length = 16;
    const d = this.dummy;
    this.trailCol ??= new T.Color();
    this.trailPts.forEach((q, k) => {
      d.position.copy(q);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(b.star > 0 ? 1 - k / 40 : (1 - k / 16) * 0.85);
      d.updateMatrix();
      this.trail.setMatrixAt(k, d.matrix);
      if (b.star > 0) this.trailCol.setHSL((k / 20 + t) % 1, 1, 0.6).multiplyScalar(1.8);
      else this.trailCol.setRGB(0.8, 0.95, 1.3).multiplyScalar(0.9 - k / 20);
      this.trail.setColorAt(k, this.trailCol);
    });
    this.trail.count = this.trailPts.length;
    this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
  }
  // Пузыри-бонусы на поле
  syncItems(m, t) {
    const items = m.items || [];
    this.itemPool.forEach((v, i) => {
      const it = items[i];
      v.g.visible = !!it;
      if (!it) return (v.id = 0);
      if (v.id !== it.id) {
        v.id = it.id;
        v.icon.material.map = this.itemTex[it.kind];
        v.halo.material.color.set(ITEM_COLORS[it.kind]);
        v.bubble.material.emissive.set(ITEM_COLORS[it.kind]);
        v.born = t;
      }
      // Появляется с пружинкой, покачивается, мигает перед тем как исчезнуть
      const age = t - v.born;
      const pop = Math.min(1, age * 3);
      const k = pop < 1 ? Math.sin(pop * pie * 0.5) * (1 + Math.sin(pop * pie) * 0.25) : 1;
      v.g.position.set(it.x, it.y + Math.sin(t * 3 + i) * 0.12, 0.2);
      v.g.scale.setScalar(k * (1 + Math.sin(t * 6) * 0.04));
      v.g.visible = it.life > 2 || Math.sin(t * 20) > -0.3;
      v.icon.material.rotation = Math.sin(t * 2) * 0.2;
    });
  }
  // Шарики-мишени в «Метком ударе»
  syncTargets(m, t) {
    const ts = m.mode === "targets" ? m.targets : [];
    this.balloonPool.forEach((v, i) => {
      const it = ts[i];
      v.g.visible = !!it;
      if (!it) return (v.id = 0);
      if (v.id !== it.id) {
        v.id = it.id;
        v.mat.color.set(v.cols[it.color % 5]);
        v.born = t;
      }
      const k = Math.min(1, (t - v.born) * 4);
      v.g.position.set(it.x, it.y + Math.sin(t * 2 + i * 1.7) * 0.08, 0);
      v.g.rotation.z = Math.sin(t * 1.6 + i) * 0.1;
      v.g.scale.setScalar(k);
    });
  }
  frame(ms) {
    if (document.hidden) return;
    const raw = this.last ? (ms - this.last) / 1000 : 0;
    const dt = clamp(raw, 0, 0.1);
    this.last = ms;
    this.time += dt;
    const t = this.time,
      calm = this.motion.matches ? 0.3 : 1;
    for (const tw of [...this.tweens]) {
      const p = clamp((t - tw.at) / tw.dur, 0, 1);
      tw.update(p);
      if (p === 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    if (this.onFrame) this.onFrame(dt);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt * calm;
      if (c.position.x > 80) c.position.x = -80;
    }
    this.flags.forEach((f, i) => (f.rotation.z = Math.sin(t * 2 + i * 0.7) * 0.15 * calm));
    for (const f of this.fans) {
      f.cheer = Math.max(0, (f.cheer || 0) - dt);
      const jump = f.cheer > 0 ? Math.abs(Math.sin(t * 10 + f.ph)) * 0.8 : Math.abs(Math.sin(t * 1.5 + f.ph)) * 0.08 * calm;
      f.group.position.y = f.base + jump;
      // Болельщики поворачиваются вслед за мячом
      f.yaw0 ??= f.group.rotation.y;
      const want = f.yaw0 + clamp(((this.ballX || 0) - f.group.position.x) * 0.06, -0.6, 0.6) * calm;
      f.group.rotation.y += (want - f.group.rotation.y) * Math.min(1, dt * 5);
      f.arms[0].rotation.x = f.cheer > 0 ? 2.6 : -0.5;
      f.arms[1].rotation.x = f.cheer > 0 ? -2.6 : 0.5;
    }
    // Украшения: шарики на заборе покачиваются, огоньки перемигиваются
    if (this.decor.balloons.visible) this.decor.balloons.children.forEach((c) => (c.rotation.z = Math.sin(t * 1.4 + c.userData.ph) * 0.12 * calm));
    if (this.decor.lights.visible) {
      const { mesh, cols } = this.bulbs;
      const night = this.skyName === "night" ? 2.6 : this.skyName === "sunset" ? 1.9 : 1.3;
      this.bulbCol ??= new T.Color();
      for (let i = 0; i < mesh.count; i++) {
        const tw = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.9) * calm;
        mesh.setColorAt(i, this.bulbCol.copy(cols[i % 5]).multiplyScalar(night * (0.6 + tw * 0.6)));
      }
      mesh.instanceColor.needsUpdate = true;
    }
    // Ударные волны
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.max;
      r.m.scale.setScalar(0.2 + r.size * (1 - (1 - k) * (1 - k)));
      r.m.material.opacity = (1 - k) * 0.65;
      r.m.quaternion.copy(this.camera.quaternion);
      if (r.life <= 0) r.m.visible = false;
    }
    // Салют
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      r.life -= dt;
      r.v.y -= 9 * dt;
      r.p.addScaledVector(r.v, dt);
      this.burst(r.p, 1, ["#fff3c0", r.col], 0.6);
      if (r.life <= 0) {
        this.burst(r.p, 70, [r.col, "#ffffff", r.col], 6);
        this.wave(r.p, r.col, 4, 0.5);
        this.rockets.splice(i, 1);
        this.onBoom?.();
      }
    }
    this.flashLight.intensity *= Math.pow(0.004, dt);
    // Сетка ворот колышется после гола
    for (const g of this.goals) {
      if (g.shake <= 0) continue;
      g.shake = Math.max(0, g.shake - dt * 0.8);
      const a = g.backNet.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) a.setZ(i, g.base[i * 3 + 2] + Math.sin(g.base[i * 3] * 3 + t * 18) * Math.sin(g.base[i * 3 + 1] * 2) * 0.35 * g.shake);
      a.needsUpdate = true;
    }
    // Частицы
    const d = this.dummy;
    this.pool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 6 * dt;
        s.p.addScaledVector(s.v, dt);
      }
      d.position.copy(s.p);
      d.rotation.set(s.life * 7, s.life * 5, 0);
      d.scale.setScalar(Math.max(0, s.life / s.max) * s.s);
      d.updateMatrix();
      this.sparks.setMatrixAt(i, d.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    this.confPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 7 * dt;
        s.v.multiplyScalar(Math.pow(0.5, dt));
        s.p.addScaledVector(s.v, dt);
        s.r.addScalar(dt * 5);
      }
      d.position.copy(s.p);
      d.rotation.set(s.r.x, s.r.y, s.r.z);
      d.scale.setScalar(s.life > 0 ? Math.min(1, s.life) : 0);
      d.updateMatrix();
      this.conf.setMatrixAt(i, d.matrix);
    });
    this.conf.instanceMatrix.needsUpdate = true;
    this.puffPool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.p.addScaledVector(s.v, dt);
      }
      const f = s.life > 0 ? s.life / s.max : 0;
      d.position.copy(s.p);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(f > 0 ? 1.4 - f * 0.6 : 0);
      d.updateMatrix();
      this.puffs.setMatrixAt(i, d.matrix);
    });
    this.puffs.instanceMatrix.needsUpdate = true;
    // Камера: лёгкая тряска при голе и короткий наезд к воротам
    if (this.home) {
      this.camera.position.copy(this.home);
      this.lookNow ??= new T.Vector3();
      this.lookNow.copy(this.look);
      if (this.punchAt) {
        const pa = this.punchAt;
        pa.t += dt;
        const k = Math.sin(Math.min(1, pa.t / pa.dur) * pie) * 0.22;
        this.camera.position.x += (pa.x - this.camera.position.x) * k;
        this.camera.position.z += (pa.y + 6 - this.camera.position.z) * k * 0.6;
        this.lookNow.x += (pa.x - this.lookNow.x) * k * 1.2;
        if (pa.t >= pa.dur) this.punchAt = null;
      }
      if (this.shakeAmp > 0.001) {
        this.camera.position.add(new T.Vector3((Math.random() - 0.5) * this.shakeAmp, (Math.random() - 0.5) * this.shakeAmp, 0));
        this.shakeAmp *= Math.pow(0.02, dt);
      }
      this.camera.lookAt(this.lookNow);
    }
    if (this.glow.on) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    // Авто-качество: средний fps за 3 с ниже 45 — на ступень ниже (паузы дольше секунды — свернули, снимок — не считаем)
    const A = this.auto;
    if (A.on && raw > 0) {
      if (raw > 1) A.frames = A.time = 0;
      else {
        A.frames++;
        A.time += Math.min(raw, 0.25);
        if (A.time > 3) {
          const f = A.frames / A.time;
          A.frames = A.time = 0;
          if (f < 45 && this.quality !== "low") {
            this.setQuality(DOWN[this.quality]);
            this.auto.on = true;
            this.onQuality?.(this.quality, Math.round(f));
          }
        }
      }
    }
  }
  // Картинка героя для кнопки выбора
  portrait(kind, size = 256) {
    const scene = new T.Scene();
    scene.environment = this.scene.environment;
    scene.add(new T.HemisphereLight(0xffffff, 0xffe0ea, 1.4));
    const key = new T.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 6);
    scene.add(key);
    const f = footballer(kind, 10);
    f.shadow.visible = false;
    f.group.rotation.y = -0.6 - pie / 2 + pie / 2;
    f.group.rotation.y = -pie / 2 + 0.55;
    scene.add(f.group);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 1.6, 6.4);
    cam.lookAt(0, 1.25, 0);
    const target = new T.WebGLRenderTarget(size, size, { samples: 4 });
    target.texture.colorSpace = T.SRGBColorSpace;
    const r = this.renderer,
      keep = r.getRenderTarget(),
      keepAlpha = r.getClearAlpha(),
      keepColor = r.getClearColor(new T.Color());
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(target, 0, 0, size, size, px);
    r.setRenderTarget(keep);
    r.setClearColor(keepColor, keepAlpha);
    target.dispose();
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d"),
      img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
  snapshot(w = 1600, h = 1000, margin = [-0.9, 0.9]) {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.fit(w / h, margin);
    this.camera.position.copy(this.home);
    this.camera.lookAt(this.look);
    this.composer.render();
    const url = this.renderer.domElement.toDataURL("image/jpeg", 0.9);
    this.resize();
    return url;
  }
}
