import * as THREE from 'three';
import { AnimationUtils } from 'three';
import { smooth } from './noise.js';
import { makeScareFace } from './scareface.js';

/**
 * The Tuxedo Man.
 * Rules he follows:
 *  - He never moves while you're looking at him in the light. He only relocates during a "blink"
 *    (the moon/flashlight dips, or he's out of frame).
 *  - Each relocation lands him closer, by how much "threat" there is (story act + your hand).
 *  - He always faces the walker. Your hand makes him tilt his head, loom, and finally reach.
 */
export class TuxedoMan {
  constructor(scene, gltf, world) {
    this.world = world;
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        if (o.material) { o.material.envMapIntensity = 0.4; }
      }
    });
    this.root.add(this.model);
    this.root.visible = false;
    scene.add(this.root);

    // ── animation: Idle loops; Tilt / Loom / Reach are layered on top as additive poses ──
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (n) => gltf.animations.find((a) => a.name === n);
    const stand = clip('Stand');
    this.actions = {};
    const idle = this.mixer.clipAction(clip('Idle'));
    idle.play();
    this.actions.Idle = idle;
    for (const n of ['Tilt', 'Loom', 'Reach']) {
      const c = clip(n).clone();
      AnimationUtils.makeClipAdditive(c, 0, stand, 30);
      const a = this.mixer.clipAction(c);
      a.setEffectiveWeight(0);
      a.play();
      this.actions[n] = a;
    }
    this.w = { Tilt: 0, Loom: 0, Reach: 0 };
    this.model.traverse((o) => { if (o.isBone && /DEF-head$/.test(o.name)) this.head = o; });
    if (this.head) this.face = makeScareFace(this.head);
    // eyeshine: two pinpricks that catch your flashlight from the dark, like an animal's eyes
    if (this.head) {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.4, 3.2), toneMapped: false, fog: false });
      this.eyes = new THREE.Group();
      for (const x of [-0.03, 0.03]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), m); e.position.set(x, 0.043, 0.132); this.eyes.add(e); }
      this.eyes.visible = false;
      this.head.add(this.eyes);
    }
    this.faceUp = 0.02; this.faceFront = 0.13;      // face centre in head-bone space

    this.pos = new THREE.Vector3();
    this.distance = Infinity;
    this.placedAt = -1;          // path param of last placement
    this.mode = 'gone';          // gone | lurking | flash | doorway
    this.wasDark = false;
    this.cooldown = 0;           // after a flash, he backs off for a while
  }

  /** pick a hiding tree ~`ahead` metres along the trail from the walker, on a random side */
  relocate(s, ahead, rng = Math.random) {
    const W = this.world;
    const target = Math.min(0.985, s + ahead / W.pathLen);
    if (ahead < 5.5) {
      // close range: step out onto the trail itself
      const p = W.path.getPointAt(target), t = W.path.getTangentAt(target);
      const side = rng() < 0.5 ? -1 : 1, off = 0.6 + rng() * 0.8;
      this.pos.set(p.x - t.z * side * off, 0, p.z + t.x * side * off);
    } else {
      // half-hidden beside a trunk near that spot
      let best = null, bd = Infinity;
      for (const tr of W.hideTrees) {
        const d = Math.abs(tr.s - target) * W.pathLen + (rng() * 3);
        if (d < bd) { bd = d; best = tr; }
      }
      const p = W.path.getPointAt(Math.min(0.99, Math.max(0, best ? best.s : target)));
      const tx = best ? best.x : p.x + 3, tz = best ? best.z : p.z;
      // stand just beside the trunk, slightly behind it from the trail's point of view
      const away = new THREE.Vector2(tx - p.x, tz - p.z).normalize();
      const perp = new THREE.Vector2(-away.y, away.x).multiplyScalar(rng() < 0.5 ? 0.45 : -0.45);
      this.pos.set(tx + away.x * 0.35 + perp.x, 0, tz + away.y * 0.35 + perp.y);
    }
    this.pos.y = W.height(this.pos.x, this.pos.z);
    this.placedAt = target;
    this.root.position.copy(this.pos);
  }

  isOnScreen(camera) {
    const v = this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)).project(camera);
    return v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.1;
  }

  /**
   * s: walker progress 0..1, threat: 0..1, dark: 0..1 (how dark it is right now),
   * presence: hand nearness 0..1
   */
  update(dt, t, { s, threat, dark, presence, camera }) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const effThreat = Math.max(0, threat - this.cooldown * 0.08);

    if (this.mode === 'doorway' || this.mode === 'flash' || this.mode === 'scare' || this.mode === 'circling' || this.mode === 'staged') {
      // scripted placements are handled by the story / flash / main loop
    } else if (this.mode === 'passing') {
      // walking the trail toward you and past, oblivious... as long as you stay hidden
      const W = this.world;
      this.passS -= (dt * 0.85) / W.pathLen;
      const ps = Math.max(0, this.passS), p = W.path.getPointAt(ps), tg = W.path.getTangentAt(ps);
      this.pos.set(p.x - tg.z * this.passSide, 0, p.z + tg.x * this.passSide);
      this.pos.y = W.height(this.pos.x, this.pos.z);
      this.root.position.copy(this.pos);
      this.root.rotation.y = Math.atan2(-tg.x, -tg.z);                 // facing where he's walking, not you
      this.passDone = this.passS < s - 7 / W.pathLen;
      this.root.visible = true;
    } else if (effThreat < 0.06) {
      this.mode = 'gone';
      this.root.visible = false;
    } else {
      const ahead = THREE.MathUtils.lerp(46, 3.2, Math.pow(effThreat, 1.15));
      const blink = dark > 0.55 && !this.wasDark;                       // light just dropped
      const behind = this.placedAt < s - 0.002;                         // walked past him
      const offscreen = !this.isOnScreen(camera);
      const tooFar = this.mode === 'gone' || (this.distance > ahead * 1.6 && offscreen);
      if (blink || (behind && offscreen) || tooFar) {
        this.relocate(s, ahead);
        this.mode = 'lurking';
      } else if (dark > 0.7 && this.distance > ahead) {
        // in full darkness he glides closer along the line to the walker
        const step = Math.min(this.distance - ahead, dt * 1.6);
        const dir = camera.position.clone().setY(0).sub(this.pos.clone().setY(0)).normalize();
        this.pos.addScaledVector(dir, step);
        this.pos.y = this.world.height(this.pos.x, this.pos.z);
        this.root.position.copy(this.pos);
      }
      this.root.visible = true;
    }
    this.wasDark = dark > 0.55;

    // always face the walker
    if (this.root.visible && this.mode !== 'scare' && this.mode !== 'passing') {
      const yaw = Math.atan2(camera.position.x - this.pos.x, camera.position.z - this.pos.z);
      this.root.rotation.y = yaw;
    }
    this.distance = this.root.visible ? Math.hypot(camera.position.x - this.pos.x, camera.position.z - this.pos.z) : Infinity;

    // pose layering driven by the hand
    const want = {
      Tilt: this.mode === 'scare' || (this.mode === 'staged' && this.stagedTilt) ? 1 : smooth(presence, 0.25, 0.6),
      Loom: this.mode === 'scare' ? 0.35 : Math.max(smooth(effThreat, 0.55, 0.95), this.mode === 'doorway' ? 1 : 0),
      Reach: Math.max(smooth(presence, 0.8, 1.0), this.mode === 'flash' || this.mode === 'scare' ? 1 : 0),
    };
    for (const k of Object.keys(this.w)) {
      this.w[k] += (want[k] - this.w[k]) * (1 - Math.exp(-dt * 3));
      this.actions[k].setEffectiveWeight(this.w[k]);
    }
    this.mixer.update(dt);
    this.scareTwitch(dt);
    // eyes shine whenever he's watching you from a distance
    // (eyeshine removed: an unlit, eyeless face in the dark is scarier)
    if (this.eyes) this.eyes.visible = false;
  }

  /** stand on the trail itself at path param sT, `off` metres to the side */
  standOnPath(sT, off = 0) {
    const W = this.world, p = W.path.getPointAt(sT), t = W.path.getTangentAt(sT);
    this.pos.set(p.x - t.z * off, 0, p.z + t.x * off);
    this.pos.y = W.height(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.placedAt = sT;
  }
  /** hide behind `tree` (seen from the camera) with half his body leaning out past the trunk */
  peekFrom(tree, camera, lateral = 0.42, lean = 0.2) {
    const c = camera.position;
    const dx = tree.x - c.x, dz = tree.z - c.z, d = Math.hypot(dx, dz);
    const ux = dx / d, uz = dz / d;                         // camera -> tree
    const side = Math.random() < 0.5 ? -1 : 1;
    const px = -uz * side, pz = ux * side;                  // sideways, the side he peeks out of
    this.pos.set(tree.x + ux * 0.6 + px * lateral, 0, tree.z + uz * 0.6 + pz * lateral);
    this.pos.y = this.world.height(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.placedAt = tree.s;
    // lean out: roll so his head moves toward the open side
    const yaw = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
    const lx = Math.cos(yaw), lz = -Math.sin(yaw);           // his local +X in world space
    this.root.rotation.set(0, yaw, -Math.sign(lx * px + lz * pz) * lean);
  }
  /** you hid: he comes down the trail toward you and (hopefully) keeps walking */
  startPass(s, side = Math.random() < 0.5 ? -1 : 1) {
    this.mode = 'passing';
    this.passS = Math.min(0.99, s + 13 / this.world.pathLen);
    this.passSide = side * 1.1;
    this.passDone = false;
    this.root.visible = true;
  }
  /** he stops and looks straight at you */
  noticeYou(s) {
    this.mode = 'lurking';
    this.placedAt = s + 0.01;
  }
  /** eyes shut: he circles the walker at radius r, angle a (world yaw around the camera) */
  circle(camera, a, r) {
    this.mode = 'circling';
    this.pos.set(camera.position.x + Math.sin(a) * r, 0, camera.position.z + Math.cos(a) * r);
    this.pos.y = this.world.height(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.visible = true;
  }
  /** camera flash: he is RIGHT behind the walker for a moment */
  flashBehind(camera, behindDir) {
    this.mode = 'flash';
    this.pos.copy(camera.position).addScaledVector(behindDir, 2.1);
    this.pos.y = this.world.height(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.visible = true;
  }
  /**
   * JUMPSCARE: his face, inches from the lens. The whole model is shifted so the head bone
   * lands at camera + forward*dist (offset a hair below centre so the eyes sit on the 2.39 frame).
   */
  /** twist the head bone so the face (bone +Z) points straight at `eye` (after the mixer has posed it) */
  aimHead(eye, roll = 0.35) {
    if (!this.head) return;
    const h = this.head, hp = new THREE.Vector3();
    h.updateWorldMatrix(true, false);
    hp.setFromMatrixPosition(h.matrixWorld);
    // full orientation: face (+Z) straight at the eye, crown (+Y) up, then a deliberate creepy head-tilt
    const Z = eye.clone().sub(hp).normalize();
    const X = new THREE.Vector3(0, 1, 0).cross(Z).normalize();
    const Y = Z.clone().cross(X);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    const pq = new THREE.Quaternion(); h.parent.getWorldQuaternion(pq);
    h.quaternion.copy(pq.invert().multiply(q));
    h.updateMatrixWorld(true);
  }
  scareAt(camera, dist = 0.62) {
    this.mode = 'scare';
    this.scareCam = camera;
    if (this.face) this.face.visible = true;
    this.w.Loom = 0.35; this.w.Reach = 1; this.w.Tilt = 1;
    for (const k of Object.keys(this.w)) this.actions[k].setEffectiveWeight(this.w[k]);
    this.mixer.update(0);
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const flat = fwd.clone().setY(0).normalize();
    const target = camera.position.clone().addScaledVector(fwd, dist);
    this.root.rotation.set(0, Math.atan2(-flat.x, -flat.z), 0);   // face back down the view ray
    this.root.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    if (!this.head) this.model.traverse((o) => { if (o.isBone && /DEF-head$/.test(o.name)) this.head = o; });
    const hp = new THREE.Vector3();
    // place, aim the face at the lens, re-place (aiming moves the face a little)
    for (let pass = 0; pass < 2; pass++) {
    if (pass) { this.root.position.set(0, 0, 0); this.root.updateMatrixWorld(true); }
    this.root.updateMatrixWorld(true);
    if (this.head) {
      // face centre = a little way up the head bone (bone +Y runs from neck to crown) and out the front
      this.head.getWorldPosition(hp);
      const e = this.head.matrixWorld.elements;
      const up = new THREE.Vector3(e[4], e[5], e[6]).normalize();
      const front = new THREE.Vector3(e[8], e[9], e[10]).normalize();
      hp.addScaledVector(up, this.faceUp ?? 0.11).addScaledVector(front, this.faceFront ?? 0);
    } else hp.set(0, 2.25, 0);
    this.root.position.copy(target).sub(hp);
    this.root.updateMatrixWorld(true);
    this.aimHead(camera.position);
    }
    this.pos.copy(this.root.position);
    this.root.visible = true;
    this.scareT = 0;
    this.scareFwd = fwd;
  }
  /** tiny violent twitch while the scare is on screen */
  scareTwitch(dt) {
    if (this.mode !== 'scare') return;
    this.scareT += dt;
    const j = 0.02 * Math.sin(this.scareT * 90) + (Math.random() - 0.5) * 0.015;
    this.root.position.copy(this.pos).addScaledVector(this.scareFwd, -this.scareT * 0.35 + j);   // lunges toward the lens
    this.root.rotation.z = (Math.random() - 0.5) * 0.012;
    this.root.updateMatrixWorld(true);
    this.aimHead(this.scareCam.position, 0.35 + Math.sin(this.scareT * 37) * 0.04);                 // the mixer re-posed him; keep the stare locked
  }
  vanish(cooldown = 8) {
    this.root.rotation.z = 0;
    if (this.face) this.face.visible = false;
    this.mode = 'gone';
    this.root.visible = false;
    this.cooldown = cooldown;
    this.placedAt = -1;
  }
  standInDoorway() {
    this.mode = 'doorway';
    this.pos.copy(this.world.doorway);
    this.root.position.copy(this.pos);
    this.root.visible = true;
  }
}
