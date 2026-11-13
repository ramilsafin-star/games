// Отрисовка: рендерер, свечение (bloom), цветокоррекция, сглаживание FXAA и уровни качества.
// MSAA на композере не включать (правило репозитория): свои шейдеры дают NaN на краях, свечение
// растягивает их в чёрные пятна. Края сглаживает FXAA на высоком качестве.
import { T, clamp } from "./kit.js?v=6e619b94";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=6e619b94";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=6e619b94";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=6e619b94";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=6e619b94";
import { ShaderPass } from "../vendor/three/postprocessing/ShaderPass.js?v=6e619b94";

// Уровни качества: плотность пикселей, свечение, трава, следы светлячков, FXAA
export const LEVELS = {
  high: { ratio: 2, bloom: true, grass: 1, trails: true, fxaa: true, sky: 4 },
  medium: { ratio: 1.5, bloom: true, grass: 0.5, trails: true, fxaa: false, sky: 3 },
  low: { ratio: 1, bloom: false, grass: 0.18, trails: false, fxaa: false, sky: 2 },
};
const ORDER = ["high", "medium", "low"];

// Сильное устройство — сразу высокое: ПК или телефон с 8+ ГБ памяти
export function guessLevel() {
  const mem = navigator.deviceMemory || 0;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (!coarse && cores >= 4) return "high";
  if (mem >= 8 || (!mem && cores >= 8)) return "high";
  return mem && mem < 4 ? "low" : "medium";
}

const VERT = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

// Цветокоррекция после тонмаппинга: сочность, лёгкий холодный оттенок в тенях и тёплый в светах,
// виньетка, лёгкое зерно; frost — иней по краям, когда игрок застыл; tint — окраска события
function gradePass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      frost: { value: 0 },
      dawn: { value: 0 },
      tint: { value: new T.Vector4(0, 0, 0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float time, frost, dawn; uniform vec4 tint; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
        col = mix(vec3(l), col, 1.0 + 0.35 * (1.0 - clamp(mx - mn, 0.0, 1.0)));
        // холодные тени, тёплые света (ночью сильнее)
        float night = 1.0 - dawn;
        col += night * (vec3(-0.012, 0.0, 0.03) * (1.0 - smoothstep(0.0, 0.35, l)) + vec3(0.025, 0.01, -0.02) * smoothstep(0.45, 1.0, l));
        vec2 d = vUv - 0.5;
        float r2 = dot(d, d);
        col *= 1.0 - 0.42 * smoothstep(0.12, 0.62, r2);
        // событие ночи: лёгкая окраска по краям
        col = mix(col, tint.rgb, tint.a * smoothstep(0.05, 0.5, r2));
        // иней: голубые узоры с краёв
        if (frost > 0.0) {
          // иней: мягкие узоры по краям (сумма синусов, без квадратиков)
          vec2 p = vUv * vec2(9.0, 6.0);
          float pat = sin(p.x * 2.1 + sin(p.y * 3.3)) * sin(p.y * 2.7 + sin(p.x * 1.7)) * 0.5 + 0.5;
          float edge = smoothstep(0.1, 0.42, r2 + (pat - 0.5) * 0.08);
          col = mix(col, vec3(0.78, 0.92, 1.0), edge * frost * 0.7);
          col += vec3(0.05, 0.1, 0.16) * frost;
        }
        col += (h(vUv * 911.0 + time) - 0.5) * 0.018;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// FXAA 3.11 (облегчённый): сглаживает края после тонмаппинга
function fxaaPass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, px: { value: new T.Vector2(1 / 1024, 1 / 1024) } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform vec2 px; varying vec2 vUv;
      float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      void main() {
        vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb;
        vec3 rgbNE = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * px).rgb;
        vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * px).rgb;
        vec3 rgbSE = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * px).rgb;
        vec4 m = texture2D(tDiffuse, vUv);
        float lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE), lM = lum(m.rgb);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
        float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
        float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
        float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
        dir = clamp(dir * rcp, -8.0, 8.0) * px;
        vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
        vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
        float lB = lum(b);
        gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, m.a);
      }`,
  });
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    gl.toneMapping = T.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = T.SRGBColorSpace;
    this.gl = gl;
    this.level = "high";
    this.ratio = 1;
    this.extraDrop = 1; // на совсем слабом — ещё меньше пикселей
    this.perf = { t: 0, frames: 0, slow: 0, fps: 60, auto: true, history: [] };
    this.onLevel = null;
  }
  setup(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    const composer = new EffectComposer(this.gl);
    composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.75, 0.5, 0.88);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = gradePass();
    composer.addPass(this.grade);
    this.fxaa = fxaaPass();
    composer.addPass(this.fxaa);
    this.composer = composer;
  }
  setLevel(level, auto) {
    if (!LEVELS[level]) level = "medium";
    this.level = level;
    if (auto !== undefined) this.perf.auto = auto;
    const L = LEVELS[level];
    this.fxaa.enabled = L.fxaa;
    this.bloom.enabled = L.bloom;
    this.resize();
    this.onLevel?.(level, L);
  }
  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const L = LEVELS[this.level];
    this.ratio = Math.min(devicePixelRatio || 1, L.ratio) * this.extraDrop;
    this.gl.setPixelRatio(this.ratio);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(this.ratio);
    this.composer.setSize(w, h);
    this.fxaa.uniforms.px.value.set(1 / (w * this.ratio), 1 / (h * this.ratio));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  render(dt, time) {
    this.grade.uniforms.time.value = time % 10;
    this.composer.render(dt);
    this.watch(dt);
  }
  // Авто-качество: если 3 секунды подряд меньше ~45 кадров, качество на ступень ниже
  watch(dt) {
    const p = this.perf;
    if (dt <= 0 || dt > 0.5) return;
    p.t += dt;
    p.frames++;
    if (p.t < 3) return;
    p.fps = p.frames / p.t;
    p.history.push(Math.round(p.fps));
    if (p.history.length > 20) p.history.shift();
    p.t = 0;
    p.frames = 0;
    if (!p.auto || this.paused) return;
    if (p.fps < 44) {
      p.slow++;
      if (p.slow >= 1) {
        p.slow = 0;
        const i = ORDER.indexOf(this.level);
        if (i < ORDER.length - 1) this.setLevel(ORDER[i + 1]);
        else if (this.extraDrop > 0.75 && p.fps < 28) {
          this.extraDrop = 0.75;
          this.resize();
        }
      }
    } else p.slow = 0;
  }
  setFrost(v) {
    this.grade.uniforms.frost.value = clamp(v, 0, 1);
  }
  setDawn(v) {
    this.grade.uniforms.dawn.value = v;
  }
  setTint(r, g, b, a) {
    this.grade.uniforms.tint.value.set(r, g, b, a);
  }
}
