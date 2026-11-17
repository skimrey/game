import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CHARACTERS, STYLE_OPTIONS, COLOR_SLOTS, DRAFT_ID, MAX_SAVED, STORAGE_KEY,
  normalizeCharacter, randomCharacter, sameLook, hexToRgb, rgbToHex, createCharacterStore,
} from '../src/characters/character.js';
import { createAvatar, lookFor } from '../src/characters/avatar.js';
import { projectParts } from '../src/characters/portrait.js';
import { createPlayer, stepPlayer, PLAYER } from '../src/world/physics.js';
import { transformPoint } from '../src/engine/mat4.js';
import { mulberry32 } from '../src/levels/generator.js';

/** In-memory stand-in for localStorage. */
function memoryStorage() {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('three distinct default heroes, all valid', () => {
  assert.equal(DEFAULT_CHARACTERS.length, 3);
  assert.equal(new Set(DEFAULT_CHARACTERS.map(c => c.id)).size, 3);
  for (const c of DEFAULT_CHARACTERS) assert.deepEqual(normalizeCharacter(c), c, c.name);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const a = DEFAULT_CHARACTERS[i], b = DEFAULT_CHARACTERS[j];
    const differences = Object.keys(STYLE_OPTIONS).filter(k => a[k] !== b[k]).length;
    assert.ok(differences >= 6, `${a.name} vs ${b.name}: only ${differences} style differences`);
  }
});

test('designs are normalised: bad or missing fields fall back, names and colours are cleaned', () => {
  const d = normalizeCharacter({ name: '   A very very long name indeed, far too long ', hat: 'sombrero', colors: { top: '#ABCDEF', skin: 'red' } });
  assert.equal(d.name.length <= 20, true);
  assert.equal(d.hat, DEFAULT_CHARACTERS[0].hat);
  assert.equal(d.colors.top, '#abcdef');
  assert.equal(d.colors.skin, DEFAULT_CHARACTERS[0].colors.skin);
  assert.deepEqual(Object.keys(d.colors).sort(), [...COLOR_SLOTS].sort());
  assert.ok(sameLook(normalizeCharacter(null), DEFAULT_CHARACTERS[0]));
  assert.equal(rgbToHex(hexToRgb('#12ab7f')), '#12ab7f');
  const r = randomCharacter(mulberry32(3), 'Rex');
  assert.equal(r.name, 'Rex');
  assert.ok(sameLook(r, normalizeCharacter(r)));
});

test('saved designs: save, edit, draft, select, delete — and survive a reload', () => {
  const storage = memoryStorage();
  const store = createCharacterStore(storage);
  assert.equal(store.selected().id, 'pip');
  assert.equal(store.all().length, 3);

  // saving a default (or anything not saved yet) creates a new design with a fresh id
  const mine = store.save({ ...DEFAULT_CHARACTERS[1], name: 'My Nova', hair: 'mohawk' });
  assert.notEqual(mine.id, 'nova');
  assert.equal(store.saved().length, 1);
  // saving it again updates in place
  const edited = store.save({ ...mine, back: 'cape' });
  assert.equal(edited.id, mine.id);
  assert.equal(store.saved().length, 1);
  assert.equal(store.get(mine.id).back, 'cape');

  store.select(mine.id);
  const reloaded = createCharacterStore(storage);
  assert.equal(reloaded.selected().id, mine.id);
  assert.equal(reloaded.selected().hair, 'mohawk');

  // unsaved work is kept as a draft, which can be selected
  reloaded.setDraft({ ...mine, name: 'Work in progress' });
  reloaded.select(DRAFT_ID);
  assert.equal(createCharacterStore(storage).selected().name, 'Work in progress');

  // deleting the selected design falls back to Pip
  reloaded.select(mine.id);
  reloaded.remove(mine.id);
  assert.equal(reloaded.saved().length, 0);
  assert.equal(reloaded.selected().id, 'pip');

  // corrupt storage never breaks the game
  storage.setItem(STORAGE_KEY, '{not json');
  assert.equal(createCharacterStore(storage).selected().id, 'pip');
});

test('there is a limit on saved designs, with a clear message', () => {
  const store = createCharacterStore(memoryStorage());
  for (let i = 0; i < MAX_SAVED; i++) store.save({ ...DEFAULT_CHARACTERS[0], name: `Hero ${i}` });
  assert.throws(() => store.save({ ...DEFAULT_CHARACTERS[0], name: 'One too many' }), /up to 12/);
});

test('works without localStorage (memory only)', () => {
  const store = createCharacterStore(null);
  const saved = store.save({ ...DEFAULT_CHARACTERS[2], name: 'Temp' });
  store.select(saved.id);
  assert.equal(store.selected().name, 'Temp');
});

// ---------------------------------------------------------------------------
// Avatar looks
// ---------------------------------------------------------------------------
const dt = 1 / 120;
const ground = { x: 0, y: 0, z: 0, width: 40, height: 1, depth: 40 };
const level = { spawn: { x: 0, y: 0.5, z: 0 }, platforms: [ground], goal: { x: 15, y: 0.5, z: 15, radius: 0.5 } };

function bounds(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { matrix, flair } of parts) {
    if (flair) continue;        // big decorative wings may spread wider than the body (see avatar.js)
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      const p = transformPoint(matrix, [x, y, z]);
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
    }
  }
  return { min, max };
}

test('every look fits the physics box and stands on the floor — heroes, each option, random mixes', () => {
  const rng = mulberry32(11);
  const designs = [...DEFAULT_CHARACTERS];
  for (const [key, options] of Object.entries(STYLE_OPTIONS)) {
    for (const [value] of options) designs.push({ ...DEFAULT_CHARACTERS[0], [key]: value });
  }
  for (let i = 0; i < 60; i++) designs.push(randomCharacter(rng));
  for (const design of designs) {
    const avatar = createAvatar({ character: design, random: () => 0.5 });
    const player = createPlayer(level.spawn);
    for (let i = 0; i < 120; i++) { stepPlayer(player, level, {}, dt); avatar.update(player, dt); }
    const { min, max } = bounds(avatar.getParts(player));
    const label = JSON.stringify(design).slice(0, 120);
    assert.ok(Math.abs(min[1] - player.y) < 0.03, `feet at ${min[1]} ${label}`);
    assert.ok(max[1] - player.y <= PLAYER.height + 0.06, `top at ${max[1] - player.y} ${label}`);
    assert.ok(Math.max(max[0] - player.x, player.x - min[0]) <= PLAYER.halfWidth + 0.06, `width ${label}`);
  }
});

test('looks differ where the design says so, and accessories react to motion', () => {
  const player = createPlayer(level.spawn);
  const parts = design => createAvatar({ character: design, random: () => 0.5 }).getParts(player);
  const pip = DEFAULT_CHARACTERS[0];
  assert.ok(parts({ ...pip, back: 'jetpack' }).length > parts({ ...pip, back: 'none' }).length);
  assert.ok(parts({ ...pip, hat: 'crown' }).length > parts({ ...pip, hat: 'none' }).length);
  assert.ok(lookFor({ ...pip, build: 'small' }).dims.head > lookFor(pip).dims.head);
  const red = lookFor({ ...pip, colors: { ...pip.colors, top: '#ff0000' } });
  assert.deepEqual(red.colors.top, [1, 0, 0]);

  // a cape trails behind while running; jet flames only burn in the air
  const avatar = createAvatar({ character: { ...pip, back: 'cape' } });
  const runner = createPlayer(level.spawn);
  for (let i = 0; i < 120; i++) { stepPlayer(runner, level, {}, dt); avatar.update(runner, dt); }
  const still = avatar._cape;
  for (let i = 0; i < 90; i++) { stepPlayer(runner, level, { forward: true }, dt); avatar.update(runner, dt); }
  assert.ok(avatar._cape > still + 0.3, `cape ${still} → ${avatar._cape}`);

  const jet = createAvatar({ character: { ...pip, back: 'jetpack' } });
  const jumper = createPlayer(level.spawn);
  for (let i = 0; i < 60; i++) { stepPlayer(jumper, level, {}, dt); jet.update(jumper, dt); }
  const grounded = jet.getParts(jumper).filter(p => p.glow === 1).length;
  stepPlayer(jumper, level, { jump: true }, dt);
  for (let i = 0; i < 20; i++) { stepPlayer(jumper, level, {}, dt); jet.update(jumper, dt); }
  assert.ok(jet.getParts(jumper).filter(p => p.glow === 1).length > grounded, 'flames in the air');
  assert.equal(jet.getFootPositions(jumper).length, 2);
});

test('portraits project a figure into front-facing polygons, far to near', () => {
  const avatar = createAvatar({ character: DEFAULT_CHARACTERS[1], random: () => 0.5 });
  const polygons = projectParts(avatar.getParts({ x: 0, y: 0, z: 0 }));
  assert.ok(polygons.length > 40);
  for (let i = 1; i < polygons.length; i++) assert.ok(polygons[i].depth >= polygons[i - 1].depth);
  for (const p of polygons) assert.equal(p.points.length, 4);
});
