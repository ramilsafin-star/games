import * as T from "../vendor/three/three.module.min.js?v=d76d4a47";
import { GEO, enamel, glow, mesh, submarine, enemyModels, pearl } from "./models.js?v=d76d4a47";
import { PULSE_RADIUS } from "./rules.js?v=d76d4a47";

const TAU = Math.PI * 2;
const PLANE = new T.Plane(new T.Vector3(0, 1, 0), -1.4);
const COLORS = ["#51c8ca", "#7d9bcc", "#49bcb2", "#776aa5"];
const radiance = color => new T.Color(color).multiplyScalar(1.5);
const vec = (x, y, z) => new T.Vector3(x, y, z);

function texture(size, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  paint(context, size);
  const result = new T.CanvasTexture(canvas);
  result.colorSpace = T.SRGBColorSpace;
  return result;
}

function makeSand() {
  const map = texture(256, (ctx, n) => {
    const data = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n * TAU;
        const v = y / n * TAU;
        const a = Math.sin(u * 3 + Math.sin(v * 2.0) * 1.3) + Math.cos(v * 3 + Math.sin(u * 2) * 1.8);
        const b = Math.sin((u + v) * 2.0 + Math.cos(u * 3 - v) * 0.88);
        const light = Math.pow(Math.max(0, 1 - Math.abs(a * 0.61 + b * 0.72) * 2), 3);
        const grit = 2.3 * Math.sin(13 * u + 24 * v) * Math.cos(29 * v - 51 * u);
        const index = (y * n + x) * 4;
        data.data[index] = 167 + light * 45 + grit;
        data.data[index + 1] = 207 + light * 30 + grit;
        data.data[index + 2] = 197 + light * 36 + grit;
        data.data[index + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  });
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(7, 7);
  return map;
}

function makeReef(scene) {
  const sand = makeSand();
  const floorMat = enamel("#8eced1", 0.91);
  floorMat.map = sand;
  const floor = new T.Mesh(new T.PlaneGeometry(140, 140), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.37;
  scene.add(floor);

  let seed = 77921;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const rocks = ["#3e8e9e", "#437da1", "#638bac", "#3f7d8b"].map(color => enamel(color, 0.78));
  const tips = ["#ff8b9c", "#ffbb7c", "#b48ff0", "#8bdbc8"].map(color => enamel(color, 0.59));
  const stalks = ["#e96891", "#ef9468", "#9064d1", "#3baaa6"].map(color => enamel(color, 0.59));
  const kelp = enamel("#45aa8f", 0.58);
  const shell = enamel("#e1c29c", 0.72);
  const seaStar = enamel("#f8ab7c", 0.6);
  const up = vec(0, 1, 0);
  const banks = [];

  function branch(group, x, z, index) {
    const scale = 0.7 + random() * 0.65;
    const root = vec(x, -0.1, z);
    for (let i = 0; i < 4; i++) {
      const target = vec(x + (i - 1.5) * 0.51 * scale, (1.0 + random() * 1.3) * scale, z + (random() - 0.5) * 1.3);
      const diff = target.clone().sub(root);
      const mid = root.clone().lerp(target, 0.52);
      const limb = mesh(GEO.tube, stalks[index], mid.x, mid.y, mid.z, 0.14 * scale, diff.length(), 0.14 * scale);
      limb.quaternion.setFromUnitVectors(up, diff.normalize());
      group.add(limb, mesh(GEO.sphere, tips[index], target.x, target.y, target.z, 0.21 * scale, 0.29 * scale, 0.21 * scale));
    }
  }

  for (const side of [-1, 1]) {
    const bank = new T.Group();
    for (let i = 0; i < 8; i++) {
      const z = -14 + i * 3.45;
      const x = side * (0.35 + random() * 1.4);
      const ridge = mesh(GEO.low, rocks[i % rocks.length], x + side * 1.3, -0.15, z, 2.0 + random(), 0.86 + random() * 1.05, 1.75);
      ridge.rotation.set(0.15, random() * TAU, 0.1);
      bank.add(ridge);
      if (i % 2 === 0) {
        branch(bank, x - side * 0.51, z + 0.43, (i + (side > 0 ? 1 : 0)) % tips.length);
      } else {
        for (let j = 0; j < 4; j++) {
          const leaf = mesh(GEO.sphere, kelp, x - side * 0.32 + (j - 1.5) * 0.22, 0.59, z + (j - 2) * 0.25, 0.12, 0.72 + random() * 0.52, 0.27);
          leaf.rotation.z = (j - 1.5) * 0.26;
          bank.add(leaf);
        }
      }
    }
    scene.add(bank);
    banks.push(bank);
  }

  for (let i = 0; i < 39; i++) {
    const x = (random() - 0.5) * 28;
    const z = (random() - 0.5) * 33;
    if (i % 8 === 0) {
      const star = new T.Group();
      star.position.set(x, -0.22, z);
      for (let arm = 0; arm < 5; arm++) {
        const tip = arm / 5 * TAU;
        const ray = mesh(GEO.sphere, seaStar, 0.18 * Math.cos(tip), 0, 0.18 * Math.sin(tip), 0.22, 0.048, 0.105);
        ray.rotation.y = -tip;
        star.add(ray);
      }
      star.rotation.y = random() * TAU;
      scene.add(star);
    } else {
      const pebble = mesh(GEO.low, i % 3 === 0 ? shell : rocks[i % rocks.length], x, -0.32, z, 0.11 + random() * 0.28, 0.11, 0.2);
      pebble.rotation.y = random() * TAU;
      scene.add(pebble);
    }
  }

  const arch = new T.Group();
  for (let i = 0; i < 8; i++) {
    const angle = i / 7 * Math.PI;
    arch.add(mesh(GEO.low, rocks[(i + 1) % rocks.length], Math.cos(angle) * 4.8, Math.sin(angle) * 2.7, -13.5, 1.31, 1.03, 1.35));
  }
  branch(arch, -2.8, -13.0, 2);
  branch(arch, 3.8, -13.0, 0);
  scene.add(arch);

  const motes = new Float32Array(192 * 3);
  for (let i = 0; i < motes.length; i += 3) {
    motes[i] = (random() - 0.5) * 37;
    motes[i + 1] = 0.5 + random() * 11;
    motes[i + 2] = (random() - 0.5) * 34;
  }
  const light = texture(64, (ctx, n) => {
    const gradient = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gradient.addColorStop(0, "#edfffb");
    gradient.addColorStop(0.38, "#bff5ffb0");
    gradient.addColorStop(1, "#bff5ff00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, n, n);
  });
  const cloud = new T.BufferGeometry();
  cloud.setAttribute("position", new T.BufferAttribute(motes, 3));
  const plankton = new T.Points(cloud, new T.PointsMaterial({
    map: light, color: "#d4fbef", size: 0.17, opacity: 0.65, transparent: true, depthWrite: false,
  }));
  scene.add(plankton);
  return { banks, sand, floorMat, plankton, light };
}

const enemyColor = { crab: "#ffba8a", mine: "#ffa887", jelly: "#dca3ff", boss: "#ffb5ee" };
const FRIENDLY = glow("#d6ffff");
const HOSTILE = glow("#ffa75e");
const HEAVY = glow("#ff78b1");
const RING_GEO = new T.RingGeometry(0.87, 1, 58);
const SHADOW_GEO = new T.PlaneGeometry(1, 1);

function sprite(color, texture) {
  return new T.Sprite(new T.SpriteMaterial({
    map: texture, color, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, toneMapped: false,
  }));
}

export class ReefView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.07;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#5eb7c3");
    this.scene.fog = new T.FogExp2("#6fbccf", 0.010);
    this.camera = new T.OrthographicCamera(-6, 6, 10, -10, 0.5, 145);
    this.camera.position.set(0, 27.5, 23.5);
    this.camera.lookAt(0, 0.15, -0.8);
    const key = new T.DirectionalLight("#fff0cc", 3.0);
    key.position.set(-12, 22, -10);
    const rim = new T.DirectionalLight("#80dfff", 2.15);
    rim.position.set(14, 10, 15);
    this.scene.add(new T.HemisphereLight("#ccf7ed", "#286591", 1.78), key, rim);
    this.reef = makeReef(this.scene);
    this.lane = 5;
    this.bounds = { x: 5, far: -9.3, near: 9.3 };
    this.ray = new T.Raycaster();
    this.ndc = new T.Vector2();
    this.intersection = new T.Vector3();
    this.player = submarine();
    this.player.rotation.order = "YXZ";
    this.scene.add(this.player);
    this.shadowMaterial = new T.MeshBasicMaterial({
      map: texture(64, (ctx, n) => {
        const gradient = ctx.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n / 2);
        gradient.addColorStop(0, "#0e4769ad");
        gradient.addColorStop(0.43, "#0e476966");
        gradient.addColorStop(1, "#0e476900");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, n, n);
      }),
      transparent: true, depthWrite: false, opacity: 0.8,
    });
    this.playerShadow = this.shadow(3.7);
    this.shipLight = sprite("#5ff7ff", this.reef.light);
    this.shipLight.position.set(0, 0.02, -1.49);
    this.player.add(this.shipLight);
    this.shotGlow = 0;
    this.actors = new Map();
    this.drops = new Map();
    this.bolts = new Map();
    this.ripples = [];
    this.particles = [];
    this.particleMesh = new T.InstancedMesh(GEO.spark, new T.MeshBasicMaterial({ toneMapped: false }), 420);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    const laneMaterial = new T.MeshBasicMaterial({
      color: "#f5899e", transparent: true, depthWrite: false, toneMapped: false,
    });
    this.beamBand = new T.Mesh(SHADOW_GEO, laneMaterial);
    this.beamBand.rotation.x = -Math.PI / 2;
    this.beamCore = new T.Mesh(SHADOW_GEO, new T.MeshBasicMaterial({
      color: "#fff4db", transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.beamCore.rotation.x = -Math.PI / 2;
    this.scene.add(this.beamBand, this.beamCore);
    this.dummy = new T.Object3D();
    this.floorTint = new T.Color(COLORS[0]);
    this.visualTime = 0;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    const aspect = w / h;
    const height = 20.7;
    const width = height * aspect;
    this.aspect = aspect;
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
    this.renderer.setSize(w, h, false);
    this.bounds.x = Math.max(2.8, Math.min(9.6, width * 0.5 - 1.04));
    this.reef.banks.forEach((bank, i) => { bank.position.x = (i ? 1 : -1) * (this.bounds.x + 0.45); });
    return this.bounds;
  }

  pointAt(x, y) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(PLANE, this.intersection);
  }

  shadow(size) {
    const shadow = new T.Mesh(SHADOW_GEO, this.shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.31;
    shadow.scale.set(size, size * 0.82, 1);
    this.scene.add(shadow);
    return shadow;
  }

  ripple(x, z, color, size, ttl) {
    const material = new T.MeshBasicMaterial({
      color: radiance(color), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const ring = new T.Mesh(RING_GEO, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.37, z);
    this.scene.add(ring);
    this.ripples.push({ ring, age: 0, size, ttl });
  }

  spray(x, z, color, count, speed) {
    const tint = radiance(color);
    const remaining = 420 - this.particles.length;
    for (let i = 0; i < Math.min(count, remaining); i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.38 + Math.random() * 0.62);
      this.particles.push({
        x, y: 1.32, z, vx: Math.sin(a) * s, vz: Math.cos(a) * s, vy: 1.1 + Math.random() * 3,
        life: 0.28 + Math.random() * 0.53, size: 0.07 + Math.random() * 0.13, tint,
      });
    }
  }

  event(e) {
    if (e.type === "shot") this.shotGlow = 1;
    else if (e.type === "impact") this.spray(e.x, e.z, enemyColor[e.kind], 5, 3.3);
    else if (e.type === "burst") {
      const big = e.kind === "boss";
      this.spray(e.x, e.z, enemyColor[e.kind], big ? 75 : 23, big ? 8 : 5.1);
      this.spray(e.x, e.z, "#c9fbff", big ? 35 : 8, big ? 7 : 4.4);
      this.ripple(e.x, e.z, enemyColor[e.kind], big ? 5.1 : 2.5, big ? 0.92 : 0.46);
    } else if (e.type === "pulse") {
      this.ripple(e.x, e.z, "#71fff0", PULSE_RADIUS, 0.62);
      this.ripple(e.x, e.z, "#eefff6", PULSE_RADIUS * 0.82, 0.45);
      this.spray(e.x, e.z, "#91ffee", 36, 9);
    } else if (e.type === "hurt") {
      this.ripple(e.x, e.z, "#ff897e", 2.5, 0.36);
      this.spray(e.x, e.z, "#ffce99", 14, 4.1);
    } else if (e.type === "pearl") {
      this.ripple(e.x, e.z, "#fff59a", 2.15, 0.49);
      this.spray(e.x, e.z, "#fff4aa", 16, 4.5);
    }
  }

  effects(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const fx = this.ripples[i];
      fx.age += dt;
      const f = fx.age / fx.ttl;
      if (f >= 1) {
        this.scene.remove(fx.ring);
        fx.ring.material.dispose();
        this.ripples.splice(i, 1);
      } else {
        fx.ring.scale.setScalar(Math.max(0.01, fx.size * (1 - (1 - f) ** 2)));
        fx.ring.material.opacity = 0.68 * (1 - f);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
      else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
    }
    this.particleMesh.count = this.particles.length;
    this.particles.forEach((p, i) => {
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.x * 4, p.z * 3, p.y);
      this.dummy.scale.setScalar(p.size * Math.min(1, p.life * 3.4));
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, p.tint);
    });
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  updateActors(game, time) {
    const active = new Set();
    for (const e of game.enemies) {
      active.add(e.id);
      let record = this.actors.get(e.id);
      if (!record) {
        const model = enemyModels[e.kind]();
        const shadow = this.shadow(e.kind === "boss" ? 6.2 : 2.65);
        const warning = sprite(e.kind === "boss" ? "#ff9ad1" : "#ffbc81", this.reef.light);
        warning.position.set(0, 0.38, -0.54);
        model.add(warning);
        const bar = new T.Group();
        const barBack = mesh(GEO.box, glow("#113b61"), 0, 0, 0, 1.64, 0.12, 0.044);
        const barFill = mesh(GEO.box, glow(enemyColor[e.kind]), -0.78, 0, 0.025, 1.55, 0.067, 0.035);
        const anchor = new T.Group();
        anchor.position.x = -0.77;
        barFill.position.x = 0.77;
        anchor.add(barFill);
        bar.add(barBack, anchor);
        this.scene.add(model, bar);
        record = { model, shadow, warning, bar, anchor };
        this.actors.set(e.id, record);
      }
      const { model, shadow, warning, bar, anchor } = record;
      const isBoss = e.kind === "boss";
      const bob = Math.sin(time * (isBoss ? 2.2 : 4.3) + e.phase);
      const y = e.kind === "crab" ? 1.03 + bob * 0.07 : 1.55 + bob * 0.15;
      model.position.set(e.x, y, e.z);
      model.rotation.y = e.kind === "mine" ? time * 2.8 : e.yaw;
      model.scale.setScalar(1 + e.flash * 0.63);
      shadow.position.x = e.x;
      shadow.position.z = e.z + 0.23;
      warning.visible = e.flash > 0 || (e.kind !== "crab" && e.kind !== "mine" && e.fire < 0.49);
      warning.material.opacity = e.flash > 0 ? e.flash * 5.0 : (0.49 - e.fire) * 1.25;
      warning.scale.setScalar(isBoss ? 3.7 : 2.3);
      model.userData.limbs?.forEach((limb, i) => {
        limb.rotation.z = Math.sin(time * 4.5 + i * 0.68) * (isBoss ? 0.22 : 0.24);
        limb.userData.segments?.forEach((segment, j) => {
          segment.position.y = Math.sin(time * 5 + i * 0.4 + j * 0.7) * (j * 0.12);
        });
      });
      bar.visible = e.health < e.maxHealth && !isBoss;
      bar.position.set(e.x, y + 0.55, e.z - 1.15);
      bar.quaternion.copy(this.camera.quaternion);
      anchor.scale.x = Math.max(0, e.health / e.maxHealth);
    }
    for (const [id, record] of this.actors) {
      if (active.has(id)) continue;
      record.warning.material.dispose();
      // Each bar has two small materials. Enemy models share their materials.
      record.bar.traverse(part => part.material?.dispose());
      this.scene.remove(record.model, record.shadow, record.bar);
      this.actors.delete(id);
    }

    const pearlIds = new Set();
    for (const data of game.pearls) {
      pearlIds.add(data.id);
      let gem = this.drops.get(data.id);
      if (!gem) {
        gem = pearl(data.rare);
        this.drops.set(data.id, gem);
        this.scene.add(gem);
      }
      gem.position.set(data.x, 1.42 + Math.sin(time * 6 + data.id) * 0.18, data.z);
      gem.rotation.set(time * 1.7, time * 3.5, time * 0.64);
    }
    for (const [id, gem] of this.drops) {
      if (!pearlIds.has(id)) {
        this.scene.remove(gem);
        this.drops.delete(id);
      }
    }

    const shotIds = new Set();
    for (const b of game.shots) {
      shotIds.add(b.id);
      let bolt = this.bolts.get(b.id);
      if (!bolt) {
        const material = b.friendly ? FRIENDLY : b.heavy ? HEAVY : HOSTILE;
        bolt = mesh(GEO.sphere, material, 0, 0, 0, b.friendly ? 0.113 : b.heavy ? 0.24 : 0.18, 0.13, b.friendly ? 0.84 : 0.51);
        const halo = sprite(b.friendly ? "#42effc" : b.heavy ? "#fa67c5" : "#ff9f4c", this.reef.light);
        // Attach the halo in world units outside the scaled projectile mesh.
        const group = new T.Group();
        group.add(bolt, halo);
        halo.scale.setScalar(b.friendly ? 1.45 : b.heavy ? 1.7 : 1.31);
        halo.material.opacity = 0.63;
        bolt = group;
        this.scene.add(bolt);
        this.bolts.set(b.id, bolt);
      }
      bolt.position.set(b.x, b.friendly ? 1.42 : 1.22, b.z);
      bolt.rotation.y = Math.atan2(b.vx, b.vz);
    }
    for (const [id, bolt] of this.bolts) {
      if (!shotIds.has(id)) {
        bolt.children[1].material.dispose();
        this.scene.remove(bolt);
        this.bolts.delete(id);
      }
    }
  }

  reset() {
    // Clear render-only state before a new game reuses entity IDs.
    for (const fx of this.ripples) {
      fx.ring.material.dispose();
      this.scene.remove(fx.ring);
    }
    this.ripples.length = this.particles.length = 0;
    this.updateActors({ enemies: [], shots: [], pearls: [] }, this.visualTime);
  }

  draw(game, dt) {
    this.visualTime += dt;
    const t = this.visualTime;
    const idle = game.mode === "menu";
    const p = game.player;
    const heroScale = idle ? (this.aspect > 1.16 ? 2.55 : 2.22) : 1;
    this.player.position.set(idle ? this.aspect > 1.16 ? 4.9 : 0 : p.x,
      idle ? 2.65 + Math.sin(t * 1.9) * 0.17 : 1.4 + Math.sin(t * 4.5) * 0.06,
      idle ? -2.8 : p.z);
    const yaw = idle ? -0.92 + Math.sin(t * 0.85) * 0.38 : p.yaw;
    const delta = T.MathUtils.euclideanModulo(yaw - this.player.rotation.y + Math.PI, TAU) - Math.PI;
    this.player.rotation.y += delta * Math.min(1, dt * (idle ? 5 : 14));
    this.player.rotation.z = idle ? 0.14 : T.MathUtils.clamp(-p.vx * 0.024, -0.31, 0.31);
    this.player.rotation.x = idle ? -0.09 : T.MathUtils.clamp(p.vz * 0.018, -0.18, 0.18);
    this.player.scale.setScalar(heroScale);
    this.player.userData.propeller.rotation.z += dt * (idle ? 4.5 : 8.4);
    this.player.visible = p.health > 0;
    const beam = game.beam;
    this.beamBand.visible = !!beam;
    this.beamCore.visible = !!beam && beam.charge <= 0;
    if (beam) {
      const length = 12 - beam.z;
      const x = beam.x;
      const z = beam.z + length / 2;
      const active = beam.charge <= 0;
      this.beamBand.position.set(x, -0.25, z);
      this.beamBand.scale.set(2.24, length, 1);
      this.beamBand.material.opacity = active ? beam.flash * 1.9 : 0.28 + 0.18 * Math.sin(t * 16);
      this.beamCore.position.set(x, 1.27, z);
      this.beamCore.scale.set(0.76, length, 1);
      this.beamCore.material.opacity = beam.flash * 2.15;
    }
    this.playerShadow.position.x = this.player.position.x;
    this.playerShadow.position.z = this.player.position.z;
    this.playerShadow.scale.set(heroScale * 3.35, heroScale * 2.82, 1);
    this.shotGlow = Math.max(0, this.shotGlow - dt * 7.5);
    this.shipLight.visible = this.shotGlow > 0;
    this.shipLight.material.opacity = this.shotGlow * 0.56;
    this.shipLight.scale.setScalar(1.35 + this.shotGlow * 0.35);
    if (!this.reduced) {
      this.reef.sand.offset.set(t * 0.012, Math.sin(t * 0.24) * 0.08);
      this.reef.plankton.position.set(Math.sin(t * 0.33) * 1.5, Math.sin(t * 0.18) * 0.7, Math.cos(t * 0.26) * 0.5);
    }
    this.reef.floorMat.color.lerp(this.floorTint.set(COLORS[Math.max(0, game.wave - 1)]), Math.min(1, dt * 1.6));
    this.updateActors(game, t);
    this.effects(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
