/**
 * The story and progression (story.js) and what the profile keeps between runs (profile.js):
 * the gentle first run, unlocks, story beats in order, Riftcards, the arcade, settings and a
 * saved run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { unlocks, questKinds, nextBeat, chapter, BEATS } from '../src/progression/story.js';
import { createProfile } from '../src/progression/profile.js';
import { makeNpc } from '../src/characters/npcs.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('a gentle first run, then classes and duels, then delves; the Rift King at card rank 5', () => {
  const p = createProfile(memory());
  let d = p.get();
  assert.deepEqual(unlocks(d), { classes: false, duels: false, delves: false, king: false });
  assert.deepEqual(questKinds(d), ['rift']);
  p.finishRun(3); d = p.get();
  assert.ok(unlocks(d).classes && unlocks(d).duels && !unlocks(d).delves);
  p.finishRun(3); d = p.get();
  assert.deepEqual(questKinds(d), ['rift', 'duel', 'delve']);
  assert.equal(unlocks(d).king, false);
  const climb = () => { for (let t = p.get().cardTier; t < 6; t++) for (const key of ['a', 'b', 'c']) p.beatBattler(`${key}${t}`, t); };
  climb();
  assert.equal(p.get().cardTier, 6);
  assert.equal(unlocks(p.get()).king, true);
  p.beatKing();
  assert.equal(unlocks(p.get()).king, false, 'beaten: he goes home');
  const fresh = createProfile(memory());
  fresh.finishTutorial();
  assert.deepEqual(questKinds(fresh.get()), ['rift', 'duel', 'delve'], 'the test menu unlocks everything');
});

test('NPCs on the gentle run only ask for rifts', () => {
  for (let seed = 1; seed < 40; seed++) assert.equal(makeNpc(seed, { kinds: ['rift'] }).quest.kind, 'rift');
});

test('story beats are told once, in order, when they apply', () => {
  const p = createProfile(memory());
  const told = [];
  const tell = () => { for (let b = nextBeat(p.get()); b; b = nextBeat(p.get())) { told.push(b.id); p.seeStory(b.id); } };
  tell();
  assert.deepEqual(told, ['arrival']);
  p.addCards(['bunny']); p.finishRun(2); tell();
  assert.deepEqual(told, ['arrival', 'cards', 'classes', 'inn']);
  p.finishRun(2); for (let t = 0; t < 6; t++) for (const key of ['a', 'b', 'c']) p.beatBattler(`${key}${t}`, t); tell();
  assert.deepEqual(told.slice(4), ['delves', 'rumour', 'king']);
  p.addMonster({ id: 'mon-1', name: 'Fluff', level: 3 }); tell();
  assert.equal(told.at(-1), 'ranch');
  p.beatKing(); tell();
  assert.equal(told.at(-1), 'ending');
  assert.equal(told.length, BEATS.length);
  assert.equal(chapter(p.get()).n, 5);
});

test('the profile keeps cards, a deck, arcade records, the games you met, settings and a run in progress', () => {
  const storage = memory();
  const p = createProfile(storage);
  p.addCards(['bunny', 'bunny', 'yeti']);
  assert.deepEqual(p.cards(), { bunny: 2, yeti: 1 });
  p.setDeck('meadow', ['bunny']); assert.deepEqual(p.deckFor('meadow'), ['bunny']);
  p.setFaction('meadow'); assert.equal(p.faction(), 'meadow');
  p.recordArcade('tennis', { won: true, time: 31.5 }); p.recordArcade('tennis', { won: true, time: 28 }); p.recordArcade('tennis', { won: false, time: 50 });
  assert.deepEqual(p.get().arcade.tennis, { plays: 3, wins: 2, best: 28 });
  p.meet('tennis'); p.meet('tennis');
  assert.deepEqual(p.get().met, ['tennis']);
  assert.equal(p.settings().music, 0.6);
  p.setSettings({ music: 0.2, assist: true });
  assert.equal(p.settings().music, 0.2); assert.equal(p.settings().sfx, 0.8);
  p.saveRun({ v: 1, runSeed: 5, levelIndex: 3 });
  assert.equal(createProfile(storage).savedRun().levelIndex, 3, 'it survives a reload');
  p.clearRun();
  assert.equal(p.savedRun(), null);
  // an old profile (before these existed) still loads
  storage.setItem('platformer.profile.v1', JSON.stringify({ runs: 4, pets: [] }));
  const old = createProfile(storage).get();
  assert.deepEqual([old.runs, old.cardTier, old.settings.sfx, old.met.length], [4, 0, 0.8, 0]);
  // a Riftcards 1 profile: a fresh collection (the rules changed), the same standing
  storage.setItem('platformer.profile.v1', JSON.stringify({ runs: 2, cards: { zap: 2, bunny: 1 }, deck: ['zap'], cardRank: 3 }));
  const v1 = createProfile(storage).get();
  assert.deepEqual([v1.cardTier, Object.keys(v1.cards).length, v1.cardFaction, v1.cardsVersion], [3, 0, null, 2]);
});
