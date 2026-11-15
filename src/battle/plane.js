/**
 * Biplane — a travel level: fly to the next region (it can stand in for any crossing).
 *
 * Hold ↑ to climb and ↓ to dive (the plane keeps its climb or dive — ease back to level
 * off). Fly through the rings (they recolour the world and top up your fuel) and around
 * the birds and storm clouds. Out of fuel, the engine sputters and you sink — grab the
 * next ring! Birds, clouds and the ground cost a heart.
 */
import { baseGame, tick, good, hurt, hitBoss } from './common.js';

export const PLANE = {
  planeX: 80, climb: 240, maxVy: 110, damping: 1.8,
  fuelPerRing: 4, startFuel: 8, sink: 45,
  ceiling: 24, ground: 156,
};

export const plane = {
  id: 'plane',
  name: 'Biplane',
  controls: 'pitch',
  travel: true,
  rules: boss => [
    'Hold <strong>↑</strong> to climb, <strong>↓</strong> to dive — ease off to level out.',
    'Fly through the <strong>rings</strong>: they recolour the world and top up your fuel (out of fuel, you sink).',
    `Birds, storm clouds and the ground cost a heart. Reach the next region within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const P = PLANE;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'plane',
      y: 90, vy: 0,
      fuel: P.startFuel,
      travelled: 0,
      things: [],            // { kind: ring | bird | cloud, d, y, r }
      next: 220,
      rings: 0,

      press() { return null; },
      screenX(d) { return P.planeX + (d - this.travelled); },

      step(dt) {
        const state = tick(this, dt);
        if (state === 'over') return;
        this.travelled += this.boss.speed * dt;
        const up = this.held.has('ArrowUp') || this.held.has('KeyW') || this.held.has('Space');
        const down = this.held.has('ArrowDown') || this.held.has('KeyS');
        this.fuel = Math.max(0, this.fuel - dt);
        const engine = this.fuel > 0 && state === 'play';
        if (engine) this.vy += ((down ? 1 : 0) - (up ? 1 : 0)) * P.climb * dt;
        this.vy -= this.vy * P.damping * dt;
        if (!engine) this.vy = Math.max(this.vy, P.sink);
        this.vy = Math.max(-P.maxVy, Math.min(P.maxVy, this.vy));
        this.y += this.vy * dt;
        if (this.y < P.ceiling) { this.y = P.ceiling; this.vy = Math.max(0, this.vy); }
        if (state !== 'play') return;
        const stretch = Math.floor(this.travelled / this.boss.stretch);
        while (this.boss.hp - this.bossHp < stretch && this.bossHp > 0) { good(this); hitBoss(this); }
        while (this.next < this.travelled + 400) {
          const roll = this.rng();
          const y = 40 + this.rng() * 100;
          // running low with no ring in sight: the sky sends one
          const mercy = this.fuel < 4 && !this.things.some(t => t.kind === 'ring' && !t.done && t.d > this.travelled);
          if (mercy) this.things.push({ kind: 'ring', d: this.next, y: Math.min(140, this.y + 15 + this.rng() * 20), r: this.boss.ringSize });   // low enough to glide into
          else if (roll < 0.4) this.things.push({ kind: 'ring', d: this.next, y, r: this.boss.ringSize });
          else if (roll < 0.4 + this.boss.birds) this.things.push({ kind: 'bird', d: this.next, y, r: 7, phase: this.rng() * 6 });
          else this.things.push({ kind: 'cloud', d: this.next, y, r: 14 });
          this.next += this.boss.spacing * (0.7 + 0.6 * this.rng());
        }
        this.things = this.things.filter(t => this.screenX(t.d) > -40);
        for (const t of this.things) {
          if (t.done) continue;
          const dx = this.screenX(t.d) - P.planeX;
          const ty = t.kind === 'bird' ? t.y + Math.sin(this.time * 3 + t.phase) * 10 : t.y;
          if (t.kind === 'ring') {
            if (Math.abs(dx) < 3 && Math.abs(ty - this.y) < t.r - 3) { t.done = true; this.rings++; this.fuel = Math.min(P.startFuel + 4, this.fuel + P.fuelPerRing); good(this, { ring: true }); }
            continue;
          }
          if (Math.abs(dx) < t.r + 6 && Math.abs(ty - this.y) < t.r + 2) {
            t.done = true;
            hurt(this, { hit: t.kind });
            if (this.result !== 'playing') return;
          }
        }
        if (this.y > P.ground) {
          this.y = P.ground - 30; this.vy = -60; this.fuel = Math.max(this.fuel, 3);
          this.events.push({ type: 'bump' });
          hurt(this, { ground: true });
        }
      },
    });
    return g;
  },

  /**
   * Tries flying to each height for the next 1.2 s (simulating the plane and the birds),
   * and steers to the best: no collisions, through the next ring if it can.
   */
  bot({ lead = 0 } = {}) {
    const P = PLANE;
    let plan = null, replan = 0;
    const inFlight = [];          // what we asked for in the last `lead` seconds (still on its way)
    return (g, dt = 1 / 120) => {
      while (inFlight.length > Math.round(lead / dt)) inFlight.shift();
      for (const k of ['ArrowUp', 'ArrowDown']) g.held.delete(k);
      replan -= dt;
      if (replan <= 0 || plan === null) {
        replan = 0.1;
        const ahead = g.things.filter(t => !t.done && g.screenX(t.d) > P.planeX - 30 && g.screenX(t.d) < P.planeX + 200);
        const ring = ahead.find(t => t.kind === 'ring' && g.screenX(t.d) > P.planeX + 4);
        let best = null;
        for (let target = P.ceiling + 8; target <= P.ground - 14; target += 5) {
          let y = g.y, vy = g.vy, hit = 0, ringHit = false;
          const step = 1 / 30;
          for (let t = 0; t < 1.4; t += step) {
            const up = y + vy * 0.3 > target + 3, down = y + vy * 0.3 < target - 3;
            vy += ((down ? 1 : 0) - (up ? 1 : 0)) * P.climb * step;
            vy -= vy * P.damping * step;
            vy = Math.max(-P.maxVy, Math.min(P.maxVy, vy));
            y += vy * step;
            for (const o of ahead) {
              const dx = g.screenX(o.d) - g.boss.speed * t - P.planeX;
              const oy = o.kind === 'bird' ? o.y + Math.sin((g.time + t) * 3 + o.phase) * 10 : o.y;
              if (o.kind === 'ring') { if (Math.abs(dx) < 4 && Math.abs(oy - y) < o.r - 4) ringHit = true; continue; }
              if (Math.abs(dx) < o.r + 11 && Math.abs(oy - y) < o.r + 7) hit += 1 / (1 + t);
            }
          }
          const score = -hit * 100 + (ringHit ? 30 + (g.fuel < 4 ? 90 : 0) : 0) - Math.abs(target - g.y) * 0.05 - (ring ? Math.abs(target - ring.y) * 0.1 : 0);
          if (!best || score > best.score) best = { target, score };
        }
        plan = best.target;
      }
      // where the plane will be once what we've asked for has happened, and a moment on
      let y = g.y, vy = g.vy;
      for (const dir of inFlight) {
        if (g.fuel > 0) vy += dir * P.climb * dt;
        vy -= vy * P.damping * dt;
        vy = Math.max(-P.maxVy, Math.min(P.maxVy, vy));
        y += vy * dt;
      }
      const predicted = y + vy * 0.3;
      let dir = 0;
      if (predicted > plan + 3) { g.held.add('ArrowUp'); dir = -1; } else if (predicted < plan - 3) { g.held.add('ArrowDown'); dir = 1; }
      inFlight.push(dir);
    };
  },
};
