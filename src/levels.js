import { createLevel } from './levelBuilder.js';
import { generateLevel, THEMES } from './levelGenerator.js';

/**
 * Level Design
 * Each level defines spawn position, platforms, and goal
 * X and Z are horizontal (left-right, forward-back)
 * Y is vertical (up-down)
 * Spawn Y is player feet position, goal Y is platform top surface
 */

export const handcraftedLevels = [
  // Level 1: First steps — the tutorial: flat, wide stones; a small hop up, down and up.
  createLevel('First steps')
    .setDifficulty(0)
    .setHint('WASD / arrow keys to move, Space to jump — grab the gem!')
    .setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)        // 0: top 0.5
    .addPlatform(-2, 0.4, 6, 4, 1, 3)     // 1: top 0.9 — hop up a little
    .addPlatform(1.5, 0, 10.5, 4, 1, 3)   // 2: top 0.5 — and down again
    .addPlatform(-0.5, 0.6, 15, 5, 1, 4)  // 3: top 1.1 — goal
    .setGoal(-0.5, 1.1, 15, 1)
    .build(),

  // Level 2: A little higher — tall and narrow: climb five steps (twice the height of
  // anything before), past the first enemy. A bounce pad off to the side is a first
  // taste of the meadow's technique: a hop-skip past a step (Zigzag then needs one).
  createLevel('A little higher')
    .setDifficulty(0.05)
    .setHint('Land on an enemy to stomp it — or just hop past.')
    .setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)          // 0: top 0.5
    .addPlatform(-1.5, 0.6, 5.5, 4, 1, 3)   // 1: top 1.1
    .addPlatform(1, 1.3, 9.5, 5, 1, 3.5)    // 2: top 1.8 (crawler)
    .addPlatform(-1, 1.9, 13.5, 3.5, 1, 3)  // 3: top 2.4
    .addPlatform(1.5, 2.6, 17, 3, 1, 3)     // 4: top 3.1
    .addPlatform(-0.5, 3.2, 20.5, 5, 1, 4)  // 5: top 3.7 — goal
    .addSpring(3.5, 1.8, 12.5)              // 6: top 2.3 — a first bounce pad, off to the side: a hop-skip up past step 3
    .addEnemy({ type: 'crawler', platform: 2, axis: 'x', phase: 0.25 }) // first enemy: stomp it or hop past
    .setGoal(-0.5, 3.7, 20.5, 1)
    .build(),

  // Level 3: Zigzag — low and wide: big swings left and right, a crawler in the middle —
  // and the meadow's own technique: a bounce pad, the only way up to the goal ledge.
  createLevel('Zigzag')
    .setDifficulty(0.1)
    .setHint('Bounce pads launch you sky-high — land on one to reach the high ledge!')
    .setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 5, 1, 5)             // 0: top 0.5
    .addPlatform(-5.5, 0.5, 5, 3, 1, 3)        // 1: top 1.0 — wide swing left
    .addPlatform(-1, 1.0, 9.5, 3, 1, 3)        // 2: top 1.5 (crawler)
    .addPlatform(4.5, 1.5, 13.5, 3, 1, 3)      // 3: top 2.0 — swing right
    .addPlatform(-0.5, 2.0, 17.5, 2.5, 1, 2.5) // 4: top 2.5 — back left
    .addSpring(2.5, 2.2, 20.5)                 // 5: top 2.7 — a bounce pad …
    .addPlatform(5, 5.4, 24, 4, 1, 4)          // 6: top 5.9 — … up to the goal ledge, far above a jump
    .addEnemy({ type: 'crawler', platform: 2, axis: 'x', phase: 0.6 })
    .setGoal(5, 5.9, 24, 1)
    .build(),

  // Level 4: Mind the Gap — the air-dash lesson. Low stepping stones, then a chasm
  // no jump can cross (5.25 wide: 118% of a jump, 53% of a dash — a 0.8 s window).
  // A side pillar hides a shortcut (dash from it straight to the chasm's edge), and
  // a low ledge past the chasm tempts you off the route.
  createLevel('Mind the Gap')
    .setDifficulty(0.15)
    .setHint('Too far to jump? Jump, then press Shift (or J) in mid-air to air-dash across.')
    .setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)             // 0: top 0.5
    .addPlatform(-0.5, 0.7, 6, 2, 1, 2)        // 1: top 1.2
    .addPlatform(-2.5, 1.4, 9.5, 2, 1, 2)      // 2: top 1.9
    .addPlatform(1, 1.8, 12.5, 2.5, 1, 2.5)    // 3: top 2.3 — edge of the chasm
    .addPlatform(1.5, 2.2, 20, 4, 1, 4)        // 4: top 2.7 — across the chasm: dash
    .addPlatform(-1.5, 2.9, 25.5, 4, 1, 3.5)   // 5: top 3.4 — goal
    .addPlatform(7, 1.0, 22, 2, 1, 2)          // 6: false path — a low ledge off the landing
    .addPlatform(5.5, 1.2, 6.5, 2, 1, 2)       // 7: shortcut — side pillar, then dash onto stone 3
    .addEnemy({ type: 'wisp', from: [2.2, 3.2, 8.2], to: [-2.2, 3.2, 11.8], phase: 0.3 })
    .setGoal(-1.5, 3.4, 25.5, 1)
    .build(),

  // Level 5: Long Way Down — the first course that goes *down*: from a tall pillar,
  // dash across a chasm, take a leap of faith into a valley (a crawler waits), bounce
  // out of it on a pad (the meadow's technique, back in the canyon) up past a spiker
  // and leap again. A secret ledge on the right lets the bold dash over the whole
  // valley (two dashes, saves two jumps); a low ledge in the valley is a dead end.
  createLevel('Long Way Down')
    .setDifficulty(0.2)
    .setHint('Spikers can’t be stomped — air-dash into them, or ground-pound (Q) from above.')
    .setSpawn(0, 8, 0)
    .addPlatform(0, 7.5, 0, 4, 1, 4)             // 0: top 8.0 — a tall pillar
    .addPlatform(4, 6.7, 5, 2.5, 1, 2.5)         // 1: top 7.2 — hop right, down
    .addPlatform(1.5, 6.1, 13.5, 3.5, 1, 3.5)    // 2: top 6.6 — dash across the chasm
    .addPlatform(-2, 3.1, 18, 4, 1, 4)           // 3: top 3.6 — leap of faith (crawler)
    .addSpring(-5.5, 3.35, 22.5)                 // 4: top 3.85 — bounce out of the valley …
    .addPlatform(-1.5, 6.5, 26.5, 3, 1, 3)       // 5: top 7.0 — … up to the spiker's ledge
    .addPlatform(2.5, 1.9, 31.5, 4, 1, 3.5)      // 6: top 2.4 — second leap
    .addPlatform(-0.5, 2.6, 36.5, 4, 1, 4)       // 7: top 3.1 — goal
    .addPlatform(-7.5, 2.0, 13.5, 2, 1, 2)       // 8: false path — a low ledge in the valley
    .addPlatform(6, 4.9, 21.5, 2, 1, 2)          // 9: secret ledge — dash over the valley, dash again down
    .addEnemy({ type: 'crawler', platform: 3, axis: 'x', phase: 0.1 })
    .addEnemy({ type: 'spiker', platform: 5, axis: 'x', phase: 0.7 })
    .setGoal(-0.5, 3.1, 36.5, 1)
    .build(),

  // Level 6: Climb — the tallest climb yet. A staircase you must jump up (every step
  // shifted and raised by a different amount), a switchback past a crawler, a +1.0
  // crux, then a dash across to a high perch and a leap of faith down to the goal.
  // A low ledge off the stairs is a dead end; a secret ledge right of the switchback
  // (dash to it) skips the crawler and the crux.
  // (The original version was uncompletable: its last platform sat 2.0 above the
  //  walkway — higher than the 1.57 max jump — across a 5.5 gap.)
  createLevel('Climb')
    .setDifficulty(0.25)
    .setHint('Secret ledges hide shortcuts — look around, and trust your dash.')
    .setSpawn(-5, 0.5, 0)
    .addPlatform(-5, 0, 0, 3, 1, 3)                // 0: top 0.5
    .addPlatform(-5, 0.6, 3.5, 3, 1, 2.5)          // 1: top 1.1
    .addPlatform(-4.5, 1.3, 6, 3, 1, 2.5)          // 2: top 1.8
    .addPlatform(-5.5, 1.8, 8.5, 3, 1, 2.5)        // 3: top 2.3
    .addPlatform(-4.5, 2.6, 11, 3, 1, 2.5)         // 4: top 3.1 — top of the stairs
    .addPlatform(-1.5, 3.0, 13, 2.5, 1, 2.5)       // 5: top 3.5 — turn right
    .addPlatform(1.5, 3.5, 14, 2.5, 1, 2.5)        // 6: top 4.0 (crawler)
    .addPlatform(4.5, 4.1, 17, 2.5, 1, 2.5)        // 7: top 4.6 — side step
    .addPlatform(3, 5.1, 20.5, 4, 1, 4)            // 8: top 5.6 — crux: +1.0 climb
    .addPlatform(2, 5.0, 28.5, 3, 1, 3)            // 9: top 5.5 — dash across to the perch
    .addPlatform(0, 2.0, 34, 4.5, 1, 4.5)          // 10: top 2.5 — leap of faith to the goal
    .addPlatform(-8.5, 1.4, 16, 2, 1, 2)           // 11: false path — a low ledge off the top of the stairs
    .addPlatform(6.5, 3.8, 12.5, 2, 1, 2)          // 12: secret ledge — dash from 5, skip the crawler
    .addEnemy({ type: 'wisp', from: [-8, 3.3, 7.2], to: [-2, 3.3, 7.2], phase: 0.3 }) // time your stair jumps
    .addEnemy({ type: 'crawler', platform: 6, axis: 'x', phase: 0.5 })                // guards the switchback
    .setGoal(0, 2.5, 34, 1)
    .build(),
];

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
 * Generated levels (see levelGenerator.js). Picked with `node scripts/pick-campaign.mjs`
 * (seeds × themes scanned, then chosen for a smooth challenge ramp, visibly distinct
 * layouts and the full movement vocabulary in every tier — see campaignAudit.js) and
 * reviewed in the Level Lab. Every generated level passes the audit with zero warnings,
 * including a bot completing it in the real physics (air dashes included) and a
 * "sloppy take-off" forgiveness run, and the fun audit at its difficulty.
 * `startAttempt` skips candidates the generator would reject anyway (a test
 * checks it yields exactly the same level as generating from attempt 1).
 */
export const GENERATED_CAMPAIGN = [
  { seed: 4, difficulty: 0.3, theme: 'ascent', tier: 'alpine' },                          // Lofty Steps — 1 false path · 1 shortcut · 1 dash · 1 glide · 1 bounce · 2 long drops · 2 enemies
  { seed: 6, difficulty: 0.45, theme: 'switchbacks', tier: 'alpine', startAttempt: 6 },   // Tumbling Spires — 2 false paths · 2 shortcuts · 1 dash · 1 glide · 1 bounce · 1 long drop · 2 enemies
  { seed: 3, difficulty: 0.6, theme: 'skyway', tier: 'alpine', startAttempt: 3 },        // Sunny Terraces — 3 false paths · 1 shortcut · 2 dash · 1 glide · 1 bounce · 2 long drops · 3 enemies
  { seed: 6, difficulty: 0.7, theme: 'switchbacks', tier: 'starlit', startAttempt: 4 },   // Mossy Drift — 2 false paths · 2 shortcuts · 1 dash · 1 glide · 1 double · 1 bounce · 2 long drops · 4 enemies
  { seed: 5, difficulty: 0.8, theme: 'cascade', tier: 'starlit', startAttempt: 3 },      // Hidden Pass — 3 false paths · 1 shortcut · 1 dash · 1 glide · 1 double · 1 bounce · 3 long drops · 5 enemies
  { seed: 4, difficulty: 0.9, theme: 'gauntlet', tier: 'starlit', startAttempt: 2 },     // Winding Crossing — 2 false paths · 1 shortcut · 1 dash · 1 glide · 1 double · 1 bounce · 2 long drops · 6 enemies
];

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
 * (background, textures, scenery — see biomes.js). Hand-made levels follow the
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

// each region's levels allow its own technique and every earlier one (physics.js abilities)
for (const tier of TIERS) for (const level of tier.levels) { level.tier = tier.id; level.abilities = [...tier.abilities]; }

export const levels = TIERS.flatMap(tier => tier.levels);

export function tierOf(level) {
  return TIERS.find(t => t.id === level.tier) || tierForDifficulty(level.meta?.difficulty ?? 0);
}

export function tierForDifficulty(difficulty) {
  return TIERS.find(t => difficulty >= t.difficultyRange[0] && difficulty < t.difficultyRange[1]) || TIERS.at(-1);
}

