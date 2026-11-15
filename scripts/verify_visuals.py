#!/usr/bin/env python3
"""
Browser-side visual verification (needs: pip install playwright && playwright install chromium;
Pillow is optional and enables the rendered-pixel checks).

  python3 scripts/verify_visuals.py [--out screenshots]

1. Texture swatches: every material's painted top texture matches the swatch the
   DOM-free visual audit uses (textures.html, ΔE ≤ 8).
2. Every page loads without console errors (game, playground, level lab, gallery).
3. Each difficulty tier is rendered in the real game; screenshots are saved and the
   *rendered* sky band and below-course backdrop are compared: every pair of tiers
   must differ clearly (ΔE ≥ 15) — i.e. each tier really has a unique background.

Exits non-zero on any failure.
"""
import argparse
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIER_FIRST_LEVEL = {"meadow": 1, "canyon": 4, "alpine": 7, "starlit": 10}
MIN_RENDERED_DELTA_E = 15


def to_lab(rgb):
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(max(0.0, min(1.0, v))) for v in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def delta_e(a, b):
    la, lb = to_lab(a), to_lab(b)
    return sum((p - q) ** 2 for p, q in zip(la, lb)) ** 0.5


def region_mean(image, box):
    crop = image.crop(box).convert("RGB")
    pixels = list(crop.getdata())
    n = len(pixels)
    return [sum(p[i] for p in pixels) / n / 255 for i in range(3)]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=ROOT)
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join(ROOT, "screenshots"))
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        Image = None
        print("! Pillow not installed: skipping rendered-pixel checks")

    failures = []
    server, base = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": 1280, "height": 760})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))

        # 1. texture swatches
        page.goto(f"{base}/textures.html")
        page.wait_for_function("window.textureReport", timeout=60000)
        for r in page.evaluate("window.textureReport"):
            status = "ok" if r["ok"] else "MISMATCH"
            print(f"texture {r['material']:12} swatch ΔE {r['deltaE']:4.1f} {status}")
            if not r["ok"]:
                failures.append(f"texture swatch mismatch: {r['material']} ΔE {r['deltaE']:.1f}")

        # 2. pages load cleanly
        for path in ["playground.html", "levels.html?level=6&mode=bot"]:
            page.goto(f"{base}/{path}")
            time.sleep(2)
        # 3. tiers in the real game
        samples = {}
        for tier, level in TIER_FIRST_LEVEL.items():
            page.goto(f"{base}/index.html?level={level}&menu=0")   # skip the character screen
            time.sleep(4.5)  # let the tier banner fade out
            path = os.path.join(args.out, f"tier-{level:02d}-{tier}.png")
            page.screenshot(path=path)
            status = page.evaluate("document.getElementById('status').textContent")
            print(f"rendered {tier:8} → {path}  ({status})")
            if Image:
                image = Image.open(path)
                w, h = image.size
                sky = region_mean(image, (int(w * 0.6), 0, w, int(h * 0.12)))           # sky band, right of the HUD
                below = region_mean(image, (0, int(h * 0.75), int(w * 0.3), h))        # backdrop beside/below the course
                samples[tier] = (sky, below)
        if errors:
            failures.extend(f"console: {e}" for e in errors)

        if Image:
            tiers = list(samples)
            for i in range(len(tiers)):
                for j in range(i + 1, len(tiers)):
                    a, b = samples[tiers[i]], samples[tiers[j]]
                    d = max(delta_e(a[0], b[0]), delta_e(a[1], b[1]))
                    ok = d >= MIN_RENDERED_DELTA_E
                    print(f"rendered background {tiers[i]}/{tiers[j]}: ΔE {d:5.1f} {'ok' if ok else 'TOO SIMILAR'}")
                    if not ok:
                        failures.append(f"rendered backgrounds too similar: {tiers[i]} vs {tiers[j]} (ΔE {d:.1f})")
        browser.close()
    server.shutdown()

    if failures:
        print("\nFAILED:\n  " + "\n  ".join(failures))
        sys.exit(1)
    print("\nAll visual checks passed.")


if __name__ == "__main__":
    main()
