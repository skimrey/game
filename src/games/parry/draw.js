/**
 * The parry mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces are in ../kit/.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { BR, HR, SLOT, ST } from '../../engine/palette.js';
import { blit, ellipse, frame, line, pset, rect, text } from '../../engine/pixel.js';
import { drawKeyCap, drawLandscape } from '../kit/art.js';
import { H, drawFoe } from '../kit/overlay.js';
import { PARRY } from './rules.js';

/** A 2-px line (blades, beams). */
function thick(s, x0, y0, x1, y1, c) {
  line(s, x0, y0, x1, y1, c);
  line(s, x0 + 1, y0, x1 + 1, y1, c);
}

// ---------------------------------------------------------------------------
// Blade Duel
// ---------------------------------------------------------------------------
/** Heights above the ground where strikes land (the glint, the blades). */
export const PARRY_HEIGHT = { high: 60, mid: 38, low: 14 };

export function drawParry(s, view, g, o) {
  const P = PARRY, G = P.ground, f = g.foe;
  drawLandscape(s, view.land, 0, o.clock, G);
  // the duelling ground: a chalk ring
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pset(s, 160 + Math.cos(a) * 112, G + 8 + Math.sin(a) * 7, i % 2 ? SLOT.WHITE : ST.GROUND0);
  }
  const heightY = h => G - PARRY_HEIGHT[h];
  // --- the foe, its blade telegraphing the strike
  const lunge = f.swing > 0 ? -16 * Math.sin((f.swing / 0.25) * Math.PI) : 0;
  const back = f.phase === 'reel' ? 10 + f.t * 8 : f.phase === 'stagger' ? 3 + Math.sin(o.clock * 28) * 2 : 0;
  const fx = Math.round(P.foeX + lunge + back);
  const pose = f.phase === 'reel' ? 'hurt' : f.phase === 'windup' || f.swing > 0 ? 'attack' : null;
  const { hand } = drawFoe(s, view, g, fx, G, { clock: o.clock, scale: 2, pose });
  const windup = f.phase === 'windup' ? 1 - f.t / Math.max(0.01, f.length) : 0;
  // the foe's great blade points at the height it will strike (drawn back a little as it winds up)
  let tip;
  if (f.swing > 0) tip = [P.heroX + 36, heightY(f.target)];
  else if (f.phase === 'windup') tip = [hand[0] - 40 + windup * 10, heightY(f.target) - 4 * windup];
  else if (f.phase === 'stagger' || f.phase === 'reel') tip = [hand[0] - 20, G - 2];
  else tip = [hand[0] - 38, G - 30];
  for (let k = -1; k <= 1; k++) line(s, hand[0], hand[1] + k, tip[0], tip[1] + k, SLOT.INK);
  line(s, hand[0], hand[1], tip[0], tip[1], BR.HORN);
  line(s, hand[0], hand[1] - 1, tip[0], tip[1] - 1, BR.HORN_L);
  rect(s, hand[0] - 2, hand[1] - 6, 4, 13, SLOT.INK); rect(s, hand[0] - 1, hand[1] - 5, 2, 11, BR.HORN_D);   // its crossguard
  // the glint: where the strike will land (a feint makes it jump)
  if (f.phase === 'windup' && g.result === 'playing') {
    const y = heightY(f.target), x = P.heroX + 44, r = 2 + windup * 5;
    const c = windup > 0.7 && Math.floor(o.clock * 16) % 2 ? SLOT.WHITE : SLOT.BAD;
    line(s, x - r, y, x + r, y, c); line(s, x, y - r, x, y + r, c);
    pset(s, x - 1, y - 1, c); pset(s, x + 1, y + 1, c); pset(s, x + 1, y - 1, c); pset(s, x - 1, y + 1, c);
    if (g.feintFlash > 0) text(s, 'FEINT!', x + 8, y - 3, SLOT.GOLD, { shadow: SLOT.INK });
  }
  // --- guard slots beside the hero: where your blade is, where the strike will come
  for (const h of P.heights) {
    const y = heightY(h), mine = g.stance === h, threat = f.phase === 'windup' && f.target === h;
    rect(s, P.heroX + 52, y - 1, 6, 3, mine ? SLOT.CYAN : threat ? SLOT.BAD : SLOT.DARK);
    frame(s, P.heroX + 51, y - 2, 8, 5, SLOT.INK);
  }
  // --- the hero (side view, 2×) and its blade
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  const heroPose = g.result === 'lost' ? 'hurt' : g.bossHp <= 0 ? 'jump' : g.invulnerable > 0.75 ? 'hurt' : g.riposte > 0 ? 'run' : 'idle';
  const hx = P.heroX, hy = G - HERO_H * 2 + 2;
  ellipse(s, hx, G + 1, 16, 3, ST.GROUND2);
  if (!blink) blit(s, view.hero.get('side', heroPose, g.riposte > 0 ? 2 : 0, Math.floor(o.clock * 8) % 4), hx - HERO_W, hy, { scale: 2 });
  const handX = hx + 4, handY = G - 30;
  const stanceTip = { high: [hx + 24, G - 72], mid: [hx + 40, G - 40], low: [hx + 34, G - 8] };
  let [bx, by] = g.offBalance > 0 ? [hx + 24, G - 2] : stanceTip[g.stance];
  if (g.riposte > 0) [bx, by] = [fx - 30, G - 46];
  if (g.result === 'playing' || g.bossHp <= 0) {
    thick(s, handX, handY, bx, by, SLOT.INK);
    line(s, handX + 1, handY - 1, bx, by - 1, SLOT.WHITE);
    line(s, handX + 1, handY, bx, by, SLOT.GRAY);
    const ang = Math.atan2(by - handY, bx - handX) + Math.PI / 2;
    const gx = Math.cos(ang) * 4, gy = Math.sin(ang) * 4;
    thick(s, handX - gx, handY - gy, handX + gx, handY + gy, SLOT.GOLD);                  // crossguard
    rect(s, handX - 1, handY - 1, 3, 3, HR.ACCENT);
  }
  // --- the clash, the prompts
  if (g.clash > 0) {
    const y = heightY(g.clashAt), x = P.heroX + 40;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; line(s, x + Math.cos(a) * 3, y + Math.sin(a) * 3, x + Math.cos(a) * (6 + (0.3 - g.clash) * 30), y + Math.sin(a) * (6 + (0.3 - g.clash) * 30), k % 2 ? SLOT.GOLD : SLOT.WHITE); }
    text(s, 'CLANG!', x, y - 18, SLOT.WHITE, { scale: 2, align: 'center', shadow: SLOT.INK });
  }
  if (g.result === 'playing' && f.phase === 'stagger') {
    text(s, 'PARRY!', 160, 40, Math.floor(o.clock * 10) % 2 ? SLOT.GOLD : SLOT.WHITE, { scale: 3, align: 'center', shadow: SLOT.INK });
    drawKeyCap(s, 160, 66, 'SPACE', { scale: 1 });
  } else if (g.riposte > 0) {
    text(s, 'RIPOSTE!', 160, 40, SLOT.GOLD, { scale: 3, align: 'center', shadow: SLOT.INK });
  } else if (g.offBalance > 0) {
    text(s, 'OFF BALANCE', hx, hy - 10, SLOT.BAD, { align: 'center', shadow: SLOT.INK });
  }
  // --- parries so far: three little swords
  for (let i = 0; i < g.boss.hp; i++) {
    const x = 160 - (g.boss.hp * 12) / 2 + i * 12 + 6, y = H - 10, done = i < g.boss.hp - g.bossHp;
    line(s, x - 3, y + 3, x + 3, y - 3, done ? SLOT.GOLD : SLOT.DARK);
    line(s, x - 2, y + 3, x + 4, y - 3, done ? SLOT.WHITE : SLOT.GRAY);
    line(s, x - 3, y, x, y + 3, done ? SLOT.GOLD_DARK : SLOT.DARK);
  }
}
