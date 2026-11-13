// 3D «Светлячкового концерта»: ночная поляна, концертный домик с окошками, Сова-дирижёр, зверята-музыканты,
// четыре светящиеся дорожки, кружки-барабаны и светлячки-нотки. Дорожки идут от домика (−z) к игроку (z = 0).
import * as T from "../vendor/three/three.module.min.js?v=08fe098e";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=08fe098e";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=08fe098e";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=08fe098e";
import { polish } from "./gfx.js?v=08fe098e";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=08fe098e";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=08fe098e";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=08fe098e";
import { APPROACH, WINDOW } from "./rhythm.js?v=08fe098e";

const pie = Math.PI;
const clamp = T.MathUtils.clamp;
export const LANE_COLORS = ["#ff4f8b", "#ffc533", "#3fe07a", "#3fb4ff"];
export const LANE_X = [-3.3, -1.1, 1.1, 3.3];
const SPAWN_Z = -40; // откуда вылетают светлячки (у домика)
const HOUSE_Z = -47;
const glossy = (color, extra = {}) => new T.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, ...extra });
const matte = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const glowing = (color, k = 2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
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
// Свечение цветом экземпляра: у каждого светлячка свой цвет и сияние
function instanceGlow(mat, k) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor * ${k.toFixed(2)};\n#endif`);
  };
  return mat;
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

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.18;
    pmrem.dispose();
    this.scene.fog = new T.Fog(0x241a5c, 60, 160);
    this.camera = new T.PerspectiveCamera(50, 1, 0.1, 600);
    // Ночь: мало рассеянного света, лунный свет сверху — светятся сами светлячки, грибы и окошки
    this.scene.add(new T.HemisphereLight(0x6a5cff, 0x1a1040, 0.55));
    const moon = new T.DirectionalLight(0xc8d4ff, 0.9);
    moon.position.set(-12, 30, 10);
    this.scene.add(moon);
    const warm = new T.PointLight(0xffc27a, 28, 36, 1.6);
    warm.position.set(0, 6, HOUSE_Z + 8);
    this.scene.add(warm);
    const front = new T.PointLight(0xb8a8ff, 5, 14, 1.5);
    front.position.set(0, 4, 3);
    this.scene.add(front);
    this.time = 0;
    this.tweens = [];
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Ночь тёмная: светятся светлячки, окошки, грибы, гирлянды, луна
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.7, 0.45, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    polish(this.composer);
    this.glow = { on: true, slow: 0, seen: 0 };
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
  // Дорожки целиком по ширине при любой форме экрана, домик вдали виден
  fit(aspect) {
    const cam = this.camera;
    cam.position.set(0, 7.4, 11.2);
    const dist = Math.hypot(7.4, 11.2);
    const hfov = 2 * Math.atan(5.6 / dist);
    let vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
    vfov = clamp(vfov, T.MathUtils.degToRad(46), T.MathUtils.degToRad(100));
    cam.fov = T.MathUtils.radToDeg(vfov);
    cam.aspect = aspect;
    cam.lookAt(0, 0.4, -14);
    cam.updateProjectionMatrix();
    // Телефон стоя: под кружками остаётся пустое место — сдвигаем кадр, чтобы кружки стояли у нижнего края
    cam.clearViewOffset();
    cam.updateMatrixWorld(true);
    if (aspect < 1) {
      const full = 1000,
        h = full / aspect;
      const padY = (1 - new T.Vector3(0, 0.3, 0).project(cam).y) / 2;
      const shift = Math.max(0, 0.84 - padY);
      if (shift > 0.01) cam.setViewOffset(full, h, 0, -shift * h, full, h);
    }
  }
  tween(seconds, update) {
    return new Promise((done) => this.tweens.push({ at: this.time, dur: this.motion.matches ? seconds * 0.5 : seconds, update, done }));
  }
  build() {
    const S = this.scene,
      R = rng(7);
    // Небо: от тёмно-синего к фиолетовому и розовому у горизонта
    const sky = new T.Mesh(
      new T.SphereGeometry(400, 32, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {},
        vertexShader: "varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `varying vec3 p; void main(){ float h = normalize(p).y;
          vec3 top = vec3(0.04,0.03,0.16), mid = vec3(0.20,0.10,0.42), low = vec3(0.75,0.32,0.62);
          vec3 c = mix(low, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    S.add(sky);
    // Звёзды
    const n = 900,
      pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = R() * pie * 2,
        y = 0.08 + R() * 0.9,
        r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 350, y * 350, Math.sin(a) * r * 350 - 60], i * 3);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(pos, 3));
    this.stars = new T.Points(sg, new T.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false }));
    S.add(this.stars);
    // Луна
    const moon = new T.Mesh(new T.SphereGeometry(9, 32, 20), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.5, 1.2), fog: false, toneMapped: false }));
    moon.position.set(-70, 85, -260);
    S.add(moon);
    const mg = glowSprite("#fff3c8", 70, 0.5);
    mg.position.copy(moon.position);
    mg.material.fog = false;
    S.add(mg);
    // Северное сияние: три волнистые ленты
    this.aurora = [];
    ["#3dffb0", "#7a6bff", "#ff6bd5"].forEach((c, k) => {
      const geo = new T.PlaneGeometry(260, 60, 60, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.03 + k) * 20);
      const m = new T.Mesh(
        geo,
        new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          fog: false,
          uniforms: { time: { value: 0 }, color: { value: new T.Color(c) }, power: { value: 0.35 } },
          vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader: `uniform float time; uniform vec3 color; uniform float power; varying vec2 vUv;
            void main(){ float wave = sin(vUv.x * 18.0 + time * 0.6) * 0.5 + 0.5; float fall = pow(vUv.y, 1.6) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
              float a = fall * (0.4 + 0.6 * wave) * power; gl_FragColor = vec4(color * a, a); }`,
        }),
      );
      m.position.set(-20 + k * 30, 70 + k * 10, -220 - k * 15);
      m.rotation.x = -0.2;
      S.add(m);
      this.aurora.push(m);
    });
    this.buildGround(R);
    this.buildHouse();
    this.buildLanes();
    this.buildFireflies();
    this.buildParticles();
  }
  buildGround(R) {
    const S = this.scene;
    const ground = new T.Mesh(new T.CircleGeometry(160, 64), matte("#1c1752", { roughness: 1 }));
    ground.rotation.x = -pie / 2;
    ground.position.set(0, 0, -40);
    S.add(ground);
    // Холмы вокруг
    for (let k = 0; k < 14; k++) {
      const side = k % 2 ? 1 : -1,
        h = new T.Mesh(new T.SphereGeometry(10 + R() * 8, 24, 12), matte(["#33307e", "#2c2a70", "#3a2f86"][k % 3]));
      h.scale.y = 0.35;
      h.position.set(side * (16 + R() * 24), -1, -20 - R() * 90);
      S.add(h);
    }
    // Деревья-силуэты с фонариками
    const lantern = ["#ffcf6b", "#ff8fd0", "#7fe8ff", "#b6ff7a"];
    for (let k = 0; k < 26; k++) {
      const side = k % 2 ? 1 : -1,
        x = side * (7.5 + R() * 18),
        z = 4 - R() * 70;
      const t = new T.Group();
      const trunk = new T.Mesh(new T.CylinderGeometry(0.18, 0.26, 2.2, 8), matte("#2a1a3a"));
      trunk.position.y = 1.1;
      t.add(trunk);
      const crown = new T.Mesh(new T.IcosahedronGeometry(1.6 + R(), 1), matte(["#1f5a6a", "#245066", "#2e4f7a"][k % 3], { flatShading: true }));
      crown.position.y = 3.2;
      t.add(crown);
      if (k % 2 === 0) {
        const c = lantern[k % 4];
        const l = new T.Mesh(new T.SphereGeometry(0.18, 12, 8), glowing(c, 3));
        l.position.set(side * -0.8, 2.3, 0.6);
        t.add(l);
      }
      t.position.set(x, 0, z);
      t.scale.setScalar(0.9 + R() * 0.7);
      S.add(t);
    }
    // Светящиеся грибы вдоль дорожек
    const capGeo = new T.SphereGeometry(0.5, 16, 10, 0, pie * 2, 0, pie / 2);
    const stemGeo = new T.CylinderGeometry(0.14, 0.2, 0.6, 10);
    const capMat = instanceGlow(new T.MeshStandardMaterial({ roughness: 0.4 }), 1.25);
    const count = 46;
    const caps = new T.InstancedMesh(capGeo, capMat, count),
      stems = new T.InstancedMesh(stemGeo, glowing("#fff2e0", 0.5), count);
    const d = new T.Object3D(),
      cols = ["#ff5fd2", "#5fe8ff", "#b47cff", "#7dff9a", "#ffd25f"];
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const s = 0.5 + R() * 0.9;
      d.position.set(side * (5.6 + R() * 4), 0.3 * s, 2 - R() * 44);
      d.scale.setScalar(s);
      d.rotation.set(0, R() * 6, (R() - 0.5) * 0.3);
      d.updateMatrix();
      stems.setMatrixAt(i, d.matrix);
      d.position.y += 0.28 * s;
      d.updateMatrix();
      caps.setMatrixAt(i, d.matrix);
      caps.setColorAt(i, new T.Color(cols[i % cols.length]));
    }
    S.add(caps, stems);
    // Травка
    const blade = new T.ConeGeometry(0.06, 0.5, 4);
    blade.translate(0, 0.25, 0);
    const grass = new T.InstancedMesh(blade, new T.MeshStandardMaterial({ color: "#3f6fb0", roughness: 0.8 }), 900);
    for (let i = 0; i < 900; i++) {
      const side = i % 2 ? 1 : -1;
      d.position.set(side * (4.9 + R() * 14), 0, 4 - R() * 60);
      d.rotation.set((R() - 0.5) * 0.6, R() * 3, (R() - 0.5) * 0.6);
      d.scale.setScalar(0.6 + R());
      d.updateMatrix();
      grass.setMatrixAt(i, d.matrix);
    }
    S.add(grass);
    // Светлячки вокруг — просто для красоты
    const m = 160,
      fp = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) fp.set([(R() - 0.5) * 50, 0.5 + R() * 6, 6 - R() * 60], i * 3);
    const fg = new T.BufferGeometry();
    fg.setAttribute("position", new T.BufferAttribute(fp, 3));
    this.ambient = new T.Points(fg, new T.PointsMaterial({ color: new T.Color(1.6, 2.0, 0.8), size: 0.35, map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    this.ambient.userData.base = fp.slice();
    S.add(this.ambient);
  }
  // Концертный домик: круглая башенка с куполом, окошки и гирлянда зажигаются от пойманных светлячков
  buildHouse() {
    const S = this.scene,
      g = new T.Group();
    g.position.set(0, 0, HOUSE_Z);
    const body = new T.Mesh(new T.CylinderGeometry(6, 6.4, 6.5, 40, 1, false), glossy("#ffb36b", { roughness: 0.6, clearcoat: 0.2 }));
    body.position.y = 3.25;
    g.add(body);
    const band = new T.Mesh(new T.TorusGeometry(6.1, 0.18, 8, 60), glossy("#ffffff"));
    band.rotation.x = pie / 2;
    band.position.y = 3.3;
    g.add(band);
    // Полосатый купол
    const dome = new T.Mesh(
      new T.SphereGeometry(6.6, 40, 20, 0, pie * 2, 0, pie / 2),
      new T.MeshPhysicalMaterial({
        roughness: 0.4,
        clearcoat: 0.6,
        map: canvasTexture(256, 16, (x) => {
          const c = ["#ff4f8b", "#ffd25f", "#3fe07a", "#3fb4ff", "#b47cff", "#ff8f3f"];
          for (let i = 0; i < 16; i++) {
            x.fillStyle = c[i % c.length];
            x.fillRect(i * 16, 0, 16, 16);
          }
        }),
      }),
    );
    dome.position.y = 6.5;
    g.add(dome);
    const spire = new T.Mesh(new T.ConeGeometry(0.5, 1.6, 16), glossy("#ffd25f", { metalness: 0.6, roughness: 0.25 }));
    spire.position.y = 13.7;
    g.add(spire);
    // Сцена-арка спереди с занавесом
    const arch = new T.Mesh(new T.TorusGeometry(2.6, 0.35, 12, 40, pie), glossy("#ffd25f", { metalness: 0.5, roughness: 0.3 }));
    arch.position.set(0, 2.6, 5.9);
    g.add(arch);
    const curtain = new T.Mesh(new T.CircleGeometry(2.5, 40, 0, pie), matte("#b8235a"));
    curtain.position.set(0, 2.6, 6.0);
    g.add(curtain);
    const inner = new T.Mesh(new T.PlaneGeometry(5, 2.6), matte("#b8235a"));
    inner.position.set(0, 1.3, 6.0);
    g.add(inner);
    // Окошки по передней дуге башенки: два ряда (по центру нижнего ряда — арка сцены)
    this.windows = [];
    const winGeo = new RoundedBoxGeometry(0.9, 1.1, 0.2, 2, 0.12);
    for (let row = 0; row < 2; row++)
      for (let k = 0; k < 9; k++) {
        const ang = ((k - 4) / 4) * 1.15;
        if (row === 0 && Math.abs(ang) < 0.5) continue;
        const w = new T.Mesh(winGeo, new T.MeshStandardMaterial({ color: "#3a2a6a", emissive: "#ffd27a", emissiveIntensity: 0, roughness: 0.5 }));
        const r = 6.25;
        w.position.set(Math.sin(ang) * r, 1.7 + row * 2.6, Math.cos(ang) * r);
        w.lookAt(w.position.x * 2, w.position.y, w.position.z * 2);
        g.add(w);
        this.windows.push(w);
      }
    // Гирлянда по краю купола спереди
    this.bulbs = [];
    const bulbCols = ["#ff4f8b", "#ffd25f", "#3fe07a", "#3fb4ff", "#ff8fd0"];
    for (let k = 0; k < 24; k++) {
      const ang = -pie / 2 + (k / 23) * pie,
        c = bulbCols[k % bulbCols.length];
      const bl = new T.Mesh(new T.SphereGeometry(0.2, 12, 8), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.05 }));
      bl.position.set(Math.sin(ang) * 6.75, 6.55 + Math.sin(k * 0.9) * 0.08, Math.cos(ang) * 6.75);
      bl.userData.bulb = true;
      g.add(bl);
      this.bulbs.push(bl);
    }
    // Крыльцо-сцена и зверята-музыканты над концами дорожек
    const porch = new T.Mesh(new RoundedBoxGeometry(11, 0.6, 3.2, 2, 0.2), glossy("#c98b55", { roughness: 0.6 }));
    porch.position.set(0, 0.3, 7.6);
    g.add(porch);
    S.add(g);
    this.house = g;
    this.musicians = ["frog", "bunny", "bear", "cat"].map((kind, i) => {
      const m = this.animal(kind, LANE_COLORS[i]);
      m.position.set(LANE_X[i] * 1.15, 0.6, HOUSE_Z + 7.6);
      S.add(m);
      return m;
    });
    // Падающая звезда: головка и хвост из тающих огоньков
    this.meteor = { parts: [0, 1, 2, 3, 4].map((i) => glowSprite(i ? "#bfe6ff" : "#ffffff", 2.4 - i * 0.4, 0)), at: 0, next: 5, from: new T.Vector3(), dir: new T.Vector3() };
    for (const sp of this.meteor.parts) S.add(sp);
    this.owl = this.makeOwl();
    this.owl.position.set(0, 13.8, HOUSE_Z + 1.2);
    this.owl.scale.setScalar(1.7);
    S.add(this.owl);
  }
  // Зверёк-музыкант: голова, ушки, глазки и шарфик цвета своей дорожки
  animal(kind, color) {
    const g = new T.Group();
    const fur = { frog: "#5fd36a", bunny: "#ffffff", bear: "#c98955", cat: "#b4bfd4" }[kind];
    const body = new T.Mesh(new T.SphereGeometry(0.55, 20, 14), matte(fur));
    body.scale.set(1, 1.1, 0.9);
    body.position.y = 0.6;
    g.add(body);
    g.userData.body = body;
    g.userData.eyes = [];
    const head = new T.Group();
    head.position.y = 1.45;
    g.add(head);
    const skull = new T.Mesh(new T.SphereGeometry(0.5, 20, 14), matte(fur));
    if (kind === "frog") skull.scale.set(1.2, 0.85, 1);
    head.add(skull);
    for (const s of [-1, 1]) {
      if (kind === "bunny") {
        const ear = new T.Mesh(new T.CapsuleGeometry(0.11, 0.6, 6, 10), matte(fur));
        ear.position.set(s * 0.2, 0.65, 0);
        ear.rotation.z = -s * 0.15;
        head.add(ear);
      } else if (kind === "cat") {
        const ear = new T.Mesh(new T.ConeGeometry(0.16, 0.3, 10), matte(fur));
        ear.position.set(s * 0.28, 0.45, 0);
        ear.rotation.z = -s * 0.3;
        head.add(ear);
      } else if (kind === "bear") {
        const ear = new T.Mesh(new T.SphereGeometry(0.16, 12, 8), matte(fur));
        ear.position.set(s * 0.36, 0.38, 0);
        head.add(ear);
      }
      const eyeY = kind === "frog" ? 0.38 : 0.08;
      if (kind === "frog") {
        const bulge = new T.Mesh(new T.SphereGeometry(0.18, 12, 8), matte(fur));
        bulge.position.set(s * 0.26, 0.33, 0.12);
        head.add(bulge);
      }
      const eye = new T.Mesh(new T.SphereGeometry(0.08, 12, 8), glossy("#1d1420", { roughness: 0.1 }));
      eye.position.set(s * (kind === "frog" ? 0.26 : 0.17), eyeY, 0.44);
      head.add(eye);
      g.userData.eyes.push(eye);
      const shine = new T.Mesh(new T.SphereGeometry(0.025, 8, 6), new T.MeshBasicMaterial({ color: "#ffffff" }));
      shine.position.set(s * (kind === "frog" ? 0.26 : 0.17) + 0.025, eyeY + 0.03, 0.51);
      head.add(shine);
      g.userData.eyes.push(shine);
      const cheek = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), matte("#ff9fb0"));
      cheek.scale.set(1, 0.6, 0.4);
      cheek.position.set(s * 0.3, -0.08, 0.4);
      head.add(cheek);
    }
    const scarf = new T.Mesh(new T.TorusGeometry(0.42, 0.11, 10, 24), glowing(color, 0.6));
    scarf.rotation.x = pie / 2;
    scarf.position.y = 1.08;
    g.add(scarf);
    g.userData.head = head;
    g.userData.hop = 0;
    return g;
  }
  makeOwl() {
    const g = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(0.6, 20, 16), matte("#8a6a4a"));
    body.scale.set(1, 1.15, 0.9);
    g.add(body);
    g.userData.eyes = [];
    const belly = new T.Mesh(new T.SphereGeometry(0.45, 16, 12), matte("#f2dcc0"));
    belly.scale.set(0.9, 1.1, 0.5);
    belly.position.set(0, -0.08, 0.32);
    g.add(belly);
    for (const s of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.2, 16, 12), matte("#ffffff"));
      eye.position.set(s * 0.22, 0.35, 0.42);
      g.add(eye);
      g.userData.eyes.push(eye);
      const pupil = new T.Mesh(new T.SphereGeometry(0.1, 12, 8), glossy("#1d1420", { roughness: 0.1 }));
      pupil.position.set(s * 0.22, 0.35, 0.58);
      g.add(pupil);
      g.userData.eyes.push(pupil);
      const tuft = new T.Mesh(new T.ConeGeometry(0.12, 0.3, 8), matte("#6e5238"));
      tuft.position.set(s * 0.35, 0.72, 0);
      tuft.rotation.z = -s * 0.4;
      g.add(tuft);
    }
    const beak = new T.Mesh(new T.ConeGeometry(0.07, 0.18, 8), glossy("#ffb02e"));
    beak.rotation.x = pie / 2 + 0.3;
    beak.position.set(0, 0.2, 0.6);
    g.add(beak);
    // Крыло с палочкой дирижёра
    const arm = new T.Group();
    arm.position.set(0.55, 0.1, 0.1);
    const wing = new T.Mesh(new T.SphereGeometry(0.22, 12, 8), matte("#6e5238"));
    wing.scale.set(0.5, 1.2, 0.6);
    wing.position.y = 0.2;
    arm.add(wing);
    const baton = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.9, 6), glowing("#ffffff", 2.5));
    baton.position.set(0.1, 0.75, 0);
    baton.rotation.z = -0.3;
    arm.add(baton);
    g.add(arm);
    g.userData.arm = arm;
    return g;
  }
  // Дорожки: светящиеся ленты с бегущими к игроку полосками и кружки-барабаны в конце
  buildLanes() {
    const S = this.scene;
    this.lanes = LANE_X.map((x, i) => {
      const len = 46;
      const mat = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        uniforms: { time: { value: 0 }, color: { value: new T.Color(LANE_COLORS[i]) }, pulse: { value: 0 }, on: { value: 1 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `uniform float time; uniform vec3 color; uniform float pulse; uniform float on; varying vec2 vUv;
          void main(){ float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
            float rim = 1.0 - smoothstep(0.0, 0.08, min(vUv.x, 1.0 - vUv.x));
            float flow = smoothstep(0.75, 1.0, fract(vUv.y * 23.0 - time * 1.4));
            float fade = smoothstep(0.0, 0.25, vUv.y) * (0.55 + 0.45 * vUv.y);
            float a = (0.26 + flow * 0.3 + rim * 0.9 + pulse * 0.35) * fade * on;
            gl_FragColor = vec4(color * a * 1.4, a); }`,
      });
      const m = new T.Mesh(new T.PlaneGeometry(1.9, len), mat);
      m.rotation.x = -pie / 2;
      m.position.set(x, 0.03, 1 - len / 2);
      S.add(m);
      // Кружок-барабан
      const pad = new T.Group();
      const drum = new T.Mesh(new T.CylinderGeometry(0.85, 0.9, 0.3, 40), glossy(LANE_COLORS[i], { emissive: LANE_COLORS[i], emissiveIntensity: 0.35, roughness: 0.25, clearcoat: 1 }));
      drum.position.y = 0.15;
      pad.add(drum);
      const top = new T.Mesh(new T.CylinderGeometry(0.72, 0.72, 0.04, 40), glossy(new T.Color(LANE_COLORS[i]).lerp(new T.Color("#ffffff"), 0.55), { roughness: 0.25 }));
      top.position.y = 0.31;
      pad.add(top);
      const ring = new T.Mesh(new T.TorusGeometry(0.72, 0.06, 10, 48), new T.MeshStandardMaterial({ color: LANE_COLORS[i], emissive: LANE_COLORS[i], emissiveIntensity: 1.6 }));
      ring.rotation.x = pie / 2;
      ring.position.y = 0.34;
      pad.add(ring);
      const halo = new T.Mesh(new T.RingGeometry(0.95, 1.35, 48), new T.MeshBasicMaterial({ color: LANE_COLORS[i], transparent: true, opacity: 0.0, blending: T.AdditiveBlending, depthWrite: false }));
      halo.rotation.x = -pie / 2;
      halo.position.y = 0.04;
      pad.add(halo);
      pad.position.set(x, 0, 0);
      S.add(pad);
      return { strip: m, mat, pad, drum, ring, halo, flash: 0, press: 0, early: 0, pulse: 0, on: 1 };
    });
  }
  setLanes(active) {
    this.lanes.forEach((l, i) => {
      l.on = active.includes(i) ? 1 : 0.18;
      l.mat.uniforms.on.value = l.on;
      l.pad.visible = active.includes(i);
    });
    this.musicians.forEach((m, i) => (m.visible = active.includes(i)));
  }
  // Светлячки-нотки: светящееся тельце, крылышки, кольцо «сейчас!» и пустой контур промаха
  buildFireflies() {
    const n = 140;
    this.fly = {
      n,
      body: new T.InstancedMesh(new T.SphereGeometry(0.42, 18, 14), instanceGlow(new T.MeshStandardMaterial({ roughness: 0.3 }), 2.4), n),
      wing: new T.InstancedMesh(new T.CircleGeometry(0.4, 16), new T.MeshBasicMaterial({ color: new T.Color(1.3, 1.3, 1.5), transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false, toneMapped: false }), n * 2),
      ring: new T.InstancedMesh(new T.TorusGeometry(0.66, 0.06, 8, 32), new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.2, 2.2), toneMapped: false }), n),
      hollow: new T.InstancedMesh(new T.TorusGeometry(0.3, 0.035, 8, 28), new T.MeshBasicMaterial({ color: "#8a86b8", transparent: true, opacity: 0.8 }), n),
    };
    for (const k of ["body", "wing", "ring", "hollow"]) {
      this.fly[k].frustumCulled = false;
      this.fly[k].count = 0;
      this.scene.add(this.fly[k]);
    }
    for (let i = 0; i < n; i++) this.fly.body.setColorAt(i, new T.Color("#ffffff"));
    this.dummy = new T.Object3D();
  }
  // Где светлячок ноты при времени песни t
  notePos(note, t, out) {
    const dt = note.t - t;
    const z = (dt / APPROACH) * SPAWN_Z;
    const x = LANE_X[note.lane];
    // Вылетает из окошка домика вверх, потом летит над дорожкой и опускается к кружку
    const lift = Math.max(0, z / SPAWN_Z);
    out.set(x, 0.75 + lift * 2.2 + Math.sin(t * 6 + note.i) * 0.08 * (1 - lift), z);
    return out;
  }
  // Каждый кадр: расставить светлячков. notes — ноты судьи (state: wait | hit | miss)
  drawNotes(notes, t) {
    const F = this.fly,
      d = this.dummy,
      p = new T.Vector3();
    let b = 0,
      w = 0,
      r = 0,
      h = 0;
    const col = new T.Color();
    for (const n of notes) {
      const dt = n.t - t;
      if (dt > APPROACH || b >= F.n) continue;
      if (n.state === "hit") continue;
      if (n.state === "miss") {
        if (dt < -0.7) continue;
        this.notePos(n, t, p);
        d.position.copy(p);
        d.rotation.set(-pie / 2, 0, 0);
        d.scale.setScalar(1 + Math.min(1, -dt) * 0.6);
        d.updateMatrix();
        F.hollow.setMatrixAt(h++, d.matrix);
        continue;
      }
      if (dt < -WINDOW - 0.05) continue;
      this.notePos(n, t, p);
      const now = Math.abs(dt) <= WINDOW;
      const appear = clamp((APPROACH - dt) / 0.35, 0, 1);
      d.position.copy(p);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(appear * (now ? 1.3 : 1));
      d.updateMatrix();
      F.body.setMatrixAt(b, d.matrix);
      F.body.setColorAt(b, col.set(LANE_COLORS[n.lane]));
      b++;
      // Крылышки машут
      for (const s of [-1, 1]) {
        d.position.copy(p).add(new T.Vector3(s * 0.45, 0.22, -0.05));
        d.rotation.set(0.2, 0, s * (0.5 + Math.sin(this.time * 30 + n.i) * 0.6));
        d.scale.set(appear * 0.9, appear * 1.3, 1);
        d.updateMatrix();
        F.wing.setMatrixAt(w++, d.matrix);
      }
      if (now) {
        d.position.copy(p);
        d.rotation.set(-pie / 2, 0, 0);
        d.scale.setScalar(1 + Math.sin(this.time * 20) * 0.08);
        d.updateMatrix();
        F.ring.setMatrixAt(r++, d.matrix);
      }
    }
    F.body.count = b;
    F.wing.count = w;
    F.ring.count = r;
    F.hollow.count = h;
    for (const k of ["body", "wing", "ring", "hollow"]) F[k].instanceMatrix.needsUpdate = true;
    if (F.body.instanceColor) F.body.instanceColor.needsUpdate = true;
  }
  // ---------- Отклик ----------
  tap(lane) {
    const l = this.lanes[lane];
    if (l) l.press = 1;
  }
  early(lane) {
    const l = this.lanes[lane];
    if (l) l.early = 1;
  }
  // Попадание: искры, кружок вспыхивает, музыкант подпрыгивает, огонёк летит в окошко
  hit(lane, perfect, target) {
    const l = this.lanes[lane];
    l.flash = 1;
    l.press = 1;
    const at = new T.Vector3(LANE_X[lane], 0.8, 0);
    this.burst(at, perfect ? 34 : 20, [LANE_COLORS[lane], "#ffffff", "#fff3a0"], perfect ? 4.5 : 3.2);
    const m = this.musicians[lane];
    if (m) {
      m.userData.hop = 1;
      if (perfect) m.userData.spin = 1;
    }
    if (target != null) this.sendLight(at, target, LANE_COLORS[lane]);
  }
  // Огонёк летит дугой к окошку или лампочке гирлянды и зажигает её
  sendLight(from, index, color) {
    const lights = this.lightList();
    const target = lights[index % lights.length];
    if (!target) return;
    const to = new T.Vector3();
    target.getWorldPosition(to);
    const s = glowSprite(color, 1.2, 1);
    s.material.color.multiplyScalar(2);
    s.position.copy(from);
    this.scene.add(s);
    const mid = from.clone().lerp(to, 0.5).add(new T.Vector3(0, 8, 0));
    this.tween(0.75, (p) => {
      const a = from.clone().lerp(mid, p),
        b = mid.clone().lerp(to, p);
      s.position.copy(a.lerp(b, p));
      s.scale.setScalar(1.2 - p * 0.6);
    }).then(() => {
      s.removeFromParent();
      this.lightOn(target);
    });
  }
  lightList() {
    return [...this.windows, ...this.bulbs];
  }
  lightOn(obj) {
    obj.material.emissiveIntensity = obj.userData.bulb ? 2.6 : 1.8;
    obj.userData.lit = this.time;
    this.burst(obj.getWorldPosition(new T.Vector3()), 6, ["#ffe6a0", "#ffffff"], 1.6);
  }
  resetLights() {
    for (const w of this.windows) w.material.emissiveIntensity = 0;
    for (const b of this.bulbs) {
      b.userData.bulb = true;
      b.material.emissiveIntensity = 0.05;
    }
  }
  // Конец концерта: зажигается всё, салют
  celebrate(full) {
    if (full) for (const o of this.lightList()) this.lightOn(o);
    this.fireworks = full ? 7 : 3;
    this.fwAt = 0;
  }
  // На каждую долю: дорожки вспыхивают, сова машет палочкой
  beat(strong) {
    for (const l of this.lanes) l.pulse = strong ? 1 : 0.6;
    this.owlBeat = this.time;
    this.bob = strong ? 1 : 0.6;
    this.beatNo = (this.beatNo || 0) + 1;
  }
  // Какая дорожка под пальцем: ближайший кружок по горизонтали экрана (только включённые)
  laneAt(clientX, clientY, active) {
    const r = this.canvas.getBoundingClientRect();
    let best = -1,
      bd = Infinity;
    for (const i of active) {
      const v = new T.Vector3(LANE_X[i], 0.3, 0).project(this.camera);
      const x = r.left + ((v.x + 1) / 2) * r.width;
      const d = Math.abs(clientX - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  padScreen(i) {
    const r = this.canvas.getBoundingClientRect(),
      v = new T.Vector3(LANE_X[i], 0.3, 0).project(this.camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  // ---------- Искры ----------
  buildParticles() {
    const n = 600;
    this.sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.08, 0), new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.2, 2.2), toneMapped: false }), n);
    this.sparks.frustumCulled = false;
    this.pool = Array.from({ length: n }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, s: 1 }));
    this.next = 0;
    for (let i = 0; i < n; i++) this.sparks.setColorAt(i, new T.Color("#ffffff"));
    this.scene.add(this.sparks);
  }
  burst(at, count, colors, speed) {
    for (let k = 0; k < count; k++) {
      const s = this.pool[this.next];
      this.sparks.setColorAt(this.next, new T.Color(colors[k % colors.length]));
      this.next = (this.next + 1) % this.pool.length;
      s.p.copy(at);
      s.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      s.max = s.life = 0.5 + Math.random() * 0.7;
      s.s = 0.7 + Math.random();
    }
    this.sparks.instanceColor.needsUpdate = true;
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
    for (const l of this.lanes) {
      l.mat.uniforms.time.value = t;
      l.pulse *= Math.pow(0.02, dt);
      l.mat.uniforms.pulse.value = l.pulse;
      l.flash *= Math.pow(0.01, dt);
      l.press *= Math.pow(0.002, dt);
      l.early *= Math.pow(0.02, dt);
      l.drum.scale.y = 1 - l.press * 0.35;
      l.drum.material.emissiveIntensity = 0.35 + l.flash * 2.4 + l.early * 0.6;
      l.ring.material.emissiveIntensity = 1.6 + l.flash * 3 + l.pulse * 0.8;
      l.halo.material.opacity = l.flash * 0.9 + l.early * 0.35 + l.pulse * 0.15;
      l.halo.scale.setScalar(1 + (1 - l.flash) * 0.5 * l.flash);
    }
    // Моргание: у каждого свой счётчик, глазки на миг сплющиваются
    const blink = (u) => {
      if (u.blinkAt == null) u.blinkAt = t + 1 + Math.random() * 3;
      if (t > u.blinkAt + 0.14) u.blinkAt = t + 1.8 + Math.random() * 3.5;
      const k = t > u.blinkAt ? 0.12 : 1;
      for (const e of u.eyes) e.scale.y = k;
    };
    this.bob = (this.bob || 0) * Math.pow(0.004, dt);
    const side = (this.beatNo || 0) % 2 ? 1 : -1;
    this.swing = (this.swing || 0) + (side - (this.swing || 0)) * Math.min(1, dt * 7);
    for (const m of this.musicians) {
      const u = m.userData;
      u.hop *= Math.pow(0.01, dt);
      u.spin = (u.spin || 0) * Math.pow(0.02, dt);
      m.position.y = 0.6 + Math.sin((1 - u.hop) * pie) * u.hop * 0.9;
      // Танец: приседают на долю, качаются из стороны в сторону, тянутся в прыжке
      const squash = this.bob * 0.14 * calm,
        stretch = u.hop * 0.18;
      m.scale.set(1 + squash - stretch * 0.5, 1 - squash + stretch, 1 + squash - stretch * 0.5);
      m.rotation.z = this.swing * 0.12 * calm * Math.min(1, this.bob * 8);
      m.rotation.y = (1 - Math.pow(1 - u.spin, 2)) * pie * 2 * (u.spin > 0.01 ? 1 : 0);
      u.body.scale.y = 1.1 * (1 + Math.sin(t * 1.8 + m.position.x) * 0.03);
      u.head.rotation.z = Math.sin(t * 2 + m.position.x) * 0.08 * calm;
      u.head.rotation.x = -u.hop * 0.35;
      blink(u);
    }
    if (this.owl) {
      const since = t - (this.owlBeat || -9);
      this.owl.userData.arm.rotation.z = -0.4 + Math.max(0, 1 - since * 3) * 0.9 * calm;
      this.owl.rotation.y = Math.sin(t * 0.7) * 0.15 * calm;
      const k = 1.7 * (1 + Math.sin(t * 1.5) * 0.015);
      this.owl.scale.set(k * (1 + this.bob * 0.06 * calm), k * (1 - this.bob * 0.08 * calm), k);
      blink(this.owl.userData);
    }
    // Падающая звезда раз в несколько секунд
    const me = this.meteor;
    if (me && calm === 1) {
      if (t > me.next) {
        const dirX = Math.random() < 0.5 ? 1 : -1;
        me.from.set(-dirX * (8 + Math.random() * 22), 24 + Math.random() * 10, HOUSE_Z - 12);
        me.dir.set(dirX * 26, -9 - Math.random() * 5, 0);
        me.at = t;
        me.next = t + 5 + Math.random() * 8;
      }
      const life = (t - me.at) / 1.1;
      me.parts.forEach((sp, i) => {
        const lt = life - i * 0.035;
        sp.material.opacity = lt > 0 && lt < 1 ? Math.sin(lt * pie) * (0.9 - i * 0.15) : 0;
        sp.position.copy(me.from).addScaledVector(me.dir, Math.max(0, lt) * 1.1);
      });
    }
    for (const a of this.aurora) a.material.uniforms.time.value = t * calm;
    this.stars.material.opacity = 0.75 + Math.sin(t * 1.3) * 0.15;
    const ap = this.ambient.geometry.attributes.position,
      base = this.ambient.userData.base;
    for (let i = 0; i < ap.count; i++) {
      ap.setX(i, base[i * 3] + Math.sin(t * 0.4 + i) * 0.8 * calm);
      ap.setY(i, base[i * 3 + 1] + Math.sin(t * 0.7 + i * 1.3) * 0.4 * calm);
    }
    ap.needsUpdate = true;
    // Огоньки гирлянды мигают, когда горят
    for (const b of this.bulbs) if (b.userData.lit) b.material.emissiveIntensity = 1.8 + Math.max(0, Math.sin(t * 4 + b.position.x)) * 1.2;
    // Салют
    if (this.fireworks > 0) {
      this.fwAt -= dt;
      if (this.fwAt <= 0) {
        this.fireworks--;
        this.fwAt = 0.45;
        const at = new T.Vector3((Math.random() - 0.5) * 22, 12 + Math.random() * 8, HOUSE_Z + 4 + Math.random() * 10);
        const pal = [["#ff4f8b", "#ffd25f"], ["#3fe07a", "#7fe8ff"], ["#b47cff", "#ff8fd0"], ["#ffd25f", "#ffffff"]][Math.floor(Math.random() * 4)];
        this.burst(at, 60, pal, 7);
        if (this.onBoom) this.onBoom();
      }
    }
    const d = this.dummy;
    this.pool.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 3 * dt;
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
