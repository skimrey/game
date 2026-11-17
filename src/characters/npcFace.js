/**
 * Silly NPC faces (characters/npcs.js sillyFace) — drawn three ways:
 *
 *   sillyFace3D(box, head, …)   boxes on the 3D avatar's head (characters/avatar.js calls it when the
 *                               look has a silly face): googly eyes that jiggle, noses that
 *                               stick out, tongues, teeth and moustaches
 *   sillyFaceSprite(s, …)       the same face squeezed into the 28×36 hero sprite (the duel)
 *   paintNpcPortrait(npc, …)    a big 64×64 pixel-art head for the dialog box — it blinks,
 *                               its googly pupils wander and its mouth flaps while it talks
 */
import { createSurface, rect, pset, ellipse, line, ring, outline, poly } from '../engine/pixel.js';
import { HR, SLOT } from '../engine/palette.js';
import { hexToRgb } from './character.js';
import { rotationX, rotationZ, compose, translation } from '../engine/mat4.js';

const WHITE = [0.97, 0.97, 0.95], INK = [0.08, 0.07, 0.1], RED = [0.9, 0.15, 0.15], PINK = [0.98, 0.55, 0.62], TONGUE = [0.92, 0.35, 0.45];
const shade = (c, k) => c.map(v => Math.min(1, v * k));

// ---------------------------------------------------------------------------
// 3D
// ---------------------------------------------------------------------------
/**
 * box(parent, cx, cy, cz, sx, sy, sz, color) — characters/avatar.js's part maker; head — the head
 * matrix; hw, hh, hd — head size; face — z of the front face; C — colours; f — the face;
 * anim — { blink, time }.
 */
export function sillyFace3D(box, head, { hw, hh, hd, face, C, f, anim, hatLine = Infinity }) {
  const t = anim.time || 0, open = anim.blink > 0 ? 0.15 : 1;
  const ey = hh * 0.52, ex = hw * 0.24;
  const jiggle = k => [Math.sin(t * 7 + k * 2) * 0.015 + f.look * 0.02, Math.cos(t * 5.3 + k) * 0.012];
  const eye = (x, y, r, k, kind = f.eyes) => {
    if (kind === 'tiny' || kind === 'beady') {
      // small and shiny: at 0.09 they read as empty sockets on the blocky head
      const w = kind === 'tiny' ? 0.05 : 0.065;
      box(head, x, y, face, w * r, w * r * open, 0.02, INK);
      box(head, x + w * 0.2, y + w * 0.2, face + 0.012, w * 0.36, w * 0.36 * open, 0.01, WHITE);
      return;
    }
    if (kind === 'sleepy') {
      box(head, x, y, face, 0.12 * r, 0.1 * r, 0.03, WHITE);
      box(head, x, y - 0.015, face + 0.012, 0.05 * r, 0.05 * r * open, 0.02, C.eyes);
      box(head, x, y + 0.03 * r, face + 0.02, 0.14 * r, 0.06 * r, 0.04, shade(C.skin, 0.85));     // heavy lid
      return;
    }
    const w = 0.14 * r, pop = kind === 'googly' ? 0.05 : 0.025;
    box(head, x, y, face + pop / 2, w, w * open, pop, WHITE);
    let [px, py] = kind === 'googly' ? jiggle(k) : [0, 0];
    if (kind === 'cross') px = -Math.sign(x) * w * 0.28;
    box(head, x + px, y + py, face + pop + 0.005, w * 0.42, w * 0.42 * open, 0.015, INK);
  };
  // eyes
  if (f.eyes === 'stalks') {
    // stalks grow out of the face where eyes would be, leaning out and up past the brow, so the
    // eyeballs sit just above the forehead and still look at you (on top of the head they read as
    // a faceless head with antennae)
    const L = hh - ey + 0.16;
    for (const side of [1, -1]) {
      const stalk = compose(head, translation(side * ex, ey, face + 0.01), rotationZ(-side * 0.22), rotationX(-0.2));
      box(head, side * ex, ey, face + 0.005, 0.07, 0.05, 0.012, shade(C.skin, 0.78));           // where it sprouts
      box(stalk, 0, L / 2, 0, 0.035, L, 0.035, shade(C.skin, 0.92));
      const [px, py] = jiggle(side);
      box(stalk, 0, L + 0.06, 0.01, 0.14, 0.14 * open, 0.12, WHITE);
      box(stalk, px, L + 0.06 + py, 0.075, 0.06, 0.06 * open, 0.02, INK);
    }
  } else if (f.eyes === 'wink') {
    eye(ex, ey, 1, 0, 'googly');
    box(head, -ex, ey, face, 0.12, 0.025, 0.02, INK);
  } else {
    // (wonky eyes are toned down in 3D: a 1.5× googly eye is a white slab over a third of the face)
    const [a, b] = (f.eyeSizes || [1, 1]).map(k => Math.max(0.8, Math.min(1.25, k)));
    eye(ex, ey, a, 0); eye(-ex, ey, b, 1);
  }
  // brows (not when a hat comes down over them: they'd be painted on the hat)
  const by = ey + 0.1, dark = shade(C.hair, 0.8);
  if (by + 0.02 > hatLine) { /* under the hat */ } else if (f.brows === 'uni') box(head, 0, by, face + 0.01, hw * 0.8, 0.04, 0.03, dark);
  else if (f.brows === 'bushy') for (const s of [1, -1]) box(head, s * ex, by, face + 0.01, 0.17, 0.06, 0.04, dark);
  else if (f.brows === 'raised') for (const s of [1, -1]) box(head, s * ex, by + 0.05, face + 0.01, 0.12, 0.025, 0.02, dark);
  else if (f.brows === 'angry') for (const s of [1, -1]) box(compose(head, translation(s * ex, by, face + 0.01), rotationZ(s * -0.45)), 0, 0, 0, 0.13, 0.03, 0.02, dark);
  else if (f.brows === 'wiggly') for (const s of [1, -1]) { box(head, s * ex - 0.03, by, face + 0.01, 0.05, 0.025, 0.02, dark); box(head, s * ex + 0.03, by + 0.02, face + 0.01, 0.05, 0.025, 0.02, dark); }
  // nose
  const ny = hh * 0.36;
  switch (f.nose) {
    case 'button': box(head, 0, ny, face + 0.02, 0.05, 0.05, 0.04, shade(C.skin, 0.9)); break;
    case 'long': box(head, 0, ny, face + 0.13, 0.05, 0.05, 0.26, shade(C.skin, 0.95)); break;
    case 'pig': box(head, 0, ny, face + 0.03, 0.11, 0.08, 0.06, PINK); for (const s of [1, -1]) box(head, s * 0.025, ny, face + 0.065, 0.02, 0.03, 0.01, INK); break;
    case 'potato': box(head, 0, ny - 0.01, face + 0.04, 0.13, 0.12, 0.08, shade(C.skin, 0.88)); box(head, 0.03, ny + 0.03, face + 0.06, 0.05, 0.05, 0.05, shade(C.skin, 0.88)); break;
    case 'hook': box(compose(head, translation(0, ny, face + 0.05), rotationZ(0)), 0, 0, 0, 0.05, 0.12, 0.08, shade(C.skin, 0.9)); box(head, 0, ny - 0.06, face + 0.08, 0.05, 0.04, 0.04, shade(C.skin, 0.9)); break;
    default: break;
  }
  // whiskers (under the mouth's level so teeth still show)
  const my = hh * 0.17;
  switch (f.whiskers) {
    case 'curly': box(head, 0, my + 0.05, face + 0.015, 0.18, 0.035, 0.03, C.hair); for (const s of [1, -1]) box(head, s * 0.1, my + 0.08, face + 0.015, 0.035, 0.05, 0.03, C.hair); break;
    case 'walrus': box(head, 0, my + 0.02, face + 0.02, 0.24, 0.09, 0.04, C.hair); break;
    case 'goatee': box(head, 0, 0.03, face + 0.01, 0.08, 0.1, 0.04, C.hair); break;
    case 'beard':                                    // round the jaw and up the cheeks, under the mouth (a slab over it read as a bib)
      box(head, 0, -0.005, face - 0.004, hw * 0.95, 0.08, 0.05, C.hair);
      for (const s of [1, -1]) box(head, s * (hw / 2 - 0.04), my + 0.01, face - 0.004, 0.08, 0.16, 0.045, C.hair);
      break;
    case 'wizard':                                   // a long beard down the chest (the mayor's)
      box(head, 0, my + 0.04, face + 0.015, 0.24, 0.06, 0.04, C.hair);
      box(head, 0, -0.06, face + 0.01, hw * 0.8, 0.3, 0.07, C.hair);
      box(head, 0, -0.26, face + 0.02, hw * 0.5, 0.16, 0.06, C.hair);
      box(head, 0, -0.38, face + 0.025, hw * 0.22, 0.1, 0.05, C.hair);
      break;
    case 'stubble': box(head, 0, my - 0.01, face - 0.002, hw * 0.7, 0.1, 0.012, shade(C.skin, 0.78)); break;
    default: break;
  }
  // mouth
  switch (f.mouth) {
    case 'buck': box(head, 0, my, face, 0.14, 0.03, 0.02, INK); for (const s of [1, -1]) box(head, s * 0.022, my - 0.035, face + 0.01, 0.04, 0.06, 0.02, WHITE); break;
    case 'tongue': box(head, 0, my, face, 0.12, 0.04, 0.02, INK); box(head, 0.02, my - 0.05, face + 0.03, 0.06, 0.09, 0.03, TONGUE); break;
    case 'grin': box(head, 0, my, face, 0.22, 0.07, 0.02, INK); box(head, 0, my + 0.018, face + 0.006, 0.19, 0.025, 0.01, WHITE); break;
    case 'ooh': box(head, 0, my, face, 0.07, 0.09, 0.02, INK); break;
    case 'wobbly': for (const [dx, dy] of [[-0.06, 0], [-0.02, 0.02], [0.02, 0], [0.06, 0.02]]) box(head, dx, my + dy, face, 0.045, 0.025, 0.02, INK); break;
    case 'gap': box(head, 0, my, face, 0.16, 0.05, 0.02, INK); box(head, -0.035, my + 0.01, face + 0.006, 0.05, 0.025, 0.01, WHITE); box(head, 0.035, my + 0.01, face + 0.006, 0.05, 0.025, 0.01, WHITE); break;
    case 'frown': box(head, 0, my + 0.01, face, 0.12, 0.025, 0.02, INK); for (const s of [1, -1]) box(head, s * 0.07, my - 0.015, face, 0.03, 0.04, 0.02, INK); break;
    default: box(head, 0, my, face, 0.1, 0.025, 0.02, INK);
  }
  // extras
  const cy = hh * 0.3;
  switch (f.extra) {
    case 'freckles': for (const s of [1, -1]) for (const [dx, dy] of [[0, 0], [0.035, 0.02], [0.05, -0.015]]) box(head, s * (ex + dx - 0.02), cy + dy, face + 0.003, 0.018, 0.018, 0.01, shade(C.skin, 0.62)); break;
    case 'blush': for (const s of [1, -1]) box(head, s * (ex + 0.03), cy, face + 0.003, 0.09, 0.045, 0.01, PINK); break;
    case 'mole': box(head, ex + 0.05, my + 0.06, face + 0.004, 0.02, 0.02, 0.01, shade(C.skin, 0.55)); break;
    case 'bandaid': box(head, -ex - 0.02, cy, face + 0.006, 0.1, 0.035, 0.012, [0.95, 0.8, 0.6]); box(head, -ex - 0.02, cy, face + 0.01, 0.035, 0.035, 0.01, [0.85, 0.7, 0.5]); break;
    case 'specs': for (const s of [1, -1]) { box(head, s * ex, ey, face + 0.06, 0.2, 0.2, 0.015, INK); box(head, s * ex, ey, face + 0.065, 0.16, 0.16, 0.012, [0.75, 0.9, 1]); } box(head, 0, ey, face + 0.06, 0.08, 0.025, 0.015, INK); break;
    default: break;
  }
  // ears
  if (f.ears === 'big') for (const s of [1, -1]) box(head, s * (hw / 2 + 0.06), hh * 0.45, -0.02, 0.1, 0.2, 0.06, C.skin);
}

// ---------------------------------------------------------------------------
// 2D: inside the 28×36 hero sprite (palette HR ramp)
// ---------------------------------------------------------------------------
/** Replaces the sprite's plain face (eyes at eyeY, mouth below) with the silly one. view: 'side' | 'front'. */
export function sillyFaceSprite(s, hb, view, f) {
  const { x, y, w, h } = hb;
  const eyeY = y + Math.floor(h / 2);
  const side = view === 'side';
  const eyeXs = side ? [x + w - 3] : [x + Math.floor(w / 2) - 4, x + Math.floor(w / 2) + 2];
  for (const ex of eyeXs) {
    if (f.eyes === 'tiny' || f.eyes === 'beady') { pset(s, ex, eyeY, SLOT.INK); continue; }
    const big = f.eyes === 'googly' || f.eyes === 'wonky';
    rect(s, ex, eyeY - 1, big ? 3 : 2, big ? 3 : 2, HR.EYE_W);
    pset(s, ex + (f.eyes === 'cross' ? (ex < x + w / 2 ? 1 : 0) : 1), eyeY, SLOT.INK);
  }
  if (f.brows === 'uni' && !side) rect(s, eyeXs[0], eyeY - 2, (eyeXs.at(-1) - eyeXs[0]) + 3, 1, HR.HAIR_D);
  else if (f.brows !== 'none') for (const ex of eyeXs) rect(s, ex, eyeY - 2, 2, 1, HR.HAIR_D);
  const noseX = side ? x + w : x + Math.floor(w / 2) - 1;
  if (f.nose === 'long') rect(s, noseX, eyeY + 1, side ? 4 : 1, side ? 1 : 2, HR.SKIN_D);
  else if (f.nose === 'pig') { rect(s, noseX, eyeY + 1, 2, 2, SLOT.BAD); }
  else if (f.nose !== 'none') pset(s, noseX, eyeY + 1, HR.SKIN_D);
  const mx = side ? x + w - 4 : x + Math.floor(w / 2) - 2, my = eyeY + 3;
  if (f.mouth === 'tongue') { rect(s, mx, my, 3, 1, SLOT.INK); rect(s, mx + 1, my + 1, 1, 2, SLOT.BAD); }
  else if (f.mouth === 'buck') { rect(s, mx, my, 4, 1, SLOT.INK); rect(s, mx + 1, my + 1, 2, 1, HR.EYE_W); }
  else if (f.mouth === 'grin') { rect(s, mx - 1, my, 6, 2, SLOT.INK); rect(s, mx, my, 4, 1, HR.EYE_W); }
  else if (f.mouth === 'ooh') rect(s, mx + 1, my - 1, 2, 2, SLOT.INK);
  else rect(s, mx, my, 4, 1, SLOT.INK);
  if (f.whiskers === 'curly' || f.whiskers === 'walrus') rect(s, mx - 1, my - 1, 6, 1, HR.HAIR);
  else if (f.whiskers === 'beard') rect(s, x + 1, my + 1, w - 2, 2, HR.HAIR);
  else if (f.whiskers === 'wizard') { rect(s, mx - 1, my - 1, 6, 1, HR.HAIR); rect(s, x + 1, my + 1, w - 2, 3, HR.HAIR); rect(s, x + 2, my + 4, w - 4, 3, HR.HAIR); rect(s, x + Math.floor(w / 2) - 1, my + 7, 2, 2, HR.HAIR); }
  if (f.ears === 'big' && !side) { rect(s, x - 2, eyeY - 1, 2, 3, HR.SKIN); rect(s, x + w, eyeY - 1, 2, 3, HR.SKIN); }
}

// ---------------------------------------------------------------------------
// 2D: the big portrait for the dialog box (its own palette)
// ---------------------------------------------------------------------------
const P = { INK: 1, WHITE: 2, SKIN: 3, SKIN_D: 4, SKIN_L: 5, HAIR: 6, HAIR_D: 7, EYES: 8, RED: 9, PINK: 10, TONGUE: 11, HAT: 12, HAT_D: 13, TOP: 14, TOP_D: 15, BG: 16, BG2: 17, GOLD: 18, GREEN: 19, GLASS: 20, ACCENT: 21 };
export const PORTRAIT_SIZE = 64;

/** The portrait's palette for an NPC (RGB 0..255 per index). */
export function portraitPalette(npc) {
  const c = Object.fromEntries(Object.entries(npc.design.colors).map(([k, v]) => [k, hexToRgb(v).map(x => Math.round(x * 255))]));
  const k = (rgb, f) => rgb.map(v => Math.max(0, Math.min(255, Math.round(v * f))));
  const pal = Array.from({ length: 32 }, () => [0, 0, 0]);
  pal[P.INK] = [27, 16, 40]; pal[P.WHITE] = [255, 250, 242];
  pal[P.SKIN] = c.skin; pal[P.SKIN_D] = k(c.skin, 0.8); pal[P.SKIN_L] = k(c.skin, 1.1);
  pal[P.HAIR] = c.hair; pal[P.HAIR_D] = k(c.hair, 0.72); pal[P.EYES] = c.eyes;
  pal[P.RED] = [226, 52, 52]; pal[P.PINK] = [250, 150, 165]; pal[P.TONGUE] = [235, 90, 115];
  pal[P.HAT] = c.hat; pal[P.HAT_D] = k(c.hat, 0.75); pal[P.TOP] = c.top; pal[P.TOP_D] = k(c.top, 0.75);
  pal[P.BG] = [60, 44, 102]; pal[P.BG2] = [80, 60, 132]; pal[P.GOLD] = [255, 210, 63]; pal[P.GREEN] = [130, 170, 80]; pal[P.GLASS] = [190, 230, 255]; pal[P.ACCENT] = c.accent;
  return pal;
}

/**
 * The portrait: { blink, talk (0..1 mouth open), t (time, for the googly eyes) } → 64×64.
 * A big head (bigger for bobble-heads), their hair and hat, the silly face, shoulders.
 */
export function paintNpcPortrait(npc, { blink = false, talk = 0, t = 0 } = {}) {
  const S = PORTRAIT_SIZE, s = createSurface(S, S);
  const d = npc.design, f = npc.face;
  rect(s, 0, 0, S, S, P.BG);
  for (let y = 0; y < S; y += 4) for (let x = (y / 4) % 2 ? 0 : 4; x < S; x += 8) pset(s, x, y, P.BG2);
  // shoulders
  ellipse(s, 32, 66, 26, 14, P.TOP); ellipse(s, 32, 68, 22, 10, P.TOP_D); rect(s, 28, 50, 8, 6, P.SKIN_D);
  // the head
  const k = f.head || 1;
  const hw = Math.round((d.head === 'wide' ? 19 : d.head === 'tall' ? 14 : 16) * Math.min(1.18, k)), hh = Math.round((d.head === 'tall' ? 19 : 16) * Math.min(1.18, k));
  const cx = 32, cy = 37 - (k - 1) * 6;
  if (d.hair === 'long' || d.hair === 'bob') rect(s, cx - hw - 3, cy - 6, hw * 2 + 6, hh + (d.hair === 'long' ? 14 : 6), P.HAIR_D);
  // ears
  if (f.ears === 'big') for (const sx of [-1, 1]) { ellipse(s, cx + sx * (hw + 3), cy + 2, 5, 7, P.SKIN); ellipse(s, cx + sx * (hw + 3), cy + 2, 2, 4, P.SKIN_D); }
  else for (const sx of [-1, 1]) ellipse(s, cx + sx * hw, cy + 2, 3, 4, P.SKIN);
  if (d.head === 'square' || d.head === 'wide') { rect(s, cx - hw, cy - hh + 2, hw * 2, hh * 2 - 4, P.SKIN); rect(s, cx - hw + 2, cy - hh, hw * 2 - 4, hh * 2, P.SKIN); }
  else ellipse(s, cx, cy, hw, hh, P.SKIN);
  ellipse(s, cx - hw * 0.45, cy - hh * 0.5, hw * 0.3, hh * 0.2, P.SKIN_L);
  // hair
  const top = cy - hh;
  switch (d.hair) {
    case 'short': rect(s, cx - hw + 1, top - 1, hw * 2 - 2, 6, P.HAIR); rect(s, cx - hw, top + 3, 4, 6, P.HAIR); rect(s, cx + hw - 4, top + 3, 4, 6, P.HAIR); break;
    case 'spiky': for (let i = -hw; i < hw; i += 5) poly(s, [[cx + i, top + 5], [cx + i + 2.5, top - 6], [cx + i + 5, top + 5]], P.HAIR); rect(s, cx - hw + 1, top + 1, hw * 2 - 2, 5, P.HAIR); break;
    case 'mohawk': rect(s, cx - 3, top - 10, 6, 14, P.HAIR); rect(s, cx - 3, top - 10, 6, 2, P.HAIR_D); break;
    case 'long': case 'bob': rect(s, cx - hw - 2, top - 1, hw * 2 + 4, 8, P.HAIR); rect(s, cx - hw - 3, top + 4, 5, hh + 4, P.HAIR); rect(s, cx + hw - 2, top + 4, 5, hh + 4, P.HAIR); break;
    case 'ponytail': rect(s, cx - hw + 1, top - 1, hw * 2 - 2, 6, P.HAIR); ellipse(s, cx + hw + 4, top + 10, 4, 8, P.HAIR); break;
    default: break;
  }
  // hat
  switch (d.hat) {
    case 'none': case 'headband': if (d.hat === 'headband') rect(s, cx - hw, top + 5, hw * 2, 3, P.HAT); break;
    case 'crown': case 'gemcrown': rect(s, cx - 10, top - 6, 20, 6, P.GOLD); for (let i = -10; i <= 8; i += 6) poly(s, [[cx + i, top - 6], [cx + i + 3, top - 12], [cx + i + 6, top - 6]], P.GOLD); pset(s, cx, top - 3, P.RED); break;
    case 'tophat': rect(s, cx - hw - 2, top, hw * 2 + 4, 3, P.HAT_D); rect(s, cx - 10, top - 16, 20, 17, P.HAT); rect(s, cx - 10, top - 4, 20, 3, P.ACCENT); break;
    case 'wizard': poly(s, [[cx - hw - 2, top + 3], [cx + hw + 2, top + 3], [cx + 4, top - 22]], P.HAT); pset(s, cx, top - 8, P.GOLD); pset(s, cx - 4, top - 2, P.GOLD); break;
    case 'partyhat': poly(s, [[cx - 9, top + 2], [cx + 9, top + 2], [cx, top - 18]], P.HAT); for (let y = top - 12; y < top; y += 5) rect(s, cx - 3, y, 6, 2, P.ACCENT); ellipse(s, cx, top - 18, 3, 3, P.WHITE); break;
    case 'pirate': rect(s, cx - hw - 4, top - 2, hw * 2 + 8, 5, P.HAT); ellipse(s, cx, top - 5, hw, 7, P.HAT); ellipse(s, cx, top - 6, 2, 2, P.WHITE); break;
    case 'viking': ellipse(s, cx, top + 1, hw + 1, 9, P.HAT); for (const sx of [-1, 1]) poly(s, [[cx + sx * (hw - 2), top], [cx + sx * (hw + 10), top - 14], [cx + sx * (hw + 4), top + 2]], P.WHITE); break;
    case 'halo': ring(s, cx, top - 8, 9, P.GOLD); break;
    case 'flowers': for (let i = -hw; i <= hw; i += 6) { ellipse(s, cx + i, top + 1, 3, 3, [P.RED, P.GOLD, P.PINK, P.WHITE][((i + hw) / 6) % 4 | 0]); pset(s, cx + i, top + 1, P.GOLD); } break;
    case 'unicorn': poly(s, [[cx - 3, top + 1], [cx + 3, top + 1], [cx, top - 16]], P.GOLD); for (let i = 0; i < 3; i++) line(s, cx - 2, top - 3 - i * 4, cx + 2, top - 5 - i * 4, P.WHITE); break;
    default: ellipse(s, cx, top + 1, hw + 1, 8, P.HAT); rect(s, cx - hw - 1, top + 1, hw * 2 + 2, 4, P.HAT); rect(s, cx - hw - 1, top + 4, hw * 2 + 6, 2, P.HAT_D);   // cap / beanie / helmet
  }
  // --- the silly face
  const ey = cy - 2, ex = Math.round(hw * 0.45);
  const wander = t ? [Math.round(Math.sin(t * 2.3 + f.look * 3) * 1.5), Math.round(Math.cos(t * 1.7) * 1)] : [0, 0];
  const eye = (x, r, kind = f.eyes, k2 = 0) => {
    if (blink && kind !== 'stalks') { rect(s, x - r, ey, r * 2, 1, P.INK); return; }
    if (kind === 'tiny' || kind === 'beady') { ellipse(s, x, ey, 1.5, 1.5, P.INK); if (kind === 'beady') pset(s, x - 1, ey - 1, P.WHITE); return; }
    ellipse(s, x, ey, r, r, P.WHITE); ring(s, x, ey, r, P.INK);
    let [px, py] = kind === 'googly' || kind === 'wonky' ? wander : [0, 0];
    if (kind === 'cross') px = x < cx ? Math.round(r * 0.45) : -Math.round(r * 0.45);
    if (k2) px = -px;
    ellipse(s, x + px, ey + py, r * 0.42, r * 0.42, P.EYES); ellipse(s, x + px, ey + py, r * 0.22, r * 0.22, P.INK);
    pset(s, x + px - 1, ey + py - 1, P.WHITE);
    if (kind === 'sleepy') rect(s, x - r, ey - r, r * 2 + 1, r, P.SKIN_D);
  };
  if (f.eyes === 'stalks') {
    for (const sx of [-1, 1]) { line(s, cx + sx * ex, top + 4, cx + sx * (ex + 3), top - 8, P.SKIN_D); ellipse(s, cx + sx * (ex + 3), top - 11, 4, 4, P.WHITE); ring(s, cx + sx * (ex + 3), top - 11, 4, P.INK); ellipse(s, cx + sx * (ex + 3) + wander[0], top - 11 + wander[1], 1.5, 1.5, P.INK); }
    rect(s, cx - ex - 2, ey, 4, 1, P.SKIN_D); rect(s, cx + ex - 2, ey, 4, 1, P.SKIN_D);
  } else if (f.eyes === 'wink') { eye(cx - ex, 4, 'googly'); line(s, cx + ex - 3, ey + 1, cx + ex + 3, ey - 1, P.INK); }
  else { const [a, b] = f.eyeSizes || [1, 1]; eye(cx - ex, Math.round(4 * a)); eye(cx + ex, Math.round(4 * b), f.eyes, 1); }
  // brows
  const by = ey - 7;
  if (f.brows === 'uni') rect(s, cx - ex - 4, by, ex * 2 + 8, 2, P.HAIR_D);
  else if (f.brows === 'bushy') for (const sx of [-1, 1]) rect(s, cx + sx * ex - 4, by - 1, 9, 3, P.HAIR_D);
  else if (f.brows === 'raised') for (const sx of [-1, 1]) rect(s, cx + sx * ex - 3, by - 4, 7, 1, P.HAIR_D);
  else if (f.brows === 'angry') for (const sx of [-1, 1]) line(s, cx + sx * (ex + 4), by - 2, cx + sx * (ex - 3), by + 1, P.HAIR_D);
  else if (f.brows === 'wiggly') for (const sx of [-1, 1]) { line(s, cx + sx * ex - 4, by, cx + sx * ex - 1, by - 2, P.HAIR_D); line(s, cx + sx * ex - 1, by - 2, cx + sx * ex + 3, by, P.HAIR_D); }
  // nose
  const ny = ey + 6;
  switch (f.nose) {
    case 'button': ellipse(s, cx, ny, 2, 1.5, P.SKIN_D); break;
    case 'long': rect(s, cx - 1, ny - 2, 3, 4, P.SKIN_D); rect(s, cx + 1, ny, 12, 3, P.SKIN); rect(s, cx + 1, ny + 2, 12, 1, P.SKIN_D); pset(s, cx + 13, ny + 1, P.SKIN_D); break;
    case 'pig': ellipse(s, cx, ny, 4, 3, P.PINK); pset(s, cx - 1, ny, P.INK); pset(s, cx + 1, ny, P.INK); break;
    case 'potato': ellipse(s, cx, ny, 4, 3.5, P.SKIN_D); ellipse(s, cx + 2, ny - 1, 2, 2, P.SKIN_D); pset(s, cx - 1, ny - 1, P.SKIN_L); break;
    case 'hook': rect(s, cx - 1, ny - 3, 3, 5, P.SKIN_D); rect(s, cx, ny + 2, 3, 2, P.SKIN_D); break;
    default: break;
  }
  // mouth (it flaps while they talk)
  const my = ey + 12, open = Math.round(talk * 3);
  if (f.whiskers === 'beard') { ellipse(s, cx, my + 5, hw * 0.8, 7, P.HAIR); }
  else if (f.whiskers === 'wizard') { ellipse(s, cx, my + 9, hw * 0.75, 13, P.HAIR); poly(s, [[cx - 6, my + 18], [cx + 6, my + 18], [cx, my + 28]], P.HAIR); for (const k of [-4, 0, 4]) rect(s, cx + k, my + 8, 1, 12, P.HAIR_D); }
  else if (f.whiskers === 'goatee') ellipse(s, cx, my + 6, 3, 4, P.HAIR);
  else if (f.whiskers === 'stubble') for (let i = 0; i < 14; i++) pset(s, cx - 8 + ((i * 7) % 17), my + 3 + (i % 3), P.SKIN_D);
  switch (f.mouth) {
    case 'buck': rect(s, cx - 5, my, 10, 2 + open, P.INK); rect(s, cx - 3, my + 1, 3, 3, P.WHITE); rect(s, cx + 1, my + 1, 3, 3, P.WHITE); break;
    case 'tongue': rect(s, cx - 5, my, 10, 2 + open, P.INK); ellipse(s, cx + 1, my + 4 + open, 3, 3, P.TONGUE); pset(s, cx + 1, my + 3 + open, P.INK); break;
    case 'grin': rect(s, cx - 8, my - 1, 16, 4 + open, P.INK); rect(s, cx - 7, my - 1, 14, 2, P.WHITE); pset(s, cx - 9, my - 2, P.INK); pset(s, cx + 8, my - 2, P.INK); break;
    case 'ooh': ellipse(s, cx, my + 1, 3, 3 + open * 0.5, P.INK); break;
    case 'wobbly': for (let i = -6; i < 6; i++) pset(s, cx + i, my + ((i + 6) % 2) + (open ? 1 : 0), P.INK); break;
    case 'gap': rect(s, cx - 6, my, 12, 3 + open, P.INK); rect(s, cx - 5, my, 4, 2, P.WHITE); rect(s, cx + 1, my, 4, 2, P.WHITE); break;
    case 'frown': rect(s, cx - 4, my, 8, 1 + open, P.INK); pset(s, cx - 5, my + 1, P.INK); pset(s, cx + 4, my + 1, P.INK); break;
    default: rect(s, cx - 4, my, 8, 1 + open, P.INK);
  }
  if (f.whiskers === 'curly') { rect(s, cx - 8, my - 3, 16, 3, P.HAIR); ellipse(s, cx - 10, my - 5, 2.5, 2.5, P.HAIR); ellipse(s, cx + 10, my - 5, 2.5, 2.5, P.HAIR); pset(s, cx - 10, my - 5, P.SKIN); pset(s, cx + 10, my - 5, P.SKIN); }
  else if (f.whiskers === 'walrus') { ellipse(s, cx, my - 2, 10, 4, P.HAIR); rect(s, cx - 10, my - 2, 4, 6, P.HAIR); rect(s, cx + 6, my - 2, 4, 6, P.HAIR); }
  // extras
  switch (f.extra) {
    case 'freckles': for (const sx of [-1, 1]) for (const [dx, dy] of [[0, 0], [3, 2], [5, -1], [2, 4]]) pset(s, cx + sx * (ex + dx - 1), ey + 6 + dy, P.SKIN_D); break;
    case 'blush': for (const sx of [-1, 1]) ellipse(s, cx + sx * (ex + 2), ey + 7, 3, 1.5, P.PINK); break;
    case 'mole': pset(s, cx + ex + 3, my - 2, P.SKIN_D); break;
    case 'bandaid': rect(s, cx - ex - 6, ey + 5, 8, 3, P.GOLD); rect(s, cx - ex - 3, ey + 5, 2, 3, P.SKIN_D); break;
    case 'specs': for (const sx of [-1, 1]) { ring(s, cx + sx * ex, ey, 6, P.INK); } rect(s, cx - ex + 6, ey - 1, ex * 2 - 11, 1, P.INK); break;
    default: break;
  }
  return outline(s, P.INK);
}
