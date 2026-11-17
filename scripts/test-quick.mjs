/**
 * The quick test run: every test file except the slow, bot-heavy ones (the level audits, the
 * human-like balance runs, whole-run planning, the capstone checks) — about half a minute instead
 * of three. `npm test` runs everything; run this while working, the full suite before you're done.
 *
 *   npm run test:quick
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export const SLOW = ['levels', 'balance', 'boss', 'run', 'retro', 'fun', 'zonegames', 'visuals'];
const files = readdirSync('test').filter(f => f.endsWith('.test.js') && !SLOW.includes(f.replace('.test.js', ''))).map(f => `test/${f}`);
const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
