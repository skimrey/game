/**
 * FPS meter + benchmark recorder shared by the game, playground and level lab.
 *
 *   const meter = createFpsMeter(quality);   // shows a badge when quality.showFps
 *   meter.frame(timestamp);                  // call once per rAF
 *   meter.startBench(seconds, warmup) → Promise<result>
 *
 * Bench results (also stored on window.benchResult):
 *   { fps, medianMs, p95Ms, lowFps, frames, seconds, quality, canvas }
 *   lowFps = frame rate at the 95th-percentile frame time ("1-in-20 worst frames").
 */
import { describeQuality } from './quality.js';

export function createFpsMeter(quality, { canvas, renderer } = {}) {
  let badge = null;
  if (quality.showFps) {
    badge = document.createElement('div');
    badge.className = 'fps-badge';
    badge.style.cssText = 'position:absolute;left:12px;bottom:12px;padding:4px 8px;border-radius:6px;' +
      'background:rgba(10,14,30,.7);color:#e2e8f0;font:600 12px/1.4 system-ui,sans-serif;pointer-events:none;z-index:5';
    document.querySelector('main')?.append(badge);
  }
  let last = null, count = 0, acc = 0, fps = 0;
  let bench = null;

  return {
    get fps() { return fps; },
    frame(time) {
      if (last !== null) {
        const dt = time - last;
        count++;
        acc += dt;
        if (acc >= 500) {
          fps = Math.round((count * 1000) / acc);
          count = 0;
          acc = 0;
          if (badge) {
            const res = canvas ? ` · ${canvas.width}×${canvas.height}` : '';
            badge.textContent = `${fps} fps · ${describeQuality(renderer?.quality || quality)}${res}`;
          }
        }
        if (bench && time - bench.start > bench.warmup * 1000) {
          window.benchWarm = true;
          bench.times.push(dt);
          if (renderer?.stats) { bench.cpu.push(renderer.stats.cpuMs); bench.draws = renderer.stats.drawCalls; }
          if (time - bench.start > (bench.warmup + bench.seconds) * 1000) {
            const times = bench.times.slice().sort((a, b) => a - b);
            const total = bench.times.reduce((s, v) => s + v, 0);
            const result = {
              fps: (bench.times.length * 1000) / total,
              medianMs: times[Math.floor(times.length / 2)],
              p95Ms: times[Math.floor(times.length * 0.95)],
              lowFps: 1000 / times[Math.floor(times.length * 0.95)],
              frames: bench.times.length,
              seconds: total / 1000,
              quality,
              canvas: canvas ? [canvas.width, canvas.height] : null,
              resolution: renderer?.quality?.resolution ?? quality.resolution,
              renderCpuMs: bench.cpu.length ? bench.cpu.reduce((s, v) => s + v, 0) / bench.cpu.length : null,
              drawCalls: bench.draws ?? null,
            };
            window.benchResult = result;
            bench.resolve(result);
            bench = null;
          }
        }
      }
      last = time;
    },
    startBench(seconds = 8, warmup = 1.5) {
      window.benchWarm = false;
      return new Promise(resolve => {
        bench = { seconds, warmup, start: performance.now(), times: [], cpu: [], draws: null, resolve };
      });
    },
  };
}
