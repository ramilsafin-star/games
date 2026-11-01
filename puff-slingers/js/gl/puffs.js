// Пуфы: объёмная шерсть слоями, живые глаза и мимика. Все размеры в долях радиуса.
import * as T from '../../vendor/three/three.module.min.js';
import { tube, fbm3, merge } from './shapes.js';

const FUR_VERT = `
attribute float aShell;
attribute float aLen;
uniform vec3 uBend; uniform float uTime; uniform float uFur;
varying vec3 vN; varying vec3 vObj; varying float vS; varying vec3 vWorld;
void main(){
  float s = aShell;
  vec3 n = normalize(normal);
  vec3 p = position + n * (uFur * aLen * s);
  p += uBend * s * s;
  // Вихры: кончики прядей заваливаются в разные стороны пучками
  p += vec3(sin(position.y * 8.0 + 1.3), sin(position.z * 8.0 + 2.1), sin(position.x * 8.0 + 0.4)) * 0.1 * s * s * uFur / 0.25;
  p += n * sin(uTime * 3.0 + position.y * 7.0 + position.x * 5.0) * 0.012 * s;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vObj = position;
  vS = s;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FUR_FRAG = `
uniform vec3 uRoot; uniform vec3 uMid; uniform vec3 uTip; uniform vec3 uBelly;
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGnd;
uniform float uEmber; uniform float uTime; uniform float uCell; uniform float uFlash;
varying vec3 vN; varying vec3 vObj; varying float vS; varying vec3 vWorld;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  // Ячейки на сфере дают густые волоски без шва и стяжки на полюсах
  vec3 q = normalize(vObj) * uCell;
  vec3 i = floor(q);
  vec3 f = fract(q) - 0.5;
  float rnd = h3(i);
  float strand = 0.42 + rnd * 0.68 - length(f) * 1.05;
  if (vS > 0.02 && strand < vS * 0.82) discard;

  vec3 col = mix(uRoot, uMid, smoothstep(0.0, 0.42, vS));
  col = mix(col, uTip, smoothstep(0.55, 1.0, vS) * (0.3 + rnd * 0.7));
  float belly = smoothstep(0.05, -0.55, vObj.y) * smoothstep(-0.25, 0.45, vObj.z);
  col = mix(col, uBelly, belly * 0.5);

  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float wrap = clamp(dot(N, uSun) * 0.62 + 0.38, 0.0, 1.0);
  vec3 hemi = mix(uGnd * 0.45 + uSky * 0.55, uSky, N.y * 0.5 + 0.5);
  float ao = mix(0.46, 1.0, vS);
  vec3 lit = col * (hemi + uSunCol * wrap * wrap) * ao;
  // Ореол на кончиках: шерсть светится по краю на солнце
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6) * (0.3 + vS * 0.7);
  lit += mix(uMid, uTip, 0.5) * (hemi * 0.4 + uSunCol * 0.22) * rim;
  if (uEmber > 0.0) {
    float vein = smoothstep(0.7, 0.95, h3(floor(normalize(vObj) * 9.0)) * (0.72 + rnd * 0.4));
    // На лице прожилок нет, иначе за свечением не видно глаз и рта
    vein *= 1.0 - smoothstep(0.42, 0.74, dot(normalize(vObj), vec3(0.287, -0.057, 0.956)));
    lit +=vec3(2.3, 0.72, 0.1) * vein * uEmber * (0.7 + 0.3 * sin(uTime * 6.0 + rnd * 6.0));
  }
  lit += vec3(uFlash);
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FUR_LENGTH = { rocky: 0.26, zip: 0.3, trio: 0.24, nimbus: 0.4, magma: 0.17, drill: 0.2, frost: 0.28, dyna: 0.22 };

let furGeometry = null;
function makeFurGeometry(maxShells) {
  const sphere = new T.SphereGeometry(0.88, 30, 20);
  const g = new T.InstancedBufferGeometry();
  g.index = sphere.index;
  g.setAttribute('position', sphere.attributes.position);
  g.setAttribute('normal', sphere.attributes.normal);
  const pos = sphere.attributes.position;
  const len = new Float32Array(pos.count);
  const face = new T.Vector3(0.3, -0.06, 1).normalize();
  const v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const clump = fbm3(v.x * 3 + 7, v.y * 3 + 2, v.z * 3 + 5, 2);
    // Вокруг лица шерсть короче, иначе глаза и рот утонут
    const nearFace = T.MathUtils.smoothstep(v.dot(face), 0.42, 0.74);
    len[i] = (0.62 + clump * 0.86) * (1 - nearFace * 0.66);
  }
  g.setAttribute('aLen', new T.BufferAttribute(len, 1));
  const shells = new Float32Array(maxShells);
  for (let i = 0; i < maxShells; i++) shells[i] = i / (maxShells - 1);
  g.setAttribute('aShell', new T.InstancedBufferAttribute(shells, 1));
  g.instanceCount = maxShells;
  g.boundingSphere = new T.Sphere(new T.Vector3(), 2);
  return g;
}

function furMaterial(type, light) {
  const H = HEROES[type];
  const c = H.fur.map((x) => new T.Color(x));
  return new T.ShaderMaterial({
    vertexShader: FUR_VERT,
    fragmentShader: FUR_FRAG,
    side: T.FrontSide,
    uniforms: {
      uRoot: { value: c[2].clone().multiplyScalar(0.72) },
      uMid: { value: c[1] },
      uTip: { value: c[1].clone().lerp(c[0], 0.55) },
      uBelly: { value: type === 'magma' ? new T.Color('#ff7a1a') : c[1].clone().lerp(c[0], 0.8).lerp(new T.Color('#ffffff'), 0.18) },
      uSun: light.sunDir,
      uSunCol: light.sunColor,
      uSky: light.sky,
      uGnd: light.ground,
      uBend: { value: new T.Vector3() },
      uTime: { value: 0 },
      uFur: { value: FUR_LENGTH[type] || 0.25 },
      uCell: { value: type === 'nimbus' ? 22 : 34 },
      uEmber: { value: type === 'magma' ? 1 : 0 },
      uFlash: { value: 0 }
    }
  });
}

// Глаз целиком: белок, радужка и зрачок нарисованы на шаре, поэтому он честно поворачивается
function eyeTexture(iris) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 256);
  const cx = 128;
  const cy = 128;
  const R = 58;
  const grad = g.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
  const base = new T.Color(iris);
  const dark = '#' + base.clone().multiplyScalar(0.34).getHexString();
  const light = '#' + base.clone().lerp(new T.Color('#ffffff'), 0.36).getHexString();
  grad.addColorStop(0, light);
  grad.addColorStop(0.62, iris);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff55';
  g.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.48, cy + Math.sin(a) * R * 0.48);
    g.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
    g.stroke();
  }
  g.fillStyle = '#0b0420';
  g.beginPath();
  g.arc(cx, cy, R * 0.46, 0, Math.PI * 2);
  g.fill();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SHARED = { eye: new T.SphereGeometry(0.3, 28, 20), lid: new T.SphereGeometry(0.314, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), glint: new T.SphereGeometry(0.075, 10, 8) };

// Точка на поверхности лица: рот лежит на сфере, а не висит в воздухе
function onFace(x, y, lift = 1.0) {
  return new T.Vector3(x, y, Math.sqrt(Math.max(0.02, lift * lift - x * x - y * y)));
}

function buildMouths(H, cache) {
  if (cache.mouths) return cache.mouths;
  const dark = new T.MeshStandardMaterial({ color: '#3a0a24', roughness: 0.6 });
  const line = new T.MeshStandardMaterial({ color: H.line, roughness: 0.6 });
  const tooth = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  const tongue = new T.MeshStandardMaterial({ color: '#ff5e8a', roughness: 0.45 });
  const R = 0.99;
  const my = -0.38;
  const grinPts = [onFace(-0.34, my + 0.02, R), onFace(-0.12, my - 0.16, R), onFace(0.16, my - 0.17, R), onFace(0.42, my + 0.06, R)];
  const hurtPts = [onFace(-0.25, my, R), onFace(-0.09, my + 0.07, R), onFace(0.07, my - 0.05, R), onFace(0.26, my + 0.05, R)];
  const happy = new T.Shape();
  happy.moveTo(-0.32, 0.06);
  happy.quadraticCurveTo(0.04, -0.48, 0.4, 0.06);
  happy.closePath();
  const fang = new T.ConeGeometry(0.075, 0.19, 8);
  fang.rotateX(Math.PI);
  cache.mouths = {
    grin: [
      { geo: tube(grinPts, (t) => 0.034 + Math.sin(t * Math.PI) * 0.026, 18, 6), mat: line },
      { geo: fang, mat: tooth, at: onFace(0.2, my - 0.23, R + 0.01) }
    ],
    hurt: [{ geo: tube(hurtPts, 0.03, 16, 6), mat: line }],
    scream: [
      { geo: new T.SphereGeometry(1, 20, 14), mat: dark, at: onFace(0.05, my - 0.02, R - 0.02), scale: [0.25, 0.3, 0.1] },
      { geo: new T.SphereGeometry(1, 16, 12), mat: tongue, at: onFace(0.05, my - 0.15, R + 0.01), scale: [0.15, 0.1, 0.06] }
    ],
    happy: [
      { geo: new T.ExtrudeGeometry(happy, { depth: 0.04, bevelEnabled: false, curveSegments: 14 }), mat: dark, at: new T.Vector3(0, my + 0.04, onFace(0.04, my, R).z - 0.03) },
      { geo: new T.BoxGeometry(0.42, 0.075, 0.03), mat: tooth, at: new T.Vector3(0.04, my + 0.03, onFace(0.04, my, R).z + 0.03) },
      { geo: new T.SphereGeometry(1, 14, 10), mat: tongue, at: new T.Vector3(0.04, my - 0.19, onFace(0.04, my - 0.2, R).z - 0.01), scale: [0.13, 0.08, 0.03] }
    ]
  };
  return cache.mouths;
}

const SPARK = new T.MeshBasicMaterial({ color: new T.Color(3.4, 2, 0.6), toneMapped: false });
// Украшения каждого героя: рога, хохолок, ушки, тучка, шипы, сверло, кристаллы, шашки
function buildDecor(type, H) {
  const out = [];
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    out.push(m);
    return m;
  };
  if (type === 'rocky') {
    const horn = new T.MeshStandardMaterial({ color: '#ffe3a6', roughness: 0.42, metalness: 0.05 });
    for (const s of [-1, 1]) {
      add(tube([[s * 0.42, 0.7, 0.05], [s * 0.72, 1.14, 0.05], [s * 1.02, 1.42, 0.02]], (t) => 0.22 * (1 - t) + 0.015, 14, 10), horn);
    }
  } else if (type === 'zip') {
    const crest = new T.MeshStandardMaterial({ color: '#ff9d1c', roughness: 0.42, emissive: '#ff7a00', emissiveIntensity: 0.25 });
    const bolt = new T.Shape();
    bolt.moveTo(-0.15, 0);
    bolt.lineTo(0.02, 0.5);
    bolt.lineTo(-0.12, 0.46);
    bolt.lineTo(0.08, 0.98);
    bolt.lineTo(0.14, 0.42);
    bolt.lineTo(0.28, 0.48);
    bolt.lineTo(0.16, 0);
    bolt.closePath();
    const g = new T.ExtrudeGeometry(bolt, { depth: 0.16, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 });
    g.translate(0, 0, -0.08);
    add(g, crest, -0.44, 0.66, 0, 0, 0, 0.42, 0.78);
    add(g, crest, 0, 0.78, 0, 0, 0, 0.02, 1);
    add(g, crest, 0.42, 0.64, 0, 0, 0, -0.42, 0.74);
  } else if (type === 'trio') {
    const ear = new T.MeshStandardMaterial({ color: H.fur[1], roughness: 0.65 });
    const inner = new T.MeshStandardMaterial({ color: '#ffb3dd', roughness: 0.65 });
    const ball = new T.SphereGeometry(0.38, 18, 14);
    for (const s of [-1, 1]) {
      add(ball, ear, s * 0.72, 0.86, -0.02, 0, 0, 0, 1, 1, 0.55);
      add(ball, inner, s * 0.72, 0.86, 0.13, 0, 0, 0, 0.55, 0.55, 0.3);
    }
  } else if (type === 'nimbus') {
    const cloud = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, emissive: '#d6c8ff', emissiveIntensity: 0.12 });
    const ball = new T.SphereGeometry(1, 20, 14);
    for (const [x, y, z, s] of [[-0.46, 1.0, 0, 0.36], [0.05, 1.22, -0.04, 0.48], [0.56, 0.98, 0, 0.34], [0.26, 1.1, 0.26, 0.28], [-0.24, 1.12, 0.24, 0.26]]) add(ball, cloud, x, y, z, 0, 0, 0, s);
  } else if (type === 'magma') {
    const spike = new T.MeshStandardMaterial({ color: '#2a1140', roughness: 0.4, metalness: 0.3, emissive: '#ff6a1f', emissiveIntensity: 0.55 });
    const cone = new T.ConeGeometry(0.2, 0.62, 10);
    [[-0.68, 0.7, -0.5], [-0.24, 0.95, -0.14], [0.24, 0.96, 0.14], [0.68, 0.72, 0.5]].forEach(([x, y, tilt]) => add(cone, spike, x, y + 0.14, 0, 0, 0, -tilt));
  } else if (type === 'dyna') {
    // Связка шашек на макушке, чёрная лента и тлеющий запал
    const red = new T.MeshStandardMaterial({ color: '#d62a18', roughness: 0.5 });
    const band = new T.MeshStandardMaterial({ color: '#23180f', roughness: 0.7 });
    const cap = new T.MeshStandardMaterial({ color: '#f2e6c9', roughness: 0.7 });
    const stick = new T.CylinderGeometry(0.2, 0.2, 0.96, 14);
    const end = new T.CylinderGeometry(0.205, 0.205, 0.05, 14);
    [[-0.42, -0.04, -0.14, 0.14], [0, 0.1, 0.06, 0], [0.42, -0.04, -0.14, -0.14], [0.2, 0.2, -0.16, -0.06], [-0.2, 0.2, -0.16, 0.06]].forEach(([x, z, dy, tilt]) => {
      const y = 1.22 + dy;
      add(stick, red, x, y, z, 0, 0, tilt);
      add(end, cap, x - Math.sin(tilt) * 0.48, y + Math.cos(tilt) * 0.48, z, 0, 0, tilt);
    });
    add(new T.CylinderGeometry(0.72, 0.72, 0.13, 22), band, 0, 1.12, 0.04, 0, 0, 0, 1, 1, 0.56);
    add(tube([[0, 1.62, 0.12], [0.08, 1.92, 0.14], [0.3, 2.04, 0.14]], 0.035, 10, 6), band);
    add(new T.SphereGeometry(0.12, 10, 8), SPARK, 0.34, 2.06, 0.14);
  } else if (type === 'drill') {
    const steel = new T.MeshStandardMaterial({ color: '#d7deea', metalness: 0.92, roughness: 0.22 });
    const dark = new T.MeshStandardMaterial({ color: '#5a6478', metalness: 0.7, roughness: 0.35 });
    const bit = new T.Group();
    bit.name = 'bit';
    bit.position.set(0, 0.78, 0);
    bit.add(new T.Mesh(new T.ConeGeometry(0.46, 1.25, 20), steel));
    bit.children[0].position.y = 0.58;
    // Винтовая кромка сверла
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const a = t * Math.PI * 7;
      const r = 0.47 * (1 - t) + 0.015;
      pts.push(new T.Vector3(Math.cos(a) * r, t * 1.18 - 0.02, Math.sin(a) * r));
    }
    bit.add(new T.Mesh(tube(pts, 0.032, 72, 6), dark));
    bit.children[1].position.y = 0;
    out.push(bit);
  } else if (type === 'frost') {
    const iceMat = new T.MeshStandardMaterial({ color: '#c8f6ff', roughness: 0.08, metalness: 0.15, emissive: '#7fe6ff', emissiveIntensity: 0.32 });
    const cone = new T.ConeGeometry(0.2, 0.92, 6);
    [[-0.58, 0.84, 0.42, 0.74], [0, 1.08, 0, 1], [0.58, 0.84, -0.42, 0.74], [-0.28, 0.98, 0.2, 0.55], [0.28, 0.98, -0.2, 0.55]].forEach(([x, y, tilt, s]) => add(cone, iceMat, x, y, 0, 0, 0, tilt, s));
  }
  return out;
}

export class Puffs {
  constructor(stage, light, shells) {
    this.stage = stage;
    this.light = light;
    this.maxShells = 22;
    if (!furGeometry) furGeometry = makeFurGeometry(this.maxShells);
    this.shells = Math.min(shells, this.maxShells);
    this.parts = {};
    this.pool = {};
    this.active = [];
    this.time = 0;
    this.shadowDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
    this.glint = new T.MeshBasicMaterial({ color: new T.Color(3, 3, 3), toneMapped: false });
  }

  setShells(n) {
    this.shells = Math.min(n, this.maxShells);
  }

  // Чем сильнее свечение мира, тем тусклее блик в глазу, иначе он расползается на всё лицо
  setGlint(bloom) {
    this.glint.color.setScalar(Math.min(3, 0.9 / bloom));
  }

  typeParts(type) {
    if (this.parts[type]) return this.parts[type];
    const H = HEROES[type];
    const p = {
      fur: furMaterial(type, this.light),
      eye: new T.MeshStandardMaterial({ map: eyeTexture(H.iris), roughness: 0.14, metalness: 0 }),
      lid: new T.MeshStandardMaterial({ color: new T.Color(H.fur[1]).multiplyScalar(0.8), roughness: 0.82, side: T.DoubleSide }),
      brow: new T.MeshStandardMaterial({ color: H.line, roughness: 0.6 }),
      foot: new T.MeshStandardMaterial({ color: H.fur[2], roughness: 0.78 }),
      browGeo: new T.CapsuleGeometry(0.058, 0.34, 4, 10),
      feetGeo: bakeMeshes([-1, 1].map((s) => {
        const foot = new T.Mesh(new T.SphereGeometry(1, 16, 12));
        foot.position.set(s * 0.44, -0.96, 0.18);
        foot.scale.set(0.3, 0.17, 0.4);
        return foot;
      }))
    };
    p.browGeo.rotateZ(Math.PI / 2);
    this.parts[type] = p;
    return p;
  }

  // Неподвижные украшения склеиваются по материалам, сверло остаётся отдельно: оно вращается
  decorOf(type, H, P) {
    if (!P.decor) {
      const list = buildDecor(type, H);
      P.decor = [];
      const groups = new Map();
      for (const m of list) {
        if (m.isGroup) {
          P.decor.push(m);
          continue;
        }
        if (!groups.has(m.material)) groups.set(m.material, []);
        groups.get(m.material).push(m);
      }
      for (const [mat, meshes] of groups) P.decor.push(new T.Mesh(bakeMeshes(meshes), mat));
    }
    return P.decor.map((m) => m.clone());
  }

  build(type) {
    const H = HEROES[type];
    const P = this.typeParts(type);
    const root = new T.Group();
    root.matrixAutoUpdate = false;
    const fur = new T.Mesh(furGeometry, P.fur);
    fur.frustumCulled = false;
    fur.onBeforeRender = () => {
      furGeometry.instanceCount = root.userData.shells;
      P.fur.uniforms.uBend.value.copy(root.userData.bend);
      P.fur.uniforms.uTime.value = this.time;
      P.fur.uniforms.uFlash.value = root.userData.flash || 0;
      P.fur.uniformsNeedUpdate = true;
    };
    // В тень попадает только внутренний шар: все слои шерсти тень не меняют
    fur.castShadow = true;
    fur.customDepthMaterial = this.shadowDepth;
    fur.onBeforeShadow = () => {
      furGeometry.instanceCount = 1;
    };
    root.add(fur);
    root.add(new T.Mesh(P.feetGeo, P.foot));
    this.decorOf(type, H, P).forEach((m) => root.add(m));
    // Лицо смотрит немного вправо, на крепость
    const face = new T.Group();
    face.rotation.y = 0.26;
    root.add(face);
    const eyes = [];
    const glints = new T.Mesh(P.glintGeo || (P.glintGeo = bakeMeshes([-1, 1].map((s) => {
      const g = new T.Mesh(SHARED.glint);
      g.position.set(s * 0.34 + 0.04 - 0.09, 0.27, 1.0);
      return g;
    }))), this.glint);
    face.add(glints);
    for (const s of [-1, 1]) {
      const at = new T.Group();
      at.position.set(s * 0.34 + 0.04, 0.16, 0.76);
      face.add(at);
      const ball = new T.Mesh(SHARED.eye, P.eye);
      at.add(ball);
      const lid = new T.Mesh(SHARED.lid, P.lid);
      at.add(lid);
      const brow = new T.Mesh(P.browGeo, P.brow);
      brow.position.set(s * 0.34 + 0.04, 0.5, 0.92);
      face.add(brow);
      eyes.push({ ball, lid, brow, side: s });
    }
    const mouths = {};
    const defs = buildMouths(H, P);
    for (const [name, list] of Object.entries(defs)) {
      const g = new T.Group();
      for (const d of list) {
        const m = new T.Mesh(d.geo, d.mat);
        if (d.at) m.position.copy(d.at);
        if (d.scale) m.scale.set(...d.scale);
        g.add(m);
      }
      g.visible = false;
      face.add(g);
      mouths[name] = g;
    }
    root.userData = { type, eyes, glints, mouths, shells: this.shells, bend: new T.Vector3(), face, bit: root.getObjectByName('bit') };
    return root;
  }

  begin(time) {
    this.time = time;
    for (const type in this.pool) for (const r of this.pool[type]) r.visible = false;
    this.used = {};
  }

  // Берёт свободную модель нужного героя на этот кадр
  take(type) {
    const list = this.pool[type] || (this.pool[type] = []);
    const n = this.used[type] || 0;
    this.used[type] = n + 1;
    if (!list[n]) {
      list[n] = this.build(type);
      this.stage.add(list[n]);
    }
    list[n].visible = true;
    return list[n];
  }

  // o: как у прежней отрисовки — положение, взгляд, настроение, растяжение
  draw(type, x, y, r, o) {
    const root = this.take(type);
    const d = root.userData;
    d.shells = this.shells;
    d.flash = o.flash || 0;
    const m = root.matrix;
    m.identity();
    tempM.makeTranslation(x, y, o.z || 0);
    m.multiply(tempM);
    if (o.stretch) {
      const a = -(o.stretchAngle || 0);
      m.multiply(tempM.makeRotationZ(a));
      m.multiply(tempM.makeScale(1 + o.stretch, 1 - o.stretch * 0.7, 1 - o.stretch * 0.3));
      m.multiply(tempM.makeRotationZ(-a));
    }
    if (o.squish) m.multiply(tempM.makeScale(1 + o.squish, 1 - o.squish, 1 + o.squish * 0.5));
    if (o.rot) m.multiply(tempM.makeRotationZ(-o.rot));
    m.multiply(tempM.makeScale(r, r, r));
    root.matrixWorldNeedsUpdate = true;

    // Шерсть отстаёт от движения и провисает под своим весом
    d.bend.set(-(o.vx || 0) * 0.016, -0.05 + (o.vy || 0) * 0.016, 0);

    const mood = o.mood || 'angry';
    const lookX = T.MathUtils.clamp(o.lookX ?? 0.7, -1, 1);
    const lookY = T.MathUtils.clamp(o.lookY ?? 0, -1, 1);
    for (const e of d.eyes) {
      e.ball.rotation.set(lookY * 0.42, lookX * 0.48 - 0.1, 0);
      const wide = mood === 'scream' || mood === 'scared';
      const closed = o.blink || mood === 'hurt';
      // Веко поднято назад; когда моргает, опускается на глаз
      e.lid.rotation.set(closed ? 0.82 : mood === 'angry' ? -0.32 : wide ? -1.2 : -0.9, 0, mood === 'angry' ? e.side * 0.34 : 0);
      const s = e.side;
      if (mood === 'angry') {
        e.brow.rotation.z = s * 0.46;
        e.brow.position.y = 0.45;
      } else if (wide) {
        e.brow.rotation.z = -s * 0.32;
        e.brow.position.y = 0.58;
      } else if (mood === 'happy') {
        e.brow.rotation.z = -s * 0.14;
        e.brow.position.y = 0.56;
      } else {
        e.brow.rotation.z = s * 0.2;
        e.brow.position.y = 0.5;
      }
    }
    d.glints.visible = !(o.blink || mood === 'hurt');
    const shown = mood === 'scared' ? 'scream' : mood === 'angry' ? 'grin' : mood;
    for (const name in d.mouths) d.mouths[name].visible = name === shown;
    if (d.bit) d.bit.rotation.y = o.fuse ? this.time * 38 : this.time * 2;
    return root;
  }
}

const tempM = new T.Matrix4();

function bakeMeshes(meshes) {
  return merge(meshes.map((m) => {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    g.applyMatrix4(m.matrix);
    return g;
  }));
}
