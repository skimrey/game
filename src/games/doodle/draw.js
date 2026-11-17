/**
 * The doodle mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, hline, pset, rect, text } from '../../engine/pixel.js';
import { DOODLE } from './rules.js';
import { drawSky, drawStrip } from '../kit/art.js';
import { H, W } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Cloud Hop (doodle jump)
// ---------------------------------------------------------------------------
export function drawDoodle(s, view, g, o) {
  const D = DOODLE;
  const toScreen = y => H - 16 - (y - g.camera);
  drawSky(s, H);
  drawStrip(s, view.land.clouds, 20 + ((g.camera * 0.2) % 60), o.clock * 3);
  // far layer sinks away as you climb
  const farY = H - 40 + g.camera * 0.15;
  if (farY < H) drawStrip(s, view.land.far, farY, 0);
  for (const c of g.clouds) {
    if (c.popped) continue;
    const y = toScreen(c.y);
    if (y < -10 || y > H + 10) continue;
    for (const dx of [0, -D.width, D.width]) {
      const x = c.x + dx;
      if (x < -30 || x > W + 30) continue;
      const body = c.kind === 'thin' ? ST.CLOUD1 : ST.CLOUD0;
      ellipse(s, x, y + 3, D.cloudW / 2 + 1, 5, SLOT.INK);
      ellipse(s, x, y + 3, D.cloudW / 2, 4, body);
      ellipse(s, x - 7, y + 1, 7, 4, body); ellipse(s, x + 6, y + 1, 8, 4.5, body);
      if (c.kind === 'thin') for (let k = -14; k < 15; k += 4) pset(s, x + k, y + 4, SLOT.GRAY);
      if (c.kind === 'drift') { pset(s, x - 15, y + 3, SLOT.CYAN); pset(s, x + 15, y + 3, SLOT.CYAN); }
      if (c.kind === 'spring') { rect(s, x - 3, y - 4, 7, 4, SLOT.GRAY); hline(s, x - 3, x + 3, y - 5, SLOT.GOLD); hline(s, x - 3, x + 3, y - 2, SLOT.GOLD); }
    }
  }
  const h = g.hero;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    const spr = view.hero.get('front', h.vy > 120 ? 'up' : h.vy > 0 ? 'cheer' : 'idle', 0, Math.floor(o.clock * 8) % 4);
    for (const dx of [0, -D.width, D.width]) blit(s, spr, h.x + dx - HERO_W / 2, toScreen(h.y) - HERO_H + 1);
  }
  text(s, `${Math.floor(g.best / D.meter) * 10} M`, 10, H - 12, SLOT.WHITE, { scale: 1, shadow: SLOT.INK });
}
