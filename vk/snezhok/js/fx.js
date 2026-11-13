// Эффекты «Снежного кома»: мягкие частицы (снежная пыль, блики, звёздочки, ударные кольца),
// искры, комья снега, осколки льда и конфетти. Всё в пулах: на сцене три вызова отрисовки.
import { T, TAU, rand, pick, V, hot, GEO } from "./kit.js?v=3cff0128";

export const GLOW = 0,
  PUFF = 1,
  STAR = 2,
  RING = 3;

const palette = new Map();
export function tone(hex, k = 1) {
  const key = hex + k;
  let color = palette.get(key);
  if (!color) palette.set(key, (color = hot(hex, k)));
  return color;
}
const ZERO = V();

export function createFx(scene, quality = 1) {
  // ---------- Мягкие частицы: один вызов отрисовки на все ----------
  const MAX = quality < 1 ? 700 : 1400;
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
  // светящиеся частицы прибавляются, снежная пыль перекрывает
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
          else if (vKind < 1.5) cover = a = smoothstep(1.0, 0.25, r) * 0.9;
          else if (vKind < 2.5) a = exp(-r * r * 10.0) + (1.0 - r) * (0.7 * exp(-abs(vUv.y) * 22.0) + 0.7 * exp(-abs(vUv.x) * 22.0));
          else a = smoothstep(0.12, 0.0, abs(r - 0.86)) + 0.2 * smoothstep(0.86, 0.3, r) * step(r, 0.86);
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, cover * vCol.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  puffs.frustumCulled = false;
  puffs.renderOrder = 6;
  scene.add(puffs);
  const cells = Array.from({ length: MAX }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, age: 0, life: 0, s0: 0, s1: 0,
    r0: 0, g0: 0, b0: 0, r1: 0, g1: 0, b1: 0, a: 0, kind: 0, rot: 0, spin: 0, drag: 0,
  }));
  let alive = 0;
  // kind, где, скорость, размер от/до, жизнь, цвет, прозрачность, цвет к концу, торможение, вращение, тяжесть
  function puff(kind, p, v, s0, s1, life, c0, alpha = 1, c1 = c0, drag = 0, spin = 0, gravity = 0) {
    const q = alive < MAX ? cells[alive++] : cells[Math.floor(Math.random() * MAX)];
    v ||= ZERO;
    q.x = p.x; q.y = p.y; q.z = p.z;
    q.vx = v.x; q.vy = v.y; q.vz = v.z;
    q.age = 0; q.life = life; q.s0 = s0; q.s1 = s1; q.g = gravity;
    q.r0 = c0.r; q.g0 = c0.g; q.b0 = c0.b;
    q.r1 = c1.r; q.g1 = c1.g; q.b1 = c1.b;
    q.a = alpha; q.kind = kind; q.rot = rand(0, TAU); q.spin = spin; q.drag = drag;
  }
  function updatePuffs(dt) {
    const pos = aPos.array, col = aCol.array, misc = aMisc.array;
    for (let i = 0; i < alive; ) {
      const q = cells[i];
      q.age += dt;
      if (q.age >= q.life) {
        cells[i] = cells[--alive];
        cells[alive] = q;
        continue;
      }
      const u = q.age / q.life, ease = 1 - (1 - u) * (1 - u), slow = q.drag ? Math.exp(-q.drag * dt) : 1;
      q.vx *= slow; q.vy *= slow; q.vz *= slow;
      q.vy -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.spin * dt;
      pos[i * 4] = q.x; pos[i * 4 + 1] = q.y; pos[i * 4 + 2] = q.z;
      pos[i * 4 + 3] = q.s0 + (q.s1 - q.s0) * ease;
      col[i * 4] = q.r0 + (q.r1 - q.r0) * u; col[i * 4 + 1] = q.g0 + (q.g1 - q.g0) * u; col[i * 4 + 2] = q.b0 + (q.b1 - q.b0) * u;
      col[i * 4 + 3] = q.a * Math.min(1, u * 12) * Math.pow(1 - u, 1.3);
      misc[i * 2] = q.rot; misc[i * 2 + 1] = q.kind;
      i++;
    }
    geometry.instanceCount = alive;
    aPos.needsUpdate = aCol.needsUpdate = aMisc.needsUpdate = true;
  }

  // ---------- Комья, осколки и конфетти: падают с тяжестью и кувыркаются ----------
  const CHUNKS = quality < 1 ? 140 : 260;
  const dummy = new T.Object3D();
  const chunkMesh = new T.InstancedMesh(GEO.low, new T.MeshStandardMaterial({ flatShading: true, roughness: 0.55, metalness: 0.05 }), CHUNKS);
  chunkMesh.frustumCulled = false;
  chunkMesh.setColorAt(0, new T.Color(1, 1, 1));
  scene.add(chunkMesh);
  const chunks = Array.from({ length: CHUNKS }, () => ({ p: V(), v: V(), axis: V(1, 0, 0), angle: 0, spin: 0, life: 0, max: 1, s: V(1, 1, 1), floor: -1e9, flutter: 0 }));
  let chunkNext = 0;
  const shade = new T.Color();
  function debris(p, hexes, count, speed, size, { up = 0.6, life = 1.6, floor = -1e9, flat = false, flutter = 0, dir = null } = {}) {
    for (let i = 0; i < count; i++) {
      const c = chunks[chunkNext];
      chunkMesh.setColorAt(chunkNext, shade.set(pick(hexes)).multiplyScalar(rand(0.82, 1.05)));
      chunkNext = (chunkNext + 1) % CHUNKS;
      c.p.copy(p);
      c.v.set(rand(-1, 1), rand(0, 1) + up, rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
      if (dir) c.v.addScaledVector(dir, rand(0.5, 1));
      c.axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      c.angle = rand(0, TAU);
      c.spin = rand(3, 10);
      c.life = c.max = life * rand(0.7, 1.2);
      c.floor = floor;
      c.flutter = flutter;
      const k = size * rand(0.55, 1.35);
      if (flat) c.s.set(k, k * 0.08, k * 0.6);
      else c.s.set(k, k * rand(0.6, 1), k * rand(0.7, 1.1));
    }
    chunkMesh.instanceColor.needsUpdate = true;
  }

  // ---------- Искры ----------
  const SPARKS = quality < 1 ? 160 : 300;
  const sparkMesh = new T.InstancedMesh(GEO.oct, new T.MeshBasicMaterial({ toneMapped: false }), SPARKS);
  sparkMesh.frustumCulled = false;
  sparkMesh.setColorAt(0, new T.Color(1, 1, 1));
  scene.add(sparkMesh);
  const sparks = Array.from({ length: SPARKS }, () => ({ p: V(), v: V(), life: 0, max: 1, s: 1 }));
  let sparkNext = 0;
  const aim = V();
  function burst(p, hexes, count, speed, size) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkNext];
      sparkMesh.setColorAt(sparkNext, tone(pick(hexes), 2.4));
      sparkNext = (sparkNext + 1) % SPARKS;
      s.p.copy(p);
      s.v.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
      s.life = s.max = rand(0.35, 0.9);
      s.s = size * rand(0.5, 1.3);
    }
    sparkMesh.instanceColor.needsUpdate = true;
  }

  function update(dt) {
    updatePuffs(dt);
    for (let i = 0; i < SPARKS; i++) {
      const s = sparks[i];
      if (s.life <= 0 && s.s === 0) continue;
      if (s.life > 0) {
        s.life -= dt;
        s.p.addScaledVector(s.v, dt);
        s.v.y -= 6 * dt;
        s.v.multiplyScalar(Math.pow(0.3, dt));
      }
      const size = s.life > 0 ? (s.life / s.max) * s.s : 0;
      if (size === 0) s.s = 0;
      dummy.position.copy(s.p);
      dummy.lookAt(aim.copy(s.p).add(s.v));
      dummy.scale.set(size * 0.5, size * 0.5, size * (1 + s.v.length() * 0.12));
      dummy.updateMatrix();
      sparkMesh.setMatrixAt(i, dummy.matrix);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < CHUNKS; i++) {
      const c = chunks[i];
      if (c.life <= 0 && c.max === 0) continue;
      if (c.life > 0) {
        c.life -= dt;
        c.v.y -= (c.flutter ? 5 : 22) * dt;
        if (c.flutter) {
          c.v.multiplyScalar(Math.pow(0.35, dt));
          c.p.x += Math.sin(c.angle * 2) * c.flutter * dt;
        }
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < c.floor) {
          c.p.y = c.floor;
          c.v.y *= -0.3;
          c.v.x *= 0.6;
          c.v.z *= 0.6;
        }
        c.angle += c.spin * dt;
      } else c.max = 0;
      dummy.position.copy(c.p);
      dummy.quaternion.setFromAxisAngle(c.axis, c.angle);
      dummy.scale.copy(c.s).multiplyScalar(c.life > 0 ? Math.min(1, c.life / (c.max * 0.3)) : 0);
      dummy.updateMatrix();
      chunkMesh.setMatrixAt(i, dummy.matrix);
    }
    chunkMesh.instanceMatrix.needsUpdate = true;
  }

  function clear() {
    alive = 0;
    geometry.instanceCount = 0;
    for (const s of sparks) s.life = 0;
    for (const c of chunks) c.life = 0;
  }

  return { puff, burst, debris, update, clear };
}
