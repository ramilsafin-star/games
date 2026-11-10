// 3D «Дворового кубка»: двор с полем, ворота с сеткой, забор, домики, зрители-зверята, гирлянда флажков,
// футболисты с большими головами, мяч, следы и искры. Игра идёт в плоскости z = 0, вид сбоку.
import * as T from "../vendor/three/three.module.min.js?v=aa442635";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=aa442635";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=aa442635";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=aa442635";
import { polish } from "./gfx.js?v=aa442635";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=aa442635";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=aa442635";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=aa442635";
import { FIELD, BALL_R } from "./match.js?v=aa442635";

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
};
function footballer(kind, number) {
  const A = ANIMALS[kind];
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  const fur = matte(A.fur, { roughness: 0.75 }),
    light = matte(A.belly),
    dark = matte(A.inner);
  // Тело в футболке с номером
  const shirtTex = canvasTexture(128, 64, (x) => {
    x.fillStyle = A.shirt;
    x.fillRect(0, 0, 128, 64);
    x.fillStyle = "#ffffff";
    x.fillRect(0, 26, 128, 6);
    x.font = "900 34px system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(String(number), 96, 36);
    x.fillText(String(number), 32, 36);
  });
  const torso = new T.Mesh(new T.SphereGeometry(0.46, 24, 18), new T.MeshStandardMaterial({ map: shirtTex, roughness: 0.6 }));
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
  head.add(nose);
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
      const seg = new T.Mesh(new T.SphereGeometry(0.15 + Math.sin((k / n) * pie) * 0.06, 12, 10), A.tail === "ring" && k % 2 ? dark : k === n - 1 && A.tail === "fox" ? light : fur);
      seg.position.set(-k * 0.14, k * 0.1, 0);
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

// ---------- Мяч ----------
function ballTexture() {
  return canvasTexture(256, 128, (x, w, h) => {
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
    this.scene.fog = new T.Fog(0xcfeeff, 60, 160);
    this.camera = new T.PerspectiveCamera(32, 1, 0.1, 400);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x88c870, 1.15));
    const sun = new T.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(-8, 16, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -6, near: 1, far: 50 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.4, 1.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
    this.shakeAmp = 0;
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
    this.resize();
    this.onFrame = null;
    this.last = 0;
    this.renderer.setAnimationLoop((ms) => this.frame(ms));
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
        vertexShader: "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `varying vec3 p; void main(){ float h = p.y;
          vec3 c = mix(vec3(1.0,0.86,0.78), vec3(0.55,0.82,1.0), smoothstep(-0.05, 0.25, h));
          c = mix(c, vec3(0.3,0.6,1.0), smoothstep(0.25, 0.8, h)); gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    S.add(sky);
    const sunDisc = new T.Mesh(new T.CircleGeometry(6, 40), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.5, 1.1), fog: false, toneMapped: false }));
    sunDisc.position.set(-60, 55, -150);
    S.add(sunDisc);
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
    this.players = [];
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
  setPlayers(kinds) {
    for (const p of this.players) p.group.removeFromParent();
    this.players = kinds.map((k, i) => {
      const f = footballer(k, i ? 7 : 10);
      f.group.scale.setScalar(1.25);
      this.scene.add(f.group);
      return { ...f, swing: 0, stunned: 0, celebrate: 0 };
    });
  }
  // ---------- События ----------
  kick(side, kind) {
    const p = this.players[side];
    if (p) p.swing = 1;
    const b = this.ballMesh.position;
    this.burst(b, kind === "star" ? 40 : 10, kind === "star" ? ["#ffe066", "#ff8fd0", "#7fe8ff", "#ffffff"] : ["#ffffff", "#fff3a0"], kind === "star" ? 5 : 2.5);
    if (kind === "star") this.shake(0.25);
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
    this.burst(at, 50, ["#ffe066", "#ff4f6d", "#3fb4ff", "#3fdc7a", "#ffffff"], 6);
    this.shake(star ? 0.45 : 0.3);
    const p = this.players[side];
    if (p) p.celebrate = 2.2;
    for (const f of this.fans) f.cheer = 2.5;
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
    const n = 600;
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
    for (let k = 0; k < 120; k++) {
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
    });
    const b = m.ball;
    this.ballMesh.position.set(b.x, b.y, 0);
    this.ballMesh.rotation.z -= b.spin * dt * 0.5;
    this.ballShadow.position.set(b.x, 0.016, 0);
    this.ballShadow.scale.setScalar(Math.max(0.3, 1 - b.y * 0.1));
    this.ballGlow.position.copy(this.ballMesh.position);
    this.ballGlow.material.opacity = b.star > 0 ? 0.9 : 0;
    // След звёздного мяча — радуга
    if (b.star > 0) {
      this.trailPts.unshift(this.ballMesh.position.clone());
      if (this.trailPts.length > 40) this.trailPts.pop();
    } else if (this.trailPts.length) this.trailPts.pop();
    const d = this.dummy;
    this.trailPts.forEach((q, k) => {
      d.position.copy(q);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1 - k / 40);
      d.updateMatrix();
      this.trail.setMatrixAt(k, d.matrix);
      this.trail.setColorAt(k, new T.Color().setHSL((k / 20 + t) % 1, 1, 0.6).multiplyScalar(1.8));
    });
    this.trail.count = this.trailPts.length;
    this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
  }
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
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt * calm;
      if (c.position.x > 80) c.position.x = -80;
    }
    this.flags.forEach((f, i) => (f.rotation.z = Math.sin(t * 2 + i * 0.7) * 0.15 * calm));
    for (const f of this.fans) {
      f.cheer = Math.max(0, (f.cheer || 0) - dt);
      const jump = f.cheer > 0 ? Math.abs(Math.sin(t * 10 + f.ph)) * 0.8 : Math.abs(Math.sin(t * 1.5 + f.ph)) * 0.08 * calm;
      f.group.position.y = f.base + jump;
      f.arms[0].rotation.x = f.cheer > 0 ? 2.6 : -0.5;
      f.arms[1].rotation.x = f.cheer > 0 ? -2.6 : 0.5;
    }
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
    // Камера: лёгкая тряска при голе
    if (this.home) {
      this.camera.position.copy(this.home);
      if (this.shakeAmp > 0.001) {
        this.camera.position.add(new T.Vector3((Math.random() - 0.5) * this.shakeAmp, (Math.random() - 0.5) * this.shakeAmp, 0));
        this.shakeAmp *= Math.pow(0.02, dt);
      }
      this.camera.lookAt(this.look);
    }
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
