// 3D-инструменты доктора. У каждого кончик в начале координат, ручка вдоль +Y,
// рабочая сторона (щетина, бор, луч) смотрит в −Z, то есть в ротик.
import * as T from "../vendor/three/three.module.min.js?v=1f1cdb42";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=1f1cdb42";

const pie = Math.PI;
const plastic = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, ...extra });
const metal = (color = "#dfe6ee") => new T.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.18, clearcoat: 0.6 });
const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
const capsule = (r, len) => new T.CapsuleGeometry(r, len, 8, 20);

function brush() {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  // Головка со щетиной и пастой
  add(body, new RoundedBoxGeometry(0.2, 0.62, 0.09, 3, 0.04), plastic("#ffffff"), 0, 0.31, 0.12);
  const tuft = new T.CylinderGeometry(0.022, 0.026, 0.17, 8);
  tuft.rotateX(pie / 2);
  const white = plastic("#ffffff", { roughness: 0.5 }),
    aqua = plastic("#5fe0d0", { roughness: 0.5 });
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 3; c++) add(body, tuft, (r + c) % 2 ? aqua : white, (c - 1) * 0.06, 0.06 + r * 0.09, 0.0);
  // Колбаска пасты в полоску
  const paste = new T.CatmullRomCurve3([0, 1, 2, 3, 4, 5].map((k) => new T.Vector3(Math.sin(k * 1.4) * 0.04, 0.08 + k * 0.08, -0.1 - Math.cos(k) * 0.01)));
  add(body, new T.TubeGeometry(paste, 40, 0.045, 10), plastic("#ffffff", { roughness: 0.35 }));
  add(body, new T.TubeGeometry(paste, 40, 0.047, 10, false), plastic("#4fc3ff", { roughness: 0.35, transparent: true, opacity: 0.55 }));
  // Ручка: шейка, розовый корпус, белые вставки
  const neck = add(body, capsule(0.05, 0.5), plastic("#ff7aa8"), 0, 0.95, 0.15);
  neck.rotation.x = -0.12;
  add(body, capsule(0.1, 1.2), plastic("#ff5f9a"), 0, 1.85, 0.22).rotation.x = -0.06;
  for (const y of [1.55, 1.75, 1.95]) add(body, new T.TorusGeometry(0.1, 0.025, 8, 24), plastic("#ffffff"), 0, y, 0.21).rotation.x = pie / 2;
  return {
    group: g,
    update(t, active) {
      // Чистит: головка ходит взад-вперёд
      body.position.x = active ? Math.sin(t * 28) * 0.05 : 0;
      body.rotation.z = active ? Math.sin(t * 28) * 0.06 : 0;
    },
  };
}
function tweezers() {
  const g = new T.Group();
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new T.Group();
    add(arm, new RoundedBoxGeometry(0.07, 2.0, 0.035, 2, 0.015), metal(), 0, 1.0, 0);
    add(arm, new RoundedBoxGeometry(0.1, 0.55, 0.06, 2, 0.025), plastic(s > 0 ? "#ff7aa8" : "#ff9fc4"), 0, 1.15, 0);
    arm.userData.s = s;
    g.add(arm);
    arms.push(arm);
  }
  add(g, new T.SphereGeometry(0.05, 12, 8), metal(), 0, 2.0, 0);
  return {
    group: g,
    update(t, active) {
      // Сжимаются, когда берут крошку
      const open = active ? 0.012 : 0.085;
      for (const a of arms) a.rotation.z = a.userData.s * open;
    },
  };
}
function floss() {
  const g = new T.Group();
  const prong = capsule(0.035, 0.32);
  for (const s of [-1, 1]) {
    const p = add(g, prong, plastic("#3fd6b4"), s * 0.2, 0.12, 0);
    p.rotation.z = s * 0.35;
  }
  // Ниточка между рожками
  const thread = add(g, new T.CylinderGeometry(0.008, 0.008, 0.48, 6), plastic("#ffffff", { roughness: 0.6 }), 0, 0, 0);
  thread.rotation.z = pie / 2;
  add(g, capsule(0.06, 0.25), plastic("#3fd6b4"), 0, 0.42, 0);
  add(g, capsule(0.085, 1.3), plastic("#7fe8cf"), 0, 1.35, 0.05).rotation.x = -0.05;
  add(g, new T.TorusGeometry(0.085, 0.02, 8, 24), plastic("#ffffff"), 0, 1.05, 0.05).rotation.x = pie / 2;
  return {
    group: g,
    update(t, active) {
      g.rotation.y = active ? Math.sin(t * 22) * 0.15 : 0;
    },
  };
}
function water() {
  const g = new T.Group();
  // Изогнутый носик
  const nozzle = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0, 0.2, 0.05), new T.Vector3(0, 0.45, 0.2), new T.Vector3(0, 0.7, 0.25)]);
  add(g, new T.TubeGeometry(nozzle, 24, 0.03, 8), metal());
  add(g, capsule(0.11, 1.1), plastic("#ffffff"), 0, 1.35, 0.27);
  add(g, new T.CylinderGeometry(0.12, 0.12, 0.1, 20), plastic("#3fa9ff"), 0, 0.85, 0.27);
  const button = add(g, capsule(0.04, 0.12), plastic("#3fa9ff"), 0, 1.3, 0.4);
  button.rotation.x = pie / 2;
  // Прозрачный стакан с водой внутри корпуса
  add(g, new T.CylinderGeometry(0.085, 0.085, 0.7, 20), plastic("#9fe6ff", { transparent: true, opacity: 0.6, roughness: 0.05 }), 0, 1.5, 0.27);
  return {
    group: g,
    update(t, active) {
      button.position.z = active ? 0.37 : 0.4;
    },
  };
}
function drill() {
  const g = new T.Group();
  // Бор крутится
  const bur = new T.Group();
  add(bur, new T.CylinderGeometry(0.018, 0.018, 0.22, 8), metal("#f0f4f8"), 0, 0, -0.11).rotation.x = pie / 2;
  add(bur, new T.SphereGeometry(0.035, 12, 8), metal("#ffd23f"), 0, 0, -0.22);
  bur.position.z = 0.2;
  g.add(bur);
  // Головка и светодиодное колечко
  const head = add(g, new T.CylinderGeometry(0.11, 0.11, 0.16, 20), plastic("#f4f0ff"), 0, 0, 0.3);
  head.rotation.x = pie / 2;
  const led = add(g, new T.TorusGeometry(0.07, 0.015, 8, 24), new T.MeshBasicMaterial({ color: "#bdf6ff" }), 0, 0, 0.21);
  // Изогнутый корпус лилового цвета с белыми колечками
  const neck = add(g, capsule(0.065, 0.55), plastic("#c9b4ff"), 0, 0.38, 0.38);
  neck.rotation.x = -0.35;
  add(g, capsule(0.11, 1.25), plastic("#b39bff"), 0, 1.35, 0.55).rotation.x = -0.12;
  for (const y of [1.0, 1.75]) add(g, new T.TorusGeometry(0.11, 0.022, 8, 24), plastic("#ffffff"), 0, y, 0.52).rotation.x = pie / 2 - 0.12;
  return {
    group: g,
    update(t, active) {
      bur.rotation.z = active ? t * 60 : 0;
      led.material.color.set(active ? "#ffffff" : "#bdf6ff");
      g.position.x = active ? Math.sin(t * 90) * 0.008 : 0;
    },
  };
}
function paste() {
  const g = new T.Group();
  add(g, new T.ConeGeometry(0.06, 0.28, 16), plastic("#e8f8ff"), 0, 0.14, 0).rotation.x = pie;
  add(g, capsule(0.13, 1.1), plastic("#7fd8ff"), 0, 0.95, 0.04);
  add(g, new T.CylinderGeometry(0.14, 0.14, 0.12, 20), plastic("#ffffff"), 0, 0.38, 0.04);
  add(g, new T.CylinderGeometry(0.12, 0.13, 0.22, 20), plastic("#ff7aa8"), 0, 1.65, 0.04);
  // Капелька пасты на кончике
  const blob = add(g, new T.SphereGeometry(0.06, 16, 12), plastic("#bdf0ff", { emissive: "#6fd8ff", emissiveIntensity: 0.4 }), 0, -0.02, 0);
  return {
    group: g,
    update(t, active) {
      blob.scale.setScalar(active ? 1 + Math.sin(t * 12) * 0.25 : 0.6);
    },
  };
}
function lamp() {
  const g = new T.Group();
  // Светящийся кончик и конус света
  const tip = add(g, new T.CylinderGeometry(0.07, 0.07, 0.04, 20), new T.MeshBasicMaterial({ color: "#6fdcff" }), 0, 0, 0.05);
  tip.rotation.x = pie / 2;
  // Конус света продолжает ручку за кончиком — прямо в зуб
  const coneGeo = new T.ConeGeometry(0.3, 0.8, 32, 1, true);
  coneGeo.translate(0, -0.4, 0);
  const beam = add(g, coneGeo, new T.MeshBasicMaterial({ color: "#7fe4ff", transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, 0, 0.05);
  const guide = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0.06), new T.Vector3(0, 0.25, 0.2), new T.Vector3(0, 0.55, 0.3)]);
  add(g, new T.TubeGeometry(guide, 20, 0.06, 12), plastic("#ffb347", { transparent: true, opacity: 0.85, roughness: 0.05 }));
  add(g, capsule(0.13, 1.2), plastic("#8a6bff"), 0, 1.25, 0.32);
  add(g, new T.CylinderGeometry(0.135, 0.135, 0.12, 20), plastic("#ffffff"), 0, 0.68, 0.32);
  const button = add(g, capsule(0.045, 0.14), plastic("#ffd23f"), 0, 1.1, 0.46);
  button.rotation.x = pie / 2;
  return {
    group: g,
    update(t, active) {
      beam.visible = active;
      beam.material.opacity = 0.22 + 0.08 * Math.sin(t * 14);
      tip.material.color.set(active ? "#e8fbff" : "#6fdcff");
    },
  };
}
export function makeTools() {
  return { brush: brush(), tweezers: tweezers(), floss: floss(), water: water(), drill: drill(), paste: paste(), lamp: lamp() };
}

// Картинка из 3D-модели для кнопки: модель в своей сцене, камера по её размерам
// frame — по какой части модели кадрировать (по умолчанию по всей), zoom > 1 — ближе
export function renderIcon(renderer, environment, object, { size = 192, angle = [0.35, -0.5, 0.25], frame = null, zoom = 1 } = {}) {
  const scene = new T.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.8;
  scene.add(new T.HemisphereLight(0xffffff, 0xffe0ea, 1.6));
  const key = new T.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 4, 5);
  scene.add(key);
  const holder = new T.Group();
  holder.add(object);
  holder.rotation.set(...angle);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(frame || holder),
    mid = box.getCenter(new T.Vector3()),
    dim = box.getSize(new T.Vector3());
  const cam = new T.PerspectiveCamera(30, 1, 0.01, 100);
  const reach = ((Math.max(dim.x, dim.y) / 2 / Math.tan((15 * pie) / 180)) * 1.12) / zoom;
  cam.position.set(mid.x, mid.y, mid.z + reach + dim.z);
  cam.lookAt(mid);
  const target = new T.WebGLRenderTarget(size, size, { samples: 4 });
  target.texture.colorSpace = T.SRGBColorSpace;
  const keepTarget = renderer.getRenderTarget(),
    keepAlpha = renderer.getClearAlpha(),
    keepColor = renderer.getClearColor(new T.Color());
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const pixels = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
  renderer.setRenderTarget(keepTarget);
  renderer.setClearColor(keepColor, keepAlpha);
  target.dispose();
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d"),
    img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  ctx.putImageData(img, 0, 0);
  holder.remove(object);
  return c.toDataURL("image/png");
}
