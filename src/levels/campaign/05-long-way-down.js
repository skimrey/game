/**
 * Level 5: Long Way Down — the first course that goes *down*: from a tall pillar,
 * dash across a chasm, take a leap of faith into a valley (a crawler waits), bounce
 * out of it on a pad (the meadow's technique, back in the canyon) up past a spiker
 * and leap again. A secret ledge on the right lets the bold dash over the whole
 * valley (two dashes, saves two jumps); a low ledge in the valley is a dead end.
 *
 * A hand-made level of the campaign (levels/index.js puts it in its stage). Coordinates: x left–right,
 * y up, z forward; platforms are (x, y, z, width, height, depth) centres; the goal sits on the last one.
 */
import { createLevel } from '../builder.js';

export default createLevel('Long Way Down')
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
  .build();
