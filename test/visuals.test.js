import test from 'node:test';
import assert from 'node:assert/strict';
import { levels, TIERS, tierOf, tierForDifficulty } from '../src/levels/index.js';
import { BIOMES, BIOME_LIST } from '../src/world/biomes.js';
import { MATERIALS, TEXTURE_IDS } from '../src/engine/materials.js';
import { PAINTER_IDS } from '../src/engine/textures.js';
import { auditLevel } from '../src/levels/audit.js';
import { generateLevel } from '../src/levels/generator.js';
import { buildScenery, auditScenery, routeSamples } from '../src/world/scenery.js';
import { auditBiome, auditTierBackgrounds } from '../src/levels/visualAudit.js';
import { chaseCamera } from '../src/engine/camera.js';
import { ZONES } from '../src/world/zones.js';
import { Config } from '../src/engine/config.js';

const codes = result => result.errors.map(e => e.code);

// ---------------------------------------------------------------------------
// Tiers & backgrounds
// ---------------------------------------------------------------------------
test('tiers group the whole campaign in order, each with its own biome', () => {
  assert.deepEqual(TIERS.flatMap(t => t.levels), levels);
  assert.equal(new Set(TIERS.map(t => t.biome)).size, TIERS.length);
  for (const tier of TIERS) {
    assert.ok(BIOMES[tier.biome], tier.id);
    for (const level of tier.levels) assert.equal(tierOf(level), tier);
  }
});

test('tiers really are difficulty groups: mean rating rises tier by tier', () => {
  const means = TIERS.map(t => t.levels.reduce((s, l) => s + auditLevel(l).metrics.rating, 0) / t.levels.length);
  for (let i = 1; i < means.length; i++) assert.ok(means[i] > means[i - 1], `tier ${i + 1} mean ${means[i]} vs ${means[i - 1]}`);
});

test('standalone generated levels map to the tier their difficulty belongs to', () => {
  for (const level of levels.filter(l => l.meta?.generated)) {
    assert.equal(tierForDifficulty(level.meta.difficulty).id, level.tier, level.name);
  }
  assert.equal(tierForDifficulty(0).id, 'meadow');
  assert.equal(tierForDifficulty(1).id, 'starlit');
});

test('every tier background is clearly distinct from every other', () => {
  const result = auditTierBackgrounds(TIERS);
  assert.ok(result.ok, JSON.stringify(result.issues));
  assert.equal(result.pairs.length, (TIERS.length * (TIERS.length - 1)) / 2);
});

test('every zone background is clearly distinct from every other (a run may visit any four)', () => {
  const zones = Object.values(ZONES).map(z => ({ id: z.id, name: z.name, biome: z.biome }));
  const result = auditTierBackgrounds(zones);
  assert.ok(result.ok, JSON.stringify(result.issues));
  assert.equal(new Set(zones.map(z => z.biome)).size, zones.length, 'each zone has its own biome');
  for (const z of Object.values(ZONES)) assert.ok(BIOMES[z.biome], z.id);
});

test('every biome is readable: platforms, avatar and goal stand out', () => {
  for (const biome of BIOME_LIST) {
    const result = auditBiome(biome);
    assert.ok(result.ok, JSON.stringify(result.issues));
  }
});

test('materials reference painted textures; biomes reference materials and kits', () => {
  for (const id of TEXTURE_IDS) assert.ok(PAINTER_IDS.includes(id), `no painter for ${id}`);
  for (const biome of BIOME_LIST) {
    assert.ok(MATERIALS[biome.material], biome.id);
    if (biome.ground) {
      assert.ok(MATERIALS[biome.ground.material], biome.id);
      assert.ok(biome.ground.y < Config.PLAYER_FALL_THRESHOLD - 2, `${biome.id} ground must be below the kill plane`);
    }
  }
});

// ---------------------------------------------------------------------------
// Scenery safety
// ---------------------------------------------------------------------------
test('scenery is safe for every level in every biome', () => {
  for (const level of levels) {
    const audit = auditLevel(level);
    for (const biome of BIOME_LIST) {
      const scenery = buildScenery(level, biome, audit);
      const result = auditScenery(level, scenery, audit);
      assert.ok(result.ok, `${level.name} / ${biome.id}: ${JSON.stringify(result.errors)}`);
      assert.deepEqual(result.warnings, []);
      assert.ok(scenery.boxes.length > 100, 'scenery is actually present');
    }
  }
});

test('scenery is deterministic and never touches the level', () => {
  const level = levels[4];
  const before = JSON.stringify(level);
  const audit = auditLevel(level);
  const a = buildScenery(level, BIOMES.canyon, audit);
  const b = buildScenery(level, BIOMES.canyon, audit);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(level), before);
});

test('scenery is safe for freshly generated levels too (sample)', () => {
  for (let seed = 1; seed <= 6; seed++) {
    for (const difficulty of [0.2, 0.5, 0.9]) {
      const { level, audit } = generateLevel({ seed, difficulty });
      const biome = BIOMES[tierForDifficulty(difficulty).biome];
      const result = auditScenery(level, buildScenery(level, biome, audit), audit);
      assert.ok(result.ok, `seed ${seed}@${difficulty}: ${JSON.stringify(result.errors)}`);
    }
  }
});

test('the scenery audit catches unsafe decoration', () => {
  const level = levels[0];
  const audit = auditLevel(level);
  const base = buildScenery(level, BIOMES.meadow, audit);
  const withBox = box => ({ ...base, boxes: [...base.boxes, box] });
  const samples = routeSamples(level, audit);
  const p1 = level.platforms[1];

  // a rock right where the player walks
  const mid = samples.positions[Math.floor(samples.positions.length / 2)];
  assert.ok(codes(auditScenery(level, withBox({ kind: 'near', center: [mid.x, mid.y + 0.8, mid.z], size: [0.4, 0.4, 0.4], color: [1, 1, 1] }), audit)).includes('SCENERY_IN_PATH'));

  // a tree between the chase camera and the player
  const eye = chaseCamera(mid).eye;
  const between = [0, 1, 2].map(i => (eye[i] + [mid.x, mid.y + 0.9, mid.z][i]) / 2);
  assert.ok(codes(auditScenery(level, withBox({ kind: 'near', center: between, size: [1, 1, 1], color: [1, 1, 1] }), audit)).includes('SCENERY_OCCLUDES'));

  // a platform-looking slab within jump reach (but not in the way)
  const fake = { kind: 'near', center: [p1.x + p1.width / 2 + 2.2, p1.y, p1.z], size: [1.5, 1, 1.5], color: [1, 1, 1] };
  assert.ok(codes(auditScenery(level, withBox(fake), audit)).includes('FAKE_PLATFORM'));

  // decoration intersecting a platform
  assert.ok(codes(auditScenery(level, withBox({ kind: 'near', center: [p1.x, p1.y - 0.4, p1.z], size: [1, 0.3, 1], color: [1, 1, 1] }), audit)).includes('SCENERY_COLLIDES'));

  // an oversized "surface detail"
  assert.ok(codes(auditScenery(level, withBox({ kind: 'surface', host: 0, center: [1, 0.5 + 0.4, 1], size: [0.2, 0.8, 0.2], color: [1, 1, 1] }), audit)).includes('SURFACE_DETAIL'));

  // a floor the player could appear to land on
  assert.ok(codes(auditScenery(level, { ...base, ground: { ...base.ground, y: -5 } }, audit)).includes('GROUND_TOO_HIGH'));
});
