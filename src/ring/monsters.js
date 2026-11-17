/**
 * Monsters for the Ring — the bosses you befriend on your runs. Pure data (no DOM).
 *
 * Every boss you beat is a generated monster (characters/monsters.js) from a zone, with a
 * body (walker, brute, flyer, floater, dancer) and the mini-game you fought it in. At the end
 * of each stage of a run, one of the stage's beaten bosses comes home with you — to the ranch
 * behind your house — and can fight in the Ring behind the inn.
 *
 *   TYPE       its zone's element: Leaf (meadow) · Tide (lagoon) · Stone (canyon) · Spore (grove)
 *              · Frost (alpine) · Flame (volcano) · Gem (crystal) · Star (starlit). Each type hits
 *              two others hard (×1.5) and two others hit it hard — see STRONG.
 *   STATS      hp · atk · def · spd from its level and body (brutes are tough and slow, fliers
 *              fast and frail …), a little different for every monster (its seed)
 *   MOVES      four commands: a basic attack of its type; a SIGNATURE move from the game it was
 *              fought in (the Tennis boss volleys, the Quick Draw boss always shoots first, the
 *              Spore Bomber poisons everyone …); a move from its body (stomp, roar, tailwind,
 *              soothe, cheer); and Guard
 *   LEVEL      from the stage it was befriended in (later stages: stronger) — and it grows with
 *              experience from Ring fights
 *
 *   const mon = monsterFromBoss(boss, { stage: 2 });   // plain JSON: goes in the profile
 *   statsOf(mon) · movesOf(mon) · effectiveness('flame', 'leaf') → 1.5 · gainXp(mon, 40)
 */
import { mulberry32, hashSeed } from '../levels/generator.js';

export const TYPES = {
  leaf: { id: 'leaf', name: 'Leaf', zone: 'meadow', color: '#5fbf4a' },
  tide: { id: 'tide', name: 'Tide', zone: 'lagoon', color: '#3ab8e0' },
  stone: { id: 'stone', name: 'Stone', zone: 'canyon', color: '#c8803a' },
  spore: { id: 'spore', name: 'Spore', zone: 'grove', color: '#b05ad8' },
  frost: { id: 'frost', name: 'Frost', zone: 'alpine', color: '#9adcff' },
  flame: { id: 'flame', name: 'Flame', zone: 'volcano', color: '#ff6a2a' },
  gem: { id: 'gem', name: 'Gem', zone: 'crystal', color: '#e070ff' },
  star: { id: 'star', name: 'Star', zone: 'starlit', color: '#ffd84a' },
};
export const TYPE_IDS = Object.keys(TYPES);
export const ZONE_TYPE = Object.fromEntries(Object.values(TYPES).map(t => [t.zone, t.id]));

/** What each type hits hard (and so, who hits it hard). Every type: strong against two, weak against two. */
export const STRONG = {
  flame: ['leaf', 'frost'],
  tide: ['flame', 'stone'],
  leaf: ['tide', 'stone'],
  stone: ['flame', 'gem'],
  frost: ['spore', 'gem'],
  spore: ['tide', 'star'],
  gem: ['spore', 'star'],
  star: ['frost', 'leaf'],
};
export function effectiveness(attack, defend) {
  if (!attack || !defend) return 1;
  if (STRONG[attack]?.includes(defend)) return 1.5;
  if (STRONG[defend]?.includes(attack)) return 0.67;
  return 1;
}

/** Bodies: how the stats lean. */
export const BODIES = {
  walker: { name: 'Walker', hp: 1, atk: 1, def: 1, spd: 1 },
  brute: { name: 'Brute', hp: 1.18, atk: 1.12, def: 1.1, spd: 0.75 },
  flyer: { name: 'Flyer', hp: 0.95, atk: 1.14, def: 0.92, spd: 1.3 },
  floater: { name: 'Floater', hp: 1.06, atk: 0.94, def: 1.15, spd: 0.95 },
  dancer: { name: 'Dancer', hp: 1, atk: 1.1, def: 0.96, spd: 1.15 },
};

export const MAX_LEVEL = 30;

/** The basic attack of each type. */
const BASIC = {
  leaf: 'Vine Lash', tide: 'Splash', stone: 'Rock Toss', spore: 'Spore Puff', frost: 'Ice Shard', flame: 'Ember', gem: 'Gem Beam', star: 'Star Flick',
};

/**
 * Every move. target: foe · allFoes · randomFoes (hits n) · ally · allAllies · self.
 * power: × the basic hit; cooldown: rounds before it can be used again; priority: goes first.
 */
export const MOVES = {
  basic: { id: 'basic', name: 'Attack', target: 'foe', power: 1, cooldown: 0, about: 'A plain hit of its type.' },
  guard: { id: 'guard', name: 'Guard', target: 'self', power: 0, cooldown: 0, priority: 3, guard: true, about: 'Takes half damage this round.' },
  // signatures: the game it was fought in
  runner: { id: 'runner', name: 'Spike Toss', target: 'randomFoes', hits: 2, power: 0.65, cooldown: 2, about: 'Throws two spikes at random foes.' },
  echo: { id: 'echo', name: 'Mimic', target: 'foe', power: 1.5, cooldown: 2, mimic: true, about: 'Copies the last move a foe used (or hits hard).' },
  quickdraw: { id: 'quickdraw', name: 'Quick Draw', target: 'foe', power: 1.3, cooldown: 1, priority: 1, about: 'Always shoots first.' },
  sled: { id: 'sled', name: 'Avalanche', target: 'allFoes', power: 0.55, cooldown: 3, freeze: 0.2, about: 'Hits every foe; may freeze them.' },
  starbeat: { id: 'starbeat', name: 'Crescendo', target: 'foe', power: 0.8, cooldown: 1, crescendo: 0.35, about: 'Louder every time: +35% power each use.' },
  tennis: { id: 'tennis', name: 'Volley', target: 'foe', power: 1.15, cooldown: 2, bounce: 0.6, about: 'If it knocks one out, the ball bounces to another.' },
  invaders: { id: 'invaders', name: 'Barrage', target: 'randomFoes', hits: 3, power: 0.45, cooldown: 2, about: 'Three shots at random foes.' },
  fireball: { id: 'fireball', name: 'Fireball', target: 'foe', power: 1.2, cooldown: 2, burn: 0.45, about: 'A big hit; may burn.' },
  breakout: { id: 'breakout', name: 'Brick Wall', target: 'allAllies', power: 0, cooldown: 3, shield: 0.15, about: 'Shields every ally.' },
  cannon: { id: 'cannon', name: 'Big Bang', target: 'foe', power: 2.1, cooldown: 3, rest: true, about: 'An enormous hit — then it must rest a round.' },
  whack: { id: 'whack', name: 'Bonk', target: 'foe', power: 1.05, cooldown: 2, stun: 0.6, about: 'May stun: the foe loses its next turn.' },
  fishing: { id: 'fishing', name: 'Reel In', target: 'foe', power: 1, cooldown: 2, debuff: 'spd', about: 'Hooks a foe and slows it down.' },
  maze: { id: 'maze', name: 'Gobble', target: 'foe', power: 1, cooldown: 2, drain: 0.5, about: 'Heals itself by half the damage.' },
  parry: { id: 'parry', name: 'Riposte', target: 'self', power: 0, cooldown: 1, priority: 2, counter: true, about: 'Parries the next hit this round and strikes back.' },
  bubble: { id: 'bubble', name: 'Bubble Shield', target: 'ally', power: 0, cooldown: 2, shield: 0.35, cleanse: true, about: 'Shields an ally and washes off burns and poison.' },
  bomber: { id: 'bomber', name: 'Spore Bomb', target: 'allFoes', power: 0.2, cooldown: 3, poison: 0.7, about: 'Poisons every foe.' },
  lavaguard: { id: 'lavaguard', name: 'Magma Armor', target: 'self', power: 0, cooldown: 3, buff: 'def', thorns: true, heal: 0.2, about: 'Heals a little, gets tougher, and burns whoever hits it.' },
  shards: { id: 'shards', name: 'Shard Storm', target: 'randomFoes', hits: 4, power: 0.36, cooldown: 2, about: 'Four shards at random foes.' },
  delve: { id: 'delve', name: "Warden's Guard", target: 'self', power: 0, cooldown: 3, taunt: true, buff: 'def', shield: 0.2, about: 'Shields itself; foes must attack it for two rounds.' },
  // bodies
  walker: { id: 'walker', name: 'Stomp', target: 'foe', power: 1.35, cooldown: 2, about: 'A heavy hit.' },
  brute: { id: 'brute', name: 'Roar', target: 'allFoes', power: 0.45, cooldown: 3, debuff: 'atk', about: 'Shakes every foe: a small hit, and they hit softer for three rounds.' },
  flyer: { id: 'flyer', name: 'Gust', target: 'allFoes', power: 0.5, cooldown: 3, allyBuff: 'spd', about: 'Blasts every foe — and a tailwind speeds up every ally (faster: first to act, harder to hit).' },
  floater: { id: 'floater', name: 'Soothe', target: 'ally', power: 0, cooldown: 2, heal: 0.35, about: 'Heals an ally.' },
  dancer: { id: 'dancer', name: 'Cheer', target: 'allAllies', power: 0, cooldown: 3, buff: 'atk', allyHeal: 0.1, about: 'Every ally hits harder for three rounds (and feels a bit better).' },
};
export const SIGNATURE_MODES = ['runner', 'echo', 'quickdraw', 'sled', 'starbeat', 'tennis', 'invaders', 'fireball', 'breakout', 'cannon', 'whack', 'fishing', 'maze', 'parry', 'bubble', 'bomber', 'lavaguard', 'shards', 'delve'];

/** A monster's four commands (move objects, with the basic attack named for its type). */
export function movesOf(mon) {
  const basic = { ...MOVES.basic, name: BASIC[mon.type] || 'Attack' };
  const sig = MOVES[mon.mode] && SIGNATURE_MODES.includes(mon.mode) ? MOVES[mon.mode] : MOVES.walker;
  const body = MOVES[mon.body] || MOVES.walker;
  return [basic, sig, body.id === sig.id ? MOVES.dancer : body, MOVES.guard];
}

/** Level for a boss befriended in a stage (0–3), nudged by how hard it was. */
export function levelFor({ stage = 0, difficulty = 0.3 } = {}) {
  return Math.max(2, Math.min(MAX_LEVEL, 2 + stage * 3 + Math.round(difficulty * 2)));
}

/** A monster from a beaten boss (progression/bosses.js) — plain JSON for the profile. */
export function monsterFromBoss(boss, { stage = 0, level = null } = {}) {
  return {
    id: `mon-${boss.monsterSeed}`,
    name: boss.name,
    title: boss.title || '',
    mode: boss.mode,
    body: boss.role || 'walker',
    type: ZONE_TYPE[boss.theme] || 'leaf',
    zone: boss.theme || 'meadow',
    monsterSeed: boss.monsterSeed,
    hue: boss.hue ?? 0,
    accentHue: boss.accentHue ?? 180,
    level: level ?? levelFor({ stage, difficulty: boss.difficulty ?? 0.3 }),
    xp: 0,
    wins: 0,
  };
}

/** The stats at its level. */
export function statsOf(mon) {
  const B = BODIES[mon.body] || BODIES.walker, L = mon.level;
  const rng = mulberry32(hashSeed('mon-stats', mon.monsterSeed));
  const j = () => 0.92 + rng() * 0.16;
  return {
    hp: Math.round((40 + L * 3.4) * B.hp * j()),
    atk: Math.round((12 + L * 1) * B.atk * j()),
    def: Math.round((12 + L * 1) * B.def * j()),
    spd: Math.round((12 + L * 1) * B.spd * j()),
  };
}

/** Experience to go from a level to the next. */
export const xpToNext = L => 20 + L * 10;
/** Add experience: a copy of the monster, with its new level (and how many it gained). */
export function gainXp(mon, xp) {
  const out = { ...mon, xp: (mon.xp || 0) + Math.round(xp) };
  let ups = 0;
  while (out.level < MAX_LEVEL && out.xp >= xpToNext(out.level)) { out.xp -= xpToNext(out.level); out.level++; ups++; }
  if (out.level >= MAX_LEVEL) out.xp = 0;
  return { mon: out, ups };
}
