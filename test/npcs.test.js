/**
 * NPCs: generated folk with silly faces, a quest (rift or duel) and a trade; where they
 * stand in a level; their faces in 3D, in the duel sprite and in the dialog portrait.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNpc, sillyFace, facesDiffer, faceKey, planNpcs, tradeOffer, questPitch, questDone, FACE_PARTS, RIFT_TWISTS, faceOddness, ODDNESS_BUDGET, DROPPED_FACE_PARTS, mayorNpc, SKIN_TONES, makeGroup, regularNpc, backdropOf, weirdness, WEIRDNESS_BUDGET, lookDifference } from '../src/characters/npcs.js';
import { colorDistance, oklab, FANTASY_SKINS, HUMAN_SKINS, isFantasySkin, spreadHues, hueGap, distinct } from '../src/characters/looks.js';
import { makeBoss, backdropHues } from '../src/progression/bosses.js';
import { DEFAULT_CHARACTERS } from '../src/characters/character.js';
import { placeNpc, createNpcActor, NPC_RULES } from '../src/characters/npcWorld.js';
import { paintNpcPortrait, portraitPalette, PORTRAIT_SIZE } from '../src/characters/npcFace.js';
import { paintHero } from '../src/characters/heroSprite.js';
import { createAvatar } from '../src/characters/avatar.js';
import { levels, TIERS } from '../src/levels/index.js';
import { auditLevel, topOf } from '../src/levels/audit.js';
import { placeArcade } from '../src/world/arcade.js';
import { UNLOCKABLES, RARITIES, STYLE_OPTIONS } from '../src/characters/character.js';
import { mulberry32 } from '../src/levels/generator.js';

test('an NPC is made from a seed: the same seed, the same silly person', () => {
  const a = makeNpc(42, { zone: 'volcano', stage: 2 }), b = makeNpc(42, { zone: 'volcano', stage: 2 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(makeNpc(43).face, a.face);
  assert.match(a.name, /^\w+ \w+$/);
  assert.ok(a.job);
  for (const [k, options] of Object.entries(STYLE_OPTIONS)) assert.ok(options.some(([v]) => v === a.design[k]), `${k}: ${a.design[k]}`);
});

test('silly faces: every part turns up, faces are (nearly) all different, and a run’s NPCs never look alike', () => {
  const rng = mulberry32(7), keys = new Set(), seen = Object.fromEntries(Object.keys(FACE_PARTS).map(k => [k, new Set()]));
  for (let i = 0; i < 3000; i++) { const f = sillyFace(rng); keys.add(faceKey(f)); for (const k of Object.keys(FACE_PARTS)) seen[k].add(f[k]); }
  assert.ok(keys.size > 2850, `${keys.size} different faces in 3000`);
  for (const [k, options] of Object.entries(FACE_PARTS)) assert.equal(seen[k].size, new Set(options).size, `every ${k} turns up`);
  // silly, not unsettling: the dropped features never come back, and no face is over the oddness budget
  for (let i = 0; i < 2000; i++) {
    const f = sillyFace(rng);
    assert.ok(faceOddness(f) <= ODDNESS_BUDGET, `face ${faceKey(f)} is too odd`);
    for (const [k, dropped] of Object.entries(DROPPED_FACE_PARTS)) assert.ok(!dropped.includes(f[k]), `${k}: ${f[k]}`);
  }
  assert.ok(faceOddness(mayorNpc().face) <= 2, 'the mayor: eccentric, but friendly');
  for (let seed = 1; seed < 300; seed++) assert.notEqual(makeNpc(seed).design.colors.eyes, '#8a1f1f', 'no red (bloodshot-looking) eyes on NPCs');
  for (let seed = 1; seed < 100; seed++) {
    const n = makeNpc(seed);
    assert.ok(SKIN_TONES.includes(n.design.colors.skin));
    assert.ok(!(n.design.hair === 'mohawk' && n.design.hat !== 'none'), 'no mohawk under a hat (reads as a headdress)');
  }
  // no mini-game twice in a run: a duel that isn't allowed becomes a delve (or a rift)
  for (let seed = 1; seed < 60; seed++) { const q = makeNpc(seed, { kinds: ['rift', 'delve'] }).quest.kind; assert.ok(q === 'rift' || q === 'delve'); }
  for (let run = 1; run <= 20; run++) {
    const faces = [];
    for (let k = 0; k < 7; k++) { const npc = makeNpc(run * 100 + k, { faces }); faces.push(npc.face); }
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) assert.ok(facesDiffer(faces[i], faces[j]) >= 3, `run ${run}: NPCs ${i} and ${j} look alike`);
  }
});

test('looks: people seen together are easy to tell apart — skins spread light to dark, clothes far apart, nobody blends in', () => {
  const hero = DEFAULT_CHARACTERS[0];
  const minPair = (xs, f) => { let m = Infinity; for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) m = Math.min(m, f(xs[i], xs[j])); return m; };
  let fantasy = 0, people = 0;
  for (let visit = 1; visit <= 80; visit++) {
    const zone = ['meadow', 'canyon', 'alpine', 'starlit', 'lagoon', 'grove', 'volcano', 'crystal'][visit % 8];
    const group = makeGroup([0, 1, 2, 3].map(i => ({ seed: visit * 10 + i, zone, quest: false })), { context: [hero] });
    const d = group.map(n => n.design.colors);
    assert.equal(new Set(d.map(c => c.skin)).size, 4, 'four different skin tones');
    // and shapes: build, hat, wings or cape, hair, top — as different as a dozen tries allow
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(lookDifference(group[i].design, group[j].design) >= 7, `visit ${visit}: people ${i} and ${j} are shaped alike`);
    assert.ok(d.filter(c => isFantasySkin(c.skin)).length <= 1, 'at most one fantasy tone in four');
    const humans = d.map(c => c.skin).filter(x => !isFantasySkin(x)).map(x => oklab(x)[0]);
    if (humans.length >= 3) assert.ok(Math.max(...humans) - Math.min(...humans) > 0.3, `visit ${visit}: skins span light to dark`);
    assert.ok(minPair(d, (a, b) => colorDistance(a.top, b.top)) > 0.12, `visit ${visit}: tops far apart`);
    for (const c of d) {
      assert.ok(colorDistance(c.hair, c.skin) >= 0.14, 'hair reads against the face');
      assert.ok(colorDistance(c.bottom, c.top) >= 0.16, 'trousers are not the top');
      assert.ok(distinct(c.hat, c.hair) && distinct(c.hair, c.top), 'a hat reads against the hair, the hair against the top (at sprite size)');
      assert.ok(colorDistance(c.top, hero.colors.top) >= 0.07, 'nobody wears the hero’s top colour');
      for (const b of backdropOf(zone)) assert.ok(colorDistance(c.top, b) >= 0.12, `${zone}: a top blends into the backdrop`);
      people++; if (isFantasySkin(c.skin)) fantasy++;
    }
  }
  assert.ok(fantasy / people > 0.08 && fantasy / people < 0.3, `fantasy skins now and then (${fantasy}/${people})`);
  // fantasy tones: clearly coloured and mid-dark — never greyish (sickly) or light (lavender, popping off the screen)
  for (const t of FANTASY_SKINS) { const [L, a, b] = oklab(t); assert.ok(L < 0.72 && Math.hypot(a, b) > 0.07, t); }
  assert.ok(HUMAN_SKINS.every(t => !isFantasySkin(t)));
  // the Ring's three tamers beside the regulars: never two alike in shape
  const regs = ['keeper', 'barmaid', 'tailor', 'master'].map(id => regularNpc(id).design);
  for (let visit = 1; visit <= 60; visit++) {
    const t = makeGroup([0, 1, 2].map(i => ({ seed: visit * 7 + i, quest: false })), { context: [...regs, hero] });
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(lookDifference(t[i].design, t[j].design) >= 8, `visit ${visit}: tamers ${i} and ${j} look alike`);
  }
  // the hand-made folk in one place are dressed apart too: the inn's regulars, the mayor
  const inn = ['keeper', 'barmaid', 'tailor', 'master'].map(id => regularNpc(id).design.colors);
  assert.ok(minPair([...inn, mayorNpc().design.colors], (a, b) => colorDistance(a.top, b.top)) > 0.12, 'the regulars wear different colours');
});

test('weirdness: nobody is too strange all at once — in 3D as well as 2D — and fantasy faces stay plain and friendly', () => {
  let fantasy = 0;
  for (let seed = 1; seed <= 1500; seed++) {
    const n = makeNpc(seed);
    assert.ok(weirdness(n) <= WEIRDNESS_BUDGET, `npc ${seed}: weirdness ${weirdness(n)}`);
    if (isFantasySkin(n.design.colors.skin)) {
      fantasy++;
      const f = n.face;
      assert.ok(!['walrus', 'curly', 'beard'].includes(f.whiskers) && f.ears !== 'big' && f.mouth !== 'frown' && f.brows !== 'angry' && f.nose !== 'pig', `npc ${seed}: a plain, friendly fantasy face`);
    }
    if (n.face.eyes === 'stalks') assert.ok(['none', 'headband', 'crown', 'gemcrown', 'halo', 'flowers'].includes(n.design.hat), 'eye stalks never under a hat that covers the head');
  }
  assert.ok(fantasy > 100, 'fantasy folk still turn up');
  for (const n of [mayorNpc(), ...['keeper', 'barmaid', 'tailor', 'master'].map(regularNpc)]) {
    assert.ok(weirdness(n) <= 2, `${n.first} is a friendly face`);
    assert.ok(!isFantasySkin(n.design.colors.skin), `${n.first}: the hand-made regulars are people`);
  }
});

test('looks: a stage’s bosses come in three far-apart colours, off their backdrop', () => {
  for (let run = 1; run <= 40; run++) for (const zone of ['meadow', 'canyon', 'alpine', 'starlit', 'lagoon', 'grove', 'volcano', 'crystal']) {
    const hues = [0, 1, 2].map(slot => makeBoss({ runSeed: run, index: 3 + slot, slot, tier: zone, check: false }).hue);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(hueGap(hues[i], hues[j]) >= 100, `run ${run} ${zone}: bosses ${hues}`);
  }
  const triad = spreadHues(3, { seed: 4, avoid: backdropHues('meadow') });
  assert.ok(Math.min(...triad.flatMap(h => backdropHues('meadow').map(a => hueGap(h, a)))) >= 30, 'turned away from the meadow’s sky and grass');
});

test('trades: an NPC wears something you don’t have, rarer further into a run; nothing new when you own it all', () => {
  const owned = UNLOCKABLES.filter(u => u.rarity === 'common').map(u => u.id);
  for (let seed = 1; seed < 60; seed++) {
    const npc = makeNpc(seed, { stage: seed % 4, owned });
    if (!npc.offer) continue;
    assert.ok(!owned.includes(npc.offer.id));
    if (npc.offer.slot !== 'trail') assert.equal(npc.design[npc.offer.slot], npc.offer.value, 'they wear what they offer');
  }
  const rank = r => RARITIES.indexOf(r);
  const avg = stage => { let s = 0; for (let i = 0; i < 200; i++) s += rank(tradeOffer(mulberry32(i), { stage }).rarity); return s / 200; };
  assert.ok(avg(3) > avg(0) + 1, 'the last stage’s traders carry rarer things');
  assert.equal(tradeOffer(mulberry32(1), { owned: UNLOCKABLES.map(u => u.id) }), null);
});

test('quests: rifts (with a twist), duels and delves, with something to say before and after', () => {
  const kinds = new Set(), twists = new Set();
  for (let seed = 1; seed < 80; seed++) {
    const npc = makeNpc(seed);
    kinds.add(npc.quest.kind);
    if (npc.quest.kind === 'rift') { twists.add(npc.quest.twist); assert.ok(RIFT_TWISTS[npc.quest.twist]); }
    if (npc.quest.kind === 'delve') assert.ok(questPitch(npc).includes(npc.quest.place));
    assert.ok(questPitch(npc).length > 20);
    assert.ok(questDone(npc, true) && questDone(npc, false));
  }
  assert.deepEqual([...kinds].sort(), ['delve', 'duel', 'rift']);
  assert.deepEqual([...twists].sort(), Object.keys(RIFT_TWISTS).sort());
  assert.equal(makeNpc(5, { quest: false }).quest, null, 'villagers just trade and chat');
});

test('one NPC per stage, in its first or second level (never the capstone)', () => {
  for (let run = 1; run <= 30; run++) {
    const plan = planNpcs(run, TIERS.map(t => t.levels.length));
    assert.equal(plan.length, TIERS.length);
    let start = 0;
    plan.forEach((p, k) => {
      assert.ok(p.level === start || p.level === start + 1, `stage ${k}: level ${p.level}`);
      start += TIERS[k].levels.length;
    });
  }
});

test('an NPC stands on the route, off to the side, never on the goal, a spring or the arcade', () => {
  for (const level of levels) {
    const audit = auditLevel(level);
    const arcade = placeArcade(level, audit);
    const spot = placeNpc(level, audit, { avoid: [arcade] });
    assert.ok(spot, level.name);
    const p = level.platforms[spot.platform];
    assert.ok(Math.abs(spot.y - topOf(p)) < 1e-9, 'on its platform');
    assert.ok(Math.abs(spot.x - p.x) <= p.width / 2 && Math.abs(spot.z - p.z) <= p.depth / 2, 'inside it');
    assert.ok(!p.spring);
    if (arcade) assert.notEqual(spot.platform, arcade.platform, `${level.name}: not on the arcade's platform`);
    assert.ok(Math.hypot(spot.x - level.goal.x, spot.z - level.goal.z) > 1, 'not on the gem');
  }
  assert.ok(NPC_RULES.talkRadius > 1);
});

test('NPC faces: in 3D (more parts than a plain face), in the duel sprite, and as a big portrait', () => {
  const plain = createAvatar({ random: () => 0.5 });
  for (let seed = 1; seed <= 40; seed++) {
    const npc = makeNpc(seed);
    const actor = createNpcActor(npc, { x: 0, y: 0.5, z: 0, platform: 0, facing: Math.PI });
    actor.update(1 / 60, { x: 1, y: 0.5, z: 1 });
    const parts = actor.parts(1);
    assert.ok(parts.every(p => p.matrix.length === 16 && p.matrix.every(Number.isFinite)), `seed ${seed}: finite parts`);
    plain.setCharacter(npc.design);
    assert.ok(parts.length >= plain.getParts({ x: 0, y: 0, z: 0 }).length - 4, 'a whole person');
    const spr = paintHero({ ...npc.design, silly: npc.face }, 'side', 'idle');
    assert.ok(spr.buf.some(Boolean));
    const portrait = paintNpcPortrait(npc, { t: 1, talk: 1 });
    assert.equal(portrait.w, PORTRAIT_SIZE);
    assert.ok(portrait.buf.every(v => v > 0 && v < portraitPalette(npc).length), 'every portrait pixel is painted');
  }
  const a = paintNpcPortrait(makeNpc(1)), b = paintNpcPortrait(makeNpc(2));
  assert.notDeepEqual(a.buf, b.buf);
  const blink = paintNpcPortrait(makeNpc(1), { blink: true });
  assert.notDeepEqual(a.buf, blink.buf, 'they blink');
});
