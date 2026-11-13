// Вид «Рубежа»: рендер, уровни качества (сами снижаются, если кадров мало), пост-обработка
// (свечение, цветокоррекция, виньетка, размытие при уроне, сглаживание FXAA — без MSAA),
// камера от первого лица с отдачей и тряской, оружие в руках, роботы и эффекты по событиям правил.
import { T, PRIM, glowTexture, canvasTexture, TAU } from "./kit.js?v=cb8e2b87";
import { EffectComposer } from "../vendor/three/postprocessing/EffectComposer.js?v=cb8e2b87";
import { RenderPass } from "../vendor/three/postprocessing/RenderPass.js?v=cb8e2b87";
import { UnrealBloomPass } from "../vendor/three/postprocessing/UnrealBloomPass.js?v=cb8e2b87";
import { OutputPass } from "../vendor/three/postprocessing/OutputPass.js?v=cb8e2b87";
import { ShaderPass } from "../vendor/three/postprocessing/ShaderPass.js?v=cb8e2b87";
import { buildScene, makeEnvironment } from "./scene.js?v=cb8e2b87";
import { createFx } from "./fx.js?v=cb8e2b87";
import { buildRobot, buildGun, modelMats } from "./models.js?v=cb8e2b87";
import { Sound } from "./sound.js?v=cb8e2b87";
import { TIMES } from "./missions.js?v=cb8e2b87";
import { World } from "./world.js?v=cb8e2b87";
import { getMap } from "./maps.js?v=cb8e2b87";
import { lookDir, clamp, lerp } from "./util.js?v=cb8e2b87";

// ---------- Уровни качества ----------
export const QUALITY = {
  high: { name: "Высокое", pr: 2, pbr: true, shadows: true, shadowSize: 2048, shadowDyn: true, bloom: true, fxaa: true, cones: true, particles: 1, tex: 512, step: 2, occlude: true, lights: 3, decals: 96 },
  mid: { name: "Среднее", pr: 1.5, pbr: true, shadows: true, shadowSize: 1024, shadowDyn: false, bloom: true, fxaa: true, cones: true, particles: 0.65, tex: 256, step: 2.6, occlude: true, lights: 2, decals: 64 },
  low: { name: "Низкое", pr: 1, pbr: false, shadows: false, shadowSize: 512, shadowDyn: false, bloom: false, fxaa: false, cones: false, particles: 0.35, tex: 128, step: 4, occlude: false, lights: 1, decals: 32 },
};
const TIER_KEY = "rubezh-tier"; // уровень для этого устройства (не в облаке)
export function detectTier() {
  try {
    const saved = localStorage.getItem(TIER_KEY);
    if (saved && QUALITY[saved]) return saved;
  } catch {}
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
  if (mem <= 2 || cores <= 2) return "low";
  if (mem < 6 || cores < 6) return "mid";
  return "high";
}
function rememberTier(t) {
  try {
    localStorage.setItem(TIER_KEY, t);
  } catch {}
}

// Финальный проход: цвет, виньетка, урон (красные края, расслоение, размытие), вспышка ЭМИ, зерно
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, hurt: { value: 0 }, low: { value: 0 }, flash: { value: new T.Vector3() }, time: { value: 0 }, tint: { value: new T.Vector3(1, 1, 1) }, sat: { value: 1.08 }, vig: { value: 0.42 }, res: { value: new T.Vector2(1, 1) }, scope: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float hurt, low, time, sat, vig, scope; uniform vec3 flash, tint; uniform vec2 res; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      float ab = 0.0004 + hurt * 0.012;
      vec2 sh = c * r2 * ab * 8.0;
      vec3 col;
      if (hurt > 0.05) {
        // размытие к краям при уроне
        vec3 acc = vec3(0.0); float w = 0.0;
        for (int i = -2; i <= 2; i++) { vec2 o = c * float(i) * 0.012 * hurt * r2 * 4.0; acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0; }
        col = acc / w;
        col.r = texture2D(tDiffuse, vUv + sh).r; col.b = texture2D(tDiffuse, vUv - sh).b;
      } else col = vec3(texture2D(tDiffuse, vUv + sh).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - sh).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat - low * 0.6);
      col *= tint;
      col = col * (1.0 + 0.06) - 0.03 * (1.0 - col);
      col *= 1.0 - smoothstep(0.18, 0.75, r2) * vig;
      col = mix(col, vec3(0.75, 0.02, 0.02), smoothstep(0.1, 0.5, r2) * (hurt * 0.55 + low * 0.35 * (0.6 + 0.4 * sin(time * 6.0))));
      col += flash;
      col += (fract(sin(dot(vUv * res + time * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
// FXAA (упрощённый, по яркости соседей)
const FxaaShader = {
  uniforms: { tDiffuse: { value: null }, res: { value: new T.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 px = 1.0 / res;
      vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0,-1.0)*px).rgb, rgbNE = texture2D(tDiffuse, vUv + vec2(1.0,-1.0)*px).rgb;
      vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0,1.0)*px).rgb, rgbSE = texture2D(tDiffuse, vUv + vec2(1.0,1.0)*px).rgb;
      vec3 rgbM = texture2D(tDiffuse, vUv).rgb;
      float lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE), lM = lum(rgbM);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, -8.0, 8.0) * px;
      vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv + dir * -0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lB = lum(b);
      gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
    }`,
};

// Положение оружия в руках: от бедра и в прицеле (прицел — по центру экрана)
const HOLD = {
  pistol: { hip: [0.12, -0.135, -0.4], ads: [0, -0.074, -0.34] },
  rifle: { hip: [0.15, -0.165, -0.44], ads: [0, -0.104, -0.3] },
  scoped: { hip: [0.16, -0.17, -0.46], ads: [0, -0.118, -0.26] },
  knife: { hip: [0.17, -0.19, -0.38], ads: [0.17, -0.19, -0.38] },
};
const holdOf = (id) => (id === "iskra" || id === "grom" ? HOLD.pistol : id === "rezak" ? HOLD.knife : id === "sokol" || id === "igla" ? HOLD.scoped : HOLD.rifle);
const TEAM_TRACER = { robot: "#ff5a2a", squad: "#5fd8ff" };
const ROBOT_TRACER = { zhuk: "#ffcf3a", strelok: "#ff6a3a", bastion: "#7fc8ff", molot: "#ffa32a", nakovalnya: "#ff5a1f", osa: "#ff3fd0", mate: "#5fd8ff" };

export class View {
  constructor(canvas, tier) {
    this.canvas = canvas;
    this.tier = tier || detectTier();
    this.q = { ...QUALITY[this.tier] };
    const r = (this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false }));
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.outputColorSpace = T.SRGBColorSpace;
    r.shadowMap.enabled = this.q.shadows;
    r.shadowMap.type = T.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    this.scale = 1; // адаптивное разрешение
    this.camera = new T.PerspectiveCamera(74, 1, 0.05, 700);
    this.camera.rotation.order = "YXZ";
    this.vmScene = new T.Scene();
    this.vmCamera = new T.PerspectiveCamera(56, 1, 0.01, 10);
    this.vmScene.add(this.vmCamera);
    this.trauma = 0;
    this.fps = { frames: 0, t: 0, avg: 60, slow: 0, fast: 0 };
    this.models = new Map();
    this.guns = {};
    this.gun = null;
    this.vm = { sway: new T.Vector2(), kick: 0, kickR: 0, reload: 0, reloadMax: 1, equip: 0, swing: 0, throwT: 0, bob: 0, lastId: "", flash: 0, shell: 0 };
    this.eyeSmooth = 0;
    this.hurtK = 0;
    this.flashK = new T.Vector3();
    this.lastT = 0;
    this.shake = new T.Vector3();
    this.blob = null;
    this.setupComposer();
    this.resize();
  }
  setupComposer() {
    const r = this.renderer;
    this.composer = new EffectComposer(r);
    this.mainPass = new RenderPass(new T.Scene(), this.camera);
    this.vmPass = new RenderPass(this.vmScene, this.vmCamera);
    this.vmPass.clear = false;
    this.vmPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.7, 0.55, 0.82);
    this.grade = new ShaderPass(GradeShader);
    this.fxaa = new ShaderPass(FxaaShader);
    this.composer.addPass(this.mainPass);
    this.composer.addPass(this.vmPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
    this.composer.addPass(this.fxaa);
    this.applyPasses();
  }
  applyPasses() {
    this.bloom.enabled = this.q.bloom;
    this.fxaa.enabled = this.q.fxaa;
    this.useComposer = this.q.bloom || this.q.fxaa || true;
  }
  // смена уровня (новые материалы — со следующей загрузки карты, разрешение и проходы — сразу)
  setTier(t, remember = true) {
    if (!QUALITY[t]) return;
    this.tier = t;
    this.q = { ...QUALITY[t] };
    if (remember) rememberTier(t);
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.applyPasses();
    this.scale = 1;
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pr) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    // на узком экране оружие чуть меньше
    this.vmCamera.fov = w / h < 1.3 ? 68 : 60;
    this.vmCamera.updateProjectionMatrix();
    this.grade.uniforms.res.value.set(w * pr, h * pr);
    this.fxaa.uniforms.res.value.set(w * pr, h * pr);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  // ---------- Загрузка карты ----------
  load(world, mission, o = {}) {
    this.dispose();
    const theme = { ...TIMES[mission.time || "dusk"] };
    this.theme = theme;
    const weather = o.weather ?? mission.weather;
    this.built = buildScene(world, theme, { quality: this.q, weather, cones: this.q.cones, fogK: o.fogK || 1 });
    const scene = (this.scene = this.built.scene);
    scene.add(this.camera);
    this.world = world;
    this.env = makeEnvironment(this.renderer, theme, this.built.lamps);
    scene.environment = this.q.pbr ? this.env : null;
    this.renderer.toneMappingExposure = theme.exposure || 1;
    this.mainPass.scene = scene;
    this.mainPass.camera = this.camera;
    this.fx = createFx(scene, this.camera, world, this.q);
    // свет для оружия в руках — как на карте; старое оружие снимаем с камеры
    this.vmCamera.clear();
    this.vmScene.clear();
    this.vmScene.add(this.vmCamera);
    this.vmScene.add(new T.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2] * 1.2));
    const key = new T.DirectionalLight(theme.sunColor, Math.max(0.8, theme.sunI * 0.7));
    key.position.set(0.5, 1, 0.3);
    this.vmScene.add(key);
    this.vmFlash = new T.PointLight("#ffd28a", 0, 3, 2);
    this.vmFlash.position.set(0.1, -0.05, -0.8);
    this.vmScene.add(this.vmFlash);
    this.vmScene.environment = this.q.pbr ? this.env : null;
    this.guns = {};
    this.gun = null;
    this.vm.lastId = "";
    modelMatsReset();
    // пятна-тени под роботами
    const blobTex = glowTexture(64, 1.6);
    const blobMat = new T.MeshBasicMaterial({ map: blobTex, color: "#000000", transparent: true, opacity: 0.55, depthWrite: false });
    const bg = new T.PlaneGeometry(1, 1);
    bg.rotateX(-Math.PI / 2);
    this.blob = new T.InstancedMesh(bg, blobMat, 48);
    this.blob.frustumCulled = false;
    this.blob.renderOrder = 1;
    scene.add(this.blob);
    // гранаты и ракеты
    const nadeG = new T.Group();
    this.nadeMeshes = [];
    for (let i = 0; i < 6; i++) {
      const m = new T.Mesh(PRIM.ball8, new T.MeshStandardMaterial({ color: "#3a4048", roughness: 0.5, metalness: 0.6 }));
      m.scale.setScalar(0.07);
      const band = new T.Mesh(PRIM.torus, new T.MeshBasicMaterial({ color: "#ffb03a", toneMapped: false }));
      band.scale.setScalar(1.05);
      m.add(band);
      m.visible = false;
      nadeG.add(m);
      this.nadeMeshes.push(m);
    }
    this.rocketMeshes = [];
    for (let i = 0; i < 10; i++) {
      const m = new T.Mesh(PRIM.cyl8, new T.MeshStandardMaterial({ color: "#5a6068", roughness: 0.5, metalness: 0.5 }));
      m.scale.set(0.08, 0.5, 0.08);
      const fl = new T.Mesh(PRIM.ball8, new T.MeshBasicMaterial({ color: new T.Color(3, 1.4, 0.4), toneMapped: false }));
      fl.scale.set(1.6, 0.4, 1.6);
      fl.position.y = -0.55;
      m.add(fl);
      m.visible = false;
      nadeG.add(m);
      this.rocketMeshes.push(m);
    }
    scene.add(nadeG);
    this.shadowFrames = 0;
    this.renderer.shadowMap.needsUpdate = true;
    this.smokeT = 0;
    Sound.indoor(!!(theme.indoor || world.map.indoor));
    this.grade.uniforms.tint.value.set(1, 1, 1);
    if (theme.emergency) this.grade.uniforms.tint.value.set(1.06, 0.92, 0.92);
    if (mission.time === "night") this.grade.uniforms.tint.value.set(0.92, 0.98, 1.08);
    if (mission.time === "sunset" || mission.time === "dusk") this.grade.uniforms.tint.value.set(1.06, 0.98, 0.92);
    if (mission.time === "day") this.grade.uniforms.tint.value.set(1.03, 1.0, 0.95);
    this.bloom.strength = theme.stars || theme.indoor ? 0.85 : 0.6;
  }
  dispose() {
    for (const m of this.models.values()) m.root.removeFromParent();
    this.models.clear();
    if (this.fx) this.fx.clear();
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.geometry && !Object.values(PRIM).includes(o.geometry)) o.geometry.dispose?.();
      });
    }
    this.scene = null;
  }

  // ---------- Оружие в руках ----------
  holdGun(id) {
    if (this.vm.lastId === id && this.gun) return;
    this.vm.lastId = id;
    if (this.gun) this.gun.removeFromParent();
    if (!this.guns[id]) {
      const g = buildGun(id, this.q, this.env);
      // вспышка у дула
      const fm = new T.Mesh(new T.PlaneGeometry(0.22, 0.22), new T.MeshBasicMaterial({ map: flashTex(), color: new T.Color(4, 2.6, 1.2), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
      fm.position.copy(g.userData.muzzle);
      fm.visible = false;
      g.add(fm);
      const fm2 = fm.clone();
      fm2.rotation.y = Math.PI / 2;
      fm2.scale.set(0.6, 1.4, 1);
      g.add(fm2);
      g.userData.flash = [fm, fm2];
      this.guns[id] = g;
    }
    this.gun = this.guns[id];
    this.vmCamera.add(this.gun);
  }

  // ---------- Кадр боя ----------
  // g — игра, dt — время кадра (с замедлением), real — настоящее, look — сдвиг взгляда за кадр (для покачивания)
  frame(g, dt, real, look, opts = {}) {
    const p = g.player;
    const cam = this.camera;
    const W = g.weapon();
    const t = (this.lastT += dt);
    // события правил → эффекты и звук
    for (const e of g.events) this.handle(g, e);
    // камера
    const eye = g.eye();
    if (Math.abs(eye - (this.eyeY ?? eye)) > 0.01 && Math.abs(eye - (this.eyeY ?? eye)) < 0.7) this.eyeSmooth += (this.eyeY ?? eye) - eye;
    this.eyeY = eye;
    this.eyeSmooth *= Math.exp(-14 * real);
    const speed = clamp(p.speedNow / 5.4, 0, 1.2);
    if (p.grounded) this.vm.bob += real * (6 + speed * 6) * (speed > 0.08 ? 1 : 0);
    const bobY = Math.sin(this.vm.bob * 2) * 0.035 * speed * (1 - p.aim * 0.8);
    const bobX = Math.cos(this.vm.bob) * 0.025 * speed * (1 - p.aim * 0.8);
    // тряска: «травма» затухает
    this.trauma = Math.max(0, this.trauma - real * 1.6);
    const sh = this.trauma * this.trauma * (opts.shake ?? 1);
    const nt = t * 32;
    cam.position.set(p.x + bobX * 0.3, eye + this.eyeSmooth + bobY, p.z);
    cam.rotation.set(p.pitch + Math.sin(nt * 1.1) * 0.035 * sh, p.yaw + Math.sin(nt * 0.9 + 1) * 0.035 * sh, Math.sin(nt * 1.3 + 2) * 0.04 * sh + this.vm.kickR * 0.6, "YXZ");
    const zoom = lerp(1, W.zoom || 1, p.aim);
    const fov = (opts.fov || 74) / zoom;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    Sound.listener(p.x, p.z, p.yaw);
    // оружие
    this.updateViewmodel(g, real, look, speed);
    // роботы, свои, гранаты
    this.updateAgents(g, dt, t);
    this.updateProjectiles(g, dt);
    // дым гранат
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.22;
      for (const s of g.smokes) if (s.t < s.life - 2) this.fx.smokeCloud(new T.Vector3(s.x, s.y - 0.8, s.z), s.r);
    }
    // круги ракет босса
    this.fx.marks.forEach((m, i) => {
      const k = g.marks[i];
      m.visible = !!k;
      if (k) {
        m.position.set(k.x, k.y + 0.05, k.z);
        const pulse = 0.6 + 0.4 * Math.sin(t * 18);
        m.scale.setScalar(k.r * (1 + Math.max(0, k.t) * 0.3));
        m.material.color.setRGB(2.2 * pulse, 0.2 * pulse, 0.1 * pulse);
      }
    });
    this.fx.update(dt);
    this.built.update(dt, t, cam);
    // пост-обработка: урон, мало щита, вспышки
    this.hurtK = Math.max(0, this.hurtK - real * 1.8);
    this.flashK.multiplyScalar(Math.exp(-real * 5));
    const u = this.grade.uniforms;
    u.hurt.value = Math.min(1, this.hurtK);
    u.low.value = p.alive ? clamp((40 - p.hp) / 40, 0, 1) : 1;
    u.flash.value.copy(this.flashK);
    u.time.value = t;
    u.vig.value = 0.38 + p.aim * (W.scope ? 0 : 0.2);
    this.render(real);
  }
  render(real) {
    // тени: на «Высоком» обновляются через кадр (роботы отбрасывают тень), иначе — один раз
    if (this.q.shadows && this.q.shadowDyn) {
      this.shadowFrames++;
      if (this.shadowFrames % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    }
    this.composer.render(real);
    this.trackFps(real);
  }
  // адаптивное разрешение и понижение уровня, если кадров мало
  trackFps(real) {
    const f = this.fps;
    f.frames++;
    f.t += real;
    if (f.t < 1) return;
    f.avg = f.frames / f.t;
    f.frames = 0;
    f.t = 0;
    if (this.fixedQuality) return;
    if (f.avg < 45) {
      f.slow++;
      f.fast = 0;
      if (this.scale > 0.6) {
        this.scale = Math.max(0.6, this.scale * 0.87);
        this.resize();
      } else if (f.slow >= 3) {
        // разрешение уже снижено — снимаем тяжёлое
        if (this.tier === "high") this.setTier("mid");
        else if (this.tier === "mid") this.setTier("low");
        f.slow = 0;
        this.onTier && this.onTier(this.tier);
      }
    } else if (f.avg > 57) {
      f.slow = 0;
      f.fast++;
      if (f.fast >= 3 && this.scale < 1) {
        this.scale = Math.min(1, this.scale * 1.08);
        this.resize();
        f.fast = 0;
      }
    }
  }

  updateViewmodel(g, dt, look, speed) {
    const p = g.player;
    const W = g.weapon();
    this.holdGun(W.id);
    const vm = this.vm, gun = this.gun;
    const H = holdOf(W.id);
    const aim = p.aim;
    // в оптике 2×/4× — прицел на весь экран, оружие прячется
    const scoped = W.scope && aim > 0.9;
    gun.visible = !scoped && p.alive;
    // покачивание от поворота взгляда
    vm.sway.x = lerp(vm.sway.x, clamp(-(look?.x || 0) * 1.6, -0.06, 0.06), 1 - Math.exp(-10 * dt));
    vm.sway.y = lerp(vm.sway.y, clamp((look?.y || 0) * 1.6, -0.05, 0.05), 1 - Math.exp(-10 * dt));
    vm.kick *= Math.exp(-14 * dt);
    vm.kickR *= Math.exp(-10 * dt);
    let x = lerp(H.hip[0], H.ads[0], aim), y = lerp(H.hip[1], H.ads[1], aim), z = lerp(H.hip[2], H.ads[2], aim);
    const bob = 1 - aim * 0.85;
    x += Math.cos(vm.bob) * 0.012 * speed * bob + vm.sway.x * bob;
    y += Math.abs(Math.sin(vm.bob)) * 0.014 * speed * bob + vm.sway.y * bob - (p.crouch * 0.01);
    z += vm.kick * 0.6;
    let rx = vm.kick * 1.2 + vm.sway.y * 2, ry = vm.sway.x * 2, rz = vm.kickR;
    // перезарядка: наклон, магазин вниз и обратно
    const magG = gun.userData.mag;
    magG.position.copy(gun.userData.magPos);
    if (p.reloadT > 0 && !W.melee) {
      if (W.shell) {
        const k = 1 - p.reloadT / W.reload;
        rz += 0.35;
        y -= 0.03;
        rx += Math.sin(k * Math.PI) * 0.18;
      } else {
        const k = clamp(1 - p.reloadT / W.reload, 0, 1);
        const dip = Math.sin(k * Math.PI);
        y -= dip * 0.06;
        rx -= dip * 0.35;
        rz += dip * 0.5;
        if (k > 0.15 && k < 0.75) magG.position.y -= Math.min(1, (k - 0.15) * 6) * 0.25 * (k < 0.5 ? 1 : (0.75 - k) * 4);
      }
    }
    // смена оружия: снизу вверх
    if (p.equipT > 0) {
      const k = clamp(p.equipT / W.equip, 0, 1);
      y -= k * 0.3;
      rx -= k * 0.6;
    }
    // граната: оружие уходит вниз
    if (p.throwT > 0 || p.throwing) y -= 0.18;
    // нож
    if (p.swingT > 0 || p.meleeT > 0.3) {
      const k = clamp((p.meleeT - 0.3) / 0.3, 0, 1);
      const s = Math.sin((1 - k) * Math.PI);
      x -= s * 0.14;
      rz -= s * 0.9;
      ry += s * 0.8;
      z -= s * 0.1;
    }
    gun.position.set(x, y, z);
    gun.rotation.set(rx, ry, rz);
    // вспышка у дула
    vm.flash -= dt;
    const fl = gun.userData.flash;
    if (fl) for (const m of fl) {
      m.visible = vm.flash > 0;
      if (m.visible) m.rotation.z = Math.random() * TAU;
    }
    this.vmFlash.intensity = vm.flash > 0 ? 8 : 0;
  }

  // ---------- Роботы и свои ----------
  updateAgents(g, dt, t) {
    const seen = new Set();
    let bi = 0;
    const d = blobDummy;
    for (const a of g.agents) {
      if (!a.alive) continue;
      seen.add(a.id);
      let m = this.models.get(a.id);
      if (!m) {
        const root = buildRobot(a.type, this.q, this.env);
        this.scene.add(root);
        m = { root, P: root.userData.parts, yaw: a.yaw, paint: root.userData.paint || [], coreMat: root.userData.coreMat, recoil: 0, step: 0, roll: new T.Quaternion(), spin: 0 };
        this.models.set(a.id, m);
      }
      this.animate(a, m, dt, t, g);
      // пятно тени
      if (!a.fly && a.type !== "glaz" && bi < 48) {
        const r = a.def.boss ? 5 : a.type === "molot" ? 2.4 : a.r * 2.6;
        d.position.set(a.x, (a.down ? a.y : a.y) + 0.02, a.z);
        d.scale.set(r, 1, r);
        d.updateMatrix();
        this.blob.setMatrixAt(bi++, d.matrix);
      }
    }
    d.scale.set(0, 0, 0);
    d.updateMatrix();
    for (let i = bi; i < 48; i++) this.blob.setMatrixAt(i, d.matrix);
    this.blob.instanceMatrix.needsUpdate = true;
    for (const [id, m] of this.models) {
      if (!seen.has(id)) {
        m.root.removeFromParent();
        this.models.delete(id);
      }
    }
  }
  // свет фонарей в точке (как запечён в стены) — для роботов
  lampLight(x, y, z, out) {
    out.set(0, 0, 0);
    for (const L of this.built.lamps) {
      const dx = L.x - x, dy = L.y - y, dz = L.z - z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > L.r) continue;
      const k = (1 - d / L.r) ** 2 * L.power * 0.7;
      out.x += L.c.r * k;
      out.y += L.c.g * k;
      out.z += L.c.b * k;
    }
    // в помещениях без солнца — немного рассеянного света
    if (this.theme.indoor || this.world.map.indoor) out.addScalar(0.05);
    return out;
  }
  animate(a, m, dt, t, g) {
    const P = m.P, root = m.root;
    m.ambT = (m.ambT || 0) - dt;
    if (m.ambT <= 0 && root.userData.amb) {
      m.ambT = 0.25;
      this.lampLight(a.x, a.y + 1, a.z, root.userData.amb);
    }
    // плавный поворот
    let dy = a.yaw - m.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    m.yaw += dy * Math.min(1, dt * 14);
    root.position.set(a.x, a.y, a.z);
    root.rotation.set(0, m.yaw, 0);
    const walk = a.walkPhase || 0;
    const sp = clamp((a.speedNow || 0) / 3, 0, 1.2);
    // вспышка при попадании и оглушение
    // вспышка попадания — только 80 мс после выстрела, чтобы под очередью робот не белел
    const flash = a.hurtT !== undefined ? Math.max(0, 1 - (g.t - a.hurtT) / 0.08) : 0;
    const fk = a.def.boss ? 0.07 : a.type === "molot" ? 0.12 : 0.24;
    for (const pm of m.paint) pm.emissive.setRGB(flash * fk, flash * fk * 0.85, flash * fk * 0.7);
    if (m.coreMat) {
      const base = m.coreMat.userData.base;
      let k = 0.85 + 0.15 * Math.sin(t * 5 + a.id);
      if (a.stunT > 0) {
        k = Math.random() < 0.5 ? 0.15 : 0.6;
        m.coreMat.color.setRGB(0.4 * k, 1.2 * k, 2.4 * k);
        if (Math.random() < dt * 14) this.fx.arc(new T.Vector3(a.x, a.y + (a.fly ? 0 : a.h * 0.6), a.z), a.def.boss ? 4 : 1.1);
      } else if (a.fuseT > 0) {
        k = Math.sin(t * 40) > 0 ? 2.2 : 0.3;
        m.coreMat.color.copy(base).multiplyScalar(k);
      } else if (a.def.boss) {
        m.coreMat.color.copy(base).multiplyScalar(a.vent > 0 ? 1.6 + Math.sin(t * 14) * 0.4 : 0.25);
      } else if (a.def.camera) {
        const aw = a.state === "combat" ? 1 : a.aware;
        m.coreMat.color.copy(base).multiplyScalar(0.5 + aw * 1.2);
      } else m.coreMat.color.copy(base).multiplyScalar(k);
    }
    switch (a.type) {
      case "zhuk":
        for (let i = 0; i < 4; i++) if (P["leg" + i]) P["leg" + i].rotation.x = Math.sin(walk * 2 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 * sp;
        P.body.position.y = 0.55 + Math.abs(Math.sin(walk * 2)) * 0.04 * sp;
        break;
      case "strelok":
      case "bastion":
      case "mate":
      case "vip": {
        const s = Math.sin(walk) * 0.7 * sp;
        if (P.legL) P.legL.rotation.x = s;
        if (P.legR) P.legR.rotation.x = -s;
        const bob = Math.abs(Math.cos(walk)) * 0.04 * sp;
        if (P.torso) P.torso.position.y = 0.88 + bob;
        if (P.head) P.head.position.y = 1.6 + bob;
        if (P.arms) {
          P.arms.position.y = 1.38 + bob;
          m.recoil *= Math.exp(-dt * 16);
          P.arms.position.z = m.recoil * 0.12;
          P.arms.rotation.x = -m.recoil * 0.2 + (a.state === "combat" || a.team === "squad" ? 0 : 0.35);
        }
        // голова к цели
        if (P.head && a.target && a.target.x !== undefined && a.state !== "idle") {
          const want = Math.atan2(-(a.target.x - a.x), -(a.target.z - a.z)) - m.yaw;
          P.head.rotation.y = clamp(Math.atan2(Math.sin(want), Math.cos(want)), -0.9, 0.9);
        } else if (P.head) P.head.rotation.y = Math.sin(t * 0.6 + a.id) * 0.4;
        if (a.type === "vip") {
          if (a.state === "captive") {
            root.position.y = a.y - 0.45;
            if (P.legL) P.legL.rotation.x = -1.4;
            if (P.legR) P.legR.rotation.x = -1.4;
            if (P.arms) P.arms.rotation.x = 0.4;
          } else if (a.down) {
            root.rotation.z = 1.4;
            root.position.y = a.y + 0.3;
          } else {
            root.rotation.z = 0;
            if (P.arms?.userData.glow) P.arms.userData.glow.visible = false;
            if (a.scared && P.torso) P.torso.rotation.x = 0.25;
          }
        }
        if (a.type === "bastion" && P.shield) {
          P.shield.visible = a.shield > 0;
          if (P.shieldPanel) {
            const on = a.stunT <= 0;
            P.shieldPanel.visible = on;
            P.shieldPanel.material.opacity = 0.22 + Math.sin(t * 9) * 0.05 + (a.flash || 0) * 0.3;
          }
        }
        break;
      }
      case "osa":
        if (P.rotors) for (const r of P.rotors) r.rotation.y += dt * 40;
        P.body.position.y = Math.sin(t * 2.4 + a.id) * 0.08;
        P.body.rotation.x = clamp(-(a.vx || 0) * 0.04, -0.3, 0.3);
        if (a.chargeT > 0 && a.beam) {
          const lens = new T.Vector3();
          P.core.getWorldPosition(lens);
          const k = 1 - a.chargeT / a.def.charge;
          this.fx.beam(lens, new T.Vector3(...a.beam), "#ff2a6a", 0.02 + k * 0.05, 2 + k * 4);
          if (Math.random() < 0.4) this.fx.add.spawn(lens, new T.Vector3(), "#ff4fd0", 0.08, 0.2 + k * 0.4, 0.1, { mult: 3 });
        }
        break;
      case "kolobok": {
        const v = Math.hypot(a.vx || 0, a.vz || 0);
        if (v > 0.05) {
          const axis = new T.Vector3(a.vz, 0, -a.vx).normalize();
          const q = new T.Quaternion().setFromAxisAngle(axis, (v * dt) / 0.46);
          m.roll.premultiply(q);
        }
        root.rotation.set(0, 0, 0);
        P.ball.quaternion.copy(m.roll);
        break;
      }
      case "molot": {
        const s = Math.sin(walk * 0.7) * 0.35 * sp;
        P.legL.rotation.x = s;
        P.legR.rotation.x = -s;
        P.torso.position.y = 1.55 + Math.abs(Math.cos(walk * 0.7)) * 0.06 * sp;
        const st = Math.floor(walk * 0.7 / Math.PI);
        if (st !== m.step) {
          m.step = st;
          if (sp > 0.2) Sound.stomp(a.x, a.z, false);
        }
        if (a.burst > 0 && P.gun) P.gun.rotation.z += dt * 30;
        break;
      }
      case "glaz":
        root.rotation.set(0, m.yaw, 0);
        if (P.cone) {
          const aw = a.stunT > 0 ? 0 : a.state === "combat" ? 1 : a.aware;
          P.cone.visible = a.stunT <= 0;
          P.cone.material.opacity = 0.05 + aw * 0.2;
          P.cone.material.color.setRGB(1.2 + aw, 0.3 - aw * 0.2, 0.1);
        }
        break;
      case "nakovalnya": {
        for (let i = 0; i < 4; i++) if (P["leg" + i]) P["leg" + i].rotation.x = Math.sin(walk * 0.6 + i * 1.6) * 0.25 * sp;
        P.torso.position.y = 3.6 + Math.sin(walk * 1.2) * 0.1 * sp + Math.sin(t * 1.3) * 0.05;
        if (P.vents) for (const v of P.vents) {
          const open = a.vent > 0 ? 1 : 0;
          v.cur = lerp(v.cur || 0, open, 1 - Math.exp(-dt * 8));
          v.g.position.x = v.sd * (0.02 + v.cur * 1.1);
        }
        const st = Math.floor(walk * 0.6 / Math.PI);
        if (st !== m.step) {
          m.step = st;
          if (sp > 0.1) {
            Sound.stomp(a.x, a.z, true);
            this.kick(0.25, a.x, a.z);
          }
        }
        if (a.vent > 0 && Math.random() < dt * 20) {
          const c = new T.Vector3();
          P.core.getWorldPosition(c);
          this.fx.puff(c, "#d0c8c0", 1, 0.8, 1.2, 1.5, 0.35);
        }
        break;
      }
    }
  }
  updateProjectiles(g, dt) {
    this.nadeMeshes.forEach((m, i) => {
      const n = g.nades[i];
      m.visible = !!n;
      if (n) {
        m.position.set(n.x, n.y, n.z);
        m.rotation.x += dt * 12;
        m.children[0].material.color.set(n.kind === "emp" ? "#5fd8ff" : n.kind === "smoke" ? "#c9d2dc" : "#ffb03a").multiplyScalar(2);
      }
    });
    this.rocketMeshes.forEach((m, i) => {
      const r = g.rockets[i];
      m.visible = !!r;
      if (r) {
        m.position.set(r.x, r.y, r.z);
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(r.vx, r.vy, r.vz).normalize());
        if (Math.random() < 0.9) this.fx.smoke.spawn(m.position, new T.Vector3((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4), "#8a8480", 1.2, 0.15, 0.6, { alpha: 0.6 });
        this.fx.add.spawn(m.position, new T.Vector3(), "#ffb050", 0.08, 0.35, 0.1, { mult: 3 });
      }
    });
  }

  // ---------- События ----------
  kick(amount, x, z) {
    let k = amount;
    if (x !== undefined && this.camera) {
      const d = Math.hypot(x - this.camera.position.x, z - this.camera.position.z);
      k = amount / (1 + d / 8);
    }
    this.trauma = Math.min(1, this.trauma + k);
  }
  // точка дула в мире (оружие в руках рисуется отдельно — пересчитываем от камеры)
  muzzleWorld(g, out = new T.Vector3()) {
    const p = g.player, cam = this.camera;
    const aim = p.aim;
    const fwd = lookDir(p.yaw, p.pitch);
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const s = lerp(0.14, 0.0, aim), dn = lerp(0.11, 0.06, aim), f = 0.6;
    out.set(cam.position.x + fwd[0] * f + right[0] * s, cam.position.y + fwd[1] * f - dn, cam.position.z + fwd[2] * f + right[2] * s);
    return out;
  }
  handle(g, e) {
    const fx = this.fx;
    const V3 = (x, y, z) => new T.Vector3(x, y, z);
    switch (e.type) {
      case "shot": {
        const W = WEAPON_FEEL[e.weapon] || WEAPON_FEEL.shkval;
        Sound.shot(e.weapon);
        this.vm.kick += W.kick;
        this.vm.kickR += (Math.random() - 0.5) * W.roll;
        this.vm.flash = 0.045;
        this.kick(W.shake);
        const mz = this.muzzleWorld(g);
        fx.flash(mz, "#ffcf8a", W.light, 7, 0.06);
        const dir = V3(...lookDir(g.player.yaw, g.player.pitch));
        if (!(g.player.aim > 0.9 && W.scope)) fx.muzzle(mz.clone().addScaledVector(dir, 0.15), dir, "#ffc070", W.flash);
        this.tracerN = (this.tracerN || 0) + 1;
        e.hits.forEach((h, i) => {
          if (i < 4 && (W.every <= 1 || this.tracerN % W.every === 0)) fx.tracer(mz, V3(h.x, h.y, h.z), "#ffd890", W.width, 3.2, 300);
        });
        if (!W.noCase) {
          const right = V3(Math.cos(g.player.yaw), 0, -Math.sin(g.player.yaw));
          fx.casing(mz.clone().addScaledVector(dir, -0.3), right.multiplyScalar(2.5 + Math.random()).add(V3(0, 2.2, 0)).addScaledVector(dir, -0.5));
        }
        break;
      }
      case "enemyFire": {
        const c = ROBOT_TRACER[e.type] || TEAM_TRACER[e.team];
        fx.muzzle(V3(e.x, e.y, e.z), V3(0, 0, 0), c, e.type === "molot" || e.type === "nakovalnya" ? 1.4 : 0.8);
        if (Math.hypot(e.x - this.camera.position.x, e.z - this.camera.position.z) < 25) fx.flash(V3(e.x, e.y, e.z), c, 6, 5, 0.05);
        Sound.enemyShot(e.type, e.x, e.z);
        const m = this.models.get(e.id);
        if (m) m.recoil = 1;
        break;
      }
      case "tracer": {
        const c = e.team === "squad" ? "#5fd8ff" : ROBOT_TRACER[e.type] || "#ff5a2a";
        const a = V3(e.x0, e.y0, e.z0), b = V3(e.x1, e.y1, e.z1);
        // пролёт рядом с игроком — свист и сильнее след
        fx.tracer(a, b, c, e.type === "osa" ? 0.12 : 0.06, e.type === "osa" ? 5 : 3, e.type === "osa" ? 600 : 140);
        break;
      }
      case "impact":
        fx.impact(e);
        if (e.kind === "shield") Sound.shieldHit(e.x, e.z);
        break;
      case "glass":
        this.built.breakGlass(e.box);
        fx.glass(e);
        Sound.glass(e.x, e.z);
        break;
      case "hitmark":
        Sound.hit(e.core, e.kill);
        break;
      case "kill": {
        const m = this.models.get(e.id);
        const big = e.type === "molot" ? 1.6 : e.boss ? 3 : e.type === "glaz" || e.type === "mishen" ? 0.4 : 1;
        const c = V3(e.x, e.y + (e.type === "osa" ? 0 : big * 0.8), e.z);
        if (m) {
          fx.breakup(m.root, c, e.boss ? 1.6 : 1);
          m.root.removeFromParent();
          this.models.delete(e.id);
        }
        if (e.type !== "kolobok") {
          fx.sparks(c, 26 * big, null, "#ffe0a0", 8 * Math.min(2, big), { size: 0.06, mult: 4 });
          fx.puff(c, "#2a2522", 4 * big, 0.35 * big, 1.4, 1.2, 0.55);
          fx.bolts(c, Math.round(8 * big));
          fx.add.spawn(c, V3(0, 0, 0), "#ffe0b0", 0.12, 0.6 * big, 1.6 * big, { mult: 4 });
          fx.flash(c, "#ffb060", 25 * big, 8 * big, 0.25);
          if (e.type !== "mishen") fx.wave(c, 2.2 * big, "#ffc080", 0.35, true, false);
        }
        Sound.death(e.x, e.z, big > 1.2);
        if (e.boss) {
          for (let i = 0; i < 6; i++) setTimeout(() => this.fx && this.fx.explosion(V3(e.x + (Math.random() - 0.5) * 6, e.y + 2 + Math.random() * 4, e.z + (Math.random() - 0.5) * 6), 4, "boss"), i * 260);
          this.kick(1);
          Sound.explosion(e.x, e.z, 2);
        }
        break;
      }
      case "explosion": {
        fx.explosion(V3(e.x, e.y, e.z), e.r, e.kind);
        Sound.explosion(e.x, e.z, e.kind === "roller" ? 0.7 : 1);
        this.kick(e.kind === "rocket" ? 0.5 : 0.75, e.x, e.z);
        break;
      }
      case "emp":
        fx.emp(V3(e.x, e.y, e.z), e.r);
        Sound.emp(e.x, e.z);
        this.kick(0.3, e.x, e.z);
        if (Math.hypot(e.x - g.player.x, e.z - g.player.z) < e.r * 1.5) this.flashK.set(0.08, 0.18, 0.3);
        break;
      case "smoke":
        Sound.smoke(e.x, e.z);
        break;
      case "hurt":
        Sound.hurt(e.blast);
        this.hurtK = Math.min(1.2, this.hurtK + 0.25 + e.amount * 0.02);
        this.kick(Math.min(0.35, 0.08 + e.amount * 0.012));
        break;
      case "shieldBreak":
        fx.sparks(V3(e.x, e.y, e.z), 30, null, "#9fe8ff", 8, { mult: 3, to: "#3f8fff" });
        fx.wave(V3(e.x, e.y, e.z), 2.5, "#7fd8ff", 0.4, false, true);
        Sound.shieldBreak();
        break;
      case "reload":
        Sound.reload(e.weapon);
        break;
      case "reloaded":
        Sound.reloaded();
        break;
      case "shell":
        Sound.shell();
        break;
      case "equip":
        Sound.equip();
        break;
      case "dry":
        Sound.dry();
        break;
      case "swing":
        Sound.swing(false);
        break;
      case "pin":
        Sound.pin();
        break;
      case "throw":
        Sound.throw();
        break;
      case "bounce":
        Sound.bounce(e.x, e.z);
        break;
      case "step":
        Sound.step(e.surface, e.loud);
        if (e.surface === "water") fx.puff(V3(e.x, g.player.y + 0.1, e.z), "#a8c0d0", 2, 0.25, 0.5, 0.8, 0.5);
        break;
      case "land":
        Sound.land(e.v);
        this.eyeSmooth -= Math.min(0.12, e.v * 0.012);
        break;
      case "jump":
        Sound.jump();
        break;
      case "charge":
        Sound.charge(g.agents.find((a) => a.id === e.id)?.x, g.agents.find((a) => a.id === e.id)?.z);
        break;
      case "snipe":
        Sound.snipe(e.x, e.z);
        fx.flash(V3(e.x, e.y, e.z), "#ff3fd0", 30, 10, 0.2);
        break;
      case "beep": {
        const a = g.agents.find((q) => q.id === e.id);
        if (a) Sound.beep(a.x, a.z);
        break;
      }
      case "spinup": {
        const a = g.agents.find((q) => q.id === e.id);
        if (a) Sound.spinup(a.x, a.z);
        break;
      }
      case "rocket":
        Sound.rocket(e.x, e.z);
        break;
      case "spotted": {
        const a = g.agents.find((q) => q.id === e.id);
        if (a) Sound.spotted(a.x, a.z);
        break;
      }
      case "robotAlert": {
        const a = g.agents.find((q) => q.id === e.id);
        if (a && Math.random() < 0.5) Sound.alert(a.x, a.z);
        break;
      }
      case "alarm":
        Sound.alarm();
        break;
      case "radio":
        Sound.radio();
        break;
      case "kit":
        Sound.kit();
        if (e.kind === "battery") this.flashK.set(0.0, 0.08, 0.16);
        break;
      case "planted":
        Sound.planted();
        break;
      case "relayBoom":
      case "bombBoom":
        fx.explosion(V3(e.x, e.y + 1, e.z), 5, "relay");
        Sound.explosion(e.x, e.z, 1.6);
        this.kick(0.8, e.x, e.z);
        break;
      case "mateDown":
        fx.wave(V3(e.x, e.y + 1, e.z), 1.5, "#5fd8ff", 0.5, true, true);
        fx.add.spawn(V3(e.x, e.y + 1, e.z), V3(0, 3, 0), "#9fe8ff", 0.6, 1.5, 0.2, { mult: 3 });
        break;
      case "ventOpen":
        Sound.vent();
        break;
      case "bossPhase":
        Sound.bossRoar();
        this.kick(0.6);
        break;
      case "stun":
        break;
      case "trainStep":
      case "hacked":
      case "defused":
      case "rescued":
        Sound.done();
        break;
      case "credits":
        Sound.credits();
        break;
    }
  }
  // экранные координаты точки мира (для меток), null — за спиной
  project(x, y, z, out = {}) {
    const v = projV.set(x, y, z).project(this.camera);
    out.behind = v.z > 1;
    out.x = ((v.x + 1) / 2) * innerWidth;
    out.y = ((1 - v.y) / 2) * innerHeight;
    return out;
  }

  // ---------- Меню: облёт карты ----------
  vista(mapId = "port", time = "dusk", weather = "drizzle") {
    const world = new World(getMap(mapId));
    this.load(world, { time, weather, map: mapId }, {});
    this.vistaT = 0;
    // декорации: бойцы отряда и роботы на карте
    const props = [
      ["mate", 1.5, -24, Math.PI * 0.85], ["mate", -0.2, -25.5, Math.PI * 0.95], ["mate", 3.2, -25.8, Math.PI * 0.7],
      ["strelok", 6, -14.8, 0.2], ["zhuk", 2, -8, 2.6], ["molot", 12, -7, -0.4], ["bastion", -3, -7, 0.6], ["osa", 8, -9, 0],
    ];
    this.vistaProps = props.map(([type, x, z, yaw], i) => {
      const root = buildRobot(type, this.q, this.env);
      const y = type === "osa" ? 6 : world.groundAt(x, z, 0.4, 3);
      root.position.set(x, y, z);
      root.rotation.y = yaw;
      this.scene.add(root);
      return { root, type, base: y, i };
    });
    this.renderer.shadowMap.needsUpdate = true;
    if (this.gun) this.gun.removeFromParent();
    this.vm.lastId = "";
    this.gun = null;
  }
  vistaFrame(dt, shot = null) {
    if (!this.scene) return;
    this.vistaT += dt;
    const t = this.vistaT;
    const cam = this.camera;
    if (shot) {
      cam.position.set(...shot.pos);
      cam.lookAt(...shot.look);
    } else {
      // медленный облёт двора с причала: отряд внизу, роботы в проулках, краны и закат
      const a = t * 0.04;
      cam.position.set(4 + Math.sin(a) * 9, 6.8 + Math.sin(t * 0.13) * 0.5, -36.5);
      cam.lookAt(6 + Math.sin(a) * 4, 1.2, -7);
    }
    if (Math.abs(cam.fov - 60) > 0.1) {
      cam.fov = 60;
      cam.updateProjectionMatrix();
    }
    for (const p of this.vistaProps || []) {
      const P = p.root.userData.parts;
      if (p.type === "osa") {
        p.root.position.y = p.base + Math.sin(t * 2 + p.i) * 0.25;
        if (P.rotors) for (const r of P.rotors) r.rotation.y += dt * 40;
      }
      if (P.head) P.head.rotation.y = Math.sin(t * 0.5 + p.i) * 0.5;
      const cm = p.root.userData.coreMat;
      if (cm) cm.color.copy(cm.userData.base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 4 + p.i));
    }
    // витрина оружия в арсенале: ствол крупно справа, медленно вращается
    if (this.showcase) {
      if (this.vm.lastId !== "show-" + this.showcase) {
        this.vm.lastId = "";
        this.holdGun(this.showcase);
        this.vm.lastId = "show-" + this.showcase;
        for (const m of this.gun.children) if (m.material === modelMats(this.q, this.env).cloth) m.visible = false;
      }
      const wide = innerWidth / innerHeight > 1.3;
      this.gun.visible = true;
      const pose = this.showcasePose;
      if (pose) {
        this.gun.position.set(...pose.pos);
        this.gun.rotation.set(...pose.rot);
        this.gun.scale.setScalar(pose.scale || 1);
      } else {
        this.gun.position.set(wide ? 0.2 : 0.12, wide ? -0.02 : -0.08, -0.85);
        this.gun.rotation.set(0.15 + Math.sin(t * 0.7) * 0.06, Math.PI / 2 + Math.sin(t * 0.45) * 0.55, 0);
        this.gun.scale.setScalar(1.25);
      }
      for (const f of this.gun.userData.flash || []) f.visible = false;
    } else if (this.gun && this.vm.lastId.startsWith("show-")) {
      this.gun.removeFromParent();
      for (const m of this.gun.children) m.visible = true;
      this.gun.scale.setScalar(1);
      this.gun = null;
      this.vm.lastId = "";
    }
    this.fx.update(dt);
    this.built.update(dt, t, cam);
    const u = this.grade.uniforms;
    u.hurt.value = 0;
    u.low.value = 0;
    u.flash.value.set(0, 0, 0);
    u.time.value = t;
    u.vig.value = 0.5;
    this.render(dt);
  }
}
const projV = new T.Vector3();
const blobDummy = new T.Object3D();
// ощущение стволов: отдача модели, тряска, вспышка, трассеры
const WEAPON_FEEL = {
  iskra: { kick: 0.06, roll: 0.05, shake: 0.06, light: 14, flash: 0.7, width: 0.035, every: 1 },
  grom: { kick: 0.14, roll: 0.14, shake: 0.16, light: 22, flash: 1.0, width: 0.04, every: 1 },
  strizh: { kick: 0.035, roll: 0.05, shake: 0.05, light: 12, flash: 0.75, width: 0.03, every: 2 },
  taran: { kick: 0.2, roll: 0.12, shake: 0.28, light: 30, flash: 1.5, width: 0.03, every: 1 },
  shkval: { kick: 0.05, roll: 0.06, shake: 0.08, light: 16, flash: 0.9, width: 0.035, every: 2 },
  sokol: { kick: 0.1, roll: 0.06, shake: 0.14, light: 20, flash: 1.0, width: 0.045, every: 1 },
  igla: { kick: 0.2, roll: 0.08, shake: 0.3, light: 28, flash: 1.3, width: 0.06, every: 1 },
  bur: { kick: 0.05, roll: 0.08, shake: 0.1, light: 18, flash: 1.1, width: 0.04, every: 2 },
  rezak: { kick: 0, roll: 0, shake: 0, light: 0, flash: 0, width: 0, every: 99, noCase: true },
};
let FLASH = null;
function flashTex() {
  if (FLASH) return FLASH;
  FLASH = canvasTexture(64, 64, (c, w) => {
    c.translate(w / 2, w / 2);
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3);
      const g = c.createLinearGradient(0, 0, w / 2, 0);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,200,120,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, -w * 0.06);
      c.lineTo(w / 2, 0);
      c.lineTo(0, w * 0.06);
      c.fill();
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.3);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,220,150,0)");
    c.fillStyle = g;
    c.fillRect(-w / 2, -w / 2, w, w);
  }, { clamp: true });
  return FLASH;
}
// материалы моделей зависят от уровня качества и карты окружения — пересоздаём при загрузке
function modelMatsReset() {
  modelMats.reset?.();
}
