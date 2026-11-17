/**
 * The chiptune composer — pure and deterministic (no Web Audio here; see synth.js for the
 * sound and music.js for who plays what). A *style* says how a place should feel — mode,
 * tempo, chord progressions, bass / drum / accompaniment patterns, lead instrument — and
 * `composeSong(style, seed)` writes a fresh, loopable tune in it:
 *
 *   8 bars, A A' B A'' — a two-bar motif (a rhythm from a library, pitches walking between
 *   chord tones), answered, repeated over the next chords (re-fitted so strong beats land on
 *   chord tones), a contrasting higher B phrase, and the motif again ending on the tonic.
 *   Repetition is what makes a tune stick, so the motif comes back three times.
 *
 * Everything is MIDI note numbers on a grid of steps (16 per bar; 12 for a waltz):
 *   { bpm, stepsPerBar, bars, steps, swing, echo, notes: [{ step, len, midi, vel, ch }] }
 *   ch: lead · harm · arp · bass · kick · snare · hat
 *
 * Every level, mini-game and place gets its own seed, so each has its own tune in its
 * zone's (or game's) style.
 */
import { mulberry32, hashSeed } from '../levels/generator.js';

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],          // harmonic minor
  spanish: [0, 1, 4, 5, 7, 8, 10],           // phrygian dominant
};

export const QUALITY = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
};

// Chord progressions: [semitones above the tonic, quality] per chord (one chord a bar).
const P = {
  pop: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']],            // I V vi IV
  doowop: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']],         // I vi IV V
  rock: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']],           // I IV V IV
  mixo: [[0, 'maj'], [10, 'maj'], [5, 'maj'], [0, 'maj']],          // I bVII IV I
  island: [[0, 'maj'], [5, 'maj'], [0, 'maj'], [7, 'dom7']],        // I IV I V7
  andalusian: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']],    // i VII VI V
  epic: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']],          // i VI III VII
  drive: [[0, 'min'], [10, 'maj'], [8, 'maj'], [10, 'maj']],        // i VII VI VII
  minorCad: [[0, 'min'], [5, 'min'], [7, 'maj'], [0, 'min']],       // i iv V i
  dorian: [[0, 'min7'], [5, 'maj'], [0, 'min7'], [10, 'maj']],      // i IV i VII
  dorianB: [[0, 'min'], [2, 'min'], [5, 'maj'], [7, 'min']],        // i ii IV v
  lydian: [[0, 'maj'], [2, 'maj'], [0, 'maj'], [7, 'maj']],         // I II I V
  lydianB: [[0, 'maj7'], [2, 'maj'], [4, 'min'], [2, 'maj']],       // I II iii II
  dream: [[0, 'min'], [8, 'maj7'], [3, 'maj'], [10, 'maj']],        // i VI III VII (slow)
  cozy: [[0, 'maj'], [5, 'maj'], [0, 'maj'], [7, 'maj']],           // I IV I V
  jazz: [[2, 'min7'], [7, 'dom7'], [0, 'maj7'], [9, 'min7']],       // ii V I vi
  lullaby: [[0, 'maj'], [5, 'maj'], [9, 'min'], [7, 'sus4']],
  dungeon: [[0, 'min'], [1, 'maj'], [0, 'min'], [10, 'maj']],       // i bII i VII
  spanish: [[0, 'maj'], [1, 'maj'], [0, 'maj'], [1, 'maj']],        // I bII (phrygian dominant)
  boss: [[0, 'min'], [8, 'maj'], [10, 'maj'], [7, 'maj']],          // i VI VII V
  march: [[0, 'maj'], [7, 'maj'], [0, 'maj'], [5, 'maj']],
};

/**
 * Styles. root: the tonic's range (MIDI); bass/harm/drums: pattern names (below); lead:
 * instrument (synth.js); density: how busy the melody is; staccato: short notes.
 */
export const STYLES = {
  // zones (the 3D levels)
  meadow: { mode: 'ionian', bpm: [112, 124], prog: ['pop', 'doowop', 'rock'], bass: 'bounce', harm: 'arp', drums: 'light', lead: 'pulse25', root: [60, 65], density: 0.6 },
  lagoon: { mode: 'mixolydian', bpm: [100, 110], prog: ['island', 'mixo'], bass: 'offbeat', harm: 'skank', drums: 'island', lead: 'pulse50', root: [58, 63], density: 0.5, swing: 0.18 },
  canyon: { mode: 'harmonic', bpm: [96, 108], prog: ['andalusian', 'minorCad'], bass: 'gallop', harm: 'strum', drums: 'gallop', lead: 'pulse12', root: [57, 62], density: 0.45, echo: 0.3 },
  grove: { mode: 'dorian', bpm: [92, 104], prog: ['dorian', 'dorianB'], bass: 'walk', harm: 'arp', drums: 'wood', lead: 'pulse50', root: [57, 62], density: 0.55, staccato: true },
  alpine: { mode: 'lydian', bpm: [132, 144], prog: ['lydian', 'cozy'], bass: 'waltz', harm: 'waltz', drums: 'waltz', lead: 'pulse25', root: [60, 65], density: 0.5, waltz: true },
  volcano: { mode: 'harmonic', bpm: [140, 156], prog: ['boss', 'minorCad', 'drive'], bass: 'pedal8', harm: 'power', drums: 'driving', lead: 'pulse25', root: [55, 60], density: 0.7 },
  crystal: { mode: 'lydian', bpm: [84, 94], prog: ['lydianB', 'lydian'], bass: 'root4', harm: 'sparkle', drums: 'none', lead: 'triangle', root: [62, 67], density: 0.4, echo: 0.4 },
  starlit: { mode: 'aeolian', bpm: [84, 96], prog: ['dream', 'epic'], bass: 'root4', harm: 'pad', drums: 'soft', lead: 'pulse50', root: [57, 62], density: 0.4, echo: 0.45 },
  // places
  town: { mode: 'ionian', bpm: [104, 112], prog: ['cozy', 'doowop', 'jazz'], bass: 'root4', harm: 'arp', drums: 'light', lead: 'pulse50', root: [60, 64], density: 0.5 },
  home: { mode: 'ionian', bpm: [76, 84], prog: ['lullaby', 'cozy'], bass: 'root4', harm: 'musicbox', drums: 'none', lead: 'triangle', root: [62, 67], density: 0.35 },
  title: { mode: 'ionian', bpm: [120, 128], prog: ['pop', 'march'], bass: 'bounce', harm: 'arp', drums: 'rock', lead: 'pulse25', root: [60, 64], density: 0.6 },
  // the mini-games, by role
  boss: { mode: 'aeolian', bpm: [150, 168], prog: ['epic', 'drive', 'boss'], bass: 'pedal8', harm: 'arp', drums: 'driving', lead: 'pulse25', root: [55, 61], density: 0.75 },
  checkpoint: { mode: 'ionian', bpm: [136, 148], prog: ['pop', 'rock', 'doowop'], bass: 'bounce', harm: 'arp', drums: 'rock', lead: 'pulse12', root: [60, 66], density: 0.7 },
  travel: { mode: 'mixolydian', bpm: [126, 138], prog: ['mixo', 'rock'], bass: 'gallop', harm: 'strum', drums: 'gallop', lead: 'pulse25', root: [57, 63], density: 0.6 },
  delve: { mode: 'phrygian', bpm: [108, 118], prog: ['dungeon', 'andalusian'], bass: 'ostinato', harm: 'pad', drums: 'march', lead: 'pulse50', root: [55, 60], density: 0.5, echo: 0.35 },
  duel: { mode: 'spanish', bpm: [118, 128], prog: ['spanish', 'andalusian'], bass: 'gallop', harm: 'strum', drums: 'gallop', lead: 'pulse12', root: [55, 60], density: 0.6 },
  cards: { mode: 'dorian', bpm: [100, 110], prog: ['jazz', 'dorian'], bass: 'walk', harm: 'stab', drums: 'swing', lead: 'pulse50', root: [57, 62], density: 0.55, swing: 0.22 },
  rift: { mode: 'phrygian', bpm: [112, 122], prog: ['dungeon', 'epic'], bass: 'pedal8', harm: 'sparkle', drums: 'soft', lead: 'pulse25', root: [57, 62], density: 0.55, echo: 0.35 },
  ring: { mode: 'mixolydian', bpm: [132, 144], prog: ['epic', 'mixo', 'rock'], bass: 'gallop', harm: 'stab', drums: 'driving', lead: 'pulse25', root: [57, 62], density: 0.7 },
  inn: { mode: 'mixolydian', bpm: [112, 122], prog: ['mixo', 'doowop', 'cozy'], bass: 'walk', harm: 'strum', drums: 'light', lead: 'pulse50', root: [58, 63], density: 0.55, swing: 0.18 },
  ranch: { mode: 'ionian', bpm: [92, 100], prog: ['cozy', 'lullaby'], bass: 'root4', harm: 'strum', drums: 'soft', lead: 'triangle', root: [60, 65], density: 0.45 },
  arcade: { mode: 'ionian', bpm: [130, 140], prog: ['pop', 'rock'], bass: 'bounce', harm: 'arp', drums: 'rock', lead: 'pulse12', root: [60, 64], density: 0.65 },
};

// A bar's rhythms for the melody (x: a note starts, -: it holds, .: rest), 16 steps.
const RHYTHMS = {
  sparse: ['x---x---x-------', 'x-------x---x---', 'x---x-x-x-------', 'x-----x-x-------', 'x---x---x---x---'],
  medium: ['x-x-x---x-x-x---', 'x--x--x-x-------', 'x-xx--x-x---x---', 'x---x-x-x-x-----', 'x-x---x-x---x-x-', '--x-x-x-x-------'],
  busy: ['x-xxx-x-x-xxx-x-', 'xxx-x-x-xxx-x---', 'x-x-xxx-x-x-xx--', 'x-xx-xx-x-xx-x--', 'xx-xx-x-x-x-xxx-'],
};
const WALTZ_RHYTHMS = ['x---x---x---', 'x-------x-x-', 'x---x-x-x---', 'x-----x-x---', 'x-x-x---x---'];

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const lerp = (a, b, t) => a + (b - a) * t;

/** The chord's tones (pitch classes, tonic-relative). */
export function chordTones(chord) {
  const [root, q] = chord;
  return QUALITY[q].map(i => (root + i) % 12);
}

/** The melody's scale over a chord: the mode, with notes a semitone off a chord tone replaced by it. */
export function chordScale(mode, chord) {
  const tones = chordTones(chord);
  const out = new Set();
  for (const n of MODES[mode]) {
    const clash = tones.find(t => (t - n + 12) % 12 === 1 || (n - t + 12) % 12 === 1);
    out.add(clash !== undefined && !tones.includes(n) ? clash : n);
  }
  for (const t of tones) out.add(t);
  return [...out].sort((a, b) => a - b);
}

/** Nearest MIDI note to `near` whose pitch class is in `classes` (tonic at `tonic`). */
function nearest(classes, tonic, near, { above = null } = {}) {
  let best = null, bestD = Infinity;
  for (let m = near - 12; m <= near + 12; m++) {
    if (!classes.includes(((m - tonic) % 12 + 12) % 12)) continue;
    if (above === true && m <= near) continue;
    if (above === false && m >= near) continue;
    const d = Math.abs(m - near);
    if (d < bestD) { best = m; bestD = d; }
  }
  return best ?? near;
}

/** Step up / down the (chord-)scale by `n` degrees from `m`. */
function scaleStep(classes, tonic, m, n) {
  let x = m;
  for (let i = 0; i < Math.abs(n); i++) x = nearest(classes, tonic, x, { above: n > 0 });
  return x;
}

/**
 * A new tune in a style.
 *   style   a STYLES entry (or its name)
 *   seed    any number / string parts (hashSeed)
 */
export function composeSong(style, seed = 1) {
  const S = typeof style === 'string' ? STYLES[style] : style;
  const rng = mulberry32(hashSeed('song', seed));
  const spb = S.waltz ? 12 : 16, bars = 8;
  const bpm = Math.round(lerp(S.bpm[0], S.bpm[1], rng()));
  const tonic = Math.round(lerp(S.root[0], S.root[1], rng()));
  const prog = P[pick(rng, S.prog)];
  // 8 bars of chords: the progression twice; the B section (bars 5–6) may vary it
  const chords = [...prog, ...prog].map(c => [...c]);
  if (rng() < 0.5) [chords[4], chords[5]] = [[prog[2][0], prog[2][1]], [prog[1][0], prog[1][1]]];
  if (prog[3][0] !== 7 && rng() < 0.5) chords[7] = [7, 'maj'];            // sometimes a V for a stronger pull back to the top
  const notes = [];
  const add = (step, len, midi, vel, ch) => notes.push({ step, len: Math.max(1, len), midi, vel, ch });

  // --- melody: motif A (2 bars), re-fitted; B higher; A again, ending on the tonic
  const pool = S.waltz ? WALTZ_RHYTHMS : RHYTHMS[S.density < 0.45 ? 'sparse' : S.density < 0.65 ? 'medium' : 'busy'];
  const rhythmA = [pick(rng, pool), pick(rng, pool)];
  const rhythmB = [pick(rng, pool), pick(rng, pool)];
  const lead = tonic + 12;
  /** Pitches for a bar's onsets over a chord, walking from `from`, drifting toward `aim`. */
  function phraseBar(rhythm, chord, from, aim) {
    const tones = chordTones(chord), scale = chordScale(S.mode, chord);
    const out = [];
    let m = from;
    for (let i = 0; i < rhythm.length; i++) {
      if (rhythm[i] !== 'x') continue;
      const strong = i % 4 === 0;
      if (strong || out.length === 0) m = nearest(tones, tonic, m + Math.sign(aim - m) * (rng() < 0.6 ? 2 : 0));
      else m = scaleStep(scale, tonic, m, (aim > m ? 1 : aim < m ? -1 : rng() < 0.5 ? 1 : -1) * (rng() < 0.8 ? 1 : 2));
      m = Math.max(lead - 8, Math.min(lead + 14, m));
      out.push({ i, m });
    }
    return out;
  }
  /** Re-fit a bar's pitches to another chord (keep the shape, snap strong beats to chord tones). */
  function refit(bar, fromChord, toChord) {
    const shift = ((toChord[0] - fromChord[0]) % 12 + 18) % 12 - 6;       // the smaller way round
    const tones = chordTones(toChord), scale = chordScale(S.mode, toChord);
    return bar.map(({ i, m }) => ({ i, m: i % 4 === 0 ? nearest(tones, tonic, m + shift) : nearest(scale, tonic, m + shift) }));
  }
  function emit(bar, rhythm, b, vel = 0.8) {
    for (let k = 0; k < bar.length; k++) {
      const { i, m } = bar[k];
      let end = i + 1;
      while (end < spb && rhythm[end] === '-') end++;
      const len = S.staccato ? Math.min(end - i, 1) : end - i;
      add(b * spb + i, len, m, vel * (i % 4 === 0 ? 1 : 0.85), 'lead');
    }
  }
  const aims = [lead + 4, lead, lead + 7, lead + 2];
  const a1 = phraseBar(rhythmA[0], chords[0], lead, aims[0]);
  const a2 = phraseBar(rhythmA[1], chords[1], a1.at(-1)?.m ?? lead, aims[1]);
  emit(a1, rhythmA[0], 0); emit(a2, rhythmA[1], 1);
  const a3 = refit(a1, chords[0], chords[2]);
  const a4 = phraseBar(rhythmA[1], chords[3], a3.at(-1)?.m ?? lead, lead - 2);
  emit(a3, rhythmA[0], 2); emit(a4, rhythmA[1], 3);
  const b1 = phraseBar(rhythmB[0], chords[4], lead + 5, aims[2]);
  const b2 = phraseBar(rhythmB[1], chords[5], b1.at(-1)?.m ?? lead + 5, aims[3]);
  emit(b1, rhythmB[0], 4, 0.85); emit(b2, rhythmB[1], 5, 0.85);
  emit(refit(a1, chords[0], chords[6]), rhythmA[0], 6);
  // the last bar: a cadence down to the tonic (held)
  const last = chords[7], lt = chordTones(last);
  const approach = nearest(lt, tonic, lead + 2);
  add(7 * spb, S.waltz ? 4 : 4, approach, 0.8, 'lead');
  add(7 * spb + (S.waltz ? 4 : 6), S.waltz ? 2 : 2, nearest(chordScale(S.mode, last), tonic, approach - 1), 0.7, 'lead');
  add(7 * spb + (S.waltz ? 8 : 8), S.waltz ? 4 : 8, nearest(lt, tonic, lead), 0.85, 'lead');

  // --- accompaniment, bass and drums, bar by bar
  const bassOct = tonic - 24;
  for (let b = 0; b < bars; b++) {
    const chord = chords[b], tones = chordTones(chord);
    const root = bassOct + ((chord[0] % 12) + 12) % 12;
    const fifth = root + 7, octave = root + 12;
    const next = chords[(b + 1) % bars];
    const s0 = b * spb;
    const voice = tones.map(t => nearest([t], tonic, tonic + 2));        // a close voicing around the tonic
    switch (S.harm) {
      case 'arp':
      case 'sparkle':
      case 'musicbox': {
        const up = [...voice, ...voice.map(m => m + 12)].sort((a, b2) => a - b2);
        const seq = S.harm === 'musicbox' ? [0, 2, 1, 2, 3, 2, 1, 2] : S.harm === 'sparkle' ? [0, 1, 2, 3, 4, 3, 2, 1] : [0, 1, 2, 1, 3, 2, 1, 2];
        const every = S.harm === 'arp' ? 1 : 2;
        for (let i = 0, k = 0; i < spb; i += every, k++) add(s0 + i, every, up[seq[k % seq.length] % up.length] + (S.harm === 'arp' ? 0 : 12), S.harm === 'arp' ? 0.35 : 0.45, 'arp');
        break;
      }
      case 'skank':                                                     // offbeat stabs (island)
        for (const i of [2, 6, 10, 14]) for (const m of voice) add(s0 + i, 1, m, 0.3, 'harm');
        break;
      case 'stab':                                                      // jazzy comping
        for (const i of rng() < 0.5 ? [0, 6, 10] : [2, 8, 14]) for (const m of voice) add(s0 + i, 2, m, 0.3, 'harm');
        break;
      case 'strum':                                                     // a strummed chord, then a quick echo
        voice.forEach((m, k) => add(s0 + k, spb / 2 - k, m, 0.3, 'harm'));
        voice.forEach((m, k) => add(s0 + spb / 2 + k + 2, spb / 2 - k - 2, m, 0.22, 'harm'));
        break;
      case 'power':                                                     // driving power chords in 8ths
        for (let i = 0; i < spb; i += 2) { add(s0 + i, 1, root + 24, 0.3, 'harm'); add(s0 + i, 1, root + 31, 0.25, 'harm'); }
        break;
      case 'waltz':                                                     // oom-pah-pah: the chord on beats 2 and 3
        for (const i of [4, 8]) for (const m of voice) add(s0 + i, 2, m, 0.3, 'harm');
        break;
      case 'pad':
      default:
        for (const m of voice) add(s0, spb, m, 0.22, 'harm');
    }
    switch (S.bass) {
      case 'root4': for (let i = 0; i < spb; i += 4) add(s0 + i, 3, i === 8 && rng() < 0.4 ? fifth : root, 0.8, 'bass'); break;
      case 'bounce': [root, octave, fifth, octave, root, octave, fifth, octave].forEach((m, k) => add(s0 + k * 2, 2, m, 0.8, 'bass')); break;
      case 'gallop': for (const i of S.waltz ? [0, 3, 4, 8] : [0, 3, 4, 8, 11, 12]) add(s0 + i, i % 4 === 3 ? 1 : 2, i >= 8 ? fifth : root, i % 4 === 0 ? 0.85 : 0.6, 'bass'); break;
      case 'offbeat': add(s0, 3, root, 0.85, 'bass'); add(s0 + 6, 2, root, 0.6, 'bass'); add(s0 + 8, 3, fifth, 0.8, 'bass'); add(s0 + 14, 2, octave, 0.6, 'bass'); break;
      case 'pedal8': for (let i = 0; i < spb; i += 2) add(s0 + i, 2, i % 8 === 6 ? octave : root, 0.8, 'bass'); break;
      case 'waltz': add(s0, 4, root, 0.85, 'bass'); break;
      case 'ostinato': [root, root + 1, root, fifth, root, root + 3, root + 1, root - 2].forEach((m, k) => add(s0 + k * 2, 2, m, 0.75, 'bass')); break;
      case 'walk': {
        const nextRoot = bassOct + ((next[0] % 12) + 12) % 12;
        const third = root + (tones.includes((chord[0] + 3) % 12) ? 3 : 4);
        const approach = nextRoot + (nextRoot > root ? -1 : 1);
        [root, third, fifth, approach].forEach((m, k) => add(s0 + k * 4, 3, m, 0.8, 'bass'));
        break;
      }
      default: add(s0, spb, root, 0.8, 'bass');
    }
    const D = S.drums;
    if (D === 'none') continue;
    const hit = (i, ch, vel = 0.8) => add(s0 + i, 1, ch === 'kick' ? 36 : ch === 'snare' ? 38 : 42, vel, ch);
    if (D === 'waltz') { hit(0, 'kick'); hit(4, 'hat', 0.5); hit(8, 'hat', 0.5); if (b % 2) hit(10, 'hat', 0.3); continue; }
    if (D === 'soft') { hit(0, 'kick', 0.6); for (let i = 4; i < spb; i += 8) hit(i, 'hat', 0.35); continue; }
    if (D === 'wood') { for (const i of [0, 6, 10]) hit(i, 'kick', 0.6); for (const i of [4, 12]) hit(i, 'snare', 0.45); for (let i = 2; i < spb; i += 4) hit(i, 'hat', 0.3); continue; }
    if (D === 'island') { hit(0, 'kick'); hit(8, 'kick', 0.7); hit(12, 'snare', 0.6); for (const i of [2, 6, 10, 14]) hit(i, 'hat', 0.4); continue; }
    if (D === 'gallop') { for (const i of [0, 8]) hit(i, 'kick'); for (const i of [4, 12]) hit(i, 'snare', 0.6); for (const i of [0, 3, 4, 8, 11, 12]) hit(i, 'hat', 0.35); continue; }
    if (D === 'march') { for (const i of [0, 8]) hit(i, 'kick', 0.8); for (const i of [4, 12, 14]) hit(i, 'snare', i === 14 ? 0.35 : 0.55); continue; }
    if (D === 'swing') { for (const i of [0, 8]) hit(i, 'kick', 0.6); for (const i of [4, 12]) hit(i, 'snare', 0.4); for (const i of [0, 4, 7, 8, 12, 15]) hit(i, 'hat', 0.35); continue; }
    const kicks = D === 'driving' ? [0, 4, 8, 10, 12] : D === 'rock' ? [0, 8, 10] : [0, 8];
    for (const i of kicks) hit(i, 'kick', D === 'light' ? 0.65 : 0.85);
    for (const i of [4, 12]) hit(i, 'snare', D === 'light' ? 0.45 : 0.7);
    for (let i = 0; i < spb; i += D === 'driving' ? 1 : 2) hit(i, 'hat', i % 4 === 0 ? 0.45 : 0.28);
    if (b === bars - 1 && D !== 'light') for (const i of [12, 13, 14, 15]) hit(i, 'snare', 0.4 + (i - 12) * 0.1);   // a fill into the loop
  }
  notes.sort((a, b) => a.step - b.step);
  return { bpm, stepsPerBar: spb, bars, steps: bars * spb, swing: S.swing || 0, echo: S.echo || 0, lead: S.lead, tonic, chords, notes };
}

/** Short jingles (not looped): a fanfare for a win, a sad slide for a loss, a level clear… */
export function composeJingle(kind, seed = 1) {
  const rng = mulberry32(hashSeed('jingle', kind, seed));
  const t = 60 + Math.floor(rng() * 5);
  const n = (step, len, midi, vel = 0.8, ch = 'lead') => ({ step, len, midi, vel, ch });
  const major = [0, 4, 7, 12], minor = [0, 3, 7, 12];
  let notes;
  if (kind === 'victory') notes = [...major.map((i, k) => n(k * 2, 2, t + i)), n(8, 8, t + 16), n(8, 8, t + 12, 0.5, 'harm'), n(0, 4, t - 12, 0.8, 'bass'), n(4, 4, t - 5, 0.8, 'bass'), n(8, 8, t - 12, 0.8, 'bass')];
  else if (kind === 'defeat') notes = [n(0, 3, t + 7), n(3, 3, t + 6), n(6, 3, t + 5), n(9, 8, t + 3), n(0, 6, t - 17, 0.7, 'bass'), n(6, 11, t - 21, 0.7, 'bass')];
  else if (kind === 'clear') notes = [...[0, 4, 7, 11, 12].map((i, k) => n(k, 1, t + i + 12, 0.6, 'arp')), n(5, 6, t + 19, 0.8)];
  else if (kind === 'card') notes = [n(0, 1, t + 12, 0.5, 'arp'), n(1, 1, t + 16, 0.5, 'arp'), n(2, 3, t + 19, 0.6, 'arp')];
  else notes = minor.map((i, k) => n(k * 2, 2, t + i));
  return { bpm: 150, stepsPerBar: 16, bars: 1, steps: Math.max(...notes.map(x => x.step + x.len)), swing: 0, echo: 0.2, lead: 'pulse25', tonic: t, chords: [], notes, jingle: true };
}
