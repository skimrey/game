/**
 * Face Sheet (faces.html): a contact sheet of generated NPC faces for a human to review —
 * "does anything here look unsettling rather than silly?". The 3D look (the avatar's boxes
 * drawn flat, characters/portrait.js) beside the dialog portrait (characters/npcFace.js), the
 * mayor and the inn's regulars first, then a batch of villagers sorted by oddness score (characters/npcs.js).
 */
import { createAvatar } from '../characters/avatar.js';
import { makeNpc, mayorNpc, regularNpc, faceOddness, ODDNESS_BUDGET, makeGroup, backdropOf, FACE_PARTS } from '../characters/npcs.js';
import { DEFAULT_CHARACTERS } from '../characters/character.js';
import { ZONE_IDS } from '../world/zones.js';
import { hashSeed } from '../levels/generator.js';
import { drawPortrait } from '../characters/portrait.js';
import { paintNpcPortrait, portraitPalette, PORTRAIT_SIZE } from '../characters/npcFace.js';

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed') || 1);
const COUNT = 48;
const avatar = createAvatar({ random: () => 0.5 });

function portrait2d(npc) {
  const c = document.createElement('canvas');
  c.width = c.height = PORTRAIT_SIZE;
  const s = paintNpcPortrait(npc, { t: 0.7 }), pal = portraitPalette(npc), ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < s.buf.length; i++) { const rgb = pal[s.buf[i]] || [0, 0, 0]; img.data.set([...rgb, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  return c;
}
function portrait3d(npc, { framing = 'bust', size = Number(params.get('size')) || 160, yaw = 0.35 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  avatar.setCharacter(npc.design); avatar.silly = npc.face;
  avatar.reset({ x: 0, y: 0, z: 0, grounded: true }, { pop: false });
  drawPortrait(c, avatar.getParts({ x: 0, y: 0, z: 0 }), { framing, yaw, background: [[0.3, 0.35, 0.45], [0.5, 0.55, 0.65]] });
  return c;
}

/** ?people=N — the folk you'd see together on town visit N: the mayor, the inn's regulars, the square's battlers, the Ring's tamers. */
function people(visit) {
  const hero = DEFAULT_CHARACTERS[0], mayor = mayorNpc(), regs = ['keeper', 'barmaid', 'tailor', 'master'].map(regularNpc);
  const homes = [...ZONE_IDS].sort((a, b) => hashSeed('home', visit, a) - hashSeed('home', visit, b));
  const square = makeGroup([0, 1, 2, 3].map(i => ({ seed: hashSeed('villager', visit, i), zone: homes[i], stage: 1 + (i % 3), quest: false, avoid: backdropOf('town') })), { context: [mayor.design, hero] });
  const zones = [...ZONE_IDS].sort((a, b) => hashSeed('tamer-home', visit, a) - hashSeed('tamer-home', visit, b));
  const tamers = makeGroup([0, 1, 2].map(i => ({ seed: hashSeed('tamer', visit, i), zone: zones[i], quest: false, avoid: backdropOf('yard') })), { context: [regs[3].design, hero] });
  return [mayor, ...regs, ...square, ...tamers];
}

/** ?parts=1 — one plain face per feature option, to see what each looks like in 3D and in 2D. */
function partsFaces() {
  const base = { eyes: 'beady', brows: 'none', nose: 'button', mouth: 'grin', whiskers: 'none', extra: 'none', ears: 'normal', head: 1, eyeSizes: [1, 1], look: 0.2 };
  const out = [];
  for (const [k, options] of Object.entries(FACE_PARTS)) for (const v of new Set(options)) {
    const npc = makeNpc(hashSeed('parts', k, v), { quest: false, fantasy: false });
    npc.face = { ...base, [k]: v, eyeSizes: v === 'wonky' ? [1.5, 0.7] : [1, 1] };
    npc.first = `${k}: ${v}`;
    out.push(npc);
  }
  for (const head of [1.1, 1.2, 1.32]) { const npc = makeNpc(hashSeed('parts-head', head), { quest: false }); npc.face = { ...base, head }; npc.first = `head ${head}`; out.push(npc); }
  return out;
}

function render() {
  const grid = document.getElementById('grid');
  grid.replaceChildren();
  const big = params.has('people') || params.has('parts');
  if (big) grid.classList.add('big');
  if (params.get('size')) grid.style.setProperty('--card', `${Number(params.get('size')) * 3 + 30}px`);
  let list;
  if (params.has('people')) list = people(Number(params.get('people')) || 1);
  else if (params.has('parts')) list = partsFaces();
  else {
    const npcs = Array.from({ length: COUNT }, (_, i) => makeNpc(seed * 1000 + i));
    npcs.sort((a, b) => faceOddness(b.face) - faceOddness(a.face));
    list = [mayorNpc(), ...['keeper', 'barmaid', 'tailor', 'master'].map(regularNpc), ...npcs];
  }
  for (const npc of list) {
    const f = npc.face, odd = faceOddness(f);
    const card = document.createElement('div');
    card.className = `card${odd >= ODDNESS_BUDGET ? ' odd' : ''}`;
    const pair = document.createElement('div'); pair.className = 'pair';
    pair.append(portrait3d(npc), portrait2d(npc));
    if (big) pair.append(portrait3d(npc, { framing: 'full', yaw: 0.5 }));
    const tags = document.createElement('div'); tags.className = 'tags';
    tags.innerHTML = `<span class="score">${odd}</span>${npc.first} — ${['eyes', 'brows', 'nose', 'mouth', 'whiskers', 'extra', 'ears'].map(k => f[k]).filter(v => v !== 'none' && v !== 'normal').join(' · ')}${f.head > 1.2 ? ' · bobble' : ''}`;
    card.append(pair, tags);
    grid.append(card);
  }
  document.getElementById('info').textContent = `batch ${seed} · budget ${ODDNESS_BUDGET}`;
  window.done = true;
}
document.getElementById('next').onclick = () => { seed++; history.replaceState(null, '', `?seed=${seed}`); render(); };
render();
