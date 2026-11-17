/**
 * Moon Lander — a checkpoint game: set the lander down gently on the glowing pads.
 *
 * Hold ↑ (or W / Space) to fire the main engine, ← → for the side thrusters. Gravity
 * pulls you down; fuel runs out. Touch down on the lit pad slowly (the speed gauge
 * green) — then the next pad lights up. Every landing recolours the world. Hitting the ground too hard,
 * or anywhere off a pad, is a crash: a heart, and a fresh lander up top.
 */
import { baseGame, tick, good, hurt, hitBoss } from '../kit/common.js';

export const LANDER = {
  gravity: 22, thrust: 55, side: 42,
  safeSpeed: 30,
  startY: 30, fuel: 7,                   // s of engine per lander
  left: 20, right: 300,
};

/** The ground: rolling moon rock (y down), with the pads flattened. */
export function groundAt(g, x) {
  for (const p of g.pads) if (x >= p.x - p.w / 2 && x <= p.x + p.w / 2) return p.y;
  return 150 + Math.sin(x * 0.05 + g.seedPhase) * 10 + Math.sin(x * 0.13) * 4;
}

export const lander = {
  id: 'lander',
  name: 'Moon Lander',
  checkpoint: true,
  controls: 'thrust+tilt',
  rules: boss => [
    'Hold <strong>↑</strong> (or Space) to fire the engine, <strong>← →</strong> for the side thrusters. Mind the fuel gauge.',
    'Touch down <strong>slowly</strong> on the lit pad — every landing recolours the world.',
    `A hard or off-pad landing is a crash: a heart, and a fresh lander. Land ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const L = LANDER;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'lander',
      seedPhase: g.rng() * 6,
      pads: [],
      target: 0,
      ship: null,
      landed: 0,             // s on the pad before the next lander
      crash: null,           // { x, y, t }
      landings: 0,

      press() { return null; },

      newShip() {
        const pad = this.pads[this.target];
        const x = Math.max(40, Math.min(280, pad.x + (this.rng() < 0.5 ? -1 : 1) * (60 + this.rng() * 50)));
        this.ship = { x, y: L.startY, vx: (pad.x - x) * 0.12, vy: 0, angle: 0, fuel: this.boss.fuel, burning: false };
      },

      newPads() {
        const n = 3;
        this.pads = Array.from({ length: n }, (_, i) => ({ x: 70 + i * 90 + this.rng() * 30, y: 140 + Math.floor(this.rng() * 14), w: this.boss.padWidth }));
        this.target = Math.floor(this.rng() * n);
      },

      step(dt) {
        const state = tick(this, dt);
        if (this.crash) { this.crash.t -= dt; if (this.crash.t <= 0) this.crash = null; }
        if (state !== 'play') return;
        if (this.landed > 0) { this.landed -= dt; if (this.landed <= 0) { this.target = (this.target + 1 + Math.floor(this.rng() * 2)) % this.pads.length; this.newShip(); } return; }
        const s = this.ship;
        const side = (this.held.has('ArrowRight') || this.held.has('KeyD') ? 1 : 0) - (this.held.has('ArrowLeft') || this.held.has('KeyA') ? 1 : 0);
        s.burning = (this.held.has('ArrowUp') || this.held.has('KeyW') || this.held.has('Space')) && s.fuel > 0;
        s.side = s.fuel > 0 ? side : 0;
        if (s.burning) { s.fuel = Math.max(0, s.fuel - dt); s.vy -= L.thrust * dt; }
        if (s.side) { s.fuel = Math.max(0, s.fuel - dt * 0.3); s.vx += s.side * L.side * dt; }
        s.angle += ((s.side * 0.35) - s.angle) * Math.min(1, dt * 8);          // it leans into the side thrust (just for looks)
        s.vy += this.boss.gravity * dt;
        s.vx += (this.boss.wind || 0) * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < L.left) { s.x = L.left; s.vx = Math.abs(s.vx) * 0.5; }
        if (s.x > L.right) { s.x = L.right; s.vx = -Math.abs(s.vx) * 0.5; }
        if (s.y < 8) { s.y = 8; s.vy = Math.max(0, s.vy); }
        const ground = groundAt(this, s.x);
        if (s.y + 6 >= ground) {
          const pad = this.pads[this.target];
          const onPad = Math.abs(s.x - pad.x) <= pad.w / 2 - 3;
          const speed = Math.hypot(s.vx, s.vy);
          if (onPad && speed <= L.safeSpeed) {
            s.y = ground - 6; s.vx = 0; s.vy = 0;
            this.landings++;
            good(this, { landed: true });
            hitBoss(this);
            this.landed = 0.9;
          } else {
            this.crash = { x: s.x, y: ground - 4, t: 0.6 };
            this.events.push({ type: 'crash', x: s.x, y: ground });
            hurt(this, { crash: true });
            if (this.result === 'playing') this.newShip();
          }
        }
      },
    });
    g.newPads();
    g.newShip();
    return g;
  },

  /** An autopilot: glide over the pad, kill the drift, come down gently. */
  bot({ lead = 0 } = {}) {
    return g => {
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) g.held.delete(k);
      const s0 = g.ship;
      const s = s0 && { ...s0, vy: s0.vy + g.boss.gravity * lead * 0.5, y: s0.y + s0.vy * lead };
      if (!s || g.landed > 0) return;
      const pad = g.pads[g.target];
      const height = groundAt(g, s.x) - (s.y + 6);
      const tvx = Math.max(-32, Math.min(32, (pad.x - s.x) * 0.8));
      const tvy = height > 50 ? 34 : Math.max(8, height * 0.5);
      if (s.vx < tvx - 3) g.held.add('ArrowRight'); else if (s.vx > tvx + 3) g.held.add('ArrowLeft');
      if (s.vy > tvy) g.held.add('ArrowUp');
    };
  },
};
