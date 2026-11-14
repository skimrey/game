import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, PLAYER } from '../src/physics.js';
import { levels } from '../src/levels.js';

const dt = 1 / 120;
const ground = { x: 0, y: 0, z: 0, width: 10, height: 1, depth: 10 };
const level = { spawn: { x: 0, y: 1, z: 0 }, platforms: [ground], goal: { x: 4, y: 0.5, z: 4, radius: 0.5 } };

function advance(player, input, count = 1, currentLevel = level) {
  let result;
  for (let i = 0; i < count; i++) result = stepPlayer(player, currentLevel, input, dt);
  return result;
}

test('gravity lands on a platform and jumping returns to it', () => {
  const player = createPlayer(level.spawn);
  advance(player, {}, 120);
  assert.equal(player.y, 0.5);
  assert.equal(player.grounded, true);
  advance(player, { jump: true });
  assert.ok(player.y > 0.5);
  assert.equal(player.grounded, false);
  advance(player, {}, 120);
  assert.equal(player.y, 0.5);
  assert.equal(player.grounded, true);
});

test('movement is normalized and walls stop the player', () => {
  const player = createPlayer({ x: 0, y: 0.5, z: 0 });
  player.grounded = true;
  advance(player, { forward: true, right: true }, 60);
  assert.ok(Math.abs(Math.hypot(player.x, player.z) - PLAYER.speed / 2) < 1e-8);
  assert.ok(player.x < 0 && player.z > 0);
  const wall = { x: 0, y: 1, z: 3, width: 10, height: 2, depth: 1 };
  const wallLevel = { ...level, platforms: [ground, wall] };
  const other = createPlayer({ x: 0, y: 0.5, z: 0 });
  advance(other, { forward: true }, 120, wallLevel);
  assert.ok(Math.abs(other.z - (2.5 - PLAYER.halfWidth)) < 1e-8);
});

test('falling respawns and the goal only triggers on its platform', () => {
  const player = createPlayer({ x: 0, y: -13, z: 0 });
  assert.equal(advance(player, {}), 'respawn');
  assert.deepEqual(player, createPlayer(level.spawn));
  Object.assign(player, { x: 4, y: 0.5, z: 4, grounded: true });
  assert.equal(advance(player, {}), 'goal');
  player.y = 2;
  player.grounded = false;
  assert.equal(advance(player, {}), 'playing');
});

test('each level has a supported spawn and goal', () => {
  for (const currentLevel of levels) {
    const supports = (point, top) => currentLevel.platforms.some(p =>
      Math.abs(point.x - p.x) < p.width / 2 &&
      Math.abs(point.z - p.z) < p.depth / 2 &&
      Math.abs(p.y + p.height / 2 - top) < 0.001);
    assert.ok(currentLevel.platforms.some(p => supports(currentLevel.spawn, p.y + p.height / 2) &&
      currentLevel.spawn.y >= p.y + p.height / 2));
    assert.ok(supports(currentLevel.goal, currentLevel.goal.y));
  }
});
