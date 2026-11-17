/**
 * The computer player for Riftcards.
 *
 * heuristicMove — quick habits. It tries every card on a copy of the table and weighs what
 * each gains (strength, cards: a spy is worth one) against what it costs to spend (strong cards
 * and bond partners are kept for later rounds). And it plays the rounds like a good player:
 *   - round one: get ahead cheaply, then pass and make them spend cards to catch up (unless a
 *     spy just lured it ahead); far behind: let the round go and save the cards
 *   - it won a round: let them fight for the next unless it has cards to spare
 *   - it must win this round: stay ahead as cheaply as it can, and stop once they can't catch up
 *   - the other side passed: win with the cheapest card that does it, or let the round go if
 *     that costs too much (unless losing it loses the match)
 * skill 0..1: how often it plays like that; otherwise a beginner's move (throw in the biggest
 * card, a random one, or give up the round too soon) — the first tiers are sloppy on purpose.
 *
 * searchMove — looking ahead, for the sharpest players (skill ≥ 0.95: Champions and the Rift
 * King): each sensible move is tried on copies of the match where the other side's unseen cards
 * are reshuffled, played out with the habits, and the move that wins most often is kept.
 *
 *   const move = chooseMove(match, { skill, rng })   // { hand, row } or { pass: true }
 * Deterministic for a given rng.
 */
import { legalMoves, playCard, pass, cloneMatch, total, other } from './match.js';
import { CARDS, cardPower } from './catalog.js';

/**
 * What a card in hand is worth keeping: its power — more for a bond card whose partners are
 * in hand too (together they multiply; alone, it's just a small creature).
 */
function worth(pl, id) {
  const c = CARDS[id];
  let v = cardPower(id);
  if (c.ability === 'bond') {
    const mates = pl.hand.filter(x => x === id).length - 1 + pl.rows[c.row].filter(u => u.id === id).length;
    v += c.str * mates * 1.5;
  }
  return v;
}

export function heuristicMove(m, { skill = 1, rng = Math.random } = {}) {
  const p = m.active, o = other(p), me = m.players[p], opp = m.players[o];
  if (!me.hand.length) return { pass: true };
  const diff = total(m, p) - total(m, o);
  const mustWin = me.gems === 1, theyMust = opp.gems === 1;
  const finalRound = mustWin && theyMust;
  const plays = legalMoves(m).filter(x => !x.pass);
  if (rng() > skill) {                                           // a sloppy move, like a beginner's
    if (opp.passed && diff > 0) return { pass: true };
    const roll = rng();
    if (roll < 0.2 && !opp.passed && !(mustWin && theyMust) && me.hand.length < opp.hand.length + 3) return { pass: true };   // gives up too soon
    if (roll < 0.65) {                                                 // throws in the biggest card
      const big = plays.reduce((a, x) => (cardPower(me.hand[x.hand]) > cardPower(me.hand[a.hand]) ? x : a), plays[0]);
      return big;
    }
    return plays[Math.floor(rng() * plays.length)];
  }
  const rated0 = plays.map(x => {
    const s = cloneMatch(m);
    playCard(s, x.hand, x.row);
    const after = total(s, p) - total(s, o);
    const gain = after - diff;
    const cards = s.players[p].hand.length - (me.hand.length - 1);       // spies: +2
    return { ...x, gain, after, cards, value: worth(me, me.hand[x.hand]) };
  });
  // a card that adds nothing (clear skies on a clear table, frost that hurts us) is a wasted card
  const rated = rated0.filter(r => r.gain > 0 || r.cards > 0);
  if (!rated.length) return { pass: true };
  const tiesWin = me.faction === 'meadow' && opp.faction !== 'meadow';
  const ahead = v => v > 0 || (v === 0 && tiesWin);
  // spies first (a free card), then the cheapest card that puts us ahead, else the best value for money
  const spy = rated.filter(r => r.cards > 0 && !finalRound).sort((a, b) => b.cards - a.cards || a.value - b.value)[0];
  const cheapestWinner = () => rated.filter(r => ahead(r.after)).sort((a, b) => a.value - b.value || b.cards - a.cards)[0];
  const bestGain = () => [...rated].sort((a, b) => (b.gain + b.cards * 4 - b.value * 0.3) - (a.gain + a.cards * 4 - a.value * 0.3))[0];
  const avgGain = Math.max(3, rated.reduce((a, r) => a + Math.max(0, r.gain), 0) / Math.max(1, rated.length));
  const edge = me.hand.length - opp.hand.length;

  if (opp.passed) {
    if (ahead(diff)) return { pass: true };
    if (spy) return spy;
    const w = cheapestWinner();
    if (w && (mustWin || m.round >= 3 || w.value <= 9 || edge >= 1)) return w;
    // more than one card to catch up: only if we can afford it (or must)
    const need = Math.ceil((1 - diff) / avgGain);
    if (mustWin || me.hand.length - need >= opp.hand.length + 1) return w || bestGain();
    return { pass: true };
  }
  // the last round: no reason to hold anything back, nor to pass
  if (finalRound) return cheapestWinner() || bestGain();
  if (spy) return spy;
  if (mustWin) {
    // we need this round but they don't: stay ahead as cheaply as we can — and once they can't
    // catch up with the cards they hold, stop spending
    if (diff > opp.hand.length * 7) return { pass: true };
    return cheapestWinner() || bestGain();
  }
  if (theyMust) {
    // we won a round already: they must fight for this one; only fight back with cards to spare
    if (edge <= 1) return { pass: true };
    if (diff > 0 && edge <= 2) return { pass: true };
    return cheapestWinner() || bestGain();
  }
  // the first round: get ahead cheaply, then pass and make them spend cards to catch up
  if (diff > 0) {
    // passing hands them the round for the cards it takes to catch up: worth it unless that's
    // less than the cards we're already behind (a spy just lured us ahead)
    const toCatchUp = Math.ceil((diff + 1) / 6);
    if (edge + toCatchUp >= 1) return { pass: true };
    return rated.sort((a, b) => a.value - b.value)[0];
  }
  const w = cheapestWinner();
  if (w && (w.value <= 9 || edge >= 0)) return w;
  if (diff < -avgGain * 1.5 || edge < 0 || me.hand.length <= 4) return { pass: true };   // too far behind: let it go
  return cheapestWinner() || bestGain();
}

/**
 * Looking ahead: try each sensible move on copies of the match where the other side's unseen
 * cards are shuffled (their hand could be any of them), play each copy out with the quick
 * heuristic on both sides, and keep the move that wins most often.
 */
export function searchMove(m, { rng = Math.random, rollouts = 10, foeSkill = 0.7 } = {}) {
  const p = m.active, me = m.players[p];
  if (!me.hand.length) return { pass: true };
  const base = heuristicMove(m, { skill: 1, rng });
  const cands = [{ pass: true }, base];
  // a few other cards: the cheapest, and the biggest
  const plays = legalMoves(m).filter(x => !x.pass);
  const byValue = [...plays].sort((a, b) => worth(me, me.hand[a.hand]) - worth(me, me.hand[b.hand]));
  if (byValue.length) cands.push(byValue[0], byValue[byValue.length - 1]);
  const key = x => (x.pass ? 'pass' : `${me.hand[x.hand]}|${x.row}`);
  const uniq = [...new Map(cands.map(x => [key(x), x])).values()];
  if (uniq.length === 1) return uniq[0];
  let best = base, bestScore = -1;
  for (const c of uniq) {
    let sum = 0;
    for (let k = 0; k < rollouts; k++) {
      const s = determinize(m, p, rng);
      if (c.pass) pass(s); else playCard(s, c.hand, c.row);
      for (let i = 0; i < 200 && s.result === null; i++) { const mv = heuristicMove(s, { skill: s.active === p ? 1 : foeSkill, rng }); if (mv.pass) pass(s); else playCard(s, mv.hand, mv.row); }
      sum += s.result === p ? 1 : s.result === 'draw' ? 0.5 : 0;
    }
    const score = sum / rollouts + (key(c) === key(base) ? 0.02 : 0);      // ties: trust the heuristic
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** A copy of the match as player p might imagine it: the other side's hand and deck reshuffled. */
function determinize(m, p, rng) {
  const s = cloneMatch(m);
  const o = s.players[1 - p];
  const unseen = [...o.hand, ...o.deck];
  for (let i = unseen.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [unseen[i], unseen[j]] = [unseen[j], unseen[i]]; }
  o.hand = unseen.slice(0, o.hand.length);
  o.deck = unseen.slice(o.hand.length);
  const mine = s.players[p].deck;
  for (let i = mine.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [mine[i], mine[j]] = [mine[j], mine[i]]; }
  return s;
}

/** The computer's move: sharp players look ahead (skill ≥ 0.95), the rest play by habit. */
export function chooseMove(m, { skill = 1, rng = Math.random, search = true } = {}) {
  if (search && skill >= 0.95 && rng() < skill) return searchMove(m, { rng });
  return heuristicMove(m, { skill, rng });
}

/** Make the active player's move (simulations and tests). */
export function playMove(m, opts) {
  const move = chooseMove(m, { search: false, ...opts });
  if (move.pass) pass(m); else playCard(m, move.hand, move.row);
  return move;
}

/** Play a whole match with the computer on both sides: the finished match. */
export function autoMatch(m, skills = [1, 1], rngs = [Math.random, Math.random], { search = false } = {}) {
  for (let i = 0; i < 300 && m.result === null; i++) playMove(m, { skill: skills[m.active], rng: rngs[m.active], search });
  return m;
}
