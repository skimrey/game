/**
 * The bubble mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces are in ../kit/.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { FX, SLOT, ST } from '../../engine/palette.js';
import { blit, dither, ellipse, frame, hline, line, pset, rect, ring, text } from '../../engine/pixel.js';
import { BUBBLE, JUNK } from './rules.js';
import { drawLandscape } from '../kit/art.js';
import { H, W, drawFoe } from '../kit/overlay.js';

// ---------------------------------------------------------------------------
// Bubble Pop (lagoon)
// ---------------------------------------------------------------------------
export const BUBBLE_COLORS = [FX.A, FX.B, FX.C, FX.D, SLOT.GOLD];

function bubbleAt(s, x, y, color, r = BUBBLE.r) {
  const c = color === JUNK ? SLOT.GRAY : BUBBLE_COLORS[color % BUBBLE_COLORS.length];
  ellipse(s, x, y, r, r, SLOT.INK);
  ellipse(s, x, y, r - 1, r - 1, c);
  if (color === JUNK) { line(s, x - 3, y - 1, x + 2, y + 2, SLOT.DARK); pset(s, x + 2, y - 3, SLOT.DARK); }
  rect(s, x - r * 0.5, y - r * 0.55, 2, 2, SLOT.WHITE);
  pset(s, x - r * 0.5 + 2, y - r * 0.55 + 2, SLOT.WHITE);
}

export function drawBubble(s, view, g, o) {
  const B = BUBBLE;
  drawLandscape(s, view.land, o.clock * 2, o.clock, 150);
  // the boss wallows in the water beside the pool
  drawFoe(s, view, g, 282, 128 + Math.round(Math.sin(o.clock * 1.6) * 2), { clock: o.clock });
  for (let x = 244; x < W; x += 7) hline(s, x, x + 3, 130 + Math.round(Math.sin(o.clock * 3 + x) * 1), SLOT.WHITE);
  // the tide pool: rock walls, a rocky roof with seaweed, water
  dither(s, B.left, B.top, B.right - B.left, H - B.top, ST.SKY1, ST.SKY2, 0.5);
  rect(s, B.left - 10, 12, 10, H - 12, ST.FAR1); rect(s, B.right, 12, 10, H - 12, ST.FAR1);
  rect(s, B.left - 10, 12, B.right - B.left + 20, B.top - 12, ST.FAR0);
  for (let x = B.left - 10; x < B.right + 10; x += 5) pset(s, x, 12 + ((x * 7) % 5), ST.FAR1);
  for (let x = B.left + 6; x < B.right; x += 23) { const sway = Math.round(Math.sin(o.clock * 2 + x) * 1.5); line(s, x, B.top, x + sway, B.top + 8, ST.DET0); }
  frame(s, B.left - 11, 11, B.right - B.left + 22, H - 11, SLOT.INK);
  // the line the bubbles must not reach
  for (let x = B.left; x < B.right; x += 6) hline(s, x, x + 2, B.dangerY, g.lowestY() > B.dangerY - B.rowH * 1.5 && Math.floor(o.clock * 6) % 2 ? SLOT.WHITE : SLOT.BAD);
  // the pile
  for (const [k, c] of g.cells) { const [r, col] = k.split(',').map(Number); const p = g.center(r, col); bubbleAt(s, p.x, p.y, c); }
  for (const p of g.popped) {
    if (p.drop) bubbleAt(s, p.x, p.y, p.color);
    else { ring(s, p.x, p.y, B.r + (0.3 - p.t) * 20, SLOT.WHITE); ring(s, p.x, p.y, B.r * 0.6 + (0.3 - p.t) * 14, BUBBLE_COLORS[Math.max(0, p.color) % 5]); }
  }
  // the aim guide (to the first bounce), the launcher (a clam), the bubbles in hand
  const L = B.launcher;
  if (g.result === 'playing' && !g.shot) {
    let x = L.x, y = L.y - 4;
    const vx = Math.sin(g.angle), vy = -Math.cos(g.angle);
    for (let i = 0; i < 26; i++) {
      x += vx * 5; y += vy * 5;
      if (x < B.left + B.r || x > B.right - B.r || y < B.top + B.r) break;
      if (i % 2 === 0) pset(s, x, y, SLOT.WHITE);
    }
  }
  if (g.shot) bubbleAt(s, g.shot.x, g.shot.y, g.shot.color);
  ellipse(s, L.x, L.y + 6, 16, 7, SLOT.INK); ellipse(s, L.x, L.y + 6, 15, 6, SLOT.GOLD_DARK); hline(s, L.x - 12, L.x + 12, L.y + 3, SLOT.GOLD);
  if (!g.shot) bubbleAt(s, L.x, L.y - 2, g.current);
  bubbleAt(s, L.x + 34, L.y + 4, g.next, 5);
  text(s, 'NEXT', L.x + 34, L.y + 11, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  // the hero beside the launcher
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'aim', 0, Math.floor(o.clock * 8) % 4), 36 - HERO_W / 2, 150 - HERO_H);
}
