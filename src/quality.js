/**
 * Rendering quality — what the renderer is allowed to spend per frame.
 *
 *   resolution   fraction of the displayed size actually rendered (then upscaled)
 *   maxPixelRatio cap on devicePixelRatio (HiDPI screens)
 *   antialias    MSAA on the WebGL context (expensive on software renderers)
 *   sky          'full' (clouds, stars, aurora, ridges) | 'lite' (gradient, sun/moon, ridges) | 'flat' (gradient only)
 *                | 'baked' (the full sky rendered once per biome into a panorama texture, then sampled:
 *                  full detail, frozen in time, at the cost of one texture lookup per sky pixel)
 *   shading      'pixel' (lighting, fog, edge highlights and lips per pixel) | 'vertex' (lighting and
 *                fog per vertex, one multiply-add per pixel — the fast path for software rendering)
 *   textures     procedural textures on platforms, or flat material colours
 *   filtering    'high' (trilinear + anisotropic) | 'low' (bilinear, nearest mip) | 'nearest' (one texel:
 *                crisp, matching pixelated upscaling, and the cheapest for a software rasterizer)
 *   textureDetail 'full' | 'soft' (vertex shading only: textures one mipmap level softer — calmer busy
 *                textures such as snowy stone, which otherwise sparkle at low resolution when moving)
 *   ground       'textured' | 'flat' (the distant floor far below in its average colour — it is mostly
 *                hazed over anyway; saves a texture lookup on a third of the screen)
 *   scenery      'full' | 'near' (no distant backdrop) | 'none'
 *   pixelated    upscale with hard pixels instead of smoothing; the canvas then uses a whole number of
 *                device pixels per canvas pixel (resolution 0.5 → exactly 2×2). Besides looking crisp, this
 *                lets the browser composite with nearest-neighbour sampling, which without a GPU is
 *                ~6 ms per frame cheaper than smoothing at 1400×850
 *   showFps      small FPS readout
 *   adaptive     null, or { min, max, target }: adjust at runtime to hold the target frame
 *                rate — resolution first (min…max), then shed detail (flat sky, no scenery) when
 *                already at the minimum; restores detail, then resolution, once there is headroom
 *
 * Presets:
 *   normal  — full quality, for playing
 *   test    — for machines without a GPU (software WebGL): vertex shading, baked sky, near
 *             scenery, crisp half resolution; adaptive toward 60 fps. Tuned with `npm run bench`
 *             on the test VM (see perf/README.md for the measurements)
 *
 * Select with the URL: ?quality=test | ?quality=normal (default), and override
 * single settings for experiments: ?resolution=0.5&sky=lite&antialias=0&textures=1&scenery=near
 */

export const PRESETS = {
  normal: { resolution: 1, maxPixelRatio: 2, antialias: true, sky: 'full', shading: 'pixel', textures: true, filtering: 'high', textureDetail: 'full', ground: 'textured', scenery: 'full', pixelated: false, showFps: false, adaptive: null },
  test: { resolution: 0.5, maxPixelRatio: 1, antialias: false, sky: 'baked', shading: 'vertex', textures: true, filtering: 'nearest', textureDetail: 'soft', ground: 'flat', scenery: 'near', pixelated: true, showFps: true, adaptive: { min: 0.33, max: 0.5, target: 60 } },
};

const parseBool = v => !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase());

/** Resolve quality settings from URL search params (or any { get(name) } source). */
export function resolveQuality(params = new URLSearchParams(globalThis.location?.search || '')) {
  const name = params.get('quality') in PRESETS ? params.get('quality') : 'normal';
  const q = { preset: name, ...PRESETS[name] };
  if (params.get('resolution')) q.resolution = Math.max(0.1, Math.min(1, Number(params.get('resolution')) || q.resolution));
  if (params.get('pixelratio')) q.maxPixelRatio = Math.max(0.5, Number(params.get('pixelratio')) || q.maxPixelRatio);
  if (params.get('antialias') !== null) q.antialias = parseBool(params.get('antialias'));
  if (['full', 'lite', 'flat', 'baked'].includes(params.get('sky'))) q.sky = params.get('sky');
  if (['pixel', 'vertex'].includes(params.get('shading'))) q.shading = params.get('shading');
  if (params.get('textures') !== null) q.textures = parseBool(params.get('textures'));
  if (['full', 'near', 'none'].includes(params.get('scenery'))) q.scenery = params.get('scenery');
  if (['high', 'low', 'nearest'].includes(params.get('filtering'))) q.filtering = params.get('filtering');
  if (['textured', 'flat'].includes(params.get('ground'))) q.ground = params.get('ground');
  if (['full', 'soft'].includes(params.get('texturedetail'))) q.textureDetail = params.get('texturedetail');
  if (params.get('pixelated') !== null) q.pixelated = parseBool(params.get('pixelated'));
  if (params.get('fps') !== null) q.showFps = parseBool(params.get('fps'));
  if (params.get('adaptive') !== null) q.adaptive = parseBool(params.get('adaptive')) ? (q.adaptive || { min: 0.35, max: 0.8, target: 30 }) : null;
  if (params.get('target')) q.adaptive = q.adaptive && { ...q.adaptive, target: Math.max(10, Number(params.get('target')) || q.adaptive.target) };
  if (q.adaptive) q.adaptive = { ...q.adaptive, max: Math.max(q.adaptive.max, q.resolution) };
  return q;
}

/** Short human-readable summary, e.g. for an on-screen badge. */
export function describeQuality(q) {
  return `${q.preset} · ${Math.round(q.resolution * 100)}%${q.adaptive ? ' (adaptive)' : ''} res${q.antialias ? ' · AA' : ''} · sky ${q.sky}${q.shading === 'vertex' ? ' · vertex shading' : ''}${q.textures ? '' : ' · flat'} · scenery ${q.scenery}`;
}

/** Scenery filter for a level of detail. */
export function sceneryForQuality(scenery, q) {
  if (!scenery || q.scenery === 'full') return scenery;
  if (q.scenery === 'none') return { boxes: [], ground: null, stats: scenery.stats };
  // 'near': keep platform dressing and nearby props, drop the distant backdrop (keep the ground plane)
  // and optional detail (thin drips and the lowest rock layer under platforms, every other
  // island / cloud beside the course) — hardly visible at the resolutions that use it
  if (!scenery._near) scenery._near = { ...scenery, boxes: scenery.boxes.filter(b => b.kind !== 'backdrop' && !b.detail) };
  return scenery._near;
}
