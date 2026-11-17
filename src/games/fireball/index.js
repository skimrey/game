/**
 * Spellslinger — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { fireball } from './rules.js';
import { drawFireball } from './draw.js';

export default {
  ...fireball,
  draw: drawFireball,
  heroAt: g => [g.hero.x, 136 - g.hero.y],
  bossAt: () => [272, 110],
  keys: [['← →', 'move'], ['↑', 'jump'], ['X', 'fireball']],
};
