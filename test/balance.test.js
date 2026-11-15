import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, rolesOf } from '../src/battle/index.js';
import { humanize, SKILLS, BALANCE_RULES, playHuman } from '../src/battle/humanize.js';
import { baseGame } from '../src/battle/common.js';

const SEEDS = [1, 2, 3];

test('human-like players: late, in order, a bit uneven, and only so fast', () => {
  const game = { ...baseGame({ hp: 1, time: 10 }, 1), log: [], press(code) { this.log.push([code, this.time]); return 'ok'; } };
  let asked = 0;
  const policy = humanize(g => { if (asked < 3) { g.press(['KeyA', 'KeyB', 'KeyC'][asked]); asked++; } }, { ...SKILLS.average, slip: 0 }, 5);
  for (let t = 0; t < 1; t += 1 / 120) { policy(game, 1 / 120); game.time += 1 / 120; }
  assert.ok(game.log.length >= 1);
  assert.ok(game.log[0][1] > SKILLS.average.delay - 3 * SKILLS.average.jitter, `first press landed at ${game.log[0][1]}`);
  for (let i = 1; i < game.log.length; i++) assert.ok(game.log[i][1] >= game.log[i - 1][1], 'never out of order');
  assert.ok(game.log.length < 3, 'presses a frame apart are too quick for a hand: some are dropped');
  // held keys arrive late too, and in order (a release never overtakes its press)
  const held = { ...baseGame({ hp: 1, time: 10 }, 1), press() { return null; } };
  let frame = 0;
  const steer = humanize(g => { frame++; g.held.delete('ArrowLeft'); if (frame % 20 < 10) g.held.add('ArrowLeft'); }, SKILLS.novice, 3);
  for (let i = 0; i < 600; i++) steer(held, 1 / 120);
  for (let i = 0; i < 120; i++) { frame = 15; steer(held, 1 / 120); }
  assert.ok(!held.held.has('ArrowLeft'), 'let go in the end');
});

for (const mode of Object.keys(MODES)) {
  test(`balance: ${MODES[mode].name} (${mode}) suits human players`, () => {
    for (const kind of rolesOf(mode)) {
      for (const rule of BALANCE_RULES) {
        const wins = SEEDS.filter(seed => playHuman(mode, kind, rule.difficulty, rule.skill, seed).result === 'won').length;
        assert.ok(wins / SEEDS.length >= rule.minWinShare, `${mode} as ${kind}: ${rule.skill} at difficulty ${rule.difficulty} won ${wins}/${SEEDS.length}`);
      }
    }
  });
}
