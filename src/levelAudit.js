/**
 * Level Audit
 *
 * Answers two questions about a level:
 *   1. Can it be completed?  — proven by a bot that plays the level through the
 *      real physics (`stepPlayer`) and must actually trigger the goal.
 *   2. Is it any good?       — a set of quality rules (fair jumps, headroom,
 *      kill plane, skippable sections, jumps toward the camera, …).
 *
 * Pipeline
 *   measure jump envelope from physics  →  build jump graph (analytic)
 *   →  plan easiest route (minimax difficulty, then fewest hops)
 *   →  bot executes route in the real physics, replanning around failed edges
 *   →  quality rules over geometry + verified route
 *
 * The result includes the bot's recorded inputs, so a solution can be replayed
 * deterministically (the Level Lab uses this to "watch the bot solve it").
 */

import { createPlayer, stepPlayer, PLAYER } from './physics.js';
import { Config } from './config.js';

export const DT = 1 / 120;

/** Quality thresholds. Generated levels must satisfy these with zero warnings. */
export const RULES = {
  BOT_EDGE: 0.25,             // how far past a platform edge the bot dares to put its centre
                              // (physics keeps you grounded up to PLAYER.halfWidth = 0.4)
  SLOPPY_TAKEOFF: -0.1,       // forgiveness check: take off 0.1 inside the edge, i.e. 0.5 units
                              // (0.1 s) earlier than the bot's normal take-off
  QUALITY_CAP: 0.9,           // hardest allowed jump, as a fraction of what physics allows
  HARD_JUMP: 0.8,             // warn above this
  MIN_PLATFORM: 1.0,          // warn if a platform is narrower than this
  MAX_SPAWN_DROP: 2,          // warn if the player spawns higher than this above ground
  HEADROOM: PLAYER.height + 0.2,
  BACKWARD_JUMP: -1.0,        // warn if a jump moves this far toward the camera (-z)
  KILL_PLANE_MARGIN: 2,       // platforms must sit this far above the fall threshold
  MIN_JUMPS: 1,
};

// ---------------------------------------------------------------------------
// Jump envelope — measured from the actual physics so it can never drift.
// ---------------------------------------------------------------------------
function measureEnvelope() {
  const empty = { platforms: [], spawn: { x: 0, y: 100, z: 0 }, goal: { x: 1e9, y: -1e9, z: 1e9, radius: 0 } };
  const p = { x: 0, y: 50, z: 0, vy: 0, grounded: true };
  const heights = [0];
  const velocities = [0];
  stepPlayer(p, empty, { jump: true }, DT);
  heights.push(p.y - 50);
  velocities.push(p.vy);
  while (p.y - 50 > -40) {
    stepPlayer(p, empty, {}, DT);
    heights.push(p.y - 50);
    velocities.push(p.vy);
  }
  return {
    heights,
    velocities,
    peak: Math.max(...heights),
    speed: PLAYER.speed,
    stepDistance: PLAYER.speed * DT,
  };
}

export const ENVELOPE = measureEnvelope();

/**
 * Reach with the air dash (measured from the physics): the furthest centre travel
 * that still lands on a surface `dh` above take-off, dashing at the best moment.
 * Used for "could the player get there at all?" questions (dead ends, decoys);
 * required route jumps are still rated against the basic jump.
 */
let dashTable = null;
const DASH_GRID = { min: -40, step: 0.05 };
function buildDashTable() {
  const empty = { platforms: [], spawn: { x: 0, y: 100, z: 0 }, goal: { x: 1e9, y: -1e9, z: 1e9, radius: 0 } };
  const size = Math.ceil((ENVELOPE.peak - DASH_GRID.min) / DASH_GRID.step) + 1;
  const best = new Float64Array(size).fill(-1);
  const airTicks = ticksToLand(0);
  for (let k = 1; k <= airTicks; k++) {
    const p = createPlayer({ x: 0, y: 50, z: 0 });
    p.grounded = true;
    const heights = [0], dist = [0], vys = [0];
    stepPlayer(p, empty, { forward: true, jump: true, dash: k === 1 }, DT);
    heights.push(p.y - 50); dist.push(p.z); vys.push(p.vy);
    for (let n = 2; p.y - 50 > DASH_GRID.min - 1; n++) {
      stepPlayer(p, empty, { forward: true, dash: n === k }, DT);
      heights.push(p.y - 50); dist.push(p.z); vys.push(p.vy);
    }
    for (let n = 1; n < heights.length; n++) {
      if (vys[n] > 0 || heights[n] >= heights[n - 1]) continue; // descending only
      const hi = Math.floor((heights[n - 1] - DASH_GRID.min) / DASH_GRID.step);
      const lo = Math.ceil((heights[n] - DASH_GRID.min) / DASH_GRID.step);
      for (let g = Math.max(0, lo); g <= Math.min(size - 1, hi); g++) best[g] = Math.max(best[g], dist[n]);
    }
  }
  return best;
}

/** Max centre travel with an optimally timed dash landing `dh` above take-off (null if too high). */
export function dashReach(dh) {
  if (dh > ENVELOPE.peak) return null;
  if (!dashTable) dashTable = buildDashTable();
  const g = Math.max(0, Math.floor((dh - DASH_GRID.min) / DASH_GRID.step));
  const v = dashTable[Math.min(g, dashTable.length - 1)];
  return v < 0 ? null : v;
}

/** Ticks from take-off until the player lands on a surface `dh` above take-off (null if unreachable). */
const landingCache = new Map();
export function ticksToLand(dh) {
  if (landingCache.has(dh)) return landingCache.get(dh);
  const { heights, velocities } = ENVELOPE;
  let result = null;
  for (let n = 1; n < heights.length; n++) {
    if (velocities[n] <= 0 && heights[n - 1] >= dh && heights[n] <= dh) { result = n; break; }
  }
  if (landingCache.size < 50000) landingCache.set(dh, result);
  return result;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
export const topOf = p => p.y + p.height / 2;
const bottomOf = p => p.y - p.height / 2;

/**
 * Region where the player's centre can be while supported by platform p,
 * grown by `edge` past the platform's edges (PLAYER.halfWidth = theoretical limit).
 */
export function standRegion(p, edge) {
  return { x0: p.x - p.width / 2 - edge, x1: p.x + p.width / 2 + edge, z0: p.z - p.depth / 2 - edge, z1: p.z + p.depth / 2 + edge };
}

function rawRect(p) {
  return { x0: p.x - p.width / 2, x1: p.x + p.width / 2, z0: p.z - p.depth / 2, z1: p.z + p.depth / 2 };
}

function axisGap(a0, a1, b0, b1) {
  return Math.max(0, b0 - a1, a0 - b1);
}

/** Closest pair of points between two rectangles (per axis). */
export function closestPoints(a, b) {
  const axis = (a0, a1, b0, b1) => {
    if (a1 < b0) return [a1, b0];
    if (b1 < a0) return [a0, b1];
    const m = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
    return [m, m];
  };
  const [ax, bx] = axis(a.x0, a.x1, b.x0, b.x1);
  const [az, bz] = axis(a.z0, a.z1, b.z0, b.z1);
  return { from: { x: ax, z: az }, to: { x: bx, z: bz } };
}

/** Travel distance when movement is limited to 8 directions (octagonal norm). */
export function octagonDistance(dx, dz) {
  const a = Math.max(Math.abs(dx), Math.abs(dz)), b = Math.min(Math.abs(dx), Math.abs(dz));
  return a - b + b * Math.SQRT2;
}

/**
 * Analytic jump analysis between two platforms.
 * difficulty = required travel / maximum travel the physics allows
 * (taking off and landing at the very edge): 0 = trivial, 1 = frame-perfect, >1 impossible.
 */
export function analyzeJump(a, b, { moves = 'basic' } = {}) {
  const dh = topOf(b) - topOf(a);
  const ra = rawRect(a), rb = rawRect(b);
  const rawGap = Math.hypot(axisGap(ra.x0, ra.x1, rb.x0, rb.x1), axisGap(ra.z0, ra.z1, rb.z0, rb.z1));
  if (Math.abs(dh) < 1e-6 && rawGap < 2 * PLAYER.halfWidth - 0.1) {
    return { kind: 'walk', dh: 0, distance: 0, difficulty: 0, severity: 0, reason: null };
  }
  const sa = standRegion(a, PLAYER.halfWidth), sb = standRegion(b, PLAYER.halfWidth);
  const gx = axisGap(sa.x0, sa.x1, sb.x0, sb.x1), gz = axisGap(sa.z0, sa.z1, sb.z0, sb.z1);
  const distance = octagonDistance(gx, gz);
  const ticks = moves === 'dash' ? (dashReach(dh) === null ? null : 1) : ticksToLand(dh);
  if (ticks === null) {
    return { kind: 'jump', dh, distance, difficulty: Infinity, severity: 1 + (dh - ENVELOPE.peak) + distance / 10,
      reason: `rise of ${dh.toFixed(2)} exceeds max jump height ${ENVELOPE.peak.toFixed(2)}` };
  }
  const budget = Math.max(0.01, moves === 'dash' ? dashReach(dh) : ticks * ENVELOPE.stepDistance);
  const difficulty = Math.max(distance / budget, dh > 0 ? dh / ENVELOPE.peak : 0);
  const reason = difficulty > 1
    ? (distance > budget ? `gap of ${distance.toFixed(2)} exceeds reach of ${budget.toFixed(2)} at rise ${dh.toFixed(2)}`
      : `rise of ${dh.toFixed(2)} exceeds max jump height ${ENVELOPE.peak.toFixed(2)}`)
    : null;
  return { kind: 'jump', dh, distance, difficulty, severity: difficulty, reason };
}

/** Does the player's box at `pos` (feet) intersect platform p's volume? */
function bodyIntersects(pos, p) {
  return Math.abs(pos.x - p.x) < PLAYER.halfWidth + p.width / 2 &&
    Math.abs(pos.z - p.z) < PLAYER.halfWidth + p.depth / 2 &&
    pos.y < topOf(p) - 1e-6 && pos.y + PLAYER.height > bottomOf(p) + 1e-6;
}

export function standingOn(player, p) {
  return Math.abs(player.y - topOf(p)) < 1e-6 &&
    Math.abs(player.x - p.x) < PLAYER.halfWidth + p.width / 2 &&
    Math.abs(player.z - p.z) < PLAYER.halfWidth + p.depth / 2;
}

/** Index of the platform the player stands on (prefers the one under the centre). */
function supportIndex(player, platforms) {
  let best = -1;
  platforms.forEach((p, i) => {
    if (!standingOn(player, p)) return;
    const centred = Math.abs(player.x - p.x) <= p.width / 2 && Math.abs(player.z - p.z) <= p.depth / 2;
    if (best === -1 || centred) best = i;
  });
  return best;
}

// ---------------------------------------------------------------------------
// Input encoding (for recording / replaying solutions)
// ---------------------------------------------------------------------------
const BIT = { left: 1, right: 2, forward: 4, back: 8, jump: 16, dash: 32, pound: 64 };
export function encodeInput(input) {
  let n = 0;
  for (const key in BIT) if (input[key]) n |= BIT[key];
  return n;
}
export function decodeInput(n) {
  const out = {};
  for (const key in BIT) out[key] = (n & BIT[key]) !== 0;
  return out;
}

/** Nearest of the 8 movement directions toward (dx, dz). Physics: left => +x, forward => +z. */
export function steer(dx, dz) {
  if (Math.hypot(dx, dz) < ENVELOPE.stepDistance) return {};
  const k = Math.round(Math.atan2(dx, dz) / (Math.PI / 4));
  const sx = Math.round(Math.sin(k * Math.PI / 4)), sz = Math.round(Math.cos(k * Math.PI / 4));
  return { left: sx > 0, right: sx < 0, forward: sz > 0, back: sz < 0 };
}

// ---------------------------------------------------------------------------
// Bot — executes a planned route in the real physics
// ---------------------------------------------------------------------------
export class Bot {
  constructor(level, { takeoffEdge = RULES.BOT_EDGE, landingEdge = RULES.BOT_EDGE } = {}) {
    this.level = level;
    this.takeoffEdge = takeoffEdge;
    this.landingEdge = landingEdge;
    this.player = createPlayer(level.spawn);
    this.inputs = [];
    this.reachedGoal = false;
  }

  step(input) {
    const result = stepPlayer(this.player, this.level, input, DT);
    this.inputs.push(encodeInput(input));
    if (result === 'goal') this.reachedGoal = true;
    return result;
  }

  settle(maxTicks = 600) {
    for (let i = 0; i < maxTicks; i++) {
      if (this.player.grounded && this.inputs.length) return true;
      if (this.step({}) === 'respawn') return false;
    }
    return this.player.grounded;
  }

  /** Walk toward target. Returns 'arrived' | 'blocked' (pressed against a wall) | 'failed'. */
  walkTo(target, maxTicks = 1200) {
    let still = 0;
    for (let i = 0; i < maxTicks; i++) {
      if (this.reachedGoal) return 'arrived';
      const dx = target.x - this.player.x, dz = target.z - this.player.z;
      if (Math.hypot(dx, dz) < ENVELOPE.stepDistance) return 'arrived';
      const before = { x: this.player.x, z: this.player.z };
      const result = this.step(steer(dx, dz));
      if (result === 'respawn' || !this.player.grounded) return 'failed';
      const moved = Math.hypot(this.player.x - before.x, this.player.z - before.z);
      still = moved < 1e-9 ? still + 1 : 0;
      if (still >= 6) return 'blocked';
    }
    return 'failed';
  }

  jumpTo(target, maxTicks = 600) {
    let input = { ...steer(target.x - this.player.x, target.z - this.player.z), jump: true };
    for (let i = 0; i < maxTicks; i++) {
      if (this.step(input) === 'respawn') return false;
      if (this.player.grounded) return true;
      input = steer(target.x - this.player.x, target.z - this.player.z);
    }
    return false;
  }

  /** Execute one edge. Returns true if the bot ends up standing on `to`. */
  traverse(from, to, kind) {
    const { from: takeoff, to: near } = closestPoints(standRegion(from, this.takeoffEdge), standRegion(to, this.landingEdge));
    let landing = near;
    // If that spot would still be over the take-off platform (close neighbours, e.g. a
    // small drop), the physics would land us back on it: aim properly into the target.
    const overFrom = Math.abs(landing.x - from.x) < PLAYER.halfWidth + from.width / 2 &&
      Math.abs(landing.z - from.z) < PLAYER.halfWidth + from.depth / 2;
    if (overFrom) {
      const inset = PLAYER.halfWidth + 0.05;
      const core = {
        x0: Math.min(to.x, to.x - to.width / 2 + inset), x1: Math.max(to.x, to.x + to.width / 2 - inset),
        z0: Math.min(to.z, to.z - to.depth / 2 + inset), z1: Math.max(to.z, to.z + to.depth / 2 - inset),
      };
      landing = closestPoints({ x0: takeoff.x, x1: takeoff.x, z0: takeoff.z, z1: takeoff.z }, core).to;
    }
    if (kind === 'walk') {
      if (this.walkTo(landing) !== 'arrived') return this.reachedGoal;
    } else {
      // 'blocked' is fine: e.g. a taller neighbour is in the way — jump from here.
      if (this.walkTo(takeoff) === 'failed') return this.reachedGoal;
      if (this.reachedGoal) return true;
      if (!this.jumpTo(landing)) return false;
    }
    return this.reachedGoal || standingOn(this.player, to);
  }

  finish(goal, maxTicks = 1200) {
    for (let i = 0; i < maxTicks && !this.reachedGoal; i++) {
      const dx = goal.x - this.player.x, dz = goal.z - this.player.z;
      const result = this.step(steer(dx, dz));
      if (result === 'respawn') return false;
    }
    return this.reachedGoal;
  }
}

// ---------------------------------------------------------------------------
// Route planning
// ---------------------------------------------------------------------------
function buildGraph(platforms) {
  const edges = platforms.map(() => []);
  platforms.forEach((a, i) => platforms.forEach((b, j) => {
    if (i === j) return;
    const jump = analyzeJump(a, b);
    edges[i].push({ from: i, to: j, ...jump });
  }));
  return edges;
}

function bfs(edges, start, goals, maxDifficulty, banned) {
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    if (goals.has(node)) {
      const path = [];
      for (let e = prev.get(node); e; e = prev.get(e.from)) path.unshift(e);
      return path;
    }
    for (const e of edges[node]) {
      if (e.difficulty > maxDifficulty || prev.has(e.to) || banned.has(`${e.from}>${e.to}`)) continue;
      prev.set(e.to, e);
      queue.push(e.to);
    }
  }
  return null;
}

/** Easiest route: minimise the hardest jump, then the number of hops. */
function planRoute(edges, start, goals, banned, cap = 1) {
  const levels = [...new Set(edges.flat().map(e => e.difficulty).filter(d => d <= cap))].sort((a, b) => a - b);
  let lo = 0, hi = levels.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const path = bfs(edges, start, goals, levels[mid], banned);
    if (path) { best = path; hi = mid - 1; } else lo = mid + 1;
  }
  return best;
}

function reachableFrom(edges, start, cap = 1) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const e of edges[queue.shift()]) {
      if (e.difficulty <= cap && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
/**
 * Audit a level.
 * @returns {{ ok, errors, warnings, metrics, route, solution }}
 *   ok        — no errors (warnings allowed)
 *   errors    — [{ code, message }] level is broken / unfair
 *   warnings  — [{ code, message }] level works but has quality concerns
 *   route     — verified jumps [{ from, to, kind, dh, distance, difficulty }]
 *   solution  — { inputs: number[], ticks } replayable bot inputs (see decodeInput)
 */
export function auditLevel(level) {
  const errors = [], warnings = [];
  const error = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });
  const result = () => ({ ok: errors.length === 0, errors, warnings, metrics, route, solution });
  let metrics = null, route = null, solution = null;

  // --- Schema -------------------------------------------------------------
  const num = v => typeof v === 'number' && Number.isFinite(v);
  if (!level || typeof level.name !== 'string' || !level.name) error('SCHEMA', 'Level must have a name');
  if (!level?.spawn || !['x', 'y', 'z'].every(k => num(level.spawn[k]))) error('SCHEMA', 'Spawn must have numeric x, y, z');
  if (!level?.goal || !['x', 'y', 'z', 'radius'].every(k => num(level.goal[k]))) error('SCHEMA', 'Goal must have numeric x, y, z, radius');
  if (!Array.isArray(level?.platforms) || level.platforms.length === 0) error('SCHEMA', 'Level needs at least one platform');
  else level.platforms.forEach((p, i) => {
    if (!['x', 'y', 'z', 'width', 'height', 'depth'].every(k => num(p[k]))) error('SCHEMA', `Platform ${i} has non-numeric fields`);
    else if (p.width <= 0 || p.height <= 0 || p.depth <= 0) error('SCHEMA', `Platform ${i} has a non-positive size`);
  });
  if (errors.length) return result();
  const { platforms, spawn, goal } = level;

  // --- Static geometry rules ---------------------------------------------
  const killY = Config.PLAYER_FALL_THRESHOLD + RULES.KILL_PLANE_MARGIN;
  platforms.forEach((p, i) => {
    if (topOf(p) < killY) error('KILL_PLANE', `Platform ${i} top (${topOf(p).toFixed(2)}) is at or below the fall threshold`);
    if (Math.min(p.width, p.depth) < RULES.MIN_PLATFORM) warn('TINY_PLATFORM', `Platform ${i} is only ${Math.min(p.width, p.depth).toFixed(2)} wide`);
  });
  if (goal.radius < 0.5) warn('SMALL_GOAL', `Goal radius ${goal.radius} is very small`);
  platforms.forEach((p, i) => {
    if (bodyIntersects(spawn, p)) error('SPAWN_EMBEDDED', `Spawn overlaps platform ${i}; the player would start stuck`);
  });
  // Crawlspaces: a surface with something hanging just above it.
  platforms.forEach((low, i) => platforms.forEach((high, j) => {
    if (i === j) return;
    const gap = bottomOf(high) - topOf(low);
    const overlapX = Math.abs(low.x - high.x) < (low.width + high.width) / 2;
    const overlapZ = Math.abs(low.z - high.z) < (low.depth + high.depth) / 2;
    if (overlapX && overlapZ && gap > 1e-6 && gap < RULES.HEADROOM) {
      warn('HEADROOM', `Only ${gap.toFixed(2)} headroom between platform ${i} and platform ${j} above it`);
    }
  }));
  const goalPlatforms = new Set();
  platforms.forEach((p, i) => {
    if (Math.abs(topOf(p) - goal.y) < 1e-3 && Math.abs(goal.x - p.x) <= p.width / 2 && Math.abs(goal.z - p.z) <= p.depth / 2) goalPlatforms.add(i);
  });
  if (!goalPlatforms.size) error('GOAL_UNSUPPORTED', 'Goal is not on top of any platform');

  // --- Spawn: let the player settle -------------------------------------
  const bot = new Bot(level);
  if (!bot.settle()) {
    error('SPAWN_UNSUPPORTED', 'Player does not land on a platform after spawning');
    return result();
  }
  const start = supportIndex(bot.player, platforms);
  const spawnDrop = spawn.y - bot.player.y;
  if (spawnDrop > RULES.MAX_SPAWN_DROP) warn('SPAWN_DROP', `Player spawns ${spawnDrop.toFixed(2)} above the ground`);
  if (errors.length) return result();
  if (goalPlatforms.has(start)) error('GOAL_ON_SPAWN', 'Goal is on the spawn platform');

  // --- Completability ---------------------------------------------------
  const edges = buildGraph(platforms);
  const banned = new Set();
  let verified = null, failures = [];
  for (let attempt = 0; attempt < 25 && !verified; attempt++) {
    const path = planRoute(edges, start, goalPlatforms, banned);
    if (!path) break;
    const run = new Bot(level);
    run.settle();
    let ok = true;
    for (const e of path) {
      if (!run.traverse(platforms[e.from], platforms[e.to], e.kind)) {
        banned.add(`${e.from}>${e.to}`);
        failures.push(e);
        ok = false;
        break;
      }
      if (run.reachedGoal) break;
    }
    if (ok && run.finish(goal)) verified = { path, bot: run };
    else if (ok) { banned.add(`${path.at(-1).from}>${path.at(-1).to}`); failures.push(path.at(-1)); }
  }

  if (!verified) {
    const reach = reachableFrom(edges, start);
    const frontier = [...reach].flatMap(i => edges[i]).filter(e => !reach.has(e.to))
      .sort((a, b) => a.severity - b.severity)[0];
    if (failures.length && [...goalPlatforms].some(g => reach.has(g))) {
      const f = failures.at(-1);
      error('BOT_FAILED', `Route exists on paper but the bot could not execute it (last failure: platform ${f.from} → ${f.to})`);
    } else {
      error('UNREACHABLE_GOAL', `Goal cannot be reached: only ${reach.size}/${platforms.length} platforms are reachable from spawn` +
        (frontier ? `; easiest next jump is platform ${frontier.from} → ${frontier.to}: ${frontier.reason}` : ''));
    }
    return result();
  }

  // --- Route quality ------------------------------------------------------
  route = verified.path.map(e => ({
    from: e.from, to: e.to, kind: e.kind, dh: e.dh, distance: e.distance, difficulty: e.difficulty,
    dz: platforms[e.to].z - platforms[e.from].z,
  }));
  const jumps = route.filter(e => e.kind === 'jump');
  const maxDifficulty = Math.max(0, ...jumps.map(e => e.difficulty));
  if (maxDifficulty > RULES.QUALITY_CAP) {
    error('UNFAIR_JUMP', `Easiest route still needs a jump at ${(maxDifficulty * 100).toFixed(0)}% of the physical limit (cap ${RULES.QUALITY_CAP * 100}%)`);
  }
  for (const e of jumps) {
    if (e.difficulty > RULES.HARD_JUMP && e.difficulty <= RULES.QUALITY_CAP) warn('HARD_JUMP', `Jump ${e.from} → ${e.to} is at ${(e.difficulty * 100).toFixed(0)}% of the limit`);
    if (e.dz < RULES.BACKWARD_JUMP) warn('BACKWARD_JUMP', `Jump ${e.from} → ${e.to} goes ${(-e.dz).toFixed(1)} toward the camera`);
  }
  if (jumps.length < RULES.MIN_JUMPS) error('NO_CHALLENGE', 'Goal can be reached without jumping');

  // Forgiveness: replay the route as a sloppy player who takes off early.
  const sloppy = new Bot(level, { takeoffEdge: RULES.SLOPPY_TAKEOFF });
  sloppy.settle();
  for (const e of verified.path) {
    if (sloppy.reachedGoal) break;
    if (!sloppy.traverse(platforms[e.from], platforms[e.to], e.kind)) {
      warn('NEEDS_PRECISION', `Jump ${e.from} → ${e.to} fails if you take off 0.1 s early`);
      break;
    }
  }
  const visited = new Set([start, ...route.map(e => e.to)]);
  const reach = reachableFrom(edges, start);
  if (reach.size < platforms.length) warn('UNREACHABLE_PLATFORMS', `${platforms.length - reach.size} platform(s) can never be reached`);
  // Off-route but reachable platforms are classified by the fun audit
  // (false paths vs alternate routes) — see funAudit.js.

  const avg = jumps.length ? jumps.reduce((s, e) => s + e.difficulty, 0) / jumps.length : 0;
  solution = { inputs: verified.bot.inputs, ticks: verified.bot.inputs.length };
  metrics = {
    platforms: platforms.length,
    jumps: jumps.length,
    maxDifficulty,
    avgDifficulty: avg,
    // 0–10 rating: hardest jump, typical jump and length all contribute
    rating: Math.min(10, 10 * (0.45 * maxDifficulty + 0.35 * avg + 0.2 * Math.min(1, jumps.length / 16))),
    parTime: solution.ticks * DT,
    routeShare: visited.size / platforms.length,
    maxRise: Math.max(0, ...jumps.map(e => e.dh)),
  };
  return result();
}

/**
 * Simulate a single move in the real physics: stand in the middle of platform
 * `fromIndex`, then walk/jump to `toIndex` the way the bot does. True if the
 * player ends up standing on `toIndex`.
 */
export function simulateMove(level, fromIndex, toIndex) {
  const from = level.platforms[fromIndex], to = level.platforms[toIndex];
  const start = { x: from.x, y: topOf(from), z: from.z };
  const probe = { ...level, spawn: start, goal: { x: 1e9, y: -1e9, z: 1e9, radius: 0 } };
  const bot = new Bot(probe);
  if (!bot.settle() || !standingOn(bot.player, from)) return false;
  return bot.traverse(from, to, analyzeJump(from, to).kind);
}

/** Replay a recorded solution; returns true if it reaches the goal (determinism check). */
export function replaySolution(level, inputs) {
  const player = createPlayer(level.spawn);
  for (const n of inputs) {
    if (stepPlayer(player, level, decodeInput(n), DT) === 'goal') return true;
  }
  return false;
}

/** Human-readable one-level report. */
export function formatAudit(name, audit) {
  const lines = [];
  const status = audit.ok ? (audit.warnings.length ? 'PASS (warnings)' : 'PASS') : 'FAIL';
  lines.push(`${status.padEnd(15)} ${name}`);
  if (audit.metrics) {
    const m = audit.metrics;
    lines.push(`  rating ${m.rating.toFixed(1)}/10 · ${m.jumps} jumps · hardest ${(m.maxDifficulty * 100).toFixed(0)}% · par ${m.parTime.toFixed(1)}s · ${m.platforms} platforms`);
  }
  for (const e of audit.errors) lines.push(`  ✗ ${e.code}: ${e.message}`);
  for (const w of audit.warnings) lines.push(`  ! ${w.code}: ${w.message}`);
  return lines.join('\n');
}
