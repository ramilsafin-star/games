// Эффекты боя, все из заранее созданных пулов (ничего не создаётся во время стрельбы):
// искры и огонь (светящиеся точки), дым и масло (мягкие пятна), трассеры и лучи (ленты к камере),
// следы пуль, обломки роботов и болты, гильзы, ударные волны, вспышки света.
import { T, PRIM, canvasTexture, glowTexture, TAU } from "./kit.js?v=83cf1cc4";

const V = () => new T.Vector3();
const tmp = V(), tmp2 = V(), up = new T.Vector3(0, 1, 0);

// ---------- Система частиц на точках ----------
function pointSystem(scene, N, additive, tex) {
  const g = new T.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
  g.setAttribute("position", new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
  g.setAttribute("pcolor", new T.BufferAttribute(col, 4).setUsage(T.DynamicDrawUsage));
  g.setAttribute("psize", new T.BufferAttribute(size, 1).setUsage(T.DynamicDrawUsage));
  g.boundingSphere = new T.Sphere(V(), 1e6);
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? T.AdditiveBlending : T.NormalBlending,
    uniforms: { map: { value: tex }, scale: { value: 600 } },
    vertexShader: `attribute vec4 pcolor; attribute float psize; uniform float scale; varying vec4 vC;
      void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / max(0.3, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec4 vC;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); ${additive ? "gl_FragColor = vec4(vC.rgb * t.a * vC.a, 1.0);" : "gl_FragColor = vec4(vC.rgb * t.rgb, t.a * vC.a);"} }`,
  });
  const pts = new T.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 9 : 7;
  scene.add(pts);
  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, p: V(), v: V(), c: new T.Color(), c2: new T.Color(), s0: 0, s1: 0, a: 1, drag: 0, grav: 0, floor: -1e9, bounce: 0 }));
  let next = 0;
  return {
    mat,
    spawn(p, v, color, life, s0, s1, o = {}) {
      const q = P[next];
      next = (next + 1) % N;
      q.life = life;
      q.max = life;
      q.p.copy(p);
      q.v.copy(v);
      q.c.set(color);
      if (o.mult) q.c.multiplyScalar(o.mult);
      q.c2.copy(o.to ? new T.Color(o.to).multiplyScalar(o.mult || 1) : q.c);
      q.s0 = s0;
      q.s1 = s1;
      q.a = o.alpha ?? 1;
      q.drag = o.drag ?? 0;
      q.grav = o.grav ?? 0;
      q.floor = o.floor ?? -1e9;
      q.bounce = o.bounce ?? 0;
      return q;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const q = P[i];
        if (q.life <= 0) {
          size[i] = 0;
          continue;
        }
        q.life -= dt;
        const k = 1 - q.life / q.max;
        q.v.y -= q.grav * dt;
        if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.p.y < q.floor) {
          q.p.y = q.floor;
          q.v.y = -q.v.y * q.bounce;
          q.v.x *= 0.6;
          q.v.z *= 0.6;
        }
        pos[i * 3] = q.p.x;
        pos[i * 3 + 1] = q.p.y;
        pos[i * 3 + 2] = q.p.z;
        const c = tmpC.copy(q.c).lerp(q.c2, k);
        col[i * 4] = c.r;
        col[i * 4 + 1] = c.g;
        col[i * 4 + 2] = c.b;
        col[i * 4 + 3] = q.a * (q.life <= 0 ? 0 : Math.min(1, (1 - k) * 2.2)) * Math.min(1, k * 12 + 0.25);
        size[i] = q.s0 + (q.s1 - q.s0) * k;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.pcolor.needsUpdate = true;
      g.attributes.psize.needsUpdate = true;
    },
  };
}
const tmpC = new T.Color();

// ---------- Ленты: трассеры, лучи, разряды ----------
function beamSystem(scene, N) {
  const g = new T.BufferGeometry();
  const A = new Float32Array(N * 4 * 3), B = new Float32Array(N * 4 * 3), S = new Float32Array(N * 4 * 2), C = new Float32Array(N * 4 * 4);
  const idx = [];
  for (let i = 0; i < N; i++) {
    const k = i * 4;
    idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    S.set([-1, 0, 1, 0, -1, 1, 1, 1], i * 8);
  }
  g.setIndex(idx);
  g.setAttribute("position", new T.BufferAttribute(new Float32Array(N * 4 * 3), 3));
  g.setAttribute("ba", new T.BufferAttribute(A, 3).setUsage(T.DynamicDrawUsage));
  g.setAttribute("bb", new T.BufferAttribute(B, 3).setUsage(T.DynamicDrawUsage));
  g.setAttribute("bs", new T.BufferAttribute(S, 2));
  g.setAttribute("bc", new T.BufferAttribute(C, 4).setUsage(T.DynamicDrawUsage));
  g.boundingSphere = new T.Sphere(V(), 1e6);
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader: `attribute vec3 ba; attribute vec3 bb; attribute vec2 bs; attribute vec4 bc; varying vec4 vC; varying float vS;
      void main(){
        vec4 a = modelViewMatrix * vec4(ba,1.0), b = modelViewMatrix * vec4(bb,1.0);
        vec4 p = mix(a, b, bs.y);
        vec3 d = normalize(b.xyz - a.xyz + vec3(1e-5));
        vec3 side = normalize(cross(d, normalize(-p.xyz)));
        p.xyz += side * bs.x * bc.a * 0.5 * (0.6 + 0.4 * max(1.0, -p.z * 0.04));
        vC = vec4(bc.rgb, 1.0); vS = bs.x;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `varying vec4 vC; varying float vS; void main(){ float k = 1.0 - abs(vS); gl_FragColor = vec4(vC.rgb * k * k, 1.0); }`,
  });
  const mesh = new T.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  scene.add(mesh);
  const headPoint = V();
  const items = Array.from({ length: N }, () => ({ life: 0, max: 1, a: V(), b: V(), c: new T.Color(), w: 0.04, speed: 0, keep: false }));
  let next = 0;
  const write = (i) => {
    const it = items[i];
    const k = it.life > 0 ? it.life / it.max : 0;
    let a = it.a, b = it.b;
    if (it.speed) {
      // трассер летит: короткий отрезок от начала к концу
      const L = a.distanceTo(b);
      const head = Math.min(L, (1 - k) * it.speed * it.max + 0.001);
      const tail = Math.max(0, head - Math.min(7, L * 0.5));
      tmp.copy(b).sub(a).normalize();
      a = tmp2.copy(it.a).addScaledVector(tmp, tail);
      b = headPoint.copy(it.a).addScaledVector(tmp, head);
    }
    const f = it.keep ? 1 : k;
    const width = it.life > 0 ? it.w : 0;
    for (let v = i * 4; v < i * 4 + 4; v++) {
      const p = v * 3, c = v * 4;
      A[p] = a.x; A[p + 1] = a.y; A[p + 2] = a.z;
      B[p] = b.x; B[p + 1] = b.y; B[p + 2] = b.z;
      C[c] = it.c.r * f; C[c + 1] = it.c.g * f; C[c + 2] = it.c.b * f; C[c + 3] = width;
    }
  };
  return {
    add(a, b, color, w, life, speed = 0, mult = 1) {
      const it = items[next];
      next = (next + 1) % N;
      it.a.copy(a);
      it.b.copy(b);
      it.c.set(color).multiplyScalar(mult);
      it.w = w;
      it.life = it.max = life;
      it.speed = speed;
      it.keep = false;
      return it;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const it = items[i];
        if (it.life > 0) it.life -= dt;
        write(i);
      }
      g.attributes.ba.needsUpdate = true;
      g.attributes.bb.needsUpdate = true;
      g.attributes.bc.needsUpdate = true;
    },
  };
}

// ---------- Следы пуль ----------
function decalSystem(scene, N) {
  const tex = canvasTexture(64, 64, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(10,10,10,1)");
    g.addColorStop(0.22, "rgba(20,18,16,0.95)");
    g.addColorStop(0.4, "rgba(40,34,30,0.5)");
    g.addColorStop(1, "rgba(40,34,30,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  }, { clamp: true });
  const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), mat, N);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const d = new T.Object3D();
  d.scale.setScalar(0);
  d.updateMatrix();
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, d.matrix);
  scene.add(mesh);
  let next = 0;
  return {
    add(p, n, s) {
      d.position.copy(p).addScaledVector(n, 0.012);
      d.lookAt(tmp.copy(d.position).add(n));
      d.rotateZ(Math.random() * TAU);
      d.scale.setScalar(s);
      d.updateMatrix();
      mesh.setMatrixAt(next, d.matrix);
      next = (next + 1) % N;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- Мелкие тела с физикой: болты, гильзы, осколки ----------
function bitSystem(scene, N, geo, mat, world) {
  const mesh = new T.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  if (mesh.instanceColor === null) mesh.setColorAt(0, new T.Color(1, 1, 1));
  scene.add(mesh);
  const d = new T.Object3D();
  const B = Array.from({ length: N }, () => ({ life: 0, p: V(), v: V(), r: new T.Euler(), w: V(), s: 1, rest: false }));
  let next = 0;
  return {
    add(p, v, s, life, color) {
      const b = B[next];
      if (color) mesh.setColorAt(next, tmpC.set(color));
      next = (next + 1) % N;
      b.life = life;
      b.p.copy(p);
      b.v.copy(v);
      b.s = s;
      b.rest = false;
      b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.w.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const b = B[i];
        if (b.life <= 0) {
          d.scale.setScalar(0);
          d.updateMatrix();
          mesh.setMatrixAt(i, d.matrix);
          continue;
        }
        b.life -= dt;
        if (!b.rest) {
          b.v.y -= 14 * dt;
          b.p.addScaledVector(b.v, dt);
          b.r.x += b.w.x * dt;
          b.r.y += b.w.y * dt;
          b.r.z += b.w.z * dt;
          const g = world.groundAt(b.p.x, b.p.z, 0.02, b.p.y + 0.05);
          if (b.p.y < g + b.s * 0.5) {
            b.p.y = g + b.s * 0.5;
            if (Math.abs(b.v.y) < 1.2) {
              b.rest = true;
              b.v.set(0, 0, 0);
            } else {
              b.v.y = -b.v.y * 0.35;
              b.v.x *= 0.55;
              b.v.z *= 0.55;
              b.w.multiplyScalar(0.5);
            }
          }
        }
        d.position.copy(b.p);
        d.rotation.copy(b.r);
        d.scale.setScalar(b.s * Math.min(1, b.life * 2));
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- Всё вместе ----------
export function createFx(scene, camera, world, q) {
  const glow = glowTexture(64, 2.2);
  const smokeTex = canvasTexture(64, 64, (c, w) => {
    for (let i = 0; i < 9; i++) {
      const x = w / 2 + (Math.random() - 0.5) * w * 0.35, y = w / 2 + (Math.random() - 0.5) * w * 0.35, r = w * (0.2 + Math.random() * 0.22);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, w);
    }
  }, { clamp: true });
  const NP = Math.round(1800 * q.particles), NS = Math.round(700 * q.particles);
  const add = pointSystem(scene, NP, true, glow);
  const smoke = pointSystem(scene, NS, false, smokeTex);
  const beams = beamSystem(scene, 160);
  const decals = decalSystem(scene, q.decals);
  const metal = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, metalness: 0.8 });
  const bolts = bitSystem(scene, 140, new T.CylinderGeometry(0.5, 0.5, 0.45, 6), metal, world);
  const casingMat = new T.MeshStandardMaterial({ color: "#d9a441", roughness: 0.3, metalness: 0.9 });
  const casings = bitSystem(scene, 60, new T.CylinderGeometry(0.5, 0.5, 2.4, 6), casingMat, world);
  const chunkMat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 });
  const chunks = bitSystem(scene, 120, new T.BoxGeometry(1, 1, 1), chunkMat, world);
  // ударные волны (кольцо на земле и сфера)
  const waves = [];
  const ringGeo = new T.RingGeometry(0.8, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    const s = new T.Mesh(PRIM.ball, new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = s.visible = false;
    scene.add(m, s);
    waves.push({ ring: m, ball: s, life: 0, max: 1, r: 1, color: new T.Color() });
  }
  let wi = 0;
  // красные круги — сюда летят ракеты
  const marks = [];
  const markGeo = new T.RingGeometry(0.85, 1, 40);
  markGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    const m = new T.Mesh(markGeo, new T.MeshBasicMaterial({ color: new T.Color(2, 0.2, 0.1), transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending }));
    m.visible = false;
    scene.add(m);
    marks.push(m);
  }
  // свет: вспышка выстрела и взрывы (постоянные, чтобы шейдеры не пересобирались)
  const lights = [];
  for (let i = 0; i < q.lights; i++) {
    const L = new T.PointLight("#ffd9a0", 0, 10, 1.6);
    L.castShadow = false;
    scene.add(L);
    lights.push({ L, life: 0, max: 1, I: 0 });
  }
  let li = 0;
  const fallen = []; // обломки роботов
  const floorAt = (p) => world.groundAt(p.x, p.z, 0.05, p.y + 0.2);

  const api = {
    add, smoke, beams, decals,
    flash(p, color, I, range, life) {
      if (!lights.length) return;
      const s = lights[li];
      li = (li + 1) % lights.length;
      s.L.position.copy(p);
      s.L.color.set(color);
      s.L.distance = range;
      s.I = I;
      s.L.intensity = I;
      s.life = s.max = life;
    },
    sparks(p, n, dir, color = "#ffc070", speed = 6, o = {}) {
      for (let i = 0; i < n; i++) {
        tmp.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
        if (dir) tmp.addScaledVector(dir, speed * 0.6);
        add.spawn(p, tmp, color, 0.25 + Math.random() * 0.35, o.size ?? 0.05, 0.01, { mult: o.mult ?? 3, grav: 9, drag: 1.5, floor: floorAt(p), bounce: 0.3, to: o.to || "#ff5a1a" });
      }
    },
    puff(p, color, n, size, life, rise = 0.6, alpha = 0.7) {
      for (let i = 0; i < n; i++) {
        tmp.set((Math.random() - 0.5) * 1.2, rise * (0.5 + Math.random()), (Math.random() - 0.5) * 1.2);
        smoke.spawn(p, tmp, color, life * (0.7 + Math.random() * 0.6), size * 0.5, size * (1.4 + Math.random()), { alpha, drag: 1.2 });
      }
    },
    // попадание пули
    impact(e) {
      const p = tmp2.set(e.x, e.y, e.z);
      const n = new T.Vector3(e.nx, e.ny, e.nz).normalize();
      if (e.kind === "wall" || e.kind === "glassHard") {
        if (!e.enemy) decals.add(p, n, 0.09 + Math.random() * 0.05);
        api.sparks(p, e.enemy ? 3 : 6, n, "#ffd8a0", 4, { size: 0.04 });
        api.puff(p, e.skin === "sand" || e.skin === "rock" ? "#c9a070" : "#9a9a9a", e.enemy ? 1 : 2, 0.3, 0.6, 0.4, 0.45);
        if (!e.enemy && Math.random() < 0.5) chunks.add(p, tmp.copy(n).multiplyScalar(2 + Math.random() * 2).add(new T.Vector3(0, 2, 0)), 0.04, 1.2, "#8a8a8a");
      } else if (e.kind === "robot" || e.kind === "core") {
        const core = e.kind === "core";
        api.sparks(p, core ? 14 : 8, n, core ? "#ffe0a0" : "#ffb060", core ? 7 : 5, { size: core ? 0.07 : 0.05, mult: core ? 4 : 3 });
        if (Math.random() < 0.4) api.puff(p, "#2a2622", 1, 0.25, 0.7, 0.3, 0.55);
        if (core) add.spawn(p, tmp.set(0, 0, 0), "#fff0c0", 0.09, 0.5, 0.9, { mult: 3 });
      } else if (e.kind === "shield") {
        api.sparks(p, 8, n, "#9fe8ff", 5, { size: 0.05, mult: 3, to: "#3fa0ff" });
        add.spawn(p, tmp.set(0, 0, 0), "#7fdcff", 0.15, 0.4, 1.1, { mult: 2.5 });
      }
    },
    glass(e) {
      const p = tmp2.set(e.x, e.y, e.z);
      for (let i = 0; i < 26; i++) {
        tmp.set((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4);
        add.spawn(tmp2.set(e.x + (Math.random() - 0.5) * 1.6, e.y + (Math.random() - 0.5) * 1.6, e.z + (Math.random() - 0.5) * 0.4), tmp, "#cfefff", 0.6 + Math.random() * 0.5, 0.06, 0.04, { mult: 1.6, grav: 12, floor: floorAt(p), bounce: 0.25 });
      }
    },
    tracer(a, b, color, w = 0.045, mult = 3, speed = 260) {
      const L = a.distanceTo(b);
      beams.add(a, b, color, w, Math.max(0.05, Math.min(0.25, L / speed + 0.03)), speed, mult);
    },
    beam(a, b, color, w, mult = 3) {
      beams.add(a, b, color, w, 0.035, 0, mult);
    },
    muzzle(p, dir, color, scale = 1) {
      add.spawn(p, tmp.set(0, 0, 0), color, 0.05, 0.35 * scale, 0.55 * scale, { mult: 4 });
      for (let i = 0; i < 4; i++) {
        tmp.copy(dir).multiplyScalar(4 + Math.random() * 5).add(new T.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5));
        add.spawn(p, tmp, "#ffd27a", 0.06 + Math.random() * 0.05, 0.08 * scale, 0.02, { mult: 3 });
      }
      if (Math.random() < 0.5) smoke.spawn(p, tmp.copy(dir).multiplyScalar(0.8).add(new T.Vector3(0, 0.4, 0)), "#b0b0b0", 0.7, 0.08, 0.5, { alpha: 0.25, drag: 2 });
    },
    casing(p, v) {
      casings.add(p, v, 0.012, 2.2);
    },
    wave(p, r, color, life, ground = true, ball = true) {
      const w = waves[wi];
      wi = (wi + 1) % waves.length;
      w.ring.position.copy(p);
      w.ring.position.y = floorAt(p) + 0.06;
      w.ball.position.copy(p);
      w.life = w.max = life;
      w.r = r;
      w.color.set(color);
      w.ring.visible = ground;
      w.ball.visible = ball;
    },
    explosion(p, r, kind) {
      const big = kind === "rocket" ? 0.8 : kind === "roller" ? 0.75 : kind === "boss" ? 2.4 : kind === "relay" ? 1.5 : 1;
      const fl = floorAt(p);
      add.spawn(p, tmp.set(0, 0, 0), "#fff4d0", 0.12, r * 0.6 * big, r * 1.3 * big, { mult: 5 });
      for (let i = 0; i < 26 * big; i++) {
        tmp.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(r * (1.2 + Math.random() * 1.8));
        add.spawn(p, tmp, i % 3 ? "#ffb040" : "#ff6020", 0.35 + Math.random() * 0.4, r * 0.28 * big, r * 0.06, { mult: 3.2, drag: 3.5, to: "#a02000" });
      }
      api.sparks(p, 34 * big, null, "#ffe0a0", 14, { size: 0.07, mult: 4 });
      for (let i = 0; i < 14 * big; i++) {
        tmp.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 3);
        smoke.spawn(tmp2.copy(p).add(new T.Vector3((Math.random() - 0.5) * r * 0.6, Math.random() * 0.6, (Math.random() - 0.5) * r * 0.6)), tmp, i % 2 ? "#2c2a28" : "#4a4440", 2.2 + Math.random() * 1.8, r * 0.3, r * 0.9, { alpha: 0.75, drag: 1.4 });
      }
      for (let i = 0; i < 10 * big; i++) chunks.add(p, tmp.set((Math.random() - 0.5) * 12, 4 + Math.random() * 7, (Math.random() - 0.5) * 12), 0.06 + Math.random() * 0.08, 3, "#3a3a3a");
      api.wave(p, r * 1.35, kind === "boss" ? "#ffb070" : "#ffd0a0", 0.5 * Math.max(1, big * 0.8));
      api.flash(tmp2.set(p.x, Math.max(p.y, fl + 1), p.z), "#ffb060", 60 * big, r * 4, 0.35);
    },
    emp(p, r) {
      api.wave(p, r, "#5fd8ff", 0.65);
      add.spawn(p, tmp.set(0, 0, 0), "#9fe8ff", 0.2, r * 0.5, r * 1.6, { mult: 3.5 });
      // разряды: ломаные линии от центра
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * TAU, e = (Math.random() - 0.3) * 1.2;
        let from = tmp2.copy(p);
        const dir = new T.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
        const L = r * (0.6 + Math.random() * 0.5);
        const steps = 6;
        for (let s = 1; s <= steps; s++) {
          const to = new T.Vector3().copy(p).addScaledVector(dir, (L * s) / steps).add(new T.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
          beams.add(from.clone(), to, k % 2 ? "#9fe8ff" : "#4fb8ff", 0.06, 0.25 + Math.random() * 0.2, 0, 3);
          from = to;
        }
      }
      api.flash(p, "#6fd0ff", 45, r * 3.5, 0.4);
      api.sparks(p, 30, null, "#bff4ff", 9, { size: 0.05, mult: 3, to: "#3f8fff" });
    },
    // электрические искры на оглушённом роботе
    arc(p, size = 0.8) {
      const from = new T.Vector3(p.x + (Math.random() - 0.5) * size, p.y + (Math.random() - 0.5) * size, p.z + (Math.random() - 0.5) * size);
      const to = new T.Vector3(p.x + (Math.random() - 0.5) * size, p.y + (Math.random() - 0.5) * size, p.z + (Math.random() - 0.5) * size);
      beams.add(from, to, "#7fd8ff", 0.035, 0.08, 0, 3);
    },
    smokeCloud(p, r) {
      for (let i = 0; i < 4; i++) {
        tmp.set((Math.random() - 0.5) * r * 0.7, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * r * 0.7);
        smoke.spawn(tmp2.set(p.x + (Math.random() - 0.5) * r * 0.9, p.y + Math.random() * r * 0.4, p.z + (Math.random() - 0.5) * r * 0.9), tmp, "#c9d0d8", 3.2 + Math.random() * 1.5, r * 0.4, r * 0.95, { alpha: 0.42, drag: 0.6 });
      }
    },
    bolts(p, n, color = "#b8c0c8") {
      for (let i = 0; i < n; i++) bolts.add(p, tmp.set((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6), 0.03 + Math.random() * 0.04, 4 + Math.random() * 3, color);
    },
    // робот разваливается на свои части
    breakup(root, center, power = 1) {
      const parts = [];
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (o.isMesh && o.parent && o.geometry && o.visible) parts.push(o);
      });
      for (const m of parts) {
        const wm = m.matrixWorld.clone();
        const piece = new T.Mesh(m.geometry, m.material);
        wm.decompose(piece.position, piece.quaternion, piece.scale);
        piece.castShadow = true;
        scene.add(piece);
        const out = piece.position.clone().sub(center);
        out.y = Math.abs(out.y) + 0.5;
        out.normalize().multiplyScalar((2.5 + Math.random() * 3) * power);
        out.y += 2 + Math.random() * 3 * power;
        fallen.push({ m: piece, v: out, w: new T.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9), life: 6 + Math.random() * 2, rest: false });
      }
      while (fallen.length > 70) {
        const f = fallen.shift();
        scene.remove(f.m);
      }
    },
    marks,
    update(dt) {
      add.update(dt);
      smoke.update(dt);
      beams.update(dt);
      bolts.update(dt);
      casings.update(dt);
      chunks.update(dt);
      for (const s of lights) {
        if (s.life > 0) {
          s.life -= dt;
          s.L.intensity = Math.max(0, s.I * (s.life / s.max));
        } else s.L.intensity = 0;
      }
      for (const w of waves) {
        if (w.life <= 0) {
          w.ring.visible = w.ball.visible = false;
          continue;
        }
        w.life -= dt;
        const k = 1 - w.life / w.max;
        const r = w.r * (0.2 + k * 1.0);
        w.ring.scale.setScalar(r);
        w.ball.scale.setScalar(r * 0.8);
        const a = (1 - k) * (1 - k);
        w.ring.material.color.copy(w.color).multiplyScalar(2.5 * a);
        w.ball.material.color.copy(w.color).multiplyScalar(0.7 * a);
        if (w.life <= 0) w.ring.visible = w.ball.visible = false;
      }
      for (let i = fallen.length - 1; i >= 0; i--) {
        const f = fallen[i];
        f.life -= dt;
        if (!f.rest) {
          f.v.y -= 14 * dt;
          f.m.position.addScaledVector(f.v, dt);
          f.m.rotation.x += f.w.x * dt;
          f.m.rotation.y += f.w.y * dt;
          f.m.rotation.z += f.w.z * dt;
          const g = world.groundAt(f.m.position.x, f.m.position.z, 0.1, f.m.position.y + 0.3);
          if (f.m.position.y < g + 0.08) {
            f.m.position.y = g + 0.08;
            if (Math.abs(f.v.y) < 1.5) {
              f.rest = true;
            } else {
              f.v.y = -f.v.y * 0.3;
              f.v.x *= 0.5;
              f.v.z *= 0.5;
              f.w.multiplyScalar(0.4);
            }
          }
          if (Math.random() < dt * 6) smoke.spawn(f.m.position, tmp.set(0, 0.8, 0), "#2a2622", 1, 0.1, 0.5, { alpha: 0.45 });
        }
        if (f.life < 1.2) f.m.position.y -= dt * 0.25;
        if (f.life <= 0) {
          scene.remove(f.m);
          fallen.splice(i, 1);
        }
      }
    },
    clear() {
      for (const f of fallen) scene.remove(f.m);
      fallen.length = 0;
    },
  };
  void up;
  return api;
}
