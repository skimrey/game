/**
 * The plane mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HR, SLOT } from '../../engine/palette.js';
import { blit, ellipse, line, poly, rect, ring, text } from '../../engine/pixel.js';
import { drawLandscape } from '../kit/art.js';
import { H, W, blitHalf } from '../kit/view.js';
import { PLANE } from './rules.js';

export function drawPlane(s, view, g, o) {
  const P = PLANE;
  drawLandscape(s, view.land, g.travelled, o.clock, P.ground + 4);
  for (const t of g.things) {
    if (t.done && t.kind !== 'ring') continue;
    const x = g.screenX(t.d);
    if (x < -30 || x > W + 30) continue;
    if (t.kind === 'ring') { const c = t.done ? SLOT.GRAY : SLOT.GOLD; ring(s, x, t.y, t.r, SLOT.INK); ring(s, x, t.y, t.r - 1, c); ring(s, x, t.y, t.r - 2, c); }
    else if (t.kind === 'bird') blit(s, view.minion.frame({ frame: Math.floor(o.clock * 8) }), x - 10, t.y + Math.sin(g.time * 3 + t.phase) * 10 - 10, { flip: true });
    else { ellipse(s, x, t.y, t.r + 4, t.r, SLOT.DARK); ellipse(s, x - 5, t.y - 4, t.r - 2, t.r - 4, SLOT.GRAY); if (Math.floor(o.clock * 3 + t.d) % 5 === 0) line(s, x, t.y + t.r, x - 3, t.y + t.r + 8, SLOT.GOLD); }
  }
  // the biplane
  const y = g.y, tilt = Math.max(-0.5, Math.min(0.5, g.vy / 200));
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    const rot = (x, yy) => [P.planeX + x * Math.cos(tilt) - yy * Math.sin(tilt), y + x * Math.sin(tilt) + yy * Math.cos(tilt)];
    poly(s, [rot(-14, -2), rot(12, -3), rot(14, 2), rot(-12, 3)], HR.ACCENT);
    poly(s, [rot(-4, -9), rot(6, -9), rot(6, -7), rot(-4, -7)], HR.TOP);
    poly(s, [rot(-4, 5), rot(6, 5), rot(6, 7), rot(-4, 7)], HR.TOP);
    poly(s, [rot(-16, -6), rot(-12, -6), rot(-12, 0), rot(-16, 0)], HR.TOP);
    const [px, py] = rot(15, 0);
    rect(s, px, py - (Math.floor(o.clock * 30) % 2 ? 5 : 2), 1, Math.floor(o.clock * 30) % 2 ? 10 : 4, SLOT.GRAY);
    blitHalf(s, view.hero.get('side', 'idle', 0, 0), P.planeX - 6, y - 13);
  }
  rect(s, 8, H - 14, 44, 4, SLOT.DARK); rect(s, 8, H - 14, 44 * Math.min(1, g.fuel / 12), 4, g.fuel < 3 ? SLOT.BAD : SLOT.GOLD);
  text(s, 'FUEL', 8, H - 8, SLOT.WHITE, { shadow: SLOT.INK });
}
