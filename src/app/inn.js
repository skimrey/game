/**
 * The inn, the Ring and the ranch — the app's side (town/inn.js and town/ranch.js draw them):
 *
 *   the challenge board   three mini-games, new after every run; each pays gold once
 *   the Ring              tamers at your Ring tier; a fight with your squad of three (ring/screen.js);
 *                         experience for your monsters, gold, the ladder (beat three to rise)
 *   befriending           at the end of each stage of a run, one of the bosses you beat there
 *                         comes home (noteBossBeaten / befriendAtStageEnd)
 *   the ranch             behind your house: your monsters roam; the squad board
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { G, controls, home, inn, npcPrompt, profile, ranch, ringPanels, ringScreen, status, hubFirst } from './boot.js';
import { enterTown, playPracticeGame } from './town.js';
import { openTailor } from './tailor.js';
import { sound } from '../audio/music.js';
import { backdropOf, makeGroup, regularNpc } from '../characters/npcs.js';
import { MODES, rolesOf } from '../games/index.js';
import { hashSeed, mulberry32 } from '../levels/generator.js';
import { monsterFromBoss, gainXp, TYPES, ZONE_TYPE } from '../ring/monsters.js';
import { RING_TIERS, SQUAD, tamerSquad, xpForWin, goldForWin } from '../ring/tamers.js';
import { monsterCard } from '../ring/panels.js';
import { ZONE_IDS, ZONES } from '../world/zones.js';

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};
export const ringTierName = t => (t >= RING_TIERS.length ? 'Grand Champion' : RING_TIERS[Math.max(0, t)].name);

// ---------------------------------------------------------------------------
// Who's at the inn
// ---------------------------------------------------------------------------
const regulars = {};
const regular = id => (regulars[id] ||= regularNpc(id));

/** Three tamers in the yard: from random worlds, at the Ring tier you were when they came. */
function makeTamers(visit = profile.get().townVisits) {
  const zones = [...ZONE_IDS].sort((a, b) => hashSeed('tamer-home', visit, a) - hashSeed('tamer-home', visit, b));
  const tier = Math.min(RING_TIERS.length - 1, profile.get().ringTier);
  // dressed apart from each other, the inn's regulars and you (characters/looks.js)
  // (who's in view in the yard: Rocco the Ring Master and you — the tavern's regulars are indoors)
  const others = [regular('master').design];
  const group = makeGroup([0, 1, 2].map(i => ({ seed: hashSeed('tamer', visit, i), zone: zones[i], quest: false, avoid: backdropOf('yard') })), { context: [...others, G.currentDesign].filter(Boolean) });   
  return group.map((npc, i) => {
    const zone = zones[i];
    npc.job = `Monster tamer from ${ZONES[zone].name}`;
    return { npc, zone, tier, key: `tamer-${npc.seed}`, squad: tamerSquad(npc.seed, zone, tier), label: `${RING_TIERS[tier].name} · ${TYPES[ZONE_TYPE[zone]].name}` };
  });
}

/** The board: three games you've met (some easy ones if you haven't met many), easy / medium / hard — new ones after every run. */
function makeBoard(run = profile.get().runs) {
  const d = profile.get();
  const playable = id => !MODES[id].travel && !rolesOf(id).includes('quest');
  let pool = d.met.filter(id => MODES[id] && playable(id));
  for (const id of ['whack', 'fishing', 'maze', 'doodle', 'flappy', 'tetris', 'frogger', 'runner', 'tennis', 'breakout']) if (pool.length < 6 && !pool.includes(id)) pool.push(id);
  const rng = mulberry32(hashSeed('inn-board', run));
  pool = pool.sort(() => rng() - 0.5);
  return [0, 1, 2].map(level3 => {
    const mode = pool[level3 % pool.length];
    return { key: `board-${run}-${level3}`, mode, level3, role: rolesOf(mode)[0], gold: [10, 20, 35][level3] };
  });
}

export function innPeople() {
  G.tamers ||= makeTamers();
  if (G.innBoardRun !== profile.get().runs) { G.innBoard = makeBoard(); G.innBoardRun = profile.get().runs; }
  const d = profile.get();
  return {
    keeper: regular('keeper'), barmaid: regular('barmaid'), tailor: regular('tailor'), master: regular('master'),
    tamers: G.tamers.map(t => ({ ...t, beaten: t.tier === d.ringTier && d.ringBeaten.includes(t.key) })),
    board: G.innBoard.map(c => ({ ...c, paid: profile.innPaid(c.key) })),
  };
}

/** Pippa's tips, one per chat. */
const TIPS = [
  'Bertha’s board changes after every run — and each challenge only pays once, so try them all.',
  'A boss only follows you home if you beat the last boss of its stage. Save your best for the end!',
  'In the Ring, mix your types: every type hits two others hard — and two others hit it hard.',
  'Monsters grow from every Ring fight — even the ones they lose.',
  'In Riftcards, look at the three worlds before you start: your creatures get +1 in their own.',
  'Losing a card round badly? Pass! Keep your cards for the next two.',
  'Tess can paint patterns on wings, you know. Costs a small fortune, mind.',
  'Rocco’s tamers only change while you’re off on a run. Beat all three to move up!',
  'Guard halves a hit. Nice trick when your monster’s nearly out.',
];
let tipIndex = 0;

// ---------------------------------------------------------------------------
// In and out
// ---------------------------------------------------------------------------
export function enterInn({ x = 40 } = {}) {
  G.phase = 'inn';
  controls.clear();
  npcPrompt.hidden = true;
  inn.open({ design: G.currentDesign, x });
  status.textContent = 'The Tipsy Teapot — the challenge board pays gold; the tailor spends it; the Ring is out the back';
  sound.fx('door');
  sound.place('inn', profile.get().townVisits);
}
export const leaveInn = () => enterTown('inn');

function back() { inn.resume({ design: G.currentDesign }); G.phase = 'inn'; sound.place('inn', profile.get().townVisits); }

/** What happens at each spot in the inn (town/inn.js calls this). */
export function useInn(h) {
  const p = innPeople();
  if (h.id === 'door') { inn.close(); leaveInn(); return; }
  if (h.id === 'keeper') {
    inn.showPanel(`${p.keeper.first}, the innkeeper`, [el('p', { class: 'home-text', text: `${p.keeper.greeting} Fancy earning a bit of gold? The board by the fire has three challenges — new ones every time you come back to town. Gold buys you the tailor's time (Tess can paint patterns on anything you own). And if you've made monster friends on your travels, Rocco runs the Ring out back. You have ${profile.gold()} gold.` })]);
    return;
  }
  if (h.id === 'barmaid') {
    const tip = TIPS[tipIndex++ % TIPS.length];
    inn.showPanel(`${p.barmaid.first}, the barmaid`, [el('p', { class: 'home-text', text: `${p.barmaid.greeting} ${tip}` })], [['Another tip', () => useInn(h)], ['Thanks!', () => inn.hidePanel(), true]]);
    return;
  }
  if (h.id === 'board') return boardPanel();
  if (h.id === 'tailor') { inn.pause(); inn.hideCanvas(); openTailor({ onDone: () => back() }); return; }
  if (h.id === 'master') return masterPanel();
  if (h.tamer) return challengeTamer(h.tamer);
}

function boardPanel() {
  const p = innPeople();
  const rows = p.board.map(c => el('div', { class: 'arcade-row board-row' }, [
    el('strong', { text: MODES[c.mode].name }),
    el('span', { text: ['Easy', 'Medium', 'Hard'][c.level3] }),
    el('span', { class: 'board-gold', text: c.paid ? 'won ✓' : `${c.gold} gold` }),
    c.paid ? el('span', { class: 'deck-count', text: 'done — new after a run' }) : el('button', { type: 'button', class: 'primary', text: 'Play ▸', onclick: () => playBoard(c) }),
  ]));
  inn.showPanel('The challenge board', [
    el('p', { class: 'home-text', text: 'Win one of these to collect its gold. Each can be won once — Bertha pins up new ones after your next run. Gold is for the tailor: patterns and colours for the clothes you’ve won.' }),
    el('div', { class: 'arcade-list' }, rows),
    el('p', { class: 'home-text', text: `You have ${profile.gold()} gold.` }),
  ]);
}
async function playBoard(c) {
  inn.hidePanel(); inn.pause(); inn.hideCanvas();
  const { won } = await playPracticeGame(c.mode, c.level3, c.role, 'The challenge board');
  const before = profile.gold();
  if (profile.innPaid(c.key)) { back(); return; }
  if (won) { profile.payInn(c.key, c.gold); sound.jingle('victory'); }
  back();
  const got = profile.gold() - before;
  inn.showPanel(won ? 'Challenge won!' : 'Not this time', [el('p', { class: 'home-text', text: won ? `Bertha slides ${got} gold across the counter. You have ${profile.gold()} gold.` : 'Have another go — the challenge stays on the board until you win it.' })],
    [['Back to the board', () => boardPanel(), true], ['Close', () => inn.hidePanel()]]);
}

// ---------------------------------------------------------------------------
// The Ring
// ---------------------------------------------------------------------------
function masterPanel() {
  const d = profile.get(), herd = profile.monsters();
  const tier = d.ringTier;
  const text = herd.length < SQUAD
    ? `Step right up! The Ring takes squads of ${SQUAD} monsters — you have ${herd.length}. Out on your runs, at the end of each stage, one of the bosses you beat can come home with you. Bring me three!`
    : tier >= RING_TIERS.length
      ? 'Grand Champion! Nobody in the worlds tames like you. The tamers still come to test themselves — take them on any time.'
      : `You fight at ${ringTierName(tier)} tier: beat the three tamers in the yard (${d.ringBeaten.length} of 3 so far) and you rise — the next, tougher ones arrive while you're off on a run. Your squad:`;
  const squad = herd.length >= SQUAD ? el('div', { class: 'deck-cards pack' }, profile.squad().map(m => monsterCard(m, { compact: true }))) : null;
  inn.showPanel(`${regular('master').first}, the Ring Master`, [el('p', { class: 'home-text', text }), squad],
    [...(herd.length >= SQUAD ? [['Choose my squad', () => { inn.hidePanel(); chooseSquad(() => masterPanel()); }]] : []), ['How it works', () => { const ul = el('ul', { class: 'boss-rules' }); ul.innerHTML = RULES; inn.showPanel('The Ring', [ul], [['Back', () => masterPanel(), true]]); }], ['Close', () => inn.hidePanel(), true]]);
}
const RULES = `<li>Three monsters a side. Each round you give each of yours a command; then everything happens in speed order.</li>
  <li>Types: each hits two others hard (×1.5) and is hit hard by two — Flame › Leaf & Frost · Tide › Flame & Stone · Leaf › Tide & Stone · Stone › Flame & Gem · Frost › Spore & Gem · Spore › Tide & Star · Gem › Spore & Star · Star › Frost & Leaf.</li>
  <li>A monster's signature move comes from the game you fought it in; its body gives another (Stomp, Roar, Gust, Soothe, Cheer); Guard halves a hit.</li>
  <li>Monsters gain experience from every fight (more for a win) and level up. Later stages of a run bring stronger monsters home.</li>`;

export function chooseSquad(after = () => {}) {
  inn.pause();
  ringPanels.squad({ monsters: profile.monsters(), squad: profile.get().squad || [], onDone: ids => { profile.setSquad(ids.length ? ids : null); after(); } });
}

async function challengeTamer(t) {
  const herd = profile.monsters();
  if (herd.length < SQUAD) { masterPanel(); return; }
  if (t.beaten) { inn.showPanel(t.npc.first, [el('p', { class: 'home-text', text: 'You again! My monsters are still catching their breath. (You’ve beaten this tamer — the next ones arrive after your next run.)' })], [['Fight anyway', () => fightTamer(t), true], ['Later', () => inn.hidePanel()]]); return; }
  inn.showPanel(`${t.npc.first}, ${t.npc.job.toLowerCase()}`, [
    el('p', { class: 'home-text', text: `${t.npc.greeting} A ${ringTierName(t.tier)} match? My three:` }),
    el('div', { class: 'deck-cards pack' }, t.squad.map(m => monsterCard(m, { compact: true }))),
  ], [['Fight! ▸', () => fightTamer(t), true], ['Choose my squad', () => { inn.hidePanel(); chooseSquad(() => challengeTamer(t)); }], ['Later', () => inn.hidePanel()]]);
}

async function fightTamer(t) {
  inn.hidePanel(); inn.pause(); inn.hideCanvas();
  G.phase = 'cards';
  const mine = profile.squad();
  const T = RING_TIERS[t.tier];
  const { won, skipped } = await ringScreen.start({
    mine, foes: t.squad,
    me: { design: G.currentDesign, name: G.currentDesign.name || 'You' },
    foe: { name: t.npc.first, title: `${T.name} tamer from ${ZONES[t.zone].name}`, design: { ...t.npc.design, silly: t.npc.face }, skill: T.skill },
    seed: hashSeed('ring', t.npc.seed, profile.get().ringWins, Date.now() % 997), title: 'The Ring',
  });
  G.phase = 'inn';
  back();
  if (skipped) return;
  // experience for everyone who fought (more for a win), gold and the ladder for a win
  const xp = xpForWin(mine, t.squad, won);
  const notes = mine.map((m, i) => {
    const { mon, ups } = gainXp({ ...m, wins: (m.wins || 0) + (won ? 1 : 0) }, xp[i]);
    profile.updateMonster(mon);
    return { mon, note: `+${xp[i]} xp${ups ? ` · LEVEL ${mon.level}!` : ''}` };
  });
  if (notes.some(n => n.note.includes('LEVEL'))) sound.fx('checkpoint');
  if (!won) { inn.showPanel(`${t.npc.first} wins this one`, [el('p', { class: 'home-text', text: 'Your monsters learned something anyway:' }), el('div', { class: 'deck-cards pack' }, notes.map(n => monsterCard(n.mon, { compact: true, extra: el('span', { class: 'mon-note', text: n.note }) })))], [['Rematch', () => fightTamer(t), true], ['Close', () => inn.hidePanel()]]); return; }
  const gold = goldForWin(t.tier);
  profile.addGold(gold);
  const before = profile.get().ringTier;
  const { tier, tierUp, beaten } = profile.beatTamer(t.key, t.tier);
  const ladder = tierUp ? (tier >= RING_TIERS.length ? ` You’re the Grand Champion of the Ring!` : ` You rise to ${ringTierName(tier)}! Tougher tamers will come while you’re off on your next run.`) : t.tier === before && before < RING_TIERS.length ? ` That’s ${beaten} of 3 ${ringTierName(before)} tamers beaten.` : '';
  if (tierUp && tier >= RING_TIERS.length) profile.addDecor('ringbelt');
  inn.showPanel(`You beat ${t.npc.first}!`, [
    el('p', { class: 'home-text', text: `+${gold} gold (you have ${profile.gold()}).${ladder}` }),
    el('div', { class: 'deck-cards pack' }, notes.map(n => monsterCard(n.mon, { compact: true, extra: el('span', { class: 'mon-note', text: n.note }) }))),
  ], [['Great ▸', () => inn.hidePanel(), true]]);
}

// ---------------------------------------------------------------------------
// Befriending bosses on a run
// ---------------------------------------------------------------------------
/** A boss beaten in this stage (kept until the stage ends). */
export function noteBossBeaten(boss, stage) {
  if (!hubFirst || !boss || boss.kind !== 'boss') return;
  G.stageBosses ||= [];
  if (!G.stageBosses.some(b => b.monsterSeed === boss.monsterSeed)) G.stageBosses.push({ ...boss, stage });
}

/**
 * At the end of a stage: one of its beaten bosses may come home — but only if you beat the
 * stage's last boss (its capstone). Calls `next` either way.
 */
export function befriendAtStageEnd(next, { capstoneBeaten = true } = {}) {
  const list = (G.stageBosses || []).filter(b => !profile.monsters().some(m => m.monsterSeed === b.monsterSeed));
  G.stageBosses = [];
  if (!hubFirst || !list.length) { next(); return; }
  if (!capstoneBeaten) {
    ringPanels.info({ title: 'Nobody follows you home', text: 'The stage’s last boss got away — and the others won’t leave without their leader. Beat a stage’s final boss and one of its bosses will come home with you.', buttons: [['Onward ▸', next, true]] });
    return;
  }
  const monsters = list.map(b => monsterFromBoss(b, { stage: b.stage }));
  const first = !profile.monsters().length;
  ringPanels.befriend({
    title: first ? 'A boss wants to come home with you!' : 'Who comes home with you?',
    text: `${first ? 'Beaten bosses are oddly fond of whoever beat them. ' : ''}One of this stage’s bosses can live at your ranch (behind your house) and fight for you in the Ring behind the inn. Its moves come from the game you fought it in; later stages bring stronger monsters.`,
    monsters, owned: profile.monsters(),
    onPick: mon => {
      if (mon) { profile.addMonster(mon); sound.jingle('card'); }
      next();
    },
  });
}

// ---------------------------------------------------------------------------
// The ranch (behind your house)
// ---------------------------------------------------------------------------
export function enterRanch() {
  home.close();
  G.phase = 'ranch';
  controls.clear();
  ranch.open({ design: G.currentDesign });
  status.textContent = 'The ranch — the bosses you’ve befriended';
  sound.fx('door');
}
export function leaveRanch() {
  G.phase = 'home';
  home.open({ design: G.currentDesign, x: 930 });
  sound.fx('door');
  sound.place('home', profile.get().runs);
}
export function ranchSquad(after) { chooseSquad(after); }
