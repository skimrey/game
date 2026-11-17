/**
 * Journeys between zones: the travel mini-game after a stage's last level (3D or 2D — travelView).
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { campaign, controls, G, profile, screen, TRAVEL_PARAM, travelled } from './boot.js';
import { playBattle, say } from './level.js';
import { nextLevel, recordResult } from './run.js';
import { createTravelScene } from '../games/kit/travel3d.js';
import { hashSeed } from '../levels/generator.js';
import { makeBoss } from '../progression/bosses.js';
import { BIOMES } from '../world/biomes.js';
import { ZONES } from '../world/zones.js';

/** Test menu: this run's next journey, for real (the levels before it are skipped; the trip leads on to the level after it). */
export function skipToNextJourney() {
  if (G.phase !== 'play' || screen.isOpen || G.inTown) return;
  const i = G.encounterPlan.findIndex((e, k) => k >= G.levelIndex && e?.travel && !travelled.has(k));
  if (i < 0) { say('No journeys left on this run — 🎲 New run, or test one from the menu.', 4); return; }
  G.levelIndex = i;
  runTravel(G.encounterPlan[i].travel);
}

export function travelView(zoneId, force = null) {
  if (!G.renderer) return {};
  const zone = ZONES[zoneId] ? zoneId : 'meadow';
  const biome = BIOMES[ZONES[zone]?.biome] || BIOMES.meadow;
  const pref = force || TRAVEL_PARAM || profile.get().travelView || '3d';
  return {
    scene3d: createTravelScene({ render: G.renderer, design: G.currentDesign, pet: G.pet, biome, zone }),
    use3d: pref === '3d',
    onViewChange: v => profile.update(d => { d.travelView = v; }),
  };
}

export async function runTravel(trip) {
  G.phase = 'battle';
  document.body.classList.add('in-battle');
  controls.clear();
  const from = ZONES[trip.from], to = ZONES[trip.to];
  const ride = makeBoss({ runSeed: G.runSeed, index: G.levelIndex, count: campaign.length, tier: trip.to, mode: trip.mode, role: 'travel', difficulty: trip.difficulty });
  const { won } = await playBattle({ boss: ride, design: G.currentDesign, seed: hashSeed('travel', G.runSeed, G.levelIndex), levelName: `${from?.name} → ${to?.name}`, spells: G.runSpells, pet: G.pet, ...travelView(trip.to) });
  recordResult('travel', won);
  travelled.add(G.levelIndex);
  document.body.classList.remove('in-battle');
  say(won ? `You made it to ${to?.name}!` : `You walked the long way round to ${to?.name}.`, 3);
  nextLevel();
}
