/**
 * Riftcards — the rules of a match (pure, deterministic; no DOM). Inspired by the card duels
 * of old: a battle of STRENGTH over three rows, best of three rounds.
 *
 *   Both players start with 10 cards (and 2 gems). Players take turns: play ONE card, or PASS.
 *   Once you pass you're out of the round; the other player may keep playing. When both have
 *   passed, the higher total strength wins the round; the loser loses a gem (a tie: both do).
 *   Lose both gems and you lose the match. Each new round starts on a clear table — with no new
 *   cards (drawEachRound: 0), so whatever you spend in one round is gone for the next.
 *
 * The tactics: every card you spend in one round is gone for the next — win a round cheaply,
 * or let one go to have more cards for the next two; read when the other side will pass.
 * Weather flattens a row, horns double one, bonds and musters swarm, spies trade a little
 * strength for two cards, scorch punishes putting everything on one big creature.
 *
 *   const m = createMatch({ decks: [ids, ids], factions: ['meadow', 'volcano'], seed, hands: [10, 12]?, worlds? });
 *   (hands: a boss may start with more cards — the Rift King holds 12; worlds: the three rounds'
 *   worlds, drawn from the seed unless given — home ground +1, and the world's weather, catalog.js)
 *   legalMoves(m) · playCard(m, handIndex, row?) · pass(m) · total(m, p) · rowTotal(m, p, row)
 *   m.events: what happened (the screen turns them into animations and sounds)
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { CARDS, ROWS, WEATHER, FACTIONS, FACTION_IDS, CLIMATE } from './catalog.js';

export const MATCH_RULES = { hand: 10, gems: 2, drawEachRound: 0, spyDraw: 2, scorchRow: 10, gleam: 2, starHero: 1, home: 1, maxTurns: 200 };

let uid = 1;
const perkOf = (m, p) => FACTIONS[m.players[p].faction]?.perk || null;
export const other = p => 1 - p;

export function createMatch({ decks, factions = ['meadow', 'meadow'], seed = 1, first = null, hands = [MATCH_RULES.hand, MATCH_RULES.hand], worlds = null } = {}) {
  const rng = mulberry32(hashSeed('riftcards', seed));
  const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const players = [0, 1].map(p => ({
    faction: factions[p], deck: shuffle(decks[p]), hand: [], discard: [], gems: MATCH_RULES.gems, passed: false, wins: 0,
    rows: { front: [], back: [], sky: [] }, chilled: { front: false, back: false, sky: false }, warhorn: { front: false, back: false, sky: false }, firstThisRound: true,
  }));
  // the three worlds the rounds are played in (known from the start)
  if (!worlds) { const pool = [...FACTION_IDS]; worlds = [0, 1, 2].map(() => pool.splice(Math.floor(rng() * pool.length), 1)[0]); }
  const m = { rng, round: 1, turn: 0, active: first ?? (rng() < 0.5 ? 0 : 1), starter: 0, players, result: null, events: [], roundLog: [], worlds: [...worlds], world: worlds[0] };
  m.starter = m.active;
  for (let p = 0; p < 2; p++) for (let i = 0; i < hands[p]; i++) draw(m, p);
  m.events.push({ type: 'round', round: 1, first: m.active, world: m.world });
  enterWorld(m);
  return m;
}

/** A round starts in its world: its weather chills a row for everyone but the locals. */
function enterWorld(m) {
  const c = CLIMATE[m.world];
  if (!c) return;
  for (let p = 0; p < 2; p++) if (m.players[p].faction !== m.world) m.players[p].chilled[c.row] = true;
  m.events.push({ type: 'climate', world: m.world, row: c.row, name: c.name });
}

function draw(m, p) {
  const pl = m.players[p];
  if (!pl.deck.length) return null;
  const id = pl.deck.shift();
  pl.hand.push(id);
  m.events.push({ type: 'draw', p, id });
  return id;
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------
/** What a creature on side p, row `row`, counts for right now. */
export function strengthOf(m, p, row, unit) {
  const c = CARDS[unit.id], pl = m.players[p], list = pl.rows[row];
  const home = c.faction === m.world ? MATCH_RULES.home : 0;                 // home ground: +1 in its own world
  if (c.ability === 'hero') return c.str + unit.bonus + home + (perkOf(m, unit.by) === 'stars' ? MATCH_RULES.starHero : 0);
  const chilled = pl.chilled[row] && !(row === 'back' && perkOf(m, p) === 'shade');
  let s = (chilled ? 1 : c.str) + unit.bonus + (c.ability === 'agile' && perkOf(m, unit.by) === 'shade' ? 1 : 0);
  if (c.ability === 'bond') s *= list.filter(u => u.id === unit.id).length;
  s += list.filter(u => u !== unit && CARDS[u.id].ability === 'rally').length + home;
  if (pl.warhorn[row] || list.some(u => u !== unit && CARDS[u.id].ability === 'horn')) s *= 2;
  return s;
}
export function rowTotal(m, p, row) { return m.players[p].rows[row].reduce((a, u) => a + strengthOf(m, p, row, u), 0); }
export function total(m, p) { return ROWS.reduce((a, r) => a + rowTotal(m, p, r), 0); }

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------
/** Rows a card may go to ([] for a special). */
export function rowsFor(id) {
  const c = CARDS[id];
  if (c.kind === 'special') return [];
  return c.ability === 'agile' ? ['front', 'back'] : [c.row];
}

/** Every legal move for the active player: { hand, row } (row null for specials) — and passing. */
export function legalMoves(m) {
  if (m.result !== null) return [];
  const pl = m.players[m.active];
  const out = [];
  pl.hand.forEach((id, i) => { const rows = rowsFor(id); if (!rows.length) out.push({ hand: i, row: null }); else for (const row of rows) out.push({ hand: i, row }); });
  out.push({ pass: true });
  return out;
}

/** The row an agile card (or a war horn) would pick: where it adds most. */
export function bestRow(m, p, id) {
  const rows = rowsFor(id);
  if (rows.length <= 1) return rows[0] ?? null;
  let best = rows[0], bestGain = -Infinity;
  for (const row of rows) {
    const s = cloneMatch(m); place(s, p, row, { id, by: p });
    const gain = total(s, p) - total(m, p);
    if (gain > bestGain) { best = row; bestGain = gain; }
  }
  return best;
}

function place(m, side, row, { id, by, src = 'hand' }) {
  const unit = { uid: uid++, id, by, bonus: 0 };
  // the Prismfolk's first creature each round shines brighter
  if (by === side && perkOf(m, by) === 'gleam' && m.players[by].firstThisRound) { unit.bonus = MATCH_RULES.gleam; m.players[by].firstThisRound = false; }
  m.players[side].rows[row].push(unit);
  m.events.push({ type: 'place', side, row, uid: unit.uid, id, by, bonus: unit.bonus, src });
  return unit;
}

/** Burn the strongest non-hero creature(s) among `targets` ([[side, row]]). */
function burn(m, targets) {
  let max = 0;
  for (const [side, row] of targets) for (const u of m.players[side].rows[row]) if (CARDS[u.id].ability !== 'hero') max = Math.max(max, strengthOf(m, side, row, u));
  if (max <= 0) return 0;
  let n = 0;
  for (const [side, row] of targets) {
    const pl = m.players[side];
    const doomed = pl.rows[row].filter(u => CARDS[u.id].ability !== 'hero' && strengthOf(m, side, row, u) === max);
    for (const u of doomed) { pl.rows[row].splice(pl.rows[row].indexOf(u), 1); pl.discard.push(u.id); m.events.push({ type: 'burn', side, row, uid: u.uid, id: u.id }); n++; }
  }
  return n;
}

/** Play hand card i for the active player (row: for agile cards; otherwise chosen for you). */
export function playCard(m, i, row = null) {
  if (m.result !== null) return false;
  const p = m.active, pl = m.players[p], id = pl.hand[i];
  if (!id || pl.passed) return false;
  const c = CARDS[id];
  const rows = rowsFor(id);
  if (rows.length && row !== null && !rows.includes(row)) return false;
  pl.hand.splice(i, 1);
  m.turn++;
  m.events.push({ type: 'play', p, id });
  if (c.kind === 'special') {
    const e = c.effect;
    if (e.weather) {
      const r = WEATHER[e.weather];
      for (const side of [0, 1]) if (!(perkOf(m, p) === 'frost' && side === p)) m.players[side].chilled[r] = true;
      m.events.push({ type: 'weather', weather: e.weather, row: r, by: p });
    } else if (e.clear) {
      for (const side of [0, 1]) for (const r of ROWS) m.players[side].chilled[r] = false;
      m.events.push({ type: 'clear' });
    } else if (e.horn) {
      let best = null, bestGain = -1;
      for (const r of ROWS) {
        if (pl.warhorn[r] || pl.rows[r].some(u => CARDS[u.id].ability === 'horn')) continue;
        const before = rowTotal(m, p, r); pl.warhorn[r] = true; const gain = rowTotal(m, p, r) - before; pl.warhorn[r] = false;
        if (gain > bestGain) { best = r; bestGain = gain; }
      }
      if (best) { pl.warhorn[best] = true; m.events.push({ type: 'horn', side: p, row: best }); }
    } else if (e.scorch) {
      const sides = perkOf(m, p) === 'fire' ? [other(p)] : [0, 1];
      const n = burn(m, sides.flatMap(side => ROWS.map(r => [side, r])));
      m.events.push({ type: 'scorch', by: p, n });
    }
    pl.discard.push(id);
  } else {
    const r = row ?? bestRow(m, p, id);
    if (c.ability === 'spy') {
      place(m, other(p), r, { id, by: p });
      for (let k = 0; k < MATCH_RULES.spyDraw; k++) draw(m, p);
      m.events.push({ type: 'spy', p });
    } else {
      place(m, p, r, { id, by: p });
      if (c.ability === 'muster') {
        const mates = pl.deck.filter(x => CARDS[x].group === c.group);
        for (const x of mates) { pl.deck.splice(pl.deck.indexOf(x), 1); place(m, p, CARDS[x].row, { id: x, by: p, src: 'deck' }); }
        if (mates.length) m.events.push({ type: 'muster', p, n: mates.length });
      }
      if (c.ability === 'medic') {
        const fallen = pl.discard.filter(x => CARDS[x].kind === 'creature' && CARDS[x].ability !== 'hero' && CARDS[x].ability !== 'spy');
        if (fallen.length) {
          const back = fallen.sort((a, b) => CARDS[b].str - CARDS[a].str)[0];
          pl.discard.splice(pl.discard.indexOf(back), 1);
          place(m, p, CARDS[back].row, { id: back, by: p, src: 'discard' });
          m.events.push({ type: 'revive', p, id: back });
        }
      }
      if (c.ability === 'scorch' && rowTotal(m, other(p), r) >= MATCH_RULES.scorchRow) {
        burn(m, [[other(p), r]]);
        m.events.push({ type: 'scorch', by: p, row: r });
      }
    }
  }
  nextTurn(m);
  return true;
}

/** The active player passes: out for the rest of the round. */
export function pass(m) {
  if (m.result !== null) return false;
  const p = m.active;
  m.players[p].passed = true;
  m.events.push({ type: 'pass', p });
  nextTurn(m);
  return true;
}

function nextTurn(m) {
  const [a, b] = m.players;
  if (a.passed && b.passed) { endRound(m); return; }
  const o = other(m.active);
  if (!m.players[o].passed) m.active = o;
  // nothing to play: passing is all that's left
  if (!m.players[m.active].hand.length && !m.players[m.active].passed) pass(m);
}

function endRound(m) {
  const t = [total(m, 0), total(m, 1)];
  let winner = t[0] > t[1] ? 0 : t[1] > t[0] ? 1 : null;
  if (winner === null) {                                     // a tie: the Bloomkin win ties
    const ties = [0, 1].filter(p => perkOf(m, p) === 'ties');
    if (ties.length === 1) winner = ties[0];
  }
  if (winner === null) { m.players[0].gems--; m.players[1].gems--; }
  else { m.players[other(winner)].gems--; m.players[winner].wins++; }
  m.roundLog.push({ round: m.round, totals: t, winner });
  // (the table as it stood, for the screen to hold on while it shows who won)
  const board = m.players.map((pl, p) => ({ chilled: { ...pl.chilled }, warhorn: { ...pl.warhorn }, rows: Object.fromEntries(ROWS.map(r => [r, pl.rows[r].map(u => ({ ...u, str: strengthOf(m, p, r, u) }))])) }));
  m.events.push({ type: 'roundEnd', round: m.round, totals: t, winner, board, gems: m.players.map(pl => pl.gems) });
  if (winner !== null && perkOf(m, winner) === 'tide') draw(m, winner);             // the tide brings the Tidefolk a card
  // clear the table (the Sporefolk keep one creature), the weather and the horns
  for (let p = 0; p < 2; p++) {
    const pl = m.players[p];
    let keep = null;
    if (perkOf(m, p) === 'spores') {
      const mine = ROWS.flatMap(r => pl.rows[r].filter(u => u.by === p).map(u => [r, u]));
      if (mine.length) keep = mine[Math.floor(m.rng() * mine.length)];
    }
    for (const r of ROWS) {
      for (const u of pl.rows[r]) if (!keep || keep[1] !== u) m.players[u.by].discard.push(u.id);
      pl.rows[r] = keep && keep[0] === r ? [keep[1]] : [];
      pl.chilled[r] = false; pl.warhorn[r] = false;
    }
    if (keep) m.events.push({ type: 'stays', p, id: keep[1].id, uid: keep[1].uid });
    pl.passed = false;
    pl.firstThisRound = true;
  }
  const [a, b] = m.players;
  if (a.gems <= 0 || b.gems <= 0) {
    m.result = a.gems <= 0 && b.gems <= 0 ? 'draw' : a.gems <= 0 ? 1 : 0;
    m.events.push({ type: 'matchEnd', result: m.result });
    return;
  }
  m.round++;
  for (let p = 0; p < 2; p++) for (let k = 0; k < MATCH_RULES.drawEachRound; k++) draw(m, p);
  m.active = winner === null ? other(m.starter) : other(winner);      // the loser of a round starts the next
  m.starter = m.active;
  m.world = m.worlds[m.round - 1] || m.world;
  m.events.push({ type: 'round', round: m.round, first: m.active, world: m.world });
  enterWorld(m);
  if (!m.players[m.active].hand.length) pass(m);
}

/** A deep copy (the computer player tries moves on copies). */
export function cloneMatch(m) {
  const cp = pl => ({ ...pl, deck: [...pl.deck], hand: [...pl.hand], discard: [...pl.discard], rows: { front: pl.rows.front.map(u => ({ ...u })), back: pl.rows.back.map(u => ({ ...u })), sky: pl.rows.sky.map(u => ({ ...u })) }, chilled: { ...pl.chilled }, warhorn: { ...pl.warhorn } });
  return { ...m, rng: mulberry32(hashSeed('clone', m.turn, m.round)), players: m.players.map(cp), events: [], roundLog: [...m.roundLog] };
}
