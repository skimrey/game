# Rendering performance

Measured with `npm run bench` (`scripts/bench_quality.py`) in a visible Chrome window on the test VM (4 × Intel(R) Xeon(R) Processor @ 2.60GHz, no GPU: WebGL runs on a software rasterizer — Mesa llvmpipe here, SwiftShader elsewhere). Scenarios: the playground bench (a scripted run around the arena) and a campaign level (the audit bot replaying its solution). Each run waits for a quiet host first.

Columns: frame rates (wall clock), **CPU ms/frame** summed over all Chrome processes — the work a frame costs, independent of host contention — and **steal**, the CPU share the hypervisor gave to other tenants during the run (this VM is shared; steal of 10–50% was observed and directly lowers frame rates).

## Key findings

1. **Where a frame's CPU goes** (per-thread accounting): the rasterizer's worker threads (pixels), the GPU process's main thread (command decoding — and on llvmpipe *all vertex processing*, single-threaded), the display compositor (scaling the canvas to the window and presenting it) and the page's main thread (JS).
2. **Compositing the upscaled canvas.** With smooth (bilinear) upscaling the compositor costs ~10 ms per frame at 1400×850 *whatever the canvas size*; nearest-neighbour (`image-rendering: pixelated`) costs ~3.5 ms. The test preset renders at exactly ½ resolution so every canvas pixel is a clean 2×2 block — crisp, and ~6 ms per frame cheaper. (Upscaling inside WebGL instead costs llvmpipe ~18 ms: worse.)
3. **Vertex shading** (`shading: 'vertex'`): lighting, ambient occlusion and fog per vertex; the fragment shader is one texture fetch and a multiply-add, with 9 interpolated floats instead of 18. Top and side faces draw as separate ranges (one texture each), the grass/sand lip becomes a thin strip of geometry.
4. **Baked sky** (`sky: 'baked'`): the full procedural sky (clouds, stars, aurora, ridges) is rendered once per biome into a panorama texture; each frame a coarse screen-space grid samples it — one texture lookup per sky pixel, and better-looking than the old 'lite' sky.
5. **Cheaper texturing**: nearest-texel sampling (`filtering: 'nearest'`, crisp like the pixelated output) and an untextured distant ground (`ground: 'flat'` — far below and hazed over anyway) saved ~1.5 and ~3 ms of raster per frame in a campaign level.
6. **Less vertex work** for llvmpipe's single-threaded vertex stage: scenery is baked into spatial chunks culled against the view frustum; tiny surface details are skipped once they would be under ~1.5 px; faces that can never be seen are never built (bottoms of props resting on a surface, tops of rock slabs under a platform, sides between touching floor tiles, undersides of tiles walled in on all sides).
7. **CPU compositing** (dev server: `--disable-gpu-compositing` without a GPU) and **few draw calls** (batched meshes) remain essential — see the earlier measurements in git history.
8. **Adaptive quality** holds 60 fps: at refresh-rate targets, frame intervals can't show headroom, so holding the target for a while allows a restore attempt (backing off if it promptly slows again), and only a sustained slowdown (~0.7 s) steps down — a couple of missed vsyncs don't. Pixelated presets shed detail first (scenery), then step 1/2 → 1/3 resolution, staying crisp. Start-up, sky bakes and level loads are ignored (one-off hitches).

## Before → after: the `quality=test` preset (3 interleaved rounds; medians of the runs with ≤ 15% steal)

| Settings | Scene | | avg fps | median fps | 95th-pct fps | CPU ms/frame | raster | gpu-main | viz | js-main | canvas (end) | clean runs | steal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fixed settings | playground | before | 31.5 | 30.0 | 20.0 | 52.8 | 25.3 | 11.1 | 9.7 | 3.0 | 770×399 | 3/3 | 10% |
| fixed settings | playground | after | 48.7 | 59.9 | 29.9 | 27.8 | 11.3 | 6.0 | 4.9 | 2.8 | 700×364 | 3/3 | 5% |
| fixed settings | campaign level 7 | before | 52.0 | 59.9 | 29.9 | 34.7 | 16.4 | 4.8 | 8.9 | 2.3 | 770×399 | 3/3 | 2% |
| fixed settings | campaign level 7 | after | 59.5 | 59.9 | 59.9 | 17.5 | 7.0 | 3.1 | 3.3 | 2.3 | 700×364 | 3/3 | 1% |
| as shipped (adaptive) | playground | before | 39.3 | 30.1 | 29.9 | 46.2 | 20.6 | 10.6 | 9.8 | 2.7 | 790×410 | 3/3 | 1% |
| as shipped (adaptive) | playground | after | 59.4 | 59.9 | 59.5 | 23.4 | 9.6 | 5.1 | 4.5 | 2.5 | 700×364 | 3/3 | 0% |
| as shipped (adaptive) | campaign level 7 | before | 54.3 | 59.9 | 30.0 | 37.1 | 19.9 | 4.4 | 8.5 | 2.4 | 1047×543 | 3/3 | 0% |
| as shipped (adaptive) | campaign level 7 | after | 60.0 | 59.9 | 59.9 | 16.1 | 6.9 | 2.3 | 3.0 | 2.0 | 700×364 | 3/3 | 0% |

"before" is the original test preset (55% smooth, lite sky, per-pixel shading; its adaptive quality aims for 30 fps and spends any headroom on resolution, up to 80%); "after" is the new one (crisp 50%, vertex shading, baked sky, nearest-texel textures, untextured distant ground; adaptive quality aims for 60 fps). *Fixed settings* turns adaptation off to compare the same work; *as shipped* is what a player sees. 60 fps is the display's refresh rate: a scene that reaches it has headroom left, which the CPU column shows. The two checkouts' campaigns differ, so "campaign level 7" is a different (similar-sized) level in each; the playground is identical.

## Configurations

*(No configuration sweep recorded — run `npm run bench` (all stages) on a quiet host to measure each setting's cost and re-derive the preset.)*

