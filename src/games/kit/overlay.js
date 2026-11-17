import { HERO_H, HERO_W } from '../../characters/heroSprite.js';
import { FX, SLOT, ST } from '../../engine/palette.js';
import { blit, dither, ellipse, pset, ring, solidMap, text } from '../../engine/pixel.js';
import { SCREEN } from './common.js';

export const W = SCREEN.w, H = SCREEN.h;

export const WHITE = solidMap(SLOT.WHITE);

/**
 * The opponent: an NPC (drawn from its character design, remapped to the NPC ramp) when
 * the duel is an NPC's quest, else the generated monster. (cx, bottom) anchor, `scale`.
 */
export function drawFoe(s, view, g, cx, bottom, { clock, scale = 1, flip = false, pose = null } = {}) {
  const hurtFlash = g.bossHurt > 0 && Math.floor(clock * 20) % 2;
  if (view.npc) {
    const spr = view.npc.get('side', pose === 'hurt' || g.bossHp <= 0 ? 'hurt' : pose === 'attack' ? 'stumble' : 'idle', 0, Math.floor(clock * 8) % 4);
    blit(s, spr, cx - (HERO_W * scale) / 2, bottom - HERO_H * scale + scale, { flip: !flip, scale, map: hurtFlash ? WHITE : view.npcMap });
    return { top: bottom - HERO_H * scale, hand: [cx - 4 * scale, bottom - 14 * scale] };
  }
  const m = view.monster;
  const p = pose || (g.bossHp <= 0 || g.bossHurt > 0 ? 'hurt' : g.bossAttack > 0 ? 'attack' : 'idle');
  const spr = m.frame({ pose: p, frame: Math.floor(clock * 3) });
  const bob = Math.round(Math.sin(clock * 3) * 1.5) * scale;
  ellipse(s, cx, bottom - 1, 13 * scale, 3, ST.GROUND2);
  blit(s, spr, cx - (spr.w * scale) / 2, bottom - spr.h * scale + bob, { flip, scale, map: hurtFlash ? WHITE : null });
  return { top: bottom - spr.h * scale + bob, hand: [cx - 20 * scale, bottom - 19 * scale] };
}

// ---------------------------------------------------------------------------
// Spells at work (progression/spells.js): a shield bubble round the hero, the slow-motion border,
// the name of the spell just cast.
// ---------------------------------------------------------------------------
export function drawSpellOverlay(s, rt, [hx, hy], clock) {
  if (!rt) return;
  if (rt.guard > 0 && (rt.guard > 1 || Math.floor(clock * 10) % 2)) {
    const r = 17 + Math.sin(clock * 6) * 1.5;
    ring(s, hx, hy, r, SLOT.CYAN); ring(s, hx, hy, r + 1, SLOT.WHITE);
    for (let k = 0; k < 6; k++) { const a = clock * 2 + k * 1.047; pset(s, hx + Math.cos(a) * r, hy + Math.sin(a) * r, SLOT.WHITE); }
  }
  if (rt.slow > 0) {
    const c = rt.slow < 1 && Math.floor(clock * 8) % 2 ? SLOT.WHITE : FX.D;
    dither(s, 0, 0, W, 3, c, SLOT.INK, 0.5); dither(s, 0, H - 3, W, 3, c, SLOT.INK, 0.5);
    dither(s, 0, 0, 3, H, c, SLOT.INK, 0.5); dither(s, W - 3, 0, 3, H, c, SLOT.INK, 0.5);
    text(s, `SLOW ${Math.ceil(rt.slow)}`, 6, 22, c, { shadow: SLOT.INK });
  }
  if (rt.flash) text(s, rt.flash.text, W / 2, 24, SLOT.GOLD, { scale: 2, align: 'center', shadow: SLOT.INK });
}
