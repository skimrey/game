/**
 * The minecart mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces (HUD, boss sprite, particles) are in ../kit/view.js.
 */
import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { SLOT, ST } from '../../engine/palette.js';
import { blit, clear, ellipse, hline, pset, rect } from '../../engine/pixel.js';
import { H, W } from '../kit/view.js';
import { MINECART } from './rules.js';

export function drawMinecart(s, view, g, o) {
  const M = MINECART;
  clear(s, ST.FAR1);
  // the mine: rock walls with lanterns, rails
  for (let x = 0; x < W; x += 8) { rect(s, x, 0, 8, 18 + ((x * 7 + Math.floor(g.travelled * 0.5)) % 9), ST.FAR0); }
  for (let k = 0; k < 4; k++) { const lx = ((k * 97 - g.travelled * 0.5) % 400 + 400) % 400 - 40; rect(s, lx, 34, 2, 8, SLOT.DARK); ellipse(s, lx + 1, 46, 3, 3, SLOT.GOLD); }
  rect(s, 0, M.rail + 6, W, H - M.rail - 6, ST.GROUND2);
  const railAt = x => { for (const h of g.hazards) if (h.kind === 'gap' && Math.abs(g.screenX(h.x) - x) < h.w / 2) return false; return true; };
  for (let x = 0; x < W; x++) {
    if (!railAt(x)) continue;
    pset(s, x, M.rail, SLOT.GRAY); pset(s, x, M.rail + 1, SLOT.DARK);
    if (((x + Math.floor(g.travelled)) % 12) < 3) rect(s, x, M.rail + 2, 1, 4, SLOT.GOLD_DARK);
  }
  for (const h of g.hazards) {
    const x = g.screenX(h.x);
    if (x < -30 || x > W + 30) continue;
    if (h.kind === 'beam') { rect(s, x - h.w / 2, 0, h.w, M.rail - 18, SLOT.INK); rect(s, x - h.w / 2 + 1, 0, h.w - 2, M.rail - 19, SLOT.GOLD_DARK); rect(s, x - h.w / 2 - 4, M.rail - 22, h.w + 8, 4, SLOT.GOLD_DARK); }
    else if (h.kind === 'bat') { const y = M.rail - (19 + Math.sin(g.time * 6 + h.phase) * 3) - 5; blit(s, view.minion.frame({ frame: Math.floor(o.clock * 10) }), x - 10, y - 10, { flip: true }); }
    else { rect(s, x - h.w / 2, M.rail, h.w, H - M.rail, SLOT.INK); }
  }
  // the cart
  const y = M.rail - g.y;
  const cartTop = y - 12;
  const blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink) blit(s, view.hero.get('side', g.ducking ? 'sit' : g.grounded ? 'idle' : 'jump', 0, Math.floor(o.clock * 8) % 4), M.cartX - HERO_W / 2, cartTop - HERO_H + 14 + (g.ducking ? 8 : 0));
  rect(s, M.cartX - 12, cartTop, 24, 11, SLOT.INK); rect(s, M.cartX - 11, cartTop + 1, 22, 9, SLOT.GRAY); hline(s, M.cartX - 11, M.cartX + 10, cartTop + 1, SLOT.WHITE);
  for (const wx of [-7, 7]) { ellipse(s, M.cartX + wx, y - 1, 3, 3, SLOT.INK); pset(s, M.cartX + wx, y - 1, SLOT.GOLD); }
}
