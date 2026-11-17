import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuality, PRESETS, describeQuality } from '../src/engine/quality.js';
import { coveredSides, visibleFaces, bakeBoxes, frustumPlanes, boxInFrustum, detailDistance, FLOATS_PER_VERTEX } from '../src/engine/renderer.js';
import { buildScenery } from '../src/world/scenery.js';
import { BIOMES } from '../src/world/biomes.js';

const params = query => new URLSearchParams(query);

test('the test preset is the fast path: vertex shading, baked sky, crisp half resolution, adaptive toward 60 fps', () => {
  const q = resolveQuality(params('quality=test'));
  assert.equal(q.preset, 'test');
  assert.equal(q.shading, 'vertex');
  assert.equal(q.sky, 'baked');
  assert.equal(q.pixelated, true);
  assert.equal(q.resolution, 0.5);
  assert.equal(q.adaptive.target, 60);
  assert.deepEqual([q.filtering, q.ground], ['nearest', 'flat']);
  assert.match(describeQuality(q), /vertex shading/);
  // the normal preset keeps full per-pixel quality
  const n = resolveQuality(params(''));
  assert.deepEqual([n.shading, n.sky, n.pixelated, n.filtering, n.ground], ['pixel', 'full', false, 'high', 'textured']);
  assert.equal(PRESETS.normal.adaptive, null);
});

test('single settings can be overridden from the URL', () => {
  const q = resolveQuality(params('quality=test&shading=pixel&sky=lite&pixelated=0&resolution=0.7&adaptive=0'));
  assert.deepEqual([q.shading, q.sky, q.pixelated, q.resolution, q.adaptive], ['pixel', 'lite', false, 0.7, null]);
  assert.equal(resolveQuality(params('quality=test&target=45')).adaptive.target, 45);
  assert.equal(resolveQuality(params('sky=baked')).sky, 'baked');
  assert.equal(resolveQuality(params('shading=bogus')).shading, 'pixel');
  assert.deepEqual([resolveQuality(params('quality=test&ground=textured&filtering=low')).ground, resolveQuality(params('quality=test&filtering=low')).filtering], ['textured', 'low']);
});

test('side faces hidden by a flush neighbour are dropped (tiled floors)', () => {
  const tile = (x, z, top = 0.5) => ({ x, y: top - 0.5, z, width: 2, height: 1, depth: 2 });
  const floor = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) floor.push(tile(i * 2, j * 2));
  const hidden = coveredSides(floor);
  assert.deepEqual([...hidden[4]].sort(), [2, 3, 4, 5]);              // the middle tile: all four sides
  assert.deepEqual([...hidden[0]].sort(), [3, 5]);                    // a corner: two
  // a shorter neighbour does not hide a side
  assert.equal(coveredSides([tile(0, 0, 1.5), tile(2, 0, 0.5)])[0].size, 0);
  // apart: nothing hidden
  assert.equal(coveredSides([tile(0, 0), tile(5, 0)])[0].size, 0);
});

test('scenery is baked into culling chunks, without faces that can never be seen', () => {
  const boxes = [
    { kind: 'surface', center: [0, 1, 0], size: [0.1, 0.2, 0.1], color: [1, 1, 1] },   // rests on a platform: no bottom
    { kind: 'underside', center: [0, -1, 0], size: [1, 0.5, 1], color: [1, 1, 1] },     // hangs under one: no top
    { kind: 'near', center: [30, 2, 30], size: [2, 2, 2], color: [1, 1, 1], rotY: 0.5 }, // floating island: all faces
  ];
  assert.equal(visibleFaces(boxes[0]).reduce((n, [a, b]) => n + b - a, 0), 30);
  assert.equal(visibleFaces(boxes[1]).reduce((n, [a, b]) => n + b - a, 0), 30);
  assert.equal(visibleFaces(boxes[2]).reduce((n, [a, b]) => n + b - a, 0), 36);
  const { data, chunks } = bakeBoxes(boxes);
  assert.equal(data.length, (30 + 30 + 36) * FLOATS_PER_VERTEX);
  assert.equal(chunks.reduce((n, c) => n + c.count, 0), 96);
  assert.ok(chunks.some(c => c.detail) && chunks.some(c => !c.detail), 'surface details get their own chunks');
  // the rotated box's bounds cover it at any angle
  const island = chunks.find(c => c.min[0] > 20);
  assert.ok(island.max[0] - island.min[0] >= 2 * Math.SQRT2 - 1e-9);
});

test('frustum culling and the detail distance', () => {
  // identity view-projection: the visible volume is the cube -1..1
  const planes = frustumPlanes([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.equal(boxInFrustum(planes, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]), true);
  assert.equal(boxInFrustum(planes, [0.9, 0.9, 0], [3, 3, 0.5]), true);     // partly inside
  assert.equal(boxInFrustum(planes, [2, 2, 0], [3, 3, 0.5]), false);
  // tiny details are drawn while at least ~1.5 px tall: twice the resolution, twice the distance
  assert.ok(Math.abs(detailDistance(728) / detailDistance(364) - 2) < 1e-9);
  assert.ok(detailDistance(364) > 15 && detailDistance(364) < 30);
});

test('undersides of platforms walled in by same-height neighbours are not built', () => {
  const tiles = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) tiles.push({ x: i * 2, y: 0, z: j * 2, width: 2, height: 1, depth: 2 });
  const level = { name: 'floor', spawn: { x: 0, y: 0.5, z: 0 }, platforms: tiles, goal: { x: 6, y: 0.5, z: 6, radius: 1 } };
  const scenery = buildScenery(level, BIOMES.meadow, null);
  const hosts = new Set(scenery.boxes.filter(b => b.kind === 'underside').map(b => b.host));
  const interior = [5, 6, 9, 10];                 // the four middle tiles of the 4×4 floor
  for (const i of interior) assert.ok(!hosts.has(i), `tile ${i} is enclosed`);
  assert.ok(hosts.size > 0, 'edge tiles keep theirs');
});
