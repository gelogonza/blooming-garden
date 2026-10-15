import * as THREE from 'three';

// Pond shape: mirrors blender/terrain.py so code and baked mesh agree.
// Blender (x, y) maps to three.js (x, -z).
const C1 = { x: -0.6, z: -0.3 }, R1 = 1.55;
const C2 = { x: 1.05, z: 0.45 }, R2 = 1.1;

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Signed distance to the pond edge: negative = inside the water. */
export function pondSD(x, z) {
  return smin(Math.hypot(x - C1.x, z - C1.z) - R1, Math.hypot(x - C2.x, z - C2.z) - R2, 0.7);
}

/** Direction pointing away from the pond centre (towards the shore). */
export function pondGrad(x, z, out = new THREE.Vector2()) {
  const e = 0.01;
  return out.set(pondSD(x + e, z) - pondSD(x - e, z), pondSD(x, z + e) - pondSD(x, z - e)).normalize();
}

export const WATER_Y = -0.05;

/** GLSL copy of pondSD for the water shader. */
export const POND_GLSL = /* glsl */ `
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float pondSD(vec2 p) {
  return smin(length(p - vec2(${C1.x}, ${C1.z})) - ${R1}, length(p - vec2(${C2.x}, ${C2.z})) - ${R2}, 0.7);
}`;

/**
 * Fast ground-height lookup from the baked mesh: triangles are bucketed into a
 * 2D grid, so a query only tests the handful of triangles under the point.
 */
export class HeightField {
  constructor(mesh, res = 96, size = 12.4) {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    this.res = res;
    this.size = size;
    this.v = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      this.v[i * 3] = p.x; this.v[i * 3 + 1] = p.y; this.v[i * 3 + 2] = p.z;
    }
    this.tris = index ? index.array : Uint32Array.from({ length: pos.count }, (_, i) => i);
    this.cells = Array.from({ length: res * res }, () => []);
    const v = this.v;
    for (let t = 0; t < this.tris.length; t += 3) {
      const a = this.tris[t] * 3, b = this.tris[t + 1] * 3, c = this.tris[t + 2] * 3;
      const x0 = this.cell(Math.min(v[a], v[b], v[c])), x1 = this.cell(Math.max(v[a], v[b], v[c]));
      const z0 = this.cell(Math.min(v[a + 2], v[b + 2], v[c + 2])), z1 = this.cell(Math.max(v[a + 2], v[b + 2], v[c + 2]));
      for (let r = z0; r <= z1; r++) for (let q = x0; q <= x1; q++) this.cells[r * res + q].push(t);
    }
  }
  cell(x) {
    return Math.min(this.res - 1, Math.max(0, Math.floor((x / this.size + 0.5) * this.res)));
  }
  heightAt(x, z) {
    const list = this.cells[this.cell(z) * this.res + this.cell(x)];
    const v = this.v;
    let best = -Infinity;
    for (const t of list) {
      const a = this.tris[t] * 3, b = this.tris[t + 1] * 3, c = this.tris[t + 2] * 3;
      const ax = v[a], az = v[a + 2], bx = v[b], bz = v[b + 2], cx = v[c], cz = v[c + 2];
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-10) continue;            // vertical skirt triangles
      const w1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
      const w2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
      const w3 = 1 - w1 - w2;
      if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
      best = Math.max(best, w1 * v[a + 1] + w2 * v[b + 1] + w3 * v[c + 1]);
    }
    return best === -Infinity ? 0 : best;
  }
  /** Like heightAt, but -Infinity when no surface covers the point (used for "is there a rock here?"). */
  topAt(x, z) {
    const h = this.heightAt(x, z);
    return h === 0 && !this.covers(x, z) ? -Infinity : h;
  }
  covers(x, z) {
    const list = this.cells[this.cell(z) * this.res + this.cell(x)];
    const v = this.v;
    for (const t of list) {
      const a = this.tris[t] * 3, b = this.tris[t + 1] * 3, c = this.tris[t + 2] * 3;
      const den = (v[b + 2] - v[c + 2]) * (v[a] - v[c]) + (v[c] - v[b]) * (v[a + 2] - v[c + 2]);
      if (Math.abs(den) < 1e-10) continue;
      const w1 = ((v[b + 2] - v[c + 2]) * (x - v[c]) + (v[c] - v[b]) * (z - v[c + 2])) / den;
      const w2 = ((v[c + 2] - v[a + 2]) * (x - v[c]) + (v[a] - v[c]) * (z - v[c + 2])) / den;
      if (w1 >= 0 && w2 >= 0 && 1 - w1 - w2 >= 0) return true;
    }
    return false;
  }
}
