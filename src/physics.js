export const PLAYER = { halfWidth: 0.4, height: 1.5, speed: 5, jumpSpeed: 8 };
const GRAVITY = 20;

/**
 * Traversal abilities (all optional inputs; without them the physics is unchanged):
 *   dash    — mid-air dash: a short horizontal burst in the held direction (or the
 *             facing direction), gravity paused while dashing; once per air time
 *   pound   — ground pound: slam straight down; landing sends out a shockwave
 *   glide   — hold jump while falling: you sink slowly (GLIDE_FALL) — long gaps on the way down
 *   double  — press jump again in mid-air: a second, slightly weaker jump; once per air time
 * and a terrain feature:
 *   spring  — a platform with `spring: true` is a bounce pad: landing on it launches you
 *             high (SPRING_SPEED), refreshing the dash and the double jump
 *
 * Which abilities a level allows is `level.abilities` (a list of 'dash' | 'glide' | 'double';
 * levels without the field allow the dash only) — each region teaches a new one, and the
 * level audit plans routes with exactly the moves the level allows.
 */
export const ABILITIES = { dashSpeed: 14, dashTime: 0.15, poundSpeed: 24, glideFall: 2.2, doubleSpeed: 7.5, springSpeed: 13 };
export const DEFAULT_ABILITIES = ['dash'];
export const abilitiesOf = level => level?.abilities || DEFAULT_ABILITIES;
const allows = (level, ability) => abilitiesOf(level).includes(ability);

export function createPlayer(spawn) {
  return {
    ...spawn, vy: 0, grounded: false,
    facingX: 0, facingZ: 1,
    canDash: true, dash: 0, dashX: 0, dashZ: 0,
    canDouble: true, doubled: false, gliding: false, sprung: null,
    pound: false, landedPound: false,
    push: 0, pushX: 0, pushZ: 0,
  };
}

/** Knock the player back horizontally (vx, vz units/s) for `time` seconds. */
export function pushPlayer(player, vx, vz, time) {
  player.push = time;
  player.pushX = vx;
  player.pushZ = vz;
  player.dash = 0;
}

function overlapsHorizontal(player, platform) {
  return Math.abs(player.x - platform.x) < PLAYER.halfWidth + platform.width / 2 &&
    Math.abs(player.z - platform.z) < PLAYER.halfWidth + platform.depth / 2;
}

const CONTACT_EPSILON = 1e-9;

function moveAxis(player, platforms, axis, distance) {
  const start = player[axis];
  player[axis] += distance;
  for (const platform of platforms) {
    const bottom = platform.y - platform.height / 2;
    const top = platform.y + platform.height / 2;
    if (player.y < top && player.y + PLAYER.height > bottom && overlapsHorizontal(player, platform)) {
      const extent = (axis === 'x' ? platform.width : platform.depth) / 2 + PLAYER.halfWidth;
      // Only push back if this move actually crossed the face on this axis.
      // Otherwise an overlap caused by floating-point error on the *other*
      // axis (e.g. resting exactly against a wall) would snap the player to
      // the far side of the platform — a several-unit teleport.
      if (distance > 0 && start <= platform[axis] - extent + CONTACT_EPSILON) player[axis] = platform[axis] - extent;
      if (distance < 0 && start >= platform[axis] + extent - CONTACT_EPSILON) player[axis] = platform[axis] + extent;
    }
  }
}

export function stepPlayer(player, level, input, dt) {
  let dx = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  let dz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const length = Math.hypot(dx, dz);
  if (length) {
    dx /= length;
    dz /= length;
    player.facingX = dx;
    player.facingZ = dz;
  }
  player.landedPound = false;
  player.doubled = false;
  player.sprung = null;

  // Abilities (air only)
  if (input.dash && !player.grounded && player.canDash && !player.pound && allows(level, 'dash')) {
    player.canDash = false;
    player.dash = ABILITIES.dashTime;
    player.dashX = length ? dx : player.facingX;
    player.dashZ = length ? dz : player.facingZ;
    player.vy = 0;
  }
  if (input.pound && !player.grounded && !player.pound) {
    player.pound = true;
    player.dash = 0;
    player.vy = -ABILITIES.poundSpeed;
  }

  // Horizontal movement: knockback > dash > ground pound (none) > walking
  let mx = dx * PLAYER.speed, mz = dz * PLAYER.speed;
  if (player.push > 0) {
    mx = player.pushX; mz = player.pushZ;
    player.push = Math.max(0, player.push - dt);
  } else if (player.dash > 0) {
    mx = player.dashX * ABILITIES.dashSpeed; mz = player.dashZ * ABILITIES.dashSpeed;
  } else if (player.pound) {
    mx = 0; mz = 0;
  }
  moveAxis(player, level.platforms, 'x', mx * dt);
  moveAxis(player, level.platforms, 'z', mz * dt);

  if (input.jump && player.grounded) {
    player.vy = PLAYER.jumpSpeed;
    player.grounded = false;
  } else if (input.jump && !player.grounded && player.canDouble && !player.pound && player.dash <= 0 && allows(level, 'double')) {
    player.vy = ABILITIES.doubleSpeed;        // the double jump
    player.canDouble = false;
    player.doubled = true;
  }
  const previousY = player.y;
  player.gliding = false;
  if (player.dash > 0) {
    player.dash -= dt; // gravity paused while dashing
    if (player.dash < 1e-9) player.dash = 0;
  } else {
    player.vy -= GRAVITY * dt;
    if (input.glide && player.vy < -ABILITIES.glideFall && !player.pound && allows(level, 'glide')) {
      player.vy = -ABILITIES.glideFall;       // gliding: sink slowly
      player.gliding = true;
    }
    player.y += player.vy * dt;
  }
  player.grounded = false;
  for (const platform of level.platforms) {
    if (!overlapsHorizontal(player, platform)) continue;
    const top = platform.y + platform.height / 2;
    const bottom = platform.y - platform.height / 2;
    if (player.vy <= 0 && previousY >= top && player.y <= top) {
      player.y = top;
      player.vy = 0;
      player.grounded = true;
      player.canDash = true;
      player.canDouble = true;
      if (player.pound) { player.pound = false; player.landedPound = true; }
      if (platform.spring) {                   // a bounce pad: up you go
        player.vy = ABILITIES.springSpeed;
        player.grounded = false;
        player.sprung = platform;
        player.gliding = false;
        break;
      }
    } else if (player.vy > 0 && previousY + PLAYER.height <= bottom &&
               player.y + PLAYER.height >= bottom) {
      player.y = bottom - PLAYER.height;
      player.vy = 0;
    }
  }
  if (player.y < -12) {
    Object.assign(player, createPlayer(level.spawn));
    return 'respawn';
  }
  const goal = level.goal;
  if (player.grounded && Math.abs(player.y - goal.y) < 0.05 &&
      Math.hypot(player.x - goal.x, player.z - goal.z) < goal.radius) {
    return 'goal';
  }
  return 'playing';
}
