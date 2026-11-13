// Взрыв машины: разлетаются куски её настоящей модели, растут объёмные клубы огня и дыма,
// на дороге остаётся подпалина. Всё считается в координатах дороги и уезжает назад вместе с ней.
import * as T from "../../vendor/three/three.module.min.js?v=517659a9";
import { mergeVertices } from "../../vendor/three/BufferGeometryUtils.js?v=517659a9";
import { wreckParts } from "./vehicles.js?v=517659a9";
import { bend, heading, rise, riseSlope, UNITS_PER_METRE } from "./scenery.js?v=517659a9";

const BIG_BALLS = 48,
  SMALL_BALLS = 170,
  GLOWS = 130,
  MARKS = 36,
  MAX_BLASTS = 6,
  GRAVITY = 17,
  BEHIND_CAMERA = 18;
const FIRE = 0,
  SMOKE = 1,
  DUST = 2,
  FLASH = 3,
  HALO = 4,
  SPARK = 5,
  BEACON_RED = 6,
  BEACON_BLUE = 7;
const SCORCH = 0,
  GROUND_GLOW = 1,
  SHOCK = 2;

// Клуб — шар с буграми из объёмного шума. Он непрозрачный: не мутит кадр и хорошо читается издалека,
// а растворяется рваными дырами
const BALL_VERT = `
uniform sampler3D uNoise;
attribute vec3 iPos;
attribute vec4 iInfo;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vWorld;
varying float vLump;
varying float vAge;
varying float vSeed;
varying float vKind;
float lumps(vec3 n, vec3 shift){
  vec3 q = n * 0.34 + shift;
  return texture(uNoise, q).g * 0.68 + texture(uNoise, q * 2.3).g * 0.32;
}
vec3 bump(vec3 n, vec3 shift, float depth){
  return n * (1.0 + (lumps(n, shift) - 0.5) * depth);
}
void main(){
  vec3 n = normalize(position);
  vAge = iInfo.y;
  vSeed = iInfo.z;
  vKind = iInfo.w;
  vec3 shift = vec3(vSeed * 3.1, vSeed * 5.7 - vAge * 0.3, vSeed * 1.3);
  float depth = 1.05 + vAge * 0.35;
  vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  vec3 p0 = bump(n, shift, depth);
  vec3 p1 = bump(normalize(n + t * 0.14), shift, depth);
  vec3 p2 = bump(normalize(n + b * 0.14), shift, depth);
  vN = normalize(cross(p1 - p0, p2 - p0));
  vObj = n;
  vLump = lumps(n, shift);
  // У самой камеры клуб съёживается: он не должен закрывать дорогу
  float near = smoothstep(3.0, 10.0, distance(iPos, cameraPosition));
  vec3 world = iPos + p0 * iInfo.x * near;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const BALL_FRAG = `
uniform sampler3D uNoise;
uniform float uLight;
varying vec3 vObj;
varying vec3 vN;
varying vec3 vWorld;
varying float vLump;
varying float vAge;
varying float vSeed;
varying float vKind;
vec3 flame(float h){
  vec3 c = mix(vec3(0.3, 0.03, 0.02), vec3(0.9, 0.17, 0.02), smoothstep(0.04, 0.3, h));
  c = mix(c, vec3(1.0, 0.5, 0.04), smoothstep(0.3, 0.5, h));
  c = mix(c, vec3(1.0, 0.83, 0.2), smoothstep(0.52, 0.74, h));
  return mix(c, vec3(1.0, 0.98, 0.8), smoothstep(0.82, 1.02, h));
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = max(dot(N, V), 0.0);
  float top = N.y * 0.5 + 0.5;
  float torn = texture(uNoise, vObj * 0.42 + vec3(vSeed * 2.3, vSeed * 4.1, vAge * 0.12)).r;
  float lump = clamp((vLump - 0.3) / 0.4, 0.0, 1.0);
  if (vKind < 0.5) {
    float burn = smoothstep(0.52, 1.0, vAge) * 0.98;
    if (torn < burn) discard;
    float heat = (1.0 - pow(vAge, 1.15)) * (0.5 + lump * 0.72) + facing * 0.26 - 0.1;
    vec3 col = flame(heat);
    // Остывая, огонь становится сажей, а края дыр ещё тлеют
    vec3 soot = mix(vec3(0.07, 0.06, 0.06), vec3(0.3, 0.27, 0.26), smoothstep(0.1, 0.9, top * 0.8 + lump * 0.3)) * uLight;
    col = mix(col, soot, smoothstep(0.58, 0.92, vAge));
    col = mix(col, vec3(1.0, 0.52, 0.06), (1.0 - smoothstep(burn, burn + 0.07, torn)) * step(0.01, burn));
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  // Пыль просто садится, дым расходится клочьями
  float burn = vKind < 1.5 ? smoothstep(0.6, 1.0, vAge) : 0.0;
  if (torn < burn) discard;
  float shade = smoothstep(0.08, 0.92, top * 0.74 + lump * 0.4);
  vec3 col = vKind < 1.5
    ? mix(vec3(0.14, 0.135, 0.14), vec3(0.6, 0.58, 0.57), shade) * (1.0 + vAge * 0.35) * uLight
    : mix(vec3(0.34, 0.29, 0.24), vec3(0.82, 0.75, 0.65), shade) * uLight;
  // Молодой дым подсвечен огнём снизу
  if (vKind < 1.5) col += vec3(1.0, 0.34, 0.06) * (1.0 - top) * (1.0 - smoothstep(0.0, 0.32, vAge)) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;
const GLOW_VERT = `
attribute vec3 iPos;
attribute vec4 iInfo;
attribute vec3 iVel;
varying vec2 vUv;
varying float vAge;
varying float vKind;
varying float vNear;
void main(){
  vUv = uv;
  vAge = iInfo.y;
  vKind = iInfo.w;
  vec4 view = viewMatrix * vec4(iPos, 1.0);
  // Искра вытягивается вдоль своего движения
  vec2 v = (viewMatrix * vec4(iVel, 0.0)).xy;
  float speed = length(v);
  vec2 dir = speed > 0.001 ? v / speed : vec2(1.0, 0.0);
  view.xy += dir * position.x * (iInfo.x + speed * 0.05) + vec2(-dir.y, dir.x) * position.y * iInfo.x;
  vNear = smoothstep(2.5, 11.0, -view.z);
  gl_Position = projectionMatrix * view;
}`;
const GLOW_FRAG = `
varying vec2 vUv;
varying float vAge;
varying float vKind;
varying float vNear;
void main(){
  float r = length(vUv * 2.0 - 1.0);
  if (r > 1.0) discard;
  vec3 col;
  if (vKind < 3.5) col = vec3(1.0, 0.93, 0.72) * pow(1.0 - r, 2.2) * (1.0 - vAge) * 2.0;
  else if (vKind < 4.5) col = vec3(1.0, 0.46, 0.1) * pow(1.0 - r, 2.0) * (1.0 - vAge) * (1.0 - vAge) * 0.95;
  else if (vKind > 6.5) col = vec3(0.16, 0.34, 1.0) * pow(1.0 - r, 1.8) * 1.5;
  else if (vKind > 5.5) col = vec3(1.0, 0.1, 0.12) * pow(1.0 - r, 1.8) * 1.5;
  else col = mix(vec3(1.0, 0.86, 0.42), vec3(1.0, 0.3, 0.05), vAge) * pow(1.0 - r, 1.4) * 2.2 * (1.0 - vAge * vAge);
  gl_FragColor = vec4(col * vNear, 0.0);
}`;
const MARK_VERT = `
attribute vec3 iPos;
attribute vec4 iInfo;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vKind;
void main(){
  vUv = uv;
  vAge = iInfo.y;
  vSeed = iInfo.z;
  vKind = floor(iInfo.w);
  // Дробная часть — наклон дороги: на подъёме пятно не должно уходить под асфальт
  float slope = (fract(iInfo.w) - 0.5) * 2.0;
  vec3 at = iPos + vec3(position.x * iInfo.x, position.y * iInfo.x * slope, -position.y * iInfo.x);
  gl_Position = projectionMatrix * viewMatrix * vec4(at, 1.0);
}`;
const MARK_FRAG = `
uniform sampler3D uNoise;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vKind;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  if (vKind < 0.5) {
    float n = texture(uNoise, vec3(vUv * 0.7, vSeed)).g;
    float a = smoothstep(1.0, 0.3, r + (n - 0.5) * 1.1) * min(vAge * 14.0, 1.0) * 0.84;
    gl_FragColor = vec4(vec3(0.035, 0.03, 0.03) * a, a);
  } else if (vKind < 1.5) {
    float f = pow(1.0 - r, 1.8) * (1.0 - vAge) * (1.0 - vAge);
    gl_FragColor = vec4(vec3(1.0, 0.52, 0.14) * f * 0.8, 0.0);
  } else {
    // Ударная волна: тонкое кольцо по земле, быстро расходится и гаснет
    float e = 1.0 - (1.0 - vAge) * (1.0 - vAge);
    float band = smoothstep(0.1, 0.0, abs(r - e * 0.94)) * (1.0 - vAge);
    gl_FragColor = vec4(vec3(1.0, 0.88, 0.62) * band * 0.85, 0.0);
  }
}`;
// Огонь и подпалина смешиваются в одну отрисовку: цвет складывается, альфа заслоняет
const SHINE = {
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  blending: T.CustomBlending,
  blendSrc: T.OneFactor,
  blendDst: T.OneMinusSrcAlphaFactor,
  blendSrcAlpha: T.OneFactor,
  blendDstAlpha: T.OneMinusSrcAlphaFactor,
};
function batch(source, capacity, material, order, velocity = false) {
  const g = new T.InstancedBufferGeometry();
  g.index = source.index;
  g.setAttribute("position", source.attributes.position);
  if (source.attributes.uv) g.setAttribute("uv", source.attributes.uv);
  const attr = (name, size) => {
    const a = new T.InstancedBufferAttribute(new Float32Array(capacity * size), size).setUsage(T.DynamicDrawUsage);
    g.setAttribute(name, a);
    return a;
  };
  const b = { at: attr("iPos", 3), info: attr("iInfo", 4), vel: velocity ? attr("iVel", 3) : null, geometry: g, capacity, count: 0 };
  g.instanceCount = 0;
  b.mesh = new T.Mesh(g, material);
  b.mesh.frustumCulled = false;
  b.mesh.renderOrder = order;
  return b;
}
function flush(b) {
  b.geometry.instanceCount = b.count;
  if (b.count)
    for (const a of [b.at, b.info, b.vel]) {
      if (!a) continue;
      a.clearUpdateRanges();
      a.addUpdateRange(0, b.count * a.itemSize);
      a.needsUpdate = true;
    }
  b.count = 0;
}
function write(b, x, y, z, size, age, seed, kind) {
  const i = b.count++;
  b.at.array[i * 3] = x;
  b.at.array[i * 3 + 1] = y;
  b.at.array[i * 3 + 2] = z;
  b.info.array[i * 4] = size;
  b.info.array[i * 4 + 1] = age;
  b.info.array[i * 4 + 2] = seed;
  b.info.array[i * 4 + 3] = kind;
  return i;
}
// Бесшовный клеточный шум: бугры у клубов получаются как у настоящего дыма
function noiseVolume(size = 32) {
  let s = 19;
  const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const layer = (cells) => {
    const points = new Float32Array(cells * cells * cells * 3).map(() => random());
    return (u, v, w) => {
      const cx = Math.floor(u * cells),
        cy = Math.floor(v * cells),
        cz = Math.floor(w * cells);
      let best = 9;
      for (let k = -1; k <= 1; k++)
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const gx = cx + i,
              gy = cy + j,
              gz = cz + k,
              at = (((gz + cells) % cells) * cells * cells + ((gy + cells) % cells) * cells + (gx + cells) % cells) * 3,
              dx = (gx + points[at]) / cells - u,
              dy = (gy + points[at + 1]) / cells - v,
              dz = (gz + points[at + 2]) / cells - w;
            best = Math.min(best, dx * dx + dy * dy + dz * dz);
          }
      return 1 - Math.min(1, Math.sqrt(best) * cells * 0.82);
    };
  };
  const puffy = [layer(3), layer(6)],
    torn = [layer(4), layer(8)],
    data = new Uint8Array(size * size * size * 2);
  let at = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size,
          v = y / size,
          w = z / size;
        data[at++] = 255 * (torn[0](u, v, w) * 0.62 + torn[1](u, v, w) * 0.38);
        data[at++] = 255 * (puffy[0](u, v, w) * 0.72 + puffy[1](u, v, w) * 0.28);
      }
  const t = new T.Data3DTexture(data, size, size, size);
  t.format = T.RGFormat;
  t.wrapS = t.wrapT = t.wrapR = T.RepeatWrapping;
  t.minFilter = t.magFilter = T.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
function ballGeometry(detail) {
  const g = new T.IcosahedronGeometry(1, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  return mergeVertices(g, 0.0001);
}
const spread = (a, b) => a + Math.random() * (b - a),
  either = () => (Math.random() < 0.5 ? -1 : 1);

export class Blasts {
  constructor(scene) {
    this.scene = scene;
    const noise = noiseVolume();
    this.uniforms = { uNoise: { value: noise }, uLight: { value: 1 } };
    const solid = new T.ShaderMaterial({
      vertexShader: BALL_VERT,
      fragmentShader: BALL_FRAG,
      uniforms: this.uniforms,
      toneMapped: false,
    });
    this.big = batch(ballGeometry(7), BIG_BALLS, solid, 2);
    this.small = batch(ballGeometry(3), SMALL_BALLS, solid, 2);
    const quad = new T.PlaneGeometry(1, 1);
    this.glows = batch(quad, GLOWS, new T.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, ...SHINE }), 6, true);
    this.groundMarks = batch(quad, MARKS, new T.ShaderMaterial({
      vertexShader: MARK_VERT,
      fragmentShader: MARK_FRAG,
      uniforms: this.uniforms,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      ...SHINE,
    }), 1);
    scene.add(this.big.mesh, this.small.mesh, this.glows.mesh, this.groundMarks.mesh);
    // Свой материал у каждого взрыва: его куски раскаляются и чернеют вместе
    this.materials = Array.from({ length: MAX_BLASTS }, () => {
      const m = new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.6,
        metalness: 0.22,
        side: T.DoubleSide,
        emissive: "#ff5a14",
        emissiveIntensity: 0,
      });
      m.userData.free = true;
      return m;
    });
    // Пустая сетка заранее собирает шейдер: первый взрыв не должен дёрнуть кадр
    const empty = new T.BufferGeometry();
    for (const name of ["position", "normal", "color"])
      empty.setAttribute(name, new T.BufferAttribute(new Float32Array(0), 3));
    this.primer = new T.Mesh(empty, this.materials[0]);
    this.primer.frustumCulled = false;
    scene.add(this.primer);
    this.live = [];
    this.puffs = [];
    this.marks = [];
    this.flash = 0;
    this.kickAt = 0;
    this.time = 0;
  }
  clear() {
    for (const b of this.live) this.retire(b);
    this.live = [];
    this.puffs = [];
    this.marks = [];
    this.flash = 0;
    for (const b of [this.big, this.small, this.glows, this.groundMarks]) flush(b);
  }
  retire(b) {
    for (const p of b.pieces) p.mesh.removeFromParent();
    b.pieces = [];
    b.material.userData.free = true;
  }
  puff(o) {
    o.t = -(o.delay || 0);
    o.seed = Math.random();
    o.g ??= 0;
    this.puffs.push(o);
  }
  spawn(ev, d, game, lite) {
    if (this.live.length >= MAX_BLASTS) this.retire(this.live.shift());
    const parts = wreckParts(ev.type),
      z = (ev.y - game.car.y) / UNITS_PER_METRE,
      R = d - z,
      X = (ev.x - 300) / 30,
      k = T.MathUtils.clamp(parts.length / 4.6, 0.85, 1.35),
      // Машина уже ехала вперёд, а снаряд толкает её дальше: взрыв не сразу налетает на камеру
      carry = ((1 - ev.pace) * game.cruise) / UNITS_PER_METRE,
      push = spread(7, 10),
      forward = carry + push,
      material = this.materials.find((m) => m.userData.free),
      side = ev.x === 300 ? either() : Math.sign(ev.x - 300);
    material.userData.free = false;
    material.color.setScalar(1);
    material.emissiveIntensity = 0.7;
    const blast = { t: 0, material, pieces: [] };
    for (const part of parts.list) {
      const mesh = new T.Mesh(part.geometry, material);
      mesh.rotation.order = "YXZ";
      mesh.castShadow = !lite && part.radius > 0.75;
      this.scene.add(mesh);
      const dist = Math.hypot(part.x, part.y - 0.25, part.z - parts.middle) || 1,
        p = {
          mesh,
          x: X + part.x,
          R: R - part.z,
          y: part.y,
          r: part.radius,
          wheel: part.wheel,
          hull: part.hull,
          rx: 0,
          ry: 0,
          rz: 0,
          rest: part.wheel ? part.radius : Math.min(0.42, part.radius * 0.32),
          bounces: 0,
          trail: 0,
          kicked: 0,
        };
      if (part.hull) {
        // Днище целиком подлетает и переворачивается: его видно и издалека
        p.vy = spread(9.5, 11.5);
        p.vx = side * spread(1.6, 3.4);
        p.vR = forward * 0.85;
        p.wx = either() * spread(2.4, 3.8);
        p.wy = spread(-1, 1);
        p.wz = either() * spread(1.8, 3.4);
      } else if (part.wheel) {
        // Колесо отскакивает и катится дальше само
        p.vy = spread(6, 11);
        p.vx = (Math.sign(part.x) || either()) * spread(3.5, 8);
        p.vR = forward + spread(2, 7);
        p.wx = spread(-22, -13);
        p.wy = spread(-2.5, 2.5);
        p.wz = 0;
      } else {
        const speed = spread(8, 15);
        p.vy = ((part.y - 0.25) / dist) * speed + spread(4, 9);
        p.vx = (part.x / dist) * speed * 1.2;
        p.vR = carry + push * spread(0.6, 1.2) - ((part.z - parts.middle) / dist) * speed;
        p.wx = spread(-10, 10);
        p.wy = spread(-8, 8);
        p.wz = spread(-10, 10);
      }
      blast.pieces.push(p);
    }
    // Дым и пламя тянутся за самыми крупными кусками
    [...blast.pieces]
      .filter((p) => !p.wheel)
      .sort((a, b) => b.r - a.r)
      .slice(0, lite ? 2 : 4)
      .forEach((p) => (p.trails = true));
    this.live.push(blast);
    const at = (extra) => ({ x: X, R, y: 1, vx: 0, vR: forward, vy: 0, drag: 3, ...extra });
    this.puff(at({ kind: FLASH, y: 1.4, drag: 0, s0: 5 * k, s1: 12 * k, life: 0.13 }));
    this.puff(at({ kind: HALO, y: 1.8, s0: 8 * k, s1: 16 * k, life: 0.42 }));
    // Сердцевина взрыва и лепестки вокруг неё
    this.puff(at({ kind: FIRE, big: true, y: 1.1 * k, s0: 1 * k, s1: 2.9 * k, life: 0.62, drag: 4 }));
    const lobes = lite ? 6 : 9;
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + Math.random() * 0.5,
        up = spread(0.05, 0.85),
        out = Math.sqrt(1 - up * up),
        speed = spread(5.5, 10);
      this.puff(at({
        kind: FIRE,
        big: true,
        x: X + Math.cos(a) * out * 1.1 * k,
        R: R + Math.sin(a) * out * 1.1 * k,
        y: 0.9 * k + up * 1.5 * k,
        vx: Math.cos(a) * out * speed,
        vR: forward + Math.sin(a) * out * speed,
        vy: up * speed + 1.5,
        drag: 3.5,
        s0: spread(0.5, 0.8) * k,
        s1: spread(1.5, 2.3) * k,
        life: spread(0.6, 0.92),
        delay: spread(0, 0.05),
      }));
    }
    // Запоздалые хлопки: взрыв не гаснет сразу
    for (let i = 0; i < (lite ? 2 : 4); i++)
      this.puff(at({
        kind: FIRE,
        big: true,
        x: X + spread(-2.3, 2.3) * k,
        R: R + spread(-2.3, 2.3) * k,
        y: spread(1.5, 3.8) * k,
        vx: spread(-2, 2),
        vy: spread(3, 6),
        drag: 2.4,
        s0: 0.4 * k,
        s1: spread(1.2, 1.7) * k,
        life: spread(0.5, 0.7),
        delay: spread(0.1, 0.3),
      }));
    // Дым поднимается над шаром столбом и не загораживает дорогу
    for (let i = 0; i < (lite ? 4 : 7); i++)
      this.puff(at({
        kind: SMOKE,
        big: true,
        x: X + spread(-1.5, 1.5) * k,
        R: R + spread(-1.5, 1.5) * k,
        y: spread(2.2, 4.6) * k,
        vx: spread(-1, 1),
        vR: forward * 0.5,
        vy: spread(4, 7),
        drag: 1.1,
        s0: 0.6 * k,
        s1: spread(1.7, 2.8) * k,
        life: spread(1.2, 2),
        delay: spread(0.16, 0.5),
      }));
    // Пыль катится кольцом по земле
    const dust = lite ? 7 : 11;
    for (let i = 0; i < dust; i++) {
      const a = (i / dust) * Math.PI * 2 + Math.random() * 0.3,
        speed = spread(15, 21);
      this.puff(at({
        kind: DUST,
        y: 0.4,
        vx: Math.cos(a) * speed,
        vR: carry * 0.4 + Math.sin(a) * speed,
        vy: spread(0.2, 1),
        drag: 4.4,
        s0: 0.3 * k,
        s1: spread(0.7, 1.15) * k,
        life: spread(0.55, 0.9),
      }));
    }
    for (let i = 0; i < (lite ? 16 : 28); i++) {
      const a = Math.random() * Math.PI * 2,
        speed = spread(9, 26),
        up = spread(0.15, 1);
      this.puff(at({
        kind: SPARK,
        y: spread(0.6, 2),
        vx: Math.cos(a) * speed * (1 - up * 0.5),
        vR: forward + Math.sin(a) * speed * (1 - up * 0.5),
        vy: up * speed,
        g: 15,
        drag: 0.9,
        s0: 0.34,
        s1: 0.22,
        life: spread(0.5, 1.2),
      }));
    }
    const mark = (kind, size, life) => {
      if (this.marks.length >= MARKS) this.marks.shift();
      this.marks.push({ kind, x: X, R, size, life, t: 0, seed: Math.random() });
    };
    mark(SCORCH, 5.6 * k, 12);
    mark(GROUND_GLOW, 13 * k, 0.5);
    mark(SHOCK, 26 * k, 0.36);
    // Вблизи вспышка осветляет весь кадр, издалека лишь чуть-чуть
    this.flash = Math.max(this.flash, 0.34 * T.MathUtils.clamp(1 + z / 90, 0.25, 1));
  }
  // Из-под шин машины, которая ушла в занос, идёт белый дым
  skid(ev, d, game) {
    const R = d - (ev.y - game.car.y) / UNITS_PER_METRE,
      X = (ev.x - 300) / 30;
    for (let i = 0; i < 3; i++)
      this.puff({ kind: DUST, x: X + spread(-0.9, 0.9), R: R + spread(-1.6, 1.6), y: 0.25, vx: spread(-1.2, 1.2), vR: spread(0, 3), vy: spread(0.6, 1.8), drag: 2.4, s0: 0.3, s1: spread(0.7, 1.1), life: spread(0.5, 0.85) });
  }
  // Мигалка погони видна издалека и в зеркале
  beacons(game, d) {
    const car = game.chase?.car;
    if (!car || this.glows.count + 2 > this.glows.capacity) return;
    const z = (car.y - game.car.y) / UNITS_PER_METRE,
      R = d - z,
      x = (car.x - 300) / 30 + bend(R) - bend(d),
      y = 1.98 + rise(R) - rise(d),
      left = Math.sin(this.time * 15) > 0;
    for (const side of [-1, 1])
      write(this.glows, x + side * 0.34, y, z + 0.22, left === side < 0 ? 1.9 : 0.6, 0, 0, side < 0 ? BEACON_RED : BEACON_BLUE);
  }
  update(game, d, dt, light, lite) {
    for (const ev of game.blasts) {
      if (ev.skid) this.skid(ev, d, game);
      else this.spawn(ev, d, game, lite);
    }
    game.blasts.length = 0;
    this.time += dt;
    this.flash *= Math.exp(-dt * 9);
    const carX = (game.car.x - 300) / 30,
      speed = (game.speedNow || 0) / UNITS_PER_METRE;
    for (const b of this.live) {
      b.t += dt;
      const hot = Math.max(0, 1 - b.t / 0.4);
      b.material.emissiveIntensity = 0.7 * hot * hot;
      b.material.color.setScalar(T.MathUtils.lerp(0.26, 1, Math.max(0, 1 - b.t / 1.2)));
      for (const p of b.pieces) this.movePiece(b, p, d, dt, carX, speed, lite);
      b.pieces = b.pieces.filter((p) => {
        if (d - p.R < BEHIND_CAMERA && b.t < 9) return true;
        p.mesh.removeFromParent();
        return false;
      });
    }
    this.live = this.live.filter((b) => {
      if (b.pieces.length) return true;
      b.material.userData.free = true;
      return false;
    });
    const roadBend = bend(d),
      roadRise = rise(d);
    for (const p of this.puffs) {
      p.t += dt;
      if (p.t < 0 || p.t >= p.life) continue;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vR *= drag;
      p.vy = p.vy * drag - p.g * dt;
      p.x += p.vx * dt;
      p.R += p.vR * dt;
      p.y += p.vy * dt;
      if (p.g && p.y < 0.06 && p.vy < 0) {
        p.y = 0.06;
        p.vy *= -0.42;
      }
      const age = p.t / p.life,
        settle = p.kind === DUST ? 1 - age * age * age : p.kind === SMOKE ? 1 - age * age * age * age : 1,
        size = (p.s0 + (p.s1 - p.s0) * (1 - (1 - age) * (1 - age) * (1 - age))) * settle,
        glow = p.kind >= FLASH,
        target = glow ? this.glows : p.big ? this.big : this.small;
      if (target.count >= target.capacity) continue;
      // Шар не проваливается в асфальт
      const y = (glow ? p.y : Math.max(p.y, size * 0.72)) + rise(p.R) - roadRise,
        i = write(target, p.x + bend(p.R) - roadBend, y, d - p.R, size, age, p.seed, p.kind);
      if (glow) {
        target.vel.array[i * 3] = p.kind === SPARK ? p.vx : 0;
        target.vel.array[i * 3 + 1] = p.kind === SPARK ? p.vy : 0;
        target.vel.array[i * 3 + 2] = p.kind === SPARK ? speed - p.vR : 0;
      }
    }
    this.puffs = this.puffs.filter((p) => p.t < p.life && d - p.R < BEHIND_CAMERA);
    this.beacons(game, d);
    flush(this.big);
    flush(this.small);
    flush(this.glows);
    this.uniforms.uLight.value = light;
    const marks = this.groundMarks;
    for (const m of this.marks) {
      m.t += dt;
      const z = d - m.R;
      if (m.t >= m.life || z > BEHIND_CAMERA) continue;
      write(
        marks,
        m.x + bend(m.R) - roadBend,
        (m.kind === SHOCK ? 0.3 : 0.05) + rise(m.R) - roadRise,
        z,
        m.size,
        m.t / m.life,
        m.seed,
        m.kind + T.MathUtils.clamp(riseSlope(m.R) * 0.5 + 0.5, 0.01, 0.99),
      );
    }
    this.marks = this.marks.filter((m) => m.t < m.life && d - m.R < BEHIND_CAMERA);
    flush(marks);
  }
  movePiece(b, p, d, dt, carX, speed, lite) {
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt;
    p.R += p.vR * dt;
    p.y += p.vy * dt;
    p.rx += p.wx * dt;
    p.ry += p.wy * dt;
    p.rz += p.wz * dt;
    if (p.y < p.rest) {
      p.y = p.rest;
      if (p.vy < -2.4) {
        p.vy *= p.wheel ? -0.52 : -0.34;
        p.vx *= 0.74;
        p.vR *= p.wheel ? 0.94 : 0.72;
        if (!p.wheel) {
          p.wx *= 0.55;
          p.wy *= 0.55;
          p.wz *= 0.55;
        }
        if (p.r > 0.5 && p.bounces < 2)
          // Удар о дорогу поднимает пыль
          for (let i = 0; i < 3; i++)
            this.puff({ kind: DUST, x: p.x + spread(-0.5, 0.5), R: p.R + spread(-0.5, 0.5), y: 0.2, vx: spread(-3, 3), vR: p.vR * 0.5 + spread(-3, 3), vy: spread(0.5, 2), drag: 3.6, s0: 0.16 + p.r * 0.2, s1: 0.4 + p.r * 0.46, life: spread(0.4, 0.7) });
        p.bounces++;
      } else {
        p.vy = 0;
        const slide = Math.exp(-(p.wheel ? 0.5 : 3.4) * dt);
        p.vx *= slide;
        p.vR *= slide;
        if (!p.wheel) p.wx = p.wy = p.wz = 0;
      }
    }
    const near = d - p.R;
    // Обломки на своей полосе отлетают от бампера
    if (near > -3 && near < 2.2 && Math.abs(p.x - carX) < 1.25 + p.r * 0.5 && p.y < 1.5 && this.time - p.kicked > 0.5) {
      p.kicked = this.time;
      p.vy = spread(5, 8);
      p.vR = speed * spread(1.04, 1.22);
      p.vx += (p.x >= carX ? 1 : -1) * spread(2, 5);
      if (!p.wheel) {
        p.wx = spread(-9, 9);
        p.wz = spread(-9, 9);
      }
      if (this.time - this.kickAt > 0.14) {
        this.kickAt = this.time;
        Sound.shot("clank");
      }
    }
    // Хвост из огня и дыма за летящими кусками, потом кузов дымится на дороге
    if (p.trails && near < -5) {
      const flying = p.vy !== 0;
      p.trail -= dt;
      if (p.trail <= 0 && (flying ? b.t < 1.5 : b.t < 5)) {
        p.trail = flying ? (lite ? 0.09 : 0.055) : lite ? 0.5 : 0.3;
        const size = T.MathUtils.clamp(p.r * 0.4, 0.2, 0.6);
        if (flying ? b.t < 0.85 : Math.random() < 0.3 && b.t < 3)
          this.puff({ kind: FIRE, x: p.x, R: p.R, y: p.y + 0.1, vx: p.vx * 0.15, vR: p.vR * 0.3, vy: spread(0.6, 1.8), drag: 2.4, s0: size * 0.9, s1: size * 1.5, life: spread(0.3, 0.5) });
        this.puff({ kind: SMOKE, x: p.x + spread(-0.15, 0.15), R: p.R, y: p.y + 0.5, vx: spread(-0.3, 0.3), vR: p.vR * 0.2, vy: spread(2.4, 4), drag: 0.8, s0: size * 0.3, s1: size * 1.9, life: spread(0.6, 1.05) });
      }
    }
    const z = d - p.R;
    p.mesh.position.set(p.x + bend(p.R) - bend(d), p.y + rise(p.R) - rise(d), z);
    p.mesh.rotation.set(p.rx + Math.atan(riseSlope(p.R)), heading(p.R) + p.ry, p.rz);
  }
}
