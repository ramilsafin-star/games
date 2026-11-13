// Финальная обработка кадра: свечение ярких мест, мягкое ограничение яркости без потери цвета и лёгкая виньетка.
import * as T from '../../vendor/three/three.module.min.js?v=4d3622b6';

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
varying vec2 vUv;
vec3 shoulder(vec3 x){ vec3 a = vec3(0.72); return mix(x, a + (1.0 - a) * (1.0 - exp(-(x - a) / (1.0 - a))), step(a, x)); }
vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float dither(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
void main(){
  vec3 c = texture2D(tex, vUv).rgb + texture2D(bloom, vUv).rgb * uBloom;
  c = shoulder(c * uExposure);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * 0.17;
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
    this.extract = pass(EXTRACT, { tex: { value: null }, uThreshold: { value: 1.3 } });
    this.down = pass(DOWN, { tex: { value: null }, uTexel: { value: new T.Vector2() } });
    this.up = pass(UP, { tex: { value: null }, uTexel: { value: new T.Vector2() } }, { blending: T.AdditiveBlending, transparent: true });
    this.final = pass(FINAL, {
      tex: { value: null }, bloom: { value: null }, uBloom: { value: 0.55 }, uExposure: { value: 1 }, uSaturation: { value: 1.14 }, uTime: { value: 0 }
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
