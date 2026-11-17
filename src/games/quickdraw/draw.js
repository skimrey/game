/**
 * The quickdraw mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { FX, SLOT, ST } from '../../engine/palette.js';
import { blit, line, pset, rect, ring, text } from '../../engine/pixel.js';
import { drawLandscape } from '../kit/art.js';
import { W, drawBoss } from '../kit/view.js';
import { QUICKDRAW } from './rules.js';

// ---------------------------------------------------------------------------
// Quick Draw (duck hunt)
// ---------------------------------------------------------------------------
export function drawQuickdraw(s, view, g, o) {
  const Q = QUICKDRAW, G = 150;
  drawLandscape(s, view.land, o.clock * 6, o.clock, G);
  // the boss circles high above
  const bx = 258 + Math.sin(o.clock * 0.9) * 26, by = 60 + Math.sin(o.clock * 1.7) * 6;
  drawBoss(s, view, g, bx, by, { clock: o.clock * 2.5, shadow: false });
  // critters
  for (const c of g.critters) {
    const spr = view.minion.frame({ frame: Math.floor(o.clock * 8 + c.id) });
    if (c.falling) { blit(s, spr, c.x - 10, c.y - 10, { angle: (c.t + c.vy * 0.02) * c.spin * 3, map: null }); continue; }
    blit(s, spr, c.x - 10, c.y - 10, { flip: c.vx < 0 });
    if (c.x < 60 && Math.floor(o.clock * 8) % 2) text(s, '!', c.x, c.y - 18, SLOT.BAD, { align: 'center', shadow: SLOT.INK });   // about to escape
  }
  // shots
  for (const sh of g.shots) {
    if (sh.hit) { ring(s, sh.x, sh.y, 8 - sh.t * 16, SLOT.WHITE); ring(s, sh.x, sh.y, 10 - sh.t * 16, FX.SPARK); }
    else { ring(s, sh.x, sh.y, 4, SLOT.GRAY); pset(s, sh.x, sh.y, SLOT.GRAY); }
  }
  // foreground: a fence, the hero aiming
  rect(s, 0, G + 4, W, 2, ST.GROUND2);
  for (let x = 6; x < W; x += 22) { rect(s, x, G - 10, 3, 16, ST.DET1); }
  rect(s, 0, G - 6, W, 2, ST.DET1); rect(s, 0, G, W, 2, ST.DET1);
  const aiming = g.shots.some(sh => sh.hit && sh.t > 0.2);
  const spr = view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'aim', 0, Math.floor(o.clock * 8) % 4);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, spr, Q.heroX - HERO_W / 2, G + 20 - HERO_H);
  if (aiming) { const sh = g.shots.find(q => q.hit); line(s, Q.heroX + 3, G - 14, sh.x, sh.y, FX.FLASH); }
  // the crosshair (red while reloading)
  const a = g.aim, c = g.reload > 0 ? SLOT.BAD : SLOT.WHITE;
  ring(s, a.x + 0.5, a.y + 0.5, 6, SLOT.INK);
  ring(s, a.x + 0.5, a.y + 0.5, 5, c);
  for (const [dx, dy] of [[-9, 0], [6, 0], [0, -9], [0, 6]]) rect(s, a.x + dx, a.y + dy, dx ? 4 : 1, dy ? 4 : 1, c);
  pset(s, a.x, a.y, c);
}
