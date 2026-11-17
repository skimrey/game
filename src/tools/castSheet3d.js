/**
 * Cast 3D (cast3d.html): the people you'd meet, drawn by the game's own WebGL renderer — the
 * faces sheet's canvas portraits are a rough projection and hide small features (mouths, whiskers),
 * and some things that charm in 2D turn out rough in 3D. For a human to review:
 *
 *   cast3d.html?people=N      the mayor, the inn's regulars, town visit N's card battlers and tamers
 *   cast3d.html?seed=N        a batch of generated NPCs (each with its weirdness score)
 *   cast3d.html?parts=1       each face feature alone
 *
 * One WebGL canvas renders each person on the showroom pedestal (close on the face, and the whole
 * figure) and the pictures are copied into the sheet beside the 2D dialog portrait.
 */
import { createRenderer } from '../engine/renderer.js';
import { PRESETS } from '../engine/quality.js';
import { createAvatar } from '../characters/avatar.js';
import { makeNpc, mayorNpc, regularNpc, makeGroup, backdropOf, FACE_PARTS, weirdness, WEIRDNESS_BUDGET } from '../characters/npcs.js';
import { DEFAULT_CHARACTERS } from '../characters/character.js';
import { dressApart, FANTASY_SKINS, HUMAN_SKINS } from '../characters/looks.js';
import { paintNpcPortrait, portraitPalette, PORTRAIT_SIZE } from '../characters/npcFace.js';
import { BIOMES } from '../world/biomes.js';
import { ZONE_IDS } from '../world/zones.js';
import { hashSeed } from '../levels/generator.js';

const params = new URLSearchParams(location.search);
const THUMB = params.has('big') ? 360 : 180;            // ?big=1: full-size pictures
if (params.has('big')) document.documentElement.style.setProperty('--card', '1100px');
const only = params.get('only')?.split(',');             // ?only=Ignatius,Rocco: just these people
const STAGE = { name: 'Cast', spawn: { x: 0, y: 0.5, z: 0 }, platforms: [{ x: 0, y: 0, z: 0, width: 2.2, height: 1, depth: 2.2 }], goal: null };
const gl = document.createElement('canvas');
gl.width = 360; gl.height = 360;
Object.assign(gl.style, { width: '360px', height: '360px', position: 'absolute', left: '-10000px' });
document.body.append(gl);
const render = createRenderer(gl, { ...PRESETS.normal, resolution: 1, adaptive: false });
const avatar = createAvatar({ random: () => 0.5 });
const player = { x: 0, y: 0.5, z: 0, vy: 0, grounded: true };

function shot(npc, { close = true, yaw = 0.45 } = {}) {
  avatar.setCharacter(npc.design); avatar.silly = npc.face;
  avatar.reset(player, { pop: false });
  const dist = close ? 1.0 : 3.6, ty = close ? 1.68 + ((npc.face?.head || 1) - 1) * 0.35 + (npc.face?.eyes === 'stalks' ? 0.12 : 0) : 0.85;
  const eye = [Math.sin(yaw) * dist, ty + (close ? 0.05 : 0.5), Math.cos(yaw) * dist];
  render(STAGE, player, [], { avatar: avatar.getParts(player), camera: { eye, target: [0, ty, 0] }, biome: BIOMES.meadow, hideGoal: true });
  const c = document.createElement('canvas');
  c.width = c.height = THUMB;
  c.getContext('2d').drawImage(gl, 0, 0, 360, 360, 0, 0, THUMB, THUMB);
  return c;
}
function portrait2d(npc) {
  const c = document.createElement('canvas');
  c.width = c.height = PORTRAIT_SIZE;
  const s = paintNpcPortrait(npc, { t: 0.7 }), pal = portraitPalette(npc), ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < s.buf.length; i++) { const rgb = pal[s.buf[i]] || [0, 0, 0]; img.data.set([...rgb, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  return c;
}

function people(visit) {
  const hero = DEFAULT_CHARACTERS[0], mayor = mayorNpc(), regs = ['keeper', 'barmaid', 'tailor', 'master'].map(regularNpc);
  const homes = [...ZONE_IDS].sort((a, b) => hashSeed('home', visit, a) - hashSeed('home', visit, b));
  const square = makeGroup([0, 1, 2, 3].map(i => ({ seed: hashSeed('villager', visit, i), zone: homes[i], stage: 1 + (i % 3), quest: false, avoid: backdropOf('town') })), { context: [mayor.design, hero] });
  const zones = [...ZONE_IDS].sort((a, b) => hashSeed('tamer-home', visit, a) - hashSeed('tamer-home', visit, b));
  const tamers = makeGroup([0, 1, 2].map(i => ({ seed: hashSeed('tamer', visit, i), zone: zones[i], quest: false, avoid: backdropOf('yard') })), { context: [regs[3].design, hero] });
  return [mayor, ...regs, ...square, ...tamers];
}
function partsFaces() {
  const base = { eyes: 'beady', brows: 'none', nose: 'button', mouth: 'grin', whiskers: 'none', extra: 'none', ears: 'normal', head: 1, eyeSizes: [1, 1], look: 0.2 };
  const out = [];
  for (const [k, options] of Object.entries(FACE_PARTS)) for (const v of new Set(options)) {
    const npc = makeNpc(hashSeed('parts', k, v), { quest: false, fantasy: false });
    npc.face = { ...base, [k]: v, eyeSizes: v === 'wonky' ? [1.5, 0.7] : [1, 1] };
    npc.first = `${k}: ${v}`;
    out.push(npc);
  }
  return out;
}

/** ?tones=1: each chosen person in every fantasy tone (and two human ones), dressed to suit it. */
function tones(list) {
  return list.flatMap(n => [...FANTASY_SKINS, HUMAN_SKINS[2], HUMAN_SKINS[5]].map(skin => {
    const design = JSON.parse(JSON.stringify(n.design));
    dressApart(design, [], { seed: n.seed, skin });
    return { ...n, design, first: `${n.first} ${skin}` };
  }));
}
const grid = document.getElementById('grid');
const list = params.has('people') ? people(Number(params.get('people')) || 1) : params.has('parts') ? partsFaces()
  : Array.from({ length: 24 }, (_, i) => makeNpc((Number(params.get('seed')) || 1) * 1000 + i));
const chosen = list.filter(n => !only || only.includes(n.first));
for (const npc of params.has('tones') ? tones(chosen) : chosen) {
  const card = document.createElement('div');
  const w = weirdness(npc);
  card.className = `card${w > WEIRDNESS_BUDGET ? ' odd' : ''}`;
  const pair = document.createElement('div'); pair.className = 'pair';
  pair.append(shot(npc), portrait2d(npc), shot(npc, { close: false }));
  const tags = document.createElement('div'); tags.className = 'tags';
  const f = npc.face;
  tags.innerHTML = `<span class="score">${w}</span><b>${npc.first}</b> — ${['eyes', 'brows', 'nose', 'mouth', 'whiskers', 'extra', 'ears'].map(k => f[k]).filter(v => v !== 'none' && v !== 'normal').join(' · ')} · skin ${npc.design.colors.skin}`;
  card.append(pair, tags);
  grid.append(card);
}
window.done = true;
