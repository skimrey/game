/**
 * Bubble Pop — the lagoon's capstone: a bubble shooter in a tide pool.
 *
 * Bubbles of four or five colours cling to the rock above. Aim the launcher with ← →
 * (or the mouse) and shoot with Space (or a click): a bubble that joins two or more of
 * its colour pops them all — and every bubble left hanging from nothing drops too. Each
 * pop hits the boss (a big one, eight bubbles or more, hits twice). Bubbles bounce off the
 * walls, so banked shots reach round corners.
 *
 * The rock creeps down every few seconds (and with every few shots). If the bubbles
 * reach the line at the bottom you lose a heart and the lowest rows wash away. Later the
 * boss spits grey junk bubbles into the pile: they never pop, but they drop with the
 * bubbles they hang from.
 */
import { baseGame, tick, good, wrong, hurt, hitBoss, axis } from '../kit/common.js';

export const BUBBLE = {
  r: 7,                       // bubble radius (px)
  cols: 10,                   // bubbles in an even row (odd rows: one fewer, offset by half)
  left: 90, top: 22,          // the pool's inside, top-left
  launcher: { x: 160, y: 162 },
  dangerY: 140,               // bubbles reaching this line cost a heart
  shotSpeed: 300,
  turnSpeed: 1.6,             // rad/s with the keys
  maxAngle: 1.35,             // rad either side of straight up
  reload: 0.25,
  shotsPerPush: 7,            // the rock creeps down after this many shots too
};
BUBBLE.rowH = BUBBLE.r * Math.sqrt(3);
BUBBLE.right = BUBBLE.left + BUBBLE.cols * BUBBLE.r * 2;

const FIRE = ['Space', 'Enter', 'KeyJ', 'KeyX', 'ArrowUp', 'KeyW'];
export const JUNK = -1;

export const bubble = {
  id: 'bubble',
  name: 'Bubble Pop',
  controls: 'aim+shoot',
  rules: boss => [
    'Aim the launcher with <strong>← →</strong> (or the mouse) and shoot with <strong>Space</strong> (or a click). Bubbles bounce off the walls.',
    'Join two or more of the same colour to <strong>pop</strong> them — anything left hanging drops too. Every pop hits the boss (eight bubbles or more: twice).',
    `The rock creeps down: if the bubbles reach the line you lose a heart.${boss.junk ? ' The boss spits grey junk bubbles — drop them by popping what they hang from.' : ''} Hit the boss ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const B = BUBBLE;
    const g = baseGame(boss, seed);
    const palette = Array.from({ length: boss.colors }, (_, i) => i);
    Object.assign(g, {
      mode: 'bubble',
      cells: new Map(),       // 'row,col' → colour (0..colors-1, or JUNK)
      parity: 0,              // flips when a row is pushed in at the top, so bubbles keep their place
      angle: 0,               // 0 = straight up, negative = left
      current: 0, next: 0,
      shot: null,             // { x, y, vx, vy, color }
      reload: 0,
      shots: 0,
      pushIn: boss.pushEvery,
      junkIn: boss.junk ? boss.junk * 1.4 : Infinity,
      popped: [],             // recent pops / drops for drawing: { x, y, color, t, drop }
      pushes: 0,

      // --- the grid ------------------------------------------------------------
      offset(row) { return (row + this.parity) % 2 === 1; },
      colsIn(row) { return this.offset(row) ? B.cols - 1 : B.cols; },
      center(row, col) { return { x: B.left + B.r + col * 2 * B.r + (this.offset(row) ? B.r : 0), y: B.top + B.r + row * B.rowH }; },
      valid(row, col) { return row >= 0 && col >= 0 && col < this.colsIn(row); },
      neighbours(row, col) {
        const d = this.offset(row) ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
        return d.map(([dr, dc]) => [row + dr, col + dc]).filter(([r, c]) => this.valid(r, c));
      },
      lowestY() { let y = 0; for (const k of this.cells.keys()) { const [r] = k.split(',').map(Number); y = Math.max(y, this.center(r, 0).y + B.r); } return y; },
      colorsLeft() { return [...new Set([...this.cells.values()].filter(c => c !== JUNK))]; },
      drawColor() {
        const left = this.colorsLeft();
        const pool = left.length ? left : palette;
        return pool[Math.floor(this.rng() * pool.length)];
      },

      /** A fresh pile: rows of colours in runs (so there's always something to join). */
      fill(rows) {
        let color = Math.floor(this.rng() * palette.length);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < this.colsIn(row); col++) {
            if (this.rng() < 0.7) color = palette[Math.floor(this.rng() * palette.length)];
            this.cells.set(`${row},${col}`, color);
          }
        }
      },

      /** The rock creeps down a row: every bubble moves down, a new row appears at the top. */
      push() {
        const moved = new Map();
        for (const [k, c] of this.cells) { const [r, col] = k.split(',').map(Number); moved.set(`${r + 1},${col}`, c); }
        this.cells = moved;
        this.parity ^= 1;
        let color = Math.floor(this.rng() * palette.length);
        for (let col = 0; col < this.colsIn(0); col++) {
          if (this.rng() < 0.5) color = palette[Math.floor(this.rng() * palette.length)];
          this.cells.set(`0,${col}`, color);
        }
        this.pushes++;
        this.events.push({ type: 'push' });
      },

      aimAt(x, y) {
        const dx = x - B.launcher.x, dy = B.launcher.y - y;
        if (dy <= 2) return;
        this.angle = Math.max(-B.maxAngle, Math.min(B.maxAngle, Math.atan2(dx, dy)));
      },
      click(x, y) { this.aimAt(x, y); return this.fire(); },

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (FIRE.includes(code)) return this.fire();
        return null;
      },

      fire() {
        if (this.shot || this.reload > 0 || this.result !== 'playing' || this.victory > 0) return null;
        this.shot = { x: B.launcher.x, y: B.launcher.y - 4, vx: Math.sin(this.angle) * B.shotSpeed, vy: -Math.cos(this.angle) * B.shotSpeed, color: this.current };
        this.current = this.next;
        this.next = this.drawColor();
        this.shots++;
        return 'fire';
      },

      /**
       * Where a bubble shot at `angle` comes to rest: { row, col, path } (pure — the bot
       * plans with it). Walls bounce; it sticks on touching a bubble or the rock.
       */
      trace(angle, cells = this.cells) {
        let x = B.launcher.x, y = B.launcher.y - 4;
        let vx = Math.sin(angle), vy = -Math.cos(angle);
        const path = [[x, y]];
        for (let i = 0; i < 2000; i++) {
          x += vx * 2; y += vy * 2;
          if (x < B.left + B.r) { x = 2 * (B.left + B.r) - x; vx = -vx; path.push([x, y]); }
          if (x > B.right - B.r) { x = 2 * (B.right - B.r) - x; vx = -vx; path.push([x, y]); }
          if (y - B.r <= B.top || this.touches(x, y, cells)) { path.push([x, y]); return { ...this.snap(x, y, cells), path }; }
        }
        return { row: 0, col: 0, path };
      },

      /** Does a bubble at (x, y) touch one in the pile? (only the cells around it are looked at) */
      touches(x, y, cells = this.cells) {
        const row0 = Math.round((y - B.top - B.r) / B.rowH);
        for (let row = Math.max(0, row0 - 1); row <= row0 + 1; row++) {
          const col0 = Math.round((x - B.left - B.r - (this.offset(row) ? B.r : 0)) / (2 * B.r));
          for (let col = col0 - 1; col <= col0 + 1; col++) {
            if (!cells.has(`${row},${col}`)) continue;
            const p = this.center(row, col);
            if ((p.x - x) ** 2 + (p.y - y) ** 2 < (2 * B.r * 0.86) ** 2) return true;
          }
        }
        return false;
      },

      /** The nearest free cell to a point (next to the pile). */
      snap(x, y, cells = this.cells) {
        const row0 = Math.max(0, Math.round((y - B.top - B.r) / B.rowH));
        let best = null, bestD = Infinity;
        for (let row = Math.max(0, row0 - 1); row <= row0 + 1; row++) {
          for (let col = 0; col < this.colsIn(row); col++) {
            if (cells.has(`${row},${col}`)) continue;
            const p = this.center(row, col), d = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (d < bestD) { bestD = d; best = { row, col }; }
          }
        }
        return best || { row: row0, col: 0 };
      },

      /** Same-colour group through a cell (BFS). */
      group(row, col, cells = this.cells) {
        const color = cells.get(`${row},${col}`);
        if (color === undefined || color === JUNK) return [];
        const seen = new Set([`${row},${col}`]), queue = [[row, col]];
        while (queue.length) {
          const [r, c] = queue.shift();
          for (const [nr, nc] of this.neighbours(r, c)) {
            const k = `${nr},${nc}`;
            if (!seen.has(k) && cells.get(k) === color) { seen.add(k); queue.push([nr, nc]); }
          }
        }
        return [...seen];
      },

      /** Bubbles not hanging (through others) from the rock. */
      floating(cells = this.cells) {
        const held = new Set(), queue = [];
        for (const k of cells.keys()) if (k.startsWith('0,')) { held.add(k); queue.push(k.split(',').map(Number)); }
        while (queue.length) {
          const [r, c] = queue.shift();
          for (const [nr, nc] of this.neighbours(r, c)) {
            const k = `${nr},${nc}`;
            if (cells.has(k) && !held.has(k)) { held.add(k); queue.push([nr, nc]); }
          }
        }
        return [...cells.keys()].filter(k => !held.has(k));
      },

      /** Remove keys (popping or dropping), remembering them for the picture. */
      remove(keys, drop) {
        for (const k of keys) {
          const [r, c] = k.split(',').map(Number), p = this.center(r, c);
          this.popped.push({ x: p.x, y: p.y, color: this.cells.get(k), t: drop ? 0.8 : 0.3, drop, vy: 0 });
          this.cells.delete(k);
        }
      },

      land(row, col, color) {
        this.cells.set(`${row},${col}`, color);
        const group = this.group(row, col);
        if (group.length >= 3) {
          this.remove(group, false);
          const drops = this.floating();
          this.remove(drops, true);
          const total = group.length + drops.length;
          good(this, { popped: total });
          this.events.push({ type: 'pop', x: this.center(row, col).x, y: this.center(row, col).y, n: total });
          hitBoss(this, total >= 8 ? 2 : 1);
        } else if (this.shots % B.shotsPerPush === 0) this.push();
        if (!this.cells.size) this.fill(4);           // cleared the pool: the boss fills it up again
      },

      step(dt) {
        const state = tick(this, dt);
        for (const p of this.popped) { p.t -= dt; if (p.drop) { p.vy += 400 * dt; p.y += p.vy * dt; } }
        this.popped = this.popped.filter(p => p.t > 0);
        if (state !== 'play') { this.shot = null; return; }
        this.reload = Math.max(0, this.reload - dt);
        this.angle = Math.max(-B.maxAngle, Math.min(B.maxAngle, this.angle + axis(this) * B.turnSpeed * dt));
        // the flying bubble (sub-steps so it never tunnels)
        const s = this.shot;
        if (s) {
          const n = Math.ceil(B.shotSpeed * dt / 2);
          for (let i = 0; i < n && this.shot; i++) {
            s.x += s.vx * dt / n; s.y += s.vy * dt / n;
            if (s.x < B.left + B.r) { s.x = 2 * (B.left + B.r) - s.x; s.vx = -s.vx; }
            if (s.x > B.right - B.r) { s.x = 2 * (B.right - B.r) - s.x; s.vx = -s.vx; }
            if (s.y - B.r <= B.top || this.touches(s.x, s.y)) {
              const { row, col } = this.snap(s.x, s.y);
              this.shot = null;
              this.reload = B.reload;
              this.land(row, col, s.color);
            }
          }
        }
        // the rock creeps down; junk from the boss
        this.pushIn -= dt;
        if (this.pushIn <= 0) { this.push(); this.pushIn = this.boss.pushEvery; }
        this.junkIn -= dt;
        if (this.junkIn <= 0) {
          this.junkIn = this.boss.junk * (0.8 + 0.4 * this.rng());
          const spots = [];
          for (const k of this.cells.keys()) {
            const [r, c] = k.split(',').map(Number);
            for (const [nr, nc] of this.neighbours(r, c)) if (!this.cells.has(`${nr},${nc}`) && nr <= r) spots.push([nr, nc]);
          }
          for (let col = 0; col < this.colsIn(0); col++) if (!this.cells.has(`0,${col}`)) spots.push([0, col]);
          if (spots.length) { const [r, c] = spots[Math.floor(this.rng() * spots.length)]; this.cells.set(`${r},${c}`, JUNK); this.bossAttack = 0.4; this.events.push({ type: 'junk' }); }
        }
        // too low: a heart, and the lowest rows wash away
        if (this.lowestY() > B.dangerY) {
          hurt(this, { flood: true });
          const cut = B.dangerY - 3 * B.rowH;
          this.remove([...this.cells.keys()].filter(k => { const [r] = k.split(',').map(Number); return this.center(r, 0).y + B.r > cut; }), true);
          this.remove(this.floating(), true);
          if (!this.cells.size) this.fill(3);
        }
      },
    });
    g.fill(boss.rows);
    g.current = g.drawColor();
    g.next = g.drawColor();
    return g;
  },

  /**
   * Tries every angle (banked shots included), scores where each lands — bubbles popped
   * and dropped, else how well the colour fits in — and shoots the best (mouse-style aim).
   */
  bot({ lead = 0 } = {}) {
    const B = BUBBLE;
    const think = 0.45 + 4 * lead;                        // a look at the pile before each shot (people: a second or so)
    let waiting = -1, since = 0, ready = 0;               // a click on its way (humans: a beat late)
    return g => {
      if (g.shot || g.reload > 0) { ready = g.time + think; return; }
      if (g.time < ready) return;
      if (g.shots === waiting && g.time - since < 0.6) return;
      let best = null;
      for (let a = -B.maxAngle + 0.02; a <= B.maxAngle - 0.02; a += 0.025) {
        const { row, col } = g.trace(a);
        const cells = new Map(g.cells);
        cells.set(`${row},${col}`, g.current);
        const group = g.group(row, col, cells);
        let score;
        if (group.length >= 3) {
          for (const k of group) cells.delete(k);
          score = 100 + group.length * 10 + g.floating(cells).length * 14;
        } else {
          const same = g.neighbours(row, col).filter(([r, c]) => cells.get(`${r},${c}`) === g.current).length;
          score = same * 12 - row * 4;
        }
        score -= Math.abs(a) * 2;                         // straighter shots are surer
        if (!best || score > best.score) best = { a, score };
      }
      const d = 120;
      waiting = g.shots; since = g.time;
      g.click(B.launcher.x + Math.sin(best.a) * d, B.launcher.y - Math.cos(best.a) * d);
    };
  },
};
