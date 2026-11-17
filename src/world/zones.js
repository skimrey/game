/**
 * Zones — the places a run can visit. There are more zones than stages in a run, so
 * every run is a different journey.
 *
 * A run has four STAGES (TIERS in levels/index.js: three levels each, a difficulty band and a
 * movement technique — bounce pads, the air dash, gliding, the double jump). Which ZONE
 * each stage takes place in is drawn per run (`planZones`): the zone decides everything
 * you see and the games that belong to the place —
 *
 *   biome      sky, fog, light, platform textures, the distant ground, the scenery kit
 *   theme      the 2D stage art and palette for its mini-games (games/kit/art.js, engine/palette.js)
 *   capstone   the mini-game the stage's last boss plays (each zone has its own)
 *   vehicles   the travel mini-games that fit a crossing into or out of the zone
 *   names      first names for its bosses; NPC flavour
 *   stages     where in a run the zone may appear (the mood fits the difficulty: a
 *              volcano is never the tutorial, the meadow never the finale)
 *
 * The stage ids (meadow · canyon · alpine · starlit) are also the classic zones of those
 * stages: run 0 (the hand-written campaign) visits exactly those, in that order.
 */
import { mulberry32, hashSeed } from '../levels/generator.js';

export const ZONES = {
  meadow: {
    id: 'meadow', name: 'Green Meadows', biome: 'meadow', theme: 'meadow', stages: [0, 1], capstone: 'echo', vehicles: ['raft'],
    about: 'rolling hills, flowers and cottages',
    names: ['Bramble', 'Clover', 'Thistle', 'Puddle', 'Mossy', 'Pollen', 'Burdock', 'Nettle', 'Dandy', 'Fern', 'Sorrel', 'Tansy'],
  },
  lagoon: {
    id: 'lagoon', name: 'Sunny Lagoon', biome: 'lagoon', theme: 'lagoon', stages: [0, 1, 2], capstone: 'bubble', vehicles: ['raft'],
    about: 'white sand, palm trees and turquoise water',
    names: ['Coral', 'Driftwood', 'Sandy', 'Conch', 'Kelp', 'Barnacle', 'Splash', 'Briny', 'Pearl', 'Tide', 'Seafoam', 'Lagoona'],
  },
  canyon: {
    id: 'canyon', name: 'Sunbaked Canyon', biome: 'canyon', theme: 'canyon', stages: [0, 1, 2], capstone: 'quickdraw', vehicles: ['raft', 'minecart'],
    about: 'red rock mesas and cacti under a hot sun',
    names: ['Dusty', 'Scorch', 'Mesa', 'Rattle', 'Cactus', 'Gulch', 'Sandy', 'Tumble', 'Coyote', 'Flint', 'Sunburn', 'Adobe'],
  },
  grove: {
    id: 'grove', name: 'Mushroom Grove', biome: 'grove', theme: 'grove', stages: [1, 2], capstone: 'bomber', vehicles: ['raft'],
    about: 'giant glowing mushrooms and fireflies at dusk',
    names: ['Spore', 'Morel', 'Truffle', 'Puffball', 'Chanterelle', 'Toadstool', 'Mycel', 'Shiitake', 'Fungo', 'Lichen', 'Gloom', 'Inkcap'],
  },
  alpine: {
    id: 'alpine', name: 'Alpine Dusk', biome: 'alpine', theme: 'alpine', stages: [1, 2, 3], capstone: 'sled', vehicles: ['minecart', 'snowmobile'],
    about: 'snowy peaks and pines in the evening glow',
    names: ['Frost', 'Sleet', 'Glacier', 'Blizzard', 'Icicle', 'Snowdrift', 'Hail', 'Flurry', 'Rime', 'Crag', 'Permafrost', 'Cornice'],
  },
  volcano: {
    id: 'volcano', name: 'Ember Peaks', biome: 'volcano', theme: 'volcano', stages: [2, 3], capstone: 'lavaguard', vehicles: ['minecart'],
    about: 'smoking volcanoes, obsidian and rivers of lava',
    names: ['Cinder', 'Magma', 'Ashen', 'Sulfur', 'Blaze', 'Obsidian', 'Smolder', 'Pyro', 'Scoria', 'Kindle', 'Ember', 'Caldera'],
  },
  crystal: {
    id: 'crystal', name: 'Crystal Caverns', biome: 'crystal', theme: 'crystal', stages: [2, 3], capstone: 'shards', vehicles: ['minecart'],
    about: 'a glittering cave of amethyst and light',
    names: ['Quartz', 'Geode', 'Prism', 'Amethyst', 'Facet', 'Glint', 'Shard', 'Beryl', 'Opal', 'Jasper', 'Lustre', 'Garnet'],
  },
  starlit: {
    id: 'starlit', name: 'Starlit Ruins', biome: 'starlit', theme: 'starlit', stages: [2, 3], capstone: 'invaders', vehicles: ['snowmobile'],
    about: 'ancient ruins floating among the stars',
    names: ['Gloom', 'Nebula', 'Astra', 'Umbra', 'Comet', 'Eclipse', 'Quasar', 'Lumen', 'Void', 'Nova', 'Pulsar', 'Zenith'],
  },
};
export const ZONE_IDS = Object.keys(ZONES);
/** The hand-written campaign's journey (run 0): one classic zone per stage. */
export const CLASSIC_ZONES = ['meadow', 'canyon', 'alpine', 'starlit'];
/** Games that only fit some zones' terrain (the sled needs snow, the lander the stars). */
export const ZONE_AFFINITY = { sled: ['alpine'], lander: ['starlit'] };

export const zoneOf = id => ZONES[id] || ZONES.meadow;

/** The vehicles that fit a crossing between two zones (the biplane fits any). */
export function travelVehicles(from, to) {
  return [...new Set([...zoneOf(from).vehicles, ...zoneOf(to).vehicles, 'plane'])];
}

/**
 * Can the crossings of a journey each get their own vehicle (no vehicle twice — the
 * encounter plan never repeats a game)? A tiny matching by backtracking.
 */
export function crossingsFit(zones) {
  const crossings = zones.slice(1).map((to, i) => travelVehicles(zones[i], to));
  const used = new Set();
  const solve = k => {
    if (k === crossings.length) return true;
    for (const v of crossings[k]) {
      if (used.has(v)) continue;
      used.add(v);
      if (solve(k + 1)) return true;
      used.delete(v);
    }
    return false;
  };
  return solve(0);
}

/**
 * The zones of a run, one per stage: every stage gets a zone that may appear there, no
 * zone twice, every crossing gets its own vehicle. Seeded; run 0 is the classic journey.
 * Consecutive runs tend to differ (a zone drawn for a stage is less likely to be drawn
 * for it again next time — `avoid` may list the previous run's zones).
 */
export function planZones(runSeed, stages = 4, { avoid = [] } = {}) {
  if (!runSeed) return CLASSIC_ZONES.slice(0, stages);
  const rng = mulberry32(hashSeed('zones', runSeed));
  for (let attempt = 0; attempt < 200; attempt++) {
    const out = [];
    for (let s = 0; s < stages; s++) {
      const options = ZONE_IDS.filter(id => ZONES[id].stages.includes(s) && !out.includes(id));
      if (!options.length) break;
      // a zone the last run had at this stage weighs less (not forbidden)
      const weights = options.map(id => (avoid[s] === id ? 0.25 : 1));
      let roll = rng() * weights.reduce((a, b) => a + b, 0);
      out.push(options.find((_, i) => (roll -= weights[i]) <= 0) || options.at(-1));
    }
    if (out.length === stages && crossingsFit(out)) return out;
  }
  return CLASSIC_ZONES.slice(0, stages);
}
