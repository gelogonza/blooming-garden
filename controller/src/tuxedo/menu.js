/**
 * Title screen in the survival-horror tradition (Resident Evil / Silent Hill):
 *   PRESS ANY BUTTON gate -> quiet menu with a red selection bar, grain, drifting fog,
 *   the live woods behind it washed out. NEW GAME cuts to black, then the game fades in.
 */
// the controls, written as a note someone left in the woods (typewritten, with a pen scrawl)
const line = (k, v) => `<li><span class="k">${k}</span><span class="dots"></span><span class="v">${v}</span></li>`;
const CONTROLS = `
  <div class="tape"></div>
  <div class="note-head">HOLLOW RD. — OCT 31</div>
  <ul>
    ${line('W / S', 'walk on / back away')}
    ${line('SHIFT', 'run. he hears it.')}
    ${line('A / D', 'look around')}
    ${line('ALT or C', 'hide. hold your breath.')}
    ${line('SPACE', 'look behind you')}
    ${line('SPACE SPACE', 'flashlight off / on')}
    ${line('SPACE ×3', 'call out')}
    ${line('E', 'close your eyes. you can still shuffle forward.')}
  </ul>
  <div class="note-head">the box</div>
  <ul>
    ${line('light', 'the moon. cover it, eyes shut.')}
    ${line('distance', 'your hand, in the dark')}
    ${line('button', 'same as space')}
  </ul>
  <div class="scrawl">he only moves when you're not looking</div>`;

/** split a word into letters that sit slightly crooked, like hand-set type */
const crooked = (word, seed) => [...word].map((c, i) => {
  const r = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453, f = r - Math.floor(r);
  const rot = (f - 0.5) * 3.2, dy = (Math.sin(f * 40) * 0.035).toFixed(3);
  const cls = c === 'X' ? ' class="x"' : '';
  return `<i${cls} style="transform: translateY(${dy}em) rotate(${rot.toFixed(2)}deg)">${c}</i>`;
}).join('');

export class Menu {
  constructor({ sound, onStart, onConnect, serialOK, save }) {
    Object.assign(this, { sound, onStart, onConnect, save });
    const el = (this.el = document.createElement('div'));
    el.id = 'title';
    el.innerHTML = `
      <canvas class="t-grain" width="320" height="180"></canvas>
      <div class="t-fog f1"></div><div class="t-fog f2"></div>
      <div class="t-inner">
        <svg width="0" height="0" style="position:absolute"><filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
        </filter></svg>
        <div class="t-logo-wrap"><h1 class="t-logo"><span class="the">${crooked('THE', 1)}</span><span class="l1">${crooked('TUXEDO', 2)}</span><span class="l2">${crooked('MAN', 3)}</span></h1></div>
        <nav class="t-menu">
          ${save ? `<button data-act="load">LOAD GAME <small>${save.label}</small></button>` : ''}
          <button data-act="start">NEW GAME</button>
          <button data-act="controls">CONTROLS</button>
          <button data-act="connect"${serialOK ? '' : ' disabled title="Web Serial needs Chrome or Edge"'}>CONNECT ARDUINO</button>
        </nav>
        <div class="t-status"></div>
        <div class="t-dim"></div>
        <div class="t-controls">${CONTROLS}</div>
      </div>
      <div class="t-press">PRESS ANY BUTTON</div>
      <div class="t-black"></div>`;
    document.body.appendChild(el);
    this.items = [...el.querySelectorAll('.t-menu button')];
    this.sel = 0; this.stage = 'press'; this.done = false;

    // input: any key / click opens the menu; then arrows/W/S + Enter/Space
    this.onKey = (e) => this.key(e);
    addEventListener('keydown', this.onKey, true);
    el.addEventListener('pointerdown', () => { if (this.stage === 'press') this.open(); });
    this.items.forEach((b, i) => {
      b.addEventListener('pointerenter', () => this.select(i));
      b.addEventListener('click', () => this.activate(i));
    });
    this.select(0, true);
    this.grain();
    el.querySelector('.t-dim').addEventListener('click', () => this.note(false));
    el.querySelector('.t-controls').addEventListener('click', () => this.note(false));
    // music from the moment the page loads (plays immediately where the browser allows autoplay,
    // otherwise on the very first interaction)
    this.sound.start();
    this.sound.menuMusic(true);
  }

  key(e) {
    if (this.done) return;
    e.preventDefault(); e.stopPropagation();          // the menu owns the keyboard until the game starts
    if (this.stage === 'press') return this.open();
    if (this.stage !== 'menu') return;
    const k = e.code;
    if (k === 'ArrowUp' || k === 'KeyW') this.select(this.prev(this.sel));
    else if (k === 'ArrowDown' || k === 'KeyS') this.select(this.next(this.sel));
    else if (k === 'Enter' || k === 'Space') this.activate(this.sel);
    else if (k === 'Escape' || k === 'Backspace') this.note(false);
  }
  /** show / hide the controls note (centre screen, room dimmed) */
  note(on) {
    this.el.classList.toggle('reading', on);
    this.el.querySelector('.t-controls').classList.toggle('open', on);
  }
  next(i) { let j = i; do { j = (j + 1) % this.items.length; } while (this.items[j].disabled && j !== i); return j; }
  prev(i) { let j = i; do { j = (j - 1 + this.items.length) % this.items.length; } while (this.items[j].disabled && j !== i); return j; }

  open() {
    this.sound.start();                               // first user gesture: audio may begin (the woods behind the menu)
    this.sound.menuMusic(true);
    this.stage = 'menu';
    this.el.classList.add('menu-open');
  }
  select(i, silent = false) {
    if (this.items[i].disabled) return;
    this.sel = i;
    this.items.forEach((b, j) => b.classList.toggle('on', j === i));
  }
  activate(i) {
    if (this.stage !== 'menu' || this.items[i].disabled) return;
    const act = this.items[i].dataset.act;
    if (act === 'start' || act === 'load') {
      this.stage = 'starting';
      this.sound.uiConfirm(true);
      this.sound.menuMusic(false);                    // the music box winds down as the screen goes black
      this.el.classList.add('starting');              // cut to black...
      setTimeout(() => { this.finish(); this.onStart(act === 'load'); }, 1600);
    } else if (act === 'controls') {
      this.sound.uiMove();
      this.note(!this.el.classList.contains('reading'));
    } else if (act === 'connect') {
      this.sound.uiMove();
      this.onConnect();                               // must stay inside this click/key gesture for Web Serial
    }
  }
  finish() {
    this.done = true;
    removeEventListener('keydown', this.onKey, true);
    this.el.classList.add('gone');                    // black holds, then fades out over the opening shot
    setTimeout(() => this.el.remove(), 4000);
  }
  /** skip straight into the game (?go / ?at) */
  skip() { this.done = true; removeEventListener('keydown', this.onKey, true); this.sound.menuMusic(false); this.el.remove(); }

  status(text) { const s = this.el.querySelector('.t-status'); if (s) s.textContent = text; }
  setConnected(on) { const b = this.el.querySelector('[data-act=connect]'); if (b) b.textContent = on ? 'DISCONNECT ARDUINO' : 'CONNECT ARDUINO'; }

  /** animated film grain (cheap: tiny canvas, scaled up) */
  grain() {
    const c = this.el.querySelector('.t-grain'), g = c.getContext('2d'), img = g.createImageData(c.width, c.height);
    const loop = () => {
      if (!this.el.isConnected) return;
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      setTimeout(() => requestAnimationFrame(loop), 42);   // ~24 fps, like film
    };
    loop();
  }
}
