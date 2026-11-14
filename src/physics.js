export const PLAYER = { halfWidth: 0.4, height: 1.5, speed: 5, jumpSpeed: 8 };
const GRAVITY = 20;

export function createPlayer(spawn) {
  return { ...spawn, vy: 0, grounded: false };
}

function overlapsHorizontal(player, platform) {
  return Math.abs(player.x - platform.x) < PLAYER.halfWidth + platform.width / 2 &&
    Math.abs(player.z - platform.z) < PLAYER.halfWidth + platform.depth / 2;
}

function moveAxis(player, platforms, axis, distance) {
  player[axis] += distance;
  for (const platform of platforms) {
    const bottom = platform.y - platform.height / 2;
    const top = platform.y + platform.height / 2;
    if (player.y < top && player.y + PLAYER.height > bottom && overlapsHorizontal(player, platform)) {
      const extent = (axis === 'x' ? platform.width : platform.depth) / 2 + PLAYER.halfWidth;
      if (distance > 0) player[axis] = platform[axis] - extent;
      if (distance < 0) player[axis] = platform[axis] + extent;
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
  }
  moveAxis(player, level.platforms, 'x', dx * PLAYER.speed * dt);
  moveAxis(player, level.platforms, 'z', dz * PLAYER.speed * dt);

  if (input.jump && player.grounded) {
    player.vy = PLAYER.jumpSpeed;
    player.grounded = false;
  }
  const previousY = player.y;
  player.vy -= GRAVITY * dt;
  player.y += player.vy * dt;
  player.grounded = false;
  for (const platform of level.platforms) {
    if (!overlapsHorizontal(player, platform)) continue;
    const top = platform.y + platform.height / 2;
    const bottom = platform.y - platform.height / 2;
    if (player.vy <= 0 && previousY >= top && player.y <= top) {
      player.y = top;
      player.vy = 0;
      player.grounded = true;
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
