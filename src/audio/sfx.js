/**
 * Sound effects, each a few lines of chip voices (synth.js):
 *   v.note(t, midi, dur, inst, vol, bus, { slideTo, vibrato, filter, env })
 *   v.noise(t, dur, vol, bus, { type, freq, to, q })
 *   v.sweep(t, f0Hz, f1Hz, dur, vol, bus, inst)
 * `opts` per effect: pitch (semitones up), voice (NPC talk blips), combo (battle good moves) …
 */
const seq = (v, t, bus, notes, step, inst, vol, len = step * 0.9) => notes.forEach((m, i) => v.note(t + i * step, m, len, inst, vol, bus, { env: { decay: 0.05, sustain: 0.6, release: 0.03 } }));

export const SFX = {
  // --- the 3D platformer
  jump: (v, t, b) => v.sweep(t, 330, 760, 0.12, 0.12, b, 'square'),
  jump2: (v, t, b) => { v.sweep(t, 520, 1100, 0.1, 0.1, b, 'square'); v.note(t + 0.05, 88, 0.08, 'pulse12', 0.05, b); },
  land: (v, t, b, o = {}) => v.noise(t, 0.06, 0.08 * Math.min(1.5, o.strength ?? 1), b, { type: 'lowpass', freq: 900 }),
  step: (v, t, b) => v.noise(t, 0.025, 0.025, b, { type: 'lowpass', freq: 1400 }),
  dash: (v, t, b) => { v.noise(t, 0.18, 0.14, b, { type: 'bandpass', freq: 800, to: 3000, q: 1.2 }); v.sweep(t, 600, 300, 0.12, 0.06, b, 'square'); },
  pound: (v, t, b) => v.sweep(t, 900, 140, 0.2, 0.1, b, 'square'),
  shockwave: (v, t, b) => { v.sweep(t, 120, 40, 0.3, 0.4, b, 'sine'); v.noise(t, 0.25, 0.18, b, { type: 'lowpass', freq: 600, to: 150 }); },
  stomp: (v, t, b) => { v.sweep(t, 200, 900, 0.1, 0.12, b, 'square'); v.note(t + 0.08, 84, 0.08, 'pulse25', 0.07, b); },
  defeat: (v, t, b) => { v.noise(t, 0.12, 0.12, b, { type: 'bandpass', freq: 3000, q: 1 }); seq(v, t + 0.03, b, [79, 84, 91], 0.04, 'pulse12', 0.05); },
  hurt: (v, t, b) => { v.sweep(t, 420, 110, 0.28, 0.14, b, 'square'); v.noise(t, 0.1, 0.08, b, { type: 'lowpass', freq: 1500 }); },
  fell: (v, t, b) => v.sweep(t, 700, 90, 0.6, 0.1, b, 'triangle'),
  spring: (v, t, b) => { v.sweep(t, 200, 1200, 0.25, 0.12, b, 'triangle'); v.note(t, 72, 0.25, 'pulse50', 0.04, b, { slideTo: 96 }); },
  gem: (v, t, b) => seq(v, t, b, [76, 79, 83, 88, 91, 95, 100], 0.045, 'pulse12', 0.07, 0.2),
  trinket: (v, t, b) => { v.note(t, 83, 0.07, 'pulse25', 0.08, b); v.note(t + 0.07, 88, 0.22, 'pulse25', 0.08, b); },
  checkpoint: (v, t, b) => seq(v, t, b, [72, 76, 79, 84, 88], 0.06, 'pulse25', 0.08, 0.12),
  portal: (v, t, b) => { v.noise(t, 0.9, 0.14, b, { type: 'bandpass', freq: 300, to: 4000, q: 3 }); seq(v, t + 0.1, b, [60, 67, 72, 79, 84], 0.1, 'triangle', 0.08, 0.3); },
  door: (v, t, b) => { v.noise(t, 0.05, 0.15, b, { type: 'lowpass', freq: 700 }); v.noise(t + 0.12, 0.05, 0.12, b, { type: 'lowpass', freq: 600 }); },
  pet: (v, t, b, o = {}) => { const p = 84 + (o.pitch ?? 0); v.note(t, p, 0.06, 'pulse50', 0.05, b, { slideTo: p + 5 }); v.note(t + 0.08, p + 3, 0.07, 'pulse50', 0.05, b, { slideTo: p + 8 }); },
  // --- menus and talking
  select: (v, t, b) => v.note(t, 84, 0.05, 'pulse25', 0.05, b),
  move: (v, t, b) => v.note(t, 79, 0.03, 'pulse12', 0.035, b),
  open: (v, t, b) => seq(v, t, b, [72, 79], 0.05, 'pulse25', 0.05),
  close: (v, t, b) => seq(v, t, b, [79, 72], 0.05, 'pulse25', 0.05),
  /** One babble blip of a voice { base (MIDI), wave, wobble } — opts.n varies the pitch. */
  talk: (v, t, b, o = {}) => {
    const vo = o.voice || { base: 72, wave: 'pulse50', wobble: 3 };
    const m = vo.base + ((o.n ?? 0) % 5) * (vo.wobble / 2) - vo.wobble;
    v.note(t, m, 0.045, vo.wave, 0.045, b, { env: { attack: 0.002, decay: 0.02, sustain: 0.7, release: 0.01 } });
  },
  // --- the 2D mini-games
  good: (v, t, b, o = {}) => { const up = Math.min(12, o.combo ?? 0); v.note(t, 79 + up, 0.06, 'pulse25', 0.07, b); v.note(t + 0.05, 86 + up, 0.08, 'pulse25', 0.06, b); },
  wrong: (v, t, b) => { v.note(t, 46, 0.14, 'pulse50', 0.07, b); v.note(t, 47, 0.14, 'pulse50', 0.05, b); },
  bossHit: (v, t, b) => { v.noise(t, 0.14, 0.16, b, { type: 'bandpass', freq: 1200, q: 0.7 }); v.sweep(t, 300, 80, 0.16, 0.12, b, 'square'); },
  bossDefeated: (v, t, b) => { for (let i = 0; i < 4; i++) v.noise(t + i * 0.12, 0.3, 0.18, b, { type: 'lowpass', freq: 1400 - i * 250, to: 100 }); },
  heal: (v, t, b) => seq(v, t, b, [72, 76, 79, 84], 0.06, 'triangle', 0.09, 0.14),
  spell: (v, t, b) => { seq(v, t, b, [84, 88, 91, 96, 100], 0.035, 'pulse12', 0.05, 0.14); v.noise(t, 0.35, 0.05, b, { type: 'highpass', freq: 5000 }); },
  block: (v, t, b) => { v.noise(t, 0.09, 0.14, b, { type: 'bandpass', freq: 4500, q: 6 }); v.note(t, 93, 0.15, 'pulse12', 0.05, b); v.note(t, 100, 0.12, 'pulse12', 0.04, b); },
  parry: (v, t, b) => { v.noise(t, 0.12, 0.16, b, { type: 'bandpass', freq: 5500, q: 8 }); seq(v, t + 0.03, b, [88, 95, 100], 0.04, 'pulse25', 0.06); },
  swing: (v, t, b) => v.noise(t, 0.09, 0.08, b, { type: 'bandpass', freq: 1500, to: 4000, q: 1.5 }),
  shoot: (v, t, b) => v.sweep(t, 1400, 500, 0.08, 0.06, b, 'square'),
  bolt: (v, t, b) => { v.sweep(t, 300, 900, 0.15, 0.06, b, 'triangle'); v.noise(t, 0.12, 0.04, b, { type: 'highpass', freq: 4000 }); },
  slam: (v, t, b) => { v.sweep(t, 90, 35, 0.35, 0.45, b, 'sine'); v.noise(t, 0.3, 0.2, b, { type: 'lowpass', freq: 500, to: 80 }); },
  roll: (v, t, b) => v.noise(t, 0.2, 0.06, b, { type: 'bandpass', freq: 600, to: 200, q: 1 }),
  blink: (v, t, b) => v.sweep(t, 1800, 300, 0.14, 0.05, b, 'triangle'),
  splash: (v, t, b) => v.noise(t, 0.22, 0.08, b, { type: 'bandpass', freq: 1200, to: 500, q: 0.8 }),
  count: (v, t, b) => v.note(t, 72, 0.1, 'pulse50', 0.07, b),
  go: (v, t, b) => v.note(t, 84, 0.25, 'pulse50', 0.08, b),
  // --- cards
  draw: (v, t, b) => v.noise(t, 0.05, 0.05, b, { type: 'highpass', freq: 3000 }),
  play: (v, t, b) => { v.noise(t, 0.08, 0.07, b, { type: 'bandpass', freq: 2000, to: 800 }); v.note(t + 0.04, 76, 0.07, 'pulse25', 0.05, b); },
  attack: (v, t, b) => { v.sweep(t, 500, 200, 0.1, 0.08, b, 'square'); v.noise(t + 0.03, 0.06, 0.08, b, { type: 'bandpass', freq: 1800 }); },
  crumble: (v, t, b) => v.noise(t, 0.25, 0.12, b, { type: 'lowpass', freq: 900, to: 120 }),
  // Riftcards
  shuffle: (v, t, b) => { for (let k = 0; k < 6; k++) v.noise(t + k * 0.045, 0.035, 0.05, b, { type: 'highpass', freq: 2500 + k * 300 }); },
  horn: (v, t, b) => { v.note(t, 62, 0.12, 'pulse25', 0.08, b); v.note(t + 0.12, 67, 0.3, 'pulse25', 0.08, b, { slideTo: 69 }); },
  burn: (v, t, b) => { v.noise(t, 0.45, 0.12, b, { type: 'bandpass', freq: 700, to: 2400, q: 0.7 }); v.sweep(t, 300, 90, 0.4, 0.06, b, 'square'); },
  frost: (v, t, b) => { seq(v, t, b, [96, 100, 103, 108], 0.04, 'triangle', 0.05, 0.25); v.noise(t, 0.3, 0.04, b, { type: 'highpass', freq: 6000 }); },
  fog: (v, t, b) => v.noise(t, 0.6, 0.07, b, { type: 'lowpass', freq: 500, to: 1200 }),
  storm: (v, t, b) => { v.noise(t, 0.5, 0.16, b, { type: 'lowpass', freq: 2500, to: 200 }); v.sweep(t, 120, 45, 0.5, 0.25, b, 'sine'); },
  pass: (v, t, b) => seq(v, t, b, [72, 67], 0.07, 'pulse12', 0.05),
  crack: (v, t, b) => { v.noise(t, 0.1, 0.14, b, { type: 'bandpass', freq: 3800, q: 3 }); seq(v, t + 0.05, b, [76, 71, 64], 0.06, 'pulse25', 0.06); },
  spy: (v, t, b) => seq(v, t, b, [79, 74, 79, 86], 0.05, 'pulse12', 0.05),
  muster: (v, t, b) => seq(v, t, b, [67, 71, 74, 79, 83], 0.035, 'pulse25', 0.06),
  revive: (v, t, b) => { seq(v, t, b, [72, 79, 84, 91], 0.06, 'triangle', 0.08, 0.2); },
  coin: (v, t, b) => { v.note(t, 83, 0.06, 'pulse25', 0.07, b); v.note(t + 0.06, 88, 0.2, 'pulse25', 0.07, b); },
};
export const SFX_NAMES = Object.keys(SFX);
