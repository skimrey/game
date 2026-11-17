/**
 * Drawing the battles: one scene per mini-game, the HUD and pixel particles — all
 * into the indexed 320×180 screen (engine/pixel.js). Colours are palette indices, so the
 * palette swap after every correct key recolours everything drawn here.
 *
 *   const view = createView({ boss, design, seed });
 *   drawBattle(view, game, { phase, countdown, clock });
 */
import { createHeroSheet } from '../../characters/heroSprite.js';
import { generateMonster } from '../../characters/monsters.js';
import { FX, NPC_MAP, SLOT, ST } from '../../engine/palette.js';
import { blit, clear, createSurface, ellipse, hline, pset, rect, solidMap, text, textWidth } from '../../engine/pixel.js';
import { createLandscape, createSnowField, heartSprite } from './art.js';
import { SCREEN } from './common.js';
import { SNOWMOBILE } from '../snowmobile/rules.js';
import { hashSeed } from '../../levels/generator.js';

export const W = SCREEN.w, H = SCREEN.h;

export const WHITE = solidMap(SLOT.WHITE);

export const INK = solidMap(SLOT.INK);

export const BOSS_SIZE = 48;

export function createView({ boss, design, seed = 1 }) {
  return {
    screen: createSurface(W, H),
    hero: createHeroSheet(design),
    monster: generateMonster(boss.monsterSeed ?? seed, { role: boss.role || 'walker', size: BOSS_SIZE }),
    npc: boss.npc ? createHeroSheet({ ...boss.npc.design, silly: boss.npc.face }) : null,
    npcMap: boss.npc ? NPC_MAP : null,
    small: boss.mode === 'bomber' ? generateMonster(boss.monsterSeed ?? seed, { role: boss.role || 'walker', size: 24 }) : null,
    minion: generateMonster(hashSeed(boss.monsterSeed ?? seed, 'minion'), { role: 'flyer', size: 20, ramp: 'minion' }),
    land: createLandscape(boss.mode === 'lander' ? 'starlit' : boss.theme || 'meadow', hashSeed(seed, 'land')),
    snow: boss.mode === 'sled' ? createSnowField(hashSeed(seed, 'snow')) : null,
    particles: [],
    shake: 0,
    flash: 0,
  };
}

// ---------------------------------------------------------------------------
// Particles (fireworks, puffs, snow)
// ---------------------------------------------------------------------------
export function burst(view, x, y, { n = 18, speed = 90, life = 0.7, colors = [FX.A, FX.B, FX.C, FX.D], gravity = 160 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = speed * (0.45 + Math.random() * 0.7);
    view.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: life * (0.6 + Math.random() * 0.5), c: colors[i % colors.length], g: gravity });
  }
}

export function updateParticles(view, dt) {
  for (const p of view.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.t -= dt; }
  view.particles = view.particles.filter(p => p.t > 0 && p.y < H + 4);
  if (view.particles.length > 400) view.particles.splice(0, view.particles.length - 400);
}

function drawParticles(s, view) {
  for (const p of view.particles) rect(s, p.x, p.y, p.t > 0.25 ? 2 : 1, p.t > 0.25 ? 2 : 1, p.c);
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
/** The boss sprite with its bob, hurt flash and attack pose; (cx, bottom) anchor. */
export function drawBoss(s, view, g, cx, bottom, { clock, flip = false, lift = 0, angle = 0, squash = 0, shadow = true } = {}) {
  const m = view.monster;
  const pose = g.bossHp <= 0 ? 'hurt' : g.bossHurt > 0 ? 'hurt' : g.taunt > 0 ? 'taunt' : g.bossAttack > 0 ? 'attack' : 'idle';
  const spr = m.frame({ pose, frame: Math.floor(clock * 3) });
  const bob = Math.round(Math.sin(clock * 3) * 1.5);
  const map = g.bossHurt > 0 && Math.floor(clock * 20) % 2 ? WHITE : null;
  // a shadow on the ground
  if (shadow && lift < 30) ellipse(s, cx, bottom - 1, 16 - lift * 0.2, 3, ST.GROUND2);
  if (squash) {
    // squash: drop rows (nearest neighbour)
    const h = Math.round(spr.h * (1 - squash));
    for (let j = 0; j < h; j++) {
      const sj = Math.floor(j / h * spr.h);
      for (let i = 0; i < spr.w; i++) {
        let c = spr.buf[sj * spr.w + (flip ? spr.w - 1 - i : i)];
        if (!c) continue;
        if (map) c = map[c];
        pset(s, cx - spr.w / 2 + i, bottom - h + j + bob, c);
      }
    }
    return;
  }
  blit(s, spr, cx - spr.w / 2, bottom - spr.h - lift + bob, { flip, map, angle });
}

function drawHud(s, g, boss, clock) {
  // hearts
  rect(s, 3, 3, g.maxHearts * 9 + 5, 11, SLOT.PANEL);
  for (let i = 0; i < g.maxHearts; i++) blit(s, heartSprite(i < g.hearts), 5 + i * 9, 5);
  // the clock
  const secs = Math.ceil(g.timeLeft);
  rect(s, W / 2 - 14, 2, 28, 14, SLOT.PANEL);
  text(s, String(secs), W / 2, 4, secs <= 10 && Math.floor(clock * 4) % 2 ? SLOT.BAD : SLOT.WHITE, { scale: 2, align: 'center' });
  // boss health — or, for a checkpoint challenge, progress toward the goal
  const bw = 86, bx = W - bw - 5;
  rect(s, bx - 2, 2, bw + 4, 17, SLOT.PANEL);
  let name = boss.kind === 'checkpoint' ? `GOAL ${boss.hp - g.bossHp}/${boss.hp}` : boss.kind === 'travel' ? `TRIP ${Math.round((1 - g.bossHp / boss.hp) * 100)}%`
    : g.mode === 'delve' && g.room < g.rooms.length - 1 ? `ROOM ${g.room + 1} OF ${g.rooms.length}` : boss.name;
  const full = g.totalHp || boss.hp;           // (a delve: every foe's health added up)
  while (textWidth(name) > bw && name.length > 4) name = name.slice(0, -1);
  text(s, name, bx, 4, SLOT.WHITE);
  if (boss.kind === 'checkpoint' || boss.kind === 'travel') {
    rect(s, bx, 11, bw, 5, SLOT.DARK);
    rect(s, bx, 11, Math.round(bw * (1 - g.bossHp / boss.hp)), 5, SLOT.CYAN);
  } else {
    rect(s, bx, 11, bw, 5, SLOT.RED_DARK);
    rect(s, bx, 11, Math.round(bw * (g.bossHp / full)), 5, SLOT.RED);
    hline(s, bx, bx + Math.round(bw * (g.bossHp / full)) - 1, 11, SLOT.BAD);
  }
}

/** Big centred text with an ink shadow. */
export function banner(s, str, y, c = SLOT.WHITE, scale = 3) {
  text(s, str, W / 2, y, c, { scale, align: 'center', shadow: SLOT.INK });
}

/** The boss at half size (cached per pose / frame). */
export function halfSprite(view, pose, frameIndex) {
  view.halves ||= new Map();
  const key = `${pose}|${frameIndex % 2}`;
  if (!view.halves.has(key)) {
    const spr = view.monster.frame({ pose, frame: frameIndex });
    const out = createSurface(spr.w / 2, spr.h / 2);
    for (let j = 0; j < out.h; j++) for (let i = 0; i < out.w; i++) out.buf[j * out.w + i] = spr.buf[(j * 2) * spr.w + i * 2] || spr.buf[(j * 2 + 1) * spr.w + i * 2 + 1];
    view.halves.set(key, out);
  }
  return view.halves.get(key);
}

/** Blit a sprite but cut it off below a line (a critter poking out of a hole). */
export function blitClip(s, spr, x, y, clipY, { map = null } = {}) {
  for (let j = 0; j < spr.h; j++) {
    const yy = Math.round(y) + j;
    if (yy >= clipY || yy < 0 || yy >= H) continue;
    for (let i = 0; i < spr.w; i++) {
      let c = spr.buf[j * spr.w + i];
      if (!c) continue;
      if (map) c = map[c];
      pset(s, x + i, yy, c);
    }
  }
}

/** A sprite at half size (nearest neighbour), for the maze. */
export function blitHalf(s, spr, x, y) {
  for (let j = 0; j < spr.h; j += 2) for (let i = 0; i < spr.w; i += 2) {
    const c = spr.buf[j * spr.w + i] || spr.buf[j * spr.w + i + 1] || spr.buf[(j + 1) * spr.w + i];
    if (c) pset(s, x + i / 2, y + j / 2, c);
  }
}

// ---------------------------------------------------------------------------
/** Each game's scene (games/<id>/draw.js), registered by the registry (games/index.js). */
const SCENES = {};
export function registerScenes(map) { Object.assign(SCENES, map); }

/**
 * Just the HUD (for the 3D journeys — games/kit/travel3d.js draws the world): hearts, the clock, the
 * trip, the speed / fuel gauges, the countdown — on a see-through screen (index 0).
 */
export function drawBattleHud(view, g, o) {
  const s = view.screen;
  clear(s, 0);
  if (o.phase !== 'intro') drawHud(s, g, g.boss, o.clock);
  if (g.mode === 'snowmobile') {
    rect(s, 6, H - 16, 54, 8, SLOT.PANEL); rect(s, 8, H - 14, 50, 4, SLOT.DARK);
    rect(s, 8, H - 14, 50 * g.speed / SNOWMOBILE.maxSpeed, 4, g.crevasses.some(c => c.x > g.x && c.x - g.x < 260) && g.speed < 170 ? SLOT.BAD : SLOT.CYAN);
    text(s, 'SPEED', 8, H - 24, SLOT.WHITE, { shadow: SLOT.INK });
    if (g.crevasses.some(c => c.x > g.x && c.x - g.x < 260) && g.speed < 170 && Math.floor(o.clock * 4) % 2) text(s, 'CREVASSE AHEAD: SPEED UP!', W / 2, 30, SLOT.BAD, { align: 'center', shadow: SLOT.INK });
  } else if (g.mode === 'plane') {
    rect(s, 6, H - 16, 48, 8, SLOT.PANEL); rect(s, 8, H - 14, 44, 4, SLOT.DARK); rect(s, 8, H - 14, 44 * Math.min(1, g.fuel / 12), 4, g.fuel < 3 ? SLOT.BAD : SLOT.GOLD);
    text(s, 'FUEL', 8, H - 24, SLOT.WHITE, { shadow: SLOT.INK });
  }
  if (o.phase === 'countdown') banner(s, o.countdown > 0.25 ? String(Math.ceil(o.countdown)) : 'GO!', H / 2 - 14, SLOT.WHITE, 5);
  if (g.victory > 0 && g.result === 'playing') banner(s, 'ARRIVED!', H / 2 - 30, SLOT.GOLD, 4);
  if (o.fps) { rect(s, 2, H - 9, textWidth(`${o.fps} FPS`) + 4, 8, SLOT.PANEL); text(s, `${o.fps} FPS`, 4, H - 8, SLOT.CYAN); }
  return s;
}

/**
 * Draw a frame. o: { phase: 'intro' | 'countdown' | 'playing' | 'paused' | 'over', countdown, clock }
 */
export function drawBattle(view, g, o) {
  const s = view.screen;
  clear(s, ST.SKY0);
  (SCENES[g.mode] || SCENES.runner)(s, view, g, o);
  drawParticles(s, view);
  if (o.phase !== 'intro') drawHud(s, g, g.boss, o.clock);
  if (o.phase === 'countdown') banner(s, o.countdown > 0.25 ? String(Math.ceil(o.countdown)) : 'GO!', H / 2 - 14, SLOT.WHITE, 5);
  if (g.victory > 0 && g.result === 'playing') banner(s, 'K.O.!', H / 2 - 30, SLOT.GOLD, 5);
  if (o.fps) { rect(s, 2, H - 9, textWidth(`${o.fps} FPS`) + 4, 8, SLOT.PANEL); text(s, `${o.fps} FPS`, 4, H - 8, SLOT.CYAN); }
  return s;
}
