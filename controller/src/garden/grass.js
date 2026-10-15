import * as THREE from 'three';
import { pondSD } from './terrain.js';
import { gradientMap } from './toon.js';

// ─────────────── tiny value noise: groups ground cover into natural patches ───────────────
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + vnoise(x * 4.3 + 9.1, y * 4.3 + 7.7) * 0.1;

// ─────────────── blade texture: midrib, veins, darker edges, speckle ───────────────
function bladeTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, '#5e6b52'); grad.addColorStop(0.5, '#d9e6c8'); grad.addColorStop(1, '#f3f7e6');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
  const edge = g.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(20,40,10,0.55)'); edge.addColorStop(0.22, 'rgba(20,40,10,0)');
  edge.addColorStop(0.78, 'rgba(20,40,10,0)'); edge.addColorStop(1, 'rgba(20,40,10,0.55)');
  g.fillStyle = edge; g.fillRect(0, 0, 64, 256);
  g.strokeStyle = 'rgba(255,255,230,0.55)'; g.lineWidth = 3;                // midrib
  g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 0); g.stroke();
  g.strokeStyle = 'rgba(30,60,20,0.25)'; g.lineWidth = 1;                    // parallel veins
  for (const x of [14, 22, 42, 50]) { g.beginPath(); g.moveTo(x, 256); g.lineTo(32 + (x - 32) * 0.3, 0); g.stroke(); }
  for (let i = 0; i < 400; i++) {                                           // speckle
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,220' : '20,40,10'},${Math.random() * 0.15})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ─────────────── geometry builders (all start at y=0, grow up +y) ───────────────
function blade(w, h, bend, rotY, segs = 4) {
  const g = new THREE.PlaneGeometry(w, h, 1, segs);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h;
    p.setX(i, p.getX(i) * (1 - y * 0.92));                 // taper
    p.setZ(i, p.getZ(i) + bend * y * y * h);               // natural curve
  }
  g.rotateY(rotY);
  return g;
}
function merge(geos) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const gi = g;
    pos.push(...gi.attributes.position.array); nor.push(...gi.attributes.normal.array);
    uv.push(...(gi.attributes.uv ? gi.attributes.uv.array : new Float32Array(gi.attributes.position.count * 2)));
    if (gi.index) idx.push(...Array.from(gi.index.array, (i) => i + off));
    else for (let i = 0; i < gi.attributes.position.count; i++) idx.push(i + off);
    off += gi.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
function gradientColors(geo, root, tip, height) {
  const p = geo.attributes.position, cols = [], c = new THREE.Color();
  const a = new THREE.Color(root), b = new THREE.Color(tip);
  for (let i = 0; i < p.count; i++) { c.copy(a).lerp(b, THREE.MathUtils.clamp(p.getY(i) / height, 0, 1)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return geo;
}

/** Shared wind + "bow away from the hand" shader for every ground-cover layer. */
function windMaterial(uniforms, { height, sway, bow, map, flat = false }) {
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true, side: THREE.DoubleSide, map: map || null, gradientMap,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uBow, uGust;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float hh = clamp(position.y / ${height.toFixed(3)}, 0.0, 1.0);
        float k = ${flat ? '1.0' : 'hh * hh'};
        // layered wind: slow swell + gust front rolling across the garden + flutter
        float swell = sin(uTime * 1.3 + base.x * 0.9 + base.z * 0.6);
        float gust = smoothstep(0.6, 1.0, sin(uTime * 0.45 - base.x * 0.35 + base.z * 0.2)) * uGust;
        float flutter = sin(uTime * 5.0 + base.x * 7.0 + base.z * 5.0) * 0.25;
        // displacement is decided in WORLD space (wind blows +x, the hand pushes toward -z),
        // then mapped back into this instance's rotated/scaled local space
        vec3 worldPush = vec3((swell * 0.5 + gust * 1.4 + flutter) * ${sway.toFixed(3)}, 0.0, -uBow * ${bow.toFixed(3)}) * k;
        mat3 gIM = mat3(instanceMatrix);
        transformed += transpose(gIM) * worldPush / dot(gIM[0], gIM[0]);
        transformed.y *= 1.0 - uBow * 0.3 * hh;`);
  };
  return mat;
}

/**
 * Four ground-cover layers, each scattered with its own noise mask so they
 * form patches instead of a uniform carpet:
 *   lawn (textured blades) · tall wild grass · clover · tiny wildflowers
 */
export class Grass {
  constructor(scene, ground, stones) {
    this.uniforms = { uTime: { value: 0 }, uBow: { value: 0 }, uGust: { value: 1 } };
    const tex = bladeTexture();
    const blocked = (x, z, min) => {
      if (pondSD(x, z) < min) return true;
      return stones && stones.topAt(x, z) > ground.heightAt(x, z) + 0.015;   // under a rock
    };
    const layers = [
      {
        name: 'lawn', count: 7000, radius: 5.75, pond: 0.3,
        density: (x, z) => 0.55 + 0.45 * fbm(x * 0.5, z * 0.5),
        geo: gradientColors(merge([blade(0.035, 0.2, 0.15, 0), blade(0.03, 0.17, -0.2, 1.1), blade(0.03, 0.18, 0.1, 2.2)]), '#1f6a14', '#b4f04a', 0.2),
        mat: { height: 0.2, sway: 0.05, bow: 0.13, map: tex },
        scale: [0.6, 1.4], tint: () => [0.22 + Math.random() * 0.07, 0.3, 0.72 + Math.random() * 0.25],
      },
      {
        name: 'tall', count: 1300, radius: 5.85, pond: 0.25,
        // tall grass gathers at the rim of the diorama, around boulders and along the pond edge
        density: (x, z) => {
          const rim = THREE.MathUtils.smoothstep(Math.hypot(x, z), 4.2, 5.6);
          const shore = Math.exp(-((pondSD(x, z) - 0.45) ** 2) / 0.05);
          return Math.max(rim, shore * 0.8) * (0.5 + fbm(x * 0.8 + 3, z * 0.8)) ;
        },
        geo: gradientColors(merge([blade(0.03, 0.55, 0.35, 0), blade(0.028, 0.48, -0.4, 1.0), blade(0.03, 0.5, 0.3, 2.1), blade(0.026, 0.42, -0.25, 2.8)]), '#3f7a17', '#ffe27a', 0.55),
        mat: { height: 0.55, sway: 0.09, bow: 0.25, map: tex },
        scale: [0.7, 1.25], tint: () => [0.13 + Math.random() * 0.08, 0.35, 0.75 + Math.random() * 0.2],
      },
      {
        name: 'clover', count: 2600, radius: 5.5, pond: 0.4,
        density: (x, z) => THREE.MathUtils.smoothstep(fbm(x * 0.7 + 11, z * 0.7 + 4), 0.52, 0.66),
        geo: (() => {
          const leaves = [];
          for (let i = 0; i < 3; i++) {
            const leaf = new THREE.CircleGeometry(0.028, 8);
            leaf.scale(1, 0.8, 1);
            leaf.translate(0.028, 0, 0);
            leaf.rotateX(-Math.PI / 2 + 0.25);
            leaf.rotateY((i / 3) * Math.PI * 2);
            leaf.translate(0, 0.035, 0);
            leaves.push(leaf);
          }
          const stem = new THREE.PlaneGeometry(0.006, 0.035, 1, 1); stem.translate(0, 0.0175, 0);
          leaves.push(stem);
          return gradientColors(merge(leaves), '#1f6a1c', '#4fc23a', 0.04);
        })(),
        mat: { height: 0.04, sway: 0.01, bow: 0.02, flat: true },
        scale: [0.8, 1.5], tint: () => [0.28 + Math.random() * 0.04, 0.4, 0.75 + Math.random() * 0.2],
      },
      {
        name: 'wildflowers', count: 700, radius: 5.5, pond: 0.5,
        density: (x, z) => THREE.MathUtils.smoothstep(fbm(x * 0.9 + 21, z * 0.9 + 13), 0.5, 0.7),
        geo: (() => {
          const stem = new THREE.PlaneGeometry(0.006, 0.14, 1, 2); stem.translate(0, 0.07, 0);
          const stem2 = stem.clone().rotateY(Math.PI / 2);
          const head = new THREE.IcosahedronGeometry(0.016, 0); head.scale(1, 0.55, 1); head.translate(0, 0.145, 0);
          const g = merge([stem, stem2, head]);
          // stems green, heads white (instance colour tints the head)
          const p = g.attributes.position, cols = [];
          for (let i = 0; i < p.count; i++) {
            const isHead = p.getY(i) > 0.135;
            cols.push(...(isHead ? [1, 1, 1] : [0.2, 0.42, 0.16]));
          }
          g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
          return g;
        })(),
        mat: { height: 0.15, sway: 0.04, bow: 0.1 },
        scale: [0.8, 1.3],
        tint: () => [[0.14, 0.95, 0.65], [0.0, 0.0, 1.0], [0.75, 0.6, 0.78], [0.58, 0.6, 0.75]][Math.floor(Math.random() * 4)],
      },
    ];

    this.meshes = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const tint = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    for (const L of layers) {
      const mesh = new THREE.InstancedMesh(L.geo, windMaterial(this.uniforms, L.mat), L.count);
      mesh.receiveShadow = true;
      let placed = 0, tries = 0;
      while (placed < L.count && tries < L.count * 12) {
        tries++;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * L.radius;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.random() > L.density(x, z)) continue;     // noise mask -> patches
        if (blocked(x, z, L.pond)) continue;
        p.set(x, ground.heightAt(x, z) - 0.01, z);
        q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
        const k = THREE.MathUtils.randFloat(L.scale[0], L.scale[1]);
        s.set(k, k * THREE.MathUtils.randFloat(0.8, 1.2), k);
        m.compose(p, q, s);
        mesh.setMatrixAt(placed, m);
        const [h, sat, l] = L.tint();
        mesh.setColorAt(placed, tint.setHSL(h, sat, l));
        placed++;
      }
      mesh.count = placed;
      mesh.name = L.name;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }
  update(t, near) {
    this.uniforms.uTime.value = t;
    this.uniforms.uBow.value = near;
  }
}
