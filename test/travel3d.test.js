/**
 * The 3D journeys (travel3d.js): the same game objects as the 2D versions, drawn with the
 * WebGL renderer. Headless here: a fake renderer records what would be drawn while the
 * mode's bot plays the trip — every vehicle must build a world and hand the renderer
 * finite geometry and a camera every frame, from the start to the finish line.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelScene } from '../src/games/kit/travel3d.js';
import { MODES, TRAVEL_GAMES, createBattleGame } from '../src/games/index.js';
import { bossStats } from '../src/progression/bosses.js';
import { BIOMES } from '../src/world/biomes.js';
import { ZONES } from '../src/world/zones.js';
import { makePet } from '../src/characters/pets.js';

const design = { id: 't', colors: { skin: '#f1c7a0', hair: '#3a2a1a', top: '#d94040', bottom: '#2d3a6b', shoes: '#222222', accent: '#f2b32c' } };
const finite = v => Array.isArray(v) ? v.every(finite) : Number.isFinite(v);

test('every travel game has a 3D version', () => {
  const scene = createTravelScene({ render: () => {}, design, biome: BIOMES.meadow });
  for (const mode of TRAVEL_GAMES) assert.ok(scene.supports(mode), mode);
  assert.equal(scene.supports('quiz'), false);
});

for (const mode of TRAVEL_GAMES) {
  for (const zone of ['meadow', 'alpine', 'volcano', 'lagoon']) {
    test(`3D ${mode} in ${zone}: a world, a camera and finite geometry every frame`, () => {
      const frames = [];
      const render = (level, focus, particles, opts) => frames.push({ level, focus, opts });
      const scene = createTravelScene({ render, design, pet: makePet(3), biome: BIOMES[ZONES[zone].biome], zone });
      const g = createBattleGame({ mode, ...bossStats(mode, 0.5) }, { seed: 11 });
      const bot = MODES[mode].bot();
      scene.attach(g);
      const STEP = 1 / 60;
      for (let i = 0; i < 60 * 90 && g.result === 'playing'; i++) {
        bot(g, STEP); g.step(STEP);
        for (const e of g.drain()) scene.effect(e, g);
        if (i % 20 === 0) scene.draw(g, 1 / 3, i * STEP);
      }
      scene.draw(g, 1 / 60, 99);
      assert.ok(frames.length > 5);
      for (const { level, focus, opts } of frames) {
        assert.ok(level.platforms.length > 0);
        assert.ok(finite([focus.x, focus.y, focus.z]), 'focus');
        assert.ok(finite(opts.camera.eye) && finite(opts.camera.target), 'camera');
        assert.ok(opts.avatar.length > 8, 'the hero and the vehicle');
        for (const p of opts.avatar) assert.ok(finite(Array.from(p.matrix)), 'part matrix');
        for (const b of opts.boxes) assert.ok(finite(b.center) && finite(b.size), 'box');
      }
    });
  }
}
