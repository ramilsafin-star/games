// Модели: роботы ГОРНа, бойцы отряда, инженер и оружие в руках. Всё из простых тел,
// детали каждой подвижной части слиты в одну сетку (цвета в вершинах), свечение — отдельной сеткой.
// При отключении робот разваливается на эти части (см. view.js).
import { T, PRIM, Shape } from "./kit.js?v=7c816b4c";

// ---------- Материалы ----------
let MATS = null;
export function modelMats(q, envMap) {
  if (MATS) return MATS;
  const S = q.pbr ? T.MeshStandardMaterial : T.MeshLambertMaterial;
  const pbr = (r, m) => (q.pbr ? { roughness: r, metalness: m, envMap, envMapIntensity: 1.1 } : {});
  MATS = {
    paint: new S({ vertexColors: true, ...pbr(0.38, 0.55) }),
    gun: new S({ vertexColors: true, ...(q.pbr ? { roughness: 0.42, metalness: 0.45, envMap, envMapIntensity: 0.55 } : {}) }),
    cloth: new S({ vertexColors: true, ...pbr(0.85, 0.05) }),
    glow: new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    shield: new T.MeshBasicMaterial({ color: new T.Color(0.35, 0.85, 1.6), transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }),
    cone: new T.MeshBasicMaterial({ color: new T.Color(1.2, 0.15, 0.1), transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }),
    lens: new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.9, 1.4), toneMapped: false }),
  };
  return MATS;
}
// яркий цвет для свечения (выше 1 — светится сквозь bloom)
const hot = (hex, k = 2.5) => {
  const c = new T.Color(hex);
  return "#" + c.multiplyScalar(1).getHexString() + "|" + k;
};
// Деталь: сетка из Shape и свечение; glowK — во сколько раз ярче
function piece(build, glowBuild, mats, o = {}) {
  const g = new T.Group();
  const s = new Shape();
  build(s);
  if (!s.empty) {
    const m = new T.Mesh(s.build(o.ao ?? 0.3), o.mat || mats.paint);
    m.castShadow = true;
    g.add(m);
    g.userData.body = m;
  }
  if (glowBuild) {
    const gs = new Shape();
    glowBuild(gs);
    if (!gs.empty) {
      const gm = new T.Mesh(gs.build(), o.glowMat || mats.glow);
      g.add(gm);
      g.userData.glow = gm;
    }
  }
  return g;
}
// свечение с отдельным материалом на робота (пульс, вспышка, оглушение)
function glowMat(color, k) {
  const m = new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k), toneMapped: false });
  m.userData.base = m.color.clone();
  return m;
}

const DARK = "#24282e", STEEL = "#7d8792", LIGHT = "#c9d0d8", BLACK = "#15171a";

// ---------- Роботы ----------
export function buildRobot(type, q, envMap) {
  const M = modelMats(q, envMap);
  const root = new T.Group();
  const P = {}; // подвижные части
  let coreM;
  const add = (name, grp, x = 0, y = 0, z = 0, parent = root) => {
    grp.position.set(x, y, z);
    parent.add(grp);
    P[name] = grp;
    return grp;
  };
  switch (type) {
    case "zhuk": {
      const C = "#ffc22a";
      coreM = glowMat("#ffe27a", 3);
      add("body", piece((s) => {
        s.add("ball", C, [0, 0, 0.05], [0.5, 0.32, 0.62]);
        s.add("ball", BLACK, [0, 0.06, 0.12], [0.36, 0.3, 0.42]);
        s.add("box", BLACK, [0, 0.2, 0.05], [0.08, 0.06, 0.9]);
        s.add("box", DARK, [0, -0.12, -0.32], [0.42, 0.18, 0.35]);
        s.add("cyl", STEEL, [-0.13, -0.15, -0.6], [0.04, 0.4, 0.04], [Math.PI / 2, 0, 0]);
        s.add("cyl", STEEL, [0.13, -0.15, -0.6], [0.04, 0.4, 0.04], [Math.PI / 2, 0, 0]);
        s.add("box", DARK, [0, 0.12, 0.55], [0.3, 0.12, 0.2]);
      }, (g) => {
        g.add("box", "#ffe27a", [-0.3, 0.05, 0.1], [0.03, 0.03, 0.5]);
        g.add("box", "#ffe27a", [0.3, 0.05, 0.1], [0.03, 0.03, 0.5]);
      }, M), 0, 0.55, 0);
      const eye = new T.Mesh(PRIM.ball, coreM);
      eye.scale.setScalar(0.17);
      eye.position.set(0, 0.17, -0.38);
      P.body.add(eye);
      P.core = eye;
      for (const [i, x, z] of [[0, -0.36, -0.28], [1, 0.36, -0.28], [2, -0.36, 0.3], [3, 0.36, 0.3]]) {
        add("leg" + i, piece((s) => {
          s.add("cyl", DARK, [0, -0.15, 0], [0.05, 0.36, 0.05], [0, 0, x > 0 ? -0.6 : 0.6]);
          s.add("cyl", STEEL, [x > 0 ? 0.2 : -0.2, -0.38, 0], [0.04, 0.42, 0.04], [0, 0, x > 0 ? 0.25 : -0.25]);
        }, null, M), x, 0.55, z);
      }
      break;
    }
    case "strelok":
    case "bastion":
    case "mate":
    case "vip":
    case "mishen": {
      const big = type === "bastion";
      const C = { strelok: "#e2552c", bastion: "#3f86d8", mate: "#2b3a52", vip: "#ee7d22", mishen: "#5a6a7c" }[type];
      const human = type === "mate" || type === "vip";
      const W = big ? 1.25 : 1;
      coreM = glowMat(type === "mate" ? "#4fe3ff" : type === "vip" ? "#ffd27a" : type === "mishen" ? "#5ff2ff" : big ? "#7fdcff" : "#ff8a3a", 1.8);
      if (type === "mishen") {
        add("body", piece((s) => {
          s.add("box", "#d8dde3", [0, 1.15, 0], [0.8, 0.9, 0.06]);
          s.add("ball", "#d8dde3", [0, 1.75, 0], [0.22, 0.22, 0.05]);
          s.add("box", "#d8dde3", [0, 0.45, 0], [0.5, 0.5, 0.06]);
          s.add("box", DARK, [0, 0.5, 0.05], [0.06, 1, 0.06]);
          s.add("box", DARK, [0, 0.02, 0.05], [0.7, 0.05, 0.5]);
          s.add("ring", "#e2552c", [0, 1.2, -0.05], [0.32, 0.32, 0.5]);
        }, null, M), 0, 0, 0);
        const core = new T.Mesh(PRIM.ball, coreM);
        core.scale.setScalar(0.15);
        core.position.set(0, 1.2, -0.3);
        P.body.add(core);
        P.core = core;
        break;
      }
      // ноги: бедро, колено, голень, ступня
      const trim = human ? (type === "vip" ? "#d26a1a" : "#1d2738") : C;
      for (const side of [-1, 1]) {
        add(side < 0 ? "legL" : "legR", piece((s) => {
          s.add(human ? "box" : "box", human ? C : DARK, [0, -0.18, 0], [0.17 * W, 0.38, 0.19 * W]);
          s.add("ball", human ? "#1a1e24" : STEEL, [0, -0.4, -0.01], [0.1 * W, 0.1 * W, 0.11 * W]);
          s.add("box", trim, [0, -0.58, 0.01], [0.15 * W, 0.34, 0.17 * W]);
          if (!human) s.add("box", C, [0, -0.5, -0.09 * W], [0.13 * W, 0.2, 0.04]);
          s.add("box", BLACK, [0, -0.8, -0.05], [0.18 * W, 0.1, 0.3 * W]);
        }, null, M, { mat: human ? M.cloth : M.paint }), side * 0.13 * W, 0.86, 0);
      }
      // корпус: пояс, живот, грудная пластина, наплечники
      const torso = add("torso", piece((s) => {
        s.add("box", DARK, [0, 0.0, 0], [0.34 * W, 0.12, 0.22 * W]);
        s.add("box", human ? C : "#3a3f46", [0, 0.16, 0], [0.3 * W, 0.22, 0.2 * W]);
        s.add("box", C, [0, 0.42, 0], [0.48 * W, 0.34, 0.3 * W]);
        if (!human) {
          s.add("box", C, [0, 0.48, -0.15 * W], [0.4 * W, 0.24, 0.06], [-0.18, 0, 0]);
          s.add("box", LIGHT, [0, 0.33, -0.16 * W], [0.22 * W, 0.08, 0.04]);
          s.add("ball", C, [-0.31 * W, 0.55, 0], [0.15 * W, 0.12, 0.17 * W]);
          s.add("ball", C, [0.31 * W, 0.55, 0], [0.15 * W, 0.12, 0.17 * W]);
          s.add("box", DARK, [0, 0.42, 0.18 * W], [0.32 * W, 0.34, 0.1]);
          s.add("cyl", STEEL, [-0.1 * W, 0.66, 0.16 * W], [0.025, 0.25, 0.025]);
          s.add("torus", DARK, [0, 0.42, big ? 0.22 * W : -0.2 * W], [0.14, 0.14, 0.6]);
        } else {
          s.add("box", type === "vip" ? "#f2f2f2" : "#3c4c66", [0, 0.42, -0.16], [0.36, 0.28, 0.05]);
          s.add("box", type === "vip" ? "#d26a1a" : "#1c2433", [0, 0.4, 0.2], [0.32, 0.34, 0.13]);
          s.add("box", type === "vip" ? "#d26a1a" : "#2b3a52", [-0.29, 0.56, 0], [0.12, 0.1, 0.24]);
          s.add("box", type === "vip" ? "#d26a1a" : "#2b3a52", [0.29, 0.56, 0], [0.12, 0.1, 0.24]);
        }
      }, (g) => {
        if (type === "mate") {
          g.add("box", "#4fe3ff", [-0.17, 0.44, -0.19], [0.025, 0.2, 0.015]);
          g.add("box", "#4fe3ff", [0.17, 0.44, -0.19], [0.025, 0.2, 0.015]);
          g.add("box", "#4fe3ff", [0, 0.4, 0.27], [0.18, 0.025, 0.015]);
        }
        if (type === "vip") g.add("box", "#fff0a0", [0, 0.28, -0.19], [0.3, 0.025, 0.015]);
        if (!human) g.add("box", big ? "#7fdcff" : "#ffb070", [0, 0.06, -0.12 * W], [0.3 * W, 0.02, 0.015]);
      }, M, { mat: human ? M.cloth : M.paint }), 0, 0.88, 0);
      if (!human) {
        const core = new T.Mesh(PRIM.ball, coreM);
        core.scale.setScalar(0.11);
        core.position.set(0, 0.42, big ? 0.24 * W : -0.21 * W);
        torso.add(core);
        P.core = core;
      }
      // голова: шлем со светящейся прорезью
      add("head", piece((s) => {
        if (human) {
          s.add("ball", type === "vip" ? "#f4f4f4" : "#25324a", [0, 0.13, 0.01], [0.16, 0.16, 0.17]);
          s.add("box", type === "vip" ? "#2a2f36" : "#141a24", [0, 0.11, -0.12], [0.24, 0.11, 0.08]);
          if (type === "vip") s.add("box", "#e6c19a", [0, 0.02, -0.13], [0.14, 0.1, 0.04]);
          s.add("box", type === "vip" ? "#f4f4f4" : "#25324a", [0.15, 0.1, 0], [0.04, 0.12, 0.12]);
        } else {
          s.add("box", DARK, [0, 0.0, 0], [0.12, 0.1, 0.12]);
          s.add("ball", "#2e333a", [0, 0.14, 0], [0.15 * W, 0.13, 0.16 * W]);
          s.add("box", C, [0, 0.21, 0.01], [0.24 * W, 0.07, 0.3 * W]);
          s.add("box", "#1a1d22", [0, 0.12, -0.12 * W], [0.24 * W, 0.08, 0.06]);
          s.add("box", C, [-0.15 * W, 0.13, 0], [0.04, 0.14, 0.18 * W]);
          s.add("box", C, [0.15 * W, 0.13, 0], [0.04, 0.14, 0.18 * W]);
          s.add("cyl", STEEL, [0.11, 0.3, 0.07], [0.012, 0.22, 0.012]);
        }
      }, (g) => {
        if (human) g.add("box", type === "vip" ? "#ffd27a" : "#5ff2ff", [0, 0.11, -0.163], [0.2, 0.04, 0.012]);
        else {
          g.add("box", big ? "#7fdcff" : "#ff8a3a", [0, 0.12, -0.153 * W], [0.2 * W, 0.03, 0.012]);
          g.add("ball8", "#ff3a2a", [0.11, 0.42, 0.07], 0.025);
        }
      }, M, { mat: human ? M.cloth : M.paint }), 0, 1.6, 0);
      // руки: плечо, предплечье вперёд к оружию
      const armC = human ? C : DARK;
      if (type !== "vip") {
        add("arms", piece((s) => {
          s.add("box", armC, [-0.31 * W, -0.12, 0.0], [0.1 * W, 0.28, 0.11 * W], [0.25, 0, 0.1]);
          s.add("box", armC, [0.31 * W, -0.12, 0.0], [0.1 * W, 0.28, 0.11 * W], [0.25, 0, -0.1]);
          s.add("box", human ? "#1d2738" : C, [-0.22 * W, -0.26, -0.18], [0.09 * W, 0.09, 0.3], [0.1, -0.35, 0]);
          s.add("box", human ? "#1d2738" : C, [0.22 * W, -0.26, -0.14], [0.09 * W, 0.09, 0.26], [0.1, 0.25, 0]);
          s.add("box", BLACK, [-0.1, -0.27, -0.36], [0.08, 0.07, 0.08]);
          s.add("box", BLACK, [0.12, -0.3, -0.24], [0.08, 0.07, 0.08]);
          if (big) {
            s.add("box", DARK, [0.16, -0.3, -0.5], [0.15, 0.17, 0.62]);
            s.add("cyl", STEEL, [0.16, -0.3, -0.86], [0.07, 0.24, 0.07], [Math.PI / 2, 0, 0]);
          } else {
            s.add("box", type === "mate" ? "#2a2f36" : BLACK, [0.04, -0.27, -0.42], [0.08, 0.12, 0.72]);
            s.add("box", type === "mate" ? "#3a414b" : DARK, [0.04, -0.37, -0.32], [0.05, 0.14, 0.07]);
            s.add("box", type === "mate" ? "#3a414b" : DARK, [0.04, -0.2, -0.3], [0.04, 0.05, 0.16]);
            s.add("cyl", STEEL, [0.04, -0.26, -0.84], [0.022, 0.2, 0.022], [Math.PI / 2, 0, 0]);
          }
        }, (g) => {
          if (type === "mate") g.add("box", "#4fe3ff", [0.085, -0.25, -0.45], [0.012, 0.02, 0.4]);
          else if (!big) g.add("box", "#ff7a2a", [0.085, -0.25, -0.45], [0.012, 0.02, 0.4]);
        }, M, { mat: human ? M.cloth : M.paint }), 0, 1.38, 0);
      } else {
        // руки инженера и наручники-поле
        add("arms", piece((s) => {
          s.add("box", C, [-0.24, -0.2, -0.05], [0.1, 0.42, 0.12]);
          s.add("box", C, [0.24, -0.2, -0.05], [0.1, 0.42, 0.12]);
          s.add("box", "#3a414b", [0.24, -0.38, -0.12], [0.16, 0.12, 0.2]);
        }, (g) => g.add("torus", "#7fe8ff", [0, -0.45, -0.1], [0.2, 0.2, 0.5], [Math.PI / 2, 0, 0]), M, { mat: M.cloth }), 0, 1.38, 0);
      }
      if (big) {
        // энергощит «Бастиона»
        const sh = new T.Group();
        const panel = new T.Mesh(new T.BoxGeometry(1.5, 1.9, 0.05), M.shield);
        panel.position.set(0, 1.05, -0.75);
        sh.add(panel);
        const frame = piece((s) => {
          s.add("box", DARK, [0, 0.12, -0.75], [1.56, 0.12, 0.1]);
          s.add("box", DARK, [-0.76, 1.05, -0.75], [0.1, 1.9, 0.1]);
          s.add("box", DARK, [0.76, 1.05, -0.75], [0.1, 1.9, 0.1]);
          s.add("box", C, [0, 1.98, -0.75], [1.4, 0.08, 0.1]);
          s.add("box", DARK, [-0.4, 0.95, -0.55], [0.08, 0.08, 0.4]);
        }, (g) => {
          g.add("box", "#9fe8ff", [-0.76, 1.05, -0.8], [0.03, 1.8, 0.02]);
          g.add("box", "#9fe8ff", [0.76, 1.05, -0.8], [0.03, 1.8, 0.02]);
        }, M);
        sh.add(frame);
        root.add(sh);
        P.shield = sh;
        P.shieldPanel = panel;
      }
      break;
    }
    case "osa": {
      coreM = glowMat("#ff3fd0", 3.5);
      add("body", piece((s) => {
        s.add("ball", "#2b2f36", [0, 0, 0], [0.42, 0.26, 0.5]);
        s.add("ball", "#d33aa8", [0, 0.12, 0.05], [0.34, 0.16, 0.4]);
        s.add("cyl", DARK, [0, -0.05, -0.36], [0.16, 0.16, 0.16], [Math.PI / 2, 0, 0]);
        for (const [x, z] of [[-0.55, -0.4], [0.55, -0.4], [-0.55, 0.4], [0.55, 0.4]]) {
          s.add("box", DARK, [x / 2, 0.02, z / 2], [Math.abs(x), 0.05, 0.06], [0, Math.atan2(z, x), 0]);
          s.add("cyl", STEEL, [x, 0.04, z], [0.06, 0.1, 0.06]);
        }
        s.add("box", DARK, [0, -0.25, 0.1], [0.06, 0.18, 0.06]);
      }, (g) => g.add("box", "#ff7ae0", [0, 0.06, 0.48], [0.18, 0.04, 0.04]), M), 0, 0, 0);
      const lens = new T.Mesh(PRIM.ball, coreM);
      lens.scale.setScalar(0.15);
      lens.position.set(0, -0.05, -0.45);
      P.body.add(lens);
      P.core = lens;
      P.rotors = [];
      const discM = new T.MeshBasicMaterial({ color: "#c8d0d8", transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide });
      for (const [x, z] of [[-0.55, -0.4], [0.55, -0.4], [-0.55, 0.4], [0.55, 0.4]]) {
        const r = new T.Mesh(new T.CircleGeometry(0.3, 14), discM);
        r.rotation.x = -Math.PI / 2;
        r.position.set(x, 0.1, z);
        const blade = new T.Mesh(new T.BoxGeometry(0.56, 0.015, 0.05), new T.MeshBasicMaterial({ color: "#1a1d22" }));
        blade.position.set(x, 0.11, z);
        P.body.add(r, blade);
        P.rotors.push(blade);
      }
      break;
    }
    case "kolobok": {
      coreM = glowMat("#ff3a2a", 3.2);
      const ballG = new T.Group();
      const shell = piece((s) => {
        s.add("ball", "#3a3f46", [0, 0, 0], 0.46);
        s.add("box", DARK, [0, 0, 0], [0.96, 0.12, 0.12]);
        s.add("box", DARK, [0, 0, 0], [0.12, 0.96, 0.12]);
        for (const [x, y, z] of [[0.3, 0.3, 0.2], [-0.3, -0.25, 0.25], [0.2, -0.3, -0.3], [-0.25, 0.3, -0.25]]) s.add("cyl6", STEEL, [x, y, z], [0.07, 0.05, 0.07], [x, y, z]);
      }, null, M);
      ballG.add(shell);
      const band = new T.Mesh(new T.TorusGeometry(0.47, 0.045, 6, 28), coreM);
      ballG.add(band);
      add("ball", ballG, 0, 0.46, 0);
      P.core = band;
      break;
    }
    case "molot": {
      const C = "#e88a1e";
      coreM = glowMat("#ffb03a", 3.2);
      for (const side of [-1, 1]) {
        add(side < 0 ? "legL" : "legR", piece((s) => {
          s.add("box", DARK, [0, -0.35, 0], [0.42, 0.8, 0.5]);
          s.add("box", C, [0, -0.95, -0.05], [0.46, 0.6, 0.55]);
          s.add("box", BLACK, [0, -1.45, -0.15], [0.6, 0.22, 0.95]);
          s.add("cyl", STEEL, [0, -0.72, 0], [0.24, 0.5, 0.24], [0, 0, Math.PI / 2]);
        }, null, M), side * 0.6, 1.55, 0);
      }
      const body = add("torso", piece((s) => {
        s.add("box", C, [0, 0.75, 0], [1.8, 1.25, 1.5]);
        s.add("box", DARK, [0, 0.0, 0], [1.2, 0.5, 1.0]);
        s.add("box", LIGHT, [0, 0.95, -0.77], [1.1, 0.5, 0.06]);
        s.add("box", DARK, [0, 1.45, 0.2], [1.3, 0.25, 1.1]);
        s.add("box", BLACK, [0, 0.7, -0.78], [0.7, 0.14, 0.04]);
        // ракетница слева
        s.add("box", DARK, [-1.15, 1.1, 0], [0.5, 0.6, 0.9]);
        for (let i = 0; i < 4; i++) s.add("cyl", BLACK, [-1.15 + ((i % 2) - 0.5) * 0.22, 1.1 + (Math.floor(i / 2) - 0.5) * 0.24, -0.46], [0.08, 0.06, 0.08], [Math.PI / 2, 0, 0]);
      }, (g) => {
        g.add("box", "#ff9a2a", [0, 0.7, -0.81], [0.6, 0.06, 0.02]);
        g.add("box", "#ffcf6a", [0, 1.6, -0.35], [0.9, 0.04, 0.02]);
      }, M), 0, 1.55, 0);
      // боковые ядра
      const cores = [];
      for (const side of [-1, 1]) {
        const c = new T.Mesh(PRIM.ball, coreM);
        c.scale.setScalar(0.27);
        c.position.set(side * 1.12, 0.8, 0.1);
        body.add(c);
        cores.push(c);
      }
      P.core = cores[0];
      P.cores = cores;
      // пулемёт справа
      const gun = piece((s) => {
        s.add("box", DARK, [0, 0, 0.1], [0.42, 0.42, 0.7]);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          s.add("cyl", STEEL, [Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.55], [0.03, 0.9, 0.03], [Math.PI / 2, 0, 0]);
        }
        s.add("cyl", DARK, [0, 0, -0.95], [0.16, 0.08, 0.16], [Math.PI / 2, 0, 0]);
      }, null, M);
      gun.position.set(1.15, 0.55, -0.2);
      body.add(gun);
      P.gun = gun;
      break;
    }
    case "glaz": {
      coreM = glowMat("#ff2b2b", 3.5);
      add("body", piece((s) => {
        s.add("box", DARK, [0, 0.12, 0.25], [0.1, 0.1, 0.5]);
        s.add("box", LIGHT, [0, 0, 0], [0.22, 0.2, 0.42]);
        s.add("cyl", DARK, [0, 0, -0.24], [0.09, 0.08, 0.09], [Math.PI / 2, 0, 0]);
      }, null, M), 0, 0, 0);
      const lens = new T.Mesh(PRIM.ball, coreM);
      lens.scale.setScalar(0.07);
      lens.position.set(0, 0, -0.29);
      P.body.add(lens);
      P.core = lens;
      // поле зрения
      const cone = new T.Mesh(new T.ConeGeometry(Math.tan(0.57) * 18, 18, 24, 1, true), M.cone.clone());
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(0, -1.6, -9);
      cone.rotation.set(-Math.PI / 2 - 0.18, 0, 0);
      P.body.add(cone);
      P.cone = cone;
      break;
    }
    case "nakovalnya": {
      const C = "#3d4148";
      coreM = glowMat("#ff5a1f", 3.4);
      const legCore = glowMat("#ff8a3a", 2.6);
      for (const [i, x, z] of [[0, -2.0, -1.4], [1, 2.0, -1.4], [2, -2.0, 1.6], [3, 2.0, 1.6]]) {
        add("leg" + i, piece((s) => {
          s.add("box", C, [x > 0 ? 0.7 : -0.7, 0.4, 0], [1.6, 0.7, 0.8], [0, 0, x > 0 ? -0.5 : 0.5]);
          s.add("box", "#c64a1a", [x > 0 ? 1.3 : -1.3, -1.6, 0], [0.7, 3.4, 0.8]);
          s.add("box", BLACK, [x > 0 ? 1.3 : -1.3, -3.4, -0.2], [1.1, 0.4, 1.4]);
        }, (g) => g.add("ball", "#ff8a3a", [x > 0 ? 1.3 : -1.3, 0.1, -0.42], 0.22), M), x * 0.6, 3.6, z);
      }
      const body = add("torso", piece((s) => {
        s.add("box", C, [0, 1.2, 0], [4.4, 2.2, 3.8]);
        s.add("box", "#c64a1a", [0, 2.5, 0.3], [3.6, 0.6, 3.2]);
        s.add("box", BLACK, [0, 0, 0], [2.6, 0.8, 2.6]);
        s.add("box", C, [0, 1.5, -2.05], [2.6, 1.6, 0.3]);
        for (const sd of [-1, 1]) {
          s.add("box", DARK, [sd * 2.6, 1.6, -0.6], [0.9, 0.9, 1.4]);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            s.add("cyl", STEEL, [sd * 2.6 + Math.cos(a) * 0.18, 1.6 + Math.sin(a) * 0.18, -1.7], [0.05, 1.3, 0.05], [Math.PI / 2, 0, 0]);
          }
          s.add("box", DARK, [sd * 1.2, 3.1, 1.2], [1.2, 0.9, 1.6]);
        }
        for (let i = 0; i < 5; i++) s.add("cyl", BLACK, [-0.8 + i * 0.4, 3.2, 1.8], [0.14, 0.4, 0.14]);
      }, (g) => {
        g.add("box", "#ff7a2a", [0, 2.82, 0.3], [3.4, 0.05, 3.0]);
        g.add("box", "#ffb070", [-1.6, 1.2, -1.92], [0.05, 1.2, 0.05]);
        g.add("box", "#ffb070", [1.6, 1.2, -1.92], [0.05, 1.2, 0.05]);
      }, M), 0, 3.6, 0);
      const core = new T.Mesh(new T.IcosahedronGeometry(0.85, 1), coreM);
      core.position.set(0, 1.4, -2.0);
      body.add(core);
      P.core = core;
      // створки ядра
      P.vents = [];
      for (const sd of [-1, 1]) {
        const v = piece((s) => s.add("box", "#5a6068", [sd * 0.62, 0, 0], [1.24, 1.9, 0.25]), null, M);
        v.position.set(sd * 1.25 - sd * 1.25, 1.4, -2.3);
        v.position.x = sd * 0.02;
        body.add(v);
        P.vents.push({ g: v, sd });
      }
      P.legCore = legCore;
      break;
    }
  }
  root.userData.parts = P;
  root.userData.coreMat = coreM;
  // свои материалы на робота: белая вспышка при попадании и свет ближних фонарей (uAmb),
  // иначе в метро и на этаже роботы были бы чёрными силуэтами
  root.userData.paint = [];
  root.userData.amb = new T.Vector3(0, 0, 0);
  const own = new Map();
  root.traverse((o) => {
    if (!o.isMesh || (o.material !== M.paint && o.material !== M.cloth)) return;
    if (!own.has(o.material)) {
      const m = o.material.clone();
      m.emissive = new T.Color(0, 0, 0);
      const amb = root.userData.amb;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uAmb = { value: amb };
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec3 uAmb;")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uAmb * diffuseColor.rgb;");
      };
      m.customProgramCacheKey = () => "amb";
      own.set(o.material, m);
      root.userData.paint.push(m);
    }
    o.material = own.get(o.material);
  });
  return root;
}

// ---------- Оружие в руках ----------
// Ствол смотрит вдоль −z; точки: дуло (muzzle), гильзы (eject), магазин (mag) — отдельная часть.
// body — металл корпуса, furn — фурнитура (приклад, цевьё, рукоять), acc — светящиеся полосы.
const GUN = {
  iskra: { body: "#3a4048", furn: "#22262c", acc: "#4fe3ff", len: 0.26 },
  grom: { body: "#5a5f66", furn: "#5a3f2e", acc: "#ffb03a", len: 0.32 },
  strizh: { body: "#3d4450", furn: "#2a2f36", acc: "#5ff2a0", len: 0.52 },
  taran: { body: "#40444a", furn: "#6a4a32", acc: "#ff6a3a", len: 0.8 },
  shkval: { body: "#3c434c", furn: "#8a7a5c", acc: "#4fe3ff", len: 0.8 },
  sokol: { body: "#4a5244", furn: "#5c6448", acc: "#c8ff5a", len: 0.95 },
  igla: { body: "#34404e", furn: "#2c3540", acc: "#ff3fd0", len: 1.15 },
  bur: { body: "#4a4a40", furn: "#2e2e28", acc: "#ffb03a", len: 1.0 },
  rezak: { body: "#2a2f36", furn: "#1a1d22", acc: "#4fe3ff", len: 0.32 },
};
export function buildGun(id, q, envMap) {
  const M = modelMats(q, envMap);
  const G = GUN[id];
  const root = new T.Group();
  const B = G.body, F = G.furn, A = G.acc, S = "#a8b2bc", K = "#17191d";
  const body = new Shape(), glow = new Shape(), mag = new Shape();
  let muzzle = [0, 0.02, -G.len], eject = [0.04, 0.04, -0.12], magPos = [0, -0.08, -0.12];
  switch (id) {
    case "iskra":
    case "grom": {
      const big = id === "grom";
      const L = big ? 0.3 : 0.24;
      // затвор сверху, рамка снизу, рукоять под углом
      body.add("box", B, [0, 0.045, -L / 2 + 0.02], [0.042, 0.04, L]);
      for (let i = 0; i < 5; i++) body.add("box", K, [0, 0.05, 0.01 - i * 0.012], [0.044, 0.03, 0.004]);
      body.add("box", K, [0, 0.015, -L / 2 + 0.03], [0.038, 0.024, L - 0.04]);
      body.add("box", F, [0, -0.045, 0.005], [0.036, 0.11, 0.055], [0.22, 0, 0]);
      body.add("box", K, [0, -0.012, -0.045], [0.012, 0.03, 0.05]);
      if (big) {
        body.add("cyl", S, [0, 0.01, -0.07], [0.04, 0.07, 0.04], [0, 0, Math.PI / 2]);
        body.add("cyl", S, [0, 0.045, -L - 0.02], [0.014, 0.1, 0.014], [Math.PI / 2, 0, 0]);
      } else body.add("cyl", S, [0, 0.045, -L + 0.01], [0.01, 0.03, 0.01], [Math.PI / 2, 0, 0]);
      body.add("box", K, [0, 0.072, 0.0], [0.03, 0.012, 0.012]);
      body.add("box", K, [0, 0.072, -L + 0.03], [0.008, 0.014, 0.008]);
      glow.add("box", A, [0.022, 0.045, -L / 2 + 0.02], [0.003, 0.008, L * 0.7]);
      glow.add("box", A, [-0.022, 0.045, -L / 2 + 0.02], [0.003, 0.008, L * 0.7]);
      glow.add("box", "#ff3a2a", [0, 0.078, 0.0], [0.004, 0.004, 0.004]);
      mag.add("box", K, [0, -0.1, 0.012], [0.03, 0.03, 0.05], [0.22, 0, 0]);
      muzzle = [0, 0.045, big ? -L - 0.08 : -L - 0.02];
      eject = [0.03, 0.06, -0.06];
      magPos = [0, 0, 0];
      break;
    }
    case "rezak": {
      body.add("box", K, [0, -0.02, 0.04], [0.035, 0.05, 0.12]);
      body.add("box", "#5a6470", [0, 0.0, -0.03], [0.07, 0.025, 0.03]);
      body.add("box", "#3a414b", [0, -0.01, -0.06], [0.02, 0.06, 0.04]);
      glow.add("box", "#7ff4ff", [0, 0.0, -0.18], [0.01, 0.045, 0.27]);
      glow.add("box", "#e8ffff", [0, 0.0, -0.18], [0.004, 0.022, 0.26]);
      muzzle = [0, 0, -0.32];
      break;
    }
    default: {
      const L = G.len;
      const r = L * 0.5;
      // ствольная коробка: низ, верхняя крышка с планкой
      body.add("box", B, [0, 0.015, -L * 0.3], [0.068, 0.085, L * 0.42]);
      body.add("box", K, [0, 0.07, -L * 0.33], [0.05, 0.016, L * 0.5]);
      for (let i = 0; i < 8; i++) body.add("box", "#2a2e34", [0, 0.081, -L * 0.12 - i * L * 0.055], [0.052, 0.008, L * 0.025]);
      body.add("box", "#4a525c", [0.036, 0.02, -L * 0.25], [0.004, 0.03, 0.06]);
      // цевьё с прорезями и ствол
      body.add("box", F, [0, 0.008, -L * 0.66], [0.064, 0.07, L * 0.32]);
      for (let i = 0; i < 4; i++) body.add("box", K, [0.033, 0.01, -L * 0.56 - i * L * 0.06], [0.003, 0.03, L * 0.03]);
      body.add("cyl", S, [0, 0.022, -L * 0.88], [0.012, L * 0.26, 0.012], [Math.PI / 2, 0, 0]);
      body.add("cyl", K, [0, 0.022, -L * 1.0], [0.022, 0.07, 0.022], [Math.PI / 2, 0, 0]);
      body.add("box", K, [0, 0.042, -L * 1.0], [0.008, 0.022, 0.008]);
      // рукоять, спуск, скоба
      body.add("box", F, [0, -0.075, -0.015], [0.036, 0.11, 0.05], [0.28, 0, 0]);
      body.add("box", K, [0, -0.04, -0.07], [0.01, 0.025, 0.05]);
      // приклад
      if (id !== "strizh") {
        body.add("box", F, [0, 0.0, L * 0.14], [0.05, 0.075, L * 0.26]);
        body.add("box", K, [0, -0.01, L * 0.27], [0.054, 0.1, 0.02]);
        body.add("box", F, [0, 0.042, L * 0.1], [0.04, 0.02, L * 0.16]);
      } else {
        body.add("box", K, [0, 0.02, 0.1], [0.025, 0.025, 0.18]);
        body.add("box", K, [0, 0.0, 0.19], [0.03, 0.07, 0.02]);
      }
      // прицел
      if (id === "sokol" || id === "igla") {
        const sl = L * 0.36;
        body.add("cyl", K, [0, 0.118, -L * 0.3], [0.026, sl, 0.026], [Math.PI / 2, 0, 0]);
        body.add("cyl", "#2a2f36", [0, 0.118, -L * 0.3 + sl / 2], [0.034, 0.05, 0.034], [Math.PI / 2, 0, 0]);
        body.add("cyl", "#2a2f36", [0, 0.118, -L * 0.3 - sl / 2], [0.036, 0.06, 0.036], [Math.PI / 2, 0, 0]);
        body.add("box", K, [0, 0.092, -L * 0.24], [0.02, 0.03, 0.02]);
        body.add("box", K, [0, 0.092, -L * 0.38], [0.02, 0.03, 0.02]);
        glow.add("cyl", A, [0, 0.118, -L * 0.3 - sl / 2 - 0.031], [0.028, 0.003, 0.028], [Math.PI / 2, 0, 0]);
      } else {
        body.add("box", K, [0, 0.1, -L * 0.22], [0.04, 0.035, 0.07]);
        body.add("box", "#5a6470", [0, 0.123, -L * 0.22], [0.034, 0.004, 0.06]);
        glow.add("box", "#ff3a2a", [0, 0.108, -L * 0.22 - 0.036], [0.005, 0.005, 0.002]);
      }
      if (id === "taran") {
        body.add("cyl", "#3a3430", [0, -0.028, -L * 0.62], [0.022, L * 0.55, 0.022], [Math.PI / 2, 0, 0]);
        body.add("box", F, [0, -0.036, -L * 0.6], [0.058, 0.05, 0.18]);
        for (let i = 0; i < 4; i++) body.add("cyl", "#c84a2a", [0.04, 0.01, -L * 0.2 - i * 0.025], [0.009, 0.03, 0.009], [0, 0, Math.PI / 2]);
      }
      if (id === "bur") {
        body.add("box", "#2a2a24", [0, -0.05, -L * 0.3], [0.13, 0.12, 0.16]);
        body.add("cyl", S, [0, 0.022, -L * 0.8], [0.026, L * 0.3, 0.026], [Math.PI / 2, 0, 0]);
        body.add("box", K, [0.0, -0.09, -L * 0.82], [0.012, 0.13, 0.012], [0.35, 0, 0]);
        body.add("box", K, [0.0, 0.11, -L * 0.15], [0.016, 0.06, 0.016]);
      }
      glow.add("box", A, [0.036, 0.04, -L * 0.33], [0.003, 0.01, L * 0.36]);
      glow.add("box", A, [-0.036, 0.04, -L * 0.33], [0.003, 0.01, L * 0.36]);
      glow.add("box", A, [0.033, 0.02, -L * 0.66], [0.003, 0.006, L * 0.2]);
      if (id !== "taran") {
        const curved = id === "shkval" || id === "strizh";
        mag.add("box", K, [0, -0.085, 0], [0.04, id === "bur" ? 0.12 : 0.15, id === "bur" ? 0.14 : 0.055], [curved ? 0.2 : 0, 0, 0]);
        if (id === "bur") mag.add("box", "#3a3a32", [0, -0.08, 0], [0.12, 0.14, 0.16]);
        else glow.add("box", A, [0.021, -0.07, 0], [0.002, 0.06, 0.01]);
      }
      magPos = [0, -0.02, -L * 0.42];
      muzzle = [0, 0.022, -L * 1.06];
      eject = [0.05, 0.04, -L * 0.3];
      void r;
    }
  }
  const bm = new T.Mesh(body.build(0), M.gun);
  root.add(bm);
  if (!glow.empty) root.add(new T.Mesh(glow.build(), M.glow));
  const magG = new T.Group();
  if (!mag.empty) magG.add(new T.Mesh(mag.build(0), M.gun));
  magG.position.set(...magPos);
  root.add(magG);
  // перчатки и рукава: кисть на рукояти, предплечье уходит вниз к краю экрана
  const hands = new Shape();
  const sleeve = "#26324a", glove = "#1b1e23", pad = "#3c4c66";
  const L = id === "iskra" || id === "grom" || id === "rezak" ? 0.0 : G.len;
  hands.add("box", glove, [0.005, -0.075, 0.012], [0.07, 0.08, 0.09], [0.3, 0, 0]);
  hands.add("box", sleeve, [0.03, -0.2, 0.06], [0.08, 0.2, 0.085], [0.55, 0, -0.15]);
  hands.add("box", pad, [0.03, -0.17, 0.045], [0.084, 0.05, 0.088], [0.55, 0, -0.15]);
  if (L) {
    hands.add("box", glove, [-0.03, -0.035, -L * 0.64], [0.075, 0.07, 0.1]);
    hands.add("box", sleeve, [-0.09, -0.15, -L * 0.52], [0.08, 0.22, 0.085], [0.7, 0, 0.5]);
  } else if (id !== "rezak") {
    hands.add("box", glove, [-0.03, -0.06, 0.002], [0.06, 0.075, 0.08], [0.3, 0, 0]);
    hands.add("box", sleeve, [-0.07, -0.18, 0.05], [0.075, 0.2, 0.08], [0.55, 0, 0.3]);
  }
  const hm = new T.Mesh(hands.build(0), M.cloth);
  root.add(hm);
  root.userData = { muzzle: new T.Vector3(...muzzle), eject: new T.Vector3(...eject), mag: magG, magPos: new T.Vector3(...magPos) };
  return root;
}
void hot;
// уровень качества или карта окружения сменились — материалы создаются заново
modelMats.reset = () => {
  MATS = null;
};
