// Шесть трёхмерных миров: земля с обрывом, холмы, горы, деревья, небо и облака.
import * as T from '../../vendor/three/three.module.min.js?v=d6bb936e';
import { blob, boxUV, fbm3, merge, paint, place, seededRandom, tube } from './shapes.js?v=d6bb936e';

// Свет, воздух и цвета каждого мира. Двумерная палитра слишком кричащая для настоящего освещения
const LOOKS = {
  meadow: {
    skyCols: ['#2274dc', '#5aaeef', '#cfe9f6'], sunSize: 0.56, fill: 0.32, fogFar: 8200,
    sun: '#ffefd0', sunI: 3.05, sky: '#c4e4ff', gnd: '#8aa85c', hemi: 1.15, env: 0.46, fog: '#d3eaf6', exposure: 0.92, bloom: 0.3, sat: 1.1, floor: 'turf',
    ground: ['#8ebc52', '#a6ce5c', '#6aa248'], hills: ['#8fbf5a', '#5d9c55'], blade: ['#b6d95e', '#6cb042', '#205a28'], tall: 19, grass: 1,
    crowns: [['#5ea33f', '#6dae42', '#529a3f'], ['#74b444', '#84bd48', '#68aa44'], ['#4a9244', '#569c44', '#428a44']], bark: ['#7a5433', '#4d3220'],
    amp: 340, ridges: [{ z: -4700, amp: 660, seed: 2, tint: ['#7f9fbe', '#6a8ea0'], snow: '#dfe7f1' }, { z: -5900, amp: 900, seed: 7, tint: ['#93b4d4', '#7c9fc0'], snow: '#e6edf6' }]
  },
  blossom: {
    skyCols: ['#d85aa8', '#f092c8', '#ffe2da'], sunSize: 0.56, fill: 0.32, fogFar: 8000,
    sun: '#fff0dd', sunI: 2.85, sky: '#ffdcee', gnd: '#b59a8a', hemi: 1.25, env: 0.48, fog: '#ffdfee', exposure: 0.95, bloom: 0.34, sat: 1.08, floor: 'turf',
    ground: ['#86ba5c', '#a2cc66', '#669e58'], hills: ['#a8cf74', '#d9a3c6'], blade: ['#dcee7c', '#88ca5a', '#31784b'], tall: 19, grass: 1,
    crowns: [['#ee86bc', '#f49cca', '#e677b2'], ['#f8b0d4', '#fbc2de', '#f4a0cb'], ['#e56aa8', '#ec7fb6', '#dc5e9f']], bark: ['#5f3a4c', '#3a2230'],
    amp: 290, ridges: [{ z: -4700, amp: 620, seed: 3, tint: ['#c990c8', '#a678b4'], snow: '#f6e6f2' }, { z: -5900, amp: 860, seed: 11, tint: ['#dcb0dc', '#bb94cc'], snow: '#fbedf6' }]
  },
  canyon: {
    sunSize: 0.8, fill: 0.34, fogFar: 8000,
    sun: '#ffd596', sunI: 3.2, sky: '#ffb9a0', gnd: '#b5683a', hemi: 1.05, env: 0.42, fog: '#ffbf98', exposure: 0.93, bloom: 0.38, sat: 1.1, floor: 'sand',
    ground: ['#d9a86e', '#e6bc84', '#c08f58'], hills: ['#cf8a50', '#a8603a'], blade: ['#d6b460', '#ad8a40', '#5c4420'], tall: 13, grass: 0.2,
    crowns: [], bark: ['#6b4a2e', '#3f2a1a'],
    amp: 230, ridges: [{ z: -5600, amp: 640, seed: 4, tint: ['#c75b86', '#8c3a80'] }]
  },
  glacier: {
    sunSize: 0.7, fill: 0.28, fogFar: 8000,
    sun: '#fff8f0', sunI: 2.7, sky: '#c6e2ff', gnd: '#a9c6e6', hemi: 1.3, env: 0.62, fog: '#d9f0fb', exposure: 0.86, bloom: 0.26, sat: 1.14, floor: 'snow',
    ground: ['#c6daec', '#d9e9f6', '#a6c4e2'], hills: ['#d0e2f4', '#a8c6e6'], blade: ['#f2fbff', '#bfe6f5', '#6fa8cc'], tall: 11, grass: 0.22,
    crowns: [['#2d6e60', '#37796a', '#266455']], bark: ['#5a4034', '#35261f'],
    amp: 330, ridges: [{ z: -4700, amp: 700, seed: 3, tint: ['#9ec4ea', '#6f9cd0'], snow: '#e8f2fb' }, { z: -5900, amp: 980, seed: 8, tint: ['#b8d6f2', '#8db4e0'], snow: '#eef5fc' }]
  },
  neon: {
    sunSize: 0.8, fill: 1.15, fogFar: 7600,
    sun: '#a8b8ff', sunI: 1.55, sky: '#6d4ae6', gnd: '#10406a', hemi: 1.1, env: 0.42, fog: '#2a1a70', exposure: 1.02, bloom: 0.72, sat: 1.1, floor: 'turf',
    ground: ['#12405a', '#17586c', '#0b2a46'], hills: ['#1e1c70', '#0c0c3a'], blade: ['#3dffc8', '#13a88a', '#072c44'], tall: 16, grass: 0.85, bladeGlow: 0.8,
    crowns: [], bark: ['#3a3a70', '#1e1e48'],
    amp: 210, ridges: [{ z: -5700, amp: 620, seed: 6, tint: ['#43188f', '#1b0a55'] }]
  },
  volcano: {
    sunSize: 0.8, fill: 1.0, fogFar: 7600,
    sun: '#ffb478', sunI: 2.0, sky: '#8c3656', gnd: '#ff6a2a', hemi: 1.05, env: 0.38, fog: '#54162c', exposure: 1.0, bloom: 0.78, sat: 1.08, floor: 'crag',
    ground: ['#4a2428', '#5c2e2e', '#2f1520'], hills: ['#3f1628', '#1c0a14'], lavaCracks: true, blade: ['#9a4a26', '#5a2414', '#220a08'], tall: 9, grass: 0.1, bladeGlow: 0.06,
    crowns: [], bark: ['#2a1016', '#160810'],
    amp: 300, ridges: [{ z: -5900, amp: 640, seed: 9, tint: ['#5c1136', '#2b0a22'] }]
  }
};

export function lookOf(biome) {
  return LOOKS[BIOMES[biome].id];
}

const smooth = T.MathUtils.smoothstep;

// ---------- небо ----------
export function makeSky(light) {
  const m = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uLow: { value: new T.Color() },
      uHorizon: { value: 0.5 }, uSun: { value: new T.Vector2(0.8, 0.8) }, uSunR: { value: 0.08 },
      uSunCol: { value: new T.Color() }, uGlow: { value: new T.Color() }, uAspect: { value: 1.5 },
      uMoon: { value: 0 }, uStars: { value: 0 }, uAurora: { value: 0 }, uLava: { value: 0 }, uRays: { value: 0 }, uTime: { value: 0 }, uPar: { value: 0 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uSunCol; uniform vec3 uGlow;
      uniform vec2 uSun; uniform float uHorizon; uniform float uSunR; uniform float uAspect; uniform float uMoon;
      uniform float uStars; uniform float uAurora; uniform float uLava; uniform float uRays; uniform float uTime; uniform float uPar;
      varying vec2 vUv;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float t = clamp((vUv.y - uHorizon) / max(1.0 - uHorizon, 0.2), 0.0, 1.0);
        vec3 c = t < 0.55 ? mix(uLow, uMid, t / 0.55) : mix(uMid, uTop, (t - 0.55) / 0.45);
        vec2 p = vec2((vUv.x - uSun.x + uPar) * uAspect, vUv.y - uSun.y);
        float d = length(p);
        c += uGlow * (0.34 * exp(-d * 3.6) + 0.5 * exp(-d * 15.0)) * (1.0 - uMoon * 0.55);
        if (uRays > 0.0) {
          float a = atan(p.y, p.x);
          float rays = pow(0.5 + 0.5 * sin(a * 11.0 + uTime * 0.06) * sin(a * 7.0 - uTime * 0.04), 3.0);
          c += uGlow * rays * exp(-d * 3.1) * uRays;
        }
        float disc = smoothstep(uSunR, uSunR - 0.006, d);
        if (uMoon > 0.5) {
          float crater = vn(p * 40.0) * 0.45 + vn(p * 90.0) * 0.2;
          float lit = smoothstep(-0.05, 0.08, dot(normalize(p + 0.001), normalize(vec2(-0.5, 0.6))) * d / uSunR + 0.3);
          c = mix(c, vec3(1.15, 1.1, 1.35) * (0.64 + crater) * mix(0.7, 1.15, lit), disc);
        } else {
          c = mix(c, uSunCol * 3.0, disc);
        }
        if (uStars > 0.0) {
          vec2 g = vec2(vUv.x * uAspect + uPar * uAspect, vUv.y) * 120.0;
          float r = h21(floor(g));
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0);
          float s = step(1.0 - 0.018 * uStars, r) * smoothstep(0.32, 0.0, length(fract(g) - 0.5)) * tw;
          c += vec3(1.6, 1.6, 1.9) * s * smoothstep(0.02, 0.3, t);
        }
        if (uAurora > 0.0) {
          float x = vUv.x * uAspect * 3.0 + uTime * 0.05;
          float band = vn(vec2(x, 1.0 + uTime * 0.03)) * 0.7 + vn(vec2(x * 3.0, 4.0)) * 0.3;
          float y = t - 0.42 - band * 0.28;
          float a = exp(-y * y * 42.0) * (0.5 + 0.5 * vn(vec2(x * 9.0, uTime * 0.2)));
          c += mix(vec3(0.1, 1.5, 0.95), vec3(0.95, 0.2, 1.5), band) * a * 0.62;
        }
        if (uLava > 0.0) c += vec3(1.5, 0.42, 0.08) * pow(1.0 - t, 3.2) * 0.62;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  void light;
  return mesh;
}

export function setSkyFor(sky, biome) {
  const B = BIOMES[biome];
  const u = sky.material.uniforms;
  const look = LOOKS[B.id];
  const cols = look.skyCols || B.sky;
  // Тональная кривая приглушает светлое: поднимаем небо, чтобы оно не серело
  u.uTop.value.set(cols[0]).multiplyScalar(1.12);
  u.uMid.value.set(cols[1]).multiplyScalar(1.12);
  u.uLow.value.set(cols[2]).multiplyScalar(1.1);
  const l = B.sun || B.moon;
  u.uMoon.value = B.moon ? 1 : 0;
  u.uSun.value.set(l ? l.x : 0.5, l ? 1 - l.y * 0.92 : -1);
  u.uSunR.value = l ? (l.r / 620) * look.sunSize : 0;
  u.uSunCol.value.set(B.sun ? B.sun.c : '#e8ddff');
  u.uGlow.value.set(B.sun ? B.sun.glow : '#8f7bff');
  u.uStars.value = B.stars ? B.stars / 90 : 0;
  u.uAurora.value = B.aurora ? 1 : 0;
  u.uLava.value = B.lavaGlow ? 1 : 0;
  u.uRays.value = B.id === 'meadow' ? 0.62 : B.id === 'glacier' ? 0.3 : B.id === 'canyon' ? 0.32 : B.id === 'blossom' ? 0.2 : 0;
}

// ---------- листва: тысячи пучков листьев вокруг кроны ----------
const FOLIAGE_VERT = `
attribute vec2 aCorner; attribute vec3 aDir; attribute vec3 aTint; attribute vec3 aMisc;
uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGnd;
varying vec2 vUv; varying vec3 vCol; varying float vFogDepth;
void main(){
  // aMisc: размер, плитка атласа, поворот
  vec3 p = position;
  float sw = sin(uTime * 1.1 + p.x * 0.012 + p.z * 0.01);
  p.x += sw * aMisc.x * 0.05;
  p.y += cos(uTime * 1.5 + p.x * 0.02) * aMisc.x * 0.018;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float c = cos(aMisc.z); float s = sin(aMisc.z);
  vec2 q = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
  mv.xy += q * aMisc.x;
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
  float tile = floor(aMisc.y + 0.5);
  vec2 uv01 = aCorner + 0.5;
  vUv = vec2((mod(tile, 2.0) + uv01.x) * 0.5, 1.0 - (floor(tile / 2.0) + 1.0 - uv01.y) * 0.5);
  // Нормаль шара кроны плюс маленький объём каждого пучка
  vec3 N = normalize(aDir + vec3(q * 1.1, 0.0));
  float w = clamp(dot(N, uSun) * 0.56 + 0.5, 0.0, 1.0);
  w = w * w;
  vec3 amb = mix(uGnd, uSky, N.y * 0.5 + 0.5);
  vCol = aTint * (amb * 0.74 + uSunCol * w * 1.34 * vec3(1.1, 1.0, 0.72));
}`;
const FOLIAGE_FRAG = `
uniform sampler2D uTex; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying vec3 vCol; varying float vFogDepth;
void main(){
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.25) discard;
  vec3 c = vCol * (0.3 + t.r * t.r * 0.9);
  float f = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(c, uFogColor, f), smoothstep(0.3, 0.52, t.a));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Foliage {
  constructor() {
    this.pos = [];
    this.corner = [];
    this.dir = [];
    this.tint = [];
    this.misc = [];
    this.index = [];
    this.n = 0;
  }

  quad(x, y, z, size, dx, dy, dz, r, g, b, tile, rot) {
    const i = this.n;
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      this.pos.push(x, y, z);
      this.corner.push(cx, cy);
      this.dir.push(dx, dy, dz);
      this.tint.push(r, g, b);
      this.misc.push(size, tile, rot);
    }
    this.index.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.n += 4;
  }

  // Шар из пучков: снаружи светлее, снизу темнее
  lobe(cx, cy, cz, R, count, colors, rng, tile = 0) {
    const col = new T.Color();
    const size = R * Math.min(1.05, Math.sqrt(20 / count));
    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const h = Math.sqrt(1 - u * u);
      const dx = Math.cos(a) * h;
      const dy = u;
      const dz = Math.sin(a) * h;
      const d = R * (0.5 + rng() * 0.52);
      col.set(colors[Math.floor(rng() * colors.length)]);
      const shade = 0.86 + rng() * 0.26;
      this.quad(cx + dx * d, cy + dy * d * 0.88, cz + dz * d, size * (0.82 + rng() * 0.36), dx, dy, dz, col.r * shade, col.g * shade, col.b * shade, tile + Math.floor(rng() * 3) % 3, rng() * Math.PI * 2);
    }
  }

  build(tex, light, fog) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aCorner', new T.Float32BufferAttribute(this.corner, 2));
    g.setAttribute('aDir', new T.Float32BufferAttribute(this.dir, 3));
    g.setAttribute('aTint', new T.Float32BufferAttribute(this.tint, 3));
    g.setAttribute('aMisc', new T.Float32BufferAttribute(this.misc, 3));
    g.setIndex(this.index);
    g.boundingSphere = new T.Sphere(new T.Vector3(600, 200, -2000), 12000);
    const m = new T.ShaderMaterial({
      vertexShader: FOLIAGE_VERT,
      fragmentShader: FOLIAGE_FRAG,
      side: T.DoubleSide,
      alphaToCoverage: true,
      uniforms: {
        uTex: { value: tex }, uTime: { value: 0 }, uSun: light.sunDir, uSunCol: light.sunColor, uSky: light.sky, uGnd: light.ground,
        uFogColor: fog.color, uFogNear: fog.near, uFogFar: fog.far
      }
    });
    return new T.Mesh(g, m);
  }
}

// ---------- трава: пучки по пять изогнутых травинок, тень считается для каждого пучка ----------
function tuftGeometry(rng) {
  const pos = [];
  const hgt = [];
  const idx = [];
  for (let b = 0; b < 5; b++) {
    const a = rng() * Math.PI * 2;
    const ox = Math.cos(a) * (b ? 0.8 : 0);
    const oz = Math.sin(a) * (b ? 0.8 : 0);
    const dir = rng() * Math.PI * 2;
    const dx = Math.cos(dir);
    const dz = Math.sin(dir);
    const h = 0.7 + rng() * 0.3;
    const base = pos.length / 3;
    const levels = [[0.5, 0], [0.42, 0.38], [0.26, 0.74], [0, 1]];
    levels.forEach(([w, t]) => {
      if (w > 0) {
        pos.push(ox - dx * w, t * h, oz - dz * w, ox + dx * w, t * h, oz + dz * w);
        hgt.push(t, t);
      } else {
        pos.push(ox, t * h, oz);
        hgt.push(t);
      }
    });
    for (let i = 0; i < 2; i++) {
      const v = base + i * 2;
      idx.push(v, v + 1, v + 3, v, v + 3, v + 2);
    }
    idx.push(base + 4, base + 5, base + 6);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new T.Float32BufferAttribute(hgt, 1));
  g.setIndex(idx);
  return g;
}

function makeGrass(count, look, light, fog, rng, spot) {
  const tuft = tuftGeometry(rng);
  const g = new T.InstancedBufferGeometry();
  g.index = tuft.index;
  g.setAttribute('position', tuft.attributes.position);
  g.setAttribute('aT', tuft.attributes.aT);
  const pos = new Float32Array(count * 3);
  const par = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    let x;
    let z;
    do {
      x = -1000 + rng() * 3700;
      z = -360 + Math.pow(rng(), 0.78) * 860;
    } while (spot && !spot(x, z, rng));
    pos[i * 3] = x;
    pos[i * 3 + 1] = 0;
    pos[i * 3 + 2] = z;
    // У плоскости игры трава короткая, чтобы не прятать героев и основания построек
    const low = smooth(Math.abs(z - 8), 46, 170);
    par[i * 4] = 2.5 + rng() * 3 + (z > 120 ? 2 : 0);
    par[i * 4 + 1] = look.tall * (0.46 + low * 0.74) * (0.72 + rng() * 0.62);
    par[i * 4 + 2] = rng() * Math.PI * 2;
    par[i * 4 + 3] = (0.66 + rng() * 0.46 + (fbm3(x * 0.012, 2.2, z * 0.012, 2) - 0.5) * 0.7) * (1 - smooth(z, 110, 380) * 0.36);
  }
  g.setAttribute('iPos', new T.InstancedBufferAttribute(pos, 3));
  g.setAttribute('iPar', new T.InstancedBufferAttribute(par, 4));
  g.instanceCount = count;
  const m = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: {
      uRoot: { value: new T.Color(look.blade[2]) }, uTip: { value: new T.Color(look.blade[0]) }, uMid: { value: new T.Color(look.blade[1]) },
      uTime: { value: 0 }, uSunCol: light.sunColor, uSky: light.sky, uGnd: light.ground, uBoost: { value: look.bladeGlow || 0 },
      uShadow: light.shadowMap, uShadowM: light.shadowMatrix, uHasShadow: light.hasShadow, uShadowTexel: light.shadowTexel,
      uFogColor: fog.color, uFogNear: fog.near, uFogFar: fog.far
    },
    vertexShader: `
      #include <packing>
      attribute vec3 iPos; attribute vec4 iPar; attribute float aT;
      uniform float uTime; uniform sampler2D uShadow; uniform mat4 uShadowM; uniform float uHasShadow; uniform float uShadowTexel;
      varying float vY; varying float vTone; varying float vShade; varying float vFogDepth;
      float tap(vec2 uv, float z){ return step(z, unpackRGBAToDepth(texture2D(uShadow, uv))); }
      void main(){
        float c = cos(iPar.z); float s = sin(iPar.z);
        vec3 q = vec3(position.x * iPar.x, position.y * iPar.y, position.z * iPar.x);
        q = vec3(q.x * c - q.z * s, q.y, q.x * s + q.z * c);
        float y = aT;
        vec2 wind = vec2(sin(uTime * 1.7 + iPos.x * 0.02 + iPos.z * 0.03), cos(uTime * 1.3 + iPos.x * 0.03)) * 0.42;
        q.xz += (wind + vec2(c, s) * 0.5) * iPar.y * 0.42 * y * y;
        vY = y; vTone = iPar.w;
        vShade = 1.0;
        if (uHasShadow > 0.5) {
          vec4 sc = uShadowM * vec4(iPos.x, 2.0, iPos.z, 1.0);
          vec3 u = sc.xyz / sc.w;
          if (u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0 && u.z < 1.0) {
            float o = uShadowTexel * 2.0;
            float z = u.z - 0.002;
            vShade = (tap(u.xy + vec2(o, o), z) + tap(u.xy + vec2(-o, o), z) + tap(u.xy + vec2(o, -o), z) + tap(u.xy + vec2(-o, -o), z)) * 0.25;
          }
        }
        vec4 mv = viewMatrix * vec4(iPos + q, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uRoot; uniform vec3 uMid; uniform vec3 uTip; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGnd; uniform float uBoost;
      uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying float vY; varying float vTone; varying float vShade; varying float vFogDepth;
      void main(){
        vec3 c = vY < 0.45 ? mix(uRoot, uMid, vY / 0.45) : mix(uMid, uTip, (vY - 0.45) / 0.55);
        float ao = 0.42 + 0.58 * smoothstep(0.0, 0.7, vY);
        vec3 lit = c * vTone * ao * ((uSky + uGnd) * 0.5 + uSunCol * vShade * (0.72 + vY * 0.5));
        lit += uTip * uBoost * vY * vY;
        float f = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        gl_FragColor = vec4(mix(lit, uFogColor, f), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new T.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------- земля ----------
// Высота земли: у дороги ровно, дальше холмы, ещё дальше подъём к горам
function groundHeight(x, z, look) {
  if (z > 0) return 0;
  const rise = smooth(-z, 170, 1200);
  if (rise <= 0) return 0;
  const n = fbm3(x * 0.00085 + look.amp, 3.1, z * 0.00115, 2);
  const big = smooth(n, 0.3, 0.72);
  return rise * look.amp * (big * 1.5 - 0.22) + smooth(-z, 2000, 6500) * look.amp * 0.9;
}

function terrain(B, look, tex) {
  const cx = 640;
  const xs = [];
  for (let i = -132; i <= 132; i++) xs.push(i * 36);
  const zs = [760, 560, 420, 320, 250, 190, 140, 90, 40, 0, -40, -90, -140, -190, -240, -300, -370, -450, -550, -680, -830, -1000, -1200, -1450, -1750, -2100, -2300, -2500, -2750, -3000, -3300, -3600, -3950, -4300, -4700, -5100, -5500, -6000, -6700, -7500];
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const col = new Float32Array(nx * nz * 3);
  const near = new T.Color(look.ground[0]);
  const lightPatch = new T.Color(look.ground[1]);
  const deep = new T.Color(look.ground[2]);
  const hill0 = new T.Color(look.hills[0]);
  const hill1 = new T.Color(look.hills[1]);
  const c = new T.Color();
  const tint = new T.Color();
  for (let j = 0; j < nz; j++) {
    const z = zs[j];
    const spread = 1 + Math.max(0, -z) / 1500;
    for (let i = 0; i < nx; i++) {
      const x = cx + xs[i] * spread;
      const y = groundHeight(x, z, look);
      const idx = (j * nx + i) * 3;
      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 2] = z;
      uv[(j * nx + i) * 2] = x / 190;
      uv[(j * nx + i) * 2 + 1] = z / 190;
      const patch = fbm3((x * 0.005) / (spread * spread), 1.7, (z * 0.007) / (spread * spread), 2);
      c.copy(near).lerp(lightPatch, smooth(patch, 0.46, 0.66)).lerp(deep, smooth(patch, 0.46, 0.28));
      const far = smooth(-z, 300, 1500);
      if (far > 0) {
        tint.copy(hill0).lerp(hill1, smooth(patch + fbm3(x * 0.0012, 5.5, z * 0.0012, 2) - 0.5, 0.3, 0.7));
        c.lerp(tint, far);
      }
      col[idx] = c.r;
      col[idx + 1] = c.g;
      col[idx + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const d = a + nx;
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const map = tex[look.floor];
  const m = new T.Mesh(g, new T.MeshStandardMaterial({
    vertexColors: true, map, normalMap: tex[look.floor + '_n'], normalScale: new T.Vector2(0.8, 0.8), roughness: 0.97, envMapIntensity: 0.2
  }));
  m.receiveShadow = true;
  m.frustumCulled = false;
  if (look.lavaCracks) {
    const uTime = { value: 0 };
    m.userData.anim = { uniforms: { uTime } };
    m.material.onBeforeCompile = (s) => {
      s.uniforms.uTime = uTime;
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float seam = 1.0 - smoothstep(0.07, 0.18, sampledDiffuseColor.r);
          vec2 lc = vMapUv * 0.09;
          float mask = smoothstep(0.1, 0.75, sin(lc.x * 3.1 + sin(lc.y * 2.3)) * sin(lc.y * 2.7 + sin(lc.x * 1.7)) + 0.3);
          float pulse = 0.75 + 0.25 * sin(uTime * 1.6 + lc.x * 9.0 + lc.y * 7.0);
          float near = 1.0 - smoothstep(0.012, 0.05, fwidth(vMapUv.x) + fwidth(vMapUv.y));
          totalEmissiveRadiance += vec3(2.1, 0.5, 0.06) * seam * mask * pulse * near;`);
    };
  }
  return m;
}

// Горная гряда вдали: острые хребты, снег только на вершинах
function ridge(z, amp, seed, tint, snow) {
  const g = new T.PlaneGeometry(17000, 2600, 340, 14);
  g.rotateX(-Math.PI / 2);
  g.translate(640, 0, z);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const zz = pos.getZ(i);
    const bell = Math.exp(-Math.pow((zz - z) / 760, 2));
    const envelope = 0.28 + 0.72 * smooth(fbm3(x * 0.0005 + seed, seed, 1.3, 2), 0.32, 0.68);
    const crest = 1 - Math.abs(fbm3(x * 0.0011 + seed, (zz - z) * 0.0013, seed + 2, 5) * 2 - 1);
    pos.setY(i, Math.pow(crest, 1.7) * envelope * amp * bell * 1.25 - 30);
  }
  g.computeVertexNormals();
  const c1 = new T.Color(tint[0]);
  const c2 = new T.Color(tint[1]);
  const s = snow ? new T.Color(snow) : null;
  const painted = paint(g, (c, x, y, zz, nx1, ny) => {
    const k = y / amp;
    c.copy(c2).lerp(c1, smooth(k, 0.05, 0.5));
    if (s) c.lerp(s, smooth(k + (ny - 0.62) * 0.34 + (fbm3(x * 0.006, y * 0.006, zz * 0.006, 2) - 0.5) * 0.3, 0.54, 0.7));
  });
  const m = new T.Mesh(painted, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.15 }));
  m.frustumCulled = false;
  return m;
}

// Облака: мягкие спрайты, плывут и заворачиваются по кругу
function makeClouds(atlas, B, list, fog) {
  const quad = new T.PlaneGeometry(1, 1);
  const g = new T.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const pos = new Float32Array(list.length * 3);
  const par = new Float32Array(list.length * 4);
  list.forEach((c, i) => {
    pos.set([c.x, c.y, c.z], i * 3);
    par.set([c.w, c.h, c.tile, c.speed], i * 4);
  });
  g.setAttribute('iPos', new T.InstancedBufferAttribute(pos, 3));
  g.setAttribute('iPar', new T.InstancedBufferAttribute(par, 4));
  g.instanceCount = list.length;
  const m = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTex: { value: atlas }, uLight: { value: new T.Color(B.cloud) }, uShade: { value: new T.Color(B.cloudShade) }, uTime: { value: 0 }, uFog: fog.color },
    vertexShader: `
      attribute vec3 iPos; attribute vec4 iPar; uniform float uTime; varying vec2 vUv; varying float vDepth;
      void main(){
        float span = 26000.0;
        float x = mod(iPos.x + uTime * iPar.w + span * 0.5 - 640.0, span) - span * 0.5 + 640.0;
        vec3 p = vec3(x + position.x * iPar.x, iPos.y + position.y * iPar.y, iPos.z);
        float tile = floor(iPar.z + 0.5);
        vUv = vec2((mod(tile, 2.0) + uv.x) * 0.5, 1.0 - (floor(tile / 2.0) + 1.0 - uv.y) * 0.5);
        vDepth = smoothstep(-5000.0, -16000.0, iPos.z);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uLight; uniform vec3 uShade; uniform vec3 uFog; varying vec2 vUv; varying float vDepth;
      void main(){
        vec4 t = texture2D(uTex, vUv);
        if (t.a < 0.01) discard;
        vec3 c = mix(uShade, uLight, t.r) * 1.25;
        c = mix(c, uFog, vDepth * 0.42);
        gl_FragColor = vec4(c, t.a);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new T.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return mesh;
}

// ---------- деревья и камни ----------
function barkPaint(bark) {
  const a = new T.Color(bark[0]);
  const b = new T.Color(bark[1]);
  return (c, x, y, z) => c.copy(b).lerp(a, smooth(fbm3(x * 0.09, y * 0.02, z * 0.09, 2), 0.3, 0.68));
}

function tree(f, solids, x, gy, z, size, palette, bark, rng, opts = {}) {
  const h = size * (1.2 + rng() * 0.32);
  const lean = (rng() - 0.5) * size * 0.3;
  const paintBark = barkPaint(bark);
  const trunk = tube([[x, gy - 14, z], [x + lean * 0.14, gy + h * 0.42, z], [x + lean, gy + h * 0.94, z]], (t) => size * (0.125 - t * 0.075) + Math.exp(-t * 14) * size * 0.1, 9, 9);
  solids.push(paint(trunk, paintBark));
  const crowns = [];
  const lobes = opts.lobes || 6;
  crowns.push([x + lean, gy + h + size * 0.14, z, size * 0.62]);
  for (let i = 1; i < lobes; i++) {
    const a = (i / (lobes - 1)) * Math.PI * 2 + rng();
    const r = size * (0.44 + rng() * 0.18);
    crowns.push([x + lean + Math.cos(a) * r, gy + h + (rng() - 0.45) * size * 0.36, z + Math.sin(a) * r * 0.72, size * (0.38 + rng() * 0.16)]);
  }
  for (const [cx, cy, cz] of crowns.slice(1, 4)) {
    const b = tube([[x + lean * 0.5, gy + h * 0.6, z], [(x + lean * 0.5 + cx) / 2, (gy + h * 0.6 + cy) / 2 + size * 0.05, (z + cz) / 2], [cx, cy, cz]], (t) => size * (0.052 - t * 0.032), 4, 6);
    solids.push(paint(b, paintBark));
  }
  // Тёмная сердцевина: сквозь крону не видно неба
  const core = new T.Color(palette[0]).multiplyScalar(0.42);
  for (const [cx, cy, cz, R] of crowns) {
    solids.push(paint(blob(1, 1, 0.16, rng() * 50), core, place(cx, cy, cz, R * 0.62, R * 0.58, R * 0.62)));
    f.lobe(cx, cy, cz, R, opts.count || 44, palette, rng, opts.tile || 0);
  }
}

function pine(f, solids, x, gy, z, size, green, snowy, bark, rng) {
  const h = size * 2.3;
  solids.push(paint(tube([[x, gy - 8, z], [x, gy + h * 0.5, z], [x, gy + h * 0.9, z]], (t) => size * (0.1 - t * 0.075), 3, 6), bark[0]));
  const core = new T.Color(green[0]).multiplyScalar(0.3);
  const cone = new T.ConeGeometry(size * 0.56, h * 0.78, 10, 1, true);
  solids.push(paint(cone, core, place(x, gy + h * 0.56, z)));
  const col = new T.Color();
  const white = new T.Color('#f4fbff');
  for (let t = 0; t < 8; t++) {
    const k = t / 7;
    const y = gy + h * (0.2 + k * 0.78);
    const R = size * (0.68 - k * 0.6);
    const count = Math.round(20 - k * 12);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng();
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      col.set(green[Math.floor(rng() * green.length)]);
      if (snowy) col.lerp(white, Math.min(0.92, 0.1 + k * 0.5 + rng() * rng() * 0.8));
      f.quad(x + dx * R, y - rng() * size * 0.08, z + dz * R * 0.8, size * (0.46 - k * 0.22), dx * 0.7, 0.62, dz * 0.7, col.r, col.g, col.b, 3, rng() * 6.28);
    }
  }
}

function far(solids, x, y, z, R, colors, rng) {
  const a = new T.Color(colors[0]);
  const b = new T.Color(colors[1]).multiplyScalar(0.72);
  const g = blob(1, 1, 0.3, rng() * 50);
  solids.push(paint(g, (c, px, py) => c.copy(b).lerp(a, py * 0.5 + 0.5), place(x, y, z, R, R * (0.8 + rng() * 0.3), R)));
}

function boulders(solids, x, y, z, R, c1, c2, rng) {
  const a = new T.Color(c1);
  const b = new T.Color(c2);
  const g = blob(1, 2, 0.5, rng() * 90);
  solids.push(paint(g, (c, px, py) => c.copy(b).lerp(a, py * 0.5 + 0.5), place(x, y, z, R, R * 0.72, R * 0.9, 0, rng() * 6, 0)));
}

function mesa(parts, x, gy, z, r, h, rng, palette) {
  const g = new T.CylinderGeometry(1, 1, h, 44, 40);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uvs = g.attributes.uv;
  const seed = rng() * 60;
  const steps = 5 + Math.floor(rng() * 4);
  const profile = [];
  for (let i = 0; i <= steps; i++) profile.push(0.62 + rng() * 0.38 - (i / steps) * 0.18);
  const around = (Math.PI * 2 * r) / 330;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const k = T.MathUtils.clamp(py / h + 0.5, 0, 1);
    const band = Math.min(steps - 1, Math.floor(k * steps));
    const f = k * steps - band;
    // Уступ: стена отвесная, у края слоя резкий переход
    const wall = profile[band] + (profile[band + 1] - profile[band]) * smooth(f, 0.84, 1);
    const n = 1 + (fbm3(px * 3.4 + seed, k * 1.4, pz * 3.4, 3) - 0.5) * 0.6;
    const a = Math.abs(nor.getY(i)) > 0.5 ? null : uvs.getX(i);
    pos.setXYZ(i, px * r * wall * n, py, pz * r * wall * n);
    if (a === null) uvs.setXY(i, px * r / 330, pz * r / 330);
    else uvs.setXY(i, a * Math.max(1, Math.round(around)), py / 330);
  }
  g.computeVertexNormals();
  const cols = palette.map((p) => new T.Color(p));
  parts.push(paint(g, (c, px, py, pz) => {
    const k = T.MathUtils.clamp(py / h + 0.5, 0, 1) * 9 + fbm3(px * 0.004 + seed, py * 0.001, pz * 0.004, 2) * 0.8;
    const band = Math.floor(k);
    c.copy(cols[band % cols.length]).lerp(cols[(band + 1) % cols.length], smooth(k - band, 0.8, 1));
  }, place(x, gy + h / 2 - 20, z)));
}

// Неоновые башни с окнами
function windowsTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const rng = seededRandom(11);
  const hues = ['#ff5ad9', '#36e8ff', '#ffe36b', '#ffffff', '#a07bff'];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 12; x++) {
      if (rng() < 0.62) continue;
      g.fillStyle = hues[Math.floor(rng() * hues.length)];
      g.globalAlpha = 0.5 + rng() * 0.5;
      g.fillRect(x * 21.3 + 4, y * 16 + 4, 12, 8);
    }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Сборка мира по его характеру
export function buildWorld(biome, tex, light, fog, shared, quality) {
  const B = BIOMES[biome];
  const look = LOOKS[B.id];
  const rng = seededRandom(hashStr(B.id) + 3);
  const group = new T.Group();
  const land = terrain(B, look, tex);
  group.add(land);
  look.ridges.forEach((r) => group.add(ridge(r.z, r.amp, r.seed, r.tint, r.snow)));
  const f = new Foliage();
  const solids = [];
  const glow = [];
  const animated = [];
  const spin = [];
  if (land.userData.anim) animated.push(land.userData.anim);
  const H = (x, z) => groundHeight(x, z, look);
  const hx = (z) => 640 + (rng() - 0.5) * (5200 + -z * 1.9);

  if (B.id === 'meadow' || B.id === 'blossom') {
    const blossom = B.id === 'blossom';
    const count = quality > 1 ? 96 : 54;
    // Рощи: группами, а не сплошной стеной, между ними видно холмы
    const groves = blossom ? [[-260, -560], [620, -800], [1500, -560], [2300, -880], [-900, -920]] : [[-340, -600], [420, -860], [1420, -600], [2200, -920], [-980, -940]];
    for (const [gx, gz] of groves) {
      const n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const x = gx + (rng() - 0.5) * 420;
        const z = gz - rng() * 260;
        tree(f, solids, x, H(x, z), z, 96 + rng() * 84, look.crowns[Math.floor(rng() * look.crowns.length)], look.bark, rng, { count });
      }
    }
    // Деревья подальше: проще, но их много, и они стоят группами
    for (let i = 0; i < 16; i++) {
      const cx = -1500 + rng() * 4600;
      const cz = -1150 - rng() * 800;
      const n = 2 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const x = cx + (rng() - 0.5) * 300;
        const z = cz - rng() * 200;
        tree(f, solids, x, H(x, z), z, 60 + rng() * 54, look.crowns[Math.floor(rng() * look.crowns.length)], look.bark, rng, { count: 26, lobes: 4 });
      }
    }
    // Лес на дальних холмах: зелёные полосы из множества маленьких крон
    for (let i = 0; i < 26; i++) {
      const cz = -2100 - rng() * 2500;
      const cx = hx(cz);
      const n = 6 + Math.floor(rng() * 12);
      const palette = look.crowns[Math.floor(rng() * look.crowns.length)];
      for (let k = 0; k < n; k++) {
        const x = cx + (rng() - 0.5) * 900;
        const z = cz + (rng() - 0.5) * 360;
        const R = 34 + rng() * 26;
        const y = H(x, z) + R * 0.8;
        solids.push(paint(blob(1, 0, 0.1, rng() * 50), new T.Color(palette[0]).multiplyScalar(0.46), place(x, y, z, R * 0.5, R * 0.48, R * 0.5)));
        f.lobe(x, y, z, R, 11, palette, rng);
      }
    }
    // Кусты позади дороги
    for (let i = 0; i < 26; i++) {
      const z = -320 - rng() * 230;
      const x = -900 + rng() * 3500;
      const palette = look.crowns[Math.floor(rng() * look.crowns.length)];
      const R = 24 + rng() * 26;
      const y = H(x, z) + R * 0.5;
      solids.push(paint(blob(1, 1, 0.14, rng() * 50), new T.Color(palette[0]).multiplyScalar(0.36), place(x, y, z, R * 0.7, R * 0.62, R * 0.7)));
      f.lobe(x, y, z, R, 34, palette, rng);
    }
    for (let i = 0; i < 14; i++) {
      const x = -900 + rng() * 3400;
      const z = -230 - rng() * 500;
      boulders(solids, x, H(x, z) + 3, z, 12 + rng() * 22, '#a9aeb4', '#6a6f78', rng);
    }
    if (blossom) {
      pagoda(solids, 1290, H(1290, -1860), -1860, 1.7);
      torii(solids, -60, H(-60, -760), -760, 0.92);
      torii(solids, 1820, H(1820, -700), -700, 0.8);
      for (const [x, z] of [[-470, -270], [90, -300], [620, -280], [1230, -310], [1660, -270], [2240, -290]]) lantern(solids, x, H(x, z), z, 1);
    } else {
      windmill(solids, spin, 520, H(520, -1680), -1680, 1.02);
      cottage(solids, -260, H(-260, -1000), -1000, 0.9, 0.5, '#efe0c4', '#a4412d');
      cottage(solids, 1640, H(1640, -1120), -1120, 1.05, -0.4, '#e8d8bc', '#7a4a34');
      fence(solids, -900, 2700, -290, H, '#8a6844');
    }
  } else if (B.id === 'canyon') {
    const strata = ['#e39a58', '#c26a35', '#efb06c', '#a84f2a', '#8d3d22', '#f4c384', '#74301c'];
    const mesas = [];
    for (let i = 0; i < 15; i++) {
      const z = -1400 - rng() * 3300;
      const x = hx(z);
      mesa(mesas, x, H(x, z), z, 170 + rng() * 280, 240 + rng() * 520, rng, strata);
    }
    const mesaMesh = new T.Mesh(merge(mesas), new T.MeshStandardMaterial({ vertexColors: true, map: tex.strata, normalMap: tex.strata_n, normalScale: new T.Vector2(1.5, 1.5), roughness: 0.96, envMapIntensity: 0.25 }));
    mesaMesh.frustumCulled = false;
    group.add(mesaMesh);
    const green = '#4b8a4a';
    for (let i = 0; i < 26; i++) {
      const x = -900 + rng() * 3400;
      const z = -300 - rng() * 900;
      const s = 15 + rng() * 22;
      const y = H(x, z);
      const paintCactus = (c, px, py, pz, nx) => c.set(green).multiplyScalar(0.72 + Math.abs(Math.sin(nx * 9)) * 0.5);
      solids.push(paint(tube([[x, y - 4, z], [x, y + s * 2.5, z]], s * 0.27, 3, 10), paintCactus));
      solids.push(paint(tube([[x, y + s * 1.1, z], [x + s * 0.8, y + s * 1.25, z], [x + s * 0.9, y + s * 2.1, z]], s * 0.17, 6, 8), paintCactus));
      solids.push(paint(tube([[x, y + s * 1.5, z], [x - s * 0.7, y + s * 1.65, z], [x - s * 0.8, y + s * 2.3, z]], s * 0.15, 6, 8), paintCactus));
    }
    for (let i = 0; i < 40; i++) {
      const x = -900 + rng() * 3400;
      const z = -240 - rng() * 1300;
      boulders(solids, x, H(x, z) + 2, z, 10 + rng() * 46, '#d99458', '#8a4a26', rng);
    }
    waterTower(solids, 430, H(430, -1240), -1240, 0.9);
    trestle(solids, -700, 180, H(-200, -760), -760, 96);
    trestle(solids, 1300, 2300, H(1800, -880), -880, 120);
    for (const [x, z, s] of [[-430, -300, 1], [-402, -312, 0.9], [1440, -316, 1.1], [1470, -300, 0.95], [2050, -296, 1]]) barrel(solids, x, H(x, z), z, s);
  } else if (B.id === 'glacier') {
    const greens = look.crowns[0];
    for (let i = 0; i < 62; i++) {
      const z = -340 - Math.pow(rng(), 1.5) * 2500;
      const x = hx(z) * 0.6 + 256;
      pine(f, solids, x, H(x, z), z, 58 + rng() * 74, greens, true, look.bark, rng);
    }
    const ice = new T.Color('#a8dcf4');
    for (let i = 0; i < 20; i++) {
      const x = -900 + rng() * 3400;
      const z = -460 - rng() * 1500;
      const h = 100 + rng() * 290;
      const g = new T.ConeGeometry(h * (0.2 + rng() * 0.12), h, 6, 3);
      const gp = g.attributes.position;
      const gs = rng() * 40;
      for (let k = 0; k < gp.count; k++) {
        const n = 1 + (fbm3(gp.getX(k) * 0.02 + gs, gp.getY(k) * 0.02, gp.getZ(k) * 0.02, 1) - 0.5) * 0.5;
        gp.setXYZ(k, gp.getX(k) * n, gp.getY(k), gp.getZ(k) * n);
      }
      const facets = g.toNonIndexed();
      facets.computeVertexNormals();
      solids.push(paint(facets, (c, px, py) => c.copy(ice).multiplyScalar(0.6 + (py / h + 0.5) * 0.5), place(x, H(x, z) + h / 2 - 8, z, 1, 1, 1, 0, rng() * 6, (rng() - 0.5) * 0.2)));
    }
    for (let i = 0; i < 30; i++) {
      const x = -900 + rng() * 3400;
      const z = -270 - rng() * 800;
      far(solids, x, H(x, z), z, 34 + rng() * 62, ['#eef7ff', '#c4dcf2'], rng);
    }
    igloo(solids, -200, H(-200, -780), -780, 1.05);
    iceCastle(solids, 760, H(760, -2500), -2500, 1.05);
    snowman(solids, 540, H(540, -320), -320, 1.05);
    snowman(solids, 1730, H(1730, -340), -340, 0.92);
  } else if (B.id === 'neon') {
    // Город из светящихся окон
    const parts = [];
    for (let i = 0; i < 100; i++) {
      const z = -1500 - rng() * 3300;
      const x = hx(z);
      const w = 90 + rng() * 170;
      const h = 200 + rng() * rng() * 1050;
      const d = 90 + rng() * 170;
      const b = new T.BoxGeometry(w, h, d);
      b.translate(0, h / 2 - 40, 0);
      boxUV(b, 256, 256, false, rng(), rng());
      b.applyMatrix4(place(x, H(x, z), z));
      parts.push(b.toNonIndexed());
    }
    const city = new T.Mesh(merge(parts), new T.MeshStandardMaterial({ color: '#141044', emissive: '#ffffff', emissiveMap: shared.windows(), emissiveIntensity: 1.0, roughness: 0.6, metalness: 0.4 }));
    city.frustumCulled = false;
    group.add(city);
    // Неоновые арки и радиомачты
    neonArch(glow, solids, -240, H(-240, -640), -640, 150, '#36e8ff');
    neonArch(glow, solids, 540, H(540, -900), -900, 190, '#ff5ad9');
    neonArch(glow, solids, 1680, H(1680, -720), -720, 170, '#a07bff');
    radioTower(solids, glow, 150, H(150, -1320), -1320, 1);
    radioTower(solids, glow, 1980, H(1980, -1260), -1260, 1.2);
    // Светящиеся грибы
    const caps = [['#3dffc8', '#0f9a8a'], ['#36c8ff', '#1466c8'], ['#ff5ad9', '#a01a9a'], ['#a07bff', '#4a2ac8']];
    for (let i = 0; i < 30; i++) {
      const x = -900 + rng() * 3400;
      const z = -300 - rng() * rng() * 1300;
      const y = H(x, z);
      const s = 34 + rng() * 80;
      const [c1, c2] = caps[Math.floor(rng() * caps.length)];
      const stemH = s * (1.6 + rng() * 1.5);
      solids.push(paint(tube([[x, y - 6, z], [x + s * 0.1, y + stemH * 0.5, z], [x, y + stemH, z]], (t) => s * (0.2 - t * 0.08), 6, 8), '#8d94c9'));
      const cap = new T.SphereGeometry(s, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
      const a = new T.Color(c1).multiplyScalar(1.15);
      const b = new T.Color(c2).multiplyScalar(0.7);
      glow.push(paint(cap, (c, px, py) => c.copy(b).lerp(a, py / s), place(x, y + stemH - s * 0.1, z, 1, 0.68, 1)));
      for (let d = 0; d < 6; d++) {
        const an = rng() * 6.28;
        const rr = s * (0.35 + rng() * 0.45);
        const dot = new T.SphereGeometry(s * 0.09, 8, 6);
        const hh = Math.sqrt(Math.max(0, s * s - rr * rr)) * 0.68;
        glow.push(paint(dot, new T.Color(1.5, 1.5, 1.5), place(x + Math.cos(an) * rr, y + stemH - s * 0.1 + hh, z + Math.sin(an) * rr)));
      }
    }
  } else if (B.id === 'volcano') {
    // Большой вулкан с лавой
    const r = 1900;
    const h = 1120;
    const vz = -4600;
    const vx = 1120;
    const topR = 0.13;
    const bump = (a, y) => 1 + (fbm3(Math.cos(a) * 3 + 5, y * 0.0022, Math.sin(a) * 3 + 5, 4) - 0.5) * 0.34;
    const surface = (a, y) => {
      const k = y / h;
      const rr = r * (1 - k * (1 - topR)) * Math.pow(1 - k * 0.35, 1.0) * bump(a, y);
      return new T.Vector3(vx + Math.cos(a) * rr, y - 50, vz + Math.sin(a) * rr);
    };
    const cone = new T.CylinderGeometry(1, 1, 1, 72, 22, true);
    const cp = cone.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const a = Math.atan2(cp.getZ(i), cp.getX(i));
      const y = (cp.getY(i) + 0.5) * h;
      const v = surface(a, y);
      cp.setXYZ(i, v.x, v.y, v.z);
    }
    cone.computeVertexNormals();
    // Нормали смотрят наружу: цилиндр собран против часовой
    const rockA = new T.Color('#5c2238');
    const rockB = new T.Color('#1d0914');
    solids.push(paint(cone, (c, px, py, pz) => c.copy(rockA).lerp(rockB, smooth(fbm3(px * 0.004, py * 0.006, pz * 0.004, 4), 0.32, 0.66))));
    for (let i = 0; i < 6; i++) {
      const start = Math.PI * 0.5 + (i - 2.5) * 0.34;
      const pts = [];
      let a = start;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        a += (rng() - 0.5) * 0.09;
        pts.push(surface(a, h * (0.97 - t * (0.62 + (i % 3) * 0.12))));
      }
      const lava = tube(pts, (t) => 15 + t * 26, 40, 6);
      const hot = new T.Color(3.0, 1.15, 0.2);
      const warm = new T.Color(2.1, 0.36, 0.06);
      glow.push(paint(lava, (c, px, py) => c.copy(warm).lerp(hot, smooth(py, 200, h))));
    }
    const crater = new T.CircleGeometry(r * topR * 0.92, 28);
    crater.rotateX(-Math.PI / 2);
    glow.push(paint(crater, new T.Color(3.6, 1.5, 0.3), place(vx, h - 58, vz)));
    for (let i = 0; i < 44; i++) {
      const x = -1000 + rng() * 3600;
      const z = -360 - rng() * 2300;
      const s = 80 + rng() * 250;
      const g = new T.ConeGeometry(s * 0.36, s, 10, 8);
      const seed = rng() * 50;
      const gp = g.attributes.position;
      for (let k = 0; k < gp.count; k++) {
        const px = gp.getX(k);
        const py = gp.getY(k);
        const pz = gp.getZ(k);
        const n = 1 + (fbm3(px * 0.024 + seed, py * 0.012, pz * 0.024, 3) - 0.5) * 1.5;
        gp.setXYZ(k, px * n, py, pz * n);
      }
      g.computeVertexNormals();
      const dark = new T.Color('#1b0912');
      const lit = new T.Color('#4c1e2c');
      solids.push(paint(g.toNonIndexed(), (c, px, py, pz) => c.copy(dark).lerp(lit, (py / s + 0.5) * (0.4 + fbm3(px * 0.05, py * 0.05, pz * 0.05, 2))), place(x, H(x, z) + s / 2 - 12, z, 1, 1, 1, 0, rng() * 6, (rng() - 0.5) * 0.18)));
    }
    for (let i = 0; i < 18; i++) {
      const x = -900 + rng() * 3400;
      const z = -240 - rng() * 500;
      boulders(solids, x, H(x, z) + 2, z, 10 + rng() * 30, '#4a1a28', '#1a0810', rng);
    }
    botFort(solids, glow, 340, H(340, -2200), -2200, 0.86);
    // Скелет исполина лежит вдали от дороги
    for (let i = 0; i < 7; i++) {
      const x = 360 + i * 62;
      rib(solids, x, H(x, -700), -700, 0.86 - Math.abs(i - 3) * 0.08, 1);
      rib(solids, x, H(x, -780), -780, 0.86 - Math.abs(i - 3) * 0.08, -1);
    }
  }

  if (solids.length) {
    const m = new T.Mesh(merge(solids), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.3 }));
    m.frustumCulled = false;
    m.receiveShadow = true;
    group.add(m);
  }
  if (glow.length) {
    const m = new T.Mesh(merge(glow), new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    m.frustumCulled = false;
    group.add(m);
  }
  if (f.n) {
    const foliage = f.build(tex.leaves, light, fog);
    foliage.frustumCulled = false;
    group.add(foliage);
    animated.push(foliage.material);
  }
  const count = Math.round((quality > 1 ? 7600 : quality > 0 ? 4200 : 1800) * look.grass);
  const grass = makeGrass(count, look, light, fog, rng);
  grass.userData.full = count;
  group.add(grass);
  animated.push(grass.material);

  // Цветы, камешки и прочая мелочь вокруг дороги
  group.add(nearDecor(B, look, rng, quality));
  spin.forEach((s) => group.add(s.mesh));

  const clouds = [];
  const cloudCount = B.id === 'neon' ? 14 : B.id === 'volcano' ? 18 : 24;
  for (let i = 0; i < cloudCount; i++) {
    const z = -7000 - rng() * 9000;
    const scale = (-z + 2400) / 2400;
    clouds.push({ x: rng() * 26000 - 12000, y: 500 + (130 + rng() * 460) * scale, z, w: (190 + rng() * 240) * scale, h: (100 + rng() * 90) * scale, tile: Math.floor(rng() * 4), speed: 8 + rng() * 16 });
  }
  if (B.id === 'volcano') {
    // Столб дыма над кратером
    for (let i = 0; i < 12; i++) {
      clouds.push({ x: 1120 + (rng() - 0.3) * (240 + i * 90), y: 1300 + i * 200, z: -4610, w: 620 + i * 170, h: 420 + i * 100, tile: Math.floor(rng() * 4), speed: 0 });
    }
  }
  const cloudMesh = makeClouds(tex.clouds, B, clouds, fog);
  group.add(cloudMesh);
  animated.push(cloudMesh.material);

  return {
    group,
    look,
    grass,
    update(time) {
      for (const m of animated) m.uniforms.uTime.value = time;
      for (const s of spin) s.mesh.rotation.z = time * s.speed;
    }
  };
}

// ---------- постройки и декор на заднем плане ----------
const flat = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
};
const box = (w, h, d) => flat(new T.BoxGeometry(w, h, d));
const cyl = (a, b, h, n = 12) => new T.CylinderGeometry(a, b, h, n);
const cone = (r, h, n = 12) => new T.ConeGeometry(r, h, n);
// Двускатная крыша: треугольная призма
const gable = (w, h, d) => {
  const s = new T.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(w / 2, 0);
  s.closePath();
  const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return flat(g);
};

function windmill(parts, spin, x, y, z, s) {
  const add = (g, c, m) => parts.push(paint(g, c, m));
  add(cyl(40 * s, 62 * s, 230 * s), (c, px, py) => c.set('#efe5d2').multiplyScalar(0.8 + (py / (230 * s) + 0.5) * 0.3), place(x, y + 115 * s, z));
  add(cyl(66 * s, 68 * s, 12 * s), '#7a5433', place(x, y + 8 * s, z));
  add(cyl(44 * s, 45 * s, 8 * s), '#8a6240', place(x, y + 170 * s, z));
  add(cone(58 * s, 66 * s), '#b4452e', place(x, y + 262 * s, z));
  add(box(26 * s, 46 * s, 8 * s), '#5d3c20', place(x, y + 24 * s, z + 60 * s));
  add(box(20 * s, 22 * s, 6 * s), '#3a5a78', place(x, y + 130 * s, z + 48 * s));
  const blades = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const m = new T.Matrix4().makeRotationZ(a);
    const arm = paint(box(150 * s, 7 * s, 6 * s), '#6d4a2c', new T.Matrix4().makeTranslation(75 * s, 0, 0).premultiply(m));
    const sail = paint(box(116 * s, 34 * s, 2 * s), (c, px) => c.set(Math.abs(Math.sin(px * 0.2)) > 0.2 ? '#f2ebda' : '#c8b898'), new T.Matrix4().makeTranslation(92 * s, 20 * s, 0).premultiply(m));
    blades.push(arm, sail);
  }
  blades.push(paint(cyl(10 * s, 10 * s, 14 * s, 10), '#4d3320', new T.Matrix4().makeRotationX(Math.PI / 2)));
  const rotor = new T.Mesh(merge(blades), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  rotor.position.set(x, y + 214 * s, z + 54 * s);
  rotor.frustumCulled = false;
  spin.push({ mesh: rotor, speed: 0.45 });
}

function cottage(parts, x, y, z, s, ry, wall, roof) {
  const m = (px, py, pz, r = 0) => new T.Matrix4().compose(new T.Vector3(px, py, pz), new T.Quaternion().setFromEuler(new T.Euler(0, ry + r, 0)), new T.Vector3(1, 1, 1));
  const at = (dx, dy, dz) => {
    const c = Math.cos(ry);
    const n = Math.sin(ry);
    return [x + dx * c + dz * n, y + dy, z - dx * n + dz * c];
  };
  parts.push(paint(box(140 * s, 78 * s, 104 * s), wall, m(...at(0, 39 * s, 0))));
  parts.push(paint(gable(160 * s, 62 * s, 120 * s), roof, m(...at(0, 78 * s, 0))));
  parts.push(paint(box(22 * s, 60 * s, 22 * s), '#7d6f66', m(...at(40 * s, 120 * s, -14 * s))));
  parts.push(paint(box(26 * s, 46 * s, 4 * s), '#5d3c20', m(...at(-30 * s, 23 * s, 53 * s))));
  parts.push(paint(box(30 * s, 28 * s, 4 * s), '#ffe9a8', m(...at(32 * s, 46 * s, 53 * s))));
  parts.push(paint(box(34 * s, 4 * s, 5 * s), '#5d3c20', m(...at(32 * s, 46 * s, 54 * s))));
  parts.push(paint(box(4 * s, 32 * s, 5 * s), '#5d3c20', m(...at(32 * s, 46 * s, 54 * s))));
}

function fence(parts, x0, x1, z, H, color) {
  for (let x = x0; x < x1; x += 180 + (x % 7) * 10) {
    const y = H(x, z);
    for (let i = 0; i < 4; i++) parts.push(paint(box(5, 34, 5), color, place(x + i * 40, y + 15, z, 1, 1, 1, 0, 0, (i - 1.5) * 0.02)));
    for (const h of [11, 25]) parts.push(paint(box(130, 4.5, 3), color, place(x + 60, y + h, z + 3.4, 1, 1, 1, 0, 0, (x % 5) * 0.004)));
  }
}

function pagoda(parts, x, y, z, s) {
  let at = y;
  let R = 74 * s;
  parts.push(paint(cyl(R * 1.5, R * 1.62, 16 * s, 8), '#a29c94', place(x, at + 8 * s, z)));
  at += 16 * s;
  for (let i = 0; i < 3; i++) {
    const hgt = (62 - i * 8) * s;
    parts.push(paint(cyl(R * 0.8, R * 0.84, hgt, 16), '#efe3cd', place(x, at + hgt / 2, z)));
    // Красные колонны по кругу
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.39;
      parts.push(paint(cyl(5.4 * s, 5.8 * s, hgt, 8), '#b8372c', place(x + Math.cos(a) * R * 0.86, at + hgt / 2, z + Math.sin(a) * R * 0.86)));
    }
    // Крыша с загнутыми вверх краями
    const roof = new T.ConeGeometry(R * 1.6, 42 * s, 8, 4);
    const rp = roof.attributes.position;
    for (let k = 0; k < rp.count; k++) {
      const rr = Math.hypot(rp.getX(k), rp.getZ(k)) / (R * 1.6);
      rp.setY(k, rp.getY(k) + rr * rr * rr * 24 * s);
    }
    parts.push(paint(flat(roof), (c, px, py) => c.set('#34415c').multiplyScalar(0.85 + py * 0.012 / s), place(x, at + hgt + 18 * s, z)));
    at += hgt + 26 * s;
    R *= 0.78;
  }
  parts.push(paint(cyl(2.4 * s, 4.6 * s, 58 * s, 6), '#d9b13f', place(x, at + 24 * s, z)));
  for (let i = 0; i < 3; i++) parts.push(paint(new T.SphereGeometry(7 * s - i * 1.6 * s, 8, 6), '#d9b13f', place(x, at + (10 + i * 15) * s, z)));
}

function torii(parts, x, y, z, s) {
  const red = '#c9402e';
  for (const d of [-1, 1]) parts.push(paint(cyl(9 * s, 11 * s, 170 * s, 12), red, place(x + d * 70 * s, y + 85 * s, z)));
  parts.push(paint(box(214 * s, 14 * s, 18 * s), '#2c2333', place(x, y + 178 * s, z)));
  parts.push(paint(box(190 * s, 11 * s, 14 * s), red, place(x, y + 150 * s, z)));
}

function lantern(parts, x, y, z, s) {
  const stone = '#a29c94';
  parts.push(paint(cyl(9 * s, 12 * s, 6 * s, 8), stone, place(x, y + 3 * s, z)));
  parts.push(paint(cyl(4 * s, 5 * s, 22 * s, 8), stone, place(x, y + 17 * s, z)));
  parts.push(paint(cyl(9 * s, 9 * s, 10 * s, 6), '#ffd98a', place(x, y + 33 * s, z)));
  parts.push(paint(cone(15 * s, 11 * s, 6), '#8d877f', place(x, y + 44 * s, z)));
}

function waterTower(parts, x, y, z, s) {
  const wood = '#7d5a39';
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    parts.push(paint(cyl(5 * s, 7 * s, 170 * s, 6), wood, place(x + dx * 44 * s, y + 85 * s, z + dz * 44 * s, 1, 1, 1, dz * 0.08, 0, -dx * 0.08)));
  }
  for (const h of [50, 110]) {
    parts.push(paint(box(100 * s, 5 * s, 5 * s), wood, place(x, y + h * s, z + 40 * s, 1, 1, 1, 0, 0, 0.4)));
    parts.push(paint(box(100 * s, 5 * s, 5 * s), wood, place(x, y + h * s, z + 40 * s, 1, 1, 1, 0, 0, -0.4)));
  }
  parts.push(paint(cyl(62 * s, 62 * s, 90 * s, 18), (c, px, py, pz) => c.set('#8b6742').multiplyScalar(0.72 + Math.abs(Math.sin(Math.atan2(pz, px) * 18)) * 0.36), place(x, y + 215 * s, z)));
  parts.push(paint(cone(70 * s, 40 * s, 18), '#5c3f2a', place(x, y + 280 * s, z)));
}

function trestle(parts, x0, x1, y, z, h) {
  const wood = '#6e4c2f';
  parts.push(paint(box(x1 - x0, 7, 22), wood, place((x0 + x1) / 2, y + h, z)));
  for (const side of [-8, 8]) parts.push(paint(box(x1 - x0, 4, 3), '#9a9aa4', place((x0 + x1) / 2, y + h + 5, z + side)));
  for (let x = x0; x <= x1; x += 80) {
    parts.push(paint(box(5, h, 5), wood, place(x - 12, y + h / 2, z, 1, 1, 1, 0, 0, -0.1)));
    parts.push(paint(box(5, h, 5), wood, place(x + 12, y + h / 2, z, 1, 1, 1, 0, 0, 0.1)));
    if (x < x1) parts.push(paint(box(96, 4, 4), wood, place(x + 40, y + h * 0.55, z, 1, 1, 1, 0, 0, 0.42)));
  }
}

function barrel(parts, x, y, z, s) {
  parts.push(paint(cyl(13 * s, 13 * s, 34 * s, 12), (c, px, py) => c.set(Math.abs(py) > 11 * s && Math.abs(py) < 14 * s ? '#46484e' : '#8a5f38'), place(x, y + 17 * s, z)));
}

function igloo(parts, x, y, z, s) {
  const dome = new T.SphereGeometry(92 * s, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(paint(flat(dome), (c, px, py, pz) => {
    const row = Math.abs(Math.sin(py * 0.26 / s));
    c.set('#dcecf8').multiplyScalar(row < 0.14 ? 0.74 : 1);
  }, place(x, y, z)));
  const door = new T.CylinderGeometry(34 * s, 34 * s, 52 * s, 12, 1, false, -Math.PI / 2, Math.PI);
  parts.push(paint(flat(door), '#d4e6f6', place(x + 26 * s, y, z + 88 * s, 1, 1, 1, Math.PI / 2, 0, 0)));
  parts.push(paint(cyl(22 * s, 22 * s, 4 * s, 14), '#253a5c', place(x + 26 * s, y + 14 * s, z + 115 * s, 1, 1, 1, Math.PI / 2, 0, 0)));
}

function iceCastle(parts, x, y, z, s) {
  const col = (c, px, py) => c.set('#a9daf2').multiplyScalar(0.72 + Math.min(0.5, py * 0.0016 / s));
  for (const [dx, h, r] of [[-170, 300, 44], [-70, 420, 56], [50, 340, 48], [170, 250, 38]]) {
    parts.push(paint(flat(cyl(r * 0.84 * s, r * s, h * s, 8)), col, place(x + dx * s, y + (h / 2) * s, z)));
    parts.push(paint(flat(cone(r * 1.2 * s, r * 2.4 * s, 8)), '#dff4ff', place(x + dx * s, y + (h + r * 1.2) * s, z)));
  }
  parts.push(paint(flat(box(320 * s, 150 * s, 50 * s)), col, place(x, y + 75 * s, z + 14 * s)));
  parts.push(paint(flat(cyl(34 * s, 34 * s, 12 * s, 12)), '#4f7fa8', place(x, y + 42 * s, z + 40 * s, 1, 1, 1, Math.PI / 2, 0, 0)));
}

function snowman(parts, x, y, z, s) {
  parts.push(paint(blob(1, 2, 0.05, 3), '#f4f9ff', place(x, y + 22 * s, z, 26 * s)));
  parts.push(paint(blob(1, 2, 0.05, 5), '#f4f9ff', place(x, y + 56 * s, z, 19 * s)));
  parts.push(paint(blob(1, 2, 0.04, 7), '#f4f9ff', place(x, y + 83 * s, z, 14 * s)));
  parts.push(paint(cone(3.2 * s, 18 * s, 8), '#ff8a2a', place(x + 4 * s, y + 84 * s, z + 18 * s, 1, 1, 1, Math.PI / 2, 0, 0)));
  for (const d of [-1, 1]) parts.push(paint(new T.SphereGeometry(2.2 * s, 8, 6), '#1c1c26', place(x + d * 5 * s, y + 90 * s, z + 12 * s)));
  parts.push(paint(cyl(10 * s, 10 * s, 15 * s), '#2a2a38', place(x, y + 101 * s, z)));
  parts.push(paint(cyl(16 * s, 16 * s, 2.4 * s), '#2a2a38', place(x, y + 94 * s, z)));
}

function neonArch(glow, solids, x, y, z, r, hex) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    pts.push(new T.Vector3(x + Math.cos(a) * r, y + Math.sin(a) * r * 1.2, z));
  }
  solids.push(paint(tube(pts, 9, 40, 6), '#262a58'));
  const col = new T.Color(hex).multiplyScalar(1.5);
  const inner = pts.map((p) => new T.Vector3(p.x, p.y, p.z + 8));
  glow.push(paint(tube(inner, 3.2, 40, 5), col));
}

function radioTower(solids, glow, x, y, z, s) {
  const metal = '#3a3e72';
  const h = 620 * s;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    solids.push(paint(tube([[x + dx * 40 * s, y, z + dz * 40 * s], [x, y + h, z]], 3 * s, 2, 4), metal));
  }
  for (let i = 1; i < 8; i++) {
    const k = i / 8;
    const r = 40 * s * (1 - k);
    solids.push(paint(box(r * 2.2, 3 * s, 3 * s), metal, place(x, y + h * k, z + r)));
    solids.push(paint(box(r * 2.2, 3 * s, 3 * s), metal, place(x, y + h * k, z - r)));
  }
  glow.push(paint(new T.SphereGeometry(9 * s, 10, 8), new T.Color(3, 0.35, 0.5), place(x, y + h, z)));
  glow.push(paint(new T.SphereGeometry(6 * s, 8, 6), new T.Color(2.4, 0.3, 0.4), place(x, y + h * 0.66, z)));
}

function botFort(parts, glow, x, y, z, s) {
  const rock = (c, px, py) => c.set('#2c1a26').multiplyScalar(0.8 + Math.abs(Math.sin(py * 0.09)) * 0.4);
  for (const [dx, h, r] of [[-190, 360, 50], [-60, 500, 62], [90, 420, 54], [210, 300, 42]]) {
    parts.push(paint(flat(cyl(r * 0.8 * s, r * s, h * s, 8)), rock, place(x + dx * s, y + (h / 2) * s, z)));
    parts.push(paint(flat(cone(r * 1.05 * s, r * 1.7 * s, 8)), '#3c1a24', place(x + dx * s, y + (h + r * 0.85) * s, z)));
    for (let i = 0; i < 3; i++) glow.push(paint(new T.BoxGeometry(10 * s, 18 * s, 2), new T.Color(3, 0.5, 0.12), place(x + (dx + (i - 1) * 18) * s, y + (h * (0.5 + i * 0.14)) * s, z + r * 0.86 * s)));
  }
  parts.push(paint(flat(box(420 * s, 170 * s, 46 * s)), rock, place(x, y + 85 * s, z + 8 * s)));
}

function rib(parts, x, y, z, s, side) {
  parts.push(paint(tube([[x, y - 8, z], [x + side * 30 * s, y + 90 * s, z], [x + side * 10 * s, y + 180 * s, z], [x - side * 40 * s, y + 230 * s, z]], (t) => 16 * s * (1 - t) + 2, 12, 8), (c, px, py) => c.set('#7a6a5e').multiplyScalar(0.6 + Math.min(0.5, (py - y) * 0.002))));
}

// Цветок: стебель и пять лепестков вокруг серединки
function flowerGeometry() {
  const parts = [];
  const petal = new T.SphereGeometry(0.42, 7, 5);
  petal.scale(1, 0.26, 0.62);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const g = petal.clone();
    g.translate(0.5, 0, 0);
    g.rotateY(a);
    g.rotateX(0.5);
    g.translate(0, 2.6, 0);
    parts.push(g.toNonIndexed());
  }
  const out = merge(parts.map((g) => {
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal'].includes(n)) g.deleteAttribute(n);
    return g;
  }));
  return out;
}

function nearDecor(B, look, rng, quality) {
  const n = quality > 0 ? 1 : 0.5;
  const dummy = new T.Object3D();
  const scatter = (geo, mat, count, sizeMin, sizeMax, colors, yBase, zFrom = -340, zTo = 320, shadow = true) => {
    const m = new T.InstancedMesh(geo, mat, Math.round(count * n));
    const c = new T.Color();
    for (let i = 0; i < m.count; i++) {
      const s = sizeMin + rng() * (sizeMax - sizeMin);
      dummy.position.set(-1000 + rng() * 3700, yBase * s, zFrom + rng() * (zTo - zFrom));
      dummy.rotation.set((rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.3);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, c.set(colors[Math.floor(rng() * colors.length)]));
    }
    m.frustumCulled = false;
    m.receiveShadow = shadow;
    return m;
  };
  const g = new T.Group();
  const rock = new T.IcosahedronGeometry(1, 1);
  if (B.id === 'meadow' || B.id === 'blossom') {
    const flowers = scatter(flowerGeometry(), new T.MeshStandardMaterial({ roughness: 0.7 }), 170, 3.2, 5.8, B.id === 'meadow' ? ['#f4f1e4', '#f0c23a', '#e8689f', '#d84f4f', '#8f6ee0'] : ['#f6f2ec', '#f7c6dc', '#ec82b6', '#f0d264'], 0);
    g.add(flowers);
    g.add(scatter(rock, new T.MeshStandardMaterial({ roughness: 0.92, color: '#9fa4ab' }), 46, 3, 14, ['#ffffff', '#d5d8dc', '#b8bcc4'], 0.25));
  } else if (B.id === 'canyon') {
    g.add(scatter(rock, new T.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), 150, 3, 15, ['#d99458', '#bb7339', '#9c5628'], 0.3));
  } else if (B.id === 'glacier') {
    const shard = new T.ConeGeometry(1, 3.4, 5);
    g.add(scatter(shard, new T.MeshStandardMaterial({ roughness: 0.12, metalness: 0.1, emissive: '#55c0e8', emissiveIntensity: 0.16 }), 110, 2, 7, ['#d0f2fb', '#9fdcf2', '#f0fbff'], 1.2));
    g.add(scatter(new T.IcosahedronGeometry(1, 2), new T.MeshStandardMaterial({ roughness: 0.95, color: '#eaf3fb' }), 46, 8, 26, ['#ffffff', '#e4eef8'], 0.05));
  } else if (B.id === 'neon') {
    const cap = new T.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    g.add(scatter(cap, new T.MeshBasicMaterial({ toneMapped: false }), 150, 2.6, 7, ['#3dffc8', '#36c8ff', '#ff5ad9', '#ffe36b'], 0.9, -340, 320, false));
    g.add(scatter(rock, new T.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3, flatShading: true }), 60, 4, 14, ['#3a3f7a', '#2a2c60'], 0.3));
  } else {
    g.add(scatter(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 130, 3, 15, ['#4a2a32', '#301820', '#5c3238'], 0.3));
    g.add(scatter(new T.IcosahedronGeometry(1, 0), new T.MeshBasicMaterial({ toneMapped: false }), 40, 1.2, 3, ['#ffb02e', '#ff6a1f'], 0.3, -340, 320, false));
  }
  return g;
}

export { windowsTexture };
