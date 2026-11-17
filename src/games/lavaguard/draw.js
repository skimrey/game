/**
 * The lavaguard mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces are in ../kit/.
 */
import { HERO_H } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { blit, dither, ellipse, hline, line, poly, pset, rect, ring } from '../../engine/pixel.js';
import { drawLandscape } from '../kit/art.js';
import { H, drawFoe } from '../kit/overlay.js';
import { LAVAGUARD } from './rules.js';

// ---------------------------------------------------------------------------
// Lava Guard (volcano)
// ---------------------------------------------------------------------------
export function drawLavaguard(s, view, g, o) {
  const L = LAVAGUARD;
  drawLandscape(s, view.land, 0, o.clock, 172);
  // the volcano: a big cone behind, the boss in its glowing crater
  const c = L.crater;
  poly(s, [[c.x - 120, 176], [c.x - 22, c.y + 8], [c.x + 22, c.y + 8], [c.x + 120, 176]], ST.FAR0);
  poly(s, [[c.x - 70, 176], [c.x - 18, c.y + 20], [c.x + 18, c.y + 20], [c.x + 70, 176]], ST.FAR1);
  for (const side of [-1, 1]) {                                    // rivulets of lava down the slopes
    let x = c.x + side * 10, y = c.y + 12;
    for (let k = 0; k < 14; k++) { const nx = x + side * (3 + Math.sin(k * 1.7 + side) * 2), ny = y + 7; line(s, x, y, nx, ny, k % 3 ? SLOT.GOLD_DARK : SLOT.GOLD); x = nx; y = ny; }
  }
  drawFoe(s, view, g, c.x, c.y + 14, { clock: o.clock });
  ellipse(s, c.x, c.y + 12, 22, 4, SLOT.GOLD);
  hline(s, c.x - 20, c.x + 20, c.y + 11, SLOT.WHITE);
  // the village
  L.huts.forEach((x, i) => {
    const y = L.hutY, fire = g.burning[i] > 0;
    rect(s, x - 11, y - 12, 22, 13, SLOT.INK); rect(s, x - 10, y - 11, 20, 11, fire ? SLOT.DARK : ST.DET0);
    poly(s, [[x - 14, y - 11], [x, y - 22], [x + 14, y - 11]], SLOT.INK); poly(s, [[x - 12, y - 12], [x, y - 20], [x + 12, y - 12]], fire ? SLOT.GOLD_DARK : SLOT.RED);
    rect(s, x - 2, y - 6, 4, 6, SLOT.INK);
    if (fire) for (let k = 0; k < 4; k++) { const fx = x - 8 + k * 5, h = 4 + Math.abs(Math.sin(o.clock * 12 + k)) * 6; rect(s, fx, y - 22 - h, 2, h, k % 2 ? SLOT.GOLD : SLOT.RED); }
  });
  // the water cannon and the hero beside it
  const cn = L.cannon, ang = Math.atan2(g.aim.y - cn.y, g.aim.x - cn.x);
  for (let k = -1; k <= 1; k++) line(s, cn.x, cn.y + k, cn.x + Math.cos(ang) * 12, cn.y + Math.sin(ang) * 12 + k, SLOT.INK);
  line(s, cn.x, cn.y, cn.x + Math.cos(ang) * 11, cn.y + Math.sin(ang) * 11, SLOT.CYAN);
  ellipse(s, cn.x, cn.y + 4, 7, 5, SLOT.INK); ellipse(s, cn.x, cn.y + 4, 6, 4, SLOT.GRAY);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'aim', 0, Math.floor(o.clock * 8) % 4), cn.x + 10, cn.y - HERO_H + 14);
  // lava bombs with smoky trails, water shots, splashes
  for (const b of g.bombs) {
    for (let k = 1; k <= 4; k++) pset(s, b.x - b.vx * 0.03 * k, b.y - b.vy * 0.03 * k, k < 3 ? SLOT.GOLD_DARK : SLOT.DARK);
    const r = b.big ? 3 : 4;
    ellipse(s, b.x, b.y, r + 1, r + 1, SLOT.INK); ellipse(s, b.x, b.y, r, r, Math.floor(o.clock * 12) % 2 ? SLOT.RED : SLOT.GOLD); pset(s, b.x - 1, b.y - 1, SLOT.WHITE);
  }
  for (const sh of g.shots) { ellipse(s, sh.x, sh.y, 2, 2, SLOT.INK); pset(s, sh.x, sh.y, SLOT.CYAN); pset(s, sh.x - sh.vx * 0.02, sh.y - sh.vy * 0.02, SLOT.CYAN); }
  for (const sp of g.splashes) {
    const r = L.splash * Math.min(1, sp.t / L.grow);
    dither(s, sp.x - r * 0.7, sp.y - r * 0.7, r * 1.4, r * 1.4, SLOT.CYAN, SLOT.WHITE, 0.3);
    ring(s, sp.x, sp.y, r, SLOT.WHITE); ring(s, sp.x, sp.y, Math.max(1, r - 2), SLOT.CYAN);
  }
  // the crosshair
  const a = g.aim;
  ring(s, a.x + 0.5, a.y + 0.5, 6, SLOT.INK); ring(s, a.x + 0.5, a.y + 0.5, 5, g.reload > 0 || g.shots.length >= L.maxShots ? SLOT.BAD : SLOT.WHITE);
  pset(s, a.x, a.y, SLOT.WHITE);
  for (let i = 0; i < L.maxShots; i++) { const used = i < g.shots.length; rect(s, 8 + i * 7, H - 12, 5, 8, SLOT.INK); rect(s, 9 + i * 7, H - 11, 3, 6, used ? SLOT.DARK : SLOT.CYAN); }
}
