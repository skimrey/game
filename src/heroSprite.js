/**
 * Hero sprites — the player's character design as retro pixel art (for the 2D boss
 * battles and the reward stage). No 3D: every option of the character editor (build,
 * head, hair, hat, eyes, face, extra, top, bottoms, shoes, back gear, colours) is
 * painted straight into a 28×36 indexed sprite with the hero palette ramp
 * (palette.js HR.*), then outlined. Colours come from the palette, so the palette
 * swap recolours the hero for free.
 *
 *   const sheet = createHeroSheet(design);
 *   sheet.get('side', 'run', 2)   → surface (cached)
 *
 * Views and poses:
 *   side  (facing right)  idle · run (4 frames) · jump · fall · stumble · sit · hurt
 *   front                 idle · up · down · left · right · dance (2) · aim · cheer
 *   back                  idle · sit
 */
import { createSurface, rect, pset, ellipse, line, outline, poly } from './pixel.js';
import { HR, SLOT, FX } from './palette.js';

const RAINBOW = [SLOT.RED, SLOT.GOLD, FX.B, SLOT.CYAN, FX.C, FX.D];

export const HERO_W = 28, HERO_H = 36;
const CX = 14, FEET = 35;

const BUILDS = {
  regular: { leg: 6, torso: 8, side: 6, front: 8, arm: 2 },
  slim: { leg: 7, torso: 8, side: 5, front: 6, arm: 2 },
  sturdy: { leg: 5, torso: 8, side: 7, front: 10, arm: 2 },
  small: { leg: 4, torso: 6, side: 5, front: 7, arm: 2 },
};
const HEADS = {
  square: { w: 10, h: 9, round: 1 },
  round: { w: 10, h: 9, round: 3 },
  wide: { w: 12, h: 8, round: 2 },
  tall: { w: 9, h: 10, round: 2 },
};

/** A filled box with rounded corners (r px cut diagonally). */
function box(s, x, y, w, h, c, r = 0) {
  for (let j = 0; j < h; j++) {
    let inset = 0;
    if (r) {
      const dy = Math.min(j, h - 1 - j);
      inset = dy < r ? r - dy : 0;
      if (r >= 3 && dy === 1) inset = 1;
      if (r >= 3 && dy === 0) inset = 2;
    }
    rect(s, x + inset, y + j, w - inset * 2, 1, c);
  }
}

/** A thick limb from (x0, y0) to (x1, y1), `w` px wide. */
function limb(s, x0, y0, x1, y1, c, w = 2) {
  for (let k = 0; k < w; k++) line(s, x0 + k, y0, x1 + k, y1, c);
}

// ---------------------------------------------------------------------------
// Pose tables: limb offsets per pose (side view)
// ---------------------------------------------------------------------------
// legs: [near foot dx, near foot lift, far foot dx, far foot lift]; arms: [near hand dx, dy, far hand dx, dy]; body: bob
const SIDE_POSES = {
  idle: [{ legs: [1, 0, -1, 0], arms: [1, 0, -1, 0], bob: 0 }],
  run: [
    { legs: [3, 0, -3, 1], arms: [-3, -1, 3, -1], bob: 0 },
    { legs: [1, 2, -1, 0], arms: [0, 0, 0, 0], bob: -1 },
    { legs: [-3, 1, 3, 0], arms: [3, -1, -3, -1], bob: 0 },
    { legs: [-1, 0, 1, 2], arms: [0, 0, 0, 0], bob: -1 },
  ],
  jump: [{ legs: [2, 3, -1, 2], arms: [3, -8, -2, -7], bob: 0 }],
  fall: [{ legs: [1, 0, -2, 1], arms: [4, -6, -4, -6], bob: 0 }],
  stumble: [{ legs: [-3, 0, 2, 2], arms: [5, -2, 4, 1], bob: 1, lean: 2 }],
  hurt: [{ legs: [-2, 1, 2, 1], arms: [-4, -5, 4, -5], bob: 0, lean: -1 }],
  sit: [{ legs: [5, 4, 4, 4], arms: [4, 1, 3, 1], bob: 3, sit: true }],
};

// front view: arms [left hand dx, dy, right hand dx, dy] (dx outward positive), legs [left dx, right dx], crouch
const FRONT_POSES = {
  idle: [{ arms: [0, 0, 0, 0], legs: [0, 0], crouch: 0 }],
  up: [{ arms: [1, -13, 1, -13], legs: [0, 0], crouch: 0, hop: 2 }],
  down: [{ arms: [3, 2, 3, 2], legs: [2, 2], crouch: 3 }],
  left: [{ arms: [4, -6, -2, 1], legs: [1, -1], crouch: 0, lean: -1 }],
  right: [{ arms: [-2, 1, 4, -6], legs: [-1, 1], crouch: 0, lean: 1 }],
  dance: [
    { arms: [4, -10, 2, 2], legs: [1, -1], crouch: 1, lean: -1 },
    { arms: [2, 2, 4, -10], legs: [-1, 1], crouch: 1, lean: 1 },
  ],
  aim: [{ arms: [1, 1, 2, -13], legs: [1, 1], crouch: 0, gun: true }],
  cheer: [{ arms: [4, -12, 4, -12], legs: [1, 1], crouch: 0, hop: 2 }],
};

// ---------------------------------------------------------------------------
// Head, hair and hats
// ---------------------------------------------------------------------------
function headBox(d, headTop, view) {
  const H = HEADS[d.head] || HEADS.square;
  const w = view === 'side' ? H.w - 1 : H.w;
  return { x: CX - Math.floor(w / 2), y: headTop, w, h: H.h, round: H.round };
}

/** Hair behind the head (long hair, ponytails) — drawn before the head. */
function hairBack(s, d, hb, view, t) {
  const hair = HR.HAIR, dark = HR.HAIR_D;
  const { x, y, w, h } = hb;
  if (d.hair === 'long') {
    if (view === 'side') rect(s, x - 1, y + 2, 5, h + 3, dark);
    else rect(s, x - 1, y + 2, w + 2, h + 3, view === 'back' ? hair : dark);
  } else if (d.hair === 'ponytail') {
    const sway = Math.round(Math.sin(t * 6) * 1);
    if (view === 'side') { rect(s, x - 3, y + 2 + sway, 4, 3, hair); rect(s, x - 4, y + 4 + sway, 3, 4, dark); }
    else if (view === 'back') { rect(s, CX - 1, y + h - 2, 3, 5, hair); }
    else { rect(s, x + w, y + 2 + sway, 2, 5, dark); }
  } else if (d.hair === 'bob') {
    if (view === 'side') rect(s, x - 1, y + 2, 4, h - 2, dark);
    else rect(s, x - 1, y + 2, w + 2, h - 3, dark);
  }
}

function face(s, d, hb, view, blink) {
  const { x, y, w, h } = hb;
  if (view === 'back') return;
  const eyeY = y + Math.floor(h / 2);
  const eyeXs = view === 'side' ? [x + w - 3] : [x + Math.floor(w / 2) - 3, x + Math.floor(w / 2) + 2];
  for (const ex of eyeXs) {
    if (blink || d.eyes === 'sleepy') { rect(s, ex, eyeY, 2, 1, HR.EYES); continue; }
    if (d.eyes === 'wide') { rect(s, ex, eyeY - 1, 2, 2, HR.EYE_W); rect(s, ex + (view === 'side' ? 1 : 0), eyeY - 1, 1, 2, HR.EYES); }
    else rect(s, ex, eyeY - 1, 1, 2, HR.EYES);
    if (d.eyes === 'glasses') {
      rect(s, ex - 1, eyeY - 2, 3, 1, HR.ACCENT_D); rect(s, ex - 1, eyeY + 1, 3, 1, HR.ACCENT_D);
      pset(s, ex - 1, eyeY - 1, HR.ACCENT_D); pset(s, ex - 1, eyeY, HR.ACCENT_D); pset(s, ex + 1, eyeY - 1, HR.ACCENT_D); pset(s, ex + 1, eyeY, HR.ACCENT_D);
    }
  }
  if (view === 'front' && d.eyes === 'glasses') rect(s, eyeXs[0] + 2, eyeY - 1, eyeXs[1] - eyeXs[0] - 2, 1, HR.ACCENT_D);
  // nose (side) and mouth
  const mouthY = eyeY + 3;
  if (view === 'side') pset(s, x + w, eyeY + 1, HR.SKIN);
  const mx = view === 'side' ? x + w - 3 : CX - 1;
  if (d.face === 'smile') { rect(s, mx, mouthY, view === 'side' ? 2 : 3, 1, SLOT.INK); if (view !== 'side') { pset(s, mx - 1, mouthY - 1, SLOT.INK); pset(s, mx + 3, mouthY - 1, SLOT.INK); } }
  else if (d.face === 'neutral') rect(s, mx, mouthY, 2, 1, HR.SKIN_D);
  else if (d.face === 'open') rect(s, mx, mouthY - 1, 2, 2, SLOT.INK);
  else if (d.face === 'mustache') { rect(s, mx - (view === 'side' ? 1 : 1), mouthY - 1, view === 'side' ? 3 : 5, 1, HR.HAIR); }
  // cheek / ear
  if (view === 'side') { pset(s, x + 2, eyeY + 1, HR.SKIN_D); pset(s, x + 3, eyeY + 1, HR.SKIN_D); }
}

function hairFront(s, d, hb, view) {
  const hair = HR.HAIR, dark = HR.HAIR_D;
  const { x, y, w, h } = hb;
  switch (d.hair) {
    case 'none': return;
    case 'short':
      rect(s, x, y, w, 2, hair);
      if (view === 'side') { rect(s, x, y, 3, 5, hair); rect(s, x + 3, y + 2, 3, 1, hair); }
      else if (view === 'back') rect(s, x, y, w, h - 2, hair);
      else { rect(s, x, y + 2, 1, 2, hair); rect(s, x + w - 1, y + 2, 1, 2, hair); rect(s, x + 2, y + 2, 3, 1, hair); }
      return;
    case 'spiky':
      rect(s, x, y, w, 2, hair);
      for (let i = 0; i < w; i += 2) pset(s, x + i, y - 1, hair);
      for (let i = 1; i < w; i += 4) pset(s, x + i, y - 2, hair);
      if (view === 'side') rect(s, x, y, 3, 5, hair);
      else if (view === 'back') rect(s, x, y, w, h - 2, hair);
      return;
    case 'long':
    case 'bob':
      rect(s, x - 1, y, w + 2, 2, hair);
      if (view === 'side') rect(s, x - 1, y, 4, h - 1, hair);
      else if (view === 'back') rect(s, x - 1, y, w + 2, h, hair);
      else { rect(s, x - 1, y + 1, 2, h - 2, hair); rect(s, x + w - 1, y + 1, 2, h - 2, hair); rect(s, x + 1, y + 2, 3, 1, hair); }
      return;
    case 'ponytail':
      rect(s, x, y, w, 2, hair);
      if (view === 'side') rect(s, x, y, 3, 4, hair);
      else if (view === 'back') rect(s, x, y, w, h - 3, hair);
      else { rect(s, x + w - 4, y + 2, 3, 1, hair); }
      pset(s, view === 'side' ? x - 1 : x + w, y + 2, HR.ACCENT);
      return;
    case 'mohawk':
      if (view === 'side') { rect(s, x + 1, y - 3, w - 3, 3, hair); rect(s, x + 2, y - 4, w - 5, 1, dark); }
      else { rect(s, CX - 1, y - 4, 3, 5, hair); pset(s, CX, y - 5, dark); }
      rect(s, x, y, w, 1, dark);
      return;
  }
}

function hat(s, d, hb, view, t) {
  const c = HR.HAT, cd = HR.HAT_D;
  const { x, y, w } = hb;
  const side = view === 'side';
  switch (d.hat) {
    case 'none': return;
    case 'cap':
      box(s, x, y - 2, w, 4, c, 2);
      rect(s, x, y + 1, w, 1, cd);
      if (side) rect(s, x + w - 1, y + 1, 4, 2, cd);
      else if (view === 'front') rect(s, x + 1, y + 2, w - 2, 1, cd);
      return;
    case 'beanie':
      box(s, x - 1, y - 2, w + 2, 5, c, 2);
      rect(s, x - 1, y + 2, w + 2, 2, cd);
      rect(s, CX - 1, y - 4, 2, 2, HR.ACCENT);
      return;
    case 'headband':
      rect(s, x - (side ? 0 : 0), y + 2, w, 2, HR.ACCENT);
      if (side) { rect(s, x - 3, y + 3, 3, 1, HR.ACCENT); pset(s, x - 4, y + 4, HR.ACCENT_D); }
      return;
    case 'crown':
      rect(s, x + 1, y - 2, w - 2, 3, SLOT.GOLD);
      for (let i = x + 1; i < x + w - 1; i += 3) pset(s, i, y - 3, SLOT.GOLD);
      pset(s, CX, y - 1, SLOT.RED);
      rect(s, x + 1, y, w - 2, 1, SLOT.GOLD_DARK);
      return;
    case 'helmet':
      box(s, x - 1, y - 2, w + 2, 6, c, 3);
      rect(s, x - 1, y + 3, w + 2, 1, cd);
      if (side) rect(s, x + w - 2, y + 4, 2, 3, cd);
      else if (view === 'front') { rect(s, x + 1, y + 4, 1, 3, cd); rect(s, x + w - 2, y + 4, 1, 3, cd); }
      return;
    case 'tophat':
      rect(s, x - 1, y + 1, w + 2, 2, cd);
      rect(s, x + 1, y - 7, w - 2, 8, c);
      rect(s, x + 1, y - 1, w - 2, 1, HR.ACCENT);
      return;
    case 'wizard': {
      rect(s, x - 2, y + 1, w + 4, 2, cd);
      const tip = side ? -3 : 0;
      poly(s, [[x, y + 1], [x + w, y + 1], [CX + 1 + tip, y - 9]], c);
      pset(s, CX + tip + 1, y - 9, c); pset(s, CX + tip, y - 10, cd);
      pset(s, CX - 1, y - 3, SLOT.GOLD); pset(s, CX + 1, y - 5, SLOT.GOLD);
      return;
    }
    case 'viking':
      box(s, x - 1, y - 2, w + 2, 5, c, 3);
      rect(s, x - 1, y + 2, w + 2, 1, cd);
      if (side) { rect(s, x + w, y - 3, 2, 2, SLOT.WHITE); pset(s, x + w + 2, y - 5, SLOT.WHITE); pset(s, x + w + 1, y - 4, SLOT.WHITE); }
      else { for (const sx of [-1, 1]) { const hx = sx < 0 ? x - 2 : x + w + 1; rect(s, hx, y - 3, 1, 2, SLOT.WHITE); pset(s, hx + (sx < 0 ? -1 : 1), y - 5, SLOT.WHITE); pset(s, hx + (sx < 0 ? -1 : 1), y - 4, SLOT.WHITE); } }
      return;
    case 'halo': {
      const bob = Math.round(Math.sin(t * 3));
      rect(s, x + 1, y - 4 + bob, w - 2, 1, SLOT.GOLD);
      pset(s, x, y - 3 + bob, SLOT.GOLD); pset(s, x + w - 1, y - 3 + bob, SLOT.GOLD);
      rect(s, x + 1, y - 2 + bob, w - 2, 1, SLOT.GOLD_DARK);
      return;
    }
    case 'flowers':
      for (let i = 0; i < w; i += 2) {
        pset(s, x + i, y, [SLOT.RED, SLOT.GOLD, HR.ACCENT, SLOT.CYAN][(i / 2) % 4]);
        pset(s, x + i + 1, y + 1, HR.HAT_D);
      }
      return;
    case 'partyhat': {
      const tip = side ? 1 : 0;
      for (let i = 0; i < 7; i++) {
        const half = Math.max(0, 4 - Math.floor(i * 0.6));
        rect(s, CX - half + tip * Math.floor(i / 3), y - i, half * 2 + 1, 1, i % 2 ? HR.ACCENT : c);
      }
      rect(s, CX - 1 + tip * 2, y - 8, 3, 2, SLOT.WHITE);
      return;
    }
    case 'gemcrown':
      rect(s, x + 1, y - 2, w - 2, 3, SLOT.GOLD);
      for (let i = x + 1; i < x + w - 1; i += 2) pset(s, i, y - 3, SLOT.GOLD);
      [SLOT.RED, SLOT.CYAN, FX.B, FX.D].forEach((gem, i) => { const gx = x + 2 + i * Math.floor((w - 4) / 3); if (gx < x + w - 1) pset(s, gx, y - 1, gem); });
      rect(s, x + 1, y, w - 2, 1, SLOT.GOLD_DARK);
      return;
    case 'unicorn': {
      const hx = side ? x + w - 3 : CX;
      for (let i = 0; i < 6; i++) rect(s, hx - (i < 3 ? 1 : 0) + (side ? Math.floor(i / 2) : 0), y - 1 - i, i < 3 ? 2 : 1, 1, i % 2 ? SLOT.WHITE : SLOT.GOLD);
      // rainbow mane down the back
      if (side) RAINBOW.forEach((col, i) => pset(s, x - 1, y + i, col));
      else if (view === 'back') RAINBOW.forEach((col, i) => rect(s, CX - 1, y + i, 2, 1, col));
      else { pset(s, x - 1, y + 1, RAINBOW[0]); pset(s, x + w, y + 1, RAINBOW[4]); }
      return;
    }
    case 'pirate':
      rect(s, x - 2, y, w + 4, 2, c);
      box(s, x, y - 3, w, 4, c, 2);
      pset(s, x - 2, y - 1, c); pset(s, x + w + 1, y - 1, c);
      if (view !== 'back') { pset(s, side ? x + w - 3 : CX, y - 2, SLOT.WHITE); }
      rect(s, x, y + 1, w, 1, cd);
      return;
  }
}

function extra(s, d, hb, view, neckY, t, run) {
  const { x, y, w, h } = hb;
  const eyeY = y + Math.floor(h / 2);
  switch (d.extra) {
    case 'scarf': {
      rect(s, CX - 4, neckY - 1, 8, 2, HR.ACCENT);
      if (view === 'side') {
        const flap = Math.round(Math.sin(t * 14) * (run ? 1.5 : 0.5));
        rect(s, CX - 8, neckY + flap, 5, 2, HR.ACCENT); pset(s, CX - 9, neckY + 1 + flap, HR.ACCENT_D);
      } else if (view === 'front') rect(s, CX + 1, neckY + 1, 2, 4, HR.ACCENT_D);
      return;
    }
    case 'bowtie':
      if (view === 'back') return;
      if (view === 'side') { rect(s, CX + 1, neckY, 2, 2, SLOT.RED); return; }
      rect(s, CX - 3, neckY, 2, 3, SLOT.RED); rect(s, CX + 1, neckY, 2, 3, SLOT.RED); rect(s, CX - 1, neckY + 1, 2, 1, SLOT.RED_DARK);
      return;
    case 'monocle':
      if (view === 'back') return;
      {
        const ex = view === 'side' ? x + w - 3 : x + Math.floor(w / 2) + 2;
        pset(s, ex - 1, eyeY - 2, SLOT.GOLD); pset(s, ex + 1, eyeY - 2, SLOT.GOLD); pset(s, ex - 1, eyeY + 1, SLOT.GOLD); pset(s, ex + 1, eyeY + 1, SLOT.GOLD);
        pset(s, ex + 1, eyeY + 2, SLOT.GOLD_DARK); pset(s, ex + 1, eyeY + 3, SLOT.GOLD_DARK);
      }
      return;
    case 'starshades':
      if (view === 'back') return;
      if (view === 'side') rect(s, x + w - 5, eyeY - 1, 5, 2, HR.ACCENT);
      else { rect(s, x + 1, eyeY - 1, w - 2, 1, HR.ACCENT); rect(s, x + 1, eyeY, 4, 1, HR.ACCENT_D); rect(s, x + w - 5, eyeY, 4, 1, HR.ACCENT_D); }
      pset(s, view === 'side' ? x + w - 2 : x + 2, eyeY - 1, SLOT.WHITE);
      return;
    case 'heromask':
      if (view === 'back') { rect(s, x, eyeY - 1, w, 2, HR.ACCENT); return; }
      rect(s, x + (view === 'side' ? 2 : 0), eyeY - 2, w - (view === 'side' ? 2 : 0), 3, HR.ACCENT);
      if (view === 'side') { pset(s, x + w - 3, eyeY - 1, SLOT.WHITE); rect(s, x - 2, eyeY - 1, 3, 1, HR.ACCENT_D); }
      else { pset(s, x + Math.floor(w / 2) - 3, eyeY - 1, SLOT.WHITE); pset(s, x + Math.floor(w / 2) + 2, eyeY - 1, SLOT.WHITE); }
      return;
  }
}

// ---------------------------------------------------------------------------
// Back gear
// ---------------------------------------------------------------------------
function gearBehind(s, d, torso, view, t, airborne) {
  const a = HR.ACCENT, ad = HR.ACCENT_D;
  const { x, y, w, h } = torso;
  const side = view === 'side';
  // side view: the back is on the left (x); back view: gear covers the middle of the torso
  const bx = side ? x - 3 : CX - 3;
  switch (d.back) {
    case 'backpack':
      if (side) { box(s, x - 4, y + 1, 5, h - 1, a, 1); rect(s, x - 4, y + 4, 5, 1, ad); }
      else if (view === 'back') { box(s, CX - 4, y + 1, 8, h - 1, a, 1); rect(s, CX - 3, y + 5, 6, 2, ad); }
      else { rect(s, x - 1, y, 1, 3, ad); rect(s, x + w, y, 1, 3, ad); }
      return;
    case 'jetpack':
      if (side) { rect(s, x - 4, y, 4, h, SLOT.GRAY); rect(s, x - 4, y + 1, 4, 1, a); }
      else if (view === 'back') { rect(s, CX - 5, y, 4, h, SLOT.GRAY); rect(s, CX + 1, y, 4, h, SLOT.GRAY); rect(s, CX - 5, y + 1, 10, 1, a); }
      else { rect(s, x - 2, y + 1, 2, h - 1, SLOT.GRAY); rect(s, x + w, y + 1, 2, h - 1, SLOT.GRAY); }
      if (airborne) {
        const fl = 2 + Math.round(Math.abs(Math.sin(t * 30)) * 2);
        if (side) rect(s, x - 3, y + h, 2, fl, SLOT.GOLD);
        else { rect(s, CX - 4, y + h, 2, fl, SLOT.GOLD); rect(s, CX + 2, y + h, 2, fl, SLOT.GOLD); }
      }
      return;
    case 'cape': {
      const wave = Math.round(Math.sin(t * 8) * 1);
      if (side) poly(s, [[x + 1, y], [x - 2, y], [x - 6 + wave, y + h + 4], [x + 1, y + h + 2]], a);
      else if (view === 'back') { rect(s, x - 1, y, w + 2, h + 4, a); rect(s, x - 1, y + h + 3, w + 2, 1, ad); }
      else { rect(s, x - 2, y, 2, h + 3, ad); rect(s, x + w, y, 2, h + 3, ad); }
      return;
    }
    case 'wings': {
      const flap = Math.round(Math.sin(t * (airborne ? 18 : 4)) * 2);
      if (side) { poly(s, [[x, y + 2], [x - 8, y - 3 + flap], [x - 9, y + 2 + flap], [x - 5, y + 6]], SLOT.WHITE); line(s, x - 1, y + 3, x - 7, y - 1 + flap, SLOT.GRAY); }
      else {
        poly(s, [[x, y + 2], [x - 7, y - 4 + flap], [x - 8, y + 3 + flap], [x - 2, y + 6]], SLOT.WHITE);
        poly(s, [[x + w, y + 2], [x + w + 7, y - 4 + flap], [x + w + 8, y + 3 + flap], [x + w + 2, y + 6]], SLOT.WHITE);
      }
      return;
    }
    case 'rainbowcape': {
      const wave = Math.round(Math.sin(t * 8) * 1);
      if (side) RAINBOW.forEach((col, i) => rect(s, x - 2 - Math.floor(i * 0.7) + (i > 3 ? wave : 0), y + i * 2, 3, 2, col));
      else if (view === 'back') RAINBOW.forEach((col, i) => rect(s, x - 1, y + i * 2, w + 2, 2, col));
      else { rect(s, x - 2, y, 2, h + 3, RAINBOW[0]); rect(s, x + w, y, 2, h + 3, RAINBOW[4]); }
      return;
    }
    case 'butterfly':
    case 'fairywings':
    case 'dragonwings': {
      const flap = Math.round(Math.sin(t * (airborne ? 18 : 5)) * 2);
      const body = d.back === 'butterfly' ? a : d.back === 'fairywings' ? SLOT.CYAN : ad;
      const trim = d.back === 'butterfly' ? SLOT.GOLD : d.back === 'fairywings' ? SLOT.WHITE : SLOT.INK;
      const wingAt = (sx, dir) => {
        // upper and lower panels
        poly(s, [[sx, y + 1], [sx + dir * 7, y - 5 + flap], [sx + dir * 8, y + 2 + flap], [sx + dir * 2, y + 4]], body);
        poly(s, [[sx, y + 4], [sx + dir * 6, y + 9 + flap], [sx + dir * 3, y + 10], [sx, y + 7]], d.back === 'fairywings' ? FX.D : body);
        if (d.back === 'dragonwings') { line(s, sx, y + 1, sx + dir * 7, y - 5 + flap, trim); line(s, sx + dir * 4, y - 1, sx + dir * 5, y + 6, trim); pset(s, sx + dir * 7, y - 6 + flap, SLOT.WHITE); }
        else { pset(s, sx + dir * 6, y - 1 + flap, trim); pset(s, sx + dir * 4, y + 7, trim); }
        if (d.back === 'fairywings') { pset(s, sx + dir * 6, y - 3 + flap, SLOT.GOLD); pset(s, sx + dir * 3, y + 2, SLOT.WHITE); }
      };
      if (side) wingAt(x + 1, -1);
      else { wingAt(x, -1); wingAt(x + w, 1); }
      return;
    }
    case 'sword':
      if (side || view === 'back') {
        line(s, bx - 2, y + h + 1, bx + 5, y - 5, SLOT.GRAY); line(s, bx - 1, y + h + 1, bx + 6, y - 5, SLOT.WHITE);
        rect(s, bx + 4, y - 4, 3, 1, SLOT.GOLD); rect(s, bx + 6, y - 7, 2, 3, ad);
      } else { line(s, x + w + 1, y - 4, x + w + 1, y - 1, ad); }
      return;
    case 'guitar':
      if (side || view === 'back') {
        ellipse(s, bx + 1, y + h - 1, 3.5, 3.5, a); ellipse(s, bx + 1, y + h - 5, 2.5, 2.5, a);
        pset(s, bx + 1, y + h - 2, SLOT.INK);
        line(s, bx + 2, y + h - 6, bx + 6, y - 6, ad); rect(s, bx + 5, y - 8, 2, 3, SLOT.INK);
      } else line(s, x - 1, y + 1, x + w, y + h - 1, ad);
      return;
    case 'shield':
      if (side) { ellipse(s, x - 2, y + h / 2, 3, 5, a); rect(s, x - 3, y + h / 2 - 1, 2, 2, SLOT.GOLD); }
      else if (view === 'back') { ellipse(s, CX, y + h / 2, 5, 5, a); ellipse(s, CX, y + h / 2, 2.5, 2.5, ad); pset(s, CX, y + h / 2, SLOT.GOLD); }
      else { rect(s, x - 1, y + 1, 1, h - 2, ad); }
      return;
  }
}

// ---------------------------------------------------------------------------
// The figure
// ---------------------------------------------------------------------------
function legsAndShoes(s, d, hipY, feetY, view, legs, sit, airborne = false) {
  const B = BUILDS[d.build] || BUILDS.regular;
  const bottom = HR.BOTTOM, bottomD = HR.BOTTOM_D;
  const shortsOrSkirt = d.bottom === 'shorts' || d.bottom === 'skirt';
  const boots = d.shoes === 'boots' || d.shoes === 'rocketboots';
  const drawLeg = (hx, fx, lift, near) => {
    const fy = feetY - lift;
    const col = near ? bottom : bottomD;
    if (sit) {
      // legs out in front (side view)
      rect(s, hx, hipY, fx - hx + 2, 2, col);
      if (shortsOrSkirt) rect(s, hx + 3, hipY, fx - hx - 1, 2, near ? HR.SKIN : HR.SKIN_D);
      rect(s, fx + 1, hipY - 1, 2, 3, near ? HR.SHOES : HR.SHOES_D);
      return;
    }
    limb(s, hx, hipY, fx, fy - 1, col, 2);
    if (shortsOrSkirt) {
      const midY = hipY + Math.ceil((fy - hipY) / 2);
      for (let yy = midY; yy < fy; yy++) {
        const xx = Math.round(hx + (fx - hx) * (yy - hipY) / Math.max(1, fy - 1 - hipY));
        rect(s, xx, yy, 2, 1, near ? HR.SKIN : HR.SKIN_D);
      }
    }
    const shoe = near ? HR.SHOES : HR.SHOES_D;
    const sw = view === 'side' ? 3 : 2;
    rect(s, fx, fy - (boots ? 2 : 1), sw, boots ? 3 : 2, shoe);
    if (d.shoes === 'sneakers') rect(s, fx, fy, sw, 1, SLOT.WHITE);
    if (d.shoes === 'lightup') for (let i = 0; i < sw; i++) pset(s, fx + i, fy, RAINBOW[(i + (near ? 0 : 3)) % RAINBOW.length]);
    if (d.shoes === 'rocketboots') {
      rect(s, fx, fy - 2, sw, 1, HR.ACCENT);                          // a glowing band
      if (view === 'side') pset(s, fx - 1, fy - 1, SLOT.GRAY);          // the nozzle at the heel
      if (airborne) { rect(s, fx, fy + 1, sw, 1, SLOT.GOLD); if (near) pset(s, fx + (sw > 2 ? 1 : 0), fy + 2, SLOT.RED); }
    }
  };
  return { drawLeg, B };
}

function torsoOf(d, view, top) {
  const B = BUILDS[d.build] || BUILDS.regular;
  const w = view === 'side' ? B.side : B.front;
  return { x: CX - Math.floor(w / 2), y: top, w, h: B.torso };
}

function paintTorso(s, d, torso, view) {
  const { x, y, w, h } = torso;
  const T = HR.TOP, TD = HR.TOP_D;
  const side = view === 'side';
  switch (d.top) {
    case 'tee':
      box(s, x, y, w, h, T, 1);
      break;
    case 'jacket':
      box(s, x, y, w, h, T, 1);
      if (view === 'front') { rect(s, CX - 1, y + 1, 2, h - 1, HR.ACCENT); rect(s, CX - 1, y + 1, 1, h - 1, TD); }
      else if (side) rect(s, x + w - 2, y + 1, 1, h - 1, TD);
      rect(s, x, y + h - 1, w, 1, TD);
      break;
    case 'hoodie':
      box(s, x, y, w, h, T, 1);
      if (side) rect(s, x - 1, y - 1, 3, 3, TD);
      else if (view === 'back') rect(s, CX - 3, y - 1, 6, 3, TD);
      else { rect(s, CX - 2, y + h - 4, 4, 2, TD); pset(s, CX - 1, y + 1, SLOT.WHITE); pset(s, CX, y + 2, SLOT.WHITE); }
      break;
    case 'overalls':
      box(s, x, y, w, h, HR.ACCENT, 1);
      rect(s, x + 1, y + 3, w - 2, h - 3, HR.BOTTOM);
      if (view !== 'side') { rect(s, x + 1, y, 1, 3, HR.BOTTOM); rect(s, x + w - 2, y, 1, 3, HR.BOTTOM); pset(s, x + 1, y + 3, SLOT.GOLD); pset(s, x + w - 2, y + 3, SLOT.GOLD); }
      else rect(s, x + w - 2, y, 1, 3, HR.BOTTOM);
      break;
    case 'tunic':
      box(s, x, y, w, h + 2, T, 1);
      rect(s, x, y + h - 3, w, 1, HR.ACCENT_D);
      if (view === 'front') pset(s, CX, y + h - 3, SLOT.GOLD);
      break;
    case 'robe':
      poly(s, [[x, y], [x + w, y], [x + w + 2, y + h + 7], [x - 2, y + h + 7]], T);
      rect(s, x - 2, y + h + 6, w + 4, 1, TD);
      for (const [sx, sy] of [[1, 2], [w - 2, 5], [2, h + 2], [w - 1, h + 4]]) pset(s, x + sx, y + sy, SLOT.GOLD);
      break;
    default:
      box(s, x, y, w, h, T, 1);
  }
  // belt line for a skirt
  if (d.bottom === 'skirt' && d.top !== 'robe') {
    poly(s, [[x, y + h - 1], [x + w, y + h - 1], [x + w + 2, y + h + 3], [x - 2, y + h + 3]], HR.BOTTOM);
    rect(s, x - 2, y + h + 2, w + 4, 1, HR.BOTTOM_D);
  }
}

function sleeveColor(d) {
  return d.top === 'tee' ? null : d.top === 'overalls' ? HR.ACCENT : HR.TOP;
}

function arm(s, d, sx, sy, hx, hy, near) {
  const sleeve = sleeveColor(d);
  const shade = near ? 0 : 1;
  const col = sleeve === null ? (near ? HR.SKIN : HR.SKIN_D) : (sleeve === HR.TOP ? (near ? HR.TOP : HR.TOP_D) : (near ? HR.ACCENT : HR.ACCENT_D));
  limb(s, sx, sy, hx, hy, col, 2);
  if (sleeve === null) limb(s, sx, sy, sx + Math.round((hx - sx) / 3), sy + Math.round((hy - sy) / 3), near ? HR.TOP : HR.TOP_D, 2);
  rect(s, hx, hy, 2, 2, shade ? HR.SKIN_D : HR.SKIN);
}

/**
 * Paint one hero frame. Returns a new HERO_W×HERO_H surface (outlined).
 * t: animation time for cape / scarf / ponytail sway.
 */
export function paintHero(design, view = 'side', pose = 'idle', frameIndex = 0, t = 0) {
  const d = design;
  const s = createSurface(HERO_W, HERO_H);
  const B = BUILDS[d.build] || BUILDS.regular;
  const H = HEADS[d.head] || HEADS.square;
  if (view === 'side') {
    const P = (SIDE_POSES[pose] || SIDE_POSES.idle);
    const p = P[frameIndex % P.length];
    const bob = p.bob || 0;
    const airborne = pose === 'jump' || pose === 'fall';
    const feetY = FEET - (p.sit ? 0 : 0);
    const legTop = FEET - 1 - B.leg + bob + (p.sit ? 0 : 0);
    const hipY = p.sit ? FEET - 4 : legTop;
    const torsoTop = (p.sit ? hipY : legTop) - B.torso + 1;
    const lean = p.lean || 0;
    const torso = torsoOf(d, 'side', torsoTop);
    torso.x += lean;
    const hb = headBox(d, torsoTop - H.h + 1, 'side');
    hb.x += lean + 1;
    gearBehind(s, d, torso, 'side', t, airborne);
    hairBack(s, d, hb, 'side', t);
    const { drawLeg } = legsAndShoes(s, d, hipY, feetY, 'side', p.legs, p.sit, airborne);
    const hx = CX - 1;
    // far arm, far leg, torso, near leg, near arm
    arm(s, d, torso.x + Math.floor(torso.w / 2) - 1, torsoTop + 1, CX - 1 + p.arms[2] + lean, torsoTop + B.torso - 2 + p.arms[3], false);
    drawLeg(hx, hx + p.legs[2], p.legs[3], false);
    paintTorso(s, d, torso, 'side');
    drawLeg(hx - 1, hx - 1 + p.legs[0], p.legs[1], true);
    box(s, hb.x, hb.y, hb.w, hb.h, HR.SKIN, H.round);
    face(s, d, hb, 'side', false);
    hairFront(s, d, hb, 'side');
    hat(s, d, hb, 'side', t);
    extra(s, d, hb, 'side', torsoTop, t, pose === 'run');
    arm(s, d, torso.x + Math.floor(torso.w / 2), torsoTop + 1, CX + p.arms[0] + lean, torsoTop + B.torso - 2 + p.arms[1], true);
  } else {
    const P = (FRONT_POSES[pose] || FRONT_POSES.idle);
    const p = P[frameIndex % P.length];
    const crouch = p.crouch || 0, hop = p.hop || 0, lean = p.lean || 0;
    const sit = pose === 'sit';
    const legTop = FEET - 1 - B.leg + crouch - hop + (sit ? 3 : 0);
    const torsoTop = legTop - B.torso + 1;
    const torso = torsoOf(d, view, torsoTop);
    torso.x += lean;
    const hb = headBox(d, torsoTop - H.h + 1, view);
    hb.x += lean;
    const back = view === 'back';
    if (!back) gearBehind(s, d, torso, view, t, hop > 0);
    hairBack(s, d, hb, view, t);
    // legs
    const feetY = FEET - hop;
    const lx = CX - 3 - (p.legs[0] || 0), rx = CX + 1 + (p.legs[1] || 0);
    const { drawLeg } = legsAndShoes(s, d, legTop, feetY, 'front', null, false, hop > 0);
    if (!sit) { drawLeg(CX - 3, lx, 0, true); drawLeg(CX + 1, rx, 0, true); }
    else { rect(s, CX - 4, legTop, 8, 3, HR.BOTTOM); }
    // arms (behind the torso when raised above the head? no — always beside)
    const shY = torsoTop + 1;
    const armL = [torso.x - 2, shY, torso.x - 2 - p.arms[0], torsoTop + B.torso - 2 + p.arms[1]];
    const armR = [torso.x + torso.w, shY, torso.x + torso.w + p.arms[2], torsoTop + B.torso - 2 + p.arms[3]];
    paintTorso(s, d, torso, view);
    arm(s, d, ...armL, true);
    arm(s, d, ...armR, true);
    if (p.gun) {
      const [, , gx, gy] = armR;
      rect(s, gx - 1, gy - 4, 3, 4, SLOT.GRAY); rect(s, gx, gy - 6, 1, 2, SLOT.DARK); pset(s, gx + 1, gy - 1, HR.ACCENT);
    }
    box(s, hb.x, hb.y, hb.w, hb.h, HR.SKIN, H.round);
    face(s, d, hb, view, false);
    hairFront(s, d, hb, view);
    hat(s, d, hb, view, t);
    extra(s, d, hb, view, torsoTop, t, false);
    if (back) gearBehind(s, d, torso, 'back', t, hop > 0);
  }
  return outline(s, SLOT.INK);
}

/** A cached set of frames for one design. */
export function createHeroSheet(design) {
  const cache = new Map();
  return {
    design,
    get(view, pose, frameIndex = 0, swayFrame = 0) {
      const key = `${view}|${pose}|${frameIndex}|${swayFrame}`;
      let spr = cache.get(key);
      if (!spr) { spr = paintHero(design, view, pose, frameIndex, swayFrame * 0.25); cache.set(key, spr); }
      return spr;
    },
  };
}
