/**
 * Character portraits — small 2D drawings of the avatar for menus (roster cards,
 * saved designs). The same posed box parts the 3D renderer uses are projected
 * orthographically and painted back-to-front with the renderer's per-face
 * lighting. Cheap (a few dozen polygons) and needs no extra WebGL context, which
 * matters on machines that render WebGL in software.
 *
 *   drawPortrait(canvas, parts, { yaw: 0.55, pitch: 0.18, background: [...] })
 */
import { transformPoint } from './mat4.js';

// Unit-cube faces: 4 corner indices (into CORNERS) each, wound consistently.
const CORNERS = [];
for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) CORNERS.push([x, y, z]);
const FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];

const css = (c, k = 1) => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(1, v * k)) * 255)).join(',')})`;

/**
 * Project posed parts to 2D polygons: [{ points: [[x, y]…], depth, color, light }].
 * View: rotate the figure by `yaw` (about Y), tilt by `pitch` (look slightly down).
 */
export function projectParts(parts, { yaw = 0.55, pitch = 0.18 } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const view = ([x, y, z]) => {
    const rx = cy * x + sy * z, rz = -sy * x + cy * z;       // yaw
    return [rx, cp * y - sp * rz, sp * y + cp * rz];          // pitch; +z = toward the viewer
  };
  const polygons = [];
  for (const part of parts) {
    const world = CORNERS.map(c => transformPoint(part.matrix, c));
    const v = world.map(view);
    for (const face of FACES) {
      const [a, b, c] = face.map(i => v[i]);
      // normal in view space (faces toward the viewer have nz > 0)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nz = ux * wy - uy * wx;
      if (nz <= 1e-9) continue;
      // world-space normal for the renderer's lighting: 0.75 + 0.25 n.y + 0.1 n.x
      const [p, q, r] = face.map(i => world[i]);
      const n = [
        (q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]),
        (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]),
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]),
      ];
      const len = Math.hypot(...n) || 1;
      const light = part.glow ? 1 : 0.75 + 0.25 * (n[1] / len) + 0.1 * (n[0] / len);
      polygons.push({
        points: face.map(i => [v[i][0], v[i][1]]),
        depth: face.reduce((s, i) => s + v[i][2], 0) / 4,
        color: part.color,
        light,
      });
    }
  }
  polygons.sort((a, b) => a.depth - b.depth); // far first
  return polygons;
}

/**
 * Draw a portrait of posed `parts` (feet at the origin) filling `canvas`.
 * `framing`: 'full' (whole figure) or 'bust' (head and shoulders).
 */
export function drawPortrait(canvas, parts, { yaw = 0.55, pitch = 0.18, background = null, framing = 'full' } = {}) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (background) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, css(background[0]));
    g.addColorStop(1, css(background[1]));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  const polygons = projectParts(parts, { yaw, pitch });
  if (!polygons.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const { points } of polygons) for (const [x, y] of points) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (framing === 'bust') y0 = y1 - (y1 - y0) * 0.55;
  const pad = 0.1;
  const scale = Math.min(width / ((x1 - x0) * (1 + 2 * pad)), height / ((y1 - y0) * (1 + 2 * pad)));
  const cx = width / 2 - ((x0 + x1) / 2) * scale;
  const cy = height / 2 + ((y0 + y1) / 2) * scale;
  ctx.lineJoin = 'round';
  for (const { points, color, light } of polygons) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * scale, cy - y * scale) : ctx.moveTo(cx + x * scale, cy - y * scale)));
    ctx.closePath();
    ctx.fillStyle = css(color, light);
    ctx.fill();
    // a hairline in the same colour hides anti-aliasing seams between faces
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}
