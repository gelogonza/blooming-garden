// Fully procedural soundscape (Web Audio): nothing to download.
export class Sound {
  constructor() { this.ready = false; }

  start() {
    if (this.ready) return;
    const ac = (this.ac = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ac.createGain(); this.master.gain.value = 0.9; this.master.connect(ac.destination);
    // shared white-noise buffer
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const loopNoise = () => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // wind: band-passed noise with a slow swell
    const wind = loopNoise(), wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 1.4;
    const wlp = ac.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 650;
    this.windGain = ac.createGain(); this.windGain.gain.value = 0;
    wind.connect(wf).connect(wlp).connect(this.windGain).connect(this.master);
    this.windFilter = wf;

    // static: high-passed noise, scaled by interference
    const st = loopNoise(), sf = ac.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 2500;
    this.staticGain = ac.createGain(); this.staticGain.gain.value = 0;
    st.connect(sf).connect(this.staticGain).connect(this.master);

    // dread drone: two detuned low saws through a lowpass
    this.droneGain = ac.createGain(); this.droneGain.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    for (const f of [43.6, 46.2, 65.4]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    lp.connect(this.droneGain).connect(this.master);

    this.crickets = 1; this.heart = 0; this.nextChirp = 0; this.nextBeat = 0;
    this.ready = true;
    // browsers start audio "suspended" until the user interacts with the page (autoplay policy).
    // Everything above is already scheduled, so the first click / key / touch anywhere just un-pauses it.
    if (ac.state !== 'running') {
      const unlock = () => { ac.resume(); if (ac.state === 'running') ['pointerdown', 'keydown', 'touchstart'].forEach((e) => removeEventListener(e, unlock, true)); };
      ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, unlock, true));
    }
  }

  // ── one-shots ──
  env(node, t0, a, peak, dec) { const g = this.ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); node.connect(g); return g; }
  noiseBurst(t0, freq, q, peak, dec, type = 'bandpass') {
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); this.env(f, t0, 0.005, peak, dec).connect(this.master);
    s.start(t0, Math.random()); s.stop(t0 + dec + 0.1);
  }
  footstep() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.noiseBurst(t, 900 + Math.random() * 600, 0.8, 0.22, 0.12);          // leaf crunch
    this.noiseBurst(t + 0.02, 180, 1.2, 0.18, 0.09, 'lowpass');              // heel thud
  }
  chirp(t) {
    const o = this.ac.createOscillator(); o.type = 'sine'; o.frequency.value = 4300 + Math.random() * 300;
    this.env(o, t, 0.004, 0.035 * this.crickets, 0.04).connect(this.master);
    o.start(t); o.stop(t + 0.08);
  }
  heartbeat(t) {
    for (const [dt, a] of [[0, 1], [0.22, 0.7]]) {
      const o = this.ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      this.env(o, t + dt, 0.01, 0.5 * a * this.heart, 0.18).connect(this.master);
      o.start(t + dt); o.stop(t + dt + 0.3);
    }
  }
  sting() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    for (const f of [233, 247, 277, 311, 466]) {
      const o = this.ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01);
      o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 2);
      this.env(o, t, 0.01, 0.07, 2.2).connect(this.master); o.start(t); o.stop(t + 2.5);
    }
    this.noiseBurst(t, 3000, 0.3, 0.5, 0.6);
  }
  flash() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.noiseBurst(t, 5000, 0.5, 0.25, 0.08, 'highpass');                   // shutter clack
    const o = this.ac.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(2200, t + 0.05); o.frequency.exponentialRampToValueAtTime(5200, t + 0.5);
    this.env(o, t + 0.05, 0.02, 0.02, 0.5).connect(this.master); o.start(t + 0.05); o.stop(t + 0.6);   // flash recharge whine
  }
  creak() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t);
    for (let k = 1; k < 12; k++) o.frequency.linearRampToValueAtTime(70 + Math.random() * 60, t + k * 0.25);
    const f = this.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
    o.connect(f); this.env(f, t, 0.2, 0.18, 3).connect(this.master); o.start(t); o.stop(t + 3.3);
  }
  hit() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.5);
    this.env(o, t, 0.005, 0.9, 2.5).connect(this.master); o.start(t); o.stop(t + 3);
    this.noiseBurst(t, 200, 0.5, 0.4, 1.2, 'lowpass');
  }


  /** pre-scare: everything drops out for a beat so the hit lands harder */
  duck(seconds = 0.9) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.05, t + 0.12);
    this.duckUntil = t + seconds;
  }
  /** the jumpscare: distorted detuned screech + noise blast + sub hit */
  scream() {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    this.duckUntil = 0;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(1.0, t);
    this.master.gain.setTargetAtTime(0.9, t + 1.6, 0.4);
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 6); }
    shaper.curve = curve;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const out = this.env(hp, t, 0.004, 0.32, 1.5); out.connect(this.master);
    shaper.connect(hp);
    for (const [f, type] of [[740, 'sawtooth'], [783, 'sawtooth'], [1108, 'square'], [1480, 'sawtooth'], [370, 'square']]) {
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 1.4);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 23 + Math.random() * 9; lg.gain.value = f * 0.04;
      lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.6);   // tremble
      o.connect(shaper); o.start(t); o.stop(t + 1.6);
    }
    this.noiseBurst(t, 2500, 0.4, 0.9, 0.9);           // static blast
    this.noiseBurst(t, 6000, 0.3, 0.5, 0.4, 'highpass');
    this.hit();
  }


  /** a source at `pan` (-1 left .. 1 right): returns a node to connect into */
  panned(pan, gain = 1) {
    const g = this.ac.createGain(); g.gain.value = gain;
    const pn = this.ac.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(pn).connect(this.master); return g;
  }
  /** flashlight switch */
  click() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.noiseBurst(t, 3500, 2, 0.35, 0.025, 'bandpass');
    this.noiseBurst(t + 0.05, 2200, 2, 0.2, 0.02, 'bandpass');
  }
  /** "Hello?" — two formant-filtered vowels with a long echo off the trees */
  callOut() {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    const echo = ac.createDelay(1.5); echo.delayTime.value = 0.42;
    const fb = ac.createGain(); fb.gain.value = 0.45;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    echo.connect(lp).connect(fb).connect(echo); lp.connect(this.master);
    const voice = ac.createGain(); voice.connect(this.master); voice.connect(echo);
    // [start, dur, pitch start, pitch end, formants]
    for (const [t0, d, f0, f1, F] of [[0, 0.22, 165, 175, [530, 1840]], [0.24, 0.5, 180, 230, [570, 840]]]) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t + t0); o.frequency.linearRampToValueAtTime(f1, t + t0 + d);
      const g = ac.createGain(); g.gain.setValueAtTime(0, t + t0); g.gain.linearRampToValueAtTime(0.22, t + t0 + 0.04);
      g.gain.setValueAtTime(0.22, t + t0 + d - 0.08); g.gain.linearRampToValueAtTime(0, t + t0 + d);
      for (const f of F) { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 8; o.connect(bp).connect(g); }
      g.connect(voice); o.start(t + t0); o.stop(t + t0 + d + 0.05);
    }
    this.noiseBurst(t, 2500, 1, 0.04, 0.12);                       // breathy "h"
    setTimeout(() => { echo.disconnect(); }, 5000);
  }
  /** the answer: three slow knocks on wood from somewhere out there */
  knock(pan) {
    if (!this.ready) return;
    const t = this.ac.currentTime, out = this.panned(pan, 0.9);
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.55;
      const o = this.ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(190, tt); o.frequency.exponentialRampToValueAtTime(90, tt + 0.12);
      this.env(o, tt, 0.002, 0.6, 0.16).connect(out); o.start(tt); o.stop(tt + 0.25);
      const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf;
      const f = this.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
      s.connect(f); this.env(f, tt, 0.001, 0.4, 0.05).connect(out); s.start(tt, Math.random()); s.stop(tt + 0.1);
    }
  }
  /** a whisper right next to your ear */
  whisper(pan) {
    if (!this.ready) return;
    const t = this.ac.currentTime, out = this.panned(pan, 1);
    for (let k = 0; k < 4; k++) {
      const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf;
      const f = this.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400 + Math.random() * 2500; f.Q.value = 4;
      s.connect(f); this.env(f, t + k * 0.18, 0.05, 0.12, 0.2).connect(out); s.start(t + k * 0.18, Math.random()); s.stop(t + k * 0.18 + 0.4);
    }
  }
  /** a footstep somewhere around you (eyes closed) */
  stepAt(pan, near = 0.5) {
    if (!this.ready) return;
    const t = this.ac.currentTime, out = this.panned(pan, 0.3 + near * 0.9);
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.7 + Math.random() * 0.3;
    const f = this.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 400; f.Q.value = 0.9;
    s.connect(f); this.env(f, t, 0.006, 0.35, 0.16).connect(out); s.start(t, Math.random()); s.stop(t + 0.3);
  }

  /** a dry branch snapping right behind you */
  twig() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.noiseBurst(t, 2600, 1.5, 0.7, 0.035, 'bandpass');
    this.noiseBurst(t + 0.03, 1400, 2, 0.5, 0.05, 'bandpass');
    this.noiseBurst(t + 0.09, 3800, 2, 0.25, 0.03, 'bandpass');
  }
  /** menu: moving the cursor — a dull mechanical tock */
  uiMove() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.06);
    this.env(o, t, 0.002, 0.16, 0.08).connect(this.master); o.start(t); o.stop(t + 0.12);
    this.noiseBurst(t, 3000, 1, 0.05, 0.04);
  }
  /** menu: confirm. big = NEW GAME (a deep boom and a rising swell of static) */
  uiConfirm(big) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(big ? 70 : 140, t); o.frequency.exponentialRampToValueAtTime(big ? 28 : 70, t + (big ? 2.2 : 0.4));
    this.env(o, t, 0.004, big ? 0.9 : 0.3, big ? 2.6 : 0.5).connect(this.master); o.start(t); o.stop(t + 3);
    this.noiseBurst(t, 900, 0.4, big ? 0.5 : 0.12, big ? 1.8 : 0.3, 'lowpass');
    if (big) { this.noiseBurst(t + 0.05, 4000, 0.3, 0.25, 0.9, 'highpass'); }
  }
  /** title screen: he skips closer — a burst of tape static and a low thump */
  glitchTick() {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.noiseBurst(t, 3500, 0.3, 0.06, 0.1, 'highpass');      // just a tick of tape hiss
    this.noiseBurst(t, 120, 0.8, 0.3, 0.25, 'lowpass');
    if (this.music) { const g = this.music.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.1, t); g.linearRampToValueAtTime(0.85, t + 0.9); }
  }
  /**
   * Title music: a broken music box in D harmonic minor over a low drone, drowned in reverb.
   * Each note is slightly out of tune and the whole thing drifts in pitch like a warped tape.
   */
  menuMusic(on) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    if (!on) {
      this.gameStarted = true;                          // once the game starts, the music can never come back
      for (const M of this.musics || []) {
        if (M.dead) continue;
        M.dead = true;
        clearInterval(M.timer);
      M.out.gain.cancelScheduledValues(t); M.out.gain.setValueAtTime(M.out.gain.value, t);
      M.out.gain.linearRampToValueAtTime(0, t + 1.6);
      M.wow.frequency.setValueAtTime(M.wow.frequency.value, t);
        M.pad.forEach((o) => { try { o.frequency.exponentialRampToValueAtTime(o.frequency.value * 0.7, t + 1.6); o.stop(t + 1.8); } catch (e) {} });  // winds down
        setTimeout(() => M.out.disconnect(), 1800);       // hard cut after the fade, whatever is still ringing
      }
      this.music = null;
      return;
    }
    if (this.music || this.gameStarted) return;
    const out = ac.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.85, t + 3);
    out.connect(this.master);
    // reverb: a synthetic 4.5 s hall
    const len = ac.sampleRate * 4.5, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let y = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len, a = 0.35 * Math.pow(1 - k, 2) + 0.015;     // one-pole lowpass that closes as the tail decays
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = y * Math.pow(1 - k, 3.2) * (i < ac.sampleRate * 0.02 ? i / (ac.sampleRate * 0.02) : 1) * 2.2;
      }
    }
    const verb = ac.createConvolver(); verb.buffer = ir;
    const wet = ac.createGain(); wet.gain.value = 0.5; verb.connect(wet).connect(out);
    const dry = ac.createGain(); dry.gain.value = 0.7; dry.connect(out);
    const bus = ac.createGain(); bus.connect(dry); bus.connect(verb);
    // tape wow: one slow LFO bends every note a few cents
    const wow = ac.createOscillator(); wow.frequency.value = 0.23;
    const wowAmt = ac.createGain(); wowAmt.gain.value = 9;           // cents
    wow.connect(wowAmt); wow.start();
    // drone pad: D + A, detuned saws through a slowly breathing lowpass
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 2;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lfoAmt = ac.createGain(); lfoAmt.gain.value = 160;
    lfo.connect(lfoAmt).connect(lp.frequency); lfo.start();
    const padG = ac.createGain(); padG.gain.value = 0.014; lp.connect(padG).connect(dry);
    const pad = [73.42, 73.9, 110, 55].map((f, i) => { const o = ac.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f; wowAmt.connect(o.detune); o.connect(lp); o.start(); return o; });
    pad.push(lfo, wow);

    const N = (n) => 440 * Math.pow(2, (n - 69) / 12);       // midi -> Hz
    // melody (music box) and bass (one low piano note per bar), 8 steps per bar; null = rest
    const mel = [74, 77, 81, 85, 86, 81, 77, null,  74, 77, 81, 79, 77, 76, 73, null,
                 74, 77, 81, 85, 86, 89, 88, 86,    85, 81, 77, 76, 74, null, null, null];
    const bass = [50, 46, 43, 45];                            // D  Bb  G  A   (i  VI  iv  V)
    const box = (time, f, vel) => {                          // music-box tine: sine + bright partial, fast decay
      for (const [mult, amp, dec] of [[1, 1, 1.6], [3.01, 0.22, 0.35], [5.4, 0.08, 0.15]]) {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        o.detune.value = (Math.random() - 0.5) * 22; wowAmt.connect(o.detune);
        const g = ac.createGain(); g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(0.16 * amp * vel, time + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dec);
        o.connect(g).connect(bus); o.start(time); o.stop(time + dec + 0.05);
      }
    };
    const piano = (time, f) => {
      for (const [mult, amp] of [[1, 1], [2, 0.35], [3, 0.12]]) {
        const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f * mult; wowAmt.connect(o.detune);
        const g = ac.createGain(); g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(0.08 * amp, time + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 4);
        o.connect(g).connect(bus); o.start(time); o.stop(time + 4.1);
      }
    };
    const STEP = 0.52;                                        // slow, like the spring is running out
    const M = (this.music = { out, pad, wow, step: 0, next: t + 0.6, timer: 0, dead: false });
    (this.musics ||= []).push(M);                             // every instance is tracked so a stop always reaches it
    M.timer = setInterval(() => {                             // look-ahead scheduler (keeps timing tight)
      if (M.dead) return;
      if (M.next < ac.currentTime) M.next = ac.currentTime + 0.05;   // tab was asleep: don't burst out a backlog of notes
      while (M.next < ac.currentTime + 0.3) {
        const i = M.step % mel.length;
        if (i % 8 === 0) piano(M.next, N(bass[(i / 8) % bass.length]));
        const n = mel[i];
        if (n !== null && Math.random() > 0.06) box(M.next + (Math.random() - 0.5) * 0.03, N(n), 0.75 + Math.random() * 0.3);   // a tine sometimes doesn't sound
        // the spring catches: every so often a note drags late
        M.next += STEP * (Math.random() < 0.05 ? 1.6 : 1);
        M.step++;
      }
    }, 100);
  }

  /** a wet, rattling animal snarl. k = 0..1 intensity (quiet growl .. full snarl in your face) */
  snarl(k = 1, dur = 1.6) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    const out = ac.createGain();
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.55 * k, t + 0.07);
    out.gain.setValueAtTime(0.55 * k, t + dur * 0.7); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.master);
    // rattle: fast amplitude flutter, like air dragged through a wet throat
    const rattle = ac.createGain(); rattle.gain.value = 0.6;
    const flut = ac.createOscillator(); flut.type = 'square'; flut.frequency.value = 27; const fd = ac.createGain(); fd.gain.value = 0.4;
    flut.connect(fd).connect(rattle.gain); flut.start(t); flut.stop(t + dur);
    rattle.connect(out);
    // voice: low saws with jittered pitch, heavily distorted, through moving formants
    const shaper = ac.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 9); }
    shaper.curve = curve;
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 420; f1.Q.value = 3;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 4;
    const sweep = ac.createOscillator(); sweep.frequency.value = 3.1; const sw = ac.createGain(); sw.gain.value = 260;
    sweep.connect(sw); sw.connect(f1.frequency); sw.connect(f2.frequency); sweep.start(t); sweep.stop(t + dur);
    shaper.connect(f1).connect(rattle); shaper.connect(f2).connect(rattle);
    for (const [f, type] of [[62, 'sawtooth'], [65.5, 'sawtooth'], [124, 'square']]) {
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f * 1.15, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.25); o.frequency.exponentialRampToValueAtTime(f * 0.82, t + dur);
      const j = ac.createOscillator(); j.frequency.value = 11 + Math.random() * 8; const jg = ac.createGain(); jg.gain.value = f * 0.12;
      j.connect(jg).connect(o.frequency); j.start(t); j.stop(t + dur);
      o.connect(shaper); o.start(t); o.stop(t + dur);
    }
    // breath: noise through the same throat
    const n = ac.createBufferSource(); n.buffer = this.noiseBuf;
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 1.2;
    const ng = ac.createGain(); ng.gain.value = 0.5;
    n.connect(nf).connect(ng).connect(rattle); n.start(t, Math.random()); n.stop(t + dur);
  }

  /** continuous mix, called every frame */
  update(dt, { threat, interference, dark, silence = false, hiding = 0, blind = 0, menu = false }) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime;
    const k = (g, v) => g.gain.setTargetAtTime(v, t, 0.15);
    if (this.duckUntil && t > this.duckUntil) { this.duckUntil = 0; this.master.gain.setTargetAtTime(0.9, t, 0.3); }
    if (this.duckUntil) silence = true;
    // crickets fall silent as he approaches (the woods notice first)
    this.crickets = silence || menu ? 0 : Math.max(0, 1 - threat * 2.2);
    if (t > this.nextChirp && this.crickets > 0.02) {
      for (let i = 0; i < 3; i++) this.chirp(t + i * 0.06);
      this.nextChirp = t + 0.5 + Math.random() * 1.3;
    }
    // heartbeat speeds up with threat
    this.heart = silence || menu ? 0 : Math.min(1, Math.max(0, (threat - 0.2) * 1.4, hiding * 0.9, blind * 0.6));   // holding your breath: you can HEAR your heart
    if (this.heart > 0.02 && t > this.nextBeat) {
      this.heartbeat(t);
      this.nextBeat = t + 60 / (60 + Math.max(threat, hiding * 0.7) * 80);
    }
    k(this.staticGain, silence ? 0 : Math.max(0, interference - 0.15) ** 2 * 0.4);
    k(this.droneGain, silence ? 0 : threat * 0.16);
    const gust = 0.6 + 0.4 * Math.sin(t * 0.13) * Math.sin(t * 0.051 + 1);    // slow gusts
    k(this.windGain, silence || menu ? 0 : (0.05 + dark * 0.04) * gust * (1 - hiding * 0.6));   // menu: just a breath of wind under the music
    this.windFilter.frequency.setTargetAtTime(300 + Math.sin(t * 0.2) * 120 + dark * 150, t, 0.5);
  }
}
