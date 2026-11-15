import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel } from '../src/levelBuilder.js';
import { levels, TIERS } from '../src/levels.js';
import { auditLevel } from '../src/levelAudit.js';
import { auditFun, funRequirements, designDifficulty, FUN_RULES } from '../src/funAudit.js';
import { generateLevel } from '../src/levelGenerator.js';

const codes = result => result.issues.map(i => i.code);
const fun = (level, d) => auditFun(level, auditLevel(level), d);

/** A small zig-zag course: forward, sideways both ways, up and down. */
function course(extra = b => b) {
  return extra(createLevel('course').setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 4, 1, 4)          // 0 top 0.5
    .addPlatform(3, 0.6, 4.5, 2.5, 1, 2.5)  // 1 top 1.1
    .addPlatform(0, 1.4, 8, 2.5, 1, 2.5)    // 2 top 1.9
    .addPlatform(3.5, 0.9, 11.5, 2.5, 1, 2.5) // 3 top 1.4
    .addPlatform(0, 1.6, 15, 3.5, 1, 3.5)   // 4 top 2.1
  ).setGoal(0, 2.1, 15, 1).build();
}

test('requirements grow with difficulty', () => {
  let previous = null;
  for (let d = 0; d <= 1.0001; d += 0.05) {
    const req = funRequirements(d);
    if (previous) for (const key of Object.keys(req)) assert.ok(req[key] >= previous[key], `${key} at ${d}`);
    previous = req;
  }
  assert.equal(funRequirements(0).falsePaths, 0);
  assert.ok(funRequirements(1).falsePaths >= 4);
  assert.equal(funRequirements(1).directions, 5);
  // the movement vocabulary: the dash from the dash lesson on, long drops, shortcuts
  assert.deepEqual([funRequirements(0).dashes, funRequirements(0).longDrops, funRequirements(0).shortcuts], [0, 0, 0]);
  assert.ok(funRequirements(0.15).dashes >= 1 && funRequirements(0.15).shortcuts >= 1);
  assert.ok(funRequirements(0.2).longDrops >= 1 && funRequirements(1).dashes >= 2);
});

test('a varied course passes; travel, directions and turns are measured', () => {
  const result = fun(course(), 0);
  assert.ok(result.ok, JSON.stringify(result.issues));
  const m = result.metrics;
  assert.deepEqual([...m.directions].sort(), ['down', 'forward', 'left', 'right', 'up']);
  assert.ok(m.turns >= 4);
  assert.ok(m.lateralRatio > 0.5 && m.verticalRatio > 0.1);
});

test('copy-paste placement is rejected', () => {
  const stairs = createLevel('stairs').setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 4, 1, 4)
    .addStaircase(0, 0.5, 4, 4, 3, 0.5, 2.5)
    .addPlatform(0, 2.5, 13, 4, 1, 3)
    .setGoal(0, 3, 13, 1).build();
  const result = fun(stairs, 0);
  assert.ok(codes(result).includes('REPETITIVE_PLACEMENT'), JSON.stringify(result.issues));
});

test('a flat straight corridor lacks directions, travel and turns at higher difficulty', () => {
  const corridor = createLevel('corridor').setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 3, 1, 3).addPlatform(0, 0, 5, 3, 1, 3).addPlatform(0.8, 0, 10.5, 3, 1, 3).addPlatform(0, 0, 15, 3, 1, 3)
    .setGoal(0, 0.5, 15, 1).build();
  const result = fun(corridor, 0.6);
  for (const code of ['TOO_FEW_DIRECTIONS', 'TOO_LITTLE_VERTICAL', 'TOO_FEW_TURNS', 'TOO_FEW_FALSE_PATHS']) {
    assert.ok(codes(result).includes(code), `${code}: ${JSON.stringify(result.issues)}`);
  }
});

test('false paths are recognised and proven in the physics; alternates and traps are told apart', () => {
  // A low ledge right of platform 1: jump down into it from there, climb back out (a stiff 1.3);
  // everything further on is more than a jump's height up (or out of reach) — even with a dash.
  const withFalsePath = course(b => b.addPlatform(7.5, -0.7, 4.5, 2, 1, 2));
  const ok = fun(withFalsePath, 0.2);
  assert.equal(ok.metrics.falsePaths, 1, JSON.stringify(ok.metrics.branches));
  assert.ok(!codes(ok).includes('FALSE_PATH_UNVERIFIED'), JSON.stringify(ok.issues));
  assert.ok(ok.metrics.simulatedMoves >= 2);

  // A side platform that leads on to a later route platform is an alternate (a shortcut,
  // proven in the physics), not a false path.
  const withAlternate = course(b => b.addPlatform(-2.5, 0.8, 11.5, 2, 1, 2));
  const alt = fun(withAlternate, 0.2);
  assert.equal(alt.metrics.falsePaths, 0);
  assert.equal(alt.metrics.alternates, 1);
  assert.equal(alt.metrics.shortcuts, 1);
  const shortcut = alt.metrics.shortcutDetails[0];
  assert.ok(shortcut.verified && shortcut.skipped >= 1, JSON.stringify(shortcut));

  // A ledge that leads back onto the route (here, with the air dash, even further along) is no false path.
  const withDetour = course(b => b.addPlatform(-3.5, 0.9, 9.5, 2, 1, 2));
  const detour = fun(withDetour, 0.2);
  assert.equal(detour.metrics.falsePaths, 0, JSON.stringify(detour.metrics.branches));

  // A deep ledge you can drop onto but never climb back from is a trap.
  const withTrap = course(b => b.addPlatform(-3.5, -1.6, 10, 2, 1, 2));
  assert.ok(codes(fun(withTrap, 0.2)).includes('FALSE_PATH_TRAP'));
});

test('every campaign level passes the fun audit at its design difficulty', () => {
  for (const level of levels) {
    const result = auditFun(level, auditLevel(level), designDifficulty(level));
    assert.ok(result.ok, `${level.name}: ${JSON.stringify(result.issues)}`);
  }
});

test('false paths and directional travel rise tier by tier', () => {
  const tierMean = (tier, f) => tier.levels.reduce((s, l) => s + f(auditFun(l, auditLevel(l), designDifficulty(l)).metrics), 0) / tier.levels.length;
  const falsePaths = TIERS.map(t => tierMean(t, m => m.falsePaths));
  const vertical = TIERS.map(t => tierMean(t, m => m.verticalRatio));
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(falsePaths[i] > falsePaths[i - 1], `false paths ${falsePaths}`);
    assert.ok(vertical[i] >= vertical[i - 1] - 0.02, `vertical ${vertical}`);
  }
});

test('generated levels meet the fun requirements and scale with difficulty (sample)', () => {
  const means = {};
  for (const d of [0.2, 0.6, 0.9]) {
    const falsePaths = [];
    for (let seed = 1; seed <= 4; seed++) {
      const { level, audit } = generateLevel({ seed, difficulty: d });
      const result = auditFun(level, audit, d);
      assert.ok(result.ok, `seed ${seed}@${d}: ${JSON.stringify(result.issues)}`);
      assert.ok(result.metrics.minPlacementDifference >= FUN_RULES.MIN_PLACEMENT_DIFFERENCE);
      falsePaths.push(result.metrics.falsePaths);
    }
    means[d] = falsePaths.reduce((s, v) => s + v, 0) / falsePaths.length;
  }
  // more false paths as difficulty rises — until the double jump arrives (0.65+), when dead ends
  // must sit more than a double jump below the route and two are plenty (funRequirements)
  assert.ok(means[0.2] < means[0.6], JSON.stringify(means));
  assert.ok(means[0.9] >= funRequirements(0.9, ['dash', 'glide', 'double']).falsePaths, JSON.stringify(means));
});
