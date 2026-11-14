/**
 * Particle effects for gameplay events (from session.step).
 */
import { Particle } from './particles.js';

function ring(particles, x, y, z, { count = 18, speed = 4, color, lifetime = 0.45, lift = 0.6, glow = 0 }) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const p = new Particle(x, y + 0.05, z, Math.cos(a) * speed, lift, Math.sin(a) * speed, color, lifetime);
    p.size = 0.14;
    p.glow = glow;
    particles.particles.push(p);
  }
}

export function emitGameplayEffects(events, particles) {
  for (const e of events) {
    switch (e.type) {
      case 'dash': {
        for (let i = 0; i < 8; i++) {
          const p = new Particle(e.x - e.dx * i * 0.12, e.y + 0.7, e.z - e.dz * i * 0.12, -e.dx * 2, 0.4, -e.dz * 2, [0.6, 0.9, 1], 0.3);
          p.size = 0.16;
          p.glow = 0.8;
          particles.particles.push(p);
        }
        break;
      }
      case 'shockwave':
        ring(particles, e.x, e.y, e.z, { count: 24, speed: e.radius * 3, color: [0.95, 0.9, 0.8], lifetime: 0.35, lift: 1 });
        break;
      case 'defeat':
        particles.emit(e.x, e.y + 0.3, e.z, { count: 14, speed: 5, color: e.enemy === 'wisp' ? [0.6, 0.95, 1] : e.enemy === 'spiker' ? [1, 0.55, 0.3] : [0.8, 0.55, 1], lifetime: 0.6 });
        ring(particles, e.x, e.y + 0.2, e.z, { count: 10, speed: 3, color: [1, 1, 1], lifetime: 0.3, glow: 0.6 });
        break;
      case 'hurt':
        particles.emit(e.x, e.y + 0.9, e.z, { count: 10, speed: 4, color: [1, 0.3, 0.25], lifetime: 0.4 });
        break;
      default:
        break;
    }
  }
}
