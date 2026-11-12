// Частицы и значки «Маяка». Всё рисуется инстансами: один вызов на частицы, один на значки.
import * as T from "../vendor/three/three.module.min.js?v=b9a86e0e";

// Виды частиц
export const DOT = 0; // мягкая точка: ореолы, искры, брызги
export const BUBBLE = 1; // пузырёк с бликом
export const SPARK = 2; // четырёхлучевая звёздочка
export const PUFF = 3; // клуб пены, дыма или тумана
export const STREAK = 4; // штрих ветра, вытянут по горизонтали экрана

export class Particles {
  constructor(max = 900) {
    this.max = max;
    const geometry = new T.InstancedBufferGeometry();
    const quad = new T.PlaneGeometry(2, 2);
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.attributes.position);
    this.place = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4); // x, y, z, размер
    this.look = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4); // r, g, b, прозрачность
    this.kind = new T.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.place, this.look, this.kind]) a.setUsage(T.DynamicDrawUsage);
    geometry.setAttribute("place", this.place);
    geometry.setAttribute("look", this.look);
    geometry.setAttribute("kind", this.kind);
    geometry.instanceCount = 0;
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
blending: T.CustomBlending,
      blendSrc: T.OneFactor,
      blendDst: T.OneFactor,
      vertexShader: /* glsl */ `
        attribute vec4 place;
        attribute vec4 look;
        attribute float kind;
        varying vec2 vUv;
        varying vec4 vLook;
        varying float vKind;
        void main() {
          vUv = position.xy;
          vLook = look;
          vKind = kind;
          vec4 mv = viewMatrix * vec4(place.xyz, 1.0);
          vec2 size = vec2(place.w);
          if (kind > 3.5) size = vec2(place.w * 7.0, place.w * 0.16);
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        varying vec4 vLook;
        varying float vKind;
        void main() {
          float d = length(vUv);
          float a;
          if (vKind < 0.5) a = pow(max(0.0, 1.0 - d), 2.2);
          else if (vKind < 1.5) {
            a = (smoothstep(0.62, 0.8, d) - smoothstep(0.86, 1.0, d)) * 0.9 + pow(max(0.0, 1.0 - d), 2.0) * 0.18;
            a += smoothstep(0.22, 0.0, length(vUv - vec2(-0.32, 0.36))) * 0.9;
          } else if (vKind < 2.5) {
            vec2 q = abs(vUv);
            a = max(0.0, 1.0 - (q.x * q.y * 26.0 + d * 1.1)) + pow(max(0.0, 1.0 - d), 3.0) * 0.6;
          } else if (vKind < 3.5) a = smoothstep(1.0, 0.25, d) * 0.6;
          else a = pow(max(0.0, 1.0 - abs(vUv.x)), 1.5) * max(0.0, 1.0 - abs(vUv.y));
          gl_FragColor = vec4(vLook.rgb * a * vLook.a, 1.0);
        }
      `,
    });
    this.mesh = new T.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.list = [];
    this.count = 0;
  }

  // живущая частица: летит, растёт, гаснет
  emit(x, y, z, o) {
    if (this.list.length > this.max - 120) return;
    this.list.push({
      x, y, z,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: 0, max: o.life || 1,
      size: o.size || 0.2, grow: o.grow || 0,
      kind: o.kind || DOT,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1,
      alpha: o.alpha ?? 1,
      gravity: o.gravity || 0, drag: o.drag || 0,
      floor: o.floor ?? -1, // ниже этой высоты частица гаснет (вода)
    });
  }

  // начало кадра: двигает живущие частицы и записывает их
  begin(dt) {
    this.count = 0;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.max || p.y < p.floor) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      p.vy -= p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.life / p.max;
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      this.sprite(p.x, p.y, p.z, p.size + p.grow * p.life, p.kind, p.r, p.g, p.b, p.alpha * fade);
    }
  }

  // спрайт на один кадр: ореол фонарика, клуб тумана
  sprite(x, y, z, size, kind, r, g, b, alpha) {
    const i = this.count;
    if (i >= this.max) return;
    this.place.setXYZW(i, x, y, z, size);
    this.look.setXYZW(i, r, g, b, alpha);
    this.kind.setX(i, kind);
    this.count++;
  }

  end() {
    this.mesh.geometry.instanceCount = this.count;
    this.place.needsUpdate = true;
    this.look.needsUpdate = true;
    this.kind.needsUpdate = true;
  }
}

// ---------- Значки над лодками: «?» — заблудилась, «!» — вот-вот беда ----------
function atlas() {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 128;
  const g = c.getContext("2d");
  const cell = (i, fill, edge, glyph, ink) => {
    const x = i * 128 + 64;
    g.beginPath();
    g.arc(x, 56, 46, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = edge;
    g.stroke();
    // хвостик пузыря
    g.beginPath();
    g.moveTo(x - 14, 96);
    g.lineTo(x, 124);
    g.lineTo(x + 14, 96);
    g.closePath();
    g.fillStyle = edge;
    g.fill();
    g.fillStyle = ink;
    g.font = "900 72px ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(glyph, x, 60);
  };
  cell(0, "#e9f2ff", "#5d7fb8", "?", "#27477d");
  cell(1, "#ff8a3c", "#fff0c2", "!", "#ffffff");
  cell(2, "#b06cff", "#f1dcff", "!", "#ffffff");
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export const MARK_ASK = 0;
export const MARK_ALARM = 1;
export const MARK_GRAB = 2;

export class Marks {
  constructor(max = 40) {
    this.max = max;
    const geometry = new T.InstancedBufferGeometry();
    const quad = new T.PlaneGeometry(1, 1);
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.attributes.position);
    geometry.setAttribute("uv", quad.attributes.uv);
    this.place = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4); // x, y, z, размер
    this.look = new T.InstancedBufferAttribute(new Float32Array(max * 2), 2); // клетка, прозрачность
    this.place.setUsage(T.DynamicDrawUsage);
    this.look.setUsage(T.DynamicDrawUsage);
    geometry.setAttribute("place", this.place);
    geometry.setAttribute("look", this.look);
    geometry.instanceCount = 0;
    const material = new T.ShaderMaterial({
      uniforms: { uMap: { value: atlas() } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 place;
        attribute vec2 look;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vUv = vec2((uv.x + look.x) / 3.0, uv.y);
          vAlpha = look.y;
          vec4 mv = viewMatrix * vec4(place.xyz, 1.0);
          mv.xy += vec2(position.x, position.y + 0.5) * place.w;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vec4 c = texture2D(uMap, vUv);
          // значки не должны светиться через bloom: держим яркость ниже порога
          gl_FragColor = vec4(c.rgb * 0.78, c.a * vAlpha);
        }
      `,
    });
    this.mesh = new T.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    this.count = 0;
  }

  begin() {
    this.count = 0;
  }

  add(x, y, z, size, cell, alpha = 1) {
    if (this.count >= this.max) return;
    this.place.setXYZW(this.count, x, y, z, size);
    this.look.setXY(this.count, cell, alpha);
    this.count++;
  }

  end() {
    this.mesh.geometry.instanceCount = this.count;
    this.place.needsUpdate = true;
    this.look.needsUpdate = true;
  }
}
