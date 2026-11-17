/**
 * Block Drop — a checkpoint mini-game (falling blocks): clear lines.
 *
 * ← → move the piece (hold to slide), ↑ / X rotates, ↓ drops it faster, Space drops
 * it all the way. A full row clears — and recolours the world. If the stack reaches the
 * top you lose a heart and the well is emptied (cleared lines still count).
 */
import { baseGame, tick, good, hurt, hitBoss } from '../kit/common.js';

export const TETRIS = {
  cols: 10, rows: 16,
  cell: 8, left: 120, top: 24,
  das: 0.16, arr: 0.05,     // hold-to-slide: delay, then repeat (s)
  softDrop: 0.04,           // s per row while ↓ is held
  lockDelay: 0.35,          // s a landed piece waits before locking (time to slide it)
};

// each piece: rotations as lists of [x, y] cells
const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
export const PIECES = Object.keys(SHAPES);
const SIZE = { I: 4, O: 4 };
export function cellsOf(kind, rotation) {
  const n = SIZE[kind] || 3;
  let cells = SHAPES[kind];
  for (let r = 0; r < ((rotation % 4) + 4) % 4; r++) cells = cells.map(([x, y]) => [n - 1 - y, x]);
  return kind === 'O' ? SHAPES.O : cells;
}

export const tetris = {
  id: 'tetris',
  name: 'Block Drop',
  controls: 'puzzle',
  checkpoint: true,
  rules: boss => [
    '<strong>← →</strong> move the falling block, <strong>↑</strong> (or X) turns it, <strong>↓</strong> drops it faster, <strong>Space</strong> drops it all the way.',
    'Fill a whole row to clear it — every line recolours the world.',
    `If the blocks reach the top you lose a heart (the well empties). Clear ${boss.hp} lines within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const T = TETRIS;
    const g = baseGame(boss, seed);
    let bag = [];
    Object.assign(g, {
      mode: 'tetris',
      well: Array.from({ length: T.rows }, () => new Array(T.cols).fill(null)),   // piece kind or null
      piece: null,          // { kind, rot, x, y }
      next: null,
      fall: 0,              // s until the next row of gravity
      lock: 0,
      slide: { dir: 0, t: 0 },
      cleared: [],          // rows flashing: { row, t }
      lines: 0,

      draw() {
        if (!bag.length) { bag = [...PIECES]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
        return bag.pop();
      },

      spawn() {
        const kind = this.next || this.draw();
        this.next = this.draw();
        this.piece = { kind, rot: 0, x: 3, y: 0 };
        this.fall = this.boss.gravity;
        this.lock = 0;
        if (!this.fits(this.piece)) {              // topped out
          hurt(this, { toppedOut: true });
          for (const row of this.well) row.fill(null);
          this.events.push({ type: 'topOut' });
        }
      },

      fits({ kind, rot, x, y }) {
        return cellsOf(kind, rot).every(([cx, cy]) => {
          const gx = x + cx, gy = y + cy;
          return gx >= 0 && gx < T.cols && gy < T.rows && (gy < 0 || !this.well[gy][gx]);
        });
      },

      move(dx, dy = 0, drot = 0) {
        if (!this.piece) return false;
        const p = { ...this.piece, x: this.piece.x + dx, y: this.piece.y + dy, rot: this.piece.rot + drot };
        if (this.fits(p)) { this.piece = p; return true; }
        if (drot) {                               // wall kicks: try a step sideways
          for (const kick of [-1, 1, -2, 2]) {
            const k = { ...p, x: p.x + kick };
            if (this.fits(k)) { this.piece = k; return true; }
          }
        }
        return false;
      },

      press(code) {
        if (this.result !== 'playing' || this.victory > 0 || !this.piece) return null;
        if (code === 'ArrowLeft' || code === 'KeyA') { this.move(-1); this.slide = { dir: -1, t: T.das }; return 'move'; }
        if (code === 'ArrowRight' || code === 'KeyD') { this.move(1); this.slide = { dir: 1, t: T.das }; return 'move'; }
        if (code === 'ArrowUp' || code === 'KeyW' || code === 'KeyX' || code === 'KeyK') { this.move(0, 0, 1); return 'rotate'; }
        if (code === 'KeyZ' || code === 'KeyJ') { this.move(0, 0, 3); return 'rotate'; }
        if (code === 'Space') {
          while (this.move(0, 1)) { /* drop */ }
          this.lockPiece();
          return 'drop';
        }
        return null;
      },

      release(code) {
        this.held.delete(code);
        if ((code === 'ArrowLeft' || code === 'KeyA') && this.slide.dir < 0) this.slide.dir = 0;
        if ((code === 'ArrowRight' || code === 'KeyD') && this.slide.dir > 0) this.slide.dir = 0;
      },

      lockPiece() {
        const { kind, rot, x, y } = this.piece;
        for (const [cx, cy] of cellsOf(kind, rot)) if (y + cy >= 0) this.well[y + cy][x + cx] = kind;
        this.events.push({ type: 'lock' });
        const full = [];
        this.well.forEach((row, r) => { if (row.every(Boolean)) full.push(r); });
        for (const r of full) {
          this.well.splice(r, 1);
          this.well.unshift(new Array(T.cols).fill(null));
          this.cleared.push({ row: r, t: 0.3 });
          this.lines++;
          good(this);
          hitBoss(this);
        }
        this.piece = null;
        if (this.result === 'playing' && this.victory <= 0) this.spawn();
      },

      step(dt) {
        const state = tick(this, dt);
        for (const c of this.cleared) c.t -= dt;
        this.cleared = this.cleared.filter(c => c.t > 0);
        if (state !== 'play' || !this.piece) return;
        // hold to slide
        if (this.slide.dir && (this.held.has(this.slide.dir < 0 ? 'ArrowLeft' : 'ArrowRight') || this.held.has(this.slide.dir < 0 ? 'KeyA' : 'KeyD'))) {
          this.slide.t -= dt;
          while (this.slide.t <= 0) { this.move(this.slide.dir); this.slide.t += T.arr; }
        }
        // gravity (faster while ↓ is held)
        const soft = this.held.has('ArrowDown') || this.held.has('KeyS');
        this.fall -= dt;
        if (this.fall <= 0) {
          this.fall += soft ? T.softDrop : this.boss.gravity;
          if (!this.move(0, 1)) {
            this.lock += soft ? T.lockDelay : this.boss.gravity;
            if (this.lock >= T.lockDelay) this.lockPiece();
          } else this.lock = 0;
        }
      },
    });
    g.spawn();
    return g;
  },

  /**
   * A classic placement bot: tries every rotation and column, scores the resulting well
   * (lines cleared, height, holes, bumpiness) and drops the piece into the best spot.
   */
  bot({ think = 0.25 } = {}) {
    let wait = think, planned = null;
    return (g, dt = 1 / 120) => {
      if (!g.piece) return;
      if (planned && planned.piece !== g.piece) planned = null;
      if (!planned) {
        wait -= dt;
        if (wait > 0) return;
        wait = think;
        planned = { piece: g.piece, ...bestPlacement(g) };
      }
      const p = g.piece;
      if (((p.rot - planned.rot) % 4 + 4) % 4 !== 0) { g.press('ArrowUp'); if (g.piece === p) planned = null; return; }
      if (p.x < planned.x) { g.press('ArrowRight'); g.release('ArrowRight'); if (g.piece === p && g.piece.x === p.x && !g.fits({ ...p, x: p.x + 1 })) planned = null; return; }
      if (p.x > planned.x) { g.press('ArrowLeft'); g.release('ArrowLeft'); if (g.piece === p && g.piece.x === p.x && !g.fits({ ...p, x: p.x - 1 })) planned = null; return; }
      g.press('Space');
      planned = null;
    };
  },
};

/** The best rotation and column for the current piece (Dellacherie-style weights). */
export function bestPlacement(g) {
  const T = TETRIS;
  const { kind } = g.piece;
  let best = { score: -Infinity, rot: 0, x: g.piece.x };
  for (let rot = 0; rot < 4; rot++) {
    for (let x = -2; x < T.cols; x++) {
      let p = { kind, rot, x, y: 0 };
      if (!g.fits(p)) continue;
      while (g.fits({ ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
      const well = g.well.map(row => [...row]);
      for (const [cx, cy] of cellsOf(kind, rot)) if (p.y + cy >= 0) well[p.y + cy][p.x + cx] = kind;
      let lines = 0;
      for (let r = well.length - 1; r >= 0; r--) if (well[r].every(Boolean)) { well.splice(r, 1); lines++; }
      while (well.length < T.rows) well.unshift(new Array(T.cols).fill(null));
      const heights = Array.from({ length: T.cols }, (_, c) => { const r = well.findIndex(row => row[c]); return r < 0 ? 0 : T.rows - r; });
      let holes = 0;
      for (let c = 0; c < T.cols; c++) { let seen = false; for (let r = 0; r < T.rows; r++) { if (well[r][c]) seen = true; else if (seen) holes++; } }
      const bump = heights.slice(1).reduce((s, h, i) => s + Math.abs(h - heights[i]), 0);
      const agg = heights.reduce((s, h) => s + h, 0);
      const score = lines * 0.76 - agg * 0.51 - holes * 0.36 - bump * 0.18;
      if (score > best.score) best = { score, rot, x };
    }
  }
  return best;
}
