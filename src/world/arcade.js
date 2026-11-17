/**
 * Arcade checkpoints — some levels have an arcade cabinet halfway along the route.
 * Walk into it to play that level's checkpoint mini-game (Cloud Hop, Flap Dash or
 * Block Drop): win, and the cabinet becomes your checkpoint — full hearts, and if you
 * run out of hearts later you restart here instead of at the start. Lose (or skip) and
 * you just carry on. Either way the cabinet powers down.
 *
 *   const spot = placeArcade(level, audit);        // { x, y, z, platform } or null
 *   touchesArcade(player, spot)                     // walked into it?
 *   arcadeBoxes(spot, time, state)                  // boxes for the renderer
 *
 * The cabinet is decoration, not solid: it never changes how a level plays.
 */
import { topOf } from '../levels/audit.js';
import { ENEMY_TYPES } from './enemies.js';
import { hsv } from './gem.js';

/** The middle-most roomy platform on the verified route (no ground enemy, not the start or the goal). */
export function placeArcade(level, audit) {
  if (!audit?.route?.length) return null;
  const route = [audit.route[0].from, ...audit.route.map(e => e.to)];
  const busy = new Set((level.enemies || []).filter(e => ENEMY_TYPES[e.type]?.ground).map(e => e.platform));
  const goalPlatform = level.platforms.findIndex(p => Math.abs(topOf(p) - level.goal.y) < 0.05 && Math.abs(level.goal.x - p.x) <= p.width / 2 && Math.abs(level.goal.z - p.z) <= p.depth / 2);
  const inner = route.map((platform, k) => ({ platform, k })).filter(({ platform, k }) => k > 0 && k < route.length - 1 && platform !== goalPlatform && !busy.has(platform));
  let candidates = inner.filter(({ platform }) => Math.min(level.platforms[platform].width, level.platforms[platform].depth) >= 1.8);
  if (!candidates.length) candidates = inner;                     // small platforms only: still better than none
  if (!candidates.length) return null;
  const mid = (route.length - 1) / 2;
  const { platform } = candidates.sort((a, b) => Math.abs(a.k - mid) - Math.abs(b.k - mid))[0];
  const p = level.platforms[platform];
  return { x: p.x, y: topOf(p), z: p.z, platform };
}

export function touchesArcade(player, spot) {
  return !!spot && Math.hypot(player.x - spot.x, player.z - spot.z) < 0.75 && player.y > spot.y - 0.2 && player.y < spot.y + 1.6;
}

/**
 * The cabinet: a body, a glowing screen that cycles colours, a marquee, a joystick
 * and buttons, and a floating "!" while it's ready. state: 'ready' | 'won' | 'done'.
 */
export function arcadeBoxes(spot, time, state = 'ready') {
  const { x, y, z } = spot;
  const ready = state === 'ready';
  const glow = ready ? 0.9 : 0.2;
  const body = state === 'won' ? [1, 0.78, 0.25] : ready ? [0.42, 0.22, 0.75] : [0.3, 0.3, 0.36];
  const screen = ready ? hsv((time * 0.25) % 1, 0.7, 1) : state === 'won' ? [1, 0.95, 0.6] : [0.15, 0.16, 0.2];
  const out = [
    { center: [x, y + 0.45, z], size: [0.7, 0.9, 0.55], color: body },                                      // cabinet
    { center: [x, y + 1.12, z - 0.02], size: [0.7, 0.45, 0.5], color: body },                                // head
    { center: [x, y + 1.12, z + 0.235], size: [0.54, 0.34, 0.02], color: screen, glow },                     // screen
    { center: [x, y + 1.42, z + 0.02], size: [0.74, 0.14, 0.58], color: ready ? [1, 0.45, 0.75] : body, glow: ready ? 0.8 : 0 }, // marquee
    { center: [x, y + 0.88, z + 0.3], size: [0.6, 0.06, 0.16], color: [0.15, 0.12, 0.22] },                  // control panel
    { center: [x - 0.12, y + 0.96, z + 0.3], size: [0.04, 0.12, 0.04], color: [0.9, 0.9, 0.95] },            // joystick
    { center: [x + 0.08, y + 0.92, z + 0.32], size: [0.06, 0.04, 0.06], color: [1, 0.3, 0.35], glow: 0.5 },  // buttons
    { center: [x + 0.18, y + 0.92, z + 0.32], size: [0.06, 0.04, 0.06], color: [0.3, 0.8, 1], glow: 0.5 },
  ];
  if (ready) {
    const bob = y + 2 + Math.sin(time * 3) * 0.1;
    out.push({ center: [x, bob + 0.12, z], size: [0.12, 0.3, 0.12], color: [1, 0.85, 0.3], glow: 1, rotY: time * 2 });   // "!"
    out.push({ center: [x, bob - 0.12, z], size: [0.12, 0.1, 0.12], color: [1, 0.85, 0.3], glow: 1, rotY: time * 2 });
  }
  return out;
}
