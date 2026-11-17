/**
 * The echo mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { arrow, blit, ellipse, frame, pset, rect, text } from '../../engine/pixel.js';
import { gaugeMarker } from './rules.js';
import { drawLandscape } from '../kit/art.js';
import { W, drawBoss } from '../kit/view.js';

// ---------------------------------------------------------------------------
// Copycat (echo)
// ---------------------------------------------------------------------------
const HERO_POSE = { up: 'up', down: 'down', left: 'left', right: 'right', oops: 'down' };

export function drawEcho(s, view, g, o) {
  const G = 150;
  drawLandscape(s, view.land, 0, o.clock, G);
  // a little stage: planks
  rect(s, 40, G - 2, 240, 4, ST.GROUND2);
  for (let x = 44; x < 280; x += 12) pset(s, x, G - 1, ST.GROUND0);
  // the boss dances
  const m = g.bossMove;
  const lift = m === 'up' ? 12 : 0, squash = m === 'down' ? 0.22 : 0, angle = m === 'left' ? -0.3 : m === 'right' ? 0.3 : 0;
  const shift = m === 'left' ? -8 : m === 'right' ? 8 : 0;
  drawBoss(s, view, g, 228 + shift, G, { clock: o.clock, lift, squash, angle });
  if (m) {                                                                   // the move, big, above the boss
    ellipse(s, 228, 58, 13, 13, SLOT.PANEL);
    arrow(s, 228, 58, m, 17, SLOT.GOLD);
  }
  // the hero copies
  const hm = g.heroMove?.move;
  const pose = g.result === 'lost' ? 'down' : hm ? HERO_POSE[hm] : g.bossHp <= 0 ? 'cheer' : 'idle';
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('front', pose, 0, Math.floor(o.clock * 8) % 4), 92 - HERO_W / 2, G - HERO_H + 1 - (pose === 'up' || pose === 'cheer' ? 4 : 0));
  if (hm && hm !== 'oops') { ellipse(s, 92, 88, 10, 10, SLOT.PANEL); arrow(s, 92, 88, hm, 13, SLOT.CYAN); }
  // the sequence so far, as slots
  if (o.phase === 'playing' || o.phase === 'countdown') {
    const n = g.sequence.length, size = 15, x0 = W / 2 - (n * size) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * size + size / 2, y = 34;
      const done = g.phase === 'input' && i < g.inputIndex;
      const shown = g.phase === 'show' && i <= g.showIndex;
      rect(s, x - 6, y - 6, 13, 13, done ? SLOT.CYAN : shown ? SLOT.GOLD : SLOT.PANEL);
      frame(s, x - 6, y - 6, 13, 13, SLOT.INK);
      if (done || (shown && i === g.showIndex)) arrow(s, x, y, g.sequence[i], 9, SLOT.INK);
      else if (g.phase === 'input' && i === g.inputIndex && Math.floor(o.clock * 4) % 2) frame(s, x - 7, y - 7, 15, 15, SLOT.WHITE);
    }
    if (g.phase === 'gauge') drawGauge(s, g, o);
    const label = g.phase === 'gauge' ? '' : g.phase === 'input' ? 'YOUR TURN!' : g.phase === 'show' ? 'WATCH!' : g.taunt > 0 ? 'MISSED! NEW ORDER...' : g.gauge?.result === 'hit' && g.phase === 'pause' ? 'NICE TIMING!' : g.bossHp > 0 ? 'GET READY' : '';
    if (label) text(s, label, W / 2, 46, g.phase === 'input' ? SLOT.CYAN : SLOT.WHITE, { scale: 2, align: 'center', shadow: SLOT.INK });
  }
}

function drawGauge(s, g, o) {
  const x0 = 80, w = 160, y = 62;
  rect(s, x0 - 3, y - 3, w + 6, 14, SLOT.INK);
  rect(s, x0, y, w, 8, SLOT.DARK);
  const [a, b] = g.gauge.zone;
  rect(s, x0 + a * w, y, (b - a) * w, 8, SLOT.CYAN);
  const m = gaugeMarker(g.gauge.t, g.boss.gaugePeriod);
  rect(s, x0 + m * w - 1, y - 4, 3, 16, SLOT.WHITE);
  rect(s, x0 + m * w, y - 3, 1, 14, SLOT.INK);
  text(s, 'PRESS SPACE ON THE GREEN!', W / 2, y + 16, Math.floor(o.clock * 4) % 2 ? SLOT.WHITE : SLOT.GOLD, { align: 'center', shadow: SLOT.INK });
}
