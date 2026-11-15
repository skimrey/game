import test from 'node:test';
import assert from 'node:assert/strict';
import { levels, TIERS, handcraftedLevels } from '../src/levels.js';
import { remixLevel, createRunPlanner, checkCandidate, baseCampaign, signatureOf, RUN_RULES } from '../src/runLevels.js';
import { CAMPAIGN_SIGNATURES } from '../src/campaignSignatures.js';
import { auditCampaign, describeLevel } from '../src/campaignAudit.js';
import { auditLevel } from '../src/levelAudit.js';
import { auditFun } from '../src/funAudit.js';
import { auditEncounters } from '../src/encounterAudit.js';

const base = baseCampaign().map(s => signatureOf(describeLevel(s.level)));

test('the saved campaign signatures are current (run `npm run levels:signatures` after editing levels)', () => {
  assert.deepEqual(CAMPAIGN_SIGNATURES, base);
});

test('a mirrored hand-made level is exactly as playable as the original', () => {
  for (const level of handcraftedLevels) {
    const mirrored = remixLevel(level, 1, { strength: 0, mirror: true });
    assert.equal(mirrored.meta.remix.mirrored, true);
    assert.equal(mirrored.platforms[1].x, -level.platforms[1].x);
    const audit = auditLevel(mirrored);
    assert.ok(audit.ok && audit.warnings.length === 0, `${level.name}: ${[...audit.errors, ...audit.warnings].map(e => e.code)}`);
    assert.ok(auditFun(mirrored, audit).ok, level.name);
    assert.ok(auditEncounters(mirrored, audit).ok, level.name);
  }
});

test('a run: new layouts in most slots, every one re-checked, the whole run passes the campaign audit', () => {
  const planner = createRunPlanner(11, { baseDescriptions: base });
  const results = [];
  while (!planner.done) results.push(planner.next());
  const run = results.map(r => r.level);
  assert.equal(run.length, levels.length);
  run.forEach((level, i) => assert.equal(level.tier, levels[i].tier));
  const changed = results.filter(r => r.source !== 'base').length;
  assert.ok(changed >= 9, `only ${changed} of ${run.length} levels are new`);
  assert.ok(results.some(r => r.source === 'generated'), 'fresh generated layouts');
  assert.ok(results.some(r => r.source === 'remix' && r.level.meta.remix.mirrored), 'mirrored remixes');
  const campaign = auditCampaign(run, TIERS);
  assert.ok(campaign.ok, campaign.issues.map(i => i.message).join('\n'));
  assert.equal(new Set(run.map(l => l.name)).size, run.length, 'names are unique');
  // any mix of the run's levels and the hand-written ones is fine too (the player may
  // reach a level before the worker has planned it)
  const mixed = run.map((level, i) => (i % 2 ? levels[i] : level));
  const mixedAudit = auditCampaign(mixed, TIERS);
  assert.ok(mixedAudit.ok, mixedAudit.issues.map(i => i.message).join('\n'));
});

test('runs are reproducible from the seed, and differ between seeds', () => {
  const plan = (seed, n) => { const p = createRunPlanner(seed, { baseDescriptions: base }); return Array.from({ length: n }, () => p.next().level); };
  const a = plan(5, 4), b = plan(5, 4), c = plan(6, 4);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map(l => l.platforms), c.map(l => l.platforms));
  // seed 0 is the hand-written campaign
  const zero = plan(0, 3);
  zero.forEach((level, i) => assert.equal(level, levels[i]));
});

test('the checks reject levels that would break the campaign', () => {
  const i = 4;                          // Long Way Down
  const desc = describeLevel(levels[i]);
  const ok = checkCandidate(desc, i, base, []);
  assert.ok(ok.ok, ok.issues.join());
  const flat = { ...desc, moves: { ...desc.moves, dash: false } };
  assert.match(checkCandidate(flat, i, base, []).issues.join(), /drops dash/);
  const harder = { ...desc, challenge: base[i + 1].challenge + 0.5 };
  assert.match(checkCandidate(harder, i, base, []).issues.join(), /above the level after/);
  const easier = { ...desc, challenge: base[i - 1].challenge - 0.5 };
  assert.match(checkCandidate(easier, i, base, []).issues.join(), /below the level before/);
  const longer = { ...desc, parTime: base[i].parTime * 2 };
  assert.match(checkCandidate(longer, i, base, []).issues.join(), /par time/);
  const twin = { ...desc, features: base[i + 1].features, name: 'Twin' };
  assert.match(checkCandidate(twin, i, base, []).issues.join(), /too like/);
  assert.ok(RUN_RULES.MAX_SHIFT < 1.5);
});
