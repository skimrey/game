/**
 * Level 4: Mind the Gap — the air-dash lesson. Low stepping stones, then a chasm
 * no jump can cross (5.25 wide: 118% of a jump, 53% of a dash — a 0.8 s window).
 * A side pillar hides a shortcut (dash from it straight to the chasm's edge), and
 * a low ledge past the chasm tempts you off the route.
 *
 * A hand-made level of the campaign (levels/index.js puts it in its stage). Coordinates: x left–right,
 * y up, z forward; platforms are (x, y, z, width, height, depth) centres; the goal sits on the last one.
 */
import { createLevel } from '../builder.js';

export default createLevel('Mind the Gap')
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
  .build();
