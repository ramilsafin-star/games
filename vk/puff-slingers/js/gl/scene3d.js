// Трёхмерная отрисовка игры. Физика и правила остаются прежними: здесь только картинка.
// Мир устроен как сцена: всё действие в плоскости z = 0, поэтому координаты совпадают с физикой.
import * as T from '../../vendor/three/three.module.min.js?v=fdffe6b3';
import { Post } from './post.js?v=fdffe6b3';
import { Puffs } from './puffs.js?v=fdffe6b3';
import { Bots } from './bots.js?v=fdffe6b3';
import { Blocks, LevelProps, Sling } from './blocks.js?v=fdffe6b3';
import { Shards } from './shards.js?v=fdffe6b3';
import { Fireballs } from './fireballs.js?v=fdffe6b3';
import { Particles } from './particles.js?v=fdffe6b3';
import { buildWorld, lookOf, makeSky, setSkyFor, windowsTexture } from './worlds.js?v=fdffe6b3';

const TEXTURES = ['wood', 'wood_n', 'stone', 'stone_n', 'steel', 'steel_n', 'ice', 'ice_n', 'crate', 'crate_n', 'cracks', 'turf', 'turf_n', 'sand', 'sand_n', 'snow', 'snow_n', 'crag', 'crag_n', 'strata', 'strata_n', 'leaves', 'clouds', 'sprites'];
const LINEAR = /(_n|cracks|leaves|clouds|sprites)$/;
const FOV = 22;
// Камера чуть выше середины кадра: видно верхние грани блоков, но вертикали остаются прямыми
const LIFT = 26;
const SHELLS = [8, 12, 18];
const SUN_DIR = new T.Vector3(-0.46, 0.78, 0.42).normalize();

async function loadTextures() {
  const loader = new T.TextureLoader();
  const base = new URL('../../assets/tex/', import.meta.url).href;
  const out = {};
  await Promise.all(TEXTURES.map(async (name) => {
    const t = await loader.loadAsync(`${base}${name}.webp`);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = LINEAR.test(name) ? T.NoColorSpace : T.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    out[name] = t;
  }));
  ['leaves', 'clouds', 'sprites'].forEach((n) => {
    out[n].wrapS = out[n].wrapT = T.ClampToEdgeWrapping;
  });
  return out;
}

export async function createScene3D(canvas, force) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !force, alpha: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('нужен WebGL2');
  const tex = await loadTextures();
  return new Scene3D(renderer, tex);
}

class Contacts {
  constructor(stage) {
    this.capacity = 90;
    this.count = 0;
    const quad = new T.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    const g = new T.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.data = new Float32Array(this.capacity * 4);
    this.attr = new T.InstancedBufferAttribute(this.data, 4);
    this.attr.setUsage(T.DynamicDrawUsage);
    g.setAttribute('iData', this.attr);
    g.instanceCount = 0;
    this.geometry = g;
    const mesh = new T.Mesh(g, new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute vec4 iData; varying vec2 vUv; varying float vA;
        void main(){ vUv = uv * 2.0 - 1.0; vA = iData.w; gl_Position = projectionMatrix * viewMatrix * vec4(iData.x + position.x * iData.y, 1.4, position.z * iData.z, 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying float vA;
        void main(){ float r = length(vUv); float a = smoothstep(1.0, 0.0, r); gl_FragColor = vec4(0.03, 0.02, 0.03, a * a * vA); }`
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    stage.add(mesh);
  }

  add(x, w, d, alpha) {
    if (this.count >= this.capacity) return;
    this.data.set([x, w, d, alpha], this.count * 4);
    this.count++;
  }

  flush() {
    this.geometry.instanceCount = this.count;
    this.attr.needsUpdate = true;
    this.count = 0;
  }
}

class Scene3D {
  constructor(renderer, tex) {
    this.renderer = renderer;
    this.tex = tex;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.post = new Post(renderer);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(FOV, 1.5, 60, 40000);
    this.scene.add(this.camera);
    this.light = {
      sunDir: { value: SUN_DIR.clone() }, sunColor: { value: new T.Color() }, sky: { value: new T.Color() }, ground: { value: new T.Color() },
      shadowMap: { value: null }, shadowMatrix: { value: null }, hasShadow: { value: 0 }, shadowTexel: { value: 1 / 2048 }
    };
    this.fog = { color: { value: new T.Color() }, near: { value: 2000 }, far: { value: 8000 } };
    this.scene.fog = new T.Fog('#ffffff', 2000, 8000);
    this.sky = makeSky(this.light);
    this.scene.add(this.sky);
    this.hemi = new T.HemisphereLight('#ffffff', '#888888', 1);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.2;
    this.sun.shadow.radius = 2.5;
    const sc = this.sun.shadow.camera;
    sc.left = -1150;
    sc.right = 1150;
    sc.top = 780;
    sc.bottom = -520;
    sc.near = 200;
    sc.far = 3200;
    sc.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target);
    this.light.shadowMatrix.value = this.sun.shadow.matrix;
    // Слабый свет со стороны камеры: герои и постройки читаются даже ночью
    this.fill = new T.DirectionalLight('#ffffff', 0.3);
    this.fill.position.set(0, 300, 1000);
    this.scene.add(this.fill);
    this.stage = new T.Group();
    this.scene.add(this.stage);
    this.contacts = new Contacts(this.stage);
    this.particles = new Particles(this.stage, tex.sprites);
    this.blocks = new Blocks(this.stage, tex);
    this.shards = new Shards(this.stage, this.blocks.base);
    this.fireballs = new Fireballs(this.stage);
    this.props = new LevelProps(this.stage, tex);
    this.bots = new Bots(this.stage, tex.cracks);
    this.sling = new Sling(this.stage, tex);
    this.quality = 2;
    this.puffs = new Puffs(this.stage, this.light, SHELLS[2]);
    this.worlds = new Map();
    this.world = null;
    this.biome = -1;
    this.lastRocks = null;
    this.envCache = new Map();
    this.pmrem = new T.PMREMGenerator(renderer);
    this.shared = {
      win: null,
      windows: () => this.shared.win || (this.shared.win = windowsTexture())
    };
    this.size = [0, 0, 0];
    this.up = new T.Vector3(0, 1, 0);
  }

  // Отражения в металле и льду: небо мира и земля снизу
  envFor(biome) {
    if (this.envCache.has(biome)) return this.envCache.get(biome);
    const B = BIOMES[biome];
    const dome = new T.Scene();
    const geo = new T.SphereGeometry(100, 32, 16);
    const top = new T.Color(B.sky[0]);
    const mid = new T.Color(B.sky[1]);
    const low = new T.Color(B.sky[2]);
    const gnd = new T.Color(B.grass[1]).multiplyScalar(0.55);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 100;
      if (y < 0) c.copy(gnd);
      else if (y < 0.3) c.copy(low).lerp(mid, y / 0.3);
      else c.copy(mid).lerp(top, (y - 0.3) / 0.7);
      // Яркое пятно солнца даёт живые блики на металле
      const dot = (pos.getX(i) * SUN_DIR.x + pos.getY(i) * SUN_DIR.y + pos.getZ(i) * SUN_DIR.z) / 100;
      c.multiplyScalar(1.1 + Math.pow(Math.max(dot, 0), 16) * 5);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    dome.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const rt = this.pmrem.fromScene(dome, 0.02);
    this.envCache.set(biome, rt.texture);
    return rt.texture;
  }

  setBiome(i) {
    if (i === this.biome) return;
    this.biome = i;
    const look = lookOf(i);
    if (this.world) this.scene.remove(this.world.group);
    // Больше двух миров в памяти планшету держать незачем
    for (const [k, w] of this.worlds) {
      if (k !== i && w !== this.world) {
        w.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
          if (o.isInstancedMesh) o.dispose();
        });
        this.worlds.delete(k);
      }
    }
    if (!this.worlds.has(i)) this.worlds.set(i, buildWorld(i, this.tex, this.light, this.fog, this.shared, this.quality));
    this.world = this.worlds.get(i);
    this.world.grass.geometry.instanceCount = Math.round(this.world.grass.userData.full * [0.35, 0.65, 1][this.quality]);
    this.scene.add(this.world.group);
    this.light.sunColor.value.set(look.sun).multiplyScalar(look.sunI * 0.32);
    this.light.sky.value.set(look.sky).multiplyScalar(look.hemi * 0.72);
    this.light.ground.value.set(look.gnd).multiplyScalar(look.hemi * 0.48);
    this.fog.color.value.set(look.fog);
    this.scene.fog.color.set(look.fog);
    this.hemi.color.set(look.sky);
    this.hemi.groundColor.set(look.gnd);
    this.hemi.intensity = look.hemi;
    this.sun.color.set(look.sun);
    this.sun.intensity = look.sunI;
    this.fill.intensity = look.fill;
    this.fogFar = look.fogFar;
    this.scene.environment = this.envFor(i);
    this.scene.environmentIntensity = look.env;
    setSkyFor(this.sky, i);
    this.post.final.uniforms.uExposure.value = look.exposure;
    this.post.final.uniforms.uBloom.value = look.bloom;
    this.puffs.setGlint(look.bloom);
    this.fireballs.setLight(look.sunI > 2.5 ? 1 : 0.72);
    this.post.final.uniforms.uSaturation.value = look.sat;
    this.post.extract.uniforms.uThreshold.value = 1.05;
  }

  resize(vw, vh, dpr, quality) {
    const cap = quality >= 2 ? 2 : quality === 1 ? 1.5 : 1;
    // На больших экранах достаточно примерно трёх мегапикселей, иначе видеокарта упирается в заливку
    const budget = quality >= 2 ? 3.3e6 : quality === 1 ? 2.2e6 : 1.3e6;
    const pr = Math.min(dpr, cap, Math.sqrt(budget / (vw * vh)));
    if (this.size[0] !== vw || this.size[1] !== vh || this.size[2] !== pr || this.quality !== quality) {
      this.size = [vw, vh, pr];
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(vw, vh, false);
      const samples = quality >= 2 ? 4 : quality === 1 ? 2 : 0;
      this.post.setSize(Math.round(vw * pr), Math.round(vh * pr), samples, quality >= 2 ? 4 : 3);
      this.applyQuality(quality);
    }
  }

  applyQuality(q) {
    if (q === this.quality && this.sun.shadow.map) return;
    this.quality = q;
    this.puffs.setShells(SHELLS[q]);
    this.fireballs.quality = q;
    this.shards.setQuality(q);
    const size = q >= 2 ? 2048 : q === 1 ? 1536 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    if (this.world) this.world.grass.geometry.instanceCount = Math.round(this.world.grass.userData.full * [0.35, 0.65, 1][q]);
    this.usePost = this.post.enabled && q >= 1;
    this.renderer.toneMapping = this.usePost ? T.NoToneMapping : T.ACESFilmicToneMapping;
  }

  syncCamera(v) {
    const h = v.vh / v.zoom;
    const D = h / 2 / Math.tan(T.MathUtils.degToRad(FOV / 2));
    const viewY = GROUND_Y - v.y + v.sy / v.zoom;
    const viewX = v.x - v.sx / v.zoom;
    const eyeY = viewY + LIFT;
    const cam = this.camera;
    cam.fov = FOV;
    cam.aspect = v.vw / v.vh;
    cam.near = Math.max(40, D * 0.08);
    cam.far = D + 40000;
    cam.position.set(viewX, eyeY, D);
    cam.rotation.set(0, 0, v.tilt);
    cam.updateProjectionMatrix();
    // Сдвиг объектива: плоскость игры попадает точно в прежние координаты
    const shift = (viewY - eyeY) / (h / 2);
    cam.projectionMatrix.elements[9] = shift;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    const fogNear = D + 120;
    this.scene.fog.near = fogNear;
    this.scene.fog.far = D + (this.fogFar || 6200);
    this.fog.near.value = fogNear;
    this.fog.far.value = D + (this.fogFar || 6200);
    const u = this.sky.material.uniforms;
    u.uHorizon.value = 0.5 - shift * 0.5;
    u.uAspect.value = cam.aspect;
    u.uPar.value = (v.x - 640) * 0.00004;
    // Тень накрывает то, что сейчас в кадре
    const cx = Math.round(viewX / 8) * 8;
    this.sun.target.position.set(cx, 120, 0);
    this.sun.position.set(cx + SUN_DIR.x * 1600, 120 + SUN_DIR.y * 1600, SUN_DIR.z * 1600);
  }

  drawHeroes(t) {
    const P = this.puffs;
    P.begin(t);
    const G = GROUND_Y;
    // Очередь на земле
    const n = queueView.length;
    for (let i = n - 1; i >= 0; i--) {
      const q = queueView[i];
      q.x += (queueX(i) - q.x) * 0.16;
      const r = HEROES[q.type].r;
      const hop = cheerT > 0 ? Math.abs(Math.sin(t * 11 + i)) * 15 : Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 2.6;
      const blink = (t * 1000 + i * 941) % 3300 < 120;
      P.draw(q.type, q.x, r + hop + 2, r, { lookX: 0.8, lookY: -0.1, blink, mood: cheerT > 0 ? 'happy' : 'angry', squish: hop > 8 ? -0.05 : 0 });
      if (q.type === 'dyna') this.fuseGlow(q.x, r + hop + 2, r, t);
    }
    // На рогатке
    const s = slingHero;
    let heroR = 0;
    if (s) {
      let x = s.x;
      let y = s.y;
      let look = { x: 0.9, y: -0.1 };
      if (s.hop < 1) {
        const k = s.hop;
        x = lerp(s.fromX, SLING_X, k);
        y = lerp(s.fromY, SLING_Y, k) - Math.sin(k * Math.PI) * 90;
      } else {
        heroR = s.r;
        if (pull) {
          x += pull.x;
          y += pull.y;
          const len = Math.hypot(pull.x, pull.y) || 1;
          look = { x: -pull.x / len, y: -pull.y / len };
        }
      }
      const tension = pull ? Math.hypot(pull.x, pull.y) / MAX_PULL : 0;
      if (tension > 0.92) {
        x += Math.sin(t * 70) * 0.8;
        y += Math.cos(t * 63) * 0.8;
      }
      const breath = Math.sin(t * 3) * 0.018;
      const blink = (t * 1000) % 2600 < 110;
      P.draw(s.type, x, G - y, s.r, { lookX: look.x, lookY: look.y, blink: blink && !pull, mood: 'angry', squish: s.squish + breath + tension * 0.07 });
      if (s.type === 'dyna') this.fuseGlow(x, G - y, s.r, t);
    }
    const pouch = pouchPos();
    this.sling.update(pouch.x, pouch.y, heroR);
    // В полёте
    for (const h of flying) {
      const v = Matter.Body.getVelocity(h);
      const sp = Math.hypot(v.x, v.y) || 1;
      const lookX = v.x / sp;
      const lookY = v.y / sp;
      const blink = h.hasHit && (t * 1000 + h.id * 733) % 2900 < 110;
      P.draw(h.heroType, h.position.x, G - h.position.y, h.circleRadius, {
        lookX,
        lookY,
        blink,
        mood: h.hurtT > 0 ? 'hurt' : h.hasHit ? 'angry' : 'scream',
        rot: h.drillT > 0 ? Math.atan2(lookY, lookX) + Math.PI / 2 : h.hasHit ? h.angle : 0,
        stretch: h.hasHit || h.drillT > 0 ? 0 : Math.min(0.26, sp / 95),
        stretchAngle: Math.atan2(lookY, lookX),
        squish: h.squish,
        fuse: h.fuse > 0 || h.drillT > 0,
        flash: h.fuse > 0 ? 0.4 + Math.sin(t * 22) * 0.4 : 0,
        vx: v.x,
        vy: -v.y
      });
      // След за пуфом
      const tr = h.trail;
      const count = tr.length / 2;
      if (count >= 2) {
        const col = HEROES[h.heroType].trail;
        const boost = h.dashT > 0 ? 1.6 : 1;
        for (let i = 0; i < count; i += this.quality === 0 ? 2 : 1) {
          const k = i / count;
          const size = h.circleRadius * (0.8 + k * 2.6) * boost;
          this.particles.glow(tr[i * 2], G - tr[i * 2 + 1], -4, size, col, k * k * 0.6, 1.5);
        }
      }
    }
  }

  // Искра на запале Динамита
  fuseGlow(x, y, r, t) {
    const pulse = 0.5 + 0.35 * Math.sin(t * 31 + x);
    this.particles.glow(x + r * 0.34, y + r * 2.06, 14, r * 1.6, '#ff9a2e', pulse);
  }

  // Мягкое затемнение там, где предмет стоит на земле
  drawContacts() {
    const C = this.contacts;
    const reach = 46;
    for (const b of blocks) {
      const c = Math.abs(Math.cos(b.angle));
      const s = Math.abs(Math.sin(b.angle));
      const halfW = b.w * c / 2 + b.h * s / 2;
      const halfH = b.w * s / 2 + b.h * c / 2;
      const gap = GROUND_Y - b.position.y - halfH;
      if (gap < reach) C.add(b.position.x, halfW * 2 + 26, 96, 0.62 * (1 - Math.max(0, gap) / reach));
    }
    for (const b of bots) {
      const gap = GROUND_Y - b.position.y - b.circleRadius;
      if (gap < reach) C.add(b.position.x, b.circleRadius * 2.5, b.circleRadius * 2.5, 0.66 * (1 - Math.max(0, gap) / reach));
    }
    for (const h of flying) {
      const gap = GROUND_Y - h.position.y - h.circleRadius;
      if (gap < reach) C.add(h.position.x, h.circleRadius * 2.5, h.circleRadius * 2.5, 0.6 * (1 - Math.max(0, gap) / reach));
    }
    for (let i = 0; i < queueView.length; i++) {
      const q = queueView[i];
      const r = HEROES[q.type].r;
      C.add(q.x, r * 2.4, r * 2.4, 0.6);
    }
    C.add(SLING_X, 54, 54, 0.6);
    C.flush();
  }

  draw(v) {
    this.setBiome(cfg.biome);
    if (rocks !== this.lastRocks) {
      this.lastRocks = rocks;
      this.shards.clear();
      this.fireballs.clear();
      this.props.rebuild(cfg.biome, rocks, portals, wells, gems);
    }
    this.resize(v.vw, v.vh, v.dpr, v.quality);
    this.syncCamera(v);
    const t = v.time;
    this.sky.material.uniforms.uTime.value = t;
    this.world.update(t);
    this.drawHeroes(t);
    this.blocks.draw(blocks, t, this.particles);
    this.shards.update(t);
    this.fireballs.update(t);
    this.bots.draw(bots, t, this.particles);
    this.props.draw(t, this.particles, orbs);
    this.drawContacts();
    this.particles.drawFX(FX, GROUND_Y);
    this.particles.flush();
    if (this.usePost) this.post.render(this.scene, this.camera);
    else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
    // Карта теней появляется после первого кадра, тогда её получает и трава
    const map = this.sun.shadow.map;
    this.light.hasShadow.value = map ? 1 : 0;
    if (map) {
      this.light.shadowMap.value = map.texture;
      this.light.shadowTexel.value = 1 / map.width;
    }
  }
}
