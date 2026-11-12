// Сцена «Маяка»: ночная бухта-диорама. Правила живут в rules.js, здесь только картинка.
// Координаты правил (x вправо, z от берега в море) в сцене становятся (x, 0, −z): камера стоит над берегом и смотрит в море.
import * as T from "../vendor/three/three.module.min.js?v=fe1036fe";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=fe1036fe";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=fe1036fe";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=fe1036fe";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=fe1036fe";
import { makeSky, makeSea, makeFoam, makeDecals } from "./sea.js?v=fe1036fe";
import { Particles, Marks, DOT, BUBBLE, SPARK, PUFF, STREAK, MARK_ASK, MARK_ALARM, MARK_GRAB } from "./fx.js?v=fe1036fe";
import {
  BOAT_LOOK, LAMP_Y, SHARED, bellGeometry, boatGeometry, harborGeometry, lifeRingGeometry, lighthouseGeometry,
  reefGeometry, shadeBodyGeometry, shadeMaterial, shoreGeometry, toyMaterial,
} from "./models.js?v=fe1036fe";
import { BOATS, SHADES } from "./rules.js?v=fe1036fe";

const TAU = Math.PI * 2;
const clamp = T.MathUtils.clamp;
const lerp = T.MathUtils.lerp;
const WARM = [1.0, 0.82, 0.5];
const BOAT_SCALE = 1.35; // игрушечные лодки нарочно крупнее своих «правильных» размеров: так их видно на телефоне
const v3 = new T.Vector3();
const v3b = new T.Vector3();

// поворот модели (нос в −Z) по курсу из правил
const yawOf = (hx, hz) => Math.atan2(-hx, hz);
const turnTo = (from, to, k) => {
  let d = to - from;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return from + d * k;
};

export class BayView {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    this.renderer = renderer;
    this.scene = new T.Scene();
    this.scene.background = new T.Color().setRGB(0.008, 0.03, 0.026); // тёмная суша: видна, только если камера заглянет за край берега
    this.camera = new T.PerspectiveCamera(32, 1, 1, 400);
    this.time = 0;
    this.bayKey = "";
    this.insets = { top: 96, bottom: 92 }; // сколько пикселей сверху и снизу занято приборами
    this.shiftX = 0; // на сколько пикселей картинка сдвинута вправо (в меню — из-под карточки)

    // свет: лунный полумрак и тёплые огни
    this.hemi = new T.HemisphereLight(0x8fa8e6, 0x10203a, 1.25);
    this.moon = new T.DirectionalLight(0xbfd2ff, 1.9);
    this.moon.position.set(-6, 9, -10);
    this.beamLight = new T.PointLight(0xffdfa2, 0, 7.5, 1.4);
    this.helperLight = new T.PointLight(0xffdfa2, 0, 5, 1.4);
    this.harborLight = new T.PointLight(0xffb866, 7, 9, 1.5);
    this.lampLight = new T.PointLight(0xffd28a, 9, 6, 1.6);
    this.scene.add(this.hemi, this.moon, this.beamLight, this.helperLight, this.harborLight, this.lampLight);

    this.sky = makeSky();
    this.sea = makeSea();
    this.foam = makeFoam(96);
    this.decals = makeDecals(96);
    this.particles = new Particles(900);
    this.marks = new Marks(40);
    this.scene.add(this.sky.mesh, this.sea.mesh, this.foam.mesh, this.decals.mesh, this.particles.mesh, this.marks.mesh);

    this.toy = toyMaterial();
    this.land = new T.Group(); // берег, деревня, маяк — пересобираются под форму бухты
    this.reefs = new T.Mesh(new T.BufferGeometry(), this.toy);
    this.scene.add(this.land, this.reefs);

    // конус главного луча — из двух слоёв: широкий бледный и узкий яркий, так край выходит мягким
    this.cone = this.makeCone(0.55);
    this.coneCore = this.makeCone(0.8);
    this.cone2 = this.makeCone(0.5);
    this.scene.add(this.cone.mesh, this.coneCore.mesh, this.cone2.mesh);

    this.boats = new Map(); // id лодки → её модель
    this.shades = new Map();
    this.ghosts = []; // модели, которые доигрывают своё: тонут, причаливают, спасательные круги
    this.shake = 0;
    this.flash = 0;
    this.flashAge = 99;
    this.fog = 0;
    this.gust = 0;
    this.dawn = 0;
    this.bell = null;
    this.bellSwing = 0;
    this.windows = null;
    this.windowsLit = 0;
    this.starIn = 6;
    this.wakeIn = 0;
    this.quality = 1;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  // Световой конус от лампы к пятну на воде: вершина у лампы, основание — овал пятна.
  makeCone(power) {
    const N = 28;
    const geometry = new T.BufferGeometry();
    const positions = new Float32Array((N + 2) * 3);
    const fade = new Float32Array(N + 2);
    fade[0] = 1;
    const index = [];
    for (let i = 0; i < N; i++) index.push(0, 1 + i, 1 + ((i + 1) % N));
    geometry.setIndex(index);
    geometry.setAttribute("position", new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute("fade", new T.BufferAttribute(fade, 1));
    const uniforms = { uPower: { value: power } };
    const material = new T.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
blending: T.CustomBlending,
      blendSrc: T.OneFactor,
      blendDst: T.OneFactor,
      vertexShader: /* glsl */ `
        attribute float fade;
        varying float vFade;
        void main() {
          vFade = fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uPower;
        varying float vFade;
        void main() {
          float a = (0.012 + 0.2 * pow(vFade, 2.4)) * uPower;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.56) * a, 1.0);
        }
      `,
    });
    const mesh = new T.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    return { mesh, uniforms, positions, N };
  }

  placeCone(cone, spot, lampX, lampY, lampZ, k = 1) {
    const p = cone.positions;
    p[0] = lampX;
    p[1] = lampY;
    p[2] = lampZ;
    for (let i = 0; i < cone.N; i++) {
      const a = (i / cone.N) * TAU;
      const along = Math.cos(a) * spot.a * k;
      const across = Math.sin(a) * spot.b * k;
      const x = spot.x + spot.sin * along + spot.cos * across;
      const z = spot.z + spot.cos * along - spot.sin * across;
      p[3 + i * 3] = x;
      p[4 + i * 3] = 0.07;
      p[5 + i * 3] = -z;
    }
    cone.mesh.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- бухта и её берега ----------
  setBay(game) {
    const bay = game.bay;
    this.bay = bay;
    const key = bay.hw.toFixed(2) + ":" + bay.depth.toFixed(2);
    if (key !== this.bayKey) {
      this.bayKey = key;
      for (const child of [...this.land.children]) {
        this.land.remove(child);
        if (child.geometry) child.geometry.dispose();
      }
      const shore = new T.Mesh(shoreGeometry(bay.hw, bay.harbor.x), this.toy);
      const tower = new T.Mesh(lighthouseGeometry(), this.toy);
      tower.position.set(bay.light.x, 0.1, -bay.light.z);
      const village = harborGeometry();
      const harbor = new T.Mesh(village.geometry, this.toy);
      harbor.position.set(bay.harbor.x, 0, 0);
      this.bell = new T.Mesh(bellGeometry(), this.toy);
      this.bell.position.set(bay.harbor.x - 0.8, 1.1, 0.3);
      // окна домов: зажигаются по мере прихода лодок
      const win = new T.InstancedMesh(new T.BoxGeometry(0.2, 0.22, 0.04), new T.MeshBasicMaterial({ toneMapped: false }), village.windows.length);
      const dummy = new T.Object3D();
      village.windows.forEach((w, i) => {
        dummy.position.set(bay.harbor.x + w.x, w.y, w.z);
        dummy.rotation.set(0, w.rot, 0);
        dummy.updateMatrix();
        win.setMatrixAt(i, dummy.matrix);
        win.setColorAt(i, new T.Color(0.05, 0.07, 0.12));
      });
      this.windows = win;
      this.windowsLit = -1;
      this.land.add(shore, tower, harbor, this.bell, win);
      this.harborLight.position.set(bay.harbor.x, 1.6, -0.3);
      this.lampLight.position.set(bay.light.x, LAMP_Y + 0.2, -bay.light.z + 0.6);
      this.lamp = new T.Vector3(bay.light.x, LAMP_Y, -bay.light.z);
      const end = bay.depth + 5.5;
      this.sea.mesh.scale.set(bay.hw * 2 + 150, end + 14, 1);
      this.sea.mesh.position.set(0, 0, -(end - 14) / 2);
      this.sea.uniforms.uDepth.value = bay.depth;
      this.sea.uniforms.uEnd.value = end;
      this.sea.uniforms.uLight.value.set(bay.light.x, bay.light.z);
    }
    this.sea.uniforms.uHarbor.value.set(bay.harbor.x, bay.harbor.z, game.harborGlow);
    // рифы этой ночи
    this.reefs.geometry.dispose();
    this.reefs.geometry = reefGeometry(game.rocks, game.reefSeed);
    this.foam.set(game.rocks);
    this.clear();
    this.fit();
  }

  dropBoat(view) {
    this.scene.remove(view.group);
    view.material.dispose();
    view.lantern.material.dispose();
  }

  clear() {
    for (const view of this.boats.values()) this.dropBoat(view);
    for (const view of this.shades.values()) this.dropShade(view);
    for (const ghost of this.ghosts) {
      this.scene.remove(ghost.group);
      if (ghost.material) ghost.material.dispose();
      else if (ghost.type === "dive") this.dropShade(ghost.view);
      else this.dropBoat(ghost.view);
    }
    this.boats.clear();
    this.shades.clear();
    this.ghosts.length = 0;
    this.particles.list.length = 0;
    this.dawn = 0;
    this.flash = 0;
    this.flashAge = 99;
  }

  // ---------- камера ----------
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75) * this.quality;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.sea.uniforms.uRes.value.set(w * ratio, h * ratio);
    this.fit();
  }

  // Подбирает наклон и расстояние камеры так, чтобы бухта заняла экран между приборами сверху и берегом снизу.
  fit() {
    const bay = this.bay;
    const cam = this.camera;
    const w = this.width;
    const h = this.height;
    if (!bay || !w) return;
    const aspect = w / h;
    cam.aspect = aspect;
    cam.fov = clamp(36 - 4 * aspect, 27, 34); // длинный объектив: мало перспективы, маяк и домики видны сбоку, а не с макушки
    if (this.shiftX) cam.setViewOffset(w, h, -this.shiftX, 0, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    const yTop = 1 - (2 * this.insets.top) / h; // дальний край бухты не выше этой линии
    const yBottom = -1 + (2 * this.insets.bottom) / h; // кромка берега не ниже этой
    const xMax = 0.985 - (2 * this.shiftX) / w;
    const place = (pitch, dist, gz) => {
      cam.position.set(0, Math.sin(pitch) * dist, -gz + Math.cos(pitch) * dist);
      cam.lookAt(0, 0, -gz);
      cam.updateMatrixWorld();
    };
    const ndc = (x, z) => v3.set(x, 0, -z).project(cam);
    // при данных наклоне и расстоянии ставит камеру так, чтобы кромка берега легла на yBottom; возвращает запас сверху и по бокам
    const settle = (pitch, dist) => {
      // чем дальше в море смотрит камера, тем ниже на экране берег; камера остаётся над сушей
      let lo = -40;
      let hi = Math.min(bay.depth + 30, Math.cos(pitch) * dist - 1);
      for (let i = 0; i < 26; i++) {
        const gz = (lo + hi) / 2;
        place(pitch, dist, gz);
        if (ndc(0, 0).y < yBottom) hi = gz;
        else lo = gz;
      }
      const farY = ndc(0, bay.depth).y;
      // полуширина бухты на экране у берега и у дальнего края (сдвиг картинки на неё не влияет)
      const sideNear = (ndc(bay.hw, 0.3).x - ndc(-bay.hw, 0.3).x) / 2;
      const sideFar = (ndc(bay.hw, bay.depth).x - ndc(-bay.hw, bay.depth).x) / 2;
      return { ok: farY <= yTop && Math.max(sideNear, sideFar) <= xMax, farY, gz: (lo + hi) / 2 };
    };
    let best = null;
    for (let deg = 39; deg <= 46; deg += 1) {
      const pitch = (deg * Math.PI) / 180;
      let lo = 8;
      let hi = 220;
      if (!settle(pitch, hi).ok) continue;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (settle(pitch, mid).ok) hi = mid;
        else lo = mid;
      }
      const s = settle(pitch, hi);
      // чем ближе камера и чем меньше пустоты над бухтой, тем лучше; слишком отвесный взгляд не так красив
      const score = hi * (1 + 0.55 * Math.max(0, yTop - s.farY));
      if (!best || score < best.score) best = { score, pitch, dist: hi, gz: s.gz };
    }
    if (!best) best = { pitch: 0.9, dist: 60, gz: bay.depth / 2 };
    place(best.pitch, best.dist, best.gz);
    this.pitch = best.pitch;
    cam.near = Math.max(1, best.dist * 0.2);
    cam.far = best.dist * 3 + 120;
    cam.updateProjectionMatrix();
    this.camHome = cam.position.clone();
    // горизонт — там, где кончается море
    const horizon = v3.set(0, 0, -this.sea.uniforms.uEnd.value).project(cam).y;
    this.sky.uniforms.uHorizon.value = horizon;
    this.sky.uniforms.uAspect.value = aspect;
    this.horizon = horizon;
    this.unit = (Math.abs(ndc(1, bay.depth * 0.4).x - ndc(0, bay.depth * 0.4).x) * w) / 2; // пикселей на единицу бухты
  }

  // точка на воде под пальцем, в координатах правил
  pointAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((clientY - rect.top) / rect.height) * 2;
    const cam = this.camera;
    v3.set(x, y, 0.5).unproject(cam).sub(cam.position).normalize();
    const limit = this.bay.depth + 2.5;
    if (v3.y > -0.02) {
      // палец выше горизонта: луч уходит к дальнему краю в ту же сторону
      const t = (limit + cam.position.z) / Math.max(0.05, -v3.z);
      return { x: cam.position.x + v3.x * t, z: limit };
    }
    const t = -cam.position.y / v3.y;
    return { x: cam.position.x + v3.x * t, z: Math.min(limit, -(cam.position.z + v3.z * t)) };
  }

  // где на экране точка бухты (в пикселях страницы)
  project(x, z, y = 0) {
    const rect = this.canvas.getBoundingClientRect();
    v3.set(x, y, -z).project(this.camera);
    return { x: rect.left + ((v3.x + 1) / 2) * rect.width, y: rect.top + ((1 - v3.y) / 2) * rect.height };
  }

  // ---------- модели ----------
  addBoat(boat) {
    const group = new T.Group();
    const material = toyMaterial();
    const mesh = new T.Mesh(boatGeometry(boat.kind), material);
    const look = BOAT_LOOK[boat.kind];
    const lantern = new T.Mesh(SHARED.ball, new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    lantern.position.set(look.lantern[0], look.lantern[1], look.lantern[2]);
    lantern.scale.setScalar(boat.kind === "ferry" ? 0.3 : 0.24);
    const body = new T.Group(); // качается на волне
    body.add(mesh, lantern);
    body.position.y = -0.07;
    group.add(body);
    group.position.set(boat.x, 0, -boat.z);
    group.rotation.y = yawOf(boat.hx, boat.hz);
    this.scene.add(group);
    const view = { group, body, mesh, material, lantern, look, kind: boat.kind, phase: boat.id * 1.7, grow: 0, glow: 1, lit: 0, wake: 0, spark: 0, smoke: 1 };
    this.boats.set(boat.id, view);
    return view;
  }

  addShade(shade) {
    const group = new T.Group();
    const material = shadeMaterial();
    material.uniforms.uPhase.value = shade.id * 2.3;
    const body = new T.Mesh(shadeBodyGeometry(), material);
    const eyeMat = new T.MeshBasicMaterial({ color: new T.Color(1.7, 1.6, 1.05), toneMapped: false });
    const pupilMat = new T.MeshBasicMaterial({ color: 0x150a2a });
    const eyes = new T.Group();
    for (const side of [-1, 1]) {
      const eye = new T.Mesh(SHARED.ball, eyeMat);
      eye.position.set(side * 0.33, 0.7, 0.6);
      eye.scale.set(0.5, 0.56, 0.36);
      const pupil = new T.Mesh(SHARED.ball, pupilMat);
      pupil.position.set(side * 0.3, 0.7, 0.8);
      pupil.scale.set(0.2, 0.26, 0.14);
      eyes.add(eye, pupil);
    }
    group.add(body, eyes);
    group.position.set(shade.x, 0, -shade.z);
    this.scene.add(group);
    const view = { group, body, eyes, material, eyeMat, pupilMat, kind: shade.kind, fear: 0, blink: 2 + Math.random() * 3, rise: 0, bubble: 0, x: shade.x, z: shade.z };
    this.shades.set(shade.id, view);
    return view;
  }

  dropShade(view) {
    this.scene.remove(view.group);
    view.material.dispose();
    view.eyeMat.dispose();
    view.pupilMat.dispose();
  }

  // ---------- события правил ----------
  handle(e, game) {
    const fx = this.particles;
    if (e.type === "deliver") {
      const view = this.boats.get(e.id);
      if (view) {
        this.boats.delete(e.id);
        this.ghosts.push({ group: view.group, view, type: "dock", t: 0 });
      }
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * TAU;
        fx.emit(e.x, 0.6 + Math.random() * 0.6, -e.z, { vx: Math.cos(a) * 1.6, vy: 1.6 + Math.random() * 1.6, vz: Math.sin(a) * 1.6, life: 0.9 + Math.random() * 0.5, size: 0.2, kind: SPARK, r: 2.2, g: 1.7, b: 0.7, gravity: 2.2, drag: 1 });
      }
      this.bellSwing = 1;
    } else if (e.type === "wreck" || e.type === "dragged") {
      const view = this.boats.get(e.id);
      if (view) {
        this.boats.delete(e.id);
        this.ghosts.push({ group: view.group, view, type: e.type === "wreck" ? "wreck" : "drag", t: 0, x: e.x, z: e.z });
      }
      this.shake = 0.35;
      const violet = e.type === "dragged";
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * TAU;
        const s = 0.8 + Math.random() * 2.2;
        fx.emit(e.x, 0.2, -e.z, { vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.8 + Math.random() * 0.4, size: 0.13 + Math.random() * 0.1, kind: violet ? BUBBLE : DOT, r: violet ? 0.9 : 0.75, g: violet ? 0.6 : 0.9, b: 1.2, gravity: 7, floor: 0 });
      }
    } else if (e.type === "pop" || e.type === "dive" || e.type === "sink") {
      const view = this.shades.get(e.id);
      if (view) {
        this.shades.delete(e.id);
        if (e.type === "pop") this.dropShade(view);
        else this.ghosts.push({ group: view.group, view, type: "dive", t: 0 });
      }
      const n = e.type === "pop" ? 18 : 6;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = 0.5 + Math.random() * 1.8;
        fx.emit(e.x + Math.cos(a) * 0.3, 0.3 + Math.random() * 0.5, -e.z + Math.sin(a) * 0.3, { vx: Math.cos(a) * s, vy: 1.2 + Math.random() * 2.2, vz: Math.sin(a) * s, life: 0.7 + Math.random() * 0.6, size: 0.12 + Math.random() * 0.16, kind: BUBBLE, r: 1.0, g: 0.75, b: 1.5, drag: 1.6, gravity: -0.6 });
      }
      if (e.type === "pop") {
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * TAU;
          fx.emit(e.x, 0.4, -e.z, { vx: Math.cos(a) * 3, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 3, life: 0.5, size: 0.16, kind: DOT, r: 1.3, g: 0.5, b: 1.8, gravity: 8, floor: 0 });
        }
      }
    } else if (e.type === "charged") {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        fx.emit(e.x, 0.9, -e.z, { vx: Math.cos(a) * 1.8, vy: 0.6, vz: Math.sin(a) * 1.8, life: 0.45, size: 0.15, kind: SPARK, r: 2.2, g: 1.8, b: 0.8, drag: 2.5 });
      }
    } else if (e.type === "found" || e.type === "free") {
      for (let i = 0; i < 6; i++) fx.emit(e.x + (Math.random() - 0.5) * 0.8, 1 + Math.random(), -e.z, { vy: 1.2, life: 0.6, size: 0.14, kind: SPARK, r: 2, g: 1.8, b: 1 });
    } else if (e.type === "shield") {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        fx.emit(e.x, 0.6, -e.z, { vx: Math.cos(a) * 4, vy: 0.4, vz: Math.sin(a) * 4, life: 0.5, size: 0.2, kind: DOT, r: 1.2, g: 1.6, b: 2, drag: 3 });
      }
    } else if (e.type === "shade") {
      for (let i = 0; i < 8; i++) fx.emit(e.x + (Math.random() - 0.5), 0.1, -e.z + (Math.random() - 0.5), { vy: 0.8 + Math.random(), life: 1 + Math.random() * 0.5, size: 0.1 + Math.random() * 0.1, kind: BUBBLE, r: 0.9, g: 0.7, b: 1.4 });
    } else if (e.type === "flash") {
      this.flashAge = 0;
    } else if (e.type === "grab") {
      this.shake = Math.max(this.shake, 0.15);
    }
  }

  // ---------- кадр ----------
  frame(game, dt, realDt = dt) {
    this.time += realDt;
    const t = this.time;
    const fx = this.particles;
    const bay = game.bay;
    const sea = this.sea.uniforms;
    fx.begin(dt);
    this.decals.begin();
    this.marks.begin();
    const playing = game.mode === "play" || game.mode === "dawn" || game.mode === "demo";

    // --- вспышка, туман, ветер, рассвет: плавные переходы ---
    const flashOn = game.flashT > 0 ? 1 : 0;
    this.flash += (flashOn - this.flash) * Math.min(1, realDt * (flashOn ? 14 : 2.4));
    this.flashAge += realDt;
    this.fog += ((game.fog ? 1 : 0) - this.fog) * Math.min(1, realDt * 1.2);
    const gustGoal = game.gust ? game.gust.dir * (game.gust.state === "blow" ? 1 : 0.4) : 0;
    this.gust += (gustGoal - this.gust) * Math.min(1, realDt * 2.5);
    const dawnGoal = game.mode === "dawn" || game.mode === "upgrade" || game.mode === "won" ? 1 : 0;
    this.dawn += (dawnGoal - this.dawn) * Math.min(1, realDt * 0.8);

    // --- лучи ---
    const beam = game.beam;
    sea.uTime.value = t;
    sea.uSpot.value.set(beam.x, beam.z, beam.sin, beam.cos);
    const beamPower = 1 - this.flash * 0.6;
    sea.uSpotAxes.value.set(beam.a, beam.b, beamPower);
    this.placeCone(this.cone, beam, this.lamp.x, this.lamp.y, this.lamp.z);
    this.placeCone(this.coneCore, beam, this.lamp.x, this.lamp.y, this.lamp.z, 0.55);
    const flicker = (1 + 0.06 * Math.sin(t * 9)) * beamPower;
    this.cone.uniforms.uPower.value = 0.55 * flicker;
    this.coneCore.uniforms.uPower.value = 0.8 * flicker;
    this.beamLight.position.set(beam.x, 3, -beam.z);
    this.beamLight.intensity = 15 * beamPower;
    this.beamLight.distance = 5.5 + beam.a * 1.4;
    if (game.helper) {
      const h = game.helper;
      sea.uSpot2.value.set(h.x, h.z, h.sin, h.cos);
      sea.uSpot2Axes.value.set(h.a, h.b, 1);
      this.placeCone(this.cone2, h, this.lamp.x, this.lamp.y, this.lamp.z);
      this.cone2.mesh.visible = true;
      this.helperLight.position.set(h.x, 2, -h.z);
      this.helperLight.intensity = 7;
    } else {
      sea.uSpot2Axes.value.z = 0;
      this.cone2.mesh.visible = false;
      this.helperLight.intensity = 0;
    }
    sea.uFlash.value = this.flash;
    sea.uFlashRing.value = this.flashAge < 1.4 ? this.flashAge * 34 : -1;
    sea.uFog.value.set(game.fog ? game.fog.z : sea.uFog.value.x, game.fog ? game.fog.half : sea.uFog.value.y, this.fog);
    sea.uGust.value = this.gust;
    sea.uDawn.value = this.dawn;
    sea.uHarbor.value.z = game.harborGlow;
    this.foam.uniforms.uTime.value = t;
    this.foam.uniforms.uLit.value = this.flash;
    this.hemi.intensity = 1.25 + this.flash * 1.3 + this.dawn * 0.9;
    this.toy.userData.glow.value = 1 - this.dawn * 0.35;

    // лампа маяка: ореол и лучики
    const flare = 1.25 + this.flash * 0.7 + 0.1 * Math.sin(t * 7);
    fx.sprite(this.lamp.x, this.lamp.y, this.lamp.z, flare, DOT, 1.5, 1.2, 0.7, 0.8);
    fx.sprite(this.lamp.x, this.lamp.y, this.lamp.z, flare * 1.6, SPARK, 1.4, 1.15, 0.7, 0.4 + this.flash * 0.5);

    // --- небо ---
    const sky = this.sky.uniforms;
    sky.uTime.value = t;
    sky.uDawn.value = this.dawn;
    sky.uFlash.value = this.flash;
    // луна плывёт по небу, пока идёт ночь
    const night = playing && game.mode !== "demo" ? clamp(game.time / 85, 0, 1) : 0.4;
    const moonX = lerp(0.12, 0.52, night) - (this.width / this.height < 0.7 ? 0.0 : 0.25);
    const room = 1 - this.horizon;
    sky.uMoon.value.set(moonX, this.horizon + room * (0.5 + 0.22 * Math.sin(night * Math.PI)));
    sea.uMoonX.value = moonX;
    this.starIn -= realDt;
    if (this.starIn <= 0) {
      this.starIn = 7 + Math.random() * 9;
      this.star = { x: -0.5 + Math.random() * 1.3, y: this.horizon + room * (0.55 + Math.random() * 0.4), t: 0 };
    }
    if (this.star) {
      this.star.t += realDt * 1.6;
      sky.uStar.value.set(this.star.x, this.star.y, this.star.t, Math.sin(Math.min(1, this.star.t) * Math.PI));
      if (this.star.t >= 1) {
        this.star = null;
        sky.uStar.value.w = 0;
      }
    }

    // --- огни гавани: круг безопасной воды ---
    const hb = bay.harbor;
    this.decals.add(hb.x, hb.z - 0.3, game.harborGlow * 0.9, 1.0, 0.62, 0.25, 0.16 + 0.03 * Math.sin(t * 2), 0);
    // окна деревни зажигаются с каждой спасённой лодкой
    if (this.windows) {
      const n = this.windows.count;
      const lit = game.mode === "demo" || game.mode === "menu" ? n - 2 : Math.min(n, 3 + Math.round((game.saved / Math.max(1, game.total)) * (n - 3)));
      if (lit !== this.windowsLit) {
        this.windowsLit = lit;
        const color = new T.Color();
        for (let i = 0; i < n; i++) {
          if ((i * 5) % n < lit) color.setRGB(2.4, 1.55, 0.6);
          else color.setRGB(0.06, 0.08, 0.14);
          this.windows.setColorAt(i, color);
        }
        this.windows.instanceColor.needsUpdate = true;
      }
    }
    if (this.bell) {
      this.bellSwing = Math.max(0, this.bellSwing - realDt * 0.7);
      this.bell.rotation.z = Math.sin(t * 13) * 0.6 * this.bellSwing;
    }

    // --- лодки ---
    this.wakeIn -= dt;
    const wakeNow = this.wakeIn <= 0;
    if (wakeNow) this.wakeIn = 0.11;
    for (const boat of game.boats) {
      const view = this.boats.get(boat.id) || this.addBoat(boat);
      const look = view.look;
      view.grow = Math.min(1, view.grow + realDt * 1.6);
      const g = view.group;
      g.position.x = boat.x;
      g.position.z = -boat.z;
      g.rotation.y = turnTo(g.rotation.y, yawOf(boat.hx, boat.hz), Math.min(1, realDt * 8));
      const wobble = boat.lost ? 0.16 : 0.05;
      view.body.rotation.z = Math.sin(t * (boat.lost ? 2.6 : 1.4) + view.phase) * wobble + (boat.held ? Math.sin(t * 31) * 0.09 : 0) - this.gust * 0.12;
      view.body.rotation.x = Math.sin(t * 1.1 + view.phase * 1.3) * 0.04;
      view.body.position.y = -0.07 + Math.sin(t * 1.7 + view.phase) * 0.045 - (boat.held ? 0.12 : 0);
      g.scale.setScalar(BOAT_SCALE * (0.3 + 0.7 * view.grow * view.grow * (3 - 2 * view.grow)));
      // фонарик
      const k = boat.lantern;
      view.lit += ((boat.lit > 0 ? 1 : 0) - view.lit) * Math.min(1, realDt * 10);
      let shine = k <= 0 ? 0 : 0.3 + 0.7 * k;
      if (k > 0 && k < 0.3 && boat.lit <= 0) shine *= 0.55 + 0.45 * Math.sin(t * 19 + view.phase); // вот-вот погаснет
      view.glow += (shine - view.glow) * Math.min(1, realDt * 12);
      const s = view.glow;
      view.lantern.material.color.setRGB(0.1 + 3.3 * s, 0.11 + 2.3 * s, 0.14 + 0.85 * s);
      view.material.emissive.setRGB(0.06 * view.lit, 0.05 * view.lit, 0.024 * view.lit);
      view.material.userData.self.value = 0.05 + 0.3 * s + 0.08 * view.lit + this.flash * 0.15;
      view.lantern.getWorldPosition(v3);
      if (s > 0.02) {
        fx.sprite(v3.x, v3.y, v3.z, 0.42 + 0.75 * s + view.lit * 0.2, DOT, 1.5, 1.05, 0.45, 0.85 * s);
        this.decals.add(boat.x, boat.z, 1.0 + 1.5 * s, WARM[0], WARM[1] * 0.85, WARM[2] * 0.6, 0.11 + 0.26 * s, 0);
      }
      // фонарщик светит вокруг: круг его света
      if (boat.kind === "lamp" && boat.lantern > 0.35 && !boat.held) {
        this.decals.add(boat.x, boat.z, BOATS.lamp.aura + 0.3, 1.0, 0.8, 0.45, 0.2 + 0.04 * Math.sin(t * 3 + view.phase), 1);
        this.decals.add(boat.x, boat.z, BOATS.lamp.aura + 0.3, 1.0, 0.8, 0.45, 0.07, 0);
      }
      // заряжается в луче: искорки
      if (boat.lit > 0 && k < 1 && playing) {
        view.spark -= dt;
        if (view.spark <= 0) {
          view.spark = 0.07;
          fx.emit(v3.x + (Math.random() - 0.5) * 0.5, v3.y - 0.2, v3.z + (Math.random() - 0.5) * 0.5, { vy: 1.5 + Math.random(), life: 0.5, size: 0.1, kind: SPARK, r: 2.2, g: 1.8, b: 0.8 });
        }
      }
      // значки
      const markY = look.height * BOAT_SCALE + 0.2 + Math.sin(t * 3 + view.phase) * 0.08;
      if (boat.held) this.marks.add(boat.x, markY, -boat.z, 1.7 + 0.2 * Math.sin(t * 14), MARK_GRAB);
      else if (boat.lost) {
        if (boat.peril < 3.5) this.marks.add(boat.x, markY, -boat.z, 1.7 + 0.22 * Math.sin(t * 16), MARK_ALARM);
        else this.marks.add(boat.x, markY, -boat.z, 1.5, MARK_ASK);
      }
      // пенный след
      if (wakeNow && !boat.held && view.grow > 0.5) {
        const back = look.size * 0.42 * BOAT_SCALE;
        const fast = boat.kind === "speed" ? 1.6 : 1;
        fx.emit(boat.x - boat.hx * back + (Math.random() - 0.5) * 0.2, 0.06, -(boat.z - boat.hz * back) + (Math.random() - 0.5) * 0.2, { life: 1.1 * fast, size: 0.2 * fast, grow: 0.34, kind: PUFF, r: 0.5, g: 0.72, b: 0.9, alpha: 0.2 });
      }
      if (boat.kind === "ferry") {
        view.smoke -= dt;
        if (view.smoke <= 0) {
          view.smoke = 0.5;
          v3b.set(0, 1.95, 0.3).applyMatrix4(g.matrixWorld);
          fx.emit(v3b.x, v3b.y, v3b.z, { vx: this.gust * 1.5, vy: 0.7, life: 1.8, size: 0.2, grow: 0.3, kind: PUFF, r: 0.5, g: 0.55, b: 0.66, alpha: 0.13 });
        }
      }
    }
    // лодки, которых в правилах уже нет (ночь началась заново)
    for (const [id, view] of this.boats) {
      if (!game.boats.some((b) => b.id === id)) {
        this.dropBoat(view);
        this.boats.delete(id);
      }
    }

    // --- тени ---
    for (const shade of game.shades) {
      const view = this.shades.get(shade.id) || this.addShade(shade);
      const spec = SHADES[shade.kind];
      const size = spec.radius / 0.7;
      view.rise = Math.min(1, view.rise + realDt / 1.1);
      view.fear += ((shade.lit > 0 ? 1 : 0) - view.fear) * Math.min(1, realDt * 9);
      view.material.uniforms.uTime.value = t;
      view.material.uniforms.uFear.value = view.fear;
      view.material.uniforms.uFade.value = shade.state === "hold" ? 0.8 : 1; // сквозь тень видно лодку, которую она держит
      const g = view.group;
      const holding = shade.state === "hold";
      const shrink = 0.5 + 0.5 * Math.max(0, shade.hp);
      const sc = size * shrink * (holding ? 1.12 : 1);
      g.scale.set(sc, sc * (0.15 + 0.85 * view.rise), sc);
      // держит лодку — выглядывает из-за неё
      g.position.set(shade.x + (holding ? 0.2 : 0), holding ? 0.05 : Math.sin(t * 2 + shade.id) * 0.04, -shade.z - (holding ? 1.0 : 0));
      // смотрит в сторону добычи, но лицом всегда к зрителю
      const dx = shade.x - view.x;
      view.x = shade.x;
      view.z = shade.z;
      g.rotation.y = lerp(g.rotation.y, clamp(dx * 40, -0.7, 0.7), Math.min(1, realDt * 4));
      g.rotation.z = view.fear * Math.sin(t * 40) * 0.06;
      // глаза: моргают, а на свету таращатся
      view.blink -= realDt;
      if (view.blink < -0.12) view.blink = 1.5 + Math.random() * 3.5;
      const open = view.fear > 0.3 ? 1.35 : view.blink < 0 ? 0.12 : 1;
      view.eyes.scale.set(1 + view.fear * 0.2, lerp(view.eyes.scale.y, open, Math.min(1, realDt * 30)), 1);
      view.eyes.position.y = 0.7 * (1 - view.eyes.scale.y) * 0.6;
      this.decals.add(shade.x, shade.z, spec.radius * 3.1, 0.62, 0.2, 1.0, 0.36 + 0.06 * Math.sin(t * 4 + shade.id), 0);
      if (holding) {
        // кольцо сжимается: столько осталось до беды
        const left = clamp(shade.holdT / spec.hold, 0, 1);
        this.decals.add(shade.x, shade.z, 1.0 + 1.5 * left, 1.2, 0.3, 0.9, 0.9, 1);
      }
      view.bubble -= dt;
      if (view.bubble <= 0 && playing) {
        view.bubble = shade.lit > 0 ? 0.05 : shade.state === "rise" ? 0.12 : 0.5;
        fx.emit(shade.x + (Math.random() - 0.5) * spec.radius * 1.6, 0.15, -shade.z + (Math.random() - 0.5) * spec.radius * 1.6, { vy: 0.9 + Math.random() * 0.8, life: 0.8, size: 0.08 + Math.random() * 0.09, kind: BUBBLE, r: 0.95, g: 0.7, b: 1.4, alpha: shade.lit > 0 ? 1 : 0.7 });
      }
    }
    for (const [id, view] of this.shades) {
      if (!game.shades.some((s) => s.id === id)) {
        this.dropShade(view);
        this.shades.delete(id);
      }
    }

    // --- те, кто доигрывает: причаливают, тонут, плавают на круге ---
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const ghost = this.ghosts[i];
      ghost.t += dt;
      const g = ghost.group;
      let done = false;
      if (ghost.type === "dock") {
        // лодка заходит к причалу и гаснет в огнях гавани
        const k = Math.min(1, ghost.t / 0.9);
        g.position.x += (hb.x - g.position.x) * Math.min(1, dt * 2.5);
        g.position.z += (0.4 - g.position.z) * Math.min(1, dt * 2.5);
        g.scale.setScalar(BOAT_SCALE * Math.max(0.01, 1 - k * k));
        done = k >= 1;
      } else if (ghost.type === "wreck") {
        const k = Math.min(1, ghost.t / 1.3);
        ghost.view.body.rotation.z = k * 1.1;
        g.position.y = -k * k * 1.3;
        ghost.view.lantern.material.color.setRGB(0.1, 0.1, 0.14);
        done = k >= 1;
        if (done) this.addRing(ghost.x, ghost.z);
      } else if (ghost.type === "drag") {
        const k = Math.min(1, ghost.t / 1.0);
        g.position.y = -k * k * 2.2;
        g.rotation.y += dt * 5 * k;
        g.scale.setScalar(BOAT_SCALE * Math.max(0.05, 1 - k * 0.6));
        done = k >= 1;
        if (done) this.addRing(ghost.x, ghost.z);
      } else if (ghost.type === "dive") {
        const k = Math.min(1, ghost.t / 0.7);
        g.scale.multiplyScalar(Math.max(0.01, 1 - dt * 4));
        g.position.y = -k * 0.8;
        done = k >= 1;
        if (done) this.dropShade(ghost.view);
      } else if (ghost.type === "ring") {
        // экипаж на спасательном круге: покачается, поплывёт к гавани и скроется у берега
        const k = Math.min(1, ghost.t / 0.4);
        const out = clamp((ghost.t - 5) / 0.8, 0, 1);
        g.scale.setScalar(Math.max(0.01, 1.4 * k * (1 - out)));
        g.position.y = Math.sin(t * 2.4) * 0.06 - 0.02;
        g.rotation.y = Math.sin(t * 0.9) * 0.6;
        g.rotation.z = Math.sin(t * 2.1) * 0.12;
        const dx = hb.x - g.position.x;
        const dz = -hb.z - g.position.z;
        const d = Math.hypot(dx, dz) || 1;
        g.position.x += (dx / d) * dt * 1.5;
        g.position.z += (dz / d) * dt * 1.5;
        this.decals.add(g.position.x, -g.position.z, 1.1, 1, 0.6, 0.3, 0.18, 0);
        done = out >= 1 || d < 1;
      }
      if (done) {
        if (ghost.material) {
          this.scene.remove(g);
          ghost.material.dispose();
        } else if (ghost.type !== "dive") this.dropBoat(ghost.view); // тень уже убрана выше
        this.ghosts.splice(i, 1);
      }
    }

    // --- туман: клубы над полосой ---
    if (this.fog > 0.02 && game.fog) {
      const span = bay.hw * 2 + 10;
      for (let i = 0; i < 22; i++) {
        const x = ((((i * 0.6180339 * span + t * (0.3 + (i % 3) * 0.1)) % span) + span) % span) - span / 2;
        const z = game.fog.z + Math.sin(i * 2.4 + t * 0.17) * game.fog.half * 0.75;
        fx.sprite(x, 0.7 + (i % 4) * 0.2, -z, 2.6 + (i % 5) * 0.35, PUFF, 0.5, 0.62, 0.8, 0.12 * this.fog);
      }
    }
    // --- ветер: штрихи летят через бухту ---
    if (Math.abs(this.gust) > 0.15 && playing) {
      const n = Math.abs(this.gust) > 0.7 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.6) {
          const dir = Math.sign(this.gust);
          fx.emit(-dir * (bay.hw + 4) + Math.random() * 4, 0.4 + Math.random() * 2.2, -Math.random() * bay.depth, { vx: dir * (13 + Math.random() * 8), life: 0.9 + Math.random() * 0.5, size: 0.22 + Math.random() * 0.2, kind: STREAK, r: 0.7, g: 0.85, b: 1, alpha: 0.55 });
        }
      }
    }
    // светлячки над деревней
    if (Math.random() < realDt * 2.2) {
      fx.emit(hb.x + (Math.random() - 0.4) * 7, 0.6 + Math.random() * 1.2, 1 + Math.random() * 2.5, { vx: (Math.random() - 0.5) * 0.4, vy: 0.15, vz: (Math.random() - 0.5) * 0.3, life: 2.4, size: 0.07, kind: DOT, r: 1.6, g: 2, b: 0.6 });
    }

    fx.end();
    this.decals.end();
    this.marks.end();

    // лёгкая встряска камеры при потере лодки
    if (this.camHome) {
      this.shake = Math.max(0, this.shake - realDt * 1.4);
      const s = this.shake * this.shake * 0.5;
      this.camera.position.set(this.camHome.x + Math.sin(t * 61) * s, this.camHome.y + Math.cos(t * 53) * s, this.camHome.z);
    }
    this.composer.render();
  }

  addRing(x, z) {
    const material = toyMaterial();
    const group = new T.Mesh(lifeRingGeometry(), material);
    group.position.set(x, 0, -z);
    group.scale.setScalar(0.01);
    this.scene.add(group);
    this.ghosts.push({ group, type: "ring", t: 0, material });
    for (let i = 0; i < 6; i++) this.particles.emit(x + (Math.random() - 0.5) * 0.6, 0.1, -z + (Math.random() - 0.5) * 0.6, { vy: 1 + Math.random(), life: 0.7, size: 0.1, kind: BUBBLE, r: 0.9, g: 1, b: 1.2 });
  }
}
