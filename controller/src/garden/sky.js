import * as THREE from 'three';

// Keyframes of the day, blended by the light sensor: night -> dusk -> day.
const KEYS = [
  { at: 0.0, top: '#050a1d', horizon: '#16234a', light: '#a3b8ff', lightI: 1.0, hemiSky: '#41569a', hemiGround: '#141826', hemiI: 0.75,
    fog: '#0d1531', cloudLit: '#4a5888', cloudShade: '#151c38', sun: '#ff7a3a' },
  { at: 0.38, top: '#2c3a78', horizon: '#ff9566', light: '#ffac70', lightI: 1.4, hemiSky: '#8d7fb8', hemiGround: '#3a2a22', hemiI: 0.65,
    fog: '#c98a74', cloudLit: '#ffb48c', cloudShade: '#6b4a72', sun: '#ff8a3d' },
  { at: 1.0, top: '#1f6cf0', horizon: '#8fd3ff', light: '#fff2df', lightI: 2.7, hemiSky: '#d8ecff', hemiGround: '#5a7a2a', hemiI: 1.05,
    fog: '#bed4e8', cloudLit: '#ffffff', cloudShade: '#aebfd2', sun: '#fff1c9' },
];
const ca = new THREE.Color(), cb = new THREE.Color();
function key(name, d, out) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (d <= b.at) {
      const t = THREE.MathUtils.smoothstep(d, a.at, b.at);
      if (out) return out.copy(ca.set(a[name])).lerp(cb.set(b[name]), t);
      return THREE.MathUtils.lerp(a[name], b[name], t);
    }
  }
  const last = KEYS[KEYS.length - 1][name];
  return out ? out.set(last) : last;
}
/** direction from yaw (0 = straight ahead into the scene, +right) and elevation (radians) */
const dirFrom = (az, el, out) => out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));

// ───────── soft glow billboard (sun disc + halo, moon halo) ─────────
function glowBillboard(size, { core, coreBoost, halo }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float disc = smoothstep(${core.toFixed(3)}, ${(core * 0.9).toFixed(3)}, r) * ${coreBoost.toFixed(2)};
        float glow = pow(max(1.0 - r, 0.0), 2.5) * ${halo.toFixed(2)};
        gl_FragColor = vec4(uColor * (disc + glow) * uAlpha, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.frustumCulled = false;
  return m;
}

// ───────── moon surface: maria + craters painted on a canvas ─────────
function moonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#dfe3ec'; g.fillRect(0, 0, 256, 256);
  const blot = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(120,128,150,${a})`); gr.addColorStop(1, 'rgba(120,128,150,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  [[90, 100, 60, 0.55], [160, 80, 45, 0.45], [150, 170, 55, 0.5], [70, 180, 35, 0.4]].forEach((b) => blot(...b));
  for (let i = 0; i < 40; i++) {               // craters: dark floor + bright rim
    const x = Math.random() * 256, y = Math.random() * 256, r = 3 + Math.random() * 12;
    g.fillStyle = 'rgba(110,115,135,0.35)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x - 1, y - 1, r, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────── shooting stars: short additive streaks, only at night ─────────
class ShootingStars {
  constructor(scene) {
    this.pool = Array.from({ length: 3 }, () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1.6, 1.6, 1.8, 0, 0, 0]), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      line.frustumCulled = false; line.visible = false;
      scene.add(line);
      return { line, life: 0, head: new THREE.Vector3(), vel: new THREE.Vector3() };
    });
    this.next = 2;
  }
  update(dt, night, camPos) {
    this.next -= dt;
    if (night > 0.6 && this.next <= 0) {
      const s = this.pool.find((p) => p.life <= 0);
      if (s) {
        const az = THREE.MathUtils.randFloat(-0.55, 0.55), el = THREE.MathUtils.randFloat(0.05, 0.16);
        dirFrom(az, el, s.head).multiplyScalar(45).add(camPos);
        s.vel.set(Math.random() < 0.5 ? -1 : 1, -0.45, 0).normalize().multiplyScalar(THREE.MathUtils.randFloat(14, 22));
        s.life = 0.7; s.line.visible = true;
      }
      this.next = THREE.MathUtils.randFloat(2.5, 7);
    }
    for (const s of this.pool) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.head.addScaledVector(s.vel, dt);
      const tail = s.head.clone().addScaledVector(s.vel, -0.12);
      const arr = s.line.geometry.attributes.position.array;
      arr.set([s.head.x, s.head.y, s.head.z, tail.x, tail.y, tail.z]);
      s.line.geometry.attributes.position.needsUpdate = true;
      s.line.material.opacity = Math.min(1, s.life * 3) * night;
      if (s.life <= 0) s.line.visible = false;
    }
  }
}

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
      uNight: { value: 0 }, uTime: { value: 0 }, uDusk: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir, uMoonDir, uCloudLit, uCloudShade;
        uniform float uNight, uTime, uDusk;
        varying vec3 vDir;
        float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, h));

          // atmospheric glow hugging the sun (warm bands at dusk) and a faint moon halo
          float sg = max(dot(d, uSunDir), 0.0);
          // broad warm band only near the horizon (strongest at dusk), tight halo around the disc
          float duskBand = 0.35 * uDusk * smoothstep(0.35, 0.0, abs(h - 0.02));
          col += uSunColor * (pow(sg, 5.0) * duskBand + pow(sg, 64.0) * 0.45) * (1.0 - uNight);
          float mg = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.45, 0.55, 0.9) * pow(mg, 24.0) * 0.3 * uNight;

          // clouds: fbm projected onto a dome, drifting with the wind
          float cloud = 0.0;
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.12) * 0.8 + vec2(uTime * 0.015, uTime * 0.005);
            float c = fbm(uv * 0.75);
            cloud = smoothstep(0.5, 0.78, c) * smoothstep(0.0, 0.1, h);
            float lit = 0.4 + 0.6 * pow(sg, 2.0) + 0.3 * pow(mg, 4.0) * uNight;
            vec3 cc = mix(uCloudShade, uCloudLit, clamp(lit + (c - 0.6), 0.0, 1.0));
            col = mix(col, cc, cloud * 0.85);
          }

          // stars: slowly turning sky, twinkling, hidden behind clouds
          float a = uTime * 0.004;
          vec3 sd = d; sd.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * sd.xz;
          vec3 g = floor(sd * 230.0);
          float star = step(0.9962, h3(g));
          float tw = 0.5 + 0.5 * sin(uTime * (1.5 + h3(g + 3.0) * 3.0) + h3(g + 1.0) * 40.0);
          col += vec3(0.9, 0.95, 1.0) * star * tw * uNight * smoothstep(0.0, 0.12, h) * (1.0 - cloud);

          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);

    // celestial bodies
    this.sun = glowBillboard(10, { core: 0.2, coreBoost: 4.0, halo: 0.4 });
    this.moonHalo = glowBillboard(7, { core: 0.0, coreBoost: 0.0, halo: 0.4 });
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 32, 16),
      new THREE.MeshBasicMaterial({ map: moonTexture(), color: '#e8ecff', fog: false, transparent: true }),
    );
    for (const o of [this.sun, this.moonHalo, this.moon]) { o.renderOrder = 0; scene.add(o); }
    this.stars = new ShootingStars(scene);

    // key light (sun by day, moon by night) + sky fill
    this.key = new THREE.DirectionalLight('#ffffff', 1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    scene.add(this.key, this.key.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#222222', 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2('#000000', 0.014);
    this.scene = scene;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
  }

  /** d: daylight 0 (night) .. 1 (noon); camera: to anchor the sky dome and face billboards */
  update(d, time, dt, camera) {
    const u = this.uniforms;
    key('top', d, u.uTop.value);
    key('horizon', d, u.uHorizon.value);
    key('cloudLit', d, u.uCloudLit.value);
    key('cloudShade', d, u.uCloudShade.value);
    const night = 1 - THREE.MathUtils.smoothstep(d, 0.05, 0.4);
    u.uNight.value = night;
    u.uDusk.value = Math.exp(-((d - 0.33) ** 2) / 0.02);     // the wide horizon glow only belongs to sunset
    u.uTime.value = time;
    this.mesh.position.copy(camera.position);       // dome follows the eye -> no parallax on the horizon

    // ── the arc: as light rises the sun climbs from the right horizon toward the middle;
    //    as it fades the sun sinks right and the moon rises on the left ──
    // squeeze the arcs to the visible width so the sunset never happens off-screen on narrow windows
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const span = Math.min(1, (halfFov * 0.8) / 0.42);
    const p = THREE.MathUtils.smoothstep(d, 0.05, 0.9);
    const sunAz = THREE.MathUtils.lerp(0.42, 0.06, p) * span + Math.sin(time * 0.03) * 0.02;
    const sunEl = THREE.MathUtils.lerp(-0.14, 0.085, Math.sqrt(p));   // sits on the horizon around dusk (~30% light)
    dirFrom(sunAz, sunEl, this.sunDir);
    const q = 1 - THREE.MathUtils.smoothstep(d, 0.0, 0.42);
    const moonAz = THREE.MathUtils.lerp(-0.42, -0.14, q) * span + Math.sin(time * 0.025 + 1) * 0.015;
    const moonEl = THREE.MathUtils.lerp(-0.14, 0.075, Math.sqrt(q));
    dirFrom(moonAz, moonEl, this.moonDir);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.moonDir);
    key('sun', d, u.uSunColor.value);

    const R = 48;
    this.sun.position.copy(camera.position).addScaledVector(this.sunDir, R);
    this.sun.quaternion.copy(camera.quaternion);
    this.sun.material.uniforms.uColor.value.copy(u.uSunColor.value);
    this.sun.material.uniforms.uAlpha.value = THREE.MathUtils.smoothstep(sunEl, -0.12, -0.02) * (1 - night);
    this.moon.position.copy(camera.position).addScaledVector(this.moonDir, R);
    this.moon.rotation.y = time * 0.02;
    this.moon.material.opacity = THREE.MathUtils.smoothstep(moonEl, -0.16, -0.04) * (0.25 + 0.75 * night);
    this.moonHalo.position.copy(this.moon.position).addScaledVector(this.moonDir, 0.5);
    this.moonHalo.quaternion.copy(camera.quaternion);
    this.moonHalo.material.uniforms.uColor.value.set('#8fa6ff');
    this.moonHalo.material.uniforms.uAlpha.value = this.moon.material.opacity * night;

    // light: follows the visible sun/moon sideways but stays high and in front,
    // so the garden is lit from the viewer's side instead of silhouetted
    const lightSide = night > 0.5 ? this.moonDir.x : this.sunDir.x;
    this.key.position.set(lightSide * 10, 5 + 7 * p + night * 3, 7);
    key('light', d, this.key.color);
    this.key.intensity = key('lightI', d);
    key('hemiSky', d, this.hemi.color);
    key('hemiGround', d, this.hemi.groundColor);
    this.hemi.intensity = key('hemiI', d);
    key('fog', d, this.scene.fog.color);

    this.stars.update(dt, night, camera.position);
  }
}
