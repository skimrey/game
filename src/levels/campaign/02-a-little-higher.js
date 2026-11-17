/**
 * Level 2: A little higher — tall and narrow: climb five steps (twice the height of
 * anything before), past the first enemy. A bounce pad off to the side is a first
 * taste of the meadow's technique: a hop-skip past a step (Zigzag then needs one).
 *
 * A hand-made level of the campaign (levels/index.js puts it in its stage). Coordinates: x left–right,
 * y up, z forward; platforms are (x, y, z, width, height, depth) centres; the goal sits on the last one.
 */
import { createLevel } from '../builder.js';

export default createLevel('A little higher')
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
  .build();
