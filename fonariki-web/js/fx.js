// Свечение и частицы: светлячки со следами и кольцами мутаций (одна отрисовка на всех), пятна
// света на земле, искры, угольки, дым, облачка теней, пламя костра, лучи фонарей.
import { T, TAU, GLSL_NOISE, hot, clamp } from "./kit.js?v=16ea7301";
import { U } from "./world.js?v=16ea7301";

const quad = () => {
  const g = new T.InstancedBufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  return g;
};

// ---------- Светящиеся точки: светлячки, следы, искры-звёздочки, летящие огоньки ----------
// kind: 0 — шарик, 1 — гигант (зелёное кольцо), 2 — золотой, 3 — радужный, 4 — звёздочка с лучами
export class Glows {
  constructor(scene, max = 2400) {
    this.max = max;
    const g = quad();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.misc = new Float32Array(max * 4);
    this.aPos = new T.InstancedBufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage);
    this.aCol = new T.InstancedBufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage);
    this.aMisc = new T.InstancedBufferAttribute(this.misc, 4).setUsage(T.DynamicDrawUsage);
    g.setAttribute("iPos", this.aPos);
    g.setAttribute("iCol", this.aCol);
    g.setAttribute("iMisc", this.aMisc);
    g.instanceCount = 0;
    this.geo = g;
    const material = new T.ShaderMaterial({
      uniforms: { uTime: U.uTime, uFogDensity: U.uFogDensity },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 iPos, iCol; attribute vec4 iMisc;
        uniform float uFogDensity;
        varying vec2 vUv; varying vec3 vCol; varying vec3 vMisc;
        void main() {
          vUv = position.xy;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iMisc.x;
          float fz = length(mv.xyz);
          vCol = iCol;
          vMisc = vec3(iMisc.y, iMisc.z * (0.35 + 0.65 * exp(-uFogDensity * uFogDensity * fz * fz * 0.5)), iMisc.w);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv; varying vec3 vCol; varying vec3 vMisc;
        void main() {
          float d = length(vUv);
          if (d > 1.0) discard;
          float kind = vMisc.x;
          vec3 col;
          if (kind > 4.5) {
            col = vCol * exp(-d * d * 3.5) * (1.0 - d);
          } else if (kind > 3.5) {
            float rays = max(exp(-abs(vUv.x) * 26.0) * exp(-abs(vUv.y) * 2.5), exp(-abs(vUv.y) * 26.0) * exp(-abs(vUv.x) * 2.5));
            col = vCol * (exp(-d * d * 30.0) * 3.0 + rays * 2.2 + exp(-d * d * 6.0) * 0.3);
          } else {
            float scale = kind > 0.5 ? 1.75 : 1.0;
            float dd = d * scale;
            col = vCol * (exp(-dd * dd * 34.0) * 2.8 + exp(-dd * dd * 6.0) * (kind > 0.5 ? 0.16 : 0.32));
            if (kind > 0.5) {
              float ring = smoothstep(0.045, 0.0, abs(d - 0.8)) * 0.6;
              vec3 rc = kind < 1.5 ? vec3(0.55, 1.0, 0.62) : kind < 2.5 ? vec3(1.0, 0.75, 0.12)
                : 0.55 + 0.45 * cos(6.2831 * (atan(vUv.y, vUv.x) / 6.2831 + uTime * 0.35 + vec3(0.0, 0.33, 0.67)));
              col += rc * ring * 2.4;
            }
          }
          gl_FragColor = vec4(col * vMisc.y, 1.0);
        }`,
    });
    this.mesh = new T.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.n = 0;
    this.tmp = new T.Color();
  }
  begin() {
    this.n = 0;
  }
  // color — T.Color или "#hex"; size — половина размера в мире
  add(x, y, z, color, size, kind = 0, alpha = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const c = typeof color === "string" ? this.tmp.set(color) : color;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.misc[i * 4] = size;
    this.misc[i * 4 + 1] = kind;
    this.misc[i * 4 + 2] = alpha;
    this.misc[i * 4 + 3] = 0;
  }
  end() {
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = true;
    this.aPos.addUpdateRange(0, this.n * 3);
    this.aCol.addUpdateRange(0, this.n * 3);
    this.aMisc.addUpdateRange(0, this.n * 4);
  }
}

// ---------- Пятна света на земле (под светлячками, грибами, фонарями) ----------
export class GroundGlows {
  constructor(scene, max = 500) {
    this.max = max;
    const g = new T.InstancedBufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([-1, 0, -1, 1, 0, 1, 1, 0, -1, -1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
    this.data = new Float32Array(max * 4);
    this.col = new Float32Array(max * 3);
    this.aData = new T.InstancedBufferAttribute(this.data, 4).setUsage(T.DynamicDrawUsage);
    this.aCol = new T.InstancedBufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage);
    g.setAttribute("iData", this.aData);
    g.setAttribute("iCol", this.aCol);
    g.instanceCount = 0;
    this.geo = g;
    const material = new T.ShaderMaterial({
      uniforms: { uDawn: U.uDawn },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */ `
        attribute vec4 iData; attribute vec3 iCol;
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          vUv = position.xz;
          vCol = iCol * iData.w;
          vec3 p = vec3(iData.x, 0.05, iData.y) + vec3(position.x, 0.0, position.z) * iData.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDawn;
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          float d = dot(vUv, vUv);
          if (d > 1.0) discard;
          float k = (1.0 - d); k *= k;
          gl_FragColor = vec4(vCol * k * (1.0 - uDawn * 0.8), 1.0);
        }`,
    });
    this.mesh = new T.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.n = 0;
    this.tmp = new T.Color();
  }
  begin() {
    this.n = 0;
  }
  add(x, z, color, size, k) {
    if (this.n >= this.max || k <= 0.001) return;
    const i = this.n++;
    const c = typeof color === "string" ? this.tmp.set(color) : color;
    this.data.set([x, z, size, k], i * 4);
    this.col.set([c.r, c.g, c.b], i * 3);
  }
  end() {
    this.geo.instanceCount = this.n;
    this.aData.needsUpdate = this.aCol.needsUpdate = true;
  }
}

// ---------- Частицы ----------
export class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.list = [];
    const g = new T.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute("position", new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute("color", new T.BufferAttribute(this.col, 4).setUsage(T.DynamicDrawUsage));
    g.setAttribute("size", new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const material = new T.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      transparent: true,
      depthWrite: false,
      blending: additive ? T.AdditiveBlending : T.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 color; attribute float size;
        uniform float uScale, uFogDensity;
        varying vec4 vCol; varying float vFog;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.5, -mv.z);
          vCol = color;
          float fz = length(mv.xyz);
          vFog = 1.0 - exp(-uFogDensity * uFogDensity * fz * fz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        varying vec4 vCol; varying float vFog;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          if (d > 1.0) discard;
          float k = 1.0 - d;
          ${additive ? "gl_FragColor = vec4(vCol.rgb * vCol.a * k * k * (1.0 - vFog * 0.7), 1.0);" : "gl_FragColor = vec4(mix(vCol.rgb, uFogColor, vFog * 0.8), vCol.a * k);"}
        }`,
    });
    this.points = new T.Points(g, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 4;
    scene.add(this.points);
    this.material = material;
  }
  // o: { x, y, z, vx, vy, vz, life, size, color (T.Color или hex), alpha, grav, drag, grow }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    const c = typeof o.color === "string" ? new T.Color(o.color) : o.color.clone();
    if (o.k) c.multiplyScalar(o.k);
    this.list.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life, max: o.life, size: o.size, c, a: o.alpha ?? 1, grav: o.grav || 0, drag: o.drag ?? 1, grow: o.grow ?? 0, wob: o.wob || 0, seed: Math.random() * 10 });
  }
  burst(n, x, y, z, color, speed = 6, size = 0.5, life = 0.9, extra = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, e = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6);
      const r = Math.sqrt(1 - e * e);
      this.emit({ x, y, z, vx: Math.cos(a) * r * s, vy: e * s * 0.8 + (extra.up || 0), vz: Math.sin(a) * r * s, life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color, ...extra });
    }
  }
  update(dt, t, wind = 0) {
    let n = 0;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L.splice(i, 1);
        continue;
      }
      const drag = Math.pow(p.drag, dt);
      p.vx = p.vx * drag + wind * dt;
      p.vz *= drag;
      p.vy = p.vy * drag - p.grav * dt;
      if (p.wob) {
        p.vx += Math.sin(t * 3 + p.seed) * p.wob * dt;
        p.vz += Math.cos(t * 2.6 + p.seed) * p.wob * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (const p of L) {
      if (n >= this.max) break;
      const k = p.life / p.max;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.c.r;
      this.col[n * 4 + 1] = p.c.g;
      this.col[n * 4 + 2] = p.c.b;
      this.col[n * 4 + 3] = p.a * Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 8 + 0.2);
      this.size[n] = p.size * (1 + p.grow * (1 - k));
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const a of ["position", "color", "size"]) this.geo.attributes[a].needsUpdate = true;
  }
  setScale(h, ratio) {
    this.material.uniforms.uScale.value = h * ratio * 0.9;
  }
}

// ---------- Пламя костра: несколько повёрнутых к камере языков ----------
export function makeFlame(scene) {
  const group = new T.Group();
  scene.add(group);
  const material = new T.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPower: { value: 1 }, uLean: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uLean, uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += uLean * uv.y * uv.y * 0.8 + sin(uTime * 7.0 + uv.y * 4.0) * 0.06 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        vec2 uv = vUv;
        float n = fbm(vec2(uv.x * 3.0, uv.y * 2.4 - uTime * 2.6));
        float n2 = vnoise(vec2(uv.x * 7.0, uv.y * 5.0 - uTime * 4.5));
        float x = (uv.x - 0.5) * 2.0;
        float w = (1.0 - uv.y) * 0.95 + 0.06;
        float shape = 1.0 - smoothstep(w * 0.55, w, abs(x + (n - 0.5) * 0.55 * uv.y));
        shape *= smoothstep(0.0, 0.08, uv.y) * (1.0 - smoothstep(0.55 + n2 * 0.4, 1.0, uv.y));
        float core = shape * (1.0 - smoothstep(0.0, 0.5, uv.y + abs(x) * 0.8));
        vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.62, 0.15), shape) * shape * 2.2 + vec3(1.0, 0.9, 0.65) * core * 2.4;
        gl_FragColor = vec4(col * uPower, 1.0);
      }`,
  });
  const tongues = [];
  for (let i = 0; i < 3; i++) {
    const m = new T.Mesh(new T.PlaneGeometry(2.2, 3.6, 1, 6).translate(0, 1.8, 0), material);
    m.position.y = 0.2;
    m.rotation.y = (i / 3) * Math.PI;
    group.add(m);
    tongues.push(m);
  }
  return {
    group,
    material,
    update(power, lean, cam) {
      material.uniforms.uPower.value = power;
      material.uniforms.uLean.value = lean;
      const s = 0.55 + power * 0.85;
      group.scale.set(s, s, s);
      // одна плоскость всегда к камере, две — крест-накрест вокруг неё
      const yaw = Math.atan2(cam.position.x - group.position.x, cam.position.z - group.position.z);
      tongues.forEach((m, i) => (m.rotation.y = yaw + (i - 1) * 0.9));
    },
  };
}

// ---------- Лучи фонарей к Большой тени ----------
export function makeBeams(scene, n = 4) {
  const material = new T.MeshBasicMaterial({ color: hot("#ffd890", 2.2), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
  const geo = new T.CylinderGeometry(0.12, 0.45, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const beams = [];
  for (let i = 0; i < n; i++) {
    const m = new T.Mesh(geo, material);
    m.visible = false;
    scene.add(m);
    beams.push(m);
  }
  return {
    set(i, from, to) {
      const m = beams[i];
      if (!m) return;
      if (!from) {
        m.visible = false;
        return;
      }
      m.visible = true;
      m.position.copy(from);
      m.lookAt(to);
      m.scale.set(1, 1, from.distanceTo(to));
    },
    hideFrom(i) {
      for (let k = i; k < beams.length; k++) beams[k].visible = false;
    },
    material,
  };
}
