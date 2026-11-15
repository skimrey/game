import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurface, rect, blit, outline, text, textWidth, present, toRGBA, ellipse, solidMap } from '../src/pixel.js';
import { buildScheme, checkScheme, heroBaseColors, bossBaseColors, minionBaseColors, hueShift, THEME_NAMES, SLOT, HR, rgbToHsl } from '../src/palette.js';
import { paintHero, createHeroSheet, HERO_W, HERO_H } from '../src/heroSprite.js';
import { generateMonster, monsterRecipe, checkMonster, ROLES } from '../src/monsters.js';
import { itemSprite } from '../src/rewardScreen.js';
import { createView, drawBattle } from '../src/battle/draw.js';
import { MODES } from '../src/battle/index.js';
import { makeBoss, bossStats } from '../src/bosses.js';
import { DEFAULT_CHARACTERS, STYLE_OPTIONS, UNLOCKABLES, normalizeCharacter, randomCharacter } from '../src/character.js';
import { mulberry32 } from '../src/levelGenerator.js';

const opaque = s => s.buf.reduce((n, c) => n + (c ? 1 : 0), 0);

test('pixel engine: rects clip, sprites blit with transparency, flips and rotation, text, outline', () => {
  const s = createSurface(20, 10);
  rect(s, -5, -5, 10, 10, 3);
  assert.equal(opaque(s), 25);
  const spr = createSurface(3, 2);
  spr.buf.set([1, 0, 2, 0, 0, 0]);
  blit(s, spr, 10, 5, { flip: true });
  assert.equal(s.buf[5 * 20 + 10], 2);
  assert.equal(s.buf[5 * 20 + 11], 0, 'index 0 is see-through');
  assert.equal(s.buf[5 * 20 + 12], 1);
  const rotated = createSurface(20, 20);
  const bar = createSurface(6, 2); bar.buf.fill(4);
  blit(rotated, bar, 7, 9, { angle: Math.PI / 2 });
  assert.equal(opaque(rotated), 12, 'a quarter turn keeps every pixel');
  const o = createSurface(5, 5); o.buf[12] = 9;
  outline(o, 1);
  assert.equal(opaque(o), 5);
  const t = createSurface(40, 8);
  text(t, 'AB12', 0, 0, 2);
  assert.equal(textWidth('AB12'), 15);
  assert.ok(opaque(t) > 20);
  // present: palette indices → RGBA words (a fake canvas context)
  const image = { data: new Uint8ClampedArray(40 * 8 * 4) };
  let put = 0;
  present(t, new Uint32Array(256).fill(0xff0000ff), { ctx: { createImageData: () => image, putImageData: () => put++ }, image: null });
  assert.equal(put, 1);
  assert.equal(image.data[0], 255);
});

test('palettes: every region stays readable at every recolour step, and every step is a new hue', () => {
  const hero = heroBaseColors(DEFAULT_CHARACTERS[0]);
  for (const theme of THEME_NAMES) {
    let lastSky = null;
    for (let step = 0; step < 60; step++) {
      const pal = buildScheme({ theme, hero, boss: bossBaseColors({ hue: 40 }), minion: minionBaseColors({ hue: 200 }), step });
      const check = checkScheme(pal);
      assert.ok(check.ok, `${theme} step ${step}: ${check.issues}`);
      const sky = rgbToHsl(pal[16])[0];
      if (lastSky !== null && step > 1) {
        const d = Math.abs(((sky - lastSky + 540) % 360) - 180);
        assert.ok(d > 60, `${theme} step ${step}: the sky hue moved only ${d.toFixed(0)}°`);
      }
      lastSky = sky;
    }
  }
  // step 0 is the hero's own colours; the UI colours never change
  const p0 = buildScheme({ theme: 'meadow', hero, step: 0 }), p5 = buildScheme({ theme: 'meadow', hero, step: 5 });
  assert.deepEqual(p0[HR.TOP], hero[HR.TOP - SLOT.HERO]);
  assert.notDeepEqual(p5[HR.TOP], p0[HR.TOP]);
  for (let i = 1; i < 16; i++) assert.deepEqual(p5[i], p0[i]);
  assert.equal(hueShift(0), 0);
});

test('hero sprites: every option of the editor is drawn, in every view and pose, inside the sprite', () => {
  const views = { side: ['idle', 'run', 'jump', 'fall', 'stumble', 'hurt', 'sit'], front: ['idle', 'up', 'down', 'left', 'right', 'dance', 'aim', 'cheer'], back: ['idle', 'sit'] };
  const base = DEFAULT_CHARACTERS[0];
  for (const [slot, options] of Object.entries(STYLE_OPTIONS)) {
    for (const [value] of options) {
      const design = normalizeCharacter({ ...base, [slot]: value });
      for (const [view, poses] of Object.entries(views)) {
        for (const pose of poses) {
          const spr = paintHero(design, view, pose, 0, 0.3);
          assert.equal(spr.w, HERO_W);
          assert.ok(opaque(spr) > 120, `${slot}=${value} ${view}/${pose} is drawn`);
          // the outline keeps the figure off the sprite's edge (except the feet line)
          for (let y = 0; y < HERO_H - 1; y++) for (const x of [0, HERO_W - 1]) assert.equal(spr.buf[y * HERO_W + x] === 0 || spr.buf[y * HERO_W + x] === SLOT.INK, true, `${slot}=${value} ${view}/${pose} touches the edge at ${x},${y}`);
        }
      }
    }
  }
  // options look different from each other (front or side)
  for (const [slot, options] of Object.entries(STYLE_OPTIONS)) {
    if (slot === 'extra' && options.length === 1) continue;
    if (slot === 'trail') continue;                    // trails are particles, not part of the sprite
    const looks = new Set(options.map(([value]) => {
      const d = normalizeCharacter({ ...base, [slot]: value });
      return ['side', 'front', 'back'].map(v => paintHero(d, v, 'idle').buf.join('')).join('|');
    }));
    assert.equal(looks.size, options.length, `${slot}: every option has its own look`);
  }
  const sheet = createHeroSheet(base);
  assert.equal(sheet.get('side', 'run', 1), sheet.get('side', 'run', 1), 'frames are cached');
});

test('every unlockable has pedestal art (cut out of the hero sprite)', () => {
  for (const item of UNLOCKABLES) {
    const art = itemSprite(DEFAULT_CHARACTERS[1], item);
    assert.ok(opaque(art) >= 8, `${item.id}: ${opaque(art)} px`);
  }
});

test('monsters: every seed gives a checked, symmetric-ish creature; seeds differ; roles shape the body', () => {
  for (const role of Object.keys(ROLES)) {
    const recipes = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const m = generateMonster(seed * 7919, { role });
      assert.ok(m.tries < 40, `${role} ${seed}: needed the fallback`);
      for (const pose of ['idle', 'attack', 'hurt']) {
        const spr = m.frame({ pose, frame: seed });
        const check = checkMonster(spr);
        if (pose !== 'hurt') assert.ok(check.ok, `${role} ${seed} ${pose}: ${check.issues}`);
      }
      recipes.add(JSON.stringify({ ...m.recipe, seed: 0 }));
      if (role === 'flyer') assert.equal(m.recipe.limbs, 'wings');
    }
    assert.ok(recipes.size >= 55, `${role}: ${recipes.size} different recipes of 60`);
  }
  // minions (small) pass too
  for (let seed = 1; seed <= 40; seed++) assert.ok(generateMonster(seed, { role: 'flyer', size: 20, ramp: 'minion' }).tries < 40);
  // the checks catch broken sprites
  const blob = createSurface(48, 48); ellipse(blob, 24, 24, 4, 4, 49);
  assert.equal(checkMonster(blob).ok, false);
  assert.deepEqual(monsterRecipe(5, 'walker'), monsterRecipe(5, 'walker'));
});

test('every battle scene draws without errors in all regions, from the intro to the victory lap', () => {
  const design = randomCharacter(mulberry32(3));
  for (const mode of Object.keys(MODES)) {
    for (const tier of ['meadow', 'canyon', 'alpine', 'starlit']) {
      const boss = makeBoss({ runSeed: 9, index: 6, tier, mode, check: false });
      const g = MODES[mode].create(boss, { seed: 2 });
      const view = createView({ boss, design, seed: 2 });
      const bot = MODES[mode].bot();
      let frames = 0, clock = 0;
      drawBattle(view, g, { phase: 'intro', clock: 0, countdown: 0 });
      while (g.result === 'playing' && g.time < 60) {
        bot(g, 1 / 120); g.step(1 / 120); g.drain(); clock += 1 / 120;
        if (++frames % 30 === 0) {
          const s = drawBattle(view, g, { phase: 'playing', clock, countdown: 0 });
          assert.ok(!s.buf.includes(0), `${mode}/${tier}: every pixel is painted`);
        }
      }
      assert.equal(g.result, 'won', `${mode}/${tier}`);
    }
  }
});
