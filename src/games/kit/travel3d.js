/**
 * The travel levels in 3D — River Raft, Mine Cart, Snowmobile and Biplane, with exactly
 * the same rules as the 2D versions: the SAME game objects (games/raft/rules.js …) step, take
 * the keys, score and are checked by the same bots; this module only draws their state
 * with the WebGL renderer instead of the pixel screen. (The 2D versions stay: one click on
 * the journey's card, or ?travel=2d.)
 *
 *   const scene = createTravelScene({ render, design, pet, biome, zone });
 *   scene.attach(game)                 // a (new) game: builds the trip's world once
 *   scene.draw(game, dt, time)         // a frame
 *   scene.effect(event, game)          // the game's events → 3D effects
 *
 * Each vehicle's scene is in its game's folder (games/<id>/scene3d.js: build, frame, where
 * effects burst, the pet's seat); this module runs whichever the game's descriptor has.
 * Mapping (2D pixels → world units), per vehicle:
 *   raft        seen from behind and above, heading up-river (+z): the river's centre and
 *               width come from riverAt() at every distance, so the banks are built once
 *   mine cart   chase view down the tunnel: distance → z, height over the rail → y
 *   snowmobile  seen from the side (the tilt on landing matters): distance → z, the hills
 *               are hillAt() — built around the sled every frame (crevasses come and go)
 *   biplane     chase view from behind: distance → z, height → y, rings face you
 */
import { createAvatar } from '../../characters/avatar.js';
import { particleSystem } from '../../engine/particles.js';
import { petParts } from '../../characters/pets.js';
import { MATERIALS } from '../../engine/materials.js';
import { hexToRgb } from '../../characters/character.js';
import { MODES } from '../index.js';
import { lerp } from './scene3d.js';

export function createTravelScene({ render, design, pet = null, biome, zone = 'meadow' }) {
  const hero = createAvatar({ random: () => 0.5 });
  hero.setCharacter(design);
  hero.preview = 'sit';
  let game = null, cam = null, seen = new Map(), scene = null;
  /** Anything new in sight grows in over a moment (the games spawn things a little ahead). */
  const grow = key => { const t = seen.get(key) ?? 0; seen.set(key, Math.min(1, t + 0.08)); return t; };
  const ctx = { world: null, hero, grow, accent: hexToRgb(design.colors.accent), top: hexToRgb(design.colors.top), groundColor: MATERIALS[biome.material]?.swatch || [0.4, 0.6, 0.3], zone, biome };
  const emit = (...a) => particleSystem.emit(...a);

  return {
    /** Is there a 3D version of this mini-game? (its descriptor has a scene3d) */
    supports: mode => !!MODES[mode]?.scene3d,
    attach(g) {
      game = g;
      scene = MODES[g.mode].scene3d;
      ctx.lastStrokes = 0;
      ctx.world = scene.build(g, ctx);
      seen = new Map();
      cam = null;
      particleSystem.clear();
      hero.reset({ x: 0, y: 0, z: 0, grounded: true }, { pop: false });
    },
    draw(g, dt, time) {
      if (!ctx.world || g !== game) this.attach(g);
      hero.update({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true }, dt);
      scene.tick?.(g, ctx, emit);
      const f = scene.frame(g, time, ctx);
      // a smooth camera (follows; never jerks on a bump)
      if (!cam) cam = { eye: [...f.camera.eye], target: [...f.camera.target] };
      const a = 1 - Math.exp(-8 * dt);
      for (let i = 0; i < 3; i++) { cam.eye[i] = lerp(cam.eye[i], f.camera.eye[i], a); cam.target[i] = lerp(cam.target[i], f.camera.target[i], a); }
      if (pet && scene.seat) {                          // your pet rides along (where the vehicle has a seat for it)
        const seat = scene.seat(f.focus);
        f.parts.push(...petParts(pet, { x: seat[0], y: seat[1], z: seat[2], yaw: 0, sit: true, look: Math.sin(time), blink: Math.sin(time * 2.3) > 0.97 }, time));
      }
      particleSystem.update(dt);
      render(ctx.world.level, { x: f.focus[0], y: f.focus[1], z: f.focus[2], vy: 0 }, particleSystem.getActiveParticles(), {
        camera: cam, avatar: f.parts, boxes: f.boxes, biome, scenery: ctx.world.scenery, hideGoal: true, hazeFloor: scene.haze ?? -3,
      });
    },
    /** The game's events as 3D effects. */
    effect(e, g) {
      if (!ctx.world || !scene) return;
      const at = scene.at(g, ctx);
      const burst = (color, count = 14, speed = 4) => particleSystem.emit(...at, { count, speed, color, lifetime: 0.8 });
      if (e.type === 'good') burst(e.ring ? [1, 0.85, 0.3] : [0.6, 0.9, 1], e.ring ? 20 : 10, e.ring ? 5 : 3);
      else if (e.type === 'hurt') burst([1, 0.35, 0.35], 18, 5);
      else if (e.type === 'scrape' || e.type === 'land') burst([0.95, 0.95, 1], 10, 2.5);
      else if (e.type === 'jump') burst([1, 0.8, 0.4], 8, 2);
      else if (e.type === 'spell') burst([0.8, 0.6, 1], 24, 5);
    },
  };
}
