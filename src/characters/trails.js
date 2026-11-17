/**
 * After-trails — legendary wardrobe items: glittery particles that follow the hero.
 *
 *   glitter   gold, white and pink sparkles that twinkle as they drift down
 *   rainbow   a ribbon of cubes cycling through the rainbow, left hanging in the air
 *   stardust  blue / violet / white motes that twinkle and float up
 *   hearts    pink hearts (chunky cubes) that bob upward
 *   embers    orange sparks that rise and flicker out
 *
 * 3D: createTrailEmitter().update(trail, player, dt, particles) adds a few particles per
 * frame behind the hero (more while moving); they glow and are drawn by the renderer with
 * the other particles. Capped so a trail never costs much, even in the test preset.
 * 2D battles use TRAIL_STYLES[…].pixels (palette slots) for their pixel version.
 */
import { Particle } from '../engine/particles.js';

export const TRAIL_STYLES = {
  glitter: { colors: [[1, 0.84, 0.3], [1, 1, 1], [1, 0.55, 0.85]], rate: 48, life: 0.9, rise: -0.25, size: 0.11, twinkle: 1, pixels: ['GOLD', 'WHITE', 'FX_D'] },
  rainbow: { colors: null, rate: 50, life: 0.6, rise: 0, size: 0.16, twinkle: 0, pixels: ['FX_A', 'FX_B', 'FX_C', 'FX_D'] },
  stardust: { colors: [[0.5, 0.7, 1], [0.75, 0.55, 1], [1, 1, 1]], rate: 40, life: 1.1, rise: 0.45, size: 0.1, twinkle: 1, pixels: ['CYAN', 'WHITE', 'FX_B'] },
  hearts: { colors: [[1, 0.35, 0.55], [1, 0.62, 0.78]], rate: 16, life: 1.2, rise: 0.7, size: 0.17, twinkle: 0.3, pixels: ['RED', 'BAD'] },
  embers: { colors: [[1, 0.55, 0.15], [1, 0.85, 0.3], [1, 0.3, 0.1]], rate: 42, life: 0.75, rise: 0.9, size: 0.1, twinkle: 0.8, pixels: ['GOLD', 'RED', 'GOLD_DARK'] },
};
export const TRAIL_NAMES = Object.keys(TRAIL_STYLES);
const MAX_TRAIL = 100;

const hexToRgb01 = hex => { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

function hue(h) {
  const f = n => { const k = (n + h * 6) % 6; return 1 - Math.max(0, Math.min(k, 4 - k, 1)) * 0.8; };
  return [f(5), f(3), f(1)];
}

/** A glowing trail particle: no gravity, gentle drift, optional twinkle. */
class TrailParticle extends Particle {
  constructor(x, y, z, style, color, seed) {
    super(x, y, z, (Math.random() - 0.5) * 0.3, style.rise, (Math.random() - 0.5) * 0.3, color, style.life * (0.7 + Math.random() * 0.5));
    this.base = color;
    this.size = style.size * (0.7 + Math.random() * 0.6);
    this.glow = 1;
    this.twinkle = style.twinkle;
    this.seed = seed;
    this.trail = true;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    if (this.twinkle) {
      const k = 1 - this.twinkle * 0.5 * (1 + Math.sin(this.age * 28 + this.seed));
      this.color = this.base.map(c => Math.max(0.05, c * (0.45 + 0.55 * k)));
    }
  }
}

/** Preview geometry for the wardrobe / pedestal: a swoosh of glowing cubes. */
export function trailPreviewParts(trail, boxAt) {
  const style = TRAIL_STYLES[trail];
  if (!style) return [];
  const out = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const color = style.colors ? style.colors[i % style.colors.length] : hue(t);
    const s = (0.05 + 0.08 * (1 - Math.abs(t - 0.5) * 1.4)) * (style.size / 0.08);
    out.push(boxAt(-0.45 + t * 0.9, 0.25 + Math.sin(t * Math.PI) * 0.5 + (i % 3) * 0.04, Math.cos(t * 6) * 0.08, s, color));
  }
  return out;
}

export function createTrailEmitter() {
  let debt = 0, clock = 0, last = null;
  return {
    /** Emit trail particles behind the hero. trail: design.trail; moving: 0..1 (speed / air). */
    update(trail, player, dt, particles, colors = null) {
      const base = TRAIL_STYLES[trail];
      // the tailor can recolour a trail (characters/tailoring.js): hex colours replace the style's
      const style = base && colors?.length ? { ...base, colors: colors.map(hexToRgb01) } : base;
      clock += dt;
      if (!style) { last = null; return; }
      const moved = last ? Math.hypot(player.x - last.x, player.y - last.y, player.z - last.z) : 0;
      last = { x: player.x, y: player.y, z: player.z };
      const activity = Math.min(1, moved / dt / 4) || 0;
      debt += style.rate * dt * (0.15 + 0.85 * activity);
      const list = particles.particles;
      let count = 0;
      for (const p of list) if (p.trail) count++;
      while (debt >= 1) {
        debt -= 1;
        if (count++ >= MAX_TRAIL) continue;
        const color = style.colors ? style.colors[Math.floor(Math.random() * style.colors.length)] : hue((clock * 0.8) % 1);
        list.push(new TrailParticle(
          player.x + (Math.random() - 0.5) * 0.35, player.y + 0.35 + Math.random() * 0.7, player.z + (Math.random() - 0.5) * 0.35,
          style, color, Math.random() * 10));
      }
    },
  };
}
