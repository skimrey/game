/**
 * Spore Bomber — the mushroom grove's capstone: a bomb-laying chase among tree stumps.
 *
 * Step through the clearing with the arrows (or WASD, a cell per press). Press Space to set down a spore-puff: a
 * moment later it bursts in a cross, three cells each way (stumps stop the cloud, toadstools
 * burst with it and may leave a spore-puff power-up behind). Catch the boss in a burst to
 * hit it — it's quick and ducks out of lines that are about to burst, so corner it. Mind
 * your own clouds and the boss's spore-puffs: each costs a heart (the boss itself only
 * shoves past you). Later its sporelings wander out and gobble up your spore-puffs.
 */
import { baseGame, tick, good, hurt, hitBoss, directionOf } from '../kit/common.js';

export const BOMBER = {
  cols: 15, rows: 9, cell: 14, left: 55, top: 36,
  fuse: 1.7,              // s before a spore-puff bursts
  blast: 0.45,            // s the burst lingers
  range: 3,
  heroSpeed: 5.2,         // cells per second
  bossShield: 1.2,        // s the boss can't be hit again after a hit
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_KEYS = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };
const DROP = ['Space', 'Enter', 'KeyJ', 'KeyX'];

export const bomber = {
  id: 'bomber',
  name: 'Spore Bomber',
  controls: 'grid+bomb',
  rules: boss => [
    'Step from cell to cell with the <strong>arrows</strong> (or WASD) — one press, one step. Press <strong>Space</strong> to set down a spore-puff: it bursts in a <strong>cross</strong>, three cells each way.',
    'Catch the boss in a burst to hit it — it dodges lines that are about to burst, so corner it (it stops for a moment after planting its own spore-puff). Toadstools burst too.',
    `Your own clouds and the boss’s spore-puffs cost a heart.${boss.minions ? ' Its sporelings gobble up your spore-puffs — burst them!' : ''} Hit the boss ${boss.hp} times within <strong>${boss.time} seconds</strong>.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const M = BOMBER;
    const g = baseGame(boss, seed);
    const stumps = (x, y) => x === 0 || y === 0 || x === M.cols - 1 || y === M.rows - 1 || (x % 2 === 0 && y % 2 === 0);
    const start = { x: 1, y: 1 }, lair = { x: M.cols - 2, y: M.rows - 2 };
    const shrooms = new Set();
    for (let y = 1; y < M.rows - 1; y++) for (let x = 1; x < M.cols - 1; x++) {
      if (stumps(x, y) || Math.abs(x - start.x) + Math.abs(y - start.y) < 3 || Math.abs(x - lair.x) + Math.abs(y - lair.y) < 2) continue;
      if (g.rng() < boss.shrooms) shrooms.add(`${x},${y}`);
    }
    const mover = (x, y, speed) => ({ x, y, fx: x, fy: y, progress: 0, speed, dir: null });
    Object.assign(g, {
      mode: 'bomber',
      stumps, shrooms, start,
      bombs: [],              // { x, y, t, own }
      blasts: [],             // { cells: [[x, y]], t }
      hero: { ...mover(start.x, start.y, M.heroSpeed), next: null },
      foe: { ...mover(lair.x, lair.y, boss.bossSpeed), shield: 0, plan: null },
      minions: [],
      nextBossBomb: boss.bossBombEvery,
      nextMinion: boss.minions ? 6 : Infinity,
      maxBombs: 1,
      powerUps: new Set(),

      blocked(x, y, { bombs = true } = {}) {
        return stumps(x, y) || this.shrooms.has(`${x},${y}`) || (bombs && this.bombs.some(b => b.x === x && b.y === y));
      },
      /** The cells a burst at (x, y) covers. */
      cross(x, y) {
        const out = [[x, y]];
        for (const [dx, dy] of Object.values(DIRS)) {
          for (let k = 1; k <= M.range; k++) {
            const cx = x + dx * k, cy = y + dy * k;
            if (stumps(cx, cy)) break;
            out.push([cx, cy]);
            if (this.shrooms.has(`${cx},${cy}`)) break;
          }
        }
        return out;
      },
      /** Cells that will be in a burst within `within` s (or are now): Map 'x,y' → seconds until. */
      danger(within = 99, { noticed = false } = {}) {
        const out = new Map();
        const bombs = noticed ? this.bombs.filter(b => b.noticed) : this.bombs;
        // chains: a spore-puff inside an earlier burst goes off with it
        const when = new Map(bombs.map(b => [b, b.t]));
        for (let changed = true, n = 0; changed && n < 8; n++) {
          changed = false;
          for (const a of bombs) for (const [x, y] of this.cross(a.x, a.y)) for (const b of bombs) {
            if (b !== a && b.x === x && b.y === y && when.get(a) < when.get(b)) { when.set(b, when.get(a)); changed = true; }
          }
        }
        for (const b of bombs) { const t = when.get(b); if (t <= within) for (const [x, y] of this.cross(b.x, b.y)) { const k = `${x},${y}`; out.set(k, Math.min(out.get(k) ?? 99, t)); } }
        for (const bl of this.blasts) for (const [x, y] of bl.cells) out.set(`${x},${y}`, 0);
        return out;
      },
      cellOf(m) { return m.progress < 0.5 ? { x: m.x, y: m.y } : { x: m.fx, y: m.fy }; },
      pos(m) { return { x: m.x + (m.fx - m.x) * m.progress, y: m.y + (m.fy - m.y) * m.progress }; },

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        const dir = directionOf(code);
        if (dir) {                                   // one cell per press (a step in progress buffers the next)
          const h = this.hero;
          if (h.fx === h.x && h.fy === h.y) { this.stepHero(dir); } else h.next = dir;
          return 'walk';
        }
        if (!DROP.includes(code)) return null;
        const c = this.cellOf(this.hero);
        if (this.bombs.filter(b => b.own).length >= this.maxBombs || this.bombs.some(b => b.x === c.x && b.y === c.y)) return null;
        this.bombs.push({ x: c.x, y: c.y, t: M.fuse, own: true, noticed: this.rng() < this.boss.dodge });   // does the boss see this one coming?
        return 'drop';
      },

      stepHero(dir) {
        const h = this.hero, [dx, dy] = DIRS[dir];
        h.dir = dir;
        if (this.blocked(h.x + dx, h.y + dy)) return false;
        h.fx = h.x + dx; h.fy = h.y + dy; h.progress = 0;
        return true;
      },

      /** Step a mover: at a cell it picks a direction (choose()), moves one cell at a time. */
      walk(m, dt, choose, canEnter) {
        if (m.fx === m.x && m.fy === m.y) {
          const d = choose(m);
          if (d && canEnter(m.x + DIRS[d][0], m.y + DIRS[d][1])) { m.fx = m.x + DIRS[d][0]; m.fy = m.y + DIRS[d][1]; m.progress = 0; m.dir = d; }
          else return;
        }
        m.progress += m.speed * dt;
        if (m.progress >= 1) { m.x = m.fx; m.y = m.fy; m.progress = 0; }
      },

      burst(b) {
        const cells = this.cross(b.x, b.y);
        this.blasts.push({ cells, t: M.blast, hitBoss: false, hitHero: false });
        this.events.push({ type: 'burst', x: b.x, y: b.y });
        for (const [x, y] of cells) {
          const k = `${x},${y}`;
          if (this.shrooms.has(k)) {
            this.shrooms.delete(k);
            this.events.push({ type: 'shroom', x, y });
            if (b.own && this.rng() < 0.18 && this.maxBombs + this.powerUps.size < 3) this.powerUps.add(k);
          }
          // chain: a burst sets off other spore-puffs
          for (const other of this.bombs) if (other !== b && other.x === x && other.y === y) other.t = Math.min(other.t, 0.05);
        }
      },

      step(dt) {
        const state = tick(this, dt);
        for (const bl of this.blasts) bl.t -= dt;
        this.blasts = this.blasts.filter(bl => bl.t > 0);
        if (state !== 'play') return;
        const f = this.foe;
        f.shield = Math.max(0, f.shield - dt);
        // spore-puffs tick down and burst
        for (const b of this.bombs) b.t -= dt;
        for (const b of this.bombs.filter(b => b.t <= 0)) { this.bombs = this.bombs.filter(x => x !== b); this.burst(b); }
        // the hero steps cell by cell (it can step off a spore-puff it stands on)
        const h = this.hero;
        if (h.fx !== h.x || h.fy !== h.y) {
          h.progress += h.speed * dt;
          if (h.progress >= 1) {
            h.x = h.fx; h.y = h.fy; h.progress = 0;
            if (h.next) { const d = h.next; h.next = null; this.stepHero(d); }
          }
        }
        const hc = this.cellOf(this.hero);
        const pk = `${hc.x},${hc.y}`;
        if (this.powerUps.has(pk)) { this.powerUps.delete(pk); this.maxBombs++; this.events.push({ type: 'powerUp' }); }
        // the boss: keeps a few cells from the hero, ducks out of lines about to burst
        const danger = this.danger(this.boss.wary, { noticed: true });
        f.rest = Math.max(0, (f.rest || 0) - dt);
        if (f.rest <= 0 || danger.has(`${f.x},${f.y}`)) this.walk(f, dt, m => {
          const options = Object.keys(DIRS).filter(d => !this.blocked(m.x + DIRS[d][0], m.y + DIRS[d][1]));
          const safe = options.filter(d => !danger.has(`${m.x + DIRS[d][0]},${m.y + DIRS[d][1]}`));
          const hereBad = danger.has(`${m.x},${m.y}`);
          if (hereBad) {
            const flee = this.fleeFrom(m, danger);
            if (flee) return flee;
          }
          if (!hereBad && this.rng() < this.boss.pause) return null;                   // it stops to sniff the toadstools now and then
          const pool = hereBad ? options : safe.length ? safe : [];
          if (!pool.length) return null;
          const dist = d => Math.abs(m.x + DIRS[d][0] - hc.x) + Math.abs(m.y + DIRS[d][1] - hc.y);
          const here = Math.abs(m.x - hc.x) + Math.abs(m.y - hc.y);
          if (this.rng() < this.boss.chase) return pool.sort((a, b) => (here > 2 ? dist(a) - dist(b) : dist(b) - dist(a)))[0];
          return pool[Math.floor(this.rng() * pool.length)];
        }, (x, y) => !this.blocked(x, y));
        // it lays spore-puffs near the hero
        this.nextBossBomb -= dt;
        const fc = this.cellOf(f);
        if (this.nextBossBomb <= 0) {
          if (Math.abs(fc.x - hc.x) + Math.abs(fc.y - hc.y) <= 4 && !this.bombs.some(b => b.x === fc.x && b.y === fc.y)) {
            this.bombs.push({ x: fc.x, y: fc.y, t: M.fuse * 1.15, own: false, noticed: true });
            this.bossAttack = 0.4;
            f.rest = 1;                                   // it stops to admire its work: an opening
            this.nextBossBomb = this.boss.bossBombEvery * (0.8 + 0.4 * this.rng());
          } else this.nextBossBomb = 0.4;
        }
        // sporelings wander out of the boss
        this.nextMinion -= dt;
        if (this.nextMinion <= 0 && this.minions.length < 1) {
          this.minions.push({ x: fc.x, y: fc.y, fx: fc.x, fy: fc.y, progress: 0, speed: 1.8, dir: null });
          this.nextMinion = this.boss.minions;
        }
        for (const m of this.minions) this.walk(m, dt, q => {
          const opts = Object.keys(DIRS).filter(d => !this.blocked(q.x + DIRS[d][0], q.y + DIRS[d][1]) && !(q.dir && DIRS[d][0] === -DIRS[q.dir][0] && DIRS[d][1] === -DIRS[q.dir][1]));
          return opts.length ? opts[Math.floor(this.rng() * opts.length)] : Object.keys(DIRS).find(d => !this.blocked(q.x + DIRS[d][0], q.y + DIRS[d][1]));
        }, (x, y) => !this.blocked(x, y));
        // bursts: the boss, sporelings, the hero
        const hp = this.pos(this.hero);
        for (const bl of this.blasts) {
          for (const [x, y] of bl.cells) {
            const fp = this.pos(f);
            if (!bl.hitBoss && f.shield <= 0 && Math.abs(fp.x - x) < 0.6 && Math.abs(fp.y - y) < 0.6) {
              bl.hitBoss = true; f.shield = BOMBER.bossShield;
              good(this, { x, y });
              hitBoss(this);
              if (this.bossHp <= 0) return;
            }
            this.minions = this.minions.filter(m => { const p = this.pos(m); if (Math.abs(p.x - x) < 0.6 && Math.abs(p.y - y) < 0.6) { this.events.push({ type: 'pop', x, y }); return false; } return true; });
            if (Math.abs(hp.x - x) < 0.55 && Math.abs(hp.y - y) < 0.55) {
              if (hurt(this, { burst: true }) && this.result !== 'playing') return;
            }
          }
        }
        // sporelings gobble up the spore-puffs they walk over (yours fizzle out)
        for (const m of this.minions) {
          const gone = this.bombs.filter(b => b.own && b.x === m.x && b.y === m.y && m.progress < 0.2);
          if (gone.length) { this.bombs = this.bombs.filter(b => !gone.includes(b)); this.events.push({ type: 'fizzle', x: m.x, y: m.y }); }
        }
      },

      /** The first step toward the nearest cell out of danger (BFS), or null. */
      fleeFrom(m, danger, blockedAt = (x, y) => this.blocked(x, y)) {
        const seen = new Map([[`${m.x},${m.y}`, null]]), queue = [[m.x, m.y, 0]];
        while (queue.length) {
          const [x, y, n] = queue.shift();
          if (!danger.has(`${x},${y}`)) {
            let k = `${x},${y}`, first = null;
            while (seen.get(k)) { const [px, py, d] = seen.get(k); first = d; k = `${px},${py}`; }
            return first;
          }
          if (n > 8) continue;
          for (const [d, [dx, dy]] of Object.entries(DIRS)) {
            const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
            if (seen.has(k) || blockedAt(nx, ny)) continue;
            seen.set(k, [x, y, d]);
            queue.push([nx, ny, n + 1]);
          }
        }
        return null;
      },
    });
    return g;
  },

  /**
   * Out of danger first (to the nearest cell no burst will reach in time); else, with the
   * boss in a line within reach and a way out afterwards, drop a spore-puff; else walk
   * toward the boss (bursting toadstools that block the way).
   */
  bot({ lead = 0 } = {}) {
    const M = BOMBER;
    let pending = null;                                   // a step pressed but not taken yet (hands are a beat late)
    const hold = (g, d) => {
      if (!d) return;
      const h = g.hero;
      if (pending && pending.x === h.x && pending.y === h.y && pending.fx === h.fx && pending.fy === h.fy && g.time - pending.at < 0.5) return;
      pending = { x: h.x, y: h.y, fx: h.fx, fy: h.fy, at: g.time };
      g.press(DIR_KEYS[d][0]);
    };
    return g => {
      const h = g.hero;
      if (h.fx !== h.x || h.fy !== h.y) {
        if (h.progress < 0.6 || h.next) return;           // mid-step: plan the next one near the end
      }
      const at = { x: h.fx, y: h.fy };
      const danger = g.danger();
      const near = new Set();                                                               // keep a cell clear of sporelings
      for (const m of g.minions) for (const [x, y] of [[m.x, m.y], [m.fx, m.fy]]) near.add(`${x},${y}`);
      const bfs = (goal, avoid = danger, blockedAt = (x, y) => g.blocked(x, y) || near.has(`${x},${y}`)) => {
        const seen = new Map([[`${at.x},${at.y}`, null]]), queue = [[at.x, at.y, 0]];
        while (queue.length) {
          const [x, y, n] = queue.shift();
          if (goal(x, y, n)) {
            let k = `${x},${y}`, first = null;
            while (seen.get(k)) { const [px, py, d] = seen.get(k); first = d; k = `${px},${py}`; }
            return { first, n, x, y };
          }
          for (const [d, [dx, dy]] of Object.entries(DIRS)) {
            const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
            if (seen.has(k) || blockedAt(nx, ny)) continue;
            const until = avoid.get(k);
            const arrive = (n + 1) / M.heroSpeed + lead;
            if (until !== undefined && until < arrive + M.blast + 0.2 && until > arrive - 0.35) continue;    // don't walk into a burst
            seen.set(k, [x, y, d]);
            queue.push([nx, ny, n + 1]);
          }
        }
        return null;
      };
      // 1. in danger: get out
      if (danger.has(`${at.x},${at.y}`) || near.has(`${at.x},${at.y}`)) {
        const out = bfs((x, y) => !danger.has(`${x},${y}`) && !near.has(`${x},${y}`)) || bfs((x, y) => !danger.has(`${x},${y}`), danger, (x, y) => g.blocked(x, y));
        hold(g, out?.first ?? null);
        return;
      }
      const f = g.foe;
      const inLine = (x, y) => g.cross(x, y).some(([cx, cy]) => (cx === f.x && cy === f.y) || (cx === f.fx && cy === f.fy));
      const canBomb = g.bombs.filter(b => b.own).length < g.maxBombs && !g.bombs.some(b => b.x === at.x && b.y === at.y);
      const escape = () => {
        const after = new Map(danger);
        for (const [x, y] of g.cross(at.x, at.y)) after.set(`${x},${y}`, Math.min(after.get(`${x},${y}`) ?? 99, M.fuse));
        return bfs((x, y, n) => !after.has(`${x},${y}`) && !near.has(`${x},${y}`) && n / M.heroSpeed + lead + 0.25 < M.fuse, after);
      };
      // 2. the boss in a line: drop one (if there's a way out)
      if (canBomb && g.foe.shield <= 0 && inLine(at.x, at.y)) {
        if (h.fx !== h.x || h.fy !== h.y) return;          // about to arrive on a good cell: stop there
        if (escape()) { g.press('Space'); return; }
      }
      // 3. walk toward a cell that lines up with the boss
      const target = bfs((x, y, n) => n > 0 && inLine(x, y));
      if (target) { hold(g, target.first); return; }
      // 4. boxed off by toadstools: find the way to the boss through them, burst the first one in the way
      const seen = new Map([[`${at.x},${at.y}`, null]]), queue = [[at.x, at.y]];
      let goal = null;
      while (queue.length && !goal) {
        const [x, y] = queue.shift();
        for (const [dx, dy] of Object.values(DIRS)) {
          const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
          if (seen.has(k) || g.stumps(nx, ny)) continue;
          seen.set(k, [x, y]);
          if (inLine(nx, ny)) { goal = k; break; }
          queue.push([nx, ny]);
        }
      }
      let spot = null;
      if (goal) {
        const path = [];
        for (let k = goal; k; k = seen.get(k) && `${seen.get(k)[0]},${seen.get(k)[1]}`) path.unshift(k);
        const i = path.findIndex(k => g.shrooms.has(k));
        if (i > 0) spot = path[i - 1].split(',').map(Number);
      }
      if (spot && spot[0] === at.x && spot[1] === at.y) {
        if (canBomb && h.fx === h.x && h.fy === h.y && escape()) g.press('Space');
        return;
      }
      const walk = spot ? bfs((x, y) => x === spot[0] && y === spot[1]) : null;
      hold(g, walk?.first ?? null);
    };
  },
};
