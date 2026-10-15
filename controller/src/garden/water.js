import * as THREE from 'three';
import { POND_GLSL, WATER_Y } from './terrain.js';

export const MAX_FISH = 8, MAX_RINGS = 16;

export class Water {
  constructor(scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#0d3b3f') },
      uSky: { value: new THREE.Color('#9cc3dd') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#ffffff') },
      uStir: { value: 0 },
      // per-fish wake: (x, z, heading, strength) and expanding rings: (x, z, age, strength)
      uFish: { value: Array.from({ length: MAX_FISH }, () => new THREE.Vector4()) },
      uRings: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
    };
    this.rings = [];
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uStir;
        uniform vec3 uDeep, uSky, uSunColor, uSunDir;
        uniform vec4 uFish[${MAX_FISH}];
        uniform vec4 uRings[${MAX_RINGS}];
        varying vec3 vWorld;
        ${POND_GLSL}
        // sum of travelling waves -> analytic surface slope
        vec2 slope(vec2 p) {
          float t = uTime * (1.0 + uStir * 2.5);
          vec2 s = vec2(0.0);
          s += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 6.0 + t * 1.3) * 0.045;
          s += vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 9.0 + t * 1.7) * 0.03;
          s += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 15.0 + t * 2.3) * (0.015 + uStir * 0.03);
          return s;
        }
        // koi wakes + rings: returns foam amount and bends the surface slope so they catch the light
        float ripples(vec2 p, inout vec2 sl) {
          float foam = 0.0;
          for (int i = 0; i < ${MAX_FISH}; i++) {
            vec4 f = uFish[i];
            if (f.w < 0.001) continue;
            vec2 fwd = vec2(cos(f.z), sin(f.z));
            vec2 rel = p - f.xy;
            float behind = -dot(rel, fwd);
            float side = dot(rel, vec2(-fwd.y, fwd.x));
            if (behind > -0.2 && behind < 0.8) {
              float b = max(behind, 0.0);
              // V-shaped wake arms that open up and fade behind the fish, with travelling crests
              float arms = smoothstep(0.024 * (1.0 - b), 0.0, abs(abs(side) - b * 0.42 - 0.035)) * smoothstep(0.7, 0.04, b);
              arms *= 0.55 + 0.45 * sin(b * 32.0 - uTime * 7.0);
              // little bow ring just ahead of the nose
              vec2 nose = rel - fwd * 0.1;
              float bow = smoothstep(0.02, 0.0, abs(length(nose) - 0.06 - 0.01 * sin(uTime * 9.0)));
              foam += (arms + bow * 0.6) * f.w;
              float dd = length(rel);
              sl += rel / (dd + 1e-4) * cos(dd * 38.0 - uTime * 8.0) * 0.035 * f.w * smoothstep(0.5, 0.0, dd);
            }
          }
          for (int i = 0; i < ${MAX_RINGS}; i++) {
            vec4 r = uRings[i];
            if (r.w < 0.001) continue;
            float rad = 0.04 + r.z * 0.5;
            float dist = length(p - r.xy);
            float fade = (1.0 - smoothstep(0.0, 1.6, r.z)) * r.w;
            foam += smoothstep(0.024, 0.0, abs(dist - rad)) * fade;
            foam += smoothstep(0.016, 0.0, abs(dist - rad * 0.62)) * fade * 0.55;       // inner echo
            sl += (p - r.xy) / (dist + 1e-4) * cos((dist - rad) * 50.0) * 0.06 * fade * smoothstep(0.12, 0.0, abs(dist - rad));
          }
          return clamp(foam, 0.0, 1.0);
        }
        void main() {
          float sd = pondSD(vWorld.xz);
          if (sd > 0.05) discard;
          vec2 sl = slope(vWorld.xz);
          float koiFoam = ripples(vWorld.xz, sl);
          vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 r = reflect(-v, n);
          float spec = pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0);
          float depthTint = smoothstep(0.0, -0.9, sd);                 // deeper toward the middle
          vec3 col = mix(uDeep * 1.6, uDeep * 0.7, depthTint);
          col = mix(col, uSky, 0.15 + fres * 0.75);
          col += uSunColor * spec * 2.5;
          // cartoon foam: a bright wobbling band hugging the shore + a second ring further in
          float wob = sin(atan(vWorld.z - 0.0, vWorld.x - 0.2) * 9.0 + uTime * 1.5) * 0.015;
          float foam = smoothstep(-0.13 + wob, -0.05 + wob, sd);
          float ring = smoothstep(0.012, 0.0, abs(sd + 0.24 + wob * 2.0 + sin(uTime * 0.8) * 0.02));
          col = mix(col, vec3(0.92, 1.0, 1.0), max(max(foam, ring * 0.55), koiFoam) * 0.8);
          float alpha = max(mix(0.42, 0.9, fres), koiFoam * 0.9) * smoothstep(0.05, -0.04, sd);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 4.8, 1, 1), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0.15, WATER_Y, 0.05);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  /** A ring spreading out from (x, z): koi kisses, splashes, bubble pops. */
  addRing(x, z, strength = 1) {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, z, age: 0, strength });
  }

  update(time, sky, stir, dt = 0, fish = []) {
    const u = this.uniforms;
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 1.6);
    u.uRings.value.forEach((v, i) => {
      const r = this.rings[i];
      r ? v.set(r.x, r.z, r.age, r.strength) : v.set(0, 0, 0, 0);
    });
    u.uFish.value.forEach((v, i) => (fish[i] ? v.copy(fish[i]) : v.set(0, 0, 0, 0)));
    u.uTime.value = time;
    u.uStir.value = stir;
    u.uSky.value.copy(sky.uniforms.uHorizon.value).lerp(sky.uniforms.uTop.value, 0.4);
    u.uDeep.value.set('#0e6a6e').lerp(new THREE.Color('#0b2540'), sky.uniforms.uNight.value);
    u.uSunDir.value.copy(sky.uniforms.uSunDir.value);
    u.uSunColor.value.copy(sky.uniforms.uSunColor.value);
  }
}
