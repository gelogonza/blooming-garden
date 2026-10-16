import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, vnoise } from './noise.js';

/**
 * Gnarled dead trees built from curved tubes:
 *   - every limb is a TubeGeometry along a jittered spline (no straight cylinders)
 *   - 4 levels of branching down to thin twigs
 *   - flared root buttresses at the base
 *   - bark bumps pushed along the normals, vertex colour darkens toward the roots + moss
 */
const UP = new THREE.Vector3(0, 1, 0);

function limb(rng, from, dir, len, r0, r1, wiggle, radial, seg) {
  // curved centre line: each knot drifts sideways a little
  const pts = [from.clone()];
  const side = new THREE.Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  side.normalize();
  const side2 = new THREE.Vector3().crossVectors(dir, side).normalize();
  let p = from.clone();
  const knots = 4;
  for (let i = 1; i <= knots; i++) {
    p = p.clone().addScaledVector(dir, len / knots)
      .addScaledVector(side, (rng() - 0.5) * wiggle * len)
      .addScaledVector(side2, (rng() - 0.5) * wiggle * len);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  // taper radius along the length (tube was built at radius 1 around the curve)
  const pos = g.attributes.position, uv = g.attributes.uv;
  const frames = curve.computeFrenetFrames(seg, false);
  const c = new THREE.Vector3(), off = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, c);
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.8));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      off.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c);
      // bark bumps: noise along the length and around
      const bump = 1 + (vnoise(t * len * 3.1 + from.x * 7, j * 0.9 + from.z) - 0.5) * 0.35;
      off.multiplyScalar(r * bump);
      pos.setXYZ(k, c.x + off.x, c.y + off.y, c.z + off.z);
      uv.setXY(k, j / radial, t * len * 0.6);              // bark repeats along the limb
    }
  }
  g.computeVertexNormals();
  return { geo: g.toNonIndexed ? g : g, curve };
}

export function gnarledTree(seed, { pale = false, maxDepth = 4 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];
  const H = pale ? 9 + rng() * 5 : 7 + rng() * 4;
  const R = pale ? 0.16 + rng() * 0.06 : 0.26 + rng() * 0.12;

  const grow = (from, dir, len, r, depth) => {
    const radial = [10, 7, 5, 4, 3][depth], seg = [14, 8, 6, 4, 3][depth];
    const { geo, curve } = limb(rng, from, dir, len, r, r * (depth === 0 ? 0.45 : 0.25), pale ? 0.05 : 0.14 + depth * 0.04, radial, seg);
    parts.push(geo);
    if (depth >= maxDepth) return;
    const n = depth === 0 ? (pale ? 4 : 4 + Math.floor(rng() * 3)) : 2 + Math.floor(rng() * (depth < 2 ? 3 : 2));
    for (let i = 0; i < n; i++) {
      const t = depth === 0 ? 0.35 + rng() * 0.6 : 0.3 + rng() * 0.65;
      const at = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const az = rng() * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const tilt = pale ? 0.5 + rng() * 0.4 : 0.6 + rng() * 0.7;
      const nd = tan.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt));
      nd.y += pale ? 0.35 : depth === 0 ? 0.15 : -0.05;       // oaks reach out; pale trees reach up
      nd.normalize();
      const rr = THREE.MathUtils.lerp(r, r * (depth === 0 ? 0.45 : 0.25), Math.pow(t, 0.8)) * (0.55 + rng() * 0.2);
      grow(at, nd, len * (0.4 + rng() * 0.25), rr, depth + 1);
    }
  };
  const lean = new THREE.Vector3((rng() - 0.5) * 0.15, 1, (rng() - 0.5) * 0.15).normalize();
  grow(new THREE.Vector3(0, -0.2, 0), lean, H, R, 0);

  // root flare: 4-6 buttress roots diving into the ground
  const roots = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < roots; i++) {
    const az = (i / roots) * Math.PI * 2 + rng() * 0.6;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const start = new THREE.Vector3(0, 0.5 + rng() * 0.3, 0).addScaledVector(out, R * 0.4);
    const dir = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, -0.6, 0)).normalize();
    parts.push(limb(rng, start, dir, 1.0 + rng() * 0.7, R * 0.55, R * 0.08, 0.2, 6, 5).geo);
  }

  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  // vertex colour: dark wet base -> lighter weathered top, moss on the +x/+z side
  const pos = merged.attributes.position, nor = merged.attributes.normal, col = [];
  const base = new THREE.Color(pale ? '#8f8a82' : '#3a3129'), top = new THREE.Color(pale ? '#c9c4ba' : '#6a5e52'),
    moss = new THREE.Color('#3c4a26'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    c.copy(base).lerp(top, THREE.MathUtils.clamp(y / H, 0, 1));
    const mossy = Math.max(0, nor.getX(i) * 0.6 + nor.getZ(i) * 0.4) * (1 - THREE.MathUtils.clamp(y / 3, 0, 1));
    c.lerp(moss, mossy * (pale ? 0.3 : 0.7));
    if (pale) {                                                   // birch-like dark scars
      const scar = vnoise(y * 4 + i * 0.0001, pos.getX(i) * 6) > 0.72 ? 0.35 : 1;
      c.multiplyScalar(scar);
    }
    col.push(c.r, c.g, c.b);
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return merged;
}

/** A fallen, hollow log lying across the leaf litter. */
export function fallenLog(seed) {
  const rng = mulberry32(seed);
  const len = 3 + rng() * 2.5, r = 0.25 + rng() * 0.12;
  const { geo } = limb(rng, new THREE.Vector3(-len / 2, r * 0.8, 0), new THREE.Vector3(1, 0.03, 0).normalize(), len, r, r * 0.8, 0.06, 12, 10);
  const stub = limb(rng, new THREE.Vector3(len * 0.1, r * 1.2, 0), new THREE.Vector3(0.3, 0.8, 0.4).normalize(), 0.9, r * 0.35, r * 0.1, 0.2, 6, 4).geo;
  const merged = mergeGeometries([geo.toNonIndexed(), stub.toNonIndexed()]);
  const col = [], c = new THREE.Color();
  for (let i = 0; i < merged.attributes.position.count; i++) { c.set('#4a3c30').lerp(new THREE.Color('#3c4a26'), rng() * 0.4); col.push(c.r, c.g, c.b); }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return merged;
}

/** Bark: colour detail + a matching normal map derived from a height field (furrows + plates). */
export function barkMaps() {
  const W = 256, Hh = 512;
  const hcv = document.createElement('canvas'); hcv.width = W; hcv.height = Hh;
  const g = hcv.getContext('2d');
  const img = g.createImageData(W, Hh);
  const hgt = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    // vertical furrows broken into plates, plus fine grain
    const u = x / W, v = y / Hh;
    const furrow = Math.abs(Math.sin((u * 9 + vnoise(u * 6, v * 3) * 1.6) * Math.PI));
    const plate = vnoise(u * 9, v * 18);
    const grain = vnoise(u * 60, v * 12);
    const h = Math.pow(furrow, 0.6) * 0.65 + plate * 0.25 + grain * 0.1;
    hgt[y * W + x] = h;
  }
  const ncv = document.createElement('canvas'); ncv.width = W; ncv.height = Hh;
  const ng = ncv.getContext('2d'), nimg = ng.createImageData(W, Hh);
  const at = (x, y) => hgt[((y + Hh) % Hh) * W + ((x + W) % W)];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, h = at(x, y);
    const v = 70 + h * 150;
    img.data[i] = v; img.data[i + 1] = v * 0.94; img.data[i + 2] = v * 0.86; img.data[i + 3] = 255;
    const dx = (at(x + 1, y) - at(x - 1, y)) * 3.5, dy = (at(x, y + 1) - at(x, y - 1)) * 3.5;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    nimg.data[i] = (n.x * 0.5 + 0.5) * 255; nimg.data[i + 1] = (n.y * 0.5 + 0.5) * 255; nimg.data[i + 2] = (n.z * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); ng.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(hcv); map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(ncv);
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normalMap };
}
