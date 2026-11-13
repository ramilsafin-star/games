// Модели «Грозового каньона»: истребитель, роботы-стражи, скалы, кольца и кристаллы.
// Истребитель смотрит в −z (вглубь каньона), враги — в +z (на игрока).
import { T, GEO, TAU, part, at, along, metal, lit, flare } from "./kit.js?v=ac9603e7";

const white = metal("#e9eef6", { roughness: 0.35 });
const orange = metal("#ff7a2e", { roughness: 0.4 });
const dark = metal("#273044");
const steel = metal("#cfd8e6", { roughness: 0.4 });
const redTrim = lit("#ff4a3a", 1.5);
const gun = metal("#3a4458", { metalness: 0.6 });
const canopy = lit("#5fd8ff", 1.5);
const eyeRed = lit("#ff4a3a", 3);
const eyeAmber = lit("#ffb02e", 3);
const eyePink = lit("#ff4fb0", 3);
const hull = metal("#d9b7c4", { roughness: 0.4 });
const hullDark = metal("#5a4a6a");
const plate = metal("#ff6a5a", { roughness: 0.4 });

export function jet() {
  const g = new T.Group();
  g.add(
    at(part(GEO.oct, white, 0.55, 0.32, 1.9), 0, 0, -0.2),
    at(along(part(GEO.cone, white, 0.3, 1.2, 0.2)), 0, -0.02, -2.3),
    at(part(GEO.ball, canopy, 0.25, 0.2, 0.6), 0, 0.2, -0.75),
    at(part(GEO.box, orange, 0.16, 0.05, 1.5), 0, 0.31, 0.3),
  );
  const flames = [];
  for (const s of [-1, 1]) {
    const wing = at(part(GEO.box, white, 1.55, 0.07, 0.85), s * 1.0, -0.04, 0.45);
    wing.rotation.set(0, s * -0.36, s * 0.07);
    const tip = at(part(GEO.box, orange, 0.1, 0.34, 0.75), s * 1.78, 0.06, 0.82);
    const stripe = at(part(GEO.box, orange, 0.5, 0.075, 0.3), s * 1.1, -0.03, 0.2);
    stripe.rotation.y = s * -0.36;
    const barrel = at(along(part(GEO.cyl, gun, 0.065, 1.0, 0.065)), s * 0.62, -0.1, -0.75);
    const engine = at(along(part(GEO.cyl, dark, 0.21, 1.0, 0.21)), s * 0.36, 0.02, 1.25);
    const nozzle = at(along(part(GEO.cyl, lit("#7fe9ff", 1.7), 0.15, 0.08, 0.15)), s * 0.36, 0.02, 1.77);
    const fin = at(part(GEO.box, orange, 0.06, 0.55, 0.62), s * 0.42, 0.34, 1.15);
    fin.rotation.z = s * -0.32;
    const flame = at(flare("#59dcff", 0.6, 0.6), s * 0.36, 0.02, 1.95);
    flames.push(flame);
    g.add(wing, tip, stripe, barrel, engine, nozzle, fin, flame);
  }
  g.userData.flames = flames;
  return g;
}

export function wingman() {
  const g = new T.Group();
  g.add(part(GEO.oct, white, 0.3, 0.2, 0.55), at(part(GEO.box, orange, 0.9, 0.05, 0.25), 0, 0, 0.1),
    at(part(GEO.ball, canopy, 0.12), 0, 0.1, -0.2), at(flare("#59dcff", 0.6, 0.6), 0, 0, 0.6));
  return g;
}

function scout() {
  const g = new T.Group();
  g.add(part(GEO.hex, steel, 1.0, 0.34, 1.0), at(part(GEO.ball, dark, 0.62, 0.5, 0.62), 0, 0.12, 0),
    at(part(GEO.box, redTrim, 1.5, 0.08, 0.12), 0, 0.2, 0.55),
    at(part(GEO.ball, eyeRed, 0.3), 0, 0.02, 0.62), at(flare("#ff5a3a", 2.2, 2.2), 0, 0.02, 0.7));
  const rotor = new T.Group();
  for (const s of [-1, 1]) {
    g.add(at(part(GEO.box, steel, 0.7, 0.1, 0.3), s * 1.2, 0, 0), at(part(GEO.cyl, dark, 0.3, 0.2, 0.3), s * 1.55, 0, 0));
    rotor.add(at(part(GEO.box, white, 0.9, 0.03, 0.08), s * 1.55, 0.16, 0));
  }
  g.add(rotor);
  g.userData.spin = rotor.children;
  return g;
}

function dart() {
  const g = new T.Group();
  const nose = along(part(GEO.cone, plate, 0.42, 2.0, 0.42));
  nose.rotation.x = Math.PI / 2; // остриё к игроку
  g.add(at(nose, 0, 0, 0.5), at(part(GEO.oct, hullDark, 0.5, 0.5, 0.9), 0, 0, -0.5),
    at(part(GEO.ball, eyeAmber, 0.2), 0, 0, 1.45), at(flare("#ff8a2e", 2.6, 2.6), 0, 0, -1.1));
  for (let i = 0; i < 3; i++) {
    const fin = at(part(GEO.box, hull, 0.06, 0.7, 0.8), 0, 0, -0.7);
    const arm = new T.Group();
    arm.rotation.z = i * TAU / 3;
    fin.position.y = 0.45;
    arm.add(fin);
    g.add(arm);
  }
  return g;
}

function turret() {
  const g = new T.Group();
  g.add(at(part(GEO.hex, hullDark, 1.2, 0.5, 1.2), 0, -0.8, 0), at(part(GEO.ball, hull, 0.95, 0.8, 0.95), 0, -0.2, 0),
    at(along(part(GEO.cyl, gun, 0.2, 1.7, 0.2)), 0, 0, 1.0), at(part(GEO.ball, eyeAmber, 0.26), 0, 0.35, 0.6),
    at(flare("#ffb02e", 2, 2), 0, 0.35, 0.7));
  return g;
}

function mine() {
  const g = new T.Group();
  g.add(part(GEO.low, hullDark, 0.75));
  const up = new T.Vector3(0, 1, 0);
  for (let i = 0; i < 10; i++) {
    const y = 1 - (i + 0.5) / 10 * 2;
    const r = Math.sqrt(1 - y * y);
    const dir = new T.Vector3(Math.cos(i * 2.4) * r, y, Math.sin(i * 2.4) * r);
    const spike = part(GEO.cone, plate, 0.16, 0.6, 0.16);
    spike.position.copy(dir).multiplyScalar(0.9);
    spike.quaternion.setFromUnitVectors(up, dir);
    g.add(spike);
  }
  g.add(at(part(GEO.ball, eyeRed, 0.24), 0, 0, 0.7), at(flare("#ff3a3a", 2.4, 2.4), 0, 0, 0.75));
  return g;
}

function bomber() {
  const g = new T.Group();
  g.add(part(GEO.oct, hull, 2.4, 0.8, 1.5), at(part(GEO.box, hullDark, 3.6, 0.3, 1.1), 0, -0.1, -0.2),
    at(part(GEO.ball, plate, 0.9, 0.6, 0.9), 0, 0.45, -0.1), at(part(GEO.ball, eyePink, 0.34), 0, -0.1, 1.2),
    at(flare("#ff4fb0", 3.4, 3.4), 0, -0.1, 1.3));
  for (const s of [-1, 1]) {
    g.add(at(along(part(GEO.cyl, gun, 0.36, 1.5, 0.36)), s * 1.9, -0.25, 0.1), at(part(GEO.ball, eyeAmber, 0.2), s * 1.9, -0.25, 0.9),
      at(part(GEO.box, plate, 0.9, 0.08, 0.9), s * 2.7, 0.05, -0.3));
  }
  return g;
}

// Хозяин зоны: один корпус, семь расцветок (по порядку зон). core — светящееся ядро (пульсирует), guns — пушки.
const BOSS_TINT = ["#c9654a", "#4bb6c9", "#7b6fe0", "#a8dcf2", "#e0792e", "#8a4fd0", "#d94f8a"];
const BOSS_GLOW = ["#ffb02e", "#7ff2ff", "#b8a8ff", "#e6fbff", "#ffd24a", "#d08aff", "#ff7fc8"];
function boss(zone = 1) {
  const g = new T.Group();
  const shell = metal(BOSS_TINT[zone - 1], { roughness: 0.4 });
  const glow = lit(BOSS_GLOW[zone - 1], 3);
  const core = at(part(GEO.ball, glow, 1.05), 0, 0, 1.9);
  g.add(part(GEO.oct, shell, 3.6, 1.9, 3.2), at(part(GEO.box, hullDark, 5.2, 0.7, 2.2), 0, -0.3, -0.4),
    at(part(GEO.hex, dark, 1.5, 0.8, 1.5), 0, 1.3, -0.4), at(part(GEO.ball, glow, 0.4, 0.2, 0.5), 0, 1.75, 0.5),
    core, at(flare(BOSS_GLOW[zone - 1], 7, 7), 0, 0, 2.2));
  const ring = at(part(GEO.ring, shell, 1.6), 0, 0, 1.7);
  g.add(ring);
  const guns = [];
  for (const s of [-1, 1]) {
    const pylon = at(part(GEO.box, shell, 1.4, 1.6, 2.6), s * 4.0, -0.2, 0.1);
    pylon.rotation.z = s * 0.25;
    const cannon = at(along(part(GEO.cyl, gun, 0.42, 2.6, 0.42)), s * 4.1, -0.5, 1.6);
    const muzzle = at(part(GEO.ball, glow, 0.36), s * 4.1, -0.5, 2.95);
    const fin = at(part(GEO.box, hullDark, 0.2, 2.4, 1.6), s * 2.4, 1.3, -1.0);
    fin.rotation.z = s * -0.5;
    guns.push(muzzle);
    g.add(pylon, cannon, muzzle, fin);
  }
  const fins = [-1, 1];
  switch (zone) {
    case 1:
      for (const side of fins) {
        const tusk = at(part(GEO.cone, shell, 0.6, 3.0, 0.66), side * 1.75, -0.45, 3.2);
        tusk.rotation.x = Math.PI / 2;
        g.add(tusk);
      }
      break;
    case 2:
      for (const [x, y] of [[-2.6, 1.4], [0, 2.3], [2.6, 1.4]]) {
        g.add(at(part(GEO.oct, glow, 0.58, 1.65, 0.58), x, y, 0.3));
      }
      break;
    case 3:
      for (const side of fins) {
        const x = side * 3.45;
        g.add(at(part(GEO.cyl, gun, 0.28, 2.5, 0.28), x, 1.55, 0));
        for (let i = 0; i < 3; i++) {
          const coil = at(part(GEO.ring, glow, 0.58), x, 1.05 + i * 0.7, 0);
          coil.rotation.x = Math.PI / 2;
          g.add(coil);
        }
      }
      break;
    case 4:
      for (let i = -2; i <= 2; i++) {
        const spike = at(part(GEO.cone, glow, 0.47, 2.1 - Math.abs(i) * 0.28, 0.47), i * 0.95, 1.85, -0.6);
        spike.rotation.z = i * -0.18;
        g.add(spike);
      }
      break;
    case 5:
      for (const side of fins) {
        const x = side * 2.35;
        g.add(at(along(part(GEO.cyl, hullDark, 0.84, 2.2, 0.84)), x, 1.0, 0.65),
          at(part(GEO.ring, glow, 0.88), x, 1.0, 1.8),
          at(part(GEO.ball, glow, 0.43), x, 1.0, 1.75));
      }
      break;
    case 6:
      for (const side of fins) {
        const wing = at(part(GEO.box, shell, 4.1, 0.22, 1.42), side * 5.45, 0.65, -0.9);
        wing.rotation.y = side * 0.32;
        wing.rotation.z = side * 0.2;
        wing.add(at(part(GEO.box, glow, 0.17, 0.09, 1.02), side * 1.55 / 4.1, 0.7, 0.17));
        g.add(wing);
      }
      break;
    case 7:
      for (const side of fins) g.add(at(part(GEO.ball, glow, 0.64), side * 2.1, 0.25, 2.05));
      break;
  }
  let plate = null;
  if (zone === 7) {
    plate = at(part(GEO.hex, shieldGlass, 4.2, 0.09, 3.0), 0, 0.1, 3.45);
    plate.rotation.x = Math.PI / 2;
    plate.visible = false;
    g.add(plate);
  }
  g.userData = { core, ring, guns, plate };
  return g;
}

// Дрон из звена: маленький, круглый, с винтом сверху
function drone() {
  const g = new T.Group();
  const shell = metal("#9fe8ff", { roughness: 0.35 });
  g.add(part(GEO.ball, shell, 0.62, 0.48, 0.62), at(part(GEO.box, dark, 1.4, 0.07, 0.18), 0, 0.12, 0),
    at(part(GEO.ball, eyeAmber, 0.2), 0, 0.02, 0.5), at(flare("#7fe9ff", 1.6, 1.6), 0, 0, 0.55));
  const rotor = new T.Group();
  rotor.add(at(part(GEO.box, white, 1.2, 0.03, 0.1), 0, 0.5, 0), at(part(GEO.cyl, dark, 0.08, 0.2, 0.08), 0, 0.4, 0));
  g.add(rotor);
  g.userData.spin = [rotor];
  return g;
}

// Щитоносец: крепкий корпус и шестигранный щит спереди
const shieldGlass = new T.MeshBasicMaterial({ color: new T.Color("#6fd8ff").multiplyScalar(1.6), transparent: true, opacity: 0.38, toneMapped: false, depthWrite: false, side: T.DoubleSide });
function shieldBearer() {
  const g = new T.Group();
  const shell = metal("#5a7fa8", { roughness: 0.4 });
  g.add(part(GEO.oct, shell, 1.2, 0.9, 1.1), at(part(GEO.box, hullDark, 2.2, 0.35, 0.8), 0, -0.1, -0.2),
    at(part(GEO.ball, eyeRed, 0.26), 0, 0.15, 0.95), at(flare("#ff5a3a", 2, 2), 0, 0.15, 1.0));
  for (const s of [-1, 1]) g.add(at(along(part(GEO.cyl, gun, 0.16, 1.1, 0.16)), s * 0.95, -0.25, 0.7));
  const plate = new T.Group();
  const hex = part(GEO.hex, shieldGlass, 1.75, 0.08, 1.75);
  hex.rotation.x = Math.PI / 2;
  const rim = part(GEO.ring, lit("#7fe9ff", 2.4), 1.78);
  rim.scale.z = 0.4;
  plate.add(hex, rim);
  plate.position.z = 1.55;
  g.add(plate);
  g.userData.plate = plate;
  return g;
}

// Снайпер: длинный ствол и большой глаз-прицел
function sniper() {
  const g = new T.Group();
  const shell = metal("#d8c0e8", { roughness: 0.35 });
  g.add(part(GEO.hex, shell, 0.9, 0.5, 0.9), at(part(GEO.ball, hullDark, 0.6, 0.5, 0.7), 0, 0.2, 0),
    at(along(part(GEO.cyl, gun, 0.12, 2.6, 0.12)), 0, 0, 1.4), at(part(GEO.ball, eyePink, 0.34), 0, 0.42, 0.45),
    at(flare("#ff4f8a", 2.4, 2.4), 0, 0.42, 0.55));
  for (const s of [-1, 1]) g.add(at(part(GEO.box, shell, 0.9, 0.06, 0.4), s * 0.95, 0, -0.2));
  return g;
}

// Контейнер с оружием: золотой ящик со звездой и двумя винтами
function carrier() {
  const g = new T.Group();
  const gold = metal("#ffcf4a", { roughness: 0.3, metalness: 0.55 });
  g.add(part(GEO.box, gold, 1.5, 1.1, 1.5), at(part(GEO.box, dark, 1.6, 0.18, 1.6), 0, 0, 0),
    at(part(GEO.oct, lit("#ffffff", 2.2), 0.42, 0.42, 0.12), 0, 0.05, 0.78), at(flare("#ffe27a", 3.4, 3.4), 0, 0, 0));
  const rotors = [];
  for (const s of [-1, 1]) {
    const rotor = new T.Group();
    rotor.position.set(s * 1.05, 0.75, 0);
    rotor.add(part(GEO.box, white, 1.1, 0.03, 0.12), at(part(GEO.cyl, dark, 0.06, 0.4, 0.06), 0, -0.2, 0));
    rotors.push(rotor);
    g.add(rotor);
  }
  g.userData.spin = rotors;
  return g;
}

// Крейсер: длинный корпус, две башни, тарелка радара и сияющие двигатели
function cruiser(zone = 1) {
  const g = new T.Group();
  const shell = metal(BOSS_TINT[(zone + 2) % BOSS_TINT.length], { roughness: 0.42 });
  const glow = lit("#ffb04a", 3);
  g.add(part(GEO.oct, shell, 3.4, 1.0, 2.6), at(part(GEO.box, hullDark, 6.4, 0.5, 1.6), 0, -0.25, -0.3),
    at(part(GEO.box, steel, 1.4, 0.8, 2.2), 0, 0.75, -0.4), at(part(GEO.ball, glow, 0.5, 0.3, 0.4), 0, 0.15, 2.4),
    at(flare("#ffb04a", 4, 4), 0, 0.15, 2.5));
  for (const s of [-1, 1]) {
    g.add(at(part(GEO.hex, dark, 0.7, 0.45, 0.7), s * 2.4, 0.45, 0.6), at(along(part(GEO.cyl, gun, 0.18, 1.6, 0.18)), s * 2.4, 0.5, 1.4),
      at(part(GEO.box, shell, 1.6, 0.12, 1.2), s * 3.6, -0.15, -0.6), at(along(part(GEO.cyl, lit("#7fe9ff", 2), 0.3, 0.2, 0.3)), s * 1.2, -0.1, -2.1));
  }
  const radar = new T.Group();
  radar.position.set(0, 1.35, -0.6);
  radar.add(part(GEO.cyl, steel, 0.08, 0.5, 0.08), at(part(GEO.cyl, metal("#e9eef6"), 0.75, 0.08, 0.75), 0, 0.3, 0), at(part(GEO.ball, eyeRed, 0.12), 0, 0.4, 0));
  g.add(radar);
  g.userData = { radar };
  return g;
}

function prism() {
  const g = new T.Group();
  g.add(part(GEO.oct, metal("#8666d9"), 0.88, 1.4, 0.88),
    part(GEO.oct, lit("#d5acff", 2.2), 0.46, 1.18, 0.46),
    flare("#bd80ff", 3.0));
  return g;
}

export const enemyModels = { prism, scout, dart, turret, mine, bomber, boss, drone, shield: shieldBearer, sniper, carrier, cruiser };
export const enemyColor = { prism: "#c39aff", scout: "#ff6a4a", dart: "#ff9a3a", turret: "#ffb02e", mine: "#ff5252", bomber: "#ff5fb8", boss: "#ffd27a", drone: "#7fe9ff", shield: "#5fd0ff", sniper: "#ff5a8a", carrier: "#ffd23e", cruiser: "#ff9a4a" };

// Капсулы с оружием: цвет говорит, что внутри
export const CAPSULE_COLOR = { plasma: "#ff5ad0", chain: "#ffe14a", shield: "#5fd0ff" };
export function capsule(kind) {
  const g = new T.Group();
  const color = CAPSULE_COLOR[kind] || "#ffffff";
  const core = part(GEO.ball, lit(color, 2.6), 0.5);
  const shellMat = new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(1.2), transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false });
  const ring = part(GEO.ring, lit("#ffffff", 2), 0.85);
  g.add(core, part(GEO.ball, shellMat, 0.85), ring, flare(color, 3.6, 3.6));
  g.userData = { ring, core };
  return g;
}

// ---------- Скалы. Материал общий и перекрашивается под зону. ----------
function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// столб: стопка гранёных глыб от дна до высоты top
export function pillar(material, half, top, seed = 1) {
  const random = seededRandom(seed * 977 + 13);
  const g = new T.Group();
  let y = -2;
  while (y < top) {
    const h = 2.6 + random() * 2.6;
    const block = part(GEO.hex, material, half * (0.92 + random() * 0.3), h, half * (0.92 + random() * 0.3));
    block.position.set((random() - 0.5) * half * 0.3, y + h / 2, (random() - 0.5) * 0.6);
    block.rotation.y = random() * TAU;
    g.add(block);
    y += h * 0.86;
  }
  return g;
}

// арка: каменная перемычка во всю ширину, свободно под ней (ниже y0)
export function arch(material, width, y0, seed = 1) {
  const random = seededRandom(seed * 331 + 7);
  const g = new T.Group();
  g.add(at(part(GEO.box, material, width * 2 + 8, 9, 3.2), 0, y0 + 4.5, 0));
  for (let i = 0; i < 7; i++) {
    const lump = part(GEO.low, material, 1.2 + random() * 1.4, 0.9 + random() * 0.8, 1.6);
    lump.position.set((i / 6 - 0.5) * width * 2.1, y0 + 0.25, (random() - 0.5) * 0.8);
    lump.rotation.y = random() * TAU;
    g.add(lump);
  }
  return g;
}

// гряда: стена от дна до y1, свободно над ней
export function ridge(material, width, y1, seed = 1) {
  const random = seededRandom(seed * 577 + 3);
  const g = new T.Group();
  g.add(at(part(GEO.box, material, width * 2 + 8, y1 + 3, 3), 0, (y1 - 3) / 2 - 0.2, 0));
  for (let i = 0; i < 8; i++) {
    const lump = part(GEO.low, material, 1.3 + random() * 1.2, 0.8 + random() * 0.7, 1.6);
    lump.position.set((i / 7 - 0.5) * width * 2.1, y1 - 0.35, (random() - 0.5) * 0.7);
    lump.rotation.y = random() * TAU;
    g.add(lump);
  }
  return g;
}

const ringGold = lit("#ffd84a", 1.5);
const ringDone = lit("#7dffb0", 1.6);
export function ringGate(radius) {
  const g = new T.Group();
  const hoop = part(GEO.ring, ringGold, radius);
  g.add(hoop);
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4 + TAU / 8;
    g.add(at(part(GEO.oct, ringGold, 0.2, 0.2, 0.36), Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  g.userData = { hoop, gold: ringGold, done: ringDone };
  return g;
}

export const GEM_GEO = GEO.oct;
export const gemMaterial = new T.MeshBasicMaterial({ toneMapped: false });

export function repairKit() {
  const g = new T.Group();
  const green = lit("#5dff8f", 2.2);
  g.add(part(GEO.box, green, 0.9, 0.28, 0.28), part(GEO.box, green, 0.28, 0.9, 0.28), flare("#5dff8f", 2.6, 2.6));
  return g;
}
