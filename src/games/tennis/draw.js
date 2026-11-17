/**
 * The tennis mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { FX, SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, hline, line, pset, rect, text } from '../../engine/pixel.js';
import { H, W, drawBoss } from '../kit/view.js';
import { TENNIS } from './rules.js';

// ---------------------------------------------------------------------------
// Tennis Match
// ---------------------------------------------------------------------------
export function drawTennis(s, view, g, o) {
  const T = TENNIS;
  rect(s, 0, 0, W, H, ST.MID0);
  for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < W; x += 12) pset(s, x, y, ST.MID1);
  // the court
  rect(s, T.left - 8, 14, T.right - T.left + 16, H - 18, ST.GROUND1);
  for (let y = 16; y < H - 6; y += 8) hline(s, T.left - 6, T.right + 5, y, (y / 8) % 2 ? ST.GROUND1 : ST.GROUND0);
  for (const x of [T.left, T.right]) rect(s, x - 1, 14, 2, H - 18, SLOT.WHITE);
  hline(s, T.left, T.right, T.bossY - 8, SLOT.WHITE);
  hline(s, T.left, T.right, T.heroY + 10, SLOT.WHITE);
  rect(s, 159, T.bossY - 8, 1, T.heroY - T.bossY + 18, SLOT.WHITE);
  // the net
  const netY = (T.heroY + T.bossY) / 2;
  rect(s, T.left - 6, netY - 1, T.right - T.left + 12, 4, SLOT.DARK);
  for (let x = T.left - 6; x < T.right + 6; x += 3) pset(s, x, netY, SLOT.GRAY);
  hline(s, T.left - 6, T.right + 5, netY - 2, SLOT.WHITE);
  // the boss (front) and the hero (from behind), each with a racket
  drawBoss(s, view, g, g.foe.x, T.bossY + 14, { clock: o.clock, shadow: false });
  racket(s, g.foe.x + 18, T.bossY + 4, g.foe.swing);
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('back', 'idle', 0, Math.floor(o.clock * 8) % 4), g.hero.x - HERO_W / 2, T.heroY - HERO_H + 18);
  racket(s, g.hero.x + 13, T.heroY - 4, g.hero.swing);
  // the ball, with its shadow and a little bounce arc
  const b = g.ball;
  if (b) {
    const hgt = Math.abs(Math.sin(Math.min(1, b.t / 0.9) * Math.PI)) * 10;
    ellipse(s, b.x, b.y + 2, 3, 1.5, ST.GROUND2);
    ellipse(s, b.x, b.y - hgt, 2.6, 2.6, b.smash ? SLOT.GOLD : FX.SNOW);
    if (b.smash) for (let k = 1; k < 4; k++) pset(s, b.x - b.vx * 0.01 * k, b.y - hgt - b.vy * 0.01 * k, SLOT.GOLD);
  } else if (g.lastPoint && g.result === 'playing') {
    text(s, g.lastPoint === 'hero' ? 'POINT!' : 'OUT!', W / 2, 76, g.lastPoint === 'hero' ? SLOT.GOLD : SLOT.BAD, { scale: 2, align: 'center', shadow: SLOT.INK });
  }
  if (g.rally >= 3) text(s, `RALLY ${g.rally}`, 10, H - 20, SLOT.GOLD, { shadow: SLOT.INK });
}

function racket(s, x, y, swing) {
  const a = swing > 0 ? -0.9 + (0.25 - swing) * 6 : -0.4;
  const hx = x + Math.cos(a) * 8, hy = y + Math.sin(a) * 8;
  line(s, x, y, hx, hy, SLOT.DARK);
  ellipse(s, hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, 3.5, 3.5, SLOT.GOLD_DARK);
  ellipse(s, hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, 2.2, 2.2, SLOT.KEY);
}
