/**
 * The bomber mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces are in ../kit/.
 */
import { BR, FX, SLOT, ST } from '../../engine/palette.js';
import { blit, dither, ellipse, frame, pset, rect, ring, text } from '../../engine/pixel.js';
import { BOMBER } from './rules.js';
import { H, W, WHITE } from '../kit/overlay.js';
import { blitHalf } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Spore Bomber (grove)
// ---------------------------------------------------------------------------
export function drawBomber(s, view, g, o) {
  const M = BOMBER, c = M.cell;
  rect(s, 0, 0, W, H, ST.MID1);
  dither(s, 0, 0, W, H, ST.MID1, ST.FAR1, 0.25);
  const X = x => M.left + x * c, Y = y => M.top + y * c;
  // the clearing floor
  for (let y = 0; y < M.rows; y++) for (let x = 0; x < M.cols; x++) {
    rect(s, X(x), Y(y), c, c, (x + y) % 2 ? ST.GROUND0 : ST.GROUND1);
    if ((x * 7 + y * 3) % 5 === 0) pset(s, X(x) + 4, Y(y) + 9, ST.DET1);
  }
  // bursts
  for (const bl of g.blasts) for (const [x, y] of bl.cells) {
    dither(s, X(x), Y(y), c, c, FX.B, FX.C, 0.4 + 0.3 * Math.sin(o.clock * 30 + x + y));
    ellipse(s, X(x) + c / 2, Y(y) + c / 2, 4 + bl.t * 6, 4 + bl.t * 6, SLOT.WHITE);
  }
  // stumps, toadstools, power-ups
  for (let y = 0; y < M.rows; y++) for (let x = 0; x < M.cols; x++) {
    const cx = X(x) + c / 2, cy = Y(y) + c / 2;
    if (g.stumps(x, y)) {
      ellipse(s, cx, cy + 1, 7, 6, SLOT.INK); ellipse(s, cx, cy + 1, 6, 5, SLOT.GOLD_DARK);
      ellipse(s, cx, cy, 5, 4, ST.GROUND2); ring(s, cx, cy, 2.5, SLOT.GOLD_DARK); pset(s, cx, cy, SLOT.GOLD_DARK);
    } else if (g.shrooms.has(`${x},${y}`)) {
      rect(s, cx - 1, cy, 3, 6, SLOT.WHITE); frame(s, cx - 2, cy, 5, 7, SLOT.INK);
      ellipse(s, cx, cy - 1, 6, 4, SLOT.INK); ellipse(s, cx, cy - 1, 5, 3, SLOT.RED);
      pset(s, cx - 2, cy - 2, SLOT.WHITE); pset(s, cx + 2, cy - 1, SLOT.WHITE); pset(s, cx, cy - 3, SLOT.WHITE);
    } else if (g.powerUps.has(`${x},${y}`)) {
      const r = 3 + (Math.floor(o.clock * 6) % 2);
      ellipse(s, cx, cy, r + 1, r + 1, SLOT.INK); ellipse(s, cx, cy, r, r, SLOT.GOLD); text(s, '+', cx, cy - 2, SLOT.INK, { align: 'center' });
    }
  }
  // spore-puffs: puffballs that swell and pulse faster as they're about to burst
  for (const b of g.bombs) {
    const cx = X(b.x) + c / 2, cy = Y(b.y) + c / 2;
    const pulse = Math.sin(o.clock * (b.t < 0.6 ? 40 : 12)) > 0 ? 1 : 0;
    ellipse(s, cx, cy + 1, 6 + pulse, 5 + pulse, SLOT.INK);
    ellipse(s, cx, cy + 1, 5 + pulse, 4 + pulse, b.own ? ST.CLOUD0 : BR.BODY);
    pset(s, cx - 2, cy - 1, SLOT.WHITE);
    if (b.t < 0.6 && pulse) ring(s, cx, cy, 7, SLOT.BAD);
  }
  // sporelings, the boss, the hero
  const at = m => { const p = g.pos(m); return [X(p.x) + c / 2, Y(p.y) + c / 2]; };
  for (const m of g.minions) { const [x, y] = at(m); blitHalf(s, view.minion.frame({ frame: Math.floor(o.clock * 8) }), x - 5, y - 6); }
  {
    const [x, y] = at(g.foe);
    const spr = (view.small || view.monster).frame({ pose: g.bossHurt > 0 || g.foe.shield > 0 ? 'hurt' : g.bossAttack > 0 ? 'attack' : 'idle', frame: Math.floor(o.clock * 3) });
    const flash = g.foe.shield > 0 && Math.floor(o.clock * 16) % 2;
    blit(s, spr, x - spr.w / 2, y - spr.h + 7, { map: flash ? WHITE : null });
  }
  const [hx, hy] = at(g.hero);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blitHalf(s, view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'idle', 0, Math.floor(o.clock * 8) % 4), hx - 7, hy - 13);
  // spore-puffs in hand
  for (let i = 0; i < g.maxBombs; i++) {
    const used = i < g.bombs.filter(b => b.own).length;
    ellipse(s, 12 + i * 10, H - 10, 4, 4, SLOT.INK); ellipse(s, 12 + i * 10, H - 10, 3, 3, used ? SLOT.DARK : ST.CLOUD0);
  }
}
