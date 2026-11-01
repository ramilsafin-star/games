// Город вокруг стройки: небо со сменой времени суток, кварталы, деревья, машины, облака,
// а наверху то, что можно увидеть только с высоты: птицы, шары, самолёт, НЛО и звёзды
import * as T from "../vendor/three/three.module.min.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";

export const PLOT_STEP = 50;
export const PLOTS = 8;
const GRID = 84;
const GROUND = 16000;
const ROAD = 15;

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function painted(g, color) {
  const c = new T.Color(color);
  const out = g.index ? g.toNonIndexed() : g;
  const n = out.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  out.setAttribute("color", new T.BufferAttribute(a, 3));
  if (out.attributes.uv) out.deleteAttribute("uv");
  return out;
}

// Три времени суток: день, закат, ночь
const MOODS = [
  { zenith: "#1f6fd6", horizon: "#bfe4ff", sun: "#fff0d4", sunI: 2.5, hemi: 0.62, sky: "#cfe6ff", gnd: "#7d8c6e", env: 0.55, fog: "#b4dcf7", exposure: 0.98, bloom: 0.2, dir: [0.62, 0.66, 0.42], light: 0, lamp: 0 },
  { zenith: "#3a4f96", horizon: "#ffb06b", sun: "#ffb26a", sunI: 2.3, hemi: 0.46, sky: "#ffc7a0", gnd: "#6d5a58", env: 0.5, fog: "#f0a97e", exposure: 1.02, bloom: 0.42, dir: [0.75, 0.2, 0.42], light: 0.38, lamp: 0.5 },
  { zenith: "#070b26", horizon: "#20305e", sun: "#8fa8e6", sunI: 0.5, hemi: 0.3, sky: "#44558c", gnd: "#222838", env: 0.2, fog: "#1a264e", exposure: 1.05, bloom: 0.42, dir: [-0.45, 0.72, 0.45], light: 1, lamp: 1 }
];

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uSpace; uniform float uStars;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.05, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
  // Чем выше, тем ближе космос
  col = mix(col, vec3(0.006, 0.01, 0.04), uSpace * smoothstep(0.0, 0.3, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(s, 900.0) * 7.0 + pow(s, 40.0) * 0.32 + pow(s, 6.0) * 0.12);
  float sk = max(uStars, uSpace);
  if (sk > 0.01) {
    // Звезда — круглая точка внутри своей ячейки, размер и яркость у каждой свои
    vec3 q = d * 260.0;
    vec3 cell = floor(q);
    float pick = hash(cell);
    float dist = length(fract(q) - 0.5);
    float star = step(0.992, pick) * smoothstep(0.42, 0.06, dist) * (0.4 + fract(pick * 317.0) * 1.1);
    col += vec3(1.5, 1.45, 1.35) * star * sk * smoothstep(-0.05, 0.2, d.y + uSpace * 0.4);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Простой дом: окна рисуются по его мировым координатам, поэтому хватает одной отрисовки на весь город
function districtMaterial(shared) {
  const m = new T.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uLight = shared.uLight;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWp; varying vec3 vOn;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wp0 = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWp = wp0.xyz; vOn = normal;`);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uLight; varying vec3 vWp; varying vec3 vOn;
        float cityHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        float side = 1.0 - step(0.5, abs(vOn.y));
        float along = abs(vOn.x) > 0.5 ? vWp.z : vWp.x;
        // У каждого дома свой рисунок: кто-то почти весь стеклянный, кто-то с редкими окнами
        float home = cityHash(floor(vWp.xz / 46.0));
        vec2 cell = vec2(along / mix(2.8, 4.4, home), vWp.y / 3.8);
        float blur = clamp(fwidth(along) * 0.5, 0.0, 1.0);
        vec2 f = fract(cell);
        float gap = mix(0.3, 0.1, home);
        float win = step(gap, f.x) * step(f.x, 1.0 - gap) * step(0.24, f.y) * step(f.y, 0.78) * side;
        win = mix(win, (1.0 - gap * 2.0) * 0.54 * side, smoothstep(0.06, 0.45, blur));
        float lit = step(0.68, cityHash(floor(cell) + floor(vWp.xz / 40.0)));
        vec3 pane = mix(vec3(0.2, 0.34, 0.5), vec3(0.42, 0.62, 0.78), cityHash(floor(cell) * 1.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, pane, win * 0.88);
        // Этаж темнее у земли, светлее к крыше, а сама крыша тёмная
        diffuseColor.rgb *= mix(0.58, 1.0, side);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.82, 0.56, 0.28) * win * lit * uLight;`);
  };
  m.customProgramCacheKey = () => "city-block";
  return m;
}

function groundTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  const u = 1024 / GRID;
  g.fillStyle = "#6a9a58";
  g.fillRect(0, 0, 1024, 1024);
  const road = ROAD * u;
  // Тротуар вокруг квартала
  g.fillStyle = "#9c9a92";
  g.fillRect(0, 0, 1024, road + 5 * u);
  g.fillRect(0, 0, road + 5 * u, 1024);
  g.fillStyle = "#30353c";
  g.fillRect(0, 0, 1024, road);
  g.fillRect(0, 0, road, 1024);
  g.strokeStyle = "#f4f1e6";
  g.lineWidth = 0.5 * u;
  g.setLineDash([4 * u, 4 * u]);
  g.beginPath();
  g.moveTo(road, road / 2);
  g.lineTo(1024, road / 2);
  g.moveTo(road / 2, road);
  g.lineTo(road / 2, 1024);
  g.stroke();
  g.setLineDash([]);
  // Зебры у перекрёстка
  g.fillStyle = "#f4f1e6";
  for (let i = 0; i < 6; i++) {
    g.fillRect(road + 1 * u, 1 * u + i * 2.3 * u, 3 * u, 1.2 * u);
    g.fillRect(1 * u + i * 2.3 * u, road + 1 * u, 1.2 * u, 3 * u);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(GROUND / GRID, GROUND / GRID);
  t.anisotropy = 8;
  return t;
}

// Бульвар: газон, дорожка вдоль домов и полоски стрижки
function lawnTexture(length) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#5ea84c";
  g.fillRect(0, 0, 2048, 256);
  g.fillStyle = "#67b354";
  for (let i = 0; i < 26; i++) if (i % 2) g.fillRect((i * 2048) / 26, 0, 2048 / 26, 256);
  g.fillStyle = "#cfc6b2";
  g.fillRect(0, 196, 2048, 22);
  g.fillRect(0, 36, 2048, 12);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function carGeometry() {
  return mergeGeometries([
    painted(new T.BoxGeometry(4.2, 0.8, 1.9).translate(0, 0.65, 0), "#ffffff"),
    painted(new T.BoxGeometry(2.2, 0.7, 1.7).translate(-0.2, 1.35, 0), "#b8d4e6")
  ]);
}

function cloudGeometry(seed) {
  const rng = seeded(seed);
  const list = [];
  const n = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const r = 5 + rng() * 7;
    const g = new T.IcosahedronGeometry(r, 2);
    g.deleteAttribute("uv");
    g.scale(1, 0.62, 1);
    g.translate((i - n / 2) * 6 + rng() * 3, rng() * 3, (rng() - 0.5) * 12);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const k = T.MathUtils.clamp((pos.getY(v) + 5) / 10, 0, 1);
      col[v * 3] = 0.72 + k * 0.28;
      col[v * 3 + 1] = 0.77 + k * 0.23;
      col[v * 3 + 2] = 0.86 + k * 0.14;
    }
    g.setAttribute("color", new T.BufferAttribute(col, 3));
    list.push(g);
  }
  return mergeGeometries(list);
}

export class City {
  constructor(renderer, scene, shared) {
    this.renderer = renderer;
    this.scene = scene;
    this.shared = shared;
    this.group = new T.Group();
    scene.add(this.group);
    this.fog = new T.Fog("#c9e6f8", 300, 1700);
    scene.fog = this.fog;
    this.time = 0;

    this.skyMat = new T.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: T.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: { uZenith: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uSun: { value: new T.Color() }, uSunDir: { value: new T.Vector3() }, uSpace: { value: 0 }, uStars: { value: 0 } }
    });
    this.sky = new T.Mesh(new T.SphereGeometry(10, 24, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.hemi = new T.HemisphereLight("#ffffff", "#888888", 1);
    this.sun = new T.DirectionalLight("#ffffff", 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 420 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.hemi, this.sun, this.sun.target);

    this.buildGround();
    this.buildDistrict();
    this.buildSite();
    this.buildTraffic();
    this.buildSky();
    this.makeEnvironments();
    this.setMood(0);
  }

  buildGround() {
    const ground = new T.Mesh(new T.PlaneGeometry(GROUND, GROUND), new T.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    // Дороги сдвинуты так, чтобы бульвар шёл между ними
    ground.material.map.offset.set(((-40 + GROUND / 2) / GRID) % 1, ((-55 + GROUND / 2) / GRID) % 1);
    this.group.add(ground);
    // Широкая площадка для стройки: закрывает поперечные дороги
    const strip = new T.Mesh(new T.BoxGeometry(PLOTS * PLOT_STEP + 150, 0.3, 80), new T.MeshStandardMaterial({ map: lawnTexture(PLOTS * PLOT_STEP + 150), roughness: 0.95 }));
    strip.position.set(((PLOTS - 1) * PLOT_STEP) / 2, 0.14, 0);
    strip.receiveShadow = true;
    this.group.add(strip);
    const pads = new T.InstancedMesh(new T.BoxGeometry(19, 0.5, 19), new T.MeshStandardMaterial({ color: "#5d6166", roughness: 0.9 }), PLOTS);
    const m = new T.Matrix4();
    for (let i = 0; i < PLOTS; i++) {
      m.makeTranslation(i * PLOT_STEP, 0.25, 0);
      pads.setMatrixAt(i, m);
    }
    pads.receiveShadow = true;
    this.group.add(pads);
  }

  buildDistrict() {
    const rng = seeded(4242);
    const list = [];
    const keep = { x0: -110, x1: PLOTS * PLOT_STEP + 110, z0: -62, z1: 210 };
    for (let bx = -36; bx <= 40; bx++) {
      for (let bz = -38; bz <= 38; bz++) {
        const cx = bx * GRID + 32;
        const cz = bz * GRID + 45;
        const dist = Math.hypot(cx - 170, cz);
        if (dist > 3100) continue;
        const hits = (x, z, r) => x + r > keep.x0 && x - r < keep.x1 && z + r > keep.z0 && z - r < keep.z1;
        // Вблизи кварталы плотные, а дальше домов меньше: издалека всё равно сливается в город
        const n = dist < 1100 ? 2 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const w = 12 + rng() * 20;
          const d = 12 + rng() * 20;
          const x = cx + (rng() - 0.5) * (GRID - ROAD - w - 12);
          const z = cz + (rng() - 0.5) * (GRID - ROAD - d - 12);
          if (hits(x, z, Math.max(w, d) / 2 + 2)) continue;
          // В центре города дома выше, но всё равно ниже будущего небоскрёба
          const tall = rng() < 0.16 ? 2.2 : 1;
          const h = (9 + rng() * 26) * tall;
          list.push({ x, z, w, d, h, c: ["#b5a58f", "#a68a70", "#8e9ba6", "#c7b9a3", "#7f8c99", "#b0795c", "#67737f", "#a35f4a"][Math.floor(rng() * 8)] });
        }
      }
    }
    const g = new T.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const mesh = new T.InstancedMesh(g, districtMaterial(this.shared), list.length);
    const m = new T.Matrix4();
    const q = new T.Quaternion();
    const c = new T.Color();
    list.forEach((b, i) => {
      m.compose(new T.Vector3(b.x, 0, b.z), q, new T.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(b.c));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    // Деревья вдоль бульвара и в кварталах
    const crowns = [];
    for (let i = 0; i < 90; i++) {
      const front = i % 3 !== 0;
      const x = -90 + rng() * (PLOTS * PLOT_STEP + 180);
      const z = front ? 44 + rng() * 6 : -46 - rng() * 12;
      crowns.push([x, z, 2 + rng() * 1.5]);
    }
    for (let i = 0; i < 210; i++) {
      const a = rng() * Math.PI * 2;
      const r = 100 + rng() * 500;
      const x = 170 + Math.cos(a) * r;
      const z = Math.sin(a) * r + 110;
      if (z < 210 && z > -62 && x > -110 && x < PLOTS * PLOT_STEP + 110) {
        if (z > 60 && z < 210) crowns.push([x, z, 2.2 + rng() * 2]);
        continue;
      }
    }
    const crown = new T.IcosahedronGeometry(1, 1);
    crown.deleteAttribute("uv");
    const treeMat = new T.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const trees = new T.InstancedMesh(crown, treeMat, crowns.length);
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.14, 0.2, 1, 6), new T.MeshStandardMaterial({ color: "#6e4d30", roughness: 0.9 }), crowns.length);
    crowns.forEach(([x, z, s], i) => {
      m.compose(new T.Vector3(x, s * 1.5, z), q, new T.Vector3(s, s * 1.15, s));
      trees.setMatrixAt(i, m);
      trees.setColorAt(i, c.setHSL(0.28 + rng() * 0.07, 0.6, 0.22 + rng() * 0.1));
      m.compose(new T.Vector3(x, s * 0.5, z), q, new T.Vector3(s * 0.9, s, s * 0.9));
      trunks.setMatrixAt(i, m);
    });
    trees.castShadow = true;
    trunks.castShadow = true;
    trees.frustumCulled = false;
    trunks.frustumCulled = false;
    this.group.add(trees, trunks);
  }

  // Стройплощадка переезжает вместе с краном на новый участок
  buildSite() {
    this.site = new T.Group();
    const parts = [];
    const add = (w, h, d, x, y, z, color) => parts.push(painted(new T.BoxGeometry(w, h, d).translate(x, y, z), color));
    // Ограждение в полоску
    const fence = 12.8;
    for (let i = -6; i <= 6; i++) {
      const color = i % 2 ? "#ff7a2e" : "#fff4e8";
      [[i * 2, fence], [i * 2, -fence], [fence, i * 2], [-fence, i * 2]].forEach(([x, z]) => {
        const side = Math.abs(z) === fence;
        add(side ? 1.9 : 0.14, 1.1, side ? 0.14 : 1.9, x, 0.85, z, color);
      });
    }
    // Бытовка
    add(8, 3, 3.4, -22, 1.8, -4, "#2f7fd1");
    add(8.3, 0.25, 3.7, -22, 3.4, -4, "#d8d8d8");
    add(1.2, 1, 0.1, -23.6, 2.1, -2.25, "#bfe4f7");
    add(1.2, 1, 0.1, -20.4, 2.1, -2.25, "#bfe4f7");
    // Штабеля плит и труб
    for (let i = 0; i < 4; i++) add(6, 0.45, 2.6, 2, 0.5 + i * 0.5, -22, i % 2 ? "#a9adb3" : "#8f949b");
    for (let i = 0; i < 3; i++) add(5, 0.7, 0.7, 11, 0.7, -21 + i * 0.9, "#555d67");
    // Грузовик
    add(4, 2.4, 2.6, -12, 1.8, -26, "#d0342a");
    add(1.6, 1.2, 2.5, -11.1, 2.4, -26, "#9fd2ea");
    add(8, 0.4, 2.8, -18.4, 1.2, -26, "#30343a");
    add(7.8, 1.6, 2.6, -18.4, 2.2, -26, "#d9d9d9");
    [[-11, -27.4], [-11, -24.6], [-16, -27.4], [-16, -24.6], [-21, -27.4], [-21, -24.6]].forEach(([x, z]) => {
      const w = new T.CylinderGeometry(0.75, 0.75, 0.5, 12).rotateX(Math.PI / 2).translate(x, 0.8, z);
      parts.push(painted(w, "#202226"));
    });
    const mesh = new T.Mesh(mergeGeometries(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.site.add(mesh);
    this.group.add(this.site);
  }

  buildTraffic() {
    const rng = seeded(808);
    const n = 44;
    this.cars = [];
    const mesh = new T.InstancedMesh(carGeometry(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.4 }), n);
    const colors = ["#e23b2e", "#2f7fd1", "#ffd23f", "#f4f4f4", "#2c2f36", "#3fb26a", "#ff8a3c"];
    const c = new T.Color();
    const roads = [47.5, -36.5, 131.5, 215.5];
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.cars.push({ road: roads[i % roads.length] + dir * 3.4, dir, x: rng() * 1200 - 400, v: 16 + rng() * 10 });
      mesh.setColorAt(i, c.set(colors[i % colors.length]));
    }
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    this.carMesh = mesh;
    this.group.add(mesh);
  }

  buildSky() {
    // Облака висят высоко: до них нужно дорасти
    this.clouds = [];
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.1 });
    this.cloudMat = mat;
    const rng = seeded(99);
    [cloudGeometry(5), cloudGeometry(17), cloudGeometry(31)].forEach((g, kind) => {
      const mesh = new T.InstancedMesh(g, mat, 9);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      for (let i = 0; i < 9; i++) {
        const behind = rng() < 0.8;
        const z = behind ? -95 - rng() * 560 : 340 + rng() * 300;
        this.clouds.push({ mesh, i, x: -300 + rng() * 1100, y: 92 + rng() * 80 + kind * 6, z, s: 0.9 + rng() * 1.3, v: 1 + rng() * 1.6 });
      }
    });
    // Птицы кружат над кварталом
    const wing = new T.BufferGeometry();
    wing.setAttribute("position", new T.Float32BufferAttribute([0, 0, 0.3, -1.3, 0.35, 0, 0, 0, -0.3, 0, 0, 0.3, 0, 0, -0.3, 1.3, 0.35, 0], 3));
    wing.computeVertexNormals();
    this.birds = new T.InstancedMesh(wing, new T.MeshBasicMaterial({ color: "#2b3240", side: T.DoubleSide }), 16);
    this.birds.frustumCulled = false;
    this.group.add(this.birds);
    // Воздушные шары
    this.balloons = [["#ff5d5d", "#ffd23f"], ["#3fb2ff", "#ffffff"], ["#b57bff", "#ff8fc7"]].map(([a, b], i) => {
      const parts = [];
      for (let k = 0; k < 8; k++) {
        const g = new T.SphereGeometry(6, 12, 12, (k * Math.PI) / 4, Math.PI / 4);
        g.deleteAttribute("uv");
        parts.push(painted(g, k % 2 ? a : b));
      }
      parts.push(painted(new T.BoxGeometry(2, 1.4, 2).translate(0, -9.5, 0), "#8a5a33"));
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(painted(new T.BoxGeometry(0.06, 4, 0.06).translate(x * 1.1, -7.2, z * 1.1), "#3c3028"));
      const mesh = new T.Mesh(mergeGeometries(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
      mesh.userData = { a: i * 2.1, r: 58 + i * 22, y: 92 + i * 28 };
      this.group.add(mesh);
      return mesh;
    });
    // Самолёт и инверсионный след
    const planeParts = [
      painted(new T.CylinderGeometry(1.1, 1.1, 15, 10).rotateZ(Math.PI / 2), "#ffffff"),
      painted(new T.ConeGeometry(1.1, 3, 10).rotateZ(-Math.PI / 2).translate(9, 0, 0), "#ffffff"),
      painted(new T.BoxGeometry(5, 0.3, 18).translate(0.5, -0.2, 0), "#d8e2ea"),
      painted(new T.BoxGeometry(2, 0.2, 7).translate(-7, 0.4, 0), "#d8e2ea"),
      painted(new T.BoxGeometry(2.4, 3.4, 0.25).translate(-7, 2, 0), "#2f7fd1")
    ];
    this.plane = new T.Mesh(mergeGeometries(planeParts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 }));
    this.trail = new T.Mesh(new T.BoxGeometry(1, 0.5, 0.5).translate(-0.5, 0, 0), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }));
    this.trail.scale.x = 150;
    this.plane.add(this.trail);
    this.trail.position.x = -8;
    this.group.add(this.plane);
    // НЛО: мирно висит там, куда мало кто дорастает
    const ufo = [
      painted(new T.SphereGeometry(6, 20, 8).scale(1, 0.26, 1), "#c8d4e2"),
      painted(new T.SphereGeometry(2.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.9, 0), "#8fe8ff")
    ];
    this.ufo = new T.Mesh(mergeGeometries(ufo), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.7 }));
    this.ufoLights = new T.InstancedMesh(new T.SphereGeometry(0.34, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(0.5, 3, 2.4), toneMapped: false }), 8);
    const m = new T.Matrix4();
    for (let i = 0; i < 8; i++) {
      m.makeTranslation(Math.cos((i * Math.PI) / 4) * 5, -0.5, Math.sin((i * Math.PI) / 4) * 5);
      this.ufoLights.setMatrixAt(i, m);
    }
    this.ufo.add(this.ufoLights);
    this.group.add(this.ufo);
    this.moon = new T.Mesh(new T.SphereGeometry(40, 24, 16), new T.MeshBasicMaterial({ color: new T.Color(2, 2, 1.85), toneMapped: false, fog: false }));
    this.moon.visible = false;
    this.group.add(this.moon);
  }

  // Отражения в стекле: небо сверху, город у горизонта
  makeEnvironments() {
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.envs = [0, 1].map((k) => {
      const mood = MOODS[k];
      const dome = new T.Scene();
      const geo = new T.SphereGeometry(100, 32, 18);
      const top = new T.Color(mood.zenith);
      const low = new T.Color(mood.horizon);
      const ground = new T.Color(mood.gnd).multiplyScalar(0.55);
      const sun = new T.Vector3(...mood.dir).normalize();
      const pos = geo.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const c = new T.Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 100;
        if (y < 0) c.copy(ground).lerp(low, Math.max(0, 1 + y * 6));
        else c.copy(low).lerp(top, Math.pow(y, 0.6));
        // Полоса облаков даёт стеклу живой рисунок
        const band = Math.sin(pos.getX(i) * 0.09 + pos.getZ(i) * 0.05) * 0.5 + 0.5;
        if (y > 0.05 && y < 0.5) c.lerp(new T.Color("#ffffff"), band * 0.32);
        const dot = (pos.getX(i) * sun.x + pos.getY(i) * sun.y + pos.getZ(i) * sun.z) / 100;
        c.multiplyScalar(1 + Math.pow(Math.max(dot, 0), 28) * 9);
        col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("color", new T.BufferAttribute(col, 3));
      dome.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
      const rt = pmrem.fromScene(dome, 0.012);
      geo.dispose();
      return rt.texture;
    });
    pmrem.dispose();
  }

  // k: 0 день, 1 закат, 2 ночь, дробные значения — переход
  setMood(k) {
    this.mood = k;
    const i = Math.min(1, Math.floor(k));
    const f = k - i;
    const a = MOODS[i];
    const b = MOODS[i + 1];
    const u = this.skyMat.uniforms;
    u.uZenith.value.set(a.zenith).lerp(new T.Color(b.zenith), f);
    u.uHorizon.value.set(a.horizon).lerp(new T.Color(b.horizon), f);
    u.uSun.value.set(a.sun).lerp(new T.Color(b.sun), f);
    const dir = new T.Vector3(...a.dir).lerp(new T.Vector3(...b.dir), f).normalize();
    u.uSunDir.value.copy(dir);
    this.sunDir = dir;
    u.uStars.value = T.MathUtils.smoothstep(k, 1.25, 1.9);
    this.sun.color.set(a.sun).lerp(new T.Color(b.sun), f);
    this.sun.intensity = T.MathUtils.lerp(a.sunI, b.sunI, f);
    this.hemi.color.set(a.sky).lerp(new T.Color(b.sky), f);
    this.hemi.groundColor.set(a.gnd).lerp(new T.Color(b.gnd), f);
    this.hemi.intensity = T.MathUtils.lerp(a.hemi, b.hemi, f);
    this.fog.color.set(a.fog).lerp(new T.Color(b.fog), f);
    this.scene.environment = this.envs[k < 1.5 ? (k < 0.5 ? 0 : 1) : 1];
    this.scene.environmentIntensity = T.MathUtils.lerp(a.env, b.env, f);
    this.exposure = T.MathUtils.lerp(a.exposure, b.exposure, f);
    this.bloom = T.MathUtils.lerp(a.bloom, b.bloom, f);
    this.shared.uLight.value = T.MathUtils.lerp(a.light, b.light, f);
    this.cloudMat.emissiveIntensity = T.MathUtils.lerp(0.1, 0.03, k / 2);
    // Ночью облака синеватые, на закате розовые
    this.cloudMat.color.set(k < 1 ? "#ffffff" : "#ffd9c9").lerp(new T.Color(k < 1 ? "#ffd9c9" : "#8ea0d8"), k < 1 ? k : k - 1);
  }

  // Всё, что живёт само: машины, облака, птицы, шары, самолёт
  update(dt, focus, camera) {
    this.time += dt;
    const t = this.time;
    const m = new T.Matrix4();
    const q = new T.Quaternion();
    const up = new T.Vector3(0, 1, 0);
    const scale = new T.Vector3(1, 1, 1);
    this.cars.forEach((car, i) => {
      car.x += car.dir * car.v * dt;
      if (car.x > 900) car.x = -500;
      if (car.x < -500) car.x = 900;
      q.setFromAxisAngle(up, car.dir > 0 ? 0 : Math.PI);
      m.compose(new T.Vector3(car.x, 0.1, car.road), q, scale);
      this.carMesh.setMatrixAt(i, m);
    });
    this.carMesh.instanceMatrix.needsUpdate = true;
    this.clouds.forEach((c) => {
      c.x += c.v * dt;
      if (c.x > 800) c.x = -460;
      m.compose(new T.Vector3(c.x, c.y, c.z), q.identity(), scale.set(c.s, c.s * 0.8, c.s));
      c.mesh.setMatrixAt(c.i, m);
      c.mesh.instanceMatrix.needsUpdate = true;
    });
    scale.set(1, 1, 1);
    for (let i = 0; i < 16; i++) {
      const a = t * 0.26 + i * 0.32;
      const r = 62 + (i % 4) * 4;
      const x = focus.x + Math.cos(a) * r;
      const z = focus.z + Math.sin(a) * r;
      const flap = 0.45 + Math.abs(Math.sin(t * 7 + i)) * 0.9;
      q.setFromAxisAngle(up, -a);
      m.compose(new T.Vector3(x, 50 + (i % 5) * 1.6 + Math.sin(t + i) * 0.8, z), q, scale.set(1, flap, 1));
      this.birds.setMatrixAt(i, m);
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.balloons.forEach((b) => {
      const u = b.userData;
      const a = u.a + t * 0.035;
      b.position.set(focus.x + Math.cos(a) * u.r, u.y + Math.sin(t * 0.5 + u.a) * 2, focus.z + Math.sin(a) * u.r);
    });
    const pa = t * 0.17;
    this.plane.position.set(focus.x + Math.cos(pa) * 190, 182, focus.z + Math.sin(pa) * 190);
    this.plane.rotation.y = -pa - Math.PI / 2;
    this.plane.rotation.z = 0;
    this.ufo.position.set(focus.x + 42 + Math.sin(t * 0.7) * 6, 268 + Math.sin(t * 1.3) * 2.5, focus.z - 26 + Math.cos(t * 0.5) * 6);
    this.ufo.rotation.y = t * 1.2;
    // Чем выше камера, тем темнее небо, дальше видно и ближе космос
    const alt = camera.position.y;
    const space = T.MathUtils.smoothstep(alt, 240, 620);
    this.skyMat.uniforms.uSpace.value = space;
    this.fog.near = 300 + alt * 1.2;
    this.fog.far = 1700 + alt * 2.2;
    this.moon.visible = space > 0.02 || this.mood > 1.4;
    if (this.moon.visible) this.moon.position.set(camera.position.x - 620, camera.position.y + 330, camera.position.z - 900);
    // Тень считается вокруг верха дома
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 200);
    this.sky.position.copy(camera.position);
  }
}
