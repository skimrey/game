/**
 * Bosses and checkpoint challenges — a new set every run (roguelite), generated from
 * the run seed, the level's place in the campaign and how many times the player has
 * already met that mini-game this run.
 *
 *   const boss = makeBoss({ runSeed, index, count, tier, mode, iteration, capstone });
 *   const challenge = makeChallenge({ runSeed, index, count, tier, mode, iteration });
 *
 * Which mini-game goes where is planned per run by progression/encounters.js.
 *
 * Every boss gets
 *   - a generated pixel-art monster (characters/monsters.js): body, eyes, mouth, horns, limbs,
 *     pattern and colours all come from the seed
 *   - a generated name and title in the flavour of its region and game
 *   - numbers (bossStats) that ramp with the campaign *and* with each return of the same
 *     game (the second Tennis Match is tougher than the first), jittered a little per run
 * Checkpoint challenges (Cloud Hop, Flap Dash, Block Drop) have no monster: a goal
 * (metres, gates, lines) instead of a boss health bar.
 *
 * Mechanical checks keep a run from going too wild: the numbers are re-rolled (and in
 * the end fall back to the un-jittered ramp) unless a perfect bot wins with plenty of
 * time to spare and without losing more than one heart, and a player who does nothing
 * loses.
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { CAPSTONES, playBoss, MODES, rolesOf } from '../games/index.js';
import { ZONES } from '../world/zones.js';
import { STAGE_THEMES } from '../engine/palette.js';
import { spreadHues } from '../characters/looks.js';

/** The hues of a zone's 2D backdrop a boss must not blend into: the sky, the near hills, the ground. */
export function backdropHues(zone) {
  const T = STAGE_THEMES[zone] || STAGE_THEMES.meadow;
  return [0, 5, 7].filter(i => T.colors[i][1] >= 0.3).map(i => (((T.hue + T.colors[i][0]) % 360) + 360) % 360);
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));

export const BOSS_RULES = {
  maxTimeShare: 0.65,     // a perfect player must win within this share of the clock
  maxHeartsLost: 1,       // … losing at most this many hearts
  attempts: 8,            // re-rolls before falling back to the plain ramp
};

/** Which monster body fits each boss game. */
export const ROLE_FOR_MODE = { runner: 'walker', echo: 'dancer', quickdraw: 'flyer', sled: 'brute', starbeat: 'floater', tennis: 'walker', invaders: 'floater', fireball: 'brute', breakout: 'floater', cannon: 'brute', whack: 'dancer', fishing: 'floater', maze: 'floater', parry: 'brute', delve: 'brute', bubble: 'floater', bomber: 'walker', lavaguard: 'brute', shards: 'floater' };

/**
 * Difficulty 0..1 of a mini-game: later in the campaign is harder, and so is every return
 * of the same game in a run (iteration 0, 1, 2); region capstones get a little extra.
 */
export function gameDifficulty({ index = 0, count = 12, iteration = 0, capstone = false } = {}) {
  const position = count > 1 ? index / (count - 1) : 0.5;
  return clamp01(0.1 + 0.5 * position + 0.28 * iteration + (capstone ? 0.08 : 0));
}

/** First names for bosses, by zone (world/zones.js). */
const NAME_PARTS = Object.fromEntries(Object.values(ZONES).map(z => [z.id, z.names]));
const NOUNS = {
  walker: ['Stomper', 'Muncher', 'Lumberjaw', 'Grumble', 'Chomper', 'Bruiser', 'Snapper', 'Gobbler'],
  dancer: ['Bopper', 'Hopper', 'Twirler', 'Shimmy', 'Jiggler', 'Waltzer'],
  flyer: ['Buzzard', 'Flapper', 'Screecher', 'Swooper', 'Honker', 'Vulture'],
  brute: ['Yeti', 'Bigfoot', 'Mauler', 'Abominable', 'Sasquatch', 'Lout'],
  floater: ['Wisp', 'Chorister', 'Drifter', 'Siren', 'Crooner', 'Warbler'],
};
const TITLES = {
  runner: ['Hurler of Spikes', 'Keeper of the Path', 'Spike-Thrower Supreme', 'The Unjumpable', 'Lord of Pointy Things'],
  echo: ['Dance Champion of the Meadow', 'Queen of the Copycats', 'The Move-Maker', 'Twinkle-Toes Tyrant'],
  quickdraw: ['Boss of the Flock', 'Scourge of the Mesas', 'Outlaw of the Open Sky', 'The Feathered Menace'],
  sled: ['Terror of the Slopes', 'The Thing in the Snow', 'Chaser of Sleds', 'Snowball Sovereign'],
  starbeat: ['Voice of the Void', 'The Last Song of the Stars', 'Conductor of Comets', 'Singer in the Dark'],
  tennis: ['Champion of the Court', 'The Unreturnable', 'Master of the Lob', 'Grand Slammer'],
  invaders: ['Commander of the Flock', 'Mothership Supreme', 'Lord of the Swarm', 'Queen of the Starfleet'],
  fireball: ['Sender of Goo', 'The Minion Master', 'Lord of the Blobs', 'Guardian of the Gate'],
  breakout: ['Lord of the Wall', 'The Bricklayer', 'Keeper of the Bricks', 'Behind-the-Wall'],
  cannon: ['Admiral of the Hills', 'The Big Bang', 'Master of the Lob', 'Captain Kaboom'],
  whack: ['Hider in the Holes', 'The Peekaboo Pest', 'Pop-Up Prince', 'Mole Monarch'],
  fishing: ['The One That Got Away', 'Lord of the Deep', 'The Big Catch', 'King of the Pond'],
  maze: ['Haunter of the Halls', 'The Maze Phantom', 'Ghost of the Gems', 'Corridor Creeper'],
  bubble: ['Bubbler of the Deep', 'Queen of the Tide Pools', 'The Froth Lord', 'Keeper of the Reef'],
  bomber: ['Sower of Spores', 'The Puffball Prince', 'Lord of the Toadstools', 'Keeper of the Clearing'],
  lavaguard: ['Heart of the Mountain', 'The Molten King', 'Lord of the Lava', 'Fire-Belly of the Peaks'],
  shards: ['Heart of the Geode', 'The Prism Tyrant', 'Lord of the Glittering Deep', 'Shatterer of Caves'],
  parry: ['Master of the Blade', 'The Unparried', 'Duelist Supreme', 'Swordmaster of the Realm'],
};
const CHALLENGE_TITLES = {
  doodle: 'Checkpoint · climb the clouds',
  flappy: 'Checkpoint · fly the gauntlet',
  tetris: 'Checkpoint · clear the lines',
  frogger: 'Checkpoint · cross the road and the river',
  lander: 'Checkpoint · land on the moon pads',
  whack: 'Checkpoint · whack the critters',
  fishing: 'Checkpoint · catch some fish',
  maze: 'Checkpoint · gobble the gems',
  parry: 'Checkpoint · win the sword duel',
  raft: to => `Travel · down the river to ${to}`,
  minecart: to => `Travel · through the rock by mine cart to ${to}`,
  snowmobile: to => `Travel · over the snowy ridges to ${to}`,
  plane: to => `Travel · fly to ${to}`,
  delve: 'Quest · clear the dungeon',
};

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/**
 * The mini-game's numbers at difficulty d (0..1), jittered by `j` (0 = none).
 * iteration: the how-many-th time this game is played in the run (echo's timing
 * check gets stricter with it).
 */
export function bossStats(mode, d, rng = () => 0.5, j = 0, iteration = 0, kind = 'boss') {
  const jit = (v, amount = 0.08) => v * (1 + (rng() * 2 - 1) * amount * j);
  d = clamp01(d);
  const keys = d >= 0.8 ? 'letters+digits' : 'letters';
  switch (mode) {
    case 'echo': {
      const hp = d > 0.5 ? 5 : 4;
      // timing check: once mid-fight the first time; after every round from the second time on
      const gaugeRounds = iteration === 0 ? [Math.floor(hp / 2)] : Array.from({ length: hp - 1 }, (_, i) => i + 1);
      return { hp, time: 75, startLength: 3, beat: jit(lerp(0.6, 0.42, d)), keys: 'arrows', gaugeRounds, gaugePeriod: jit(lerp(1.5, 0.85, d)), gaugeZone: lerp(0.22, 0.12, d) };
    }
    case 'quickdraw':
      return { hp: Math.round(lerp(8, 13, d)), time: 45, speed: jit(lerp(44, 68, d)), interval: jit(lerp(1.5, 1.0, d)), maxAlive: d > 0.5 ? 3 : 2 };
    case 'sled':
      return { hp: Math.round(lerp(5, 8, d)), time: 52, speed: jit(lerp(95, 125, d)), rampEvery: 3, busy: jit(lerp(0.3, 0.5, d)), throwEvery: jit(lerp(3.2, 2.4, d)) };
    case 'starbeat':
      return { hp: Math.round(lerp(16, 28, d)), time: 45, bpm: jit(lerp(96, 124, d), 0.05), density: d, keys: 'lanes' };
    case 'tennis':
      return { hp: Math.round(lerp(3, 5, d)), time: 70, ballSpeed: jit(lerp(115, 155, d)), foeSpeed: jit(lerp(80, 125, d)), cunning: lerp(0.15, 0.6, d), foeSloppiness: lerp(12, 5, d), readAhead: lerp(0, 40, d) };
    case 'invaders':
      return { hp: Math.round(lerp(5, 8, d)), time: 60, rows: d > 0.5 ? 3 : 2, cols: Math.round(lerp(5, 6, d)), march: jit(lerp(12, 18, d)), descend: Math.round(lerp(5, 7, d)), foeSpeed: jit(lerp(26, 44, d)), bombEvery: jit(lerp(1.8, 1.3, d)) };
    case 'fireball':
      return { hp: Math.round(lerp(8, 14, d)), time: 50, foeSpeed: jit(lerp(50, 80, d)), foeEvery: jit(lerp(1.7, 0.95, d)), flyers: lerp(0.2, 0.5, d), gooSpeed: jit(lerp(70, 100, d)), gooEvery: jit(lerp(3.4, 2.2, d)) };
    case 'doodle':
      return { hp: Math.round(lerp(8, 13, d)), time: 40, springs: 0.08, drifters: lerp(0, 0.25, d), thin: lerp(0, 0.25, d), spread: d * 0.7 };
    case 'flappy':
      return { hp: Math.round(lerp(7, 13, d)), time: 45, speed: jit(lerp(70, 88, d)), gap: Math.round(lerp(74, 57, d)), spacing: jit(lerp(125, 102, d)) };
    case 'tetris':
      return { hp: Math.round(lerp(3, 7, d)), time: 100, gravity: jit(lerp(0.7, 0.38, d)) };
    case 'breakout':
      return { hp: Math.round(lerp(3, 5, d)), time: 90, ballSpeed: jit(lerp(115, 138, d)), foeSpeed: jit(lerp(30, 55, d)), rows: d < 0.5 ? 2 : 3, gaps: d < 0.4 ? 3 : d < 0.7 ? 4 : 6, patch: d < 0.4 ? 0 : jit(lerp(7, 5.5, d)), goo: d < 0.6 ? 0 : jit(lerp(5, 3.6, d)) };
    case 'cannon':
      return { hp: Math.round(lerp(3, 6, d)), time: 60, wind: d < 0.35 ? 0 : Math.round(lerp(14, 40, d)), fireEvery: jit(lerp(4.6, 2.9, d)), flight: lerp(1.9, 1.35, d), spread: lerp(10, 4, d) };
    case 'whack':
      return kind === 'checkpoint'
        ? { hp: Math.round(lerp(12, 20, d)), time: 40, upTime: jit(lerp(1.35, 0.85, d)), popEvery: jit(lerp(0.75, 0.45, d)), bombs: d < 0.35 ? 0 : lerp(0.12, 0.22, d), bossChance: 0 }
        : { hp: Math.round(lerp(5, 8, d)), time: 50, upTime: jit(lerp(1.3, 0.85, d)), popEvery: jit(lerp(0.7, 0.45, d)), bombs: d < 0.35 ? 0 : lerp(0.12, 0.2, d), bossChance: 0.2 };
    case 'fishing':
      return kind === 'checkpoint'
        ? { hp: Math.round(lerp(3, 5, d)), time: 70, biteWait: [1.2, 3], darts: lerp(1.2, 2.4, d), pull: lerp(0.45, 0.9, d), zone: lerp(0.2, 0.13, d), reelRate: lerp(0.36, 0.28, d), slipRate: lerp(0.18, 0.3, d) }
        : { hp: Math.round(lerp(3, 4, d)), time: 80, biteWait: [1, 2.5], darts: lerp(1.8, 3, d), pull: lerp(0.7, 1.1, d), zone: lerp(0.17, 0.12, d), reelRate: lerp(0.3, 0.24, d), slipRate: lerp(0.22, 0.32, d) };
    case 'maze':
      return kind === 'checkpoint'
        ? { hp: Math.round(lerp(40, 60, d)), time: 60, heroSpeed: 5.5, ghosts: Math.round(lerp(2, 3, d)), ghostSpeed: jit(lerp(2.8, 3.8, d)), chase: lerp(0.35, 0.6, d) }
        : { hp: Math.round(lerp(3, 5, d)), time: 75, heroSpeed: 5.5, ghosts: Math.round(lerp(1, 2, d)), ghostSpeed: jit(lerp(2.8, 3.6, d)), chase: lerp(0.35, 0.55, d) };
    case 'frogger':
      return { hp: Math.round(lerp(2, 4, d)), time: 60, carSpeed: jit(lerp(26, 42, d)), carGap: lerp(96, 74, d), logSpeed: jit(lerp(15, 26, d)), logGap: lerp(66, 84, d), logLength: lerp(4.5, 3, d) };
    case 'lander':
      return { hp: Math.round(lerp(2, 4, d)), time: 70, gravity: jit(lerp(14, 20, d)), fuel: lerp(8, 5.5, d), padWidth: Math.round(lerp(40, 28, d)), wind: d < 0.5 ? 0 : lerp(2, 5, d) * (rng() < 0.5 ? -1 : 1) };
    case 'parry':
      return { hp: 3, time: kind === 'checkpoint' ? 45 : 50, windup: jit(lerp(1.1, 0.34, d)), feint: d < 0.25 ? 0 : lerp(0.2, 0.6, d), combo: d < 0.4 ? 0 : lerp(0.2, 0.55, d), window: lerp(0.8, 0.34, d), rest: jit(lerp(1.0, 0.55, d)) };
    case 'bubble':
      return { hp: Math.round(lerp(8, 13, d)), time: 90, colors: d < 0.5 ? 4 : 5, rows: d < 0.5 ? 5 : 6, pushEvery: jit(lerp(14, 8, d)), junk: d < 0.35 ? 0 : jit(lerp(9, 5.5, d)) };
    case 'bomber':
      return { hp: Math.round(lerp(3, 4.4, d)), time: Math.round(lerp(70, 85, d)), shrooms: lerp(0.22, 0.34, d), bossSpeed: jit(lerp(1.9, 2.7, d)), pause: lerp(0.4, 0.25, d), dodge: lerp(0.3, 0.6, d), wary: lerp(0.9, 1.3, d), chase: lerp(0.5, 0.7, d), bossBombEvery: jit(lerp(6, 3.6, d)), minions: d < 0.6 ? 0 : jit(lerp(12, 8, d)) };
    case 'lavaguard':
      return { hp: Math.round(lerp(13, 22, d)), time: 55, bombSpeed: jit(lerp(32, 62, d)), every: jit(lerp(1.5, 0.7, d)), split: d < 0.4 ? 0 : lerp(0.2, 0.45, d), maxAlive: Math.round(lerp(3, 5, d)) };
    case 'shards':
      return { hp: Math.round(lerp(5, 8, d)), time: 60, orbiters: Math.round(lerp(5, 8, d)), orbit: lerp(1.1, 2, d), regrow: lerp(3, 2, d), foeSpeed: jit(lerp(18, 32, d)), rockSpeed: jit(lerp(24, 38, d)), every: jit(lerp(4, 2.8, d)), maxRocks: Math.round(lerp(5, 8, d)), startRocks: d < 0.5 ? 1 : 2 };
    case 'delve':                          // hp: the Warden's (the game adds up every foe's health)
      return { hp: Math.round(lerp(10, 16, d)), wardenHp: Math.round(lerp(10, 16, d)), time: Math.round(lerp(135, 120, d)), rooms: 3 };
    case 'raft': {
      const current = jit(lerp(60, 80, d));
      return { hp: 10, time: 45, current, stretch: current * 2.5, width: lerp(160, 136, d), narrow: lerp(12, 22, d), wind1: lerp(28, 40, d), wind2: lerp(8, 16, d), busy: lerp(0.15, 0.35, d), whirls: d < 0.3 ? 0.06 : lerp(0.1, 0.18, d), pull: lerp(45, 70, d) };
    }
    case 'minecart': {
      const speed = jit(lerp(120, 165, d));
      return { hp: 10, time: 45, speed, stretch: speed * 2.7, spacing: lerp(150, 100, d), gapWidth: lerp(38, 58, d), beams: lerp(0.25, 0.35, d) };
    }
    case 'snowmobile':
      return { hp: 10, time: 50, stretch: 360, hills: lerp(22, 34, d), crevasse: lerp(42, 66, d), crevasseEvery: lerp(720, 460, d) };
    case 'plane': {
      const speed = jit(lerp(88, 118, d));
      return { hp: 10, time: 45, speed, stretch: speed * 2.6, birds: lerp(0.28, 0.45, d), spacing: lerp(92, 70, d), ringSize: lerp(15, 11, d) };
    }
    default: {
      const w = () => 1 + Math.round(rng() * 2 * j);
      return {
        hp: Math.round(lerp(7, 13, d)),
        time: Math.round(lerp(38, 44, d)),
        speed: jit(lerp(100, 157, d)),
        gap: [jit(lerp(1.55, 0.95, d)), jit(lerp(2.3, 1.4, d))],
        attacks: { spike: 5 - Math.round(3 * d), tall: w() + Math.round(2 * d), double: Math.round(3 * d * w() / 2), ball: Math.round(3 * d) },
        keys,
      };
    }
  }
}

/** Does the boss pass the mechanical checks? → { ok, issues, results } */
export function checkBoss(boss, seeds = [1, 2]) {
  const issues = [];
  const results = seeds.map(seed => {
    const perfect = playBoss(boss, { seed });
    const idle = playBoss(boss, { seed, idle: true });
    if (perfect.result !== 'won') issues.push(`seed ${seed}: a perfect player loses (${perfect.reason})`);
    else if (perfect.time > boss.time * BOSS_RULES.maxTimeShare) issues.push(`seed ${seed}: too long (${perfect.time.toFixed(1)} of ${boss.time} s)`);
    if (perfect.hearts < perfect.maxHearts - BOSS_RULES.maxHeartsLost) issues.push(`seed ${seed}: a perfect player loses ${perfect.maxHearts - perfect.hearts} hearts`);
    if (idle.result !== 'lost') issues.push(`seed ${seed}: doing nothing wins`);
    return { perfect: { time: perfect.time, hearts: perfect.hearts }, idle: { time: idle.time, reason: idle.reason } };
  });
  return { ok: issues.length === 0, issues, results };
}

/** Settle the numbers: jittered per run, re-rolled until the bots are happy, else the plain ramp. */
function withCheckedStats(base, { runSeed, index, d, iteration, check }) {
  for (let attempt = 0; check && attempt < BOSS_RULES.attempts; attempt++) {
    const candidate = { ...base, ...bossStats(base.mode, d, mulberry32(hashSeed('stats', runSeed, index, base.mode, attempt)), 1, iteration, base.kind) };
    if (checkBoss(candidate, [1, 2]).ok) return candidate;
  }
  return { ...base, ...bossStats(base.mode, d, () => 0.5, 0, iteration, base.kind) };
}

/**
 * The boss at the end of a level.
 *   runSeed    the run (0 = the default run)
 *   index      the level's place in the campaign, count = campaign length
 *   tier       the zone it's played in (world/zones.js: meadow, lagoon, canyon, grove, alpine, volcano,
 *              crystal, starlit) — flavours the name and the stage art; for a trip, the destination
 *   slot       the level's place in its region (keeps a region's boss names apart)
 *   mode       the mini-game (default: the region's capstone for capstones, else the runner)
 *   iteration  how many times this run already played this mini-game
 */
export function makeBoss({ runSeed = 0, index = 0, count = 12, tier = 'meadow', capstone = false, mode = null, iteration = 0, check = true, slot = index, role = null, difficulty = null } = {}) {
  mode = mode || (capstone ? CAPSTONES[tier] : 'runner') || 'runner';
  const roles = rolesOf(mode);
  role = role && roles.includes(role) ? role : roles[0];
  if (role !== 'boss') return makeChallenge({ runSeed, index, count, tier, mode, iteration, check, kind: role, difficulty });
  const d = difficulty ?? gameDifficulty({ index, count, iteration, capstone });
  const rng = mulberry32(hashSeed('boss', runSeed, index, tier));
  const body = ROLE_FOR_MODE[mode] || 'walker';
  const region = NAME_PARTS[tier] ? tier : 'meadow';
  // names: each region's bosses in a run draw different first names (a per-run shuffle, indexed by slot)
  const names = shuffled(NAME_PARTS[region], mulberry32(hashSeed('names', runSeed, region)));
  const first = names[slot % names.length], noun = pick(rng, NOUNS[body]);
  const name = rng() < 0.5 ? `${first} ${noun}` : `${first}${pick(rng, ['wump', 'gob', 'maw', 'snoot', 'fang', 'belly', 'grub', 'toad'])}`;
  // colour: a stage's three bosses take hues spread round the wheel (a triad, turned away from the
  // zone's sky and ground so none blends into its backdrop), each nudged a little (characters/looks.js)
  const stageHues = spreadHues(3, { seed: hashSeed('stage-hues', runSeed, index - slot, region), avoid: backdropHues(region) });
  const hue = Math.round(stageHues[((slot % 3) + 3) % 3] + rng() * 16 - 8 + 360) % 360;
  const base = {
    id: `boss-${runSeed}-${index}`,
    kind: 'boss',
    index,
    name,
    title: pick(rng, TITLES[mode]),
    mode,
    game: MODES[mode].name,
    role: body,
    theme: region,
    monsterSeed: hashSeed('monster', runSeed, index),
    hue,
    accentHue: (hue + 120 + Math.floor(rng() * 120)) % 360,
    minionHue: (hue + 60 + Math.floor(rng() * 240)) % 360,
    difficulty: d,
    iteration,
    capstone: !!capstone,
  };
  return withCheckedStats(base, { runSeed, index, d, iteration, check });
}

/** A checkpoint challenge (no monster): a goal in place of the boss's health. */
export function makeChallenge({ runSeed = 0, index = 0, count = 12, tier = 'meadow', mode = 'doodle', iteration = 0, check = true, kind = 'checkpoint', difficulty = null } = {}) {
  const d = difficulty ?? gameDifficulty({ index, count, iteration });
  const rng = mulberry32(hashSeed('challenge', runSeed, index, mode));
  const hue = Math.floor(rng() * 360);
  const base = {
    id: `${kind}-${runSeed}-${index}`,
    kind,
    index,
    name: MODES[mode].name,
    title: typeof CHALLENGE_TITLES[mode] === 'function' ? CHALLENGE_TITLES[mode](ZONES[tier]?.name || 'the next zone') : CHALLENGE_TITLES[mode] || (kind === 'travel' ? 'Travel' : 'Checkpoint'),
    mode,
    game: MODES[mode].name,
    role: 'flyer',
    theme: NAME_PARTS[tier] ? tier : 'meadow',
    monsterSeed: hashSeed('monster', runSeed, index, kind),
    hue,
    accentHue: (hue + 150) % 360,
    minionHue: (hue + 200) % 360,
    difficulty: d,
    iteration,
    capstone: false,
  };
  return withCheckedStats(base, { runSeed, index, d, iteration, check });
}
