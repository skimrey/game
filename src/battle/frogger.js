/**
 * Road Hop — a checkpoint game (Frogger style): hop across a road of rolling carts and
 * a river of drifting logs to the far bank, then do it again.
 *
 * Hop with the arrows (or WASD), one lane at a time. On the road, don't get run over;
 * on the river, ride the logs (you drift with them — don't get carried off the edge).
 * Every crossing recolours the world; so does every lane of progress. A bump or a splash
 * costs a heart and sends you back to the start.
 */
import { baseGame, tick, good, hurt, hitBoss, directionOf } from './common.js';

export const FROGGER = {
  cols: 13, cell: 16, left: 56, bottom: 166,
  rows: 9,               // 0 start bank · 1–3 road · 4 middle bank · 5–7 river · 8 far bank
  hop: 0.14,             // s per hop
};

const ROAD = [1, 2, 3], RIVER = [5, 6, 7];

export const frogger = {
  id: 'frogger',
  name: 'Road Hop',
  checkpoint: true,
  controls: 'grid-hop',
  rules: boss => [
    'Hop with the <strong>arrows</strong> (or WASD), one lane at a time, to the far bank.',
    'On the road, dodge the carts. On the river, <strong>ride the logs</strong> — you drift with them; don’t fall in or get carried off the edge.',
    `A bump or a splash costs a heart. Cross ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const F = FROGGER;
    const g = baseGame(boss, seed);
    const rng = g.rng;
    // each lane: direction, speed and a repeating pattern of things
    const lanes = {};
    ROAD.forEach((row, i) => {
      const dir = i % 2 ? -1 : 1;
      const speed = boss.carSpeed * (0.8 + 0.45 * rng());
      const spacing = boss.carGap * (0.8 + 0.5 * rng());
      lanes[row] = { kind: 'road', dir, speed, items: Array.from({ length: Math.ceil(F.cols * F.cell / spacing) + 1 }, (_, k) => ({ x: k * spacing + rng() * 20, w: 18 + Math.floor(rng() * 2) * 10 })) };
    });
    RIVER.forEach((row, i) => {
      const dir = i % 2 ? 1 : -1;
      const speed = boss.logSpeed * (0.8 + 0.4 * rng());
      const spacing = boss.logGap * (0.85 + 0.3 * rng());
      lanes[row] = { kind: 'river', dir, speed, items: Array.from({ length: Math.ceil(F.cols * F.cell / spacing) + 2 }, (_, k) => ({ x: k * spacing, w: boss.logLength * F.cell })) };
    });
    const width = F.cols * F.cell;
    Object.assign(g, {
      mode: 'frogger',
      lanes, width,
      hero: { col: 6, row: 0, x: 6 * F.cell + F.cell / 2, hop: 0, from: null },
      best: 0,               // furthest row reached this crossing
      crossings: 0,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const d = directionOf(code);
        if (!d || this.hero.hop > 0) return null;
        const h = this.hero;
        const dr = d === 'up' ? 1 : d === 'down' ? -1 : 0, dc = d === 'left' ? -1 : d === 'right' ? 1 : 0;
        const row = Math.max(0, Math.min(F.rows - 1, h.row + dr));
        const x = Math.max(F.cell / 2, Math.min(width - F.cell / 2, h.x + dc * F.cell));
        h.from = { row: h.row, x: h.x };
        h.row = row; h.x = x; h.hop = F.hop;
        return 'hop';
      },

      itemsAt(row) {
        const lane = this.lanes[row];
        return lane ? lane.items.map(it => ({ x: (((it.x + lane.offset) % (width + 60)) + width + 60) % (width + 60) - 30, w: it.w })) : [];
      },

      onItem(row, x) { return this.itemsAt(row).some(it => x > it.x - 2 && x < it.x + it.w + 2); },

      reset() { Object.assign(this.hero, { col: 6, row: 0, x: 6 * F.cell + F.cell / 2, hop: 0, from: null }); this.best = 0; },

      step(dt) {
        const state = tick(this, dt);
        for (const lane of Object.values(this.lanes)) lane.offset = (lane.offset || 0) + lane.dir * lane.speed * dt;
        if (state !== 'play') return;
        const h = this.hero;
        if (h.hop > 0) { h.hop = Math.max(0, h.hop - dt); if (h.hop > 0) return; }
        // progress: each new row is a small win
        if (h.row > this.best) {
          this.best = h.row;
          good(this, { row: h.row });
          if (h.row === F.rows - 1) {
            this.crossings++;
            this.events.push({ type: 'crossed' });
            hitBoss(this);
            this.reset();
            return;
          }
        }
        const lane = this.lanes[h.row];
        if (lane?.kind === 'river') {
          if (!this.onItem(h.row, h.x)) { this.events.push({ type: 'splash' }); if (hurt(this, { splash: true })) this.reset(); return; }
          h.x += lane.dir * lane.speed * dt;                       // riding the log
          if (h.x < 4 || h.x > width - 4) { this.events.push({ type: 'splash' }); if (hurt(this, { splash: true })) this.reset(); return; }
        } else if (lane?.kind === 'road') {
          if (this.itemsAt(h.row).some(it => h.x > it.x - 5 && h.x < it.x + it.w + 5)) { this.events.push({ type: 'bump' }); if (hurt(this, { bump: true })) this.reset(); return; }
        }
        // standing still on the start bank for too long: the clock still runs (idle loses by time)
      },
    });
    for (const lane of Object.values(lanes)) lane.offset = 0;
    return g;
  },

  /** Looks a hop ahead: goes up when the lane above is safe on landing, sidesteps when needed. */
  bot({ lead = 0 } = {}) {
    const F = FROGGER;
    return g => {
      const h = g.hero;
      if (h.hop > 0) return;
      const safeAt = (row, x, t) => {
        const lane = g.lanes[row];
        if (!lane) return true;
        // where things will be t seconds from now
        const shift = lane.dir * lane.speed * t;
        const items = g.itemsAt(row).map(it => ({ x: it.x + shift, w: it.w }));
        if (lane.kind === 'road') return !items.some(it => x > it.x - 7 && x < it.x + it.w + 7);
        return items.some(it => x > it.x + 4 && x < it.x + it.w - 4) && x > 10 && x < g.width - 10;
      };
      const stayOk = safeAt(h.row, h.x + (g.lanes[h.row]?.kind === 'river' ? g.lanes[h.row].dir * g.lanes[h.row].speed * 0.25 : 0), 0.25);
      const safeLanding = [0.02, F.hop * 0.5, F.hop, F.hop + 0.2].every(t => safeAt(h.row + 1, h.x, t + lead));
      if (safeLanding && (g.lanes[h.row + 1]?.kind !== 'river' || safeAt(h.row + 1, h.x + g.lanes[h.row + 1].dir * g.lanes[h.row + 1].speed * 0.5, F.hop + 0.5))) { g.press('ArrowUp'); return; }
      if (stayOk) return;
      for (const [code, dx] of [['ArrowLeft', -F.cell], ['ArrowRight', F.cell]]) if (safeAt(h.row, h.x + dx, F.hop + 0.1)) { g.press(code); return; }
      if (h.row > 0 && safeAt(h.row - 1, h.x, F.hop + 0.1)) g.press('ArrowDown');
    };
  },
};
