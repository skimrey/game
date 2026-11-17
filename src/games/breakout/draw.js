/**
 * The breakout mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H } from '../../characters/heroSprite.js';
import { BR, HR, SLOT, ST } from '../../engine/palette.js';
import { blit, dither, ellipse, hline, rect } from '../../engine/pixel.js';
import { BREAKOUT } from './rules.js';
import { drawSky, drawStrip } from '../kit/art.js';
import { H, banner, drawBoss } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Brick Breaker
// ---------------------------------------------------------------------------
export function drawBreakout(s, view, g, o) {
  const B = BREAKOUT;
  drawSky(s, H);
  drawStrip(s, view.land.far, H - 70, o.clock * 3);
  rect(s, B.left - 3, B.top - 3, B.right - B.left + 6, H - B.top, SLOT.INK);
  dither(s, B.left, B.top, B.right - B.left, H - B.top - 3, ST.SKY0, ST.SKY1, 0.35);
  drawBoss(s, view, g, g.foe.x, B.bossY + 22, { clock: o.clock, shadow: false });
  const colors = [ST.DET0, ST.DET2, ST.MID0];
  for (const br of g.bricks) {
    const c = g.brickAt(br.col, br.row);
    rect(s, c.x - B.brickW / 2, c.y - B.brickH / 2, B.brickW - 1, B.brickH - 1, SLOT.INK);
    rect(s, c.x - B.brickW / 2 + 1, c.y - B.brickH / 2 + 1, B.brickW - 3, B.brickH - 3, colors[br.row % 3]);
    hline(s, c.x - B.brickW / 2 + 1, c.x + B.brickW / 2 - 3, c.y - B.brickH / 2 + 1, SLOT.WHITE);
  }
  for (const goo of g.goo) { ellipse(s, goo.x, goo.y, 4, 5, SLOT.INK); ellipse(s, goo.x, goo.y, 3, 4, BR.BELLY); }
  const p = g.paddle;
  const pc = p.stun > 0 && Math.floor(o.clock * 16) % 2 ? SLOT.GRAY : HR.ACCENT;
  rect(s, p.x - B.paddleW / 2 - 1, B.paddleY - 1, B.paddleW + 2, 6, SLOT.INK);
  rect(s, p.x - B.paddleW / 2, B.paddleY, B.paddleW, 4, pc);
  hline(s, p.x - B.paddleW / 2, p.x + B.paddleW / 2 - 1, B.paddleY, SLOT.WHITE);
  const ball = g.ball || (g.ready ? { x: g.paddle.x, y: B.paddleY - 8 } : null);
  if (ball) { ellipse(s, ball.x, ball.y, B.ball + 1, B.ball + 1, SLOT.INK); ellipse(s, ball.x, ball.y, B.ball, B.ball, SLOT.WHITE); }
  if (g.ready && Math.floor(o.clock * 2) % 2 === 0) banner(s, 'SPACE: LAUNCH', 124, SLOT.WHITE, 1);
  // the hero cheers from the side
  blit(s, view.hero.get('front', g.bossHp <= 0 ? 'cheer' : 'idle', 0, Math.floor(o.clock * 8) % 4), 4, H - HERO_H - 2);
}
