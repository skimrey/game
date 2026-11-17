/**
 * The fireball mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { BR, FX, SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, pset, rect, ring } from '../../engine/pixel.js';
import { FIREBALL } from './rules.js';
import { drawLandscape } from '../kit/art.js';
import { drawBoss } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Spellslinger (run & gun)
// ---------------------------------------------------------------------------
export function drawFireball(s, view, g, o) {
  const F = FIREBALL, G = F.ground;
  drawLandscape(s, view.land, o.clock * 20, o.clock, G);
  // the boss floats at the right, shielded unless it's just attacked
  const by = G - g.bossLift;
  drawBoss(s, view, g, F.bossX, by, { clock: o.clock, shadow: false });
  ellipse(s, F.bossX, G - 1, 14, 3, ST.GROUND2);
  if (g.open <= 0 && g.result === 'playing') { ring(s, F.bossX, by - 24, 29, FX.C); if (Math.floor(o.clock * 6) % 2) ring(s, F.bossX, by - 24, 30, FX.SPARK); }
  for (const f of g.foes) {
    if (f.kind === 'goo') {
      const x = f.x, y = G - 4;
      ellipse(s, x, y, 7, 4.5, SLOT.INK); ellipse(s, x, y, 6, 3.5, BR.BELLY); pset(s, x - 2, y - 2, SLOT.WHITE);
      continue;
    }
    const fy = f.kind === 'flyer' ? G - f.y : G - f.y - 7;
    blit(s, view.minion.frame({ frame: Math.floor(o.clock * 8) }), f.x - 10, fy - 10, { flip: true });
  }
  for (const b of g.bolts) {
    for (let k = 1; k < 4; k++) rect(s, b.x - k * 4, b.y - 1 + (k % 2), 2, 2, [SLOT.GOLD, SLOT.RED, FX.D][k - 1]);
    ellipse(s, b.x, b.y, 3.5, 3, SLOT.RED); ellipse(s, b.x + 0.5, b.y, 2, 1.8, SLOT.GOLD);
  }
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    const moving = g.held.has('ArrowLeft') || g.held.has('ArrowRight') || g.held.has('KeyA') || g.held.has('KeyD');
    const pose = !h.grounded ? (h.vy > 0 ? 'jump' : 'fall') : moving ? 'run' : 'idle';
    ellipse(s, h.x, G, 7 - Math.min(5, h.y / 12), 2, ST.GROUND2);
    blit(s, view.hero.get('side', pose, Math.floor(o.clock * 10) % 4, Math.floor(o.clock * 8) % 4), h.x - HERO_W / 2, G - HERO_H + 1 - h.y, { flip: h.facing < 0 });
    if (h.cast > 0) ellipse(s, h.x + 10, G - h.y - 14, 4 * h.cast / 0.18 + 1, 4 * h.cast / 0.18 + 1, SLOT.GOLD);
  }
}
