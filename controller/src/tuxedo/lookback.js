import { smooth } from './noise.js';

/**
 * LOOKING BACK — the suspense ladder.
 * Every look = two layers:
 *   1. PUMPKINS: how many behind you are already facing you (grows with the act, and in Act III
 *      with every look; from just before Act IV on, all of them, every time)
 *   2. HIM: a scripted beat if you've walked far enough for the next one, otherwise a random
 *      "lurk" (peeking from behind a trunk, standing far down the trail) that gets likelier later.
 * Overdue scripted beats force the turn: a twig snaps behind you and your head turns on its own.
 */
export const BEATS = [
  { at: 0.31, kind: 'whip', force: true },        // lots of pumpkins staring... and your head SNAPS back forward
  { at: 0.39, kind: 'treeFar', force: true },     // him, far back, half behind a trunk
  { at: 0.48, kind: 'closer', force: true },      // him, on the trail ~9 m back, head tilted
  { at: 0.56, kind: 'scare', force: false },      // you turn... BANG
];
const ACT2 = 0.22, ACT3 = 0.5, PRE4 = 0.8;

export class LookBack {
  constructor({ world, sound, getTux, startScare, canScare }) {
    Object.assign(this, { world, sound, getTux, startScare, canScare });
    this.reset();
  }
  reset() { this.look = null; this.beat = 0; this.lastLookAt = -99; this.forceAt = -1; this.act3Looks = 0; this.lastLurk = ''; this.realNext = false; this.fakes = 0; this.hideFake(); }
  get active() { return !!this.look; }

  /** layer 1: how many pumpkins behind you are staring this time */
  stareCount(s) {
    if (s < ACT2) return 0;
    if (s < ACT3) return Math.round(2 + 7 * smooth(s, ACT2, ACT3));      // Act II: 2 -> 9 as you go
    if (s < PRE4) return 9 + 4 * this.act3Looks++;                       // Act III: +4 every time you look
    return 999;                                                          // just before Act IV, and all of Act IV: every one
  }

  /** layer 2: what HE does this time */
  decide(s) {
    const next = BEATS[this.beat];
    if (next && s >= next.at) { this.beat++; return next.kind; }
    // a fake-out last time? then this time it's really him, and closer
    if (this.realNext) { this.realNext = false; return s < 0.6 ? 'closer' : 'peekNear'; }
    if (!next && Math.random() < 0.1 && this.canScare(20)) return 'scare';
    // random lurks between (and after) the scripted beats
    const p = s < ACT2 ? 0 : s < 0.39 ? 0.3 : s < ACT3 ? 0.5 : 0.65;
    if (Math.random() > p) return 'nothing';
    const pool = s < 0.39 ? ['pathFar'] : s < 0.6 ? ['peek', 'pathFar', 'treeFar'] : ['peek', 'peekNear', 'pathFar', 'treeFar'];
    const options = pool.filter((k) => k !== this.lastLurk);
    const k = (options.length ? options : pool)[Math.floor(Math.random() * (options.length || pool.length))];
    this.lastLurk = k;
    return k;
  }

  start(t, s, camera, forced = false) {
    if (this.look) return;
    const kind = this.decide(s);
    this.look = {
      t: 0, kind, forced, fired: false,
      turn: forced ? 0.32 : 0.55,
      hold: kind === 'whip' ? 1.25 : kind === 'scare' ? 9 : 1.4,
      back: kind === 'whip' ? 0.16 : 0.5,
    };
    this.lastLookAt = t; this.forceAt = -1;
    let n = this.stareCount(s);
    if (kind === 'whip') n = Math.max(n, 8);
    if (n > 0) this.world.stareBehind(camera, n, 55);
    // no clear tree to hide by? he stands on the trail instead, so the sound never lies
    if (kind !== 'nothing' && kind !== 'whip' && kind !== 'scare' && !this.stage(kind, s, camera)) {
      this.look.kind = 'pathFar';
      this.stage('pathFar', s, camera);
    }
    // FAKE-OUT: sometimes the shape behind you is just the scarecrow (never on a forced/scripted turn, never twice in a row)
    const lurk = ['pathFar', 'treeFar', 'peek', 'closer'].includes(this.look.kind);
    if (lurk && !forced && s > ACT2 && !this.realNext && this.fakes < 3 && Math.random() < 0.3) this.fakeOut(camera);
  }

  /** swap him for a scarecrow standing exactly where he would have been */
  fakeOut(camera) {
    const tux = this.getTux(), src = this.world.scarecrow;
    if (!tux || !src) return;
    if (!this.fake) { this.fake = src.clone(true); this.world.scene.add(this.fake); }
    const p = tux.root.position;
    this.fake.position.set(p.x, p.y - 0.15, p.z);                       // sunk a touch: no pole socket out here
    this.fake.rotation.set(0, Math.atan2(camera.position.x - p.x, camera.position.z - p.z), 0.04);   // facing you, slightly crooked
    this.fake.visible = true;
    tux.mode = 'staged'; tux.root.visible = false;                  // frozen out of sight until you look forward again
    this.look.fake = true; this.realNext = true; this.fakes++;
  }
  hideFake() { if (this.fake) this.fake.visible = false; }

  /** put him in place behind you before the camera gets there */
  stage(kind, s, camera) {
    const W = this.world, tux = this.getTux(), L = W.pathLen;
    if (!tux) return;
    const rnd = (a, b) => a + Math.random() * (b - a);
    let ok = true;
    if (kind === 'treeFar') {                                                         // standing beside a trunk, ~13-19 m back
      const tree = this.peekTree(s, camera, [13, 19]);
      if (tree) tux.peekFrom(tree, camera, 0.62, 0); else ok = false;
    } else if (kind === 'closer') tux.relocate(Math.max(0, s - 13.5 / L), 4.5);          // on the trail ~9 m back
    else if (kind === 'pathFar') tux.standOnPath(Math.max(0, s - rnd(18, 25) / L), rnd(-0.4, 0.4));   // a shape far down the trail (inside the beam's reach)
    else if (kind === 'peek' || kind === 'peekNear') {
      const tree = this.peekTree(s, camera, kind === 'peek' ? [9, 15] : [5, 8.5]);
      if (tree) tux.peekFrom(tree, camera); else ok = false;
    } else ok = false;
    if (!ok) return false;
    tux.mode = 'staged';
    tux.stagedTilt = kind === 'closer' || kind === 'peek' || kind === 'peekNear';
    tux.root.visible = true;
    return true;
  }

  /** a trunk behind you, close to the trail, roughly in line with where you'll be looking */
  peekTree(s, camera, [dMin, dMax]) {
    const W = this.world, c = camera.position;
    const f = { x: -Math.sin(camera.rotation.y), z: -Math.cos(camera.rotation.y) };   // current forward; we look the opposite way
    const cands = W.hideTrees.filter((tr) => {
      const dx = tr.x - c.x, dz = tr.z - c.z, d = Math.hypot(dx, dz);
      if (d < dMin || d > dMax || tr.d > 6) return false;
      const cosBack = -(dx * f.x + dz * f.z) / d;            // 1 = dead behind you
      return cosBack > (dMax < 10 ? 0.8 : 0.9);              // within ~25 deg of centre (wider for close trees)
    }).filter((tr) => {
      // nothing else in the way: no other trunk within 0.8 m of the sight line
      const ex = tr.x - c.x, ez = tr.z - c.z, len2 = ex * ex + ez * ez;
      return !W.hideTrees.some((o) => {
        if (o === tr) return false;
        const k = ((o.x - c.x) * ex + (o.z - c.z) * ez) / len2;
        if (k <= 0.05 || k >= 0.97) return false;
        return Math.hypot(c.x + ex * k - o.x, c.z + ez * k - o.z) < 0.8;
      });
    });
    return cands[Math.floor(Math.random() * cands.length)];
  }

  /** returns the extra yaw (0..PI) to add to the camera */
  update(dt, t, { s, camera, paused, blocked }) {
    const next = BEATS[this.beat];
    if (!this.look && !blocked && next?.force && s >= next.at + 0.03 && t - this.lastLookAt > 14) {
      if (this.forceAt < 0) { this.forceAt = t + 0.75; this.sound.twig(); }
      else if (t >= this.forceAt) this.start(t, s, camera, true);
    }
    if (!this.look) return 0;
    const L = this.look;
    if (!paused) L.t += dt;
    const f = L.t, endHold = L.turn + L.hold;

    if (!L.fired && f >= L.turn) {                           // the moment the view lands
      L.fired = true;
      if (L.kind === 'closer' || L.kind === 'peekNear') this.sound.sting();
      if (L.kind === 'treeFar' || L.kind === 'peek') this.sound.hit();
      if (L.kind === 'scare') this.startScare(0, 'look');
      // pathFar: no sound at all. You might not even notice him.
    }
    if (L.kind === 'whip' && f >= endHold && !L.whipped) { L.whipped = true; this.sound.sting(); }
    if (L.kind === 'scare' && L.fired && !paused) L.hold = Math.min(L.hold, f - L.turn + 0.2);
    const tux = this.getTux();
    if (f > endHold && tux?.mode === 'staged') tux.vanish(5);          // gone when you look forward again
    if (f > endHold && L.fake) this.hideFake();                        // ...and so is the scarecrow

    const k = f < L.turn ? smooth(f, 0, L.turn) : f < endHold ? 1 : 1 - smooth(f, endHold, endHold + L.back);
    if (f > endHold + L.back) this.look = null;
    return Math.PI * k;
  }
}
