/**
 * Riftcards (cards/*): the cards and factions, the rules of a match (rows, weather, abilities,
 * rounds), the computer player, decks, packs, the ladder — and that every card draws.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_IDS, FACTIONS, FACTION_IDS, ROWS, ABILITIES, RARITIES, cardPower, cardText } from '../src/cards/catalog.js';
import { createMatch, playCard, pass, total, rowTotal, strengthOf, legalMoves, MATCH_RULES } from '../src/cards/match.js';
import { chooseMove, playMove, autoMatch, searchMove } from '../src/cards/ai.js';
import { DECK_RULES, LADDER, KING, starterDeck, deckProblems, autoDeck, openPack, rarityOdds, opponentDeck, playableFactions } from '../src/cards/decks.js';
import { drawHandCard, drawUnit, drawBigCard, cardArt, artRoleFor, HAND_W, HAND_H, UNIT_W, UNIT_H, BIG_W, BIG_H } from '../src/cards/drawCards.js';
import { generateMonster } from '../src/characters/monsters.js';
import { createProfile } from '../src/progression/profile.js';
import { createSurface } from '../src/engine/pixel.js';
import { mulberry32, hashSeed } from '../src/levels/generator.js';

/** An empty table for p0 (faction f0) and p1 (f1), p0 to play, with these hands. */
function table({ hands = [[], []], factions = ['meadow', 'meadow'], decks = [[], []] } = {}) {
  const m = createMatch({ decks: [starterDeck('meadow'), starterDeck('meadow')], factions, seed: 1, first: 0, worlds: NOWHERE });
  // (two clear-skies cards at the end of each hand, never played: so nobody runs out and passes by itself)
  m.players.forEach((pl, p) => { pl.hand = [...hands[p], 'clear', 'clear']; pl.deck = [...decks[p]]; });
  m.events = [];
  return m;
}
const play = (m, id, row = null) => { const i = m.players[m.active].hand.indexOf(id); assert.ok(i >= 0, `${id} in hand`); assert.ok(playCard(m, i, row), `play ${id}`); };
const score = r => (r === 0 ? 1 : r === 'draw' ? 0.5 : 0);
function duel(d0, f0, d1, f1, seed, skills = [1, 1], hands) {
  return autoMatch(createMatch({ decks: [d0, d1], factions: [f0, f1], seed, first: seed % 2, hands }), skills, [mulberry32(seed * 7), mulberry32(seed * 13)]);
}
const ALL = Object.fromEntries(CARD_IDS.map(id => [id, 3]));
const NOWHERE = ['nowhere', 'nowhere', 'nowhere'];      // rounds in no world: no home ground, no weather

test('the cards: eight factions of eight, sensible numbers, words for everything; every card draws', () => {
  for (const f of FACTION_IDS) {
    const mine = CARD_IDS.filter(id => CARDS[id].faction === f);
    assert.ok(mine.length >= 8, f);
    assert.ok(mine.some(id => CARDS[id].rarity === 'legendary' && CARDS[id].ability === 'hero'), `${f} has a hero`);
    assert.ok(FACTIONS[f].perkText && FACTIONS[f].about, f);
  }
  const hand = createSurface(HAND_W + 2, HAND_H + 2), unit = createSurface(UNIT_W + 2, UNIT_H + 2), big = createSurface(BIG_W + 2, BIG_H + 2);
  for (const id of Object.keys(CARDS)) {
    const c = CARDS[id];
    assert.ok(RARITIES.includes(c.rarity), id);
    assert.ok(cardText(id).length > 10, id);
    if (c.kind === 'creature') {
      assert.ok(ROWS.includes(c.row) && c.str >= 1 && c.str <= 15, id);
      assert.ok(!c.ability || ABILITIES[c.ability], id);
      if (c.ability === 'muster') assert.ok(c.group, id);
      // the critter is drawn from a generated monster that passes its checks
      assert.ok(cardArt(id).tries < 40, `${id}'s picture`);
      drawUnit(unit, 1, 1, { id, str: c.str, uid: 1 });
      assert.ok(unit.buf.some(Boolean));
    } else assert.ok(c.effect && (c.effect.weather || c.effect.clear || c.effect.horn || c.effect.scorch), id);
    for (const [s, draw] of [[hand, () => drawHandCard(hand, 1, 1, id)], [big, () => drawBigCard(big, 1, 1, id)]]) { s.buf.fill(0); draw(); assert.ok(s.buf.filter(Boolean).length > s.buf.length * 0.5, id); }
  }
  // rarer creatures are stronger on average
  const avg = r => { const l = CARD_IDS.filter(id => CARDS[id].rarity === r && CARDS[id].kind === 'creature'); return l.reduce((a, id) => a + cardPower(id), 0) / l.length; };
  assert.ok(avg('common') < avg('rare') && avg('rare') < avg('epic') && avg('epic') < avg('legendary'));
  assert.ok(!CARD_IDS.includes('riftking'), 'the King’s own card is only won from him');
});

test('strength: weather, bonds, rallies and horns — heroes shrug them all off', () => {
  const m = table({ hands: [['bee', 'bee', 'bee', 'cloverknight', 'haygolem', 'queenbee', 'warhorn'], ['frost', 'storm']] });
  play(m, 'bee'); pass(m);                                                        // p1 passes: p0 plays on alone
  play(m, 'bee');
  assert.equal(rowTotal(m, 0, 'sky'), 8, 'bond: two bees count 2×2 each');
  play(m, 'bee');
  assert.equal(rowTotal(m, 0, 'sky'), 18, 'three bees: 2×3 each');
  play(m, 'haygolem'); play(m, 'cloverknight');
  assert.equal(rowTotal(m, 0, 'front'), 5 + 1 + 5, 'rally: +1 to the others in its row');
  play(m, 'queenbee');
  assert.equal(rowTotal(m, 0, 'sky'), 28, 'a hero adds its 10 and is not bonded');
  play(m, 'warhorn');
  assert.equal(rowTotal(m, 0, 'sky'), 36 + 10, 'the war horn doubled the sky row (the hero stays 10)');
  // weather: every non-hero creature in the row counts 1
  const w = table({ hands: [['haygolem', 'haygolem', 'riftwarden'], ['frost']] });
  play(w, 'haygolem'); play(w, 'frost');
  assert.equal(rowTotal(w, 0, 'front'), 1);
  play(w, 'riftwarden');
  assert.equal(rowTotal(w, 0, 'front'), 1 + 12, 'heroes ignore the frost');
});

test('faction perks: Frostkin weather, Dustrider shade, Prismfolk gleam, Starborn heroes, Bloomkin ties', () => {
  const frost = table({ hands: [['frost'], ['haygolem']], factions: ['alpine', 'meadow'] });
  frost.players[0].rows.front.push({ uid: 901, id: 'yeti', by: 0, bonus: 0 });
  play(frost, 'frost');
  assert.equal(rowTotal(frost, 0, 'front'), CARDS.yeti.str, 'Frostkin weather spares their own side');
  play(frost, 'haygolem');
  assert.equal(rowTotal(frost, 1, 'front'), 1);
  const shade = table({ hands: [['coyote', 'fog'], ['fog']], factions: ['canyon', 'meadow'] });
  play(shade, 'coyote', 'back'); play(shade, 'fog');
  assert.equal(rowTotal(shade, 0, 'back'), CARDS.coyote.str + 1, 'Dustriders: their back row ignores weather; agile +1');
  const gleam = table({ hands: [['geode', 'geode'], []], factions: ['crystal', 'meadow'] });
  play(gleam, 'geode'); pass(gleam); play(gleam, 'geode');
  assert.equal(rowTotal(gleam, 0, 'front'), 2 * CARDS.geode.str + MATCH_RULES.gleam, 'Prismfolk: the first creature of a round gets +2');
  const stars = table({ hands: [['nightqueen'], []], factions: ['starlit', 'meadow'] });
  play(stars, 'nightqueen');
  assert.equal(total(stars, 0), CARDS.nightqueen.str + MATCH_RULES.starHero);
  const ties = table({ hands: [['haygolem'], ['haygolem']], factions: ['meadow', 'volcano'] });
  play(ties, 'haygolem'); play(ties, 'haygolem'); pass(ties); pass(ties);
  assert.deepEqual(ties.roundLog[0], { round: 1, totals: [5, 5], winner: 0 }, 'the Bloomkin win a tie');
  assert.deepEqual(ties.players.map(p => p.gems), [2, 1]);
});

test('worlds: each round in a world — home ground +1 for its faction, its weather for everyone else', () => {
  const m = createMatch({ decks: [starterDeck('alpine'), starterDeck('volcano')], factions: ['alpine', 'volcano'], seed: 2, first: 0, worlds: ['alpine', 'volcano', 'meadow'] });
  assert.equal(m.world, 'alpine');
  assert.deepEqual([m.players[0].chilled.front, m.players[1].chilled.front], [false, true], 'a blizzard in the Alpine world — the Frostkin are used to it');
  m.players[0].hand = ['yeti', 'clear']; m.players[1].hand = ['emberimp', 'magmaslinger'];
  play(m, 'yeti'); play(m, 'emberimp');
  assert.equal(rowTotal(m, 0, 'front'), CARDS.yeti.str + MATCH_RULES.home, 'home ground');
  assert.equal(rowTotal(m, 1, 'front'), 1, 'chilled by the blizzard');
  play(m, 'clear');
  assert.equal(rowTotal(m, 1, 'front'), CARDS.emberimp.str, 'Sunny Day clears the world’s weather too');
  pass(m); pass(m);
  assert.equal(m.world, 'volcano', 'round two: the next world');
  assert.ok(!m.players[0].chilled.front && !m.players[1].chilled.front, 'no weather in the Ember Peaks');
  // worlds are drawn from the seed when not given: three different ones
  const w = createMatch({ decks: [starterDeck('meadow'), starterDeck('meadow')], seed: 9 }).worlds;
  assert.equal(new Set(w).size, 3);
  assert.ok(w.every(x => FACTION_IDS.includes(x)));
});

test('abilities: spies, musters, medics and scorch', () => {
  const spy = table({ hands: [['pebblespy'], []], decks: [['bee', 'bunny', 'haygolem'], []] });
  play(spy, 'pebblespy');
  assert.equal(rowTotal(spy, 1, 'front'), CARDS.pebblespy.str, 'a spy counts for the other side');
  assert.deepEqual(spy.players[0].hand.slice(-2), ['bee', 'bunny'], 'and you draw two');
  const muster = table({ hands: [['bunny'], []], decks: [['bee', 'bunny', 'bunny', 'haygolem'], []] });
  play(muster, 'bunny');
  assert.equal(muster.players[0].rows.front.length, 3, 'the other bunnies join from the deck');
  assert.deepEqual(muster.players[0].deck, ['bee', 'haygolem']);
  const medic = table({ hands: [['pollenwitch'], []] });
  medic.players[0].discard = ['bunny', 'sunstag', 'queenbee', 'pebblespy'];
  play(medic, 'pollenwitch');
  assert.ok(medic.players[0].rows.front.some(u => u.id === 'sunstag'), 'the strongest fallen creature (not a hero, not a spy) comes back');
  // scorch (the card): burns the strongest on the whole table, both sides — not heroes
  const burn = table({ hands: [['scorchspell'], []] });
  burn.players[0].rows.front.push({ uid: 1, id: 'sunstag', by: 0, bonus: 0 });
  burn.players[1].rows.front.push({ uid: 2, id: 'sunstag', by: 1, bonus: 0 }, { uid: 3, id: 'haygolem', by: 1, bonus: 0 });
  burn.players[1].rows.sky.push({ uid: 4, id: 'queenbee', by: 1, bonus: 0 });
  play(burn, 'scorchspell');
  assert.deepEqual([burn.players[0].rows.front.length, burn.players[1].rows.front.map(u => u.id), burn.players[1].rows.sky.length], [0, ['haygolem'], 1]);
  // the Emberborn's scorch spares their own
  const ember = table({ hands: [['scorchspell'], []], factions: ['volcano', 'meadow'] });
  ember.players[0].rows.front.push({ uid: 1, id: 'titan', by: 0, bonus: 0 });
  ember.players[1].rows.front.push({ uid: 2, id: 'haygolem', by: 1, bonus: 0 });
  play(ember, 'scorchspell');
  assert.deepEqual([ember.players[0].rows.front.length, ember.players[1].rows.front.length], [1, 0]);
  // scorch creatures burn the strongest in the row opposite if it totals 10 or more
  const hound = table({ hands: [['cinderhound'], []], factions: ['volcano', 'meadow'] });
  hound.players[1].rows.front.push({ uid: 2, id: 'sunstag', by: 1, bonus: 0 }, { uid: 3, id: 'haygolem', by: 1, bonus: 0 });
  play(hound, 'cinderhound');
  assert.deepEqual(hound.players[1].rows.front.map(u => u.id), ['haygolem']);
});

test('rounds: pass to sit out, the most strength wins, gems, a card each round, the loser starts the next', () => {
  const m = createMatch({ decks: [starterDeck('meadow'), starterDeck('volcano')], factions: ['meadow', 'volcano'], seed: 3, first: 0, worlds: NOWHERE });
  assert.deepEqual(m.players.map(p => p.hand.length), [MATCH_RULES.hand, MATCH_RULES.hand]);
  const moves = legalMoves(m);
  assert.ok(moves.some(x => x.pass) && moves.length > 5);
  const creature = m.players[0].hand.findIndex(id => CARDS[id].kind === 'creature' && CARDS[id].ability !== 'spy');
  playCard(m, creature); pass(m); pass(m);
  assert.equal(m.roundLog[0].winner, 0);
  assert.deepEqual(m.players.map(p => p.gems), [2, 1]);
  assert.equal(m.round, 2);
  assert.equal(m.active, 1, 'the loser of a round starts the next');
  assert.deepEqual(m.players.map(p => p.hand.length), [MATCH_RULES.hand - 1 + MATCH_RULES.drawEachRound, MATCH_RULES.hand + MATCH_RULES.drawEachRound], 'what you spend is gone');
  assert.ok(ROWS.every(r => !m.players[0].rows[r].length), 'the table is swept');
  // the Sporefolk keep a creature; the Tidefolk draw when they win a round
  const spores = createMatch({ decks: [starterDeck('grove'), starterDeck('lagoon')], factions: ['grove', 'lagoon'], seed: 4, first: 0, worlds: NOWHERE });
  const tideHand = spores.players[1].hand.length;
  playCard(spores, spores.players[0].hand.findIndex(id => CARDS[id].kind === 'creature' && !CARDS[id].ability));   // the Sporefolk: a toadstool…
  playCard(spores, spores.players[1].hand.findIndex(id => CARDS[id].str >= 4));                                      // the Tidefolk: 4
  pass(spores);                                                                                                       // the Sporefolk pass
  playCard(spores, spores.players[1].hand.findIndex(id => CARDS[id].str >= 4));                                      // 8 beats 5
  pass(spores);
  assert.equal(spores.roundLog[0].winner, 1);
  assert.equal(ROWS.reduce((a, r) => a + spores.players[0].rows[r].length, 0), 1, 'one Sporefolk creature stays');
  assert.equal(spores.players[1].hand.length, tideHand - 2 + MATCH_RULES.drawEachRound + 1, 'the Tidefolk won: a card from the tide');
  // the King holds 12
  const king = createMatch({ decks: [starterDeck('meadow'), opponentDeck(0, 'starlit', 6)], factions: ['meadow', 'starlit'], seed: 1, hands: [10, KING.hand] });
  assert.equal(king.players[1].hand.length, 12);
});

test('the computer player: legal, decisive, and much better than a beginner or a reckless player', () => {
  for (let s = 1; s <= 20; s++) {
    const f = FACTION_IDS[s % 8];
    const m = duel(starterDeck(f), f, opponentDeck(s, FACTION_IDS[(s + 3) % 8], s % 6), FACTION_IDS[(s + 3) % 8], s, [1, 0.4]);
    assert.ok(m.result !== null && m.roundLog.length >= 2 && m.roundLog.length <= 3, `seed ${s} finishes in 2–3 rounds`);
  }
  let vsBeginner = 0, n = 0;
  for (const f of FACTION_IDS) for (let s = 1; s <= 8; s++) { vsBeginner += score(duel(starterDeck(f), f, starterDeck(f), f, s, [1, LADDER[0].skill]).result); n++; }
  assert.ok(vsBeginner / n >= 0.65, `beats a Novice (${(vsBeginner / n).toFixed(2)})`);
  // a reckless player: always throws in its biggest card; never passes until ahead of a player who has
  let vsReckless = 0; n = 0;
  for (const f of FACTION_IDS) for (let s = 1; s <= 8; s++) {
    const m = createMatch({ decks: [starterDeck(f), starterDeck(f)], factions: [f, f], seed: s, first: s % 2 });
    const rng = mulberry32(s);
    for (let i = 0; i < 300 && m.result === null; i++) {
      if (m.active === 0) { playMove(m, { skill: 1, rng }); continue; }
      const p = 1, diff = total(m, p) - total(m, 0);
      if (m.players[0].passed && diff > 0) { pass(m); continue; }
      const opts = legalMoves(m).filter(q => !q.pass);
      if (!opts.length) { pass(m); continue; }
      const c = opts.reduce((a, q) => (cardPower(m.players[1].hand[q.hand]) > cardPower(m.players[1].hand[a.hand]) ? q : a), opts[0]);
      playCard(m, c.hand, c.row);
    }
    vsReckless += score(m.result); n++;
  }
  assert.ok(vsReckless / n >= 0.5, `holds its own against a reckless player (${(vsReckless / n).toFixed(2)})`);
  // the same match with the same seeds plays the same
  const a = duel(starterDeck('alpine'), 'alpine', starterDeck('crystal'), 'crystal', 9), b = duel(starterDeck('alpine'), 'alpine', starterDeck('crystal'), 'crystal', 9);
  assert.deepEqual(a.roundLog, b.roundLog);
  assert.ok(chooseMove(a, {}).pass, 'a finished match: nothing left but to pass');
  // the sharpest players look ahead: a legal move every time
  const look = createMatch({ decks: [starterDeck('grove'), starterDeck('canyon')], factions: ['grove', 'canyon'], seed: 4, first: 0 });
  const rng = mulberry32(4);
  for (let i = 0; i < 6 && look.result === null; i++) {
    const mv = searchMove(look, { rng, rollouts: 2 });
    assert.ok(mv.pass || (look.players[look.active].hand[mv.hand] && legalMoves(look).some(x => x.hand === mv.hand)));
    if (mv.pass) pass(look); else playCard(look, mv.hand, mv.row);
  }
});

test('balance: no starter faction runs away with it, and the ladder climbs', () => {
  const rate = {};
  for (const a of FACTION_IDS) {
    let w = 0, n = 0;
    for (const b of FACTION_IDS) if (a !== b) for (let s = 1; s <= 8; s++) {
      w += score(duel(starterDeck(a), a, starterDeck(b), b, s).result);
      w += 1 - score(duel(starterDeck(b), b, starterDeck(a), a, s + 50).result);
      n += 2;
    }
    rate[a] = w / n;
  }
  for (const [f, r] of Object.entries(rate)) assert.ok(r > 0.28 && r < 0.72, `${f} starter wins ${r.toFixed(2)}`);
  // the first card battlers are beatable with a starter deck; the Rift King is a real challenge
  const vs = (mine, t, hands) => { let w = 0, n = 0; for (const f of FACTION_IDS) for (let s = 1; s <= 5; s++) { const foe = FACTION_IDS[(s * 3 + t) % 8]; w += score(duel(mine(f, s), f, opponentDeck(s, foe, t), t >= 6 ? 'starlit' : foe, s, [1, t >= 6 ? 1 : LADDER[t].skill], hands).result); n++; } return w / n; };
  assert.ok(vs(f => starterDeck(f), 0) >= 0.6, 'a Novice table is friendly');
  assert.ok(vs(f => starterDeck(f), 4) < vs(f => starterDeck(f), 0), 'Masters are tougher than Novices');
  assert.ok(vs((f, s) => opponentDeck(s + 500, f, 5), 6, [10, KING.hand]) < 0.5, 'the King beats a Champion-sized deck more often than not');
});

test('decks: starters, the rules, the best deck for a collection, packs by tier, the battlers’ decks', () => {
  for (const f of FACTION_IDS) {
    const s = starterDeck(f);
    assert.deepEqual(deckProblems(s), [], `${f} starter is legal`);
    assert.equal(s.length, DECK_RULES.min);
    assert.deepEqual(deckProblems(autoDeck(ALL, f), ALL), [], `${f} best deck is legal`);
    for (let t = 0; t <= 5; t++) assert.deepEqual(deckProblems(opponentDeck(t + 1, f, t)), [], `${f} tier ${t}`);
  }
  const coll = Object.fromEntries(starterDeck('meadow').map(id => [id, 0]));
  for (const id of starterDeck('meadow')) coll[id]++;
  assert.deepEqual(playableFactions(coll), ['meadow']);
  assert.ok(deckProblems(starterDeck('meadow').slice(0, 12)).some(p => /at least 15/.test(p)));
  assert.ok(deckProblems([...starterDeck('meadow'), 'crab']).some(p => /one faction/.test(p)));
  assert.ok(deckProblems([...starterDeck('meadow'), 'sunstag', 'sunstag']).some(p => /Sun Stag/.test(p)), 'one copy of an epic');
  assert.ok(deckProblems([...starterDeck('meadow'), 'pebblespy', 'pebblespy']).some(p => /spies/.test(p)));
  assert.ok(deckProblems([...starterDeck('meadow'), 'sunstag'], coll).some(p => /you have 0/.test(p)), 'a card you don’t own');
  // packs: faction cards (and some neutral); rarer as the tier climbs
  const rng = mulberry32(5);
  const rarities = t => { const n = {}; for (let i = 0; i < 300; i++) for (const id of openPack(rng, { faction: 'volcano', tier: t })) { n[CARDS[id].rarity] = (n[CARDS[id].rarity] || 0) + 1; assert.ok(['volcano', 'neutral'].includes(CARDS[id].faction), id); } return n; };
  const low = rarities(0), high = rarities(5);
  assert.ok(!low.epic && !low.legendary && low.common > low.rare);
  assert.ok(high.legendary > 0 && high.epic > low.rare / 10);
  for (let t = 0; t <= 5; t++) assert.ok(Math.abs(Object.values(rarityOdds(t)).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('the ladder in the profile: three different battlers at your tier to rise; the King after the Champions', () => {
  const mem = new Map();
  const p = createProfile({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
  assert.deepEqual(p.beatBattler('anna', 0), { tier: 0, tierUp: false, beaten: 1 });
  assert.deepEqual(p.beatBattler('anna', 0), { tier: 0, tierUp: false, beaten: 1 }, 'the same battler twice counts once');
  assert.deepEqual(p.beatBattler('old', 3), { tier: 0, tierUp: false, beaten: 1 }, 'a battler of another tier does not count');
  p.beatBattler('bob', 0);
  assert.deepEqual(p.beatBattler('cat', 0), { tier: 1, tierUp: true, beaten: 0 });
  for (let t = 1; t < 6; t++) for (const k of ['x', 'y', 'z']) p.beatBattler(`${k}${t}`, t);
  assert.equal(p.get().cardTier, 6);
  assert.equal(p.get().cardWins, 3 + 1 + 15 + 1);
});
