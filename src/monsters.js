/**
 * Monsters — seeded, generative pixel-art bosses and minions for the 2D battles.
 *
 *   const m = generateMonster(seed, { role: 'walker', size: 48 });
 *   m.params           the recipe (body shape, eyes, mouth, horns, limbs, pattern…)
 *   m.frame(options)   → a 48×48 indexed surface (palette.js BR.* ramp), cached
 *
 * A monster is built from parts, always left/right symmetric, then shaded (light from
 * the top left) and outlined:
 *   body      a superellipse (roundness, squash, pear / top-heavy taper, bumpy edge)
 *   eyes      1–3, round with pupils, maybe angry brows or heavy lids
 *   mouth     grin with teeth, fangs, an O, a zigzag, or a beak
 *   on top    horns, antennae, ears, a crest of spikes, a single horn — or nothing
 *   limbs     stubby legs, claws at the sides, tentacles, wings (flyers)
 *   pattern   spots, stripes, a belly patch
 *
 * Mechanical checks (checkMonster) keep the generator from going too wild: the
 * sprite must be one connected piece, fill enough of its box to read as a creature,
 * be big enough, keep its outline inside the canvas and show its eyes. A recipe
 * that fails is re-rolled with the next sub-seed.
 */
import { createSurface, rect, pset, pget, ellipse, line, outline, poly } from './pixel.js';
import { BR, MN, SLOT } from './palette.js';
import { mulberry32, hashSeed } from './levelGenerator.js';

export const ROLES = {
  walker: { bodies: ['blob', 'brute', 'bean'], limbs: ['legs', 'legs', 'claws', 'none'] },
  brute: { bodies: ['brute', 'brute', 'bean'], limbs: ['arms', 'arms', 'legs'] },
  flyer: { bodies: ['blob', 'bean', 'orb'], limbs: ['wings'] },
  dancer: { bodies: ['blob', 'bean', 'orb', 'jelly'], limbs: ['legs', 'tentacles', 'claws'] },
  floater: { bodies: ['jelly', 'orb', 'ghost'], limbs: ['tentacles', 'none', 'wings'] },
};

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, a, b) => a + (b - a) * rng();

/** A random recipe for a role. */
export function monsterRecipe(seed, role = 'walker') {
  const rng = mulberry32(seed >>> 0);
  const R = ROLES[role] || ROLES.walker;
  const body = pick(rng, R.bodies);
  const shapes = {
    blob: { w: between(rng, 0.62, 0.8), h: between(rng, 0.5, 0.66), n: between(rng, 1.8, 2.6), taper: between(rng, -0.25, 0.1) },
    brute: { w: between(rng, 0.7, 0.86), h: between(rng, 0.62, 0.76), n: between(rng, 2.6, 3.6), taper: between(rng, 0.05, 0.3) },
    bean: { w: between(rng, 0.5, 0.62), h: between(rng, 0.68, 0.8), n: between(rng, 2, 3), taper: between(rng, -0.2, 0.2) },
    orb: { w: between(rng, 0.6, 0.72), h: between(rng, 0.6, 0.72), n: 2, taper: 0 },
    jelly: { w: between(rng, 0.66, 0.8), h: between(rng, 0.48, 0.6), n: between(rng, 2, 2.8), taper: between(rng, 0.1, 0.35), flatBottom: true },
    ghost: { w: between(rng, 0.56, 0.68), h: between(rng, 0.68, 0.8), n: between(rng, 2, 2.6), taper: -0.1, flatBottom: true },
  }[body];
  return {
    seed, role, body, ...shapes,
    bumps: rng() < 0.5 ? 0 : Math.floor(between(rng, 3, 7)),
    bumpSize: between(rng, 0.03, 0.07),
    eyes: pick(rng, [2, 2, 2, 1, 3]),
    eyeSize: pick(rng, [2, 3, 3, 4]),
    eyeSpread: between(rng, 0.22, 0.36),
    eyeHeight: between(rng, 0.28, 0.42),
    brows: pick(rng, ['none', 'angry', 'angry', 'lids']),
    mouth: body === 'orb' && role === 'flyer' ? 'beak' : pick(rng, role === 'flyer' ? ['beak', 'beak', 'fangs', 'grin'] : ['grin', 'fangs', 'o', 'zigzag', 'grin']),
    mouthWidth: between(rng, 0.28, 0.5),
    top: pick(rng, ['horns', 'antennae', 'ears', 'crest', 'unihorn', 'none', 'horns', 'tuft']),
    limbs: pick(rng, R.limbs),
    pattern: pick(rng, ['spots', 'stripes', 'belly', 'belly', 'none']),
    cheeks: rng() < 0.4,
  };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------
/** Body half-width at row y (0..1 from the top), for a recipe. */
function halfWidthAt(r, v, size) {
  // v in -1..1 (top..bottom of the body ellipse)
  if (Math.abs(v) > 1) return 0;
  const n = r.n;
  let base = Math.pow(1 - Math.pow(Math.abs(v), n), 1 / n);
  if (r.flatBottom && v > 0.55) base = Math.max(base, Math.pow(1 - Math.pow(0.55, n), 1 / n));
  const taper = 1 + r.taper * v;                       // > 0: wider at the bottom
  const bump = r.bumps ? 1 + r.bumpSize * Math.sin((v + 1) * Math.PI * r.bumps) : 1;
  return base * taper * bump * r.w * size / 2;
}

/**
 * Paint a monster frame.
 *   pose: 'idle' | 'attack' (mouth open, arms up) | 'hurt' (squint)
 *   frame: 0/1 for the idle bob and wing flap
 */
export function paintMonster(r, { size = 48, pose = 'idle', frame = 0, ramp = 'boss' } = {}) {
  const s = createSurface(size, size);
  const C = ramp === 'minion'
    ? { LIGHT: MN.LIGHT, BODY: MN.BODY, DARK: MN.DARK, BELLY: MN.LIGHT, BELLY_D: MN.BODY, HORN_L: MN.ACCENT, HORN: MN.ACCENT, HORN_D: MN.ACCENT_D, EYE_W: SLOT.WHITE, PUPIL: MN.EYE, MOUTH: MN.DARK, TEETH: SLOT.WHITE, BEAK: MN.BEAK, PATTERN: MN.DARK, PATTERN_D: MN.DARK, CHEEK: MN.ACCENT }
    : { ...BR, BEAK: BR.HORN };
  const cx = size / 2;
  const squash = frame % 2 ? 1 : 0;                      // idle bob: 1 px squash
  const bodyH = r.h * size;
  const bottom = size - 3 - (r.limbs === 'legs' ? Math.round(size * 0.12) : r.limbs === 'tentacles' ? Math.round(size * 0.1) : 0);
  const top = bottom - bodyH + squash;
  const mid = (top + bottom) / 2;
  const half = y => Math.min(size / 2 - 3, halfWidthAt(r, ((y + 0.5) - mid) / (bodyH / 2), size));

  // --- limbs behind the body ---------------------------------------------------
  const flap = frame % 2 ? -1 : 1;
  if (r.limbs === 'wings') {
    const wy = top + bodyH * 0.3;
    const reach = Math.min(size * 0.44, size / 2 - 3.5);         // wing tip: inside the canvas
    for (const side of [-1, 1]) {
      const bx = cx + side * Math.max(2, half(wy) * 0.6);
      const tipX = cx + side * reach, tipY = wy - size * (flap > 0 ? 0.2 : 0.02);
      const lowY = Math.min(size - 4, wy + size * (flap > 0 ? 0.2 : 0.3));
      // membrane: shoulder → tip → scalloped trailing edge back to the body
      const midX = (bx + tipX) / 2;
      poly(s, [[bx, wy - 2], [tipX, tipY], [tipX - side * 1, lowY - size * 0.06], [midX + side * 2, lowY - size * 0.1], [midX - side * 1, lowY], [bx, wy + size * 0.2]], C.HORN);
      line(s, bx, wy - 1, tipX, tipY, C.HORN_D);                 // the wing bone
      line(s, midX, (wy + tipY) / 2, midX - side * 1, lowY - 1, C.HORN_D);
    }
  }
  if (r.limbs === 'legs') {
    const legW = Math.max(3, Math.round(size * 0.1));
    for (const side of [-1, 1]) {
      const lx = Math.round(cx + side * r.w * size * 0.22 - legW / 2);
      rect(s, lx, bottom - 2, legW, size - 3 - bottom + 2, C.DARK);
      rect(s, lx - (side < 0 ? 1 : 0), size - 4, legW + 1, 2, C.DARK);
    }
  }
  if (r.limbs === 'tentacles') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const tx = cx + (i - (n - 1) / 2) * (r.w * size * 0.8 / n);
      for (let k = 0; k < size * 0.14; k++) {
        const wob = Math.round(Math.sin(k * 0.6 + i + frame * 1.5) * 1.2);
        rect(s, tx - 1 + wob, bottom - 1 + k, 3 - (k > size * 0.09 ? 1 : 0), 1, k % 4 < 2 ? C.BODY : C.DARK);
      }
    }
  }

  // --- top decorations (behind the body edge) ----------------------------------
  const topY = top + 1;
  const room = Math.max(2, topY - 3);                            // headroom above the body
  const up = k => Math.min(room, size * k);                      // decoration height, kept on the canvas
  const hornC = C.HORN, hornD = C.HORN_D;
  if (r.top === 'horns') {
    for (const side of [-1, 1]) {
      const hx = cx + side * r.w * size * 0.26;
      poly(s, [[hx - 3, topY + 5], [hx + 3, topY + 5], [hx + side * 5, topY - up(0.14)]], hornC);
      line(s, hx + side * 1, topY + 3, hx + side * 5, topY - up(0.13), hornD);
    }
  } else if (r.top === 'antennae') {
    for (const side of [-1, 1]) {
      const ax = cx + side * size * 0.1, tx = cx + side * size * 0.22, bulb = size >= 32 ? 2.5 : 1.5, ty = topY - Math.max(1, up(0.16) - bulb);
      line(s, ax, topY + 3, tx, ty, C.DARK);
      ellipse(s, tx + 0.5, ty, bulb, bulb, hornC);
    }
  } else if (r.top === 'ears') {
    for (const side of [-1, 1]) {
      const ex = cx + side * r.w * size * 0.3;
      poly(s, [[ex - 5, topY + 6], [ex + 5, topY + 6], [ex + side * 2, topY - up(0.12)]], C.BODY);
      poly(s, [[ex - 2, topY + 5], [ex + 2, topY + 5], [ex + side * 1.5, topY - up(0.06)]], C.CHEEK);
    }
  } else if (r.top === 'crest') {
    for (let i = -2; i <= 2; i++) {
      const sx = cx + i * size * 0.09;
      const h = up(0.1 - Math.abs(i) * 0.02);
      poly(s, [[sx - 3, topY + 4 + Math.abs(i) * 2], [sx + 3, topY + 4 + Math.abs(i) * 2], [sx, topY + Math.abs(i) * 2 - h]], hornC);
    }
  } else if (r.top === 'unihorn') {
    poly(s, [[cx - 3, topY + 4], [cx + 3, topY + 4], [cx, topY - up(0.2)]], hornC);
    line(s, cx, topY + 2, cx, topY - up(0.18), hornD);
  } else if (r.top === 'tuft') {
    for (let i = -1; i <= 1; i++) line(s, cx + i * 2, topY + 3, cx + i * 5, topY - up(0.1), C.DARK);
  }

  // --- body --------------------------------------------------------------------
  const bodyMask = new Uint8Array(size * size);
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(size, Math.ceil(bottom)); y++) {
    const hw = half(y);
    if (hw < 0.5) continue;
    for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
      if (x < 0 || x >= size) continue;
      bodyMask[y * size + x] = 1;
    }
  }
  const inBody = (x, y) => x >= 0 && y >= 0 && x < size && y < size && bodyMask[y * size + x] === 1;
  // jelly / ghost skirt: scalloped bottom edge
  if (r.body === 'jelly' || r.body === 'ghost') {
    const by = Math.ceil(bottom) - 1;
    for (let x = 0; x < size; x++) {
      if (!inBody(x, by)) continue;
      const k = Math.floor((x - cx + 100) / 4 + frame * 0.5) % 2;
      if (k) { bodyMask[by * size + x] = 0; if (by - 1 >= 0 && (x % 4 === 0)) bodyMask[(by - 1) * size + x] = 0; }
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inBody(x, y)) continue;
      let c = C.BODY;
      if (!inBody(x - 1, y - 1) || !inBody(x, y - 2)) c = C.LIGHT;
      else if (!inBody(x + 1, y + 1) || !inBody(x + 2, y) || !inBody(x, y + 2)) c = C.DARK;
      s.buf[y * size + x] = c;
    }
  }
  // pattern
  if (r.pattern === 'belly') {
    ellipse(s, cx, mid + bodyH * 0.16, r.w * size * 0.24, bodyH * 0.3, C.BELLY);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (s.buf[y * size + x] === C.BELLY && !inBody(x, y)) s.buf[y * size + x] = 0;
  } else if (r.pattern === 'stripes') {
    for (let y = Math.ceil(mid); y < bottom; y += 4) for (let x = 0; x < size; x++) if (inBody(x, y) && inBody(x, y - 1) && inBody(x, y + 1) && Math.abs(x - cx) > 2) s.buf[y * size + x] = C.PATTERN;
  } else if (r.pattern === 'spots') {
    const rng = mulberry32(hashSeed(r.seed, 'spots'));
    for (let i = 0; i < 4; i++) {
      const sx = between(rng, 0.05, 0.3) * size, sy = mid + between(rng, -0.1, 0.4) * bodyH;
      for (const side of [-1, 1]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        const x = Math.round(cx + side * sx + dx), y = Math.round(sy + dy);
        if (inBody(x, y) && inBody(x + 2, y) && inBody(x - 2, y) && inBody(x, y + 2)) s.buf[y * size + x] = C.PATTERN;
      }
    }
  }
  // claws / arms in front
  if (r.limbs === 'claws' || r.limbs === 'arms') {
    const ay = mid + bodyH * (pose === 'attack' ? -0.05 : 0.12);
    for (const side of [-1, 1]) {
      const edge = cx + side * (half(ay) - 1);
      const len = r.limbs === 'arms' ? size * 0.16 : size * 0.09;
      const hx = Math.max(4, Math.min(size - 5, edge + side * len)), hy = ay + (pose === 'attack' ? -size * 0.14 : size * 0.06);
      for (let k = -1; k <= 1; k++) line(s, edge, ay + k, hx, hy + k, C.DARK);
      ellipse(s, hx, hy, 3, 3, C.BODY);
      pset(s, hx + side * 2, hy - 2, SLOT.WHITE); pset(s, hx + side * 3, hy, SLOT.WHITE);
    }
  }

  // --- face ----------------------------------------------------------------------
  const eyeY = Math.round(top + bodyH * r.eyeHeight);
  const k = size / 48;                                      // small minions get smaller features
  const es = size >= 40 ? r.eyeSize + 1 : Math.max(1.5, (r.eyeSize + 1) * Math.max(k, 0.55));
  const eyeXs = r.eyes === 1 ? [cx] : r.eyes === 2 ? [cx - r.eyeSpread * r.w * size, cx + r.eyeSpread * r.w * size] : [cx - r.eyeSpread * r.w * size * 1.15, cx, cx + r.eyeSpread * r.w * size * 1.15];
  const bigOne = r.eyes === 1 ? Math.round(2 * Math.max(k, 0.5)) : 0;
  eyeXs.forEach((ex, i) => {
    const rr = es + bigOne - (r.eyes === 3 && i === 1 ? 0 : 0);
    const ey = eyeY - (r.eyes === 3 && i === 1 ? 3 : 0);
    if (pose === 'hurt') {
      line(s, ex - rr, ey - rr + 1, ex + rr - 1, ey + rr - 1, C.PUPIL); line(s, ex - rr, ey + rr - 1, ex + rr - 1, ey - rr + 1, C.PUPIL);
      return;
    }
    if (pose === 'taunt' && i === 0 && r.eyes > 1) {                 // a cheeky wink
      ellipse(s, ex, ey, rr, rr * 0.6, C.DARK);
      rect(s, ex - rr, ey, rr * 2, 1, C.PUPIL);
      return;
    }
    ellipse(s, ex, ey, rr, rr, C.EYE_W);
    const look = 1;
    ellipse(s, ex - look + 0.5, ey + 0.5, Math.max(1, rr * 0.5), Math.max(1, rr * 0.55), C.PUPIL);
    pset(s, Math.round(ex - look), Math.round(ey - rr * 0.4), SLOT.WHITE);
    if (r.brows === 'angry') {
      const side = ex < cx - 1 ? -1 : ex > cx + 1 ? 1 : 0;
      if (side) line(s, ex - side * (rr - 1) - side * 2, ey - rr - 2, ex + side * (rr + 1), ey - rr + 1 - (pose === 'attack' ? 1 : 0), C.PUPIL);
      else rect(s, ex - rr, ey - rr - 2, rr * 2, 1, C.PUPIL);
    } else if (r.brows === 'lids') {
      rect(s, ex - rr, ey - rr, rr * 2, Math.ceil(rr * 0.7), C.DARK);
    }
  });
  if (r.cheeks) for (const side of [-1, 1]) rect(s, cx + side * r.w * size * 0.3 - 1, eyeY + es + 1, 3, 1, C.CHEEK);

  const mw = Math.max(4, Math.round(r.mouthWidth * r.w * size));
  const my = Math.round(eyeY + es + Math.max(2, 4 * k) + (r.eyes === 1 ? bigOne : 0));
  const open = pose === 'attack' || pose === 'taunt';
  if (r.mouth === 'beak') {
    poly(s, [[cx - 4 * Math.max(k, 0.6), my - 2], [cx + 4 * Math.max(k, 0.6), my - 2], [cx, my + (open ? 6 : 4) * Math.max(k, 0.6)]], C.BEAK);
    if (open) rect(s, cx - 2, my, 4, 1, C.MOUTH);
  } else if (r.mouth === 'o') {
    ellipse(s, cx, my + 1, open ? 4 : 2.5, open ? 4 : 2.5, C.MOUTH);
  } else if (r.mouth === 'zigzag') {
    for (let i = 0; i < mw; i++) pset(s, cx - mw / 2 + i, my + ((i >> 1) % 2), C.MOUTH);
    if (open) rect(s, cx - mw / 2 + 1, my + 2, mw - 2, 3, C.MOUTH);
  } else {
    const h = Math.round(open ? Math.max(2, 6 * k) : Math.max(1, 3 * k));
    rect(s, cx - mw / 2, my, mw, h, C.MOUTH);
    rect(s, cx - mw / 2 + 1, my + h, mw - 2, 1, C.MOUTH);
    if (r.mouth === 'fangs') { rect(s, cx - mw / 2 + 1, my, 2, 3, C.TEETH); rect(s, cx + mw / 2 - 3, my, 2, 3, C.TEETH); }
    else for (let x = Math.round(cx - mw / 2) + 1; x < cx + mw / 2 - 1; x += 2) pset(s, x, my, C.TEETH);
  }
  if (pose === 'taunt' && r.mouth !== 'beak') {                     // … and sticks its tongue out
    const tw = Math.max(3, Math.round(mw * 0.4));
    rect(s, cx - tw / 2, my + Math.round(Math.max(2, 6 * k)) - 1, tw, Math.max(3, Math.round(5 * k)), C.CHEEK);
    rect(s, cx - 0.5, my + Math.round(Math.max(2, 6 * k)), 1, Math.max(2, Math.round(3 * k)), C.MOUTH);
  }
  return outline(s, SLOT.INK);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
export function checkMonster(s, { eyeIndex = BR.EYE_W } = {}) {
  const { w, h, buf } = s;
  const issues = [];
  let minX = w, minY = h, maxX = -1, maxY = -1, opaque = 0, eyes = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = buf[y * w + x];
    if (!c) continue;
    opaque++;
    if (c === eyeIndex) eyes++;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!opaque) return { ok: false, issues: ['empty'] };
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const fill = opaque / (bw * bh);
  if (fill < 0.34) issues.push(`sparse (${fill.toFixed(2)})`);
  if (bh < h * 0.55) issues.push(`short (${bh}/${h})`);
  if (bw < w * 0.4) issues.push(`narrow (${bw}/${w})`);
  if (minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1) issues.push('clipped by the canvas edge');
  if (eyes < 4) issues.push('no visible eyes');
  // one connected piece (8-neighbourhood)
  const seen = new Uint8Array(w * h);
  let start = buf.findIndex(c => c);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop(); count++;
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen[j] && buf[j]) { seen[j] = 1; stack.push(j); }
    }
  }
  if (count !== opaque) issues.push(`in pieces (${opaque - count} px apart)`);
  return { ok: issues.length === 0, issues, fill, bounds: { minX, minY, maxX, maxY } };
}

/**
 * A checked monster for a seed: re-rolls the recipe until every frame passes the
 * checks (at most 40 tries — the tests show far fewer are ever needed).
 */
export function generateMonster(seed, { role = 'walker', size = 48, ramp = 'boss' } = {}) {
  let recipe = null, tries = 0;
  for (; tries < 40; tries++) {
    const r = monsterRecipe(hashSeed(seed, role, tries), role);
    const eyeIndex = ramp === 'minion' ? SLOT.WHITE : BR.EYE_W;
    const ok = ['idle', 'attack'].every(pose => [0, 1].every(frame => checkMonster(paintMonster(r, { size, pose, frame, ramp }), { eyeIndex }).ok));
    if (ok) { recipe = r; break; }
  }
  if (!recipe) {                                          // never seen in the tests: a plain, safe blob
    recipe = { ...monsterRecipe(1, role), body: 'orb', w: 0.66, h: 0.62, n: 2, taper: 0, bumps: 0, top: 'none', limbs: role === 'flyer' ? 'wings' : 'none', eyes: 2 };
  }
  const cache = new Map();
  return {
    recipe, tries, size,
    frame({ pose = 'idle', frame = 0 } = {}) {
      const key = `${pose}|${frame % 2}`;
      if (!cache.has(key)) cache.set(key, paintMonster(recipe, { size, pose, frame, ramp }));
      return cache.get(key);
    },
  };
}

export { pget };
