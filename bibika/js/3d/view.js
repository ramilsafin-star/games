import * as T from "../../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../../vendor/three/RoomEnvironment.js";
import {
  vehicle,
  pose,
  helicopter,
  shipModel,
  trainModel,
  addBeaconBar,
  setCarLamps,
  forgetConceptCars,
  whaleModel,
  fishGeometry,
  washRollers,
  animalModel,
} from "./vehicles.js";
import {
  Scenery,
  bend,
  heading,
  rise,
  riseSlope,
  tunnelAmount,
  zoneAt,
  nextSignal,
  leapAt,
  leapNear,
  bridgeNear,
  loopAt,
  loopAhead,
  pitAt,
  washNear,
  openGround,
  onHill,
  tunnelStart,
  skyColors,
  TILE,
  LOOP_RADIUS,
  UNITS_PER_METRE,
} from "./scenery.js";
import { Blasts } from "./blasts.js";

const TOOL_CAMERA_OFFSET = { whistle: 4.5, harvest: 6, scoop: 4.8, water: 3.3 };
const SHOT_LIMIT = 32;

const gold = new T.MeshStandardMaterial({
  color: "#ffc23b",
  metalness: 0.53,
  roughness: 0.22,
  emissive: "#d47d11",
  emissiveIntensity: 0.25,
});
function starGeometry() {
  const shape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 + Math.PI / 2,
      r = i % 2 ? 0.28 : 0.57;
    i
      ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelSize: 0.045,
    bevelThickness: 0.055,
    bevelSegments: 2,
    steps: 1,
  });
  g.center();
  return g;
}
const star = starGeometry(),
  sphere = new T.SphereGeometry(1, 16, 12),
  disc = new T.CylinderGeometry(1, 1, 0.06, 24),
  cone = new T.ConeGeometry(0.39, 0.96, 16),
  ring = new T.TorusGeometry(1, 0.025, 6, 64);
function standard(color) {
  return new T.MeshStandardMaterial({ color, roughness: 0.7 });
}
function setupLights(scene, shadows) {
  const hemi = new T.HemisphereLight("#ecf7ff", "#c3b39c", 1.55);
  scene.add(hemi);
  const sun = new T.DirectionalLight("#fff1d6", 2.6);
  sun.position.set(-23, 35, -20);
  sun.castShadow = shadows;
  if (shadows) {
    Object.assign(sun.shadow.camera, {
      left: -22,
      right: 22,
      top: 32,
      bottom: -22,
      near: 1,
      far: 100,
    });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.normalBias = 0.033;
    sun.shadow.bias = -0.00012;
    sun.target.position.set(0, 0, -8);
    scene.add(sun.target);
  }
  scene.add(sun);
  sun.userData.hemi = hemi;
  return sun;
}
const CONFETTI = ["#ff4f7e", "#ffd23f", "#3fd1ff", "#7be04f", "#b57bff"];
function rampMesh() {
  const root = new T.Group(),
    colors = ["#e8321a", "#ffc400", "#e8321a"];
  // Высокий край дальше от камеры: машина въезжает по скату
  for (let i = 0; i < 3; i++) {
    const s = new T.Shape();
    s.moveTo(-1.7, 0);
    s.lineTo(1.7, 0);
    s.lineTo(1.7, 0.95);
    s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-0.5, 0, 0);
    const part = new T.Mesh(geo, standard(colors[i]));
    part.position.x = i - 1;
    root.add(part);
  }
  // Белые полосы поперёк ската показывают наклон
  const bar = new T.BoxGeometry(3.02, 0.03, 0.24),
    white = standard("#ffffff");
  for (const z of [0.95, 0.05, -0.85]) {
    const stripe = new T.Mesh(bar, white);
    stripe.position.set(0, (0.95 * (1.7 - z)) / 3.4 + 0.02, z);
    stripe.rotation.x = Math.atan2(0.95, 3.4);
    root.add(stripe);
  }
  root.traverse((n) => {
    if (n.isMesh) n.castShadow = true;
  });
  return root;
}
const boostGlow = new T.MeshBasicMaterial({
  color: "#27e6ff",
  toneMapped: false,
  transparent: true,
  opacity: 0.92,
});
// Ускоритель: светящиеся шевроны на дороге показывают вперёд
function boostMesh() {
  const root = new T.Group(),
    arm = new T.BoxGeometry(1.5, 0.03, 0.36);
  for (let i = 0; i < 3; i++)
    for (const s of [-1, 1]) {
      const part = new T.Mesh(arm, boostGlow);
      part.position.set(s * 0.56, 0.05, 1.3 - i * 1.3 + 0.38);
      part.rotation.y = s * 0.72;
      root.add(part);
    }
  return root;
}
// Подарочный ящик на парашюте
function giftMesh() {
  const root = new T.Group(),
    pink = standard("#ff4f7e"),
    yellow = standard("#ffd23f"),
    add = (geo, mat, x, y, z) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      root.add(m);
      return m;
    };
  add(new T.BoxGeometry(1.25, 1.25, 1.25), pink, 0, 0.64, 0);
  add(new T.BoxGeometry(1.29, 1.29, 0.26), yellow, 0, 0.64, 0);
  add(new T.BoxGeometry(0.26, 1.29, 1.29), yellow, 0, 0.64, 0);
  add(new T.SphereGeometry(0.28, 10, 8), yellow, -0.2, 1.38, 0);
  add(new T.SphereGeometry(0.28, 10, 8), yellow, 0.2, 1.38, 0);
  const chute = new T.Group(),
    canopy = new T.Mesh(
      new T.SphereGeometry(1.9, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6, side: T.DoubleSide }),
    );
  canopy.position.y = 3.6;
  canopy.scale.y = 0.72;
  chute.add(canopy);
  for (const [x, z] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) {
    const line = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 2.8, 5), standard("#5a4632"));
    line.position.set(x / 2, 2.4, z / 2);
    line.rotation.set(z * 0.34, 0, -x * 0.34);
    chute.add(line);
  }
  root.add(chute);
  root.userData.chute = chute;
  return root;
}
// Настроение неба. k — насколько оно перекрывает родные цвета трассы
const MOODS = {
  day: { k: 0, zenith: "#378bc7", horizon: "#d5e7ee", sun: 2.6, sunColor: "#fff1d6", hemi: 1.4, env: 1, night: 0, wet: 0, rain: 0, lamps: 0 },
  sunset: { k: 0.82, zenith: "#5a4fa8", horizon: "#ff9d6b", sun: 2.0, sunColor: "#ffb27a", hemi: 1.08, env: 0.6, night: 0, wet: 0, rain: 0, lamps: 0.4 },
  night: { k: 0.94, zenith: "#0a1238", horizon: "#2c3a70", sun: 0.55, sunColor: "#a4b6ff", hemi: 0.72, env: 0.34, night: 1, wet: 0, rain: 0, lamps: 1 },
  rain: { k: 0.8, zenith: "#66788a", horizon: "#aab6c0", sun: 0.75, sunColor: "#e3ebf2", hemi: 1.2, env: 0.62, night: 0, wet: 1, rain: 1, lamps: 0.75 },
};
const BACKDROP_TINT = {
  day: "#ffffff",
  sunset: "#ffb48a",
  night: "#3a4a86",
  rain: "#a8b6c4",
};
for (const [name, m] of Object.entries(MOODS)) {
  m.backdropTint = new T.Color(BACKDROP_TINT[name]);
  m.zenith = new T.Color(m.zenith);
  m.horizon = new T.Color(m.horizon);
  m.sunColor = new T.Color(m.sunColor);
}
const carLike = (e) => e.kind === "traffic" || e.kind === "rival" || e.kind === "patrolActor";
// Кто живёт у дороги на каждой трассе
const WORLD_ANIMALS = [
  ["dog"],
  ["cow", "sheep"],
  ["camel"],
  ["penguin"],
  ["crab"],
  ["bunny"],
  ["robot"],
];
const MOOD_TIME = 75,
  SHIP_WORLDS = [0, 1, 3, 4, 5];
// Снаряды всех машин: по заготовке на форму, цвет у каждого снаряда свой
function shotMeshes() {
  const solid = new T.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 }),
    bright = new T.MeshBasicMaterial({ toneMapped: false }),
    airy = new T.MeshBasicMaterial({ transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }),
    heart = new T.Shape();
  heart.moveTo(0, -1);
  heart.bezierCurveTo(-1.6, -0.2, -0.9, 1.1, 0, 0.42);
  heart.bezierCurveTo(0.9, 1.1, 1.6, -0.2, 0, -1);
  const heartGeometry = new T.ExtrudeGeometry(heart, { depth: 0.5, bevelEnabled: false, curveSegments: 10 }).center(),
    drop = new T.LatheGeometry(
      [[0, -1], [0.62, -0.82], [0.95, -0.3], [0.8, 0.3], [0.42, 0.95], [0, 1.7]].map(([x, y]) => new T.Vector2(x, y)),
      14,
    ),
    kinds = {
      ball: [sphere, bright],
      star: [star, bright],
      heart: [heartGeometry, solid],
      drop: [drop, bright],
      cube: [new T.BoxGeometry(1.5, 1.5, 1.5), solid],
      card: [new T.BoxGeometry(2, 1.3, 0.16), solid],
      ring: [new T.TorusGeometry(1, 0.26, 8, 22), bright],
      coin: [new T.CylinderGeometry(1, 1, 0.24, 18).rotateX(Math.PI / 2), solid],
      flake: [new T.OctahedronGeometry(1.1), bright],
      rock: [new T.IcosahedronGeometry(1, 0), solid],
      puff: [sphere, airy],
      bubble: [sphere, airy],
    },
    meshes = {};
  for (const [name, [geometry, material]] of Object.entries(kinds)) {
    const mesh = new T.InstancedMesh(geometry, material, SHOT_LIMIT);
    // Цветовой буфер заводим сразу: первый выстрел не должен подвисать
    mesh.setColorAt(0, new T.Color("#ffffff"));
    mesh.count = 0;
    mesh.frustumCulled = false;
    meshes[name] = mesh;
  }
  return meshes;
}
function marker(kind) {
  if (kind === "star") return new T.Mesh(star, gold);
  if (kind === "brazier") {
    const group = new T.Group(), flames = new T.Group();
    const drum = new T.Mesh(new T.CylinderGeometry(0.74,0.62,1.15,16), standard("#565c66"));
    drum.position.y = 0.58;
    group.add(drum);
    const rim = new T.Mesh(new T.TorusGeometry(0.72,0.06,5,20), standard("#9babb3"));
    rim.rotation.x = Math.PI/2;
    rim.position.y = 1.16;
    group.add(rim);
    flames.position.y = 1.07;
    for (const [x,z,h,r,color] of [[0,0,1.55,0.56,"#ff7b19"],[-0.29,0.19,0.9,0.30,"#ffc242"],[0.23,0.24,1.05,0.22,"#ffde60"]]) {
      const flame = new T.Mesh(new T.ConeGeometry(r,h,7),new T.MeshBasicMaterial({color}));
      flame.position.set(x,h/2,z);
      flames.add(flame);
    }
    group.add(flames);
    group.userData.flames = flames;
    return group;
  }
  if (kind === "crop") {
    const group = new T.Group(), count = 12, dummy = new T.Object3D();
    const stems = new T.InstancedMesh(new T.CylinderGeometry(0.035,0.05,1.2,5),standard("#ba963e"),count);
    const ears = new T.InstancedMesh(new T.SphereGeometry(1,6,6),standard("#f3c04d"),count);
    for (let i=0; i<count; i++) {
      const x = (i%4 - 1.5)*0.64, z = (Math.floor(i/4) - 1)*0.63 + Math.sin(i)*0.13;
      dummy.position.set(x,0.6,z); dummy.scale.set(1,1,1); dummy.rotation.z = Math.sin(i)*0.08;
      dummy.updateMatrix(); stems.setMatrixAt(i,dummy.matrix);
      dummy.position.y = 1.26; dummy.scale.set(0.12,0.31,0.12);
      dummy.updateMatrix(); ears.setMatrixAt(i,dummy.matrix);
    }
    group.add(stems,ears);
    group.userData.stems = stems; group.userData.ears = ears;
    return group;
  }
  if (kind === "wagon") {
    const wagon = new T.Group();
    for (const [w,h,l,x,y,z,color] of [
      [1.75,0.32,2.4,0,0.45,0,"#374854"], [1.65,0.9,2.1,0,1,0,"#cf5444"],
      [1.78,0.12,2.24,0,1.5,0,"#f1c062"], [0.15,0.13,1.1,0,0.5,-1.5,"#555f64"]
    ]) {
      const m = new T.Mesh(new T.BoxGeometry(w,h,l), standard(color));
      m.position.set(x,y,z); wagon.add(m);
    }
    for (const x of [-0.82,0.82]) for (const z of [-0.74,0.74]) {
      const wheel = new T.Mesh(new T.CylinderGeometry(0.29,0.29,0.17,12),standard("#29323a"));
      wheel.rotation.z = Math.PI/2;
      wheel.position.set(x,0.29,z); wagon.add(wheel);
    }
    return wagon;
  }
  if (kind === "hayCart") {
    const cart = new T.Group();
    const bed = new T.Mesh(new T.BoxGeometry(3.0,0.32,3.7), standard("#875334"));
    bed.position.y = 0.49;
    cart.add(bed);
    for (const x of [-1.4,1.4]) for (const z of [-1.6,1.6]) {
      const post = new T.Mesh(new T.BoxGeometry(0.12,1.3,0.12), standard("#eaca88"));
      post.position.set(x,0.99,z); cart.add(post);
    }
    const load = marker("bale");
    load.position.y = 0.63;
    cart.add(load);
    cart.userData.load = load;
    return cart;
  }
  if (kind === "bale") {
    const bale = new T.Group();
    const straw = new T.Mesh(new T.CylinderGeometry(0.91, 0.91, 2.2, 20), standard("#db9a3b"));
    straw.rotation.z = Math.PI / 2;
    straw.position.y = 0.92;
    bale.add(straw);
    for (const x of [-0.71, 0.71]) {
      const band = new T.Mesh(new T.TorusGeometry(0.91, 0.045, 5, 22), standard("#79613c"));
      band.rotation.y = Math.PI / 2;
      band.position.set(x, 0.92, 0);
      bale.add(band);
    }
    for (const radius of [0.28, 0.55, 0.77]) {
      const ring = new T.Mesh(new T.TorusGeometry(radius, 0.018, 4, 22), standard("#aa752c"));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(1.11, 0.92, 0);
      bale.add(ring);
      const left = ring.clone();
      left.position.x = -1.11;
      bale.add(left);
    }
    return bale;
  }
  if (kind === "ramp") return rampMesh();
  if (kind === "boost") return boostMesh();
  if (kind === "gift") return giftMesh();
  if (kind === "cone") {
    const root = new T.Group(),
      orange = standard("#f88939");
    const tip = new T.Mesh(cone, orange);
    tip.position.y = 0.5;
    root.add(tip);
    const band = new T.Mesh(
      new T.CylinderGeometry(0.12, 0.22, 0.19, 16),
      standard("#f6efe5"),
    );
    band.position.y = 0.56;
    root.add(band);
    const foot = new T.Mesh(new T.BoxGeometry(0.85, 0.1, 0.85), orange);
    foot.position.y = 0.05;
    root.add(foot);
    return root;
  }
  // Лужа: въезжать в неё весело, скорость не падает
  const m = new T.Mesh(
    disc,
    new T.MeshStandardMaterial({
      color: kind === "ice" ? "#c5f1ff" : "#49b6f2",
      metalness: 0.2,
      roughness: 0.12,
    }),
  );
  m.scale.set(1.5, 1, 1.15);
  return m;
}
function birdGeometry() {
  const g = new T.BufferGeometry();
  g.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      // Крылья в плоскости экрана: камера смотрит на птиц сзади
      [0, 0.22, 0, 0, -0.22, 0, -1, 0.42, 0, 0, 0.22, 0, 0, -0.22, 0, 1, 0.42, 0],
      3,
    ),
  );
  g.computeVertexNormals();
  return g;
}
export class DriveView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    // Нейтральная тональная кривая не выбеливает цвета, как киношная ACES
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x000000, 0);
    const studio = new RoomEnvironment(),
      pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(studio, 0.04);
    studio.dispose();
    pmrem.dispose();
    this.scene = new T.Scene();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.72;
    this.cam = new T.PerspectiveCamera(51, 0.7, 0.12, 470);
    this.mirrorCam = new T.PerspectiveCamera(52, 2.8, 0.12, 110);
    this.sun = setupLights(this.scene, true);
    this.mood = {
      k: 0,
      zenith: new T.Color(),
      horizon: new T.Color(),
      sunColor: new T.Color(),
      backdrop: new T.Color(),
      sun: 2.6,
      hemi: 1.55,
      env: 0.72,
      night: 0,
      wet: 0,
      rain: 0,
      lamps: 0,
    };
    this.scenery = new Scenery(this.scene);
    this.showroom = new T.Scene();
    this.showroom.environment = this.environment.texture;
    setupLights(this.showroom, false);
    this.orbitCamera = new T.PerspectiveCamera(32, 1, 0.1, 80);
    this.yaw = 0.8;
    this.orbitPointer = null;
    const base = new T.Mesh(
      new T.CylinderGeometry(1, 1, 0.1, 80),
      new T.MeshStandardMaterial({
        color: "#ffdf5c",
        metalness: 0.05,
        roughness: 0.55,
      }),
    );
    base.position.y = -0.075;
    this.showroom.add(base);
    this.platform = base;
    this.nodes = new Map();
    this.pool = new Map();
    this.selected = new Map();
    this.far = false;
    this.quality = Math.min(1.5, devicePixelRatio || 1);
    this.frameCount = 0;
    this.frameTotal = 0;
    this.shadowFrame = 0;
    this.smoothX = 0;
    this.cameraInitialized = false;
    this.temp = new T.Object3D();
    this.color = new T.Color();
    this.look = new T.Vector3();
    this.point = new T.Vector3();
    this.shotMeshes = shotMeshes();
    this.scene.add(...Object.values(this.shotMeshes));
    this.birds = new T.InstancedMesh(
      birdGeometry(),
      new T.MeshBasicMaterial({ color: "#ffffff", side: T.DoubleSide }),
      24,
    );
    this.birds.count = 0;
    this.birds.frustumCulled = false;
    this.scene.add(this.birds);
    this.sparks = new T.InstancedMesh(
      new T.OctahedronGeometry(1),
      new T.MeshBasicMaterial({ toneMapped: false }),
      300,
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.blasts = new Blasts(this.scene);
    // Полосы скорости по краям кадра
    this.streaks = new T.InstancedMesh(
      new T.BoxGeometry(0.035, 0.035, 1),
      new T.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        toneMapped: false,
      }),
      36,
    );
    this.streaks.frustumCulled = false;
    this.streaks.count = 0;
    this.scene.add(this.streaks);
    const streakRng = seeded(77);
    this.streakSeeds = Array.from({ length: 36 }, (_, i) => [
      (i % 2 ? 1 : -1) * (3.2 + streakRng() * 6.5),
      0.5 + streakRng() * 5.5,
      streakRng() * 60,
    ]);
    this.flash = new T.Mesh(
      sphere,
      new T.MeshBasicMaterial({ color: "#fff0a8" }),
    );
    this.scene.add(this.flash);
    this.ghostMaterial = new T.MeshStandardMaterial({
      color: "#96e6fa",
      metalness: 0.3,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.exhaust = new T.Group();
    for (const side of [-1, 1]) {
      const flame = new T.Mesh(
        sphere,
        new T.MeshBasicMaterial({ color: "#ff8a1e", toneMapped: false }),
      );
      flame.position.x = side * 0.62;
      flame.scale.set(0.17, 0.15, 0.32);
      this.exhaust.add(flame);
    }
    this.scene.add(this.exhaust);
    this.aura = new T.Mesh(
      sphere,
      new T.MeshBasicMaterial({
        color: "#72e9ff",
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    this.water = new T.Mesh(
      new T.CylinderGeometry(0.27, 0.12, 1, 12),
      new T.MeshBasicMaterial({
        color: "#98edff",
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
    );
    this.streamTip = new T.Vector3();
    this.streamEnd = new T.Vector3();
    this.streamDir = new T.Vector3();
    this.streamAxis = new T.Vector3(0,1,0);
    this.spray = new T.InstancedMesh(new T.SphereGeometry(0.085,6,5),
      new T.MeshBasicMaterial({color:"#d9ffff"}),18);
    this.spray.frustumCulled = false;
    this.scene.add(this.aura, this.water, this.spray);
    this.pullOverBay = new T.Mesh(new T.PlaneGeometry(3.8, 13),
      new T.MeshBasicMaterial({color: "#57edb7", transparent: true, opacity: 0.64, depthWrite: false}));
    this.pullOverBay.rotation.x = -Math.PI / 2;
    this.scene.add(this.pullOverBay);
    this.carpet = new T.Mesh(new T.PlaneGeometry(3.1, 21),
      new T.MeshStandardMaterial({color:"#b62638", roughness:0.88}));
    this.carpet.rotation.x = -Math.PI / 2;
    this.scene.add(this.carpet);
    this.rings = [];
    this.hook = new T.Line(
      new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]),
      new T.LineBasicMaterial({ color: "#ffd254" }),
    );
    this.scene.add(this.hook);
    // Настоящий свет фар и видимые лучи: включаются ночью, в дождь и в туннелях
    this.headlight = new T.SpotLight("#fff1cf", 0, 70, 0.62, 0.55, 1.1);
    this.scene.add(this.headlight, this.headlight.target);
    const beamTexture = new T.CanvasTexture(
      (() => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 128;
        const g = c.getContext("2d");
        // Сжатый по ширине градиент гаснет раньше краёв квадрата
        g.setTransform(0.44, 0, 0, 1, 32 * 0.56, 0);
        const grad = g.createRadialGradient(32, 100, 2, 32, 74, 70);
        grad.addColorStop(0, "rgba(255,244,214,.95)");
        grad.addColorStop(0.45, "rgba(255,244,214,.42)");
        grad.addColorStop(1, "rgba(255,244,214,0)");
        g.fillStyle = grad;
        g.fillRect(-64, 0, 192, 128);
        return c;
      })(),
    );
    const beamGeo = new T.PlaneGeometry(5.2, 17);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, -7.6);
    this.beamMat = new T.MeshBasicMaterial({
      map: beamTexture,
      transparent: true,
      opacity: 0,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,
    });
    this.beams = new T.Group();
    for (const s of [-1, 1]) {
      const beam = new T.Mesh(beamGeo, this.beamMat);
      beam.userData.side = s;
      beam.frustumCulled = false;
      this.beams.add(beam);
    }
    this.scene.add(this.beams);
    // Дождь: короткие штрихи вокруг камеры
    const rainRng = seeded(91),
      rainCount = 280;
    this.rainSeeds = Array.from({ length: rainCount }, () => [
      (rainRng() - 0.5) * 30,
      rainRng() * 16,
      rainRng() * 46 - 30,
    ]);
    const rainGeo = new T.BufferGeometry();
    rainGeo.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(rainCount * 6), 3).setUsage(T.DynamicDrawUsage),
    );
    this.rain = new T.LineSegments(
      rainGeo,
      new T.LineBasicMaterial({ color: "#d7e8f5", transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    // Вертолёт, теплоход и поезд
    this.heli = helicopter();
    this.heli.visible = false;
    this.scene.add(this.heli);
    this.wash = washRollers();
    this.wash.visible = false;
    this.scene.add(this.wash);
    this.zoo = new Map();
    // Подводный туннель: стая рыб и кит над стеклянной трубой
    this.fish = new T.InstancedMesh(
      fishGeometry(),
      new T.MeshStandardMaterial({ roughness: 0.45 }),
      42,
    );
    this.fish.frustumCulled = false;
    this.fish.visible = false;
    const fishRng = seeded(47),
      fishColors = ["#ff8a3c", "#ffd23f", "#ff5f8f", "#4fe0d0", "#ffffff", "#b57bff"];
    this.fishSeeds = Array.from({ length: 42 }, (_, i) => {
      this.fish.setColorAt(i, this.color.set(fishColors[i % 6]));
      return {
        s: fishRng() * 128,
        side: i % 2 ? 1 : -1,
        lateral: 12 + fishRng() * 34,
        y: 1.5 + fishRng(),
        phase: fishRng() * 6.28,
        size: 0.8 + fishRng() * 1.1,
      };
    });
    this.fish.instanceColor.needsUpdate = true;
    this.scene.add(this.fish);
    this.whale = whaleModel();
    this.whale.visible = false;
    this.scene.add(this.whale);
    this.ship = shipModel();
    this.ship.visible = false;
    this.ship.rotation.y = Math.PI / 2;
    this.scene.add(this.ship);
    const snowPositions = new Float32Array(260 * 3);
    const rng = seeded(23);
    for (let i = 0; i < 260; i++) {
      snowPositions[i * 3] = (rng() - 0.5) * 27;
      snowPositions[i * 3 + 1] = rng() * 15;
      snowPositions[i * 3 + 2] = rng() * 65 - 53;
    }
    this.snowBase = snowPositions.slice();
    const snowGeo = new T.BufferGeometry();
    snowGeo.setAttribute("position", new T.BufferAttribute(snowPositions, 3));
    this.snow = new T.Points(
      snowGeo,
      new T.PointsMaterial({ color: "#ffffff", size: 0.075 }),
    );
    this.scene.add(this.snow);
  }
  size(w, h, dpr) {
    if (this.width === w && this.height === h && this.dpr === dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
  }
  selection(type) {
    if (!this.selected.has(type)) {
      // Своя копия краски: встречные машины той же модели не перекрашиваются
      const model = vehicle(type),
        paints = new Map();
      const own = (n, flag) => {
        if (!n.material.userData[flag]) return;
        if (!paints.has(n.material)) {
          const m = n.material.clone();
          m.userData.base = m.color.getHex();
          m.userData.baseMetal = m.metalness;
          m.userData.baseRough = m.roughness;
          paints.set(n.material, m);
        }
        n.material = paints.get(n.material);
      };
      model.traverse((n) => {
        if (!n.isMesh) return;
        own(n, "isPaint");
        own(n, "isRim");
      });
      const owned = [...paints.values()];
      model.userData.paints = owned.filter((m) => m.userData.isPaint);
      model.userData.rims = owned.filter((m) => m.userData.isRim);
      addBeaconBar(model);
      this.selected.set(type, model);
      this.setPaint(type, this.paintOf?.(type));
      this.setRims(type, this.rimOf?.(type));
      this.setBeacon(type, this.beaconOf?.(type));
    }
    return this.selected.get(type);
  }
  setPaint(type, spec) {
    if (!this.selected.has(type)) return;
    for (const m of this.selected.get(type).userData.paints) {
      if (spec?.color) m.color.set(spec.color);
      else m.color.setHex(m.userData.base);
      if (spec?.color && !spec.metal)
        m.color.multiplyScalar(m.userData.shade ?? 1);
      // Золото и хром настоящие: металл с отражениями
      m.metalness = spec?.metal ? 0.95 : m.userData.baseMetal;
      m.roughness = spec?.metal ? 0.24 : m.userData.baseRough;
    }
  }
  refreshDetail() {
    for (const type of forgetConceptCars()) this.selected.delete(type);
    this.showCar = null;
  }
  setRims(type, color) {
    if (!this.selected.has(type)) return;
    for (const m of this.selected.get(type).userData.rims)
      color ? m.color.set(color) : m.color.setHex(m.userData.base);
  }
  setBeacon(type, on) {
    if (!this.selected.has(type)) return;
    this.selected.get(type).userData.parts.addonBeacon.visible = !!on;
  }
  // Небо за заезд плавно проходит через несколько настроений
  updateMood(game) {
    const list = game.moods || ["day"],
      p = Math.min(1, game.runTime / MOOD_TIME) * (list.length - 1),
      i = Math.min(list.length - 2, Math.floor(p)),
      a = MOODS[list[Math.max(0, i)]],
      b = MOODS[list[Math.max(0, i) + (list.length > 1 ? 1 : 0)]],
      raw = list.length > 1 ? p - Math.max(0, i) : 0,
      f = raw * raw * (3 - 2 * raw),
      m = this.mood;
    for (const key of ["k", "sun", "hemi", "env", "night", "wet", "rain", "lamps"])
      m[key] = a[key] + (b[key] - a[key]) * f;
    m.zenith.copy(a.zenith).lerp(b.zenith, f);
    m.horizon.copy(a.horizon).lerp(b.horizon, f);
    m.sunColor.copy(a.sunColor).lerp(b.sunColor, f);
    m.backdrop.copy(a.backdropTint).lerp(b.backdropTint, f);
    this.rainNow = m.rain;
    return m;
  }
  // Миниатюра для карточки: та же модель, что поедет по дороге
  thumbnail(canvas, type) {
    this.platform.visible = false;
    const yaw = this.yaw;
    this.yaw = 0.72;
    this.preview(canvas, type, 0);
    this.yaw = yaw;
    this.platform.visible = true;
  }
  preview(canvas, type, time) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const w = Math.round(box.width),
      h = Math.round(box.height);
    this.size(w, h, Math.min(this.quality, 1.5));
    const model = this.selection(type);
    this.setGhost(model, false);
    if (this.showCar !== model) {
      this.showCar?.removeFromParent();
      this.showCar = model;
      this.showroom.add(model);
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.scale.setScalar(1);
      const bounds = new T.Box3().setFromObject(model);
      this.modelSize = bounds.getSize(new T.Vector3());
      this.modelCenter = bounds.getCenter(new T.Vector3());
      model.position.set(-this.modelCenter.x, 0, -this.modelCenter.z);
      this.platform.scale.set(
        this.modelSize.z * 0.61,
        1,
        this.modelSize.z * 0.61,
      );
    }
    pose(model, type, time, 0, "", 0, 0);
    this.orbitCamera.aspect = w / h;
    this.orbitCamera.updateProjectionMatrix();
    const size = this.modelSize,
      dist =
        Math.max(size.z / (w / h), size.z * 0.45 + size.y * 0.35) *
        2.25;
    const angle = this.yaw;
    this.orbitCamera.position.set(
      Math.sin(angle) * dist,
      size.y * 0.5 + dist * 0.34,
      -Math.cos(angle) * dist,
    );
    this.orbitCamera.lookAt(0, this.modelCenter.y * 0.82, 0);
    this.renderer.render(this.showroom, this.orbitCamera);
    if (
      canvas.width !== this.canvas.width ||
      canvas.height !== this.canvas.height
    ) {
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
    }
    const g = canvas.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(this.canvas, 0, 0);
  }
  adapt(elapsed) {
    if (elapsed <= 0 || elapsed > 0.3) return;
    this.frameTotal += elapsed;
    this.frameCount++;
    if (this.frameCount < 36) return;
    const mean = this.frameTotal / this.frameCount;
    if (mean > 1 / 30) this.quality = Math.max(0.68, this.quality * 0.82);
    else if (mean < 1 / 58)
      this.quality = Math.min(1.5, devicePixelRatio || 1, this.quality + 0.06);
    this.frameTotal = this.frameCount = 0;
  }
  // Отражения на кузове — небо и земля своей трассы, а не серая студия
  skyEnvironment(world) {
    this.skyMaps = this.skyMaps || new Map();
    if (this.skyMaps.has(world)) return this.skyMaps.get(world);
    const [top, horizon, ground] = skyColors(world),
      a = new T.Color(top),
      h = new T.Color(horizon),
      g = new T.Color(ground),
      dome = new T.SphereGeometry(50, 24, 16),
      pos = dome.attributes.position,
      colors = new Float32Array(pos.count * 3),
      c = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y >= 0) c.copy(h).lerp(a, y ** 0.55);
      else c.copy(g).multiplyScalar(0.85);
      colors.set([c.r * 1.25, c.g * 1.25, c.b * 1.25], i * 3);
    }
    dome.setAttribute("color", new T.BufferAttribute(colors, 3));
    const scene = new T.Scene();
    scene.add(
      new T.Mesh(
        dome,
        new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, toneMapped: false }),
      ),
    );
    // Солнце и облака дают живые блики
    const sun = new T.Mesh(sphere, new T.MeshBasicMaterial({ toneMapped: false }));
    sun.material.color.setRGB(30, 26, 20);
    sun.position.set(-19, 20, -42);
    sun.scale.setScalar(3.4);
    scene.add(sun);
    for (let i = 0; i < 9; i++) {
      const cloud = new T.Mesh(sphere, new T.MeshBasicMaterial({ toneMapped: false }));
      cloud.material.color.setRGB(2.6, 2.6, 2.7);
      const t = i * 0.7;
      cloud.position.set(Math.cos(t) * 40, 14 + (i % 3) * 8, Math.sin(t) * 40);
      cloud.scale.set(8 + (i % 4) * 2, 2, 5);
      scene.add(cloud);
    }
    const pmrem = new T.PMREMGenerator(this.renderer),
      map = pmrem.fromScene(scene, 0.015).texture;
    pmrem.dispose();
    dome.dispose();
    this.skyMaps.set(world, map);
    return map;
  }
  begin(world) {
    this.scene.environment = this.skyEnvironment(world);
    this.scenery.reset(world);
    this.cameraInitialized = false;
    this.player?.removeFromParent();
    this.player = null;
    this.showCar = null;
    this.clearObjects();
    this.blasts.clear();
    this.lastTravel = 0;
  }
  clearObjects() {
    for (const [e, node] of this.nodes) this.recycle(e, node);
  }
  recycle(e, node) {
    if (node.userData.squashed) {
      node.userData.squashed = false;
      node.scale.setScalar(1);
    }
    node.removeFromParent();
    this.nodes.delete(e);
    const key = node.userData.poolKey;
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key).push(node);
  }
  getObject(e, z) {
    const distant = carLike(e) && Math.abs(z) > 36;
    const key =
      carLike(e)
        ? "car:" + e.type + (distant ? "-lod" : "")
        : e.look || e.kind;
    const old = this.nodes.get(e);
    if (old?.userData.poolKey === key) return old;
    if (old) this.recycle(e, old);
    const node =
      this.pool.get(key)?.pop() ||
      (carLike(e) ? vehicle(e.type, distant || "traffic") : marker(e.look || e.kind));
    node.userData.poolKey = key;
    this.nodes.set(e, node);
    this.scene.add(node);
    return node;
  }
  nextSignal(from) {
    return nextSignal(from);
  }
  zone(d) {
    return zoneAt(d);
  }
  leaping(d) {
    return leapAt(d);
  }
  loopAt(d) {
    return loopAt(d);
  }
  loopAhead(from, to) {
    return loopAhead(from, to);
  }
  washing(d) {
    return pitAt(d);
  }
  slope(d) {
    return riseSlope(d);
  }
  hill(d) {
    return onHill(d);
  }
  nearLeap(d) {
    return leapNear(d);
  }
  // Высота дороги в этой точке относительно машины: на мосту дорога поднимается
  roadLift(z, d) {
    return rise(d - z) - rise(d);
  }
  roadPosition(x, z, d) {
    return (x - 300) / 30 + bend(d - z) - bend(d);
  }
  setGhost(model, enabled) {
    if (!!model.userData.ghost === enabled) return;
    model.userData.ghost = enabled;
    model.traverse((part) => {
      if (!part.isMesh) return;
      if (enabled) {
        part.userData.opaqueMaterial = part.material;
        part.material = this.ghostMaterial;
      } else if (part.userData.opaqueMaterial) {
        part.material = part.userData.opaqueMaterial;
        delete part.userData.opaqueMaterial;
      }
    });
  }
  drive(game, fx, dt) {
    const screen = this.canvas.getBoundingClientRect();
    if (!screen.width || !screen.height) return;
    this.size(
      Math.round(screen.width),
      Math.round(screen.height),
      this.quality,
    );
    const car = game.car,
      d =
        game.distance / UNITS_PER_METRE +
        (game.h * 0.73 - car.y) / UNITS_PER_METRE,
      px = (car.x - 300) / 30;
    const mood = this.updateMood(game);
    this.scenery.update(d, game.world, game.previousWorld, game.worldFade, mood, game.city);
    // В туннеле солнца нет: светят только лампы, на выходе снова ярко
    const dark = tunnelAmount(d);
    this.sun.intensity = mood.sun * (1 - 0.92 * dark);
    this.sun.color.copy(mood.sunColor);
    this.sun.userData.hemi.intensity = mood.hemi * (1 - 0.5 * dark);
    this.scene.environmentIntensity = mood.env * (1 - 0.5 * dark);
    const lamps = Math.max(mood.lamps, dark);
    setCarLamps(lamps);
    const pitch = Math.atan(riseSlope(d));
    const player = this.selection(car.type);
    if (this.player !== player) {
      this.player?.removeFromParent();
      this.player = player;
      this.scene.add(player);
    }
    // Трамплин: дуга по высоте, нос вверх и вниз, у лёгких машин — бочка вокруг центра
    const flying = car.air > 0,
      flight = flying ? 1 - car.air / car.airMax : 0,
      spin = flying ? flight * Math.PI * 2 * (car.spin || 0) : 0,
      pivot = 0.75;
    const lift = Math.max(
      fx === "jump"
        ? Math.sin((1 - game.active / CARS[car.type].duration) * Math.PI) * 2.8
        : 0,
      flying ? Math.sin(flight * Math.PI) * car.airLift : 0,
      fx === "fly"
        ? Math.min(
            1,
            game.active * 3,
            (CARS[car.type].duration - game.active) * 3,
          ) * 2.5
        : 0,
    );
    player.position.set(
      px + Math.sin(spin) * pivot,
      lift + 0.018 + Math.sin(d * 2.8) * 0.012 + pivot * (1 - Math.cos(spin)),
      0,
    );
    player.rotation.set(
      pitch + (flying ? Math.cos(flight * Math.PI) * 0.22 : 0),
      heading(d) - car.angle * 1.25,
      spin - car.angle * (car.type === "bike" ? 1.5 : 0.42),
    );
    if (fx === "wheelie") {
      const pitchUp = 0.53 * Math.min(1, game.active * 3, (CARS.bike.duration - game.active) * 3);
      player.rotation.x += pitchUp;
      player.position.y += Math.sin(pitchUp) * 0.85;
    }
    // Петля: машина идёт по кругу, дорога в это время стоит
    const looping = game.loop,
      // Камера уходит вбок: так петлю и машину на ней видно целиком
      loopK = looping
        ? Math.min(1, looping.theta / 0.55, (Math.PI * 2 - looping.theta) / 0.55)
        : 0;
    if (looping) {
      player.position.y += LOOP_RADIUS * (1 - Math.cos(looping.theta));
      player.position.z = -LOOP_RADIUS * Math.sin(looping.theta);
      player.rotation.x += looping.theta;
    }
    player.scale.setScalar(fx === "mini" ? 0.52 : fx === "monster" ? 1.25 : 1);
    this.setGhost(player, fx === "ghost");
    if (player.userData.parts.blob)
      player.userData.parts.blob.visible =
        lift < 0.25 && !leapAt(d) && !game.loop;
    // Размеры машины нужны камере и огню из выхлопа
    if (this.cameraFor !== car.type) {
      this.cameraFor = car.type;
      const box = new T.Box3().setFromObject(player).getSize(this.point);
      this.playerHeight = box.y;
      this.playerLength = box.z;
      this.playerWidth = box.x;
      const bounds = new T.Box3().setFromObject(player);
      this.playerTail = bounds.max.z;
      // Снаряд вылетает из носа машины на высоте её кузова, у танка из дула
      this.muzzleAhead = (-bounds.min.z + 0.1) * UNITS_PER_METRE;
      this.muzzleAlt = car.type === "tank" ? 1.77 : T.MathUtils.clamp(bounds.max.y * 0.5, 0.75, 1.9);
    }
    car.muzzleAhead = this.muzzleAhead;
    this.exhaust.visible =
      (["nitro", "comet", "wind", "steamroll"].includes(fx) || car.boost > 0 || (car.flare > 0 && !car.air)) && !game.loop;
    this.exhaust.position.set(px, 0.4 + lift, this.playerTail + 0.1);
    this.exhaust.scale.z = 1 + Math.sin(game.time * 30) * 0.18;
    const stroke = fx === "plow" ? 1 - game.active / CARS.tractor.duration : 0;
    pose(player, car.type, game.time, d, fx, car.angle, car.recoil, stroke);
    const pullOver = ["chase", "pursue", "pullOver"].includes(game.city?.phase);
    this.carpet.visible = fx === "carpet";
    if (this.carpet.visible) {
      this.carpet.position.set(this.roadPosition(car.carpetX, -9, d), this.roadLift(-9, d) + 0.13, -9);
      this.carpet.rotation.z = heading(d + 9);
    }
    this.pullOverBay.visible = pullOver;
    if (pullOver) {
      const z = game.city.phase === "pullOver" ? -2 : -15;
      this.pullOverBay.position.set(this.roadPosition(483, z, d), this.roadLift(z, d) + 0.15, z);
      this.pullOverBay.rotation.set(-Math.PI/2 + Math.atan(riseSlope(d-z)),0,heading(d-z));
    }
    const activeEntities = new Set(game.entities);
    for (const [key, node] of this.nodes)
      if (!activeEntities.has(key)) this.recycle(key, node);
    for (const e of game.entities) {
      const z = (e.y - car.y) / UNITS_PER_METRE,
        node = this.getObject(e, z);
      node.position.set(
        this.roadPosition(e.x, z, d),
        e.kind === "star"
          ? (e.alt || e.air || 0.98) +
              0.16 * Math.sin(game.time * 3 + e.phase) +
              this.roadLift(z, d)
          : (e.alt || 0) + 0.018 + this.roadLift(z, d),
        z,
      );
      if (e.ring !== undefined) {
        // Звёзды висят внутри петли и ждут машину
        const r = LOOP_RADIUS - 0.98;
        node.position.y =
          LOOP_RADIUS - r * Math.cos(e.ring) + this.roadLift(z, d);
        node.position.z = z - r * Math.sin(e.ring);
      }
      if (e.kind === "star") {
        node.rotation.y = game.time * 1.7 + e.phase;
        node.scale.setScalar(e.big ? 1.8 : 1);
      } else
        node.rotation.set(
          (e.spin || 0) + Math.atan(riseSlope(d - z)),
          e.kind === "gift"
            ? game.time * 0.9
            : heading(d - z) - (e.drift || 0),
          e.kind === "bale" ? 0 : (e.spin || 0) * 0.6 + (e.kick || 0) * (e.pushSide || 0) * 0.15,
        );
      // Блин после катка: плоский, чуть шире самой машины, летит вращаясь, как тарелка
      if (e.squash) {
        const k = Math.min(1, e.squash / 0.08);
        node.scale.set(1 + 0.16 * k, 1 - 0.86 * k, 1 + 0.1 * k);
        node.rotation.set(0.2 * k, heading(d - z) + e.spin, 0.3 * Math.sign(e.vx) * Math.min(1, e.alt));
        node.userData.squashed = true;
      }
      if (e.kind === "brazier") {
        const flame = node.userData.flames;
        flame.visible = !e.spent;
        flame.scale.setScalar(e.heat);
        flame.scale.y *= 1 + 0.09 * Math.sin(game.time * 13);
      }
      if (e.kind === "crop") {
        node.userData.ears.visible = !e.spent;
        node.userData.stems.scale.y = e.spent ? 0.14 : 1;
      }
      if (e.kind === "hayCart") node.userData.load.visible = !!e.loaded;
      if (e.kind === "gift") node.userData.chute.visible = (e.alt || 0) > 0.4;
      if (carLike(e)) {
        pose(node, e.type, game.time, d * 0.28, e.kind === "patrolActor" && e.type === "police" ? "siren" : "", 0, 0);
        if (node.userData.parts.blob)
          node.userData.parts.blob.visible = !leapAt(d - z) && !e.alt;
        node.visible = z < 13;
      } else node.visible = true;
    }
    this.drawEffects(game, fx, d);
    // Дым ночью и в туннеле темнее, огонь светит сам
    this.blasts.update(game, d, dt, (1 - 0.62 * mood.night) * (1 - 0.5 * dark), this.quality < 1);
    this.drawLights(game, player, px, lift, lamps, d);
    this.drawRain(game, d, mood.rain * (1 - dark));
    this.drawMovers(game, d);
    this.drawSea(game, d, dark);
    this.drawAnimals(game, d);
    this.cam.aspect = screen.width / screen.height;
    const long = Math.max(0, this.playerLength - 5.2) * 0.85;
    // Высокая машина не должна закрывать дорогу: камера отходит и поднимается
    const tall = Math.max(0, this.playerHeight - 1.25),
      distance = (this.far ? 13.3 : 8.6) + long + tall * 1.5,
      height =
        (this.far ? 5.35 : 3.4) + long * 0.6 + tall * 1.25 + lift * 0.45;
    const cameraLift =
      this.roadLift(distance, d) + loopK * (LOOP_RADIUS * 0.95 - height);
    const smooth = this.cameraInitialized
      ? 1 - Math.exp(-Math.max(dt, 0) * (looping ? 14 : 6))
      : 1;
    const patrolX = pullOver ? (game.city.npc.x - 300) / 30 : px;
    const followX = pullOver ? (px + patrolX) / 2 : px * 0.76;
    this.smoothX = T.MathUtils.lerp(this.smoothX, followX, smooth);
    const shoulder = car.type === "tractor" ? 3.6 + 4.2 * bladeExtension(stroke) : TOOL_CAMERA_OFFSET[fx] || 0;
    const cameraZ = (distance + (pullOver ? 3.5 : 0)) * (1 - loopK);
    this.point.set(
      this.roadPosition(300, cameraZ, d) +
        this.smoothX +
        (car.type === "truck" ? 1.1 : 0) + shoulder * (1 - loopK),
      height + cameraLift + shoulder * 0.47 + (pullOver ? 1.15 : 0),
      cameraZ,
    );
    this.point.x += loopK * 25;
    this.cam.position.lerp(this.point, smooth);
    this.look.set(
      this.roadPosition(300, -18, d) + this.smoothX * 0.68,
      1.2 + this.roadLift(-18, d),
      -18,
    );
    if (shoulder) {
      this.look.x = this.roadPosition(300, -8, d) + px * 0.8;
      this.look.y = 0.8 + this.roadLift(-8, d);
      this.look.z = -8;
    }
    if (looping) {
      this.look.x += loopK * (px - this.look.x);
      this.look.y += loopK * (LOOP_RADIUS - this.look.y);
      this.look.z += loopK * (0 - this.look.z);
    }
    this.cam.lookAt(this.look);
    // Чем быстрее едем, тем шире кадр, а в поворотах камера чуть заваливается
    const rush = T.MathUtils.clamp((game.speedNow - 600) / 500, 0, 1);
    this.cam.fov = T.MathUtils.lerp(this.cam.fov, 51 + rush * 19, smooth);
    this.cam.updateProjectionMatrix();
    this.cam.rotateZ(
      car.angle * 0.14 + Math.sin(game.time * 47) * game.shake * 0.022,
    );
    this.cam.rotateX(Math.cos(game.time * 41) * game.shake * 0.014);
    this.drawStreaks(game, rush);
    boostGlow.color.setHSL(0.52 + Math.sin(game.time * 9) * 0.04, 1, 0.56);
    this.cameraInitialized = true;
    this.renderer.shadowMap.needsUpdate =
      this.shadowFrame++ % (this.quality < 1 ? 5 : 2) === 0;
    // Вспышка взрыва на мгновение осветляет весь кадр
    this.renderer.toneMappingExposure = 1 + this.blasts.flash;
    this.renderer.render(this.scene, this.cam);
    this.renderer.toneMappingExposure = 1;
    this.drawMirror(game, px, d, screen);
  }
  drawMirror(game, px, d, screen) {
    const frame = document.getElementById("patrol-mirror");
    // В зеркале видно патруль задания или полицию, которая гонится за стрелком
    const chaser = game.chase?.car || (game.city?.phase === "chase" ? game.city.npc : null),
      behind = chaser ? chaser.y - game.car.y : 0;
    const npc = chaser && this.nodes.get(chaser),
      rear = npc && !game.finished && !game.loop && behind > 68 && behind < 1700;
    frame.hidden = !rear;
    frame.classList.toggle("alarm", !!game.chase);
    if (!rear) return;
    const box = frame.getBoundingClientRect(), cam = this.mirrorCam;
    cam.aspect = box.width / box.height;
    cam.position.set(px, 2.65, 2.95);
    const z = behind / UNITS_PER_METRE;
    cam.lookAt(this.roadPosition(chaser.x, z, d), this.roadLift(z,d) + 1, z);
    cam.updateProjectionMatrix();
    const x = box.left - screen.left, y = screen.bottom - box.bottom;
    const visible = npc.visible;
    npc.visible = true;
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(x,y,box.width,box.height);
    this.renderer.setViewport(x,y,box.width,box.height);
    this.renderer.render(this.scene,cam);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0,0,screen.width,screen.height);
    npc.visible = visible;
  }
  drawLights(game, player, px, lift, lamps, d) {
    const on = lamps > 0.04 && !game.loop,
      yaw = player.rotation.y,
      nose = -this.playerLength * 0.5,
      y = lift + 0.75;
    this.headlight.intensity = on ? 90 * lamps : 0;
    this.headlight.position.set(px, y + 0.25, nose);
    this.headlight.target.position.set(
      px - Math.sin(yaw) * 26,
      this.roadLift(-26, d),
      nose - 26,
    );
    this.beamMat.opacity = on ? 0.5 * lamps : 0;
    this.beams.visible = on;
    if (on) {
      // Пятно лежит на дороге, в прыжке оно не летит вместе с машиной
      this.beams.position.set(px, 0.09 + this.roadLift(-7, d) * 0.5, nose);
      this.beams.rotation.set(Math.atan(riseSlope(d)), yaw, 0);
      this.beams.visible = lift < 0.6 && !leapAt(d);
      for (const beam of this.beams.children)
        beam.position.x = beam.userData.side * this.playerWidth * 0.32;
    }
  }
  drawRain(game, d, amount) {
    this.rain.visible = amount > 0.03;
    if (!this.rain.visible) return;
    const a = this.rain.geometry.attributes.position,
      count = Math.round(this.rainSeeds.length * amount),
      fall = game.time * 34,
      drift = d * 1.2;
    this.rain.geometry.setDrawRange(0, count * 2);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = this.rainSeeds[i],
        h = 16 - ((y + fall) % 16),
        zz = ((z + 30 + drift) % 46) - 30;
      a.setXYZ(i * 2, this.cam.position.x + x, h, zz);
      a.setXYZ(i * 2 + 1, this.cam.position.x + x, h + 0.75, zz - 0.42);
    }
    a.needsUpdate = true;
  }
  drawSea(game, d, dark) {
    const start = game.world === 4 && dark > 0 ? tunnelStart(d) : null,
      on = start !== null;
    this.fish.visible = this.whale.visible = on;
    if (!on) return;
    const here = bend(d),
      t = game.time;
    this.fishSeeds.forEach((f, i) => {
      const s = start + f.s,
        z = d - s,
        sway = Math.sin(t * 0.55 + f.phase),
        room = 1 - (f.lateral / 64) ** 2.2;
      this.temp.position.set(
        bend(s) - here + f.side * (f.lateral + sway * 5),
        f.y + (Math.sin(t * 0.4 + f.phase * 2) * 0.5 + 0.5) * 22 * room,
        z,
      );
      this.temp.rotation.set(0, Math.cos(t * 0.55 + f.phase) * f.side > 0 ? -1.57 : 1.57, 0);
      this.temp.scale.setScalar(f.size);
      this.temp.updateMatrix();
      this.fish.setMatrixAt(i, this.temp.matrix);
    });
    this.temp.rotation.set(0, 0, 0);
    this.fish.instanceMatrix.needsUpdate = true;
    const mid = start + TILE,
      swim = t * 0.28;
    this.whale.position.set(
      bend(mid) - here + Math.sin(swim) * 26,
      21 + Math.sin(t * 0.7) * 1.6,
      d - mid,
    );
    this.whale.rotation.set(0, Math.cos(swim) > 0 ? -1.57 : 1.57, Math.sin(t * 0.7) * 0.05);
  }
  // Звери стоят у дороги: подпрыгивают рядом с машиной и радуются гудку
  drawAnimals(game, d) {
    const used = new Map(),
      kinds = WORLD_ANIMALS[game.world],
      base = Math.floor(d / TILE),
      horn = game.time - (game.hornAt ?? -9),
      here = bend(d),
      level = rise(d);
    for (let i = base; i <= base + 2; i++) {
      if (!openGround(i)) continue;
      for (let k = 0; k < 3; k++) {
        const roll = Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1,
          s = i * TILE + 8 + k * 20,
          z = d - s;
        if (z > 11) continue;
        const kind = kinds[(i + k) % kinds.length],
          side = roll > 0.5 ? 1 : -1,
          index = used.get(kind) || 0;
        used.set(kind, index + 1);
        if (!this.zoo.has(kind)) this.zoo.set(kind, []);
        const pool = this.zoo.get(kind);
        if (!pool[index]) {
          const first = pool[0] || animalModel(kind),
            node = pool[0] ? first.clone(true) : first;
          node.traverse((n) => {
            if (n.isMesh) n.castShadow = true;
          });
          this.scene.add(node);
          pool[index] = node;
        }
        const node = pool[index],
          near = Math.abs(z) < 34 ? 1 : 0,
          phase = game.time * 9 + roll * 20,
          cheer =
            horn < 1.8 ? Math.abs(Math.sin(horn * 7)) * 1.5 * (1 - horn / 1.8) : 0,
          hop = Math.max(cheer, near * Math.abs(Math.sin(phase)) * 0.32);
        node.visible = true;
        node.position.set(
          bend(s) - here + side * (10.2 + roll * 2.2),
          rise(s) - level + hop,
          z,
        );
        node.rotation.y = side * (Math.PI / 2) + side * 0.45;
        const moving = node.children[node.children.length - 1].children;
        for (let m = 0; m < moving.length; m++)
          moving[m].rotation.z =
            Math.sin(phase * 1.3 + m) * (moving[m].name === "wave" ? 0.9 : 0.4);
      }
    }
    for (const [kind, pool] of this.zoo) {
      const count = used.get(kind) || 0;
      for (let i = count; i < pool.length; i++) pool[i].visible = false;
    }
  }
  // Корабль и поезд приезжают к середине моста вместе с машиной
  drawMovers(game, d) {
    const washAt = washNear(d);
    this.wash.visible = washAt !== null && Math.abs(washAt - d) < 170;
    if (this.wash.visible) {
      this.wash.position.set(bend(washAt) - bend(d), -rise(d), d - washAt);
      for (const r of this.wash.userData.rollers) {
        if (r.horizontal) {
          r.group.rotation.set(0, 0, Math.PI / 2);
          r.group.rotateY(game.time * 11);
        } else r.group.rotation.y = game.time * 13;
      }
    }
    const near = bridgeNear(d),
      show = !!near && Math.abs(near.mid - d) < 260,
      shipOn = show && near.broken && SHIP_WORLDS.includes(game.world),
      trainOn = show && !near.broken;
    this.ship.visible = shipOn;
    if (trainOn && !this.trainSet) {
      this.trainSet = trainModel();
      this.trainSet.rotation.y = Math.PI / 2;
      this.scene.add(this.trainSet);
    }
    if (this.trainSet) this.trainSet.visible = trainOn;
    if (!show) return;
    const z = d - near.mid,
      base = bend(near.mid) - bend(d),
      y = -rise(d);
    // Теплоход виден сбоку на подъезде и проходит под разрывом в момент прыжка
    if (shipOn) this.ship.position.set(base - (z + 16) * 0.55, y - 11, z);
    if (trainOn) {
      // Длинный состав виден по бокам на подъезде и проходит точно под машиной
      this.trainSet.position.set(base - z * 0.55 - 42, y - 4.65, z);
      const loco = this.trainSet.userData.loco;
      pose(loco, "train", game.time, d * 3, "", 0, 0);
    }
  }
  drawStreaks(game, rush) {
    const metres = game.speedNow / UNITS_PER_METRE;
    this.streaks.count = Math.round(36 * rush);
    for (let i = 0; i < this.streaks.count; i++) {
      const [x, y, offset] = this.streakSeeds[i];
      this.temp.position.set(
        this.cam.position.x + x,
        y,
        ((offset + game.distance / UNITS_PER_METRE * 1.4) % 60) - 48,
      );
      this.temp.scale.set(1, 1, metres * 0.16);
      this.temp.updateMatrix();
      this.streaks.setMatrixAt(i, this.temp.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }
  drawEffects(game, fx, d) {
    const c = game.car,
      x = (c.x - 300) / 30;
    const shots = this.shotMeshes;
    for (const name in shots) shots[name].count = 0;
    for (const shot of game.shots) {
      const mesh = shots[shot.ammo.shape],
        i = mesh.count;
      if (i >= SHOT_LIMIT) continue;
      mesh.count++;
      const z = (shot.y - c.y) / UNITS_PER_METRE,
        flown = (shot.y0 - shot.y) / UNITS_PER_METRE,
        size = shot.ammo.size;
      // Вылетает с высоты машины и опускается к середине преграды
      shot.alt ??= this.player.position.y + this.muzzleAlt;
      const alt = shot.ammo.bounce
        ? 0.32 + size + Math.abs(Math.sin(flown * 0.42)) * 1.7
        : 1 + (shot.alt - 1) * Math.exp(-flown / 8);
      this.temp.position.set(this.roadPosition(shot.x, z, d), alt + this.roadLift(z, d), z);
      const name = shot.ammo.shape;
      if (name === "drop") this.temp.rotation.set(Math.PI / 2, 0, 0);
      else if (name === "ring") this.temp.rotation.set(0, 0, flown);
      else if (name === "coin" || name === "star") this.temp.rotation.set(0, flown * 0.9, 0);
      else if (name === "heart") this.temp.rotation.set(0, Math.sin(flown * 0.5) * 0.6, 0);
      else this.temp.rotation.set(flown * 0.7, flown * 0.45, 0);
      // Звуковая волна и пар расходятся в полёте
      const grow = name === "ring" || name === "puff" ? 1 + flown * 0.035 : 1;
      this.temp.scale.setScalar(size * grow);
      this.temp.updateMatrix();
      mesh.setMatrixAt(i, this.temp.matrix);
      mesh.setColorAt(i, this.color.set(shot.color));
    }
    this.temp.rotation.set(0, 0, 0);
    for (const name in shots) {
      shots[name].instanceMatrix.needsUpdate = true;
      shots[name].instanceColor.needsUpdate = true;
    }
    this.birds.count = Math.min(game.birds.length, 24);
    game.birds.slice(0, 24).forEach((b, i) => {
      const z = (b.y - c.y) / UNITS_PER_METRE;
      this.temp.position.set(
        this.roadPosition(b.x, z, d),
        b.alt + this.roadLift(z, d),
        z,
      );
      this.temp.rotation.set(0, b.vx > 0 ? -0.35 : 0.35, 0);
      this.temp.scale.set(
        0.85,
        0.85 * (0.25 + 0.75 * Math.abs(Math.sin(game.time * 12 + b.phase))),
        0.85,
      );
      this.temp.updateMatrix();
      this.birds.setMatrixAt(i, this.temp.matrix);
      this.birds.setColorAt(i, this.color.set(CONFETTI[i % 5]));
    });
    this.temp.rotation.set(0, 0, 0);
    this.birds.instanceMatrix.needsUpdate = true;
    if (this.birds.instanceColor) this.birds.instanceColor.needsUpdate = true;
    this.sparks.count = Math.min(game.particles.length, 300);
    game.particles.slice(-300).forEach((p, i) => {
      const z = (p.y - c.y) / UNITS_PER_METRE;
      this.temp.position.set(
        this.roadPosition(p.x, z, d),
        (p.alt ?? 0.4 + Math.sin(Math.min(1, p.life / 0.85) * Math.PI) * 1.45) +
          this.roadLift(z, d),
        z,
      );
      this.temp.scale.setScalar(p.size * 0.034 * Math.min(1, p.life / 0.85));
      this.temp.updateMatrix();
      this.sparks.setMatrixAt(i, this.temp.matrix);
      this.sparks.setColorAt(i, this.color.set(p.color));
    });
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
    this.aura.visible = [
      "shield",
      "magnet",
      "rescue",
      "express",
      "ghost",
      "double",
      "freeze",
      "slow",
      "allterrain",
    ].includes(fx);
    if (this.aura.visible) {
      this.aura.position.set(x, 1, 0);
      this.aura.scale.set(1.4, 1.4, 2.7);
      this.aura.material.color.set(
        fx === "rescue" ? "#ffb8ba" : fx === "double" ? "#ffe898" : "#8defff",
      );
    }
    this.flash.visible = c.recoil > 3;
    if (this.flash.visible) {
      const z = -this.muzzleAhead / UNITS_PER_METRE;
      this.flash.position.set(this.roadPosition(c.x, z, d), this.player.position.y + this.muzzleAlt + this.roadLift(z, d), z);
      this.flash.scale.setScalar(c.recoil * 0.045);
      this.flash.material.color.set(AMMO[c.type].colors[0]);
    }
    this.water.visible = this.spray.visible = fx === "water";
    const parts = this.player.userData.parts;
    if (this.water.visible && parts.waterMonitor) {
      const target = game.waterTarget, z = target ? (target.y-c.y)/UNITS_PER_METRE : -27;
      this.streamEnd.set(this.roadPosition(target?.x ?? c.x,z,d),1.1+this.roadLift(z,d),z);
      parts.waterMonitor.lookAt(this.streamEnd);
      parts.monitorTip.getWorldPosition(this.streamTip);
      this.streamDir.subVectors(this.streamEnd,this.streamTip);
      this.water.scale.y = this.streamDir.length();
      this.water.position.copy(this.streamTip).lerp(this.streamEnd,0.5);
      this.water.quaternion.setFromUnitVectors(this.streamAxis,this.streamDir.normalize());
      for (let i = 0; i < this.spray.count; i++) {
        const t = (game.time * 1.45 + i / this.spray.count) % 1;
        this.temp.position.copy(this.streamTip).lerp(this.streamEnd,t);
        this.temp.position.x += Math.sin(t*15 + i*2.1) * t * 0.34;
        this.temp.position.y += Math.cos(t*11 + i) * t * 0.28;
        this.temp.scale.setScalar(0.8 + t * 1.15);
        this.temp.updateMatrix();
        this.spray.setMatrixAt(i,this.temp.matrix);
      }
      this.spray.instanceMatrix.needsUpdate = true;
    } else if (parts.waterMonitor) parts.waterMonitor.rotation.set(0,Math.PI,0);
    for (let i = 0; i < game.rings.length; i++) {
      if (!this.rings[i]) {
        this.rings[i] = new T.Mesh(
          ring,
          new T.MeshBasicMaterial({ transparent: true, depthWrite: false }),
        );
        this.rings[i].rotation.x = -Math.PI / 2;
        this.scene.add(this.rings[i]);
      }
      const r = game.rings[i],
        m = this.rings[i],
        z = (r.y - c.y) / UNITS_PER_METRE;
      m.visible = true;
      m.position.set(
        this.roadPosition(r.x, z, d),
        0.15 + this.roadLift(z, d),
        z,
      );
      m.scale.setScalar(r.r / 25);
      m.material.color.set(r.color);
      m.material.opacity = r.life * 0.76;
    }
    for (let i = game.rings.length; i < this.rings.length; i++)
      this.rings[i].visible = false;
    this.hook.visible = game.hooks.length > 0;
    if (this.hook.visible) {
      const h = game.hooks[0],
        z = (h.ty - c.y) / UNITS_PER_METRE,
        a = this.hook.geometry.attributes.position;
      this.hook.material.color.set(h.beam ? "#6dfff6" : "#ffe990");
      a.setXYZ(0, x, h.beam ? 2.2 : 1.2, -1);
      a.setXYZ(1, this.roadPosition(h.tx, z, d), (h.target.alt || 0) + 1 + this.roadLift(z, d), z);
      a.needsUpdate = true;
      this.hook.frustumCulled = false;
    }
    this.heli.visible = !!game.heli;
    if (game.heli) {
      const h = game.heli,
        z = (h.y - c.y) / UNITS_PER_METRE;
      this.heli.position.set(
        this.roadPosition(h.x, z, d),
        h.alt + this.roadLift(z, d),
        z,
      );
      this.heli.rotation.set(0.14, heading(d - z) + (h.vx || 0) * -0.0006, (h.vx || 0) * 0.0012);
      this.heli.userData.rotor.rotation.y = game.time * 34;
      this.heli.userData.tailRotor.rotation.x = game.time * 40;
    }
    this.snow.visible = game.world === 3;
    if (this.snow.visible) {
      const a = this.snow.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const n = i * 3;
        a.setXYZ(
          i,
          this.snowBase[n] + Math.sin(game.time + i) * 0.25,
          15 - ((this.snowBase[n + 1] + game.time * 1.35) % 15),
          ((this.snowBase[n + 2] + 53 + d) % 65) - 53,
        );
      }
      a.needsUpdate = true;
    }
  }
}
