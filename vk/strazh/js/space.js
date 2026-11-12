// Окружение «Стража орбиты»: туманность (один раз запекается в кубическую текстуру),
// звёзды, Солнце, Земля с облаками и ночными огнями, планета с кольцами и сама станция.
// Турель не двигается с места, поэтому всё далёкое можно считать неподвижным фоном.
import { T, TAU, V, metal, lit, GEO, part, at, flare, hot } from "./kit.js?v=7632fe77";

// Солнце слева над горизонтом: в обычном обзоре его нет, оно появляется при повороте влево.
export const SUN_DIR = new T.Vector3(-0.89, 0.352, -0.289).normalize();

const NOISE3 = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm(vec3 p, int octaves) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += a * vnoise(p);
    p = p * 2.02 + vec3(13.1, 7.7, 3.3);
    a *= 0.5;
  }
  return s;
}`;
const DIR_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FINISH = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- Небо ----------
function bakeSky(renderer) {
  const weak = Math.min(screen.width, screen.height) < 500 || (navigator.deviceMemory || 8) <= 2;
  const size = Math.min(renderer.capabilities.maxCubemapSize || 1024, weak ? 512 : 1024);
  const target = new T.WebGLCubeRenderTarget(size, { generateMipmaps: false, depthBuffer: false });
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthTest: false,
    depthWrite: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: DIR_VERTEX,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 sunDir;
      ${NOISE3}
      void main() {
        vec3 d = normalize(vDir);
        // Полоса вдоль наклонного большого круга, как у Млечного Пути.
        float lat = dot(d, normalize(vec3(0.32, 0.86, 0.4)));
        float band = exp(-lat * lat * 6.5);
        vec3 q = d * 2.3;
        // Число октав подобрано под размер текстуры: мельче шум превращается в рябь.
        vec3 warp = vec3(fbm(q + 11.0, 4), fbm(q + 37.0, 4), fbm(q + 71.0, 4)) - 0.5;
        float n1 = fbm(q * 1.35 + warp * 1.7, 5);
        float n2 = fbm(q * 3.1 - warp * 2.3 + 5.0, 4);
        float n3 = fbm(q * 5.2 + warp * 3.0 + 19.0, 3);
        float gas = smoothstep(0.44, 0.8, n1 * (0.42 + 0.9 * band));
        float wisps = smoothstep(0.46, 0.85, n2) * (0.3 + 0.7 * band);
        float dust = smoothstep(0.42, 0.7, n3) * band;
        vec3 violet = vec3(0.34, 0.08, 0.46), teal = vec3(0.03, 0.27, 0.38), rose = vec3(0.6, 0.12, 0.24);
        vec3 gasColor = mix(violet, teal, smoothstep(0.38, 0.62, fbm(q * 0.7 + 3.0, 3)));
        gasColor = mix(gasColor, rose, smoothstep(0.52, 0.76, fbm(q * 0.9 + 40.0, 3)) * 0.75);
        vec3 col = vec3(0.003, 0.005, 0.012);
        col += gasColor * gas * 0.2;
        col += mix(teal, vec3(0.55, 0.8, 1.0), 0.45) * wisps * gas * 0.22;
        col += vec3(0.012, 0.016, 0.03) * band;
        col *= 1.0 - dust * 0.7;
        // Тёплая дымка вокруг Солнца.
        col += vec3(0.6, 0.32, 0.1) * pow(max(dot(d, sunDir), 0.0), 5.0) * (0.06 + 0.1 * n1);
        // Звёздная пыль: мелкие точки, яркие звёзды рисуются отдельно и остаются чёткими.
        vec3 cell = d * 250.0;
        float h = hash13(floor(cell));
        float star = step(0.9962, h) * smoothstep(0.4, 0.0, length(fract(cell) - 0.5));
        col += vec3(0.75, 0.86, 1.0) * star * (0.25 + 0.75 * band) * fract(h * 91.7);
        col = pow(col, vec3(1.0 / 2.2));
        col += (hash13(d * 913.0) - 0.5) / 255.0; // без этого на тёмных переходах видны полосы
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const scene = new T.Scene();
  scene.add(new T.Mesh(new T.BoxGeometry(20, 20, 20), material));
  new T.CubeCamera(0.1, 100, target).update(renderer, scene);
  material.dispose();
  return target.texture;
}

function addSky(scene, map) {
  const sky = new T.Mesh(
    new T.SphereGeometry(2400, 32, 16),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: { map: { value: map } },
      vertexShader: DIR_VERTEX,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform samplerCube map;
        void main() {
          gl_FragColor = vec4(pow(textureCube(map, normalize(vDir)).rgb, vec3(2.2)), 1.0);
          ${FINISH}
        }`,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
}

function addStars(scene, count, size, gain) {
  const positions = [];
  const colors = [];
  const color = new T.Color();
  for (let i = 0; i < count; i++) {
    const azimuth = i * 2.39996323 + size;
    const y = ((i + 0.5) / count) * 2 - 1;
    const r = Math.sqrt(1 - y * y);
    positions.push(1770 * r * Math.cos(azimuth), y * 1770, 1770 * r * Math.sin(azimuth));
    color.setHSL(0.54 + Math.sin(i * 123.3) * 0.14, 0.4, 0.63 + 0.27 * Math.sin(i * 17) ** 2);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  const stars = new T.Points(
    geometry,
    new T.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, toneMapped: false, color: new T.Color(gain, gain, gain) }),
  );
  stars.renderOrder = -9;
  scene.add(stars);
}

// ---------- Планеты ----------
function noiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  const texture = new T.DataTexture(data, size, size, T.RGBAFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const WORLD_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

// Земля видна только с одной стороны, поэтому рисунок суши и облаков считается в плоскости,
// касательной к точке под станцией. Шум берётся из маленькой текстуры: это дёшево даже для телефона.
function makeEarth(center, radius) {
  const axis = center.clone().multiplyScalar(-1).normalize();
  const capU = new T.Vector3().crossVectors(new T.Vector3(0, 0, -1), axis).normalize();
  const capV = new T.Vector3().crossVectors(axis, capU);
  const uniforms = {
    noiseMap: { value: noiseTexture() },
    center: { value: center },
    radius: { value: radius },
    sunDir: { value: SUN_DIR },
    capU: { value: capU },
    capV: { value: capV },
    time: { value: 0 },
  };
  const surface = new T.Mesh(
    new T.SphereGeometry(radius, 128, 80),
    new T.ShaderMaterial({
      uniforms,
      vertexShader: WORLD_VERTEX,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorld;
        uniform sampler2D noiseMap;
        uniform vec3 center, sunDir, capU, capV;
        uniform float time;
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return texture2D(noiseMap, (i + f + 0.5) / 256.0).r;
        }
        float fbm(vec2 p) {
          float a = 0.5, s = 0.0;
          for (int i = 0; i < 6; i++) {
            s += a * vn(p);
            p = p * 2.03 + vec2(17.3, 9.1);
            a *= 0.5;
          }
          return s;
        }
        // Два независимых шума за одну выборку: из красного и зелёного каналов.
        vec2 fbm4(vec2 p) {
          float a = 0.5;
          vec2 s = vec2(0.0);
          for (int i = 0; i < 4; i++) {
            vec2 c = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            s += a * texture2D(noiseMap, (c + f + 0.5) / 256.0).rg;
            p = p * 2.03 + vec2(11.7, 23.9);
            a *= 0.5;
          }
          return s;
        }
        void main() {
          vec3 n = normalize(vWorld - center);
          vec3 view = normalize(cameraPosition - vWorld);
          vec2 uv = vec2(dot(n, capU), dot(n, capV)) * 9.0;
          vec2 warp = fbm4(uv * 0.9 + 3.1) - 0.5;

          float h = fbm(uv * 0.8 + warp * 1.4);
          float land = smoothstep(0.5, 0.53, h);
          float peak = smoothstep(0.6, 0.74, h);
          float arid = smoothstep(0.42, 0.6, fbm4(uv * 0.55 + 40.0).g);
          vec3 sea = mix(vec3(0.006, 0.03, 0.1), vec3(0.01, 0.13, 0.2), smoothstep(0.38, 0.5, h));
          vec3 ground = mix(vec3(0.045, 0.16, 0.05), vec3(0.34, 0.25, 0.12), arid);
          ground = mix(ground, vec3(0.44, 0.42, 0.4), peak);
          vec3 albedo = mix(sea, ground, land);

          vec2 cuv = uv * 1.5 + warp * 2.0 + vec2(time * 0.006, time * 0.002);
          float cloud = smoothstep(0.48, 0.7, fbm(cuv));
          vec2 toSun = vec2(dot(sunDir, capU), dot(sunDir, capV));
          float shade = smoothstep(0.48, 0.7, fbm(cuv + toSun * 0.05));

          float ndl = dot(n, sunDir);
          float day = smoothstep(-0.1, 0.2, ndl);
          vec3 sunColor = mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.95, 0.88), smoothstep(-0.02, 0.32, ndl));
          vec3 col = albedo * (1.0 - shade * 0.5 * (1.0 - cloud));
          col = mix(col, vec3(0.9, 0.93, 1.0), cloud * 0.93);
          col *= sunColor * day * (0.2 + 0.95 * max(ndl, 0.0));

          // Солнечная дорожка на воде.
          vec3 halfway = normalize(sunDir + view);
          float glint = pow(max(dot(n, halfway), 0.0), 70.0) * (1.0 - land) * (1.0 - cloud) * day;
          col += vec3(1.0, 0.82, 0.58) * glint * 1.3;

          // Ночная сторона: города светятся только на суше и только без облаков.
          float city = smoothstep(0.6, 0.86, vn(uv * 46.0)) * smoothstep(0.42, 0.66, vn(uv * 7.0 + 9.0));
          col += vec3(1.0, 0.6, 0.24) * city * land * (1.0 - peak) * (1.0 - day) * (1.0 - cloud) * 2.2;
          col += vec3(0.004, 0.008, 0.02) * (1.0 - day);

          // Дымка воздуха у края диска.
          float rim = pow(1.0 - max(dot(n, view), 0.0), 2.4);
          vec3 air = mix(vec3(1.0, 0.4, 0.16), vec3(0.2, 0.5, 1.0), smoothstep(-0.05, 0.3, ndl));
          col = mix(col, air * (0.1 + 0.95 * day), rim * 0.85 * smoothstep(-0.3, 0.05, ndl));
          gl_FragColor = vec4(col, 1.0);
          ${FINISH}
        }`,
    }),
  );
  surface.position.copy(center);
  // Свечение атмосферы над краем планеты: яркость падает с высотой луча над поверхностью.
  const air = new T.Mesh(
    new T.SphereGeometry(radius + 52, 128, 80),
    new T.ShaderMaterial({
      uniforms,
      side: T.BackSide,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: WORLD_VERTEX,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorld;
        uniform vec3 center, sunDir;
        uniform float radius;
        void main() {
          vec3 ray = normalize(vWorld - cameraPosition);
          vec3 nearest = cameraPosition + ray * dot(center - cameraPosition, ray);
          float height = length(nearest - center) - radius;
          float glow = exp(-max(height, 0.0) / 7.5) * smoothstep(50.0, 12.0, height);
          float ndl = dot(normalize(nearest - center), sunDir);
          vec3 tone = mix(vec3(1.0, 0.36, 0.12), vec3(0.24, 0.55, 1.0), smoothstep(-0.12, 0.26, ndl));
          gl_FragColor = vec4(tone * glow * smoothstep(-0.3, 0.1, ndl) * 1.35, 1.0);
          ${FINISH}
        }`,
    }),
  );
  air.position.copy(center);
  return { surface, air, uniforms };
}

function makeRinged(radius, position) {
  const planet = new T.Group();
  planet.position.copy(position);
  const geometry = new T.SphereGeometry(radius, 48, 32);
  const vertices = geometry.attributes.position;
  const colors = new Float32Array(vertices.count * 3);
  const [low, high, cloud] = ["#9264cf", "#d59183", "#f8c7a3"].map((color) => new T.Color(color));
  const color = new T.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) / radius;
    const y = vertices.getY(i) / radius;
    const z = vertices.getZ(i) / radius;
    const ridges = Math.sin(y * 36 + Math.sin(x * 6 + z * 7) * 2.7);
    color.copy(low).lerp(high, 0.5 + ridges * 0.43);
    color.lerp(cloud, T.MathUtils.smoothstep(ridges + Math.sin(z * 13 + x * 7) * 0.58, 0.73, 1.45) * 0.74);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  planet.add(new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, emissive: low, emissiveIntensity: 0.1, envMapIntensity: 0 })));
  // Кольца — один диск: полосы и их мягкие края считает шейдер, поэтому нет зубцов.
  const rings = new T.Mesh(
    new T.RingGeometry(radius * 1.25, radius * 2.05, 96),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: { radius: { value: radius } },
      vertexShader: /* glsl */ `
        varying vec2 vPlane;
        void main() {
          vPlane = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vPlane;
        uniform float radius;
        float band(float r, float a, float b) {
          float soft = fwidth(r) * 1.5 + 0.004;
          return smoothstep(a - soft, a + soft, r) * (1.0 - smoothstep(b - soft, b + soft, r));
        }
        void main() {
          float r = length(vPlane) / radius;
          vec3 col = vec3(0.0);
          float alpha = 0.0, part;
          part = band(r, 1.3, 1.48) * 0.52; col += vec3(0.47, 0.37, 0.97) * part; alpha += part;
          part = band(r, 1.52, 1.77) * 0.6; col += vec3(0.86, 0.5, 0.34) * part; alpha += part;
          part = band(r, 1.81, 2.0) * 0.42; col += vec3(0.35, 0.62, 1.0) * part; alpha += part;
          float grain = 0.82 + 0.18 * sin(r * 240.0);
          gl_FragColor = vec4(col / max(alpha, 0.001) * grain, alpha);
          ${FINISH}
        }`,
    }),
  );
  rings.rotation.set(1.06, -0.18, 0.43);
  planet.add(rings);
  return planet;
}

// ---------- Станция ----------
function panelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#9db7e8";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const shade = ctx.createLinearGradient(x * 64, y * 32, x * 64 + 64, y * 32 + 32);
      shade.addColorStop(0, "#16356f");
      shade.addColorStop(1, "#0a1c45");
      ctx.fillStyle = shade;
      ctx.fillRect(x * 64 + 2, y * 32 + 2, 60, 28);
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildStation() {
  const station = new T.Group();
  const hull = metal("#44536e");
  const dark = metal("#1b2435");
  const pale = metal("#93a7c2", { metalness: 0.6, roughness: 0.34 });
  const cyan = lit("#47c5ff", 2.1);
  const warm = lit("#ffd08a", 1.5);
  const blinkers = [];
  const beacon = (parent, x, y, z, color, phase, size = 2.6) => {
    const light = at(flare(color, size), x, y, z);
    parent.add(light);
    blinkers.push({ light, phase });
  };

  // Площадка турели прямо под стрелком.
  station.add(at(part(GEO.cyl, hull, 9, 0.8, 9), 0, -4.4, 0), at(part(GEO.cyl, dark, 3.4, 3, 3.4), 0, -6.2, 0));
  const track = at(part(GEO.wave, cyan, 8.4, 8.4, 3), 0, -3.95, 0);
  track.rotation.x = Math.PI / 2;
  station.add(track);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * TAU;
    const plate = at(part(GEO.box, metal("#324967"), 0.82, 0.5, 3.8), Math.cos(angle) * 8.4, -4.25, Math.sin(angle) * 8.4);
    plate.rotation.y = -angle + Math.PI / 2;
    station.add(plate);
  }
  station.add(at(part(GEO.cyl, dark, 16, 3.6, 16), 0, -9.4, 0));
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * TAU + 0.3;
    station.add(at(part(GEO.box, cyan, 0.5, 0.12, 0.5), Math.cos(angle) * 14.6, -7.55, Math.sin(angle) * 14.6));
  }

  // Жилое кольцо медленно вращается вокруг турели: по нему видно, что станция живая.
  const wheel = new T.Group();
  const tube = new T.Mesh(new T.TorusGeometry(47, 2.5, 8, 48), hull);
  tube.rotation.x = Math.PI / 2;
  wheel.add(tube);
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * TAU;
    if (i % 3 === 0) continue;
    const pane = at(part(GEO.box, warm, 1.5, 0.35, 0.5), Math.cos(angle) * 47, 2.45, Math.sin(angle) * 47);
    pane.rotation.y = -angle + Math.PI / 2;
    wheel.add(pane);
  }
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * TAU + 0.4;
    const spoke = at(part(GEO.box, pale, 1.1, 1.1, 31), Math.cos(angle) * 31, 0, Math.sin(angle) * 31);
    spoke.rotation.y = -angle + Math.PI / 2;
    const tank = at(part(GEO.ball, pale, 2.2, 2.2, 3.4), Math.cos(angle) * 27, 1.5, Math.sin(angle) * 27);
    tank.rotation.y = -angle + Math.PI / 2;
    const mast = at(part(GEO.cyl, dark, 0.22, 6, 0.22), Math.cos(angle) * 47, 5.2, Math.sin(angle) * 47);
    wheel.add(spoke, tank, mast);
    beacon(wheel, Math.cos(angle) * 47, 8.6, Math.sin(angle) * 47, hot("#ffffff", 2.2), i * 0.25, 3.2);
  }
  wheel.position.y = -10.5;
  station.add(wheel);

  // Солнечные крылья слева и справа, ниже кольца.
  const cells = new T.MeshStandardMaterial({ map: panelTexture(), metalness: 0.8, roughness: 0.26, emissive: "#0b2a6a", emissiveIntensity: 0.3 });
  for (const side of [-1, 1]) {
    station.add(at(part(GEO.box, pale, 108, 0.9, 0.9), side * 68, -16, 0));
    for (let i = 0; i < 3; i++) {
      for (const edge of [-1, 1]) {
        const panel = at(part(GEO.box, cells, 17, 0.2, 13), side * (66 + i * 20), -16, edge * 8.2);
        panel.rotation.x = -0.32;
        station.add(panel);
      }
    }
    beacon(station, side * 122, -15.4, 0, hot(side < 0 ? "#ff4d4d" : "#52ff8f", 2.4), 0.5 + side * 0.25);
  }
  return {
    station,
    update(t, dt) {
      wheel.rotation.y += dt * 0.035;
      for (const { light, phase } of blinkers) light.material.opacity = (t * 0.55 + phase) % 1 < 0.12 ? 1 : 0.04;
    },
  };
}

// Отражения на металле: снизу синий свет Земли, сверху слабая туманность, сбоку Солнце.
function makeEnvironment(renderer) {
  const scene = new T.Scene();
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: DIR_VERTEX,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 sunDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = d.y * 0.5 + 0.5;
        vec3 col = mix(vec3(0.2, 0.42, 0.95), vec3(0.07, 0.05, 0.15), smoothstep(0.25, 0.6, up));
        col += vec3(30.0, 25.0, 18.0) * smoothstep(0.96, 0.995, dot(d, sunDir));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new T.Mesh(new T.SphereGeometry(10, 32, 16), material));
  const pmrem = new T.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  material.dispose();
  return texture;
}

export function buildSpace(renderer, scene) {
  addSky(scene, bakeSky(renderer));
  addStars(scene, 1700, 1.45, 1);
  addStars(scene, 150, 2.3, 1.5);
  addStars(scene, 16, 3.6, 2.6);

  const sun = new T.Group();
  sun.position.copy(SUN_DIR).multiplyScalar(2000);
  sun.add(flare(hot("#fff3d6", 9), 170), flare(hot("#ffc98a", 1.1), 950), flare(hot("#ffe2b0", 1.3), 2500, 44));
  scene.add(sun);

  const earth = makeEarth(V(130, -949, -575), 900);
  scene.add(earth.surface, earth.air, makeRinged(98, V(510, 725, -1147)));
  const { station, update } = buildStation();
  scene.add(station);
  scene.environment = makeEnvironment(renderer);
  scene.environmentIntensity = 0.75;

  return {
    update(t, dt) {
      earth.uniforms.time.value = t;
      update(t, dt);
    },
  };
}
