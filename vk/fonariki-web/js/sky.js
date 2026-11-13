// Небо одним шейдером: ночной градиент с лиловым краем, звёзды с мерцанием, Млечный путь,
// луна с ореолом, тонкие облака; на рассвете — персиковый горизонт, солнце, звёзды гаснут.
import { T, GLSL_NOISE } from "./kit.js?v=6e619b94";

export const MOON_DIR = new T.Vector3(-0.55, 0.42, -0.72).normalize();
export const SUN_DIR = new T.Vector3(0.75, 0.03, 0.66).normalize();

export function makeSky(octaves = 4) {
  const uniforms = {
    uTime: { value: 0 },
    uDawn: { value: 0 },
    uFog: { value: 0 },
    uMoon: { value: MOON_DIR.clone() },
    uSun: { value: SUN_DIR.clone() },
    uStorm: { value: 0 },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    side: T.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    defines: { OCT: octaves },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDawn, uFog, uStorm; uniform vec3 uMoon, uSun;
      varying vec3 vDir;
      ${GLSL_NOISE}
      float fbmN(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      vec3 starLayer(vec3 d, float scale, float density, float size) {
        vec2 uv = vec2(atan(d.z, d.x) * 2.0, asin(clamp(d.y, -1.0, 1.0)) * 2.0) * scale;
        vec2 cell = floor(uv), f = fract(uv);
        float r = hash12(cell);
        if (r < density) return vec3(0.0);
        vec2 c = vec2(hash12(cell + 3.7), hash12(cell + 9.1)) * 0.7 + 0.15;
        float dd = length(f - c);
        float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
        float b = smoothstep(size, 0.0, dd) * tw * (r - density) / (1.0 - density) * 2.6;
        vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.75), hash12(cell + 1.3));
        return tint * b;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // ночь: глубокая синева сверху, лиловое свечение у горизонта
        vec3 col = mix(vec3(0.11, 0.07, 0.21), vec3(0.03, 0.045, 0.12), smoothstep(-0.02, 0.32, h));
        col = mix(col, vec3(0.008, 0.012, 0.045), smoothstep(0.3, 0.95, h));
        col += vec3(0.16, 0.07, 0.2) * pow(1.0 - abs(h), 10.0) * 0.6;
        // звёзды и Млечный путь (гаснут в тумане и на рассвете)
        float starVis = (1.0 - uDawn) * smoothstep(0.02, 0.22, h) * (1.0 - uFog * 0.75);
        vec3 stars = starLayer(d, 26.0, 0.9, 0.09) + starLayer(d, 11.0, 0.955, 0.12) * 1.3;
        vec3 band = normalize(vec3(0.35, 0.5, 0.79));
        float bd = abs(dot(d, band));
        float milky = exp(-bd * bd * 22.0) * fbmN(vec2(atan(d.z, d.x) * 3.0, d.y * 6.0) + 4.0);
        col += (stars + vec3(0.32, 0.26, 0.5) * milky * 0.34 + vec3(0.6, 0.5, 0.8) * starLayer(d, 60.0, 0.6, 0.18) * milky * 0.6) * starVis;
        // луна: диск с пятнами и мягкий ореол
        float md = dot(d, uMoon);
        float disc = smoothstep(0.99935, 0.99955, md);
        vec3 mloc = d - uMoon * md;
        float spots = fbmN(mloc.xy * 900.0 + mloc.z * 400.0);
        vec3 moonCol = vec3(1.6, 1.55, 1.4) * (0.78 + 0.35 * spots);
        float halo = pow(max(md, 0.0), 220.0) * 0.55 + pow(max(md, 0.0), 24.0) * 0.12;
        col += vec3(0.55, 0.6, 0.9) * halo * (1.0 - uDawn * 0.8);
        // облака: тонкие полосы, подсвеченные луной
        vec2 cp = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
        float cl = smoothstep(0.52, 0.86, fbmN(cp * 0.9)) * smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.55, 0.9, h));
        cl = clamp(cl * (1.0 + uFog * 0.8 + uStorm), 0.0, 1.0);
        vec3 cloudNight = mix(vec3(0.05, 0.05, 0.12), vec3(0.25, 0.22, 0.4), pow(max(md, 0.0), 6.0) + 0.15);
        // рассвет: персиковый горизонт, голубой верх, солнце
        float sa = max(dot(d, uSun), 0.0);
        vec3 dawnCol = mix(vec3(1.0, 0.6, 0.42), vec3(0.36, 0.55, 0.92), smoothstep(-0.03, 0.42, h));
        dawnCol = mix(dawnCol, vec3(0.98, 0.78, 0.62), pow(1.0 - abs(h), 6.0) * 0.5);
        dawnCol += vec3(1.0, 0.55, 0.25) * pow(sa, 5.0) * 0.55 + vec3(1.6, 1.25, 0.9) * pow(sa, 400.0) * 5.0;
        vec3 cloudDawn = mix(vec3(1.0, 0.62, 0.62), vec3(1.0, 0.86, 0.72), pow(sa, 3.0));
        col = mix(col, dawnCol, uDawn);
        col = mix(col, mix(cloudNight, cloudDawn, uDawn), cl * (0.85 - uDawn * 0.2));
        col = mix(col, moonCol * (1.0 - cl * 0.7), disc * (1.0 - uDawn * 0.6));
        // туман: небо у горизонта мутнеет
        col = mix(col, mix(vec3(0.09, 0.1, 0.18), vec3(0.75, 0.72, 0.78), uDawn), uFog * 0.55 * (1.0 - smoothstep(0.0, 0.6, h)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(800, 48, 24), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
