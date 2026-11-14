/**
 * Particle System
 * Handles visual effects like dust, sparks, and goal completion effects
 */

export class Particle {
  constructor(x, y, z, vx, vy, vz, color, lifetime = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.color = color;
    this.lifetime = lifetime;
    this.age = 0;
    this.size = 0.1;
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.vy -= 9.8 * dt; // gravity
  }

  isAlive() {
    return this.age < this.lifetime;
  }

  getAlpha() {
    return Math.max(0, 1 - this.age / this.lifetime);
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, z, options = {}) {
    const count = options.count || 5;
    const speed = options.speed || 3;
    const color = options.color || [1, 1, 1];
    const lifetime = options.lifetime || 1;

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const elevation = Math.random() * Math.PI / 4;
      const vx = Math.cos(angle) * Math.sin(elevation) * speed;
      const vy = Math.cos(elevation) * speed + Math.random() * speed * 0.5;
      const vz = Math.sin(angle) * Math.sin(elevation) * speed;

      this.particles.push(new Particle(x, y, z, vx, vy, vz, color, lifetime));
    }
  }

  update(dt) {
    this.particles = this.particles.filter(p => p.isAlive());
    this.particles.forEach(p => p.update(dt));
  }

  getActiveParticles() {
    return this.particles;
  }

  clear() {
    this.particles = [];
  }
}

export const particleSystem = new ParticleSystem();
