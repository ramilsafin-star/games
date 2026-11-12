// Модели «Грозового каньона»: истребитель, роботы-стражи, скалы, кольца и кристаллы.
// Истребитель смотрит в −z (вглубь каньона), враги — в +z (на игрока).
import { T, GEO, TAU, part, at, along, metal, lit, flare } from "./kit.js?v=122edb60";

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

// Хозяин зоны: один корпус, пять расцветок. core — светящееся ядро (пульсирует), guns — пушки.
const BOSS_TINT = ["#c9654a", "#4bb6c9", "#7b6fe0", "#e0792e", "#d94f8a"];
const BOSS_GLOW = ["#ffb02e", "#7ff2ff", "#b8a8ff", "#ffd24a", "#ff7fc8"];
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
  g.userData = { core, ring, guns };
  return g;
}

export const enemyModels = { scout, dart, turret, mine, bomber, boss };
export const enemyColor = { scout: "#ff6a4a", dart: "#ff9a3a", turret: "#ffb02e", mine: "#ff5252", bomber: "#ff5fb8", boss: "#ffd27a" };

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
