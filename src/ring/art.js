/**
 * Monsters on screen (the Ring, the ranch, the panels): the boss's own generated sprite
 * (characters/monsters.js, 48×48, the boss ramp) drawn in a palette ramp of its own so several
 * can share a screen, plus type badges and status icons.
 *
 *   const pal = ringPalette({ hero, npc, monsters: [mon, …] })   // ramp k for monster k
 *   drawMonster(s, mon, k, cx, bottom, { pose, clock, flip })
 *   typeBadge(s, x, y, type) · monsterCanvas(mon, { scale }) (HTML)
 */
import { createSurface, rect, pset, blit, ellipse, text, textWidth, poly, ring, line } from '../engine/pixel.js';
import { SLOT, BR, buildScheme, bossBaseColors, hexToRgb255 } from '../engine/palette.js';
import { generateMonster } from '../characters/monsters.js';
import { TYPES } from './monsters.js';

export const MON_SIZE = 48;
/** Up to this many monsters' ramps at once (16 colours each, from index 104). */
export const RAMP_SLOTS = 6;
const rampBase = k => 104 + k * 16;
/** Fixed colours of the Ring and the ranch (200+); the types' colours at 232+. */
export const RC = {
  SAND: 200, SAND_D: 201, FENCE: 202, FENCE_D: 203, CROWD: 204, CROWD_D: 205, SKY: 206, SKY_D: 207, GRASS: 208, GRASS_D: 209,
  BANNER: 210, BANNER2: 211, HP: 212, HP_LOW: 213, HP_BG: 214, PANEL: 215, PANEL_L: 216, XP: 217, SHIELD: 218, POISON: 219,
  FIRE: 220, ICE: 221, HEAL: 222, BARN: 223, BARN_D: 224, HILL: 225, HILL_D: 226, CLOUD: 227, SUN: 228, WATER: 229, FLOWER: 230, WOOD: 231,
};
const FIXED = {
  [RC.SAND]: '#e8c98a', [RC.SAND_D]: '#c9a46a', [RC.FENCE]: '#a8713f', [RC.FENCE_D]: '#6e4626', [RC.CROWD]: '#5a4a7a', [RC.CROWD_D]: '#3f3358',
  [RC.SKY]: '#8fd0ff', [RC.SKY_D]: '#6ab4ec', [RC.GRASS]: '#6cc04a', [RC.GRASS_D]: '#4a9a36', [RC.BANNER]: '#e84a5f', [RC.BANNER2]: '#ffd23f',
  [RC.HP]: '#5ee07a', [RC.HP_LOW]: '#ff5a5a', [RC.HP_BG]: '#2a2438', [RC.PANEL]: '#1c1730', [RC.PANEL_L]: '#2e2650', [RC.XP]: '#5ec8ff',
  [RC.SHIELD]: '#9ae6ff', [RC.POISON]: '#b86ae0', [RC.FIRE]: '#ff8a2a', [RC.ICE]: '#d6f4ff', [RC.HEAL]: '#8effa0', [RC.BARN]: '#c0443a', [RC.BARN_D]: '#8a2c26',
  [RC.HILL]: '#8fd46a', [RC.HILL_D]: '#70b452', [RC.CLOUD]: '#ffffff', [RC.SUN]: '#ffe36e', [RC.WATER]: '#5ab4ec', [RC.FLOWER]: '#ff8fc8', [RC.WOOD]: '#c08a50',
};
export const TYPE_COLOR = Object.fromEntries(Object.keys(TYPES).map((t, k) => [t, 232 + k]));

/** A palette for a screen with these monsters in ramps 0…5 (hero: the player; npc: a tamer). */
export function ringPalette({ hero = null, npc = null, monsters = [] } = {}) {
  const pal = buildScheme({ theme: 'meadow', hero, npc });
  monsters.slice(0, RAMP_SLOTS).forEach((m, k) => { if (m) bossBaseColors({ hue: m.hue, accentHue: m.accentHue }).forEach((rgb, i) => { pal[rampBase(k) + i] = rgb; }); });
  for (const [i, hex] of Object.entries(FIXED)) pal[i] = hexToRgb255(hex);
  for (const [t, i] of Object.entries(TYPE_COLOR)) pal[i] = hexToRgb255(TYPES[t].color);
  return pal;
}

const sprites = new Map();
export function monsterSprite(mon) {
  const key = `${mon.monsterSeed}|${mon.body}`;
  if (!sprites.has(key)) sprites.set(key, generateMonster(mon.monsterSeed, { role: mon.body || 'walker', size: MON_SIZE }));
  return sprites.get(key);
}
const maps = [];
function rampMap(k) {
  if (!maps[k]) { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i >= BR.LIGHT && i < BR.LIGHT + 16 ? rampBase(k) + (i - BR.LIGHT) : i; maps[k] = m; }
  return maps[k];
}
const whiteMap = (() => { const m = new Uint8Array(256); for (let i = 1; i < 256; i++) m[i] = SLOT.WHITE; return m; })();

/** A monster with its feet at (cx, bottom). pose: idle | attack | hurt | taunt. */
export function drawMonster(s, mon, k, cx, bottom, { pose = 'idle', clock = 0, flip = false, flash = false, scale = 1, shadow = true, angle = 0 } = {}) {
  const spr = monsterSprite(mon).frame({ pose, frame: Math.floor(clock * 3 + (mon.monsterSeed % 7)) });
  const bob = pose === 'idle' ? Math.round(Math.sin(clock * 3 + (mon.monsterSeed % 5)) * 1) : 0;
  if (shadow) ellipse(s, cx, bottom - 1, 15 * scale, 3 * scale, SLOT.SHADOW);
  blit(s, spr, Math.round(cx - (spr.w * scale) / 2), Math.round(bottom - spr.h * scale + bob), { flip, map: flash ? whiteMap : rampMap(k), scale, angle });
}

/** A little badge with the type's name. */
export function typeBadge(s, x, y, type) {
  const name = TYPES[type]?.name.toUpperCase() || '?';
  const w = textWidth(name) + 4;
  rect(s, x, y, w, 7, SLOT.INK);
  rect(s, x + 1, y + 1, w - 2, 5, TYPE_COLOR[type] ?? SLOT.GRAY);
  text(s, name, x + 2, y + 1, SLOT.INK);
  return w;
}

/** Tiny status icons: burn, poison, frozen, stunned, shield, taunt, buffs. */
export function statusIcon(s, x, y, kind) {
  switch (kind) {
    case 'burn': poly(s, [[x + 2, y], [x + 4, y + 3], [x + 3, y + 5], [x + 1, y + 5], [x, y + 3]], RC.FIRE); break;
    case 'poison': ellipse(s, x + 2, y + 3, 2, 2, RC.POISON); pset(s, x + 2, y, RC.POISON); break;
    case 'freeze': line(s, x, y + 2, x + 4, y + 2, RC.ICE); line(s, x + 2, y, x + 2, y + 4, RC.ICE); pset(s, x + 1, y + 1, RC.ICE); pset(s, x + 3, y + 3, RC.ICE); break;
    case 'stun': for (const [dx, dy] of [[0, 1], [2, 0], [4, 1]]) pset(s, x + dx, y + dy, SLOT.GOLD); break;
    case 'shield': ring(s, x + 2, y + 2, 2, RC.SHIELD); break;
    case 'taunt': rect(s, x + 2, y, 1, 3, SLOT.BAD); pset(s, x + 2, y + 4, SLOT.BAD); break;
    case 'up': poly(s, [[x + 2, y], [x + 4, y + 3], [x, y + 3]], RC.HP); rect(s, x + 1, y + 3, 3, 2, RC.HP); break;
    case 'down': poly(s, [[x, y + 2], [x + 4, y + 2], [x + 2, y + 5]], SLOT.BAD); rect(s, x + 1, y, 3, 2, SLOT.BAD); break;
    default: break;
  }
}

/** A monster as a <canvas> (the panels: befriending, the squad picker, the ranch's notes). */
export function monsterCanvas(mon, { scale = 2, pose = 'idle' } = {}) {
  const s = createSurface(MON_SIZE, MON_SIZE);
  s.buf.fill(0);
  drawMonster(s, mon, 0, MON_SIZE / 2, MON_SIZE - 1, { pose, shadow: false });
  const pal = ringPalette({ monsters: [mon] });
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  c.style.width = `${s.w * scale}px`; c.style.height = `${s.h * scale}px`;
  c.className = 'monster-art';
  const ctx = c.getContext('2d'), img = ctx.createImageData(s.w, s.h);
  for (let i = 0; i < s.buf.length; i++) { const v = s.buf[i]; if (!v) continue; const [r, g, b] = pal[v]; img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
