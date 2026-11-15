/**
 * Stage art for the retro battles: parallax landscapes per region (meadow hills,
 * canyon mesas, alpine peaks, starlit ruins), the top-down snow field for the sled
 * chase, and small props (spikes, stars, key caps, ramps, trees…).
 *
 * Landscapes are painted once per battle into wide strips of palette indices
 * (seeded, so every run's stage looks a little different) and scrolled by copying —
 * a frame is a handful of row copies, not hundreds of shapes.
 */
import { createSurface, rect, pset, ellipse, poly, line, dither, outline, hline, text } from '../pixel.js';
import { ST, SLOT, FX } from '../palette.js';
import { mulberry32 } from '../levelGenerator.js';
import { SCREEN } from './common.js';

const W = SCREEN.w, H = SCREEN.h;
export const STRIP_W = 640;

/** Copy a strip (wrapping horizontally) onto the screen at row y, scrolled by `offset` px. Index 0 is see-through. */
export function drawStrip(s, strip, y, offset) {
  const sw = strip.w, off = ((Math.round(offset) % sw) + sw) % sw;
  for (let j = 0; j < strip.h; j++) {
    const dy = y + j;
    if (dy < 0 || dy >= s.h) continue;
    const row = dy * s.w, srow = j * sw;
    for (let i = 0; i < s.w; i++) {
      const c = strip.buf[srow + ((i + off) % sw)];
      if (c) s.buf[row + i] = c;
    }
  }
}

/** Same, vertically (top-down scenes): the strip wraps in y. */
export function drawStripV(s, strip, x, offset) {
  const sh = strip.h, off = ((Math.round(offset) % sh) + sh) % sh;
  for (let j = 0; j < s.h; j++) {
    const srow = ((j + off) % sh) * strip.w, row = j * s.w;
    for (let i = 0; i < strip.w; i++) {
      const dx = x + i;
      if (dx < 0 || dx >= s.w) continue;
      const c = strip.buf[srow + i];
      if (c) s.buf[row + dx] = c;
    }
  }
}

// ---------------------------------------------------------------------------
// Side-view landscapes
// ---------------------------------------------------------------------------
/** Sky: three bands with dithered seams. */
export function drawSky(s, horizon = 120) {
  const a = Math.round(horizon * 0.38), b = Math.round(horizon * 0.72);
  rect(s, 0, 0, W, a - 4, ST.SKY0);
  dither(s, 0, a - 4, W, 8, ST.SKY0, ST.SKY1, 0.5);
  rect(s, 0, a + 4, W, b - a - 8, ST.SKY1);
  dither(s, 0, b - 4, W, 8, ST.SKY1, ST.SKY2, 0.5);
  rect(s, 0, b + 4, W, horizon - b - 4, ST.SKY2);
}

function wave(rng, n = 4) {
  const parts = Array.from({ length: n }, () => ({ f: (1 + Math.floor(rng() * 4)) / STRIP_W * Math.PI * 2, p: rng() * Math.PI * 2, a: 0.3 + rng() }));
  const total = parts.reduce((s, q) => s + q.a, 0);
  return x => parts.reduce((s, q) => s + Math.sin(x * q.f + q.p) * q.a, 0) / total;   // −1..1, loops every STRIP_W
}

function cloudStrip(rng, h = 60) {
  const s = createSurface(STRIP_W, h);
  for (let i = 0; i < 5; i++) {
    const cx = rng() * STRIP_W, cy = 10 + rng() * (h - 30), w = 18 + rng() * 24;
    for (let k = 0; k < 4; k++) {
      const x = cx + (k - 1.5) * w * 0.45, r = w * (0.3 + rng() * 0.2);
      for (const dx of [0, STRIP_W, -STRIP_W]) ellipse(s, x + dx, cy + r * 0.2, r, r * 0.7, ST.CLOUD0);
    }
    for (const dx of [0, STRIP_W, -STRIP_W]) rect(s, cx - w + dx, cy + w * 0.22, w * 2, 3, ST.CLOUD1);
  }
  return s;
}

/** The far and near layers and ground details for a region. */
export function createLandscape(theme, seed) {
  const rng = mulberry32(seed >>> 0);
  const far = createSurface(STRIP_W, 90), mid = createSurface(STRIP_W, 70);
  const fw = wave(rng), mw = wave(rng, 5);
  const fill = (surf, x, top, c) => { for (let y = Math.max(0, Math.round(top)); y < surf.h; y++) surf.buf[y * surf.w + x] = c; };
  const stars = [];
  if (theme === 'meadow') {
    for (let x = 0; x < STRIP_W; x++) { const t = 38 + fw(x) * 20; fill(far, x, t, ST.FAR0); fill(far, x, t + 14 + fw(x * 3 + 50) * 6, ST.FAR1); }
    for (let x = 0; x < STRIP_W; x++) fill(mid, x, 40 + mw(x) * 12, ST.MID0);
    for (let i = 0; i < 9; i++) {                                         // round trees on the hills
      const x = rng() * STRIP_W, y = 34 + mw(x) * 12;
      for (const dx of [0, STRIP_W, -STRIP_W]) { rect(mid, x + dx - 1, y - 2, 3, 10, ST.MID1); ellipse(mid, x + dx, y - 8, 7, 7, ST.MID1); ellipse(mid, x + dx - 1.5, y - 9.5, 5, 5, ST.MID0); }
    }
  } else if (theme === 'canyon') {
    let x = 0;
    while (x < STRIP_W) {                                                // flat-topped mesas with sloped skirts
      const w = 60 + rng() * 100, top = 22 + rng() * 34, gap = 6 + rng() * 50, cap = 6 + rng() * 8;
      for (let i = 0; i < w && x + i < STRIP_W; i++) {
        const edge = Math.min(i, w - i);
        const t = top + (edge < cap ? (cap - edge) * (edge < cap / 2 ? 3.2 : 1.4) : Math.sin(i * 0.3) * 0.6);
        fill(far, x + i, t, ST.FAR0);
        fill(far, x + i, t + 9 + Math.sin(i * 0.11 + x) * 2, ST.FAR1);               // a darker stratum
        fill(far, x + i, t + 15 + Math.sin(i * 0.07 + x) * 3, ST.FAR0);
        fill(far, x + i, t + 22 + Math.sin(i * 0.13) * 2, ST.FAR1);
      }
      x += w + gap;
    }
    for (let x2 = 0; x2 < STRIP_W; x2++) fill(mid, x2, 52 + mw(x2) * 6, ST.MID0);
    for (let i = 0; i < 7; i++) {                                         // cacti
      const cx = Math.round(rng() * STRIP_W), base = 50, h = 14 + rng() * 14;
      for (const dx of [0, STRIP_W, -STRIP_W]) {
        rect(mid, cx + dx - 2, base - h, 5, h, ST.DET0); rect(mid, cx + dx - 1, base - h - 1, 3, 1, ST.DET0);
        rect(mid, cx + dx - 7, base - h * 0.6, 5, 3, ST.DET0); rect(mid, cx + dx - 7, base - h * 0.6 - 6, 3, 7, ST.DET0);
        rect(mid, cx + dx + 3, base - h * 0.45, 5, 3, ST.DET0); rect(mid, cx + dx + 5, base - h * 0.45 - 5, 3, 6, ST.DET0);
        rect(mid, cx + dx + 1, base - h, 1, h, ST.DET1);
      }
    }
  } else if (theme === 'alpine') {
    let x = -40;
    while (x < STRIP_W + 40) {                                           // jagged peaks with snow caps
      const w = 70 + rng() * 80, top = 4 + rng() * 30, peak = x + w / 2;
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(STRIP_W, x + w); i++) {
        const t = top + Math.abs(i - peak) * (far.h - top) / (w / 2) * 0.9 + Math.sin(i * 0.7) * 1.5;
        for (let y = Math.max(0, Math.round(t)); y < far.h; y++) {
          const c = y < t + 10 + Math.sin(i * 0.5) * 3 ? ST.FAR0 : ST.FAR1;
          if (far.buf[y * STRIP_W + i] !== ST.FAR0 || c === ST.FAR0) far.buf[y * STRIP_W + i] = c;
        }
      }
      x += w * 0.65;
    }
    for (let x2 = 0; x2 < STRIP_W; x2++) fill(mid, x2, 56 + mw(x2) * 5, ST.MID1);
    for (let i = 0; i < 26; i++) {                                        // pines
      const px = rng() * STRIP_W, h = 14 + rng() * 16, base = 58;
      for (const dx of [0, STRIP_W, -STRIP_W]) {
        for (let k = 0; k < 3; k++) poly(mid, [[px + dx - h * (0.34 - k * 0.06), base - k * h * 0.28], [px + dx + h * (0.34 - k * 0.06), base - k * h * 0.28], [px + dx, base - h * (0.45 + k * 0.28)]], k % 2 ? ST.MID0 : ST.MID1);
        rect(mid, px + dx, base - h * 0.98, 1, 2, ST.GROUND0);
      }
    }
  } else {                                                               // starlit ruins
    for (let i = 0; i < 60; i++) stars.push([Math.floor(rng() * W), Math.floor(rng() * 100), rng()]);
    let x = 0;
    while (x < STRIP_W) {                                                // far skyline: broken towers and arches
      const w = 20 + rng() * 40, top = 20 + rng() * 45;
      for (let i = 0; i < w && x + i < STRIP_W; i++) {
        const broken = i > w * 0.6 ? (i - w * 0.6) * 0.8 : 0;
        fill(far, x + i, top + broken, ST.FAR0);
        if ((i % 8) === 3) for (let y = Math.round(top + broken) + 5; y < far.h - 10; y += 12) rect(far, x + i, y, 2, 4, ST.FAR1);
      }
      x += w + rng() * 30;
    }
    for (let i = 0; i < 7; i++) {                                         // near columns, some broken
      const cx = Math.round(rng() * STRIP_W), h = 30 + rng() * 32, top = 70 - h;
      for (const dx of [0, STRIP_W, -STRIP_W]) {
        rect(mid, cx + dx - 6, top, 13, h, ST.MID0); rect(mid, cx + dx - 8, top - 3, 17, 4, ST.MID1);
        for (let k = -4; k <= 4; k += 4) rect(mid, cx + dx + k, top + 2, 1, h - 2, ST.MID1);
        rect(mid, cx + dx - 8, 66, 17, 4, ST.MID1);
      }
    }
    for (let i = 0; i < 5; i++) {                                         // glowing crystals
      const cx = rng() * STRIP_W;
      for (const dx of [0, STRIP_W, -STRIP_W]) poly(mid, [[cx + dx - 4, 70], [cx + dx + 4, 70], [cx + dx + 1, 56]], ST.DET0);
    }
  }
  // ground details: a strip of tufts / pebbles / sparkles / tiles
  const ground = createSurface(STRIP_W, 30);
  rect(ground, 0, 0, STRIP_W, 30, ST.GROUND1);
  rect(ground, 0, 0, STRIP_W, 3, ST.GROUND0);
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rng() * STRIP_W), y = 5 + Math.floor(rng() * 22);
    if (theme === 'meadow') { pset(ground, x, y, ST.GROUND2); pset(ground, x + 1, y, ST.GROUND2); if (i % 5 === 0) { pset(ground, x, y - 1, ST.DET0); pset(ground, x + 1, y - 2, ST.DET2); } }
    else if (theme === 'canyon') { rect(ground, x, y, 3, 2, ST.GROUND2); pset(ground, x, y - 1, ST.GROUND0); }
    else if (theme === 'alpine') { pset(ground, x, y, i % 3 ? ST.GROUND2 : FX.SNOW); }
    else { rect(ground, x - (x % 16), y - (y % 8), 1, 8, ST.GROUND2); hline(ground, x - (x % 16), x - (x % 16) + 15, y - (y % 8), ST.GROUND2); if (i % 9 === 0) pset(ground, x, y, ST.DET0); }
  }
  if (theme === 'meadow') for (let x = 0; x < STRIP_W; x += 3) pset(ground, x, 0, (x / 3) % 4 === 0 ? ST.DET0 : ST.GROUND0), pset(ground, x + 1, 0, ST.GROUND0);
  return { theme, far, mid, ground, clouds: cloudStrip(rng), stars };
}

/** A full side-view stage: sky, sun / moon, clouds, far and near layers, ground at `groundY`. */
export function drawLandscape(s, L, scroll, t, groundY = 150) {
  drawSky(s, groundY);
  if (L.theme === 'starlit') {
    for (const [x, y, p] of L.stars) if (Math.sin(t * (1 + p * 3) + p * 10) > -0.6) pset(s, (x - Math.floor(scroll * 0.05) + W * 4) % W, y, p > 0.7 ? ST.SUN : ST.CLOUD0);
    ellipse(s, 60, 30, 11, 11, ST.SUN); ellipse(s, 65, 27, 10, 10, ST.SKY0);              // crescent moon
  } else if (L.theme === 'alpine') {
    ellipse(s, 250, 28, 9, 9, ST.SUN);
  } else if (L.theme === 'canyon') {
    ellipse(s, 52, 34, 13, 13, ST.SUN);
  } else {
    ellipse(s, 48, 30, 12, 12, ST.SUN);
  }
  if (L.theme !== 'starlit') drawStrip(s, L.clouds, 6, scroll * 0.08 + t * 4);
  drawStrip(s, L.far, groundY - L.far.h + 4, scroll * 0.2);
  drawStrip(s, L.mid, groundY - L.mid.h + 2, scroll * 0.5);
  rect(s, 0, groundY, W, H - groundY, ST.GROUND1);
  drawStrip(s, L.ground, groundY, scroll);
}

// ---------------------------------------------------------------------------
// Top-down snow field (sled chase)
// ---------------------------------------------------------------------------
export function createSnowField(seed) {
  const rng = mulberry32(seed >>> 0);
  const field = createSurface(W, 240);
  rect(field, 0, 0, W, 240, ST.GROUND0);
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * 240);
    pset(field, x, y, i % 4 ? ST.GROUND1 : ST.GROUND2);
    if (i % 6 === 0) pset(field, x + 1, y, ST.GROUND1);
  }
  // sled tracks of those who came before
  for (const tx of [96, 144, 176, 224]) for (let y = 0; y < 240; y++) if ((y >> 3) % 3) pset(field, tx + Math.round(Math.sin(y / 40) * 2), y, ST.GROUND1);
  // forest edges
  const edge = createSurface(60, 240);
  for (let i = 0; i < 16; i++) {
    const x = 8 + rng() * 40, y = i * 15 + rng() * 8, h = 16 + rng() * 10;
    for (const dy of [0, 240, -240]) pineTop(edge, x, y + dy, h);
  }
  return { field, edge };
}

function pineTop(s, x, y, h) {
  // a pine seen from above and a little in front
  ellipse(s, x + 2, y + h * 0.55, h * 0.42, h * 0.22, ST.GROUND2);           // shadow
  for (let k = 0; k < 3; k++) poly(s, [[x - h * (0.42 - k * 0.1), y + h * (0.55 - k * 0.16)], [x + h * (0.42 - k * 0.1), y + h * (0.55 - k * 0.16)], [x, y - h * (0.25 + k * 0.12)]], k % 2 ? ST.DET0 : ST.DET1);
  pset(s, x, y - h * 0.5, FX.SNOW);
}

// ---------------------------------------------------------------------------
// Props (outlined sprites, built once)
// ---------------------------------------------------------------------------
function sprite(w, h, paint) {
  const s = createSurface(w, h);
  paint(s);
  return outline(s, SLOT.INK);
}

const CACHE = new Map();
const cached = (key, make) => { if (!CACHE.has(key)) CACHE.set(key, make()); return CACHE.get(key); };

/** The runner's obstacles, in the boss's horn / accent colours (palette BR.HORN*). */
export function spikeSprite(kind, C) {
  return cached(`spike-${kind}`, () => {
    if (kind === 'tall') return sprite(13, 27, s => { poly(s, [[1, 26], [12, 26], [6.5, 1]], C.HORN); line(s, 6, 4, 6, 25, C.HORN_L); rect(s, 1, 24, 11, 2, C.HORN_D); });
    if (kind === 'double') return sprite(31, 17, s => { for (const x of [1, 16]) { poly(s, [[x, 16], [x + 14, 16], [x + 7, 1]], C.HORN); line(s, x + 6, 4, x + 6, 15, C.HORN_L); } rect(s, 1, 14, 29, 2, C.HORN_D); });
    if (kind === 'ball') return sprite(18, 18, s => { ellipse(s, 9, 9, 6, 6, C.HORN_D); ellipse(s, 8, 8, 4, 4, C.HORN); for (const [x, y] of [[9, 1], [9, 16], [1, 9], [16, 9], [3, 3], [14, 3], [3, 14], [14, 14]]) pset(s, x, y, C.HORN_L); pset(s, 7, 6, SLOT.WHITE); });
    return sprite(15, 18, s => { poly(s, [[1, 17], [14, 17], [7.5, 1]], C.HORN); line(s, 7, 4, 7, 16, C.HORN_L); rect(s, 1, 15, 13, 2, C.HORN_D); });
  });
}

/** A key cap with a label (scale 1 or 2). */
export function drawKeyCap(s, cx, cy, label, { scale = 2, face = SLOT.KEY, side = SLOT.KEY_SIDE, ink = SLOT.INK } = {}) {
  const w = Math.max(scale * 3 + 6, label.length * 4 * scale + 4), h = scale * 5 + 7;
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  rect(s, x, y, w, h, ink);
  rect(s, x + 1, y + 1, w - 2, h - 2, side);
  rect(s, x + 1, y + 1, w - 2, h - 4, face);
  text(s, label, x + w / 2 + (scale > 1 ? 0 : 0.5), y + 2, ink, { scale, align: 'center' });
  return { x, y, w, h };
}

export function heartSprite(full) {
  return cached(`heart-${full}`, () => {
    const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    const s = createSurface(7, 6);
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') pset(s, i, j, full ? SLOT.RED : SLOT.DARK); });
    if (full) pset(s, 1, 1, SLOT.WHITE);
    return outline(s, SLOT.INK);
  });
}

/** A five-pointed star note (rhythm game), colour index c. */
export function starSprite(c) {
  return cached(`star-${c}`, () => sprite(13, 13, s => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6; pts.push([6.5 + Math.cos(a) * r, 6.8 + Math.sin(a) * r]); }
    poly(s, pts, c);
    pset(s, 5, 5, SLOT.WHITE);
  }));
}

export function snowballSprite() {
  return cached('snowball', () => sprite(8, 8, s => { ellipse(s, 4, 4, 3, 3, FX.SNOW); pset(s, 3, 3, SLOT.WHITE); pset(s, 5, 5, FX.SNOW_D); }));
}

/** Top-down obstacles and the ramp. */
export function slopeSprite(kind) {
  return cached(`slope-${kind}`, () => {
    if (kind === 'tree') return sprite(24, 26, s => { ellipse(s, 13, 21, 9, 3.5, ST.GROUND2); for (let k = 0; k < 3; k++) poly(s, [[12 - (10 - k * 2.5), 20 - k * 5], [12 + (10 - k * 2.5), 20 - k * 5], [12, 5 - k * 2]], k % 2 ? ST.DET0 : ST.DET1); pset(s, 12, 3, FX.SNOW); rect(s, 11, 20, 2, 3, ST.GROUND2); });
    if (kind === 'rock') return sprite(22, 16, s => { ellipse(s, 11, 10, 9, 5, SLOT.GRAY); ellipse(s, 10, 8, 7, 4, FX.SNOW_D); ellipse(s, 9, 6, 4, 2, FX.SNOW); });
    if (kind === 'snowman') return sprite(16, 24, s => { ellipse(s, 8, 17, 6, 6, FX.SNOW); ellipse(s, 8, 8, 4.5, 4.5, FX.SNOW); rect(s, 6, 7, 1, 1, SLOT.INK); rect(s, 9, 7, 1, 1, SLOT.INK); rect(s, 8, 9, 3, 1, SLOT.GOLD); rect(s, 4, 2, 8, 2, SLOT.DARK); rect(s, 6, 0, 4, 2, SLOT.DARK); pset(s, 8, 15, SLOT.INK); pset(s, 8, 18, SLOT.INK); });
    // ramp: a striped wedge, seen from above
    return sprite(30, 18, s => { poly(s, [[2, 17], [27, 17], [23, 2], [6, 2]], ST.DET2); for (let y = 4; y < 17; y += 4) hline(s, 4, 25, y, SLOT.WHITE); rect(s, 2, 15, 26, 2, ST.GROUND2); });
  });
}

export function sledSprite() {
  return cached('sled', () => sprite(16, 14, s => { rect(s, 2, 1, 12, 11, SLOT.GOLD_DARK); rect(s, 3, 2, 10, 9, SLOT.GOLD); for (let y = 3; y < 11; y += 3) hline(s, 3, 12, y, SLOT.GOLD_DARK); rect(s, 1, 0, 1, 13, SLOT.DARK); rect(s, 14, 0, 1, 13, SLOT.DARK); }));
}
