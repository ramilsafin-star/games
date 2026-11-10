// Сцена магазина на Three.js: всё, что видно и что движется. Правила покупки живут в game.js.
import * as T from "../vendor/three/three.module.min.js?v=d6a10efd";
import "./gfx.js?v=d6a10efd";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js?v=d6a10efd";
import {
  shop,
  counter,
  register,
  terminal,
  bag,
  card,
  coin,
  banknote,
  receipt,
  glow,
  product,
  animal,
  pals,
  spots,
  beltTexture,
  heart,
  group,
  orb,
} from "./models.js?v=d6a10efd";

const clamp = T.MathUtils.clamp,
  mix = T.MathUtils.lerp,
  pie = Math.PI;
// Камера у кассира, чуть сверху. Лёжа видна вся столешница от ленты до кассы;
// стоя камера ближе, смотрит круче вниз и переезжает к тому месту, где сейчас дело
const center = new T.Vector3(0.25, 1.5, 0.45),
  wideView = new T.Vector3(0, 3.5, 6.5),
  tallView = new T.Vector3(0, 4.4, 5.4);
const door = new T.Vector3(-7.5, 0, -1.6),
  exit = new T.Vector3(7.8, 0, -1.6);
const confettiColors = ["#ff4f7b", "#ffcc33", "#2fd0a6", "#4aa3ff", "#b06cff", "#ff8a3d"];
const ease = (p) => p * p * (3 - 2 * p);
const arc = (from, to, p, lift) =>
  new T.Vector3().lerpVectors(from, to, ease(p)).add(new T.Vector3(0, Math.sin(p * pie) * lift, 0));

export class Store {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.fog = new T.Fog(0xfff1dc, 16, 40);
    this.camera = new T.PerspectiveCamera();
    this.scene.add(new T.HemisphereLight(0xfff8ec, 0xffd9b8, 1.0));
    const sun = new T.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(-3, 9, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -4, near: 0.1, far: 26 });
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    const rim = new T.DirectionalLight(0xc8fff0, 0.9);
    rim.position.set(5, 5, -4);
    this.scene.add(rim);

    const room = group(this.scene);
    shop(room);
    room.traverse((m) => {
      if (m.isMesh) m.receiveShadow = true;
    });
    const desk = counter(this.scene);
    this.belt = desk.belt;
    this.laser = desk.laser;
    this.till = register(this.scene);
    this.pos = terminal(this.scene);
    this.sack = bag(this.scene);
    this.customers = pals.map((_, i) => {
      const a = animal(this.scene, i);
      a.root.visible = false;
      a.root.scale.setScalar(1.15);
      return a;
    });
    this.scene.traverse((m) => {
      if (m.isMesh && !m.material.transparent) m.castShadow = m.receiveShadow = true;
    });
    // Стены, пол и полки только принимают тени: так дешевле
    room.traverse((m) => {
      if (m.isMesh) m.castShadow = false;
    });
    this.ring = glow(this.scene);
    this.ring.visible = false;
    this.hearts = group(this.scene);
    for (let i = 0; i < 8; i++) heart(this.hearts, ["#ff5f86", "#ff8fab", "#f2475f"][i % 3]);
    this.hearts.visible = false;
    this.heartsAt = -9;
    this.makeConfetti();

    this.items = [];
    this.tweens = [];
    this.coins = [];
    this.notes = [];
    this.who = null;
    this.walk = null;
    this.drawerOut = 0;
    this.drawerTarget = 0;
    this.paper = null;
    this.held = null;
    this.drag = null;
    this.focus = center.clone();
    this.look = center.clone();
    this.zoom = 1;
    this.zoomTarget = 1;
    this.focusTarget = center.clone();
    this.sway = new T.Vector3();
    this.swayClock = 0;
    this.ray = new T.Raycaster();
    this.point = new T.Vector2();
    this.plane = new T.Plane(new T.Vector3(0, 1, 0), -1.4);
    this.last = 0;
    this.frameGap = 15;
    this.slowFrames = 0;
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.screen({ total: 0, count: 0, of: 0 });
    this.terminalScreen("idle");
    this.resize = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      if (!w || !h) return;
      // По ширине в кадре весь прилавок; на высоком экране чуть уже, чтобы товары были крупнее
      const aspect = w / h,
        tall = clamp((1.25 - aspect) / 0.5, 0, 1),
        // Телефон стоя: ещё ближе, в кадре только тот участок прилавка, где сейчас дело
        wide =
          aspect > 1.25
            ? mix(8.3, 9.3, clamp((aspect - 1.25) / 0.6, 0, 1))
            : mix(mix(8.3, 5.6, tall), 4.4, clamp((0.75 - aspect) / 0.27, 0, 1)),
        span = Math.max(4.9, wide / aspect);
      this.offset = new T.Vector3().lerpVectors(wideView, tallView, tall);
      this.follow = mix(0.12, 1, tall);
      this.camera.fov = T.MathUtils.radToDeg(2 * Math.atan(span / (2 * this.offset.length())));
      // Лишняя высота уходит наверх (вывеска, лампы), а прилавок ближе к пальцам
      this.lift = Math.max(0, span - 6.25) * 0.6;
      this.camera.aspect = aspect;
      this.camera.near = 0.1;
      this.camera.far = 80;
      this.focusOn(this.focusName);
      this.aimCamera(0);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.render(performance.now(), true);
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop((ms) => this.render(ms));
  }
  get calm() {
    return this.motion.matches;
  }
  now() {
    return performance.now() / 1000;
  }
  // Простая анимация: update(p) с p от 0 до 1; при «меньше движения» всё втрое быстрее
  tween(seconds, update) {
    return new Promise((done) => {
      this.tweens.push({ at: this.now(), dur: this.calm ? seconds * 0.35 : seconds, update, done });
    });
  }
  wait(seconds) {
    return this.tween(seconds, () => {});
  }
  // ---------- Покупатель ----------
  async enter(index, ids) {
    this.clearOrder();
    const who = this.customers[index];
    this.who = who;
    who.root.visible = true;
    who.root.position.copy(door);
    who.root.rotation.y = pie / 2;
    this.walking = true;
    await this.tween(1.5, (p) => {
      who.root.position.lerpVectors(door, spots.customer, ease(p));
      who.root.rotation.y = mix(pie / 2, 0, clamp((p - 0.7) / 0.3, 0, 1));
    });
    this.walking = false;
    // Пока покупки ложатся на ленту, камера уже едет к ней, чтобы к первому касанию стоять на месте
    this.focusOn("belt");
    // Покупатель выкладывает покупки на ленту одну за другой
    for (const [i, id] of ids.entries()) {
      const item = product(this.scene, id);
      item.traverse((m) => m.isMesh && (m.castShadow = true));
      const home = new T.Vector3(-3.05 + i * 0.5, spots.belt.y, spots.belt.z);
      const from = new T.Vector3(spots.customer.x - 0.4, 2.0, 0.2);
      this.items.push({ id, mesh: item, home, state: "belt" });
      const it = this.items.at(-1);
      this.tween(0.45, (p) => {
        item.position.copy(arc(from, home, p, 0.5));
        item.rotation.y = (1 - p) * 2;
      });
      await this.wait(0.16);
    }
    await this.wait(0.35);
  }
  async leave() {
    const who = this.who;
    if (!who) return;
    // Покупатель берёт пакет и уходит вправо, помахивая хвостиком
    const start = this.sack.group.position.clone(),
      paw = new T.Vector3(spots.customer.x + 0.75, 1.25, spots.customer.z + 0.45);
    await this.tween(0.5, (p) => this.sack.group.position.copy(arc(start, paw, p, 0.4)));
    who.root.attach(this.sack.group);
    this.happy = this.now();
    await this.wait(0.6);
    this.walking = true;
    const from = who.root.position.clone();
    await this.tween(1.5, (p) => {
      who.root.rotation.y = mix(0, pie / 2, clamp(p * 4, 0, 1));
      who.root.position.lerpVectors(from, exit, ease(p));
    });
    this.walking = false;
    who.root.visible = false;
    // Пакет возвращается на прилавок пустым
    this.scene.attach(this.sack.group);
    this.sack.group.position.copy(spots.bag);
    this.sack.group.rotation.set(0, 0, 0);
    for (const m of [...this.sack.inside.children]) this.drop(m);
    this.who = null;
  }
  drop(obj) {
    obj.traverse((m) => m.isMesh && m.geometry.dispose());
    obj.removeFromParent();
  }
  clearOrder() {
    for (const it of this.items) this.drop(it.mesh);
    this.items = [];
    for (const c of this.coins) c.removeFromParent();
    this.coins = [];
    for (const n of this.notes) this.drop(n);
    this.notes = [];
    if (this.paper) this.drop(this.paper.paper);
    this.paper = null;
    if (this.held) this.drop(this.held);
    this.held = null;
    this.drawerTarget = 0;
    this.screen({ total: 0, count: 0, of: 0 });
    this.terminalScreen("idle");
  }
  // ---------- Касания ----------
  aim(x, y) {
    const r = this.canvas.getBoundingClientRect();
    this.point.set(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2);
    this.ray.setFromCamera(this.point, this.camera);
    return this.ray.ray;
  }
  // Ближайший к лучу объект в пределах щедрого радиуса: маленькому пальцу легко попасть
  near(x, y, list) {
    const ray = this.aim(x, y);
    let best = null,
      gap = Infinity;
    for (const [obj, at, reach] of list) {
      const d = Math.sqrt(ray.distanceSqToPoint(at));
      if (d < reach && d / reach < gap) {
        gap = d / reach;
        best = obj;
      }
    }
    return best;
  }
  itemOnBelt(x, y) {
    return this.near(
      x,
      y,
      this.items.filter((it) => it.state === "belt").map((it) => [it, it.mesh.position.clone().setY(1.32), 0.36]),
    );
  }
  // Касание где угодно на прилавке (столешница от ленты до кассы)
  onCounter(x, y) {
    const p = new T.Vector3();
    if (!this.aim(x, y).intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -1.1), p)) return false;
    return p.x > -3.8 && p.x < 3.9 && p.z > 0.2 && p.z < 2.1;
  }
  itemInTray(x, y) {
    return this.near(
      x,
      y,
      this.items.filter((it) => it.state === "tray").map((it) => [it, it.mesh.position.clone().setY(1.3), 0.36]),
    );
  }
  hit(name, x, y) {
    const spotsOf = {
      bag: [this.sack.group.position.clone().setY(1.45), 0.5],
      card: this.held ? [this.held.getWorldPosition(new T.Vector3()), 0.42] : null,
      terminal: [spots.terminal.clone().setY(1.3), 0.42],
      drawer: [this.till.drawer.getWorldPosition(new T.Vector3()).setY(1.2), 0.55],
      dish: [spots.dish.clone().setY(1.15), 0.4],
      receipt: this.paper ? [this.paper.paper.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.3, 0)), 0.45] : null,
      register: [spots.register.clone().setY(1.7), 0.6],
      customer: this.who ? [this.who.root.position.clone().setY(2.1), 0.75] : null,
    };
    const s = spotsOf[name];
    return !!s && !!this.near(x, y, [[true, s[0], s[1]]]);
  }
  // ---------- Сканер ----------
  flashScanner() {
    this.flashAt = this.now();
  }
  // Касание: товар сам едет по ленте через сканер в лоток
  async scan(it, onBeep) {
    it.state = "moving";
    const slot = this.trayFree(),
      scanAt = spots.scanner.clone().setY(1.2);
    const from = it.mesh.position.clone(),
      edge = new T.Vector3(-0.95, spots.belt.y, spots.belt.z);
    this.beltRun = (this.beltRun || 0) + 1;
    await this.tween(0.32, (p) => it.mesh.position.lerpVectors(from, edge, ease(p)));
    this.beltRun--;
    await this.tween(0.22, (p) => it.mesh.position.lerpVectors(edge, scanAt, ease(p)));
    this.flashScanner();
    onBeep();
    await this.toTray(it, slot);
  }
  trayFree() {
    const used = this.items.filter((it) => it.slot !== undefined).map((it) => it.slot);
    return spots.tray.findIndex((_, i) => !used.includes(i));
  }
  async toTray(it, slot = this.trayFree()) {
    it.slot = slot;
    const [x, z] = spots.tray[slot];
    const from = it.mesh.position.clone(),
      to = new T.Vector3(x, 1.1, z);
    await this.tween(0.38, (p) => {
      it.mesh.position.copy(arc(from, to, p, 0.25));
      it.mesh.rotation.y = p * pie * 2;
    });
    it.state = "tray";
  }
  // Перетаскивание: товар едет за пальцем над прилавком; над сканером — писк
  grab(it) {
    it.state = "drag";
    this.drag = { it, scanned: false };
  }
  move(x, y) {
    if (!this.drag) return false;
    const ray = this.aim(x, y),
      p = new T.Vector3();
    if (!ray.intersectPlane(this.plane, p)) return false;
    p.x = clamp(p.x, -3.4, 1.6);
    p.z = clamp(p.z, 0.7, 1.5);
    this.drag.it.mesh.position.set(p.x, 1.22, p.z);
    const over = Math.hypot(p.x - spots.scanner.x, p.z - spots.scanner.z) < 0.42;
    if (over && !this.drag.scanned) {
      this.drag.scanned = true;
      this.flashScanner();
      return true;
    }
    return false;
  }
  async release() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.scanned) return this.toTray(d.it);
    // Не донёс до сканера — товар возвращается на своё место на ленте
    const from = d.it.mesh.position.clone();
    await this.tween(0.3, (p) => d.it.mesh.position.copy(arc(from, d.it.home, p, 0.15)));
    d.it.state = "belt";
  }
  // ---------- Пакет ----------
  async pack(it) {
    it.state = "packing";
    const n = this.sack.inside.children.length,
      from = it.mesh.position.clone(),
      top = this.sack.group.position.clone().add(new T.Vector3(0, 0.95, 0));
    await this.tween(0.42, (p) => it.mesh.position.copy(arc(from, top, p, 0.35)));
    this.sack.inside.attach(it.mesh);
    // Покупки встают в пакете в два ряда, верхушки выглядывают наружу
    const spot = new T.Vector3(((n % 3) - 1) * 0.16, -0.02 + Math.floor(n / 3) * 0.14, n % 2 ? 0.06 : -0.06);
    const was = it.mesh.position.clone();
    await this.tween(0.2, (p) => it.mesh.position.lerpVectors(was, spot, ease(p)));
    it.mesh.scale.setScalar(0.85);
    this.bagBump = this.now();
    it.state = "bag";
  }
  // ---------- Оплата картой ----------
  offerCard() {
    const c = card(this.who.root);
    c.position.set(0.55, 1.25, 0.62);
    c.rotation.set(-0.9, 0.2, 0.15);
    c.scale.setScalar(0.9);
    this.held = c;
  }
  async payCard(onTap) {
    const c = this.held;
    this.scene.attach(c);
    const from = c.position.clone(),
      to = spots.terminal.clone().add(new T.Vector3(0, 0.42, 0.05)),
      rot = c.rotation.clone();
    await this.tween(0.45, (p) => {
      c.position.copy(arc(from, to, p, 0.3));
      c.rotation.set(mix(rot.x, -0.35, p), mix(rot.y, 0.15, p), mix(rot.z, 0, p));
    });
    // Два касания карты о терминал
    await this.tween(0.45, (p) => (c.position.y = to.y - Math.abs(Math.sin(p * pie * 2)) * 0.1));
    onTap();
    this.terminalScreen("ok");
    await this.wait(0.35);
    const back = new T.Vector3(spots.customer.x + 0.6, 1.4, spots.customer.z + 0.5);
    await this.tween(0.35, (p) => {
      c.position.lerpVectors(to, back, ease(p));
      c.scale.setScalar(0.9 * (1 - p));
    });
    this.drop(c);
    this.held = null;
  }
  // ---------- Оплата наличными ----------
  async offerCash(values) {
    let x = 1.75;
    for (const v of values) {
      const note = banknote(this.scene, v),
        from = new T.Vector3(spots.customer.x + 0.6, 1.5, spots.customer.z + 0.5),
        to = new T.Vector3(x, 1.09 + this.notes.length * 0.015, 0.62);
      note.rotation.y = 0.1 - this.notes.length * 0.25;
      this.notes.push(note);
      await this.tween(0.4, (p) => note.position.copy(arc(from, to, p, 0.3)));
      x += 0.12;
    }
    this.drawerTarget = 1;
  }
  async giveCoin(n) {
    const c = new T.Group();
    coin(c);
    this.scene.add(c);
    c.traverse((m) => m.isMesh && (m.castShadow = true));
    const from = this.till.drawer.getWorldPosition(new T.Vector3()).add(new T.Vector3((n % 3) * 0.12 - 0.12, 0.12, 0)),
      to = spots.dish.clone().add(new T.Vector3((n % 2) * 0.05, 0.035 + n * 0.024, 0));
    this.coins.push(c);
    await this.tween(0.36, (p) => {
      c.position.copy(arc(from, to, p, 0.45));
      c.rotation.x = p * pie * 2;
    });
    c.rotation.x = 0;
  }
  async takeChange() {
    const paw = new T.Vector3(spots.customer.x + 0.6, 1.5, spots.customer.z + 0.5);
    // Деньги покупателя — в ящик, монеты сдачи — покупателю
    const drawer = this.till.drawer.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.1, 0));
    const notes = this.notes.map((n) => [n, n.position.clone()]);
    const coins = this.coins.map((c) => [c, c.position.clone()]);
    await this.tween(0.5, (p) => {
      for (const [n, from] of notes) n.position.copy(arc(from, drawer, p, 0.3));
      for (const [c, from] of coins) {
        c.position.copy(arc(from, paw, p, 0.3));
        c.scale.setScalar(1 - p * 0.8);
      }
    });
    for (const n of this.notes) this.drop(n);
    for (const c of this.coins) c.removeFromParent();
    this.notes = [];
    this.coins = [];
    this.drawerTarget = 0;
  }
  // ---------- Чек ----------
  async print(lines, total) {
    const r = receipt(this.scene, lines, total);
    const slot = this.till.group.localToWorld(new T.Vector3(0.3, 0.5, 0.12));
    r.paper.position.copy(slot);
    r.paper.rotation.x = -0.25;
    this.paper = r;
    await this.tween(1.1, (p) => {
      r.tex.repeat.y = p;
      r.tex.offset.y = 1 - p;
      r.paper.scale.y = Math.max(0.001, p);
    });
  }
  async giveReceipt() {
    const r = this.paper;
    if (!r) return;
    this.paper = null;
    const from = r.paper.position.clone(),
      to = new T.Vector3(spots.customer.x + 0.6, 1.5, spots.customer.z + 0.5);
    await this.tween(0.5, (p) => {
      r.paper.position.copy(arc(from, to, p, 0.4));
      r.paper.scale.setScalar(1 - p * 0.85);
      r.paper.rotation.z = p * 0.8;
    });
    this.drop(r.paper);
  }
  // ---------- Экраны ----------
  screen(s) {
    this.screenState = s;
    const c = this.till.screenCanvas,
      ctx = c.getContext("2d");
    ctx.fillStyle = "#123d2c";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#7ee2a8";
    ctx.font = '800 34px "Avenir Next", system-ui';
    ctx.textAlign = "left";
    const label = s.mode === "cash" ? "ДАЛИ " + s.given + " ₽" : s.mode === "done" ? "ОПЛАЧЕНО" : "К ОПЛАТЕ";
    ctx.fillText(label, 28, 52);
    ctx.textAlign = "right";
    ctx.fillStyle = "#e9ff8a";
    ctx.font = '900 128px "Avenir Next", system-ui';
    ctx.fillText(s.total + " ₽", 490, 172);
    // Внизу кружки: сколько товаров пробито или сколько монет сдачи отдано
    const dots = s.mode === "cash" ? [s.coins, s.change] : [s.count, s.of];
    const [filled, all] = dots;
    for (let i = 0; i < all; i++) {
      ctx.beginPath();
      ctx.arc(46 + i * 64, 246, 22, 0, pie * 2);
      ctx.fillStyle = i < filled ? (s.mode === "cash" ? "#ffd23f" : "#7ee2a8") : "rgba(126,226,168,.18)";
      ctx.fill();
    }
    if (s.mode === "done") {
      ctx.fillStyle = "#7ee2a8";
      ctx.font = '900 70px "Avenir Next", system-ui';
      ctx.textAlign = "left";
      ctx.fillText("✓", 30, 270);
    }
    this.till.screenTex.needsUpdate = true;
  }
  terminalScreen(state, amount = 0) {
    const c = this.pos.canvas,
      ctx = c.getContext("2d");
    ctx.fillStyle = state === "ok" ? "#2fbf6a" : state === "amount" ? "#e8f4ff" : "#1d262c";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (state === "ok") {
      ctx.fillStyle = "#ffffff";
      ctx.font = '900 110px "Avenir Next", system-ui';
      ctx.fillText("✓", 128, 84);
    } else if (state === "amount") {
      ctx.fillStyle = "#1d3b55";
      ctx.font = '900 64px "Avenir Next", system-ui';
      ctx.fillText(amount + " ₽", 128, 62);
      ctx.font = '700 30px "Avenir Next", system-ui';
      ctx.fillText(")))", 128, 122);
    }
    this.pos.tex.needsUpdate = true;
  }
  // ---------- Подсказка ----------
  // Кольцо под тем, чего нужно коснуться; HTML-рука берёт отсюда координаты на экране
  hint(name) {
    this.hintName = name;
  }
  hintSpot() {
    const n = this.hintName;
    if (!n) return null;
    if (n === "item") {
      const it = this.items.find((i) => i.state === "belt");
      return it && it.mesh.position.clone();
    }
    if (n === "tray") {
      const it = this.items.find((i) => i.state === "tray");
      return it ? it.mesh.position.clone() : this.sack.group.position.clone();
    }
    if (n === "card") return this.held ? spots.terminal.clone() : null;
    if (n === "drawer") return this.till.drawer.getWorldPosition(new T.Vector3()).setY(1.1);
    if (n === "receipt") return this.paper ? this.paper.paper.getWorldPosition(new T.Vector3()).setY(1.08) : null;
    return null;
  }
  screenPoint(v) {
    const p = v.clone().project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  // ---------- Праздник ----------
  cheer(big = false) {
    this.heartsAt = this.now();
    if (big) this.confettiAt = this.now();
  }
  makeConfetti() {
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
      const a = Math.random() * pie * 2,
        out = 1 + Math.random() * 2.6;
      this.flight.push({
        v: new T.Vector3(Math.cos(a) * out, 3.4 + Math.random() * 3, Math.sin(a) * out * 0.6 + 1),
        spin: new T.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
        drift: Math.random() * 6,
      });
    }
    this.scene.add(this.confetti);
    this.dummy = new T.Object3D();
  }
  // ---------- Наклейки ----------
  // Снимок модели в отдельной «фотостудии» в картинку для альбома
  sticker(kind, id) {
    const size = 256;
    if (!this.studio) {
      this.studio = new T.Scene();
      this.studio.environment = this.scene.environment;
      this.studio.environmentIntensity = 0.5;
      this.studio.add(new T.HemisphereLight(0xffffff, 0xffe2c8, 1.4));
      const key = new T.DirectionalLight(0xffffff, 2.2);
      key.position.set(2, 4, 5);
      this.studio.add(key);
      this.studioCam = new T.PerspectiveCamera(30, 1, 0.1, 50);
      this.target = new T.WebGLRenderTarget(size, size, { samples: 4 });
      this.target.texture.colorSpace = T.SRGBColorSpace;
    }
    const holder = group(this.studio);
    if (kind === "customer") {
      const a = animal(holder, id);
      a.tail.rotation.z = 0.2;
    } else product(holder, id);
    const box = new T.Box3().setFromObject(holder),
      mid = box.getCenter(new T.Vector3()),
      dim = box.getSize(new T.Vector3());
    if (kind === "customer") mid.y += dim.y * 0.12;
    const reach = (Math.max(dim.x, dim.y * (kind === "customer" ? 0.8 : 1)) / 2 / Math.tan((15 * pie) / 180)) * 1.15;
    this.studioCam.position.set(mid.x + reach * 0.25, mid.y + reach * 0.3, mid.z + reach);
    this.studioCam.lookAt(mid);
    const keep = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.studio, this.studioCam);
    const pixels = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, size, size, pixels);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, keep);
    this.drop(holder);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const img = c.getContext("2d").createImageData(size, size);
    // Строки в буфере идут снизу вверх
    for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    c.getContext("2d").putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
  // ---------- Камера и кадр ----------
  // Куда смотреть на каждом шаге: x середины нужного участка прилавка
  focusOn(name) {
    const x = { belt: -1.35, bag: 1.0, card: 1.0, cash: 2.1, receipt: 2.3 }[name] ?? 0.45;
    this.focusName = name;
    this.focusTarget.copy(center).setX(mix(center.x, x, this.follow ?? 0.12));
    this.zoomTarget = 1;
  }
  aimCamera(dt) {
    const k = dt ? 1 - Math.exp(-dt * 3.4) : 1;
    this.look.lerp(this.calm ? center : this.focusTarget, k);
    this.zoom += ((this.calm ? 1 : this.zoomTarget) - this.zoom) * k;
    if (!this.drag && !this.calm) this.swayClock += dt;
    const w = this.swayClock;
    const aim = this.look.clone().setY(this.look.y + (this.lift || 0));
    this.camera.position.copy(aim).addScaledVector(this.offset, this.zoom);
    if (!this.calm)
      this.camera.position.add(this.sway.set(Math.sin(w * 0.29) * 0.3, Math.sin(w * 0.21 + 0.6) * 0.1, 0));
    this.camera.lookAt(aim);
  }
  render(ms, force = false) {
    if (document.hidden && !force) return;
    if (!force && ms - this.last < this.frameGap) return;
    if (!force && this.last) {
      const gap = ms - this.last;
      this.slowFrames = gap > 24 && gap < 200 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      if (this.slowFrames > 90) this.frameGap = 32;
    }
    const dt = this.last ? clamp((ms - this.last) / 1000, 0, 0.1) : 0;
    this.last = ms;
    const t = this.now(),
      motion = this.calm ? 0 : 1;
    for (const tw of [...this.tweens]) {
      const p = clamp((t - tw.at) / tw.dur, 0, 1);
      tw.update(p);
      if (p === 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    // Лента бежит, пока по ней едет товар
    if (this.beltRun) beltTexture.offset.x -= dt * 2.4;
    // Вспышка сканера
    const flash = clamp(1 - (t - (this.flashAt || -9)) / 0.35, 0, 1);
    this.laser.opacity = 0.55 + 0.45 * flash + 0.1 * Math.sin(t * 9) * motion;
    this.laser.color.set(flash > 0 ? "#ff5a6e" : "#ff2b4a");
    // Ящик кассы
    this.drawerOut += (this.drawerTarget - this.drawerOut) * clamp(dt * 8, 0, 1);
    this.till.drawer.position.z = 0.2 + this.drawerOut * 0.55;
    // Пакет вздрагивает, когда в него падает покупка
    const bump = clamp(1 - (t - (this.bagBump || -9)) / 0.3, 0, 1);
    this.sack.group.scale.set(1 + bump * 0.06, 1 - bump * 0.08, 1 + bump * 0.06);
    // Покупатель: дыхание, моргание, походка, радость
    const who = this.who;
    if (who) {
      const happy = clamp(1 - (t - (this.happy || -9)) / 1.2, 0, 1);
      who.root.position.y =
        motion * (this.walking ? Math.abs(Math.sin(t * 11)) * 0.12 : 0.015 * Math.sin(t * 2.6)) +
        motion * Math.abs(Math.sin(happy * pie * 3)) * 0.25 * happy;
      who.head.rotation.z = motion * 0.05 * Math.sin(t * 1.6);
      who.eyes.scale.y = motion && t % 4.1 > 3.95 ? 0.15 : 1;
      who.tail.rotation.z = motion * Math.sin(t * (happy || this.walking ? 14 : 3)) * (happy ? 0.3 : 0.08);
    }
    // Подсказка: кольцо мягко пульсирует
    const spot = this.hintSpot();
    this.ring.visible = !!spot;
    if (spot) {
      this.ring.position.set(spot.x, 1.1, spot.z);
      this.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 5) * motion);
      this.ring.material.opacity = 0.6 + 0.3 * Math.sin(t * 5);
    }
    // Сердечки над покупателем
    const love = t - this.heartsAt;
    this.hearts.visible = !!motion && !!who && love >= 0 && love < 2;
    if (this.hearts.visible)
      this.hearts.children.forEach((h, i) => {
        const p = clamp((love - i * 0.1) / 1.3, 0, 1),
          a = i * 2.39;
        h.visible = p > 0 && p < 1;
        h.position.set(who.root.position.x + Math.sin(a) * (0.3 + 0.8 * p), 2.9 + p * 1.6, who.root.position.z + 0.6);
        h.scale.setScalar(0.28 * Math.sin((Math.min(p * 5, 1) * pie) / 2) * (1 - p ** 4));
        h.rotation.z = Math.sin(p * 6 + i) * 0.3;
      });
    // Конфетти в конце смены
    const age = t - this.confettiAt;
    this.confetti.visible = !!motion && age >= 0 && age < 2.8;
    if (this.confetti.visible) {
      const fade = clamp((2.8 - age) / 0.5, 0, 1),
        drag = 1 - age * 0.17;
      this.flight.forEach((f, i) => {
        const y = 2.6 + f.v.y * age - 3.6 * age * age,
          landed = y < 0.03;
        this.dummy.position.set(0.4 + f.v.x * age * drag + Math.sin(age * 3 + f.drift) * 0.15, landed ? 0.03 : y, 0.2 + f.v.z * age * drag);
        if (landed) this.dummy.rotation.set(-pie / 2, 0, f.drift);
        else this.dummy.rotation.set(f.spin.x * age, f.spin.y * age, f.spin.z * age);
        this.dummy.scale.setScalar(fade);
        this.dummy.updateMatrix();
        this.confetti.setMatrixAt(i, this.dummy.matrix);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
    }
    // Покупатель следит глазами за товаром, который кассир несёт к сканеру
    if (who) {
      const it = this.drag?.it;
      const yaw = it ? clamp((it.mesh.position.x - who.root.position.x) * 0.22, -0.5, 0.5) : 0;
      this.lookYaw = (this.lookYaw || 0) + (yaw - (this.lookYaw || 0)) * clamp(dt * 6, 0, 1);
      who.head.rotation.y = this.lookYaw * motion;
      who.head.rotation.x = Math.abs(this.lookYaw) * 0.3 * motion;
    }
    // Уют: в свете ламп плавают золотые пылинки, по лавке порхает бабочка
    if (!this.motes) {
      const n = 46,
        pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 12, 0.6 + Math.random() * 4, -2 + Math.random() * 3.6], i * 3);
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      this.motes = new T.Points(geo, new T.PointsMaterial({ color: "#ffe9a8", size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
      this.motes.userData.base = pos.slice();
      this.scene.add(this.motes);
      const fly = new T.Group();
      const wingGeo = new T.PlaneGeometry(0.2, 0.26);
      wingGeo.translate(0.1, 0, 0);
      const wingMat = new T.MeshBasicMaterial({ color: "#ff8fc7", side: T.DoubleSide });
      const wings = [1, -1].map((sd) => {
        const w = new T.Mesh(wingGeo, wingMat);
        w.rotation.x = -pie / 2;
        const hinge = new T.Group();
        hinge.scale.x = sd;
        hinge.add(w);
        fly.add(hinge);
        return hinge;
      });
      const body = new T.Mesh(new T.CapsuleGeometry(0.025, 0.16, 4, 8), new T.MeshBasicMaterial({ color: "#5b4a3c" }));
      body.rotation.x = pie / 2;
      fly.add(body);
      fly.scale.setScalar(0.75);
      this.scene.add(fly);
      this.butterfly = { g: fly, wings };
    }
    this.motes.visible = this.butterfly.g.visible = !!motion;
    if (motion) {
      const mp = this.motes.geometry.attributes.position,
        base = this.motes.userData.base;
      for (let i = 0; i < mp.count; i++) {
        mp.setX(i, base[i * 3] + Math.sin(t * 0.23 + i) * 0.35);
        mp.setY(i, 0.6 + ((base[i * 3 + 1] + t * (0.05 + (i % 5) * 0.012)) % 4));
      }
      mp.needsUpdate = true;
      this.motes.material.opacity = 0.4 + 0.15 * Math.sin(t * 0.9);
      const bf = this.butterfly,
        a = t * 0.45;
      const at = (q) => bf.g.position.set(Math.sin(q) * 5.2, 3.7 + Math.sin(q * 2.3) * 0.45 + Math.sin(t * 7) * 0.05, -1.5 + Math.cos(q * 1.7) * 0.5);
      at(a + 0.02);
      const ahead = bf.g.position.clone();
      at(a);
      bf.g.lookAt(ahead);
      const flap = Math.sin(t * 16) * 0.9;
      bf.wings[0].rotation.z = flap;
      bf.wings[1].rotation.z = -flap;
    }
    if (!force) this.aimCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
