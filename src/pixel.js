/**
 * Pixel — a tiny indexed-colour software renderer for the retro 2D screens
 * (boss battles, the reward stage). No DOM except present().
 *
 * Everything draws palette *indices* (0..255) into a Uint8Array; a 256-entry palette
 * turns them into colours only when the frame is shown. That makes the two things the
 * battles need almost free:
 *   - palette swaps: every correct key recolours the stage, the hero and the boss by
 *     changing 256 numbers, not by redrawing anything differently
 *   - speed on machines without a GPU: a 320×180 frame is 57,600 bytes; filling it and
 *     converting it to RGBA takes well under a millisecond, and the browser only has to
 *     scale one small image (crisp, `image-rendering: pixelated`)
 *
 * A surface is { w, h, buf: Uint8Array }. Screens and sprites are both surfaces;
 * index 0 is transparent in sprites (blit skips it).
 */

export const TRANSPARENT = 0;

export function createSurface(w, h) {
  return { w, h, buf: new Uint8Array(w * h) };
}

export function clear(s, c = 0) {
  s.buf.fill(c);
}

export function pset(s, x, y, c) {
  x |= 0; y |= 0;
  if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.buf[y * s.w + x] = c;
}

export function pget(s, x, y) {
  x |= 0; y |= 0;
  return x >= 0 && y >= 0 && x < s.w && y < s.h ? s.buf[y * s.w + x] : 0;
}

export function rect(s, x, y, w, h, c) {
  let x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(s.w, Math.round(x + w)), y1 = Math.min(s.h, Math.round(y + h));
  if (x1 <= x0) return;
  for (let j = y0; j < y1; j++) s.buf.fill(c, j * s.w + x0, j * s.w + x1);
}

export function hline(s, x0, x1, y, c) {
  if (x1 < x0) [x0, x1] = [x1, x0];
  rect(s, x0, y, x1 - x0 + 1, 1, c);
}

export function vline(s, x, y0, y1, c) {
  if (y1 < y0) [y0, y1] = [y1, y0];
  rect(s, x, y0, 1, y1 - y0 + 1, c);
}

/** Outline of a rectangle, 1 px. */
export function frame(s, x, y, w, h, c) {
  hline(s, x, x + w - 1, y, c); hline(s, x, x + w - 1, y + h - 1, c);
  vline(s, x, y, y + h - 1, c); vline(s, x + w - 1, y, y + h - 1, c);
}

/** Filled ellipse centred on (cx, cy) with radii rx, ry (pixel centres). */
export function ellipse(s, cx, cy, rx, ry, c) {
  if (rx <= 0 || ry <= 0) return;
  const y0 = Math.ceil(cy - ry - 0.5), y1 = Math.floor(cy + ry - 0.5);
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const xa = Math.round(cx - half), xb = Math.round(cx + half);
    if (xb > xa) rect(s, xa, y, xb - xa, 1, c);
  }
}

export function circle(s, cx, cy, r, c) {
  ellipse(s, cx, cy, r, r, c);
}

/** Ring (outline circle), 1 px. */
export function ring(s, cx, cy, r, c) {
  const n = Math.max(8, Math.round(r * 7));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pset(s, Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), c);
  }
}

export function line(s, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard++) {
    pset(s, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Filled convex-or-not polygon (even-odd scanline). points: [[x, y], …]. */
export function poly(s, points, c) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(s.h - 1, Math.floor(maxY - 0.5));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + (sy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]);
      if (xb > xa) rect(s, xa, y, xb - xa, 1, c);
    }
  }
}

/** 2-colour ordered dither over a rectangle: `level` 0..1 is the share of `c2`. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function dither(s, x, y, w, h, c1, c2, level) {
  const t = Math.round(level * 16);
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(s.w, Math.round(x + w)), y1 = Math.min(s.h, Math.round(y + h));
  for (let j = y0; j < y1; j++) {
    const row = j * s.w, b = (j & 3) * 4;
    for (let i = x0; i < x1; i++) s.buf[row + i] = BAYER[b + (i & 3)] < t ? c2 : c1;
  }
}

/**
 * Copy a sprite onto a surface; index 0 is transparent.
 *   flip   mirror horizontally
 *   map    Uint8Array(256) index remap (palette-swap / flash a sprite white)
 *   scale  integer magnification
 *   angle  rotation (radians) about the sprite centre, nearest neighbour
 * (x, y) is the sprite's top-left corner (before rotation).
 */
export function blit(s, spr, x, y, { flip = false, map = null, scale = 1, angle = 0 } = {}) {
  x = Math.round(x); y = Math.round(y);
  const sw = spr.w, sh = spr.h, src = spr.buf, dst = s.buf, W = s.w, H = s.h;
  if (angle) {
    const cx = x + (sw * scale) / 2, cy = y + (sh * scale) / 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const r = Math.ceil(Math.hypot(sw, sh) * scale / 2) + 1;
    for (let j = Math.max(0, Math.floor(cy - r)); j < Math.min(H, Math.ceil(cy + r)); j++) {
      for (let i = Math.max(0, Math.floor(cx - r)); i < Math.min(W, Math.ceil(cx + r)); i++) {
        const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
        let u = (cos * dx + sin * dy) / scale + sw / 2, v = (-sin * dx + cos * dy) / scale + sh / 2;
        if (u < 0 || v < 0 || u >= sw || v >= sh) continue;
        u |= 0; v |= 0;
        if (flip) u = sw - 1 - u;
        let c = src[v * sw + u];
        if (!c) continue;
        if (map) c = map[c];
        dst[j * W + i] = c;
      }
    }
    return;
  }
  for (let v = 0; v < sh; v++) {
    for (let k = 0; k < scale; k++) {
      const j = y + v * scale + k;
      if (j < 0 || j >= H) continue;
      const row = j * W, srow = v * sw;
      for (let u = 0; u < sw; u++) {
        let c = src[srow + (flip ? sw - 1 - u : u)];
        if (!c) continue;
        if (map) c = map[c];
        const i0 = x + u * scale;
        for (let m = 0; m < scale; m++) {
          const i = i0 + m;
          if (i >= 0 && i < W) dst[row + i] = c;
        }
      }
    }
  }
}

/** Every transparent pixel touching an opaque one (4-neighbourhood) becomes `c`. In place. */
export function outline(spr, c) {
  const { w, h, buf } = spr;
  const copy = buf.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (copy[y * w + x]) continue;
      if ((x > 0 && copy[y * w + x - 1]) || (x < w - 1 && copy[y * w + x + 1]) ||
          (y > 0 && copy[(y - 1) * w + x]) || (y < h - 1 && copy[(y + 1) * w + x])) buf[y * w + x] = c;
    }
  }
  return spr;
}

/** A remap table: every opaque index → `c` (e.g. a white hit flash, a dark silhouette). */
export function solidMap(c) {
  const m = new Uint8Array(256).fill(c);
  m[0] = 0;
  return m;
}

// ---------------------------------------------------------------------------
// Font: 3×5 pixel glyphs (upper case, digits, a little punctuation)
// ---------------------------------------------------------------------------
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '1000111011101011000110001', N: '10011101101110011001', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '1000110001101011101110001', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001',
  5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', ':': '000010000010000', '!': '010010010000010',
  '?': '110001010000010', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', "'": '010010000000000',
  '%': '101001010100101', '×': '000101010101000', '<': '001010100010001', '>': '100010001010100', '*': '000101010101000',
  '#': '101111101111101', '(': '010100100100010', ')': '010001001001010', '=': '000111000111000', '"': '101101000000000',
};

/** A chunky arrow (for dance moves / lane hints): dir 'up' | 'down' | 'left' | 'right', size ≥ 3. */
export function arrow(s, cx, cy, dir, size, c) {
  const n = Math.max(3, Math.round(size));
  const half = Math.floor(n / 2);
  for (let k = 0; k <= half; k++) {                      // the head: a triangle
    const along = -half + k, span = k;
    for (let t = -span; t <= span; t++) {
      const [x, y] = dir === 'up' ? [t, along] : dir === 'down' ? [t, -along] : dir === 'left' ? [along, t] : [-along, t];
      pset(s, cx + x, cy + y, c);
    }
  }
  const shaft = Math.max(1, Math.floor(n / 4));
  for (let k = 1; k <= half; k++) {                      // the shaft
    for (let t = -shaft; t <= shaft; t++) {
      const [x, y] = dir === 'up' ? [t, k] : dir === 'down' ? [t, -k] : dir === 'left' ? [k, t] : [-k, t];
      pset(s, cx + x, cy + y, c);
    }
  }
}

export const FONT = { w: 3, h: 5, advance: 4 };
const glyphWidth = g => g.length / 5;        // most glyphs are 3 wide; M, N and W are wider

export function textWidth(str, scale = 1) {
  let w = 0;
  for (const ch of String(str).toUpperCase()) w += (glyphWidth(GLYPHS[ch] ?? GLYPHS['?']) + 1) * scale;
  return Math.max(0, w - scale);
}

/**
 * Draw text. align: 'left' | 'center' | 'right' (x is the anchor).
 * shadow: an index drawn 1 px (× scale) below-right first.
 */
export function text(s, str, x, y, c, { scale = 1, align = 'left', shadow = null } = {}) {
  str = String(str).toUpperCase();
  const w = textWidth(str, scale);
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  if (shadow !== null) text(s, str, cx + scale, y + scale, shadow, { scale });
  for (const ch of str) {
    const g = GLYPHS[ch] ?? GLYPHS['?'];
    const gw = glyphWidth(g);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < gw; i++) if (g[j * gw + i] === '1') rect(s, cx + i * scale, y + j * scale, scale, scale, c);
    }
    cx += (gw + 1) * scale;
  }
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------
/** [r, g, b] 0..255 → a little-endian RGBA word for ImageData. */
export function rgbaWord([r, g, b]) {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Show a surface: palette (Uint32Array(256) of rgbaWord) → ImageData → canvas.
 * `target` caches the ImageData between frames: { ctx, image }.
 */
export function present(s, palette, target) {
  if (!target.image) target.image = target.ctx.createImageData(s.w, s.h);
  const out = new Uint32Array(target.image.data.buffer);
  const buf = s.buf;
  for (let i = 0, n = buf.length; i < n; i++) out[i] = palette[buf[i]];
  target.ctx.putImageData(target.image, 0, 0);
}

/** The same conversion without a canvas (Node: previews, tests): RGBA bytes. */
export function toRGBA(s, palette) {
  const out = new Uint8Array(s.w * s.h * 4);
  const words = new Uint32Array(out.buffer);
  for (let i = 0; i < s.buf.length; i++) words[i] = palette[s.buf[i]];
  return out;
}
