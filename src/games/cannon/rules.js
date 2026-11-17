/**
 * Cannon Duel — a boss game of artillery: your cannon on the left hill, the boss on
 * the right.
 *
 * Aim with ↑ ↓ (angle), hold Space to charge the shot and let go to fire — the longer
 * you hold, the further it flies (the power bar swings back down if you hold too long).
 * Watch the wind flag. The boss lobs shells back: step aside with ← → before they land.
 * Every hit recolours the world.
 */
import { baseGame, tick, good, hurt, hitBoss, axis } from '../kit/common.js';

export const CANNON = {
  ground: 150, heroMin: 24, heroMax: 78, heroStart: 50,
  bossX: 266, bossY: 118,                 // the boss's hill top
  gravity: 160,
  minAngle: 0.25, maxAngle: 1.35, aimSpeed: 0.9,
  charge: 1.4,                            // s from empty to full power (then back down)
  minPower: 90, maxPower: 250,
  hitRadius: 20, blast: 14,
};

/** The hills: left plateau, a valley, the boss's hill (height at x, y down). */
export function hillY(x) {
  const C = CANNON;
  if (x < 95) return C.ground;
  if (x > 230) return C.bossY + 10 + Math.max(0, (240 - x)) * 0;
  const t = (x - 95) / 135;
  return C.ground + Math.sin(t * Math.PI) * 22 - t * (C.ground - C.bossY - 10);
}

export const cannon = {
  id: 'cannon',
  name: 'Cannon Duel',
  controls: 'aim+charge+dodge',
  rules: boss => [
    'Aim with <strong>↑ ↓</strong>. <strong>Hold Space</strong> to charge, let go to fire — longer is further (the bar swings back if you overdo it).',
    `${boss.wind ? 'Watch the wind flag — it pushes your shells. ' : ''}The boss lobs shells back: <strong>step aside with ← →</strong>.`,
    `Every hit recolours the world. Hit the boss ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const C = CANNON;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'cannon',
      hero: { x: C.heroStart, angle: 0.75 },
      charging: null,        // s held so far, or null
      shells: [],            // { x, y, vx, vy, mine }
      blasts: [],            // { x, y, t }
      wind: 0,
      nextShot: 2.6,
      lastShot: null,        // { x, y } where your last shell landed (aiming aid)

      power() {
        if (this.charging === null) return 0;
        const u = (this.charging / C.charge) % 2;
        return u < 1 ? u : 2 - u;
      },

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if ((code === 'Space' || code === 'Enter' || code === 'KeyJ') && this.charging === null && !this.shells.some(s => s.mine)) { this.charging = 0; return 'charge'; }
        return null;
      },

      release(code) {
        this.held.delete(code);
        if ((code === 'Space' || code === 'Enter' || code === 'KeyJ') && this.charging !== null) this.fire();
      },

      fire() {
        const speed = C.minPower + (C.maxPower - C.minPower) * this.power();
        const a = this.hero.angle;
        this.shells.push({ x: this.hero.x + 10, y: C.ground - 12, vx: Math.cos(a) * speed, vy: -Math.sin(a) * speed, mine: true });
        this.charging = null;
        this.events.push({ type: 'fire' });
      },

      step(dt) {
        const state = tick(this, dt);
        for (const b of this.blasts) b.t -= dt;
        this.blasts = this.blasts.filter(b => b.t > 0);
        if (state !== 'play') { this.shells = []; return; }
        const h = this.hero;
        h.x = Math.max(C.heroMin, Math.min(C.heroMax, h.x + axis(this) * 80 * dt));
        const aim = (this.held.has('ArrowUp') || this.held.has('KeyW') ? 1 : 0) - (this.held.has('ArrowDown') || this.held.has('KeyS') ? 1 : 0);
        h.angle = Math.max(C.minAngle, Math.min(C.maxAngle, h.angle + aim * C.aimSpeed * dt));
        if (this.charging !== null) this.charging += dt;
        // the wind shifts now and then
        if (this.boss.wind) this.wind = Math.sin(this.time * 0.23 + this.boss.wind * 3) * this.boss.wind;
        // the boss fires back
        this.nextShot -= dt;
        if (this.nextShot <= 0) {
          // aim at where you are, give or take (it's a boss, not a computer)
          const targetX = h.x + (this.rng() * 2 - 1) * this.boss.spread;
          const t = this.boss.flight;
          const x0 = C.bossX - 12, y0 = C.bossY - 14;
          this.shells.push({ x: x0, y: y0, vx: (targetX - x0) / t, vy: (C.ground - y0 - 0.5 * C.gravity * t * t) / t, mine: false, target: targetX });
          this.bossAttack = 0.4;
          this.nextShot = this.boss.fireEvery * (0.8 + 0.4 * this.rng());
        }
        for (const s of this.shells) {
          s.vy += C.gravity * dt;
          if (s.mine) s.vx += this.wind * dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          if (s.mine && Math.hypot(s.x - C.bossX, s.y - (C.bossY - 16)) < C.hitRadius) {
            s.done = true;
            this.blasts.push({ x: s.x, y: s.y, t: 0.4 });
            this.lastShot = { x: s.x, y: s.y };
            good(this);
            hitBoss(this);
            continue;
          }
          if (s.y >= hillY(s.x) || s.x < 0 || s.x > 330) {
            s.done = true;
            this.blasts.push({ x: s.x, y: Math.min(s.y, hillY(s.x)), t: 0.4 });
            if (s.mine) this.lastShot = { x: s.x, y: s.y };
            if (!s.mine && Math.abs(s.x - h.x) < C.blast) { hurt(this, { shell: true }); if (this.result !== 'playing') return; }
          }
        }
        this.shells = this.shells.filter(s => !s.done);
      },
    });
    return g;
  },

  /** Computes the shot by simulation, charges exactly that long, and sidesteps shells. */
  bot({ lead = 0 } = {}) {
    const C = CANNON;
    let plan = null, shots = 0, seed = 12345;
    // people judge the charge by eye: the first shot is a guess, each one after is closer
    // (a slower player guesses wider); the perfect bot (lead 0) never misjudges
    const guess = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed / 2147483648) * 2 - 1; };
    return (g, dt = 1 / 120) => {
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) g.held.delete(k);
      // dodge: an incoming shell landing near us
      const incoming = g.shells.find(s => !s.mine && Math.abs(s.target - g.hero.x) < C.blast + 6);
      if (incoming) {
        // away from where it lands — unless the wall is in the way, then the other way
        let dir = incoming.target < g.hero.x ? 1 : -1;
        if (dir < 0 && incoming.target - (C.heroMin) < C.blast + 4) dir = 1;
        if (dir > 0 && C.heroMax - incoming.target < C.blast + 4) dir = -1;
        g.held.add(dir > 0 ? 'ArrowRight' : 'ArrowLeft');
      }
      if (g.charging !== null) {
        if (plan && !plan.counted) { plan.counted = true; shots++; }
        // let go a touch early: the release lands `lead` later
        if (plan && g.power() >= plan.power - 0.004 - lead / C.charge && g.charging < C.charge) g.release('Space');
        return;
      }
      if (g.shells.some(s => s.mine)) return;
      if (!plan || plan.counted || plan.at !== g.hero.x) {
        plan = bestShot(g);
        if (!plan) return;
        plan.at = g.hero.x;
        if (lead) plan.power += guess() * lead * 0.9 * Math.pow(0.55, shots);
      }
      if (Math.abs(g.hero.angle - plan.angle) > 0.02) { g.held.add(g.hero.angle < plan.angle ? 'ArrowUp' : 'ArrowDown'); return; }
      if (!incoming) g.press('Space');
    };
  },
};

/** The power (0..1) at the current angle (or a nearby one) that lands on the boss, by simulation. */
export function bestShot(g) {
  const C = CANNON;
  let best = null;
  for (const da of [0, 0.1, -0.1, 0.2, -0.2, 0.3]) {
    const angle = Math.max(C.minAngle, Math.min(C.maxAngle, g.hero.angle + da));
    for (let p = 0.05; p <= 1; p += 0.01) {
      const speed = C.minPower + (C.maxPower - C.minPower) * p;
      let x = g.hero.x + 10, y = C.ground - 12, vx = Math.cos(angle) * speed, vy = -Math.sin(angle) * speed;
      for (let t = 0; t < 6; t += 1 / 60) {
        vy += C.gravity / 60; vx += g.wind / 60; x += vx / 60; y += vy / 60;
        const d = Math.hypot(x - C.bossX, y - (C.bossY - 16));
        if (d < C.hitRadius * 0.6) { const score = Math.abs(da) * 10 + d; if (!best || score < best.score) best = { angle, power: p, score }; break; }
        if (y >= hillY(x)) break;
      }
    }
    if (best) break;
  }
  return best;
}
