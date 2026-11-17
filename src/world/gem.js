/**
 * The goal: a floating, spinning gem above the goal spot. Collecting it (standing on
 * the spot, as before) starts the level's boss battle (see games/screen.js).
 *
 *   gemParts(goal, time) → [{ matrix, color, glow }] unit-cube parts for the renderer
 *
 * A cut gem from boxes turned 45°: a bright table, crown, girdle and a pavilion
 * tapering to a point. Its colour slowly cycles through the rainbow; sparkles
 * orbit it and a glowing ring marks the spot to stand on.
 */
import { compose, translation, scaling, rotationY, rotationX } from '../engine/mat4.js';

export const GEM_HEIGHT = 1.3;            // centre of the gem above the goal spot
export const GEM_COLOR = [1, 0.32, 0.82];  // representative colour (for the visual checks)

/** HSV (0..1) → RGB. */
export function hsv(h, s, v) {
  const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

const SIZE = 1.7;
const CUT = [  // [y, width, height, brightness] (× SIZE)
  [0.2, 0.26, 0.03, 1.25],   // table
  [0.13, 0.42, 0.12, 1.05],  // crown
  [0.04, 0.52, 0.06, 0.95],  // girdle
  [-0.05, 0.4, 0.12, 0.85],  // pavilion
  [-0.15, 0.25, 0.1, 0.75],
  [-0.24, 0.1, 0.09, 0.65],  // culet
].map(([y, w, h, k]) => [y * SIZE, w * SIZE, h * SIZE, k]);

/** The gem's colour at a time: cycles cyan → violet → magenta → red → gold and back (never green, which would hide on grass). */
export function gemColor(time) {
  const t = (Math.sin(time * 0.5) + 1) / 2;
  return hsv((0.5 + 0.62 * t) % 1, 0.65, 1);
}

export function gemParts(goal, time) {
  const { x, y, z } = goal;
  const parts = [];
  const base = gemColor(time);
  const cy = y + GEM_HEIGHT + Math.sin(time * 2.1) * 0.08;
  const spin = compose(translation(x, cy, z), rotationY(time * 1.3), rotationX(Math.sin(time * 0.9) * 0.12), rotationY(Math.PI / 4));
  for (const [dy, w, h, k] of CUT) {
    parts.push({ matrix: compose(spin, translation(0, dy, 0), scaling(w, h, w)), color: base.map(c => Math.min(1, c * k)), glow: 0.55 });
  }
  // sparkles orbiting the gem
  for (let i = 0; i < 3; i++) {
    const a = time * 2.4 + (i * Math.PI * 2) / 3;
    const s = 0.05 + 0.03 * Math.sin(time * 7 + i * 2);
    parts.push({ matrix: compose(translation(x + Math.cos(a) * 0.7, cy + Math.sin(a * 1.3) * 0.3, z + Math.sin(a) * 0.7), rotationY(a), scaling(s, s, s)), color: [1, 1, 1], glow: 1 });
  }
  // a glowing ring on the spot to stand on
  const ring = compose(translation(x, y + 0.015, z), rotationY(time * 0.4));
  for (const [ox, oz, w, d] of [[0, 0.6, 1.1, 0.06], [0, -0.6, 1.1, 0.06], [0.6, 0, 0.06, 1.1], [-0.6, 0, 0.06, 1.1]]) {
    parts.push({ matrix: compose(ring, translation(ox, 0, oz), scaling(w, 0.02, d)), color: base, glow: 0.8 });
  }
  return parts;
}
