/**
 * Maze Muncher — a checkpoint game (or a boss game: the boss haunts the maze).
 *
 * Steer through a maze with the arrows (or WASD) and gobble the gems. Ghost-critters
 * roam: touching one costs a heart (and sends you back to the start). The big glowing
 * gems make them run scared for a few seconds — touch them then to zap them (they
 * respawn in the middle). Every gem recolours the world. In the boss version the boss
 * roams too: power up and catch it.
 */
import { baseGame, tick, good, hurt, hitBoss, directionOf } from './common.js';

export const MAZE = {
  cols: 19, rows: 11, cell: 14, left: 27, top: 20,
  power: 5,              // s the ghosts stay scared
};

// a hand-drawn maze ('#' wall, '.' gem, 'o' power gem, ' ' empty, 'S' start, 'G' ghost home)
const LAYOUT = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...G...#....#',
  '##.#.###.#.###.#.##',
  '#..#.....S.....#..#',
  '#.####.##.##.####.#',
  '#o...............o#',
  '###################',
];

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const maze = {
  id: 'maze',
  name: 'Maze Muncher',
  controls: 'maze',
  roles: ['checkpoint', 'boss'],
  rules: boss => [
    'Steer with the <strong>arrows</strong> (or WASD) and gobble the gems — every gem recolours the world.',
    'Ghost-critters roam: touching one costs a heart. <strong>Big gems</strong> scare them for a few seconds — catch them then!',
    ...(boss.kind === 'checkpoint' ? [] : ['The boss can’t hurt you — but it only stops to be caught while the big gem’s glow lasts (big gems come back).']),
    boss.kind === 'checkpoint' ? `Gobble ${boss.hp} gems within <strong>${boss.time} seconds</strong>.` : `The boss haunts the maze: power up and catch it ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const M = MAZE;
    const g = baseGame(boss, seed);
    const bossGame = boss.kind !== 'checkpoint';
    const walls = LAYOUT.map(row => [...row].map(ch => ch === '#'));
    const gems = new Map();
    let start = null, home = null;
    LAYOUT.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') gems.set(`${x},${y}`, 'gem');
      if (ch === 'o') gems.set(`${x},${y}`, 'power');
      if (ch === 'S') start = { x, y };
      if (ch === 'G') home = { x, y };
    }));
    const open = (x, y) => x >= 0 && y >= 0 && x < M.cols && y < M.rows && !walls[y][x];
    const mover = (x, y, speed) => ({ x, y, fx: x, fy: y, dir: null, want: null, speed, progress: 0 });
    Object.assign(g, {
      mode: 'maze',
      walls, gems, start, home, open,
      hero: mover(start.x, start.y, boss.heroSpeed),
      ghosts: Array.from({ length: boss.ghosts }, (_, i) => ({ ...mover(home.x, home.y, boss.ghostSpeed), delay: 1 + i * 2.2, scaredUntil: 0 })),
      foe: bossGame ? { ...mover(home.x, home.y - 0, boss.ghostSpeed * 0.95), delay: 3, boss: true } : null,
      scared: 0,
      eaten: 0,

      press(code) {
        const d = directionOf(code);
        if (d) { this.hero.want = d; return 'steer'; }
        return null;
      },

      /** Step a mover along the grid: cells at a time, choosing a new direction at each cell. */
      advance(m, dt, choose) {
        m.progress += m.speed * dt;
        while (m.progress >= 1) {
          m.progress -= 1;
          m.x = m.fx; m.y = m.fy;
          const dir = choose(m);
          m.dir = dir;
          if (dir && open(m.x + DIRS[dir][0], m.y + DIRS[dir][1])) { m.fx = m.x + DIRS[dir][0]; m.fy = m.y + DIRS[dir][1]; }
          else { m.fx = m.x; m.fy = m.y; m.progress = 0; break; }
        }
      },

      pos(m) { return { x: m.x + (m.fx - m.x) * m.progress, y: m.y + (m.fy - m.y) * m.progress }; },

      step(dt) {
        const state = tick(this, dt);
        if (state !== 'play') return;
        this.scared = Math.max(0, this.scared - dt);
        // the hero: turn as soon as the wanted direction is open, else keep going
        this.advance(this.hero, dt, m => (m.want && open(m.x + DIRS[m.want][0], m.y + DIRS[m.want][1]) ? m.want : m.dir));
        if (this.hero.fx === this.hero.x && this.hero.fy === this.hero.y && this.hero.want && open(this.hero.x + DIRS[this.hero.want][0], this.hero.y + DIRS[this.hero.want][1])) {
          this.hero.fx = this.hero.x + DIRS[this.hero.want][0]; this.hero.fy = this.hero.y + DIRS[this.hero.want][1]; this.hero.dir = this.hero.want;
        }
        // gems where the hero stands
        const key = `${this.hero.x},${this.hero.y}`;
        if (this.gems.has(key)) {
          const kind = this.gems.get(key);
          this.gems.delete(key);
          this.eaten++;
          good(this, { gem: kind });
          if (!bossGame) hitBoss(this);
          if (kind === 'power') { this.scared = MAZE.power * (bossGame ? 1.5 : 1); this.events.push({ type: 'power' }); }
          if (this.gems.size === 0) LAYOUT.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.' || ch === 'o') this.gems.set(`${x},${y}`, ch === 'o' ? 'power' : 'gem'); }));
        }
        // boss version: the big gems come back, so there's always another chance to catch it
        if (bossGame && ![...this.gems.values()].includes('power')) {
          this.powerBack = (this.powerBack ?? 6) - dt;
          if (this.powerBack <= 0) {
            const spots = [];
            LAYOUT.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'o') spots.push(`${x},${y}`); }));
            this.gems.set(spots[Math.floor(this.rng() * spots.length)], 'power');
            this.powerBack = 6;
          }
        }
        // ghosts (and the boss) wander, chasing the hero at junctions, fleeing when scared
        const hp = this.pos(this.hero);
        for (const m of [...this.ghosts, ...(this.foe ? [this.foe] : [])]) {
          if (m.delay > 0) { m.delay -= dt; continue; }
          const speed = this.scared > 0 ? m.speed * (m.boss ? 0.45 : 0.6) : m.speed;
          const saved = m.speed; m.speed = speed;
          this.advance(m, dt, q => {
            const options = Object.keys(DIRS).filter(d => open(q.x + DIRS[d][0], q.y + DIRS[d][1]) && !(q.dir && DIRS[d][0] === -DIRS[q.dir][0] && DIRS[d][1] === -DIRS[q.dir][1]));
            if (!options.length) return Object.keys(DIRS).find(d => open(q.x + DIRS[d][0], q.y + DIRS[d][1]));
            const dist = d => Math.abs(q.x + DIRS[d][0] - this.hero.x) + Math.abs(q.y + DIRS[d][1] - this.hero.y);
            if (this.rng() < this.boss.chase) return options.sort((a, b) => (this.scared > 0 ? dist(b) - dist(a) : dist(a) - dist(b)))[0];
            return options[Math.floor(this.rng() * options.length)];
          });
          m.speed = saved;
          const p = this.pos(m);
          if (Math.hypot(p.x - hp.x, p.y - hp.y) < 0.6) {
            if (this.scared > 0) {
              Object.assign(m, { x: this.home.x, y: this.home.y, fx: this.home.x, fy: this.home.y, progress: 0, delay: 1.5, dir: null });
              good(this, { zap: true });
              this.events.push({ type: 'zap', boss: !!m.boss });
              if (m.boss) hitBoss(this);
            } else if (!m.boss && hurt(this, { caught: true })) {   // (the boss itself is harmless — just slippery)
              Object.assign(this.hero, { x: this.start.x, y: this.start.y, fx: this.start.x, fy: this.start.y, progress: 0, dir: null, want: null });
              if (this.result !== 'playing') return;
            }
          }
        }
      },
    });
    return g;
  },

  /**
   * Heads (breadth-first) for the nearest gem — or, when the ghosts are scared in the boss
   * version, the boss — keeping clear of ghosts that aren't.
   */
  bot() {
    return g => {
      const h = g.hero;
      const danger = new Set();
      if (g.scared <= 1.5) for (const m of g.ghosts) {
        if (m.delay > 0.3) continue;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) <= 2) { danger.add(`${m.x + dx},${m.y + dy}`); danger.add(`${m.fx + dx},${m.fy + dy}`); }
      }
      // boss version: grab a power gem, then hunt the boss while it's scared
      const goal = (x, y) => {
        if (g.foe && g.scared > 0.8) return (x === g.foe.fx && y === g.foe.fy) || (x === g.foe.x && y === g.foe.y);
        if (g.foe && [...g.gems.values()].includes('power')) return g.gems.get(`${x},${y}`) === 'power';
        return g.gems.has(`${x},${y}`);
      };
      // plan from the cell we're about to reach (that's where the next turn happens)
      const sx = h.fx, sy = h.fy;
      const seen = new Map([[`${sx},${sy}`, null]]);
      const queue = [[sx, sy]];
      let found = null;
      while (queue.length && !found) {
        const [x, y] = queue.shift();
        for (const [d, [dx, dy]] of Object.entries(DIRS)) {
          const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
          if (!g.open(nx, ny) || seen.has(k) || danger.has(k)) continue;
          seen.set(k, [x, y, d]);
          if (goal(nx, ny)) { found = k; break; }
          queue.push([nx, ny]);
        }
      }
      if (!found) {
        // boxed in by danger: step to the open neighbour farthest from the nearest live ghost
        const threats = g.scared > 1.5 ? [] : g.ghosts.filter(m => m.delay <= 0.3);
        if (!threats.length) return;
        let bestDir = null, bestD = -1;
        for (const [d, [dx, dy]] of Object.entries(DIRS)) {
          const nx = sx + dx, ny = sy + dy;
          if (!g.open(nx, ny)) continue;
          const dist = Math.min(...threats.map(m => Math.abs(m.fx - nx) + Math.abs(m.fy - ny)));
          if (dist > bestD) { bestD = dist; bestDir = d; }
        }
        if (bestDir && bestDir !== h.want) g.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[bestDir]);
        return;
      }
      let k = found, first = null;
      while (seen.get(k)) { const [px, py, d] = seen.get(k); first = d; k = `${px},${py}`; }
      if (first && first !== h.want) g.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[first]);
    };
  },
};
