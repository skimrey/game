/**
 * The test menu's mini-game launcher (play any game, any role, any difficulty; journeys in 3D or 2D).
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { benchSeconds, campaign, controls, G, params, profile, screen, travelled } from './boot.js';
import { setPet } from './hero.js';
import { loadLevel, playBattle, say } from './level.js';
import { finishRun, newRunSeed, startRun } from './run.js';
import { enterTown } from './town.js';
import { skipToNextJourney, travelView } from './travel.js';
import { CARD_IDS, CARDS } from '../cards/catalog.js';
import { starterDeck } from '../cards/decks.js';
import { testCardMatch, tierName } from './townCards.js';
import { enterInn, ringTierName } from './inn.js';
import { wildMonster } from '../ring/tamers.js';
import { levelFor, ZONE_TYPE } from '../ring/monsters.js';
import { makePet, SPECIES } from '../characters/pets.js';
import { MODES, rolesOf, TRAVEL_GAMES } from '../games/index.js';
import { hashSeed, mulberry32 } from '../levels/generator.js';
import { makeBoss } from '../progression/bosses.js';
import { spellOffer, SPELLS } from '../progression/spells.js';
import { createTestMenu } from '../ui/testMenu.js';
import { zoneFor } from '../world/environment.js';
import { ZONE_IDS, ZONES } from '../world/zones.js';

/** Test menu: play any mini-game (as boss / checkpoint / travel) at a difficulty now (no reward), then carry on. */
export const TEST_DIFFICULTY = [0.15, 0.55, 0.95];

export async function playTestGame(mode, level3, role, { view = null, zone = null } = {}) {
  if (G.phase !== 'play' || screen.isOpen) return;
  const level = campaign[G.levelIndex];
  G.phase = 'battle';
  document.body.classList.add('in-battle');
  controls.clear();
  const tier = zone || (MODES[mode].id === 'sled' ? 'alpine' : mode === 'lander' ? 'starlit' : zoneFor(level).id);
  const boss = makeBoss({ runSeed: G.runSeed, index: G.levelIndex, count: campaign.length, tier, mode, role, capstone: false, difficulty: TEST_DIFFICULTY[level3], check: role !== 'quest' });
  if (mode === 'delve') Object.assign(boss, { name: 'The Rift Warden', cls: G.runClass, role: 'brute' });
  await playBattle({ boss, design: G.currentDesign, seed: hashSeed('test', mode, level3, Date.now()), levelName: `Test menu · ${['easy', 'medium', 'hard'][level3]}`, spells: G.runSpells, pet: G.pet, ...travelView(tier, view) }, { practice: true });
  document.body.classList.remove('in-battle');
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  G.phase = 'play';
}

/** The test menu (testing mode: ?quality=test | testhq, or ?dev=1). */
export function setUpTestMenu(startQuality) {
  if (!benchSeconds && (startQuality.testing || params.has('dev'))) {
    G.testMenu = createTestMenu({
      games: Object.values(MODES).flatMap(m => rolesOf(m.id).map(role => ({ id: m.id, name: m.name, role }))),
      levels: () => ({ run: G.runSeed, current: G.levelIndex, list: campaign.map((l, i) => ({ name: l.name, tier: zoneFor(l).name, boss: G.encounterPlan[i]?.boss, checkpoint: G.encounterPlan[i]?.checkpoint, travel: G.encounterPlan[i]?.travel })) }),
      onLevel(i) {
        if ((G.phase !== 'play' && G.phase !== 'hub') || screen.isOpen) return;
        if (G.inTown) { G.inTown = false; document.body.classList.remove('in-town'); G.hud.setVisible(true); G.phase = 'play'; }
        G.started = true; G.finished = false;
        loadLevel(i);
      },
      onGame: (mode, level3, role) => playTestGame(mode, level3, role),
      journeys: () => {
        const k = G.encounterPlan.findIndex((e, i) => i >= G.levelIndex && e?.travel && !travelled.has(i)), trip = G.encounterPlan[k]?.travel;
        return {
          vehicles: TRAVEL_GAMES.map(id => ({ id, name: MODES[id].name })),
          zones: ZONE_IDS.map(id => ({ id, name: ZONES[id].name })),
          next: trip ? { index: k, from: ZONES[trip.from]?.name, to: ZONES[trip.to]?.name, name: MODES[trip.mode].name } : null,
        };
      },
      onJourney: ({ mode, level3, view, zone }) => playTestGame(mode, level3, 'travel', { view, zone }),
      onNextJourney: () => skipToNextJourney(),
      onGem() {
        if (G.phase !== 'play' || screen.isOpen) return;
        const g = campaign[G.levelIndex].goal;
        Object.assign(G.session.player, { x: g.x, y: g.y + 0.3, z: g.z, vx: 0, vy: 0, vz: 0 });
      },
      onArcade() {
        if (G.phase !== 'play' || screen.isOpen) return;
        if (!G.arcade || G.arcade.state !== 'ready') { say(G.arcade ? 'This arcade has been played.' : 'No arcade checkpoint in this level — the 🕹 chips show which levels have one.'); return; }
        Object.assign(G.session.player, { x: G.arcade.spot.x, y: G.arcade.spot.y + 0.3, z: G.arcade.spot.z + 0.2, vx: 0, vy: 0, vz: 0 });
      },
      extras: () => [
        { label: '🗣 Go to the NPC', action: () => { if (G.phase === 'play' && G.npcActor) Object.assign(G.session.player, { x: G.npcActor.spot.x - 0.9, y: G.npcActor.spot.y, z: G.npcActor.spot.z - 0.7, vx: 0, vy: 0, vz: 0 }); else say(G.npcPlan.length ? `This run’s NPCs stand in levels ${G.npcPlan.map(p => p.level + 1).join(', ')}.` : 'No NPCs on this run.', 4); } },
        { label: '📖 Learn a spell', action: () => { const [id] = spellOffer(G.runClass, G.runSpells, Math.random, 1); if (id) { G.runSpells.push(id); G.hud.setSpells(G.runGentle ? null : G.runClass, G.runSpells); say(`Learned ${SPELLS[id].name}.`); } } },
        { label: '🐾 Borrow a pet', action: () => { const sp = Object.keys(SPECIES); setPet(makePet(Date.now() % 9973, { species: sp[Math.floor(Math.random() * sp.length)] })); say(`${G.pet.name} the ${SPECIES[G.pet.species].name.toLowerCase()} tags along.`); } },
        { label: '🏁 Finish the run', action: () => { if (G.phase === 'play' && !G.inTown) finishRun(); } },
        { label: '🏛 Back to town', action: () => { if (G.phase === 'play' || G.phase === 'hub') enterTown('portal'); } },
        { label: '🔓 Unlock everything (skip the gentle first run)', action: () => { profile.finishTutorial(); say('Classes, duels and delves unlocked (story.js).'); } },
        { label: '🐲 Befriend 3 random bosses (the ranch, the Ring)', action: () => { const r = mulberry32(Date.now() % 99991); const zones = Object.keys(ZONE_TYPE); for (let k = 0; k < 3; k++) { const stage = Math.floor(r() * 4); profile.addMonster({ ...wildMonster(Math.floor(r() * 1e9), { zone: zones[Math.floor(r() * zones.length)], level: levelFor({ stage, difficulty: r() }) }), id: `mon-test-${Math.floor(r() * 1e9)}` }); } say(`You have ${profile.monsters().length} monsters at the ranch.`); } },
        { label: '💰 +200 gold', action: () => { profile.addGold(200); say(`${profile.gold()} gold.`); } },
        { label: '🏟 Ring tier +1', action: () => { profile.update(d => { d.ringTier = Math.min(5, d.ringTier + 1); d.ringBeaten = []; }); G.tamers = null; say(`Ring tier: ${ringTierName(profile.get().ringTier)}.`); } },
        { label: '🍺 Go to the inn', action: () => { if (G.phase === 'hub') enterInn(); else say('From the town square.'); } },
        { label: '🃏 +12 random Riftcards', action: () => { const r = mulberry32(Date.now() % 99991); if (!profile.faction()) { profile.addCards(starterDeck('meadow')); profile.setFaction('meadow'); } const got = [...CARD_IDS].sort(() => r() - 0.5).slice(0, 12); profile.addCards(got); say(`+12 cards: ${got.map(id => CARDS[id].name).join(', ')}.`, 5); } },
        { label: '🃏 Play a Riftcards match now', action: () => { if (G.phase === 'hub' || G.phase === 'play') testCardMatch(); } },
        { label: '🃏 Card tier +1', action: () => { profile.update(d => { d.cardTier = Math.min(6, d.cardTier + 1); d.tierBeaten = []; }); say(`Riftcards tier: ${tierName(profile.get().cardTier)} (new battlers come next time you enter town).`); } },
        { label: '👑 All card tiers cleared (the Rift King comes)', action: () => { profile.update(d => { d.cardTier = 6; d.tierBeaten = []; d.tutorialDone = true; d.runs = Math.max(d.runs, 2); }); say('Every tier cleared — the Rift King waits at the portal.'); } },
      ],
      onNewRun() {
        if (G.phase !== 'play' || screen.isOpen) return;
        G.finished = false;
        G.levelIndex = 0;
        startRun(newRunSeed());
        loadLevel(0);
      },
    });
  }
}
