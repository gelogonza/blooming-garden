import * as THREE from 'three';
import { pondSD, pondGrad, WATER_Y } from './terrain.js';
import { gradientMap } from './toon.js';

// Classic koi varieties: base, patch, spot colour + how much spotting
const VARIETIES = [
  { base: '#fff8ee', patch: '#ff3a12', spot: '#111111', spots: 0.0 },  // kohaku
  { base: '#f4efe6', patch: '#d63a1e', spot: '#121212', spots: 1.0 },  // sanke
  { base: '#ffb21f', patch: '#ffd84a', spot: '#111111', spots: 0.0 },  // ogon (gold)
  { base: '#151515', patch: '#d5401f', spot: '#f1ece2', spots: 0.8 },  // showa
  { base: '#fff8ee', patch: '#ff8a10', spot: '#111111', spots: 0.0 },  // orange/white
  { base: '#a8672f', patch: '#7a4a22', spot: '#111111', spots: 0.0 },  // chagoi (bronze)
];

const NOISE = /* glsl */ `
float kh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float koiNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(kh(i), kh(i + vec2(1, 0)), f.x), mix(kh(i + vec2(0, 1)), kh(i + vec2(1, 1)), f.x), f.y);
}`;

/** Inject the swimming body wave (and, for the body, the koi pattern) into a standard material. */
function koiMaterial(base, { pattern, variety, seed }) {
  const uniforms = {
    uPhase: { value: 0 }, uAmp: { value: 0.05 }, uSeed: { value: seed },
    uBase: { value: new THREE.Color(variety.base) }, uPatch: { value: new THREE.Color(variety.patch) },
    uSpot: { value: new THREE.Color(variety.spot) }, uSpots: { value: variety.spots },
    uCaustic: { value: 0 }, uTime: { value: 0 },
  };
  const mat = base;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uPhase, uAmp; varying vec2 vKoiUv; varying vec3 vKoiWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vKoiUv = uv;
        // body wave: travels nose -> tail, grows toward the tail
        float bt = clamp((0.42 - position.x) / 0.8, 0.0, 1.5);
        transformed.z += sin(uPhase - bt * 5.5) * uAmp * (0.12 + bt * bt);
        vKoiWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    if (pattern) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uBase, uPatch, uSpot; uniform float uSeed, uSpots, uCaustic, uTime; varying vec2 vKoiUv; varying vec3 vKoiWorld;
          ${NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 kp = vKoiUv * vec2(7.0, 3.0) + uSeed * 13.0;
          float n = koiNoise(kp) * 0.65 + koiNoise(kp * 2.3) * 0.35;
          vec3 kc = mix(uBase, uPatch, smoothstep(0.5, 0.56, n));
          float s = koiNoise(vKoiUv * vec2(14.0, 6.0) + uSeed * 7.0);
          kc = mix(kc, uSpot, smoothstep(0.7, 0.74, s) * uSpots);
          kc = mix(kc, uBase * 1.05, smoothstep(0.32, 0.18, vKoiUv.y) * 0.6);   // paler belly
          // caustics: sunlight focused by the ripples dances over the koi's back
          vec2 cp = vKoiWorld.xz * 9.0;
          float cs = sin(cp.x + uTime * 1.7) + sin(cp.y * 1.1 - uTime * 1.3) + sin((cp.x + cp.y) * 0.8 + uTime * 2.2);
          float caustic = smoothstep(1.5, 2.6, cs) * smoothstep(-0.2, 0.6, vNormal.y);
          diffuseColor.rgb = kc + caustic * uCaustic * 0.45;`);
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vKoiUv; varying vec3 vKoiWorld;');
    }
  };
  mat.customProgramCacheKey = () => (pattern ? 'koi-body' : 'koi-fin');
  mat.userData.uniforms = uniforms;
  return mat;
}

export class KoiSchool {
  /** events.onRing(x, z, strength) and events.onBubble(x, y, z) let the pond react to the fish */
  constructor(scene, koiTemplate, count = 6, events = {}) {
    this.events = events;
    this.fish = [];
    this.wake = [];
    this.tmp = new THREE.Vector2();
    for (let i = 0; i < count; i++) {
      const variety = VARIETIES[i % VARIETIES.length];
      const seed = Math.random() * 10;
      const obj = koiTemplate.clone(true);
      const uniformsList = [];
      obj.traverse((m) => {
        if (!m.isMesh) return;
        const name = m.material.name;
        let mat;
        if (name.includes('Body')) {
          mat = koiMaterial(new THREE.MeshToonMaterial({ gradientMap }), { pattern: true, variety, seed });
        } else if (name.includes('Fin')) {
          mat = koiMaterial(new THREE.MeshToonMaterial({
            color: new THREE.Color(variety.base).lerp(new THREE.Color(variety.patch), 0.25),
            gradientMap, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false,
          }), { pattern: false, variety, seed });
        } else {
          mat = koiMaterial(new THREE.MeshToonMaterial({ color: '#050505', gradientMap }), { pattern: false, variety, seed });
        }
        m.material = mat;
        uniformsList.push(mat.userData.uniforms);
      });
      const s = THREE.MathUtils.randFloat(0.32, 0.42);
      obj.scale.setScalar(s);
      // spawn somewhere deep inside the pond
      let x, z;
      do { x = THREE.MathUtils.randFloat(-2, 2); z = THREE.MathUtils.randFloat(-1.8, 1.6); } while (pondSD(x, z) > -0.6);
      const f = {
        obj, uniformsList, x, z,
        heading: Math.random() * Math.PI * 2,
        speed: 0.15, phase: Math.random() * 10, seed,
        depth: THREE.MathUtils.randFloat(-0.2, -0.13),
        y: -0.16,
        kissIn: THREE.MathUtils.randFloat(3, 12),   // seconds until it rises to "kiss" the surface
        kiss: 0, kissed: false,
        bubbleIn: THREE.MathUtils.randFloat(1, 4),
        scared: false,
      };
      this.wake.push(new THREE.Vector4());
      obj.rotation.order = 'YXZ';   // yaw first, then roll around the fish's own axis
      obj.position.set(x, f.depth, z);
      scene.add(obj);
      this.fish.push(f);
    }
  }

  /** near: 0..1 hand proximity; hand: Vector2 (x,z) the hand approaches from. */
  update(dt, t, near, hand, day = 1) {
    const ev = this.events;
    const turnToward = (h, target, rate) => {
      let d = Math.atan2(Math.sin(target - h), Math.cos(target - h));
      return h + THREE.MathUtils.clamp(d, -rate, rate);
    };
    for (const f of this.fish) {
      // 1. lazy wander
      f.heading += Math.sin(t * 0.37 + f.seed * 9.1) * 0.7 * dt;
      // 2. stay inside the pond: steer back toward the middle as the shore nears
      const sd = pondSD(f.x, f.z);
      if (sd > -0.55) {
        const g = pondGrad(f.x, f.z, this.tmp);
        const inward = Math.atan2(-g.y, -g.x);
        f.heading = turnToward(f.heading, inward, dt * 3.2 * THREE.MathUtils.smoothstep(sd, -0.55, -0.25) * 2);
      }
      // 3. flee the approaching hand
      const dx = f.x - hand.x, dz = f.z - hand.y;
      const dist = Math.hypot(dx, dz);
      const fear = near * THREE.MathUtils.clamp(1.8 - dist * 0.45, 0, 1);
      if (fear > 0.02) f.heading = turnToward(f.heading, Math.atan2(dz, dx), dt * 5 * fear);
      // 4. keep a little distance from each other
      for (const o of this.fish) {
        if (o === f) continue;
        const ox = f.x - o.x, oz = f.z - o.z, od = Math.hypot(ox, oz);
        if (od < 0.35 && od > 1e-4) f.heading = turnToward(f.heading, Math.atan2(oz, ox), dt * 1.5);
      }
      const targetSpeed = 0.14 + fear * 0.75;
      f.speed += (targetSpeed - f.speed) * (1 - Math.exp(-dt * (fear > 0.05 ? 6 : 1.5)));
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.z += Math.sin(f.heading) * f.speed * dt;
      // hard limit: never leave the water
      const sd2 = pondSD(f.x, f.z);
      if (sd2 > -0.22) {
        const g = pondGrad(f.x, f.z, this.tmp);
        f.x -= g.x * (sd2 + 0.22); f.z -= g.y * (sd2 + 0.22);
      }
      f.phase += dt * (3.5 + f.speed * 22);
      const amp = 0.035 + f.speed * 0.12;
      for (const u of f.uniformsList) { u.uPhase.value = f.phase; u.uAmp.value = amp; }
      // ── surface kiss: every so often a koi rises, touches the surface (ring), and sinks again ──
      f.kissIn -= dt;
      if (f.kissIn <= 0 && f.kiss <= 0 && fear < 0.1) { f.kiss = 1.8; f.kissed = false; }
      let targetY = f.depth + Math.sin(t * 0.6 + f.seed) * 0.02;
      if (f.kiss > 0) {
        f.kiss -= dt;
        targetY = WATER_Y - 0.035;
        if (!f.kissed && f.kiss < 0.9) {
          f.kissed = true;
          const nx = f.x + Math.cos(f.heading) * 0.14 * f.obj.scale.x * 2.5;
          const nz = f.z + Math.sin(f.heading) * 0.14 * f.obj.scale.x * 2.5;
          ev.onRing?.(nx, nz, 1.0);
          ev.onBubble?.(nx, WATER_Y - 0.05, nz);
        }
        if (f.kiss <= 0) f.kissIn = THREE.MathUtils.randFloat(6, 15);
      }
      f.y += (targetY - f.y) * (1 - Math.exp(-dt * 2.5));
      f.obj.position.set(f.x, Math.min(f.y, WATER_Y - 0.03), f.z);

      // ── startled: a splash ring + a burst of bubbles the moment the hand scares it ──
      if (fear > 0.35 && !f.scared) {
        f.scared = true;
        ev.onRing?.(f.x, f.z, 1.3);
        for (let b = 0; b < 4; b++) ev.onBubble?.(f.x + (Math.random() - 0.5) * 0.1, f.y, f.z + (Math.random() - 0.5) * 0.1);
      } else if (fear < 0.12) f.scared = false;

      // ── idle bubbles from the mouth ──
      f.bubbleIn -= dt;
      if (f.bubbleIn <= 0) {
        f.bubbleIn = THREE.MathUtils.randFloat(1.5, 5);
        ev.onBubble?.(f.x + Math.cos(f.heading) * 0.12, f.y + 0.02, f.z + Math.sin(f.heading) * 0.12);
      }

      // wake strength: faster and closer to the surface -> stronger V
      const nearSurface = THREE.MathUtils.lerp(0.35, 1, THREE.MathUtils.smoothstep(f.y, -0.2, WATER_Y - 0.04));
      this.wake[this.fish.indexOf(f)].set(f.x, f.z, f.heading, THREE.MathUtils.clamp((0.2 + f.speed * 2.2) * nearSurface, 0, 1));
      for (const u of f.uniformsList) { if (u.uCaustic) { u.uCaustic.value = day; u.uTime.value = t; } }
      f.obj.rotation.y = -f.heading;
      f.obj.rotation.x = Math.sin(f.phase * 0.5) * 0.04;      // slight roll
    }
  }
}
