/**
 * Sound direction: which tune plays where, and the game's events as sound effects.
 *
 *   import { sound } from './audio/music.js';
 *   sound.level(level, index, runSeed)     // a level's own tune, in its zone's style
 *   sound.battle(boss)                     // a mini-game's tune: by its role and game
 *   sound.place('town' | 'home' | 'title' | 'cards' | 'rift' …, seed)
 *   sound.fx('jump')  ·  sound.jingle('victory')  ·  sound.talk(npc, n)
 *
 * Every tune is composed on the spot (compose.js) from a style and a seed — the seed is the
 * level / game / place, so each has its own tune and it's the same one every time you come
 * back. Songs are cached. The audio context starts on the first key press or click (browsers
 * insist); while the tab is hidden it sleeps.
 */
import { createChip } from './synth.js';
import { composeSong, composeJingle, STYLES } from './compose.js';
import { hashSeed, mulberry32 } from '../levels/generator.js';

/** The style for a mini-game (games/index.js mode) in a role. */
export function battleStyle(boss) {
  if (boss.mode === 'parry') return 'duel';
  if (boss.mode === 'delve') return 'delve';
  if (boss.mode === 'cards') return 'cards';
  if (boss.kind === 'travel') return 'travel';
  if (boss.kind === 'checkpoint') return 'checkpoint';
  return 'boss';
}

/** An NPC's talking voice: a pitch, a timbre and how much it wobbles — from its seed. */
export function voiceOf(seed) {
  const r = mulberry32(hashSeed('voice', seed));
  return { base: 64 + Math.floor(r() * 18), wave: ['pulse50', 'pulse25', 'pulse12', 'triangle'][Math.floor(r() * 4)], wobble: 2 + Math.floor(r() * 5) };
}

export function createSound({ chip = createChip(), win = globalThis.window } = {}) {
  const songs = new Map();
  let current = null, lastFx = new Map();
  const song = (style, seed) => {
    const key = `${style}|${seed}`;
    if (!songs.has(key)) songs.set(key, composeSong(STYLES[style] ? style : 'town', seed));
    return songs.get(key);
  };
  if (win?.addEventListener) {
    const unlock = () => { chip.unlock(); if (current) chip.playSong(current); };
    win.addEventListener('keydown', unlock, { capture: true });
    win.addEventListener('pointerdown', unlock, { capture: true });
    win.document?.addEventListener('visibilitychange', () => { if (win.document.hidden) chip.suspend(); else chip.unlock(); });
  }
  const play = s => { current = s; chip.playSong(s); };
  return {
    chip,
    song,
    /** A level's tune (its zone's style, its own seed). */
    level(level, index = 0, runSeed = 0) { play(song(STYLES[level.zone] ? level.zone : 'meadow', hashSeed('level', runSeed, index, level.name))); },
    /** A mini-game's tune. */
    battle(boss) { play(song(battleStyle(boss), hashSeed('battle', boss.mode, boss.theme || '', boss.id || boss.name || ''))); },
    /** A place's tune: town, home, title, cards, rift, arcade … */
    place(style, seed = 1) { play(song(style, hashSeed('place', style, seed))); },
    stop(fade) { current = null; chip.stopMusic(fade); },
    /** Back to a tune that was playing (after a battle). */
    restore(song) { if (song) play(song); },
    /** A sound effect (rate-limited per name, so a burst of events doesn't pile up). */
    fx(name, opts = {}) {
      const now = globalThis.performance?.now?.() ?? Date.now();
      if (now - (lastFx.get(name) ?? -1e9) < (opts.gap ?? 35)) return;
      lastFx.set(name, now);
      chip.sfx(name, opts);
    },
    jingle(kind, seed = 1) { chip.jingle(composeJingle(kind, seed)); },
    /** A blip of an NPC's babble (every other letter). */
    talk(seedOrVoice, n = 0) { chip.sfx('talk', { voice: typeof seedOrVoice === 'object' ? seedOrVoice : voiceOf(seedOrVoice), n }); },
    setVolumes(v) { chip.setVolumes(v); },
    get volumes() { return chip.volumes; },
  };
}

/** The game's sound (one per page). */
export const sound = createSound();
