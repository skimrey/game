/**
 * Classes and the spellbook: every spell works in every mini-game (they only touch what all
 * games share), NPCs offer unlearned spells of your class, casting rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, rolesOf } from '../src/games/index.js';
import { bossStats } from '../src/progression/bosses.js';
import { hurt, good } from '../src/games/kit/common.js';
import { CLASSES, CLASS_IDS, SPELLS, SPELLBOOK, SPELL_RULES, createSpellRuntime, spellOffer, unlearned, spellIcon } from '../src/progression/spells.js';

const DT = 1 / 120;
const game = (mode, kind = rolesOf(mode)[0]) => MODES[mode].create({ mode, kind, ...bossStats(mode, 0.4, () => 0.5, 0, 0, kind) }, { seed: 3 });
const stepWith = (g, rt, seconds) => { for (let t = 0; t < seconds; t += DT) { g.step(DT); rt.afterStep(g); rt.tick(DT); g.drain(); rt.drained(); } };

test('three classes, six spells each; every class starts with its signature spell', () => {
  assert.deepEqual(CLASS_IDS, ['warrior', 'hunter', 'sorcerer']);
  for (const c of CLASS_IDS) {
    assert.equal(SPELLBOOK[c].length, 6);
    assert.ok(SPELLBOOK[c].includes(CLASSES[c].signature));
    assert.equal(SPELLS[CLASSES[c].signature].kind, 'active', 'something to press from the start');
    // complementary: each book can survive, win faster and has a passive
    const book = SPELLBOOK[c].map(id => SPELLS[id]);
    assert.ok(book.some(s => s.effect?.guard || s.effect?.heal), `${c}: survive`);
    assert.ok(book.some(s => s.effect?.hit || s.effect?.volley || s.effect?.slow), `${c}: win faster`);
    assert.ok(book.filter(s => s.kind === 'passive').length >= 1, `${c}: a passive`);
  }
  assert.ok(SPELL_RULES.maxKnown >= 5, 'the signature spell + one per stage');
  for (const id of Object.keys(SPELLS)) assert.ok(spellIcon(id).buf.some(Boolean), `${id} has an icon`);
});

test('an NPC offers spells of your class you don’t know yet (two to choose from, fewer when the book runs out)', () => {
  const known = ['shieldwall'];
  const offer = spellOffer('warrior', known, () => 0.3);
  assert.equal(offer.length, 2);
  assert.ok(offer.every(id => SPELLS[id].cls === 'warrior' && !known.includes(id)));
  assert.deepEqual(spellOffer('hunter', SPELLBOOK.hunter.slice(0, 5), () => 0.5), [SPELLBOOK.hunter[5]]);
  assert.deepEqual(unlearned('sorcerer', SPELLBOOK.sorcerer), []);
});

for (const mode of Object.keys(MODES)) {
  test(`spells work in ${MODES[mode].name} (${mode})`, () => {
    // guard: a hit doesn't cost a heart
    let g = game(mode), rt = createSpellRuntime(['shieldwall']);
    rt.begin(g); stepWith(g, rt, 0.5);
    assert.equal(rt.cast(0, g).ok, true);
    g.invulnerable = 0;
    const hearts = g.hearts;
    if (hurt(g)) { rt.afterStep(g); assert.equal(g.hearts, hearts, 'guarded'); }
    assert.equal(rt.cast(0, g).reason, 'spent', 'one cast per battle');
    // heal
    g = game(mode); rt = createSpellRuntime(['secondwind']); rt.begin(g);
    assert.equal(rt.cast(0, g).reason, 'full', 'no healing at full hearts');
    g.invulnerable = 0; hurt(g); rt.afterStep(g);
    if (g.hearts < g.maxHearts) { assert.equal(rt.cast(0, g).ok, true); assert.equal(g.hearts, g.maxHearts); }
    // hits (cleave) and volleys
    g = game(mode); rt = createSpellRuntime(['cleave']); rt.begin(g);
    const hp = g.bossHp; rt.cast(0, g);
    assert.equal(g.bossHp, Math.max(0, hp - 2));
    g = game(mode); rt = createSpellRuntime(['volley']); rt.begin(g);
    const hp2 = g.bossHp; rt.cast(0, g); stepWith(g, rt, 1.6);
    assert.ok(g.bossHp <= Math.max(0, hp2 - 2), `volley landed (${hp2} → ${g.bossHp})`);
    // slow motion and time
    g = game(mode); rt = createSpellRuntime(['timewarp', 'chronoshift']); rt.begin(g);
    rt.cast(0, g); assert.equal(rt.timeScale, 0.4);
    rt.tick(5.1); assert.equal(rt.timeScale, 1);
    const left = g.timeLeft; rt.cast(1, g); assert.equal(g.timeLeft, left + 20);
    // passives
    g = game(mode); rt = createSpellRuntime(['ironskin', 'keensenses']);
    const [mh, tl] = [g.maxHearts, g.timeLeft]; rt.begin(g);
    assert.equal(g.maxHearts, mh + 1); assert.equal(g.hearts, mh + 1); assert.equal(g.timeLeft, tl + SPELL_RULES.keenSenses);
    g = game(mode); rt = createSpellRuntime(['thorns', 'laststand']); rt.begin(g);
    const hp3 = g.bossHp;
    g.invulnerable = 0; g.hearts = 1; hurt(g); rt.afterStep(g);
    assert.equal(g.result, 'playing', 'last stand');
    assert.equal(g.hearts, 1);
    assert.equal(g.bossHp, hp3 - 1, 'thorns');
    g.invulnerable = 0; hurt(g); rt.afterStep(g);
    assert.equal(g.result, 'lost', 'only once');
    g = game(mode); rt = createSpellRuntime(['predator']); rt.begin(g);
    const hp4 = g.bossHp;
    for (let i = 0; i < SPELL_RULES.predatorEvery; i++) good(g);
    rt.afterStep(g);
    assert.equal(g.bossHp, hp4 - 1, 'predator');
    // echo: two casts of everything
    g = game(mode); rt = createSpellRuntime(['mend', 'echo']); rt.begin(g);
    assert.equal(rt.active[0].left, 2);
  });
}

test('1–5 are always spell keys: no game types them (Key Jump’s digits are 6–9 and 0)', async () => {
  const { keyPool, SPELL_DIGITS } = await import('../src/games/kit/common.js');
  const labels = keyPool('letters+digits').map(k => k.label);
  for (const d of SPELL_DIGITS) assert.ok(!labels.includes(d), d);
  for (const d of ['6', '7', '8', '9', '0']) assert.ok(labels.includes(d), d);
});
