#!/usr/bin/env node
/**
 * Level quality report — runs the audit at scale.
 *
 *   node scripts/level-report.mjs                 # campaign + 100 seeds × 5 difficulties
 *   node scripts/level-report.mjs --seeds 1000    # more seeds
 *   node scripts/level-report.mjs --show 42 --difficulty 0.7   # one level in detail (+ JSON)
 *
 * For every generated level it independently re-checks what the generator
 * promises: audit passes with zero warnings, the recorded bot solution replays
 * to the goal, and regenerating the same seed yields an identical level.
 * Exits non-zero on any violation so it can gate CI.
 */
import { levels, TIERS, tierOf, tierForDifficulty } from '../src/levels.js';
import { BIOMES, BIOME_LIST } from '../src/biomes.js';
import { buildScenery, auditScenery } from '../src/scenery.js';
import { auditBiome, auditTierBackgrounds } from '../src/visualAudit.js';
import { auditFun, designDifficulty, funRequirements } from '../src/funAudit.js';
import { auditCampaign, describeLevel } from '../src/campaignAudit.js';
import { auditEncounters } from '../src/encounterAudit.js';
import { auditLevel, formatAudit, replaySolution, ENVELOPE } from '../src/levelAudit.js';
import { generateLevel, acceptGenerated, generatedRejections } from '../src/levelGenerator.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const SEEDS = opt('seeds', 100);
const SCENERY_SEEDS = opt('scenery-seeds', 40); // scenery checks are slower; run them on the first N seeds
const SHOW = opt('show', null);
const DIFFICULTIES = args.includes('--difficulty') ? [opt('difficulty', 0.5)] : [0, 0.25, 0.5, 0.75, 1];

let violations = 0;
const violation = msg => { violations++; console.log(`  ✗ ${msg}`); };

if (SHOW !== null) {
  const d = DIFFICULTIES[0];
  const { level, audit, attempts, rejections } = generateLevel({ seed: SHOW, difficulty: d });
  console.log(formatAudit(`seed ${SHOW} @ ${d}: ${level.name} (attempt ${attempts}; rejected: ${rejections.join(', ') || 'none'})`, audit));
  console.log(`  segments: ${level.meta.segments.join(' → ')}`);
  console.log(`  route: ${audit.route.map(e => `${e.from}→${e.to} ${(e.difficulty * 100).toFixed(0)}%`).join(', ')}`);
  console.log(JSON.stringify(level, null, 1));
  process.exit(0);
}

console.log(`Jump envelope (measured from physics): peak ${ENVELOPE.peak.toFixed(3)}, speed ${ENVELOPE.speed}\n`);

// --- Visuals --------------------------------------------------------------
console.log('== Environments ==');
for (const biome of BIOME_LIST) {
  const result = auditBiome(biome);
  const m = result.metrics;
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${biome.name.padEnd(16)} ΔE platform/horizon ${m.platformVsHorizon.toFixed(0)} · platform/below ${m.platformVsBelow.toFixed(0)} · avatar ${m.avatarVsPlatform.toFixed(0)} · goal ${m.goalVsPlatform.toFixed(0)}`);
  for (const issue of result.issues) violation(issue.message);
}
const backgrounds = auditTierBackgrounds(TIERS);
console.log(`tier backgrounds: ${backgrounds.pairs.map(p => `${p.a}/${p.b} ΔE ${p.deltaE.toFixed(0)}`).join(', ')}`);
for (const issue of backgrounds.issues) violation(issue.message);

// --- Campaign -------------------------------------------------------------
console.log('\n== Campaign ==');
let currentTier = null;
let previous = null;
for (const [i, level] of levels.entries()) {
  const audit = auditLevel(level);
  const tier = tierOf(level);
  if (tier !== currentTier) { currentTier = tier; console.log(`-- ${tier.label} · ${tier.name} (${BIOMES[tier.biome].name}) --`); }
  console.log(formatAudit(`${String(i + 1).padStart(2)}. ${level.name}`, audit));
  const fun = auditFun(level, audit, designDifficulty(level));
  if (fun.metrics) {
    const f = fun.metrics;
    console.log(`  fun ${f.funScore.toFixed(1)}/10 @ d ${f.difficulty.toFixed(2)}${level.meta?.theme ? ` (${level.meta.theme})` : ''}: ${f.falsePaths} false paths · ${f.directions.length} directions · sideways ${f.lateralRatio.toFixed(2)} · up/down ${f.verticalRatio.toFixed(2)} · ${f.turns} turns · min placement diff ${f.minPlacementDifference.toFixed(2)}`);
    console.log(`  moves: ${f.dashes} air-dash jump(s)${audit.metrics.dashWindow ? ` (window ${(audit.metrics.dashWindow * 1000).toFixed(0)} ms)` : ''} · ${f.longDrops} long drop(s) (max ${f.maxDrop.toFixed(1)}) · ${f.shortcuts} shortcut(s)${f.shortcutDetails.filter(c => c.verified).map(c => ` [${c.path.join('→')} skips ${c.skipped}, needs ${c.needs.join('+')}]`).join('')}`);
  }
  for (const issue of fun.issues) violation(`campaign level "${level.name}" fun: ${issue.message}`);
  const enc = auditEncounters(level, audit);
  console.log(`  encounters: ${enc.metrics.encounters} (${(level.enemies || []).map(e => e.type).join(', ') || 'none'}) at route positions ${enc.metrics.positions.map(p => p.position).join(', ') || '–'} · combat bot ${enc.combat ? `${enc.combat.completed ? 'finished' : 'FAILED'}, ${enc.metrics.hits} hit(s), ${enc.metrics.defeated} defeated` : 'n/a'}`);
  for (const e of enc.errors) violation(`campaign level "${level.name}" encounters: ${e.message}`);
  const scenery = buildScenery(level, BIOMES[tier.biome], audit);
  const sceneryResult = auditScenery(level, scenery, audit);
  console.log(`  scenery: ${scenery.boxes.length} boxes, ${sceneryResult.ok ? 'safe' : 'UNSAFE'} (placement rejected ${scenery.stats.rejected}: ${Object.entries(scenery.stats.reasons).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`);
  for (const e of sceneryResult.errors) violation(`campaign level "${level.name}" scenery: ${e.message}`);
  if (!audit.ok) violation(`campaign level "${level.name}" fails the audit`);
  else if (!replaySolution(level, audit.solution.inputs)) violation(`campaign level "${level.name}" solution does not replay`);
  if (audit.metrics && previous && audit.metrics.rating < previous - 1.5) {
    console.log(`  ! PROGRESSION: rating drops from ${previous.toFixed(1)} to ${audit.metrics.rating.toFixed(1)}`);
  }
  previous = audit.metrics?.rating ?? previous;
}

// --- Campaign as a whole ---------------------------------------------------
{
  const campaign = auditCampaign(levels, TIERS, levels.map(l => describeLevel(l)));
  const closest = campaign.distances.slice().sort((a, b) => a.distance - b.distance).slice(0, 4);
  console.log(`\n== Campaign audit: ${campaign.ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`challenge: ${campaign.levels.map(d => d.challenge.toFixed(1)).join(' → ')}`);
  console.log(`closest pairs: ${closest.map(p => `${p.a} / ${p.b} ${p.distance.toFixed(2)}${p.sameTier ? ' (same tier)' : ''}`).join(', ')}`);
  for (const i of campaign.issues) violation(`campaign: ${i.message}`);
}

// --- Generator at scale ---------------------------------------------------
console.log(`\n== Generator: ${SEEDS} seeds × ${DIFFICULTIES.length} difficulties ==`);
const rejectionCounts = {};
const patternCounts = {};
const rows = [];
const started = Date.now();
for (const difficulty of DIFFICULTIES) {
  const stats = { difficulty, n: 0, firstTry: 0, attempts: 0, ratings: [], jumps: [], hardest: [], par: [], ms: 0, sceneryChecked: 0, sceneryOk: 0, falsePaths: [], encounters: [], combatHits: [], directions: [], lateral: [], vertical: [], turns: [], fun: [], dashes: [], drops: [], shortcuts: [] };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const t0 = Date.now();
    let result;
    try {
      result = generateLevel({ seed, difficulty });
    } catch (error) {
      violation(`generation failed: ${error.message}`);
      continue;
    }
    stats.ms += Date.now() - t0;
    const { level, audit, attempts, rejections } = result;
    stats.n++;
    stats.attempts += attempts;
    if (attempts === 1) stats.firstTry++;
    for (const code of rejections) rejectionCounts[code] = (rejectionCounts[code] || 0) + 1;
    for (const s of level.meta.segments) patternCounts[s] = (patternCounts[s] || 0) + 1;

    // Independent re-verification of the generator's promises.
    const copy = JSON.parse(JSON.stringify(level));
    const again = auditLevel(copy);
    if (!acceptGenerated(again, copy)) violation(`seed ${seed}@${difficulty}: re-audit failed (${generatedRejections(again, copy)?.join(', ')})`);
    if (!replaySolution(level, audit.solution.inputs)) violation(`seed ${seed}@${difficulty}: bot solution does not replay`);
    const twin = generateLevel({ seed, difficulty }).level;
    if (JSON.stringify(twin) !== JSON.stringify(level)) violation(`seed ${seed}@${difficulty}: generation is not deterministic`);

    if (seed <= SCENERY_SEEDS) {
      const biome = BIOMES[tierForDifficulty(difficulty).biome];
      const sceneryResult = auditScenery(level, buildScenery(level, biome, audit), audit);
      stats.sceneryChecked++;
      if (sceneryResult.ok) stats.sceneryOk++;
      for (const e of sceneryResult.errors) violation(`seed ${seed}@${difficulty}: scenery ${e.message}`);
    }

    const fun = auditFun(level, audit, difficulty).metrics;
    stats.falsePaths.push(fun.falsePaths);
    stats.encounters.push(fun.encounters);
    if (seed <= SCENERY_SEEDS) {
      const enc = auditEncounters(level, audit);
      stats.combatHits.push(enc.metrics.hits);
      for (const e of enc.errors) violation(`seed ${seed}@${difficulty}: encounters ${e.message}`);
    }
    stats.directions.push(fun.directions.length);
    stats.lateral.push(fun.lateralRatio);
    stats.vertical.push(fun.verticalRatio);
    stats.turns.push(fun.turns);
    stats.fun.push(fun.funScore);
    stats.dashes.push(fun.dashes);
    stats.drops.push(fun.longDrops);
    stats.shortcuts.push(fun.shortcuts);

    stats.ratings.push(audit.metrics.rating);
    stats.jumps.push(audit.metrics.jumps);
    stats.hardest.push(audit.metrics.maxDifficulty);
    stats.par.push(audit.metrics.parTime);
  }
  rows.push(stats);
}

const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const fmt = (v, d = 1) => v.toFixed(d);
console.log('\ndifficulty | levels | 1st-try | avg tries | rating mean [min–max] | jumps | hardest jump | par time | ms/level | scenery ok');
for (const s of rows) {
  console.log([
    fmt(s.difficulty, 2).padStart(10),
    String(s.n).padStart(6),
    `${fmt((100 * s.firstTry) / Math.max(1, s.n), 0)}%`.padStart(7),
    fmt(s.attempts / Math.max(1, s.n), 2).padStart(9),
    `${fmt(mean(s.ratings))} [${fmt(Math.min(...s.ratings))}–${fmt(Math.max(...s.ratings))}]`.padStart(21),
    fmt(mean(s.jumps)).padStart(5),
    `${fmt(100 * mean(s.hardest), 0)}% (max ${fmt(100 * Math.max(...s.hardest), 0)}%)`.padStart(12),
    `${fmt(mean(s.par))}s`.padStart(8),
    fmt(s.ms / Math.max(1, s.n), 0).padStart(8),
    `${s.sceneryOk}/${s.sceneryChecked}`.padStart(10),
  ].join(' | '));
}

console.log('\ndifficulty | false paths [min–max] | encounters | bot hits | directions | sideways/fwd | up+down/fwd | turns | dashes | drops | shortcuts | fun score');
for (const s of rows) {
  console.log([
    fmt(s.difficulty, 2).padStart(10),
    `${fmt(mean(s.falsePaths))} [${Math.min(...s.falsePaths)}–${Math.max(...s.falsePaths)}]`.padStart(21),
    fmt(mean(s.encounters)).padStart(10),
    fmt(mean(s.combatHits), 2).padStart(8),
    fmt(mean(s.directions)).padStart(10),
    fmt(mean(s.lateral), 2).padStart(12),
    fmt(mean(s.vertical), 2).padStart(11),
    fmt(mean(s.turns)).padStart(5),
    fmt(mean(s.dashes)).padStart(6),
    fmt(mean(s.drops)).padStart(5),
    fmt(mean(s.shortcuts)).padStart(9),
    fmt(mean(s.fun)).padStart(9),
  ].join(' | '));
}

// Calibration: requested difficulty should produce monotonically harder levels.
for (let i = 1; i < rows.length; i++) {
  if (mean(rows[i].ratings) <= mean(rows[i - 1].ratings)) {
    violation(`calibration: mean rating at ${rows[i].difficulty} is not above ${rows[i - 1].difficulty}`);
  }
  // stepped requirements must rise strictly while the requirement rises (never fall once capped);
  // continuous measures within 5% (sampling noise)
  const rises = key => funRequirements(rows[i].difficulty)[key] > funRequirements(rows[i - 1].difficulty)[key];
  for (const [key, tolerance] of [['falsePaths', rises('falsePaths') ? 1 : 0.9], ['encounters', 1], ['vertical', 0.95], ['turns', 0.95]]) {
    if (mean(rows[i][key]) <= mean(rows[i - 1][key]) * tolerance) violation(`calibration: mean ${key} at ${rows[i].difficulty} is not above ${rows[i - 1].difficulty}`);
  }
}

const sortDesc = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`\nrejected candidates by reason: ${sortDesc(rejectionCounts) || 'none'}`);
console.log(`pattern usage: ${sortDesc(patternCounts)}`);
console.log(`total time ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(violations ? `\n${violations} VIOLATION(S)` : '\nAll checks passed.');
process.exit(violations ? 1 : 0);
