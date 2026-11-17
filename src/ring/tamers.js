/**
 * The Ring's ladder and its tamers (pure).
 *
 * Tamers from every world come to the Ring behind the inn with squads of three monsters from
 * their home — mostly of its type, plus one from somewhere else. They fight at your RING TIER
 * (Rookie → Bronze → Silver → Gold → Champion); beat the three who are there to rise (the next,
 * tougher ones arrive while you're off on a run — like the card battlers in the square).
 * Higher tiers bring higher levels and sharper tamers.
 *
 *   RING_TIERS[t] → { name, level: [lo, hi], skill }
 *   tamerSquad(seed, zone, tier) → three monsters (plain JSON, like yours)
 *   xpForWin(mine, theirs, won) → experience for each of your monsters
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { ZONE_TYPE, SIGNATURE_MODES } from './monsters.js';
import { ZONES } from '../world/zones.js';
import { ROLE_FOR_MODE } from '../progression/bosses.js';

export const RING_TIERS = [
  { name: 'Rookie', level: [2, 4], skill: 0.35 },
  { name: 'Bronze', level: [5, 7], skill: 0.55 },
  { name: 'Silver', level: [8, 11], skill: 0.72 },
  { name: 'Gold', level: [12, 15], skill: 0.86 },
  { name: 'Champion', level: [16, 20], skill: 1 },
];
/** How many monsters you need to enter the Ring. */
export const SQUAD = 3;

const NOUNS = ['Stomper', 'Muncher', 'Chomper', 'Bopper', 'Flapper', 'Wisp', 'Grumble', 'Snapper', 'Twirler', 'Drifter', 'Bruiser', 'Hopper'];
/** The games whose bosses come from each zone (its capstone first). */
const ZONE_MODES = {
  meadow: ['echo', 'runner', 'tennis', 'whack'], lagoon: ['bubble', 'fishing', 'tennis', 'cannon'], canyon: ['quickdraw', 'runner', 'cannon', 'maze'],
  grove: ['bomber', 'maze', 'whack', 'starbeat'], alpine: ['sled', 'breakout', 'parry', 'cannon'], volcano: ['lavaguard', 'fireball', 'whack', 'quickdraw'],
  crystal: ['shards', 'invaders', 'starbeat', 'maze'], starlit: ['invaders', 'starbeat', 'fireball', 'shards'],
};

/** A monster a tamer brings: like a befriended boss, made from a seed. */
export function wildMonster(seed, { zone = 'meadow', level = 5, mode = null } = {}) {
  const rng = mulberry32(hashSeed('wild', seed));
  const modes = ZONE_MODES[zone] || SIGNATURE_MODES;
  mode = mode || modes[Math.floor(rng() * modes.length)];
  const names = ZONES[zone]?.names || ['Bramble'];
  const hue = Math.floor(rng() * 360);
  return {
    id: `wild-${seed}`,
    name: `${names[Math.floor(rng() * names.length)]} ${NOUNS[Math.floor(rng() * NOUNS.length)]}`,
    title: '', mode, body: ROLE_FOR_MODE[mode] || 'walker', type: ZONE_TYPE[zone] || 'leaf', zone,
    monsterSeed: hashSeed('wild-monster', seed), hue, accentHue: (hue + 120 + Math.floor(rng() * 120)) % 360,
    level, xp: 0, wins: 0,
  };
}

/** A tamer's squad: two of their home zone, one from elsewhere, levels from the tier. */
export function tamerSquad(seed, zone, tier = 0) {
  const T = RING_TIERS[Math.max(0, Math.min(RING_TIERS.length - 1, tier))];
  const rng = mulberry32(hashSeed('squad', seed, zone, tier));
  const zones = Object.keys(ZONE_TYPE);
  const away = zones.filter(z => z !== zone)[Math.floor(rng() * (zones.length - 1))];
  return [zone, zone, away].map((z, k) => wildMonster(hashSeed(seed, zone, tier, k), { zone: z, level: T.level[0] + Math.floor(rng() * (T.level[1] - T.level[0] + 1)) }));
}

/** Experience for each of your monsters after a fight (a loss still teaches a little). */
export function xpForWin(mine, theirs, won) {
  const theirLevel = theirs.reduce((a, m) => a + m.level, 0) / Math.max(1, theirs.length);
  return mine.map(m => {
    const ratio = Math.max(0.4, Math.min(1.6, theirLevel / Math.max(1, m.level)));
    return Math.round((12 + theirLevel * 6) * ratio * (won ? 1 : 0.35));
  });
}

/** Gold for a win at a tier. */
export const goldForWin = tier => 12 + tier * 8;
