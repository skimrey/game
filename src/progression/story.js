/**
 * The story and what it unlocks — told in short beats as you come back to town.
 *
 * Hearthmoor sits at the crossing of many worlds, around the Great Portal. The portal has
 * started humming again: rifts are tearing open everywhere, and odd critters tumble through.
 * Whoever goes through the rifts brings their likeness back on cards — Riftcards — and the
 * whole town has caught the card bug. Behind the rifts is someone who loves a game: the Rift
 * King. Beat the town's best players and he comes to play you himself.
 *
 * Progression (gentle at first, so a new player isn't handed every system at once):
 *   run 1        a light first run: no class or spells yet; NPCs ask for rifts (cards and
 *                clothes). Villagers in town teach you Riftcards and give you a starter deck.
 *   run 2 on     choose a class at the portal; NPCs teach spells (duels appear)
 *   run 3 on     dungeon delves appear
 *   card tier 6  (the Champions beaten — every tier cleared) and 2 runs: the Rift King comes to town
 *   the King     beaten: the ending — and his crown for your wall
 * `tutorialDone` (the test menu can set it) unlocks everything at once.
 *
 * Pure: takes the profile's data, returns what to show and what's unlocked.
 */

/** What's unlocked for a profile. */
export function unlocks(d) {
  const all = !!d.tutorialDone;
  return {
    classes: all || d.runs >= 1,
    duels: all || d.runs >= 1,
    delves: all || d.runs >= 2,
    king: (d.cardTier || 0) >= 6 && (all || d.runs >= 2) && !d.kingBeaten,
  };
}

/** The quest kinds NPCs may offer now. */
export function questKinds(d) {
  const u = unlocks(d);
  return ['rift', ...(u.duels ? ['duel'] : []), ...(u.delves ? ['delve'] : [])];
}

/** Story beats: { id, when(d), title, text }, told once each, in this order. */
export const BEATS = [
  {
    id: 'arrival', when: () => true, title: 'Welcome to Hearthmoor',
    text: 'Hearthmoor sits where many worlds meet, around the Great Portal. For years it slept — but now it hums again, and rifts are tearing open all over the worlds. Odd critters tumble through them. The villagers say you look like someone who could close a few. Step into the portal when you’re ready; the path east leads to your new home.',
  },
  {
    id: 'cards', when: d => Object.keys(d.cards || {}).length > 0, title: 'Riftcards',
    text: 'Everything that comes through a rift leaves a little of itself behind — and folk here have taken to catching those likenesses on cards. Riftcards! Every world has its own faction — Bloomkin, Tidefolk, Dustriders and more — and card battlers come to the square from all of them. Beat three of the four in town to rise a tier (Novice, Apprentice, Adept …); tougher challengers arrive after your next journey, and the higher you climb, the rarer the cards you find. Helping folk with their rifts out on your runs earns cards too.',
  },
  {
    id: 'classes', when: d => d.runs >= 1, title: 'You came back!',
    text: 'The portal remembers you now. From this run on, choose a class as you step through — Warrior, Hunter or Sorcerer — and the folk you meet out there will teach you spells for it (some will want a sword duel first).',
  },
  {
    id: 'inn', when: d => d.runs >= 1, title: 'The inn on the west path',
    text: 'Have you been to the Tipsy Teapot yet? West of the square. Bertha pins challenges on her board — win them for gold — and Tess the tailor will paint patterns on anything you own, for a price. And out the back… the Ring, where tamers pit monsters against each other. You’ll need some monster friends for that.',
  },
  {
    id: 'ranch', when: d => (d.monsters || []).length > 0, title: 'A boss followed you home',
    text: 'Beaten bosses are oddly fond of whoever beat them! Yours lives on the ranch behind your house now (the back door of your game room). At the end of each stage of a run, another can come home with you. Three of them make a squad for the Ring behind the inn — and every fight there makes them stronger.',
  },
  {
    id: 'delves', when: d => d.runs >= 2, title: 'Something in the cellars',
    text: 'The rifts are getting bolder: some have opened underground, and Rift Wardens have moved into people’s cellars and caves. Out on your runs, some folk will ask you to clear one out — three rooms and a Warden, fought the way your class fights.',
  },
  {
    id: 'rumour', when: d => (d.cardTier || 0) >= 3, title: 'A rumour in the square',
    text: 'The card players whisper about a stranger who wins every game in the worlds beyond the rifts: a King, they say, who opens rifts just to find someone worth playing. “Beat the Champions,” says the baker, “and he’ll come. He can’t resist.”',
  },
  {
    id: 'king', when: d => unlocks(d).king, title: 'The Rift King is here',
    text: 'The portal flares purple and a tall figure steps out, shuffling a deck that glitters like the inside of a rift. “So YOU are the one beating everybody. Play me.” He waits at the portal — challenge him there.',
  },
  {
    id: 'ending', when: d => !!d.kingBeaten, title: 'The rifts grow quiet',
    text: 'The Rift King laughs, bows, and sets his crown on the table. “Fair and square. I’ll close the rifts — for now. But the worlds are still out there, and the portal will always open for you.” The end… of the beginning. (Keep playing: new runs, new faces, new cards.)',
  },
];

/** The next beat not yet told (or null). */
export function nextBeat(d) {
  const seen = d.story?.seen || [];
  return BEATS.find(b => !seen.includes(b.id) && b.when(d)) || null;
}

/** The chapter you're in (for the notice board). */
export function chapter(d) {
  if (d.kingBeaten) return { n: 5, name: 'After the King' };
  if (unlocks(d).king) return { n: 4, name: 'The Rift King' };
  if (d.runs >= 2) return { n: 3, name: 'Wardens underground' };
  if (d.runs >= 1) return { n: 2, name: 'Spells and swords' };
  return { n: 1, name: 'The portal hums' };
}
