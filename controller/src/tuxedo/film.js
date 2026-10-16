// 1980s slasher-film grade, applied after tone mapping (display space).
// 1980s slasher-film grade + VHS tape damage, applied after tone mapping (display space).
export const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1.6 },
    uInterference: { value: 0 },   // 0..1 how close he is -> tape damage builds
    uGlitch: { value: 0 },         // 0..1 short violent spikes (jumpscares, blinks)
    uFlash: { value: 0 },          // camera flash white-out
    uFade: { value: 0 },           // 0 visible .. 1 black (cuts, ending, strobe)
    uRed: { value: 0 },            // blood-red push when he's right there
    uEyes: { value: 0 },
    uBars: { value: 1 },           // 0 = full frame (menu) .. 1 = 2.39:1 letterbox (in game)
    uMenu: { value: 0 },           // crimson title-screen grade           // 0 open .. 1 shut (eyelids close from top and bottom)
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uInterference, uGlitch, uFlash, uFade, uRed, uEyes, uBars, uMenu;
    varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(float x) { float i = floor(x), f = fract(x); return mix(rnd(vec2(i, 1.7)), rnd(vec2(i + 1.0, 1.7)), f * f * (3.0 - 2.0 * f)); }

    void main() {
      vec2 uv = vUv;
      // baseline tape wear is always there; he makes it worse; scares max it out
      float calm = 1.0 - uMenu * 0.85;                            // title screen: a clean(er) picture so the b-roll reads
      float I = clamp(uInterference, 0.0, 1.0) * calm;              // 0 when he's not around: clean film
      float G = clamp(uGlitch, 0.0, 1.0) * mix(1.0, 0.45, uMenu);
      float D = clamp(I * I * 0.8 + G, 0.0, 1.5);                 // total damage
      float tf = floor(uTime * 24.0);                              // 24 fps "frame" clock

      float barH = max(0.0, (1.0 - uAspect / 2.39) * 0.5) * uBars;
      if (uv.y < barH || uv.y > 1.0 - barH) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

      // ── tracking roll bar: a wide band of noise crawling up the frame
      float rollY = fract(uTime * (0.07 + D * 0.25));
      float roll = smoothstep(0.09 + D * 0.08, 0.0, abs(uv.y - rollY)) * smoothstep(0.05, 0.35, D);   // tracking bar only when he's near

      // ── multi-scale tear bands: thin slivers + fat slabs, sideways shove
      float thin = step(0.975 - D * 0.18, rnd(vec2(floor(uv.y * 160.0), tf)));
      float fat  = step(0.93 - D * 0.35, rnd(vec2(floor(uv.y * 14.0), floor(uTime * 9.0))));
      float slab = step(0.85 - G * 0.6, rnd(vec2(floor(uv.y * 5.0), floor(uTime * 15.0)))) * G;
      float shove = (thin * 0.03 + fat * 0.09 + slab * 0.25 + roll * 0.02) * D;
      uv.x += (rnd(vec2(tf, floor(uv.y * 40.0))) - 0.5) * shove;
      // slow wavy skew (head-switching wobble at the bottom of the frame)
      uv.x += sin(uv.y * 30.0 + uTime * 4.0) * 0.0015 * D + smoothstep(0.12, 0.0, uv.y - barH) * (vn(uTime * 20.0) - 0.5) * 0.04 * D;
      // vertical hop
      uv.y += (rnd(vec2(tf, 3.0)) - 0.5) * 0.006 * D + step(0.97, rnd(vec2(floor(uTime * 6.0), 9.0))) * 0.03 * G;

      // ── macroblocks: chunks of the picture freeze / slide like a corrupt tape
      vec2 blk = floor(uv * vec2(24.0, 14.0));
      float bHit = step(0.985 - G * 0.25 - D * 0.02, rnd(blk + floor(uTime * 12.0)));
      uv += bHit * (vec2(rnd(blk + 1.3), rnd(blk + 7.1)) - 0.5) * 0.08;

      // gate weave
      uv += vec2(sin(uTime * 1.3) * 0.0006, sin(uTime * 2.1) * 0.0008);
      uv = clamp(uv, vec2(0.0, barH), vec2(1.0, 1.0 - barH));

      // ── chroma: radial split + horizontal chroma bleed (VHS smears colour to the right)
      vec2 c = uv - 0.5;
      float ca = 0.002 + D * 0.018;
      float bleed = 0.003 + D * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca + vec2(bleed, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca - vec2(bleed * 0.6, 0.0)).b;
      vec3 smear = (texture2D(tDiffuse, uv + vec2(bleed * 1.5, 0.0)).rgb + texture2D(tDiffuse, uv + vec2(bleed * 3.0, 0.0)).rgb) * 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = vec3(l) + mix(col - vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), smear - vec3(dot(smear, vec3(0.2126, 0.7152, 0.0722))), 0.5);

      // ── grade: teal shadows, warm highlights
      col = mix(col * vec3(0.85, 0.95, 1.12), col * vec3(1.12, 0.98, 0.82), smoothstep(0.25, 0.75, l));
      col = mix(vec3(l), col, 1.08);

      // ── tone damage: tinted bands (magenta / green / cyan) + channel swaps
      float tb = rnd(vec2(floor(uv.y * 22.0), floor(uTime * 8.0)));
      float tint = step(0.96 - D * 0.22, tb);
      vec3 tones[3];
      tones[0] = vec3(1.25, 0.45, 1.15);   // magenta
      tones[1] = vec3(0.45, 1.3, 0.55);    // sick green
      tones[2] = vec3(0.4, 1.1, 1.35);     // cyan
      int ti = int(mod(floor(tb * 97.0), 3.0));
      vec3 tone = ti == 0 ? tones[0] : (ti == 1 ? tones[1] : tones[2]);
      col = mix(col, col * tone + tone * 0.06, tint * min(1.0, D));
      float swap = step(0.97 - G * 0.3, rnd(vec2(floor(uv.y * 9.0), floor(uTime * 20.0))));
      col = mix(col, col.brg * 1.2, swap * G);
      // posterize under heavy damage
      float steps = mix(64.0, 5.0, G * 0.8);
      col = mix(col, floor(col * steps) / steps, step(0.01, G));

      col = mix(col, col * vec3(1.45, 0.45, 0.4), uRed * 0.7);
      // title screen: near-monochrome crimson, crushed blacks (Granny / Hellraiser key art)
      float lm = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(lm * 1.75, lm * 0.3, lm * 0.24) * smoothstep(0.0, 0.9, lm * 1.6), uMenu * 0.72);

      // ── noise: snow, roll-bar static, line sparks, grain, scanlines
      float snow = rnd(vec2(uv.x * 640.0 + uTime * 37.0, uv.y * 360.0 - uTime * 91.0));
      col = mix(col, vec3(snow), clamp(I * I * 0.42 + roll * I * 0.6 + G * 0.07, 0.0, 0.6) * (1.0 - G * 0.45));
      float row = floor(uv.y * 300.0), x0 = rnd(vec2(tf, row));
      float spark = min(1.0, D * 4.0) * step(0.996 - D * 0.012, rnd(vec2(row, tf))) * step(x0, uv.x) * step(uv.x, x0 + 0.02 + rnd(vec2(tf + 1.0, row)) * 0.1);
      col += spark * vec3(0.9, 0.95, 1.0);
      float grain = (rnd(uv * 913.0 + fract(uTime * 7.0)) - 0.5) * (0.07 + D * 0.27) * mix(1.0, 0.35, uMenu);   // fine film grain, heavier near him
      col += grain * (0.45 + l);
      col *= 1.0 - 0.1 * calm * (0.5 - 0.5 * sin(uv.y * 900.0 + uTime * 30.0));   // scanlines
      col *= 1.0 - roll * 0.25 * (1.0 - D * 0.5);   // (roll is already 0 when he's far)                  // the roll bar dims the picture under it

      // vignette + scratches
      col *= smoothstep(1.05, 0.25, length(c * vec2(1.0, 0.8)));
      col += step(0.9985, rnd(vec2(floor(uv.x * 400.0), floor(uTime * 12.0)))) * 0.25 * calm;

      col = mix(col, vec3(1.0), uFlash);
      // eyelids: close from top and bottom, faint warm blood-glow through the skin
      float lidOpen = (1.0 - uEyes) * 0.5;
      float lid = smoothstep(lidOpen - 0.04, lidOpen + 0.02, abs(vUv.y - 0.5));
      col = mix(col, vec3(0.025, 0.004, 0.003), max(lid, uEyes * uEyes));
      col *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

/** Title cards / subtitles rendered in the letterbox, 80s serif style. */
export class Cards {
  constructor() {
    const el = document.createElement('div');
    el.id = 'cards';
    el.innerHTML = '<div class="card-main"></div><div class="card-sub"></div>';
    document.body.appendChild(el);
    this.el = el;
    this.main = el.querySelector('.card-main');
    this.sub = el.querySelector('.card-sub');
  }
  show(main, sub = '', hold = 3.5) {
    this.main.textContent = main;
    this.sub.textContent = sub;
    this.el.classList.add('on');
    clearTimeout(this.timer);
    if (hold > 0) this.timer = setTimeout(() => this.hide(), hold * 1000);
  }
  hide() { this.el.classList.remove('on'); }
}
