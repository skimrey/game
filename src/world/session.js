/**
 * Game session — the rules layer on top of the physics: health, enemies,
 * checkpoints, stomping / dash attacks / ground-pound shockwaves.
 *
 *   const session = createSession(level);
 *   const { result, events } = session.step(input, dt);
 *
 * Health: the player has 3 hit points.
 *   - touching an enemy costs 1 HP, knocks you back and gives 1.2 s of invulnerability
 *   - falling off the world costs 1 HP and respawns you on the last safe platform
 *   - at 0 HP the level restarts (full health, enemies back)
 * Fighting back:
 *   - stomp: land on a crawler or wisp (bounces you up and refreshes your air dash)
 *   - dash attack: any enemy you hit while air-dashing is defeated
 *   - ground pound: landing sends a shockwave that defeats ground enemies nearby;
 *     pounding onto an enemy (even a spiker) defeats it
 *
 * Events: hurt, fell, death, stomp, dashHit, shockwave, defeat, dash, pound, goal.
 */
import { createPlayer, stepPlayer, pushPlayer, PLAYER } from './physics.js';
import { ENEMY_TYPES, enemyBounds, enemyPosition } from './enemies.js';
import { topOf } from '../levels/audit.js';

export const RULES = {
  maxHealth: 3,
  invulnerableTime: 1.2,
  respawnInvulnerableTime: 1.0,
  knockbackSpeed: 7,
  knockbackTime: 0.22,
  knockbackHop: 6,
  stompBounce: 9,
  shockwaveRadius: 2.2,
  defeatFade: 0.35,
};

function overlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;
}

/** Platform the player is standing on (index), or -1. */
function supportOf(player, level) {
  if (!player.grounded) return -1;
  let best = -1;
  level.platforms.forEach((p, i) => {
    if (Math.abs(topOf(p) - player.y) > 1e-6) return;
    if (Math.abs(player.x - p.x) < p.width / 2 + PLAYER.halfWidth && Math.abs(player.z - p.z) < p.depth / 2 + PLAYER.halfWidth) best = i;
  });
  return best;
}

export function createSession(level, { maxHealth = RULES.maxHealth } = {}) {
  const enemies = (level.enemies || []).map(def => ({ def, alive: true, defeatedAt: null }));
  const session = {
    level,
    player: createPlayer(level.spawn),
    health: maxHealth,
    maxHealth,
    time: 0,
    invulnerable: 0,
    enemies,
    checkpoint: { ...level.spawn },
    deaths: 0,
    defeated: 0,
    hits: 0,

    /** Independent copy of the whole state (deterministic look-ahead for the audit bot). */
    clone() {
      const copy = createSession(level, { maxHealth });
      copy.player = { ...this.player };
      copy.health = this.health;
      copy.time = this.time;
      copy.invulnerable = this.invulnerable;
      copy.checkpoint = { ...this.checkpoint };
      copy.savePoint = this.savePoint && { ...this.savePoint };
      copy.deaths = this.deaths;
      copy.defeated = this.defeated;
      copy.hits = this.hits;
      copy.enemies.forEach((e, i) => { e.alive = enemies[i].alive; e.defeatedAt = enemies[i].defeatedAt; });
      return copy;
    },

    /** A saved checkpoint (an arcade won mid-level): running out of hearts restarts here. */
    savePoint: null,

    /** Restart the level: full health, enemies back, player at the spawn (or the saved checkpoint). */
    reset() {
      const start = this.savePoint || level.spawn;
      this.player = createPlayer(start);
      this.health = maxHealth;
      this.time = 0;
      this.invulnerable = 0;
      this.checkpoint = { ...start };
      for (const e of enemies) { e.alive = true; e.defeatedAt = null; }
    },

    /** Save a checkpoint here and refill the hearts. */
    save(point) {
      this.savePoint = { ...point };
      this.checkpoint = { ...point };
      this.health = maxHealth;
    },

    defeat(enemy, how, events) {
      enemy.alive = false;
      enemy.defeatedAt = this.time;
      this.defeated++;
      const pos = enemyPosition(enemy.def, level, this.time);
      events.push({ type: 'defeat', how, enemy: enemy.def.type, x: pos.x, y: pos.y, z: pos.z });
    },

    hurt(from, events) {
      if (this.invulnerable > 0) return;
      this.health--;
      this.hits++;
      this.invulnerable = RULES.invulnerableTime;
      const p = this.player;
      let ax = p.x - from.x, az = p.z - from.z;
      const l = Math.hypot(ax, az) || 1;
      ax /= l; az /= l;
      pushPlayer(p, ax * RULES.knockbackSpeed, az * RULES.knockbackSpeed, RULES.knockbackTime);
      p.vy = Math.max(p.vy, RULES.knockbackHop);
      p.grounded = false;
      p.pound = false;
      events.push({ type: 'hurt', x: p.x, y: p.y, z: p.z, health: this.health });
    },

    /** Advance one fixed step. Returns { result: 'playing' | 'goal' | 'dead', events }. */
    step(input, dt) {
      const events = [];
      const p = this.player;
      const wasDashing = p.dash > 0, wasPounding = p.pound;
      const previousVy = p.vy;
      const physics = stepPlayer(p, level, input, dt);
      this.time += dt;
      this.invulnerable = Math.max(0, this.invulnerable - dt);
      if (!wasDashing && p.dash > 0) events.push({ type: 'dash', x: p.x, y: p.y, z: p.z, dx: p.dashX, dz: p.dashZ });
      if (!wasPounding && p.pound) events.push({ type: 'pound', x: p.x, y: p.y, z: p.z });

      // Falling off the world
      if (physics === 'respawn') {
        this.health--;
        events.push({ type: 'fell', health: this.health });
        if (this.health <= 0) return this.die(events);
        this.player = createPlayer(this.checkpoint);
        this.invulnerable = RULES.respawnInvulnerableTime;
        return { result: 'playing', events };
      }

      // Checkpoint: the last platform you stood on that has no live ground enemy on it
      const support = supportOf(p, level);
      if (support >= 0 && !enemies.some(e => e.alive && ENEMY_TYPES[e.def.type].ground && e.def.platform === support)) {
        const q = level.platforms[support];
        const inset = Math.min(PLAYER.halfWidth, q.width / 2, q.depth / 2);
        this.checkpoint = {
          x: Math.max(q.x - q.width / 2 + inset, Math.min(q.x + q.width / 2 - inset, p.x)),
          y: topOf(q),
          z: Math.max(q.z - q.depth / 2 + inset, Math.min(q.z + q.depth / 2 - inset, p.z)),
        };
      }

      // Ground-pound shockwave
      if (p.landedPound) {
        events.push({ type: 'shockwave', x: p.x, y: p.y, z: p.z, radius: RULES.shockwaveRadius });
        for (const e of enemies) {
          if (!e.alive || !ENEMY_TYPES[e.def.type].ground) continue;
          const pos = enemyPosition(e.def, level, this.time);
          if (Math.abs(pos.y - p.y) < 0.6 && Math.hypot(pos.x - p.x, pos.z - p.z) <= RULES.shockwaveRadius) this.defeat(e, 'shockwave', events);
        }
      }

      // Contact with enemies
      const body = { x0: p.x - PLAYER.halfWidth, x1: p.x + PLAYER.halfWidth, y0: p.y, y1: p.y + PLAYER.height, z0: p.z - PLAYER.halfWidth, z1: p.z + PLAYER.halfWidth };
      for (const e of enemies) {
        if (!e.alive) continue;
        const b = enemyBounds(e.def, level, this.time);
        if (!overlap(body, b)) continue;
        const type = ENEMY_TYPES[e.def.type];
        const fromAbove = (previousVy <= 0 || p.pound) && p.y >= b.y1 - 0.3;
        if (p.dash > 0 || wasDashing) {
          this.defeat(e, 'dash', events);
        } else if (fromAbove && (type.stompable || p.pound)) {
          this.defeat(e, p.pound ? 'pound' : 'stomp', events);
          if (!p.pound) {
            p.vy = RULES.stompBounce;
            p.grounded = false;
            p.canDash = true;
          }
          events.push({ type: 'stomp', x: p.x, y: p.y, z: p.z });
        } else {
          this.hurt(b.pos, events);
          if (fromAbove) p.vy = RULES.stompBounce * 0.8; // spikes bounce you off
          if (this.health <= 0) return this.die(events);
        }
      }

      if (physics === 'goal') {
        events.push({ type: 'goal' });
        return { result: 'goal', events };
      }
      return { result: 'playing', events };
    },

    die(events) {
      this.deaths++;
      events.push({ type: 'death' });
      this.reset();
      return { result: 'dead', events };
    },

    /** Boxes for live (and fading) enemies, for the renderer. */
    enemyBoxes(enemyParts) {
      const out = [];
      for (const e of enemies) {
        const fade = e.alive ? 0 : Math.min(1, (this.time - e.defeatedAt) / RULES.defeatFade);
        if (fade < 1) out.push(...enemyParts(e.def, level, e.alive ? this.time : e.defeatedAt, fade));
      }
      return out;
    },
  };
  return session;
}
