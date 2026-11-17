/**
 * The lander mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { arrow, blit, clear, ellipse, line, poly, pset, rect, ring, text } from '../../engine/pixel.js';
import { H, W } from '../kit/view.js';
import { LANDER, groundAt } from './rules.js';

// ---------------------------------------------------------------------------
// Moon Lander
// ---------------------------------------------------------------------------
export function drawLander(s, view, g, o) {
  const L = LANDER;
  clear(s, ST.SKY0);
  for (const [x, y, p] of view.land.stars) if (Math.sin(o.clock * (1 + p * 3) + p * 10) > -0.5) pset(s, x, y, p > 0.7 ? ST.SUN : ST.CLOUD0);
  ellipse(s, 270, 34, 16, 16, ST.SUN);
  for (let x = 0; x < W; x++) { const y = Math.round(groundAt(g, x)); rect(s, x, y, 1, H - y, ST.GROUND1); pset(s, x, y, ST.GROUND0); if ((x * 7) % 23 === 0) pset(s, x, y + 4, ST.GROUND2); }
  g.pads.forEach((p, i) => {
    const lit = i === g.target;
    rect(s, p.x - p.w / 2, p.y, p.w, 3, lit && Math.floor(o.clock * 4) % 2 ? SLOT.GOLD : SLOT.GRAY);
    if (lit) { arrow(s, p.x, p.y - 10 + Math.round(Math.sin(o.clock * 4) * 2), 'down', 7, SLOT.GOLD); }
  });
  const sh = g.ship;
  if (sh && !g.crash) {
    const a = sh.angle;
    const body = [[0, -8], [6, 2], [-6, 2]].map(([x, y]) => [sh.x + x * Math.cos(a) - y * Math.sin(a), sh.y + x * Math.sin(a) + y * Math.cos(a)]);
    poly(s, body, SLOT.GRAY);
    ellipse(s, sh.x, sh.y - 2, 3, 3, SLOT.CYAN);
    for (const side of [-1, 1]) line(s, sh.x + side * 4, sh.y + 2, sh.x + side * 7, sh.y + 6, SLOT.WHITE);
    if (sh.burning) { const f = 3 + Math.floor(o.clock * 30) % 3; rect(s, sh.x - 1, sh.y + 3, 3, f, SLOT.GOLD); pset(s, sh.x, sh.y + 3 + f, SLOT.RED); }
    if (sh.side) rect(s, sh.x - sh.side * 8, sh.y - 2, 2, 2, SLOT.GOLD);
    // gauges: fuel and speed (green = slow enough)
    const speed = Math.hypot(sh.vx, sh.vy);
    rect(s, 8, 24, 40, 4, SLOT.DARK); rect(s, 8, 24, 40 * sh.fuel / g.boss.fuel, 4, SLOT.GOLD);
    text(s, 'FUEL', 8, 30, SLOT.WHITE, { shadow: SLOT.INK });
    rect(s, 8, 40, 40, 4, SLOT.DARK); rect(s, 8, 40, Math.min(40, speed), 4, speed <= L.safeSpeed ? SLOT.CYAN : SLOT.BAD);
    text(s, 'SPEED', 8, 46, SLOT.WHITE, { shadow: SLOT.INK });
  }
  if (g.crash) { ring(s, g.crash.x, g.crash.y, 12 - g.crash.t * 16, SLOT.GOLD); ring(s, g.crash.x, g.crash.y, 7 - g.crash.t * 8, SLOT.RED); }
  blit(s, view.hero.get('front', g.landed > 0 ? 'cheer' : 'idle', 0, Math.floor(o.clock * 8) % 4), W - HERO_W - 4, H - HERO_H - 2);
}
