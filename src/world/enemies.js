/**
 * Enemies — deterministic, box-built foes.
 *
 *   crawler  patrols back and forth along a platform. Stomp it, dash into it or
 *            ground-pound near it.
 *   spiker   a crawler with spikes on its back: stomping it hurts you. Dash into
 *            it, or ground-pound next to it (the shockwave defeats it).
 *   wisp     glides back and forth between two points in the air (often across a
 *            gap). Stomp it or dash into it.
 *
 * Motion depends only on time (no AI state), so a level plays out the same way
 * every time — which is what lets the audit bot verify encounters in simulation.
 *
 * Level data:
 *   { type: 'crawler' | 'spiker', platform: index, axis?: 'x' | 'z', speed?, phase? }
 *   { type: 'wisp', from: [x, y, z], to: [x, y, z], speed?, phase? }
 */
import { topOf } from '../levels/audit.js';

export const ENEMY_TYPES = {
  crawler: { size: [0.8, 0.5, 0.8], speed: 1.5, stompable: true, ground: true },
  spiker: { size: [0.8, 0.55, 0.8], speed: 1.2, stompable: false, ground: true },
  wisp: { size: [0.6, 0.6, 0.6], speed: 1.8, stompable: true, ground: false },
};

/** Inset from the platform edge a patroller turns around at. */
export const PATROL_INSET = 0.5;

function pingPong(s, length) {
  const m = ((s % (2 * length)) + 2 * length) % (2 * length);
  return m < length ? { offset: m, dir: 1 } : { offset: 2 * length - m, dir: -1 };
}

/** Patrol axis and half-length for a ground enemy on its platform. */
export function patrolOf(enemy, level) {
  const p = level.platforms[enemy.platform];
  const axis = enemy.axis || (p.width >= p.depth ? 'x' : 'z');
  const half = Math.max(0, (axis === 'x' ? p.width : p.depth) / 2 - PATROL_INSET);
  return { p, axis, half };
}

/**
 * Where an enemy is at time t. Returns { x, y, z, fx, fz } — y is the enemy's
 * feet for ground enemies and its centre for wisps; (fx, fz) is its heading.
 */
export function enemyPosition(enemy, level, t) {
  const type = ENEMY_TYPES[enemy.type];
  const speed = enemy.speed ?? type.speed;
  if (type.ground) {
    const { p, axis, half } = patrolOf(enemy, level);
    const length = Math.max(0.001, 2 * half);
    const { offset, dir } = pingPong(speed * t + (enemy.phase ?? 0) * length, length);
    const along = -half + offset;
    return axis === 'x'
      ? { x: p.x + along, y: topOf(p), z: p.z + (enemy.lane ?? 0), fx: dir, fz: 0 }
      : { x: p.x + (enemy.lane ?? 0), y: topOf(p), z: p.z + along, fx: 0, fz: dir };
  }
  const [ax, ay, az] = enemy.from, [bx, by, bz] = enemy.to;
  const length = Math.max(0.001, Math.hypot(bx - ax, by - ay, bz - az));
  const { offset, dir } = pingPong(speed * t + (enemy.phase ?? 0) * length, length);
  const k = offset / length;
  const bob = Math.sin(t * 3 + (enemy.phase ?? 0) * 6) * 0.15;
  return {
    x: ax + (bx - ax) * k, y: ay + (by - ay) * k + bob, z: az + (bz - az) * k,
    fx: ((bx - ax) / length) * dir, fz: ((bz - az) / length) * dir,
  };
}

/** Axis-aligned box of an enemy at time t. */
export function enemyBounds(enemy, level, t) {
  const { size, ground } = ENEMY_TYPES[enemy.type];
  const pos = enemyPosition(enemy, level, t);
  const y0 = ground ? pos.y : pos.y - size[1] / 2;
  return { x0: pos.x - size[0] / 2, x1: pos.x + size[0] / 2, y0, y1: y0 + size[1], z0: pos.z - size[2] / 2, z1: pos.z + size[2] / 2, pos };
}

// ---------------------------------------------------------------------------
// Looks (boxes for the renderer's dynamic batch)
// ---------------------------------------------------------------------------
const PALETTES = {
  crawler: { body: [0.55, 0.3, 0.75], belly: [0.78, 0.6, 0.9], eye: [1, 1, 1], pupil: [0.1, 0.05, 0.15], leg: [0.3, 0.15, 0.4] },
  spiker: { body: [0.85, 0.35, 0.2], belly: [0.95, 0.7, 0.45], eye: [1, 1, 0.85], pupil: [0.15, 0.05, 0.05], leg: [0.45, 0.15, 0.1], spike: [0.95, 0.95, 0.9] },
  wisp: { core: [0.6, 0.95, 1], shell: [0.35, 0.6, 1], wing: [0.8, 0.95, 1], eye: [0.05, 0.1, 0.2] },
};

/** Boxes for one enemy: [{ center, size, color, glow, rotY }]. `defeated` ∈ [0, 1] shrinks it away. */
export function enemyParts(enemy, level, t, defeated = 0) {
  const type = ENEMY_TYPES[enemy.type];
  const pos = enemyPosition(enemy, level, t);
  const yaw = Math.atan2(pos.fx, pos.fz);
  const s = 1 - defeated;
  if (s <= 0.01) return [];
  const pal = PALETTES[enemy.type];
  const out = [];
  // place a box at local (lx, ly, lz) relative to the enemy, rotated by its heading
  const put = (lx, ly, lz, size, color, glow = 0) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    out.push({
      center: [pos.x + (c * lx + sn * lz) * s, pos.y + ly * s, pos.z + (-sn * lx + c * lz) * s],
      size: size.map(v => v * s), color, glow, rotY: yaw,
    });
  };
  if (type.ground) {
    const step = Math.sin(t * 14 + (enemy.phase ?? 0) * 5);
    const squish = 1 + 0.06 * Math.sin(t * 14);
    put(0, 0.27 * squish, 0, [0.78, 0.38 * squish, 0.78], pal.body);
    put(0, 0.12, 0.02, [0.7, 0.12, 0.72], pal.belly);
    for (const side of [-1, 1]) {
      put(side * 0.2, 0.36, 0.39, [0.16, 0.16, 0.04], pal.eye);
      put(side * 0.2, 0.35, 0.41, [0.07, 0.08, 0.03], pal.pupil);
      for (const front of [-1, 1]) put(side * 0.33, 0.05 + 0.04 * step * side * front, front * 0.22, [0.12, 0.1, 0.14], pal.leg);
    }
    if (enemy.type === 'spiker') {
      for (const [lx, lz] of [[0, 0], [-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]]) {
        put(lx, 0.53, lz, [0.12, 0.22, 0.12], pal.spike, 0.2);
      }
    }
  } else {
    const flap = Math.sin(t * 18 + (enemy.phase ?? 0) * 7);
    put(0, 0, 0, [0.42, 0.42, 0.42], pal.core, 0.9);
    put(0, 0, 0, [0.56, 0.3, 0.56], pal.shell, 0.4);
    for (const side of [-1, 1]) {
      put(side * (0.38 + 0.06 * flap), 0.08 + 0.1 * flap, -0.05, [0.34, 0.06, 0.26], pal.wing, 0.5);
      put(side * 0.1, 0.05, 0.22, [0.08, 0.1, 0.03], pal.eye);
    }
  }
  return out;
}
