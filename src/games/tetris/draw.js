/**
 * The tetris mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { FX, SLOT } from '../../engine/palette.js';
import { blit, hline, pset, rect, text } from '../../engine/pixel.js';
import { drawLandscape } from '../kit/art.js';
import { TETRIS, cellsOf } from './rules.js';

// ---------------------------------------------------------------------------
// Block Drop (falling blocks)
// ---------------------------------------------------------------------------
const BLOCK_COLOR = { I: SLOT.CYAN, O: SLOT.GOLD, T: FX.A, S: FX.B, Z: SLOT.RED, J: FX.C, L: FX.D };

function block(s, x, y, c, size) {
  rect(s, x, y, size, size, SLOT.INK);
  rect(s, x + 1, y + 1, size - 2, size - 2, c);
  hline(s, x + 1, x + size - 3, y + 1, SLOT.WHITE);
}

export function drawTetris(s, view, g, o) {
  const T = TETRIS, G = 168, c = T.cell;
  drawLandscape(s, view.land, o.clock * 4, o.clock, G);
  const x0 = T.left, y0 = T.top, w = T.cols * c, h = T.rows * c;
  rect(s, x0 - 3, y0 - 3, w + 6, h + 6, SLOT.INK);
  rect(s, x0 - 2, y0 - 2, w + 4, h + 4, SLOT.GRAY);
  rect(s, x0, y0, w, h, SLOT.PANEL);
  for (let cx = 1; cx < T.cols; cx++) for (let cy = 0; cy < T.rows; cy += 2) pset(s, x0 + cx * c, y0 + cy * c, SLOT.DARK);
  g.well.forEach((row, r) => row.forEach((kind, col) => { if (kind) block(s, x0 + col * c, y0 + r * c, BLOCK_COLOR[kind], c); }));
  for (const fl of g.cleared) rect(s, x0, y0 + fl.row * c, w, c, Math.floor(fl.t * 20) % 2 ? SLOT.WHITE : SLOT.GOLD);
  if (g.piece) {
    const p = g.piece;
    // ghost: where it would land
    let gy = p.y;
    while (g.fits({ ...p, y: gy + 1 })) gy++;
    for (const [cx, cy] of cellsOf(p.kind, p.rot)) if (gy + cy >= 0) { const X = x0 + (p.x + cx) * c, Y = y0 + (gy + cy) * c; rect(s, X + 1, Y + 1, c - 2, 1, SLOT.GRAY); rect(s, X + 1, Y + c - 2, c - 2, 1, SLOT.GRAY); }
    for (const [cx, cy] of cellsOf(p.kind, p.rot)) if (p.y + cy >= 0) block(s, x0 + (p.x + cx) * c, y0 + (p.y + cy) * c, BLOCK_COLOR[p.kind], c);
  }
  // next piece
  rect(s, x0 + w + 10, y0, 40, 34, SLOT.PANEL);
  text(s, 'NEXT', x0 + w + 30, y0 + 3, SLOT.WHITE, { align: 'center' });
  if (g.next) for (const [cx, cy] of cellsOf(g.next, 0)) block(s, x0 + w + 14 + cx * 7, y0 + 12 + cy * 7, BLOCK_COLOR[g.next], 7);
  // the hero cheers on every line
  const cheering = g.cleared.length > 0 || g.bossHp <= 0;
  blit(s, view.hero.get('front', cheering ? 'cheer' : g.invulnerable > 0 ? 'down' : 'idle', 0, Math.floor(o.clock * 8) % 4), 62 - HERO_W / 2, G - HERO_H + 1);
  text(s, `${g.lines} LINES`, 62, G - HERO_H - 8, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
}
