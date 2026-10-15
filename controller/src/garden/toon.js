import * as THREE from 'three';

/** 4-band light ramp: the "cel" look. Nearest filtering keeps the bands crisp. */
export const gradientMap = (() => {
  const tones = new Uint8Array([70, 140, 205, 255]);
  const t = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

/** Toon version of a (glTF) standard material, keeping its textures. */
export function toToon(src, tint) {
  const m = new THREE.MeshToonMaterial({
    color: src.color ? src.color.clone() : new THREE.Color('#ffffff'),
    map: src.map || null,
    aoMap: src.aoMap || null,
    aoMapIntensity: 1.0,
    gradientMap,
    side: src.side,
  });
  if (tint) m.color.multiply(new THREE.Color(tint));
  m.name = src.name;
  return m;
}

/**
 * Ink outline via the inverted-hull trick: a slightly inflated back-face copy
 * of the mesh, drawn in a flat dark colour, peeks out around the silhouette.
 */
export function addOutline(mesh, thickness, color = '#1b2416') {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uThickness: { value: thickness } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 p = position + normalize(normal) * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
  const hull = new THREE.Mesh(mesh.geometry, mat);
  hull.name = mesh.name + '_outline';
  hull.renderOrder = -0.5;
  mesh.add(hull);
  return mat;
}

/** Post pass in display space: saturation + a touch of contrast for the cartoon punch. */
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSaturation: { value: 1.35 }, uContrast: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSaturation, uContrast; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
