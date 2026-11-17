/**
 * Dungeon Delve (battle/delve.js): the NPC quest where your class is a real kit — sword and
 * shield, bow and dodge-roll, bolts and blink — through three rooms and the Rift Warden.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { delve, DELVE, planDelve } from '../src/games/delve/rules.js';
import { MODES, BOSS_GAMES, CHECKPOINT_GAMES, TRAVEL_GAMES, rolesOf, simulate } from '../src/games/index.js';
import { bossStats, makeBoss, BOSS_RULES } from '../src/progression/bosses.js';
import { createSpellRuntime } from '../src/progression/spells.js';
import { mulberry32 } from '../src/levels/generator.js';
import { makeNpc, questPitch, DELVE_PLACES } from '../src/characters/npcs.js';
import { createView, drawBattle } from '../src/games/kit/view.js';
import { DEFAULT_CHARACTERS } from '../src/characters/character.js';

const CLASSES = ['warrior', 'hunter', 'sorcerer'];
const bossFor = (cls, d = 0.5) => ({ mode: 'delve', kind: 'quest', name: 'The Rift Warden', difficulty: d, cls, ...bossStats('delve', d) });
const make = (cls, d = 0.5, seed = 1) => delve.create(bossFor(cls, d), { seed });
const run = (g, s) => { for (let t = 0; t < s; t += 1 / 120) { g.step(1 / 120); g.drain(); } };

test('a delve is only ever a quest (never in a run’s plan of bosses, checkpoints or journeys)', () => {
  assert.deepEqual(rolesOf('delve'), ['quest']);
  assert.ok(!BOSS_GAMES.includes('delve') && !CHECKPOINT_GAMES.includes('delve') && !TRAVEL_GAMES.includes('delve'));
  const boss = makeBoss({ mode: 'delve', role: 'quest', tier: 'grove', difficulty: 0.4, check: false });
  assert.equal(boss.kind, 'quest');
  assert.equal(boss.mode, 'delve');
});

test('three rooms of foes, then the Warden; the boss bar is every foe’s health added up', () => {
  for (const d of [0, 0.5, 1]) for (let seed = 1; seed < 20; seed++) {
    const rooms = planDelve(mulberry32(seed), d);
    assert.equal(rooms.length, 4);
    rooms.slice(0, 3).forEach(r => assert.ok(r.foes.length >= 2 && r.foes.every(f => f.kind !== 'warden')));
    assert.deepEqual(rooms[3].foes.map(f => f.kind), ['warden']);
    assert.ok(rooms.slice(1, 3).every(r => r.foes.some(f => f.kind === 'archer')), 'archers from the second room on');
  }
  const g = make('warrior');
  const sum = g.rooms.reduce((n, r) => n + r.foes.length, 0);
  assert.ok(sum >= 7);
  assert.equal(g.bossHp, g.totalHp);
  assert.equal(g.foes.length, g.rooms[0].foes.length, 'the first room is open from the start');
});

test('the door opens only when the room is clear — and leads to the next room', () => {
  const g = make('warrior');
  run(g, 1);
  g.hero.x = DELVE.right - 8;
  g.held.add('ArrowRight');
  run(g, 0.5);
  assert.equal(g.room, 0, 'the door is shut while foes are left');
  for (const f of g.foes) g.damage(f, 99);
  assert.equal(g.bossHp, g.totalHp - g.foes.reduce((n, f) => n + f.maxHp, 0));
  for (let i = 0; i < 300 && g.room === 0; i++) { g.step(1 / 120); g.drain(); }
  assert.equal(g.room, 1);
  assert.ok(g.hero.x < 40, 'in at the left');
});

test('Warrior: the shield blocks from the front only; the sword knocks arrows down', () => {
  const g = make('warrior');
  run(g, 1);
  const h = g.hero;
  h.face = 1; g.held.add('KeyK'); g.step(1 / 120);
  assert.ok(h.blocking);
  assert.equal(g.strikeHero(h.x + 20, 'arrow'), 'blocked');
  assert.equal(g.hearts, 3);
  assert.equal(g.strikeHero(h.x - 20, 'arrow'), 'hurt', 'from behind it lands');
  assert.equal(g.hearts, 2);
  g.held.delete('KeyK'); g.invulnerable = 0; g.step(1 / 120);
  g.arrows.push({ x: h.x + 14, y: h.y - 16, vx: -100, vy: 0, tx: h.x });
  h.attackCd = 0; h.stun = 0;
  g.attack();
  assert.equal(g.arrows.length, 0, 'swatted out of the air');
});

test('Hunter: nothing lands mid-roll; Sorcerer: blink jumps ahead and bolts go through every foe in a line', () => {
  const hunter = make('hunter');
  run(hunter, 1);
  hunter.press('KeyK');
  assert.ok(hunter.hero.roll > 0);
  assert.equal(hunter.strikeHero(hunter.hero.x + 5, 'slime'), 'dodged');
  assert.equal(hunter.hearts, 3);

  const sorc = make('sorcerer');
  run(sorc, 1);
  const x0 = sorc.hero.x;
  sorc.hero.face = 1;
  sorc.press('KeyK');
  assert.equal(sorc.hero.x, x0 + DELVE.kits.sorcerer.blink);
  assert.equal(sorc.strikeHero(sorc.hero.x + 5, 'slime'), 'dodged', 'a moment of safety after a blink');
  // two slimes in a row: one bolt hits both
  sorc.hero.x = 40; sorc.hero.y = DELVE.floor; sorc.hero.face = 1; sorc.hero.attackCd = 0;
  sorc.foes = [sorc.spawn({ kind: 'slime', x: 120 }), sorc.spawn({ kind: 'slime', x: 150 })];
  for (const f of sorc.foes) { f.appear = 0; f.t = 99; }
  sorc.attack();
  run(sorc, 1);
  assert.ok(sorc.foes.every(f => f.hp < f.maxHp), 'both slimes hit');
});

test('the Warden guards while it stalks you: weapons clink off; spells get through', () => {
  const g = make('warrior');
  g.enter(3);
  const w = g.foes[0];
  w.appear = 0; w.state = 'walk';
  assert.equal(g.damage(w, 2, 'sword'), 0);
  w.state = 'recover';
  assert.equal(g.damage(w, 2, 'sword'), 2);
  w.state = 'walk';
  const hp = w.hp;
  g.spellHit(2);
  assert.equal(w.hp, hp - 2, 'a spell’s hit ignores its guard');
});

test('every class’s bot clears the dungeon with time to spare; standing still loses', () => {
  for (const cls of CLASSES) for (const d of [0.15, 0.55, 0.9]) {
    let hurt = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const boss = bossFor(cls, d);
      const g = simulate(delve.create(boss, { seed }), delve.bot(), { limit: 300 });
      assert.equal(g.result, 'won', `${cls} d${d} seed ${seed}: ${g.reason} in room ${g.room + 1}`);
      assert.ok(g.time < boss.time * BOSS_RULES.maxTimeShare, `${cls} d${d} seed ${seed}: ${g.time.toFixed(1)} s`);
      hurt += g.maxHearts - g.hearts;
    }
    assert.ok(hurt <= 6, `${cls} d${d}: ${hurt} hearts lost over 6 delves`);
    const idle = simulate(delve.create(bossFor(cls, d), { seed: 2 }), null, { limit: 300 });
    assert.equal(idle.result, 'lost', `${cls}: idle`);
  }
});

test('spells in a delve: hits land on the nearest foe, and spent spells recharge', () => {
  const g = make('hunter');
  run(g, 1);
  const rt = createSpellRuntime(['volley', 'cleave'], { kind: 'quest', recharge: MODES.delve.spellRecharge });
  rt.begin(g);
  const nearest = g.living.sort((a, b) => Math.abs(a.x - g.hero.x) - Math.abs(b.x - g.hero.x))[0];
  const hp = nearest.hp;
  assert.equal(rt.cast(1, g).ok, true);
  assert.equal(nearest.hp, Math.max(0, hp - 2));
  assert.equal(rt.cast(1, g).reason, 'spent');
  const v = rt.version;
  rt.tick(MODES.delve.spellRecharge / 2);
  assert.ok(rt.version > v, 'the countdown ticks (the spell bar redraws)');
  rt.tick(MODES.delve.spellRecharge / 2 + 0.01);
  assert.equal(rt.active[1].left, 1, 'recharged');
  // elsewhere, spells stay once-per-game
  const plain = createSpellRuntime(['cleave']);
  plain.tick(100);
  assert.equal(plain.active[0].left, 1);
});

test('delve quests: a place by zone and a pitch that names it', () => {
  let seen = 0;
  for (let seed = 1; seed < 60; seed++) {
    const npc = makeNpc(seed, { zone: 'volcano' });
    if (npc.quest.kind !== 'delve') continue;
    seen++;
    assert.equal(npc.quest.place, DELVE_PLACES.volcano);
    assert.match(questPitch(npc), /forge vaults/);
  }
  assert.ok(seen > 5);
});

test('the delve draws (every room, every class)', () => {
  for (const cls of CLASSES) {
    const boss = { ...bossFor(cls), theme: 'grove', hue: 200, accentHue: 20, minionHue: 90, role: 'brute', monsterSeed: 5 };
    const g = delve.create(boss, { seed: 3 });
    const view = createView({ boss, design: DEFAULT_CHARACTERS[0], seed: 3 });
    const bot = delve.bot();
    for (let t = 0; g.result === 'playing' && t < 120; t += 1 / 120) {
      bot(g, 1 / 120); g.step(1 / 120); g.drain();
      if (Math.round(t * 120) % 60 === 0) {
        const s = drawBattle(view, g, { phase: 'playing', clock: t, countdown: 0 });
        assert.ok(s.buf.some(c => c !== 0));
      }
    }
    assert.equal(g.result, 'won');
  }
});

test('no aim help: shots fly straight (or 45° up with ↑ held); ↑ swings the sword overhead; only Space jumps', () => {
  const g = make('hunter');
  run(g, 1);
  const h = g.hero;
  h.face = 1; h.attackCd = 0; h.stun = 0;
  g.attack();
  const shot = g.shots.at(-1);
  assert.equal(shot.vy, 0, 'straight ahead, whatever is around');
  assert.equal(shot.y, h.y - DELVE.hero.shot);
  g.held.add('ArrowUp'); h.attackCd = 0;
  g.attack();
  const up = g.shots.at(-1);
  assert.ok(up.vx > 0 && Math.abs(up.vx + up.vy) < 1e-9, '45° up');
  g.held.delete('ArrowUp');
  assert.equal(g.press('ArrowUp'), null, '↑ aims, it doesn’t jump');
  assert.equal(g.press('Space'), 'jump');

  const w = make('warrior');
  run(w, 1);
  w.hero.face = 1;
  const ahead = w.swordReach();
  w.held.add('ArrowUp');
  const over = w.swordReach();
  assert.ok(over.y1 < ahead.y0 + 25 && over.y0 < ahead.y0 - 20, 'overhead');
  // a bat right above is hit by the overhead swing, not by the forward one
  const bat = w.spawn({ kind: 'bat', x: w.hero.x + 2 });
  Object.assign(bat, { appear: 0, y: w.hero.y - 40, state: 'hover', t: 99 });
  w.foes = [bat];
  w.hero.attackCd = 0; w.hero.stun = 0;
  w.attack();
  assert.ok(bat.hp < bat.maxHp);
});
