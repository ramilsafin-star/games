// Сцена карты: коробки мира сливаются в несколько больших сеток (по рисунку поверхности),
// свет фонарей и затенение у стен запекаются в вершины при загрузке (живых ламп почти нет).
// Плюс стекло, украшения, небо, погода и объёмные конусы света.
import { T, PRIM, Shape, canvasTexture, glowTexture, TAU, noiseRand } from "./kit.js?v=fe308c19";
import { SKINS } from "./maps.js?v=fe308c19";
import { surfaceTexture, serverGlowTexture, signTexture, TEX_SCALE, TEX_PBR } from "./tex.js?v=fe308c19";

const col = new T.Color();
const linear = (hex) => new T.Color(hex); // three.js сам переводит sRGB → линейный

// ---------- Материалы с запечённым светом ----------
function bakeMaterial(kind, q, theme, o = {}) {
  const map = surfaceTexture(kind, q.tex);
  let [rough, metal] = TEX_PBR[kind] || [0.8, 0];
  if (o.wet && ["asphalt", "concrete", "metal", "corr", "tile", "hazard", "panel"].includes(kind)) rough *= kind === "asphalt" ? 0.32 : 0.6;
  const M = q.pbr ? T.MeshStandardMaterial : T.MeshLambertMaterial;
  const mat = new M({ map, vertexColors: true, ...(q.pbr ? { roughness: rough, metalness: metal, envMapIntensity: theme.envI ?? 1 } : {}) });
  if (kind === "server") {
    mat.emissiveMap = serverGlowTexture(q.tex);
    mat.emissive = new T.Color(1, 1, 1);
    mat.emissiveIntensity = 2.2;
  }
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBake = bake;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBake;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vBake * diffuseColor.rgb;");
  };
  mat.customProgramCacheKey = () => "bake" + (q.pbr ? 1 : 0);
  return mat;
}

// ---------- Сборщик граней с запеканием ----------
class Baker {
  constructor(world, lamps, theme, q) {
    this.world = world;
    this.lamps = lamps;
    this.theme = theme;
    this.q = q;
    this.groups = new Map(); // рисунок → массивы
  }
  group(kind) {
    if (!this.groups.has(kind)) this.groups.set(kind, { pos: [], nor: [], uv: [], col: [], bake: [], idx: [] });
    return this.groups.get(kind);
  }
  // свет ламп в точке с нормалью
  light(x, y, z, nx, ny, nz, out) {
    out[0] = out[1] = out[2] = 0;
    for (const L of this.lamps) {
      const dx = L.x - x, dy = L.y - y, dz = L.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.r * L.r) continue;
      const d = Math.sqrt(d2) || 1;
      let face = (dx * nx + dy * ny + dz * nz) / d;
      if (face <= 0.02) continue;
      face = 0.35 + 0.65 * face;
      let k = 1 - d / L.r;
      k = k * k * L.power * face;
      if (k < 0.01) continue;
      if (this.q.occlude && d > 0.8 && !this.world.sees(x + nx * 0.08, y + ny * 0.08, z + nz * 0.08, L.x, L.y, L.z, "bullet")) continue;
      out[0] += L.c.r * k;
      out[1] += L.c.g * k;
      out[2] += L.c.b * k;
    }
  }
  // прямоугольник (подразбит на клетки до step м): углы p0, p1 (вдоль u), p3 (вдоль v)
  quad(kind, o, u, v, n, lu, lv, color, uv0, uvScale, aoFn) {
    const G = this.group(kind);
    const nu = Math.max(1, Math.ceil(lu / this.q.step)), nv = Math.max(1, Math.ceil(lv / this.q.step));
    const base = G.pos.length / 3;
    const L = [0, 0, 0];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const a = i / nu, b = j / nv;
        const x = o[0] + u[0] * lu * a + v[0] * lv * b, y = o[1] + u[1] * lu * a + v[1] * lv * b, z = o[2] + u[2] * lu * a + v[2] * lv * b;
        G.pos.push(x, y, z);
        G.nor.push(n[0], n[1], n[2]);
        if (uvScale === 0) G.uv.push(a, b);
        else G.uv.push((uv0[0] + lu * a) / uvScale, (uv0[1] + lv * b) / uvScale);
        const ao = aoFn ? aoFn(x, y, z) : 1;
        G.col.push(color.r * ao, color.g * ao, color.b * ao);
        this.light(x, y, z, n[0], n[1], n[2], L);
        G.bake.push(L[0] * ao, L[1] * ao, L[2] * ao);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const k = base + j * (nu + 1) + i;
        G.idx.push(k, k + 1, k + nu + 2, k, k + nu + 2, k + nu + 1);
      }
  }
  // коробка мира
  box(b, floor) {
    const skin = SKINS[b.skin] || SKINS.concrete;
    const kind = skin.tex;
    const color = linear(b.color || skin.c);
    const c = b.c, s = b.s;
    // местные оси коробки в мире
    const ax = [c, 0, -s], az = [s, 0, c];
    const W = b.hw * 2, D = b.hd * 2, H = b.y1 - b.y0;
    const corner = (lx, y, lz) => [b.cx + lx * c + lz * s, y, b.cz - lx * s + lz * c];
    const scale = TEX_SCALE[kind] ?? 3;
    const crate = kind === "crate";
    const sc = crate ? 0 : scale;
    // тень у земли на боковых гранях
    const sideAO = (x, y) => 0.6 + 0.4 * Math.min(1, Math.max(0, (y - floor) / 1.3));
    const neg = (v) => [-v[0], -v[1], -v[2]];
    // верх
    this.quad(kind, corner(-b.hw, b.y1, -b.hd), ax, az, [0, 1, 0], W, D, color, [0, 0], crate ? 0 : scale, null);
    // стороны: +z, −z, +x, −x (нормали наружу); v — вверх
    const up = [0, 1, 0];
    const cs = kind === "corr" ? 2.6 : scale;
    this.quad(kind, corner(-b.hw, b.y0, b.hd), ax, up, az, W, H, color, [0, 0], crate ? 0 : cs, sideAO);
    this.quad(kind, corner(b.hw, b.y0, -b.hd), neg(ax), up, neg(az), W, H, color, [0, 0], crate ? 0 : cs, sideAO);
    this.quad(kind, corner(b.hw, b.y0, b.hd), neg(az), up, ax, D, H, color, [0, 0], crate ? 0 : cs, sideAO);
    this.quad(kind, corner(-b.hw, b.y0, -b.hd), az, up, neg(ax), D, H, color, [0, 0], crate ? 0 : cs, sideAO);
    // низ — только у висящих (перемычки)
    if (b.y0 > floor + 0.2) this.quad(kind, corner(-b.hw, b.y0, b.hd), ax, neg(az), [0, -1, 0], W, D, color, [0, 0], sc, null);
  }
  // земля с затенением у стен
  ground(kind, x0, z0, x1, z1, y, color) {
    const W = this.world;
    const ao = (x, yy, z) => {
      let g = 9;
      const list = W.near(x - 1.6, z - 1.6, x + 1.6, z + 1.6);
      for (const b of list) {
        if (b.inv || b.glass || b.y1 < y + 0.4 || b.y0 > y + 0.3) continue;
        g = Math.min(g, W.gap(b, x, z));
      }
      return 0.7 + 0.3 * Math.min(1, g / 1.6);
    };
    const step = this.q.step;
    this.q.step = Math.min(step, 1.5);
    this.quad(kind, [x0, y, z1], [1, 0, 0], [0, 0, -1], [0, 1, 0], x1 - x0, z1 - z0, color, [x0, -z1], TEX_SCALE[kind] ?? 4, ao);
    this.q.step = step;
  }
  meshes(theme, q, o) {
    const out = [];
    for (const [kind, G] of this.groups) {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(G.pos, 3));
      g.setAttribute("normal", new T.Float32BufferAttribute(G.nor, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(G.uv, 2));
      g.setAttribute("color", new T.Float32BufferAttribute(G.col, 3));
      g.setAttribute("bake", new T.Float32BufferAttribute(G.bake, 3));
      g.setIndex(G.idx);
      g.computeBoundingSphere();
      const mesh = new T.Mesh(g, bakeMaterial(kind, q, theme, o));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = "world-" + kind;
      out.push(mesh);
    }
    return out;
  }
}

// ---------- Небо ----------
function makeSky(theme, sunDir, sunK = 1) {
  const [top, mid, low] = theme.sky.map((c) => new T.Color(c));
  const mat = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: top }, mid: { value: mid }, low: { value: low }, sun: { value: sunDir.clone() }, sunCol: { value: new T.Color(theme.sunColor) }, night: { value: theme.stars ? 1 : 0 }, sunK: { value: sunK } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, mid, low, sunCol, sun; uniform float night, sunK; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y,0.0,1.0), 0.55)) : mix(mid, low * 0.6, clamp(-y*3.0,0.0,1.0));
        c = mix(c, low, exp(-abs(y) * 9.0) * 0.6);
        float s = max(dot(d, normalize(sun)), 0.0);
        c += sunCol * (pow(s, 900.0) * 18.0 * sunK * (1.0 - night * 0.6) + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
        if (night > 0.5 && y > 0.02) {
          vec2 g = floor(vec2(atan(d.z, d.x) * 180.0, y * 260.0));
          float st = step(0.9965, h21(g));
          c += vec3(st) * (0.6 + 0.4 * h21(g + 3.1)) * smoothstep(0.02, 0.25, y) * 1.4;
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(450, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---------- Материалы украшений ----------
function decorMats(q, envMap) {
  const S = q.pbr ? T.MeshStandardMaterial : T.MeshLambertMaterial;
  const paint = new S({ vertexColors: true, ...(q.pbr ? { roughness: 0.55, metalness: 0.35 } : {}) });
  const dark = new S({ vertexColors: true, ...(q.pbr ? { roughness: 0.7, metalness: 0.2 } : {}) });
  const glow = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
  void envMap;
  return { paint, dark, glow };
}

// ---------- Конусы света (объёмный свет) ----------
const coneMat = (color, k) =>
  new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    uniforms: { color: { value: new T.Color(color) }, k: { value: k }, time: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; varying float vD; void main(){ vY = uv.y; vec4 w = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz); vD = -w.z; gl_Position = projectionMatrix * w; }`,
    fragmentShader: `uniform vec3 color; uniform float k; varying float vY; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){ float rim = pow(abs(dot(vN, vV)), 1.6); float a = pow(vY, 2.2) * rim * k * smoothstep(55.0, 12.0, vD); gl_FragColor = vec4(color * a, 1.0); }`,
  });
function lightCone(color, len, radius, k) {
  const g = new T.CylinderGeometry(0.12, radius, len, 20, 1, true);
  g.translate(0, -len / 2, 0);
  const m = new T.Mesh(g, coneMat(color, k));
  m.renderOrder = 5;
  return m;
}

// ---------- Вода ----------
function waterMesh(w, h, color, q, deep = 0.65) {
  const g = new T.PlaneGeometry(w, h, 1, 1);
  g.rotateX(-Math.PI / 2);
  const tex = canvasTexture(256, 256, (c, W) => {
    c.fillStyle = "#808080";
    c.fillRect(0, 0, W, W);
    const r = noiseRand(77);
    for (let i = 0; i < 260; i++) {
      c.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.12})`;
      c.lineWidth = 1 + r() * 2;
      c.beginPath();
      const x = r() * W, y = r() * W;
      c.ellipse(x, y, 6 + r() * 30, 2 + r() * 5, 0, 0, TAU);
      c.stroke();
    }
  });
  tex.repeat.set(w / 14, h / 14);
  const S = q.pbr ? T.MeshStandardMaterial : T.MeshPhongMaterial;
  const mat = new S({ color, map: tex, transparent: true, opacity: deep, ...(q.pbr ? { roughness: 0.08, metalness: 0.3 } : { shininess: 80 }) });
  const mesh = new T.Mesh(g, mat);
  mesh.userData.tex = tex;
  return mesh;
}

// ---------- Сборка сцены ----------
export function buildScene(world, theme, o) {
  const map = world.map;
  const q = o.quality;
  const scene = new T.Scene();
  const floor = map.floor;
  const sunDir = new T.Vector3(...theme.sun).normalize();
  const wet = o.weather === "rain";
  // Фонари: в мире — по яркости времени суток; лампы внутри и ретрансляторы горят всегда
  const lampK = theme.lamps;
  const lamps = [];
  for (const L of map.lamps) {
    let k = L.inside || L.relay || L.furnace || L.neon || L.emergency || L.panel ? Math.max(0.85, lampK) : lampK;
    if (L.relay) k = 0.9;
    if (theme.emergency && L.strip) k *= 0.45;
    if (!k) continue;
    lamps.push({ ...L, c: new T.Color(L.color), power: L.power * k * 1.15 });
  }
  const baker = new Baker(world, lamps, theme, q);
  // земля
  const [bx0, bz0, bx1, bz1] = map.bounds;
  const gskin = SKINS[map.ground];
  if (map.id === "tower") baker.ground("carpet", -30.6, -20.6, 30.6, 20.6, floor, linear(gskin.c));
  else baker.ground(gskin.tex, bx0 - (map.id === "dome" ? 10 : 0), bz0 - (map.id === "dome" ? 10 : 0), bx1 + (map.id === "dome" ? 10 : 0), bz1 + (map.id === "dome" ? 10 : 0), floor, linear(gskin.c));
  // коробки
  const glassBoxes = [];
  for (const b of world.boxes) {
    if (b.inv) continue;
    if (b.glass) {
      glassBoxes.push(b);
      continue;
    }
    if (b.floorOnly && b.y1 - b.y0 < 0.1) {
      baker.ground(SKINS[b.skin].tex, b.cx - b.hw, b.cz - b.hd, b.cx + b.hw, b.cz + b.hd, b.y1 + 0.003, linear(SKINS[b.skin].c));
      continue;
    }
    baker.box(b, floor);
  }
  // потолки — тоже часть мира (дают тень и свет)
  for (const d of map.decor) {
    if (d.type !== "ceiling") continue;
    const skin = SKINS[d.skin] || SKINS.concrete;
    const b = { cx: (d.x0 + d.x1) / 2, cz: (d.z0 + d.z1) / 2, hw: (d.x1 - d.x0) / 2, hd: (d.z1 - d.z0) / 2, y0: d.y, y1: d.y + 0.3, c: 1, s: 0, skin: d.skin };
    baker.quad(skin.tex, [b.cx - b.hw, d.y, b.cz + b.hd], [1, 0, 0], [0, 0, -1], [0, -1, 0], b.hw * 2, b.hd * 2, linear(skin.c).multiplyScalar(0.8), [0, 0], 3, null);
  }
  const worldMeshes = baker.meshes(theme, q, { wet });
  for (const m of worldMeshes) scene.add(m);

  // ---------- Стекло ----------
  const glassMat = new (q.pbr ? T.MeshStandardMaterial : T.MeshPhongMaterial)({
    color: new T.Color("#9fd4f0"), transparent: true, opacity: 0.14, depthWrite: false, side: T.DoubleSide,
    ...(q.pbr ? { roughness: 0.04, metalness: 0.2, envMapIntensity: 1.6 } : { shininess: 120, specular: new T.Color(0.7, 0.8, 0.9) }),
  });
  const breakable = glassBoxes.filter((b) => b.glass === "break");
  const solid = glassBoxes.filter((b) => b.glass !== "break");
  const dummy = new T.Object3D();
  let glassInst = null;
  const glassIndex = new Map();
  if (breakable.length) {
    glassInst = new T.InstancedMesh(PRIM.box, glassMat, breakable.length);
    breakable.forEach((b, i) => {
      dummy.position.set(b.cx, (b.y0 + b.y1) / 2, b.cz);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.set(b.hw * 2, b.y1 - b.y0, b.hd * 2);
      dummy.updateMatrix();
      glassInst.setMatrixAt(i, dummy.matrix);
      glassIndex.set(b.i, i);
    });
    glassInst.renderOrder = 3;
    scene.add(glassInst);
  }
  // глухое стекло и рамы
  const frames = new Shape();
  const glassShape = new Shape();
  for (const b of [...solid, ...breakable]) {
    const H = b.y1 - b.y0;
    if (b.glass !== "break") glassShape.add("box", "#ffffff", [b.cx, (b.y0 + b.y1) / 2, b.cz], [b.hw * 2, H, b.hd * 2], [0, b.yaw, 0]);
    // стойки рамы по краям панели и профиль снизу
    const alongX = b.hw > b.hd;
    const L = alongX ? b.hw : b.hd;
    for (const sgn of [-1, 1]) {
      const x = b.cx + (alongX ? sgn * L : 0), z = b.cz + (alongX ? 0 : sgn * L);
      frames.add("box", "#2a3038", [x, (b.y0 + b.y1) / 2, z], [0.07, H, 0.07]);
    }
    frames.add("box", "#2a3038", [b.cx, b.y0 + 0.04, b.cz], [alongX ? L * 2 : 0.1, 0.08, alongX ? 0.1 : L * 2]);
    if (b.rail) frames.add("box", "#c8d0d8", [b.cx, b.y1, b.cz], [alongX ? L * 2 : 0.09, 0.06, alongX ? 0.09 : L * 2]);
  }
  const dm = decorMats(q);
  if (!glassShape.empty) {
    const gm = new T.Mesh(glassShape.build(), glassMat);
    gm.renderOrder = 3;
    scene.add(gm);
  }
  // ---------- Украшения ----------
  const paint = new Shape(), glow = new Shape(), dark = new Shape();
  if (!frames.empty) for (const p of frames.parts) dark.parts.push(p);
  const extra = []; // отдельные объекты (вода, знаки, конусы)
  const animated = []; // то, что движется
  const lightsOn = lampK > 0;
  for (const d of map.decor) addDecor(d);
  function addDecor(d) {
    const F = floor;
    switch (d.type) {
      case "lamp": {
        const h = d.h;
        paint.add("box", "#3a4048", [d.x + 0.5, F + h - 0.1, d.z], [1.2, 0.12, 0.16]);
        dark.add("box", "#2a2f36", [d.x + 1.0, F + h - 0.22, d.z], [0.5, 0.16, 0.34]);
        glow.add("box", lightsOn ? (d.white ? "#e8f2ff" : "#ffd59a") : "#556070", [d.x + 1.0, F + h - 0.31, d.z], [0.42, 0.03, 0.26]);
        if (lightsOn && o.cones) {
          const c = lightCone(d.white ? "#cfe0ff" : "#ffc98a", h - 0.3, 2.4, (o.weather === "rain" || o.weather === "fog" ? 0.11 : 0.06) * lampK);
          c.position.set(d.x + 1.0, F + h - 0.32, d.z);
          extra.push(c);
        }
        break;
      }
      case "spot": {
        if (!lightsOn) break;
        const from = new T.Vector3(d.x, F + d.h, d.z), to = new T.Vector3(...d.aim);
        dark.add("box", "#2a2f36", [d.x, F + d.h, d.z], [0.8, 0.6, 0.8]);
        glow.add("ball", "#ffffff", [d.x, F + d.h - 0.2, d.z], 0.28);
        if (o.cones) {
          const len = from.distanceTo(to);
          const c = lightCone(d.color, len, 5.5, 0.12 * lampK * (o.weather === "rain" ? 1.6 : 1));
          c.position.copy(from);
          c.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), to.clone().sub(from).normalize());
          extra.push(c);
          animated.push({ kind: "sweep", obj: c, from, to, base: c.quaternion.clone(), t: Math.random() * 10 });
        }
        break;
      }
      case "crane": {
        const { x0, x1, z0, z1, h } = d;
        const c = d.color;
        for (const z of [z0, z1]) {
          paint.add("box", c, [(x0 + x1) / 2 + 8, F + h + 0.6, z], [x1 - x0 + 26, 1.2, 1.1]);
          paint.add("box", c, [(x0 + x1) / 2, F + h * 0.55, z], [x1 - x0, 0.8, 0.8]);
        }
        paint.add("box", c, [(x0 + x1) / 2 + 8, F + h + 1.6, (z0 + z1) / 2], [x1 - x0 + 26, 0.6, z1 - z0 + 1]);
        paint.add("box", "#e9ecef", [x1 + 2, F + h - 1.2, (z0 + z1) / 2], [2.6, 2.2, 2.6]);
        glow.add("box", lightsOn ? "#ffe3a0" : "#7c8aa0", [x1 + 0.68, F + h - 1, (z0 + z1) / 2], [0.05, 0.8, 2]);
        // трос и висящий контейнер
        dark.add("box", "#222", [x1 + 6, F + h - 2.5, (z0 + z1) / 2 - 0.6], [0.05, 5, 0.05]);
        dark.add("box", "#222", [x1 + 6, F + h - 2.5, (z0 + z1) / 2 + 0.6], [0.05, 5, 0.05]);
        paint.add("box", "#2f6fb0", [x1 + 6, F + h - 6.3, (z0 + z1) / 2], [6.1, 2.6, 2.44]);
        // мигающие огни на верху
        glow.add("ball", "#ff2a2a", [x0 - 0.2, F + h + 1.9, z0], 0.18);
        glow.add("ball", "#ff2a2a", [x1 + 20, F + h + 1.9, z1], 0.18);
        break;
      }
      case "ship": {
        const sh = new Shape();
        const len = d.len, rot = d.rot ? Math.PI / 2 : 0;
        const at = (lx, y, lz) => (rot ? [d.x + lz, y, d.z + lx] : [d.x + lx, y, d.z + lz]);
        const sz = (a, b, c) => (rot ? [c, b, a] : [a, b, c]);
        paint.add("box", "#7a2a24", at(0, -1, 0), sz(14, 6, len));
        paint.add("box", "#1d2a3a", at(0, 2.6, 0), sz(14.4, 1.2, len + 0.4));
        paint.add("box", "#e8e8e8", at(0, 6, len * 0.36), sz(11, 6, 8));
        for (let i = 0; i < 5; i++) glow.add("box", lightsOn ? "#ffe2a8" : "#8899aa", at(i * 2 - 4, 7, len * 0.36 - 4.05), sz(1.2, 0.8, 0.05));
        const colors = ["#b8432f", "#2f6fb0", "#3f8a55", "#d9a227", "#d8662a", "#7d8790"];
        for (let i = 0; i < 8; i++) for (let k = 0; k < 2; k++) paint.add("box", colors[(i * 3 + k) % 6], at(k * 5 - 2.5, 4.6 + (i % 3) * 0.1, -len * 0.36 + i * 6), sz(4.6, 2.6 + (i % 2) * 2.6, 6));
        glow.add("ball", "#ff3030", at(0, 10, len * 0.36), 0.25);
        void sh;
        break;
      }
      case "sea": {
        const w = waterMesh(600, 600, new T.Color(theme.stars ? "#0d1a2a" : "#2a4a5e"), q, 0.92);
        w.position.set(0, d.y, 0);
        w.renderOrder = 1;
        extra.push(w);
        animated.push({ kind: "water", obj: w });
        // стенка причала
        paint.add("box", "#6b6e73", [0, floor - 1.1, bz0 - 0.4], [bx1 - bx0 + 2, 2.2, 0.8]);
        paint.add("box", "#6b6e73", [bx1 + 0.4, floor - 1.1, (bz0 + bz1) / 2], [0.8, 2.2, bz1 - bz0]);
        paint.add("box", "#e8b624", [0, floor + 0.03, bz0 + 0.15], [bx1 - bx0, 0.06, 0.3]);
        paint.add("box", "#e8b624", [bx1 - 0.15, floor + 0.03, (bz0 + bz1) / 2], [0.3, 0.06, bz1 - bz0]);
        break;
      }
      case "rails": {
        const y = (d.y ?? F) + 0.08;
        if (d.axis === "x") {
          for (const dz of [-0.75, 0.75]) dark.add("box", "#8c949c", [(d.x0 + d.x1) / 2, y, d.z0 + dz], [d.x1 - d.x0, 0.14, 0.1]);
          for (let x = d.x0; x < d.x1; x += 1.2) dark.add("box", "#3b2f28", [x, y - 0.08, d.z0], [0.3, 0.08, 2.2]);
        } else for (const dx of [-0.4, 0.4]) dark.add("box", "#5a6168", [d.x0 + dx, F + 0.03, (d.z0 + d.z1) / 2], [0.12, 0.06, d.z1 - d.z0]);
        break;
      }
      case "relay": {
        const y = F + (map.id === "metro" && d.site === "A" ? 0 : 0);
        dark.add("box", "#2a2f36", [d.x, y + 0.9, d.z], [0.9, 1.8, 0.9]);
        paint.add("box", "#5a6470", [d.x, y + 1.9, d.z], [0.7, 0.2, 0.7]);
        glow.add("box", "#ff4a2a", [d.x, y + 1.2, d.z], [0.94, 0.12, 0.94]);
        glow.add("ball", "#ff6a3a", [d.x, y + 2.3, d.z], 0.2);
        dark.add("cyl", "#3a4048", [d.x, y + 2.9, d.z], [0.03, 1.4, 0.03]);
        break;
      }
      case "sign": {
        const tex = signTexture(d.text);
        const m = new T.Mesh(new T.PlaneGeometry(d.w, d.w / 4), new T.MeshBasicMaterial({ map: tex, toneMapped: true, fog: true }));
        m.position.set(d.x, F + d.y - (map.id === "metro" ? -1.2 : 0), d.z);
        m.position.y = (map.id === "metro" ? 0 : F) + d.y;
        m.rotation.y = d.yaw;
        extra.push(m);
        break;
      }
      case "markings": {
        for (let x = d.x0; x < d.x1; x += 4) paint.add("box", "#d8d4c6", [x + 1, F + 0.012, d.z], [2, 0.02, 0.18]);
        break;
      }
      case "dome": {
        const shell = new T.Mesh(
          new T.SphereGeometry(d.r + 0.4, 36, 14, 0, TAU, 0, Math.PI / 2),
          new (q.pbr ? T.MeshStandardMaterial : T.MeshPhongMaterial)({ color: "#cfe8ff", transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false, ...(q.pbr ? { roughness: 0.05, metalness: 0.3 } : { shininess: 90 }) }),
        );
        shell.scale.y = d.h / (d.r + 0.4);
        shell.position.set(d.x, F + 4.2, d.z);
        shell.renderOrder = 4;
        extra.push(shell);
        const wire = new T.LineSegments(new T.WireframeGeometry(new T.SphereGeometry(d.r + 0.45, 18, 7, 0, TAU, 0, Math.PI / 2)), new T.LineBasicMaterial({ color: "#e8eef4", transparent: true, opacity: 0.55 }));
        wire.scale.y = d.h / (d.r + 0.45);
        wire.position.copy(shell.position);
        extra.push(wire);
        break;
      }
      case "reactor": {
        for (let i = 0; i < 5; i++) glow.add("torus", "#5ff2ff", [d.x, F + 1.5 + i * 1.6, d.z], [2.35, 2.35, 1.6], [Math.PI / 2, 0, 0]);
        glow.add("cyl", "#7ff8ff", [d.x, F + 9.4, d.z], [0.9, 0.8, 0.9]);
        animated.push({ kind: "pulse", t: 0 });
        break;
      }
      case "plants": {
        if (d.rows) for (const z of d.rows) for (let x = d.x0 + 0.5; x < d.x1; x += 0.9) paint.add("ball8", x % 2 ? "#4e9a3a" : "#6cb84a", [x, F + 0.95, z + 0.55], [0.42, 0.32 + (x % 1) * 0.2, 0.42]);
        if (d.pots) for (const [x, z] of d.pots) {
          paint.add("ball8", "#4f9a46", [x, F + 1.45, z], [0.55, 0.65, 0.55]);
          paint.add("ball8", "#3e7f3a", [x + 0.2, F + 1.9, z - 0.1], [0.32, 0.4, 0.32]);
        }
        break;
      }
      case "mast": {
        const H = d.h;
        for (let y = 0; y < H; y += 2.2) {
          const w = 2 - (y / H) * 1.3;
          for (const [ax, az] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) dark.add("box", "#c4c9cf", [d.x + ax * w, F + y + 1.1, d.z + az * w], [ax ? 0.06 : w * 2, 0.06, az ? 0.06 : w * 2]);
        }
        for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dark.add("box", "#c4c9cf", [d.x + ax * 1.35, F + H / 2, d.z + az * 1.35], [0.12, H, 0.12], [az * 0.04, 0, -ax * 0.04]);
        glow.add("ball", "#ff2a2a", [d.x, F + H + 0.3, d.z], 0.3);
        paint.add("cyl", "#e9ecef", [d.x + 0.8, F + H - 3, d.z], [0.9, 0.3, 0.9], [Math.PI / 2, 0, 0]);
        break;
      }
      case "pad": {
        const ring = new T.Mesh(new T.RingGeometry(d.r - 0.4, d.r, 40), new T.MeshBasicMaterial({ color: "#e8b624", fog: true }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(d.x, F + 0.02, d.z);
        extra.push(ring);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          glow.add("ball8", "#7ff0ff", [d.x + Math.cos(a) * d.r, F + 0.08, d.z + Math.sin(a) * d.r], 0.09);
        }
        break;
      }
      case "shuttle": {
        paint.add("box", "#e9ecef", [d.x, F + 2, d.z], [5, 3, 11]);
        paint.add("wedge", "#e9ecef", [d.x, F + 2, d.z + 7], [5, 3, 3], [0, Math.PI / 2, 0]);
        dark.add("box", "#2a2f36", [d.x, F + 2.6, d.z + 5.6], [4, 1, 0.2]);
        paint.add("box", "#e3742a", [d.x, F + 3.6, d.z - 1], [5.2, 0.3, 9]);
        paint.add("box", "#c9ced4", [d.x - 4.5, F + 1.6, d.z - 2], [5, 0.3, 4]);
        paint.add("box", "#c9ced4", [d.x + 4.5, F + 1.6, d.z - 2], [5, 0.3, 4]);
        glow.add("cyl", "#7fd8ff", [d.x - 1.4, F + 2, d.z - 5.6], [0.8, 0.2, 0.8], [Math.PI / 2, 0, 0]);
        glow.add("cyl", "#7fd8ff", [d.x + 1.4, F + 2, d.z - 5.6], [0.8, 0.2, 0.8], [Math.PI / 2, 0, 0]);
        break;
      }
      case "dunes": {
        const g = new T.PlaneGeometry(700, 700, 70, 70);
        g.rotateX(-Math.PI / 2);
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), z = P.getZ(i), r = Math.hypot(x, z);
          const k = Math.min(1, Math.max(0, (r - 48) / 40));
          P.setY(i, floor - 0.05 + k * (3 + Math.sin(x * 0.045) * 4 + Math.cos(z * 0.06 + x * 0.02) * 3.5 + Math.sin(z * 0.013) * 6));
        }
        g.computeVertexNormals();
        const m = new T.Mesh(g, new (q.pbr ? T.MeshStandardMaterial : T.MeshLambertMaterial)({ color: SKINS.sand.c, map: surfaceTexture("sand", q.tex), ...(q.pbr ? { roughness: 1 } : {}) }));
        m.material.map.repeat.set(50, 50);
        m.receiveShadow = true;
        extra.push(m);
        // скалы-горы вдали
        const r = noiseRand(5);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU + r() * 0.3, R = 150 + r() * 120;
          paint.add("ball8", "#b07e55", [Math.cos(a) * R, floor - 4, Math.sin(a) * R], [20 + r() * 30, 14 + r() * 26, 20 + r() * 20]);
        }
        break;
      }
      case "elevators": {
        for (const z of [d.z0 - 0.03, d.z1 + 0.03])
          for (const x of [-3.5, 3.5]) {
            dark.add("box", "#9aa3ad", [x, F + 1.2, z], [2.2, 2.4, 0.06]);
            dark.add("box", "#2a2f36", [x, F + 1.2, z + (z > 0 ? 0.01 : -0.01)], [0.03, 2.4, 0.07]);
            glow.add("box", "#ff9a3a", [x, F + 2.65, z + (z > 0 ? 0.02 : -0.02)], [0.5, 0.14, 0.05]);
          }
        break;
      }
      case "serverGlow": {
        for (const z of d.zs) for (const s of [-1, 1]) glow.add("box", s > 0 ? "#3dff8a" : "#4fb8ff", [(d.x0 + d.x1) / 2, F + 2.25, z + s * 0.41], [d.x1 - d.x0, 0.04, 0.02]);
        break;
      }
      case "skyline": {
        const r = noiseRand(91);
        const win = canvasTexture(64, 128, (c, w, h) => {
          c.fillStyle = "#000";
          c.fillRect(0, 0, w, h);
          for (let y = 4; y < h; y += 8)
            for (let x = 4; x < w; x += 8) {
              const on = r() < (theme.stars ? 0.55 : 0.2);
              c.fillStyle = on ? (r() < 0.8 ? "#ffd89a" : "#9fd0ff") : "#0a0d12";
              c.fillRect(x, y, 4, 5);
            }
        });
        const S = q.pbr ? T.MeshStandardMaterial : T.MeshLambertMaterial;
        const mat = new S({ color: theme.stars ? "#1a2230" : "#8794a6", emissive: new T.Color(1, 1, 1), emissiveMap: win, emissiveIntensity: theme.stars ? 1.6 : 0.35, map: win, ...(q.pbr ? { roughness: 0.5, metalness: 0.4 } : {}) });
        win.wrapS = win.wrapT = T.RepeatWrapping;
        const n = 120;
        const inst = new T.InstancedMesh(PRIM.box, mat, n);
        const m4 = new T.Object3D();
        for (let i = 0; i < n; i++) {
          let x, z;
          do {
            x = (r() - 0.5) * 700;
            z = (r() - 0.5) * 700;
          } while (Math.abs(x) < 90 && Math.abs(z) < 70);
          const h = 60 + r() * 220, w = 18 + r() * 26;
          m4.position.set(x, floor - 190 + h / 2, z);
          m4.scale.set(w, h, w * (0.7 + r() * 0.6));
          m4.rotation.y = 0;
          m4.updateMatrix();
          inst.setMatrixAt(i, m4.matrix);
        }
        extra.push(inst);
        // своя башня снаружи
        paint.add("box", "#8fa0b4", [0, floor - 60, 0], [62, 119.6, 42]);
        paint.add("box", "#a8b6c6", [0, floor + 3.65, 0], [62.4, 0.5, 42.4]);
        break;
      }
      case "escalator": {
        for (let i = 0; i < 8; i++) dark.add("box", "#5a6470", [d.x0 + i * 0.5, 0.15 + i * 0.32, d.z], [0.5, 0.3, 1.8]);
        paint.add("box", "#c9ced4", [(d.x0 + d.x1) / 2, 1.8, d.z - 1.05], [d.x1 - d.x0, 0.12, 0.08], [0, 0, -0.55]);
        paint.add("box", "#c9ced4", [(d.x0 + d.x1) / 2, 1.8, d.z + 1.05], [d.x1 - d.x0, 0.12, 0.08], [0, 0, -0.55]);
        glow.add("box", "#7fe8ff", [(d.x0 + d.x1) / 2, 2.0, d.z - 1.1], [d.x1 - d.x0, 0.03, 0.03], [0, 0, -0.55]);
        break;
      }
      case "train": {
        const L = d.x1 - d.x0;
        for (let i = 0; i < 9; i++) glow.add("box", lightsOn ? "#d8ecff" : "#6f8090", [d.x0 + 1.5 + i * (L - 3) / 8, F + 2.3, d.z0 - 0.02], [1.2, 0.8, 0.04]);
        for (let i = 0; i < 9; i++) glow.add("box", lightsOn ? "#d8ecff" : "#6f8090", [d.x0 + 1.5 + i * (L - 3) / 8, F + 2.3, d.z1 + 0.02], [1.2, 0.8, 0.04]);
        paint.add("box", "#d8662a", [(d.x0 + d.x1) / 2, F + 1.2, d.z0 - 0.03], [L, 0.3, 0.05]);
        glow.add("box", "#ff3a2a", [d.x0 - 0.02, F + 1, (d.z0 + d.z1) / 2 - 1.4], [0.04, 0.3, 0.4]);
        glow.add("box", "#ff3a2a", [d.x0 - 0.02, F + 1, (d.z0 + d.z1) / 2 + 1.4], [0.04, 0.3, 0.4]);
        break;
      }
      case "vault": {
        const g = new T.CylinderGeometry(1, 1, 1, 24, 1, true, Math.PI / 2, Math.PI);
        const mm = new T.Mesh(g, new (q.pbr ? T.MeshStandardMaterial : T.MeshLambertMaterial)({ color: "#4c5560", side: T.BackSide, ...(q.pbr ? { roughness: 0.8 } : {}) }));
        mm.rotation.z = Math.PI / 2;
        mm.scale.set(3.4, d.x1 - d.x0, (d.z1 - d.z0) / 2);
        mm.position.set((d.x0 + d.x1) / 2, d.y + 0.9, (d.z0 + d.z1) / 2);
        extra.push(mm);
        for (let x = d.x0 + 2; x < d.x1; x += 6) dark.add("box", "#3a424c", [x, d.y + 1.1, 0], [0.5, 0.4, d.z1 - d.z0 - 0.5]);
        for (let x = -21; x <= 15; x += 6) glow.add("box", lightsOn ? "#e9f3ff" : "#556", [x, d.y - 0.35, 0], [4, 0.06, 0.3]);
        break;
      }
      case "depot": {
        dark.add("box", "#3a3f46", [(d.x0 + d.x1) / 2, floor + d.h + 0.3, (d.z0 + d.z1) / 2], [d.x1 - d.x0, 0.4, d.z1 - d.z0]);
        for (let z = d.z0 + 3; z < d.z1; z += 6) paint.add("box", "#d4552a", [(d.x0 + d.x1) / 2, floor + d.h - 0.4, z], [d.x1 - d.x0, 0.6, 0.4]);
        for (let z = d.z0 + 4; z < d.z1; z += 8) glow.add("box", "#ffd8a0", [30, floor + d.h - 0.9, z], [6, 0.08, 0.6]);
        break;
      }
      case "furnace": {
        glow.add("box", "#ff6a1a", [d.x - 1.02, floor + 3.5, d.z], [0.05, 5, 7]);
        for (let i = 0; i < 4; i++) dark.add("box", "#1b1d20", [d.x - 1.05, floor + 1.3 + i * 1.5, d.z], [0.12, 0.25, 7.4]);
        for (const dz of [-4.5, 4.5]) paint.add("cyl", "#6a5a50", [d.x - 0.5, floor + 5, d.z + dz], [0.6, 10, 0.6]);
        animated.push({ kind: "pulse", t: 0 });
        break;
      }
      case "lanes": {
        for (let x = -8; x <= 8; x += 4) paint.add("box", "#e8b624", [x, F + 0.012, (d.z0 + d.z1) / 2], [0.08, 0.02, d.z1 - d.z0]);
        for (const x of [-10, 10]) {
          paint.add("box", "#367c9d", [x, F + 0.014, (d.z0 + d.z1) / 2], [0.16, 0.022, d.z1 - d.z0]);
        }
        for (const z of [-12, -21, -27, -35]) paint.add("box", "#d8d4c6", [0, F + 0.012, z + 1.2], [d.x1 - d.x0, 0.02, 0.1]);
        break;
      }
      case "ceiling": {
        if (d.panels) for (let x = -25; x <= 25; x += 10) for (let z = -15; z <= 15; z += 10) glow.add("box", "#fff3dd", [x, d.y - 0.02, z], [1.6, 0.03, 1.6]);
        if (d.skylights) for (let z = d.z0 + 3; z < d.z1 - 2; z += 6) glow.add("box", theme.stars || theme.indoor ? "#2a3448" : "#cfe4ff", [(d.x0 + d.x1) / 2, d.y - 0.03, z], [(d.x1 - d.x0) * 0.7, 0.03, 1.4]);
        if (map.id === "range") {
          for (let z = d.z0 + 2; z < d.z1 - 2; z += 6) {
            for (const x of [-4.5, 4.5]) {
              paint.add("box", "#596d86", [x, d.y - 0.11, z], [3.8, 0.16, 0.42]);
              glow.add("box", "#cfeaff", [x, d.y - 0.2, z], [3.5, 0.025, 0.24]);
            }
          }
        }
        break;
      }
      case "helipad": {
        const ring = new T.Mesh(new T.RingGeometry(d.r - 0.35, d.r, 48), new T.MeshBasicMaterial({ color: "#e8e4d8", fog: true }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(d.x, d.y + 0.015, d.z);
        extra.push(ring);
        const H = signTexture("H", { w: 128, h: 128, bg: "#3c4148", edge: "#3c4148", fg: "#e8e4d8" });
        const hm = new T.Mesh(new T.PlaneGeometry(3, 3), new T.MeshBasicMaterial({ map: H, fog: true }));
        hm.rotation.x = -Math.PI / 2;
        hm.position.set(d.x, d.y + 0.016, d.z);
        extra.push(hm);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          glow.add("ball8", "#7fff9a", [d.x + Math.cos(a) * (d.r + 0.2), d.y + 0.06, d.z + Math.sin(a) * (d.r + 0.2)], 0.08);
        }
        break;
      }
      case "heli":
        break;
    }
  }
  // площадки целей: буквы на полу
  const all = [];
  if (!paint.empty) all.push(new T.Mesh(paint.build(0.25), dm.paint));
  if (!dark.empty) all.push(new T.Mesh(dark.build(0.15), dm.dark));
  if (!glow.empty) all.push(new T.Mesh(glow.build(), dm.glow));
  for (const m of all) {
    m.castShadow = m.material !== dm.glow;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
  }
  for (const m of extra) scene.add(m);
  // ---------- Свет ----------
  const officeK = map.indoor && !theme.indoor ? 0.78 : 1; // небоскрёб: под потолком небесного света меньше
  const hemi = new T.HemisphereLight(theme.hemi[0], map.indoor && !theme.indoor ? "#8494ab" : theme.hemi[1], theme.hemi[2] * officeK);
  scene.add(hemi);
  // Мягкий отражённый свет на вертикальных поверхностях и моделях.
  scene.add(new T.AmbientLight("#e3edff", map.indoor ? 0.50 : 0.36));
  const sun = new T.DirectionalLight(theme.sunColor, theme.sunI);
  sun.position.copy(sunDir).multiplyScalar(80);
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
  sun.position.add(new T.Vector3(cx, 0, cz));
  sun.target.position.set(cx, floor, cz);
  scene.add(sun, sun.target);
  if (q.shadows) {
    sun.castShadow = true;
    const R = Math.max(bx1 - bx0, bz1 - bz0) * 0.62;
    const sc = sun.shadow.camera;
    sc.left = -R;
    sc.right = R;
    sc.top = R;
    sc.bottom = -R;
    sc.near = 1;
    sc.far = 220;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
  }
  // небо и туман
  const sky = makeSky(theme, sunDir);
  scene.add(sky);
  scene.fog = new T.Fog(theme.fog[0], theme.fog[1] * (o.fogK || 1), theme.fog[2] * (o.fogK || 1));
  scene.background = new T.Color(theme.fog[0]);
  // ---------- Погода ----------
  const weather = makeWeather(o.weather, theme, q, map);
  if (weather) scene.add(weather.obj);
  // карта окружения для отражений: небо + лампы (по-настоящему из этой сцены)
  return {
    scene, sun, hemi, sky, worldMeshes, glassInst, glassIndex, weather, animated, lamps, theme,
    breakGlass(boxIndex) {
      if (!glassInst || !glassIndex.has(boxIndex)) return;
      const i = glassIndex.get(boxIndex);
      dummy.position.set(0, -999, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      glassInst.setMatrixAt(i, dummy.matrix);
      glassInst.instanceMatrix.needsUpdate = true;
    },
    update(dt, t, camera) {
      if (weather) weather.update(dt, t, camera);
      sky.position.copy(camera.position);
      for (const a of animated) {
        if (a.kind === "water") {
          a.obj.userData.tex.offset.x = (t * 0.006) % 1;
          a.obj.userData.tex.offset.y = (t * 0.004) % 1;
        }
        if (a.kind === "sweep") {
          a.t += dt;
          const k = Math.sin(a.t * 0.35) * 0.28;
          a.obj.quaternion.copy(a.base).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), k));
        }
      }
    },
  };
}

// ---------- Погода: дождь, морось, туман, песчаная дымка, пыль метро ----------
function makeWeather(kind, theme, q, map) {
  const N = { rain: 1800, drizzle: 700, fog: 260, haze: 420 }[kind] ?? (theme.indoor ? 260 : 0);
  if (!N) return null;
  const count = Math.round(N * q.particles);
  const isRain = kind === "rain" || kind === "drizzle";
  const BOX = isRain ? 26 : 30;
  const pos = new Float32Array(count * (isRain ? 6 : 3));
  const seed = new Float32Array(count * (isRain ? 2 : 1));
  const r = noiseRand(31);
  for (let i = 0; i < count; i++) {
    const x = (r() - 0.5) * BOX * 2, y = r() * 18, z = (r() - 0.5) * BOX * 2;
    if (isRain) {
      pos.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = r();
      seed[i * 2 + 1] = 1;
    } else {
      pos.set([x, y, z], i * 3);
      seed[i] = r();
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(pos, 3));
  if (isRain) {
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
    }
    g.setAttribute("seed", new T.BufferAttribute(new Float32Array([...Array(count)].flatMap((_, i) => [seed[i * 2], seed[i * 2]])), 1));
    g.setAttribute("tail", new T.BufferAttribute(end, 1));
  } else g.setAttribute("seed", new T.BufferAttribute(seed, 1));
  g.boundingSphere = new T.Sphere(new T.Vector3(), 1e5);
  const color = isRain ? new T.Color(theme.stars ? "#9fb8d8" : "#c8d4e0") : kind === "haze" ? new T.Color("#ffd9a8") : new T.Color(theme.emergency ? "#ff9a8a" : "#c8d0dc");
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: isRain ? T.NormalBlending : T.AdditiveBlending,
    uniforms: { time: { value: 0 }, cam: { value: new T.Vector3() }, color: { value: color }, box: { value: BOX }, floor: { value: map.floor }, size: { value: kind === "haze" ? 1.4 : 1.0 }, k: { value: isRain ? (kind === "rain" ? 0.3 : 0.2) : kind === "haze" ? 0.35 : 0.25 } },
    vertexShader: isRain
      ? `attribute float seed; attribute float tail; uniform float time; uniform vec3 cam; uniform float box; uniform float floor; varying float vA;
         void main(){
           vec3 p = position;
           float fall = mod(p.y - time * (16.0 + seed * 6.0), 18.0);
           p.y = floor + fall - 2.0;
           p.x = cam.x + mod(p.x - cam.x + box, box * 2.0) - box + time * 1.5;
           p.z = cam.z + mod(p.z - cam.z + box, box * 2.0) - box;
           p.x = cam.x + mod(p.x - cam.x + box, box * 2.0) - box;
           p.y += tail * 0.55; p.x -= tail * 0.06;
           vA = tail * 0.8 + 0.2;
           gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
         }`
      : `attribute float seed; uniform float time; uniform vec3 cam; uniform float box; uniform float floor; uniform float size; varying float vA;
         void main(){
           vec3 p = position;
           p.x += sin(time * 0.3 + seed * 30.0) * 2.0 + time * 0.6;
           p.y = floor + mod(p.y + sin(time * 0.2 + seed * 10.0) * 1.5, 9.0) + 0.2;
           p.z += cos(time * 0.25 + seed * 20.0) * 2.0;
           p.x = cam.x + mod(p.x - cam.x + box, box * 2.0) - box;
           p.z = cam.z + mod(p.z - cam.z + box, box * 2.0) - box;
           vec4 mv = viewMatrix * vec4(p, 1.0);
           gl_PointSize = size * 90.0 / max(1.0, -mv.z);
           // вплотную к камере пылинки не видны (иначе — большие белые пятна)
           vA = (0.5 + 0.5 * sin(time + seed * 40.0)) * smoothstep(2.5, 6.0, -mv.z);
           gl_Position = projectionMatrix * mv;
         }`,
    fragmentShader: isRain
      ? `uniform vec3 color; uniform float k; varying float vA; void main(){ gl_FragColor = vec4(color, k * vA); }`
      : `uniform vec3 color; uniform float k; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(color * a * k * vA, 1.0); }`,
  });
  const obj = isRain ? new T.LineSegments(g, mat) : new T.Points(g, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 8;
  return {
    obj,
    kind,
    update(dt, t, camera) {
      mat.uniforms.time.value = t;
      mat.uniforms.cam.value.copy(camera.position);
    },
  };
}

// Карта окружения для отражений: небо этой карты и светящиеся пятна ламп
export function makeEnvironment(renderer, theme, lamps) {
  const pm = new T.PMREMGenerator(renderer);
  const env = new T.Scene();
  // солнце в карте отражений приглушено: иначе всё светлое пересвечено
  const sky = makeSky(theme, new T.Vector3(...theme.sun).normalize(), 0.02);
  sky.scale.setScalar(0.1);
  env.add(sky);
  const glow = new T.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  for (const L of lamps.slice(0, 24)) {
    const m = new T.Mesh(PRIM.ball8, glow.clone());
    m.material.color.copy(L.c).multiplyScalar(1.5 * L.power);
    const d = new T.Vector3(L.x, L.y + 3, L.z).normalize().multiplyScalar(30);
    m.position.copy(d);
    m.scale.setScalar(1.5);
    env.add(m);
  }
  if (theme.indoor) env.add(new T.AmbientLight("#ffffff", 0.2));
  const rt = pm.fromScene(env, 0.04);
  pm.dispose();
  return rt.texture;
}
export { glowTexture };
