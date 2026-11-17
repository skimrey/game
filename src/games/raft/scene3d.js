/**
 * The raft journey in 3D (kit/travel3d.js runs it; the same game object as the 2D version):
 * seen from behind and above, heading up-river (+z): the river's centre and width come from
 * riverAt() at every distance, so the banks are built once.
 *
 *   build(game, ctx)        the trip's static world → { k, level, scenery, … } (ctx.world)
 *   frame(game, time, ctx)  a frame → { parts, boxes, camera, focus }
 * ctx: { world, hero (a seated avatar), grow(key) (things fade in), accent, top, groundColor, zone, biome }
 */
import { RAFT, riverAt } from './rules.js';
import { compose, translation, rotationZ, scaling } from '../../engine/mat4.js';
import { B, prop, ringBoxes, moveParts, part } from '../kit/scene3d.js';
import { mulberry32, hashSeed } from '../../levels/generator.js';

function build(g, ctx) {
  const k = 1 / 12, X = px => -(px - 160) * k, platforms = [], boxes = [];
  const r = mulberry32(hashSeed('raft3d', g.phase));
  const end = g.trip + 600;
  platforms.push({ x: 0, y: -1, z: end * k / 2 - 10, width: 90, height: 2, depth: end * k + 40, material: 'lagoonWater', tint: [0.9, 1, 1.05] });
  for (let d = -200; d < end; d += 24) {
    const { c, half } = riverAt(g, d + 12);
    const z = (d + 12) * k;
    const left = X(c - half), right = X(c + half);           // (x grows to the right on screen: world x shrinks)
    platforms.push({ x: left + 7, y: -0.5, z, width: 14, height: 2, depth: 24 * k, tint: [1, 1, 1] });
    platforms.push({ x: right - 7, y: -0.5, z, width: 14, height: 2, depth: 24 * k, tint: [0.96, 0.96, 0.96] });
    if (r() < 0.55) boxes.push(...prop(r, left + 2 + r() * 9, 0.5, z, ctx.zone, 0.7 + r() * 0.6));
    if (r() < 0.55) boxes.push(...prop(r, right - 2 - r() * 9, 0.5, z, ctx.zone, 0.7 + r() * 0.6));
  }
  return { k, X, level: { name: 'River', spawn: { x: 0, y: 0, z: 0 }, platforms, goal: null, enemies: [] }, scenery: { boxes, ground: null } };
}

function frame(g, t, ctx) {
  const { k, X } = ctx.world;
  const z0 = g.travelled * k, x0 = X(g.x);
  const boxes = [], parts = [];
  for (const o of g.objects) {
    const z = o.d * k, x = X(o.x);
    if (z < z0 - 4 || z > z0 + 24) continue;
    const s = ctx.grow(o);
    if (o.kind === 'rock') {
      const w = o.r * 2 * k * 1.1 * s;
      boxes.push(B([x, 0.1 * s, z], [w, 0.9 * s, w * 0.9], [0.55, 0.55, 0.6], { rotY: o.x }), B([x - 0.1, 0.5 * s, z - 0.05], [w * 0.6, 0.4 * s, w * 0.55], [0.68, 0.68, 0.72], { rotY: o.x + 0.5 }));
    } else if (o.kind === 'log') {
      boxes.push(B([x, 0.12, z], [o.r * 2 * k * s, 0.45, 0.5], [0.5, 0.33, 0.18]), B([x - o.r * k * s, 0.12, z], [0.08, 0.5, 0.55], [0.78, 0.62, 0.42]), B([x + o.r * k * s, 0.12, z], [0.08, 0.5, 0.55], [0.78, 0.62, 0.42]));
    } else {
      for (let ring = 0; ring < 3; ring++) boxes.push(...ringBoxes(x, 0.02 + ring * 0.01, z, (0.4 + ring * 0.45) * o.r / 16 * s, 8 + ring * 4, ring % 2 ? [0.85, 0.95, 1] : [0.3, 0.6, 0.9], { flat: true, spin: -t * (3 - ring), size: 0.18, glow: 0.4 }));
    }
  }
  // the raft (it rolls with its sideways speed) and you on it
  const roll = -g.vx / RAFT.maxVx * 0.25, bob = Math.sin(t * 3) * 0.04;
  const frame = compose(translation(x0, 0.15 + bob, z0), rotationZ(roll));
  for (let i = 0; i < 4; i++) parts.push(part(frame, (i - 1.5) * 0.42, 0, 0, 0.4, 0.22, 1.9, i % 2 ? [0.72, 0.5, 0.28] : [0.62, 0.42, 0.24]));
  parts.push(part(frame, 0, 0.14, 0.6, 1.75, 0.08, 0.12, [0.4, 0.28, 0.16]), part(frame, 0, 0.14, -0.6, 1.75, 0.08, 0.12, [0.4, 0.28, 0.16]));
  // the paddle: it dips on the side of the last stroke
  const stroke = g.strokes.at(-1), side = stroke ? stroke.side : 0, dip = stroke ? stroke.t / 0.4 : 0;
  parts.push({ matrix: compose(frame, translation(-side * 0.55, 0.7, 0.1), rotationZ(side * (0.6 + dip * 0.5)), scaling(0.08, 1.5, 0.08)), color: [0.55, 0.38, 0.2], glow: 0 });
  ctx.hero.yaw = 0;
  parts.push(...moveParts(ctx.hero.getParts({ x: 0, y: -0.25, z: -0.15 }), frame));
  const cx = x0 * 0.7;
  return { parts, boxes, camera: { eye: [cx, 5.4, z0 - 8], target: [x0 * 0.85, 0, z0 + 6] }, focus: [x0, 0.2, z0] };
}

export default {
  build,
  frame,
  /** Where effects burst (a good stroke, a bump). */
  at: (g, { world }) => [world.X(g.x), 0.4, g.travelled * world.k],
  /** Your pet's seat, from the frame's focus. */
  seat: ([x, , z]) => [x + 0.5, 0.3, z - 0.65],
  haze: -3,
  /** Every frame: a splash on the side you paddled. */
  tick(g, ctx, emit) {
    if (g.strokes.length > (ctx.lastStrokes || 0)) {
      const s = g.strokes.at(-1);
      emit(ctx.world.X(g.x) + s.side * 0.9, 0.1, g.travelled * ctx.world.k, { count: 8, speed: 2, color: [0.8, 0.95, 1], lifetime: 0.5 });
    }
    ctx.lastStrokes = g.strokes.length;
  },
};
