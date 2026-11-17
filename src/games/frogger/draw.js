/**
 * The frogger mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { FX, SLOT, ST } from '../../engine/palette.js';
import { hline, pset, rect, text } from '../../engine/pixel.js';
import { FROGGER } from './rules.js';
import { drawSky } from '../kit/art.js';
import { H, W, blitHalf } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Road Hop
// ---------------------------------------------------------------------------
export function drawFrogger(s, view, g, o) {
  const F = FROGGER, c = F.cell;
  drawSky(s, 40);
  const x0 = F.left, rowY = r => F.bottom - r * c;
  for (let r = 0; r < F.rows; r++) {
    const lane = g.lanes[r], y = rowY(r) - c;
    const color = !lane ? ST.GROUND0 : lane.kind === 'road' ? SLOT.DARK : ST.SKY2;
    rect(s, x0, y, g.width, c, color);
    if (lane?.kind === 'road') for (let x = 0; x < g.width; x += 12) rect(s, x0 + x, y + c / 2, 6, 1, SLOT.GRAY);
    if (lane?.kind === 'river') for (let x = (Math.floor(o.clock * 10 + r * 5) % 16); x < g.width; x += 16) rect(s, x0 + x, y + 4 + (x % 3) * 3, 4, 1, ST.SKY1);
    if (!lane) for (let x = 3; x < g.width; x += 9) pset(s, x0 + x, y + 4 + (x % 5), ST.GROUND2);
    for (const it of g.itemsAt(r)) {
      if (it.x + it.w < 0 || it.x > g.width) continue;
      if (lane.kind === 'road') { rect(s, x0 + it.x, y + 3, it.w, c - 6, SLOT.INK); rect(s, x0 + it.x + 1, y + 4, it.w - 2, c - 8, [FX.A, FX.B, FX.C][r % 3]); rect(s, x0 + it.x + 2, y + c - 4, 3, 2, SLOT.INK); rect(s, x0 + it.x + it.w - 5, y + c - 4, 3, 2, SLOT.INK); }
      else { rect(s, x0 + it.x, y + 2, it.w, c - 4, SLOT.INK); rect(s, x0 + it.x + 1, y + 3, it.w - 2, c - 6, SLOT.GOLD_DARK); hline(s, x0 + it.x + 2, x0 + it.x + it.w - 3, y + 5, SLOT.GOLD); }
    }
  }
  rect(s, 0, 40, x0, H - 40, ST.MID1); rect(s, x0 + g.width, 40, W - x0 - g.width, H - 40, ST.MID1);
  const h = g.hero;
  const hop = h.hop > 0 ? Math.sin((1 - h.hop / F.hop) * Math.PI) * 4 : 0;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blitHalf(s, view.hero.get('back', 'idle', 0, Math.floor(o.clock * 8) % 4), x0 + h.x - 7, rowY(h.row) - c - 4 - hop);
  text(s, `${g.crossings}/${g.boss.hp}`, 6, 6 + 20, SLOT.WHITE, { shadow: SLOT.INK });
}
