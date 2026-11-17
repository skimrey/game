/**
 * The sled mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { arrow, blit, ellipse, rect, ring, text } from '../../engine/pixel.js';
import { drawStripV, sledSprite, slopeSprite, snowballSprite } from '../kit/art.js';
import { BOSS_SIZE, H, W, drawBoss } from '../kit/view.js';
import { SLED } from './rules.js';

// ---------------------------------------------------------------------------
// Avalanche Run (sled)
// ---------------------------------------------------------------------------
export function drawSled(s, view, g, o) {
  const S = SLED;
  const travel = g.travelled;
  blit(s, view.snow.field, 0, 0);
  drawStripV(s, view.snow.field, 0, travel);
  drawStripV(s, view.snow.edge, -8, travel);
  drawStripV(s, view.snow.edge, W - 52, travel + 97);
  // lane guides
  for (const lx of [136, 184]) for (let y = (-travel % 16 + 16) % 16; y < H; y += 16) rect(s, lx, y, 1, 6, ST.GROUND1);
  // obstacles and ramps
  for (const ob of [...g.objects].sort((a, b) => a.y - b.y)) {
    const spr = slopeSprite(ob.kind);
    blit(s, spr, ob.x - spr.w / 2, ob.y - spr.h / 2);
    if (ob.kind === 'ramp' && !ob.used && Math.floor(o.clock * 6) % 2) arrow(s, ob.x, ob.y - 13, 'up', 7, SLOT.GOLD);   // ride over me!
  }
  // incoming snowballs: a shadow where they'll land, the ball arcing down from the boss
  for (const b of g.snowballs) {
    const k = b.t / b.flight;
    ring(s, b.x, S.heroY, 3 + k * 7, k > 0.7 && Math.floor(o.clock * 12) % 2 ? SLOT.BAD : ST.GROUND2);
    const x = g.bossX + (b.x - g.bossX) * k, y = S.bossY + 20 + (S.heroY - S.bossY - 20) * k - Math.sin(k * Math.PI) * 28;
    blit(s, snowballSprite(), x - 4, y - 4);
  }
  // the boss chases from the top
  drawBoss(s, view, g, g.bossX, S.bossY + BOSS_SIZE - 12 + Math.sin(o.clock * 6) * 2, { clock: o.clock, shadow: false });
  for (const t of g.throws) {
    const [x0, y0] = t.from, x = x0 + (g.bossX - x0) * t.t, y = y0 + (S.bossY + 20 - y0) * t.t - Math.sin(t.t * Math.PI) * 16;
    blit(s, snowballSprite(), x - 4, y - 4);
  }
  // the hero on the sled, seen from behind; airborne: higher, spinning, with a shadow
  const lift = g.airborne > 0 ? Math.sin((1 - g.airborne / S.air) * Math.PI) * 14 : 0;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  ellipse(s, g.x, S.heroY + 9, 9, 3, ST.GROUND2);
  if (!blink) {
    const angle = g.airborne > 0 ? g.spin * Math.PI * 2 : (g.wobble > 0 ? Math.sin(o.clock * 40) * 0.2 : 0);
    blit(s, sledSprite(), g.x - 8, S.heroY - 2 - lift, { angle });
    blit(s, view.hero.get('back', 'sit', 0, Math.floor(o.clock * 8) % 4), g.x - HERO_W / 2, S.heroY - HERO_H + 8 - lift, { angle });
  }
  if (g.wobble > 0 && g.airborne <= 0) text(s, 'OOF!', g.x + 14, S.heroY - 16, SLOT.BAD, { shadow: SLOT.INK });
}
