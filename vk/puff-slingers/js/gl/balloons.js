// Шарики в 3D: глянцевые, с узелком и ниткой до того, что они держат. Данные — Balloons из js/balloons.js.
import * as T from '../../vendor/three/three.module.min.js?v=7f585ca2';

const MAX = 24;

export class BalloonsGL {
  constructor(stage) {
    // Чуть вытянутая книзу сфера — как у настоящего воздушного шарика
    const g = new T.SphereGeometry(1, 28, 20);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setY(i, y * 1.16 - (y < 0 ? y * y * 0.14 : 0));
      if (y < -0.2) {
        const k = 1 - (-y - 0.2) * 0.32;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
      }
    }
    g.computeVertexNormals();
    this.mat = new T.MeshPhysicalMaterial({
      roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.5, sheenColor: new T.Color('#ffffff'), envMapIntensity: 1.5
    });
    this.mesh = new T.InstancedMesh(g, this.mat, MAX);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    const knot = new T.ConeGeometry(0.2, 0.26, 8);
    knot.translate(0, -1.22, 0);
    this.knots = new T.InstancedMesh(knot, this.mat, MAX);
    this.knots.frustumCulled = false;
    const rope = new T.CylinderGeometry(1, 1, 1, 5, 1, true);
    rope.translate(0, 0.5, 0);
    this.strings = new T.InstancedMesh(rope, new T.MeshStandardMaterial({ color: '#f4efff', roughness: 0.8 }), MAX);
    this.strings.frustumCulled = false;
    const white = new T.Color('#ffffff');
    for (let i = 0; i < MAX; i++) {
      this.mesh.setColorAt(i, white);
      this.knots.setColorAt(i, white);
    }
    this.mesh.count = this.knots.count = this.strings.count = 0;
    stage.add(this.mesh, this.knots, this.strings);
    this.d = new T.Object3D();
    this.c = new T.Color();
  }

  draw(list, t, particles) {
    const D = this.d;
    const G = GROUND_Y;
    let n = 0;
    let s = 0;
    for (let i = 0; i < list.length && n < MAX; i++) {
      const bl = list[i];
      if (bl.pop > 0) continue;
      const sway = Balloons.sway(bl, t);
      const kx = bl.x + sway;
      const ky = G - bl.y;
      let size = BALLOON_R * (bl.born < 1 ? 0.3 + bl.born * 0.7 : 1);
      if (bl.away > 0) size *= Math.max(0, 1 - bl.away / 2.5);
      const cy = ky + size * 1.16;
      // Шарик с узелком: покачивается и чуть «дышит»
      D.position.set(kx, cy, 0);
      D.rotation.set(0, t * 0.3 + bl.ph, sway * 0.025);
      const breathe = 1 + Math.sin(t * 2.3 + bl.ph) * 0.015;
      D.scale.set(size * breathe, size, size * breathe);
      D.updateMatrix();
      this.mesh.setMatrixAt(n, D.matrix);
      this.knots.setMatrixAt(n, D.matrix);
      this.c.set(bl.color);
      this.mesh.setColorAt(n, this.c);
      this.knots.setColorAt(n, this.c);
      // Блик и мягкое свечение цвета шарика
      particles.glow(kx - size * 0.32, cy + size * 0.42, size + 4, size * 0.7, '#ffffff', 0.32, 1.3);
      particles.glow(kx, cy, -size, size * 3.2, bl.color, 0.12, 1.2);
      n++;
      // Нитка от узелка до тела
      const a = bl.alive ? Balloons.anchor(bl) : null;
      if (a) {
        const ax = a.x;
        const ay = G - a.y;
        const dx = kx - ax;
        const dy = ky - size * 0.25 - ay;
        const len = Math.hypot(dx, dy);
        D.position.set(ax, ay, 0);
        D.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
        D.scale.set(0.9, len, 0.9);
        D.updateMatrix();
        this.strings.setMatrixAt(s, D.matrix);
        s++;
      }
    }
    this.mesh.count = this.knots.count = n;
    this.strings.count = s;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.knots.instanceMatrix.needsUpdate = true;
    this.strings.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.knots.instanceColor) this.knots.instanceColor.needsUpdate = true;
  }
}
