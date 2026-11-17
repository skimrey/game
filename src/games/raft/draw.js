/**
 * The raft mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { FX, SLOT, ST } from '../../engine/palette.js';
import { clear, ellipse, hline, pset, rect, ring } from '../../engine/pixel.js';
import { H, W, blitHalf } from '../kit/view.js';
import { RAFT, riverAt } from './rules.js';

// ---------------------------------------------------------------------------
// Travel: River Raft, Mine Cart, Snowmobile, Biplane
// ---------------------------------------------------------------------------
export function drawRaft(s, view, g, o) {
  const R = RAFT;
  clear(s, ST.GROUND0);
  for (let y = 0; y < H; y++) {
    const d = g.travelled + (y - R.raftY);
    const { c, half } = riverAt(g, d);
    rect(s, 0, y, c - half - 3, 1, ST.MID0);
    rect(s, c - half - 3, y, 3, 1, ST.GROUND2);
    rect(s, c - half, y, half * 2, 1, ST.SKY2);
    rect(s, c + half, y, 3, 1, ST.GROUND2);
    rect(s, c + half + 3, y, W, 1, ST.MID0);
    if (((y + Math.floor(g.travelled)) % 14) === 0) { pset(s, c - half * 0.5, y, ST.SKY1); pset(s, c + half * 0.3, y, ST.SKY1); }
    if (((y * 13 + Math.floor(g.travelled)) % 37) === 0) { rect(s, c - half - 20, y, 4, 4, ST.MID1); rect(s, c + half + 14, y, 4, 4, ST.MID1); }
  }
  for (const ob of g.objects) {
    const y = g.yOf(ob.d);
    if (y < -20 || y > H + 20) continue;
    if (ob.kind === 'whirl') { const r = ob.r; ring(s, ob.x, y, r * 0.9, ST.SKY1); ring(s, ob.x, y, r * 0.55, ST.SKY0); ring(s, ob.x, y, r * 0.25, SLOT.WHITE); }
    else if (ob.kind === 'rock') { ellipse(s, ob.x, y, ob.r + 1, ob.r * 0.7 + 1, SLOT.INK); ellipse(s, ob.x, y, ob.r, ob.r * 0.7, SLOT.GRAY); ellipse(s, ob.x - 2, y - 2, ob.r * 0.4, ob.r * 0.3, FX.SNOW); }
    else { rect(s, ob.x - ob.r, y - 3, ob.r * 2, 7, SLOT.INK); rect(s, ob.x - ob.r + 1, y - 2, ob.r * 2 - 2, 5, SLOT.GOLD_DARK); hline(s, ob.x - ob.r + 2, ob.x + ob.r - 3, y - 1, SLOT.GOLD); }
  }
  for (const st of g.strokes) ring(s, st.x, R.raftY + 4, 3 + (0.4 - st.t) * 14, SLOT.WHITE);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  rect(s, g.x - R.halfWidth - 1, R.raftY - 6, R.halfWidth * 2 + 2, 16, SLOT.INK);
  for (let k = 0; k < 4; k++) rect(s, g.x - R.halfWidth + k * 5, R.raftY - 5, 4, 14, SLOT.GOLD_DARK);
  hline(s, g.x - R.halfWidth, g.x + R.halfWidth - 1, R.raftY - 2, SLOT.GOLD);
  if (!blink) blitHalf(s, view.hero.get('back', 'sit', 0, Math.floor(o.clock * 8) % 4), g.x - 7, R.raftY - 14);
}
