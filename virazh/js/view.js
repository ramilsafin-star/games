// Сцена «Виража»: дорога, земля, декорации четырёх тем, машины, камера, частицы.
import * as T from "../vendor/three/three.module.min.js?v=81afe732";
import { clamp, damp, lerp, seeded, smooth, wrapAngle } from "./kit.js?v=81afe732";
import { trackPoint } from "./tracks.js?v=81afe732";
import { LIVERIES, PHYS } from "./rules.js?v=81afe732";
import { PROPS, canvasTexture, fuse, makeCar, makePodiumBlock } from "./models.js?v=81afe732";
import { Pool, Streaks } from "./fx.js?v=81afe732";

const TAU = Math.PI * 2;
const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), S = new T.Vector3(), P = new T.Vector3();
const C = new T.Color();
const hex = (c) => "#" + c.getHexString();
const mix = (a, b, k) => hex(new T.Color(a).lerp(new T.Color(b), k));

// Оформление трасс. sky — зенит, середина, горизонт; fog — цвет, начало, конец; sun — цвет, сила, направление
const THEMES = {
  sea: {
    sky: ["#1b78dc", "#63bbfa", "#d6f2ff"], fog: ["#cbeaff", 260, 1500],
    sun: ["#fff3d2", 2.5, [0.45, 0.8, 0.4]], hemi: ["#e6f6ff", "#cdbd8c", 1.3],
    asphalt: "#5b626d", mark: "#ffffff", curb: ["#ff4a4a", "#ffffff"], shoulder: ["#efdca4", "#e3cd8f"],
    wall: ["#ffffff", "#2a86ff"], dust: "#ecdcae", cloud: "#ffffff",
  },
  pine: {
    sky: ["#3587d6", "#96ccf5", "#ffeccc"], fog: ["#e3ecd6", 200, 1150],
    sun: ["#ffe9c4", 2.3, [-0.5, 0.72, 0.35]], hemi: ["#e9f4ff", "#7fa068", 1.25],
    asphalt: "#565c63", mark: "#fff6d8", curb: ["#ff7b2e", "#ffffff"], shoulder: ["#7fc662", "#70b956"],
    wall: ["#a87647", "#7d5230"], dust: "#bfa27a", cloud: "#ffffff",
  },
  canyon: {
    sky: ["#4b46b8", "#f98f6a", "#ffdca6"], fog: ["#ffc497", 190, 1050],
    sun: ["#ffd3a2", 2.4, [0.6, 0.42, -0.5]], hemi: ["#ffe2c4", "#b8603a", 1.2],
    asphalt: "#6b5d5b", mark: "#fff1d0", curb: ["#ffd23e", "#3a2f33"], shoulder: ["#dc8b52", "#cf7b45"],
    wall: ["#ffd23e", "#3a2f33"], dust: "#e6a670", cloud: "#ffd9c2",
  },
  city: {
    sky: ["#060920", "#1a1550", "#5b2b80"], fog: ["#2b1e58", 150, 900],
    sun: ["#c4d0ff", 1.7, [-0.3, 0.8, 0.4]], hemi: ["#b4bdff", "#4a3a86", 2.3],
    asphalt: "#2b304a", mark: "#7df9ff", curb: ["#ff4fd8", "#262a4d"], shoulder: ["#3b4066", "#353a5e"],
    wall: ["#232850", "#00e5ff"], dust: "#9aa0cc", cloud: "#3a2f6e", night: true,
  },
};

function makeNoise(seed) {
  const h = (x, z) => {
    const v = Math.sin(x * 127.1 + z * 311.7 + seed * 17.3) * 43758.5453;
    return v - Math.floor(v);
  };
  const one = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    let fx = x - ix, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx);
    fz = fz * fz * (3 - 2 * fz);
    return lerp(lerp(h(ix, iz), h(ix + 1, iz), fx), lerp(h(ix, iz + 1), h(ix + 1, iz + 1), fx), fz);
  };
  return (x, z) => one(x, z) * 0.6 + one(x * 2.1 + 9, z * 2.1 + 4) * 0.28 + one(x * 4.3 + 3, z * 4.3 + 7) * 0.12;
}

// Лента вдоль трассы. cross — точки поперечного сечения слева направо: [сдвиг от оси, высота, u]
function ribbon(track, cross, vRepeat) {
  const { n } = track, m = cross.length;
  const pos = new Float32Array((n + 1) * m * 3), uv = new Float32Array((n + 1) * m * 2);
  for (let r = 0; r <= n; r++) {
    const i = r % n;
    for (let c = 0; c < m; c++) {
      const [d, y, u] = cross[c], k = r * m + c;
      pos[k * 3] = track.px[i] + track.nx[i] * d;
      pos[k * 3 + 1] = track.py[i] + y;
      pos[k * 3 + 2] = track.pz[i] + track.nz[i] * d;
      uv[k * 2] = u;
      uv[k * 2 + 1] = (r / n) * vRepeat;
    }
  }
  const idx = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < m - 1; c++) {
      const a = r * m + c, b = a + 1, e = a + m, f = e + 1;
      idx.push(a, b, f, a, f, e);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function glowTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,.55)");
    grad.addColorStop(0.65, "rgba(255,255,255,.12)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(60, 1, 0.5, 5200);
    this.scene.add(this.camera);
    this.world = new T.Group(); // всё, что относится к трассе, — пересоздаётся при смене трассы
    this.scene.add(this.world);
    this.glow = glowTexture();
    this.cars = [];
    this.camYaw = 0;
    this.camY = 0;
    this.kick = 0;
    this.shake = 0;
    this.time = 0;
    this.orbit = 0;
    this.streaks = new Streaks(this.camera);
    this.look = new T.Vector3();
    this.shift = { x: 0, y: 0 };
    this.shifted = null;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.clearViewOffset();
    this.shifted = null;
    this.camera.updateProjectionMatrix();
  }

  // В меню центр кадра сдвигается на (x, y) пикселей — туда, где нет карточки
  setShift(x, y) {
    this.shift = { x, y };
    this.shifted = null;
  }

  dispose(root) {
    root.traverse((o) => {
      if (o.geometry && !o.isSprite) o.geometry.dispose(); // у спрайтов геометрия общая на всю библиотеку
      if (o.material) for (const m of [].concat(o.material)) {
        for (const key of ["map", "emissiveMap"]) if (m[key] && m[key] !== this.glow) m[key].dispose();
        m.dispose();
      }
    });
    root.clear();
  }

  // ---------- Трасса ----------
  build(track) {
    this.dispose(this.world);
    this.track = track;
    this.cars = [];
    const th = (this.theme = THEMES[track.theme]);
    const rnd = (this.rnd = seeded(track.n * 13 + 5));
    const w = this.world, scene = this.scene;
    scene.fog = new T.Fog(th.fog[0], th.fog[1], th.fog[2]);
    this.renderer.setClearColor(th.fog[0]);
    w.add(new T.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
    const sun = new T.DirectionalLight(th.sun[0], th.sun[1]);
    sun.position.set(...th.sun[2]).multiplyScalar(100);
    w.add(sun);

    // небо
    const skyTex = canvasTexture(4, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, th.sky[0]);
      grad.addColorStop(0.32, th.sky[1]);
      grad.addColorStop(0.5, th.sky[2]);
      grad.addColorStop(0.52, th.fog[0]);
      grad.addColorStop(1, th.fog[0]);
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
    });
    this.sky = new T.Mesh(new T.SphereGeometry(4600, 20, 14), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10;
    w.add(this.sky);
    this.sunSprite = new T.Sprite(new T.SpriteMaterial({ map: this.glow, color: th.night ? "#dfe6ff" : th.sun[0], fog: false, depthWrite: false, blending: th.night ? T.NormalBlending : T.AdditiveBlending }));
    this.sunSprite.scale.setScalar(th.night ? 420 : 1500);
    this.sunSprite.renderOrder = -9;
    w.add(this.sunSprite);

    this.buildRoad();
    this.buildTerrain();
    this.buildStart();
    this.buildItems();
    DECOR[track.theme](this);
    this.buildClouds();

    // частицы
    this.smoke = new Pool(w, 240, new T.IcosahedronGeometry(0.5, 1), new T.MeshLambertMaterial({ transparent: true, opacity: 0.82, depthWrite: false }));
    this.bits = new Pool(w, 260, new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ toneMapped: false }));
    this.confetti = new Pool(w, 340, new T.BoxGeometry(1, 0.08, 0.62), new T.MeshLambertMaterial({ side: T.DoubleSide }));
    this.marks = new Pool(w, 380, new T.BoxGeometry(0.34, 0.02, 1), new T.MeshBasicMaterial({ color: "#16181f", transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.acc = [];
    this.podiumGroup = null;
  }

  buildRoad() {
    const tr = this.track, th = this.theme, w = this.world, H = tr.half, W = tr.wall, L = tr.length;
    // асфальт: по краям сплошные линии, посередине прерывистая
    const asphalt = canvasTexture(256, 256, (g) => {
      g.fillStyle = th.asphalt;
      g.fillRect(0, 0, 256, 256);
      const r = seeded(7);
      for (let k = 0; k < 900; k++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.06)";
        g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 5);
      }
      g.fillStyle = th.mark;
      g.fillRect(7, 0, 5, 256);
      g.fillRect(244, 0, 5, 256);
      g.globalAlpha = 0.9;
      g.fillRect(125.5, 0, 5, 128);
    }, true);
    const road = new T.Mesh(ribbon(tr, [[H, 0, 0], [0, 0.04, 0.5], [-H, 0, 1]], Math.round(L / 9)), new T.MeshLambertMaterial({ map: asphalt }));
    w.add(road);
    // поребрики
    const curbTex = canvasTexture(8, 64, (g) => {
      g.fillStyle = th.curb[0];
      g.fillRect(0, 0, 8, 32);
      g.fillStyle = th.curb[1];
      g.fillRect(0, 32, 8, 32);
    }, true);
    curbTex.magFilter = T.NearestFilter;
    const curbMat = new T.MeshLambertMaterial({ map: curbTex, emissive: th.night ? th.curb[0] : "#000000", emissiveIntensity: th.night ? 0.5 : 0, emissiveMap: th.night ? curbTex : null });
    for (const s of [1, -1]) {
      const cross = [[s * (H + 1.4), 0.03, 0], [s * (H + 0.7), 0.2, 0.5], [s * H, 0.03, 1]];
      w.add(new T.Mesh(ribbon(tr, s > 0 ? cross : cross.reverse(), Math.round(L / 5)), curbMat));
    }
    // обочина
    const shoulderTex = canvasTexture(64, 64, (g) => {
      g.fillStyle = th.shoulder[0];
      g.fillRect(0, 0, 64, 64);
      const r = seeded(3);
      for (let k = 0; k < 120; k++) {
        g.fillStyle = r() < 0.6 ? th.shoulder[1] : mix(th.shoulder[0], "#ffffff", 0.18);
        g.fillRect(r() * 64, r() * 64, 2 + r() * 5, 2 + r() * 5);
      }
    }, true);
    const shoulderMat = new T.MeshLambertMaterial({ map: shoulderTex });
    for (const s of [1, -1]) {
      const cross = [[s * W, 0.02, 0], [s * (H + 1.4), 0.02, 1]];
      w.add(new T.Mesh(ribbon(tr, s > 0 ? cross : cross.reverse(), Math.round(L / 6)), shoulderMat));
    }
    // борта: блоки двух цветов; наружная стенка уходит под землю и закрывает щель
    const wallTex = canvasTexture(32, 64, (g) => {
      g.fillStyle = th.wall[0];
      g.fillRect(0, 0, 32, 64);
      if (th.night) {
        g.fillStyle = th.wall[1];
        g.fillRect(0, 0, 32, 64);
        g.fillStyle = th.wall[0];
        g.fillRect(0, 0, 14, 64);
        g.fillRect(22, 0, 10, 64);
      } else {
        g.fillStyle = th.wall[1];
        g.fillRect(0, 0, 32, 32);
        g.fillStyle = "rgba(0,0,0,.18)";
        g.fillRect(0, 30, 32, 2);
        g.fillRect(0, 62, 32, 2);
      }
    }, true);
    const glowWall = canvasTexture(32, 64, (g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, 32, 64);
      g.fillStyle = "#fff";
      g.fillRect(14, 0, 8, 64);
    }, true);
    const wallMat = new T.MeshLambertMaterial({ map: wallTex, side: T.DoubleSide, emissive: th.night ? th.wall[1] : "#000000", emissiveMap: th.night ? glowWall : null, emissiveIntensity: th.night ? 1.6 : 0 });
    for (const s of [1, -1]) {
      const cross = [[s * (W + 0.7), -3.5, 1.3], [s * (W + 0.7), 1.05, 0.72], [s * W, 1.05, 0.6], [s * W, 0, 0]];
      w.add(new T.Mesh(ribbon(tr, s > 0 ? cross : cross.reverse(), Math.round(L / 6)), wallMat));
    }
    // трамплин
    if (tr.jump) {
      const j = tr.jump, rows = 5, pos = [], uv = [], idx = [], p = {};
      const hw = H - 0.2;
      for (let r = 0; r < rows; r++) {
        const f = r / (rows - 1);
        for (const side of [1, -1]) {
          trackPoint(tr, j.s0 + (j.s1 - j.s0) * f, side * hw, p);
          pos.push(p.x, p.y + j.h * f + 0.05, p.z, p.x, p.y, p.z);
          uv.push(side > 0 ? 0 : 1, f * 2, side > 0 ? 0 : 1, f * 2);
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        const a = r * 4; // верхний левый, нижний левый, верхний правый, нижний правый
        idx.push(a, a + 2, a + 6, a, a + 6, a + 4); // верх
        idx.push(a + 1, a, a + 4, a + 1, a + 4, a + 5); // левый бок
        idx.push(a + 2, a + 3, a + 7, a + 2, a + 7, a + 6); // правый бок
      }
      const e = (rows - 1) * 4;
      idx.push(e, e + 2, e + 3, e, e + 3, e + 1); // задняя стенка
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const tex = canvasTexture(128, 64, (c) => {
        c.fillStyle = "#ffd23e";
        c.fillRect(0, 0, 128, 64);
        c.fillStyle = "#2b2530";
        for (let x = -64; x < 192; x += 32) {
          c.beginPath();
          c.moveTo(x, 64); c.lineTo(x + 16, 64); c.lineTo(x + 48, 0); c.lineTo(x + 32, 0);
          c.fill();
        }
      }, true);
      w.add(new T.Mesh(g, new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide })));
    }
  }

  // Земля — сетка высот: у трассы прижата к дороге, дальше живёт по правилам темы
  buildTerrain() {
    const tr = this.track, th = this.theme, b = tr.box;
    const margin = 330, cell = 7;
    const x0 = b.minX - margin, z0 = b.minZ - margin;
    const cols = Math.ceil((b.maxX - b.minX + margin * 2) / cell), rows = Math.ceil((b.maxZ - b.minZ + margin * 2) / cell);
    const hs = new Float32Array((cols + 1) * (rows + 1)), ds = new Float32Array(hs.length);
    const noise = (this.noise = makeNoise(tr.n));
    const land = LAND[tr.theme];
    const farColor = new T.Color(land.far);
    const pos = new Float32Array(hs.length * 3), col = new Float32Array(hs.length * 3);
    const pts = [];
    for (let i = 0; i < tr.n; i += 3) pts.push(tr.px[i], tr.pz[i], tr.py[i]);
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= cols; c++) {
        const x = x0 + c * cell, z = z0 + r * cell, k = r * (cols + 1) + c;
        let near = Infinity, sw = 0, sy = 0;
        for (let p = 0; p < pts.length; p += 3) {
          const q = (x - pts[p]) ** 2 + (z - pts[p + 1]) ** 2;
          if (q < near) near = q;
          const wgt = 1 / (q * q + 1);
          sw += wgt;
          sy += wgt * pts[p + 2];
        }
        const dist = Math.sqrt(near), base = sy / sw;
        const out = Math.max(0, dist - tr.wall - 1.5); // сколько до борта
        let h = out <= 0 ? base - 0.9 : land.height(x, z, out, base, noise);
        C.set(land.color(x, z, h, out, base, noise));
        // у края сетки земля плавно сходит к дальней плоскости, чтобы обрыва не было видно
        const edge = 1 - smooth(0, 130, Math.min(c, cols - c, r, rows - r) * cell);
        if (edge > 0) {
          h = lerp(h, land.farY + 0.2, edge);
          C.lerp(farColor, edge);
        }
        hs[k] = h;
        ds[k] = dist;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        col[k * 3] = C.r; col[k * 3 + 1] = C.g; col[k * 3 + 2] = C.b;
      }
    const idx = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, e = a + cols + 1;
        if ((r + c) % 2) idx.push(a, e, a + 1, a + 1, e, e + 1);
        else idx.push(a, e, e + 1, a, e + 1, a + 1);
      }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("color", new T.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.world.add(new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    const grid = (arr) => (x, z) => {
      const fx = clamp((x - x0) / cell, 0, cols - 0.001), fz = clamp((z - z0) / cell, 0, rows - 0.001);
      const c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r, k = r * (cols + 1) + c;
      return lerp(lerp(arr[k], arr[k + 1], u), lerp(arr[k + cols + 1], arr[k + cols + 2], u), v);
    };
    this.heightAt = grid(hs);
    this.distAt = grid(ds);
    this.area = { x0, z0, w: cols * cell, h: rows * cell, cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2 };
    // дальний план: огромная плоскость под цвет темы
    const far = new T.Mesh(new T.PlaneGeometry(12000, 12000), new T.MeshLambertMaterial({ color: land.far }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(this.area.cx, land.farY, this.area.cz);
    this.world.add(far);
  }

  buildStart() {
    const tr = this.track, w = this.world, H = tr.half;
    const p = trackPoint(tr, 0, 0);
    const arch = new T.Group();
    arch.position.set(p.x, p.y, p.z);
    arch.rotation.y = p.yaw;
    const span = H + 2.2;
    const banner = canvasTexture(1024, 192, (g) => {
      g.fillStyle = "#1c2233";
      g.fillRect(0, 0, 1024, 192);
      for (let x = 0; x < 1024; x += 32)
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x / 32 + y) % 2 ? "#ffffff" : "#1c2233";
          g.fillRect(x, y * 24, 32, 24);
          g.fillRect(x, 144 + y * 24, 32, 24);
        }
      g.fillStyle = "#ffd23e";
      g.font = "italic 900 92px ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', Arial, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("В И Р А Ж", 512, 100);
    });
    const frame = new T.Mesh(
      fuse([
        [new T.BoxGeometry(1.1, 9.4, 1.1), "#f1f4fa", [span, 4.7, 0]],
        [new T.BoxGeometry(1.1, 9.4, 1.1), "#f1f4fa", [-span, 4.7, 0]],
        [new T.BoxGeometry(1.5, 0.8, 1.5), "#ff4a4a", [span, 0.4, 0]],
        [new T.BoxGeometry(1.5, 0.8, 1.5), "#ff4a4a", [-span, 0.4, 0]],
        [new T.BoxGeometry(span * 2 + 1.1, 0.5, 1.1), "#f1f4fa", [0, 9.4, 0]],
        [new T.BoxGeometry(5.4, 1.5, 0.7), "#232838", [0, 6.05, -0.1]],
      ]),
      new T.MeshLambertMaterial({ vertexColors: true }),
    );
    arch.add(frame);
    for (const face of [1, -1]) {
      const sign = new T.Mesh(new T.PlaneGeometry(span * 2 - 1, 2.3), new T.MeshBasicMaterial({ map: banner }));
      sign.position.set(0, 8.05, 0.2 * face);
      sign.rotation.y = face > 0 ? 0 : Math.PI;
      arch.add(sign);
    }
    // светофор: три лампы смотрят на решётку (назад по ходу)
    this.lamps = [];
    for (let k = 0; k < 3; k++) {
      const lamp = new T.Mesh(new T.SphereGeometry(0.52, 12, 10), new T.MeshBasicMaterial({ color: "#3a3f4f" }));
      lamp.position.set((k - 1) * 1.6, 6.05, -0.5);
      arch.add(lamp);
      this.lamps.push(lamp);
    }
    w.add(arch);
    // шашечки на асфальте
    const checker = canvasTexture(128, 16, (g) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? "#ffffff" : "#1c2233";
          g.fillRect(x * 8, y * 8, 8, 8);
        }
    });
    checker.magFilter = T.NearestFilter;
    const line = new T.Mesh(new T.PlaneGeometry(H * 2, 2.5), new T.MeshBasicMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    line.rotation.set(-Math.PI / 2, 0, -p.yaw);
    line.position.set(p.x, p.y + 0.05, p.z);
    w.add(line);
    // трибуна справа от старта
    const q = trackPoint(tr, -22, -(tr.wall + 9));
    const stand = new T.Mesh(PROPS.stand(), new T.MeshLambertMaterial({ vertexColors: true }));
    stand.position.set(q.x, p.y - 0.3, q.z);
    stand.rotation.y = p.yaw + Math.PI / 2;
    w.add(stand);
  }

  // Ускорители, канистры, указатели поворотов
  buildItems() {
    const tr = this.track, th = this.theme, w = this.world;
    this.padTex = canvasTexture(128, 128, (g) => {
      g.fillStyle = "#ff8a00";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#ffe95a";
      for (const y of [0, 64, 128]) {
        g.beginPath();
        g.moveTo(14, y + 44); g.lineTo(64, y + 4); g.lineTo(114, y + 44); g.lineTo(114, y + 20); g.lineTo(64, y - 20); g.lineTo(14, y + 20);
        g.fill();
      }
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 7, 128);
      g.fillRect(121, 0, 7, 128);
    }, true);
    const padMat = new T.MeshBasicMaterial({ map: this.padTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const padGeo = new T.PlaneGeometry(5.6, 10).rotateX(-Math.PI / 2);
    for (const pad of tr.pads) {
      const m = new T.Mesh(padGeo, padMat);
      m.rotation.y = pad.yaw + Math.PI; // стрелки текстуры смотрят по ходу
      m.position.set(pad.x, pad.y + 0.07, pad.z);
      w.add(m);
    }
    const canGeo = PROPS.can();
    const canMat = new T.MeshPhongMaterial({ vertexColors: true, shininess: 80, emissive: "#0a5b88", emissiveIntensity: 0.5 });
    this.cans = tr.cans.map((can) => {
      const g = new T.Group();
      const mesh = new T.Mesh(canGeo, canMat);
      mesh.rotation.z = 0.35;
      g.add(mesh);
      const halo = new T.Sprite(new T.SpriteMaterial({ map: this.glow, color: "#5fe2ff", blending: T.AdditiveBlending, depthWrite: false, opacity: 0.75 }));
      halo.scale.setScalar(4.6);
      g.add(halo);
      g.position.set(can.x, can.y + 1.5, can.z);
      w.add(g);
      return g;
    });
    // стрелки на внешней стороне крутых поворотов
    const arrow = (flip) =>
      canvasTexture(128, 48, (g) => {
        g.fillStyle = th.night ? "#12142e" : "#ffffff";
        g.fillRect(0, 0, 128, 48);
        g.fillStyle = th.night ? "#ff4fd8" : "#ff3d3d";
        for (let x = 8; x < 128; x += 40) {
          g.beginPath();
          if (flip) { g.moveTo(x + 26, 4); g.lineTo(x + 6, 24); g.lineTo(x + 26, 44); g.lineTo(x + 12, 44); g.lineTo(x - 8 + 0, 24); g.lineTo(x + 12, 4); }
          else { g.moveTo(x, 4); g.lineTo(x + 20, 24); g.lineTo(x, 44); g.lineTo(x + 14, 44); g.lineTo(x + 34, 24); g.lineTo(x + 14, 4); }
          g.fill();
        }
      });
    const spots = [[], []];
    let since = 99;
    for (let i = 0; i < tr.n; i++) {
      since += tr.ds;
      const k = tr.k[(i + 8) % tr.n];
      if (Math.abs(k) < 1 / 75 || since < 7.5) continue;
      since = 0;
      const out = k > 0 ? -1 : 1; // внешняя сторона
      spots[k > 0 ? 0 : 1].push([tr.px[i] + tr.nx[i] * out * (tr.wall - 0.06), tr.py[i] + 1.95, tr.pz[i] + tr.nz[i] * out * (tr.wall - 0.06), Math.atan2(-tr.nx[i] * out, -tr.nz[i] * out)]);
    }
    spots.forEach((list, side) => {
      if (!list.length) return;
      const tex = arrow(side === 0);
      const mesh = new T.InstancedMesh(new T.PlaneGeometry(6.2, 1.7), new T.MeshBasicMaterial({ map: tex }), list.length);
      list.forEach(([x, y, z, ry], k) => mesh.setMatrixAt(k, M.compose(P.set(x, y, z), Q.setFromEuler(E.set(0, ry, 0)), S.set(1, 1, 1))));
      w.add(mesh);
    });
  }

  buildClouds() {
    const th = this.theme, rnd = this.rnd, a = this.area;
    const n = th.night ? 10 : 24;
    const mesh = new T.InstancedMesh(PROPS.cloud(), new T.MeshBasicMaterial({ color: th.cloud, fog: false }), n);
    for (let k = 0; k < n; k++) {
      const ang = rnd() * TAU, r = 500 + rnd() * 1500, s = 40 + rnd() * 70;
      mesh.setMatrixAt(k, M.compose(P.set(a.cx + Math.cos(ang) * r, 190 + rnd() * 260, a.cz + Math.sin(ang) * r), Q.setFromEuler(E.set(0, rnd() * TAU, 0)), S.set(s, s * 0.55, s)));
    }
    mesh.frustumCulled = false;
    this.world.add(mesh);
  }

  // Расставить предметы: rule(i) → [x, z] или null; opts: scale [от, до], tall (доп. растяжение по y), colors, sink, y
  scatter(geo, count, pick, o = {}) {
    const rnd = this.rnd, list = [];
    for (let tries = 0; tries < count * 14 && list.length < count; tries++) {
      const p = pick();
      if (p) list.push(p);
    }
    if (!list.length) return null;
    const mat = o.material || new T.MeshLambertMaterial({ vertexColors: true, flatShading: o.flat !== false });
    const mesh = new T.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, z, y], k) => {
      const s = lerp(o.scale?.[0] ?? 1, o.scale?.[1] ?? 1, rnd());
      const sy = s * lerp(o.tall?.[0] ?? 1, o.tall?.[1] ?? 1, rnd());
      mesh.setMatrixAt(k, M.compose(P.set(x, (y ?? this.heightAt(x, z)) - (o.sink ?? 0.15), z), Q.setFromEuler(E.set(0, o.yaw ?? rnd() * TAU, 0)), S.set(s * (o.wide ?? 1), sy, s * (o.wide ?? 1))));
      if (o.colors) mesh.setColorAt(k, C.set(o.colors[Math.floor(rnd() * o.colors.length)]));
    });
    this.world.add(mesh);
    return mesh;
  }
  // Случайная точка у трассы: от near до far от борта, не ближе к другим участкам
  beside(near, far, test) {
    const tr = this.track, rnd = this.rnd;
    return () => {
      const i = Math.floor(rnd() * tr.n), side = rnd() < 0.5 ? 1 : -1;
      const off = tr.wall + near + Math.pow(rnd(), 1.6) * (far - near);
      const x = tr.px[i] + tr.nx[i] * off * side, z = tr.pz[i] + tr.nz[i] * off * side;
      if (this.distAt(x, z) < tr.wall + near - 0.5) return null;
      if (test && !test(x, z, this.heightAt(x, z))) return null;
      return [x, z];
    };
  }

  // ---------- Машины ----------
  // Убрать машины прошлого заезда вместе с их материалами и текстурами номеров
  clearCars() {
    for (const c of this.cars) {
      for (const part of [c.group, c.holder, c.tag]) {
        if (!part) continue;
        this.world.remove(part);
        this.dispose(part);
      }
    }
    this.cars = [];
    if (this.podiumGroup) {
      this.world.remove(this.podiumGroup);
      this.dispose(this.podiumGroup);
      this.podiumGroup = null;
    }
  }

  spawn(race) {
    this.clearCars();
    this.cars = race.cars.map((car) => {
      const model = makeCar(LIVERIES[car.livery].color, car.livery + 1, !!this.theme.night);
      model.holder = new T.Group();
      model.holder.add(model.shadow);
      this.world.add(model.group, model.holder);
      model.group.rotation.order = "YXZ";
      model.tag = null;
      if (!car.player && !race.attract) {
        const tex = canvasTexture(192, 56, (g) => {
          g.fillStyle = "rgba(16,20,36,.78)";
          g.beginPath();
          g.roundRect(2, 6, 188, 44, 22);
          g.fill();
          g.fillStyle = LIVERIES[car.livery].color;
          g.beginPath();
          g.arc(26, 28, 11, 0, 7);
          g.fill();
          g.fillStyle = "#fff";
          g.font = "800 27px ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', Arial, sans-serif";
          g.textBaseline = "middle";
          g.fillText(car.name, 46, 30);
        });
        model.tag = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
        model.tag.scale.set(3, 0.875, 1);
        this.world.add(model.tag);
      }
      return model;
    });
    this.acc = race.cars.map(() => ({ smoke: 0, dust: 0, mark: 0, flame: 0 }));
    for (const pool of [this.smoke, this.bits, this.confetti, this.marks]) pool.clear();
    this.snap = true;
    this.setLamps(-1);
  }

  setLamps(n) {
    // n: −1 — погашены, 3..1 — зажигаются красные, 0 — зелёные
    this.lamps.forEach((lamp, k) => lamp.material.color.set(n === 0 ? "#3dff7a" : n > 0 && k <= 3 - n ? "#ff3b30" : "#3a3f4f"));
  }

  burst(pool, x, y, z, count, colors, o) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU, sp = (o.speed ?? 6) * (0.4 + Math.random() * 0.8);
      pool.spawn(x, y, z, Math.cos(a) * sp + (o.vx ?? 0), (o.up ?? 4) * (0.3 + Math.random()), Math.sin(a) * sp + (o.vz ?? 0), (o.life ?? 0.6) * (0.6 + Math.random() * 0.7), colors[k % colors.length], o);
    }
  }

  // События гонки → частицы и тряска
  react(race, events) {
    for (const e of events) {
      const car = race.cars[e.car];
      if (!car) continue;
      const near = !race.player || car.player;
      if (e.type === "wall") {
        const side = Math.sign(car.d);
        const tr = race.track;
        this.burst(this.bits, car.x + tr.nx[car.i] * side * 1.2, car.y + 0.6, car.z + tr.nz[car.i] * side * 1.2, 10, ["#ffe27a", "#ffb03a", "#ffffff"], { speed: 7, up: 5, gravity: 16, size: 0.16, stretch: 2.4, life: 0.45, spin: 9, vx: Math.sin(car.va) * car.v * 0.4, vz: Math.cos(car.va) * car.v * 0.4 });
        if (near) this.shake = Math.max(this.shake, clamp(e.value / 40, 0.12, 0.5));
      } else if (e.type === "bump") {
        this.burst(this.bits, car.x, car.y + 0.7, car.z, 5, ["#ffe27a", "#ffffff"], { speed: 5, up: 4, gravity: 14, size: 0.14, stretch: 2, life: 0.35, spin: 8 });
        if (near) this.shake = Math.max(this.shake, 0.15);
      } else if (e.type === "land") {
        this.burst(this.smoke, car.x, car.y + 0.2, car.z, 12, [this.theme.dust], { speed: 7, up: 1.5, size: 0.9, grow: 2.2, life: 0.7, drag: 2.5 });
        if (near) this.shake = Math.max(this.shake, 0.4);
      } else if (e.type === "can") {
        this.burst(this.bits, car.x, car.y + 1.2, car.z, 14, ["#5fe2ff", "#ffffff", "#27c3ff"], { speed: 6, up: 6, gravity: 10, size: 0.2, life: 0.6, spin: 7, vx: Math.sin(car.va) * car.v * 0.7, vz: Math.cos(car.va) * car.v * 0.7 });
      } else if (e.type === "pad") {
        this.burst(this.bits, car.x, car.y + 0.4, car.z, 12, ["#ffd23e", "#ff9d00", "#ffffff"], { speed: 5, up: 3, gravity: 6, size: 0.2, stretch: 3, life: 0.5, vx: Math.sin(car.va) * car.v * 0.5, vz: Math.cos(car.va) * car.v * 0.5 });
      } else if (e.type === "reset") {
        this.burst(this.smoke, car.x, car.y + 0.8, car.z, 10, ["#ffffff"], { speed: 4, up: 2, size: 0.8, grow: 2, life: 0.6, drag: 2 });
        if (car.player) this.snap = true;
      } else if (e.type === "finish" && car.player) this.celebrate(car);
    }
  }

  celebrate(car) {
    const colors = ["#ff4a4a", "#ffd23e", "#3dd68c", "#4aa8ff", "#ff78c0", "#ffffff"];
    for (let k = 0; k < 220; k++) {
      const a = Math.random() * TAU, r = 3 + Math.random() * 16;
      this.confetti.spawn(car.x + Math.sin(car.va) * 18 + Math.cos(a) * r, car.y + 7 + Math.random() * 9, car.z + Math.cos(car.va) * 18 + Math.sin(a) * r, Math.sin(car.va) * car.v * 0.5 + (Math.random() - 0.5) * 6, 2 + Math.random() * 5, Math.cos(car.va) * car.v * 0.5 + (Math.random() - 0.5) * 6, 2.6 + Math.random() * 2.2, colors[k % colors.length], { size: 0.4, gravity: 5, drag: 1.1, spin: 4 + Math.random() * 8 });
    }
  }

  // Пьедестал у стартовой арки: три лучшие машины кубка
  podium(liveries) {
    const tr = this.track;
    this.clearCars();
    const p = trackPoint(tr, -15, 0); // перед стартовой аркой: она остаётся за спиной победителей
    const g = (this.podiumGroup = new T.Group());
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw + Math.PI; // лицом к камере
    const spots = [[0, 2.6], [-4.7, 1.7], [4.7, 1.1]];
    liveries.slice(0, 3).forEach((livery, k) => {
      const [x, h] = spots[k];
      const block = makePodiumBlock(k + 1, h);
      block.position.x = x;
      const car = makeCar(LIVERIES[livery].color, livery + 1);
      car.group.position.set(x, h, 0);
      car.group.rotation.y = 0.35;
      car.group.add(car.shadow);
      car.shadow.position.y = 0.03;
      car.shadow.scale.setScalar(0.9);
      g.add(block, car.group);
    });
    this.world.add(g);
    this.podiumAt = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    this.podiumT = 0;
  }

  // ---------- Кадр ----------
  // mode: "race" | "intro" (облёт на светофоре, t 0..1) | "orbit" (после финиша) | "menu" | "podium"
  frame(race, dt, mode, t = 0) {
    this.time += dt;
    const cam = this.camera, tr = this.track;
    const focus = mode === "podium" ? null : race.player || race.order[0];
    // машины
    if (mode !== "podium")
      race.cars.forEach((car, k) => {
        const m = this.cars[k];
        if (!m) return;
        const sp = clamp(car.v / PHYS.vmax, 0, 1.4);
        m.group.visible = car.ghostT <= 0 || Math.floor(this.time * 12) % 2 === 0;
        m.group.position.set(car.x, car.y, car.z);
        m.group.rotation.set(-car.pitch, car.yaw, 0);
        const roll = -car.steer * 0.06 * sp - clamp(car.slip, -0.6, 0.6) * 0.16;
        m.lean.rotation.z += (roll - m.lean.rotation.z) * damp(10, dt);
        m.lean.position.y = Math.sin(this.time * 31 + k) * 0.012 * sp + (car.offroad ? Math.sin(this.time * 47 + k) * 0.05 * sp : 0);
        for (const w of m.wheels) {
          w.mesh.rotation.x += (car.v * dt) / 0.52;
          if (w.front) w.pivot.rotation.y = -car.steer * 0.42;
        }
        m.tailMat.color.set(car.braking ? "#ff2a1e" : "#8e1414");
        const fire = car.nitroT > 0 ? 1 : car.boostT > 0 ? 0.6 : 0;
        for (const f of m.flames) {
          f.visible = fire > 0;
          if (fire) f.scale.set(0.8 + Math.random() * 0.5, fire * (0.7 + Math.random() * 0.6), 0.8 + Math.random() * 0.5);
        }
        m.flameMat.color.set(car.nitroT > 0 ? "#7fe9ff" : "#ffc04a");
        const ground = car.y - car.air;
        m.holder.position.set(car.x, ground + car.ground + 0.06, car.z);
        m.holder.rotation.y = car.yaw;
        m.holder.scale.setScalar(1 / (1 + (car.air - car.ground) * 0.25));
        if (m.tag) {
          const dist = Math.hypot(car.x - cam.position.x, car.z - cam.position.z);
          m.tag.visible = dist > 17 && dist < 120;
          m.tag.position.set(car.x, car.y + 2.7, car.z);
        }
        this.emit(car, k, dt, sp, car === focus);
      });

    // предметы
    if (race) race.cans.forEach((can, k) => {
      const g = this.cans[k];
      g.visible = can.wait <= 0;
      g.rotation.y = this.time * 2 + k;
      g.position.y = can.y + 1.5 + Math.sin(this.time * 3 + k * 2) * 0.25;
    });
    this.padTex.offset.y = 1 - ((this.time * 1.6) % 1);

    // камера
    if (mode === "podium") {
      if (this.shifted !== this.shift) {
        this.shifted = this.shift;
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        cam.setViewOffset(w, h, -this.shift.x, -this.shift.y, w, h);
      }
      this.podiumT += dt;
      const p = this.podiumAt, a = p.yaw + Math.sin(this.podiumT * 0.35) * 0.5;
      const tall = 1 - smooth(0.62, 1.35, cam.aspect);
      const fov = lerp(46, 62, tall);
      // отодвигаемся так, чтобы все три ступени поместились в свободной от таблицы части экрана
      const free = 1 - (Math.abs(this.shift.x) * 2) / (this.canvas.clientWidth || 1);
      const half = Math.atan(cam.aspect * Math.tan((fov * Math.PI) / 360) * free);
      const dist = Math.max(lerp(17, 25, tall), 7.8 / Math.tan(half));
      cam.position.set(p.x - Math.sin(a) * dist, p.y + lerp(5.2, 7.5, tall), p.z - Math.cos(a) * dist);
      cam.lookAt(p.x, p.y + lerp(2.6, 1.2, tall), p.z);
      cam.fov = fov;
      cam.updateProjectionMatrix();
      if (Math.random() < dt * 26) {
        const colors = ["#ff4a4a", "#ffd23e", "#3dd68c", "#4aa8ff", "#ff78c0", "#ffffff"];
        this.confetti.spawn(p.x + (Math.random() - 0.5) * 22, p.y + 13 + Math.random() * 3, p.z + (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 3, -1, (Math.random() - 0.5) * 3, 4.5, colors[Math.floor(Math.random() * 6)], { size: 0.42, gravity: 3.2, drag: 1, spin: 4 + Math.random() * 7 });
      }
      this.streaks.update(dt, 0, 0);
    } else if (focus) {
      const car = focus;
      const tall = 1 - smooth(0.62, 1.35, cam.aspect); // 1 — портрет, 0 — альбом
      let dist = lerp(8.6, 12.6, tall), height = lerp(3.7, 8.4, tall), ahead = lerp(6, 7.5, tall), offset = 0;
      let fov = lerp(58, 77, tall);
      if (mode === "intro") {
        const e = 1 - smooth(0, 1, t);
        offset = e * 2.5;
        dist *= 1 + e * 0.5;
        height *= 1 - e * 0.35;
      } else if (mode === "orbit") {
        this.orbit += dt * 0.5;
        offset = this.orbit;
        dist *= lerp(1.15, 0.9, tall);
        height *= lerp(1, 0.6, tall);
      } else if (mode === "menu") {
        offset = Math.sin(this.time * 0.17) * 1.1 + 0.5;
        dist *= 1.9;
        height *= 1.7;
        ahead = 2;
      } else this.orbit = 0;
      const sp = clamp(car.v / (PHYS.vmax * PHYS.nitroTop), 0, 1);
      this.kick += ((car.nitroT > 0 || car.boostT > 0 ? 1 : 0) - this.kick) * damp(5, dt);
      fov += sp * 13 + this.kick * 8;
      if (car.nitroT > 0 && mode === "race") this.shake = Math.max(this.shake, 0.045);
      const want = car.va + wrapAngle(car.yaw - car.va) * 0.3;
      const ground = car.y - car.air;
      if (this.snap) {
        this.camYaw = want;
        this.camY = ground;
        this.snap = false;
      }
      this.camYaw += wrapAngle(want - this.camYaw) * damp(5.5, dt);
      this.camY += (ground + car.air * 0.5 - this.camY) * damp(8, dt);
      const yaw = this.camYaw + offset;
      const back = dist * (1 - this.kick * 0.08);
      const turn = mode === "race" ? 1 : mode === "intro" ? smooth(0.5, 1, t) : 0.25;
      cam.position.set(car.x - Math.sin(yaw) * back, this.camY + height, car.z - Math.cos(yaw) * back);
      if (this.shake > 0.005) {
        cam.position.x += (Math.random() - 0.5) * this.shake;
        cam.position.y += (Math.random() - 0.5) * this.shake;
        this.shake *= Math.exp(-9 * dt);
      }
      // камера не уходит под землю за бортом
      const floor = this.heightAt(cam.position.x, cam.position.z) + 1.2;
      if (cam.position.y < floor) cam.position.y = floor;
      this.look.set(car.x + Math.sin(this.camYaw) * ahead * turn, this.camY + 1.3, car.z + Math.cos(this.camYaw) * ahead * turn);
      cam.lookAt(this.look);
      const shift = mode === "menu" ? this.shift : null;
      if (shift !== this.shifted) {
        this.shifted = shift;
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        if (shift) cam.setViewOffset(w, h, -shift.x, -shift.y, w, h);
        else cam.clearViewOffset();
      }
      if (Math.abs(cam.fov - fov) > 0.05) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      const rush = mode === "race" ? clamp((car.v - PHYS.vmax * 1.02) / (PHYS.vmax * 0.22), 0, 1) : 0;
      this.streaks.update(dt, Math.max(rush, this.kick * (mode === "race" ? 1 : 0)), car.v);
    }
    this.sky.position.copy(cam.position);
    const sd = this.theme.sun[2];
    this.sunSprite.position.set(cam.position.x + sd[0] * 3600, cam.position.y + sd[1] * 3600, cam.position.z + sd[2] * 3600);
    for (const pool of [this.smoke, this.bits, this.confetti, this.marks]) pool.update(dt);
    this.renderer.render(this.scene, cam);
  }

  // Дым, пыль, пламя и следы от одной машины
  emit(car, k, dt, sp, mine) {
    const a = this.acc[k], sx = Math.sin(car.yaw), cz = Math.cos(car.yaw);
    const rearX = car.x - sx * 1.5, rearZ = car.z - cz * 1.5, y = car.y - car.air + car.ground;
    const onGround = car.air - car.ground < 0.1;
    if (car.drift && onGround) {
      a.smoke += dt * (mine ? 34 : 16);
      while (a.smoke > 1) {
        a.smoke--;
        const side = Math.random() < 0.5 ? 1 : -1;
        this.smoke.spawn(rearX + cz * side, y + 0.35, rearZ - sx * side, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.35, this.theme.night ? "#c9cdf2" : "#f4f6fa", { size: 0.7, grow: 2.8, drag: 1.5 });
      }
      if (Math.random() < dt * (mine ? 22 : 8)) {
        // искры из-под задних колёс
        const side = Math.random() < 0.5 ? 1 : -1;
        this.bits.spawn(rearX + cz * side, y + 0.15, rearZ - sx * side, -sx * 3 + (Math.random() - 0.5) * 5, 2 + Math.random() * 3.5, -cz * 3 + (Math.random() - 0.5) * 5, 0.25 + Math.random() * 0.2, Math.random() < 0.5 ? "#ffd76a" : "#ff9a3d", { size: 0.11, stretch: 2.2, gravity: 13, spin: 9 });
      }
      a.mark += dt;
      if (a.mark > 0.03) {
        a.mark = 0;
        for (const side of [1, -1]) this.marks.spawn(rearX + cz * side, y + 0.04, rearZ - sx * side, 0, 0, 0, 3.2, "#ffffff", { size: 1, stretch: Math.max(1, car.v * 0.036), yaw: car.va });
      }
    } else if (car.offroad && car.v > 8 && onGround) {
      a.dust += dt * (mine ? 26 : 12);
      while (a.dust > 1) {
        a.dust--;
        this.smoke.spawn(rearX + (Math.random() - 0.5) * 1.8, y + 0.3, rearZ + (Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 3, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.55 + Math.random() * 0.4, this.theme.dust, { size: 0.8, grow: 2.6, drag: 1.2 });
      }
    }
    if (car.wallT < 0.05 && car.v > 12 && Math.random() < dt * 40) {
      const tr = this.track, side = Math.sign(car.d);
      this.bits.spawn(car.x + tr.nx[car.i] * side * 1.15, car.y + 0.5, car.z + tr.nz[car.i] * side * 1.15, sx * car.v * 0.5 + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, cz * car.v * 0.5 + (Math.random() - 0.5) * 4, 0.3, "#ffd76a", { size: 0.13, stretch: 2.5, gravity: 14, spin: 8 });
    }
    if (car.nitroT > 0 || car.boostT > 0.2) {
      a.flame += dt * 50;
      while (a.flame > 1) {
        a.flame--;
        const side = Math.random() < 0.5 ? 0.5 : -0.5;
        this.bits.spawn(car.x - sx * 2.5 + cz * side, car.y + 0.45, car.z - cz * 2.5 - sx * side, sx * car.v * 0.55 + (Math.random() - 0.5) * 1.5, Math.random() * 1.2, cz * car.v * 0.55 + (Math.random() - 0.5) * 1.5, 0.22 + Math.random() * 0.14, car.nitroT > 0 ? (Math.random() < 0.5 ? "#8ff0ff" : "#ffffff") : Math.random() < 0.5 ? "#ffc04a" : "#fff0a8", { size: 0.3, spin: 6 });
      }
    }
  }
}

// ---------- Земля по темам: высота и цвет ----------
// out — расстояние за бортом, base — высота ближайшего участка трассы
const LAND = {
  sea: {
    far: "#1fa9d6", farY: -1.15,
    height: (x, z, out, base, n) => lerp(base - 0.9, 1.6 + n(x / 70, z / 70) * 3.2 - smooth(70, 230, out) * 9.5, smooth(0, 26, out)),
    color: (x, z, h, out, base, n) => (h < -0.7 ? "#cdbb86" : h < 1.1 ? (n(x / 9, z / 9) > 0.5 ? "#f3e2ad" : "#ecd9a0") : n(x / 30, z / 30) > 0.52 ? "#86d36c" : "#74c85f"),
  },
  pine: {
    far: "#69b657", farY: -3,
    height: (x, z, out, base, n) => base - 0.9 + (n(x / 110, z / 110) - 0.38) * 46 * smooth(0, 150, out),
    color: (x, z, h, out, base, n) => {
      const v = n(x / 26, z / 26);
      return v > 0.62 ? "#5aa94c" : v > 0.45 ? "#69b657" : v > 0.3 ? "#78c362" : "#8acb68";
    },
  },
  canyon: {
    far: "#c96f41", farY: -6,
    height: (x, z, out, base, n) => {
      const v = n(x / 85, z / 85);
      const step = Math.floor(v * 4.2) + smooth(0.55, 1, (v * 4.2) % 1); // террасы с крутыми стенками
      return base - 0.9 + (step - 1.2) * 13 * smooth(3, 46, out);
    },
    color: (x, z, h, out, base, n) => {
      const band = Math.floor((h + 60) / 3.2) % 3;
      const v = n(x / 14, z / 14);
      return band === 0 ? (v > 0.5 ? "#cf6c3c" : "#c8643a") : band === 1 ? "#dc8550" : "#e79d62";
    },
  },
  city: {
    far: "#1d2040", farY: -1.3,
    height: (x, z, out, base) => lerp(base - 0.9, -0.9, smooth(0, 40, out)),
    color: (x, z, h, out, base, n) => (n(x / 40, z / 40) > 0.5 ? "#252a4a" : "#212643"),
  },
};

// ---------- Декорации по темам ----------
const lambert = (o = {}) => new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...o });
const DECOR = {
  sea(v) {
    const a = v.area;
    // вода с бликами
    const water = new T.Mesh(new T.PlaneGeometry(9000, 9000), new T.MeshPhongMaterial({ color: "#22b4e2", shininess: 90, specular: "#bfefff", transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(a.cx, -0.75, a.cz);
    v.world.add(water);
    v.scatter(PROPS.palm(), 150, v.beside(4, 170, (x, z, h) => h > 0.1 && h < 4.5), { scale: [0.85, 1.35] });
    v.scatter(PROPS.bush(), 90, v.beside(3.5, 150, (x, z, h) => h > 1), { scale: [0.8, 1.7], colors: ["#4fb35a", "#63c466", "#3fa552", "#7fd070"] });
    v.scatter(PROPS.umbrella(), 30, v.beside(5, 60, (x, z, h) => h > -0.2 && h < 1.2), { scale: [0.9, 1.15], colors: ["#ff5a4d", "#ffd23e", "#4fb4ff", "#ff8fd0", "#ffffff"], flat: false });
    v.scatter(PROPS.rock(), 46, v.beside(4, 180, (x, z, h) => h < 0.4 && h > -1.6), { scale: [0.7, 2.2], colors: ["#b9b4a6", "#cfc8b4", "#a7a396"] });
    v.scatter(PROPS.hut(), 12, v.beside(12, 70, (x, z, h) => h > 1.2), { scale: [1, 1.3], colors: ["#fff6e6", "#ffe1c9", "#d9f3ff", "#fff1a8"] });
    const rnd = v.rnd;
    v.scatter(PROPS.boat(), 12, () => {
      const x = a.x0 + rnd() * a.w, z = a.z0 + rnd() * a.h;
      return v.heightAt(x, z) < -3.4 && v.distAt(x, z) < 420 ? [x, z, -0.55] : null;
    }, { scale: [1.5, 2.6], colors: ["#ffffff", "#ffe9a8", "#ffd0d0", "#d6f0ff"], sink: 0 });
    v.scatter(PROPS.balloon(), 4, () => [a.cx + (rnd() - 0.5) * 700, a.cz + (rnd() - 0.5) * 600, 38 + rnd() * 40], { scale: [1.6, 2.4], colors: ["#ff5a4d", "#ffd23e", "#ff8fd0", "#7fe08a"], flat: false, sink: 0 });
    // маяк на островке посреди лагуны
    const lh = new T.Mesh(PROPS.lighthouse(), lambert({ flatShading: false }));
    const ly = Math.max(v.heightAt(a.cx, a.cz), -0.4);
    lh.position.set(a.cx, ly + 1.2, a.cz);
    lh.scale.setScalar(2.1);
    const isle = new T.Mesh(PROPS.rock(), lambert({ vertexColors: false, color: "#b9b4a6" }));
    isle.position.set(a.cx, ly - 1.2, a.cz);
    isle.scale.set(11, 4.2, 11);
    v.world.add(lh, isle);
  },
  pine(v) {
    const a = v.area, rnd = v.rnd;
    v.scatter(PROPS.pine(), 620, v.beside(3.5, 190), { scale: [1.0, 2.1], tall: [0.9, 1.3] });
    v.scatter(PROPS.tree(), 90, v.beside(4, 120), { scale: [0.9, 1.5] });
    v.scatter(PROPS.rock(), 80, v.beside(3.5, 150), { scale: [0.6, 2.4], colors: ["#9aa0a6", "#b1b6ba", "#858b92"] });
    v.scatter(PROPS.bush(), 90, v.beside(3.5, 90), { scale: [0.7, 1.4], colors: ["#4c9e45", "#3f8f42", "#62b257"] });
    v.scatter(PROPS.hut(), 9, v.beside(10, 60), { scale: [1.1, 1.5], colors: ["#b9825a", "#a87449", "#c9966b"] });
    v.scatter(PROPS.balloon(), 3, () => [a.cx + (rnd() - 0.5) * 600, a.cz + (rnd() - 0.5) * 500, 60 + rnd() * 40], { scale: [1.6, 2.4], colors: ["#ff5a4d", "#ffd23e", "#4fb4ff"], flat: false, sink: 0 });
    // горы на горизонте
    const peak = fuse([[new T.ConeGeometry(1, 1, 7), "#6f8f8a", [0, 0.5, 0]], [new T.ConeGeometry(0.36, 0.36, 7), "#f4f8fb", [0, 0.83, 0]]]);
    let k = 0;
    v.scatter(peak, 16, () => {
      const ang = (k++ / 16) * TAU + rnd() * 0.2, r = 850 + rnd() * 250;
      return [a.cx + Math.cos(ang) * r, a.cz + Math.sin(ang) * r, -20];
    }, { scale: [170, 280], tall: [0.9, 1.5], sink: 0 });
  },
  canyon(v) {
    const a = v.area, rnd = v.rnd;
    v.scatter(PROPS.mesa(), 26, v.beside(60, 300), { scale: [26, 60], tall: [0.9, 2.2], sink: 3 });
    v.scatter(PROPS.rock(), 150, v.beside(3.5, 130), { scale: [0.7, 3.2], colors: ["#c2603a", "#d67a48", "#a9512f", "#e08c56"] });
    v.scatter(PROPS.cactus(), 120, v.beside(3.5, 110), { scale: [0.8, 1.7] });
    v.scatter(PROPS.bush(), 90, v.beside(3.5, 100), { scale: [0.5, 1.1], colors: ["#b9a24e", "#8f9a45", "#cdb565"] });
    let k = 0;
    v.scatter(PROPS.mesa(), 18, () => {
      const ang = (k++ / 18) * TAU + rnd() * 0.25, r = 760 + rnd() * 320;
      return [a.cx + Math.cos(ang) * r, a.cz + Math.sin(ang) * r, -8];
    }, { scale: [110, 220], tall: [0.6, 1.3], sink: 0 });
  },
  city(v) {
    const tr = v.track, a = v.area, rnd = v.rnd, w = v.world;
    // дома: стены и светящиеся окна
    const wallTex = canvasTexture(64, 128, (g) => {
      g.fillStyle = "#8089b5";
      g.fillRect(0, 0, 64, 128);
      g.fillStyle = "#2b3158";
      for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) g.fillRect(4 + x * 16, 3 + y * 8, 9, 5);
    }, true);
    const winTex = canvasTexture(64, 128, (g) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, 64, 128);
      const r = seeded(11), lights = ["#ffe08a", "#ffd0a0", "#8ff0ff", "#ff9ae0", "#fff6d8"];
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 4; x++)
          if (r() < 0.55) {
            g.fillStyle = lights[Math.floor(r() * lights.length)];
            g.fillRect(4 + x * 16, 3 + y * 8, 9, 5);
          }
    }, true);
    const box = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const houseMat = new T.MeshLambertMaterial({ map: wallTex, emissiveMap: winTex, emissive: "#ffffff", emissiveIntensity: 1.1 });
    const lots = [];
    const cell = 27;
    for (let x = a.x0 + 60; x < a.x0 + a.w - 60; x += cell)
      for (let z = a.z0 + 60; z < a.z0 + a.h - 60; z += cell) {
        const d = v.distAt(x, z);
        if (d < tr.wall + 15 || d > 250 || rnd() < 0.2) continue;
        lots.push([x + (rnd() - 0.5) * 4, z + (rnd() - 0.5) * 4, d]);
      }
    const houses = new T.InstancedMesh(box, houseMat, lots.length + 26);
    const tints = ["#7c86c9", "#9a7fd0", "#6d9ad6", "#c07fc4", "#8791b8"];
    lots.forEach(([x, z, d], k) => {
      const tall = 16 + rnd() * 34 + smooth(40, 200, d) * rnd() * 70;
      houses.setMatrixAt(k, M.compose(P.set(x, v.heightAt(x, z) - 0.5, z), Q.identity(), S.set(15 + rnd() * 7, tall, 15 + rnd() * 7)));
      houses.setColorAt(k, C.set(tints[Math.floor(rnd() * tints.length)]));
    });
    for (let k = 0; k < 26; k++) {
      // небоскрёбы на горизонте
      const ang = (k / 26) * TAU + rnd() * 0.2, r = 430 + rnd() * 260;
      houses.setMatrixAt(lots.length + k, M.compose(P.set(a.cx + Math.cos(ang) * r, -1, a.cz + Math.sin(ang) * r), Q.identity(), S.set(40 + rnd() * 30, 110 + rnd() * 150, 40 + rnd() * 30)));
      houses.setColorAt(lots.length + k, C.set("#5a5fa8"));
    }
    w.add(houses);
    // фонари вдоль трассы: столб, лампа и пятно света на асфальте
    const posts = [];
    for (let s = 12, side = 1; s < tr.length - 10; s += 30, side = -side) {
      const p = trackPoint(tr, s, side * (tr.wall + 1.5));
      posts.push([p.x, p.z, p.y, Math.atan2(-tr.nx[p.i] * side, -tr.nz[p.i] * side), side, p.i]);
    }
    const poleMesh = new T.InstancedMesh(PROPS.lamp(), lambert(), posts.length);
    const bulbMesh = new T.InstancedMesh(PROPS.bulb(), new T.MeshBasicMaterial({ color: "#fff2c4" }), posts.length);
    const pool = new T.InstancedMesh(new T.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: v.glow, color: "#ffd9a0", transparent: true, opacity: 0.34, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), posts.length);
    posts.forEach(([x, z, y, ry, side, i], k) => {
      M.compose(P.set(x, y, z), Q.setFromEuler(E.set(0, ry, 0)), S.set(1, 1, 1));
      poleMesh.setMatrixAt(k, M);
      bulbMesh.setMatrixAt(k, M);
      pool.setMatrixAt(k, M.compose(P.set(x - tr.nx[i] * side * 6.5, y + 0.09, z - tr.nz[i] * side * 6.5), Q.identity(), S.set(1, 1, 1)));
    });
    w.add(poleMesh, bulbMesh, pool);
    // неоновые вывески на столбах
    const words = [["ВИРАЖ", "#ff4fd8"], ["НИТРО", "#00e5ff"], ["КАФЕ", "#ffd23e"], ["КИНО", "#7dff8a"], ["ПИЦЦА", "#ff8a3d"], ["ОТЕЛЬ", "#b58cff"], ["24 ЧАСА", "#00e5ff"], ["ТАКСИ", "#ffd23e"], ["МУЗЫКА", "#ff4fd8"], ["ИГРЫ", "#7dff8a"]];
    words.forEach(([word, color], k) => {
      const s = ((k + 0.45) / words.length) * tr.length, side = k % 2 ? 1 : -1;
      const p = trackPoint(tr, s, side * (tr.wall + 6.5));
      if (v.distAt(p.x, p.z) < tr.wall + 5) return;
      const tex = canvasTexture(256, 96, (g) => {
        g.fillStyle = "#0d0f26";
        g.fillRect(0, 0, 256, 96);
        g.strokeStyle = color;
        g.lineWidth = 6;
        g.strokeRect(7, 7, 242, 82);
        g.fillStyle = color;
        g.shadowColor = color;
        g.shadowBlur = 14;
        g.font = "900 52px ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(word, 128, 52, 220);
      });
      const sign = new T.Group();
      const board = new T.Mesh(new T.PlaneGeometry(9.6, 3.6), new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
      board.position.y = 7.6;
      const pole = new T.Mesh(new T.BoxGeometry(0.4, 6, 0.4), new T.MeshLambertMaterial({ color: "#3a4160" }));
      pole.position.y = 3;
      sign.add(board, pole);
      sign.position.set(p.x, p.y, p.z);
      sign.rotation.y = p.yaw + Math.PI + side * 0.5; // лицом к подъезжающим
      w.add(sign);
    });
    // звёзды
    const stars = new Float32Array(500 * 3);
    for (let k = 0; k < 500; k++) {
      const ang = rnd() * TAU, up = 0.12 + rnd() * 0.85, r = 4200;
      stars[k * 3] = Math.cos(ang) * Math.sqrt(1 - up * up) * r;
      stars[k * 3 + 1] = up * r;
      stars[k * 3 + 2] = Math.sin(ang) * Math.sqrt(1 - up * up) * r;
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(stars, 3));
    const points = new T.Points(sg, new T.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false }));
    points.frustumCulled = false;
    v.sky.add(points);
  },
};
