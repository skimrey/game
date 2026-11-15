/**
 * Runner — the default boss battle ("press the key to jump").
 *
 * The hero runs on the spot while the boss, at the right, hurls spikes along the
 * ground. To jump, press the key shown above the hero — a new random key after
 * every jump (Space does not jump!). A correct key makes the hero backflip and
 * launch a firework into the boss; a wrong key makes them stumble for a moment.
 * Spikes cost a heart.
 */
import { SCREEN, baseGame, tick, good, wrong, hurt, hitBoss, keyPool, pickKey, weighted, isGameKey, labelOf } from './common.js';

export const RUNNER = {
  ground: 150, playerX: 70, bossX: 262,
  gravity: 1000,        // px/s²
  jumpSpeed: 375,       // → 0.75 s in the air, 70 px high
  stumble: 0.45,        // s without jumping after a wrong key
  fireworkTime: 0.55,   // s for a firework to reach the boss
  stepLength: 18,       // px of running per footstep
  minGap: 0.85,         // s: never two spikes closer than this
  player: { halfWidth: 6, height: 24 },
};

/** Obstacles the boss throws: size in px and speed factor. */
export const SPIKES = {
  spike: { w: 13, h: 16, speed: 1 },
  tall: { w: 11, h: 25, speed: 1 },
  double: { w: 29, h: 15, speed: 1 },
  ball: { w: 16, h: 16, speed: 1.3 },
};

export const runner = {
  id: 'runner',
  name: 'Key Jump',
  rules: boss => [
    'To jump, press <strong>the key shown above your hero</strong> — it changes after every jump (Space won’t help you here).',
    'Right key: a backflip, a firework into the boss — and the whole world changes colour. Wrong key: you stumble.',
    `Spikes cost a heart. Beat the boss within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const R = RUNNER;
    const g = baseGame(boss, seed);
    const keys = keyPool(boss.keys);
    Object.assign(g, {
      mode: 'runner',
      distance: 0,
      footsteps: 0,
      player: { y: 0, vy: 0, grounded: true, flip: 0, flipping: false, stumble: 0 },
      key: null,
      spikes: [],
      fireworks: [],
      nextSpike: 1.2,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const p = this.player;
        if (code === this.key.code) {
          if (!p.grounded || p.stumble > 0) return null;       // in the air / stumbling: ignored
          p.vy = R.jumpSpeed; p.grounded = false; p.flipping = true; p.flip = 0;
          this.fireworks.push({ t: 0, from: [R.playerX, R.ground - R.player.height] });
          good(this, { key: this.key.label });
          this.key = pickKey(this.rng, keys, [this.key.code]);
          return 'good';
        }
        if (isGameKey(code)) {
          p.stumble = R.stumble;
          wrong(this, { key: labelOf(code), want: this.key.label });
          return 'wrong';
        }
        return null;
      },

      step(dt) {
        const state = tick(this, dt);
        if (state === 'over') return;
        this.stepPlayer(dt);
        if (state === 'celebrate') { this.spikes = []; return; }
        const p = this.player;
        p.stumble = Math.max(0, p.stumble - dt);

        this.nextSpike -= dt;
        if (this.nextSpike <= 0) {
          const kind = weighted(this.rng, this.boss.attacks);
          const s = SPIKES[kind];
          this.spikes.push({ x: R.bossX - 24, kind, w: s.w, h: s.h, speed: this.boss.speed * s.speed });
          this.bossAttack = 0.3;
          const [lo, hi] = this.boss.gap;
          const anger = this.bossHp <= this.boss.hp / 2 ? 0.82 : 1;      // below half health it gets angrier
          this.nextSpike = Math.max(R.minGap, (lo + (hi - lo) * this.rng()) * anger);
        }
        const body = { x0: R.playerX - R.player.halfWidth, x1: R.playerX + R.player.halfWidth, y0: p.y };
        for (const s of this.spikes) {
          s.x -= s.speed * dt;
          const overlap = s.x + s.w / 2 > body.x0 && s.x - s.w / 2 < body.x1 && body.y0 < s.h * 0.85;
          if (overlap && !s.spent && hurt(this)) s.spent = true;
          if (this.result !== 'playing') return;
        }
        this.spikes = this.spikes.filter(s => s.x + s.w > -20);
        for (const f of this.fireworks) {
          f.t += dt / R.fireworkTime;
          if (f.t >= 1 && !f.done) { f.done = true; hitBoss(this); }
        }
        this.fireworks = this.fireworks.filter(f => !f.done);
      },

      stepPlayer(dt) {
        const p = this.player;
        if (!p.grounded) {
          p.vy -= R.gravity * dt;
          p.y += p.vy * dt;
          if (p.flipping) p.flip = Math.min(1, p.flip + dt / ((2 * R.jumpSpeed) / R.gravity));
          if (p.y <= 0) {
            p.y = 0; p.vy = 0; p.grounded = true; p.flipping = false; p.flip = 0;
            this.events.push({ type: 'land' });
          }
        }
        const before = Math.floor(this.distance / R.stepLength);
        this.distance += this.boss.speed * 0.8 * dt;
        if (p.grounded && Math.floor(this.distance / R.stepLength) !== before) this.footsteps++;
      },
    });
    g.key = pickKey(g.rng, keys);
    return g;
  },

  /** A player with perfect reactions: jumps just before each spike (and, if eager, in between). */
  bot({ eager = false, lead = 0 } = {}) {
    const R = RUNNER;
    return g => {
      const p = g.player;
      if (!p.grounded || p.stumble > 0) return;
      const next = g.spikes.filter(s => s.x - s.w / 2 > R.playerX).sort((a, b) => a.x - b.x)[0];
      const t = next ? (next.x - next.w / 2 - R.playerX - R.player.halfWidth) / next.speed : Infinity;
      if (t < 0.12 + lead || (eager && t > 0.9)) g.press(g.key.code);
    };
  },
};

export { SCREEN };
