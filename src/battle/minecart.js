/**
 * Mine Cart — a travel level (canyon → alpine): rattle through the mountain on rails.
 *
 * The cart rolls on by itself, faster and faster. Jump gaps in the track with Space
 * (or ↑); duck under low beams by holding ↓. Bats flap across at head height — duck
 * them or jump over them. Hitting a beam or a bat costs a heart; falling into a gap costs
 * a heart (and a quick hop back onto the rails). Every stretch of track recolours the world.
 */
import { baseGame, tick, good, hurt, hitBoss } from './common.js';

export const MINECART = {
  cartX: 80, rail: 140,
  gravity: 900, jump: 330,
  cart: { halfWidth: 11, height: 26, duckHeight: 14 },
};

const JUMP = ['Space', 'ArrowUp', 'KeyW', 'Enter'];
const DUCK = ['ArrowDown', 'KeyS'];

export const minecart = {
  id: 'minecart',
  name: 'Mine Cart',
  controls: 'jump+duck',
  travel: true,
  rules: boss => [
    'The cart rolls on by itself. <strong>Space</strong> (or ↑) jumps gaps in the track; <strong>hold ↓</strong> to duck under low beams.',
    'Bats flap across at head height: duck them or jump clear.',
    `Beams, bats and gaps cost a heart. Get through the mountain within <strong>${boss.time} seconds</strong> — every stretch recolours the world.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const M = MINECART;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'minecart',
      y: 0, vy: 0, grounded: true,
      ducking: false,
      travelled: 0,
      speed: boss.speed,
      hazards: [],           // { kind: gap | beam | bat, x (distance), w, y? }
      nextHazard: 260,
      invulnerableUntil: 0,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (JUMP.includes(code) && this.grounded) { this.vy = M.jump; this.grounded = false; this.events.push({ type: 'jump' }); return 'jump'; }
        return null;
      },

      screenX(d) { return M.cartX + (d - this.travelled); },

      step(dt) {
        const state = tick(this, dt);
        if (state === 'over') return;
        this.speed = this.boss.speed * (1 + 0.35 * Math.min(1, this.time / this.boss.time));
        this.travelled += this.speed * dt;
        this.ducking = this.grounded && DUCK.some(k => this.held.has(k));
        if (!this.grounded) {
          this.vy -= M.gravity * dt;
          this.y += this.vy * dt;
          if (this.y <= 0) {
            // over a gap there's no track to land on
            const overGap = this.hazards.some(h => h.kind === 'gap' && Math.abs(this.screenX(h.x) - M.cartX) < h.w / 2 - 4);
            if (!overGap) { this.y = 0; this.vy = 0; this.grounded = true; }
            else if (this.y < -30 && state === 'play') {
              this.y = 0; this.vy = M.jump * 0.7; this.grounded = false;      // hop back out
              this.events.push({ type: 'fell' });
              hurt(this, { gap: true });
              if (this.result !== 'playing') return;
            }
          }
        } else if (this.hazards.some(h => h.kind === 'gap' && Math.abs(this.screenX(h.x) - M.cartX) < h.w / 2 - 4)) {
          this.grounded = false; this.vy = 0;                                  // rolled into a gap
        }
        if (state !== 'play') return;
        const stretch = Math.floor(this.travelled / this.boss.stretch);
        while (this.boss.hp - this.bossHp < stretch && this.bossHp > 0) { good(this); hitBoss(this); }
        // hazards ahead
        while (this.nextHazard < this.travelled + 400) {
          const roll = this.rng();
          const kind = roll < 0.4 ? 'gap' : roll < 0.4 + this.boss.beams ? 'beam' : 'bat';
          const w = kind === 'gap' ? this.boss.gapWidth * (0.8 + 0.4 * this.rng()) : kind === 'beam' ? 14 : 12;
          this.hazards.push({ kind, x: this.nextHazard, w, phase: this.rng() * 6 });
          // never closer than a jump's length: every hazard can be dealt with on its own
          this.nextHazard += Math.max(this.boss.spacing * (0.75 + 0.5 * this.rng()), this.speed * 1.35 * 0.85) + w;
        }
        this.hazards = this.hazards.filter(h => this.screenX(h.x) > -40);
        // collisions with beams (need to duck) and bats (duck, or be high enough)
        const top = this.y + (this.ducking ? M.cart.duckHeight : M.cart.height);
        for (const h of this.hazards) {
          if (h.kind === 'gap' || h.spent) continue;
          const dx = Math.abs(this.screenX(h.x) - M.cartX);
          if (dx > h.w / 2 + M.cart.halfWidth - 3) continue;
          const low = h.kind === 'beam' ? 18 : 19 + Math.sin(this.time * 6 + h.phase) * 3;   // bottom of the hazard above the rail
          const high = h.kind === 'beam' ? 60 : low + 10;
          if (top > low && this.y < high) {
            h.spent = true;
            if (hurt(this, { hit: h.kind })) this.events.push({ type: 'bonk', kind: h.kind });
            if (this.result !== 'playing') return;
          }
        }
      },
    });
    return g;
  },

  /** Jumps gaps and bats just in time, ducks beams. */
  bot({ lead = 0 } = {}) {
    const M = MINECART;
    return g => {
      g.held.delete('ArrowDown');
      const ahead = g.hazards.filter(h => !h.spent && g.screenX(h.x) + h.w / 2 > M.cartX - M.cart.halfWidth).sort((a, b) => a.x - b.x);
      const next = ahead[0];
      if (!next) return;
      const t = (g.screenX(next.x) - next.w / 2 - M.cartX - M.cart.halfWidth) / g.speed;
      if (next.kind === 'beam') { if (t < 0.25 + lead) g.held.add('ArrowDown'); return; }
      if (g.grounded && t < 0.1 + lead + (next.kind === 'gap' ? 0.02 : 0.05)) g.press('Space');
    };
  },
};
