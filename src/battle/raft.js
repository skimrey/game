/**
 * River Raft — a travel level (meadow → canyon): ride the river down into the canyon.
 *
 * Seen from above; the river winds and its banks close in. Paddle with ← and →: each
 * press is a stroke that pushes the raft toward that side, and it keeps drifting — so
 * paddle gently. Steer around rocks and logs (a heart each); whirlpools drag you toward their middle; scraping the bank
 * bounces you off and slows you down. Every stretch of river
 * travelled recolours the world.
 */
import { baseGame, tick, good, hurt, hitBoss } from './common.js';

export const RAFT = {
  raftY: 44, stroke: 32, drag: 2.2, maxVx: 90,
  rowGap: 96,
  halfWidth: 10,
};

/** The river's centre and half-width at distance `d` (px travelled). */
export function riverAt(g, d) {
  const c = 160 + Math.sin(d * 0.006 + g.phase) * g.boss.wind1 + Math.sin(d * 0.013 + g.phase * 2) * g.boss.wind2;
  const half = g.boss.width / 2 - Math.max(0, Math.sin(d * 0.004 + g.phase)) * g.boss.narrow;
  return { c, half };
}

export const raft = {
  id: 'raft',
  name: 'River Raft',
  controls: 'paddle-strokes',
  travel: true,
  rules: boss => [
    'Paddle with <strong>← →</strong>: every press is a stroke toward that side — the raft keeps drifting, so go easy.',
    'Steer around rocks and logs; <strong>whirlpools</strong> tug you toward their middle. Scraping the bank slows you down.',
    `Rocks and logs cost a heart. Reach the canyon within <strong>${boss.time} seconds</strong> — every stretch of river recolours the world.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const R = RAFT;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'raft',
      phase: g.rng() * 6,
      x: 160, vx: 0,
      travelled: 0,
      trip: boss.hp * boss.stretch,        // total distance
      objects: [],                          // { kind: rock | log | whirl, x, d (distance along), r }
      nextRow: 160,
      strokes: [],                          // ripple effects { x, side, t }
      bump: 0,
      scrape: 0,                            // seconds of slow going after scraping the bank

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const dir = code === 'ArrowLeft' || code === 'KeyA' ? -1 : code === 'ArrowRight' || code === 'KeyD' ? 1 : 0;
        if (!dir) return null;
        this.vx = Math.max(-R.maxVx, Math.min(R.maxVx, this.vx + dir * R.stroke));
        this.strokes.push({ x: this.x - dir * 10, side: dir, t: 0.4 });
        return 'stroke';
      },

      /** Screen y of something `d` px along the river. */
      yOf(d) { return R.raftY + (d - this.travelled); },

      step(dt) {
        const state = tick(this, dt);
        for (const s of this.strokes) s.t -= dt;
        this.strokes = this.strokes.filter(s => s.t > 0);
        if (state === 'over') return;
        this.scrape = Math.max(0, this.scrape - dt);
        const speed = this.boss.current * (this.scrape > 0 ? 0.45 : 1);
        this.travelled += speed * dt;
        // drift: the raft keeps its sideways speed, slowly
        this.vx *= Math.exp(-R.drag * dt);
        for (const o of this.objects) {
          if (o.kind !== 'whirl') continue;
          const dy = this.yOf(o.d) - R.raftY;
          if (Math.abs(dy) < o.r && Math.abs(o.x - this.x) < o.r * 1.6) this.vx += Math.sign(o.x - this.x) * this.boss.pull * dt;
        }
        this.x += this.vx * dt;
        this.bump = Math.max(0, this.bump - dt);
        if (state !== 'play') return;
        // stretches travelled
        const stretch = Math.floor(this.travelled / this.boss.stretch);
        while (this.boss.hp - this.bossHp < stretch && this.bossHp > 0) { good(this); hitBoss(this); }
        // obstacles ahead
        while (this.nextRow < this.travelled + 200) {
          const { c, half } = riverAt(this, this.nextRow);
          const roll = this.rng();
          if (roll < this.boss.whirls) this.objects.push({ kind: 'whirl', x: c + (this.rng() * 2 - 1) * half * 0.5, d: this.nextRow, r: 16 });
          else {
            const n = this.rng() < this.boss.busy ? 2 : 1;
            const placed = [];
            for (let i = 0; i < n; i++) {
              const kind = this.rng() < 0.35 ? 'log' : 'rock';
              const r = kind === 'log' ? 13 : 8;
              // keep a raft-and-a-half of clear water somewhere in every row
              let x = c + (this.rng() * 2 - 1) * (half - 14);
              // now and then right where the raft is heading: drifting along isn't enough
              if (!placed.length && this.rng() < 0.3) x = Math.max(c - half + 14, Math.min(c + half - 14, this.x + this.vx * 0.8));
              if (placed.length) {
                const o = placed[0];
                const leftGap = Math.min(x, o.x) - (c - half), rightGap = c + half - Math.max(x, o.x), midGap = Math.abs(x - o.x) - r - o.r;
                if (Math.max(leftGap - r, rightGap - r, midGap) < 34) continue;
              }
              placed.push({ x, r });
              this.objects.push({ kind, x, d: this.nextRow + i * 18, r });
            }
          }
          this.nextRow += R.rowGap * (0.8 + 0.5 * this.rng());
        }
        this.objects = this.objects.filter(o => this.yOf(o.d) > -30);
        // bumps: the banks, rocks, logs
        const { c, half } = riverAt(this, this.travelled);
        let hit = null, bank = false;
        if (this.x < c - half + R.halfWidth) { this.x = c - half + R.halfWidth; this.vx = Math.abs(this.vx) * 0.5 + 10; bank = true; }
        if (this.x > c + half - R.halfWidth) { this.x = c + half - R.halfWidth; this.vx = -Math.abs(this.vx) * 0.5 - 10; bank = true; }
        if (bank) {                                  // the bank only slows you down
          if (this.scrape <= 0) this.events.push({ type: 'scrape', x: this.x, y: R.raftY });
          this.scrape = 0.8;
        }
        for (const o of this.objects) {
          if (o.kind === 'whirl' || o.spent) continue;
          const dy = this.yOf(o.d) - R.raftY;
          const w = o.kind === 'log' ? o.r : o.r;
          if (Math.abs(dy) < 7 && Math.abs(o.x - this.x) < w + R.halfWidth - 4) { o.spent = true; hit = o.kind; this.vx += Math.sign(this.x - o.x || 1) * 30; }
        }
        if (hit && this.bump <= 0) { this.bump = 0.4; this.events.push({ type: 'bump', x: this.x, y: R.raftY }); hurt(this, { bump: hit }); }
      },
    });
    return g;
  },

  /** Looks ahead for the clearest line through the next obstacles and paddles toward it. */
  bot({ think = 0.1, lead = 0 } = {}) {
    const R = RAFT;
    let wait = 0;
    return (g, dt = 1 / 120) => {
      wait -= dt;
      if (wait > 0) return;
      wait = think;
      const { c, half } = riverAt(g, g.travelled + 30);
      const ahead = g.objects.filter(o => o.kind !== 'whirl' && !o.spent && g.yOf(o.d) > R.raftY - 4 && g.yOf(o.d) < R.raftY + 135);
      const whirls = g.objects.filter(o => o.kind === 'whirl' && Math.abs(g.yOf(o.d) - R.raftY) < 60);
      let best = c, bestScore = -Infinity;
      for (let x = c - half + 14; x <= c + half - 14; x += 4) {
        let score = -Math.abs(x - g.x) * 0.2 - Math.abs(x - c) * 0.1;
        for (const o of ahead) {
          // where we'd be when it reaches us, heading for x at a comfortable ~55 px/s
          const t = Math.max(0, (g.yOf(o.d) - R.raftY) / g.boss.current);
          const at = g.x + Math.max(-55 * t, Math.min(55 * t, x - g.x));
          if (Math.abs(o.x - at) < o.r + R.halfWidth + 8) score -= 100 / (1 + t);
        }
        for (const o of whirls) if (Math.abs(o.x - x) < o.r * 1.6) score -= 20;
        if (score > bestScore) { bestScore = score; best = x; }
      }
      // paddle toward a sideways speed that gets us there (it coasts: aim for the drift to stop on target)
      const want = Math.max(-70, Math.min(70, (best - (g.x + g.vx * lead)) * R.drag));
      if (g.vx < want - R.stroke * 0.35) g.press('ArrowRight');
      else if (g.vx > want + R.stroke * 0.35) g.press('ArrowLeft');
    };
  },
};
