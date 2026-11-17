/**
 * The Ring (ring/*): monsters from bosses, types, the rules of a squad battle, the computer
 * player, tamers and the ladder, experience; the ranch's and the inn's bits of the profile;
 * the tailor's patterns (characters/tailoring.js) in 2D and 3D.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, TYPE_IDS, STRONG, ZONE_TYPE, effectiveness, monsterFromBoss, statsOf, movesOf, gainXp, xpToNext, levelFor, MOVES, SIGNATURE_MODES, BODIES } from '../src/ring/monsters.js';
import { createBattle, resolveRound, commandsFor, targetsFor, alive, damageOf } from '../src/ring/battle.js';
import { chooseCommands, autoBattle } from '../src/ring/ai.js';
import { RING_TIERS, tamerSquad, wildMonster, xpForWin, goldForWin } from '../src/ring/tamers.js';
import { makeBoss, ROLE_FOR_MODE } from '../src/progression/bosses.js';
import { createProfile } from '../src/progression/profile.js';
import { dress, tailorable, priceFor, PRESETS, PENS, BLANK, cell } from '../src/characters/tailoring.js';
import { paintHero } from '../src/characters/heroSprite.js';
import { createAvatar } from '../src/characters/avatar.js';
import { DEFAULT_CHARACTERS } from '../src/characters/character.js';
import { ZONES } from '../src/world/zones.js';
import { mulberry32 } from '../src/levels/generator.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const zones = Object.keys(ZONE_TYPE);
const squad = (seed, level, list = null) => [0, 1, 2].map(k => wildMonster(seed * 10 + k, { zone: list ? list[k] : zones[(seed * 7 + k * 3) % 8], level }));
const score = r => (r === 0 ? 1 : r === 'draw' ? 0.5 : 0);
const fight = (a, b, seed, skills = [1, 1]) => autoBattle(createBattle({ squads: [a, b], seed }), skills, [mulberry32(seed), mulberry32(seed + 99)]);

test('types: eight, one per zone; each hits two hard and is hit hard by two', () => {
  assert.equal(TYPE_IDS.length, 8);
  for (const z of Object.keys(ZONES)) assert.ok(TYPES[ZONE_TYPE[z]], z);
  for (const t of TYPE_IDS) {
    assert.equal(STRONG[t].length, 2, t);
    assert.equal(TYPE_IDS.filter(a => STRONG[a].includes(t)).length, 2, `${t} is weak to two`);
    for (const d of STRONG[t]) { assert.equal(effectiveness(t, d), 1.5); assert.ok(effectiveness(d, t) < 1); }
  }
  assert.equal(effectiveness('leaf', 'gem'), 1);
});

test('a beaten boss becomes a monster: its zone’s type, its body, moves from its game, a level from its stage', () => {
  const boss = makeBoss({ runSeed: 12, index: 8, tier: 'alpine', mode: 'sled', check: false });
  const mon = monsterFromBoss(boss, { stage: 2 });
  assert.equal(mon.type, ZONE_TYPE[boss.theme]);
  assert.equal(mon.body, ROLE_FOR_MODE.sled);
  assert.equal(mon.monsterSeed, boss.monsterSeed, 'the same generated monster as the boss');
  assert.deepEqual(JSON.parse(JSON.stringify(mon)), mon, 'plain JSON for the profile');
  const moves = movesOf(mon);
  assert.equal(moves.length, 4);
  assert.equal(moves[1].name, 'Avalanche', 'the signature move of the game it was fought in');
  assert.equal(moves[3].id, 'guard');
  for (const m of SIGNATURE_MODES) assert.ok(MOVES[m]?.about, m);
  assert.ok(levelFor({ stage: 3, difficulty: 0.9 }) > levelFor({ stage: 0, difficulty: 0.1 }), 'later stages: stronger monsters');
  // stats grow with the level; bodies lean
  const a = statsOf({ ...mon, level: 5 }), b = statsOf({ ...mon, level: 15 });
  for (const k of ['hp', 'atk', 'def', 'spd']) assert.ok(b[k] > a[k], k);
  const brute = statsOf({ ...mon, body: 'brute', level: 10 }), flyer = statsOf({ ...mon, body: 'flyer', level: 10 });
  assert.ok(brute.hp > flyer.hp && flyer.spd > brute.spd);
  // experience
  const { mon: grown, ups } = gainXp({ ...mon, level: 5, xp: 0 }, xpToNext(5) + 5);
  assert.deepEqual([grown.level, ups, grown.xp], [6, 1, 5]);
});

test('the rules: speed order, damage by type, guard, statuses, cooldowns, a knock-out ends it', () => {
  const mk = (zone, mode, level = 10) => wildMonster(1, { zone, mode, level });
  const b = createBattle({ squads: [[mk('volcano', 'fireball'), mk('alpine', 'sled'), mk('lagoon', 'bubble')], [mk('meadow', 'runner'), mk('lagoon', 'fishing'), mk('grove', 'bomber')]], seed: 3 });
  const flame = b.units[0][0], leaf = b.units[1][0], tide = b.units[1][1];
  assert.ok(damageOf(flame, leaf, 1) > damageOf(flame, tide, 1) * 2, 'flame burns leaf, fizzles on water');
  // round one: everyone guards except our flame, who hits the leaf monster
  const guard = side => [0, 1, 2].map(slot => ({ side, slot, move: 'guard', target: null }));
  const hp = leaf.hp;
  const events = resolveRound(b, [{ side: 0, slot: 0, move: 'basic', target: 0 }, ...guard(0).slice(1), ...guard(1)]);
  assert.ok(events.some(e => e.type === 'round'));
  assert.ok(leaf.hp < hp || events.some(e => e.type === 'miss'), 'it hit (or missed)');
  const moved = events.filter(e => e.type === 'move').map(e => e.move);
  assert.equal(moved.at(-1), 'basic', 'Guard has priority: it goes first');
  // cooldowns: a signature can't be used again straight away
  resolveRound(b, [{ side: 0, slot: 0, move: 'fireball', target: 0 }, ...guard(0).slice(1), ...guard(1)]);
  assert.ok(!commandsFor(b, flame).some(m => m.id === 'fireball'), 'Fireball needs a round or two');
  assert.ok(commandsFor(b, flame).some(m => m.id === 'basic'));
  // targets: a taunting monster draws single-target attacks
  tide.st.taunt = 2;
  assert.deepEqual(targetsFor(b, flame, MOVES.basic), [tide]);
  tide.st.taunt = 0;
  // knock everyone out: the battle ends
  for (const u of b.units[1]) u.hp = 1;
  for (let i = 0; i < 8 && b.result === null; i++) resolveRound(b, [...chooseCommands(b, 0, { rng: mulberry32(i) }), ...guard(1)]);
  assert.equal(b.result, 0);
  assert.equal(alive(b, 1).length, 0);
});

test('the computer player and the balance: sensible fights, levels and types matter, no move dominates', () => {
  let w = 0, rounds = 0;
  for (let s = 1; s <= 60; s++) { const b = fight(squad(s, 10), squad(s + 500, 10), s); w += score(b.result); rounds += b.round - 1; assert.ok(b.result !== null, `seed ${s} finishes`); }
  assert.ok(Math.abs(w / 60 - 0.5) < 0.15, `equal squads are even (${(w / 60).toFixed(2)})`);
  assert.ok(rounds / 60 > 3 && rounds / 60 < 10, `fights last a few rounds (${(rounds / 60).toFixed(1)})`);
  let smart = 0; for (let s = 1; s <= 40; s++) smart += score(fight(squad(s, 10), squad(s + 500, 10), s, [1, 0]).result);
  assert.ok(smart / 40 > 0.85, `the computer beats random commands (${(smart / 40).toFixed(2)})`);
  let up = 0; for (let s = 1; s <= 40; s++) up += score(fight(squad(s, 12), squad(s + 500, 10), s).result);
  assert.ok(up / 40 > 0.7, 'two levels up usually wins');
  let typed = 0; for (let s = 1; s <= 30; s++) typed += score(fight(squad(s, 10, ['volcano', 'volcano', 'volcano']), squad(s + 500, 10, ['meadow', 'meadow', 'meadow']), s).result);
  assert.ok(typed / 30 > 0.8, 'a type advantage tells');
  // every signature move holds its own in a squad
  for (const mode of SIGNATURE_MODES) {
    let v = 0;
    for (let s = 1; s <= 40; s++) { const sq = squad(s, 10); sq[0] = wildMonster(s * 31, { zone: zones[s % 8], level: 10, mode }); v += score(fight(sq, squad(s + 700, 10), s).result); }
    assert.ok(v / 40 > 0.25 && v / 40 < 0.78, `${mode}: ${(v / 40).toFixed(2)}`);
  }
  for (const body of Object.keys(BODIES)) assert.ok(MOVES[body], body);
});

test('tamers and the ladder: squads at the tier’s levels, experience, gold; three beaten to rise', () => {
  for (let t = 0; t < RING_TIERS.length; t++) {
    const sq = tamerSquad(7, 'crystal', t);
    assert.equal(sq.length, 3);
    assert.equal(sq.filter(m => m.type === 'gem').length >= 2, true, 'mostly their home’s type');
    for (const m of sq) assert.ok(m.level >= RING_TIERS[t].level[0] && m.level <= RING_TIERS[t].level[1]);
  }
  const mine = squad(1, 8), theirs = squad(2, 10);
  const won = xpForWin(mine, theirs, true), lost = xpForWin(mine, theirs, false);
  assert.ok(won.every((x, i) => x > lost[i] && lost[i] > 0), 'a loss still teaches a little');
  assert.ok(goldForWin(4) > goldForWin(0));
  const p = createProfile(memory());
  assert.equal(p.squad().length, 0);
  for (const m of squad(3, 6)) assert.ok(p.addMonster(m));
  assert.ok(!p.addMonster(p.monsters()[0]), 'no twins');
  p.addMonster(wildMonster(99, { zone: 'volcano', level: 14 }));
  assert.equal(p.squad()[0].level, 14, 'no squad chosen: the strongest three');
  p.setSquad([p.monsters()[0].id, p.monsters()[1].id, p.monsters()[2].id]);
  assert.deepEqual(p.squad().map(m => m.id), p.monsters().slice(0, 3).map(m => m.id));
  assert.deepEqual(p.beatTamer('a', 0), { tier: 0, tierUp: false, beaten: 1 });
  p.beatTamer('a', 0); p.beatTamer('b', 0);
  assert.deepEqual(p.beatTamer('c', 0), { tier: 1, tierUp: true, beaten: 0 });
  // gold: the board pays each challenge once, until the next run
  assert.equal(p.payInn('board-1', 20), 20);
  assert.equal(p.payInn('board-1', 20), 20, 'paid once');
  p.visitTown();
  assert.ok(p.innPaid('board-1'), 'still done after popping out of town and back');
  p.finishRun(3);
  assert.ok(!p.innPaid('board-1'), 'a new run, a new board');
  assert.ok(!p.spendGold(500) && p.spendGold(15) && p.gold() === 5);
});

test('the tailor: patterns on what you own, in 2D and 3D; trails recoloured; prices', () => {
  const base = { ...DEFAULT_CHARACTERS[0], top: 'hoodie', back: 'cape', trail: 'glitter' };
  assert.deepEqual(tailorable(base).map(t => t.key), ['top:hoodie', 'back:cape', 'trail:glitter']);
  assert.ok(priceFor('back', 'dragonwings') > priceFor('back', 'guitar') && priceFor('back', 'guitar') > priceFor('top', 'tee'));
  const tailoring = { 'top:hoodie': { pattern: PRESETS.stripes }, 'back:cape': { pattern: PRESETS.star }, 'trail:glitter': { colors: ['#ff0000', '#00ff00'] }, 'top:tee': { pattern: PRESETS.dots } };
  const d = dress(base, tailoring);
  assert.deepEqual([d.patterns.top, d.patterns.back, d.trailColors], [PRESETS.stripes, PRESETS.star, ['#ff0000', '#00ff00']]);
  assert.equal(dress({ ...base, top: 'jacket' }, tailoring).patterns?.top, undefined, 'the pattern belongs to the hoodie, not to you');
  assert.equal(dress({ ...base, top: 'tee' }, tailoring).patterns.top, PRESETS.dots);
  // 2D: the sprite changes (front: the top; back: the cape)
  const same = (a, b) => a.buf.every((v, i) => v === b.buf[i]);
  assert.ok(!same(paintHero(base, 'front'), paintHero(d, 'front')), 'the pattern shows on the sprite');
  assert.ok(!same(paintHero(base, 'back'), paintHero(d, 'back')), 'and on the cape');
  // 3D: extra plates on the torso and the cape
  const av = createAvatar({ random: () => 0.5 });
  av.setCharacter(base); const plain = av.getParts({ x: 0, y: 0, z: 0 }).length;
  av.setCharacter(d); const fancy = av.getParts({ x: 0, y: 0, z: 0 }).length;
  assert.ok(fancy > plain + 8, `${fancy} parts vs ${plain}`);
  assert.equal(cell(BLANK, 3, 3), 0);
  assert.ok(PENS.slice(1).every(p => p.color(base).length === 3));
});
