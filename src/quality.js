/**
 * Rendering quality — what the renderer is allowed to spend per frame.
 *
 *   resolution   fraction of the displayed size actually rendered (then upscaled)
 *   maxPixelRatio cap on devicePixelRatio (HiDPI screens)
 *   antialias    MSAA on the WebGL context (expensive on software renderers)
 *   sky          'full' (clouds, stars, aurora, ridges) | 'lite' (gradient, sun/moon, ridges) | 'flat' (gradient only)
 *   textures     procedural textures on platforms, or flat material colours
 *   filtering    'high' (trilinear + anisotropic) | 'low' (bilinear, nearest mip)
 *   scenery      'full' | 'near' (no distant backdrop) | 'none'
 *   pixelated    upscale with hard pixels (crisp) instead of smoothing
 *   showFps      small FPS readout
 *   adaptive     null, or { min, max, target }: adjust at runtime to hold the target frame
 *                rate — resolution first (min…max), then shed detail (flat sky, no scenery) when
 *                already at the minimum; restores detail, then resolution, once there is headroom
 *
 * Presets:
 *   normal  — full quality, for playing
 *   test    — tuned by `npm run bench` to hold ≥ 30 fps in the playground on the
 *             software-rendered test VM (see perf/README.md for the measurements)
 *
 * Select with the URL: ?quality=test | ?quality=normal (default), and override
 * single settings for experiments: ?resolution=0.5&sky=lite&antialias=0&textures=1&scenery=near
 */

export const PRESETS = {
  normal: { resolution: 1, maxPixelRatio: 2, antialias: true, sky: 'full', textures: true, filtering: 'high', scenery: 'full', pixelated: false, showFps: false, adaptive: null },
  test: { resolution: 0.55, maxPixelRatio: 1, antialias: false, sky: 'lite', textures: true, filtering: 'low', scenery: 'near', pixelated: false, showFps: true, adaptive: { min: 0.35, max: 0.8, target: 30 } },
};

const parseBool = v => !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase());

/** Resolve quality settings from URL search params (or any { get(name) } source). */
export function resolveQuality(params = new URLSearchParams(globalThis.location?.search || '')) {
  const name = params.get('quality') in PRESETS ? params.get('quality') : 'normal';
  const q = { preset: name, ...PRESETS[name] };
  if (params.get('resolution')) q.resolution = Math.max(0.1, Math.min(1, Number(params.get('resolution')) || q.resolution));
  if (params.get('pixelratio')) q.maxPixelRatio = Math.max(0.5, Number(params.get('pixelratio')) || q.maxPixelRatio);
  if (params.get('antialias') !== null) q.antialias = parseBool(params.get('antialias'));
  if (['full', 'lite', 'flat'].includes(params.get('sky'))) q.sky = params.get('sky');
  if (params.get('textures') !== null) q.textures = parseBool(params.get('textures'));
  if (['full', 'near', 'none'].includes(params.get('scenery'))) q.scenery = params.get('scenery');
  if (['high', 'low'].includes(params.get('filtering'))) q.filtering = params.get('filtering');
  if (params.get('pixelated') !== null) q.pixelated = parseBool(params.get('pixelated'));
  if (params.get('fps') !== null) q.showFps = parseBool(params.get('fps'));
  if (params.get('adaptive') !== null) q.adaptive = parseBool(params.get('adaptive')) ? (q.adaptive || { min: 0.35, max: 0.8, target: 30 }) : null;
  if (q.adaptive) q.adaptive = { ...q.adaptive, max: Math.max(q.adaptive.max, q.resolution) };
  return q;
}

/** Short human-readable summary, e.g. for an on-screen badge. */
export function describeQuality(q) {
  return `${q.preset} · ${Math.round(q.resolution * 100)}%${q.adaptive ? ' (adaptive)' : ''} res${q.antialias ? ' · AA' : ''} · sky ${q.sky}${q.textures ? '' : ' · flat'} · scenery ${q.scenery}`;
}

/** Scenery filter for a level of detail. */
export function sceneryForQuality(scenery, q) {
  if (!scenery || q.scenery === 'full') return scenery;
  if (q.scenery === 'none') return { boxes: [], ground: null, stats: scenery.stats };
  // 'near': keep platform dressing and nearby props, drop the distant backdrop (keep the ground plane)
  if (!scenery._near) scenery._near = { ...scenery, boxes: scenery.boxes.filter(b => b.kind !== 'backdrop') };
  return scenery._near;
}
