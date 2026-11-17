/**
 * Dungeon Delve — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { delve } from './rules.js';
import { drawDelve, DELVE_HERO_AT, DELVE_BOSS_AT } from './draw.js';

export default {
  ...delve,
  draw: drawDelve,
  heroAt: DELVE_HERO_AT,
  bossAt: DELVE_BOSS_AT,
  keys: [['← →', 'move'], ['Space', 'jump'], ['J', 'attack'], ['hold ↑', 'aim up'], ['K', 'class move']],
};
