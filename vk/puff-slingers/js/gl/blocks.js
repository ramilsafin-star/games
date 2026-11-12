// Постройки и предметы уровня: материалы блоков, скалы, батуты, порталы, вихри, кристаллы и рогатка.
import * as T from '../../vendor/three/three.module.min.js?v=d6bb936e';
import { RoundedBoxGeometry } from '../../vendor/three/RoundedBoxGeometry.js?v=d6bb936e';
import { boxUV, merge, paint, rockBox, seededRandom, tube, fbm3 } from './shapes.js?v=d6bb936e';

export const BLOCK_DEPTH = 66;

// Трещины, вспышка удара, потёртые края и железные детали внутри одной модели
function withDamage(material, cracks, metalHex) {
  material.userData.damage = { value: 0 };
  material.userData.flash = { value: 0 };
  material.vertexColors = true;
  material.onBeforeCompile = (s) => {
    s.uniforms.uCrack = { value: cracks };
    s.uniforms.uDamage = material.userData.damage;
    s.uniforms.uFlash = material.userData.flash;
    s.uniforms.uMetalColor = { value: new T.Color(metalHex || '#7d8796') };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aPart; varying vec2 vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCrack; uniform float uDamage; uniform float uFlash; uniform vec3 uMetalColor; varying vec2 vPart;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float isMetal = smoothstep(0.5, 0.9, vPart.y);
        float wear = smoothstep(0.02, 0.3, vPart.x);
        float grain = diffuseColor.r + diffuseColor.g;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + 0.035, wear * (1.0 - isMetal) * smoothstep(0.15, 0.65, grain));
        diffuseColor.rgb = mix(diffuseColor.rgb, uMetalColor * (0.72 + grain * 0.3) * (1.0 + wear * 0.8), isMetal);
        vec2 cr = texture2D(uCrack, vMapUv * 1.4).rg;
        float crack = cr.r * step(cr.g, uDamage * 1.2) * (1.0 - isMetal * 0.6);
        diffuseColor.rgb *= 1.0 - crack * 0.86;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.34, isMetal);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.88, isMetal);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(uFlash);');
  };
  material.customProgramCacheKey = () => 'block-damage-2';
  return material;
}

// Подписывает вершины детали: цвет, потёртость по скруглённым рёбрам, железо или нет
function part(geometry, tint, metal, uvTile, ou, ov, swap) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (uvTile) boxUV(g, uvTile, uvTile, swap, ou, ov);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const info = new Float32Array(pos.count * 2);
  const c = new T.Color(tint);
  for (let i = 0; i < pos.count; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    info[i * 2] = 1 - Math.max(Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i)));
    info[i * 2 + 1] = metal ? 1 : 0;
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.setAttribute('aPart', new T.BufferAttribute(info, 2));
  for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
  return g;
}
const KEEP = ['position', 'normal', 'uv', 'color', 'aPart'];

const shade = (hex, rng, spread) => {
  const k = 1 + (rng() - 0.5) * spread;
  return new T.Color(hex).multiplyScalar(k);
};

function rounded(w, h, d, r, x = 0, y = 0, z = 0, seg = 2) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.46));
  g.translate(x, y, z);
  return g;
}

// Заклёпка с плоской шляпкой
function rivet(x, y, z, r) {
  const g = new T.SphereGeometry(r, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, 0.62);
  g.translate(x, y, z);
  return g;
}

// Деревянная балка: несколько досок, между ними тёмная щель, на длинных железные хомуты
function woodBeam(L, H, D, rng) {
  const parts = [];
  const n = H >= 40 ? 3 : H >= 19 ? 2 : 1;
  const gap = 1.2;
  const each = (H - gap * (n - 1)) / n;
  parts.push(part(new T.BoxGeometry(L - 7, H - 2, D - 6), '#2c170a', false, 300));
  for (let i = 0; i < n; i++) {
    const y = -H / 2 + each / 2 + i * (each + gap);
    const cut = (rng() - 0.5) * 3;
    const len = L - Math.abs(cut) * 1.2;
    const g = rounded(len, each, D - (rng() * 2.4), 2.6, cut * 0.5, y + (rng() - 0.5) * 0.5);
    parts.push(part(g, shade('#ffffff', rng, 0.24), false, 240, rng(), rng()));
  }
  // Хомуты держат доски вместе
  const bands = L >= 80 ? [-L * 0.33, L * 0.33] : [0];
  for (const x of bands) {
    parts.push(part(rounded(8.5, H + 1.8, D + 1.8, 1.2, x, 0, 0, 1), '#ffffff', true, 90, rng(), rng()));
    for (const yy of [H * 0.27, -H * 0.27]) parts.push(part(rivet(x, yy, D / 2 + 0.6, 2.1), '#ffffff', true, 90));
  }
  return parts;
}

function woodBlock(w, h, D, rng) {
  if (w > h) return woodBeam(w, h, D, rng);
  // Столб: та же балка, повёрнутая на бок. Волокна идут вдоль неё
  const list = woodBeam(h, w, D, rng);
  const m = new T.Matrix4().makeRotationZ(Math.PI / 2);
  list.forEach((g) => g.applyMatrix4(m));
  return list;
}

// Каменная кладка: отдельные тёсаные камни с неровными краями
function stoneBlock(w, h, D, rng) {
  const parts = [];
  parts.push(part(new T.BoxGeometry(w - 2.4, h - 2.4, D - 5), '#3c3a3c', false, 300));
  const along = w >= h;
  const L = along ? w : h;
  const T0 = along ? h : w;
  const rows = T0 >= 40 ? 2 : 1;
  const rowH = T0 / rows;
  for (let row = 0; row < rows; row++) {
    let at = -L / 2;
    const off = row % 2 ? 16 : 0;
    let first = true;
    while (at < L / 2 - 1) {
      let len = (first && off ? off : 34 + rng() * 26);
      first = false;
      if (L / 2 - (at + len) < 18) len = L / 2 - at;
      const c = at + len / 2;
      const cy = -T0 / 2 + rowH * (row + 0.5);
      const seed = rng() * 90;
      const g = along
        ? rockBox(len - 0.9, rowH - 0.6, D - rng() * 2.4, 2.2, 0.7, seed, 9)
        : rockBox(rowH - 0.6, len - 0.9, D - rng() * 2.4, 2.2, 0.7, seed, 9);
      g.translate(along ? c : cy, along ? cy : c, 0);
      parts.push(part(g, shade('#f4f1ec', rng, 0.26), false, 200, rng(), rng()));
      at += len;
    }
  }
  return parts;
}

// Лист брони: рамка, утопленная середина, заклёпки по периметру
function steelBlock(w, h, D, rng) {
  const parts = [];
  const f = Math.min(5.5, Math.min(w, h) * 0.24);
  parts.push(part(rounded(w - 2.2, h - 2.2, D - 5, 1.6), '#b4bcc8', true, 280, rng(), rng()));
  const bar = (bw, bh, x, y) => parts.push(part(rounded(bw, bh, D, 1.5, x, y, 0, 1), '#eef2f8', true, 280, rng(), rng()));
  bar(w, f, 0, h / 2 - f / 2);
  bar(w, f, 0, -h / 2 + f / 2);
  bar(f, h - f * 1.4, w / 2 - f / 2, 0);
  bar(f, h - f * 1.4, -w / 2 + f / 2, 0);
  const z = D / 2 + 0.2;
  const ix = w / 2 - f / 2;
  const iy = h / 2 - f / 2;
  const put = (x, y) => parts.push(part(rivet(x, y, z, Math.max(1.6, f * 0.34)), '#ffffff', true, 280));
  [[-ix, -iy], [ix, -iy], [-ix, iy], [ix, iy]].forEach(([x, y]) => put(x, y));
  const nx = Math.floor(w / 46);
  for (let i = 1; i < nx; i++) {
    put(-ix + (i / nx) * ix * 2, iy);
    put(-ix + (i / nx) * ix * 2, -iy);
  }
  const ny = Math.floor(h / 46);
  for (let i = 1; i < ny; i++) {
    put(ix, -iy + (i / ny) * iy * 2);
    put(-ix, -iy + (i / ny) * iy * 2);
  }
  return parts;
}

// Лёд колотый: грани плоские и ловят блики по отдельности
function iceBlock(w, h, D, rng) {
  const g = rockBox(w, h, D, 2.4, 1.5, rng() * 80, 15).toNonIndexed();
  g.computeVertexNormals();
  return [part(g, '#ffffff', false, 240, rng(), rng())];
}

function boomBlock(w, h, D, rng) {
  const box = rounded(w, h, D, 3.2);
  const pos = box.attributes.position;
  const nor = box.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    if (az >= ax && az >= ay) uv.set([pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5], i * 2);
    else if (ay >= ax) uv.set([pos.getX(i) / w + 0.5, pos.getZ(i) / D + 0.5], i * 2);
    else uv.set([pos.getZ(i) / D + 0.5, pos.getY(i) / h + 0.5], i * 2);
  }
  box.setAttribute('uv', new T.BufferAttribute(uv, 2));
  const parts = [part(box, '#ffffff', false)];
  // Железные уголки по всем восьми вершинам
  const c = 11;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - c / 2 + 0.6);
    const y = sy * (h / 2 - c / 2 + 0.6);
    const z = sz * (D / 2 - c / 2 + 0.6);
    const g = rounded(c, c, c, 2, x, y, z, 1);
    parts.push(part(g, '#ffffff', true, 90, rng(), rng()));
  }
  return parts;
}

const BUILD = { wood: woodBlock, stone: stoneBlock, steel: steelBlock, ice: iceBlock, boom: boomBlock };

export class Blocks {
  constructor(stage, tex) {
    this.stage = stage;
    this.tex = tex;
    this.base = {
      wood: new T.MeshStandardMaterial({ map: tex.wood, normalMap: tex.wood_n, normalScale: new T.Vector2(0.75, 0.75), roughness: 0.74, metalness: 0 }),
      stone: new T.MeshStandardMaterial({ map: tex.stone, normalMap: tex.stone_n, normalScale: new T.Vector2(1.1, 1.1), roughness: 0.88, metalness: 0, color: '#ded6c8' }),
      steel: new T.MeshStandardMaterial({ map: tex.steel, normalMap: tex.steel_n, normalScale: new T.Vector2(0.4, 0.4), roughness: 0.36, metalness: 0.92, envMapIntensity: 1.5 }),
      ice: new T.MeshStandardMaterial({ map: tex.ice, normalMap: tex.ice_n, normalScale: new T.Vector2(0.6, 0.6), roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.8, emissive: '#2f9dd0', emissiveIntensity: 0.36, envMapIntensity: 2.1 }),
      boom: new T.MeshStandardMaterial({ map: tex.crate, normalMap: tex.crate_n, normalScale: new T.Vector2(0.8, 0.8), roughness: 0.6, metalness: 0 })
    };
    this.metalHex = { wood: '#7e7a78', stone: '#7d8796', steel: '#9aa6b8', ice: '#7d8796', boom: '#6d6a72' };
    this.geos = new Map();
    this.map = new Map();
    this.counter = 0;
  }

  geometry(mat, w, h, variant) {
    const key = `${mat}:${w}:${h}:${variant}`;
    let g = this.geos.get(key);
    if (g) return g;
    const rng = seededRandom(hashStr(key) + 5);
    g = merge(BUILD[mat](w, h, BLOCK_DEPTH, rng));
    g.computeBoundingSphere();
    this.geos.set(key, g);
    return g;
  }

  makeMesh(b) {
    const material = withDamage(this.base[b.mat].clone(), this.tex.cracks, this.metalHex[b.mat]);
    const variant = this.counter++ % 3;
    const m = new T.Mesh(this.geometry(b.mat, b.w, b.h, variant), material);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.mat = b.mat;
    return m;
  }

  draw(list, time, particles) {
    const seen = new Set();
    for (const b of list) {
      let m = this.map.get(b);
      if (!m || m.userData.mat !== b.mat) {
        if (m) {
          this.stage.remove(m);
          m.material.dispose();
        }
        m = this.makeMesh(b);
        this.map.set(b, m);
        this.stage.add(m);
      }
      seen.add(b);
      m.position.set(b.position.x, GROUND_Y - b.position.y, 0);
      m.rotation.z = -b.angle;
      m.material.userData.damage.value = 1 - b.hp / b.maxHp;
      m.material.userData.flash.value = b.hitFlash * 0.3;
      if (b.mat === 'boom' && particles) {
        const pulse = 0.1 + 0.07 * Math.sin(time * 5 + b.id);
        particles.glow(m.position.x, m.position.y, BLOCK_DEPTH / 2 + 4, Math.max(b.w, b.h) * 2.2, '#ff7a1a', pulse);
      }
    }
    for (const [b, m] of this.map) {
      if (!seen.has(b)) {
        this.stage.remove(m);
        m.material.dispose();
        this.map.delete(b);
      }
    }
  }

  clear() {
    for (const [, m] of this.map) {
      this.stage.remove(m);
      m.material.dispose();
    }
    this.map.clear();
  }
}

// ---------- предметы уровня, которые не двигаются ----------
const swirlMat = (hex, dir) => new T.ShaderMaterial({
  uniforms: { uColor: { value: new T.Color(hex) }, uTime: { value: 0 }, uDir: { value: dir } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uDir; varying vec2 vUv;
    void main(){
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      float s = sin(a * 3.0 + uDir * (uTime * 4.2 - r * 7.0));
      float arm = smoothstep(0.05, 0.95, s) * smoothstep(1.0, 0.25, r) * smoothstep(0.0, 0.3, r);
      vec3 c = mix(vec3(0.012, 0.006, 0.05), uColor * 2.8, arm);
      c += uColor * pow(r, 5.0) * 2.2;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`
});

const wellMat = () => new T.ShaderMaterial({
  transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
  uniforms: { uTime: { value: 0 }, uRadius: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uRadius; varying vec2 vUv;
    void main(){
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      // Граница действия: бегущий пунктир
      float dash = step(0.5, fract(a * 9.5493 + uTime * 0.6));
      float ring = smoothstep(0.012, 0.0, abs(r - 0.965)) * dash * 0.62;
      // Рукава вихря сгущаются к центру
      float inner = r * uRadius / 90.0;
      float arm = pow(0.5 + 0.5 * sin(a * 3.0 + uTime * 3.2 + inner * 6.5), 3.0) * smoothstep(1.0, 0.15, inner);
      float glow = smoothstep(1.2, 0.0, inner) * 0.3;
      vec3 c = vec3(0.72, 0.42, 1.0) * (arm * 1.2 + glow) + vec3(1.0, 0.75, 1.0) * arm * smoothstep(0.7, 0.2, inner) * 0.6;
      c += vec3(0.75, 0.6, 1.0) * ring;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`
});

export class LevelProps {
  constructor(stage, tex) {
    this.stage = stage;
    this.tex = tex;
    this.group = new T.Group();
    stage.add(this.group);
    this.rocks = null;
    this.swirls = [];
    this.gemGeo = (() => {
      const crown = new T.CylinderGeometry(0.62, 1, 0.42, 8);
      crown.translate(0, 0.21, 0);
      const pav = new T.ConeGeometry(1, 1.15, 8);
      pav.rotateX(Math.PI);
      pav.translate(0, -0.575, 0);
      const g = merge([crown.toNonIndexed(), pav.toNonIndexed()]);
      g.computeVertexNormals();
      return g;
    })();
    this.gemMat = new T.MeshStandardMaterial({ color: '#46dcff', metalness: 0.3, roughness: 0.05, emissive: '#1a9dff', emissiveIntensity: 0.55, envMapIntensity: 2.2, flatShading: true });
    this.orbMat = new T.MeshBasicMaterial({ color: new T.Color(3.2, 3.6, 4.4), toneMapped: false });
    this.orbGeo = new T.SphereGeometry(1, 18, 14);
    this.stickGeo = merge([
      paint(new T.CylinderGeometry(0.62, 0.62, 2.5, 14), '#d62a18'),
      paint(new T.CylinderGeometry(0.64, 0.64, 0.14, 14), '#f2e6c9', new T.Matrix4().makeTranslation(0, 1.25, 0)),
      paint(new T.CylinderGeometry(0.64, 0.64, 0.14, 14), '#f2e6c9', new T.Matrix4().makeTranslation(0, -1.25, 0)),
      paint(new T.CylinderGeometry(0.1, 0.1, 0.7, 6), '#23180f', new T.Matrix4().makeTranslation(0, 1.6, 0))
    ]);
    this.stickMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    this.ringMetal = new T.MeshStandardMaterial({ color: '#d7deea', metalness: 0.95, roughness: 0.2 });
    this.gemMeshes = [];
    this.orbMeshes = new Map();
    this.jellies = [];
  }

  // Строит всё заново при смене уровня
  rebuild(biome, list, portalList, wellList, gemList) {
    this.group.clear();
    this.swirls = [];
    this.gemMeshes = [];
    this.jellies = [];
    const B = BIOMES[biome];
    if (B.id === 'neon') rockGlow.value.setRGB(0.15, 1.5, 1.35);
    else if (B.id === 'volcano') rockGlow.value.setRGB(2.0, 0.5, 0.07);
    else rockGlow.value.setRGB(0, 0, 0);
    list.forEach((q, i) => {
      if (q.label === 'jelly') this.jelly(q);
      else this.rock(q, B, i, biome);
    });
    portalList.forEach((p) => {
      this.portal(p.a, '#29f3ff', 1);
      this.portal(p.b, '#ff9a1f', -1);
    });
    wellList.forEach((w) => this.well(w));
    gemList.forEach((g) => {
      const m = new T.Mesh(this.gemGeo, this.gemMat);
      m.scale.setScalar(GEM_R * 0.92);
      m.position.set(g.x, GROUND_Y - g.y, 0);
      m.castShadow = true;
      m.userData.gem = g;
      this.group.add(m);
      this.gemMeshes.push(m);
    });
  }

  rock(q, B, seed, biome) {
    const d = 116;
    const round = Math.min(13, q.w * 0.3, q.h * 0.3);
    const g = rockBox(q.w, q.h, d, round, Math.min(7, q.w * 0.14, q.h * 0.14), seed * 7 + 3, 13);
    const top = new T.Color(B.grass[1]);
    const topLight = new T.Color(B.grass[0]);
    const d0 = new T.Color(B.dirt[0]);
    const d1 = new T.Color(B.dirt[1]);
    const d2 = new T.Color(B.dirt[2]);
    const painted = paint(g, (c, x, y, z, nx, ny) => {
      const k = (y + q.h / 2) / q.h;
      const n = fbm3(x * 0.03 + seed, y * 0.03, z * 0.03, 3);
      c.copy(d2).lerp(d1, T.MathUtils.smoothstep(k, 0, 0.5)).lerp(d0, T.MathUtils.smoothstep(k + n * 0.3, 0.55, 1.05));
      c.multiplyScalar((0.72 + n * 0.62) * (B.id === 'neon' || B.id === 'volcano' ? 1.9 : 1));
      const cap = T.MathUtils.smoothstep(y - (q.h / 2 - 15 - (n - 0.5) * 18), 0, 4) * T.MathUtils.smoothstep(ny, -0.2, 0.25);
      if (cap > 0) c.lerp(topLight.clone().lerp(top, n * 1.4), cap);
    });
    boxUV(painted, 240, 240, false, seed * 0.13, seed * 0.29);
    const m = new T.Mesh(painted, rockMaterial(this.tex));
    m.position.set(q.position.x, GROUND_Y - q.position.y, 0);
    m.rotation.z = -q.angle;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    void biome;
  }

  jelly(q) {
    const g = new RoundedBoxGeometry(q.w, q.h, 92, 4, Math.min(q.w, q.h) * 0.46);
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ color: '#ff4fb8', roughness: 0.16, metalness: 0, transparent: true, opacity: 0.88, emissive: '#b0127c', emissiveIntensity: 0.14, envMapIntensity: 1.9 }));
    m.position.set(q.position.x, GROUND_Y - q.position.y, 0);
    m.rotation.z = -q.angle;
    m.castShadow = true;
    m.userData.q = q;
    this.group.add(m);
    this.jellies.push(m);
  }

  portal(p, hex, dir) {
    const y = GROUND_Y - p.y;
    const disc = new T.Mesh(new T.CircleGeometry(PORTAL_R, 40), swirlMat(hex, dir));
    disc.position.set(p.x, y, 0);
    this.group.add(disc);
    this.swirls.push(disc);
    const ring = new T.Mesh(new T.TorusGeometry(PORTAL_R, 4, 12, 56), this.ringMetal);
    ring.position.copy(disc.position);
    ring.castShadow = true;
    this.group.add(ring);
    const light = new T.Mesh(new T.TorusGeometry(PORTAL_R - 3.2, 1.1, 8, 56), new T.MeshBasicMaterial({ color: new T.Color(hex).multiplyScalar(3.2), toneMapped: false }));
    light.position.set(p.x, y, 3);
    this.group.add(light);
    disc.userData.glow = { x: p.x, y, hex };
  }

  well(w) {
    const size = w.radius * 2;
    const mat = wellMat();
    mat.uniforms.uRadius.value = w.radius;
    const m = new T.Mesh(new T.PlaneGeometry(size, size), mat);
    m.position.set(w.x, GROUND_Y - w.y, -6);
    this.group.add(m);
    this.swirls.push(m);
    const core = new T.Mesh(new T.SphereGeometry(16, 20, 14), new T.MeshStandardMaterial({ color: '#05021a', roughness: 0.2, metalness: 0.5 }));
    core.position.set(w.x, GROUND_Y - w.y, 0);
    this.group.add(core);
    const halo = new T.Mesh(new T.TorusGeometry(19, 1.6, 8, 36), new T.MeshBasicMaterial({ color: new T.Color(2.8, 2.2, 3.4), toneMapped: false }));
    halo.position.copy(core.position);
    this.group.add(halo);
    m.userData.well = w;
  }

  draw(time, particles, orbList) {
    for (const s of this.swirls) {
      s.material.uniforms.uTime.value = time;
      if (s.userData.glow) {
        const g = s.userData.glow;
        particles.glow(g.x, g.y, 6, PORTAL_R * 3.6, g.hex, 0.42 + Math.sin(time * 4) * 0.1);
      }
      if (s.userData.well) {
        const w = s.userData.well;
        const y = GROUND_Y - w.y;
        for (let i = 0; i < 9; i++) {
          const k = 1 - ((time * 0.35 + i / 9) % 1);
          const a = i * 2.4 + k * 6 + time;
          const rr = 14 + k * w.radius * 0.8;
          particles.sprite(w.x + Math.cos(a) * rr, y + Math.sin(a) * rr, 8, 6 + (1 - k) * 8, a, '#ffffff', 0.25 + (1 - k) * 0.75, 9, 2.6);
        }
      }
    }
    for (const m of this.jellies) {
      const q = m.userData.q;
      const k = q.wob ? Math.sin(time * 34) * q.wob * 0.28 : 0;
      if (q.w > q.h) m.scale.set(1 - k * 0.2, 1 + k, 1 - k * 0.2);
      else m.scale.set(1 + k, 1 - k * 0.2, 1 - k * 0.2);
    }
    for (const m of this.gemMeshes) {
      const g = m.userData.gem;
      m.visible = !g.taken;
      if (g.taken) continue;
      m.position.y = GROUND_Y - g.y + Math.sin(time * 2.4 + g.phase) * 6;
      m.rotation.y = time * 1.4 + g.phase;
      m.rotation.x = 0.18;
      particles.glow(g.x, m.position.y, 14, GEM_R * 3.4, '#4fe3ff', 0.32 + Math.sin(time * 5 + g.phase) * 0.14);
      const tw = (time * 0.9 + g.phase) % 1;
      if (tw < 0.25) {
        const k = tw / 0.25;
        particles.sprite(g.x + GEM_R * 0.5, m.position.y + GEM_R * 0.55, 26, 30 * Math.sin(k * Math.PI), time, '#ffffff', 1, 9, 2.6);
      }
    }
    const seen = new Set();
    for (const o of orbList) {
      let m = this.orbMeshes.get(o);
      if (!m) {
        m = o.stick ? new T.Mesh(this.stickGeo, this.stickMat) : new T.Mesh(this.orbGeo, this.orbMat);
        this.stage.add(m);
        this.orbMeshes.set(o, m);
      }
      seen.add(o);
      const r = o.circleRadius;
      m.position.set(o.position.x, GROUND_Y - o.position.y, 0);
      if (o.stick) {
        // Шашка кувыркается, на запале горит искра
        m.scale.setScalar(r);
        m.rotation.set(0.3, 0, o.turn + time * 7);
        const a = o.turn + time * 7;
        const sx = m.position.x - Math.sin(a) * r * 2;
        const sy = m.position.y + Math.cos(a) * r * 2;
        particles.glow(sx, sy, 12, r * 4, '#ff9a2e', 0.9);
        particles.sprite(sx, sy, 13, r * 2.4, time * 9, '#ffe9a8', 1, 9, 2.4);
        continue;
      }
      m.scale.setScalar(r * 0.72);
      particles.glow(m.position.x, m.position.y, 6, r * 7, '#7a5cff', 0.85);
      particles.glow(m.position.x, m.position.y, 7, r * 4, '#6fe8ff', 0.85);
      for (let i = 0; i < 3; i++) {
        const a = time * 9 + (i * Math.PI * 2) / 3;
        particles.streak(m.position.x + Math.cos(a) * r, m.position.y + Math.sin(a) * r, 9, r * 3, 18, a, '#bff4ff', 0.9, 14, 3);
      }
    }
    for (const [o, m] of this.orbMeshes) {
      if (!seen.has(o)) {
        this.stage.remove(m);
        this.orbMeshes.delete(o);
      }
    }
  }
}

let rockMat = null;
const rockGlow = { value: new T.Color(0, 0, 0) };
function rockMaterial(tex) {
  if (!rockMat) {
    rockMat = new T.MeshStandardMaterial({ vertexColors: true, map: tex.crag, normalMap: tex.crag_n, normalScale: new T.Vector2(1.2, 1.2), roughness: 0.92 });
    rockMat.onBeforeCompile = (s) => {
      s.uniforms.uRockGlow = rockGlow;
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRockGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRockGlow * (1.0 - smoothstep(0.08, 0.22, sampledDiffuseColor.r));');
    };
  }
  return rockMat;
}

// ---------- рогатка ----------
export class Sling {
  constructor(stage, tex) {
    const x = SLING_X;
    const top = GROUND_Y - SLING_Y;
    const wood = new T.MeshStandardMaterial({ map: tex.wood, normalMap: tex.wood_n, normalScale: new T.Vector2(1.3, 1.3), roughness: 0.62, color: '#d9a878' });
    const wrap = new T.MeshStandardMaterial({ color: '#ff2e88', roughness: 0.55 });
    const backTip = new T.Vector3(SLING_TIP_BACK.x, GROUND_Y - SLING_TIP_BACK.y, -13);
    const frontTip = new T.Vector3(SLING_TIP_FRONT.x, GROUND_Y - SLING_TIP_FRONT.y, 13);
    this.backTip = backTip;
    this.frontTip = frontTip;
    const fork = top - 52;
    const parts = [
      tube([[x, -22, 0], [x + 1, fork * 0.5, 0], [x, fork, 0]], (t) => 15 - t * 3, 10, 14),
      tube([[x, fork - 8, -2], [x + 12, fork + 14, -7], [x + 30, top - 2, -12], [backTip.x, backTip.y + 4, -13]], (t) => 11.5 - t * 3.6, 14, 12),
      tube([[x, fork - 8, 2], [x - 12, fork + 14, 7], [x - 30, top - 2, 12], [frontTip.x, frontTip.y + 4, 13]], (t) => 11.5 - t * 3.6, 14, 12)
    ];
    const uvs = (g, s) => {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * 0.25);
    };
    uvs(parts[0], 1);
    uvs(parts[1], 0.5);
    uvs(parts[2], 0.5);
    this.group = new T.Group();
    for (const g of parts) {
      const m = new T.Mesh(g, wood);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    // Цветная обмотка на концах и на стволе
    const ring = new T.TorusGeometry(9.5, 3, 8, 18);
    for (const [px, py, pz, rx, rz, s] of [[backTip.x - 1, backTip.y - 6, -13, Math.PI / 2, -0.4, 1], [backTip.x - 3, backTip.y - 13, -13, Math.PI / 2, -0.4, 1.03], [frontTip.x + 1, frontTip.y - 6, 13, Math.PI / 2, 0.4, 1], [frontTip.x + 3, frontTip.y - 13, 13, Math.PI / 2, 0.4, 1.03], [x, fork - 26, 0, Math.PI / 2, 0, 1.5], [x, fork - 35, 0, Math.PI / 2, 0, 1.56]]) {
      const m = new T.Mesh(ring, wrap);
      m.position.set(px, py, pz);
      m.rotation.set(rx, 0, rz);
      m.scale.setScalar(s);
      this.group.add(m);
    }
    stage.add(this.group);
    const band = new T.CylinderGeometry(1, 1, 1, 10);
    this.bandMat = new T.MeshStandardMaterial({ color: '#ff2e88', roughness: 0.42 });
    this.bandBack = new T.Mesh(band, this.bandMat);
    this.bandFront = new T.Mesh(band, this.bandMat);
    this.bandBack.castShadow = this.bandFront.castShadow = true;
    this.pouch = new T.Mesh(new T.SphereGeometry(1, 14, 10), new T.MeshStandardMaterial({ color: '#4a1c30', roughness: 0.75 }));
    this.pouch.scale.set(14, 10, 8);
    stage.add(this.bandBack, this.bandFront, this.pouch);
    this.tA = new T.Vector3();
    this.tB = new T.Vector3();
    this.up = new T.Vector3(0, 1, 0);
  }

  setBand(mesh, from, x, y, z, r) {
    this.tB.set(x, y, z);
    this.tA.subVectors(this.tB, from);
    const len = this.tA.length();
    mesh.position.copy(from).addScaledVector(this.tA, 0.5);
    mesh.quaternion.setFromUnitVectors(this.up, this.tA.normalize());
    mesh.scale.set(r, len, r);
  }

  update(pouchX, pouchY, heroR) {
    const y = GROUND_Y - pouchY;
    const stretch = T.MathUtils.clamp(Math.hypot(pouchX - SLING_X, pouchY - SLING_Y) / 150, 0, 1);
    const r = 5.2 - stretch * 2.4;
    this.bandMat.color.set(stretch > 0.72 ? '#ff5a3c' : '#ff2e88');
    this.setBand(this.bandBack, this.backTip, pouchX, y, -8, r);
    this.setBand(this.bandFront, this.frontTip, pouchX - (heroR ? heroR * 0.3 : 0), y, 10, r);
    this.pouch.position.set(pouchX, y, 0);
    this.pouch.visible = !heroR;
  }
}

