/**
 * NPCs in the 3D world: where one stands in a level, and the actor that stands there —
 * an avatar (characters/avatar.js) in the NPC's clothes and silly face, idling, turning to watch you
 * when you come close, with a floating "!" while they have a quest for you ("?" once
 * you've accepted it, a spark when all is done).
 *
 *   const spot = placeNpc(level, audit, { avoid: [arcadeSpot] });   // { x, y, z, platform, facing }
 *   const actor = createNpcActor(npc, spot);
 *   actor.update(dt, player); actor.parts(time); actor.near(player)
 *
 * Like the arcade cabinet, an NPC is decoration — not solid: it never changes how a level
 * plays (the level audits stay true).
 */
import { topOf } from '../levels/audit.js';
import { ENEMY_TYPES } from '../world/enemies.js';
import { createAvatar } from './avatar.js';
import { compose, translation, scaling, rotationY } from '../engine/mat4.js';

export const NPC_RULES = {
  talkRadius: 1.7,        // walk this close to talk (E)
  watchRadius: 6,         // they turn to watch you from here
  sideMargin: 0.55,       // how far in from a platform's edge they stand
};

/**
 * A roomy platform on the verified route, in the first half (you meet them before the
 * gem), away from ground enemies, the start, the goal and anything in `avoid`; they stand
 * off to one side of it, facing back toward where you come from.
 */
export function placeNpc(level, audit, { avoid = [] } = {}) {
  if (!audit?.route?.length) return null;
  const route = [audit.route[0].from, ...audit.route.map(e => e.to)];
  const busy = new Set((level.enemies || []).filter(e => ENEMY_TYPES[e.type]?.ground).map(e => e.platform));
  for (const a of avoid) if (a?.platform !== undefined) busy.add(a.platform);
  const goalPlatform = level.platforms.findIndex(p => Math.abs(topOf(p) - level.goal.y) < 0.05 && Math.abs(level.goal.x - p.x) <= p.width / 2 && Math.abs(level.goal.z - p.z) <= p.depth / 2);
  const candidates = route.map((platform, k) => ({ platform, k })).filter(({ platform, k }) => k > 0 && k < route.length - 1 && platform !== goalPlatform && !busy.has(platform) && !level.platforms[platform].spring);
  const roomy = candidates.filter(({ platform }) => level.platforms[platform].width >= 2.2 && level.platforms[platform].depth >= 1.8);
  const pool = roomy.length ? roomy : candidates;
  if (!pool.length) {
    // a tiny level: the start platform, off to the side
    const p = level.platforms[route[0]];
    return { x: p.x + Math.sign(p.x || 1) * Math.max(0, p.width / 2 - NPC_RULES.sideMargin), y: topOf(p), z: p.z, platform: route[0], facing: Math.PI };
  }
  const target = (route.length - 1) * 0.35;
  const { platform } = pool.sort((a, b) => Math.abs(a.k - target) - Math.abs(b.k - target))[0];
  const p = level.platforms[platform];
  // the side of the platform away from the level's middle line (the route mostly runs along z)
  const side = p.x >= 0 ? 1 : -1;
  const x = p.x + side * Math.max(0, p.width / 2 - NPC_RULES.sideMargin);
  return { x, y: topOf(p), z: p.z, platform, facing: Math.PI };
}

export function createNpcActor(npc, spot) {
  const avatar = createAvatar({ random: () => 0.5 });
  avatar.setCharacter(npc.design);
  avatar.silly = npc.face;
  const body = { x: spot.x, y: spot.y, z: spot.z, vx: 0, vy: 0, vz: 0, grounded: true };
  avatar.reset(body);
  avatar.yaw = spot.facing;
  let wave = 0;
  return {
    npc, spot, avatar,
    /** 'quest' (has one for you) · 'accepted' · 'done' · 'none' — picks the marker. */
    mood: npc.quest ? 'quest' : 'none',
    lookAt: null,
    /** How close you must be to talk (shopkeepers: across their counter). */
    talkRadius: NPC_RULES.talkRadius,
    near(player) { return Math.hypot(player.x - spot.x, player.z - spot.z) < this.talkRadius && Math.abs(player.y - spot.y) < 1.6; },
    update(dt, player) {
      const dx = player.x - spot.x, dz = player.z - spot.z, d = Math.hypot(dx, dz);
      // turn to watch you when you're close (the avatar only turns itself when it walks) — or the
      // camera, while you talk (this.lookAt: [x, z])
      const want = this.lookAt ? Math.atan2(this.lookAt[0] - spot.x, this.lookAt[1] - spot.z)
        : d < NPC_RULES.watchRadius && Math.abs(player.y - spot.y) < 4 ? Math.atan2(dx, dz) : spot.facing;
      const diff = Math.atan2(Math.sin(want - avatar.yaw), Math.cos(want - avatar.yaw));
      avatar.yaw += diff * (1 - Math.exp(-5 * dt));
      // a little hop of excitement now and then while they have a quest for you
      wave = Math.max(0, wave - dt);
      if (this.mood === 'quest' && d < NPC_RULES.watchRadius && wave <= 0 && Math.random() < dt * 0.4) wave = 0.5;
      body.y = spot.y + (wave > 0 ? Math.sin((1 - wave / 0.5) * Math.PI) * 0.25 : 0);
      body.grounded = wave <= 0;
      avatar.gaze = d < NPC_RULES.watchRadius ? { yaw: 0, pitch: Math.max(-0.35, Math.min(0.3, -(player.y - spot.y) * 0.15)) } : null;
      avatar.update(body, dt);
    },
    parts(time) {
      const out = avatar.getParts(body);
      const top = spot.y + 2.1 * (npc.face.head > 1.15 ? 1.12 : 1) + Math.sin(time * 3) * 0.08;
      if (this.mood === 'quest') {
        out.push(...markerParts(spot.x, top, spot.z, time, [1, 0.85, 0.25], '!'));
      } else if (this.mood === 'accepted') {
        out.push(...markerParts(spot.x, top, spot.z, time, [0.4, 0.9, 1], '?'));
      }
      return out;
    },
  };
}

/** A floating "!" or "?" made of boxes (as avatar-style parts: { matrix, color, glow }). */
function markerParts(x, y, z, time, color, kind) {
  const pulse = 1.7 + 0.15 * Math.sin(time * 5);                 // big enough to spot from across a level
  const root = compose(translation(x, y + 0.25, z), rotationY(time * 1.5), scaling(pulse, pulse, pulse));
  const part = (dx, dy, sx, sy) => ({ matrix: compose(root, translation(dx, dy, 0), scaling(sx, sy, 0.12)), color, glow: 1 });
  if (kind === '!') return [part(0, 0.15, 0.12, 0.32), part(0, -0.16, 0.12, 0.11)];
  return [part(0, 0.28, 0.26, 0.08), part(0.1, 0.16, 0.08, 0.2), part(0.03, 0.04, 0.1, 0.08), part(0, -0.05, 0.08, 0.1), part(0, -0.2, 0.1, 0.1)];
}
