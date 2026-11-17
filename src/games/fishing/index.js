/**
 * Gone Fishing — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { fishing } from './rules.js';
import { drawFishing } from './draw.js';

export default {
  ...fishing,
  draw: drawFishing,
  heroAt: () => [92, 100],
  bossAt: () => null,
  keys: [['Space', 'cast · hook'], ['hold Space', 'reel']],
};
