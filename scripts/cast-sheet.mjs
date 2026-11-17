/**
 * Cast sheet (PNG) — everyone you'd meet together, for a human to look over: are people easy to
 * tell apart, does anyone blend into where they stand, is any colour jarring?
 *
 *   node scripts/cast-sheet.mjs out.png [runSeed …]
 *
 * Rows:
 *   the town square   the hero, Mayor Marigold and the four card battlers (one visit), on the plaza
 *   the inn           the regulars (Bertha, Pippa, Tess, Rocco) and the Ring's three tamers
 *   each run stage    on that zone's 2D backdrop: the stage's NPC, then its three bosses
 * Colours come from characters/looks.js (dressApart, spreadHues); see WORLD_DESIGN.md.
 */
import { writeFileSync } from 'node:fs';
import { encodePNG } from './pixel-preview.mjs';
import { createSurface, rect, hline, text, toRGBA, blit } from '../src/engine/pixel.js';
import { buildScheme, heroBaseColors, bossBaseColors, minionBaseColors, packPalette, ST, SLOT } from '../src/engine/palette.js';
import { paintHero } from '../src/characters/heroSprite.js';
import { DEFAULT_CHARACTERS } from '../src/characters/character.js';
import { makeNpc, makeGroup, mayorNpc, regularNpc, planNpcs, backdropOf } from '../src/characters/npcs.js';
import { generateMonster } from '../src/characters/monsters.js';
import { makeBoss } from '../src/progression/bosses.js';
import { planEncounters } from '../src/progression/encounters.js';
import { planZones, ZONE_IDS, ZONES } from '../src/world/zones.js';
import { hashSeed } from '../src/levels/generator.js';

const TIER_IDS = ['meadow', 'canyon', 'alpine', 'starlit'], PER = 3;
const ROW_H = 60, ROW_W = 420, SCALE = 3;

/** An RGBA canvas we composite indexed surfaces onto (each with its own palette). */
function canvas(w, h) { return { w, h, px: new Uint8Array(w * h * 4).fill(255) }; }
function put(c, surface, palette, x0, y0, { opaque = false } = {}) {
  const rgba = toRGBA(surface, palette);
  for (let y = 0; y < surface.h; y++) for (let x = 0; x < surface.w; x++) {
    const i = y * surface.w + x, X = x0 + x, Y = y0 + y;
    if ((!opaque && !surface.buf[i]) || X < 0 || Y < 0 || X >= c.w || Y >= c.h) continue;
    c.px.set(rgba.subarray(i * 4, i * 4 + 4), (Y * c.w + X) * 4);
  }
}

/** A zone's backdrop strip: sky bands, far and near hills, the ground. */
function backdrop(theme, label) {
  const s = createSurface(ROW_W, ROW_H);
  rect(s, 0, 0, ROW_W, 14, ST.SKY0); rect(s, 0, 14, ROW_W, 12, ST.SKY1); rect(s, 0, 26, ROW_W, 10, ST.SKY2);
  for (let x = 0; x < ROW_W; x++) {
    const far = 30 + Math.round(Math.sin(x / 23) * 4), mid = 38 + Math.round(Math.sin(x / 13 + 1) * 3);
    rect(s, x, far, 1, ROW_H - far, ST.FAR0); rect(s, x, mid, 1, ROW_H - mid, ST.MID0);
  }
  rect(s, 0, 50, ROW_W, 10, ST.GROUND0); hline(s, 0, ROW_W - 1, 50, ST.GROUND1);
  rect(s, 0, 0, 92, 9, SLOT.PANEL); text(s, label.toUpperCase(), 2, 2, SLOT.WHITE);
  return s;
}
const theme = (t, extra = {}) => packPalette(buildScheme({ theme: t, ...extra }));

function personAt(c, design, face, x, themeId) {
  const spr = paintHero({ ...design, silly: face || null }, 'front', 'idle', 0, 0.3);
  put(c, spr, theme(themeId, { hero: heroBaseColors(design) }), x, c.y0 + ROW_H - 2 - spr.h);
}
function bossAt(c, boss, x, themeId) {
  const m = generateMonster(boss.monsterSeed, { role: boss.role });
  put(c, m.frame({ pose: 'idle', frame: 0 }), theme(themeId, { boss: bossBaseColors({ hue: boss.hue, accentHue: boss.accentHue }), minion: minionBaseColors({ hue: boss.minionHue }) }), x, c.y0 + ROW_H - 50);
}

function sheet(seeds) {
  const rows = seeds.length * (2 + TIER_IDS.length + 0.25);
  const c = canvas(ROW_W, Math.ceil(rows * ROW_H));
  c.y0 = 0;
  const hero = DEFAULT_CHARACTERS[0];
  for (const runSeed of seeds) {
  const visit = runSeed;
  // the square (one visit's battlers, dressed apart from the mayor and the hero)
  put(c, backdrop('meadow', `town square ${visit}`), theme('meadow'), 0, c.y0, { opaque: true });
  const mayor = mayorNpc();
  const homes = [...ZONE_IDS].sort((a, b) => hashSeed('home', visit, a) - hashSeed('home', visit, b));
  const square = makeGroup([0, 1, 2, 3].map(i => ({ seed: hashSeed('villager', visit, i), zone: homes[i], stage: 1 + (i % 3), quest: false, avoid: backdropOf('town') })), { context: [mayor.design, hero] });
  [hero, mayor.design, ...square.map(n => n.design)].forEach((d, i) => personAt(c, d, i === 0 ? null : i === 1 ? mayor.face : square[i - 2].face, 8 + i * 40, 'meadow'));
  c.y0 += ROW_H;
  // the inn
  put(c, backdrop('canyon', `the inn ${visit}`), theme('canyon'), 0, c.y0, { opaque: true });
  const regs = ['keeper', 'barmaid', 'tailor', 'master'].map(regularNpc);
  const zones = [...ZONE_IDS].sort((a, b) => hashSeed('tamer-home', visit, a) - hashSeed('tamer-home', visit, b));
  const tamers = makeGroup([0, 1, 2].map(i => ({ seed: hashSeed('tamer', visit, i), zone: zones[i], quest: false, avoid: backdropOf('yard') })), { context: [regs[3].design, hero] });
  [...regs, ...tamers].forEach((n, i) => personAt(c, n.design, n.face, 8 + i * 40 + (i >= 4 ? 20 : 0), 'canyon'));
  c.y0 += ROW_H;
  // the run: each stage's NPC and bosses on the zone's backdrop
    const zonesOfRun = planZones(runSeed, TIER_IDS.length);
    const slots = TIER_IDS.flatMap((t, k) => Array.from({ length: PER }, (_, i) => ({ tier: t, zone: zonesOfRun[k], slot: i, capstone: i === PER - 1 })));
    const plan = planEncounters(runSeed, slots);
    const npcPlan = planNpcs(runSeed, TIER_IDS.map(() => PER));
    const met = [];
    const label = canvas(ROW_W, ROW_H / 4);
    const lab = createSurface(ROW_W, ROW_H / 4); rect(lab, 0, 0, ROW_W, ROW_H / 4, SLOT.PANEL); text(lab, `RUN ${runSeed}: ${zonesOfRun.map(z => ZONES[z].name).join(' > ').toUpperCase()}`, 3, 4, SLOT.GOLD);
    put(c, lab, theme('meadow'), 0, c.y0, { opaque: true }); c.y0 += ROW_H / 4;
    zonesOfRun.forEach((zone, k) => {
      put(c, backdrop(zone, ZONES[zone].name), theme(zone), 0, c.y0, { opaque: true });
      const npc = makeNpc(npcPlan[k].seed, { zone, stage: k, faces: met.map(n => n.face), others: met.map(n => n.design), context: [hero] });
      met.push(npc);
      personAt(c, npc.design, npc.face, 10, zone);
      for (let i = 0; i < PER; i++) {
        const index = k * PER + i, e = plan[index]?.boss;
        const boss = makeBoss({ runSeed, index, count: 12, tier: zone, slot: i, capstone: i === PER - 1, mode: e?.mode || null, role: 'boss', check: false });
        if (boss.kind === 'boss') bossAt(c, boss, 60 + i * 56, zone);
      }
      c.y0 += ROW_H;
    });
  }
  return c;
}

const [out = '/tmp/cast.png', ...seedArgs] = process.argv.slice(2);
const seeds = seedArgs.length ? seedArgs.map(Number) : [1];
const c = sheet(seeds);
const H = c.y0, W = c.w, big = new Uint8Array(W * SCALE * H * SCALE * 4);
for (let y = 0; y < H * SCALE; y++) for (let x = 0; x < W * SCALE; x++) {
  const si = ((y / SCALE | 0) * W + (x / SCALE | 0)) * 4, di = (y * W * SCALE + x) * 4;
  big[di] = c.px[si]; big[di + 1] = c.px[si + 1]; big[di + 2] = c.px[si + 2]; big[di + 3] = 255;
}
writeFileSync(out, encodePNG(W * SCALE, H * SCALE, big));
console.log('wrote', out);
