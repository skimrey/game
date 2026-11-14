/**
 * Biomes — the visual identity of each difficulty tier.
 *
 * A biome bundles everything that is *not* gameplay:
 *   sky       — gradient, sun/moon, clouds, stars, aurora, distant mountain layers
 *   fog       — distance fog that blends geometry into the horizon
 *   light     — colour tint applied to lit surfaces
 *   material  — default platform material (textures: see textures.js)
 *   ground    — the distant floor far below the course (always under the kill plane)
 *   scenery   — which decoration kit scenery.js uses
 *
 * All values are hand-tuned. Colours are linear-ish RGB in 0..1.
 */

const normalize = v => {
  const l = Math.hypot(...v);
  return v.map(n => n / l);
};

/** A mountain silhouette layer on the horizon (angles in radians above the horizon). */
const ridge = (color, height, amplitude, frequency, seed, haze) => ({ color, height, amplitude, frequency, seed, haze });
const NO_RIDGE = ridge([0, 0, 0], -2, 0, 1, 0, 0);

export const BIOMES = {
  meadow: {
    id: 'meadow',
    name: 'Green Meadows',
    sky: {
      top: [0.29, 0.56, 0.93],
      horizon: [0.78, 0.9, 0.98],
      below: [0.62, 0.78, 0.66],
      sun: { dir: normalize([-0.45, 0.16, 1]), color: [1, 0.96, 0.82], size: 0.9994, glow: 0.35 },
      moon: null,
      clouds: { amount: 0.5, color: [1, 1, 1], shade: [0.78, 0.84, 0.93], speed: 0.012 },
      stars: 0,
      starsBelow: 0,
      aurora: null,
      ridges: [
        ridge([0.56, 0.7, 0.84], 0.07, 0.05, 4, 1.3, 0.6),
        ridge([0.42, 0.62, 0.52], 0.035, 0.03, 7, 5.1, 0.35),
        ridge([0.4, 0.6, 0.42], 0.012, 0.02, 13, 9.7, 0.35),
      ],
    },
    fog: { near: 30, far: 120, max: 0.85 },
    haze: { depth: 26, strength: 0.55 },
    light: { tint: [1, 1, 0.97] },
    material: 'grass',
    ground: { y: -24, material: 'fields' },
    scenery: 'meadow',
  },

  canyon: {
    id: 'canyon',
    name: 'Sunbaked Canyon',
    sky: {
      top: [0.42, 0.62, 0.86],
      horizon: [0.98, 0.86, 0.66],
      below: [0.86, 0.6, 0.42],
      sun: { dir: normalize([0.6, 0.22, 1]), color: [1, 0.92, 0.7], size: 0.9992, glow: 0.55 },
      moon: null,
      clouds: { amount: 0.18, color: [1, 0.97, 0.9], shade: [0.93, 0.8, 0.7], speed: 0.006 },
      stars: 0,
      starsBelow: 0,
      aurora: null,
      ridges: [
        ridge([0.86, 0.62, 0.5], 0.06, 0.045, 5, 2.2, 0.5),
        ridge([0.78, 0.45, 0.3], 0.03, 0.035, 9, 7.4, 0.25),
        ridge([0.62, 0.33, 0.22], 0.01, 0.02, 17, 3.9, 0.1),
      ],
    },
    fog: { near: 28, far: 115, max: 0.9 },
    haze: { depth: 30, strength: 0.5 },
    light: { tint: [1.04, 0.98, 0.9] },
    material: 'sandstone',
    ground: { y: -30, material: 'canyonFloor' },
    scenery: 'canyon',
  },

  alpine: {
    id: 'alpine',
    name: 'Alpine Dusk',
    sky: {
      top: [0.2, 0.2, 0.45],
      horizon: [0.98, 0.62, 0.45],
      below: [0.86, 0.62, 0.68],
      sun: { dir: normalize([0.15, 0.06, 1]), color: [1, 0.62, 0.3], size: 0.9992, glow: 0.8 },
      moon: null,
      clouds: { amount: 0.32, color: [1, 0.7, 0.58], shade: [0.55, 0.38, 0.55], speed: 0.008 },
      stars: 0.25,
      starsBelow: 0,
      aurora: null,
      ridges: [
        ridge([0.55, 0.45, 0.62], 0.11, 0.07, 6, 4.4, 0.45),
        ridge([0.4, 0.32, 0.5], 0.06, 0.05, 11, 8.8, 0.25),
        ridge([0.28, 0.22, 0.36], 0.02, 0.03, 19, 1.7, 0.1),
      ],
    },
    fog: { near: 26, far: 105, max: 0.9 },
    haze: { depth: 22, strength: 0.45 },
    light: { tint: [1.06, 0.9, 0.84] },
    material: 'alpineStone',
    ground: { y: -16, material: 'cloudSea' },
    scenery: 'alpine',
  },

  starlit: {
    id: 'starlit',
    name: 'Starlit Ruins',
    sky: {
      top: [0.02, 0.03, 0.1],
      horizon: [0.1, 0.14, 0.3],
      below: [0.03, 0.04, 0.12],
      sun: null,
      moon: { dir: normalize([-0.35, 0.14, 1]), color: [0.92, 0.95, 1], size: 0.99955, glow: 0.3 },
      clouds: { amount: 0.12, color: [0.3, 0.35, 0.55], shade: [0.12, 0.14, 0.25], speed: 0.004 },
      stars: 1,
      starsBelow: 1,
      aurora: { color: [0.25, 1, 0.65], color2: [0.55, 0.35, 1], height: 0.16, strength: 0.8 },
      ridges: [NO_RIDGE, NO_RIDGE, NO_RIDGE],
    },
    fog: { near: 30, far: 125, max: 0.9 },
    haze: { depth: 40, strength: 0.35 },
    light: { tint: [0.78, 0.85, 1.08] },
    material: 'moonstone',
    ground: null, // the void: stars below
    scenery: 'starlit',
  },
};

export const BIOME_LIST = Object.values(BIOMES);

/** Fog colour is the horizon colour so geometry melts into the backdrop. */
export function fogColor(biome) {
  return biome.sky.horizon;
}
