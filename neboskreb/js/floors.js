// Этажи и крыши небоскрёба: у каждого вида своя объёмная модель. Все этажи всех домов
// рисуются общими наборами копий, поэтому даже стоэтажный дом занимает пару десятков отрисовок
import * as T from "../vendor/three/three.module.min.js";
import { mergeGeometries } from "../vendor/three/BufferGeometryUtils.js";

export const FLOOR_W = 14;
export const FLOOR_H = 4;
const HALF = FLOOR_W / 2;
const H = FLOOR_H;
const CAPACITY = 900;

const tmpM = new T.Matrix4();
const tmpQ = new T.Quaternion();
const tmpE = new T.Euler();
const tmpV = new T.Vector3();
const tmpS = new T.Vector3();
const tmpC = new T.Color();

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function tint(g, color) {
  tmpC.set(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = tmpC.r;
    a[i * 3 + 1] = tmpC.g;
    a[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute("color", new T.BufferAttribute(a, 3));
  return g;
}

// Прямоугольная деталь с цветом в вершинах
function cube(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
  const g = new T.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute("uv");
  g.applyMatrix4(tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(1, 1, 1)));
  return tint(g, color);
}

function plainPart(g, color, x, y, z) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  out.translate(x, y, z);
  return tint(out, color);
}

function ball(r, x, y, z, color, sy = 1, detail = 1) {
  const g = new T.IcosahedronGeometry(r, detail);
  g.deleteAttribute("uv");
  g.scale(1, sy, 1);
  g.computeVertexNormals();
  g.translate(x, y, z);
  return tint(g, color);
}

// Окно: у каждого своё случайное число, по нему ночью решается, горит ли свет.
// Нормаль чуть сбита, поэтому стекло отражает небо не сплошным листом
function pane(rng, w, h, x, y, z, color, shape) {
  const g = (shape || new T.PlaneGeometry(w, h)).toNonIndexed();
  g.deleteAttribute("uv");
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const nx = (rng() - 0.5) * 0.1;
  const ny = (rng() - 0.5) * 0.07;
  const nor = g.attributes.normal;
  const win = new Float32Array(n).fill(rng());
  for (let i = 0; i < n; i++) nor.setXYZ(i, nx, ny, 1);
  g.setAttribute("aWin", new T.BufferAttribute(win, 1));
  return tint(g, color);
}

function archShape(w, h) {
  const r = w / 2;
  const s = new T.Shape();
  s.moveTo(-r, -h / 2);
  s.lineTo(r, -h / 2);
  s.lineTo(r, h / 2 - r);
  s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  s.lineTo(-r, -h / 2);
  return new T.ShapeGeometry(s, 8);
}

class Kit {
  constructor() {
    this.parts = {};
  }
  add(key, ...list) {
    (this.parts[key] ||= []).push(...list);
  }
  // Одна сторона фасада повторяется на всех четырёх
  around(fn) {
    for (let s = 0; s < 4; s++) {
      const side = new Kit();
      fn(side, s);
      const m = new T.Matrix4().makeRotationY((s * Math.PI) / 2);
      for (const key of Object.keys(side.parts)) {
        side.parts[key].forEach((g) => g.applyMatrix4(m));
        this.add(key, ...side.parts[key]);
      }
    }
    return this;
  }
}

// Кирпичи у фасада рисуются текстурой, развёртка считается по метрам
function brickBox(w, h, d, x, y, z) {
  const g = new T.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const useX = Math.abs(nor.getZ(i)) > 0.5;
    uv.setXY(i, (useX ? pos.getX(i) : pos.getZ(i)) / 5, pos.getY(i) / 5);
  }
  return tint(g, "#ffffff");
}

const BUILD = {
  // Стекло: сплошной фасад в синеву
  glass(k, rng) {
    k.add("solid", cube(FLOOR_W, 0.3, FLOOR_W, 0, 0.15, 0, "#cfd5dc"), cube(FLOOR_W, 0.3, FLOOR_W, 0, H - 0.15, 0, "#cfd5dc"), cube(FLOOR_W - 1, H - 0.6, FLOOR_W - 1, 0, H / 2, 0, "#16222e"));
    k.around((s) => {
      const n = 5;
      const pw = (FLOOR_W - 0.4) / n;
      for (let i = 0; i < n; i++) {
        const x = -HALF + 0.2 + pw * (i + 0.5);
        s.add("glass", pane(rng, pw - 0.1, H - 0.72, x, H / 2, HALF - 0.16, "#6fc0f0"));
      }
      for (let i = 0; i <= n; i++) s.add("metal", cube(0.14, H - 0.5, 0.26, -HALF + 0.2 + pw * i, H / 2, HALF - 0.1, "#3c4754"));
      s.add("metal", cube(FLOOR_W - 0.2, 0.1, 0.24, 0, H * 0.72, HALF - 0.1, "#3c4754"));
    });
  },
  // Кирпичный дом с балконами
  brick(k, rng) {
    k.add("solid", cube(FLOOR_W, 0.26, FLOOR_W, 0, H - 0.13, 0, "#e9e1d4"), cube(FLOOR_W - 0.5, H - 0.4, FLOOR_W - 0.5, 0, H / 2 - 0.2, 0, "#5a3b30"));
    k.around((s) => {
      s.add("brick", brickBox(FLOOR_W - 0.1, H - 0.26, 0.24, 0, (H - 0.26) / 2, HALF - 0.14));
      [-4.6, -1.55, 1.55, 4.6].forEach((x) => {
        s.add("glass", pane(rng, 1.7, 2.1, x, H * 0.48, HALF + 0.02, "#88c7e8"));
        s.add("solid",
          cube(2, 0.16, 0.14, x, H * 0.48 + 1.12, HALF + 0.03, "#f5efe4"),
          cube(2.1, 0.16, 0.26, x, H * 0.48 - 1.12, HALF + 0.06, "#f5efe4"),
          cube(0.14, 2.2, 0.12, x - 0.92, H * 0.48, HALF + 0.03, "#f5efe4"),
          cube(0.14, 2.2, 0.12, x + 0.92, H * 0.48, HALF + 0.03, "#f5efe4"),
          cube(0.08, 2.1, 0.06, x, H * 0.48, HALF + 0.05, "#f5efe4"));
      });
      // Балкон с перилами под средними окнами
      s.add("solid", cube(4.4, 0.14, 1, 0, 0.72, HALF + 0.5, "#e9e1d4"));
      s.add("metal", cube(4.4, 0.08, 0.08, 0, 1.5, HALF + 0.96, "#2f3338"), cube(0.08, 0.8, 1, -2.16, 1.1, HALF + 0.5, "#2f3338"), cube(0.08, 0.8, 1, 2.16, 1.1, HALF + 0.5, "#2f3338"));
      for (let i = 0; i <= 8; i++) s.add("metal", cube(0.05, 0.72, 0.05, -2 + i * 0.5, 1.12, HALF + 0.96, "#2f3338"));
    });
  },
  // Зелёный дом: на балконах кусты и деревца
  garden(k, rng) {
    k.add("solid", cube(FLOOR_W + 1.3, 0.3, FLOOR_W + 1.3, 0, 0.15, 0, "#f4f5f1"), cube(FLOOR_W - 2, H - 0.5, FLOOR_W - 2, 0, H / 2 - 0.02, 0, "#1b2830"), cube(FLOOR_W - 1.4, 0.2, FLOOR_W - 1.4, 0, H - 0.1, 0, "#f4f5f1"));
    k.around((s) => {
      for (let i = 0; i < 4; i++) s.add("glass", pane(rng, 2.5, H - 0.8, -4.05 + i * 2.7, H / 2 + 0.08, HALF - 0.96, "#8fd5e0"));
      s.add("solid", cube(FLOOR_W + 1.3, 0.5, 0.2, 0, 0.5, HALF + 0.55, "#f4f5f1"));
      for (let i = 0; i < 7; i++) {
        const x = -6 + i * 2 + (rng() - 0.5) * 0.6;
        const green = ["#4cbb4a", "#3aa648", "#6fcf4d", "#2f9b4f"][Math.floor(rng() * 4)];
        s.add("plant", ball(0.72 + rng() * 0.3, x, 1.05 + rng() * 0.25, HALF + 0.14, green, 0.85, 0));
        s.add("plant", ball(0.44 + rng() * 0.2, x + 0.5, 0.86, HALF + 0.42, "#7fd750", 0.8, 0));
        if (i % 2) s.add("plant", cube(0.12, 0.9 + rng() * 0.9, 0.12, x, -0.1 - rng() * 0.2, HALF + 0.62, "#3aa648"));
      }
    });
    // Деревца по углам
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => {
      k.add("solid", plainPart(new T.CylinderGeometry(0.1, 0.16, 1.6, 6), "#7a5534", a * 6.7, 1.1, b * 6.7));
      k.add("plant", ball(1.05, a * 6.7, 2.4, b * 6.7, "#3fae4b", 1.1, 1));
    });
  },
  // Старинный дом: колонны, арки, карниз
  classic(k, rng) {
    const stone = "#ead9b8";
    k.add("solid", cube(FLOOR_W - 0.4, H - 0.4, FLOOR_W - 0.4, 0, H / 2 - 0.1, 0, stone), cube(FLOOR_W + 0.3, 0.3, FLOOR_W + 0.3, 0, H - 0.15, 0, "#f6ecd6"), cube(FLOOR_W + 0.1, 0.18, FLOOR_W + 0.1, 0, H - 0.42, 0, "#d9c59c"), cube(FLOOR_W, 0.2, FLOOR_W, 0, 0.1, 0, "#d9c59c"));
    k.around((s) => {
      [-4.4, -1.47, 1.47, 4.4].forEach((x) => {
        s.add("solid", plainPart(archShape(2.1, 3), "#fff6e3", x, H * 0.48, HALF - 0.17));
        s.add("glass", pane(rng, 0, 0, x, H * 0.48, HALF - 0.15, "#3f6d8c", archShape(1.66, 2.6)));
        s.add("solid", cube(2.2, 0.16, 0.26, x, H * 0.48 - 1.46, HALF - 0.08, "#f6ecd6"));
      });
      [-5.9, -2.93, 0, 2.93, 5.9].forEach((x) => {
        s.add("solid", plainPart(new T.CylinderGeometry(0.3, 0.34, H - 0.62, 12), "#fff3da", x, H / 2 - 0.1, HALF - 0.02));
        s.add("solid", cube(0.86, 0.2, 0.5, x, H - 0.66, HALF - 0.04, "#f6ecd6"), cube(0.86, 0.2, 0.5, x, 0.3, HALF - 0.04, "#f6ecd6"));
      });
    });
  },
  // Часы на всех сторонах
  clock(k, rng) {
    const stone = "#b9c0c9";
    k.add("solid", cube(FLOOR_W - 0.4, H - 0.4, FLOOR_W - 0.4, 0, H / 2 - 0.1, 0, stone), cube(FLOOR_W + 0.3, 0.28, FLOOR_W + 0.3, 0, H - 0.14, 0, "#e7ebf0"), cube(FLOOR_W + 0.1, 0.22, FLOOR_W + 0.1, 0, 0.11, 0, "#8f98a3"));
    k.around((s) => {
      s.add("glass", pane(rng, 2.2, 2.3, -4.9, H / 2, HALF - 0.17, "#74b4d8"), pane(rng, 2.2, 2.3, 4.9, H / 2, HALF - 0.17, "#74b4d8"));
      s.add("glow", plainPart(new T.CircleGeometry(1.62, 32), "#fff6dc", 0, H / 2, HALF - 0.14));
      const rim = new T.TorusGeometry(1.68, 0.14, 8, 36);
      s.add("metal", plainPart(rim, "#d9a93a", 0, H / 2, HALF - 0.14));
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        s.add("solid", cube(0.09, i % 3 ? 0.18 : 0.34, 0.03, Math.sin(a) * 1.36, H / 2 + Math.cos(a) * 1.36, HALF - 0.12, "#2a2d33", 0, 0, -a));
      }
      // Стрелки стоят на десять минут одиннадцатого: так часы улыбаются
      const hand = (len, wid, a) => cube(wid, len, 0.04, (Math.sin(a) * len) / 2, H / 2 + (Math.cos(a) * len) / 2, HALF - 0.09, "#1d2026", 0, 0, -a);
      s.add("solid", hand(0.86, 0.13, -Math.PI / 3), hand(1.24, 0.09, Math.PI / 3));
      s.add("metal", plainPart(new T.CylinderGeometry(0.12, 0.12, 0.08, 10).rotateX(Math.PI / 2), "#d9a93a", 0, H / 2, HALF - 0.07));
    });
  },
  // Неон: тёмный фасад и светящиеся полосы двух цветов
  neon(k, rng) {
    k.add("solid", cube(FLOOR_W - 0.3, H - 0.4, FLOOR_W - 0.3, 0, H / 2, 0, "#14142a"), cube(FLOOR_W, 0.24, FLOOR_W, 0, 0.12, 0, "#2c2c6e"), cube(FLOOR_W, 0.24, FLOOR_W, 0, H - 0.12, 0, "#2c2c6e"));
    k.around((s, i) => {
      for (let a = 0; a < 6; a++) for (let b = 0; b < 2; b++) s.add("glass", pane(rng, 1.7, 1.15, -5.2 + a * 2.08, 1.15 + b * 1.6, HALF - 0.13, "#3348b8"));
      const cyan = new T.Color(0.2, 1.9, 2.2);
      const pink = new T.Color(2.3, 0.3, 1.9);
      const strip = (w, h, x, y, color) => {
        const g = cube(w, h, 0.08, x, y, HALF - 0.08, "#ffffff");
        const c = g.attributes.color;
        for (let v = 0; v < c.count; v++) c.setXYZ(v, color.r, color.g, color.b);
        return g;
      };
      const [line, post] = i % 2 ? [cyan, pink] : [pink, cyan];
      s.add("glow", strip(FLOOR_W - 0.2, 0.26, 0, 3.55, line), strip(FLOOR_W - 0.2, 0.12, 0, 1.95, line), strip(FLOOR_W - 0.2, 0.12, 0, 0.41, line));
      for (const x of [-HALF + 0.2, -4.16, 0, 4.16]) s.add("glow", strip(0.14, 3.14, x, 1.98, post));
    });
  },
  // Золотой дом: янтарное стекло и косые связи
  gold(k, rng) {
    k.add("solid", cube(FLOOR_W - 0.9, H - 0.5, FLOOR_W - 0.9, 0, H / 2, 0, "#2a1d0a"));
    k.add("metal", cube(FLOOR_W, 0.3, FLOOR_W, 0, 0.15, 0, "#ffc94f"), cube(FLOOR_W, 0.3, FLOOR_W, 0, H - 0.15, 0, "#ffc94f"));
    k.around((s) => {
      for (let i = 0; i < 6; i++) s.add("glass", pane(rng, 2.05, H - 0.72, -5.65 + i * 2.26, H / 2, HALF - 0.3, "#ffb44d"));
      const len = Math.hypot(FLOOR_W / 2, H - 0.5);
      const a = Math.atan2(FLOOR_W / 2, H - 0.5);
      [-3.5, 3.5].forEach((x) => {
        s.add("metal", cube(0.2, len, 0.2, x, H / 2, HALF - 0.08, "#ffd76a", 0, 0, a), cube(0.2, len, 0.2, x, H / 2, HALF - 0.08, "#ffd76a", 0, 0, -a));
      });
      s.add("metal", cube(0.3, H - 0.5, 0.3, -HALF + 0.12, H / 2, HALF - 0.12, "#ffc94f"));
    });
  },
  // Аквариум: вода во весь этаж, кораллы и настоящие плавающие рыбки
  aqua(k, rng) {
    k.add("solid", cube(FLOOR_W, 0.34, FLOOR_W, 0, 0.17, 0, "#e9d9a8"));
    k.add("metal", cube(FLOOR_W, 0.24, FLOOR_W, 0, H - 0.12, 0, "#d8e2ea"));
    k.around((s) => {
      s.add("metal", cube(0.3, H - 0.4, 0.3, -HALF + 0.15, H / 2, HALF - 0.15, "#d8e2ea"));
    });
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.5 + rng() * 4.6;
      const color = ["#ff6b8a", "#ffb02e", "#b57bff", "#ff8fc7", "#3fd1a0"][Math.floor(rng() * 5)];
      k.add("solid", plainPart(new T.ConeGeometry(0.28 + rng() * 0.3, 0.8 + rng() * 1.3, 6), color, Math.cos(a) * r, 0.84, Math.sin(a) * r));
    }
    k.add("water", cube(FLOOR_W - 0.3, H - 0.56, FLOOR_W - 0.3, 0, H / 2 - 0.02, 0, "#37b9ee"));
    for (let i = 0; i < 12; i++) {
      const body = ball(0.3, 0, 0, 0, ["#ffd23f", "#ff7a3c", "#ff5d7e", "#ffffff"][i % 4], 0.62, 1);
      body.scale(1.5, 1, 0.5);
      const tail = plainPart(new T.ConeGeometry(0.22, 0.4, 4).rotateZ(Math.PI / 2), ["#ff9a2e", "#ffd23f", "#ffffff", "#ff7a3c"][i % 4], -0.56, 0, 0);
      const fish = mergeGeometries([body, tail]);
      // Рыбке нужно только знать свою дорожку: сдвиг по кругу, радиус и высоту
      const info = new Float32Array(fish.attributes.position.count * 3);
      const phase = rng() * Math.PI * 2;
      const radius = 2.2 + rng() * 3.6;
      const y = 1.1 + rng() * 2.1;
      for (let v = 0; v < fish.attributes.position.count; v++) info.set([phase, radius * (i % 2 ? 1 : -1), y], v * 3);
      fish.setAttribute("aFish", new T.BufferAttribute(info, 3));
      k.add("fish", fish);
    }
  },
  // Радуга: окна всех цветов
  rainbow(k, rng) {
    const colors = ["#ff5d7e", "#ff9a2e", "#ffd23f", "#6fd36a", "#39c3f0", "#b57bff"];
    k.add("solid", cube(FLOOR_W - 0.3, H - 0.4, FLOOR_W - 0.3, 0, H / 2, 0, "#fbfbff"), cube(FLOOR_W, 0.26, FLOOR_W, 0, 0.13, 0, "#ffe8f3"), cube(FLOOR_W, 0.26, FLOOR_W, 0, H - 0.13, 0, "#ffe8f3"));
    k.around((s, i) => {
      for (let a = 0; a < 5; a++) {
        const x = -5.2 + a * 2.6;
        const c = colors[(a + i * 2) % colors.length];
        s.add("glass", pane(rng, 0, 0, x, H / 2, HALF - 0.12, c, new T.CircleGeometry(1.05, 24)));
        s.add("solid", plainPart(new T.TorusGeometry(1.1, 0.13, 8, 26), "#ffffff", x, H / 2, HALF - 0.1));
      }
    });
  },

  // ---------- крыши ----------
  // Шпиль: ступени и игла с огоньком
  spire(k) {
    const steps = [[12, 2.4], [9, 2.2], [6, 2]];
    let y = 0;
    steps.forEach(([w, h]) => {
      k.add("solid", cube(w, h, w, 0, y + h / 2, 0, "#c8d3de"));
      k.add("metal", cube(w + 0.3, 0.22, w + 0.3, 0, y + h - 0.1, 0, "#7f8c9a"));
      y += h;
    });
    k.add("metal", plainPart(new T.CylinderGeometry(0.1, 1.2, 15, 12), "#dfe7ef", 0, y + 7.5, 0));
    k.add("glow", ball(0.44, 0, y + 15.2, 0, "#ffffff", 1, 1));
    const c = k.parts.glow.at(-1).attributes.color;
    for (let v = 0; v < c.count; v++) c.setXYZ(v, 4, 0.5, 0.4);
  },
  // Золотой купол с флагом
  dome(k) {
    k.add("solid", plainPart(new T.CylinderGeometry(6.4, 6.8, 2, 28), "#f2eadb", 0, 1, 0));
    k.add("metal", plainPart(new T.SphereGeometry(6, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), "#ffc94f", 0, 2, 0));
    k.add("metal", plainPart(new T.CylinderGeometry(0.1, 0.16, 7, 8), "#d8e2ea", 0, 11, 0));
    k.add("solid", cube(2.8, 1.5, 0.08, 1.45, 13.5, 0, "#ff4f5e"));
  },
  // Вертолётная площадка: на неё садится вертолёт
  helipad(k) {
    k.add("solid", cube(FLOOR_W - 1, 1.6, FLOOR_W - 1, 0, 0.8, 0, "#6e7782"), plainPart(new T.CylinderGeometry(6.8, 6.8, 0.4, 32), "#3b4148", 0, 1.8, 0), plainPart(new T.TorusGeometry(5.6, 0.16, 6, 40).rotateX(Math.PI / 2), "#ffd23f", 0, 2.04, 0));
    k.add("solid", cube(0.7, 0.06, 4.2, -1.3, 2.04, 0, "#ffffff"), cube(0.7, 0.06, 4.2, 1.3, 2.04, 0, "#ffffff"), cube(2.2, 0.06, 0.7, 0, 2.04, 0, "#ffffff"));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      k.add("glow", ball(0.14, Math.cos(a) * 6.5, 2.14, Math.sin(a) * 6.5, "#ffffff", 1, 0));
      const c = k.parts.glow.at(-1).attributes.color;
      for (let v = 0; v < c.count; v++) c.setXYZ(v, 3, 2.2, 0.5);
    }
  },
  // Сад с бассейном и пальмами
  pool(k, rng) {
    k.add("solid", cube(FLOOR_W, 0.9, FLOOR_W, 0, 0.45, 0, "#efe4cf"));
    k.add("water", cube(8, 0.4, 5.6, -1.6, 0.76, 2, "#38c6f4"));
    k.add("solid", cube(8.6, 0.18, 0.4, -1.6, 0.98, 5, "#ffffff"), cube(8.6, 0.18, 0.4, -1.6, 0.98, -1, "#ffffff"), cube(0.4, 0.18, 6, -5.9, 0.98, 2, "#ffffff"), cube(0.4, 0.18, 6, 2.7, 0.98, 2, "#ffffff"));
    [[5, 4.6], [5, -4.6], [-5, -4.8], [0, -4.8]].forEach(([x, z]) => {
      k.add("solid", plainPart(new T.CylinderGeometry(0.14, 0.24, 3.6, 7), "#9a6d42", x, 2.7, z));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rng();
        k.add("plant", ball(1.05, x + Math.cos(a) * 1.05, 4.6, z + Math.sin(a) * 1.05, i % 2 ? "#4cbb4a" : "#2f9b4f", 0.22, 0));
      }
    });
    k.add("solid", cube(2, 0.1, 1, 5, 1, 0, "#ff8fc7"), cube(2, 0.1, 1, 5, 1, 1.6, "#ffd23f"));
  }
};

// Сколько высоты добавляет деталь
export const MODULES = {
  glass: { at: 0, height: H },
  brick: { at: 0, height: H },
  garden: { at: 0, height: H },
  classic: { at: 12, height: H },
  rainbow: { at: 28, height: H },
  clock: { at: 45, height: H },
  neon: { at: 65, height: H },
  gold: { at: 90, height: H },
  aqua: { at: 120, height: H },
  spire: { roof: true, height: 6.6 },
  dome: { roof: true, height: 8 },
  helipad: { roof: true, height: 2 },
  pool: { roof: true, height: 1 }
};
export const FLOOR_IDS = Object.keys(MODULES).filter((id) => !MODULES[id].roof);
export const ROOF_IDS = Object.keys(MODULES).filter((id) => MODULES[id].roof);

function brickTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#d9c7b4";
  g.fillRect(0, 0, 256, 256);
  const rng = seeded(7);
  const rows = 16;
  const bh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let i = -1; i < 8; i++) {
      const x = i * 36 + (r % 2 ? 18 : 0);
      const v = 0.82 + rng() * 0.3;
      g.fillStyle = `rgb(${172 * v},${72 * v},${50 * v})`;
      g.fillRect(x + 1.5, r * bh + 1.5, 33, bh - 3);
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class Floors {
  constructor(scene) {
    // Общие значения для всех окон и рыбок: насколько темно и докуда уже включили свет
    this.shared = { uLight: { value: 0 }, uSweep: { value: 1e5 }, uTime: { value: 0 } };
    const shared = this.shared;
    const solid = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 });
    const metal = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.82 });
    const plant = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const glow = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const brick = new T.MeshStandardMaterial({ map: brickTexture(), vertexColors: true, roughness: 0.9 });
    const water = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.52, depthWrite: false });
    const glass = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.78, envMapIntensity: 1.5 });
    glass.onBeforeCompile = (s) => {
      s.uniforms.uLight = shared.uLight;
      s.uniforms.uSweep = shared.uSweep;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aWin; attribute float iSeed; uniform float uSweep; varying float vLit;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float floorY = instanceMatrix[3][1];
          vLit = step(0.36, fract(aWin * 7.13 + iSeed * 3.37)) * smoothstep(floorY - 1.0, floorY + 1.0, uSweep);`);
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uLight; varying float vLit;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.25, 0.86, 0.42) * vLit * uLight;");
    };
    glass.customProgramCacheKey = () => "floor-glass";
    const fish = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: "#333333" });
    fish.onBeforeCompile = (s) => {
      s.uniforms.uTime = shared.uTime;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aFish; uniform float uTime;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float fa = uTime * 0.7 * sign(aFish.y) + aFish.x;
          float fc = cos(fa); float fs = sin(fa);
          float fr = abs(aFish.y);
          vec3 fp = transformed;
          fp.z += sin(uTime * 9.0 + aFish.x) * 0.2 * max(0.0, -fp.x - 0.1);
          float dir = sign(aFish.y);
          transformed = vec3(fp.x * (-fs) * dir - fp.z * fc * dir + fc * fr, fp.y + aFish.z + sin(uTime + aFish.x) * 0.2, fp.x * fc * dir - fp.z * fs * dir + fs * fr);`);
    };
    fish.customProgramCacheKey = () => "floor-fish";
    this.materials = { solid, metal, plant, glow, brick, water, glass, fish };
    this.pools = {};
    this.geo = {};
    let seed = 11;
    for (const id of Object.keys(BUILD)) {
      const kit = new Kit();
      BUILD[id](kit, seeded(seed++ * 97));
      const matrix = new T.InstancedBufferAttribute(new Float32Array(CAPACITY * 16), 16).setUsage(T.DynamicDrawUsage);
      const seeds = new T.InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(T.DynamicDrawUsage);
      const meshes = [];
      for (const key of Object.keys(kit.parts)) {
        const g = mergeGeometries(kit.parts[key]);
        if (key === "glass") g.setAttribute("iSeed", seeds);
        g.computeBoundingSphere();
        const m = new T.InstancedMesh(g, this.materials[key], CAPACITY);
        m.instanceMatrix = matrix;
        m.frustumCulled = false;
        m.count = 0;
        m.castShadow = key !== "glow" && key !== "water" && key !== "fish";
        m.receiveShadow = key === "solid" || key === "brick";
        if (key === "water") m.renderOrder = 4;
        scene.add(m);
        meshes.push(m);
      }
      this.pools[id] = { meshes, matrix, seeds, items: [] };
    }
  }

  // Запас копий кончился: столько этажей одного вида за всю игру почти не бывает, но ломаться нельзя
  full(id) {
    return this.pools[id].items.length >= CAPACITY;
  }

  add(id) {
    const pool = this.pools[id];
    const item = { id, slot: pool.items.length, matrix: new T.Matrix4() };
    pool.items.push(item);
    pool.seeds.array[item.slot] = Math.random();
    pool.seeds.needsUpdate = true;
    for (const m of pool.meshes) m.count = pool.items.length;
    return item;
  }

  remove(item) {
    const pool = this.pools[item.id];
    const last = pool.items.pop();
    if (last !== item) {
      pool.items[item.slot] = last;
      last.slot = item.slot;
      last.matrix.toArray(pool.matrix.array, last.slot * 16);
      pool.seeds.array[last.slot] = pool.seeds.array[pool.items.length];
      pool.seeds.needsUpdate = true;
    }
    pool.matrix.needsUpdate = true;
    for (const m of pool.meshes) m.count = pool.items.length;
  }

  place(item, x, y, z, rx = 0, ry = 0, rz = 0, squash = 1) {
    tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(1 + (1 - squash) * 0.3, squash, 1 + (1 - squash) * 0.3));
    item.matrix.copy(tmpM);
    const pool = this.pools[item.id];
    tmpM.toArray(pool.matrix.array, item.slot * 16);
    pool.matrix.needsUpdate = true;
  }

  // Для картинки на кнопке: показать один вид и спрятать остальные
  only(id) {
    for (const key of Object.keys(this.pools)) {
      const pool = this.pools[key];
      for (const m of pool.meshes) m.visible = !id || key === id;
    }
  }
}
