// Art shared by the garage, vehicle portraits and the four playable arenas.
const DerbyArt = (() => {
  const T = THREE;
  const palette = { terminal: 0x575860, shanghai: 0x3b4356, uralmash: 0x5c514d, gobi: 0xae7948 };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const wetMaps = new Set(['terminal', 'shanghai']);
  const grain = new T.TextureLoader().load('assets/track-grain.jpg');
  grain.wrapS = grain.wrapT = T.RepeatWrapping;
  grain.anisotropy = 4;
  grain.userData = { shared: true };
  const sky = new Image();
  sky.src = 'assets/quayside-sky.jpg';
  const skyReady = sky.decode().catch(() => {});
  const yAxis = new T.Vector3(0, 1, 0);
  const lerp = T.MathUtils.lerp;
  const cachedGeometry = new Map();
  const shared = (resource) => {
    resource.userData ??= {};
    resource.userData.shared = true;
    return resource;
  };
  function geometry(key, create) {
    if (!cachedGeometry.has(key)) cachedGeometry.set(key, shared(create()));
    return cachedGeometry.get(key);
  }
  function finish(hex, roughness, metalness) {
    return shared(
      new T.MeshStandardMaterial({ color: new T.Color(hex).convertSRGBToLinear(), roughness, metalness }),
    );
  }
  const gunmetal = finish(0x515867, 0.29, 0.72),
    alloy = finish(0xc2c8cd, 0.22, 0.82);
  const bronze = finish(0xbd7543, 0.35, 0.69),
    rubber = finish(0x222831, 0.65, 0.09);
  const blueCore = shared(
    new T.MeshStandardMaterial({
      color: 0x1b9cbb,
      metalness: 0.38,
      roughness: 0.21,
      emissive: 0x08798f,
      emissiveIntensity: 0.7,
    }),
  );
  const violetCore = shared(
    new T.MeshStandardMaterial({
      color: 0xa06dff,
      metalness: 0.36,
      roughness: 0.22,
      emissive: 0x5922a0,
      emissiveIntensity: 0.8,
    }),
  );
  function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function turned(parent, key, profile, mat) {
    return mesh(
      parent,
      geometry(key, () =>
        new T.LatheGeometry(
          profile.map(([r, z]) => new T.Vector2(r, z)),
          32,
        ).rotateX(Math.PI / 2),
      ),
      mat,
    );
  }
  // Turned profiles use a hollow mouth, inset lens and stepped outer shroud. The
  // collar terminates at the original gun port so projectiles stay registered.
  function muzzle(port, type, radius) {
    const magnetic = type === 'magnet',
      electric = ['pulseTwin', 'arcRelay', 'plasma', 'laser'].includes(type);
    const key = magnetic ? 'magnet' : electric ? 'coil' : 'bore';
    const core = type === 'arcRelay' ? violetCore : blueCore;
    const unit = new T.Group();
    unit.scale.setScalar(radius);
    port.add(unit);
    turned(
      unit,
      key + '-jacket',
      [
        [0.7, -3.3],
        [1.13, -3.17],
        [1.24, -2.92],
        [1.24, -1.1],
        [1.35, -0.9],
        [1.35, -0.35],
        [1.15, -0.12],
        [0.78, -0.12],
        [0.72, -0.3],
        [0.72, -1.05],
      ],
      gunmetal,
    );
    turned(
      unit,
      'tip-rim',
      [
        [1.23, -0.81],
        [1.38, -0.72],
        [1.38, -0.54],
        [1.29, -0.45],
      ],
      alloy,
    );
    turned(
      unit,
      'tip-liner',
      [
        [0.76, -0.29],
        [0.7, -0.36],
        [0.66, -0.85],
        [0.05, -0.9],
      ],
      electric || magnetic ? core : rubber,
    );
    const fins = geometry('jacket-flutes', () => {
      const shapes = [];
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const g = new T.BoxGeometry(0.2, 0.14, 1.53);
        g.rotateZ(a);
        g.translate(-Math.sin(a) * 1.23, Math.cos(a) * 1.23, -2.12);
        shapes.push(g);
      }
      return merge(shapes);
    });
    mesh(unit, fins, magnetic ? bronze : electric ? core : alloy);
  }
  function merge(geometries) {
    const arrays = { position: [], normal: [], uv: [] };
    for (const source of geometries) {
      const g = source.index ? source.toNonIndexed() : source;
      for (const name of Object.keys(arrays)) {
        const a = g.getAttribute(name);
        if (a) arrays[name].push(...a.array);
      }
      if (g !== source) g.dispose();
      source.dispose();
    }
    const result = new T.BufferGeometry();
    for (const [name, values] of Object.entries(arrays))
      if (values.length && (name !== 'uv' || values.length === (arrays.position.length * 2) / 3))
        result.setAttribute(name, new T.Float32BufferAttribute(values, name === 'uv' ? 2 : 3));
    if (arrays.position.length) result.computeBoundingSphere();
    return result;
  }
  function detailWheels(wheel, r, w, side, style) {
    const outer = side * w * 0.5;
    const makeDisc = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const p = c.getContext('2d');
      p.translate(128, 128);
      p.fillStyle = '#69727b';
      p.fillRect(-128, -128, 256, 256);
      for (let i = 30; i < 128; i += 2) {
        p.beginPath();
        p.strokeStyle = i % 6 ? '#74818a' : '#4d565d';
        p.arc(0, 0, i, 0, Math.PI * 2);
        p.stroke();
      }
      p.fillStyle = '#252b31';
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 20; i++) {
          const a = (i * Math.PI) / 10 + j * 0.069,
            r = 81 + j * 15;
          p.beginPath();
          p.arc(Math.cos(a) * r, Math.sin(a) * r, 3.6, 0, Math.PI * 2);
          p.fill();
        }
      const t = shared(new T.CanvasTexture(c));
      t.encoding = T.sRGBEncoding;
      return shared(
        new T.MeshStandardMaterial({ map: t, side: T.DoubleSide, roughness: 0.42, metalness: 0.54 }),
      );
    };
    discMat ??= makeDisc();
    const disk = mesh(
      wheel,
      geometry('brake-' + r, () => new T.CircleGeometry(r * 0.565, 32)),
      discMat,
      outer * 0.74,
    );
    disk.rotation.y = (side * Math.PI) / 2;
    const sidewall = mesh(
      wheel,
      geometry('sidewall-' + r, () => new T.RingGeometry(r * 0.724, r * 0.893, 48)),
      sidewallMat(style),
      outer * 0.984,
    );
    sidewall.rotation.y = (side * Math.PI) / 2;
  }
  let discMat;
  const sidewalls = new Map();
  function sidewallMat(style) {
    const heavy = style === 'offroad';
    if (sidewalls.has(heavy)) return sidewalls.get(heavy);
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const p = c.getContext('2d');
    p.translate(256, 256);
    p.strokeStyle = '#54575b';
    p.lineWidth = 1.8;
    for (const r of [211, 246]) {
      p.beginPath();
      p.arc(0, 0, r, 0, 2 * Math.PI);
      p.stroke();
    }
    p.fillStyle = '#929394';
    p.textAlign = 'center';
    p.font = 'bold 19px sans-serif';
    for (const [str, angle] of [
      [heavy ? 'ALL TERRAIN' : 'DERBY SPORT', 0],
      [heavy ? 'M/T  4X4' : 'RACING  RS', Math.PI],
    ]) {
      for (let i = 0; i < str.length; i++) {
        p.save();
        p.rotate(angle + (i - (str.length - 1) / 2) * 0.073);
        p.fillText(str[i], 0, -220);
        p.restore();
      }
    }
    const t = shared(new T.CanvasTexture(c));
    t.encoding = T.sRGBEncoding;
    const m = shared(
      new T.MeshStandardMaterial({
        map: t,
        alphaTest: 0.16,
        roughness: 0.73,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    sidewalls.set(heavy, m);
    return m;
  }
  // Real surface-following vents and stamped panel seams on the three cover cars.
  function bodywork(parent, shell, id) {
    const key = 'body-details-' + id;
    if (!cachedGeometry.has(key)) {
      const probe = new T.Raycaster();
      const down = new T.Vector3(0, -1, 0);
      const parts = [];
      shell.updateMatrixWorld(true);
      const surface = (x, z) => {
        probe.set(new T.Vector3(x, 4, z), down);
        return probe.intersectObject(shell)[0]?.point;
      };
      for (const side of [-1, 1]) {
        const truck = id === 'buksir',
          width = truck ? 0.52 : 0.5;
        const path = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14;
          const p = surface(
            side * (width + 0.08 * Math.sin(t * Math.PI) - t * 0.08),
            lerp(truck ? 1.45 : 1.34, truck ? 2.04 : 2.17, t),
          );
          if (p) {
            p.y += 0.009;
            path.push(p);
          }
        }
        if (path.length > 2) parts.push(new T.TubeGeometry(new T.CatmullRomCurve3(path), 18, 0.008, 5, false));
        for (let j = 0; j < 5; j++) {
          const pts = [];
          for (let i = 0; i <= 4; i++) {
            const p = surface(side * (0.4 + i * 0.043), 1.4 + j * 0.062 + i * 0.018);
            if (p) {
              p.y += 0.015;
              pts.push(p);
            }
          }
          if (pts.length > 1) parts.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 5, 0.017, 6, false));
        }
      }
      cachedGeometry.set(key, shared(merge(parts)));
    }
    mesh(parent, cachedGeometry.get(key), gunmetal);
    const faceKey = 'facia-' + id;
    if (!cachedGeometry.has(faceKey)) {
      const dark = [],
        trim = [],
        blades = [];
      const ray = new T.Raycaster();
      shell.updateMatrixWorld(true);
      const fromFront = (x, y) => {
        ray.set(new T.Vector3(x, y, 4), new T.Vector3(0, 0, -1));
        const hit = ray.intersectObject(shell)[0];
        if (!hit) return null;
        hit.point.z += 0.029;
        return hit.point;
      };
      const fromSide = (side, y, z) => {
        ray.set(new T.Vector3(side * 3, y, z), new T.Vector3(-side, 0, 0));
        const hit = ray.intersectObject(shell)[0];
        if (!hit) return null;
        hit.point.x += side * 0.014;
        return hit.point;
      };
      const line = (parts, pts, thickness) => {
        if (pts.every(Boolean))
          parts.push(
            new T.TubeGeometry(new T.CatmullRomCurve3(pts), Math.max(12, pts.length * 2), thickness, 5, false),
          );
      };
      for (const sign of [-1, 1]) {
        const truck = id === 'buksir';
        if (!truck) {
          const outline = [
            [0.68, 0.42],
            [0.86, 0.43],
            [0.89, 0.66],
            [0.81, 0.61],
            [0.74, 0.53],
          ].map(([x, y]) => fromFront(x * sign, y));
          if (outline.every(Boolean)) {
            const inset = new T.BufferGeometry();
            inset.setAttribute(
              'position',
              new T.Float32BufferAttribute(
                outline.flatMap((p) => p.toArray()),
                3,
              ),
            );
            inset.setIndex(sign > 0 ? [0, 1, 4, 1, 2, 3, 1, 3, 4] : [4, 1, 0, 3, 2, 1, 4, 3, 1]);
            inset.computeVertexNormals();
            dark.push(inset);
            line(trim, [outline[0], outline[1], outline[2]], 0.023);
            for (const y of [0.46, 0.5])
              line(blades, [fromFront(0.75 * sign, y), fromFront(0.85 * sign, y + 0.012)], 0.012);
          }
        }
        line(
          dark,
          [
            [0.57, 0.88],
            [0.66, 0.76],
            [0.92, 0.57],
            [0.99, 0.22],
            [0.97, -0.38],
            [0.84, -0.68],
            [0.56, -0.59],
          ].map(([y, z]) => fromSide(sign, y, z)),
          0.008,
        );
        if (!truck) {
          line(
            trim,
            [
              [0.48, 0.62],
              [0.47, 0.22],
              [0.48, -0.45],
              [0.57, -0.78],
            ].map(([y, z]) => fromSide(sign, y, z)),
            0.018,
          );
          for (let j = 0; j < 3; j++)
            line(
              blades,
              [
                [0.6 + j * 0.055, -0.56],
                [0.63 + j * 0.055, -0.73],
                [0.64 + j * 0.055, -0.83],
              ].map(([y, z]) => fromSide(sign, y, z)),
              0.014,
            );
        }
      }
      for (const [suffix, pieces] of [
        ['inset', dark],
        ['trim', trim],
        ['blade', blades],
      ]) {
        const g = merge(pieces);
        cachedGeometry.set(faceKey + suffix, shared(g));
      }
      cachedGeometry.set(faceKey, true);
    }
    for (const [suffix, m] of [
      ['inset', rubber],
      ['trim', id === 'volt' ? violetCore : id === 'iskra' ? blueCore : bronze],
      ['blade', alloy],
    ]) {
      const g = cachedGeometry.get(faceKey + suffix);
      if (g.getAttribute('position')?.count) mesh(parent, g, m);
    }
  }
  function paint(material, finishType) {
    const satin = finishType === 'matte';
    material.clearcoat = satin ? 0.19 : 1;
    material.clearcoatRoughness = satin ? 0.49 : 0.105;
    material.envMapIntensity = satin ? 0.92 : 1.25;
    material.onBeforeCompile = (s) => {
      s.vertexShader =
        'varying vec3 vPaintPos;\n' +
        s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPaintPos=position;');
      s.fragmentShader =
        'varying vec3 vPaintPos;\n' +
        s.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        vec3 cell=floor(vPaintPos*260.0);
        float grain=fract(sin(dot(mod(cell,247.0),vec3(12.19,57.21,33.75)))*4375.21);
        float coverage=1.0-smoothstep(.35,1.5,length(fwidth(vPaintPos*260.0)));
        roughnessFactor=clamp(roughnessFactor+(grain-.5)*coverage*.10,.115,.95);`,
        );
    };
    material.extensions = { derivatives: true };
  }
  const skyTextures = new Map();
  function skyTexture(id) {
    if (!sky.naturalWidth) return null;
    if (skyTextures.has(id)) return skyTextures.get(id);
    const c = document.createElement('canvas');
    c.width = 1536;
    c.height = 768;
    const p = c.getContext('2d');
    p.filter =
      {
        terminal: 'none',
        shanghai: 'saturate(.65) brightness(.35) hue-rotate(12deg)',
        uralmash: 'saturate(.64) sepia(.39) brightness(.70)',
        gobi: 'sepia(.44) saturate(.96) brightness(1.12)',
      }[id] || 'none';
    p.drawImage(sky, 0, 0, c.width, c.height);
    p.filter = 'none';
    // Fade the panorama into its opposite edge over the final few degrees.
    const band = 48;
    for (let i = 0; i < band; i++) {
      p.globalAlpha = i / band;
      p.drawImage(c, band - i, 0, 1, c.height, c.width - band + i, 0, 1, c.height);
    }
    const tex = shared(new T.CanvasTexture(c));
    tex.encoding = T.sRGBEncoding;
    tex.wrapS = T.RepeatWrapping;
    skyTextures.set(id, tex);
    return tex;
  }
  function road(mapId) {
    const sand = mapId === 'gobi',
      wet = wetMaps.has(mapId);
    const mat = new T.MeshStandardMaterial({
      color: new T.Color(palette[mapId]).convertSRGBToLinear(),
      roughness: 0.85,
      metalness: wet ? 0.11 : 0.025,
    });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, {
        derbyGrain: { value: grain },
        derbyReflection: { value: reflectTarget?.texture || grain },
        derbyProjection: { value: reflectionVP },
      });
      s.vertexShader =
        'varying vec3 vRoad;\n' +
        s.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n vRoad=(modelMatrix*vec4(position,1.0)).xyz;',
        );
      s.fragmentShader =
        'varying vec3 vRoad; uniform sampler2D derbyGrain,derbyReflection; uniform mat4 derbyProjection;\n' +
        s.fragmentShader
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
          vec2 roadUV=vRoad.xz;
          vec3 grit=texture2D(derbyGrain,roadUV*0.34).rgb;
          float relief=texture2D(derbyGrain,roadUV*.032).g*.64+texture2D(derbyGrain,roadUV*.081+vec2(.34,.71)).g*.36;
          float puddle=${wet ? 'smoothstep(.44,.62,relief)' : '0.0'};
          float grainLight=grit.r*.76+.57;
          diffuseColor.rgb*=grainLight*(.68+.58*relief)*mix(1.0,.55,puddle);
          ${sand ? 'diffuseColor.rgb*=.90+.10*sin(roadUV.x*4.4+roadUV.y*1.2+4.0*relief);' : ''}`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\n roughnessFactor=mix(.85,.16,puddle);',
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
          normal=normalize(normal+vec3(dFdx(grit.b),dFdy(grit.b),0.)*.15*(1.-puddle));`,
          )
          .replace(
            'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
            `${
              wet
                ? `
          vec4 clip=derbyProjection*vec4(vRoad,1.);
          vec2 uv=clip.xy/max(.001,clip.w)*.5+.5;
          vec2 ripple=(grit.rb-.5)*vec2(.005,.0025);
          float edge=smoothstep(.0,.04,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));
          vec3 reflection=texture2D(derbyReflection,clamp(uv+ripple,.001,.999)).rgb;
          float grazing=pow(1.-abs(normalize(cameraPosition-vRoad).y),2.);
          outgoingLight=mix(outgoingLight,reflection,puddle*edge*(.075+.33*grazing));`
                : ''
            }
          gl_FragColor = vec4(outgoingLight,diffuseColor.a);`,
          );
    };
    mat.extensions = { derivatives: true };
    mat.customProgramCacheKey = () => 'derby-road-' + mapId;
    return mat;
  }
  const reflectCam = new T.PerspectiveCamera(),
    reflectionVP = new T.Matrix4();
  const direction = new T.Vector3();
  let reflectTarget,
    lastReflection = -Infinity,
    reflecting = false;
  function reflectionOn(id) {
    reflecting = wetMaps.has(id);
    lastReflection = -Infinity;
    if (reflecting && !reflectTarget)
      reflectTarget = new T.WebGLRenderTarget(coarse ? 256 : 448, coarse ? 160 : 256, { depthBuffer: true });
  }
  function reflect(renderer, scene, camera, now) {
    if (!reflecting || now - lastReflection < (coarse ? 160 : 90)) return;
    lastReflection = now;
    camera.updateMatrixWorld();
    camera.getWorldDirection(direction);
    reflectCam.position.copy(camera.position);
    reflectCam.position.y *= -1;
    direction.y *= -1;
    reflectCam.up.set(0, -1, 0);
    reflectCam.lookAt(direction.add(reflectCam.position));
    reflectCam.projectionMatrix.copy(camera.projectionMatrix);
    reflectCam.layers.set(1);
    reflectCam.updateMatrixWorld();
    reflectionVP.multiplyMatrices(reflectCam.projectionMatrix, reflectCam.matrixWorldInverse);
    const target = renderer.getRenderTarget(),
      shadow = renderer.shadowMap.autoUpdate;
    try {
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(reflectTarget);
      renderer.render(scene, reflectCam);
    } finally {
      renderer.setRenderTarget(target);
      renderer.shadowMap.autoUpdate = shadow;
    }
  }
  function paintedTrack(arena, id, half) {
    const size = 1024,
      c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.translate(512, 512);
    const unit = size / (half * 2);
    ctx.scale(unit, unit);
    let seed = 81605;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let turn = 0; turn < 22; turn++) {
      const x = (rand() - 0.5) * 105,
        z = (rand() - 0.5) * 110,
        r = 9 + rand() * 22,
        angle = rand() * 6.28,
        arc = 0.6 + rand() * 2.55;
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(angle);
      ctx.scale(1, 0.56 + rand() * 0.36);
      for (const axle of [-0.77, 0.77])
        for (let band = 0; band < 3; band++) {
          ctx.lineWidth = 0.11 + rand() * 0.1;
          ctx.strokeStyle = id === 'gobi' ? 'rgba(109,70,42,.32)' : 'rgba(14,17,21,.48)';
          ctx.beginPath();
          ctx.arc(0, 0, r + axle + band * 0.12, 0, arc);
          ctx.stroke();
        }
      ctx.restore();
    }
    if (id !== 'gobi') {
      for (const x of [-58, 58]) {
        ctx.strokeStyle = id === 'shanghai' ? '#b7c2d4' : '#d9ab62';
        ctx.lineWidth = 0.2;
        ctx.setLineDash([3.4, 2.8]);
        ctx.beginPath();
        ctx.moveTo(x, -half + 4);
        ctx.lineTo(x, half - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const z of [-55, 55]) {
          ctx.save();
          ctx.translate(x, z);
          ctx.rotate(z < 0 ? 0 : Math.PI);
          ctx.fillStyle = '#d6bf93';
          ctx.beginPath();
          ctx.moveTo(0, -2);
          ctx.lineTo(1.5, 0.2);
          ctx.lineTo(0.48, -0.15);
          ctx.lineTo(0.48, 2.1);
          ctx.lineTo(-0.48, 2.1);
          ctx.lineTo(-0.48, -0.15);
          ctx.lineTo(-1.5, 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    const m = mesh(
      arena,
      new T.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2),
      new T.MeshStandardMaterial({
        map: t,
        transparent: true,
        opacity: 0.7,
        roughness: 0.87,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      0,
      0.015,
      0,
    );
    m.renderOrder = 1;
  }
  function barricades(arena, id, half) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const p = c.getContext('2d');
    p.fillStyle = id === 'gobi' ? '#85755d' : '#52606b';
    p.fillRect(0, 0, 512, 128);
    const grad = p.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#95948b');
    grad.addColorStop(0.11, '#75736c');
    grad.addColorStop(0.63, '#444851');
    grad.addColorStop(1, '#32353a');
    p.fillStyle = grad;
    p.fillRect(0, 0, 512, 128);
    p.save();
    p.beginPath();
    p.rect(0, 25, 512, 57);
    p.clip();
    p.fillStyle = '#222830';
    p.fillRect(0, 25, 512, 57);
    for (let i = -1; i < 9; i++) {
      p.fillStyle = id === 'shanghai' ? '#9ab6bf' : '#dba34c';
      p.beginPath();
      p.moveTo(i * 64, 82);
      p.lineTo(i * 64 + 28, 82);
      p.lineTo(i * 64 + 62, 25);
      p.lineTo(i * 64 + 34, 25);
      p.fill();
    }
    p.restore();
    for (let i = 0; i < 3800; i++) {
      const x = (i * 87.31) % 512,
        y = (i * i * 1.871) % 128;
      p.fillStyle = i % 2 ? 'rgba(36,36,33,.26)' : 'rgba(211,202,181,.30)';
      p.fillRect(x, y, 1 + (i % 4), 1);
    }
    for (const x of [4, 255, 507]) {
      p.fillStyle = '#323538';
      p.fillRect(x, 0, 2, 128);
      for (const y of [15, 99]) {
        p.fillStyle = '#292b2e';
        p.fillRect(x + 4, y, 4, 4);
      }
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = T.RepeatWrapping;
    t.repeat.x = 14;
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    const mat = new T.MeshStandardMaterial({ map: t, roughness: 0.78 });
    for (let side = 0; side < 4; side++) {
      const g = new T.Group();
      g.rotation.y = (side * Math.PI) / 2;
      arena.add(g);
      const face = new T.BufferGeometry(),
        w = half + 1;
      face.setAttribute(
        'position',
        new T.Float32BufferAttribute(
          [
            -w,
            0,
            -half + 1.63,
            w,
            0,
            -half + 1.63,
            -w,
            2.75,
            -half + 1.34,
            w,
            2.75,
            -half + 1.34,
            -w,
            3.81,
            -half + 1.34,
            w,
            3.81,
            -half + 1.34,
          ],
          3,
        ),
      );
      face.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 0.72, 1, 0.72, 0, 1, 1, 1], 2));
      face.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
      face.computeVertexNormals();
      const m = mesh(g, face, mat);
      m.receiveShadow = true;
    }
  }
  // Scenery stays outside the playable bounds. Boxes and braces share a draw call.
  function skyline(arena, id, half) {
    const pieces = [],
      colors = [];
    const dummy = new T.Object3D(),
      a = new T.Vector3(),
      b = new T.Vector3(),
      span = new T.Vector3();
    function place(color) {
      dummy.updateMatrix();
      pieces.push(dummy.matrix.clone());
      colors.push(color);
    }
    function box(x, y, z, w, h, d, color, angle = 0) {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(w, h, d);
      place(color);
    }
    function beam(ax, ay, az, bx, by, bz, width, color) {
      a.set(ax, ay, az);
      b.set(bx, by, bz);
      span.subVectors(b, a);
      dummy.position.copy(a).lerp(b, 0.5);
      dummy.scale.set(width, span.length(), width);
      dummy.quaternion.setFromUnitVectors(yAxis, span.normalize());
      place(color);
    }
    if (id === 'terminal') {
      for (const [x, z, h] of [
        [-52, -92, 32],
        [47, -99, 36],
        [-31, 99, 27],
        [63, 100, 30],
      ]) {
        const orange = 0xd0803f,
          iron = 0x394556;
        for (const fx of [-9, 9])
          for (const fz of [-4, 4]) {
            beam(x + fx * 1.32, 0, z + fz * 1.5, x + fx, h, z + fz, 0.96, orange);
            box(x + fx * 1.32, 2, z + fz * 1.5, 2.8, 4, 3.1, iron);
          }
        for (const fz of [-4, 4]) {
          for (const y of [h - 7, h]) box(x, y, z + fz, 23, 0.65, 0.7, orange);
          for (let i = 0; i < 5; i++)
            beam(x - 11 + i * 4.4, h - 7, z + fz, x - 6.6 + i * 4.4, h, z + fz, 0.41, orange);
          for (const y of [h, h + 2.4]) box(x + 9, y, z + fz, 40, 0.45, 0.55, orange);
          for (let i = 0; i < 10; i++)
            beam(x - 11 + i * 4, h, z + fz, x - 7 + i * 4, h + 2.4, z + fz, 0.23, orange);
        }
        box(x - 5, h + 2, z, 6.8, 4, 7.7, orange);
        box(x - 5, h + 2.4, z - 3.94, 4.9, 1.65, 0.14, 0x485e6b);
        for (const sx of [-3, 3]) beam(x + 16 + sx, h, z, x + 16 + sx, h - 9, z, 0.105, iron);
        box(x + 16, h - 10, z, 7.5, 2.65, 3.1, 0xac5636);
      }
      for (const s of [-1, 1])
        for (let i = 0; i < 5; i++) {
          const x = -96 + i * 48,
            z = s * (117 + (i % 2) * 9),
            height = 7 + (i % 3) * 2;
          box(x, height / 2, z, 41, height, 18, 0x4d5965);
          box(x, height + 0.28, z, 43, 0.55, 19, 0x293c50);
          for (let j = 0; j < 9; j++)
            box(x - 18 + j * 4.4, height * 0.71, z - s * 9.1, 3, 0.86, 0.18, j % 4 === 0 ? 0xe0ae71 : 0x81969d);
        }
    } else if (id === 'uralmash') {
      for (const side of [-1, 1])
        for (let i = 0; i < 5; i++) {
          const x = -100 + i * 50,
            z = side * 102,
            h = 10 + (i % 3) * 5;
          box(x, h / 2, z, 42, h, 17, 0x654d49);
          box(x, h, z, 44, 0.65, 18, 0x353942);
          for (let n = 0; n < 8; n++) box(x - 17 + n * 5, h * 0.63, z - side * 8.6, 2.7, 1.3, 0.22, 0xffa254);
          for (const py of [h + 2, h + 5]) box(x, py, z, 51, 0.5, 2.8, 0x4d4440);
          for (let n = 0; n < 8; n++)
            beam(x - 24 + n * 6, h + 2, z - side * 1.3, x - 18 + n * 6, h + 5, z - side * 1.3, 0.38, 0xc07e56);
        }
    } else if (id === 'shanghai') {
      for (const side of [-1, 1]) {
        const z = side * 94;
        box(0, 8.4, z, 178, 1.1, 5.6, 0x495773);
        for (const edge of [-2.6, 2.6]) box(0, 9.4, z + edge, 178, 0.4, 0.25, 0x55becf);
        for (const x of [-76, -48, -20, 8, 36, 64]) {
          box(x, 4.3, z, 1.22, 8.55, 2.4, 0x434960);
          beam(x, 5, z, x + 3, 8.3, z, 0.65, 0x58626f);
        }
        for (let i = 0; i < 4; i++) {
          const x = -55 + i * 9;
          box(x, 10.9, z, 8.7, 2.6, 2.9, 0x9a9fb4);
          box(x, 11.21, z - side * 1.48, 7.9, 0.93, 0.1, 0x77c5d2);
        }
      }
    } else {
      const pos = [],
        col = [],
        idx = [];
      const rings = 5,
        segments = 112;
      for (let j = 0; j < rings; j++)
        for (let i = 0; i <= segments; i++) {
          const t = ((i % segments) / segments) * Math.PI * 2;
          const mesa = Math.pow(
            Math.max(0, Math.sin(t * 7 + 0.7) * 0.47 + Math.sin(t * 13) * 0.22 + 0.49),
            0.48,
          );
          const crest = 12 + 24 * mesa + 6 * Math.sin(t * 3);
          const dist = 129 - j * 3 + Math.sin(t * 11) * 5 + (j % 2) * 2;
          pos.push(
            Math.cos(t) * dist,
            [0, crest * 0.32, crest * 0.63, crest * 0.92, crest][j],
            Math.sin(t) * dist,
          );
          const c = new T.Color([0x88614c, 0xa16c49, 0xde9964, 0xb9795b, 0xe0a47c][j])
            .convertSRGBToLinear()
            .multiplyScalar(0.92 + 0.1 * Math.sin(t * 9));
          col.push(c.r, c.g, c.b);
          if (j && i) {
            const n = j * (segments + 1) + i;
            idx.push(n, n - 1, n - segments - 2, n, n - segments - 2, n - segments - 1);
          }
        }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      mesh(arena, g, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 0.97 }));
    }
    if (!pieces.length) return;
    const inst = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshStandardMaterial({ roughness: 0.62, metalness: 0.24 }),
      pieces.length,
    );
    const color = new T.Color();
    pieces.forEach((m, i) => {
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, color.setHex(colors[i]).convertSRGBToLinear());
    });
    inst.frustumCulled = false;
    arena.add(inst);
  }
  function fitShowroom(room) {
    const steel = finish(0x586574, 0.52, 0.45),
      black = finish(0x27303e, 0.58, 0.35);
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const p = c.getContext('2d');
    const gradient = p.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#5d7180');
    gradient.addColorStop(0.38, '#384959');
    gradient.addColorStop(1, '#24323d');
    p.fillStyle = gradient;
    p.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 16; i++) {
      p.fillStyle = i % 2 ? '#3c4953' : '#50606c';
      p.fillRect(0, i * 16, 512, 1);
    }
    p.fillStyle = '#e6b87e';
    p.font = 'bold 105px sans-serif';
    p.fillText('17', 40, 161);
    p.fillStyle = '#bfd0d6';
    p.fillRect(200, 77, 204, 5);
    p.font = 'bold 27px sans-serif';
    p.fillText('PIT  GARAGE', 200, 124);
    p.fillStyle = '#d39143';
    for (let i = 0; i < 8; i++) {
      p.beginPath();
      p.moveTo(205 + i * 22, 146);
      p.lineTo(215 + i * 22, 146);
      p.lineTo(207 + i * 22, 158);
      p.lineTo(197 + i * 22, 158);
      p.fill();
    }
    const t = shared(new T.CanvasTexture(c));
    t.encoding = T.sRGBEncoding;
    const graphic = shared(new T.MeshStandardMaterial({ map: t, roughness: 0.67, metalness: 0.13 }));
    const lamp = shared(new T.MeshBasicMaterial({ color: new T.Color(1.8, 1.64, 1.38) }));
    const geometryCache = (name, w, h, d) => geometry('bay-' + name, () => new T.BoxGeometry(w, h, d));
    for (let side = 0; side < 4; side++) {
      const bay = new T.Group();
      bay.rotation.y = (side * Math.PI) / 2;
      room.add(bay);
      mesh(
        bay,
        geometry('garage-mural', () => new T.PlaneGeometry(9.4, 4.7)),
        graphic,
        -11.5,
        4.1,
        -17.66,
      );
      mesh(bay, geometryCache('walk', 34, 0.22, 1.8), steel, 0, 6.95, -16.95);
      const bits = [];
      for (let j = 0; j < 18; j++)
        bits.push(new T.BoxGeometry(0.065, 0.91, 0.065).translate(-16 + j * 1.85, 7.48, -16.05));
      for (const h of [7.41, 7.92]) bits.push(new T.BoxGeometry(33, 0.063, 0.064).translate(0, h, -16.05));
      const rail = mesh(bay, merge(bits), steel);
      for (const x of [-5.2, 5.2]) {
        mesh(bay, geometryCache('canopy', 3, 0.25, 0.8), black, x, 4.9, -17.4);
        mesh(bay, geometryCache('strip', 2.6, 0.12, 0.19), lamp, x, 4.82, -16.98);
      }
    }
  }
  function turntable(material) {
    const c = document.createElement('canvas');
    c.width = c.height = 768;
    const p = c.getContext('2d');
    p.translate(384, 384);
    const base = p.createRadialGradient(-65, -80, 12, 0, 0, 385);
    base.addColorStop(0, '#8995a3');
    base.addColorStop(1, '#555e6b');
    p.fillStyle = base;
    p.fillRect(-384, -384, 768, 768);
    for (let j = 0; j < 30000; j++) {
      const x = ((j * 71.43) % 768) - 384,
        y = ((j * j * 2.619) % 768) - 384;
      p.fillStyle = j % 2 ? 'rgba(17,24,36,.16)' : 'rgba(224,233,240,.15)';
      p.fillRect(x, y, 2.5, 0.65);
    }
    for (let i = 0; i < 24; i++) {
      p.save();
      p.rotate((i * Math.PI) / 12);
      p.fillStyle = '#394351';
      p.fillRect(-1, 300, 2, 85);
      for (const r of [315, 365]) {
        p.fillStyle = '#b3b9bb';
        p.beginPath();
        p.arc(0, r, 3, 0, Math.PI * 2);
        p.fill();
        p.fillStyle = '#49505b';
        p.fillRect(-1.5, r - 0.7, 3, 1.5);
      }
      if (i % 3 === 0) {
        p.fillStyle = '#ac8b58';
        for (let k = 0; k < 6; k++) p.fillRect(k * 4, 346, 2.2, 8);
      }
      p.restore();
    }
    for (const r of [300, 354, 373]) {
      p.strokeStyle = '#434e57';
      p.lineWidth = 1.6;
      p.beginPath();
      p.arc(0, 0, r, 0, Math.PI * 2);
      p.stroke();
    }
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 4;
    material.map = tex;
  }

  function containerDoors(parent) {
    const panels = geometry('cargo-bars', () => {
      const bits = [];
      for (const x of [-3.12, 3.12]) {
        for (const z of [-0.95, -0.39, 0.39, 0.95]) {
          bits.push(new T.CylinderGeometry(0.034, 0.034, 2.4, 8).translate(x, 0, z));
          for (const y of [-0.92, 0.82]) bits.push(new T.BoxGeometry(0.1, 0.15, 0.17).translate(x, y, z));
        }
        for (const s of [-1, 1])
          for (const y of [-1.24, 1.24])
            bits.push(new T.BoxGeometry(0.18, 0.28, 0.3).translate(x, y, s * 1.23));
      }
      return merge(bits);
    });
    mesh(parent, panels, gunmetal);
  }
  let beamTexture;
  function pickupBeam() {
    if (beamTexture) return beamTexture;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 128;
    const p = c.getContext('2d');
    const g = p.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,.12)');
    g.addColorStop(0.84, 'rgba(255,255,255,.46)');
    g.addColorStop(1, 'rgba(255,255,255,.94)');
    p.fillStyle = g;
    p.fillRect(0, 0, 32, 128);
    beamTexture = shared(new T.CanvasTexture(c));
    return beamTexture;
  }
  function pickupBase(g) {
    const top = geometry(
      'socket-pad',
      () =>
        new T.LatheGeometry(
          [
            [0.12, 0.02],
            [1.39, 0.02],
            [1.42, 0.06],
            [1.32, 0.17],
            [1.04, 0.17],
            [0.99, 0.1],
            [0.12, 0.1],
          ].map(([r, h]) => new T.Vector2(r, h)),
          32,
        ),
    );
    mesh(g, top, gunmetal);
  }

  const tailLens = finish(0xc83a42, 0.23, 0.33),
    stripeFinish = finish(0x313741, 0.37, 0.33);
  function rearDeck(parent, rear, hull, id) {
    const key = 'deck-' + id;
    if (!cachedGeometry.has(key + 'panel')) {
      hull.updateMatrixWorld(true);
      const ray = new T.Raycaster();
      function top(x, z) {
        ray.set(new T.Vector3(x, 3.5, z), new T.Vector3(0, -1, 0));
        const hit = ray.intersectObject(hull)[0];
        return hit ? hit.point.y + 0.013 : null;
      }
      const pos = [],
        uv = [],
        idx = [];
      const truck = id === 'buksir',
        volt = id === 'volt';
      for (let row = 0; row <= 48; row++) {
        const t = row / 48,
          z = truck ? lerp(-2.04, -1.26, t) : lerp(-2.02, 0.37, t);
        const width = truck ? 0.79 : volt ? lerp(0.28, 0.5, Math.sin(t * Math.PI)) : 0.215;
        for (let col = 0; col <= 6; col++) {
          const x = (col / 3 - 1) * width,
            y = top(x, z);
          pos.push(x, y ?? 0.98, z);
          uv.push(col / 6, t);
          if (row && col) {
            const n = row * 7 + col;
            idx.push(n - 8, n - 1, n, n - 8, n, n - 7);
          }
        }
      }
      const panel = new T.BufferGeometry();
      panel.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      panel.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      panel.setIndex(idx);
      panel.computeVertexNormals();
      cachedGeometry.set(key + 'panel', shared(panel));
      const louvres = [],
        accent = [],
        lower = [];
      for (let i = 0; i < (truck ? 7 : 8); i++) {
        const z = -1.97 + i * 0.102,
          width = truck ? 1.47 : volt ? 0.68 : 0.58,
          y = top(0, z);
        if (y != null)
          louvres.push(
            new T.BoxGeometry(width, 0.026, truck ? 0.026 : 0.047).rotateX(-0.23).translate(0, y + 0.019, z),
          );
      }
      const probes = [
        [-0.87, 0.62],
        [-0.71, 0.645],
        [-0.48, 0.65],
        [-0.28, 0.67],
        [0, 0.675],
        [0.28, 0.67],
        [0.48, 0.65],
        [0.71, 0.645],
        [0.87, 0.62],
      ];
      const points = probes.map(([x, y]) => {
        ray.set(new T.Vector3(x, y, -4), new T.Vector3(0, 0, 1));
        const hit = ray.intersectObject(hull)[0];
        return hit ? hit.point.clone().add(new T.Vector3(0, 0, -0.055)) : null;
      });
      if (points.every(Boolean)) {
        const curve = new T.CatmullRomCurve3(points);
        lower.push(new T.TubeGeometry(curve, 32, truck ? 0.095 : 0.075, 8, false));
        for (const sign of [-1, 1])
          for (let j = 0; j < 3; j++) {
            const x = sign * (0.47 + j * 0.105),
              y = truck ? 0.68 : 0.69;
            ray.set(new T.Vector3(x, y, -4), new T.Vector3(0, 0, 1));
            const hit = ray.intersectObject(hull)[0];
            if (!hit) continue;
            accent.push(new T.BoxGeometry(0.081, 0.051, 0.058).translate(x, y, hit.point.z - 0.11));
          }
      }
      for (const x of [-0.56, -0.28, 0, 0.28, 0.56]) {
        const fin = new T.BoxGeometry(0.035, 0.17, 0.29).rotateX(-0.17);
        fin.translate(x, 0.36, truck ? -2.27 : -2.38);
        lower.push(fin);
      }
      for (const [name, parts] of [
        ['fins', louvres],
        ['valance', lower],
        ['lens', accent],
      ])
        cachedGeometry.set(key + name, shared(merge(parts)));
    }
    const panel = mesh(parent, cachedGeometry.get(key + 'panel'), id === 'buksir' ? gunmetal : stripeFinish);
    const grill = mesh(rear, cachedGeometry.get(key + 'fins'), id === 'buksir' ? alloy : gunmetal);
    mesh(rear, cachedGeometry.get(key + 'valance'), rubber);
    const g = cachedGeometry.get(key + 'lens');
    if (g.getAttribute('position')?.count) mesh(rear, g, tailLens);
  }
  function sandstone(index, height) {
    const positions = [],
      colors = [],
      indices = [],
      edges = 12;
    const bands = [
      [0, 1],
      [0.17, 0.96],
      [0.24, 0.83],
      [0.53, 0.76],
      [0.59, 0.67],
      [0.72, 0.65],
      [0.76, 0.56],
      [0.93, 0.53],
      [1, 0.45],
    ];
    for (let row = 0; row < bands.length; row++)
      for (let i = 0; i <= edges; i++) {
        const a = (2 * Math.PI * (i % edges)) / edges;
        const radius =
          (11 + 3.1 * Math.sin(a * 3 + index) + 1.3 * Math.cos(a * 5 - 0.6 * index)) * bands[row][1];
        const y = height * bands[row][0] + (row ? Math.sin(a * 2.0 + 0.3 * row + index) * 1.2 : 0);
        positions.push(radius * Math.cos(a), y, radius * 0.86 * Math.sin(a));
        const col = new T.Color(
          [0x956949, 0xb47750, 0xae7658, 0xbf875f, 0x986954, 0xc3946b, 0x9f7157, 0xc28e69, 0xd6ad83][row],
        ).convertSRGBToLinear();
        colors.push(col.r, col.g, col.b);
        if (row && i) {
          const n = row * (edges + 1) + i;
          indices.push(n, n - edges - 1, n - edges - 2, n, n - edges - 2, n - 1);
        }
      }
    const end = positions.length / 3;
    positions.push(0, height, 0);
    colors.push(0.55, 0.34, 0.21);
    for (let i = 0; i < edges; i++) indices.push(end, end - 1 - i, end - 2 - i);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  let rampMaterial;
  function rampSurface() {
    if (rampMaterial) return rampMaterial;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#64666a';
    ctx.fillRect(0, 0, 512, 768);
    for (let i = 0; i < 17000; i++) {
      const x = (i * 37.713) % 512,
        y = (i * i * 1.713) % 768;
      ctx.fillStyle = i % 2 ? 'rgba(214,204,180,.14)' : 'rgba(27,33,36,.25)';
      ctx.fillRect(x, y, 1 + (i % 3), 1);
    }
    for (const x of [45, 339]) {
      ctx.fillStyle = '#313c44';
      ctx.fillRect(x, 0, 126, 768);
      for (let y = 4; y < 768; y += 15) {
        ctx.fillStyle = '#72787a';
        ctx.fillRect(x + 2, y, 122, 2);
        ctx.fillStyle = '#17252b';
        ctx.fillRect(x + 2, y + 3, 122, 4);
      }
    }
    for (let y = 0; y < 768; y += 192) {
      ctx.fillStyle = '#343d46';
      ctx.fillRect(0, y, 512, 5);
      for (const x of [24, 187, 324, 489]) {
        ctx.fillStyle = '#262d32';
        ctx.beginPath();
        ctx.arc(x, y + 12, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#e1b05d';
    for (let x = -32; x < 544; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 737);
      ctx.lineTo(x + 19, 737);
      ctx.lineTo(x + 39, 765);
      ctx.lineTo(x + 20, 765);
      ctx.fill();
    }
    const map = shared(new T.CanvasTexture(canvas));
    map.encoding = T.sRGBEncoding;
    map.anisotropy = 4;
    rampMaterial = shared(new T.MeshStandardMaterial({ map, roughness: 0.64, metalness: 0.36 }));
    return rampMaterial;
  }

  const weatherTextures = new Map();
  function weatherSprite(mode) {
    if (weatherTextures.has(mode)) return weatherTextures.get(mode);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const p = c.getContext('2d');
    p.translate(32, 32);
    const rain = mode === 'rain',
      sand = mode === 'sand',
      spark = mode === 'sparks';
    p.rotate(rain ? 0.16 : sand ? -0.26 : spark ? 0.45 : 0);
    p.scale(rain ? 0.084 : sand ? 0.94 : spark ? 0.22 : 1, rain ? 1 : sand ? 0.3 : spark ? 0.9 : 0.66);
    const g = p.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,.98)');
    g.addColorStop(0.36, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    p.fillStyle = g;
    p.fillRect(-32, -32, 64, 64);
    const t = shared(new T.CanvasTexture(c));
    weatherTextures.set(mode, t);
    return t;
  }
  function nitroPlume() {
    return new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      vertexShader:
        'varying vec2 vJet; void main(){vJet=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vJet;
      void main(){
        float t=clamp(vJet.y,0.,1.);
        float shock=pow(.5+.5*cos(t*25.),3.);
        float fade=smoothstep(0.,.17,t)*(1.-smoothstep(.75,1.,t));
        vec3 tint=mix(vec3(.035,.28,.95),vec3(.34,1.07,1.42),shock*(1.-t*.54));
        gl_FragColor=vec4(tint,fade*(.20+shock*.33));}`,
    });
  }

  return {
    weatherSprite,
    nitroPlume,
    rampSurface,
    sandstone,
    rearDeck,
    pickupBeam,
    pickupBase,
    containerDoors,
    fitShowroom,
    turntable,
    skyReady,
    skyTexture,
    road,
    paintedTrack,
    barricades,
    skyline,
    reflectionOn,
    reflect,
    paint,
    muzzle,
    bodywork,
    detailWheels,
  };
})();
