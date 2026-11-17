#!/usr/bin/env node
/**
 * Balance report — every mini-game, in every role, at easy / medium / hard settings,
 * played by human-like bots (games/kit/humanize.js: novice, average, expert) over several
 * seeds. Prints win rates, how much of the clock a win takes and hearts left.
 *
 *   node scripts/balance-report.mjs [--seeds 8] [mode …]
 *
 * The tests hold every game to: the average player wins most of the time even at the
 * hardest settings, an expert nearly always, a novice often at the easy ones (see
 * test/balance.test.js and BALANCE_RULES).
 */
import { MODES, rolesOf } from '../src/games/index.js';
import { SKILLS, playHuman } from '../src/games/kit/humanize.js';

const args = process.argv.slice(2);
const SEEDS = Number(args[args.indexOf('--seeds') + 1]) || 8;
const only = args.filter(a => MODES[a]);

console.log(`mode        role        diff | ${Object.keys(SKILLS).map(k => k.padEnd(13)).join(' | ')}`);
for (const mode of only.length ? only : Object.keys(MODES)) {
  for (const kind of rolesOf(mode)) {
    for (const d of [0.1, 0.5, 0.95]) {
      const cells = Object.keys(SKILLS).map(skill => {
        let wins = 0, share = 0, hearts = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
          const g = playHuman(mode, kind, d, skill, seed);
          if (g.result === 'won') { wins++; share += g.time / g.boss.time; hearts += g.hearts; }
        }
        return `${String(Math.round(100 * wins / SEEDS)).padStart(3)}% ${wins ? (share / wins).toFixed(2) : ' -  '} ♥${wins ? (hearts / wins).toFixed(1) : '-'}`;
      });
      console.log(`${mode.padEnd(11)} ${kind.padEnd(11)} ${d.toFixed(2)} | ${cells.join(' | ')}`);
    }
  }
}
