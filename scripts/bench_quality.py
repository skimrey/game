#!/usr/bin/env python3
"""
Rendering benchmark: which resolution / level of detail / rendering approach holds
the target frame rate in the playground?

  python3 scripts/bench_quality.py                 # attach to the dev-server Chrome (CDP :9222)
  python3 scripts/bench_quality.py --launch        # launch its own headed Chrome instead
  python3 scripts/bench_quality.py --stage factors # only measure each factor on its own
  python3 scripts/bench_quality.py --launch --stage compare --compare-base http://localhost:8001
                                                   # A/B: this checkout's test preset vs another checkout's
                                                   # (e.g. the original, served on :8001), interleaved rounds

Measures in a real, visible Chrome window (that is what matters for software
rendering). Each configuration loads playground.html?bench=N&<settings>, which
runs a scripted run around the arena and reports average fps, median and
95th-percentile frame times. Results go to perf/results.json and perf/README.md.

Stages:
  baseline  normal quality
  factors   change one factor at a time from normal (what does each cost?)
  search    combine reductions across a resolution sweep; pick the highest-fidelity
            configuration whose frame rate holds the target (default 60 fps)
  compare   the test preset here vs. at --compare-base, in both scenes (playground and a
            campaign level), alternating rounds so host contention hits both alike

Per-frame CPU is also broken down by thread group (see cpu_by_thread): "raster" (the
software rasterizer's worker threads — llvmpipe or SwiftShader), "gpu-main" (command
decoding and, on llvmpipe, all vertex processing), "viz" (the display compositor) and
"js-main" (the page's main thread).
"""
import argparse
import json
import os
import subprocess
import sys
import time
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERF = os.path.join(ROOT, "perf")

NORMAL = {"resolution": 1, "antialias": 1, "sky": "full", "textures": 1, "filtering": "high", "scenery": "full"}

FACTORS = [
    ("antialias off", {"antialias": 0}),
    ("sky lite", {"sky": "lite"}),
    ("sky flat", {"sky": "flat"}),
    ("sky baked", {"sky": "baked"}),
    ("vertex shading", {"shading": "vertex"}),
    ("textures off", {"textures": 0}),
    ("low texture filtering", {"filtering": "low"}),
    ("scenery near", {"scenery": "near"}),
    ("scenery none", {"scenery": "none"}),
    ("resolution 75%", {"resolution": 0.75}),
    ("resolution 50%", {"resolution": 0.5}),
]

# Candidate test presets, most faithful first (all without MSAA)
def _full(res):
    return {"resolution": res, "antialias": 0, "filtering": "high", "sky": "full", "scenery": "full"}
def _lite(res):
    return {"resolution": res, "antialias": 0, "filtering": "low", "sky": "lite", "scenery": "near"}
def _fast(res, scenery="near", ground="flat", filtering="nearest"):
    # vertex shading + baked sky; whole-pixel upscaling (pixelated) at 1/2 and 1/3
    return {"resolution": res, "antialias": 0, "filtering": filtering, "sky": "baked", "shading": "vertex",
            "scenery": scenery, "ground": ground, "pixelated": 1 if res in (0.5, 1 / 3) else 0}
SEARCH = ([(f"full detail · {round(r * 100)}%", _full(r)) for r in (1, 0.75, 0.55)] +
          [(f"lite sky · near scenery · {round(r * 100)}%", _lite(r)) for r in (0.75, 0.55, 0.45)] +
          [("vertex shading · baked sky · full scenery · crisp 50%", _fast(0.5, "full")),
           ("vertex shading · baked sky · near scenery · textured ground · crisp 50%", _fast(0.5, ground="textured", filtering="low")),
           ("vertex shading · baked sky · near scenery · crisp 50%", _fast(0.5)),
           ("vertex shading · baked sky · near scenery · smooth 55%", _fast(0.55)),
           ("vertex shading · baked sky · near scenery · crisp 33%", _fast(1 / 3))])

CORES = 1.5        # a configuration may use at most this many cores' worth of CPU at the target rate,
                   # leaving room for a contended host (at 60 fps: 25 CPU ms per frame)
MARGIN = 1.1       # confirmation: the worst run's average must beat target × MARGIN (capped just under the refresh rate)
REFRESH = 60       # rAF can't run faster than the display


def cost_budget(target):
    return CORES * 1000 / target


def goal_fps(target):
    return min(target, REFRESH - 1)


def fidelity(cfg):
    """Higher = closer to the real game's look. Textured surfaces are worth about as much
    as +50% resolution; crisp whole-pixel upscaling reads sharper than smoothing at the same
    resolution; then scenery, sky (the baked sky has the full sky's detail, frozen),
    per-pixel shading (edge highlights, wavy lips), filtering, AA."""
    crisp = 1.25 if cfg.get("pixelated") else 1
    return (cfg["resolution"] * crisp * 60
            + (30 if cfg.get("textures", 1) else 0)
            + (3 if cfg.get("filtering", "high") == "high" else 0)
            + {"full": 10, "near": 6, "none": 0}[cfg["scenery"]]
            + {"full": 6, "baked": 6, "lite": 4, "flat": 0}[cfg["sky"]]
            + (0 if cfg.get("ground", "textured") == "flat" else 2)
            + (3 if cfg.get("shading", "pixel") == "pixel" else 0)
            + (4 if cfg["antialias"] else 0))


def passes(r, target):
    goal = goal_fps(target)
    return (r["medianFps"] >= goal - 0.5 and r["fps"] >= goal * 0.95 and r["lowFps"] >= goal * 2 / 3
            and r.get("cpuMsPerFrame", 0) <= cost_budget(target))


def cpu_times():
    """(steal, total) jiffies from /proc/stat — steal = CPU time the hypervisor gave to other tenants."""
    try:
        with open("/proc/stat") as f:
            v = [int(x) for x in f.readline().split()[1:]]
        return v[7], sum(v)
    except (OSError, IndexError, ValueError):
        return 0, 0


def chrome_cpu_seconds():
    """Total CPU seconds used so far by all Chrome processes (browser, GPU/SwiftShader, renderer)."""
    tick = os.sysconf("SC_CLK_TCK")
    total = 0
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/stat") as f:
                parts = f.read().rsplit(")", 1)
            if "chrome" not in parts[0]:
                continue
            fields = parts[1].split()
            total += int(fields[11]) + int(fields[12])  # utime + stime
        except (OSError, IndexError, ValueError):
            continue
    return total / tick


def cpu_by_thread():
    """CPU seconds so far per thread group of all Chrome processes: raster (software GL worker
    threads), gpu-main, viz (display compositor), js-main (renderer main thread), other."""
    tick = os.sysconf("SC_CLK_TCK")
    out = {}
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/cmdline") as f:
                cmd = f.read()
            if "chrom" not in cmd:
                continue
            kind = next((k for k in ("gpu-process", "renderer") if f"--type={k}" in cmd), "other")
            for tid in os.listdir(f"/proc/{pid}/task"):
                with open(f"/proc/{pid}/task/{tid}/stat") as f:
                    st = f.read()
                name = st[st.index("(") + 1:st.rindex(")")]
                fields = st.rsplit(")", 1)[1].split()
                if kind == "gpu-process":
                    group = ("raster" if name.startswith(("llvmpipe", "swiftshader", "Swift")) else
                             "viz" if name.startswith("VizComp") else "gpu-main" if name == "chrome" else "other")
                elif kind == "renderer":
                    group = "js-main" if name == "chrome" else "other"
                else:
                    group = "other"
                out[group] = out.get(group, 0) + (int(fields[11]) + int(fields[12])) / tick
        except (OSError, IndexError, ValueError):
            continue
    return out


def wait_for_quiet_host(max_steal=0.08, timeout=90):
    """Wait until the hypervisor steals little CPU (noisy shared hosts skew frame rates)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        s0, t0 = cpu_times()
        time.sleep(2)
        s1, t1 = cpu_times()
        if (s1 - s0) / max(1, t1 - t0) <= max_steal:
            return True
    return False


def run(page, base, cfg, seconds, page_name="playground.html"):
    """One bench run. Besides frame rates it records hypervisor steal and Chrome's CPU cost per
    frame — the cost is independent of host contention, so configurations compare fairly."""
    params = {"bench": seconds, "fps": 1, "adaptive": 0, **cfg}
    url = f"{base}/{page_name}{'&' if '?' in page_name else '?'}{urlencode(params)}"
    quiet = wait_for_quiet_host()
    page.goto(url)
    page.wait_for_function("window.benchWarm", timeout=60000)
    s0, t0 = cpu_times()
    c0, g0 = chrome_cpu_seconds(), cpu_by_thread()
    page.wait_for_function("window.benchResult", timeout=(seconds + 60) * 1000)
    c1, g1 = chrome_cpu_seconds(), cpu_by_thread()
    s1, t1 = cpu_times()
    r = page.evaluate("window.benchResult")
    frames = max(1, r["frames"])
    return {"config": cfg, "fps": r["fps"], "medianFps": 1000 / r["medianMs"], "lowFps": r["lowFps"],
            "medianMs": r["medianMs"], "p95Ms": r["p95Ms"], "frames": r["frames"], "canvas": r["canvas"],
            "resolution": r.get("resolution"), "steal": (s1 - s0) / max(1, t1 - t0), "quietStart": quiet,
            "cpuMsPerFrame": (c1 - c0) * 1000 / frames,
            "threads": {k: (g1.get(k, 0) - g0.get(k, 0)) * 1000 / frames for k in g1}}


def show(label, r):
    print(f"{label:52} {r['fps']:5.1f} fps avg · {r['medianFps']:5.1f} median · {r['lowFps']:5.1f} low · "
          f"CPU {r['cpuMsPerFrame']:5.1f} ms/frame · canvas {r['canvas'][0]}×{r['canvas'][1]} · steal {r['steal'] * 100:.0f}%", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cdp", default="http://localhost:9222")
    ap.add_argument("--launch", action="store_true", help="launch a separate headed Chrome")
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--seconds", type=float, default=6)
    ap.add_argument("--target", type=float, default=60)
    ap.add_argument("--stage", choices=["all", "baseline", "factors", "search", "confirm", "compare"], default="all")
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--compare-base", default="http://localhost:8001", help="server of the other checkout (compare stage)")
    ap.add_argument("--compare-preset", default="quality=test", help="query string of the preset to compare")
    ap.add_argument("--report-only", action="store_true", help="rewrite perf/README.md from perf/results.json")
    args = ap.parse_args()
    os.makedirs(PERF, exist_ok=True)
    if args.report_only:
        with open(os.path.join(PERF, "results.json")) as f:
            results = json.load(f)
        passing = [c for c in results.get("confirm", []) if c["passesAll"] and c["worst"]["fps"] >= goal_fps(results["target"] * MARGIN)]
        best = max(passing, key=lambda c: fidelity(c["config"]), default=None)
        if best:
            results["recommended"] = {**best["worst"], "label": best["label"], "config": best["config"]}
        with open(os.path.join(PERF, "results.json"), "w") as f:
            json.dump(results, f, indent=1)
        write_report(results)
        return

    results = {"target": args.target, "machine": machine_info(), "baseline": None, "factors": [], "search": []}
    if args.stage == "compare":
        # keep the other stages' results; only replace the comparison
        try:
            with open(os.path.join(PERF, "results.json")) as f:
                results = {**results, **json.load(f), "machine": machine_info()}
        except (OSError, ValueError):
            pass
    with sync_playwright() as p:
        if args.launch:
            browser = p.chromium.launch(headless=False, args=["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--start-maximized",
                                                              *(["--disable-gpu-compositing"] if not os.path.exists("/dev/dri") else [])])
            page = browser.new_page(no_viewport=True)
            restore = None
        else:
            browser = p.chromium.connect_over_cdp(args.cdp)
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.new_page()
            restore = page.url

        if args.stage in ("all", "baseline", "factors"):
            floor = run(page, args.base, {"resolution": 0.35}, args.seconds, "perf/floor.html")
            results["floor"] = floor
            show("browser floor (clear-only page)", floor)
            results["baseline"] = run(page, args.base, NORMAL, args.seconds)
            show("normal (baseline)", results["baseline"])
        if args.stage in ("all", "factors"):
            for label, change in FACTORS:
                r = run(page, args.base, {**NORMAL, **change}, args.seconds)
                r["label"] = label
                results["factors"].append(r)
                show(f"  {label}", r)
        if args.stage in ("all", "search"):
            for label, cfg in SEARCH:
                r = run(page, args.base, {**NORMAL, **cfg}, args.seconds)
                r["label"] = label
                results["search"].append(r)
                show(f"  {label}", r)
        if args.stage == "compare":
            results["compare"] = compare(page, args)
        if args.stage in ("all", "search", "confirm"):
            pool = results["search"] or []
            passing = sorted([r for r in pool if passes(r, args.target)], key=lambda r: -fidelity(r["config"]))
            results["confirm"] = []
            for cand in passing[:2]:
                runs = [run(page, args.base, cand["config"], args.seconds) for _ in range(args.repeats)]
                worst = min(runs, key=lambda r: r["fps"])
                entry = {"label": cand["label"], "config": cand["config"], "runs": runs, "worst": worst,
                         "passesAll": all(passes(r, args.target) for r in runs)}
                results["confirm"].append(entry)
                print(f"confirm {cand['label']:44} worst {worst['fps']:5.1f} fps · runs {', '.join(f'{r['fps']:.1f}' for r in runs)} · "
                      f"CPU {max(r['cpuMsPerFrame'] for r in runs):.1f} ms/frame max · {'PASS' if entry['passesAll'] else 'fail'}", flush=True)
                if entry["passesAll"] and worst["fps"] >= goal_fps(args.target * MARGIN):
                    break

        if restore:
            page.goto(restore)
    if args.stage == "compare":
        pass
    elif results.get("confirm"):
        passing = [c for c in results["confirm"] if c["passesAll"] and c["worst"]["fps"] >= goal_fps(args.target * MARGIN)]
        if not passing:
            passing = [c for c in results["confirm"] if c["passesAll"]]
        best = max(passing, key=lambda c: fidelity(c["config"]), default=None)
        results["recommended"] = best and {**best["worst"], "label": best["label"], "config": best["config"]}
    else:
        passing = [r for r in results["search"] if passes(r, args.target)]
        best = max(passing, key=lambda r: fidelity(r["config"]), default=None)
        results["recommended"] = best
    with open(os.path.join(PERF, "results.json"), "w") as f:
        json.dump(results, f, indent=1)
    write_report(results)
    rec = results.get("recommended") if args.stage != "compare" else None
    if rec:
        print(f"\nRecommended test preset (≥ {args.target:.0f} fps): {rec['label']} → {rec['fps']:.1f} fps avg (worst run), {rec['medianFps']:.1f} median")
    elif args.stage in ("all", "search"):
        print(f"\nNo configuration reached {args.target} fps")


SCENES = [("playground", "playground.html"), ("campaign level 7", "index.html?level=7&menu=0")]
MAX_STEAL = 0.15   # compare: re-measure runs during which the hypervisor stole more than this


def compare(page, args):
    """The test preset in this checkout vs. the other one, in both scenes, alternating rounds:
    with fixed settings (adaptive quality off) and as shipped (adaptive on, given time to settle)."""
    preset = dict(kv.split("=", 1) for kv in args.compare_preset.split("&") if kv)
    modes = [("fixed settings", {**preset}, args.seconds),
             ("as shipped (adaptive)", {**preset, "adaptive": 1, "warmup": 5}, args.seconds + 4)]
    rows = {}
    for round_ in range(args.repeats):
        for mode, cfg, seconds in modes:
            for scene, page_name in SCENES:
                for label, base in (("before", args.compare_base), ("after", args.base)):
                    # a burst of steal hits whichever run is going: measure again (up to 3 tries)
                    for _ in range(3):
                        r = run(page, base, cfg, seconds, page_name)
                        if r["steal"] <= MAX_STEAL:
                            break
                    rows.setdefault((mode, scene, label), []).append(r)
                    show(f"round {round_ + 1} · {mode} · {scene} · {label}", r)
    med = lambda runs, key: sorted(x[key] for x in runs)[len(runs) // 2]
    out = []
    for mode, _, _ in modes:
        for scene, _ in SCENES:
            entry = {"mode": mode, "scene": scene}
            for label in ("before", "after"):
                everything = rows[(mode, scene, label)]
                # medians over the runs the hypervisor left alone (all runs if none were)
                runs = [x for x in everything if x["steal"] <= MAX_STEAL] or everything
                groups = sorted({g for x in runs for g in x.get("threads", {})})
                entry[label] = {"fps": med(runs, "fps"), "medianFps": med(runs, "medianFps"), "lowFps": med(runs, "lowFps"),
                                "cpuMsPerFrame": med(runs, "cpuMsPerFrame"), "steal": med(runs, "steal"),
                                "threads": {g: sorted(x.get("threads", {}).get(g, 0) for x in runs)[len(runs) // 2] for g in groups},
                                "canvas": runs[-1]["canvas"],
                                "cleanRuns": sum(x["steal"] <= MAX_STEAL for x in everything), "runs": everything}
            out.append(entry)
    return {"preset": args.compare_preset, "rounds": args.repeats, "maxSteal": MAX_STEAL, "scenes": out}


def machine_info():
    info = {}
    try:
        info["cpus"] = os.cpu_count()
        with open("/proc/cpuinfo") as f:
            info["cpu"] = next((l.split(":", 1)[1].strip() for l in f if l.startswith("model name")), None)
    except OSError:
        pass
    return info


def write_report(results):
    m = results["machine"]
    target = results["target"]
    lines = [
        "# Rendering performance", "",
        f"Measured with `npm run bench` (`scripts/bench_quality.py`) in a visible Chrome window on the test VM "
        f"({m.get('cpus')} × {m.get('cpu')}, no GPU: WebGL runs on a software rasterizer — Mesa llvmpipe here, "
        "SwiftShader elsewhere). Scenarios: the playground bench (a scripted run around the arena) and a campaign "
        "level (the audit bot replaying its solution). Each run waits for a quiet host first.", "",
        "Columns: frame rates (wall clock), **CPU ms/frame** summed over all Chrome processes — the work a frame "
        "costs, independent of host contention — and **steal**, the CPU share the hypervisor gave to other tenants "
        "during the run (this VM is shared; steal of 10–50% was observed and directly lowers frame rates).", "",
        "## Key findings", "",
        "1. **Where a frame's CPU goes** (per-thread accounting): the rasterizer's worker threads (pixels), the GPU "
        "process's main thread (command decoding — and on llvmpipe *all vertex processing*, single-threaded), the "
        "display compositor (scaling the canvas to the window and presenting it) and the page's main thread (JS).",
        "2. **Compositing the upscaled canvas.** With smooth (bilinear) upscaling the compositor costs ~10 ms per "
        "frame at 1400×850 *whatever the canvas size*; nearest-neighbour (`image-rendering: pixelated`) costs ~3.5 ms. "
        "The test preset renders at exactly ½ resolution so every canvas pixel is a clean 2×2 block — crisp, and "
        "~6 ms per frame cheaper. (Upscaling inside WebGL instead costs llvmpipe ~18 ms: worse.)",
        "3. **Vertex shading** (`shading: 'vertex'`): lighting, ambient occlusion and fog per vertex; the fragment "
        "shader is one texture fetch and a multiply-add, with 9 interpolated floats instead of 18. Top and side faces "
        "draw as separate ranges (one texture each), the grass/sand lip becomes a thin strip of geometry.",
        "4. **Baked sky** (`sky: 'baked'`): the full procedural sky (clouds, stars, aurora, ridges) is rendered once "
        "per biome into a panorama texture; each frame a coarse screen-space grid samples it — one texture lookup per "
        "sky pixel, and better-looking than the old 'lite' sky.",
        "5. **Cheaper texturing**: nearest-texel sampling (`filtering: 'nearest'`, crisp like the pixelated output) and "
        "an untextured distant ground (`ground: 'flat'` — far below and hazed over anyway) saved ~1.5 and ~3 ms of raster "
        "per frame in a campaign level.",
        "6. **Less vertex work** for llvmpipe's single-threaded vertex stage: scenery is baked into spatial chunks "
        "culled against the view frustum; tiny surface details are skipped once they would be under ~1.5 px; faces that "
        "can never be seen are never built (bottoms of props resting on a surface, tops of rock slabs under a platform, "
        "sides between touching floor tiles, undersides of tiles walled in on all sides).",
        "7. **CPU compositing** (dev server: `--disable-gpu-compositing` without a GPU) and **few draw calls** "
        "(batched meshes) remain essential — see the earlier measurements in git history.",
        f"8. **Adaptive quality** holds {target:.0f} fps: at refresh-rate targets, frame intervals can't show headroom, "
        "so holding the target for a while allows a restore attempt (backing off if it promptly slows again), and only a "
        "sustained slowdown (~0.7 s) steps down — a couple of missed vsyncs don't. "
        "Pixelated presets shed detail first (scenery), then step 1/2 → 1/3 resolution, staying crisp. "
        "Start-up, sky bakes and level loads are ignored (one-off hitches).", "",
    ]
    if results.get("compare"):
        c = results["compare"]
        lines += [f"## Before → after: the `{c['preset']}` preset ({c['rounds']} interleaved rounds; medians of the runs with "
                  f"≤ {c.get('maxSteal', 0.15) * 100:.0f}% steal)", "",
                  "| Settings | Scene | | avg fps | median fps | 95th-pct fps | CPU ms/frame | raster | gpu-main | viz | js-main | canvas (end) | clean runs | steal |",
                  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for e in c["scenes"]:
            for label in ("before", "after"):
                r = e[label]
                t = r.get("threads", {})
                lines.append(f"| {e.get('mode', 'fixed settings')} | {e['scene']} | {label} | {r['fps']:.1f} | {r['medianFps']:.1f} | {r['lowFps']:.1f} | "
                             f"{r['cpuMsPerFrame']:.1f} | {t.get('raster', 0):.1f} | {t.get('gpu-main', 0):.1f} | {t.get('viz', 0):.1f} | "
                             f"{t.get('js-main', 0):.1f} | {r['canvas'][0]}×{r['canvas'][1]} | {r.get('cleanRuns', '–')}/{len(r.get('runs', [])) or c['rounds']} | {r['steal'] * 100:.0f}% |")
        lines += ["", "\"before\" is the original test preset (55% smooth, lite sky, per-pixel shading; its adaptive quality "
                  "aims for 30 fps and spends any headroom on resolution, up to 80%); \"after\" is the new one (crisp 50%, "
                  "vertex shading, baked sky, nearest-texel textures, untextured distant ground; adaptive quality aims for 60 fps). *Fixed settings* turns adaptation off to "
                  "compare the same work; *as shipped* is what a player sees. 60 fps is the display's refresh rate: a scene "
                  "that reaches it has headroom left, which the CPU column shows. The two checkouts' campaigns differ, so "
                  "\"campaign level 7\" is a different (similar-sized) level in each; the playground is identical.", ""]
    if not (results.get("baseline") or results.get("factors") or results.get("search")):
        lines += ["## Configurations", "", "*(No configuration sweep recorded — run `npm run bench` (all stages) on a quiet "
                  "host to measure each setting's cost and re-derive the preset.)*", ""]
        with open(os.path.join(PERF, "README.md"), "w") as f:
            f.write("\n".join(lines) + "\n")
        return
    lines += ["## Configurations", "",
              "| Configuration | avg fps | median fps | 95th-pct fps | CPU ms/frame | canvas | steal |",
              "|---|---|---|---|---|---|---|"]

    def row(label, r):
        lines.append(f"| {label} | {r['fps']:.1f} | {r['medianFps']:.1f} | {r['lowFps']:.1f} | {r.get('cpuMsPerFrame', 0):.1f} | "
                     f"{r['canvas'][0]}×{r['canvas'][1]} | {r.get('steal', 0) * 100:.0f}% |")
    if results.get("floor"):
        row("browser floor (clear-only page)", results["floor"])
    if results.get("baseline"):
        row("**normal** (baseline)", results["baseline"])
    for r in results.get("factors", []):
        row(f"normal, {r['label']}", r)
    for r in results.get("search", []):
        row(r["label"], r)
    if results.get("confirm"):
        lines += ["", "## Confirmation (repeated runs; must pass every run)", "",
                  "| Candidate | worst avg fps | all runs | max CPU ms/frame | result |", "|---|---|---|---|---|"]
        for c in results["confirm"]:
            lines.append(f"| {c['label']} | {c['worst']['fps']:.1f} | {', '.join(f'{r['fps']:.1f}' for r in c['runs'])} | "
                         f"{max(r.get('cpuMsPerFrame', 0) for r in c['runs']):.1f} | {'PASS' if c['passesAll'] else 'fail'} |")
    goal = goal_fps(target)
    lines += ["", f"Pass criteria: median ≥ {goal - 0.5:.1f} fps and average ≥ {goal * 0.95:.0f} fps (the display caps at "
              f"{REFRESH}), 95th-percentile frames ≥ {goal * 2 / 3:.0f} fps, and at most {cost_budget(target):.0f} CPU ms per frame "
              f"(≈ {CORES} cores at {target:.0f} fps, leaving headroom for a contended host)."]
    if results.get("recommended"):
        r = results["recommended"]
        lines += ["", f"**Recommended `test` preset**: {r['label']} — worst confirmed run {r['fps']:.1f} fps average, "
                  f"{r['medianFps']:.1f} median, {r.get('cpuMsPerFrame', 0):.1f} CPU ms/frame.", "",
                  "```json", json.dumps(r["config"]), "```"]
    with open(os.path.join(PERF, "README.md"), "w") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
