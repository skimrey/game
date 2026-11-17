/**
 * Palettes for the retro 2D screens (see engine/pixel.js). 256 indices, laid out in ramps:
 *
 *    0        transparent
 *    1–15     fixed UI colours (ink outline, white, hearts, gold, panels, key caps)
 *   16–31     the stage (sky, far hills, near hills, ground, details, sun/moon, clouds)
 *   32–47     the hero (skin, hair, eyes, top, bottoms, shoes, hat, gear — each with a shade)
 *   48–63     the boss (body ramp, belly, horns/spikes, eyes, mouth, pattern)
 *   64–71     the boss's minions (birds, critters, projectiles)
 *   72–79     effects (fireworks, sparkles, snow)
 *   80–95     an NPC opponent (the hero ramp's layout: their clothes, skin, hair)
 *   96–103    the hero's pet (characters/pets.js)
 *
 * The retro-roguelite trick: every correct key press moves the whole world to a new
 * hue — stage, hero and boss together (`schemeFor(step)`). Each ramp keeps its own
 * lightness structure, so the picture stays readable whatever the hue; the UI colours
 * (1–15) never change, so hearts, keys and text always read the same.
 */
import { rgbaWord } from './pixel.js';

export const SLOT = {
  INK: 1, WHITE: 2, RED: 3, RED_DARK: 4, GOLD: 5, GRAY: 6, DARK: 7, PANEL: 8, KEY: 9, KEY_SIDE: 10, CYAN: 11, BAD: 12, BLACK: 13, SHADOW: 14, GOLD_DARK: 15,
  STAGE: 16, HERO: 32, BOSS: 48, MINION: 64, FX: 72, NPC: 80, PET: 96,
};
/** Remap table: a hero sprite (HR ramp) drawn with the NPC ramp (80–95) — an NPC opponent. */
export const NPC_MAP = (() => { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i >= 32 && i < 48 ? i + 48 : i; return m; })();

// stage ramp offsets
export const ST = { SKY0: 16, SKY1: 17, SKY2: 18, FAR0: 19, FAR1: 20, MID0: 21, MID1: 22, GROUND0: 23, GROUND1: 24, GROUND2: 25, DET0: 26, DET1: 27, DET2: 28, SUN: 29, CLOUD0: 30, CLOUD1: 31 };
// hero ramp
export const HR = { SKIN: 32, SKIN_D: 33, HAIR: 34, HAIR_D: 35, EYES: 36, EYE_W: 37, TOP: 38, TOP_D: 39, BOTTOM: 40, BOTTOM_D: 41, SHOES: 42, SHOES_D: 43, HAT: 44, HAT_D: 45, ACCENT: 46, ACCENT_D: 47 };
// boss ramp
export const BR = { LIGHT: 48, BODY: 49, DARK: 50, BELLY: 51, BELLY_D: 52, HORN_L: 53, HORN: 54, HORN_D: 55, EYE_W: 56, PUPIL: 57, MOUTH: 58, TEETH: 59, GLOW: 60, PATTERN: 61, PATTERN_D: 62, CHEEK: 63 };
// minion ramp
export const MN = { LIGHT: 64, BODY: 65, DARK: 66, ACCENT: 67, ACCENT_D: 68, EYE: 69, BEAK: 70, EXTRA: 71 };
export const FX = { A: 72, B: 73, C: 74, D: 75, FLASH: 76, SNOW: 77, SNOW_D: 78, SPARK: 79 };

const FIXED = {
  1: '#1b1028', 2: '#fff8f0', 3: '#ff3b5c', 4: '#7a1030', 5: '#ffd23f', 6: '#9aa0b4', 7: '#3a3550', 8: '#120c22',
  9: '#f4f0ff', 10: '#8c84b0', 11: '#5ef0ff', 12: '#ff5a6e', 13: '#000000', 14: '#2a1f3d', 15: '#b07a12',
};

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------
export function hexToRgb255(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** h in degrees, s and l in 0..1 → [r, g, b] 0..255. */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
}

/** [r, g, b] 0..255 → [h (deg), s, l]. */
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Relative luminance 0..1 (WCAG). */
export function luminance([r, g, b]) {
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Rotate a colour's hue by `deg`, and darken/lighten (`dl`) for shades. */
export function shiftColor(rgb, deg, dl = 0, ds = 0) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb(h + deg, s + ds, l + dl);
}

// ---------------------------------------------------------------------------
// Stage themes: [hue offset, saturation, lightness] for each stage slot, relative to the
// theme hue — rotating the theme hue moves the whole landscape together.
// ---------------------------------------------------------------------------
export const STAGE_THEMES = {
  meadow: {
    hue: 205,
    colors: [[0, 0.7, 0.72], [-5, 0.65, 0.8], [-25, 0.55, 0.88],     // sky, top → horizon
      [-75, 0.35, 0.62], [-75, 0.35, 0.5],                            // far hills
      [-90, 0.5, 0.48], [-90, 0.5, 0.36],                             // near hills
      [-95, 0.55, 0.5], [-100, 0.5, 0.38], [-110, 0.45, 0.26],        // ground: grass, soil, dark
      [130, 0.8, 0.7], [130, 0.6, 0.52], [-160, 0.85, 0.62],          // flowers
      [-150, 0.95, 0.7], [0, 0.25, 0.97], [0, 0.3, 0.86]],            // sun, clouds
  },
  canyon: {
    hue: 30,
    colors: [[-10, 0.8, 0.72], [0, 0.85, 0.8], [15, 0.9, 0.86],
      [-15, 0.5, 0.6], [-15, 0.45, 0.48],                              // mesas
      [-5, 0.6, 0.5], [-10, 0.55, 0.36],                               // rocks
      [10, 0.6, 0.66], [0, 0.5, 0.52], [-10, 0.45, 0.36],              // sand
      [80, 0.45, 0.45], [80, 0.45, 0.3], [-40, 0.7, 0.55],             // cactus, flowers
      [20, 1, 0.7], [20, 0.6, 0.94], [10, 0.5, 0.84]],
  },
  alpine: {
    hue: 215,
    colors: [[0, 0.55, 0.55], [10, 0.5, 0.68], [40, 0.55, 0.82],
      [-5, 0.25, 0.78], [0, 0.25, 0.6],                                // snowy peaks
      [-60, 0.3, 0.42], [-60, 0.35, 0.3],                              // pines
      [0, 0.3, 0.95], [0, 0.35, 0.85], [5, 0.35, 0.7],                 // snow
      [-70, 0.4, 0.34], [-70, 0.4, 0.22], [160, 0.6, 0.55],            // pine needles, flags
      [-170, 0.8, 0.75], [0, 0.2, 0.97], [0, 0.25, 0.86]],
  },
  starlit: {
    hue: 255,
    colors: [[0, 0.55, 0.14], [10, 0.5, 0.22], [30, 0.5, 0.32],
      [0, 0.3, 0.3], [0, 0.3, 0.22],                                   // far ruins
      [15, 0.3, 0.4], [15, 0.3, 0.28],                                 // columns
      [20, 0.25, 0.46], [15, 0.25, 0.34], [10, 0.25, 0.22],            // stone floor
      [170, 0.9, 0.7], [170, 0.7, 0.5], [-60, 0.9, 0.72],              // crystals, glyphs
      [-200, 0.5, 0.92], [0, 0.6, 0.86], [20, 0.4, 0.62]],             // moon, stars
  },
  lagoon: {
    hue: 192,
    colors: [[0, 0.75, 0.6], [0, 0.7, 0.72], [-8, 0.6, 0.9],
      [-62, 0.35, 0.58], [-62, 0.35, 0.46],                            // distant islands
      [0, 0.6, 0.5], [2, 0.65, 0.38],                                  // the sea
      [-147, 0.62, 0.72], [-150, 0.5, 0.6], [-152, 0.42, 0.46],        // sand
      [-80, 0.6, 0.42], [-162, 0.45, 0.38], [150, 0.75, 0.7],          // palm leaves, trunks, coral
      [-140, 1, 0.74], [0, 0.3, 0.97], [0, 0.35, 0.88]],
  },
  grove: {
    hue: 150,
    colors: [[45, 0.45, 0.17], [85, 0.38, 0.28], [125, 0.42, 0.54],  // night teal → violet glow
      [-15, 0.3, 0.22], [-15, 0.3, 0.15],                              // far canopy
      [-5, 0.3, 0.3], [-5, 0.3, 0.2],                                  // mushroom stems
      [-12, 0.45, 0.28], [-12, 0.4, 0.21], [-8, 0.35, 0.14],           // moss
      [-150, 0.75, 0.5], [-150, 0.7, 0.35], [-8, 0.9, 0.7],            // caps, cap shade, glowing spores
      [-20, 0.5, 0.88], [120, 0.3, 0.5], [120, 0.3, 0.38]],            // moon, clouds
  },
  volcano: {
    hue: 12,
    colors: [[-10, 0.6, 0.13], [0, 0.65, 0.25], [14, 0.85, 0.5],
      [-4, 0.35, 0.22], [-4, 0.35, 0.15],                              // volcanoes
      [0, 0.18, 0.17], [0, 0.18, 0.11],                                // obsidian
      [0, 0.12, 0.28], [0, 0.12, 0.2], [0, 0.12, 0.13],                // ash
      [14, 1, 0.55], [30, 1, 0.62], [0, 0.7, 0.34],                    // lava, embers, crust
      [4, 0.95, 0.6], [0, 0.1, 0.34], [0, 0.1, 0.25]],                 // a red sun, smoke
  },
  crystal: {
    hue: 275,
    colors: [[0, 0.6, 0.11], [6, 0.55, 0.19], [16, 0.5, 0.31],
      [0, 0.42, 0.4], [0, 0.42, 0.3],                                  // cave walls
      [-10, 0.5, 0.42], [-10, 0.5, 0.3],                               // crystal spires
      [0, 0.32, 0.56], [0, 0.32, 0.43], [0, 0.32, 0.3],                // amethyst floor
      [-95, 0.9, 0.66], [50, 0.9, 0.7], [0, 0.6, 0.86],                // crystals: cyan, pink, pale
      [0, 0.5, 0.92], [0, 0.4, 0.52], [0, 0.4, 0.4]],                  // glow, mist
  },
};
export const THEME_NAMES = Object.keys(STAGE_THEMES);

// ---------------------------------------------------------------------------
// The hero's colours from a character design
// ---------------------------------------------------------------------------
export function heroBaseColors(design) {
  const c = design.colors;
  const pair = hex => { const rgb = hexToRgb255(hex); return [rgb, shiftColor(rgb, 0, -0.16)]; };
  const eyes = hexToRgb255(c.eyes);
  return [...pair(c.skin), ...pair(c.hair), eyes, [250, 250, 245], ...pair(c.top), ...pair(c.bottom), ...pair(c.shoes), ...pair(c.hat), ...pair(c.accent)];
}

/** A boss's base colours from its hue (0..360) and style knobs. */
export function bossBaseColors({ hue, accentHue = hue + 150, sat = 0.65, light = 0.55 }) {
  // yellows go muddy (mustard, olive) at the lightness that suits every other hue: lift them
  const d = Math.abs((((hue - 55) % 360) + 540) % 360 - 180), yellow = Math.max(0, 1 - d / 32);
  light += 0.08 * yellow; sat += 0.15 * yellow;
  const B = (dh, s, l) => hslToRgb(hue + dh, s, l);
  const A = (dh, s, l) => hslToRgb(accentHue + dh, s, l);
  return [
    B(-8, sat, light + 0.16), B(0, sat, light), B(8, sat, light - 0.17),          // body ramp
    B(-20, sat * 0.6, Math.min(0.9, light + 0.28)), B(-20, sat * 0.6, light + 0.1),  // belly
    A(0, 0.7, 0.72), A(0, 0.7, 0.56), A(10, 0.7, 0.38),                         // horns / spikes
    [255, 252, 240], [24, 14, 34], [70, 16, 40], [255, 255, 255],               // eyes, mouth, teeth
    A(-30, 1, 0.7),                                                             // glow
    B(25, sat, light - 0.08), B(25, sat, light - 0.24),                          // pattern
    hslToRgb(350, 0.8, 0.72),                                                   // cheeks
  ];
}

export function minionBaseColors({ hue }) {
  return [hslToRgb(hue, 0.6, 0.68), hslToRgb(hue, 0.6, 0.52), hslToRgb(hue + 10, 0.6, 0.34),
    hslToRgb(hue + 180, 0.75, 0.6), hslToRgb(hue + 180, 0.7, 0.42), [20, 14, 30], hslToRgb(40, 0.95, 0.58), [255, 250, 240]];
}

// ---------------------------------------------------------------------------
// Schemes: the full palette for a step of the battle
// ---------------------------------------------------------------------------
const GOLDEN = 137.508;

/**
 * Hue shift for step `step` (0 = the original colours). Golden-angle steps never
 * repeat and always land far from the last hue, so every swap is a visible change.
 */
export function hueShift(step, offset = 0) {
  return step ? (step * GOLDEN + offset) % 360 : 0;
}

/**
 * The palette (array of [r, g, b], 256 entries) for a scene at a recolour step.
 *   theme   stage theme name
 *   hero    heroBaseColors(design)   (16)
 *   boss    bossBaseColors(...)      (16)
 *   minion  minionBaseColors(...)    (8)
 */
export function buildScheme({ theme = 'meadow', hero, boss, minion, npc = null, pet = null, step = 0, offset = 0 }) {
  const pal = new Array(256).fill(null).map(() => [0, 0, 0]);
  for (const [i, hex] of Object.entries(FIXED)) pal[i] = hexToRgb255(hex);
  const shift = hueShift(step, offset);
  const T = STAGE_THEMES[theme] || STAGE_THEMES.meadow;
  T.colors.forEach(([dh, s, l], i) => { pal[SLOT.STAGE + i] = hslToRgb(T.hue + dh + shift, s, l); });
  hero?.forEach((rgb, i) => { pal[SLOT.HERO + i] = shift ? shiftColor(rgb, shift) : rgb; });
  pal[HR.EYE_W] = [250, 250, 245];
  boss?.forEach((rgb, i) => { pal[SLOT.BOSS + i] = shift ? shiftColor(rgb, shift) : rgb; });
  pal[BR.EYE_W] = [255, 252, 240]; pal[BR.PUPIL] = [24, 14, 34]; pal[BR.TEETH] = [255, 255, 255];
  minion?.forEach((rgb, i) => { pal[SLOT.MINION + i] = shift ? shiftColor(rgb, shift) : rgb; });
  pal[MN.EYE] = [20, 14, 30];
  npc?.forEach((rgb, i) => { pal[SLOT.NPC + i] = shift ? shiftColor(rgb, shift) : rgb; });
  if (npc) pal[SLOT.NPC + (HR.EYE_W - SLOT.HERO)] = [250, 250, 245];
  pet?.forEach((rgb, i) => { pal[SLOT.PET + i] = rgb; });                     // the pet keeps its own colours
  // effects: four bright hues around the wheel, opposite the sky
  const fxHue = T.hue + shift + 180;
  [0, 90, 180, 270].forEach((dh, i) => { pal[FX.A + i] = hslToRgb(fxHue + dh, 1, 0.66); });
  pal[FX.FLASH] = [255, 255, 255];
  pal[FX.SNOW] = hslToRgb(T.hue + shift, 0.35, 0.96);
  pal[FX.SNOW_D] = hslToRgb(T.hue + shift, 0.3, 0.8);
  pal[FX.SPARK] = hslToRgb(fxHue + 45, 1, 0.8);
  return pal;
}

/** [r, g, b][] → Uint32Array for present(). */
export function packPalette(pal, into = new Uint32Array(256)) {
  for (let i = 0; i < 256; i++) into[i] = rgbaWord(pal[i]);
  return into;
}

/**
 * Mechanical readability check for a scheme: the hero, the boss and the key cap must
 * stand out from the sky and the ground behind them. Returns { ok, issues }.
 */
export function checkScheme(pal) {
  const issues = [];
  const L = i => luminance(pal[i]);
  // the ink outline must separate sprites from the sky (either dark ink on a light sky,
  // or a light sprite body on a dark sky)
  for (const sky of [ST.SKY0, ST.SKY1, ST.SKY2]) {
    if (contrast(pal[SLOT.INK], pal[sky]) < 1.6 && contrast(pal[BR.BODY], pal[sky]) < 1.6) issues.push(`boss blends into sky ${sky}`);
    if (contrast(pal[SLOT.KEY], pal[sky]) < 1.25 && contrast(pal[SLOT.INK], pal[sky]) < 3) issues.push(`key cap blends into sky ${sky}`);
  }
  if (contrast(pal[SLOT.WHITE], pal[SLOT.PANEL]) < 7) issues.push('HUD text');
  if (Math.abs(L(ST.GROUND0) - L(ST.SKY2)) < 0.02 && contrast(pal[ST.GROUND0], pal[ST.SKY2]) < 1.1) issues.push('ground vs horizon');
  return { ok: issues.length === 0, issues };
}

/** Palette slots for a trail's pixel colours (characters/trails.js TRAIL_STYLES[…].pixels names). */
export function pixelColors(names = []) {
  const map = { GOLD: SLOT.GOLD, WHITE: SLOT.WHITE, CYAN: SLOT.CYAN, RED: SLOT.RED, BAD: SLOT.BAD, GOLD_DARK: SLOT.GOLD_DARK, FX_A: FX.A, FX_B: FX.B, FX_C: FX.C, FX_D: FX.D };
  return names.map(n => map[n] ?? SLOT.WHITE);
}
