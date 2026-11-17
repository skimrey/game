/**
 * Run levels — every run (roguelite) plays a new set of layouts, grown from the
 * hand-written campaign (levels/index.js) and kept in check by the same audits the
 * campaign passes.
 *
 *   hand-made levels  are remixed: mirrored left↔right (half the time), every platform
 *                     nudged a little (sideways, forward, up/down) and resized a touch,
 *                     enemies re-timed. The tutorial level is nudged gently; later ones more.
 *   generated levels  are re-generated from the hand-picked spec (theme and difficulty)
 *                     with a new seed mixed from the run seed.
 *
 * Mechanical checks (checkCandidate) — a candidate replaces the base level only if it
 *   - passes the level audit (completable by the bot in the real physics, fair jumps,
 *     no warnings), the fun audit at the base level's design difficulty and the
 *     encounter audit
 *   - uses at least every move the base level uses (dash, long drops, stomps, spikers,
 *     shortcuts, false paths) — so every tier keeps the full movement vocabulary and the
 *     dash lesson still teaches the dash gently
 *   - keeps its challenge inside the window that preserves the campaign's ramp: never
 *     below the level before it (base or remix) and never above the base level after it
 *   - keeps its par time within ±30 % of the base level's
 *   - stays visibly distinct from every other level of the run (campaignAudit signatures)
 * Otherwise the next candidate is tried; after a few, the base level is used as is.
 * Any mix of base and accepted levels therefore passes the campaign audit.
 */
import { TIERS, GENERATED_CAMPAIGN, handcraftedLevels, TIER_ABILITIES } from './index.js';
import { generateLevel, mulberry32, hashSeed, THEMES } from './generator.js';
import { describeLevel, signatureDistance, CAMPAIGN_RULES } from './campaignAudit.js';
import { auditLevel } from './audit.js';
import { designDifficulty } from './funAudit.js';
import { CAMPAIGN_SIGNATURES } from './campaignSignatures.js';

export const RUN_RULES = {
  PAR_RANGE: [0.7, 1.3],
  MAX_SHIFT: 0.9,             // challenge may move at most this far from the base level's
  REMIX_TRIES: 10,            // hand-made slots: remixes to try
  GENERATED_TRIES: 3,         // generated slots: fresh layouts to try first …
  GENERATED_REMIX_TRIES: 6,   // … then remixes of the hand-picked layout
};

const clone = o => JSON.parse(JSON.stringify(o));
const round = v => Math.round(v * 1e4) / 1e4;

/**
 * What the run checks need to know about a level (describeLevel without the audits):
 * the campaign's own signatures are saved in levels/campaignSignatures.js, so a run can start
 * planning right away instead of re-auditing the whole campaign first.
 */
export function signatureOf(desc) {
  const f = desc.features;
  return {
    name: desc.name, tier: desc.tier, challenge: round(desc.challenge), parTime: round(desc.parTime), rating: round(desc.rating),
    moves: { ...desc.moves }, firstDash: desc.firstDash === null ? null : round(desc.firstDash),
    features: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? v.map(round) : round(v)])),
  };
}

/** Signatures of the hand-written campaign: saved ones when they match the levels, else computed. */
export function campaignSignatures(slots = baseCampaign()) {
  const saved = CAMPAIGN_SIGNATURES;
  if (saved.length === slots.length && saved.every((sig, i) => sig.name === slots[i].level.name && sig.tier === slots[i].tier)) return saved;
  return slots.map(slot => signatureOf(describeLevel(slot.level)));
}

/** The base campaign as plain data, in order, with tiers and slots. */
export function baseCampaign(tiers = TIERS) {
  const out = [];
  for (const tier of tiers) {
    tier.levels.forEach((level, i) => {
      const spec = GENERATED_CAMPAIGN.find(s => s.seed === level.meta?.seed && s.theme === level.meta?.theme && s.difficulty === level.meta?.difficulty) || null;
      out.push({ level, tier: tier.id, slot: i, capstone: i === tier.levels.length - 1, spec, handmade: !!level.meta?.handmade });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Remixing a hand-made level
// ---------------------------------------------------------------------------
function supportOf(level, pt) {
  return level.platforms.findIndex(p => Math.abs(p.y + p.height / 2 - pt.y) < 0.05 && Math.abs(pt.x - p.x) <= p.width / 2 && Math.abs(pt.z - p.z) <= p.depth / 2);
}

/**
 * A remix of a hand-made level. `strength` 0..1 scales the nudges (metres).
 */
export function remixLevel(base, seed, { strength = 1, mirror = null } = {}) {
  const rng = mulberry32(seed >>> 0);
  const flip = (mirror ?? rng() < 0.5) ? -1 : 1;
  const level = clone(base);
  const spawnOn = supportOf(base, base.spawn), goalOn = supportOf(base, base.goal);
  const j = (a) => (rng() * 2 - 1) * a * strength;
  level.platforms = base.platforms.map((p, i) => {
    const q = { ...p, x: flip * p.x + j(0.7), y: p.y + j(0.25), z: p.z + j(0.45) };
    if (i !== spawnOn) { q.width = Math.max(1.6, p.width * (1 + j(0.1))); q.depth = Math.max(1.6, p.depth * (1 + j(0.1))); }
    return q;
  });
  const follow = (pt, index) => {
    if (index < 0) return { ...pt, x: flip * pt.x };
    const a = base.platforms[index], b = level.platforms[index];
    return { ...pt, x: b.x + flip * (pt.x - a.x), y: pt.y + (b.y - a.y), z: b.z + (pt.z - a.z) };
  };
  level.spawn = follow(base.spawn, spawnOn);
  level.goal = follow(base.goal, goalOn);
  level.enemies = (base.enemies || []).map(e => {
    const q = { ...e, phase: ((e.phase ?? 0) + j(0.15) + 1) % 1 };
    if (e.type === 'wisp') {
      q.from = [flip * e.from[0] + j(0.3), e.from[1], e.from[2] + j(0.3)];
      q.to = [flip * e.to[0] + j(0.3), e.to[1], e.to[2] + j(0.3)];
    } else if (e.lane && (e.axis || 'x') === 'z') q.lane = -e.lane;
    return q;
  });
  level.meta = { ...base.meta, remix: { seed, mirrored: flip < 0, strength } };
  return level;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
const MOVES = ['jump', 'dash', 'spring', 'glide', 'double', 'longDrop', 'stomp', 'poundOrDash', 'shortcut', 'falsePath'];

/**
 * Is `desc` (describeLevel of a candidate for slot i) acceptable?
 *   base      signatures of every base level (same order; see signatureOf)
 *   accepted  signatures of the levels the run already settled on for slots < i
 */
export function checkCandidate(desc, i, base, accepted, { firstDashSlot = -1 } = {}) {
  const issues = [];
  const b = base[i];
  if (!desc.audit.ok || desc.audit.warnings.length) issues.push(`audit: ${[...desc.audit.errors, ...desc.audit.warnings].map(e => e.code).join(', ')}`);
  if (!desc.fun.ok) issues.push(`fun: ${desc.fun.issues.map(e => e.code).join(', ')}`);
  if (!desc.enc.ok) issues.push(`encounters: ${desc.enc.errors.map(e => e.code).join(', ')}`);
  for (const move of MOVES) if (b.moves[move] && !desc.moves[move]) issues.push(`drops ${move}`);
  // the ramp: between the levels either side (base or remix), near its own base
  const tol = CAMPAIGN_RULES.CHALLENGE_TOLERANCE;
  const lower = i > 0 ? Math.max(base[i - 1].challenge, accepted[i - 1]?.challenge ?? -Infinity) - tol : -Infinity;
  const upper = i + 1 < base.length ? base[i + 1].challenge + tol : Infinity;
  if (desc.challenge < lower) issues.push(`challenge ${desc.challenge.toFixed(2)} below the level before (${lower.toFixed(2)})`);
  if (desc.challenge > upper) issues.push(`challenge ${desc.challenge.toFixed(2)} above the level after (${upper.toFixed(2)})`);
  if (Math.abs(desc.challenge - b.challenge) > RUN_RULES.MAX_SHIFT) issues.push(`challenge ${desc.challenge.toFixed(2)} too far from ${b.challenge.toFixed(2)}`);
  const par = desc.parTime / b.parTime;
  if (par < RUN_RULES.PAR_RANGE[0] || par > RUN_RULES.PAR_RANGE[1]) issues.push(`par time ×${par.toFixed(2)}`);
  if (i > 0) {
    const prevPar = Math.max(base[i - 1].parTime, accepted[i - 1]?.parTime ?? 0);
    if (desc.parTime > prevPar * CAMPAIGN_RULES.MAX_PAR_GROWTH) issues.push('par time cliff');
  }
  if (i + 1 < base.length && base[i + 1].parTime > desc.parTime * CAMPAIGN_RULES.MAX_PAR_GROWTH) issues.push('par time cliff after');
  if (i === firstDashSlot && (desc.firstDash === null || desc.firstDash > CAMPAIGN_RULES.FIRST_DASH_MAX)) issues.push('the dash lesson’s first dash is too hard');
  // a name of its own (best times are kept per name)
  if (base.some((d, k) => k !== i && d.name === desc.name) || accepted.some((d, k) => d && k !== i && d.name === desc.name)) issues.push(`name "${desc.name}" taken`);
  // distinct from every other level, base or accepted (its own base level doesn't count)
  const others = [];
  base.forEach((d, k) => { if (k !== i) others.push(d); });
  accepted.forEach((d, k) => { if (d && k !== i && d !== base[k]) others.push(d); });
  for (const o of others) {
    const min = o.tier === desc.tier ? CAMPAIGN_RULES.MIN_DISTANCE_IN_TIER : CAMPAIGN_RULES.MIN_DISTANCE;
    const d = signatureDistance(desc, o);
    if (d < min) { issues.push(`too like "${o.name}" (${d.toFixed(2)})`); break; }
  }
  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Planning a run
// ---------------------------------------------------------------------------
/**
 * Sequential planner: next() settles the next slot (a few candidates at most) and
 * returns { index, level, source: 'remix' | 'generated' | 'base', tries, issues }.
 * The campaign's signatures come from levels/campaignSignatures.js (checked by the tests).
 */
export function createRunPlanner(runSeed, { tiers = TIERS, baseDescriptions = null } = {}) {
  const slots = baseCampaign(tiers);
  let base = baseDescriptions;
  const accepted = [];
  const firstDashSlot = () => base.findIndex(d => d.moves.dash);
  let index = 0;

  function candidateFor(slot, i, attempt) {
    if (slot.spec && attempt < RUN_RULES.GENERATED_TRIES) {
      const seed = hashSeed('run', runSeed, slot.spec.seed, attempt);
      const { level } = generateLevel({ seed, difficulty: slot.spec.difficulty, theme: slot.spec.theme, abilities: TIER_ABILITIES[slot.tier], maxAttempts: 120 });
      if (!level) return null;
      const theme = THEMES[slot.spec.theme];
      if (theme) level.hint = `${theme.label}: ${theme.about}.`;
      return level;
    }
    const d = designDifficulty(slot.level);
    const k = slot.spec ? attempt - RUN_RULES.GENERATED_TRIES : attempt;
    const strength = (slot.spec ? 0.55 : 0.35 + 0.5 * Math.min(1, d / 0.25)) * (k < 5 ? 1 : 0.6);
    return remixLevel(slot.level, hashSeed('remix', runSeed, i, attempt), { strength });
  }

  return {
    slots,
    get done() { return index >= slots.length; },
    next() {
      if (index >= slots.length) return null;
      base ||= campaignSignatures(slots);
      const i = index++;
      const slot = slots[i];
      const tries = slot.spec ? RUN_RULES.GENERATED_TRIES + RUN_RULES.GENERATED_REMIX_TRIES : RUN_RULES.REMIX_TRIES;
      const issues = [];
      if (runSeed) {
        for (let attempt = 0; attempt < tries; attempt++) {
          const level = candidateFor(slot, i, attempt);
          if (!level) continue;
          level.tier = slot.tier;
          level.abilities = [...(TIER_ABILITIES[slot.tier] || ['dash'])];
          if (slot.level.hint && !slot.spec) level.hint = slot.level.hint;
          const audit = auditLevel(level);
          if (!audit.ok || audit.warnings.length) { issues.push(`audit: ${[...audit.errors, ...audit.warnings].map(e => e.code).join(', ')}`); continue; }
          let desc;
          try { desc = describeLevel(level, audit); } catch (error) { issues.push(`describe: ${error.message}`); continue; }
          const check = checkCandidate(desc, i, base, accepted, { firstDashSlot: firstDashSlot() });
          if (check.ok) {
            accepted[i] = signatureOf(desc);
            return { index: i, level, source: slot.spec && attempt < RUN_RULES.GENERATED_TRIES ? 'generated' : 'remix', tries: attempt + 1, issues };
          }
          issues.push(check.issues.join('; '));
        }
      }
      accepted[i] = base[i];
      return { index: i, level: slot.level, source: 'base', tries, issues };
    },
  };
}

/** Plan a whole run at once (tests, tools). */
export function planRun(runSeed, options) {
  const planner = createRunPlanner(runSeed, options);
  const out = [];
  while (!planner.done) out.push(planner.next());
  return out;
}

export { handcraftedLevels };
