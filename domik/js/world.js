// Мир игры: небо, поляна, большое дерево, свет и камера. Домик строится в house.js.
import * as T from "../vendor/three/three.module.min.js?v=e6637b83";
import "./gfx.js?v=e6637b83";

export const mats = new Map();
export function mat(color, rough = 0.8, metal = 0) {
  const key = color + "/" + rough + "/" + metal;
  if (!mats.has(key))
    mats.set(
      key,
      new T.MeshStandardMaterial({ color, roughness: rough, metalness: metal }),
    );
  return mats.get(key);
}
export function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => t * t * (3 - 2 * t);
// Лёгкий перелёт за цель и возврат: детали приземляются с пружинкой
export const easeBack = (t) => {
  const c = 1.9;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

// Ветка или ствол: кольца вдоль кривой с разной толщиной и полосками коры
function limb(points, radii, tone, rng, seg = 12, rings = 18) {
  const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
    frames = curve.computeFrenetFrames(rings),
    pos = [],
    col = [],
    idx = [],
    base = new T.Color(tone),
    c = new T.Color();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings,
      p = curve.getPointAt(t),
      at = t * (radii.length - 1),
      k = Math.min(radii.length - 2, Math.floor(at)),
      r = radii[k] + (radii[k + 1] - radii[k]) * (at - k);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2,
        bump = 1 + 0.05 * Math.sin(a * 5 + t * 9) + 0.03 * Math.sin(a * 11);
      pos.push(
        p.x + (Math.cos(a) * frames.normals[i].x + Math.sin(a) * frames.binormals[i].x) * r * bump,
        p.y + (Math.cos(a) * frames.normals[i].y + Math.sin(a) * frames.binormals[i].y) * r * bump,
        p.z + (Math.cos(a) * frames.normals[i].z + Math.sin(a) * frames.binormals[i].z) * r * bump,
      );
      const stripe = 0.82 + 0.26 * (0.5 + 0.5 * Math.sin(a * 9 + Math.sin(t * 13) * 1.4)) + (rng() - 0.5) * 0.08;
      c.copy(base).multiplyScalar(stripe);
      col.push(c.r, c.g, c.b);
      if (i < rings && j < seg) {
        const n = i * (seg + 1) + j;
        idx.push(n, n + seg + 1, n + 1, n + 1, n + seg + 1, n + seg + 2);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const TREES = {
  oak: { name: "Дуб", leaves: ["#2f9a3f", "#46b548", "#6fce52", "#94de60"], bark: "#8a5a33" },
  apple: { name: "Яблоня", leaves: ["#3fb04a", "#5cc752", "#84d95c", "#2f9a3f"], bark: "#8f6238", fruit: "#ff3b3b" },
  sakura: { name: "Сакура", leaves: ["#ff9ec9", "#ffb7d8", "#ffd0e6", "#f27fb5"], bark: "#6d4a3c" },
  autumn: { name: "Осенний клён", leaves: ["#ff9a2e", "#ffb53f", "#f2672a", "#ffd058"], bark: "#7a4d2c" },
  magic: { name: "Волшебное", leaves: ["#6fc4ff", "#a48bff", "#74e0dc", "#c9a8ff"], bark: "#5d4f86", fruit: "#fff09a" },
};
export const TRUNK_Z = -1;

function groundTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d"),
    rng = seeded(41);
  g.fillStyle = "#6fc94c";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 520; i++) {
    g.globalAlpha = 0.08 + rng() * 0.2;
    g.fillStyle = rng() > 0.5 ? "#4fae3c" : "#9be35f";
    const x = rng() * 512,
      y = rng() * 512,
      r = 8 + rng() * 44;
    for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, r, r * (0.5 + rng() * 0.5), rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 3200; i++) {
    g.globalAlpha = 0.3 + rng() * 0.4;
    g.fillStyle = rng() > 0.5 ? "#3f9c34" : "#b5ec70";
    g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 2, 2 + rng() * 6);
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(26, 26);
  tex.anisotropy = 4;
  return tex;
}

const indoorGround = new T.Color("#f0dcc0");
export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    this.scene.fog = new T.Fog("#cdeeff", 70, 190);
    this.camera = new T.PerspectiveCamera(38, 1, 0.3, 600);
    this.ray = new T.Raycaster();
    this.anims = [];
    this.night = 0;
    this.nightTarget = 0;
    this.time = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 1;
    this.cosyMin = 0;
    this.indoor = 0;
    this.quality = Math.min(2, devicePixelRatio || 1);
    this.frameTotal = this.frameCount = 0;
    this.view = { target: new T.Vector3(0, 7, 1), radius: 15, yaw: 0, lift: 0.1 };
    this.look = this.view.target.clone();
    this.dist = 40;
    this.lightSetup();
    this.sky();
    this.meadow();
    this.effects();
    this.tree = null;
    this.resize();
    addEventListener("resize", () => this.resize());
  }
  // ---------- анимации ----------
  tween(duration, update, done, ease = easeInOut) {
    this.anims.push({ t: 0, duration, update, done, ease });
    update(0);
  }
  lightSetup() {
    this.hemi = new T.HemisphereLight("#d9f2ff", "#7fb45a", 1.5);
    this.hemiGround = this.hemi.groundColor.clone();
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight("#fff0d2", 2.9);
    this.sun.position.set(-26, 44, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 30, bottom: -24, near: 5, far: 110 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(0, 6, 0);
    this.scene.add(this.sun, this.sun.target);
    // Тёплый свет из домика: включается вечером
    this.cosy = new T.PointLight("#ffc46b", 0, 30, 1.6);
    this.cosy.position.set(0, 9.2, 7.6);
    this.scene.add(this.cosy);
    // Отражения: небо и трава вместо серой студии
    const env = new T.Scene(),
      dome = new T.SphereGeometry(50, 24, 16),
      pos = dome.attributes.position,
      colors = new Float32Array(pos.count * 3),
      top = new T.Color("#4fb2f2"),
      low = new T.Color("#e2f6ff"),
      grass = new T.Color("#6fc94c"),
      c = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y >= 0) c.copy(low).lerp(top, y ** 0.55);
      else c.copy(grass);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    dome.setAttribute("color", new T.BufferAttribute(colors, 3));
    env.add(new T.Mesh(dome, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, toneMapped: false })));
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.02).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }
  sky() {
    this.skyMat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { night: { value: 0 } },
      vertexShader: "varying vec3 dir; void main(){dir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec3 dir; uniform float night;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec3 n=normalize(dir);float h=max(n.y,0.);
        vec3 day=mix(vec3(.80,.94,1.),vec3(.16,.56,.95),pow(h,.55));
        vec3 eve=mix(vec3(1.,.62,.42),vec3(.10,.10,.34),pow(h,.42));
        vec3 color=mix(day,eve,night);
        float sun=max(dot(n,normalize(vec3(-.42,.62,.66))),0.);
        color+=vec3(1.,.86,.55)*(.22*pow(sun,18.)+1.4*smoothstep(.9985,.9992,sun))*(1.-night);
        float moon=max(dot(n,normalize(vec3(.42,.5,-.76))),0.);
        color+=vec3(1.,.98,.85)*night*smoothstep(.9975,.9986,moon);
        color+=vec3(1.)*night*step(.9962,hash(floor(n.xz/max(.14,n.y+.14)*140.)))*smoothstep(.1,.32,h);
        gl_FragColor=vec4(color,1.);\n#include <colorspace_fragment>\n}`,
    });
    this.scene.add(new T.Mesh(new T.SphereGeometry(400, 32, 20), this.skyMat));
    // Пушистые облака плывут по небу
    const rng = seeded(7),
      puff = new T.IcosahedronGeometry(1, 2),
      count = 90;
    this.clouds = new T.InstancedMesh(puff, new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true, fog: false }), count);
    this.cloudSeeds = [];
    const dummy = new T.Object3D();
    for (let i = 0; i < count; i++) {
      const group = Math.floor(i / 6),
        gr = seeded(group * 91 + 3),
        cx = (gr() - 0.5) * 300,
        cy = 44 + gr() * 34,
        cz = -130 - gr() * 70;
      this.cloudSeeds.push({
        x: cx + (rng() - 0.5) * 18,
        y: cy + (rng() - 0.5) * 3,
        z: cz + (rng() - 0.5) * 8,
        s: 4 + rng() * 6,
      });
      dummy.position.set(cx, cy, cz);
      dummy.updateMatrix();
      this.clouds.setMatrixAt(i, dummy.matrix);
    }
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
    this.temp = dummy;
  }
  meadow() {
    const ground = new T.Mesh(
      new T.CircleGeometry(300, 48),
      new T.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const rng = seeded(19),
      dummy = new T.Object3D(),
      color = new T.Color();
    // Холмы на горизонте и лес на них
    const hills = new T.InstancedMesh(new T.SphereGeometry(1, 24, 12), new T.MeshStandardMaterial({ roughness: 1 }), 14);
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * 0.95 + (i / 13) * Math.PI * 0.9 + (rng() - 0.5) * 0.14,
        r = 95 + rng() * 45;
      dummy.position.set(Math.cos(a) * r, -3, Math.sin(a) * r);
      dummy.scale.set(34 + rng() * 34, 12 + rng() * 15, 26 + rng() * 14);
      dummy.updateMatrix();
      hills.setMatrixAt(i, dummy.matrix);
      hills.setColorAt(i, color.set(["#7fd255", "#62c04c", "#94dc60"][i % 3]));
    }
    this.scene.add(hills);
    const forest = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ roughness: 1, flatShading: true }), 90);
    for (let i = 0; i < 90; i++) {
      const a = -Math.PI * 0.96 + rng() * Math.PI * 0.92,
        r = 62 + rng() * 30,
        s = 3 + rng() * 4;
      dummy.position.set(Math.cos(a) * r, s * 0.7, Math.sin(a) * r);
      dummy.scale.set(s, s * (1.1 + rng() * 0.5), s);
      dummy.updateMatrix();
      forest.setMatrixAt(i, dummy.matrix);
      forest.setColorAt(i, color.set(["#2f9a3f", "#46b548", "#3aa843", "#5fc24d"][i % 4]));
    }
    this.scene.add(forest);
    // Цветы и травинки на поляне вокруг дерева
    const stems = new T.InstancedMesh(new T.CylinderGeometry(0.018, 0.028, 1, 5), mat("#3f9c34"), 240),
      heads = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), 240),
      tufts = new T.InstancedMesh(new T.ConeGeometry(0.1, 1, 5), new T.MeshStandardMaterial({ roughness: 0.9 }), 520),
      palette = ["#ff5d8f", "#ffd23f", "#ffffff", "#b07cff", "#ff8a3c", "#5fd0ff"];
    for (let i = 0; i < 240; i++) {
      const a = rng() * Math.PI * 2,
        r = 7 + rng() ** 0.7 * 34,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r + 4,
        h = 0.45 + rng() * 0.4;
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, h + 0.04, z);
      dummy.scale.set(0.17, 0.09, 0.17);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      heads.setColorAt(i, color.set(palette[i % 6]));
    }
    for (let i = 0; i < 520; i++) {
      const a = rng() * Math.PI * 2,
        r = 3.5 + rng() ** 0.6 * 42,
        s = 0.5 + rng() * 0.8;
      dummy.position.set(Math.cos(a) * r, s * 0.42, Math.sin(a) * r + 3);
      dummy.scale.set(1 + rng(), s, 1 + rng());
      dummy.rotation.set((rng() - 0.5) * 0.3, rng() * 6, (rng() - 0.5) * 0.3);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
      tufts.setColorAt(i, color.set(["#4fae3c", "#62c04c", "#7fd255", "#3f9c34"][i % 4]));
    }
    dummy.rotation.set(0, 0, 0);
    this.scene.add(stems, heads, tufts);
    tufts.castShadow = true;
    // Кусты, камни и грибы
    const bushes = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), 60);
    for (let i = 0; i < 60; i++) {
      const cluster = Math.floor(i / 5),
        cr = seeded(cluster * 77 + 5),
        a = cr() * Math.PI * 2,
        r = 16 + cr() * 22,
        s = 0.8 + rng() * 0.9;
      dummy.position.set(Math.cos(a) * r + (rng() - 0.5) * 2.4, s * 0.55, Math.sin(a) * r + 2 + (rng() - 0.5) * 2.4);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
      bushes.setColorAt(i, color.set(["#3aa843", "#52bb49", "#2f9a3f"][i % 3]));
    }
    bushes.castShadow = true;
    this.scene.add(bushes);
    const rocks = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), new T.MeshStandardMaterial({ color: "#a7b0ae", roughness: 0.95, flatShading: true }), 9);
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2,
        r = 8 + rng() * 26,
        s = 0.35 + rng() * 0.55;
      dummy.position.set(Math.cos(a) * r, s * 0.4, Math.sin(a) * r + 3);
      dummy.scale.set(s * 1.3, s * 0.8, s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.castShadow = true;
    this.scene.add(rocks);
    const capGeo = new T.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2,
        r = 5.5 + rng() * 9,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r + 2;
      const stem = new T.Mesh(new T.CylinderGeometry(0.09, 0.13, 0.42, 8), mat("#fff4e0", 0.7));
      stem.position.set(x, 0.21, z);
      const cap = new T.Mesh(capGeo, mat(i % 2 ? "#ff5148" : "#ff8a3c", 0.5));
      cap.position.set(x, 0.38, z);
      this.scene.add(stem, cap);
    }
    this.temp = dummy;
  }
  effects() {
    // Порхающие бабочки
    const wing = new T.BufferGeometry();
    wing.setAttribute("position", new T.Float32BufferAttribute([0, 0, -0.14, 0, 0, 0.14, -0.3, 0, 0, 0, 0, -0.14, 0, 0, 0.14, 0.3, 0, 0], 3));
    wing.computeVertexNormals();
    this.butterflies = new T.InstancedMesh(wing, new T.MeshBasicMaterial({ side: T.DoubleSide }), 14);
    this.butterflies.frustumCulled = false;
    const rng = seeded(61),
      color = new T.Color(),
      palette = ["#ff7ab5", "#ffd23f", "#7fd4ff", "#ff9a3c", "#c9a8ff"];
    this.flySeeds = Array.from({ length: 14 }, (_, i) => {
      this.butterflies.setColorAt(i, color.set(palette[i % 5]));
      return { a: rng() * 6.28, r: 7 + rng() * 14, y: 1.2 + rng() * 3, z: 4 + rng() * 6, speed: 0.15 + rng() * 0.25, phase: rng() * 6.28 };
    });
    this.scene.add(this.butterflies);
    // Светлячки вечером
    const glowPos = new Float32Array(70 * 3);
    this.glowSeeds = [];
    for (let i = 0; i < 70; i++) this.glowSeeds.push({ x: (rng() - 0.5) * 42, y: 0.7 + rng() * 6, z: rng() * 28 - 8, p: rng() * 6.28 });
    const glowGeo = new T.BufferGeometry();
    glowGeo.setAttribute("position", new T.BufferAttribute(glowPos, 3));
    this.fireflies = new T.Points(glowGeo, new T.PointsMaterial({ color: "#fff29a", size: 0.2, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
    // Искры и конфетти
    this.bits = [];
    this.bitMesh = new T.InstancedMesh(new T.OctahedronGeometry(1), new T.MeshBasicMaterial({ toneMapped: false }), 320);
    this.bitMesh.count = 0;
    this.bitMesh.frustumCulled = false;
    this.scene.add(this.bitMesh);
    // Падающие листья
    this.leafFall = new T.InstancedMesh(new T.CircleGeometry(0.16, 5), new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.9 }), 26);
    this.leafFall.frustumCulled = false;
    this.leafSeeds = Array.from({ length: 26 }, () => ({ x: (rng() - 0.5) * 18, y: rng() * 12, z: rng() * 12 - 5, p: rng() * 6.28, s: 0.5 + rng() * 0.6 }));
    this.scene.add(this.leafFall);
  }
  burst(pos, color, n = 16, power = 4) {
    const palette = Array.isArray(color) ? color : [color];
    for (let i = 0; i < n && this.bits.length < 320; i++) {
      const a = Math.random() * 6.28,
        up = 0.4 + Math.random();
      this.bits.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * power * Math.random(),
        vy: up * power,
        vz: Math.sin(a) * power * Math.random(),
        life: 0.6 + Math.random() * 0.6,
        size: 0.05 + Math.random() * 0.08,
        color: new T.Color(palette[i % palette.length]),
      });
    }
  }
  // ---------- дерево ----------
  setTree(kind) {
    if (this.tree) {
      this.scene.remove(this.tree);
      this.tree.traverse((n) => n.geometry?.dispose());
    }
    const info = TREES[kind],
      rng = seeded(kind.length * 31 + 7),
      root = new T.Group(),
      bark = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }),
      add = (geo) => {
        const m = new T.Mesh(geo, bark);
        m.castShadow = m.receiveShadow = true;
        root.add(m);
      },
      z = TRUNK_Z;
    add(limb([[0, -0.2, z], [0.08, 2.2, z], [-0.1, 5, z + 0.05], [0.14, 8, z - 0.1], [0, 11, z - 0.2], [0.1, 13.6, z - 0.4]], [2.15, 1.5, 1.28, 1.15, 0.92, 0.5], info.bark, rng, 16, 26));
    // Корни расходятся по земле
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2,
        c = Math.cos(a),
        s = Math.sin(a),
        l = 2.6 + rng() * 1.2;
      add(limb([[c * 0.9, 1.1, z + s * 0.9], [c * 1.9, 0.42, z + s * 1.9], [c * (1.9 + l * 0.6), 0.14, z + s * (1.9 + l * 0.6)], [c * (2 + l), -0.05, z + s * (2 + l)]], [0.55, 0.42, 0.26, 0.09], info.bark, rng, 9, 10));
    }
    // Ветки уходят в крону
    const branches = [
      [[0, 8.6, z], [2.6, 10.2, z + 0.6], [5.4, 11.4, z + 1.4], [7.4, 12.1, z + 1.6]],
      [[0, 8.9, z], [-2.8, 10.3, z + 0.8], [-5.6, 11.2, z + 1.4], [-7.8, 11.6, z + 1.3]],
      [[0, 10.2, z], [1.8, 12.2, z - 1.4], [3.4, 13.8, z - 2.6]],
      [[0, 10.6, z], [-1.8, 12.6, z - 1.2], [-3.6, 14.1, z - 2.2]],
      [[0, 11.3, z], [0.9, 13.4, z + 1.5], [1.4, 15, z + 2.4]],
    ];
    for (const b of branches) add(limb(b, [0.62, 0.42, 0.26, 0.1].slice(0, b.length), info.bark, rng, 9, 12));
    // Крона из пушистых шаров
    const clusters = [
      [0, 15.2, z, 4.8], [4.6, 13.4, z + 0.6, 4.4], [-4.8, 13.4, z + 0.5, 4.5], [7.6, 12.4, z + 1.8, 3.2],
      [-8, 12, z + 1.5, 3.3], [3, 15.8, z - 2.6, 3.8], [-3.4, 15.9, z - 2.4, 3.8], [1.4, 15.4, z + 3, 3.4],
      [-1.8, 14.2, z + 3.6, 2.8], [0, 13, z - 4.2, 3.8],
    ];
    const count = 460,
      leafGeo = new T.IcosahedronGeometry(1, 1),
      leaves = new T.InstancedMesh(leafGeo, new T.MeshStandardMaterial({ roughness: 0.82, flatShading: true }), count),
      dummy = new T.Object3D(),
      color = new T.Color();
    this.canopyCenters = clusters;
    for (let i = 0; i < count; i++) {
      const [cx, cy, cz, r] = clusters[i % clusters.length],
        a = rng() * Math.PI * 2,
        v = rng() * 2 - 1,
        h = Math.sqrt(1 - v * v),
        d = r * (0.72 + rng() * 0.34),
        s = 0.72 + rng() * 0.95;
      dummy.position.set(cx + Math.cos(a) * h * d, cy + v * d * 0.72, cz + Math.sin(a) * h * d);
      // Над домиком крона приподнята аркой, чтобы листья не закрывали крышу
      if (Math.abs(dummy.position.x) < 5.8 && dummy.position.z > -1.4) dummy.position.y = Math.max(dummy.position.y, 14.1 + s * 0.6);
      dummy.scale.setScalar(s);
      dummy.rotation.set(rng() * 6, rng() * 6, rng() * 6);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      color.set(info.leaves[Math.floor(rng() * 4)]);
      // Снизу крона темнее, сверху освещена: появляется объём
      color.multiplyScalar(0.82 + 0.28 * ((v + 1) / 2));
      leaves.setColorAt(i, color);
    }
    dummy.rotation.set(0, 0, 0);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    const crown = new T.Group();
    crown.add(leaves);
    // Плоды или волшебные огоньки
    if (info.fruit) {
      const fruit = new T.InstancedMesh(new T.SphereGeometry(0.2, 10, 8), new T.MeshStandardMaterial({ color: info.fruit, roughness: 0.3, emissive: kind === "magic" ? "#ffe36b" : "#000000", emissiveIntensity: kind === "magic" ? 1.6 : 0 }), 46);
      for (let i = 0; i < 46; i++) {
        const [cx, cy, cz, r] = clusters[i % clusters.length],
          a = rng() * Math.PI * 2,
          v = -0.1 - rng() * 0.8,
          h = Math.sqrt(1 - v * v),
          d = r * 1.12;
        dummy.position.set(cx + Math.cos(a) * h * d, cy + v * d * 0.72, cz + Math.sin(a) * h * d);
        if (Math.abs(dummy.position.x) < 5.8 && dummy.position.z > -1.4) dummy.position.y = Math.max(dummy.position.y, 13.8);
        dummy.scale.setScalar(0.85 + rng() * 0.4);
        dummy.updateMatrix();
        fruit.setMatrixAt(i, dummy.matrix);
      }
      crown.add(fruit);
    }
    root.add(crown);
    root.userData.crown = crown;
    this.tree = root;
    this.scene.add(root);
    // Падающие листья того же цвета
    color.set(info.leaves[1]);
    this.leafFall.material.color.copy(color);
    this.treeKind = kind;
  }
  // ---------- камера ----------
  focus(target, radius, yaw = 0, lift = 0.1) {
    this.view.target.set(...target);
    this.view.radius = radius;
    this.view.yaw = yaw;
    this.view.lift = lift;
  }
  fitDistance(radius) {
    const v = T.MathUtils.degToRad(this.camera.fov) / 2,
      h = Math.atan(Math.tan(v) * this.camera.aspect);
    return radius / Math.sin(Math.min(v, h));
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth,
      h = this.canvas.clientHeight || innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.quality);
    this.renderer.setSize(w, h, false);
  }
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return {
      x: ((p.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - p.y) / 2) * this.canvas.clientHeight,
      front: p.z < 1,
    };
  }
  hits(x, y, objects) {
    this.ray.setFromCamera(
      new T.Vector2((x / this.canvas.clientWidth) * 2 - 1, -(y / this.canvas.clientHeight) * 2 + 1),
      this.camera,
    );
    return this.ray.intersectObjects(objects, true);
  }
  raycast(x, y, objects) {
    return this.hits(x, y, objects)[0] || null;
  }
  // Самое близкое к пальцу: маленькому ребёнку не надо попадать точно
  nearest(x, y, objects, reach = 110) {
    let best = null,
      min = reach;
    const p = new T.Vector3();
    for (const o of objects) {
      o.getWorldPosition(p);
      const s = this.toScreen(p),
        d = Math.hypot(s.x - x, s.y - y);
      if (s.front && d < min) {
        min = d;
        best = o;
      }
    }
    return best;
  }
  adapt(dt) {
    if (dt <= 0 || dt > 0.3) return;
    this.frameTotal += dt;
    if (++this.frameCount < 40) return;
    const mean = this.frameTotal / this.frameCount;
    this.frameTotal = this.frameCount = 0;
    if (mean > 1 / 32 && this.quality > 0.8) {
      this.quality = Math.max(0.8, this.quality * 0.84);
      this.resize();
    }
  }
  // ---------- кадр ----------
  frame(dt) {
    this.time += dt;
    const t = this.time;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t = Math.min(1, a.t + dt / a.duration);
      a.update(a.ease(a.t));
      if (a.t >= 1) {
        this.anims.splice(i, 1);
        a.done?.();
      }
    }
    // Плавный переход день и вечер
    this.night += (this.nightTarget - this.night) * (1 - Math.exp(-dt * 1.3));
    const n = this.night;
    this.skyMat.uniforms.night.value = n;
    // В комнате трава не должна отражаться в белых вещах зелёным
    this.indoor += ((this.cosyMin > 0 ? 1 : 0) - this.indoor) * (1 - Math.exp(-dt * 3));
    this.hemi.intensity = 1.5 - 0.92 * n + 0.5 * this.indoor;
    this.hemi.groundColor.copy(this.hemiGround).lerp(indoorGround, this.indoor);
    this.hemi.color.set("#d9f2ff").lerp(new T.Color("#6f7fd6"), n);
    this.sun.intensity = 2.9 - 2.35 * n;
    this.sun.color.set("#fff0d2").lerp(new T.Color("#ff9d6b"), n);
    this.scene.environmentIntensity = (0.55 - 0.3 * n) * (1 - 0.72 * this.indoor);
    this.scene.fog.color.set("#cdeeff").lerp(new T.Color("#5a4a86"), n);
    this.cosy.intensity = Math.max(62 * n, this.cosyMin);
    this.fireflies.material.opacity = n;
    if (n > 0.02) {
      const a = this.fireflies.geometry.attributes.position;
      this.glowSeeds.forEach((g, i) => a.setXYZ(i, g.x + Math.sin(t * 0.5 + g.p) * 1.4, g.y + Math.sin(t * 0.8 + g.p * 2) * 0.6, g.z + Math.cos(t * 0.4 + g.p) * 1.4));
      a.needsUpdate = true;
    }
    // Облака
    this.cloudSeeds.forEach((c, i) => {
      this.temp.position.set(((c.x + t * 0.9 + 170) % 340) - 170, c.y, c.z);
      this.temp.scale.set(c.s * 1.5, c.s * 0.72, c.s);
      this.temp.updateMatrix();
      this.clouds.setMatrixAt(i, this.temp.matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    this.clouds.material.color.set("#ffffff").lerp(new T.Color("#e3cfee"), n);
    // Своё свечение не даёт облакам зеленеть от травы днём и темнеть вечером
    this.clouds.material.emissive.set("#e4f2ff").lerp(new T.Color("#b598dc"), n);
    this.clouds.material.emissiveIntensity = 0.3 + n * 0.42;
    // Бабочки днём, листья всегда
    this.butterflies.visible = n < 0.6;
    this.flySeeds.forEach((b, i) => {
      const a = b.a + t * b.speed;
      this.temp.position.set(Math.cos(a) * b.r, b.y + Math.sin(t * 1.3 + b.phase) * 0.5, b.z + Math.sin(a) * b.r * 0.7);
      this.temp.rotation.set(0, -a, 0);
      this.temp.scale.set(1, 1 + Math.sin(t * 16 + b.phase) * 1.6, 1);
      this.temp.updateMatrix();
      this.butterflies.setMatrixAt(i, this.temp.matrix);
    });
    this.butterflies.instanceMatrix.needsUpdate = true;
    this.leafSeeds.forEach((l, i) => {
      const y = 12 - ((l.y + t * l.s) % 12);
      this.temp.position.set(l.x + Math.sin(t * 0.7 + l.p) * 1.4, y, l.z + Math.cos(t * 0.5 + l.p) * 0.8);
      this.temp.rotation.set(t * 1.3 + l.p, t * 0.9, l.p);
      this.temp.scale.setScalar(1);
      this.temp.updateMatrix();
      this.leafFall.setMatrixAt(i, this.temp.matrix);
    });
    this.leafFall.instanceMatrix.needsUpdate = true;
    this.temp.rotation.set(0, 0, 0);
    // Ветер качает крону
    const crown = this.tree?.userData.crown;
    if (crown) {
      // Порывы ветра: крона то почти замирает, то заметно качается
      const gust = 1 + 1.4 * Math.max(0, Math.sin(t * 0.23));
      crown.rotation.z = Math.sin(t * 0.8) * 0.006 * gust;
      crown.rotation.x = Math.sin(t * 0.6 + 1) * 0.005 * gust;
    }
    // Искры
    this.bits = this.bits.filter((b) => (b.life -= dt) > 0);
    this.bitMesh.count = this.bits.length;
    this.bits.forEach((b, i) => {
      b.vy -= 9 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      this.temp.position.set(b.x, b.y, b.z);
      this.temp.scale.setScalar(b.size * Math.min(1, b.life * 2.4));
      this.temp.updateMatrix();
      this.bitMesh.setMatrixAt(i, this.temp.matrix);
      this.bitMesh.setColorAt(i, b.color);
    });
    this.bitMesh.instanceMatrix.needsUpdate = true;
    if (this.bitMesh.instanceColor) this.bitMesh.instanceColor.needsUpdate = true;
    // Камера мягко летит к текущей цели
    const k = 1 - Math.exp(-dt * 2.6);
    this.look.lerp(this.view.target, k);
    this.dist += (this.fitDistance(this.view.radius) * this.zoom - this.dist) * k;
    const yaw = this.view.yaw + this.yaw + Math.sin(t * 0.22) * 0.035,
      pitch = this.view.lift + this.pitch;
    this.camera.position.set(
      this.look.x + Math.sin(yaw) * Math.cos(pitch) * this.dist,
      Math.max(1.1, this.look.y + Math.sin(pitch) * this.dist),
      this.look.z + Math.cos(yaw) * Math.cos(pitch) * this.dist,
    );
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
  }
}
