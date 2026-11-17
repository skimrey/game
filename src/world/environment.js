/**
 * Environment — resolves everything visual for a level: its difficulty tier (stage),
 * the zone the run visits in that stage (world/zones.js; the stage's classic zone otherwise),
 * the zone's biome (sky, fog, textures) and the level's scenery. Cached per
 * (level, biome) because scenery placement runs the route audit; the audit itself is
 * cached per layout, so a run's copy of a level (the same layout in another zone)
 * doesn't re-run it.
 */
import { BIOMES } from './biomes.js';
import { tierOf } from '../levels/index.js';
import { auditLevel } from '../levels/audit.js';
import { buildScenery } from './scenery.js';
import { VARIANT_TINTS } from '../levels/generator.js';
import { ZONES } from './zones.js';

const cache = new WeakMap();
const audits = new WeakMap();        // level.platforms → audit (copies of a level share the layout)

export function auditOf(level) {
  if (!audits.has(level.platforms)) audits.set(level.platforms, auditLevel(level));
  return audits.get(level.platforms);
}

/** A level generated elsewhere (a worker) comes with its audit: remember it. */
export function primeAudit(level, audit) {
  if (audit) audits.set(level.platforms, audit);
}

/** The zone a level is played in: the run's choice (level.zone), else its stage's classic zone. */
export function zoneFor(level) {
  return ZONES[level.zone] || ZONES[tierOf(level).biome] || ZONES.meadow;
}

export function environmentFor(level, biomeOverride = null) {
  const tier = tierOf(level);
  const zone = zoneFor(level);
  const biome = BIOMES[biomeOverride || zone.biome || tier.biome];
  if (!cache.has(level)) cache.set(level, new Map());
  const perLevel = cache.get(level);
  if (!perLevel.has(biome.id)) {
    const audit = auditOf(level);
    perLevel.set(biome.id, {
      tier,
      zone,
      biome,
      audit,
      scenery: buildScenery(level, biome, audit),
      platformTint: VARIANT_TINTS[level.meta?.variant] || [1, 1, 1],
    });
  }
  return perLevel.get(biome.id);
}
