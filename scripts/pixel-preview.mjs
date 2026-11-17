/**
 * Pixel-art preview sheets (PNG) for the retro screens — review hero sprites,
 * generated monsters and palette swaps without a browser.
 *
 *   node scripts/pixel-preview.mjs heroes   out.png
 *   node scripts/pixel-preview.mjs monsters out.png [runSeed]
 *   node scripts/pixel-preview.mjs scenes  out.png
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createSurface, blit, clear, rect, text, toRGBA } from '../src/engine/pixel.js';
import { buildScheme, heroBaseColors, bossBaseColors, minionBaseColors, packPalette, SLOT } from '../src/engine/palette.js';
import { paintHero } from '../src/characters/heroSprite.js';
import { DEFAULT_CHARACTERS, UNLOCKABLES, normalizeCharacter } from '../src/characters/character.js';

export function encodePNG(width, height, rgba) {
  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function savePNG(path, surface, palette, scale = 1) {
  const big = createSurface(surface.w * scale, surface.h * scale);
  blit(big, surface, 0, 0, { scale });
  writeFileSync(path, encodePNG(big.w, big.h, toRGBA(big, palette)));
}

const SHEET_BG = 18;
function heroSheet(out) {
  const heroes = [...DEFAULT_CHARACTERS,
    normalizeCharacter({ ...DEFAULT_CHARACTERS[0], build: 'small', head: 'round', hair: 'long', hat: 'wizard', top: 'robe', bottom: 'skirt', extra: 'scarf', back: 'wings', colors: { ...DEFAULT_CHARACTERS[0].colors, hair: '#ff7eb6', hat: '#6b4fd8', top: '#8c4dcc' } }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[1], build: 'sturdy', head: 'tall', hair: 'mohawk', hat: 'viking', top: 'overalls', extra: 'starshades', back: 'guitar', shoes: 'rocketboots' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[2], hair: 'bob', hat: 'tophat', eyes: 'glasses', extra: 'bowtie', back: 'sword', top: 'hoodie', bottom: 'shorts' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[0], hair: 'spiky', hat: 'pirate', extra: 'heromask', back: 'shield', top: 'jacket', face: 'open' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[1], hat: 'halo', extra: 'monocle', hair: 'none', back: 'none', top: 'tee', face: 'mustache' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[2], hat: 'flowers', hair: 'ponytail', back: 'backpack', top: 'tunic', head: 'round' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[0], hat: 'partyhat', back: 'butterfly', shoes: 'lightup' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[1], hat: 'gemcrown', back: 'fairywings' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[2], hat: 'unicorn', back: 'dragonwings' }),
    normalizeCharacter({ ...DEFAULT_CHARACTERS[0], hat: 'halo', back: 'rainbowcape', hair: 'long' }),
  ];
  const poses = [['side', 'idle', 0], ['side', 'run', 0], ['side', 'run', 1], ['side', 'run', 2], ['side', 'run', 3], ['side', 'jump', 0], ['side', 'fall', 0], ['side', 'stumble', 0], ['side', 'hurt', 0], ['side', 'sit', 0],
    ['front', 'idle', 0], ['front', 'up', 0], ['front', 'down', 0], ['front', 'left', 0], ['front', 'right', 0], ['front', 'dance', 0], ['front', 'dance', 1], ['front', 'aim', 0], ['front', 'cheer', 0], ['back', 'idle', 0], ['back', 'sit', 0]];
  const cw = 32, ch = 40;
  const sheet = createSurface(poses.length * cw + 4, heroes.length * ch + 4);
  clear(sheet, SHEET_BG);
  const pal = buildScheme({ theme: 'meadow', hero: heroBaseColors(heroes[0]), step: 0 });
  // every row has its own hero colours: draw each row with its own palette into a shared RGBA
  const rgba = new Uint8Array(sheet.w * sheet.h * 4);
  heroes.forEach((h, r) => {
    const row = createSurface(sheet.w, ch);
    clear(row, SHEET_BG);
    poses.forEach(([view, pose, f], c) => blit(row, paintHero(h, view, pose, f, 0.3), 2 + c * cw, 2));
    const p = packPalette(buildScheme({ theme: 'meadow', hero: heroBaseColors(h), step: r === heroes.length - 1 ? 3 : 0 }));
    const px = toRGBA(row, p);
    rgba.set(px, (2 + r * ch) * sheet.w * 4);
  });
  const scale = 4;
  const big = new Uint8Array(sheet.w * scale * sheet.h * scale * 4);
  const W = sheet.w * scale;
  for (let y = 0; y < sheet.h * scale; y++) for (let x = 0; x < W; x++) {
    const si = ((y / scale | 0) * sheet.w + (x / scale | 0)) * 4, di = (y * W + x) * 4;
    big[di] = rgba[si]; big[di + 1] = rgba[si + 1]; big[di + 2] = rgba[si + 2]; big[di + 3] = 255;
  }
  writeFileSync(out, encodePNG(W, sheet.h * scale, big));
}

/** Stack rows (each { surface, palette }) into one PNG, magnified. */
function saveRows(out, rows, scale = 3) {
  const w = Math.max(...rows.map(r => r.surface.w)), h = rows.reduce((s, r) => s + r.surface.h, 0);
  const W = w * scale, big = new Uint8Array(W * h * scale * 4);
  let y0 = 0;
  for (const { surface, palette } of rows) {
    const px = toRGBA(surface, palette);
    for (let y = 0; y < surface.h * scale; y++) for (let x = 0; x < surface.w * scale; x++) {
      const si = ((y / scale | 0) * surface.w + (x / scale | 0)) * 4, di = ((y0 * scale + y) * W + x) * 4;
      big[di] = px[si]; big[di + 1] = px[si + 1]; big[di + 2] = px[si + 2]; big[di + 3] = 255;
    }
    y0 += surface.h;
  }
  writeFileSync(out, encodePNG(W, h * scale, big));
}

async function monsterSheet(out, seedArg) {
  const { generateMonster, ROLES } = await import('../src/characters/monsters.js');
  const base = Number(seedArg) || 1;
  const rows = [];
  for (const role of Object.keys(ROLES)) {
    const row = createSurface(8 * 52 + 4, 52);
    clear(row, 18);
    for (let i = 0; i < 8; i++) {
      const m = generateMonster(base * 100 + i, { role });
      blit(row, m.frame({ pose: i % 3 === 2 ? 'attack' : 'idle', frame: i % 2 }), 2 + i * 52, 2);
    }
    const hue = (base * 53) % 360;
    rows.push({ surface: row, palette: packPalette(buildScheme({ theme: 'meadow', boss: bossBaseColors({ hue: (hue + Object.keys(ROLES).indexOf(role) * 70) % 360 }) })) });
  }
  const mrow = createSurface(8 * 52 + 4, 24);
  clear(mrow, 18);
  for (let i = 0; i < 16; i++) blit(mrow, generateMonster(base * 7 + i, { role: 'flyer', size: 20, ramp: 'minion' }).frame({ frame: i % 2 }), 2 + i * 26, 2);
  rows.push({ surface: mrow, palette: packPalette(buildScheme({ theme: 'canyon', minion: minionBaseColors({ hue: 30 }) })) });
  saveRows(out, rows, 3);
}

async function sceneSheet(out, seedArg) {
  const { makeBoss } = await import('../src/progression/bosses.js');
  const { MODES, CAPSTONES } = await import('../src/games/index.js');
  const { createView, drawBattle, updateParticles } = await import('../src/games/kit/view.js');
  const runSeed = Number(seedArg) || 1;
  const design = DEFAULT_CHARACTERS[0];
  const only = process.argv[5] ? process.argv[5].split(',') : null;
  const plan = [['runner', 'meadow', 0, 4], ['echo', 'meadow', 2, 9], ['quickdraw', 'canyon', 5, 5], ['sled', 'alpine', 8, 6], ['starbeat', 'starlit', 11, 6], ['tennis', 'canyon', 4, 5],
    ['invaders', 'starlit', 11, 6], ['fireball', 'alpine', 7, 6], ['doodle', 'meadow', 1, 5], ['flappy', 'canyon', 3, 6], ['tetris', 'alpine', 7, 9], ['runner', 'starlit', 10, 7],
    ['breakout', 'canyon', 5, 8], ['cannon', 'canyon', 5, 5], ['whack', 'meadow', 2, 4], ['fishing', 'meadow', 2, 9], ['maze', 'starlit', 10, 6], ['frogger', 'canyon', 4, 5],
    ['lander', 'starlit', 10, 8], ['raft', 'meadow', 2, 6], ['minecart', 'canyon', 5, 6], ['snowmobile', 'alpine', 8, 6], ['plane', 'alpine', 8, 6],
    ['parry', 'meadow', 6, 3.3], ['parry', 'volcano', 6, 4.1], ['bubble', 'lagoon', 5, 7], ['bomber', 'grove', 6, 7], ['lavaguard', 'volcano', 9, 7], ['shards', 'crystal', 10, 7]].filter(([m]) => MODES[m]).filter(([m]) => !only || only.includes(m));
  const rows = [];
  for (const [mode, tier, index, seconds] of plan) {
    const boss = makeBoss({ runSeed, index, tier, mode, check: false, iteration: mode === 'echo' ? 1 : 0, difficulty: 0.6 });
    const game = MODES[mode].create(boss, { seed: 3 });
    const bot = MODES[mode].bot();
    const view = createView({ boss, design, seed: 3 });
    let clock = 0;
    while (game.time < seconds && game.result === 'playing') { bot(game, 1 / 120); game.step(1 / 120); game.drain(); clock += 1 / 120; }
    const screen = drawBattle(view, game, { phase: 'playing', clock, countdown: 0 });
    const pal = packPalette(buildScheme({ theme: boss.theme, hero: heroBaseColors(design), boss: bossBaseColors({ hue: boss.hue, accentHue: boss.accentHue }), minion: minionBaseColors({ hue: boss.minionHue }), step: game.steps }));
    const copy = createSurface(screen.w, screen.h); copy.buf.set(screen.buf);
    rows.push({ surface: copy, palette: pal });
  }
  // two per row
  const pairs = [];
  for (let i = 0; i < rows.length; i += 2) {
    const a = rows[i], b = rows[i + 1];
    const both = createSurface(a.surface.w * 2 + 4, a.surface.h);
    // render each half with its own palette by drawing to RGBA later: keep separate rows instead
    pairs.push(a); if (b) pairs.push(b);
  }
  saveRows(out, pairs, 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {                // run, not imported (scripts/cast-sheet.mjs borrows encodePNG)
  const [what = 'heroes', out = '/tmp/preview.png', arg] = process.argv.slice(2);
  if (what === 'heroes') heroSheet(out);
  else if (what === 'monsters') await monsterSheet(out, arg);
  else if (what === 'scenes') await sceneSheet(out, arg);
  else console.error('unknown sheet', what);
  console.log('wrote', out);
}
