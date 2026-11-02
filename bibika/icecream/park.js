import * as T from "../vendor/three/three.module.min.js";
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
} from "./models.js";

const clamp = T.MathUtils.clamp,
  mix = T.MathUtils.lerp;
const worktop = new T.Vector3(0.45, 0.48, 2.53),
  paw = new T.Vector3(2.14, 0.97, 1.27);
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
    this.scene = new T.Scene();
    this.scene.fog = new T.Fog(0xa0e6e3, 19, 48);
    this.camera = new T.PerspectiveCamera();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene.add(new T.HemisphereLight(0xfff6e7, 0xffc8a9, 1.12));
    const sun = new T.DirectionalLight(0xfff3db, 2.58);
    sun.position.set(-5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
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

    truck(this.scene);
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
      const center = new T.Vector3(-0.48, 1.89, 0.0),
        offset = new T.Vector3(-3.05, 2.75, 14.25);
      this.camera.fov = T.MathUtils.radToDeg(
        2 * Math.atan(span / (2 * offset.length())),
      );
      this.camera.aspect = aspect;
      this.camera.near = 0.1;
      this.camera.far = 100;
      this.camera.position.copy(center).add(offset);
      this.camera.lookAt(center);
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
  }
  missed(flavor) {
    if (this.miss) dropMeshes(this.miss.ball);
    const ball = scoop(this.scene, flavor);
    ball.scale.setScalar(0.55);
    this.miss = { at: performance.now() / 1000, ball };
  }
  render(ms, force = false) {
    if (document.hidden && !force) return;
    if (!force && ms - this.last < 32) return;
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
    this.renderer.render(this.scene, this.camera);
  }
}
