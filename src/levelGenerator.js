/**
 * Level Generator
 *
 * Builds a forward-moving course out of hand-written segment patterns
 * (hop, stairs, zigzag, stepping stones, descent, beam, switchback, tower,
 * rest). Every jump is placed so its analytic difficulty lands inside a band
 * derived from the requested difficulty, and every finished level must pass
 * `auditLevel` with zero errors AND zero warnings — including a bot actually
 * completing it in the real physics. Candidates that fail are discarded and
 * regenerated from a derived seed, so output is deterministic per seed.
 *
 *   const { level, audit } = generateLevel({ seed: 42, difficulty: 0.6 });
 */

import { analyzeJump, moveBetween, auditLevel, topOf, RULES, SPECIAL_MOVES } from './levelAudit.js';
import { auditFun, funRequirements, routeTravel, FUN_RULES } from './funAudit.js';
import { auditEncounters, encounterRequirement, ENCOUNTER_RULES } from './encounterAudit.js';
import { enemyPosition, ENEMY_TYPES } from './enemies.js';

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function makeRandom(rng) {
  return {
    next: rng,
    range: (lo, hi) => lo + (hi - lo) * rng(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng()),
    pick: list => list[Math.floor(rng() * list.length)],
    sign: () => (rng() < 0.5 ? -1 : 1),
    chance: p => rng() < p,
    /** Round to a grid so levels look tidy and numbers stay readable. */
    snap: (v, step = 0.25) => Math.round(v / step) * step,
  };
}

// ---------------------------------------------------------------------------
// Difficulty knobs
// ---------------------------------------------------------------------------
export function difficultyKnobs(d) {
  d = clamp(d, 0, 1);
  return {
    // target range for each jump's difficulty (fraction of the physical limit)
    band: [lerp(0.12, 0.38, d), lerp(0.5, 0.76, d)],
    // platform footprint (width/depth)
    size: [lerp(2.5, 1.3, d), lerp(4, 2.6, d)],
    maxRise: lerp(0.7, 1.2, d),
    segments: Math.round(lerp(3, 8, d)),
  };
}

/** A false-path platform may not reach later route platforms (even with the air dash) within this multiple of the limit. */
const DEAD_END_MARGIN = 1.12;

/**
 * The special moves the level being built allows (level.abilities: 'dash', 'glide',
 * 'double'). Set per candidate; the "can you get there at all?" checks (dead ends,
 * skips, tangles) use the easiest of them.
 */
let ABILITIES_NOW = ['dash'];
function specialDifficulty(a, b) {
  let best = Infinity;
  for (const kind of ABILITIES_NOW) best = Math.min(best, analyzeJump(a, b, { moves: kind }).difficulty);
  return best;
}

/** Techniques a generated level asks for by default: its region's abilities, plus bounce pads from the alpine tier on. */
export function defaultTechniques(difficulty, abilities = ['dash']) {
  return {
    dash: abilities.includes('dash') ? 1 : 0,
    glide: abilities.includes('glide') ? 1 : 0,
    double: abilities.includes('double') ? 1 : 0,
    spring: difficulty >= 0.3 ? 1 : 0,
  };
}

/** Abilities by difficulty (standalone levels): the dash; gliding from 0.3; the double jump from 0.65. */
export function abilitiesForDifficulty(d) {
  return d >= 0.65 ? ['dash', 'glide', 'double'] : d >= 0.3 ? ['dash', 'glide'] : ['dash'];
}

const LIMITS = { xMax: 9, branchXMax: 10.5, topMin: 0.5, topMax: 14, clearance: 0.6, verticalClearance: 3 };

/**
 * Visual variants a generated level can request. Levels are geometry only; the
 * difficulty tier's biome decides the look. The variant only picks a subtle
 * per-level tint within the biome (and keeps the seed → level mapping stable).
 */
export const VARIANTS = ['cool', 'warm', 'bright', 'dim', 'neutral'];
export const VARIANT_TINTS = {
  cool: [0.95, 0.98, 1.04],
  warm: [1.04, 0.99, 0.94],
  bright: [1.05, 1.05, 1.05],
  dim: [0.93, 0.93, 0.93],
  neutral: [1, 1, 1],
};

// ---------------------------------------------------------------------------
// Course: placement bookkeeping shared by all patterns
// ---------------------------------------------------------------------------
class Course {
  constructor(rng, difficulty, theme = null) {
    this.r = makeRandom(rng);
    this.d = difficulty;
    this.k = difficultyKnobs(difficulty);
    this.theme = theme;
    this.platforms = [];
    this.main = [];        // indices of main-route platforms, in order
    this.branches = [];    // false paths: { junction: position in main, platforms: [indices] }
    this.shortcuts = [];   // shortcuts: { from, to: positions in main, platforms: [indices] }
    this.arenas = [];      // main-route positions of arena platforms (ground encounters)
    this.dashGaps = [];    // main-route positions of platforms reached by a required special move (dash, glide, double, bounce)
    this.dashDifficulty = []; // … and how hard each of those moves is
    this.techniques = { dash: 0, glide: 0, double: 0, spring: 0 };   // special moves placed so far
    this.segments = [];
    this.cursor = null;
    this.lastMove = null;
  }

  get current() { return this.platforms[this.cursor]; }

  /** Place the next main-route platform. */
  add(spec) {
    const p = { x: spec.x, y: spec.top - 0.5, z: spec.z, width: spec.width, height: 1, depth: spec.depth };
    if (this.current) this.lastMove = this.moveTo(spec);
    this.platforms.push(p);
    this.cursor = this.platforms.length - 1;
    this.main.push(this.cursor);
    return p;
  }

  /** The main route must stay out of reach from every false path (so they stay dead ends). */
  awayFromBranches(c) {
    if (!this.branches.length) return true;
    const cand = { x: c.x, y: c.top - 0.5, z: c.z, width: c.width, height: 1, depth: c.depth };
    return this.branches.every(b => b.platforms.every(i => specialDifficulty(this.platforms[i], cand) > DEAD_END_MARGIN && analyzeJump(this.platforms[i], cand).difficulty > DEAD_END_MARGIN));
  }

  size(scale = 1) {
    const [lo, hi] = this.k.size;
    return this.r.snap(this.r.range(lo, hi) * scale);
  }

  /** Geometry sanity for a candidate: bounds + breathing room from everything but the current platform. */
  fits(c, xMax = LIMITS.xMax) {
    if (Math.abs(c.x) + c.width / 2 > xMax) return false;
    if (c.top < LIMITS.topMin || c.top > LIMITS.topMax) return false;
    if (c.width < 1 || c.depth < 1) return false;
    return this.platforms.every((p, i) => {
      const m = i === this.cursor ? 0 : LIMITS.clearance;
      const sepX = Math.abs(p.x - c.x) >= (p.width + c.width) / 2 + m;
      const sepZ = Math.abs(p.z - c.z) >= (p.depth + c.depth) / 2 + m;
      const sepY = Math.abs(topOf(p) - c.top) >= LIMITS.verticalClearance;
      return sepX || sepZ || (i !== this.cursor && sepY);
    });
  }

  /**
   * Jump from the current platform into the candidate must sit inside [lo, hi]
   * difficulty, and the candidate must not be comfortably reachable from the
   * platform before the current one (that would make the current one a dead,
   * skippable platform).
   */
  jumpOk(c, band = this.k.band) {
    const cand = { x: c.x, y: c.top - 0.5, z: c.z, width: c.width, height: 1, depth: c.depth };
    const j = analyzeJump(this.current, cand);
    if (j.kind !== 'jump' || j.difficulty < band[0] || j.difficulty > band[1]) return false;
    const previous = this.platforms[this.main[this.main.length - 2]];
    return (!previous || analyzeJump(previous, cand).difficulty > Math.max(j.difficulty, band[1]) + 0.05) && this.noDashSkip(cand);
  }

  /**
   * Once the route needs the air dash, the planner takes as few dashes as possible, then
   * the easiest, then the fewest hops. A dash from a platform *before* a dash landing
   * straight to a later platform — at most as hard as the designed dash — would replace
   * that dash and skip part of the design, so no such candidate is placed.
   */
  noDashSkip(cand) {
    for (const [k, landing] of this.dashGaps.entries()) {
      if (this.main.length - landing > 5) continue;           // long gone: far out of reach
      const limit = this.dashDifficulty[k] + 0.08;
      for (let pos = Math.max(0, landing - 5); pos < landing; pos++) {
        if (specialDifficulty(this.platforms[this.main[pos]], cand) <= limit) return false;
      }
    }
    return true;
  }

  /**
   * A gap only the air dash crosses: a plain jump falls clearly short (> 102% of its
   * limit), the dash lands within `band` of its own limit, and no earlier route
   * platform can dash there instead.
   */
  dashOk(c, band, kind = 'dash') {
    const cand = { x: c.x, y: c.top - 0.5, z: c.z, width: c.width, height: 1, depth: c.depth };
    // off a bounce pad the only move is the bounce; otherwise a plain jump must fall clearly short
    if (!this.current.spring && analyzeJump(this.current, cand).difficulty <= 1.02) return false;
    const move = kind === 'spring' ? analyzeJump(this.current, cand) : analyzeJump(this.current, cand, { moves: kind });
    if (move.difficulty < band[0] || move.difficulty > band[1]) return false;
    // the route planner tries dash → glide → double jump: the ones before this kind mustn't be comfortable
    if (kind !== 'spring') {
      for (const k of SPECIAL_MOVES) {
        if (k === kind) break;
        if (ABILITIES_NOW.includes(k) && analyzeJump(this.current, cand, { moves: k }).difficulty <= RULES.HARD_JUMP + 0.05) return false;
      }
    }
    const from = Math.max(0, this.main.length - 6);
    for (let pos = from; pos < this.main.length - 1; pos++) {
      const p = this.platforms[this.main[pos]];
      if (p.spring) continue;
      if (analyzeJump(p, cand).difficulty <= 1.05 || specialDifficulty(p, cand) <= RULES.QUALITY_CAP + 0.08) return false;
    }
    return true;
  }

  /** Centre-to-centre move from the current platform to a candidate. */
  moveTo(c) {
    const cur = this.current;
    return { dx: c.x - cur.x, dy: c.top - topOf(cur), dz: c.z - cur.z };
  }

  /** "Minimum degree of difference": the new move must not repeat the previous one. */
  variedEnough(c) {
    if (!this.lastMove) return true;
    const m = this.moveTo(c), l = this.lastMove;
    return Math.hypot(m.dx - l.dx, m.dy - l.dy, m.dz - l.dz) >= FUN_RULES.MIN_PLACEMENT_DIFFERENCE + 0.15;
  }

  /**
   * Sample candidates from `make` until one fits; place it. `dash`: the jump must need that
   * special move — true / 'dash' (the air dash), 'glide', 'double' or 'spring' (the bounce off the pad it starts on).
   */
  tryPlace(make, { band, attempts = 30, dash = false } = {}) {
    const kind = dash === true ? 'dash' : dash;
    for (let i = 0; i < attempts; i++) {
      const c = make(this.current);
      c.x = this.r.snap(c.x); c.z = this.r.snap(c.z); c.top = this.r.snap(c.top, 0.1);
      if (!this.fits(c) || !this.variedEnough(c) || !this.awayFromBranches(c)) continue;
      if (kind ? !this.dashOk(c, band, kind) : !this.jumpOk(c, band)) continue;
      const from = this.current;
      const placed = this.add(c);
      if (kind) {
        this.dashGaps.push(this.main.length - 1);
        this.dashDifficulty.push(kind === 'spring' ? analyzeJump(from, placed).difficulty : analyzeJump(from, placed, { moves: kind }).difficulty);
        this.techniques[kind]++;
      }
      return placed;
    }
    return null;
  }

  /** Rise helper that steers heights back toward a comfortable range. */
  rise(lo, hi) {
    const top = topOf(this.current);
    if (top > 9) hi = Math.min(hi, 0.2);
    if (top < 1.5) lo = Math.max(lo, -0.2);
    return this.r.range(lo, Math.max(lo, hi));
  }

  /**
   * Like rise(), but at higher difficulty avoids near-flat moves: the level has
   * to travel up and down, not just forward.
   */
  vrise(lo, hi) {
    const minMagnitude = lerp(0.15, 0.9, this.d);
    for (let i = 0; i < 8; i++) {
      const v = this.rise(lo, hi);
      if (Math.abs(v) >= minMagnitude) return v;
    }
    return this.rise(lo, hi);
  }

  /** Forward placement helper: gap measured edge-to-edge along +z. */
  ahead(cur, { gap, dx = 0, rise = 0, width, depth }) {
    return { x: cur.x + dx, z: cur.z + cur.depth / 2 + gap + depth / 2, top: topOf(cur) + rise, width, depth };
  }
}

// ---------------------------------------------------------------------------
// Segment patterns (hand-written). Each returns the number of platforms placed.
// ---------------------------------------------------------------------------
const PATTERNS = {
  /** A single jump forward, anywhere in the band. */
  hop(c) {
    const { r } = c;
    return c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(0.6, lerp(3.2, 1.8, c.d)), dx: r.range(-2.5, 2.5), rise: c.vrise(-1.3, c.k.maxRise),
      width: c.size(), depth: c.size(),
    })) ? 1 : 0;
  },

  /** 3–5 ascending steps, close together. */
  stairs(c) {
    const { r } = c;
    const n = r.int(3, 5), width = c.size(1.1), depth = r.snap(r.range(1.5, 2.5));
    let placed = 0;
    for (let i = 0; i < n; i++) {
      if (!c.tryPlace(cur => c.ahead(cur, {
        gap: r.range(0.2, 1.2), dx: r.range(-0.5, 0.5), rise: r.range(lerp(0.4, 0.65, c.d), Math.min(lerp(0.8, 1.05, c.d), c.k.maxRise)), width, depth,
      }), { band: [0, c.k.band[1]] })) break;
      placed++;
    }
    return placed;
  },

  /** Alternate left/right while moving forward. */
  zigzag(c) {
    const { r } = c;
    const n = r.int(3, 4);
    let side = r.sign(), placed = 0;
    const baseX = clamp(c.current.x, -4, 4);
    for (let i = 0; i < n; i++) {
      if (!c.tryPlace(cur => {
        const size = c.size();
        return { x: baseX + side * r.range(2.2, 3.5), z: cur.z + cur.depth / 2 + r.range(0.2, 1.5) + size / 2, top: topOf(cur) + c.vrise(-0.8, 0.9), width: size, depth: size };
      })) break;
      side = -side;
      placed++;
    }
    return placed;
  },

  /** Small stepping stones — precision. */
  stones(c) {
    const { r } = c;
    const n = r.int(4, 6);
    let placed = 0;
    for (let i = 0; i < n; i++) {
      if (!c.tryPlace(cur => {
        const s = r.snap(Math.max(1.2, c.k.size[0] * r.range(0.9, 1.1)));
        return c.ahead(cur, { gap: r.range(0.8, 2.2), dx: r.range(-1.5, 1.5), rise: c.vrise(-0.6, 0.6), width: s, depth: s });
      })) break;
      placed++;
    }
    return placed;
  },

  /** Drop down — falling buys air time, so gaps can be longer. */
  descent(c) {
    const { r } = c;
    if (topOf(c.current) < 2) return 0;
    const n = r.int(2, 3);
    let placed = 0;
    for (let i = 0; i < n; i++) {
      if (!c.tryPlace(cur => c.ahead(cur, {
        gap: r.range(1.5, 3.6), dx: r.range(-1.5, 1.5), rise: r.range(-1.6, -0.6), width: c.size(), depth: c.size(),
      }))) break;
      placed++;
    }
    return placed;
  },

  /** A narrow, long beam to walk along. */
  beam(c) {
    const { r } = c;
    return c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(0.8, 2), dx: r.range(-1, 1), rise: c.vrise(-0.8, 0.8),
      width: r.snap(r.range(1, 1.4)), depth: r.snap(r.range(4, 7)),
    })) ? 1 : 0;
  },

  /** Sideways jumps (visible from the chase camera), then carry on. */
  switchback(c) {
    const { r } = c;
    const dir = c.current.x > 2 ? -1 : c.current.x < -2 ? 1 : r.sign();
    let placed = 0;
    for (let i = 0; i < 2; i++) {
      if (!c.tryPlace(cur => {
        const size = c.size();
        return {
          x: cur.x + dir * ((cur.width + size) / 2 + r.range(0.8, 2.4)),
          z: cur.z + r.range(-0.25, 1), top: topOf(cur) + c.vrise(-0.9, 0.9), width: size, depth: size,
        };
      })) break;
      placed++;
    }
    return placed;
  },

  /** Big climbs on tight pillars. */
  tower(c) {
    const { r } = c;
    const n = r.int(2, 3);
    let placed = 0;
    for (let i = 0; i < n; i++) {
      if (!c.tryPlace(cur => c.ahead(cur, {
        gap: r.range(0.1, 0.8), dx: r.range(-1, 1), rise: r.range(0.85, c.k.maxRise),
        width: r.snap(r.range(1.5, 2.2)), depth: r.snap(r.range(1.5, 2.2)),
      }), { band: [0, c.k.band[1]] })) break;
      placed++;
    }
    return placed;
  },

  /** Drop into a dip, then climb back out — an up/down reversal. */
  valley(c) {
    const { r } = c;
    if (topOf(c.current) < 1.6) return 0;
    let placed = 0;
    if (c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(1, 2.6), dx: r.range(-2, 2), rise: r.range(-1.5, -0.7), width: c.size(), depth: c.size(),
    }))) placed++;
    else return 0;
    if (c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(0.3, 1.4), dx: r.range(-2, 2), rise: r.range(0.6, c.k.maxRise), width: c.size(), depth: c.size(),
    }), { band: [0, c.k.band[1]] })) placed++;
    return placed;
  },

  /** Climb while switching sides: up + left/right every jump. */
  climbTurn(c) {
    const { r } = c;
    const n = r.int(3, 4);
    let side = c.current.x > 2 ? -1 : c.current.x < -2 ? 1 : r.sign(), placed = 0;
    for (let i = 0; i < n; i++) {
      if (!c.tryPlace(cur => {
        const size = c.size();
        return {
          x: cur.x + side * ((cur.width + size) / 2 + r.range(0.4, 1.8)),
          z: cur.z + r.range(0.3, 1.6), top: topOf(cur) + r.range(lerp(0.4, 0.7, c.d), Math.min(1.1, c.k.maxRise)), width: size, depth: size,
        };
      }, { band: [0, c.k.band[1]] })) break;
      side = -side;
      placed++;
    }
    return placed;
  },

  /** Last resort when boxed in: any fair jump in any forward/sideways direction. */
  anyHop(c) {
    const { r } = c;
    return c.tryPlace(cur => {
      const size = c.size();
      return r.chance(0.5)
        ? c.ahead(cur, { gap: r.range(0.3, 3.5), dx: r.range(-3.5, 3.5), rise: c.rise(-1.5, c.k.maxRise), width: size, depth: size })
        : { x: cur.x + r.sign() * ((cur.width + size) / 2 + r.range(0.3, 2.5)), z: cur.z + r.range(0, 2), top: topOf(cur) + c.rise(-1.2, c.k.maxRise), width: size, depth: size };
    }, { attempts: 120 }) ? 1 : 0;
  },

  /** Right after a fork: move on to the other side and/or upward, away from the false path. */
  escape(c) {
    const { r } = c;
    const branch = c.branches.at(-1);
    const tip = branch ? c.platforms[branch.platforms[0]] : c.current;
    const away = tip.x > c.current.x ? -1 : 1;
    return c.tryPlace(cur => {
      const size = c.size();
      const lateral = r.chance(0.6);
      // climb: from the ledge ~1.0–1.3 below, the route ahead is then more than a jump's
      // height (1.57) up — out of reach of any dash, however close
      const rise = ABILITIES_NOW.includes('double') ? r.range(0.85, Math.max(1.0, c.k.maxRise)) : r.range(0.62, Math.max(0.8, c.k.maxRise));
      return lateral
        ? { x: cur.x + away * ((cur.width + size) / 2 + r.range(0.4, 2)), z: cur.z + r.range(0, 1.8), top: topOf(cur) + rise, width: size, depth: size }
        : c.ahead(cur, { gap: r.range(0.5, 2.4), dx: away * r.range(0.5, 2.5), rise, width: size, depth: size });
    }, { band: [0, c.k.band[1]], attempts: 60 }) ? 1 : 0;
  },

  /** A wide arena platform for a ground encounter. */
  arena(c) {
    const { r } = c;
    const placed = c.tryPlace(cur => {
      const width = r.snap(r.range(4.5, 6)), depth = r.snap(r.range(3.5, 4.5));
      const rise = c.vrise(-0.9, c.k.maxRise);
      if (r.chance(0.5)) {
        // off to the side: a detour into the arena instead of a long straight run
        const side = cur.x > 1 ? -1 : cur.x < -1 ? 1 : r.sign();
        return { x: cur.x + side * ((cur.width + width) / 2 + r.range(0.4, 1.6)), z: cur.z + r.range(0, 1.5), top: topOf(cur) + rise, width, depth };
      }
      return c.ahead(cur, { gap: r.range(0.8, 2.2), dx: r.range(-1.5, 1.5), rise, width, depth });
    }, { band: [0, c.k.band[1]], attempts: 60 });
    if (placed) c.arenas.push(c.main.length - 1);
    return placed ? 1 : 0;
  },

  /** A chasm only the air dash crosses, onto a wide landing. */
  dashGap(c) {
    const { r } = c;
    const band = [lerp(0.42, 0.55, c.d), lerp(0.62, 0.78, c.d)];
    return c.tryPlace(cur => {
      const size = r.snap(r.range(3, 4.2));
      return c.ahead(cur, { gap: r.range(4.4, 6.8), dx: r.range(-1.5, 1.5), rise: c.vrise(-1.4, 0.4), width: size, depth: r.snap(r.range(3, 4)) });
    }, { band, dash: true, attempts: 80 }) ? 1 : 0;
  },

  /** A long way down and far across: only gliding (hold jump while falling) makes it. */
  glideGap(c) {
    const { r } = c;
    const top = topOf(c.current);
    if (top < LIMITS.topMin + 2.6) return 0;
    const band = [lerp(0.4, 0.5, c.d), lerp(0.62, 0.76, c.d)];
    return c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(6, 10), dx: r.range(-3.5, 3.5), rise: -r.range(2.2, Math.min(5, top - LIMITS.topMin)),
      width: r.snap(r.range(3, 4.2)), depth: r.snap(r.range(3, 4)),
    }), { band, dash: 'glide', attempts: 80 }) ? 1 : 0;
  },

  /** A wall too tall for one jump: only the double jump climbs it. */
  doubleWall(c) {
    const { r } = c;
    const band = [lerp(0.5, 0.6, c.d), lerp(0.7, 0.8, c.d)];
    return c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(0.4, 2.6), dx: r.range(-3, 3), rise: r.range(1.8, 2.5),
      width: r.snap(r.range(2.6, 3.6)), depth: r.snap(r.range(2.6, 3.4)),
    }), { band, dash: 'double', attempts: 80 }) ? 1 : 0;
  },

  /** A bounce pad, then a ledge high above that only its bounce reaches. */
  springPad(c) {
    const { r } = c;
    if (topOf(c.current) > 9.5) return 0;
    const pad = c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(0.6, 2), dx: r.range(-1.5, 1.5), rise: c.rise(-0.8, 0.2), width: 1.6, depth: 1.6,
    }), { band: [0, c.k.band[1]], attempts: 40 });
    if (!pad) return 0;
    pad.spring = true;
    const ledge = c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(0.4, 1.8), dx: r.range(-1.5, 1.5), rise: r.range(3.0, 3.7), width: r.snap(r.range(3, 4)), depth: r.snap(r.range(3, 4)),
    }), { band: [0.3, lerp(0.7, 0.8, c.d)], dash: 'spring', attempts: 80 });
    if (!ledge) {                                   // no way up: take the pad back out
      c.platforms.pop(); c.main.pop();
      c.cursor = c.main.at(-1);
      c.lastMove = null;
      return 0;
    }
    return 2;
  },

  /** A leap of faith: a long drop (≥ RULES.LONG_DROP) onto a wide landing. */
  leap(c) {
    const { r } = c;
    const top = topOf(c.current);
    if (top < LIMITS.topMin + RULES.LONG_DROP + 0.3) return 0;
    return c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(1.2, 3.8), dx: r.range(-2, 2), rise: -r.range(RULES.LONG_DROP + 0.1, Math.min(4.5, top - LIMITS.topMin)),
      width: r.snap(r.range(3.5, 4.5)), depth: r.snap(r.range(3, 4)),
    }), { band: [0, c.k.band[1]], attempts: 60 }) ? 1 : 0;
  },

  /** A wide checkpoint-style platform to breathe on. */
  rest(c) {
    const { r } = c;
    return c.tryPlace(cur => c.ahead(cur, {
      gap: r.range(0.8, 2), dx: r.range(-1.5, 1.5), rise: c.vrise(-0.8, 0.8),
      width: r.snap(r.range(4, 5)), depth: r.snap(r.range(3.5, 4.5)),
    }), { band: [0, c.k.band[1]] }) ? 1 : 0;
  },
};

function patternWeights(d, theme = null) {
  // Harder levels lean on patterns that travel sideways and up/down.
  const w = {
    hop: lerp(3, 1.2, d), stairs: 1.6, zigzag: 2, switchback: lerp(1, 2.4, d), descent: lerp(0.8, 1.6, d),
    valley: lerp(0.6, 2.4, d), climbTurn: lerp(0.4, 2.4, d),
    stones: lerp(0.5, 1.8, d), beam: lerp(0.4, 1, d), tower: d < 0.35 ? 0 : 2 * d,
  };
  for (const [name, k] of Object.entries(THEMES[theme]?.weights || {})) w[name] = (w[name] || 0.5) * k;
  return w;
}

/**
 * Themes give generated levels a recognisable shape, so two levels of a tier don't
 * blur together: each biases the pattern mix and asks for a little more of its
 * signature move (on top of the fun requirements).
 */
export const THEMES = {
  ascent: { label: 'Ascent', about: 'climbs high on towers and stairs, then leaps down', weights: { tower: 4, stairs: 2.5, climbTurn: 2, descent: 0.3, valley: 0.5, hop: 0.6 }, extra: { longDrops: 1 } },
  skyway: { label: 'Skyway', about: 'long crossings: beams, stepping stones and dash chasms', weights: { beam: 3, stones: 2, valley: 1.5, hop: 1, tower: 0.8 }, extra: { dashes: 1 } },
  switchbacks: { label: 'Switchbacks', about: 'winds left and right, with a shortcut for the bold', weights: { zigzag: 3, switchback: 3.5, climbTurn: 2, hop: 0.5, beam: 0.5 }, extra: { shortcuts: 1 } },
  cascade: { label: 'Cascade', about: 'a tall start, then tumbling down ledges and drops', weights: { descent: 3.5, valley: 2.5, tower: 2, hop: 0.7 }, extra: { longDrops: 1 } },
  gauntlet: { label: 'Gauntlet', about: 'arenas and wisps between the jumps', weights: { stones: 1.5, switchback: 1.5 }, extra: { encounters: 1 } },
};
export const THEME_NAMES = Object.keys(THEMES);

/** Travel so far along the main route (same measures as the fun audit). */
function travelSoFar(c) {
  let forward = 0, lateral = 0, vertical = 0, turns = 0, lastX = 0, lastY = 0;
  for (let i = 1; i < c.main.length; i++) {
    const a = c.platforms[c.main[i - 1]], b = c.platforms[c.main[i]];
    const dx = b.x - a.x, dy = topOf(b) - topOf(a);
    forward += Math.max(0, b.z - a.z);
    lateral += Math.abs(dx);
    vertical += Math.abs(dy);
    if (Math.abs(dx) >= FUN_RULES.DIRECTION_THRESHOLD.lateral) { if (lastX && Math.sign(dx) !== lastX) turns++; lastX = Math.sign(dx); }
    if (Math.abs(dy) >= FUN_RULES.DIRECTION_THRESHOLD.vertical) { if (lastY && Math.sign(dy) !== lastY) turns++; lastY = Math.sign(dy); }
  }
  forward = Math.max(1, forward);
  return { lateralRatio: lateral / forward, verticalRatio: vertical / forward, turns };
}

/** Pick the next pattern, steering toward whatever the fun requirements still lack. */
function choosePattern(c, weights, last, progress) {
  const req = funRequirements(c.d, ABILITIES_NOW);
  const t = travelSoFar(c);
  const needs = [];
  if (t.verticalRatio < req.verticalRatio * 1.35) needs.push('valley', 'climbTurn', 'descent', 'stairs', 'tower');
  if (t.lateralRatio < req.lateralRatio * 1.2) needs.push('switchback', 'zigzag', 'climbTurn');
  if (t.turns < req.turns * progress + 1) needs.push('zigzag', 'climbTurn', 'valley');
  if (needs.length && c.r.chance(lerp(0.7, 0.9, c.d))) {
    const focused = Object.fromEntries(Object.entries(weights).filter(([k, w]) => w > 0 && needs.includes(k)));
    if (Object.keys(focused).length) return weightedPick(c.r, focused, last);
  }
  return weightedPick(c.r, weights, last);
}

function weightedPick(r, weights, exclude) {
  const entries = Object.entries(weights).filter(([name, w]) => w > 0 && name !== exclude);
  let roll = r.next() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [name, w] of entries) if ((roll -= w) <= 0) return name;
  return entries.at(-1)[0];
}

const ADJECTIVES = ['Breezy', 'Crooked', 'Sunny', 'Hidden', 'Dizzy', 'Quiet', 'Jagged', 'Lofty', 'Mossy', 'Rapid', 'Silent', 'Tumbling', 'Winding', 'Golden', 'Misty', 'Nimble'];
const NOUNS = ['Steps', 'Heights', 'Crossing', 'Ascent', 'Ridge', 'Trail', 'Gardens', 'Ledges', 'Causeway', 'Spires', 'Terraces', 'Run', 'Pass', 'Stairway', 'Drift', 'Summit'];

// ---------------------------------------------------------------------------
// False paths (hand-written rules): tempting, dead-end, recoverable branches
// ---------------------------------------------------------------------------
/** Could a player get from a to b at all — a plain jump, or an air dash, near the limit? */
const reachable = (a, b) => analyzeJump(a, b).difficulty <= 1.05 || specialDifficulty(a, b) <= 1.05;

/**
 * Grow a dead-end branch off main-route platform `junction`.
 *  - tempting:     heads forward/sideways and is easy to enter (never harder than the route)
 *  - dead end:     no branch platform can reach any main-route platform other than the
 *                  junction (and nothing past the junction, with a safety margin)
 *  - recoverable:  every branch step can jump back to the one before it
 */
function growFalsePath(c, junctionPos, length) {
  const { r } = c;
  const junction = c.main[junctionPos];
  const route = c.main.map(i => c.platforms[i]);
  const jp = c.platforms[junction];
  // head away from where the route goes next (or, while building, away from where it came from)
  const ref = route[junctionPos + 1] || route[junctionPos - 1] || jp;
  const away = ref.x > jp.x ? -1 : ref.x < jp.x ? 1 : r.sign();
  const asPlatform = k => ({ x: k.x, y: k.top - 0.5, z: k.z, width: k.width, height: 1, depth: k.depth });
  const added = [];
  let from = junction;
  for (let step = 0; step < length; step++) {
    let placed = null;
    for (let attempt = 0; attempt < 60 && !placed; attempt++) {
      const cur = c.platforms[from];
      const size = c.size();
      // mostly head away from the route and downward: from a ledge about a metre below
      // the junction, the (climbing) route ahead is out of reach even with the air dash —
      // more than a jump's height above — while climbing back to the junction stays easy
      const side = r.chance(0.8) ? away : -away;
      const cand = {
        x: r.snap(cur.x + side * ((cur.width + size) / 2 + r.range(0.3, step === 0 ? 2.2 : 3.2))),
        z: r.snap(cur.z + r.range(-0.3, 2.4)),
        // with the double jump, "out of reach" means more than a double jump's height below
        top: r.snap(topOf(cur) + (step === 0 ? (ABILITIES_NOW.includes('double') ? r.range(-2.55, -2.2) : r.range(-1.3, -1.05)) : r.range(-0.9, 0.3)), 0.1),
        width: size, depth: size,
      };
      // further steps stay well below the junction, where the route ahead can't be reached
      if (step > 0 && cand.top > topOf(jp) - (ABILITIES_NOW.includes('double') ? 2.15 : 1.0)) continue;
      c.cursor = from;
      const fits = c.fits(cand, LIMITS.branchXMax);
      c.cursor = c.main[c.main.length - 1];
      if (!fits) continue;
      const p = asPlatform(cand);
      const into = analyzeJump(cur, p);
      // climbing back may take the level's special moves (a double jump out of a deep spur)
      const back = { difficulty: Math.min(analyzeJump(p, cur).difficulty, ABILITIES_NOW.includes('double') ? analyzeJump(p, cur, { moves: 'double' }).difficulty : Infinity) };
      // an easy way in is what makes a false path tempting; it just has to be a real jump
      if (into.kind !== 'jump' || into.difficulty > c.k.band[1]) continue;
      // climbing back out may be a stiff jump (the price of exploring) but stays fair
      if (back.difficulty > RULES.QUALITY_CAP - 0.05) continue;
      // even a dash can't carry you onward (hopping back to an earlier route platform is fine:
      // that leads nowhere new either)
      const leaks = route.some((m, i) => i > junctionPos && (specialDifficulty(p, m) <= DEAD_END_MARGIN || analyzeJump(p, m).difficulty <= DEAD_END_MARGIN));
      if (leaks) continue;
      // jumping in from *before* the junction would turn it into a detour; dashing in from two
      // or more platforms back (then climbing to the junction) would make it a shortcut
      const sideEntry = route.some((m, i) => i < junctionPos && (analyzeJump(m, p).difficulty <= RULES.QUALITY_CAP + 0.05 ||
        (i < junctionPos - 1 && specialDifficulty(m, p) <= RULES.QUALITY_CAP + 0.05)));
      if (sideEntry) continue;
      // keep separate false paths (and shortcuts) separate (no tangles of merged spurs)
      const tangled = [...c.branches, ...c.shortcuts].some(b => b.platforms.some(i => {
        const o = c.platforms[i];
        return reachable(o, p) || reachable(p, o);
      }));
      if (tangled) continue;
      placed = p;
    }
    if (!placed) break;
    c.platforms.push(placed);
    added.push(c.platforms.length - 1);
    from = c.platforms.length - 1;
  }
  if (added.length) c.branches.push({ junction: junctionPos, platforms: added });
  return added;
}

// ---------------------------------------------------------------------------
// Shortcuts (hand-written rules): a non-obvious way past part of the course
// ---------------------------------------------------------------------------
/**
 * Place a shortcut platform off the line between main-route positions `from` and
 * `from + span`: enter it from `from`, leave it onto `from + span`, skipping the route
 * platforms in between.
 *  - non-obvious:  off to the side of the route, and at least one of its two moves needs
 *                  the air dash (so plain-jump players never stumble onto it, and the
 *                  route planner — plain jumps first — never takes it)
 *  - fair:         both moves within the route's difficulty band (with their move)
 *  - worth it:     skips ≥ 1 route platform; with span ≥ 3 it also saves hops
 *  - separate:     no tangles with false paths, nothing else enters it from earlier
 */
function growShortcut(c, from, span) {
  const { r } = c;
  const route = c.main.map(i => c.platforms[i]);
  const a = route[from], b = route[from + span];
  if (!a || !b || c.dashGaps.some(g => g > from && g <= from + span)) return null;
  const hi = Math.min(c.k.band[1] + 0.1, RULES.QUALITY_CAP - 0.05);
  const asPlatform = k => ({ x: k.x, y: k.top - 0.5, z: k.z, width: k.width, height: 1, depth: k.depth });
  for (let attempt = 0; attempt < 80; attempt++) {
    const t = r.range(0.35, 0.65);
    const size = r.snap(r.range(1.6, 2.4));
    // off the line from a to b, on either side
    const lx = b.z - a.z, lz = -(b.x - a.x), l = Math.hypot(lx, lz) || 1;
    const off = r.sign() * r.range(2.5, 5);
    const cand = {
      x: r.snap(a.x + (b.x - a.x) * t + (lx / l) * off),
      z: r.snap(a.z + (b.z - a.z) * t + (lz / l) * off),
      top: r.snap(topOf(a) + (topOf(b) - topOf(a)) * t + r.range(-0.4, 0.4), 0.1),
      width: size, depth: size,
    };
    c.cursor = c.main[from];
    const fits = c.fits(cand, LIMITS.branchXMax);
    c.cursor = c.main[c.main.length - 1];
    if (!fits) continue;
    const p = asPlatform(cand);
    const into = moveBetween(a, p, RULES.QUALITY_CAP, ABILITIES_NOW), out = moveBetween(p, b, RULES.QUALITY_CAP, ABILITIES_NOW);
    if (into.difficulty > hi || out.difficulty > hi) continue;
    if (!SPECIAL_MOVES.includes(into.kind) && !SPECIAL_MOVES.includes(out.kind)) continue;
    if (a.spring || b.spring) continue;
    // nothing earlier on the route gets in; no route platform between makes it a plain detour
    if (route.some((m, i) => i < from && reachable(m, p))) continue;
    if (route.some((m, i) => i > from && i < from + span && analyzeJump(m, p).difficulty <= RULES.QUALITY_CAP && analyzeJump(p, route[i + 1]).difficulty <= RULES.QUALITY_CAP)) continue;
    // it mustn't lead further than designed (past `from + span`)
    if (route.some((m, i) => i > from + span && reachable(p, m))) continue;
    const tangled = c.branches.some(br => br.platforms.some(i => reachable(c.platforms[i], p) || reachable(p, c.platforms[i])));
    if (tangled) continue;
    c.platforms.push(p);
    const index = c.platforms.length - 1;
    c.shortcuts.push({ from, to: from + span, platforms: [index] });
    return index;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Enemies (hand-written rules): arenas get patrollers, some jumps get a wisp
// ---------------------------------------------------------------------------
function placeEnemies(c, difficulty, wanted) {
  const { r } = c;
  const enemies = [];
  const positions = [];
  const level = { platforms: c.platforms };
  for (const pos of c.arenas) {
    const index = c.main[pos];
    const p = c.platforms[index];
    const axis = p.width >= p.depth ? 'x' : 'z';
    const type = difficulty >= 0.45 && r.chance(0.5) ? 'spiker' : 'crawler';
    const speed = ENEMY_TYPES[type].speed * lerp(0.9, 1.25, difficulty);
    enemies.push({ type, platform: index, axis, speed: r.snap(speed, 0.05), phase: r.snap(r.next(), 0.05) });
    const cross = axis === 'x' ? p.depth : p.width;
    if (difficulty >= 0.7 && r.chance(0.4) && cross >= 3.5) {
      // a second patroller in its own lane, out of step with the first
      enemies.at(-1).lane = -0.9;
      enemies.push({ type: 'crawler', platform: index, axis, lane: 0.9, speed: r.snap(speed * 1.1, 0.05), phase: r.snap((enemies.at(-1).phase + 0.5) % 1, 0.05) });
    }
    positions.push(pos);
  }
  // Wisps across route jumps, away from the start, the goal and other encounters
  const wantedWisps = Math.max(0, wanted - positions.length);
  const spawn = c.platforms[c.main[0]], goal = c.platforms[c.main.at(-1)];
  const candidates = Array.from({ length: Math.max(0, c.main.length - 3) }, (_, k) => k + 2);
  for (let k = candidates.length - 1; k > 0; k--) { const m = r.int(0, k); [candidates[k], candidates[m]] = [candidates[m], candidates[k]]; }
  let wisps = 0;
  for (const pos of candidates) {
    if (wisps >= wantedWisps) break;
    if (pos >= c.main.length - 1 || positions.some(q => Math.abs(q - pos) < 2)) continue;
    const a = c.platforms[c.main[pos - 1]], b = c.platforms[c.main[pos]];
    const mid = [(a.x + b.x) / 2, Math.max(topOf(a), topOf(b)) + r.range(0.9, 1.3), (a.z + b.z) / 2];
    let px = -(b.z - a.z), pz = b.x - a.x;
    const l = Math.hypot(px, pz) || 1;
    px /= l; pz /= l;
    const half = r.range(2.5, 3.5);
    const wisp = {
      type: 'wisp',
      from: [r.snap(mid[0] - px * half, 0.1), r.snap(mid[1], 0.1), r.snap(mid[2] - pz * half, 0.1)],
      to: [r.snap(mid[0] + px * half, 0.1), r.snap(mid[1], 0.1), r.snap(mid[2] + pz * half, 0.1)],
      speed: r.snap(ENEMY_TYPES.wisp.speed * lerp(0.85, 1.3, difficulty), 0.05),
      phase: r.snap(r.next(), 0.05),
    };
    // clear of platforms, spawn and goal
    let clear = true;
    for (let t = 0; t < 12 && clear; t += 0.1) {
      const w = enemyPosition(wisp, level, t);
      if (Math.hypot(w.x - spawn.x, w.z - spawn.z) < ENCOUNTER_RULES.SPAWN_CLEARANCE + 1) clear = false;
      if (Math.hypot(w.x - goal.x, w.z - goal.z) < ENCOUNTER_RULES.GOAL_CLEARANCE + goal.width / 2) clear = false;
      for (const p of c.platforms) {
        if (Math.abs(w.x - p.x) < p.width / 2 + 0.45 && Math.abs(w.z - p.z) < p.depth / 2 + 0.45 && w.y - 0.45 < topOf(p) + 0.2 && w.y + 0.45 > p.y - p.height / 2) clear = false;
      }
    }
    if (!clear) continue;
    enemies.push(wisp);
    positions.push(pos);
    wisps++;
  }
  return enemies;
}

// ---------------------------------------------------------------------------
// Build one candidate
// ---------------------------------------------------------------------------
const TECHNIQUE_PATTERN = { dash: 'dashGap', glide: 'glideGap', double: 'doubleWall', spring: 'springPad' };

function buildCandidate(rng, difficulty, theme = null, { abilities = ['dash'], techniques = null } = {}) {
  ABILITIES_NOW = abilities;
  const c = new Course(rng, difficulty, theme);
  const { r } = c;
  c.add({ x: 0, z: 0, top: 0.5, width: 5, depth: 5 });

  const segmentCount = c.k.segments + r.int(0, 1);
  const weights = patternWeights(difficulty, theme);
  const req = funRequirements(difficulty, abilities);
  const extra = THEMES[theme]?.extra || {};
  // special techniques: the region's (see defaultTechniques), the theme's extra dashes, and at
  // least as many special moves in all as the fun requirements ask for
  const wantedTech = { ...(techniques || defaultTechniques(difficulty, abilities)) };
  for (const k of Object.keys(wantedTech)) if (k !== 'spring' && !abilities.includes(k)) wantedTech[k] = 0;
  if (abilities.includes('dash')) wantedTech.dash += extra.dashes || 0;
  const totalTech = () => Object.values(wantedTech).reduce((a, b) => a + b, 0);
  if (totalTech() < req.dashes && abilities.includes('dash')) wantedTech.dash += req.dashes - totalTech();
  const techQueue = [];
  for (const [k, n] of Object.entries(wantedTech)) for (let i = 0; i < n; i++) techQueue.push(k);
  for (let k = techQueue.length - 1; k > 0; k--) { const m = r.int(0, k); [techQueue[k], techQueue[m]] = [techQueue[m], techQueue[k]]; }
  const wantedDashes = techQueue.length;
  const wantedLeaps = req.longDrops + (extra.longDrops || 0);
  const wantedShortcuts = req.shortcuts + (extra.shortcuts || 0);
  let leaps = 0;
  const wanted = req.falsePaths + (difficulty >= 0.5 || (difficulty > 0.1 && r.chance(0.35)) ? 1 : 0);
  const branchLength = () => r.int(1, 1 + Math.round(2 * difficulty));
  const forkAllowed = pos => pos >= 1 && !c.platforms[c.main[pos]]?.spring && c.branches.every(b => Math.abs(b.junction - pos) >= 2);
  // Encounters: ground fights on arenas (scheduled now), wisps across jumps (added later)
  const wantedEncounters = encounterRequirement(difficulty) + (extra.encounters || 0);
  // Wide arenas add flat forward travel; at higher difficulty lean on wisps (airborne encounters) instead
  const wantedGround = difficulty < 0.25 ? wantedEncounters : Math.max(1, Math.floor(wantedEncounters * lerp(0.6, 0.45, difficulty) + 0.5));
  let last = null, sinceRest = 0;
  for (let i = 0; i < segmentCount; i++) {
    const lastArena = c.arenas.length ? c.arenas.at(-1) : -Infinity;
    if (c.arenas.length < wantedGround && (i + 1) / segmentCount >= (c.arenas.length + 0.5) / wantedGround &&
        c.main.length >= 2 && c.main.length - lastArena >= 3 && PATTERNS.arena(c)) {
      c.segments.push('arena');
      sinceRest = 0;
    }
    // Technique gaps (dash chasms, glide gaps, double-jump walls, bounce pads) and leaps of faith,
    // spread through the level (glides and leaps once the course is high enough)
    const progress = (i + 1) / segmentCount;
    const placedTech = wantedDashes - techQueue.length;
    if (techQueue.length && progress >= (placedTech + 0.4) / wantedDashes && c.main.length >= 3) {
      const kind = techQueue.find(k => k !== 'glide' || topOf(c.current) >= LIMITS.topMin + 2.6) || null;
      if (kind && PATTERNS[TECHNIQUE_PATTERN[kind]](c)) {
        techQueue.splice(techQueue.indexOf(kind), 1);
        c.segments.push(TECHNIQUE_PATTERN[kind]);
        sinceRest = 0;
      } else if (techQueue.includes('glide') && topOf(c.current) < LIMITS.topMin + 2.6 && PATTERNS.tower(c)) {
        c.segments.push('tower');                 // climb first: a glide needs height to come down from
      }
    }
    if (leaps < wantedLeaps && progress >= (leaps + 0.5) / (wantedLeaps + 0.5) && PATTERNS.leap(c)) {
      c.segments.push('leap');
      leaps++;
    }
    // Forks: spread the false paths through the level; the route then moves on away from them
    if (c.branches.length < wanted && (i + 1) / segmentCount >= (c.branches.length + 0.5) / wanted && forkAllowed(c.main.length - 1)) {
      const branch = growFalsePath(c, c.main.length - 1, branchLength());
      if (branch.length) {
        if (PATTERNS.escape(c)) c.segments.push('fork');
        else { c.platforms.splice(branch[0]); c.branches.pop(); } // no way onward: undo this fork
      }
    }
    const name = sinceRest >= 3 && r.chance(0.6) ? 'rest' : choosePattern(c, weights, last, (i + 1) / segmentCount);
    const placed = PATTERNS[name](c);
    if (placed) {
      c.segments.push(name);
      last = name;
      sinceRest = name === 'rest' ? 0 : sinceRest + 1;
    } else if (PATTERNS.hop(c) || PATTERNS.anyHop(c)) {
      c.segments.push('hop');
    } else {
      return null; // boxed in — give up on this candidate
    }
  }

  // Still short of a required technique or leap? One last try before the goal.
  for (const kind of [...techQueue]) {
    if (kind === 'glide' && topOf(c.current) < LIMITS.topMin + 2.6) { PATTERNS.tower(c); PATTERNS.tower(c); }
    if (PATTERNS[TECHNIQUE_PATTERN[kind]](c)) { techQueue.splice(techQueue.indexOf(kind), 1); c.segments.push(TECHNIQUE_PATTERN[kind]); }
  }
  while (leaps < wantedLeaps && PATTERNS.leap(c)) { c.segments.push('leap'); leaps++; }

  // Goal platform: a comfortable, wide final jump.
  const goalPlatform = c.tryPlace(cur => c.ahead(cur, {
    gap: r.range(0.8, 2.2), dx: r.range(-1.5, 1.5), rise: c.rise(-0.4, 0.6), width: 4, depth: 4,
  }), { band: [0, c.k.band[1]], attempts: 150 });
  if (!goalPlatform) return null;

  // Top up false paths anywhere along the finished route if forks fell short
  const positions = Array.from({ length: Math.max(0, c.main.length - 3) }, (_, k) => k + 1);
  for (let k = positions.length - 1; k > 0; k--) { const m = r.int(0, k); [positions[k], positions[m]] = [positions[m], positions[k]]; }
  for (const pos of positions) {
    if (c.branches.length >= wanted) break;
    if (forkAllowed(pos)) growFalsePath(c, pos, branchLength());
  }

  // Shortcuts: somewhere along the finished route (longer skips first — they save hops)
  for (const span of [4, 3, 2]) {
    const starts = Array.from({ length: Math.max(0, c.main.length - span - 1) }, (_, k) => k + 1);
    for (let k = starts.length - 1; k > 0; k--) { const m = r.int(0, k); [starts[k], starts[m]] = [starts[m], starts[k]]; }
    for (const from of starts) {
      if (c.shortcuts.length >= wantedShortcuts) break;
      if (c.shortcuts.some(sc => from < sc.to + 1 && from + span > sc.from - 1)) continue;   // keep them apart
      growShortcut(c, from, span);
    }
  }

  // Cheap pre-checks: don't spend an audit on a design that can't meet the fun requirements
  const travel = routeTravel(c.platforms, c.main);
  const short = [
    [c.branches.length < req.falsePaths, 'TOO_FEW_FALSE_PATHS'],
    [c.dashGaps.length < req.dashes, 'TOO_FEW_DASHES'],
    ...Object.entries(wantedTech).map(([k, n]) => [c.techniques[k] < n, `TOO_FEW_${k.toUpperCase()}`]),
    [leaps < req.longDrops, 'TOO_FEW_DROPS'],
    [c.shortcuts.length < req.shortcuts, 'TOO_FEW_SHORTCUTS'],
    [travel.directions.size < req.directions, 'TOO_FEW_DIRECTIONS'],
    [travel.lateralRatio < req.lateralRatio, 'TOO_LITTLE_LATERAL'],
    [travel.verticalRatio < req.verticalRatio, 'TOO_LITTLE_VERTICAL'],
    [travel.turns < req.turns, 'TOO_FEW_TURNS'],
  ].filter(([fails]) => fails).map(([, code]) => code);
  if (short.length) return { precheck: short };

  const variant = r.pick(VARIANTS);
  const enemies = placeEnemies(c, difficulty, wantedEncounters);

  // Renumber: main route first (0..n-1, in order), then false-path platforms, then shortcuts
  const order = [...c.main, ...c.branches.flatMap(b => b.platforms), ...c.shortcuts.flatMap(sc => sc.platforms)];
  const renumber = new Map(order.map((old, i) => [old, i]));
  const platforms = order.map(i => c.platforms[i]);
  const falsePaths = c.branches.map(b => ({ junction: b.junction, platforms: b.platforms.map(i => renumber.get(i)) }));
  const shortcuts = c.shortcuts.map(sc => ({ from: sc.from, to: sc.to, platforms: sc.platforms.map(i => renumber.get(i)) }));

  return {
    name: `${r.pick(ADJECTIVES)} ${r.pick(NOUNS)}`,
    spawn: { x: 0, y: 0.5, z: 0 },
    platforms,
    goal: { x: goalPlatform.x, y: topOf(goalPlatform), z: goalPlatform.z, radius: 1 },
    enemies: enemies.map(e => (e.platform === undefined ? e : { ...e, platform: renumber.get(e.platform) })),
    abilities: [...abilities],
    meta: { generated: true, difficulty, ...(theme ? { theme } : {}), variant, segments: c.segments, mainRoute: c.main.length, falsePaths, shortcuts, techniques: wantedTech },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Quality gate for generated levels — stricter than the audit's pass/fail:
 *   - playability audit: no errors, no warnings
 *   - the verified route is exactly the designed main route (no accidental shortcuts)
 *   - fun audit passes at the level's difficulty (variety, directions, travel, turns, false paths)
 *   - every off-route platform belongs to a recoverable false path (no stray branches)
 *   - encounters are placed sensibly and the combat bot beats them losing ≤ 1 heart
 * Returns null when accepted, otherwise the rejection reason codes.
 */
export function generatedRejections(audit, level) {
  const reasons = [...audit.errors.map(e => e.code), ...audit.warnings.map(w => w.code)];
  if (audit.ok) {
    const designed = level.meta.mainRoute;
    const route = [audit.route[0]?.from ?? 0, ...audit.route.map(e => e.to)];
    if (route.length !== designed || route.some((p, i) => p !== i)) reasons.push('DESIGN_SKIPPED');
    const fun = auditFun(level, audit, level.meta.difficulty);
    reasons.push(...fun.issues.map(i => i.code));
    // every branch is a designed false path (dead end) or a designed shortcut (alternate)
    const designedShortcut = new Set((level.meta.shortcuts || []).flatMap(sc => sc.platforms));
    for (const b of fun.metrics?.branches || []) {
      const shortcut = b.platforms.every(i => designedShortcut.has(i));
      if (shortcut ? b.kind !== 'alternate' : b.kind !== 'false') reasons.push(shortcut ? 'SHORTCUT_BROKEN' : 'STRAY_BRANCH');
    }
    if (!reasons.length) reasons.push(...auditEncounters(level, audit).errors.map(e => e.code)); // costliest check last
  }
  return reasons.length ? [...new Set(reasons)] : null;
}

export function acceptGenerated(audit, level) {
  return generatedRejections(audit, level) === null;
}

/**
 * Generate a level that passes the audit with zero warnings.
 * Deterministic for a given (seed, difficulty).
 * @returns {{ level, audit, attempts, rejections: string[] }}
 */
export function generateLevel({ seed = 1, difficulty = 0.5, theme = null, maxAttempts = 800, startAttempt = 1, trusted = false, abilities = null, techniques = null } = {}) {
  abilities ||= abilitiesForDifficulty(difficulty);
  if (theme && !THEMES[theme]) throw new Error(`Unknown theme "${theme}" (${THEME_NAMES.join(', ')})`);
  // startAttempt: skip candidates already known to be rejected (same result, faster).
  // trusted: with startAttempt, skip re-validating a candidate the test suite already verifies.
  const rejections = [];
  for (let attempt = startAttempt - 1; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(theme ? hashSeed('level', seed, difficulty.toFixed(3), theme, attempt) : hashSeed('level', seed, difficulty.toFixed(3), attempt));
    const level = buildCandidate(rng, difficulty, theme, { abilities, techniques });
    if (!level) { rejections.push('BOXED_IN'); continue; }
    if (level.precheck) { rejections.push(...level.precheck); continue; }
    if (trusted) {
      level.meta = { ...level.meta, seed, attempts: attempt + 1 };
      return { level, audit: null, attempts: attempt + 1, rejections };
    }
    const audit = auditLevel(level);
    const reasons = generatedRejections(audit, level);
    if (!reasons) {
      level.meta = { ...level.meta, seed, attempts: attempt + 1 };
      return { level, audit, attempts: attempt + 1, rejections };
    }
    rejections.push(...reasons);
  }
  const counts = {};
  for (const code of rejections) counts[code] = (counts[code] || 0) + 1;
  const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} ×${n}`).join(', ');
  throw new Error(`Could not generate an acceptable level for seed ${seed} at difficulty ${difficulty} after ${maxAttempts} attempts (${summary})`);
}

export { RULES };
