/**
 * Player Avatar
 *
 * A jointed, box-built character that sits on top of the physics player.
 * The physics body stays an axis-aligned box (see physics.js); this module is
 * purely visual. It reads the player's position / vertical velocity every
 * fixed physics step and produces:
 *   - a list of posed box parts ({ matrix, color }) for the renderer
 *   - gameplay-visual events (jump, land, step) for particles / audio
 *
 * Animation is fully procedural:
 *   idle  – breathing, arm sway, blinking, looking around
 *   run   – distance-driven stride with knees/elbows, torso twist, forward lean,
 *           automatic foot-to-ground compensation and banking into turns
 *   air   – separate rising (tucked) and falling (arms out) poses, blended by vy
 *   land / jump – damped-spring squash & stretch scaled by impact speed
 *   spawn – pop-in with overshoot after respawn / level change
 *
 * The module has no DOM/WebGL dependencies so it can be unit-tested in Node.
 */

import { PLAYER } from './physics.js';
import { compose, translation, scaling, rotationX, rotationY, rotationZ, transformPoint } from './mat4.js';

// ---------------------------------------------------------------------------
// Proportions (world units, origin = feet centre, +Z = forward, +Y = up).
// The whole figure fits inside the physics box: 0.8 wide, 1.5 tall.
// ---------------------------------------------------------------------------
export const AVATAR_DIMENSIONS = {
  thigh: 0.3,
  shin: 0.3,            // includes shoe; hip height at rest = thigh + shin
  hipSpacing: 0.12,
  torsoHeight: 0.44,
  torsoWidth: 0.5,
  torsoDepth: 0.3,
  shoulderY: 0.4,       // relative to waist pivot
  shoulderX: 0.33,
  upperArm: 0.24,
  forearm: 0.2,
  head: 0.4,
  neckGap: 0.02,
};
const D = AVATAR_DIMENSIONS;
const REST_HIP_HEIGHT = D.thigh + D.shin;
const STRIDE_LENGTH = 1.7; // world units travelled per full run cycle

export const AVATAR_PALETTES = {
  classic: { shirt: [0.9, 0.3, 0.25], pants: [0.2, 0.28, 0.5], skin: [0.98, 0.8, 0.64], cap: [0.95, 0.95, 0.96], shoes: [0.22, 0.17, 0.15], pack: [0.96, 0.7, 0.2], eyes: [0.08, 0.08, 0.12] },
  ocean: { shirt: [0.2, 0.55, 0.9], pants: [0.93, 0.93, 0.9], skin: [0.78, 0.57, 0.42], cap: [0.98, 0.45, 0.2], shoes: [0.15, 0.18, 0.25], pack: [0.25, 0.8, 0.7], eyes: [0.08, 0.08, 0.12] },
  forest: { shirt: [0.3, 0.62, 0.3], pants: [0.45, 0.32, 0.2], skin: [0.55, 0.38, 0.26], cap: [0.85, 0.2, 0.22], shoes: [0.2, 0.15, 0.1], pack: [0.9, 0.85, 0.55], eyes: [0.06, 0.06, 0.08] },
  royal: { shirt: [0.55, 0.3, 0.8], pants: [0.18, 0.16, 0.22], skin: [0.99, 0.86, 0.74], cap: [1, 0.83, 0.15], shoes: [0.85, 0.85, 0.88], pack: [0.95, 0.45, 0.65], eyes: [0.1, 0.05, 0.15] },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const easeOutBack = t => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** A pose is a flat object of joint angles so poses can be blended numerically. */
function makePose(values = {}) {
  return {
    legSwingL: 0, legSwingR: 0, kneeL: 0.05, kneeR: 0.05,
    armSwingL: 0, armSwingR: 0, armOutL: 0.1, armOutR: 0.1, elbowL: 0.15, elbowR: 0.15,
    lean: 0, twist: 0, headYaw: 0, headPitch: 0, bob: 0,
    ...values,
  };
}

function blendPose(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = {};
  for (const key in a) out[key] = lerp(a[key], b[key], t);
  return out;
}

/** Swap left/right limbs so an asymmetric pose can be mirrored. */
function mirrorPose(p) {
  return {
    ...p,
    legSwingL: p.legSwingR, legSwingR: p.legSwingL, kneeL: p.kneeR, kneeR: p.kneeL,
    armSwingL: p.armSwingR, armSwingR: p.armSwingL, armOutL: p.armOutR, armOutR: p.armOutL,
    elbowL: p.elbowR, elbowR: p.elbowL, twist: -p.twist, headYaw: -p.headYaw,
  };
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------
function idlePose(t, lookAround) {
  const breathe = Math.sin(t * 2.2);
  return makePose({
    armSwingL: 0.05 * Math.sin(t * 1.1), armSwingR: 0.05 * Math.sin(t * 1.1 + 1.3),
    armOutL: 0.1 + 0.03 * breathe, armOutR: 0.1 + 0.03 * breathe,
    elbowL: 0.18, elbowR: 0.18,
    lean: 0.02,
    bob: 0.012 * breathe,
    headYaw: lookAround * 0.45 * Math.sin(t * 0.6),
    headPitch: lookAround * 0.08 * Math.sin(t * 0.9 + 0.5),
  });
}

function runPose(phase) {
  const s = Math.sin(phase), c = Math.cos(phase);
  return makePose({
    legSwingL: 0.75 * s, legSwingR: -0.75 * s,
    // the leg that is swinging forward (recovering) tucks its knee
    kneeL: 0.25 + 1.15 * Math.max(0, c), kneeR: 0.25 + 1.15 * Math.max(0, -c),
    armSwingL: -0.75 * s, armSwingR: 0.75 * s,
    armOutL: 0.12, armOutR: 0.12,
    elbowL: 1.35, elbowR: 1.35,
    lean: 0.22,
    twist: 0.14 * s,
    headYaw: -0.1 * s,
    headPitch: -0.12,
    bob: 0.05 * Math.abs(s),
  });
}

function risePose() {
  return makePose({
    legSwingL: 0.65, kneeL: 1.35, legSwingR: -0.3, kneeR: 0.55,
    armSwingL: -0.5, armOutL: 0.35, elbowL: 0.5,
    armSwingR: 2.6, armOutR: 0.3, elbowR: 0.3,
    lean: 0.08, headPitch: -0.15,
  });
}

function fallPose(t) {
  const flail = Math.sin(t * 13);
  return makePose({
    legSwingL: 0.3 + 0.15 * flail, kneeL: 0.6, legSwingR: -0.15 - 0.15 * flail, kneeR: 0.45,
    armSwingL: 0.4 + 0.25 * flail, armOutL: 1.35, elbowL: 0.5,
    armSwingR: 0.4 - 0.25 * flail, armOutR: 1.35, elbowR: 0.5,
    lean: -0.06, headPitch: 0.15,
  });
}

/** Air dash: streamlined, arms swept back, legs trailing. */
function dashPose() {
  return makePose({
    legSwingL: -0.7, kneeL: 0.9, legSwingR: -0.35, kneeR: 0.5,
    armSwingL: -1.3, armSwingR: -1.3, armOutL: 0.35, armOutR: 0.35, elbowL: 0.2, elbowR: 0.2,
    lean: 0.75, headPitch: -0.35,
  });
}

/** Ground pound: tucked cannonball, arms up. */
function poundPose() {
  return makePose({
    legSwingL: 1.3, kneeL: 2.1, legSwingR: 1.3, kneeR: 2.1,
    armSwingL: 2.5, armSwingR: 2.5, armOutL: 0.5, armOutR: 0.5, elbowL: 0.4, elbowR: 0.4,
    lean: 0.35, headPitch: 0.2,
  });
}

// ---------------------------------------------------------------------------
// Shadow helper
// ---------------------------------------------------------------------------
/**
 * Blob shadow projected straight down onto the highest surface under the
 * player. Returns an array of rectangles (possibly empty), each clipped to a
 * platform's top face — a shadow straddling several tiles at the same height
 * is split across them.
 */
export function computeShadow(level, player, baseSize = 0.5) {
  const EPS = 0.001;
  const below = level.platforms
    .map(p => ({ p, top: p.y + p.height / 2 }))
    .filter(({ top }) => top <= player.y + 0.01);
  const overlaps = ({ p }, margin) =>
    Math.abs(player.x - p.x) <= p.width / 2 + margin && Math.abs(player.z - p.z) <= p.depth / 2 + margin;
  // Prefer the surface directly under the centre; otherwise anything the blob touches.
  const pick = list => list.reduce((best, c) => (!best || c.top > best.top ? c : best), null);
  const hit = pick(below.filter(c => overlaps(c, 0))) || pick(below.filter(c => overlaps(c, baseSize)));
  if (!hit) return [];
  const height = player.y - hit.top;
  if (height > 14) return [];
  const r = baseSize * clamp(1 - height / 9, 0.35, 1);
  const alpha = 0.38 * clamp(1 - height / 12, 0.25, 1);
  const pieces = [];
  // two stacked layers (full blob + smaller core) give a soft falloff
  for (const [radius, layerAlpha, lift] of [[r, alpha * 0.62, 0.004], [r * 0.62, alpha * 0.6, 0.006]]) {
    for (const { p, top } of below) {
      if (Math.abs(top - hit.top) > EPS) continue;
      const x0 = Math.max(player.x - radius, p.x - p.width / 2), x1 = Math.min(player.x + radius, p.x + p.width / 2);
      const z0 = Math.max(player.z - radius, p.z - p.depth / 2), z1 = Math.min(player.z + radius, p.z + p.depth / 2);
      if (x1 - x0 <= EPS || z1 - z0 <= EPS) continue;
      pieces.push({ x: (x0 + x1) / 2, y: top, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0, alpha: layerAlpha, lift });
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export function createAvatar({ palette = 'classic', random = Math.random } = {}) {
  const avatar = {
    palette: typeof palette === 'string' ? AVATAR_PALETTES[palette] : palette,
    /** 'live' follows the player; 'idle' | 'run' | 'jump' | 'fall' force a preview. */
    preview: 'live',

    // public, read-only animation state (handy for HUDs / debugging)
    state: 'idle',
    yaw: 0,
    speed: 0,
    phase: 0,
    runBlend: 0,
    airBlend: 0,
    squash: 0,
    dashBlend: 0,
    poundBlend: 0,

    // internals
    _time: 0,
    _prev: null,
    _prevGrounded: true,
    _airVy: 0,
    _yawVel: 0,
    _bank: 0,
    _squashVel: 0,
    _spawnT: 1,
    _blinkTimer: 2,
    _blink: 0,
    _idleTime: 0,
    _lookAround: 0,
    _mirrorAir: false,
    vy: 0,
    grounded: true,

    setPalette(p) {
      this.palette = typeof p === 'string' ? AVATAR_PALETTES[p] : p;
    },

    /** Snap to the player (no interpolation) and play the spawn pop-in. */
    reset(player, { pop = true } = {}) {
      this._prev = player ? { x: player.x, y: player.y, z: player.z } : null;
      this._prevGrounded = player ? player.grounded : true;
      this.yaw = 0;
      this._yawVel = 0;
      this._bank = 0;
      this.speed = 0;
      this.runBlend = 0;
      this.airBlend = 0;
      this.squash = 0;
      this._squashVel = 0;
      this._spawnT = pop ? 0 : 1;
      this._idleTime = 0;
      this._lookAround = 0;
      this.state = 'idle';
    },

    /** Advance animation by one (fixed) step. Returns a list of visual events. */
    update(player, dt) {
      const events = [];
      this._time += dt;
      if (!this._prev) this.reset(player, { pop: false });

      // --- Measure motion ---------------------------------------------------
      let dx = player.x - this._prev.x;
      let dz = player.z - this._prev.z;
      const dy = player.y - this._prev.y;
      if (Math.hypot(dx, dy, dz) > 2) { // teleport (respawn / level change)
        this.reset(player);
        dx = dz = 0;
      }
      this._prev = { x: player.x, y: player.y, z: player.z };
      let speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      let vy = player.vy;
      let grounded = player.grounded;

      // --- Preview overrides (for the playground) ----------------------------
      if (this.preview === 'run') { speed = PLAYER.speed; grounded = true; vy = 0; }
      else if (this.preview === 'idle') { speed = 0; grounded = true; vy = 0; }
      else if (this.preview === 'jump') { speed = 0; grounded = false; vy = 4; }
      else if (this.preview === 'fall') { speed = 0; grounded = false; vy = -8; }
      this.speed = speed;
      this.vy = vy;
      this.grounded = grounded;

      // --- Facing -----------------------------------------------------------
      this.dashBlend = approach(this.dashBlend, player.dash > 0 ? 1 : 0, 30, dt);
      this.poundBlend = approach(this.poundBlend, player.pound ? 1 : 0, 25, dt);
      if (this.preview === 'live' && speed > 0.5 && !(player.push > 0)) {
        const target = Math.atan2(dx, dz);
        const before = this.yaw;
        this.yaw = wrapAngle(this.yaw + wrapAngle(target - this.yaw) * (1 - Math.exp(-16 * dt)));
        this._yawVel = dt > 0 ? wrapAngle(this.yaw - before) / dt : 0;
      } else {
        this._yawVel = approach(this._yawVel, 0, 10, dt);
      }

      // --- Locomotion blend weights ---------------------------------------
      this.runBlend = approach(this.runBlend, clamp(speed / PLAYER.speed, 0, 1), 12, dt);
      this.airBlend = approach(this.airBlend, grounded ? 0 : 1, grounded ? 22 : 14, dt);
      const previousPhase = this.phase;
      this.phase += (speed * dt / STRIDE_LENGTH) * Math.PI * 2;
      if (grounded && this.runBlend > 0.5 &&
          Math.floor(previousPhase / Math.PI) !== Math.floor(this.phase / Math.PI)) {
        const side = Math.floor(this.phase / Math.PI) % 2 === 0 ? 1 : -1;
        const ox = Math.cos(this.yaw) * D.hipSpacing * side;
        const oz = -Math.sin(this.yaw) * D.hipSpacing * side;
        events.push({ type: 'step', x: player.x + ox, y: player.y, z: player.z + oz });
      }
      this._bank = approach(this._bank, clamp(-this._yawVel * 0.03, -0.22, 0.22) * this.runBlend, 10, dt);

      // --- Jump / land detection ----------------------------------------
      if (this.preview === 'live') {
        if (this._prevGrounded && !grounded && vy > 0.5) {
          this._squashVel += 2.4; // stretch
          this._mirrorAir = Math.sin(this.phase) < 0;
          events.push({ type: 'jump', x: player.x, y: player.y, z: player.z });
        }
        if (!grounded) this._airVy = vy;
        if (!this._prevGrounded && grounded) {
          const impact = Math.max(0, -this._airVy);
          if (impact > 1.5) {
            this._squashVel -= Math.min(impact, 16) * 0.6;
            events.push({ type: 'land', x: player.x, y: player.y, z: player.z, impact });
          }
        }
      }
      this._prevGrounded = grounded;

      // --- Squash & stretch spring ---------------------------------------
      const k = 320, c = 16;
      this._squashVel += (-k * this.squash - c * this._squashVel) * dt;
      this.squash = clamp(this.squash + this._squashVel * dt, -0.32, 0.3);

      // --- Secondary: spawn pop, blinking, idle look-around -----------------
      this._spawnT = Math.min(1, this._spawnT + dt / 0.4);
      this._blinkTimer -= dt;
      if (this._blinkTimer <= 0) {
        this._blink = 0.14;
        this._blinkTimer = 1.8 + random() * 3.5;
      }
      this._blink = Math.max(0, this._blink - dt);
      const idle = this.runBlend < 0.1 && this.airBlend < 0.1;
      this._idleTime = idle ? this._idleTime + dt : 0;
      this._lookAround = approach(this._lookAround, this._idleTime > 2 ? 1 : 0, 2, dt);

      // --- Descriptive state --------------------------------------------
      if (!grounded) this.state = vy > 0 ? 'jump' : 'fall';
      else if (this.squash < -0.06) this.state = 'land';
      else if (speed > 0.5) this.state = 'run';
      else this.state = 'idle';

      return events;
    },

    /** Current blended pose (joint angles). */
    getPose() {
      const t = this._time;
      let pose = blendPose(idlePose(t, this._lookAround), runPose(this.phase), this.runBlend);
      if (this.airBlend > 0.001) {
        let air = blendPose(fallPose(t), risePose(), clamp(this.vy / 5 + 0.5, 0, 1));
        if (this._mirrorAir) air = mirrorPose(air);
        pose = blendPose(pose, air, this.airBlend);
      }
      if (this.dashBlend > 0.01) pose = blendPose(pose, dashPose(), this.dashBlend);
      if (this.poundBlend > 0.01) pose = blendPose(pose, poundPose(), this.poundBlend);
      // Landing crouch: while squashed, bend the knees (feet stay planted so
      // the hips sink), lean in and let the arms swing out for balance.
      const crouch = Math.max(0, -this.squash) * (1 - this.airBlend);
      if (crouch > 0) {
        pose = { ...pose };
        pose.legSwingL += crouch * 2; pose.legSwingR += crouch * 2;
        pose.kneeL += crouch * 4.5; pose.kneeR += crouch * 4.5;
        pose.lean += crouch * 1.8;
        pose.armOutL += crouch * 2.5; pose.armOutR += crouch * 2.5;
        pose.headPitch -= crouch;
      }
      return pose;
    },

    /**
     * Build world-space box parts for the renderer.
     * Each part: { matrix: Float32Array(16) (unit cube -> world), color: [r,g,b] }
     */
    getParts(player) {
      const pal = this.palette;
      const pose = this.getPose();
      const parts = [];
      const box = (parent, cx, cy, cz, sx, sy, sz, color) => {
        parts.push({ matrix: compose(parent, translation(cx, cy, cz), scaling(sx, sy, sz)), color });
      };

      // Legs are posed in a hip-local frame first so we can measure how far the
      // lowest shoe corner reaches; on the ground the hips are lowered by exactly
      // that much so a foot is always planted (no floating / sinking).
      const bank = rotationZ(this._bank);
      const groundWeight = 1 - this.airBlend;
      const legs = [];
      let lowest = 0;
      for (const [side, swing, knee] of [[1, pose.legSwingL, pose.kneeL], [-1, pose.legSwingR, pose.kneeR]]) {
        const thigh = compose(bank, translation(side * D.hipSpacing, 0, 0), rotationX(-swing));
        const shin = compose(thigh, translation(0, -D.thigh, 0), rotationX(knee));
        // ankle: partially counter-rotate so the sole tends toward flat on the ground
        const ankle = compose(shin, translation(0, -D.shin + 0.08, 0), rotationX(-(knee - swing) * 0.6 * groundWeight));
        const shoe = compose(ankle, translation(0, -0.04, 0.04), scaling(0.21, 0.08, 0.3));
        for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
          lowest = Math.min(lowest, transformPoint(shoe, [x, -0.5, z])[1]);
        }
        legs.push({ thigh, shin, shoe });
      }
      const hipY = lerp(REST_HIP_HEIGHT, -lowest, groundWeight) + pose.bob;

      const pop = easeOutBack(this._spawnT);
      const sy = (1 + this.squash * 0.7) * pop;
      const sxz = (1 - this.squash * 0.45) * pop;
      const root = compose(
        translation(player.x, player.y, player.z),
        rotationY(this.yaw),
        scaling(sxz, sy, sxz),
      );
      const pelvis = compose(root, translation(0, hipY, 0));
      const hips = compose(pelvis, bank);

      // Legs ---------------------------------------------------------------
      for (const { thigh, shin, shoe } of legs) {
        box(compose(pelvis, thigh), 0, -D.thigh / 2, 0, 0.2, D.thigh + 0.02, 0.22, pal.pants);
        box(compose(pelvis, shin), 0, -0.12, 0, 0.18, 0.24, 0.2, pal.pants);
        parts.push({ matrix: compose(pelvis, shoe), color: pal.shoes });
      }

      // Pelvis & torso -------------------------------------------------------
      box(hips, 0, 0.02, 0, 0.46, 0.14, 0.28, pal.pants);
      const torso = compose(hips, translation(0, 0.03, 0), rotationX(pose.lean), rotationY(pose.twist));
      box(torso, 0, D.torsoHeight / 2, 0, D.torsoWidth, D.torsoHeight, D.torsoDepth, pal.shirt);
      // belt
      box(torso, 0, 0.03, 0, D.torsoWidth + 0.01, 0.05, D.torsoDepth + 0.01, pal.shoes);
      // backpack (visible from the default chase camera)
      box(torso, 0, 0.24, -D.torsoDepth / 2 - 0.06, 0.36, 0.3, 0.12, pal.pack);
      box(torso, 0, 0.33, -D.torsoDepth / 2 - 0.125, 0.3, 0.06, 0.02, pal.shoes);

      // Arms -------------------------------------------------------------
      for (const [side, swing, out, elbow] of [
        [1, pose.armSwingL, pose.armOutL, pose.elbowL],
        [-1, pose.armSwingR, pose.armOutR, pose.elbowR],
      ]) {
        const upper = compose(torso, translation(side * D.shoulderX, D.shoulderY, 0), rotationZ(side * out), rotationX(-swing));
        box(upper, 0, -D.upperArm / 2 + 0.02, 0, 0.15, D.upperArm + 0.04, 0.16, pal.shirt);
        const fore = compose(upper, translation(0, -D.upperArm, 0), rotationX(-elbow));
        box(fore, 0, -D.forearm / 2 + 0.01, 0, 0.13, D.forearm, 0.14, pal.skin);
      }

      // Head ---------------------------------------------------------------
      const head = compose(torso, translation(0, D.torsoHeight + D.neckGap, 0),
        rotationY(pose.headYaw - pose.twist * 0.8), rotationX(pose.headPitch));
      const h = D.head;
      box(head, 0, h / 2, 0, h, h, h, pal.skin);
      // cap: crown + forward brim (makes the facing direction readable)
      box(head, 0, h * 0.82, -0.005, h + 0.03, h * 0.38, h + 0.03, pal.cap);
      box(head, 0, h * 0.68, h / 2 + 0.08, h * 0.9, 0.04, 0.18, pal.cap);
      // eyes (blink by squashing vertically)
      const eyeH = this._blink > 0 ? 0.015 : 0.1;
      for (const side of [1, -1]) {
        box(head, side * 0.09, h * 0.46, h / 2 + 0.006, 0.07, eyeH, 0.02, pal.eyes);
      }
      // mouth
      box(head, 0, h * 0.2, h / 2 + 0.006, 0.1, 0.025, 0.02, pal.eyes);
      // ears
      for (const side of [1, -1]) {
        box(head, side * (h / 2 + 0.02), h * 0.45, -0.02, 0.05, 0.1, 0.08, pal.skin);
      }

      return parts;
    },

    /** World position of a named anchor (used for effects / tests). */
    getFootPositions(player) {
      const parts = this.getParts(player);
      // shoes are parts index 2 and 5 (see leg loop above)
      return [parts[2], parts[5]].map(part => transformPoint(part.matrix, [0, -0.5, 0]));
    },
  };
  return avatar;
}

/**
 * Turn avatar events into particle effects (dust puffs).
 * Accepts the particle system as a parameter to keep this module dependency-free.
 */
export function emitAvatarEffects(events, particles) {
  for (const e of events) {
    if (e.type === 'land') {
      const strength = clamp(e.impact / 10, 0.4, 1.6);
      particles.emit(e.x, e.y + 0.05, e.z, { count: Math.round(8 * strength), speed: 1.6 * strength, color: [0.93, 0.9, 0.82], lifetime: 0.45 });
    } else if (e.type === 'jump') {
      particles.emit(e.x, e.y + 0.05, e.z, { count: 6, speed: 1.2, color: [0.93, 0.9, 0.82], lifetime: 0.35 });
    } else if (e.type === 'step') {
      particles.emit(e.x, e.y + 0.04, e.z, { count: 2, speed: 0.8, color: [0.9, 0.87, 0.78], lifetime: 0.3 });
    }
  }
}
