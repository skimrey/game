/**
 * Level 1: First steps — the tutorial: flat, wide stones; a small hop up, down and up.
 *
 * A hand-made level of the campaign (levels/index.js puts it in its stage). Coordinates: x left–right,
 * y up, z forward; platforms are (x, y, z, width, height, depth) centres; the goal sits on the last one.
 */
import { createLevel } from '../builder.js';

export default createLevel('First steps')
  .setDifficulty(0)
  .setHint('WASD / arrow keys to move, Space to jump — grab the gem!')
  .setSpawn(0, 0.5, 0)
  .addPlatform(0, 0, 0, 6, 1, 6)        // 0: top 0.5
  .addPlatform(-2, 0.4, 6, 4, 1, 3)     // 1: top 0.9 — hop up a little
  .addPlatform(1.5, 0, 10.5, 4, 1, 3)   // 2: top 0.5 — and down again
  .addPlatform(-0.5, 0.6, 15, 5, 1, 4)  // 3: top 1.1 — goal
  .setGoal(-0.5, 1.1, 15, 1)
  .build();
