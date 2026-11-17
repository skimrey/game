/**
 * The snowmobile mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { FX, HR, SLOT, ST } from '../../engine/palette.js';
import { blit, line, poly, pset, rect, text } from '../../engine/pixel.js';
import { drawSky, drawStrip } from '../kit/art.js';
import { H, W } from '../kit/view.js';
import { SNOWMOBILE, hillAt } from './rules.js';

export function drawSnowmobile(s, view, g, o) {
  const Sm = SNOWMOBILE;
  drawSky(s, H);
  drawStrip(s, view.land.far, 40, g.x * 0.15);
  const toY = h => H - h;
  for (let sx = 0; sx < W; sx++) {
    const x = g.x + (sx - Sm.sledX);
    const gap = g.inCrevasse(x);
    if (gap) { rect(s, sx, toY(hillAt(g, x)) + 10, 1, H, SLOT.INK); continue; }
    const y = Math.round(toY(hillAt(g, x)));
    rect(s, sx, y, 1, H - y, ST.GROUND0);
    pset(s, sx, y, FX.SNOW); if ((Math.floor(x) % 17) === 0) pset(s, sx, y + 5, ST.GROUND1);
  }
  const y = toY(g.y);
  const a = -g.angle;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    blit(s, view.hero.get('side', g.airborne ? 'jump' : 'sit', 0, Math.floor(o.clock * 8) % 4), Sm.sledX - HERO_W / 2, y - HERO_H + 2, { angle: a });
    const pts = [[-12, 0], [12, 0], [14, -5], [-10, -6]].map(([px, py]) => [Sm.sledX + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a)]);
    poly(s, pts, HR.ACCENT);
    line(s, pts[0][0], pts[0][1] + 1, pts[1][0] + 3, pts[1][1] + 1, SLOT.INK);
  }
  if (!g.airborne && Math.floor(o.clock * 20) % 2) pset(s, Sm.sledX - 14, y - 1, FX.SNOW_D);
  rect(s, 8, H - 14, 50, 4, SLOT.DARK); rect(s, 8, H - 14, 50 * g.speed / Sm.maxSpeed, 4, g.crevasses.some(c => c.x > g.x && c.x - g.x < 260) && g.speed < 170 ? SLOT.BAD : SLOT.CYAN);
  text(s, 'SPEED', 8, H - 8, SLOT.WHITE, { shadow: SLOT.INK });
}
