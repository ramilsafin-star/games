// Сцена: связывает правила игры с графикой. Сама ничего не решает, только показывает.
import * as T from '../vendor/three/three.module.min.js';
import { BONUS_ROWS, HERO_Z, WEAPONS } from './game.js';
import { BEND_GLSL, damp, group } from './3d/kit.js';
import { World } from './3d/world.js';
import { Hero } from './3d/hero.js';
import { MonsterView, CHUNK_COLORS } from './3d/monsters.js';
import { CageView, ColumnView, FinishView, ChestView, PickupView } from './3d/cage.js';
import { makeGun } from './3d/guns.js';
import { FX } from './3d/fx.js';
import { Post } from './3d/post.js';

const SHOT_Y = 1.42;
const FRAME_LIMIT = 27;
const STEEL = [0xc5ccdb, 0x8f98ad, 0xffb21f];

// Энергощит: прозрачный в центре, светится по краю
function bubbleMaterial() {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { uColor: { value: new T.Color(0x70ffef) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mvPosition.xyz);
        ${BEND_GLSL}
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        gl_FragColor = vec4(uColor * (0.1 + rim * 1.9), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class View {
  constructor(container, game) {
    this.container = container;
    this.game = game;
    this.clock = 0;
    this.shake = 0;
    this.flashSky = 0;
    this.entities = new Map();
    this.pools = new Map();
    this.sequence = [];
    this.bossAt = { x: 0, z: -17 };
    this.quality = 2;
    this.lockQuality = false;
    this.frames = 0;
    this.frameTotal = 0;
    this.rocketTrail = 0;

    this.renderer = new T.WebGLRenderer({ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Трёхмерная дорога Monster Rush');
    this.post = new Post(this.renderer);

    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(48, 1, 0.1, 620);
    this.camera.position.set(-1.4, 1.6, HERO_Z + 4.6);
    this.look = new T.Vector3(-1.4, 1.2, HERO_Z);
    this.world = new World(this.scene, this.renderer);
    this.fx = new FX(this.scene);

    this.hero = new Hero();
    this.hero.root.position.set(0, 0, HERO_Z);
    this.scene.add(this.hero.root);
    this.bubble = new T.Mesh(new T.SphereGeometry(1.42, 28, 18), bubbleMaterial());
    this.bubble.position.y = 1.05;
    this.hero.root.add(this.bubble);
    this.bubble.visible = false;

    this.finish = new FinishView();
    this.finish.root.visible = false;
    this.scene.add(this.finish.root);
    this.chest = new ChestView();
    this.chest.root.visible = false;
    this.scene.add(this.chest.root);

    this.muzzleAt = new T.Vector3();
    this.beamTo = new T.Vector3();
    this.makeDemo();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.compile();
    // Остальное считаем по частям уже на заставке: в бою рывков не будет, а экран загрузки не замрёт
    setTimeout(() => this.world.assets(1), 300);
    setTimeout(() => this.world.assets(2), 700);
    setTimeout(() => this.prewarm(), 1100);
  }

  // Шейдеры компилируются заранее: иначе первый выстрел и первый взрыв дали бы заметный рывок
  compile() {
    if (this.post.enabled && this.post.hdr) this.renderer.setRenderTarget(this.post.hdr);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  // Заранее собирает модели всех монстров и пушек
  prewarm() {
    for (let level = 0; level < 3; level++) {
      for (const type of ['grunt', 'spitter', 'brute', 'barrel', 'boss']) {
        const key = `${type}:${level}`;
        const view = new MonsterView(type, level);
        view.key = key;
        view.root.visible = false;
        this.pools.set(key, [view]);
      }
    }
    for (const weapon of Object.keys(WEAPONS)) makeGun(weapon);
    BONUS_ROWS.forEach((_, row) => {
      const key = `column:${row}`;
      const view = new ColumnView(row);
      view.key = key;
      this.pools.set(key, [view]);
    });
  }

  // Заставка: за спиной героя видно, что его ждёт
  makeDemo() {
    this.demo = group(this.scene);
    this.demoItems = [];
    const place = (view, item) => {
      view.root.position.set(item.x, 0, item.z);
      this.demo.add(view.root);
      this.demoItems.push({ view, item });
    };
    place(new CageView('minigun'), { id: 1, x: 0.15, z: -6.5, hp: 24, maxHp: 24, age: 1, hit: 0, shot: 3 });
    place(new MonsterView('grunt', 0), { id: 2, x: -3.2, z: -11, age: 0, hit: 0, shot: 3 });
    place(new MonsterView('spitter', 0), { id: 3, x: 3.2, z: -15, age: 0, hit: 0, shot: 3 });
    place(new MonsterView('brute', 0), { id: 4, x: -0.6, z: -24, age: 0, hit: 0, shot: 3 });
    for (const { view } of this.demoItems) view.root.scale.setScalar(view.scale ?? 1);
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    const q = this.quality;
    const cap = [1, 1.5, 2][q];
    const budget = [1.2e6, 2.1e6, 3.2e6][q];
    const pr = Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(budget / (width * height)));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height, false);
    this.post.setSize(Math.round(width * pr), Math.round(height * pr), [0, 2, 4][q], q >= 2 ? 4 : 3);
    const aspect = width / height;
    this.aspect = aspect;
    const demoCage = this.demoItems[0];
    demoCage.item.x = aspect < 1 ? 2.35 : 0.15;
    demoCage.view.root.position.set(demoCage.item.x, 0, aspect < 1 ? -9 : -6.5);
    this.demoItems[1].view.root.position.x = aspect < 1 ? -2.4 : -3.2;
    this.demoItems[2].view.root.position.x = aspect < 1 ? -0.4 : 3.2;
    this.playFov = aspect < 0.7 ? 60 : aspect < 1.1 ? 54 : 48;
    const halfWidth = aspect < 1 ? 4 : 5.2;
    const tan = Math.tan(T.MathUtils.degToRad(this.playFov / 2));
    this.camDist = T.MathUtils.clamp(halfWidth / (tan * aspect), 9.2, 22);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.fx.setScale(height * pr, this.camera.fov);
    const size = [1024, 1536, 2048][q];
    const shadow = this.world.sun.shadow;
    if (shadow.mapSize.x !== size) {
      shadow.mapSize.set(size, size);
      if (shadow.map) {
        shadow.map.dispose();
        shadow.map = null;
      }
    }
  }

  // Если устройство не успевает, упрощаем картинку, а не тормозим игру
  adapt(ms) {
    if (ms > 200 || this.lockQuality) return;
    this.frameTotal += ms;
    this.frames++;
    if (this.frames < 60) return;
    if (this.frameTotal / this.frames > FRAME_LIMIT && this.quality > 0) {
      this.quality--;
      this.resize();
    }
    this.frames = 0;
    this.frameTotal = 0;
  }

  setWorld(level) {
    this.world.setWorld(level);
  }

  acquire(key, make) {
    const pool = this.pools.get(key);
    const view = pool?.length ? pool.pop() : make();
    view.key = key;
    view.reset?.();
    view.root.visible = true;
    this.scene.add(view.root);
    return view;
  }

  release(view) {
    view.root.visible = false;
    this.scene.remove(view.root);
    if (!this.pools.has(view.key)) this.pools.set(view.key, []);
    this.pools.get(view.key).push(view);
  }

  event(e) {
    const fx = this.fx;
    const game = this.game;
    switch (e.type) {
      case 'start':
      case 'stage':
        this.setWorld(game.level);
        this.hero.setGun(game.weapon);
        this.sequence = [];
        fx.chunks.length = 0;
        fx.glow.items.length = 0;
        fx.smoke.items.length = 0;
        fx.setBeam(null);
        break;
      case 'shot':
        this.onShot(e.weapon);
        break;
      case 'hit':
        this.onHit(e);
        break;
      case 'explode':
        this.onExplode(e);
        break;
      case 'blast':
        fx.explosion(e.x, 1.1, e.z, WEAPONS.rocket.color, e.radius / 3.4);
        this.shake = Math.max(this.shake, 0.22);
        break;
      case 'arc':
        fx.arc(e.points.map((p, i) => ({ x: p.x, z: p.z, y: i ? 1.3 : SHOT_Y })), 1.3, WEAPONS.tesla.color);
        for (const p of e.points.slice(1)) fx.spark(p.x, 1.3, p.z, WEAPONS.tesla.color, 3, 5, 0.18, 0.28);
        break;
      case 'cageCrack':
        this.onCageCrack(e);
        break;
      case 'cageBreak':
        this.onCageBreak(e, WEAPONS[e.weapon].color);
        break;
      case 'cageSmash':
        this.onCageBreak(e, 0xffb21f);
        break;
      case 'weapon': {
        this.hero.setGun(e.weapon, true);
        const color = WEAPONS[e.weapon].color;
        fx.ring(game.x, HERO_Z, color, 5, 0.5);
        fx.ring(game.x, HERO_Z, 0xffffff, 3, 0.35);
        fx.spark(game.x, 1.3, HERO_Z, color, 26, 7, 0.3, 0.6);
        fx.flash(game.x, 1.3, HERO_Z, color, 2.4, 0.16, 1.5, 0);
        fx.lamp(game.x, 2, HERO_Z, color, 70);
        this.shake = Math.max(this.shake, 0.14);
        break;
      }
      case 'weaponOut':
        this.hero.setGun('blaster');
        this.hero.pop = 0.3;
        fx.puff(game.x, 1.4, HERO_Z - 0.5, 0xb9b4c9, 4, 0.7, 0.55, 0.45);
        break;
      case 'pickup':
        if (e.pickupType !== 'weapon') {
          const color = { heal: 0xff4d7a, shield: 0x4df0e0, gem: 0x62d6ff }[e.pickupType];
          fx.spark(e.x, 1.2, e.z, color, 12, 4.5, 0.22, 0.42);
          fx.ring(game.x, HERO_Z, color, 2.4, 0.3);
        }
        break;
      case 'drop':
        fx.ring(e.x, e.z, 0xffffff, 1.6, 0.26);
        fx.puff(e.x, 0.2, e.z, this.world.palette.ground[0], 4, 0.5, 0.5, 0.5);
        break;
      case 'hurt':
        this.hero.hurt();
        this.shake = Math.max(this.shake, 0.48);
        fx.spark(game.x, 1.3, HERO_Z, 0xff4d5e, 12, 6, 0.24, 0.42);
        break;
      case 'shield':
        fx.ring(game.x, HERO_Z, 0x70ffef, 3, 0.35);
        fx.spark(game.x, 1.2, HERO_Z, 0x70ffef, 12, 6, 0.24, 0.42);
        this.shake = Math.max(this.shake, 0.18);
        break;
      case 'nova':
        fx.ring(e.x, e.z, 0x7ffff1, 26, 0.75);
        fx.ring(e.x, e.z, 0xffffff, 14, 0.5);
        fx.flash(e.x, 1.4, e.z, 0xbffff5, 9, 0.3, 2.2, 0);
        fx.spark(e.x, 1, e.z, 0x8cfff1, 60, 16, 0.32, 0.8);
        fx.lamp(e.x, 3, e.z, 0x8cfff1, 150);
        this.shake = 0.65;
        break;
      case 'bossShot':
        fx.flash(this.bossAt.x, 3.4, this.bossAt.z + 2, 0xff4030, 5, 0.22, 2.6, 0);
        break;
      case 'bossDown':
        this.bossDown();
        break;
      case 'columnBreak': {
        const colors = [0x8c95b8, 0x7380a4, 0xffc531];
        fx.burst(e.x, 1, e.z, colors, 10, 6.5, 0.3);
        fx.spark(e.x, 2.2, e.z, 0x62d6ff, 16, 6, 0.26, 0.5);
        fx.flash(e.x, 1.4, e.z, 0xffffff, 2.8, 0.14, 2.4, 0);
        fx.puff(e.x, 0.6, e.z, 0xb4bcd6, 4, 0.9, 0.6, 0.5);
        this.shake = Math.max(this.shake, 0.1);
        break;
      }
      case 'chest':
        fx.ring(0, e.z, 0xffd24a, 9, 0.7);
        fx.flash(0, 3, e.z, 0xffe08a, 8, 0.4, 2.4, 0);
        fx.spark(0, 2.6, e.z, 0xffd24a, 70, 13, 0.32, 1.1, 3);
        fx.spark(0, 2.6, e.z, 0x62d6ff, 40, 11, 0.3, 1.1, 3);
        fx.lamp(0, 4, e.z + 2, 0xffd24a, 120);
        this.shake = Math.max(this.shake, 0.22);
        break;
      default:
        break;
    }
  }

  onShot(weapon) {
    const fx = this.fx;
    const color = WEAPONS[weapon].color;
    const m = this.muzzleAt;
    this.hero.fire();
    if (weapon === 'laser') return;
    const size = { spread: 1.6, minigun: 0.8, rocket: 1.9, plasma: 1.5, tesla: 1.2 }[weapon] ?? 1;
    fx.flash(m.x, m.y, m.z - 0.1, 0xffffff, size * 0.34, 0.05, 2.8);
    fx.flash(m.x, m.y, m.z - 0.1, color, size * 0.62, 0.08, 2.3);
    fx.lamp(m.x, m.y + 0.4, m.z - 0.4, color, weapon === 'minigun' ? 16 : 26);
    if (weapon === 'rocket') {
      fx.puff(m.x, m.y, m.z + 1.6, 0xd8d3e0, 5, 0.8, 0.6, 0.55);
      this.shake = Math.max(this.shake, 0.1);
    }
    if (weapon === 'spread') {
      fx.spark(m.x, m.y, m.z, 0xffc97a, 4, 5, 0.16, 0.2);
      this.shake = Math.max(this.shake, 0.08);
    }
    if (weapon === 'minigun') fx.spark(m.x + 0.1, m.y, m.z + 0.9, 0xffd27a, 1, 3, 0.12, 0.26);
  }

  onHit(e) {
    const fx = this.fx;
    const color = WEAPONS[this.game.weapon].color;
    if (e.enemyType === 'cage') {
      fx.spark(e.x + (Math.random() - 0.5) * 1.3, 0.6 + Math.random() * 1.6, e.z + 1, 0xfff0c0, 5, 6.5, 0.2, 0.32);
      fx.lamp(e.x, 1.4, e.z + 1.6, 0xffe9b0, 10);
    } else if (e.enemyType === 'column') {
      fx.spark(e.x, 1.1, e.z + 0.9, 0xd9deef, 4, 5, 0.18, 0.3);
    } else {
      fx.spark(e.x + (Math.random() - 0.5) * 0.5, 1.1 + Math.random() * 0.7, e.z + 0.5, color, 4, 5, 0.2, 0.3);
    }
  }

  onExplode(e) {
    const fx = this.fx;
    const level = this.game.level;
    if (e.enemyType === 'boss') return;
    const colors = CHUNK_COLORS[e.enemyType](level);
    const big = e.enemyType === 'brute';
    if (e.enemyType === 'barrel') {
      fx.explosion(e.x, 0.8, e.z, 0xff8a2a, 1.5);
      fx.burst(e.x, 0.8, e.z, colors, 14, 9, 0.3);
      this.shake = Math.max(this.shake, 0.3);
      return;
    }
    fx.flash(e.x, 1, e.z, 0xffffff, big ? 3.2 : 2.2, 0.12, 3, 1);
    fx.flash(e.x, 1, e.z, colors[0], big ? 5 : 3.4, 0.22, 2, 1);
    fx.burst(e.x, 1, e.z, colors, big ? 20 : 12, big ? 8.5 : 7.5, big ? 0.32 : 0.24);
    fx.spark(e.x, 1, e.z, colors[1], big ? 20 : 12, 7.5, 0.24, 0.5);
    fx.spark(e.x, 1.2, e.z, 0xffe14d, 7, 6, 0.22, 0.55);
    fx.puff(e.x, 0.6, e.z, colors[0], big ? 6 : 4, big ? 1.3 : 1, 0.6, 0.42);
    fx.ring(e.x, e.z, colors[0], big ? 3.4 : 2.3, 0.32);
    fx.lamp(e.x, 1.5, e.z + 1, colors[0], big ? 44 : 26);
    this.shake = Math.max(this.shake, big ? 0.2 : 0.09);
  }

  onCageCrack(e) {
    const entry = this.entities.get(e.id);
    if (!entry) return;
    const fx = this.fx;
    for (const p of entry.view.crack(e.stage)) {
      fx.burst(e.x + p.x, p.y, e.z + p.z, [0xc5ccdb], 1, 6.5, 0, [0.09, 1.2, 0.09]);
      fx.spark(e.x + p.x, 1.2, e.z + p.z, 0xfff0c0, 4, 6, 0.2, 0.35);
    }
    fx.flash(e.x, 1.4, e.z + 1.1, 0xffffff, 2.8, 0.1, 2.6, 1);
    fx.puff(e.x, 1.2, e.z + 1, 0x8a8798, 4, 0.8, 0.7, 0.42);
    fx.lamp(e.x, 2, e.z + 2, 0xfff0c0, 40);
    this.shake = Math.max(this.shake, 0.14);
  }

  onCageBreak(e, color) {
    const fx = this.fx;
    fx.burst(e.x, 1.2, e.z, [0xc5ccdb, 0xdfe4ee], 12, 10.5, 0, [0.09, 1.3, 0.09]);
    fx.burst(e.x, 1.2, e.z, STEEL, 12, 9, 0.3);
    fx.burst(e.x, 0.5, e.z, [0xffb21f, 0x3a3550, 0xffc531], 12, 8, 0, [0.6, 0.14, 0.2]);
    fx.flash(e.x, 1.5, e.z, 0xffffff, 6, 0.16, 3.2, 1);
    fx.flash(e.x, 1.5, e.z, color, 9, 0.32, 2, 1);
    fx.spark(e.x, 1.4, e.z, color, 34, 11, 0.32, 0.75);
    fx.spark(e.x, 1.4, e.z, 0xffe9b0, 18, 9, 0.24, 0.5);
    fx.puff(e.x, 0.8, e.z, 0x8a8798, 8, 1.4, 0.95, 0.5);
    fx.ring(e.x, e.z, color, 6.5, 0.5);
    fx.ring(e.x, e.z, 0xffffff, 3.6, 0.3);
    fx.lamp(e.x, 2.4, e.z + 1, color, 130);
    this.shake = Math.max(this.shake, 0.36);
  }

  // Босс падает не сразу: серия взрывов, потом большой финальный
  bossDown() {
    const { x, z } = this.bossAt;
    const level = this.game.level;
    const colors = CHUNK_COLORS.boss(level);
    const fx = this.fx;
    for (let i = 0; i < 7; i++) {
      this.sequence.push({
        at: this.clock + i * 0.14,
        run: () => {
          const px = x + (Math.random() - 0.5) * 5;
          const py = 1 + Math.random() * 5;
          fx.explosion(px, py, z + (Math.random() - 0.5) * 2, colors[i % colors.length], 1.5);
          fx.burst(px, py, z, colors, 10, 10, 0.42);
          this.shake = Math.max(this.shake, 0.4);
        },
      });
    }
    this.sequence.push({
      at: this.clock + 1,
      run: () => {
        fx.explosion(x, 3, z, 0xffffff, 4);
        fx.burst(x, 3, z, colors, 40, 16, 0.55);
        fx.spark(x, 3, z, 0xffd24a, 80, 20, 0.4, 1.1, 3);
        fx.ring(x, z, 0xffffff, 26, 0.7);
        this.flashSky = 0.8;
        this.shake = 0.9;
      },
    });
  }

  syncEnemies(dt, seen, time) {
    const game = this.game;
    const fx = this.fx;
    for (const e of game.enemies) {
      seen.add(e.id);
      let entry = this.entities.get(e.id);
      if (!entry) {
        const level = game.level;
        let view;
        if (e.type === 'cage') view = this.acquire(`cage:${e.weapon}`, () => new CageView(e.weapon));
        else if (e.type === 'column') view = this.acquire(`column:${e.row}`, () => new ColumnView(e.row));
        else view = this.acquire(`${e.type}:${level}`, () => new MonsterView(e.type, level));
        entry = { view, item: e };
        this.entities.set(e.id, entry);
      }
      const v = entry.view;
      v.root.position.set(e.x, 0, e.z);
      if (e.type === 'cage') {
        if (v.update(dt, e, time, this.camera)) {
          fx.ring(e.x, e.z, 0xffffff, 3.6, 0.35);
          fx.puff(e.x, 0.2, e.z, this.world.palette.ground[0], 8, 1.1, 0.7, 0.6);
          this.shake = Math.max(this.shake, 0.3);
        }
        if (e.stage >= 1 && Math.random() < dt * (e.stage === 2 ? 11 : 4)) fx.spark(e.x + (Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.5, e.z + 1, 0xfff0c0, 1, 4, 0.16, 0.3);
        if (e.stage === 2 && Math.random() < dt * 5) fx.puff(e.x, 2.4, e.z, 0x6f6c7e, 1, 0.7, 0.8, 0.38);
      } else if (e.type === 'column') {
        v.update(dt, e, time);
      } else {
        v.update(dt, e);
        if (e.type === 'boss') {
          this.bossAt.x = e.x;
          this.bossAt.z = e.z;
          if (game.level === 2 && Math.random() < dt * 22) fx.fire(e.x + (Math.random() - 0.5) * 2.3, 6.5, e.z + 0.4, 0.8, 1);
        }
      }
    }
  }

  syncPickups(dt, seen, time) {
    for (const p of this.game.pickups) {
      seen.add(p.id);
      let entry = this.entities.get(p.id);
      if (!entry) {
        const key = p.type === 'weapon' ? `pick:${p.weapon}` : `pick:${p.type}`;
        entry = { view: this.acquire(key, () => new PickupView(p.type, p.weapon)), item: p };
        this.entities.set(p.id, entry);
      }
      entry.view.update(dt, p, time);
    }
  }

  drawShots(dt) {
    const game = this.game;
    const fx = this.fx;
    this.rocketTrail += dt;
    const trail = this.rocketTrail > 0.03;
    if (trail) this.rocketTrail = 0;
    for (const b of game.bullets) {
      const color = WEAPONS[b.type].color;
      if (b.type === 'rocket') {
        fx.rocket(b.x, SHOT_Y, b.z, b.vx, b.vz);
        if (trail) {
          fx.fire(b.x, SHOT_Y, b.z + 0.62, 0.16, 1, 0xff8a2a);
          fx.puff(b.x, SHOT_Y, b.z + 0.8, 0xc9c5d2, 1, 0.42, 0.42, 0.4);
        }
      } else if (b.type === 'plasma') {
        const wobble = 1 + Math.sin(this.clock * 30 + b.id) * 0.12;
        fx.orb(b.x, SHOT_Y, b.z, b.radius * 0.72 * wobble, color, 2.4);
        fx.orb(b.x, SHOT_Y, b.z, b.radius * 0.42, 0xffffff, 3);
        if (trail) fx.flash(b.x, SHOT_Y, b.z + 0.4, color, 1.1, 0.16, 1.8, 0);
      } else {
        const long = b.type === 'minigun' ? 2.6 : b.type === 'spread' ? 1.4 : 3.2;
        const wide = b.type === 'minigun' ? 0.1 : b.type === 'spread' ? 0.15 : 0.13;
        fx.bolt(b.x, SHOT_Y, b.z, b.vx, 0, b.vz, long, wide * 1.9, color, 1.5);
        fx.bolt(b.x, SHOT_Y, b.z, b.vx, 0, b.vz, long * 0.85, wide * 0.8, 0xffffff, 2.9);
      }
    }
    for (const h of game.hazards) {
      fx.orb(h.x, 1.25, h.z, h.radius * 1.15, 0xff2f4a, 2);
      fx.orb(h.x, 1.25, h.z, h.radius * 0.62, 0xffe08a, 3.1);
      if (trail) fx.flash(h.x, 1.25, h.z - 0.3, 0xff5a3c, 0.9, 0.16, 1.5, 0);
    }
    if (game.beamOn && game.mode === 'playing') {
      this.beamTo.set(this.muzzleAt.x, this.muzzleAt.y - 0.06, -55);
      fx.setBeam(this.muzzleAt, this.beamTo, WEAPONS.laser.color, 0.2);
      fx.flash(this.muzzleAt.x, this.muzzleAt.y, this.muzzleAt.z - 0.1, WEAPONS.laser.color, 0.7, 0.04, 2);
      fx.lamp(this.muzzleAt.x, this.muzzleAt.y + 0.3, this.muzzleAt.z - 1, WEAPONS.laser.color, 22);
    } else {
      fx.setBeam(null);
    }
  }

  updateBonus(dt) {
    const game = this.game;
    this.finish.root.visible = Boolean(game.finish);
    if (game.finish) this.finish.root.position.z = game.finish.z;
    this.chest.root.visible = Boolean(game.chest);
    if (game.chest) {
      if (this.chestId !== game.chest.id) {
        this.chestId = game.chest.id;
        this.chest.reset();
      }
      this.chest.root.position.z = game.chest.z;
      this.chest.update(dt, game.chest);
    }
  }

  updateCamera(dt) {
    const game = this.game;
    const mode = game.mode;
    const p = (this.wantPos ||= new T.Vector3());
    const l = (this.wantLook ||= new T.Vector3());
    let fov = this.playFov;
    let speed = 3.4;
    const wide = this.aspect >= 1;
    if (mode === 'menu') {
      fov = 40;
      if (wide) {
        p.set(-1.5, 1.45, HERO_Z + 4.4);
        l.set(-1.5, 1.22, HERO_Z);
      } else {
        p.set(0, 1.25, HERO_Z + 7.8);
        l.set(0, 0.62, HERO_Z);
      }
    } else if (mode === 'clear' || mode === 'upgrade' || mode === 'victory') {
      fov = 40;
      speed = 2.8;
      p.set(game.x + 0.7, 1.55, HERO_Z + 5.4);
      l.set(game.x * 0.92, 1.28, HERO_Z);
    } else if (mode === 'gameover') {
      fov = 44;
      speed = 2.2;
      p.set(game.x + 1.1, 5.2, HERO_Z + 5.8);
      l.set(game.x, 0.45, HERO_Z);
    } else {
      const d = this.camDist;
      const h = d * 0.68;
      p.set(game.x * 0.55, h, HERO_Z + d * 0.92);
      l.set(game.x * 0.5, 0.75, HERO_Z - d * 0.9);
      speed = 3.6;
      // После остановки на финише чуть приближаемся
      if (game.phase === 'bonus' && game.bonusState !== 'wait') {
        p.y = h * 0.92;
        p.z = HERO_Z + d * 0.86;
      }
    }
    this.camera.position.lerp(p, 1 - Math.exp(-speed * dt));
    this.look.lerp(l, 1 - Math.exp(-speed * 1.1 * dt));
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, fov, speed, dt);
      this.camera.updateProjectionMatrix();
      this.fx.setScale(this.renderer.getDrawingBufferSize(new T.Vector2()).y, this.camera.fov);
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const s = this.shake * this.shake * 0.34;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.2 : 1;
    this.camera.position.x += (Math.random() - 0.5) * s * calm;
    this.camera.position.y += (Math.random() - 0.5) * s * calm;
    this.camera.lookAt(this.look);
  }

  update(dt, ms = 16) {
    this.adapt(ms);
    const game = this.game;
    const mode = game.mode;
    const frozen = mode === 'paused';
    const vdt = frozen ? 0 : game.slowTime > 0 ? dt * 0.3 : dt;
    this.clock += vdt;
    const time = this.clock;
    const menu = mode === 'menu';
    const carry = mode === 'playing' ? game.speed : 0;

    while (this.sequence.length && this.sequence[0].at <= this.clock) this.sequence.shift().run();

    // Герой
    const pose = menu ? 'idle' : mode === 'gameover' ? 'down' : mode === 'clear' || mode === 'upgrade' || mode === 'victory' ? 'win' : 'run';
    const hero = this.hero;
    hero.root.position.x = menu ? 0 : game.x;
    hero.setGun(game.weapon);
    hero.spinning = game.weapon === 'minigun' && mode === 'playing';
    hero.update(vdt, { speed: mode === 'playing' ? game.speed : 0, lateral: mode === 'playing' ? game.vx : 0, pose });
    hero.root.visible = game.invincible <= 0 || mode !== 'playing' || game.phase === 'bonus' || Math.floor(time * 16) % 2 === 0;
    this.bubble.visible = game.shield > 0 && mode === 'playing';
    hero.root.updateMatrixWorld(true);
    hero.muzzle.getWorldPosition(this.muzzleAt);
    for (const side of hero.stepEvents) {
      this.fx.puff(game.x + side * 0.12, 0.06, HERO_Z + 0.1, 0xe6dcf0, 1, 0.22, 0.34, 0.26);
    }
    hero.stepEvents.length = 0;

    // Заставка
    this.demo.visible = menu;
    if (menu) {
      for (const { view, item } of this.demoItems) {
        item.age += vdt;
        if (view instanceof CageView) view.update(vdt, item, time, this.camera);
        else view.update(vdt * 0.32, item);
      }
    }

    // Объекты игры
    const seen = new Set();
    if (!menu) {
      this.syncEnemies(vdt, seen, time);
      this.syncPickups(vdt, seen, time);
      this.drawShots(vdt);
    }
    for (const [id, entry] of this.entities) {
      if (!seen.has(id)) {
        this.release(entry.view);
        this.entities.delete(id);
      }
    }
    this.updateBonus(vdt);

    this.fx.update(vdt, carry);
    this.world.update(vdt, game.scroll, this.camera, time);
    this.updateCamera(dt);
    // Большая вспышка неба при гибели босса
    this.flashSky = Math.max(0, this.flashSky - dt * 2.2);
    if (this.post.enabled && this.quality > 0) {
      this.post.final.uniforms.uExposure.value = 1 + this.flashSky * 1.2;
      this.post.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
