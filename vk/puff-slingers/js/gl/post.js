// Финальная обработка кадра: свечение ярких мест, киношная тональная кривая и лёгкая виньетка.
// Сглаживание — FXAA в последнем проходе (без MSAA: многовыборочные цели в этом репозитории запрещены),
// ударные волны взрывов — кольцевое смещение картинки.
import * as T from '../../vendor/three/three.module.min.js?v=7f585ca2';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';

function pass(fragmentShader, uniforms, extra) {
  return new T.ShaderMaterial({
    vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra
  });
}

const EXTRACT = `
uniform sampler2D tex; uniform float uThreshold; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold - 0.25, uThreshold + 0.6, l);
  gl_FragColor = vec4(min(c * k, vec3(6.0)), 1.0);
}`;

const DOWN = `
uniform sampler2D tex; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tex, vUv).rgb * 4.0;
  s += texture2D(tex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture2D(tex, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  s += texture2D(tex, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  s += texture2D(tex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;

const UP = `
uniform sampler2D tex; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tex, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  s += texture2D(tex, vUv + uTexel * vec2(-1.0, 1.0)).rgb * 2.0;
  s += texture2D(tex, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  s += texture2D(tex, vUv + uTexel * vec2(1.0, 1.0)).rgb * 2.0;
  s += texture2D(tex, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  s += texture2D(tex, vUv + uTexel * vec2(1.0, -1.0)).rgb * 2.0;
  s += texture2D(tex, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  s += texture2D(tex, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0, 1.0);
}`;

const FINAL = `
uniform sampler2D tex; uniform sampler2D bloom; uniform float uBloom; uniform float uExposure; uniform float uSaturation; uniform float uTime;
uniform vec4 uShock[4]; uniform float uAspect; uniform vec2 uTexel; uniform float uFxaa;
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float dither(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
// Яркость после тональной кривой: по ней FXAA ищет края
float lumaAt(vec2 uv){ return dot(aces(texture2D(tex, uv).rgb * uExposure), vec3(0.299, 0.587, 0.114)); }
// FXAA (упрощённый вариант Т. Лоттса): размывает только вдоль найденного края
vec3 fxaa(vec2 uv){
  vec3 m = texture2D(tex, uv).rgb;
  float lM = dot(aces(m * uExposure), vec3(0.299, 0.587, 0.114));
  float lNW = lumaAt(uv + vec2(-1.0, -1.0) * uTexel);
  float lNE = lumaAt(uv + vec2(1.0, -1.0) * uTexel);
  float lSW = lumaAt(uv + vec2(-1.0, 1.0) * uTexel);
  float lSE = lumaAt(uv + vec2(1.0, 1.0) * uTexel);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.04, lMax * 0.125)) return m;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tex, uv - dir * 0.5).rgb + texture2D(tex, uv + dir * 0.5).rgb);
  float lB = dot(aces(b * uExposure), vec3(0.299, 0.587, 0.114));
  return (lB < lMin || lB > lMax) ? a : b;
}
void main(){
  // Ударные волны: узкое кольцо сдвигает картинку от центра и чуть светлеет
  vec2 uv = vUv;
  float ringLight = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 s = uShock[i];
    if (s.w <= 0.0) continue;
    vec2 d = vUv - s.xy;
    d.x *= uAspect;
    float dist = length(d) + 1e-5;
    float band = smoothstep(0.07, 0.0, abs(dist - s.z));
    vec2 n = d / dist;
    n.x /= uAspect;
    uv -= n * band * s.w * 0.022;
    ringLight += band * s.w;
  }
  vec3 base = uFxaa > 0.5 && uv == vUv ? fxaa(uv) : texture2D(tex, uv).rgb;
  vec3 c = base + texture2D(bloom, uv).rgb * uBloom + ringLight * vec3(0.06, 0.05, 0.03);
  c = aces(c * uExposure);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * 0.42;
  c = toSrgb(clamp(c, 0.0, 1.0));
  gl_FragColor = vec4(c + dither(gl_FragCoord.xy) / 255.0, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = renderer.capabilities.isWebGL2 &&
      (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new T.Mesh(new T.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.extract = pass(EXTRACT, { tex: { value: null }, uThreshold: { value: 1.0 } });
    this.down = pass(DOWN, { tex: { value: null }, uTexel: { value: new T.Vector2() } });
    this.up = pass(UP, { tex: { value: null }, uTexel: { value: new T.Vector2() } }, { blending: T.AdditiveBlending, transparent: true });
    this.final = pass(FINAL, {
      tex: { value: null }, bloom: { value: null }, uBloom: { value: 0.75 }, uExposure: { value: 1 }, uSaturation: { value: 1.08 }, uTime: { value: 0 },
      uShock: { value: [new T.Vector4(), new T.Vector4(), new T.Vector4(), new T.Vector4()] }, uAspect: { value: 1 },
      uTexel: { value: new T.Vector2(1 / 1024, 1 / 1024) }, uFxaa: { value: 1 }
    });
    this.hdr = null;
    this.mips = [];
    this.levels = 4;
  }

  setSize(width, height, samples, levels) {
    if (!this.enabled) return;
    const same = this.hdr && this.hdr.width === width && this.hdr.height === height && this.wanted === samples && this.levels === levels;
    if (same) return;
    this.wanted = samples;
    this.dispose();
    this.levels = levels;
    this.hdr = new T.WebGLRenderTarget(width, height, {
      type: T.HalfFloatType, samples, depthBuffer: true, minFilter: T.LinearFilter, magFilter: T.LinearFilter
    });
    if (samples > 0 && !this.complete(this.hdr)) {
      this.hdr.dispose();
      this.hdr = new T.WebGLRenderTarget(width, height, {
        type: T.HalfFloatType, samples: 0, depthBuffer: true, minFilter: T.LinearFilter, magFilter: T.LinearFilter
      });
    }
    if (!this.complete(this.hdr)) {
      this.enabled = false;
      return;
    }
    this.final.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.final.uniforms.uAspect.value = width / height;
    let w = width;
    let h = height;
    for (let i = 0; i < levels; i++) {
      w = Math.max(2, w >> 1);
      h = Math.max(2, h >> 1);
      this.mips.push(new T.WebGLRenderTarget(w, h, {
        type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter
      }));
    }
  }

  complete(target) {
    const r = this.renderer;
    r.setRenderTarget(target);
    const gl = r.getContext();
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    r.setRenderTarget(null);
    return ok;
  }

  dispose() {
    if (this.hdr) this.hdr.dispose();
    this.mips.forEach((m) => m.dispose());
    this.mips = [];
    this.hdr = null;
  }

  run(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.hdr);
    r.clear();
    r.render(scene, camera);
    r.autoClear = false;
    const mips = this.mips;
    this.extract.uniforms.tex.value = this.hdr.texture;
    r.setRenderTarget(mips[0]);
    r.clear();
    this.run(this.extract, mips[0]);
    for (let i = 1; i < mips.length; i++) {
      this.down.uniforms.tex.value = mips[i - 1].texture;
      this.down.uniforms.uTexel.value.set(0.5 / mips[i - 1].width, 0.5 / mips[i - 1].height);
      r.setRenderTarget(mips[i]);
      r.clear();
      this.run(this.down, mips[i]);
    }
    // Наверх прибавляем к уже имеющемуся: так получается широкое мягкое свечение
    for (let i = mips.length - 1; i > 0; i--) {
      this.up.uniforms.tex.value = mips[i].texture;
      this.up.uniforms.uTexel.value.set(0.5 / mips[i].width, 0.5 / mips[i].height);
      this.run(this.up, mips[i - 1]);
    }
    this.final.uniforms.tex.value = this.hdr.texture;
    this.final.uniforms.bloom.value = mips[0].texture;
    r.setRenderTarget(null);
    r.clear();
    this.run(this.final, null);
    r.autoClear = true;
  }
}
