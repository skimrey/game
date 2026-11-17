/**
 * Snowmobile — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *   scene3d.js the 3D version of the journey (kit/travel3d.js runs it)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { snowmobile } from './rules.js';
import scene3d from './scene3d.js';
import { drawSnowmobile } from './draw.js';

export default {
  ...snowmobile,
  draw: drawSnowmobile,
  heroAt: () => [92, 100],
  bossAt: () => null,
  scene3d,
  keys: [['→ / ←', 'throttle / brake'], ['← → in the air', 'tilt']],
};
