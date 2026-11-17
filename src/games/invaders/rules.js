/**
 * Star Invaders — a boss game: the boss floats above rows of its minions, which march
 * side to side and creep down, dropping bombs.
 *
 * Move with ← → (or A / D) and cast stars upward with Space (two in the air at most).
 * Minions shield the boss — clear a path and hit it. Bombs cost a heart, and so does a
 * row of minions reaching the ground (they're pushed back up). Every hit recolours the
 * world. Clear the whole flock and a new one swoops in.
 */
import { baseGame, tick, good, hurt, hitBoss, axis } from '../kit/common.js';

export const INVADERS = {
  heroY: 158, heroSpeed: 150,
  shotSpeed: 260, maxShots: 2, cooldown: 0.22,
  cellW: 22, cellH: 16,
  groundY: 138,          // minions that reach this line hurt you
  bossY: 26,
  bombSpeed: 80,
};

export const invaders = {
  id: 'invaders',
  name: 'Star Invaders',
  controls: 'move+shoot',
  rules: boss => [
    'Move with <strong>← →</strong> (or A / D) and cast stars upward with <strong>Space</strong>.',
    'The boss hides behind rows of minions: clear a path and hit it. Every hit recolours the world.',
    `Bombs cost a heart — so do minions reaching the ground. Hit the boss ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const I = INVADERS;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'invaders',
      hero: { x: 160 },
      shots: [],            // { x, y }
      bombs: [],            // { x, y, big }
      minions: [],          // { col, row, alive }
      grid: { x: 0, y: 0, dir: 1 },
      foe: { x: 160, dir: 1 },
      cooldown: 0,
      nextBomb: 1.5,
      nextBossBomb: 2.5,
      waves: 0,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (code === 'Space' || code === 'KeyJ' || code === 'Enter' || code === 'ArrowUp' || code === 'KeyW') return this.cast();
        return null;
      },

      cast() {
        if (this.cooldown > 0 || this.shots.length >= I.maxShots) return null;
        this.cooldown = I.cooldown;
        this.shots.push({ x: this.hero.x, y: I.heroY - 14 });
        return 'cast';
      },

      wave() {
        const { rows, cols } = this.boss;
        this.minions = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.minions.push({ col: c, row: r, alive: true });
        this.grid = { x: 160 - (cols * I.cellW) / 2, y: 52, dir: this.waves % 2 ? -1 : 1 };
        this.waves++;
      },

      minionAt(m) {
        return { x: this.grid.x + m.col * I.cellW + I.cellW / 2, y: this.grid.y + m.row * I.cellH + I.cellH / 2 };
      },

      step(dt) {
        const state = tick(this, dt);
        if (state !== 'play') { this.bombs = []; return; }
        this.hero.x = Math.max(20, Math.min(300, this.hero.x + axis(this) * I.heroSpeed * dt));
        this.cooldown = Math.max(0, this.cooldown - dt);
        // the flock marches: faster as it thins out
        const alive = this.minions.filter(m => m.alive);
        if (!alive.length) { this.wave(); return; }
        const total = this.boss.rows * this.boss.cols;
        const speed = this.boss.march * (1 + 1.2 * (1 - alive.length / total));
        this.grid.x += this.grid.dir * speed * dt;
        const xs = alive.map(m => this.minionAt(m).x);
        if (Math.min(...xs) < 24 && this.grid.dir < 0 || Math.max(...xs) > 296 && this.grid.dir > 0) {
          this.grid.dir *= -1;
          this.grid.y += this.boss.descend;
        }
        const lowest = Math.max(...alive.map(m => this.minionAt(m).y));
        if (lowest + I.cellH / 2 >= I.groundY) {             // they reached the ground: a heart, and back up they go
          hurt(this, { landed: true });
          this.grid.y = 52;
          if (this.result !== 'playing') return;
        }
        // the boss drifts above, side to side
        this.foe.x += this.foe.dir * this.boss.foeSpeed * dt;
        if (this.foe.x < 50 || this.foe.x > 270) this.foe.dir *= -1;
        // shots
        for (const s of this.shots) {
          s.y -= I.shotSpeed * dt;
          for (const m of alive) {
            if (!m.alive || s.spent) continue;
            const p = this.minionAt(m);
            if (Math.abs(p.x - s.x) < I.cellW / 2 - 2 && Math.abs(p.y - s.y) < I.cellH / 2) { m.alive = false; s.spent = true; this.events.push({ type: 'pop', x: p.x, y: p.y }); }
          }
          if (!s.spent && Math.abs(s.x - this.foe.x) < 26 && s.y < I.bossY + 18 && s.y > I.bossY - 22) {
            s.spent = true;
            good(this);
            hitBoss(this);
          }
        }
        this.shots = this.shots.filter(s => !s.spent && s.y > -10);
        // bombs: from the lowest minion of a random column, and big ones from the boss
        this.nextBomb -= dt;
        if (this.nextBomb <= 0) {
          const cols = [...new Set(alive.map(m => m.col))];
          const col = cols[Math.floor(this.rng() * cols.length)];
          const bottom = alive.filter(m => m.col === col).sort((a, b) => b.row - a.row)[0];
          const p = this.minionAt(bottom);
          this.bombs.push({ x: p.x, y: p.y + 6, big: false });
          this.nextBomb = this.boss.bombEvery * (0.7 + 0.6 * this.rng());
        }
        this.nextBossBomb -= dt;
        if (this.nextBossBomb <= 0) {
          this.bombs.push({ x: this.foe.x, y: I.bossY + 18, big: true });
          this.bossAttack = 0.4;
          this.nextBossBomb = this.boss.bombEvery * 2.2 * (0.8 + 0.4 * this.rng());
        }
        for (const b of this.bombs) {
          b.y += I.bombSpeed * (b.big ? 0.8 : 1) * dt;
          // stars shoot bombs down too
          for (const s of this.shots) if (!s.spent && Math.abs(s.x - b.x) < 5 && Math.abs(s.y - b.y) < 6) { s.spent = true; b.spent = true; }
          if (!b.spent && b.y > I.heroY - 14 && b.y < I.heroY + 4 && Math.abs(b.x - this.hero.x) < (b.big ? 11 : 8)) {
            b.spent = true;
            hurt(this, { bomb: true });
            if (this.result !== 'playing') return;
          }
        }
        this.bombs = this.bombs.filter(b => !b.spent && b.y < 185);
      },
    });
    g.wave();
    return g;
  },

  /**
   * Picks the x to stand at: under the boss when a star can get through (else under the
   * lowest minion), but never where a bomb will land in the next moment; casts when lined up.
   */
  bot({ lead = 0 } = {}) {
    const I = INVADERS;
    return g => {
      for (const k of ['ArrowLeft', 'ArrowRight']) g.held.delete(k);
      const alive = g.minions.filter(m => m.alive);
      const blocked = x => alive.some(m => Math.abs(g.minionAt(m).x - x) < I.cellW / 2);
      const aimX = g.foe.x + g.foe.dir * g.boss.foeSpeed * ((I.heroY - I.bossY) / I.shotSpeed + lead);
      let want;
      if (!blocked(g.foe.x) && !blocked(aimX) && aimX > 30 && aimX < 290) want = aimX;
      else {
        const low = [...alive].sort((a, b) => b.row - a.row || Math.abs(g.minionAt(a).x - g.hero.x) - Math.abs(g.minionAt(b).x - g.hero.x))[0];
        want = low ? g.minionAt(low).x : 160;
      }
      // is x dangerous around time t (seconds from now)? a bomb in the hero's band then
      const unsafe = (x, t, stay = 0.15) => g.bombs.some(b => {
        if (Math.abs(b.x - x) >= (b.big ? 13 : 10) + 4 + I.heroSpeed * lead * 0.6) return false;   // room for a late stop
        const v = I.bombSpeed * (b.big ? 0.8 : 1);
        const enter = (I.heroY - 16 - b.y) / v, exit = (I.heroY + 6 - b.y) / v;
        return exit >= t - 0.05 && enter <= t + stay;
      });
      let best = g.hero.x, bestScore = -Infinity;
      for (let x = 24; x <= 296; x += 4) {
        let score = -Math.abs(x - want) * 0.3 - Math.abs(x - g.hero.x) * 0.05;
        // unsafe if a bomb is there when we'd arrive (and a while after), or on the way
        if (unsafe(x, Math.abs(x - g.hero.x) / I.heroSpeed + lead, 0.6)) score -= 200;
        const steps = Math.ceil(Math.abs(x - g.hero.x) / 6);
        for (let k = 0; k < steps; k++) { const px = g.hero.x + (x - g.hero.x) * k / steps; if (unsafe(px, Math.abs(px - g.hero.x) / I.heroSpeed + lead)) { score -= 120; break; } }
        if (score > bestScore) { bestScore = score; best = x; }
      }
      if (Math.abs(best - g.hero.x) > 3 + I.heroSpeed * lead * 0.7) g.held.add(best < g.hero.x ? 'ArrowLeft' : 'ArrowRight');
      if (Math.abs(want - g.hero.x) < 9) g.press('Space');
    };
  },
};
