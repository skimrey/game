/**
 * Encounters — which mini-games a run plays, and where: maximum variety.
 *
 * A run has three kinds of encounter, in this order through the campaign:
 *   checkpoint  an arcade cabinet halfway through one level per stage (levels 2, 5, 8, 11) — fewer
 *               games per run than before, so each one counts (the home arcade replays them)
 *   boss        at the end of every level (the zone's capstone game on a stage's last level)
 *   travel      a vehicle trip between the run's zones (slots carry each level's zone —
 *               world/zones.js; without one, a stage is played in its classic zone)
 *
 * There are more games than encounters, so **no game is ever repeated in a run**: each is
 * played once, at the difficulty of where it falls in the campaign — a game you first meet
 * near the end comes at its harder settings straight away. Every run draws a different
 * selection and order (and the leftover games wait for the next run):
 *   - each stage's last level is the capstone of the zone it's played in (meadow Copycat,
 *     lagoon Bubble Pop, canyon Quick Draw, grove Spore Bomber, alpine Avalanche Run, volcano
 *     Lava Guard, crystal Shard Storm, starlit Star Invaders) — the capstones of the zones a
 *     run doesn't visit sit that run out
 *   - games that can be a boss or a checkpoint go wherever the run needs them
 *   - terrain fits: the sled chase only in the snow, the moon lander only under the stars,
 *     and each crossing's vehicle suits one of the zones it joins (rafts on the water, mine
 *     carts through rock, snowmobiles over snow — the plane anywhere, at most once)
 * A game never comes back in the same run (maxPerGame 1) — the games you meet are learned across
 * runs, and within a run all that grows is the difficulty: it rises with each encounter's place in
 * the run (ENCOUNTER_RULES.difficulty, first → last). The NPCs' quest games follow the same rule
 * (app/quests.js: no Blade Duel quest if the run has a Blade Duel, at most one delve).
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { MODES, CAPSTONES, rolesOf } from '../games/index.js';
import { ZONE_AFFINITY, travelVehicles } from '../world/zones.js';

export const ENCOUNTER_RULES = {
  maxPerGame: 1,                             // no game twice in a run (there are more games than encounters)
  checkpointLevels: [1, 4, 7, 10],           // campaign indices with an arcade checkpoint: one per stage, its middle level (levels 2, 5, 8, 11)
  affinity: ZONE_AFFINITY,                   // games that only fit some zones
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
  const zoneOf = s => s.zone || s.tier;
  slots.forEach((s, i) => {
    const zone = zoneOf(s);
    if (R.checkpointLevels.includes(i)) seq.push({ level: i, role: 'checkpoint', tier: s.tier, zone });
    seq.push({ level: i, role: 'boss', tier: s.tier, zone, capstone: s.capstone });
    const next = slots[i + 1];
    const route = next && next.tier !== s.tier ? { from: zone, to: zoneOf(next), vehicles: travelVehicles(zone, zoneOf(next)) } : null;
    if (route) seq.push({ level: i, role: 'travel', tier: s.tier, zone, route });
  });
  const fits = (mode, e) => rolesOf(mode).includes(e.role) && (!R.affinity[mode] || R.affinity[mode].includes(e.zone))
    && !(e.role === 'travel' && !e.route.vehicles.includes(mode))
    && !Object.values(CAPSTONES).includes(mode);            // capstone games only at their capstones
  // capstones first, then the rest by backtracking so that nothing repeats
  const used = new Map();
  const assign = new Array(seq.length).fill(null);
  seq.forEach((e, k) => { if (e.role === 'boss' && e.capstone && CAPSTONES[e.zone]) { assign[k] = CAPSTONES[e.zone]; used.set(assign[k], 1); } });
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
  // (a safety net that's never needed — the tests plan hundreds of runs without a repeat)
  while (!solve(0) && limit < Math.max(R.maxPerGame, 3)) limit++;
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
    const pick = role => { const e = entries.find(x => x.level === i && x.role === role); return e ? { mode: e.mode, role, zone: e.zone, iteration: e.iteration, difficulty: e.difficulty, ...(e.route ? { from: e.route.from, to: e.route.to } : {}) } : null; };
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
