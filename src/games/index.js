/**
 * The mini-game registry — every game lives in its own folder (games/<id>/: index.js the
 * descriptor, rules.js the rules and bot, draw.js the scene, scene3d.js the 3D version for
 * journeys) and is listed here once. To add a game: make its folder, import its index.js
 * below, add it to MODES (and a STYLES entry in audio/compose.js if it needs its own music).
 *
 * The mini-games. Every level ends with a boss game (after the gem); some levels also
 * have an arcade checkpoint halfway, with a checkpoint game (win it to save your
 * progress there and refill your hearts). A run never plays the same game twice (see
 * progression/encounters.js): players learn the games across runs, and within a run each one
 * comes harder the later it falls.
 *
 *   boss games        runner (Key Jump) · echo (Copycat) · quickdraw (Quick Draw) · sled (Avalanche Run)
 *                     starbeat (Star Beat) · tennis (Tennis Match) · invaders (Star Invaders)
 *                     fireball (Spellslinger) · breakout (Brick Breaker) · cannon (Cannon Duel)
 *                     bubble (Bubble Pop) · bomber (Spore Bomber) · lavaguard (Lava Guard) · shards (Shard Storm)
 *   either            whack (Whack-a-Critter) · fishing (Gone Fishing) · maze (Maze Muncher) · parry (Blade Duel)
 *   checkpoint games  doodle (Cloud Hop) · flappy (Flap Dash) · tetris (Block Drop) · frogger (Road Hop)
 *                     lander (Moon Lander)
 *   travel levels     raft (River Raft) · minecart (Mine Cart) · snowmobile (Snowmobile) · plane (Biplane)
 *   quests            delve (Dungeon Delve) — only ever an NPC's quest (role 'quest': never in a run's plan)
 *
 * Zone capstones (the last level of a stage, by the zone it's played in): meadow → Copycat,
 * lagoon → Bubble Pop, canyon → Quick Draw, grove → Spore Bomber, alpine → Avalanche Run,
 * volcano → Lava Guard, crystal → Shard Storm, starlit → Star Invaders. Blade Duel can be a
 * boss or a checkpoint anywhere (and is the duel NPCs challenge you to).
 *
 * Each game: { id, name, controls, checkpoint?, rules(boss) → [html], create(boss, { seed }) → game,
 * bot(options) → policy(game, dt), draw(screen, view, game, o), heroAt(game), bossAt(game), keys }. A game has press(code), release(code), step(dt), drain(),
 * held (keys down), result ('playing' | 'won' | 'lost'), reason, hearts, timeLeft, bossHp (for
 * checkpoint games: progress still to make), steps (palette step), stats; some also click(x, y).
 */
import runner from './runner/index.js';
import echo from './echo/index.js';
import quickdraw from './quickdraw/index.js';
import sled from './sled/index.js';
import starbeat from './starbeat/index.js';
import tennis from './tennis/index.js';
import invaders from './invaders/index.js';
import fireball from './fireball/index.js';
import doodle from './doodle/index.js';
import flappy from './flappy/index.js';
import tetris from './tetris/index.js';
import breakout from './breakout/index.js';
import cannon from './cannon/index.js';
import whack from './whack/index.js';
import fishing from './fishing/index.js';
import maze from './maze/index.js';
import frogger from './frogger/index.js';
import lander from './lander/index.js';
import raft from './raft/index.js';
import minecart from './minecart/index.js';
import snowmobile from './snowmobile/index.js';
import plane from './plane/index.js';
import parry from './parry/index.js';
import bubble from './bubble/index.js';
import bomber from './bomber/index.js';
import lavaguard from './lavaguard/index.js';
import shards from './shards/index.js';
import delve from './delve/index.js';
import { simulate } from './kit/common.js';
import { registerScenes } from './kit/view.js';
import { ZONES, CLASSIC_ZONES, travelVehicles } from '../world/zones.js';

export const MODES = {
  runner, echo, quickdraw, sled, starbeat, tennis, invaders, fireball, breakout, cannon,
  whack, fishing, maze, parry,
  bubble, bomber, lavaguard, shards,
  doodle, flappy, tetris, frogger, lander,
  raft, minecart, snowmobile, plane,
  delve,
};
registerScenes(Object.fromEntries(Object.entries(MODES).map(([id, game]) => [id, game.draw])));

/** What a game can be: a level's boss, an arcade checkpoint, or a travel level between regions. */
export const rolesOf = id => MODES[id].roles || (MODES[id].travel ? ['travel'] : MODES[id].checkpoint ? ['checkpoint'] : ['boss']);
export const BOSS_GAMES = Object.keys(MODES).filter(id => rolesOf(id).includes('boss'));
export const CHECKPOINT_GAMES = Object.keys(MODES).filter(id => rolesOf(id).includes('checkpoint'));
export const TRAVEL_GAMES = Object.keys(MODES).filter(id => rolesOf(id).includes('travel'));

/** The travel levels of the classic journey (meadow → canyon → alpine → starlit); a run's crossings come from its zones (world/zones.js travelVehicles). */
export const TRAVEL_ROUTES = CLASSIC_ZONES.slice(1).map((to, i) => ({ from: CLASSIC_ZONES[i], to, vehicles: travelVehicles(CLASSIC_ZONES[i], to) }));

/** The capstone mini-game of each zone (zone id → mode): the last boss of a stage played there. */
export const CAPSTONES = Object.fromEntries(Object.values(ZONES).map(z => [z.id, z.capstone]));

export function createBattleGame(boss, { seed = 1 } = {}) {
  return (MODES[boss.mode] || runner).create(boss, { seed });
}

/** Play a boss with its mode's bot (or no input at all). */
export function playBoss(boss, { seed = 1, idle = false, bot = {} } = {}) {
  const mode = MODES[boss.mode] || runner;
  return simulate(mode.create(boss, { seed }), idle ? null : mode.bot(bot));
}

export { simulate };
