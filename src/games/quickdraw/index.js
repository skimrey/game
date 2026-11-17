/**
 * Quick Draw — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { quickdraw } from './rules.js';
import { drawQuickdraw } from './draw.js';

export default {
  ...quickdraw,
  draw: drawQuickdraw,
  heroAt: () => [92, 100],
  bossAt: () => [258, 50],
  keys: [['mouse / arrows', 'aim'], ['click / Space', 'shoot']],
};
