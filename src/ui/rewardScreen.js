/**
 * The reward stage between levels — retro 2D, like the battles (no 3D model): the
 * hero on a pedestal in the region's landscape, the won item floating on a second
 * pedestal (sparkling), the defeated boss in the background seeing stars. When the
 * boss got away, it gloats instead.
 *
 *   const reward = createRewardScreen();
 *   reward.show({ design, boss, item, won, seed });
 *   reward.setDesign(design);     // e.g. after "Wear it"
 *   reward.hide();
 *
 * The item alone is cut out of the hero sprite: paint the hero with and without it,
 * keep the pixels that differ — so every unlockable gets pedestal art for free.
 */
import { createSurface, clear, blit, rect, ellipse, pset, outline, present, text, hline } from '../engine/pixel.js';
import { buildScheme, packPalette, heroBaseColors, bossBaseColors, minionBaseColors, pixelColors, SLOT, ST, FX } from '../engine/palette.js';
import { TRAIL_STYLES } from '../characters/trails.js';
import { paintHero, createHeroSheet, HERO_W, HERO_H } from '../characters/heroSprite.js';
import { generateMonster } from '../characters/monsters.js';
import { createLandscape, drawLandscape } from '../games/kit/art.js';
import { SCREEN } from '../games/kit/common.js';
import { hashSeed } from '../levels/generator.js';
import { fitPixelCanvas } from '../engine/pixelFit.js';
import { paintPet, petBaseColors, PET_W, PET_H } from '../characters/pets.js';

const W = SCREEN.w, H = SCREEN.h, G = 118;      // high ground line: the card sits over the bottom
const MIN_FRAME_MS = 1000 / 32;       // a calm scene: ~30 frames a second is plenty

/** The pixels an item adds to the hero (front view), as an outlined sprite (trails: a sparkly swoosh). */
export function itemSprite(design, item, view = 'front') {
  if (item.slot === 'trail') {
    const colors = pixelColors(TRAIL_STYLES[item.value]?.pixels);
    const out = createSurface(HERO_W, HERO_H);
    for (let i = 0; i < 16; i++) {
      const t = i / 15, x = 3 + t * (HERO_W - 6), y = HERO_H * 0.7 - Math.sin(t * Math.PI) * HERO_H * 0.45;
      const c = colors[i % colors.length], r = i % 3 === 0 ? 1.6 : 0.9;
      ellipse(out, x, y, r + 0.5, r + 0.5, c);
      if (i % 4 === 0) { pset(out, x, y - 3, c); pset(out, x, y + 3, c); pset(out, x - 3, y, c); pset(out, x + 3, y, c); }
    }
    return outline(out, SLOT.INK);
  }
  const without = { ...design, [item.slot]: item.slot === 'back' || item.slot === 'extra' || item.slot === 'hat' ? 'none' : design[item.slot] };
  if (item.slot === 'top') without.top = 'tee';
  if (item.slot === 'shoes') without.shoes = 'sneakers';
  const a = paintHero({ ...design, [item.slot]: item.value }, item.slot === 'back' ? 'back' : view, 'idle');
  const b = paintHero(without, item.slot === 'back' ? 'back' : view, 'idle');
  const out = createSurface(a.w, a.h);
  for (let i = 0; i < a.buf.length; i++) if (a.buf[i] !== b.buf[i] && a.buf[i] !== SLOT.INK) out.buf[i] = a.buf[i];
  // keep the shapes whole: the clothing colour pixels that touch what differs
  return outline(out, SLOT.INK);
}

export function createRewardScreen({ parent = document.querySelector('main') || document.body } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.className = 'reward-canvas';
  canvas.hidden = true;
  canvas.setAttribute('aria-hidden', 'true');
  parent.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  fitPixelCanvas(canvas);
  const target = { ctx, image: null };
  const screen = createSurface(W, H);
  let state = null;

  function frame(now) {
    if (!state) return;
    state.raf = requestAnimationFrame(frame);
    if (state.lastDraw && now - state.lastDraw < MIN_FRAME_MS) return;
    const dt = state.lastDraw ? Math.min(0.1, (now - state.lastDraw) / 1000) : 0;
    state.lastDraw = now;
    state.clock += dt;
    draw(dt);
    present(screen, state.palette, target);
  }

  function draw(dt) {
    const t = state.clock;
    clear(screen, ST.SKY0);
    drawLandscape(screen, state.land, t * 3, t, G);
    // the boss in the background: dizzy (won) or gloating (lost)
    const boss = state.monster.frame({ pose: state.won ? 'hurt' : 'attack', frame: Math.floor(t * 2) });
    blit(screen, boss, 262 - boss.w / 2, G - boss.h + 2 + Math.round(Math.sin(t * 2)));
    if (state.won) for (let i = 0; i < 3; i++) {                 // stars circling its head
      const a = t * 3 + i * 2.1;
      pset(screen, 262 + Math.cos(a) * 14, G - boss.h + 4 + Math.sin(a) * 4, SLOT.GOLD);
      pset(screen, 263 + Math.cos(a) * 14, G - boss.h + 4 + Math.sin(a) * 4, SLOT.GOLD);
    }
    // pedestals
    const heroX = 112, itemX = 186;
    for (const [x, w] of [[heroX, 38], [itemX, 30]]) {
      rect(screen, x - w / 2, G - 14, w, 14, SLOT.DARK);
      rect(screen, x - w / 2 - 2, G - 16, w + 4, 3, SLOT.GRAY);
      hline(screen, x - w / 2, x + w / 2 - 1, G - 8, SLOT.SHADOW);
    }
    // the hero, big (with its trail, if it wears one)
    const trail = TRAIL_STYLES[state.design.trail];
    if (trail) {
      const colors = pixelColors(trail.pixels);
      for (let i = 0; i < 10; i++) {
        const a = t * 2 + i * 0.63, x = heroX - 20 + ((i * 13 + t * 14) % 40), y = G - 30 - ((i * 17 + t * 22) % 60);
        pset(screen, x, y, colors[i % colors.length]);
        if ((i + Math.floor(a * 3)) % 3 === 0) { pset(screen, x - 1, y, colors[i % colors.length]); pset(screen, x + 1, y, colors[i % colors.length]); }
      }
    }
    const hero = state.sheet.get('front', state.won ? (Math.floor(t * 1.5) % 4 === 0 ? 'cheer' : 'idle') : 'idle', 0, Math.floor(t * 8) % 4);
    blit(screen, hero, heroX - HERO_W, G - 16 - HERO_H * 2, { scale: 2 });
    // your pet sits at the foot of the pedestal (cheering when you won)
    if (state.pet) {
      const pose = state.won ? (Math.floor(t * 2) % 3 === 0 ? 'cheer' : 'sit') : 'hide';
      const hop = pose === 'cheer' ? Math.round(Math.abs(Math.sin(t * 8)) * 3) : 0;
      blit(screen, paintPet(state.pet, pose, Math.floor(t * 3) % 2), heroX - 46 - PET_W, G - PET_H * 2 - hop, { scale: 2 });
    }
    // the item, floating and bobbing, sparkling
    if (state.item) {
      const spr = state.itemArt;
      const bob = Math.round(Math.sin(t * 2.5) * 3);
      let minX = spr.w, minY = spr.h, maxX = 0, maxY = 0;
      for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) if (spr.buf[y * spr.w + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
      const k = Math.max(2, Math.min(5, Math.floor(30 / Math.max(1, maxX - minX + 1, maxY - minY + 1))));   // small items get bigger
      ellipse(screen, itemX, G - 46 + bob, 21, 21, ST.CLOUD1);
      ellipse(screen, itemX, G - 46 + bob, 18, 18, ST.CLOUD0);
      blit(screen, spr, itemX - cx * k, G - 46 + bob - cy * k, { scale: k });
      for (let i = 0; i < 5; i++) {
        const a = t * 1.7 + i * 1.256, r = 22 + Math.sin(t * 3 + i) * 3;
        const x = itemX + Math.cos(a) * r, y = G - 46 + bob + Math.sin(a) * r * 0.8;
        pset(screen, x, y, FX.SPARK); if ((i + Math.floor(t * 6)) % 2) { pset(screen, x - 1, y, FX.SPARK); pset(screen, x + 1, y, FX.SPARK); pset(screen, x, y - 1, FX.SPARK); pset(screen, x, y + 1, FX.SPARK); }
      }
      text(screen, 'NEW!', itemX, G - 76 + bob, SLOT.GOLD, { scale: 2, align: 'center', shadow: SLOT.INK });
    } else if (!state.won) {
      text(screen, '?', itemX, G - 58, SLOT.GRAY, { scale: 4, align: 'center', shadow: SLOT.INK });
    }
  }

  function repaint() {
    state.sheet = createHeroSheet(state.design);
    state.itemArt = state.item ? itemSprite(state.design, state.item) : null;
    state.palette = packPalette(buildScheme({ theme: state.theme, hero: heroBaseColors(state.design), boss: bossBaseColors({ hue: state.boss.hue, accentHue: state.boss.accentHue }), minion: minionBaseColors({ hue: state.boss.minionHue ?? 0 }), pet: state.pet ? petBaseColors(state.pet) : null }));
  }

  return {
    get open() { return !!state; },
    show({ design, boss, item = null, won = true, seed = 1, pet = null }) {
      if (state) cancelAnimationFrame(state.raf);
      state = {
        design, boss, item, won, pet, theme: boss.theme || 'meadow', clock: 0, lastDraw: 0, raf: 0,
        land: createLandscape(boss.theme || 'meadow', hashSeed(seed, 'reward')),
        monster: generateMonster(boss.monsterSeed ?? seed, { role: boss.role || 'walker', size: 48 }),
      };
      repaint();
      canvas.hidden = false;
      state.raf = requestAnimationFrame(frame);
    },
    /** The hero changed (e.g. put the item on). */
    setDesign(design) {
      if (!state) return;
      state.design = design;
      repaint();
    },
    hide() {
      if (state) cancelAnimationFrame(state.raf);
      state = null;
      canvas.hidden = true;
    },
  };
}
