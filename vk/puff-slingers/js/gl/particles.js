// Все эффекты игры: огонь, дым, искры, вспышки, обломки и конфетти. Данные берутся из той же системы FX.
import * as T from '../../vendor/three/three.module.min.js?v=fdffe6b3';

const VERT = `
attribute vec3 iPos; attribute vec2 iSize; attribute float iRot; attribute vec4 iColor; attribute float iFrame;
varying vec2 vUv; varying vec4 vColor; varying float vFrame; varying float vOcc; varying float vTop;
void main(){
  float c = cos(iRot); float s = sin(iRot);
  vec2 q = position.xy * iSize;
  vec3 p = iPos + vec3(q.x * c - q.y * s, q.x * s + q.y * c, 0.0);
  vUv = uv; vColor = iColor;
  // Дробная часть кадра: насколько частица заслоняет фон (0 — чистое свечение)
  vFrame = floor(iFrame + 0.001); vOcc = iFrame - vFrame;
  vTop = position.x * s + position.y * c + 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
uniform sampler2D uAtlas; uniform float uLit; varying vec2 vUv; varying vec4 vColor; varying float vFrame; varying float vOcc; varying float vTop;
void main(){
  float cx = mod(vFrame, 4.0);
  float cy = floor(vFrame / 4.0 + 0.001);
  vec4 t = texture2D(uAtlas, vec2((cx + vUv.x) / 4.0, 1.0 - (cy + 1.0 - vUv.y) / 4.0));
  float a = t.a * vColor.a;
  if (a < 0.003) discard;
  vec3 rgb = vColor.rgb * t.r;
  if (uLit > 0.5) {
    // Дым объёмный: верх освещён, низ в тени
    gl_FragColor = vec4(rgb * mix(0.62, 1.18, vTop), a);
  } else {
    gl_FragColor = vec4(rgb * a, a * vOcc);
  }
  #include <colorspace_fragment>
}`;

const GRAY = new T.Color('#5a5350');
const colors = new Map();
function rgb(hex) {
  let c = colors.get(hex);
  if (!c) {
    c = new T.Color(hex);
    colors.set(hex, c);
  }
  return c;
}

class Batch {
  constructor(atlas, lit, capacity, order) {
    this.capacity = capacity;
    this.count = 0;
    const quad = new T.PlaneGeometry(1, 1);
    const g = new T.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity * 2);
    this.rot = new Float32Array(capacity);
    this.col = new Float32Array(capacity * 4);
    this.frame = new Float32Array(capacity);
    const attr = (name, arr, n) => {
      const a = new T.InstancedBufferAttribute(arr, n);
      a.setUsage(T.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.attrs = [attr('iPos', this.pos, 3), attr('iSize', this.size, 2), attr('iRot', this.rot, 1), attr('iColor', this.col, 4), attr('iFrame', this.frame, 1)];
    g.instanceCount = 0;
    this.geometry = g;
    this.mesh = new T.Mesh(g, new T.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uAtlas: { value: atlas }, uLit: { value: lit ? 1 : 0 } },
      transparent: true, depthWrite: false,
      // Огонь смешивается и как свечение, и как плотное пламя: на ярком небе он не выгорает в белое
      ...(lit ? { blending: T.NormalBlending } : { blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor })
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  push(x, y, z, w, h, rot, r, g, b, a, frame) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i * 2] = w;
    this.size[i * 2 + 1] = h;
    this.rot[i] = rot;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.frame[i] = frame;
  }

  flush() {
    this.geometry.instanceCount = this.count;
    if (this.count === 0) return;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
    this.count = 0;
  }
}

export class Particles {
  constructor(stage, atlas) {
    this.smoke = new Batch(atlas, true, 500, 10);
    this.add = new Batch(atlas, false, 1200, 11);
    this.neutral = new T.Color();
    stage.add(this.smoke.mesh, this.add.mesh);
    const box = new T.BoxGeometry(1, 1, 1);
    this.chips = new T.InstancedMesh(box, new T.MeshStandardMaterial({ roughness: 0.6 }), 320);
    this.chips.frustumCulled = false;
    this.chips.castShadow = true;
    const gear = new T.CylinderGeometry(1, 1, 0.5, 8);
    gear.rotateX(Math.PI / 2);
    this.gears = new T.InstancedMesh(gear, new T.MeshStandardMaterial({ metalness: 0.85, roughness: 0.3 }), 80);
    this.gears.frustumCulled = false;
    this.confetti = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ side: T.DoubleSide, toneMapped: false }), 260);
    this.confetti.frustumCulled = false;
    this.chips.setColorAt(0, rgb('#ffffff'));
    this.gears.setColorAt(0, rgb('#ffffff'));
    this.confetti.setColorAt(0, rgb('#ffffff'));
    stage.add(this.chips, this.gears, this.confetti);
    this.dummy = new T.Object3D();
  }

  glow(x, y, z, size, hex, alpha, boost = 2.4) {
    const c = rgb(hex);
    this.add.push(x, y, z, size, size, 0, c.r * boost, c.g * boost, c.b * boost, alpha, 0);
  }

  // Вытянутый блик между двумя точками
  streak(x, y, z, len, wid, rot, hex, alpha, frame = 7, boost = 3) {
    const c = rgb(hex);
    this.add.push(x, y, z, len, wid, rot, c.r * boost, c.g * boost, c.b * boost, alpha, frame);
  }

  sprite(x, y, z, size, rot, hex, alpha, frame, boost = 1) {
    const c = rgb(hex);
    this.add.push(x, y, z, size, size, rot, c.r * boost, c.g * boost, c.b * boost, alpha, frame);
  }

  drawFX(fx, groundY) {
    let chips = 0;
    let gears = 0;
    let conf = 0;
    const D = this.dummy;
    const list = fx.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const k = p.life / p.ttl;
      const y = groundY - p.y;
      if (p.seed === undefined) {
        p.seed = Math.random();
        p.z = 44 + p.seed * 26;
      }
      if (p.k === 'spark') {
        const sp = Math.hypot(p.vx, p.vy);
        const c = rgb(p.c);
        const len = Math.max(8, sp * 0.05) * (1 - k * 0.4);
        const wid = Math.max(2.2, p.s0 * 1.7) * (1 - k * 0.5);
        this.add.push(p.x, y, p.z + 8, len * 1.8, wid * 3, Math.atan2(-p.vy, p.vx), c.r * 3.4, c.g * 3.4, c.b * 3.4, 1 - k * k, 7);
      } else if (p.k === 'fire') {
        const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
        const c = rgb(p.c);
        const b = 1.75 * (1 - k * 0.55);
        this.add.push(p.x, y, p.z, s * 2.3, s * 2.3, p.seed * 6 + k * 1.4, c.r * b, c.g * b, c.b * b, (1 - k) * 0.92, 4 + Math.floor(p.seed * 3) + 0.72);
      } else if (p.k === 'smoke') {
        const s = p.s0 + (p.s1 - p.s0) * k;
        const c = this.neutral.copy(rgb(p.c)).lerp(GRAY, 0.5);
        this.smoke.push(p.x, y, p.z - 6, s * 1.6, s * 1.6, p.seed * 6 + k * 1.2, c.r * 1.1 + 0.08, c.g * 1.1 + 0.07, c.b * 1.1 + 0.07, p.a * (1 - k * k) * 0.8, 1 + Math.floor(p.seed * 3));
      } else if (p.k === 'ring') {
        const e = 1 - Math.pow(1 - k, 3);
        const r = p.r0 + (p.r1 - p.r0) * e;
        const c = rgb(p.c);
        this.add.push(p.x, y, p.z + 4, r * 2.44, r * 2.44, 0, c.r * 1.5, c.g * 1.5, c.b * 1.5, (1 - k) * 0.8, 8);
      } else if (p.k === 'flash') {
        const s = p.s0 + (p.s1 - p.s0) * k;
        const c = rgb(p.c);
        this.add.push(p.x, y, p.z + 6, s * 2.3, s * 2.3, 0, c.r * 1.25, c.g * 1.25, c.b * 1.25, (1 - k) * (1 - k) * 0.85, 0);
      } else if (p.k === 'bolt') {
        const c = rgb(p.c);
        const cx = p.x + (Math.cos(p.a) * p.len) / 2;
        const cy = y - (Math.sin(p.a) * p.len) / 2;
        this.add.push(cx, cy, p.z + 6, p.len * 1.15, 26, -p.a, c.r * 3.6, c.g * 3.6, c.b * 3.6, 1 - k, 14);
      } else if (p.k === 'starp') {
        const s = p.s0 + (p.s1 - p.s0) * k;
        const c = rgb(p.c);
        this.add.push(p.x, y, p.z + 8, s * 3.2, s * 3.2, p.rot, c.r * 2.2, c.g * 2.2, c.b * 2.2, 1 - k * 0.3, 10);
      } else if (p.k === 'chip' && chips < 320) {
        const fade = k > 0.8 ? (1 - k) * 5 : 1;
        D.position.set(p.x, y, (p.seed - 0.5) * 70);
        D.rotation.set(p.rot * 0.8 + p.seed * 6, p.rot * 0.55, p.rot);
        D.scale.set(p.w * fade, p.h * fade, ((p.w + p.h) / 2) * fade);
        D.updateMatrix();
        this.chips.setMatrixAt(chips, D.matrix);
        this.chips.setColorAt(chips, rgb(p.c));
        chips++;
      } else if (p.k === 'gear' && gears < 80) {
        const fade = k > 0.8 ? (1 - k) * 5 : 1;
        D.position.set(p.x, y, (p.seed - 0.5) * 60);
        D.rotation.set(p.rot * 0.5, p.rot * 0.3, p.rot);
        D.scale.setScalar(p.r * fade);
        D.updateMatrix();
        this.gears.setMatrixAt(gears, D.matrix);
        this.gears.setColorAt(gears, rgb(p.c));
        gears++;
      } else if (p.k === 'confetti' && conf < 260) {
        const fade = k > 0.8 ? (1 - k) * 5 : 1;
        D.position.set(p.x + Math.sin(p.life * 6 + p.phase) * 8, y, p.seed * 90 - 20);
        D.rotation.set(p.life * 8 + p.phase, p.life * 3, p.rot);
        D.scale.set(p.w * fade * 1.3, p.h * fade * 1.3, 1);
        D.updateMatrix();
        this.confetti.setMatrixAt(conf, D.matrix);
        this.confetti.setColorAt(conf, rgb(p.c));
        conf++;
      }
    }
    fx.decals.forEach((d) => {
      const k = 1 - d.life / d.ttl;
      const c = rgb('#14060c');
      this.smoke.push(d.x, 2, 46, d.w * 1.2, d.w * 0.22, 0, c.r, c.g, c.b, 0.55 * k, 0);
    });
    for (const [m, n] of [[this.chips, chips], [this.gears, gears], [this.confetti, conf]]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  flush() {
    this.smoke.flush();
    this.add.flush();
  }
}
