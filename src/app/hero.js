/**
 * Your hero: the character screen and its showroom (the turning hero on a pedestal), your pet.
 *
 * Part of the app (src/app/): shared state lives in G (app/boot.js); see STRUCTURE.md.
 */
import { avatar, benchSeconds, canvas, controls, dressed, G, home, hubFirst, screen, showAvatar, showTrail, status } from './boot.js';
import { loadLevel, musicForHere, updateStatus } from './level.js';
import { nextLevel } from './run.js';
import { enterTown } from './town.js';
import { sound } from '../audio/music.js';
import { emitAvatarEffects } from '../characters/avatar.js';
import { createPetFollower } from '../characters/pets.js';
import { particleSystem } from '../engine/particles.js';

export function setPet(p) { G.pet = p; G.petFollower = p ? createPetFollower(p) : null; if (G.petFollower && typeof G.session !== 'undefined') G.petFollower.reset(G.session.player); }

// Showroom: the hero on a pedestal behind the character screen, slowly turning
// and showing off idle / run / jump poses. Drag the preview to turn it.
export const SHOWROOM = { name: 'Showroom', spawn: { x: 0, y: 0.5, z: 0 }, platforms: [{ x: 0, y: 0, z: 0, width: 2.2, height: 1, depth: 2.2 }], goal: { x: 0, y: 0.5, z: 0, radius: 1 } };

export const SHOWROOM_VIEW = { ...SHOWROOM, goal: null };

   // no gem on the pedestal
const SHOWCASE = [['idle', 3.5], ['run', 2.2], ['jump', 0.45], ['fall', 0.45], ['idle', 2.5]];

export const showPlayer = { x: 0, y: 0.5, z: 0, vy: 0, grounded: true };

export const show = { time: 0, clock: 0, yaw: 0.45, swayFrom: 0, drag: null, scenery: null, previewId: null };

/** Camera angle around the hero: a slow sway (3/4 view round to the back and forth) unless dragged. */
export const showAngle = () => show.yaw + (show.drag || show.clock < show.swayFrom ? 0 : 0.95 * Math.sin(0.3 * (show.clock - show.swayFrom)));

export function openCharacterScreen(options = {}) {
  if (screen.isOpen || benchSeconds) return;
  G.pausedAt = performance.now();
  document.body.classList.add('in-menu');
  screen.open({ resume: G.started, ...options });
  sound.place('title');
  status.textContent = options.wardrobe ? 'Wardrobe' : 'Choose your hero';
}

export function play(design) {
  design = dressed(design);
  G.currentDesign = design;
  avatar.setCharacter(design);
  avatar.reset(G.session.player);
  screen.close();
  document.body.classList.remove('in-menu');
  controls.clear();
  G.renderer?.holdAdaptive(1000);
  G.lastTime = undefined;
  if (G.continueAfterMenu) {           // opened as the wardrobe between levels: on to the next one
    G.continueAfterMenu = false;
    G.pausedAt = null;
    nextLevel();
    return;
  }
  if (G.afterMenu === 'home') {        // opened from the wardrobe at home: back home
    G.afterMenu = null;
    G.pausedAt = null;
    home.resume({ design });
    return;
  }
  if (!G.started && hubFirst) {        // the first Play: into town
    G.pausedAt = null;
    enterTown('start');
    return;
  }
  if (!G.started) {
    G.started = true;
    loadLevel(G.levelIndex);
  } else {
    if (G.pausedAt !== null) G.levelStartTime += performance.now() - G.pausedAt;
    updateStatus();
    musicForHere();
  }
  G.pausedAt = null;
  canvas.focus?.();
}

export function updateShowroom(dt) {
  show.time += dt;
  show.clock += dt;
  const cycle = SHOWCASE.reduce((s, [, d]) => s + d, 0);
  let t = show.time % cycle;
  let preview = 'idle';
  for (const [name, d] of SHOWCASE) { if (t < d) { preview = name; break; } t -= d; }
  showAvatar.preview = preview;
  emitAvatarEffects(showAvatar.update(showPlayer, dt), particleSystem);   // dust while running in place
  // a trail shows off while the preview runs (as if moving: a point circling behind the hero)
  const design = showAvatar.design;
  if (design?.trail && design.trail !== 'none') {
    const a = show.time * 3;
    showTrail.update(design.trail, { x: Math.sin(a) * 0.4 - 0.3, y: preview === 'run' || preview === 'jump' ? 0.5 : 0.45, z: -0.5 + Math.cos(a) * 0.2 }, dt, particleSystem);
  }
}

/** Camera orbiting the hero, shifted so the hero sits in the middle of the space the panels leave free. */
export function showroomCamera() {
  // the slow sway (see showAngle) shows off capes, packs and ponytails
  const a = showAngle(), pitch = 0.17, dist = 4.7;
  const target = [0, 0.78, 0];
  const eye = [target[0] + Math.sin(a) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(a) * Math.cos(pitch) * dist];
  const { left, right, width } = screen.insets();
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const ndc = width ? ((left + (width - left - right) / 2) / width) * 2 - 1 : 0;   // where the hero should appear
  const shift = -ndc * dist * Math.tan(Math.PI / 6) * aspect;
  const rx = Math.cos(a), rz = -Math.sin(a);                                        // camera right (horizontal)
  for (const p of [eye, target]) { p[0] += rx * shift; p[2] += rz * shift; }
  return { eye, target };
}
