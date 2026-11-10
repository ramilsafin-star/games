// Общая «полировка» цвета для игр без пост-обработки: сочность бледных цветов
// и мягкий контраст прямо в шейдерах материалов (без лишних проходов, скорость та же).
// Подключается первым импортом: шейдеры должны собраться уже с этой добавкой.
import * as T from "../vendor/three/three.module.min.js?v=9cd45e7f";

if (!T.ShaderChunk.colorspace_fragment.includes("gfxS")) {
  T.ShaderChunk.colorspace_fragment += `
  {
    vec3 gfxC = gl_FragColor.rgb;
    float gfxMx = max(gfxC.r, max(gfxC.g, gfxC.b)), gfxMn = min(gfxC.r, min(gfxC.g, gfxC.b));
    float gfxL = dot(gfxC, vec3(0.299, 0.587, 0.114));
    gfxC = mix(vec3(gfxL), gfxC, 1.0 + 0.35 * (1.0 - clamp(gfxMx - gfxMn, 0.0, 1.0)));
    vec3 gfxS = clamp(gfxC, 0.0, 1.0);
    gfxC += (gfxS * gfxS * (3.0 - 2.0 * gfxS) - gfxS) * 0.22;
    gl_FragColor.rgb = gfxC;
  }`;
}
