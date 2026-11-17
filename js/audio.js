/* Sound.
   Crowd: real stadium recordings when assets/audio-pack.js has them (see assets/audio/README.txt);
   otherwise a crowd synthesised from ~30 "voices" (pitched tones shaped by vowel filters) over a
   bed of stadium air, so it chatters, swells, cheers and groans rather than hissing.
   Kick, snap, whistle and doink are always synthesised. */
const AudioFX = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('fgk_muted') === '1'; } catch (e) {}

  const S = { beds: {}, shots: {}, ready: false };    // recorded crowd
  const V = { list: [], bus: null, air: null, airF: null, mode: 'chatter', level: 0, timer: null };  // synthesised crowd
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();                 // keeps a big roar from clipping
    comp.threshold.value = -10; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {                          // pink-ish noise
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    loadRecordings();
    buildVoices();
  }
  const now = () => ctx.currentTime;

  /* ---------------- recorded crowd ---------------- */
  function b64ToBuffer(b64) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  function loadRecordings() {
    const pack = window.AUDIO_PACK;
    if (!pack || !pack.files) return;
    const names = Object.keys(pack.files);
    let left = names.length;
    names.forEach(name => {
      const done = () => { if (--left === 0) recordingsReady(); };
      try {
        ctx.decodeAudioData(b64ToBuffer(pack.files[name]), buf => { S[name] = buf; done(); }, e => { console.warn('Audio: could not decode ' + name, e); done(); });
      } catch (e) { console.warn('Audio: could not decode ' + name, e); done(); }
    });
  }
  function recordingsReady() {
    for (const name of ['crowd', 'stadium']) {
      const buf = S[name]; if (!buf) continue;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(master);
      src.start(0, Math.random() * buf.duration);
      S.beds[name] = g;
    }
    S.ready = !!(S.beds.crowd || S.beds.stadium);
    if (S.ready) { V.bus.gain.setTargetAtTime(0, now(), 0.3); V.air.gain.setTargetAtTime(0, now(), 0.3); }
    console.info('Audio: crowd recordings ' + Object.keys(window.AUDIO_PACK.files).join(', '));
    applyMood(V.mood || 'ambience');
  }
  function bed(name, level, tc) { const g = S.beds[name]; if (g) g.gain.setTargetAtTime(level, now(), tc); }
  function shot(name, level, delay) {
    const buf = S[name]; if (!buf) return false;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = level;
    src.connect(g); g.connect(master); src.start(now() + (delay || 0));
    return true;
  }

  /* ---------------- synthesised crowd ---------------- */
  // vowel formants (Hz): chatter cycles through all of them, a cheer is mostly "ah"/"eh", a groan "oh"/"oo"
  const VOWELS = { ah: [760, 1150], eh: [550, 1750], ee: [320, 2200], oh: [500, 860], oo: [350, 720], uh: [620, 1200] };
  const CHAT = ['ah', 'eh', 'ee', 'oh', 'oo', 'uh'], CHEER = ['ah', 'ah', 'eh', 'ee'], GROAN = ['oh', 'oo', 'oh', 'uh'];
  function buildVoices() {
    V.bus = ctx.createGain(); V.bus.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    V.bus.connect(hp); hp.connect(master);
    for (let i = 0; i < 30; i++) {
      const hi = Math.random() < 0.35;                                // a mix of lower and higher voices
      const f0 = hi ? rnd(190, 280) : rnd(100, 165);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0;
      const vib = ctx.createOscillator(), vg = ctx.createGain();
      vib.frequency.value = rnd(4, 6.5); vg.gain.value = f0 * 0.012;
      vib.connect(vg); vg.connect(o.frequency);
      const F1 = ctx.createBiquadFilter(), F2 = ctx.createBiquadFilter();
      F1.type = F2.type = 'bandpass'; F1.Q.value = 5; F2.Q.value = 7;
      const amp = ctx.createGain(); amp.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const mix = ctx.createGain(); mix.gain.value = 1;
      o.connect(F1); o.connect(F2); F1.connect(mix); F2.connect(mix);
      mix.connect(amp);
      if (pan) { pan.pan.value = rnd(-0.9, 0.9); amp.connect(pan); pan.connect(V.bus); } else amp.connect(V.bus);
      o.start(); vib.start();
      V.list.push({ o, F1, F2, amp, f0, hi });
    }
    // stadium air: a broad, soft wash under the voices
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    V.airF = ctx.createBiquadFilter(); V.airF.type = 'bandpass'; V.airF.frequency.value = 900; V.airF.Q.value = 0.35;
    V.air = ctx.createGain(); V.air.gain.value = 0;
    src.connect(V.airF); V.airF.connect(V.air); V.air.connect(master); src.start();
    V.timer = setInterval(tickVoices, 90);
  }
  function setVowel(v, name, t, tc) {
    const f = VOWELS[name], k = v.hi ? 1.12 : 1;
    v.F1.frequency.setTargetAtTime(f[0] * k, t, tc); v.F2.frequency.setTargetAtTime(f[1] * k, t, tc);
  }
  // Each voice speaks in short bursts; how often, how loud, how high and on which vowels depends on the mood.
  function tickVoices() {
    if (!ctx || S.ready || V.level <= 0.001) return;
    const t = now(), m = V.mode;
    for (const v of V.list) {
      if (m === 'chatter') {
        if (Math.random() < 0.22) {                                   // a syllable of conversation
          setVowel(v, CHAT[(Math.random() * CHAT.length) | 0], t, 0.03);
          v.o.frequency.setTargetAtTime(v.f0 * rnd(0.9, 1.15), t, 0.05);
          v.amp.gain.setTargetAtTime(rnd(0.02, 0.06), t, 0.02);
          v.amp.gain.setTargetAtTime(0, t + rnd(0.08, 0.22), 0.05);
        }
      } else if (m === 'swell') {                                      // "ooooh" as the ball flies
        if (Math.random() < 0.3) {
          setVowel(v, Math.random() < 0.6 ? 'oo' : 'oh', t, 0.2);
          v.o.frequency.setTargetAtTime(v.f0 * rnd(1.05, 1.3), t, 0.4);
          v.amp.gain.setTargetAtTime(rnd(0.05, 0.1), t, 0.25);
        }
      } else if (m === 'cheer') {                                      // "yeaaah!"
        if (Math.random() < 0.35) {
          setVowel(v, CHEER[(Math.random() * CHEER.length) | 0], t, 0.05);
          v.o.frequency.setTargetAtTime(v.f0 * rnd(1.35, 1.9), t, 0.08);
          v.amp.gain.setTargetAtTime(rnd(0.08, 0.16), t, 0.04);
          if (Math.random() < 0.3) v.amp.gain.setTargetAtTime(rnd(0.02, 0.06), t + rnd(0.3, 0.7), 0.15);
        }
      } else if (m === 'groan') {                                      // "ohhhh..." sinking
        if (Math.random() < 0.25) {
          setVowel(v, GROAN[(Math.random() * GROAN.length) | 0], t, 0.15);
          v.o.frequency.setTargetAtTime(v.f0 * rnd(0.75, 0.95), t, 0.5);
          v.amp.gain.setTargetAtTime(rnd(0.05, 0.11), t, 0.15);
        }
      } else if (m === 'hush') {
        if (Math.random() < 0.08) {
          setVowel(v, CHAT[(Math.random() * CHAT.length) | 0], t, 0.03);
          v.amp.gain.setTargetAtTime(rnd(0.01, 0.03), t, 0.03);
          v.amp.gain.setTargetAtTime(0, t + 0.12, 0.05);
        }
      }
    }
    if (m === 'cheer' && Math.random() < 0.9) for (let i = 0; i < 4; i++) clap(t + Math.random() * 0.09);
  }
  function clap(t) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rnd(1100, 2200); f.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(rnd(0.05, 0.14), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(f); f.connect(g);
    if (p) { p.pan.value = rnd(-1, 1); g.connect(p); p.connect(master); } else g.connect(master);
    s.start(t, Math.random() * 1.8); s.stop(t + 0.07);
  }
  function synth(mode, level, airLevel, airFreq, tc) {
    V.mode = mode; V.level = level;
    if (S.ready) return;
    V.bus.gain.setTargetAtTime(level, now(), tc);
    V.air.gain.setTargetAtTime(airLevel, now(), tc);
    V.airF.frequency.setTargetAtTime(airFreq, now(), tc);
    if (mode !== 'chatter' && mode !== 'hush') return;
    for (const v of V.list) v.amp.gain.setTargetAtTime(0, now(), 0.15);   // let held notes go
  }

  /* ---------------- moods ---------------- */
  let moodTimer = null;
  function applyMood(m) {
    if (!ctx) return;
    V.mood = m;
    clearTimeout(moodTimer);
    switch (m) {
      case 'ambience':                                                   // a buzzing stadium between kicks
        bed('crowd', 0.55, 0.8); bed('stadium', 0.3, 0.8);
        synth('chatter', 0.9, 0.16, 1000, 0.6); break;
      case 'tension':                                                    // settles down for the snap
        bed('crowd', 0.32, 0.5); bed('stadium', 0.16, 0.5);
        synth('hush', 0.7, 0.09, 850, 0.4); break;
      case 'flight':                                                     // rising "ooooh"
        bed('crowd', 0.45, 0.6); bed('stadium', 0.75, 0.7);
        synth('swell', 1, 0.2, 1100, 0.5); break;
      case 'cheer':
        bed('stadium', 1.0, 0.08); bed('crowd', 0.6, 0.2);
        if (!shot('cheer', 0.95)) shot('stadium', 0);                  // (no cheer file: the stadium bed carries it)
        synth('cheer', 1.25, 0.4, 1500, 0.08);
        moodTimer = setTimeout(() => applyMood('ambience'), 3600); break;
      case 'groan':
        bed('stadium', 0.12, 0.25); bed('crowd', 0.45, 0.4);
        shot('boo', 0.75, 0.25);
        synth('groan', 1, 0.12, 600, 0.12);
        moodTimer = setTimeout(() => applyMood('ambience'), 2800); break;
      case 'silence':
        bed('crowd', 0, 0.3); bed('stadium', 0, 0.3);
        synth('hush', 0, 0, 800, 0.3); break;
    }
  }

  /* ---------------- effects ---------------- */
  function tone(f0, f1, dur, gain, type, delay) {
    if (!ctx) return;
    const t = now() + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(dur, freq, q, gain, type) {
    if (!ctx) return;
    const t = now();
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  return {
    init,
    isMuted: () => muted,
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('fgk_muted', m ? '1' : '0'); } catch (e) {}
      if (master) master.gain.setTargetAtTime(m ? 0 : 1, now(), 0.02);
    },
    hasRecordings: () => S.ready,
    ambience() { applyMood('ambience'); },
    tension() { applyMood('tension'); },
    flight() { applyMood('flight'); },
    silence() { applyMood('silence'); },
    cheer() { applyMood('cheer'); },
    groan() { applyMood('groan'); },
    snap() { burst(0.09, 1800, 1.2, 0.5); tone(260, 120, 0.07, 0.15, 'triangle'); },
    catchBall() { burst(0.05, 900, 2, 0.35); },
    kick() { tone(170, 45, 0.16, 0.9, 'sine'); burst(0.07, 2400, 0.8, 0.45); },
    doink() { tone(620, 600, 0.55, 0.35, 'triangle'); tone(933, 915, 0.4, 0.2, 'sine'); tone(1490, 1470, 0.25, 0.1, 'sine'); },
    blip(hi) { tone(hi ? 880 : 660, hi ? 880 : 660, 0.07, 0.12, 'square'); },
    whistle(twice) {
      if (!ctx) return;
      const blow = (delay, dur) => {
        const t = now() + delay;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
        g.gain.setValueAtTime(0.11, t + dur - 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const trem = ctx.createGain(); trem.gain.value = 0.6;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 38;
        const lg = ctx.createGain(); lg.gain.value = 0.4;
        lfo.connect(lg); lg.connect(trem.gain);
        [2350, 2480].forEach(f => {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          o.connect(trem); o.start(t); o.stop(t + dur + 0.02);
        });
        trem.connect(g); g.connect(master);
        lfo.start(t); lfo.stop(t + dur + 0.02);
      };
      blow(0, 0.38);
      if (twice) blow(0.48, 0.3);
    },
  };
})();
