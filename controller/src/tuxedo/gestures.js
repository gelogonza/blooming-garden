/**
 * Turns one physical button into several inputs.
 *  - clicks: counts presses, decides only after `gap` seconds of silence (so 1 / 2 / 3 clicks are distinct)
 *  - hold:   fires 'holdStart' WHILE still pressed (instant feedback), 'holdEnd' on release
 * Works on edges (press / release transitions), never on "is it pressed right now".
 */
export class ButtonGestures {
  constructor({ gap = 0.35, hold = 0.9 } = {}) {
    this.gap = gap; this.hold = hold;
    this.count = 0; this.down = false; this.downT = 0; this.lastUp = -1; this.held = false;
  }
  update(pressed, t) {
    let ev = null;
    if (pressed && !this.down) { this.down = true; this.downT = t; }                    // press edge
    if (pressed && !this.held && t - this.downT > this.hold) {                          // long press
      this.held = true; this.count = 0; ev = { type: 'holdStart' };
    }
    if (!pressed && this.down) {                                                        // release edge
      this.down = false;
      if (this.held) { this.held = false; ev = { type: 'holdEnd', dur: t - this.downT }; }
      else { this.count++; this.lastUp = t; }
    }
    if (!this.down && this.count && t - this.lastUp > this.gap) {                       // silence -> decide
      ev = { type: 'clicks', n: Math.min(this.count, 3) }; this.count = 0;
    }
    return ev;
  }
  reset() { this.count = 0; this.held = false; }
}
