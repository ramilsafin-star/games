import * as T from "../vendor/three/three.module.min.js?v=9b5e14d1";

const TAU = Math.PI * 2;

function paintSky() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const azimuth = x / canvas.width * TAU;
      const latitude = y / canvas.height;
      const center = 0.43 + 0.052 * Math.sin(azimuth * 2 + 0.5);
      const veil = Math.exp(-Math.pow((latitude - center) * 11, 2));
      const filaments = 0.46 + 0.22 * Math.sin(azimuth * 5 + latitude * 32)
        + 0.19 * Math.sin(azimuth * 13 - latitude * 65)
        + 0.13 * Math.sin(azimuth * 27 + latitude * 102);
      const purple = veil * filaments * (0.6 + 0.4 * Math.cos(azimuth - 4.8));
      const cyan = veil * (1 - filaments) * (0.6 + 0.4 * Math.cos(azimuth - 3.8));
      const i = (y * canvas.width + x) * 4;
      image.data[i] = 5 + purple * 57 + cyan * 5;
      image.data[i + 1] = 9 + purple * 17 + cyan * 42;
      image.data[i + 2] = 27 + purple * 62 + cyan * 64;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function addStars(scene, count, size) {
  const positions = [];
  const colors = [];
  const color = new T.Color();
  for (let i = 0; i < count; i++) {
    const azimuth = i * 2.39996323;
    const y = (i + 0.5) / count * 2 - 1;
    const r = Math.sqrt(1 - y * y);
    positions.push(1770 * r * Math.cos(azimuth), y * 1770, 1770 * r * Math.sin(azimuth));
    color.setHSL(0.54 + Math.sin(i * 123.3) * 0.14, 0.35, 0.63 + 0.27 * Math.sin(i * 17) ** 2);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  scene.add(new T.Points(geometry, new T.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, toneMapped: false })));
}

function atmosphere(radius, color) {
  const material = new T.ShaderMaterial({
    uniforms: { glow: { value: new T.Color(color) } },
    vertexShader: `
      varying vec3 normalView;
      varying vec3 direction;
      void main() {
        vec4 positionView = modelViewMatrix * vec4(position, 1.0);
        normalView = normalMatrix * normal;
        direction = -positionView.xyz;
        gl_Position = projectionMatrix * positionView;
      }
    `,
    fragmentShader: `
      varying vec3 normalView;
      varying vec3 direction;
      uniform vec3 glow;
      void main() {
        float limb = 1.0 - abs(dot(normalize(normalView), normalize(direction)));
        gl_FragColor = vec4(glow, pow(limb, 3.3) * 0.58);
        #include <colorspace_fragment>
      }
    `,
    side: T.BackSide,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  return new T.Mesh(new T.SphereGeometry(radius * 1.018, 48, 32), material);
}

function makePlanet(radius, position, palette, ringed) {
  const planet = new T.Group();
  planet.position.copy(position);
  const geometry = new T.SphereGeometry(radius, 64, 42);
  const vertices = geometry.attributes.position;
  const colors = new Float32Array(vertices.count * 3);
  const [ocean, land, cloud] = palette.map((color) => new T.Color(color));
  const color = new T.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) / radius;
    const y = vertices.getY(i) / radius;
    const z = vertices.getZ(i) / radius;
    const ridges = Math.sin(y * 36 + Math.sin(x * 6 + z * 7) * 2.7);
    const continents = Math.sin(x * 6 + 1) * Math.sin(z * 8 - y * 6)
      + Math.sin(z * 14 + y * 11) * 0.29;
    const mix = ringed ? 0.5 + ridges * 0.43 : T.MathUtils.smoothstep(continents, -0.08, 0.47);
    color.copy(ocean).lerp(land, mix);
    const mist = T.MathUtils.smoothstep(ridges + Math.sin(z * 13 + x * 7) * 0.58, 0.73, 1.45);
    color.lerp(cloud, mist * 0.74);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  const sphere = new T.Mesh(geometry, new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    emissive: ocean,
    emissiveIntensity: 0.13,
  }));
  planet.add(sphere, atmosphere(radius, ringed ? "#be90ff" : "#3aaeff"));
  if (ringed) {
    const rings = new T.Group();
    rings.rotation.set(1.06, -0.18, 0.43);
    for (const [inner, outer, color, opacity] of [
      [1.3, 1.48, "#b5a4fc", 0.52],
      [1.52, 1.77, "#efbb9e", 0.6],
      [1.81, 2.0, "#a0cfff", 0.42],
    ]) {
      rings.add(new T.Mesh(new T.RingGeometry(radius * inner, radius * outer, 72),
        new T.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, side: T.DoubleSide })));
    }
    planet.add(rings);
  }
  return { planet, sphere };
}

export function addSpace(scene) {
  const sky = new T.Mesh(new T.SphereGeometry(2200, 36, 24), new T.MeshBasicMaterial({
    map: paintSky(),
    side: T.BackSide,
    depthWrite: false,
    toneMapped: false,
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  addStars(scene, 1800, 1.45);
  addStars(scene, 120, 2.25);

  const earth = makePlanet(900, new T.Vector3(130, -949, -575), ["#1c74c2", "#4fa58b", "#b4dfff"], false);
  const moon = makePlanet(98, new T.Vector3(269, 408, -1400), ["#9264cf", "#d59183", "#f8c7a3"], true);
  scene.add(earth.planet, moon.planet);
  return earth.sphere;
}
