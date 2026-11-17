/**
 * The flappy mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { HR, SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, line, pset, rect, text } from '../../engine/pixel.js';
import { FLAPPY } from './rules.js';
import { drawLandscape } from '../kit/art.js';
import { W } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Flap Dash (flappy)
// ---------------------------------------------------------------------------
export function drawFlappy(s, view, g, o) {
  const F = FLAPPY, G = 158;
  drawLandscape(s, view.land, g.scroll, o.clock, G);
  for (const p of g.pillars) {
    const x = Math.round(p.x - F.pillarW / 2), top = p.gapY - p.gap / 2, bottom = p.gapY + p.gap / 2;
    for (const [y0, y1] of [[0, top], [bottom, G]]) {
      rect(s, x - 1, y0, F.pillarW + 2, y1 - y0, SLOT.INK);
      rect(s, x, y0, F.pillarW, y1 - y0, ST.MID1);
      rect(s, x + 3, y0, 4, y1 - y0, ST.MID0);
      rect(s, x + F.pillarW - 5, y0, 2, y1 - y0, ST.FAR1);
    }
    rect(s, x - 4, top - 7, F.pillarW + 8, 7, SLOT.INK); rect(s, x - 3, top - 6, F.pillarW + 6, 5, ST.DET0);
    rect(s, x - 4, bottom, F.pillarW + 8, 7, SLOT.INK); rect(s, x - 3, bottom + 1, F.pillarW + 6, 5, ST.DET0);
  }
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    // the balloon kite that keeps our hero aloft
    const bx = F.heroX + 2, by = h.y - 24 - (h.flap > 0 ? 2 : 0);
    line(s, F.heroX, h.y - 12, bx, by + 7, SLOT.GRAY);
    ellipse(s, bx, by, 7.5, 8.5, SLOT.INK); ellipse(s, bx, by, 6.5, 7.5, HR.ACCENT); pset(s, bx - 3, by - 3, SLOT.WHITE);
    blit(s, view.hero.get('side', h.flap > 0 ? 'jump' : 'fall', 0, Math.floor(o.clock * 8) % 4), F.heroX - HERO_W / 2, h.y - HERO_H + 14, { angle: Math.max(-0.4, Math.min(0.6, h.vy / 500)) });
  }
  if (g.waiting && g.result === 'playing') text(s, 'PRESS SPACE TO FLAP!', W / 2, 120, Math.floor(o.clock * 3) % 2 ? SLOT.WHITE : SLOT.GOLD, { align: 'center', shadow: SLOT.INK });
}
