# Rendering performance

Measured with `npm run bench` (`scripts/bench_quality.py`) in a visible Chrome window on the test VM (4 × Intel(R) Xeon(R) Processor @ 2.60GHz, no GPU: WebGL runs on SwiftShader). Scenario: the playground bench (a scripted run around the arena). Each run waits for a quiet host first.

Columns: frame rates (wall clock), **CPU ms/frame** summed over all Chrome processes — the work a frame costs, independent of host contention — and **steal**, the CPU share the hypervisor gave to other tenants during the run (this VM is shared; steal of 10–40% was observed and directly lowers frame rates).

## Key findings

1. **CPU compositing.** Without a GPU, Chrome composites the page through SwiftShader by default. Launching it with `--disable-gpu-compositing` (the dev server does this automatically when there is no GPU) cut the browser's fixed per-frame cost from ~32 to ~12 ms of CPU and took the playground's test mode from ~26 to ~46 fps.
2. **Draw calls.** Batching every platform group, the avatar, enemies and particles into a handful of meshes took a playground frame from ~175 to 9 draw calls (software WebGL pays heavily per draw).
3. **Back-face culling, sky drawn last** (only uncovered pixels run the sky shader), cheaper texture filtering, no MSAA, lite sky, near-only scenery and a reduced render resolution make up the rest.
4. **Adaptive quality** in the test preset lowers the resolution (down to 35%) when the frame rate drops — e.g. when the host is contended — then sheds detail (flat sky, no scenery) if that is not enough, and restores detail and resolution once there is headroom (observed: at 32% steal it held ~42 fps with detail shed, then restored lite sky, near scenery and 60% resolution when the host went quiet).

| Configuration | avg fps | median fps | 95th-pct fps | CPU ms/frame | canvas | steal |
|---|---|---|---|---|---|---|
| browser floor (clear-only page) | 56.0 | 59.9 | 59.9 | 12.2 | 519×242 | 3% |
| **normal** (baseline) | 10.3 | 10.0 | 7.5 | 293.5 | 1485×692 | 4% |
| normal, antialias off | 16.8 | 15.0 | 12.0 | 144.3 | 1485×692 | 6% |
| normal, sky lite | 10.1 | 10.0 | 8.6 | 285.7 | 1485×692 | 5% |
| normal, sky flat | 12.5 | 12.0 | 10.0 | 227.8 | 1485×692 | 2% |
| normal, textures off | 14.2 | 15.0 | 12.0 | 211.0 | 1485×692 | 0% |
| normal, low texture filtering | 10.2 | 10.0 | 7.5 | 279.0 | 1485×692 | 5% |
| normal, scenery near | 11.6 | 12.0 | 10.0 | 272.4 | 1485×692 | 1% |
| normal, scenery none | 14.0 | 15.0 | 12.0 | 225.0 | 1485×692 | 2% |
| normal, resolution 75% | 15.2 | 15.0 | 12.0 | 187.1 | 1113×519 | 3% |
| normal, resolution 50% | 22.5 | 20.0 | 20.0 | 108.4 | 742×346 | 4% |
| full detail · 100% | 19.3 | 20.0 | 15.0 | 129.2 | 1485×692 | 1% |
| full detail · 85% | 23.7 | 20.0 | 20.0 | 100.0 | 1262×588 | 0% |
| full detail · 75% | 25.8 | 29.9 | 20.0 | 88.0 | 1113×519 | 1% |
| full detail · 65% | 30.3 | 30.0 | 20.0 | 70.7 | 965×449 | 0% |
| full detail · 55% | 30.6 | 30.0 | 20.0 | 63.2 | 816×380 | 4% |
| lite sky · near scenery · 85% | 28.8 | 30.0 | 20.0 | 75.3 | 1262×588 | 1% |
| lite sky · near scenery · 75% | 26.5 | 29.9 | 20.0 | 70.6 | 1113×519 | 7% |
| lite sky · near scenery · 65% | 39.5 | 30.1 | 29.9 | 49.5 | 965×449 | 0% |
| lite sky · near scenery · 55% | 42.1 | 59.9 | 29.9 | 42.4 | 816×380 | 2% |
| lite sky · near scenery · 45% | 34.6 | 30.0 | 20.0 | 41.4 | 668×311 | 11% |

## Confirmation (repeated runs; must pass every run)

| Candidate | worst avg fps | all runs | max CPU ms/frame | result |
|---|---|---|---|---|
| lite sky · near scenery · 65% | 28.7 | 28.7, 31.6, 33.3 | 60.6 | fail |
| lite sky · near scenery · 55% | 38.8 | 38.8, 40.4, 46.8 | 46.6 | PASS |

Pass criteria: average and median ≥ 30 fps, 95th-percentile frames ≥ 20 fps, and at most 50 CPU ms per frame (≈ 1.5 cores at 30 fps, leaving headroom for a contended host).

**Recommended `test` preset**: lite sky · near scenery · 55% — worst confirmed run 38.8 fps average, 30.1 median, 46.6 CPU ms/frame.

```json
{"resolution": 0.55, "antialias": 0, "sky": "lite", "textures": 1, "filtering": "low", "scenery": "near"}
```
