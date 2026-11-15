import test from 'node:test';
import assert from 'node:assert/strict';
import { bossStats } from '../src/bosses.js';
import { MODES, rolesOf, TRAVEL_GAMES, TRAVEL_ROUTES } from '../src/battle/index.js';
import { BREAKOUT } from '../src/battle/breakout.js';
import { WHACK } from '../src/battle/whack.js';
import { FISHING } from '../src/battle/fishing.js';
import { FROGGER } from '../src/battle/frogger.js';
import { MINECART } from '../src/battle/minecart.js';
import { riverAt } from '../src/battle/raft.js';

const DT = 1 / 120;
const make = (mode, d = 0.3, kind = rolesOf(mode)[0], seed = 1) => MODES[mode].create({ mode, kind, ...bossStats(mode, d, () => 0.5, 0, 0, kind) }, { seed });
const step = (g, seconds, each = null) => { for (let t = 0; t < seconds; t += DT) { each?.(g); g.step(DT); } };

test('brick breaker: the ball waits on the paddle until launched; a dropped ball costs a heart', () => {
  const g = make('breakout');
  step(g, 2);
  assert.ok(g.ready && !g.ball, 'waiting for a launch');
  assert.equal(g.press('Space'), 'serve');
  assert.ok(g.ball && g.ball.vy < 0);
  g.paddle.x = 60;                                    // nowhere near
  g.ball = { x: 250, y: 150, vx: 0, vy: 120 };
  step(g, 0.5);
  assert.equal(g.hearts, 2);
  // the paddle sends it back, angled by where it hits
  const h = make('breakout');
  h.press('Space');
  step(h, 1.2);
  h.press('Space');
  h.ball = { x: h.paddle.x + BREAKOUT.paddleW * 0.4, y: BREAKOUT.paddleY - 10, vx: 0, vy: 120 };
  step(h, 0.1);
  assert.ok(h.ball.vy < 0 && h.ball.vx > 0, 'off the right of the paddle: up and to the right');
});

test('cannon duel: hold to charge, let go to fire; the boss’s shells can be dodged', () => {
  const g = make('cannon', 0.2);
  g.press('Space');
  step(g, 0.5);
  const power = g.power();
  assert.ok(power > 0.2, `charged to ${power}`);
  g.release('Space');
  assert.equal(g.charging, null);
  assert.ok(g.shells.some(s => s.mine), 'a shell is in the air');
});

test('whack-a-critter: keys in the shape of the grid; misses and bombs are bad, escapes cost hearts', () => {
  const g = make('whack', 0.5, 'checkpoint');
  g.holes[4] = { kind: 'critter', t: 1, up: 1, whacked: false };
  assert.equal(g.press(WHACK.keys[4]), 'good');
  assert.equal(g.bossHp, g.boss.hp - 1);
  assert.equal(g.press(WHACK.keys[0]), 'miss');
  g.holes[2] = { kind: 'bomb', t: 1, up: 1, whacked: false };
  g.press(WHACK.keys[2]);
  assert.equal(g.hearts, 2);
  const idle = make('whack', 0.5, 'checkpoint');
  step(idle, 12);
  assert.ok(idle.hearts < 3, 'critters got away');
  // the boss version: only the boss counts
  const b = make('whack', 0.5, 'boss');
  b.holes[1] = { kind: 'critter', t: 1, up: 1, whacked: false };
  b.press(WHACK.keys[1]);
  assert.equal(b.bossHp, b.boss.hp);
  b.holes[3] = { kind: 'boss', t: 1, up: 1, whacked: false };
  b.press(WHACK.keys[3]);
  assert.equal(b.bossHp, b.boss.hp - 1);
});

test('gone fishing: cast, wait for the bite (too early scares it), hook, reel inside the zone', () => {
  const g = make('fishing', 0.2, 'checkpoint');
  g.press('Space');
  assert.equal(g.phase, 'waiting');
  assert.equal(g.press('Space'), 'wrong', 'too early');
  g.press('Space');
  while (g.phase === 'waiting') g.step(DT);
  assert.equal(g.phase, 'bite');
  step(g, FISHING.hookWindow + 0.1);
  assert.equal(g.phase, 'idle', 'too late: it got away');
  g.press('Space');
  while (g.phase === 'waiting') g.step(DT);
  assert.equal(g.press('Space'), 'good');
  assert.equal(g.phase, 'reeling');
  // track the fish and the catch bar fills
  step(g, 20, x => { if (x.phase === 'reeling') { if (x.tension < x.fish) x.held.add('Space'); else x.held.delete('Space'); } });
  assert.ok(g.caught >= 1);
  // hold on too hard and the line snaps
  const s = make('fishing', 0.2, 'checkpoint');
  s.press('Space');
  while (s.phase === 'waiting') s.step(DT);
  s.press('Space');
  s.boss.reelRate = 0; s.boss.slipRate = 0;         // keep the fish on the line
  s.held.add('Space');
  step(s, 3);
  assert.equal(s.hearts, 2);
  assert.equal(s.lastResult, 'snap');
});

test('maze muncher: gems recolour, ghosts hurt, big gems turn the tables', () => {
  const g = make('maze', 0.3, 'checkpoint');
  const before = g.gems.size;
  g.press('ArrowLeft');
  step(g, 1);
  assert.ok(g.gems.size < before && g.steps > 0, 'gobbled some gems');
  const ghost = g.ghosts[0];
  ghost.delay = 0;
  Object.assign(ghost, { x: g.hero.x, y: g.hero.y, fx: g.hero.x, fy: g.hero.y, progress: 0 });
  step(g, 0.05);
  assert.equal(g.hearts, 2, 'a ghost costs a heart');
  // boss version: the boss can't hurt you, and power gems come back
  const b = make('maze', 0.3, 'boss');
  for (const [k, v] of [...b.gems]) if (v === 'power') b.gems.delete(k);
  step(b, 7);
  assert.ok([...b.gems.values()].includes('power'), 'a big gem comes back');
});

test('road hop: carts bump you back to the start, logs carry you, crossings count', () => {
  const g = make('frogger', 0.3);
  assert.equal(g.press('ArrowUp'), 'hop');
  assert.equal(g.press('ArrowUp'), null, 'one hop at a time');
  // stand in a cart's way
  const lane = g.lanes[1];
  g.hero.hop = 0; g.hero.row = 1; g.best = 1;
  g.hero.x = g.itemsAt(1)[0].x + 5;
  g.step(DT);
  assert.equal(g.hearts, 2);
  assert.equal(g.hero.row, 0, 'back to the start');
  void lane;
  // on a log you drift with it
  const r = make('frogger', 0.3);
  const row = 5, log = r.itemsAt(row).find(it => it.x > 40 && it.x + it.w < r.width - 40);
  Object.assign(r.hero, { row, x: log.x + log.w / 2, hop: 0 });
  r.best = row;
  const x0 = r.hero.x;
  step(r, 0.3);
  assert.equal(r.hearts, 3);
  assert.notEqual(r.hero.x, x0, 'carried along');
  assert.equal(FROGGER.rows, 9);
});

test('moon lander: a soft landing on the lit pad counts; a hard one is a crash', () => {
  const g = make('lander', 0.2);
  const pad = g.pads[g.target];
  Object.assign(g.ship, { x: pad.x, y: pad.y - 12, vx: 0, vy: 10 });
  step(g, 1);
  assert.equal(g.landings, 1);
  const c = make('lander', 0.2);
  const p2 = c.pads[c.target];
  Object.assign(c.ship, { x: p2.x, y: p2.y - 12, vx: 0, vy: 90 });
  step(c, 0.4);
  assert.equal(c.hearts, 2);
});

test('travel levels: one vehicle per crossing, the distance recolours the world, idle riders fail', () => {
  assert.deepEqual(TRAVEL_GAMES.sort(), ['minecart', 'plane', 'raft', 'snowmobile']);
  for (const route of TRAVEL_ROUTES) for (const v of route.vehicles) assert.ok(TRAVEL_GAMES.includes(v));
  assert.equal(TRAVEL_ROUTES.length, 3);
  // the raft: strokes push sideways and it drifts; the bank only slows you down
  const r = make('raft', 0.3);
  r.press('ArrowRight');
  assert.ok(r.vx > 0);
  r.objects = [];
  const { c, half } = riverAt(r, r.travelled);
  r.x = c + half + 5;
  r.step(DT);
  assert.equal(r.hearts, 3, 'scraping the bank costs no heart');
  assert.ok(r.scrape > 0);
  // the mine cart jumps gaps and ducks beams
  const m = make('minecart', 0.3);
  assert.equal(m.press('Space'), 'jump');
  step(m, 1);
  m.held.add('ArrowDown');
  m.hazards = [{ kind: 'beam', x: m.travelled + 1, w: 14, phase: 0 }];
  step(m, 0.1);
  assert.equal(m.hearts, 3, 'ducked under the beam');
  assert.ok(MINECART.cart.duckHeight < 18);
  // every one of them is a journey: distance, not a boss, fills the bar
  for (const mode of TRAVEL_GAMES) {
    const g = make(mode, 0.3);
    assert.ok(MODES[mode].travel && g.boss.hp >= 5, mode);
  }
});
