/**
 * The starbeat mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { FX, SLOT } from '../../engine/palette.js';
import { blit, hline, rect, ring, text } from '../../engine/pixel.js';
import { drawKeyCap, drawLandscape, starSprite } from '../kit/art.js';
import { INK, drawBoss } from '../kit/view.js';
import { STARBEAT, noteY } from './rules.js';

// ---------------------------------------------------------------------------
// Star Beat (rhythm)
// ---------------------------------------------------------------------------
const LANE_COLORS = [FX.A, FX.B, FX.C, FX.D];

export function drawStarbeat(s, view, g, o) {
  const B = STARBEAT, G = 160;
  drawLandscape(s, view.land, o.clock * 4, o.clock, G);
  // the note highway
  const x0 = B.lanes[0] - 12, x1 = B.lanes[3] + 12;
  rect(s, x0, 0, x1 - x0, G, SLOT.PANEL);
  for (let y = (Math.floor(g.time * 60) % 12); y < G; y += 12) hline(s, x0, x1 - 1, y, SLOT.SHADOW);   // scrolling guide lines
  for (let i = 0; i <= 4; i++) rect(s, x0 + i * 24, 0, 1, G, SLOT.DARK);
  hline(s, x0, x1 - 1, B.hitY, SLOT.WHITE);
  for (let i = 0; i < 4; i++) {
    const lx = B.lanes[i];
    if (g.pressed[i] > 0) rect(s, lx - 11, B.hitY - 8, 23, 16, LANE_COLORS[i]);
    for (const f of g.flashes) if (f.lane === i) { ring(s, lx, B.hitY, 10 - f.t * 20, f.perfect ? SLOT.WHITE : LANE_COLORS[i]); }
    drawKeyCap(s, lx, B.hitY + 15, B.labels[i], { scale: 1 });
  }
  for (const n of g.notes) {
    if (n.hit) continue;
    const y = noteY(n, g.time);
    if (y < -8 || y > G + 8) continue;
    blit(s, starSprite(LANE_COLORS[n.lane]), B.lanes[n.lane] - 6, y - 6, n.missed ? { map: INK } : {});
  }
  // the hero dances on the left, the boss sings on the right
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'dance', g.dancer % 2, Math.floor(o.clock * 8) % 4), 60 - HERO_W / 2, G - HERO_H + 1);
  drawBoss(s, view, g, 266, G, { clock: o.clock, lift: 6 + Math.sin(o.clock * 2) * 4 });
  if (g.streak >= 3) text(s, `${g.streak} STREAK`, 60, 110, SLOT.GOLD, { align: 'center', shadow: SLOT.INK });
}
