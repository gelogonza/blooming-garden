// The physical side of him: the NeoPixel is a jack-o'-lantern on your desk, the servo is a prop that twitches.
// Each frame we decide what the LED colour and servo angle SHOULD be, then send only real changes,
// throttled, so the serial line (115200 baud) never floods.
//
//   LED   calm: a warm candle flicker      he's close / threat rising: bleeds toward red
//         hiding: a slow red heartbeat     eyes shut: almost out
//         jumpscare: white strobe, then deep red     torch off / ending: dark
//   SERVO rests at 90°. Every time he relocates while you're not looking: a sharp twitch.
//         On a jumpscare it snaps hard to one side and creeps back.

const REST = 90;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class HardwareFX {
  constructor(send) {
    this.send = send;                 // (line) => void   e.g. serial.send
    this.enabled = false;
    this.lastLed = [-99, -99, -99]; this.lastLedAt = 0;
    this.lastServo = -1; this.lastServoAt = 0;
    this.twitch = null;               // { t0, dir }
    this.lastPos = null;
  }

  /** call when the board becomes ready / disconnects */
  setEnabled(on) {
    this.enabled = on;
    this.lastLed = [-99, -99, -99]; this.lastServo = -1; this.lastPos = null;
    if (on) { this.send(`C:0,0,0`); this.send(`S:${REST}`); }
  }

  /** put the prop to rest (title screen, after the ending) */
  rest() { this.twitch = null; }

  /**
   * @param {number} t     elapsed seconds
   * @param {object} st    { playing, threat, presence, hideK, eyesK, torchOff, ending, scare, tux }
   *   scare = null | { t, windup, hit }  (main.js's live scare object)
   */
  update(t, st) {
    if (!this.enabled) return;

    // ── did he just move? (a jump of more than 2 m between frames = a relocation, not a walk) ──
    const tux = st.tux;
    if (tux && st.playing) {
      const p = tux.pos;
      if (this.lastPos && !st.scare && tux.root.visible) {
        const dx = p.x - this.lastPos.x, dz = p.z - this.lastPos.z;
        if (dx * dx + dz * dz > 4 && !this.twitch) this.twitch = { t0: t, dir: Math.random() < 0.5 ? -1 : 1, big: false };
      }
      this.lastPos = { x: p.x, z: p.z };
    }
    if (st.scare?.hit && !this.twitch?.big) this.twitch = { t0: t, dir: 1, big: true };

    // ── servo angle ──
    let angle = REST;
    if (this.twitch) {
      const k = t - this.twitch.t0;
      if (this.twitch.big) angle = k < 0.15 ? REST + 75 : k < 2.5 ? lerp(REST + 75, REST, (k - 0.15) / 2.35) : REST;
      else angle = k < 0.12 ? REST + 28 * this.twitch.dir : k < 0.25 ? REST - 10 * this.twitch.dir : REST;
      if (k > (this.twitch.big ? 2.5 : 0.3)) this.twitch = null;
    }
    angle = Math.round(angle);
    if (angle !== this.lastServo && t - this.lastServoAt > 0.06) {
      this.send(`S:${angle}`); this.lastServo = angle; this.lastServoAt = t;
    }

    // ── LED colour ──
    let rgb;
    if (!st.playing) {
      const f = 0.55 + 0.25 * Math.sin(t * 1.3);                       // title screen: a slow ember
      rgb = [150 * f, 45 * f, 0];
    } else if (st.ending || st.torchOff) {
      rgb = [0, 0, 0];
    } else if (st.scare && st.scare.hit) {
      rgb = (t * 14) % 1 < 0.5 ? [255, 255, 255] : [120, 0, 0];          // strobe
      if (st.scare.t > st.scare.windup + 0.9) rgb = [140, 0, 0];         // ...then deep red
    } else if (st.scare) {
      rgb = [0, 0, 0];                                                   // wind-up: the candle dies first
    } else {
      // candle flicker: two incommensurate sines + a little noise
      const flick = 0.75 + 0.15 * Math.sin(t * 9.1) + 0.1 * Math.sin(t * 23.7) + 0.08 * (Math.random() - 0.5);
      const red = clamp01(Math.max(st.threat, st.presence * 0.8));       // closer = redder
      rgb = [255 * flick, lerp(110, 10, red) * flick, 0];
      if (st.hideK > 0.1) {                                             // holding your breath: heartbeat
        const beat = Math.pow(Math.max(0, Math.sin(t * 7)), 8);
        rgb = rgb.map((c, i) => lerp(c, i === 0 ? 40 + 200 * beat : 0, st.hideK));
      }
      if (st.eyesK > 0.05) rgb = rgb.map((c) => c * (1 - 0.9 * st.eyesK));
    }
    rgb = rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))));
    const moved = rgb.some((c, i) => Math.abs(c - this.lastLed[i]) > 4);
    if (moved && t - this.lastLedAt > 0.04) {
      this.send(`C:${rgb.join(',')}`); this.lastLed = rgb; this.lastLedAt = t;
    }
  }
}
