// Боты: полированный металл, тёмный визор со светящимся глазом, антенны и пропеллеры. Размер в долях радиуса.
import * as T from '../../vendor/three/three.module.min.js?v=d6bb936e';
import { merge, place } from './shapes.js?v=d6bb936e';

const SKIN = {
  plain: { hull: '#9a8cf0', band: '#4a3bb0', metal: '#c4bcff', line: '#1c1450', metalness: 0.55 },
  mega: { hull: '#ffc21f', band: '#b86a00', metal: '#ffdd66', line: '#5a2c00', metalness: 0.75, spikes: '#ff4d7e' },
  drone: { hull: '#39d6b0', band: '#0d7d74', metal: '#a7ffe8', line: '#06343a', metalness: 0.55 },
  volatile: { hull: '#ff7a3c', band: '#b3201f', metal: '#ffd23f', line: '#4a0a14', metalness: 0.45 },
  boss: { hull: '#d61f6b', band: '#5a0a3a', metal: '#ffc21f', line: '#2e0420', metalness: 0.7, spikes: '#ffc21f' }
};

const GEO = {
  hull: new T.SphereGeometry(1, 40, 22, 0, Math.PI * 2, 0, Math.PI * 0.615),
  belt: new T.TorusGeometry(0.985, 0.028, 8, 56),
  ear: new T.CylinderGeometry(0.2, 0.24, 0.34, 18),
  earCap: new T.CylinderGeometry(0.1, 0.12, 0.08, 14),
  rivet: new T.SphereGeometry(0.042, 10, 8),
  visor: new T.SphereGeometry(1.012, 32, 14, Math.PI / 2 - 0.72, 1.44, Math.PI / 2 - 0.5, 0.56),
  visorRim: new T.SphereGeometry(1.006, 32, 14, Math.PI / 2 - 0.8, 1.6, Math.PI / 2 - 0.57, 0.7),
  mouth: new T.SphereGeometry(1.008, 24, 8, Math.PI / 2 - 0.42, 0.84, Math.PI / 2 + 0.36, 0.3),
  bar: new T.BoxGeometry(0.03, 0.22, 0.03),
  eye: new T.SphereGeometry(0.15, 18, 14),
  core: new T.SphereGeometry(0.07, 12, 10),
  brow: new T.CapsuleGeometry(0.075, 0.42, 4, 8),
  rod: new T.CylinderGeometry(0.028, 0.04, 0.62, 8),
  tip: new T.SphereGeometry(0.1, 14, 10),
  spike: new T.ConeGeometry(0.15, 0.46, 10),
  blade: new T.BoxGeometry(1.55, 0.028, 0.2),
  hub: new T.CylinderGeometry(0.075, 0.085, 0.5, 10),
  disc: new T.CircleGeometry(0.82, 32),
  warn: (() => {
    const s = new T.Shape();
    s.moveTo(0, 0.34);
    s.lineTo(0.3, -0.18);
    s.lineTo(-0.3, -0.18);
    s.closePath();
    return new T.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 2 });
  })(),
  bubble: new T.SphereGeometry(1, 28, 20)
};
GEO.brow.rotateZ(Math.PI / 2);

// Неподвижные детали собраны в одну модель на материал: заметно меньше работы видеокарте
function joined(items) {
  return merge(items.map(([g, m]) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const n of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(n)) c.deleteAttribute(n);
    if (m) c.applyMatrix4(m);
    return c;
  }));
}

const MODEL = (() => {
  const metal = [];
  for (let i = 0; i < 9; i++) {
    const a = 0.25 + (i / 8) * (Math.PI - 0.5);
    metal.push([GEO.rivet, place(Math.cos(a) * 0.94, -0.28, Math.sin(a) * 0.94)]);
  }
  const line = [[GEO.visorRim]];
  for (const side of [-1, 1]) {
    metal.push([GEO.ear, place(side * 1.04, -0.04, 0, 1, 1, 1, 0, 0, (side * Math.PI) / 2)]);
    line.push([GEO.earCap, place(side * 1.22, -0.04, 0, 1, 1, 1, 0, 0, (side * Math.PI) / 2)]);
  }
  const bars = [];
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.19;
    const y = -0.5;
    const rr = Math.sqrt(Math.max(0.1, 1 - y * y));
    bars.push([GEO.bar, place(Math.sin(a) * rr * 1.004, y, Math.cos(a) * rr * 1.004, 1, 1, 1, 0.5, a, 0)]);
  }
  const lower = new T.SphereGeometry(1.0, 40, 12, 0, Math.PI * 2, Math.PI * 0.61, Math.PI * 0.39);
  const spikes = [];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    spikes.push([GEO.spike, place(Math.cos(a) * 1.12, -Math.sin(a) * 1.12 * 0.98, -0.12, 1, 1, 1, 0, 0, -a - Math.PI / 2)]);
  }
  return {
    metal: joined(metal),
    line: joined(line),
    bars: joined(bars),
    band: joined([[lower], [GEO.belt, place(0, -0.3, 0, 0.955, 0.955, 0.955, Math.PI / 2, 0, 0)]]),
    spikes: joined(spikes),
    blades: joined([[GEO.blade], [GEO.blade, place(0, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0)]])
  };
})();

const shieldMat = new T.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: T.AdditiveBlending,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vP = position; gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){
      float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
      vec3 q = vP * 9.0;
      float hex = abs(sin(q.x + sin(q.y * 1.7)) * sin(q.y - sin(q.z * 1.3)));
      float grid = smoothstep(0.07, 0.0, hex) * 0.22;
      float wave = smoothstep(0.92, 1.0, sin(vP.y * 3.0 - uTime * 2.2)) * 0.22;
      vec3 c = vec3(0.42, 0.85, 1.6) * (0.12 + f * 1.5 + grid + wave);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`
});
const iceMat = new T.MeshStandardMaterial({ color: '#c8f6ff', transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0.1, emissive: '#6fd8ff', emissiveIntensity: 0.25, depthWrite: false });
const glassMat = new T.MeshStandardMaterial({ color: '#0a0628', metalness: 0.75, roughness: 0.14, envMapIntensity: 1.8 });

function hullMaterial(skin, cracks) {
  const m = new T.MeshStandardMaterial({ color: skin.hull, metalness: skin.metalness, roughness: 0.3 });
  m.userData.damage = { value: 0 };
  m.userData.flash = { value: 0 };
  m.onBeforeCompile = (s) => {
    s.uniforms.uCrack = { value: cracks };
    s.uniforms.uDamage = m.userData.damage;
    s.uniforms.uFlash = m.userData.flash;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBotUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvBotUv = uv;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCrack; uniform float uDamage; uniform float uFlash; varying vec2 vBotUv;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 cr = texture2D(uCrack, vBotUv * vec2(3.0, 1.5)).rg;
        diffuseColor.rgb *= 1.0 - cr.r * step(cr.g, uDamage) * 0.85;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(uFlash);');
  };
  m.customProgramCacheKey = () => 'bot-hull';
  return m;
}

export class Bots {
  constructor(stage, cracks) {
    this.stage = stage;
    this.cracks = cracks;
    this.map = new Map();
    this.materials = {};
    this.leds = {
      pink: new T.MeshBasicMaterial({ color: new T.Color(1.9, 0.24, 0.8), toneMapped: false }),
      red: new T.MeshBasicMaterial({ color: new T.Color(2.0, 0.24, 0.2), toneMapped: false }),
      yellow: new T.MeshBasicMaterial({ color: new T.Color(1.9, 1.5, 0.26), toneMapped: false }),
      white: new T.MeshBasicMaterial({ color: new T.Color(1.5, 1.5, 1.5), toneMapped: false })
    };
  }

  mats(skinName) {
    if (this.materials[skinName]) return this.materials[skinName];
    const s = SKIN[skinName];
    const m = {
      band: new T.MeshStandardMaterial({ color: s.band, metalness: 0.6, roughness: 0.36 }),
      metal: new T.MeshStandardMaterial({ color: s.metal, metalness: 0.9, roughness: 0.24 }),
      line: new T.MeshStandardMaterial({ color: s.line, metalness: 0.3, roughness: 0.5 }),
      spike: s.spikes ? new T.MeshStandardMaterial({ color: s.spikes, metalness: 0.7, roughness: 0.25 }) : null
    };
    this.materials[skinName] = m;
    return m;
  }

  build(b) {
    const name = b.skin || 'plain';
    const s = SKIN[name];
    const M = this.mats(name);
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const hullMat = hullMaterial(s, this.cracks);
    const hull = new T.Mesh(GEO.hull, hullMat);
    hull.castShadow = true;
    body.add(hull);
    // Шов, нижняя чаша, болты и заклёпки: всё неподвижное одной моделью
    const band = new T.Mesh(MODEL.band, M.band);
    band.castShadow = true;
    body.add(band);
    body.add(new T.Mesh(MODEL.metal, M.metal));
    body.add(new T.Mesh(MODEL.line, M.line));
    body.add(new T.Mesh(GEO.visor, glassMat));
    const eye = new T.Group();
    const led = new T.Mesh(GEO.eye, this.leds.pink);
    led.scale.z = 0.5;
    eye.add(led);
    const core = new T.Mesh(GEO.core, this.leds.white);
    core.position.z = 0.06;
    eye.add(core);
    body.add(eye);
    const browL = new T.Mesh(GEO.brow, M.line);
    const browR = new T.Mesh(GEO.brow, M.line);
    browL.position.set(-0.3, 0.46, 0.86);
    browR.position.set(0.3, 0.46, 0.86);
    browL.rotation.z = -0.42;
    browR.rotation.z = 0.42;
    body.add(browL, browR);
    // Рот-решётка
    const mouth = new T.Group();
    mouth.add(new T.Mesh(GEO.mouth, glassMat));
    mouth.add(new T.Mesh(MODEL.bars, M.metal));
    body.add(mouth);
    // Антенны или пропеллер
    const ants = [];
    const propeller = b.hover && !b.isBoss;
    if (propeller) {
      const hub = new T.Mesh(GEO.hub, M.line);
      hub.position.y = 1.16;
      body.add(hub);
      const blades = new T.Group();
      blades.position.y = 1.42;
      blades.add(new T.Mesh(MODEL.blades, M.metal));
      body.add(blades);
      const disc = new T.Mesh(GEO.disc, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 1.42;
      body.add(disc);
      root.userData.blades = blades;
    } else {
      const xs = b.isMega ? [-0.28, 0.28] : [0.14];
      for (const x of xs) {
        const a = new T.Group();
        a.position.set(x, 0.86, 0.1);
        const rod = new T.Mesh(GEO.rod, M.line);
        rod.position.y = 0.3;
        a.add(rod);
        const tip = new T.Mesh(GEO.tip, this.leds.pink);
        tip.position.y = 0.66;
        a.add(tip);
        body.add(a);
        ants.push(a);
      }
    }
    if (s.spikes) body.add(new T.Mesh(MODEL.spikes, M.spike));
    if (b.volatile) {
      const warn = new T.Mesh(GEO.warn, new T.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff9a1f', emissiveIntensity: 0.6, roughness: 0.4 }));
      warn.position.set(0, -0.08, 0.98);
      warn.scale.setScalar(0.5);
      body.add(warn);
      root.userData.warn = warn;
    }
    const shield = new T.Mesh(GEO.bubble, shieldMat);
    shield.visible = false;
    root.add(shield);
    const ice = new T.Mesh(GEO.bubble, iceMat);
    ice.visible = false;
    ice.scale.setScalar(1.14);
    root.add(ice);
    Object.assign(root.userData, { body, hullMat, eye, led, browL, browR, mouth, ants, shield, ice });
    this.stage.add(root);
    return root;
  }

  draw(list, time, particles) {
    shieldMat.uniforms.uTime.value = time;
    const seen = new Set();
    for (const b of list) {
      let root = this.map.get(b);
      if (!root) {
        root = this.build(b);
        this.map.set(b, root);
      }
      seen.add(b);
      const r = b.circleRadius;
      const d = root.userData;
      root.position.set(b.position.x, GROUND_Y - b.position.y, 0);
      root.rotation.z = -b.angle;
      root.scale.setScalar(r);
      d.body.rotation.y = T.MathUtils.clamp(b.lookX || 0, -1, 1) * -0.2 - 0.16;
      // Глаз бежит по визору за пуфом
      const ax = T.MathUtils.clamp(b.lookX || 0, -1, 1) * 0.48;
      const ay = 0.26 + T.MathUtils.clamp(b.lookY || 0, -1, 1) * -0.08;
      const hurtBlink = b.hp < b.maxHp * 0.5 && Math.sin(time * 37 + b.id) > 0.72;
      d.eye.visible = !hurtBlink;
      d.eye.position.set(Math.sin(ax) * Math.cos(ay) * 1.0, Math.sin(ay) * 1.0, Math.cos(ax) * Math.cos(ay) * 1.0);
      d.eye.lookAt(d.eye.getWorldPosition(tempV).multiplyScalar(1).add(tempW.set(0, 0, 1)));
      const scared = b.scared > 0.5;
      d.led.material = scared ? this.leds.yellow : b.isMega ? this.leds.red : this.leds.pink;
      d.eye.scale.setScalar(scared ? 1.28 : 1);
      d.browL.visible = d.browR.visible = !scared;
      d.mouth.position.y = b.laugh > 0 ? Math.sin(time * 34) * 0.04 : 0;
      d.mouth.scale.y = b.laugh > 0 ? 1.1 : 1;
      if (d.blades) d.blades.rotation.y = b.hover ? time * 34 + b.id : time;
      d.ants.forEach((a, i) => {
        a.rotation.z = Math.sin(time * 6 + b.id + i) * 0.1 + b.hitFlash * 0.4 * Math.sin(time * 40);
      });
      d.hullMat.userData.damage.value = 1 - b.hp / b.maxHp;
      d.hullMat.userData.flash.value = b.hitFlash * 1.1;
      d.shield.visible = b.shield > 0;
      if (d.shield.visible) d.shield.scale.setScalar(1.55 + Math.sin(time * 4 + b.id) * 0.03);
      d.ice.visible = b.frozenT > 0;
      if (particles) {
        const x = root.position.x;
        const y = root.position.y;
        if (!hurtBlink) {
          const col = scared ? '#ffe14d' : b.isMega ? '#ff3b3b' : '#ff2e88';
          particles.glow(x + Math.sin(ax) * r * 0.9, y + Math.sin(ay) * r * 0.9, r + 2, r * 0.8, col, 0.07);
        }
        if (b.volatile) particles.glow(x, y, r * 0.5, r * 3.4, '#ff6a1f', 0.28 + 0.22 * Math.sin(time * 8 + b.id));
      }
    }
    for (const [b, root] of this.map) {
      if (!seen.has(b)) {
        this.stage.remove(root);
        root.userData.hullMat.dispose();
        this.map.delete(b);
      }
    }
  }

  clear() {
    for (const [, root] of this.map) {
      this.stage.remove(root);
      root.userData.hullMat.dispose();
    }
    this.map.clear();
  }
}

const tempV = new T.Vector3();
const tempW = new T.Vector3();
