#!/usr/bin/env node
/**
 * Scan many seeds per difficulty tier and shortlist the best generated levels
 * for the campaign. Scoring favours pattern variety, a par time in the sweet
 * spot, a rating close to the tier's target and a varied theme sequence.
 *
 *   node scripts/pick-campaign.mjs [--scan 300]
 */
import { generateLevel } from '../src/levelGenerator.js';
import { handcraftedLevels } from '../src/levels.js';
import { auditLevel } from '../src/levelAudit.js';
import { auditFun } from '../src/funAudit.js';
import { auditEncounters } from '../src/encounterAudit.js';

const args = process.argv.slice(2);
const SCAN = Number(args[args.indexOf('--scan') + 1]) || 300;
const TIERS = [0.3, 0.45, 0.6, 0.7, 0.8, 0.9];

const lastHandRating = auditLevel(handcraftedLevels.at(-1)).metrics.rating;
const usedNames = new Set(handcraftedLevels.map(l => l.name));
let previousRating = lastHandRating;
let previousFalsePaths = auditFun(handcraftedLevels.at(-1), auditLevel(handcraftedLevels.at(-1))).metrics.falsePaths;

console.log(`last handcrafted rating: ${lastHandRating.toFixed(1)}\n`);
for (const difficulty of TIERS) {
  const candidates = [];
  for (let seed = 1; seed <= SCAN; seed++) {
    const result = generateLevel({ seed, difficulty });
    const { level, audit } = result;
    const m = audit.metrics;
    const kinds = new Set(level.meta.segments);
    const fun = auditFun(level, audit, difficulty).metrics;
    const enc = auditEncounters(level, audit).metrics;
    let score = 0;
    score += fun.funScore * 1.5;                                 // fun ingredients (false paths, directions, travel, turns, variety)
    score += kinds.size * 0.6;                                   // variety of patterns
    score += enc.encounters * 0.6 + enc.defeated * 0.2;          // fights, interspersed with platforming
    score -= Math.abs(m.parTime - 22) / 3;                       // ~22 s sweet spot
    score -= Math.max(0, previousRating + 0.2 - m.rating) * 4;   // keep the ramp rising
    score -= usedNames.has(level.name) ? 100 : 0;                // unique names
    score -= fun.falsePaths <= previousFalsePaths && previousFalsePaths < 5 ? 3 : 0; // more false paths than the level before
    candidates.push({ seed, score, level, m, kinds, fun, enc, attempts: result.attempts });
  }
  candidates.sort((a, b) => b.score - a.score);
  console.log(`difficulty ${difficulty}:`);
  for (const c of candidates.slice(0, 3)) {
    console.log(`  seed ${String(c.seed).padStart(4)}  score ${c.score.toFixed(1).padStart(5)}  rating ${c.m.rating.toFixed(1)}  par ${c.m.parTime.toFixed(1)}s  ` +
      `${c.m.jumps} jumps  fun ${c.fun.funScore.toFixed(1)} · ${c.fun.falsePaths} false paths · ${c.enc.encounters} encounters (${c.level.enemies.map(e => e.type).join('/')}) · bot hits ${c.enc.hits}  attempt ${c.attempts}  "${c.level.name}"  [${[...c.kinds].join(', ')}]`);
  }
  const best = candidates[0];
  usedNames.add(best.level.name);
  previousRating = best.m.rating;
  previousFalsePaths = best.fun.falsePaths;
}
