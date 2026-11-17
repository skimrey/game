/**
 * The keys of every mini-game, in one place and one shape — shown the same way in every game
 * (a strip along the bottom while you play, and on the rules card), always ending with the
 * same two: spells (1–5, Tab) and pause (Esc). Move is always the arrows or WASD; the main
 * action is Space wherever a game has one.
 *
 *   each game's index.js: keys: [[keys, what], …]   ·   keysFor(game) adds the common ones
 */
/** Always last, in every game. */
export const COMMON_KEYS = [['1–5 / Tab', 'spells'], ['Esc', 'pause']];

/** A game's keys (its own — the descriptor's `keys` — then the common ones). */
export function keysFor(game, { spells = true } = {}) {
  return [...(game?.keys || []), ...COMMON_KEYS.filter(([k]) => spells || k !== '1–5 / Tab')];
}
