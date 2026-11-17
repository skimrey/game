/**
 * Building blocks for the journeys' 3D scenes (each game's scene3d.js): boxes, colours, zone
 * props (trees, cacti, crystals …), rings of boxes, and avatar-style parts in a moving frame.
 */
import { compose, translation, scaling } from '../../engine/mat4.js';

export const shade = (c, k) => c.map(v => Math.min(1, v * k));
export const B = (center, size, color, extra = {}) => ({ center, size, color, ...extra });
export const lerp = (a, b, t) => a + (b - a) * t;

/** Props for the scenery, in the zone's colours. */
export function prop(r, x, y, z, zone, s = 1) {
  const out = [];
  if (zone === 'alpine') {
    out.push(B([x, y + 0.5 * s, z], [0.3 * s, s, 0.3 * s], [0.4, 0.27, 0.18]));
    [[1.6, 0.8], [1.2, 0.7], [0.8, 0.6]].forEach(([w, h], i) => out.push(B([x, y + s * (1 + i * 0.65 + h / 2), z], [w * s, h * s, w * s], shade([0.16, 0.36, 0.28], 1 + i * 0.06), { rotY: i * 0.4 })));
    out.push(B([x, y + s * 2.9, z], [0.6 * s, 0.1, 0.6 * s], [0.94, 0.95, 1]));
  } else if (zone === 'volcano') {
    out.push(B([x, y + 0.9 * s, z], [0.7 * s, 1.8 * s, 0.5 * s], [0.12, 0.1, 0.15], { rotY: r() * 3 }));
    if (r() < 0.3) out.push(B([x + 0.5, y + 0.1, z], [0.6, 0.12, 0.6], [1, 0.45, 0.12], { glow: 1 }));
  } else if (zone === 'crystal' || zone === 'starlit') {
    const c = r() < 0.5 ? [0.55, 0.85, 1] : [0.85, 0.6, 1];
    for (let k = 0; k < 3; k++) { const h = (0.7 + r() * 1.4) * s; out.push(B([x + (r() - 0.5) * s, y + h / 2, z + (r() - 0.5) * s], [0.3 * s, h, 0.3 * s], c, { glow: 0.8, rotY: r() * 3 })); }
  } else if (zone === 'grove') {
    const h = (1 + r()) * s, cap = [[0.85, 0.22, 0.28], [0.62, 0.35, 0.85], [0.95, 0.6, 0.2]][Math.floor(r() * 3)];
    out.push(B([x, y + h / 2, z], [0.3 * s, h, 0.3 * s], [0.92, 0.88, 0.78]), B([x, y + h + 0.15, z], [1.4 * s, 0.35 * s, 1.4 * s], cap), B([x, y + h - 0.02, z], [1.1 * s, 0.05, 1.1 * s], [0.7, 1, 0.85], { glow: 0.6 }));
  } else if (zone === 'canyon') {
    out.push(B([x, y + 0.9 * s, z], [0.4 * s, 1.8 * s, 0.4 * s], [0.33, 0.55, 0.3]), B([x + 0.35 * s, y + 1.1 * s, z], [0.5 * s, 0.25 * s, 0.25 * s], [0.33, 0.55, 0.3]));
  } else if (zone === 'lagoon') {
    for (let k = 0; k < 4; k++) out.push(B([x + k * 0.08 * s, y + (k + 0.5) * 0.6 * s, z], [0.26 * s, 0.62 * s, 0.26 * s], [0.62, 0.46, 0.3]));
    for (let k = 0; k < 5; k++) { const a = k * 1.26; out.push(B([x + 0.3 * s + Math.cos(a) * 0.7 * s, y + 2.5 * s, z + Math.sin(a) * 0.7 * s], [1.5 * s, 0.1, 0.35 * s], [0.26, 0.62, 0.3], { rotY: -a })); }
  } else {
    out.push(B([x, y + 0.8 * s, z], [0.35 * s, 1.6 * s, 0.35 * s], [0.45, 0.3, 0.18]), B([x, y + 1.9 * s, z], [1.5 * s, 1.2 * s, 1.5 * s], [0.3, 0.6, 0.26], { rotY: r() }), B([x, y + 2.7 * s, z], [1 * s, 0.8 * s, 1 * s], [0.36, 0.66, 0.32], { rotY: r() }));
  }
  return out;
}

/** Boxes in a ring (the plane's rings, whirlpools): n boxes around (x, y, z) in the given plane. */
export function ringBoxes(x, y, z, r, n, color, { flat = false, spin = 0, size = 0.22, glow = 0.5 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + spin;
    out.push(flat ? B([x + Math.cos(a) * r, y, z + Math.sin(a) * r], [size, size * 0.4, size], color, { glow, rotY: -a })
      : B([x + Math.cos(a) * r, y + Math.sin(a) * r, z], [size, size, size * 0.6], color, { glow }));
  }
  return out;
}

/** Transform avatar-style parts by a matrix (tilting the hero with the vehicle). */
export const moveParts = (parts, m) => parts.map(p => ({ ...p, matrix: compose(m, p.matrix) }));
/** A box as an avatar-style part, in a frame. */
export const part = (frame, cx, cy, cz, sx, sy, sz, color, glow = 0) => ({ matrix: compose(frame, translation(cx, cy, cz), scaling(sx, sy, sz)), color, glow });
