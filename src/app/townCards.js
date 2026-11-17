/**
 * Riftcards in the town square: choosing your faction, challenging the card battlers, the
 * ladder (beat three of the four battlers in town to rise a tier; tougher ones arrive after your next
 * journey), deck editing and the Rift King.
 *
 * Each battler comes from one of the worlds (npc.home) and plays that world's faction, at the
 * tier you were when they arrived (actor.cardTier). Four tables, any three wins to rise — so you can
 * skip the matchup you dislike, but no faster than before (new battlers only arrive while you're
 * away on a run). The first win over a battler: pick one of three of their spares (two of your
 * faction, one of theirs; rarer as you climb); rematches are for fun, so the square can't be
 * ground for cards and the rifts stay where new cards come from. Rising a tier: a pack as well.
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { cardTable, controls, deckPanels, dialog, G, npcPrompt, profile } from './boot.js';
import { say } from './level.js';
import { closeTalk, talkTo } from './quests.js';
import { tellStory } from './town.js';
import { sound } from '../audio/music.js';
import { CARDS, FACTIONS } from '../cards/catalog.js';
import { autoDeck, deckProblems, openPack, opponentDeck, starterDeck, LADDER, KING } from '../cards/decks.js';
import { makeNpc } from '../characters/npcs.js';
import { hashSeed, mulberry32 } from '../levels/generator.js';
import { ZONES } from '../world/zones.js';

export const tierName = t => (t >= 6 ? 'Grand Champion' : LADDER[Math.max(0, Math.min(5, t))].name);
/** The tier a battler plays at (the one you were at when they came to town). */
export const cardLevel = actor => Math.max(0, Math.min(5, actor.cardTier ?? profile.get().cardTier));
const battlerKey = actor => String(actor.npc.seed);

/** Your deck for the faction you play (a legal saved one, or the best one your cards make). */
export function myDeck() {
  const f = profile.faction() || 'meadow', collection = profile.cards();
  const deck = profile.deckFor(f);
  return deck && !deckProblems(deck, collection).length ? deck : autoDeck(collection, f);
}

/** Your first faction: its starter deck joins your collection. */
function chooseFirstFaction(npc, then) {
  dialog.close();
  deckPanels.chooseFaction({
    title: 'Choose your faction',
    text: `Every world has its own kind of card — ${npc.first} will lend you a starter deck of the one you like best. (You can collect and play the others later.)`,
    onPick: f => {
      profile.addCards(starterDeck(f));
      profile.setFaction(f);
      profile.setDeck(f, starterDeck(f));
      sound.jingle('card');
      then(f);
    },
    onCancel: () => then(null),
  });
}

export function pitchCards(actor) {
  const npc = actor.npc, tier = cardLevel(actor), d = profile.get();
  const F = FACTIONS[npc.home] || FACTIONS.meadow;
  if (!profile.faction()) {
    dialog.say(npc, `Never played Riftcards? Everyone in Hearthmoor plays! Two players, three rounds: each turn you put down ONE card — brawlers in front, archers at the back, fliers in the sky — or pass. Most strength wins the round; win two rounds. Pick a faction and I'll lend you a starter deck!`, [
      ['Choose a faction ▸', () => chooseFirstFaction(npc, f => (f ? pitchCards(actor) : talkTo(actor))), true], ['Later', () => talkTo(actor)],
    ]);
    return;
  }
  const beaten = d.tierBeaten.includes(battlerKey(actor)) && tier === d.cardTier;
  const ladder = tier < d.cardTier ? ' (You’ve already climbed past my tier — but a game’s a game!)'
    : beaten ? ' You beat me already — a rematch is just for fun (my spare cards are yours already).'
      : ` Beat me and that’s ${d.tierBeaten.length + 1} of the 3 ${tierName(tier)}s you need to rise a tier — any three of us four will do.`;
  dialog.say(npc, `A game of Riftcards? I play the ${F.name} of ${F.zone} — ${F.about.toLowerCase()} I'm a${/^[AEIOU]/.test(tierName(tier)) ? 'n' : ''} ${tierName(tier)}.${ladder}`, [
    ['Deal! ▸', () => startCardMatch(actor), true], ['My decks', () => editDecks(() => pitchCards(actor))], ['Not now', () => talkTo(actor)],
  ]);
}

/** The deck editor (from the square, or the card table at home). */
export function editDecks(after = () => {}) {
  dialog.close();
  const go = () => deckPanels.edit({
    collection: profile.cards(), decks: profile.get().decks, faction: profile.faction(), design: G.currentDesign,
    onDone: ({ faction, deck, decks }) => {
      for (const [f, ids] of Object.entries(decks)) if (!deckProblems(ids, profile.cards()).length) profile.setDeck(f, ids);
      profile.setFaction(faction);
      profile.setDeck(faction, deck);
      after();
    },
  });
  if (!profile.faction()) chooseFirstFaction({ first: 'The card table' }, f => (f ? go() : after()));
  else go();
}

async function startCardMatch(actor) {
  const npc = actor.npc, tier = cardLevel(actor), L = LADDER[tier];
  dialog.close();
  npcPrompt.hidden = true;
  G.phase = 'cards';
  const seed = hashSeed('cards', npc.seed, profile.get().cardWins, Date.now() % 997);
  const F = FACTIONS[npc.home] || FACTIONS.meadow;
  const { won, skipped } = await cardTable.start({
    me: { deck: myDeck(), faction: profile.faction(), design: G.currentDesign, name: G.currentDesign.name || 'You' },
    foe: { deck: opponentDeck(npc.seed, npc.home, tier), faction: npc.home, name: npc.first, title: `${L.name} · ${F.name} of ${ZONES[npc.home]?.name || F.zone}`, design: { ...npc.design, silly: npc.face }, skill: L.skill },
    seed, title: 'Town square',
  });
  G.phase = 'talk';
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  if (skipped) { talkTo(actor); return; }
  if (!won) { dialog.say(npc, 'Ha! Good game though. Tip: if a round’s slipping away, pass and save your cards for the next two.', [['Rematch', () => startCardMatch(actor), true], ['Bye', () => closeTalk()]]); return; }
  const before = profile.get().cardTier;
  const { tier: now, tierUp, beaten } = profile.beatBattler(battlerKey(actor), tier);
  // a battler's spares are won once (a rematch is for fun): cards come from the rifts, not from grinding the square
  if (actor.prized && !tierUp) {
    dialog.say(npc, 'Beaten again! You’ve had my spares already — but that was a cracking game.', [['Another game', () => pitchCards(actor)], ['Bye ▸', () => closeTalk(), true]]);
    return;
  }
  actor.prized = true;
  const rng = mulberry32(hashSeed('card-prize', npc.seed, profile.get().cardWins));
  const mine = profile.faction();
  const choices = [...openPack(rng, { faction: mine, tier: now, n: 2 }), ...openPack(rng, { faction: npc.home, tier: now, n: 1 })];
  const progress = tierUp ? `You rise to ${tierName(now)}!` : now === tier && now < 6 ? `That’s ${beaten} of 3 ${tierName(tier)}s beaten.` : '';
  deckPanels.pick({
    title: `You beat ${npc.first}! Pick a card`,
    text: `${progress} Pick one of ${npc.first}’s spares:`,
    cards: choices,
    onPick: id => {
      profile.addCards([id]);
      sound.jingle('card');
      const after = () => {
        let line = `The ${CARDS[id].name}? Good choice. Treat it well.`;
        if (tierUp && now >= 6) {
          if (profile.addDecor('cardtrophy')) line += ' And this — the town’s Champion’s Cup. You’re the best in Hearthmoor! (It’s on your shelf at home.)';
          line += ' They say the best player of all lives beyond the rifts…';
        } else if (tierUp) line += ` A${/^[AEIOU]/.test(tierName(now)) ? 'n' : ''} ${tierName(now)} now! Word travels fast — tougher card battlers will come to the square while you’re off on your next journey.`;
        dialog.say(npc, line, [['Another game', () => pitchCards(actor)], ['Bye ▸', () => closeTalk(), true]]);
      };
      if (tierUp) {
        const gift = openPack(mulberry32(hashSeed('tier-pack', now, profile.get().cardWins)), { faction: mine, tier: now, n: 3 });
        profile.addCards(gift);
        deckPanels.pack({ title: `${tierName(now)}!`, text: `You’ve climbed from ${tierName(before)} to ${tierName(now)}. The square cheers and someone presses a pack of cards into your hands:`, cards: gift, onDone: after });
      } else after();
    },
  });
}

/** The finale: the Rift King — the Starborn's rules, his own legendary deck, 12 cards in hand, no mistakes. */
export async function startKingMatch() {
  G.phase = 'cards';
  const king = makeNpc(hashSeed('rift-king'), { zone: 'town', quest: false });
  const design = { ...king.design, hat: 'gemcrown', colors: { ...king.design.colors, top: '#5b2a86', bottom: '#2a1840', hat: '#ffcf3a', accent: '#ffcf3a' }, silly: king.face };
  if (!profile.faction()) { profile.addCards(starterDeck('meadow')); profile.setFaction('meadow'); }
  const { won, skipped } = await cardTable.start({
    me: { deck: myDeck(), faction: profile.faction(), design: G.currentDesign, name: G.currentDesign.name || 'You' },
    foe: { deck: opponentDeck(0, 'starlit', 6), faction: 'king', name: KING.name, title: 'Lord of the Rifts · he never misses a move', design, skill: KING.skill, hand: KING.hand },
    seed: hashSeed('king', Date.now() % 9973), title: 'The Rift King',
    intro: 'He plays the Starborn’s legends — and starts with 12 cards to your 10.',
  });
  G.phase = 'hub'; G.lastTime = undefined; controls.clear(); G.portalArmed = false;
  if (skipped) return;
  if (!won) { say('The Rift King smirks and shuffles. "Again, whenever you like." (He waits at the portal.)', 5); return; }
  profile.beatKing();
  profile.addDecor('riftcrown');
  profile.addCards(['riftking']);
  sound.jingle('victory');
  deckPanels.pack({ title: 'You beat the Rift King!', text: 'He bows low and hands you his own card — and his crown (it’s on your wall at home).', cards: ['riftking'], onDone: () => tellStory() });
}

/** The test menu: a match right now against a battler from a random world at your tier. */
export async function testCardMatch() {
  if (!profile.faction()) { profile.addCards(starterDeck('meadow')); profile.setFaction('meadow'); profile.setDeck('meadow', starterDeck('meadow')); }
  const back = G.phase;
  const zones = Object.keys(FACTIONS), home = zones[Math.floor(Math.random() * zones.length)];
  const npc = makeNpc(hashSeed('test-battler', Date.now() % 99991), { zone: home, quest: false });
  const tier = Math.min(5, profile.get().cardTier), L = LADDER[tier];
  G.phase = 'cards';
  await cardTable.start({
    me: { deck: myDeck(), faction: profile.faction(), design: G.currentDesign, name: G.currentDesign.name || 'You' },
    foe: { deck: opponentDeck(npc.seed, home, tier), faction: home, name: npc.first, title: `${L.name} · ${FACTIONS[home].name} (test match)`, design: { ...npc.design, silly: npc.face }, skill: L.skill },
    seed: npc.seed, title: 'Test match',
  });
  G.phase = back; G.lastTime = undefined; controls.clear();
}
