/**
 * The minecart journey in 3D (kit/travel3d.js runs it; the same game object as the 2D version):
 * a chase view down the tunnel: distance → z, height over the rail → y.
 *
 *   build(game, ctx)        the trip's static world → { k, level, scenery, … } (ctx.world)
 *   frame(game, time, ctx)  a frame → { parts, boxes, camera, focus }
 * ctx: { world, hero (a seated avatar), grow(key) (things fade in), accent, top, groundColor, zone, biome }
 */
import { MINECART } from './rules.js';
import { compose, translation, rotationX, rotationZ, scaling } from '../../engine/mat4.js';
import { B, shade, moveParts, part } from '../kit/scene3d.js';
import { mulberry32, hashSeed } from '../../levels/generator.js';

function build(g, ctx) {
  const k = 1 / 16, platforms = [], boxes = [];
  const r = mulberry32(hashSeed('cart3d', g.boss.speed));
  const stone = ctx.groundColor.map(v => v * 0.25 + 0.3);                      // rock, a little of the zone's colour
  const end = (g.boss.hp + 2) * g.boss.stretch + 900;
  platforms.push({ x: 0, y: -9, z: end * k / 2, width: 16, height: 2, depth: end * k + 40, material: ctx.biome.material, tint: [0.35, 0.32, 0.35] });   // the pit floor, far below
  for (let z = -12; z < end * k; z += 4) {
    const wall = shade(stone, 0.8 + r() * 0.35);
    boxes.push(B([-3.8, 1.5, z], [1.6, 10, 4.05], wall), B([3.8, 1.5, z], [1.6, 10, 4.05], shade(wall, 0.9)), B([0, 6.9, z], [9, 0.8, 4.05], shade(wall, 0.7)));
    if (Math.round(z) % 8 === 0) boxes.push(B([0, 5.6, z], [7.6, 0.5, 0.6], [0.45, 0.3, 0.18]), B([-2.9, 3, z], [0.4, 5.6, 0.4], [0.45, 0.3, 0.18]), B([2.9, 3, z], [0.4, 5.6, 0.4], [0.45, 0.3, 0.18]));
    if (Math.round(z) % 12 === 0) boxes.push(B([-2.7, 3.4, z + 1], [0.3, 0.4, 0.3], [1, 0.8, 0.4], { glow: 1 }), B([2.7, 3.4, z + 3], [0.3, 0.4, 0.3], [1, 0.8, 0.4], { glow: 1 }));
    if (r() < 0.25) boxes.push(B([(r() < 0.5 ? -1 : 1) * 2.7, 0.8 + r() * 2, z + r() * 4], [0.25, 0.35, 0.25], [0.6, 0.9, 1], { glow: 0.9 }));
  }
  return { k, level: { name: 'Tunnel', spawn: { x: 0, y: 0, z: 0 }, platforms, goal: null, enemies: [] }, scenery: { boxes, ground: null } };
}

function frame(g, t, ctx) {
  const { k } = ctx.world;
  const M = MINECART, z0 = g.travelled * k, y0 = g.y * k;
  const boxes = [], parts = [];
  // the track: bed, sleepers and rails, with gaps where the game has them
  // (one long bed and two long rails per unbroken run of track — a few boxes, not hundreds)
  const gaps = g.hazards.filter(h => h.kind === 'gap').map(h => [(h.x - h.w / 2) * k, (h.x + h.w / 2) * k]).sort((a, b) => a[0] - b[0]);
  const from = Math.floor(z0 - 8), to = z0 + 34, bed = ctx.groundColor.map(v => v * 0.2 + 0.24);
  let start = from;
  for (const [a, b] of [...gaps.filter(([, b]) => b > from), [to, to]]) {
    const end = Math.min(a, to);
    if (end > start) {
      const mid = (start + end) / 2, len = end - start;
      boxes.push(B([0, -0.35, mid], [2.6, 0.5, len], bed));
      for (const x of [-0.55, 0.55]) boxes.push(B([x, 0.02, mid], [0.1, 0.1, len], [0.7, 0.7, 0.75]));
      for (let z = Math.ceil(start); z < end - 0.1; z++) boxes.push(B([0, -0.07, z + 0.25], [1.9, 0.08, 0.18], [0.42, 0.28, 0.16]));
    }
    start = Math.max(start, b);
    if (start >= to) break;
  }
  for (const h of g.hazards) {
    const z = h.x * k;
    if (z < z0 - 6 || z > z0 + 34) continue;
    const s = ctx.grow(h);
    if (h.kind === 'beam') {
      const low = 18 * k, w = h.w * k;
      boxes.push(B([0, low + (5.8 - low) / 2, z], [6, (5.8 - low) * s, w], [0.5, 0.34, 0.2]), B([0, low - 0.05, z], [6, 0.12, w + 0.06], [1, 0.8, 0.3], { glow: 0.7 }));
    } else if (h.kind === 'bat') {
      const y = (19 + Math.sin(g.time * 6 + h.phase) * 3 + 5) * k, flap = Math.sin(t * 20 + h.phase) * 0.7;
      boxes.push(B([0, y, z], [0.4 * s, 0.35 * s, 0.4 * s], [0.25, 0.15, 0.3]));
      const wing = (side) => ({ matrix: compose(translation(side * 0.3, y, z), rotationZ(side * flap), translation(side * 0.3, 0, 0), scaling(0.6 * s, 0.05, 0.35 * s)), color: [0.35, 0.2, 0.4], glow: 0 });
      parts.push(wing(1), wing(-1));
      parts.push(part(translation(0, y, z - 0.21), 0.12, 0.05, 0, 0.08, 0.08, 0.02, [1, 0.3, 0.3], 1), part(translation(0, y, z - 0.21), -0.12, 0.05, 0, 0.08, 0.08, 0.02, [1, 0.3, 0.3], 1));
    }
  }
  // the cart and you in it (ducking pulls you down)
  const frame = translation(0, y0, z0);
  parts.push(part(frame, 0, 0.55, 0, 1.5, 0.7, 1.7, [0.45, 0.45, 0.5]), part(frame, 0, 0.92, 0, 1.6, 0.08, 1.8, [0.65, 0.65, 0.7]));
  for (const [x, z] of [[-0.55, 0.6], [0.55, 0.6], [-0.55, -0.6], [0.55, -0.6]]) parts.push({ matrix: compose(frame, translation(x, 0.18, z), rotationX(-g.travelled * k * 3), scaling(0.12, 0.36, 0.36)), color: [0.15, 0.15, 0.18], glow: 0 });
  ctx.hero.duck = g.ducking ? 1 : 0;
  ctx.hero.yaw = 0;
  parts.push(...moveParts(ctx.hero.getParts({ x: 0, y: 0.15 - (g.ducking ? 0.45 : 0), z: -0.1 }), frame));
  return { parts, boxes, camera: { eye: [1.5, 3.3 + y0 * 0.4, z0 - 6.2], target: [0, 1 + y0 * 0.3, z0 + 7] }, focus: [0, y0 + 0.5, z0] };
}

export default {
  build,
  frame,
  at: (g, { world }) => [0, g.y * world.k + 0.6, g.travelled * world.k],
  seat: ([, y, z]) => [0.42, y + 0.5, z - 0.55],
  haze: -3,
};
