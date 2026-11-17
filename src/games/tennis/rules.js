/**
 * Tennis Match — a boss game: you against the boss on a court seen from above.
 *
 * Move along your baseline with ← → (or A / D); the ball comes back off your racket
 * automatically if you're in reach — where it hits the racket sets the angle (like
 * Pong). Press Space just as the ball reaches you for a smash: faster, and much harder
 * to return. Every return recolours the world. A ball the boss can't reach is a
 * point for you (a hit on the boss); a ball you miss costs a heart.
 */
import { baseGame, tick, good, hurt, hitBoss, axis } from '../kit/common.js';

export const TENNIS = {
  left: 64, right: 256,   // sidelines (the ball bounces off them)
  heroY: 154, bossY: 34,  // the rackets' lines
  heroSpeed: 150,
  reach: 19,              // px either side of a player's centre the racket covers
  smashWindow: 0.22,      // s before contact that Space counts as a smash
  smash: 1.55,            // speed factor of a smash
  serveDelay: 1.1,
  outY: [8, 176],         // past these the point is over
};

export const tennis = {
  id: 'tennis',
  name: 'Tennis Match',
  controls: 'move',
  rules: boss => [
    'Move along your baseline with <strong>← →</strong> (or A / D). The ball comes back off your racket by itself — where it hits the racket sets the angle.',
    'Press <strong>Space</strong> just as the ball reaches you for a <strong>smash</strong>: much harder to return. Every return recolours the world.',
    `A ball the boss can't reach is a point — win ${boss.hp} points. A ball you miss costs a heart. You have <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const T = TENNIS;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'tennis',
      hero: { x: 160, swing: 0 },
      foe: { x: 160, swing: 0 },
      ball: null,            // { x, y, vx, vy, speed, smash, h (height for the bounce arc) }
      serve: 1.4,            // s until the boss serves
      smashAt: -1,           // time Space was pressed
      rally: 0,
      lastPoint: null,       // 'hero' | 'boss' (for the scoreboard flash)

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (code === 'Space' || code === 'Enter' || code === 'KeyJ') { this.smashAt = this.time; this.hero.swing = 0.25; return 'swing'; }
        return null;
      },

      serveBall() {
        const dir = this.rng() < 0.5 ? -1 : 1;
        const speed = this.boss.ballSpeed;
        this.ball = { x: this.foe.x, y: T.bossY + 6, vx: dir * speed * (0.15 + this.rng() * 0.25), vy: speed, speed, smash: false, t: 0 };
        this.foe.swing = 0.25;
        this.bossAttack = 0.3;
        this.rally = 0;
      },

      /** Send the ball back from a racket at `px`; `up` = toward the boss. */
      hit(px, up, power = 1) {
        const b = this.ball;
        const off = Math.max(-1, Math.min(1, (b.x - px) / T.reach));
        const speed = Math.min(b.speed * 1.04, this.boss.ballSpeed * 1.5) * power;
        b.speed = Math.min(b.speed * 1.04, this.boss.ballSpeed * 1.5);
        const angle = off * 0.75;                                    // radians off straight
        b.vx = Math.sin(angle) * speed;
        b.vy = (up ? -1 : 1) * Math.cos(angle) * speed;
        b.smash = power > 1;
        b.t = 0;
        this.rally++;
      },

      step(dt) {
        const state = tick(this, dt);
        this.hero.swing = Math.max(0, this.hero.swing - dt);
        this.foe.swing = Math.max(0, this.foe.swing - dt);
        if (state !== 'play') return;
        // the hero moves
        this.hero.x = Math.max(T.left + 6, Math.min(T.right - 6, this.hero.x + axis(this) * T.heroSpeed * dt));
        if (!this.ball) {
          this.serve -= dt;
          this.foe.x += (160 - this.foe.x) * Math.min(1, dt * 3);
          if (this.serve <= 0) this.serveBall();
          return;
        }
        const b = this.ball;
        b.t += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < T.left) { b.x = 2 * T.left - b.x; b.vx = Math.abs(b.vx); }
        if (b.x > T.right) { b.x = 2 * T.right - b.x; b.vx = -Math.abs(b.vx); }
        // the boss chases the ball once it crosses the net (and drifts to the middle otherwise)
        const net = (T.heroY + T.bossY) / 2;
        const target = b.vy < 0 ? (b.y < net + this.boss.readAhead ? predictX(b, T.bossY) : this.foe.x) : 160;
        const maxMove = this.boss.foeSpeed * (b.smash && b.vy < 0 ? 0.55 : 1) * dt;
        this.foe.x += Math.max(-maxMove, Math.min(maxMove, target + this.foe.aimOffset - this.foe.x));
        // rackets
        if (b.vy > 0 && b.y >= T.heroY && b.y - b.vy * dt < T.heroY) {
          if (Math.abs(b.x - this.hero.x) <= T.reach) {
            const smash = this.time - this.smashAt <= T.smashWindow;
            this.hero.swing = 0.25;
            this.hit(this.hero.x, true, smash ? T.smash : 1);
            good(this, { smash });
            this.foe.aimOffset = (this.rng() * 2 - 1) * this.boss.foeSloppiness;
          }
        } else if (b.vy < 0 && b.y <= T.bossY && b.y - b.vy * dt > T.bossY) {
          if (Math.abs(b.x - this.foe.x) <= T.reach) {
            this.foe.swing = 0.25;
            this.bossAttack = 0.25;
            // the boss aims away from you, more cleverly the stronger it is
            const away = this.hero.x < 160 ? 1 : -1;
            const offset = (this.rng() < this.boss.cunning ? away * 0.6 : (this.rng() * 2 - 1) * 0.5) * T.reach;
            this.hit(b.x - offset, false, 1);
          }
        }
        if (b.y > T.outY[1]) { this.ball = null; this.serve = T.serveDelay; this.lastPoint = 'boss'; hurt(this); }
        else if (b.y < T.outY[0]) { this.ball = null; this.serve = T.serveDelay; this.lastPoint = 'hero'; hitBoss(this); }
      },
    });
    g.foe.aimOffset = 0;
    return g;
  },

  /** Runs to where the ball will cross the baseline and smashes. */
  bot({ smash = true, lead = 0 } = {}) {
    const T = TENNIS;
    return g => {
      const b = g.ball;
      for (const k of ['ArrowLeft', 'ArrowRight']) g.held.delete(k);
      const target = b && b.vy > 0 ? predictX(b, T.heroY) : 160;
      // hit with the racket's edge to angle the ball away from the boss
      const aim = b && b.vy > 0 ? target + (g.foe.x > 160 ? 7 : -7) : target;
      // a slower player settles for "close enough" (a wider dead zone) rather than wobbling
      if (Math.abs(aim - g.hero.x) > 3 + lead * T.heroSpeed * 0.45) g.held.add(aim < g.hero.x ? 'ArrowLeft' : 'ArrowRight');
      if (smash && b && b.vy > 0 && (T.heroY - b.y) / b.vy < 0.12 + lead && g.time - g.smashAt > 0.3) g.press('Space');
    };
  },
};

/** Where the ball will cross line y (bouncing off the sidelines). */
export function predictX(b, y) {
  const T = TENNIS;
  const t = (y - b.y) / b.vy;
  if (t < 0) return b.x;
  let x = b.x + b.vx * t;
  const w = T.right - T.left;
  x -= T.left;
  x = ((x % (2 * w)) + 2 * w) % (2 * w);
  if (x > w) x = 2 * w - x;
  return x + T.left;
}
