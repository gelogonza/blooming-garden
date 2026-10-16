import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, fbm, smooth } from './noise.js';
import { gnarledTree, fallenLog, barkMaps } from './trees.js';

// ─────────────────────────── layout ───────────────────────────
// The walk: from the road (z = 0) through the woods to the house (z ≈ -138).
const PATH = [
  [0, 4], [0, 0], [2, -14], [-3, -30], [-6, -46], [-1, -62], [5, -78], [3, -94], [-1, -106], [2, -118], [5, -127], [5, -131],
];
export const HOUSE = new THREE.Vector3(5, 0, -139);       // house centre (front faces +z)
export const GRAVEYARD = { x: -7.5, z: -112, w: 7, d: 10 };

const tmpV = new THREE.Vector3();

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.path = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.pathLen = this.path.getLength();
    // dense samples ordered along the path (z is monotonic, so a window search is cheap)
    this.samples = this.path.getSpacedPoints(800);
    this.sampleBase = this.samples.map((p) => this.baseHeight(p.x, p.z));
    for (const [i, p] of this.samples.entries()) p.y = this.sampleBase[i];

    this.buildTerrain();
    this.buildTrees();
    this.buildClutter();
    this.buildPumpkins();
    this.buildGraveyard();
    this.buildHouse();
    this.buildScarecrow();
  }

  // ─────────────────────────── terrain ───────────────────────────
  baseHeight(x, z) {
    return (fbm(x * 0.045 + 3, z * 0.045) - 0.5) * 4.2 + (fbm(x * 0.21, z * 0.21) - 0.5) * 0.5;
  }
  /** nearest path sample: distance (m), index, and the path's own height there */
  nearestPath(x, z) {
    const S = this.samples;
    let lo = 0, hi = S.length - 1;                // samples go from z=+4 down to -131
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].z > z) lo = m; else hi = m; }
    let best = Infinity, bi = 0;
    for (let i = Math.max(0, lo - 60); i < Math.min(S.length, lo + 60); i++) {
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return { d: Math.sqrt(best), i: bi };
  }
  height(x, z) {
    const base = this.baseHeight(x, z);
    const { d, i } = this.nearestPath(x, z);
    let h = THREE.MathUtils.lerp(this.sampleBase[i] - 0.06, base, smooth(d, 1.4, 3.6));   // carve the trail
    const dh = Math.hypot(x - HOUSE.x, z - HOUSE.z);
    const houseBase = this.baseHeight(HOUSE.x, HOUSE.z + 6);
    h = THREE.MathUtils.lerp(houseBase, h, smooth(dh, 9, 16));                           // flat yard
    return h;
  }

  buildTerrain() {
    const W = 84, L = 190;
    const geo = new THREE.PlaneGeometry(W, L, 168, 380);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -L / 2 + 22);
    const pos = geo.attributes.position, col = [];
    const dirt = new THREE.Color('#4a3a2c'), litterA = new THREE.Color('#3a2a1a'), litterB = new THREE.Color('#5a3416'),
      moss = new THREE.Color('#25301a'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setY(i, h);
      const { d } = this.nearestPath(x, z);
      const n = fbm(x * 0.3, z * 0.3), n2 = fbm(x * 1.7 + 4, z * 1.7);
      c.copy(litterA).lerp(litterB, smooth(n2, 0.45, 0.75)).lerp(moss, smooth(n, 0.6, 0.8) * 0.6);
      c.lerp(dirt, 1 - smooth(d, 0.8, 2.2));                       // trodden trail
      c.multiplyScalar(0.85 + n * 0.3);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: litterTexture() });
    mat.map.repeat.set(26, 60);
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  // ─────────────────────────── dead trees ───────────────────────────
  buildTrees() {
    // near the trail: full detail down to twigs; deeper in the woods: lighter versions (fog hides the rest)
    const near = [0, 1, 2, 3].map((k) => gnarledTree(1000 + k * 77)).concat([4, 5].map((k) => gnarledTree(2000 + k * 31, { pale: true })));
    const far = [0, 1, 2].map((k) => gnarledTree(3000 + k * 53, { maxDepth: 2 })).concat([gnarledTree(4000, { pale: true, maxDepth: 2 })]);
    const { map, normalMap } = barkMaps();
    map.repeat.set(2, 1); normalMap.repeat.set(2, 1);
    const bark = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 1 });
    const rng = mulberry32(42);
    const spots = [];
    const cell = 2.6;
    for (let x = -40; x <= 40; x += cell) {
      for (let z = 18; z >= -168; z -= cell) {
        const px = x + (rng() - 0.5) * cell * 0.9, pz = z + (rng() - 0.5) * cell * 0.9;
        const { d, i } = this.nearestPath(px, pz);
        if (d < 2.6 + rng() * 1.5) continue;                                   // keep the trail open
        if (Math.hypot(px - HOUSE.x, pz - HOUSE.z) < 15) continue;             // house yard
        if (Math.abs(px - GRAVEYARD.x) < GRAVEYARD.w / 2 + 1.5 && Math.abs(pz - GRAVEYARD.z) < GRAVEYARD.d / 2 + 1.5) continue;
        if (rng() > (d < 12 ? 0.5 : 0.3)) continue;
        spots.push({ x: px, z: pz, d, s: i / (this.samples.length - 1) });
      }
    }
    this.hideTrees = spots.filter((t) => t.d < 9);
    this.treeCount = spots.length;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
    const place = (list, variants, shadows) => variants.forEach((geo, k) => {
      const mine = list.filter((_, j) => j % variants.length === k);
      if (!mine.length) return;
      const inst = new THREE.InstancedMesh(geo, bark, mine.length);
      mine.forEach((t, j) => {
        const s = 0.8 + rng() * 0.5;
        e.set((rng() - 0.5) * 0.1, rng() * Math.PI * 2, (rng() - 0.5) * 0.1);
        q.setFromEuler(e);
        m.compose(tmpV.set(t.x, this.height(t.x, t.z) - 0.05, t.z), q, sc.set(s, s * (0.9 + rng() * 0.3), s));
        inst.setMatrixAt(j, m);
      });
      inst.castShadow = shadows;
      inst.receiveShadow = true;
      this.scene.add(inst);
    });
    place(spots.filter((t) => t.d < 14), near, true);
    place(spots.filter((t) => t.d >= 14), far, false);

    // fallen logs beside the trail
    const logGeo = [0, 1, 2].map((k) => fallenLog(500 + k));
    const logMat = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap, roughness: 1 });
    for (let k = 0; k < 14; k++) {
      const s = 0.04 + rng() * 0.9, p = this.path.getPointAt(s), t = this.path.getTangentAt(s);
      const side = rng() < 0.5 ? -1 : 1, off = 3 + rng() * 4;
      const x = p.x - t.z * side * off, z = p.z + t.x * side * off;
      const log = new THREE.Mesh(logGeo[k % 3], logMat);
      log.position.set(x, this.height(x, z) - 0.12, z);
      log.rotation.set((rng() - 0.5) * 0.1, rng() * Math.PI, (rng() - 0.5) * 0.08);
      log.castShadow = log.receiveShadow = true;
      this.scene.add(log);
    }
  }

  // ─────────────────────────── leaves + dead grass ───────────────────────────
  buildClutter() {
    const rng = mulberry32(7);
    const leafGeo = new THREE.PlaneGeometry(0.13, 0.09);
    leafGeo.rotateX(-Math.PI / 2);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    const N = 9000, leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
    const palette = ['#7a2e10', '#9c4a14', '#5e3a16', '#b0601a', '#4a2412', '#8a6a2a'].map((h) => new THREE.Color(h));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const k = Math.floor(rng() * (this.samples.length - 1));
      const p = this.samples[k];
      const x = p.x + (rng() - 0.5) * 22, z = p.z + (rng() - 0.5) * 6;
      e.set((rng() - 0.5) * 0.5, rng() * 6.28, (rng() - 0.5) * 0.5);
      q.setFromEuler(e);
      const k2 = 0.7 + rng() * 0.9;
      m.compose(tmpV.set(x, this.height(x, z) + 0.015, z), q, s.set(k2, 1, k2));
      leaves.setMatrixAt(i, m);
      leaves.setColorAt(i, palette[Math.floor(rng() * palette.length)]);
    }
    leaves.receiveShadow = true;
    this.scene.add(leaves);

    // dead grass tufts along the trail edges
    const blade = (ry) => { const g = new THREE.PlaneGeometry(0.04, 0.45, 1, 3); g.translate(0, 0.22, 0); g.rotateY(ry); return g; };
    const tuft = mergeGeometries([blade(0), blade(1.05), blade(2.1)]);
    const grassMat = new THREE.MeshStandardMaterial({ color: '#6a5a3a', roughness: 1, side: THREE.DoubleSide });
    const G = 2200, grass = new THREE.InstancedMesh(tuft, grassMat, G);
    let placed = 0;
    for (let i = 0; i < G * 3 && placed < G; i++) {
      const k = Math.floor(rng() * (this.samples.length - 1));
      const p = this.samples[k];
      const x = p.x + (rng() - 0.5) * 9, z = p.z + (rng() - 0.5) * 4;
      if (this.nearestPath(x, z).d < 1.3) continue;
      e.set((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3); q.setFromEuler(e);
      const k2 = 0.6 + rng() * 0.8;
      m.compose(tmpV.set(x, this.height(x, z), z), q, s.set(k2, k2, k2));
      grass.setMatrixAt(placed, m);
      grass.setColorAt(placed, new THREE.Color().setHSL(0.09 + rng() * 0.04, 0.35, 0.25 + rng() * 0.2));
      placed++;
    }
    grass.count = placed;
    this.scene.add(grass);
  }

  // ─────────────────────────── jack-o'-lanterns ───────────────────────────
  buildPumpkins() {
    const rng = mulberry32(31);
    const body = pumpkinGeometry();
    const stem = new THREE.CylinderGeometry(0.025, 0.04, 0.12, 6);
    stem.translate(0, 0.25, 0); stem.rotateZ(0.2);
    const stemMat = new THREE.MeshStandardMaterial({ color: '#3b3a1a', roughness: 1 });
    const faces = [0, 1, 2, 3].map((k) => pumpkinFace(k));
    this.pumpkins = [];
    const n = 34;
    for (let k = 0; k < n; k++) {
      const s = 0.03 + (k / n) * 0.9 + (rng() - 0.5) * 0.01;
      const p = this.path.getPointAt(s);
      const t = this.path.getTangentAt(s);
      const side = k % 2 ? 1 : -1;
      const off = 1.5 + rng() * 0.7;
      const x = p.x + -t.z * side * off, z = p.z + t.x * side * off;
      const face = faces[Math.floor(rng() * faces.length)];
      const mat = new THREE.MeshStandardMaterial({
        map: face.map, emissiveMap: face.glow, emissive: new THREE.Color('#ff8a1f'), emissiveIntensity: 2.2, roughness: 0.7,
      });
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, mat); b.castShadow = true; b.receiveShadow = true;
      g.add(b, new THREE.Mesh(stem, stemMat));
      const sc = 0.8 + rng() * 0.7;
      g.scale.setScalar(sc);
      g.position.set(x, this.height(x, z) + 0.2 * sc, z);
      // resting yaw: face toward the trail, a little off
      const baseYaw = Math.atan2(p.x - x, p.z - z) + (rng() - 0.5) * 0.9;
      g.rotation.y = baseYaw;
      this.scene.add(g);
      this.pumpkins.push({ group: g, mat, baseYaw, yaw: baseYaw, delay: rng() * 0.55, phase: rng() * 10, s });
    }
    // a few pooled lights travel with the camera to the nearest lanterns (cheaper than 34 lights)
    this.pumpkinLights = Array.from({ length: 4 }, () => {
      const l = new THREE.PointLight('#ff7a1a', 0, 5.5, 1.6);
      this.scene.add(l);
      return l;
    });
  }

  // ─────────────────────────── graveyard ───────────────────────────
  buildGraveyard() {
    const rng = mulberry32(99);
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#5e5e62', roughness: 0.95, map: stoneTexture() });
    const shapes = [
      () => { const a = new THREE.BoxGeometry(0.6, 0.75, 0.14); a.translate(0, 0.375, 0); const t = new THREE.CylinderGeometry(0.3, 0.3, 0.14, 16, 1, false, 0, Math.PI); t.rotateX(Math.PI / 2); t.rotateZ(Math.PI / 2); t.translate(0, 0.75, 0); return mergeGeometries([a.toNonIndexed(), t.toNonIndexed()]); },
      () => { const a = new THREE.BoxGeometry(0.14, 1.1, 0.12); a.translate(0, 0.55, 0); const b = new THREE.BoxGeometry(0.6, 0.13, 0.12); b.translate(0, 0.8, 0); return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]); },
      () => { const a = new THREE.BoxGeometry(0.75, 0.55, 0.18); a.translate(0, 0.275, 0); return a.toNonIndexed(); },
    ];
    for (let i = 0; i < 14; i++) {
      const g = shapes[Math.floor(rng() * shapes.length)]();
      const mesh = new THREE.Mesh(g, stoneMat);
      const x = GRAVEYARD.x + ((i % 3) - 1) * 2 + (rng() - 0.5) * 0.6;
      const z = GRAVEYARD.z - GRAVEYARD.d / 2 + 1 + Math.floor(i / 3) * 1.9 + (rng() - 0.5) * 0.4;
      mesh.position.set(x, this.height(x, z) - 0.08, z);
      mesh.rotation.set((rng() - 0.5) * 0.35, Math.PI / 2 + (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.3);   // face the trail, leaning
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    // wrought-iron fence with a gap facing the trail
    const iron = new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.5, metalness: 0.6 });
    const picket = mergeGeometries([
      new THREE.CylinderGeometry(0.018, 0.018, 1.25, 5).translate(0, 0.62, 0),
      new THREE.ConeGeometry(0.04, 0.14, 5).translate(0, 1.3, 0),
    ]);
    const pts = [];
    const { x: gx, z: gz, w, d } = GRAVEYARD;
    const edge = (x0, z0, x1, z1, gapAt) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 0.22);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        if (gapAt && Math.abs(t - 0.5) < 0.12) continue;
        pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
      }
    };
    edge(gx - w / 2, gz - d / 2, gx - w / 2, gz + d / 2);
    edge(gx + w / 2, gz - d / 2, gx + w / 2, gz + d / 2, true);   // trail side: gate gap
    edge(gx - w / 2, gz - d / 2, gx + w / 2, gz - d / 2);
    edge(gx - w / 2, gz + d / 2, gx + w / 2, gz + d / 2);
    const fence = new THREE.InstancedMesh(picket, iron, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    pts.forEach(([x, z], i) => {
      e.set((rng() - 0.5) * 0.15, 0, (rng() - 0.5) * 0.15); q.setFromEuler(e);
      m.compose(tmpV.set(x, this.height(x, z) - 0.05, z), q, new THREE.Vector3(1, 1, 1));
      fence.setMatrixAt(i, m);
    });
    fence.castShadow = true;
    this.scene.add(fence);
  }

  // ─────────────────────────── the house ───────────────────────────
  buildHouse() {
    const wood = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.95, color: '#8a8278' });
    wood.map.repeat.set(3, 2);
    const roofMat = new THREE.MeshStandardMaterial({ color: '#1e1c1e', roughness: 1, map: shingleTexture() });
    const trim = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 1 });
    const h = this.height(HOUSE.x, HOUSE.z + 6);
    const house = new THREE.Group();
    house.position.set(HOUSE.x, h, HOUSE.z);
    house.rotation.z = 0.012;                        // it's settled crooked over the years
    this.house = house;
    const W = 9, D = 7, H = 5.2;
    const box = (w, hh, d, mat, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; house.add(b); return b; };
    box(W, H, D, wood, 0, H / 2, 0);
    box(W + 0.2, 0.25, D + 0.2, trim, 0, 0.12, 0);                 // foundation
    box(W + 0.1, 0.12, D + 0.1, trim, 0, H / 2 + 0.05, 0);          // floor trim
    // gable roof (ridge along x), with a sag in the middle
    const roofGeo = new THREE.BufferGeometry();
    const rH = 2.6, ov = 0.6, hw = W / 2 + ov, hd = D / 2 + ov;
    const v = [
      -hw, 0, hd, hw, 0, hd, hw, rH, 0, -hw, rH, 0,     // front slope
      hw, 0, -hd, -hw, 0, -hd, -hw, rH, 0, hw, rH, 0,   // back slope
    ];
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 4, 0, 4, 2, 0, 2, 0, 0, 4, 0, 4, 2, 0, 2], 2));
    roofGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    roofGeo.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.material.side = THREE.DoubleSide;
    roof.position.y = H; roof.castShadow = true;
    house.add(roof);
    // gable end walls (triangles)
    for (const sx of [-1, 1]) {
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([sx * W / 2, 0, D / 2, sx * W / 2, 0, -D / 2, sx * W / 2, rH - 0.2, 0], 3));
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 1, 1], 2));
      tri.computeVertexNormals();
      const t = new THREE.Mesh(tri, wood); t.material.side = THREE.DoubleSide; t.position.y = H; house.add(t);
    }
    box(0.8, 2.2, 0.8, trim, 2.6, H + 1.8, -1.2);                    // chimney
    // porch: deck, posts, sloped roof (one post snapped)
    box(W - 1.5, 0.3, 2.2, trim, 0, 0.35, D / 2 + 1.1);
    for (const [i, px] of [-3.4, -1.1, 1.1, 3.4].entries()) {
      const post = box(0.18, 2.5, 0.18, trim, px, 1.75, D / 2 + 2.05);
      if (i === 3) { post.rotation.z = 0.35; post.position.y = 1.5; }
    }
    const porchRoof = box(W - 1.2, 0.12, 2.6, roofMat, 0, 3.05, D / 2 + 1.25);
    porchRoof.rotation.x = 0.22; porchRoof.rotation.z = -0.04;
    // windows: emissive glass so one can glow, the rest dead black
    this.windows = [];
    const glassOn = new THREE.MeshBasicMaterial({ color: '#ffb35a' });
    const glassOff = new THREE.MeshStandardMaterial({ color: '#07080b', roughness: 0.2, metalness: 0.4 });
    const win = (x, y, lit) => {
      const frame = box(1.2, 1.5, 0.12, trim, x, y, D / 2 + 0.03);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), lit ? glassOn.clone() : glassOff);
      g.position.set(x, y, D / 2 + 0.1); house.add(g);
      const bar1 = box(0.06, 1.3, 0.04, trim, x, y, D / 2 + 0.12), bar2 = box(1.0, 0.06, 0.04, trim, x, y, D / 2 + 0.12);
      this.windows.push({ glass: g, lit, frame, bars: [bar1, bar2] });
      return g;
    };
    win(-2.7, 1.8, false); win(2.7, 1.8, false); win(-2.7, 4.0, true); win(2.7, 4.0, false);
    // boarded-up downstairs right window
    for (const [r, y] of [[0.4, 1.6], [-0.3, 2.1]]) { const b = box(1.5, 0.16, 0.06, wood, 2.7, y, D / 2 + 0.2); b.rotation.z = r; }
    // door on a hinge so it can creak open at the end
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-0.6, 0.5, D / 2 + 0.06);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 1, map: plankTexture() }));
    door.position.set(0.6, 1.15, 0); door.castShadow = true;
    this.doorPivot.add(door);
    house.add(this.doorPivot);
    // dark interior behind the door
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.35), new THREE.MeshBasicMaterial({ color: '#020203' }));
    inside.position.set(0, 1.65, D / 2 + 0.01); house.add(inside);
    this.doorway = new THREE.Vector3(HOUSE.x, h + 0.5, HOUSE.z + D / 2 - 0.6);   // where he stands at the end
    this.porchSpot = new THREE.Vector3(HOUSE.x, h, HOUSE.z + D / 2 + 3.6);
    this.windowLight = new THREE.PointLight('#ffb35a', 2.5, 9, 1.5);
    this.windowLight.position.set(HOUSE.x - 2.7, h + 4.0, HOUSE.z + D / 2 + 0.8);
    this.scene.add(this.windowLight);
    this.scene.add(house);
  }
  setWindowLit(on) {
    const w = this.windows[2];
    w.glass.material.color.set(on ? '#ffb35a' : '#050506');
    this.windowLight.intensity = on ? 2.5 : 0;
  }

  // ─────────────────────────── scarecrow ───────────────────────────
  buildScarecrow() {
    const p = this.path.getPointAt(0.47), t = this.path.getTangentAt(0.47);
    const x = p.x + -t.z * 4.2, z = p.z + t.x * 4.2;
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#3a2e22', roughness: 1 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#3a3226', roughness: 1 });
    const burlap = new THREE.MeshStandardMaterial({ color: '#8a7350', roughness: 1 });
    const add = (geo, mat, x2, y, z2, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x2, y, z2); m.rotation.z = rz; m.castShadow = true; g.add(m); return m; };
    add(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), wood, 0, 1.3, 0);
    add(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), wood, 0, 1.95, 0, Math.PI / 2 + 0.08);
    add(new THREE.ConeGeometry(0.45, 1.1, 8, 1, true), cloth, 0, 1.55, 0);
    this.scarecrowHead = add(new THREE.SphereGeometry(0.2, 12, 10), burlap, 0, 2.35, 0);
    add(new THREE.ConeGeometry(0.3, 0.35, 10), cloth, 0, 2.6, 0, 0.15);
    g.position.set(x, this.height(x, z), z);
    g.rotation.y = Math.atan2(p.x - x, p.z - z);
    this.scarecrow = g;
    this.scene.add(g);
  }

  /** pumpkins turn to watch the viewer as the hand comes close; candles flicker */
  /** the pumpkins behind you (nearest first) are already facing you when you turn around */
  stareBehind(camera, n, maxD) {
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    const c = camera.position;
    this.pumpkins
      .map((p) => ({ p, d: p.group.position.distanceTo(c), dot: (p.group.position.x - c.x) * f.x + (p.group.position.z - c.z) * f.z }))
      .filter((o) => o.dot < 0 && o.d < maxD)
      .sort((a, b) => a.d - b.d).slice(0, n)
      .forEach(({ p }) => {
        p.stare = true;
        p.yaw = Math.atan2(c.x - p.group.position.x, c.z - p.group.position.z);
        p.group.rotation.y = p.yaw;
      });
    this.stareT = 25;
  }
  update(dt, t, presence, camera, dread) {
    this.alert = Math.max(0, (this.alert || 0) - dt * 0.12);
    if (this.stareT > 0 && (this.stareT -= dt) <= 0) for (const p of this.pumpkins) p.stare = false;       // a loud sound makes them all look, then they relax
    const snap = this.alert > 0.05;
    for (const p of this.pumpkins) {
      const g = p.group;
      const toCam = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      const w = Math.max(smooth(presence, p.delay, p.delay + 0.3), snap || p.stare ? 1 : 0);   // they turn one after another
      let diff = Math.atan2(Math.sin(toCam - p.baseYaw), Math.cos(toCam - p.baseYaw));
      const target = p.baseYaw + diff * w;
      let d = Math.atan2(Math.sin(target - p.yaw), Math.cos(target - p.yaw));
      const rate = p.stare ? 9 : snap && this.alert > 0.85 ? 9 : 1.4;               // slow, deliberate turn ... or a snap
      p.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
      g.rotation.y = p.yaw;
      const flicker = 0.85 + Math.sin(t * 11 + p.phase) * 0.06 + Math.sin(t * 23.7 + p.phase * 2) * 0.05 + (Math.random() - 0.5) * 0.08;
      p.mat.emissiveIntensity = (1.8 + presence * 2.2 + dread * 0.8) * flicker * (p.stare ? 1.7 : 1);
      p.flicker = flicker;
    }
    // pooled lights -> the four nearest lanterns
    const near = [...this.pumpkins]
      .sort((a, b) => a.group.position.distanceToSquared(camera.position) - b.group.position.distanceToSquared(camera.position))
      .slice(0, this.pumpkinLights.length);
    near.forEach((p, i) => {
      const l = this.pumpkinLights[i];
      l.position.copy(p.group.position).y += 0.35;
      l.intensity = (1.4 + presence * 1.6) * p.flicker;
    });
    if (this.scarecrowHead) {
      const sc = this.scarecrow;
      const toCam = Math.atan2(camera.position.x - sc.position.x, camera.position.z - sc.position.z) - sc.rotation.y;
      const want = THREE.MathUtils.clamp(Math.atan2(Math.sin(toCam), Math.cos(toCam)), -1.2, 1.2) * smooth(presence, 0.5, 0.9);
      this.scarecrowHead.rotation.y += (want - this.scarecrowHead.rotation.y) * (1 - Math.exp(-dt * (presence > 0.85 ? 12 : 1.5)));
    }
  }
}

// ─────────────────────────── geometry + textures ───────────────────────────
export function pumpkinGeometry() {
  const g = new THREE.SphereGeometry(0.28, 40, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ang = Math.atan2(z, x);
    const rib = 1 - 0.07 * (0.5 - 0.5 * Math.cos(ang * 10));        // 10 ribs
    const yy = y * 0.78 - 0.03 * Math.cos((y / 0.28) * Math.PI);     // squat, dimpled top
    p.setXYZ(i, x * rib * 1.05, yy, z * rib * 1.05);
  }
  g.computeVertexNormals();
  return g;
}

/** Carved face painted in UV space: sphere u = 0.25 faces +z. */
export function pumpkinFace(kind) {
  const W = 512, H = 256;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [cm, gm] = mk(), [cg, gg] = mk();
  // skin with rib shading
  const grad = gm.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#7a3a0c'); grad.addColorStop(0.5, '#e0741c'); grad.addColorStop(1, '#6a300a');
  gm.fillStyle = grad; gm.fillRect(0, 0, W, H);
  for (let k = 0; k < 10; k++) { gm.fillStyle = 'rgba(80,30,5,0.35)'; gm.fillRect((k / 10) * W - 3, 0, 6, H); }
  gg.fillStyle = '#000'; gg.fillRect(0, 0, W, H);
  const cx = 0.25 * W, cy = H * 0.5;
  const paint = (path) => { for (const [ctx, col] of [[gm, '#ffd27a'], [gg, '#fff']]) { ctx.fillStyle = col; ctx.beginPath(); path(ctx); ctx.closePath(); ctx.fill(); } };
  const tri = (x, y, s, flip = 1) => (c) => { c.moveTo(x - s, y + s * 0.6 * flip); c.lineTo(x + s, y + s * 0.6 * flip); c.lineTo(x, y - s * 0.8 * flip); };
  if (kind === 0 || kind === 2) { paint(tri(cx - 26, cy - 22, 16)); paint(tri(cx + 26, cy - 22, 16)); }
  else { paint((c) => c.ellipse(cx - 26, cy - 22, 15, 11, 0.3, 0, 7)); paint((c) => c.ellipse(cx + 26, cy - 22, 15, 11, -0.3, 0, 7)); }
  paint(tri(cx, cy, 8));                                              // nose
  paint((c) => {                                                      // jagged grin
    const w = kind === 3 ? 70 : 58, y0 = cy + 18;
    c.moveTo(cx - w, y0);
    for (let i = 0; i <= 8; i++) c.lineTo(cx - w + (i / 8) * w * 2, y0 + (i % 2 ? 10 : 0) + Math.sin((i / 8) * Math.PI) * 18);
    c.lineTo(cx + w, y0 + 4);
    for (let i = 8; i >= 0; i--) c.lineTo(cx - w + (i / 8) * w * 2, y0 + 30 + Math.sin((i / 8) * Math.PI) * 14 - (i % 2 ? 9 : 0));
  });
  const map = new THREE.CanvasTexture(cm); map.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.CanvasTexture(cg);
  return { map, glow };
}

export function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function litterTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 120 + Math.random() * 120;
      g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.8})`;
      g.save(); g.translate(Math.random() * w, Math.random() * h); g.rotate(Math.random() * 6);
      g.beginPath(); g.ellipse(0, 0, 3 + Math.random() * 6, 1.5 + Math.random() * 3, 0, 0, 7); g.fill(); g.restore();
    }
  });
}
function plankTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const v = 70 + Math.random() * 40;
      g.fillStyle = `rgb(${v},${v * 0.9},${v * 0.8})`; g.fillRect(0, (i / 8) * h, w, h / 8);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, (i / 8) * h, w, 2);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, (i / 8) * h + Math.random() * h / 8, 20 + Math.random() * 60, 1); }
    }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(20,25,15,${Math.random() * 0.25})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 5 + Math.random() * 25, 0, 7); g.fill(); }
  });
}
function shingleTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#4a4a50'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
      if (Math.random() < 0.08) continue;                       // missing shingles
      const v = 50 + Math.random() * 30;
      g.fillStyle = `rgb(${v},${v},${v + 5})`;
      g.fillRect(c * 22 + (r % 2) * 11, r * 16, 20, 14);
    }
  });
}
function stoneTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#a0a0a4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { const v = 100 + Math.random() * 100; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(40,60,30,${Math.random() * 0.4})`; g.beginPath(); g.arc(Math.random() * w, h - Math.random() * 30, 6 + Math.random() * 14, 0, 7); g.fill(); }
  });
}
