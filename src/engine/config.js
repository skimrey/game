/**
 * Configuration
 * Global game configuration and constants
 */

export const Config = {
  // Game
  GAME_NAME: '3D Platformer',
  GAME_VERSION: '1.0.0',

  // Physics
  GRAVITY: 20,
  PLAYER_WIDTH: 0.4,
  PLAYER_HEIGHT: 1.5,
  PLAYER_SPEED: 5,
  PLAYER_JUMP_SPEED: 8,
  PLAYER_FALL_THRESHOLD: -12,

  // Camera
  CAMERA_FOV: Math.PI / 3,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 100,
  CAMERA_HEIGHT_OFFSET: 7,
  CAMERA_DISTANCE_OFFSET: -12,
  CAMERA_FORWARD_OFFSET: 5,

  // Rendering
  CLEAR_COLOR: [0.57, 0.79, 0.91, 1], // Sky blue
  ANTIALIAS: true,
  TARGET_FPS: 120,
  MAX_DELTA_TIME: 0.1,

  // Level
  GOAL_REACH_DISTANCE: 0.05,
  GOAL_RADIUS: 1,

  // Colors
  COLORS: {
    PLATFORM: [0.35, 0.65, 0.35], // Green
    GOAL: [1, 0.83, 0.15],         // Gold
    PLAYER: [0.9, 0.3, 0.25],      // Red-brown
  },

  // Input
  DEFAULT_CONTROL_SCHEME: 'wasd',
  GAMEPAD_DEADZONE: 0.15,

  // Accessibility
  ENABLE_COLORBLIND_MODE: false,
  SCREEN_READER_ENABLED: false,

  // Debug
  DEBUG_MODE: false,
  SHOW_COLLISION_BOXES: false,
  SHOW_PERFORMANCE_STATS: false,
};

export default Config;
