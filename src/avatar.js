/**
 * Player Avatar
 *
 * A jointed, box-built character that sits on top of the physics player.
 * The physics body stays an axis-aligned box (see physics.js); this module is
 * purely visual. It reads the player's position / vertical velocity every
 * fixed physics step and produces:
 *   - a list of posed box parts ({ matrix, color }) for the renderer
 *   - gameplay-visual events (jump, land, step) for particles / audio
 *
 * Animation is fully procedural:
 *   idle  – breathing, arm sway, blinking, looking around
 *   run   – distance-driven stride with knees/elbows, torso twist, forward lean,
 *           automatic foot-to-ground compensation and banking into turns
 *   air   – separate rising (tucked) and falling (arms out) poses, blended by vy
 *   land / jump – damped-spring squash & stretch scaled by impact speed
 *   spawn – pop-in with overshoot after respawn / level change
 *
 * The module has no DOM/WebGL dependencies so it can be unit-tested in Node.
 */

import { PLAYER } from './physics.js';
import { compose, translation, scaling, rotationX, rotationY, rotationZ, transformPoint, identity } from './mat4.js';
import { trailPreviewParts } from './trails.js';
import { normalizeCharacter, hexToRgb } from './character.js';

// ---------------------------------------------------------------------------
// Proportions (world units, origin = feet centre, +Z = forward, +Y = up).
// The whole figure fits inside the physics box: 0.8 wide, 1.5 tall.
// ---------------------------------------------------------------------------
export const AVATAR_DIMENSIONS = {
  thigh: 0.3,
  shin: 0.3,            // includes shoe; hip height at rest = thigh + shin
  hipSpacing: 0.12,
  torsoHeight: 0.44,
  torsoWidth: 0.5,
  torsoDepth: 0.3,
  shoulderY: 0.4,       // relative to waist pivot
  shoulderX: 0.33,
  upperArm: 0.24,
  forearm: 0.2,
  head: 0.4,
  neckGap: 0.02,
};
const D = AVATAR_DIMENSIONS;
const STRIDE_LENGTH = 1.7; // world units travelled per full run cycle

export const AVATAR_PALETTES = {
  classic: { shirt: [0.9, 0.3, 0.25], pants: [0.2, 0.28, 0.5], skin: [0.98, 0.8, 0.64], cap: [0.95, 0.95, 0.96], shoes: [0.22, 0.17, 0.15], pack: [0.96, 0.7, 0.2], eyes: [0.08, 0.08, 0.12] },
  ocean: { shirt: [0.2, 0.55, 0.9], pants: [0.93, 0.93, 0.9], skin: [0.78, 0.57, 0.42], cap: [0.98, 0.45, 0.2], shoes: [0.15, 0.18, 0.25], pack: [0.25, 0.8, 0.7], eyes: [0.08, 0.08, 0.12] },
  forest: { shirt: [0.3, 0.62, 0.3], pants: [0.45, 0.32, 0.2], skin: [0.55, 0.38, 0.26], cap: [0.85, 0.2, 0.22], shoes: [0.2, 0.15, 0.1], pack: [0.9, 0.85, 0.55], eyes: [0.06, 0.06, 0.08] },
  royal: { shirt: [0.55, 0.3, 0.8], pants: [0.18, 0.16, 0.22], skin: [0.99, 0.86, 0.74], cap: [1, 0.83, 0.15], shoes: [0.85, 0.85, 0.88], pack: [0.95, 0.45, 0.65], eyes: [0.1, 0.05, 0.15] },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const easeOutBack = t => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** A pose is a flat object of joint angles so poses can be blended numerically. */
function makePose(values = {}) {
  return {
    legSwingL: 0, legSwingR: 0, kneeL: 0.05, kneeR: 0.05,
    armSwingL: 0, armSwingR: 0, armOutL: 0.1, armOutR: 0.1, elbowL: 0.15, elbowR: 0.15,
    lean: 0, twist: 0, headYaw: 0, headPitch: 0, bob: 0,
    ...values,
  };
}

function blendPose(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = {};
  for (const key in a) out[key] = lerp(a[key], b[key], t);
  return out;
}

/** Swap left/right limbs so an asymmetric pose can be mirrored. */
function mirrorPose(p) {
  return {
    ...p,
    legSwingL: p.legSwingR, legSwingR: p.legSwingL, kneeL: p.kneeR, kneeR: p.kneeL,
    armSwingL: p.armSwingR, armSwingR: p.armSwingL, armOutL: p.armOutR, armOutR: p.armOutL,
    elbowL: p.elbowR, elbowR: p.elbowL, twist: -p.twist, headYaw: -p.headYaw,
  };
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------
function idlePose(t, lookAround) {
  const breathe = Math.sin(t * 2.2);
  return makePose({
    armSwingL: 0.05 * Math.sin(t * 1.1), armSwingR: 0.05 * Math.sin(t * 1.1 + 1.3),
    armOutL: 0.1 + 0.03 * breathe, armOutR: 0.1 + 0.03 * breathe,
    elbowL: 0.18, elbowR: 0.18,
    lean: 0.02,
    bob: 0.012 * breathe,
    headYaw: lookAround * 0.45 * Math.sin(t * 0.6),
    headPitch: lookAround * 0.08 * Math.sin(t * 0.9 + 0.5),
  });
}

function runPose(phase) {
  const s = Math.sin(phase), c = Math.cos(phase);
  return makePose({
    legSwingL: 0.75 * s, legSwingR: -0.75 * s,
    // the leg that is swinging forward (recovering) tucks its knee
    kneeL: 0.25 + 1.15 * Math.max(0, c), kneeR: 0.25 + 1.15 * Math.max(0, -c),
    armSwingL: -0.75 * s, armSwingR: 0.75 * s,
    armOutL: 0.12, armOutR: 0.12,
    elbowL: 1.35, elbowR: 1.35,
    lean: 0.22,
    twist: 0.14 * s,
    headYaw: -0.1 * s,
    headPitch: -0.12,
    bob: 0.05 * Math.abs(s),
  });
}

function risePose() {
  return makePose({
    legSwingL: 0.65, kneeL: 1.35, legSwingR: -0.3, kneeR: 0.55,
    armSwingL: -0.5, armOutL: 0.35, elbowL: 0.5,
    armSwingR: 2.6, armOutR: 0.3, elbowR: 0.3,
    lean: 0.08, headPitch: -0.15,
  });
}

function fallPose(t) {
  const flail = Math.sin(t * 13);
  return makePose({
    legSwingL: 0.3 + 0.15 * flail, kneeL: 0.6, legSwingR: -0.15 - 0.15 * flail, kneeR: 0.45,
    armSwingL: 0.4 + 0.25 * flail, armOutL: 1.35, elbowL: 0.5,
    armSwingR: 0.4 - 0.25 * flail, armOutR: 1.35, elbowR: 0.5,
    lean: -0.06, headPitch: 0.15,
  });
}

/** Air dash: streamlined, arms swept back, legs trailing. */
function dashPose() {
  return makePose({
    legSwingL: -0.7, kneeL: 0.9, legSwingR: -0.35, kneeR: 0.5,
    armSwingL: -1.3, armSwingR: -1.3, armOutL: 0.35, armOutR: 0.35, elbowL: 0.2, elbowR: 0.2,
    lean: 0.75, headPitch: -0.35,
  });
}

/** Ground pound: tucked cannonball, arms up. */
function poundPose() {
  return makePose({
    legSwingL: 1.3, kneeL: 2.1, legSwingR: 1.3, kneeR: 2.1,
    armSwingL: 2.5, armSwingR: 2.5, armOutL: 0.5, armOutR: 0.5, elbowL: 0.4, elbowR: 0.4,
    lean: 0.35, headPitch: 0.2,
  });
}

// ---------------------------------------------------------------------------
// Looks: a character design (see character.js) resolved into dimensions,
// colours and styles. Body builds change proportions; everything else adds or
// recolours boxes. Every look is scaled to fit the physics box (1.5 tall).
// ---------------------------------------------------------------------------
export const BUILDS = {
  regular: { ...AVATAR_DIMENSIONS, armWidth: 0.15, legWidth: 0.2 },
  slim: { ...AVATAR_DIMENSIONS, thigh: 0.31, shin: 0.31, hipSpacing: 0.1, torsoHeight: 0.46, torsoWidth: 0.42, torsoDepth: 0.26, shoulderX: 0.28, head: 0.38, armWidth: 0.13, legWidth: 0.17 },
  sturdy: { ...AVATAR_DIMENSIONS, thigh: 0.28, shin: 0.28, hipSpacing: 0.135, torsoHeight: 0.43, torsoWidth: 0.57, torsoDepth: 0.35, shoulderX: 0.34, head: 0.42, armWidth: 0.165, legWidth: 0.23 },
  small: { ...AVATAR_DIMENSIONS, thigh: 0.24, shin: 0.25, hipSpacing: 0.11, torsoHeight: 0.36, torsoWidth: 0.46, torsoDepth: 0.3, shoulderX: 0.3, upperArm: 0.2, forearm: 0.17, head: 0.46, armWidth: 0.14, legWidth: 0.19 },
};
/** Head box proportions (width, height, depth) relative to the build's head size. */
const HEAD_SHAPES = { square: [1, 1, 1], round: [1, 1, 1], wide: [1.14, 0.92, 1], tall: [0.9, 1.1, 0.94] };
const FIT_HEIGHT = 1.52;      // figure top (at rest) may reach this high …
const FIT_HALF_WIDTH = 0.445; // … and this far sideways; bigger looks are scaled down uniformly

/** The original palette look (no hair, cap, plain mouth) — kept for the playground and tests. */
function paletteLook(pal) {
  return {
    dims: BUILDS.regular,
    colors: { top: pal.shirt, bottom: pal.pants, skin: pal.skin, hat: pal.cap, shoes: pal.shoes, accent: pal.pack, eyes: pal.eyes, hair: [0.35, 0.23, 0.13] },
    styles: { build: 'regular', head: 'square', hair: 'none', hat: 'cap', eyes: 'dots', face: 'neutral', top: 'tee', bottom: 'pants', shoes: 'sneakers', back: 'backpack' },
    fit: 1,
  };
}

/** Resolve a character design into a look (and measure the scale it needs to fit). */
export function lookFor(design) {
  const d = normalizeCharacter(design);
  const colors = Object.fromEntries(Object.entries(d.colors).map(([k, v]) => [k, hexToRgb(v)]));
  const look = { dims: BUILDS[d.build], colors, styles: { ...d }, fit: 1, design: d };
  delete look.styles.colors;
  look.fit = measureFit(look);
  return look;
}

const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const WHITE = [0.96, 0.96, 0.95], DARK = [0.1, 0.1, 0.12], GLASS = [0.72, 0.86, 0.95], FLAME = [1, 0.62, 0.18], GOLD = [1, 0.83, 0.3];
const RAINBOW = [[1, 0.3, 0.35], [1, 0.6, 0.2], [1, 0.9, 0.25], [0.35, 0.85, 0.4], [0.3, 0.6, 1], [0.65, 0.4, 1]];
const REST_ANIM = { bank: 0, blink: 0, groundWeight: 1, cape: 0.05, flap: 0, pony: 0.15, flame: 0, tails: 0 };

/**
 * Build the posed figure: a list of { matrix, color, glow?, tag? } unit-cube parts.
 *   look  from lookFor() / paletteLook()
 *   pose  joint angles (see makePose)
 *   anim  { bank, blink, groundWeight, cape, flap, pony, flame, tails }
 *   root  world matrix of the feet centre (+Z forward)
 */
function buildFigure(look, pose, anim, root) {
  const { dims: D, colors: C, styles: S } = look;
  const parts = [];
  let slot = 'body';   // which clothing slot the boxes being built belong to (see itemParts)
  const box = (parent, cx, cy, cz, sx, sy, sz, color, extra) => {
    parts.push({ matrix: compose(parent, translation(cx, cy, cz), scaling(sx, sy, sz)), color, slot, ...extra });
  };

  // Legs are posed in a hip-local frame first so we can measure how far the
  // lowest shoe corner reaches; on the ground the hips are lowered by exactly
  // that much so a foot is always planted (no floating / sinking).
  const bank = rotationZ(anim.bank);
  const legs = [];
  let lowest = 0;
  for (const [side, swing, knee] of [[1, pose.legSwingL, pose.kneeL], [-1, pose.legSwingR, pose.kneeR]]) {
    const thigh = compose(bank, translation(side * D.hipSpacing, 0, 0), rotationX(-swing));
    const shin = compose(thigh, translation(0, -D.thigh, 0), rotationX(knee));
    // ankle: partially counter-rotate so the sole tends toward flat on the ground
    const ankle = compose(shin, translation(0, -D.shin + 0.08, 0), rotationX(-(knee - swing) * 0.6 * anim.groundWeight));
    const shoe = compose(ankle, translation(0, -0.04, 0.04), scaling(D.legWidth + 0.01, 0.08, 0.3));
    for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      lowest = Math.min(lowest, transformPoint(shoe, [x, -0.5, z])[1]);
    }
    legs.push({ side, thigh, shin, shoe });
  }
  const restHip = D.thigh + D.shin;
  const hipY = lerp(restHip, -lowest, anim.groundWeight) + pose.bob;
  const pelvis = compose(root, translation(0, hipY, 0));
  const hips = compose(pelvis, bank);

  // Legs & bottoms ---------------------------------------------------------
  const bare = S.bottom === 'skirt';
  const thighColor = bare ? C.skin : C.bottom;
  const shinColor = S.bottom === 'pants' ? C.bottom : C.skin;
  const lw = D.legWidth;
  for (const { side, thigh, shin, shoe } of legs) {
    slot = 'bottom';
    box(compose(pelvis, thigh), 0, -D.thigh / 2, 0, lw, D.thigh + 0.02, lw + 0.02, thighColor);
    box(compose(pelvis, shin), 0, -(D.shin - 0.06) / 2, 0, lw - 0.02, D.shin - 0.06, lw, shinColor);
    slot = 'shoes';
    parts.push({ matrix: compose(pelvis, shoe), color: C.shoes, slot, tag: side > 0 ? 'shoeL' : 'shoeR' });
    if (S.shoes === 'boots' || S.shoes === 'rocketboots') box(compose(pelvis, shin), 0, -D.shin + 0.15, 0.005, lw + 0.015, 0.15, lw + 0.03, C.shoes);
    else if (S.bottom !== 'pants') box(compose(pelvis, shin), 0, -D.shin + 0.1, 0, lw - 0.005, 0.05, lw + 0.01, WHITE); // socks
    if (S.shoes === 'lightup') {
      const ankle = compose(pelvis, shoe);
      [[-0.3, RAINBOW[0]], [0, RAINBOW[2]], [0.3, RAINBOW[4]]].forEach(([z, c]) => box(ankle, 0, -0.48, z, 1.06, 0.16, 0.32, c, { glow: 0.85 }));   // glowing soles
    }
    if (S.shoes === 'rocketboots') {
      box(compose(pelvis, shin), 0, -D.shin + 0.21, 0.005, lw + 0.03, 0.03, lw + 0.045, FLAME, { glow: 0.7 });   // glowing trim
      const ankle = compose(pelvis, shoe);
      box(ankle, 0, -0.55, 0, 0.7, 0.12, 0.6, GOLD, { glow: 0.4 });                                           // thrusters
      if (anim.flame > 0.02) box(ankle, 0, -0.6 - 1.4 * anim.flame, -0.1, 0.5, 2.6 * anim.flame, 0.4, FLAME, { glow: 1 });
    }
  }
  slot = 'bottom';
  box(hips, 0, 0.02, 0, D.torsoWidth * 0.92, 0.14, D.torsoDepth * 0.93, C.bottom);
  if (S.bottom === 'skirt') box(hips, 0, -0.09, 0, D.torsoWidth + 0.08, 0.22, D.torsoDepth + 0.1, C.bottom);
  slot = 'top';
  if (S.top === 'tunic') box(hips, 0, -0.06, 0, D.torsoWidth + 0.04, 0.18, D.torsoDepth + 0.05, C.top);
  if (S.top === 'robe') {
    box(hips, 0, -0.24, 0, D.torsoWidth + 0.1, 0.5, D.torsoDepth + 0.12, C.top);                           // long skirt
    for (const [x, y] of [[-0.12, -0.3], [0.1, -0.16], [0.02, -0.4]]) box(hips, x, y, (D.torsoDepth + 0.12) / 2 + 0.005, 0.05, 0.05, 0.01, GOLD, { glow: 0.8 });
  }

  // Torso & top ----------------------------------------------------------
  const tw = D.torsoWidth, th = D.torsoHeight, td = D.torsoDepth;
  const torso = compose(hips, translation(0, 0.03, 0), rotationX(pose.lean), rotationY(pose.twist));
  const front = td / 2 + 0.005;
  slot = 'top';
  box(torso, 0, th / 2, 0, tw, th, td, C.top);
  if (S.top === 'robe') {
    box(torso, 0, 0.03, 0, tw + 0.012, 0.05, td + 0.012, GOLD);                                            // sash
    for (const [x, y] of [[-0.1, 0.3], [0.12, 0.18]]) box(torso, x, y * th / 0.44, front + 0.004, 0.05, 0.05, 0.01, GOLD, { glow: 0.8 });
  }
  if (S.top === 'overalls') {
    box(torso, 0, 0.06, 0, tw + 0.012, 0.12, td + 0.012, C.bottom);                         // waist
    box(torso, 0, th * 0.36, front, tw * 0.68, th * 0.5, 0.012, C.bottom);                   // bib
    for (const x of [-1, 1]) {
      box(torso, x * tw * 0.26, th * 0.78, front, 0.06, th * 0.42, 0.012, C.bottom);         // straps
      box(torso, x * tw * 0.26, th * 0.78, -front, 0.06, th * 0.42, 0.012, C.bottom);
      box(torso, x * tw * 0.26, th * 0.6, front + 0.006, 0.04, 0.04, 0.01, C.accent);        // buttons
    }
  } else if (S.top !== 'robe') {
    box(torso, 0, 0.03, 0, tw + 0.01, 0.05, td + 0.01, S.top === 'tunic' ? C.accent : C.shoes); // belt
  }
  if (S.top === 'jacket') {
    box(torso, 0, th * 0.52, front, tw * 0.22, th * 0.84, 0.012, C.accent);                  // shirt showing through
    box(torso, 0, th - 0.01, 0, tw * 0.74, 0.07, td + 0.03, shade(C.top, 0.8));              // collar
  } else if (S.top === 'hoodie') {
    box(torso, 0, th * 0.25, front, tw * 0.6, th * 0.24, 0.012, shade(C.top, 0.85));         // pocket
    box(torso, 0, th - 0.03, -td / 2 - 0.04, tw * 0.72, 0.13, 0.1, shade(C.top, 0.85));      // hood
    for (const x of [-1, 1]) box(torso, x * 0.06, th * 0.72, front + 0.004, 0.025, th * 0.3, 0.01, C.accent); // strings
  }

  // Back item -------------------------------------------------------------
  slot = 'back';
  const back = -td / 2;
  if (S.back === 'sword') {
    const blade = compose(torso, translation(0, th * 0.5, back - 0.05), rotationZ(0.65));
    box(blade, 0, 0.08, 0, 0.07, 0.56, 0.025, [0.86, 0.89, 0.94], { glow: 0.15 });                           // blade
    box(blade, 0, -0.22, 0, 0.22, 0.04, 0.05, GOLD);                                                        // guard
    box(blade, 0, -0.31, 0, 0.05, 0.15, 0.05, [0.35, 0.22, 0.12]);                                          // grip
    box(blade, 0, -0.4, 0, 0.07, 0.05, 0.07, GOLD);                                                         // pommel
  } else if (S.back === 'guitar') {
    const g = compose(torso, translation(0, th * 0.45, back - 0.06), rotationZ(-0.5));
    box(g, 0, -0.08, 0, 0.27, 0.26, 0.07, C.accent);                                                        // body
    box(g, 0, -0.02, -0.038, 0.08, 0.08, 0.01, DARK);                                                       // sound hole
    box(g, 0, 0.24, 0, 0.05, 0.4, 0.035, [0.3, 0.2, 0.12]);                                                 // neck
    box(g, 0, 0.47, 0, 0.08, 0.08, 0.04, DARK);                                                             // head
    box(torso, 0, th * 0.55, front, tw * 0.95, 0.035, 0.01, DARK);                                          // strap
  } else if (S.back === 'shield') {
    box(torso, 0, th * 0.5, back - 0.04, 0.44, 0.32, 0.04, C.accent);
    box(torso, 0, th * 0.5, back - 0.045, 0.32, 0.44, 0.035, C.accent);
    box(torso, 0, th * 0.5, back - 0.065, 0.1, 0.1, 0.03, GOLD);                                            // boss
    box(torso, 0, th * 0.5, back - 0.062, 0.44 * 0.7, 0.04, 0.02, shade(C.accent, 0.7));                   // stripe
  } else if (S.back === 'backpack') {
    box(torso, 0, 0.24 * th / 0.44, back - 0.06, tw * 0.72, 0.3, 0.12, C.accent);
    box(torso, 0, 0.33 * th / 0.44, back - 0.125, tw * 0.6, 0.06, 0.02, C.shoes);
  } else if (S.back === 'jetpack') {
    box(torso, 0, th * 0.6, back - 0.02, 0.3, 0.14, 0.04, DARK);
    for (const x of [-1, 1]) {
      box(torso, x * 0.09, th * 0.52, back - 0.075, 0.13, th * 0.72, 0.13, C.accent);
      box(torso, x * 0.09, th * 0.1, back - 0.075, 0.09, 0.06, 0.09, DARK);
      if (anim.flame > 0.02) {
        const len = 0.06 + 0.18 * anim.flame;
        box(torso, x * 0.09, th * 0.07 - len / 2, back - 0.075, 0.07, len, 0.07, FLAME, { glow: 1 });
      }
    }
  } else if (S.back === 'cape') {
    const cape = compose(torso, translation(0, th - 0.02, back - 0.015), rotationX(-anim.cape));
    const len = th + 0.36;
    box(cape, 0, -len / 2, -0.012, tw + 0.04, len, 0.025, C.accent);
    for (const x of [-1, 1]) box(torso, x * tw * 0.3, th - 0.03, front, 0.06, 0.06, 0.015, GOLD);  // clasps
  } else if (S.back === 'wings') {
    for (const x of [-1, 1]) {
      const wing = compose(torso, translation(x * 0.06, th * 0.72, back - 0.03), rotationY(x * (0.55 - anim.flap)), rotationZ(x * (0.25 + anim.flap * 0.6)));
      box(wing, x * 0.15, 0, 0, 0.3, 0.16, 0.025, C.accent, { glow: 0.2 });
      box(wing, x * 0.12, -0.11, 0, 0.22, 0.08, 0.02, shade(C.accent, 0.88), { glow: 0.15 });
    }
  } else if (S.back === 'rainbowcape') {
    const cape = compose(torso, translation(0, th - 0.02, back - 0.015), rotationX(-anim.cape));
    const len = th + 0.4, band = len / RAINBOW.length;
    RAINBOW.forEach((c, i) => box(cape, 0, -band * (i + 0.5), -0.012, tw + 0.06, band + 0.004, 0.025, c, { glow: 0.25 }));
    for (const x of [-1, 1]) box(torso, x * tw * 0.3, th - 0.03, front, 0.06, 0.06, 0.015, GOLD, { glow: 0.5 });
  } else if (S.back === 'butterfly') {
    // two big, candy-bright wing panels a side, with spots, fluttering (decorative: wider than the body)
    const upperC = [1, 0.52, 0.12], lowerC = [1, 0.32, 0.62], spot = [1, 0.95, 0.5], spot2 = [0.4, 0.9, 1];
    for (const x of [-1, 1]) {
      const root = compose(torso, translation(x * 0.05, th * 0.62, back - 0.03), rotationY(x * (0.4 - anim.flap * 1.6)));
      const upper = compose(root, rotationZ(x * 0.35));
      box(upper, x * 0.25, 0.08, 0, 0.5, 0.38, 0.02, upperC, { glow: 0.45, flair: true });
      for (const [dx, dy] of [[0.3, 0.14], [0.18, 0.0]]) box(upper, x * dx, dy, -0.012, 0.1, 0.1, 0.012, spot, { glow: 0.9, flair: true });
      box(upper, x * 0.5, 0.06, 0, 0.04, 0.38, 0.024, DARK, { flair: true });
      box(upper, x * 0.25, 0.27, 0, 0.5, 0.035, 0.024, DARK, { flair: true });
      const lower = compose(root, rotationZ(x * -0.45));
      box(lower, x * 0.18, -0.13, 0, 0.36, 0.28, 0.02, lowerC, { glow: 0.4, flair: true });
      box(lower, x * 0.22, -0.16, -0.012, 0.09, 0.09, 0.012, spot2, { glow: 0.9, flair: true });
    }
  } else if (S.back === 'fairywings') {
    // pale, glittering, see-through-looking wings: a frame of light with sparkles
    const pale = [0.5, 0.9, 1], pink = [1, 0.55, 0.9];
    for (const x of [-1, 1]) {
      const root = compose(torso, translation(x * 0.05, th * 0.66, back - 0.03), rotationY(x * (0.45 - anim.flap * 1.4)));
      for (const [rz, w, h, c] of [[0.55, 0.46, 0.2, pale], [-0.35, 0.34, 0.16, pink]]) {
        const wing = compose(root, rotationZ(x * rz));
        box(wing, x * w / 2, 0, 0, w, h, 0.01, c, { glow: 0.9, flair: true });
        box(wing, x * w / 2, 0, -0.006, w * 0.8, h * 0.55, 0.012, WHITE, { glow: 1, flair: true });
      }
      for (const [dx, dy] of [[0.22, 0.2], [0.33, 0.05], [0.15, -0.14]]) box(root, x * dx, dy, -0.01, 0.03, 0.03, 0.03, GOLD, { glow: 1, flair: true });
    }
  } else if (S.back === 'dragonwings') {
    // big leathery wings with bony fingers and claws
    const membrane = [0.25, 0.78, 0.45], bone = [0.1, 0.32, 0.18];
    for (const x of [-1, 1]) {
      const root = compose(torso, translation(x * 0.06, th * 0.78, back - 0.04), rotationY(x * (0.5 - anim.flap * 1.2)), rotationZ(x * (0.3 + anim.flap * 0.5)));
      box(root, x * 0.22, 0, 0, 0.46, 0.05, 0.05, bone, { flair: true });                                    // arm bone
      box(root, x * 0.47, 0.04, 0, 0.06, 0.1, 0.05, bone, { flair: true });                                   // claw
      for (const [dx, len] of [[0.14, 0.34], [0.28, 0.4], [0.42, 0.3]]) {
        box(root, x * dx, -len / 2, 0, 0.03, len, 0.03, bone, { flair: true });                              // fingers
        box(root, x * (dx - 0.07), -len * 0.42, -0.004, 0.13, len * 0.8, 0.012, membrane, { glow: 0.1, flair: true });
      }
    }
  }

  // Arms ------------------------------------------------------------------
  slot = 'top';
  const sleeves = S.top === 'jacket' || S.top === 'hoodie' || S.top === 'tunic' || S.top === 'robe';
  const aw = D.armWidth;
  for (const [side, swing, out, elbow] of [
    [1, pose.armSwingL, pose.armOutL, pose.elbowL],
    [-1, pose.armSwingR, pose.armOutR, pose.elbowR],
  ]) {
    const upper = compose(torso, translation(side * D.shoulderX, th - 0.04, 0), rotationZ(side * out), rotationX(-swing));
    box(upper, 0, -D.upperArm / 2 + 0.02, 0, aw, D.upperArm + 0.04, aw + 0.01, C.top);
    const fore = compose(upper, translation(0, -D.upperArm, 0), rotationX(-elbow));
    if (sleeves) {
      box(fore, 0, -D.forearm * 0.36 + 0.01, 0, aw - 0.01, D.forearm * 0.74, aw, C.top);
      box(fore, 0, -D.forearm * 0.86 + 0.01, 0, aw - 0.03, D.forearm * 0.3, aw - 0.02, C.skin);
    } else {
      box(fore, 0, -D.forearm / 2 + 0.01, 0, aw - 0.02, D.forearm, aw - 0.01, C.skin);
    }
  }

  // Head --------------------------------------------------------------------
  slot = 'body';
  const head = compose(torso, translation(0, th + D.neckGap, 0),
    rotationY(pose.headYaw - pose.twist * 0.8), rotationX(pose.headPitch));
  const [kw, kh, kd] = HEAD_SHAPES[S.head];
  const hw = D.head * kw, hh = D.head * kh, hd = D.head * kd;
  if (S.head === 'round') {
    box(head, 0, hh / 2, 0, hw, hh * 0.82, hd, C.skin);
    box(head, 0, hh / 2, 0, hw * 0.82, hh, hd * 0.82, C.skin);
  } else {
    box(head, 0, hh / 2, 0, hw, hh, hd, C.skin);
  }
  const face = hd / 2 + 0.006;
  // ears
  for (const side of [1, -1]) box(head, side * (hw / 2 + 0.02), hh * 0.45, -0.02, 0.05, 0.1, 0.08, C.skin);
  // eyes (blink by squashing vertically)
  const open = anim.blink > 0 ? 0.15 : 1;
  for (const side of [1, -1]) {
    const ex = side * hw * 0.225, ey = hh * 0.46;
    if (S.eyes === 'wide') {
      box(head, ex, ey, face, 0.1, 0.11 * open, 0.02, WHITE);
      box(head, ex - side * 0.012, ey - 0.005, face + 0.004, 0.05, 0.07 * open, 0.02, C.eyes);
    } else if (S.eyes === 'sleepy') {
      box(head, ex, ey - 0.01, face, 0.09, 0.035 * (anim.blink > 0 ? 0.4 : 1), 0.02, C.eyes);
      box(head, ex, ey + 0.025, face, 0.1, 0.03, 0.02, shade(C.skin, 0.85));                  // heavy lids
    } else {
      box(head, ex, ey, face, 0.07, 0.1 * open, 0.02, C.eyes);
    }
    if (S.eyes === 'glasses') {
      box(head, ex, ey, face - 0.002, 0.14, 0.13, 0.012, DARK);
      box(head, ex, ey, face + 0.001, 0.11, 0.1, 0.012, GLASS);
      box(head, ex, ey, face + 0.006, 0.06, 0.09 * open, 0.012, C.eyes);
      box(head, side * (hw / 2 + 0.005), ey, 0, 0.02, 0.025, hd * 0.9, DARK);                  // temples
    }
  }
  if (S.eyes === 'glasses') box(head, 0, hh * 0.5, face, 0.06, 0.025, 0.012, DARK);           // bridge
  // mouth
  const my = hh * 0.2;
  if (S.face === 'smile') {
    box(head, 0, my, face, 0.1, 0.025, 0.02, C.eyes);
    for (const side of [1, -1]) box(head, side * 0.06, my + 0.02, face, 0.03, 0.035, 0.02, C.eyes);
  } else if (S.face === 'open') {
    box(head, 0, my, face, 0.08, 0.065, 0.02, [0.42, 0.12, 0.14]);
  } else if (S.face === 'mustache') {
    box(head, 0, my - 0.015, face, 0.08, 0.02, 0.02, C.eyes);
    box(head, 0, my + 0.035, face + 0.004, 0.18, 0.045, 0.03, C.hair);
  } else {
    box(head, 0, my, face, 0.1, 0.025, 0.02, C.eyes);
  }

  // Face & neck extras ----------------------------------------------------------
  slot = 'extra';
  const eyeY = hh * 0.46, eyeX = hw * 0.225;
  if (S.extra === 'scarf') {
    box(torso, 0, th + 0.01, 0, tw * 0.66, 0.09, td + 0.07, C.accent);
    const tail = compose(torso, translation(0.07, th, back - 0.04), rotationX(-0.2 - anim.cape * 1.1));
    box(tail, 0, -0.16, 0, 0.1, 0.32, 0.03, C.accent);
    box(tail, 0, -0.3, 0, 0.1, 0.04, 0.035, shade(C.accent, 0.75));                                         // fringe
  } else if (S.extra === 'bowtie') {
    for (const x of [-1, 1]) {
      const wing = compose(torso, translation(x * 0.045, th - 0.03, front + 0.012), rotationZ(x * 0.35));
      box(wing, 0, 0, 0, 0.08, 0.065, 0.02, C.accent);
    }
    box(torso, 0, th - 0.03, front + 0.02, 0.03, 0.035, 0.02, shade(C.accent, 0.7));
  } else if (S.extra === 'monocle') {
    box(head, -eyeX, eyeY, face + 0.002, 0.13, 0.13, 0.008, GOLD);
    box(head, -eyeX, eyeY, face + 0.004, 0.1, 0.1, 0.01, GLASS);
    box(head, -eyeX, eyeY, face + 0.008, 0.06, 0.08, 0.01, C.eyes);
    box(head, -eyeX - 0.055, eyeY - 0.13, face + 0.002, 0.012, 0.2, 0.01, GOLD);                              // chain
  } else if (S.extra === 'starshades') {
    for (const side of [1, -1]) {
      for (const turn of [0, Math.PI / 4]) {
        const star = compose(head, translation(side * eyeX, eyeY, face + 0.004), rotationZ(turn));
        box(star, 0, 0, 0, 0.12, 0.12, 0.012, [1, 0.45, 0.75], { glow: 0.6 });
      }
      box(head, side * (hw / 2 + 0.005), eyeY, 0, 0.02, 0.025, hd * 0.9, DARK);
    }
    box(head, 0, eyeY + 0.01, face + 0.004, 0.07, 0.025, 0.012, DARK);
  } else if (S.extra === 'heromask') {
    box(head, 0, eyeY, 0, hw + 0.025, 0.11, hd + 0.025, C.accent);
    for (const side of [1, -1]) box(head, side * eyeX, eyeY, (hd + 0.025) / 2 + 0.004, 0.075, 0.05, 0.01, WHITE);
    for (const side of [1, -1]) {
      const end = compose(head, translation(side * 0.05, eyeY, -(hd + 0.025) / 2), rotationX(-0.5 - anim.tails), rotationZ(side * 0.25));
      box(end, 0, -0.08, 0, 0.04, 0.16, 0.02, C.accent);
    }
  }

  // Hair --------------------------------------------------------------------
  slot = 'hair';
  const covered = ['cap', 'beanie', 'helmet', 'tophat', 'wizard', 'viking', 'pirate'].includes(S.hat);   // (party hat, crowns and the horn sit on top of the hair)
  if (S.hair !== 'none' && S.hair !== 'mohawk') {
    if (covered) {
      // under a hat: hair stays inside it, with a fringe peeking out below the front edge
      box(head, 0, hh * 0.78, -0.03, hw + 0.02, hh * 0.42, hd - 0.03, C.hair);
      box(head, 0, hh * 0.6, hd / 2 - 0.012, hw * 0.86, hh * 0.1, 0.04, C.hair);
    } else {
      box(head, 0, hh * 0.8, -0.03, hw + 0.04, hh * 0.44, hd - 0.02, C.hair);                    // crown + back
      box(head, 0, hh * 0.9, hd / 2 - 0.015, hw + 0.02, hh * 0.16, 0.06, C.hair);                // fringe
    }
  }
  if (S.hair === 'spiky' && !covered) {
    [[-0.12, -0.35], [0, 0], [0.12, 0.35], [-0.06, -0.15], [0.06, 0.15]].forEach(([x, tilt], i) => {
      const spike = compose(head, translation(x * hw / 0.4, hh * 1.0, (i < 3 ? 0.04 : -0.1) * hd / 0.4), rotationZ(tilt), rotationX(i < 3 ? 0.25 : -0.3));
      box(spike, 0, 0.06, 0, 0.09, 0.14, 0.09, C.hair);
    });
  } else if (S.hair === 'long') {
    box(head, 0, hh * 0.38, -hd / 2 - 0.01, hw + 0.05, hh * 0.96, 0.07, C.hair);
    for (const side of [1, -1]) box(head, side * (hw / 2 + 0.025), hh * 0.5, -0.04, 0.05, hh * 0.66, hd * 0.66, C.hair);
  } else if (S.hair === 'bob') {
    box(head, 0, hh * 0.5, -hd / 2 - 0.01, hw + 0.05, hh * 0.72, 0.07, C.hair);
    for (const side of [1, -1]) box(head, side * (hw / 2 + 0.025), hh * 0.5, -0.01, 0.05, hh * 0.72, hd * 0.86, C.hair);
  } else if (S.hair === 'ponytail') {
    box(head, 0, hh * 0.72, -hd / 2 - 0.035, 0.1, 0.08, 0.06, C.accent);                       // hair tie
    const tail = compose(head, translation(0, hh * 0.72, -hd / 2 - 0.05), rotationX(-anim.pony));
    box(tail, 0, -0.15, -0.02, 0.1, 0.3, 0.08, C.hair);
  } else if (S.hair === 'mohawk' && !covered) {
    box(head, 0, hh + 0.045, -0.02, 0.07, 0.11, hd * 0.9, C.hair);
  }

  // Hat ----------------------------------------------------------------------
  slot = 'hat';
  if (S.hat === 'tophat') {
    box(head, 0, hh * 0.86, 0, hw + 0.16, 0.03, hd + 0.16, C.hat);                                          // brim
    box(head, 0, hh * 0.86 + 0.11, 0, hw * 0.8, 0.2, hd * 0.8, C.hat);                                      // crown
    box(head, 0, hh * 0.86 + 0.04, 0, hw * 0.82, 0.045, hd * 0.82, C.accent);                               // band
  } else if (S.hat === 'wizard') {
    box(head, 0, hh * 0.86, 0, hw + 0.2, 0.03, hd + 0.2, C.hat);
    box(head, 0, hh * 0.86 + 0.06, 0, hw * 0.82, 0.09, hd * 0.82, C.hat);
    box(head, 0, hh * 0.86 + 0.14, -0.02, hw * 0.56, 0.08, hd * 0.56, shade(C.hat, 0.92));
    const tip = compose(head, translation(0, hh * 0.86 + 0.18, -0.04), rotationX(-0.7));
    box(tip, 0, 0.05, 0, hw * 0.3, 0.1, hd * 0.3, shade(C.hat, 0.85));
    for (const [x, y, z] of [[0.1, 0.07, 1], [-0.07, 0.12, 1]]) box(head, x, hh * 0.86 + y, z * hd * 0.41 + 0.004, 0.04, 0.04, 0.01, GOLD, { glow: 0.8 });
  } else if (S.hat === 'viking') {
    box(head, 0, hh * 0.8, 0, hw + 0.06, hh * 0.45, hd + 0.06, C.hat);
    box(head, 0, hh * 0.62, 0, hw + 0.08, 0.06, hd + 0.08, GOLD);
    for (const side of [1, -1]) {
      const horn = compose(head, translation(side * (hw / 2 + 0.03), hh * 0.85, 0), rotationZ(side * -0.5));
      box(horn, side * 0.05, 0, 0, 0.12, 0.06, 0.06, [0.96, 0.93, 0.84]);
      box(horn, side * 0.1, 0.06, 0, 0.05, 0.1, 0.05, [0.96, 0.93, 0.84]);
    }
  } else if (S.hat === 'halo') {
    const y = hh + 0.1;
    for (const z of [1, -1]) box(head, 0, y, z * hd * 0.3, hw * 0.72, 0.03, 0.045, GOLD, { glow: 0.9 });
    for (const x of [1, -1]) box(head, x * hw * 0.34, y, 0, 0.045, 0.03, hd * 0.64, GOLD, { glow: 0.9 });
  } else if (S.hat === 'flowers') {
    box(head, 0, hh * 0.82, 0, hw + 0.03, 0.04, hd + 0.03, [0.3, 0.62, 0.28]);
    const petals = [[1, 0.5, 0.72], [1, 0.86, 0.3], [0.98, 0.98, 0.96], C.hat];
    const spots = [[0, 1], [0.6, 1], [-0.6, 1], [1, 0.4], [-1, 0.4], [1, -0.5], [-1, -0.5], [0, -1]];
    spots.forEach(([x, z], i) => box(head, x * (hw / 2 + 0.01), hh * 0.84, z * (hd / 2 + 0.01), 0.075, 0.075, 0.075, petals[i % petals.length]));
  } else if (S.hat === 'partyhat') {
    // a striped cone with a pompom
    for (let i = 0; i < 5; i++) {
      const w = hw * (0.62 - i * 0.11);
      box(head, 0, hh * 0.92 + i * 0.06, 0, w, 0.065, w, i % 2 ? C.accent : C.hat);
    }
    box(head, 0, hh * 0.92 + 0.32, 0, 0.09, 0.09, 0.09, WHITE, { glow: 0.3 });
    box(head, 0, hh * 0.4, hd / 2 + 0.01, 0.015, hh * 0.5, 0.01, DARK);                                      // elastic
  } else if (S.hat === 'gemcrown') {
    box(head, 0, hh + 0.02, 0, hw * 0.8, 0.07, hd * 0.8, GOLD, { glow: 0.25 });
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) box(head, x * hw * 0.34, hh + 0.09, z * hd * 0.34, 0.06, 0.1, 0.06, GOLD, { glow: 0.25 });
    const gems = [RAINBOW[0], RAINBOW[4], RAINBOW[3], RAINBOW[5]];
    [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(([x, z], i) => box(head, x * (hw * 0.4 + 0.005), hh + 0.02, z * (hd * 0.4 + 0.005), 0.07, 0.05, 0.07, gems[i], { glow: 0.9 }));
  } else if (S.hat === 'unicorn') {
    // a golden spiral horn and a rainbow mane down the back of the head
    const horn = compose(head, translation(0, hh * 0.92, hd * 0.3), rotationX(0.35));
    for (let i = 0; i < 5; i++) {
      const seg = compose(horn, translation(0, 0.03 + i * 0.045, 0), rotationY(i * 0.6));
      box(seg, 0, 0, 0, 0.085 - i * 0.014, 0.05, 0.085 - i * 0.014, i % 2 ? [1, 0.95, 0.7] : GOLD, { glow: 0.5 });
    }
    RAINBOW.forEach((c, i) => box(head, 0, hh * (0.98 - i * 0.11), -hd / 2 - 0.035, 0.09, hh * 0.13, 0.06, c, { glow: 0.3 }));
  } else if (S.hat === 'pirate') {
    box(head, 0, hh * 0.88, 0, hw + 0.1, hh * 0.3, hd + 0.06, C.hat);
    box(head, 0, hh * 0.98, hd / 2 + 0.05, hw + 0.22, 0.12, 0.05, C.hat);
    for (const side of [1, -1]) box(head, side * (hw / 2 + 0.08), hh * 0.98, -0.02, 0.05, 0.12, hd + 0.1, C.hat);
    box(head, 0, hh * 0.99, hd / 2 + 0.08, 0.08, 0.07, 0.01, WHITE);                                        // skull badge
    box(head, 0, hh * 0.88, 0, hw + 0.12, 0.03, hd + 0.08, GOLD);                                           // trim
  }
  if (S.hat === 'cap') {
    box(head, 0, hh * 0.82, -0.005, hw + 0.03, hh * 0.38, hd + 0.03, C.hat);
    box(head, 0, hh * 0.68, hd / 2 + 0.08, hw * 0.9, 0.04, 0.18, C.hat);                       // brim (shows facing)
  } else if (S.hat === 'beanie') {
    box(head, 0, hh * 0.87, 0, hw + 0.05, hh * 0.34, hd + 0.05, C.hat);
    box(head, 0, hh * 0.7, 0, hw + 0.07, hh * 0.1, hd + 0.07, shade(C.hat, 0.8));
    box(head, 0, hh * 1.06 + 0.02, 0, 0.1, 0.08, 0.1, WHITE);                                   // pom
  } else if (S.hat === 'headband') {
    box(head, 0, hh * 0.78, 0, hw + 0.045, 0.07, hd + 0.045, C.hat);
    for (const side of [1, -1]) {
      const tie = compose(head, translation(side * 0.04, hh * 0.78, -hd / 2 - 0.02), rotationX(-0.4 - anim.tails), rotationZ(side * 0.3));
      box(tie, 0, -0.09, 0, 0.05, 0.18, 0.02, C.hat);
    }
  } else if (S.hat === 'crown') {
    box(head, 0, hh + 0.02, 0, hw * 0.74, 0.05, hd * 0.74, C.hat);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1]]) {
      box(head, x * hw * 0.31, hh + 0.08, z * hd * 0.31, 0.06, 0.08, 0.06, C.hat);
    }
    box(head, 0, hh + 0.02, hd * 0.37 + 0.006, 0.05, 0.04, 0.012, C.accent, { glow: 0.5 });      // jewel
  } else if (S.hat === 'helmet') {
    box(head, 0, hh * 0.78, -0.01, hw + 0.07, hh * 0.5, hd + 0.07, C.hat);
    box(head, 0, hh * 1.03 + 0.02, -0.02, 0.05, 0.05, hd * 0.8, shade(C.hat, 0.8));            // crest
    for (const side of [1, -1]) box(head, side * (hw / 2 + 0.035), hh * 0.42, 0.02, 0.04, hh * 0.36, hd * 0.5, C.hat);
  }
  return parts;
}

/**
 * The parts of one clothing slot ('hat', 'extra', 'back', 'shoes', 'top', …) of a design,
 * at rest, in figure space (feet at the origin) — e.g. to show a won item on a pedestal.
 */
export function itemParts(design, slot) {
  if (slot === 'trail') return trailPreviewParts(design.trail, (x, y, z, size, color) => ({ matrix: compose(translation(x, y, z), scaling(size, size, size)), color, glow: 1, slot: 'trail' }));
  const look = lookFor(design);
  return buildFigure(look, makePose(), REST_ANIM, identity()).filter(p => p.slot === slot);
}

/** Uniform scale that keeps a look inside the physics box (measured at rest). */
function measureFit(look) {
  const parts = buildFigure(look, makePose(), REST_ANIM, identity());
  let top = 0, side = 0;
  for (const { matrix, flair } of parts) {
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      const p = transformPoint(matrix, [x, y, z]);
      top = Math.max(top, p[1]);
      if (!flair) side = Math.max(side, Math.abs(p[0]));     // big decorative wings may spread wider than the body
    }
  }
  return Math.min(1, FIT_HEIGHT / top, FIT_HALF_WIDTH / side);
}

// ---------------------------------------------------------------------------
// Shadow helper
// ---------------------------------------------------------------------------
/**
 * Blob shadow projected straight down onto the highest surface under the
 * player. Returns an array of rectangles (possibly empty), each clipped to a
 * platform's top face — a shadow straddling several tiles at the same height
 * is split across them.
 */
export function computeShadow(level, player, baseSize = 0.5) {
  const EPS = 0.001;
  const below = level.platforms
    .map(p => ({ p, top: p.y + p.height / 2 }))
    .filter(({ top }) => top <= player.y + 0.01);
  const overlaps = ({ p }, margin) =>
    Math.abs(player.x - p.x) <= p.width / 2 + margin && Math.abs(player.z - p.z) <= p.depth / 2 + margin;
  // Prefer the surface directly under the centre; otherwise anything the blob touches.
  const pick = list => list.reduce((best, c) => (!best || c.top > best.top ? c : best), null);
  const hit = pick(below.filter(c => overlaps(c, 0))) || pick(below.filter(c => overlaps(c, baseSize)));
  if (!hit) return [];
  const height = player.y - hit.top;
  if (height > 14) return [];
  const r = baseSize * clamp(1 - height / 9, 0.35, 1);
  const alpha = 0.38 * clamp(1 - height / 12, 0.25, 1);
  const pieces = [];
  // two stacked layers (full blob + smaller core) give a soft falloff
  for (const [radius, layerAlpha, lift] of [[r, alpha * 0.62, 0.004], [r * 0.62, alpha * 0.6, 0.006]]) {
    for (const { p, top } of below) {
      if (Math.abs(top - hit.top) > EPS) continue;
      const x0 = Math.max(player.x - radius, p.x - p.width / 2), x1 = Math.min(player.x + radius, p.x + p.width / 2);
      const z0 = Math.max(player.z - radius, p.z - p.depth / 2), z1 = Math.min(player.z + radius, p.z + p.depth / 2);
      if (x1 - x0 <= EPS || z1 - z0 <= EPS) continue;
      pieces.push({ x: (x0 + x1) / 2, y: top, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0, alpha: layerAlpha, lift });
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export function createAvatar({ palette = 'classic', character = null, random = Math.random } = {}) {
  const initialPalette = typeof palette === 'string' ? AVATAR_PALETTES[palette] : palette;
  const avatar = {
    palette: initialPalette,
    /** Resolved look (dimensions, colours, styles) — from a palette or a character design. */
    look: character ? lookFor(character) : paletteLook(initialPalette),
    /** 'live' follows the player; 'idle' | 'run' | 'jump' | 'fall' force a preview. */
    preview: 'live',

    // public, read-only animation state (handy for HUDs / debugging)
    state: 'idle',
    yaw: 0,
    speed: 0,
    phase: 0,
    runBlend: 0,
    airBlend: 0,
    squash: 0,
    dashBlend: 0,
    poundBlend: 0,

    // internals
    _time: 0,
    _prev: null,
    _prevGrounded: true,
    _airVy: 0,
    _yawVel: 0,
    _bank: 0,
    _squashVel: 0,
    _spawnT: 1,
    _blinkTimer: 2,
    _blink: 0,
    _idleTime: 0,
    _lookAround: 0,
    _mirrorAir: false,
    _cape: 0.05,
    _capeVel: 0,
    _pony: 0.15,
    _tails: 0,
    _flame: 0,
    vy: 0,
    grounded: true,

    setPalette(p) {
      this.palette = typeof p === 'string' ? AVATAR_PALETTES[p] : p;
      this.look = paletteLook(this.palette);
    },

    /** Dress the avatar as a character design (see character.js). */
    setCharacter(design) {
      this.look = lookFor(design);
      this.design = design;
    },

    /** Snap to the player (no interpolation) and play the spawn pop-in. */
    reset(player, { pop = true } = {}) {
      this._prev = player ? { x: player.x, y: player.y, z: player.z } : null;
      this._prevGrounded = player ? player.grounded : true;
      this.yaw = 0;
      this._yawVel = 0;
      this._bank = 0;
      this.speed = 0;
      this.runBlend = 0;
      this.airBlend = 0;
      this.squash = 0;
      this._squashVel = 0;
      this._spawnT = pop ? 0 : 1;
      this._idleTime = 0;
      this._lookAround = 0;
      this.state = 'idle';
    },

    /** Advance animation by one (fixed) step. Returns a list of visual events. */
    update(player, dt) {
      const events = [];
      this._time += dt;
      if (!this._prev) this.reset(player, { pop: false });

      // --- Measure motion ---------------------------------------------------
      let dx = player.x - this._prev.x;
      let dz = player.z - this._prev.z;
      const dy = player.y - this._prev.y;
      if (Math.hypot(dx, dy, dz) > 2) { // teleport (respawn / level change)
        this.reset(player);
        dx = dz = 0;
      }
      this._prev = { x: player.x, y: player.y, z: player.z };
      let speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      let vy = player.vy;
      let grounded = player.grounded;

      // --- Preview overrides (for the playground) ----------------------------
      if (this.preview === 'run') { speed = PLAYER.speed; grounded = true; vy = 0; }
      else if (this.preview === 'idle') { speed = 0; grounded = true; vy = 0; }
      else if (this.preview === 'jump') { speed = 0; grounded = false; vy = 4; }
      else if (this.preview === 'fall') { speed = 0; grounded = false; vy = -8; }
      this.speed = speed;
      this.vy = vy;
      this.grounded = grounded;

      // --- Facing -----------------------------------------------------------
      this.dashBlend = approach(this.dashBlend, player.dash > 0 ? 1 : 0, 30, dt);
      this.poundBlend = approach(this.poundBlend, player.pound ? 1 : 0, 25, dt);
      if (this.preview === 'live' && speed > 0.5 && !(player.push > 0)) {
        const target = Math.atan2(dx, dz);
        const before = this.yaw;
        this.yaw = wrapAngle(this.yaw + wrapAngle(target - this.yaw) * (1 - Math.exp(-16 * dt)));
        this._yawVel = dt > 0 ? wrapAngle(this.yaw - before) / dt : 0;
      } else {
        this._yawVel = approach(this._yawVel, 0, 10, dt);
      }

      // --- Locomotion blend weights ---------------------------------------
      this.runBlend = approach(this.runBlend, clamp(speed / PLAYER.speed, 0, 1), 12, dt);
      this.airBlend = approach(this.airBlend, grounded ? 0 : 1, grounded ? 22 : 14, dt);
      const previousPhase = this.phase;
      this.phase += (speed * dt / STRIDE_LENGTH) * Math.PI * 2;
      if (grounded && this.runBlend > 0.5 &&
          Math.floor(previousPhase / Math.PI) !== Math.floor(this.phase / Math.PI)) {
        const side = Math.floor(this.phase / Math.PI) % 2 === 0 ? 1 : -1;
        const ox = Math.cos(this.yaw) * D.hipSpacing * side;
        const oz = -Math.sin(this.yaw) * D.hipSpacing * side;
        events.push({ type: 'step', x: player.x + ox, y: player.y, z: player.z + oz });
      }
      this._bank = approach(this._bank, clamp(-this._yawVel * 0.03, -0.22, 0.22) * this.runBlend, 10, dt);

      // --- Jump / land detection ----------------------------------------
      if (this.preview === 'live') {
        if (this._prevGrounded && !grounded && vy > 0.5) {
          this._squashVel += 2.4; // stretch
          this._mirrorAir = Math.sin(this.phase) < 0;
          events.push({ type: 'jump', x: player.x, y: player.y, z: player.z });
        }
        if (!grounded) this._airVy = vy;
        if (!this._prevGrounded && grounded) {
          const impact = Math.max(0, -this._airVy);
          if (impact > 1.5) {
            this._squashVel -= Math.min(impact, 16) * 0.6;
            events.push({ type: 'land', x: player.x, y: player.y, z: player.z, impact });
          }
        }
      }
      this._prevGrounded = grounded;

      // --- Squash & stretch spring ---------------------------------------
      const k = 320, c = 16;
      this._squashVel += (-k * this.squash - c * this._squashVel) * dt;
      this.squash = clamp(this.squash + this._squashVel * dt, -0.32, 0.3);

      // --- Secondary: spawn pop, blinking, idle look-around -----------------
      this._spawnT = Math.min(1, this._spawnT + dt / 0.4);
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0) {
        this._blink = 0.14;
        this._blinkTimer = 1.8 + random() * 3.5;
      }
      this._blink = Math.max(0, this._blink - dt);
      const idle = this.runBlend < 0.1 && this.airBlend < 0.1;
      this._idleTime = idle ? this._idleTime + dt : 0;
      this._lookAround = approach(this._lookAround, this._idleTime > 2 ? 1 : 0, 2, dt);

      // --- Accessories: capes and ponytails trail behind, jet flames in the air ---
      const drag = clamp(speed / PLAYER.speed, 0, 1.6) * 0.55 + clamp(-vy / 10, 0, 1) * 0.7 + this.dashBlend * 0.9 - clamp(vy / 12, 0, 0.5);
      const capeTarget = clamp(0.05 + drag + 0.04 * Math.sin(this._time * 3.1), 0, 1.35);
      this._capeVel += (90 * (capeTarget - this._cape) - 11 * this._capeVel) * dt;   // a little springy
      this._cape = clamp(this._cape + this._capeVel * dt, -0.1, 1.45);
      this._pony = approach(this._pony, 0.15 + drag * 0.9 + 0.06 * Math.sin(this._time * 2.3), 10, dt);
      this._tails = approach(this._tails, drag * 0.8, 8, dt);
      this._flame = approach(this._flame, grounded ? 0 : Math.max(0.45, this.dashBlend), grounded ? 14 : 20, dt);

      // --- Descriptive state --------------------------------------------
      if (!grounded) this.state = vy > 0 ? 'jump' : 'fall';
      else if (this.squash < -0.06) this.state = 'land';
      else if (speed > 0.5) this.state = 'run';
      else this.state = 'idle';

      return events;
    },

    /** Optional { yaw, pitch } added to the head's pose (e.g. admiring something; pitch < 0 looks up). */
    gaze: null,

    /** Current blended pose (joint angles). */
    getPose() {
      const t = this._time;
      let pose = blendPose(idlePose(t, this.gaze ? 0 : this._lookAround), runPose(this.phase), this.runBlend);
      if (this.gaze) pose = { ...pose, headYaw: pose.headYaw + this.gaze.yaw, headPitch: pose.headPitch + this.gaze.pitch };
      if (this.airBlend > 0.001) {
        let air = blendPose(fallPose(t), risePose(), clamp(this.vy / 5 + 0.5, 0, 1));
        if (this._mirrorAir) air = mirrorPose(air);
        pose = blendPose(pose, air, this.airBlend);
      }
      if (this.dashBlend > 0.01) pose = blendPose(pose, dashPose(), this.dashBlend);
      if (this.poundBlend > 0.01) pose = blendPose(pose, poundPose(), this.poundBlend);
      // Landing crouch: while squashed, bend the knees (feet stay planted so
      // the hips sink), lean in and let the arms swing out for balance.
      const crouch = Math.max(0, -this.squash) * (1 - this.airBlend);
      if (crouch > 0) {
        pose = { ...pose };
        pose.legSwingL += crouch * 2; pose.legSwingR += crouch * 2;
        pose.kneeL += crouch * 4.5; pose.kneeR += crouch * 4.5;
        pose.lean += crouch * 1.8;
        pose.armOutL += crouch * 2.5; pose.armOutR += crouch * 2.5;
        pose.headPitch -= crouch;
      }
      return pose;
    },

    /**
     * Build world-space box parts for the renderer.
     * Each part: { matrix: Float32Array(16) (unit cube -> world), color: [r,g,b], glow?, tag? }
     */
    getParts(player) {
      const look = this.look;
      const pop = easeOutBack(this._spawnT) * look.fit;
      const sy = (1 + this.squash * 0.7) * pop;
      const sxz = (1 - this.squash * 0.45) * pop;
      const root = compose(
        translation(player.x, player.y, player.z),
        rotationY(this.yaw),
        scaling(sxz, sy, sxz),
      );
      const t = this._time;
      const airborne = this.airBlend;
      return buildFigure(look, this.getPose(), {
        bank: this._bank,
        blink: this._blink,
        groundWeight: 1 - this.airBlend,
        cape: this._cape,
        pony: this._pony,
        tails: this._tails,
        flap: airborne > 0.3 ? 0.45 * Math.sin(t * 17) * airborne : 0.07 * Math.sin(t * 2.2),
        flame: this._flame * (0.8 + 0.2 * Math.sin(t * 47) * Math.sin(t * 31)),
      }, root);
    },

    /** World position of a named anchor (used for effects / tests). */
    getFootPositions(player) {
      const parts = this.getParts(player).filter(part => part.tag === 'shoeL' || part.tag === 'shoeR');
      return parts.map(part => transformPoint(part.matrix, [0, -0.5, 0]));
    },
  };
  return avatar;
}

/**
 * Turn avatar events into particle effects (dust puffs).
 * Accepts the particle system as a parameter to keep this module dependency-free.
 */
export function emitAvatarEffects(events, particles) {
  for (const e of events) {
    if (e.type === 'land') {
      const strength = clamp(e.impact / 10, 0.4, 1.6);
      particles.emit(e.x, e.y + 0.05, e.z, { count: Math.round(8 * strength), speed: 1.6 * strength, color: [0.93, 0.9, 0.82], lifetime: 0.45 });
    } else if (e.type === 'jump') {
      particles.emit(e.x, e.y + 0.05, e.z, { count: 6, speed: 1.2, color: [0.93, 0.9, 0.82], lifetime: 0.35 });
    } else if (e.type === 'step') {
      particles.emit(e.x, e.y + 0.04, e.z, { count: 2, speed: 0.8, color: [0.9, 0.87, 0.78], lifetime: 0.3 });
    }
  }
}
