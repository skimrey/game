import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, pushPlayer, ABILITIES } from '../src/physics.js';
import { createLevel } from '../src/levelBuilder.js';
import { levels, TIERS } from '../src/levels.js';
import { auditLevel, decodeInput, DT, topOf } from '../src/levelAudit.js';
import { createSession, RULES } from '../src/session.js';
import { enemyPosition, enemyBounds, patrolOf, PATROL_INSET } from '../src/enemies.js';
import { auditEncounters, encounterPositions, ENCOUNTER_RULES } from '../src/encounterAudit.js';

const flat = { spawn: { x: 0, y: 0.5, z: 0 }, platforms: [{ x: 0, y: 0, z: 0, width: 40, height: 1, depth: 40 }], goal: { x: 15, y: 0.5, z: 15, radius: 0.5 } };
const run = (player, level, input, ticks) => { for (let i = 0; i < ticks; i++) stepPlayer(player, level, input, DT); };
const codes = r => r.errors.map(e => e.code);

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------
test('air dash: a fast horizontal burst, gravity paused, once per air time', () => {
  const p = createPlayer({ x: 0, y: 0.5, z: 0 });
  run(p, flat, {}, 5);
  stepPlayer(p, flat, { jump: true, forward: true }, DT);
  run(p, flat, { forward: true }, 20);
  const before = { z: p.z, y: p.y };
  stepPlayer(p, flat, { forward: true, dash: true }, DT);
  run(p, flat, { forward: true }, Math.round(ABILITIES.dashTime / DT) - 1);
  assert.ok(p.z - before.z > ABILITIES.dashSpeed * ABILITIES.dashTime * 0.9, `dash covered ${p.z - before.z}`);
  assert.ok(Math.abs(p.y - before.y) < 1e-9, 'gravity paused while dashing');
  assert.equal(p.canDash, false);
  const z = p.z;
  stepPlayer(p, flat, { forward: true, dash: true }, DT); // second dash in the same jump does nothing special
  assert.ok(p.z - z < ABILITIES.dashSpeed * DT * 0.5);
  run(p, flat, {}, 120);
  assert.ok(p.grounded && p.canDash, 'landing refreshes the dash');
  const ground = createPlayer({ x: 0, y: 0.5, z: 0 });
  run(ground, flat, {}, 5);
  stepPlayer(ground, flat, { dash: true, forward: true }, DT);
  assert.equal(ground.dash, 0, 'no dash on the ground');
});

test('ground pound slams straight down and reports the landing', () => {
  const p = createPlayer({ x: 0, y: 0.5, z: 0 });
  run(p, flat, {}, 5);
  stepPlayer(p, flat, { jump: true }, DT);
  run(p, flat, {}, 30);
  const x = p.x;
  stepPlayer(p, flat, { pound: true, left: true }, DT);
  assert.equal(p.vy < -ABILITIES.poundSpeed + 1, true);
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) { stepPlayer(p, flat, { left: true }, DT); landed = p.landedPound; }
  assert.ok(landed && p.grounded);
  assert.equal(p.x, x, 'no horizontal drift while pounding');
});

test('knockback pushes the player for a moment', () => {
  const p = createPlayer({ x: 0, y: 0.5, z: 0 });
  run(p, flat, {}, 5);
  pushPlayer(p, 6, 0, 0.2);
  run(p, flat, { right: true }, Math.round(0.2 / DT));
  assert.ok(p.x > 1, `pushed to ${p.x}`);
});

// ---------------------------------------------------------------------------
// Enemies & session rules
// ---------------------------------------------------------------------------
function arena(enemies) {
  const level = createLevel('arena').setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 4, 1, 4)
    .addPlatform(0, 0, 6, 8, 1, 4)        // 1: arena, top 0.5
    .addPlatform(0, 0, 12, 4, 1, 4)
    .setGoal(0, 0.5, 12, 1).build();
  level.enemies = enemies;
  return level;
}

test('patrols are deterministic and stay on their platform', () => {
  const level = arena([{ type: 'crawler', platform: 1, axis: 'x', phase: 0.3 }]);
  const e = level.enemies[0];
  const { p, half } = patrolOf(e, level);
  assert.equal(half, 4 - PATROL_INSET);
  for (let t = 0; t < 20; t += 0.05) {
    const pos = enemyPosition(e, level, t);
    assert.ok(Math.abs(pos.x - p.x) <= half + 1e-9 && pos.y === topOf(p));
    assert.deepEqual(enemyPosition(e, level, t), pos);
  }
});

/** Session with the player placed at (x, z) on the arena, optionally in the air with vy. */
function standOn(level, x, z, { y = 0.5, vy = 0, grounded = true } = {}) {
  const s = createSession(level);
  Object.assign(s.player, { x, y, z, vy, grounded });
  return s;
}

function enemyAt(level, t = 0) { return enemyPosition(level.enemies[0], level, t); }

test('walking into a crawler hurts: one heart, knockback, then invulnerability', () => {
  const level = arena([{ type: 'crawler', platform: 1, axis: 'x', speed: 0.0001, phase: 0.5 }]);
  const e = enemyAt(level);
  const s = standOn(level, e.x + 1.2, e.z);
  let hurt = 0;
  for (let i = 0; i < 60; i++) hurt += s.step({ right: true }, DT).events.filter(x => x.type === 'hurt').length; // right = -x: toward it
  assert.equal(hurt, 1, 'invulnerability prevents a second hit');
  assert.equal(s.health, RULES.maxHealth - 1);
  assert.ok(s.player.x > e.x + 0.9, 'knocked back away from the enemy');
});

test('stomping defeats a crawler and bounces; stomping a spiker hurts', () => {
  for (const [type, defeated] of [['crawler', true], ['spiker', false]]) {
    const level = arena([{ type, platform: 1, axis: 'x', speed: 0.0001, phase: 0.5 }]);
    const e = enemyAt(level);
    const s = standOn(level, e.x, e.z, { y: 1.4, vy: -3, grounded: false });
    let events = [];
    for (let i = 0; i < 30; i++) events.push(...s.step({}, DT).events);
    assert.equal(!s.enemies[0].alive, defeated, type);
    assert.equal(events.some(x => x.type === 'hurt'), !defeated, type);
    if (defeated) assert.ok(events.some(x => x.type === 'stomp'));
  }
});

test('a dash defeats any enemy; the pound shockwave defeats nearby ground enemies', () => {
  const level = arena([{ type: 'spiker', platform: 1, axis: 'x', speed: 0.0001, phase: 0.5 }]);
  const e = enemyAt(level);
  const s = standOn(level, e.x + 2.5, e.z, { y: 0.9, vy: 0, grounded: false });
  s.step({ right: true, dash: true }, DT);
  for (let i = 0; i < 30; i++) s.step({ right: true }, DT);
  assert.equal(s.enemies[0].alive, false);
  assert.equal(s.health, RULES.maxHealth);

  const s2 = standOn(level, e.x + 1.5, e.z, { y: 1.6, vy: 0, grounded: false });
  s2.step({ pound: true }, DT);
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...s2.step({}, DT).events);
  assert.ok(events.some(x => x.type === 'shockwave'));
  assert.equal(s2.enemies[0].alive, false);
  assert.equal(s2.health, RULES.maxHealth);
});

test('falling costs a heart and respawns at the last safe platform; 0 hearts restarts', () => {
  const level = arena([]);
  const s = createSession(level);
  for (let i = 0; i < 10; i++) s.step({}, DT);
  Object.assign(s.player, { x: 0, y: 0.5, z: 12, grounded: true });
  s.step({}, DT);
  assert.equal(s.checkpoint.z, 12);
  Object.assign(s.player, { x: 30, y: 0.5, z: 30, grounded: false });
  let r;
  for (let i = 0; i < 400; i++) { r = s.step({}, DT); if (r.events.some(e => e.type === 'fell')) break; }
  assert.equal(s.health, 2);
  assert.equal(s.player.z, 12);
  s.health = 1;
  Object.assign(s.player, { x: 30, y: 0.5, z: 30, grounded: false });
  for (let i = 0; i < 400; i++) { r = s.step({}, DT); if (r.result === 'dead') break; }
  assert.equal(r.result, 'dead');
  assert.equal(s.health, RULES.maxHealth);
  assert.equal(s.player.z, level.spawn.z);
});

// ---------------------------------------------------------------------------
// Encounter audit
// ---------------------------------------------------------------------------
test('placement rules catch bad enemies', () => {
  const base = arena([]);
  const audit = auditLevel(base);
  const check = enemies => codes(auditEncounters({ ...base, enemies }, audit));
  assert.ok(check([{ type: 'crawler', platform: 0 }]).includes('ENEMY_AT_SPAWN'));
  assert.ok(check([{ type: 'crawler', platform: 2 }]).includes('ENEMY_AT_GOAL'));
  assert.ok(check([{ type: 'dragon', platform: 1 }]).includes('ENEMY_INVALID'));
  assert.ok(check([{ type: 'wisp', from: [-6, 0.3, 6], to: [6, 0.3, 6] }]).includes('WISP_IN_PLATFORM'));
  assert.deepEqual(check([{ type: 'crawler', platform: 1, axis: 'x' }]), []);
});

test('the combat bot beats a fair encounter and its run replays exactly', () => {
  const level = arena([{ type: 'crawler', platform: 1, axis: 'x', phase: 0.2 }]);
  const result = auditEncounters(level, auditLevel(level));
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.ok(result.combat.completed && result.combat.hits <= ENCOUNTER_RULES.MAX_HITS);
  const s = createSession(level);
  let goal = false;
  for (const n of result.combat.inputs) if (s.step(decodeInput(n), DT).result === 'goal') { goal = true; break; }
  assert.ok(goal, 'recorded combat run reaches the goal');
});

test('an unfair gauntlet is rejected', () => {
  // a narrow stepping stone swarmed by fast wisps from every direction
  const level = createLevel('gauntlet').setSpawn(0, 0.5, 0)
    .addPlatform(0, 0, 0, 4, 1, 4)
    .addPlatform(0, 0, 5, 4, 1, 4)
    .addPlatform(0, 0, 10, 1.2, 1, 1.2)
    .addPlatform(0, 0, 15, 4, 1, 4)
    .setGoal(0, 0.5, 15, 1).build();
  level.enemies = [0, 0.25, 0.5, 0.75].flatMap(phase => [
    { type: 'wisp', from: [-3, 1.2, 10], to: [3, 1.2, 10], speed: 6, phase },
    { type: 'wisp', from: [0, 1.2, 8.4], to: [0, 1.2, 11.6], speed: 5, phase },
  ]);
  const result = auditEncounters(level, auditLevel(level));
  assert.ok(codes(result).includes('ENCOUNTER_UNFAIR'), JSON.stringify(result.errors));
});

test('every campaign level has fair, interspersed encounters that grow tier by tier', () => {
  const perTier = [];
  for (const tier of TIERS) {
    let total = 0;
    for (const level of tier.levels) {
      const audit = auditLevel(level);
      const result = auditEncounters(level, audit);
      assert.ok(result.ok, `${level.name}: ${JSON.stringify(result.errors)}`);
      const route = [audit.route[0].from, ...audit.route.map(e => e.to)];
      const positions = encounterPositions(level, route).map(e => e.position);
      positions.forEach((p, i) => assert.ok(p >= 2 && (i === 0 || p - positions[i - 1] >= 2), `${level.name}: ${positions}`));
      total += positions.length;
    }
    perTier.push(total / tier.levels.length);
  }
  for (let i = 1; i < perTier.length; i++) assert.ok(perTier[i] > perTier[i - 1], `encounters per tier ${perTier}`);
});
