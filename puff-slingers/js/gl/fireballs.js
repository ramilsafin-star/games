// Взрывы: объёмные клубы огня и дыма. Каждый клуб — шар с буграми из объёмного шума.
// Он непрозрачный, поэтому не мутит кадр, а исчезает рваными дырами
import * as T from '../../vendor/three/three.module.min.js';
import { mergeVertices } from '../../vendor/three/BufferGeometryUtils.js';

const CAPACITY = 72;
const FIRE = 0;
const SMOKE = 1;

const VERT = `
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
  vec3 world = iPos + p0 * iInfo.x;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const FRAG = `
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
  vec3 c = mix(vec3(0.16, 0.012, 0.008), vec3(0.8, 0.09, 0.008), smoothstep(0.04, 0.3, h));
  c = mix(c, vec3(1.25, 0.34, 0.02), smoothstep(0.3, 0.5, h));
  c = mix(c, vec3(1.45, 0.66, 0.08), smoothstep(0.52, 0.74, h));
  return mix(c, vec3(1.75, 1.2, 0.5), smoothstep(0.84, 1.04, h));
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = max(dot(N, V), 0.0);
  float top = N.y * 0.5 + 0.5;
  float torn = texture(uNoise, vObj * 0.42 + vec3(vSeed * 2.3, vSeed * 4.1, vAge * 0.12)).r;
  float lump = clamp((vLump - 0.3) / 0.4, 0.0, 1.0);
  vec3 col;
  if (vKind < 0.5) {
    float burn = smoothstep(0.52, 1.0, vAge) * 0.98;
    if (torn < burn) discard;
    float heat = (1.0 - pow(vAge, 1.15)) * (0.5 + lump * 0.72) + facing * 0.26 - 0.1;
    col = flame(heat);
    // Остывая, огонь становится сажей, а края дыр ещё тлеют
    vec3 soot = mix(vec3(0.02, 0.016, 0.016), vec3(0.11, 0.09, 0.085), smoothstep(0.1, 0.9, top * 0.8 + lump * 0.3)) * uLight;
    col = mix(col, soot, smoothstep(0.58, 0.92, vAge));
    col = mix(col, vec3(1.3, 0.42, 0.03), (1.0 - smoothstep(burn, burn + 0.07, torn)) * step(0.01, burn));
  } else {
    float burn = smoothstep(0.6, 1.0, vAge);
    if (torn < burn) discard;
    float shade = smoothstep(0.08, 0.92, top * 0.74 + lump * 0.4);
    col = mix(vec3(0.03, 0.028, 0.03), vec3(0.3, 0.285, 0.28), shade) * (1.0 + vAge * 0.35) * uLight;
    // Молодой дым подсвечен огнём снизу
    col += vec3(1.1, 0.26, 0.03) * (1.0 - top) * (1.0 - smoothstep(0.0, 0.32, vAge)) * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Бесшовный клеточный шум: бугры у клубов получаются как у настоящего дыма
function noiseVolume(size = 32) {
  let s = 19;
  const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const layer = (cells) => {
    const points = new Float32Array(cells * cells * cells * 3).map(() => random());
    return (u, v, w) => {
      const cx = Math.floor(u * cells);
      const cy = Math.floor(v * cells);
      const cz = Math.floor(w * cells);
      let best = 9;
      for (let k = -1; k <= 1; k++) {
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const gx = cx + i;
            const gy = cy + j;
            const gz = cz + k;
            const at = (((gz + cells) % cells) * cells * cells + ((gy + cells) % cells) * cells + (gx + cells) % cells) * 3;
            const dx = (gx + points[at]) / cells - u;
            const dy = (gy + points[at + 1]) / cells - v;
            const dz = (gz + points[at + 2]) / cells - w;
            best = Math.min(best, dx * dx + dy * dy + dz * dz);
          }
        }
      }
      return 1 - Math.min(1, Math.sqrt(best) * cells * 0.82);
    };
  };
  const puffy = [layer(3), layer(6)];
  const torn = [layer(4), layer(8)];
  const data = new Uint8Array(size * size * size * 2);
  let at = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const w = z / size;
        data[at++] = 255 * (torn[0](u, v, w) * 0.62 + torn[1](u, v, w) * 0.38);
        data[at++] = 255 * (puffy[0](u, v, w) * 0.72 + puffy[1](u, v, w) * 0.28);
      }
    }
  }
  const t = new T.Data3DTexture(data, size, size, size);
  t.format = T.RGFormat;
  t.wrapS = t.wrapT = t.wrapR = T.RepeatWrapping;
  t.minFilter = t.magFilter = T.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

function ballGeometry() {
  const g = new T.IcosahedronGeometry(1, 6);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return mergeVertices(g, 0.0001);
}

const spread = (a, b) => a + Math.random() * (b - a);

export class Fireballs {
  constructor(stage) {
    const source = ballGeometry();
    const g = new T.InstancedBufferGeometry();
    g.index = source.index;
    g.setAttribute('position', source.attributes.position);
    const attr = (name, n) => {
      const a = new T.InstancedBufferAttribute(new Float32Array(CAPACITY * n), n);
      a.setUsage(T.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.at = attr('iPos', 3);
    this.info = attr('iInfo', 4);
    g.instanceCount = 0;
    this.geometry = g;
    this.uniforms = { uNoise: { value: noiseVolume() }, uLight: { value: 1 } };
    this.mesh = new T.Mesh(g, new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms }));
    this.mesh.frustumCulled = false;
    stage.add(this.mesh);
    this.list = [];
    this.last = 0;
    this.quality = 2;
  }

  clear() {
    this.list.length = 0;
  }

  setLight(k) {
    this.uniforms.uLight.value = k;
  }

  add(o) {
    o.t = -(o.delay || 0);
    o.seed = Math.random();
    this.list.push(o);
    if (this.list.length > CAPACITY) this.list.shift();
  }

  // x, y — центр взрыва в трёхмерных координатах, y вверх; radius — радиус действия
  blast(x, y, radius) {
    const k = radius / 175;
    const z = 46;
    const lobes = [5, 7, 10][this.quality];
    const smoke = [3, 4, 7][this.quality];
    // Сердцевина и лепестки вокруг неё
    this.add({ kind: FIRE, x, y, z, vx: 0, vy: 40, vz: 0, drag: 4, s0: 26 * k, s1: 84 * k, life: 0.62 });
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + Math.random() * 0.5;
      const speed = spread(190, 340) * k;
      this.add({
        kind: FIRE,
        x: x + Math.cos(a) * 26 * k,
        y: y + Math.sin(a) * 26 * k,
        z: z + spread(-14, 14),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed + 50 * k,
        vz: spread(-30, 30),
        drag: 3.6,
        s0: spread(14, 24) * k,
        s1: spread(44, 66) * k,
        life: spread(0.58, 0.92),
        delay: spread(0, 0.05)
      });
    }
    // Запоздалые хлопки: взрыв не гаснет сразу
    for (let i = 0; i < Math.ceil(lobes / 3); i++) {
      this.add({
        kind: FIRE,
        x: x + spread(-70, 70) * k,
        y: y + spread(-40, 90) * k,
        z: z + spread(-10, 10),
        vx: spread(-50, 50),
        vy: spread(70, 150),
        vz: 0,
        drag: 2.4,
        s0: 10 * k,
        s1: spread(32, 48) * k,
        life: spread(0.48, 0.68),
        delay: spread(0.09, 0.28)
      });
    }
    // Дым поднимается над шаром
    for (let i = 0; i < smoke; i++) {
      this.add({
        kind: SMOKE,
        x: x + spread(-54, 54) * k,
        y: y + spread(30, 110) * k,
        z: z - spread(10, 26),
        vx: spread(-24, 24),
        vy: spread(110, 190),
        vz: 0,
        drag: 1.15,
        s0: 16 * k,
        s1: spread(44, 76) * k,
        life: spread(1.1, 1.8),
        delay: spread(0.14, 0.46)
      });
    }
  }

  update(time) {
    const dt = clamp(time - this.last, 0, 0.05);
    this.last = time;
    let n = 0;
    let write = 0;
    const pos = this.at.array;
    const info = this.info.array;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      this.list[write++] = p;
      if (p.t < 0) continue;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const age = p.t / p.life;
      const size = p.s0 + (p.s1 - p.s0) * (1 - (1 - age) * (1 - age) * (1 - age));
      pos[n * 3] = p.x;
      // Шар не проваливается под землю
      pos[n * 3 + 1] = Math.max(p.y, size * 0.7);
      pos[n * 3 + 2] = p.z;
      info[n * 4] = size;
      info[n * 4 + 1] = age;
      info[n * 4 + 2] = p.seed;
      info[n * 4 + 3] = p.kind;
      n++;
    }
    this.list.length = write;
    this.geometry.instanceCount = n;
    if (n) {
      for (const a of [this.at, this.info]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }
}
