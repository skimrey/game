/**
 * The cannon mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { BR, FX, SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, pset, rect, ring, text } from '../../engine/pixel.js';
import { CANNON, hillY } from './rules.js';
import { drawSky, drawStrip } from '../kit/art.js';
import { H, W, drawBoss } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Cannon Duel
// ---------------------------------------------------------------------------
export function drawCannon(s, view, g, o) {
  const C = CANNON;
  drawSky(s, H);
  drawStrip(s, view.land.clouds, 6, o.clock * 4);
  drawStrip(s, view.land.far, 70, 0);
  for (let x = 0; x < W; x++) { const y = Math.round(hillY(x)); rect(s, x, y, 1, H - y, ST.GROUND1); pset(s, x, y, ST.GROUND0); pset(s, x, y + 1, ST.GROUND0); }
  // wind flag
  if (g.boss.wind) {
    rect(s, 150, 20, 1, 18, SLOT.DARK);
    const len = Math.round(g.wind / 3);
    rect(s, len < 0 ? 150 + len : 151, 20, Math.abs(len) + 1, 5, SLOT.RED);
    text(s, 'WIND', 150, 40, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  }
  drawBoss(s, view, g, C.bossX, C.bossY + 4, { clock: o.clock });
  // the hero and the cannon
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('side', 'idle', 0, Math.floor(o.clock * 8) % 4), h.x - HERO_W / 2 - 8, C.ground - HERO_H + 1);
  const bx = h.x + 6, by = C.ground - 8;
  for (let k = 0; k < 14; k++) rect(s, bx + Math.cos(h.angle) * k - 2, by - Math.sin(h.angle) * k - 2, 5, 5, k > 10 ? SLOT.DARK : SLOT.GRAY);
  ellipse(s, bx, by + 3, 5, 5, SLOT.INK); ellipse(s, bx, by + 3, 4, 4, SLOT.GOLD_DARK);
  // aim dots and the power bar
  for (let k = 1; k <= 4; k++) pset(s, bx + Math.cos(h.angle) * (16 + k * 6), by - Math.sin(h.angle) * (16 + k * 6), SLOT.WHITE);
  rect(s, 8, 150, 6, 24, SLOT.INK); rect(s, 9, 151 + 22 * (1 - g.power()), 4, 22 * g.power(), g.power() > 0.85 ? SLOT.BAD : SLOT.GOLD);
  if (g.lastShot) { pset(s, g.lastShot.x, g.lastShot.y - 2, SLOT.WHITE); pset(s, g.lastShot.x - 1, g.lastShot.y - 3, SLOT.WHITE); pset(s, g.lastShot.x + 1, g.lastShot.y - 3, SLOT.WHITE); }
  for (const sh of g.shells) { ellipse(s, sh.x, sh.y, 3, 3, SLOT.INK); ellipse(s, sh.x, sh.y, 2, 2, sh.mine ? SLOT.GOLD : BR.HORN); }
  for (const sh of g.shells) if (!sh.mine) ring(s, sh.target, C.ground - 1, 3 + (1 - Math.min(1, (C.ground - sh.y) / 100)) * 8, SLOT.BAD);
  for (const b of g.blasts) { ring(s, b.x, b.y, 12 - b.t * 20, FX.SPARK); ring(s, b.x, b.y, 8 - b.t * 12, SLOT.GOLD); }
}
