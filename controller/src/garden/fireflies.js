import * as THREE from 'three';

/** Night-only fireflies: additive glowing points that drift and blink. */
export class Fireflies {
  constructor(scene, count = 80) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 5.2;
      pos.set([Math.cos(a) * r, THREE.MathUtils.randFloat(0.25, 1.6), Math.sin(a) * r], i * 3);
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uScale; attribute float aSeed; varying float vBlink;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.4 + aSeed) * 0.35;
          p.y += sin(uTime * 0.7 + aSeed * 1.7) * 0.15;
          p.z += cos(uTime * 0.35 + aSeed * 2.3) * 0.35;
          vBlink = pow(0.5 + 0.5 * sin(uTime * 2.2 + aSeed * 5.0), 3.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uScale * 70.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vBlink;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float glow = smoothstep(0.5, 0.0, d);
          glow = glow * glow;
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * 2.5 * glow, glow * vBlink * uOpacity);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(t, night, pixelRatio) {
    this.uniforms.uTime.value = t;
    this.uniforms.uOpacity.value = night;
    this.uniforms.uScale.value = pixelRatio;
  }
}
