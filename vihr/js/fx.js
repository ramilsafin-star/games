// Частицы «Вихря»: пыль, перья, листья, звёздочки, конфетти. Одна система Points —
// один вызов отрисовки на все частицы. Картинки частиц нарисованы на холсте-полоске 8×64 px.
import { T, TAU } from "./kit.js?v=ae43a6e1";

const FRAMES = 8; // 0 пятно, 1 звезда, 2 перо, 3 лист, 4 сердце, 5 пузырь, 6 искра, 7 квадратик
function atlas() {
  const S = 64;
  const canvas = document.createElement("canvas");
  canvas.width = S * FRAMES;
  canvas.height = S;
  const g = canvas.getContext("2d");
  const at = (k, draw) => {
    g.save();
    g.translate(k * S + S / 2, S / 2);
    draw();
    g.restore();
  };
  at(0, () => {
    const r = g.createRadialGradient(0, 0, 1, 0, 0, 30);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.5, "rgba(255,255,255,.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(-32, -32, 64, 64);
  });
  const star = (n, r0, r1) => {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TAU - Math.PI / 2, r = i % 2 ? r1 : r0;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
  };
  at(1, () => {
    g.fillStyle = "#fff";
    star(5, 28, 12);
    g.fill();
  });
  at(2, () => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(0, 0, 9, 27, 0.5, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(200,200,200,1)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-12, 22);
    g.lineTo(12, -22);
    g.stroke();
  });
  at(3, () => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(0, -28);
    g.quadraticCurveTo(24, -6, 0, 28);
    g.quadraticCurveTo(-24, -6, 0, -28);
    g.fill();
    g.strokeStyle = "rgba(190,190,190,1)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, -24);
    g.lineTo(0, 26);
    g.stroke();
  });
  at(4, () => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(0, 24);
    g.bezierCurveTo(-34, 0, -18, -30, 0, -12);
    g.bezierCurveTo(18, -30, 34, 0, 0, 24);
    g.fill();
  });
  at(5, () => {
    g.strokeStyle = "rgba(255,255,255,.95)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 24, 0, TAU);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,.18)";
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(-9, -10, 6, 4, -0.7, 0, TAU);
    g.fill();
  });
  at(6, () => {
    const r = g.createRadialGradient(0, 0, 1, 0, 0, 30);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,.5)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(-32, -32, 64, 64);
    g.fillStyle = "#fff";
    star(4, 30, 5);
    g.fill();
  });
  at(7, () => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.roundRect(-16, -22, 32, 44, 6);
    g.fill();
  });
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

const VERT = /* glsl */ `
attribute float alpha;
attribute float size;
attribute float frame;
attribute float spin;
attribute vec3 tint;
uniform float scale;
varying vec3 vTint;
varying float vAlpha;
varying float vFrame;
varying float vSpin;
void main() {
  vTint = tint;
  vAlpha = alpha;
  vFrame = frame;
  vSpin = spin;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(size * scale / max(0.5, -mv.z), 220.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D atlas;
varying vec3 vTint;
varying float vAlpha;
varying float vFrame;
varying float vSpin;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vSpin), s = sin(vSpin);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * 1.25 + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
  vec4 t = texture2D(atlas, vec2((vFrame + p.x) / 8.0, 1.0 - p.y));
  float a = t.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vTint * t.rgb, a);
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(scene, max = 1800) {
    this.max = max;
    this.n = 0;
    const g = (this.geometry = new T.BufferGeometry());
    this.pos = new Float32Array(max * 3);
    this.tint = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.frame = new Float32Array(max);
    this.spin = new Float32Array(max);
    g.setAttribute("position", new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute("tint", new T.BufferAttribute(this.tint, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute("alpha", new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute("size", new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute("frame", new T.BufferAttribute(this.frame, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute("spin", new T.BufferAttribute(this.spin, 1).setUsage(T.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new T.ShaderMaterial({
      uniforms: { atlas: { value: atlas() }, scale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new T.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    // состояние частиц: скорость, жизнь, гравитация, сопротивление, рост, вращение
    this.p = Array.from({ length: max }, () => ({ vx: 0, vy: 0, vz: 0, life: 0, ttl: 1, grav: 0, drag: 0, s0: 1, s1: 1, a0: 1, rot: 0, rs: 0, swirl: null }));
    this.color = new T.Color();
  }
  setScale(px) {
    this.material.uniforms.scale.value = px;
  }
  // o: { x,y,z, vx,vy,vz, ttl, size, grow, color, frame, grav, drag, spin, alpha, swirl:{x,z,w} }
  emit(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const q = this.p[i];
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.color.set(o.color ?? "#ffffff");
    this.tint[i * 3] = this.color.r;
    this.tint[i * 3 + 1] = this.color.g;
    this.tint[i * 3 + 2] = this.color.b;
    this.frame[i] = o.frame ?? 0;
    q.vx = o.vx ?? 0;
    q.vy = o.vy ?? 0;
    q.vz = o.vz ?? 0;
    q.life = 0;
    q.ttl = o.ttl ?? 1;
    q.grav = o.grav ?? 0;
    q.drag = o.drag ?? 1;
    q.s0 = o.size ?? 1;
    q.s1 = q.s0 * (o.grow ?? 1);
    q.a0 = o.alpha ?? 1;
    q.rot = o.rot ?? Math.random() * TAU;
    q.rs = o.spin ?? 0;
    q.swirl = o.swirl ?? null;
    this.size[i] = q.s0;
    this.alpha[i] = q.a0;
    this.spin[i] = q.rot;
  }
  // перестановка частицы j на место i (живые частицы лежат подряд)
  move(i, j) {
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[j * 3 + k];
      this.tint[i * 3 + k] = this.tint[j * 3 + k];
    }
    this.alpha[i] = this.alpha[j];
    this.size[i] = this.size[j];
    this.frame[i] = this.frame[j];
    this.spin[i] = this.spin[j];
    const t = this.p[i];
    this.p[i] = this.p[j];
    this.p[j] = t;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      q.life += dt;
      if (q.life >= q.ttl) {
        this.move(i, --this.n);
        i--;
        continue;
      }
      const k = q.life / q.ttl;
      if (q.swirl) {
        // кружится вокруг вихря
        const s = q.swirl;
        const dx = this.pos[i * 3] - s.x, dz = this.pos[i * 3 + 2] - s.z;
        q.vx += -dz * s.w * dt * 4 - dx * dt * 1.5;
        q.vz += dx * s.w * dt * 4 - dz * dt * 1.5;
      }
      q.vy -= q.grav * dt;
      const drag = Math.max(0, 1 - q.drag * dt);
      q.vx *= drag;
      q.vy *= drag;
      q.vz *= drag;
      this.pos[i * 3] += q.vx * dt;
      this.pos[i * 3 + 1] += q.vy * dt;
      this.pos[i * 3 + 2] += q.vz * dt;
      if (this.pos[i * 3 + 1] < 0.05 && q.grav > 0) {
        this.pos[i * 3 + 1] = 0.05;
        q.vy *= -0.3;
        q.vx *= 0.7;
        q.vz *= 0.7;
      }
      this.size[i] = q.s0 + (q.s1 - q.s0) * k;
      this.alpha[i] = q.a0 * (k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.55) / 0.45));
      q.rot += q.rs * dt;
      this.spin[i] = q.rot;
    }
    const g = this.geometry;
    g.setDrawRange(0, this.n);
    for (const name of ["position", "tint", "alpha", "size", "frame", "spin"]) {
      const a = g.attributes[name];
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }
  clear() {
    this.n = 0;
  }

  // ---------- Готовые эффекты ----------
  // «Пых» на вершине вихря: перья, листья, звёздочки
  puff(x, y, z, kind, scale = 1) {
    const set = {
      feather: { frame: 2, colors: ["#ffffff", "#f4efe4", "#ffe9c8"], n: 9, grav: 1.2, drag: 1.6 },
      wool: { frame: 0, colors: ["#ffffff", "#f2efe6"], n: 9, grav: 0.4, drag: 2 },
      leaf: { frame: 3, colors: ["#5cbf45", "#7bd65a", "#43a63b", "#e8a030"], n: 10, grav: 1.5, drag: 1.4 },
      hay: { frame: 7, colors: ["#f2c94c", "#dfae35", "#ffe08a"], n: 10, grav: 3, drag: 1.2 },
      paper: { frame: 7, colors: ["#ffffff", "#e8f0ff"], n: 8, grav: 1.4, drag: 2 },
      pop: { frame: 0, colors: ["#fff6c8", "#ffe9a0"], n: 10, grav: 4, drag: 0.8 },
      star: { frame: 1, colors: ["#fff3a0", "#ffd84a", "#ffffff"], n: 7, grav: 2, drag: 1.2 },
    }[kind] || { frame: 1, colors: ["#fff3a0", "#ffd84a", "#ffffff"], n: 6, grav: 2, drag: 1.2 };
    const n = Math.round(set.n * Math.min(1.6, 0.7 + scale * 0.3));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (1.5 + Math.random() * 3) * Math.min(2.5, 0.6 + scale * 0.4);
      this.emit({
        x, y, z, vx: Math.cos(a) * v, vy: 1 + Math.random() * 3, vz: Math.sin(a) * v,
        ttl: 1.1 + Math.random() * 0.8, size: (0.35 + Math.random() * 0.35) * Math.min(3, 0.6 + scale * 0.5),
        color: set.colors[i % set.colors.length], frame: set.frame, grav: set.grav, drag: set.drag, spin: (Math.random() - 0.5) * 8,
      });
    }
    if (kind !== "star") {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        this.emit({ x, y, z, vx: Math.cos(a) * 2, vy: 2, vz: Math.sin(a) * 2, ttl: 0.8, size: 0.5 * Math.min(3, 0.6 + scale * 0.5), color: "#fff3a0", frame: 1, grav: 1, drag: 1.5, spin: 3 });
      }
    }
  }
  // пыль у основания вихря
  dust(x, z, r, color, frame = 0) {
    const a = Math.random() * TAU, d = r * (0.6 + Math.random() * 0.5);
    this.emit({
      x: x + Math.cos(a) * d, y: 0.2 + Math.random() * 0.4 * r, z: z + Math.sin(a) * d,
      vx: -Math.sin(a) * r * 2.2, vy: 0.4 + Math.random() * r * 0.5, vz: Math.cos(a) * r * 2.2,
      ttl: 0.7 + Math.random() * 0.5, size: (0.6 + Math.random() * 0.5) * (0.6 + r * 0.45), grow: 1.8, color, frame, drag: 1.2, alpha: 0.75,
    });
  }
  // след облика за игроком
  trail(x, z, r, trail) {
    const a = Math.random() * TAU, d = r * Math.random() * 0.8;
    const color = trail.colors[Math.floor(Math.random() * trail.colors.length)];
    this.emit({
      x: x + Math.cos(a) * d, y: 0.3 + Math.random() * r * 0.6, z: z + Math.sin(a) * d,
      vx: (Math.random() - 0.5) * 0.6, vy: 0.5 + Math.random(), vz: (Math.random() - 0.5) * 0.6,
      ttl: 1.2 + Math.random() * 0.6, size: (0.35 + Math.random() * 0.3) * (0.7 + r * 0.3), grow: trail.frame === 0 ? 2 : 1,
      color, frame: trail.frame, drag: 0.8, spin: (Math.random() - 0.5) * 3, alpha: trail.frame === 0 ? 0.6 : 0.95,
    });
  }
  // соперник втянут: вспышка и кольцо звёзд
  burst(x, z, r, color) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU, v = 6 + Math.random() * 6 + r;
      this.emit({ x, y: 1 + Math.random() * r * 2, z, vx: Math.cos(a) * v, vy: 2 + Math.random() * 5, vz: Math.sin(a) * v, ttl: 1.2, size: 0.8 + r * 0.25, color: i % 3 ? color : "#ffffff", frame: i % 2 ? 1 : 6, grav: 4, drag: 1.5, spin: 4 });
    }
  }
  confetti(x, y, z, spread, n = 40) {
    const colors = ["#ff5a7a", "#ffcf3a", "#4fb8ff", "#7ee06a", "#c58cff", "#ff8a3d", "#ffffff"];
    for (let i = 0; i < n; i++) {
      this.emit({
        x: x + (Math.random() - 0.5) * spread, y: y + Math.random() * 2, z: z + (Math.random() - 0.5) * spread * 0.5,
        vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 3,
        ttl: 2.6 + Math.random(), size: 0.35 + Math.random() * 0.25, color: colors[i % colors.length], frame: 7, grav: 2.2, drag: 1.4, spin: (Math.random() - 0.5) * 10,
      });
    }
  }
  sparkle(x, y, z, color = "#fff3a0", n = 6, size = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.emit({ x, y, z, vx: Math.cos(a) * 2, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 2, ttl: 0.8, size, color, frame: 6, drag: 2, spin: 2 });
    }
  }
}
