// Эффекты: искры, пыль, обломки, конфетти и салют. Одна отрисовка на всё светящееся и одна на обломки
import * as T from "../vendor/three/three.module.min.js?v=8eaa7c2c";

const GLOW_MAX = 700;
const CHIP_MAX = 240;

const VERT = `
attribute vec3 iPos;
attribute vec4 iColor;
attribute float iSize;
varying vec2 vUv;
varying vec4 vColor;
void main(){
  vUv = uv;
  vColor = iColor;
  vec4 view = viewMatrix * vec4(iPos, 1.0);
  view.xy += position.xy * iSize;
  gl_Position = projectionMatrix * view;
}`;
// Альфа 0 — чистое свечение, альфа 1 — плотная пыль: всё в одной отрисовке
const FRAG = `
varying vec2 vUv;
varying vec4 vColor;
void main(){
  float r = length(vUv * 2.0 - 1.0);
  if (r > 1.0) discard;
  float soft = pow(1.0 - r, vColor.a > 0.0 ? 1.1 : 2.6);
  float dust = vColor.a * soft;
  gl_FragColor = vec4(vColor.rgb * (vColor.a > 0.0 ? dust : soft), dust);
}`;

const dummy = new T.Object3D();
const tint = new T.Color();

export class Fx {
  constructor(scene) {
    const quad = new T.PlaneGeometry(1, 1);
    const g = new T.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.attributes.position);
    g.setAttribute("uv", quad.attributes.uv);
    const attr = (name, n) => {
      const a = new T.InstancedBufferAttribute(new Float32Array(GLOW_MAX * n), n).setUsage(T.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.pos = attr("iPos", 3);
    this.color = attr("iColor", 4);
    this.size = attr("iSize", 1);
    g.instanceCount = 0;
    this.geometry = g;
    const mesh = new T.Mesh(g, new T.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: T.CustomBlending,
      blendSrc: T.OneFactor,
      blendDst: T.OneMinusSrcAlphaFactor,
      blendSrcAlpha: T.OneFactor,
      blendDstAlpha: T.OneMinusSrcAlphaFactor
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    scene.add(mesh);
    this.chips = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ roughness: 0.7 }), CHIP_MAX);
    this.chips.frustumCulled = false;
    this.chips.count = 0;
    this.chips.castShadow = true;
    this.chips.setColorAt(0, tint.set("#ffffff"));
    scene.add(this.chips);
    this.list = [];
    this.chipList = [];
  }

  clear() {
    this.list.length = 0;
    this.chipList.length = 0;
  }

  // Точка света, которая гаснет
  spark(x, y, z, vx, vy, vz, r, g, b, size, life, gravity = 9) {
    if (this.list.length >= GLOW_MAX) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, r, g, b, a: 0, size, end: size * 0.25, life, age: 0, gravity, drag: 0.6 });
  }

  // Клуб пыли: плотный и мягкий, расплывается и оседает
  puff(x, y, z, vx, vy, vz, shade, size, life) {
    if (this.list.length >= GLOW_MAX) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, r: shade[0], g: shade[1], b: shade[2], a: 0.62, size: size * 0.45, end: size, life, age: 0, gravity: -0.4, drag: 2.4 });
  }

  // Этаж лёг: кольцо пыли по краю крыши
  landing(x, y, z, half, strength = 1) {
    const n = Math.round(22 * strength);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = half * 1.25;
      const px = Math.max(-half, Math.min(half, Math.cos(a) * r));
      const pz = Math.max(-half, Math.min(half, Math.sin(a) * r));
      this.puff(x + px, y + 0.2, z + pz, Math.cos(a) * 7 * strength, 0.7, Math.sin(a) * 7 * strength, [0.72, 0.68, 0.62], 4 + Math.random() * 3, 0.65 + Math.random() * 0.4);
    }
  }

  // Точное попадание: фонтан золотых искр
  sparkle(x, y, z, half, step = 0) {
    const n = 30 + Math.min(step, 8) * 5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 7 + Math.random() * 11;
      const up = 8 + Math.random() * 12;
      this.spark(x + Math.cos(a) * half, y + 0.3, z + Math.sin(a) * half, Math.cos(a) * sp, up, Math.sin(a) * sp, 3.4, 2.4, 0.8, 0.7 + Math.random() * 0.7, 0.7 + Math.random() * 0.5, 24);
    }
  }

  // Обломки этажа разлетаются по земле
  debris(x, y, z, colors) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 18;
      const s = 0.5 + Math.random() * 1.5;
      this.chip(x + Math.cos(a) * 4, y + Math.random() * 2, z + Math.sin(a) * 4, Math.cos(a) * sp, 8 + Math.random() * 15, Math.sin(a) * sp, s, s * 0.5, s, colors[i % colors.length], 2.6);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      this.puff(x + Math.cos(a) * 5, y + 1, z + Math.sin(a) * 5, Math.cos(a) * 10, 3, Math.sin(a) * 10, [0.74, 0.7, 0.64], 7 + Math.random() * 6, 1.1 + Math.random() * 0.8);
    }
  }

  chip(x, y, z, vx, vy, vz, sx, sy, sz, color, life) {
    if (this.chipList.length >= CHIP_MAX) this.chipList.shift();
    this.chipList.push({ x, y, z, vx, vy, vz, sx, sy, sz, color, life, age: 0, rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 12, wy: (Math.random() - 0.5) * 12 });
  }

  confetti(x, y, z, n = 90) {
    const colors = ["#ff5d7e", "#ffd23f", "#3fd1ff", "#7be04f", "#b57bff", "#ff9a2e"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 14;
      this.chip(x + Math.cos(a) * 3, y, z + Math.sin(a) * 3, Math.cos(a) * sp, 8 + Math.random() * 16, Math.sin(a) * sp, 0.5, 0.05, 0.3, colors[i % colors.length], 2.8);
    }
  }

  // Салют: шар цветных искр, k — масштаб, чтобы и издалека он читался как большой букет
  firework(x, y, z, k = 1) {
    const colors = [[2.6, 0.45, 0.8], [2.4, 1.5, 0.28], [0.4, 1.5, 2.8], [0.7, 2.4, 0.8], [1.8, 0.7, 2.8]];
    const c = colors[Math.floor(Math.random() * colors.length)];
    const n = 120;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const q = Math.sqrt(1 - u * u);
      const sp = (10 + Math.random() * 14) * k;
      const white = i % 7 === 0;
      this.spark(x, y, z, Math.cos(a) * q * sp, u * sp, Math.sin(a) * q * sp, white ? 2.6 : c[0], white ? 2.5 : c[1], white ? 2.2 : c[2], (1.3 + Math.random() * 0.9) * k, 1 + Math.random() * 0.9, 5 * k);
    }
    this.spark(x, y, z, 0, 0, 0, 3, 2.6, 2, 9 * k, 0.16, 0);
  }

  update(dt, ground = 0) {
    let n = 0;
    let write = 0;
    const pos = this.pos.array;
    const col = this.color.array;
    const size = this.size.array;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      this.list[write++] = p;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = p.age / p.life;
      pos[n * 3] = p.x;
      pos[n * 3 + 1] = p.y;
      pos[n * 3 + 2] = p.z;
      const fade = p.a > 0 ? 1 : (1 - k) * (1 - k * 0.4);
      col[n * 4] = p.r * fade;
      col[n * 4 + 1] = p.g * fade;
      col[n * 4 + 2] = p.b * fade;
      col[n * 4 + 3] = p.a * (1 - k);
      size[n] = p.size + (p.end - p.size) * k;
      n++;
    }
    this.list.length = write;
    this.geometry.instanceCount = n;
    if (n) {
      for (const a of [this.pos, this.color, this.size]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
    let c = 0;
    write = 0;
    for (let i = 0; i < this.chipList.length; i++) {
      const p = this.chipList[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      this.chipList[write++] = p;
      p.vy -= 26 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.wx * dt;
      p.ry += p.wy * dt;
      if (p.y < ground + 0.2) {
        p.y = ground + 0.2;
        p.vy *= -0.32;
        p.vx *= 0.6;
        p.vz *= 0.6;
        p.wx *= 0.5;
        p.wy *= 0.5;
      }
      const shrink = Math.min(1, (p.life - p.age) / 0.4);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.scale.set(p.sx * shrink, p.sy * shrink, p.sz * shrink);
      dummy.updateMatrix();
      this.chips.setMatrixAt(c, dummy.matrix);
      this.chips.setColorAt(c, tint.set(p.color));
      c++;
    }
    this.chipList.length = write;
    this.chips.count = c;
    if (c) {
      this.chips.instanceMatrix.needsUpdate = true;
      this.chips.instanceColor.needsUpdate = true;
    }
  }
}
