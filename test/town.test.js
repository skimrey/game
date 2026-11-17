/**
 * Between runs: the town square (a walkable hub with a portal and a door home), pets,
 * home decorations and the profile that keeps them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHub, HUB, atSpot, hubBoxes } from '../src/town/hub.js';
import { createPlayer, stepPlayer } from '../src/world/physics.js';
import { makePet, petParts, createPetFollower, paintPet, SPECIES_IDS, PET_W, PET_H, straySpecies, PET_FOLLOW } from '../src/characters/pets.js';
import { DECOR_LIST, DECOR, SPOTS, decorReward } from '../src/town/decor.js';
import { createProfile } from '../src/progression/profile.js';
import { createSurface } from '../src/engine/pixel.js';
import { mulberry32 } from '../src/levels/generator.js';
import { ZONE_IDS } from '../src/world/zones.js';

const DT = 1 / 120;
/** Walk toward a point in the real physics (jumping when stuck); true when there. */
function walkTo(level, player, target, seconds = 20) {
  let stuck = 0, last = null;
  for (let t = 0; t < seconds; t += DT) {
    const dx = target.x - player.x, dz = target.z - player.z;
    if (Math.hypot(dx, dz) < 0.6) return true;
    // the chase camera looks along +z with +x to the left: input "right" is −x
    const input = { left: dx > 0.2, right: dx < -0.2, forward: dz > 0.2, back: dz < -0.2, jump: stuck > 30 };
    stepPlayer(player, level, input, DT);
    const moved = last ? Math.hypot(player.x - last.x, player.z - last.z) : 1;
    stuck = moved < 0.001 ? stuck + 1 : 0;
    last = { x: player.x, z: player.z };
    if (player.y < -5) return false;
  }
  return false;
}

test('the town square: you start on solid ground, every floor is level, and you can walk to the portal and home', () => {
  const hub = buildHub();
  const tops = new Set(hub.level.platforms.filter(p => p.height >= 0.9 && p.y === 0).map(p => p.y + p.height / 2));
  assert.deepEqual([...tops], [HUB.top], 'one floor height (no steps to trip on)');
  const player = createPlayer(hub.level.spawn);
  for (let t = 0; t < 0.5; t += DT) stepPlayer(player, hub.level, {}, DT);
  assert.ok(player.grounded && Math.abs(player.y - HUB.top) < 1e-6, 'standing at the spawn');
  // past the stalls and round the ring of columns to the portal
  assert.ok(walkTo(hub.level, player, { x: 3, z: 3 }) && walkTo(hub.level, player, { x: 11, z: 3 }) && walkTo(hub.level, player, { x: 11, z: 24 })
    && walkTo(hub.level, player, { x: 0, z: HUB.portal.z - 1.2 }), 'the portal');
  assert.ok(atSpot(player, { x: HUB.portal.x, z: HUB.portal.z }, 1.8));
  const home = createPlayer(hub.level.spawn);
  assert.ok(walkTo(hub.level, home, { x: 12, z: 9 }) && walkTo(hub.level, home, { x: HUB.home.x - 0.7, z: HUB.home.z }), 'the door home');
  // nothing to fall off: hedges all round
  const edge = createPlayer({ x: -20, y: HUB.top, z: 0 });
  walkTo(hub.level, edge, { x: -60, z: 0 }, 6);
  assert.ok(edge.y >= HUB.top - 1e-6 && edge.x > -38, 'the hedge stops you');
  assert.ok(hubBoxes(1).length > 20 && hub.scenery.boxes.length > 50);
  assert.equal(hub.level.goal.y < -100, true, 'the hub has no gem');
});

test('pets: every species has a 3D look and 2D sprites in every pose', () => {
  for (const species of SPECIES_IDS) {
    const pet = makePet(3, { species });
    assert.deepEqual(makePet(3, { species }), pet, 'seeded');
    for (const st of [{ moving: 1 }, { sit: true }, { hop: 0.5 }]) {
      const parts = petParts(pet, { x: 0, y: 0, z: 0, yaw: 0, ...st }, 0.7);
      assert.ok(parts.length >= 8, species);
      assert.ok(parts.every(p => p.matrix.every(Number.isFinite)));
    }
    for (const pose of ['sit', 'hop', 'cheer', 'hide', 'sleep']) {
      const s = paintPet(pet, pose, 1);
      assert.equal(s.w, PET_W); assert.equal(s.h, PET_H);
      assert.ok(s.buf.filter(Boolean).length > 40, `${species} ${pose}`);
    }
  }
  const rng = mulberry32(2);
  const legendary = Array.from({ length: 200 }, () => straySpecies(rng, 5)).filter(s => s === 'dragon').length;
  assert.ok(legendary > 10, 'a perfect run can bring home a dragonling');
  assert.ok(!Array.from({ length: 200 }, () => straySpecies(rng, 3)).includes('dragon'), 'three stars: no dragons');
});

test('the pet follows your footsteps: it hops your gaps and never walks on thin air', () => {
  const pet = makePet(1, { species: 'dog' });
  const f = createPetFollower(pet);
  // you run along, jump a 3-unit gap onto a higher ledge, and run on
  const path = [];
  for (let x = 0; x <= 6; x += 0.05) path.push({ x: 0, y: 0.5, z: x, grounded: true });
  for (let k = 1; k < 20; k++) path.push({ x: 0, y: 0.5 + Math.sin(k / 20 * Math.PI) * 1.4 + k / 20 * 0.8, z: 6 + k * 0.15, grounded: false });
  for (let x = 9; x <= 14; x += 0.05) path.push({ x: 0, y: 1.3, z: x, grounded: true });
  const floors = [[0, 6, 0.5], [9, 14, 1.3]];
  let hops = 0, wasHop = false;
  for (const p of path) {
    for (let i = 0; i < 3; i++) {
      f.update(p, DT);
      const st = f.state;
      if (st.hop > 0) { if (!wasHop) hops++; wasHop = true; continue; }
      wasHop = false;
      const onFloor = floors.some(([z0, z1, y]) => st.z >= z0 - 0.3 && st.z <= z1 + 0.3 && Math.abs(st.y - y) < 1e-6);
      assert.ok(onFloor, `walking on air at z=${st.z.toFixed(2)}, y=${st.y.toFixed(2)}`);
    }
  }
  for (let i = 0; i < 400; i++) f.update(path.at(-1), DT);
  assert.ok(hops >= 1, 'it hopped the gap');
  assert.ok(Math.abs(f.state.y - 1.3) < 1e-6 && f.state.z > 11, `it caught up (z=${f.state.z.toFixed(2)})`);
  // far behind (a respawn): it poofs to you
  f.update({ x: 40, y: 0.5, z: 40, grounded: true }, DT);
  assert.ok(f.takePoof());
  assert.ok(Math.hypot(f.state.x - 40, f.state.z - 40) < 1.5);
  assert.ok(PET_FOLLOW.behind > 0.5);
});

test('decorations: every spot has something, every zone brings something home, a perfect run a trophy', () => {
  for (const spot of SPOTS) assert.ok(DECOR_LIST.some(d => d.spot === spot), spot);
  for (const zone of ZONE_IDS) assert.ok(DECOR_LIST.some(d => d.zone === zone), zone);
  const s = createSurface(320, 180);
  for (const d of DECOR_LIST) { d.paint(s, 160, 120); }
  assert.ok(s.buf.some(Boolean));
  assert.equal(decorReward({ zones: ['lagoon'], stars: 5, owned: [] }).id, 'trophy');
  const r = decorReward({ zones: ['lagoon', 'grove'], stars: 2, owned: ['trophy'] });
  assert.ok(['lagoon', 'grove'].includes(r.zone));
  assert.equal(decorReward({ zones: ['meadow'], stars: 3, owned: DECOR_LIST.map(d => d.id) }), null);
  assert.ok(DECOR.aquarium && DECOR.trophy);
});

test('the profile keeps pets, decorations and runs (and survives bad data)', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const profile = createProfile(storage);
  const pet = makePet(9);
  profile.adopt(pet);
  assert.equal(profile.activePet().id, pet.id, 'the first pet comes along');
  profile.adopt(makePet(10));
  assert.equal(profile.pets().length, 2);
  profile.setActivePet(null);
  assert.equal(profile.activePet(), null);
  assert.equal(profile.addDecor('aquarium'), true);
  assert.equal(profile.addDecor('aquarium'), false);
  profile.toggleDecor('aquarium');
  assert.equal(profile.decor()[0].shown, false);
  profile.finishRun(4); profile.finishRun(2);
  assert.equal(profile.get().runs, 2); assert.equal(profile.get().bestStars, 4);
  profile.setClass('hunter');
  assert.equal(createProfile(storage).heroClass, 'hunter', 'saved');
  store.set('platformer.profile.v1', '{not json');
  assert.equal(createProfile(storage).get().runs, 0, 'broken data: a fresh profile');
});
