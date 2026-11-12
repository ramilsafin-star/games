// Новые эффекты «Вихря»: постобработка (свечение и сглаживание), облака и их тени,
// стена «Бури», бонусы-сферы, ударные волны и вспышки, лицо Урагана-великана.
// Всё рисуется пачками и переиспользуется — ни одного нового объекта в кадре.
import { T, TAU, clamp, smooth, canvasTexture } from "./kit.js?v=ae43a6e1";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=ae43a6e1";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=ae43a6e1";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=ae43a6e1";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=ae43a6e1";
import { ShaderPass } from "../vendor/three/postprocessing/ShaderPass.js?v=ae43a6e1";
import { POWERS } from "./rules.js?v=ae43a6e1";

const NOISE = /* glsl */ `
float xhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float xnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(xhash(i), xhash(i + vec2(1.0, 0.0)), u.x), mix(xhash(i + vec2(0.0, 1.0)), xhash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float xfbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * xnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}`;

// ---------- Постобработка: свечение, сглаживание, сочность ----------
// Сглаживание — FXAA в последнем проходе (MSAA на композере не включаем никогда).
const FINISH = {
  uniforms: { tDiffuse: { value: null }, px: { value: new T.Vector2(1 / 1024, 1 / 1024) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 px;
varying vec2 vUv;
void main() {
  const vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 nw = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb;
  vec3 ne = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * px).rgb;
  vec3 sw = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * px).rgb;
  vec3 se = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * px).rgb;
  vec3 m = texture2D(tDiffuse, vUv).rgb;
  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
  float lo = min(lm, min(min(lnw, lne), min(lsw, lse))), hi = max(lm, max(max(lnw, lne), max(lsw, lse)));
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float reduce = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lb = dot(b, L);
  vec3 c = (lb < lo || lb > hi) ? a : b;
  // та же сочность и мягкий контраст, что и без постобработки
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  c = mix(vec3(dot(c, L)), c, 1.0 + 0.3 * (1.0 - clamp(mx - mn, 0.0, 1.0)));
  vec3 s = clamp(c, 0.0, 1.0);
  c += (s * s * (3.0 - 2.0 * s) - s) * 0.18;
  gl_FragColor = vec4(c, 1.0);
}`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    // буфер без MSAA: samples не задаём
    const size = renderer.getDrawingBufferSize(new T.Vector2());
    const target = new T.WebGLRenderTarget(size.x, size.y, { type: T.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.pass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new T.Vector2(size.x, size.y), 0.42, 0.42, 1.45);
    this.output = new OutputPass();
    this.finish = new ShaderPass(FINISH);
    for (const p of [this.pass, this.bloom, this.output, this.finish]) this.composer.addPass(p);
  }
  setSize(w, h, ratio) {
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.finish.uniforms.px.value.set(1 / Math.max(1, w * ratio), 1 / Math.max(1, h * ratio));
  }
  render() {
    this.composer.render();
  }
  dispose() {
    this.composer.dispose();
    this.bloom.dispose();
  }
}

// ---------- Небо: градиент, свечение солнца, облака ----------
export function skyMaterial(uniforms) {
  Object.assign(uniforms, { sunDir: { value: new T.Vector3(-0.4, 0.8, 0.35).normalize() }, sunCol: { value: new T.Color("#fff3dc") }, time: { value: 0 }, cloud: { value: 1 } });
  return new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
uniform vec3 top, low, sunDir, sunCol;
uniform float time, cloud;
varying vec3 vD;
${NOISE}
void main() {
  vec3 d = normalize(vD);
  vec3 col = mix(low, top, smoothstep(-0.05, 0.5, d.y));
  // дымка у горизонта
  col = mix(col, mix(low, vec3(1.0), 0.35), smoothstep(0.22, 0.0, abs(d.y - 0.02)) * 0.45);
  // солнце: мягкое свечение и диск
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 90.0) * 0.7 + smoothstep(0.9993, 0.9997, sd) * 0.9);
  // облака: шум на куполе, плывут
  if (d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.18) * 1.6 + vec2(time * 0.012, time * 0.006);
    float n = xfbm(p);
    float c = smoothstep(0.52, 0.78, n) * smoothstep(0.0, 0.22, d.y) * cloud;
    vec3 cc = mix(vec3(1.0), low, 0.25) + sunCol * pow(sd, 4.0) * 0.25;
    col = mix(col, cc, c * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
  });
}

// ---------- Тени облаков на земле ----------
export function cloudShadows(half) {
  const u = { time: { value: 0 }, power: { value: 0.16 } };
  const m = new T.Mesh(
    new T.PlaneGeometry(half * 2 + 120, half * 2 + 120),
    new T.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      vertexShader: "varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: /* glsl */ `
uniform float time, power;
varying vec2 vW;
${NOISE}
void main() {
  float n = xfbm(vW * 0.018 + vec2(time * 0.035, time * 0.02));
  float a = smoothstep(0.5, 0.72, n) * power;
  gl_FragColor = vec4(0.12, 0.16, 0.32, a);
}`,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.09;
  m.renderOrder = 1;
  m.userData.own = true;
  m.userData.u = u;
  return m;
}

// ---------- Стена «Бури» ----------
const WALL_FRAG = /* glsl */ `
uniform float time, flash;
varying vec2 vUv;
${NOISE}
void main() {
  float y = vUv.y;
  float a0 = vUv.x * 64.0;
  float n = xfbm(vec2(a0 * 0.35 + time * 0.9, y * 3.0 - time * 0.4));
  float n2 = xfbm(vec2(a0 * 0.9 - time * 1.6, y * 7.0 + time * 0.3));
  vec3 dark = vec3(0.16, 0.12, 0.34), light = vec3(0.6, 0.52, 0.92);
  vec3 col = mix(dark, light, smoothstep(0.35, 0.85, n * 0.7 + n2 * 0.4));
  col += vec3(0.75, 0.7, 1.0) * flash * (0.6 + n2);
  float a = (0.82 - 0.62 * y) * (0.5 + 0.6 * n);
  a *= smoothstep(1.0, 0.75, y) * smoothstep(0.0, 0.03, y);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  #include <colorspace_fragment>
}`;
export class StormWall {
  constructor(scene) {
    this.group = new T.Group();
    this.u = { time: { value: 0 }, flash: { value: 0 } };
    const wall = new T.Mesh(
      new T.CylinderGeometry(1, 1, 1, 96, 1, true),
      new T.ShaderMaterial({ uniforms: this.u, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: WALL_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide }),
    );
    wall.position.y = 0.5;
    wall.renderOrder = 6;
    wall.frustumCulled = false;
    this.wall = wall;
    // за кругом всё темнее
    const shade = new T.Mesh(new T.RingGeometry(1, 14, 96, 1), new T.MeshBasicMaterial({ color: "#2a1f5a", transparent: true, opacity: 0.42, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.12;
    shade.renderOrder = 2;
    shade.frustumCulled = false;
    // светящаяся граница на земле
    const edge = new T.Mesh(new T.RingGeometry(0.985, 1.0, 160, 1), new T.MeshBasicMaterial({ color: new T.Color("#e6d2ff").multiplyScalar(2.4), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.14;
    edge.renderOrder = 2;
    edge.frustumCulled = false;
    this.shade = shade;
    this.edge = edge;
    // молния: ломаная лента
    this.boltGeo = new T.BufferGeometry();
    this.boltPos = new Float32Array(14 * 2 * 3);
    this.boltGeo.setAttribute("position", new T.BufferAttribute(this.boltPos, 3));
    const idx = [];
    for (let i = 0; i < 13; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.boltGeo.setIndex(idx);
    this.bolt = new T.Mesh(this.boltGeo, new T.MeshBasicMaterial({ color: new T.Color("#f4ecff").multiplyScalar(4), transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.bolt.renderOrder = 7;
    this.group.add(wall, shade, edge, this.bolt);
    this.group.visible = false;
    scene.add(this.group);
    this.boltT = 0;
    this.nextBolt = 2;
  }
  // молния в точке стены; возвращает её место для звука и частиц
  strike(zone, camX, camZ) {
    // поближе к камере, чтобы было видно
    const base = Math.atan2(camZ - zone.z, camX - zone.x);
    const a = base + (Math.random() - 0.5) * 1.6;
    const x = zone.x + Math.cos(a) * zone.r, z = zone.z + Math.sin(a) * zone.r;
    const top = 18 + Math.random() * 6;
    for (let i = 0; i < 14; i++) {
      const k = i / 13, y = top * (1 - k);
      const jx = i === 0 || i === 13 ? 0 : (Math.random() - 0.5) * 3.2, jz = i === 0 || i === 13 ? 0 : (Math.random() - 0.5) * 3.2;
      const w = 0.35 * (1 - k * 0.6);
      const px = x + jx, pz = z + jz;
      this.boltPos.set([px - w, y, pz, px + w, y, pz], i * 6);
    }
    this.boltGeo.attributes.position.needsUpdate = true;
    this.boltGeo.computeBoundingSphere();
    this.bolt.visible = true;
    this.boltT = 0.22;
    this.u.flash.value = 1;
    return { x, z };
  }
  update(dt, t, zone) {
    this.group.visible = !!zone;
    if (!zone) return null;
    this.u.time.value = t;
    const r = zone.r;
    this.wall.scale.set(r, 22, r);
    this.wall.position.set(zone.x, 11, zone.z);
    this.shade.scale.set(r, r, 1);
    this.shade.position.set(zone.x, 0.12, zone.z);
    this.edge.scale.set(r, r, 1);
    this.edge.position.set(zone.x, 0.14, zone.z);
    this.edge.material.opacity = zone.shrinking ? 0.65 + 0.35 * Math.sin(t * 9) : 0.8;
    this.u.flash.value = Math.max(0, this.u.flash.value - dt * 4);
    if (this.boltT > 0) {
      this.boltT -= dt;
      this.bolt.material.opacity = clamp(this.boltT / 0.22, 0, 1) * (0.6 + 0.4 * Math.sin(t * 90));
      if (this.boltT <= 0) this.bolt.visible = false;
    }
    this.nextBolt -= dt;
    return this.nextBolt <= 0 ? ((this.nextBolt = 1.6 + Math.random() * 2.6), true) : null;
  }
}

// ---------- Бонусы-сферы ----------
function powerIcon(kind) {
  return canvasTexture(128, 128, (g) => {
    g.translate(64, 64);
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#ffffff";
    g.lineCap = g.lineJoin = "round";
    if (kind === "magnet") {
      g.lineWidth = 20;
      g.beginPath();
      g.arc(0, -4, 26, Math.PI, 0, true);
      g.stroke();
      g.beginPath();
      g.moveTo(-26, -4);
      g.lineTo(-26, 30);
      g.moveTo(26, -4);
      g.lineTo(26, 30);
      g.stroke();
      g.fillStyle = "#ffe3e8";
      g.fillRect(-36, 22, 20, 16);
      g.fillRect(16, 22, 20, 16);
    } else if (kind === "bolt") {
      g.beginPath();
      g.moveTo(10, -46);
      g.lineTo(-26, 6);
      g.lineTo(-2, 6);
      g.lineTo(-12, 46);
      g.lineTo(28, -8);
      g.lineTo(4, -8);
      g.closePath();
      g.fill();
    } else {
      // «Великан»: стрелки во все стороны
      g.lineWidth = 12;
      for (let i = 0; i < 4; i++) {
        g.save();
        g.rotate((i * Math.PI) / 2 + Math.PI / 4);
        g.beginPath();
        g.moveTo(0, -8);
        g.lineTo(0, -40);
        g.moveTo(-13, -28);
        g.lineTo(0, -42);
        g.lineTo(13, -28);
        g.stroke();
        g.restore();
      }
      g.beginPath();
      g.arc(0, 0, 11, 0, TAU);
      g.fill();
    }
  });
}
const glowTex = () =>
  canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.3, "rgba(255,255,255,.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
const BEAM_FRAG = /* glsl */ `
uniform vec3 col;
uniform float time;
varying vec2 vUv;
void main() {
  float a = (1.0 - vUv.y) * (1.0 - vUv.y) * (0.55 + 0.25 * sin(vUv.y * 20.0 - time * 6.0));
  gl_FragColor = vec4(col, a * 0.55);
}`;
export class PowerOrbs {
  constructor(scene) {
    this.scene = scene;
    this.glow = glowTex();
    this.icons = Object.fromEntries(Object.keys(POWERS).map((k) => [k, powerIcon(k)]));
    this.orbGeo = new T.SphereGeometry(1, 24, 16);
    this.beamGeo = new T.CylinderGeometry(0.35, 0.35, 1, 16, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.list = new Map();
    this.pool = [];
  }
  make(kind) {
    const col = new T.Color(POWERS[kind].color);
    const g = new T.Group();
    const orb = new T.Mesh(this.orbGeo, new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.6), transparent: true, opacity: 0.9, toneMapped: false }));
    orb.scale.setScalar(0.85);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: this.glow, color: col.clone().multiplyScalar(1.3), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    halo.scale.setScalar(4.2);
    const icon = new T.Sprite(new T.SpriteMaterial({ map: this.icons[kind], transparent: true, depthWrite: false, toneMapped: false }));
    icon.scale.setScalar(1.25);
    icon.renderOrder = 9;
    const bu = { col: { value: col.clone().lerp(new T.Color("#ffffff"), 0.35) }, time: { value: 0 } };
    const beam = new T.Mesh(this.beamGeo, new T.ShaderMaterial({ uniforms: bu, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    beam.scale.set(1, 16, 1);
    const ring = new T.Mesh(new T.RingGeometry(1.1, 1.45, 40), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    g.add(beam, ring, halo, orb, icon);
    g.userData = { orb, halo, icon, beam, ring, bu, kind };
    for (const o of g.children) o.frustumCulled = false;
    return g;
  }
  add(id, kind, x, z) {
    const g = this.make(kind);
    g.position.set(x, 0, z);
    g.userData.born = performance.now() / 1000;
    this.scene.add(g);
    this.list.set(id, g);
  }
  remove(id) {
    const g = this.list.get(id);
    if (!g) return;
    this.list.delete(id);
    g.removeFromParent();
    g.traverse((o) => {
      if (o.material) o.material.dispose();
      if (o.geometry && o.geometry !== this.orbGeo && o.geometry !== this.beamGeo) o.geometry.dispose();
    });
  }
  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }
  update(t) {
    for (const g of this.list.values()) {
      const u = g.userData;
      const age = t - u.born;
      const pop = smooth(0, 0.5, age) * (1 + Math.sin(Math.min(1, age * 2) * Math.PI) * 0.3);
      const y = 1.6 + Math.sin(t * 2.4 + g.id) * 0.25;
      u.orb.position.y = y;
      u.orb.scale.setScalar(0.85 * pop);
      u.icon.position.y = y;
      u.icon.scale.setScalar(1.25 * pop);
      u.halo.position.y = y;
      u.halo.scale.setScalar((3.8 + Math.sin(t * 5) * 0.4) * pop);
      u.ring.scale.setScalar(1 + 0.12 * Math.sin(t * 4));
      u.ring.rotation.z = t;
      u.bu.time.value = t;
    }
  }
}

// ---------- Ударные волны и вспышки ----------
const WAVE_FRAG = /* glsl */ `
uniform vec3 col;
uniform float a;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float ring = smoothstep(0.72, 0.94, r) * smoothstep(1.0, 0.95, r);
  float fill = smoothstep(0.95, 0.2, r) * 0.18;
  gl_FragColor = vec4(col, (ring + fill) * a);
}`;
export class Waves {
  constructor(scene, n = 8) {
    this.items = [];
    this.glow = glowTex();
    const geo = new T.PlaneGeometry(2, 2);
    for (let i = 0; i < n; i++) {
      const u = { col: { value: new T.Color() }, a: { value: 0 } };
      const m = new T.Mesh(geo, new T.ShaderMaterial({ uniforms: u, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: WAVE_FRAG, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 4;
      const f = new T.Sprite(new T.SpriteMaterial({ map: this.glow, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
      f.visible = false;
      f.renderOrder = 8;
      scene.add(m, f);
      this.items.push({ m, u, f, t: 0, life: 1, r0: 1, r1: 4, fs: 0, live: false });
    }
  }
  // кольцо по земле от r0 до r1 и вспышка размером fs на высоте y
  add(x, z, r0, r1, color = "#ffffff", life = 0.7, fs = 0, y = 2) {
    const w = this.items.find((q) => !q.live) || this.items.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    Object.assign(w, { t: 0, life, r0, r1, fs, live: true });
    w.u.col.value.set(color).multiplyScalar(2.4);
    w.m.position.set(x, 0.2, z);
    w.m.visible = true;
    w.f.position.set(x, y, z);
    w.f.material.color.set(color).multiplyScalar(2);
    w.f.visible = fs > 0;
  }
  update(dt) {
    for (const w of this.items) {
      if (!w.live) continue;
      w.t += dt;
      const k = w.t / w.life;
      if (k >= 1) {
        w.live = false;
        w.m.visible = w.f.visible = false;
        continue;
      }
      const e = 1 - (1 - k) * (1 - k);
      const r = w.r0 + (w.r1 - w.r0) * e;
      w.m.scale.set(r, r, 1);
      w.u.a.value = (1 - k) * (1 - k);
      if (w.fs) {
        const s = w.fs * (0.6 + 0.6 * smooth(0, 0.25, k));
        w.f.scale.setScalar(s);
        w.f.material.opacity = Math.max(0, 1 - k * 2.2);
      }
    }
  }
  clear() {
    for (const w of this.items) (w.live = false), (w.m.visible = w.f.visible = false);
  }
}

// ---------- Нимбы над золотыми предметами ----------
export class Halos {
  constructor(scene, max = 40) {
    this.mesh = new T.InstancedMesh(new T.TorusGeometry(1, 0.11, 8, 28), new T.MeshBasicMaterial({ color: new T.Color("#ffd24a").multiplyScalar(2.8), toneMapped: false }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.max = max;
    this.d = new T.Object3D();
  }
  // list: [{ x, y, z, r }]
  update(list, t) {
    const n = Math.min(this.max, list.length), d = this.d;
    for (let i = 0; i < n; i++) {
      const q = list[i];
      d.position.set(q.x, q.y + 0.35 + Math.sin(t * 3 + i) * 0.15, q.z);
      d.rotation.set(Math.PI / 2 + Math.sin(t * 2 + i) * 0.15, 0, t * 2 + i);
      d.scale.setScalar(q.r);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Лицо Урагана-великана: ворчливое, но доброе ----------
export function bossFace() {
  const tex = canvasTexture(256, 160, (g) => {
    g.lineCap = g.lineJoin = "round";
    // щёки
    g.fillStyle = "rgba(255,150,170,.55)";
    for (const x of [58, 198]) {
      g.beginPath();
      g.ellipse(x, 112, 22, 13, 0, 0, TAU);
      g.fill();
    }
    // глаза
    for (const x of [86, 170]) {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.ellipse(x, 74, 28, 32, 0, 0, TAU);
      g.fill();
      g.fillStyle = "#1d2148";
      g.beginPath();
      g.arc(x + (x < 128 ? 6 : -6), 80, 15, 0, TAU);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x + (x < 128 ? 11 : -1), 73, 5, 0, TAU);
      g.fill();
    }
    // брови домиком к носу — «ворчит»
    g.strokeStyle = "#1d2148";
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(52, 30);
    g.lineTo(112, 44);
    g.moveTo(204, 30);
    g.lineTo(144, 44);
    g.stroke();
    // рот: волнистая ворчалка
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(100, 128);
    g.quadraticCurveTo(114, 118, 128, 128);
    g.quadraticCurveTo(142, 138, 156, 128);
    g.stroke();
  });
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.center.set(0.5, 0.5);
  s.renderOrder = 9;
  return s;
}
