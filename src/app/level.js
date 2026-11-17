/**
 * Playing a level: loading it, its events (sounds, hearts), the gem → the boss battle → the reward stage,
 * the arcade checkpoint, the status line and hints.
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { avatar, banner, battle, battlesOn, benchSeconds, campaign, characters, controls, controlsLine, dressed, G, hintLine, panel, params, profile, reward, runResults, status } from './boot.js';
import { openCharacterScreen } from './hero.js';
import { endRift, setUpNpc } from './quests.js';
import { nextLevel, recordResult, saveRun } from './run.js';
import { noteBossBeaten } from './inn.js';
import { sound } from '../audio/music.js';
import { DRAFT_ID, RARITY_INFO } from '../characters/character.js';
import { RIFT_TWISTS } from '../characters/npcs.js';
import { emitGameplayEffects } from '../engine/effects.js';
import { particleSystem } from '../engine/particles.js';
import { gameState } from '../engine/state.js';
import { MODES } from '../games/index.js';
import { hashSeed } from '../levels/generator.js';
import { TIERS } from '../levels/index.js';
import { makeBoss } from '../progression/bosses.js';
import { encounterList } from '../progression/encounters.js';
import { starRating, starsText } from '../progression/rating.js';
import { placeArcade } from '../world/arcade.js';
import { environmentFor, zoneFor } from '../world/environment.js';
import { createSession } from '../world/session.js';

/** Show the level's tip (teaches a move the first time it matters), fading out after a while. */
export function showHint(level) {
  if (!hintLine) return;
  clearTimeout(G.hintTimer);
  hintLine.classList.remove('fade');
  hintLine.hidden = !level.hint;
  if (!level.hint) return;
  hintLine.textContent = `Tip: ${level.hint}`;
  G.hintTimer = setTimeout(() => hintLine.classList.add('fade'), 12000);
}

/** Show a title card when entering a new difficulty tier. */
function announceTier() {
  const { tier, zone } = environmentFor(campaign[G.levelIndex]);
  if (!banner || `${tier.id}:${zone.id}` === G.shownTier) return;
  G.shownTier = `${tier.id}:${zone.id}`;
  banner.querySelector('.tier-label').textContent = tier.label;
  banner.querySelector('.tier-name').textContent = zone.name;
  banner.classList.remove('show');
  void banner.offsetWidth; // restart the CSS animation
  banner.classList.add('show');
}

   // the test preset shows the battle's frame rate
/** Start a mini-game (and remember you've met it: the home arcade can play it from now on). */
export async function playBattle(options, { practice = false } = {}) {
  profile.meet(options.boss.mode);
  const result = await battle.start(options);
  if (!practice) profile.logGame(options.boss.mode, !!result.won);     // local play stats (notice board)
  return result;
}

// --- Gem → boss battle → reward ------------------------------------------------
export function collectGem() {
  if (G.rift) {
    if (G.rift.trinkets.some(t => !t.got)) return;          // the gem only counts once the trinkets are found
    const { x, y, z } = G.rift.level.goal;
    for (const color of [[0.7, 0.4, 1], [0.3, 0.9, 1], [1, 0.85, 0.3]]) particleSystem.emit(x, y + 1.3, z, { count: 16, speed: 7, color, lifetime: 1.3 });
    endRift(true);
    return;
  }
  const level = campaign[G.levelIndex];
  const levelTime = (performance.now() - G.levelStartTime) / 1000;
  gameState.updateLevelTime(level.name, levelTime);
  gameState.markLevelComplete(level.name);
  gameState.saveToLocalStorage();
  const { x, y, z } = level.goal;
  for (const color of [[1, 0.35, 0.85], [0.35, 0.9, 1], [1, 0.85, 0.3]]) {
    particleSystem.emit(x, y + 1.3, z, { count: 16, speed: 7, color, lifetime: 1.3 });
  }
  sound.fx('gem');
  sound.jingle('clear', G.levelIndex);
  if (!battlesOn) { nextLevel(); return; }
  G.phase = 'gem';
  G.gemTimer = 1.1;
  G.battleTries = 0;
  say(`Gem collected in ${levelTime.toFixed(1)} s — a boss appears!`, 3);
}

/** The boss for the current level: generated from the run seed and the level's place in the campaign. */
export function bossForCurrentLevel() {
  const level = campaign[G.levelIndex];
  const standalone = params.has('seed');
  const tier = TIERS.find(t => t.id === level.tier);
  const tierStart = tier ? TIERS.slice(0, TIERS.indexOf(tier)).reduce((n, t) => n + t.levels.length, 0) : 0;
  const slot = G.levelIndex - tierStart;
  const capstone = !!tier && !standalone && slot === tier.levels.length - 1;
  const planned = G.encounterPlan[G.levelIndex]?.boss;
  const forced = MODES[params.get('boss')] ? params.get('boss') : null;   // ?boss=<mini-game> forces one (see games/index.js)
  return makeBoss({
    runSeed: G.runSeed,
    index: standalone ? Math.round((level.meta?.difficulty ?? 0.5) * 11) : G.levelIndex,
    count: standalone ? 12 : campaign.length,
    tier: zoneFor(level).id, slot, capstone,
    mode: forced || planned?.mode || null,
    iteration: forced ? 0 : planned?.iteration ?? 0,
    role: 'boss',
    difficulty: forced || !planned ? null : planned.difficulty,
  });
}

      // { spot, state: 'ready' | 'won' | 'done', checkpoint: { mode, iteration } }
export function setUpArcade() {
  const planned = G.encounterPlan[G.levelIndex]?.checkpoint;
  G.arcade = null;
  if (!planned || benchSeconds || !battlesOn) return;
  const spot = placeArcade(campaign[G.levelIndex], environmentFor(campaign[G.levelIndex]).audit);
  if (spot) G.arcade = { spot, state: 'ready', checkpoint: planned };
}

export async function runCheckpoint() {
  const level = campaign[G.levelIndex];
  const { mode, iteration, difficulty } = G.arcade.checkpoint;
  G.phase = 'battle';
  document.body.classList.add('in-battle');
  controls.clear();
  const pausedFrom = performance.now();
  const challenge = makeBoss({ runSeed: G.runSeed, index: G.levelIndex, count: campaign.length, tier: zoneFor(level).id, mode, iteration, role: 'checkpoint', difficulty });
  const { won } = await playBattle({ boss: challenge, design: G.currentDesign, seed: hashSeed('checkpoint', G.runSeed, level.name), levelName: level.name, spells: G.runSpells, pet: G.pet });
  recordResult('checkpoint', won);
  document.body.classList.remove('in-battle');
  G.levelStartTime += performance.now() - pausedFrom;          // the level clock doesn't run during the mini-game
  G.arcade.state = won ? 'won' : 'done';
  if (won) {
    G.session.save(G.arcade.spot);
    const { x, y, z } = G.arcade.spot;
    for (const color of [[1, 0.85, 0.3], [0.4, 0.9, 1]]) particleSystem.emit(x, y + 1.2, z, { count: 14, speed: 5, color, lifetime: 1 });
    say('Checkpoint saved — hearts refilled!', 3);
  } else say('No checkpoint this time — carry on!', 3);
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  G.phase = 'play';
}

export const activeLevel = () => G.rift?.level || campaign[G.levelIndex];

export async function runBattle() {
  G.phase = 'battle';
  document.body.classList.add('in-battle');
  const level = campaign[G.levelIndex];
  const boss = bossForCurrentLevel();
  const { won } = await playBattle({ boss, design: G.currentDesign, seed: hashSeed('battle', G.runSeed, level.name, G.battleTries++), levelName: level.name, spells: G.runSpells, pet: G.pet });
  recordResult('boss', won);
  document.body.classList.remove('in-battle');
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);       // the 3D view was idle during the battle: not a slow frame
  if (won) {
    noteBossBeaten(boss, Math.max(0, TIERS.findIndex(t => t.id === level.tier)));     // it may come home at the stage's end (app/inn.js)
    // tougher bosses drop rarer things: the region's row of the drop table, one row up for its capstone
    const item = characters.rollReward(Math.random, { region: Math.max(0, TIERS.findIndex(t => t.id === level.tier)), capstone: boss.capstone });
    if (item) characters.unlock(item.id);
    showStage({ boss, item, won: true });
  } else {
    showStage({ boss, item: null, won: false });
  }
}

/** The stage between levels (2D, like the battle): the hero and the won item on pedestals, or a level completed without a reward. */
function showStage({ boss, item, won }) {
  G.phase = 'stage';
  document.body.classList.add('in-stage');
  reward.show({ design: G.currentDesign, boss, item, won, seed: hashSeed('reward', G.runSeed, G.levelIndex), pet: G.pet });
  const last = G.levelIndex + 1 >= campaign.length;
  const next = [last ? 'Finish ▸' : `Next level ▸`, () => nextLevel(), true];
  const wardrobe = ['Wardrobe', () => {
    panel.hide();
    reward.hide();
    document.body.classList.remove('in-stage');
    G.continueAfterMenu = true;
    openCharacterScreen({ wardrobe: true, label: last ? 'Finish' : `Continue to level ${G.levelIndex + 2}` });
  }];
  if (won && item) {
    const wear = ['Wear it', button => {
      G.currentDesign = dressed({ ...G.currentDesign, [item.slot]: item.value });
      if (G.currentDesign.id !== DRAFT_ID && characters.get(G.currentDesign.id) && !characters.isDefault(G.currentDesign.id)) characters.save(G.currentDesign);
      else { G.currentDesign = { ...G.currentDesign, id: DRAFT_ID }; characters.setDraft(G.currentDesign); characters.select(DRAFT_ID); }
      avatar.setCharacter(G.currentDesign);
      reward.setDesign(G.currentDesign);
      button.textContent = 'Wearing it ✓';
      button.disabled = true;
    }];
    panel.show({ kicker: `${boss.name} defeated · ${RARITY_INFO[item.rarity].label} item!`, title: item.name, text: item.about, buttons: [wear, wardrobe, next], accent: RARITY_INFO[item.rarity].color });
  } else if (won) {
    panel.show({ kicker: `${boss.name} defeated`, title: 'You’ve won every piece of clothing!', text: 'Mix and match them in the wardrobe.', buttons: [wardrobe, next] });
  } else {
    panel.show({ kicker: 'Level complete', title: 'No reward this time', text: `${boss.name} got away. Beat it to win a new piece of clothing.`,
      buttons: [['Fight again', () => { panel.hide(); reward.hide(); document.body.classList.remove('in-stage'); runBattle(); }], wardrobe, next] });
  }
}

export function updateStatus() {
  if (G.inTown) {
    status.textContent = 'Town Square — walk into the portal past the fountain to set off on a run · the path east leads home, the path west to the inn · E talks to the card battlers';
    if (controlsLine) controlsLine.textContent = 'WASD / arrows move · Space jump · drag or Z / X turn the camera · wheel zoom · E talk · C your hero';
    return;
  }
  const level = campaign[G.levelIndex];
  const bestTime = gameState.getStat('bestTimes')[level.name];
  const bestTimeStr = bestTime ? ` (Best: ${bestTime.toFixed(1)}s)` : '';

  if (G.rift) { status.textContent = `${G.rift.level.name} — ${RIFT_TWISTS[G.rift.twist].name}: ${RIFT_TWISTS[G.rift.twist].about}. (R: back to the rift's start)`; return; }
  const { tier, zone } = environmentFor(level);
  const run = G.runSeed ? `Run ${G.runSeed} · ` : '';
  status.textContent = G.finished
    ? `${run}All ${campaign.length} levels complete — ${starsText(starRating(encounterList(G.encounterPlan).filter(e => runResults.get(`${e.level}:${e.role}`)).length, encounterList(G.encounterPlan).length))}! Press R for a new run.`
    : `${run}${tier.label} · ${zone.name} — Level ${G.levelIndex + 1}/${campaign.length}: ${level.name}${bestTimeStr}`;
  if (!G.finished) announceTier();
  // the controls for the techniques this region allows (abilities; bounce pads need no key)
  if (controlsLine) {
    const allowed = level.abilities || ['dash'];
    const jump = ['Space jump', allowed.includes('glide') && 'hold Space to glide', allowed.includes('double') && 'Space again in the air: double jump'].filter(Boolean).join(' · ');
    controlsLine.textContent = ['WASD / arrows move', jump, allowed.includes('dash') && 'Shift/J air dash', 'Q/K ground pound', 'R restart', 'C change hero'].filter(Boolean).join(' · ');
  }
}

export function say(text, seconds = 2.5) {
  G.message = { text, until: performance.now() + seconds * 1000 };
  status.textContent = text;
}

/** The tune for wherever you are now (after a menu, a battle, a rift …). */
export function musicForHere() {
  if (G.inTown) sound.place(G.phase === 'home' ? 'home' : 'town', profile.get().runs);
  else if (G.rift) sound.place('rift', G.rift.actor.npc.seed);
  else sound.level(campaign[G.levelIndex], G.levelIndex, G.runSeed);
}

export function loadLevel(index) {
  G.levelIndex = index;
  sound.level(campaign[index], index, G.runSeed);
  G.runWorker?.postMessage({ type: 'want', index: index + 1 });   // plan one level ahead
  G.session = createSession(campaign[G.levelIndex]);
  avatar.reset(G.session.player);
  G.petFollower?.reset(G.session.player);
  particleSystem.clear();
  G.levelStartTime = performance.now();
  G.benchTick = 0;
  setUpArcade();
  setUpNpc();
  updateStatus();
  showHint(campaign[G.levelIndex]);
  G.testMenu?.refresh();
  saveRun();
}

const EVENT_SOUNDS = { hurt: 'hurt', fell: 'fell', defeat: 'defeat', dash: 'dash', pound: 'pound', shockwave: 'shockwave', stomp: 'stomp' };

export function onEvents(events) {
  emitGameplayEffects(events, particleSystem);
  for (const e of events) {
    if (EVENT_SOUNDS[e.type]) sound.fx(EVENT_SOUNDS[e.type]);
    if (e.type === 'hurt' || e.type === 'fell') {
      G.hud.flash();
      if (e.type === 'fell' && e.health > 0) say(`Fell! ${e.health} heart${e.health === 1 ? '' : 's'} left.`);
    }
    if (e.type === 'death' && G.rift) { endRift(false, 'The rift spat you out!'); return; }
    if (e.type === 'death') {
      gameState.recordDeath();
      gameState.saveToLocalStorage();
      say('Out of hearts — restarting the level.');
    }
  }
}
