/**
 * Cloud Hop — a checkpoint mini-game (Doodle Jump style): bounce up a tower of
 * clouds. The hero bounces by itself; steer with ← → (or A / D) — the screen wraps
 * around at the sides. Every ten metres climbed recolours the world. Fall off the
 * bottom and you lose a heart (and land on a fresh cloud). Later on some clouds drift,
 * some are thin and pop after one bounce, and springs launch you high.
 *
 * Heights are in pixels above the start (up = +); the screen shows `camera` .. camera + 180.
 */
import { baseGame, tick, good, hurt, hitBoss, axis } from '../kit/common.js';

export const DOODLE = {
  gravity: 620, bounce: 330, spring: 520,   // bounce → ~88 px high; spring → ~218 px
  speed: 150, width: 320,
  meter: 60,                                // px per "10 m" milestone (one step of progress)
  cloudW: 38,
  gap: [34, 62],                            // vertical distance between clouds
};

export const doodle = {
  id: 'doodle',
  name: 'Cloud Hop',
  controls: 'move',
  checkpoint: true,
  rules: boss => [
    'Bounce up the clouds — you hop by yourself. <strong>Steer with ← →</strong> (or A / D); the sides wrap around.',
    'Every ten metres recolours the world. Springs launch you high; thin clouds pop after one bounce.',
    `Falling off the bottom costs a heart. Climb ${boss.hp * 10} m within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const D = DOODLE;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'doodle',
      hero: { x: 160, y: 16, vy: D.bounce, facing: 1 },
      clouds: [],            // { x, y, kind: 'cloud' | 'drift' | 'thin' | 'spring', vx, popped }
      camera: 0,             // height at the bottom of the screen
      best: 0,               // highest height reached
      milestones: 0,
      top: 0,                // highest cloud generated
      chain: null,           // the last cloud of the climbable chain

      press() { return null; },

      addCloud(y) {
        const rng = this.rng;
        const roll = rng();
        // the chain of clouds you climb is always reachable: solid, drifting or springy …
        let kind = 'cloud';
        if (roll < this.boss.springs) kind = 'spring';
        else if (roll < this.boss.springs + this.boss.drifters) kind = 'drift';
        // … at most ~110 px sideways from the last one (the screen wraps)
        const last = this.chain;
        const x = last ? ((last.x + (rng() * 2 - 1) * 110) % D.width + D.width) % D.width : 160;
        const cloud = { x, y, kind, vx: kind === 'drift' ? (rng() < 0.5 ? -1 : 1) * (25 + rng() * 20) : 0, popped: false };
        this.clouds.push(cloud);
        this.chain = cloud;
        this.top = y;
        // thin clouds that pop after one bounce are extras beside the chain, never a step you need
        if (rng() < this.boss.thin) this.clouds.push({ x: (x + 80 + rng() * 160) % D.width, y: y - 10 - rng() * 20, kind: 'thin', vx: 0, popped: false });
      },

      step(dt) {
        const state = tick(this, dt);
        if (state === 'over') return;
        const h = this.hero;
        const dir = state === 'play' ? axis(this) : 0;
        if (dir) h.facing = dir;
        h.x = ((h.x + dir * D.speed * dt) % D.width + D.width) % D.width;
        const before = h.y;
        h.vy -= D.gravity * dt;
        h.y += h.vy * dt;
        // clouds ahead
        while (this.top < this.camera + 260) this.addCloud(this.top + D.gap[0] + this.rng() * (D.gap[1] - D.gap[0]) * (0.6 + 0.4 * this.boss.spread));
        for (const c of this.clouds) if (c.kind === 'drift') { c.x += c.vx * dt; if (c.x < 20 || c.x > 300) c.vx *= -1; }
        // landing (only while falling, feet passing the cloud top)
        if (h.vy < 0) {
          for (const c of this.clouds) {
            if (c.popped || before < c.y || h.y > c.y) continue;
            const dx = Math.abs(((h.x - c.x + D.width * 1.5) % D.width) - D.width / 2);
            if (dx > D.cloudW / 2 + 3) continue;
            h.y = c.y;
            h.vy = c.kind === 'spring' ? D.spring : D.bounce;
            if (c.kind === 'thin') c.popped = true;
            this.events.push({ type: 'bounce', spring: c.kind === 'spring' });
            break;
          }
        }
        // the camera follows the hero up (never down)
        this.camera = Math.max(this.camera, h.y - 90);
        this.best = Math.max(this.best, h.y);
        this.clouds = this.clouds.filter(c => c.y > this.camera - 30);
        if (state !== 'play') return;
        while (this.best >= (this.milestones + 1) * D.meter && this.bossHp > 0) {
          this.milestones++;
          good(this);
          hitBoss(this);
        }
        // fell off the bottom: a heart, and a fresh cloud to land on
        if (h.y < this.camera - 20) {
          hurt(this, { fell: true });
          if (this.result !== 'playing') return;
          const c = { x: h.x, y: this.camera + 10, kind: 'cloud', vx: 0, popped: false };
          this.clouds.push(c);
          h.y = c.y + 40; h.vy = 0;
        }
      },
    });
    for (let y = 0; y < 200;) { g.addCloud(y); y += DOODLE.gap[0] + g.rng() * 20; }
    g.clouds[0].x = 160; g.clouds[0].kind = 'cloud'; g.clouds[0].vx = 0;
    return g;
  },

  /** Steers toward the best cloud it can land on next. */
  bot({ lead = 0 } = {}) {
    const D = DOODLE;
    return g => {
      for (const k of ['ArrowLeft', 'ArrowRight']) g.held.delete(k);
      const h = { ...g.hero, x: g.hero.x + (g.held.has('ArrowRight') ? 1 : g.held.has('ArrowLeft') ? -1 : 0) * D.speed * lead };
      const apex = h.y + Math.max(0, h.vy) ** 2 / (2 * D.gravity);
      const wrapDx = c => ((c.x - h.x + D.width * 1.5) % D.width) - D.width / 2;
      // rising: aim at the highest cloud below the apex; falling: the nearest cloud below
      const options = g.clouds.filter(c => !c.popped && c.y <= apex - 4 && c.y > g.camera - 10 && (h.vy > 0 || c.y <= h.y));
      if (!options.length) return;
      const score = c => c.y - Math.abs(wrapDx(c)) * 0.35 + (c.kind === 'spring' ? 80 : 0) - (c.kind === 'thin' ? 10 : 0);
      const target = options.sort((a, b) => score(b) - score(a))[0];
      const dx = wrapDx(target);
      if (Math.abs(dx) > 4 + lead * D.speed * 0.35) g.held.add(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    };
  },
};
