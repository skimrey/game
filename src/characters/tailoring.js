/**
 * Tailoring — the tailor at the inn paints patterns onto clothes you own, and recolours
 * glittery trails (pure data; no DOM).
 *
 * A PATTERN is an 8×8 grid (a 64-character string) of pens: 0 leaves the cloth as it is,
 * 1–7 paint it with one of your own outfit's colours (accent, hat, trousers, hair) or white,
 * ink or gold. Using the outfit's colours keeps every design readable in the palettes of the
 * 2D screens (no new colours needed) and means a pattern follows your colour choices.
 * Patterns belong to the ITEM ("top:hoodie", "back:dragonwings"), not to a saved design:
 * wear that item with any design and the pattern comes along.
 *
 *   profile.tailoring → { 'top:hoodie': { pattern }, 'back:cape': { pattern }, 'trail:glitter': { colors: [hex, hex] } }
 *   dress(design, tailoring) → the design with .patterns { top, back } and .trailColors
 *   PENS[k] → { name, slot (2D palette slot), color(design) (3D rgb) }
 *   priceFor(slot, value) → gold
 */
import { HR, SLOT } from '../engine/palette.js';
import { hexToRgb, unlockableFor } from './character.js';

export const GRID = 8;
export const BLANK = '0'.repeat(GRID * GRID);

/** The pens: what each pattern value paints with. */
export const PENS = [
  { name: 'Cloth', slot: null, dark: null, color: null },
  { name: 'Accent', slot: HR.ACCENT, dark: HR.ACCENT_D, color: d => hexToRgb(d.colors.accent) },
  { name: 'Hat colour', slot: HR.HAT, dark: HR.HAT_D, color: d => hexToRgb(d.colors.hat) },
  { name: 'Trousers colour', slot: HR.BOTTOM, dark: HR.BOTTOM_D, color: d => hexToRgb(d.colors.bottom) },
  { name: 'Hair colour', slot: HR.HAIR, dark: HR.HAIR_D, color: d => hexToRgb(d.colors.hair) },
  { name: 'White', slot: HR.EYE_W, dark: HR.EYE_W, color: () => [0.97, 0.97, 0.95] },
  { name: 'Ink', slot: SLOT.INK, dark: SLOT.INK, color: () => [0.1, 0.08, 0.14] },
  { name: 'Gold', slot: SLOT.GOLD, dark: SLOT.GOLD_DARK, color: () => [1, 0.82, 0.25] },
];

/** Ready-made patterns to start from. */
export const PRESETS = {
  stripes: '11111111' + '00000000' + '11111111' + '00000000' + '11111111' + '00000000' + '11111111' + '00000000',
  dots: '00000000' + '01000100' + '00000000' + '00010001' + '00000000' + '01000100' + '00000000' + '00010001',
  checks: '11110000' + '11110000' + '11110000' + '11110000' + '00001111' + '00001111' + '00001111' + '00001111',
  star: '00077000' + '00077000' + '77777777' + '07777770' + '00777700' + '07700770' + '77000077' + '00000000',
  heart: '00000000' + '05505500' + '55555550' + '55555550' + '05555500' + '00555000' + '00050000' + '00000000',
  zigzag: '10000001' + '01000010' + '00100100' + '00011000' + '10000001' + '01000010' + '00100100' + '00011000',
  sash: '10000000' + '01000000' + '00100000' + '00010000' + '00001000' + '00000100' + '00000010' + '00000001',
};

export const cell = (pattern, x, y) => Number(pattern?.[((y % GRID + GRID) % GRID) * GRID + ((x % GRID + GRID) % GRID)] || 0);
export const isBlank = pattern => !pattern || !/[1-7]/.test(pattern);
export const validPattern = p => typeof p === 'string' && p.length === GRID * GRID && /^[0-7]+$/.test(p);

/** What can be tailored in a design: its top, its back item, its trail. */
export function tailorable(design) {
  const out = [{ slot: 'top', value: design.top, key: `top:${design.top}`, kind: 'pattern' }];
  if (design.back && design.back !== 'none') out.push({ slot: 'back', value: design.back, key: `back:${design.back}`, kind: 'pattern' });
  if (design.trail && design.trail !== 'none') out.push({ slot: 'trail', value: design.trail, key: `trail:${design.trail}`, kind: 'colors' });
  return out;
}

/** The tailor's price: plain clothes are cheap, rare things dear — wings and trails dearest. */
export function priceFor(slot, value) {
  const u = unlockableFor(slot, value);
  const base = { common: 30, rare: 50, epic: 80, legendary: 150 }[u?.rarity] ?? 20;
  return slot === 'trail' ? 200 : base;
}

/** A design wearing its tailoring (patterns for its top and back item, trail colours). */
export function dress(design, tailoring = {}) {
  if (!design) return design;
  const top = tailoring[`top:${design.top}`]?.pattern, back = tailoring[`back:${design.back}`]?.pattern, trail = tailoring[`trail:${design.trail}`]?.colors;
  const out = { ...design };
  delete out.patterns; delete out.trailColors;
  const patterns = {};
  if (validPattern(top) && !isBlank(top)) patterns.top = top;
  if (validPattern(back) && !isBlank(back)) patterns.back = back;
  if (Object.keys(patterns).length) out.patterns = patterns;
  if (Array.isArray(trail) && trail.length >= 2) out.trailColors = trail.slice(0, 3);
  return out;
}
