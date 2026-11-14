/**
 * Environment — resolves everything visual for a level: its difficulty tier,
 * the tier's biome (sky, fog, textures) and the level's scenery. Cached per
 * (level, biome) because scenery placement runs the route audit.
 */
import { BIOMES } from './biomes.js';
import { tierOf } from './levels.js';
import { auditLevel } from './levelAudit.js';
import { buildScenery } from './scenery.js';
import { VARIANT_TINTS } from './levelGenerator.js';

const cache = new WeakMap();

export function environmentFor(level, biomeOverride = null) {
  const tier = tierOf(level);
  const biome = BIOMES[biomeOverride || tier.biome];
  if (!cache.has(level)) cache.set(level, new Map());
  const perLevel = cache.get(level);
  if (!perLevel.has(biome.id)) {
    const audit = auditLevel(level);
    perLevel.set(biome.id, {
      tier,
      biome,
      audit,
      scenery: buildScenery(level, biome, audit),
      platformTint: VARIANT_TINTS[level.meta?.variant] || [1, 1, 1],
    });
  }
  return perLevel.get(biome.id);
}
