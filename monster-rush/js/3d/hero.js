// Герой: человек с нормальными пропорциями, лицом и одеждой. Руки держат оружие через обратную кинематику,
// поэтому кисти всегда на рукояти и цевье, какой бы ни была пушка и что бы ни делало тело.
import * as T from '../../vendor/three/three.module.min.js?v=4d3622b6';
import { Kit, group, part, toyMaterial, damp } from './kit.js?v=4d3622b6';
import { makeGun, GUN_POSE } from './guns.js?v=4d3622b6';

const COL = {
  skin: 0xf4b98f,
  skinShade: 0xdf9b72,
  lip: 0xb5534a,
  hair: 0x3c2415,
  hairLight: 0x4b2d1a,
  jacket: 0xe8362f,
  jacketDark: 0xb3201f,
  white: 0xf8f5ec,
  zip: 0xffc531,
  jeans: 0x2c68d6,
  jeansDark: 0x1e4da8,
  jeansLight: 0x5a93ee,
  belt: 0x2a2230,
  sole: 0xff7a1a,
  accent: 0x18b6cc,
  iris: 0x3b6fa8,
  dark: 0x1c1a26,
};
const UPPER = 0.36;
const FORE = 0.31;
const SHOULDER_L = new T.Vector3(-0.205, 0.368, 0.005);
const SHOULDER_R = new T.Vector3(0.205, 0.368, 0.005);
const GUN_SCALE = 0.9;
const DOWN = new T.Vector3(0, -1, 0);
// Правая ладонь обхватывает рукоять спереди, левая поддерживает цевьё снизу
const GRIP_RIGHT = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
const GRIP_LEFT = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI);

function starGeometry(r) {
  const shape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const k = i % 2 ? r * 0.44 : r;
    if (i) shape.lineTo(Math.cos(a) * k, Math.sin(a) * k);
    else shape.moveTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  return new T.ShapeGeometry(shape);
}

function buildPelvis() {
  const k = new Kit();
  k.loft(COL.jeans, [
    { y: -0.125, rx: 0.07, rz: 0.08 },
    { y: -0.085, rx: 0.15, rz: 0.105, p: 2.3 },
    { y: -0.02, rx: 0.186, rz: 0.12, p: 2.4 },
    { y: 0.06, rx: 0.186, rz: 0.122, p: 2.4 },
    { y: 0.13, rx: 0.168, rz: 0.116, p: 2.4 },
  ]);
  k.loft(COL.belt, [
    { y: 0.08, rx: 0.183, rz: 0.128, p: 2.4 },
    { y: 0.125, rx: 0.178, rz: 0.124, p: 2.4 },
  ]);
  // Задние карманы видны всё время: камера идёт сзади
  for (const s of [-1, 1]) k.box(COL.jeansDark, s * 0.092, -0.02, 0.129, 0.115, 0.115, 0.02);
  for (const s of [-1, 1]) k.box(COL.zip, s * 0.092, 0.03, 0.14, 0.098, 0.012, 0.006);
  return k.build();
}

function buildChest() {
  const k = new Kit();
  // Куртка: широкая грудь, узкая талия, низ чуть шире
  k.loft(COL.jacket, [
    { y: -0.085, rx: 0.2, rz: 0.142, p: 2.5 },
    { y: -0.02, rx: 0.186, rz: 0.13, p: 2.5 },
    { y: 0.08, rx: 0.178, rz: 0.124, p: 2.5 },
    { y: 0.2, rx: 0.206, rz: 0.138, p: 2.6 },
    { y: 0.31, rx: 0.232, rz: 0.15, p: 2.6 },
    { y: 0.385, rx: 0.218, rz: 0.134, p: 2.6 },
    { y: 0.43, rx: 0.15, rz: 0.104 },
    { y: 0.47, rx: 0.074, rz: 0.076 },
  ], { seg: 16 });
  // Манжета по низу куртки
  k.loft(COL.jacketDark, [
    { y: -0.105, rx: 0.205, rz: 0.146, p: 2.5 },
    { y: -0.05, rx: 0.2, rz: 0.142, p: 2.5 },
  ], { seg: 16 });
  // Белая полоса через спину и грудь
  k.loft(COL.white, [
    { y: 0.215, rx: 0.212, rz: 0.143, p: 2.6 },
    { y: 0.262, rx: 0.227, rz: 0.15, p: 2.6 },
  ], { seg: 16 });
  // Капюшон лежит на спине
  k.ball(COL.jacketDark, 0, 0.405, 0.1, 0.135, 0.062, 0.058);
  k.ball(COL.jacket, 0, 0.432, 0.078, 0.112, 0.056, 0.062);
  // Знак на спине: звезда в круге
  k.cyl(COL.white, 0, 0.105, 0.134, 0.08, 0.08, 0.014, Math.PI / 2, 0, 0, 22);
  k.add(starGeometry(0.066).translate(0, 0.105, 0.1425), COL.zip);
  // Перед: футболка, молния, карманы
  k.ball(COL.white, 0, 0.432, -0.07, 0.05, 0.036, 0.028);
  k.box(COL.zip, 0, 0.16, -0.146, 0.014, 0.42, 0.012, 0, 0, 0, 0.005);
  for (const s of [-1, 1]) k.box(COL.jacketDark, s * 0.095, 0.015, -0.122, 0.1, 0.09, 0.022, 0, 0, s * 0.12);
  return k.build();
}

function buildHead() {
  const k = new Kit();
  // Череп и овал лица. Лицо смотрит в -Z
  k.loft(COL.skin, [
    { y: -0.165, rx: 0.03, rz: 0.03, z: -0.03 },
    { y: -0.155, rx: 0.058, rz: 0.058, z: -0.03 },
    { y: -0.115, rx: 0.095, rz: 0.098, z: -0.014 },
    { y: -0.05, rx: 0.113, rz: 0.122, z: -0.004 },
    { y: 0.02, rx: 0.123, rz: 0.132 },
    { y: 0.09, rx: 0.12, rz: 0.13, z: 0.006 },
    { y: 0.145, rx: 0.085, rz: 0.1, z: 0.01 },
    { y: 0.17, rx: 0.03, rz: 0.04, z: 0.01 },
  ], { seg: 18 });
  // Шея
  k.cyl(COL.skinShade, 0, -0.2, 0.012, 0.06, 0.066, 0.13, 0, 0, 0, 12);
  // Уши
  for (const s of [-1, 1]) {
    k.ball(COL.skin, s * 0.127, -0.012, 0.012, 0.017, 0.04, 0.028);
    k.ball(COL.skinShade, s * 0.135, -0.012, 0.012, 0.007, 0.024, 0.015);
  }
  // Нос
  k.ball(COL.skin, 0, -0.02, -0.126, 0.0145, 0.025, 0.018);
  k.ball(COL.skin, 0, -0.036, -0.135, 0.015, 0.0115, 0.012);
  // Глаза: белок, радужка, зрачок, блик, верхнее веко
  for (const s of [-1, 1]) {
    k.ball(COL.white, s * 0.051, 0.012, -0.11, 0.0295, 0.0215, 0.0125);
    k.ball(COL.iris, s * 0.05, 0.012, -0.119, 0.0165, 0.0178, 0.0058);
    k.ball(COL.dark, s * 0.05, 0.012, -0.1232, 0.009, 0.0098, 0.0031);
    k.ball(0xffffff, s * 0.045, 0.0185, -0.1262, 0.0036, 0.0036, 0.0016);
    k.ball(COL.skin, s * 0.051, 0.0395, -0.108, 0.0345, 0.0125, 0.0135);
    k.box(COL.hair, s * 0.051, 0.0325, -0.1205, 0.058, 0.0048, 0.008, 0, 0, s * 0.05, 0.0022);
    k.box(COL.hair, s * 0.055, 0.0615, -0.1205, 0.068, 0.0125, 0.013, 0.1, 0, s * 0.09, 0.005);
  }
  // Улыбка
  k.add(new T.CircleGeometry(0.03, 14, Math.PI, Math.PI).rotateY(Math.PI).translate(0, -0.073, -0.1205), 0xffffff);
  k.torus(COL.lip, 0, -0.073, -0.1195, 0.03, 0.0048, 0, 0, Math.PI, Math.PI, 14);
  k.box(COL.lip, 0, -0.0725, -0.1195, 0.062, 0.0052, 0.007, 0, 0, 0, 0.0024);
  // Волосы: шапка, затылок, виски
  k.smooth(COL.hair, 0, 0.085, 0.012, 0.136, 0.112, 0.14);
  k.smooth(COL.hair, 0, 0.008, 0.058, 0.123, 0.112, 0.086);
  for (const s of [-1, 1]) k.ball(COL.hair, s * 0.119, 0.05, -0.016, 0.0155, 0.05, 0.04);
  // Чёлка зачёсана вверх одним мягким объёмом и нависает над лбом, стык с кожей не виден
  k.smooth(COL.hair, 0, 0.138, -0.052, 0.126, 0.074, 0.098, 0.3);
  // Светлые пряди на чёлке показывают направление волос
  const strands = [
    [-0.05, 0.178, -0.086, 0.04, 0.02, 0.05, 0.42, 0.14],
    [0.02, 0.19, -0.094, 0.046, 0.02, 0.05, 0.42, -0.04],
    [0.076, 0.168, -0.076, 0.034, 0.02, 0.045, 0.42, -0.26],
  ];
  for (const [x, y, z, sx, sy, sz, rx, rz] of strands) k.ball(COL.hairLight, x, y, z, sx, sy, sz, rx, 0, rz);
  return k.build();
}

// Закрытые веки показываются на мгновение
function buildLids() {
  const k = new Kit();
  for (const s of [-1, 1]) {
    k.ball(COL.skin, s * 0.051, 0.014, -0.114, 0.032, 0.025, 0.0145);
    k.box(COL.hair, s * 0.051, 0.0005, -0.1275, 0.056, 0.0045, 0.006, 0, 0, s * -0.04, 0.002);
  }
  return k.build();
}

function buildThigh() {
  const k = new Kit();
  k.loft(COL.jeans, [
    { y: 0.06, rx: 0.09, rz: 0.098 },
    { y: -0.07, rx: 0.113, rz: 0.126 },
    { y: -0.24, rx: 0.092, rz: 0.1 },
    { y: -0.41, rx: 0.073, rz: 0.077 },
    { y: -0.47, rx: 0.068, rz: 0.072 },
    { y: -0.515, rx: 0.042, rz: 0.044 },
  ]);
  return k.build();
}

function buildShin() {
  const k = new Kit();
  k.loft(COL.jeans, [
    { y: 0.045, rx: 0.042, rz: 0.044 },
    { y: 0.0, rx: 0.068, rz: 0.072 },
    { y: -0.11, rx: 0.075, rz: 0.085, z: 0.012 },
    { y: -0.26, rx: 0.066, rz: 0.07, z: 0.006 },
    { y: -0.38, rx: 0.062, rz: 0.066 },
  ]);
  k.loft(COL.jeansLight, [
    { y: -0.36, rx: 0.066, rz: 0.07 },
    { y: -0.42, rx: 0.068, rz: 0.072 },
  ]);
  return k.build();
}

function buildFoot() {
  const k = new Kit();
  // Кроссовок
  k.ball(COL.white, 0, -0.042, 0.052, 0.06, 0.054, 0.072);
  k.ball(COL.white, 0, -0.056, -0.05, 0.058, 0.044, 0.1);
  k.ball(COL.white, 0, -0.058, -0.12, 0.054, 0.036, 0.062);
  k.cyl(COL.white, 0, 0.0, 0.018, 0.054, 0.058, 0.09, 0, 0, 0, 10);
  k.box(COL.sole, 0, -0.082, -0.026, 0.118, 0.028, 0.292, 0, 0, 0, 0.012);
  k.box(COL.accent, 0, -0.05, 0.075, 0.122, 0.034, 0.03, 0, 0, 0, 0.008);
  for (const s of [-1, 1]) k.box(COL.accent, s * 0.054, -0.044, -0.03, 0.012, 0.04, 0.13, 0, 0, 0, 0.004);
  for (const z of [-0.085, -0.055, -0.025]) k.box(COL.dark, 0, -0.02 + (z + 0.055) * -0.45, z, 0.06, 0.008, 0.012, 0, 0, 0, 0.003);
  return k.build();
}

function buildUpperArm() {
  const k = new Kit();
  k.ball(COL.jacket, 0, 0.0, 0, 0.074, 0.078, 0.076);
  k.loft(COL.jacket, [
    { y: 0.03, rx: 0.05, rz: 0.052 },
    { y: -0.03, rx: 0.077, rz: 0.08 },
    { y: -0.13, rx: 0.07, rz: 0.075 },
    { y: -0.27, rx: 0.06, rz: 0.063 },
    { y: -0.37, rx: 0.056, rz: 0.058 },
  ]);
  k.loft(COL.white, [
    { y: -0.15, rx: 0.0705, rz: 0.0745 },
    { y: -0.2, rx: 0.0675, rz: 0.0715 },
  ]);
  return k.build();
}

function buildForearm() {
  const k = new Kit();
  k.loft(COL.jacket, [
    { y: 0.035, rx: 0.044, rz: 0.046 },
    { y: 0.0, rx: 0.056, rz: 0.058 },
    { y: -0.09, rx: 0.057, rz: 0.06 },
    { y: -0.24, rx: 0.046, rz: 0.05 },
    { y: -0.285, rx: 0.044, rz: 0.048 },
  ]);
  k.loft(COL.jacketDark, [
    { y: -0.265, rx: 0.048, rz: 0.052 },
    { y: -0.31, rx: 0.046, rz: 0.05 },
  ]);
  k.ball(COL.skin, 0, -0.325, 0, 0.036, 0.03, 0.038);
  return k.build();
}

function buildHand() {
  const k = new Kit();
  // Ладонь идёт от запястья вдоль -Y, пальцы загнуты вокруг рукояти
  k.box(COL.skin, 0, -0.05, 0, 0.074, 0.09, 0.09, 0, 0, 0, 0.026);
  for (let i = 0; i < 4; i++) k.ball(COL.skin, 0.03 - i * 0.02, -0.098, -0.028, 0.0115, 0.022, 0.03);
  k.ball(COL.skin, -0.044, -0.056, -0.026, 0.015, 0.032, 0.017, 0.4);
  // Перчатка без пальцев
  k.box(COL.dark, 0, -0.03, 0, 0.08, 0.052, 0.094, 0, 0, 0, 0.02);
  return k.build();
}

const sharedGeo = {};
function geo(name, build) {
  if (!sharedGeo[name]) sharedGeo[name] = build();
  return sharedGeo[name];
}

const a = new T.Vector3();
const b = new T.Vector3();
const c = new T.Vector3();
const d = new T.Vector3();
const tmpQ = new T.Quaternion();

export class Hero {
  constructor() {
    this.material = toyMaterial({ roughness: 0.62 });
    this.material.emissive = new T.Color(0xff2030);
    this.material.emissiveIntensity = 0;
    const mat = this.material;
    this.root = new T.Group();
    this.hips = group(this.root, 0, 1.0, 0);
    part(this.hips, geo('pelvis', buildPelvis), mat);
    this.spine = group(this.hips, 0, 0.13, 0);
    part(this.spine, geo('chest', buildChest), mat);
    this.neck = group(this.spine, 0, 0.47, 0.005);
    this.head = group(this.neck, 0, 0.17, -0.005);
    part(this.head, geo('head', buildHead), mat);
    this.lids = part(this.head, geo('lids', buildLids), mat, 0, 0, 0, false);
    this.lids.visible = false;
    this.legs = [-1, 1].map((s) => {
      const thigh = group(this.hips, s * 0.102, -0.03, 0);
      part(thigh, geo('thigh', buildThigh), mat);
      const shin = group(thigh, 0, -0.47, 0);
      part(shin, geo('shin', buildShin), mat);
      const foot = group(shin, 0, -0.41, 0);
      part(foot, geo('foot', buildFoot), mat);
      return { thigh, shin, foot, side: s, was: 0 };
    });
    this.arms = [SHOULDER_L, SHOULDER_R].map((shoulder) => {
      const upper = group(this.spine);
      part(upper, geo('upper', buildUpperArm), mat);
      const fore = group(this.spine);
      part(fore, geo('fore', buildForearm), mat);
      const hand = group(fore, 0, -FORE, 0);
      part(hand, geo('hand', buildHand), mat);
      return { shoulder, upper, fore, hand };
    });
    this.mount = group(this.spine);
    this.guns = {};
    this.muzzle = group(this.mount);
    this.setGun('blaster');

    this.phase = 0;
    this.runW = 0;
    this.aimW = 0;
    this.turn = Math.PI;
    this.turnTo = Math.PI;
    this.recoil = 0;
    this.pop = 1;
    this.glance = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lift = 0;
    this.fall = 0;
    this.time = 0;
    this.blink = 2;
    this.hurtFlash = 0;
    this.stepEvents = [];
  }

  setGun(type, animate = false) {
    if (this.gun?.type === type) return;
    if (this.gun) this.gun.root.visible = false;
    if (!this.guns[type]) {
      this.guns[type] = makeGun(type);
      this.guns[type].root.scale.setScalar(GUN_SCALE);
      this.mount.add(this.guns[type].root);
    }
    this.gun = this.guns[type];
    this.gun.root.visible = true;
    this.pose = GUN_POSE[type];
    this.muzzle.position.set(...this.pose.muzzle).multiplyScalar(GUN_SCALE);
    if (animate) {
      this.pop = 0;
      this.glance = 1;
    }
  }

  fire() {
    this.recoil = Math.min(1, this.recoil + (this.pose.kick ?? 1) * 0.7);
  }

  hurt() {
    this.hurtFlash = 1;
  }

  // Кость руки смотрит вниз по -Y: разворачиваем плечо и предплечье так, чтобы кисть попала в цель
  reach(arm, target, pole) {
    a.subVectors(target, arm.shoulder);
    const full = UPPER + FORE;
    const dist = Math.max(0.08, Math.min(full - 0.002, a.length()));
    a.normalize();
    const along = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist);
    const out = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
    b.copy(pole).addScaledVector(a, -pole.dot(a)).normalize();
    c.copy(arm.shoulder).addScaledVector(a, along).addScaledVector(b, out);
    arm.upper.position.copy(arm.shoulder);
    d.subVectors(c, arm.shoulder).normalize();
    arm.upper.quaternion.setFromUnitVectors(DOWN, d);
    arm.fore.position.copy(c);
    d.copy(arm.shoulder).addScaledVector(a, dist).sub(c).normalize();
    arm.fore.quaternion.setFromUnitVectors(DOWN, d);
  }

  // state: { speed, lateral, pose: 'run' | 'idle' | 'win' | 'down' }
  update(dt, state) {
    this.time += dt;
    const t = this.time;
    const moving = Math.max(state.speed / 9, Math.min(1, Math.abs(state.lateral) / 7));
    const running = state.pose === 'run' ? Math.min(1, moving * 1.6) : 0;
    this.runW = damp(this.runW, running, 8, dt);
    const run = this.runW;
    this.aimW = damp(this.aimW, state.pose === 'run' ? 1 : 0, 7, dt);
    // Длина шага совпадает со скоростью дороги, поэтому ноги не скользят
    const cadence = 7.2 + state.speed * 1.5 + Math.abs(state.lateral) * 0.4;
    this.phase += dt * cadence * Math.max(run, 0.001);
    const phi = this.phase;

    const win = state.pose === 'win' ? 1 : 0;
    this.lift = damp(this.lift, win, 6, dt);
    const fallTo = state.pose === 'down' ? 1 : 0;
    this.fall = damp(this.fall, fallTo, 7, dt);
    this.turnTo = state.pose === 'run' ? 0 : state.pose === 'down' ? 0 : Math.PI;
    this.turn = damp(this.turn, this.turnTo, 7, dt);

    // Радость на финише: подпрыгивает, в нижней точке колени согнуты
    const hop = this.lift * (1 - Math.max(0, Math.sin(t * 7)));

    // Ноги
    for (const leg of this.legs) {
      const p = leg.side < 0 ? phi : phi + Math.PI;
      const swing = 0.14 + 0.84 * Math.sin(p);
      const knee = 0.22 + 1.5 * Math.pow(Math.max(0, Math.cos(p + 0.28)), 1.5);
      const footPitch = -0.35 + 0.6 * Math.sin(p);
      const stand = leg.side * 0.05;
      const idleKnee = 0.14 + 0.04 * Math.sin(t * 1.6) + hop * 0.72;
      leg.thigh.rotation.x = swing * run + (0.1 + (leg.side > 0 ? 0.1 : -0.04) + hop * 0.38) * (1 - run);
      leg.thigh.rotation.z = (stand + leg.side * 0.03) * (1 - run) + leg.side * 0.015 * run;
      const kneeNow = knee * run + idleKnee * (1 - run);
      leg.shin.rotation.x = -kneeNow;
      leg.foot.rotation.x = (footPitch - leg.thigh.rotation.x + kneeNow) * run + (kneeNow - leg.thigh.rotation.x) * (1 - run);
      // Момент касания земли: сюда view ставит облачко пыли
      const contact = Math.sin(p) > 0.86;
      if (contact && !leg.was && run > 0.5) this.stepEvents.push(leg.side);
      leg.was = contact;
    }

    // Таз и корпус: подпрыгивание, скручивание навстречу шагу, наклон вперёд
    const breath = Math.sin(t * 1.7) * 0.012;
    const hipsLow = 0.055 * run + 0.018 * (1 - run) + hop * 0.1;
    this.hips.position.y = 1.0 - hipsLow + Math.cos(phi * 2 + 0.5) * 0.034 * run + Math.sin(t * 2.2) * 0.004 * (1 - run);
    this.hips.position.x = Math.sin(phi) * 0.018 * run;
    this.hips.rotation.y = Math.sin(phi) * 0.15 * run;
    this.hips.rotation.z = Math.cos(phi) * 0.035 * run;
    this.hips.rotation.x = -0.06 * run;
    this.spine.rotation.x = -0.16 * run + (-0.025 + breath) * (1 - run);
    this.spine.rotation.y = -Math.sin(phi) * 0.17 * run;
    this.spine.rotation.z = -Math.cos(phi) * 0.02 * run;

    // Поворот всего тела и наклон в сторону движения
    const lean = T.MathUtils.clamp(state.lateral * 0.03, -0.3, 0.3) * run;
    this.root.rotation.set(this.fall * 1.45, this.turn - lean * 0.9, -lean, 'YXZ');
    this.root.position.y = this.fall * 0.2 + this.lift * Math.max(0, Math.sin(t * 7)) * 0.2;

    // Голова: оглядывается при новой пушке, смотрит в сторону уклонения, моргает
    this.glance = Math.max(0, this.glance - dt / 1.1);
    const glance = Math.sin(Math.min(1, (1 - this.glance) * 1.4) * Math.PI);
    let yaw = -lean * 1.4 + (state.pose === 'run' ? -1.25 * glance * (this.glance > 0 ? 1 : 0) : Math.sin(t * 0.7) * 0.22);
    if (state.lookYaw !== undefined) yaw = state.lookYaw;
    this.lookYaw = damp(this.lookYaw, yaw, 10, dt);
    this.neck.rotation.y = this.lookYaw * 0.35;
    this.head.rotation.y = this.lookYaw * 0.65;
    this.neck.rotation.x = 0.14 * run + 0.02 * (1 - run);
    this.head.rotation.x = 0.1 * run - this.lift * 0.08;
    this.head.rotation.z = 0.07 * run * Math.sin(phi);

    this.blink -= dt;
    if (this.blink < -0.1) this.blink = 2 + Math.random() * 3;
    this.lids.visible = this.blink < 0;

    this.poseArms(dt, run, phi, t);

    // Подсветка при ударе
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    this.material.emissiveIntensity = this.hurtFlash * 0.9;
  }

  poseArms(dt, run, phi, t) {
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.pop = Math.min(1, this.pop + dt * 3.2);
    const pose = this.pose;
    const lift = this.lift;
    const fall = this.fall;
    const stay = 1 - this.aimW;
    // Положение пушки: в бою у груди на линии огня, без боя чуть ниже и наискосок
    const bounce = Math.cos(phi * 2 + 1.1) * 0.012 * run;
    const m = this.mount;
    m.position.set(
      pose.at[0] - stay * 0.03,
      pose.at[1] + bounce - stay * 0.1 + Math.sin(t * 1.7) * 0.006 * stay,
      pose.at[2] + this.recoil * 0.055 + stay * 0.03,
    );
    // Спина наклонена, а ствол должен смотреть прямо вперёд
    const levelUp = (-this.spine.rotation.x - this.hips.rotation.x) * this.aimW;
    const kick = this.recoil * 0.05;
    m.rotation.set(levelUp + kick - stay * 0.26, stay * 0.58 - this.spine.rotation.y * 0.5, stay * -0.1);
    // Победа: пушка над головой
    if (lift > 0.001) {
      m.position.x = T.MathUtils.lerp(m.position.x, 0.2, lift);
      m.position.y = T.MathUtils.lerp(m.position.y, 0.98 + Math.sin(t * 7) * 0.03, lift);
      m.position.z = T.MathUtils.lerp(m.position.z, -0.1, lift);
      m.rotation.x = T.MathUtils.lerp(m.rotation.x, 1.35, lift);
      m.rotation.y *= 1 - lift;
      m.rotation.z *= 1 - lift;
    }
    const pop = this.pop;
    const grow = pop < 1 ? 0.2 + 0.8 * (1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2)) : 1;
    this.gun.root.scale.setScalar(grow * GUN_SCALE);
    if (this.gun.spin) this.gun.spin.rotation.z += dt * (this.spinning ? 34 : 3);

    // Цели для кистей считаем в системе груди
    const rightTarget = new T.Vector3(0, -0.075, 0.088).multiplyScalar(GUN_SCALE);
    const leftTarget = new T.Vector3(pose.fore[0], pose.fore[1] - 0.105, pose.fore[2] + 0.01).multiplyScalar(GUN_SCALE);
    m.updateMatrix();
    rightTarget.applyMatrix4(m.matrix);
    leftTarget.applyMatrix4(m.matrix);
    // Победа: левая рука вскинута кулаком. Падение: руки в стороны
    if (lift > 0.001) leftTarget.lerp(c.set(-0.42, 0.78 + Math.sin(t * 7 + 1) * 0.04, -0.12), lift);
    if (fall > 0.001) {
      leftTarget.lerp(c.set(-0.62, 0.2, 0.05), fall);
      rightTarget.lerp(d.set(0.62, 0.2, 0.05), fall);
    }
    const poleL = new T.Vector3(-0.7, -1, 0.25);
    const poleR = new T.Vector3(0.75, -1, 0.3);
    this.reach(this.arms[0], leftTarget, poleL);
    this.reach(this.arms[1], rightTarget, poleR);
    // Кисть повторяет наклон пушки, а не предплечья: пальцы лежат на рукояти
    for (const [i, arm] of this.arms.entries()) {
      tmpQ.copy(arm.fore.quaternion).invert();
      arm.hand.quaternion.copy(tmpQ).multiply(m.quaternion).multiply(i ? GRIP_RIGHT : GRIP_LEFT);
      if (i === 0 && lift > 0.5) arm.hand.quaternion.identity();
    }
  }
}
