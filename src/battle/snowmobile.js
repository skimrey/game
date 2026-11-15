/**
 * Snowmobile — a travel level (alpine → starlit): race over the snowy ridges to the peak.
 *
 * Hold → to throttle, ← to brake. Over the crests you fly: in the air, ← → tilt the
 * sled — land with its nose along the slope or you tumble (a heart). Crevasses need
 * speed to clear. Every stretch recolours the world.
 */
import { baseGame, tick, good, hurt, hitBoss } from './common.js';

export const SNOWMOBILE = {
  sledX: 90, accel: 120, brake: 160, drag: 0.25, maxSpeed: 230, minSpeed: 30,
  gravity: 520, tilt: 3, safeAngle: 0.55,
};

/** Terrain height (px above the bottom) at distance x along the course. */
export function hillAt(g, x) {
  const h = 60 + Math.sin(x * 0.011 + g.phase) * g.boss.hills + Math.sin(x * 0.027 + g.phase * 2) * g.boss.hills * 0.45;
  return h;
}
export function slopeAt(g, x) { return Math.atan2(hillAt(g, x + 2) - hillAt(g, x - 2), 4); }

export const snowmobile = {
  id: 'snowmobile',
  name: 'Snowmobile',
  controls: 'throttle+tilt',
  travel: true,
  rules: boss => [
    'Hold <strong>→</strong> to throttle, <strong>←</strong> to brake. Over the crests you fly!',
    'In the air, <strong>← →</strong> tilt the sled: land with its nose along the slope, or you tumble.',
    `Crevasses need speed to clear. Tumbles and crevasses cost a heart. Reach the peak within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const S = SNOWMOBILE;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'snowmobile',
      phase: g.rng() * 6,
      x: 0, speed: 60,
      y: 0, vy: 0, airborne: false, angle: 0,
      crevasses: [],         // { x, w }
      nextCrevasse: 500,
      tumble: 0,

      press() { return null; },

      inCrevasse(x) { return this.crevasses.find(c => x > c.x && x < c.x + c.w); },

      step(dt) {
        const state = tick(this, dt);
        if (state === 'over') return;
        const right = this.held.has('ArrowRight') || this.held.has('KeyD');
        const left = this.held.has('ArrowLeft') || this.held.has('KeyA');
        this.tumble = Math.max(0, this.tumble - dt);
        while (this.nextCrevasse < this.x + 600) {
          this.crevasses.push({ x: this.nextCrevasse, w: this.boss.crevasse * (0.8 + 0.4 * this.rng()) });
          this.nextCrevasse += this.boss.crevasseEvery * (0.7 + 0.6 * this.rng());
        }
        if (!this.airborne) {
          const slope = slopeAt(this, this.x);
          if (state === 'play' && this.tumble <= 0) {
            if (right) this.speed += S.accel * dt;
            if (left) this.speed -= S.brake * dt;
          }
          this.speed += -Math.sin(slope) * S.gravity * 0.35 * dt - this.speed * S.drag * dt;
          this.speed = Math.max(S.minSpeed, Math.min(S.maxSpeed, this.speed));
          this.angle = slope;
          const nx = this.x + this.speed * Math.cos(slope) * dt;
          const ground = hillAt(this, nx);
          // leaving a crest (the ground falls away faster than gravity would take us) or a crevasse edge
          const vyGround = (ground - hillAt(this, this.x)) / dt;
          const vyTake = this.speed * Math.sin(slope);
          if (vyGround < vyTake - S.gravity * dt * 6 || this.inCrevasse(nx)) {
            this.airborne = true; this.vy = vyTake; this.y = hillAt(this, this.x);
          }
          this.x = nx;
          if (!this.airborne) this.y = ground;
        } else {
          if (state === 'play') this.angle += ((left ? 1 : 0) - (right ? 1 : 0)) * S.tilt * dt;
          this.vy -= S.gravity * dt;
          this.x += this.speed * dt;
          this.y += this.vy * dt;
          const ground = hillAt(this, this.x);
          const gap = this.inCrevasse(this.x);
          if (gap && this.y < ground - 40) {
            // fell into the crevasse: a heart, and a rescue to its far side
            this.x = gap.x + gap.w + 12; this.y = hillAt(this, this.x); this.vy = 0; this.airborne = false; this.speed = 70;
            this.events.push({ type: 'crevasse' });
            if (state === 'play') hurt(this, { crevasse: true });
            if (this.result !== 'playing') return;
          } else if (!gap && this.y <= ground) {
            const slope = slopeAt(this, this.x);
            this.y = ground; this.airborne = false;
            if (Math.abs(this.angle - slope) > S.safeAngle && state === 'play') {
              this.tumble = 0.8; this.speed *= 0.4;
              this.events.push({ type: 'tumble' });
              hurt(this, { tumble: true });
              if (this.result !== 'playing') return;
            } else { this.speed *= Math.cos(Math.min(1.2, Math.abs(this.angle - slope))); this.events.push({ type: 'land' }); }
            this.angle = slope;
          }
        }
        if (state !== 'play') return;
        const stretch = Math.floor(this.x / this.boss.stretch);
        while (this.boss.hp - this.bossHp < stretch && this.bossHp > 0) { good(this); hitBoss(this); }
        this.crevasses = this.crevasses.filter(c => c.x + c.w > this.x - 200);
      },
    });
    return g;
  },

  /** Keeps a good speed (more before crevasses) and levels the sled to the landing slope. */
  bot({ lead = 0 } = {}) {
    const S = SNOWMOBILE;
    return g => {
      for (const k of ['ArrowLeft', 'ArrowRight']) g.held.delete(k);
      if (!g.airborne) {
        const crevasse = g.crevasses.find(c => c.x > g.x && c.x - g.x < 260);
        const want = crevasse ? 190 : 140;
        if (g.speed < want) g.held.add('ArrowRight'); else if (g.speed > want + 30) g.held.add('ArrowLeft');
        return;
      }
      // predict the landing point, match its slope
      let x = g.x, y = g.y, vy = g.vy;
      for (let t = 0; t < 3; t += 1 / 60) { vy -= S.gravity / 60; x += g.speed / 60; y += vy / 60; if (y <= hillAt(g, x) && !g.inCrevasse(x)) break; }
      const target = slopeAt(g, x);
      const turning = (g.held.has('ArrowLeft') ? 1 : 0) - (g.held.has('ArrowRight') ? 1 : 0);
      const angle = g.angle + turning * S.tilt * lead;
      if (angle < target - 0.08) g.held.add('ArrowLeft');
      else if (angle > target + 0.08) g.held.add('ArrowRight');
    };
  },
};
