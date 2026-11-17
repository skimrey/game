/**
 * Biomes — the visual identity of each difficulty tier.
 *
 * A biome bundles everything that is *not* gameplay:
 *   sky       — gradient, sun/moon, clouds, stars, aurora, distant mountain layers
 *   fog       — distance fog that blends geometry into the horizon
 *   light     — colour tint applied to lit surfaces
 *   material  — default platform material (textures: see engine/textures.js)
 *   ground    — the distant floor far below the course (always under the kill plane)
 *   scenery   — which decoration kit world/scenery.js uses
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

  // --- zones beyond the classic four (world/zones.js) ------------------------------------
  lagoon: {
    id: 'lagoon',
    name: 'Sunny Lagoon',
    sky: {
      top: [0.1, 0.5, 0.86],
      horizon: [0.62, 0.93, 0.9],
      below: [0.22, 0.72, 0.74],
      sun: { dir: normalize([0.3, 0.42, 1]), color: [1, 0.98, 0.86], size: 0.9993, glow: 0.45 },
      moon: null,
      clouds: { amount: 0.34, color: [1, 1, 1], shade: [0.8, 0.9, 0.95], speed: 0.014 },
      stars: 0,
      starsBelow: 0,
      aurora: null,
      ridges: [
        ridge([0.45, 0.72, 0.72], 0.03, 0.03, 5, 3.1, 0.6),            // far islands
        ridge([0.3, 0.6, 0.45], 0.016, 0.022, 9, 6.3, 0.35),
        NO_RIDGE,
      ],
    },
    fog: { near: 32, far: 125, max: 0.85 },
    haze: { depth: 24, strength: 0.45 },
    light: { tint: [1.03, 1.01, 0.96] },
    material: 'sand',
    ground: { y: -20, material: 'lagoonWater' },
    scenery: 'lagoon',
  },

  grove: {
    id: 'grove',
    name: 'Mushroom Grove',
    sky: {
      top: [0.06, 0.14, 0.2],
      horizon: [0.5, 0.34, 0.6],
      below: [0.14, 0.2, 0.2],
      sun: null,
      moon: { dir: normalize([0.5, 0.2, 1]), color: [0.85, 1, 0.9], size: 0.9993, glow: 0.5 },
      clouds: { amount: 0.22, color: [0.62, 0.46, 0.7], shade: [0.25, 0.22, 0.35], speed: 0.005 },
      stars: 0.45,
      starsBelow: 0,
      aurora: null,
      ridges: [
        ridge([0.3, 0.26, 0.42], 0.05, 0.04, 8, 2.7, 0.4),             // far canopy
        ridge([0.16, 0.22, 0.24], 0.03, 0.04, 15, 8.1, 0.2),
        ridge([0.1, 0.16, 0.16], 0.012, 0.02, 23, 4.4, 0.1),
      ],
    },
    fog: { near: 26, far: 105, max: 0.9 },
    haze: { depth: 22, strength: 0.5 },
    light: { tint: [0.95, 1.04, 1] },
    material: 'moss',
    ground: { y: -18, material: 'forestFloor' },
    scenery: 'grove',
  },

  volcano: {
    id: 'volcano',
    name: 'Ember Peaks',
    sky: {
      top: [0.13, 0.05, 0.07],
      horizon: [0.86, 0.34, 0.14],
      below: [0.42, 0.1, 0.05],
      sun: { dir: normalize([-0.4, 0.1, 1]), color: [1, 0.46, 0.22], size: 0.9985, glow: 0.9 },
      moon: null,
      clouds: { amount: 0.45, color: [0.42, 0.3, 0.3], shade: [0.16, 0.1, 0.12], speed: 0.01 },
      stars: 0,
      starsBelow: 0,
      aurora: null,
      ridges: [
        ridge([0.36, 0.14, 0.12], 0.09, 0.07, 4, 5.7, 0.45),           // volcanic cones
        ridge([0.22, 0.08, 0.08], 0.05, 0.05, 7, 1.9, 0.25),
        ridge([0.12, 0.05, 0.05], 0.015, 0.025, 13, 6.6, 0.1),
      ],
    },
    fog: { near: 24, far: 100, max: 0.88 },
    haze: { depth: 26, strength: 0.4 },
    light: { tint: [1.1, 0.92, 0.84] },
    material: 'ash',
    ground: { y: -22, material: 'lavaSea' },
    scenery: 'volcano',
  },

  crystal: {
    id: 'crystal',
    name: 'Crystal Caverns',
    sky: {
      top: [0.09, 0.03, 0.2],
      horizon: [0.62, 0.28, 0.78],
      below: [0.16, 0.06, 0.28],
      sun: null,
      moon: null,
      clouds: { amount: 0.1, color: [0.55, 0.35, 0.75], shade: [0.2, 0.1, 0.3], speed: 0.003 },
      stars: 0.7,
      starsBelow: 0.5,
      aurora: { color: [0.85, 0.4, 1], color2: [0.3, 0.95, 1], height: 0.2, strength: 0.55 },
      ridges: [
        ridge([0.3, 0.14, 0.42], 0.1, 0.08, 11, 7.3, 0.4),             // jagged cave walls
        ridge([0.2, 0.08, 0.3], 0.05, 0.06, 17, 2.2, 0.2),
        NO_RIDGE,
      ],
    },
    fog: { near: 26, far: 110, max: 0.9 },
    haze: { depth: 30, strength: 0.45 },
    light: { tint: [0.96, 0.92, 1.08] },
    material: 'amethyst',
    ground: { y: -20, material: 'geodeFloor' },
    scenery: 'crystal',
  },
};

export const BIOME_LIST = Object.values(BIOMES);

/** Fog colour is the horizon colour so geometry melts into the backdrop. */
export function fogColor(biome) {
  return biome.sky.horizon;
}
