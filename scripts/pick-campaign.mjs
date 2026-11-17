#!/usr/bin/env node
/**
 * Pick the generated half of the campaign: for each slot (difficulty) scan seeds ×
 * themes, and choose — greedily, slot by slot — the candidate that best keeps the
 * campaign fun by the campaign audit's rules (see src/levels/campaignAudit.js):
 *   - no theme twice in a tier (tiers 3 and 4 share a biome within the tier, so the
 *     layout has to tell levels apart), at most twice overall, and visibly distinct from
 *     every level so far; no name word used twice
 *   - challenge rises smoothly from the level before (no drops, no huge leaps), no
 *     par-time cliffs
 *   - each tier uses the whole movement vocabulary (dash, long drops, stomps, a spiker,
 *     shortcuts, false paths)
 * Then it scores what's left: fun ingredients, pattern variety, fights, par time near
 * the sweet spot, and distance to the nearest other level.
 *
 *   node scripts/pick-campaign.mjs [--scan 8]     # seeds per (slot, theme)
 *
 * Prints the recipes for src/levels/campaign/ (one file per level; GENERATED_CAMPAIGN in src/levels/index.js).
 */
import { generateLevel, THEME_NAMES } from '../src/levels/generator.js';
import { handcraftedLevels, TIER_ABILITIES } from '../src/levels/index.js';
import { describeLevel, signatureDistance, CAMPAIGN_RULES } from '../src/levels/campaignAudit.js';

const args = process.argv.slice(2);
const SCAN = Number(args[args.indexOf('--scan') + 1]) || 8;
const SLOTS = [
  { difficulty: 0.3, tier: 'alpine' }, { difficulty: 0.45, tier: 'alpine' }, { difficulty: 0.6, tier: 'alpine' },
  { difficulty: 0.7, tier: 'starlit' }, { difficulty: 0.8, tier: 'starlit' }, { difficulty: 0.9, tier: 'starlit' },
];
const TIER_OF = ['meadow', 'meadow', 'meadow', 'canyon', 'canyon', 'canyon'];
const NEEDED = ['dash', 'spring', 'longDrop', 'stomp', 'poundOrDash', 'shortcut', 'falsePath'];
const NEEDED_IN = { alpine: ['glide'], starlit: ['glide', 'double'] };    // each region's own technique (and the ones before)

const handmade = handcraftedLevels.map((level, i) => ({ ...describeLevel(level), tier: TIER_OF[i], spec: null }));
const usedNames = new Set(handcraftedLevels.map(l => l.name));
const started = Date.now();

// 1. Scan every slot once (the expensive part: generation + audits)
const scanned = SLOTS.map((slot, slotIndex) => {
  const list = [];
  for (const theme of THEME_NAMES) {
    for (let seed = 1; seed <= SCAN; seed++) {
      let result;
      try { result = generateLevel({ seed, difficulty: slot.difficulty, theme, abilities: TIER_ABILITIES[slot.tier], maxAttempts: 300 }); } catch { continue; }
      const { level, audit, attempts } = result;
      if (usedNames.has(level.name)) continue;
      level.tier = slot.tier;
      const d = { ...describeLevel(level, audit), tier: slot.tier, level, spec: { seed, difficulty: slot.difficulty, theme, tier: slot.tier, startAttempt: attempts } };
      if (!d.enc.ok) continue;
      const f = d.fun.metrics;
      d.base = f.funScore * 1.5 + new Set(level.meta.segments).size * 0.5 + d.enc.metrics.encounters * 0.5 + d.enc.metrics.defeated * 0.2
        - Math.abs(d.parTime - (18 + slotIndex * 2)) / 3;
      list.push(d);
    }
  }
  console.log(`slot ${slotIndex + 1} · difficulty ${slot.difficulty}: ${list.length} levels scanned (challenge ${Math.min(...list.map(d => d.challenge)).toFixed(2)}–${Math.max(...list.map(d => d.challenge)).toFixed(2)})`);
  return list;
});

// 2. Targets: an even ramp from the last handmade level to what the hardest slot offers
const start = handmade.at(-1).challenge;
const top = Math.max(...scanned.at(-1).map(d => d.challenge)) - 0.3;
const targets = SLOTS.map((_, i) => start + ((top - start) * (i + 1)) / SLOTS.length);

// 3. Depth-first search with backtracking over the best candidates of each slot
function options(chosen, slotIndex) {
  const slot = SLOTS[slotIndex];
  const previous = chosen.at(-1);
  const tierSoFar = chosen.filter(c => c.tier === slot.tier);
  const lastInTier = slotIndex === SLOTS.length - 1 || SLOTS[slotIndex + 1].tier !== slot.tier;
  const missing = [...NEEDED, ...(NEEDED_IN[slot.tier] || [])].filter(m => !tierSoFar.some(c => c.moves[m]));
  // names tell levels apart too: no word used twice among the generated levels
  const words = new Set(chosen.filter(c => c.spec).flatMap(c => c.name.split(' ')));
  const themeUses = theme => chosen.filter(c => c.spec?.theme === theme).length;
  return scanned[slotIndex].filter(d => {
    if (d.name.split(' ').some(w => words.has(w)) || themeUses(d.spec.theme) >= 2) return false;
    if (tierSoFar.some(c => c.spec?.theme === d.spec.theme) || previous.spec?.theme === d.spec.theme) return false;
    // a new region adds its technique on top of the old ones: allow a bigger step into it
    const firstInTier = previous.tier !== slot.tier;
    if (d.challenge < previous.challenge + 0.1 || d.challenge > previous.challenge + (firstInTier ? 4.5 : 1.4)) return false;
    if (d.parTime > previous.parTime * CAMPAIGN_RULES.MAX_PAR_GROWTH) return false;
    if (lastInTier && missing.some(m => !d.moves[m])) return false;
    d.minDistance = Math.min(...chosen.map(c => signatureDistance(c, d) / (c.tier === slot.tier ? CAMPAIGN_RULES.MIN_DISTANCE_IN_TIER : CAMPAIGN_RULES.MIN_DISTANCE)));
    return d.minDistance >= 1.1;                                                 // 10% safety margin
  }).map(d => ({
    d,
    score: d.base + Math.min(2, d.minDistance - 1) * 3 + missing.filter(m => d.moves[m]).length * 1.5 - Math.abs(d.challenge - targets[slotIndex]) * 4
      + (themeUses(d.spec.theme) === 0 ? 2 : 0),                                 // show every theme

  })).sort((a, b) => b.score - a.score).slice(0, 5);
}

let best = null, explored = 0;
function search(chosen, slotIndex, total) {
  if (slotIndex === SLOTS.length) {
    if (!best || total > best.total) best = { picks: chosen.slice(handmade.length), total };
    return;
  }
  if (++explored > 20000) return;
  for (const { d, score } of options(chosen, slotIndex)) search([...chosen, d], slotIndex + 1, total + score);
}
search(handmade, 0, 0);
if (!best) { console.log('\nNo campaign satisfies the rules — scan more seeds (--scan)'); process.exit(1); }

console.log(`\ntargets: ${targets.map(t => t.toFixed(2)).join(', ')} (explored ${explored} partial campaigns)`);
for (const [i, c] of best.picks.entries()) {
  console.log(`  slot ${i + 1}: ${c.spec.theme.padEnd(11)} seed ${String(c.spec.seed).padStart(3)}  challenge ${c.challenge.toFixed(2)}  par ${c.parTime.toFixed(1)}s  ` +
    `moves ${Object.entries(c.moves).filter(([, v]) => v).map(([k]) => k).join('/')}  "${c.name}"`);
}
console.log(`\n(${((Date.now() - started) / 1000).toFixed(0)} s)\n\nexport const GENERATED_CAMPAIGN = [`);
for (const c of best.picks) {
  const { seed, difficulty, theme, tier, startAttempt } = c.spec;
  const f = c.fun.metrics;
  const m = c.audit.metrics.moves;
  const spec = `{ seed: ${seed}, difficulty: ${difficulty}, theme: '${theme}', tier: '${tier}'${startAttempt > 1 ? `, startAttempt: ${startAttempt}` : ''} },`;
  const enemies = c.level.enemies.map(e => e.type);
  console.log(`  ${spec.padEnd(84)} // ${c.name} — ${f.falsePaths} false paths · ${f.shortcuts} shortcut(s) · ${m.dash} dash · ${m.glide} glide · ${m.double} double · ${m.spring} bounce · ${m.longDrop} long drop(s) · ${enemies.length} enemies`);
}
console.log('];');
