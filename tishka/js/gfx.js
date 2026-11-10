// Общая «полировка» картинки: сглаживание краёв (MSAA), лёгкая резкость,
// сочность бледных цветов, мягкий контраст и виньетка. Один проход после OutputPass.
import { ShaderPass } from "../vendor/three/postprocessing/ShaderPass.js?v=b717a707";

export function polish(composer, opt = {}) {
  const o = { vibrance: 0.4, contrast: 0.12, vignette: 0.22, sharpen: 0.3, ...opt };
  // RenderPass всегда рисует в renderTarget2 (после него два прохода со сменой буфера),
  // поэтому сглаживание нужно только ему
  try {
    const gl = composer.renderer.getContext();
    composer.renderTarget2.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  } catch {}
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      vibrance: { value: o.vibrance },
      contrast: { value: o.contrast },
      vignette: { value: o.vignette },
      sharpen: { value: o.sharpen },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float vibrance, contrast, vignette, sharpen; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // Резкость: разница с соседями, с ограничением, чтобы не было ореолов
      vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0));
      vec3 near = (texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
        + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb) * 0.25;
      col += clamp(col - near, -0.08, 0.08) * sharpen * 2.0;
      // Сочность: бледное становится ярче, уже яркое не пересвечивается
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.0 + vibrance * (1.0 - clamp(mx - mn, 0.0, 1.0)));
      // Мягкий контраст (S-кривая), тени не проваливаются
      vec3 s = clamp(col, 0.0, 1.0);
      col = mix(s, s * s * (3.0 - 2.0 * s), contrast * 2.0);
      // Виньетка
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.0);
      gl_FragColor = vec4(col, c.a);
    }`,
  });
  composer.addPass(pass);
  return pass;
}
