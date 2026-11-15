/**
 * Spellslinger — a boss game, a kid-friendly run-and-gun: the boss sits at the right
 * and sends its minions at you (bouncing blobs along the ground, fluttering flyers)
 * and lobs goo that rolls along the floor.
 *
 * Move with ← → (or A / D), jump with ↑ / W / Space, and cast fireballs with X, J or
 * Enter. Fireballs pop minions; the boss is shielded except for a moment each time it
 * attacks (mouth open) — singe it then. Every hit recolours the world. Touching a minion
 * or the goo costs a heart.
 */
import { baseGame, tick, good, hurt, hitBoss, axis } from './common.js';

export const FIREBALL = {
  ground: 150, minX: 16, maxX: 196,
  speed: 110, gravity: 900, jump: 330,
  boltSpeed: 230, cooldown: 0.3,
  bossX: 272,
  open: 1.1,             // s the boss is open to fireballs after it attacks
  hero: { halfWidth: 6, height: 22 },
};

const JUMP = ['ArrowUp', 'KeyW', 'Space'];
const CAST = ['KeyX', 'KeyJ', 'Enter', 'KeyF'];

export const fireball = {
  id: 'fireball',
  name: 'Spellslinger',
  controls: 'move+jump+shoot',
  rules: boss => [
    'Move with <strong>← →</strong>, jump with <strong>↑</strong> (or Space) and cast fireballs with <strong>X</strong> (or J / Enter).',
    'Fireballs pop the minions. The boss is shielded — <strong>except for a moment each time it attacks</strong> (mouth open): singe it then. Every hit recolours the world.',
    `Minions and rolling goo cost a heart: jump over them or blast them. Singe the boss ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const F = FIREBALL;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'fireball',
      hero: { x: 60, y: 0, vy: 0, grounded: true, facing: 1, cast: 0 },
      bolts: [],            // { x, y }
      foes: [],             // { kind: 'hopper' | 'flyer' | 'goo', x, y, vx, t, phase }
      cooldown: 0,
      nextFoe: 1.6,
      nextGoo: 3,
      open: 0,              // s the boss is open to fireballs
      bossLift: 0,          // the boss floats up and down (px above the ground)

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const h = this.hero;
        if (JUMP.includes(code) && h.grounded) { h.vy = F.jump; h.grounded = false; return 'jump'; }
        if (CAST.includes(code) && this.cooldown <= 0) {
          this.cooldown = F.cooldown;
          h.cast = 0.18;
          this.bolts.push({ x: h.x + 10, y: F.ground - h.y - 14 });
          return 'cast';
        }
        return null;
      },

      step(dt) {
        const state = tick(this, dt);
        const h = this.hero;
        h.cast = Math.max(0, h.cast - dt);
        // movement (also during the victory lap)
        const dir = state === 'play' ? axis(this) : 0;
        if (dir) h.facing = dir;
        h.x = Math.max(F.minX, Math.min(F.maxX, h.x + dir * F.speed * dt));
        if (!h.grounded) {
          h.vy -= F.gravity * dt;
          h.y += h.vy * dt;
          if (h.y <= 0) { h.y = 0; h.vy = 0; h.grounded = true; }
        }
        if (state !== 'play') { this.foes = []; return; }
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.open = Math.max(0, this.open - dt);
        this.bossAttack = Math.max(this.bossAttack, this.open > 0 ? 0.05 : 0);
        this.bossLift = 18 + Math.sin(this.time * 1.3) * 16;
        // the boss sends minions and goo
        this.nextFoe -= dt;
        if (this.nextFoe <= 0) {
          const flyer = this.rng() < this.boss.flyers;
          this.foes.push(flyer
            ? { kind: 'flyer', x: F.bossX - 20, y: 60 + this.rng() * 40, vx: -this.boss.foeSpeed * 0.9, t: 0, phase: this.rng() * 6 }
            : { kind: 'hopper', x: F.bossX - 20, y: 0, vx: -this.boss.foeSpeed, t: 0, phase: this.rng() * 6 });
          this.bossAttack = 0.3;
          this.open = F.open;
          this.nextFoe = this.boss.foeEvery * (0.75 + 0.5 * this.rng());
        }
        this.nextGoo -= dt;
        if (this.nextGoo <= 0) {
          this.foes.push({ kind: 'goo', x: F.bossX - 24, y: 0, vx: -this.boss.gooSpeed, t: 0, phase: 0 });
          this.bossAttack = 0.4;
          this.open = F.open;
          this.nextGoo = this.boss.gooEvery * (0.8 + 0.4 * this.rng());
        }
        for (const f of this.foes) {
          f.t += dt;
          f.x += f.vx * dt;
          if (f.kind === 'hopper') f.y = Math.abs(Math.sin(f.t * 5 + f.phase)) * 10;
          if (f.kind === 'flyer') f.y = 70 + Math.sin(f.t * 2.2 + f.phase) * 28 - (f.t > 1.2 ? Math.min(50, (f.t - 1.2) * 30) : 0);   // swoops lower
        }
        // fireballs
        for (const b of this.bolts) {
          b.x += F.boltSpeed * dt;
          for (const f of this.foes) {
            if (f.dead || b.spent || f.kind === 'goo') continue;
            const fy = f.kind === 'flyer' ? F.ground - f.y : F.ground - f.y - 7;
            if (Math.abs(f.x - b.x) < 9 && Math.abs(fy - b.y) < 12) { f.dead = true; b.spent = true; good(this); this.events.push({ type: 'pop', x: f.x, y: fy }); }
          }
          if (!b.spent && b.x > F.bossX - 22) {
            b.spent = true;
            const dy = Math.abs((F.ground - this.bossLift - 22) - b.y);
            if (dy > 26) continue;                                   // flew under / over it
            if (this.open > 0) { good(this); hitBoss(this); this.open = 0; }
            else this.events.push({ type: 'block', y: b.y });
          }
        }
        this.bolts = this.bolts.filter(b => !b.spent && b.x < F.bossX + 30);
        // contact
        const top = h.y + F.hero.height;
        for (const f of this.foes) {
          if (f.dead) continue;
          const fy = f.kind === 'flyer' ? f.y : f.y;
          const fh = f.kind === 'goo' ? 7 : f.kind === 'flyer' ? 10 : 14;
          const inY = f.kind === 'flyer' ? Math.abs(fy - (h.y + F.hero.height / 2)) < F.hero.height / 2 + 1 : h.y < fy + fh;
          if (Math.abs(f.x - h.x) < F.hero.halfWidth + 6 && inY && top > fy) {
            if (hurt(this)) f.dead = f.kind !== 'goo';
            if (this.result !== 'playing') return;
          }
        }
        this.foes = this.foes.filter(f => !f.dead && f.x > -20);
      },
    });
    return g;
  },

  /** Holds ground near the left, jumps goo and hoppers, casts whenever it can. */
  bot({ lead = 0 } = {}) {
    const F = FIREBALL;
    return g => {
      for (const k of ['ArrowLeft', 'ArrowRight']) g.held.delete(k);
      const h = g.hero;
      const threat = g.foes.filter(f => !f.dead && f.x > h.x - 4 && (f.kind === 'goo' || f.kind === 'hopper')).sort((a, b) => a.x - b.x)[0];
      // hold ground near the left — but don't walk into something coming at us
      const close = threat && threat.x - h.x < 60;
      if (h.x > 56) g.held.add('ArrowLeft');
      else if (h.x < 44 - lead * 60 && !close) g.held.add('ArrowRight');
      let soon = false;      // a jump is coming up: keep the fingers free for it
      if (threat && h.grounded) {
        const t = (threat.x - h.x - 12) / (-threat.vx + (g.held.has('ArrowRight') ? F.speed : 0));
        soon = t < 0.45 + lead && (threat.kind === 'goo' || g.cooldown > 0.05);
        if (t < 0.16 + lead && (threat.kind === 'goo' || g.cooldown > 0.05)) { g.press('ArrowUp'); return; }
      }
      const flyer = g.foes.find(f => !f.dead && f.kind === 'flyer' && f.x - h.x < 40 && f.x > h.x - 6 && f.y < 40);
      if (flyer && h.grounded && g.cooldown > 0) { /* duck the flyer by staying low */ }
      if (!soon && g.cooldown <= 0) g.press('KeyX');
    };
  },
};
