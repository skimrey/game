import { createLevel } from './levelBuilder.js';

/**
 * Level Design
 * Each level defines spawn position, platforms, and goal
 * X and Z are horizontal (left-right, forward-back)
 * Y is vertical (up-down)
 * Spawn Y is player feet position, goal Y is platform top surface
 */

export const levels = [
  // Level 1: Introduction to movement
  // Goal Y must be platform.y + platform.height/2 (top surface)
  createLevel('First steps')
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // y=0, top at 0.5
    .addPlatform(0, 0.5, 6, 4, 1, 3)    // y=0.5, top at 1
    .addPlatform(3, 1, 10, 4, 1, 3)     // y=1, top at 1.5
    .addPlatform(0, 1.5, 14, 5, 1, 4)   // y=1.5, top at 2
    .setGoal(0, 2, 14, 1)
    .build(),

  // Level 2: Height progression
  createLevel('A little higher')
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // top at 0.5
    .addPlatform(-3, 0.5, 6, 4, 1, 3)   // top at 1
    .addPlatform(0, 1, 10, 4, 1, 3)     // top at 1.5
    .addPlatform(3, 1.5, 14, 4, 1, 3)   // top at 2
    .addPlatform(0, 2, 18, 5, 1, 4)     // top at 2.5
    .setGoal(0, 2.5, 18, 1)
    .build(),

  // Level 3: Zigzag pattern
  createLevel('Zigzag')
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 5, 1, 5)      // top at 0.5
    .addPlatform(-4, 0.5, 4, 3, 1, 3)   // top at 1
    .addPlatform(-2, 1, 8, 3, 1, 3)     // top at 1.5
    .addPlatform(2, 1.5, 12, 3, 1, 3)   // top at 2
    .addPlatform(0, 2, 16, 4, 1, 4)     // top at 2.5 at z=16
    .setGoal(0, 2.5, 16, 1)             // Goal on the last platform
    .build(),

  // Level 4: Challenge with narrow passages
  createLevel('Precision')
    .setSpawn(0, 1, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // top at 0.5
    .addPlatform(0, 0.5, 6, 2, 1, 2)    // top at 1, narrow passage
    .addPlatform(-2, 1, 9, 2, 1, 2)     // top at 1.5
    .addPlatform(2, 1.5, 12, 2, 1, 2)   // top at 2
    .addPlatform(0, 2, 15, 4, 1, 3)     // top at 2.5
    .setGoal(0, 2.5, 15, 1)             // Goal on the last platform
    .build(),

  // Level 5: Staircase challenge
  createLevel('Climb')
    .setSpawn(-5, 0.5, 0)
    .addPlatform(-5, 0, 0, 3, 1, 3)     // top at 0.5
    .addPlatformRow(-5, 0.5, 3, 5, 2.5, 3, 1, 3)  // Ascending row, all top at 1
    .addPlatform(0, 2.5, 12, 4, 1, 4)   // top at 3
    .setGoal(0, 3, 12, 1)               // Goal on the final platform
    .build(),

  // Level 6: Complex navigation
  createLevel('Master')
    .setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 6, 1, 6)      // top at 0.5
    .addPlatform(-3, 0.7, 7, 2.5, 1, 2) // top at 1.2
    .addPlatform(0, 1.2, 10, 3, 1, 2.5) // top at 1.7
    .addPlatform(3, 1.7, 13, 2.5, 1, 2) // top at 2.2
    .addPlatform(1, 2.2, 16, 3, 1, 3)   // top at 2.7
    .addPlatform(-2, 2.7, 20, 3, 1, 3)  // top at 3.2
    .addPlatform(0, 3.2, 24, 5, 1, 5)   // top at 3.7
    .setGoal(0, 3.7, 24, 1)             // Goal on the final platform
    .build(),
];
