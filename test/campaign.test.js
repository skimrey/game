import test from 'node:test';
import assert from 'node:assert/strict';
import { levels, TIERS, handcraftedLevels, generatedLevels, GENERATED_CAMPAIGN } from '../src/levels.js';
import { auditCampaign, describeLevel, signatureDistance, CAMPAIGN_RULES } from '../src/campaignAudit.js';
import { THEMES } from '../src/levelGenerator.js';

const described = levels.map(l => describeLevel(l));
const codes = result => result.issues.map(i => i.code);

test('the campaign passes the campaign audit: distinct levels, a steady ramp, the full movement vocabulary', () => {
  const result = auditCampaign(levels, TIERS, described);
  assert.ok(result.ok, JSON.stringify(result.issues, null, 1));
});

test('challenge and jump precision rise level by level, and par time grows without cliffs', () => {
  for (let i = 1; i < described.length; i++) {
    const a = described[i - 1], b = described[i];
    assert.ok(b.challenge > a.challenge, `${b.name} (${b.challenge.toFixed(2)}) after ${a.name} (${a.challenge.toFixed(2)})`);
    // jump precision alone may dip a little where a level trades it for fights (a gauntlet)
    assert.ok(b.rating >= a.rating - 0.3, `${b.name} rating ${b.rating.toFixed(2)} after ${a.rating.toFixed(2)}`);
    assert.ok(b.parTime <= a.parTime * CAMPAIGN_RULES.MAX_PAR_GROWTH, `${b.name} par ${b.parTime.toFixed(1)}`);
  }
});

test('every movement option is used: the dash from the dash lesson on, long drops, shortcuts, false paths', () => {
  const first = move => described.findIndex(d => d.moves[move]);
  assert.equal(levels[first('dash')].name, 'Mind the Gap');
  assert.ok(levels[first('dash')].hint, 'the dash lesson shows a hint');
  assert.ok(first('longDrop') > first('dash') - 1 && first('longDrop') <= 5);
  for (const move of ['dash', 'longDrop', 'shortcut', 'falsePath', 'stomp', 'poundOrDash']) {
    assert.ok(first(move) >= 0 && first(move) <= 5, `${move} is introduced in the hand-made tiers`);
    for (const tier of TIERS.slice(2)) assert.ok(described.some(d => d.tier === tier.id && d.moves[move]), `${move} in ${tier.id}`);
  }
});

test('generated levels each have a theme, none repeated within a tier', () => {
  assert.equal(generatedLevels.length, GENERATED_CAMPAIGN.length);
  for (const tier of TIERS.slice(2)) {
    const themes = tier.levels.map(l => l.meta.theme);
    assert.ok(themes.every(t => THEMES[t]), themes.join());
    assert.equal(new Set(themes).size, themes.length, `${tier.id}: ${themes}`);
  }
  for (const level of generatedLevels) assert.match(level.hint, new RegExp(THEMES[level.meta.theme].label));
});

test('the audit catches look-alikes, difficulty drops and missing moves', () => {
  const tiers = [{ id: 'a', levels: [] }, { id: 'b', levels: [] }];
  const tag = (level, tier) => ({ ...level, tier });
  const [first, second, third, dash] = handcraftedLevels.map((l, i) => tag(l, i < 3 ? 'a' : 'b'));

  const twin = { ...first, name: 'First steps again' };
  const alike = auditCampaign([first, twin], tiers);
  assert.ok(codes(alike).includes('TOO_SIMILAR'));
  assert.ok(signatureDistance(describeLevel(first), describeLevel(twin)) < 1e-9);

  const backwards = auditCampaign([third, second], tiers);
  assert.ok(codes(backwards).includes('CHALLENGE_DROP'));

  const noDash = auditCampaign([first, second, third], tiers);
  assert.ok(codes(noDash).includes('MOVE_UNUSED'));

  const untaught = auditCampaign([first, { ...dash, hint: undefined }], tiers);
  assert.ok(codes(untaught).includes('UNTAUGHT'));
});
