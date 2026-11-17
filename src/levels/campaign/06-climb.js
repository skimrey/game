/**
 * Level 6: Climb — the tallest climb yet. A staircase you must jump up (every step
 * shifted and raised by a different amount), a switchback past a crawler, a +1.0
 * crux, then a dash across to a high perch and a leap of faith down to the goal.
 * A low ledge off the stairs is a dead end; a secret ledge right of the switchback
 * (dash to it) skips the crawler and the crux.
 * (The original version was uncompletable: its last platform sat 2.0 above the
 *  walkway — higher than the 1.57 max jump — across a 5.5 gap.)
 *
 * A hand-made level of the campaign (levels/index.js puts it in its stage). Coordinates: x left–right,
 * y up, z forward; platforms are (x, y, z, width, height, depth) centres; the goal sits on the last one.
 */
import { createLevel } from '../builder.js';

export default createLevel('Climb')
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
  .build();
