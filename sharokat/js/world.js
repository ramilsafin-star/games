// Всё, что видно вокруг шара: небо, острова, облака, арки, препятствия, кристаллы, шар и эффекты
import * as T from "../vendor/three/three.module.min.js?v=8580e2bc";
import { HALF, rng } from "./track.js?v=8580e2bc";

const pie = Math.PI;
export const R = 0.6; // радиус шара
const candy = ["#ff4f7b", "#ffc93c", "#2fd0a6", "#4aa3ff", "#b06cff", "#ff8a3d"];
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Поставить объект в кадр трассы: x — вбок, y — вверх, z — вперёд
export function place(obj, fr, x = 0, y = 0, z = 0) {
  obj.position.copy(fr.p).addScaledVector(fr.r, x).addScaledVector(fr.u, y).addScaledVector(fr.f, z);
  const m = new T.Matrix4().makeBasis(fr.r, fr.u, fr.f.clone().negate());
  obj.quaternion.setFromRotationMatrix(m);
  return obj;
}

// ---------- Небо: купол с градиентом темы, солнце или луна, звёзды ночью ----------
export function sky(scene) {
  const geo = new T.SphereGeometry(700, 32, 20);
  geo.setAttribute("color", new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  const dome = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -1;
  scene.add(dome);
  const sun = new T.Mesh(new T.SphereGeometry(30, 24, 16), new T.MeshBasicMaterial({ color: "#fff3b0", fog: false }));
  sun.position.set(-260, 260, -420);
  dome.add(sun);
  // Звёзды: точки на куполе, видны только в ночных темах
  const starPos = [];
  const r = rng(11);
  for (let i = 0; i < 900; i++) {
    const v = new T.Vector3(r() * 2 - 1, r() * 1.1 - 0.1, r() * 2 - 1).normalize().multiplyScalar(650);
    starPos.push(v.x, v.y, v.z);
  }
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute("position", new T.Float32BufferAttribute(starPos, 3));
  const stars = new T.Points(starGeo, new T.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, fog: false }));
  dome.add(stars);
  return {
    dome,
    setTheme(theme) {
      const pos = geo.attributes.position,
        col = geo.attributes.color,
        c = new T.Color(),
        stops = theme.sky;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 700;
        let k = 0;
        while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
        const [y0, c0] = stops[k],
          [y1, c1] = stops[k + 1];
        c.set(c0).lerp(new T.Color(c1), Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
      stars.visible = !!theme.stars;
      // Ночью вместо солнца — бледная луна
      sun.material.color.set(theme.stars ? "#e8ecff" : theme.id === "lava" ? "#ffcf6b" : "#fff3b0");
      sun.scale.setScalar(theme.stars ? 0.7 : 1);
    },
    follow(p) {
      dome.position.copy(p);
    },
  };
}

// ---------- Пейзаж вокруг трассы: острова, деревья, облака, шары, радуги или планеты ----------
export function scenery(scene, track, theme) {
  const rand = rng(77 + track.level * 13);
  const group = new T.Group();
  scene.add(group);
  const islands = [],
    clouds = [],
    balloons = [];
  const free = (p, gap) => track.samples.every((a, i) => i % 6 || a.p.distanceToSquared(p) > gap * gap);
  for (let s = 10; s < track.length; s += 16 + rand() * 12) {
    const fr = track.at(s),
      side = rand() < 0.5 ? -1 : 1;
    const p = fr.p.clone().add(new T.Vector3(fr.r.x, 0, fr.r.z).normalize().multiplyScalar(side * (11 + rand() * 24)));
    p.y -= 5 + rand() * 16;
    if (free(p, 11)) islands.push({ p, size: 4 + rand() * 6, hue: rand() });
    const q = fr.p.clone().add(new T.Vector3((rand() - 0.5) * 110, -14 + rand() * 34, (rand() - 0.5) * 110));
    if (free(q, 14)) clouds.push({ p: q, size: 3 + rand() * 6 });
    if (rand() < 0.35) {
      const b = fr.p.clone().add(new T.Vector3((rand() - 0.5) * 60, 6 + rand() * 18, (rand() - 0.5) * 60));
      if (free(b, 8)) balloons.push({ p: b, c: candy[Math.floor(rand() * candy.length)], phase: rand() * 6 });
    }
  }
  const m = new T.Matrix4(),
    q = new T.Quaternion(),
    sc = new T.Vector3(),
    color = new T.Color();
  // Острова: каменный конус снизу, шапка травы (или снега, или карамели) и деревья
  const rock = new T.InstancedMesh(new T.ConeGeometry(1, 1.6, 7).rotateX(pie), new T.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), islands.length);
  const grass = new T.InstancedMesh(new T.CylinderGeometry(1.05, 1, 0.35, 16), new T.MeshStandardMaterial({ roughness: 0.6 }), islands.length);
  const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.12, 0.16, 1, 6), new T.MeshStandardMaterial({ color: "#a3704a" }), islands.length * 3);
  // У ёлок на льду крона — конус, у ночных тем кроны светятся
  const crownGeo = theme.pines ? new T.ConeGeometry(0.9, 2, 9) : new T.SphereGeometry(1, 14, 10);
  const crownMat = theme.glowCrowns ? new T.MeshBasicMaterial() : new T.MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 0.5 });
  const crowns = new T.InstancedMesh(crownGeo, crownMat, islands.length * 3);
  islands.forEach((it, i) => {
    sc.set(it.size, it.size, it.size);
    m.compose(it.p.clone().add(new T.Vector3(0, -it.size * 0.8, 0)), q.identity(), sc);
    rock.setMatrixAt(i, m);
    rock.setColorAt(i, theme.rock(it.hue));
    m.compose(it.p, q, sc.set(it.size, it.size * 0.6, it.size));
    grass.setMatrixAt(i, m);
    grass.setColorAt(i, theme.grass(it.hue));
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + it.hue * 6,
        d = it.size * 0.5,
        tp = it.p.clone().add(new T.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d)),
        h = 1.4 + ((k + it.hue * 3) % 1) * 1.6;
      m.compose(tp.clone().add(new T.Vector3(0, h / 2, 0)), q, sc.set(1, h, 1));
      trunks.setMatrixAt(i * 3 + k, m);
      m.compose(tp.clone().add(new T.Vector3(0, h + 0.6, 0)), q, sc.setScalar(0.9 + (k % 2) * 0.3));
      crowns.setMatrixAt(i * 3 + k, m);
      crowns.setColorAt(i * 3 + k, color.set(theme.crowns[(i + k) % theme.crowns.length]));
    }
  });
  group.add(rock, grass, trunks, crowns);
  // Облака: несколько шаров в кучке, цвет по теме (у вулкана — дым)
  const puffs = new T.InstancedMesh(new T.SphereGeometry(1, 14, 10), new T.MeshStandardMaterial({ color: theme.cloud, roughness: 1 }), clouds.length * 4);
  clouds.forEach((c, i) => {
    for (let k = 0; k < 4; k++) {
      m.compose(
        c.p.clone().add(new T.Vector3((k - 1.5) * c.size * 0.6, (k % 2) * c.size * 0.25, (k % 3) * 0.6)),
        q.identity(),
        sc.set(c.size * (0.7 + (k % 2) * 0.3), c.size * 0.55, c.size * 0.6),
      );
      puffs.setMatrixAt(i * 4 + k, m);
    }
  });
  group.add(puffs);
  // Воздушные шары (ночью — светящиеся фонарики)
  const balls = new T.InstancedMesh(
    new T.SphereGeometry(1.6, 18, 14),
    theme.stars ? new T.MeshBasicMaterial() : new T.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1 }),
    balloons.length,
  );
  const baskets = new T.InstancedMesh(new T.BoxGeometry(0.7, 0.5, 0.7), new T.MeshStandardMaterial({ color: "#b8814f" }), balloons.length);
  balloons.forEach((b, i) => {
    m.compose(b.p, q.identity(), sc.set(1, 1.2, 1));
    balls.setMatrixAt(i, m);
    balls.setColorAt(i, color.set(b.c));
    m.compose(b.p.clone().add(new T.Vector3(0, -2.6, 0)), q, sc.set(1, 1, 1));
    baskets.setMatrixAt(i, m);
  });
  group.add(balls, baskets);
  if (theme.decor === "rainbow") {
    // Две радуги вдали
    const bands = ["#ff5c7a", "#ff9e4a", "#ffd84a", "#5ed69a", "#58b4ff", "#a67cff"];
    for (const [s, side] of [
      [track.length * 0.3, 1],
      [track.length * 0.75, -1],
    ]) {
      const fr = track.at(s);
      const center = fr.p.clone().add(new T.Vector3(fr.r.x, 0, fr.r.z).normalize().multiplyScalar(side * 90));
      center.y -= 30;
      bands.forEach((c, i) => {
        const arc = new T.Mesh(new T.TorusGeometry(60 - i * 2.4, 1.2, 8, 60, pie), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75 }));
        arc.position.copy(center);
        arc.lookAt(fr.p.x, center.y, fr.p.z);
        group.add(arc);
      });
    }
  } else if (theme.decor === "planets") {
    // Планеты с кольцами в ночном небе
    const planets = [
      ["#ff8ff0", "#ffd36b", 26],
      ["#2ff3ff", "#b47cff", 18],
      ["#ffb36b", "#ffffff", 12],
    ];
    planets.forEach(([body, ringColor, size], i) => {
      const fr = track.at(track.length * (0.2 + i * 0.3));
      const p = fr.p.clone().add(new T.Vector3((i % 2 ? 1 : -1) * 140, 40 + i * 20, -60));
      const ball = new T.Mesh(new T.SphereGeometry(size, 32, 20), new T.MeshStandardMaterial({ color: body, emissive: body, emissiveIntensity: 0.35, fog: false }));
      const ring = new T.Mesh(new T.TorusGeometry(size * 1.6, size * 0.12, 8, 60), new T.MeshBasicMaterial({ color: ringColor, fog: false }));
      ring.rotation.x = 1.2;
      ball.add(ring);
      ball.position.copy(p);
      group.add(ball);
    });
  }
  group.traverse((o) => {
    if (o.isInstancedMesh && o.instanceColor) o.instanceColor.needsUpdate = true;
  });
  return { group, balls, balloons };
}

// ---------- Опоры горок, море облаков (или лавы) внизу, кольца в полёте ----------
export function supports(scene, track, theme) {
  const legs = [];
  let low = Infinity;
  for (const a of track.samples) low = Math.min(low, a.p.y);
  // Над водой трасса ниже, чтобы волны и блики было видно
  const floor = low - (theme.water ? 20 : 34);
  for (let i = 0; i < track.samples.length; i += 14) {
    const a = track.samples[i];
    // Опоры только под дорожкой, которая лежит «нормально» (не в петле, не в трубе, не в прыжке)
    if (a.air || a.gaps || a.u.y < 0.8 || a.kind === "loop") continue;
    for (const side of [-1, 1]) legs.push([a.p.clone().addScaledVector(a.r, side * (a.half * 0.7)).addScaledVector(a.u, -0.4), a.hue]);
  }
  const mesh = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.24, 1, 8), new T.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.8 }), legs.length);
  const m = new T.Matrix4(),
    q = new T.Quaternion(),
    sc = new T.Vector3();
  legs.forEach(([top, hue], i) => {
    const h = top.y - floor;
    m.compose(new T.Vector3(top.x, floor + h / 2, top.z), q, sc.set(1, h, 1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, theme.leg(hue));
  });
  scene.add(mesh);
  const c = track.samples[Math.floor(track.samples.length / 2)].p;
  let water = null;
  if (theme.water) water = ocean(scene, c, floor + 2, theme);
  else {
    const sea = new T.Mesh(new T.CircleGeometry(900, 48), new T.MeshBasicMaterial({ color: theme.sea }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(c.x, floor + 2, c.z);
    scene.add(sea);
  }
  if (theme.decor === "city") towers(scene, track, floor + 2);
  const rand = rng(31 + track.level);
  // Над водой — редкие клочки тумана, без воды — плотное море облаков
  const n = theme.water ? 50 : 260;
  const puffs = new T.InstancedMesh(new T.SphereGeometry(1, 12, 8), new T.MeshStandardMaterial({ color: theme.cloud, roughness: 1 }), n);
  for (let i = 0; i < n; i++) {
    const a = track.samples[Math.floor(rand() * track.samples.length)].p;
    const r = (theme.water ? 3 : 6) + rand() * (theme.water ? 6 : 12);
    m.compose(new T.Vector3(a.x + (rand() - 0.5) * 160, floor + 2 + r * (theme.water ? 0.6 : 0.25), a.z + (rand() - 0.5) * 160), q, sc.set(r * 1.4, r * 0.55, r));
    puffs.setMatrixAt(i, m);
  }
  scene.add(puffs);
  // Радужные кольца над катапультой: шар пролетает сквозь них
  const bands = ["#ff4f7b", "#ffc93c", "#2fd0a6", "#4aa3ff", "#b06cff"];
  for (const s of track.rings) {
    const fr = track.at(s),
      ring = new T.Group();
    bands.forEach((color, i) => ring.add(new T.Mesh(new T.TorusGeometry(2.4 + i * 0.22, 0.1, 8, 40), new T.MeshBasicMaterial({ color }))));
    place(ring, fr, 0, R + 0.4, 0);
    scene.add(ring);
  }
  return { floor, water };
}

// ---------- Океан: волны, блики солнца, отражение неба (у вулкана — светящаяся лава) ----------
function ocean(scene, center, y, theme) {
  const w = theme.water;
  const uniforms = T.UniformsUtils.merge([
    T.UniformsLib.fog,
    {
      time: { value: 0 },
      deep: { value: new T.Color(w.deep) },
      shallow: { value: new T.Color(w.shallow) },
      skyTint: { value: new T.Color(w.sky) },
      sunTint: { value: new T.Color(w.sun) },
      sunDir: { value: new T.Vector3(-0.45, 0.55, -0.7).normalize() },
      glow: { value: w.glow || 0 },
    },
  ]);
  const material = new T.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time;
      uniform vec3 deep, shallow, skyTint, sunTint, sunDir;
      uniform float glow;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      // Высота волн — сумма бегущих синусоид в разных направлениях
      float wave(vec2 p) {
        float h = 0.0;
        h += sin(dot(p, vec2(0.12, 0.05)) + time * 1.1) * 0.5;
        h += sin(dot(p, vec2(-0.07, 0.15)) + time * 1.4) * 0.35;
        h += sin(dot(p, vec2(0.31, -0.22)) + time * 2.2) * 0.15;
        h += sin(dot(p, vec2(-0.52, -0.41)) + time * 3.1) * 0.08;
        h += sin(dot(p, vec2(0.9, 0.7)) + time * 4.0) * 0.04;
        return h;
      }
      void main() {
        vec2 p = vWorld.xz;
        float e = 0.6;
        float h = wave(p);
        vec3 n = normalize(vec3(wave(p - vec2(e, 0.0)) - wave(p + vec2(e, 0.0)), 2.2, wave(p - vec2(0.0, e)) - wave(p + vec2(0.0, e))));
        vec3 view = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
        vec3 col = mix(deep, shallow, smoothstep(-0.8, 0.9, h));
        col = mix(col, skyTint, fresnel * 0.7);
        // Солнечные блики и пена на гребнях
        float spec = pow(max(dot(reflect(-view, n), sunDir), 0.0), 140.0);
        col += sunTint * spec * 2.2;
        col += vec3(1.0) * smoothstep(0.78, 1.0, h) * 0.22;
        col *= 1.0 + glow * (0.6 + 0.4 * sin(time * 1.3 + h * 2.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(2400, 2400), material);
  mesh.rotation.x = -pie / 2;
  mesh.position.set(center.x, y, center.z);
  scene.add(mesh);
  return { update: (t) => (uniforms.time.value = t) };
}
// ---------- Город будущего: башни со светящимися окнами вокруг трассы ----------
function towers(scene, track, ground) {
  const windows = canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 10)
      for (let x = 4; x < 64; x += 10) {
        const lit = ((x * 7 + y * 13) % 5) < 3;
        ctx.fillStyle = lit ? ["#ffe08a", "#3fd6ff", "#ff8fd0"][(x + y) % 3] : "#1a1a33";
        ctx.fillRect(x, y, 6, 6);
      }
  });
  windows.wrapS = windows.wrapT = T.RepeatWrapping;
  const rand = rng(97 + track.level);
  const spots = [];
  for (let s = 0; s < track.length; s += 9) {
    const fr = track.at(s);
    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const p = fr.p.clone().add(new T.Vector3(fr.r.x, 0, fr.r.z).normalize().multiplyScalar(side * (14 + rand() * 50)));
      if (track.samples.some((a, i) => i % 4 === 0 && Math.hypot(a.p.x - p.x, a.p.z - p.z) < 9)) continue;
      const top = fr.p.y - 4 + rand() * 30;
      spots.push({ p, top, w: 4 + rand() * 6, d: 4 + rand() * 6 });
    }
  }
  const look = new T.MeshStandardMaterial({ map: windows, emissiveMap: windows, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5, color: "#5a5f8a" });
  const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), look, spots.length);
  const cap = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: "#ff6fb0" }), spots.length);
  const m = new T.Matrix4(),
    q = new T.Quaternion(),
    sc = new T.Vector3();
  spots.forEach((t, i) => {
    const h = t.top - ground;
    m.compose(new T.Vector3(t.p.x, ground + h / 2, t.p.z), q, sc.set(t.w, h, t.d));
    mesh.setMatrixAt(i, m);
    // Светящаяся крыша-полоска
    m.compose(new T.Vector3(t.p.x, t.top + 0.2, t.p.z), q, sc.set(t.w * 1.02, 0.4, t.d * 1.02));
    cap.setMatrixAt(i, m);
    cap.setColorAt(i, new T.Color(candy[i % candy.length]));
  });
  if (cap.instanceColor) cap.instanceColor.needsUpdate = true;
  scene.add(mesh, cap);
}

// ---------- Батуты ----------
export function trampolines(scene, track) {
  return track.pads.map((pad) => {
    const fr = track.at(pad.s),
      g = new T.Group();
    place(g, fr);
    const base = new T.Mesh(new T.BoxGeometry(2 * HALF + 0.2, 0.25, 2.2), glossy("#2a2a44"));
    base.position.y = 0.1;
    const top = new T.Mesh(new T.BoxGeometry(2 * HALF - 0.1, 0.12, 1.9), glossy("#ff4f8e", 0.35));
    top.position.y = 0.3;
    g.add(base, top);
    // Стрелки вверх на полотне батута
    for (const x of [-1.2, 0, 1.2]) {
      const arrow = new T.Mesh(new T.ConeGeometry(0.28, 0.35, 3), new T.MeshBasicMaterial({ color: "#ffffff" }));
      arrow.position.set(x, 0.42, 0);
      arrow.rotation.x = -pie / 2;
      g.add(arrow);
    }
    scene.add(g);
    pad.bounceAt = -9;
    pad.update = (t) => {
      const k = Math.max(0, 1 - (t - pad.bounceAt) / 0.35);
      top.position.y = 0.3 - Math.sin(k * pie) * 0.18;
      top.scale.set(1, 1 + k * 1.5, 1);
    };
    return pad;
  });
}

// ---------- Арки: чекпойнты и финиш ----------
export function gates(scene, track) {
  const list = [];
  for (const g of track.gates) {
    const fr = track.at(g.s),
      arch = new T.Group();
    const big = g.kind === "finish";
    const r = HALF + 0.9;
    const colors = big ? candy : ["#ffffff", "#ffd84a", "#ffffff"];
    colors.forEach((c, i) => {
      const band = new T.Mesh(
        new T.TorusGeometry(r + i * 0.32, 0.17, 10, 40, pie),
        new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: big ? 0.35 : 0.2, roughness: 0.3 }),
      );
      arch.add(band);
    });
    if (big) {
      // Клетчатая лента «финиш» и связки шаров по бокам
      const flag = new T.Mesh(
        new T.PlaneGeometry(2 * r, 0.9),
        new T.MeshBasicMaterial({
          side: T.DoubleSide,
          map: canvasTexture(256, 64, (ctx) => {
            for (let x = 0; x < 16; x++)
              for (let y = 0; y < 4; y++) {
                ctx.fillStyle = (x + y) % 2 ? "#1d1d2b" : "#ffffff";
                ctx.fillRect(x * 16, y * 16, 16, 16);
              }
          }),
        }),
      );
      flag.position.y = r + 1.5;
      arch.add(flag);
      for (const side of [-1, 1])
        for (let k = 0; k < 4; k++) {
          const b = new T.Mesh(new T.SphereGeometry(0.55, 14, 10), new T.MeshPhysicalMaterial({ color: candy[(k + (side > 0 ? 3 : 0)) % 6], clearcoat: 1, roughness: 0.2 }));
          b.position.set(side * (r + 1 + (k % 2) * 0.7), 1.5 + k * 0.9, 0);
          arch.add(b);
        }
    }
    place(arch, fr, 0, 0, 0);
    scene.add(arch);
    list.push({ ...g, arch });
  }
  return list;
}

// ---------- Ускорители: светящиеся стрелки на дорожке ----------
const chevrons = canvasTexture(128, 128, (ctx) => {
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const y of [40, 96]) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(64, y - 30);
    ctx.lineTo(108, y);
    ctx.stroke();
  }
});
chevrons.wrapT = T.RepeatWrapping;
chevrons.repeat.set(1, 2);
export function boostPads(scene, track) {
  const look = new T.MeshBasicMaterial({ map: chevrons, color: "#ffe14d", transparent: true, depthWrite: false, side: T.DoubleSide });
  for (const b of track.boosts) {
    const fr = track.at(b.s + 2),
      pad = new T.Mesh(new T.PlaneGeometry(HALF * 1.6, 4), look);
    place(pad, fr, 0, 0.06, 0);
    pad.rotateX(-pie / 2);
    pad.renderOrder = 1;
    scene.add(pad);
  }
  return chevrons;
}

// ---------- Препятствия: меш и столкновение в координатах дорожки ----------
// a — расстояние вдоль трассы от препятствия, u — вбок, y — высота центра шара над дорожкой
const glossy = (c, e = 0) => new T.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1, emissive: c, emissiveIntensity: e });
export function obstacles(scene, track) {
  return track.obstacles.map((o, k) => {
    const fr = track.at(o.s),
      g = new T.Group();
    place(g, fr);
    scene.add(g);
    const c = candy[k % candy.length];
    if (o.kind === "hammer") {
      // Арка и молот на маятнике поперёк дорожки
      for (const side of [-1, 1]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 4.6, 10), glossy("#ffffff"));
        post.position.set(side * (HALF + 0.5), 2.3, 0);
        g.add(post);
      }
      const beam = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 2 * HALF + 1.2, 10), glossy("#ffffff"));
      beam.rotation.z = pie / 2;
      beam.position.y = 4.6;
      g.add(beam);
      const swing = new T.Group();
      swing.position.y = 4.6;
      const arm = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 3.3, 8), glossy("#d8dde6"));
      arm.position.y = -1.65;
      const head = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 1.3, 20), glossy(c, 0.15));
      head.rotation.x = pie / 2;
      head.position.y = -3.3;
      swing.add(arm, head);
      g.add(swing);
      o.update = (t) => (swing.rotation.z = Math.sin(t * 1.7 + o.phase) * 1.05);
      o.hit = (a, u, y) => {
        const th = swing.rotation.z,
          hx = Math.sin(th) * 3.3,
          hy = 4.6 - Math.cos(th) * 3.3;
        if (Math.abs(a) > 0.65 + R) return null;
        const dx = u - hx,
          dy = y - hy;
        return Math.hypot(dx, dy) < 0.62 + R ? { push: Math.sign(dx || 1) * 10, slow: 0.6, hop: 4 } : null;
      };
    } else if (o.kind === "sweeper") {
      // Вертушка: столбик в середине и вращающаяся перекладина
      const pole = new T.Mesh(new T.CylinderGeometry(0.3, 0.38, 1.1, 14), glossy("#ffffff"));
      pole.position.y = 0.55;
      const spin = new T.Group();
      spin.position.y = 0.7;
      const bar = new T.Mesh(new T.BoxGeometry(2 * HALF - 0.2, 0.36, 0.36), glossy(c, 0.15));
      spin.add(bar);
      g.add(pole, spin);
      o.update = (t) => (spin.rotation.y = t * 1.5 * o.side + o.phase);
      o.hit = (a, u, y) => {
        if (y > 1.4) return null;
        if (Math.hypot(a, u) < 0.38 + R) return { push: Math.sign(u || 1) * 9, slow: 0.5, hop: 3 };
        // Перекладина в плоскости дорожки направлена как (cos φ вбок, sin φ вперёд)
        const phi = spin.rotation.y,
          along = u * Math.cos(phi) + a * Math.sin(phi),
          across = -u * Math.sin(phi) + a * Math.cos(phi);
        return Math.abs(along) < HALF - 0.1 && Math.abs(across) < 0.18 + R ? { push: Math.sign(u || o.side) * 9, slow: 0.55, hop: 3 } : null;
      };
    } else if (o.kind === "slider") {
      // Блок ездит поперёк дорожки
      const block = new T.Mesh(new T.BoxGeometry(1.7, 1.1, 1.0), glossy(c, 0.12));
      block.position.y = 0.55;
      g.add(block);
      o.update = (t) => (block.position.x = Math.sin(t * 1.4 + o.phase) * (HALF - 0.9));
      o.hit = (a, u, y) =>
        Math.abs(a) < 0.5 + R && Math.abs(u - block.position.x) < 0.85 + R && y < 1.4
          ? { push: Math.sign(u - block.position.x || 1) * 9, slow: 0.5, hop: 3 }
          : null;
    } else if (o.kind === "pusher") {
      // Толкатель выезжает из бортика и отталкивает шар к другому краю
      const len = 2.2,
        block = new T.Mesh(new T.BoxGeometry(len, 0.9, 1.1), glossy(c, 0.15)),
        face = new T.Mesh(new T.BoxGeometry(0.12, 0.7, 0.9), glossy("#ffffff"));
      block.position.y = 0.45;
      face.position.set((-o.side * len) / 2, 0, 0);
      block.add(face);
      g.add(block);
      const rest = o.side * (HALF + len / 2 + 0.25);
      o.update = (t) => {
        const ph = (t * 0.7 + o.phase) % 1;
        // Быстро выезжает, медленно уходит обратно
        const out = ph < 0.15 ? ph / 0.15 : ph < 0.45 ? 1 : Math.max(0, 1 - (ph - 0.45) / 0.4);
        block.position.x = rest - o.side * out * 2.1;
      };
      o.hit = (a, u, y) => {
        const x = block.position.x;
        return Math.abs(a) < 0.55 + R && Math.abs(u - x) < len / 2 + R && y < 1.4 ? { push: -o.side * 13, slow: 0.7, hop: 2 } : null;
      };
    } else {
      // Пружинные бамперы, как в пинболе
      const spots = [
        [o.side * 1.1, -1.8],
        [-o.side * 1.0, 1.8],
      ];
      const caps = spots.map(([x, z]) => {
        const cap = new T.Group();
        const body = new T.Mesh(new T.CylinderGeometry(0.55, 0.6, 0.7, 20), glossy("#ffffff"));
        body.position.y = 0.35;
        const ring = new T.Mesh(new T.TorusGeometry(0.58, 0.12, 8, 24), glossy(c, 0.6));
        ring.rotation.x = pie / 2;
        ring.position.y = 0.7;
        cap.add(body, ring);
        // Локальная ось z смотрит назад по трассе, поэтому «вперёд на z» — это -z
        cap.position.set(x, 0, -z);
        g.add(cap);
        return cap;
      });
      o.bumpAt = -9;
      o.update = (t) => {
        const k = Math.max(0, 1 - (t - o.bumpAt) / 0.3);
        for (const cap of caps) cap.scale.set(1 + k * 0.25, 1 - k * 0.15, 1 + k * 0.25);
      };
      o.hit = (a, u, y, t) => {
        for (const [x, z] of spots) {
          const d = Math.hypot(a - z, u - x);
          if (d < 0.6 + R && y < 1.4) {
            o.bumpAt = t;
            return { push: Math.sign(u - x || 1) * 12, slow: 0.85, hop: 2, boing: true };
          }
        }
        return null;
      };
    }
    return o;
  });
}

// ---------- Кристаллы ----------
// Крупные кристаллы огранкой «бриллиант» без всякой оболочки: грани переливаются, сами светятся своим цветом,
// а мягкое свечение (bloom) даёт ореол прямо от граней. Все стоят на местах с начала; крутятся только те, что рядом с шаром.
function brilliant() {
  // Площадка сверху, корона, пояс и острый низ — как у настоящего бриллианта
  const pts = [new T.Vector2(0, -0.62), new T.Vector2(0.5, 0.02), new T.Vector2(0.52, 0.08), new T.Vector2(0.36, 0.3), new T.Vector2(0, 0.3)];
  const g = new T.LatheGeometry(pts, 8);
  return g.toNonIndexed();
}
export function gemField(scene, track) {
  const geo = brilliant();
  geo.computeVertexNormals();
  const look = new T.MeshPhysicalMaterial({ roughness: 0.06, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.5, flatShading: true, envMapIntensity: 2.4 });
  // Свечение цветом самого кристалла: ярче порога свечения, поэтому вокруг граней мягкий ореол
  look.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor * 0.8;\n#endif",
    );
  };
  const n = track.gems.length;
  const mesh = new T.InstancedMesh(geo, look, n);
  // Искорка-блик: маленькая звёздочка, вспыхивает то на одном, то на другом кристалле
  const glint = new T.InstancedMesh(new T.OctahedronGeometry(0.11, 0), new T.MeshBasicMaterial({ color: new T.Color(3, 3, 3), toneMapped: false }), n);
  mesh.frustumCulled = glint.frustumCulled = false;
  const color = new T.Color(),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    sc = new T.Vector3(),
    up = new T.Vector3(0, 1, 0),
    at = new T.Vector3(),
    fr = {};
  // Сочные цвета драгоценных камней
  const palette = ["#ff2d6f", "#ffb000", "#25e07a", "#1fb8ff", "#a64dff", "#ff5fd2", "#ffe14d", "#2ff0e0"];
  track.gems.forEach((g, i) => {
    track.at(g.s, fr);
    g.pos = fr.p.clone().addScaledVector(fr.r, g.u).addScaledVector(fr.u, R + 0.4 + g.h);
    g.taken = false;
    g.shown = true;
    color.set(palette[(i + Math.floor(g.s / 37)) % palette.length]);
    mesh.setColorAt(i, color);
    q.setFromAxisAngle(up, i);
    m.compose(g.pos, q, sc.setScalar(1.15));
    mesh.setMatrixAt(i, m);
    m.compose(g.pos, q, sc.setScalar(0));
    glint.setMatrixAt(i, m);
  });
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh, glint);
  return {
    mesh,
    update(t, near) {
      let changed = false;
      track.gems.forEach((g, i) => {
        if (g.taken) {
          if (!g.shown) return;
          g.shown = false;
          m.compose(g.pos, q.identity(), sc.setScalar(0));
          mesh.setMatrixAt(i, m);
          glint.setMatrixAt(i, m);
          changed = true;
          return;
        }
        // Крутятся и покачиваются кристаллы впереди шара, блик вспыхивает на верхней грани
        if (g.s < near - 10 || g.s > near + 160) return;
        g.shown = true;
        q.setFromAxisAngle(up, t * 2.4 + i);
        at.copy(g.pos).setY(g.pos.y + Math.sin(t * 3 + i) * 0.15);
        m.compose(at, q, sc.setScalar(1.15));
        mesh.setMatrixAt(i, m);
        const flash = Math.max(0, Math.sin(t * 2.6 + i * 1.7) - 0.8) / 0.2;
        at.y += 0.3;
        at.x += 0.18;
        m.compose(at, q.setFromAxisAngle(up, t), sc.set(flash, flash * 2.2, flash));
        glint.setMatrixAt(i, m);
        changed = true;
      });
      if (changed) mesh.instanceMatrix.needsUpdate = glint.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- Шар и его раскраски: покупаются за кристаллы ----------
export const skins = [
  { id: "rainbow", name: "Радуга", cost: 0 },
  { id: "melon", name: "Арбуз", cost: 40 },
  { id: "beach", name: "Мячик", cost: 70 },
  { id: "candy", name: "Леденец", cost: 100 },
  { id: "planet", name: "Планета", cost: 140 },
  { id: "ladybug", name: "Божья коровка", cost: 180 },
  { id: "soccer", name: "Футбол", cost: 220 },
  { id: "tiger", name: "Тигр", cost: 270 },
  { id: "moon", name: "Луна", cost: 320 },
  { id: "donut", name: "Пончик", cost: 380 },
  { id: "disco", name: "Диско", cost: 450 },
  { id: "pearl", name: "Жемчуг", cost: 520 },
  { id: "gold", name: "Золото", cost: 600 },
  { id: "neon", name: "Неон", cost: 700 },
  { id: "lava", name: "Лава", cost: 820 },
  { id: "stars", name: "Звёздочка", cost: 950 },
];
// Рисунки на шаре: развёртка 512×256, по горизонтали — вокруг шара
const painters = {
  rainbow: (ctx) => candy.concat(candy).forEach((c, i) => ((ctx.fillStyle = c), ctx.fillRect(i * 43, 0, 44, 256))),
  melon: (ctx) => {
    ctx.fillStyle = "#3fa34d";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#1f6e2c";
    for (let x = 0; x < 512; x += 64) {
      ctx.beginPath();
      for (let y = 0; y <= 256; y += 8) ctx.lineTo(x + 14 + Math.sin(y * 0.08) * 8, y);
      for (let y = 256; y >= 0; y -= 8) ctx.lineTo(x + 30 + Math.sin(y * 0.08) * 8, y);
      ctx.fill();
    }
  },
  beach: (ctx) => ["#ff4f5e", "#ffffff", "#ffcf3c", "#ffffff", "#3fa2ff", "#ffffff"].forEach((c, i) => ((ctx.fillStyle = c), ctx.fillRect((i * 512) / 6, 0, 512 / 6 + 1, 256))),
  candy: (ctx) => {
    ctx.fillStyle = "#fff4f8";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#ff4f8e";
    for (let x = -256; x < 512; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 24, 0);
      ctx.lineTo(x + 280, 256);
      ctx.lineTo(x + 256, 256);
      ctx.fill();
    }
  },
  planet: (ctx) => {
    const r = rng(5);
    ctx.fillStyle = "#2f7fe0";
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 4 ? "#4ec46a" : "#e8d27a";
      ctx.beginPath();
      ctx.ellipse(r() * 512, 40 + r() * 176, 18 + r() * 40, 10 + r() * 22, r() * 3, 0, pie * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (let i = 0; i < 14; i++) ctx.fillRect(r() * 512, r() * 256, 40 + r() * 60, 6);
  },
  ladybug: (ctx) => {
    ctx.fillStyle = "#e8302f";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#1d1416";
    ctx.fillRect(0, 0, 512, 34);
    for (const x of [0, 256]) ctx.fillRect(x - 6, 0, 12, 256);
    const r = rng(8);
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.arc(20 + r() * 472, 70 + r() * 150, 14 + r() * 10, 0, pie * 2);
      ctx.fill();
    }
  },
  soccer: (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#1d1d26";
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 6; k++) {
        const x = k * 86 + (row % 2) * 43,
          y = 32 + row * 64;
        ctx.beginPath();
        for (let j = 0; j < 5; j++) ctx.lineTo(x + Math.cos((j * 2 * pie) / 5 - pie / 2) * 20, y + Math.sin((j * 2 * pie) / 5 - pie / 2) * 20);
        ctx.fill();
      }
  },
  tiger: (ctx) => {
    ctx.fillStyle = "#ff9a1f";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#1d1416";
    for (let x = 10; x < 512; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + x) * 10 + (y % 32 ? 8 : 0), y);
      for (let y = 256; y >= 0; y -= 16) ctx.lineTo(x + 6 + Math.sin(y * 0.05 + x) * 10, y);
      ctx.fill();
    }
  },
  moon: (ctx) => {
    const r = rng(12);
    ctx.fillStyle = "#cfd3dc";
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 40; i++) {
      const x = r() * 512,
        y = r() * 256,
        s = 5 + r() * 22;
      ctx.fillStyle = "#a9aebb";
      ctx.beginPath();
      ctx.arc(x, y, s, 0, pie * 2);
      ctx.fill();
      ctx.fillStyle = "#e6e9ef";
      ctx.beginPath();
      ctx.arc(x - s * 0.2, y - s * 0.2, s * 0.6, 0, pie * 2);
      ctx.fill();
    }
  },
  donut: (ctx) => {
    ctx.fillStyle = "#e3a35f";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#ff8fc4";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, 130 + Math.sin(x * 0.07) * 14 + (x % 32 ? 8 : 0));
    ctx.lineTo(512, 0);
    ctx.fill();
    const r = rng(4);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = candy[i % candy.length];
      ctx.save();
      ctx.translate(r() * 512, 10 + r() * 105);
      ctx.rotate(r() * 3);
      ctx.fillRect(-6, -2, 12, 4);
      ctx.restore();
    }
  },
  disco: (ctx) => {
    for (let x = 0; x < 512; x += 16)
      for (let y = 0; y < 256; y += 16) {
        ctx.fillStyle = `hsl(${(x + y) % 360},30%,${70 + ((x * y) % 25)}%)`;
        ctx.fillRect(x + 1, y + 1, 14, 14);
      }
  },
  neon: (ctx) => {
    ctx.fillStyle = "#0d0a2a";
    ctx.fillRect(0, 0, 512, 256);
    ctx.lineWidth = 4;
    for (let x = 0; x <= 512; x += 32) {
      ctx.strokeStyle = x % 64 ? "#2ff3ff" : "#ff2fd6";
      ctx.strokeRect(x, -2, 0.1, 260);
    }
    for (let y = 0; y <= 256; y += 32) {
      ctx.strokeStyle = "#2ff3ff";
      ctx.strokeRect(-2, y, 516, 0.1);
    }
  },
  lava: (ctx) => {
    const r = rng(9);
    ctx.fillStyle = "#3a1712";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "#ffb12b";
    ctx.lineWidth = 5;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      let x = r() * 512,
        y = r() * 256;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) ctx.lineTo((x += (r() - 0.5) * 60), (y += (r() - 0.5) * 60));
      ctx.stroke();
    }
  },
  stars: (ctx) => {
    const r = rng(3);
    ctx.fillStyle = "#5b35c9";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#ffe14d";
    for (let i = 0; i < 30; i++) {
      const x = r() * 512,
        y = 20 + r() * 216,
        s = 6 + r() * 10;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k * pie) / 5,
          d = k % 2 ? s * 0.45 : s;
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      ctx.fill();
    }
  },
};
const skinLooks = new Map();
export function skinMaterial(id) {
  if (skinLooks.has(id)) return skinLooks.get(id);
  const map = painters[id] ? canvasTexture(512, 256, painters[id]) : null;
  let mat;
  if (id === "disco") mat = new T.MeshPhysicalMaterial({ map, metalness: 1, roughness: 0.12 });
  else if (id === "gold") mat = new T.MeshPhysicalMaterial({ color: "#ffcf4a", metalness: 1, roughness: 0.16, clearcoat: 1 });
  else if (id === "pearl") mat = new T.MeshPhysicalMaterial({ color: "#fff8fb", roughness: 0.12, iridescence: 1, iridescenceIOR: 1.4, clearcoat: 1, sheen: 1, sheenColor: new T.Color("#ffd6f0") });
  else if (id === "neon" || id === "lava" || id === "stars")
    mat = new T.MeshPhysicalMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: id === "lava" ? 0.9 : 0.6, roughness: 0.25, clearcoat: 1 });
  else mat = new T.MeshPhysicalMaterial({ map, roughness: id === "moon" ? 0.8 : 0.22, clearcoat: id === "moon" ? 0 : 1 });
  mat.userData.keep = true;
  skinLooks.set(id, mat);
  return mat;
}
export function ballMesh(scene, skin) {
  const ball = new T.Mesh(new T.SphereGeometry(R, 48, 32), skinMaterial(skin));
  ball.castShadow = true;
  scene.add(ball);
  return ball;
}

// ---------- Эффекты: след, искры, фейерверк ----------
export function effects(scene) {
  // След за шаром: цепочка светящихся бусин
  const trailCount = 16;
  const trail = new T.InstancedMesh(
    new T.SphereGeometry(R * 0.4, 12, 8),
    new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }),
    trailCount,
  );
  trail.frustumCulled = false;
  scene.add(trail);
  const history = [];
  // Искры: общий запас частиц на вспышки
  const sparkCount = 160;
  const sparks = new T.InstancedMesh(new T.OctahedronGeometry(0.13, 0), new T.MeshBasicMaterial({ color: 0xffffff }), sparkCount);
  sparks.frustumCulled = false;
  const pool = Array.from({ length: sparkCount }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1 }));
  const color = new T.Color(),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    sc = new T.Vector3();
  for (let i = 0; i < sparkCount; i++) sparks.setColorAt(i, color.set(candy[i % candy.length]));
  scene.add(sparks);
  let next = 0;
  return {
    burst(at, count = 12, speed = 5, life = 0.7, up = 2) {
      for (let k = 0; k < count; k++) {
        const s = pool[next];
        next = (next + 1) % sparkCount;
        s.p.copy(at);
        s.v.set((Math.random() - 0.5) * 2, Math.random() * 0.8 + 0.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.6));
        s.v.y += up;
        s.life = s.max = life * (0.7 + Math.random() * 0.5);
      }
    },
    update(dt, ballPos, show, tint) {
      history.unshift(ballPos.clone());
      if (history.length > trailCount * 2) history.length = trailCount * 2;
      trail.material.color.set(tint);
      for (let i = 0; i < trailCount; i++) {
        const p = history[i * 2 + 2];
        const k = 1 - i / trailCount;
        m.compose(p || ballPos, q.identity(), sc.setScalar(show && p ? k * 0.9 : 0));
        trail.setMatrixAt(i, m);
      }
      trail.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < sparkCount; i++) {
        const s = pool[i];
        if (s.life > 0) {
          s.life -= dt;
          s.v.y -= 9 * dt;
          s.p.addScaledVector(s.v, dt);
        }
        const k = Math.max(0, s.life / s.max);
        q.setFromAxisAngle(sc.set(0.3, 1, 0.2).normalize(), s.life * 12);
        m.compose(s.p, q, sc.setScalar(k * 1.4));
        sparks.setMatrixAt(i, m);
      }
      sparks.instanceMatrix.needsUpdate = true;
    },
  };
}
