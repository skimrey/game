/**
 * Looks — colours for characters who are seen together, picked so everyone is easy to tell apart.
 *
 * Picking colours one at a time at random gives groups where two people share a red jacket, or
 * three faces are nearly the same tone. Here every pick is the one FARTHEST from what the others
 * in view already wear (distance in OKLab, a perceptual colour space) — the first character is a
 * free choice, each next one takes the widest-apart option left. Within one character the pieces
 * must read against each other too: hair against face, top against skin, trousers against top,
 * a hat against hair. And nobody blends into the place they stand in (`avoid`: the zone's sky
 * and ground).
 *
 *   dressApart(design, others, { seed, avoid, context })   recolours design.colors in place
 *   spreadHues(n, { seed, avoid })                 n boss hues as far apart as possible (and off the backdrop)
 *
 * Skins: people's tones light to dark, and — the rules of reality are optional — a few fantasy
 * tones (leaf green, blue, deep purple). Mid-dark and clearly coloured: in review, greyish
 * tones (sage, dusty blue, mauve) read as sickly, light ones as lavender that pops off the
 * screen, and teal as a fish. About one in six people, at most one in a small group, dressed to
 * suit the tone and with a plain face (npcs.js weirdness).
 *
 * No DOM; pure and seeded.
 */
import { mulberry32, hashSeed } from '../levels/generator.js';

// ---------------------------------------------------------------------------
// Colour distance (OKLab)
// ---------------------------------------------------------------------------
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const labCache = new Map();
/** '#rrggbb' (or [r, g, b] 0..255) → [L, a, b] in OKLab. */
export function oklab(color) {
  const key = typeof color === 'string' ? color : color.join(',');
  let v = labCache.get(key);
  if (v) return v;
  const [r, g, b] = (typeof color === 'string' ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : color).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  v = [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  labCache.set(key, v);
  return v;
}
/** Perceptual distance between two colours (0 = the same; ~0.1 clearly different; 1 = black vs white). */
export function colorDistance(a, b) {
  const [L1, a1, b1] = oklab(a), [L2, a2, b2] = oklab(b);
  return Math.hypot(L1 - L2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------
/** People's skin tones, light to dark. */
export const HUMAN_SKINS = ['#ffe0c4', '#f6c9a0', '#e3ad82', '#c98e62', '#a86b45', '#8a5236', '#6b4028', '#4e2f1e'];
/**
 * Fantasy tones, mid-dark and clearly coloured: leaf green (goblin, forest folk), blue (genie),
 * deep purple. Not greyish or pastel tones (sickly; lavender), and not teal (in 3D it read as a
 * fish or a zombie).
 */
export const FANTASY_SKINS = ['#78ad5c', '#4f86c0', '#7a4f8f'];
export const SKIN_TONES = [...HUMAN_SKINS, ...FANTASY_SKINS];
export const isFantasySkin = hex => FANTASY_SKINS.includes(hex);

/** Cloth and hair colours that look good on the blocky characters (curated from character.js SWATCHES). */
export const CLOTH = {
  top: ['#e64d40', '#3385e6', '#4d9e4d', '#8c4dcc', '#f2b32e', '#24a69a', '#ef6fa8', '#f4f4f0', '#33373f', '#e07a2e', '#2e4a8a', '#8c2f39', '#a3c95a', '#ff8a6b', '#5bc0eb', '#6b7a2e', '#b83b7a'],
  hair: ['#2a1c14', '#5a3a22', '#8c5a2b', '#d9a441', '#f1e3b0', '#b8432f', '#e8e8ee', '#6b4fd8', '#25b3a8', '#ff7eb6', '#3a3f58'],
  bottom: ['#334780', '#eeeee6', '#735233', '#2b2e36', '#5c8a3a', '#8c2f39', '#6f7a8c', '#c9b48a', '#4a3a6a'],
  hat: ['#f2f2f5', '#fa7333', '#d93838', '#ffd426', '#2e8cd9', '#3d3d47', '#9c9ca8', '#3aa35a', '#7a4ab8'],
};

const FANTASY_HAIR = ['#6b4fd8', '#25b3a8', '#ff7eb6'];
/**
 * A fantasy face is the loud thing about a person, so the rest of them is chosen to go WITH it:
 * clothes from a small set that suits that tone (earthy with leaf green, gold and
 * wine with blue — the genie look — gold and teal with purple), quiet trousers, and dark or white
 * hair (a yellow moustache on a teal face reads as a duck's bill).
 */
export const FANTASY_OUTFITS = {
  '#78ad5c': { top: ['#f4f4f0', '#8c2f39', '#f2b32e', '#2e4a8a', '#33373f', '#8a5a34'], hat: ['#8a5a34', '#8c2f39', '#f2f2f5', '#ffd426', '#3d3d47'] },
  '#4f86c0': { top: ['#f2b32e', '#8c2f39', '#f4f4f0', '#33373f', '#8c4dcc'], hat: ['#ffd426', '#d93838', '#f2f2f5', '#3d3d47'] },
  '#7a4f8f': { top: ['#f2b32e', '#24a69a', '#f4f4f0', '#33373f', '#e07a2e'], hat: ['#ffd426', '#f2f2f5', '#3d3d47', '#3aa35a'] },
};
const QUIET_HAIR = ['#2a1c14', '#5a3a22', '#3a3f58', '#e8e8ee'];
const QUIET_BOTTOMS = ['#2b2e36', '#334780', '#735233', '#eeeee6', '#6f7a8c', '#4a3a6a', '#c9b48a'];

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------
/**
 * An option as far as can be from every colour in `taken`: a seeded pick among those within
 * `slack` (72 %) of the farthest (so the widest spread without every group coming out the same), among
 * the options that pass `ok` (if none do, among all). Nothing taken yet: any option that's ok.
 */
export function farthest(options, taken, rng, ok = () => true, slack = 0.72, dist = colorDistance) {
  const good = options.filter(ok);
  const pool = good.length ? good : options;
  if (!taken.length) return pool[Math.floor(rng() * pool.length)];
  const scored = pool.map(o => [o, Math.min(...taken.map(t => dist(o, t)))]);
  const best = Math.max(...scored.map(x => x[1]));
  const near = scored.filter(x => x[1] >= best * slack - 1e-9);
  return near[Math.floor(rng() * near.length)][0];
}

const far = (a, b, d) => !a || !b || colorDistance(a, b) >= d;
/**
 * Distance for clothes: hue and colourfulness count double against lightness. (By plain OKLab,
 * white and charcoal are far from everything, so "the farthest colour" kept coming out white or
 * black and a group looked the same; people tell outfits apart by hue.)
 */
export function clothDistance(a, b) {
  const [L1, a1, b1] = oklab(a), [L2, a2, b2] = oklab(b);
  return Math.hypot((L1 - L2) * 0.5, a1 - a2, b1 - b2);
}
/**
 * Two colours that sit next to each other on one small sprite (hat on hair, hair by the top) must
 * differ in a way that survives a few pixels: a clear step in lightness, or a clear turn of hue
 * (red vs pink is far apart in OKLab but reads as "the same reddish blob" at 28×36).
 */
export function distinct(a, b) {
  if (!a || !b) return true;
  const [L1, a1, b1] = oklab(a), [L2, a2, b2] = oklab(b);
  if (Math.abs(L1 - L2) >= 0.15) return true;
  if (Math.min(Math.hypot(a1, b1), Math.hypot(a2, b2)) < 0.05) return colorDistance(a, b) >= 0.15;     // a grey against anything
  return hueGap(Math.atan2(b1, a1) * 180 / Math.PI, Math.atan2(b2, a2) * 180 / Math.PI) >= 40;
}

/**
 * Recolour a design so it stands apart from `others` (the rest of the group in view) and from the
 * `avoid` colours (where it stands). `context` designs (the hero) must not be matched — their
 * clothes are kept clear of — but don't steer the spread, and their skin doesn't count at all
 * (otherwise a light-skinned hero would push every NPC dark, and every run's first NPC would come
 * out in the same "opposite of the hero" colours). Returns the design.
 */
export function dressApart(design, others = [], { seed = 1, avoid = [], fantasy = null, context = [], skin = null } = {}) {
  const rng = mulberry32(hashSeed('dress', seed));
  const c = design.colors;
  const their = slot => others.map(o => o?.colors?.[slot]).filter(Boolean);
  const clear = (slot, o, d = 0.07) => context.every(x => far(o, x?.colors?.[slot], d));
  // skin: about one in four or five of a group may have a fantasy tone (never two in a small group)
  const group = others.length + 1, fantasyNow = their('skin').filter(isFantasySkin).length;
  const wantFantasy = fantasy ?? (fantasyNow < Math.max(1, Math.floor(group / 4)) && rng() < 0.2);
  const contextSkins = context.map(x => x?.colors?.skin).filter(Boolean);
  c.skin = skin || farthest(wantFantasy ? FANTASY_SKINS : HUMAN_SKINS, their('skin'), rng, o => contextSkins.every(x => far(o, x, 0.03)), 0.9);   // (just not the very same tone)
  const suits = FANTASY_OUTFITS[c.skin];                      // (a fantasy face: an outfit chosen to go with it)
  // the top (the biggest patch of colour): apart from the others' tops, off the face, off the backdrop
  c.top = farthest(suits?.top || CLOTH.top, their('top'), rng, o => far(o, c.skin, 0.14) && clear('top', o) && avoid.every(a => far(o, a, 0.12)), 0.72, clothDistance);
  // hair: apart from the others', and it has to read against the face and the top
  // (mostly natural colours; a fantasy face keeps to dark or white hair)
  const hairs = suits ? QUIET_HAIR : rng() < 0.7 ? CLOTH.hair.filter(h => !FANTASY_HAIR.includes(h)) : CLOTH.hair;
  c.hair = farthest(hairs, their('hair'), rng, o => far(o, c.skin, 0.14) && distinct(o, c.top) && clear('hair', o));
  // trousers / skirt: clearly not the top
  c.bottom = farthest(suits ? QUIET_BOTTOMS : CLOTH.bottom, their('bottom'), rng, o => far(o, c.top, 0.16) && distinct(o, c.top) && far(o, c.skin, 0.1));
  // a hat: apart from the hair it sits on and the top, and off the backdrop
  c.hat = farthest(suits?.hat || CLOTH.hat, their('hat'), rng, o => far(o, c.hair, 0.14) && distinct(o, c.hair) && far(o, c.top, 0.12) && far(o, c.skin, 0.1) && clear('hat', o) && avoid.every(a => far(o, a, 0.1)), 0.72, clothDistance);
  return design;
}

/** Circular distance between two hues (degrees). */
export const hueGap = (a, b) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return Math.min(d, 360 - d); };

/**
 * `n` hues spread evenly round the wheel (a triad for three), turned so they sit well away from
 * the `avoid` hues (the backdrop's sky and ground), then handed out in a seeded order.
 */
export function spreadHues(n, { seed = 1, avoid = [] } = {}) {
  const rng = mulberry32(hashSeed('hues', seed));
  const step = 360 / n;
  // every turn of the evenly spaced set, scored by how far its nearest hue sits from the backdrop;
  // any turn at least two-thirds as good as the best will do (so a zone's bosses aren't always
  // the same three colours)
  const turns = [];
  for (let turn = 0; turn < step; turn += 3) {
    const hues = Array.from({ length: n }, (_, i) => turn + i * step);
    turns.push([turn, avoid.length ? Math.min(...hues.flatMap(h => avoid.map(a => hueGap(h, a)))) : 1]);
  }
  const best = Math.max(...turns.map(t => t[1]));
  const good = turns.filter(t => t[1] >= best * 0.66);
  const turn = good[Math.floor(rng() * good.length)][0];
  const hues = Array.from({ length: n }, (_, i) => Math.round(turn + i * step) % 360);
  for (let i = hues.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [hues[i], hues[j]] = [hues[j], hues[i]]; }
  return hues;
}
