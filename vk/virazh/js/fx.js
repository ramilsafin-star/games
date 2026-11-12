// Частицы «Виража»: дым, пыль, искры, конфетти, следы шин. Каждый вид — один InstancedMesh.
import * as T from "../vendor/three/three.module.min.js?v=b8d55922";

const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), S = new T.Vector3(), P = new T.Vector3();
const C = new T.Color();
const N = 16; // чисел на частицу: x y z vx vy vz age life size0 size1 gravity drag rx ry spin stretch

export class Pool {
  constructor(scene, max, geometry, material) {
    this.max = max;
    this.count = 0;
    this.data = new Float32Array(max * N);
    this.mesh = new T.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, C.set("#ffffff"));
    this.mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  // o: size, grow (во сколько раз вырастет), gravity, drag, spin, stretch (вытянуть вдоль z), yaw
  spawn(x, y, z, vx, vy, vz, life, color, o = {}) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // переполнение: затираем случайную
    else this.count++;
    const d = this.data, k = i * N;
    d[k] = x; d[k + 1] = y; d[k + 2] = z;
    d[k + 3] = vx; d[k + 4] = vy; d[k + 5] = vz;
    d[k + 6] = 0; d[k + 7] = life;
    d[k + 8] = o.size ?? 1; d[k + 9] = (o.size ?? 1) * (o.grow ?? 1);
    d[k + 10] = o.gravity ?? 0; d[k + 11] = o.drag ?? 0;
    d[k + 12] = o.yaw ?? Math.random() * 6.28; d[k + 13] = Math.random() * 6.28;
    d[k + 14] = o.spin ?? 0; d[k + 15] = o.stretch ?? 1;
    this.mesh.setColorAt(i, C.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const d = this.data, mesh = this.mesh;
    let i = 0;
    while (i < this.count) {
      const k = i * N;
      d[k + 6] += dt;
      if (d[k + 6] >= d[k + 7]) {
        // умерла: на её место переезжает последняя
        const last = --this.count;
        if (last !== i) {
          d.copyWithin(k, last * N, last * N + N);
          mesh.getColorAt(last, C);
          mesh.setColorAt(i, C);
          mesh.instanceColor.needsUpdate = true;
        }
        continue;
      }
      const t = d[k + 6] / d[k + 7];
      const drag = Math.exp(-d[k + 11] * dt);
      d[k + 3] *= drag; d[k + 4] = d[k + 4] * drag - d[k + 10] * dt; d[k + 5] *= drag;
      d[k] += d[k + 3] * dt; d[k + 1] += d[k + 4] * dt; d[k + 2] += d[k + 5] * dt;
      d[k + 13] += d[k + 14] * dt;
      const size = (d[k + 8] + (d[k + 9] - d[k + 8]) * t) * (1 - t * t * t);
      E.set(d[k + 14] ? d[k + 13] : 0, d[k + 12], d[k + 14] ? d[k + 13] * 0.7 : 0);
      M.compose(P.set(d[k], d[k + 1], d[k + 2]), Q.setFromEuler(E), S.set(size, size, size * d[k + 15]));
      mesh.setMatrixAt(i, M);
      i++;
    }
    mesh.count = this.count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }
}

// Полосы скорости: тонкие штрихи летят мимо камеры, когда машина разогналась
export class Streaks {
  constructor(camera, count = 46) {
    this.count = count;
    this.items = [];
    this.material = new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new T.InstancedMesh(new T.BoxGeometry(0.03, 0.03, 1), this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    for (let i = 0; i < count; i++) this.items.push(this.fresh({}, true));
    camera.add(this.mesh);
  }
  fresh(it, anywhere) {
    const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 4.2;
    it.x = Math.cos(a) * r * 1.5;
    it.y = Math.sin(a) * r;
    it.z = anywhere ? -4 - Math.random() * 44 : -48;
    it.len = 2 + Math.random() * 5;
    return it;
  }
  // power 0..1 — насколько видны, speed — скорость машины
  update(dt, power, speed) {
    this.material.opacity += (power * 0.4 - this.material.opacity) * Math.min(1, dt * 6);
    this.mesh.visible = this.material.opacity > 0.01;
    if (!this.mesh.visible) return;
    this.items.forEach((it, i) => {
      it.z += speed * 1.6 * dt;
      if (it.z > -2) this.fresh(it, false);
      M.compose(P.set(it.x, it.y, it.z), Q.identity(), S.set(1, 1, it.len));
      this.mesh.setMatrixAt(i, M);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
