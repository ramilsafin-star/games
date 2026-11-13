// Персонажи и тени. Игрок — ребёнок в жёлтом дождевике с фонарём и банкой за спиной;
// помощники — лисёнок, зайка и медвежонок. Тени — тёмные дымки со светящимися глазами.
import { T, TAU, hot, lerp, damp, clamp, GLSL_NOISE } from "./kit.js?v=16ea7301";
import { rimmed, U } from "./world.js?v=16ea7301";
import { kindOf } from "./config.js?v=16ea7301";

const std = (color, rim = "#8a96ff", strength = 0.5) => rimmed(new T.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0 }), rim, 2.4, strength);
const basic = (color, k = 1) => new T.MeshBasicMaterial({ color: hot(color, k) });
const G = {
  ball: new T.SphereGeometry(1, 20, 14),
  ballLo: new T.SphereGeometry(1, 10, 8),
  cap: new T.CapsuleGeometry(1, 1, 4, 10),
  cone: new T.ConeGeometry(1, 1, 12),
  cyl: new T.CylinderGeometry(1, 1, 1, 12),
  box: new T.BoxGeometry(1, 1, 1),
  torus: new T.TorusGeometry(1, 0.28, 8, 20),
};
function part(geo, material, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new T.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

// Фонарь в руке: рамка, тёплое стекло, ручка
function lantern(parent, scale = 1) {
  const g = new T.Group();
  const iron = new T.MeshStandardMaterial({ color: "#2e3140", roughness: 0.4, metalness: 0.7 });
  const glass = basic("#ffc86a", 3.2);
  part(G.cyl, iron, g, 0, 0.32, 0, 0.26, 0.06, 0.26);
  part(G.cyl, iron, g, 0, -0.32, 0, 0.24, 0.06, 0.24);
  const glassMesh = part(G.cyl, glass, g, 0, 0, 0, 0.2, 0.58, 0.2);
  for (const [x, z] of [[0.19, 0.19], [-0.19, 0.19], [0.19, -0.19], [-0.19, -0.19]]) part(G.cyl, iron, g, x, 0, z, 0.03, 0.62, 0.03);
  part(G.cone, iron, g, 0, 0.46, 0, 0.24, 0.22, 0.24);
  const h = part(G.torus, iron, g, 0, 0.68, 0, 0.14, 0.14, 0.14);
  h.rotation.x = Math.PI / 2;
  g.scale.setScalar(scale);
  parent.add(g);
  return { g, glass: glassMesh };
}

const LOOK = {
  player: { coat: "#ffc93a", skin: "#ffd7b8", legs: "#2f4a7a", boots: "#e2483d", scarf: "#e8413c", rim: "#6f86ff" },
  fox: { coat: "#f08a3a", belly: "#fff1e2", legs: "#3a2a24", scarf: "#5ad0ff", rim: "#ffb27a" },
  bunny: { coat: "#dedbe9", belly: "#ffffff", legs: "#b7b3c8", scarf: "#ff6fb4", inner: "#ffb3c8", rim: "#c8d0ff" },
  bear: { coat: "#9a6a46", belly: "#e3c39a", legs: "#6a4630", scarf: "#7cdc6a", rim: "#ffc8a0" },
};

export function makeCharacter(kind) {
  const L = LOOK[kind];
  const root = new T.Group();
  const body = new T.Group(); // качается при беге
  root.add(body);
  const coat = std(L.coat, L.rim);
  const skin = std(L.skin || L.coat, L.rim);
  const legsMat = std(L.legs, L.rim, 0.3);
  const scarfMat = std(L.scarf, L.rim, 0.3);
  const dark = new T.MeshBasicMaterial({ color: "#14121c" });
  const shine = basic("#ffffff", 1.6);
  const isKid = kind === "player";
  const s = isKid ? 1 : 0.92;
  // ноги
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new T.Group();
    hip.position.set(side * 0.3 * s, 1.0 * s, 0);
    body.add(hip);
    part(G.cap, legsMat, hip, 0, -0.42 * s, 0, 0.2 * s, 0.32 * s, 0.2 * s);
    part(G.ball, isKid ? std(L.boots, L.rim, 0.3) : legsMat, hip, 0, -0.86 * s, 0.08 * s, 0.26 * s, 0.17 * s, 0.34 * s);
    legs.push(hip);
  }
  // туловище
  const torso = new T.Group();
  body.add(torso);
  part(G.ball, coat, torso, 0, 1.62 * s, 0, 0.72 * s, 0.82 * s, 0.64 * s);
  if (isKid) {
    const flare = part(new T.ConeGeometry(0.86, 0.75, 18, 1, true), coat, torso, 0, 1.18, 0);
    flare.material.side = T.DoubleSide;
    for (const y of [1.85, 1.55]) part(G.ballLo, shine, torso, 0, y, 0.64, 0.06, 0.06, 0.04).material = basic("#3a2a1a");
  } else part(G.ball, std(L.belly, L.rim), torso, 0, 1.55 * s, 0.32 * s, 0.48 * s, 0.6 * s, 0.38 * s);
  // шарф
  const scarf = part(G.torus, scarfMat, torso, 0, 2.28 * s, 0, 0.52 * s, 0.52 * s, 0.5 * s);
  scarf.rotation.x = Math.PI / 2;
  const tail = part(G.box, scarfMat, torso, 0.3 * s, 1.95 * s, 0.45 * s, 0.22 * s, 0.6 * s, 0.08 * s);
  tail.rotation.z = 0.25;
  // руки
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new T.Group();
    sh.position.set(side * 0.72 * s, 2.15 * s, 0);
    torso.add(sh);
    part(G.cap, isKid ? coat : std(L.coat, L.rim), sh, 0, -0.42 * s, 0, 0.17 * s, 0.3 * s, 0.17 * s);
    part(G.ball, skin, sh, 0, -0.82 * s, 0, 0.17 * s);
    sh.rotation.z = side * 0.18;
    arms.push(sh);
  }
  // голова
  const head = new T.Group();
  head.position.y = 2.9 * s;
  torso.add(head);
  if (isKid) {
    part(G.ball, coat, head, 0, 0.06, -0.16, 0.78, 0.76, 0.72); // капюшон
    part(G.ball, skin, head, 0, -0.04, 0.2, 0.58, 0.56, 0.56);
    part(G.ball, coat, head, 0, 0.5, 0.18, 0.6, 0.28, 0.5); // козырёк капюшона
    // ушки на капюшоне — силуэт читается и со спины
    for (const side of [-1, 1]) {
      const ear = part(G.cone, coat, head, side * 0.42, 0.72, -0.05, 0.2, 0.36, 0.14);
      ear.rotation.z = -side * 0.35;
      part(G.cone, std("#ff9a6a", L.rim, 0.3), head, side * 0.42, 0.7, 0.01, 0.1, 0.22, 0.06).rotation.z = -side * 0.35;
    }
    part(G.ballLo, std("#ff9a8a", L.rim, 0.2), head, -0.33, -0.16, 0.66, 0.11, 0.07, 0.04);
    part(G.ballLo, std("#ff9a8a", L.rim, 0.2), head, 0.33, -0.16, 0.66, 0.11, 0.07, 0.04);
  } else {
    part(G.ball, std(L.coat, L.rim), head, 0, 0, 0, 0.66, 0.6, 0.6);
    if (kind === "fox") {
      part(G.cone, std(L.belly, L.rim), head, 0, -0.12, 0.62, 0.26, 0.5, 0.22).rotation.x = Math.PI / 2;
      part(G.ballLo, dark, head, 0, -0.1, 0.9, 0.08);
      for (const side of [-1, 1]) {
        const ear = part(G.cone, std(L.coat, L.rim), head, side * 0.36, 0.62, -0.02, 0.2, 0.5, 0.12);
        ear.rotation.z = -side * 0.25;
        part(G.cone, std("#3a2a24", L.rim), head, side * 0.36, 0.76, 0.02, 0.1, 0.26, 0.06).rotation.z = -side * 0.25;
      }
    } else if (kind === "bunny") {
      part(G.ball, std(L.belly, L.rim), head, 0, -0.18, 0.42, 0.32, 0.24, 0.24);
      part(G.ballLo, std("#ff8fb0", L.rim), head, 0, -0.08, 0.62, 0.07);
      for (const side of [-1, 1]) {
        const ear = new T.Group();
        ear.position.set(side * 0.24, 0.5, -0.05);
        ear.rotation.z = -side * 0.15;
        head.add(ear);
        part(G.cap, std(L.coat, L.rim), ear, 0, 0.55, 0, 0.14, 0.42, 0.08);
        part(G.cap, std(L.inner, L.rim), ear, 0, 0.55, 0.04, 0.08, 0.34, 0.05);
      }
    } else {
      part(G.ball, std(L.belly, L.rim), head, 0, -0.16, 0.48, 0.3, 0.22, 0.2);
      part(G.ballLo, dark, head, 0, -0.06, 0.66, 0.09, 0.07, 0.06);
      for (const side of [-1, 1]) {
        part(G.ball, std(L.coat, L.rim), head, side * 0.46, 0.46, -0.05, 0.2, 0.2, 0.12);
        part(G.ball, std(L.belly, L.rim), head, side * 0.46, 0.46, 0.0, 0.11, 0.11, 0.08);
      }
    }
  }
  // глаза с бликами
  const eyes = [];
  for (const side of [-1, 1]) {
    const e = part(G.ballLo, dark, head, side * 0.21, 0.02, isKid ? 0.72 : 0.55, 0.1, 0.13, 0.06);
    part(G.ballLo, shine, e, 0.35, 0.35, 0.6, 0.35);
    eyes.push(e);
  }
  // хвост у зверят
  let tailBit = null;
  if (kind === "fox") {
    tailBit = new T.Group();
    tailBit.position.set(0, 1.2, -0.55);
    body.add(tailBit);
    const tb = part(G.ball, std(L.coat, L.rim), tailBit, 0, 0.2, -0.45, 0.32, 0.32, 0.7);
    tb.rotation.x = 0.6;
    part(G.ball, std(L.belly, L.rim), tailBit, 0, 0.55, -0.95, 0.2, 0.2, 0.25);
  } else if (kind === "bunny") {
    tailBit = new T.Group();
    tailBit.position.set(0, 1.25, -0.6);
    body.add(tailBit);
    part(G.ball, std("#ffffff", L.rim), tailBit, 0, 0, 0, 0.26);
  } else if (kind === "bear") {
    tailBit = new T.Group();
    tailBit.position.set(0, 1.2, -0.6);
    body.add(tailBit);
    part(G.ball, std(L.coat, L.rim), tailBit, 0, 0, 0, 0.16);
  }
  // фонарь в правой руке
  const lamp = lantern(arms[1], isKid ? 1 : 0.85);
  lamp.g.position.set(0.02, -1.25 * s, 0.12);
  // банка светлячков за спиной (у игрока)
  let jar = null;
  const jarDots = [];
  if (isKid) {
    jar = new T.Group();
    jar.position.set(0, 1.75, -0.72);
    jar.rotation.x = -0.15;
    torso.add(jar);
    const glass = new T.Mesh(G.cyl, new T.MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }));
    glass.scale.set(0.36, 0.72, 0.36);
    jar.add(glass);
    part(G.cyl, std("#8a5a3a", L.rim, 0.2), jar, 0, 0.42, 0, 0.38, 0.12, 0.38);
    part(G.box, std("#8a5a3a", L.rim, 0.2), jar, 0, 0.1, 0.36, 0.08, 0.9, 0.05);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, r = i === 0 ? 0 : 0.18;
      const dot = part(G.ballLo, basic("#ffd03c", 3), jar, Math.cos(a) * r, -0.22 + (i % 3) * 0.17, Math.sin(a) * r, 0.085);
      dot.visible = false;
      jarDots.push(dot);
    }
  }
  // палочка с зефиром в левой руке
  const stick = new T.Group();
  stick.position.set(0, -0.82 * s, 0.1);
  arms[0].add(stick);
  const stickRod = part(G.cyl, std("#7a5236", L.rim, 0.2), stick, 0, 0, 0.55, 0.025, 1.2, 0.025);
  stickRod.rotation.x = Math.PI / 2;
  const mallowMat = std("#fff6ee", "#ffd8c0", 0.4);
  const mallows = [part(G.cyl, mallowMat, stick, 0, 0, 1.0, 0.11, 0.16, 0.11), part(G.cyl, mallowMat, stick, 0, 0, 1.2, 0.11, 0.16, 0.11), part(G.cyl, mallowMat, stick, 0, 0, 0.8, 0.11, 0.16, 0.11)];
  mallows.forEach((m) => (m.rotation.x = Math.PI / 2));
  stick.visible = false;
  // ледяная корка (заморозка)
  const ice = new T.Mesh(
    new T.IcosahedronGeometry(1, 1),
    new T.MeshStandardMaterial({ color: "#bfe8ff", emissive: "#4a8cff", emissiveIntensity: 0.6, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.1, flatShading: true, depthWrite: false }),
  );
  ice.scale.set(1.25 * s, 2.0 * s, 1.15 * s);
  ice.position.y = 1.85 * s;
  ice.visible = false;
  root.add(ice);
  // мягкая тень под ногами
  const blob = new T.Mesh(new T.CircleGeometry(0.95 * s, 20), new T.MeshBasicMaterial({ color: "#000010", transparent: true, opacity: 0.45, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.04;
  root.add(blob);

  const st = { phase: Math.random() * 6, yaw: 0, blink: 2 + Math.random() * 3, hop: 0, cook: 0, thaw: 0, look: 0 };
  return {
    kind,
    root,
    lampGlass: lamp.glass,
    lampWorld: new T.Vector3(),
    // a — человек из правил забега; extra: { cooking, holding, happy, t }
    animate(a, dt, t, extra = {}) {
      root.position.set(a.x, 0, a.z);
      const speed = Math.hypot(a.vx || 0, a.vz || 0);
      const frozen = !!a.frozen;
      ice.visible = frozen;
      if (frozen) {
        ice.rotation.y += dt * 0.2;
        const shiver = Math.sin(t * 40) * 0.015;
        body.position.x = shiver;
        return;
      }
      body.position.x = 0;
      // поворот по движению
      if (speed > 0.5) st.yaw = Math.atan2(a.vx, a.vz);
      else if (extra.face != null) st.yaw = extra.face;
      let dy = st.yaw - root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.y += dy * (1 - Math.exp(-12 * dt));
      // бег
      const k = clamp(speed / 14, 0, 1.2);
      st.phase += dt * (3 + speed * 0.62);
      const sw = Math.sin(st.phase) * 0.75 * k;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.8;
      arms[1].rotation.x = sw * 0.5 - 0.15;
      // прыжок радости
      if (extra.happy) st.hop += dt * 7;
      const hop = extra.happy ? Math.abs(Math.sin(st.hop)) * 0.9 : 0;
      body.position.y = Math.abs(Math.sin(st.phase)) * 0.16 * k + Math.sin(t * 2.2 + st.phase) * 0.025 * (1 - k) + hop;
      torso.rotation.x = 0.12 * k;
      // поймал: подпрыгнул и вскинул руку
      if (a.catchAnim > 0) {
        arms[1].rotation.x = -2.2 * (a.catchAnim / 0.4);
        body.position.y += Math.sin((a.catchAnim / 0.4) * Math.PI) * 0.35;
      }
      // жарит зефир: левая рука к костру
      st.cook = damp(st.cook, extra.cooking ? 1 : 0, 8, dt);
      arms[0].rotation.x = lerp(arms[0].rotation.x, -1.25, st.cook);
      stick.visible = (a.snacks || 0) > 0 || st.cook > 0.05;
      const snacks = a.snacks || 0;
      mallows.forEach((m, i) => (m.visible = i < Math.max(snacks, st.cook > 0.05 ? snacks + 1 : 0)));
      if (st.cook > 0.05) {
        const roast = clamp(extra.cookT || 0, 0, 1);
        mallowMat.color.setRGB(1, lerp(0.96, 0.72, roast), lerp(0.92, 0.42, roast));
      } else mallowMat.color.set("#fff6ee");
      // размораживает друга: фонарь вперёд
      st.thaw = damp(st.thaw, extra.thawing ? 1 : 0, 8, dt);
      arms[1].rotation.x = lerp(arms[1].rotation.x, -1.4, st.thaw);
      // моргание
      st.blink -= dt;
      const closed = st.blink < 0.12;
      if (st.blink < 0) st.blink = 2 + Math.random() * 4;
      for (const e of eyes) e.scale.y = closed ? 0.02 : 0.13;
      head.rotation.y = Math.sin(t * 0.6 + st.phase * 0.1) * 0.25 * (1 - k);
      if (tailBit) tailBit.rotation.y = Math.sin(t * 3 + st.phase) * 0.35;
      // банка: точки цвета пойманных
      if (jar) {
        const list = a.jar || [];
        jarDots.forEach((d, i) => {
          d.visible = i < list.length;
          if (d.visible) d.material.color.set(kindOf(list[i]).color).multiplyScalar(3);
        });
      }
      // фонарь мерцает
      lamp.glass.material.color.setRGB(1, 0.78, 0.42).multiplyScalar(2.2 + Math.sin(t * 9 + st.phase) * 0.2);
      lamp.glass.getWorldPosition(this.lampWorld);
    },
    setVisible(v) {
      root.visible = v;
    },
  };
}

// ---------- Тени ----------
const shadowGeo = new T.SphereGeometry(1, 28, 20);
function shadowMaterial(rim) {
  return new T.ShaderMaterial({
    uniforms: { uTime: U.uTime, uSeed: { value: Math.random() * 10 }, uRim: { value: new T.Color(rim) }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uFade: { value: 1 }, uFlash: { value: 0 } },
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float uTime, uSeed;
      varying vec3 vN, vV; varying float vY, vFz;
      void main() {
        vec3 p = position;
        float n = sin(p.y * 5.0 + uTime * 3.0 + uSeed) * 0.05 + sin(p.x * 6.0 + uTime * 2.3 + uSeed * 2.0) * 0.04 + sin(p.z * 7.0 - uTime * 2.7) * 0.03;
        p += normal * n;
        if (p.y < 0.0) {
          float k = -p.y;
          p.y *= 1.0 + k * 1.5;
          p.xz *= 1.0 - k * 0.6;
          p.x += sin(uTime * 2.2 + uSeed + k * 3.0) * k * 0.3;
          p.z += cos(uTime * 1.7 + uSeed + k * 2.0) * k * 0.2;
        }
        vY = position.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        vFz = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRim, uFogColor; uniform float uFogDensity, uFade, uFlash;
      varying vec3 vN, vV; varying float vY, vFz;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        vec3 col = vec3(0.012, 0.008, 0.03) + uRim * f * f * 1.25 + vec3(1.0) * uFlash * f;
        float a = 0.94 * smoothstep(-1.0, -0.3, vY) * uFade;
        col = mix(col, uFogColor, (1.0 - exp(-uFogDensity * uFogDensity * vFz * vFz)) * 0.8);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

export function makeShadow(kind) {
  const root = new T.Group();
  const inner = new T.Group();
  root.add(inner);
  const rimCol = kind === "imp" ? "#3cc88a" : kind === "brute" ? "#c0602a" : kind === "boss" ? "#9a3cff" : "#7a4cff";
  const mat = shadowMaterial(rimCol);
  const bodyMesh = new T.Mesh(shadowGeo, mat);
  bodyMesh.scale.set(1.15, 1.35, 1.15);
  bodyMesh.renderOrder = 2;
  inner.add(bodyMesh);
  const eyeMat = new T.MeshBasicMaterial({ color: new T.Color() });
  const eyes = [];
  for (const side of [-1, 1]) {
    const e = new T.Mesh(G.ballLo, eyeMat);
    e.position.set(side * 0.36, 0.35, 0.95);
    e.scale.set(0.2, 0.28, 0.1);
    e.rotation.z = side * -0.2;
    inner.add(e);
    eyes.push(e);
  }
  if (kind === "imp") {
    for (const side of [-1, 1]) {
      const horn = new T.Mesh(G.cone, new T.MeshBasicMaterial({ color: "#0c0a14" }));
      horn.position.set(side * 0.5, 1.35, 0.1);
      horn.scale.set(0.16, 0.5, 0.16);
      horn.rotation.z = -side * 0.4;
      inner.add(horn);
    }
  }
  if (kind === "brute") {
    for (const side of [-1, 1]) {
      const arm = new T.Mesh(shadowGeo, mat);
      arm.position.set(side * 1.15, -0.1, 0.2);
      arm.scale.set(0.42, 0.7, 0.42);
      inner.add(arm);
    }
  }
  if (kind === "boss") {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const spike = new T.Mesh(G.cone, new T.MeshBasicMaterial({ color: "#0a0612" }));
      spike.position.set(Math.cos(a) * 0.7, 1.35, Math.sin(a) * 0.7);
      spike.scale.set(0.18, 0.75 + (i % 2) * 0.35, 0.18);
      spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      inner.add(spike);
    }
  }
  const scale = kind === "imp" ? 0.6 : kind === "brute" ? 1.7 : kind === "boss" ? 2.6 : 1;
  inner.scale.setScalar(scale * 1.25);
  const st = { blink: Math.random() * 3, bob: Math.random() * 6, fade: 0, scale };
  const eyeColor = new T.Color(kind === "imp" ? "#78ffa0" : kind === "brute" ? "#ffa03c" : "#c8b4ff");
  const angryColor = new T.Color("#ff3d5e");
  return {
    root,
    kind,
    mat,
    // s — тень из правил (или Большая тень)
    animate(s, dt, t, opts = {}) {
      st.fade = Math.min(1, st.fade + dt * 1.5);
      mat.uniforms.uFade.value = opts.fade ?? st.fade;
      const hover = (kind === "boss" ? 6.5 : 2.7 * scale) + Math.sin(t * 2 + st.bob) * 0.35 * scale;
      root.position.set(s.x, hover, s.z);
      const fx = s.fx ?? -s.x, fz = s.fz ?? -s.z;
      const yaw = Math.atan2(fx, fz);
      let dy = yaw - root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.y += dy * (1 - Math.exp(-6 * dt));
      inner.rotation.z = Math.sin(t * 1.3 + st.bob) * 0.06;
      if (kind === "boss") inner.scale.setScalar(scale * 1.25 * (opts.size ?? 1));
      // глаза: моргают, злые — красные, при ударе фонарём вспыхивают
      st.blink -= dt;
      if (st.blink < 0) st.blink = 2 + Math.random() * 3;
      const angry = s.angry || kind === "boss";
      const c = angry ? angryColor : eyeColor;
      eyeMat.color.copy(c).multiplyScalar(opts.flash ? 6 : angry ? 4 : 3);
      for (const e of eyes) e.scale.y = st.blink < 0.1 ? 0.03 : angry ? 0.22 : 0.28;
      mat.uniforms.uFlash.value = opts.flash ? 0.8 : 0;
    },
  };
}
