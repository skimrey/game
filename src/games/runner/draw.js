/**
 * The runner mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { BR, FX, SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, pset, rect } from '../../engine/pixel.js';
import { drawKeyCap, drawLandscape, spikeSprite } from '../kit/art.js';
import { drawBoss } from '../kit/view.js';
import { RUNNER } from './rules.js';

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
export function drawRunner(s, view, g, o) {
  const R = RUNNER, G = R.ground;
  drawLandscape(s, view.land, g.distance, o.clock, G);
  drawBoss(s, view, g, R.bossX, G, { clock: o.clock });
  for (const sp of g.spikes) {
    const spr = spikeSprite(sp.kind, BR);
    blit(s, spr, sp.x - spr.w / 2, G - spr.h + 1, sp.kind === 'ball' ? { angle: -sp.x / 8 } : {});
  }
  for (const f of g.fireworks) {                                         // fireworks flying into the boss
    const [x0, y0] = f.from, x1 = R.bossX - 8, y1 = G - 34;
    const x = x0 + (x1 - x0) * f.t, y = y0 + (y1 - y0) * f.t - Math.sin(f.t * Math.PI) * 46;
    for (let k = 1; k < 5; k++) rect(s, x - k * 3, y + k * 1.2, 2, 2, [FX.A, FX.B, FX.C, FX.D][k % 4]);
    rect(s, x - 1, y - 1, 3, 3, SLOT.WHITE);
  }
  // the hero: side view, running / backflipping
  const p = g.player;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) {
    let pose = 'run', frameIndex = Math.floor(g.distance / 9) % 4;
    if (o.phase === 'intro' || g.result === 'lost') { pose = g.result === 'lost' ? 'hurt' : 'idle'; frameIndex = 0; }
    else if (!p.grounded) pose = p.vy > 0 ? 'jump' : 'fall';
    else if (p.stumble > 0) pose = 'stumble';
    const spr = view.hero.get('side', pose, frameIndex, Math.floor(o.clock * 8) % 4);
    const x = R.playerX - HERO_W / 2, y = G - HERO_H + 1 - p.y;
    ellipse(s, R.playerX, G, 7 - Math.min(5, p.y / 12), 2, ST.GROUND2);
    blit(s, spr, x, y, p.flipping ? { angle: -p.flip * Math.PI * 2 } : {});
  }
  if (o.phase === 'playing' || o.phase === 'countdown') {
    const bob = Math.round(Math.sin(o.clock * 8) * 1);
    const stumbling = p.stumble > 0;
    const y = G - HERO_H - 14 - p.y + bob;
    drawKeyCap(s, R.playerX, y, g.key.label, stumbling ? { face: SLOT.BAD, side: SLOT.RED_DARK } : {});
    pset(s, R.playerX, y + 10, SLOT.INK); pset(s, R.playerX - 1, y + 9, SLOT.INK); pset(s, R.playerX + 1, y + 9, SLOT.INK);
  }
}
