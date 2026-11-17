/**
 * Blade Duel — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { parry, PARRY } from './rules.js';
import { drawParry } from './draw.js';

export default {
  ...parry,
  draw: drawParry,
  heroAt: () => [PARRY.heroX, PARRY.ground - 40],
  bossAt: () => [PARRY.foeX, PARRY.ground - 50],
  keys: [['↑ / – / ↓', 'guard high · mid · low'], ['Space', 'parry']],
};
