const platform = (x, y, z, width, height, depth) => ({
  x, y, z, width, height, depth
});

export const levels = [
  {
    name: 'First steps',
    spawn: { x: 0, y: 1, z: 0 },
    platforms: [
      platform(0, 0, 0, 6, 1, 6),
      platform(0, 0.5, 6, 4, 1, 3),
      platform(3, 1, 10, 4, 1, 3),
      platform(0, 1.5, 14, 5, 1, 4)
    ],
    goal: { x: 0, y: 2, z: 14, radius: 1 }
  },
  {
    name: 'A little higher',
    spawn: { x: 0, y: 1, z: 0 },
    platforms: [
      platform(0, 0, 0, 6, 1, 6),
      platform(-3, 0.5, 6, 4, 1, 3),
      platform(0, 1, 10, 4, 1, 3),
      platform(3, 1.5, 14, 4, 1, 3),
      platform(0, 2, 18, 5, 1, 4)
    ],
    goal: { x: 0, y: 2.5, z: 18, radius: 1 }
  }
];
