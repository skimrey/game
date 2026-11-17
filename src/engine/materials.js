/**
 * Materials — which procedural textures a surface uses.
 *
 *   top / side  texture ids painted by engine/textures.js
 *   fringe      optional colour of a jagged lip along the top edge of side faces
 *               (grass overhang, sand lip, snow cap)
 *   scale       world units covered by one texture repeat
 *   swatch      average top-face colour. Used by the visual quality checks
 *               (readability against the background) without needing a canvas;
 *               `npm run visuals:verify` measures the real textures in a browser
 *               and asserts these stay within tolerance.
 */
export const MATERIALS = {
  // Tier platforms
  grass: { top: 'grassTop', side: 'dirtSide', fringe: [0.36, 0.6, 0.25], scale: 2, swatch: [0.37, 0.58, 0.24] },
  sandstone: { top: 'redRockTop', side: 'strataSide', fringe: [0.95, 0.82, 0.6], scale: 2, swatch: [0.73, 0.42, 0.29] },
  alpineStone: { top: 'snowStoneTop', side: 'stoneBlocks', fringe: [0.94, 0.95, 1], scale: 2, swatch: [0.51, 0.53, 0.6] },
  moonstone: { top: 'moonTiles', side: 'basalt', fringe: null, scale: 2, swatch: [0.44, 0.46, 0.7] },

  sand: { top: 'sandTop', side: 'coralSide', fringe: [0.97, 0.9, 0.74], scale: 2, swatch: [0.9, 0.81, 0.62] },
  moss: { top: 'mossTop', side: 'rootSide', fringe: [0.26, 0.5, 0.36], scale: 2, swatch: [0.21, 0.41, 0.29] },
  ash: { top: 'ashTop', side: 'magmaSide', fringe: null, scale: 2, swatch: [0.32, 0.27, 0.27] },
  amethyst: { top: 'crystalTop', side: 'geodeSide', fringe: [0.9, 0.86, 1], scale: 2, swatch: [0.76, 0.69, 0.88] },

  // Distant ground planes
  fields: { top: 'fields', side: 'dirtSide', fringe: null, scale: 56, swatch: [0.47, 0.6, 0.3] },
  canyonFloor: { top: 'cracked', side: 'strataSide', fringe: null, scale: 12, swatch: [0.86, 0.79, 0.69] },
  cloudSea: { top: 'clouds', side: 'clouds', fringe: null, scale: 30, swatch: [0.85, 0.82, 0.87] },
  lagoonWater: { top: 'water', side: 'water', fringe: null, scale: 24, swatch: [0.19, 0.63, 0.71] },
  forestFloor: { top: 'leafLitter', side: 'rootSide', fringe: null, scale: 16, swatch: [0.19, 0.23, 0.14] },
  lavaSea: { top: 'lava', side: 'magmaSide', fringe: null, scale: 20, swatch: [0.83, 0.41, 0.12] },
  geodeFloor: { top: 'geodeFloor', side: 'geodeSide', fringe: null, scale: 14, swatch: [0.28, 0.17, 0.39] },

  // Playground props
  stone: { top: 'flagstone', side: 'stoneBlocks', fringe: null, scale: 2, swatch: [0.51, 0.52, 0.54] },
  brick: { top: 'flagstone', side: 'brick', fringe: null, scale: 2, swatch: [0.51, 0.52, 0.54] },
  wood: { top: 'planks', side: 'planks', fringe: null, scale: 2, swatch: [0.64, 0.45, 0.28] },
};

export const TEXTURE_IDS = [...new Set(Object.values(MATERIALS).flatMap(m => [m.top, m.side]))];
