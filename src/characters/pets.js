/**
 * Pets — a little companion that goes everywhere you go.
 *
 *   const pet = makePet(seed, { species });     // JSON-friendly; saved in the profile
 *   petParts(pet, state, time)                  // 3D: boxes (avatar-style parts)
 *   createPetFollower(pet)                      // 3D: trots after you along your footsteps
 *   paintPet(pet, pose, frame)                  // 2D: a 22×18 pixel sprite (palette PET ramp)
 *
 * How pets fit the game (cosmetic by design — they never change a fight, so the balance
 * checks stay true):
 *   - 3D: the pet follows your trail of footsteps (only where you stood on something), so it
 *     hops over the gaps you jumped and never floats over the void; it catches up with a
 *     poof if you get too far ahead (respawns, rifts, dashes)
 *   - 2D: it sits on the battle HUD and reacts — hops at a good move, hides its eyes when
 *     you're hit, cheers when you win
 *   - home: pets live there (the active one sleeps in the bedroom's pet bed)
 *   - getting one: a basket of three at your door on your first visit home; after a run with
 *     three stars or more, a stray might follow you home
 */
import { mulberry32, hashSeed } from '../levels/generator.js';
import { compose, translation, scaling, rotationY, rotationX, rotationZ } from '../engine/mat4.js';
import { createSurface, rect, pset, ellipse, line, poly, outline } from '../engine/pixel.js';
import { hexToRgb } from './character.js';

export const SPECIES = {
  cat: { name: 'Cat', rarity: 'common', size: 0.42 },
  dog: { name: 'Pup', rarity: 'common', size: 0.46 },
  bunny: { name: 'Bunny', rarity: 'common', size: 0.4 },
  frog: { name: 'Frog', rarity: 'common', size: 0.36 },
  fox: { name: 'Fox', rarity: 'rare', size: 0.44 },
  owl: { name: 'Owl', rarity: 'rare', size: 0.42 },
  slime: { name: 'Slime', rarity: 'epic', size: 0.4 },
  dragon: { name: 'Dragonling', rarity: 'legendary', size: 0.48 },
};
export const SPECIES_IDS = Object.keys(SPECIES);

const COATS = {
  cat: [['#f2a65a', '#fff3e0'], ['#5b5b66', '#e8e8ee'], ['#2a2a30', '#ffffff'], ['#f5efe6', '#f5efe6'], ['#c98b4c', '#f2dcc0']],
  dog: [['#c98b4c', '#f5e6d0'], ['#3a2c24', '#c9a37a'], ['#f0e0c0', '#ffffff'], ['#7a7a82', '#dcdce2'], ['#b85c38', '#f3d2b3']],
  bunny: [['#f5f0ea', '#ffd6de'], ['#8c6a4f', '#f0e2d0'], ['#b0b0b8', '#ffffff'], ['#3a3036', '#ebe3e6']],
  frog: [['#5fbf4a', '#e8f2a0'], ['#3aa6a0', '#d0f0e6'], ['#e0c040', '#fff6c0'], ['#d94a6a', '#ffd0da']],
  fox: [['#e8742c', '#ffffff'], ['#d9d9e0', '#ffffff'], ['#8a4a2c', '#f0e0d0']],
  owl: [['#8c6a4f', '#f0e2c8'], ['#e8e8ee', '#ffffff'], ['#5a5066', '#d8d0e6']],
  slime: [['#5ee07a', '#b8ffc8'], ['#5ab4ff', '#c8e6ff'], ['#ff7ab8', '#ffd0e6'], ['#b58cff', '#e6d8ff']],
  dragon: [['#4caf6a', '#f2e08c'], ['#d94a4a', '#ffd68c'], ['#5a6ad9', '#c8d8ff'], ['#8c4dcc', '#ffc8f0']],
};
const ACCENTS = ['#ff6b8a', '#ffd23f', '#5ef0ff', '#7bd88f', '#b58cff', '#ff9d4a'];
const NAMES = ['Biscuit', 'Noodle', 'Pickles', 'Mochi', 'Waffles', 'Bean', 'Sprout', 'Pudding', 'Tater', 'Gizmo', 'Pebble', 'Nugget', 'Muffin', 'Button',
  'Squish', 'Fig', 'Taco', 'Dumpling', 'Crouton', 'Bubbles', 'Marbles', 'Pretzel', 'Sushi', 'Toast', 'Zigzag', 'Jellybean'];
export const PATTERNS = ['plain', 'spots', 'stripes', 'patch', 'socks'];

/** Species odds for a stray by the run's stars (more stars, rarer friends). */
export function straySpecies(rng, stars = 3) {
  const pool = stars >= 5 ? ['fox', 'owl', 'slime', 'slime', 'dragon'] : stars >= 4 ? ['cat', 'dog', 'fox', 'owl', 'slime'] : ['cat', 'dog', 'bunny', 'frog', 'fox'];
  return pool[Math.floor(rng() * pool.length)];
}

export function makePet(seed, { species = null } = {}) {
  const rng = mulberry32(hashSeed('pet', seed));
  species = SPECIES[species] ? species : SPECIES_IDS[Math.floor(rng() * 4)];
  const [body, belly] = COATS[species][Math.floor(rng() * COATS[species].length)];
  return {
    id: `pet-${seed}`,
    seed,
    species,
    name: NAMES[Math.floor(rng() * NAMES.length)],
    rarity: SPECIES[species].rarity,
    colors: { body, belly, accent: ACCENTS[Math.floor(rng() * ACCENTS.length)], eyes: '#1b1028' },
    pattern: species === 'slime' || species === 'frog' ? (rng() < 0.5 ? 'spots' : 'plain') : PATTERNS[Math.floor(rng() * PATTERNS.length)],
    collar: rng() < 0.6,
  };
}

// ---------------------------------------------------------------------------
// 3D
// ---------------------------------------------------------------------------
const rgb = hex => hexToRgb(hex);
const shade = (c, k) => c.map(v => Math.min(1, v * k));
const BLACK = [0.08, 0.07, 0.1], WHITE = [0.97, 0.97, 0.95], PINK = [0.98, 0.58, 0.65];

/**
 * The pet's boxes: state { x, y, z, yaw, hop (0..1 of a hop), moving (0..1), sit, look, blink }.
 * Feet at (x, y, z), facing yaw (+z forward at yaw 0).
 */
export function petParts(pet, st, time = 0) {
  const S = (SPECIES[pet.species]?.size ?? 0.42) * 1.25;
  const C = { body: rgb(pet.colors.body), belly: rgb(pet.colors.belly), accent: rgb(pet.colors.accent) };
  const parts = [];
  const squash = pet.species === 'slime' ? 1 + 0.15 * Math.sin(time * 6 + (st.moving || 0) * 4) : 1;
  const lift = (st.hop || 0) > 0 ? Math.sin(st.hop * Math.PI) * (st.hopHeight ?? 0.35) : 0;
  const root = compose(translation(st.x, st.y + lift, st.z), rotationY(st.yaw || 0), scaling(S, S * squash, S));
  const box = (m, cx, cy, cz, sx, sy, sz, color, glow = 0) => parts.push({ matrix: compose(m, translation(cx, cy, cz), scaling(sx, sy, sz)), color, glow });
  const step = Math.sin(time * 12) * (st.moving || 0);
  const sit = st.sit ? 1 : 0;
  const sp = pet.species;
  const blink = st.blink ? 0.15 : 1;
  const eyes = (m, y, z, spread, size = 0.12) => {
    for (const s of [1, -1]) {
      box(m, s * spread, y, z, size, size * blink, 0.04, BLACK);
      box(m, s * spread + 0.03, y + 0.03, z + 0.021, 0.04, 0.04 * blink, 0.01, WHITE);
    }
  };
  if (sp === 'slime') {
    box(root, 0, 0.42, 0, 0.9, 0.84, 0.9, C.body);
    box(root, 0, 0.62, 0.02, 0.7, 0.5, 0.86, shade(C.body, 1.08));
    box(root, -0.25, 0.75, 0.3, 0.14, 0.14, 0.3, WHITE, 0.5);                            // shine
    eyes(root, 0.55, 0.46, 0.18, 0.13);
    box(root, 0, 0.36, 0.46, 0.18, 0.05, 0.02, BLACK);
    if (pet.pattern === 'spots') for (const [x, y] of [[0.3, 0.3], [-0.3, 0.2], [0.2, 0.7]]) box(root, x, y, 0.44, 0.1, 0.1, 0.04, C.belly);
    return parts;
  }
  // legs
  const legs = sp === 'owl' ? [[0.12, 0.08], [-0.12, 0.08]] : [[0.18, 0.22], [-0.18, 0.22], [0.18, -0.22], [-0.18, -0.22]];
  if (sp !== 'frog') legs.forEach(([x, z], i) => box(root, x, 0.08 + (i % 2 ? -1 : 1) * step * 0.04, z + (i % 2 ? 1 : -1) * step * 0.06, sp === 'owl' ? 0.1 : 0.13, 0.18 - sit * (z < 0 ? 0.08 : 0), 0.13, pet.pattern === 'socks' ? C.belly : shade(C.body, 0.9)));
  // body
  const bodyY = sp === 'owl' ? 0.42 : sp === 'frog' ? 0.2 : 0.34 - sit * 0.05;
  const bodyLen = sp === 'owl' ? 0.5 : sp === 'frog' ? 0.7 : 0.72;
  const body = compose(root, translation(0, bodyY, -0.02), rotationX(sit * -0.35));
  box(body, 0, 0, 0, sp === 'frog' ? 0.75 : sp === 'owl' ? 0.6 : 0.5, sp === 'owl' ? 0.6 : 0.36, bodyLen, C.body);
  box(body, 0, -0.1, 0.06, sp === 'owl' ? 0.46 : 0.36, 0.2, bodyLen * (sp === 'owl' ? 0.95 : 0.6), C.belly);
  if (pet.pattern === 'stripes') for (const z of [-0.2, 0, 0.2]) box(body, 0, 0.1, z, 0.52, 0.2, 0.06, shade(C.body, 0.72));
  if (pet.pattern === 'spots') for (const [x, z] of [[0.15, -0.15], [-0.12, 0.1], [0.05, 0.22]]) box(body, x, 0.15, z, 0.12, 0.1, 0.12, C.belly);
  if (pet.pattern === 'patch') box(body, 0.16, 0.12, -0.1, 0.22, 0.16, 0.24, shade(C.body, 0.65));
  // head
  const headY = sp === 'owl' ? 0.82 : sp === 'frog' ? 0.36 : 0.62 - sit * 0.02;
  const headZ = sp === 'owl' ? 0.02 : sp === 'frog' ? 0.28 : 0.36;
  const look = (st.look || 0) * 0.5;
  const head = compose(root, translation(0, headY, headZ), rotationY(look), rotationZ(Math.sin(time * 2) * 0.05));
  const hw = sp === 'frog' ? 0.62 : sp === 'owl' ? 0.56 : 0.44;
  box(head, 0, 0, 0, hw, sp === 'owl' ? 0.44 : 0.38, sp === 'frog' ? 0.36 : 0.38, C.body);
  if (pet.collar) box(root, 0, headY - 0.22, headZ - 0.04, 0.36, 0.06, 0.3, C.accent);
  switch (sp) {
    case 'cat':
      for (const s of [1, -1]) box(compose(head, translation(s * 0.14, 0.24, -0.02), rotationZ(s * -0.35)), 0, 0, 0, 0.1, 0.14, 0.08, C.body);
      eyes(head, 0.04, 0.2, 0.1); box(head, 0, -0.06, 0.2, 0.06, 0.04, 0.02, PINK);
      for (const s of [1, -1]) box(head, s * 0.22, -0.06, 0.19, 0.14, 0.012, 0.01, WHITE);
      box(compose(root, translation(0, 0.45, -0.42), rotationX(-0.9 + Math.sin(time * 3) * 0.2)), 0, 0.15, 0, 0.09, 0.36, 0.09, C.body);
      break;
    case 'dog':
      for (const s of [1, -1]) box(compose(head, translation(s * 0.25, 0.05, -0.02), rotationZ(s * (0.25 + step * 0.2))), 0, -0.08, 0, 0.07, 0.24, 0.14, shade(C.body, 0.75));
      box(head, 0, -0.08, 0.22, 0.2, 0.16, 0.14, C.belly); box(head, 0, -0.02, 0.3, 0.08, 0.06, 0.04, BLACK);
      eyes(head, 0.07, 0.2, 0.11); box(head, 0.04, -0.17, 0.26, 0.06, 0.08, 0.04, PINK);
      box(compose(root, translation(0, 0.42, -0.4), rotationZ(Math.sin(time * 14) * 0.5)), 0, 0.1, 0, 0.08, 0.24, 0.08, C.body);
      break;
    case 'bunny':
      for (const s of [1, -1]) box(compose(head, translation(s * 0.1, 0.32, -0.02), rotationZ(s * (-0.12 + Math.sin(time * 2.5 + s) * 0.06))), 0, 0.08, 0, 0.09, 0.36, 0.06, C.body);
      eyes(head, 0.05, 0.2, 0.12); box(head, 0, -0.05, 0.2, 0.05, 0.04, 0.02, PINK);
      box(head, 0, -0.12, 0.2, 0.07, 0.06, 0.02, WHITE);
      box(root, 0, 0.38, -0.42, 0.16, 0.16, 0.12, C.belly);
      break;
    case 'frog':
      for (const s of [1, -1]) { box(head, s * 0.2, 0.24, 0.02, 0.18, 0.18, 0.18, C.body); box(head, s * 0.2, 0.26, 0.11, 0.1, 0.1 * blink, 0.02, BLACK); box(head, s * 0.2 + 0.025, 0.29, 0.12, 0.03, 0.03, 0.01, WHITE); }
      box(head, 0, -0.06, 0.185, 0.42, 0.03, 0.01, BLACK);
      for (const s of [1, -1]) box(root, s * 0.34, 0.06, -0.12 + step * 0.05, 0.2, 0.1, 0.3, shade(C.body, 0.9));
      break;
    case 'fox':
      for (const s of [1, -1]) box(compose(head, translation(s * 0.14, 0.26, -0.02), rotationZ(s * -0.2)), 0, 0, 0, 0.11, 0.2, 0.08, C.body);
      box(head, 0, -0.08, 0.24, 0.16, 0.12, 0.2, C.belly); box(head, 0, -0.04, 0.35, 0.06, 0.05, 0.03, BLACK);
      eyes(head, 0.06, 0.2, 0.11, 0.1);
      { const tail = compose(root, translation(0, 0.36, -0.42), rotationX(-0.6 + Math.sin(time * 3) * 0.15), rotationZ(Math.sin(time * 2.2) * 0.3)); box(tail, 0, 0.1, -0.05, 0.2, 0.2, 0.38, C.body); box(tail, 0, 0.1, -0.3, 0.16, 0.16, 0.14, WHITE); }
      break;
    case 'owl':
      for (const s of [1, -1]) { box(head, s * 0.14, 0.04, 0.2, 0.2, 0.2, 0.03, WHITE); box(head, s * 0.14, 0.04, 0.22, 0.1, 0.1 * blink, 0.02, BLACK); box(head, s * 0.2, 0.26, 0, 0.08, 0.12, 0.08, shade(C.body, 0.8)); }
      box(head, 0, -0.08, 0.22, 0.07, 0.09, 0.06, [0.95, 0.7, 0.2]);
      for (const s of [1, -1]) box(compose(root, translation(s * 0.33, 0.45, -0.02), rotationZ(s * (0.1 + Math.abs(step) * 0.6))), 0, 0, 0, 0.08, 0.36, 0.34, shade(C.body, 0.8));
      break;
    case 'dragon':
      for (const s of [1, -1]) box(compose(head, translation(s * 0.12, 0.24, -0.08), rotationX(-0.5)), 0, 0.06, 0, 0.06, 0.18, 0.06, C.belly);
      box(head, 0, -0.07, 0.24, 0.26, 0.16, 0.2, C.body); for (const s of [1, -1]) box(head, s * 0.06, -0.03, 0.345, 0.03, 0.03, 0.01, BLACK);
      eyes(head, 0.08, 0.2, 0.12, 0.1);
      for (const s of [1, -1]) box(compose(root, translation(s * 0.3, 0.55, -0.05), rotationZ(s * (0.5 + Math.sin(time * 8) * 0.4))), s * 0.15, 0, 0, 0.34, 0.04, 0.3, C.accent);
      { const tail = compose(root, translation(0, 0.3, -0.42), rotationX(-0.35), rotationY(Math.sin(time * 2.5) * 0.4)); box(tail, 0, 0, -0.15, 0.12, 0.12, 0.36, C.body); box(tail, 0, 0.06, -0.36, 0.12, 0.14, 0.08, C.accent); }
      for (const z of [-0.25, 0, 0.2]) box(body, 0, 0.22, z, 0.06, 0.1, 0.08, C.accent);
      break;
  }
  return parts;
}

export const PET_FOLLOW = {
  behind: 1.25,         // it keeps this far behind you along your footsteps
  speed: 6.5,           // m/s at most
  crumb: 0.22,          // a footstep every this far
  catchUp: 9,           // further back than this (along the trail) and it poofs to you
  hopGap: 0.5,          // a gap (or a step up) larger than this between footsteps: hop it
};

/**
 * The 3D follower. update(player, dt) every step; parts(time) to draw; reset(player) after
 * a level change / respawn. It walks the breadcrumbs of where you stood.
 */
export function createPetFollower(pet) {
  const crumbs = [];
  const st = { x: 0, y: 0, z: 0, yaw: 0, hop: 0, hopHeight: 0.35, moving: 0, sit: true, look: 0, blink: false };
  let from = null, hopDur = 0, blinkT = 2, idle = 0, poofed = false;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const follower = {
    pet, state: st,
    reset(p) {
      crumbs.length = 0;
      Object.assign(st, { x: p.x, y: p.y, z: p.z, hop: 0, moving: 0, sit: true });   // where you stand is solid ground
      crumbs.push({ x: st.x, y: st.y, z: st.z });
      from = null;
    },
    /** Poofed since the last call? (so the game can puff particles) */
    takePoof() { const p = poofed; poofed = false; return p; },
    update(p, dt) {
      if (!crumbs.length) this.reset(p);
      const last = crumbs.at(-1);
      if (p.grounded && (dist(last, p) > PET_FOLLOW.crumb || Math.abs(last.y - p.y) > 0.1)) crumbs.push({ x: p.x, y: p.y, z: p.z });
      if (crumbs.length > 400) crumbs.splice(0, crumbs.length - 400);
      // how far back along the trail is it?
      let along = dist(st, p);
      if (along > PET_FOLLOW.catchUp || Math.abs(st.y - p.y) > 6) {
        this.reset(p); poofed = true; return;
      }
      // blink now and then
      blinkT -= dt; if (blinkT < 0) { st.blink = true; if (blinkT < -0.12) { st.blink = false; blinkT = 1.5 + Math.random() * 3; } }
      if (st.hop > 0) {                                   // mid-hop between two footsteps
        st.hop += dt / hopDur;
        const k = Math.min(1, st.hop);
        st.x = from.a.x + (from.b.x - from.a.x) * k; st.z = from.a.z + (from.b.z - from.a.z) * k; st.y = from.a.y + (from.b.y - from.a.y) * k;
        if (st.hop >= 1) st.hop = 0;
        return;
      }
      // the next footstep it hasn't reached yet — but stay `behind` from you
      while (crumbs.length > 1 && dist(crumbs[0], st) < 0.05) crumbs.shift();
      const target = crumbs[0];
      const near = dist(st, p) < PET_FOLLOW.behind && Math.abs(st.y - p.y) < 0.5;
      if (near || !target) {
        st.moving = Math.max(0, st.moving - dt * 4);
        idle += dt;
        st.sit = idle > 0.8;
        st.look = Math.sin(idle * 0.7) * (idle > 3 ? 1 : 0);
        const want = Math.atan2(p.x - st.x, p.z - st.z);
        st.yaw += Math.atan2(Math.sin(want - st.yaw), Math.cos(want - st.yaw)) * Math.min(1, dt * 5);
        return;
      }
      idle = 0; st.sit = false; st.look = 0;
      const d = dist(st, target), dy = target.y - st.y;
      if (d > PET_FOLLOW.hopGap || Math.abs(dy) > 0.25) {   // a gap or a step: hop over it
        from = { a: { x: st.x, y: st.y, z: st.z }, b: { ...target } };
        hopDur = Math.max(0.25, Math.min(0.8, d / PET_FOLLOW.speed + 0.15));
        st.hopHeight = 0.3 + Math.max(0, dy) + d * 0.15;
        st.hop = 0.0001;
        crumbs.shift();
        st.yaw = Math.atan2(target.x - st.x, target.z - st.z);
        return;
      }
      const speed = Math.min(PET_FOLLOW.speed, 2 + dist(st, p) * 1.6);
      const k = Math.min(1, speed * dt / Math.max(d, 1e-6));
      st.x += (target.x - st.x) * k; st.z += (target.z - st.z) * k; st.y = target.y;
      st.yaw = Math.atan2(target.x - st.x, target.z - st.z) || st.yaw;
      st.moving = Math.min(1, st.moving + dt * 6);
    },
    parts(time) { return petParts(pet, st, time); },
  };
  return follower;
}

// ---------------------------------------------------------------------------
// 2D (palette PET ramp, slots 96–103)
// ---------------------------------------------------------------------------
export const PR = { BODY: 96, BODY_D: 97, BELLY: 98, ACCENT: 99, ACCENT_D: 100, EYE: 101, NOSE: 102, WHITE: 103 };
export const PET_W = 22, PET_H = 18;

/** The pet's 8 colours for the battle palette (engine/palette.js buildScheme pet). */
export function petBaseColors(pet) {
  const c = hex => hexToRgb(hex).map(v => Math.round(v * 255));
  const k = (v, f) => v.map(x => Math.round(x * f));
  return [c(pet.colors.body), k(c(pet.colors.body), 0.72), c(pet.colors.belly), c(pet.colors.accent), k(c(pet.colors.accent), 0.72), [27, 16, 40], [250, 140, 160], [255, 252, 245]];
}

/**
 * A side-view sprite (facing right): pose 'sit' | 'hop' | 'cheer' | 'hide' | 'sleep'; frame (0/1) wiggles.
 */
export function paintPet(pet, pose = 'sit', frame = 0) {
  const s = createSurface(PET_W, PET_H);
  const sp = pet.species, B = PR.BODY, D = PR.BODY_D, L = PR.BELLY;
  const up = pose === 'hop' || pose === 'cheer' ? 2 : 0;
  const g = PET_H - 1 - up;                               // feet
  const eye = (x, y) => { if (pose === 'sleep' || pose === 'hide') rect(s, x - 1, y, 2, 1, PR.EYE); else { rect(s, x, y - 1, 2, 2, PR.EYE); pset(s, x + 1, y - 1, PR.WHITE); } };
  if (sp === 'slime') {
    const w = pose === 'hop' ? 7 : 8, h = pose === 'hop' ? 7 : 6;
    ellipse(s, 11, g - h, w, h, B); ellipse(s, 11, g - h + 2, w - 1, h - 2, B);
    rect(s, 4, g - 2, 15, 2, D); pset(s, 7, g - h - 3, PR.WHITE); pset(s, 8, g - h - 3, PR.WHITE);
    eye(9, g - h); eye(14, g - h); if (pose !== 'hide') rect(s, 11, g - h + 3, 2, 1, PR.EYE);
  } else if (sp === 'frog') {
    ellipse(s, 11, g - 4, 8, 4, B); ellipse(s, 11, g - 3, 6, 2, L);
    ellipse(s, 7, g - 8, 2.5, 2.5, B); ellipse(s, 15, g - 8, 2.5, 2.5, B); eye(6, g - 8); eye(14, g - 8);
    rect(s, 8, g - 4, 7, 1, PR.EYE); rect(s, 2, g - 1, 4, 2, D); rect(s, 16, g - 1, 4, 2, D);
  } else if (sp === 'owl') {
    ellipse(s, 11, g - 7, 6, 7, B); ellipse(s, 11, g - 5, 4, 5, L);
    ellipse(s, 9, g - 10, 2.5, 2.5, PR.WHITE); ellipse(s, 13, g - 10, 2.5, 2.5, PR.WHITE); eye(9, g - 10); eye(13, g - 10);
    pset(s, 11, g - 8, PR.ACCENT); rect(s, 7, g - 15, 2, 2, D); rect(s, 14, g - 15, 2, 2, D);
    rect(s, 4 - (pose === 'cheer' ? 2 : 0), g - 8 - (pose === 'cheer' ? 3 : 0), 2, 6, D); rect(s, 16 + (pose === 'cheer' ? 2 : 0), g - 8 - (pose === 'cheer' ? 3 : 0), 2, 6, D);
    rect(s, 9, g, 1, 1, PR.ACCENT); rect(s, 13, g, 1, 1, PR.ACCENT);
  } else {
    // four-legged: body, head on the right, tail on the left
    const sitting = pose === 'sit' || pose === 'sleep' || pose === 'hide';
    rect(s, 5, g - 7, 10, 5, B); rect(s, 6, g - 4, 8, 2, L);
    if (pet.pattern === 'stripes') for (const x of [7, 10, 13]) rect(s, x, g - 7, 1, 3, D);
    if (pet.pattern === 'spots') { pset(s, 8, g - 6, L); pset(s, 12, g - 6, L); }
    const legs = sitting ? [[6, 2], [12, 2]] : [[6, frame ? 2 : 3], [8, frame ? 3 : 2], [12, frame ? 2 : 3], [14, frame ? 3 : 2]];
    for (const [x, h] of legs) rect(s, x, g - 2, 1 + (sitting ? 1 : 0), h, pet.pattern === 'socks' ? L : D);
    const hx = 15, hy = g - 11;
    rect(s, hx - 1, hy, 6, 6, B);
    if (sp === 'dog') { rect(s, hx + 4, hy + 3, 3, 3, L); pset(s, hx + 6, hy + 3, PR.EYE); rect(s, hx - 1, hy, 2, 5, D); }
    else if (sp === 'fox') { rect(s, hx + 4, hy + 3, 3, 2, L); pset(s, hx + 6, hy + 3, PR.EYE); poly(s, [[hx - 1, hy], [hx + 1, hy - 3], [hx + 2, hy]], B); poly(s, [[hx + 2, hy], [hx + 4, hy - 3], [hx + 5, hy]], B); }
    else if (sp === 'bunny') { rect(s, hx, hy - 5, 2, 6, B); rect(s, hx + 3, hy - 6, 2, 7, B); pset(s, hx + 5, hy + 3, PR.NOSE); }
    else if (sp === 'dragon') { rect(s, hx + 4, hy + 2, 3, 3, B); pset(s, hx + 6, hy + 2, PR.EYE); rect(s, hx, hy - 2, 1, 2, L); rect(s, hx + 3, hy - 2, 1, 2, L); rect(s, 8, g - 10, 5, 2, PR.ACCENT); rect(s, 9, g - 12, 3, 2, PR.ACCENT); }
    else { poly(s, [[hx - 1, hy], [hx, hy - 3], [hx + 2, hy]], B); poly(s, [[hx + 2, hy], [hx + 4, hy - 3], [hx + 5, hy]], B); pset(s, hx + 5, hy + 3, PR.NOSE); }   // cat
    eye(hx + 2, hy + 2);
    if (pose === 'hide') { rect(s, hx + 1, hy + 1, 4, 3, D); }
    if (pet.collar) rect(s, hx - 1, hy + 6, 5, 1, PR.ACCENT);
    // tail
    if (sp === 'fox') { rect(s, 1, g - 9 + (frame ? 1 : 0), 4, 4, B); rect(s, 0, g - 9 + (frame ? 1 : 0), 2, 2, PR.WHITE); }
    else if (sp === 'bunny') ellipse(s, 4, g - 5, 2, 2, PR.WHITE);
    else if (sp === 'dragon') { line(s, 4, g - 5, 0, g - 8 + frame, B); pset(s, 0, g - 9 + frame, PR.ACCENT); }
    else line(s, 4, g - 6, 1, g - 10 - frame, B);
  }
  if (pose === 'cheer') { pset(s, 2, 1, PR.ACCENT); pset(s, 19, 2, PR.ACCENT); pset(s, 11, 0, PR.WHITE); }
  if (pose === 'sleep') { pset(s, 19, 2, PR.WHITE); pset(s, 20, 1, PR.WHITE); }
  return outline(s, 1);
}
