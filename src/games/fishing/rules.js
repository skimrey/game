/**
 * Gone Fishing — a checkpoint game (or a boss game: the boss is the big one).
 *
 * Press Space to cast. When the bobber dips and the "!" shows, press Space right away to
 * hook the fish (too early or too late and it's gone). Then reel it in: hold Space to
 * reel (the line's tension rises), let go to ease off. Keep the fish inside the green
 * zone of the tension bar — the fish pulls it around — until the catch bar fills.
 * Snap the line (too much tension too long) and you lose a heart.
 */
import { baseGame, tick, good, wrong, hurt, hitBoss } from '../kit/common.js';

export const FISHING = {
  hookWindow: 0.65,     // s after the bite to hook it
  snapTime: 0.9,        // s of red tension before the line snaps
  waterY: 96, bobberX: 210,
};

export const fishing = {
  id: 'fishing',
  name: 'Gone Fishing',
  controls: 'timing+hold',
  roles: ['checkpoint', 'boss'],
  rules: boss => [
    '<strong>Space</strong> casts. When the bobber dips and the <strong>!</strong> shows, press <strong>Space</strong> at once to hook it.',
    'Reel in: <strong>hold Space</strong> to pull (tension rises), let go to ease off. Keep the fish in the green zone until the catch bar fills — every catch recolours the world.',
    boss.kind === 'checkpoint' ? `A snapped line costs a heart. Catch ${boss.hp} fish within <strong>${boss.time} seconds</strong>.` : `The boss is the big one: land it ${boss.hp} times (it keeps slipping off) within <strong>${boss.time} seconds</strong>. A snapped line costs a heart.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const F = FISHING;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'fishing',
      phase: 'idle',         // idle → waiting (for a bite) → bite (hook it!) → reeling → idle
      phaseTime: 0,
      wait: 0,
      tension: 0.3,          // 0..1, the player's reel
      fish: 0.5,             // 0..1, where the fish pulls
      fishVel: 0,
      zone: 0.2,             // half-width of the green zone around the fish
      catch: 0,              // 0..1 progress
      red: 0,                // s spent over the top
      caught: 0,
      lastResult: null,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (code !== 'Space' && code !== 'Enter' && code !== 'KeyJ') return null;
        if (this.phase === 'idle') { this.setPhase('waiting'); this.wait = this.boss.biteWait[0] + this.rng() * (this.boss.biteWait[1] - this.boss.biteWait[0]); return 'cast'; }
        if (this.phase === 'waiting') { this.lastResult = 'early'; wrong(this, { early: true }); this.setPhase('idle'); return 'wrong'; }
        if (this.phase === 'bite') {
          this.setPhase('reeling');
          this.tension = 0.35; this.fish = 0.35 + this.rng() * 0.3; this.fishVel = 0; this.catch = 0.15; this.red = 0;
          good(this, { hooked: true });
          return 'good';
        }
        return null;
      },

      setPhase(p) { this.phase = p; this.phaseTime = 0; },

      step(dt) {
        const state = tick(this, dt);
        if (state !== 'play') return;
        this.phaseTime += dt;
        if (this.phase === 'waiting' && this.phaseTime >= this.wait) { this.setPhase('bite'); this.events.push({ type: 'bite' }); }
        else if (this.phase === 'bite' && this.phaseTime > F.hookWindow) { this.lastResult = 'late'; wrong(this, { late: true }); this.setPhase('idle'); }
        else if (this.phase === 'reeling') {
          const reeling = this.held.has('Space') || this.held.has('Enter') || this.held.has('KeyJ');
          this.tension = Math.max(0, Math.min(1, this.tension + (reeling ? 0.95 : -0.8) * dt));
          // the fish darts about: a random pull, stronger for big fish
          if (this.rng() < dt * this.boss.darts) this.fishVel = (this.rng() * 2 - 1) * this.boss.pull;
          this.fishVel *= Math.pow(0.3, dt);
          this.fish = Math.max(0.05, Math.min(0.95, this.fish + this.fishVel * dt));
          const inZone = Math.abs(this.tension - this.fish) <= this.boss.zone;
          this.catch = Math.max(0, Math.min(1, this.catch + (inZone ? this.boss.reelRate : -this.boss.slipRate) * dt));
          this.red = this.tension > 0.97 ? this.red + dt : 0;
          if (this.red >= F.snapTime) { this.lastResult = 'snap'; this.setPhase('idle'); hurt(this, { snap: true }); return; }
          if (this.catch <= 0) { this.lastResult = 'escaped'; wrong(this, { escaped: true }); this.setPhase('idle'); return; }
          if (this.catch >= 1) {
            this.caught++;
            this.lastResult = 'caught';
            good(this, { caught: true });
            hitBoss(this);
            this.setPhase('idle');
          }
        }
        // a player who never casts loses a heart now and then (the fish steal the bait)
        if (this.phase === 'idle' && this.phaseTime > 6) { hurt(this, { bored: true }); this.phaseTime = 0; }
      },
    });
    return g;
  },

  /** Casts, hooks after a human-ish reaction, and reels by tracking the fish. */
  bot({ reaction = 0.25 } = {}) {
    return g => {
      if (g.phase === 'idle' && g.phaseTime > 0.3) g.press('Space');
      else if (g.phase === 'bite' && g.phaseTime >= reaction) g.press('Space');
      else if (g.phase === 'reeling') {
        if (g.tension < Math.min(0.92, g.fish + g.fishVel * 0.15)) g.held.add('Space'); else g.held.delete('Space');   // never into the red
      } else g.held.delete('Space');
    };
  },
};
