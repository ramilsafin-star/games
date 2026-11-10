import * as T from "../vendor/three/three.module.min.js?v=b102cc67";
import "./gfx.js?v=b102cc67";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=b102cc67";
import {
  scenery,
  truck,
  animal,
  puppy,
  stand,
  group,
  orb,
  cone,
  scoop,
  topping,
  syrupStroke,
  heart,
  pals,
  clouds,
  balloons,
  butterfly,
  bulbs,
} from "./models.js?v=b102cc67";

const clamp = T.MathUtils.clamp,
  mix = T.MathUtils.lerp;
const worktop = new T.Vector3(0.45, 0.48, 2.53),
  paw = new T.Vector3(2.14, 0.97, 1.27);
// Камера смотрит на середину сцены; offset — откуда, зум и покачивание считаются в aimCamera
const center = new T.Vector3(-0.48, 1.89, 0.0),
  offset = new T.Vector3(-3.05, 2.75, 14.25),
  guestSpot = new T.Vector3(2.6, 1.7, 0.6);
const confettiColors = ["#ff4f7b", "#ffcc33", "#2fd0a6", "#4aa3ff", "#b06cff", "#ff8a3d"];
function dropMeshes(root) {
  root.traverse((m) => {
    if (m.isMesh) m.geometry.dispose();
  });
  root.removeFromParent();
}
export class Park {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    // Мягкая тональная кривая сохраняет яркие цвета, а отражения комнаты дают блики и объём
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();
    this.scene.fog = new T.Fog(0xd6ecf6, 19, 48);
    this.camera = new T.PerspectiveCamera();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene.add(new T.HemisphereLight(0xfff6e7, 0xffc3c8, 0.95));
    const sun = new T.DirectionalLight(0xfff3db, 2.58);
    sun.position.set(-5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -7,
      right: 7,
      top: 6,
      bottom: -5,
      near: 0.1,
      far: 24,
    });
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    const rim = new T.DirectionalLight(0xafffff, 1.2);
    rim.position.set(6, 4, -3);
    this.scene.add(rim);
    const background = group(this.scene);
    scenery(background);

    this.sign = truck(this.scene).spin;
    this.bunch = balloons(this.scene);
    stand(this.scene, worktop.x, worktop.z);
    this.guests = pals.map((_, i) => animal(this.scene, i));
    this.dog = puppy(this.scene);
    this.dog.position.set(-4.21, 0, 1.33);
    this.dog.rotation.y = 0.32;
    this.treat = this.freshCone();
    this.scene.traverse((m) => {
      if (m.isMesh && !m.material.transparent) {
        m.receiveShadow = true;
        m.castShadow = true;
      }
    });
    background.traverse((m) => {
      if (m.isMesh) m.castShadow = false;
    });
    this.clouds = clouds(background);
    this.flutter = [
      [-6.2, -0.7, "#ff6fa8"],
      [6.7, -1.3, "#ffc22e"],
      [1.4, -2.9, "#5aa8ff"],
    ].map(([x, z, color], k) => {
      const fly = butterfly(this.scene, color);
      fly.root.scale.setScalar(1.8);
      return { ...fly, x, z, k };
    });
    // Мыльные пузыри: у каждого свой материал, чтобы лопался и таял отдельно
    const bubbleGeo = new T.SphereGeometry(1, 28, 18);
    this.bubbles = [];
    for (let i = 0; i < 7; i++) {
      const look = new T.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.03,
        transparent: true,
        opacity: 0.42,
        // Лёгкая радужная плёнка, чтобы пузырь был виден и на светлом небе
        emissive: 0xd8c8ff,
        emissiveIntensity: 0.12,
        depthWrite: false,
        iridescence: 1,
        iridescenceIOR: 1.33,
        iridescenceThicknessRange: [160, 560],
        envMapIntensity: 3.2,
      });
      const ball = new T.Mesh(bubbleGeo, look);
      ball.renderOrder = 3;
      // Белый блик сверху-слева, как на картинке в детской книжке
      const glint = new T.Mesh(
        bubbleGeo,
        new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      glint.position.set(-0.38, 0.42, 0.62);
      glint.scale.set(0.2, 0.13, 0.05);
      glint.rotation.z = 0.7;
      glint.renderOrder = 4;
      ball.add(glint);
      ball.visible = false;
      this.scene.add(ball);
      this.bubbles.push({ ball, born: 0.6 + i * 1.7, popAt: null });
    }
    // Конфетти для точного заказа: одна сетка на все кусочки
    const bits = 90;
    this.confetti = new T.InstancedMesh(
      new T.PlaneGeometry(0.09, 0.15),
      new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.3, metalness: 0.3 }),
      bits,
    );
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.confettiAt = -9;
    this.flight = [];
    for (let i = 0; i < bits; i++) {
      this.confetti.setColorAt(i, new T.Color(confettiColors[i % confettiColors.length]));
      const a = Math.random() * Math.PI * 2,
        out = 1 + Math.random() * 2.4;
      this.flight.push({
        v: new T.Vector3(Math.cos(a) * out, 3.2 + Math.random() * 3, Math.sin(a) * out * 0.7 + 0.8),
        spin: new T.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
        drift: Math.random() * 6,
      });
    }
    this.scene.add(this.confetti);
    this.dummy = new T.Object3D();
    this.sparkles = group(this.scene);
    for (let i = 0; i < 12; i++) {
      const bit = orb(
        this.sparkles,
        0,
        0,
        0,
        0.048,
        0.08,
        0.036,
        ["#ffc45b", "#ff839a", "#8ddecc", "#b993e2"][i % 4],
      );
      bit.rotation.z = i;
    }
    this.hearts = group(this.scene);
    for (let i = 0; i < 9; i++)
      heart(this.hearts, ["#ff5f86", "#ff8fab", "#f2475f"][i % 3]);
    this.parts = [];
    this.strokes = [];
    this.scoops = [];
    this.decor = null;
    this.ray = new T.Raycaster();
    this.point = new T.Vector2();
    this.id = 0;
    this.appear = -2;
    this.delivered = null;
    this.last = 0;
    this.miss = null;
    this.leaving = null;
    this.perfect = false;
    this.nodAt = -9;
    this.still = false;
    this.swayClock = 0;
    this.look = center.clone();
    this.zoom = 1;
    this.focus = new T.Vector3();
    this.sway = new T.Vector3();
    this.confettiFrom = new T.Vector3(2.7, 2.3, 0.9);
    this.frameGap = 15;
    this.slowFrames = 0;
    this.prev = 0;
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.reset(0);
    this.resize = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      // На высоком экране кадр уже по ширине: фургон и гость крупнее, меньше пустого неба
      const aspect = w / h,
        wide = mix(9.1, 10.85, clamp((aspect - 0.8) / 0.8, 0, 1)),
        span = Math.max(5.75, wide / aspect);
      this.camera.fov = T.MathUtils.radToDeg(
        2 * Math.atan(span / (2 * offset.length())),
      );
      this.camera.aspect = aspect;
      this.camera.near = 0.1;
      this.camera.far = 100;
      this.aimCamera(0);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.render(performance.now(), true);
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop((now) => this.render(now));
  }
  // Рожок на подставке; новый появляется, когда прежний уносит гость
  freshCone() {
    const treat = cone(this.scene);
    treat.traverse((m) => {
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    treat.position.copy(worktop);
    treat.scale.setScalar(1.25);
    return treat;
  }
  finishLeaving() {
    const away = this.leaving;
    if (!away) return;
    for (const part of away.parts) dropMeshes(part);
    away.treat.removeFromParent();
    away.guest.dab.visible = away.guest.tongue.visible = false;
    if (away.guest !== this.guests[this.id]) away.guest.root.visible = false;
    this.leaving = null;
  }
  reset(id) {
    const now = performance.now() / 1000;
    this.finishLeaving();
    if (this.delivered !== null && id !== this.id && !this.motion.matches) {
      // Угощённый гость уходит в парк со своим рожком
      const guest = this.guests[this.id];
      guest.root.attach(this.treat);
      this.leaving = { guest, treat: this.treat, parts: this.parts, at: now };
      this.treat = this.freshCone();
    } else for (const part of this.parts) dropMeshes(part);
    this.parts = [];
    this.scoops = [];
    this.decor = null;
    this.strokes = [];
    this.delivered = null;
    this.perfect = false;
    this.treat.position.copy(worktop);
    this.treat.rotation.set(0, 0, 0);
    this.treat.scale.setScalar(1.25);
    this.id = id;
    // Пока прежний гость отходит, новый ждёт за краем сцены
    this.appear = now + (this.leaving ? 0.25 : 0);
    this.guests.forEach((g, i) => {
      g.root.visible = i === id || g === this.leaving?.guest;
      if (i === id) g.dab.visible = g.tongue.visible = false;
    });
  }
  // Камера медленно покачивается, чтобы была видна глубина сцены,
  // подъезжает к рожку, пока его собирают, и к гостю, когда он получил угощение
  aimCamera(dt) {
    const calm = this.motion.matches,
      now = performance.now() / 1000;
    let zoom = 1;
    this.focus.copy(center);
    if (!calm && this.delivered !== null && now - this.delivered < 2.8) {
      this.focus.lerp(guestSpot, 0.38);
      zoom = 0.88;
    } else if (!calm && this.scoops.length) {
      this.focus.lerp(this.treat.position, 0.16);
      zoom = 0.95;
    }
    const k = dt ? 1 - Math.exp(-dt * 2.4) : 1;
    this.look.lerp(this.focus, k);
    this.zoom += (zoom - this.zoom) * k;
    if (!this.still && !calm) this.swayClock += dt;
    const w = this.swayClock;
    this.camera.position.copy(this.look).addScaledVector(offset, this.zoom);
    if (!calm)
      this.camera.position.add(
        this.sway.set(
          Math.sin(w * 0.31) * 0.6 + Math.sin(w * 0.17 + 1.3) * 0.25,
          Math.sin(w * 0.23 + 0.6) * 0.2,
          0,
        ),
      );
    this.camera.lookAt(this.look);
  }
  spawnBubble(b, born) {
    b.born = born;
    b.x = -5.5 + Math.random() * 11;
    b.z = -1.6 + Math.random() * 3.6;
    b.r = 0.15 + Math.random() * 0.17;
    b.rise = 0.32 + Math.random() * 0.25;
  }
  // Пузырь под пальцем лопается; пузырь щедро крупнее, чтобы ребёнок попадал
  popBubble(x, y) {
    if (this.motion.matches) return false;
    this.aim(x, y);
    let best = null,
      near = Infinity;
    for (const b of this.bubbles) {
      if (!b.ball.visible || b.popAt !== null) continue;
      const reach = b.ball.scale.x * 1.5 + 0.12;
      if (this.ray.ray.distanceSqToPoint(b.ball.position) > reach * reach) continue;
      const along = this.ray.ray.origin.distanceTo(b.ball.position);
      if (along < near) {
        near = along;
        best = b;
      }
    }
    if (!best) return false;
    best.popAt = performance.now() / 1000;
    return true;
  }
  // Всё, что живёт само: облака, бабочки, пузыри, шары, лампочки, конфетти
  animateWorld(t, dt, motion) {
    this.sign.rotation.y = motion * t * 0.9;
    this.bunch.rotation.set(
      motion * Math.sin(t * 0.7 + 1) * 0.05,
      0,
      motion * Math.sin(t * 0.9) * 0.07,
    );
    bulbs.forEach((b, i) => {
      b.emissiveIntensity = motion
        ? 0.3 + 1.2 * Math.max(0, Math.sin(t * 4 - i * 1.26))
        : 0.8;
    });
    for (const [i, cloud] of this.clouds.entries()) {
      cloud.position.x += motion * dt * (0.18 + i * 0.04);
      if (cloud.position.x > 16) cloud.position.x = -16;
    }
    for (const f of this.flutter) {
      const a = t * 0.6 + f.k * 2.1;
      f.root.position.set(
        f.x + Math.sin(a) * 1.1,
        0.95 + Math.sin(a * 1.7) * 0.35 + 0.08 * Math.sin(t * 9 + f.k),
        f.z + Math.cos(a * 0.8) * 0.7,
      );
      f.root.rotation.y = Math.atan2(Math.cos(a) * 1.1, -Math.sin(a * 0.8) * 0.56);
      const flap = motion ? 0.2 + 0.95 * Math.abs(Math.sin(t * 15 + f.k)) : 0.5;
      f.wings[0].rotation.z = -flap;
      f.wings[1].rotation.z = flap;
    }
    for (const [i, b] of this.bubbles.entries()) {
      if (!motion) {
        b.ball.visible = false;
        continue;
      }
      if (b.x === undefined) this.spawnBubble(b, b.born);
      if (b.popAt !== null) {
        const q = (t - b.popAt) / 0.16;
        if (q >= 1) {
          b.popAt = null;
          b.ball.visible = false;
          this.spawnBubble(b, t + 1.2 + Math.random() * 2.5);
          continue;
        }
        b.ball.scale.setScalar(b.r * (1 + q * 0.7));
        b.ball.material.opacity = 0.42 * (1 - q);
        b.ball.children[0].material.opacity = 0.9 * (1 - q);
        continue;
      }
      const age = t - b.born;
      b.ball.visible = age > 0;
      if (age <= 0) continue;
      const y = 0.35 + age * b.rise;
      if (y > 7.2) {
        b.ball.visible = false;
        this.spawnBubble(b, t + Math.random() * 2);
        continue;
      }
      const grow = Math.min(1, age * 2.5),
        wob = Math.sin(age * 7 + i) * 0.04;
      b.ball.position.set(
        b.x + Math.sin(age * 1.3 + i) * 0.35,
        y,
        b.z + Math.cos(age * 0.9 + i) * 0.2,
      );
      b.ball.scale.set(b.r * grow * (1 + wob), b.r * grow * (1 - wob), b.r * grow);
      b.ball.material.opacity = 0.42;
      b.ball.children[0].material.opacity = 0.9;
    }
    const age = t - this.confettiAt;
    this.confetti.visible = !!motion && age >= 0 && age < 2.6;
    if (this.confetti.visible) {
      const fade = clamp((2.6 - age) / 0.5, 0, 1),
        from = this.confettiFrom,
        drag = 1 - age * 0.18;
      this.flight.forEach((f, i) => {
        const y = from.y + f.v.y * age - 3.6 * age * age,
          landed = y < 0.03;
        this.dummy.position.set(
          from.x + f.v.x * age * drag + Math.sin(age * 3 + f.drift) * 0.15,
          landed ? 0.03 : y,
          from.z + f.v.z * age * drag,
        );
        if (landed) this.dummy.rotation.set(-Math.PI / 2, 0, f.drift);
        else this.dummy.rotation.set(f.spin.x * age, f.spin.y * age, f.spin.z * age);
        this.dummy.scale.setScalar(fade);
        this.dummy.updateMatrix();
        this.confetti.setMatrixAt(i, this.dummy.matrix);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }
  // Гость кивает, когда на рожке появилось то, что он заказал
  nod() {
    this.nodAt = performance.now() / 1000;
  }
  add(flavor) {
    this.clearDecoration();
    const m = scoop(this.treat, flavor, this.scoops.length);
    this.scoops.push(m);
    this.parts.push(m);
    this.bounce = performance.now() / 1000;
  }
  clearDecoration() {
    for (const part of [...this.strokes, this.decor].filter(Boolean)) {
      this.parts.splice(this.parts.indexOf(part), 1);
      dropMeshes(part);
    }
    this.strokes = [];
    this.decor = null;
  }
  decorate(kind) {
    this.clearDecoration();
    this.decor = topping(
      this.treat,
      kind,
      1.11 + (this.scoops.length - 1) * 0.51,
    );
    this.parts.push(this.decor);
  }
  aim(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.point.set(
      (2 * (clientX - rect.left)) / rect.width - 1,
      1 - (2 * (clientY - rect.top)) / rect.height,
    );
    this.ray.setFromCamera(this.point, this.camera);
  }
  nearCone(x, y) {
    this.aim(x, y);
    const bottom = this.treat.localToWorld(new T.Vector3(0, 0.12, 0));
    const top = this.treat.localToWorld(
      new T.Vector3(0, 1.12 + this.scoops.length * 0.51, 0),
    );
    return this.ray.ray.distanceSqToSegment(bottom, top) < 0.84;
  }
  nearGuest(x, y) {
    this.aim(x, y);
    const guest = this.guests[this.id].root;
    return (
      this.ray.ray.distanceSqToSegment(
        guest.localToWorld(new T.Vector3(0, 0.46, 0)),
        guest.localToWorld(new T.Vector3(0, 2.15, 0)),
      ) < 0.78
    );
  }
  inkPoint(x, y) {
    this.aim(x, y);
    const hit = this.ray.intersectObject(this.scoops.at(-1), true)[0];
    if (!hit) return null;
    const local = this.treat.worldToLocal(hit.point);
    local.z += 0.022;
    return local.toArray();
  }
  ink(points, previous) {
    const stroke = syrupStroke(this.treat, points);
    if (!stroke) return previous;
    if (previous) {
      this.strokes.splice(this.strokes.indexOf(previous), 1);
      this.parts.splice(this.parts.indexOf(previous), 1);
      dropMeshes(previous);
    }
    this.strokes.push(stroke);
    this.parts.push(stroke);
    return stroke;
  }
  give(perfect = false, color = "#ff9bb0") {
    this.delivered = performance.now() / 1000;
    this.perfect = perfect;
    this.guests[this.id].dab.material.color.set(color);
    if (perfect) this.confettiAt = this.delivered + 0.2;
  }
  missed(flavor) {
    if (this.miss) dropMeshes(this.miss.ball);
    const ball = scoop(this.scene, flavor);
    ball.scale.setScalar(0.55);
    this.miss = { at: performance.now() / 1000, ball };
  }
  render(ms, force = false) {
    if (document.hidden && !force) return;
    if (!force && ms - this.last < this.frameGap) return;
    // Если устройство не успевает 60 кадров в секунду, переходим на ровные 30
    if (!force && this.last) {
      const gap = ms - this.last;
      this.slowFrames =
        gap > 24 && gap < 200 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      if (this.slowFrames > 90) this.frameGap = 32;
    }
    const dt = this.last ? clamp((ms - this.last) / 1000, 0, 0.1) : 0;
    this.last = ms;
    const t = ms / 1000,
      motion = this.motion.matches ? 0 : 1;
    const g = this.guests[this.id],
      arrival = clamp((t - this.appear) * 1.45, 0, 1);
    const give =
      this.delivered === null ? 0 : clamp((t - this.delivered) * 1.6, 0, 1);
    const elapsed =
      this.delivered === null ? 0 : Math.max(0, t - this.delivered - 0.45);
    // Зайка и поросёнок всегда скачут от радости, остальные — когда заказ угадан
    const hop =
      g.hop || this.perfect
        ? Math.abs(Math.sin(Math.min(elapsed, 1) * Math.PI * 3)) * 0.34
        : Math.sin(clamp((give - 0.56) / 0.44, 0, 1) * Math.PI) * 0.2;
    const lick = g.lick
      ? Math.sin(clamp((elapsed - 0.15) / 0.9, 0, 1) * Math.PI)
      : 0;
    // Новый гость прибегает справа, пока прежний уходит в парк
    g.root.visible = t >= this.appear || !motion;
    g.root.position.set(
      2.88 + (1 - arrival) * 4 * motion,
      (0.016 * Math.sin(t * 3) +
        Math.abs(Math.sin(arrival * Math.PI * 3)) * 0.13 +
        hop) *
        motion,
      0.57,
    );
    g.root.rotation.y = -0.17;
    g.root.scale.setScalar(1.06);
    g.head.rotation.z =
      motion * (0.038 * Math.sin(t * 1.8 + this.id) + give * 0.09);
    g.head.rotation.x =
      motion *
      Math.sin(clamp((t - this.nodAt) / 0.7, 0, 1) * Math.PI * 2) *
      0.16;
    g.eyes.scale.y = motion && t % 4.4 > 4.23 ? 0.14 : 1;
    g.dab.visible = !!g.lick && give > 0.82 && elapsed < 1;
    g.eyes.scale.x = 1 - 0.23 * lick * motion;
    g.tongue.visible = lick > 0.03;
    g.tongue.position.y = -0.22 + 0.13 * lick;
    g.tail.rotation.z =
      motion * Math.sin(t * (give ? 15 : 3)) * (give ? 0.29 : 0.06);
    const burst = clamp(elapsed / 1.35, 0, 1);
    this.sparkles.visible = !!motion && burst > 0 && burst < 1;
    if (this.sparkles.visible)
      this.sparkles.children.forEach((bit, i) => {
        const a = i * 2.4;
        bit.position.set(
          2.84 + Math.cos(a) * burst * 1.55,
          1.84 + burst * (1.7 + (i % 3) * 0.28) - burst * burst * 1.45,
          0.7 + Math.sin(a) * burst,
        );
        bit.scale.set(
          0.047 * (1 - burst),
          0.09 * (1 - burst),
          0.037 * (1 - burst),
        );
        bit.rotation.z = a + burst * 6;
      });
    // Сердечки поднимаются над гостем, если рожок точно как в заказе
    this.hearts.visible =
      !!motion && this.perfect && this.delivered !== null && elapsed < 2.4;
    if (this.hearts.visible)
      this.hearts.children.forEach((h, i) => {
        const p = clamp((elapsed - i * 0.1) / 1.4, 0, 1),
          a = i * 2.39;
        h.visible = p > 0 && p < 1;
        h.position.set(
          g.root.position.x + Math.sin(a) * (0.3 + 0.9 * p),
          2.4 + p * 2.2,
          1 + Math.cos(a) * 0.3,
        );
        h.scale.setScalar(
          0.32 * Math.sin((Math.min(p * 5, 1) * Math.PI) / 2) * (1 - p ** 4),
        );
        h.rotation.set(0, Math.sin(p * 4 + i) * 0.5, Math.sin(p * 6 + i) * 0.25);
      });
    if (this.leaving) {
      const away = this.leaving,
        q = clamp((t - away.at) / 1.7, 0, 1);
      if (!motion || q === 1) this.finishLeaving();
      else {
        const walk = 1 - (1 - q) ** 2,
          r = away.guest.root;
        r.position.set(
          mix(2.88, 7.6, walk),
          Math.abs(Math.sin(q * Math.PI * 7)) * 0.1,
          mix(0.57, -2.4, walk),
        );
        r.rotation.y = mix(-0.17, 2.2, clamp(q * 3, 0, 1));
        away.guest.tail.rotation.z = Math.sin(t * 12) * 0.25;
        away.guest.head.rotation.x = 0;
      }
    }
    // Свежий рожок выпрыгивает на подставку с лёгким перелётом
    const pop = motion ? clamp((t - this.appear) * 3, 0, 1) : 1,
      spring = 1 + 2.70158 * (pop - 1) ** 3 + 1.70158 * (pop - 1) ** 2;
    this.treat.position.lerpVectors(worktop, paw, give);
    this.treat.position.y +=
      motion * (0.5 * Math.sin(give * Math.PI) + give * hop);
    this.treat.rotation.z = mix(0, -0.25, give);
    this.treat.scale.setScalar(mix(1.25, 0.72, give) * spring);
    if (this.scoops.length) {
      const top = this.scoops.at(-1),
        p = clamp((t - this.bounce) * 3, 0, 1);
      top.position.y =
        1.11 + (this.scoops.length - 1) * 0.51 + motion * 0.48 * (1 - p) ** 2;
      // Шарик падает вытянутым, а приземлившись сплющивается и пружинит
      const q = clamp((t - this.bounce - 0.33) / 0.45, 0, 1),
        squash =
          motion *
          (p < 1 ? -0.12 * (1 - p) : Math.sin(q * Math.PI * 2.5) * (1 - q) * 0.2);
      top.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    }
    this.dog.position.y = 0.012 * Math.sin(t * 3.8) * motion;
    if (this.miss) {
      const p = clamp((t - this.miss.at) * 1.35, 0, 1);
      this.miss.ball.position.set(
        mix(worktop.x, -4.21, p),
        mix(1.28, 0.61, p) + Math.sin(p * Math.PI) * 1.34,
        1.35,
      );
      this.dog.position.y += Math.sin(p * Math.PI) * 0.23;
      if (p === 1) {
        dropMeshes(this.miss.ball);
        this.miss = null;
      }
    }
    this.animateWorld(t, dt, motion);
    if (!force) this.aimCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
