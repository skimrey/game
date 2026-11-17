/**
 * Flap Dash — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { flappy } from './rules.js';
import { drawFlappy } from './draw.js';

export default {
  ...flappy,
  draw: drawFlappy,
  heroAt: g => [84, g.hero.y],
  bossAt: () => null,
  keys: [['Space / ↑ / click', 'flap']],
};
