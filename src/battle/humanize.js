/**
 * Human-like players for balancing: wrap a game's perfect bot so it plays the way people
 * do — a beat late, a little uneven, the odd slip of the finger, a shaky aim and only so
 * many key presses a second.
 *
 *   const policy = humanize(MODES.tennis.bot(), SKILLS.average, seed);
 *   simulate(game, policy);
 *
 * The bot decides on the current state as usual, but every press, release, click and
 * change of held keys reaches the game only `delay` (± jitter) seconds later. With
 * probability `slip` a press goes to a wrong key (or is lost); clicks and aims land up to
 * `aim` pixels off. Presses are at least `interval` seconds apart.
 */
import { mulberry32 } from '../levelGenerator.js';
import { bossStats } from '../bosses.js';
import { MODES } from './index.js';
import { simulate } from './common.js';

export const SKILLS = {
  expert: { delay: 0.09, jitter: 0.03, slip: 0.01, aim: 2, interval: 0.06 },
  average: { delay: 0.15, jitter: 0.05, slip: 0.03, aim: 4, interval: 0.09 },
  novice: { delay: 0.24, jitter: 0.08, slip: 0.06, aim: 7, interval: 0.13 },
};

const WRONG = ['KeyQ', 'KeyZ', 'KeyP', 'KeyM', 'Digit5', 'KeyG'];

export function humanize(policy, skill = SKILLS.average, seed = 1) {
  const rng = mulberry32(seed >>> 0);
  const gauss = () => { let u = 0; for (let i = 0; i < 3; i++) u += rng(); return (u - 1.5) * 2 / 1.5; };   // ~N(0, 0.5²)·2
  const queue = [];              // { at, fn, code }
  let clock = 0, lastPress = -1, lastAt = 0;
  let shadow = null;             // the held keys as the bot believes them
  let real = null;
  // events keep their order (a hand doesn't release a key before pressing it): jitter
  // stretches or squeezes the gaps but never swaps two actions
  const schedule = (fn, code = null) => {
    lastAt = Math.max(lastAt, clock + Math.max(0.02, skill.delay + gauss() * skill.jitter));
    queue.push({ at: lastAt, fn, code });
  };
  return (g, dt = 1 / 120) => {
    clock += dt;
    // act on what's due
    while (queue.length && queue[0].at <= clock) queue.shift().fn(g);
    if (!shadow) { shadow = new Set(g.held); real = g.held; }
    const before = new Set(shadow);
    const proxy = new Proxy(g, {
      get(target, key) {
        if (key === 'held') return shadow;
        if (key === 'press') return code => {
          // a press already on its way isn't pressed again (the bot keeps asking until it sees the effect)
          if (queue.some(q => q.code === code)) return 'queued';
          if (clock - lastPress < skill.interval) return null;
          lastPress = clock;
          let c = code;
          const r = rng();
          if (r < skill.slip / 2) return null;                                   // lost
          if (r < skill.slip) c = WRONG[Math.floor(rng() * WRONG.length)];       // fat finger
          shadow.add(code);
          schedule(t => { t.held.add(c); t.press(c); }, code);
          return 'queued';
        };
        if (key === 'release') return code => { shadow.delete(code); schedule(t => t.release(code)); };
        if (key === 'click') return (x, y) => { const nx = x + gauss() * skill.aim, ny = y + gauss() * skill.aim; schedule(t => t.click?.(nx, ny)); return 'queued'; };
        if (key === 'aimAt') return (x, y) => { const nx = x + gauss() * skill.aim, ny = y + gauss() * skill.aim; schedule(t => t.aimAt?.(nx, ny)); };
        const v = target[key];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    policy(proxy, dt);
    // held-key changes reach the game late too
    const added = [...shadow].filter(k => !before.has(k)), removed = [...before].filter(k => !shadow.has(k));
    if (added.length || removed.length) schedule(t => { for (const k of added) t.held.add(k); for (const k of removed) { t.held.delete(k); t.release?.(k); } });
    void real;
  };
}

/**
 * What "balanced" means here (test/balance.test.js; `npm run balance` prints the full table):
 * with these human-like players, at the campaign's easy / medium / hard settings
 *   - an expert wins almost always, even at the hardest settings
 *   - an average player wins most of the time at medium settings and often at hard ones
 *   - a novice still wins a fair share at the easy settings
 * Wins rest on technique (timing, reading the play, steering) more than raw speed.
 */
export const BALANCE_RULES = [
  { skill: 'expert', difficulty: 0.95, minWinShare: 0.66 },
  { skill: 'average', difficulty: 0.5, minWinShare: 0.66 },
  { skill: 'novice', difficulty: 0.1, minWinShare: 0.33 },
];

/** One game played by a human-like player of `skill`: the finished game state. */
export function playHuman(mode, kind, difficulty, skill, seed) {
  const boss = { mode, kind, ...bossStats(mode, difficulty, () => 0.5, 0, 0, kind) };
  const game = MODES[mode].create(boss, { seed });
  return simulate(game, humanize(MODES[mode].bot({ lead: SKILLS[skill].delay }), SKILLS[skill], seed * 31 + 7));
}
