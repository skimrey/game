import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, ABILITIES, PLAYER } from '../src/world/physics.js';
import { createLevel } from '../src/levels/builder.js';
import { TIERS, TIER_ABILITIES, levels } from '../src/levels/index.js';
import { auditLevel, moveReach, movePeak, SPECIAL_MOVES, bestSpecial, DT } from '../src/levels/audit.js';
import { describeLevel, TECHNIQUES } from '../src/levels/campaignAudit.js';
import { generateLevel, abilitiesForDifficulty } from '../src/levels/generator.js';

const floor = (abilities, extra = []) => ({
  abilities,
  spawn: { x: 0, y: 0.5, z: 0 },
  platforms: [{ x: 0, y: 0, z: 0, width: 60, height: 1, depth: 60 }, ...extra],
  goal: { x: 25, y: 0.5, z: 25, radius: 0.5 },
});
const run = (p, level, input, n) => { for (let i = 0; i < n; i++) stepPlayer(p, level, input, DT); };

/** Jump, then hold `input` until landing; returns the highest point and the airtime. */
function airtime(level, during = {}, after = null) {
  const p = createPlayer(level.spawn);
  run(p, level, {}, 5);
  stepPlayer(p, level, { jump: true }, DT);
  let peak = p.y, ticks = 1;
  while (!p.grounded && ticks < 2000) {
    stepPlayer(p, level, after && p.vy < 0 ? after : during, DT);
    peak = Math.max(peak, p.y); ticks++;
  }
  return { peak: peak - 0.5, time: ticks * DT };
}

test('glide: holding jump while falling sinks slowly — only where the level allows it', () => {
  const plain = airtime(floor(['dash']), {}, { glide: true });
  const glide = airtime(floor(['dash', 'glide']), {}, { glide: true });
  assert.ok(glide.time > plain.time * 1.25, `glide ${glide.time.toFixed(2)} s vs ${plain.time.toFixed(2)} s`);
  const p = createPlayer({ x: 0, y: 6, z: 0 });
  run(p, floor(['glide']), { glide: true }, 40);
  assert.ok(Math.abs(p.vy + ABILITIES.glideFall) < 1e-9 && p.gliding, 'falls at the glide speed');
});

test('double jump: a second jump in mid-air, once per air time, refreshed on landing', () => {
  const level = floor(['dash', 'glide', 'double']);
  const p = createPlayer(level.spawn);
  run(p, level, {}, 5);
  stepPlayer(p, level, { jump: true }, DT);
  run(p, level, {}, 40);
  const vyBefore = p.vy;
  stepPlayer(p, level, { jump: true }, DT);
  assert.ok(p.doubled && p.vy > vyBefore && Math.abs(p.vy - (ABILITIES.doubleSpeed - 0)) < 0.5, `vy ${p.vy}`);
  run(p, level, {}, 10);
  const vy = p.vy;
  stepPlayer(p, level, { jump: true }, DT);
  assert.ok(!p.doubled && p.vy < vy, 'only once');
  run(p, level, {}, 200);
  assert.ok(p.grounded && p.canDouble);
  // not in a level without it
  const q = createPlayer(level.spawn), basic = floor(['dash']);
  run(q, basic, {}, 5); stepPlayer(q, basic, { jump: true }, DT); run(q, basic, {}, 40);
  const before = q.vy; stepPlayer(q, basic, { jump: true }, DT);
  assert.ok(q.vy < before && !q.doubled);
  assert.ok(movePeak('double') > movePeak('jump') * 1.5, 'the double jump reaches much higher');
});

test('bounce pads launch you high, refresh the dash, and need no ability', () => {
  const pad = { x: 0, y: 0.75, z: 5, width: 2, height: 0.5, depth: 2, spring: true };
  const level = floor([], [pad]);
  const p = createPlayer({ x: 0, y: 3, z: 5 });
  let sprung = null;
  for (let i = 0; i < 200 && !sprung; i++) { stepPlayer(p, level, {}, DT); sprung = p.sprung; }
  assert.equal(sprung, pad);
  assert.ok(p.vy === ABILITIES.springSpeed && !p.grounded);
  let peak = p.y;
  for (let i = 0; i < 200; i++) { stepPlayer(p, level, {}, DT); peak = Math.max(peak, p.y); }
  assert.ok(peak - 1 > 2 * (PLAYER.jumpSpeed ** 2 / 2 / 25), `bounced to +${(peak - 1).toFixed(1)}`);
  // the builder makes them
  const built = createLevel('pads').setSpawn(0, 0.5, 0).addPlatform(0, 0, 0, 4, 1, 4).addSpring(0, 0, 4).setGoal(0, 0.5, 0, 1).build();
  assert.ok(built.platforms.some(q => q.spring));
});

test('every region teaches one new technique and keeps the earlier ones', () => {
  assert.deepEqual(TIERS.map(t => t.technique), ['spring', 'dash', 'glide', 'double']);
  let previous = [];
  for (const tier of TIERS) {
    const allowed = TIER_ABILITIES[tier.id];
    for (const p of previous) assert.ok(allowed.includes(p), `${tier.id} keeps ${p}`);
    previous = allowed;
    for (const level of tier.levels) assert.deepEqual(level.abilities, allowed, level.name);
    // the region's technique is actually needed (or used) in its levels
    const uses = tier.levels.filter(level => {
      const moves = describeLevel(level).moves || {};
      return (moves[tier.technique] || 0) > 0;
    });
    assert.ok(uses.length >= 2, `${tier.id}: ${tier.technique} used in ${uses.length} levels`);
  }
  // later regions mix the techniques: the last one uses at least three kinds of move
  const last = TIERS.at(-1).levels.map(l => describeLevel(l).moves || {});
  for (const moves of last) assert.ok(['spring', 'dash', 'glide', 'double'].filter(k => moves[k] > 0).length >= 3, JSON.stringify(moves));
  assert.deepEqual(Object.keys(TECHNIQUES).sort(), ['dash', 'double', 'glide', 'spring']);
});

test('audit: special moves reach further than a jump, and the audit picks the gentlest one that works', () => {
  assert.deepEqual(SPECIAL_MOVES, ['dash', 'glide', 'double']);
  for (const kind of SPECIAL_MOVES) assert.ok(moveReach(kind, -2) > moveReach('jump', -2), kind);
  assert.ok(moveReach('glide', -6) > moveReach('dash', -6), 'a glide covers long drops best');
  assert.ok(moveReach('double', 2.5) > 0 && !(moveReach('jump', 2.5) > 0), 'the double jump climbs walls a jump cannot');
  const a = { x: 0, y: 0, z: 0, width: 2, height: 1, depth: 2 };
  const far = { x: 0, y: -5, z: 2 + moveReach('jump', -5) + 1.5, width: 2, height: 1, depth: 2 };
  assert.equal(bestSpecial(a, far, ['dash'])?.kind ?? null, moveReach('dash', -5) > far.z - 2 ? 'dash' : null);
  assert.ok(['dash', 'glide'].includes(bestSpecial(a, far, ['dash', 'glide'])?.kind));
});

test('generated levels use the techniques they are given, and only those', () => {
  assert.deepEqual(abilitiesForDifficulty(0.1), ['dash']);
  assert.ok(abilitiesForDifficulty(0.9).includes('double'));
  const { level } = generateLevel({ seed: 4, difficulty: 0.3, theme: 'ascent', abilities: TIER_ABILITIES.alpine, startAttempt: 1 });
  assert.deepEqual(level.abilities, TIER_ABILITIES.alpine);
  const audit = auditLevel(level);
  assert.equal(audit.errors.length, 0, audit.errors.map(e => e.message).join('; '));
  assert.ok(!(audit.metrics.moves?.double > 0), 'no double jumps in a level without them');
  assert.equal(levels.length, 12);
});
