// Эффекты: искры, огонь, дым, обломки, ударные волны, снаряды, молнии и луч.
import * as T from '../../vendor/three/three.module.min.js';
import { Kit, rbox, toyMaterial, BEND_GLSL, hdr } from './kit.js';

const POINT_VERT = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
void main(){
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  ${BEND_GLSL}
  gl_PointSize = aSize * uScale / max(0.2, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}`;
const POINT_FRAG = `
varying vec4 vColor; uniform float uSoft;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float a = pow(1.0 - d, uSoft);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class PointCloud {
  constructor(scene, max, blending, soft, order) {
    this.max = max;
    this.items = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('aColor', new T.BufferAttribute(this.col, 4).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('aSize', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 }, uSoft: { value: soft } };
    this.mesh = new T.Points(geo, new T.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, blending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }

  add(p) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(p);
  }

  update(dt, carry) {
    const list = this.items;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.g * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.vz *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += (p.vz + carry * p.carry) * dt;
      if (p.y < 0.05 && p.g > 0) {
        p.y = 0.05;
        p.vy *= -0.4;
      }
      list[n++] = p;
      const k = n - 1;
      const t = p.life / p.max;
      const fade = p.fade ? Math.min(1, t * 2.6) : t;
      this.pos[k * 3] = p.x;
      this.pos[k * 3 + 1] = p.y;
      this.pos[k * 3 + 2] = p.z;
      this.col[k * 4] = p.r;
      this.col[k * 4 + 1] = p.g2;
      this.col[k * 4 + 2] = p.b;
      this.col[k * 4 + 3] = p.a * fade;
      this.size[k] = p.size * (p.grow ? 1 + (1 - t) * p.grow : t * 0.5 + 0.5);
    }
    list.length = n;
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }
}

const C = new T.Color();
const V = new T.Vector3();
const Z = new T.Vector3(0, 0, 1);
const Q = new T.Quaternion();
const M = new T.Matrix4();
const SCALE = new T.Vector3();
const POS = new T.Vector3();
const dummy = new T.Object3D();

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new PointCloud(scene, 900, T.AdditiveBlending, 1.6, 8);
    this.smoke = new PointCloud(scene, 260, T.NormalBlending, 1.1, 6);

    // Обломки с освещением
    const chunk = new Kit().add(rbox(1, 1, 1, 0.14), 0xffffff).build();
    this.chunkMesh = new T.InstancedMesh(chunk, toyMaterial({ roughness: 0.5, rim: 0.3 }), 240);
    this.chunkMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.chunkMesh.castShadow = true;
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.count = 0;
    this.chunkMesh.setColorAt(0, C.set(0xffffff));
    scene.add(this.chunkMesh);
    this.chunks = [];

    // Снаряды: вытянутые светящиеся овалы
    this.boltMesh = new T.InstancedMesh(new T.SphereGeometry(0.5, 7, 5).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff }), 360);
    this.boltMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.boltMesh.frustumCulled = false;
    this.boltMesh.count = 0;
    this.boltMesh.setColorAt(0, C.set(0xffffff));
    this.boltMesh.renderOrder = 5;
    scene.add(this.boltMesh);

    this.orbMesh = new T.InstancedMesh(new T.SphereGeometry(1, 14, 10), new T.MeshBasicMaterial({ color: 0xffffff }), 90);
    this.orbMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.orbMesh.frustumCulled = false;
    this.orbMesh.count = 0;
    this.orbMesh.setColorAt(0, C.set(0xffffff));
    this.orbMesh.castShadow = true;
    scene.add(this.orbMesh);

    const rocket = new Kit();
    rocket.cyl(0xf4f2ec, 0, 0, 0, 0.11, 0.11, 0.62, Math.PI / 2, 0, 0, 10);
    rocket.cone(0xe53935, 0, 0, -0.42, 0.11, 0.26, -Math.PI / 2, 0, 0, 10);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      rocket.box(0xe53935, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.26, 0.12, 0.04, 0.2, 0, 0, a, 0.008);
    }
    this.rocketMesh = new T.InstancedMesh(rocket.build(), toyMaterial({ roughness: 0.4 }), 24);
    this.rocketMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.rocketMesh.frustumCulled = false;
    this.rocketMesh.castShadow = true;
    this.rocketMesh.count = 0;
    scene.add(this.rocketMesh);

    // Ударные волны по земле
    this.rings = [];
    const ringGeo = new T.RingGeometry(0.84, 1, 56, 1).rotateX(-Math.PI / 2);
    this.ringThin = new T.RingGeometry(0.965, 1, 72, 1).rotateX(-Math.PI / 2);
    this.ringWide = ringGeo;
    for (let i = 0; i < 8; i++) {
      const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 4;
      scene.add(m);
      this.rings.push({ mesh: m, age: 1, life: 1, radius: 1, carry: true });
    }

    // Одна подвижная лампа на вспышки: дорога и герой подсвечиваются выстрелами и взрывами
    this.light = new T.PointLight(0xffffff, 0, 22, 1.7);
    scene.add(this.light);
    this.lightPower = 0;

    const beamGeo = new T.CylinderGeometry(0.5, 0.5, 1, 10, 46, true).rotateX(Math.PI / 2);
    this.beamCore = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: hdr(0xffffff, 3.1) }));
    this.beamGlow = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }));
    for (const m of [this.beamCore, this.beamGlow]) {
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 5;
      scene.add(m);
    }

    this.arcs = [];
    this.beam = null;
    this.boltCount = 0;
    this.orbCount = 0;
    this.rocketCount = 0;
    this.time = 0;
  }

  setScale(height, fovDeg) {
    const s = height / (2 * Math.tan(T.MathUtils.degToRad(fovDeg) / 2));
    this.glow.uniforms.uScale.value = s;
    this.smoke.uniforms.uScale.value = s;
  }

  spark(x, y, z, color, count = 6, speed = 6, size = 0.26, life = 0.42, power = 2.4) {
    C.set(color).multiplyScalar(power);
    for (let i = 0; i < count; i++) {
      const l = life * (0.5 + Math.random() * 0.7);
      this.glow.add({
        x, y, z,
        vx: (Math.random() - 0.5) * speed * 2, vy: Math.random() * speed * 1.2 + speed * 0.2, vz: (Math.random() - 0.5) * speed * 2,
        g: 15, drag: 1.4, life: l, max: l, size: size * (0.5 + Math.random()), r: C.r, g2: C.g, b: C.b, a: 1, carry: 1,
      });
    }
  }

  // Вспышка на одном месте
  flash(x, y, z, color, size = 1.4, life = 0.14, power = 3, carry = 0) {
    C.set(color).multiplyScalar(power);
    this.glow.add({ x, y, z, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, life, max: life, size, r: C.r, g2: C.g, b: C.b, a: 1, carry, grow: 0.5 });
  }

  fire(x, y, z, scale = 1, count = 14, tint = 0xff8a2a) {
    for (let i = 0; i < count; i++) {
      C.set(i % 3 ? tint : 0xffe08a).multiplyScalar(2.2 + Math.random() * 1.8);
      const a = Math.random() * 6.28;
      const r = Math.random() * 0.8 * scale;
      const l = 0.26 + Math.random() * 0.38;
      this.glow.add({
        x: x + Math.cos(a) * r, y: y + Math.random() * scale * 0.8, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * r * 3.4, vy: 1.5 + Math.random() * 3.2 * scale, vz: Math.sin(a) * r * 3.4,
        g: -1.5, drag: 2.3, life: l, max: l, size: (0.7 + Math.random() * 1.1) * scale, r: C.r, g2: C.g, b: C.b, a: 0.9, carry: 1, grow: 0.8,
      });
    }
  }

  puff(x, y, z, color, count = 4, scale = 1, life = 0.8, alpha = 0.55) {
    C.set(color);
    for (let i = 0; i < count; i++) {
      const l = life * (0.6 + Math.random() * 0.6);
      this.smoke.add({
        x: x + (Math.random() - 0.5) * 0.7 * scale, y: y + Math.random() * 0.5 * scale, z: z + (Math.random() - 0.5) * 0.7 * scale,
        vx: (Math.random() - 0.5) * 1.8 * scale, vy: 0.6 + Math.random() * 1.6 * scale, vz: (Math.random() - 0.5) * 1.8 * scale,
        g: -0.4, drag: 1.5, life: l, max: l, size: (0.6 + Math.random() * 0.9) * scale, r: C.r, g2: C.g, b: C.b, a: alpha, carry: 1, grow: 1.5, fade: true,
      });
    }
  }

  // Куски разлетаются, стучат о дорогу и исчезают. shape: [ш, в, г] вытягивает их в прутья или доски
  burst(x, y, z, colors, count = 10, speed = 7, size = 0.2, shape = null) {
    for (let i = 0; i < count; i++) {
      if (this.chunks.length >= 240) this.chunks.shift();
      const s = size * (0.55 + Math.random() * 0.9);
      this.chunks.push({
        x: x + (Math.random() - 0.5) * 0.5, y: y + Math.random() * 0.6, z: z + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * speed * 2, vy: 2 + Math.random() * speed, vz: (Math.random() - 0.5) * speed * 2,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, wx: (Math.random() - 0.5) * 16, wz: (Math.random() - 0.5) * 16,
        life: 0.9 + Math.random() * 0.8, sx: shape ? shape[0] : s * (0.55 + Math.random() * 0.75), sy: shape ? shape[1] : s * (0.5 + Math.random() * 0.6), sz: shape ? shape[2] : s * (0.55 + Math.random() * 0.75),
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  ring(x, z, color, radius = 4, life = 0.5, y = 0.12) {
    let r = this.rings.find((q) => q.age >= q.life);
    if (!r) r = this.rings[0];
    r.age = 0;
    r.life = life;
    r.radius = radius;
    r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    r.mesh.geometry = radius > 7 ? this.ringThin : this.ringWide;
    r.mesh.material.color.copy(hdr(color, radius > 7 ? 1.5 : 2.2));
  }

  lamp(x, y, z, color, power) {
    if (power < this.lightPower) return;
    this.light.position.set(x, y, z);
    this.light.color.set(color);
    this.lightPower = power;
  }

  explosion(x, y, z, color, scale = 1) {
    this.flash(x, y, z, 0xffffff, 3.4 * scale, 0.16, 3.2, 1);
    this.flash(x, y, z, color, 5.2 * scale, 0.28, 2, 1);
    this.fire(x, y, z, scale, Math.round(16 * Math.min(2.5, scale)));
    this.spark(x, y, z, 0xffd27a, Math.round(14 * Math.min(2.5, scale)), 9 * Math.sqrt(scale), 0.28, 0.55);
    this.puff(x, y + 0.4, z, 0x8f8499, Math.round(5 * Math.min(2.5, scale)), scale, 0.9, 0.3);
    this.ring(x, z, color, 3.6 * scale, 0.45);
    this.lamp(x, y + 1, z, color, 90 * scale);
  }

  bolt(x, y, z, dx, dy, dz, length, width, color, power = 2.6) {
    if (this.boltCount >= 360) return;
    V.set(dx, dy, dz).normalize();
    Q.setFromUnitVectors(Z, V);
    POS.set(x, y, z);
    SCALE.set(width, width, length);
    this.boltMesh.setMatrixAt(this.boltCount, M.compose(POS, Q, SCALE));
    this.boltMesh.setColorAt(this.boltCount, C.set(color).multiplyScalar(power));
    this.boltCount++;
  }

  orb(x, y, z, radius, color, power = 2.6) {
    if (this.orbCount >= 90) return;
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(radius);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    this.orbMesh.setMatrixAt(this.orbCount, dummy.matrix);
    this.orbMesh.setColorAt(this.orbCount, C.set(color).multiplyScalar(power));
    this.orbCount++;
  }

  rocket(x, y, z, dx, dz) {
    if (this.rocketCount >= 24) return;
    V.set(-dx, 0, -dz).normalize();
    Q.setFromUnitVectors(Z, V);
    POS.set(x, y, z);
    SCALE.set(1.25, 1.25, 1.25);
    this.rocketMesh.setMatrixAt(this.rocketCount, M.compose(POS, Q, SCALE));
    this.rocketCount++;
  }

  // Молния: ломаная между точками, живёт доли секунды
  arc(points, y, color) {
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const n = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 1.6));
      let px = a.x;
      let py = a.y ?? y;
      let pz = a.z;
      for (let j = 1; j <= n; j++) {
        const t = j / n;
        const jag = j === n ? 0 : 0.5;
        const nx = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * jag;
        const ny = y + (Math.random() - 0.5) * jag * 0.8;
        const nz = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * jag;
        segs.push([px, py, pz, nx, ny, nz]);
        px = nx;
        py = ny;
        pz = nz;
      }
    }
    this.arcs.push({ segs, life: 0.13, color });
  }

  setBeam(from, to, color, width) {
    this.beam = from ? { from: from.clone(), to: to.clone(), color, width } : null;
  }

  update(dt, carry) {
    this.time += dt;
    this.glow.update(dt, carry);
    this.smoke.update(dt, carry);

    let n = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      c.life -= dt;
      if (c.life <= 0) continue;
      c.vy -= 24 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += (c.vz + carry) * dt;
      c.rx += c.wx * dt;
      c.rz += c.wz * dt;
      if (c.y < c.sy * 0.5) {
        c.y = c.sy * 0.5;
        c.vy *= -0.42;
        c.vx *= 0.7;
        c.vz *= 0.7;
        c.wx *= 0.6;
        c.wz *= 0.6;
      }
      this.chunks[n] = c;
      const shrink = Math.min(1, c.life * 3.2);
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(c.rx, c.ry, c.rz);
      dummy.scale.set(c.sx * shrink, c.sy * shrink, c.sz * shrink);
      dummy.updateMatrix();
      this.chunkMesh.setMatrixAt(n, dummy.matrix);
      this.chunkMesh.setColorAt(n, C.set(c.color));
      n++;
    }
    this.chunks.length = n;
    this.chunkMesh.count = n;
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;

    for (const r of this.rings) {
      if (r.age >= r.life) {
        r.mesh.visible = false;
        continue;
      }
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      r.mesh.position.z += carry * dt;
      r.mesh.scale.setScalar(0.3 + (1 - (1 - t) * (1 - t)) * r.radius);
      r.mesh.material.opacity = (1 - t) * 0.85;
    }

    // Молнии рисуем теми же светящимися овалами
    this.arcs = this.arcs.filter((a) => {
      a.life -= dt;
      if (a.life <= 0) return false;
      for (const [x0, y0, z0, x1, y1, z1] of a.segs) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dy, dz);
        this.bolt((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, dx, dy, dz, len * 1.25, 0.1, 0xffffff, 3.4);
        this.bolt((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, dx, dy, dz, len * 1.3, 0.24, a.color, 1.7);
      }
      return true;
    });

    const on = Boolean(this.beam);
    this.beamCore.visible = on;
    this.beamGlow.visible = on;
    if (on) {
      const { from, to, color, width } = this.beam;
      V.subVectors(to, from);
      const len = V.length();
      V.normalize();
      Q.setFromUnitVectors(Z, V);
      POS.addVectors(from, to).multiplyScalar(0.5);
      const w = width * (0.88 + Math.sin(this.time * 60) * 0.12);
      for (const [m, k] of [[this.beamCore, 0.55], [this.beamGlow, 1.9]]) {
        m.position.copy(POS);
        m.quaternion.copy(Q);
        m.scale.set(w * k, w * k, len);
      }
      this.beamGlow.material.color.copy(hdr(color, 1.5));
    }

    this.boltMesh.count = this.boltCount;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    if (this.boltMesh.instanceColor) this.boltMesh.instanceColor.needsUpdate = true;
    this.boltCount = 0;
    this.orbMesh.count = this.orbCount;
    this.orbMesh.instanceMatrix.needsUpdate = true;
    if (this.orbMesh.instanceColor) this.orbMesh.instanceColor.needsUpdate = true;
    this.orbCount = 0;
    this.rocketMesh.count = this.rocketCount;
    this.rocketMesh.instanceMatrix.needsUpdate = true;
    this.rocketCount = 0;

    this.lightPower = Math.max(0, this.lightPower - dt * 340);
    this.light.intensity = this.lightPower;
  }
}
