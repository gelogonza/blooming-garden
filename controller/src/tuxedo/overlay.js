// Full-screen VHS-style prompts: the death screen ("HE FOUND YOU / CONTINUE?") and the sensor check before Act I.
// Plain DOM over the canvas; styles are inline so it doesn't depend on style.css.

export class Overlay {
  constructor() {
    const el = document.createElement('div');
    el.id = 'vhs-overlay';
    Object.assign(el.style, {
      position: 'fixed', inset: '0', zIndex: '40', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '14px', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 0.5s', textAlign: 'center',
      fontFamily: "'Special Elite', ui-monospace, monospace", color: '#e8e2d6',
    });
    el.innerHTML = `
      <div data-k="tag" style="position:absolute;top:28px;left:34px;font-size:clamp(14px,1.5vw,20px);letter-spacing:.2em;color:#e8e2d6;text-shadow:2px 0 #c0392b,-2px 0 #2a7fff"></div>
      <div data-k="main" style="font-size:clamp(24px,3.6vw,52px);letter-spacing:.14em;text-shadow:3px 0 rgba(192,57,43,.8),-3px 0 rgba(42,127,255,.6)"></div>
      <div data-k="sub" style="font-size:clamp(13px,1.4vw,18px);letter-spacing:.4em;color:#c06a30;text-transform:uppercase"></div>
      <div data-k="hint" style="margin-top:22px;font-size:clamp(12px,1.1vw,15px);letter-spacing:.25em;color:#8d877c;animation:vhsblink 1.2s steps(2) infinite"></div>`;
    const kf = document.createElement('style');
    kf.textContent = '@keyframes vhsblink{50%{opacity:0}}';
    document.head.appendChild(kf);
    document.body.appendChild(el);
    this.el = el;
    this.k = Object.fromEntries([...el.querySelectorAll('[data-k]')].map((n) => [n.dataset.k, n]));
    this.shown = false;
  }
  /** black = cover the scene completely (death); false = see-through dim (calibration) */
  show({ tag = '', main = '', sub = '', hint = '', black = true }) {
    Object.assign(this.k, {});
    this.k.tag.textContent = tag; this.k.main.textContent = main; this.k.sub.textContent = sub; this.k.hint.textContent = hint;
    this.el.style.background = black ? '#050505' : 'rgba(0,0,0,0.62)';
    this.el.style.opacity = '1'; this.shown = true;
  }
  hint(text) { this.k.hint.textContent = text; }
  hide() { this.el.style.opacity = '0'; this.shown = false; }
}
