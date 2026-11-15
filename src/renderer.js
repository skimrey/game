import { multiply, compose, translation, scaling, rotationY } from './mat4.js';
import { BIOMES, fogColor } from './biomes.js';
import { MATERIALS } from './materials.js';
import { paintTexture } from './textures.js';
import { chaseCamera, FOV } from './camera.js';
import { PRESETS } from './quality.js';
import { gemParts } from './gem.js';

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
  return result;
}

function program(gl, vertex, fragment, attributes) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fragment));
  attributes.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function uniformsOf(gl, p) {
  const out = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    out[name] = gl.getUniformLocation(p, name);
  }
  return out;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0, 0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, 2 * far * near / (near - far), 0
  ]);
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const normalize = v => { const l = Math.hypot(...v); return v.map(n => n / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);

function cameraBasis(eye, target) {
  const back = normalize(sub(eye, target));
  const right = normalize(cross([0, 1, 0], back));
  const up = cross(back, right);
  return { back, right, up, forward: back.map(v => -v) };
}

function lookAt(eye, target) {
  const { back: z, right: x, up: y } = cameraBasis(eye, target);
  return new Float32Array([
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

export { chaseCamera, FOV };

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const PRECISION = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
`;

const WORLD_VS = `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec4 vcolor;   // rgb tint + glow
  attribute vec3 local;    // position inside the unit box (-0.5..0.5) — textured boxes only
  attribute vec4 box;      // box size xyz + world-space top — textured boxes only
  attribute float alpha;
  uniform mat4 viewProjection;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec4 vBox;
  varying vec4 vColor;
  varying float vAlpha;
  void main() {
    vWorld = position;
    vNormal = normal;
    vLocal = local;
    vBox = box;
    vColor = vcolor;
    vAlpha = alpha;
    gl_Position = viewProjection * vec4(position, 1.0);
  }
`;

// Lighting: 0.75 + 0.25 * n.y + 0.1 * n.x reproduces the original per-face
// shades for axis-aligned boxes and stays correct for rotated parts.
const WORLD_FS = `${PRECISION}
  uniform vec3 lightTint;
  uniform vec3 fogColor;
  uniform vec2 fogRange;
  uniform float fogMax;
  uniform vec3 cameraPos;
  uniform vec3 haze;          // x: course floor height, y: depth to full haze, z: max strength
  uniform float textured;
  uniform sampler2D topTex;
  uniform sampler2D sideTex;
  uniform float texScale;
  uniform vec3 fringeColor;
  uniform float fringe;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec4 vBox;
  varying vec4 vColor;
  varying float vAlpha;

  void main() {
    vec3 n = normalize(vNormal);
    float light = 0.75 + 0.25 * n.y + 0.1 * n.x;
    vec3 base = vColor.rgb;
    float g = vColor.a;

    if (textured > 0.5) {
      vec4 t;
      if (n.y > 0.5) {
        t = texture2D(topTex, vWorld.xz / texScale);
        // bright rim along top edges makes platform outlines readable
        vec2 d = (0.5 - abs(vLocal.xz)) * vBox.xz;
        float e = min(d.x, d.y);
        t.rgb *= 1.0 + 0.16 * (1.0 - smoothstep(0.0, 0.14, e));
      } else {
        vec2 uv = abs(n.x) > 0.5 ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y);
        t = texture2D(sideTex, uv / texScale);
        float depth = vBox.w - vWorld.y;
        if (fringe > 0.5 && n.y > -0.5) {
          float wave = sin(vWorld.x * 7.3 + vWorld.z * 5.1) * sin(vWorld.x * 3.1 - vWorld.z * 8.7 + 1.3);
          float edge = 0.1 + 0.07 * wave;
          if (depth < edge) t = vec4(fringeColor * (0.92 + 0.08 * wave), 1.0);
          else if (depth < edge + 0.06) t.rgb *= 0.7;
        }
        // ambient occlusion toward the bottom of tall sides
        float fromBottom = (vLocal.y + 0.5) * vBox.y;
        t.rgb *= 0.78 + 0.22 * smoothstep(0.0, 0.6, fromBottom);
        if (n.y < -0.5) t.rgb *= 0.8;
      }
      base *= t.rgb;
      g += (1.0 - t.a) * 2.0;
    }

    float glowAmount = clamp(g, 0.0, 1.0);
    vec3 lit = base * mix(light * lightTint, vec3(1.0), glowAmount);
    float dist = distance(vWorld, cameraPos);
    float distanceFog = smoothstep(fogRange.x, fogRange.y, dist) * fogMax;
    // height haze: anything far below the course melts into the backdrop
    float heightFog = clamp((haze.x - vWorld.y) / haze.y, 0.0, 1.0) * haze.z;
    float fog = max(distanceFog, heightFog) * (1.0 - 0.5 * glowAmount);
    gl_FragColor = vec4(mix(lit, fogColor, fog), vAlpha);
  }
`;

const SKY_VS = `
  attribute vec2 corner;
  varying vec2 ndc;
  void main() {
    ndc = corner;
    gl_Position = vec4(corner, 0.9999, 1.0);
  }
`;

const SKY_FS = `${PRECISION}
  varying vec2 ndc;
  uniform vec3 camRight;
  uniform vec3 camUp;
  uniform vec3 camForward;
  uniform vec2 tanHalf;
  uniform float time;
  uniform vec3 skyTop;
  uniform vec3 skyHorizon;
  uniform vec3 skyBelow;
  uniform vec4 sun;        // xyz dir, w = cos(size); w > 1 disables
  uniform vec4 sunColor;   // rgb, a = glow
  uniform vec4 moon;
  uniform vec4 moonColor;
  uniform vec4 clouds;     // amount, speed, -, -
  uniform vec3 cloudColor;
  uniform vec3 cloudShade;
  uniform vec2 stars;      // above, below
  uniform vec4 aurora;     // rgb, strength
  uniform vec4 aurora2;    // rgb, height
  uniform float skyDetail;   // 0 flat, 1 lite, 2 full
  uniform vec3 ridgeColor[3];
  uniform vec4 ridgeShape[3];  // height, amplitude, frequency, seed
  uniform float ridgeHaze[3];
  uniform float panorama;      // 1: ndc is a panorama texel (x: azimuth, y: dir.y) — used to bake the sky

  const float PI = 3.14159265;

  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  // periodic 1D value noise (period = number of lattice cells around the horizon)
  float noise1(float x, float period, float seed) {
    float i = floor(x), f = fract(x);
    float a = hash(mod(i, period) + seed * 17.0);
    float b = hash(mod(i + 1.0, period) + seed * 17.0);
    return mix(a, b, f * f * (3.0 - 2.0 * f));
  }

  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i.x + i.y * 57.0), b = hash(i.x + 1.0 + i.y * 57.0);
    float c = hash(i.x + (i.y + 1.0) * 57.0), d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm2(vec2 p) {
    float s = 0.0, w = 0.5;
    for (int i = 0; i < 5; i++) { s += noise2(p) * w; p *= 2.03; w *= 0.5; }
    return s;
  }

  float ridgeHeight(float u, vec4 shape) {
    float f = shape.z;
    float h = noise1(u * f, f, shape.w) * 0.6
            + noise1(u * f * 2.0, f * 2.0, shape.w + 3.0) * 0.28
            + noise1(u * f * 4.0, f * 4.0, shape.w + 7.0) * 0.12;
    return shape.x + shape.y * (h * 2.0 - 0.6);
  }

  void main() {
    vec3 dir;
    if (panorama > 0.5) {
      float r = sqrt(max(0.0, 1.0 - ndc.y * ndc.y));
      dir = vec3(sin(ndc.x * PI) * r, ndc.y, cos(ndc.x * PI) * r);
    } else {
      dir = normalize(camForward + ndc.x * tanHalf.x * camRight + ndc.y * tanHalf.y * camUp);
    }
    float e = asin(clamp(dir.y, -1.0, 1.0));          // elevation
    float u = atan(dir.x, dir.z) / (2.0 * PI) + 0.5;  // azimuth 0..1

    // gradient
    vec3 col = e > 0.0
      ? mix(skyHorizon, skyTop, pow(smoothstep(0.0, 1.2, e), 0.6))
      : mix(skyHorizon, skyBelow, smoothstep(0.0, 0.35, -e));

    if (skyDetail < 0.5) { gl_FragColor = vec4(col, 1.0); return; }

    // stars (above and optionally below the horizon)
    float starMask = e > 0.0 ? stars.x * smoothstep(0.0, 0.25, e) : stars.y * smoothstep(0.0, 0.2, -e);
    if (starMask > 0.0 && skyDetail > 1.5) {
      vec3 p = dir * 180.0;
      vec3 cell = floor(p);
      float h = hash3(cell);
      if (h > 0.985) {
        vec3 center = cell + 0.5 + (vec3(hash3(cell + 1.3), hash3(cell + 2.7), hash3(cell + 4.1)) - 0.5) * 0.6;
        float d = length(p - center);
        float twinkle = 0.65 + 0.35 * sin(time * (1.5 + h * 4.0) + h * 60.0);
        col += vec3(0.9, 0.95, 1.0) * smoothstep(0.22, 0.0, d) * twinkle * starMask;
      }
    }

    // aurora: wavy curtains
    if (aurora.w > 0.0 && e > 0.0 && skyDetail > 1.5) {
      float center = aurora2.w + 0.05 * sin(u * 2.0 * PI * 3.0 + time * 0.15) + 0.03 * sin(u * 2.0 * PI * 7.0 - time * 0.2);
      float band = exp(-pow((e - center) / 0.06, 2.0));
      float curtains = 0.55 + 0.45 * sin(u * 2.0 * PI * 40.0 + sin(u * 2.0 * PI * 5.0 + time * 0.3) * 3.0);
      vec3 tint = mix(aurora.rgb, aurora2.rgb, smoothstep(center - 0.05, center + 0.08, e));
      col += tint * band * curtains * aurora.w * 0.6;
    }

    // sun / moon
    if (sun.w <= 1.0) {
      float c = dot(dir, sun.xyz);
      col += sunColor.rgb * sunColor.a * pow(max(c, 0.0), 8.0) * 0.6;
      col += sunColor.rgb * sunColor.a * pow(max(c, 0.0), 64.0) * 0.5;
      col = mix(col, sunColor.rgb * 1.15, smoothstep(sun.w - 0.0004, sun.w + 0.0002, c));
    }
    if (moon.w <= 1.0) {
      float c = dot(dir, moon.xyz);
      col += moonColor.rgb * moonColor.a * pow(max(c, 0.0), 24.0) * 0.5;
      float disc = smoothstep(moon.w - 0.0002, moon.w + 0.0001, c);
      vec2 m = (dir.xy - moon.xy) * 60.0;
      float craters = smoothstep(0.55, 0.8, noise2(m + 3.0)) * 0.6 + smoothstep(0.6, 0.85, noise2(m * 2.1 + 9.0)) * 0.4;
      vec3 surface = moonColor.rgb * (0.95 - 0.2 * craters);
      col = mix(col, surface, disc);
    }

    // clouds on a virtual plane above
    if (clouds.x > 0.0 && dir.y > 0.0 && skyDetail > 1.5) {
      vec2 uv = dir.xz / (dir.y + 0.08) * 1.4 + vec2(time * clouds.y, time * clouds.y * 0.3);
      float n = fbm2(uv);
      float c = smoothstep(1.0 - clouds.x, 1.25 - clouds.x, n) * smoothstep(0.0, 0.12, dir.y);
      vec3 cc = mix(cloudShade, cloudColor, smoothstep(0.4, 0.9, fbm2(uv * 1.7 + 4.0)));
      col = mix(col, cc, c * 0.85);
    }

    // distant ridges, far to near; each fades into the horizon haze
    for (int i = 0; i < 3; i++) {
      float h = ridgeHeight(u, ridgeShape[i]);
      if (e < h) {
        float shade = 0.85 + 0.15 * smoothstep(h - 0.08, h, e);
        col = mix(ridgeColor[i] * shade, skyHorizon, ridgeHaze[i]);
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Vertex shading (the `test` preset's fast path for software rendering).
//
// On a software rasterizer (SwiftShader) the cost of a frame is dominated by
// per-pixel work: every varying is interpolated and the whole fragment shader
// runs for every covered pixel. This path computes lighting, ambient occlusion
// and fog once per *vertex* and hands the fragment shader a multiply-add:
//     colour = vMul * texture + vAdd        (vMul = lit surface · (1 - fog), vAdd = fog colour · fog)
// — 9 interpolated floats instead of 18 and a one-line fragment shader. Top and
// side faces are drawn as separate ranges (one texture each, no per-pixel branch),
// the grass/sand/snow lip along top edges becomes a thin strip of geometry, and
// the huge ground plane is tessellated so per-vertex fog stays accurate.
// ---------------------------------------------------------------------------
const LITE_VS = `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec4 vcolor;
  attribute vec3 local;
  attribute vec4 box;
  attribute float alpha;
  uniform mat4 viewProjection;
  uniform vec3 lightTint;
  uniform vec3 fogColor;
  uniform vec2 fogRange;
  uniform float fogMax;
  uniform vec3 cameraPos;
  uniform vec3 haze;
  uniform float texScale;
  varying vec3 vMul;
  varying vec3 vAdd;
  varying vec2 vUV;
  varying float vAlpha;
  void main() {
    vec3 n = normal;
    float light = 0.75 + 0.25 * n.y + 0.1 * n.x;
    float glow = clamp(vcolor.a, 0.0, 1.0);
    vec3 base = vcolor.rgb;
    if (box.y > 0.0 && n.y < 0.5) {
      // textured sides: ambient occlusion toward the bottom, darker undersides
      base *= 0.78 + 0.22 * smoothstep(0.0, 0.6, (local.y + 0.5) * box.y);
      if (n.y < -0.5) base *= 0.8;
    }
    vec3 lit = base * mix(light * lightTint, vec3(1.0), glow);
    float distanceFog = smoothstep(fogRange.x, fogRange.y, distance(position, cameraPos)) * fogMax;
    float heightFog = clamp((haze.x - position.y) / haze.y, 0.0, 1.0) * haze.z;
    float fog = max(distanceFog, heightFog) * (1.0 - 0.5 * glow);
    vMul = lit * (1.0 - fog);
    vAdd = fogColor * fog;
    vUV = (n.y > 0.5 ? position.xz : abs(n.x) > 0.5 ? position.zy : position.xy) / texScale;
    vAlpha = alpha;
    gl_Position = viewProjection * vec4(position, 1.0);
  }
`;

const LITE_FS_TEXTURED = `${PRECISION}
  uniform sampler2D tex;
  uniform float texBias;   // > 0 samples a smaller mipmap: calmer (less sparkle when moving), cache-friendlier
  varying vec3 vMul;
  varying vec3 vAdd;
  varying vec2 vUV;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(tex, vUV, texBias);
    // texture alpha < 1 marks emissive detail (glowing runes / veins): show it unlit
    gl_FragColor = vec4(mix(vMul * t.rgb + vAdd, t.rgb, (1.0 - t.a) * 1.6), vAlpha);
  }
`;

const LITE_FS_FLAT = `${PRECISION}
  varying vec3 vMul;
  varying vec3 vAdd;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vMul + vAdd, vAlpha);
  }
`;

// Baked sky: the full sky shader is rendered once per biome into a panorama
// texture (x: azimuth, y: direction.y). Each frame a coarse screen-space grid
// works out the panorama coordinates per vertex — azimuth measured from the
// camera's heading, so the texture's wrap-around seam is never interpolated
// across — and the fragment shader is a single texture lookup.
const SKYGRID_VS = `
  attribute vec2 corner;     // grid point in normalised device coordinates
  uniform vec3 camRight;
  uniform vec3 camUp;
  uniform vec3 camForward;
  uniform vec2 tanHalf;
  uniform float heading;     // camera azimuth in turns
  varying vec2 vUV;
  const float TAU = 6.2831853;
  void main() {
    vec3 dir = normalize(camForward + corner.x * tanHalf.x * camRight + corner.y * tanHalf.y * camUp);
    float turn = atan(dir.x, dir.z) / TAU - heading;
    turn -= floor(turn + 0.5);                      // relative to the heading: -0.5..0.5, no seam on screen
    vUV = vec2(heading + turn + 0.5, 0.5 + 0.5 * dir.y);
    gl_Position = vec4(corner, 0.99999, 1.0);       // at the far plane: only uncovered pixels
  }
`;

const SKYGRID_FS = `${PRECISION}
  uniform sampler2D sky;
  varying vec2 vUV;
  void main() {
    gl_FragColor = texture2D(sky, vUV);
  }
`;

// ---------------------------------------------------------------------------
// Geometry: every box becomes 36 vertices in one interleaved format, so whole
// groups of boxes draw in a single call (draw calls are expensive on software
// WebGL). Faces are wound clockwise seen from outside → back-face culling.
// ---------------------------------------------------------------------------
const FACES = [
  [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], [0, 1, 0]],
  [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1], [0, -1, 0]],
  [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [0, 0, -1]],
  [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1], [0, 0, 1]],
  [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, 0, 0]],
  [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1], [1, 0, 0]],
];
const CUBE = [];
for (const face of FACES) {
  for (const index of [0, 1, 2, 0, 2, 3]) CUBE.push([face[index].map(n => n / 2), face[4]]);
}

export const FLOATS_PER_VERTEX = 18; // position 3 · normal 3 · colour+glow 4 · local 3 · box 4 · alpha 1
const STRIDE = FLOATS_PER_VERTEX * 4;
const VERTS_PER_BOX = 36;

/** Vertex range of CUBE's top face: [first, end). Face f (0 top, 1 bottom, 2 -z, 3 +z, 4 -x, 5 +x) is [6f, 6f + 6). */
const TOP_FACE = [0, 6];

/**
 * Write an axis-aligned / Y-rotated box. `textured` boxes also carry local coords + size/top.
 * `range` limits which of the 36 vertices (faces) are written.
 */
function writeBox(out, o, b, [first, end] = [0, 36]) {
  const c = Math.cos(b.rotY || 0), s = Math.sin(b.rotY || 0);
  const [sx, sy, sz] = b.size, [cx, cy, cz] = b.center;
  const top = cy + sy / 2;
  const glow = b.glow || 0, alpha = b.alpha ?? 1, textured = !!b.textured;
  for (let v = first; v < end; v++) {
    const [[px, py, pz], [nx, ny, nz]] = CUBE[v];
    const lx = px * sx, ly = py * sy, lz = pz * sz;
    out[o++] = cx + c * lx + s * lz; out[o++] = cy + ly; out[o++] = cz - s * lx + c * lz;
    out[o++] = c * nx + s * nz; out[o++] = ny; out[o++] = -s * nx + c * nz;
    out[o++] = b.color[0]; out[o++] = b.color[1]; out[o++] = b.color[2]; out[o++] = glow;
    if (textured) { out[o++] = px; out[o++] = py; out[o++] = pz; out[o++] = sx; out[o++] = sy; out[o++] = sz; out[o++] = top; }
    else { out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; }
    out[o++] = alpha;
  }
  return o;
}

/** Write a box transformed by a 4×4 matrix (unit cube → world), e.g. avatar parts. */
function writeMatrixBox(out, o, m, color, glow = 0, alpha = 1) {
  for (const [[px, py, pz], [nx, ny, nz]] of CUBE) {
    out[o++] = m[0] * px + m[4] * py + m[8] * pz + m[12];
    out[o++] = m[1] * px + m[5] * py + m[9] * pz + m[13];
    out[o++] = m[2] * px + m[6] * py + m[10] * pz + m[14];
    const wx = m[0] * nx + m[4] * ny + m[8] * nz, wy = m[1] * nx + m[5] * ny + m[9] * nz, wz = m[2] * nx + m[6] * ny + m[10] * nz;
    const l = Math.hypot(wx, wy, wz) || 1;
    out[o++] = wx / l; out[o++] = wy / l; out[o++] = wz / l;
    out[o++] = color[0]; out[o++] = color[1]; out[o++] = color[2]; out[o++] = glow;
    out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
    out[o++] = alpha;
  }
  return o;
}

/**
 * Side faces of each platform that are covered by a flush neighbour at least as tall
 * (e.g. between the tiles of a floor): they can never be seen.
 * Returns per platform a Set of CUBE face indices (2: -z, 3: +z, 4: -x, 5: +x).
 */
export function coveredSides(platforms, eps = 1e-3) {
  return platforms.map((p, i) => {
    const hidden = new Set();
    const top = p.y + p.height / 2, bottom = p.y - p.height / 2;
    for (const [face, axis, sign] of [[2, 'z', -1], [3, 'z', 1], [4, 'x', -1], [5, 'x', 1]]) {
      const size = axis === 'x' ? 'width' : 'depth', other = axis === 'x' ? 'z' : 'x', span = axis === 'x' ? 'depth' : 'width';
      const plane = p[axis] + sign * p[size] / 2;
      const covered = platforms.some((q, j) => j !== i &&
        Math.abs(q[axis] - sign * q[size] / 2 - plane) < eps &&
        q.y + q.height / 2 >= top - eps && q.y - q.height / 2 <= bottom + eps &&
        q[other] - q[span] / 2 <= p[other] - p[span] / 2 + eps && q[other] + q[span] / 2 >= p[other] + p[span] / 2 - eps);
      if (covered) hidden.add(face);
    }
    return hidden;
  });
}
const faceRanges = (faces, hidden) => faces.filter(f => !hidden.has(f)).map(f => [6 * f, 6 * f + 6]);

/**
 * Faces of a scenery box that can ever be seen. Scenery is only ever viewed from above
 * its supporting surface: details resting on a platform or on the distant ground never
 * show their bottom, and rock slabs hanging flush under a platform never show their top.
 */
const NO_BOTTOM = [[0, 6], [12, 36]], NO_TOP = [[6, 36]], ALL_FACES = [[0, 36]];
export function visibleFaces(box) {
  if (box.kind === 'surface' || box.kind === 'backdrop') return NO_BOTTOM;
  if (box.kind === 'underside') return NO_TOP;
  return ALL_FACES;
}
const vertexCount = box => visibleFaces(box).reduce((n, [a, b]) => n + b - a, 0);

/**
 * Bake scenery boxes ({ center, size, color, rotY, glow, kind }) into one vertex array,
 * grouped into spatial chunks (cells of the xz plane) so whole chunks outside the view
 * can be skipped. Small surface details (tufts, pebbles, flowers) get their own, finer
 * chunks (`detail: true`) so they can also be skipped once too far away to see.
 * Returns { data, chunks: [{ first, count, min, max, detail }] } (vertex units).
 */
export const SCENERY_CELL = 12, DETAIL_CELL = 6;
export function bakeBoxes(boxes) {
  const cells = new Map();
  for (const b of boxes) {
    const detail = b.kind === 'surface';
    const cell = detail ? DETAIL_CELL : SCENERY_CELL;
    const key = `${detail ? 1 : 0},${Math.floor(b.center[2] / cell)},${Math.floor(b.center[0] / cell)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(b);
  }
  const order = [...cells.keys()].sort((a, b) => {
    const [ad, az, ax] = a.split(',').map(Number), [bd, bz, bx] = b.split(',').map(Number);
    return ad - bd || az - bz || ax - bx;
  });
  const data = new Float32Array(boxes.reduce((n, b) => n + vertexCount(b), 0) * FLOATS_PER_VERTEX);
  const chunks = [];
  let o = 0;
  for (const key of order) {
    const first = o / FLOATS_PER_VERTEX;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const b of cells.get(key)) {
      for (const range of visibleFaces(b)) o = writeBox(data, o, b, range);
      // conservative bounds (any Y rotation)
      const r = b.rotY ? Math.hypot(b.size[0], b.size[2]) / 2 : null;
      const half = [r ?? b.size[0] / 2, b.size[1] / 2, r ?? b.size[2] / 2];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], b.center[k] - half[k]);
        max[k] = Math.max(max[k], b.center[k] + half[k]);
      }
    }
    chunks.push({ first, count: o / FLOATS_PER_VERTEX - first, min, max, detail: key.startsWith('1,') });
  }
  return { data, chunks };
}

/** Frustum planes [a, b, c, d] (inside: a·x + b·y + c·z + d ≥ 0) of a column-major view-projection matrix. */
export function frustumPlanes(m) {
  const row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];
  const add = (a, b, k) => a.map((v, i) => v + k * b[i]);
  return [add(r3, r0, 1), add(r3, r0, -1), add(r3, r1, 1), add(r3, r1, -1), add(r3, r2, 1), add(r3, r2, -1)];
}

/**
 * How far away surface details (≈ 0.1 units across) stay at least ~1.5 canvas pixels
 * tall, for a canvas `height` pixels high (vertical field of view FOV).
 */
export function detailDistance(height) {
  return (0.1 * height) / (2 * Math.tan(FOV / 2) * 1.5);
}

/** Distance from a point to an axis-aligned box (0 inside). */
function distanceToBox(p, min, max) {
  let d = 0;
  for (let k = 0; k < 3; k++) { const v = Math.max(min[k] - p[k], 0, p[k] - max[k]); d += v * v; }
  return Math.sqrt(d);
}

/** Is an axis-aligned box (min, max) at least partly inside the frustum? */
export function boxInFrustum(planes, min, max) {
  for (const [a, b, c, d] of planes) {
    // the box corner furthest along the plane normal
    if (a * (a > 0 ? max[0] : min[0]) + b * (b > 0 ? max[1] : min[1]) + c * (c > 0 ? max[2] : min[2]) + d < 0) return false;
  }
  return true;
}

/**
 * A flat, upward-facing grid of n×n quads (the tessellated top of a huge box, for per-vertex
 * fog). `shade(x, z)`, if given, scales the colour per vertex.
 */
function writeGrid(out, o, { x0, x1, z0, z1, y }, n, color, shade = null) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const ax = x0 + (x1 - x0) * i / n, bx = x0 + (x1 - x0) * (i + 1) / n;
      const az = z0 + (z1 - z0) * j / n, bz = z0 + (z1 - z0) * (j + 1) / n;
      const corners = [[ax, az], [bx, az], [bx, bz], [ax, bz]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [x, z] = corners[k];
        const f = shade ? shade(x, z) : 1;
        out[o++] = x; out[o++] = y; out[o++] = z;
        out[o++] = 0; out[o++] = 1; out[o++] = 0;
        out[o++] = color[0] * f; out[o++] = color[1] * f; out[o++] = color[2] * f; out[o++] = 0;
        for (let z = 0; z < 7; z++) out[o++] = 0;
        out[o++] = 1;
      }
    }
  }
  return o;
}

/** Screen-covering grid of columns × rows quads in NDC (2 floats per vertex), for the baked sky. */
function skyGridVertices(columns = 16, rows = 10) {
  const data = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        data.push(-1 + (2 * (i + di)) / columns, -1 + (2 * (j + dj)) / rows);
      }
    }
  }
  return new Float32Array(data);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
export function createRenderer(canvas, baseQuality = PRESETS.normal) {
  const quality = { ...baseQuality };
  const gl = canvas.getContext('webgl', { antialias: quality.antialias, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL is not available in this browser.');
  canvas.style.imageRendering = quality.pixelated ? 'pixelated' : '';

  const ATTRIBUTES = ['position', 'normal', 'vcolor', 'local', 'box', 'alpha'];
  const lite = quality.shading === 'vertex';
  const makeProgram = (vs, fs, attributes = ATTRIBUTES) => {
    const p = program(gl, vs, fs, attributes);
    return { p, u: uniformsOf(gl, p) };
  };
  // World programs: per-pixel ('pixel') or the vertex-shaded fast path (textured / flat)
  const PROGRAMS = lite
    ? { tex: makeProgram(LITE_VS, LITE_FS_TEXTURED), flat: makeProgram(LITE_VS, LITE_FS_FLAT) }
    : { pixel: makeProgram(WORLD_VS, WORLD_FS) };
  const sky = makeProgram(SKY_VS, SKY_FS, ['corner']);

  const skyBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.frontFace(gl.CW);
  gl.cullFace(gl.BACK);
  // Keep destination alpha at 1 so translucent draws don't let the page
  // background bleed through the (premultiplied) canvas.
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);

  let drawCalls = 0, vertices = 0;

  // --- textures -------------------------------------------------------------
  const textures = new Map();
  const highFiltering = quality.filtering === 'high';
  // high: trilinear + anisotropic · low: bilinear, nearest mip · nearest: one texel (crisp; cheapest in software)
  const MIN_FILTER = { high: gl.LINEAR_MIPMAP_LINEAR, low: gl.LINEAR_MIPMAP_NEAREST, nearest: gl.NEAREST_MIPMAP_NEAREST }[quality.filtering] ?? gl.LINEAR_MIPMAP_LINEAR;
  function texture(id) {
    if (!textures.has(id)) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintTexture(id));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, MIN_FILTER);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, quality.filtering === 'nearest' ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const aniso = highFiltering && gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      textures.set(id, t);
    }
    return textures.get(id);
  }

  // --- programs & per-frame uniforms -------------------------------------------
  let frameUniforms = null;   // values shared by every world program this frame
  let current = null;         // program in use
  const fresh = new Set();    // programs whose frame uniforms are up to date
  function useProgram(prog) {
    if (current !== prog) { gl.useProgram(prog.p); current = prog; }
    if (prog.u.viewProjection && !fresh.has(prog)) {
      const { u } = prog, f = frameUniforms;
      gl.uniformMatrix4fv(u.viewProjection, false, f.viewProjection);
      gl.uniform3fv(u.lightTint, f.lightTint);
      gl.uniform3fv(u.fogColor, f.fogColor);
      gl.uniform2fv(u.fogRange, f.fogRange);
      gl.uniform1f(u.fogMax, f.fogMax);
      gl.uniform3fv(u.cameraPos, f.cameraPos);
      gl.uniform3fv(u.haze, f.haze);
      if (u.topTex) { gl.uniform1i(u.topTex, 0); gl.uniform1i(u.sideTex, 1); }
      if (u.tex) gl.uniform1i(u.tex, 0);
      fresh.add(prog);
    }
    return prog.u;
  }

  // --- meshes ---------------------------------------------------------------
  function bindMesh(buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const layout = [[0, 3, 0], [1, 3, 12], [2, 4, 24], [3, 3, 40], [4, 4, 52], [5, 1, 68]];
    for (const [loc, size, offset] of layout) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE, offset);
    }
  }

  function staticMesh(data, ranges = null) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer, count: data.length / FLOATS_PER_VERTEX, ranges };
  }

  /**
   * Select the program for a draw. `material` null → untextured.
   * `face` (vertex shading only): 'top' | 'side' picks which of the material's textures to bind.
   */
  function useMaterial(material, face = 'top') {
    const m = material && quality.textures ? MATERIALS[material] : null;
    if (lite) {
      if (!m) { useProgram(PROGRAMS.flat); return; }
      const u = useProgram(PROGRAMS.tex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture(face === 'side' ? m.side : m.top));
      gl.uniform1f(u.texScale, m.scale);
      gl.uniform1f(u.texBias, quality.textureDetail === 'soft' ? 1 : 0);
      return;
    }
    const u = useProgram(PROGRAMS.pixel);
    if (!m) { gl.uniform1f(u.textured, 0); return; }
    gl.uniform1f(u.textured, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture(m.top));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture(m.side));
    gl.uniform1f(u.texScale, m.scale);
    gl.uniform1f(u.fringe, m.fringe ? 1 : 0);
    gl.uniform3fv(u.fringeColor, m.fringe || [1, 1, 1]);
  }

  /** Draw a static mesh. Vertex-shaded meshes may be split in ranges ({ face, first, count }; face null = untextured). */
  function drawMesh(mesh, material = null) {
    if (!mesh.count) return;
    bindMesh(mesh.buffer);
    for (const r of mesh.ranges || [{ face: 'top', first: 0, count: mesh.count }]) {
      if (!r.count) continue;
      useMaterial(r.face ? material : null, r.face || 'top');
      gl.drawArrays(gl.TRIANGLES, r.first, r.count);
      drawCalls++;
      vertices += r.count;
    }
  }

  /** A growable per-frame batch (dynamic vertex buffer). */
  function createBatch() {
    let data = new Float32Array(64 * VERTS_PER_BOX * FLOATS_PER_VERTEX);
    let o = 0;
    const buffer = gl.createBuffer();
    const ensure = boxes => {
      const need = o + boxes * VERTS_PER_BOX * FLOATS_PER_VERTEX;
      if (need > data.length) {
        const bigger = new Float32Array(Math.max(need, data.length * 2));
        bigger.set(data.subarray(0, o));
        data = bigger;
      }
    };
    return {
      reset() { o = 0; },
      box(center, size, color, { glow = 0, alpha = 1, rotY = 0 } = {}) {
        ensure(1);
        o = writeBox(data, o, { center, size, color, glow, alpha, rotY });
      },
      matrix(m, color, glow = 0, alpha = 1) {
        ensure(1);
        o = writeMatrixBox(data, o, m, color, glow, alpha);
      },
      draw() {
        if (!o) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.DYNAMIC_DRAW);
        useMaterial(null);
        bindMesh(buffer);
        gl.drawArrays(gl.TRIANGLES, 0, o / FLOATS_PER_VERTEX);
        drawCalls++;
        vertices += o / FLOATS_PER_VERTEX;
      },
    };
  }
  const opaque = createBatch();
  const transparent = createBatch();

  // Static caches: scenery per scenery object; platforms per level + look
  const sceneryMeshes = new WeakMap();
  const groundMeshes = new WeakMap();
  const platformMeshes = new WeakMap();

  function sceneryMesh(boxes) {
    if (!sceneryMeshes.has(boxes)) {
      const { data, chunks } = bakeBoxes(boxes);
      sceneryMeshes.set(boxes, { ...staticMesh(data), chunks });
    }
    return sceneryMeshes.get(boxes);
  }

  /**
   * Draw only the scenery chunks inside the view (and surface details only while they
   * are big enough to see); neighbouring visible chunks share a draw call.
   */
  function drawScenery(mesh, planes, eye) {
    const ranges = [];
    const far = detailDistance(canvas.height);
    for (const c of mesh.chunks) {
      if (!c.count || !boxInFrustum(planes, c.min, c.max)) continue;
      if (c.detail && distanceToBox(eye, c.min, c.max) > far) continue;
      const last = ranges.at(-1);
      if (last && last.first + last.count === c.first) last.count += c.count;
      else ranges.push({ face: null, first: c.first, count: c.count });
    }
    if (ranges.length) drawMesh({ ...mesh, ranges });
  }

  const GROUND_GRID = 16;
  /** Is the distant ground drawn with its texture? (`ground: 'flat'`: its average colour, no texture) */
  const groundTextured = () => quality.textures && quality.ground !== 'flat';
  function groundMesh(ground) {
    if (!groundMeshes.has(ground)) {
      const m = MATERIALS[ground.material];
      const color = groundTextured() ? [1, 1, 1] : m.swatch;
      if (lite) {
        // only the top is ever seen; tessellated so per-vertex fog follows the distance
        // (untextured: gentle per-vertex colour variation instead of a dead-flat plane)
        const n = GROUND_GRID;
        const data = new Float32Array(n * n * 6 * FLOATS_PER_VERTEX);
        const bounds = { x0: ground.x - ground.width / 2, x1: ground.x + ground.width / 2, z0: ground.z - ground.depth / 2, z1: ground.z + ground.depth / 2, y: ground.y };
        writeGrid(data, 0, bounds, n, color, groundTextured() ? null : (x, z) => 0.9 + 0.2 * ((Math.sin(x * 0.31 + z * 0.17) * 43758.5453 % 1 + 1) % 1));
        groundMeshes.set(ground, staticMesh(data));
      } else {
        const data = new Float32Array(VERTS_PER_BOX * FLOATS_PER_VERTEX);
        writeBox(data, 0, { center: [ground.x, ground.y - 1, ground.z], size: [ground.width, 2, ground.depth], color, textured: true });
        groundMeshes.set(ground, staticMesh(data));
      }
    }
    return groundMeshes.get(ground);
  }

  /** Platforms grouped by material → one mesh each. */
  function platformGroups(level, defaultMaterial, platformTint) {
    if (!platformMeshes.has(level)) { platformMeshes.set(level, new Map()); holdAdaptive(1000); }
    const perLevel = platformMeshes.get(level);
    const key = `${defaultMaterial}|${platformTint.join(',')}`;
    if (!perLevel.has(key)) {
      const groups = new Map();
      const hidden = coveredSides(level.platforms);
      level.platforms.forEach((p, i) => {
        const material = p.material || defaultMaterial;
        const jitter = 0.94 + 0.12 * ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
        let color = (p.tint || [jitter, jitter, jitter]).map((v, c) => v * platformTint[c]);
        if (!quality.textures) color = color.map((v, c) => v * MATERIALS[material].swatch[c]);
        if (!groups.has(material)) groups.set(material, []);
        groups.get(material).push({ center: [p.x, p.y, p.z], size: [p.width, p.height, p.depth], color, textured: true, hidden: hidden[i] });
      });
      const meshes = [...groups].map(([material, boxes]) => {
        const visible = b => faceRanges([0, 1, 2, 3, 4, 5], b.hidden);
        if (!lite) {
          const data = new Float32Array(boxes.reduce((n, b) => n + 36 - 6 * b.hidden.size, 0) * FLOATS_PER_VERTEX);
          let o = 0;
          for (const b of boxes) for (const range of visible(b)) o = writeBox(data, o, b, range);
          return { material, mesh: staticMesh(data) };
        }
        // Vertex shading: [tops][lips][sides + bottoms] so each range binds one texture.
        // Lips (the material's fringe) are drawn before the sides they cover (early depth rejects the rest).
        const fringe = quality.textures ? MATERIALS[material].fringe : null;
        const LIP = 0.12, OUT = 0.012;
        // top + bottom + visible sides, and a lip strip along each visible side
        const data = new Float32Array(boxes.reduce((n, b) => n + 6 * (6 - b.hidden.size) + (fringe ? 6 * (4 - b.hidden.size) : 0), 0) * FLOATS_PER_VERTEX);
        let o = 0;
        for (const b of boxes) o = writeBox(data, o, b, TOP_FACE);
        const tops = o / FLOATS_PER_VERTEX;
        if (fringe) {
          for (const b of boxes) {
            const top = b.center[1] + b.size[1] / 2;
            const lip = {
              center: [b.center[0], top - LIP / 2, b.center[2]], size: [b.size[0] + 2 * OUT, LIP, b.size[2] + 2 * OUT],
              color: fringe.map((v, c) => v * b.color[c]),
            };
            for (const range of faceRanges([2, 3, 4, 5], b.hidden)) o = writeBox(data, o, lip, range);
          }
        }
        const lips = o / FLOATS_PER_VERTEX - tops;
        for (const b of boxes) for (const range of faceRanges([1, 2, 3, 4, 5], b.hidden)) o = writeBox(data, o, b, range);
        const sides = o / FLOATS_PER_VERTEX - tops - lips;
        return {
          material,
          mesh: staticMesh(data, [
            { face: 'top', first: 0, count: tops },
            { face: null, first: tops, count: lips },
            { face: 'side', first: tops + lips, count: sides },
          ]),
        };
      });
      perLevel.set(key, meshes);
    }
    return perLevel.get(key);
  }

  // --- sky --------------------------------------------------------------------
  function setSkyUniforms(u, biome, time, detail) {
    const s = biome.sky;
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.skyDetail, detail);
    gl.uniform3fv(u.skyTop, s.top);
    gl.uniform3fv(u.skyHorizon, s.horizon);
    gl.uniform3fv(u.skyBelow, s.below);
    gl.uniform4fv(u.sun, s.sun ? [...s.sun.dir, s.sun.size] : [0, 1, 0, 2]);
    gl.uniform4fv(u.sunColor, s.sun ? [...s.sun.color, s.sun.glow] : [0, 0, 0, 0]);
    gl.uniform4fv(u.moon, s.moon ? [...s.moon.dir, s.moon.size] : [0, 1, 0, 2]);
    gl.uniform4fv(u.moonColor, s.moon ? [...s.moon.color, s.moon.glow] : [0, 0, 0, 0]);
    gl.uniform4fv(u.clouds, [s.clouds.amount, s.clouds.speed, 0, 0]);
    gl.uniform3fv(u.cloudColor, s.clouds.color);
    gl.uniform3fv(u.cloudShade, s.clouds.shade);
    gl.uniform2f(u.stars, s.stars, s.starsBelow);
    gl.uniform4fv(u.aurora, s.aurora ? [...s.aurora.color, s.aurora.strength] : [0, 0, 0, 0]);
    gl.uniform4fv(u.aurora2, s.aurora ? [...s.aurora.color2, s.aurora.height] : [0, 0, 0, 0]);
    gl.uniform3fv(u.ridgeColor, s.ridges.flatMap(r => r.color));
    gl.uniform4fv(u.ridgeShape, s.ridges.flatMap(r => [r.height, r.amplitude, r.frequency, r.seed]));
    gl.uniform1fv(u.ridgeHaze, s.ridges.map(r => r.haze));
  }

  function bindSkyTriangle() {
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    for (let loc = 1; loc < 6; loc++) gl.disableVertexAttribArray(loc);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  }

  function drawSky(biome, camera, aspect, time) {
    if (quality.sky === 'baked') return drawBakedSky(biome, camera, aspect);
    const basis = cameraBasis(camera.eye, camera.target);
    const { u } = sky;
    useProgram(sky);
    bindSkyTriangle();
    gl.uniform3fv(u.camRight, basis.right);
    gl.uniform3fv(u.camUp, basis.up);
    gl.uniform3fv(u.camForward, basis.forward);
    const t = Math.tan(FOV / 2);
    gl.uniform2f(u.tanHalf, t * aspect, t);
    gl.uniform1f(u.panorama, 0);
    setSkyUniforms(u, biome, time, { flat: 0, lite: 1, full: 2 }[quality.sky] ?? 2);
    // Drawn last at the far plane with depth testing: only pixels not covered by
    // geometry run the (expensive) sky shader.
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;
    gl.depthMask(true);
  }

  // Baked sky: panorama textures per biome (full detail, frozen in time)
  const PANORAMA = [2048, 1024];
  const panoramas = new Map();
  function panorama(biome) {
    if (panoramas.has(biome.id)) return panoramas.get(biome.id);
    const [w, h] = PANORAMA;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    useProgram(sky);
    bindSkyTriangle();
    gl.uniform1f(sky.u.panorama, 1);
    setSkyUniforms(sky.u, biome, 0, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.enable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    panoramas.set(biome.id, tex);
    holdAdaptive(1000);
    return tex;
  }

  let skyGrid = null;
  function drawBakedSky(biome, camera, aspect) {
    const tex = panorama(biome);
    if (!skyGrid) {
      skyGrid = makeProgram(SKYGRID_VS, SKYGRID_FS, ['corner']);
      const data = skyGridVertices();
      skyGrid.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, skyGrid.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      skyGrid.count = data.length / 2;
    }
    const basis = cameraBasis(camera.eye, camera.target);
    const { u } = skyGrid;
    useProgram(skyGrid);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyGrid.buffer);
    for (let loc = 1; loc < 6; loc++) gl.disableVertexAttribArray(loc);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.uniform3fv(u.camRight, basis.right);
    gl.uniform3fv(u.camUp, basis.up);
    gl.uniform3fv(u.camForward, basis.forward);
    const t = Math.tan(FOV / 2);
    gl.uniform2f(u.tanHalf, t * aspect, t);
    gl.uniform1f(u.heading, Math.atan2(basis.forward[0], basis.forward[2]) / (2 * Math.PI));
    gl.uniform1i(u.sky, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, skyGrid.count);
    drawCalls++;
    vertices += skyGrid.count;
    gl.depthMask(true);
  }

  function goalParts(goal, time) {
    for (const part of gemParts(goal, time)) opaque.matrix(part.matrix, part.color, part.glow);
  }

  const startTime = performance.now();

  /**
   * Render a frame.
   * @param level      current level
   * @param player     physics player
   * @param particles  active particles
   * @param extras     { avatar, shadow, camera, hitbox, markers, biome, scenery, time, platformTint, hazeFloor, boxes }
   *   biome    biome object (defaults to meadow)
   *   scenery  { boxes, ground } from scenery.js (optional)
   *   boxes    extra dynamic boxes [{ center, size, color, glow, alpha, rotY }] (enemies, pickups…)
   */
  // Adaptive quality: hold the target frame rate on slow / contended machines.
  // Too slow → step down; holding the target for a while → try stepping back up, and
  // if that promptly slows things down again, wait longer before the next try (no
  // oscillation). Frame intervals can't show headroom beyond the display's refresh
  // rate, so for targets near it "holding the target" is what allows a restore attempt.
  //   smooth upscaling:  resolution first (continuous), then shed detail (see SHED)
  //   pixelated:         shed detail first, then whole-pixel steps 1/2 → 1/3 (stays crisp)
  const adaptive = quality.adaptive && { ...quality.adaptive, ema: 1000 / quality.adaptive.target, last: null, since: 0, fastFor: 0, slowFor: 0, shed: [], restoreAfter: 2500, lastRestore: -Infinity, holdUntil: 0 };
  /** Ignore frame times for a while (start-up, shader compiles, sky bakes, level loads are one-off hitches). */
  const holdAdaptive = ms => { if (adaptive) { adaptive.holdUntil = Math.max(adaptive.holdUntil, performance.now() + ms); adaptive.last = null; } };
  holdAdaptive(2000);
  // Detail that can be shed, cheapest-to-lose first; a step only applies if it is a reduction.
  const SHED = [['sky', ['full', 'lite', 'flat']], ['scenery', ['full', 'near', 'none']]];
  const shedStep = () => {
    for (const [key, order] of SHED) {
      const i = order.indexOf(quality[key]);
      if (i >= 0 && i < order.length - 1) return [key, order[i + 1]];
    }
    return null;
  };
  /** Canvas pixels per CSS pixel → whole device pixels per canvas pixel when pixelated. */
  const pixelStep = resolution => Math.max(1, Math.round(1 / resolution));
  function stepDown() {
    if (quality.pixelated) {
      const next = shedStep();
      if (next) { adaptive.shed.push([next[0], quality[next[0]]]); quality[next[0]] = next[1]; return; }
      const coarser = 1 / (pixelStep(quality.resolution) + 1);
      if (coarser >= adaptive.min - 1e-9) { adaptive.shed.push(['resolution', quality.resolution]); quality.resolution = coarser; }
      return;
    }
    if (quality.resolution > adaptive.min) {
      quality.resolution = Math.max(adaptive.min, quality.resolution * 0.88);
    } else {
      const next = shedStep();
      if (next) { adaptive.shed.push([next[0], quality[next[0]]]); quality[next[0]] = next[1]; }
    }
  }
  function stepUp() {
    if (adaptive.shed.length) {
      const [key, value] = adaptive.shed.pop();          // undo the most recent reduction
      quality[key] = value;
    } else if (!quality.pixelated && quality.resolution < adaptive.max) {
      quality.resolution = Math.min(adaptive.max, quality.resolution * 1.08);
    }
  }
  function adaptResolution(now) {
    if (!adaptive) return;
    if (now < adaptive.holdUntil) { adaptive.last = null; adaptive.ema = 1000 / adaptive.target; return; }
    if (adaptive.last !== null) {
      const dt = Math.min(200, now - adaptive.last);
      adaptive.ema = adaptive.ema * 0.9 + dt * 0.1;
      adaptive.since += dt;
      const budget = 1000 / adaptive.target;
      const nearRefresh = adaptive.target >= 50;
      adaptive.fastFor = adaptive.ema < budget * (nearRefresh ? 1.06 : 0.75) ? adaptive.fastFor + dt : 0;
      // near the refresh rate a couple of missed vsyncs already lift the average: only a
      // sustained slowdown counts (brief hitches — garbage collection, a busy host — don't)
      adaptive.slowFor = adaptive.ema > budget * (nearRefresh ? 1.15 : 1.04) ? adaptive.slowFor + dt : 0;
      if (adaptive.since > 500 && adaptive.slowFor > (nearRefresh ? 700 : 0)) {
        // slowed down soon after restoring something: wait longer before trying again
        if (now - adaptive.lastRestore < 4000) adaptive.restoreAfter = Math.min(30000, adaptive.restoreAfter * 2);
        stepDown();
        adaptive.since = 0;
        adaptive.fastFor = 0;
        adaptive.slowFor = 0;
      } else if (adaptive.fastFor > adaptive.restoreAfter) {
        adaptive.lastRestore = now;
        stepUp();
        adaptive.fastFor = 0;
        adaptive.since = 0;
      }
    }
    adaptive.last = now;
  }

  const render = (level, player, particles = [], extras = {}) => {
    const cpuStart = performance.now();
    adaptResolution(cpuStart);
    drawCalls = 0;
    vertices = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
    // Pixelated: a whole number of device pixels per canvas pixel, so nearest-neighbour
    // upscaling stays even (and the browser's compositor takes its cheap path).
    const ratio = quality.pixelated ? dpr / pixelStep(quality.resolution) : dpr * quality.resolution;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const biome = extras.biome || BIOMES.meadow;
    if (quality.sky === 'baked') panorama(biome);   // bake before this frame's draws (it uses its own viewport)
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const time = extras.time ?? (performance.now() - startTime) / 1000;
    const camera = extras.camera || chaseCamera(player);
    const aspect = width / height;

    const viewProjection = multiply(perspective(FOV, aspect, 0.1, 220), lookAt(camera.eye, camera.target));
    render.viewProjection = viewProjection;
    frameUniforms = {
      viewProjection,
      lightTint: biome.light.tint,
      fogColor: fogColor(biome),
      fogRange: [biome.fog.near, biome.fog.far],
      fogMax: biome.fog.max ?? 1,
      cameraPos: camera.eye,
      haze: [extras.hazeFloor ?? Math.min(...level.platforms.map(p => p.y + p.height / 2)) - 3, biome.haze.depth, biome.haze.strength],
    };
    fresh.clear();

    // Opaque geometry, nearest first (platforms, avatar) so early depth testing saves work
    gl.enable(gl.CULL_FACE);
    for (const { material, mesh } of platformGroups(level, biome.material, extras.platformTint || [1, 1, 1])) drawMesh(mesh, material);

    opaque.reset();
    if (level.goal && !extras.hideGoal) goalParts(level.goal, time);
    if (extras.avatar) {
      for (const part of extras.avatar) opaque.matrix(part.matrix, part.color, part.glow || 0);
    } else if (player) {
      opaque.box([player.x, player.y + 0.75, player.z], [0.8, 1.5, 0.8], [0.9, 0.3, 0.25]);
    }
    for (const b of extras.boxes || []) {
      if ((b.alpha ?? 1) >= 1) opaque.box(b.center, b.size, b.color, b);
    }
    opaque.draw();

    if (extras.scenery?.boxes?.length) drawScenery(sceneryMesh(extras.scenery.boxes), frustumPlanes(viewProjection), camera.eye);
    const ground = extras.scenery?.ground;
    if (ground) drawMesh(groundMesh(ground), groundTextured() ? ground.material : null);

    drawSky(biome, camera, aspect, time);

    // Transparent geometry (drawn last, no depth writes)
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    transparent.reset();
    const shadows = extras.shadow ? [].concat(extras.shadow) : [];
    for (const s of shadows) {
      transparent.box([s.x, s.y + (s.lift ?? 0.004), s.z], [s.width, 0.002, s.depth], [0.02, 0.03, 0.05], { alpha: s.alpha });
    }
    for (const particle of particles) {
      const alpha = particle.getAlpha();
      const size = particle.size * (0.5 + 0.5 * alpha);
      transparent.box([particle.x, particle.y, particle.z], [size, size, size], particle.color, { alpha, glow: particle.glow || 0 });
    }
    for (const m of extras.markers || []) {
      transparent.box([m.x, m.y, m.z], [m.size, m.size, m.size], m.color, { alpha: m.alpha ?? 0.6, glow: 0.6 });
    }
    for (const b of extras.boxes || []) {
      if ((b.alpha ?? 1) < 1) transparent.box(b.center, b.size, b.color, b);
    }
    if (extras.hitbox && player) {
      transparent.box([player.x, player.y + 0.75, player.z], [0.8, 1.5, 0.8], [0.2, 0.9, 1], { alpha: 0.18, glow: 0.5 });
    }
    gl.disable(gl.CULL_FACE);
    transparent.draw();
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    render.stats = { cpuMs: performance.now() - cpuStart, drawCalls, vertices };
  };

  /** Project a world point to CSS pixels using the last frame's camera (null if behind). */
  render.project = ([x, y, z]) => {
    const m = render.viewProjection;
    if (!m) return null;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0.01) return null;
    return { x: (cx / w * 0.5 + 0.5) * canvas.clientWidth, y: (1 - (cy / w * 0.5 + 0.5)) * canvas.clientHeight };
  };

  /** Pre-paint textures and (baked sky) panoramas, avoiding a hitch on first use. */
  render.quality = quality;
  /** Ignore frame times for a while (e.g. when rendering resumes after another screen). */
  render.holdAdaptive = ms => holdAdaptive(ms);
  render.warmUp = (materials, biomes = []) => {
    if (quality.textures) {
      for (const name of materials) {
        const m = MATERIALS[name];
        if (m) { texture(m.top); texture(m.side); }
      }
    }
    if (quality.sky === 'baked') for (const biome of biomes) panorama(biome);
  };
  return render;
}
