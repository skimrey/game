/**
 * Cloud Hop — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { doodle } from './rules.js';
import { drawDoodle } from './draw.js';

export default {
  ...doodle,
  draw: drawDoodle,
  heroAt: g => [g.hero.x, 90],
  bossAt: () => null,
  keys: [['← →', 'steer']],
};
