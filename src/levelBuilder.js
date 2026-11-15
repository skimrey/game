/**
 * Level Editor Helper
 * Utilities for creating and managing levels
 */

export class LevelBuilder {
  constructor(name) {
    this.level = {
      name,
      spawn: { x: 0, y: 1, z: 0 },
      platforms: [],
      goal: { x: 0, y: 2, z: 10, radius: 1 },
    };
  }

  addPlatform(x, y, z, width = 2, height = 1, depth = 2) {
    this.level.platforms.push({ x, y, z, width, height, depth });
    return this;
  }

  /** A bounce pad: landing on it launches you high (see physics.js). Small — you never stand on it. */
  addSpring(x, y, z, width = 1.6, depth = 1.6) {
    this.level.platforms.push({ x, y, z, width, height: 1, depth, spring: true });
    return this;
  }

  /** Which special moves the level allows ('dash' | 'glide' | 'double'); see physics.js. */
  setAbilities(abilities) {
    this.level.abilities = [...abilities];
    return this;
  }

  setSpawn(x, y, z) {
    this.level.spawn = { x, y, z };
    return this;
  }

  /** Add an enemy (see enemies.js): { type, platform, axis, speed, phase } or { type: 'wisp', from, to, … }. */
  addEnemy(enemy) {
    (this.level.enemies ||= []).push(enemy);
    return this;
  }

  /** A short tip shown when the level starts (teach a move the first time it matters). */
  setHint(text) {
    this.level.hint = text;
    return this;
  }

  /** Design difficulty 0..1 — scales the fun requirements (see funAudit.js). */
  setDifficulty(difficulty) {
    this.level.meta = { ...(this.level.meta || {}), difficulty, handmade: true };
    return this;
  }

  setGoal(x, y, z, radius = 1) {
    this.level.goal = { x, y, z, radius };
    return this;
  }

  addStaircase(x, y, z, steps = 5, stepWidth = 2, stepHeight = 0.5, stepDepth = 2) {
    for (let i = 0; i < steps; i++) {
      this.addPlatform(
        x,
        y + i * stepHeight,
        z + i * stepDepth,
        stepWidth,
        1,
        stepDepth
      );
    }
    return this;
  }

  addPlatformRow(x, y, z, count = 5, spacing = 3, width = 2, height = 1, depth = 2) {
    for (let i = 0; i < count; i++) {
      this.addPlatform(x + i * spacing, y, z, width, height, depth);
    }
    return this;
  }

  build() {
    return this.level;
  }
}

export function createLevel(name) {
  return new LevelBuilder(name);
}

/**
 * Quick structural check of level data.
 * For a full audit (completability proven by a bot in the real physics,
 * fairness and quality rules) use `auditLevel` from levelAudit.js.
 */
export function validateLevel(level) {
  const errors = [];

  if (!level.name) errors.push('Level must have a name');
  if (!level.spawn || typeof level.spawn.x !== 'number') errors.push('Level must have a spawn position');
  if (!Array.isArray(level.platforms)) errors.push('Level must have platforms array');
  if (!level.goal || typeof level.goal.radius !== 'number') errors.push('Level must have a goal');

  // Check spawn is above a platform
  const spawnSupported = level.platforms.some(p => {
    const dx = Math.abs(level.spawn.x - p.x);
    const dz = Math.abs(level.spawn.z - p.z);
    const top = p.y + p.height / 2;
    return dx < p.width / 2 && dz < p.depth / 2 && Math.abs(level.spawn.y - top) < 0.1;
  });
  if (!spawnSupported) errors.push('Spawn position must be above a platform');

  return {
    valid: errors.length === 0,
    errors,
  };
}
