/**
 * The rules of the newer mini-games: the Blade Duel and the capstones of the zones beyond
 * the classic four (Bubble Pop, Spore Bomber, Lava Guard, Shard Storm).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bossStats } from '../src/progression/bosses.js';
import { MODES, rolesOf, CAPSTONES } from '../src/games/index.js';
import { PARRY } from '../src/games/parry/rules.js';
import { BUBBLE } from '../src/games/bubble/rules.js';
import { BOMBER } from '../src/games/bomber/rules.js';
import { LAVAGUARD } from '../src/games/lavaguard/rules.js';
import { SHARDS } from '../src/games/shards/rules.js';
import { ZONES } from '../src/world/zones.js';

const DT = 1 / 120;
const make = (mode, d = 0.3, kind = rolesOf(mode).includes('boss') ? 'boss' : rolesOf(mode)[0], seed = 1) => MODES[mode].create({ mode, kind, ...bossStats(mode, d, () => 0.5, 0, 0, kind) }, { seed });
const step = (g, seconds, each = null) => { for (let t = 0; t < seconds; t += DT) { each?.(g); g.step(DT); } };
const until = (g, cond, limit = 20) => { while (!cond(g) && g.time < limit) g.step(DT); return cond(g); };

test('every zone has its own capstone game, and it is a boss game', () => {
  for (const zone of Object.values(ZONES)) {
    assert.equal(CAPSTONES[zone.id], zone.capstone);
    assert.ok(MODES[zone.capstone], zone.capstone);
    assert.ok(rolesOf(zone.capstone).includes('boss'));
  }
});

test('blade duel: guard the height the glint shows to block, then Space parries; three parries win', () => {
  const g = make('parry', 0.2);
  assert.ok(until(g, x => x.foe.phase === 'windup'));
  // guard the wrong height: the strike lands
  const wrongKey = g.foe.target === 'high' ? 'ArrowDown' : 'ArrowUp';
  g.held.add(wrongKey);
  assert.ok(until(g, x => x.hearts < 3), 'an unblocked strike costs a heart');
  g.held.clear();
  // swinging at nothing throws you off balance
  assert.equal(g.press('Space'), 'whiff');
  assert.ok(g.offBalance > 0);
  // guard right: blocked, staggered, parried
  const guard = x => { x.held.clear(); if (x.foe.target === 'high') x.held.add('ArrowUp'); if (x.foe.target === 'low') x.held.add('ArrowDown'); };
  for (let parries = 0; parries < 3; parries++) {
    assert.ok(until(g, x => { if (x.foe.phase === 'windup') guard(x); return x.foe.phase === 'stagger' && x.offBalance <= 0; }, g.time + 20), `block ${parries + 1}`);
    assert.equal(g.press('Space'), 'parry');
  }
  assert.equal(g.bossHp, 0);
  step(g, 2);
  assert.equal(g.result, 'won');
  assert.equal(PARRY.heights.length, 3);
});

test('blade duel: later duels feint — the glint jumps to another height with time left to follow it', () => {
  const g = make('parry', 0.95, 'boss', 4);
  let feint = null;
  const events = [];
  until(g, x => { for (const e of x.drain()) events.push(e); if (!feint && events.some(e => e.type === 'feint')) feint = { left: x.foe.t, base: x.foe.base }; return !!feint; }, 60);
  assert.ok(feint, 'a feint happens');
  assert.ok(feint.left >= feint.base * 0.6, `${feint.left.toFixed(2)} s left to follow it`);
});

test('bubble pop: three of a colour pop (and what hangs from them drops); the rock creeps down; the line costs a heart', () => {
  const g = make('bubble', 0.2);
  const hp = g.bossHp;
  g.cells.clear();
  // two reds hanging from the rock, shoot a third under them (a blue stays behind)
  g.cells.set('0,4', 0); g.cells.set('0,5', 0); g.cells.set('0,0', 1); g.cells.set('1,0', 1);
  g.current = 0;
  g.angle = Math.atan2(g.center(0, 4).x + BUBBLE.r - BUBBLE.launcher.x, BUBBLE.launcher.y - g.center(0, 4).y);
  assert.equal(g.fire(), 'fire');
  assert.ok(until(g, x => !x.shot, 5));
  assert.ok(g.bossHp < hp, 'the pop hits the boss');
  assert.ok(![...g.cells.values()].includes(0), 'the reds are gone');
  // a lonely bubble not touching the rock drops
  g.cells.clear(); g.cells.set('0,0', 2); g.cells.set('1,0', 1); g.cells.set('1,1', 1); g.cells.set('2,0', 3);
  g.land(0, 1, 2); // no pop (two 2s only) — nothing drops
  assert.equal(g.cells.size, 5);
  // the rock creeps down
  const n = g.pushes;
  step(g, g.boss.pushEvery + 0.1);
  assert.ok(g.pushes > n, 'the rock crept down');
  // flood the pool: a heart
  for (let r = 0; r < 12; r++) for (let c = 0; c < g.colsIn(r); c++) g.cells.set(`${r},${c}`, (r + c) % 4);
  step(g, DT * 2);
  assert.equal(g.hearts, 2);
  assert.ok(g.lowestY() <= BUBBLE.dangerY, 'the lowest rows washed away');
});

test('bubble pop: the aim trace bounces off the walls and lands next to the pile', () => {
  const g = make('bubble', 0.5);
  const { row, col, path } = g.trace(-1.2);
  assert.ok(path.length >= 3, 'a banked shot bounces');
  assert.ok(g.valid(row, col) && !g.cells.has(`${row},${col}`));
});

test('spore bomber: a spore-puff bursts in a cross (stumps stop it); the boss caught in it is hit; your own cloud hurts', () => {
  const g = make('bomber', 0.1);
  g.shrooms.clear();
  const cells = g.cross(3, 3).map(([x, y]) => `${x},${y}`);
  assert.ok(cells.includes('3,3') && cells.includes('6,3') && cells.includes('3,6'));
  assert.ok(!cells.includes('4,4'), 'diagonals stay clear');
  assert.ok(!g.cross(1, 1).some(([x, y]) => x === 0 || y === 0), 'the border stumps stop it');
  // the boss stands in the line
  Object.assign(g.foe, { x: 4, y: 1, fx: 4, fy: 1, progress: 0, rest: 99 });
  g.nextBossBomb = 99;
  assert.equal(g.press('Space'), 'drop');
  g.bombs[0].noticed = false;                                   // the boss doesn't see this one coming
  assert.equal(g.press('Space'), null, 'one spore-puff at a time (until a power-up)');
  g.press('ArrowDown'); g.press('ArrowDown');
  const hp = g.bossHp;
  step(g, BOMBER.fuse + 0.1);
  assert.equal(g.bossHp, hp - 1, 'caught in the burst');
  // standing in your own burst
  const h = make('bomber', 0.1, 'boss', 2);
  h.nextBossBomb = 99;
  h.press('Space');
  step(h, BOMBER.fuse + 0.1);
  assert.equal(h.hearts, 2);
});

test('spore bomber: one press, one step; the boss only shoves past; sporelings gobble spore-puffs', () => {
  const g = make('bomber', 0.9);
  g.shrooms.clear();
  g.press('ArrowRight');
  step(g, 0.5);
  assert.deepEqual([g.hero.x, g.hero.y], [2, 1], 'a tap moves exactly one cell');
  Object.assign(g.foe, { x: 2, y: 1, fx: 2, fy: 1, rest: 99 });
  step(g, 0.2);
  assert.equal(g.hearts, 3, 'touching the boss is harmless');
  g.bombs.push({ x: 5, y: 5, t: 9, own: true });
  g.minions.push({ x: 5, y: 5, fx: 5, fy: 5, progress: 0, speed: 0, dir: null });
  step(g, DT * 2);
  assert.ok(!g.bombs.some(b => b.x === 5 && b.y === 5), 'gobbled');
});

test('lava guard: a splash douses the bombs it catches (each one hits the boss); a bomb on a hut costs a heart', () => {
  const g = make('lavaguard', 0.3);
  g.nextBomb = 99;
  g.lob(LAVAGUARD.crater, LAVAGUARD.huts[0]);
  const b = g.bombs[0];
  step(g, 0.5);
  // aim where it will be when the shot lands
  const t = Math.hypot(b.x - LAVAGUARD.cannon.x, b.y - LAVAGUARD.cannon.y) / LAVAGUARD.shotSpeed + 0.1;
  g.aimAt(b.x + b.vx * t, b.y + b.vy * t);
  assert.equal(g.fire(), 'fire');
  const hp = g.bossHp;
  step(g, 1.2);
  assert.equal(g.bossHp, hp - 1, 'doused');
  assert.equal(g.bombs.length, 0);
  g.lob(LAVAGUARD.crater, LAVAGUARD.huts[2]);
  assert.ok(until(g, x => x.hearts < 3, 30));
  assert.ok(g.burning[2] > 0, 'the hut is alight');
});

test('lava guard: later bombs split in two on the way down; three shots in the air at most', () => {
  const g = make('lavaguard', 0.95);
  g.nextBomb = 99;
  g.boss.split = 1;
  g.lob();
  assert.ok(until(g, x => x.bombs.length === 2, 10), 'split');
  g.aimAt(16, 28);
  assert.equal(g.fire(), 'fire'); step(g, LAVAGUARD.reload + DT);
  assert.equal(g.fire(), 'fire'); step(g, LAVAGUARD.reload + DT);
  assert.equal(g.fire(), 'fire'); step(g, LAVAGUARD.reload + DT);
  assert.equal(g.fire(), null);
});

test('shard storm: turn, thrust and shoot; crystals split; the ring soaks shots and snaps back after a hit', () => {
  const g = make('shards', 0.3);
  g.rocks = []; g.nextRock = 99;
  const a0 = g.hero.angle;
  g.held.add('ArrowRight'); step(g, 0.2); g.held.clear();
  assert.ok(g.hero.angle > a0, 'turned');
  g.held.add('ArrowUp'); step(g, 0.3); g.held.clear();
  assert.ok(Math.hypot(g.hero.vx, g.hero.vy) > 10, 'thrust');
  // a big crystal right ahead splits into two mediums
  g.hero.vx = g.hero.vy = 0;
  g.fling(g.hero.x + Math.cos(g.hero.angle) * 40, g.hero.y + Math.sin(g.hero.angle) * 40, 'big', 0, 0);
  g.press('Space');
  step(g, 0.3);
  assert.equal(g.rocks.filter(r => r.size === 'medium').length, 2);
  // the ring soaks a shot aimed at the boss; after a hit, the ring re-forms
  g.rocks = [];
  Object.assign(g.foe, { x: 200, y: 100, vx: 0, vy: 0 });
  Object.assign(g.hero, { x: 100, y: 100, vx: 0, vy: 0, angle: 0 });
  g.boss.orbit = 0; g.spin = 0;
  for (const o of g.ring) { o.alive = Math.abs(Math.cos(o.a) + 1) > 0.3; o.back = 99; }     // a gap facing the glider
  const hp = g.bossHp;
  g.press('Space');
  step(g, 0.7);
  assert.equal(g.bossHp, hp - 1, 'through the gap');
  assert.ok(g.ring.every(o => o.alive), 'the ring snapped back');
  g.press('Space');
  step(g, 0.7);
  assert.equal(g.bossHp, hp - 1, 'the ring soaks the next shot');
  assert.ok(SHARDS.maxShots >= 3);
});

test('shard storm: a crystal that hits the glider costs a heart; the cave wraps around', () => {
  const g = make('shards', 0.3);
  g.rocks = []; g.nextRock = 99;
  Object.assign(g.hero, { x: 2, y: 100, vx: -60, vy: 0 });
  step(g, 0.2);
  assert.ok(g.hero.x > 300, 'wrapped to the other side');
  g.fling(g.hero.x, g.hero.y, 'medium', 0, 0);
  step(g, DT * 2);
  assert.equal(g.hearts, 2);
});

test('the zone capstones (and the duel) pass the mechanical checks at every capstone difficulty', async () => {
  const { makeBoss, checkBoss } = await import('../src/progression/bosses.js');
  for (const [zone, mode] of [['lagoon', 'bubble'], ['grove', 'bomber'], ['volcano', 'lavaguard'], ['crystal', 'shards'], ['meadow', 'parry']]) {
    for (const d of [0.2, 0.5, 0.8, 1]) for (const runSeed of [1, 2]) {
      const boss = makeBoss({ runSeed, index: 5, tier: zone, mode, role: 'boss', capstone: true, difficulty: d });
      const c = checkBoss(boss, [1, 2]);
      assert.ok(c.ok, `${mode} at ${d} (run ${runSeed}): ${c.issues.join('; ')}`);
    }
  }
});
