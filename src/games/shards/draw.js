/**
 * The shards mini-game's scene in pixel art (rules: ./rules.js). Palette indices into the
 * 320×180 screen; shared pieces are in ../kit/.
 */
import { FX, HR, SLOT, ST } from '../../engine/palette.js';
import { blit, dither, line, poly, pset, rect } from '../../engine/pixel.js';
import { H, W, WHITE } from '../kit/overlay.js';
import { SHARDS } from './rules.js';

// ---------------------------------------------------------------------------
// Shard Storm (crystal)
// ---------------------------------------------------------------------------
/** Call fn(x, y) at a point and at its copies across the wrapping edges it's near. */
function wrapped(x, y, r, fn) {
  const top = SHARDS.top;
  for (const ox of [0, x < r ? W : x > W - r ? -W : null]) {
    if (ox === null) continue;
    for (const oy of [0, y < top + r ? H - top : y > H - r ? -(H - top) : null]) if (oy !== null) fn(x + ox, y + oy);
  }
}

function crystal(s, x, y, r, spin, c) {
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = spin + i * Math.PI / 3, k = i % 2 ? 0.78 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  poly(s, pts.map(([px, py]) => [px + (px > x ? 1 : -1), py + (py > y ? 1 : -1)]), SLOT.INK);
  poly(s, pts, c);
  line(s, pts[0][0], pts[0][1], pts[3][0], pts[3][1], ST.DET2);
  pset(s, x - r * 0.35, y - r * 0.35, SLOT.WHITE);
}

export function drawShards(s, view, g, o) {
  const S = SHARDS;
  // the cavern: dark, glittering, crystals rising from the floor
  rect(s, 0, 0, W, H, ST.SKY0);
  dither(s, 0, H - 60, W, 60, ST.SKY0, ST.SKY1, 0.35);
  for (const [x, y, p] of view.land.stars) if (Math.sin(o.clock * (1 + p * 3) + p * 10) > -0.3) pset(s, x, y + 14, p > 0.6 ? ST.CLOUD0 : ST.SKY2);
  for (let i = 0; i < 9; i++) { const x = (i * 41 + 13) % W, h = 14 + (i * 17) % 26; poly(s, [[x - 7, H], [x, H - h], [x + 7, H]], ST.FAR0); poly(s, [[x - 3, H], [x + 2, H - h * 0.6], [x + 6, H]], ST.FAR1); }
  // crystals
  const color = { big: ST.DET0, medium: ST.DET1, small: ST.DET2 };
  for (const r of g.rocks) wrapped(r.x, r.y, S.radius[r.size] + 2, (x, y) => crystal(s, x, y, S.radius[r.size], r.spin, color[r.size]));
  for (const d of g.dust) for (let k = 0; k < 6; k++) { const a = k * 1.05; pset(s, d.x + Math.cos(a) * (0.4 - d.t) * 40, d.y + Math.sin(a) * (0.4 - d.t) * 40, SLOT.WHITE); }
  // the boss in its ring
  const f = g.foe;
  wrapped(f.x, f.y, 40, (x, y) => {
    const spr = view.monster.frame({ pose: g.bossHp <= 0 || g.bossHurt > 0 ? 'hurt' : g.bossAttack > 0 ? 'attack' : 'idle', frame: Math.floor(o.clock * 3) });
    blit(s, spr, x - spr.w / 2, y - spr.h / 2, { map: g.bossHurt > 0 && Math.floor(o.clock * 20) % 2 ? WHITE : null });
  });
  for (const orb of g.ring) {
    const p = g.orbiterAt(orb);
    if (orb.alive) wrapped(p.x, p.y, 6, (x, y) => { poly(s, [[x, y - 6], [x + 5, y], [x, y + 6], [x - 5, y]], SLOT.INK); poly(s, [[x, y - 5], [x + 4, y], [x, y + 5], [x - 4, y]], FX.A); pset(s, x - 1, y - 2, SLOT.WHITE); });
    else pset(s, p.x, p.y, ST.SKY2);
  }
  // shots
  for (const sh of g.shots) { rect(s, sh.x - 1, sh.y - 1, 2, 2, SLOT.WHITE); pset(s, sh.x - sh.vx * 0.015, sh.y - sh.vy * 0.015, FX.B); }
  // the glider
  const h = g.hero, blink = g.invulnerable > 0 && Math.floor(o.clock * 16) % 2 === 0;
  if (!blink && g.result !== 'lost') wrapped(h.x, h.y, 10, (x, y) => {
    const c = Math.cos(h.angle), sn = Math.sin(h.angle);
    const pt = (f1, f2) => [x + c * f1 - sn * f2, y + sn * f1 + c * f2];
    if (h.thrusting && Math.floor(o.clock * 30) % 2) poly(s, [pt(-5, -2), pt(-11 - (Math.floor(o.clock * 40) % 3), 0), pt(-5, 2)], SLOT.GOLD);
    poly(s, [pt(9, 0), pt(-6, -6), pt(-3, 0), pt(-6, 6)].map(([px, py]) => [px, py]), SLOT.INK);
    poly(s, [pt(8, 0), pt(-5, -5), pt(-2, 0), pt(-5, 5)], HR.ACCENT);
    rect(s, x - 1, y - 1, 2, 2, HR.SKIN); pset(s, x, y - 1, HR.HAIR);
  });
  if (g.result === 'lost') for (let k = 0; k < 8; k++) pset(s, h.x + Math.cos(k) * 6, h.y + Math.sin(k) * 6, HR.ACCENT);
}
