/**
 * Procedural textures (browser only — needs a 2D canvas).
 *
 * Every texture is painted by a hand-written function into a seamless,
 * power-of-two canvas so it can repeat (REPEAT wrap + mipmaps in WebGL).
 * Painting is seeded, so textures are identical on every load.
 *
 * Alpha is used as an emissive mask: alpha 1 = normal surface, alpha 0.5 =
 * fully glowing (see renderer: glow = (1 - a) * 2).
 */
import { mulberry32, hashSeed } from '../levels/generator.js';

export const TEXTURE_SIZE = 256;
const S = TEXTURE_SIZE;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = c => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
const rgba = (c, a) => `rgba(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',')},${a})`;

/** Tileable value noise with `cells` lattice cells across the texture. */
function valueNoise(rng, cells) {
  const grid = Array.from({ length: cells * cells }, rng);
  const at = (i, j) => grid[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
  return (x, y) => {
    const gx = (x / S) * cells, gy = (y / S) * cells;
    const i = Math.floor(gx), j = Math.floor(gy);
    let fx = gx - i, fy = gy - j;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Fractal (tileable) noise: sum of octaves, normalised to 0..1. */
function fbm(rng, cellsList = [4, 8, 16, 32]) {
  const layers = cellsList.map(c => valueNoise(rng, c));
  const weights = cellsList.map((_, i) => 1 / 2 ** i);
  const total = weights.reduce((s, w) => s + w, 0);
  return (x, y) => layers.reduce((s, n, i) => s + n(x, y) * weights[i], 0) / total;
}

/** Per-pixel fill: colour = f(x, y) returning [r, g, b]. */
function fillPixels(ctx, f) {
  const image = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = f(x, y);
      const i = (y * S + x) * 4;
      image.data[i] = c[0];
      image.data[i + 1] = c[1];
      image.data[i + 2] = c[2];
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Draw a shape at every wrapped offset so it tiles across edges. */
function wrapped(fn) {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy);
}

function speckle(ctx, rng, count, colors, size = [1, 2.5]) {
  for (let i = 0; i < count; i++) {
    const x = rng() * S, y = rng() * S, r = size[0] + rng() * (size[1] - size[0]);
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    wrapped((dx, dy) => ctx.fillRect(x + dx, y + dy, r, r));
  }
}

// ---------------------------------------------------------------------------
// Painters (hand-written). Signature: (ctx, rng, glow) — `glow` is a second
// canvas context whose white pixels become emissive.
// ---------------------------------------------------------------------------
const PAINTERS = {
  grassTop(ctx, rng) {
    const n = fbm(rng);
    const dark = [62, 112, 40], light = [112, 168, 66];
    fillPixels(ctx, (x, y) => mix(dark, light, n(x, y)));
    // blades: short strokes in many greens
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 1800; i++) {
      const x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2, l = 2 + rng() * 5;
      const shade = mix([48, 96, 32], [150, 205, 90], rng());
      ctx.strokeStyle = rgba(shade, 0.75);
      wrapped((dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
        ctx.stroke();
      });
    }
    // a few flowers
    for (let i = 0; i < 26; i++) {
      const x = rng() * S, y = rng() * S;
      const petal = [[255, 255, 255], [255, 226, 90], [250, 160, 190]][Math.floor(rng() * 3)];
      wrapped((dx, dy) => {
        ctx.fillStyle = rgb(petal);
        for (const [ox, oy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) ctx.fillRect(x + dx + ox - 1, y + dy + oy - 1, 2, 2);
        ctx.fillStyle = rgb([240, 180, 40]);
        ctx.fillRect(x + dx - 0.7, y + dy - 0.7, 1.4, 1.4);
      });
    }
  },

  dirtSide(ctx, rng) {
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    const band = valueNoise(rng, 8);
    fillPixels(ctx, (x, y) => {
      const stripe = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 8 + band(x, y) * 3);
      return mix([88, 58, 36], [140, 96, 60], n(x, y) * 0.8 + stripe * 0.2);
    });
    for (let i = 0; i < 140; i++) {
      const x = rng() * S, y = rng() * S, rx = 2 + rng() * 5, ry = 1.5 + rng() * 3;
      const c = mix([110, 100, 92], [170, 160, 150], rng());
      wrapped((dx, dy) => {
        ctx.fillStyle = rgb(c);
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba([255, 255, 255], 0.25);
        ctx.fillRect(x + dx - rx * 0.4, y + dy - ry * 0.6, rx * 0.6, 1);
      });
    }
    // roots
    ctx.strokeStyle = rgba([60, 38, 22], 0.6);
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      let x = rng() * S, y = rng() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 14; y += rng() * 10; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },

  redRockTop(ctx, rng) {
    const n = fbm(rng);
    const warp = valueNoise(rng, 4);
    fillPixels(ctx, (x, y) => {
      const ripple = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 10 + warp(x, y) * 8);
      return mix([160, 84, 56], [206, 122, 82], n(x, y) * 0.75 + ripple * 0.25);
    });
    // wind-blown sand drifts and grit
    speckle(ctx, rng, 700, [rgba([238, 196, 140], 0.55), rgba([120, 60, 40], 0.5), rgba([250, 214, 160], 0.4)], [1, 2.2]);
  },

  strataSide(ctx, rng) {
    const palette = [[198, 108, 70], [224, 152, 100], [182, 90, 58], [236, 182, 122], [168, 82, 52], [212, 130, 84]];
    const bands = [];
    // bands must tile vertically: fill exactly S pixels
    let y = 0;
    while (y < S) {
      const h = Math.min(S - y, 8 + Math.floor(rng() * 26));
      bands.push({ y, h, c: palette[Math.floor(rng() * palette.length)] });
      y += h;
    }
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    const wobble = valueNoise(rng, 4);
    fillPixels(ctx, (x, py) => {
      const yy = ((py + wobble(x, py) * 10) % S + S) % S;
      const b = bands.find(band => yy >= band.y && yy < band.y + band.h) || bands[0];
      return mix(b.c, [250, 220, 180], (n(x, py) - 0.5) * 0.35 + 0.1).map(v => v * (0.9 + 0.2 * n(x, py)));
    });
    ctx.strokeStyle = rgba([110, 55, 35], 0.45);
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      let x = rng() * S, yy = rng() * S;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 8; yy += 6 + rng() * 10; ctx.lineTo(x, yy); }
      ctx.stroke();
    }
  },

  flagstone(ctx, rng) {
    paintStones(ctx, rng, { base: [118, 120, 126], light: [170, 172, 178], grout: [70, 72, 78], moss: 0.25 });
  },

  snowStoneTop(ctx, rng) {
    paintStones(ctx, rng, { base: [92, 98, 118], light: [128, 134, 156], grout: [58, 60, 74], moss: 0 });
    // snow drifts
    const n = fbm(rng, [4, 8, 16, 32]);
    const image = ctx.getImageData(0, 0, S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const v = n(x, y);
        if (v > 0.56) {
          const t = Math.min(1, (v - 0.56) * 9);
          const i = (y * S + x) * 4;
          const snow = [236, 240, 250];
          for (let k = 0; k < 3; k++) image.data[i + k] += (snow[k] - image.data[i + k]) * t;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  },

  stoneBlocks(ctx, rng) {
    const n = fbm(rng, [8, 16, 32, 64]);
    fillPixels(ctx, (x, y) => mix([84, 84, 92], [110, 110, 118], n(x, y)));
    const rows = 6;
    const rowH = S / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * 0.5;
      const count = 4;
      for (let c = 0; c < count; c++) {
        const x = ((c + offset) / count) * S, w = S / count;
        const shade = mix([128, 128, 136], [176, 176, 184], rng());
        wrapped((dx, dy) => {
          ctx.fillStyle = rgb(shade);
          ctx.fillRect(x + dx + 2, r * rowH + dy + 2, w - 4, rowH - 4);
          ctx.fillStyle = rgba([255, 255, 255], 0.18);
          ctx.fillRect(x + dx + 2, r * rowH + dy + 2, w - 4, 3);
          ctx.fillStyle = rgba([0, 0, 0], 0.18);
          ctx.fillRect(x + dx + 2, r * rowH + dy + rowH - 5, w - 4, 3);
        });
      }
    }
    // texture the block faces
    const image = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < image.data.length; i += 4) {
      const p = i / 4, x = p % S, y = Math.floor(p / S);
      const k = 0.86 + 0.28 * n(x * 2, y * 2);
      for (let c = 0; c < 3; c++) image.data[i + c] *= k;
    }
    ctx.putImageData(image, 0, 0);
  },

  moonTiles(ctx, rng, glow) {
    const n = fbm(rng);
    fillPixels(ctx, (x, y) => mix([70, 72, 130], [104, 108, 170], n(x, y)));
    const tiles = 4, t = S / tiles;
    for (let i = 0; i < tiles; i++) {
      for (let j = 0; j < tiles; j++) {
        const shade = mix([92, 96, 160], [128, 132, 196], rng());
        ctx.fillStyle = rgb(shade);
        ctx.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
        ctx.fillStyle = rgba([190, 200, 255], 0.12);
        ctx.fillRect(i * t + 3, j * t + 3, t - 6, 2);
      }
    }
    speckle(ctx, rng, 400, [rgba([210, 220, 255], 0.35), rgba([20, 20, 50], 0.4)]);
    // glowing grout + runes
    glow.strokeStyle = '#fff';
    glow.lineWidth = 2;
    for (let i = 0; i <= tiles; i++) {
      glow.beginPath(); glow.moveTo(i * t, 0); glow.lineTo(i * t, S); glow.stroke();
      glow.beginPath(); glow.moveTo(0, i * t); glow.lineTo(S, i * t); glow.stroke();
    }
    ctx.strokeStyle = rgb([140, 230, 255]);
    ctx.lineWidth = 2;
    for (let i = 0; i <= tiles; i++) {
      ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(S, i * t); ctx.stroke();
    }
    for (let k = 0; k < 5; k++) {
      const cx = (Math.floor(rng() * tiles) + 0.5) * t, cy = (Math.floor(rng() * tiles) + 0.5) * t, r = t * 0.22;
      for (const c of [ctx, glow]) {
        c.strokeStyle = c === glow ? '#fff' : rgb([150, 235, 255]);
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy - r); c.lineTo(cx, cy + r); c.stroke();
      }
    }
  },

  basalt(ctx, rng, glow) {
    const n = fbm(rng, [8, 16, 32, 64]);
    const cols = [];
    let x = 0;
    while (x < S) {
      const w = Math.min(S - x, 22 + Math.floor(rng() * 20));
      cols.push({ x, w, k: 0.75 + rng() * 0.45 });
      x += w;
    }
    fillPixels(ctx, (px, py) => {
      const col = cols.find(c => px >= c.x && px < c.x + c.w) || cols[0];
      const edge = Math.min(px - col.x, col.x + col.w - 1 - px);
      const bevel = edge < 2 ? 0.6 : 1;
      return mix([30, 32, 56], [58, 62, 96], n(px, py)).map(v => v * col.k * bevel);
    });
    // glowing veins
    for (let i = 0; i < 4; i++) {
      let vx = rng() * S, vy = 0;
      const pts = [[vx, vy]];
      while (vy < S) { vx += (rng() - 0.5) * 26; vy += 10 + rng() * 18; pts.push([vx, Math.min(vy, S)]); }
      for (const c of [ctx, glow]) {
        c.strokeStyle = c === glow ? '#fff' : rgb([120, 220, 255]);
        c.lineWidth = 1.6;
        wrapped(dx => {
          c.beginPath();
          pts.forEach(([px, py], k) => (k ? c.lineTo(px + dx, py) : c.moveTo(px + dx, py)));
          c.stroke();
        });
      }
    }
  },

  fields(ctx, rng) {
    const crops = [[96, 150, 60], [132, 170, 70], [176, 180, 90], [84, 128, 52], [150, 160, 72], [200, 184, 104]];
    const cells = 4, c = S / cells;
    const n = fbm(rng, [8, 16, 32]);
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const base = crops[Math.floor(rng() * crops.length)];
        const vertical = rng() < 0.5;
        for (let k = 0; k < c; k += 4) {
          ctx.fillStyle = rgb(mix(base, [255, 255, 255], (k / 4) % 2 ? 0.06 : 0));
          if (vertical) ctx.fillRect(i * c + k, j * c, 4, c); else ctx.fillRect(i * c, j * c + k, c, 4);
        }
      }
    }
    const image = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < image.data.length; i += 4) {
      const p = i / 4, k = 0.85 + 0.3 * n(p % S, Math.floor(p / S));
      for (let ch = 0; ch < 3; ch++) image.data[i + ch] *= k;
    }
    ctx.putImageData(image, 0, 0);
    // hedgerows + trees
    ctx.strokeStyle = rgb([48, 84, 36]);
    ctx.lineWidth = 3;
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath(); ctx.moveTo(i * c, 0); ctx.lineTo(i * c, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * c); ctx.lineTo(S, i * c); ctx.stroke();
    }
    speckle(ctx, rng, 60, [rgb([40, 80, 34]), rgb([56, 100, 40])], [3, 6]);
  },

  cracked(ctx, rng) {
    const n = fbm(rng);
    fillPixels(ctx, (x, y) => mix([214, 196, 170], [240, 228, 208], n(x, y)));
    ctx.strokeStyle = rgba([150, 120, 96], 0.7);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      let x = rng() * S, y = rng() * S;
      const pts = [[x, y]];
      for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; pts.push([x, y]); }
      wrapped((dx, dy) => {
        ctx.beginPath();
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
        ctx.stroke();
      });
    }
    speckle(ctx, rng, 300, [rgba([180, 150, 120], 0.5), rgba([255, 245, 230], 0.5)], [1, 3]);
  },

  clouds(ctx, rng) {
    const n = fbm(rng, [2, 4, 8, 16, 32]);
    fillPixels(ctx, (x, y) => {
      const v = n(x, y);
      return mix([200, 190, 210], [255, 250, 252], Math.min(1, Math.max(0, (v - 0.3) * 2)));
    });
  },

  brick(ctx, rng) {
    const n = fbm(rng, [16, 32, 64]);
    fillPixels(ctx, (x, y) => mix([160, 150, 140], [196, 188, 178], n(x, y)));
    const rows = 8, rowH = S / rows, count = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < count; c++) {
        const x = ((c + (r % 2) * 0.5) / count) * S;
        const shade = mix([150, 62, 46], [196, 96, 70], rng());
        wrapped((dx, dy) => {
          ctx.fillStyle = rgb(shade);
          ctx.fillRect(x + dx + 2, r * rowH + dy + 2, S / count - 4, rowH - 4);
          ctx.fillStyle = rgba([0, 0, 0], 0.15);
          ctx.fillRect(x + dx + 2, r * rowH + dy + rowH - 5, S / count - 4, 3);
        });
      }
    }
    speckle(ctx, rng, 500, [rgba([90, 40, 30], 0.35), rgba([240, 200, 170], 0.25)]);
  },

  planks(ctx, rng) {
    const planks = 4, h = S / planks;
    const grain = valueNoise(rng, 4);
    const fine = fbm(rng, [8, 16, 32, 64]);
    fillPixels(ctx, (x, y) => {
      const p = Math.floor(y / h);
      const rings = 0.5 + 0.5 * Math.sin((y % h) * 0.5 + grain(x, y + p * 37) * 14 + p * 2.1);
      const base = mix([140, 94, 56], [186, 134, 84], rings * 0.5 + fine(x, y) * 0.5);
      const gap = (y % h) < 2 || (y % h) > h - 2;
      return gap ? base.map(v => v * 0.45) : base.map(v => v * (0.92 + 0.08 * ((p * 7) % 3)));
    });
    for (let p = 0; p < planks; p++) {
      for (const x of [20, S / 2 + 20]) {
        ctx.fillStyle = rgb([70, 70, 76]);
        ctx.fillRect(x, p * h + 8, 3, 3);
        ctx.fillRect(x, p * h + h - 11, 3, 3);
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Zone textures (lagoon, grove, volcano, crystal — see world/zones.js)
// ---------------------------------------------------------------------------
Object.assign(PAINTERS, {
  /** Lagoon: pale sand with wind ripples, shells and the odd starfish. */
  sandTop(ctx, rng) {
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    const warp = valueNoise(rng, 4);
    fillPixels(ctx, (x, y) => {
      const ripple = 0.5 + 0.5 * Math.sin((x + y * 0.35) / S * Math.PI * 2 * 9 + warp(x, y) * 7);
      return mix([214, 186, 132], [246, 228, 184], n(x, y) * 0.7 + ripple * 0.3);
    });
    speckle(ctx, rng, 900, [rgba([190, 160, 110], 0.5), rgba([255, 248, 225], 0.55), rgba([170, 140, 100], 0.35)], [1, 2]);
    for (let i = 0; i < 14; i++) {                       // shells
      const x = rng() * S, y = rng() * S, r = 2 + rng() * 2.5, c = [[255, 210, 210], [250, 240, 230], [255, 190, 160]][i % 3];
      wrapped((dx, dy) => {
        ctx.fillStyle = rgb(c);
        ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r, r * 0.8, rng() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba([170, 120, 110], 0.6); ctx.lineWidth = 0.7;
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + dx, y + dy + r * 0.7); ctx.lineTo(x + dx + k * r * 0.7, y + dy - r * 0.6); ctx.stroke(); }
      });
    }
    for (let i = 0; i < 4; i++) {                        // starfish
      const x = rng() * S, y = rng() * S, a0 = rng() * Math.PI;
      wrapped((dx, dy) => {
        ctx.fillStyle = rgb([240, 120, 70]);
        ctx.beginPath();
        for (let k = 0; k < 10; k++) { const a = a0 + k * Math.PI / 5, r = k % 2 ? 1.6 : 4.5; ctx.lineTo(x + dx + Math.cos(a) * r, y + dy + Math.sin(a) * r); }
        ctx.fill();
      });
    }
  },

  /** Lagoon sides: pale porous coral rock with pastel coral and holes. */
  coralSide(ctx, rng) {
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    fillPixels(ctx, (x, y) => mix([196, 170, 140], [232, 214, 188], n(x, y)).map(v => v * (0.92 + 0.08 * Math.sin(y / 9))));
    for (let i = 0; i < 160; i++) {                      // pores
      const x = rng() * S, y = rng() * S, r = 1 + rng() * 2.6;
      wrapped((dx, dy) => { ctx.fillStyle = rgba([120, 96, 80], 0.55); ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill(); });
    }
    for (let i = 0; i < 22; i++) {                       // coral branches
      let x = rng() * S, y = rng() * S;
      const c = [[255, 130, 150], [255, 170, 100], [190, 130, 255], [120, 220, 200]][i % 4];
      ctx.strokeStyle = rgb(c); ctx.lineWidth = 2;
      for (let b = 0; b < 3; b++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 1.6, l = 6 + rng() * 10;
        wrapped((dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); ctx.stroke(); });
      }
      x += 1; y += 1;
    }
  },

  /** Lagoon water far below: turquoise with wave crests and glints (glowing a little). */
  water(ctx, rng, glow) {
    const n = fbm(rng, [2, 4, 8, 16]);
    const warp = valueNoise(rng, 4);
    fillPixels(ctx, (x, y) => {
      const wave = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 6 + warp(x, y) * 6 + (x / S) * Math.PI * 2);
      return mix([26, 128, 160], [70, 196, 204], n(x, y) * 0.6 + wave * 0.4);
    });
    for (let i = 0; i < 70; i++) {
      const x = rng() * S, y = rng() * S, l = 4 + rng() * 10;
      for (const c of [ctx, glow]) {
        c.strokeStyle = c === glow ? 'rgba(255,255,255,0.5)' : rgba([220, 250, 250], 0.8);
        c.lineWidth = 1.2;
        wrapped((dx, dy) => { c.beginPath(); c.moveTo(x + dx, y + dy); c.quadraticCurveTo(x + dx + l / 2, y + dy - 2, x + dx + l, y + dy); c.stroke(); });
      }
    }
  },

  /** Grove: soft dark moss with clover, tiny toadstools and glowing specks. */
  mossTop(ctx, rng, glow) {
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    fillPixels(ctx, (x, y) => mix([28, 70, 56], [70, 130, 88], n(x, y)));
    for (let i = 0; i < 90; i++) {                       // soft clumps of moss
      const x = rng() * S, y = rng() * S, r = 4 + rng() * 9;
      const c = mix([60, 120, 80], [110, 170, 110], rng());
      wrapped((dx, dy) => { ctx.fillStyle = rgba(c, 0.45); ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = rgba([20, 50, 40], 0.35); ctx.beginPath(); ctx.arc(x + dx + r * 0.3, y + dy + r * 0.35, r * 0.55, 0, Math.PI * 2); ctx.fill(); });
    }
    speckle(ctx, rng, 1400, [rgba([24, 60, 44], 0.6), rgba([120, 180, 120], 0.5), rgba([56, 104, 70], 0.6)], [1, 3]);
    for (let i = 0; i < 24; i++) {                       // tiny toadstools (seen from above)
      const x = rng() * S, y = rng() * S, r = 1.8 + rng() * 1.8;
      const cap = [[220, 60, 60], [240, 170, 60], [180, 110, 220]][i % 3];
      wrapped((dx, dy) => {
        ctx.fillStyle = rgb(cap); ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgb([255, 250, 240]); ctx.fillRect(x + dx - 0.6, y + dy - 0.6, 1.2, 1.2);
      });
    }
    for (let i = 0; i < 40; i++) {                       // glowing spores
      const x = rng() * S, y = rng() * S;
      for (const c of [ctx, glow]) { c.fillStyle = c === glow ? '#fff' : rgb([150, 255, 200]); wrapped((dx, dy) => c.fillRect(x + dx, y + dy, 1.5, 1.5)); }
    }
  },

  /** Grove sides: dark loam, tangled roots and a few glowing fungi. */
  rootSide(ctx, rng, glow) {
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    fillPixels(ctx, (x, y) => mix([40, 30, 26], [76, 58, 44], n(x, y)));
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 26; i++) {
      let x = rng() * S, y = rng() * S;
      ctx.strokeStyle = rgba(mix([90, 66, 44], [130, 100, 70], rng()), 0.9);
      const pts = [[x, y]];
      for (let k = 0; k < 7; k++) { x += (rng() - 0.5) * 22; y += 4 + rng() * 10; pts.push([x, y]); }
      wrapped((dx, dy) => { ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy))); ctx.stroke(); });
    }
    for (let i = 0; i < 12; i++) {
      const x = rng() * S, y = rng() * S;
      for (const c of [ctx, glow]) {
        c.fillStyle = c === glow ? '#fff' : rgb([110, 240, 210]);
        wrapped((dx, dy) => { c.beginPath(); c.ellipse(x + dx, y + dy, 3.5, 1.6, 0, Math.PI, 0); c.fill(); });
      }
    }
  },

  /** Grove floor, far below: leaf litter in the gloom, dotted with glowing caps. */
  leafLitter(ctx, rng, glow) {
    const n = fbm(rng, [4, 8, 16, 32]);
    fillPixels(ctx, (x, y) => mix([26, 36, 24], [56, 70, 44], n(x, y)));
    for (let i = 0; i < 500; i++) {
      const x = rng() * S, y = rng() * S;
      ctx.fillStyle = rgba(mix([70, 50, 30], [110, 110, 50], rng()), 0.7);
      wrapped((dx, dy) => { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 3 + rng() * 3, 1.5 + rng(), rng() * 3, 0, Math.PI * 2); ctx.fill(); });
    }
    for (let i = 0; i < 30; i++) {
      const x = rng() * S, y = rng() * S;
      for (const c of [ctx, glow]) { c.fillStyle = c === glow ? '#fff' : rgb([120, 255, 190]); wrapped((dx, dy) => { c.beginPath(); c.arc(x + dx, y + dy, 2, 0, Math.PI * 2); c.fill(); }); }
    }
  },

  /** Volcano: charcoal basalt with glowing ember cracks. */
  ashTop(ctx, rng, glow) {
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    fillPixels(ctx, (x, y) => mix([52, 46, 48], [96, 86, 86], n(x, y)));
    speckle(ctx, rng, 700, [rgba([30, 26, 28], 0.6), rgba([130, 120, 118], 0.45)], [1, 2.5]);
    for (let i = 0; i < 16; i++) {
      let x = rng() * S, y = rng() * S;
      const pts = [[x, y]];
      for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 34; y += (rng() - 0.5) * 34; pts.push([x, y]); }
      for (const c of [ctx, glow]) {
        c.strokeStyle = c === glow ? '#fff' : rgb([255, 120, 40]);
        c.lineWidth = c === glow ? 1.2 : 1.6;
        wrapped((dx, dy) => { c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px + dx, py + dy) : c.moveTo(px + dx, py + dy))); c.stroke(); });
      }
    }
  },

  /** Volcano sides: layered dark rock with veins of lava. */
  magmaSide(ctx, rng, glow) {
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    const band = valueNoise(rng, 6);
    fillPixels(ctx, (x, y) => {
      const stripe = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 5 + band(x, y) * 4);
      return mix([36, 28, 30], [84, 62, 58], n(x, y) * 0.7 + stripe * 0.3);
    });
    for (let i = 0; i < 6; i++) {
      let x = rng() * S, y = 0;
      const pts = [[x, y]];
      while (y < S) { x += (rng() - 0.5) * 30; y += 8 + rng() * 16; pts.push([x, Math.min(y, S)]); }
      for (const c of [ctx, glow]) {
        c.strokeStyle = c === glow ? '#fff' : rgb([255, 140, 40]);
        c.lineWidth = 2;
        wrapped(dx => { c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px + dx, py) : c.moveTo(px + dx, py))); c.stroke(); });
      }
    }
  },

  /** A sea of lava far below: bright molten cracks around dark crust plates (glowing). */
  lava(ctx, rng, glow) {
    const n = fbm(rng, [2, 4, 8, 16]);
    const cells = valueNoise(rng, 8);
    fillPixels(ctx, (x, y) => {
      const v = n(x, y), c = cells(x, y);
      const crust = Math.abs(c - 0.5) < 0.07 ? 0 : 1;
      return crust ? mix([226, 78, 18], [255, 150, 44], v) : mix([70, 30, 24], [120, 50, 30], v);
    });
    glow.fillStyle = 'rgba(255,255,255,0.85)';
    glow.fillRect(0, 0, S, S);
  },

  /** Crystal: pale amethyst facets, tiled, with bright edges that glow. */
  crystalTop(ctx, rng, glow) {
    const t = S / 4;
    const n = fbm(rng, [8, 16, 32]);
    fillPixels(ctx, (x, y) => {
      const u = (x % t) / t, v = (y % t) / t;
      const facet = u > v ? (u + v > 1 ? 0 : 1) : (u + v > 1 ? 2 : 3);       // four triangles per tile
      const k = [1.06, 0.94, 0.88, 1.0][facet] * (0.94 + 0.12 * n(x, y));
      return [198, 180, 230].map(c => c * k);
    });
    for (let i = 0; i <= 4; i++) {
      for (const c of [ctx, glow]) {
        c.strokeStyle = c === glow ? 'rgba(255,255,255,0.6)' : rgb([245, 235, 255]);
        c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(i * t, 0); c.lineTo(i * t, S); c.moveTo(0, i * t); c.lineTo(S, i * t); c.stroke();
      }
    }
    ctx.strokeStyle = rgba([150, 120, 200], 0.5);
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.beginPath(); ctx.moveTo(i * t, j * t); ctx.lineTo((i + 1) * t, (j + 1) * t); ctx.moveTo((i + 1) * t, j * t); ctx.lineTo(i * t, (j + 1) * t); ctx.stroke();
    }
    speckle(ctx, rng, 120, [rgba([255, 255, 255], 0.8)], [1, 1.6]);
  },

  /** Crystal sides: geode bands (purple to white) with crystal points glowing. */
  geodeSide(ctx, rng, glow) {
    const palette = [[92, 56, 140], [126, 86, 176], [170, 130, 210], [210, 190, 236], [70, 44, 110]];
    const bands = [];
    let y = 0;
    while (y < S) { const h = Math.min(S - y, 6 + Math.floor(rng() * 22)); bands.push({ y, h, c: palette[Math.floor(rng() * palette.length)] }); y += h; }
    const n = fbm(rng, [4, 8, 16, 32, 64]);
    const wobble = valueNoise(rng, 4);
    fillPixels(ctx, (x, py) => {
      const yy = ((py + wobble(x, py) * 12) % S + S) % S;
      const b = bands.find(band => yy >= band.y && yy < band.y + band.h) || bands[0];
      return b.c.map(v => v * (0.86 + 0.28 * n(x, py)));
    });
    for (let i = 0; i < 26; i++) {
      const x = rng() * S, yy = rng() * S, h = 5 + rng() * 9;
      for (const c of [ctx, glow]) {
        c.fillStyle = c === glow ? '#fff' : rgb([230, 210, 255]);
        wrapped((dx, dy) => { c.beginPath(); c.moveTo(x + dx - 2.5, yy + dy); c.lineTo(x + dx + 2.5, yy + dy); c.lineTo(x + dx, yy + dy - h); c.fill(); });
      }
    }
  },

  /** The cavern floor, far below: dark violet rock with clusters of glowing crystal. */
  geodeFloor(ctx, rng, glow) {
    const n = fbm(rng, [4, 8, 16, 32]);
    fillPixels(ctx, (x, y) => mix([50, 26, 76], [92, 56, 120], n(x, y)));
    for (let i = 0; i < 60; i++) {
      const x = rng() * S, y = rng() * S, r = 2 + rng() * 4;
      const c0 = [[200, 150, 255], [120, 240, 255], [255, 150, 230]][i % 3];
      for (const c of [ctx, glow]) {
        c.fillStyle = c === glow ? '#fff' : rgb(c0);
        wrapped((dx, dy) => { c.beginPath(); c.moveTo(x + dx, y + dy - r); c.lineTo(x + dx + r * 0.6, y + dy); c.lineTo(x + dx, y + dy + r); c.lineTo(x + dx - r * 0.6, y + dy); c.fill(); });
      }
    }
  },
});

function paintStones(ctx, rng, { base, light, grout, moss }) {
  fillPixels(ctx, () => grout);
  const cells = 4, c = S / cells;
  const n = fbm(rng, [8, 16, 32, 64]);
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      // split some cells into two stones for irregularity
      const split = rng() < 0.45;
      const parts = split
        ? (rng() < 0.5
          ? [[i * c, j * c, c / 2, c], [i * c + c / 2, j * c, c / 2, c]]
          : [[i * c, j * c, c, c / 2], [i * c, j * c + c / 2, c, c / 2]])
        : [[i * c, j * c, c, c]];
      for (const [x, y, w, h] of parts) {
        const shade = mix(base, light, rng());
        ctx.fillStyle = rgb(shade);
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(x + 3 + r, y + 3);
        ctx.arcTo(x + w - 3, y + 3, x + w - 3, y + h - 3, r);
        ctx.arcTo(x + w - 3, y + h - 3, x + 3, y + h - 3, r);
        ctx.arcTo(x + 3, y + h - 3, x + 3, y + 3, r);
        ctx.arcTo(x + 3, y + 3, x + w - 3, y + 3, r);
        ctx.fill();
      }
    }
  }
  const image = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < image.data.length; i += 4) {
    const p = i / 4, k = 0.82 + 0.34 * n(p % S, Math.floor(p / S));
    for (let ch = 0; ch < 3; ch++) image.data[i + ch] *= k;
  }
  ctx.putImageData(image, 0, 0);
  if (moss) speckle(ctx, rng, Math.round(700 * moss), [rgba([80, 120, 50], 0.6), rgba([110, 150, 60], 0.5)], [1, 3]);
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
/** Paint a texture into a new canvas. Alpha encodes the emissive mask. */
export function paintTexture(id) {
  const painter = PAINTERS[id];
  if (!painter) throw new Error(`Unknown texture "${id}"`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = S;
  const glow = glowCanvas.getContext('2d', { willReadFrequently: true });
  glow.fillStyle = '#000';
  glow.fillRect(0, 0, S, S);
  painter(ctx, mulberry32(hashSeed('texture', id)), glow);

  const image = ctx.getImageData(0, 0, S, S);
  const mask = glow.getImageData(0, 0, S, S).data;
  for (let i = 0; i < image.data.length; i += 4) image.data[i + 3] = 255 - Math.round(mask[i] * 0.5);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export const PAINTER_IDS = Object.keys(PAINTERS);
