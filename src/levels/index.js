import { generateLevel, THEMES } from './generator.js';
import level1 from './campaign/01-first-steps.js';
import level2 from './campaign/02-a-little-higher.js';
import level3 from './campaign/03-zigzag.js';
import level4 from './campaign/04-mind-the-gap.js';
import level5 from './campaign/05-long-way-down.js';
import level6 from './campaign/06-climb.js';
import recipe7 from './campaign/07-lofty-steps.js';
import recipe8 from './campaign/08-tumbling-spires.js';
import recipe9 from './campaign/09-sunny-terraces.js';
import recipe10 from './campaign/10-mossy-drift.js';
import recipe11 from './campaign/11-hidden-pass.js';
import recipe12 from './campaign/12-winding-crossing.js';

/**
 * Level Design
 * Each level defines spawn position, platforms, and goal
 * X and Z are horizontal (left-right, forward-back)
 * Y is vertical (up-down)
 * Spawn Y is player feet position, goal Y is platform top surface
 */

/** The hand-made levels, one module each in campaign/ (in campaign order). */
export const handcraftedLevels = [level1, level2, level3, level4, level5, level6];

/**
 * Each region teaches a new movement technique, and keeps the earlier ones:
 *   meadow  bounce pads (terrain — no ability needed)   canyon  + the air dash
 *   alpine  + gliding (hold jump while falling)          starlit + the double jump
 */
export const TIER_ABILITIES = {
  meadow: [],
  canyon: ['dash'],
  alpine: ['dash', 'glide'],
  starlit: ['dash', 'glide', 'double'],
};

/**
 * Generated levels (see levels/generator.js). Picked with `node scripts/pick-campaign.mjs`
 * (seeds × themes scanned, then chosen for a smooth challenge ramp, visibly distinct
 * layouts and the full movement vocabulary in every tier — see levels/campaignAudit.js) and
 * reviewed in the Level Lab. Every generated level passes the audit with zero warnings,
 * including a bot completing it in the real physics (air dashes included) and a
 * "sloppy take-off" forgiveness run, and the fun audit at its difficulty.
 * `startAttempt` skips candidates the generator would reject anyway (a test
 * checks it yields exactly the same level as generating from attempt 1).
 */
export const GENERATED_CAMPAIGN = [recipe7, recipe8, recipe9, recipe10, recipe11, recipe12];

/** The first level of a region teaches its technique (campaignAudit: UNTAUGHT). */
export const TECHNIQUE_HINTS = {
  glide: 'New: hold Space while falling to GLIDE across long drops.',
  double: 'New: press Space again in mid-air to DOUBLE JUMP up high walls.',
};

// Trusted: test/levels.test.js checks each spec generates exactly the level a full,
// validated generation produces — so the game doesn't re-run every audit at load.
export const generatedLevels = GENERATED_CAMPAIGN.map((spec, i) => {
  const { level } = generateLevel({ ...spec, abilities: TIER_ABILITIES[spec.tier], trusted: true });
  const theme = THEMES[spec.theme];
  if (theme) level.hint = `${theme.label}: ${theme.about}.`;
  // the first level of a region opens with its new technique
  const technique = { alpine: 'glide', starlit: 'double' }[spec.tier];
  if (GENERATED_CAMPAIGN.findIndex(s => s.tier === spec.tier) === i && TECHNIQUE_HINTS[technique]) level.hint = `${TECHNIQUE_HINTS[technique]} ${level.hint || ''}`.trim();
  return level;
});

/**
 * Difficulty tiers. Each tier is a group of levels with its own biome
 * (background, textures, scenery — see world/biomes.js). Hand-made levels follow the
 * original Beginner / Intermediate split; generated levels are grouped by the
 * generator difficulty they were made with.
 *
 * `difficultyRange` maps a standalone generated level (?seed=…&difficulty=…)
 * to the tier whose campaign levels were generated in that range.
 */
export const TIERS = [
  { id: 'meadow', name: 'Green Meadows', label: 'Tier 1 · Beginner', biome: 'meadow', levels: handcraftedLevels.slice(0, 3), difficultyRange: [0, 0.15], abilities: TIER_ABILITIES.meadow, technique: 'spring' },
  { id: 'canyon', name: 'Sunbaked Canyon', label: 'Tier 2 · Intermediate', biome: 'canyon', levels: handcraftedLevels.slice(3, 6), difficultyRange: [0.15, 0.3], abilities: TIER_ABILITIES.canyon, technique: 'dash' },
  { id: 'alpine', name: 'Alpine Dusk', label: 'Tier 3 · Advanced', biome: 'alpine', levels: generatedLevels.slice(0, 3), difficultyRange: [0.3, 0.65], abilities: TIER_ABILITIES.alpine, technique: 'glide' },
  { id: 'starlit', name: 'Starlit Ruins', label: 'Tier 4 · Expert', biome: 'starlit', levels: generatedLevels.slice(3, 6), difficultyRange: [0.65, 1.0001], abilities: TIER_ABILITIES.starlit, technique: 'double' },
];

// each region's levels allow its own technique and every earlier one (world/physics.js abilities)
for (const tier of TIERS) for (const level of tier.levels) { level.tier = tier.id; level.abilities = [...tier.abilities]; }

export const levels = TIERS.flatMap(tier => tier.levels);

export function tierOf(level) {
  return TIERS.find(t => t.id === level.tier) || tierForDifficulty(level.meta?.difficulty ?? 0);
}

export function tierForDifficulty(difficulty) {
  return TIERS.find(t => difficulty >= t.difficultyRange[0] && difficulty < t.difficultyRange[1]) || TIERS.at(-1);
}

