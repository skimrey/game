/**
 * Performance Monitor
 * Tracks frame rate, render time, and update time
 */

export class PerformanceMonitor {
  constructor() {
    this.frameCount = 0;
    this.fps = 0;
    this.lastSecond = performance.now();
    this.frameTime = 0;
    this.updateTime = 0;
    this.renderTime = 0;
  }

  beginFrame() {
    this.frameStart = performance.now();
  }

  beginUpdate() {
    this.updateStart = performance.now();
  }

  endUpdate() {
    this.updateTime = performance.now() - this.updateStart;
  }

  beginRender() {
    this.renderStart = performance.now();
  }

  endRender() {
    this.renderTime = performance.now() - this.renderStart;
  }

  endFrame() {
    this.frameCount++;
    const now = performance.now();
    const deltaTime = now - this.lastSecond;

    if (deltaTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / deltaTime);
      this.frameCount = 0;
      this.lastSecond = now;
    }

    this.frameTime = now - this.frameStart;
  }

  getStats() {
    return {
      fps: this.fps,
      frameTime: this.frameTime.toFixed(2),
      updateTime: this.updateTime.toFixed(2),
      renderTime: this.renderTime.toFixed(2),
    };
  }

  toString() {
    return `FPS: ${this.fps} | Frame: ${this.frameTime.toFixed(1)}ms | Update: ${this.updateTime.toFixed(1)}ms | Render: ${this.renderTime.toFixed(1)}ms`;
  }
}

export const performanceMonitor = new PerformanceMonitor();
