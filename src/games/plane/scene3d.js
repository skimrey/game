/**
 * The plane journey in 3D (kit/travel3d.js runs it; the same game object as the 2D version):
 * a chase view from behind: distance → z, height → y, rings face you.
 *
 *   build(game, ctx)        the trip's static world → { k, level, scenery, … } (ctx.world)
 *   frame(game, time, ctx)  a frame → { parts, boxes, camera, focus }
 * ctx: { world, hero (a seated avatar), grow(key) (things fade in), accent, top, groundColor, zone, biome }
 */
import { PLANE } from './rules.js';
import { compose, translation, rotationX, rotationZ, scaling } from '../../engine/mat4.js';
import { B, shade, prop, ringBoxes, moveParts, part } from '../kit/scene3d.js';
import { mulberry32, hashSeed } from '../../levels/generator.js';

function build(g, ctx) {
  const k = 1 / 16, platforms = [], boxes = [];
  const r = mulberry32(hashSeed('plane3d', g.boss.speed));
  const end = (g.boss.hp + 2) * g.boss.stretch + 1200;
  platforms.push({ x: 0, y: -0.5, z: end * k / 2, width: 120, height: 1, depth: end * k + 80, tint: [1, 1, 1] });
  for (let i = 0; i < end * k / 1.6; i++) {
    const z = r() * end * k, x = (r() < 0.5 ? -1 : 1) * (3 + r() * 40);
    boxes.push(...prop(r, x, 0, z, ctx.zone, 1 + r() * 1.4));
  }
  for (let i = 0; i < 12; i++) {
    const z = r() * end * k, x = (r() < 0.5 ? -1 : 1) * (12 + r() * 30), s = 1.5 + r();
    boxes.push(B([x, 1.4 * s, z], [3 * s, 2.8 * s, 2.4 * s], [0.95, 0.92, 0.85]), B([x, 3.1 * s, z], [3.3 * s, 0.6 * s, 2.7 * s], [0.75, 0.25, 0.2]));
  }
  return { k, level: { name: 'Sky', spawn: { x: 0, y: 0, z: 0 }, platforms, goal: null, enemies: [] }, scenery: { boxes, ground: null } };
}

function frame(g, t, ctx) {
  const { k } = ctx.world;
  const P = PLANE, z0 = g.travelled * k, Y = py => (P.ground - py) * k + 1, y0 = Y(g.y);
  const boxes = [], parts = [];
  for (const o of g.things) {
    const z = o.d * k;
    if (z < z0 - 4 || z > z0 + 30) continue;
    const s = ctx.grow(o);
    if (o.kind === 'ring') {
      boxes.push(...ringBoxes(0, Y(o.y), z, o.r * k * s, 16, o.done ? [0.6, 0.6, 0.65] : [1, 0.82, 0.25], { size: 0.26, glow: o.done ? 0 : 0.7 }));
    } else if (o.kind === 'bird') {
      const y = Y(o.y + Math.sin(g.time * 3 + o.phase) * 10), flap = Math.sin(t * 14 + o.phase) * 0.8;
      boxes.push(B([0, y, z], [0.45 * s, 0.4 * s, 0.6 * s], [0.9, 0.9, 0.95]), B([0, y + 0.05, z - 0.35], [0.15, 0.12, 0.2], [1, 0.7, 0.2]));
      for (const side of [1, -1]) parts.push({ matrix: compose(translation(side * 0.2, y + 0.1, z), rotationZ(side * flap), translation(side * 0.4, 0, 0), scaling(0.8 * s, 0.06, 0.4 * s)), color: [0.85, 0.85, 0.9], glow: 0 });
    } else {
      const c = [0.45, 0.45, 0.52], r = o.r * k * 1.5 * s;
      boxes.push(B([0, Y(o.y), z], [r * 2.2, r * 1.4, r * 1.6], c), B([0.4, Y(o.y) + r * 0.5, z + 0.2], [r * 1.4, r, r * 1.2], shade(c, 1.15)), B([-0.5, Y(o.y) - r * 0.3, z - 0.1], [r * 1.5, r * 0.8, r], shade(c, 0.9)));
      if (Math.floor(t * 3 + o.d) % 5 === 0) boxes.push(B([0.2, Y(o.y) - r * 1.2, z], [0.12, r, 0.12], [1, 0.9, 0.3], { glow: 1 }));
    }
  }
  // the biplane (pitched with its climb) and you in the cockpit
  const tilt = Math.max(-0.5, Math.min(0.5, g.vy / 200));
  const frame = compose(translation(0, y0, z0), rotationX(tilt));
  parts.push(part(frame, 0, 0, 0, 0.6, 0.6, 2.4, ctx.accent), part(frame, 0, 0.42, 0.25, 3.6, 0.08, 0.8, ctx.top), part(frame, 0, -0.28, 0.25, 3.6, 0.08, 0.8, ctx.top));
  for (const x of [-1.4, 1.4]) parts.push(part(frame, x, 0.07, 0.25, 0.06, 0.7, 0.06, [0.3, 0.25, 0.2]));
  parts.push(part(frame, 0, 0.35, -1.05, 0.08, 0.6, 0.4, ctx.top), part(frame, 0, 0.1, -1.1, 1.3, 0.06, 0.35, ctx.top));
  parts.push({ matrix: compose(frame, translation(0, 0, 1.25), rotationZ(t * 40), scaling(1.4, 0.1, 0.05)), color: [0.25, 0.25, 0.3], glow: 0 });
  ctx.hero.yaw = 0; ctx.hero.duck = 0;
  parts.push(...moveParts(ctx.hero.getParts({ x: 0, y: -0.45, z: -0.35 }), frame));
  return { parts, boxes, camera: { eye: [1.6, y0 + 1.7, z0 - 7], target: [0, y0 + 0.3, z0 + 6] }, focus: [0, y0, z0] };
}

export default {
  build,
  frame,
  at: (g, { world }) => [0, (PLANE.ground - g.y) * world.k + 1, g.travelled * world.k],
  seat: null,                          // one seat: the pet waits at home
  haze: -3,
};
