import * as THREE from 'three';
import { WATER_Y } from './terrain.js';

/** Cartoon bubbles: outlined circles with a highlight that wobble up and pop into a ring. */
export class Bubbles {
  constructor(scene, onPop, max = 64) {
    this.onPop = onPop;
    this.max = max;
    this.items = [];
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { uScale: { value: 500 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSize; uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5) discard;
          float rim = smoothstep(0.32, 0.46, d) * smoothstep(0.5, 0.46, d);      // bright outline
          float fill = 0.12;
          float hi = smoothstep(0.13, 0.0, length(p - vec2(-0.16, -0.16)));      // glint
          float a = max(max(rim, hi), fill);
          gl_FragColor = vec4(vec3(0.85, 0.98, 1.0) + hi * 0.3, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;          // under the water surface, which draws on top
    scene.add(this.points);
  }

  emit(x, y, z) {
    if (this.items.length >= this.max) return;
    this.items.push({
      x, y, z, x0: x, z0: z,
      size: THREE.MathUtils.randFloat(0.022, 0.045),
      speed: THREE.MathUtils.randFloat(0.18, 0.3),
      phase: Math.random() * 10,
    });
  }

  update(dt, t, camera, renderer) {
    // pixels per world unit at distance 1 -> bubbles keep their world size on any screen
    this.uniforms.uScale.value = (renderer.domElement.height) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const alive = [];
    for (const b of this.items) {
      b.y += b.speed * dt;
      b.x = b.x0 + Math.sin(t * 6 + b.phase) * 0.012;
      b.z = b.z0 + Math.cos(t * 5 + b.phase) * 0.012;
      if (b.y >= WATER_Y - 0.01) { this.onPop?.(b.x, b.z, 0.35); continue; }   // pop!
      alive.push(b);
    }
    this.items = alive;
    for (let i = 0; i < this.max; i++) {
      const b = this.items[i];
      if (b) { this.pos.set([b.x, b.y, b.z], i * 3); this.size[i] = b.size; }
      else { this.size[i] = 0; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}
