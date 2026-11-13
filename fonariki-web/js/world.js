// Неподвижный мир: земля с кругом света, трава, лес, кусты и камни, пять мест в лесу,
// постаменты усилений, лагерь с костром, участок сада с постройками.
import { T, TAU, GLSL_NOISE, groundY, hot, hash, clamp } from "./kit.js?v=16ea7301";
import { CAMP, GARDEN, PLACES, PLACE_RADIUS, BUFFS, SHRINES, BUILDING_BY_ID } from "./config.js?v=16ea7301";

// Общие для своих шейдеров значения: время, ветер, круг света, костёр, фонари, туман
export const U = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uRadius: { value: 30 },
  uPlayer: { value: new T.Vector3() },
  uFire: { value: new T.Vector4(0, 2, 0, 1) },
  uLamps: { value: [new T.Vector4(), new T.Vector4(), new T.Vector4(), new T.Vector4()] },
  uLampCol: { value: [new T.Color(), new T.Color(), new T.Color(), new T.Color()] },
  uFogColor: { value: new T.Color("#0b1028") },
  uFogDensity: { value: 0.009 },
  uDawn: { value: 0 },
  uCenter: { value: new T.Vector3() },
  uCam: { value: new T.Vector3() },
  uTgt: { value: new T.Vector3() },
};

const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), S = new T.Vector3();
export function mat(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new T.Matrix4().compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}

// Сдвиг вершин по шуму — «живые» комки крон; одна и та же точка двигается одинаково (без щелей)
function lumpy(geo, amount, seed) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (hash(Math.round(x * 50) * 0.13 + Math.round(y * 50) * 0.71 + Math.round(z * 50) * 0.37 + seed) - 0.5) * amount;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Склейка деталей в одну геометрию с цветом вершин: parts = [{ geo, color, m }]
export function mergeParts(parts) {
  let count = 0;
  const list = parts.map(({ geo, color, m }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    count += g.attributes.position.count;
    return { g, c: new T.Color(color) };
  });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const { g, c } of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
    o += n;
    g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.BufferAttribute(nor, 3));
  out.setAttribute("color", new T.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// Ветер качает кроны: сдвиг вершин растёт с высотой. Дерево между камерой и игроком
// становится «решётчато» прозрачным, чтобы игрока было видно и в чаще.
function swaying(material, amount = 1) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uWind = U.uWind;
    sh.uniforms.uCam = U.uCam;
    sh.uniforms.uTgt = U.uTgt;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uCam, uTgt;\nvarying vec3 vTreeW;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        {
          vec3 ab = uTgt - uCam;
          float k = clamp(dot(vTreeW - uCam, ab) / dot(ab, ab), 0.0, 1.0);
          float d = length(vTreeW - uCam - ab * k);
          float keep = min(smoothstep(1.6, 3.8, d) + step(0.97, k), smoothstep(2.5, 6.5, length(vTreeW - uCam)));
          vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
          float bayer = mod(q.x * 3.0 + q.y * 2.0 + q.x * q.y, 4.0) / 4.0 + 0.1;
          if (keep < bayer * 0.9) discard;
        }`,
      );
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime, uWind;\nvarying vec3 vTreeW;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hh = max(position.y, 0.0);
        float sw = (sin(uTime * 1.1 + ip.x * 0.05 + ip.z * 0.07) + 0.4 * sin(uTime * 2.3 + ip.z * 0.2)) * uWind * ${(0.0016 * amount).toFixed(5)} * hh * hh;
        transformed.x += sw;
        transformed.z += sw * 0.6;
        #ifdef USE_INSTANCING
          vTreeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vTreeW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => "sway" + amount;
  return material;
}

// Подсветка контура: персонажи и тени читаются на тёмном фоне
export function rimmed(material, color = "#7d8cff", power = 2.6, strength = 0.55) {
  const rc = new T.Color(color);
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rc };
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRim;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float rimK = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), ${power.toFixed(2)});
        totalEmissiveRadiance += uRim * rimK * ${strength.toFixed(2)};`,
      );
  };
  material.customProgramCacheKey = () => "rim" + color + power + strength;
  return material;
}

// ---------- Земля ----------
function makeGround(layout) {
  const size = 560, seg = 220;
  const geo = new T.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const paths = [];
  for (const pts of layout.paths) for (let i = 0; i < pts.length - 1; i++) paths.push(new T.Vector4(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  const places = PLACES.map((p) => new T.Vector4(p.x, p.z, PLACE_RADIUS, ["mushrooms", "pond", "stones", "oak", "crystals"].indexOf(p.id)));
  const material = new T.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTime: U.uTime,
      uRadius: U.uRadius,
      uDawn: U.uDawn,
      uPaths: { value: paths },
      uPlaces: { value: places },
      uGarden: { value: new T.Vector3(GARDEN.x, GARDEN.z, GARDEN.size) },
    });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vGround;
        uniform float uTime, uRadius, uDawn;
        uniform vec4 uPaths[${paths.length}];
        uniform vec4 uPlaces[5];
        uniform vec3 uGarden;
        ${GLSL_NOISE}
        float segD(vec2 p, vec4 s) { vec2 a = s.xy, b = s.zw, ab = b - a; float k = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * k); }
        vec3 groundColor(vec2 p) {
          float n = fbm(p * 0.06), n2 = vnoise(p * 0.7), n3 = vnoise(p * 2.3);
          vec3 c = mix(vec3(0.05, 0.13, 0.1), vec3(0.1, 0.2, 0.12), n) * (0.82 + 0.3 * n2);
          c = mix(c, vec3(0.05, 0.15, 0.15), smoothstep(0.55, 0.8, fbm(p * 0.025 + 3.0)) * 0.7);
          float r = length(p);
          // лесная подстилка темнее и бурее
          c = mix(c, vec3(0.07, 0.075, 0.06) * (0.8 + 0.4 * n3), smoothstep(58.0, 85.0, r) * 0.55);
          // тропинки
          float pd = 1e9;
          for (int i = 0; i < ${paths.length}; i++) pd = min(pd, segD(p, uPaths[i]));
          float path = 1.0 - smoothstep(1.2, 2.8, pd + (n2 - 0.5) * 1.4);
          c = mix(c, vec3(0.2, 0.15, 0.1) * (0.75 + 0.5 * n3), path * 0.8 * smoothstep(8.0, 14.0, r));
          // утоптанная земля у костра
          float camp = 1.0 - smoothstep(7.0, 11.5, r + (n - 0.5) * 4.0);
          c = mix(c, vec3(0.16, 0.115, 0.08) * (0.75 + 0.5 * n3), camp);
          // лужайка сада
          float gd = length(p - uGarden.xy);
          c = mix(c, vec3(0.1, 0.27, 0.1) * (0.85 + 0.3 * n2), 1.0 - smoothstep(uGarden.z - 0.4, uGarden.z + 0.5, gd));
          c = mix(c, vec3(0.3, 0.27, 0.24), smoothstep(0.45, 0.0, abs(gd - uGarden.z - 0.2)) * 0.7);
          // поляны мест: мох, у кристаллов — камень
          for (int i = 0; i < 5; i++) {
            float pdd = length(p - uPlaces[i].xy);
            float k = 1.0 - smoothstep(uPlaces[i].z - 4.0, uPlaces[i].z + 2.0, pdd + (n - 0.5) * 6.0);
            vec3 tint = uPlaces[i].w == 4.0 ? vec3(0.13, 0.12, 0.15) : uPlaces[i].w == 1.0 ? vec3(0.09, 0.17, 0.12) : vec3(0.07, 0.2, 0.13);
            c = mix(c, tint * (0.8 + 0.4 * n2), k * 0.75);
          }
          return c;
        }`,
      )
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = groundColor(vGround.xz);")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float r = length(vGround.xz);
          float a = atan(vGround.z, vGround.x);
          // край круга света: золотая полоса с бегущими искрами
          float edge = exp(-pow((r - uRadius) / 0.5, 2.0));
          float dash = 0.55 + 0.45 * sin(a * 46.0 - uTime * 1.6);
          float night = 1.0 - uDawn;
          totalEmissiveRadiance += vec3(1.0, 0.62, 0.22) * edge * dash * 0.9 * night;
          totalEmissiveRadiance += vec3(0.5, 0.26, 0.07) * exp(-pow((r - uRadius) / 2.2, 2.0)) * 0.12 * night;
          // внутри — тёплый отсвет костра
          totalEmissiveRadiance += vec3(0.07, 0.035, 0.008) * (1.0 - smoothstep(0.0, uRadius, r)) * night;
        }`,
      );
  };
  const mesh = new T.Mesh(geo, material);
  mesh.receiveShadow = false;
  return mesh;
}

// ---------- Трава: окно травинок вокруг камеры (сдвигается в шейдере), качается и расступается ----------
const GRASS_WIN = 74;
function makeGrass(maxCount) {
  // пучок из пяти травинок
  const blade = [];
  const bladeN = 5;
  for (let b = 0; b < bladeN; b++) {
    const a = (b / bladeN) * TAU + hash(b) * 0.8;
    const ox = Math.cos(a) * 0.22, oz = Math.sin(a) * 0.22;
    const w = 0.08, h = 0.5 + hash(b + 3) * 0.45, lean = (hash(b + 7) - 0.5) * 0.4;
    const dx = Math.cos(a + 1.57) * w, dz = Math.sin(a + 1.57) * w;
    const pts = [
      [ox - dx, 0, oz - dz, 0], [ox + dx, 0, oz + dz, 0], [ox + dx * 0.55 + lean * 0.5, h * 0.55, oz + dz * 0.55, 0.55],
      [ox - dx, 0, oz - dz, 0], [ox + dx * 0.55 + lean * 0.5, h * 0.55, oz + dz * 0.55, 0.55], [ox - dx * 0.55 + lean * 0.5, h * 0.55, oz - dz * 0.55, 0.55],
      [ox - dx * 0.55 + lean * 0.5, h * 0.55, oz - dz * 0.55, 0.55], [ox + dx * 0.55 + lean * 0.5, h * 0.55, oz + dz * 0.55, 0.55], [ox + lean, h, oz, 1],
    ];
    blade.push(...pts);
  }
  const base = new T.InstancedBufferGeometry();
  base.setAttribute("position", new T.Float32BufferAttribute(blade.flatMap((p) => [p[0], p[1], p[2]]), 3));
  base.setAttribute("tip", new T.Float32BufferAttribute(blade.map((p) => p[3]), 1));
  const offs = new Float32Array(maxCount * 4);
  for (let i = 0; i < maxCount; i++) {
    offs[i * 4] = (Math.random() - 0.5) * GRASS_WIN;
    offs[i * 4 + 1] = (Math.random() - 0.5) * GRASS_WIN;
    offs[i * 4 + 2] = 0.7 + Math.random() * 0.8;
    offs[i * 4 + 3] = Math.random();
  }
  base.setAttribute("aOff", new T.InstancedBufferAttribute(offs, 4));
  base.instanceCount = maxCount;
  const pond = PLACES.find((p) => p.id === "pond");
  const material = new T.ShaderMaterial({
    uniforms: { ...U, uPond: { value: new T.Vector3(pond.x, pond.z, 10.5) }, uGarden: { value: new T.Vector3(GARDEN.x, GARDEN.z, GARDEN.size) } },
    side: T.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float tip; attribute vec4 aOff;
      uniform float uTime, uWind, uRadius, uDawn, uFogDensity;
      uniform vec3 uPlayer, uCenter, uPond, uGarden;
      uniform vec4 uFire, uLamps[4]; uniform vec3 uLampCol[4];
      varying vec3 vCol; varying float vFog;
      ${GLSL_NOISE}
      void main() {
        vec2 rel = mod(aOff.xy - uCenter.xz + ${(GRASS_WIN / 2).toFixed(1)}, ${GRASS_WIN.toFixed(1)}) - ${(GRASS_WIN / 2).toFixed(1)};
        vec2 wp = uCenter.xz + rel;
        float r = length(wp);
        float fade = 1.0 - smoothstep(${(GRASS_WIN * 0.3).toFixed(1)}, ${(GRASS_WIN * 0.5).toFixed(1)}, length(rel));
        fade *= smoothstep(9.0, 13.0, r + (vnoise(wp * 0.4) - 0.5) * 3.0) * (1.0 - smoothstep(192.0, 200.0, r));
        fade *= smoothstep(uPond.z, uPond.z + 1.5, length(wp - uPond.xy));
        float patchy = vnoise(wp * 0.09);
        fade *= smoothstep(0.3, 0.55, patchy + 0.1);
        float sc = aOff.z * fade * (0.6 + 0.7 * patchy);
        float ang = aOff.w * 6.2831;
        vec3 p = position;
        p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
        p *= sc;
        float h2 = tip * tip;
        float sway = (sin(uTime * 1.6 + wp.x * 0.13 + wp.y * 0.09) * 0.22 + sin(uTime * 3.3 + wp.x * 0.6) * 0.06) * uWind;
        p.x += sway * h2 * sc;
        p.z += sway * 0.5 * h2 * sc;
        vec2 away = wp - uPlayer.xz; float dp = length(away);
        p.xz += away / max(dp, 0.001) * (1.0 - smoothstep(0.0, 2.4, dp)) * 0.8 * h2;
        p.y *= 1.0 - (1.0 - smoothstep(0.0, 2.4, dp)) * 0.4 * tip;
        vec3 world = vec3(wp.x + p.x, p.y, wp.y + p.z);
        // цвет: тёмный у корня, светлее к кончику, пятна
        vec3 root = vec3(0.03, 0.08, 0.06), top = mix(vec3(0.16, 0.34, 0.2), vec3(0.2, 0.36, 0.16), patchy);
        if (length(wp - uGarden.xy) < uGarden.z) top = vec3(0.2, 0.44, 0.18);
        vec3 base = mix(root, top, tip);
        // свет: луна, костёр, фонари (вычисляется прямо здесь — травы много)
        vec3 light = mix(vec3(0.13, 0.17, 0.4), vec3(1.0, 0.92, 0.85), uDawn) * (0.45 + 0.55 * tip);
        float fd = length(world - uFire.xyz);
        // тёплый свет костра: ярко у огня, к краю круга слабее, за краем — почти ничего
        float inCircle = 1.0 - smoothstep(uRadius * 0.6, uRadius * 1.08, fd);
        light += vec3(1.0, 0.55, 0.22) * uFire.w * (2.2 / (1.0 + fd * fd * 0.02) + 0.35 * inCircle) * (0.55 + 0.45 * tip);
        // золотая кромка круга света на кончиках травинок
        light += vec3(1.0, 0.7, 0.3) * exp(-pow((length(wp) - uRadius) / 0.9, 2.0)) * 1.4 * tip * (1.0 - uDawn);
        for (int i = 0; i < 4; i++) {
          float ld = length(world - uLamps[i].xyz);
          light += uLampCol[i] * uLamps[i].w * 1.6 / (1.0 + ld * ld * 0.09);
        }
        vCol = base * light;
        vec4 mv = modelViewMatrix * vec4(world, 1.0);
        float fz = length(mv.xyz);
        vFog = 1.0 - exp(-uFogDensity * uFogDensity * fz * fz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      varying vec3 vCol; varying float vFog;
      void main() { gl_FragColor = vec4(mix(vCol, uFogColor, vFog), 1.0); }`,
  });
  const mesh = new T.Mesh(base, material);
  mesh.frustumCulled = false;
  mesh.userData.max = maxCount;
  return mesh;
}

// ---------- Деревья ----------
function pineGeo(seed) {
  const parts = [{ geo: new T.CylinderGeometry(0.32, 0.55, 3.4, 7), color: "#4a3326", m: mat(0, 1.7, 0) }];
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1);
    const r = 3.7 - k * 2.6, h = 3.4 - k * 0.9, y = 2.6 + i * 1.95;
    const g = new T.ConeGeometry(r, h, 8, 1);
    const shade = ["#103a32", "#145040", "#175a44", "#1b6449", "#22704f"][i];
    parts.push({ geo: g, color: shade, m: mat(0, y + h / 2, 0, 1, 1, 1, 0, hash(seed + i) * 3, 0) });
  }
  return mergeParts(parts);
}
function leafyGeo(seed) {
  const parts = [
    { geo: new T.CylinderGeometry(0.38, 0.62, 4.6, 7), color: "#4f3828", m: mat(0, 2.3, 0) },
    { geo: new T.CylinderGeometry(0.12, 0.2, 2.4, 5), color: "#4f3828", m: mat(0.8, 4.2, 0, 1, 1, 1, 0, 0, -0.7) },
  ];
  const blobs = [[0, 6.8, 0, 3.1], [1.9, 6.0, 0.6, 2.3], [-1.7, 6.2, -0.4, 2.4], [0.4, 8.3, -0.7, 2.2], [-0.6, 6.0, 1.8, 2.1], [0.7, 5.8, -1.9, 2.0]];
  blobs.forEach(([x, y, z, r], i) => {
    // главный комок кроны гладче, остальные проще: лиственных деревьев сотни
    const g = lumpy(new T.IcosahedronGeometry(r, i === 0 ? 1 : 0), i === 0 ? 0.28 : 0.2, seed + i);
    parts.push({ geo: g, color: ["#1d5236", "#256240", "#1a4630", "#2b6c44", "#205a3a", "#1f4e34"][i], m: mat(x, y, z) });
  });
  return mergeParts(parts);
}
function makeTrees(layout, group) {
  const kinds = { pine: pineGeo(1), leafy: leafyGeo(2) };
  const material = swaying(new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }), 1);
  // 8 секторов на каждый вид: за кадром целые сектора не рисуются
  const buckets = {};
  for (const t of layout.trees) {
    const sector = Math.floor(((Math.atan2(t.z, t.x) + Math.PI) / TAU) * 8) % 8;
    const key = t.kind + sector;
    (buckets[key] ||= { kind: t.kind, list: [] }).list.push(t);
  }
  const color = new T.Color();
  for (const { kind, list } of Object.values(buckets)) {
    const mesh = new T.InstancedMesh(kinds[kind], material, list.length);
    list.forEach((t, i) => {
      const y = groundY(t.x, t.z) - 0.2;
      mesh.setMatrixAt(i, mat(t.x, y, t.z, t.s, t.s * (0.9 + t.hue * 0.25), t.s, 0, t.rot, 0));
      color.setHSL(0.33 + (t.hue - 0.5) * 0.08, 0.5, 0.5 + (t.hue - 0.5) * 0.25);
      mesh.setColorAt(i, color.setRGB(0.85 + t.hue * 0.3, 0.9 + (1 - t.hue) * 0.2, 0.9 + t.hue * 0.2));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

// ---------- Кусты, камни, светящиеся грибочки ----------
function makeProps(layout, group, glows) {
  const bush = mergeParts([
    { geo: lumpy(new T.IcosahedronGeometry(1.1, 0), 0.3, 4), color: "#1c4a34", m: mat(0, 0.7, 0) },
    { geo: lumpy(new T.IcosahedronGeometry(0.8, 0), 0.3, 5), color: "#235a3c", m: mat(0.8, 0.55, 0.3) },
    { geo: lumpy(new T.IcosahedronGeometry(0.75, 0), 0.3, 6), color: "#183f2d", m: mat(-0.7, 0.5, -0.3) },
  ]);
  const rock = lumpy(new T.DodecahedronGeometry(1, 0), 0.35, 9);
  const stem = new T.CylinderGeometry(0.08, 0.12, 0.55, 6).translate(0, 0.27, 0);
  const cap = new T.SphereGeometry(0.32, 10, 6, 0, TAU, 0, Math.PI / 2).translate(0, 0.5, 0);
  const lists = { bush: [], rock: [], shroom: [] };
  for (const p of layout.props) lists[p.type].push(p);
  const mk = (geo, material, list, fn) => {
    const m = new T.InstancedMesh(geo, material, list.length);
    list.forEach((p, i) => fn(m, p, i));
    m.computeBoundingSphere();
    group.add(m);
    return m;
  };
  const leafMat = swaying(new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), 0.6);
  mk(bush, leafMat, lists.bush, (m, p, i) => m.setMatrixAt(i, mat(p.x, 0, p.z, p.s, p.s * 0.85, p.s, 0, p.rot, 0)));
  mk(rock, new T.MeshStandardMaterial({ color: "#5b6170", flatShading: true, roughness: 0.9 }), lists.rock, (m, p, i) =>
    m.setMatrixAt(i, mat(p.x, p.s * 0.25, p.z, p.s, p.s * 0.65, p.s * 0.9, p.hue, p.rot, 0)),
  );
  const shroomColors = ["#5ff2ff", "#ff7ad9", "#b48cff", "#7dff9a"];
  mk(stem, new T.MeshStandardMaterial({ color: "#e8dcc8", roughness: 0.8 }), lists.shroom, (m, p, i) => m.setMatrixAt(i, mat(p.x, 0, p.z, p.s, p.s, p.s)));
  const capM = mk(cap, new T.MeshBasicMaterial({ color: "#ffffff" }), lists.shroom, (m, p, i) => {
    m.setMatrixAt(i, mat(p.x, 0, p.z, p.s, p.s * 0.8, p.s));
    m.setColorAt(i, hot(shroomColors[Math.floor(p.hue * 4)], 1.4));
    glows.push({ x: p.x, z: p.z, color: shroomColors[Math.floor(p.hue * 4)], size: 2.4 * p.s, k: 0.35 });
  });
  capM.instanceColor.needsUpdate = true;
}

// ---------- Места в лесу ----------
function makePlaces(layout, group, glows) {
  const out = { water: null, runes: [], crystals: [], lanterns: [] };
  const std = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  for (const p of PLACES) {
    const bits = layout.placeBits[p.id];
    if (p.id === "mushrooms") {
      const stemMat = std("#efe2cf", { flatShading: false });
      for (const b of bits) {
        const c = b.hue < 0.5 ? "#4fe6ff" : "#ff6fd2";
        const s = b.s;
        const stem = new T.Mesh(new T.CylinderGeometry(0.28 * s, 0.42 * s, 1.8 * s, 10), stemMat);
        stem.position.set(b.x, 0.9 * s, b.z);
        const capMat = new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5, roughness: 0.5 });
        const capMesh = new T.Mesh(new T.SphereGeometry(1.15 * s, 20, 10, 0, TAU, 0, Math.PI / 2), capMat);
        capMesh.scale.y = 0.7;
        capMesh.position.set(b.x, 1.75 * s, b.z);
        group.add(stem, capMesh);
        for (let k = 0; k < 5; k++) {
          const a = k * 1.3 + b.hue * 6, rr = 0.75 * s;
          const dot = new T.Mesh(new T.SphereGeometry(0.13 * s, 6, 4), new T.MeshBasicMaterial({ color: hot("#ffffff", 1.6) }));
          dot.position.set(b.x + Math.cos(a) * rr, 1.75 * s + 0.45 * s, b.z + Math.sin(a) * rr);
          group.add(dot);
        }
        glows.push({ x: b.x, z: b.z, color: c, size: 7 * s, k: 0.55 });
      }
    } else if (p.id === "pond") {
      out.water = makeWater(p);
      group.add(out.water);
      // кувшинки и камыши
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + 0.3, r = 3 + (i % 3) * 2.2;
        const pad = new T.Mesh(new T.CircleGeometry(0.75, 10, 0.4, TAU - 0.5), std("#2f7a4a", { side: T.DoubleSide, flatShading: false }));
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = a * 3;
        pad.position.set(p.x + Math.cos(a) * r, 0.1, p.z + Math.sin(a) * r);
        group.add(pad);
        if (i % 2 === 0) {
          const fl = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), new T.MeshBasicMaterial({ color: hot("#ffb6f0", 2.2) }));
          fl.position.copy(pad.position).y += 0.15;
          group.add(fl);
          glows.push({ x: fl.position.x, z: fl.position.z, color: "#ff9be8", size: 2.4, k: 0.4 });
        }
      }
      const reedMat = std("#2c5a3a");
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU + hash(i) * 0.2, r = 10.3 + hash(i + 4) * 1.2;
        const reed = new T.Mesh(new T.CylinderGeometry(0.04, 0.07, 1.6 + hash(i) * 1.2, 4), reedMat);
        reed.position.set(p.x + Math.cos(a) * r, 0.8, p.z + Math.sin(a) * r);
        reed.rotation.z = (hash(i + 9) - 0.5) * 0.3;
        group.add(reed);
      }
    } else if (p.id === "stones") {
      const stoneMat = std("#6d7385");
      const runeMat = new T.MeshBasicMaterial({ color: hot("#b48cff", 2.4) });
      for (const b of bits) {
        const st = new T.Mesh(lumpy(new T.CylinderGeometry(0.75, 1.15, 4.6 * b.s, 5), 0.15, b.rot), stoneMat);
        st.position.set(b.x, 2.1 * b.s, b.z);
        st.rotation.set((hash(b.rot) - 0.5) * 0.15, b.rot, (hash(b.rot + 1) - 0.5) * 0.15);
        group.add(st);
        const rune = new T.Mesh(new T.PlaneGeometry(0.55, 1.2), runeMat);
        const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz);
        rune.position.set(b.x + (dx / l) * 0.95, 2.4 * b.s, b.z + (dz / l) * 0.95);
        rune.lookAt(p.x, 2.4 * b.s, p.z);
        group.add(rune);
        out.runes.push(rune);
      }
      const altar = new T.Mesh(new T.CylinderGeometry(2.2, 2.6, 0.6, 7), stoneMat);
      altar.position.set(p.x, 0.3, p.z);
      group.add(altar);
      glows.push({ x: p.x, z: p.z, color: "#a07cff", size: 20, k: 0.22 });
    } else if (p.id === "oak") {
      const bark = std("#5a4030");
      const trunk = new T.Mesh(lumpy(new T.CylinderGeometry(1.9, 3.2, 12, 10, 3), 0.12, 3), bark);
      trunk.position.set(p.x, 6, p.z);
      group.add(trunk);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const root = new T.Mesh(new T.ConeGeometry(0.9, 4, 5), bark);
        root.position.set(p.x + Math.cos(a) * 2.6, 0.5, p.z + Math.sin(a) * 2.6);
        root.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
        group.add(root);
      }
      const crownParts = [];
      for (let i = 0; i < 11; i++) {
        const a = i * 2.39, r = i === 0 ? 0 : 4 + (i % 3) * 2.2;
        crownParts.push({ geo: lumpy(new T.IcosahedronGeometry(4.2 + hash(i) * 2, 1), 0.3, i), color: ["#1f5536", "#27663f", "#1b4a30"][i % 3], m: mat(Math.cos(a) * r, 14 + hash(i + 2) * 4 + (i === 0 ? 3 : 0), Math.sin(a) * r) });
      }
      const crown = new T.Mesh(mergeParts(crownParts), swaying(new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), 0.4));
      crown.position.set(p.x, 0, p.z);
      group.add(crown);
      // фонарики на ветках
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + 0.4, r = 6 + (i % 2) * 2.5;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = 9 + (i % 3) * 1.1;
        const rope = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 2.2, 3), bark);
        rope.position.set(x, y + 1.1, z);
        const lamp = new T.Mesh(new T.SphereGeometry(0.38, 10, 8), new T.MeshBasicMaterial({ color: hot("#ffb45a", 2.6) }));
        lamp.position.set(x, y, z);
        group.add(rope, lamp);
        out.lanterns.push(lamp);
        glows.push({ x, z, color: "#ffa24a", size: 6, k: 0.3 });
      }
    } else if (p.id === "crystals") {
      const mound = new T.Mesh(lumpy(new T.SphereGeometry(7.5, 14, 8, 0, TAU, 0, Math.PI / 2), 0.15, 8), std("#4a4b5e"));
      mound.scale.y = 0.38;
      mound.position.set(p.x, 0, p.z);
      group.add(mound);
      for (const b of bits) {
        const c = b.hue < 0.5 ? "#6cc8ff" : "#c08cff";
        const cr = new T.Mesh(new T.OctahedronGeometry(0.9 * b.s, 0), new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.1, flatShading: true }));
        cr.scale.set(1, 2.6, 1);
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        cr.position.set(b.x, 2.2 + (1 - d / 8) * 1.8 + b.s * 0.8, b.z);
        cr.rotation.set((hash(b.rot) - 0.5) * 0.5, b.rot, (hash(b.rot + 2) - 0.5) * 0.5);
        group.add(cr);
        out.crystals.push(cr);
        glows.push({ x: b.x, z: b.z, color: c, size: 6 * b.s, k: 0.45 });
      }
    }
  }
  return out;
}

function makeWater(p) {
  const material = new T.ShaderMaterial({
    uniforms: { uTime: U.uTime, uDawn: U.uDawn, uMoon: { value: new T.Vector3(-0.55, 0.42, -0.72).normalize() }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uFire: U.uFire, uC: { value: new T.Vector2(p.x, p.z) } },
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDawn, uFogDensity; uniform vec3 uMoon, uFogColor; uniform vec2 uC;
      varying vec3 vW;
      ${GLSL_NOISE}
      void main() {
        vec2 q = vW.xz;
        float r = length(q - uC);
        vec3 n = normalize(vec3((vnoise(q * 1.2 + uTime * 0.6) - 0.5) * 0.18, 1.0, (vnoise(q * 1.3 - uTime * 0.5 + 7.0) - 0.5) * 0.18));
        // кольца от кувшинок
        n.xz += sin(r * 4.0 - uTime * 2.2) * 0.02 * smoothstep(10.0, 3.0, r);
        n = normalize(n);
        vec3 v = normalize(vW - cameraPosition);
        vec3 rf = reflect(v, n);
        float fres = pow(1.0 - max(dot(-v, n), 0.0), 3.0);
        vec3 sky = mix(vec3(0.03, 0.05, 0.14), vec3(0.4, 0.55, 0.85), uDawn);
        vec3 col = mix(vec3(0.01, 0.03, 0.06), sky, 0.3 + fres * 0.7);
        float moon = pow(max(dot(rf, uMoon), 0.0), 140.0) * 6.0 + pow(max(dot(rf, uMoon), 0.0), 12.0) * 0.25;
        col += vec3(0.85, 0.9, 1.0) * moon * (1.0 - uDawn * 0.7);
        float sparkle = step(0.985, vnoise(q * 6.0 + uTime * 1.5)) * 1.5;
        col += vec3(0.6, 0.7, 1.0) * sparkle * (0.5 + moon);
        float edge = smoothstep(9.2, 10.5, r);
        col = mix(col, vec3(0.12, 0.2, 0.25), edge * 0.5);
        float fz = length(vW - cameraPosition);
        col = mix(col, uFogColor, 1.0 - exp(-uFogDensity * uFogDensity * fz * fz));
        gl_FragColor = vec4(col, 0.94);
      }`,
  });
  const mesh = new T.Mesh(new T.CircleGeometry(10.6, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(p.x, 0.06, p.z);
  return mesh;
}

// ---------- Постаменты усилений ----------
function makeShrines(group, glows) {
  const out = {};
  const stone = new T.MeshStandardMaterial({ color: "#6a6e84", roughness: 0.85, flatShading: true });
  for (const p of PLACES) {
    const buff = BUFFS[SHRINES[p.id].buff];
    const g = new T.Group();
    g.position.set(p.shrineX, 0, p.shrineZ);
    const base = new T.Mesh(new T.CylinderGeometry(2, 2.2, 0.6, 8), stone);
    base.position.y = 0.3;
    const col = new T.Mesh(new T.CylinderGeometry(0.75, 0.9, 2.1, 8), stone);
    col.position.y = 1.65;
    const bowl = new T.Mesh(new T.CylinderGeometry(1.35, 0.8, 0.5, 10), stone);
    bowl.position.y = 2.9;
    const orbMat = new T.MeshBasicMaterial({ color: hot(buff.color, 2.4) });
    const orb = new T.Mesh(new T.SphereGeometry(0.75, 20, 14), orbMat);
    orb.position.y = 4.1;
    const ring = new T.Mesh(new T.TorusGeometry(1.15, 0.06, 6, 40), new T.MeshBasicMaterial({ color: hot(buff.color, 1.8) }));
    ring.position.y = 4.1;
    g.add(base, col, bowl, orb, ring);
    group.add(g);
    const glow = { x: p.shrineX, z: p.shrineZ, color: buff.color, size: 9, k: 0.6 };
    glows.push(glow);
    out[p.id] = { g, orb, orbMat, ring, color: new T.Color(buff.color), glow, rest: 0 };
  }
  return out;
}

// ---------- Лагерь ----------
function makeCamp(layout, group) {
  const wood = new T.MeshStandardMaterial({ color: "#4e3626", roughness: 0.95, flatShading: true });
  const woodEnd = new T.MeshStandardMaterial({ color: "#c9a06a", roughness: 0.8 });
  const stone = new T.MeshStandardMaterial({ color: "#7a7f8f", roughness: 0.9, flatShading: true });
  // камни вокруг костра
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU;
    const r = new T.Mesh(lumpy(new T.DodecahedronGeometry(0.55, 0), 0.3, i), stone);
    r.position.set(Math.cos(a) * 2.05, 0.25, Math.sin(a) * 2.05);
    r.scale.set(1, 0.7, 1);
    r.rotation.y = a;
    group.add(r);
  }
  // шалашик из поленьев
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const log = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 2.6, 6), wood);
    log.position.set(Math.cos(a) * 0.6, 0.95, Math.sin(a) * 0.6);
    log.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    group.add(log);
  }
  const embersBed = new T.Mesh(new T.CircleGeometry(1.6, 20), new T.MeshBasicMaterial({ color: hot("#ff6a1a", 1.6) }));
  embersBed.rotation.x = -Math.PI / 2;
  embersBed.position.y = 0.06;
  group.add(embersBed);
  // брёвна-скамейки
  for (const b of layout.benches) {
    const g = new T.Group();
    const log = new T.Mesh(new T.CylinderGeometry(0.45, 0.48, 3.4, 9), wood);
    log.rotation.z = Math.PI / 2;
    log.position.y = 0.45;
    const e1 = new T.Mesh(new T.CircleGeometry(0.43, 9), woodEnd);
    e1.position.set(1.71, 0.45, 0);
    e1.rotation.y = Math.PI / 2;
    const e2 = e1.clone();
    e2.position.x = -1.71;
    e2.rotation.y = -Math.PI / 2;
    g.add(log, e1, e2);
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot + Math.PI / 2;
    group.add(g);
  }
  // палатка-шалаш: треугольная призма, вход светится изнутри
  const tent = new T.Group();
  const tri = new T.Shape();
  tri.moveTo(-2, 0);
  tri.lineTo(2, 0);
  tri.lineTo(0, 2.9);
  tri.closePath();
  const tentGeo = new T.ExtrudeGeometry(tri, { depth: 4, bevelEnabled: false }).translate(0, 0, -2);
  const cloth = new T.Mesh(tentGeo, new T.MeshStandardMaterial({ color: "#3f7a8a", roughness: 0.85, flatShading: true }));
  const flap = new T.Shape();
  flap.moveTo(-0.9, 0);
  flap.lineTo(0.9, 0);
  flap.lineTo(0, 1.9);
  flap.closePath();
  const door = new T.Mesh(new T.ShapeGeometry(flap), new T.MeshBasicMaterial({ color: hot("#ffb060", 1.6) }));
  door.position.z = 2.01;
  const ridge = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 4.6, 6), wood);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = 2.92;
  const stripeGeo = new T.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15);
  const stripeMat = new T.MeshStandardMaterial({ color: "#f2d9a8", roughness: 0.85, flatShading: true });
  for (const z of [-1.4, 1.4]) {
    const st = new T.Mesh(stripeGeo, stripeMat);
    st.scale.set(1.01, 1.01, 1);
    st.position.z = z;
    tent.add(st);
  }
  tent.add(cloth, door, ridge);
  tent.position.set(-7.5, 0, -11.5);
  tent.rotation.y = Math.atan2(7.5, 11.5);
  group.add(tent);
  // поленница
  for (let i = 0; i < 6; i++) {
    const log = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 1.8, 7), wood);
    log.rotation.x = Math.PI / 2;
    log.position.set(9.5 + (i % 3) * 0.46, 0.22 + Math.floor(i / 3) * 0.4, -3 + (i >= 3 ? 0.23 : 0));
    group.add(log);
  }
  return { embersBed };
}

// ---------- Участок сада ----------
const SPOTS = { house: [-36, 36, -108, 108, 0], lamp: [-72, 72, -144], feeder: [144, -126], flowers: [-158, 158] };
function spotOf(id, n) {
  const out = Math.atan2(GARDEN.z, GARDEN.x);
  const a = out + (SPOTS[id][n] * Math.PI) / 180;
  const d = id === "flowers" ? 4.3 : GARDEN.size + 2.1;
  return { x: GARDEN.x + Math.cos(a) * d, z: GARDEN.z + Math.sin(a) * d, face: Math.atan2(GARDEN.x - (GARDEN.x + Math.cos(a)), GARDEN.z - (GARDEN.z + Math.sin(a))) };
}
function makeGardenBase(group, glows) {
  const post = new T.MeshStandardMaterial({ color: "#6e4b33", roughness: 0.9 });
  const bulb = new T.MeshBasicMaterial({ color: hot("#ffb45c", 2.2) });
  for (let j = 0; j < 12; j++) {
    const a = ((j + 0.5) / 12) * TAU;
    const x = GARDEN.x + Math.cos(a) * (GARDEN.size + 0.3), z = GARDEN.z + Math.sin(a) * (GARDEN.size + 0.3);
    const toCamp = Math.atan2(-GARDEN.z, -GARDEN.x);
    let da = Math.abs(((a - toCamp + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (da < 0.45) continue; // вход со стороны лагеря свободен
    const p = new T.Mesh(new T.CylinderGeometry(0.12, 0.15, 1.3, 6), post);
    p.position.set(x, 0.65, z);
    const b = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), bulb);
    b.position.set(x, 1.42, z);
    group.add(p, b);
  }
  glows.push({ x: GARDEN.x, z: GARDEN.z, color: "#ffc070", size: 18, k: 0.18 });
}

// Постройки ставятся заново, когда их число меняется
export function makeGarden(group) {
  const holder = new T.Group();
  group.add(holder);
  const mats = {
    wall: new T.MeshStandardMaterial({ color: "#c08a58", roughness: 0.85, flatShading: true }),
    roof: new T.MeshStandardMaterial({ color: "#c24f3c", roughness: 0.75, flatShading: true }),
    stone: new T.MeshStandardMaterial({ color: "#6f7180", roughness: 0.9, flatShading: true }),
    door: new T.MeshStandardMaterial({ color: "#5a3b29", roughness: 0.9 }),
    win: new T.MeshBasicMaterial({ color: hot("#ffc46a", 2.4) }),
    iron: new T.MeshStandardMaterial({ color: "#3a3d4a", roughness: 0.5, metalness: 0.6 }),
    lamp: new T.MeshBasicMaterial({ color: hot("#ffe2a0", 3) }),
    soil: new T.MeshStandardMaterial({ color: "#4a3426", roughness: 1 }),
    feeder: new T.MeshBasicMaterial({ color: hot("#96e6ff", 2.2) }),
  };
  const roofGeo = (() => {
    const s = new T.Shape();
    s.moveTo(-1, 0);
    s.lineTo(1, 0);
    s.lineTo(0, 1);
    s.closePath();
    return new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  })();
  const flowerCols = ["#ff7ad0", "#7ad8ff", "#ffd36a", "#c69bff"];
  const makers = {
    house: (g) => {
      const base = new T.Mesh(new T.BoxGeometry(3.3, 0.45, 3.1), mats.stone);
      base.position.y = 0.22;
      const walls = new T.Mesh(new T.BoxGeometry(2.8, 2.3, 2.6), mats.wall);
      walls.position.y = 1.6;
      const roof = new T.Mesh(roofGeo, mats.roof);
      roof.scale.set(1.75, 1.5, 3.0);
      roof.position.y = 2.75;
      const door = new T.Mesh(new T.BoxGeometry(0.75, 1.3, 0.08), mats.door);
      door.position.set(-0.6, 1.1, 1.32);
      const win = new T.Mesh(new T.BoxGeometry(0.8, 0.7, 0.08), mats.win);
      win.position.set(0.6, 1.75, 1.32);
      const chim = new T.Mesh(new T.BoxGeometry(0.4, 0.9, 0.4), mats.stone);
      chim.position.set(0.7, 3.4, -0.5);
      g.add(base, walls, roof, door, win, chim);
      return { glow: "#ffb45c", size: 6 };
    },
    lamp: (g) => {
      const pole = new T.Mesh(new T.CylinderGeometry(0.1, 0.16, 4.2, 8), mats.iron);
      pole.position.y = 2.1;
      const arm = new T.Mesh(new T.BoxGeometry(0.9, 0.08, 0.08), mats.iron);
      arm.position.set(0.35, 4.1, 0);
      const cage = new T.Mesh(new T.CylinderGeometry(0.32, 0.22, 0.6, 6), mats.iron);
      cage.position.set(0.75, 3.75, 0);
      const light = new T.Mesh(new T.SphereGeometry(0.26, 12, 8), mats.lamp);
      light.position.set(0.75, 3.7, 0);
      g.add(pole, arm, cage, light);
      return { glow: "#ffe0a0", size: 9 };
    },
    flowers: (g) => {
      const bed = new T.Mesh(new T.CylinderGeometry(1.3, 1.4, 0.3, 14), mats.soil);
      bed.position.y = 0.15;
      g.add(bed);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, r = i === 0 ? 0 : 0.5 + (i % 2) * 0.45;
        const c = flowerCols[i % 4];
        const stem = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.7, 4), mats.door);
        stem.position.set(Math.cos(a) * r, 0.6, Math.sin(a) * r);
        const head = new T.Mesh(new T.SphereGeometry(0.17, 8, 6), new T.MeshBasicMaterial({ color: hot(c, 2) }));
        head.position.set(Math.cos(a) * r, 1.0, Math.sin(a) * r);
        g.add(stem, head);
      }
      return { glow: "#ff8ad8", size: 5 };
    },
    feeder: (g) => {
      const pole = new T.Mesh(new T.CylinderGeometry(0.09, 0.11, 2.2, 6), mats.door);
      pole.position.y = 1.1;
      const box = new T.Mesh(new T.BoxGeometry(1, 0.6, 0.8), mats.wall);
      box.position.y = 2.4;
      const roof = new T.Mesh(roofGeo, mats.roof);
      roof.scale.set(0.7, 0.5, 1.0);
      roof.position.y = 2.7;
      const tray = new T.Mesh(new T.CylinderGeometry(0.35, 0.3, 0.14, 10), mats.feeder);
      tray.position.set(0, 2.05, 0.5);
      g.add(pole, box, roof, tray);
      return { glow: "#96e6ff", size: 5 };
    },
  };
  let key = "";
  const glows = [];
  return {
    glows,
    update(build) {
      const k = JSON.stringify(build);
      if (k === key) return false;
      key = k;
      holder.clear();
      glows.length = 0;
      for (const id of ["house", "lamp", "flowers", "feeder"]) {
        for (let n = 0; n < (build[id] || 0) && n < SPOTS[id].length; n++) {
          const s = spotOf(id, n);
          const g = new T.Group();
          const info = makers[id](g);
          g.position.set(s.x, 0, s.z);
          g.rotation.y = s.face;
          holder.add(g);
          glows.push({ x: s.x, z: s.z, color: info.glow, size: info.size, k: 0.45 });
        }
      }
      return true;
    },
  };
}

export function buildWorld(scene, layout, grassMax) {
  const group = new T.Group();
  scene.add(group);
  const glows = []; // неподвижные пятна света на земле (грибы, кристаллы, постаменты)
  const ground = makeGround(layout);
  group.add(ground);
  const grass = makeGrass(grassMax);
  group.add(grass);
  makeTrees(layout, group);
  makeProps(layout, group, glows);
  const places = makePlaces(layout, group, glows);
  const shrines = makeShrines(group, glows);
  const camp = makeCamp(layout, group);
  makeGardenBase(group, glows);
  const garden = makeGarden(group);
  return {
    group,
    grass,
    glows,
    places,
    shrines,
    camp,
    garden,
    setGrass(k) {
      grass.geometry.instanceCount = Math.floor(grass.userData.max * k);
      grass.visible = k > 0;
    },
    update(t, run) {
      for (const r of places.runes) r.material.color.setScalar(1.6 + Math.sin(t * 1.3) * 0.8).multiply(new T.Color("#b48cff"));
      places.crystals.forEach((c, i) => (c.material.emissiveIntensity = 1.1 + Math.sin(t * 1.7 + i) * 0.4));
      places.lanterns.forEach((l, i) => (l.position.y += Math.sin(t * 1.4 + i) * 0.003));
      for (const id in shrines) {
        const s = shrines[id];
        const rest = run ? run.shrineRest[id] || 0 : 0;
        const on = rest > 0 ? 0.25 : 1;
        s.rest += (on - s.rest) * 0.08;
        s.orbMat.color.copy(s.color).multiplyScalar(2.4 * s.rest);
        s.orb.position.y = 4.1 + Math.sin(t * 1.6 + s.g.position.x) * 0.25;
        s.ring.position.y = s.orb.position.y;
        s.ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.4;
        s.ring.rotation.y = t * 0.9;
        s.ring.visible = rest <= 0;
        s.glow.k = 0.6 * s.rest;
      }
    },
  };
}

export { spotOf, GRASS_WIN };
