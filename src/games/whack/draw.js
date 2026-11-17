/**
 * The whack mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, line, pset, rect, solidMap, text } from '../../engine/pixel.js';
import { drawLandscape } from '../kit/art.js';
import { H, W, blitClip, halfSprite } from '../kit/view.js';
import { WHACK } from './rules.js';

// ---------------------------------------------------------------------------
// Whack-a-Critter
// ---------------------------------------------------------------------------
export function drawWhack(s, view, g, o) {
  const Wk = WHACK;
  drawLandscape(s, view.land, 0, o.clock, 64);
  rect(s, 0, 64, W, H - 64, ST.GROUND1);
  for (let i = 0; i < 9; i++) {
    const p = g.holeAt(i), h = g.holes[i];
    ellipse(s, p.x, p.y + 6, 17, 6, ST.GROUND2);
    ellipse(s, p.x, p.y + 6, 14, 4, SLOT.INK);
    if (h) {
      const rise = Math.min(1, (h.up - h.t) / 0.15, h.t / 0.15);
      const lift = Math.round(rise * 14);
      const y = p.y + 6 - lift;
      if (h.kind === 'boss') blitClip(s, halfSprite(view, h.whacked ? 'hurt' : 'attack', Math.floor(o.clock * 4)), p.x - 12, y - 22, p.y + 6);
      else if (h.kind === 'bomb') { ellipse(s, p.x, y - 6, 7, 7, SLOT.INK); ellipse(s, p.x, y - 6, 6, 6, SLOT.DARK); rect(s, p.x + 2, y - 15, 2, 4, SLOT.GOLD); pset(s, p.x + 4, y - 16, Math.floor(o.clock * 10) % 2 ? SLOT.RED : SLOT.GOLD); }
      else blitClip(s, view.minion.frame({ frame: Math.floor(o.clock * 6) + i }), p.x - 10, y - 18, p.y + 6, { map: h.whacked ? solidMap(SLOT.WHITE) : null });
      ellipse(s, p.x, p.y + 8, 16, 3, ST.GROUND1);
    }
    text(s, Wk.labels[i], p.x, p.y + 12, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  }
  for (const sw of g.swings) {
    const p = g.holeAt(sw.hole);
    const a = (sw.t / 0.18) * 1.2;
    line(s, p.x + 14, p.y - 20, p.x + 14 - Math.cos(a) * 12, p.y - 20 + Math.sin(a) * 10 + 12, SLOT.GOLD_DARK);
    rect(s, p.x + 2 - Math.cos(a) * 6, p.y - 10 + Math.sin(a) * 6, 10, 7, sw.hit ? SLOT.RED : SLOT.GRAY);
  }
  blit(s, view.hero.get('front', 'aim', 0, Math.floor(o.clock * 8) % 4), 24, H - HERO_H - 2);
  if (g.escapes % 3) text(s, `${g.escapes % 3}/3 GOT AWAY`, 268, H - 10, SLOT.BAD, { align: 'center', shadow: SLOT.INK });
}
