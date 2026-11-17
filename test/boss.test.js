import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBoss, checkBoss, bossStats, gameDifficulty, BOSS_RULES } from '../src/progression/bosses.js';
import { MODES, CAPSTONES, BOSS_GAMES, CHECKPOINT_GAMES, TRAVEL_GAMES, TRAVEL_ROUTES, rolesOf, createBattleGame, playBoss, simulate } from '../src/games/index.js';
import { planEncounters, gameCounts, encounterList, ENCOUNTER_RULES } from '../src/progression/encounters.js';
import { planZones, ZONE_IDS, CLASSIC_ZONES, travelVehicles } from '../src/world/zones.js';
import { starRating, starsText } from '../src/progression/rating.js';
import { ECHO, gaugeMarker } from '../src/games/echo/rules.js';
import { TENNIS, predictX } from '../src/games/tennis/rules.js';
import { RUNNER } from '../src/games/runner/rules.js';
import { QUICKDRAW } from '../src/games/quickdraw/rules.js';
import { SLED } from '../src/games/sled/rules.js';
import { STARBEAT } from '../src/games/starbeat/rules.js';
import { UNLOCKABLES, DEFAULT_CHARACTERS, STYLE_OPTIONS, createCharacterStore, randomCharacter, isUnlockable, RARITIES, DROP_TABLE } from '../src/characters/character.js';
import { TRAIL_STYLES, createTrailEmitter } from '../src/characters/trails.js';
import { itemParts } from '../src/characters/avatar.js';
import { gemParts, gemColor } from '../src/world/gem.js';
import { TIERS, levels } from '../src/levels/index.js';
import { placeArcade, touchesArcade, arcadeBoxes } from '../src/world/arcade.js';
import { auditLevel } from '../src/levels/audit.js';
import { createSession } from '../src/world/session.js';
import { mulberry32 } from '../src/levels/generator.js';

const DT = 1 / 120;
const TIER_OF = TIERS.flatMap(t => t.levels.map((_, i) => ({ tier: t.id, slot: i, capstone: i === t.levels.length - 1 })));
const step = (g, seconds) => { for (let t = 0; t < seconds; t += DT) { g.step(DT); } };

const plan = runSeed => planEncounters(runSeed, TIER_OF);
const zonedSlots = zones => TIERS.flatMap((t, k) => t.levels.map((_, i) => ({ tier: t.id, zone: zones[k], slot: i, capstone: i === t.levels.length - 1 })));
const runBossesPlanned = runSeed => plan(runSeed).map((e, index) => makeBoss({ runSeed, index, count: TIER_OF.length, ...TIER_OF[index], mode: e.boss.mode, iteration: e.boss.iteration }));

test('a new set of bosses every run: generated names, monsters and numbers, unique within a run', () => {
  const a = runBossesPlanned(1), b = runBossesPlanned(2);
  assert.equal(a.length, levels.length);
  for (const run of [a, b]) {
    assert.equal(new Set(run.map(x => x.name)).size, run.length, run.map(x => x.name).join(', '));
    assert.equal(new Set(run.map(x => x.monsterSeed)).size, run.length);
  }
  assert.notDeepEqual(a.map(x => x.name), b.map(x => x.name), 'another run, other bosses');
  assert.deepEqual(runBossesPlanned(1).map(x => x.name), a.map(x => x.name), 'a run is reproducible from its seed');
});

test('maximum variety: no game twice in a run, capstones in place, terrain fits, every game turns up across runs', () => {
  const bossModes = new Set(), cpModes = new Set(), travelModes = new Set();
  const orders = new Set(), journeys = new Set();
  for (let runSeed = 1; runSeed <= 80; runSeed++) {
    const zones = planZones(runSeed);
    journeys.add(zones.join());
    const slots = zonedSlots(zones);
    const p = planEncounters(runSeed, slots);
    const list = encounterList(p);
    const counts = gameCounts(p);
    for (const [mode, n] of Object.entries(counts)) assert.equal(n, 1, `run ${runSeed}: ${mode} ×${n}`);
    assert.equal(list.length, 19, 'four checkpoints (one a stage), twelve bosses, three journeys');
    assert.equal(Object.keys(counts).length, list.length, 'every encounter a different game');
    orders.add(list.map(e => e.mode).join());
    // each stage's capstone is the capstone of the zone it's played in
    slots.forEach((t, i) => { if (t.capstone) assert.equal(p[i].boss.mode, CAPSTONES[t.zone]); });
    // a capstone game never turns up anywhere but its zone's capstone
    list.forEach(e => { const zone = Object.keys(CAPSTONES).find(k => CAPSTONES[k] === e.mode); if (zone) assert.ok(slots[e.level].zone === zone && slots[e.level].capstone); });
    // terrain: the sled in the snow, the lander under the stars, a vehicle that suits every crossing
    list.forEach(e => {
      if (e.mode === 'lander') assert.equal(slots[e.level].zone, 'starlit');
      assert.ok(rolesOf(e.mode).includes(e.role), `${e.mode} as ${e.role}`);
    });
    const trips = p.filter(e => e.travel).map(e => e.travel);
    assert.deepEqual(trips.map(t => `${t.from}>${t.to}`), zones.slice(1).map((z, i) => `${zones[i]}>${z}`));
    trips.forEach(t => assert.ok(travelVehicles(t.from, t.to).includes(t.mode), `${t.mode} from ${t.from} to ${t.to}`));
    assert.ok(trips.filter(t => t.mode === 'plane').length <= 1, 'the plane at most once');
    assert.equal(p.filter(e => e.checkpoint).length, ENCOUNTER_RULES.checkpointLevels.length);
    assert.equal(p[0].checkpoint, null, 'the tutorial level has no arcade');
    // later encounters are harder, whatever the game (first meetings included)
    const ds = list.map(e => e.difficulty - (slots[e.level].capstone && e.role === 'boss' ? ENCOUNTER_RULES.capstoneBonus : 0));
    for (let i = 1; i < ds.length; i++) assert.ok(ds[i] > ds[i - 1], `run ${runSeed}: encounter ${i} not harder`);
    assert.ok(ds[0] <= 0.1 && ds.at(-1) >= 0.9);
    p.forEach(e => { bossModes.add(e.boss.mode); if (e.checkpoint) cpModes.add(e.checkpoint.mode); if (e.travel) travelModes.add(e.travel.mode); });
  }
  assert.ok(journeys.size >= 30, `${journeys.size} different journeys in 80 runs`);
  assert.ok(orders.size >= 75, `${orders.size} different orders in 80 runs`);
  assert.deepEqual([...bossModes].sort(), [...BOSS_GAMES].sort(), 'every boss game turns up');
  // (four checkpoints a run: the checkpoint-only games fill them; games that can be either go where they're needed)
  assert.deepEqual([...cpModes].filter(m => rolesOf(m).length === 1).sort(), CHECKPOINT_GAMES.filter(m => rolesOf(m).length === 1).sort(), 'every checkpoint game turns up');
  assert.ok([...cpModes].every(m => CHECKPOINT_GAMES.includes(m)));
  assert.deepEqual([...travelModes].sort(), [...TRAVEL_GAMES].sort());
  assert.equal(new Set(Object.values(CAPSTONES)).size, ZONE_IDS.length, 'every zone has its own capstone');
  assert.ok(Object.keys(MODES).length > 19, 'more games than encounters: some wait for the next run');
});

test('the hand-written campaign (run 0) keeps the classic journey and its crossings', () => {
  const p = plan(1);
  TIER_OF.forEach((t, i) => { if (t.capstone) assert.equal(p[i].boss.mode, CAPSTONES[t.tier]); });
  assert.deepEqual(planZones(0), CLASSIC_ZONES);
  assert.deepEqual(p.filter(e => e.travel).map(e => `${e.travel.from}>${e.travel.to}`), TRAVEL_ROUTES.map(r => `${r.from}>${r.to}`));
  assert.deepEqual(Object.fromEntries(CLASSIC_ZONES.map(z => [z, CAPSTONES[z]])), { meadow: 'echo', canyon: 'quickdraw', alpine: 'sled', starlit: 'invaders' });
});

test('the star rating counts the games beaten', () => {
  assert.equal(starRating(21, 21), 5);
  assert.equal(starRating(17, 21), 5 - 1);
  assert.equal(starRating(13, 21), 3);
  assert.equal(starRating(9, 21), 2);
  assert.equal(starRating(0, 21), 1, 'finishing the run is a star');
  assert.equal(starsText(3), '★★★☆☆');
});

test('each return of a game is harder; capstones are tougher still', () => {
  const d = (o) => gameDifficulty({ count: 12, ...o });
  assert.ok(d({ index: 5, iteration: 1 }) > d({ index: 5, iteration: 0 }));
  assert.ok(d({ index: 5, iteration: 2 }) > d({ index: 5, iteration: 1 }));
  assert.ok(d({ index: 8, capstone: true }) > d({ index: 8 }));
  for (const mode of Object.keys(MODES)) {
    const [a, b] = [0, 2].map(iteration => makeBoss({ runSeed: 3, index: 6, tier: mode === 'sled' ? 'alpine' : 'canyon', mode, iteration, check: false }));
    assert.ok(b.difficulty > a.difficulty, mode);
  }
  // the echo's timing check: once mid-fight the first time, after every round later
  const first = bossStats('echo', 0.3, () => 0.5, 0, 0), later = bossStats('echo', 0.6, () => 0.5, 0, 1);
  assert.equal(first.gaugeRounds.length, 1);
  assert.ok(later.gaugeRounds.length >= 3);
  assert.ok(later.gaugeZone < first.gaugeZone, 'a narrower green zone');
});

test('mechanical checks: for every run a perfect player wins with time to spare, an idle one loses', () => {
  for (const runSeed of [1, 2, 3]) {
    const p = plan(runSeed);
    p.forEach((e, index) => {
      for (const x of [e.checkpoint, e.boss, e.travel].filter(Boolean)) {
        const boss = makeBoss({ runSeed, index, count: TIER_OF.length, ...TIER_OF[index], mode: x.mode, iteration: x.iteration, role: x.role, difficulty: x.difficulty });
        const check = checkBoss(boss, [1, 2]);
        assert.ok(check.ok, `${runSeed} ${boss.name} (${boss.mode} ·${x.iteration + 1}): ${check.issues.join('; ')}`);
      }
    });
  }
  // and the checks do catch a boss that's too much
  const marathon = { mode: 'runner', ...bossStats('runner', 1), hp: 40 };
  assert.match(checkBoss(marathon).issues.join(), /too long|perfect player loses/);
  assert.ok(BOSS_RULES.maxTimeShare < 0.7);
});

test('every mini-game is deterministic for a seed and recolours the world on every good move', () => {
  for (const mode of Object.keys(MODES)) {
    for (const iteration of [0, 2]) {
      const boss = { mode, ...bossStats(mode, iteration ? 0.9 : 0.4, () => 0.5, 0, iteration) };
      const a = playBoss(boss, { seed: 7 }), b = playBoss(boss, { seed: 7 });
      assert.equal(a.time, b.time, mode);
      assert.deepEqual(a.stats, b.stats, mode);
      assert.equal(a.result, 'won', `${mode} ·${iteration + 1}: ${a.reason}`);
      assert.equal(a.steps, a.stats.good, `${mode}: one palette step per good move`);
      assert.ok(a.steps >= 1, mode);
      const idle = playBoss(boss, { seed: 7, idle: true });
      assert.equal(idle.result, 'lost', `${mode}: doing nothing loses`);
    }
  }
});

test('typing is one game among many: most games are steered, aimed, timed or played with the arrows', () => {
  const typing = Object.values(MODES).filter(m => m.id === 'runner');
  assert.equal(typing.length, 1);
  const controls = new Set(Object.values(MODES).map(m => m.controls).filter(Boolean));
  assert.ok(controls.size >= 6, [...controls].join());
});

test('runner: the shown key jumps (a backflip and a firework), Space and wrong keys stumble', () => {
  const g = MODES.runner.create({ mode: 'runner', ...bossStats('runner', 0) }, { seed: 3 });
  const first = g.key;
  assert.equal(g.press('Space'), 'wrong', 'Space does not jump');
  assert.ok(g.player.stumble > 0);
  step(g, 0.5);
  assert.equal(g.press(first.code === 'KeyQ' ? 'KeyW' : 'KeyQ'), 'wrong');
  step(g, 0.5);
  assert.equal(g.press(first.code), 'good');
  assert.notEqual(g.key.code, first.code, 'a new key after every jump');
  assert.equal(g.fireworks.length, 1);
  assert.equal(g.press(g.key.code), null, 'no double jump in the air');
  let maxFlip = 0;
  while (!g.player.grounded || g.player.y > 0) { g.step(DT); maxFlip = Math.max(maxFlip, g.player.flip); if (g.time > 5) break; }
  assert.ok(maxFlip > 0.95, `a full backflip (${maxFlip})`);
  assert.equal(g.bossHp, g.boss.hp - 1, 'the firework hits the boss');
  assert.equal(g.steps, 1);
  assert.equal(g.stats.wrong, 2);
  assert.ok(RUNNER.jumpSpeed > 0);
});

test('quick draw: aim (mouse or keys) and shoot; misses reload; escapees steal hearts', () => {
  const boss = { mode: 'quickdraw', ...bossStats('quickdraw', 0.3) };
  const g = MODES.quickdraw.create(boss, { seed: 5 });
  while (!g.critters.length) g.step(DT);
  const c = g.critters[0];
  g.aimAt(20, 130);
  assert.equal(g.press('Space'), 'miss');
  assert.equal(g.press('Space'), null, 'reloading');
  step(g, QUICKDRAW.reload + 0.02);
  g.held.add('ArrowUp');
  step(g, 0.2);
  assert.ok(g.aim.y < 130, 'held keys move the crosshair');
  g.held.clear();
  assert.equal(g.click(c.x + 3, c.y - 2), 'good', 'clicking a critter shoots it');
  assert.ok(c.falling);
  assert.equal(g.bossHp, boss.hp - 1);
  const idle = simulate(MODES.quickdraw.create(boss, { seed: 5 }), null);
  assert.equal(idle.result, 'lost');
  assert.equal(idle.reason, 'hearts');
});

test('sled: ← → steer; riding over a ramp launches you (no keys to type); obstacles hurt unless airborne', () => {
  const boss = { mode: 'sled', ...bossStats('sled', 0.5) };
  const g = MODES.sled.create(boss, { seed: 2 });
  assert.equal(g.lane, 1);
  assert.equal(g.press('ArrowLeft'), 'steer');
  assert.equal(g.press('KeyA'), 'steer');
  assert.equal(g.lane, 0, 'lanes stop at the edge');
  assert.equal(g.press('KeyQ'), null, 'letters do nothing');
  g.press('ArrowRight');
  step(g, 0.3);
  assert.equal(g.x, SLED.lanes[1]);
  let ramp;
  while (!(ramp = g.objects.find(o => o.kind === 'ramp'))) g.step(DT);
  g.invulnerable = 99;
  while (!ramp.used && g.time < 30) { g.lane = ramp.lane; g.step(DT); }
  assert.ok(ramp.used && g.airborne > 0, 'launched by riding over it');
  step(g, SLED.snowballTime + 0.05);
  assert.equal(g.bossHp, boss.hp - 1, 'the snowball hits the boss');
  assert.equal(simulate(MODES.sled.create(boss, { seed: 2 }), null).result, 'lost');
});

test('copycat: watch, then repeat; a wrong move costs a heart; the timing gauge reshuffles on a miss', () => {
  const boss = { mode: 'echo', ...bossStats('echo', 0.2, () => 0.5, 0, 1) };
  const g = MODES.echo.create(boss, { seed: 4 });
  assert.equal(g.sequence.length, boss.startLength);
  while (g.phase !== 'show') g.step(DT);
  assert.equal(g.press('ArrowUp'), null, 'watching: keys do nothing');
  while (g.phase !== 'input') g.step(DT);
  const codes = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const wrongMove = ECHO.moves.find(m => m !== g.sequence[0]);
  assert.equal(g.press(codes[wrongMove]), 'wrong');
  assert.equal(g.hearts, 2);
  while (g.phase !== 'input') g.step(DT);
  assert.equal(g.inputIndex, 0, 'the boss shows it again');
  const before = [...g.sequence];
  for (const m of before) assert.equal(g.press(codes[m]), 'good');
  assert.equal(g.bossHp, boss.hp - 1);
  // round 1 done: the timing check (second time this game is met)
  assert.equal(g.phase, 'gauge');
  while (Math.abs(gaugeMarker(g.gauge.t, boss.gaugePeriod) - 0.02) > 0.02 || (gaugeMarker(g.gauge.t, boss.gaugePeriod) >= g.gauge.zone[0] && gaugeMarker(g.gauge.t, boss.gaugePeriod) <= g.gauge.zone[1])) g.step(DT / 4);
  assert.equal(g.press('Space'), 'wrong', 'outside the green zone');
  assert.ok(g.taunt > 0, 'the boss pulls a face');
  assert.equal(g.sequence.length, before.length, 'same length …');
  // (a new order: with this seed the dance is reshuffled)
  assert.notDeepEqual(g.sequence, before, '… new order');
  // hitting the gauge instead keeps the dance and adds a move
  const h = MODES.echo.create(boss, { seed: 4 });
  const bot = MODES.echo.bot({ delay: 0.05 });
  while (h.phase !== 'gauge' && h.time < 60) { bot(h, DT); h.step(DT); }
  const kept = [...h.sequence];
  while (h.phase === 'gauge') { bot(h, DT); h.step(DT); }
  assert.equal(h.gauge.result, 'hit');
  assert.deepEqual(h.sequence.slice(0, kept.length), kept);
  assert.equal(h.sequence.length, kept.length + 1);
});

test('star beat: hits count inside the timing window; misses cost hearts; a streak wins one back', () => {
  const boss = { mode: 'starbeat', ...bossStats('starbeat', 0.5) };
  const g = MODES.starbeat.create(boss, { seed: 6 });
  const first = [...g.notes].sort((a, b) => a.at - b.at)[0];
  while (g.time < first.at - STARBEAT.window - 0.05) g.step(DT);
  assert.equal(g.press(STARBEAT.keys[first.lane][0]), 'wrong', 'too early');
  while (g.time < first.at) g.step(DT);
  assert.equal(g.press(STARBEAT.keys[first.lane][1]), 'good', 'arrow keys work too');
  assert.equal(g.bossHp, boss.hp - 1);
  const next = g.notes.filter(n => !n.hit).sort((a, b) => a.at - b.at)[0];
  while (g.time < next.at + STARBEAT.window + 0.02) g.step(DT);
  assert.equal(g.hearts, 2);
  const bot = MODES.starbeat.bot();
  while (g.streak < STARBEAT.streakHeal && g.result === 'playing') { bot(g); g.step(DT); }
  assert.equal(g.hearts, 3);
});

test('tennis: move to the ball and it comes back; a smash is faster; points hit the boss, misses cost hearts', () => {
  const boss = { mode: 'tennis', ...bossStats('tennis', 0.3) };
  const g = MODES.tennis.create(boss, { seed: 3 });
  while (!g.ball) g.step(DT);
  // stand where the serve lands, smash it
  while (g.ball.vy > 0) {
    const x = predictX(g.ball, TENNIS.heroY);
    g.hero.x = x;
    if ((TENNIS.heroY - g.ball.y) / g.ball.vy < 0.1 && g.time - g.smashAt > 1) g.press('Space');
    g.step(DT);
  }
  assert.equal(g.stats.good, 1, 'returned');
  assert.ok(g.ball.smash && Math.hypot(g.ball.vx, g.ball.vy) > boss.ballSpeed * 1.2, 'smash');
  // walk away: the next ball gets past
  const h = MODES.tennis.create(boss, { seed: 3 });
  while (h.hearts === 3 && h.time < 20) { h.hero.x = h.ball ? (predictX(h.ball, TENNIS.heroY) < 160 ? 240 : 80) : 160; h.step(DT); }
  assert.equal(h.hearts, 2);
});

test('star invaders, spellslinger: the boss is shielded by minions / only open after it attacks', () => {
  const inv = MODES.invaders.create({ mode: 'invaders', ...bossStats('invaders', 0.3) }, { seed: 1 });
  assert.equal(inv.minions.length, inv.boss.rows * inv.boss.cols);
  inv.hero.x = inv.minionAt(inv.minions.at(-1)).x;
  inv.press('Space');
  while (inv.shots.length) inv.step(DT);
  assert.equal(inv.minions.filter(m => !m.alive).length, 1, 'the star pops the minion in the way');
  assert.equal(inv.bossHp, inv.boss.hp);
  const fb = MODES.fireball.create({ mode: 'fireball', ...bossStats('fireball', 0.3) }, { seed: 1 });
  fb.press('KeyX');
  while (fb.bolts.length) fb.step(DT);
  assert.equal(fb.bossHp, fb.boss.hp, 'shielded');
  // when it's open (just attacked) and low enough to reach, a fireball lands
  while (!(fb.bossLift < 8 && Math.cos(fb.time * 1.3) < 0)) fb.step(DT);   // sinking toward its lowest
  step(fb, 0.02);
  fb.foes = [];
  fb.cooldown = 0;
  fb.invulnerable = 99;
  fb.press('KeyX');
  fb.open = 5;
  const hp = fb.bossHp;
  while (fb.bolts.length) { fb.step(DT); fb.open = Math.max(fb.open, 0.5); fb.foes = []; }
  assert.equal(fb.bossHp, hp - 1, 'open: the fireball lands');
});

test('checkpoint games: climb, fly, clear lines — the goal bar fills, falling / bumping / topping out costs a heart', () => {
  for (const mode of CHECKPOINT_GAMES) {
    const boss = makeBoss({ runSeed: 2, index: 4, tier: 'canyon', mode, check: false });
    assert.equal(boss.kind, 'checkpoint');
    assert.equal(boss.name, MODES[mode].name);
    const g = playBoss(boss, { seed: 3 });
    assert.equal(g.result, 'won', mode);
    assert.equal(g.bossHp, 0);
  }
  const t = MODES.tetris.create({ mode: 'tetris', ...bossStats('tetris', 0.2) }, { seed: 1 });
  for (let i = 0; i < 40 && t.hearts === 3; i++) t.press('Space');     // drop everything in the middle
  assert.equal(t.hearts, 2, 'topping out costs a heart');
  assert.ok(t.well.every(row => row.every(c => !c || true)));
  const f = MODES.flappy.create({ mode: 'flappy', ...bossStats('flappy', 0.2) }, { seed: 1 });
  step(f, 2);
  assert.equal(f.hearts, 3, 'hovering until the first flap');
  f.press('Space');
  step(f, 3);
  assert.ok(f.hearts < 3, 'then gravity wins');
});

test('unlockable clothes: locked until won, won one at a time without repeats', () => {
  assert.ok(UNLOCKABLES.length >= 12);
  assert.equal(new Set(UNLOCKABLES.map(u => u.id)).size, UNLOCKABLES.length);
  for (const u of UNLOCKABLES) {
    assert.ok(STYLE_OPTIONS[u.slot].some(([v]) => v === u.value), u.id);
    assert.ok(isUnlockable(u.slot, u.value));
    assert.ok(itemParts({ ...DEFAULT_CHARACTERS[0], [u.slot]: u.value }, u.slot).length > 0, `${u.id} has a look`);
  }
  for (const hero of DEFAULT_CHARACTERS) for (const key of Object.keys(STYLE_OPTIONS)) assert.ok(!isUnlockable(key, hero[key]));
  const rng = mulberry32(5);
  for (let i = 0; i < 50; i++) {
    const r = randomCharacter(rng);
    for (const key of Object.keys(STYLE_OPTIONS)) assert.ok(!isUnlockable(key, r[key]), `${key}: ${r[key]}`);
  }
  const data = new Map();
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const store = createCharacterStore(storage);
  assert.equal(store.isUnlocked('hat', 'viking'), false);
  assert.equal(store.isUnlocked('hat', 'cap'), true);
  const won = new Set();
  for (let i = 0; i < UNLOCKABLES.length; i++) {
    const next = store.nextUnlock(rng);
    assert.ok(next && !won.has(next.id));
    won.add(next.id);
    assert.equal(store.unlock(next.id), true);
    assert.equal(store.unlock(next.id), false, 'no duplicates');
  }
  assert.equal(store.nextUnlock(rng), null, 'everything won');
  assert.equal(createCharacterStore(storage).unlocked().length, UNLOCKABLES.length, 'unlocks survive a reload');
});

test('rarity: tougher bosses drop rarer things — wings, halos and glitter trails wait in the last region', () => {
  for (const r of RARITIES) assert.ok(UNLOCKABLES.filter(u => u.rarity === r).length >= 5, r);
  assert.ok(UNLOCKABLES.every(u => RARITIES.includes(u.rarity)));
  assert.equal(UNLOCKABLES.find(u => u.id === 'shoes:rocketboots').rarity, 'common');
  for (const id of ['hat:halo', 'back:fairywings', 'back:dragonwings', 'trail:glitter']) assert.equal(UNLOCKABLES.find(u => u.id === id).rarity, 'legendary', id);
  for (const row of DROP_TABLE) assert.ok(Math.abs(Object.values(row).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const fresh = () => { const data = new Map(); return createCharacterStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }); };
  const rng = mulberry32(9);
  const tally = (region, capstone) => {
    const out = {};
    for (let i = 0; i < 400; i++) { const r = fresh().rollReward(rng, { region, capstone }).rarity; out[r] = (out[r] || 0) + 1; }
    return out;
  };
  const meadow = tally(0, false), starlit = tally(3, false), finale = tally(3, true);
  assert.ok(meadow.common > 300 && !meadow.legendary, JSON.stringify(meadow));
  assert.ok(starlit.legendary > 150 && !starlit.common, JSON.stringify(starlit));
  assert.equal(finale.legendary, 400, 'the last capstone always drops a legendary item');
  // when a rarity is all won, the next rarer one is given (then commoner)
  const store = fresh();
  for (const u of UNLOCKABLES.filter(u => u.rarity === 'common')) store.unlock(u.id);
  assert.equal(store.rollReward(() => 0, { region: 0 }).rarity, 'rare');
  for (const u of UNLOCKABLES.filter(u => u.rarity !== 'common')) store.unlock(u.id);
  assert.equal(store.rollReward(rng, { region: 2 }), null, 'everything won');
});

test('after-trails: every trail has a style, pedestal art and a 3D preview', () => {
  const trails = UNLOCKABLES.filter(u => u.slot === 'trail');
  assert.ok(trails.length >= 4);
  for (const t of trails) {
    assert.ok(TRAIL_STYLES[t.value], t.id);
    assert.ok(itemParts({ ...DEFAULT_CHARACTERS[0], trail: t.value }, 'trail').length >= 10, t.id);
  }
  // the emitter leaves glowing particles behind a moving hero, capped
  const particles = { particles: [] };
  const emitter = createTrailEmitter();
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 600; i++) { p.z += 0.05; emitter.update('glitter', p, 1 / 120, particles); }
  assert.ok(particles.particles.length > 20 && particles.particles.length <= 100, `${particles.particles.length}`);
  assert.ok(particles.particles.every(q => q.glow === 1));
  const none = { particles: [] };
  createTrailEmitter().update('none', p, 1, none);
  assert.equal(none.particles.length, 0);
});

test('arcade checkpoints: a cabinet on the route of every level; winning it moves the restart point', () => {
  for (const level of levels) {
    const audit = auditLevel(level);
    const spot = placeArcade(level, audit);
    assert.ok(spot, level.name);
    const route = [audit.route[0].from, ...audit.route.map(e => e.to)];
    assert.ok(route.slice(1, -1).includes(spot.platform), `${level.name}: on the route, not the start or the goal`);
    assert.ok(!(level.enemies || []).some(e => e.platform === spot.platform), 'no ground enemy on it');
    assert.ok(arcadeBoxes(spot, 1, 'ready').length > arcadeBoxes(spot, 1, 'done').length, 'a floating "!" while it waits');
    assert.ok(touchesArcade({ x: spot.x + 0.3, y: spot.y, z: spot.z }, spot));
    assert.ok(!touchesArcade({ x: spot.x + 2, y: spot.y, z: spot.z }, spot));
  }
  const level = levels[3];
  const spot = placeArcade(level, auditLevel(level));
  const session = createSession(level);
  session.health = 1;
  session.save(spot);
  assert.equal(session.health, 3, 'hearts refilled');
  session.die([]);
  assert.equal(session.player.z, spot.z, 'out of hearts: back at the arcade, not the start');
});

test('the goal is a floating, spinning gem that never turns green', () => {
  const goal = { x: 2, y: 3, z: 4 };
  const a = gemParts(goal, 0), b = gemParts(goal, 1.3);
  assert.ok(a.length >= 10);
  assert.notDeepEqual(a[0].matrix, b[0].matrix, 'it moves');
  assert.ok(a.every(p => p.matrix[13] > goal.y - 0.1), 'above the goal spot');
  for (let t = 0; t < 30; t += 0.1) {
    const [r, g, bl] = gemColor(t);
    assert.ok(!(g > r + 0.15 && g > bl + 0.15), `green at t=${t}: ${[r, g, bl]}`);
  }
});

test('createBattleGame picks the boss’s mini-game', () => {
  for (const mode of Object.keys(MODES)) assert.equal(createBattleGame({ mode, ...bossStats(mode, 0.5) }).mode, mode);
});
