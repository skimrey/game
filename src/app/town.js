/**
 * The town square (Hearthmoor) and the way home: the card battlers and the mayor, the story beats, the portal
 * (embarking, resuming), the notice board, the town camera, the home and its arcade cabinet.
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { arcadePanel, avatar, canvas, characters, controls, deckPanels, dialog, embark, G, hintLine, home, hubFirst, inn, npcPrompt, npcState, panel, params, profile, ranch, reward, status } from './boot.js';
import { enterInn } from './inn.js';
import { show } from './hero.js';
import { loadLevel, onEvents, playBattle, say, updateStatus } from './level.js';
import { closeTalk, talkCamera } from './quests.js';
import { journeyFor, newRunSeed, resumeRun, startRun } from './run.js';
import { TEST_DIFFICULTY } from './testing.js';
import { startKingMatch, tierName } from './townCards.js';
import { travelView } from './travel.js';
import { sound } from '../audio/music.js';
import { computeShadow } from '../characters/avatar.js';
import { UNLOCKABLES } from '../characters/character.js';
import { createNpcActor } from '../characters/npcWorld.js';
import { backdropOf, makeGroup, mayorNpc } from '../characters/npcs.js';
import { FACTION_HUE } from '../cards/drawCards.js';
import { hslToRgb } from '../engine/palette.js';
import { particleSystem } from '../engine/particles.js';
import { sceneryForQuality } from '../engine/quality.js';
import { MODES, rolesOf } from '../games/index.js';
import { hashSeed } from '../levels/generator.js';
import { makeBoss } from '../progression/bosses.js';
import { CLASSES } from '../progression/spells.js';
import { chapter, nextBeat, unlocks } from '../progression/story.js';
import { atSpot, buildHub, HUB, hubBoxes } from '../town/hub.js';
import { BIOMES } from '../world/biomes.js';
import { createSession } from '../world/session.js';
import { ZONE_IDS, ZONES } from '../world/zones.js';

/** The next story beat (progression/story.js), told in town when nothing else is up. */
export function tellStory() {
  if (!hubFirst || !G.inTown || G.phase !== 'hub' || panel.open || deckPanels.open) return;
  const beat = nextBeat(profile.get());
  if (!beat) return;
  if (beat.id === 'arrival') { mayorWelcome(); return; }
  profile.seeStory(beat.id);
  const ch = chapter(profile.get()), mayor = mayorActor();
  sound.fx('open');
  if (mayor) {                                   // the mayor bustles over with the news
    G.phase = 'talk'; G.talking = mayor; controls.clear(); npcPrompt.hidden = true;
    dialog.say(mayor.npc, `Chapter ${ch.n} — ${beat.title}! ${beat.text}`, [['Continue ▸', () => closeTalk(), true]]);
    return;
  }
  G.phase = 'talk';
  panel.show({
    kicker: `Chapter ${ch.n} · ${ch.name}`, title: beat.title, text: beat.text, accent: '#b58cff',
    buttons: [['Continue ▸', () => { panel.hide(); G.phase = 'hub'; controls.clear(); canvas.focus?.(); setTimeout(tellStory, 400); }, true]],
  });
}

// -- the arcade cabinet at home: any mini-game you've met, any difficulty, for your best time
export function openArcade() {
  const d = profile.get();
  const games = Object.values(MODES).map(m => ({ id: m.id, name: m.name, role: rolesOf(m.id)[0], met: d.met.includes(m.id) || d.tutorialDone, record: d.arcade[m.id] || null }));
  games.sort((a, b) => (b.met - a.met) || a.name.localeCompare(b.name));
  arcadePanel.open({ games, onPlay: (mode, level3, role) => playArcade(mode, level3, role), onClose: () => home.resume() });
}

/** A mini-game for its own sake (the arcade at home, the inn's board): no spells, the result only. */
export async function playPracticeGame(mode, level3, role, label = 'Arcade') {
  G.phase = 'battle';
  document.body.classList.add('in-battle');
  const zone = Object.values(ZONES).find(z => z.capstone === mode)?.id || (mode === 'sled' ? 'alpine' : mode === 'lander' ? 'starlit' : 'meadow');
  const boss = makeBoss({ runSeed: 77, index: 6, count: 12, tier: zone, mode, role, difficulty: TEST_DIFFICULTY[level3], check: role !== 'quest' });
  if (mode === 'delve') Object.assign(boss, { name: 'The Rift Warden', cls: G.runClass, role: 'brute' });
  const result = await playBattle({ boss, design: G.currentDesign, seed: hashSeed('arcade', mode, Date.now() % 9973), levelName: `${label} · ${['easy', 'medium', 'hard'][level3]}`, spells: [], pet: G.pet, ...(role === 'travel' ? travelView(zone) : {}) }, { practice: true });
  document.body.classList.remove('in-battle');
  return result;
}

async function playArcade(mode, level3, role) {
  home.hideCanvas();
  const { won, time } = await playPracticeGame(mode, level3, role);
  profile.recordArcade(mode, { won, time });
  G.phase = 'home';
  sound.place('home', profile.get().runs);
  openArcade();
}

export const TOWN_GOSSIP = [
  'Did you hear? Folk out on the runs teach spells to anyone who helps them.',
  'They say the portal never goes to the same places twice in a row.',
  'My cousin swapped a party hat for a pirate hat once. Never been happier.',
  'A stray followed the last adventurer home. Three stars, they had!',
  'Finish a run and bring me back a souvenir — I mean, bring YOURSELF one.',
  'Every boss out there is different. Every single one. Weird, isn’t it?',
];

/**
 * The square is the region's meeting place for card battlers: every time you come back to town
 * a new set of them has arrived — each from one of the zones (their deck plays that zone's cards),
 * each behind a table, facing the square (you talk to them across it). And the mayor, always.
 */
function makeVillagers(visit = profile.get().townVisits) {
  const homes = [...ZONE_IDS].sort((a, b) => hashSeed('home', visit, a) - hashSeed('home', visit, b));
  const mayor = makeMayor();
  // four battlers from four worlds, dressed apart from each other, the mayor and you (characters/looks.js)
  const group = makeGroup(HUB.tables.map((s, i) => ({ seed: hashSeed('villager', visit, i), zone: homes[i % homes.length], stage: 1 + (i % 3), owned: characters.unlocked(), quest: false, avoid: backdropOf('town') })),
    { context: [mayor.npc.design, G.currentDesign].filter(Boolean) });
  const battlers = group.map((npc, i) => {
    const s = HUB.tables[i], zone = homes[i % homes.length];
    npc.job = `Card battler from ${ZONES[zone].name}`;
    npc.home = zone;
    const actor = createNpcActor(npc, { x: s.x, y: HUB.top, z: s.z + 1, platform: -1, facing: Math.PI });
    actor.talkRadius = 2.5;
    actor.villager = true;
    actor.cardTier = Math.min(5, profile.get().cardTier);          // they came to play at your tier
    actor.stage = 100 + i;
    npcState.set(actor.stage, { quest: 'none', traded: false });
    return actor;
  });
  return [mayor, ...battlers];
}

/** Each table's banner: its battler's faction colours (cards/drawCards.js FACTION_HUE). */
export function tableBanners() {
  return G.villagers.filter(v => v.npc.home).map(v => {
    const h = FACTION_HUE[v.npc.home] ?? 42, rgb = (hh, s, l) => hslToRgb(hh, s, l).map(c => c / 255);
    return { main: rgb(h, 0.55, 0.5), mark: rgb(h + 40, 0.85, 0.75) };
  });
}

// --- The mayor of Hearthmoor: welcomes you, tells the story as it unfolds, explains things
const MAYOR_AT = { x: 2.6, z: 8.4 };

function makeMayor() {
  const npc = mayorNpc();
  const actor = createNpcActor(npc, { x: MAYOR_AT.x, y: HUB.top, z: MAYOR_AT.z, platform: -1, facing: Math.PI + 0.6 });
  actor.talkRadius = 2.2;
  actor.villager = true;
  actor.mayor = true;
  actor.stage = 99;
  npcState.set(99, { quest: 'none', traded: true });
  return actor;
}

const mayorActor = () => G.villagers.find(v => v.mayor) || null;

/** The mayor's welcome (the first time in town): who he is, what the square is, where to go. */
function mayorWelcome() {
  const mayor = mayorActor();
  if (!mayor) return;
  profile.seeStory('arrival');
  G.phase = 'talk'; G.talking = mayor; controls.clear(); npcPrompt.hidden = true;
  const npc = mayor.npc;
  const pages = [
    'Welcome, welcome, WELCOME to Hearthmoor! I’m Marigold — the mayor. Ahem. *straightens an enormous pointy hat* We’ve been expecting you.',
    'This square is the crossroads of the whole region: card battlers come from every world to meet here and play Riftcards, each with their own world’s faction. Every time you come back to town, new challengers will have arrived, decks in hand. Beat any three of the four at the tables to rise a tier — and tougher ones turn up while you’re away on your next journey!',
    'That great humming arch beyond the fountain is the Portal. It woke up again, and rifts are tearing open all over the worlds. Step through to set off on a run — help the folk you meet, and they’ll share Riftcards, clothes and tricks with you.',
    'Your new house is down the wooden path to the east — I had it aired out. There’s a basket by the door with some little critters who need a home, too. The path west goes to the Tipsy Teapot, our inn: challenges for gold, a tailor, and a monster ring out the back. Come and find me by the fountain whenever you want to know what’s new.',
  ];
  const show = k => dialog.say(npc, pages[k], k < pages.length - 1
    ? [['Go on… ▸', () => show(k + 1), true], ['Thanks, Mayor!', () => closeTalk()]]
    : [['Thanks, Mayor! ▸', () => closeTalk(), true]]);
  show(0);
}

/** Talking to the mayor later: what's new (the next story beat, or where you stand), how cards work. */
export function mayorTalk(actor) {
  const npc = actor.npc, d = profile.get();
  const beat = nextBeat(d);
  const status = `You’ve finished ${d.runs} run${d.runs === 1 ? '' : 's'} and at Riftcards you’re ${d.cardFaction ? `a${/^[AEIOU]/.test(tierName(d.cardTier)) ? 'n' : ''} ${tierName(d.cardTier)}${d.cardTier < 6 ? ` (${d.tierBeaten.length} of 3 beaten at your tier)` : ''}` : 'still to start'}.`;
  dialog.say(npc, beat ? `${npc.greeting} I have news — ${beat.title.toLowerCase()}!` : `${npc.greeting} ${status} The battlers at the tables are waiting for you.`, [
    ...(beat ? [['Tell me! ▸', () => { profile.seeStory(beat.id); dialog.say(npc, beat.text, [['Goodbye', () => closeTalk(), true]]); }, true]] : []),
    ['How do Riftcards work?', () => dialog.say(npc, 'Best of three rounds. Each turn you play ONE card — brawlers in front, archers at the back, fliers in the sky — or pass. When both have passed, the most strength wins the round. The trick: cards you spend are gone for the next rounds! Every world has its faction, with its own perk. Beat three of the four battlers in the square to rise a tier — Novice, Apprentice, Adept, Expert, Master, Champion — and tougher ones come while you’re off on a journey.', [['Thanks', () => mayorTalk(actor), true]])],
    ['Goodbye', () => closeTalk()],
  ]);
}

/** Into town: from the start, back from a run (at the portal) or out of the front door. */
export function enterTown(from = 'start') {
  G.town ||= buildHub();
  G.inTown = true;
  G.phase = 'hub';
  G.started = true;
  G.finished = false;
  panel.hide(); reward.hide(); dialog.close(); embark.hide(); home.close(); inn.close(); ranch.close();
  document.body.classList.remove('in-stage', 'in-battle', 'in-menu', 'in-home');
  document.body.classList.add('in-town');
  if (!G.villagers.length || !['home', 'inn'].includes(from)) { G.villagers = makeVillagers(profile.visitTown()); G.tamers = null; G.tableBanners = null; }
  for (const v of G.villagers) if (!npcState.has(v.stage)) npcState.set(v.stage, { quest: 'none', traded: false });
  G.npcActor = null; G.rift = null; G.arcade = null; G.talking = null;
  G.session = createSession(G.town.level);
  const spawn = from === 'home' ? { x: HUB.home.x - 2.4, y: HUB.top, z: HUB.home.z } : from === 'inn' ? { x: HUB.inn.x + 2.4, y: HUB.top, z: HUB.inn.z } : from === 'portal' ? { x: HUB.portal.x, y: HUB.top, z: HUB.portal.z - 4 } : { ...HUB.spawn };
  Object.assign(G.session.player, spawn, { vx: 0, vy: 0, vz: 0 });
  G.session.checkpoint = { ...spawn };
  avatar.reset(G.session.player);
  G.petFollower?.reset(G.session.player);
  particleSystem.clear();
  G.hud.setVisible(false);
  G.portalArmed = from !== 'portal';
  townCam.yaw = townCam.want = from === 'home' ? -Math.PI / 2 : from === 'inn' ? Math.PI / 2 : 0;    // out of a front door: facing the square
  G.shownTier = null;
  controls.clear();
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  hintLine.hidden = true;
  updateStatus();
  G.testMenu?.refresh();
  sound.place('town', profile.get().runs);
  if (from === 'portal' || from === 'home' || from === 'inn') sound.fx(from === 'portal' ? 'portal' : 'door');
  setTimeout(() => { if (!profile.get().story.seen.includes('arrival') && G.phase === 'hub') mayorWelcome(); else tellStory(); }, 900);
  if (profile.savedRun() && from === 'start') say('Your run is waiting — step into the portal to carry on.', 6);
}

function openEmbark() {
  G.phase = 'portal';
  sound.fx('open');
  controls.clear();
  const seed = newRunSeed();
  G.nextRun = { seed, zones: null };
  const before = G.runZones;
  G.nextRun.zones = journeyFor(seed);
  G.runZones = before;
  const back = () => { G.phase = 'hub'; G.portalArmed = false; controls.clear(); canvas.focus?.(); };
  const saved = profile.savedRun();
  const u = unlocks(profile.get());
  embark.show({
    zones: G.nextRun.zones, current: G.runClass, runNumber: profile.get().runs + 1,
    locked: !u.classes && !params.has('class'),
    saved: saved && saved.v === 1 ? saved : null,
    onContinue: () => resumeRun(saved),
    onAbandon: () => { profile.clearRun(); openEmbark(); },
    king: u.king, onKing: () => startKingMatch(),
    onGo: cls => setOff(cls),
    onCancel: back,
  });
}

/** Through the portal: a new run with the chosen class. */
function setOff(cls) {
  const gentle = !cls;                                  // the first run: no class yet (progression/story.js)
  if (cls) { G.runClass = cls; profile.setClass(cls); }
  G.inTown = false;
  document.body.classList.remove('in-town');
  G.hud.setVisible(true);
  G.levelIndex = 0;
  startRun(G.nextRun?.seed || newRunSeed(), { zones: G.nextRun?.zones, gentle });
  G.phase = 'play';
  loadLevel(0);
  say(gentle ? `Through the portal: ${G.runZones.map(z => ZONES[z].name).join(' → ')}. Grab the gems!` : `Through the portal as a ${CLASSES[cls].name}: ${G.runZones.map(z => ZONES[z].name).join(' → ')}.`, 5);
  sound.fx('portal');
}

function enterHome() {
  G.phase = 'home';
  controls.clear();
  npcPrompt.hidden = true;
  home.open({ design: G.currentDesign });
  status.textContent = 'Home sweet home';
  sound.fx('door');
  sound.place('home', profile.get().runs);
}

/** The mini-game that has beaten you most often on runs (local play stats). */
function toughest(d) {
  const list = Object.entries(d.games).filter(([, r]) => r.lost > 0).sort((a, b) => b[1].lost / (b[1].won + b[1].lost) - a[1].lost / (a[1].won + a[1].lost) || b[1].lost - a[1].lost);
  if (!list.length) return [];
  const [mode, r] = list[0];
  return [{ label: `Your toughest game so far: ${MODES[mode]?.name || mode} (lost ${r.lost} of ${r.won + r.lost}) — practise it on the arcade cabinet at home`, ok: false }];
}

export function showBoard() {
  G.phase = 'talk';
  const d = profile.get();
  const stars = d.bestStars ? '★'.repeat(d.bestStars) + '☆'.repeat(5 - d.bestStars) : 'none yet';
  panel.show({
    kicker: 'Notice board', title: 'Town news',
    text: d.runs ? `Adventurer! You’ve finished ${d.runs} run${d.runs === 1 ? '' : 's'}. Best: ${stars}.` : 'A fresh adventurer in town! Step into the portal to the north to set off on your first run.',
    list: [
      { label: `Story: chapter ${chapter(d).n} — ${chapter(d).name}`, ok: true },
      { label: `Riftcards: ${tierName(d.cardTier)} · ${Object.values(d.cards).reduce((a, b) => a + b, 0)} cards · ${d.cardWins} wins${d.kingBeaten ? ' · the Rift King beaten!' : ''}`, ok: d.cardTier > 0 },
      { label: `Quests done for NPCs: ${d.questsDone || 0}`, ok: (d.questsDone || 0) > 0 },
      ...toughest(d),
      { label: `Trades made: ${d.trades || 0}`, ok: (d.trades || 0) > 0 },
      { label: `Pets: ${d.pets.length}`, ok: d.pets.length > 0 },
      { label: `Decorations at home: ${d.decor.length}`, ok: d.decor.length > 0 },
      { label: `Clothes won: ${characters.unlocked().length} of ${UNLOCKABLES.length}`, ok: characters.unlocked().length > 0 },
    ],
    buttons: [['Close', () => { panel.hide(); G.phase = 'hub'; controls.clear(); canvas.focus?.(); }, true]],
    accent: '#ffd23f',
  });
}

// The town's camera turns: drag with the mouse, or hold Z / X; the wheel zooms. Walking is
// relative to the camera (snapped to the eight directions the physics knows).
export const townCam = { yaw: 0, want: 0, zoom: 1, drag: null };

export const townKeys = new Set();

export function townCamera(p) {
  const s = Math.sin(townCam.yaw), c = Math.cos(townCam.yaw), z = townCam.zoom;
  return { eye: [p.x - s * 12 * z, p.y + 1 + 6 * z, p.z - c * 12 * z], target: [p.x + s * 4, p.y + 1, p.z + c * 4] };
}

/** Keys as the player means them (screen left/right/forward) → the physics' world directions. */
function townInput(input) {
  const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0), iz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  if (!ix && !iz) return input;
  const yaw = townCam.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const wx = ix * rx + iz * fx, wz = ix * rz + iz * fz, len = Math.hypot(wx, wz) || 1;
  return { ...input, left: wx / len > 0.38, right: wx / len < -0.38, forward: wz / len > 0.38, back: wz / len < -0.38 };
}

export const nearBoard = p => Math.hypot(p.x - HUB.board.x, p.z - (HUB.board.z - 0.8)) < 1.9;

/** A step in town: walk about; the portal and the front door are walk-in. */
export function stepTown(dt) {
  const turn = (townKeys.has('KeyX') ? 1 : 0) - (townKeys.has('KeyZ') ? 1 : 0);
  townCam.want += turn * 1.8 * dt;
  townCam.yaw += Math.atan2(Math.sin(townCam.want - townCam.yaw), Math.cos(townCam.want - townCam.yaw)) * (1 - Math.exp(-10 * dt));
  const { events } = G.session.step(townInput(controls.read()), dt);
  onEvents(events);
  const p = G.session.player;
  const portal = { x: HUB.portal.x, z: HUB.portal.z };
  if (G.portalArmed && atSpot(p, portal, 1.8)) { openEmbark(); return; }
  if (!atSpot(p, portal, 2.8)) G.portalArmed = true;
  if (atSpot(p, { x: HUB.home.x - 0.7, z: HUB.home.z }, 1.1)) { enterHome(); return; }
  if (atSpot(p, { x: HUB.inn.x + 0.7, z: HUB.inn.z }, 1.1)) { enterInn(); return; }
  if (Math.random() < 0.2) particleSystem.emit(HUB.fountain.x + (Math.random() - 0.5), 2.7, HUB.fountain.z + (Math.random() - 0.5), { count: 1, speed: 1.2, color: [0.7, 0.9, 1], lifetime: 0.7 });
  if (Math.random() < 0.25) particleSystem.emit(HUB.portal.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 4, HUB.portal.z + 0.6, { count: 1, speed: 0.8, color: Math.random() < 0.5 ? [0.75, 0.5, 1] : [0.5, 0.9, 1], lifetime: 1.2 });
}

export function renderTown(render, time, dt) {
  const t = time / 1000, p = G.session.player, level = G.town.level;
  render(level, p, particleSystem.getActiveParticles(), {
    camera: talkCamera(dt) || townCamera(p),
    avatar: [...avatar.getParts(p), ...G.villagers.flatMap(v => v.parts(t)), ...(G.petFollower ? G.petFollower.parts(t) : [])],
    shadow: [computeShadow(level, p), ...G.villagers.map(v => computeShadow(level, v.spot)), ...(G.petFollower ? [computeShadow(level, G.petFollower.state, 0.3)] : [])].filter(Boolean),
    hideGoal: true,
    boxes: hubBoxes(t, { portalReady: G.portalArmed, banners: G.tableBanners ||= tableBanners() }),
    biome: BIOMES.meadow,
    scenery: sceneryForQuality(G.town.scenery, render.quality),
  });
}
