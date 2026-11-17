/**
 * The app's boot: the shared state (G), the page's singletons (the battle screen, the card table, panels,
 * the profile …), the event listeners and the frame loop. The game's flow is in the feature modules of
 * src/app/ (run, level, travel, quests, town, townCards, hero, testing); src/main.js just starts this.
 * See STRUCTURE.md for the whole layout.
 */
import { exposeForDebugging } from './debug.js';
import { openCharacterScreen, play, setPet, show, showAngle, showPlayer } from './hero.js';
import { listenForKeys } from './input.js';
import { activeLevel, bossForCurrentLevel, collectGem, loadLevel, onEvents, runBattle, runCheckpoint, say, setUpArcade, showHint, updateStatus } from './level.js';
import { startGame } from './loop.js';
import { endRift, setUpNpc, talkCamera, talkTo, trinketBoxes } from './quests.js';
import { newRunSeed, standaloneLevel, startRun } from './run.js';
import { editDecks } from './townCards.js';
import { chooseSquad, enterRanch, innPeople, leaveRanch, useInn } from './inn.js';
import { playTestGame, setUpTestMenu } from './testing.js';
import { enterTown, openArcade, townCam, townKeys } from './town.js';
import { skipToNextJourney } from './travel.js';
import { sound } from '../audio/music.js';
import { createCardScreen } from '../cards/cardScreen.js';
import { createDeckPanel } from '../cards/deckPanel.js';
import { createRingScreen } from '../ring/screen.js';
import { createRingPanels } from '../ring/panels.js';
import { createInn } from '../town/inn.js';
import { createRanch } from '../town/ranch.js';
import { createTailorPanel } from '../town/tailorPanel.js';
import { createAvatar } from '../characters/avatar.js';
import { createCharacterStore, randomCharacter } from '../characters/character.js';
import { createCharacterScreen, paintItem } from '../characters/characterScreen.js';
import { createNpcDialog } from '../characters/npcDialog.js';
import { createPetFollower, makePet, SPECIES } from '../characters/pets.js';
import { createTrailEmitter } from '../characters/trails.js';
import { dress } from '../characters/tailoring.js';
import { Config } from '../engine/config.js';
import { createControls, isTypingTarget } from '../engine/controls.js';
import { createFpsMeter } from '../engine/fpsMeter.js';
import { particleSystem } from '../engine/particles.js';
import { performanceMonitor } from '../engine/performance.js';
import { resolveQuality } from '../engine/quality.js';
import { createRenderer } from '../engine/renderer.js';
import { MODES, rolesOf, TRAVEL_GAMES } from '../games/index.js';
import { createBossBattle } from '../games/screen.js';
import { decodeInput } from '../levels/audit.js';
import { mulberry32 } from '../levels/generator.js';
import { levels } from '../levels/index.js';
import { createProfile } from '../progression/profile.js';
import { CLASS_IDS } from '../progression/spells.js';
import { createArcadePanel } from '../town/arcadeCabinet.js';
import { createEmbarkPanel } from '../town/embark.js';
import { createHome } from '../town/home.js';
import { createHealthHud } from '../ui/hud.js';
import { createOptionsPanel } from '../ui/options.js';
import { createRewardScreen } from '../ui/rewardScreen.js';
import { createTestMenu } from '../ui/testMenu.js';
import { createTouchPad, wantsTouch } from '../ui/touch.js';
import { createUnlockPanel } from '../ui/unlockPanel.js';
import { arcadeBoxes, touchesArcade } from '../world/arcade.js';
import { BIOMES } from '../world/biomes.js';
import { enemyParts } from '../world/enemies.js';
import { environmentFor, zoneFor } from '../world/environment.js';
import { buildScenery } from '../world/scenery.js';
import { createSession } from '../world/session.js';
import { gliderBoxes, springBoxes } from '../world/terrainParts.js';
import { ZONE_IDS, ZONES } from '../world/zones.js';

/** The running game's shared state (was: the top-level `let`s of app/). */
export const G = {};

export const canvas = document.querySelector('#game');

export const status = document.querySelector('#status');

export const controlsLine = document.querySelector('#controls-line');

export const hintLine = document.querySelector('#hint');

G.hintTimer = null;

// URL options: ?level=N starts the campaign at level N; ?seed=S&difficulty=D plays one generated level;
// ?quality=test|normal picks the rendering preset (see engine/quality.js); ?bench=S runs a benchmark;
// ?character=<id>|random skips the character screen with that hero; ?menu=0 skips it with the saved choice;
// ?battles=0 skips the boss battles after each gem; ?run=S plays run S (0 = the hand-written campaign as is);
// ?hub=0 skips the town square (so do ?level, ?run and ?seed); ?zones=a,b,c,d picks the run's zones;
// ?class=warrior|hunter|sorcerer the class; ?pet=<species> lends a pet; ?boss=<mode> forces a boss game.
export const params = new URLSearchParams(location.search);

export const benchSeconds = Number(params.get('bench')) || 0;

G.runSeed = params.has('run') ? Math.max(0, Math.floor(Number(params.get('run')) || 0)) : benchSeconds || params.has('seed') ? 0 : newRunSeed();

export const campaign = params.has('seed') ? [standaloneLevel()] : [...levels];

export const runSources = campaign.map(() => 'base');

G.runZones = [];

// The run's hero: the class chosen at the portal (?class=warrior|hunter|sorcerer picks one) and the
// spells learned so far — the signature spell, then one from each stage's NPC (progression/spells.js).
export const profile = createProfile();
/** A design wearing the tailor's work (patterns on the clothes you own, trail colours). */
export const dressed = design => dress(design, profile.tailoring());

G.runClass = CLASS_IDS.includes(params.get('class')) ? params.get('class') : profile.heroClass || 'warrior';

G.runSpells = [];

// Your pet (characters/pets.js) trots after you in 3D and sits on the battle HUD. ?pet=<species> lends you one.
G.pet = SPECIES[params.get('pet')] ? makePet(7, { species: params.get('pet') }) : profile.activePet();

G.petFollower = G.pet ? createPetFollower(G.pet) : null;

// The run's NPCs: one per stage, standing along the route of one of its levels (characters/npcs.js).
G.npcPlan = [];

                    // [{ stage, level, seed }]
export const npcs = new Map();

              // stage → npc (made when you first reach their level)
export const npcState = new Map();

          // stage → { quest: 'open' | 'won' | 'lost', traded }
G.npcActor = null;

                 // the NPC standing in the current level (characters/npcWorld.js)
G.rift = null;

G.runWorker = null;

export const riftRequests = new Map();

      // id → resolve (rift levels generated by the worker)
G.renderer = null;

G.hud = null;

G.encounterPlan = [];

export const runResults = new Map();

                 // `${level}:${role}` → won: bosses, checkpoints, travel (stars at the end)
export const travelled = new Set();

                  // levels whose trip to the next region is done
G.runGentle = false;

export const banner = document.querySelector('#tier-banner');

G.shownTier = null;

G.levelIndex = Math.max(0, Math.min(campaign.length - 1, (Number(params.get('level')) || 1) - 1));

G.started = false;

startRun(G.runSeed);

G.session = createSession(campaign[G.levelIndex]);

G.finished = false;

G.levelStartTime = performance.now();

G.message = null;

          // temporary status message { text, until }
G.benchTick = 0;

export const avatar = createAvatar();

avatar.reset(G.session.player);

G.hud = createHealthHud(G.session.maxHealth);

G.hud.setSpells(G.runGentle ? null : G.runClass, G.runSpells);

export const trail = createTrailEmitter();

          // glittery after-trails (legendary wardrobe items)
export const springBounces = new Map();

             // spring platform → time of the last bounce (pad squash)
export const showTrail = createTrailEmitter();

export const blinkTrail = () => benchSeconds > 0;

  // benchmarks measure the plain game

// --- Character --------------------------------------------------------------
export const characters = createCharacterStore();

const characterParam = params.get('character');

G.currentDesign = dressed(characterParam === 'random' ? randomCharacter() : (characterParam && characters.get(characterParam)) || characters.selected());

avatar.setCharacter(G.currentDesign);

export const menuFirst = !benchSeconds && !characterParam && params.get('menu') !== '0';

G.started = !menuFirst;

        // the level clock and tier banner start with the first Play
G.pausedAt = null;

export const showAvatar = createAvatar();

// Game phases: 'play' → (gem) 'gem' → 'battle' (2D boss fight) → 'stage' (reward / level complete) → next level
G.phase = 'play';

G.gemTimer = 0;

G.battleTries = 0;

G.continueAfterMenu = false;

   // the character screen was opened as the wardrobe between levels
export const battlesOn = !benchSeconds && params.get('battles') !== '0';

const startQuality = resolveQuality(params);

export const battle = createBossBattle({ showFps: startQuality.showFps, settings: () => profile.settings() });

sound.setVolumes(profile.settings());

export const options = createOptionsPanel({ get: () => profile.settings(), set: patch => profile.setSettings(patch), onChange: s => sound.setVolumes(s) });

if (wantsTouch(params)) createTouchPad();

        // tablets and phones (or ?touch=1): an on-screen pad
export const cardTable = createCardScreen();

export const deckPanels = createDeckPanel();

export const arcadePanel = createArcadePanel();

G.testMenu = null;

                  // testing mode: jump to any level / mini-game (ui/testMenu.js)
export const panel = createUnlockPanel();

export const reward = createRewardScreen();

export const controls = createControls(window, { ignore: event => screen.isOpen || (G.phase !== 'play' && G.phase !== 'hub') || isTypingTarget(event.target) });

export const screen = createCharacterScreen({
  store: characters,
  onPreview(design) {
    showAvatar.setCharacter(design);
    if (design.id !== show.previewId) { showAvatar.reset(showPlayer); show.time = 0; }   // pop in a newly picked hero
    show.previewId = design.id;
  },
  onPlay: play,
});

// every button in every panel clicks
document.addEventListener('click', e => { if (e.target instanceof Element && e.target.closest('button')) sound.fx('select'); }, true);

canvas.addEventListener('pointerdown', e => {
  if (!screen.isOpen) return;
  show.yaw = showAngle();                                   // grab the hero where it is (no snap)
  show.drag = { x: e.clientX, yaw: show.yaw };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if (show.drag) show.yaw = show.drag.yaw - (e.clientX - show.drag.x) * 0.01;
});

canvas.addEventListener('pointerup', () => {
  if (!show.drag) return;
  show.drag = null;
  show.swayFrom = show.clock + 4;                           // let go: the sway resumes from here, gently
});

G.resuming = false;

// --- Arcade checkpoints ------------------------------------------------------------
// Some levels have an arcade cabinet halfway (progression/encounters.js decides which): its
// mini-game, won, saves a checkpoint there and refills the hearts.
G.arcade = null;

// --- NPCs and their quests -----------------------------------------------------------
// One NPC per stage stands along a level's route. Walk up and press E to talk: they offer
// a quest (a rift level with a twist, or a sword duel) — win it to learn a spell for your
// class (pick one of two) — and a trade (their item for one of yours of the same rarity).
export const dialog = createNpcDialog({ paintItem });

export const npcPrompt = Object.assign(document.createElement('p'), { className: 'npc-prompt', hidden: true });

(document.querySelector('main') || document.body).append(npcPrompt);

G.talkFocus = null;

                // who the camera frames (stays while it eases back out)
/**
 * While you talk, the camera eases in over your shoulder to frame the NPC's (silly) face in
 * the top half of the screen (the dialog box covers the bottom).
 */
G.talkBlend = 0;

G.talking = null;

// --- The town square (town/hub.js) and your home (town/home.js) ---------------------------------
// Between runs you're in town: walk into the portal (north) to choose a class and set off;
// the path east leads home (your wardrobe, your pets, your decorations); card battlers at the
// tables play Riftcards and trade; the notice board keeps score. ?hub=0 (or ?level / ?run) skips the town.
export const hubFirst = !benchSeconds && !params.has('level') && !params.has('run') && !params.has('seed') && params.get('hub') !== '0';

G.town = null;

                     // buildHub(): the square's level and scenery
G.villagers = [];

                  // the mayor and the card battlers at the four tables (new faces after every run)
G.tableBanners = null;
              // their faction banners' colours (app/town.js tableBanners)
G.inTown = false;

G.portalArmed = true;

              // walk out of the portal before it asks again
G.nextRun = null;

                  // { seed, zones } — where the portal leads this time
G.afterMenu = null;

                // 'home': the character screen was opened from the wardrobe
export const embark = createEmbarkPanel();

export const home = createHome({
  profile,
  onWardrobe: () => { G.afterMenu = 'home'; home.hideCanvas(); openCharacterScreen({ wardrobe: true, label: 'Back home' }); },
  onLeave: () => enterTown('home'),
  onPet: p => setPet(p),
  onArcade: () => openArcade(),
  onCards: () => editDecks(() => home.resume()),
  onRanch: () => enterRanch(),
});

// the inn (its tavern, the tailor, the Ring in its yard), the ranch behind your house
export const inn = createInn({ profile, people: () => innPeople(), onUse: h => useInn(h), onLeave: () => enterTown('inn') });
export const ranch = createRanch({ profile, onLeave: () => leaveRanch(), onSquad: after => chooseSquad(after) });
export const ringScreen = createRingScreen();
export const ringPanels = createRingPanels();
export const tailorPanel = createTailorPanel();

canvas.addEventListener('pointerdown', e => { if (G.phase !== 'hub' || screen.isOpen) return; townCam.drag = { x: e.clientX, want: townCam.want }; canvas.setPointerCapture?.(e.pointerId); });

canvas.addEventListener('pointermove', e => { if (townCam.drag && G.phase === 'hub') townCam.want = townCam.drag.want - (e.clientX - townCam.drag.x) * 0.008; });

canvas.addEventListener('pointerup', () => { townCam.drag = null; });

canvas.addEventListener('wheel', e => { if (G.phase !== 'hub') return; e.preventDefault(); townCam.zoom = Math.max(0.55, Math.min(1.6, townCam.zoom * Math.exp(e.deltaY * 0.001))); }, { passive: false });

window.addEventListener('keydown', e => { if (e.code === 'KeyZ' || e.code === 'KeyX') townKeys.add(e.code); });

window.addEventListener('keyup', e => townKeys.delete(e.code));

// --- Travel levels: a vehicle trip between regions (raft, mine cart, snowmobile, biplane)
// In 3D by default (games/kit/travel3d.js draws the same game with the WebGL renderer); the journey's
// card switches to the 2D pixel version and the choice is remembered (?travel=2d|3d wins).
export const TRAVEL_PARAM = ['2d', '3d'].includes(params.get('travel')) ? params.get('travel') : null;

listenForKeys();
setUpTestMenu(startQuality);

G.lastTime = undefined;

G.accumulator = 0;

// For debugging from the console

startGame(startQuality);
exposeForDebugging();