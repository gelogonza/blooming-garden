import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, smooth } from './noise.js';
import { pumpkinGeometry, pumpkinFace, canvasTex, GRAVEYARD } from './world.js';

const v3 = new THREE.Vector3();

/** Everything that makes the trail feel like Halloween night (and like people were here before you). */
export class Decor {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.rng = mulberry32(666);
    this.ghosts = []; this.bats = []; this.flames = []; this.streamers = [];
    this.trash();
    this.spilledPail();
    this.smashedPumpkins();
    this.toiletPaper();
    this.sheetGhosts();
    this.signs();
    this.trailhead();
    this.webs();
    this.porch();
    this.batFlock();
  }

  /** a point beside the trail: s = progress, off = sideways metres (signed) */
  beside(s, off) {
    const W = this.world, p = W.path.getPointAt(s), t = W.path.getTangentAt(s);
    const x = p.x - t.z * off, z = p.z + t.x * off;
    return new THREE.Vector3(x, W.height(x, z), z);
  }

  // ─────────────── litter ───────────────
  trash() {
    const rng = this.rng;
    const can = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12); can.scale(1, 0.55, 1);    // crushed
    can.rotateZ(Math.PI / 2);
    const canTex = canvasTex(64, 32, (g, w, h) => {
      g.fillStyle = '#b8bcc4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c4161c'; g.fillRect(0, 6, w, 18);
      g.fillStyle = '#fff'; g.fillRect(8, 12, 30, 4);
    }, false);
    const bottle = mergeGeometries([new THREE.CylinderGeometry(0.035, 0.035, 0.18, 10).toNonIndexed(),
      new THREE.CylinderGeometry(0.012, 0.03, 0.08, 10).translate(0, 0.13, 0).toNonIndexed()]);
    bottle.rotateZ(Math.PI / 2);
    const wrapper = new THREE.PlaneGeometry(0.09, 0.06, 3, 2);
    { const p = wrapper.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (Math.random() - 0.5) * 0.02); wrapper.rotateX(-Math.PI / 2); wrapper.computeVertexNormals(); }
    const paper = new THREE.PlaneGeometry(0.36, 0.28, 4, 3);
    { const p = paper.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (Math.random() - 0.5) * 0.04); paper.rotateX(-Math.PI / 2); paper.computeVertexNormals(); }
    const newsTex = canvasTex(128, 96, (g, w, h) => {
      g.fillStyle = '#c9c2b0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#222'; g.font = 'bold 13px Georgia'; g.fillText('MISSING', 8, 16);
      g.font = '7px Georgia'; g.fillText('Local man last seen near', 8, 28); g.fillText('Hollow Rd. woods, Oct 31', 8, 37);
      for (let y = 46; y < h - 4; y += 6) g.fillRect(8, y, 50 + Math.random() * 60, 2);
      g.fillStyle = '#555'; g.fillRect(80, 22, 38, 30);
    }, false);
    const cup = new THREE.CylinderGeometry(0.045, 0.032, 0.1, 10, 1, true); cup.rotateZ(Math.PI / 2);

    const kinds = [
      { geo: can, mat: new THREE.MeshStandardMaterial({ map: canTex, metalness: 0.7, roughness: 0.35 }), n: 40 },
      { geo: bottle, mat: new THREE.MeshPhysicalMaterial({ color: '#2f6a2a', roughness: 0.15, transmission: 0.4, transparent: true, opacity: 0.8 }), n: 18 },
      { geo: wrapper, mat: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }), n: 90, colors: ['#e83a2a', '#ffd21f', '#7a2ad8', '#f07a10', '#2ab04a', '#e8e8f0'] },
      { geo: paper, mat: new THREE.MeshStandardMaterial({ map: newsTex, roughness: 1, side: THREE.DoubleSide }), n: 10 },
      { geo: cup, mat: new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.6, side: THREE.DoubleSide }), n: 14 },
    ];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    for (const K of kinds) {
      const inst = new THREE.InstancedMesh(K.geo, K.mat, K.n);
      for (let i = 0; i < K.n; i++) {
        const p = this.beside(0.01 + rng() * 0.95, (rng() - 0.5) * 4.2);
        e.set(0, rng() * Math.PI * 2, 0); q.setFromEuler(e);
        m.compose(p.add(v3.set(0, 0.025, 0)), q, s);
        inst.setMatrixAt(i, m);
        if (K.colors) inst.setColorAt(i, new THREE.Color(K.colors[Math.floor(rng() * K.colors.length)]));
      }
      inst.receiveShadow = true; inst.castShadow = true;
      this.scene.add(inst);
    }
  }

  // ─────────────── a kid dropped their candy and ran ───────────────
  spilledPail() {
    const rng = this.rng;
    const at = this.beside(0.3, 0.6);
    const g = new THREE.Group();
    const face = pumpkinFace(1);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.22, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: '#ff7a10', map: face.map, roughness: 0.45, side: THREE.DoubleSide }));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.008, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: '#222' }));
    handle.position.y = 0.11;
    g.add(body, handle);
    g.rotation.set(0, rng() * 6, Math.PI / 2 - 0.15);            // tipped over
    g.position.copy(at).add(v3.set(0, 0.14, 0));
    this.scene.add(g);
    const candy = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.02, 0.025), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.3 }), 40);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 40; i++) {
      const a = rng() * 1.4 - 0.7 + 0.3, r = 0.15 + rng() * 0.9;
      const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      q.setFromEuler(new THREE.Euler(0, rng() * 6, 0));
      m.compose(v3.set(x, this.world.height(x, z) + 0.015, z), q, new THREE.Vector3(1, 1, 1));
      candy.setMatrixAt(i, m);
      candy.setColorAt(i, new THREE.Color(['#ff2a2a', '#ffd21f', '#7a2ad8', '#ffffff', '#2ab04a', '#f07a10'][i % 6]));
    }
    this.scene.add(candy);
  }

  smashedPumpkins() {
    const rng = this.rng;
    const shell = pumpkinGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: '#d0661a', roughness: 0.8, side: THREE.DoubleSide });
    const gut = new THREE.MeshStandardMaterial({ color: '#e8a040', roughness: 0.5 });
    for (const s of [0.18, 0.44, 0.71]) {
      const at = this.beside(s, (rng() - 0.5) * 1.6);
      for (let k = 0; k < 4; k++) {              // shell chunks
        const chunk = new THREE.Mesh(shell, mat);
        chunk.scale.set(0.5 + rng() * 0.4, 0.4, 0.5 + rng() * 0.4);
        chunk.position.copy(at).add(v3.set((rng() - 0.5) * 0.7, 0.02, (rng() - 0.5) * 0.7));
        chunk.rotation.set(rng() * 3, rng() * 6, rng() * 3);
        chunk.castShadow = true;
        this.scene.add(chunk);
      }
      const seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 5, 3).scale(1, 0.4, 1.6), gut, 30);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 30; i++) { m.makeTranslation(at.x + (rng() - 0.5) * 0.9, at.y + 0.01, at.z + (rng() - 0.5) * 0.9); seeds.setMatrixAt(i, m); }
      this.scene.add(seeds);
    }
  }

  // ─────────────── toilet-papered trees ───────────────
  toiletPaper() {
    const rng = this.rng;
    const mat = new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.95, side: THREE.DoubleSide });
    const trees = this.world.hideTrees.filter((t) => t.d < 6).filter((_, i) => i % 5 === 0).slice(0, 16);
    const ribbon = (pts, width) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const n = 24, pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0.3, 1, 0.2).normalize()).normalize().multiplyScalar(width / 2);
        side.applyAxisAngle(tan, Math.sin(t * 9) * 0.6);                // the paper twists
        pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
        if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    for (const t of trees) {
      const base = new THREE.Vector3(t.x, this.world.height(t.x, t.z), t.z);
      const group = new THREE.Group();
      // long strands hanging from high branches, plus a swag draped between two points
      for (let k = 0; k < 3 + Math.floor(rng() * 3); k++) {
        const a = rng() * 6.28, r = 0.6 + rng() * 1.8, top = 3.5 + rng() * 3;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const len = 1.5 + rng() * 2.5;
        group.add(new THREE.Mesh(ribbon([
          new THREE.Vector3(x, top, z), new THREE.Vector3(x + 0.1, top - len * 0.4, z + 0.05),
          new THREE.Vector3(x - 0.05, top - len * 0.75, z), new THREE.Vector3(x + 0.08, top - len, z + 0.1)], 0.1), mat));
      }
      const a = rng() * 6.28;
      group.add(new THREE.Mesh(ribbon([
        new THREE.Vector3(Math.cos(a) * 1.5, 4.5, Math.sin(a) * 1.5), new THREE.Vector3(Math.cos(a + 1) * 1.2, 2.8, Math.sin(a + 1) * 1.2),
        new THREE.Vector3(Math.cos(a + 2) * 1.5, 4.2, Math.sin(a + 2) * 1.5)], 0.1), mat));
      group.position.copy(base);
      group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(group);
      this.streamers.push({ group, phase: rng() * 6 });
    }
  }

  // ─────────────── sheet ghosts hanging from branches ───────────────
  sheetGhosts() {
    const rng = this.rng;
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = t < 0.3 ? Math.sin((t / 0.3) * Math.PI / 2) * 0.22 : 0.22 + (t - 0.3) * 0.35;
      prof.push(new THREE.Vector2(Math.max(r, 0.001), 0.9 - t * 1.25));
    }
    const geo = new THREE.LatheGeometry(prof, 28);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {                              // ragged hem + cloth folds
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const low = THREE.MathUtils.clamp((0.3 - y) / 0.6, 0, 1);
      const fold = 1 + Math.sin(a * 7) * 0.08 * low;
      p.setXYZ(i, x * fold, y + Math.sin(a * 5) * 0.08 * low * low, z * fold);
    }
    geo.computeVertexNormals();
    const cloth = new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.9, side: THREE.DoubleSide, emissive: '#2a2e3a', emissiveIntensity: 0.4 });
    const eye = new THREE.MeshBasicMaterial({ color: '#000' });
    const rope = new THREE.MeshStandardMaterial({ color: '#3a3226' });
    const trees = this.world.hideTrees.filter((t) => t.d < 5).filter((_, i) => i % 7 === 3).slice(0, 8);
    for (const t of trees) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(geo, cloth); body.castShadow = true; g.add(body);
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12).scale(0.75, 1.25, 1), eye);
        e.position.set(sx * 0.075, 0.7, 0.2); g.add(e);
      }
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12).scale(0.8, 1.4, 1), eye);
      mouth.position.set(0, 0.55, 0.215); g.add(mouth);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.2), rope); line.position.y = 1.5; g.add(line);
      // hang it on the trail side of the trunk
      const W = this.world, pp = W.path.getPointAt(t.s);
      const dir = new THREE.Vector2(pp.x - t.x, pp.z - t.z).normalize();
      const hang = new THREE.Vector3(t.x + dir.x * 1.2, W.height(t.x, t.z) + 2.6 + rng() * 0.8, t.z + dir.y * 1.2);
      const pivot = new THREE.Group(); pivot.position.copy(hang).add(v3.set(0, 2.1, 0));
      g.position.y = -2.1; pivot.add(g);
      this.scene.add(pivot);
      this.ghosts.push({ pivot, body: g, phase: rng() * 6, yaw: Math.atan2(dir.x, dir.y) });
    }
  }

  // ─────────────── hand-painted warnings ───────────────
  signs() {
    const wood = new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 });
    const make = (text, s, off, tilt) => {
      const tex = canvasTex(256, 128, (g, w, h) => {
        g.fillStyle = '#6a5a48'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, (i * h) / 4, w, 2); }
        g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.fillStyle = '#8a0c0c';
        g.fillText(text, w / 2, h / 2 + 16);
        for (let i = 0; i < 14; i++) {                               // paint drips
          const x = 30 + Math.random() * (w - 60), y = h / 2 + 18;
          g.fillRect(x, y, 3, 8 + Math.random() * 30);
        }
      }, false);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.05), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), wood]);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.6, 0.09), wood);
      const g = new THREE.Group(); board.position.y = 1.35; post.position.y = 0.8; g.add(board, post);
      const at = this.beside(s, off);
      g.position.copy(at);
      const p = this.world.path.getPointAt(Math.max(0, s - 0.01));
      g.rotation.set(0, Math.atan2(p.x - at.x, p.z - at.z), tilt);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      this.scene.add(g);
    };
    make('TURN BACK', 0.12, -2.0, 0.08);
    make('KEEP OUT', 0.55, 2.1, -0.12);
    make('HE SEES YOU', 0.8, -2.2, 0.15);
  }

  // ─────────────── where the trail leaves the road ───────────────
  trailhead() {
    const rng = this.rng;
    const hay = new THREE.MeshStandardMaterial({ color: '#b89a52', roughness: 1, map: canvasTex(128, 64, (g, w, h) => {
      g.fillStyle = '#a88a48'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(${200 + Math.random() * 55},${170 + Math.random() * 40},90,0.5)`; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + 8 - Math.random() * 16, y + 3 - Math.random() * 6); g.stroke(); }
    }) });
    const face = [0, 2, 3].map((k) => pumpkinFace(k));
    const pumpkin = pumpkinGeometry();
    for (const side of [-1, 1]) {
      const at = this.beside(0.012, side * 2.3);
      const bale = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.6), hay);
      bale.position.copy(at).add(v3.set(0, 0.25, 0)); bale.rotation.y = rng(); bale.castShadow = bale.receiveShadow = true;
      this.scene.add(bale);
      const f = face[Math.floor(rng() * 3)];
      const pk = new THREE.Mesh(pumpkin, new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.glow, emissive: '#ff8a1f', emissiveIntensity: 2.4 }));
      pk.position.copy(bale.position).add(v3.set(0, 0.45, 0)); pk.scale.setScalar(1.2);
      pk.rotation.y = side > 0 ? -0.6 : 0.6;
      this.scene.add(pk);
      // corn stalk bundle
      const stalks = [];
      for (let k = 0; k < 14; k++) {
        const g = new THREE.CylinderGeometry(0.012, 0.02, 2.1, 4).translate(0, 1.05, 0);
        g.rotateZ((rng() - 0.5) * 0.35); g.rotateY(rng() * 6);
        stalks.push(g.toNonIndexed());
      }
      const corn = new THREE.Mesh(mergeGeometries(stalks), new THREE.MeshStandardMaterial({ color: '#9a8450', roughness: 1 }));
      corn.position.copy(at).add(v3.set(side * 0.8, 0, -0.4)); corn.castShadow = true;
      this.scene.add(corn);
    }
  }

  // ─────────────── spider webs ───────────────
  webs() {
    const mat = new THREE.LineBasicMaterial({ color: '#cfd6e0', transparent: true, opacity: 0.35 });
    const web = (center, normal, r) => {
      const pts = [];
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
      const spokes = 9;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        pts.push(new THREE.Vector3(), new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      for (let ring = 1; ring < 7; ring++) {
        const rr = (ring / 7) * r;
        for (let i = 0; i < spokes; i++) {
          const a0 = (i / spokes) * Math.PI * 2, a1 = ((i + 1) / spokes) * Math.PI * 2;
          const sag = 0.85;
          pts.push(new THREE.Vector3(Math.cos(a0) * rr, Math.sin(a0) * rr, 0), new THREE.Vector3(Math.cos((a0 + a1) / 2) * rr * sag, Math.sin((a0 + a1) / 2) * rr * sag, 0));
          pts.push(new THREE.Vector3(Math.cos((a0 + a1) / 2) * rr * sag, Math.sin((a0 + a1) / 2) * rr * sag, 0), new THREE.Vector3(Math.cos(a1) * rr, Math.sin(a1) * rr, 0));
        }
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.LineSegments(g, mat);
      l.quaternion.copy(q); l.position.copy(center);
      this.scene.add(l);
    };
    const H = this.world.house;
    H.updateMatrixWorld(true);
    for (const [x, y] of [[-3.4, 3.0], [3.3, 2.9]]) web(H.localToWorld(new THREE.Vector3(x, y, 5.3)), new THREE.Vector3(0, 0, 1), 0.55);
    const { x, z, w, d } = GRAVEYARD;
    web(new THREE.Vector3(x + w / 2, this.world.height(x + w / 2, z - d / 2) + 0.9, z - d / 2 + 0.4), new THREE.Vector3(1, 0, 0), 0.4);
    for (const t of this.world.hideTrees.filter((t) => t.d < 4.5).filter((_, i) => i % 9 === 1).slice(0, 8)) {
      web(new THREE.Vector3(t.x, this.world.height(t.x, t.z) + 1.2, t.z), new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5), 0.5);
    }
  }

  // ─────────────── the porch: candles and lanterns someone lit for you ───────────────
  porch() {
    const H = this.world.house;
    const face = [1, 2, 0].map((k) => pumpkinFace(k));
    const geo = pumpkinGeometry();
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb84a' });
    const wax = new THREE.MeshStandardMaterial({ color: '#e6dcc4', roughness: 0.8 });
    [[-2.6, 0.62, 4.9], [2.2, 0.62, 5.0], [-1.5, 0.62, 5.6]].forEach(([x, y, z], i) => {
      const f = face[i];
      const pk = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.glow, emissive: '#ff8a1f', emissiveIntensity: 2.4 }));
      pk.position.set(x, y + 0.18, z); pk.scale.setScalar(1.1);
      H.add(pk);
    });
    for (const [x, z] of [[-0.9, 5.7], [0.9, 5.7], [-3.3, 5.5], [3.0, 5.4], [-0.5, 6.1]]) {
      const h = 0.1 + Math.random() * 0.18;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 10), wax);
      candle.position.set(x, 0.52 + h / 2, z); H.add(candle);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6).scale(1, 2.2, 1), flameMat);
      flame.position.set(x, 0.52 + h + 0.04, z); H.add(flame);
      this.flames.push({ flame, phase: Math.random() * 10 });
    }
    this.porchLight = new THREE.PointLight('#ff9a3a', 1.2, 6, 1.6);
    this.porchLight.position.copy(H.localToWorld(new THREE.Vector3(0, 1.0, 5.5)));
    this.scene.add(this.porchLight);
  }

  // ─────────────── bats ───────────────
  batFlock() {
    const wingGeo = new THREE.BufferGeometry();
    // body + two jagged wings (flat), flapped by scaling the wing halves
    const wing = [0, 0, 0, 0.32, 0.05, -0.05, 0.26, -0.02, 0.04, 0, 0, 0, 0.26, -0.02, 0.04, 0.18, -0.06, 0.08, 0, 0, 0, 0.18, -0.06, 0.08, 0.05, -0.02, 0.06];
    const both = [...wing, ...wing.map((v, i) => (i % 3 === 0 ? -v : v))];
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(both, 3));
    wingGeo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: '#050407', side: THREE.DoubleSide, fog: false });
    const rng = this.rng;
    for (let i = 0; i < 16; i++) {
      const left = new THREE.Mesh(wingGeo, mat);
      const b = new THREE.Group(); b.add(left);
      b.scale.setScalar(0.9 + rng() * 0.6);
      this.scene.add(b);
      this.bats.push({ b, s: rng(), r: 3 + rng() * 9, h: 6 + rng() * 9, speed: 0.4 + rng() * 0.5, phase: rng() * 6, flap: 9 + rng() * 5 });
    }
  }

  update(dt, t, presence, camera, s) {
    for (const g of this.ghosts) {
      // ghosts sway in the wind... and slowly turn to face you when your hand is close
      const toCam = Math.atan2(camera.position.x - g.pivot.position.x, camera.position.z - g.pivot.position.z);
      const want = THREE.MathUtils.lerp(g.yaw, toCam, smooth(presence, 0.2, 0.7));
      g.pivot.rotation.y += Math.atan2(Math.sin(want - g.pivot.rotation.y), Math.cos(want - g.pivot.rotation.y)) * (1 - Math.exp(-dt * 1.2));
      g.pivot.rotation.z = Math.sin(t * 0.9 + g.phase) * 0.08 * (1 + presence);
      g.pivot.rotation.x = Math.sin(t * 0.7 + g.phase * 2) * 0.05;
    }
    for (const st of this.streamers) st.group.rotation.y = Math.sin(t * 0.4 + st.phase) * 0.03;
    for (const f of this.flames) {
      const k = 0.8 + Math.sin(t * 13 + f.phase) * 0.15 + (Math.random() - 0.5) * 0.15;
      f.flame.scale.set(1, k, 1);
    }
    if (this.porchLight) this.porchLight.intensity = 1.1 + Math.sin(t * 11) * 0.15 + (Math.random() - 0.5) * 0.2;
    // bats circle around points ahead of the walker, high up
    const p = this.world.path.getPointAt(Math.min(0.98, s + 0.12));
    for (const bt of this.bats) {
      const a = t * bt.speed + bt.phase;
      bt.b.position.set(p.x + Math.cos(a) * bt.r, p.y + bt.h + Math.sin(a * 2.3) * 1.2, p.z + Math.sin(a) * bt.r * 0.6);
      bt.b.rotation.y = -a;
      const flap = Math.sin(t * bt.flap + bt.phase);
      bt.b.scale.y = 0.4 + Math.abs(flap) * 0.9;
      bt.b.rotation.z = flap * 0.4;
    }
  }
}
