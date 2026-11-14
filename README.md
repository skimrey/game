# 3D Platformer

A robust, dependency-free browser-based 3D platformer with WebGL rendering, multiple levels, physics-based gameplay, and extensible architecture for adding features like audio, particles, and advanced input handling.

## Features

- **WebGL Rendering**: Smooth 3D graphics with a following camera system
- **Physics Engine**: Gravity, jumping, collision detection, and fall detection
- **Multiple Levels**: 6 progressively challenging levels with varied platform layouts
- **Input Management**: Support for WASD/Arrow keys and gamepad input
- **Particle System**: Visual effects for game events
- **Audio Manager**: Framework for sound effects and music (no dependencies)
- **Game State**: Persistent player statistics and settings via localStorage
- **Performance Monitoring**: Built-in FPS and timing metrics
- **Level Builder**: Fluent API for creating new levels
- **Debug Tools**: Optional performance stats and collision visualization

## Quick Start

### Run the Game

From the project directory, start a static server:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a WebGL-capable browser.

### Controls

- **Move**: WASD or Arrow Keys
- **Jump**: Space
- **Restart Level**: R
- **Pause**: P (framework ready, not implemented in base game)

### Gamepad Support

The game detects and supports standard gamepads:
- **Left Stick**: Movement
- **Button 0 (A/Cross)**: Jump

## Project Structure

```
src/
├── main.js              # Game loop, input handling, level progression
├── physics.js           # Player movement, collision, gravity
├── renderer.js          # WebGL rendering and camera system
├── levels.js            # Level definitions using LevelBuilder
├── config.js            # Global configuration constants
├── input.js             # Input manager for keyboard and gamepad
├── audio.js             # Audio manager for sounds and music
├── particles.js         # Particle system for visual effects
├── state.js             # Game state and persistent data
├── levelBuilder.js      # Level creation utilities and validation
├── math.js              # 3D math utilities and helpers
├── performance.js       # Performance monitoring tools
```

## Architecture

### Core Systems

**Physics System** (`physics.js`)
- Handles player movement with acceleration
- Gravity and jumping mechanics
- Box-based collision detection
- Platform-based grounding detection
- Fall/respawn logic

**Renderer** (`renderer.js`)
- WebGL-based 3D graphics
- Box-shaped geometry (platforms, player, goal)
- Following camera with smooth positioning
- Lighting simulation via vertex shading
- Responsive canvas scaling

**Input Manager** (`input.js`)
- Unified keyboard and gamepad handling
- Configurable control schemes
- Deadzone support for gamepads
- Input state tracking

**Game State** (`state.js`)
- Level completion tracking
- Time tracking per level
- Death counter
- Settings persistence via localStorage
- Best time recording

**Level System** (`levels.js`, `levelBuilder.js`)
- Fluent API for defining levels
- Platform placement and sizing
- Spawn and goal positioning
- Level validation utilities
- Helper methods for common patterns (staircases, rows)

### Supporting Systems

- **Audio Manager**: Sound loading and playback framework
- **Particle System**: Emission and lifecycle management
- **Performance Monitor**: Frame rate and timing statistics
- **Math Utilities**: Vector operations, interpolation, geometry checks
- **Config**: Centralized game constants and tuning parameters

## Level Design Guide

### Creating a New Level

Use the `LevelBuilder` fluent API in `src/levels.js`:

```javascript
import { createLevel } from './levelBuilder.js';

export const levels = [
  createLevel('My Level')
    .setSpawn(0, 1, 0)                    // Player start position
    .addPlatform(0, 0, 0, 6, 1, 6)       // x, y, z, width, height, depth
    .addPlatform(0, 0.5, 6, 4, 1, 3)
    .addStaircase(0, 1, 10, 5, 2, 0.5, 2) // Helper for stairs
    .addPlatformRow(-5, 0, 0, 4, 3, 2, 1, 2) // Helper for rows
    .setGoal(0, 3, 20, 1)                // Goal x, y, z, radius
    .build(),
];
```

### Coordinate System

- **X-axis**: Left (-) to Right (+)
- **Y-axis**: Down (-) to Up (+) — vertical
- **Z-axis**: Back (-) to Forward (+)

### Platform Positioning

- Platform positions define their **centers**
- `width`: X-axis extent
- `depth`: Z-axis extent (forward/back)
- `height`: Y-axis extent
- Platform top surface is at `y + height / 2`

### Spawn and Goal

- **Spawn Y**: Player's feet position (should be above a platform)
- **Goal Y**: Top surface of the goal platform
- Place spawn and goal on or above platforms for proper functionality

## Configuration

Edit `src/config.js` to adjust game parameters:

```javascript
PLAYER_SPEED: 5              // Movement speed
PLAYER_JUMP_SPEED: 8         // Jump velocity
GRAVITY: 20                  // Gravity acceleration
CAMERA_FOV: Math.PI / 3      // Field of view
CLEAR_COLOR: [0.57, 0.79, 0.91, 1]  // Sky color
```

## Adding Features

### Add Particle Effects

```javascript
import { particleSystem } from './particles.js';

// Emit particles
particleSystem.emit(x, y, z, {
  count: 10,
  speed: 5,
  color: [1, 0.83, 0.15],
  lifetime: 1
});

// Update in game loop
particleSystem.update(dt);
```

### Add Sound Effects

```javascript
import { audioManager } from './audio.js';

// Load a sound
audioManager.loadSound('jump', './sounds/jump.mp3');

// Play it
audioManager.play('jump', { volume: 0.7 });
```

### Extend Game State

```javascript
import { gameState } from './state.js';

// Track custom stat
gameState.stats.customValue = 0;
gameState.saveToLocalStorage();

// Retrieve setting
const quality = gameState.getSetting('graphicsQuality');
```

## Testing

Run the test suite:

```sh
npm test
```

Tests are in `test/physics.test.js` and validate physics behavior, collision detection, and player movement.

## Performance Monitoring

Enable performance stats in `src/config.js`:

```javascript
SHOW_PERFORMANCE_STATS: true
```

The `performanceMonitor` tracks:
- Frame rate (FPS)
- Frame time
- Update time
- Render time

Access via:
```javascript
import { performanceMonitor } from './performance.js';
console.log(performanceMonitor.toString());
```

## Browser Compatibility

- Requires WebGL support (modern browsers: Chrome, Firefox, Safari, Edge)
- No external dependencies
- Works with ES6 modules

## Extending the Game

### Add a New Level Type

Modify `levelBuilder.js` to add helper methods:

```javascript
addChallengePattern(x, y, z) {
  // Custom pattern
  return this;
}
```

### Add a New Game Feature

Create a new module in `src/` following the established patterns:
1. Export a class or singleton instance
2. Provide simple public API
3. Handle initialization and cleanup
4. Integrate in `main.js` game loop

### Add Custom Rendering

Extend `renderer.js`:
- Use the existing WebGL context
- Add new geometry types beyond boxes
- Implement new shaders for effects

## License

MIT

## Development Notes

- All modules are dependency-free and framework-agnostic
- Game loop runs at 120 FPS with fixed timestep physics
- Camera smoothly follows player with offset
- Collision detection uses box-box intersection with simplified shapes
- Platform heights and spawn positions must be carefully designed