/**
 * Level 3: Zigzag — low and wide: big swings left and right, a crawler in the middle —
 * and the meadow's own technique: a bounce pad, the only way up to the goal ledge.
 *
 * A hand-made level of the campaign (levels/index.js puts it in its stage). Coordinates: x left–right,
 * y up, z forward; platforms are (x, y, z, width, height, depth) centres; the goal sits on the last one.
 */
import { createLevel } from '../builder.js';

export default createLevel('Zigzag')
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
  .build();
