/**
 * Riftcards in pixel art: the cards, the creatures on the table and their little icons.
 * Everything is drawn with palette indices (like the battles); `cardPalette` gives each
 * faction its own colour ramp so every card shows its colours at once.
 *
 *   drawHandCard(s, x, y, id, opts)    a card in your hand (HAND_W × HAND_H)
 *   drawUnit(s, x, y, unit, opts)      a creature on the table (UNIT_W × UNIT_H), its strength now
 *   drawBigCard(s, x, y, id, opts)     the big card in the detail panel (BIG_W × BIG_H)
 *   drawCardBack(s, x, y, w, h)        face down
 *   cardCanvas(id, { scale })          a big card as a <canvas> (deck editor, rewards)
 *
 * Every creature's picture is a generated critter (characters/monsters.js): fliers for the
 * sky row, floaty casters at the back, walkers up front — painted in the faction's ramp and
 * animated (two idle frames; an "attack" frame when it lands).
 */
import { createSurface, rect, pset, blit, ellipse, line, text, ring, hline, vline, frame, poly, textWidth, dither, stipple, circle } from '../engine/pixel.js';
import { SLOT, minionBaseColors, hexToRgb255, buildScheme } from '../engine/palette.js';
import { generateMonster } from '../characters/monsters.js';
import { hashSeed } from '../levels/generator.js';
import { CARDS } from './catalog.js';

export const HAND_W = 30, HAND_H = 42;
export const UNIT_W = 20, UNIT_H = 22;
export const BIG_W = 64, BIG_H = 88;

/**
 * Colour ramps (8 colours each, like the minion ramp 64–71): two per faction — its hue and a
 * neighbour — so creatures of one faction aren't all the same colour.
 */
export const FACTION_HUE = { meadow: 105, lagoon: 182, canyon: 24, grove: 292, alpine: 205, volcano: 6, crystal: 268, starlit: 232, neutral: 42, rift: 318 };
const VARIANT = { meadow: 60, lagoon: 215, canyon: 45, grove: 330, alpine: 175, volcano: 28, crystal: 300, starlit: 260, neutral: 20, rift: 285 };
// 16-colour blocks that don't clash with the hero (32–47) and the opponent (NPC, 80–95) ramps;
// neutral and rift cards have just one ramp (8 colours)
export const RAMP = { meadow: 16, lagoon: 48, canyon: 64, grove: 96, alpine: 112, volcano: 128, crystal: 144, starlit: 160, neutral: 176, rift: 184 };
const HAS_VARIANT = f => f !== 'neutral' && f !== 'rift';
/** Fixed colours of the card table. */
export const CC = {
  RARE: 200, EPIC: 201, LEGEND: 202, PAPER: 203, PAPER_D: 204, FELT: 205, FELT_D: 206, ICE: 207, FELT_L: 208, HEART: 209,
  FROST: 210, DARK: 211, FOG: 212, FOG_D: 213, STORM: 214, STORM_D: 215, FIRE: 216, FIRE_D: 217, WOOD: 218, WOOD_D: 219,
  GREEN: 220, GEM: 221, GEM_D: 222, SUN: 223, MINE: 224, THEIRS: 225, ROW: 226, ROW_D: 227,
  SKY: 228, SKY_L: 229, FIELD: 230, FIELD_L: 231, DUSK: 232, DUSK_L: 233, HILL: 234, SAND: 235,
};
const FIXED = {
  [CC.RARE]: '#4aa3ff', [CC.EPIC]: '#b06bff', [CC.LEGEND]: '#ffcf3a', [CC.PAPER]: '#f6ecd4', [CC.PAPER_D]: '#d9c7a0',
  [CC.FELT]: '#2b2138', [CC.FELT_D]: '#211a2d', [CC.ICE]: '#bfeaff', [CC.FELT_L]: '#3b2f52', [CC.HEART]: '#ff4d6d',
  [CC.FROST]: '#8fd3ff', [CC.DARK]: '#1e1630', [CC.FOG]: '#b8b4c8', [CC.FOG_D]: '#8a869c', [CC.STORM]: '#4a4f7a', [CC.STORM_D]: '#2c2f52',
  [CC.FIRE]: '#ff8a2a', [CC.FIRE_D]: '#d9381e', [CC.WOOD]: '#8a5a34', [CC.WOOD_D]: '#5e3b22', [CC.GREEN]: '#6ee07a',
  [CC.GEM]: '#ff4d8a', [CC.GEM_D]: '#7a2146', [CC.SUN]: '#ffe36e', [CC.MINE]: '#35506e', [CC.THEIRS]: '#5e3550', [CC.ROW]: '#3a2d4e', [CC.ROW_D]: '#30253f',
  // the pictures' backdrops, by row: a sky for fliers, a field for brawlers, dusk for the back row
  [CC.SKY]: '#8fc8f0', [CC.SKY_L]: '#c4e4fa', [CC.FIELD]: '#9cc46a', [CC.FIELD_L]: '#c9e39a', [CC.DUSK]: '#8e7cb8', [CC.DUSK_L]: '#b9a9d8', [CC.HILL]: '#6f9a4a', [CC.SAND]: '#e8d4a0',
};
/** The backdrop of a card's picture: [upper, lower, ground]. */
export const backdropOf = id => {
  const c = CARDS[id];
  if (c.kind === 'special') return [CC.DUSK_L, CC.DUSK, CC.DUSK];
  return c.row === 'sky' ? [CC.SKY_L, CC.SKY, CC.SKY] : c.row === 'back' ? [CC.DUSK_L, CC.DUSK, CC.HILL] : [CC.SKY_L, CC.FIELD_L, CC.FIELD];
};
export const RARITY_COLOR = { common: SLOT.GRAY, rare: CC.RARE, epic: CC.EPIC, legendary: CC.LEGEND };

/** The card table's palette (the players' and the opponent's colours come from buildScheme). */
export function cardPalette({ hero = null, npc = null } = {}) {
  const pal = buildScheme({ theme: 'meadow', hero, npc });
  for (const [f, base] of Object.entries(RAMP)) {
    minionBaseColors({ hue: FACTION_HUE[f] }).forEach((rgb, i) => { pal[base + i] = rgb; });
    if (HAS_VARIANT(f)) minionBaseColors({ hue: VARIANT[f] }).forEach((rgb, i) => { pal[base + 8 + i] = rgb; });
  }
  for (const [i, hex] of Object.entries(FIXED)) pal[i] = hexToRgb255(hex);
  return pal;
}

/** A card's faction colour (the frame, the badges): neutral cards gold, the King's rift pink. */
export const rampOf = id => (id === 'riftking' ? RAMP.rift : RAMP[CARDS[id].faction] ?? RAMP.neutral);
/** The colours of its creature: its faction's ramp or the neighbouring one (by the card). */
export const critterRampOf = id => rampOf(id) + (HAS_VARIANT(CARDS[id].faction) && id !== 'riftking' && hashSeed('card-hue', id) % 2 ? 8 : 0);

// ---------------------------------------------------------------------------
// The critters
// ---------------------------------------------------------------------------
const arts = new Map();
const remaps = new Map();
/** Body shapes that suit each row (arms and claws up front, tentacles at the back, wings in the sky). */
const ROLE_CHOICES = { front: ['brute', 'dancer', 'walker'], back: ['floater', 'dancer', 'brute'], sky: ['flyer', 'floater'] };
export function artRoleFor(id) {
  const c = CARDS[id], list = ROLE_CHOICES[c.row] || ['walker'];
  return list[hashSeed('card-role', id) % list.length];
}
export function cardArt(id) { return artFor(id); }
function artFor(id) {
  if (!arts.has(id)) {
    // the row's body shapes, starting from this card's; the first that draws cleanly at this size
    const list = ROLE_CHOICES[CARDS[id].row] || ['walker'], first = list.indexOf(artRoleFor(id));
    let m = null;
    for (let k = 0; k < list.length && (!m || m.tries >= 40); k++) m = generateMonster(hashSeed('card-art', id), { role: list[(first + k) % list.length], size: 20, ramp: 'minion' });
    arts.set(id, m);
  }
  return arts.get(id);
}
function remapFor(id) {
  const base = critterRampOf(id);
  if (!remaps.has(base)) { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i >= 64 && i < 72 ? base + (i - 64) : i; remaps.set(base, m); }
  return remaps.get(base);
}
/** A creature's picture, its feet at (cx, bottom). */
export function drawCritter(s, id, cx, bottom, { clock = 0, pose = 'idle', scale = 1, flip = false, phase = 0 } = {}) {
  const spr = artFor(id).frame({ pose, frame: Math.floor(clock * 2.4 + phase) });
  blit(s, spr, Math.round(cx - (spr.w * scale) / 2), Math.round(bottom - spr.h * scale), { map: remapFor(id), scale, flip });
}

// ---------------------------------------------------------------------------
// Icons (5×5 abilities, 7×7 rows) and the specials' pictures
// ---------------------------------------------------------------------------
const ICON5 = {
  bond: '01010101011010101010' + '00000',
  muster: '0101011111010101111101010',
  rally: '0010001110101010010000100',
  horn: '1000011000111111100010000',
  spy: '0000001110110110111000000',
  medic: '0010000100111110010000100',
  scorch: '0010001100011101111101110',
  agile: '0000001010111110101000000',
  hero: '0010011111011100101010001',
};
const ICON7 = {
  front: ['0000011', '0000111', '1001110', '0111100', '0011000', '0110100', '1100000'].join(''),     // a sword
  back: ['0001111', '0000011', '0000101', '0001001', '0010000', '0100000', '1000000'].join(''),      // an arrow
  sky: ['1000000', '1100000', '1110000', '1111000', '0111110', '0011111', '0000000'].join(''),       // a wing
};
function bitmap(s, x, y, bits, n, c) { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (bits[j * n + i] === '1') pset(s, x + i, y + j, c); }
export function abilityIcon(s, x, y, ability, c = SLOT.WHITE) { if (ICON5[ability]) bitmap(s, x, y, ICON5[ability], 5, c); }
export function rowIcon(s, x, y, row, c = SLOT.WHITE) { if (ICON7[row]) bitmap(s, x, y, ICON7[row], 7, c); }

/** A gem (the lives of a match): lit or lost. */
export function gemIcon(s, x, y, lit = true) {
  poly(s, [[x + 3, y], [x + 7, y + 3], [x + 3, y + 8], [x - 1, y + 3]], SLOT.INK);
  poly(s, [[x + 3, y + 1], [x + 6, y + 3], [x + 3, y + 7], [x, y + 3]], lit ? CC.GEM : CC.GEM_D);
  if (lit) { pset(s, x + 2, y + 2, SLOT.WHITE); pset(s, x + 3, y + 2, CC.PAPER); }
}

/** The picture of a special card, centred on (cx, cy); k = scale. */
export function specialArt(s, id, cx, cy, clock = 0, k = 1) {
  const e = CARDS[id].effect || {};
  if (e.weather === 'frost') {
    for (let a = 0; a < 3; a++) { const an = a * Math.PI / 3 + clock * 0.3; line(s, cx - Math.cos(an) * 8 * k, cy - Math.sin(an) * 8 * k, cx + Math.cos(an) * 8 * k, cy + Math.sin(an) * 8 * k, CC.FROST); }
    circle(s, cx, cy, 2 * k, CC.ICE); pset(s, cx, cy, SLOT.WHITE);
  } else if (e.weather === 'fog') {
    const d = Math.sin(clock * 1.5) * 2 * k;
    ellipse(s, cx - 4 * k + d, cy + 1 * k, 7 * k, 4 * k, CC.FOG_D); ellipse(s, cx + 4 * k - d, cy - 2 * k, 7 * k, 5 * k, CC.FOG); ellipse(s, cx, cy + 4 * k, 9 * k, 3 * k, CC.FOG);
  } else if (e.weather === 'storm') {
    ellipse(s, cx, cy - 4 * k, 10 * k, 5 * k, CC.STORM); ellipse(s, cx - 4 * k, cy - 5 * k, 5 * k, 4 * k, CC.STORM_D);
    if (Math.floor(clock * 3) % 3 !== 2) poly(s, [[cx + 1 * k, cy - 2 * k], [cx - 4 * k, cy + 4 * k], [cx, cy + 4 * k], [cx - 2 * k, cy + 9 * k], [cx + 5 * k, cy + 2 * k], [cx + 1 * k, cy + 2 * k]], CC.SUN);
  } else if (e.clear) {
    for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4 + clock * 0.5; line(s, cx + Math.cos(an) * 6 * k, cy + Math.sin(an) * 6 * k, cx + Math.cos(an) * 9 * k, cy + Math.sin(an) * 9 * k, CC.SUN); }
    circle(s, cx, cy, 5 * k, SLOT.GOLD); circle(s, cx - 1 * k, cy - 1 * k, 2 * k, CC.SUN);
  } else if (e.horn) {
    poly(s, [[cx - 8 * k, cy - 1 * k], [cx + 5 * k, cy - 6 * k], [cx + 7 * k, cy - 7 * k], [cx + 7 * k, cy + 7 * k], [cx + 5 * k, cy + 6 * k], [cx - 8 * k, cy + 1 * k]], SLOT.GOLD);
    line(s, cx - 8 * k, cy, cx + 6 * k, cy, SLOT.GOLD_DARK);
    const w = (clock * 2) % 1;
    ring(s, cx + 8 * k, cy, (3 + w * 6) * k, w < 0.5 ? SLOT.WHITE : CC.PAPER_D);
  } else if (e.scorch) {
    const f = Math.sin(clock * 9) * k;
    poly(s, [[cx, cy - 9 * k - f], [cx + 6 * k, cy + 2 * k], [cx + 4 * k, cy + 7 * k], [cx - 4 * k, cy + 7 * k], [cx - 6 * k, cy + 2 * k]], CC.FIRE_D);
    poly(s, [[cx, cy - 5 * k + f], [cx + 4 * k, cy + 3 * k], [cx + 2 * k, cy + 7 * k], [cx - 2 * k, cy + 7 * k], [cx - 4 * k, cy + 3 * k]], CC.FIRE);
    ellipse(s, cx, cy + 4 * k, 2 * k, 3 * k, CC.SUN);
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
/** Strength text colour: boosted gold-green, weakened red. */
const strColor = (now, base) => (now > base ? CC.GREEN : now < base ? SLOT.BAD : SLOT.INK);

/** Face down (the other side's hand, the decks). */
export function drawCardBack(s, x, y, w = HAND_W, h = HAND_H) {
  rect(s, x, y, w, h, SLOT.INK);
  rect(s, x + 1, y + 1, w - 2, h - 2, RAMP.rift + 2);
  dither(s, x + 2, y + 2, w - 4, h - 4, RAMP.rift + 2, CC.DARK, 0.5);
  if (w >= 10) { ellipse(s, x + w / 2, y + h / 2, Math.min(6, w / 4), Math.min(8, h / 4), CC.DARK); ellipse(s, x + w / 2, y + h / 2, Math.min(3, w / 6), Math.min(5, h / 6), RAMP.rift); }
}

/** A card in your hand. opts: selected, dim, clock, lift. */
export function drawHandCard(s, x, y, id, { selected = false, dim = false, clock = 0 } = {}) {
  const c = CARDS[id], w = HAND_W, h = HAND_H, base = rampOf(id);
  x = Math.round(x); y = Math.round(y);
  rect(s, x - 1, y - 1, w + 2, h + 2, selected ? SLOT.WHITE : SLOT.INK);
  rect(s, x, y, w, h, c.ability === 'hero' ? CC.LEGEND : RARITY_COLOR[c.rarity]);
  rect(s, x + 1, y + 1, w - 2, h - 2, CC.PAPER);
  // the picture
  const [top, mid, ground] = backdropOf(id);
  rect(s, x + 2, y + 2, w - 4, 27, mid);
  dither(s, x + 2, y + 2, w - 4, 12, top, mid, 0.35);
  rect(s, x + 2, y + 24, w - 4, 5, ground);
  if (c.kind === 'special') specialArt(s, id, x + w / 2, y + 15, clock);
  else drawCritter(s, id, x + w / 2, y + 28, { clock, phase: id.length });
  frame(s, x + 2, y + 2, w - 4, 27, base + 2);
  // strength (creatures) in a gem at the top left; the row and the ability along the bottom
  if (c.kind === 'creature') {
    circle(s, x + 6, y + 6, 5, SLOT.INK);
    circle(s, x + 6, y + 6, 4, c.ability === 'hero' ? CC.LEGEND : CC.PAPER);
    text(s, String(c.str), x + 6, y + 4, SLOT.INK, { align: 'center' });
    rowIcon(s, x + 3, y + 32, c.ability === 'agile' ? 'front' : c.row, SLOT.INK);
    if (c.ability === 'agile') rowIcon(s, x + 11, y + 32, 'back', SLOT.INK);
    if (c.ability) { rect(s, x + w - 9, y + 32, 7, 7, SLOT.INK); abilityIcon(s, x + w - 8, y + 33, c.ability, c.ability === 'hero' ? CC.LEGEND : SLOT.WHITE); }
  } else {
    text(s, { frost: 'SNOW', fog: 'MIST', storm: 'DUST' }[c.effect.weather] || (c.effect.clear ? 'SUN' : c.effect.horn ? 'BAND' : 'LAVA'), x + w / 2, y + 33, SLOT.INK, { align: 'center' });
  }
  if (dim) stipple(s, x, y, w, h, SLOT.INK, 0.3);
}

/**
 * A creature on the table. unit: { id, str (its strength now), uid }. opts: clock, selected,
 * hop (0..1: it just landed), burning (0..1), chilled, hurt.
 */
export function drawUnit(s, x, y, unit, { clock = 0, selected = false, hop = 0, flip = false, theirs = false } = {}) {
  const c = CARDS[unit.id], w = UNIT_W, h = UNIT_H, base = rampOf(unit.id);
  x = Math.round(x); y = Math.round(y);
  const hero = c.ability === 'hero';
  rect(s, x - 1, y - 1, w + 2, h + 2, selected ? SLOT.WHITE : SLOT.INK);
  const [top, mid, ground] = backdropOf(unit.id);
  rect(s, x, y, w, h, hero ? CC.LEGEND : base + 2);
  rect(s, x + 1, y + 1, w - 2, h - 2, mid);
  dither(s, x + 1, y + 1, w - 2, 8, top, mid, 0.3);
  rect(s, x + 1, y + h - 5, w - 2, 4, ground);
  const jump = hop > 0 ? Math.round(Math.sin(hop * Math.PI) * 4) : 0;
  drawCritter(s, unit.id, x + w / 2, y + h - 1 - jump, { clock, pose: hop > 0.5 ? 'attack' : 'idle', flip, phase: (unit.uid || 0) * 0.37 });
  // strength badge (bottom left) and ability (top right)
  const str = unit.str ?? c.str;
  const tw = textWidth(String(str));
  rect(s, x - 1, y + h - 7, tw + 4, 8, SLOT.INK);
  rect(s, x, y + h - 6, tw + 2, 6, hero ? CC.LEGEND : CC.PAPER);
  text(s, String(str), x + 1, y + h - 6, hero ? SLOT.INK : strColor(str, c.str));
  if (c.ability && c.ability !== 'hero') { rect(s, x + w - 6, y - 1, 7, 7, SLOT.INK); abilityIcon(s, x + w - 5, y, c.ability, SLOT.WHITE); }
  if (hero) { rect(s, x + w - 6, y - 1, 7, 7, SLOT.INK); abilityIcon(s, x + w - 5, y, 'hero', CC.LEGEND); }
  if (theirs) pset(s, x + 1, y + 1, CC.THEIRS);
}

/** The big card of the detail panel. opts: str (its strength on the table now), clock. */
export function drawBigCard(s, x, y, id, { clock = 0, str = null } = {}) {
  const c = CARDS[id], w = BIG_W, h = BIG_H, base = rampOf(id);
  x = Math.round(x); y = Math.round(y);
  rect(s, x - 1, y - 1, w + 2, h + 2, SLOT.INK);
  rect(s, x, y, w, h, c.ability === 'hero' ? CC.LEGEND : RARITY_COLOR[c.rarity]);
  rect(s, x + 2, y + 2, w - 4, h - 4, CC.PAPER);
  // name (two lines at most)
  const lines = wrap(c.name.toUpperCase(), w - 8).slice(0, 2);
  lines.forEach((ln, i) => text(s, ln, x + w / 2, y + 4 + i * 7, SLOT.INK, { align: 'center' }));
  // the picture, twice the size
  const ay = y + 18, ah = 46;
  const [top, mid, ground] = backdropOf(id);
  rect(s, x + 4, ay, w - 8, ah, mid);
  dither(s, x + 4, ay, w - 8, 18, top, mid, 0.35);
  rect(s, x + 4, ay + ah - 9, w - 8, 9, ground);
  dither(s, x + 4, ay + ah - 11, w - 8, 3, mid, ground, 0.5);
  if (c.kind === 'special') specialArt(s, id, x + w / 2, ay + ah / 2, clock, 2);
  else drawCritter(s, id, x + w / 2, ay + ah - 2, { clock, scale: 2, phase: 0 });
  frame(s, x + 4, ay, w - 8, ah, base + 2);
  if (c.kind === 'creature') {
    const now = str ?? c.str;
    circle(s, x + 9, y + 23, 7, SLOT.INK);
    circle(s, x + 9, y + 23, 6, c.ability === 'hero' ? CC.LEGEND : CC.PAPER);
    text(s, String(now), x + 9, y + 21, strColor(now, c.str), { align: 'center' });
    const by = ay + ah + 3;
    rowIcon(s, x + 5, by, c.ability === 'agile' ? 'front' : c.row, SLOT.INK);
    if (c.ability === 'agile') rowIcon(s, x + 13, by, 'back', SLOT.INK);
    if (c.ability) { rect(s, x + w - 12, by - 1, 9, 9, SLOT.INK); abilityIcon(s, x + w - 10, by + 1, c.ability, c.ability === 'hero' ? CC.LEGEND : SLOT.WHITE); }
    text(s, c.rarity.toUpperCase(), x + w / 2, by + 10, RARITY_COLOR[c.rarity] === SLOT.GRAY ? SLOT.DARK : RARITY_COLOR[c.rarity], { align: 'center' });
  } else {
    text(s, 'SPECIAL', x + w / 2, ay + ah + 4, SLOT.INK, { align: 'center' });
    text(s, c.rarity.toUpperCase(), x + w / 2, ay + ah + 13, RARITY_COLOR[c.rarity] === SLOT.GRAY ? SLOT.DARK : RARITY_COLOR[c.rarity], { align: 'center' });
  }
}

/** Word-wrap for the pixel font. */
export function wrap(str, width) {
  const words = String(str).split(' '), lines = [];
  let ln = '';
  for (const w of words) {
    if (textWidth(ln ? `${ln} ${w}` : w) > width && ln) { lines.push(ln); ln = w; }
    else ln = ln ? `${ln} ${w}` : w;
  }
  if (ln) lines.push(ln);
  return lines;
}

/** A big card as a <canvas> element (deck editor, packs, picks): scale ×. */
export function cardCanvas(id, { scale = 2, hero = null, count = 0 } = {}) {
  const s = createSurface(BIG_W + 2, BIG_H + 2);
  s.buf.fill(0);
  drawBigCard(s, 1, 1, id);
  if (count > 1) { rect(s, BIG_W - 14, BIG_H - 10, 14, 10, SLOT.INK); text(s, `X${count}`, BIG_W - 7, BIG_H - 8, SLOT.WHITE, { align: 'center' }); }
  const pal = cardPalette({ hero });
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  c.style.width = `${s.w * scale}px`; c.style.height = `${s.h * scale}px`;
  c.className = 'card-art';
  const ctx = c.getContext('2d'), img = ctx.createImageData(s.w, s.h);
  for (let i = 0; i < s.buf.length; i++) {
    const v = s.buf[i];
    if (!v) continue;
    const [r, g, b] = pal[v];
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export { hline, vline };
