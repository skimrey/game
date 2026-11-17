/**
 * Riftcards — the cards. Eight FACTIONS, one per zone of the world, each with its own way to
 * win (a passive PERK and the abilities its cards lean on), plus neutral cards anyone can use:
 * weather, horns, scorch, spies and a few heroes.
 *
 * A creature card has a ROW (front · back · sky), a STRENGTH and maybe an ABILITY:
 *   pack     same-named creatures in a row multiply: each is worth strength × how many
 *   swarm    when played, every card of its kind in your deck jumps in too
 *   rally    +1 to every other creature in its row
 *   cheer    doubles the other creatures in its row (one per row)
 *   sneak    goes to the OTHER side (their strength) — and you draw 2 cards
 *   revive   brings back your strongest fallen creature (not a legend)
 *   burn     burns the strongest enemy creature(s) in the row opposite, if that row totals 10+
 *   nimble   front or back — it goes where it scores most
 *   legend   immune to weather, cheers, burns and revives
 * (The rules call them bond, muster, rally, horn, spy, medic, scorch, agile, hero.)
 * Specials: Blizzard / Sea Mist / Dust Storm (every creature in the front / back / sky rows
 * counts as 1 — legends don't); Sunny Day ends all weather; Brass Band doubles one of your
 * rows; Lava Burst burns the strongest creature(s) on the whole table.
 * And the WORLDS: each round is played in one of the eight worlds (drawn at the start of a
 * match) — home ground +1 for its faction, and its weather (CLIMATE) for everyone else.
 *
 * Every card's picture is a generated critter (characters/monsters.js) in its faction's colours.
 */

export const ROWS = ['front', 'back', 'sky'];
export const ROW_INFO = {
  front: { name: 'Front', about: 'brawlers, up close', weather: 'frost' },
  back: { name: 'Back', about: 'shooters and casters', weather: 'fog' },
  sky: { name: 'Sky', about: 'fliers', weather: 'storm' },
};
export const WEATHER = { frost: 'front', fog: 'back', storm: 'sky' };

/** What each ability does (the ids are the rules' names; the words are the game's). */
export const ABILITY_NAMES = { bond: 'Pack', muster: 'Swarm', rally: 'Rally', horn: 'Cheer', spy: 'Sneak', medic: 'Revive', scorch: 'Burn', agile: 'Nimble', hero: 'Legend' };
export const ABILITIES = {
  bond: 'Pack: same-named creatures in this row each count strength × how many there are.',
  muster: 'Swarm: when played, every card of its kind in your deck jumps in too.',
  rally: 'Rally: +1 to every other creature in its row.',
  horn: 'Cheer: doubles the other creatures in its row.',
  spy: 'Sneak: plays on the OTHER side (their strength) — and you draw 2 cards.',
  medic: 'Revive: brings back your strongest fallen creature (not a legend).',
  scorch: 'Burn: burns the strongest enemy creature(s) in the row opposite, if that row totals 10 or more.',
  agile: 'Nimble: goes to the front or the back — wherever it scores more.',
  hero: 'Legend: immune to weather, cheers, burns and revives.',
};

/**
 * The worlds the rounds are played in. Each match draws three (one per round, shown from the
 * start): creatures of that world's faction get +1 there (home ground), and three worlds have
 * weather of their own that chills a row on both sides for the round — except for the locals,
 * who are used to it. Sunny Day clears it.
 */
export const CLIMATE = {
  alpine: { row: 'front', name: 'Blizzard' },
  lagoon: { row: 'back', name: 'Sea mist' },
  canyon: { row: 'sky', name: 'Dust storm' },
};

/** The factions (one per zone): who they are and their perk (rules in match.js). */
export const FACTIONS = {
  meadow: { id: 'meadow', name: 'Bloomkin', zone: 'Green Meadows', perk: 'ties', about: 'Swarms of bunnies and packs of bees.', perkText: 'Wins a round that ends in a tie.' },
  lagoon: { id: 'lagoon', name: 'Tidefolk', zone: 'Sunny Lagoon', perk: 'tide', about: 'Sneaks and healers that keep the cards coming.', perkText: 'Draws a card every time it wins a round.' },
  canyon: { id: 'canyon', name: 'Dustriders', zone: 'Sunbaked Canyon', perk: 'shade', about: 'Nimble outlaws and rallying shamans.', perkText: 'Its back row ignores weather, and its nimble creatures get +1.' },
  grove: { id: 'grove', name: 'Sporefolk', zone: 'Mushroom Grove', perk: 'spores', about: 'Sporelings that keep coming back.', perkText: 'After each round, one random creature of its stays on the table.' },
  alpine: { id: 'alpine', name: 'Frostkin', zone: 'Alpine Dusk', perk: 'frost', about: 'Big brawlers who love a blizzard.', perkText: 'Its weather only chills the other side.' },
  volcano: { id: 'volcano', name: 'Emberborn', zone: 'Ember Peaks', perk: 'fire', about: 'Hotheads who burn the biggest threats.', perkText: 'Its burns only hit enemy creatures.' },
  crystal: { id: 'crystal', name: 'Prismfolk', zone: 'Crystal Caverns', perk: 'gleam', about: 'Cheerleaders and shining legends.', perkText: 'Its first creature each round gets +2.' },
  starlit: { id: 'starlit', name: 'Starborn', zone: 'Starlit Ruins', perk: 'stars', about: 'Sky spirits led by legends.', perkText: 'Its legends get +1.' },
};
export const FACTION_IDS = Object.keys(FACTIONS);

// [id, name, faction, rarity, row, strength, ability, muster group]
const C = (id, name, faction, rarity, row, str, ability = null, group = null) => ({ id, name, faction, rarity, kind: 'creature', row, str, ability, group });
const S = (id, name, rarity, effect, about) => ({ id, name, faction: 'neutral', rarity, kind: 'special', effect, about });

const LIST = [
  // --- Bloomkin (meadow)
  C('bunny', 'Meadow Bunny', 'meadow', 'common', 'front', 3, 'muster', 'bunny'),
  C('bee', 'Bumblebee', 'meadow', 'common', 'sky', 2, 'bond'),
  C('haygolem', 'Hay Golem', 'meadow', 'common', 'front', 5),
  C('daisyarcher', 'Daisy Archer', 'meadow', 'common', 'back', 4),
  C('cloverknight', 'Clover Knight', 'meadow', 'rare', 'front', 5, 'rally'),
  C('pollenwitch', 'Pollen Witch', 'meadow', 'rare', 'back', 2, 'medic'),
  C('sunstag', 'Sun Stag', 'meadow', 'epic', 'front', 8),
  C('queenbee', 'The Queen Bee', 'meadow', 'legendary', 'sky', 10, 'hero'),
  // --- Tidefolk (lagoon)
  C('crab', 'Sand Crab', 'lagoon', 'common', 'front', 2, 'bond'),
  C('gull', 'Nosy Gull', 'lagoon', 'rare', 'sky', 4, 'spy'),
  C('puffer', 'Bubble Puffer', 'lagoon', 'common', 'front', 3, 'agile'),
  C('coralshooter', 'Coral Shooter', 'lagoon', 'common', 'back', 4),
  C('jellyfloat', 'Jellyfloat', 'lagoon', 'common', 'sky', 4),
  C('turtle', 'Mossy Turtle', 'lagoon', 'rare', 'front', 6),
  C('siren', 'Lagoon Siren', 'lagoon', 'rare', 'back', 1, 'medic'),
  C('krakenkid', 'Kraken Kid', 'lagoon', 'epic', 'front', 7, 'rally'),
  C('tidemother', 'The Tide Mother', 'lagoon', 'legendary', 'back', 9, 'hero'),
  // --- Dustriders (canyon)
  C('dustdevil', 'Dust Devil', 'canyon', 'common', 'sky', 2, 'muster', 'dustdevil'),
  C('cactus', 'Cactus Pup', 'canyon', 'common', 'front', 3, 'bond'),
  C('coyote', 'Coyote Bandit', 'canyon', 'common', 'back', 3, 'agile'),
  C('mesaslinger', 'Mesa Slinger', 'canyon', 'common', 'back', 3, 'rally'),
  C('tumblebrute', 'Tumblebrute', 'canyon', 'rare', 'front', 9, 'agile'),
  C('rattleshaman', 'Rattle Shaman', 'canyon', 'rare', 'back', 5, 'horn'),
  C('thunderbird', 'Thunderbird', 'canyon', 'epic', 'sky', 10),
  C('outlawking', 'The Outlaw King', 'canyon', 'legendary', 'back', 11, 'hero'),
  // --- Sporefolk (grove)
  C('sporeling', 'Sporeling', 'grove', 'common', 'front', 2, 'muster', 'spore'),
  C('firefly', 'Firefly', 'grove', 'common', 'sky', 2, 'bond'),
  C('toadstool', 'Toadstool Guard', 'grove', 'common', 'front', 5),
  C('fungalhealer', 'Fungal Healer', 'grove', 'common', 'back', 2, 'medic'),
  C('mossarcher', 'Moss Archer', 'grove', 'rare', 'back', 5),
  C('mushknight', 'Mushroom Knight', 'grove', 'rare', 'front', 7),
  C('sporequeen', 'Spore Queen', 'grove', 'epic', 'back', 6, 'muster', 'spore'),
  C('eldershroom', 'The Elder Shroom', 'grove', 'legendary', 'front', 11, 'hero'),
  // --- Frostkin (alpine)
  C('hare', 'Snow Hare', 'alpine', 'common', 'front', 3, 'muster', 'hare'),
  C('iceimp', 'Ice Imp', 'alpine', 'common', 'back', 2, 'bond'),
  C('yodelgoat', 'Yodel Goat', 'alpine', 'common', 'back', 2, 'rally'),
  C('yeti', 'Yeti Cub', 'alpine', 'common', 'front', 5),
  C('ram', 'Avalanche Ram', 'alpine', 'rare', 'front', 7),
  C('snowowl', 'Snow Owl', 'alpine', 'rare', 'sky', 5, 'rally'),
  C('glacier', 'Glacier Golem', 'alpine', 'epic', 'front', 9),
  C('yetiking', 'The Yeti King', 'alpine', 'legendary', 'front', 12, 'hero'),
  // --- Emberborn (volcano)
  C('emberimp', 'Ember Imp', 'volcano', 'common', 'front', 3, 'bond'),
  C('lavanewt', 'Lava Newt', 'volcano', 'common', 'front', 3, 'muster', 'newt'),
  C('ashbat', 'Ash Bat', 'volcano', 'common', 'sky', 3),
  C('magmaslinger', 'Magma Slinger', 'volcano', 'common', 'back', 4),
  C('cinderhound', 'Cinder Hound', 'volcano', 'rare', 'front', 5, 'scorch'),
  C('flamecaller', 'Flame Caller', 'volcano', 'rare', 'back', 3, 'horn'),
  C('titan', 'Magma Titan', 'volcano', 'epic', 'front', 10),
  C('phoenix', 'The Phoenix', 'volcano', 'legendary', 'sky', 10, 'hero'),
  // --- Prismfolk (crystal)
  C('mite', 'Crystal Mite', 'crystal', 'common', 'front', 2, 'bond'),
  C('shardling', 'Shardling', 'crystal', 'common', 'back', 2, 'muster', 'shard'),
  C('prismbat', 'Prism Bat', 'crystal', 'common', 'sky', 4),
  C('geode', 'Geode Guard', 'crystal', 'common', 'front', 5),
  C('facetpriest', 'Facet Priest', 'crystal', 'rare', 'front', 4, 'horn'),
  C('quartzgolem', 'Quartz Golem', 'crystal', 'rare', 'front', 9),
  C('drake', 'Prism Drake', 'crystal', 'epic', 'sky', 9, 'rally'),
  C('geodeheart', 'The Geode Heart', 'crystal', 'legendary', 'back', 12, 'hero'),
  // --- Starborn (starlit)
  C('moth', 'Star Moth', 'starlit', 'common', 'sky', 2, 'bond'),
  C('cometwisp', 'Comet Wisp', 'starlit', 'common', 'sky', 3, 'muster', 'comet'),
  C('ruinwatcher', 'Ruin Watcher', 'starlit', 'common', 'front', 5),
  C('moonarcher', 'Moon Archer', 'starlit', 'common', 'back', 5),
  C('wisp', 'Wisp Lantern', 'starlit', 'rare', 'back', 4, 'rally'),
  C('oracle', 'Moon Oracle', 'starlit', 'rare', 'back', 1, 'medic'),
  C('stardragon', 'Star Dragon', 'starlit', 'epic', 'sky', 7),
  C('nightqueen', 'The Night Queen', 'starlit', 'legendary', 'sky', 10, 'hero'),
  // --- neutral
  S('frost', 'Blizzard', 'common', { weather: 'frost' }, 'Every creature in both front rows counts as 1 (not legends).'),
  S('fog', 'Sea Mist', 'common', { weather: 'fog' }, 'Every creature in both back rows counts as 1 (not legends).'),
  S('storm', 'Dust Storm', 'common', { weather: 'storm' }, 'Every creature in both sky rows counts as 1 (not legends).'),
  S('clear', 'Sunny Day', 'common', { clear: true }, 'Ends all weather — the world’s own too.'),
  S('warhorn', 'Brass Band', 'rare', { horn: true }, 'Doubles the creatures in one of your rows (the one it helps most).'),
  S('scorchspell', 'Lava Burst', 'rare', { scorch: true }, 'Burns the strongest creature(s) on the whole table (not legends).'),
  C('pebblespy', 'Nosy Pebble', 'neutral', 'rare', 'front', 3, 'spy'),
  C('riftwarden', 'Rift Warden', 'neutral', 'legendary', 'front', 12, 'hero'),
  C('riftking', 'The Rift King', 'neutral', 'legendary', 'back', 15, 'hero'),       // won from the King himself
];

export const CARDS = Object.fromEntries(LIST.map(c => [c.id, c]));
/** Cards that can turn up in packs (not the King's own). */
export const CARD_IDS = LIST.filter(c => c.id !== 'riftking').map(c => c.id);
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];

/** The words for a card. */
export function cardText(card) {
  const c = typeof card === 'string' ? CARDS[card] : card;
  if (c.kind === 'special') return c.about;
  const row = `${c.ability === 'agile' ? 'Front or back row' : `${ROW_INFO[c.row].name} row`}, strength ${c.str}.`;
  return c.ability ? `${row} ${ABILITIES[c.ability]}` : `${row} No ability — just strong.`;
}

/** How much a card is worth (deck building, the AI's reserve). */
export function cardPower(card) {
  const c = typeof card === 'string' ? CARDS[card] : card;
  if (c.kind === 'special') return { frost: 5, fog: 5, storm: 5, clear: 3 }[c.effect.weather || (c.effect.clear && 'clear')] ?? (c.effect.horn ? 9 : 8);
  const bonus = { bond: 3, muster: 3, rally: 3, horn: 5, spy: 6, medic: 5, scorch: 5, agile: 1, hero: 3 }[c.ability] || 0;
  return c.str + bonus;
}
