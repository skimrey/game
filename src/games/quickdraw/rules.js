/**
 * Quick Draw — a duck-hunt shooting gallery (the canyon capstone).
 *
 * The boss circles high above the mesas and sends its flock across the sky. Aim the
 * crosshair — with the mouse, or the arrow keys / WASD — and shoot with a click or
 * Space. Every critter you knock down weakens the boss; a critter that makes it across
 * the screen steals a heart. The blaster needs a moment to reload between shots.
 */
import { SCREEN, baseGame, tick, good, wrong, hurt, hitBoss, axis, UP_KEYS, DOWN_KEYS } from '../kit/common.js';

export const QUICKDRAW = {
  reload: 0.32,         // s between shots
  hitRadius: 11,        // px around the crosshair that a shot covers
  aimSpeed: 230,        // px/s with the keys
  spawnX: 300, escapeX: -12,
  skyTop: 30, skyBottom: 112,
  heroX: 46,
};

const SHOOT = ['Space', 'Enter', 'KeyJ', 'KeyX'];

export const quickdraw = {
  id: 'quickdraw',
  name: 'Quick Draw',
  controls: 'aim',
  rules: boss => [
    'The boss sends its flock across the sky. <strong>Aim with the mouse</strong> (or the arrow keys / WASD) and <strong>shoot with a click</strong> (or Space).',
    'Every critter you knock down recolours the world and weakens the boss. Your blaster needs a moment to reload.',
    `A critter that gets across steals a heart. Knock down ${boss.hp} before <strong>${boss.time} seconds</strong> are up.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const Q = QUICKDRAW;
    const g = baseGame(boss, seed);
    let nextId = 1;
    Object.assign(g, {
      mode: 'quickdraw',
      critters: [],          // { id, x, y, baseY, vx, amp, freq, phase, t, falling, vy, spin }
      shots: [],             // impact puffs: { x, y, t, hit }
      reload: 0,
      aim: { x: 200, y: 70 },
      nextSpawn: 0.8,
      released: 0,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (SHOOT.includes(code)) return this.shoot();
        return null;
      },

      /** Pointer: move the crosshair there and shoot. */
      click(x, y) {
        this.aimAt(x, y);
        return this.shoot();
      },

      aimAt(x, y) {
        this.aim = { x: Math.max(4, Math.min(SCREEN.w - 4, x)), y: Math.max(20, Math.min(140, y)) };
      },

      shoot() {
        if (this.result !== 'playing' || this.victory > 0 || this.reload > 0) return null;
        this.reload = Q.reload;
        let best = null, bestD = Q.hitRadius;
        for (const c of this.critters) {
          if (c.falling) continue;
          const d = Math.hypot(c.x - this.aim.x, c.y - this.aim.y);
          if (d < bestD) { best = c; bestD = d; }
        }
        this.shots.push({ x: this.aim.x, y: this.aim.y, t: 0.3, hit: !!best });
        if (!best) { wrong(this, { key: 'miss' }); return 'miss'; }
        best.falling = true;
        best.vy = -60;
        best.spin = best.vx < 0 ? -1 : 1;
        good(this, { x: best.x, y: best.y });
        hitBoss(this);
        return 'good';
      },

      step(dt) {
        const state = tick(this, dt);
        for (const s of this.shots) s.t -= dt;
        this.shots = this.shots.filter(s => s.t > 0);
        for (const c of this.critters) if (c.falling) { c.vy += 420 * dt; c.y += c.vy * dt; c.x += c.vx * 0.3 * dt; }
        this.critters = this.critters.filter(c => !(c.falling && c.y > SCREEN.h + 20));
        if (state === 'over') return;
        if (state === 'celebrate') { for (const c of this.critters) if (!c.falling) { c.falling = true; c.vy = -30; } return; }
        this.reload = Math.max(0, this.reload - dt);
        // the crosshair follows held keys
        const ax = axis(this), ay = (DOWN_KEYS.some(k => this.held.has(k)) ? 1 : 0) - (UP_KEYS.some(k => this.held.has(k)) ? 1 : 0);
        if (ax || ay) this.aimAt(this.aim.x + ax * Q.aimSpeed * dt, this.aim.y + ay * Q.aimSpeed * dt);

        // the boss releases critters: faster as its health drops
        const alive = this.critters.filter(c => !c.falling);
        this.nextSpawn -= dt;
        const anger = 1 - 0.3 * (1 - this.bossHp / this.boss.hp);
        if (this.nextSpawn <= 0 && alive.length < this.boss.maxAlive) {
          const baseY = Q.skyTop + this.rng() * (Q.skyBottom - Q.skyTop);
          const speed = this.boss.speed * (0.85 + 0.3 * this.rng());
          this.critters.push({
            id: nextId++, x: Q.spawnX, y: baseY, baseY,
            vx: -speed, amp: 6 + this.rng() * 16, freq: 1.5 + this.rng() * 2, phase: this.rng() * Math.PI * 2,
            t: 0, falling: false, vy: 0, spin: 0,
          });
          this.released++;
          this.bossAttack = 0.35;
          this.nextSpawn = this.boss.interval * anger * (0.8 + 0.4 * this.rng());
        } else if (this.nextSpawn <= 0) this.nextSpawn = 0.2;

        for (const c of this.critters) {
          if (c.falling) continue;
          c.t += dt;
          c.x += c.vx * dt;
          c.y = c.baseY + Math.sin(c.t * c.freq + c.phase) * c.amp;
          if (c.x < Q.escapeX) {
            c.escaped = true;
            hurt(this, { escaped: true });
            if (this.result !== 'playing') return;
          }
        }
        this.critters = this.critters.filter(c => !c.escaped);
      },
    });
    return g;
  },

  /** Clicks on the leftmost critter (with the mouse), leading it a little. */
  bot({ reaction = 0.3, lead = 0 } = {}) {
    return g => {
      const target = g.critters.filter(c => !c.falling && c.t >= reaction).sort((a, b) => a.x - b.x)[0];
      if (!target || g.reload > 0) return;
      const t = 0.02 + lead;
      g.click(target.x + target.vx * t, target.baseY + Math.sin((target.t + t) * target.freq + target.phase) * target.amp);
    };
  },
};
