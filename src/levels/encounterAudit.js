/**
 * Encounter audit — enemies must be placed sensibly and be beatable fairly.
 *
 * Placement rules (errors):
 *   ENEMY_INVALID      unknown type, missing platform, or a platform too small to patrol
 *   ENEMY_AT_SPAWN     anything that can come within reach of the spawn point
 *   ENEMY_AT_GOAL      enemies on (or a wisp over) the goal platform
 *   WISP_IN_PLATFORM   a wisp's path passes through a platform
 * Fairness (error):
 *   ENCOUNTER_UNFAIR   a combat bot, playing in the real physics with enemies active,
 *                      cannot finish the level losing at most ENCOUNTER_RULES.MAX_HITS hearts
 *
 * The combat bot follows the verified route. Before every jump it looks ahead on a
 * cloned session (the game is deterministic) and waits for a safe moment; enemies on
 * the platform it stands on are cleared with a hop + ground pound (the shockwave)
 * or a stomp. Its inputs are recorded, so the run can be replayed and watched.
 */
import { Bot, DT, encodeInput, decodeInput, steer, standingOn, topOf } from './audit.js';
import { createSession } from '../world/session.js';
import { ENEMY_TYPES, enemyPosition, patrolOf } from '../world/enemies.js';
import { PLAYER } from '../world/physics.js';

export const ENCOUNTER_RULES = {
  SPAWN_CLEARANCE: 3.5,
  GOAL_CLEARANCE: 2,
  MIN_PATROL: 0.6,          // half-length of a patrol route
  MAX_HITS: 1,              // the combat bot may lose at most this many hearts
  WAIT_STEP: 0.1,
  MAX_WAIT: 4,
  WISP_NEAR_ROUTE: 1.6,     // a wisp this close to a route jump counts as an encounter there
};

/** Encounters a level of design difficulty d should have (interspersed with platforming). */
export function encounterRequirement(d) {
  return d <= 0 ? 0 : 1 + Math.floor(d * 4);
}

// ---------------------------------------------------------------------------
// Where encounters happen along the route
// ---------------------------------------------------------------------------
function pointSegmentDistance(p, a, b) {
  const ab = b.map((v, i) => v - a[i]), ap = p.map((v, i) => v - a[i]);
  const t = Math.max(0, Math.min(1, ab.reduce((s, v, i) => s + v * ap[i], 0) / (ab.reduce((s, v) => s + v * v, 0) || 1)));
  return Math.hypot(...p.map((v, i) => v - (a[i] + ab[i] * t)));
}

/**
 * Route positions of encounters: a ground enemy on route platform k counts at k;
 * a wisp counts at the route jump (k → k+1) it passes closest to.
 * Returns [{ position, enemies: [index] }] sorted by position.
 */
export function encounterPositions(level, route) {
  const byPos = new Map();
  const add = (pos, i) => { if (!byPos.has(pos)) byPos.set(pos, []); byPos.get(pos).push(i); };
  (level.enemies || []).forEach((e, i) => {
    const type = ENEMY_TYPES[e.type];
    if (!type) return;
    if (type.ground) {
      const k = route.indexOf(e.platform);
      if (k >= 0) add(k, i);
      return;
    }
    let best = null;
    for (let k = 0; k + 1 < route.length; k++) {
      const a = level.platforms[route[k]], b = level.platforms[route[k + 1]];
      const pa = [a.x, topOf(a) + 0.9, a.z], pb = [b.x, topOf(b) + 0.9, b.z];
      let d = Infinity;
      for (let s = 0; s <= 20; s++) {
        const t = s / 20;
        d = Math.min(d, pointSegmentDistance(e.from.map((v, j) => v + (e.to[j] - v) * t), pa, pb));
      }
      if (!best || d < best.d) best = { k, d };
    }
    if (best && best.d <= ENCOUNTER_RULES.WISP_NEAR_ROUTE) add(best.k + 1, i);
  });
  return [...byPos].sort((a, b) => a[0] - b[0]).map(([position, enemies]) => ({ position, enemies }));
}

// ---------------------------------------------------------------------------
// Combat bot
// ---------------------------------------------------------------------------
class SessionBot extends Bot {
  constructor(level, session) {
    super(level);
    this.session = session;
    this.player = session.player;
    this.failed = false;
    this.reachedGoal = false;
  }

  step(input) {
    const before = this.session.player;
    const { result } = this.session.step(input, DT);
    this.inputs.push(encodeInput(input));
    this.player = this.session.player;
    if (result === 'goal') this.reachedGoal = true;
    if (result === 'dead' || this.session.player !== before) {
      this.failed = true;
      return 'respawn';
    }
    return result;
  }

  idle(ticks) {
    for (let i = 0; i < ticks; i++) {
      if (this.step({}) === 'respawn') return false;
    }
    return true;
  }
}

/** Replay recorded inputs on a bot (deterministic: reproduces the look-ahead exactly). */
function replay(bot, inputs) {
  for (const n of inputs) bot.step(decodeInput(n));
}

function groundFoes(session, platform) {
  return session.enemies.filter(e => e.alive && ENEMY_TYPES[e.def.type].ground && e.def.platform === platform);
}

/** Hop + ground pound at an enemy on the platform we stand on. Returns true if it went cleanly. */
function hopPound(bot, enemy, platform, { reach = 1.6 } = {}) {
  const level = bot.level;
  const top = topOf(level.platforms[platform]);
  const hits = bot.session.hits;
  for (let t = 0; t < 600 && enemy.alive; t++) {
    const p = bot.player;
    const pos = enemyPosition(enemy.def, level, bot.session.time);
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    let input;
    if (p.grounded) {
      if (dist > reach) input = steer(dx, dz);
      else input = { ...steer(dx, dz), jump: true };
    } else {
      input = p.y >= top + 0.7 && !p.pound ? { pound: true } : steer(dx * 0.3, dz * 0.3);
    }
    if (bot.step(input) === 'respawn') return false;
  }
  return !enemy.alive && bot.session.hits === hits;
}

/** Clear the ground enemies on `platform`, planning each attempt on a clone first. */
function clearPlatform(real, platform) {
  for (let guard = 0; guard < 6; guard++) {
    const foes = groundFoes(real.session, platform);
    if (!foes.length) return true;
    let plan = null;
    for (const reach of [1.6, 1.2, 2.0]) {
      for (let wait = 0; wait <= 20 && !plan; wait += 5) {
        const trial = new SessionBot(real.level, real.session.clone());
        const target = trial.session.enemies[real.session.enemies.indexOf(foes[0])];
        if (trial.idle(wait) && hopPound(trial, target, platform, { reach }) && trial.player.grounded) plan = trial.inputs;
      }
      if (plan) break;
    }
    if (!plan) {
      // no clean way found: take the fight anyway (may cost a heart)
      const target = foes[0];
      if (!hopPound(real, target, platform) && real.failed) return false;
      continue;
    }
    replay(real, plan);
    if (real.failed) return false;
  }
  return groundFoes(real.session, platform).length === 0;
}

/** Traverse one route edge, waiting on a clone for a moment when it lands cleanly. */
function safeTraverse(real, from, to, kind) {
  const level = real.level;
  const steps = Math.round(ENCOUNTER_RULES.MAX_WAIT / ENCOUNTER_RULES.WAIT_STEP);
  let fallback = null;
  for (let k = 0; k <= steps; k++) {
    const trial = new SessionBot(level, real.session.clone());
    const hitsBefore = trial.session.hits;
    if (!trial.idle(Math.round(k * ENCOUNTER_RULES.WAIT_STEP / DT))) continue;
    const ok = trial.traverse(level.platforms[from], level.platforms[to], kind) && !trial.failed &&
      (trial.reachedGoal || standingOn(trial.player, level.platforms[to]));
    if (!ok) continue;
    if (trial.session.hits === hitsBefore) { replay(real, trial.inputs); return !real.failed; }
    if (!fallback) fallback = trial.inputs;
  }
  if (fallback) { replay(real, fallback); return !real.failed; }
  return false;
}

/** Play the verified route with enemies active. */
export function runCombatBot(level, audit) {
  const session = createSession(level);
  const bot = new SessionBot(level, session);
  bot.settle();
  const route = audit.route || [];
  let ok = true;
  for (const e of route) {
    if (bot.reachedGoal) break;
    if (!clearPlatform(bot, e.from)) { ok = false; break; }
    if (!safeTraverse(bot, e.from, e.to, e.kind)) { ok = false; break; }
  }
  if (ok && !bot.reachedGoal) {
    const last = route.at(-1)?.to;
    if (last !== undefined) clearPlatform(bot, last);
    ok = !bot.failed && bot.finish(level.goal);
  }
  return {
    completed: ok && bot.reachedGoal && !bot.failed,
    hits: session.hits,
    defeated: session.defeated,
    inputs: bot.inputs,
    ticks: bot.inputs.length,
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export function auditEncounters(level, audit) {
  const errors = [], warnings = [];
  const enemies = level.enemies || [];
  const error = (code, message) => errors.push({ code, message });
  const goalPlatforms = level.platforms
    .map((p, i) => (Math.abs(topOf(p) - level.goal.y) < 1e-3 && Math.abs(level.goal.x - p.x) <= p.width / 2 && Math.abs(level.goal.z - p.z) <= p.depth / 2 ? i : -1))
    .filter(i => i >= 0);

  enemies.forEach((e, i) => {
    const type = ENEMY_TYPES[e.type];
    if (!type) return error('ENEMY_INVALID', `Enemy ${i} has unknown type "${e.type}"`);
    if (type.ground) {
      if (!level.platforms[e.platform]) return error('ENEMY_INVALID', `Enemy ${i} has no platform`);
      if (patrolOf(e, level).half < ENCOUNTER_RULES.MIN_PATROL) error('ENEMY_INVALID', `Enemy ${i}'s platform is too small to patrol`);
      if (goalPlatforms.includes(e.platform)) error('ENEMY_AT_GOAL', `Enemy ${i} patrols the goal platform`);
    } else if (!Array.isArray(e.from) || !Array.isArray(e.to)) {
      return error('ENEMY_INVALID', `Wisp ${i} needs from/to points`);
    }
    // sample the enemy's path over a long window
    for (let t = 0; t < 20; t += 0.1) {
      const pos = enemyPosition(e, level, t);
      if (Math.hypot(pos.x - level.spawn.x, pos.z - level.spawn.z) < ENCOUNTER_RULES.SPAWN_CLEARANCE && Math.abs(pos.y - level.spawn.y) < 2.5) {
        error('ENEMY_AT_SPAWN', `Enemy ${i} comes within ${ENCOUNTER_RULES.SPAWN_CLEARANCE} of the spawn`);
        break;
      }
      if (!type.ground) {
        if (Math.hypot(pos.x - level.goal.x, pos.z - level.goal.z) < ENCOUNTER_RULES.GOAL_CLEARANCE && Math.abs(pos.y - level.goal.y) < 2.5) {
          error('ENEMY_AT_GOAL', `Wisp ${i} flies over the goal`);
          break;
        }
        const r = ENEMY_TYPES.wisp.size[0] / 2;
        const inside = level.platforms.some(p => Math.abs(pos.x - p.x) < p.width / 2 + r && Math.abs(pos.z - p.z) < p.depth / 2 + r &&
          pos.y - r < topOf(p) && pos.y + r > p.y - p.height / 2);
        if (inside) { error('WISP_IN_PLATFORM', `Wisp ${i}'s path passes through a platform`); break; }
      }
    }
  });

  const route = audit.route ? [audit.route[0]?.from ?? 0, ...audit.route.map(e => e.to)] : [];
  const positions = encounterPositions(level, route);
  let combat = null;
  if (!errors.length && audit.ok && enemies.length) {
    combat = runCombatBot(level, audit);
    if (!combat.completed || combat.hits > ENCOUNTER_RULES.MAX_HITS) {
      error('ENCOUNTER_UNFAIR', combat.completed
        ? `The combat bot needed to take ${combat.hits} hits (max ${ENCOUNTER_RULES.MAX_HITS})`
        : `The combat bot could not finish with enemies active (took ${combat.hits} hits)`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: { enemies: enemies.length, encounters: positions.length, positions, hits: combat?.hits ?? 0, defeated: combat?.defeated ?? 0 },
    combat,
  };
}
