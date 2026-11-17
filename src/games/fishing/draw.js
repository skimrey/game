/**
 * The fishing mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, hline, line, rect, text } from '../../engine/pixel.js';
import { FISHING } from './rules.js';
import { drawLandscape } from '../kit/art.js';
import { H, W, blitClip } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Gone Fishing
// ---------------------------------------------------------------------------
export function drawFishing(s, view, g, o) {
  const F = FISHING;
  drawLandscape(s, view.land, 0, o.clock, F.waterY);
  rect(s, 0, F.waterY, W, H - F.waterY, ST.SKY2);
  for (let y = F.waterY + 4; y < H; y += 6) for (let x = ((y * 7 + Math.floor(o.clock * 20)) % 24); x < W; x += 24) hline(s, x, x + 6, y, ST.SKY1);
  // the pier and the hero
  rect(s, 0, F.waterY - 4, 96, 6, SLOT.GOLD_DARK); for (let x = 10; x < 96; x += 22) rect(s, x, F.waterY + 2, 4, 30, SLOT.GOLD_DARK);
  blit(s, view.hero.get('side', g.phase === 'reeling' ? 'stumble' : 'idle', 0, Math.floor(o.clock * 8) % 4), 56, F.waterY - 4 - HERO_H);
  const tipX = 90, tipY = F.waterY - 40;
  line(s, 70, F.waterY - 20, tipX, tipY, SLOT.GOLD_DARK);
  const bob = g.phase === 'bite' ? 3 + Math.round(Math.sin(o.clock * 30)) : Math.round(Math.sin(o.clock * 3));
  if (g.phase !== 'idle') {
    const bx = F.bobberX, by = F.waterY + bob;
    line(s, tipX, tipY, bx, by - 3, SLOT.WHITE);
    ellipse(s, bx, by, 3, 3, SLOT.RED); rect(s, bx - 2, by - 4, 4, 2, SLOT.WHITE);
    if (g.phase === 'bite') text(s, '!', bx, by - 16, SLOT.GOLD, { scale: 3, align: 'center', shadow: SLOT.INK });
    if (g.phase === 'reeling') {
      // the boss (or a fish) tugging under the water
      if (g.boss.kind !== 'checkpoint') blitClip(s, view.monster.frame({ pose: 'attack', frame: Math.floor(o.clock * 4) }), bx - 24, F.waterY + 18 + Math.sin(o.clock * 5) * 3, H);
      else blit(s, view.minion.frame({ frame: Math.floor(o.clock * 8) }), bx - 10 + Math.sin(o.clock * 7) * 4, F.waterY + 16, { flip: true });
    }
  }
  if (g.phase === 'reeling') {
    const x0 = 110, w = 150, y = 24;
    rect(s, x0 - 2, y - 2, w + 4, 12, SLOT.INK); rect(s, x0, y, w, 8, SLOT.DARK);
    rect(s, x0 + (g.fish - g.boss.zone) * w, y, g.boss.zone * 2 * w, 8, SLOT.CYAN);
    rect(s, x0 + g.fish * w - 1, y - 3, 3, 14, SLOT.GOLD);
    rect(s, x0 + g.tension * w - 1, y - 4, 2, 16, g.red > 0 ? SLOT.BAD : SLOT.WHITE);
    text(s, 'TENSION', x0, y + 12, SLOT.WHITE, { shadow: SLOT.INK });
    rect(s, x0, y + 20, w, 4, SLOT.DARK); rect(s, x0, y + 20, w * g.catch, 4, SLOT.GOLD);
    text(s, 'HOLD SPACE TO REEL', x0 + w, y + 12, SLOT.GOLD, { align: 'right', shadow: SLOT.INK });
  } else if (g.phase === 'idle') text(s, g.lastResult === 'caught' ? 'GOT IT! SPACE TO CAST' : g.lastResult ? `${g.lastResult === 'snap' ? 'SNAP!' : g.lastResult === 'early' ? 'TOO EARLY!' : g.lastResult === 'late' ? 'TOO LATE!' : 'IT GOT AWAY!'} SPACE TO CAST` : 'SPACE TO CAST', W / 2, 30, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
  else if (g.phase === 'waiting') text(s, 'WAIT FOR THE BITE...', W / 2, 30, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
}
