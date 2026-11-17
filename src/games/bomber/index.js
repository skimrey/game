/**
 * Spore Bomber — the mini-game as the framework sees it (games/index.js registers it):
 *
 *   rules.js   the rules (pure, deterministic, no DOM) and the bot that plays them
 *   draw.js    the pixel-art scene (320×180, palette indices)
 *
 * Besides the rules' fields (id, name, roles, rules(boss), create(boss, { seed }), bot()), a
 * game descriptor has: draw (the scene), heroAt / bossAt (screen points for effects) and keys
 * (shown the same way in every game — kit/keys.js).
 */
import { bomber, BOMBER } from './rules.js';
import { drawBomber } from './draw.js';

export default {
  ...bomber,
  draw: drawBomber,
  heroAt: g => { const p = g.pos(g.hero); return [BOMBER.left + (p.x + 0.5) * BOMBER.cell, BOMBER.top + (p.y + 0.5) * BOMBER.cell]; },
  bossAt: g => { const p = g.pos(g.foe); return [BOMBER.left + (p.x + 0.5) * BOMBER.cell, BOMBER.top + (p.y + 0.5) * BOMBER.cell]; },
  keys: [['← ↑ → ↓', 'step'], ['Space', 'spore-puff']],
};
