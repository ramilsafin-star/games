// Небо и море «Маяка»: два шейдера. Небо — прямоугольник на весь экран позади сцены,
// море — большая плоскость с бегущими бликами, пятнами света от лучей и вспышки, туманом и пеной у берега.
// Цвета пишутся линейными: тон и sRGB накладывает OutputPass в конце.
import * as T from "../vendor/three/three.module.min.js?v=cd4dd037";

const NOISE = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

// ---------- Небо ----------
export function makeSky() {
  const uniforms = {
    uTime: { value: 0 },
    uHorizon: { value: 0.7 }, // высота горизонта на экране, −1..1
    uAspect: { value: 1 },
    uMoon: { value: new T.Vector2(0.4, 0.86) }, // где луна на экране, −1..1
    uDawn: { value: 0 }, // 0 — ночь, 1 — рассвет
    uFlash: { value: 0 },
    uStar: { value: new T.Vector4(0, 0, 0, 0) }, // падающая звезда: x, y, ход 0..1, яркость
    uStorm: { value: 0 }, // гроза: тучи закрывают звёзды и луну
    uBolt: { value: new T.Vector2(0, 0) }, // молния: где по горизонтали экрана, яркость
  };
  const material = new T.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uHorizon;
      varying vec2 vPos;
      void main() {
        // прямоугольник закрывает только небо: всё, что ниже горизонта, рисовать незачем
        float low = max(-1.0, uHorizon - 0.12);
        vPos = vec2(position.x, mix(low, 1.0, position.y * 0.5 + 0.5));
        gl_Position = vec4(vPos, 0.9999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vPos;
      uniform float uTime, uHorizon, uAspect, uDawn, uFlash, uStorm;
      uniform vec2 uMoon, uBolt;
      uniform vec4 uStar;
      ${NOISE}
      void main() {
        vec2 p = vec2(vPos.x * uAspect, vPos.y);
        float up = vPos.y - uHorizon; // высота над горизонтом
        // ночной градиент: у горизонта светлее и зеленее, выше — глубокий синий
        vec3 low = mix(vec3(0.075, 0.17, 0.30), vec3(0.95, 0.52, 0.28), uDawn);
        vec3 mid = mix(vec3(0.028, 0.065, 0.17), vec3(0.34, 0.30, 0.46), uDawn);
        vec3 high = mix(vec3(0.010, 0.022, 0.075), vec3(0.07, 0.11, 0.26), uDawn);
        float k = clamp(up / 0.55, 0.0, 1.0);
        vec3 col = mix(low, mid, smoothstep(0.0, 0.35, k));
        col = mix(col, high, smoothstep(0.3, 1.0, k));
        // звёзды: сетка, в каждой клетке — своя звезда, мерцает
        float stars = 0.0;
        for (int layer = 0; layer < 2; layer++) {
          float scale = layer == 0 ? 26.0 : 13.0;
          vec2 g = p * scale + float(layer) * 17.3;
          vec2 id = floor(g);
          vec2 f = fract(g) - 0.5;
          float seed = hash(id);
          if (seed > 0.45) {
            vec2 off = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.7;
            float d = length(f - off);
            float size = (layer == 0 ? 0.035 : 0.06) * (0.5 + seed);
            float tw = 0.65 + 0.35 * sin(uTime * (1.0 + seed * 3.0) + seed * 40.0);
            stars += smoothstep(size, 0.0, d) * tw * (layer == 0 ? 0.8 : 1.4);
          }
        }
        col += vec3(0.85, 0.92, 1.0) * stars * smoothstep(0.02, 0.2, up) * (1.0 - uDawn * 0.85);
        // луна с ореолом
        vec2 m = vec2((vPos.x - uMoon.x) * uAspect, vPos.y - uMoon.y);
        float md = length(m);
        float r = 0.052;
        float disc = smoothstep(r, r - 0.006, md);
        float crater = noise(m * 46.0 + 3.0) * 0.16 + noise(m * 21.0) * 0.12;
        vec3 moon = vec3(1.9, 1.75, 1.35) * (1.0 - crater);
        col += vec3(0.42, 0.50, 0.66) * exp(-md * 7.5) * 0.55;
        col += vec3(0.9, 0.85, 0.7) * exp(-md * 26.0) * 0.5;
        col = mix(col, moon, disc);
        // далёкие острова на горизонте
        float ridge = noise(vec2(p.x * 2.4 + 5.0, 1.0)) * 0.055 + noise(vec2(p.x * 9.0, 4.0)) * 0.014 - 0.022;
        float land = smoothstep(ridge + 0.004, ridge - 0.002, up);
        col = mix(col, mix(vec3(0.030, 0.062, 0.125), vec3(0.20, 0.15, 0.20), uDawn), land * step(0.0, up + 0.01));
        // падающая звезда
        if (uStar.w > 0.0) {
          vec2 a = vec2(uStar.x * uAspect, uStar.y);
          vec2 dir = normalize(vec2(-0.86, -0.5));
          vec2 q = p - (a + dir * uStar.z * 0.7);
          float along = dot(q, -dir);
          float side = length(q + dir * along);
          float trail = smoothstep(0.004, 0.0, side) * smoothstep(0.22, 0.0, along) * step(0.0, along);
          col += vec3(1.3, 1.25, 1.0) * trail * uStar.w;
        }
        col += vec3(0.5, 0.45, 0.3) * uFlash * 0.22;
        // гроза: клубящиеся тучи прячут звёзды и луну
        if (uStorm > 0.0) {
          vec2 q = vec2(p.x * 1.6 + uTime * 0.05, up * 3.2);
          float cloud = noise(q * 2.0) * 0.6 + noise(q * 4.3 + 3.0) * 0.3 + noise(q * 9.0) * 0.1;
          float cover = smoothstep(0.32, 0.72, cloud) * smoothstep(0.0, 0.12, up);
          vec3 sky = mix(vec3(0.035, 0.05, 0.09), vec3(0.10, 0.12, 0.18), cloud);
          col = mix(col, sky, uStorm * (0.55 + 0.45 * cover));
          // молния: светятся тучи и бьёт ломаная нить с неба к горизонту
          if (uBolt.y > 0.0) {
            col += vec3(0.55, 0.55, 0.85) * uBolt.y * (0.35 + 0.65 * cover) * uStorm;
            float y = vPos.y;
            float zig = (noise(vec2(y * 9.0, uBolt.x * 13.0)) - 0.5) * 0.16 + (noise(vec2(y * 31.0, uBolt.x * 7.0)) - 0.5) * 0.04;
            float d = abs((vPos.x - uBolt.x - zig * (1.0 - up)) * uAspect);
            float line = smoothstep(0.012, 0.0, d) + exp(-d * 60.0) * 0.5;
            col += vec3(1.6, 1.6, 2.2) * line * uBolt.y * step(0.0, up) * smoothstep(1.0, 0.75, vPos.y);
          }
        }
        // ниже горизонта неба нет: там тёмная суша (видна, только если камера заглянет за край берега)
        col = mix(col, vec3(0.008, 0.030, 0.026), smoothstep(-0.01, -0.06, up));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

// ---------- Море ----------
// Координаты в шейдере — «правила»: x вправо, z от берега в море (в сцене это −z).
export function makeSea() {
  const uniforms = {
    uTime: { value: 0 },
    uDepth: { value: 26 }, // длина бухты
    uEnd: { value: 30 }, // где море растворяется в дымке
    uSpot: { value: new T.Vector4(0, 10, 0, 1) }, // пятно главного луча: центр x, z; направление sin, cos
    uSpotAxes: { value: new T.Vector3(2.4, 1.25, 1) }, // полуоси и яркость
    uSpot2: { value: new T.Vector4(0, 10, 0, 1) }, // малый луч
    uSpot2Axes: { value: new T.Vector3(1.5, 0.8, 0) },
    uFlash: { value: 0 },
    uFlashRing: { value: -1 }, // радиус кольца вспышки, бегущего от маяка
    uLight: { value: new T.Vector2(0, -1.4) },
    uHarbor: { value: new T.Vector3(-3.7, 0.5, 3.4) },
    uFog: { value: new T.Vector3(14, 3, 0) }, // z, полуширина, сила
    uGust: { value: 0 }, // −1..1: ветер гонит рябь
    uMoonX: { value: 0.4 }, // где луна по горизонтали экрана, −1..1
    uDawn: { value: 0 },
    uRes: { value: new T.Vector2(1, 1) },
    uWarm: { value: new T.Vector3(1.0, 0.84, 0.52) }, // цвет луча (мастерская)
    uStorm: { value: 0 }, // гроза: вода темнее, рябь крупнее
    uBolt: { value: 0 }, // молния подсвечивает всю бухту
  };
  const material = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vP = vec2(world.x, -world.z);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vP;
      uniform float uTime, uDepth, uEnd, uFlash, uFlashRing, uGust, uMoonX, uDawn, uStorm, uBolt;
      uniform vec4 uSpot, uSpot2;
      uniform vec3 uSpotAxes, uSpot2Axes, uHarbor, uFog, uWarm;
      uniform vec2 uLight, uRes;
      ${NOISE}
      float spotMask(vec4 spot, vec3 axes, vec2 p, out float e) {
        vec2 d = p - spot.xy;
        float along = dot(d, spot.zw);
        float across = dot(d, vec2(spot.w, -spot.z));
        e = length(vec2(along / axes.x, across / axes.y));
        return 1.0 - smoothstep(0.62, 1.0, e);
      }
      void main() {
        vec2 p = vP;
        float t = uTime;
        float far = clamp(p.y / uDepth, 0.0, 1.4);
        vec2 wind = vec2(uGust * 1.6, 0.0) * t;
        // крупная зыбь — едва заметные светлые и тёмные пятна
        float swell = noise(p * 0.21 + vec2(0.03, 0.07) * t + wind * 0.15);
        // мелкая рябь, вытянутая вдоль берега: из неё получаются блики-штрихи
        float r1 = noise(p * vec2(0.85, 2.7) + vec2(0.10, -0.22) * t + wind * 0.6);
        float r2 = noise(p * vec2(2.0, 5.6) + vec2(-0.21, 0.36) * t + wind);
        float ripple = r1 * 0.58 + r2 * 0.42;
        ripple += (noise(p * vec2(3.1, 7.5) + vec2(0.5, -0.9) * t) - 0.5) * 0.25 * uStorm; // в грозу вода неспокойная
        float dash = smoothstep(0.64, 0.74, ripple);
        float glint = smoothstep(0.76, 0.90, ripple);
        // вода: у берега бирюзовее, вдали темнее
        vec3 col = mix(vec3(0.014, 0.078, 0.140), vec3(0.008, 0.032, 0.095), smoothstep(0.0, 1.0, far));
        col *= 0.80 + 0.40 * swell;
        col += vec3(0.022, 0.060, 0.100) * dash * (1.0 + abs(uGust));
        col += vec3(0.080, 0.150, 0.230) * glint * 0.55;
        // лунная дорожка: полоса бликов под луной, шире к берегу
        float sx = gl_FragCoord.x / uRes.x * 2.0 - 1.0;
        float band = exp(-pow((sx - uMoonX) / (0.09 + 0.26 * (1.0 - min(far, 1.0))), 2.0));
        col += vec3(0.55, 0.63, 0.76) * band * (dash * 0.30 + glint * 1.7) * (0.3 + 0.7 * min(far, 1.0)) * (1.0 - uDawn * 0.6);
        // огни гавани
        float hd = length(p - uHarbor.xy) / uHarbor.z;
        float harbor = 1.0 - smoothstep(0.0, 1.0, hd);
        col += vec3(0.50, 0.30, 0.10) * harbor * harbor * (0.22 + dash * 0.5 + glint * 1.6);
        col += vec3(0.60, 0.42, 0.16) * (smoothstep(0.92, 0.97, hd) - smoothstep(0.97, 1.02, hd)) * 0.30 * (0.55 + 0.45 * sin(atan(p.y - uHarbor.y, p.x - uHarbor.x) * 18.0 + t * 0.8));
        // пятна лучей: ровный свет в середине, мягкий спад к краю
        float e1, e2;
        float s1 = spotMask(uSpot, uSpotAxes.xyz, p, e1) * uSpotAxes.z;
        float s2 = spotMask(uSpot2, uSpot2Axes.xyz, p, e2) * uSpot2Axes.z;
        float fogK = uFog.z * (1.0 - smoothstep(uFog.y * 0.72, uFog.y * 1.05, abs(p.y - uFog.x)));
        float lit = max(s1, s2 * 0.66) * (1.0 - 0.38 * fogK);
        lit = max(lit, uFlash * 0.6);
        vec3 warm = uWarm;
        vec3 shallow = vec3(0.070, 0.265, 0.315) * (0.82 + 0.36 * swell);
        col = mix(col, shallow, lit * 0.86);
        col += warm * lit * (0.050 + dash * 0.22 + glint * 1.9);
        // блики луча: мелкие искры на ряби бегут и мерцают
        float sparkle = smoothstep(0.86, 0.97, noise(p * vec2(5.5, 11.0) + vec2(0.9, -1.4) * t)) * (0.55 + 0.45 * sin(t * 7.0 + p.x * 3.0));
        col += warm * sparkle * max(s1, s2 * 0.66) * 1.6;
        // тонкая светлая кайма: видно, где кончается свет
        float rim1 = (smoothstep(0.90, 0.97, e1) - smoothstep(0.97, 1.03, e1)) * uSpotAxes.z;
        float rim2 = (smoothstep(0.88, 0.96, e2) - smoothstep(0.96, 1.04, e2)) * uSpot2Axes.z * 0.8;
        col += warm * max(rim1, rim2) * 0.34 * (1.0 - uFlash);
        // кольцо вспышки
        if (uFlashRing >= 0.0) {
          float rd = length(p - uLight) - uFlashRing;
          col += warm * exp(-rd * rd * 0.9) * 0.4 * clamp(1.4 - uFlashRing / 34.0, 0.0, 1.0);
        }
        float n1 = swell;
        float n2 = r1;
        float n3 = r2;
        // гроза: вода темнее, молния на миг высвечивает всю бухту
        col *= 1.0 - 0.28 * uStorm;
        col += vec3(0.28, 0.32, 0.48) * uBolt * (0.35 + glint * 1.2 + dash * 0.4);
        // туман: полоса светлее и серее
        col = mix(col, vec3(0.20, 0.27, 0.36) + vec3(0.05) * n1, fogK * 0.42);
        // пена у берега
        float shore = smoothstep(1.1, 0.0, p.y + (n2 - 0.5) * 0.9 + sin(p.x * 0.7 + t * 0.9) * 0.18) * smoothstep(-3.0, -1.2, p.y);
        col = mix(col, vec3(0.34, 0.52, 0.62), shore * (0.3 + 0.7 * n3) * 0.6);
        // рассвет подкрашивает воду
        col = mix(col, vec3(0.16, 0.24, 0.33) * (0.8 + 0.4 * swell), uDawn * 0.5);
        col += vec3(0.30, 0.15, 0.06) * uDawn * (dash * 0.5 + glint * 0.9 + 0.05) * (0.3 + 0.7 * far);
        // вдали море растворяется в дымке у горизонта
        vec3 haze = mix(vec3(0.075, 0.17, 0.30), vec3(0.95, 0.52, 0.28), uDawn);
        float fade = smoothstep(uDepth + 0.6, uEnd, p.y);
        col = mix(col, haze, fade * 0.92);
        float alpha = 1.0 - smoothstep(uEnd - 1.2, uEnd, p.y);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -50;
  return { mesh, uniforms };
}

// ---------- Пена вокруг камней: одним вызовом на все камни ----------
export function makeFoam(max = 80) {
  const geometry = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(2, 2);
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.attributes.position);
  const rock = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4); // x, z (сцены), радиус, фаза
  geometry.setAttribute("rock", rock);
  geometry.instanceCount = 0;
  const uniforms = { uTime: { value: 0 }, uLit: { value: 0 } };
  const material = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide, // плашка лежит на воде лицом вниз
    blending: T.CustomBlending,
    blendSrc: T.OneFactor,
    blendDst: T.OneFactor,
    vertexShader: /* glsl */ `
      attribute vec4 rock;
      varying vec2 vUv;
      varying float vPhase;
      varying float vR;
      void main() {
        vUv = position.xy;
        vPhase = rock.w;
        vR = rock.z;
        float size = rock.z * 1.75 + 0.45;
        vec3 world = vec3(rock.x + position.x * size, 0.03, rock.y + position.y * size);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      varying float vPhase;
      varying float vR;
      uniform float uTime, uLit;
      void main() {
        float size = vR * 1.75 + 0.45;
        float d = length(vUv) * size; // расстояние от центра камня
        float a = atan(vUv.y, vUv.x);
        float wob = sin(a * 5.0 + vPhase * 9.0 + uTime * 0.9) * 0.07 + sin(a * 11.0 - uTime * 1.3 + vPhase) * 0.04;
        float breathe = 0.5 + 0.5 * sin(uTime * 1.25 + vPhase * 6.28);
        float edge = vR * 0.93 + wob;
        // плотная пена у самого камня и расходящееся кольцо
        float ring = smoothstep(edge - 0.25, edge + 0.02, d) * (1.0 - smoothstep(edge + 0.08, edge + 0.40, d));
        float far = edge + 0.34 + breathe * 0.40;
        float wave = (smoothstep(far - 0.08, far, d) - smoothstep(far, far + 0.08, d)) * (1.0 - breathe) * 0.6;
        float foam = ring * (0.62 + 0.28 * breathe) + wave;
        gl_FragColor = vec4(vec3(0.42, 0.62, 0.76) * foam * (1.0 + uLit * 0.8), 1.0);
      }
    `,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.rotation.set(0, 0, 0);
  mesh.frustumCulled = false;
  mesh.renderOrder = -40;
  return {
    mesh,
    uniforms,
    set(rocks) {
      const n = Math.min(max, rocks.length);
      for (let i = 0; i < n; i++) {
        const r = rocks[i];
        rock.setXYZW(i, r.x, -r.z, r.r, (i * 0.618) % 1);
      }
      rock.needsUpdate = true;
      geometry.instanceCount = n;
    },
  };
}

// ---------- Световые пятна на воде: тёплые лужицы под фонариками, фиолетовые под тенями ----------
export function makeDecals(max = 64) {
  const geometry = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(2, 2);
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.attributes.position);
  const place = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4); // x, z (сцены), радиус, вид
  const tint = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4); // цвет и сила
  place.setUsage(T.DynamicDrawUsage);
  tint.setUsage(T.DynamicDrawUsage);
  geometry.setAttribute("place", place);
  geometry.setAttribute("tint", tint);
  geometry.instanceCount = 0;
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide, // плашка лежит на воде лицом вниз
    blending: T.CustomBlending,
    blendSrc: T.OneFactor,
    blendDst: T.OneFactor,
    vertexShader: /* glsl */ `
      attribute vec4 place;
      attribute vec4 tint;
      varying vec2 vUv;
      varying vec4 vTint;
      varying float vKind;
      void main() {
        vUv = position.xy;
        vTint = tint;
        vKind = place.w;
        vec3 world = vec3(place.x + position.x * place.z, 0.05, place.y + position.y * place.z);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      varying vec4 vTint;
      varying float vKind;
      void main() {
        float d = length(vUv);
        float a;
        if (vKind < 0.5) a = pow(max(0.0, 1.0 - d), 1.7); // мягкое пятно
        else if (vKind < 1.5) a = (smoothstep(0.80, 0.90, d) - smoothstep(0.90, 1.0, d)); // тонкое кольцо
        else a = (smoothstep(0.55, 0.78, d) - smoothstep(0.78, 1.0, d)) * 0.8 + pow(max(0.0, 1.0 - d), 2.0) * 0.25; // кольцо с подсветкой
        gl_FragColor = vec4(vTint.rgb * a * vTint.a, 1.0);
      }
    `,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -30;
  let count = 0;
  return {
    mesh,
    begin() {
      count = 0;
    },
    // kind: 0 — пятно, 1 — кольцо, 2 — кольцо с подсветкой
    add(x, z, radius, r, g, b, power, kind = 0) {
      if (count >= max) return;
      place.setXYZW(count, x, -z, radius, kind);
      tint.setXYZW(count, r, g, b, power);
      count++;
    },
    end() {
      geometry.instanceCount = count;
      place.needsUpdate = true;
      tint.needsUpdate = true;
    },
  };
}
