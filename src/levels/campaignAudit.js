/**
 * Campaign audit — the campaign as a whole, beyond each level on its own.
 *
 *   DISTINCT      every level must look and play visibly differently from every other:
 *                 a signature (length, width, height range, net rise, the height profile
 *                 along the route, platform size, sideways / up-down travel and the moves,
 *                 shortcuts, dead ends and fights it asks for) must differ by at least
 *                 CAMPAIGN_RULES.MIN_DISTANCE — more within a tier, where levels share a biome
 *   PROGRESSION   challenge never drops from one level to the next, each tier is harder than
 *                 the one before, and the course length grows without cliffs
 *   VOCABULARY    every movement option is taught gently before it is required, and keeps
 *                 being used in every later tier: jumps, the air dash, long drops, stomping,
 *                 ground pound / dash attacks (spikers), shortcuts and false paths — and each
 *                 region's own technique: bounce pads (meadow), the air dash (canyon),
 *                 gliding (alpine), the double jump (starlit). The first level to require a
 *                 technique must teach it with a hint.
 *
 * Challenge = the audit rating (jump precision + length, 0–10) plus what else the level
 * asks for: each required air dash (timing) and each enemy encounter.
 */
import { auditLevel, topOf, RULES } from './audit.js';
import { auditFun, designDifficulty } from './funAudit.js';
import { auditEncounters } from './encounterAudit.js';

export const CAMPAIGN_RULES = {
  MIN_DISTANCE: 0.55,          // any two levels
  MIN_DISTANCE_IN_TIER: 0.7,   // two levels of the same tier (same biome: only the layout tells them apart)
  CHALLENGE_TOLERANCE: 0.05,   // challenge may not drop by more than this from one level to the next
  TIER_STEP: 0.4,              // each tier's mean challenge must beat the previous tier's by this much
  MAX_PAR_GROWTH: 2.2,         // par time may at most grow by this factor from one level to the next
  FIRST_DASH_MAX: 0.7,         // the first required dash must be comfortable (dash difficulty)
  DASH_WEIGHT: 0.6,            // challenge per required air dash (up to 3)
  ENCOUNTER_WEIGHT: 0.3,       // challenge per encounter (up to 5)
  TECHNIQUE_WEIGHT: 0.35,      // challenge per *different* special technique a level needs (more to juggle)
};

/** Special moves on a route (dash, glide, double jump, bounce pads) and how many different kinds. */
const SPECIALS = ['dash', 'glide', 'double', 'spring'];
const specials = moves => SPECIALS.reduce((n, k) => n + (moves[k] || 0) * (k === 'spring' ? 0.4 : 1), 0);   // bounce pads do most of the work
const techniques = moves => SPECIALS.filter(k => moves[k] > 0).length;
/** The region technique each move is taught as. */
export const TECHNIQUES = { spring: 'bounce pads', dash: 'the air dash', glide: 'gliding', double: 'the double jump' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Everything the campaign checks need about one level (audits are the expensive part). */
export function describeLevel(level, audit = auditLevel(level)) {
  const fun = auditFun(level, audit, designDifficulty(level));
  const enc = auditEncounters(level, audit);
  const { platforms } = level;
  const route = [audit.route[0]?.from ?? 0, ...audit.route.map(e => e.to)];
  const onRoute = route.map(i => platforms[i]);
  const tops = onRoute.map(topOf);
  const xs = onRoute.map(p => p.x), zs = onRoute.map(p => p.z);
  // height profile: route platform tops at 5 points along the route, relative to the start
  // and scaled by the level's own height range — the *shape* (up, down, valley, peak)
  const range = Math.max(0.5, Math.max(...tops) - Math.min(...tops));
  const profile = [0, 0.25, 0.5, 0.75, 1].map(t => (tops[Math.round(t * (tops.length - 1))] - tops[0]) / range);
  // sizes compare by ratio (twice as tall reads as clearly different at any size)
  const log = (v, unit) => Math.log2(Math.max(v, unit / 4) / unit) / 2;
  const m = audit.metrics, f = fun.metrics;
  const enemies = level.enemies || [];
  return {
    name: level.name,
    tier: level.tier ?? null,
    audit, fun, enc,
    rating: m.rating,
    parTime: m.parTime,
    challenge: m.rating + CAMPAIGN_RULES.DASH_WEIGHT * Math.min(3, specials(m.moves)) + CAMPAIGN_RULES.TECHNIQUE_WEIGHT * techniques(m.moves) + CAMPAIGN_RULES.ENCOUNTER_WEIGHT * Math.min(5, enc.metrics.encounters),
    moves: {
      jump: m.moves.jump > 0,
      dash: m.moves.dash > 0,
      spring: (m.moves.spring || 0) > 0,
      glide: (m.moves.glide || 0) > 0,
      double: (m.moves.double || 0) > 0,
      longDrop: m.moves.longDrop > 0,
      stomp: enemies.some(e => e.type === 'crawler' || e.type === 'wisp'),
      poundOrDash: enemies.some(e => e.type === 'spiker'),
      shortcut: f.shortcuts > 0,
      falsePath: f.falsePaths > 0,
    },
    firstDash: audit.route.find(e => e.kind === 'dash')?.difficulty ?? null,
    features: {
      length: log(Math.max(...zs) - Math.min(...zs), 10),
      width: log(Math.max(...xs) - Math.min(...xs) + 2, 6),
      height: log(Math.max(...tops) - Math.min(...tops) + 1, 2),
      netRise: Math.sign(tops.at(-1) - tops[0]) * Math.log2(1 + Math.abs(tops.at(-1) - tops[0])) / 3,
      profile,
      platformSize: onRoute.reduce((s, p) => s + Math.min(p.width, p.depth), 0) / onRoute.length / 4,
      lateral: clamp(f.lateralRatio, 0, 1.5) / 1.5,
      vertical: clamp(f.verticalRatio, 0, 0.6) / 0.6,
      dashes: Math.min(3, specials(m.moves)) / 3,
      techniques: techniques(m.moves) / 4,
      drops: Math.min(3, m.moves.longDrop) / 3,
      shortcuts: Math.min(2, f.shortcuts) / 2,
      falsePaths: Math.min(5, f.falsePaths) / 5,
      encounters: Math.min(5, enc.metrics.encounters) / 5,
    },
  };
}

/** Signature distance between two described levels (0 = identical). */
export function signatureDistance(a, b) {
  const fa = a.features, fb = b.features;
  let sum = 0;
  for (const key of Object.keys(fa)) {
    if (key === 'profile') fa.profile.forEach((v, i) => { sum += 0.3 * (v - fb.profile[i]) ** 2; });
    else sum += (fa[key] - fb[key]) ** 2;
  }
  return Math.sqrt(sum);
}

const MOVE_NAMES = {
  jump: 'jumping', dash: 'the air dash', spring: 'bounce pads', glide: 'gliding', double: 'the double jump', longDrop: 'long drops', stomp: 'stomping enemies',
  poundOrDash: 'ground pound / dash attacks (spikers)', shortcut: 'shortcuts', falsePath: 'false paths',
};

/**
 * Audit a whole campaign.
 * @param levels  campaign levels in order (each with `.tier`)
 * @param tiers   [{ id, levels }] in order (see levels/index.js TIERS)
 * @param described  optional pre-computed describeLevel() results (same order)
 * @returns {{ ok, issues: [{code, message}], levels: described[], distances }}
 */
export function auditCampaign(levels, tiers, described = levels.map(l => describeLevel(l))) {
  const issues = [];
  const issue = (code, message) => issues.push({ code, message });
  const R = CAMPAIGN_RULES;

  // --- Distinct ---------------------------------------------------------------
  const distances = [];
  for (let i = 0; i < described.length; i++) {
    for (let j = i + 1; j < described.length; j++) {
      const a = described[i], b = described[j];
      const d = signatureDistance(a, b);
      const sameTier = a.tier !== null && a.tier === b.tier;
      distances.push({ a: a.name, b: b.name, distance: d, sameTier });
      const min = sameTier ? R.MIN_DISTANCE_IN_TIER : R.MIN_DISTANCE;
      if (d < min) issue('TOO_SIMILAR', `"${a.name}" and "${b.name}" are too alike (signature distance ${d.toFixed(2)} < ${min}${sameTier ? ', same tier' : ''})`);
    }
  }

  // --- Progression ------------------------------------------------------------
  for (let i = 1; i < described.length; i++) {
    const a = described[i - 1], b = described[i];
    if (b.challenge < a.challenge - R.CHALLENGE_TOLERANCE) {
      issue('CHALLENGE_DROP', `Challenge drops from ${a.challenge.toFixed(2)} ("${a.name}") to ${b.challenge.toFixed(2)} ("${b.name}")`);
    }
    if (b.parTime > a.parTime * R.MAX_PAR_GROWTH) {
      issue('LENGTH_CLIFF', `Par time jumps from ${a.parTime.toFixed(1)}s ("${a.name}") to ${b.parTime.toFixed(1)}s ("${b.name}")`);
    }
  }
  const tierMean = tier => {
    const list = described.filter(d => d.tier === tier.id);
    return list.reduce((s, d) => s + d.challenge, 0) / Math.max(1, list.length);
  };
  for (let t = 1; t < tiers.length; t++) {
    const before = tierMean(tiers[t - 1]), after = tierMean(tiers[t]);
    if (after < before + R.TIER_STEP) issue('FLAT_TIERS', `Tier "${tiers[t].id}" (mean challenge ${after.toFixed(2)}) is not clearly harder than "${tiers[t - 1].id}" (${before.toFixed(2)})`);
  }

  // --- Vocabulary -------------------------------------------------------------
  for (const [move, name] of Object.entries(MOVE_NAMES)) {
    const first = described.findIndex(d => d.moves[move]);
    if (first === -1) { issue('MOVE_UNUSED', `No level uses ${name}`); continue; }
    const firstTier = tiers.findIndex(t => t.id === described[first].tier);
    for (let t = Math.max(firstTier + 1, 0); t < tiers.length; t++) {
      if (!described.some(d => d.tier === tiers[t].id && d.moves[move])) issue('MOVE_DROPPED', `Tier "${tiers[t].id}" never uses ${name} (introduced in "${described[first].name}")`);
    }
  }
  const firstDash = described.find(d => d.firstDash !== null);
  if (firstDash && firstDash.firstDash > R.FIRST_DASH_MAX) {
    issue('HARSH_INTRODUCTION', `The first required air dash ("${firstDash.name}") is at ${(firstDash.firstDash * 100).toFixed(0)}% of the dash's limit (teach it at ≤ ${R.FIRST_DASH_MAX * 100}%)`);
  }
  for (const [move, name] of Object.entries(TECHNIQUES)) {
    const teaching = described.find(d => d.moves[move]);
    if (teaching && !levels[described.indexOf(teaching)].hint) issue('UNTAUGHT', `"${teaching.name}" is the first level to require ${name} but shows no hint`);
  }

  return { ok: issues.length === 0, issues, levels: described, distances };
}

export { RULES };
