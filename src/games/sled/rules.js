/**
 * Avalanche Run — the alpine capstone: a top-down sled chase.
 *
 * The hero sleds down the mountain with the boss (a yeti-ish brute) chasing from
 * above. Steer between three lanes with ← → (or A / D) around trees, rocks and
 * snowmen, and dodge the snowballs the boss lobs at your lane (watch the shadow).
 * Steer onto a ramp to launch off it: a spinning trick in the air (the world
 * recolours) and a snowball thrown back into the boss. Obstacles and snowballs cost
 * hearts; while airborne you fly over everything. No typing — it's all steering.
 */
import { baseGame, tick, good, hurt, hitBoss } from '../kit/common.js';

export const SLED = {
  lanes: [112, 160, 208],
  heroY: 66,
  laneSpeed: 340,       // px/s sideways (one lane in ~0.14 s)
  air: 0.8,             // s airborne after a ramp
  rampWindow: [-8, 8],  // ramp y − hero y while it launches you
  hitW: 15, hitH: 9,    // obstacle collision half-extents
  snowballFlight: 1.15, // s from the boss's throw to landing
  snowballTime: 0.5,    // s for the hero's snowball to reach the boss
  spawnY: 196,
  rowGap: 70,           // px of travel between rows of obstacles
  bossY: 24,
};

const STEER = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const OBSTACLES = ['tree', 'tree', 'rock', 'snowman'];

export const sled = {
  id: 'sled',
  name: 'Avalanche Run',
  rules: boss => [
    'Steer with <strong>← →</strong> (or A / D) between the lanes — dodge trees, rocks and the boss’s snowballs (watch for their shadows).',
    '<strong>Ride over a ramp</strong> to launch: a trick in the air, and a snowball into the boss.',
    `Hit the boss ${boss.hp} times before <strong>${boss.time} seconds</strong> are up.`,
  ],

  create(boss, { seed = 1 } = {}) {
    const S = SLED;
    const g = baseGame(boss, seed);
    Object.assign(g, {
      mode: 'sled',
      lane: 1,
      x: S.lanes[1],
      airborne: 0, spin: 0,
      wobble: 0,
      travelled: 0,
      nextRow: 40,
      rows: 0,
      objects: [],        // { kind: tree|rock|snowman|ramp, lane, x, y, key?, used?, spent? }
      snowballs: [],      // boss → hero: { lane, x, t, flight }
      throws: [],         // hero → boss: { t, from: [x, y] }
      bossX: S.lanes[1],
      nextThrow: 2.4,

      press(code) {
        if (this.result !== 'playing' || this.victory > 0) return null;
        if (code in STEER) {
          this.lane = Math.max(0, Math.min(S.lanes.length - 1, this.lane + STEER[code]));
          return 'steer';
        }
        return null;
      },

      launch(ramp) {
        ramp.used = true;
        this.airborne = S.air;
        this.spin = 0;
        this.throws.push({ t: 0, from: [this.x, S.heroY] });
        good(this);
      },

      onRamp(o) {
        const dy = o.y - S.heroY;
        return dy >= S.rampWindow[0] && dy <= S.rampWindow[1] && Math.abs(o.x - this.x) < 16;
      },

      step(dt) {
        const state = tick(this, dt);
        if (state === 'over') return;
        // the hero slides toward the chosen lane
        const tx = S.lanes[this.lane];
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), S.laneSpeed * dt);
        if (this.airborne > 0) { this.airborne = Math.max(0, this.airborne - dt); this.spin = 1 - this.airborne / S.air; }
        this.wobble = Math.max(0, this.wobble - dt);
        this.bossX += (this.x - this.bossX) * Math.min(1, dt * 1.5);
        const speed = this.boss.speed * (1 + 0.15 * (1 - this.timeLeft / this.boss.time));
        for (const o of this.objects) o.y -= speed * dt;
        this.objects = this.objects.filter(o => o.y > -24);
        for (const o of this.objects) if (o.kind === 'ramp' && !o.used && this.airborne <= 0 && this.onRamp(o)) this.launch(o);
        if (state === 'celebrate') { this.snowballs = []; return; }

        // new rows of obstacles (and ramps) scroll up from below
        this.travelled += speed * dt;
        if (this.travelled >= this.nextRow) { this.nextRow += S.rowGap; this.spawnRow(); }

        // collisions
        if (this.airborne <= 0) {
          for (const o of this.objects) {
            if (o.kind === 'ramp' || o.spent) continue;
            if (Math.abs(o.x - this.x) < S.hitW && Math.abs(o.y - S.heroY) < S.hitH) {
              o.spent = true;
              if (hurt(this, { crash: o.kind })) this.wobble = 0.3;
              if (this.result !== 'playing') return;
            }
          }
        }
        // the boss lobs snowballs at your lane
        this.nextThrow -= dt;
        if (this.nextThrow <= 0) {
          // at your lane — unless it's the only way through a row arriving as it lands: then a
          // warning shot beside you (there's always an escape)
          const speedNow = this.boss.speed * (1 + 0.15 * (1 - this.timeLeft / this.boss.time));
          const arriving = this.objects.filter(o => o.kind !== 'ramp' && Math.abs((o.y - S.heroY) / speedNow - S.snowballFlight) < 0.5);
          let lane = this.lane;
          const rows = [...new Set(arriving.map(o => Math.round(o.y)))];
          const trapped = rows.some(y => { const full = new Set(arriving.filter(o => Math.abs(o.y - y) < 20).map(o => o.lane)); return full.size >= S.lanes.length - 1 && !full.has(lane); });
          if (trapped) lane = lane === 1 ? (this.rng() < 0.5 ? 0 : 2) : 1;
          this.snowballs.push({ lane, x: S.lanes[lane], t: 0, flight: S.snowballFlight });
          this.bossAttack = 0.4;
          this.nextThrow = this.boss.throwEvery * (0.8 + 0.4 * this.rng());
        }
        for (const b of this.snowballs) {
          b.t += dt;
          if (b.t >= b.flight && !b.done) {
            b.done = true;
            if (this.airborne <= 0 && Math.abs(this.x - b.x) < 18) hurt(this, { snowball: true });
            this.events.push({ type: 'splat', x: b.x, y: S.heroY });
            if (this.result !== 'playing') return;
          }
        }
        this.snowballs = this.snowballs.filter(b => !b.done);
        for (const t of this.throws) {
          t.t += dt / S.snowballTime;
          if (t.t >= 1 && !t.done) { t.done = true; hitBoss(this); }
        }
        this.throws = this.throws.filter(t => !t.done);
      },

      spawnRow() {
        const rng = this.rng;
        const n = S.lanes.length;
        this.rows++;
        const y = S.spawnY;
        const row = [];
        const rampRow = this.rows % this.boss.rampEvery === 0;
        if (rampRow) {
          const lane = Math.floor(rng() * n);
          row.push({ kind: 'ramp', lane });
          if (rng() < this.boss.busy) {                      // sometimes a tree beside the ramp
            const other = (lane + 1 + Math.floor(rng() * (n - 1))) % n;
            row.push({ kind: OBSTACLES[Math.floor(rng() * OBSTACLES.length)], lane: other });
          }
        } else {
          const count = rng() < this.boss.busy ? 2 : 1;       // never all three lanes
          // the first obstacle often aims at your lane: standing still is not safe
          const first = rng() < 0.55 ? this.lane : Math.floor(rng() * n);
          const lanes = [first];
          if (count === 2) {
            let second = (first + 1 + Math.floor(rng() * (n - 1))) % n;
            // the open lane is never two lanes away from you: one quick steer always does it
            const open = [0, 1, 2].find(l => l !== first && l !== second);
            if (Math.abs(open - this.lane) > 1) second = open;
            lanes.push(second);
          }
          for (const lane of lanes) row.push({ kind: OBSTACLES[Math.floor(rng() * OBSTACLES.length)], lane });
        }
        for (const o of row) this.objects.push({ ...o, x: S.lanes[o.lane], y });
      },
    });
    return g;
  },

  /**
   * A careful player: heads for the next ramp when that lane is safe, otherwise the
   * nearest safe lane; launches off ramps; sidesteps incoming snowballs.
   */
  bot({ lead = 0 } = {}) {
    const S = SLED;
    let asked = null, clock = 0;            // a steer we've pressed but haven't seen happen yet
    return (g, dt = 1 / 120) => {
      clock += dt;
      if (asked && (g.lane === asked.lane || clock > asked.until)) asked = null;
      if (asked) return;                     // we know what we pressed: wait to see it
      const lanes = S.lanes.map((_, i) => i);
      const laneOf = x => lanes.reduce((best, i) => Math.abs(S.lanes[i] - x) < Math.abs(S.lanes[best] - x) ? i : best, 0);
      // distance to the next obstacle ahead in a lane (px), Infinity if clear
      const clearance = lane => Math.min(Infinity, ...g.objects.filter(o => o.kind !== 'ramp' && !o.spent && o.lane === lane && o.y - S.heroY > -S.hitH - 1).map(o => o.y - S.heroY));
      // a snowball about to land in a lane — unless a ramp there lifts us clear first
      const ball = lane => g.snowballs.some(b => b.lane === lane && b.flight - b.t < 0.5 + lead
        && !g.objects.some(o => o.kind === 'ramp' && !o.used && o.lane === lane && o.y >= S.heroY - 2 && (o.y - S.heroY) / g.boss.speed < b.flight - b.t - 0.05));
      const margin = lead * g.boss.speed;                     // a slower player looks further ahead
      const safe = (lane, near) => clearance(lane) > near + margin && !(ball(lane) && g.airborne < 0.45);
      const ramp = g.objects.filter(o => o.kind === 'ramp' && !o.used && o.y - S.heroY > S.rampWindow[0]).sort((a, b) => a.y - b.y)[0];
      if (Math.abs(g.x - S.lanes[g.lane]) > 1) return;              // still moving
      const here = laneOf(g.x);
      const reachable = lane => lane === here || (lanes.filter(l => (l - here) * (l - lane) <= 0 && l !== here).every(l => safe(l, 24 + (l !== lane ? margin * 2 : 0))));
      let target = here;
      const score = lane => Math.min(clearance(lane), 200) - (ball(lane) ? 300 : 0) - Math.abs(lane - here) * 5;
      if (ramp && ramp.y - S.heroY < 110 && safe(ramp.lane, Math.max(24, ramp.y - S.heroY + 12)) && reachable(ramp.lane)) target = ramp.lane;
      else if (!safe(here, 60)) target = lanes.filter(reachable).sort((a, b) => score(b) - score(a))[0] ?? here;
      if (target !== here && g.press(target < here ? 'ArrowLeft' : 'ArrowRight')) asked = { lane: here + Math.sign(target - here), until: clock + lead + 0.25 };
    };
  },
};
