/**
 * Math Utilities
 * Common math functions for game development
 */

export const Math3D = {
  /**
   * Vector operations
   */
  vec3: {
    create: (x = 0, y = 0, z = 0) => [x, y, z],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    length: (v) => Math.hypot(v[0], v[1], v[2]),
    normalize: (v) => {
      const len = this.length(v);
      return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
    },
  },

  /**
   * Geometric checks
   */
  distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
  distanceXZ: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
  sphereOverlapsSphere: (a, radiusA, b, radiusB) => {
    return this.distance(a, b) < radiusA + radiusB;
  },
  boxOverlapsBox: (boxA, boxB) => {
    return Math.abs(boxA.x - boxB.x) < (boxA.width + boxB.width) / 2 &&
           Math.abs(boxA.y - boxB.y) < (boxA.height + boxB.height) / 2 &&
           Math.abs(boxA.z - boxB.z) < (boxA.depth + boxB.depth) / 2;
  },

  /**
   * Interpolation
   */
  lerp: (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t)),
  smoothstep: (t) => t * t * (3 - 2 * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

export const Clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const Wrap = (value, min, max) => {
  const range = max - min;
  return ((value - min) % range + range) % range + min;
};
export const RandomRange = (min, max) => min + Math.random() * (max - min);
export const RandomInt = (min, max) => Math.floor(RandomRange(min, max + 1));
export const Sign = (value) => value === 0 ? 0 : value > 0 ? 1 : -1;
