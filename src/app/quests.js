/**
 * NPCs on a run and their quests: talking (and the talk camera), rifts, duels, delves, spells as rewards,
 * rift loot (Riftcards), trading clothes.
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { avatar, battlesOn, benchSeconds, campaign, canvas, characters, controls, deckPanels, dialog, dressed, G, hubFirst, npcPrompt, npcs, npcState, profile, riftRequests } from './boot.js';
import { playBattle, say, showHint, updateStatus } from './level.js';
import { saveRun } from './run.js';
import { mayorTalk, tellStory, TOWN_GOSSIP, townCamera } from './town.js';
import { cardLevel, pitchCards, tierName } from './townCards.js';
import { sound } from '../audio/music.js';
import { CARDS, FACTIONS } from '../cards/catalog.js';
import { openPack } from '../cards/decks.js';
import { gameCounts } from '../progression/encounters.js';
import { DRAFT_ID, RARITY_INFO, UNLOCKABLES } from '../characters/character.js';
import { createNpcActor, placeNpc } from '../characters/npcWorld.js';
import { makeNpc, questDone, questPitch, RIFT_TWISTS } from '../characters/npcs.js';
import { chaseCamera } from '../engine/camera.js';
import { particleSystem } from '../engine/particles.js';
import { generateLevel, hashSeed, mulberry32, THEMES } from '../levels/generator.js';
import { TIERS } from '../levels/index.js';
import { makeBoss } from '../progression/bosses.js';
import { SPELL_RULES, spellOffer, SPELLS } from '../progression/spells.js';
import { questKinds } from '../progression/story.js';
import { environmentFor, primeAudit, zoneFor } from '../world/environment.js';
import { createSession } from '../world/session.js';
import { ZONES } from '../world/zones.js';

                  // the NPC (level or villager) you're talking to
export function talkCamera(dt) {
  if (G.talking) G.talkFocus = G.talking;
  G.talkBlend = Math.max(0, Math.min(1, G.talkBlend + (G.phase === 'talk' && G.talking && !G.rift ? dt : -dt) * 3));
  if (G.talkFocus && G.phase !== 'talk') G.talkFocus.lookAt = null;
  if (G.talkBlend <= 0 || !G.talkFocus) return undefined;
  const npcActor = G.talkFocus;
  const p = G.session.player, n = npcActor.spot;
  let dx = p.x - n.x, dz = p.z - n.z;
  const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const k = G.talkBlend * G.talkBlend * (3 - 2 * G.talkBlend);
  const headY = n.y + 1.25 * (npcActor.npc.face.head || 1);
  // off to the side of the line between you (a 3/4 view of their face, you at the edge of the frame)
  const a = 0.6, ex = dx * Math.cos(a) - dz * Math.sin(a), ez = dx * Math.sin(a) + dz * Math.cos(a);
  // the dialog box sits bottom-left: frame them in the right third (aim a little to their left)
  const fx = -ex, fz = -ez, side = 0.95;
  const talk = { eye: [n.x + ex * 2.6, headY + 0.15, n.z + ez * 2.6], target: [n.x + fz * side, headY - 0.55, n.z - fx * side] };
  npcActor.lookAt = G.phase === 'talk' ? [talk.eye[0] * 0.6 + p.x * 0.4, talk.eye[2] * 0.6 + p.z * 0.4] : null;
  const chase = G.inTown ? townCamera(p) : chaseCamera(p);
  return { eye: chase.eye.map((v, i) => v + (talk.eye[i] - v) * k), target: chase.target.map((v, i) => v + (talk.target[i] - v) * k) };
}

/** The lost trinkets in a rift: spinning golden boxes with a glow (until picked up). */
export function trinketBoxes(trinkets, time) {
  return trinkets.filter(t => !t.got).flatMap((t, i) => {
    const y = t.y + Math.sin(time * 2.5 + i) * 0.12;
    return [
      { center: [t.x, y, t.z], size: [0.34, 0.34, 0.34], color: [1, 0.82, 0.3], glow: 0.8, rotY: time * 2 + i },
      { center: [t.x, y, t.z], size: [0.2, 0.46, 0.2], color: [1, 0.95, 0.7], glow: 1, rotY: -time * 2 },
    ];
  });
}

/** The NPC of the level being loaded (if this level has one), placed beside the route. */
export function setUpNpc() {
  G.npcActor = null;
  npcPrompt.hidden = true;
  const plan = G.npcPlan.find(p => p.level === G.levelIndex);
  if (!plan || benchSeconds || !battlesOn) return;
  const level = campaign[G.levelIndex];
  // (the run's earlier NPCs first, in order — a resumed run makes them too — so the rules below see them)
  for (const p of G.npcPlan) { if (p.stage > plan.stage) break; ensureNpc(p); }
  const spot = placeNpc(level, environmentFor(level).audit, { avoid: [G.arcade?.spot] });
  if (!spot) return;
  G.npcActor = createNpcActor(npcs.get(plan.stage), spot);
  G.npcActor.stage = plan.stage;
  G.npcActor.mood = moodOf(plan.stage);
}

/**
 * The quest kinds an NPC of this stage may offer. No mini-game comes up twice in a run: a duel
 * (a Blade Duel) only if the run's plan has no Blade Duel and no earlier NPC has duelled you, and
 * at most one dungeon delve per run.
 */
function kindsFor(stage) {
  const kinds = G.runGentle ? ['rift'] : hubFirst ? questKinds(profile.get()) : ['rift', 'duel', 'delve'];
  const used = new Set(gameCounts(G.encounterPlan || []).parry ? ['duel'] : []);
  for (const p of G.npcPlan) { if (p.stage >= stage) break; const k = npcs.get(p.stage)?.quest?.kind; if (k === 'duel' || k === 'delve') used.add(k); }
  return kinds.filter(k => !used.has(k));
}
function ensureNpc(p) {
  if (npcs.has(p.stage)) return;
  const level = campaign[p.level];
  const faces = [...npcs.values()].map(n => n.face);
  // a run's folk are dressed apart from each other and from you (characters/looks.js), and off their zone's backdrop
  const others = [...npcs.values()].map(n => n.design), context = [G.currentDesign].filter(Boolean);
  npcs.set(p.stage, makeNpc(p.seed, { zone: zoneFor(level).id, stage: p.stage, owned: characters.unlocked(), faces, kinds: kindsFor(p.stage), others, context }));
  if (!npcState.has(p.stage)) npcState.set(p.stage, { quest: 'open', traded: false });
  if (npcState.get(p.stage).traded) npcs.get(p.stage).offer = null;      // (a resumed run: they already swapped)
}

function moodOf(stage) {
  const st = npcState.get(stage), npc = npcs.get(stage);
  return npc?.quest && st?.quest === 'open' ? 'quest' : 'none';
}

export function closeTalk() {
  saveRun();
  if (G.inTown) setTimeout(tellStory, 500);
  dialog.close();
  document.body.classList.remove('in-menu');
  if (G.phase === 'talk') G.phase = G.inTown ? 'hub' : 'play';
  G.talking = null;
  controls.clear();
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(800);
  if (G.npcActor) G.npcActor.mood = moodOf(G.npcActor.stage);
  canvas.focus?.();
}

/** The conversation's front page. */
export function talkTo(actor, intro = null) {
  G.phase = 'talk';
  G.talking = actor;
  controls.clear();
  npcPrompt.hidden = true;
  if (actor.mayor) { mayorTalk(actor); return; }
  const npc = actor.npc, st = npcState.get(actor.stage);
  const options = [];
  if (npc.quest && st.quest === 'open') options.push([{ duel: '⚔ Accept the duel', delve: `🗡 Clear out their ${npc.quest.place}` }[npc.quest.kind] || '🌀 Help with their quest', () => pitchQuest(actor), true]);
  if (npc.offer && !st.traded) options.push([`⇄ Trade for their ${npc.offer.name}`, () => openTrade(actor)]);
  if (actor.villager) options.push([`🃏 Play Riftcards (${tierName(cardLevel(actor))})`, () => pitchCards(actor), !npc.quest]);
  options.push(['Goodbye', () => closeTalk()]);
  const gossip = actor.villager ? ` ${TOWN_GOSSIP[(npc.seed >>> 3) % TOWN_GOSSIP.length]}` : '';
  // villagers: "a card battler, all the way from the Crystal Caverns"; run folk: "goatherd of the Green Meadows"
  const who = actor.villager && npc.home ? `a card battler, all the way from the ${ZONES[npc.home].name}` : `${npc.job.toLowerCase()} of ${actor.villager ? 'Hearthmoor' : zoneFor(campaign[G.levelIndex]).name}`;
  const line = intro || (st.quest === 'won' ? 'Thanks again, friend! Don’t forget my spell — it’s a good one.' : st.quest === 'lost' ? 'Chin up. Not every rift wants to be closed.' : `${npc.greeting} I’m ${npc.first}, ${who}.${gossip}`);
  dialog.say(npc, line, options);
}

function pitchQuest(actor) {
  const npc = actor.npc;
  const twist = npc.quest.twist && RIFT_TWISTS[npc.quest.twist];
  const kind = npc.quest.kind;
  dialog.say(npc, questPitch(npc), [
    [kind === 'duel' ? 'En garde! ⚔' : kind === 'delve' ? `Down into the ${npc.quest.place}! 🗡` : `Into the rift! (${twist.name})`, () => (kind === 'duel' ? startDuel(actor) : kind === 'delve' ? startDelve(actor) : startRift(actor)), true],
    ['Maybe later', () => talkTo(actor)],
  ]);
}

/** The spell reward: two spells of your class you don't know yet — pick one. */
function rewardSpell(actor) {
  const npc = actor.npc;
  npcState.get(actor.stage).quest = 'won';
  profile.count('questsDone');
  G.talking = actor;
  const offer = G.runSpells.length >= SPELL_RULES.maxKnown + 1 ? [] : spellOffer(G.runClass, G.runSpells, mulberry32(hashSeed('offer', npc.seed)));
  G.phase = 'talk';
  dialog.spells(npc, questDone(npc, true), offer, id => {
    if (id) {
      G.runSpells.push(id);
      G.hud.setSpells(G.runGentle ? null : G.runClass, G.runSpells);
      const sp = SPELLS[id], key = G.runSpells.filter(x => SPELLS[x].kind === 'active').length;
      const how = sp.kind === 'active' ? `In any mini-game — bosses, checkpoints, journeys — press ${key} to cast it (or Tab, which casts your next spell that's ready). It works once per game${G.runSpells.includes('echo') ? ' (twice, with Echo)' : ''} — in a dungeon delve it recharges. Tip: ${sp.when}` : 'It’s always on — there’s nothing to press.';
      say(`Learned ${sp.name}! ${sp.kind === 'active' ? `Key ${key} in the mini-games.` : 'Always on.'}`, 4);
      dialog.say(npc, `${sp.name}! Excellent choice. ${sp.what} ${how}`, [['Onward! ▸', () => closeTalk(), true]]);
    } else closeTalk();
  }, G.runClass);
}

/**
 * A rift's loot: pick one of three Riftcards from the zone's faction (rarer further into the run
 * and the higher your card tier) — and, half the time, a piece of clothing you don't have yet.
 */
function rewardRift(actor) {
  const npc = actor.npc;
  npcState.get(actor.stage).quest = 'won';
  profile.count('questsDone');
  G.talking = actor;
  G.phase = 'talk';
  const rng = mulberry32(hashSeed('rift-loot', npc.seed));
  const starter = !profile.faction();
  const cards = openPack(rng, { faction: zoneFor(campaign[G.levelIndex]).id, tier: Math.min(5, profile.get().cardTier + (actor.stage >= 3 ? 1 : 0)), n: 3 });
  const item = rng() < 0.5 ? characters.rollReward(rng, { region: Math.min(3, actor.stage) }) : null;
  if (item) characters.unlock(item.id);
  dialog.close();
  const extra = item ? Object.assign(document.createElement('p'), { className: 'home-text', textContent: `…and tangled up in the rift: ${item.name} (${RARITY_INFO[item.rarity].label}) — it's in your wardrobe now.` }) : null;
  // a choice of one of three (not all three): what you take says what deck you're building
  deckPanels.pick({
    title: `${npc.first}’s rift loot — pick a card`,
    text: `${questDone(npc, true)}${starter ? ' (Never played Riftcards? The card battlers in the town square will teach you — and lend you a starter deck.)' : ''} Three ${FACTIONS[zoneFor(campaign[G.levelIndex]).id]?.name || 'rift'} cards fell out of the rift — keep one:`,
    cards, extra,
    onPick: id => {
      profile.addCards([id]);
      dialog.say(npc, `The ${CARDS[id].name}? Good choice! The folk in the square are sharks, mind.`, [['Onward! ▸', () => closeTalk(), true]]);
    },
  });
  sound.jingle('card');
}

// -- the duel: a Blade Duel against the NPC themselves (games/parry/rules.js)
async function startDuel(actor) {
  const npc = actor.npc;
  dialog.close();
  G.phase = 'battle';
  document.body.classList.add('in-battle');
  controls.clear();
  const level = campaign[G.levelIndex];
  const duel = makeBoss({ runSeed: G.runSeed, index: G.levelIndex, count: campaign.length, tier: zoneFor(level).id, mode: 'parry', role: 'boss', difficulty: 0.15 + 0.22 * actor.stage, check: false });
  Object.assign(duel, { name: npc.name, title: `${npc.job} · a friendly duel`, npc: { design: npc.design, face: npc.face } });
  const pausedFrom = performance.now();
  const { won } = await playBattle({ boss: duel, design: G.currentDesign, seed: hashSeed('duel', npc.seed), levelName: `${npc.first}’s quest`, spells: G.runSpells, pet: G.pet });
  document.body.classList.remove('in-battle');
  G.levelStartTime += performance.now() - pausedFrom;
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  if (won) rewardSpell(actor);
  else { npcState.get(actor.stage).quest = 'lost'; G.phase = 'talk'; dialog.say(npc, questDone(npc, false), [['Oh well ▸', () => closeTalk(), true]]); }
}

// -- the delve: a side-on dungeon crawl (games/delve/rules.js) played with your class's kit
async function startDelve(actor) {
  const npc = actor.npc;
  dialog.close();
  G.phase = 'battle';
  document.body.classList.add('in-battle');
  controls.clear();
  const level = campaign[G.levelIndex];
  const tier = actor.villager ? 'meadow' : zoneFor(level).id;
  const boss = makeBoss({ runSeed: G.runSeed, index: G.levelIndex, count: campaign.length, tier, mode: 'delve', role: 'quest', difficulty: 0.15 + 0.22 * (actor.stage % 4), check: false });
  Object.assign(boss, { name: 'The Rift Warden', title: `${npc.first}’s ${npc.quest.place} · three rooms and a Warden`, cls: G.runClass, role: 'brute', monsterSeed: hashSeed('warden', npc.seed) });
  const pausedFrom = performance.now();
  const { won } = await playBattle({ boss, design: G.currentDesign, seed: hashSeed('delve', npc.seed), levelName: `${npc.first}’s quest`, spells: G.runSpells, pet: G.pet });
  document.body.classList.remove('in-battle');
  G.levelStartTime += performance.now() - pausedFrom;
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  if (won) rewardSpell(actor);
  else { npcState.get(actor.stage).quest = 'lost'; G.phase = 'talk'; dialog.say(npc, questDone(npc, false), [['Oh well ▸', () => closeTalk(), true]]); }
}

// -- the rift: a short generated level in the same zone, with a twist (characters/npcs.js RIFT_TWISTS)
function riftSpec(actor) {
  const tier = TIERS[actor.stage] || TIERS[0];
  const [d0, d1] = tier.difficultyRange;
  const themes = Object.keys(THEMES).filter(t => t !== 'gauntlet');
  return { seed: actor.npc.quest.levelSeed, difficulty: Math.min(0.95, d0 + (d1 - d0) * 0.3), abilities: [...tier.abilities], theme: themes[actor.npc.quest.levelSeed % themes.length], maxAttempts: 400 };
}

function generateRift(spec) {
  if (!G.runWorker) return Promise.resolve(generateLevel(spec));
  const id = `${spec.seed}-${Date.now()}`;
  return new Promise(resolve => {
    riftRequests.set(id, data => resolve(data.error ? generateLevel({ ...spec, seed: spec.seed + 1 }) : data));
    G.runWorker.postMessage({ type: 'quest', id, spec });
  });
}

async function startRift(actor) {
  const npc = actor.npc;
  dialog.say(npc, 'Hold on to your hat… opening the rift!', []);
  const { level: made, audit } = await generateRift(riftSpec(actor));
  const base = campaign[G.levelIndex];
  const tier = TIERS[actor.stage] || TIERS[0];
  const twist = npc.quest.twist;
  const level = { ...made, name: `Rift of the ${npc.quest.trinket}`, tier: tier.id, zone: base.zone, abilities: [...tier.abilities], hint: `${RIFT_TWISTS[twist].name}: ${RIFT_TWISTS[twist].about}.` };
  primeAudit(level, audit);
  const route = audit?.route?.length ? [audit.route[0].from, ...audit.route.map(e => e.to)] : level.platforms.map((_, i) => i);
  const middle = route.slice(1, -1);
  const trinkets = twist === 'trinkets' ? [0.25, 0.5, 0.8].map(k => { const p = level.platforms[middle[Math.floor(k * (middle.length - 1))] ?? route[0]]; return { x: p.x, y: p.y + p.height / 2 + 0.55, z: p.z, got: false }; }) : [];
  G.rift = {
    actor, level, twist, trinkets,
    saved: { session: G.session, levelStartTime: G.levelStartTime },
    timeLeft: twist === 'clock' ? Math.round((audit?.metrics?.parTime ?? 20) * 1.8 + 6) : null,
  };
  dialog.close();
  document.body.classList.remove('in-menu');
  G.talking = null; G.talkFocus = null; G.talkBlend = 0;
  G.session = createSession(level, { maxHealth: twist === 'glass' ? 1 : 3 });
  G.hud.setMaxHealth?.(G.session.maxHealth);
  avatar.reset(G.session.player);
  G.petFollower?.reset(G.session.player);
  particleSystem.clear();
  for (const color of [[0.7, 0.4, 1], [0.3, 0.9, 1]]) particleSystem.emit(level.spawn.x, level.spawn.y + 1, level.spawn.z, { count: 30, speed: 6, color, lifetime: 1.2 });
  G.phase = 'play';
  controls.clear();
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  showHint(level);
  updateStatus();
  sound.fx('portal');
  sound.place('rift', npc.seed);
}

/** Leave the rift: back where you stood in the level, with the NPC. */
export function endRift(won, why = '') {
  const { actor, saved } = G.rift;
  G.rift = null;
  G.session = saved.session;
  G.levelStartTime = saved.levelStartTime;
  G.hud.setMaxHealth?.(G.session.maxHealth);
  avatar.reset(G.session.player);
  G.petFollower?.reset(G.session.player);
  particleSystem.clear();
  showHint(campaign[G.levelIndex]);
  updateStatus();
  G.lastTime = undefined;
  G.renderer?.holdAdaptive(1500);
  sound.level(campaign[G.levelIndex], G.levelIndex, G.runSeed);
  if (won) sound.jingle('victory');
  if (won) { G.phase = 'talk'; rewardRift(actor); return; }
  npcState.get(actor.stage).quest = 'lost';
  G.phase = 'talk';
  G.talking = actor;
  dialog.say(actor.npc, `${why} ${questDone(actor.npc, false)}`.trim(), [['Oh well ▸', () => closeTalk(), true]]);
}

// -- trading: their item for one of yours of the same rarity
function openTrade(actor) {
  const npc = actor.npc, theirs = npc.offer;
  const mine = characters.unlocked().map(id => UNLOCKABLES.find(u => u.id === id)).filter(u => u && u.rarity === theirs.rarity);
  mine.sort((a, b) => (b.slot === theirs.slot) - (a.slot === theirs.slot));
  dialog.trade(npc, {
    text: mine.length ? `Ooh, what have you got? I’d swap my ${theirs.name} for anything of yours that’s just as ${theirs.rarity}.` : `My ${theirs.name}? It’s ${theirs.rarity}, you know. Bring me something just as ${theirs.rarity} and we’ll talk.`,
    theirs, mine, design: G.currentDesign,
    onBack: () => talkTo(actor),
    onSwap: item => {
      characters.relinquish(item.id);
      characters.unlock(theirs.id);
      npcState.get(actor.stage).traded = true;
      profile.count('trades');
      // they put on what you gave them; you stop wearing it
      npc.design = { ...npc.design, [item.slot]: item.slot === 'trail' ? npc.design.trail : item.value };
      npc.offer = null;
      actor.avatar.setCharacter(npc.design);
      const defaults = { hat: 'none', extra: 'none', back: 'none', trail: 'none', top: 'tee', shoes: 'sneakers', bottom: 'pants' };
      if (G.currentDesign[item.slot] === item.value) wearDesign({ ...G.currentDesign, [item.slot]: defaults[item.slot] });
      dialog.say(npc, `A ${item.name}! It suits me, doesn’t it? Enjoy the ${theirs.name}.`, [
        ['Wear it now', () => { wearDesign({ ...G.currentDesign, [theirs.slot]: theirs.value }); talkTo(actor, 'Looking sharp!'); }, true],
        ['Back', () => talkTo(actor)],
      ]);
    },
  });
}

/** Put on a look (saved back to the design, or as the draft for the default heroes). */
function wearDesign(design) {
  G.currentDesign = dressed(design);
  if (G.currentDesign.id !== DRAFT_ID && characters.get(G.currentDesign.id) && !characters.isDefault(G.currentDesign.id)) characters.save(G.currentDesign);
  else { G.currentDesign = { ...G.currentDesign, id: DRAFT_ID }; characters.setDraft(G.currentDesign); characters.select(DRAFT_ID); }
  avatar.setCharacter(G.currentDesign);
}
