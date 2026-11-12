// Модели «Виража»: игрушечные машинки и декорации. Каждая деталь — простая фигура,
// детали склеиваются в одну геометрию с цветами в вершинах, чтобы рисоваться одним вызовом.
import * as T from "../vendor/three/three.module.min.js?v=81afe732";
import { RoundedBoxGeometry } from "../vendor/three/RoundedBoxGeometry.js?v=81afe732";

const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), S = new T.Vector3(), P = new T.Vector3();
const C = new T.Color();

// parts: [геометрия, цвет, [x,y,z], [rx,ry,rz], масштаб]
export function fuse(parts) {
  const pos = [], nor = [], col = [];
  for (const [geo, color, p = [0, 0, 0], r = [0, 0, 0], s = 1] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const sc = typeof s === "number" ? [s, s, s] : s;
    g.applyMatrix4(M.compose(P.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(r[0], r[1], r[2])), S.set(sc[0], sc[1], sc[2])));
    const gp = g.attributes.position.array, gn = g.attributes.normal.array;
    C.set(color);
    for (let i = 0; i < gp.length; i += 3) {
      pos.push(gp[i], gp[i + 1], gp[i + 2]);
      nor.push(gn[i], gn[i + 1], gn[i + 2]);
      col.push(C.r, C.g, C.b);
    }
    g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  return out;
}

const rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
const box = (w, h, d) => new T.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 8) => new T.CylinderGeometry(r0, r1, h, n);
const cone = (r, h, n = 6) => new T.ConeGeometry(r, h, n);
const ico = (r, d = 0) => new T.IcosahedronGeometry(r, d);

const shade = (hex, k) => "#" + new T.Color(hex).multiplyScalar(k).getHexString();
const tint = (hex, to, k) => "#" + new T.Color(hex).lerp(new T.Color(to), k).getHexString();

export function canvasTexture(w, h, draw, repeat = false) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

let blob = null;
function blobTexture() {
  blob ||= canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    grad.addColorStop(0, "rgba(0,0,0,.62)");
    grad.addColorStop(0.6, "rgba(0,0,0,.4)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
  return blob;
}

let beam = null;
function beamTexture() {
  beam ||= canvasTexture(64, 128, (g) => {
    // два пятна света, расходящиеся от фар (низ картинки — у бампера)
    for (const x of [22, 42]) {
      const grad = g.createRadialGradient(x, 128, 2, x, 70, 70);
      grad.addColorStop(0, "rgba(255,244,200,.9)");
      grad.addColorStop(0.5, "rgba(255,244,200,.3)");
      grad.addColorStop(1, "rgba(255,244,200,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 128);
    }
  });
  return beam;
}

const wheelGeo = (() => {
  let g = null;
  return () =>
    (g ||= fuse([
      [cyl(0.52, 0.52, 0.46, 14), "#23262e", [0, 0, 0], [0, 0, Math.PI / 2]],
      [cyl(0.3, 0.3, 0.5, 10), "#e9edf2", [0, 0, 0], [0, 0, Math.PI / 2]],
      [box(0.52, 0.12, 0.12), "#7b8494", [0, 0, 0]],
      [box(0.52, 0.12, 0.12), "#7b8494", [0, 0, 0], [Math.PI / 2, 0, 0]],
    ]));
})();

// Машинка смотрит в +z. Возвращает группу и части, которые двигаются отдельно.
export function makeCar(color, number, night = false) {
  const dark = shade(color, 0.58), lite = tint(color, "#ffffff", 0.35);
  const glass = "#16233d", black = "#262a33";
  const parts = [
    [rb(2.1, 0.62, 4.3, 0.28), color, [0, 0.66, 0]],
    [rb(1.86, 0.3, 1.5, 0.14), color, [0, 0.98, 1.22], [0.09, 0, 0]],
    [rb(1.74, 0.7, 2.05, 0.32), lite, [0, 1.22, -0.38]],
    [rb(1.46, 0.4, 0.12, 0.05), glass, [0, 1.3, 0.62], [-0.42, 0, 0]],
    [rb(1.46, 0.36, 0.12, 0.05), glass, [0, 1.3, -1.39], [0.36, 0, 0]],
    [rb(0.1, 0.34, 1.34, 0.04), glass, [0.84, 1.3, -0.38]],
    [rb(0.1, 0.34, 1.34, 0.04), glass, [-0.84, 1.3, -0.38]],
    [box(0.5, 0.03, 1.36), "#ffffff", [0, 1.135, 1.3], [0.09, 0, 0]],
    [box(0.5, 0.03, 1.5), "#ffffff", [0, 1.575, -0.38]],
    [rb(2.2, 0.26, 0.5, 0.1), black, [0, 0.46, 2.0]],
    [rb(2.2, 0.26, 0.42, 0.1), black, [0, 0.46, -2.05]],
    [rb(2.2, 0.1, 0.66, 0.04), dark, [0, 1.56, -2.02]],
    [box(0.12, 0.5, 0.3), dark, [0.72, 1.3, -1.98]],
    [box(0.12, 0.5, 0.3), dark, [-0.72, 1.3, -1.98]],
    [rb(0.5, 0.2, 0.12, 0.05), "#fff3b8", [0.66, 0.8, 2.13]],
    [rb(0.5, 0.2, 0.12, 0.05), "#fff3b8", [-0.66, 0.8, 2.13]],
    [cyl(0.13, 0.13, 0.3, 8), "#8b93a3", [0.5, 0.42, -2.25], [Math.PI / 2, 0, 0]],
    [cyl(0.13, 0.13, 0.3, 8), "#8b93a3", [-0.5, 0.42, -2.25], [Math.PI / 2, 0, 0]],
  ];
  const group = new T.Group();
  const lean = new T.Group(); // кузов наклоняется отдельно от колёс
  group.add(lean);
  const body = new T.Mesh(fuse(parts), new T.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: "#666666" }));
  lean.add(body);
  // номер на крыше
  const plate = new T.Mesh(
    new T.PlaneGeometry(0.9, 0.9),
    new T.MeshBasicMaterial({
      transparent: true,
      map: canvasTexture(64, 64, (g) => {
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(32, 32, 30, 0, 7);
        g.fill();
        g.fillStyle = "#1c2233";
        g.font = "900 44px ui-rounded, 'Arial Rounded MT Bold', Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(number), 32, 35);
      }),
    }),
  );
  plate.rotation.set(-Math.PI / 2, 0, Math.PI);
  plate.position.set(0, 1.6, -0.38);
  lean.add(plate);
  // стоп-сигналы: ярче при торможении
  const tailMat = new T.MeshBasicMaterial({ color: "#a01616" });
  const tail = new T.Mesh(fuse([[rb(0.52, 0.18, 0.1, 0.04), "#ffffff", [0.68, 0.84, -2.15]], [rb(0.52, 0.18, 0.1, 0.04), "#ffffff", [-0.68, 0.84, -2.15]]]), tailMat);
  tail.material.vertexColors = false;
  lean.add(tail);
  const wheels = [];
  for (const [x, z] of [[1.02, 1.32], [-1.02, 1.32], [1.02, -1.3], [-1.02, -1.3]]) {
    const pivot = new T.Group();
    pivot.position.set(x, 0.52, z);
    const w = new T.Mesh(wheelGeo(), new T.MeshLambertMaterial({ vertexColors: true }));
    pivot.add(w);
    group.add(pivot);
    wheels.push({ pivot, mesh: w, front: z > 0 });
  }
  // пламя нитро
  const flameMat = new T.MeshBasicMaterial({ color: "#7fe9ff", transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const x of [0.5, -0.5]) {
    const f = new T.Mesh(cone(0.24, 1.9, 8), flameMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, 0.42, -3.3);
    f.visible = false;
    lean.add(f);
    flames.push(f);
  }
  if (night) {
    // ночью фары освещают асфальт перед машиной
    const beam = new T.Mesh(
      new T.PlaneGeometry(5.5, 11),
      new T.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 0.07, 7.4);
    beam.renderOrder = 3;
    group.add(beam);
  }
  const shadow = new T.Mesh(new T.PlaneGeometry(3.6, 6), new T.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;
  return { group, lean, body, wheels, tailMat, flames, flameMat, shadow };
}

// ---------- Декорации (все стоят на y = 0, размер — «как в жизни») ----------
export const PROPS = {
  palm() {
    const parts = [
      [cyl(0.2, 0.3, 2.2, 6), "#b08556", [0, 1.1, 0], [0, 0, 0.1]],
      [cyl(0.16, 0.2, 2.2, 6), "#a67a4c", [-0.3, 3.1, 0], [0, 0, 0.2]],
      [cyl(0.13, 0.16, 2.0, 6), "#9c7044", [-0.75, 4.9, 0], [0, 0, 0.26]],
      [ico(0.24), "#6b4a2a", [-0.85, 5.75, 0.2]],
      [ico(0.24), "#6b4a2a", [-1.15, 5.75, -0.15]],
    ];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, tilt = -(Math.PI / 2 + 0.28 + (k % 2) * 0.22);
      const dx = Math.sin(-tilt) * Math.cos(a), dy = Math.cos(tilt), dz = -Math.sin(-tilt) * Math.sin(a);
      parts.push([cone(0.55, 3.4, 4), k % 2 ? "#3fb061" : "#58c66d", [-1.0 + dx * 1.7, 6.0 + dy * 1.7, dz * 1.7], [0, a, tilt], [1, 1, 0.22]]);
    }
    return fuse(parts);
  },
  pine() {
    return fuse([
      [cyl(0.24, 0.32, 1.4, 6), "#7a5236", [0, 0.7, 0]],
      [cone(1.9, 2.6, 7), "#2f7d4a", [0, 2.3, 0]],
      [cone(1.5, 2.3, 7), "#39905a", [0, 3.7, 0]],
      [cone(1.05, 2.1, 7), "#45a368", [0, 5.0, 0]],
    ]);
  },
  tree() {
    return fuse([
      [cyl(0.22, 0.3, 1.8, 6), "#8a5c3a", [0, 0.9, 0]],
      [ico(1.7), "#55b85a", [0, 3.0, 0]],
      [ico(1.2), "#6cc763", [0.9, 3.7, 0.3]],
      [ico(1.0), "#49a852", [-0.8, 2.6, -0.5]],
    ]);
  },
  rock() {
    return fuse([[ico(1), "#ffffff", [0, 0.45, 0], [0.3, 0.5, 0], [1.4, 0.85, 1.1]], [ico(0.6), "#e8e8e8", [1.0, 0.25, 0.5], [1, 0.2, 0.4]]]);
  },
  cactus() {
    return fuse([
      [cyl(0.36, 0.4, 3.2, 7), "#3f9b56", [0, 1.6, 0]],
      [ico(0.37), "#3f9b56", [0, 3.2, 0]],
      [cyl(0.24, 0.24, 1.0, 6), "#48a85f", [0.6, 1.7, 0], [0, 0, Math.PI / 2]],
      [cyl(0.24, 0.24, 1.3, 6), "#48a85f", [1.05, 2.3, 0]],
      [cyl(0.22, 0.22, 0.8, 6), "#48a85f", [-0.55, 2.2, 0], [0, 0, Math.PI / 2]],
      [cyl(0.22, 0.22, 0.9, 6), "#48a85f", [-0.9, 2.6, 0]],
      [ico(0.16), "#ff7fb0", [0, 3.6, 0]],
    ]);
  },
  // столовая гора: единичного размера, растягивается при расстановке
  mesa() {
    return fuse([
      [cyl(0.84, 1, 0.42, 8), "#b9552f", [0, 0.21, 0]],
      [cyl(0.78, 0.84, 0.08, 8), "#e8b06a", [0, 0.46, 0]],
      [cyl(0.7, 0.78, 0.3, 8), "#cf6c3a", [0, 0.65, 0]],
      [cyl(0.66, 0.7, 0.06, 8), "#f0c27c", [0, 0.83, 0]],
      [cyl(0.6, 0.66, 0.14, 8), "#d97b42", [0, 0.93, 0]],
    ]);
  },
  bush() {
    return fuse([[ico(0.9), "#ffffff", [0, 0.5, 0], [0, 0, 0], [1.2, 0.8, 1]], [ico(0.6), "#eeeeee", [0.8, 0.4, 0.3]]]);
  },
  umbrella() {
    return fuse([
      [cyl(0.06, 0.06, 2.4, 5), "#f4f4f4", [0, 1.2, 0]],
      [cone(1.7, 0.7, 8), "#ffffff", [0, 2.5, 0]],
      [box(1.9, 0.12, 0.7), "#f6e3b0", [0.2, 0.2, 0.9], [0, 0.4, 0]],
    ]);
  },
  boat() {
    return fuse([
      [box(1.6, 0.8, 4.2), "#ffffff", [0, 0.3, 0]],
      [cone(0.8, 1.6, 4), "#ffffff", [0, 0.3, 2.85], [Math.PI / 2, Math.PI / 4, 0], [1, 1, 0.72]],
      [cyl(0.07, 0.07, 5.2, 5), "#7a5236", [0, 3.1, 0.2]],
      [cone(1.9, 4.4, 3), "#fff7e0", [0, 3.3, -0.75], [0, Math.PI / 2, 0], [1, 1, 0.06]],
      [cone(1.2, 3.2, 3), "#ff7b5a", [0, 2.8, 1.1], [0, -Math.PI / 2, 0], [1, 1, 0.06]],
    ]);
  },
  hut() {
    return fuse([
      [box(3.2, 2.3, 3.2), "#ffffff", [0, 1.15, 0]],
      [cone(2.9, 1.6, 4), "#e2574c", [0, 3.1, 0], [0, Math.PI / 4, 0]],
      [box(0.9, 1.5, 0.1), "#6d4b33", [0, 0.75, 1.62]],
      [box(0.8, 0.7, 0.1), "#9fd8ff", [1.0, 1.4, 1.62]],
    ]);
  },
  balloon() {
    const parts = [[ico(3, 1), "#ffffff", [0, 7, 0], [0, 0, 0], [1, 1.15, 1]], [cone(2.1, 2.6, 8), "#ffffff", [0, 3.6, 0], [Math.PI, 0, 0]], [box(1.1, 0.9, 1.1), "#9a6b3f", [0, 0.9, 0]]];
    for (const [x, z] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) parts.push([cyl(0.03, 0.03, 1.6, 4), "#5b4630", [x, 2.1, z]]);
    return fuse(parts);
  },
  stand() {
    const parts = [];
    const crowd = ["#ff5a4d", "#ffd23e", "#4fb4ff", "#ffffff", "#66d98a", "#ff8fd0"];
    for (let r = 0; r < 4; r++) {
      parts.push([box(22, 1, 2.2), r % 2 ? "#d7dde8" : "#eef2f8", [0, 0.5 + r, -r * 2.2]]);
      for (let k = 0; k < 19; k++) if ((k * 7 + r * 3) % 5) parts.push([rb(0.7, 0.95, 0.6, 0.2), crowd[(k * 5 + r * 3) % crowd.length], [-9.9 + k * 1.1, 1.45 + r, -r * 2.2]]);
    }
    parts.push([box(22.6, 0.3, 10), "#ff5a4d", [0, 7.3, -3.2], [0.12, 0, 0]]);
    for (const x of [-11, 11]) parts.push([box(0.4, 7.6, 0.4), "#c9d0dc", [x, 3.8, -7.6]], [box(0.4, 7.0, 0.4), "#c9d0dc", [x, 3.5, 1.2]]);
    return fuse(parts);
  },
  lamp() {
    return fuse([[cyl(0.12, 0.17, 7.4, 6), "#3a4160", [0, 3.7, 0]], [box(0.16, 0.16, 2.6), "#3a4160", [0, 7.3, 1.2]], [box(0.5, 0.18, 0.9), "#565f86", [0, 7.24, 2.3]]]);
  },
  bulb() {
    return fuse([[box(0.42, 0.1, 0.8), "#ffffff", [0, 7.12, 2.3]]]);
  },
  lighthouse() {
    return fuse([
      [cyl(2.8, 3.6, 3, 10), "#f4f1e6", [0, 1.5, 0]],
      [cyl(2.3, 2.8, 4, 10), "#ff5a4d", [0, 5, 0]],
      [cyl(1.9, 2.3, 4, 10), "#f4f1e6", [0, 9, 0]],
      [cyl(1.6, 1.9, 4, 10), "#ff5a4d", [0, 13, 0]],
      [cyl(2.3, 2.3, 0.4, 10), "#39415a", [0, 15.2, 0]],
      [cyl(1.3, 1.3, 2, 8), "#fff3a8", [0, 16.4, 0]],
      [cone(1.9, 1.8, 10), "#39415a", [0, 18.3, 0]],
    ]);
  },
  can() {
    return fuse([
      [cyl(0.55, 0.55, 1.25, 10), "#27c3ff", [0, 0, 0]],
      [cyl(0.57, 0.57, 0.28, 10), "#ffffff", [0, 0, 0]],
      [cyl(0.4, 0.55, 0.22, 10), "#1a8fd0", [0, 0.73, 0]],
      [cyl(0.18, 0.18, 0.26, 8), "#ffd23e", [0, 0.94, 0]],
      [cyl(0.55, 0.45, 0.14, 10), "#1a8fd0", [0, -0.69, 0]],
    ]);
  },
  cloud() {
    return fuse([[ico(1, 1), "#ffffff", [0, 0, 0], [0, 0, 0], [1.6, 0.8, 1.1]], [ico(0.8, 1), "#ffffff", [1.3, -0.1, 0.2]], [ico(0.7, 1), "#ffffff", [-1.3, -0.15, -0.1]], [ico(0.6, 1), "#ffffff", [0.4, 0.5, -0.3]]]);
  },
};

// Блок пьедестала с цифрой места
export function makePodiumBlock(place, height) {
  const colors = ["#ffcf3a", "#cfd6e2", "#e19a62"];
  const group = new T.Group();
  const block = new T.Mesh(rb(4.2, height, 6.4, 0.25), new T.MeshLambertMaterial({ color: "#f3f5fa" }));
  block.position.y = height / 2;
  const face = new T.Mesh(
    new T.PlaneGeometry(2.6, Math.min(2.2, height * 0.8)),
    new T.MeshBasicMaterial({
      transparent: true,
      map: canvasTexture(128, 128, (g) => {
        g.fillStyle = colors[place - 1];
        g.beginPath();
        g.arc(64, 64, 58, 0, 7);
        g.fill();
        g.fillStyle = "#232838";
        g.font = "900 84px ui-rounded, 'Arial Rounded MT Bold', Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(place), 64, 70);
      }),
    }),
  );
  face.scale.x = Math.min(2.2, height * 0.8) / 2.6;
  face.position.set(0, height / 2, 3.22);
  group.add(block, face);
  return group;
}
