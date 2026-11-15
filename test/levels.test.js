import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer } from '../src/physics.js';
import { createLevel } from '../src/levelBuilder.js';
import { levels, GENERATED_CAMPAIGN } from '../src/levels.js';
import { auditLevel, analyzeJump, replaySolution, ticksToLand, dashReach, ENVELOPE, RULES } from '../src/levelAudit.js';
import { generateLevel, difficultyKnobs, acceptGenerated } from '../src/levelGenerator.js';

const codes = audit => [...audit.errors, ...audit.warnings].map(e => e.code);

/** A two-platform level: start pad, then a flat jump of edge-to-edge `gap` to the goal pad. */
function gapLevel(gap, { rise = 0 } = {}) {
  return createLevel(`gap ${gap}`)
    .setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 4, 1, 4)
    .addPlatform(0, rise, 2 + gap + 2, 4, 1, 4)
    .setGoal(0, 0.5 + rise, 4 + gap, 1)
    .build();
}

// ---------------------------------------------------------------------------
// Physics envelope & regression
// ---------------------------------------------------------------------------
test('jump envelope is measured from the physics', () => {
  assert.ok(ENVELOPE.peak > 1.5 && ENVELOPE.peak < 1.6, `peak ${ENVELOPE.peak}`);
  assert.equal(ticksToLand(ENVELOPE.peak + 0.01), null);
  assert.ok(ticksToLand(-2) > ticksToLand(0) && ticksToLand(0) > ticksToLand(1));
});

test('sliding diagonally along a taller platform does not teleport the player', () => {
  // Regression: floating-point contact (|21.1 - 24| < 2.9) used to snap the
  // player to the far side of the wall when moving along it.
  const A = { x: -2, y: 2.7, z: 20, width: 3, height: 1, depth: 3 };
  const B = { x: 0, y: 3.2, z: 24, width: 5, height: 1, depth: 5 };
  const level = { platforms: [A, B], spawn: { x: -1.2, y: 3.2, z: 20.8 }, goal: { x: 0, y: 3.7, z: 24, radius: 1 } };
  const p = createPlayer(level.spawn);
  stepPlayer(p, level, {}, 1 / 120);
  for (let i = 0; i < 40; i++) {
    const before = { x: p.x, z: p.z };
    stepPlayer(p, level, { forward: true, right: true }, 1 / 120);
    assert.ok(Math.hypot(p.x - before.x, p.z - before.z) < 0.05, `teleported at tick ${i}`);
    assert.equal(p.grounded, true);
  }
});

// ---------------------------------------------------------------------------
// The audit catches broken levels
// ---------------------------------------------------------------------------
test('original level 5 ("Climb") is reported as uncompletable, with the reason', () => {
  const original = createLevel('Climb (original)')
    .setSpawn(-5, 0.5, 0)
    .addPlatform(-5, 0, 0, 3, 1, 3)
    .addPlatformRow(-5, 0.5, 3, 5, 2.5, 3, 1, 3)
    .addPlatform(0, 2.5, 12, 4, 1, 4)
    .setGoal(0, 3, 12, 1)
    .build();
  const audit = auditLevel(original);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.errors.map(e => e.code), ['UNREACHABLE_GOAL']);
  assert.match(audit.errors[0].message, /rise of 2\.00 exceeds max jump height 1\.57/);
});

test('too-wide gap is unreachable; near-limit gaps are unfair, hard or need precision', () => {
  const budget = rise => ticksToLand(rise) * ENVELOPE.stepDistance; // max centre travel
  const gapFor = (difficulty, rise = 0) => difficulty * budget(rise) + 0.8; // + 2 × half-width
  const dashGapFor = difficulty => difficulty * dashReach(0) + 0.8;     // same, with the air dash
  assert.ok(codes(auditLevel(gapLevel(dashGapFor(1.1)))).includes('UNREACHABLE_GOAL'));

  const extreme = auditLevel(gapLevel(dashGapFor(0.95)));
  assert.equal(extreme.ok, false);
  assert.ok(['UNFAIR_JUMP', 'BOT_FAILED'].includes(extreme.errors[0].code), codes(extreme).join());

  // beyond a plain jump but comfortable with the air dash: the level requires the dash
  const dashed = auditLevel(gapLevel(gapFor(1.2)));
  assert.deepEqual(codes(dashed), []);
  assert.deepEqual(dashed.route.map(e => e.kind), ['dash']);
  assert.equal(dashed.metrics.moves.dash, 1);
  assert.ok(dashed.metrics.dashWindow >= RULES.MIN_DASH_WINDOW, `window ${dashed.metrics.dashWindow}`);
  // a plain jump at 95% of its limit is unfair — the planner takes the (easier) dash instead
  assert.deepEqual(auditLevel(gapLevel(gapFor(0.95))).route.map(e => e.kind), ['dash']);

  const hard = auditLevel(gapLevel(gapFor(0.85)));
  assert.equal(hard.ok, true);
  assert.deepEqual(codes(hard), ['HARD_JUMP']);

  // Rising jumps have less air time, so taking off 0.1 s early matters sooner.
  const precise = auditLevel(gapLevel(gapFor(0.86, 1), { rise: 1 }));
  assert.equal(precise.ok, true);
  assert.ok(codes(precise).includes('NEEDS_PRECISION'), codes(precise).join());

  const fairLevel = gapLevel(gapFor(0.7));
  assert.deepEqual(codes(auditLevel(fairLevel)), []);
  assert.ok(Math.abs(analyzeJump(fairLevel.platforms[0], fairLevel.platforms[1]).difficulty - 0.7) < 1e-9);
});

test('too-high ledge is unreachable', () => {
  const audit = auditLevel(gapLevel(1, { rise: 1.7 }));
  assert.deepEqual(audit.errors.map(e => e.code), ['UNREACHABLE_GOAL']);
  assert.match(audit.errors[0].message, /exceeds max jump height/);
});

test('structural problems are caught', () => {
  const base = () => gapLevel(2);
  const floatingGoal = base(); floatingGoal.goal.y += 1;
  assert.ok(codes(auditLevel(floatingGoal)).includes('GOAL_UNSUPPORTED'));

  const embedded = base(); embedded.spawn = { x: 0, y: -0.2, z: 0 };
  assert.ok(codes(auditLevel(embedded)).includes('SPAWN_EMBEDDED'));

  const deep = base(); deep.platforms.push({ x: 20, y: -15, z: 0, width: 2, height: 1, depth: 2 });
  assert.ok(codes(auditLevel(deep)).includes('KILL_PLANE'));

  const lazy = base(); lazy.goal = { x: 1, y: 0.5, z: 1, radius: 1 };
  assert.ok(codes(auditLevel(lazy)).includes('GOAL_ON_SPAWN'));

  const broken = base(); broken.platforms[1].width = 0;
  assert.ok(codes(auditLevel(broken)).includes('SCHEMA'));

  const nothing = base(); nothing.spawn = { x: 50, y: 5, z: 50 };
  assert.ok(codes(auditLevel(nothing)).includes('SPAWN_UNSUPPORTED'));
});

test('quality warnings are raised', () => {
  const crawl = gapLevel(2); crawl.platforms.push({ x: 0, y: 1.5, z: 0, width: 2, height: 0.5, depth: 2 });
  assert.ok(codes(auditLevel(crawl)).includes('HEADROOM'));

  const decor = gapLevel(2); decor.platforms.push({ x: 0, y: 6, z: 20, width: 2, height: 1, depth: 2 });
  assert.ok(codes(auditLevel(decor)).includes('UNREACHABLE_PLATFORMS'));

  const backwards = createLevel('backwards').setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 3, 1, 3)
    .addPlatform(4, 0, 0, 2, 1, 2)
    .addPlatform(4, 0, -3.5, 2, 1, 2)
    .addPlatform(0, 0, -4, 3, 1, 3)
    .setGoal(0, 0.5, -4, 1).build();
  const audit = auditLevel(backwards);
  assert.ok(audit.ok);
  assert.ok(codes(audit).includes('BACKWARD_JUMP'), codes(audit).join());

  const skip = createLevel('skip').setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 4, 1, 4)
    .addPlatform(-12, 0, 0, 2, 1, 2).addPlatform(-12, 0, 4, 2, 1, 2).addPlatform(-12, 0, 8, 2, 1, 2).addPlatform(-12, 0, 12, 2, 1, 2)
    .addPlatform(0, 0, 5, 4, 1, 4)
    .setGoal(0, 0.5, 5, 1).build();
  assert.ok(codes(auditLevel(skip)).includes('UNREACHABLE_PLATFORMS')); // off-route but reachable platforms are classified by the fun audit
});

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------
test('every campaign level passes the audit and its bot solution replays', () => {
  for (const level of levels) {
    const audit = auditLevel(level);
    assert.deepEqual(audit.errors, [], `${level.name}: ${JSON.stringify(audit.errors)}`);
    assert.ok(replaySolution(level, audit.solution.inputs), `${level.name} replay`);
    if (level.meta?.generated) assert.deepEqual(audit.warnings, [], level.name);
  }
});

test('campaign names are unique and difficulty never drops sharply', () => {
  assert.equal(new Set(levels.map(l => l.name)).size, levels.length);
  let previous = 0;
  for (const level of levels) {
    const { rating } = auditLevel(level).metrics;
    assert.ok(rating >= previous - 1.5, `${level.name} rating ${rating} after ${previous}`);
    previous = Math.max(previous, rating);
  }
});

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
test('campaign specs (startAttempt + trusted) produce exactly the levels a full, validated generation would', () => {
  GENERATED_CAMPAIGN.forEach((spec, i) => {
    const full = generateLevel({ seed: spec.seed, difficulty: spec.difficulty, theme: spec.theme });
    assert.equal(full.attempts, spec.startAttempt ?? 1, `seed ${spec.seed}`);
    const campaignLevel = levels.find(l => l.meta?.generated && l.meta.seed === spec.seed && l.meta.difficulty === spec.difficulty);
    const { tier, ...fullLevel } = full.level;
    const { tier: _, hint: __, ...shipped } = campaignLevel;
    assert.equal(JSON.stringify(shipped), JSON.stringify(fullLevel), `campaign level ${i}`);
  });
});

test('generator is deterministic per seed and varies across seeds', () => {
  const a = generateLevel({ seed: 7, difficulty: 0.5 }).level;
  const b = generateLevel({ seed: 7, difficulty: 0.5 }).level;
  const c = generateLevel({ seed: 8, difficulty: 0.5 }).level;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
});

test('generated levels pass an independent audit with zero warnings (sample)', () => {
  // (a small sample keeps the suite quick; `npm run levels:report` checks hundreds)
  const ratings = {};
  for (const difficulty of [0, 0.5, 1]) {
    ratings[difficulty] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const { level, audit } = generateLevel({ seed, difficulty });
      const copy = JSON.parse(JSON.stringify(level));
      const again = auditLevel(copy);
      assert.ok(acceptGenerated(again, copy), `seed ${seed}@${difficulty}: ${codes(again).join()}`);
      assert.ok(replaySolution(level, audit.solution.inputs));
      const [, hi] = difficultyKnobs(difficulty).band;
      for (const e of again.route) assert.ok(e.difficulty <= Math.max(hi, RULES.HARD_JUMP) + 1e-9);
      ratings[difficulty].push(again.metrics.rating);
    }
  }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(ratings[0]) < mean(ratings[0.5]) && mean(ratings[0.5]) < mean(ratings[1]), JSON.stringify(Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, mean(v)]))));
});
