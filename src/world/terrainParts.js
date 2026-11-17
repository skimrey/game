/**
 * Extra looks for movement techniques (boxes for the renderer):
 *   bounce pads  a bright mushroom-cap pad with stripes on every spring platform; it
 *                squashes when you bounce off it
 *   glider       a little paraglider canopy over the hero while gliding
 */
import { topOf } from '../levels/audit.js';

const PAD = [1, 0.42, 0.72], STRIPE = [1, 0.9, 0.35];

/** bounces: Map(platform → time of the last bounce) */
export function springBoxes(level, time, bounces = new Map()) {
  const out = [];
  for (const p of level.platforms) {
    if (!p.spring) continue;
    const since = time - (bounces.get(p) ?? -10);
    const squash = since < 0.25 ? 1 - 0.5 * Math.sin((since / 0.25) * Math.PI) : 1;
    const top = topOf(p);
    const h = 0.22 * squash;
    out.push({ center: [p.x, top + h / 2, p.z], size: [p.width * 0.92, h, p.depth * 0.92], color: PAD, glow: 0.45 });
    out.push({ center: [p.x, top + h + 0.03, p.z], size: [p.width * 0.5, 0.06, p.depth * 0.5], color: STRIPE, glow: 0.7 });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      out.push({ center: [p.x + dx * p.width * 0.34, top + h + 0.02, p.z + dz * p.depth * 0.34], size: [0.14, 0.05, 0.14], color: STRIPE, glow: 0.7 });
    }
    // a gentle arrow-ish glow above the pad, bobbing, so it reads as "up!"
    const bob = Math.sin(time * 3) * 0.08;
    out.push({ center: [p.x, top + 0.7 + bob, p.z], size: [0.16, 0.16, 0.16], color: STRIPE, glow: 1, rotY: time, alpha: 0.8 });
    out.push({ center: [p.x, top + 1.0 + bob, p.z], size: [0.1, 0.1, 0.1], color: STRIPE, glow: 1, rotY: time, alpha: 0.6 });
  }
  return out;
}

/** A paraglider canopy above a gliding player (colour: the hero's accent / hat colour). */
export function gliderBoxes(player, color = [0.35, 0.85, 0.6]) {
  const { x, y, z } = player;
  const top = y + 2.05;
  const dark = color.map(c => c * 0.7);
  return [
    { center: [x, top, z], size: [1.5, 0.08, 0.55], color, glow: 0.25 },
    { center: [x - 0.85, top - 0.08, z], size: [0.3, 0.08, 0.5], color: dark, glow: 0.2 },
    { center: [x + 0.85, top - 0.08, z], size: [0.3, 0.08, 0.5], color: dark, glow: 0.2 },
    { center: [x - 0.45, top - 0.32, z], size: [0.03, 0.55, 0.03], color: [0.9, 0.9, 0.9] },
    { center: [x + 0.45, top - 0.32, z], size: [0.03, 0.55, 0.03], color: [0.9, 0.9, 0.9] },
  ];
}
