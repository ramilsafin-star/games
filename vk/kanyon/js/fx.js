// Эффекты «Грозового каньона»: мягкие частицы (огонь, дым, вспышки, ударные кольца), искры,
// обломки и свет от взрывов. Мир летит навстречу, поэтому всё, что повисло в воздухе,
// сносит назад со скоростью flow (её задаёт сцена).
import { T, TAU, rand, pick, V, hot, GEO } from "./kit.js?v=a3d819ef";

export const GLOW = 0,
  SMOKE = 1,
  FIRE = 2,
  RING = 3,
  STAR = 4;

const FINISH = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
const palette = new Map();
// Цвет с запасом яркости; кэшируется, чтобы не плодить объекты в бою.
export function tone(hex, k = 1) {
  const key = hex + k;
  let color = palette.get(key);
  if (!color) palette.set(key, (color = hot(hex, k)));
  return color;
}
const ZERO = V();

export function createFx(scene, camera) {
  let flow = 0; // снос вдоль +z, единиц в секунду
  // ---------- Частицы: один вызов отрисовки на все ----------
  const MAX = 1500;
  const geometry = new T.InstancedBufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new T.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(T.DynamicDrawUsage);
  const aCol = new T.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(T.DynamicDrawUsage);
  const aMisc = new T.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute("aPos", aPos);
  geometry.setAttribute("aCol", aCol);
  geometry.setAttribute("aMisc", aMisc);
  geometry.instanceCount = 0;
  // Умноженная на альфу схема смешивания: светящиеся частицы прибавляются, дым перекрывает.
  const puffs = new T.Mesh(
    geometry,
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.CustomBlending,
      blendSrc: T.OneFactor,
      blendDst: T.OneMinusSrcAlphaFactor,
      blendSrcAlpha: T.OneFactor,
      blendDstAlpha: T.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute vec4 aPos;
        attribute vec4 aCol;
        attribute vec2 aMisc;
        varying vec2 vUv;
        varying vec4 vCol;
        varying float vKind;
        void main() {
          vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
          float c = cos(aMisc.x), s = sin(aMisc.x);
          mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * aPos.w;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy;
          vCol = aCol;
          vKind = aMisc.y;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec4 vCol;
        varying float vKind;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float a = 0.0, cover = 0.0;
          if (vKind < 0.5) a = max(exp(-r * r * 5.0) - 0.0067, 0.0);
          else if (vKind < 1.5) cover = a = smoothstep(1.0, 0.2, r);
          else if (vKind < 2.5) a = pow(1.0 - r, 1.6);
          else if (vKind < 3.5) a = smoothstep(0.1, 0.0, abs(r - 0.88)) + 0.25 * smoothstep(0.88, 0.3, r) * step(r, 0.88);
          else a = exp(-r * r * 9.0) + (1.0 - r) * (0.6 * exp(-abs(vUv.y) * 26.0) + 0.35 * exp(-abs(vUv.x) * 26.0));
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, cover * vCol.a);
          ${FINISH}
        }`,
    }),
  );
  puffs.frustumCulled = false;
  puffs.renderOrder = 6;
  scene.add(puffs);
  const cells = Array.from({ length: MAX }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0, s0: 0, s1: 0,
    r0: 0, g0: 0, b0: 0, r1: 0, g1: 0, b1: 0, a: 0, kind: 0, rot: 0, spin: 0, drag: 0,
  }));
  let alive = 0;
  function puff(kind, p, v, s0, s1, life, c0, alpha = 1, c1 = c0, drag = 0, spin = 0) {
    // на средней и низкой графике часть мелких частиц пропускаем (ударные кольца — никогда)
    if (api.thin < 1 && kind !== RING && Math.random() > api.thin) return;
    const q = alive < MAX ? cells[alive++] : cells[Math.floor(Math.random() * MAX)];
    v ||= ZERO;
    q.x = p.x; q.y = p.y; q.z = p.z;
    q.vx = v.x; q.vy = v.y; q.vz = v.z;
    q.age = 0; q.life = life; q.s0 = s0; q.s1 = s1;
    q.r0 = c0.r; q.g0 = c0.g; q.b0 = c0.b;
    q.r1 = c1.r; q.g1 = c1.g; q.b1 = c1.b;
    q.a = alpha; q.kind = kind; q.rot = rand(0, TAU); q.spin = spin; q.drag = drag;
  }
  function updatePuffs(dt) {
    const pos = aPos.array,
      col = aCol.array,
      misc = aMisc.array;
    for (let i = 0; i < alive; ) {
      const q = cells[i];
      q.age += dt;
      if (q.age >= q.life) {
        cells[i] = cells[--alive];
        cells[alive] = q;
        continue;
      }
      const u = q.age / q.life,
        ease = 1 - (1 - u) * (1 - u),
        slow = q.drag ? Math.exp(-q.drag * dt) : 1;
      q.vx *= slow; q.vy *= slow; q.vz *= slow;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += (q.vz + flow) * dt;
      q.rot += q.spin * dt;
      pos[i * 4] = q.x; pos[i * 4 + 1] = q.y; pos[i * 4 + 2] = q.z;
      pos[i * 4 + 3] = q.s0 + (q.s1 - q.s0) * ease;
      col[i * 4] = q.r0 + (q.r1 - q.r0) * u; col[i * 4 + 1] = q.g0 + (q.g1 - q.g0) * u; col[i * 4 + 2] = q.b0 + (q.b1 - q.b0) * u;
      col[i * 4 + 3] = q.a * Math.min(1, u * 12) * Math.pow(1 - u, 1.4);
      misc[i * 2] = q.rot; misc[i * 2 + 1] = q.kind;
      i++;
    }
    geometry.instanceCount = alive;
    aPos.needsUpdate = aCol.needsUpdate = aMisc.needsUpdate = true;
  }

  // ---------- Искры: яркие осколки, вытянутые по ходу полёта ----------
  const SPARKS = 420;
  const dummy = new T.Object3D();
  const sparkMesh = new T.InstancedMesh(GEO.low, new T.MeshBasicMaterial({ toneMapped: false }), SPARKS);
  sparkMesh.frustumCulled = false;
  sparkMesh.setColorAt(0, new T.Color(1, 1, 1));
  scene.add(sparkMesh);
  const sparks = Array.from({ length: SPARKS }, () => ({ p: V(), v: V(), life: 0, max: 1, s: 1 }));
  let sparkNext = 0;
  const aim = V();
  function burst(p, hexes, count, speed, size) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkNext];
      sparkMesh.setColorAt(sparkNext, tone(pick(hexes), 2.5));
      sparkNext = (sparkNext + 1) % SPARKS;
      s.p.copy(p);
      s.v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
      s.life = s.max = rand(0.4, 1.1);
      s.s = size * rand(0.5, 1.4);
    }
    sparkMesh.instanceColor.needsUpdate = true;
  }

  // ---------- Обломки: куски обшивки ----------
  const CHUNKS = 90;
  const chunkMesh = new T.InstancedMesh(GEO.oct, new T.MeshStandardMaterial({ flatShading: true, roughness: 0.5, metalness: 0.45 }), CHUNKS);
  chunkMesh.frustumCulled = false;
  chunkMesh.setColorAt(0, new T.Color(1, 1, 1));
  scene.add(chunkMesh);
  const chunks = Array.from({ length: CHUNKS }, () => ({ p: V(), v: V(), axis: V(1, 0, 0), angle: 0, spin: 0, life: 0, max: 1, s: V(1, 1, 1) }));
  let chunkNext = 0;
  const shade = new T.Color();
  function debris(p, hex, count, speed, size) {
    for (let i = 0; i < count; i++) {
      const c = chunks[chunkNext];
      chunkMesh.setColorAt(chunkNext, shade.set(Math.random() < 0.35 ? "#2a3345" : hex).multiplyScalar(rand(0.55, 1)));
      chunkNext = (chunkNext + 1) % CHUNKS;
      c.p.copy(p);
      c.v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.35, 1));
      c.axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      c.angle = rand(0, TAU);
      c.spin = rand(3, 9);
      c.life = c.max = rand(1.3, 2.6);
      c.s.set(size * rand(0.5, 1.3), size * rand(0.15, 0.5), size * rand(0.5, 1.5));
    }
    chunkMesh.instanceColor.needsUpdate = true;
  }

  // ---------- Свет от вспышек. Число ламп постоянно, иначе шейдеры собирались бы заново. ----------
  const lamps = [0, 1].map(() => {
    const lamp = new T.PointLight(0xffffff, 0, 320, 1);
    scene.add(lamp);
    return { lamp, power: 0, fade: 1 };
  });
  let lampNext = 0;
  function light(p, hex, power, time = 0.35) {
    const slot = lamps[lampNext];
    lampNext = 1 - lampNext;
    slot.lamp.position.copy(p);
    slot.lamp.color.set(hex);
    slot.power = power;
    slot.fade = time;
  }

  // ---------- Взрыв ----------
  const offset = V(),
    drift = V();
  function explode(p, radius, hex, level) {
    const big = level >= 2;
    // Взрыв у самого носа не должен засвечивать весь экран.
    const near = Math.min(1, Math.max(0.3, p.distanceTo(camera.position) / 70));
    puff(GLOW, p, null, radius * 0.9, radius * (big ? 2.3 : 2.1), 0.22, tone("#fff4d2", 3.2), near);
    puff(STAR, p, null, radius * 1.7, radius * (big ? 3.6 : 3.3), big ? 0.42 : 0.3, tone("#ffe7b0", 2.1), near);
    puff(RING, p, null, radius * 0.5, radius * (big ? 4.4 : 3), big ? 0.75 : 0.5, tone(hex, 2.4), 0.9 * near);
    const fires = level >= 3 ? 26 : big ? 14 : level >= 1 ? 9 : 5;
    for (let i = 0; i < fires; i++) {
      offset.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(radius * 0.45).add(p);
      drift.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(radius * rand(0.5, 1.6));
      puff(FIRE, offset, drift, radius * rand(0.35, 0.6), radius * rand(1.0, 1.7), rand(0.45, 0.95), tone("#ffe29a", 3.2), 1, tone("#ff3b12", 1.1), 1.6, rand(-1.5, 1.5));
    }
    for (let i = 0; i < (big ? 8 : 4); i++) {
      offset.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(radius * 0.5).add(p);
      drift.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(radius * 0.5);
      puff(SMOKE, offset, drift, radius * 0.6, radius * rand(1.5, 2.3), rand(1.2, 2.2), tone("#3b3340", 1), 0.42, tone("#16141c", 1), 0.8, rand(-0.6, 0.6));
    }
    burst(p, [hex, "#ffd9a0", "#ffffff"], level >= 3 ? 150 : big ? 50 : level >= 1 ? 26 : 12, level >= 3 ? 75 : 36, level >= 3 ? 1.5 : 0.65);
    debris(p, hex, level >= 3 ? 40 : big ? 12 : level >= 1 ? 7 : 3, radius * (level >= 3 ? 3.2 : 3.8), radius * 0.2);
    light(p, "#ffd2a0", level >= 3 ? 900 : big ? 330 : 170, big ? 0.55 : 0.35);
  }

  function update(dt, t) {
    updatePuffs(dt);
    sparks.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.p.addScaledVector(s.v, dt);
        s.p.z += flow * dt;
        s.v.multiplyScalar(Math.pow(0.25, dt));
      }
      const size = s.life > 0 ? (s.life / s.max) * s.s : 0;
      dummy.position.copy(s.p);
      dummy.lookAt(aim.copy(s.p).add(s.v));
      dummy.scale.set(size, size, size * (1 + s.v.length() * 0.09));
      dummy.updateMatrix();
      sparkMesh.setMatrixAt(i, dummy.matrix);
    });
    sparkMesh.instanceMatrix.needsUpdate = true;
    chunks.forEach((c, i) => {
      if (c.life > 0) {
        c.life -= dt;
        c.p.addScaledVector(c.v, dt);
        c.p.z += flow * dt;
        c.v.multiplyScalar(Math.pow(0.6, dt));
        c.angle += c.spin * dt;
      }
      dummy.position.copy(c.p);
      dummy.quaternion.setFromAxisAngle(c.axis, c.angle);
      dummy.scale.copy(c.s).multiplyScalar(c.life > 0 ? Math.min(1, c.life / (c.max * 0.3)) : 0);
      dummy.updateMatrix();
      chunkMesh.setMatrixAt(i, dummy.matrix);
    });
    chunkMesh.instanceMatrix.needsUpdate = true;
    for (const slot of lamps) {
      slot.power *= Math.pow(0.001, dt / slot.fade);
      slot.lamp.intensity = slot.power < 0.5 ? 0 : slot.power;
      slot.lamp.position.z += flow * dt;
    }
  }

  const api = { puff, burst, debris, explode, light, update, setFlow: (value) => (flow = value), thin: 1 };
  return api;
}
