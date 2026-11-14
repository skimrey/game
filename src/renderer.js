import { multiply, compose, translation, scaling, rotationY } from './mat4.js';
import { BIOMES, fogColor } from './biomes.js';
import { MATERIALS } from './materials.js';
import { paintTexture } from './textures.js';
import { chaseCamera, FOV } from './camera.js';
import { PRESETS } from './quality.js';

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
    vec3 dir = normalize(camForward + ndc.x * tanHalf.x * camRight + ndc.y * tanHalf.y * camUp);
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

/** Write an axis-aligned / Y-rotated box. `textured` boxes also carry local coords + size/top. */
function writeBox(out, o, b) {
  const c = Math.cos(b.rotY || 0), s = Math.sin(b.rotY || 0);
  const [sx, sy, sz] = b.size, [cx, cy, cz] = b.center;
  const top = cy + sy / 2;
  const glow = b.glow || 0, alpha = b.alpha ?? 1, textured = !!b.textured;
  for (const [[px, py, pz], [nx, ny, nz]] of CUBE) {
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

/** Bake scenery boxes ({center, size, color, rotY, glow}) into one vertex array. */
export function bakeBoxes(boxes) {
  const data = new Float32Array(boxes.length * VERTS_PER_BOX * FLOATS_PER_VERTEX);
  let o = 0;
  for (const b of boxes) o = writeBox(data, o, b);
  return data;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
export function createRenderer(canvas, baseQuality = PRESETS.normal) {
  const quality = { ...baseQuality };
  const gl = canvas.getContext('webgl', { antialias: quality.antialias, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL is not available in this browser.');
  canvas.style.imageRendering = quality.pixelated ? 'pixelated' : '';

  const world = program(gl, WORLD_VS, WORLD_FS, ['position', 'normal', 'vcolor', 'local', 'box', 'alpha']);
  const worldU = uniformsOf(gl, world);
  const sky = program(gl, SKY_VS, SKY_FS, ['corner']);
  const skyU = uniformsOf(gl, sky);

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

  let drawCalls = 0;

  // --- textures -------------------------------------------------------------
  const textures = new Map();
  const highFiltering = quality.filtering !== 'low';
  function texture(id) {
    if (!textures.has(id)) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintTexture(id));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, highFiltering ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const aniso = highFiltering && gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      textures.set(id, t);
    }
    return textures.get(id);
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

  function staticMesh(data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer, count: data.length / FLOATS_PER_VERTEX };
  }

  function useMaterial(material) {
    if (!material || !quality.textures) {
      gl.uniform1f(worldU.textured, 0);
      return;
    }
    const m = MATERIALS[material];
    gl.uniform1f(worldU.textured, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture(m.top));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture(m.side));
    gl.uniform1f(worldU.texScale, m.scale);
    gl.uniform1f(worldU.fringe, m.fringe ? 1 : 0);
    gl.uniform3fv(worldU.fringeColor, m.fringe || [1, 1, 1]);
  }

  function drawMesh(mesh, material = null) {
    if (!mesh.count) return;
    useMaterial(material);
    bindMesh(mesh.buffer);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    drawCalls++;
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
    if (!sceneryMeshes.has(boxes)) sceneryMeshes.set(boxes, staticMesh(bakeBoxes(boxes)));
    return sceneryMeshes.get(boxes);
  }

  function groundMesh(ground) {
    if (!groundMeshes.has(ground)) {
      const m = MATERIALS[ground.material];
      const color = quality.textures ? [1, 1, 1] : m.swatch;
      const data = new Float32Array(VERTS_PER_BOX * FLOATS_PER_VERTEX);
      writeBox(data, 0, { center: [ground.x, ground.y - 1, ground.z], size: [ground.width, 2, ground.depth], color, textured: true });
      groundMeshes.set(ground, staticMesh(data));
    }
    return groundMeshes.get(ground);
  }

  /** Platforms grouped by material → one mesh each. */
  function platformGroups(level, defaultMaterial, platformTint) {
    if (!platformMeshes.has(level)) platformMeshes.set(level, new Map());
    const perLevel = platformMeshes.get(level);
    const key = `${defaultMaterial}|${platformTint.join(',')}`;
    if (!perLevel.has(key)) {
      const groups = new Map();
      level.platforms.forEach((p, i) => {
        const material = p.material || defaultMaterial;
        const jitter = 0.94 + 0.12 * ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
        let color = (p.tint || [jitter, jitter, jitter]).map((v, c) => v * platformTint[c]);
        if (!quality.textures) color = color.map((v, c) => v * MATERIALS[material].swatch[c]);
        if (!groups.has(material)) groups.set(material, []);
        groups.get(material).push({ center: [p.x, p.y, p.z], size: [p.width, p.height, p.depth], color, textured: true });
      });
      const meshes = [...groups].map(([material, boxes]) => {
        const data = new Float32Array(boxes.length * VERTS_PER_BOX * FLOATS_PER_VERTEX);
        let o = 0;
        for (const b of boxes) o = writeBox(data, o, b);
        return { material, mesh: staticMesh(data) };
      });
      perLevel.set(key, meshes);
    }
    return perLevel.get(key);
  }

  function drawSky(biome, camera, aspect, time) {
    const s = biome.sky;
    const basis = cameraBasis(camera.eye, camera.target);
    gl.useProgram(sky);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
    for (let loc = 1; loc < 6; loc++) gl.disableVertexAttribArray(loc);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.uniform3fv(skyU.camRight, basis.right);
    gl.uniform3fv(skyU.camUp, basis.up);
    gl.uniform3fv(skyU.camForward, basis.forward);
    const t = Math.tan(FOV / 2);
    gl.uniform2f(skyU.tanHalf, t * aspect, t);
    gl.uniform1f(skyU.time, time);
    gl.uniform1f(skyU.skyDetail, { flat: 0, lite: 1, full: 2 }[quality.sky] ?? 2);
    gl.uniform3fv(skyU.skyTop, s.top);
    gl.uniform3fv(skyU.skyHorizon, s.horizon);
    gl.uniform3fv(skyU.skyBelow, s.below);
    gl.uniform4fv(skyU.sun, s.sun ? [...s.sun.dir, s.sun.size] : [0, 1, 0, 2]);
    gl.uniform4fv(skyU.sunColor, s.sun ? [...s.sun.color, s.sun.glow] : [0, 0, 0, 0]);
    gl.uniform4fv(skyU.moon, s.moon ? [...s.moon.dir, s.moon.size] : [0, 1, 0, 2]);
    gl.uniform4fv(skyU.moonColor, s.moon ? [...s.moon.color, s.moon.glow] : [0, 0, 0, 0]);
    gl.uniform4fv(skyU.clouds, [s.clouds.amount, s.clouds.speed, 0, 0]);
    gl.uniform3fv(skyU.cloudColor, s.clouds.color);
    gl.uniform3fv(skyU.cloudShade, s.clouds.shade);
    gl.uniform2f(skyU.stars, s.stars, s.starsBelow);
    gl.uniform4fv(skyU.aurora, s.aurora ? [...s.aurora.color, s.aurora.strength] : [0, 0, 0, 0]);
    gl.uniform4fv(skyU.aurora2, s.aurora ? [...s.aurora.color2, s.aurora.height] : [0, 0, 0, 0]);
    gl.uniform3fv(skyU.ridgeColor, s.ridges.flatMap(r => r.color));
    gl.uniform4fv(skyU.ridgeShape, s.ridges.flatMap(r => [r.height, r.amplitude, r.frequency, r.seed]));
    gl.uniform1fv(skyU.ridgeHaze, s.ridges.map(r => r.haze));
    // Drawn last at the far plane with depth testing: only pixels not covered by
    // geometry run the (expensive) sky shader.
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;
    gl.depthMask(true);
  }

  function goalParts(goal, time) {
    const { x, y, z } = goal;
    const gold = [1, 0.83, 0.15];
    opaque.box([x, y + 0.06, z], [0.7, 0.12, 0.7], [0.55, 0.45, 0.25]);                 // base
    opaque.box([x, y + 0.85, z], [0.1, 1.6, 0.1], [0.92, 0.9, 0.85]);                   // pole
    const wave = Math.sin(time * 4) * 0.12;
    opaque.matrix(compose(translation(x, y + 1.4, z), rotationY(wave), translation(0.33, 0, 0), scaling(0.6, 0.4, 0.04)), gold, 0.35);
    opaque.matrix(compose(translation(x, y + 1.95 + Math.sin(time * 2) * 0.06, z), rotationY(time * 1.6), scaling(0.22, 0.22, 0.22)), [1, 0.95, 0.6], 1);
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
  // Too slow → lower the resolution; already at the minimum → shed detail (flat sky,
  // then no scenery). Sustained headroom → restore detail first, then resolution.
  const adaptive = quality.adaptive && { ...quality.adaptive, ema: 1000 / quality.adaptive.target, last: null, since: 0, fastFor: 0, shed: [], restoreAfter: 2500, lastRestore: -Infinity };
  const SHED = [['sky', 'flat'], ['scenery', 'none']];
  function adaptResolution(now) {
    if (!adaptive) return;
    if (adaptive.last !== null) {
      const dt = Math.min(200, now - adaptive.last);
      adaptive.ema = adaptive.ema * 0.9 + dt * 0.1;
      adaptive.since += dt;
      const budget = 1000 / adaptive.target;
      adaptive.fastFor = adaptive.ema < budget * 0.75 ? adaptive.fastFor + dt : 0;   // ≥ 40 fps for a while: headroom
      if (adaptive.since > 500 && adaptive.ema > budget * 1.04) {
        // slowed down soon after restoring something: wait longer before trying again (no oscillation)
        if (now - adaptive.lastRestore < 4000) adaptive.restoreAfter = Math.min(30000, adaptive.restoreAfter * 2);
        if (quality.resolution > adaptive.min) {
          quality.resolution = Math.max(adaptive.min, quality.resolution * 0.88);   // too slow: step down now
        } else {
          const next = SHED.find(([key, value]) => quality[key] !== value);
          if (next) { adaptive.shed.push([next[0], quality[next[0]]]); quality[next[0]] = next[1]; }
        }
        adaptive.since = 0;
      } else if (adaptive.fastFor > adaptive.restoreAfter) {
        adaptive.lastRestore = now;
        if (adaptive.shed.length) {
          const [key, value] = adaptive.shed.pop();
          quality[key] = value;                                                      // restore detail first
        } else if (quality.resolution < adaptive.max) {
          quality.resolution = Math.min(adaptive.max, quality.resolution * 1.08);     // then resolution
        }
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
    const ratio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * quality.resolution;
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const biome = extras.biome || BIOMES.meadow;
    const time = extras.time ?? (performance.now() - startTime) / 1000;
    const camera = extras.camera || chaseCamera(player);
    const aspect = width / height;

    const viewProjection = multiply(perspective(FOV, aspect, 0.1, 220), lookAt(camera.eye, camera.target));
    render.viewProjection = viewProjection;
    gl.useProgram(world);
    gl.uniform1i(worldU.topTex, 0);
    gl.uniform1i(worldU.sideTex, 1);
    gl.uniformMatrix4fv(worldU.viewProjection, false, viewProjection);
    gl.uniform3fv(worldU.lightTint, biome.light.tint);
    gl.uniform3fv(worldU.fogColor, fogColor(biome));
    gl.uniform2f(worldU.fogRange, biome.fog.near, biome.fog.far);
    gl.uniform1f(worldU.fogMax, biome.fog.max ?? 1);
    gl.uniform3fv(worldU.cameraPos, camera.eye);
    const floor = extras.hazeFloor ?? Math.min(...level.platforms.map(p => p.y + p.height / 2)) - 3;
    gl.uniform3f(worldU.haze, floor, biome.haze.depth, biome.haze.strength);

    // Opaque geometry, nearest first (platforms, avatar) so early depth testing saves work
    gl.enable(gl.CULL_FACE);
    for (const { material, mesh } of platformGroups(level, biome.material, extras.platformTint || [1, 1, 1])) drawMesh(mesh, material);

    opaque.reset();
    if (level.goal) goalParts(level.goal, time);
    if (extras.avatar) {
      for (const part of extras.avatar) opaque.matrix(part.matrix, part.color, part.glow || 0);
    } else if (player) {
      opaque.box([player.x, player.y + 0.75, player.z], [0.8, 1.5, 0.8], [0.9, 0.3, 0.25]);
    }
    for (const b of extras.boxes || []) {
      if ((b.alpha ?? 1) >= 1) opaque.box(b.center, b.size, b.color, b);
    }
    opaque.draw();

    if (extras.scenery?.boxes?.length) drawMesh(sceneryMesh(extras.scenery.boxes));
    const ground = extras.scenery?.ground;
    if (ground) drawMesh(groundMesh(ground), ground.material);

    drawSky(biome, camera, aspect, time);

    // Transparent geometry (drawn last, no depth writes)
    gl.useProgram(world);
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
    render.stats = { cpuMs: performance.now() - cpuStart, drawCalls };
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

  /** Pre-paint textures (avoids a hitch on first use). */
  render.quality = quality;
  render.warmUp = materials => {
    if (!quality.textures) return;
    for (const name of materials) {
      const m = MATERIALS[name];
      if (m) { texture(m.top); texture(m.side); }
    }
  };
  return render;
}
