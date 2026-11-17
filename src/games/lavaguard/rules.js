/**
 * Lava Guard — the volcano's capstone: keep the lava bombs off the village.
 *
 * The boss sits in the crater and lobs lava bombs at the three huts below. Aim with the
 * mouse (or the arrows / WASD) and fire with a click (or Space): a water shot flies to
 * the crosshair and bursts into a splash — any lava bomb caught in it is doused, and
 * every bomb doused hits the boss. Splashes take a moment to fly and to spread, so aim
 * a little ahead of a falling bomb. Three shots in the air at most.
 *
 * A bomb that reaches a hut sets it alight: a heart. Later the bombs fall faster, come
 * thicker, and some split in two on the way down.
 */
import { SCREEN, baseGame, tick, good, wrong, hurt, hitBoss, axis, UP_KEYS, DOWN_KEYS } from '../kit/common.js';

export const LAVAGUARD = {
  cannon: { x: 204, y: 160 },
  huts: [56, 140, 266],
  hutY: 164,
  crater: { x: 160, y: 58 },
  shotSpeed: 250,
  splash: 14,            // px radius at its widest
  grow: 0.18, linger: 0.35,
  maxShots: 3, reload: 0.22,
  aimSpeed: 220,
  skyTop: 24, skyBottom: 150,
};
const FIRE = ['Space', 'Enter', 'KeyJ', 'KeyX'];

export const lavaguard = {
  id: 'lavaguard',
  name: 'Lava Guard',
  controls: 'aim',
  rules: boss => [
    'The boss lobs lava bombs at the village. <strong>Aim with the mouse</strong> (or the arrows / WASD) and <strong>fire with a click</strong> (or Space).',
    'Your water shot bursts into a splash where you aimed: every bomb it catches is doused — and hits the boss. Aim a little ahead of falling bombs.',
    `A bomb that reaches a hut costs a heart.${boss.split ? ' Some bombs split in two on the way down!' : ''} Douse ${boss.hp} bombs within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const L = LAVAGUARD;
    const g = baseGame(boss, seed);
    let nextId = 1;
    Object.assign(g, {
      mode: 'lavaguard',
      aim: { x: 160, y: 90 },
      bombs: [],              // { id, x, y, vx, vy, split, big }
      shots: [],              // { x, y, tx, ty, vx, vy }
      splashes: [],           // { x, y, t }
      burning: [0, 0, 0],     // s each hut stays alight (drawing)
      reload: 0,
      nextBomb: 1,

      aimAt(x, y) { this.aim = { x: Math.max(6, Math.min(SCREEN.w - 6, x)), y: Math.max(L.skyTop, Math.min(L.skyBottom, y)) }; },
      click(x, y) { this.aimAt(x, y); return this.fire(); },
      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (FIRE.includes(code)) return this.fire();
        return null;
      },
      fire() {
        if (this.result !== 'playing' || this.victory > 0 || this.reload > 0 || this.shots.length >= L.maxShots) return null;
        const { x, y } = this.aim, c = L.cannon;
        const d = Math.hypot(x - c.x, y - c.y) || 1;
        this.shots.push({ x: c.x, y: c.y - 6, tx: x, ty: y, vx: (x - c.x) / d * L.shotSpeed, vy: (y - c.y) / d * L.shotSpeed, left: d / L.shotSpeed });
        this.reload = L.reload;
        return 'fire';
      },

      /** A lava bomb from the crater toward a hut (or a given spot). */
      lob(from = L.crater, target = null, big = false) {
        const hut = target ?? L.huts[Math.floor(this.rng() * L.huts.length)] + (this.rng() - 0.5) * 14;
        const speed = this.boss.bombSpeed * (0.85 + 0.3 * this.rng());
        const dx = hut - from.x, dy = L.hutY - from.y, d = Math.hypot(dx, dy);
        this.bombs.push({ id: nextId++, x: from.x, y: from.y, vx: dx / d * speed, vy: dy / d * speed, split: !big && this.rng() < this.boss.split ? from.y + 25 + this.rng() * 40 : null, big });
      },

      step(dt) {
        const state = tick(this, dt);
        for (let i = 0; i < 3; i++) this.burning[i] = Math.max(0, this.burning[i] - dt);
        for (const sp of this.splashes) sp.t += dt;
        this.splashes = this.splashes.filter(sp => sp.t < L.grow + L.linger);
        if (state !== 'play') { this.bombs = []; this.shots = []; return; }
        this.reload = Math.max(0, this.reload - dt);
        const ax = axis(this), ay = (DOWN_KEYS.some(k => this.held.has(k)) ? 1 : 0) - (UP_KEYS.some(k => this.held.has(k)) ? 1 : 0);
        if (ax || ay) this.aimAt(this.aim.x + ax * L.aimSpeed * dt, this.aim.y + ay * L.aimSpeed * dt);
        // water shots fly to the crosshair and burst
        for (const sh of this.shots) {
          sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.left -= dt;
          if (sh.left <= 0) { sh.done = true; this.splashes.push({ x: sh.tx, y: sh.ty, t: 0, doused: 0 }); }
        }
        this.shots = this.shots.filter(sh => !sh.done);
        // the boss lobs bombs (faster as it weakens)
        this.nextBomb -= dt;
        const anger = 1 - 0.3 * (1 - this.bossHp / this.boss.hp);
        if (this.nextBomb <= 0 && this.bombs.length < this.boss.maxAlive) {
          this.lob();
          this.bossAttack = 0.35;
          this.nextBomb = this.boss.every * anger * (0.75 + 0.5 * this.rng());
        } else if (this.nextBomb <= 0) this.nextBomb = 0.2;
        // bombs fall; splashes douse them; some split; huts burn
        for (const b of this.bombs) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.split !== null && b.y >= b.split) {
            b.done = true;
            for (const off of [-26, 26]) this.lob({ x: b.x, y: b.y }, Math.max(20, Math.min(300, b.x + off + b.vx * 0.8)), true);
            this.events.push({ type: 'split', x: b.x, y: b.y });
            continue;
          }
          for (const sp of this.splashes) {
            const r = L.splash * Math.min(1, sp.t / L.grow);
            if (Math.hypot(b.x - sp.x, b.y - sp.y) < r + 3) {
              b.done = true;
              sp.doused++;
              good(this, { x: b.x, y: b.y });
              this.events.push({ type: 'douse', x: b.x, y: b.y });
              hitBoss(this);
              break;
            }
          }
          if (!b.done && b.y >= L.hutY) {
            b.done = true;
            const hut = L.huts.reduce((best, x, i) => (Math.abs(x - b.x) < Math.abs(L.huts[best] - b.x) ? i : best), 0);
            this.burning[hut] = 2.5;
            this.events.push({ type: 'scorch', x: b.x, y: L.hutY });
            hurt(this, { hut });
            if (this.result !== 'playing') return;
          }
          if (this.bossHp <= 0) break;
        }
        this.bombs = this.bombs.filter(b => !b.done);
      },
    });
    return g;
  },

  /** Fires at the bomb that lands first (one not already covered by a shot in flight), leading it. */
  bot({ lead = 0 } = {}) {
    const L = LAVAGUARD;
    let claimed = new Map();                      // bomb id → time the shot was fired (hands are late: no double shots)
    let ready = 0;                                // people need a moment between shots to pick the next bomb
    return g => {
      if (g.reload > 0 || g.shots.length >= L.maxShots || g.time < ready) return;
      for (const [id, at] of claimed) if (g.time - at > 1.6 || !g.bombs.some(b => b.id === id)) claimed.delete(id);
      const open = g.bombs.filter(b => !claimed.has(b.id) && b.y > L.crater.y + 12).sort((a, b) => (L.hutY - a.y) / a.vy - (L.hutY - b.y) / b.vy);
      const b = open[0];
      if (!b) return;
      // where will it be when a shot fired now (plus our reaction) arrives and spreads?
      let t = 0.3;
      for (let k = 0; k < 6; k++) {
        const x = b.x + b.vx * (t + lead), y = b.y + b.vy * (t + lead);
        t = Math.hypot(x - L.cannon.x, y - L.cannon.y) / L.shotSpeed + L.grow * 0.6;
      }
      const x = b.x + b.vx * (t + lead), y = Math.min(L.skyBottom, b.y + b.vy * (t + lead));
      if (y >= L.hutY - 4) return;
      claimed.set(b.id, g.time);
      ready = g.time + 0.05 + 2.5 * lead;
      g.click(x, y);
    };
  },
};
