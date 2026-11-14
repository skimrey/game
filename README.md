# 3D Platformer

A robust, dependency-free browser-based 3D platformer with WebGL rendering, multiple levels, physics-based gameplay, and extensible architecture for adding features like audio, particles, and advanced input handling.

## Features

- **WebGL Rendering**: Smooth 3D graphics with a following camera system
- **Physics Engine**: Gravity, jumping, collision detection, and fall detection
- **Multiple Levels**: 12 levels (6 hand-made + 6 generated), all proven completable by the level audit
- **Input Management**: Support for WASD/Arrow keys and gamepad input
- **Particle System**: Visual effects for game events
- **Audio Manager**: Framework for sound effects and music (no dependencies)
- **Game State**: Persistent player statistics and settings via localStorage
- **Performance Monitoring**: Built-in FPS and timing metrics
- **Level Builder**: Fluent API for creating new levels
- **Debug Tools**: Optional performance stats and collision visualization

## Quick Start

### Run the Game (recommended: live reload)

```sh
npm run dev                                   # play: normal resolution/quality, opens the game
npm run dev:test                              # testing mode: low resolution, ≥ 30 fps, opens the playground
node scripts/dev-server.mjs --open index.html --quality test   # any page, any preset
```

Rendering presets (URL `?quality=…`, see `src/quality.js` and `perf/README.md`):

| Preset | For | Settings |
|---|---|---|
| `normal` (default) | playing on a machine with a GPU | full resolution (up to 2× HiDPI), MSAA, full sky, all scenery, trilinear + anisotropic textures |
| `test` | testing on machines without a GPU (e.g. the VM) | 55% resolution with **adaptive quality** (resolution 35–80%, then sheds sky/scenery detail if needed; holds 30 fps), no MSAA, lite sky, near scenery, cheaper filtering, FPS badge |

Single settings can be overridden in the URL, e.g. `?quality=test&resolution=0.7&sky=full`.
On machines without a GPU the dev server launches Chrome with `--disable-gpu-compositing`
(force with `--software` / `--gpu`) — this alone more than halves Chrome's per-frame cost.
`npm run bench` re-measures everything in a visible Chrome window and rewrites `perf/README.md`.

The dev server reloads open pages on every file edit and reopens Chrome on the next edit if the
window was closed. Chrome is found via `CHROME_PATH`, standard install locations or Playwright's
Chromium (no dependencies).

Or start a plain static server:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000> in a WebGL-capable browser.

### Controls

- **Move**: WASD or Arrow Keys
- **Jump**: Space
- **Air dash**: Shift or J (in the air, once per jump — refreshed by landing or stomping)
- **Ground pound**: Q or K (in the air — slam down; the landing shockwave defeats nearby enemies)
- **Restart Level**: R

### Gamepad Support

The game detects and supports standard gamepads:
- **Left Stick**: Movement
- **Button 0 (A/Cross)**: Jump
- **Button 2 (X/Square)**: Air dash
- **Button 1 (B/Circle)**: Ground pound

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
├── avatar.js            # Player avatar: model, procedural animation, shadow
├── levelAudit.js        # Completability proof (bot in real physics) + quality rules
├── levelGenerator.js    # Seeded, pattern-based level generator with audit gate
├── levelLab.js          # Level Lab page (levels.html)
├── biomes.js            # Per-tier environments: sky, fog, light, materials, scenery kit
├── materials.js         # Material → texture mapping (+ swatches for colour checks)
├── textures.js          # Procedural canvas textures (browser)
├── scenery.js           # Decoration kits, safe placement and the scenery audit
├── visualAudit.js       # Readability / unique-background checks (CIE ΔE)
├── environment.js       # Resolves tier → biome → scenery for a level (cached)
├── camera.js            # Chase camera shared by renderer and checks
├── quality.js           # Rendering presets (normal / test) + URL overrides
├── fpsMeter.js          # FPS badge + benchmark recorder
├── controls.js          # Keyboard/gamepad with edge-triggered jump/dash/pound
├── session.js           # Game rules: health, enemies, stomps, dash hits, shockwave, checkpoints
├── enemies.js           # Crawler / spiker / wisp: deterministic motion + looks
├── encounterAudit.js    # Enemy placement rules + combat bot fairness check
├── effects.js           # Particle effects for gameplay events
├── hud.js               # Hearts + dash indicator
├── mat4.js              # Column-major 4x4 matrix helpers
├── playground.js        # Avatar playground sandbox (playground.html)
```

## Player Avatar & Playground

The player is drawn as a jointed, box-built character (`src/avatar.js`) instead of a plain box.
It is purely visual — the physics body is unchanged — and is fully procedurally animated:

- **Idle**: breathing, arm sway, blinking, looks around after standing still
- **Run**: distance-driven stride with knees/elbows, torso twist, forward lean, banking into turns;
  feet are auto-planted on the ground (no sliding/sinking)
- **Air**: separate rising (tucked) and falling (arms out) poses blended by vertical velocity
- **Jump / land**: squash & stretch spring + landing crouch scaled by impact speed
- **Respawn**: pop-in with overshoot
- Smooth turning toward the movement direction, blob drop shadow, dust puffs on steps/jumps/landings

### Playground

Open <http://localhost:8000/playground.html> to evaluate the avatar in a sandbox arena
(stairs + high ledge, wall, hurdle, head-bonk block, pit and island). The side panel offers:

- live animation state readout (state, speed, vy, facing, blend weights, squash)
- forced animation previews (idle / run / rise / fall) played in place
- game camera or orbit camera (drag to rotate, wheel to zoom, *Face avatar* / *Side view* presets)
- slow motion, pause (P) and frame step (N)
- outfit presets, physics hitbox overlay (H), shadow/dust toggles, and a legacy red-box comparison


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