/** Camera conventions shared by the renderer and (DOM-free) quality checks. */

export const FOV = Math.PI / 3;

/** The default chase camera used by the game. */
export function chaseCamera(player) {
  const cameraX = player.x * 0.5;
  return {
    eye: [cameraX, player.y + 7, player.z - 12],
    target: [cameraX, player.y + 1, player.z + 5],
  };
}
