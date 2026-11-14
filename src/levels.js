import { createLevel } from './levelBuilder.js';
import { generateLevel } from './levelGenerator.js';

/**
 * Level Design
 * Each level defines spawn position, platforms, and goal
 * X and Z are horizontal (left-right, forward-back)
 * Y is vertical (up-down)
 * Spawn Y is player feet position, goal Y is platform top surface
 */

export const handcraftedLevels = [
  // Level 1: Introduction to movement
  // Goal Y must be platform.y + platform.height/2 (top surface)
  createLevel('First steps')
    .setDifficulty(0)
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // y=0, top at 0.5
    .addPlatform(0, 0.5, 6, 4, 1, 3)    // y=0.5, top at 1
    .addPlatform(3, 1, 10, 4, 1, 3)     // y=1, top at 1.5
    .addPlatform(0, 1.5, 14, 5, 1, 4)   // y=1.5, top at 2
    .setGoal(0, 2, 14, 1)
    .build(),

  // Level 2: Height progression
  createLevel('A little higher')
    .setDifficulty(0.05)
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // top at 0.5
    .addPlatform(-3, 0.5, 6, 4, 1, 3)   // top at 1
    .addPlatform(0, 1, 10, 4, 1, 3)     // top at 1.5
    .addPlatform(3.5, 1.7, 13.5, 4, 1, 3) // top at 2.2 (varied: no copy-paste steps)
    .addPlatform(0, 2, 18, 5, 1, 4)     // top at 2.5
    .addEnemy({ type: 'crawler', platform: 2, axis: 'x', phase: 0.25 }) // first enemy: stomp it or hop past
    .setGoal(0, 2.5, 18, 1)
    .build(),

  // Level 3: Zigzag pattern
  createLevel('Zigzag')
    .setDifficulty(0.1)
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 5, 1, 5)      // top at 0.5
    .addPlatform(-4, 0.5, 4, 3, 1, 3)   // top at 1
    .addPlatform(-2, 1, 8, 3, 1, 3)     // top at 1.5
    .addPlatform(2, 1.5, 12, 3, 1, 3)   // top at 2
    .addPlatform(0, 2, 16, 4, 1, 4)     // top at 2.5 at z=16
    .addEnemy({ type: 'crawler', platform: 2, axis: 'x', phase: 0.6 })
    .setGoal(0, 2.5, 16, 1)             // Goal on the last platform
    .build(),

  // Level 4: Challenge with narrow passages
  createLevel('Precision')
    .setDifficulty(0.15)
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // top at 0.5
    .addPlatform(0, 0.5, 6, 2, 1, 2)    // top at 1, narrow passage
    .addPlatform(-2, 1, 9, 2, 1, 2)     // top at 1.5
    .addPlatform(2, 1.5, 12, 2, 1, 2)   // top at 2
    .addPlatform(0, 2, 15, 4, 1, 3)     // top at 2.5
    // False path: a tempting low ledge off to the left. From it the next stones
    // are out of reach — hop back to the stone you came from.
    .addPlatform(-5.5, -0.2, 12, 2, 1, 2) // top at 0.3 (low enough that even a dash can't carry you on)
    // A wisp glides across the jump between the middle stones — time it, or stomp it
    .addEnemy({ type: 'wisp', from: [1.8, 2.9, 8.1], to: [-1.8, 2.9, 12.9], phase: 0.3 })
    .setGoal(0, 2.5, 15, 1)             // Goal on the last platform
    .build(),

  // Level 5: Staircase challenge
  // (Previously uncompletable: the final platform sat 2.0 above the walkway —
  //  higher than the 1.57 max jump — across a 5.5 gap.)
  // A real staircase you must jump up — every step shifted and raised by a
  // different amount (no copy-paste steps). At the top, a switchback across
  // stepping stones leads to a +1.0 crux climb; a side ledge tempts you left.
  createLevel('Climb')
    .setDifficulty(0.2)
    .setSpawn(-5, 0.5, 0)
    .addPlatform(-5, 0, 0, 3, 1, 3)                // 0: top 0.5
    .addPlatform(-5, 0.6, 3.5, 3, 1, 2.5)          // 1: top 1.1
    .addPlatform(-4.5, 1.3, 6, 3, 1, 2.5)          // 2: top 1.8
    .addPlatform(-5.5, 1.8, 8.5, 3, 1, 2.5)        // 3: top 2.3
    .addPlatform(-4.5, 2.6, 11, 3, 1, 2.5)         // 4: top 3.1 — top of the stairs
    .addPlatform(-1.5, 3.0, 13, 2.5, 1, 2.5)       // 5: top 3.5 — turn right
    .addPlatform(1.5, 3.5, 14, 2.5, 1, 2.5)        // 6: top 4.0
    .addPlatform(4.5, 4.1, 17, 2.5, 1, 2.5)        // 7: top 4.6 — side step (required)
    .addPlatform(3, 5.1, 20.5, 4, 1, 4)            // 8: top 5.6 — crux: +1.0 climb
    .addPlatform(-8.5, 1.4, 16, 2, 1, 2)           // 9: false path — a low ledge off the top of the stairs
    .addEnemy({ type: 'wisp', from: [-8, 3.3, 7.2], to: [-2, 3.3, 7.2], phase: 0.3 }) // time your stair jumps
    .addEnemy({ type: 'crawler', platform: 6, axis: 'x', phase: 0.5 })                // guards the switchback
    .setGoal(3, 5.6, 20.5, 1)                      // Goal on the final platform
    .build(),

  // Level 6: Complex navigation
  createLevel('Master')
    .setDifficulty(0.25)
    .setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // top at 0.5
    .addPlatform(-3, 0.7, 7, 2.5, 1, 2) // top at 1.2
    .addPlatform(0, 1.2, 10, 3, 1, 2.5) // top at 1.7
    .addPlatform(3.5, 2.1, 13, 2.5, 1, 2) // top at 2.6
    .addPlatform(1, 1.6, 16.5, 3, 1, 3)   // top at 2.1 — a dip: down before climbing on
    .addPlatform(-2, 2.5, 20, 3, 1, 3)  // top at 3.0
    .addPlatform(0, 3.2, 24, 5, 1, 5)   // top at 3.7
    // False path: a low ledge off the first step that leads nowhere.
    .addPlatform(-7, -0.4, 9.5, 2, 1, 2) // top at 0.1
    .addEnemy({ type: 'crawler', platform: 2, axis: 'x', phase: 0.1 })
    .addEnemy({ type: 'spiker', platform: 4, axis: 'x', phase: 0.7 })   // don't stomp this one: dash or pound
    .setGoal(0, 3.7, 24, 1)             // Goal on the final platform
    .build(),
];

/**
 * Generated levels (see levelGenerator.js). Seeds were shortlisted with
 * `node scripts/pick-campaign.mjs` and then reviewed in the Level Lab.
 * Every generated level passes the audit with zero warnings, including a bot
 * completing it in the real physics and a "sloppy take-off" forgiveness run,
 * and the fun audit at its difficulty.
 * `startAttempt` skips candidates the generator would reject anyway (a test
 * checks it yields exactly the same level as generating from attempt 1).
 */
export const GENERATED_CAMPAIGN = [
  { seed: 23, difficulty: 0.3 },                    // Golden Terraces — 2 false paths · crawler arena, a wisp
  { seed: 26, difficulty: 0.45, startAttempt: 3 },  // Rapid Ridge — 3 false paths · crawler arena, a wisp
  { seed: 12, difficulty: 0.6, startAttempt: 4 },   // Sunny Crossing — 4 false paths · two spiker arenas, a wisp
  { seed: 29, difficulty: 0.7 },                    // Tumbling Trail — 3 false paths · two-lane crawler arena, two wisps
  { seed: 2, difficulty: 0.8, startAttempt: 17 },   // Jagged Gardens — 4 false paths · crawler arenas, two wisps
  { seed: 35, difficulty: 0.9, startAttempt: 2 },   // Silent Trail — 5 false paths · spiker + crawler arenas, two wisps
];

// Trusted: test/levels.test.js checks each spec generates exactly the level a full,
// validated generation produces — so the game doesn't re-run every audit at load.
export const generatedLevels = GENERATED_CAMPAIGN.map(spec => generateLevel({ ...spec, trusted: true }).level);

/**
 * Difficulty tiers. Each tier is a group of levels with its own biome
 * (background, textures, scenery — see biomes.js). Hand-made levels follow the
 * original Beginner / Intermediate split; generated levels are grouped by the
 * generator difficulty they were made with.
 *
 * `difficultyRange` maps a standalone generated level (?seed=…&difficulty=…)
 * to the tier whose campaign levels were generated in that range.
 */
export const TIERS = [
  { id: 'meadow', name: 'Green Meadows', label: 'Tier 1 · Beginner', biome: 'meadow', levels: handcraftedLevels.slice(0, 3), difficultyRange: [0, 0.15] },
  { id: 'canyon', name: 'Sunbaked Canyon', label: 'Tier 2 · Intermediate', biome: 'canyon', levels: handcraftedLevels.slice(3, 6), difficultyRange: [0.15, 0.3] },
  { id: 'alpine', name: 'Alpine Dusk', label: 'Tier 3 · Advanced', biome: 'alpine', levels: generatedLevels.slice(0, 3), difficultyRange: [0.3, 0.65] },
  { id: 'starlit', name: 'Starlit Ruins', label: 'Tier 4 · Expert', biome: 'starlit', levels: generatedLevels.slice(3, 6), difficultyRange: [0.65, 1.0001] },
];

for (const tier of TIERS) for (const level of tier.levels) level.tier = tier.id;

export const levels = TIERS.flatMap(tier => tier.levels);

export function tierOf(level) {
  return TIERS.find(t => t.id === level.tier) || tierForDifficulty(level.meta?.difficulty ?? 0);
}

export function tierForDifficulty(difficulty) {
  return TIERS.find(t => difficulty >= t.difficultyRange[0] && difficulty < t.difficultyRange[1]) || TIERS.at(-1);
}

