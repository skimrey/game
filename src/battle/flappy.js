/**
 * Flap Dash — a checkpoint mini-game (Flappy Bird style): the hero flies on a little
 * balloon kite through gaps between pillars (trees, cacti, icicles or columns, by
 * region). Press Space, ↑ or click to flap. Each gate passed recolours the world.
 * Bumping a pillar, the ground or the sky costs a heart — and a moment of safety to
 * get back on course.
 */
import { baseGame, tick, good, hurt, hitBoss } from './common.js';

export const FLAPPY = {
  heroX: 84, gravity: 900, flap: 200, maxFall: 300,   // a flap lifts ~22 px
  ceiling: 8, floor: 150,
  pillarW: 26,
  hero: { r: 7 },
};

const FLAP = ['Space', 'ArrowUp', 'KeyW', 'Enter', 'KeyJ'];

export const flappy = {
  id: 'flappy',
  name: 'Flap Dash',
  controls: 'tap',
  checkpoint: true,
  rules: boss => [
    'Fly through the gaps: press <strong>Space</strong> (or ↑, or click) to flap. The first flap starts the flight.',
    'Every gate you pass recolours the world. Bumping a pillar, the ground or the sky costs a heart.',
    `Pass ${boss.hp} gates within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const F = FLAPPY;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'flappy',
      hero: { y: 80, vy: 0, flap: 0 },
      waiting: true,         // the hero hovers until the first flap
      pillars: [],           // { x, gapY (centre), gap, passed }
      scroll: 0,
      nextPillar: 150,       // px of scroll until the next pillar

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (FLAP.includes(code)) { this.waiting = false; this.hero.vy = -F.flap; this.hero.flap = 0.2; return 'flap'; }
        return null;
      },
      click() { return this.press('Space'); },

      step(dt) {
        const state = tick(this, dt);
        if (state === 'over') return;
        const h = this.hero;
        h.flap = Math.max(0, h.flap - dt);
        if (this.waiting && state === 'play') { h.y = 80 + Math.sin(this.time * 4) * 4; return; }   // hovering until the first flap
        const speed = this.boss.speed;
        this.scroll += speed * dt;
        if (state === 'celebrate') { h.vy = Math.min(h.vy + F.gravity * 0.3 * dt, 60); h.y = Math.max(20, h.y + h.vy * dt); return; }
        h.vy = Math.min(F.maxFall, h.vy + F.gravity * dt);
        h.y += h.vy * dt;
        for (const p of this.pillars) p.x -= speed * dt;
        this.pillars = this.pillars.filter(p => p.x > -40);
        this.nextPillar -= speed * dt;
        if (this.nextPillar <= 0) {
          const last = this.pillars.at(-1);
          const gap = this.boss.gap;
          // the next gap is never more than ~60 px from the last one: always flyable
          const from = last ? Math.max(F.ceiling + gap / 2 + 8, last.gapY - 60) : 50;
          const to = last ? Math.min(F.floor - gap / 2 - 8, last.gapY + 60) : 110;
          this.pillars.push({ x: 340, gapY: from + this.rng() * (to - from), gap, passed: false });
          this.nextPillar = this.boss.spacing * (0.85 + 0.3 * this.rng());
        }
        // gates passed
        for (const p of this.pillars) {
          if (!p.passed && p.x + F.pillarW / 2 < F.heroX - F.hero.r) { p.passed = true; good(this); hitBoss(this); }
        }
        // bumps
        let bump = h.y < F.ceiling + F.hero.r || h.y > F.floor - F.hero.r;
        for (const p of this.pillars) {
          if (Math.abs(p.x - F.heroX) < F.pillarW / 2 + F.hero.r - 2 && Math.abs(h.y - p.gapY) > p.gap / 2 - F.hero.r + 2) bump = true;
        }
        if (bump && hurt(this, { bump: true })) {
          if (h.y > F.floor - F.hero.r) { h.y = F.floor - F.hero.r; h.vy = -F.flap; }
          if (h.y < F.ceiling + F.hero.r) { h.y = F.ceiling + F.hero.r; h.vy = 40; }
        }
        h.y = Math.max(F.ceiling, Math.min(F.floor, h.y));
      },
    });
    return g;
  },

  /** Flaps when it's sinking below the next gap's centre. */
  bot({ lead = 0 } = {}) {
    const F = FLAPPY;
    return g => {
      if (g.waiting) { g.press('Space'); return; }
      const next = g.pillars.find(p => p.x + F.pillarW / 2 > F.heroX - F.hero.r);
      const target = next ? next.gapY + 8 : 80;
      // where we'll be when the flap actually happens
      const y = g.hero.y + g.hero.vy * lead + 0.5 * F.gravity * lead * lead;
      if (y > target && g.hero.vy + F.gravity * lead > 0) g.press('Space');
    };
  },
};
