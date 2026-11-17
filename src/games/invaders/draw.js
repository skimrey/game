/**
 * The invaders mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { BR, FX, SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, hline } from '../../engine/pixel.js';
import { INVADERS } from './rules.js';
import { drawLandscape, starSprite } from '../kit/art.js';
import { W, drawBoss } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Star Invaders
// ---------------------------------------------------------------------------
export function drawInvaders(s, view, g, o) {
  const I = INVADERS, G = 168;
  drawLandscape(s, view.land, o.clock * 3, o.clock, G);
  drawBoss(s, view, g, g.foe.x, I.bossY + 22, { clock: o.clock, shadow: false });
  for (const m of g.minions) {
    if (!m.alive) continue;
    const p = g.minionAt(m);
    blit(s, view.minion.frame({ frame: Math.floor(o.clock * 4) + m.col }), p.x - 10, p.y - 10);
  }
  for (const b of g.bombs) {
    ellipse(s, b.x, b.y, b.big ? 4 : 2.5, b.big ? 4 : 2.5, SLOT.INK);
    ellipse(s, b.x, b.y, b.big ? 3 : 1.6, b.big ? 3 : 1.6, b.big ? BR.HORN : SLOT.BAD);
  }
  for (const sh of g.shots) { blit(s, starSprite(FX.A + (Math.floor(o.clock * 10) % 4)), sh.x - 6, sh.y - 6); }
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  // the hero on a little hover-cloud
  ellipse(s, g.hero.x, I.heroY + 6, 13, 4, ST.CLOUD1);
  ellipse(s, g.hero.x, I.heroY + 4, 11, 3.5, ST.CLOUD0);
  if (!blink) blit(s, view.hero.get('front', g.result === 'lost' ? 'down' : g.bossHp <= 0 ? 'cheer' : 'aim', 0, Math.floor(o.clock * 8) % 4), g.hero.x - HERO_W / 2 - 2, I.heroY - HERO_H + 6);
  hline(s, 0, W - 1, I.groundY + 10, ST.GROUND2);
}
