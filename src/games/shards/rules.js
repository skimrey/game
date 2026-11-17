/**
 * Shard Storm — the crystal caverns' capstone: a glider among drifting crystals.
 *
 * Turn with ← → (or A / D), thrust with ↑ (or W) and shoot with Space. The cave wraps
 * around (fly off one edge, come back on the other). The boss drifts through the cavern
 * flinging crystals; shoot a crystal and it splits (big → two medium → two small → dust).
 * The boss is ringed by orbiting crystals: break a gap in the ring and shoot through it
 * before the crystals grow back. Shots that reach the boss hit it — any crystal in the way
 * soaks them up. A crystal (or the boss) that hits your glider costs a heart.
 */
import { SCREEN, baseGame, tick, good, hurt, hitBoss, UP_KEYS } from '../kit/common.js';

export const SHARDS = {
  turn: 3.4,             // rad/s
  thrust: 150,           // px/s²
  drag: 0.9,             // 1/s
  maxSpeed: 120,
  shotSpeed: 230, shotLife: 0.9, maxShots: 4, cooldown: 0.18,
  radius: { big: 13, medium: 8, small: 5 },
  heroR: 5, bossR: 14,
  ringR: 27, orbiterR: 5,  // the crystals orbiting the boss (its shield)
  top: 20,               // the HUD strip
};
const SHOOT = ['Space', 'Enter', 'KeyJ', 'KeyX'];
const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'];
const wrap = (v, lo, hi) => (v < lo ? v + (hi - lo) : v >= hi ? v - (hi - lo) : v);
/** Shortest offset from a to b on the wrapping screen. */
export function offset(a, b) {
  let dx = b.x - a.x, dy = b.y - a.y;
  const w = SCREEN.w, h = SCREEN.h - SHARDS.top;
  if (dx > w / 2) dx -= w; if (dx < -w / 2) dx += w;
  if (dy > h / 2) dy -= h; if (dy < -h / 2) dy += h;
  return { dx, dy };
}

export const shards = {
  id: 'shards',
  name: 'Shard Storm',
  controls: 'turn+thrust+shoot',
  rules: boss => [
    'Turn with <strong>← →</strong>, thrust with <strong>↑</strong> and shoot with <strong>Space</strong>. The cavern wraps around.',
    'Shoot a crystal and it splits in two (small ones turn to dust). The boss hides in a <strong>ring of orbiting crystals</strong>: shoot a gap in it, then shoot through before it grows back (every hit makes the ring snap back together).',
    `A crystal (or the boss) that hits your glider costs a heart. Hit the boss ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const S = SHARDS;
    const g = baseGame(boss, seed);
    let nextId = 1;
    Object.assign(g, {
      mode: 'shards',
      hero: { x: 80, y: 110, vx: 0, vy: 0, angle: -Math.PI / 2, thrusting: false },
      foe: { x: 230, y: 70, vx: boss.foeSpeed, vy: boss.foeSpeed * 0.45 },
      ring: Array.from({ length: boss.orbiters }, (_, i) => ({ a: (i / boss.orbiters) * Math.PI * 2, alive: true, back: 0 })),
      spin: 0,
      rocks: [],              // { id, x, y, vx, vy, size, spin }
      shots: [],              // { x, y, vx, vy, t }
      dust: [],               // drawing: { x, y, t }
      cooldown: 0,
      nextRock: boss.every * 0.6,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (SHOOT.includes(code)) return this.shoot();
        return null;
      },
      shoot() {
        if (this.cooldown > 0 || this.shots.length >= S.maxShots) return null;
        const h = this.hero, c = Math.cos(h.angle), s = Math.sin(h.angle);
        this.shots.push({ x: h.x + c * 7, y: h.y + s * 7, vx: c * S.shotSpeed + h.vx * 0.5, vy: s * S.shotSpeed + h.vy * 0.5, t: S.shotLife });
        this.cooldown = S.cooldown;
        return 'shoot';
      },
      /** A crystal flung from (x, y). */
      fling(x, y, size = 'big', dir = this.rng() * Math.PI * 2, speed = this.boss.rockSpeed * (0.8 + 0.4 * this.rng())) {
        this.rocks.push({ id: nextId++, x, y, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, size, spin: this.rng() * 6 });
      },
      orbiterAt(o) { return { x: wrap(this.foe.x + Math.cos(o.a + this.spin) * S.ringR, 0, SCREEN.w), y: wrap(this.foe.y + Math.sin(o.a + this.spin) * S.ringR, S.top, SCREEN.h) }; },
      move(o, dt) { o.x = wrap(o.x + o.vx * dt, 0, SCREEN.w); o.y = wrap(o.y + o.vy * dt, S.top, SCREEN.h); },
      dist(a, b) { const { dx, dy } = offset(a, b); return Math.hypot(dx, dy); },
      split(r) {
        r.dead = true;
        this.dust.push({ x: r.x, y: r.y, t: 0.4 });
        this.events.push({ type: 'shatter', x: r.x, y: r.y, size: r.size });
        const next = r.size === 'big' ? 'medium' : r.size === 'medium' ? 'small' : null;
        if (!next) return;
        const a = Math.atan2(r.vy, r.vx);
        for (const da of [-0.7, 0.7]) this.fling(r.x, r.y, next, a + da, Math.hypot(r.vx, r.vy) * 1.1);
      },

      step(dt) {
        const state = tick(this, dt);
        for (const d of this.dust) d.t -= dt;
        this.dust = this.dust.filter(d => d.t > 0);
        if (state !== 'play') { this.shots = []; return; }
        const h = this.hero;
        this.cooldown = Math.max(0, this.cooldown - dt);
        // the glider
        const turn = (RIGHT.some(k => this.held.has(k)) ? 1 : 0) - (LEFT.some(k => this.held.has(k)) ? 1 : 0);
        h.angle += turn * S.turn * dt;
        h.thrusting = UP_KEYS.some(k => this.held.has(k));
        if (h.thrusting) { h.vx += Math.cos(h.angle) * S.thrust * dt; h.vy += Math.sin(h.angle) * S.thrust * dt; }
        h.vx *= Math.exp(-S.drag * dt); h.vy *= Math.exp(-S.drag * dt);
        const sp = Math.hypot(h.vx, h.vy);
        if (sp > S.maxSpeed) { h.vx *= S.maxSpeed / sp; h.vy *= S.maxSpeed / sp; }
        this.move(h, dt);
        // the boss drifts and flings crystals (more while it still has plenty of health)
        const f = this.foe;
        this.move(f, dt);
        this.nextRock -= dt;
        const big = this.rocks.filter(r => r.size === 'big').length;
        if (this.nextRock <= 0) {
          if (this.rocks.length < this.boss.maxRocks && big < 3) {
            // never straight at the glider: away from it by at least 60°
            const toHero = Math.atan2(offset(f, h).dy, offset(f, h).dx);
            const dir = toHero + (this.rng() < 0.5 ? -1 : 1) * (Math.PI / 3 + this.rng() * Math.PI * 2 / 3);
            this.fling(f.x, f.y, 'big', dir);
            this.bossAttack = 0.4;
          }
          this.nextRock = this.boss.every * (0.8 + 0.4 * this.rng());
        }
        for (const r of this.rocks) { this.move(r, dt); r.spin += dt; }
        // the ring spins; broken crystals grow back
        this.spin += this.boss.orbit * dt;
        for (const o of this.ring) if (!o.alive && (o.back -= dt) <= 0) o.alive = true;
        // shots: crystals soak them up, the boss takes the rest
        for (const s of this.shots) {
          this.move(s, dt);
          s.t -= dt;
          for (const r of this.rocks) {
            if (r.dead || s.spent) continue;
            if (this.dist(s, r) < S.radius[r.size] + 2) { s.spent = true; this.split(r); good(this, { shard: true }); }
          }
          for (const o of this.ring) {
            if (!o.alive || s.spent) continue;
            if (this.dist(s, this.orbiterAt(o)) < S.orbiterR + 2) { s.spent = true; o.alive = false; o.back = this.boss.regrow; good(this, { orbiter: true }); this.events.push({ type: 'shatter', ...this.orbiterAt(o), size: 'small' }); }
          }
          if (!s.spent && this.dist(s, f) < S.bossR) {
            s.spent = true;
            if (this.bossHurt > 0) continue;                     // still reeling: the shot glances off
            good(this, { x: f.x, y: f.y });
            hitBoss(this);
            this.bossHurt = 1;
            for (const o of this.ring) o.alive = true;           // …and the ring snaps back together
            this.events.push({ type: 'ring' });
          }
        }
        this.shots = this.shots.filter(s => !s.spent && s.t > 0);
        this.rocks = this.rocks.filter(r => !r.dead);
        if (this.bossHp <= 0) return;
        // collisions with the glider
        for (const r of this.rocks) {
          if (this.dist(h, r) < S.radius[r.size] + S.heroR && this.invulnerable <= 0) {
            this.split(r);
            hurt(this, { rock: r.size });
            if (this.result !== 'playing') return;
          }
        }
        this.rocks = this.rocks.filter(r => !r.dead);
        if (this.dist(h, f) < S.bossR + S.heroR && hurt(this, { boss: true })) {
          const { dx, dy } = offset(f, h), d = Math.hypot(dx, dy) || 1;
          h.vx = dx / d * 90; h.vy = dy / d * 90;
          if (this.result !== 'playing') return;
        }
      },
    });
    for (let i = 0; i < boss.startRocks; i++) g.fling(230 + (g.rng() - 0.5) * 40, 70 + (g.rng() - 0.5) * 30, 'big', Math.PI * (0.2 + 0.6 * g.rng()) * (g.rng() < 0.5 ? 1 : -1));
    return g;
  },

  /**
   * Deals with the crystal that comes closest soonest (turns to it, shoots; veers away when
   * there's no time), else turns toward where the boss will be and shoots; keeps its
   * distance from the boss with short bursts of thrust.
   */
  bot({ lead = 0 } = {}) {
    const S = SHARDS;
    return g => {
      const h = g.hero;
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) g.held.delete(k);
      // the most pressing crystal: smallest distance of closest approach within 1.2 s
      let threat = null;
      for (const r of g.rocks) {
        const { dx, dy } = offset(h, r);
        const rvx = r.vx - h.vx, rvy = r.vy - h.vy;
        const vv = rvx * rvx + rvy * rvy || 1;
        const t = Math.max(0, Math.min(2, -(dx * rvx + dy * rvy) / vv));
        const miss = Math.hypot(dx + rvx * t, dy + rvy * t) - S.radius[r.size] - S.heroR;
        const danger = t - miss / 40;
        if (miss < 16 && (!threat || danger < threat.danger)) threat = { r, t, miss, danger, dx, dy };
      }
      // where to point: where the threat will be when a shot gets there, else ahead of the boss
      let tx, ty;
      if (threat) {
        const r = threat.r, k = Math.hypot(threat.dx, threat.dy) / S.shotSpeed + lead;
        tx = threat.dx + (r.vx - h.vx * 0.5) * k; ty = threat.dy + (r.vy - h.vy * 0.5) * k;
      }
      else {
        const { dx, dy } = offset(h, g.foe);
        const t = Math.hypot(dx, dy) / S.shotSpeed + lead;
        tx = dx + (g.foe.vx - h.vx * 0.5) * t; ty = dy + (g.foe.vy - h.vy * 0.5) * t;
      }
      const want = Math.atan2(ty, tx);
      let err = want - h.angle;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      const slack = 0.06 + S.turn * lead * 0.5;
      if (err > slack) g.held.add('ArrowRight');
      else if (err < -slack) g.held.add('ArrowLeft');
      if (Math.abs(err) < (threat ? 0.22 : 0.2)) g.press('Space');
      // thrust: away from a crystal about to hit when it can't be shot in time; keep ~90 px from the boss
      const { dx: bx, dy: by } = offset(h, g.foe), bd = Math.hypot(bx, by);
      const facingAway = Math.cos(Math.atan2(-by, -bx) - h.angle) > 0.6;
      if (threat && threat.t < 0.45 + lead && threat.miss < 4 && Math.abs(err) > 0.6) {
        const away = Math.atan2(-threat.dy, -threat.dx);
        if (Math.cos(away - h.angle) > 0.3) g.held.add('ArrowUp');
      } else if (bd < 70 && facingAway) g.held.add('ArrowUp');
      else if (bd > 150 && Math.abs(err) < 0.3 && Math.hypot(h.vx, h.vy) < 40) g.held.add('ArrowUp');
    };
  },
};
