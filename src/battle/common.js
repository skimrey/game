/**
 * Shared rules for every boss-battle mini-game (see battle/index.js): the screen
 * size the games are played in, hearts, the clock, boss hit points, the palette-swap
 * step counter, keys, and the event queue the screen turns into effects.
 *
 * All games are pure and deterministic for a seed (no DOM), so they are unit-tested
 * and — at boss creation — checked by bots (a perfect player must win with time to
 * spare, an idle one must lose).
 */
import { mulberry32 } from '../levelGenerator.js';

export const SCREEN = { w: 320, h: 180 };

export const BASE_RULES = {
  hearts: 3,
  invulnerable: 1.1,    // s after losing a heart
  victoryTime: 1.2,     // s of celebration before a win is reported
};

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => ({ code: `Key${c}`, label: c }));
export const DIGITS = '0123456789'.split('').map(c => ({ code: `Digit${c}`, label: c }));

export function keyPool(kind = 'letters', exclude = []) {
  const pool = kind === 'letters+digits' ? [...LETTERS, ...DIGITS] : LETTERS;
  return pool.filter(k => !exclude.includes(k.label));
}

export const isGameKey = code => /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || code === 'Space' || /^Arrow/.test(code);
export const labelOf = code => code === 'Space' ? 'Space' : code.replace(/^Key|^Digit|^Arrow/, '');

/** The state every game shares. */
export function baseGame(boss, seed) {
  return {
    boss,
    rng: mulberry32(seed >>> 0),
    time: 0,
    timeLeft: boss.time,
    hearts: BASE_RULES.hearts,
    maxHearts: BASE_RULES.hearts,
    invulnerable: 0,
    result: 'playing',
    reason: null,
    steps: 0,              // correct actions so far: each one recolours the world
    bossHp: boss.hp,
    bossHurt: 0,           // s of hurt flash left
    bossAttack: 0,         // s of attack pose left
    victory: 0,
    stats: { good: 0, wrong: 0, hits: 0, hurt: 0 },
    events: [],
    held: new Set(),       // keys held down (event.code) — for games you steer
    /** A key came up (the screen tracks held keys; games may react). */
    release(code) { this.held.delete(code); },
    /** Events since the last call: { type: good | wrong | hurt | bossHit | bossDefeated | … }. */
    drain() {
      const out = this.events;
      this.events = [];
      return out;
    },
  };
}

/** A correct action: one palette step. */
export function good(g, extra = {}) {
  g.steps++;
  g.stats.good++;
  g.events.push({ type: 'good', step: g.steps, ...extra });
}

export function wrong(g, extra = {}) {
  g.stats.wrong++;
  g.events.push({ type: 'wrong', ...extra });
}

/** The hero takes a hit (ignored while blinking). Returns true if it landed. */
export function hurt(g, extra = {}) {
  if (g.invulnerable > 0 || g.result !== 'playing' || g.victory > 0) return false;
  g.hearts--;
  g.stats.hurt++;
  g.invulnerable = BASE_RULES.invulnerable;
  g.events.push({ type: 'hurt', hearts: g.hearts, ...extra });
  if (g.hearts <= 0) { g.result = 'lost'; g.reason = 'hearts'; }
  return true;
}

export function heal(g) {
  if (g.hearts >= g.maxHearts) return false;
  g.hearts++;
  g.events.push({ type: 'heal', hearts: g.hearts });
  return true;
}

/** The boss takes `n` hits. */
export function hitBoss(g, n = 1) {
  if (g.bossHp <= 0) return;
  g.bossHp = Math.max(0, g.bossHp - n);
  g.bossHurt = 0.3;
  g.stats.hits++;
  g.events.push({ type: 'bossHit', hp: g.bossHp });
  if (g.bossHp === 0) {
    g.victory = BASE_RULES.victoryTime;
    g.events.push({ type: 'bossDefeated' });
  }
}

/**
 * The shared part of a step. Returns 'play' when the game should run its own rules
 * this step, 'celebrate' during the victory lap, or 'over'.
 */
export function tick(g, dt) {
  if (g.result !== 'playing') return 'over';
  g.time += dt;
  if (g.victory > 0) {
    g.victory -= dt;
    if (g.victory <= 0) g.result = 'won';
    return 'celebrate';
  }
  g.timeLeft = Math.max(0, g.timeLeft - dt);
  g.invulnerable = Math.max(0, g.invulnerable - dt);
  g.bossHurt = Math.max(0, g.bossHurt - dt);
  g.bossAttack = Math.max(0, g.bossAttack - dt);
  if (g.timeLeft <= 0) { g.result = 'lost'; g.reason = 'time'; return 'over'; }
  return 'play';
}

export function pickKey(rng, pool, avoid = []) {
  const options = pool.filter(k => !avoid.includes(k.code));
  const list = options.length ? options : pool;
  return list[Math.floor(rng() * list.length)];
}

export function weighted(rng, weights) {
  const entries = Object.entries(weights);
  let roll = rng() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) if ((roll -= w) <= 0) return k;
  return entries[0][0];
}

/** −1 / 0 / +1 from held keys: left (← A) and right (→ D) by default. */
export function axis(g, neg = ['ArrowLeft', 'KeyA'], pos = ['ArrowRight', 'KeyD']) {
  return (pos.some(k => g.held.has(k)) ? 1 : 0) - (neg.some(k => g.held.has(k)) ? 1 : 0);
}
export const UP_KEYS = ['ArrowUp', 'KeyW'];
export const DOWN_KEYS = ['ArrowDown', 'KeyS'];

/** Hold exactly these direction keys (bots). */
export function steerTo(g, dir) {
  for (const k of ['ArrowLeft', 'ArrowRight']) g.held.delete(k);
  if (dir < 0) g.held.add('ArrowLeft');
  if (dir > 0) g.held.add('ArrowRight');
}

/** Direction keys: arrows and WASD. */
export function directionOf(code) {
  return { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[code] || null;
}

/**
 * Run a game with a policy until it ends (tests and boss checks).
 * policy(game, dt) is called before every step and may press keys / click.
 */
export function simulate(game, policy, { dt = 1 / 120, limit = 600 } = {}) {
  while (game.result === 'playing' && game.time < limit) {
    policy?.(game, dt);
    game.step(dt);
    game.drain();
  }
  return game;
}
