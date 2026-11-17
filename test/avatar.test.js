import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, PLAYER } from '../src/world/physics.js';
import { createAvatar, computeShadow, AVATAR_PALETTES } from '../src/characters/avatar.js';
import { transformPoint } from '../src/engine/mat4.js';

const dt = 1 / 120;
const ground = { x: 0, y: 0, z: 0, width: 40, height: 1, depth: 40 };
const level = { spawn: { x: 0, y: 0.5, z: 0 }, platforms: [ground], goal: { x: 15, y: 0.5, z: 15, radius: 0.5 } };

function simulate(player, avatar, input, steps) {
  const events = [];
  for (let i = 0; i < steps; i++) {
    stepPlayer(player, level, input, dt);
    events.push(...avatar.update(player, dt));
  }
  return events;
}

/** World-space bounding box of all avatar parts (corners of every unit cube). */
function bounds(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { matrix } of parts) {
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      const p = transformPoint(matrix, [x, y, z]);
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
    }
  }
  return { min, max };
}

test('idle avatar stands on the floor and fits the physics box', () => {
  const player = createPlayer(level.spawn);
  const avatar = createAvatar({ random: () => 0.5 });
  simulate(player, avatar, {}, 120);
  assert.equal(avatar.state, 'idle');
  const { min, max } = bounds(avatar.getParts(player));
  assert.ok(Math.abs(min[1] - player.y) < 0.03, `feet at ${min[1]}`);
  assert.ok(max[1] - player.y <= PLAYER.height + 0.06, `head top at ${max[1] - player.y}`);
  assert.ok(max[0] - player.x <= PLAYER.halfWidth + 0.06 && player.x - min[0] <= PLAYER.halfWidth + 0.06);
  for (const part of avatar.getParts(player)) assert.equal(part.matrix.length, 16);
});

test('running turns the avatar toward the movement direction and emits footsteps', () => {
  const player = createPlayer(level.spawn);
  const avatar = createAvatar();
  const events = simulate(player, avatar, { left: true }, 120); // physics: left => +x
  assert.equal(avatar.state, 'run');
  assert.ok(Math.abs(avatar.yaw - Math.PI / 2) < 0.01, `yaw ${avatar.yaw}`);
  assert.ok(avatar.runBlend > 0.95);
  assert.ok(Math.abs(avatar.speed - PLAYER.speed) < 1e-6);
  assert.ok(events.filter(e => e.type === 'step').length >= 4);
  // while running, the lowest foot stays on the ground
  for (let i = 0; i < 30; i++) {
    simulate(player, avatar, { left: true }, 1);
    const { min } = bounds(avatar.getParts(player));
    assert.ok(min[1] - player.y < 0.06 && min[1] - player.y > -0.01, `foot ${min[1] - player.y}`);
  }
  simulate(player, avatar, { back: true }, 120);
  assert.ok(Math.abs(Math.abs(avatar.yaw) - Math.PI) < 0.01, `yaw ${avatar.yaw}`);
  simulate(player, avatar, {}, 120);
  assert.equal(avatar.state, 'idle');
});

test('jumping emits jump/land events and squashes on landing', () => {
  const player = createPlayer(level.spawn);
  const avatar = createAvatar();
  simulate(player, avatar, {}, 10);
  const jumpEvents = simulate(player, avatar, { jump: true }, 1);
  assert.deepEqual(jumpEvents.map(e => e.type), ['jump']);
  simulate(player, avatar, {}, 20);
  assert.equal(avatar.state, 'jump');
  assert.ok(avatar.airBlend > 0.9);
  simulate(player, avatar, {}, 40);
  assert.equal(avatar.state, 'fall');
  let landed = null;
  for (let i = 0; i < 120 && !landed; i++) {
    landed = simulate(player, avatar, {}, 1).find(e => e.type === 'land');
  }
  assert.ok(landed && landed.impact > 7, 'land event with impact');
  simulate(player, avatar, {}, 4);
  assert.ok(avatar.squash < -0.05, `squash ${avatar.squash}`);
  simulate(player, avatar, {}, 240);
  assert.ok(Math.abs(avatar.squash) < 0.01);
});

test('teleporting (respawn) resets the avatar with a pop-in', () => {
  const player = createPlayer(level.spawn);
  const avatar = createAvatar();
  simulate(player, avatar, { left: true }, 60);
  Object.assign(player, createPlayer({ x: 10, y: 0.5, z: 10 }));
  avatar.update(player, dt);
  assert.equal(avatar.yaw, 0);
  assert.ok(avatar.runBlend < 0.2);
  const { max } = bounds(avatar.getParts(player));
  assert.ok(max[1] - player.y < 0.5, 'scaled down at start of pop-in');
});

test('forced previews and palettes', () => {
  const player = createPlayer(level.spawn);
  const avatar = createAvatar();
  for (const [preview, state] of [['run', 'run'], ['jump', 'jump'], ['fall', 'fall'], ['idle', 'idle']]) {
    avatar.preview = preview;
    simulate(player, avatar, {}, 60);
    assert.equal(avatar.state, state);
  }
  assert.equal(player.x, 0);
  avatar.setPalette('royal');
  assert.ok(avatar.getParts(player).some(p => p.color === AVATAR_PALETTES.royal.shirt));
});

test('shadow lands on the highest platform below and is clipped to it', () => {
  const ledge = { x: 0, y: 1, z: 0, width: 1, height: 1, depth: 1 };
  const lvl = { platforms: [ground, ledge] };
  const [onLedge, ...rest] = computeShadow(lvl, { x: 0, y: 3, z: 0 });
  assert.equal(rest.length, 1); // outer blob + core
  assert.equal(onLedge.y, 1.5);
  assert.ok(onLedge.width <= 1 && onLedge.depth <= 1);
  const [beside] = computeShadow(lvl, { x: 3, y: 1, z: 0 });
  assert.equal(beside.y, 0.5);
  assert.deepEqual(computeShadow(lvl, { x: 100, y: 1, z: 0 }), []);
  // standing on the corner of four tiles: the shadow is split across all of them
  const tiles = [-1, 1].flatMap(x => [-1, 1].map(z => ({ x, y: 0, z, width: 2, height: 1, depth: 2 })));
  const pieces = computeShadow({ platforms: tiles }, { x: 0, y: 0.5, z: 0 });
  const outer = pieces.filter(p => p.lift === pieces[0].lift);
  assert.equal(outer.length, 4);
  const area = outer.reduce((sum, p) => sum + p.width * p.depth, 0);
  assert.ok(Math.abs(area - 1) < 1e-9, `area ${area}`);
});
