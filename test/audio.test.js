/**
 * The chiptune composer (audio/compose.js) and the sound direction (audio/music.js): every
 * place and game gets a tune that loops, stays in key (strong beats on chord tones), stays
 * in a sensible range — and every sound effect the game asks for exists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { composeSong, composeJingle, STYLES, MODES, chordTones, chordScale } from '../src/audio/compose.js';
import { battleStyle, voiceOf } from '../src/audio/music.js';
import { SFX } from '../src/audio/sfx.js';
import { ZONE_IDS } from '../src/world/zones.js';
import { MODES as GAMES, rolesOf } from '../src/games/index.js';

test('every zone has its own style, and every place and game one too', () => {
  for (const z of ZONE_IDS) assert.ok(STYLES[z], z);
  for (const p of ['town', 'home', 'title', 'boss', 'checkpoint', 'travel', 'delve', 'duel', 'cards', 'rift', 'arcade']) assert.ok(STYLES[p], p);
  for (const id of Object.keys(GAMES)) assert.ok(STYLES[battleStyle({ mode: id, kind: rolesOf(id)[0] })], id);
  assert.equal(battleStyle({ mode: 'parry', kind: 'boss' }), 'duel');
  assert.equal(battleStyle({ mode: 'raft', kind: 'travel' }), 'travel');
});

test('songs: 8 bars that loop, strong beats on chord tones, a sensible range, the same for the same seed', () => {
  for (const style of Object.keys(STYLES)) for (let seed = 1; seed <= 8; seed++) {
    const s = composeSong(style, seed);
    assert.deepEqual(composeSong(style, seed), s, 'deterministic');
    assert.equal(s.steps, s.bars * s.stepsPerBar);
    assert.ok(s.bpm >= STYLES[style].bpm[0] && s.bpm <= STYLES[style].bpm[1]);
    assert.equal(s.chords.length, s.bars);
    for (const n of s.notes) {
      assert.ok(n.step >= 0 && n.step < s.steps && n.len >= 1, `${style}: a note inside the loop`);
      assert.ok(n.vel > 0 && n.vel <= 1);
      if (['lead', 'harm', 'arp', 'bass'].includes(n.ch)) assert.ok(n.midi >= 28 && n.midi <= 100, `${style}: ${n.ch} ${n.midi}`);
    }
    const lead = s.notes.filter(n => n.ch === 'lead');
    assert.ok(lead.length >= 12, `${style}: a melody`);
    for (const n of lead.filter(x => x.step % 4 === 0)) {
      const chord = s.chords[Math.floor(n.step / s.stepsPerBar)];
      assert.ok(chordTones(chord).includes(((n.midi - s.tonic) % 12 + 12) % 12), `${style} seed ${seed}: a strong beat off the chord`);
    }
    // mostly stepwise: a catchy tune doesn't leap about
    let leaps = 0;
    for (let i = 1; i < lead.length; i++) if (Math.abs(lead[i].midi - lead[i - 1].midi) > 7) leaps++;
    assert.ok(leaps / lead.length < 0.15, `${style}: ${leaps} leaps`);
  }
  // different seeds, different tunes
  const a = composeSong('meadow', 1).notes.filter(n => n.ch === 'lead').map(n => n.midi).join(), b = composeSong('meadow', 2).notes.filter(n => n.ch === 'lead').map(n => n.midi).join();
  assert.notEqual(a, b);
});

test('the melody scale over a chord never clashes with it (a semitone off a chord tone)', () => {
  for (const mode of Object.keys(MODES)) for (const q of ['maj', 'min', 'dom7']) for (let root = 0; root < 12; root++) {
    const tones = chordTones([root, q]);
    for (const n of chordScale(mode, [root, q])) {
      if (tones.includes(n)) continue;
      assert.ok(!tones.some(t => (t - n + 12) % 12 === 1 || (n - t + 12) % 12 === 1), `${mode} over ${root} ${q}: ${n}`);
    }
  }
});

test('jingles and voices', () => {
  for (const k of ['victory', 'defeat', 'clear', 'card']) { const j = composeJingle(k); assert.ok(j.notes.length >= 3 && j.steps > 0 && j.jingle); }
  const v = voiceOf(42);
  assert.deepEqual(voiceOf(42), v);
  assert.ok(v.base >= 64 && v.base < 82 && SFX.talk);
});

test('every sound effect the game asks for exists', () => {
  const asked = new Set();
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  for (const file of walk('src')) {
    for (const m of readFileSync(file, 'utf8').matchAll(/sound\.fx\('([a-zA-Z0-9]+)'/g)) asked.add(m[1]);
    for (const m of readFileSync(file, 'utf8').matchAll(/sound\.fx\([^)]*\? '([a-zA-Z0-9]+)' : '([a-zA-Z0-9]+)'/g)) { asked.add(m[1]); asked.add(m[2]); }
  }
  for (const file of walk('src')) for (const m of readFileSync(file, 'utf8').matchAll(/EVENT_SOUNDS = \{([^}]*)\}/g)) for (const x of m[1].matchAll(/: '(\w+)'/g)) asked.add(x[1]);
  assert.ok(asked.size > 20);
  for (const name of asked) assert.ok(SFX[name], `missing sound effect: ${name}`);
});

test('every mini-game lists its keys the same way (its index.js keys + kit/keys.js), spells and pause last', async () => {
  const { keysFor } = await import('../src/games/kit/keys.js');
  for (const id of Object.keys(GAMES)) {
    assert.ok(GAMES[id].keys?.length, `${id} has a key guide`);
    const k = keysFor(GAMES[id]);
    assert.deepEqual(k.slice(-2).map(([key]) => key), ['1–5 / Tab', 'Esc']);
  }
});
