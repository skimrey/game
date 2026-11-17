/**
 * The snowmobile journey in 3D (kit/travel3d.js runs it; the same game object as the 2D version):
 * seen from the side (the tilt on landing matters): distance → z, the hills are hillAt() —
 * built around the sled every frame (crevasses come and go).
 *
 *   build(game, ctx)        the trip's static world → { k, level, scenery, … } (ctx.world)
 *   frame(game, time, ctx)  a frame → { parts, boxes, camera, focus }
 * ctx: { world, hero (a seated avatar), grow(key) (things fade in), accent, top, groundColor, zone, biome }
 */
import { SNOWMOBILE, hillAt } from './rules.js';
import { compose, translation, rotationX } from '../../engine/mat4.js';
import { B, shade, prop, moveParts, part } from '../kit/scene3d.js';
import { mulberry32, hashSeed } from '../../levels/generator.js';
import { particleSystem } from '../../engine/particles.js';

function build(g, ctx) {
  const k = 1 / 16, platforms = [], boxes = [];
  const r = mulberry32(hashSeed('sled3d', g.phase));
  const end = (g.boss.hp + 2) * g.boss.stretch + 1200;
  platforms.push({ x: 8, y: -16, z: end * k / 2, width: 80, height: 2, depth: end * k + 60, material: 'cloudSea' });   // clouds far below
  for (let z = -20; z < end * k; z += 2.2 + r() * 2) {
    const x = 5 + r() * 14, y = (hillAt(g, z / k) / 16) - 4 - 1 - r() * 4;
    boxes.push(...prop(r, x, y, z, ctx.zone === 'alpine' ? 'alpine' : ctx.zone, 1 + r() * 0.8));
  }
  for (let i = 0; i < 20; i++) {                                          // far peaks
    const z = r() * end * k, h = 10 + r() * 18, x = 45 + r() * 30, rot = r();
    for (let t = 0; t < 4; t++) {                                         // a stepped peak, snow on top
      const w = 22 * (1 - t * 0.22), y0 = -12 + h * t / 4;
      boxes.push(B([x, y0 + h / 8, z], [w, h / 4, w], t === 3 ? [0.95, 0.96, 1] : shade([0.5, 0.52, 0.62], 1 + t * 0.06), { rotY: rot }));
    }
  }
  return { k, level: { name: 'Ridges', spawn: { x: 0, y: 0, z: 0 }, platforms, goal: null, enemies: [] }, scenery: { boxes, ground: null } };
}

function frame(g, t, ctx) {
  const { k } = ctx.world;
  const S = SNOWMOBILE, z0 = g.x * k, y0 = g.y * k - 4;
  const boxes = [], parts = [];
  // the snow, a column at a time around the sled (crevasses come and go)
  for (let z = Math.floor((z0 - 12) * 2) / 2; z < z0 + 28; z += 0.5) {
    const x = z / k;
    if (g.inCrevasse(x + 4)) { boxes.push(B([0, -14, z + 0.25], [7, 2, 0.52], [0.1, 0.1, 0.16])); continue; }
    const h = hillAt(g, x + 4) * k - 4;
    boxes.push(B([0, (h - 14) / 2, z + 0.25], [7, h + 14, 0.52], [0.93, 0.95, 1]));
    boxes.push(B([0, h - 0.5, z + 0.25], [7.05, 1, 0.53], [0.86, 0.9, 0.98]));
    if (Math.round(z * 2) % 9 === 0) boxes.push(B([-3.4, h + 0.04, z], [0.2, 0.08, 0.2], [0.7, 0.78, 0.9]));
  }
  for (const c of g.crevasses) {
    const z = c.x * k;
    if (z > z0 - 14 && z < z0 + 34) boxes.push(B([-3.6, hillAt(g, c.x) * k - 3.5, z], [0.1, 1.2, 0.1], [1, 0.3, 0.3], { glow: 0.8 }), B([-3.6, hillAt(g, c.x) * k - 2.9, z + 0.2], [0.08, 0.3, 0.4], [1, 0.9, 0.3], { glow: 0.8 }));
  }
  // the snowmobile and you on it, pitched with the sled
  const frame = compose(translation(0, y0, z0), rotationX(-g.angle));
  parts.push(part(frame, 0, 0.35, 0, 1.1, 0.4, 2, ctx.accent), part(frame, 0, 0.62, -0.2, 0.9, 0.25, 1, shade(ctx.accent, 0.75)), part(frame, 0, 0.55, 0.85, 0.9, 0.35, 0.4, ctx.top));
  for (const x of [-0.5, 0.5]) parts.push(part(frame, x, 0.06, 0.2, 0.15, 0.12, 2.2, [0.2, 0.2, 0.25]));
  parts.push(part(frame, 0, 0.95, 0.75, 1, 0.08, 0.08, [0.15, 0.15, 0.2]));
  ctx.hero.yaw = 0; ctx.hero.duck = 0;
  parts.push(...moveParts(ctx.hero.getParts({ x: 0, y: 0.05, z: -0.2 }), frame));
  if (!g.airborne && Math.random() < 0.5) particleSystem.emit(0, y0 + 0.1, z0 - 1, { count: 1, speed: 1.5, color: [0.95, 0.97, 1], lifetime: 0.4 });
  return { parts, boxes, camera: { eye: [-12, y0 + 3, z0 + 3.5], target: [0, y0 + 0.6, z0 + 5] }, focus: [0, y0 + 0.4, z0] };
}

export default {
  build,
  frame,
  at: (g, { world }) => [0, g.y * world.k - 3.6, g.x * world.k],
  seat: ([, y, z]) => [0.3, y + 0.45, z - 0.85],
  haze: -20,
};
