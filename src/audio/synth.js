/**
 * The chip — a tiny Web Audio synthesizer in the spirit of an 8-bit console: three pulse
 * widths (12.5 %, 25 %, 50 %), a triangle, a soft saw and noise, with envelopes, vibrato,
 * a little echo, and drums made from noise and pitch sweeps. No samples, no files: every
 * sound is made on the spot.
 *
 *   const chip = createChip();            // makes its AudioContext on the first unlock()
 *   chip.unlock();                        // from a key / pointer event (browsers need a gesture)
 *   chip.playSong(song)                   // a looping tune from compose.js (cross-fades)
 *   chip.jingle(song)                     // a one-shot tune over the music (which ducks)
 *   chip.sfx('jump')                      // a sound effect (sfx.js)
 *   chip.setVolumes({ music, sfx, muted })
 *
 * `createChip({ context })` also takes an OfflineAudioContext (tests render a song and check
 * its levels; `renderSong`). Music is scheduled a little ahead on the audio clock, so it
 * keeps time whatever the frame rate does.
 */
import { SFX } from './sfx.js';

export const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

/** Gains per channel (kept low: the compressor and the ear like headroom). */
export const MIX = { lead: 0.13, harm: 0.05, arp: 0.045, bass: 0.2, kick: 0.5, snare: 0.22, hat: 0.06 };

export function createChip({ context = null } = {}) {
  let ctx = context, out = null, musicBus = null, sfxBus = null, echo = null, echoWet = null;
  let waves = null, noiseBuf = null;
  const volumes = { music: 0.6, sfx: 0.8, muted: false };
  let player = null;          // the song playing: { song, start, next, step, gain, timer }
  let duckUntil = 0;

  function build() {
    if (out) return;
    ctx ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    out = ctx.createGain();
    out.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(out);
    sfxBus = ctx.createGain(); sfxBus.connect(out);
    // the echo: a dotted-eighth-ish delay with feedback through a low-pass (lead only)
    echo = ctx.createDelay(1.5);
    const fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    fb.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 2400;
    echo.connect(lp); lp.connect(fb); fb.connect(echo);
    echoWet = ctx.createGain(); echoWet.gain.value = 0;
    lp.connect(echoWet); echoWet.connect(musicBus);
    // pulse waves from their Fourier series
    const pulse = duty => {
      // a pulse of duty d: cosine terms a_k = 2·sin(kπd)/(kπ)
      const n = 48, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      return ctx.createPeriodicWave(re, im, { disableNormalization: false });
    };
    waves = { pulse12: pulse(0.125), pulse25: pulse(0.25), pulse50: pulse(0.5) };
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x3fffffff) - 1; }
    applyVolumes();
  }

  function applyVolumes() {
    if (!out) return;
    const t = ctx.currentTime;
    out.gain.setTargetAtTime(volumes.muted ? 0 : 1, t, 0.02);
    musicBus.gain.setTargetAtTime(volumes.music, t, 0.05);
    sfxBus.gain.setTargetAtTime(volumes.sfx, t, 0.02);
  }

  // ---------------------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------------------
  /** An oscillator of an instrument ('pulse12|25|50', 'triangle', 'saw', 'sine'). */
  function osc(inst, t) {
    const o = ctx.createOscillator();
    if (waves[inst]) o.setPeriodicWave(waves[inst]);
    else o.type = inst === 'saw' ? 'sawtooth' : inst === 'sine' ? 'sine' : inst === 'square' ? 'square' : 'triangle';
    o.start(t);
    return o;
  }
  /** An envelope gain: attack, decay to sustain, release at `end`. */
  function envelope(t, end, peak, { attack = 0.004, decay = 0.08, sustain = 0.65, release = 0.06 } = {}) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(peak * sustain, t + attack, decay / 3);
    g.gain.setValueAtTime(peak * sustain, Math.max(t + attack, end));
    g.gain.linearRampToValueAtTime(0.0001, end + release);
    return g;
  }
  /** A pitched note. */
  function note(t, midi, dur, inst, vol, bus, { vibrato = 0, filter = 0, env = {}, slideTo = null } = {}) {
    const o = osc(inst, t);
    const f = midiToHz(midi);
    o.frequency.setValueAtTime(f, t);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(midiToHz(slideTo), t + dur);
    if (vibrato && dur > 0.2) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 5.5; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * vibrato, t + Math.min(0.3, dur * 0.6));
      lfo.connect(depth); depth.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.2);
    }
    const g = envelope(t, t + dur, vol, env);
    let node = o;
    if (filter) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filter; o.connect(lp); node = lp; }
    node.connect(g); g.connect(bus);
    o.stop(t + dur + (env.release ?? 0.06) + 0.05);
    return g;
  }
  /** A burst of noise (filtered). */
  function noise(t, dur, vol, bus, { type = 'bandpass', freq = 2000, q = 0.8, to = null, rate = 1 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    return g;
  }
  /** A pitch sweep (kicks, zaps, boings). */
  function sweep(t, f0, f1, dur, vol, bus, inst = 'sine', curve = 'exp') {
    const o = osc(inst, t);
    o.frequency.setValueAtTime(f0, t);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    else o.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.stop(t + dur + 0.02);
    return g;
  }
  const voices = { note, noise, sweep, midiToHz };

  /** One of a song's notes. */
  function playSongNote(n, t, dur, song, bus) {
    const v = n.vel;
    switch (n.ch) {
      case 'kick': sweep(t, 160, 42, 0.16, MIX.kick * v, bus, 'sine'); break;
      case 'snare': noise(t, 0.13, MIX.snare * v, bus, { type: 'bandpass', freq: 1900, q: 0.6 }); sweep(t, 220, 150, 0.06, MIX.snare * 0.5 * v, bus, 'triangle'); break;
      case 'hat': noise(t, 0.035, MIX.hat * v, bus, { type: 'highpass', freq: 7500, q: 0.5 }); break;
      case 'bass': note(t, n.midi, dur * 0.92, 'triangle', MIX.bass * v, bus, { env: { decay: 0.1, sustain: 0.8, release: 0.03 } }); break;
      case 'arp': note(t, n.midi, dur * 0.85, 'pulse12', MIX.arp * v, bus, { env: { decay: 0.05, sustain: 0.5, release: 0.02 }, filter: 5000 }); break;
      case 'harm': note(t, n.midi, dur * 0.95, 'pulse50', MIX.harm * v, bus, { filter: 2200, env: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.08 } }); break;
      default: {
        const g = note(t, n.midi, dur * 0.95, song.lead || 'pulse25', MIX.lead * v, bus, { vibrato: 0.012, filter: song.lead === 'triangle' ? 0 : 6000, env: { decay: 0.12, sustain: 0.7 } });
        if (song.echo && echo) g.connect(echo);
      }
    }
  }

  /** Schedule a song's steps [from, to) starting at `t0` for step `from`. */
  function scheduleSteps(song, byStep, from, to, t0, bus) {
    const stepDur = 60 / song.bpm / 4;
    for (let s = from; s < to; s++) {
      const i = ((s % song.steps) + song.steps) % song.steps;
      const swing = song.swing && i % 4 === 2 ? song.swing * stepDur * 2 : 0;
      const t = t0 + (s - from) * stepDur + swing;
      for (const n of byStep[i] || []) playSongNote(n, t, n.len * stepDur, song, bus);
    }
  }
  const index = song => { const by = []; for (const n of song.notes) (by[n.step] ||= []).push(n); return by; };

  // ---------------------------------------------------------------------------
  // The music player: a look-ahead scheduler on the audio clock
  // ---------------------------------------------------------------------------
  const LOOKAHEAD = 0.18, TICK = 40;
  function tick() {
    if (!player || !ctx) return;
    const p = player, stepDur = 60 / p.song.bpm / 4;
    while (p.next < ctx.currentTime + LOOKAHEAD) {
      scheduleSteps(p.song, p.byStep, p.step, p.step + 1, p.next, p.gain);
      p.step++; p.next += stepDur;
    }
    // ducking (a jingle is on)
    const duck = ctx.currentTime < duckUntil ? 0.25 : 1;
    if (p.duck !== duck) { p.gain.gain.setTargetAtTime(duck, ctx.currentTime, 0.08); p.duck = duck; }
  }

  function stopMusic(fade = 0.4) {
    if (!player || !ctx) { player = null; return; }
    const p = player;
    player = null;
    clearInterval(p.timer);
    p.gain.gain.cancelScheduledValues(ctx.currentTime);
    p.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    setTimeout(() => p.gain.disconnect(), (fade + 0.4) * 1000);
  }

  return {
    get context() { return ctx; },
    get ready() { return !!out && ctx.state === 'running'; },
    get playing() { return player?.song || null; },
    voices: () => voices,
    /** Make (or wake) the audio context — call from a user gesture. */
    unlock() {
      try { build(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* no audio: stay silent */ }
      if (player && !player.timer) player.timer = setInterval(tick, TICK);
    },
    suspend() { if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend(); },
    setVolumes(v) { Object.assign(volumes, v); applyVolumes(); },
    get volumes() { return { ...volumes }; },

    /** Loop a song (cross-fading from the one playing). The same song again: nothing changes. */
    playSong(song, { fade = 0.6 } = {}) {
      if (player?.song === song) return;
      stopMusic(fade);
      if (!song) return;
      try { build(); } catch { return; }
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fade);
      gain.connect(musicBus);
      echo.delayTime.value = (60 / song.bpm) * 0.75;
      echoWet.gain.setTargetAtTime(song.echo || 0, ctx.currentTime, 0.1);
      player = { song, byStep: index(song), step: 0, next: ctx.currentTime + 0.08, gain, duck: 1, timer: null };
      if (ctx.state === 'running' || context) player.timer = setInterval(tick, TICK);
      tick();
    },
    stopMusic,

    /** A one-shot tune over the music (which ducks while it plays). */
    jingle(song) {
      try { build(); } catch { return; }
      if (!ctx || (ctx.state !== 'running' && !context)) return;
      const t = ctx.currentTime + 0.03;
      scheduleSteps(song, index(song), 0, song.steps, t, sfxBus);
      duckUntil = t + song.steps * 60 / song.bpm / 4 + 0.2;
    },

    /** A sound effect by name (sfx.js) with options (pitch, voice …). */
    sfx(name, opts = {}) {
      if (!out || ctx.state !== 'running' || volumes.muted) return;
      const fx = SFX[name];
      if (fx) fx(voices, ctx.currentTime + 0.005, sfxBus, opts);
    },

    /** Offline: schedule `seconds` of a song from the start (OfflineAudioContext rendering). */
    renderSong(song, seconds) {
      build();
      echo.delayTime.value = (60 / song.bpm) * 0.75;
      echoWet.gain.value = song.echo || 0;
      const steps = Math.floor(seconds / (60 / song.bpm / 4));
      scheduleSteps(song, index(song), 0, steps, 0.02, musicBus);
    },
  };
}
