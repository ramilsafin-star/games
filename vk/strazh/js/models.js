// Модели «Стража орбиты»: корабли дронов, флагман, контейнер снабжения и спаренная пушка турели.
// Все корабли смотрят носом вдоль −Z, двигатели сзади (+Z).
import { T, TAU, V, metal, lit, GEO, part, at, along, flare } from "./kit.js?v=7632fe77";

const FINISH = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// Сопло двигателя: пятно света на модели и точка, откуда в бою тянется след.
function engine(g, x, y, z, color, size) {
  g.add(at(flare(color, size), x, y, z));
  (g.userData.engines ||= []).push(V(x, y, z));
}

const bubbleGeometry = new T.SphereGeometry(13.2, 28, 18);
function bubbleMaterial() {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    uniforms: { power: { value: 0 }, tint: { value: new T.Color("#ff6fcb") } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * normal;
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform float power;
      uniform vec3 tint;
      void main() {
        float limb = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(tint * (pow(limb, 2.2) * (0.4 + power * 1.6) + power * 0.14), 1.0);
        ${FINISH}
      }`,
  });
}

export const MODEL = {
  scout() {
    const g = new T.Group();
    const alloy = metal("#3a96dc", { emissive: "#116d9d", emissiveIntensity: 0.3 });
    const gold = metal("#ffc35f", { emissive: "#dd801e", emissiveIntensity: 0.26 });
    const dark = metal("#22324d");
    const cyan = lit("#7ef4ff", 1.5);
    g.add(
      part(GEO.ball, alloy, 1.18, 0.83, 1.75),
      at(along(part(GEO.cone, dark, 0.62, 1.5, 0.62)), 0, -0.05, -2.2),
      at(part(GEO.ball, lit("#ffdc77", 1.6), 0.6, 0.47, 0.5), 0, 0.3, -1.2),
      at(part(GEO.box, dark, 0.12, 0.9, 1.1), 0, 0.85, 0.9),
    );
    for (const side of [-1, 1]) {
      const wing = at(part(GEO.oct, gold, 1.7, 0.4, 1.34), side * 1.48, 0.08, 0.12);
      wing.rotation.y = side * 0.28;
      wing.rotation.z = side * 0.2;
      g.add(
        wing,
        at(along(part(GEO.cyl, dark, 0.42, 1.9, 0.42)), side * 2.15, 0.31, 0.25),
        at(part(GEO.ball, cyan, 0.3, 0.3, 0.22), side * 2.15, 0.31, -0.75),
        at(part(GEO.box, cyan, 0.12, 0.13, 0.83), side * 2.15, 0.78, 0.19),
      );
      engine(g, side * 2.15, 0.31, 1.3, "#7ef4ff", 1.7);
    }
    return g;
  },
  // Оса: мелкий быстрый дрон, летает звеном.
  wasp() {
    const g = new T.Group();
    const shell = metal("#9ad94a", { emissive: "#4c8a12", emissiveIntensity: 0.5 });
    const dark = metal("#27351c");
    g.add(along(part(GEO.cone, shell, 0.95, 3.1, 0.95)), at(part(GEO.ball, lit("#e9ff9a", 1.8), 0.36), 0, 0.3, -0.25));
    for (const side of [-1, 1]) {
      const fin = at(part(GEO.oct, dark, 1.6, 0.14, 0.95), side * 1.05, 0, 0.95);
      fin.rotation.y = side * 0.5;
      g.add(fin);
    }
    engine(g, 0, 0, 1.65, "#c8ff6a", 2.1);
    return g;
  },
  bomber() {
    const g = new T.Group();
    const red = metal("#d9563a", { emissive: "#6b1c0c", emissiveIntensity: 0.3 });
    const amber = metal("#ffae56");
    g.add(part(GEO.low, red, 1.83, 1.42, 2.08));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * TAU;
      const dir = V(Math.cos(angle), Math.sin(angle), 0);
      const fin = part(GEO.cone, amber, 0.47, 1.12, 0.54);
      fin.position.copy(dir).multiplyScalar(1.66);
      fin.position.z = 0.56;
      fin.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
      g.add(fin);
    }
    const core = at(part(GEO.ball, lit("#ff743f", 2.4), 0.78, 0.78, 0.34), 0, 0, -1.93);
    g.add(core, at(part(GEO.wave, lit("#ffe096", 1.8), 1.03), 0, 0, -1.7));
    g.userData.core = core;
    engine(g, 0, 0, 2.15, "#ff9a4d", 2.6);
    return g;
  },
  gunship() {
    const g = new T.Group();
    const armor = metal("#7361a5", { emissive: "#2a1d55", emissiveIntensity: 0.3 });
    const violet = lit("#bf8aff", 2.1);
    g.add(part(GEO.oct, armor, 2.8, 1.15, 3.35), at(part(GEO.box, metal("#3d3466"), 1.5, 0.7, 2.2), 0, -0.55, 0.7));
    for (const side of [-1, 1]) {
      const wing = at(part(GEO.oct, metal("#b085dc"), 1.55, 0.58, 2.76), side * 2.9, 0, 0.2);
      wing.rotation.y = side * 0.24;
      g.add(
        wing,
        at(part(GEO.box, armor, 0.8, 0.62, 2.86), side * 2.62, -0.15, -0.85),
        at(part(GEO.box, violet, 0.14, 0.13, 2.42), side * 2.62, 0.26, -0.78),
        at(part(GEO.ball, lit("#ffa857", 2.3), 0.33), side * 2.62, -0.14, -2.32),
      );
      engine(g, side * 1.5, 0, 2.9, "#c79bff", 2.4);
    }
    g.add(at(part(GEO.ball, violet, 0.63, 0.26, 0.71), 0, 0.81, -1.38));
    return g;
  },
  // Копьё: стоит вдалеке и копит мощный луч. Линза на носу разгорается перед выстрелом.
  lancer() {
    const g = new T.Group();
    const hull = metal("#2f8f8a", { emissive: "#0d5a55", emissiveIntensity: 0.4 });
    const pale = metal("#cfeee9");
    const dark = metal("#16303a");
    g.add(along(part(GEO.hex, hull, 0.85, 5.2, 0.85)), at(along(part(GEO.hex, dark, 1.15, 1.3, 1.15)), 0, 0, 1.6));
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * TAU + Math.PI / 2;
      g.add(at(part(GEO.box, pale, 0.26, 0.26, 3.6), Math.cos(angle) * 1.3, Math.sin(angle) * 1.3, -2.7));
    }
    for (const side of [-1, 1]) {
      const fin = at(part(GEO.oct, hull, 2.3, 0.2, 1.3), side * 1.7, 0, 1.7);
      fin.rotation.y = side * 0.35;
      g.add(fin);
    }
    const lens = at(part(GEO.ball, lit("#5ff2e0", 2), 0.7), 0, 0, -3.0);
    g.add(lens);
    g.userData.lens = lens;
    engine(g, 0, 0, 2.5, "#7ffbe9", 2.6);
    return g;
  },
  // Контейнер снабжения: не враг. Сбил — получил бонус.
  pod() {
    const g = new T.Group();
    const green = lit("#6dffb0", 1.9);
    g.add(part(GEO.box, metal("#3e5a52", { emissive: "#0f3a2a", emissiveIntensity: 0.5 }), 2.6, 2.6, 3.4));
    for (const s of [-1, 1]) {
      g.add(
        at(part(GEO.box, green, 0.12, 1.6, 0.5), s * 1.33, 0, 0),
        at(part(GEO.box, green, 0.12, 0.5, 1.6), s * 1.33, 0, 0),
        at(part(GEO.box, green, 1.6, 0.12, 0.5), 0, s * 1.33, 0),
        at(part(GEO.box, green, 0.5, 0.12, 1.6), 0, s * 1.33, 0),
        at(along(part(GEO.hex, metal("#93b8a8"), 0.9, 0.5, 0.9)), 0, 0, s * 1.9),
      );
    }
    return g;
  },
  boss() {
    const g = new T.Group();
    const shell = metal("#5a5291", { emissive: "#1d1648", emissiveIntensity: 0.4 });
    const armor = metal("#7c64ac");
    const pink = lit("#ff75cb", 1.8);
    g.add(
      part(GEO.ball, shell, 6.45, 3.2, 6.45),
      at(part(GEO.ball, armor, 3.5, 2.1, 3.5), 0, 2.3, 0.6),
      at(part(GEO.cyl, armor, 4.4, 0.8, 4.4), 0, -2.7, 0),
    );
    const ring = new T.Group();
    ring.rotation.x = Math.PI / 2.7;
    ring.add(part(GEO.ring, armor, 9.3, 9.3, 4.7), part(GEO.wave, pink, 10.35));
    // Шесть узлов щита на кольце: в бою каждый — отдельная цель.
    const anchors = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU;
      const node = new T.Group();
      node.position.set(Math.cos(angle) * 9.8, Math.sin(angle) * 9.8, 0);
      node.add(
        part(GEO.box, metal("#6a5fa8", { emissive: "#3a1f6a", emissiveIntensity: 0.5 }), 2.2, 2.2, 2.0),
        at(part(GEO.ball, lit("#ff9ad8", 2.2), 0.85), 0, 0, -1.25),
        at(part(GEO.ball, lit("#ff9ad8", 2.2), 0.85), 0, 0, 1.25),
      );
      ring.add(node);
      anchors.push(node);
    }
    const core = at(part(GEO.ball, lit("#ffc5ef", 2.7), 2.17, 2.17, 0.65), 0, 0, -6);
    const bubble = new T.Mesh(bubbleGeometry, bubbleMaterial());
    g.add(ring, core, at(part(GEO.wave, pink, 2.55), 0, 0, -5.87), bubble);
    for (const side of [-1, 1]) engine(g, side * 2.6, 0, 6.3, "#ff8fd6", 6);
    Object.assign(g.userData, { ring, anchors, core, bubble });
    return g;
  },
};

// Спаренная лазерная пушка. Закреплена на камере, светящиеся детали меняют цвет с нагревом.
export function buildGuns() {
  const guns = new T.Group();
  const barrels = [-1, 1].map((side) => {
    const barrel = new T.Group();
    const housing = metal("#31486c", { metalness: 0.6, roughness: 0.38 });
    const steel = metal("#9db2cd", { metalness: 0.75, roughness: 0.28 });
    const dark = metal("#161f31", { metalness: 0.5 });
    const glow = lit("#7ce6ff", 1.8);
    barrel.add(
      at(part(GEO.box, housing, 0.34, 0.3, 0.95), 0, 0, -0.25),
      at(part(GEO.box, dark, 0.42, 0.12, 0.5), 0, -0.2, -0.1),
      at(part(GEO.box, steel, 0.1, 0.07, 0.8), 0, 0.18, -0.3),
      at(along(part(GEO.cyl, dark, 0.14, 0.5, 0.14)), 0, 0, -0.95),
      at(along(part(GEO.cyl, steel, 0.1, 1.6, 0.1)), 0, 0, -1.5),
    );
    for (const z of [-1.35, -1.65, -1.95]) barrel.add(at(along(part(GEO.cyl, housing, 0.155, 0.07, 0.155)), 0, 0, z));
    const tip = at(along(part(GEO.cyl, glow, 0.125, 0.14, 0.125)), 0, 0, -2.36);
    const muzzle = at(flare("#8de5ff", 0.7, 0.7, { depthTest: false }), 0, 0, -2.5);
    muzzle.visible = false;
    muzzle.renderOrder = 20;
    barrel.add(
      tip,
      muzzle,
      at(part(GEO.box, glow, 0.035, 0.035, 1.25), 0, 0.135, -1.45), // световод вдоль ствола
    );
    // щели охлаждения на внутренней стороне корпуса
    for (const y of [-0.07, 0, 0.07]) barrel.add(at(part(GEO.box, glow, 0.02, 0.022, 0.42), -side * 0.175, y, -0.25));
    barrel.rotation.y = side * 0.035;
    barrel.scale.setScalar(0.55); // вблизи камеры даже небольшая деталь закрывает пол-экрана
    barrel.userData = { tip, muzzle, glow, kick: 0, side };
    guns.add(barrel);
    return barrel;
  });
  return { guns, barrels };
}

