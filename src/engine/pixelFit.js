/**
 * Show a 320×180 pixel canvas at the largest WHOLE-number scale that fits the window
 * (4× in a 1400×727 window → 1280×720), centred. Whole-pixel scaling keeps every pixel
 * the same size (no shimmer) and is the compositor's cheap path — on machines without a
 * GPU the page is composited on the CPU, and a stretched full-window canvas cost ~10 ms a
 * frame with spikes to ~30 ms.
 *
 *   const stop = fitPixelCanvas(canvas);   // keeps fitting on resize; stop() to detach
 */
export function fitPixelCanvas(canvas, { w = 320, h = 180 } = {}) {
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor(Math.min(innerWidth * dpr / w, innerHeight * dpr / h)));
    canvas.style.width = `${(w * k) / dpr}px`;
    canvas.style.height = `${(h * k) / dpr}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  return () => window.removeEventListener('resize', fit);
}
