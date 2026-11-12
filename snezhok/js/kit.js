// Общие мелочи для сцены: материалы, заготовки геометрии, надписи на холсте, хранилище.
import * as T from "../vendor/three/three.module.min.js?v=bd3554ee";

export { T };
export const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = T.MathUtils.clamp;
export const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
// Цвет ярче белого светится через bloom.
export const hot = (hex, k = 3) => new T.Color(hex).multiplyScalar(k);
export const lit = (hex, k = 3, extra = {}) => new T.MeshBasicMaterial({ color: hot(hex, k), toneMapped: false, ...extra });

export const GEO = {
  ball: new T.SphereGeometry(1, 16, 12),
  low: new T.IcosahedronGeometry(1, 0),
  oct: new T.OctahedronGeometry(1, 0),
  box: new T.BoxGeometry(1, 1, 1),
  cone: new T.ConeGeometry(1, 1, 7),
  cyl: new T.CylinderGeometry(1, 1, 1, 12),
  plane: new T.PlaneGeometry(1, 1),
};

export const part = (geo, material, sx, sy, sz) => {
  const m = new T.Mesh(geo, material);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  return m;
};
export const at = (m, x, y, z) => (m.position.set(x, y, z), m);

export function canvasTexture(w, h, paint, repeat = false) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d"), w, h);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Мягкое пятно для бликов и теней
const glowCanvas = document.createElement("canvas");
glowCanvas.width = glowCanvas.height = 64;
{
  const g = glowCanvas.getContext("2d");
  const radial = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  radial.addColorStop(0, "rgba(255,255,255,1)");
  radial.addColorStop(0.3, "rgba(255,255,255,.55)");
  radial.addColorStop(0.65, "rgba(255,255,255,.12)");
  radial.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = radial;
  g.fillRect(0, 0, 64, 64);
}
export const glowTexture = new T.CanvasTexture(glowCanvas);

// Туман слабее обычного: ворота и их числа читаются издалека, но всё же тонут в дымке у горизонта
export function thinFog(material, k = 0.35) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      `#ifdef USE_FOG
        float thinFogF = smoothstep(fogNear, fogFar, vFogDepth) * ${k.toFixed(3)};
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, thinFogF);
      #endif`,
    );
  };
  material.customProgramCacheKey = () => "thinfog" + k;
  return material;
}

export function flare(color, width, height = width, extra = {}) {
  const sprite = new T.Sprite(new T.SpriteMaterial({ color, map: glowTexture, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, ...extra }));
  sprite.scale.set(width, height, 1);
  return sprite;
}

// Крупная надпись (числа на воротах, стенах, ступенях) — текстура с обводкой
export function labelTexture(text, { w = 256, h = 128, color = "#ffffff", stroke = "#1b2a4a", size = 92, weight = 900, glow = null } = {}) {
  return canvasTexture(w, h, (g) => {
    g.font = `${weight} ${size}px "Trebuchet MS", "Avenir Next", system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    if (glow) {
      g.shadowColor = glow;
      g.shadowBlur = 18;
    }
    g.lineWidth = size * 0.2;
    g.strokeStyle = stroke;
    g.strokeText(text, w / 2, h / 2 + size * 0.04);
    g.shadowBlur = 0;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + size * 0.04);
  });
}

export function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Игра работает и в браузере, запретившем сохранение.
  }
}
