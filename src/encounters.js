/**
 * Encounters — which mini-games a run plays, and where: maximum variety.
 *
 * A run has three kinds of encounter, in this order through the campaign:
 *   checkpoint  an arcade cabinet halfway through some levels (levels 2, 4, 6, 8, 9, 11)
 *   boss        at the end of every level (the region's capstone game on its last level)
 *   travel      a vehicle trip between regions (meadow → canyon → alpine → starlit)
 *
 * There are more games than encounters, so **no game is ever repeated in a run**: each is
 * played once, at the difficulty of where it falls in the campaign — a game you first meet
 * near the end comes at its harder settings straight away. Every run draws a different
 * selection and order (and the leftover games wait for the next run):
 *   - each region's last level is its capstone (meadow Copycat, canyon Quick Draw, alpine
 *     Avalanche Run, starlit Star Invaders)
 *   - games that can be a boss or a checkpoint go wherever the run needs them
 *   - terrain fits: the sled chase only in the snow, the moon lander only under the stars,
 *     and each crossing's vehicle suits it (raft or plane out of the meadow, mine cart or plane
 *     into the mountains, snowmobile or plane up to the stars — the plane at most once)
 * Only if a run ever had more encounters than games would a game come back (at most three
 * times, never twice in a row).
 */
import { mulberry32, hashSeed } from './levelGenerator.js';
import { MODES, CAPSTONES, TRAVEL_ROUTES, rolesOf } from './battle/index.js';

export const ENCOUNTER_RULES = {
  maxPerGame: 3,                             // only ever reached when games run out
  checkpointLevels: [1, 3, 5, 7, 8, 10],     // campaign indices with an arcade checkpoint (levels 2, 4, 6, 8, 9, 11)
  affinity: { sled: ['alpine'], lander: ['starlit'] },   // games that only fit some regions
  difficulty: [0.08, 0.95],                  // the first encounter's difficulty … the last's
  capstoneBonus: 0.06,
};

const shuffle = (list, rng) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

/**
 * Plan a run. slots: [{ tier, capstone }] in campaign order.
 * Returns [{ index, checkpoint, boss, travel }] — each { mode, role, iteration, difficulty }
 * or null (travel: the trip after this level, if it ends a region).
 */
export function planEncounters(runSeed, slots) {
  const R = ENCOUNTER_RULES;
  const rng = mulberry32(hashSeed('encounters', runSeed));
  // the sequence of encounters
  const seq = [];
  slots.forEach((s, i) => {
    if (R.checkpointLevels.includes(i)) seq.push({ level: i, role: 'checkpoint', tier: s.tier });
    seq.push({ level: i, role: 'boss', tier: s.tier, capstone: s.capstone });
    const next = slots[i + 1];
    const route = next && next.tier !== s.tier ? TRAVEL_ROUTES.find(r => r.from === s.tier && r.to === next.tier) : null;
    if (route) seq.push({ level: i, role: 'travel', tier: s.tier, route });
  });
  const fits = (mode, e) => rolesOf(mode).includes(e.role) && (!R.affinity[mode] || R.affinity[mode].includes(e.tier))
    && !(e.role === 'travel' && !e.route.vehicles.includes(mode))
    && !Object.values(CAPSTONES).includes(mode);            // capstone games only at their capstones
  // capstones first, then the rest by backtracking so that nothing repeats
  const used = new Map();
  const assign = new Array(seq.length).fill(null);
  seq.forEach((e, k) => { if (e.role === 'boss' && e.capstone && CAPSTONES[e.tier]) { assign[k] = CAPSTONES[e.tier]; used.set(assign[k], 1); } });
  const order = seq.map((_, k) => k).filter(k => !assign[k]);
  // hardest to fill first: fewest candidates
  const candidates = k => Object.keys(MODES).filter(m => fits(m, seq[k]));
  order.sort((a, b) => candidates(a).length - candidates(b).length);
  let limit = 1;
  const solve = n => {
    if (n === order.length) return true;
    const k = order[n];
    // games made for this role first (so the games that can be either stay free where they're needed)
    const list = candidates(k);
    const own = shuffle(list.filter(m => rolesOf(m).length === 1), rng), either = shuffle(list.filter(m => rolesOf(m).length > 1), rng);
    for (const mode of [...own, ...either]) {
      if ((used.get(mode) || 0) >= limit) continue;
      // never the same game twice in a row
      if (assign[k - 1] === mode || assign[k + 1] === mode) continue;
      assign[k] = mode; used.set(mode, (used.get(mode) || 0) + 1);
      if (solve(n + 1)) return true;
      assign[k] = null; used.set(mode, used.get(mode) - 1);
    }
    return false;
  };
  while (!solve(0) && limit < R.maxPerGame) limit++;
  // difficulty: by place in the whole sequence (a game met late comes at its harder settings)
  const [d0, d1] = R.difficulty;
  const count = {};
  const entries = seq.map((e, k) => {
    const mode = assign[k];
    count[mode] = (count[mode] || 0) + 1;
    const d = Math.min(1, d0 + (d1 - d0) * (k / Math.max(1, seq.length - 1)) + (e.capstone ? R.capstoneBonus : 0));
    return { ...e, mode, iteration: count[mode] - 1, difficulty: d };
  });
  return slots.map((s, i) => {
    const pick = role => { const e = entries.find(x => x.level === i && x.role === role); return e ? { mode: e.mode, role, iteration: e.iteration, difficulty: e.difficulty, ...(e.route ? { from: e.route.from, to: e.route.to } : {}) } : null; };
    return { index: i, checkpoint: pick('checkpoint'), boss: pick('boss'), travel: pick('travel') };
  });
}

/** Times each game appears in a plan. */
export function gameCounts(plan) {
  const out = {};
  for (const e of plan) for (const x of [e.checkpoint, e.boss, e.travel]) if (x) out[x.mode] = (out[x.mode] || 0) + 1;
  return out;
}

/** All encounters of a plan in play order (for the star rating and the test menu). */
export function encounterList(plan) {
  return plan.flatMap(e => [e.checkpoint, e.boss, e.travel].filter(Boolean).map(x => ({ ...x, level: e.index })));
}
