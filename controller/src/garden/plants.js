import * as THREE from 'three';
import { gradientMap } from './toon.js';

// Flower colours: each new seed picks the next one, so the LED can match it
export const BLOOMS = ['#ff5fa2', '#ffcc1f', '#9b5cff', '#ff4436', '#ffffff', '#3fc7ff', '#ff7a1f', '#c6ff3a'];

const ease = (x) => 1 - Math.pow(1 - THREE.MathUtils.clamp(x, 0, 1), 3);
const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

class Plant {
  constructor(garden, spot, color, grown) {
    const g = garden;
    this.garden = g;
    this.color = new THREE.Color(color);
    const lum = 0.2126 * this.color.r + 0.7152 * this.color.g + 0.0722 * this.color.b;
    this.glowScale = THREE.MathUtils.lerp(1, 0.25, THREE.MathUtils.smoothstep(lum, 0.5, 1));
    this.root = new THREE.Group();
    this.root.position.copy(spot);
    // root = lean away from the viewer (world space); body = random yaw (local)
    this.body = new THREE.Group();
    this.body.rotation.y = Math.random() * Math.PI * 2;
    this.root.add(this.body);
    this.shy = THREE.MathUtils.randFloat(0.7, 1.0);          // how strongly it recoils
    this.lag = THREE.MathUtils.randFloat(3, 6);             // how fast it reacts
    this.phase = Math.random() * 10;
    this.growth = grown ? 1 : 0;
    this.growTime = THREE.MathUtils.randFloat(4, 6);
    this.recoil = 0;
    this.open = grown ? 1 : 0;

    // ---- stem: tube along a gentle S-curve; revealed bottom-up while growing ----
    const h = THREE.MathUtils.randFloat(0.6, 1.15);
    const lean = new THREE.Vector2(THREE.MathUtils.randFloatSpread(0.12), THREE.MathUtils.randFloatSpread(0.12));
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean.x * 0.4 - lean.y * 0.3, h * 0.35, lean.y * 0.4),
      new THREE.Vector3(lean.x * 0.8 + lean.y * 0.2, h * 0.7, lean.y * 0.8 - lean.x * 0.2),
      new THREE.Vector3(lean.x, h, lean.y),
    ]);
    this.tubular = 24; this.radial = 5;
    const stemGeo = new THREE.TubeGeometry(this.curve, this.tubular, 0.016, this.radial, false);
    this.stem = new THREE.Mesh(stemGeo, g.stemMat);
    this.stem.castShadow = true;
    this.body.add(this.stem);

    // ---- leaves: golden-angle spiral up the stem ----
    this.leaves = [];
    const n = THREE.MathUtils.randInt(4, 6);
    for (let i = 0; i < n; i++) {
      const t = 0.12 + (i / n) * 0.6;
      const pivot = new THREE.Group();
      pivot.position.copy(this.curve.getPoint(t));
      pivot.rotation.y = i * 2.39996 + Math.random() * 0.3;
      const leaf = new THREE.Mesh(g.leafGeo, g.leafMat);
      leaf.castShadow = true;
      const size = THREE.MathUtils.randFloat(0.2, 0.3) * (1.1 - t * 0.5);
      leaf.userData = { t, size, pitch: THREE.MathUtils.randFloat(0.25, 0.55) };
      pivot.add(leaf);
      this.body.add(pivot);
      this.leaves.push(leaf);
    }

    // ---- flower: radial petals around a glowing centre ----
    this.flower = new THREE.Group();
    this.flower.position.copy(this.curve.getPoint(1));
    this.petalMat = new THREE.MeshToonMaterial({
      color: this.color, emissive: this.color, emissiveIntensity: 0.1,
      gradientMap, side: THREE.DoubleSide,
    });
    this.petals = [];
    const k = THREE.MathUtils.randInt(5, 8);
    const petalSize = THREE.MathUtils.randFloat(0.15, 0.22);
    for (let j = 0; j < k; j++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (j / k) * Math.PI * 2;
      const p = new THREE.Mesh(g.petalGeo, this.petalMat);
      p.scale.setScalar(petalSize);
      p.castShadow = true;
      pivot.add(p);
      this.flower.add(pivot);
      this.petals.push(p);
    }
    this.centre = new THREE.Mesh(g.centreGeo, g.centreMat);
    this.flower.add(this.centre);
    this.body.add(this.flower);
    g.scene.add(this.root);
    this.apply(0);
  }

  apply(t) {
    const gr = ease(this.growth);
    this.stem.geometry.setDrawRange(0, Math.ceil(gr * this.tubular) * this.radial * 6);
    for (const leaf of this.leaves) {
      const { t: lt, size, pitch } = leaf.userData;
      leaf.scale.setScalar(size * ease(smooth(this.growth, lt * 0.8, lt * 0.8 + 0.25)));
      // leaves fold up against the stem when the plant recoils
      leaf.rotation.z = pitch + this.recoil * 0.95 + Math.sin(t * 2 + this.phase + lt * 4) * 0.04;
    }
    const bloom = ease(smooth(this.growth, 0.82, 1.0));
    this.flower.scale.setScalar(Math.max(bloom, 1e-4));
    // petals: closed ~ pointing up, open ~ flat
    const openAngle = THREE.MathUtils.lerp(1.35, 0.12, this.open);
    for (const p of this.petals) p.rotation.z = openAngle;
  }

  update(dt, t, day, near) {
    if (this.growth < 1) this.growth = Math.min(1, this.growth + dt / this.growTime);
    this.recoil += (near * this.shy - this.recoil) * (1 - Math.exp(-dt * this.lag));
    const targetOpen = Math.pow(day, 0.8) * (1 - this.recoil * 0.85);
    this.open += (targetOpen - this.open) * (1 - Math.exp(-dt * 1.8));
    // shy: the whole plant leans away from the viewer (who stands at +z)
    this.root.rotation.x = -this.recoil * 0.5 * this.shy;
    this.root.rotation.z = Math.sin(t * 1.2 + this.phase) * 0.035 * (1 - this.recoil);
    // flowers "drink" light: they glow brighter the more open they are in daylight
    // pale petals are already bright: give them less self-glow so they don't blow out to white
    this.petalMat.emissiveIntensity = (0.06 + this.open * day * 0.45) * this.glowScale;
    this.apply(t);
  }

  /** World position of the stem tip as it currently is (follows growth). */
  tipWorld(out = new THREE.Vector3()) {
    const g = Math.max(0.15, 1 - Math.pow(1 - this.growth, 3));
    return this.body.localToWorld(out.copy(this.curve.getPoint(g)));
  }

  dispose() {
    this.garden.scene.remove(this.root);
    this.stem.geometry.dispose();
    this.petalMat.dispose();
  }
}

export class Garden {
  constructor(scene, { leafGeo, petalGeo }, spots) {
    this.scene = scene;
    this.spots = spots;                 // Vector3[] from the baked scene
    this.leafGeo = leafGeo;
    this.petalGeo = petalGeo;
    this.stemMat = new THREE.MeshToonMaterial({ color: '#3f9a2a', gradientMap });
    this.leafMat = new THREE.MeshToonMaterial({ color: '#4cc23a', gradientMap, side: THREE.DoubleSide });
    this.centreGeo = new THREE.IcosahedronGeometry(0.035, 1);
    this.centreMat = new THREE.MeshToonMaterial({ color: '#ffd23f', emissive: '#ffae1f', emissiveIntensity: 0.6, gradientMap });
    this.plants = new Map();            // spot index -> Plant
    this.order = [];                    // planting order, oldest first
    this.colorIndex = 0;
  }

  plantAt(i, grown = false) {
    if (this.plants.has(i)) this.remove(i);
    const color = BLOOMS[this.colorIndex++ % BLOOMS.length];
    const plant = new Plant(this, this.spots[i], color, grown);
    plant.hex = color;
    this.plants.set(i, plant);
    this.order.push(i);
    return plant;
  }

  remove(i) {
    this.plants.get(i)?.dispose();
    this.plants.delete(i);
    this.order = this.order.filter((j) => j !== i);
  }

  /** Button press: plant in a free spot (or replace the oldest plant). Returns the new Plant. */
  sow() {
    const free = this.spots.map((_, i) => i).filter((i) => !this.plants.has(i));
    const i = free.length ? free[Math.floor(Math.random() * free.length)] : this.order[0];
    return this.plantAt(i, false);
  }

  update(dt, t, day, near) {
    for (const p of this.plants.values()) p.update(dt, t, day, near);
  }
}
