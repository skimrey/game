/**
 * The town square — the 3D hub between runs (the old playground arena grown into a town).
 *
 *     north   the PORTAL on a dais: walk in to choose your class and set off on a run
 *     middle  the FOUNTAIN, ringed by COLUMNS, with the NOTICE BOARD (your runs, stars, pets and
 *             decorations) and the mayor at its foot; four CARD TABLES flank the way in, each
 *             with a card battler (generated NPCs from the worlds) under their faction's banner;
 *             benches, planters and bunting
 *     west    a path to the
 *             INN, the Tipsy Teapot (walk up to its door: the 2D tavern, the tailor, and the
 *             monster Ring in its yard)
 *     east    a path branches off to your HOME (walk up to the door: the 2D house)
 *
 *   const hub = buildHub();   // { level, scenery: { boxes, ground }, spots }
 *   hubBoxes(hub, time)       // the animated bits (portal swirl, fountain water, flags)
 *
 * The hub is a level like any other (platforms the physics collides with) — its goal is
 * out of reach, nothing can hurt you, and hedges keep you from wandering off the edge.
 */
import { hsv } from '../world/gem.js';

export const HUB = {
  spawn: { x: 0, y: 0.5, z: 0 },
  top: 0.5,                       // every walkable top is at this height (plaza, grass, path)
  fountain: { x: 0, z: 15, r: 2.6 },
  ring: 6.8,                      // the columns round the fountain
  portal: { x: 0, z: 28, y: 1.1 },
  home: { x: 26, z: 9 },          // the door
  inn: { x: -25, z: 9 },          // the inn's door (the building is west of it)
  board: { x: -2.9, z: 9.2 },    // at the fountain's foot, left of the way in (the mayor stands right of it)
  // card tables face the way you come in (−z): the battler stands behind the table (+z) facing
  // you, and you talk across it — nothing between them and the camera. Two pairs, flanking the way in.
  tables: [{ x: -6.5, z: 6 }, { x: 6.5, z: 6 }, { x: -8.8, z: 0 }, { x: 8.8, z: 0 }],
};

const STONE = [1.04, 1.04, 1.04], STONE_B = [0.9, 0.9, 0.92];
const B = (center, size, color, extra = {}) => ({ center, size, color, ...extra });
const shade = (c, k) => c.map(v => Math.min(1, v * k));

export function buildHub() {
  const platforms = [];
  const add = (x, z, w, d, material = 'grass', tint = null, bottom = 0, top = HUB.top) =>
    platforms.push({ x, y: (bottom + top) / 2, z, width: w, height: top - bottom, depth: d, material, ...(tint ? { tint } : {}) });
  // --- the plaza: 2 × 2 flagstones, checkered (x -11..11, z -5..31)
  for (let ix = 0; ix < 11; ix++) for (let iz = 0; iz < 18; iz++) {
    const x = -10 + ix * 2, z = -4 + iz * 2;
    add(x, z, 2, 2, 'stone', (ix + iz) % 2 ? STONE : STONE_B, -0.5);
  }
  // --- grass all around it (same top), and the path east to the home (planks)
  // (the world: x -37..49, z -16..44 — tiled exactly, no overlaps, so no two tops fight)
  add(-24, -4.5, 26, 23, 'grass', null, -0.5);      // west, south of the path
  add(-24, 9, 26, 4, 'wood', null, -0.5);           // the path to the inn (planks)
  add(-24, 27.5, 26, 33, 'grass', null, -0.5);      // west, north of the path
  add(30, -4.5, 38, 23, 'grass', null, -0.5);       // east, south of the path
  add(30, 9, 38, 4, 'wood', null, -0.5);            // the path home (planks)
  add(30, 27.5, 38, 33, 'grass', null, -0.5);       // east, north of the path
  add(0, 37.5, 22, 13, 'grass', null, -0.5);        // behind the portal
  add(0, -10.5, 22, 11, 'grass', null, -0.5);       // behind the spawn
  // --- solid things: the fountain basin, columns, the portal dais and arch, hedges
  const F = HUB.fountain;
  for (let i = 0; i < 8; i++) {                      // the basin rim: eight low stone blocks in a ring
    const a = (i / 8) * Math.PI * 2;
    add(F.x + Math.cos(a) * F.r, F.z + Math.sin(a) * F.r, 1.3, 1.3, 'stone', [0.96, 0.95, 0.92], 0.5, 1.1);
  }
  add(F.x, F.z, 0.9, 0.9, 'stone', [0.96, 0.95, 0.92], 0.5, 2.2);                    // the spout pillar
  const columns = [];
  for (const deg of [0, 40, 140, 180, 220, 320]) {   // a ring of columns round the fountain (the way north and south stays open)
    const a = (deg / 180) * Math.PI;
    const x = F.x + Math.cos(a) * HUB.ring, z = F.z + Math.sin(a) * HUB.ring;
    add(x, z, 0.9, 0.9, 'stone', [1, 0.98, 0.94], 0.5, 4.2);
    columns.push({ x, z });
  }
  const P = HUB.portal;
  add(P.x - 2.6, P.z + 0.6, 0.9, 0.9, 'stone', [0.85, 0.82, 0.95], 0.5, 5.4);      // the arch's legs
  add(P.x + 2.6, P.z + 0.6, 0.9, 0.9, 'stone', [0.85, 0.82, 0.95], 0.5, 5.4);
  const hedge = (x, z, w, d) => add(x, z, w, d, 'grass', [0.7, 0.85, 0.7], 0.5, 2.9);     // taller than a jump
  hedge(-37.5, 14, 1, 62); hedge(49.5, 14, 1, 62); hedge(6, 44.5, 86, 1); hedge(6, -16.5, 86, 1);
  // the home: a cottage you can't walk through (the door is a spot in front of it)
  const H = HUB.home;
  add(H.x + 3.2, H.z, 6, 7, 'brick', [1, 0.96, 0.92], 0.5, 4.2);
  // the inn: a bigger house, timbered, west of its door
  const I = HUB.inn;
  add(I.x - 4.2, I.z, 7.4, 9, 'wood', [0.98, 0.9, 0.78], 0.5, 5.2);
  // card tables
  for (const s of HUB.tables) add(s.x, s.z, 2.2, 1, 'wood', null, 0.5, 1.15);       // low: the battler shows above it
  // the notice board (a solid post)
  add(HUB.board.x, HUB.board.z, 0.4, 0.4, 'wood', null, 0.5, 2.4);

  const level = {
    name: 'Town Square',
    spawn: { ...HUB.spawn },
    platforms,
    goal: { x: 0, y: -999, z: 0, radius: 0.01 },     // nowhere: the hub has no gem
    enemies: [],
    abilities: [],                                   // plain walking and jumping in town
    hub: true,
  };
  return { level, scenery: { boxes: hubScenery(columns), ground: { x: 6, y: -1.2, z: 12, width: 480, depth: 480, material: 'fields' } }, columns };
}

/** Static decoration: column capitals, the cottage's roof and windows, card tables, benches, trees, lamps. */
function hubScenery(columns) {
  const out = [];
  const marble = [0.96, 0.94, 0.9];
  for (const c of columns) {
    out.push(B([c.x, 4.35, c.z], [1.3, 0.3, 1.3], marble), B([c.x, 0.65, c.z], [1.2, 0.3, 1.2], shade(marble, 0.95)));
    out.push(B([c.x, 4.62, c.z], [0.36, 0.24, 0.36], [1, 0.82, 0.3], { glow: 0.2 }));   // a gold finial
  }
  // the fountain: the water, and a bowl on the spout
  const F = HUB.fountain;
  out.push(B([F.x, 0.95, F.z], [F.r * 2, 0.1, F.r * 2], [0.35, 0.7, 0.95], { glow: 0.35 }));
  out.push(B([F.x, 2.3, F.z], [1.8, 0.3, 1.8], [0.96, 0.95, 0.92]));
  out.push(B([F.x, 2.46, F.z], [1.5, 0.05, 1.5], [0.4, 0.75, 1], { glow: 0.4 }));
  // the portal arch: its dais (flush with the floor — just a border), lintel and keystone
  const P = HUB.portal;
  out.push(B([P.x, 0.52, P.z - 0.2], [7, 0.04, 3.6], [0.82, 0.78, 0.95]), B([P.x, 0.53, P.z - 0.2], [6, 0.04, 2.8], [0.62, 0.55, 0.9], { glow: 0.3 }));
  out.push(B([P.x, 5.7, P.z + 0.6], [6.6, 0.7, 1.1], [0.8, 0.76, 0.92]));
  out.push(B([P.x, 6.2, P.z + 0.6], [1.1, 0.6, 1.2], [1, 0.82, 0.3], { glow: 0.3 }));
  for (const sx of [-1, 1]) out.push(B([P.x + sx * 2.6, 5.55, P.z + 0.6], [1.2, 0.3, 1.2], [0.9, 0.86, 0.98]));
  // the cottage: roof, door, windows, chimney, a sign
  const H = HUB.home;
  out.push(B([H.x + 3.2, 4.6, H.z], [6.8, 0.8, 7.8], [0.72, 0.26, 0.22]));
  out.push(B([H.x + 3.2, 5.3, H.z], [5.4, 0.7, 6.4], [0.78, 0.3, 0.25]));
  out.push(B([H.x + 3.2, 5.9, H.z], [3.8, 0.6, 5]));
  out[out.length - 1].color = [0.84, 0.34, 0.28];
  out.push(B([H.x + 4.8, 6.2, H.z - 2], [0.7, 1.6, 0.7], [0.5, 0.45, 0.45]));
  out.push(B([H.x + 0.16, 1.5, H.z], [0.1, 2, 1.2], [0.45, 0.28, 0.16]));                 // the door
  out.push(B([H.x + 0.1, 1.5, H.z + 0.4], [0.06, 0.12, 0.12], [1, 0.85, 0.3], { glow: 0.6 }));   // its knob
  for (const dz of [-2.2, 2.2]) { out.push(B([H.x + 0.15, 2.4, H.z + dz], [0.08, 1, 1], [1, 0.9, 0.55], { glow: 0.6 })); out.push(B([H.x + 0.12, 2.4, H.z + dz], [0.1, 1.2, 0.12], [0.4, 0.3, 0.2])); }
  out.push(B([H.x - 1.2, 1.4, H.z + 2.4], [0.12, 1.8, 0.12], [0.45, 0.3, 0.18]), B([H.x - 1.2, 2.3, H.z + 2.4], [0.1, 0.7, 1.4], [0.9, 0.8, 0.55]));   // sign: HOME
  // the inn: a steep roof, timber frame, a hanging sign with a teapot, lanterns, barrels
  const I = HUB.inn, ix = I.x - 4.2;
  out.push(B([ix, 5.6, I.z], [8.2, 0.8, 9.8], [0.35, 0.22, 0.14]), B([ix, 6.3, I.z], [6.6, 0.7, 8.2], [0.42, 0.27, 0.17]), B([ix, 6.9, I.z], [4.6, 0.6, 6.4], [0.5, 0.33, 0.2]));
  for (const dz of [-4.45, -1.5, 1.5, 4.45]) out.push(B([I.x - 0.44, 2.85, I.z + dz], [0.14, 4.7, 0.18], [0.36, 0.22, 0.12]));
  out.push(B([I.x - 0.44, 2.75, I.z], [0.14, 0.16, 9], [0.36, 0.22, 0.12]));
  out.push(B([I.x - 0.46, 1.45, I.z], [0.1, 1.9, 1.3], [0.4, 0.24, 0.13]), B([I.x - 0.4, 1.45, I.z - 0.45], [0.06, 0.12, 0.12], [1, 0.85, 0.3], { glow: 0.6 }));   // the door
  for (const dz of [-3, 3]) out.push(B([I.x - 0.45, 2.1, I.z + dz], [0.08, 1.1, 1.2], [1, 0.82, 0.45], { glow: 0.7 }));      // warm windows
  out.push(B([I.x + 0.5, 3.7, I.z + 1.3], [1.3, 0.12, 0.12], [0.3, 0.2, 0.12]), B([I.x + 1.05, 3.1, I.z + 1.3], [0.12, 1, 0.9], [0.85, 0.75, 0.5]));   // the sign
  out.push(B([I.x + 1.12, 3.15, I.z + 1.3], [0.08, 0.45, 0.5], [0.95, 0.5, 0.55]), B([I.x + 1.12, 3.4, I.z + 1.3], [0.08, 0.12, 0.2], [0.95, 0.5, 0.55]));   // …a teapot
  for (const dz of [-1.2, 1.2]) out.push(B([I.x + 0.1, 2.7, I.z + dz], [0.3, 0.4, 0.3], [1, 0.8, 0.4], { glow: 1 }));                  // lanterns
  for (const [dx, dz] of [[0.3, -2.4], [0.7, -3.1], [0.3, 3.2]]) out.push(B([I.x + dx, 1, I.z + dz], [0.7, 1, 0.7], [0.55, 0.35, 0.2]), B([I.x + dx, 1, I.z + dz], [0.74, 0.12, 0.74], [0.3, 0.3, 0.32]));
  // flower boxes by the door
  for (const dz of [-1.6, 1.6]) { out.push(B([H.x - 0.5, 0.7, H.z + dz], [0.6, 0.4, 1], [0.5, 0.32, 0.2])); for (let k = 0; k < 3; k++) out.push(B([H.x - 0.5, 1, H.z + dz - 0.3 + k * 0.3], [0.18, 0.18, 0.18], [[1, 0.4, 0.5], [1, 0.85, 0.3], [0.6, 0.5, 1]][k])); }
  // card tables: green baize, a hand of cards laid out, a deck, stools at the ends, and two poles
  // behind the battler for their faction's banner (the cloth is drawn in hubBoxes: it changes
  // with whoever's at the table)
  HUB.tables.forEach(s => {
    out.push(B([s.x, 1.11, s.z], [2.4, 0.12, 1.2], [0.5, 0.32, 0.18]), B([s.x, 1.18, s.z], [2.2, 0.03, 1.0], [0.2, 0.5, 0.3]));
    for (const [dx, rot] of [[-0.6, -0.25], [-0.3, -0.1], [0, 0.05], [0.3, 0.18]]) out.push(B([s.x + dx, 1.21, s.z - 0.15], [0.24, 0.02, 0.34], [0.98, 0.96, 0.9], { rotY: rot }));
    out.push(B([s.x + 0.75, 1.25, s.z + 0.2], [0.26, 0.1, 0.36], [0.45, 0.2, 0.55]), B([s.x - 0.8, 1.22, s.z + 0.25], [0.18, 0.04, 0.18], [1, 0.82, 0.3], { glow: 0.3 }));
    for (const dx of [-1.75, 1.75]) out.push(B([s.x + dx, 0.8, s.z - 0.2], [0.6, 0.1, 0.6], [0.55, 0.36, 0.2]), B([s.x + dx, 0.65, s.z - 0.2], [0.14, 0.3, 0.14], [0.4, 0.26, 0.14]));
    for (const dx of [-1.2, 1.2]) out.push(B([s.x + dx, 2.2, s.z + 1.9], [0.12, 3.4, 0.12], [0.45, 0.3, 0.18]), B([s.x + dx, 3.95, s.z + 1.9], [0.2, 0.2, 0.2], [1, 0.82, 0.3]));
    out.push(B([s.x, 3.7, s.z + 1.9], [2.5, 0.08, 0.08], [0.45, 0.3, 0.18]));
  });
  // benches round the fountain (outside the columns) and planters at the plaza's corners
  const bench = (x, z, along) => {
    const [w, d] = along === 'x' ? [2, 0.6] : [0.6, 2];
    out.push(B([x, 0.95, z], [w, 0.12, d], [0.6, 0.4, 0.24]));
    for (const k of [-0.8, 0.8]) out.push(B([x + (along === 'x' ? k : 0), 0.72, z + (along === 'x' ? 0 : k)], [0.14, 0.4, 0.14], [0.3, 0.3, 0.34]));
  };
  bench(-9.6, 15, 'z'); bench(9.6, 15, 'z'); bench(-9.6, 20, 'z'); bench(9.6, 20, 'z');
  for (const [x, z] of [[-10.2, -4.2], [10.2, -4.2], [-10.2, 30.2], [10.2, 30.2], [-3.2, 25.6], [3.2, 25.6]]) {
    out.push(B([x, 0.85, z], [1, 0.7, 1], [0.72, 0.5, 0.34]), B([x, 1.25, z], [0.86, 0.14, 0.86], [0.3, 0.55, 0.28]));
    for (let k = 0; k < 4; k++) out.push(B([x - 0.25 + (k % 2) * 0.5, 1.42, z - 0.25 + Math.floor(k / 2) * 0.5], [0.22, 0.22, 0.22], [[1, 0.45, 0.55], [1, 0.85, 0.3], [0.55, 0.6, 1], [1, 0.62, 0.25]][(((k + Math.round(x)) % 4) + 4) % 4]));
  }
  // bunting: strings of little flags from the card tables' banner poles down the sides of the way
  // in, and from the far lamps to the portal's arch
  const flags = [[0.95, 0.35, 0.35], [1, 0.82, 0.3], [0.3, 0.6, 0.95], [0.4, 0.8, 0.45], [0.8, 0.45, 0.85]];
  const string = ([ax, ay, az], [bx, by, bz], n) => {
    const rot = Math.atan2(-(bz - az), bx - ax), at = f => [ax + (bx - ax) * f, ay + (by - ay) * f - Math.sin(f * Math.PI) * 0.45, az + (bz - az) * f];
    for (let k = 0; k < n; k++) {
      const p = at(k / n), q = at((k + 1) / n), len = Math.hypot(q[0] - p[0], q[2] - p[2]);
      out.push(B([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [len + 0.02, 0.03, 0.03], [0.25, 0.2, 0.16], { rotY: rot }));
      if (k) out.push(B([p[0], p[1] - 0.16, p[2]], [0.24, 0.28, 0.04], flags[k % flags.length], { rotY: rot }));
    }
  };
  for (const sx of [-1, 1]) {
    string([sx * 10, 3.95, 1.9], [sx * 7.7, 3.95, 7.9], 7);
    string([sx * 11, 3.55, 29], [sx * 3.2, 5.2, 28.6], 9);
  }
  // the notice board
  const N = HUB.board;
  out.push(B([N.x, 2.1, N.z], [2.2, 1.3, 0.2], [0.6, 0.42, 0.25]));                    // it faces the way you come in
  for (const [dx, dy, c] of [[-0.5, 2.3, [0.98, 0.95, 0.85]], [0.4, 2.0, [0.85, 0.93, 1]], [-0.2, 1.7, [1, 0.9, 0.9]]]) out.push(B([N.x + dx, dy, N.z - 0.12], [0.6, 0.5, 0.04], c));
  // lamp posts along the plaza
  for (const [x, z] of [[-11, -3], [11, -3], [-11, 29], [11, 29], [14, 7], [14, 11], [20, 7], [20, 11], [-15, 7], [-15, 11], [-21, 7], [-21, 11]]) {
    out.push(B([x, 1.9, z], [0.14, 2.8, 0.14], [0.2, 0.2, 0.24]), B([x, 3.4, z], [0.4, 0.4, 0.4], [1, 0.88, 0.55], { glow: 1 }));
  }
  // trees and flower beds on the grass; cottages of the town further out
  const tree = (x, z, s = 1) => { out.push(B([x, 0.5 + 1.1 * s, z], [0.4 * s, 2.2 * s, 0.4 * s], [0.45, 0.3, 0.18])); out.push(B([x, 0.5 + 2.6 * s, z], [1.9 * s, 1.5 * s, 1.9 * s], [0.3, 0.6, 0.28])); out.push(B([x, 0.5 + 3.6 * s, z], [1.2 * s, 0.9 * s, 1.2 * s], [0.36, 0.66, 0.32])); };
  for (const [x, z, s] of [[-16, 0, 1.2], [-18, 3, 1], [-15, 20, 1.3], [-20, 32, 1.1], [16, -6, 1.2], [18, 22, 1.1], [24, 30, 1.3], [-27, 20, 1.4], [36, 0, 1.3], [40, 24, 1.2], [-30, -6, 1.2], [10, 38, 1], [-10, 38, 1.1]]) tree(x, z, s);
  for (const [x, z] of [[-14, 12], [-14, 4], [14, 16], [15, 1], [-14, 22], [14, 24]]) for (let k = 0; k < 5; k++) out.push(B([x + (k % 3) * 0.5 - 0.5, 0.6, z + Math.floor(k / 3) * 0.5], [0.26, 0.2, 0.26], [[1, 0.4, 0.5], [1, 0.85, 0.3], [0.6, 0.5, 1], [1, 1, 1], [1, 0.6, 0.2]][k]));
  const cottage = (x, z, s, roof) => { out.push(B([x, 0.5 + 1.4 * s, z], [3.2 * s, 2.8 * s, 2.8 * s], [0.95, 0.9, 0.82])); out.push(B([x, 0.5 + 3.1 * s, z], [3.6 * s, 0.7 * s, 3.2 * s], roof)); out.push(B([x, 0.5 + 3.7 * s, z], [2.6 * s, 0.6 * s, 2.2 * s], shade(roof, 1.1))); };
  for (const [x, z, s, roof] of [[-30, 28, 1.6, [0.35, 0.45, 0.7]], [-30, 0, 1.5, [0.75, 0.45, 0.2]], [40, 36, 1.7, [0.35, 0.55, 0.4]], [42, -8, 1.5, [0.6, 0.3, 0.5]], [-16, 41, 1.4, [0.75, 0.3, 0.25]], [18, 41, 1.5, [0.4, 0.4, 0.55]]]) cottage(x, z, s, roof);
  return out;
}

/** The animated parts: the portal's swirl, water leaping from the fountain, column pennants. */
export function hubBoxes(time, { portalReady = true, banners = [] } = {}) {
  const out = [];
  // each card table's banner, in its battler's faction colours, stirring in the breeze
  HUB.tables.forEach((s, i) => {
    const c = banners[i];
    if (!c) return;
    for (let k = 0; k < 5; k++) {
      const sway = Math.sin(time * 2.2 + k * 0.9 + i) * 0.05;
      out.push({ center: [s.x - 0.9 + k * 0.45, 3.0, s.z + 1.92 + sway], size: [0.45, 1.3, 0.05], color: k % 2 ? c.main : shade(c.main, 0.86) });
    }
    out.push({ center: [s.x, 3.0, s.z + 1.88], size: [0.6, 0.6, 0.04], color: c.mark, glow: 0.25 });
    for (let k = 0; k < 5; k++) out.push({ center: [s.x - 0.9 + k * 0.45, 2.28, s.z + 1.92], size: [0.16, 0.16, 0.05], color: c.mark });     // tassels
  });
  const P = HUB.portal;
  // the swirl: rings of glowing boxes turning inside the arch
  for (let ring = 0; ring < 3; ring++) {
    const r = 0.7 + ring * 0.65, n = 10 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + time * (1.2 - ring * 0.3) * (ring % 2 ? -1 : 1);
      const color = hsv((0.72 + ring * 0.08 + 0.05 * Math.sin(time + i)) % 1, 0.65, 1);
      out.push({ center: [P.x + Math.cos(a) * r, 3.05 + Math.sin(a) * r * 1.05, P.z + 0.6], size: [0.28, 0.28, 0.14], color, glow: 1, rotY: a });
    }
  }
  out.push({ center: [P.x, 3.05, P.z + 0.64], size: [4.2, 4.4, 0.06], color: portalReady ? [0.55, 0.4, 1] : [0.3, 0.3, 0.4], glow: 0.8, alpha: 0.45 });
  // fountain water: drops on arcs from the spout
  const F = HUB.fountain;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, t = (time * 0.9 + i * 0.37) % 1;
    const d = 0.3 + t * 1.7, h = 2.5 + Math.sin(t * Math.PI) * 0.9 - t * 1.2;
    out.push({ center: [F.x + Math.cos(a) * d, h, F.z + Math.sin(a) * d], size: [0.12, 0.16, 0.12], color: [0.6, 0.85, 1], glow: 0.5, alpha: 0.8 });
  }
  return out;
}

/** Is the player at a spot (within r, on the ground near it)? */
export function atSpot(player, spot, r = 1.4) {
  return Math.hypot(player.x - spot.x, player.z - spot.z) < r && player.y < 2;
}
