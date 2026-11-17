/**
 * NPCs — the generated folk you meet on a run (one per stage, somewhere along a level's
 * route) and around the town square. Each is made from a seed:
 *
 *   design   a character design (characters/character.js): build, clothes, colours — often wearing
 *            an unlockable they'd TRADE for one of yours of the same rarity
 *   face     a silly face: googly / crossed / wonky / stalk eyes, pig or Pinocchio
 *            noses, buck teeth, tongues out, unibrows, curly moustaches, a bobble-head…
 *            within an oddness budget (sillyFace; no two NPCs of a run share a face)
 *   name     a silly first and last name, and a job that fits the zone
 *   quest    what they ask of you
 *              rift   "something fell into a rift": a short generated level in the same
 *                     zone with a twist (one heart · against the clock · find 3 trinkets);
 *                     the reward: one of three Riftcards from the zone (and maybe clothes)
 *              duel   a Blade Duel against them (games/parry/rules.js)
 *              delve  "a Rift Warden moved into my cellar": a side-on dungeon crawl of three
 *                     rooms and a boss, played with your class's weapon and move (games/delve/rules.js)
 *            duels and delves teach a spell for your class (pick one of two). `kinds` limits
 *            what may be offered (the gentle first run: rifts only — progression/story.js)
 *   lines    what they say
 *
 * Why side activities rather than quests inside the level: the levels are audited
 * (completable, fair, distinct — LEVEL_DESIGN.md); a quest that changes them would dodge
 * every check. A rift is a separate generated level that passes the same audits, and a
 * duel or a delve is a separate 2D game with its own balance checks.
 *
 * No DOM — the 3D face is built in characters/avatar.js (look.silly), the 2D ones in characters/npcFace.js.
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { randomCharacter, normalizeCharacter, UNLOCKABLES, DROP_TABLE, RARITIES, isUnlockable } from './character.js';
import { dressApart, isFantasySkin, oklab } from './looks.js';
import { STAGE_THEMES, hslToRgb } from '../engine/palette.js';

// ---------------------------------------------------------------------------
// Silly faces
// ---------------------------------------------------------------------------
export const FACE_PARTS = {
  eyes: ['googly', 'cross', 'wonky', 'tiny', 'sleepy', 'wink', 'stalks', 'beady'],
  brows: ['none', 'uni', 'angry', 'raised', 'bushy', 'wiggly'],
  nose: ['button', 'long', 'pig', 'potato', 'hook', 'none'],
  mouth: ['buck', 'tongue', 'grin', 'ooh', 'wobbly', 'gap', 'frown'],
  whiskers: ['none', 'none', 'curly', 'walrus', 'goatee', 'beard', 'stubble'],
  extra: ['none', 'freckles', 'blush', 'mole', 'bandaid', 'specs'],
  ears: ['normal', 'normal', 'big'],
};
/**
 * Silly, not unsettling. Some features were dropped after reviewing contact sheets of
 * generated faces (tools/faces.html): a red clown nose reads as a wound on the blocky 3D
 * head, pointy ears as odd slabs, a cyclops eye or spiral "X" eyes as creepy or dead, red
 * lips and fangs as blood, warts as a rash (and red irises as bloodshot: NPCs get brown eyes
 * instead). The rest each get an ODDNESS score, and a face
 * may spend at most ODDNESS_BUDGET — one or two quirks make a face funny; five at once make it
 * a monster.
 */
export const DROPPED_FACE_PARTS = { eyes: ['cyclops', 'spiral'], nose: ['clown'], mouth: ['lips', 'fangs'], extra: ['warts'], ears: ['pointy'] };
export const ODDNESS = {
  eyes: { stalks: 2, wonky: 1, cross: 1, googly: 1 },
  brows: { uni: 1, wiggly: 1 },
  nose: { long: 1, pig: 1, hook: 1, potato: 1 },
  mouth: { tongue: 1, ooh: 1, wobbly: 1 },
  whiskers: { walrus: 1, curly: 1 },
  extra: { bandaid: 1 },
  ears: { big: 1 },
};
export const ODDNESS_BUDGET = 4;
/** The features that make a face tell-apart-able (head size counts too). */
const FEATURES = ['eyes', 'brows', 'nose', 'mouth', 'whiskers', 'extra', 'ears'];
/** How odd a face looks (see ODDNESS); bobble-heads add to it. */
export function faceOddness(f) {
  let n = 0;
  for (const [k, table] of Object.entries(ODDNESS)) n += table[f[k]] || 0;
  return n + (f.head >= 1.3 ? 1 : 0);
}

/**
 * WEIRDNESS — how strange a whole person looks, which is hard to put into words, so it's scored
 * from what review of the 2D portraits AND the 3D figures (cast3d.html) showed: the face's quirks
 * weighted by how they look in 3D (some things charming in 2D are rough on the blocky head — eye
 * stalks, a big wonky eye), a bobble-head, and a fantasy skin tone (which already makes a person
 * the odd one out, so their face stays plain: one quirk at most). A person may spend at most WEIRDNESS_BUDGET.
 * Some combinations are ruled out outright (Infinity): a walrus moustache on a fantasy face reads
 * as a duck's bill, and eye stalks under a hat that covers the head.
 */
export const WEIRD_3D = {
  eyes: { stalks: 2, wonky: 2, cross: 1, googly: 1 },
  brows: { uni: 1, wiggly: 1 },
  nose: { long: 1, pig: 1, hook: 1, potato: 1 },
  mouth: { tongue: 1, ooh: 1, wobbly: 1 },
  whiskers: { walrus: 1, curly: 1 },
  extra: { bandaid: 1 },
  ears: { big: 1 },
};
export const WEIRDNESS_BUDGET = 4;
const OPEN_HATS = ['none', 'headband', 'crown', 'gemcrown', 'halo', 'flowers'];
const LOUD_HAIR = ['#6b4fd8', '#25b3a8', '#ff7eb6'];
export function weirdness({ face, design }) {
  const fantasy = isFantasySkin(design.colors.skin);
  // a fantasy face stays plain: no big whiskers (a walrus moustache on teal reads as a duck's
  // bill, a white beard as a bib), no big ears (goblin), no bobble-head
  // and friendly (a frowning, scowling blue face reads as a monster)
  if (fantasy && (['walrus', 'curly', 'beard'].includes(face.whiskers) || face.ears === 'big' || face.head >= 1.3 || face.mouth === 'frown' || face.brows === 'angry' || face.nose === 'pig')) return Infinity;     // (a green face with a snout is an orc)
  if (face.eyes === 'stalks' && !OPEN_HATS.includes(design.hat)) return Infinity;
  // a little pale goatee on a darker face reads as a tooth; whiskers in pink, purple or teal — or
  // red ones on a dark face — read as lipstick or a bruise round the mouth
  const whiskers = face.whiskers !== 'none' && face.whiskers !== 'stubble';
  if (face.whiskers === 'goatee' && oklab(design.colors.hair)[0] - oklab(design.colors.skin)[0] > 0.25) return Infinity;
  // a walrus moustache lighter than the face it's on (blond on brown) reads as a duck's bill, and
  // a big blond beard or moustache on a dark face as a gold ring round the mouth (white is fine: grandad)
  const lighter = oklab(design.colors.hair)[0] - oklab(design.colors.skin)[0];
  if (face.whiskers === 'walrus' && lighter > 0.05 && design.colors.hair !== '#e8e8ee') return Infinity;
  if ((face.whiskers === 'beard' || face.whiskers === 'curly') && lighter > 0.25 && design.colors.hair !== '#e8e8ee') return Infinity;
  if (whiskers && (LOUD_HAIR.includes(design.colors.hair) || (design.colors.hair === '#b8432f' && oklab(design.colors.skin)[0] < 0.6))) return Infinity;
  let n = 0;
  for (const [k, table] of Object.entries(WEIRD_3D)) n += table[face[k]] || 0;
  return n + (face.head >= 1.3 ? 1 : 0) + (fantasy ? 3 : 0);
}

/** Plain values, in the order quirks are given up when a person is still too strange (weirdness). */
const PLAIN = [['ears', 'normal'], ['head', 1], ['whiskers', 'none'], ['nose', 'button'], ['mouth', 'grin'], ['brows', 'raised'], ['eyes', 'beady'], ['extra', 'none']];
/** The face, with quirks swapped for plain features until the whole person is within the budget. */
export function tameFace(face, design) {
  const f = { ...face };
  for (const [k, plain] of PLAIN) {
    if (weirdness({ face: f, design }) <= WEIRDNESS_BUDGET) break;
    f[k] = plain;
    if (k === 'eyes') f.eyeSizes = [1, 1];
  }
  return f;
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function sillyFace(rng) {
  let face;
  for (let tries = 0; tries < 30; tries++) {
    face = Object.fromEntries(FEATURES.map(k => [k, pick(rng, FACE_PARTS[k])]));
    face.head = [1, 1.1, 1.2, 1.32][Math.floor(rng() * 4)];       // bobble-heads
    if (faceOddness(face) <= ODDNESS_BUDGET) break;
  }
  face.eyeSizes = face.eyes === 'wonky' ? [1.5, 0.7] : [1, 1];
  if (rng() < 0.5) face.eyeSizes.reverse();
  face.look = rng() * 2 - 1;                                  // where the pupils wander
  return face;
}

/** How many features two faces differ in. */
export function facesDiffer(a, b) {
  return FEATURES.filter(k => a[k] !== b[k]).length + (a.head !== b.head ? 1 : 0);
}
export const faceKey = f => [...FEATURES.map(k => f[k]), f.head].join('|');

// ---------------------------------------------------------------------------
// Names, jobs, lines
// ---------------------------------------------------------------------------
const FIRST = ['Barnaby', 'Gertrude', 'Fizzwick', 'Mabel', 'Ogden', 'Pipkin', 'Wilhelmina', 'Dudley', 'Prudence', 'Horace', 'Tilly', 'Bartholomew',
  'Agatha', 'Clement', 'Ethel', 'Rufus', 'Winifred', 'Cornelius', 'Dotty', 'Percival', 'Hortensia', 'Mungo', 'Petunia', 'Ignatius', 'Biddy', 'Thaddeus', 'Ottoline', 'Wally'];
const LAST = ['Wobblebottom', 'Snickerdoodle', 'McFiddle', 'Puddingsworth', 'Crumpet', 'Noodleton', 'Bumbleby', 'Featherstone', 'Pickleberry', 'Fuzzlewick',
  'Grumblesnout', 'Tootlebury', 'Wafflethorpe', 'Spindlewhiff', 'Muddlecombe', 'Quibble', 'Honkington', 'Bogglesworth', 'Flapjack', 'Dinglehopper'];
const JOBS = {
  meadow: ['Goatherd', 'Beekeeper', 'Hay Sculptor', 'Daisy Counter'],
  lagoon: ['Beachcomber', 'Shell Collector', 'Lighthouse Keeper', 'Sandcastle Architect'],
  canyon: ['Prospector', 'Cactus Whisperer', 'Tumbleweed Herder', 'Echo Tester'],
  grove: ['Mushroom Forager', 'Firefly Wrangler', 'Spore Sniffer', 'Toadstool Tailor'],
  alpine: ['Yodeler', 'Mountain Guide', 'Snowman Sculptor', 'Icicle Tuner'],
  volcano: ['Blacksmith', 'Lava Surfer', 'Marshmallow Toaster', 'Ash Sweeper'],
  crystal: ['Gem Cutter', 'Cave Painter', 'Echo Collector', 'Crystal Polisher'],
  starlit: ['Stargazer', 'Ruin Scholar', 'Comet Catcher', 'Moon Cartographer'],
  town: ['Baker', 'Tailor', 'Town Crier', 'Pet Groomer', 'Hat Enthusiast', 'Retired Adventurer'],
};
const TRINKETS = ['spoon', 'sock', 'rubber duck', 'monocle', 'lucky button', 'false teeth', 'kazoo', 'snow globe', 'teacup', 'pet rock'];

const GREETINGS = [
  'Oh! A real adventurer! Don’t mind my face, it does that.',
  'Psst. Yes, you. The one with the legs.',
  'Hello hello hello! Sorry, I get excited.',
  'Ah, at last! I’ve been standing here for ages. Literally ages.',
  'Greetings, traveller! Nice hat. Or lack of hat.',
  'Well butter my biscuits, a visitor!',
];

/** Where a delve goes (games/delve/rules.js), by zone: "there's a Rift Warden in my …". */
export const DELVE_PLACES = {
  meadow: 'root cellar', lagoon: 'sea cave', canyon: 'old mine', grove: 'hollow tree', alpine: 'ice cellar',
  volcano: 'forge vaults', crystal: 'geode halls', starlit: 'ruined crypt', town: 'sewers',
};

// ---------------------------------------------------------------------------
// Shapes: telling people apart at a glance
// ---------------------------------------------------------------------------
/** A random everyday outfit: no unlockables (except a trade item, added later), plenty of bare heads. */
function plainDesign(rng, first) {
  const design = randomCharacter(rng, first);
  for (const key of ['hat', 'extra', 'back', 'trail', 'top', 'shoes']) {
    if (isUnlockable(key, design[key])) design[key] = { hat: 'none', extra: 'none', back: 'none', trail: 'none', top: 'tee', shoes: 'sneakers' }[key];
  }
  if (rng() < 0.4) design.hat = 'none';                     // plenty of bare heads (and hair) to see
  if (design.colors.eyes === '#8a1f1f') design.colors.eyes = '#3a2414';   // red eyes read as bloodshot in the big portrait: brown instead
  return design;
}
/** Hats by the shape they give a head: bare, snug, tall, wide… (two snug caps read alike). */
const HAT_SHAPE = { none: 'bare', headband: 'bare', halo: 'bare', flowers: 'wreath', cap: 'snug', beanie: 'snug', helmet: 'snug', crown: 'crown', gemcrown: 'crown', tophat: 'tall', wizard: 'tall', partyhat: 'tall', unicorn: 'tall', viking: 'wide', pirate: 'wide' };
const BACK_SHAPE = { none: 'none', backpack: 'pack', jetpack: 'pack', cape: 'cape', rainbowcape: 'cape', wings: 'wings', fairywings: 'wings', dragonwings: 'wings', butterfly: 'wings' };
const HAIR_SHAPE = { none: 'bald', short: 'short', spiky: 'up', mohawk: 'up', long: 'long', bob: 'long', ponytail: 'tail' };
/**
 * How different two people look at a glance, by shape (colours are spread separately — looks.js):
 * what sets a silhouette counts most — body build, the shape of the hat, wings or a cape — then
 * hair, the top, the head, the trousers.
 */
const shapeOf = (table, v) => table[v] ?? v;
export function lookDifference(a, b) {
  const shape = shapeOf;
  let d = 0;
  if (a.build !== b.build) d += 3;
  if (shape(HAT_SHAPE, a.hat) !== shape(HAT_SHAPE, b.hat)) d += 3; else if (a.hat !== b.hat) d += 1;
  if (shape(BACK_SHAPE, a.back) !== shape(BACK_SHAPE, b.back)) d += 2; else if (a.back !== b.back) d += 0.5;
  if (shape(HAIR_SHAPE, a.hair) !== shape(HAIR_SHAPE, b.hair)) d += 2; else if (a.hair !== b.hair) d += 0.5;
  if (a.top !== b.top) d += 2;
  if (a.head !== b.head) d += 1;
  if (a.bottom !== b.bottom) d += 1;
  return d;
}

/** A quest twist for rift levels: { id, name, about }. */
export const RIFT_TWISTS = {
  glass: { id: 'glass', name: 'Glass Heart', about: 'one heart only — don’t get hit, don’t fall' },
  clock: { id: 'clock', name: 'Against the Clock', about: 'reach the gem before the rift closes' },
  trinkets: { id: 'trinkets', name: 'Lost Trinkets', about: 'pick up 3 lost trinkets — the gem appears when you have them all' },
};

// ---------------------------------------------------------------------------
// Making an NPC
// ---------------------------------------------------------------------------
/**
 * An item the NPC wears and would trade: an unlockable the player doesn't own, of a rarity
 * drawn like a boss drop for the stage (null when there's nothing new to offer).
 */
export function tradeOffer(rng, { stage = 0, owned = [] } = {}) {
  const row = DROP_TABLE[Math.max(0, Math.min(DROP_TABLE.length - 1, stage))];
  let roll = rng(), rarity = Object.keys(row).at(-1);
  for (const [r, p] of Object.entries(row)) { if ((roll -= p) <= 0) { rarity = r; break; } }
  const order = [rarity, ...RARITIES.filter(r => r !== rarity)];
  for (const r of order) {
    const left = UNLOCKABLES.filter(u => u.rarity === r && !owned.includes(u.id));
    if (left.length) return left[Math.floor(rng() * left.length)];
  }
  return null;
}

/**
 * An NPC from a seed.
 *   zone    zone id (flavours the job) or 'town'
 *   stage   0..3: how rare their trade offer is; their duel's difficulty
 *   owned   unlockable ids the player has (they offer something new)
 *   faces   faces already met this run (theirs will differ in at least 3 features)
 *   others  designs seen alongside them (the group so far): their colours — skin too — are picked
 *           to stand apart from these (characters/looks.js dressApart)
 *   context designs also in view whose clothes they shouldn't match (the hero), skin aside
 *   avoid   colours of where they stand (default: the zone's sky and ground)
 *   quest   false for villagers (trade and chat only)
 */
export { SKIN_TONES, HUMAN_SKINS, FANTASY_SKINS } from './looks.js';

/** Where a zone's folk stand: its sky and ground (nobody's top should blend into them). */
export function backdropOf(zone) {
  if (zone === 'yard') return ['#e8c98a', '#5a4a7a'];                         // the Ring's yard: the sand, the crowd
  if (!STAGE_THEMES[zone]) return ['#b9b9be', '#5a9a46'];                   // town: the flagstones, the grass
  const T = STAGE_THEMES[zone], hex = ([dh, s, l]) => '#' + hslToRgb(T.hue + dh, s, l).map(v => v.toString(16).padStart(2, '0')).join('');
  return [hex(T.colors[0]), hex(T.colors[7])];
}

export function makeNpc(seed, { zone = 'meadow', stage = 0, owned = [], faces = [], quest = true, kinds = null, others = [], context = [], avoid = null, fantasy = null } = {}) {
  const rng = mulberry32(hashSeed('npc', seed));
  const first = pick(rng, FIRST), last = pick(rng, LAST);
  let design = plainDesign(rng, first);
  const offer = tradeOffer(rng, { stage, owned });
  if (offer && offer.slot !== 'trail') design[offer.slot] = offer.value;
  // seen with others (a group, the hero): of a dozen possible outfits, the one whose shape differs
  // most from everyone else's — build, hat, back item, hair, top… (lookDifference)
  // (the group counts most; the people around them — the regulars, the hero — a little)
  const group = others.filter(Boolean), around = context.filter(Boolean);
  // never two in a group with the same wings, cape or pack, the same kind of hat, or the same build
  const clash = d => group.some(o => o.build === d.build || (shapeOf(BACK_SHAPE, d.back) !== 'none' && shapeOf(BACK_SHAPE, d.back) === shapeOf(BACK_SHAPE, o.back))
    || (shapeOf(HAT_SHAPE, d.hat) !== 'bare' && shapeOf(HAT_SHAPE, d.hat) === shapeOf(HAT_SHAPE, o.hat)));
  const apart = d => (group.length ? Math.min(...group.map(o => lookDifference(d, o))) : 0) + (around.length ? 0.3 * Math.min(...around.map(o => lookDifference(d, o))) : 0) - (clash(d) ? 6 : 0);
  if (group.length || around.length) {
    let best = design, bestScore = apart(design);
    for (let k = 0; k < 32; k++) {
      const alt = { ...plainDesign(mulberry32(hashSeed('look', seed, k)), first), colors: design.colors };
      if (offer && offer.slot !== 'trail') alt[offer.slot] = offer.value;
      const sc = apart(alt);
      if (sc > bestScore) { best = alt; bestScore = sc; }
    }
    design = best;
  }
  // a mohawk under a hat or a flower crown reads as a feathered headdress: hatted folk (traded hats too) get short hair
  if (design.hair === 'mohawk' && design.hat !== 'none') design.hair = 'short';
  // colours: apart from everyone else in view (others: the group, the hero) and off the backdrop (characters/looks.js)
  dressApart(design, others, { seed, context, fantasy, avoid: avoid ?? backdropOf(zone) });
  // a face that differs from the run's others, and that doesn't make the whole person too strange
  let face = sillyFace(rng);
  for (let i = 0; i < 60 && (faces.some(f => facesDiffer(f, face) < 3) || weirdness({ face, design }) > WEIRDNESS_BUDGET); i++) face = sillyFace(rng);
  face = tameFace(face, design);
  const twistIds = Object.keys(RIFT_TWISTS);
  const kindRoll = rng();
  let questKind = !quest ? null : kindRoll < 0.4 ? 'rift' : kindRoll < 0.7 ? 'delve' : 'duel';
  // not allowed (the gentle first run: rifts only — progression/story.js; no game twice in a run — app/quests.js)
  if (questKind && kinds && !kinds.includes(questKind)) questKind = questKind === 'duel' && kinds.includes('delve') ? 'delve' : questKind === 'delve' && kinds.includes('duel') ? 'duel' : 'rift';
  return {
    id: `npc-${seed}`,
    seed,
    name: `${first} ${last}`,
    first,
    job: pick(rng, JOBS[zone] || JOBS.town),
    zone,
    stage,
    design: normalizeCharacter({ ...design, id: `npc-${seed}`, name: first }),
    face,
    offer,
    greeting: pick(rng, GREETINGS),
    quest: questKind && {
      kind: questKind,
      twist: questKind === 'rift' ? pick(rng, twistIds) : null,
      trinket: pick(rng, TRINKETS),
      levelSeed: hashSeed('rift', seed),
      place: DELVE_PLACES[zone] || DELVE_PLACES.town,
    },
  };
}

/**
 * A group of NPCs seen together (the square's card battlers, the Ring's tamers): each is made
 * apart from the ones before them and from `others` (who else is there: the mayor, the regulars)
 * and `context` (the hero: clothes only) — colours as far apart as the palettes allow, faces
 * differing in three features.
 */
export function makeGroup(specs, { others = [], context = [] } = {}) {
  const out = [], faces = [];
  for (const { seed, ...opts } of specs) {
    // (each wears a different special item: the others' count as owned, so a new one is offered)
    const npc = makeNpc(seed, { ...opts, owned: [...(opts.owned || []), ...out.map(n => n.offer?.id).filter(Boolean)], faces: [...faces, ...(opts.faces || [])], others: [...others, ...out.map(n => n.design)], context });
    // no two of a group share a first name
    for (let k = 1; out.some(n => n.first === npc.first); k++) {
      npc.first = FIRST[(FIRST.indexOf(npc.first) + k * 7) % FIRST.length];
      npc.name = `${npc.first} ${npc.name.split(' ').slice(1).join(' ')}`;
      npc.design = { ...npc.design, name: npc.first };
    }
    faces.push(npc.face);
    out.push(npc);
  }
  return out;
}

/** What an NPC says when offering their quest. */
export function questPitch(npc) {
  const q = npc.quest;
  if (!q) return null;
  if (q.kind === 'duel') return `I’ve been practising my swordplay on a scarecrow and frankly it’s not fighting back. Cross blades with me? Three parries and I’ll teach you something useful.`;
  if (q.kind === 'delve') return `A rift opened in my ${q.place} and something BIG climbed out of it — a Rift Warden, plus slimes, bats and some very rude skeletons. Three rooms of them, then the big lump itself. Clear them out and I’ll teach you something. Fight the way your class fights!`;
  const t = RIFT_TWISTS[q.twist];
  const lead = q.twist === 'trinkets' ? `I sneezed so hard my pockets fell into a rift. Three of my treasures are in there, including my ${q.trinket}!`
    : `My ${q.trinket} fell into a rift! Would you hop in and fetch it? It’ll be at the end, sparkly like a gem.`;
  return `${lead} Careful — it’s a twisty place: ${t.about}. There are always Riftcards lying about in there — we can split them!`;
}

/** What they say afterwards. */
export function questDone(npc, won) {
  const q = npc.quest;
  if (won) return q.kind === 'duel' ? 'Ha! Beaten fair and square. Here — a trick my granny taught me. Pick one:' : q.kind === 'delve' ? `My ${q.place} is mine again! And only slightly slimy. Let me teach you something. Pick one:` : `My ${q.trinket}! You absolute legend. And look what fell out of the rift with it — these are yours:`;
  return q.kind === 'duel' ? 'Good try! Keep that blade up. Maybe next run.' : q.kind === 'delve' ? `Oof. I’ll just… use the other ${q.place}. Maybe next run.` : 'The rift snapped shut… oh well. It was a very ugly ' + q.trinket + ' anyway.';
}

/** The stage NPCs of a run: which level of each stage has one (the first or second — never the capstone). */
export function planNpcs(runSeed, stages) {
  const rng = mulberry32(hashSeed('npcplan', runSeed));
  let start = 0;
  return stages.map((count, k) => {
    const level = start + (count > 2 && rng() < 0.5 ? 1 : 0);
    start += count;
    return { stage: k, level, seed: hashSeed('stage-npc', runSeed, k) };
  });
}

/**
 * Marigold, the mayor of Hearthmoor — a fixed face (hand-picked, not rolled): a tall, thin,
 * eccentric old wizard with a long silver beard, a starry robe and a floppy pointed hat.
 */
export function mayorNpc() {
  const npc = makeNpc(hashSeed('mayor-of-hearthmoor'), { zone: 'town', quest: false });
  Object.assign(npc, { name: 'Mayor Marigold', first: 'Marigold', job: 'Mayor of Hearthmoor', offer: null, greeting: 'Ah! Our favourite adventurer!' });
  npc.face = { eyes: 'googly', brows: 'bushy', nose: 'hook', mouth: 'grin', whiskers: 'wizard', extra: 'none', ears: 'normal', head: 1, eyeSizes: [1, 1], look: 0.3 };
  npc.design = {
    ...npc.design, build: 'slim', head: 'tall', hair: 'long', hat: 'wizard', top: 'robe', bottom: 'pants', shoes: 'boots', extra: 'none', back: 'none', trail: 'none',
    colors: { ...npc.design.colors, skin: '#6b4028', hair: '#e4e0ee', top: '#4b3a94', bottom: '#2f2660', hat: '#3a2d7a', accent: '#ffd23f', shoes: '#5e3b22' },
  };
  return npc;
}

/** The inn's regulars — fixed, friendly faces like the mayor's: the innkeeper, the barmaid, the tailor, the Ring Master. */
const REGULARS = {
  keeper: { seed: 'innkeeper', first: 'Bertha', job: 'Innkeeper of the Tipsy Teapot', greeting: 'Welcome to the Tipsy Teapot, love!',
    face: { eyes: 'googly', brows: 'raised', nose: 'button', mouth: 'grin', whiskers: 'none', extra: 'blush', ears: 'normal', head: 1.1 },
    style: { build: 'regular', head: 'round', hat: 'headband', hair: 'short', top: 'tunic', bottom: 'skirt', shoes: 'boots' },
    colors: { skin: '#8a5236', hair: '#2a1c14', eyes: '#3a2414', top: '#4f9a4a', bottom: '#f6ecd4', hat: '#ffd23f', accent: '#ffd23f', shoes: '#5e3b22' } },
  barmaid: { seed: 'barmaid', first: 'Pippa', job: 'Barmaid of the Tipsy Teapot', greeting: 'Mind the tray, love!',
    face: { eyes: 'wink', brows: 'raised', nose: 'button', mouth: 'grin', whiskers: 'none', extra: 'freckles', ears: 'normal', head: 1 },
    style: { hat: 'headband', hair: 'ponytail', top: 'tunic', bottom: 'skirt', build: 'slim' }, colors: { skin: '#ffe0c4', top: '#3f76c8', bottom: '#5e3b22', accent: '#fff3dc', hair: '#e8a040', eyes: '#2f7a3a', hat: '#ef6fa8' } },
  tailor: { seed: 'tailor', first: 'Tess', job: 'Tailor', greeting: 'Ooh, let me see that outfit…',
    face: { eyes: 'beady', brows: 'none', nose: 'button', mouth: 'grin', whiskers: 'none', extra: 'specs', ears: 'normal', head: 1 },
    style: { hat: 'none', hair: 'ponytail', top: 'jacket' }, colors: { skin: '#c98e62', top: '#e0a526', bottom: '#2b2e36', accent: '#7a4ab8', hair: '#2b2e36' } },
  master: { seed: 'ring-master', first: 'Rocco', job: 'Ring Master', greeting: 'Step right up, tamer!',
    // a showman's wink and a waxed moustache (he was blue with white hair and googly eyes for a
    // while: in 3D that read as a skull under a top hat)
    face: { eyes: 'wink', brows: 'raised', nose: 'button', mouth: 'grin', whiskers: 'curly', extra: 'none', ears: 'normal', head: 1 },
    style: { hat: 'tophat', hair: 'short', top: 'jacket' }, colors: { skin: '#f6c9a0', top: '#b8323a', hat: '#2b2e36', accent: '#ffd23f', bottom: '#2b2e36', hair: '#3a2414', eyes: '#3a2414' } },
};
export function regularNpc(id) {
  const R = REGULARS[id];
  const npc = makeNpc(hashSeed(R.seed), { zone: 'town', quest: false });
  Object.assign(npc, { first: R.first, name: R.first, job: R.job, offer: null, greeting: R.greeting, regular: id });
  npc.face = { ...R.face, eyeSizes: [1, 1], look: 0.1 };
  npc.design = { ...npc.design, extra: 'none', back: 'none', trail: 'none', ...R.style, colors: { ...npc.design.colors, ...R.colors } };
  return npc;
}
