/**
 * Riftcards — decks, packs and the ladder (pure).
 *
 *   A DECK is one faction's cards plus neutral ones: 15–25 cards, at least 10 creatures; at most
 *   3 copies of a common, 2 of a rare, 1 of an epic or a legendary.
 *   A STARTER deck (pick your first faction at the card tables) is that faction's four commons
 *   ×3, a weather card or two and a spy.
 *   The LADDER: card battlers come to Hearthmoor's square at your tier — Novice, Apprentice,
 *   Adept, Expert, Master, Champion. Beat three of the four who are in town to rise a tier (the next
 *   ones arrive after your next run); higher tiers play rarer cards, sharper — and their cards,
 *   and the packs you find, get rarer too. Beat the Champions and the Rift King comes to play.
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { CARDS, CARD_IDS, FACTIONS, FACTION_IDS, RARITIES, cardPower } from './catalog.js';

export const DECK_RULES = { min: 15, max: 25, minCreatures: 10, spies: 2, copies: { common: 3, rare: 2, epic: 1, legendary: 1 } };
export const LADDER = [
  { name: 'Novice', skill: 0.3 }, { name: 'Apprentice', skill: 0.45 }, { name: 'Adept', skill: 0.6 },
  { name: 'Expert', skill: 0.75 }, { name: 'Master', skill: 0.88 }, { name: 'Champion', skill: 1 },
];
export const KING = { name: 'The Rift King', skill: 1, faction: 'starlit', hand: 12 };

const factionCards = (f, rarity = null) => CARD_IDS.filter(id => CARDS[id].faction === f && (!rarity || CARDS[id].rarity === rarity));
const neutral = (rarity = null) => CARD_IDS.filter(id => CARDS[id].faction === 'neutral' && (!rarity || CARDS[id].rarity === rarity));

/** The weather each faction likes best (its own rows suffer least from it). */
export const FAVOURITE_WEATHER = { meadow: 'fog', lagoon: 'fog', canyon: 'fog', grove: 'fog', alpine: 'frost', volcano: 'storm', crystal: 'storm', starlit: 'frost' };

/** The weather that hurts a deck least: the row it has least strength in (Frostkin love frost,
 *  Dustriders shrug off fog). */
export function weatherFor(deck, faction) {
  if (faction === 'alpine') return 'frost';
  if (faction === 'canyon') return 'fog';
  const sum = { front: 0, back: 0, sky: 0 };
  for (const id of deck) { const c = CARDS[id]; if (c.kind === 'creature' && c.ability !== 'spy' && c.ability !== 'hero') sum[c.row] += c.str; }
  const row = Object.keys(sum).sort((a, b) => sum[a] - sum[b])[0];
  return { front: 'frost', back: 'fog', sky: 'storm' }[row];
}

/** A faction's starter deck (15 cards). */
export function starterDeck(faction) {
  const deck = [];
  let spies = 0;
  for (const id of [...factionCards(faction, 'common').flatMap(id => [id, id, id]), FAVOURITE_WEATHER[faction], 'clear', 'pebblespy']) {
    if (CARDS[id].ability === 'spy') { if (spies >= DECK_RULES.spies) continue; spies++; }
    deck.push(id);
  }
  // (a faction with a spy among its commons gets a rare instead of the extra spies)
  for (const id of factionCards(faction, 'rare')) if (deck.length < DECK_RULES.min && CARDS[id].ability !== 'spy') deck.push(id);
  return deck;
}

/** What's wrong with a deck for a collection ({ id: count }) — [] when it's fine. */
export function deckProblems(deck, collection = null) {
  const out = [];
  const faction = deckFaction(deck);
  if (deck.length < DECK_RULES.min) out.push(`at least ${DECK_RULES.min} cards (this one has ${deck.length})`);
  if (deck.length > DECK_RULES.max) out.push(`at most ${DECK_RULES.max} cards`);
  if (deck.filter(id => CARDS[id]?.kind === 'creature').length < DECK_RULES.minCreatures) out.push(`at least ${DECK_RULES.minCreatures} creatures`);
  if (deck.some(id => CARDS[id] && CARDS[id].faction !== 'neutral' && CARDS[id].faction !== faction)) out.push('one faction only (plus neutral cards)');
  if (deck.filter(id => CARDS[id]?.ability === 'spy').length > DECK_RULES.spies) out.push(`at most ${DECK_RULES.spies} spies`);
  const counts = {};
  for (const id of deck) counts[id] = (counts[id] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    const c = CARDS[id];
    if (!c) { out.push(`unknown card ${id}`); continue; }
    if (n > DECK_RULES.copies[c.rarity]) out.push(`at most ${DECK_RULES.copies[c.rarity]} × ${c.name}`);
    if (collection && (collection[id] || 0) < n) out.push(`you have ${collection[id] || 0} × ${c.name}`);
  }
  return out;
}

/** A deck's faction (its first faction card's; neutral-only decks count as meadow). */
export function deckFaction(deck) {
  const id = deck.find(x => CARDS[x] && CARDS[x].faction !== 'neutral');
  return id ? CARDS[id].faction : 'meadow';
}

/** The factions you could build a legal deck for from a collection. */
export function playableFactions(collection) {
  return FACTION_IDS.filter(f => !deckProblems(autoDeck(collection, f), collection).length);
}

/** The best deck you can build for a faction from a collection: the strongest cards, 15–22 of them. */
export function autoDeck(collection, faction) {
  const copies = [];
  for (const [id, n] of Object.entries(collection)) {
    const c = CARDS[id];
    if (!c || (c.faction !== faction && c.faction !== 'neutral')) continue;
    for (let i = 0; i < Math.min(n, DECK_RULES.copies[c.rarity]); i++) copies.push(id);
  }
  // strongest first; specials count a little less (a deck needs creatures); bonds and musters only
  // pay off in numbers; weather comes after: only the one that chills the row where this deck is
  // weakest; at most 2 spies
  const have = id => copies.filter(x => x === id).length;
  const score = id => {
    const c = CARDS[id];
    if (c.ability === 'bond' || c.ability === 'muster') return have(id) >= 2 ? c.str + 2 + have(id) : c.str - 1;
    return cardPower(id) - (c.kind === 'special' ? 2 : 0);
  };
  copies.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  const deck = [];
  let spies = 0;
  const isWeather = id => CARDS[id].effect?.weather || CARDS[id].effect?.clear;
  for (const id of copies) {
    if (deck.length >= 20) break;
    const c = CARDS[id];
    if (isWeather(id)) continue;
    if (c.ability === 'spy') { if (spies >= DECK_RULES.spies) continue; spies++; }
    deck.push(id);
  }
  const fav = weatherFor(deck, faction);
  for (const id of [fav, fav, 'clear']) if (copies.includes(id) && deck.filter(x => x === id).length < copies.filter(x => x === id).length && deck.length < 22) deck.push(id);
  // too few cards for a deck: whatever's left (other weather too)
  for (const id of copies) if (deck.length < DECK_RULES.min && deck.filter(x => x === id).length < copies.filter(x => x === id).length && !(CARDS[id].ability === 'spy' && spies >= DECK_RULES.spies)) deck.push(id);
  return deck.sort(byCost);
}
const byCost = (a, b) => (CARDS[a].kind === 'special') - (CARDS[b].kind === 'special') || (CARDS[a].str ?? 0) - (CARDS[b].str ?? 0) || a.localeCompare(b);

/** Rarity odds by ladder tier (0–5): rarer cards as you climb. */
export function rarityOdds(tier = 0) {
  return [
    { common: 0.85, rare: 0.15, epic: 0, legendary: 0 },
    { common: 0.7, rare: 0.27, epic: 0.03, legendary: 0 },
    { common: 0.55, rare: 0.35, epic: 0.09, legendary: 0.01 },
    { common: 0.45, rare: 0.38, epic: 0.14, legendary: 0.03 },
    { common: 0.35, rare: 0.4, epic: 0.2, legendary: 0.05 },
    { common: 0.25, rare: 0.4, epic: 0.27, legendary: 0.08 },
  ][Math.max(0, Math.min(5, tier))];
}

/** A pack: `n` cards of a faction (and neutral ones), rarity by tier. */
export function openPack(rng, { faction = null, tier = 0, n = 3 } = {}) {
  const odds = rarityOdds(tier), out = [];
  for (let i = 0; i < n; i++) {
    let roll = rng(), rarity = 'common';
    for (const r of RARITIES) { if ((roll -= odds[r]) < 0) { rarity = r; break; } }
    let pool = CARD_IDS.filter(id => CARDS[id].rarity === rarity && (!faction || CARDS[id].faction === faction || (CARDS[id].faction === 'neutral' && rng() < 0.3)));
    if (!pool.length) pool = CARD_IDS.filter(id => CARDS[id].rarity === rarity && (!faction || CARDS[id].faction === faction));
    if (!pool.length) pool = factionCards(faction || 'meadow', 'common');
    out.push(pool[Math.floor(rng() * pool.length)]);
  }
  return out;
}

/** A card battler's deck: their faction's starter, upgraded by tier (0–5; 6 = the Rift King). */
export function opponentDeck(seed, faction, tier = 0) {
  if (tier >= 6) return ['riftking', 'riftwarden', 'nightqueen', 'stardragon', 'wisp', 'wisp', 'oracle', 'oracle', 'moonarcher', 'moonarcher', 'moonarcher', 'ruinwatcher', 'ruinwatcher', 'cometwisp', 'cometwisp', 'cometwisp', 'moth', 'moth', 'scorchspell', 'warhorn', 'storm', 'frost'];
  const rng = mulberry32(hashSeed('foe-deck', seed, faction, tier));
  const deck = starterDeck(faction);
  if (tier <= 0) {
    // novices haven't found their best cards yet: one of the strongest commons is missing
    const strong = deck.map((x, i) => [x, i]).filter(([x]) => CARDS[x].faction === faction).sort((a, b) => cardPower(b[0]) - cardPower(a[0]));
    deck[strong[0][1]] = FAVOURITE_WEATHER[faction];
    return deck.sort(byCost);
  }
  const upgrades = [];
  const rares = factionCards(faction, 'rare'), epic = factionCards(faction, 'epic'), legend = factionCards(faction, 'legendary');
  if (tier >= 1) upgrades.push(rares[Math.floor(rng() * rares.length)]);
  if (tier >= 2) upgrades.push(rares[0], rares[1]);
  if (tier >= 3) upgrades.push(...epic, rares[0] === upgrades[2] ? rares[1] : rares[0]);
  if (tier >= 4) upgrades.push(...legend, 'warhorn', 'scorchspell');
  if (tier >= 5) upgrades.push('riftwarden', 'warhorn', neutral('rare')[Math.floor(rng() * 2)]);
  // each upgrade replaces the weakest common (while the deck stays legal), then the deck grows a little
  const counts = id => deck.filter(x => x === id).length;
  for (const id of upgrades.filter(Boolean)) {
    if (counts(id) >= DECK_RULES.copies[CARDS[id].rarity]) continue;
    if (CARDS[id].ability === 'spy' && deck.filter(x => CARDS[x].ability === 'spy').length >= DECK_RULES.spies) continue;
    const commons = deck.map((x, i) => [x, i]).filter(([x]) => CARDS[x].faction === faction && CARDS[x].rarity === 'common');
    if (deck.length < 15 + tier || !commons.length) deck.push(id);
    else { commons.sort((a, b) => cardPower(a[0]) - cardPower(b[0])); deck[commons[0][1]] = id; }
  }
  return deck.sort(byCost);
}
