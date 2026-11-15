/**
 * The mini-games. Every level ends with a boss game (after the gem); some levels also
 * have an arcade checkpoint halfway, with a checkpoint game (win it to save your
 * progress there and refill your hearts). A run mixes them so that no game shows up
 * more than three times (see encounters.js), and each time a game comes back it's a
 * notch harder.
 *
 *   boss games        runner (Key Jump) · echo (Copycat) · quickdraw (Quick Draw) · sled (Avalanche Run)
 *                     starbeat (Star Beat) · tennis (Tennis Match) · invaders (Star Invaders)
 *                     fireball (Spellslinger) · breakout (Brick Breaker) · cannon (Cannon Duel)
 *   either            whack (Whack-a-Critter) · fishing (Gone Fishing) · maze (Maze Muncher)
 *   checkpoint games  doodle (Cloud Hop) · flappy (Flap Dash) · tetris (Block Drop) · frogger (Road Hop)
 *                     lander (Moon Lander)
 *   travel levels     raft (River Raft) · minecart (Mine Cart) · snowmobile (Snowmobile) · plane (Biplane)
 *
 * Region capstones (the last level of each region): meadow → Copycat, canyon → Quick
 * Draw, alpine → Avalanche Run, starlit → Star Invaders.
 *
 * Each game: { id, name, controls, checkpoint?, rules(boss) → [html], create(boss, { seed }) → game,
 * bot(options) → policy(game, dt) }. A game has press(code), release(code), step(dt), drain(),
 * held (keys down), result ('playing' | 'won' | 'lost'), reason, hearts, timeLeft, bossHp (for
 * checkpoint games: progress still to make), steps (palette step), stats; some also click(x, y).
 */
import { runner } from './runner.js';
import { echo } from './echo.js';
import { quickdraw } from './quickdraw.js';
import { sled } from './sled.js';
import { starbeat } from './starbeat.js';
import { tennis } from './tennis.js';
import { invaders } from './invaders.js';
import { fireball } from './fireball.js';
import { doodle } from './doodle.js';
import { flappy } from './flappy.js';
import { tetris } from './tetris.js';
import { breakout } from './breakout.js';
import { cannon } from './cannon.js';
import { whack } from './whack.js';
import { fishing } from './fishing.js';
import { maze } from './maze.js';
import { frogger } from './frogger.js';
import { lander } from './lander.js';
import { raft } from './raft.js';
import { minecart } from './minecart.js';
import { snowmobile } from './snowmobile.js';
import { plane } from './plane.js';
import { simulate } from './common.js';

export const MODES = {
  runner, echo, quickdraw, sled, starbeat, tennis, invaders, fireball, breakout, cannon,
  whack, fishing, maze,
  doodle, flappy, tetris, frogger, lander,
  raft, minecart, snowmobile, plane,
};
/** What a game can be: a level's boss, an arcade checkpoint, or a travel level between regions. */
export const rolesOf = id => MODES[id].roles || (MODES[id].travel ? ['travel'] : MODES[id].checkpoint ? ['checkpoint'] : ['boss']);
export const BOSS_GAMES = Object.keys(MODES).filter(id => rolesOf(id).includes('boss'));
export const CHECKPOINT_GAMES = Object.keys(MODES).filter(id => rolesOf(id).includes('checkpoint'));
export const TRAVEL_GAMES = Object.keys(MODES).filter(id => rolesOf(id).includes('travel'));

/** The travel levels between regions, and the vehicles that fit each crossing. */
export const TRAVEL_ROUTES = [
  { from: 'meadow', to: 'canyon', vehicles: ['raft', 'plane'] },
  { from: 'canyon', to: 'alpine', vehicles: ['minecart', 'plane'] },
  { from: 'alpine', to: 'starlit', vehicles: ['snowmobile', 'plane'] },
];

/** The capstone mini-game of each region (tier id → mode). */
export const CAPSTONES = { meadow: 'echo', canyon: 'quickdraw', alpine: 'sled', starlit: 'invaders' };

export function createBattleGame(boss, { seed = 1 } = {}) {
  return (MODES[boss.mode] || runner).create(boss, { seed });
}

/** Play a boss with its mode's bot (or no input at all). */
export function playBoss(boss, { seed = 1, idle = false, bot = {} } = {}) {
  const mode = MODES[boss.mode] || runner;
  return simulate(mode.create(boss, { seed }), idle ? null : mode.bot(bot));
}

export { simulate };
