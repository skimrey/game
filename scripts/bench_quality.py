#!/usr/bin/env python3
"""
Rendering benchmark: which resolution / level of detail / rendering approach holds
the target frame rate in the playground?

  python3 scripts/bench_quality.py                 # attach to the dev-server Chrome (CDP :9222)
  python3 scripts/bench_quality.py --launch        # launch its own headed Chrome instead
  python3 scripts/bench_quality.py --stage factors # only measure each factor on its own

Measures in a real, visible Chrome window (that is what matters for software
rendering). Each configuration loads playground.html?bench=N&<settings>, which
runs a scripted run around the arena and reports average fps, median and
95th-percentile frame times. Results go to perf/results.json and perf/README.md.

Stages:
  baseline  normal quality
  factors   change one factor at a time from normal (what does each cost?)
  search    combine reductions across a resolution sweep; pick the highest-fidelity
            configuration whose median frame rate is ≥ the target (default 30 fps)
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
SEARCH = ([(f"full detail · {round(r * 100)}%", _full(r)) for r in (1, 0.85, 0.75, 0.65, 0.55)] +
          [(f"lite sky · near scenery · {round(r * 100)}%", _lite(r)) for r in (0.85, 0.75, 0.65, 0.55, 0.45)])

COST_BUDGET = 50   # CPU ms per frame: ≈ 1.5 cores at 30 fps, leaving room for host contention
MIN_LOW_FPS = 20   # 95th-percentile frames must stay above this (no stutter)
MARGIN = 1.1       # confirmation: the worst run's average must beat target × MARGIN

def fidelity(cfg):
    """Higher = closer to the real game's look. Textured surfaces are worth about as much
    as +50% resolution; then scenery, sky, filtering, AA."""
    return (cfg["resolution"] * 60
            + (30 if cfg["textures"] else 0)
            + (3 if cfg.get("filtering", "high") == "high" else 0)
            + {"full": 10, "near": 6, "none": 0}[cfg["scenery"]]
            + {"full": 6, "lite": 4, "flat": 0}[cfg["sky"]]
            + (4 if cfg["antialias"] else 0))


def passes(r, target):
    return (r["medianFps"] >= target - 0.5 and r["fps"] >= target and r["lowFps"] >= MIN_LOW_FPS
            and r.get("cpuMsPerFrame", 0) <= COST_BUDGET)


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
    url = f"{base}/{page_name}?{urlencode(params)}"
    quiet = wait_for_quiet_host()
    page.goto(url)
    page.wait_for_function("window.benchWarm", timeout=60000)
    s0, t0 = cpu_times()
    c0 = chrome_cpu_seconds()
    page.wait_for_function("window.benchResult", timeout=(seconds + 60) * 1000)
    c1 = chrome_cpu_seconds()
    s1, t1 = cpu_times()
    r = page.evaluate("window.benchResult")
    return {"config": cfg, "fps": r["fps"], "medianFps": 1000 / r["medianMs"], "lowFps": r["lowFps"],
            "medianMs": r["medianMs"], "p95Ms": r["p95Ms"], "frames": r["frames"], "canvas": r["canvas"],
            "resolution": r.get("resolution"), "steal": (s1 - s0) / max(1, t1 - t0), "quietStart": quiet,
            "cpuMsPerFrame": (c1 - c0) * 1000 / max(1, r["frames"])}


def show(label, r):
    print(f"{label:52} {r['fps']:5.1f} fps avg · {r['medianFps']:5.1f} median · {r['lowFps']:5.1f} low · "
          f"CPU {r['cpuMsPerFrame']:5.1f} ms/frame · canvas {r['canvas'][0]}×{r['canvas'][1]} · steal {r['steal'] * 100:.0f}%", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cdp", default="http://localhost:9222")
    ap.add_argument("--launch", action="store_true", help="launch a separate headed Chrome")
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--seconds", type=float, default=6)
    ap.add_argument("--target", type=float, default=30)
    ap.add_argument("--stage", choices=["all", "baseline", "factors", "search", "confirm"], default="all")
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--report-only", action="store_true", help="rewrite perf/README.md from perf/results.json")
    args = ap.parse_args()
    os.makedirs(PERF, exist_ok=True)
    if args.report_only:
        with open(os.path.join(PERF, "results.json")) as f:
            results = json.load(f)
        passing = [c for c in results.get("confirm", []) if c["passesAll"] and c["worst"]["fps"] >= results["target"] * MARGIN]
        best = max(passing, key=lambda c: fidelity(c["config"]), default=None)
        if best:
            results["recommended"] = {**best["worst"], "label": best["label"], "config": best["config"]}
        with open(os.path.join(PERF, "results.json"), "w") as f:
            json.dump(results, f, indent=1)
        write_report(results)
        return

    results = {"target": args.target, "machine": machine_info(), "baseline": None, "factors": [], "search": []}
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
                if entry["passesAll"] and worst["fps"] >= args.target * MARGIN:
                    break

        if restore:
            page.goto(restore)
    if results.get("confirm"):
        passing = [c for c in results["confirm"] if c["passesAll"] and c["worst"]["fps"] >= args.target * MARGIN]
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
    rec = results.get("recommended")
    if rec:
        print(f"\nRecommended test preset (≥ {args.target:.0f} fps): {rec['label']} → {rec['fps']:.1f} fps avg (worst run), {rec['medianFps']:.1f} median")
    elif args.stage in ("all", "search"):
        print(f"\nNo configuration reached {args.target} fps")


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
    lines = [
        "# Rendering performance", "",
        f"Measured with `npm run bench` (`scripts/bench_quality.py`) in a visible Chrome window on the test VM "
        f"({m.get('cpus')} × {m.get('cpu')}, no GPU: WebGL runs on SwiftShader). Scenario: the playground bench "
        "(a scripted run around the arena). Each run waits for a quiet host first.", "",
        "Columns: frame rates (wall clock), **CPU ms/frame** summed over all Chrome processes — the work a frame "
        "costs, independent of host contention — and **steal**, the CPU share the hypervisor gave to other tenants "
        "during the run (this VM is shared; steal of 10–40% was observed and directly lowers frame rates).", "",
        "## Key findings", "",
        "1. **CPU compositing.** Without a GPU, Chrome composites the page through SwiftShader by default. Launching "
        "it with `--disable-gpu-compositing` (the dev server does this automatically when there is no GPU) cut the "
        "browser's fixed per-frame cost from ~32 to ~12 ms of CPU and took the playground's test mode from ~26 to ~46 fps.",
        "2. **Draw calls.** Batching every platform group, the avatar, enemies and particles into a handful of meshes "
        "took a playground frame from ~175 to 9 draw calls (software WebGL pays heavily per draw).",
        "3. **Back-face culling, sky drawn last** (only uncovered pixels run the sky shader), cheaper texture "
        "filtering, no MSAA, lite sky, near-only scenery and a reduced render resolution make up the rest.",
        "4. **Adaptive quality** in the test preset lowers the resolution (down to 35%) when the frame rate drops — "
        "e.g. when the host is contended — then sheds detail (flat sky, no scenery) if that is not enough, and restores "
        "detail and resolution once there is headroom (observed: at 32% steal it held ~42 fps with detail shed, then "
        "restored lite sky, near scenery and 60% resolution when the host went quiet).", "",
        "| Configuration | avg fps | median fps | 95th-pct fps | CPU ms/frame | canvas | steal |",
        "|---|---|---|---|---|---|---|",
    ]

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
    lines += ["", f"Pass criteria: average and median ≥ {results['target']:.0f} fps, 95th-percentile frames ≥ {MIN_LOW_FPS} fps, "
              f"and at most {COST_BUDGET} CPU ms per frame (≈ 1.5 cores at 30 fps, leaving headroom for a contended host)."]
    if results.get("recommended"):
        r = results["recommended"]
        lines += ["", f"**Recommended `test` preset**: {r['label']} — worst confirmed run {r['fps']:.1f} fps average, "
                  f"{r['medianFps']:.1f} median, {r.get('cpuMsPerFrame', 0):.1f} CPU ms/frame.", "",
                  "```json", json.dumps(r["config"]), "```"]
    with open(os.path.join(PERF, "README.md"), "w") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
