/**
 * Whack-a-Critter — a checkpoint game (or a boss game: the boss pops up too).
 *
 * Nine holes in a 3×3 grid. Critters pop up for a moment: whack them by clicking, or
 * with the key in the same spot of the keyboard — Q W E / A S D / Z X C. Every whack
 * recolours the world. Don't whack the bombs (later on). Let three critters get away and
 * you lose a heart. In the boss version the boss pops up now and then: whack *it*.
 */
import { baseGame, tick, good, wrong, hurt, hitBoss } from '../kit/common.js';

export const WHACK = {
  keys: ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC'],
  labels: ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'],
  holeX: [110, 160, 210], holeY: [78, 112, 146],
  escapesPerHeart: 3,
};

export const whack = {
  id: 'whack',
  name: 'Whack-a-Critter',
  controls: 'grid',
  roles: ['checkpoint', 'boss'],
  rules: boss => [
    'Critters pop out of nine holes: <strong>click them</strong>, or press the key in the same spot — <strong>Q W E / A S D / Z X C</strong>.',
    `Every whack recolours the world.${boss.bombs ? ' Don’t whack the bombs!' : ''} Three that get away cost a heart.`,
    boss.kind === 'checkpoint' ? `Whack ${boss.hp} critters within <strong>${boss.time} seconds</strong>.` : `The boss pops up too — whack it ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const W = WHACK;
    const g = baseGame(boss, seed);
    const bossGame = boss.kind !== 'checkpoint';
    Object.assign(g, {
      mode: 'whack',
      holes: Array.from({ length: 9 }, () => null),   // { kind: 'critter' | 'bomb' | 'boss', t, up, whacked }
      escapes: 0,
      nextPop: 0.8,
      swings: [],            // hammer swings: { hole, t, hit }

      holeAt(i) { return { x: W.holeX[i % 3], y: W.holeY[Math.floor(i / 3)] }; },

      press(code) {
        const i = W.keys.indexOf(code);
        if (i < 0) return null;
        return this.whack(i);
      },

      click(x, y) {
        let best = -1, bd = 22;
        for (let i = 0; i < 9; i++) { const h = this.holeAt(i); const d = Math.hypot(h.x - x, h.y - 8 - y); if (d < bd) { bd = d; best = i; } }
        return best < 0 ? null : this.whack(best);
      },

      whack(i) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const h = this.holes[i];
        this.swings.push({ hole: i, t: 0.18, hit: !!h && !h.whacked });
        if (!h || h.whacked) { wrong(this, { hole: i }); return 'miss'; }
        h.whacked = true;
        h.t = Math.min(h.t, 0.25);
        if (h.kind === 'bomb') { this.events.push({ type: 'boom', hole: i }); hurt(this, { bomb: true }); return 'wrong'; }
        good(this, { hole: i });
        if (h.kind === 'boss' || !bossGame) hitBoss(this);
        return 'good';
      },

      step(dt) {
        const state = tick(this, dt);
        for (const s of this.swings) s.t -= dt;
        this.swings = this.swings.filter(s => s.t > 0);
        if (state !== 'play') return;
        for (let i = 0; i < 9; i++) {
          const h = this.holes[i];
          if (!h) continue;
          h.t -= dt;
          if (h.t <= 0) {
            if (!h.whacked && h.kind === 'critter') {
              this.escapes++;
              this.events.push({ type: 'escape', hole: i });
              if (this.escapes % W.escapesPerHeart === 0) { hurt(this, { escaped: true }); if (this.result !== 'playing') return; }
            }
            this.holes[i] = null;
          }
        }
        this.nextPop -= dt;
        if (this.nextPop <= 0) {
          const free = this.holes.map((h, i) => (h ? -1 : i)).filter(i => i >= 0);
          if (free.length) {
            const i = free[Math.floor(this.rng() * free.length)];
            const roll = this.rng();
            const kind = bossGame && roll < this.boss.bossChance && !this.holes.some(h => h?.kind === 'boss') ? 'boss'
              : roll > 1 - this.boss.bombs ? 'bomb' : 'critter';
            const up = this.boss.upTime * (kind === 'boss' ? 0.8 : 1) * (0.85 + 0.3 * this.rng());
            this.holes[i] = { kind, t: up, up, whacked: false };
            if (kind === 'boss') this.bossAttack = 0.3;
          }
          this.nextPop = this.boss.popEvery * (0.7 + 0.6 * this.rng());
        }
      },
    });
    return g;
  },

  /** Whacks whatever's up (not bombs), oldest first, after a short reaction. */
  bot({ reaction = 0.22 } = {}) {
    return g => {
      for (let i = 0; i < 9; i++) {
        const h = g.holes[i];
        if (h && !h.whacked && h.kind !== 'bomb' && h.up - h.t >= reaction) { g.press(WHACK.keys[i]); return; }
      }
    };
  },
};
