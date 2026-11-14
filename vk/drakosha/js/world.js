// 3D «Почты Дракоши»: уютная волшебная почта. На столе — подставка с плитками-буквами, картинка-подсказка
// в рамке, лист с четырьмя марками, дракончик Дракоша; сзади — почтовый ящик, полки с посылками, окно в закат.
import * as T from "../vendor/three/three.module.min.js?v=2d0cf2e4";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=2d0cf2e4";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=2d0cf2e4";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=2d0cf2e4";
import { polish } from "./gfx.js?v=ea8eb052";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=2d0cf2e4";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=2d0cf2e4";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=2d0cf2e4";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const glowing = (color, k = 2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const TILE_W = 0.86,
  TILE_H = 1.04,
  STEP = 0.98;
const FONT = "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif";
const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
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
const glowSprite = (color, size, opacity = 0.9) => {
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
};
// Лицо плитки: буква или «?»
const faces = new Map();
function tileFace(text, kind) {
  const key = text + kind;
  if (faces.has(key)) return faces.get(key);
  const bg = { hidden: ["#7a5cff", "#5a3fd8"], shown: ["#fffaf0", "#ffe8c8"], hint: ["#fff8a5", "#ffd26c"], lost: ["#ffe0e8", "#ffc4d4"] }[kind];
  const ink = { hidden: "#ffffffcc", shown: "#3a2470", hint: "#664113", lost: "#c8305a" }[kind];
  const tex = canvasTexture(128, 156, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg[0]);
    g.addColorStop(1, bg[1]);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = kind === "hidden" ? "#ffffff44" : "#e8c89a";
    x.lineWidth = 6;
    x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = ink;
    x.font = `900 ${kind === "hidden" ? 84 : 104}px ${FONT}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, w / 2, h / 2 + 6);
  });
  faces.set(key, tex);
  return tex;
}
function stampTexture(i) {
  const colors = ["#ff5f8a", "#ffb02e", "#3fbf7a", "#4f8bff", "#b47cff", "#42bdbb"],
    pics = ["🌸", "⭐", "🍀", "🌙", "💎", "🐚"];
  return canvasTexture(128, 150, (x, w, h) => {
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, w, h);
    // Зубчики по краю
    x.fillStyle = "#00000000";
    x.globalCompositeOperation = "destination-out";
    for (let k = 6; k < w; k += 14) {
      x.beginPath();
      x.arc(k, 0, 5, 0, 7);
      x.arc(k, h, 5, 0, 7);
      x.fill();
    }
    for (let k = 6; k < h; k += 14) {
      x.beginPath();
      x.arc(0, k, 5, 0, 7);
      x.arc(w, k, 5, 0, 7);
      x.fill();
    }
    x.globalCompositeOperation = "source-over";
    x.fillStyle = colors[i];
    x.fillRect(14, 14, w - 28, h - 28);
    x.font = `64px ${EMOJI}`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(pics[i], w / 2, h / 2 - 4);
    x.fillStyle = "#ffffff";
    x.font = `900 22px ${FONT}`;
    x.fillText("ПОЧТА", w / 2, h - 30);
  });
}

// ---------- Дракоша ----------
function dragon() {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  const skin = glossy("#4fd6b0", { roughness: 0.45, clearcoat: 0.5 }),
    belly = matte("#fff3c8"),
    accent = glossy("#ff8fb1", { roughness: 0.4 });
  const torso = new T.Mesh(new T.SphereGeometry(0.42, 24, 18), skin);
  torso.scale.set(1, 1.1, 0.95);
  torso.position.y = 0.45;
  body.add(torso);
  const tummy = new T.Mesh(new T.SphereGeometry(0.3, 20, 14), belly);
  tummy.scale.set(0.9, 1.1, 0.6);
  tummy.position.set(0, 0.42, 0.26);
  body.add(tummy);
  const head = new T.Group();
  head.position.set(0, 1.08, 0.06);
  body.add(head);
  const skull = new T.Mesh(new T.SphereGeometry(0.38, 24, 18), skin);
  skull.scale.set(1.08, 0.95, 1);
  head.add(skull);
  const snout = new T.Mesh(new T.SphereGeometry(0.22, 18, 14), skin);
  snout.scale.set(1.1, 0.8, 0.9);
  snout.position.set(0, -0.1, 0.3);
  head.add(snout);
  const eyes = [];
  for (const s of [-1, 1]) {
    const nost = new T.Mesh(new T.SphereGeometry(0.025, 8, 6), matte("#2a6a5a"));
    nost.position.set(s * 0.07, -0.05, 0.49);
    head.add(nost);
    const white = new T.Mesh(new T.SphereGeometry(0.11, 16, 12), matte("#ffffff"));
    white.position.set(s * 0.16, 0.1, 0.28);
    head.add(white);
    const pupil = new T.Mesh(new T.SphereGeometry(0.065, 12, 10), glossy("#1d1420", { roughness: 0.1 }));
    pupil.position.set(s * 0.16, 0.1, 0.37);
    head.add(pupil);
    const shine = new T.Mesh(new T.SphereGeometry(0.02, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
    shine.position.set(s * 0.16 + 0.025, 0.13, 0.43);
    head.add(shine);
    eyes.push(white, pupil, shine);
    const cheek = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), matte("#ff9fb8"));
    cheek.scale.set(1, 0.6, 0.4);
    cheek.position.set(s * 0.27, -0.06, 0.28);
    head.add(cheek);
    const horn = new T.Mesh(new T.ConeGeometry(0.07, 0.22, 10), matte("#fff3c8"));
    horn.position.set(s * 0.18, 0.36, -0.06);
    horn.rotation.z = -s * 0.3;
    head.add(horn);
    const ear = new T.Mesh(new T.ConeGeometry(0.08, 0.2, 3), accent);
    ear.position.set(s * 0.34, 0.16, -0.05);
    ear.rotation.z = -s * 1.1;
    head.add(ear);
    (head.userData.ears ||= []).push(ear);
    // Крылышки
    const wingShape = new T.Shape();
    wingShape.moveTo(0, 0);
    wingShape.quadraticCurveTo(0.25, 0.35, 0.5, 0.3);
    wingShape.quadraticCurveTo(0.38, 0.15, 0.45, 0.02);
    wingShape.quadraticCurveTo(0.3, 0.08, 0.25, -0.08);
    wingShape.quadraticCurveTo(0.15, 0.02, 0, 0);
    const wing = new T.Mesh(new T.ExtrudeGeometry(wingShape, { depth: 0.03, bevelEnabled: false }), accent);
    wing.position.set(s * 0.22, 0.65, -0.3);
    wing.scale.set(s * 1, 1, 1);
    wing.rotation.y = s * 0.6;
    body.add(wing);
    wing.userData.s = s;
    const foot = new T.Mesh(new T.SphereGeometry(0.12, 12, 10), skin);
    foot.scale.set(1, 0.6, 1.3);
    foot.position.set(s * 0.2, 0.06, 0.18);
    body.add(foot);
  }
  // Гребешок на спине и хвост
  for (let k = 0; k < 4; k++) {
    const spike = new T.Mesh(new T.ConeGeometry(0.06, 0.14, 8), accent);
    spike.position.set(0, 0.85 - k * 0.18, -0.36 + k * 0.02);
    spike.rotation.x = -0.6;
    body.add(spike);
  }
  const tail = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.2, -0.35), new T.Vector3(0.2, 0.1, -0.6), new T.Vector3(0.45, 0.18, -0.55), new T.Vector3(0.55, 0.32, -0.35)]), 20, 0.07, 8), skin);
  body.add(tail);
  const tip = new T.Mesh(new T.ConeGeometry(0.1, 0.18, 4), accent);
  tip.position.set(0.58, 0.4, -0.3);
  tip.rotation.z = -0.5;
  body.add(tip);
  // Почтальонская сумка через плечо
  const bag = new T.Mesh(new RoundedBoxGeometry(0.32, 0.24, 0.12, 2, 0.04), glossy("#4f6bff"));
  bag.position.set(-0.32, 0.38, 0.22);
  bag.rotation.y = 0.4;
  body.add(bag);
  const strap = new T.Mesh(new T.TorusGeometry(0.42, 0.025, 6, 30, pie * 0.9), glossy("#4f6bff"));
  strap.position.set(-0.05, 0.6, 0.05);
  strap.rotation.set(0.2, 0.3, 2.2);
  body.add(strap);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return { group: g, body, head, eyes, tail, ears: head.userData.ears, wings: body.children.filter((o) => o.userData.s) };
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.camera = new T.PerspectiveCamera(36, 1, 0.1, 200);
    this.scene.add(new T.HemisphereLight(0xfff0e0, 0x8a5a7a, 1.15));
    const key = new T.DirectionalLight(0xffe8c8, 2.0);
    key.position.set(4, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    key.shadow.bias = -0.001;
    this.scene.add(key);
    const lamp = new T.PointLight(0xffc27a, 14, 12, 1.6);
    lamp.position.set(-3, 5, 2);
    this.scene.add(lamp);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.45, 0.4, 1.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
    this.build();
    this.tiles = [];
    this.ray = new T.Raycaster();
    this.pointer = new T.Vector2();
    this.resize = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
      this.fit();
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    this.onFrame = null;
    this.last = 0;
    this.renderer.setAnimationLoop((ms) => this.frame(ms));
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.time, dur: this.motion.matches ? seconds * 0.5 : seconds, update, done }));
  }
  // ---------- Почта ----------
  build() {
    const S = this.scene;
    // Задняя стена в полоску, пол, окно с закатом
    const wall = new T.Mesh(
      new T.PlaneGeometry(40, 16),
      new T.MeshStandardMaterial({
        roughness: 0.9,
        map: canvasTexture(256, 64, (x) => {
          for (let i = 0; i < 16; i++) {
            x.fillStyle = i % 2 ? "#ffd8c2" : "#ffc8b0";
            x.fillRect(i * 16, 0, 16, 64);
          }
          x.fillStyle = "#ffffff55";
          for (let i = 0; i < 16; i++) {
            x.beginPath();
            x.arc(i * 16 + 8, 32, 3, 0, 7);
            x.fill();
          }
        }),
      }),
    );
    wall.material.map.wrapS = T.RepeatWrapping;
    wall.material.map.repeat.set(4, 1);
    wall.position.set(0, 5, -5);
    S.add(wall);
    const skirting = new T.Mesh(new T.BoxGeometry(40, 1.4, 0.2), matte("#c86a5a"));
    skirting.position.set(0, -0.7, -4.9);
    S.add(skirting);
    const floor = new T.Mesh(new T.PlaneGeometry(40, 20), matte("#8a5a4a"));
    floor.rotation.x = -pie / 2;
    floor.position.set(0, -1.4, 4);
    S.add(floor);
    // Круглое окно с закатом и облаками
    const win = new T.Group();
    const sky = new T.Mesh(
      new T.CircleGeometry(1.6, 48),
      new T.MeshBasicMaterial({
        toneMapped: false,
        map: canvasTexture(128, 128, (x) => {
          const g = x.createLinearGradient(0, 0, 0, 128);
          g.addColorStop(0, "#7a6bff");
          g.addColorStop(0.55, "#ff9fd0");
          g.addColorStop(1, "#ffd27a");
          x.fillStyle = g;
          x.fillRect(0, 0, 128, 128);
          x.fillStyle = "#ffffffcc";
          for (const [cx, cy, r] of [[30, 70, 14], [46, 66, 18], [64, 72, 12], [92, 52, 10], [104, 50, 13]]) {
            x.beginPath();
            x.arc(cx, cy, r, 0, 7);
            x.fill();
          }
          x.fillStyle = "#fff3b0";
          x.beginPath();
          x.arc(84, 98, 16, 0, 7);
          x.fill();
        }),
      }),
    );
    win.add(sky);
    const frame = new T.Mesh(new T.TorusGeometry(1.6, 0.16, 12, 48), glossy("#ffffff"));
    win.add(frame);
    for (const r of [0, pie / 2]) {
      const bar = new T.Mesh(new T.BoxGeometry(3.2, 0.08, 0.06), glossy("#ffffff"));
      bar.rotation.z = r;
      win.add(bar);
    }
    win.position.set(-5.6, 4.6, -4.9);
    S.add(win);
    // Полки с посылками
    const parcelCols = ["#ff8f5f", "#4f8bff", "#3fbf7a", "#ffd25f", "#b47cff", "#ff5f8a"];
    for (const [sx, sy] of [[5.4, 2.4], [5.4, 4.4], [-8.6, 1.6]]) {
      const shelf = new T.Mesh(new RoundedBoxGeometry(3.4, 0.14, 0.9, 2, 0.04), matte("#a8743f"));
      shelf.position.set(sx, sy, -4.5);
      shelf.castShadow = shelf.receiveShadow = true;
      S.add(shelf);
      let x = sx - 1.4;
      for (let k = 0; k < 4; k++) {
        const w = 0.5 + ((k * 7 + sy * 3) % 3) * 0.15,
          h = 0.4 + ((k * 5 + sx) % 3) * 0.15;
        const box = new T.Mesh(new RoundedBoxGeometry(w, h, 0.6, 2, 0.05), glossy(parcelCols[(k + Math.round(sy)) % 6], { roughness: 0.6 }));
        box.position.set(x + w / 2, sy + 0.07 + h / 2, -4.4);
        box.rotation.y = (k % 2 ? 1 : -1) * 0.12;
        box.castShadow = true;
        S.add(box);
        const ribbon = new T.Mesh(new T.BoxGeometry(0.06, h + 0.01, 0.61), matte("#ffffff"));
        ribbon.position.copy(box.position);
        ribbon.rotation.copy(box.rotation);
        S.add(ribbon);
        x += w + 0.12;
      }
    }
    // Гирлянда из конвертиков
    const env = canvasTexture(64, 44, (x) => {
      x.fillStyle = "#fffaf0";
      x.fillRect(0, 0, 64, 44);
      x.strokeStyle = "#e8b88a";
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(2, 2);
      x.lineTo(32, 24);
      x.lineTo(62, 2);
      x.stroke();
      x.fillStyle = "#ff5f8a";
      x.beginPath();
      x.arc(32, 26, 5, 0, 7);
      x.fill();
    });
    this.bunting = [];
    for (let k = 0; k < 15; k++) {
      const u = k / 14,
        x = -9 + u * 18,
        y = 7.3 - Math.sin(u * pie) * 0.9;
      const e = new T.Mesh(new T.PlaneGeometry(0.6, 0.42), new T.MeshStandardMaterial({ map: env, side: T.DoubleSide, roughness: 0.8 }));
      e.position.set(x, y, -4.3);
      e.rotation.z = (k % 2 ? 1 : -1) * 0.12;
      S.add(e);
      this.bunting.push(e);
    }
    // Почтовый ящик — сюда улетают письма
    const box = new T.Group();
    const body = new T.Mesh(new RoundedBoxGeometry(1.3, 1.7, 1.0, 3, 0.2), glossy("#4f6bff"));
    body.position.y = 0.85;
    box.add(body);
    const top = new T.Mesh(new T.CylinderGeometry(0.65, 0.65, 1.0, 32, 1, false, 0, pie), glossy("#4f6bff"));
    top.rotation.set(pie / 2, 0, pie / 2);
    top.position.y = 1.7;
    box.add(top);
    const slot = new T.Mesh(new RoundedBoxGeometry(0.8, 0.12, 0.1, 2, 0.04), matte("#1a2460"));
    slot.position.set(0, 1.45, 0.5);
    box.add(slot);
    const badge = new T.Mesh(
      new T.CircleGeometry(0.3, 32),
      new T.MeshBasicMaterial({
        map: canvasTexture(64, 64, (x) => {
          x.fillStyle = "#ffd25f";
          x.beginPath();
          x.arc(32, 32, 30, 0, 7);
          x.fill();
          x.font = `40px ${EMOJI}`;
          x.textAlign = "center";
          x.textBaseline = "middle";
          x.fillText("✉️", 32, 34);
        }),
      }),
    );
    badge.position.set(0, 0.8, 0.51);
    box.add(badge);
    const leg = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 1.4, 12), matte("#3a3a5a"));
    leg.position.y = -0.7;
    box.add(leg);
    const flag = new T.Group();
    flag.position.set(0.7, 1.2, 0.1);
    const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.7, 8), matte("#ffffff"));
    pole.position.y = 0.35;
    flag.add(pole);
    const cloth = new T.Mesh(new RoundedBoxGeometry(0.34, 0.22, 0.04, 2, 0.02), glossy("#ff4f6d"));
    cloth.position.set(0.17, 0.6, 0);
    flag.add(cloth);
    flag.rotation.z = -pie / 2;
    box.add(flag);
    box.traverse((o) => o.isMesh && (o.castShadow = true));
    box.position.set(-5.2, 0.4, -2.6);
    box.rotation.y = 0.35;
    S.add(box);
    this.mailbox = { group: box, flag, slot };
    // Стол
    const desk = new T.Mesh(new RoundedBoxGeometry(16, 0.5, 4.4, 3, 0.15), glossy("#c98b55", { roughness: 0.55, clearcoat: 0.3 }));
    desk.position.set(0, -0.35, 0);
    desk.receiveShadow = true;
    S.add(desk);
    const front = new T.Mesh(new T.BoxGeometry(16, 1.3, 0.2), matte("#a8743f"));
    front.position.set(0, -1.15, 2.1);
    S.add(front);
    // Подставка для плиток
    this.stand = new T.Mesh(new RoundedBoxGeometry(10, 0.22, 0.7, 2, 0.08), glossy("#8a5a3a", { roughness: 0.5 }));
    this.stand.receiveShadow = true;
    S.add(this.stand);
    // Картинка в рамке на мольберте
    const pic = new T.Group();
    const easel = matte("#a8743f");
    for (const s of [-1, 1]) {
      const legE = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 3.2, 8), easel);
      legE.position.set(s * 0.8, 1.2, -0.3);
      legE.rotation.z = s * 0.12;
      pic.add(legE);
    }
    const back = new T.Mesh(new RoundedBoxGeometry(2.3, 2.3, 0.14, 3, 0.1), glossy("#ffd25f", { metalness: 0.3, roughness: 0.3 }));
    back.position.set(0, 2.2, -0.15);
    pic.add(back);
    this.picMat = new T.MeshBasicMaterial({ color: "#ffffff" });
    this.picPlane = new T.Mesh(new T.PlaneGeometry(1.95, 1.95), this.picMat);
    this.picPlane.position.set(0, 2.2, -0.07);
    pic.add(this.picPlane);
    pic.traverse((o) => o.isMesh && o !== this.picPlane && (o.castShadow = true));
    pic.position.set(0, 0, -1.6);
    S.add(pic);
    this.picture = pic;
    this.picGlow = glowSprite("#fff3a0", 4, 0);
    this.picGlow.position.set(0, 2.2, -1.9);
    S.add(this.picGlow);
    // Лист с марками
    const sheet = new T.Mesh(new RoundedBoxGeometry(1.7, 2.0, 0.06, 2, 0.04), matte("#fffaf0"));
    sheet.position.set(-3.1, 1.2, -1.2);
    sheet.rotation.set(-0.15, 0.25, 0.04);
    sheet.castShadow = true;
    S.add(sheet);
    this.sheet = sheet;
    this.stamps = Array.from({ length: 6 }, (_, i) => {
      const m = new T.Mesh(new T.PlaneGeometry(0.62, 0.72), new T.MeshStandardMaterial({ map: stampTexture(i), transparent: true, roughness: 0.6 }));
      m.position.set((i % 2 ? 0.38 : -0.38), 0.56 - Math.floor(i / 2) * 0.55, 0.04);
      m.scale.setScalar(0.72);
      sheet.add(m);
      const ghost = new T.Mesh(new T.PlaneGeometry(0.62, 0.72), new T.MeshBasicMaterial({ color: "#e8d8c8", transparent: true, opacity: 0.6 }));
      ghost.position.copy(m.position);
      ghost.scale.copy(m.scale);
      ghost.position.z = 0.035;
      sheet.add(ghost);
      return { mesh: m, ghost, home: m.position.clone(), used: false, motion: 0 };
    });
    // Дракоша
    this.dragon = dragon();
    this.dragon.group.position.set(3.1, 0, -0.9);
    this.dragon.group.rotation.y = -0.45;
    this.dragon.group.scale.setScalar(1.35);
    S.add(this.dragon.group);
    this.mood = { happy: 0, sad: 0, blink: 0 };
    // Пламя Дракоши и частицы
    this.makeParticles();
  }
  // Камера: стол, плитки, картинка и Дракоша в кадре при любой форме экрана.
  // Отодвигаемся, пока в кадр не войдут все важные точки: края плиток, верх картинки, Дракоша
  fit(aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)) {
    const cam = this.camera;
    // На вертикальном экране главное — плитки и картинка; ящик и Дракоша могут уйти за край
    const tall = aspect < 0.85;
    const half = Math.max(tall ? 2.2 : 4.3, ((this.cols || 6) * STEP) / 2 + (tall ? 0.15 : 0.5)),
      up = this.lift || 0;
    const low = -0.05;
    const pts = [
      [-half, low, 1.6],
      [half, low, 1.6],
      [-half, 1.2 + up, 1.2],
      [half, 1.2 + up, 1.2],
      [0, 3.55 + up, -1.75],
      [-1.1, 3.4 + up, -1.75],
      [1.1, 3.4 + up, -1.75],
      ...(tall ? [] : [
        [3.9, 2.1, -0.9],
        [3.9, -0.1, -0.9],
        [-4.0, 2.1, -1.2],
      ]),
    ].map((p) => new T.Vector3(...p));
    cam.fov = 36;
    cam.aspect = aspect;
    cam.clearViewOffset();
    const cy = (3.4 + up + low) / 2;
    let dist = 6;
    for (let k = 0; k < 60; k++) {
      cam.position.set(0, cy + dist * 0.24, dist + 0.6);
      cam.lookAt(0, cy, 0);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const fits = pts.every((p) => {
        const v = p.clone().project(cam);
        return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.93;
      });
      if (fits) break;
      dist *= 1.06;
    }
  }
  // ---------- Слово ----------
  setCard(card, round) {
    const revision = this.cardRevision = (this.cardRevision || 0) + 1;
    for (const t of this.tiles) {
      t.mesh.removeFromParent();
      t.mesh.geometry.dispose();
      for (const material of new Set(t.mesh.material)) material.dispose();
    }
    this.tiles = [];
    const words = card.word.split(" ");
    this.rows = words.length;
    this.cols = Math.max(...words.map((w) => w.length));
    // Подставка на краю стола; второй ряд плиток — выше, картинка и Дракоша поднимаются над ним
    this.stand.scale.x = (this.cols * STEP + 0.6) / 10;
    this.stand.position.set(0, -0.02, 1.25);
    this.lift = (this.rows - 1) * 1.22;
    this.picture.position.y = this.lift;
    this.picGlow.position.y = 2.2 + this.lift;
    let i = 0;
    words.forEach((w, row) => {
      [...w].forEach((ch, k) => {
        const geo = new RoundedBoxGeometry(TILE_W, TILE_H, 0.16, 3, 0.07);
        const side = glossy("#ffd8a8", { roughness: 0.4 });
        const front = new T.MeshStandardMaterial({ map: tileFace(ch, "shown"), roughness: 0.45 });
        const back = new T.MeshStandardMaterial({ map: tileFace("?", "hidden"), roughness: 0.45 });
        const mesh = new T.Mesh(geo, [side, side, side, side, front, back]);
        const x = (k - (w.length - 1) / 2) * STEP;
        const y = 0.62 + (words.length - 1 - row) * 1.22;
        mesh.position.set(x, y, 1.2);
        mesh.rotation.y = pie;
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.tiles.push({ mesh, ch, index: i, open: false, front });
        i++;
      });
      i++; // пробел между словами — в индексах слова
    });
    // Плитки появляются по очереди
    this.tiles.forEach((t, k) => {
      const y = t.mesh.position.y;
      t.mesh.scale.setScalar(0.001);
      setTimeout(() => {
        if (revision !== this.cardRevision) return;
        this.tween(0.35, (p) => {
          t.mesh.scale.setScalar(Math.max(0.001, p < 0.7 ? (p / 0.7) * 1.15 : 1.15 - ((p - 0.7) / 0.3) * 0.15));
          t.mesh.position.y = y + (1 - p) * 0.6;
        });
      }, k * 60);
    });
    // Картинка
    this.picMat.map?.dispose();
    this.picMat.map = canvasTexture(256, 256, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#ffe8f0");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.font = `170px ${EMOJI}`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(card.pic, w / 2, h / 2 + 12);
    });
    this.picMat.needsUpdate = true;
    // Нарисованная картинка карточки (art/<asset>.webp); пока грузится — эмодзи
    if (card.asset) {
      const want = card.asset;
      new T.TextureLoader().load("./art/" + want + ".webp", (tex) => {
        if (this.cardRevision !== revision) return tex.dispose();
        this.picMat.map?.dispose();
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = 4;
        this.picMat.map = tex;
        this.picMat.needsUpdate = true;
      });
    }
    this.picGlow.material.opacity = 0;
    this.picture.scale.setScalar(1);
    this.stamps.forEach((s, i) => {
      s.motion++;
      s.used = false;
      s.mesh.visible = s.ghost.visible = i < round.maxStamps;
      s.mesh.position.copy(s.home);
      s.mesh.rotation.set(0, 0, 0);
      s.mesh.material.opacity = 1;
    });
    this.mailbox.flag.rotation.z = -pie / 2;
    this.fit();
  }
  // Индекс буквы в слове (с пробелами) → плитка
  tileAt(i) {
    return this.tiles.find((t) => t.index === i);
  }
  reveal(indices, kind = "shown") {
    const revision = this.cardRevision;
    indices.forEach((i, k) => {
      const t = this.tileAt(i);
      if (!t || t.open) return;
      t.open = true;
      this.lookAtX = t.mesh.getWorldPosition(new T.Vector3()).x;
      this.lookT = this.time;
      if (kind !== "shown") t.front.map = tileFace(t.ch, kind);
      setTimeout(() => {
        if (revision !== this.cardRevision) return;
        const y = t.mesh.position.y;
        this.tween(0.45, (p) => {
          t.mesh.rotation.y = pie * (1 - p);
          t.mesh.position.y = y + Math.sin(p * pie) * 0.35;
        });
        if (kind === "hint") this.tween(0.85, (p) => {
          if (p === 1 && revision === this.cardRevision) t.front.map = tileFace(t.ch, "shown");
        });
        if (kind !== "lost") this.burst(t.mesh.position.clone().add(new T.Vector3(0, 0.3, 0.3)), 14, ["#ffe066", "#ff9fd0", "#ffffff"], 2.6);
      }, k * 120);
    });
  }
  // Неверная буква: марка отклеивается и улетает
  loseStamp(n) {
    const s = this.stamps[n];
    if (!s || s.used) return;
    s.used = true;
    const motion = ++s.motion;
    const m = s.mesh,
      from = m.position.clone();
    this.tween(0.9, (p) => {
      if (motion !== s.motion) return;
      m.position.set(from.x + p * 1.4, from.y + Math.sin(p * pie) * 1.2 + p * 0.6, from.z + p * 0.8);
      m.rotation.set(p * 1.5, p * 3, p * 4);
      m.material.opacity = 1 - Math.max(0, p - 0.5) * 2;
    }).then(() => { if (motion === s.motion) m.visible = false; });
    this.mood.sad = 1;
  }
  restoreStamp(index) {
    const stamp = this.stamps[index];
    stamp.motion++;
    stamp.used = false;
    stamp.mesh.visible = true;
    stamp.mesh.position.copy(stamp.home);
    stamp.mesh.rotation.set(0, 0, 0);
    stamp.mesh.material.opacity = 1;
    this.burst(stamp.mesh.getWorldPosition(new T.Vector3()), 12, ["#ffe066", "#ffffff"], 2);
  }
  targetAt(x, y) {
    const box = this.canvas.getBoundingClientRect();
    this.pointer.set((x - box.left) / box.width * 2 - 1, 1 - (y - box.top) / box.height * 2);
    this.ray.setFromCamera(this.pointer, this.camera);
    if (this.ray.intersectObject(this.dragon.group).length) return "dragon";
    if (this.ray.intersectObject(this.picPlane).length) return "picture";
    return null;
  }
  happy() {
    this.mood.happy = 1;
  }
  // Победа: Дракоша дышит разноцветным огоньком, плитки сияют, письмо летит в ящик
  async won() {
    const revision = this.cardRevision;
    this.mood.happy = 1;
    this.flame(1.4);
    this.tiles.forEach((t, k) =>
      setTimeout(() => {
        if (revision !== this.cardRevision) return;
        const y = t.mesh.position.y;
        this.tween(0.4, (p) => (t.mesh.position.y = y + Math.sin(p * pie) * 0.5));
      }, k * 70),
    );
    await new Promise((r) => setTimeout(r, 900));
    if (revision !== this.cardRevision) return;
    // Конверт вылетает из-за плиток и летит в почтовый ящик
    const env = new T.Group();
    const paper = new T.Mesh(new RoundedBoxGeometry(1.2, 0.8, 0.06, 2, 0.03), matte("#fffaf0"));
    env.add(paper);
    const flap = new T.Mesh(new T.ConeGeometry(0.62, 0.42, 3), matte("#ffe8c8"));
    flap.rotation.set(pie / 2, 0, pie);
    flap.scale.set(1, 1, 0.05);
    flap.position.set(0, 0.12, 0.04);
    env.add(flap);
    const seal = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.05, 20), glossy("#ff3f6d"));
    seal.rotation.x = pie / 2;
    seal.position.set(0, -0.02, 0.07);
    env.add(seal);
    env.position.set(0, 0.4, 1.4);
    this.scene.add(env);
    const slot = new T.Vector3();
    this.mailbox.slot.getWorldPosition(slot);
    const from = env.position.clone(),
      mid = from.clone().lerp(slot, 0.5).add(new T.Vector3(0, 2.4, 0.5));
    await this.tween(1.0, (p) => {
      const a = from.clone().lerp(mid, p),
        b = mid.clone().lerp(slot, p);
      env.position.copy(a.lerp(b, p));
      env.rotation.set(0, p * pie * 2 + 0.35, Math.sin(p * pie) * 0.4);
      env.scale.setScalar(1 - p * 0.55);
    });
    env.removeFromParent();
    env.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    if (revision !== this.cardRevision) return;
    this.burst(slot, 30, ["#ffe066", "#ff9fd0", "#7fe8ff", "#ffffff"], 3.2);
    const f = this.mailbox.flag;
    this.tween(0.5, (p) => { if (revision === this.cardRevision) f.rotation.z = -pie / 2 + p * (pie / 2); });
    // Картинка сияет
    this.tween(0.6, (p) => {
      if (revision !== this.cardRevision) return;
      this.picGlow.material.opacity = p * 0.7;
      this.picture.scale.setScalar(1 + Math.sin(p * pie) * 0.12);
    });
  }
  lost(indices) {
    this.reveal(indices, "lost");
    this.mood.sad = 1;
  }
  // ---------- Огонёк и искры ----------
  makeParticles() {
    const n = 500;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.06, 0), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1, g: 3 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    this.scene.add(this.sparks);
    this.dummy = new T.Object3D();
  }
  burst(at, count, colors, speed, gravity = 3) {
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, new T.Color(colors[k % colors.length]));
      this.next = (this.next + 1) % this.pool.length;
      s.p.copy(at);
      s.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.5 + Math.random() * 0.6;
      s.s = 0.7 + Math.random();
      s.g = gravity;
    }
    this.sparks.instanceColor.needsUpdate = true;
  }
  // Радужный огонёк изо рта Дракоши в сторону плиток
  flame(seconds) {
    this.flaming = seconds;
  }
  // ---------- Кадр ----------
  frame(ms) {
    if (document.hidden) return;
    const dt = this.last ? clamp((ms - this.last) / 1000, 0, 0.1) : 0;
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
    // Дракоша: дышит, моргает, радуется прыжком, грустит — опускает голову
    const D = this.dragon,
      m = this.mood;
    m.happy *= Math.pow(0.15, dt);
    m.sad *= Math.pow(0.3, dt);
    D.body.position.y = Math.abs(Math.sin(t * 10)) * 0.35 * m.happy + Math.sin(t * 2) * 0.02 * calm;
    D.head.rotation.x = m.sad * 0.35 + Math.sin(t * 1.4) * 0.04 * calm;
    D.head.rotation.z = Math.sin(t * 0.9) * 0.08 * calm - m.sad * 0.2;
    for (const w of D.wings) w.rotation.z = w.userData.s * (0.2 + Math.sin(t * (m.happy > 0.1 ? 22 : 3)) * (0.15 + m.happy * 0.5));
    // Хвост виляет (от радости — быстро), ушки подрагивают, голова поворачивается к открытой букве
    D.tail.rotation.y = Math.sin(t * (m.happy > 0.1 ? 14 : 2.2)) * (0.12 + m.happy * 0.3) * calm;
    D.ears.forEach((e, i) => {
      const k = (t * 0.6 + i * 0.45) % 2.9;
      e.rotation.x = k < 0.25 ? Math.sin((k / 0.25) * pie * 2) * 0.3 * calm : 0;
    });
    const looking = clamp(1 - (t - (this.lookT ?? -9)) / 1.4, 0, 1);
    const yaw = looking > 0 ? clamp((this.lookAtX - D.group.position.x) * 0.18, -0.6, 0.6) * Math.min(1, looking * 3) : 0;
    this.headYaw = (this.headYaw || 0) + (yaw - (this.headYaw || 0)) * Math.min(1, dt * 7);
    D.head.rotation.y = this.headYaw * calm;
    // Раз в несколько секунд из носа вылетает колечко дыма
    this.smokeNext ??= t + 3;
    if (calm === 1 && t > this.smokeNext && !(this.flaming > 0)) {
      this.smokeNext = t + 4 + Math.random() * 4;
      const nose = D.head.localToWorld(new T.Vector3(0, 0.02, 0.55));
      for (let k = 0; k < 5; k++) {
        const sp = this.pool[this.next];
        this.sparks.setColorAt(this.next, new T.Color(k % 2 ? "#ffffff" : "#d9d4e6"));
        this.next = (this.next + 1) % this.pool.length;
        sp.p.copy(nose);
        sp.v.set((Math.random() - 0.5) * 0.25, 0.25 + Math.random() * 0.2, 0.35 + Math.random() * 0.2);
        sp.max = sp.life = 0.9 + Math.random() * 0.4;
        sp.s = 1.1;
        sp.g = -0.6;
      }
      this.sparks.instanceColor.needsUpdate = true;
    }
    // Пылинки в закатном свете из окна
    if (!this.motes) {
      const n = 40,
        pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 12, 0.5 + Math.random() * 5, -4 + Math.random() * 6], i * 3);
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      this.motes = new T.Points(geo, new T.PointsMaterial({ color: "#ffd9a0", size: 0.06, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending }));
      this.motes.userData.base = pos.slice();
      this.scene.add(this.motes);
    }
    {
      const mp = this.motes.geometry.attributes.position,
        base = this.motes.userData.base;
      for (let i = 0; i < mp.count; i++) {
        mp.setX(i, base[i * 3] + Math.sin(t * 0.2 + i) * 0.4 * calm);
        mp.setY(i, 0.5 + ((base[i * 3 + 1] + t * (0.04 + (i % 5) * 0.012) * calm) % 5));
      }
      mp.needsUpdate = true;
    }
    const blink = (t % 3.7) > 3.58;
    for (const e of D.eyes) e.scale.y = blink ? 0.15 : 1;
    if (this.flaming > 0) {
      this.flaming -= dt;
      const mouth = new T.Vector3(0, -0.1, 0.55);
      D.head.localToWorld(mouth);
      const dir = new T.Vector3(-1, -0.25, 0.9).normalize();
      for (let k = 0; k < 4; k++) {
        const s = this.pool[this.next];
        this.sparks.setColorAt(this.next, new T.Color(["#ffd25f", "#ff8f3f", "#ff5f8a", "#b47cff"][k]));
        this.next = (this.next + 1) % this.pool.length;
        s.p.copy(mouth);
        s.v.copy(dir).multiplyScalar(3 + Math.random() * 2).add(new T.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
        s.max = s.life = 0.45 + Math.random() * 0.25;
        s.s = 1.4;
        s.g = -0.5;
      }
      this.sparks.instanceColor.needsUpdate = true;
    }
    this.bunting.forEach((b, i) => (b.rotation.z = (i % 2 ? 1 : -1) * 0.12 + Math.sin(t * 1.3 + i) * 0.06 * calm));
    if (this.picGlow.material.opacity > 0) this.picGlow.material.opacity = 0.5 + Math.sin(t * 3) * 0.15;
    const d = this.dummy;
    this.pool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= s.g * dt;
        s.p.addScaledVector(s.v, dt);
      }
      d.position.copy(s.p);
      d.rotation.set(s.life * 7, s.life * 5, 0);
      d.scale.setScalar(Math.max(0, s.life / s.max) * s.s);
      d.updateMatrix();
      this.sparks.setMatrixAt(i, d.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.glow.on) {
      this.composer.render();
      if (dt) {
        this.glow.seen += dt;
        if (dt > 1 / 36) this.glow.slow += dt;
        if (this.glow.seen > 5) {
          if (this.glow.slow > 1.8) this.glow.on = false;
          this.glow.seen = this.glow.slow = 0;
        }
      }
    } else this.renderer.render(this.scene, this.camera);
  }
  snapshot(w = 1600, h = 1000) {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.fit(w / h);
    this.composer.render();
    const url = this.renderer.domElement.toDataURL("image/jpeg", 0.9);
    this.resize();
    return url;
  }
}
