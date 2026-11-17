/**
 * Your home — a 2D pixel-art house off the town square (the path east, the door).
 *
 *   living room   the front door (back to town), a window, a shelf and the walls for your
 *                 decorations (town/decor.js — one for every run you finish), a rug, a ceiling
 *                 hook, the trophy stand — and, on your first visit, a basket at the door
 *                 with three critters who need a home
 *   bedroom       the WARDROBE (your clothes: the character screen), the PET BED (your pet
 *                 sleeps there; choose who comes along on runs), the bed, a poster, a corner
 *   game room     the ARCADE cabinet (replay any mini-game you've met), the CARD TABLE (your
 *                 Riftcards decks) and the BACK DOOR to the ranch (the bosses you've befriended)
 * Walk up to a pet (roaming, or asleep by the bed) and press ↑ / E to PET it: hearts, a happy
 * wiggle and a purr (each species its own pitch).
 *
 * Walk with ← → (A / D); ↑, E, Space or Enter uses what you stand by; Esc (or the front
 * door) goes back to town. Pets who aren't coming along roam the house.
 *
 *   const home = createHome({ profile, onWardrobe, onLeave, onPet });
 *   home.open({ design });  home.setDesign(design);  home.close();
 */
import { createSurface, clear, rect, pset, ellipse, line, poly, text, hline, frame, blit, present, dither, textWidth } from '../engine/pixel.js';
import { buildScheme, packPalette, heroBaseColors, SLOT, hexToRgb255 } from '../engine/palette.js';
import { createHeroSheet, HERO_W, HERO_H } from '../characters/heroSprite.js';
import { paintPet, petBaseColors, makePet, PET_W, PET_H, SPECIES } from '../characters/pets.js';
import { DECOR, HC, SPOTS } from './decor.js';
import { SCREEN } from '../games/kit/common.js';
import { hashSeed } from '../levels/generator.js';
import { fitPixelCanvas } from '../engine/pixelFit.js';
import { sound } from '../audio/music.js';

const W = SCREEN.w, H = SCREEN.h, WORLD = 960, FLOOR = 150, FEET = 168;
const HOME = { WALL: 104, WALL_D: 105, WALL2: 106, WALL2_D: 107, FLOORC: 108, FLOOR_D: 109, BEAM: 110, SKY: 111, BED: 128, BED_D: 129, PILLOW: 130, WALL3: 131, WALL3_D: 132, NEON: 133, SCREEN: 134, FELT: 135 };
const COLORS = {
  [HOME.WALL]: '#f3e6c8', [HOME.WALL_D]: '#e6d3ad', [HOME.WALL2]: '#c9daf0', [HOME.WALL2_D]: '#b3c7e3', [HOME.FLOORC]: '#b07a4a', [HOME.FLOOR_D]: '#8a5a34',
  [HOME.BEAM]: '#6b4428', [HOME.SKY]: '#8fd0ff', [HOME.BED]: '#5a8ad9', [HOME.BED_D]: '#3f6ab8', [HOME.PILLOW]: '#fff8f0',
  [HOME.WALL3]: '#3a2a5c', [HOME.WALL3_D]: '#2c1f48', [HOME.NEON]: '#ff5ad2', [HOME.SCREEN]: '#5ef0ff', [HOME.FELT]: '#2e6a4a',
  [HC.WOOD]: '#a8713f', [HC.WOOD_D]: '#7a4e2a', [HC.GREEN]: '#5fbf4a', [HC.GREEN_D]: '#3a8a32', [HC.BLUE]: '#4a9ae0', [HC.BLUE_D]: '#2c5a96', [HC.PINK]: '#ff8fb0',
  [HC.PURPLE]: '#9a5ae6', [HC.ORANGE]: '#f08a3a', [HC.SAND]: '#e8d4a0', [HC.GLASS]: '#bfe6ff', [HC.CREAM]: '#fff3dc', [HC.BROWN]: '#7a5232', [HC.LAVA]: '#ff5a2a', [HC.NIGHT]: '#1c2250', [HC.TEAL]: '#3ab8a8',
};
/** Where each decoration spot is (bottom-centre anchors, world x). */
const SPOT_AT = { shelf: [[146, 78], [176, 78], [206, 78]], wall: [[262, 70]], window: [[90, 42]], rug: [[176, 166]], floor: [[284, FLOOR + 2]], ceiling: [[176, 18]], trophy: [[236, 118]], poster: [[452, 74]], corner: [[524, FLOOR + 2]] };
const PET_RAMPS = [96, 160, 168, 176, 184, 192, 200, 208];        // the pets' palette ramps (8 slots each)
const MIN_FRAME_MS = 1000 / 40;

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

/** Paint a pet sprite into a canvas (for cards), scale ×. */
export function petCanvas(pet, { pose = 'sit', scale = 3 } = {}) {
  const c = el('canvas', { width: PET_W * scale, height: PET_H * scale, class: 'pet-art' });
  const s = paintPet(pet, pose, 0), cols = petBaseColors(pet), ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const v = s.buf[(y / scale | 0) * PET_W + (x / scale | 0)], i = (y * c.width + x) * 4;
    if (!v) continue;
    const rgb = v === 1 ? [27, 16, 40] : cols[v - 96];
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function createHome({ parent = document.querySelector('main') || document.body, profile, onWardrobe = () => {}, onLeave = () => {}, onPet = () => {}, onArcade = () => {}, onCards = () => {}, onRanch = () => {} } = {}) {
  const canvas = el('canvas', { width: W, height: H, class: 'home-canvas', 'aria-label': 'Your home', hidden: true });
  const prompt = el('p', { class: 'npc-prompt home-prompt', hidden: true });
  const panel = el('section', { class: 'home-panel', hidden: true, role: 'dialog' });
  parent.append(canvas, prompt, panel);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  fitPixelCanvas(canvas);
  const target = { ctx, image: null };
  const screen = createSurface(W, H);
  let st = null;

  // --- the palette: the hero, the pets, the house, the decorations
  function palette() {
    const pets = profile.pets();
    const pal = buildScheme({ theme: 'meadow', hero: heroBaseColors(st.design), pet: pets[0] ? petBaseColors(pets[0]) : null });
    for (const [i, hex] of Object.entries(COLORS)) pal[i] = hexToRgb255(hex);
    pets.slice(0, PET_RAMPS.length).forEach((p, k) => petBaseColors(p).forEach((rgb, j) => { pal[PET_RAMPS[k] + j] = rgb; }));
    return packPalette(pal);
  }
  /** A remap from the pet ramp (96–103) to pet k's ramp. */
  const rampMaps = PET_RAMPS.map(base => { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i >= 96 && i < 104 ? base + (i - 96) : i; return m; });

  // --- what you can use, and where
  function hotspots() {
    const out = [{ id: 'door', x: 30, label: 'Back to town' }];
    if (!profile.pets().length) out.push({ id: 'basket', x: 66, label: 'The basket of critters' });
    out.push({ id: 'decor', x: 176, label: 'Arrange your decorations' });
    out.push({ id: 'wardrobe', x: 372, label: 'Wardrobe' });
    out.push({ id: 'petbed', x: 490, label: profile.pets().length ? 'Pets' : 'An empty pet bed' });
    out.push({ id: 'bed', x: 588, label: 'Bed' });
    out.push({ id: 'arcade', x: 716, label: 'Arcade cabinet' });
    out.push({ id: 'cards', x: 860, label: 'Card table: your decks' });
    out.push({ id: 'ranch', x: 936, label: profile.monsters?.().length ? `Back door: the ranch (${profile.monsters().length})` : 'Back door: the ranch' });
    // your pets (wherever they're roaming — or asleep in the pet bed): walk up and pet them
    const sleeper = profile.activePet();
    for (const p of profile.pets().slice(0, PET_RAMPS.length)) {
      const a = st.petState.get(p.id);
      if (!a) continue;
      if (sleeper?.id === p.id) out.push({ id: `pet:${p.id}`, x: 468, label: `Pet ${p.name} (asleep)`, pet: p });   // beside the pet bed (the bed itself picks who comes along)
      else out.push({ id: `pet:${p.id}`, x: a.x, label: `Pet ${p.name}`, pet: p, priority: true });
    }
    return out;
  }
  const nearest = () => hotspots().reduce((best, h) => {
    const d = Math.abs(h.x - st.hero.x);
    if (d >= (h.priority ? 22 : 28)) return best;
    if (!best || (h.priority && !best.priority) || (h.priority === best.priority && d < Math.abs(best.x - st.hero.x))) return h;
    return best;
  }, null);

  function use(h) {
    if (!h) return;
    if (h.id === 'door') return leave();
    if (h.id === 'wardrobe') { st.paused = true; onWardrobe(); return; }
    if (h.id === 'basket') return adoptPanel();
    if (h.id === 'petbed') return petsPanel();
    if (h.id === 'decor') return decorPanel();
    if (h.id === 'bed') { st.sleep = 2.5; return; }
    if (h.pet) { petThePet(h.pet); return; }
    if (h.id === 'arcade') { st.paused = true; onArcade(); return; }
    if (h.id === 'cards') { st.paused = true; onCards(); return; }
    if (h.id === 'ranch') { onRanch(); return; }
  }

  // --- panels (HTML)
  function showPanel(title, children, buttons = [['Close', () => hidePanel(), true]]) {
    st.paused = true;
    panel.replaceChildren(el('h2', { text: title }), ...children, el('div', { class: 'npc-buttons' }, buttons.map(([label, action, primary]) => el('button', { type: 'button', class: primary ? 'primary' : '', text: label, onclick: action }))));
    panel.hidden = false;
    (panel.querySelector('.pick') || panel.querySelector('button.primary') || panel.querySelector('button'))?.focus();
  }
  function hidePanel() { panel.hidden = true; if (st) { st.paused = false; st.keys.clear(); canvas.focus?.(); } }

  function adoptPanel() {
    const seed = hashSeed('basket', profile.get().runs);
    const choices = ['cat', 'dog', 'bunny'].map((sp, i) => makePet(seed + i, { species: sp }));
    const row = el('div', { class: 'npc-cards' }, choices.map(p => el('button', { type: 'button', class: 'npc-card pick', onclick: () => {
      profile.adopt(p); profile.setActivePet(p.id); onPet(p); st.paletteDirty = true;
      showPanel(`Welcome home, ${p.name}!`, [el('p', { class: 'home-text', text: `${p.name} the ${SPECIES[p.species].name.toLowerCase()} curls up in the pet bed — and will follow you on every run. Visit the pet bed to choose who comes along.` })]);
    } }, [petCanvas(p, { scale: 4 }), el('strong', { text: p.name }), el('span', { text: SPECIES[p.species].name })])));
    showPanel('Three critters need a home!', [el('p', { class: 'home-text', text: 'Someone left a basket by your door. Three little faces peek out. Which one will you adopt? (More may follow you home after a good run.)' }), row]);
  }
  function petsPanel() {
    const pets = profile.pets(), active = profile.activePet();
    if (!pets.length) { showPanel('An empty pet bed', [el('p', { class: 'home-text', text: 'Cosy, but empty. Check the basket by the front door!' })]); return; }
    const row = el('div', { class: 'npc-cards' }, pets.map(p => el('button', { type: 'button', class: `npc-card pick${active?.id === p.id ? ' chosen' : ''}`, onclick: () => { profile.setActivePet(p.id); onPet(p); st.paletteDirty = true; petsPanel(); } },
      [petCanvas(p, { pose: active?.id === p.id ? 'cheer' : 'sit', scale: 4 }), el('strong', { text: p.name }), el('span', { text: `${SPECIES[p.species].name} · ${p.rarity}` }), el('span', { class: 'npc-card-kind', text: active?.id === p.id ? 'Comes along ✓' : 'Take along' })])));
    const stay = el('button', { type: 'button', class: 'npc-card pick', onclick: () => { profile.setActivePet(null); onPet(null); petsPanel(); } }, [el('strong', { text: 'Nobody' }), el('span', { text: 'Travel alone this time' })]);
    row.append(stay);
    showPanel('Your pets', [el('p', { class: 'home-text', text: 'Who comes along on your runs? (Pets are company, not help: they cheer you on, they don’t fight.)' }), row]);
  }
  function decorPanel() {
    const owned = profile.decor();
    if (!owned.length) { showPanel('Decorations', [el('p', { class: 'home-text', text: 'Bare walls! Finish a run and you’ll bring home a decoration from the places you visited — a perfect run brings a trophy.' })]); return; }
    const list = el('div', { class: 'home-decor' }, owned.map(({ id, shown }) => {
      const d = DECOR[id];
      return el('label', { class: 'home-decor-item' }, [el('input', { type: 'checkbox', checked: shown, onchange: () => { profile.toggleDecor(id); } }), el('strong', { text: d.name }), el('span', { text: ` — ${d.about}` })]);
    }));
    showPanel(`Decorations (${owned.length})`, [el('p', { class: 'home-text', text: 'Tick what’s on display. Items that share a spot take turns (the last one ticked shows).' }), list]);
  }

  /** A scratch behind the ears: the pet purrs (or chirps), hearts float up, it wiggles happily. */
  function petThePet(p) {
    const a = st.petState.get(p.id);
    st.petting = { id: p.id, t: 1.6, name: p.name };
    if (a) { a.idle = 2; st.hero.face = a.x >= st.hero.x ? 1 : -1; }
    st.hearts.push(...Array.from({ length: 5 }, (_, k) => ({ x: (a?.x ?? st.hero.x) + (k - 2) * 5, y: FEET - 30, vy: -18 - k * 3, t: 1.2 + k * 0.12 })));
    sound.fx('pet', { pitch: { cat: 0, dog: -5, bunny: 5, frog: -8, fox: 2, owl: 7, slime: -10, dragon: -12 }[p.species] ?? 0 });
  }

  function leave() { const cb = onLeave; close(); cb(); }

  // --- input
  const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], USE = ['ArrowUp', 'KeyW', 'KeyE', 'Space', 'Enter'];
  function onKey(e) {
    if (!st || st.paused || e.target instanceof HTMLInputElement) return;
    if (e.code === 'Escape') { e.preventDefault(); leave(); return; }
    if (LEFT.includes(e.code) || RIGHT.includes(e.code)) { e.preventDefault(); st.keys.add(e.code); }
    if (USE.includes(e.code) && !e.repeat) { e.preventDefault(); use(nearest()); }
  }
  function onKeyUp(e) { st?.keys.delete(e.code); }
  panel.addEventListener('keydown', e => { if (e.code === 'Escape') { e.stopPropagation(); hidePanel(); } });

  // --- the picture
  function drawRooms(cam) {
    const X = x => Math.round(x - cam);
    // walls
    rect(screen, X(0), 12, 320, FLOOR - 12, HOME.WALL);
    for (let x = 0; x < 320; x += 10) rect(screen, X(x), 18, 2, FLOOR - 48, HOME.WALL_D);
    rect(screen, X(320), 12, 320, FLOOR - 12, HOME.WALL2);
    for (let y = 24; y < FLOOR - 30; y += 14) for (let x = 326 + ((y / 14) % 2) * 7; x < 640; x += 14) pset(screen, X(x), y, HOME.WALL2_D);
    // the game room (east): dark purple with little stars
    rect(screen, X(640), 12, 320, FLOOR - 12, HOME.WALL3);
    for (let y = 22; y < FLOOR - 34; y += 12) for (let x = 646 + ((y / 12) % 2) * 9; x < 960; x += 18) pset(screen, X(x), y, HOME.WALL3_D);
    for (const [x, y] of [[668, 30], [790, 24], [930, 40], [752, 58], [902, 70]]) { pset(screen, X(x), y, SLOT.WHITE); pset(screen, X(x) + 1, y, HOME.NEON); }
    rect(screen, X(0), FLOOR - 30, WORLD, 30, HC.WOOD); hline(screen, X(0), X(WORLD), FLOOR - 30, HC.WOOD_D);
    for (let x = 0; x < WORLD; x += 32) rect(screen, X(x), FLOOR - 28, 1, 28, HC.WOOD_D);
    rect(screen, X(0), 0, WORLD, 14, HOME.BEAM); hline(screen, X(0), X(WORLD), 13, SLOT.INK);
    // floor
    rect(screen, X(0), FLOOR, WORLD, H - FLOOR, HOME.FLOORC);
    for (let y = FLOOR + 6; y < H; y += 8) hline(screen, X(0), X(WORLD), y, HOME.FLOOR_D);
    for (let y = FLOOR; y < H; y += 8) for (let x = ((y / 8) % 2) * 24; x < WORLD; x += 48) rect(screen, X(x), y, 1, 8, HOME.FLOOR_D);
    hline(screen, X(0), X(WORLD), FLOOR, SLOT.INK);
    // the second archway (bedroom → game room)
    rect(screen, X(634), 12, 12, FLOOR - 12, HOME.BEAM); rect(screen, X(636), 12, 8, FLOOR - 12, HC.WOOD_D);
    // the arcade cabinet: a glowing screen with a little game on it
    rect(screen, X(694), 56, 44, FLOOR - 56, SLOT.INK); rect(screen, X(696), 58, 40, FLOOR - 58, HC.PURPLE);
    rect(screen, X(696), 58, 40, 10, HOME.NEON); text(screen, 'ARCADE', X(716), 61, SLOT.INK, { align: 'center' });
    rect(screen, X(700), 72, 32, 24, SLOT.INK); rect(screen, X(702), 74, 28, 20, HC.NIGHT);
    const t = Math.floor(st.clock * 6);
    for (let k = 0; k < 4; k++) pset(screen, X(704 + ((t + k * 7) % 24)), 78 + (k * 5) % 14, [HOME.SCREEN, HOME.NEON, SLOT.GOLD, SLOT.WHITE][k]);
    rect(screen, X(712 + (t % 3)), 89, 5, 3, SLOT.GOLD);
    rect(screen, X(698), 100, 36, 8, HC.PURPLE); ellipse(screen, X(708), 103, 3, 2, SLOT.RED); rect(screen, X(718), 102, 3, 3, HOME.SCREEN); rect(screen, X(724), 102, 3, 3, SLOT.GOLD);
    // the card table (green felt, a deck, a fanned hand) and a poster
    rect(screen, X(826), 118, 68, 6, HC.WOOD_D); rect(screen, X(828), 112, 64, 8, HOME.FELT);
    rect(screen, X(832), 124, 4, FLOOR - 124, HC.WOOD_D); rect(screen, X(884), 124, 4, FLOOR - 124, HC.WOOD_D);
    for (let k = 0; k < 3; k++) { rect(screen, X(840 + k * 7), 106 - k, 6, 8, SLOT.INK); rect(screen, X(841 + k * 7), 107 - k, 4, 6, [HC.CREAM, HC.PINK, HC.GOLD][k]); }
    rect(screen, X(868), 105, 8, 9, SLOT.INK); rect(screen, X(869), 106, 6, 7, HC.PURPLE);
    rect(screen, X(830), 34, 56, 40, SLOT.INK); rect(screen, X(832), 36, 52, 36, HC.NIGHT);
    text(screen, 'RIFT', X(858), 42, HOME.NEON, { align: 'center' }); text(screen, 'CARDS', X(858), 50, SLOT.GOLD, { align: 'center' });
    ellipse(screen, X(858), 63, 6, 4, HC.PURPLE); ellipse(screen, X(858), 63, 3, 2, HOME.SCREEN);
    const collected = Object.values(profile.cards ? profile.cards() : {}).reduce((a, b) => a + b, 0);
    if (collected) text(screen, `${collected} CARDS`, X(858), 96, SLOT.WHITE, { align: 'center', shadow: SLOT.INK });
    // the back door to the ranch (a window in it shows the grass)
    rect(screen, X(922), 58, 30, FLOOR - 58, SLOT.INK); rect(screen, X(924), 60, 26, FLOOR - 60, HC.WOOD_D); rect(screen, X(928), 64, 18, 16, HOME.SKY); rect(screen, X(928), 74, 18, 6, HC.GREEN);
    rect(screen, X(936), 64, 1, 16, HC.WOOD_D); ellipse(screen, X(945), 108, 2, 2, SLOT.GOLD);
    // the archway between the rooms
    rect(screen, X(314), 12, 12, FLOOR - 12, HOME.BEAM); rect(screen, X(316), 12, 8, FLOOR - 12, HC.WOOD_D);
    // front door
    rect(screen, X(14), 54, 32, FLOOR - 54, SLOT.INK); rect(screen, X(16), 56, 28, FLOOR - 56, HC.WOOD_D); rect(screen, X(19), 60, 22, 40, HC.WOOD); rect(screen, X(19), 104, 22, 42, HC.WOOD);
    ellipse(screen, X(38), 104, 2, 2, SLOT.GOLD);
    rect(screen, X(10), FLOOR + 2, 40, 6, HC.GREEN_D); text(screen, 'HI', X(30), FLOOR + 3, HC.SAND, { align: 'center' });
    // living room window
    rect(screen, X(68), 38, 44, 44, HOME.BEAM); rect(screen, X(70), 40, 40, 40, HOME.SKY);
    ellipse(screen, X(84), 52, 8, 3, SLOT.WHITE); ellipse(screen, X(98), 66, 6, 2, SLOT.WHITE);
    rect(screen, X(89), 40, 2, 40, HOME.BEAM); rect(screen, X(70), 59, 40, 2, HOME.BEAM);
    rect(screen, X(64), 36, 6, 50, HC.RED); rect(screen, X(110), 36, 6, 50, HC.RED);
    // the shelf, the trophy stand
    rect(screen, X(128), 78, 96, 4, HC.WOOD_D); rect(screen, X(132), 82, 3, 6, HC.WOOD_D); rect(screen, X(217), 82, 3, 6, HC.WOOD_D);
    rect(screen, X(226), 118, 20, FLOOR - 118, HC.WOOD); rect(screen, X(224), 116, 24, 3, HC.WOOD_D);
    // bedroom: wardrobe + mirror, window, bed, pet bed, nightstand
    rect(screen, X(346), 52, 52, FLOOR - 52, SLOT.INK); rect(screen, X(348), 54, 48, FLOOR - 54, HC.WOOD); rect(screen, X(371), 56, 2, FLOOR - 58, HC.WOOD_D);
    rect(screen, X(366), 96, 3, 8, SLOT.GOLD); rect(screen, X(375), 96, 3, 8, SLOT.GOLD); rect(screen, X(344), 48, 56, 5, HC.WOOD_D);
    rect(screen, X(402), 70, 16, 44, HC.GOLD_D); rect(screen, X(404), 72, 12, 40, HC.GLASS); line(screen, X(406), 76, X(412), 70 + 12, SLOT.WHITE);
    rect(screen, X(566), 30, 48, 40, HOME.BEAM); rect(screen, X(568), 32, 44, 36, HC.NIGHT);
    for (const [x, y] of [[574, 38], [590, 50], [604, 40], [580, 60]]) pset(screen, X(x), y, SLOT.WHITE);
    ellipse(screen, X(600), 44, 4, 4, HC.CREAM); rect(screen, X(589), 32, 2, 36, HOME.BEAM);
    rect(screen, X(626), 84, 10, FLOOR + 12 - 84, HC.WOOD_D); rect(screen, X(548), 118, 88, 20, HOME.BED_D); rect(screen, X(548), 110, 80, 16, HOME.BED);
    rect(screen, X(606), 104, 18, 10, HOME.PILLOW); rect(screen, X(548), 138, 4, 14, HC.WOOD_D);
    rect(screen, X(520), 120, 16, FLOOR - 120, HC.WOOD); rect(screen, X(518), 118, 20, 3, HC.WOOD_D);
    ellipse(screen, X(490), FLOOR + 6, 22, 7, SLOT.INK); ellipse(screen, X(490), FLOOR + 5, 21, 6, HC.PINK); ellipse(screen, X(490), FLOOR + 4, 15, 3, HC.CREAM);
    // the basket of critters (first visit)
    if (!profile.pets().length) {
      ellipse(screen, X(66), FLOOR + 4, 16, 7, SLOT.INK); rect(screen, X(51), FLOOR - 6, 30, 10, HC.SAND); ellipse(screen, X(66), FLOOR + 4, 15, 6, HC.SAND);
      for (let k = 0; k < 3; k++) { const bob = Math.round(Math.sin(st.clock * 3 + k * 2) * 1.5); ellipse(screen, X(56 + k * 10), FLOOR - 8 + bob, 4, 4, [HC.ORANGE, HC.BROWN, HC.CREAM][k]); pset(screen, X(55 + k * 10), FLOOR - 9 + bob, SLOT.INK); pset(screen, X(57 + k * 10), FLOOR - 9 + bob, SLOT.INK); }
      if (Math.floor(st.clock * 2) % 2) text(screen, '!', X(66), FLOOR - 26, SLOT.GOLD, { align: 'center', shadow: SLOT.INK, scale: 2 });
    }
  }

  function drawDecor(cam) {
    // one per spot: the last-ticked item showing for each spot (up to three on the shelf)
    const shown = profile.decor().filter(d => d.shown && DECOR[d.id]);
    const bySpot = Object.fromEntries(SPOTS.map(s => [s, []]));
    for (const d of shown) bySpot[DECOR[d.id].spot].push(DECOR[d.id]);
    for (const [spot, items] of Object.entries(bySpot)) {
      const places = SPOT_AT[spot] || [];
      const list = spot === 'shelf' ? items.slice(-3) : items.slice(-1);
      list.forEach((d, i) => { const [x, y] = places[i] || places[0]; d.paint(screen, x - cam, y); });
    }
  }

  function drawPets(cam, dt) {
    const pets = profile.pets(), active = profile.activePet();
    pets.slice(0, PET_RAMPS.length).forEach((p, k) => {
      const a = st.petState.get(p.id) || { x: 200 + k * 40, dir: k % 2 ? -1 : 1, idle: 0 };
      st.petState.set(p.id, a);
      let pose = 'sit', x = a.x, y = FEET - PET_H * 2 + 2;
      const petted = st.petting?.id === p.id;
      if (active?.id === p.id) { x = 490; y = FLOOR + 8 - PET_H * 2; pose = petted ? 'cheer' : 'sleep'; a.x = x; }
      else if (petted) { pose = Math.floor(st.clock * 8) % 2 ? 'cheer' : 'hop'; x = a.x; }
      else {
        // roam the house
        a.idle -= dt;
        if (a.idle <= 0) { a.x += a.dir * 22 * dt; pose = Math.floor(st.clock * 6) % 2 ? 'hop' : 'sit'; if (a.x < 60 || a.x > 900 || Math.random() < dt * 0.2) { a.dir *= -1; a.idle = 1 + Math.random() * 2; } }
        x = a.x;
      }
      const spr = paintPet(p, pose, Math.floor(st.clock * (petted ? 10 : 4)) % 2);
      blit(screen, spr, x - cam - PET_W, y, { scale: 2, flip: active?.id !== p.id && a.dir < 0, map: rampMaps[k] });
      if (pose === 'sleep') text(screen, 'Z', x - cam + 18, y - 4 - Math.floor(st.clock * 2) % 3 * 3, SLOT.WHITE, { shadow: SLOT.INK });
    });
  }

  function frameLoop(now) {
    if (!st) return;
    st.raf = requestAnimationFrame(frameLoop);
    if (st.lastDraw && now - st.lastDraw < MIN_FRAME_MS) return;
    const dt = st.lastDraw ? Math.min(0.1, (now - st.lastDraw) / 1000) : 0;
    st.lastDraw = now;
    st.clock += dt;
    // walking
    const dir = (RIGHT.some(k => st.keys.has(k)) ? 1 : 0) - (LEFT.some(k => st.keys.has(k)) ? 1 : 0);
    if (!st.paused && st.sleep <= 0) { st.hero.x = Math.max(22, Math.min(WORLD - 24, st.hero.x + dir * 90 * dt)); if (dir) st.hero.face = dir; }
    st.hero.moving = !st.paused && dir !== 0;
    st.sleep = Math.max(0, st.sleep - dt);
    const cam = Math.max(0, Math.min(WORLD - W, st.hero.x - W / 2));
    clear(screen, HOME.WALL);
    drawRooms(cam);
    drawDecor(cam);
    drawPets(cam, dt);
    if (st.petting) { st.petting.t -= dt; if (st.petting.t <= 0) st.petting = null; }
    for (const h of st.hearts) { h.t -= dt; h.y += h.vy * dt; h.x += Math.sin(st.clock * 6 + h.y) * 0.3; }
    st.hearts = st.hearts.filter(h => h.t > 0);
    for (const h of st.hearts) { const x = Math.round(h.x - cam), y = Math.round(h.y); pset(screen, x - 1, y, SLOT.RED); pset(screen, x + 1, y, SLOT.RED); rect(screen, x - 2, y + 1, 5, 1, SLOT.RED); rect(screen, x - 1, y + 2, 3, 1, SLOT.RED); pset(screen, x, y + 3, SLOT.RED); pset(screen, x - 1, y + 1, SLOT.WHITE); }
    // the hero (2×)
    const pose = st.sleep > 0 ? 'sit' : st.hero.moving ? 'run' : st.petting ? 'aim' : 'idle';
    const spr = st.sheet.get(st.hero.moving || st.sleep > 0 ? 'side' : 'front', pose, Math.floor(st.clock * 8) % 4, Math.floor(st.clock * 8) % 4);
    blit(screen, spr, st.hero.x - cam - HERO_W, FEET - HERO_H * 2, { scale: 2, flip: st.hero.moving && st.hero.face < 0 });
    if (st.sleep > 0) text(screen, 'ZZZ', st.hero.x - cam + 10, FEET - HERO_H * 2 - 6, SLOT.WHITE, { shadow: SLOT.INK });
    // what's here
    const h = !st.paused ? nearest() : null;
    if (h) {
      const label = `${h.label}`.toUpperCase();
      const x = Math.max(4 + textWidth(label) / 2, Math.min(W - 4 - textWidth(label) / 2, st.hero.x - cam)), y = FEET - HERO_H * 2 - 16;
      rect(screen, x - textWidth(label) / 2 - 4, y, textWidth(label) + 8, 11, SLOT.PANEL);
      text(screen, label, x, y + 3, SLOT.GOLD, { align: 'center' });
      poly(screen, [[x - 3, y + 11], [x + 3, y + 11], [x, y + 14]], SLOT.PANEL);
    }
    const hint = 'A D WALK  /  UP OR E USE  /  ESC TOWN';
    rect(screen, 2, H - 10, textWidth(hint) + 6, 9, SLOT.PANEL); text(screen, hint, 5, H - 8, SLOT.WHITE);
    prompt.hidden = true;
    if (!st.palette || st.paletteDirty) { st.palette = palette(); st.paletteDirty = false; }
    present(screen, st.palette, target);
  }

  function close() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    st = null;
    canvas.hidden = true; panel.hidden = true; prompt.hidden = true;
    document.body.classList.remove('in-home');
  }

  return {
    get open() { return !!st; },
    open({ design, x = 44 }) {
      close();
      st = { design, sheet: createHeroSheet(design), hero: { x, face: 1, moving: false }, keys: new Set(), clock: 0, lastDraw: 0, raf: 0, paused: false, sleep: 0, palette: null, paletteDirty: true, petState: new Map(), petting: null, hearts: [] };
      canvas.hidden = false;
      document.body.classList.add('in-home');
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKeyUp, true);
      st.raf = requestAnimationFrame(frameLoop);
      if (!profile.get().homeVisited) { profile.markHomeVisited(); setTimeout(() => st && !profile.pets().length && adoptPanel(), 600); }
    },
    /** Back from the wardrobe (or anything that changed your look or pets). */
    resume({ design } = {}) {
      if (!st) return;
      if (design) { st.design = design; st.sheet = createHeroSheet(design); }
      st.paletteDirty = true; st.paused = false; st.keys.clear();
      canvas.hidden = false;
    },
    hideCanvas() { canvas.hidden = true; },
    close,
  };
}
