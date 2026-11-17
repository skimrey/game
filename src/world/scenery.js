/**
 * Scenery — decorative, non-physical set dressing for a level.
 *
 * Everything here is visual only: the physics never sees it. That makes it
 * dangerous for gameplay quality (decoration can hide the player, block the
 * route visually, or *look* like a platform you can land on), so placement is
 * constrained by the same rules `auditScenery` enforces:
 *
 *   SCENERY_COLLIDES   no decoration intersects a platform (except its own underside)
 *   SCENERY_IN_PATH    nothing inside the corridor the player actually moves through
 *   SCENERY_OCCLUDES   nothing between the chase camera and the player along the route
 *   FAKE_PLATFORM      no flat-topped decoration above the kill plane within jump/drop reach
 *   SURFACE_DETAIL     details on platforms stay tiny (≤ 0.25 tall) and off the goal
 *   GROUND_TOO_HIGH    the distant floor sits below the kill plane (you never "land" on it)
 *
 * Kinds of decoration:
 *   surface   tiny details on platform tops (grass tufts, pebbles, crystals)
 *   underside rock/earth hanging below each platform ("floating island" look)
 *   near      floating islands, clouds and props around the course
 *   backdrop  large features on the distant ground (trees, mesas, spires, ruins)
 */
import { PLAYER, createPlayer, stepPlayer } from './physics.js';
import { analyzeJump, topOf, decodeInput, DT, ticksToLand, ENVELOPE, dashReach } from '../levels/audit.js';
import { mulberry32, hashSeed } from '../levels/generator.js';
import { chaseCamera } from '../engine/camera.js';
import { Config } from '../engine/config.js';

export const SCENERY_RULES = {
  PLATFORM_CLEARANCE: 0.3,
  CORRIDOR_PAD: [0.45, 0.35],          // horizontal, vertical padding around the player box
  SURFACE_MAX_HEIGHT: 0.25,
  FAKE_PLATFORM_MIN_SIZE: 0.5,        // smaller tops don't read as somewhere to stand
  FAKE_PLATFORM_DASH_REACH: 1.25,     // …or under 1.25× what a jump + air dash can reach
  FAKE_PLATFORM_REACH: 1.75,          // anything under 1.75× the physical jump limit still "looks reachable"
  GROUND_BELOW_KILL: 2,
  BACKDROP_CLEAR_ZONE: [12, 16],       // backdrop keeps this far (horizontal, below) from the course
  BUDGET: 3000,
};

const KILL_Y = Config.PLAYER_FALL_THRESHOLD;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
/** Axis-aligned bounds of a (possibly Y-rotated) box. */
export function boundsOf(b) {
  const c = Math.abs(Math.cos(b.rotY || 0)), s = Math.abs(Math.sin(b.rotY || 0));
  const hx = (c * b.size[0] + s * b.size[2]) / 2, hz = (s * b.size[0] + c * b.size[2]) / 2, hy = b.size[1] / 2;
  return { x0: b.center[0] - hx, x1: b.center[0] + hx, y0: b.center[1] - hy, y1: b.center[1] + hy, z0: b.center[2] - hz, z1: b.center[2] + hz };
}

function platformBounds(p, pad = 0) {
  return {
    x0: p.x - p.width / 2 - pad, x1: p.x + p.width / 2 + pad,
    y0: p.y - p.height / 2 - pad, y1: p.y + p.height / 2 + pad,
    z0: p.z - p.depth / 2 - pad, z1: p.z + p.depth / 2 + pad,
  };
}

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;

/** Does segment p→q pass through box b? (allocation-free slab test) */
function slab(p, d, lo, hi, range) {
  if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
  let a = (lo - p) / d, c = (hi - p) / d;
  if (a > c) { const t = a; a = c; c = t; }
  if (a > range.t0) range.t0 = a;
  if (c < range.t1) range.t1 = c;
  return range.t0 <= range.t1;
}
const range = { t0: 0, t1: 1 };
function segmentHits(seg, b) {
  // quick reject on the segment's own bounds
  if (seg.x1 < b.x0 || seg.x0 > b.x1 || seg.y1 < b.y0 || seg.y0 > b.y1 || seg.z1 < b.z0 || seg.z0 > b.z1) return false;
  const [p, q] = seg.points;
  range.t0 = 0; range.t1 = 1;
  return slab(p[0], q[0] - p[0], b.x0, b.x1, range) &&
    slab(p[1], q[1] - p[1], b.y0, b.y1, range) &&
    slab(p[2], q[2] - p[2], b.z0, b.z1, range);
}

// ---------------------------------------------------------------------------
// Route samples (where the player will be, and where the camera will be)
// ---------------------------------------------------------------------------
/**
 * Sample the bot's verified route: player positions (for the corridor) and
 * camera→player sight lines (for occlusion). Falls back to platform tops.
 */
export function routeSamples(level, audit, every = 4) {
  const positions = [];
  if (audit?.solution) {
    const p = createPlayer(level.spawn);
    audit.solution.inputs.forEach((n, i) => {
      stepPlayer(p, level, decodeInput(n), DT);
      if (i % every === 0) positions.push({ x: p.x, y: p.y, z: p.z });
    });
  }
  for (const p of level.platforms) positions.push({ x: p.x, y: topOf(p), z: p.z });
  positions.push({ x: level.spawn.x, y: level.spawn.y, z: level.spawn.z });
  const [ph, pv] = SCENERY_RULES.CORRIDOR_PAD;
  const corridor = positions.map(p => ({
    x0: p.x - PLAYER.halfWidth - ph, x1: p.x + PLAYER.halfWidth + ph,
    y0: p.y - pv, y1: p.y + PLAYER.height + pv,
    z0: p.z - PLAYER.halfWidth - ph, z1: p.z + PLAYER.halfWidth + ph,
  }));
  // The player may stand anywhere on a platform, not just where the bot went.
  for (const p of level.platforms) {
    corridor.push({
      x0: p.x - p.width / 2 - PLAYER.halfWidth, x1: p.x + p.width / 2 + PLAYER.halfWidth,
      y0: topOf(p), y1: topOf(p) + PLAYER.height + pv,
      z0: p.z - p.depth / 2 - PLAYER.halfWidth, z1: p.z + p.depth / 2 + PLAYER.halfWidth,
    });
  }
  const sightLines = positions.filter((_, i) => i % 2 === 0).map(p => {
    const eye = chaseCamera(p).eye, target = [p.x, p.y + 0.9, p.z];
    return {
      points: [eye, target],
      x0: Math.min(eye[0], target[0]), x1: Math.max(eye[0], target[0]),
      y0: Math.min(eye[1], target[1]), y1: Math.max(eye[1], target[1]),
      z0: Math.min(eye[2], target[2]), z1: Math.max(eye[2], target[2]),
    };
  });
  return { positions, corridor, sightLines };
}

/** Furthest horizontal distance any jump in this level could carry the player (falling to the kill plane). */
function maxReach(level) {
  const highest = Math.max(...level.platforms.map(topOf));
  const ticks = ticksToLand(KILL_Y - highest) || 0;
  const basic = ticks * ENVELOPE.stepDistance;
  const dash = (dashReach(KILL_Y - highest) || 0) * SCENERY_RULES.FAKE_PLATFORM_DASH_REACH;
  return Math.max(basic * SCENERY_RULES.FAKE_PLATFORM_REACH, dash) + 2 * PLAYER.halfWidth + 0.5;
}

// ---------------------------------------------------------------------------
// Rules — shared by placement and the audit
// ---------------------------------------------------------------------------
function looksStandable(b) {
  if (b.kind === 'surface' || b.kind === 'underside') return false;
  return Math.min(b.size[0], b.size[2]) >= SCENERY_RULES.FAKE_PLATFORM_MIN_SIZE;
}

/** Returns the list of rule codes a single decoration box violates. */
function boxViolations(b, ctx) {
  const out = [];
  const bb = boundsOf(b);
  const { level, samples } = ctx;

  if (b.kind === 'surface') {
    const host = level.platforms[b.host];
    const r = platformBounds(host);
    const onTop = host && Math.abs(bb.y0 - topOf(host)) < 0.02 && bb.x0 >= r.x0 - 1e-6 && bb.x1 <= r.x1 + 1e-6 && bb.z0 >= r.z0 - 1e-6 && bb.z1 <= r.z1 + 1e-6;
    const nearGoal = Math.hypot(b.center[0] - level.goal.x, b.center[2] - level.goal.z) < level.goal.radius + 0.3;
    if (b.size[1] > SCENERY_RULES.SURFACE_MAX_HEIGHT || !onTop || nearGoal) out.push('SURFACE_DETAIL');
    return out;
  }

  level.platforms.forEach((p, i) => {
    if (b.kind === 'underside' && i === b.host) {
      if (bb.y1 > p.y - p.height / 2 + 0.01) out.push('SCENERY_COLLIDES');
    } else if (overlaps(bb, platformBounds(p, SCENERY_RULES.PLATFORM_CLEARANCE))) {
      out.push('SCENERY_COLLIDES');
    }
  });
  if (samples.corridor.some(c => overlaps(bb, c))) out.push('SCENERY_IN_PATH');
  if (samples.sightLines.some(seg => segmentHits(seg, bb))) out.push('SCENERY_OCCLUDES');
  if (looksStandable(b) && bb.y1 > KILL_Y) {
    const asPlatform = { x: b.center[0], y: bb.y1 - 0.5, z: b.center[2], width: bb.x1 - bb.x0, height: 1, depth: bb.z1 - bb.z0 };
    const fake = level.platforms.some(p => {
      // cheap pre-filter: even a fall to the kill plane can't carry the player this far
      const gx = Math.max(0, bb.x0 - (p.x + p.width / 2), (p.x - p.width / 2) - bb.x1);
      const gz = Math.max(0, bb.z0 - (p.z + p.depth / 2), (p.z - p.depth / 2) - bb.z1);
      if (Math.hypot(gx, gz) > ctx.maxReach) return false;
      return analyzeJump(p, asPlatform).difficulty <= SCENERY_RULES.FAKE_PLATFORM_REACH ||
        analyzeJump(p, asPlatform, { moves: 'dash' }).difficulty <= SCENERY_RULES.FAKE_PLATFORM_DASH_REACH;
    });
    if (fake) out.push('FAKE_PLATFORM');
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Kits (hand-written decoration builders)
// ---------------------------------------------------------------------------
const shade = (c, k) => c.map(v => Math.min(1, v * k));

function makeRandom(rng) {
  return {
    next: rng,
    range: (lo, hi) => lo + (hi - lo) * rng(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng()),
    pick: list => list[Math.floor(rng() * list.length)],
    chance: p => rng() < p,
  };
}

const B = (kind, center, size, color, extra = {}) => ({ kind, center, size, color, ...extra });

/** Rock hanging below a platform: an inverted stepped pyramid (+ optional drips). */
function underside(p, host, r, { rock, top, drip, dripGlow = 0 }) {
  const boxes = [];
  let y = p.y - p.height / 2;
  const layers = [[0.86, 0.4], [0.62, 0.5], [0.36, 0.55]];
  layers.forEach(([k, h], i) => {
    const w = p.width * k * r.range(0.9, 1), d = p.depth * k * r.range(0.9, 1);
    const ox = (p.width - w) / 2 * r.range(-0.5, 0.5), oz = (p.depth - d) / 2 * r.range(-0.5, 0.5);
    const hh = h * Math.min(1.2, Math.sqrt(p.width * p.depth) / 3);
    boxes.push(B('underside', [p.x + ox, y - hh / 2, p.z + oz], [w, hh, d], i === 0 ? top : shade(rock, 1 - i * 0.1), { host, ...(i >= 2 ? { detail: true } : {}) }));
    y -= hh;
  });
  if (drip) {
    const n = r.int(2, 5);
    for (let i = 0; i < n; i++) {
      const len = r.range(0.25, 0.8);
      boxes.push(B('underside', [p.x + r.range(-0.35, 0.35) * p.width, p.y - p.height / 2 - len / 2 - 0.05, p.z + r.range(-0.35, 0.35) * p.depth],
        [0.07, len, 0.07], drip, { host, glow: dripGlow, detail: true }));
    }
  }
  return boxes;
}

function surfaceDetails(p, host, r, makers, density = 0.55) {
  const area = p.width * p.depth;
  const count = Math.min(14, Math.round(area * density));
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const x = p.x + r.range(-0.5, 0.5) * (p.width - 0.3);
    const z = p.z + r.range(-0.5, 0.5) * (p.depth - 0.3);
    boxes.push(...r.pick(makers)(x, topOf(p), z, r).map(b => ({ ...b, kind: 'surface', host })));
  }
  return boxes;
}

// small surface makers: (x, top, z, r) -> boxes (kind set by caller)
const tuft = (x, y, z, r) => {
  const c = r.pick([[0.3, 0.58, 0.2], [0.38, 0.66, 0.25], [0.26, 0.5, 0.18]]);
  return [B('', [x, y + 0.06, z], [0.08, 0.12, 0.08], c), B('', [x + 0.06, y + 0.045, z + 0.02], [0.06, 0.09, 0.06], shade(c, 1.1))];
};
const flower = (x, y, z, r) => [
  B('', [x, y + 0.08, z], [0.03, 0.16, 0.03], [0.3, 0.55, 0.2]),
  B('', [x, y + 0.18, z], [0.09, 0.06, 0.09], r.pick([[1, 0.95, 0.95], [1, 0.85, 0.3], [0.95, 0.5, 0.7], [0.6, 0.6, 1]])),
];
const pebble = color => (x, y, z, r) => {
  const s = r.range(0.08, 0.16);
  return [B('', [x, y + s / 4, z], [s, s / 2, s * 0.8], shade(color, r.range(0.85, 1.1)), { rotY: r.range(0, 3) })];
};
const shrub = (x, y, z, r) => [B('', [x, y + 0.07, z], [0.16, 0.14, 0.14], [0.55, 0.45, 0.25], { rotY: r.range(0, 3) })];
const sprout = (x, y, z) => [B('', [x, y + 0.11, z], [0.09, 0.22, 0.09], [0.3, 0.55, 0.3])];
const snowLump = (x, y, z, r) => [B('', [x, y + 0.03, z], [r.range(0.2, 0.4), 0.06, r.range(0.15, 0.3)], [0.95, 0.96, 1], { rotY: r.range(0, 3) })];
const shard = (x, y, z, r) => [B('', [x, y + 0.1, z], [0.07, 0.2, 0.07], r.pick([[0.5, 0.9, 1], [0.8, 0.6, 1]]), { glow: 0.9, rotY: r.range(0, 3) })];

// larger props: (x, groundY, z, r, scale) -> boxes
function tree(x, y, z, r, s = 1, leaves = [0.3, 0.6, 0.26]) {
  const trunkH = 1.6 * s;
  const out = [B('', [x, y + trunkH / 2, z], [0.35 * s, trunkH, 0.35 * s], [0.45, 0.3, 0.18])];
  const c1 = shade(leaves, r.range(0.9, 1.1));
  out.push(B('', [x, y + trunkH + 0.6 * s, z], [1.5 * s, 1.2 * s, 1.5 * s], c1, { rotY: r.range(0, 1.5) }));
  out.push(B('', [x, y + trunkH + 1.5 * s, z], [1 * s, 0.8 * s, 1 * s], shade(c1, 1.12), { rotY: r.range(0, 1.5) }));
  return out;
}

function pine(x, y, z, r, s = 1, snow = true) {
  const out = [B('', [x, y + 0.5 * s, z], [0.3 * s, s, 0.3 * s], [0.4, 0.27, 0.18])];
  const green = [0.16, 0.36, 0.28];
  [[1.7, 0.9], [1.3, 0.8], [0.9, 0.7], [0.5, 0.6]].forEach(([w, h], i) => {
    const cy = y + s * (1 + i * 0.7 + h / 2);
    out.push(B('', [x, cy, z], [w * s, h * s, w * s], shade(green, 1 + i * 0.06), { rotY: i * 0.4 }));
    if (snow) out.push(B('', [x, cy + h * s / 2 + 0.03 * s, z], [w * s * 0.75, 0.06 * s, w * s * 0.75], [0.94, 0.95, 1], { rotY: i * 0.4 }));
  });
  return out;
}

function cactus(x, y, z, r, s = 1) {
  const green = [0.33, 0.55, 0.3];
  const h = 2.4 * s;
  const out = [B('', [x, y + h / 2, z], [0.45 * s, h, 0.45 * s], green)];
  for (const side of [-1, 1]) {
    if (!r.chance(0.75)) continue;
    const ay = y + h * r.range(0.35, 0.55), len = 0.55 * s;
    out.push(B('', [x + side * (0.22 + len / 2) * s, ay, z], [len * s, 0.3 * s, 0.3 * s], shade(green, 0.95)));
    out.push(B('', [x + side * (0.22 + len) * s, ay + 0.4 * s, z], [0.3 * s, 0.8 * s, 0.3 * s], shade(green, 1.05)));
  }
  return out;
}

function mesa(x, y, z, r, height, width) {
  const bands = [[0.78, 0.42, 0.28], [0.86, 0.55, 0.36], [0.72, 0.36, 0.24], [0.9, 0.66, 0.45]];
  const out = [];
  let cy = y, w = width, d = width * r.range(0.7, 1.2);
  const layers = r.int(3, 5);
  for (let i = 0; i < layers; i++) {
    const h = height / layers;
    out.push(B('', [x, cy + h / 2, z], [w, h, d], r.pick(bands), { rotY: 0 }));
    cy += h;
    w *= r.range(0.78, 0.95);
    d *= r.range(0.78, 0.95);
  }
  return out;
}

function spire(x, y, z, r, height, width) {
  const rock = [0.42, 0.4, 0.48];
  const out = [];
  let cy = y, w = width;
  const segs = r.int(3, 5);
  for (let i = 0; i < segs; i++) {
    const h = height / segs;
    out.push(B('', [x + r.range(-0.3, 0.3) * w * 0.2, cy + h / 2, z], [w, h, w * r.range(0.8, 1.1)], shade(rock, 1 + i * 0.05), { rotY: r.range(0, 1) }));
    cy += h;
    w *= r.range(0.65, 0.82);
  }
  out.push(B('', [x, cy + 0.35, z], [w * 1.25, 0.7, w * 1.25], [0.95, 0.96, 1]));
  return out;
}

function cloudPuff(x, y, z, r, s, color) {
  const out = [B('', [x, y, z], [4 * s, 1 * s, 2.5 * s], color)];
  out.push(B('', [x + r.range(-1, 1) * s, y + 0.6 * s, z + r.range(-0.5, 0.5) * s], [2.2 * s, 1 * s, 1.8 * s], shade(color, 1.03)));
  out.push(B('', [x + r.range(1, 2) * s, y - 0.1 * s, z], [2 * s, 0.8 * s, 1.6 * s], shade(color, 0.97)));
  return out;
}

function island(x, y, z, r, s, { top, rock, prop }) {
  const out = [];
  const w = r.range(2, 3.4) * s, d = r.range(2, 3.2) * s;
  out.push(B('', [x, y - 0.25 * s, z], [w, 0.5 * s, d], top));
  out.push(B('', [x, y - 0.85 * s, z], [w * 0.7, 0.7 * s, d * 0.7], rock));
  out.push(B('', [x, y - 1.5 * s, z], [w * 0.38, 0.6 * s, d * 0.38], shade(rock, 0.9)));
  if (prop) out.push(...prop(x, y, z, r, s));
  return out;
}

function column(x, y, z, r, h, broken = true) {
  const marble = [0.78, 0.82, 0.95];
  const w = Math.max(0.55, h * 0.22);
  const out = [B('', [x, y + 0.15, z], [w * 1.5, 0.3, w * 1.5], shade(marble, 0.9))];
  const hh = broken ? h * r.range(0.4, 1) : h;
  out.push(B('', [x, y + 0.3 + hh / 2, z], [w, hh, w], marble));
  if (!broken || r.chance(0.3)) out.push(B('', [x, y + 0.3 + hh + 0.15, z], [w * 1.5, 0.3, w * 1.5], shade(marble, 0.95)));
  return out;
}

function crystalCluster(x, y, z, r, s, glow = 0.85) {
  const out = [];
  const colors = [[0.45, 0.9, 1], [0.75, 0.55, 1], [0.5, 1, 0.8]];
  const c = r.pick(colors);
  for (let i = 0; i < r.int(3, 5); i++) {
    const h = r.range(0.8, 2.2) * s;
    out.push(B('', [x + r.range(-0.5, 0.5) * s, y + h / 2, z + r.range(-0.5, 0.5) * s], [0.35 * s, h, 0.35 * s], c, { glow, rotY: r.range(0, 3) }));
  }
  return out;
}

function lantern(x, y, z, r) {
  return [
    B('', [x, y + 0.9, z], [0.1, 1.8, 0.1], [0.3, 0.3, 0.35]),
    B('', [x, y + 1.95, z], [0.32, 0.36, 0.32], [1, 0.8, 0.45], { glow: 1 }),
  ];
}

function cottage(x, y, z, r, s) {
  const wall = r.pick([[0.95, 0.92, 0.85], [0.92, 0.85, 0.72]]);
  const roof = r.pick([[0.75, 0.25, 0.2], [0.35, 0.4, 0.6], [0.55, 0.35, 0.2]]);
  return [
    B('', [x, y + 1.2 * s, z], [3 * s, 2.4 * s, 2.4 * s], wall),
    B('', [x, y + 2.7 * s, z], [3.3 * s, 0.6 * s, 2.7 * s], roof),
    B('', [x, y + 3.2 * s, z], [2.4 * s, 0.5 * s, 1.8 * s], shade(roof, 1.1)),
    B('', [x + 0.7 * s, y + 3.4 * s, z + 0.4 * s], [0.4 * s, 1 * s, 0.4 * s], [0.5, 0.45, 0.45]),
  ];
}

// --- zone props (lagoon, grove, volcano, crystal) -----------------------------------
const shell = (x, y, z, r) => [B('', [x, y + 0.03, z], [0.1, 0.06, 0.08], r.pick([[1, 0.82, 0.82], [0.98, 0.94, 0.9], [1, 0.72, 0.6]]), { rotY: r.range(0, 3) })];
const starfish = (x, y, z, r) => {
  const c = r.pick([[0.95, 0.45, 0.3], [0.98, 0.6, 0.35]]), a = r.range(0, 3);
  return [B('', [x, y + 0.015, z], [0.22, 0.03, 0.06], c, { rotY: a }), B('', [x, y + 0.016, z], [0.22, 0.03, 0.06], c, { rotY: a + 1.26 }), B('', [x, y + 0.017, z], [0.22, 0.03, 0.06], c, { rotY: a + 2.51 })];
};
const toadstool = (x, y, z, r) => {
  const cap = r.pick([[0.9, 0.22, 0.22], [0.95, 0.65, 0.2], [0.7, 0.42, 0.9]]);
  return [B('', [x, y + 0.06, z], [0.05, 0.12, 0.05], [0.95, 0.92, 0.85]), B('', [x, y + 0.14, z], [0.16, 0.06, 0.16], cap), B('', [x + 0.03, y + 0.175, z], [0.03, 0.015, 0.03], [1, 1, 1])];
};
const glowSpore = (x, y, z, r) => [B('', [x, y + 0.05, z], [0.05, 0.05, 0.05], r.pick([[0.55, 1, 0.75], [0.5, 0.9, 1]]), { glow: 1 })];
const ember = (x, y, z, r) => [B('', [x, y + 0.02, z], [r.range(0.06, 0.12), 0.04, r.range(0.06, 0.12)], [1, 0.5, 0.15], { glow: 1, rotY: r.range(0, 3) })];
const obsidianChip = (x, y, z, r) => [B('', [x, y + 0.07, z], [0.08, 0.14, 0.06], [0.12, 0.1, 0.16], { rotY: r.range(0, 3) })];

function palm(x, y, z, r, s = 1) {
  const out = [];
  const lean = r.range(-0.25, 0.25) * s, segs = 5, h = 3.2 * s;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    out.push(B('', [x + lean * t * t * 3, y + h * (t + 0.1), z], [0.32 * s * (1 - t * 0.25), h / segs + 0.05, 0.32 * s * (1 - t * 0.25)], shade([0.62, 0.46, 0.3], i % 2 ? 0.9 : 1.05)));
  }
  const tx = x + lean * 3, ty = y + h * 1.08;
  const leaf = [0.26, 0.62, 0.3];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r.range(0, 0.4);
    out.push(B('', [tx + Math.cos(a) * 0.85 * s, ty - 0.18 * s, z + Math.sin(a) * 0.85 * s], [1.8 * s, 0.1 * s, 0.42 * s], shade(leaf, r.range(0.85, 1.1)), { rotY: -a }));
  }
  out.push(B('', [tx, ty - 0.25 * s, z], [0.34 * s, 0.3 * s, 0.34 * s], [0.42, 0.3, 0.18]));   // coconuts
  return out;
}

function sailboat(x, y, z, r, s = 1) {
  const hull = r.pick([[0.85, 0.3, 0.25], [0.25, 0.45, 0.8], [0.95, 0.85, 0.55]]);
  return [
    B('', [x, y + 0.3 * s, z], [1.2 * s, 0.6 * s, 3.2 * s], hull),
    B('', [x, y + 0.62 * s, z], [1 * s, 0.08 * s, 2.8 * s], [0.75, 0.58, 0.38]),
    B('', [x, y + 2.2 * s, z], [0.12 * s, 3.2 * s, 0.12 * s], [0.5, 0.38, 0.26]),
    B('', [x + 0.05 * s, y + 2.3 * s, z - 0.7 * s], [0.05 * s, 2.6 * s, 1.4 * s], [0.98, 0.97, 0.93]),
  ];
}

function lighthouse(x, y, z, r, s = 1) {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(B('', [x, y + (i + 0.5) * 1.2 * s, z], [(1.8 - i * 0.12) * s, 1.2 * s, (1.8 - i * 0.12) * s], i % 2 ? [0.95, 0.95, 0.95] : [0.85, 0.2, 0.2]));
  out.push(B('', [x, y + 7.6 * s, z], [1.1 * s, 0.8 * s, 1.1 * s], [1, 0.92, 0.6], { glow: 1 }));
  out.push(B('', [x, y + 8.2 * s, z], [1.3 * s, 0.4 * s, 1.3 * s], [0.2, 0.22, 0.28]));
  return out;
}

function bigMushroom(x, y, z, r, s = 1, glow = 0.4) {
  const stemH = r.range(1.6, 3) * s;
  const cap = r.pick([[0.85, 0.22, 0.28], [0.62, 0.35, 0.85], [0.95, 0.6, 0.2], [0.25, 0.7, 0.75]]);
  const w = r.range(1.8, 2.8) * s;
  const out = [
    B('', [x, y + stemH / 2, z], [0.5 * s, stemH, 0.5 * s], [0.92, 0.88, 0.78]),
    B('', [x, y + stemH + 0.2 * s, z], [w, 0.4 * s, w], cap, { rotY: r.range(0, 1.5) }),
    B('', [x, y + stemH + 0.55 * s, z], [w * 0.7, 0.35 * s, w * 0.7], shade(cap, 1.12), { rotY: r.range(0, 1.5) }),
    B('', [x, y + stemH - 0.02, z], [w * 0.8, 0.06, w * 0.8], [0.7, 1, 0.85], { glow }),                          // glowing gills
  ];
  for (let k = 0; k < 4; k++) {
    const a = r.range(0, Math.PI * 2), d = w * r.range(0.15, 0.32);
    out.push(B('', [x + Math.cos(a) * d, y + stemH + 0.43 * s, z + Math.sin(a) * d], [0.22 * s, 0.06, 0.22 * s], [1, 0.98, 0.92]));
  }
  return out;
}

function fireflies(x, y, z, r) {
  const out = [];
  for (let i = 0; i < r.int(5, 9); i++) out.push(B('', [x + r.range(-2, 2), y + r.range(-1, 1.5), z + r.range(-2, 2)], [0.09, 0.09, 0.09], r.pick([[0.8, 1, 0.4], [0.5, 1, 0.8]]), { glow: 1 }));
  return out;
}

function trunk(x, y, z, r, s = 1) {
  const h = r.range(10, 18) * s;
  return [
    B('', [x, y + h / 2, z], [1.4 * s, h, 1.4 * s], [0.24, 0.18, 0.16]),
    B('', [x, y + h + 0.8 * s, z], [5 * s, 1.6 * s, 5 * s], [0.14, 0.26, 0.22]),
    B('', [x, y + h + 2 * s, z], [3.4 * s, 1.2 * s, 3.4 * s], [0.16, 0.3, 0.24]),
  ];
}

function volcanoCone(x, y, z, r, height, width) {
  const rock = [0.28, 0.2, 0.2];
  const out = [];
  const layers = r.int(4, 6);
  let cy = y, w = width;
  for (let i = 0; i < layers; i++) {
    const h = height / layers;
    out.push(B('', [x, cy + h / 2, z], [w, h, w * r.range(0.85, 1.1)], shade(rock, 1 - i * 0.06), { rotY: r.range(0, 0.6) }));
    cy += h;
    w *= 0.72;
  }
  out.push(B('', [x, cy - 0.2, z], [w * 0.9, 0.5, w * 0.9], [1, 0.45, 0.12], { glow: 1 }));                       // the glowing crater
  for (let k = 0; k < r.int(1, 3); k++) {                                                                          // lava streaks
    const a = r.range(0, Math.PI * 2), len = height * r.range(0.3, 0.6);
    out.push(B('', [x + Math.cos(a) * width * 0.28, cy - len / 2, z + Math.sin(a) * width * 0.28], [0.5, len, 0.5], [1, 0.4, 0.1], { glow: 1 }));
  }
  for (let k = 0; k < 3; k++) out.push(B('', [x + r.range(-1, 1), cy + 2 + k * 2.4, z + r.range(-1, 1)], [w * (1 + k * 0.5), 1.6, w * (1 + k * 0.5)], shade([0.24, 0.2, 0.22], 1 + k * 0.12), { rotY: r.range(0, 1.5) }));  // smoke
  return out;
}

function obsidianSpire(x, y, z, r, height, width) {
  const out = [];
  let cy = y, w = width;
  for (let i = 0; i < 3; i++) {
    const h = height / 3;
    out.push(B('', [x, cy + h / 2, z], [w, h, w * 0.7], [0.1, 0.08, 0.14], { rotY: r.range(0, 3) }));
    cy += h; w *= 0.6;
  }
  return out;
}

function lavaFall(x, y, z, r, h) {
  return [B('', [x, y - h / 2, z], [0.6, h, 0.3], [1, 0.5, 0.12], { glow: 1 }), B('', [x, y - h - 0.2, z], [1.6, 0.4, 1.2], [1, 0.6, 0.2], { glow: 1 })];
}

function stalactite(x, y, z, r, s = 1) {
  const out = [];
  let cy = y, w = r.range(0.8, 1.4) * s;
  for (let i = 0; i < 4; i++) {
    const h = r.range(0.6, 1.2) * s;
    out.push(B('', [x, cy - h / 2, z], [w, h, w], shade([0.36, 0.22, 0.5], 1 - i * 0.05), { rotY: r.range(0, 3) }));
    cy -= h; w *= 0.62;
  }
  out.push(B('', [x, cy - 0.15, z], [w, 0.3, w], [0.75, 0.55, 1], { glow: 0.9 }));
  return out;
}

/**
 * Per-biome kits. Each returns:
 *   underside(p, i, r), surface(p, i, r), near: [{ weight, make(x, y, z, r) }],
 *   backdrop(area, r, place) — places large features on/around the distant ground.
 */
const KITS = {
  meadow: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.5, 0.36, 0.24], top: [0.45, 0.32, 0.2], drip: [0.36, 0.26, 0.16] }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [tuft, tuft, flower, pebble([0.6, 0.6, 0.6])]),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.36, 0.6, 0.26], rock: [0.5, 0.36, 0.24], prop: (px, py, pz, rr, s) => tree(px, py, pz, rr, s * 0.8) }) },
      { weight: 2, above: true, make: (x, y, z, r) => cloudPuff(x, y, z, r, r.range(0.8, 1.5), [1, 1, 1]) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 110; i++) place(() => tree(r.range(area.x0, area.x1), area.groundY, r.range(area.z0, area.z1), r, r.range(1.6, 3)));
      for (let i = 0; i < 12; i++) place(() => cottage(r.range(area.x0, area.x1), area.groundY, r.range(area.z0, area.z1), r, r.range(1, 1.5)));
      for (let i = 0; i < 14; i++) {
        place(() => {
          const w = r.range(14, 30), d = r.range(14, 30), h = r.range(1, 2.5);
          return [B('', [r.range(area.x0, area.x1), area.groundY + h / 2, r.range(area.z0, area.z1)], [w, h, d], r.pick([[0.4, 0.62, 0.3], [0.5, 0.66, 0.32]]), { rotY: r.range(0, 1.5) })];
        });
      }
      const riverX = r.range(-30, 30);
      place(() => [B('', [riverX, area.groundY + 0.05, (area.z0 + area.z1) / 2], [6, 0.1, area.z1 - area.z0], [0.35, 0.6, 0.85], { rotY: 0.15, glow: 0.15 })]);
      for (let i = 0; i < 14; i++) place(() => cloudPuff(r.range(area.x0, area.x1), r.range(-20, -15), r.range(area.z0, area.z1), r, r.range(1.5, 3), [1, 1, 1]));
    },
  },

  canyon: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.76, 0.45, 0.3], top: [0.82, 0.52, 0.34], drip: null }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [pebble([0.7, 0.5, 0.35]), shrub, sprout, pebble([0.85, 0.7, 0.5])], 0.4),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.88, 0.62, 0.42], rock: [0.78, 0.46, 0.3], prop: (px, py, pz, rr, s) => cactus(px, py, pz, rr, s * 0.7) }) },
      { weight: 1, make: (x, y, z, r) => mesa(x, y - 6, z, r, 6, r.range(2, 3)) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 34; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        const x = side * r.range(18, 70), h = r.range(14, 34);
        place(() => mesa(x, area.groundY, r.range(area.z0, area.z1), r, h, r.range(6, 16)));
      }
      for (let i = 0; i < 50; i++) place(() => cactus(r.range(area.x0, area.x1), area.groundY, r.range(area.z0, area.z1), r, r.range(1.5, 3)));
      for (let i = 0; i < 30; i++) {
        place(() => {
          const s = r.range(1, 4);
          return [B('', [r.range(area.x0, area.x1), area.groundY + s / 2, r.range(area.z0, area.z1)], [s * 1.3, s, s], [0.68, 0.45, 0.32], { rotY: r.range(0, 3) })];
        });
      }
    },
  },

  alpine: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.45, 0.44, 0.5], top: [0.5, 0.5, 0.56], drip: [0.85, 0.92, 1] }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [snowLump, snowLump, pebble([0.5, 0.5, 0.56])], 0.4),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.9, 0.92, 0.97], rock: [0.45, 0.44, 0.5], prop: (px, py, pz, rr, s) => pine(px, py, pz, rr, s * 0.7) }) },
      { weight: 1, above: true, make: (x, y, z, r) => cloudPuff(x, y, z, r, r.range(1, 1.6), [1, 0.82, 0.78]) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 30; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        place(() => spire(side * r.range(16, 70), area.groundY - 14, r.range(area.z0, area.z1), r, r.range(18, 36), r.range(5, 10)));
      }
      for (let i = 0; i < 40; i++) place(() => cloudPuff(r.range(area.x0, area.x1), area.groundY + r.range(0, 1), r.range(area.z0, area.z1), r, r.range(2, 4), [1, 0.86, 0.84]));
      for (let i = 0; i < 24; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        place(() => pine(side * r.range(22, 60), area.groundY + 0.5, r.range(area.z0, area.z1), r, r.range(1.5, 2.5)));
      }
    },
  },

  lagoon: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.78, 0.68, 0.56], top: [0.86, 0.76, 0.6], drip: [0.25, 0.55, 0.35] }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [shell, shell, starfish, pebble([0.8, 0.75, 0.68])], 0.35),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.92, 0.84, 0.64], rock: [0.78, 0.68, 0.56], prop: (px, py, pz, rr, s) => palm(px, py, pz, rr, s * 0.7) }) },
      { weight: 2, above: true, make: (x, y, z, r) => cloudPuff(x, y, z, r, r.range(0.8, 1.4), [1, 1, 1]) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 26; i++) {                                     // sandy islets with palms
        place(() => {
          const x = r.range(area.x0, area.x1), z = r.range(area.z0, area.z1), w = r.range(6, 14);
          return [B('', [x, area.groundY + 0.4, z], [w, 0.8, w * r.range(0.6, 1.2)], [0.92, 0.84, 0.64], { rotY: r.range(0, 1.5) }), ...palm(x, area.groundY + 0.8, z, r, r.range(1.4, 2.4))];
        });
      }
      for (let i = 0; i < 18; i++) place(() => sailboat(r.range(area.x0, area.x1), area.groundY, r.range(area.z0, area.z1), r, r.range(1.4, 2.4)));
      for (let i = 0; i < 30; i++) place(() => palm(r.range(area.x0, area.x1), area.groundY, r.range(area.z0, area.z1), r, r.range(1.5, 2.6)));
      place(() => lighthouse(r.chance(0.5) ? -40 : 40, area.groundY, r.range(area.z0 + 30, area.z1), r, 2));
      for (let i = 0; i < 10; i++) place(() => cloudPuff(r.range(area.x0, area.x1), r.range(-12, -8), r.range(area.z0, area.z1), r, r.range(1.5, 3), [1, 1, 1]));
    },
  },

  grove: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.3, 0.22, 0.18], top: [0.24, 0.36, 0.26], drip: [0.45, 1, 0.8], dripGlow: 0.8 }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [toadstool, toadstool, glowSpore, tuft], 0.45),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.22, 0.4, 0.3], rock: [0.3, 0.22, 0.18], prop: (px, py, pz, rr, s) => bigMushroom(px, py, pz, rr, s * 0.8) }) },
      { weight: 2, above: true, make: (x, y, z, r) => fireflies(x, y, z, r) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 60; i++) place(() => bigMushroom(r.range(area.x0, area.x1), area.groundY, r.range(area.z0, area.z1), r, r.range(2, 4.5), 0.8));
      for (let i = 0; i < 26; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        place(() => trunk(side * r.range(18, 70), area.groundY, r.range(area.z0, area.z1), r, r.range(1.2, 2)));
      }
      for (let i = 0; i < 30; i++) place(() => fireflies(r.range(area.x0, area.x1), area.groundY + r.range(3, 9), r.range(area.z0, area.z1), r));
    },
  },

  volcano: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.22, 0.18, 0.19], top: [0.3, 0.24, 0.24], drip: [1, 0.45, 0.12], dripGlow: 1 }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [ember, obsidianChip, pebble([0.35, 0.3, 0.3]), ember], 0.35),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.3, 0.25, 0.25], rock: [0.2, 0.16, 0.17], prop: (px, py, pz, rr, s) => (rr.chance(0.5) ? obsidianSpire(px, py, pz, rr, 2.4 * s, 0.8 * s) : lavaFall(px, py - 0.3, pz + 1.2 * s, rr, 2.4 * s)) }) },
      { weight: 1, make: (x, y, z, r) => obsidianSpire(x, y - 6, z, r, 7, r.range(1.2, 2)) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 16; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        place(() => volcanoCone(side * r.range(20, 70), area.groundY, r.range(area.z0, area.z1), r, r.range(14, 30), r.range(12, 22)));
      }
      for (let i = 0; i < 40; i++) place(() => obsidianSpire(r.range(area.x0, area.x1), area.groundY, r.range(area.z0, area.z1), r, r.range(4, 12), r.range(1.5, 3)));
      for (let i = 0; i < 20; i++) {
        place(() => {
          const s = r.range(2, 6);
          return [B('', [r.range(area.x0, area.x1), area.groundY + s / 3, r.range(area.z0, area.z1)], [s * 1.6, s * 0.66, s], [0.16, 0.12, 0.13], { rotY: r.range(0, 3) })];
        });
      }
    },
  },

  crystal: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.34, 0.22, 0.46], top: [0.44, 0.32, 0.56], drip: [0.8, 0.6, 1], dripGlow: 0.9 }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [shard, shard, pebble([0.5, 0.38, 0.62])], 0.35),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.5, 0.38, 0.64], rock: [0.34, 0.22, 0.46], prop: (px, py, pz, rr, s) => crystalCluster(px, py, pz, rr, s * 0.8) }) },
      { weight: 2, above: true, make: (x, y, z, r) => stalactite(x, y + 4, z, r, r.range(1, 1.6)) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 30; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        place(() => crystalCluster(side * r.range(16, 70), area.groundY, r.range(area.z0, area.z1), r, r.range(3, 7), 0.7));
      }
      for (let i = 0; i < 24; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        place(() => spire(side * r.range(18, 70), area.groundY - 4, r.range(area.z0, area.z1), r, r.range(10, 26), r.range(3, 7)).map(b => ({ ...b, color: b.color[2] > 0.9 ? [0.8, 0.6, 1] : shade([0.36, 0.24, 0.5], 1 + (b.center[1] - area.groundY) * 0.01), ...(b.color[2] > 0.9 ? { glow: 0.9 } : {}) })));
      }
      for (let i = 0; i < 18; i++) place(() => stalactite(r.range(area.x0, area.x1), r.range(14, 22), r.range(area.z0 + 20, area.z1), r, r.range(3, 6)));
    },
  },

  starlit: {
    underside: (p, i, r) => underside(p, i, r, { rock: [0.22, 0.23, 0.36], top: [0.26, 0.27, 0.42], drip: [0.45, 0.9, 1], dripGlow: 0.9 }),
    surface: (p, i, r) => surfaceDetails(p, i, r, [shard, pebble([0.35, 0.36, 0.55]), shard], 0.35),
    near: [
      { weight: 3, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 1), { top: [0.32, 0.33, 0.52], rock: [0.22, 0.23, 0.36], prop: (px, py, pz, rr, s) => crystalCluster(px, py, pz, rr, s * 0.7) }) },
      { weight: 1, make: (x, y, z, r) => island(x, y, z, r, r.range(0.6, 0.9), { top: [0.32, 0.33, 0.52], rock: [0.22, 0.23, 0.36], prop: (px, py, pz, rr) => lantern(px, py, pz, rr) }) },
    ],
    backdrop(area, r, place) {
      for (let i = 0; i < 28; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        place(() => island(side * r.range(16, 70), r.range(-40, -14), r.range(area.z0, area.z1), r, r.range(2, 4), {
          top: [0.3, 0.31, 0.5], rock: [0.2, 0.21, 0.33],
          prop: (px, py, pz, rr, s) => (rr.chance(0.7) ? crystalCluster(px, py, pz, rr, s, 0.5) : [...column(px - s, py, pz, rr, 2.2 * s, false), ...column(px + s, py, pz, rr, 2.2 * s)]),
        }));
      }
      for (let i = 0; i < 14; i++) place(() => crystalCluster(r.range(area.x0, area.x1), r.range(-50, -22), r.range(area.z0 + 10, area.z1), r, r.range(3, 6), 0.45));
    },
  },
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
/**
 * Is platform i walled in on all four sides by platforms with the same top (a tile
 * in the middle of a floor)? Nothing hanging below it could ever be seen.
 */
function enclosed(platforms, i) {
  const p = platforms[i], top = topOf(p), out = 0.05;
  const covered = (x, z) => platforms.some((q, j) => j !== i && Math.abs(topOf(q) - top) < 0.05 &&
    Math.abs(x - q.x) <= q.width / 2 && Math.abs(z - q.z) <= q.depth / 2);
  for (let k = 0; k <= 4; k++) {
    const fx = p.x - p.width / 2 + (p.width * k) / 4, fz = p.z - p.depth / 2 + (p.depth * k) / 4;
    if (!covered(fx, p.z - p.depth / 2 - out) || !covered(fx, p.z + p.depth / 2 + out) ||
        !covered(p.x - p.width / 2 - out, fz) || !covered(p.x + p.width / 2 + out, fz)) return false;
  }
  return true;
}

/**
 * Build scenery for a level in a biome. Deterministic per (level name, biome).
 * Pass the level's audit so decoration can avoid the verified route.
 * @returns {{ boxes, ground, stats }}
 */
export function buildScenery(level, biome, audit) {
  const r = makeRandom(mulberry32(hashSeed('scenery', level.name, biome.id)));
  const kit = KITS[biome.scenery];
  const samples = routeSamples(level, audit);
  const ctx = { level, samples, maxReach: maxReach(level) };
  const boxes = [];
  const stats = { placed: 0, rejected: 0, reasons: {} };

  /** Accept a decoration group only if every box passes every rule. */
  let groups = 0;
  const place = (make, kind = 'backdrop', tries = 1) => {
    for (let t = 0; t < tries; t++) {
      const made = make();
      if (!made) {
        stats.rejected++;
        stats.reasons.BACKDROP_CLEAR_ZONE = (stats.reasons.BACKDROP_CLEAR_ZONE || 0) + 1;
        continue;
      }
      // every other decoration near the course is optional detail (dropped by lighter quality)
      const group = made.map(b => ({ ...b, kind: b.kind || kind, ...(b.detail || ((b.kind || kind) === 'near' && groups % 2 === 1) ? { detail: true } : {}) }));
      const bad = group.flatMap(b => boxViolations(b, ctx));
      if (!bad.length) {
        boxes.push(...group);
        stats.placed++;
        groups++;
        return true;
      }
      stats.rejected++;
      for (const code of bad) stats.reasons[code] = (stats.reasons[code] || 0) + 1;
    }
    return false;
  };

  // Course extents
  const xs = level.platforms.flatMap(p => [p.x - p.width / 2, p.x + p.width / 2]);
  const zs = level.platforms.flatMap(p => [p.z - p.depth / 2, p.z + p.depth / 2]);
  const ys = level.platforms.map(topOf);
  const course = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: Math.min(...ys), y1: Math.max(...ys) };

  // 1. Undersides and surface details for every platform (skip pieces that break rules)
  level.platforms.forEach((p, i) => {
    const hanging = kit.underside(p, i, r);
    // place layer by layer so a blocked lower layer doesn't remove the whole underside;
    // a platform walled in by same-height neighbours (a tiled floor) hides its underside entirely
    if (!enclosed(level.platforms, i)) for (const b of hanging) place(() => [b], 'underside');
    if (!p.material) for (const b of kit.surface(p, i, r)) place(() => [b], 'surface'); // details match the biome material only
  });

  // 2. Near decoration around the course
  const length = course.z1 - course.z0;
  const nearCount = Math.round(4 + length / 5);
  const totalWeight = kit.near.reduce((s, k) => s + k.weight, 0);
  for (let i = 0; i < nearCount; i++) {
    let roll = r.next() * totalWeight;
    const choice = kit.near.find(k => (roll -= k.weight) <= 0) || kit.near[0];
    place(() => {
      const side = r.chance(0.5) ? -1 : 1;
      const x = side > 0 ? course.x1 + r.range(10, 24) : course.x0 - r.range(10, 24);
      const y = choice.above ? r.range(course.y1 + 4, course.y1 + 9) : r.range(course.y0 - 7, course.y1 + 3);
      const z = r.range(course.z0 - 6, course.z1 + 12);
      return choice.make(x, y, z, r);
    }, 'near', 4);
  }

  // 3. Backdrop on the distant ground
  const ground = biome.ground ? {
    x: (course.x0 + course.x1) / 2, y: biome.ground.y, z: (course.z0 + course.z1) / 2 + 30,
    width: 480, depth: length + 420, material: biome.ground.material,
  } : null;
  const area = {
    x0: -80, x1: 80, z0: course.z0 - 4, z1: course.z1 + 110, // nothing in the foreground below the camera
    groundY: biome.ground ? biome.ground.y : -30,
  };
  const [clearH, clearBelow] = SCENERY_RULES.BACKDROP_CLEAR_ZONE;
  const clearOfCourse = group => group.every(b => {
    const bb = boundsOf(b);
    const gx = Math.max(0, bb.x0 - course.x1, course.x0 - bb.x1);
    const gz = Math.max(0, bb.z0 - course.z1, course.z0 - bb.z1);
    return Math.hypot(gx, gz) >= clearH || bb.y1 <= course.y0 - clearBelow;
  });
  kit.backdrop(area, r, make => place(() => {
    for (let t = 0; t < 6; t++) {
      const group = make();
      if (clearOfCourse(group)) return group;
    }
    return null; // could not find a spot clear of the course
  }, 'backdrop', 2));

  return { boxes, ground, stats };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
/**
 * Audit a level's scenery against the gameplay-safety rules.
 * @returns {{ ok, errors: [{code, message}], warnings: [...] }}
 */
export function auditScenery(level, scenery, audit) {
  const errors = [], warnings = [];
  const samples = routeSamples(level, audit);
  const ctx = { level, samples, maxReach: maxReach(level) };
  const seen = new Map();
  scenery.boxes.forEach((b, i) => {
    for (const code of boxViolations(b, ctx)) {
      if (!seen.has(code)) seen.set(code, []);
      seen.get(code).push(i);
    }
  });
  for (const [code, indices] of seen) {
    errors.push({ code, message: `${indices.length} decoration box(es) violate ${code} (first: #${indices[0]}, ${scenery.boxes[indices[0]].kind})` });
  }
  if (scenery.ground && scenery.ground.y > KILL_Y - SCENERY_RULES.GROUND_BELOW_KILL) {
    errors.push({ code: 'GROUND_TOO_HIGH', message: `Ground at ${scenery.ground.y} is above the kill plane margin (${KILL_Y - SCENERY_RULES.GROUND_BELOW_KILL})` });
  }
  if (scenery.boxes.length > SCENERY_RULES.BUDGET) {
    warnings.push({ code: 'SCENERY_BUDGET', message: `${scenery.boxes.length} boxes exceeds the budget of ${SCENERY_RULES.BUDGET}` });
  }
  return { ok: errors.length === 0, errors, warnings };
}
